











import express from 'express';
import { createPsd, NEW_DOC_PRESETS, NEW_DOC_MODES } from '../core/psd-new.js';
import { parsePsdDocument } from '../core/psd-document.js';
import { heavy } from './auth.js';
import { listArtboards, renderLayers, encodeRaster } from './doc-render.js';
import { buildZip } from './zip.js';
import { failJson } from './http-error.js';

const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;
const PSD_CT = 'image/vnd.adobe.photoshop';

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; if (extra) Object.assign(this, extra); } }
const bad = m => new HttpError(400, m);

const asciiJson = o => JSON.stringify(o).replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
function fail(res, e) {
  if (res.headersSent) return;
  if (e && e.name === 'EditOpError' && !e.status) e.status = 400;
  failJson(res, e, { defaultStatus: e?.status ? e.status : 500, tag: 'doc-extra', extraKeys: ['code', 'stage'] });
}
function requireFile(req) {
  const f = req.file;
  if (!f || !f.buffer || !f.buffer.length) throw bad('缺少 psd 文件字段（multipart 字段名 psd）');
  const cap = req.principal?.maxUploadMB;
  if (cap && f.buffer.length > cap * 1024 * 1024) throw new HttpError(413, `该 API key 的上传上限为 ${cap} MB`);
  return f;
}
function parseJsonField(v, name) {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }            
}
const numOr = (v, d) => (v == null || v === '' ? d : +v);


export function findPreset(name) {
  for (const g of NEW_DOC_PRESETS) for (const it of g.items) if (it.name === name) return { ...it, group: g.group };
  return null;
}


export function newDocument(o = {}) {
  let { width, height, resolution } = o;
  if (o.preset) {
    const p = findPreset(o.preset);
    if (!p) throw bad(`未知预设「${o.preset}」；可用：${NEW_DOC_PRESETS.flatMap(g => g.items.map(i => i.name)).join(' / ')}`);
    width = width ?? p.width; height = height ?? p.height; resolution = resolution ?? p.resolution;
  }
  width = Math.round(+width || 0); height = Math.round(+height || 0);
  if (!(width >= 1 && height >= 1 && width <= 30000 && height <= 30000)) throw bad('width / height 必须是 1…30000 的整数（或给 preset）');
  if (width * height > MAX_PIXELS) throw new HttpError(413, `画布 ${width}×${height} 超过像素上限 ${MAX_PIXELS}`);
  const mode = o.mode || 'rgb';
  if (!NEW_DOC_MODES.some(m => m.value === mode)) throw bad(`mode 只能是 ${NEW_DOC_MODES.map(m => m.value).join(' / ')}`);
  if (o.depth != null && ![8, 16].includes(+o.depth)) throw bad('depth 只能是 8 / 16');
  const bg = o.background || 'white';
  if (!['white', 'black', 'transparent', 'color'].includes(bg)) throw bad('background 只能是 white / black / transparent / color');
  const ab = createPsd({ width, height, mode, depth: +o.depth || 8, resolution: +resolution || 72, background: bg,
    backgroundColor: o.backgroundColor, name: o.layerName });
  return { buffer: Buffer.from(ab), width, height, mode, depth: +o.depth || 8, resolution: +resolution || 72, background: bg };
}

export function docExtraRouter({ upload }) {
  const r = express.Router();
  const psd = upload.single('psd');

  r.post('/new', express.json({ limit: '16kb' }), (req, res) => {
    try {
      const out = newDocument(req.body || {});
      const name = String(req.body?.name || '未标题-1').replace(/[^\w一-龥.-]+/g, '_');
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', PSD_CT);
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}.psd"`);
      res.set('X-Doc-Meta', asciiJson({ width: out.width, height: out.height, mode: out.mode, depth: out.depth, resolution: out.resolution, background: out.background, bytes: out.buffer.length }));
      res.send(out.buffer);
    } catch (e) { fail(res, e); }
  });

  r.post('/artboards', psd, (req, res) => {
    try {
      const f = requireFile(req);
      const list = listArtboards(f.buffer);
      res.set('Cache-Control', 'no-store');
      res.json({ artboards: list.map(({ key, ...a }) => a), count: list.length });
    } catch (e) { fail(res, e); }
  });

  r.post('/render', heavy(), psd, async (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const b = req.body || {};
      const artboard = parseJsonField(b.artboard, 'artboard');
      const region = parseJsonField(b.region, 'region');
      const hide = parseJsonField(b.hide, 'hide');
      const img = await renderLayers(f.buffer, { artboard, region, hide: Array.isArray(hide) ? hide : undefined });
      const out = await encodeRaster(img, { format: b.format || 'png', quality: numOr(b.quality, 92), maxSize: numOr(b.maxSize, 0), background: b.background, flatten: b.flatten === 'true' || b.flatten === true });
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', out.contentType);
      res.set('X-Doc-Meta', asciiJson({ width: img.width, height: img.height, x: img.x, y: img.y,
        ...(img.artboard ? { artboard: { index: img.artboard.index, name: img.artboard.name } } : {}), ms: Date.now() - t0 }));
      res.set('Content-Disposition', `inline; filename="render.${out.ext}"`);
      res.send(out.buffer);
    } catch (e) { fail(res, e); }
  });

  r.post('/export-artboards', heavy(), psd, async (req, res) => {
    const t0 = Date.now();
    try {
      const f = requireFile(req);
      const b = req.body || {};
      let list = listArtboards(f.buffer);
      if (!list.length) throw bad('这份文档里没有画板');
      const pick = parseJsonField(b.artboards, 'artboards');
      if (Array.isArray(pick) && pick.length) list = list.filter(a => pick.includes(a.index) || pick.includes(a.name));
      if (!list.length) throw bad('artboards 里列的画板一个都没找到');
      const files = [];
      for (const a of list) {
        const img = await renderLayers(f.buffer, { artboard: a.index });
        const out = await encodeRaster(img, { format: b.format || 'png', quality: numOr(b.quality, 92), maxSize: numOr(b.maxSize, 0) });
        files.push({ name: `${a.name}.${out.ext}`, data: out.buffer });
      }
      const zip = buildZip(files);
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename="artboards.zip"');
      res.set('X-Doc-Meta', asciiJson({ count: files.length, files: files.map(x => ({ name: x.name, bytes: x.data.length })), ms: Date.now() - t0 }));
      res.send(zip);
    } catch (e) { fail(res, e); }
  });

  r.use((err, _req, res, _next) => fail(res, err));
  return r;
}

export { parsePsdDocument };
