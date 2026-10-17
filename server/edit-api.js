


































import express from 'express';
import sharp from 'sharp';
import { parsePsdDocument, decodeComposite, summarizeDocument } from '../core/psd-document.js';
import { applyEdits, planEdits, listOps, EditError } from '../core/psd-edit.js';
import { parseSmartObjects, smartObjectFragment } from '../core/index.js';
import {
  applySmartObjectReplace, applyDeformFragment,
  applySmartObjectDescriptor, applySmartObjectDescriptorFragment,
  runIncrementalOps, resolveTarget, inspectTarget, guard, EditOpError,
} from './edit-ops.js';
import { fragmentChecksum } from '../core/psd-parse.js';
import { heavy } from './auth.js';
import { EXT_OPS } from './server-ops.js';
import { refreshComposite, renderLayers, encodeRaster } from './doc-render.js';
import { rerenderTextLayers, textRenderAvailable, withFonts } from './text-render.js';
import { userFaces, tempFaces, fontOwnerOf } from './user-fonts.js';
import { authorize, authorizeOps, allowed, sendEntitlementError } from './entitlements.js';

const DEV = process.env.PSD_EDITOR_DEV === '1';
const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;
const DOC_TIMEOUT_MS = +process.env.PSD_EDITOR_DOC_TIMEOUT_MS || 20000;
const TIMEOUT_MS = +process.env.PSD_EDITOR_EDIT_TIMEOUT_MS || Math.max(DOC_TIMEOUT_MS, 60000);
const MAX_OPS = +process.env.PSD_EDITOR_DOC_MAX_OPS || 512;
const JSON_LIMIT = process.env.PSD_EDITOR_EDIT_JSON_LIMIT || process.env.PSD_EDITOR_SO_JSON_LIMIT || '32mb';
const MAX_ITEMS = 64;                 



class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; if (extra) Object.assign(this, extra); }
}
const bad = (m, extra) => new HttpError(400, m, extra);










function mapOpError(e, opIndex, opName) {
  const info = { opIndex, opName };
  if (e instanceof EditError) {
    const gateStage = e.stage === 'lint' || e.stage === 'parse' || e.stage === 'roundtrip';
    return new HttpError(gateStage ? 422 : 400, e.message,
      { ...info, ...(e.opIndex !== undefined ? { opIndex: e.opIndex } : {}), stage: e.stage, offset: e.offset });
  }
  if (e instanceof EditOpError)
    return new HttpError(e.code === 'writeback' ? 422 : 400, e.message,
      { ...info, code: e.code, ...(e.need ? { need: e.need } : {}) });
  if (e instanceof HttpError) return e;
  if (/未通过结构校验/.test(e && e.message || ''))
    return new HttpError(422, e.message, { ...info, stage: 'lint' });
  return new HttpError(400, (e && e.message) || String(e), info);
}






function statusOf(e) {
  if (e?.status) return e.status;
  if (e?.code === 'LIMIT_FILE_SIZE') return 413;
  if (e?.code === 'LIMIT_UNEXPECTED_FILE') return 400;
  if (typeof e?.code === 'string' && e.code.startsWith('LIMIT_')) return 413;
  if (e instanceof EditError || e instanceof EditOpError) return mapOpError(e).status;
  return 500;
}

function fail(res, e) {
  if (res.headersSent) return;
  if (e && e.name === 'EntitlementError') return sendEntitlementError(res, e);
  const status = statusOf(e);
  const message = e?.code === 'LIMIT_FILE_SIZE'
    ? `上传的文件超过本服务的上限（MAX_UPLOAD_MB=${process.env.MAX_UPLOAD_MB || 200} MB）`
    : (e?.message || String(e));
  if (status >= 500) console.error('[edit-api]', e);
  const body = { error: message };
  for (const k of ['opIndex', 'opName', 'stage', 'code', 'offset', 'ops', 'guard', 'applied', 'need', 'fragmentId'])
    if (e && e[k] !== undefined) body[k] = e[k];
  res.status(status).json({ ...body, ...(DEV ? { stack: e?.stack } : {}) });
}



const asciiJson = o => JSON.stringify(o).replace(/[\u0080-\uffff]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const toU8 = b => b instanceof Uint8Array ? b
  : b instanceof ArrayBuffer ? new Uint8Array(b)
  : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
const toBuf = b => Buffer.isBuffer(b) ? b : Buffer.from(toU8(b));
const toAB = b => { const u = toU8(b); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); };

function checkDeadline(t0, label) {
  if (Date.now() - t0 > TIMEOUT_MS)
    throw new HttpError(504, `${label} 超过 ${TIMEOUT_MS}ms，文件过大或 ops 过重，已放弃`);
}

const clip = (s, n = 200) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);

function requirePsd(req) {
  const f = req.files?.psd?.[0];
  if (!f || !f.buffer || !f.buffer.length) throw bad('缺少 psd 文件字段（multipart 字段名 psd）');
  const cap = req.principal?.maxUploadMB;
  if (cap && f.buffer.length > cap * 1024 * 1024)
    throw new HttpError(413, `该 API key 的上传上限为 ${cap} MB`);
  return f;
}

function parseOr400(buf) {
  try { return parsePsdDocument(buf); }
  catch (e) { throw bad('PSD 解析失败：' + (e && e.message ? e.message : e)); }
}

function jsonField(req, name, dflt) {
  let v = req.body?.[name];
  if (v == null || v === '') return dflt;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { throw bad(`${name} 不是合法 JSON`); } }
  return v;
}




const SERVER_OPS = {
  replaceSmartObject: 'replaceSmartObject',
  replaceSmartObjectImage: 'replaceSmartObject',
  setSmartObjectDescriptor: 'setSmartObjectDescriptor',
};

export const EXT_OP_SET = new Set(Object.keys(EXT_OPS));

const CORE_OPS = new Set([...listOps(),
  'renameLayer', 'setVisible', 'setOpacity', 'setBlendMode', 'setClipping']);

const ALL_OPS = () => [...new Set([...CORE_OPS, ...Object.keys(SERVER_OPS), ...EXT_OP_SET])].sort().join(' ');

function classify(op, i) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) throw bad(`ops[${i}] 不是对象`);
  const name = op.op;
  if (typeof name !== 'string' || !name) throw bad(`ops[${i}] 缺少 op 字段（可用：${ALL_OPS()}）`);
  if (SERVER_OPS[name]) return 'server';
  if (EXT_OP_SET.has(name)) return 'ext';
  if (CORE_OPS.has(name)) return 'core';
  throw bad(`ops[${i}] 未知 op「${name}」（可用：${ALL_OPS()}）`);
}

function readOps(req) {
  return checkOps(jsonField(req, 'ops', jsonField(req, 'spec', {}).ops));
}
export function checkOps(ops) {
  if (!Array.isArray(ops))
    throw bad(`缺少 ops：multipart 字段 ops = JSON 数组，每条形如 { "op":"setLayerProps", "index":3, ... }（可用 op：${ALL_OPS()}）`);
  if (!ops.length) throw bad('ops 是空数组，没有要做的事');
  if (ops.length > MAX_OPS) throw bad(`一次最多 ${MAX_OPS} 条 op（PSD_EDITOR_DOC_MAX_OPS），收到 ${ops.length}`);
  ops.forEach(classify);
  return ops;
}


function segment(ops) {
  const segs = [];
  ops.forEach((op, i) => {
    const kind = classify(op, i);
    const last = segs[segs.length - 1];
    if (last && last.kind === kind) { last.ops.push(op); last.indices.push(i); }
    else segs.push({ kind, ops: [op], indices: [i] });
  });
  return segs;
}



const B64 = /^[A-Za-z0-9+/=\s]+$/;








function pickImage(spec, files, where) {
  const list = files || [];
  const byIndex = n => {
    if (!Number.isInteger(n) || n < 0) throw bad(`${where}.image.index 必须是 ≥0 的整数`);
    if (n >= list.length) throw bad(`${where}.image.index=${n} 越界：本次只上传了 ${list.length} 个 image 字段`);
    return list[n];
  };
  const byName = s => {
    const hit = list.filter(f => f.originalname === s);
    if (!hit.length) throw bad(`${where}.image 找不到名为「${s}」的上传文件（已上传：${list.map(f => f.originalname).join(' / ') || '无'}）`);
    if (hit.length > 1) throw bad(`${where}.image 的文件名「${s}」不唯一，请改用 { "file":"image", "index":n }`);
    return hit[0];
  };
  const fromB64 = s => {
    const b = Buffer.from(String(s).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''), 'base64');
    if (!b.length) throw bad(`${where}.image 的 base64 解不出任何字节`);
    return { buffer: b, originalname: null };
  };

  if (spec == null) throw bad(`${where} 缺少 image（用 { "file":"image", "index":0 } 引用上传的第 n 个 image 字段）`);
  if (typeof spec === 'number') return byIndex(spec);
  if (typeof spec === 'string') {
    if (/^data:/.test(spec)) return fromB64(spec);
    if (list.some(f => f.originalname === spec)) return byName(spec);
    if (spec.length > 64 && B64.test(spec)) return fromB64(spec);
    throw bad(`${where}.image="${clip(spec, 40)}" 既不是上传文件名，也不像 base64`);
  }
  if (typeof spec === 'object') {
    if (spec.base64 || spec.dataURL) return fromB64(spec.base64 || spec.dataURL);
    const field = spec.file || spec.field;
    if (field && field !== 'image')
      throw bad(`${where}.image.file 只能是 "image"（本端点的图片字段名固定为 image），收到 ${JSON.stringify(field)}`);
    if (spec.index != null) return byIndex(+spec.index);
    if (spec.name != null) return byName(String(spec.name));
    if (field) return byIndex(0);
    throw bad(`${where}.image 对象须含 index / name / base64 之一`);
  }
  throw bad(`${where}.image 无法识别：${clip(JSON.stringify(spec), 60)}`);
}

const asBytes = (v, where) => {
  if (typeof v === 'string') return Buffer.from(v.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (Array.isArray(v)) return Uint8Array.from(v);
  throw bad(`${where} 需要 base64 字符串或数字数组`);
};


async function materialize(op, i, files) {
  const where = `ops[${i}]`;
  if (op.op === 'replaceLayerPixels') {
    if (op.rgba) return op;
    const f = pickImage(op.image, files, where);
    let r;
    try {
      r = await sharp(f.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    } catch (e) { throw bad(`${where} 的图片解码失败：${e && e.message}`); }
    const { width, height, channels } = r.info;
    if (channels !== 4) throw bad(`${where} 的图片解码后是 ${channels} 通道，期望 RGBA`);
    if (width * height > MAX_PIXELS)
      throw new HttpError(413, `${where} 的图片 ${width}×${height} 超过像素上限 ${MAX_PIXELS}（PSD_EDITOR_DOC_MAX_PIXELS）`);
    const { image, ...rest } = op;
    return { ...rest, rgba: { data: new Uint8Array(r.data), width, height } };
  }
  if (op.op === 'setImageResource' && op.data !== undefined && !ArrayBuffer.isView(op.data))
    return { ...op, data: asBytes(op.data, `${where}.data`) };
  
  if (['replaceLayerMask', 'addLayerMask', 'setLayerMaskPixels'].includes(op.op) && typeof op.gray === 'string')
    return { ...op, gray: asBytes(op.gray, `${where}.gray`) };
  if (['replaceLayerMask', 'addLayerMask', 'setLayerMaskPixels'].includes(op.op) && op.gray && typeof op.gray === 'object' && typeof op.gray.data === 'string')
    return { ...op, gray: { ...op.gray, data: asBytes(op.gray.data, `${where}.gray.data`) } };
  if (op.op === 'convertToSmartObject' && op.source && typeof op.source.data === 'string')
    return { ...op, source: { ...op.source, data: asBytes(op.source.data, `${where}.source.data`) } };
  if (SERVER_OPS[op.op] === 'replaceSmartObject') {
    const f = pickImage(op.image, files, where);
    return { ...op, image: f.buffer, sourceName: op.sourceName || op.filename || f.originalname || null };
  }
  return op;
}




const normErr = s => String(s).replace(/「[^」]*」/g, '「」').replace(/"[^"]*"/g, '""').replace(/-?\d+/g, '#');

function freshProblems(now, base) {
  const out = [];
  if (!now.lint.ok) {
    const had = new Set((base.lint.errors || []).map(normErr));
    for (const e of now.lint.errors) if (!had.has(normErr(e))) out.push({ kind: 'lint', message: e });
  }
  if (!now.parseOk && base.parseOk) out.push({ kind: 'parse', message: now.parseError });
  if (!now.roundTripIdentical && base.roundTripIdentical)
    out.push({ kind: 'roundtrip', message: '产物自身 parse→serialize 不再逐字节一致', offset: now.firstDiffOffset });
  return out;
}



const PSD_CT = 'image/vnd.adobe.photoshop';

async function encodeOutput(buf, out, doc, psb, info = {}) {
  const format = String(out.format || 'psd').toLowerCase();
  if (format === 'psd' || format === 'psb')
    return { buffer: toBuf(buf), contentType: PSD_CT, ext: psb ? 'psb' : 'psd', meta: {} };
  if (!doc) throw new HttpError(422, '产物无法被重新解析，出不了位图（改用 output.format=psd 拿文件本身，再走 /api/doc/validate 体检）');

  const colorMode = String(out.colorMode || 'rgb').toLowerCase();
  const quality = Math.min(100, Math.max(1, (+out.quality || 92) | 0));
  const maxSize = Math.max(0, (+out.maxSize || 0) | 0);
  const { width, height } = doc.header;
  if (!(width > 0 && height > 0)) throw bad('文档尺寸为 0，无法输出位图');
  if (width * height > MAX_PIXELS)
    throw new HttpError(413, `合成图 ${width}×${height} 超过上限 ${MAX_PIXELS} 像素（PSD_EDITOR_DOC_MAX_PIXELS）`);

  
  const source = out.artboard != null ? 'layers' : String(out.source || (info.recomposited ? 'composite' : 'layers'));
  let img, rgba;
  if (source === 'layers') {
    let r;
    try { r = await renderLayers(buf, { artboard: out.artboard ?? undefined }); }
    catch (e) { if (e && (e.status || e.code === 'artboard')) throw e; throw bad('按图层合成失败（可改用 output.source="composite"）：' + (e && e.message)); }
    img = { width: r.width, height: r.height };
    rgba = r.data;
  } else if (source === 'composite') {
    try { img = decodeComposite(doc, toU8(buf)); }
    catch (e) { throw bad('产物的合成图解码失败（换成 output.format=psd 可以拿到文件本身）：' + (e && e.message)); }
    rgba = img.toRGBA();
  } else throw bad('output.source 只能是 layers / composite');

  let s = sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    { raw: { width: img.width, height: img.height, channels: 4 } });
  if (maxSize && (img.width > maxSize || img.height > maxSize))
    s = s.resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });

  const meta = { source };
  if (colorMode === 'cmyk') {
    if (format === 'png' || format === 'webp') throw bad(`${format} 不支持 CMYK，请改用 jpg / tiff，或用 /api/render 出带 ICC 的 CMYK`);
    s = s.flatten({ background: '#ffffff' }).toColourspace('cmyk');
    meta.colorMode = 'cmyk';
    meta.iccWarning = '本端点的 CMYK 走 libvips 内置公式（不带 ICC），颜色只能用于预览；出印刷文件请用 /api/render';
  }

  try {
    switch (format) {
      case 'png': return { buffer: await s.png({ compressionLevel: 9 }).toBuffer(), contentType: 'image/png', ext: 'png', meta };
      case 'jpg': case 'jpeg':
        if (colorMode !== 'cmyk') s = s.flatten({ background: '#ffffff' });
        return { buffer: await s.jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg', meta };
      case 'tif': case 'tiff': return { buffer: await s.tiff({ quality }).toBuffer(), contentType: 'image/tiff', ext: 'tif', meta };
      case 'webp': return { buffer: await s.webp({ quality }).toBuffer(), contentType: 'image/webp', ext: 'webp', meta };
      default: throw bad(`不支持的 output.format="${clip(format, 20)}"（可用 psd / png / jpg / tiff / webp）`);
    }
  } catch (e) { if (e instanceof HttpError) throw e; throw bad('输出编码失败：' + (e && e.message)); }
}




function slimResult(r) {
  const o = { i: r.i, kind: r.kind, op: r.op, ok: r.ok !== false };
  if (r.alias) o.alias = r.alias;
  if (r.changed !== undefined) o.changed = !!r.changed;
  if (r.changedFields?.length) o.changedFields = r.changedFields;
  if (r.affected?.length) o.affected = r.affected.slice(0, 32);
  if (r.note) o.note = clip(r.note, 160);
  if (r.meta) o.meta = r.meta;
  return o;
}

const slimTarget = t => t && { layerIndex: t.layerIndex, layerName: t.layerName, smartObjectIndex: t.smartObjectIndex };

async function runOps(inputBuf, ops, files, ctx, t0) {
  const segs = segment(ops);
  const results = [];
  const warnings = [];
  const flags = { pixels: false, visual: false, docChanged: false, lastRecomposited: false };
  let cur = toBuf(inputBuf);

  for (const seg of segs) {
    if (seg.kind === 'core') {
      const materialized = [];
      for (let k = 0; k < seg.ops.length; k++) materialized.push(await materialize(seg.ops[k], seg.indices[k], files));
      let r;
      try {
        
        r = applyEdits(toAB(cur), materialized, { verify: false, maxOps: MAX_OPS });
      } catch (e) {
        const local = e && e.opIndex;
        throw mapOpError(e, Number.isInteger(local) ? seg.indices[local] : seg.indices[0],
          Number.isInteger(local) ? seg.ops[local]?.op : undefined);
      }
      cur = toBuf(r.buffer);
      r.results.forEach((rec, k) => results.push({ ...rec, i: seg.indices[k], kind: 'core' }));
      for (const w of r.warnings) warnings.push(w);
      if (seg.ops.some(o => !META_ONLY_CORE.has(o.op))) { flags.visual = true; flags.lastRecomposited = false; }
    } else if (seg.kind === 'ext') {
      for (let k = 0; k < seg.ops.length; k++) {
        const gi = seg.indices[k];
        const op = seg.ops[k];
        let r;
        try { r = await EXT_OPS[op.op].run(cur, op, ctx); }
        catch (e) { throw mapOpError(e, gi, op.op); }
        cur = toBuf(r.buffer);
        results.push({ i: gi, kind: 'server', op: op.op, ok: true, changed: true,
          affected: r.affected || [], note: r.note, meta: r.meta });
        for (const w of r.warnings || []) warnings.push(`ops[${gi}] ${op.op}：${w}`);
        if (r.pixels) { flags.pixels = true; flags.lastRecomposited = false; }
        if (r.docChanged) { flags.docChanged = true; flags.lastRecomposited = true; }
        checkDeadline(t0, `ops[${gi}]「${op.op}」`);
      }
    } else {
      for (let k = 0; k < seg.ops.length; k++) {
        const gi = seg.indices[k];
        const op = await materialize(seg.ops[k], gi, files);
        const canonical = SERVER_OPS[op.op];
        try {
          if (canonical === 'replaceSmartObject') {
            const { buffer, meta } = await applySmartObjectReplace(cur, op, ctx);
            cur = toBuf(buffer);
            results.push({
              i: gi, kind: 'server', op: 'replaceSmartObject', alias: op.op === 'replaceSmartObject' ? null : op.op,
              ok: true, changed: true,
              affected: meta.target ? [meta.target.layerIndex] : [],
              note: `智能对象「${meta.target?.layerName}」换源图`,
              meta: {
                target: slimTarget(meta.target), sourceReplaced: meta.sourceReplaced, bytes: cur.length,
              },
            });
          } else if (canonical === 'setSmartObjectDescriptor') {
            const { buffer, meta } = applySmartObjectDescriptor(cur, op);
            cur = toBuf(buffer);
            results.push({
              i: gi, kind: 'server', op: 'setSmartObjectDescriptor', alias: null,
              ok: true, changed: true,
              affected: [meta.target.layerIndex],
              note: `智能对象「${meta.target.layerName}」放置描述符写回`,
              meta: { target: slimTarget(meta.target), mode: meta.mode, blocks: meta.blocks, bytesDelta: meta.bytesDelta },
            });
          }
        } catch (e) { throw mapOpError(e, gi, op.op); }
        checkDeadline(t0, `ops[${gi}]「${op.op}」`);
      }
    }
    checkDeadline(t0, '执行 ops');
  }
  return { buffer: cur, results, warnings, flags };
}


const META_ONLY_CORE = new Set(['renameLayer', 'setLayerColorLabel', 'setImageResource', 'removeImageResource', 'setLayerFlags']);


function textPrints(buf) {
  const out = new Map();
  let d; try { d = parsePsdDocument(toAB(buf)); } catch { return out; }
  d.layers.forEach((l, i) => {
    if (!l.text) return;
    const b = (l.additionalBlocks || []).find(x => x.key === 'TySh');
    const id = l.additional && l.additional.lyid ? l.additional.lyid.id : 'i' + i;
    const w = l.bounds.right - l.bounds.left, h = l.bounds.bottom - l.bounds.top;
    
    
    out.set(id, { i, raw: b && b._raw ? Buffer.from(b._raw).subarray(50).toString('base64') : '', empty: !(w > 0 && h > 0) });
  });
  return out;
}










export async function executeEdit(inputBuf, ops, o = {}) {
  const f = o.fonts || {};
  const map = f.map == null ? null : f.map;
  if (map !== null && (typeof map !== 'object' || Array.isArray(map) || Object.values(map).some(v => typeof v !== 'string')))
    throw new HttpError(400, 'fontMap 必须是 { "PSD 里的 PostScript 名": "字体 PostScript 名 / 族名 / 字体库 id" } 形式的对象');
  const faces = [...tempFaces(f.files || []), ...userFaces(f.owner)];
  return withFonts({ faces, map }, () => executeEditInner(inputBuf, ops, o));
}

async function executeEditInner(inputBuf, ops, o = {}) {
  const t0 = o.t0 || Date.now();
  const run = await runOps(inputBuf, ops, o.files || [], o.ctx || {}, t0);
  let { buffer } = run;
  const { results, warnings, flags } = run;
  checkDeadline(t0, '执行 ops');
  
  
  let textRendered = [];
  if (o.renderText !== false && textRenderAvailable()) {
    const before = textPrints(inputBuf), after = textPrints(buffer);
    const todo = [];
    for (const [id, a] of after) { const b0 = before.get(id); if (!b0 || b0.raw !== a.raw || a.empty) todo.push(a.i); }
    if (todo.length) {
      const tr = rerenderTextLayers(buffer, todo);
      buffer = tr.buffer; textRendered = tr.rendered;
      for (const w of tr.warnings) warnings.push(w);
      if (tr.rendered.length) flags.visual = true, flags.lastRecomposited = false;
      checkDeadline(t0, '文字重绘');
    }
  }
  
  
  const rc = o.recomposite === undefined ? 'auto' : o.recomposite;
  
  let recomposited = flags.lastRecomposited;
  const want = rc === true || (rc === 'auto' && (flags.pixels || flags.visual));
  if (want && !flags.lastRecomposited) {
    const r = await refreshComposite(buffer);
    if (r.warning) warnings.push(r.warning);
    else {
      buffer = r.buffer; recomposited = true;
      
      for (let k = warnings.length - 1; k >= 0; k--) if (/合成图（Image Data 段）|合成图.{0,12}没有重(新渲染|编)/.test(String(warnings[k]))) warnings.splice(k, 1);
    }
    checkDeadline(t0, '重建合成图');
  }
  const g = guard(buffer);
  checkDeadline(t0, '守门');
  let baseline = null;
  if (!g.ok) {
    baseline = guard(inputBuf);
    const fresh = freshProblems(g, baseline);
    if (fresh.length) {
      throw new HttpError(422, '产物未通过守门（lintPsd + 可解析 + 自身字节往返），已放弃返回文件', {
        stage: fresh[0].kind,
        offset: fresh[0].offset ?? (g.firstDiffOffset >= 0 ? g.firstDiffOffset : undefined),
        guard: {
          fresh: fresh.slice(0, 20),
          lint: { ok: g.lint.ok, errors: g.lint.errors.slice(0, 20) },
          parseOk: g.parseOk, parseError: g.parseError,
          roundTripIdentical: g.roundTripIdentical, firstDiffOffset: g.firstDiffOffset,
          inputWasHealthy: baseline.ok, bytes: g.bytes,
        },
        ops: results.map(slimResult),
      });
    }
    warnings.push(`输入文件本身就没过体检（lint ${baseline.lint.errors.length} 条 / 往返 ${baseline.roundTripIdentical}），本次编辑没有新增毛病`);
  }
  for (const w of g.warnings) warnings.push(w);
  return { buffer, results, warnings, guard: g, baseline, recomposited, textRendered };
}
export { slimResult, encodeOutput, HttpError, statusOf };



export function editRouter({ upload }) {
  const r = express.Router();
  const uploadFields = upload.fields([
    { name: 'psd', maxCount: 1 }, { name: 'image', maxCount: 16 }, { name: 'icc', maxCount: 1 }, { name: 'font', maxCount: 8 },
  ]);
  const jsonBody = express.json({ limit: JSON_LIMIT });
  const heavyGate = heavy();
  const runMw = (mw, req, res) => new Promise((resolve, reject) => mw(req, res, e => e ? reject(e) : resolve()));

  
  r.post('/', async (req, res) => {
    const ct = (req.get('content-type') || '').toLowerCase();
    try {
      if (ct.startsWith('application/json')) {
        await runMw(jsonBody, req, res);
        return fragmentMode(req, res);
      }
      if (ct.startsWith('multipart/form-data')) {
        
        let passed = false;
        heavyGate(req, res, () => { passed = true; });
        if (!passed) return;
        await runMw(uploadFields, req, res);
        return await fileMode(req, res);
      }
      throw new HttpError(415,
        'Content-Type 必须是 multipart/form-data（文件模式：psd + ops）或 application/json（片段模式：{ fragment, edit }）');
    } catch (e) { fail(res, e); }
  });

  
  r.post('/incremental', async (req, res) => {
    const ct = (req.get('content-type') || '').toLowerCase();
    try {
      if (!ct.startsWith('application/json'))
        throw new HttpError(415, '增量编辑只接受 application/json（{ doc, fragments, ops }）');
      await runMw(jsonBody, req, res);
      return incrementalMode(req, res);
    } catch (e) { fail(res, e); }
  });

  
  r.post('/plan', async (req, res) => {
    const ct = (req.get('content-type') || '').toLowerCase();
    try {
      if (!ct.startsWith('multipart/form-data'))
        throw new HttpError(415, 'dry-run 只接受 multipart/form-data（psd + ops）');
      await runMw(uploadFields, req, res);
      return await planMode(req, res, heavyGate);
    } catch (e) { fail(res, e); }
  });

  r.use((err, _req, res, _next) => fail(res, err));
  return r;
}




function decodeFragment(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.blocks)) throw bad('fragment 格式错误（须含 blocks:[{key,data:base64}]）');
  return {
    layerName: typeof f.layerName === 'string' ? f.layerName.slice(0, 256) : '',
    bounds: f.bounds, kind: f.kind, psb: !!f.psb,
    blocks: f.blocks.map(b => ({ key: b.key, data: typeof b.data === 'string' ? Buffer.from(b.data, 'base64') : null }))
      .map(b => ({ key: b.key, data: b.data ? new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength) : null })),
  };
}
const encodeBlocks = blocks => blocks.map(b => ({
  key: b.key, data: Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength).toString('base64'),
}));

function fragmentMode(req, res) {
  const t0 = Date.now();
  const body = req.body || {};
  if (body.ops || body.psdBase64)
    throw bad('片段模式（application/json）只接受 { fragment, edit } 或 { items:[…] }；要按 ops 编辑整份 PSD 请用 multipart/form-data');
  const many = Array.isArray(body.items);
  const list = many ? body.items : [body];
  if (!list.length) throw bad('items 是空数组');
  if (list.length > MAX_ITEMS) throw bad(`一次最多 ${MAX_ITEMS} 个智能对象`);
  
  const done = list.map(it => {
    const out = applyDeformFragment(decodeFragment(it?.fragment), it?.edit);
    return { mode: out.mode, blocks: encodeBlocks(out.blocks) };
  });
  res.set('Cache-Control', 'no-store');
  
  res.json(many ? { items: done, ms: Date.now() - t0 } : { ...done[0], ms: Date.now() - t0 });
}

































const MAX_FRAGMENTS = 64;

function decodeIncremental(body) {
  if (!body || typeof body !== 'object') throw bad('请求体必须是对象');
  const doc = body.doc && typeof body.doc === 'object' ? body.doc : {};
  const rawFrags = body.fragments;
  const ops = body.ops;
  if (!Array.isArray(rawFrags)) throw bad('缺少 fragments 数组（客户端切出来的字节区间）');
  if (!Array.isArray(ops) || !ops.length) throw bad('缺少 ops 数组');
  if (ops.length > MAX_OPS) throw bad(`一次最多 ${MAX_OPS} 条 op（PSD_EDITOR_DOC_MAX_OPS），收到 ${ops.length}`);
  if (rawFrags.length > MAX_FRAGMENTS) throw bad(`一次最多 ${MAX_FRAGMENTS} 个片段，收到 ${rawFrags.length}`);

  const b64 = (v, where) => {
    if (typeof v !== 'string') throw bad(`${where}.data 必须是 base64 字符串`);
    const b = Buffer.from(v, 'base64');
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  };
  const int = (v, where) => {
    if (!Number.isInteger(v) || v < 0) throw bad(`${where} 必须是 ≥0 的整数`);
    return v;
  };

  const fragments = rawFrags.map((f, i) => {
    const where = `fragments[${i}]`;
    if (!f || typeof f !== 'object') throw bad(`${where} 不是对象`);
    if (typeof f.id !== 'string' || !f.id || f.id.length > 128) throw bad(`${where}.id 必须是 1…128 字符的字符串`);
    if (!['layerBlend', 'layerName', 'layerBlock', 'placedBlocks'].includes(f.kind))
      throw bad(`${where}.kind 只能是 layerBlend / layerName / layerBlock / placedBlocks`);
    const out = {
      id: f.id, kind: f.kind, layerIndex: int(f.layerIndex, `${where}.layerIndex`),
      offset: int(f.offset, `${where}.offset`), length: int(f.length, `${where}.length`),
      checksum: f.checksum, layerName: typeof f.layerName === 'string' ? f.layerName.slice(0, 256) : '',
      bounds: f.bounds, meta: f.meta && typeof f.meta === 'object' ? f.meta : {},
    };
    if (f.kind === 'placedBlocks') {
      if (!Array.isArray(f.blocks) || !f.blocks.length) throw bad(`${where}.blocks 为空`);
      if (f.blocks.length > 8) throw bad(`${where}.blocks 过多`);
      out.blocks = f.blocks.map((b, k) => ({
        key: b.key, occurrence: b.occurrence | 0,
        offset: int(b.offset, `${where}.blocks[${k}].offset`), length: int(b.length, `${where}.blocks[${k}].length`),
        data: b64(b.data, `${where}.blocks[${k}]`),
      }));
      for (const [k, b] of out.blocks.entries())
        if (b.data.length !== b.length)
          throw bad(`${where}.blocks[${k}] 声明长度 ${b.length}，实际 ${b.data.length} 字节`);
      out.data = Buffer.concat(out.blocks.map(b => Buffer.from(b.data)));
    } else {
      out.data = b64(f.data, where);
      if (out.data.length !== out.length)
        throw bad(`${where} 声明长度 ${out.length}，实际 ${out.data.length} 字节`);
    }
    
    if (typeof out.checksum === 'string' && out.checksum) {
      const got = fragmentChecksum(out.data);
      if (got !== out.checksum)
        throw bad(`${where} 校验和不符（声明 ${out.checksum}，实际 ${got}）：片段字节与你给的 offset/length 对不上`,
                  { code: 'checksum', fragmentId: out.id });
    }
    if (f.kind === 'placedBlocks') out.data = undefined;      
    return out;
  });

  return { doc: { psb: !!doc.psb, layerCount: doc.layerCount, bytes: doc.bytes }, fragments, ops };
}

const encodeIncrementalFragment = f => ({
  id: f.id, kind: f.kind, layerIndex: f.layerIndex,
  offset: f.offset, length: f.length, checksum: f.checksum,
  newLength: f.newLength, ...(f.newChecksum ? { newChecksum: f.newChecksum } : {}),
  ...(f.blocks
    
    ? { blocks: f.blocks.map(b => ({ key: b.key, occurrence: b.occurrence, offset: b.offset, length: b.length,
                                     newLength: b.data.length, data: toBuf(b.data).toString('base64') })) }
    : { data: toBuf(f.data).toString('base64') }),
});

function incrementalMode(req, res) {
  const t0 = Date.now();
  const decoded = decodeIncremental(req.body);
  authorizeOps(req.principal, decoded.ops);
  const upBytes = decoded.fragments.reduce((a, f) => a + f.length, 0);

  let out;
  try { out = runIncrementalOps(decoded); }
  catch (e) { throw mapOpError(e, e && e.opIndex, e && e.opName); }

  const fragments = out.fragments.map(encodeIncrementalFragment);
  const downBytes = out.fragments.reduce((a, f) => a + (f.newLength || 0), 0);
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    fragments,
    sideEffects: out.sideEffects,
    ops: out.results,
    warnings: out.warnings.map(w => clip(String(w), 160)).slice(0, 20),
    bytes: { up: upBytes, down: downBytes, docBytes: decoded.doc.bytes ?? null },
    ms: Date.now() - t0,
  });
}



async function fileMode(req, res) {
  const t0 = Date.now();
  const f = requirePsd(req);
  const spec = jsonField(req, 'spec', {});
  const ops = readOps(req);
  const out = jsonField(req, 'output', spec.output) || {};
  const render = jsonField(req, 'render', spec.render) || {};
  if (typeof out !== 'object' || Array.isArray(out)) throw bad('output 必须是对象');
  if (typeof render !== 'object' || Array.isArray(render)) throw bad('render 必须是对象');

  
  const p = req.principal;
  const fontFiles = req.files?.font || [];
  authorize(p, [...(fontFiles.length ? ['fonts.request'] : []), ...(out.fontMap != null ? ['fonts.map'] : [])], { consume: false });
  authorizeOps(p, ops);
  if (fontFiles.length || out.fontMap != null) authorize(p, [...(fontFiles.length ? ['fonts.request'] : []), ...(out.fontMap != null ? ['fonts.map'] : [])]);
  const fonts = { owner: allowed(p, 'fonts.library') ? fontOwnerOf(p) : null, files: fontFiles, map: out.fontMap };

  
  const doc0 = parseOr400(f.buffer);
  checkDeadline(t0, '解析');
  if (doc0.header.width * doc0.header.height > MAX_PIXELS)
    throw new HttpError(413, `画布 ${doc0.header.width}×${doc0.header.height} 超过上限 ${MAX_PIXELS} 像素（PSD_EDITOR_DOC_MAX_PIXELS）`);

  const format = String(out.format || 'psd').toLowerCase();
  const ctx = { render };
  if (format === 'psd' || format === 'psb') {
    const o = {};
    if (out.colorMode !== undefined) o.colorMode = out.colorMode;
    if (out.attachIcc !== undefined) o.attachIcc = out.attachIcc;
    if (typeof out.icc === 'string') {
      if (/[\\/]/.test(out.icc)) throw bad('output.icc 只能是 server/profiles/ 下的名字，不接受路径；也可以直接上传 icc 文件字段');
      o.icc = out.icc;
    }
    const iccFile = req.files?.icc?.[0]?.buffer;
    if (iccFile) o.icc = iccFile;
    if (Object.keys(o).length) ctx.output = o;
  }

  const { buffer, results, warnings, guard: g, baseline, recomposited, textRendered } = await executeEdit(f.buffer, ops,
    { files: req.files?.image || [], ctx, t0, recomposite: out.recomposite, renderText: out.renderText, fonts });

  
  
  let outDoc = null;
  if (g.parseOk) { try { outDoc = parsePsdDocument(buffer); } catch { outDoc = null; } }
  const encoded = await encodeOutput(buffer, out, outDoc, outDoc?.header.psb ?? doc0.header.psb, { recomposited });
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', encoded.contentType);
  res.set('Content-Disposition', `attachment; filename="edited.${encoded.ext}"`);
  res.set('X-Doc-Meta', asciiJson({
    ops: results.map(slimResult),
    bytes: encoded.buffer.length, psdBytes: buffer.length, inputBytes: f.buffer.length,
    output: { format: encoded.ext, recomposited, ...(textRendered && textRendered.length ? { textRendered } : {}), ...encoded.meta },
    guard: {
      ok: g.ok, lint: { ok: g.lint.ok, warnings: (g.lint.warnings || []).slice(0, 10) },
      roundTripIdentical: g.roundTripIdentical, firstDiffOffset: g.firstDiffOffset,
      ...(baseline ? { inputWasHealthy: baseline.ok } : {}),
    },
    warnings: warnings.map(w => clip(String(w), 160)).slice(0, 20),
    ms: Date.now() - t0,
  }));
  res.send(encoded.buffer);
}



function planServerOp(buf, op, i) {
  const canonical = SERVER_OPS[op.op];
  const t = resolveTarget(buf, op.target);            
  if (t.smartObjectIndex < 0)
    throw new EditOpError(`图层 ${t.layerIndex}「${t.layerName}」不是智能对象`, 'target');
  const info = inspectTarget(buf, op.target);

  if (canonical === 'replaceSmartObject') {
    if (op.image === undefined)
      throw new EditOpError('缺少 image（dry-run 只检查是否声明了图片引用，不要求真上传）', 'op');
    return { target: t, mesh: `${info.layerInfo?.xn}×${info.layerInfo?.yn}`,
             note: `换源图：智能对象 ${t.smartObjectIndex}「${t.layerName}」→ 图层 ${t.layerIndex}` };
  }
  
  
  const so = parseSmartObjects(toAB(buf))[t.smartObjectIndex];
  const frag = smartObjectFragment(toAB(buf), so);
  const { mode } = applySmartObjectDescriptorFragment(frag, op);
  return { target: t, mode,
           note: `放置描述符写回：智能对象 ${t.smartObjectIndex}「${t.layerName}」→ mode=${mode}` };
}

function planMode(req, res, heavyGate) {
  const t0 = Date.now();
  const f = requirePsd(req);
  const ops = readOps(req);
  authorizeOps(req.principal, ops, { consume: false });   
  const doc = parseOr400(f.buffer);
  checkDeadline(t0, '解析');
  
  
  if (ops.some((op, i) => classify(op, i) === 'ext')) {
    
    let passed = false;
    heavyGate(req, res, () => { passed = true; });
    if (!passed) return;
    return planByExecution(res, f, doc, ops, t0, req.files?.image || []);
  }

  
  
  const coreIdx = [], coreOps = [];
  ops.forEach((op, i) => { if (classify(op, i) === 'core') { coreIdx.push(i); coreOps.push(op); } });
  const corePlan = coreOps.length ? planEdits(doc, coreOps) : { ok: true, results: [], errors: [], layerCount: doc.layers.length };
  const coreByGlobal = new Map();
  corePlan.results.forEach((rec, k) => coreByGlobal.set(coreIdx[k], rec));

  const out = [], errors = [];
  ops.forEach((op, i) => {
    if (classify(op, i) === 'core') {
      const rec = coreByGlobal.get(i);
      if (!rec) { out.push({ i, kind: 'core', op: op.op, ok: null, note: '前面的 op 已失败，未继续校验' }); return; }
      out.push({ i, kind: 'core', op: rec.op, alias: rec.alias, ok: rec.ok, affected: rec.affected, changed: rec.changed, note: rec.note });
      if (!rec.ok) errors.push({ opIndex: i, op: rec.op, message: rec.note });
      return;
    }
    try {
      const info = planServerOp(f.buffer, op, i);
      out.push({ i, kind: 'server', op: SERVER_OPS[op.op], alias: op.op === SERVER_OPS[op.op] ? null : op.op, ok: true,
                 affected: [info.target.layerIndex], target: info.target,
                 mode: info.mode, mesh: info.mesh, note: info.note });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      out.push({ i, kind: 'server', op: SERVER_OPS[op.op] || op.op, ok: false, note: msg });
      errors.push({ opIndex: i, op: SERVER_OPS[op.op] || op.op, message: msg });
    }
  });
  checkDeadline(t0, 'dry-run');

  const summary = summarizeDocument(doc);
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: !errors.length,
    ops: out,
    errors,
    layerCount: corePlan.layerCount,
    document: {
      psb: doc.header.psb, width: doc.header.width, height: doc.header.height,
      layerCount: doc.layers.length, smartObjectCount: summary.flat.filter(l => l.isSmartObject).length,
      textLayerCount: summary.flat.filter(l => l.isText).length,
    },
    input: { bytes: f.buffer.length, filename: f.originalname || null },
    ms: Date.now() - t0,
  });
}

async function planByExecution(res, f, doc, ops, t0, files) {
  let out = [], errors = [], after = null;
  try {
    const r = await executeEdit(f.buffer, ops, { t0, recomposite: false, files, renderText: false });
    out = r.results.map(x => ({ ...slimResult(x), ok: true }));
    after = parsePsdDocument(toAB(r.buffer));
  } catch (e) {
    const i = Number.isInteger(e.opIndex) ? e.opIndex : null;
    errors.push({ opIndex: i, op: e.opName || (i != null ? ops[i]?.op : null), message: e.message, ...(e.stage ? { stage: e.stage } : {}), ...(e.code ? { code: e.code } : {}) });
    ops.forEach((op, k) => out.push({ i: k, kind: classify(op, k) === 'core' ? 'core' : 'server', op: op.op,
      ok: i == null ? null : k < i ? true : k === i ? false : null,
      note: k === i ? e.message : (i != null && k > i ? '前面的 op 已失败，未继续校验' : undefined) }));
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: !errors.length, mode: 'execute', ops: out, errors,
    layerCount: after ? after.layers.length : null,
    document: {
      psb: doc.header.psb, width: doc.header.width, height: doc.header.height, layerCount: doc.layers.length,
      ...(after ? { after: { width: after.header.width, height: after.header.height, layerCount: after.layers.length } } : {}),
    },
    input: { bytes: f.buffer.length, filename: f.originalname || null },
    ms: Date.now() - t0,
  });
}

export default { editRouter };
