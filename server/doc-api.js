























import express from 'express';
import { authorizeOps, sendEntitlementError } from './entitlements.js';
import sharp from 'sharp';
import {
  parsePsdDocument, serializePsdDocument, summarizeDocument,
  decodeLayerPixels, decodeComposite, setLayerName,
} from '../core/psd-document.js';
import { lintPsd } from '../core/psd-lint.js';
import { heavy } from './auth.js';
import { editRouter } from './edit-api.js';

const DEV = process.env.PSD_EDITOR_DEV === '1';
const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;
const TIMEOUT_MS = +process.env.PSD_EDITOR_DOC_TIMEOUT_MS || 20000;
const MAX_OPS = +process.env.PSD_EDITOR_DOC_MAX_OPS || 512;
const TEXT_LIMIT = 1024;             


const BLEND_KEYS = new Set([
  'pass', 'norm', 'diss', 'dark', 'mul ', 'idiv', 'lbrn', 'dkCl',
  'lite', 'scrn', 'div ', 'lddg', 'lgCl', 'over', 'sLit', 'hLit',
  'vLit', 'lLit', 'pLit', 'hMix', 'diff', 'smud', 'fsub', 'fdiv',
  'hue ', 'sat ', 'colr', 'lum ',
]);



const ADJUSTMENT_KEYS = {
  brit: '亮度/对比度', levl: '色阶', curv: '曲线', expA: '曝光度', vibA: '自然饱和度',
  'hue ': '色相/饱和度', hue2: '色相/饱和度', blnc: '色彩平衡', blwh: '黑白',
  phfl: '照片滤镜', mixr: '通道混合器', clrL: '颜色查找', nvrt: '反相', post: '色调分离',
  thrs: '阈值', grdm: '渐变映射', selc: '可选颜色', CgEd: '亮度/对比度（新版）',
};
const FILL_KEYS = { SoCo: '纯色填充', GdFl: '渐变填充', PtFl: '图案填充' };



class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = m => new HttpError(400, m);


function checkDeadline(t0, label) {
  if (Date.now() - t0 > TIMEOUT_MS)
    throw new HttpError(504, `${label} 超过 ${TIMEOUT_MS}ms，文件过大或结构异常，已放弃`);
}

function requireFile(req) {
  const f = req.file || req.files?.psd?.[0];
  if (!f || !f.buffer || !f.buffer.length) throw bad('缺少 psd 文件字段（multipart 字段名 psd）');
  const cap = req.principal?.maxUploadMB;
  if (cap && f.buffer.length > cap * 1024 * 1024)
    throw new HttpError(413, `该 API key 的上传上限为 ${cap} MB`);
  return f;
}


function parseOr400(buf) {
  try {
    return parsePsdDocument(buf);
  } catch (e) {
    throw bad('PSD 解析失败：' + (e && e.message ? e.message : e));
  }
}


function pureJson(v, depth = 0) {
  if (depth > 14) return null;
  if (v == null) return v;
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return { bytes: v.byteLength };
  if (typeof v === 'function') return undefined;
  if (Array.isArray(v)) return v.map(x => pureJson(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) { const r = pureJson(v[k], depth + 1); if (r !== undefined) o[k] = r; }
    return o;
  }
  return v;
}


function refineNode(n) {
  const keys = n.additionalKeys || [];
  const adj = keys.find(k => ADJUSTMENT_KEYS[k]);
  const fill = keys.find(k => FILL_KEYS[k]);
  n.adjustment = adj ? { key: adj, label: ADJUSTMENT_KEYS[adj] } : null;
  n.fill = fill ? { key: fill, label: FILL_KEYS[fill] } : null;
  if (n.kind === 'raster') {
    if (adj) n.kind = 'adjustment';
    else if (fill) n.kind = 'fill';
  }
  if (typeof n.text === 'string') {
    n.textLength = n.text.length;
    if (n.text.length > TEXT_LIMIT) { n.text = n.text.slice(0, TEXT_LIMIT); n.textTruncated = true; }
  }
  if (n.children) n.children.forEach(refineNode);
  return n;
}

function buildSummary(doc) {
  const s = summarizeDocument(doc);
  s.flat.forEach(refineNode);
  s.layers.forEach(refineNode);
  s.smartObjects = s.flat.filter(l => l.isSmartObject)
    .map(l => ({ index: l.index, name: l.name, bounds: l.bounds, ...l.smartObject }));
  s.textLayers = s.flat.filter(l => l.isText)
    .map(l => ({ index: l.index, name: l.name, text: l.text, length: l.textLength ?? 0 }));
  s.imageResourceIds = s.imageResources.map(r => r.id);
  s.counts = s.flat.reduce((m, l) => { m[l.kind] = (m[l.kind] || 0) + 1; return m; }, {});
  return pureJson(s);
}


async function encodeImage(rgba, width, height, { format = 'png', quality = 92, maxSize = 0 }) {
  const raw = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  let img = sharp(raw, { raw: { width, height, channels: 4 } });
  if (maxSize && (width > maxSize || height > maxSize))
    img = img.resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
  if (format === 'jpg' || format === 'jpeg')
    return { buffer: await img.flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' };
  return { buffer: await img.png().toBuffer(), contentType: 'image/png', ext: 'png' };
}

function guardPixels(width, height, what) {
  if (!(width > 0) || !(height > 0)) throw bad(`${what} 没有像素（宽或高为 0，分组/分隔层没有自己的像素）`);
  if (width * height > MAX_PIXELS)
    throw new HttpError(413, `${what} 尺寸 ${width}×${height} 超过上限 ${MAX_PIXELS} 像素（PSD_EDITOR_DOC_MAX_PIXELS）`);
}


const asciiJson = o => JSON.stringify(o).replace(/[\u0080-\uffff]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const num = (v, dflt) => { const n = Number(v); return Number.isFinite(n) ? n : dflt; };

function readOps(req) {
  let ops = req.body?.ops;
  if (typeof ops === 'string') { try { ops = JSON.parse(ops); } catch { throw bad('ops 不是合法 JSON'); } }
  if (ops == null && typeof req.body?.patch === 'string') { try { ops = JSON.parse(req.body.patch).ops; } catch { throw bad('patch 不是合法 JSON'); } }
  if (!Array.isArray(ops)) throw bad('缺少 ops：multipart 字段 ops = JSON 数组 [{ index, name?, visible?, opacity?, clipping?, blendKey? }]');
  if (!ops.length) throw bad('ops 是空数组，没有要改的东西');
  if (ops.length > MAX_OPS) throw bad(`一次最多改 ${MAX_OPS} 个图层`);
  return ops;
}


function applyOp(doc, op, i) {
  if (!op || typeof op !== 'object') throw bad(`ops[${i}] 不是对象`);
  const idx = op.index;
  if (!Number.isInteger(idx) || idx < 0 || idx >= doc.layers.length)
    throw bad(`ops[${i}].index=${JSON.stringify(idx)} 越界（本文档 ${doc.layers.length} 个图层，下标 0…${doc.layers.length - 1}）`);
  const layer = doc.layers[idx];
  const changed = [];

  if (op.name !== undefined) {
    if (typeof op.name !== 'string' || !op.name.length) throw bad(`ops[${i}].name 必须是非空字符串`);
    if (op.name.length > 255) throw bad(`ops[${i}].name 太长（>255 字符）`);
    
    if (layer._extraRaw) throw bad(`ops[${i}]：图层 ${idx} 的附加区是原样字节（解析降级），不支持改名`);
    setLayerName(doc, idx, op.name);
    changed.push('name');
  }
  if (op.visible !== undefined) {
    if (typeof op.visible !== 'boolean') throw bad(`ops[${i}].visible 必须是布尔值`);
    const f = layer.blend.flags & 0xff;
    layer.blend.flags = op.visible ? (f & ~0x02) : (f | 0x02);
    layer.blend.visible = op.visible;
    if (layer.blend.flagsParsed) layer.blend.flagsParsed.hidden = !op.visible;
    changed.push('visible');
  }
  if (op.opacity !== undefined) {
    const v = op.opacity;
    if (!Number.isInteger(v) || v < 0 || v > 255) throw bad(`ops[${i}].opacity 必须是 0…255 的整数（255 = 不透明）`);
    layer.blend.opacity = v;
    changed.push('opacity');
  }
  if (op.clipping !== undefined) {
    if (typeof op.clipping !== 'boolean') throw bad(`ops[${i}].clipping 必须是布尔值`);
    layer.blend.clipping = op.clipping ? 1 : 0;
    changed.push('clipping');
  }
  if (op.blendKey !== undefined) {
    const k = String(op.blendKey);
    if (!BLEND_KEYS.has(k)) throw bad(`ops[${i}].blendKey="${k}" 不是合法混合模式键（4 字符，不足补空格，如 "mul "、"scrn"；pass 只对图层组有意义）`);
    layer.blend.key = k;
    changed.push('blendKey');
  }
  if (!changed.length) throw bad(`ops[${i}] 没有任何可改字段（name / visible / opacity / clipping / blendKey）`);
  return { index: idx, changed };
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}






export function docRouter({ upload }) {
  const r = express.Router();
  const psd = upload.single('psd');

  
  r.post('/inspect', psd, (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const doc = parseOr400(f.buffer);
      checkDeadline(t0, '解析');
      const summary = buildSummary(doc);
      res.set('Cache-Control', 'no-store');
      res.json({ ...summary, meta: { bytes: f.buffer.length, filename: f.originalname || null, ms: Date.now() - t0 } });
    } catch (e) { fail(res, e); }
  });

  
  r.post('/layer-preview', heavy(), psd, async (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const idx = num(req.body?.layerIndex, NaN);
      if (!Number.isInteger(idx)) throw bad('缺少 layerIndex（整数，对应 /api/doc/inspect 的 flat[].index）');
      const doc = parseOr400(f.buffer);
      checkDeadline(t0, '解析');
      if (idx < 0 || idx >= doc.layers.length)
        throw bad(`layerIndex=${idx} 越界（本文档 ${doc.layers.length} 个图层）`);
      const layer = doc.layers[idx];
      const w = Math.max(0, layer.bounds.right - layer.bounds.left);
      const h = Math.max(0, layer.bounds.bottom - layer.bounds.top);
      guardPixels(w, h, `图层 ${idx}`);

      let px;
      try { px = decodeLayerPixels(doc, f.buffer, idx); }
      catch (e) { throw bad(`图层 ${idx} 像素解码失败：${e && e.message}`); }
      checkDeadline(t0, '像素解码');
      const rgba = px.toRGBA({ applyMask: req.body?.applyMask !== '0' && req.body?.applyMask !== 'false' });
      const out = await encodeImage(rgba, px.width, px.height, {
        format: 'png', maxSize: Math.max(0, num(req.body?.maxSize, 0) | 0),
      });
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', out.contentType);
      res.set('X-Doc-Meta', asciiJson({
        index: idx, name: layer.unicodeName || layer.name, bounds: layer.bounds,
        width: px.width, height: px.height, depth: px.depth, mode: px.mode,
        warnings: (px.warnings || []).map(w2 => w2.message || String(w2)).slice(0, 20),
        ms: Date.now() - t0,
      }));
      res.set('Content-Disposition', `inline; filename="layer-${idx}.png"`);
      res.send(out.buffer);
    } catch (e) { fail(res, e); }
  });

  
  r.post('/composite', heavy(), psd, async (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const format = String(req.body?.format || 'png').toLowerCase();
      if (!['png', 'jpg', 'jpeg'].includes(format)) throw bad('format 只支持 png / jpg');
      const doc = parseOr400(f.buffer);
      checkDeadline(t0, '解析');
      guardPixels(doc.header.width, doc.header.height, '合成图');

      let img;
      try { img = decodeComposite(doc, f.buffer); }
      catch (e) { throw bad('合成图解码失败：' + (e && e.message)); }
      checkDeadline(t0, '合成图解码');
      const out = await encodeImage(img.toRGBA(), img.width, img.height, {
        format, quality: Math.min(100, Math.max(1, num(req.body?.quality, 92) | 0)),
        maxSize: Math.max(0, num(req.body?.maxSize, 0) | 0),
      });
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', out.contentType);
      res.set('X-Doc-Meta', asciiJson({
        width: img.width, height: img.height, depth: img.depth, mode: img.mode,
        modeName: doc.header.modeName, compression: img.compression,
        warnings: (img.warnings || []).slice(0, 20), ms: Date.now() - t0,
      }));
      res.set('Content-Disposition', `inline; filename="composite.${out.ext}"`);
      res.send(out.buffer);
    } catch (e) { fail(res, e); }
  });

  
  r.post('/patch', psd, (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const ops = readOps(req);
      authorizeOps(req.principal, ops.map(() => ({ op: 'setLayerProps' })));   
      const doc = parseOr400(f.buffer);
      checkDeadline(t0, '解析');

      const applied = ops.map((op, i) => applyOp(doc, op, i));

      let out;
      try { out = serializePsdDocument(doc); }
      catch (e) { throw new HttpError(422, '写回失败：' + (e && e.message)); }
      checkDeadline(t0, '写回');

      
      const lint = lintPsd(out);
      if (!lint.ok) {
        return res.status(422).json({
          error: '写回结果未通过结构体检（lintPsd），已放弃返回文件',
          lint: { ok: false, errors: lint.errors, warnings: lint.warnings, summary: lint.summary },
          applied,
        });
      }
      
      try { parsePsdDocument(out); }
      catch (e) { return res.status(422).json({ error: '写回结果无法被重新解析：' + (e && e.message), applied }); }

      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'image/vnd.adobe.photoshop');
      res.set('Content-Disposition', `attachment; filename="patched.${doc.header.psb ? 'psb' : 'psd'}"`);
      res.set('X-Doc-Meta', asciiJson({
        applied, bytes: out.length, inputBytes: f.buffer.length,
        lint: { ok: true, warnings: lint.warnings, summary: lint.summary },
        parseWarnings: doc.warnings.slice(0, 20), ms: Date.now() - t0,
      }));
      res.send(Buffer.from(out.buffer, out.byteOffset, out.byteLength));
    } catch (e) { fail(res, e); }
  });

  
  r.post('/validate', psd, (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const src = new Uint8Array(f.buffer.buffer, f.buffer.byteOffset, f.buffer.length);
      const doc = parseOr400(f.buffer);
      checkDeadline(t0, '解析');

      let out = null, roundTripError = null;
      try { out = serializePsdDocument(doc); }
      catch (e) { roundTripError = String(e && e.message || e); }
      checkDeadline(t0, '写回');

      const diff = out ? firstDiff(src, out) : 0;
      const roundTripIdentical = !!out && diff === -1;
      const lint = lintPsd(src);
      const summary = summarizeDocument(doc);

      res.set('Cache-Control', 'no-store');
      res.json({
        ok: lint.ok && roundTripIdentical && !doc.warnings.length,
        warnings: doc.warnings,
        lint: { ok: lint.ok, errors: lint.errors, warnings: lint.warnings, summary: lint.summary },
        roundTripIdentical,
        firstDiffOffset: roundTripIdentical ? -1 : diff,
        ...(roundTripError ? { roundTripError } : {}),
        document: {
          psb: doc.header.psb, width: doc.header.width, height: doc.header.height,
          depth: doc.header.depth, mode: doc.header.mode, modeName: doc.header.modeName,
          layerCount: doc.layers.length, imageResources: doc.imageResources.length,
          linkedFiles: (doc.linkedFiles || []).length,
          globalAdditionalKeys: summary.globalAdditionalKeys,
        },
        bytes: { input: src.length, serialized: out ? out.length : 0 },
        ms: Date.now() - t0,
      });
    } catch (e) { fail(res, e); }
  });

  
  r.use('/edit', editRouter({ upload }));

  
  r.use((err, _req, res, _next) => fail(res, err));
  return r;
}


function fail(res, e) {
  if (res.headersSent) return;
  if (e && e.name === 'EntitlementError') return sendEntitlementError(res, e);
  const status = e?.status || (e?.code === 'LIMIT_FILE_SIZE' ? 413
    : e?.code === 'LIMIT_UNEXPECTED_FILE' ? 400
    : e?.code && String(e.code).startsWith('LIMIT_') ? 413 : 400);
  const message = e?.code === 'LIMIT_FILE_SIZE'
    ? `上传的文件超过本服务的上限（MAX_UPLOAD_MB=${process.env.MAX_UPLOAD_MB || 200} MB）`
    : (e?.message || String(e));
  if (status >= 500) console.error('[doc-api]', e);
  res.status(status).json({ error: message, ...(DEV ? { stack: e?.stack } : {}) });
}

export default { docRouter };
