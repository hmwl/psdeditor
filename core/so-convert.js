















import { parsePsdFull } from './psd-parse.js';
import { parsePsdDocument, decodeLayerPixels } from './psd-document.js';
import { applyEdits } from './psd-edit.js';
import { transplantCheck, transplantLayers } from './psd-transplant.js';
import { readLayerSoLd } from './psd-edit-sfx.js';
import { soPlacement, transformLayersLocal } from './layer-geometry.js';

const toAB = b => (b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const isPsd = u => u && u.length > 26 && u[0] === 0x38 && u[1] === 0x42 && u[2] === 0x50 && u[3] === 0x53;








export function convertSmartObjectToLayers(base, b, inner, o = {}) {
  const ab = toAB(base);
  const psd = parsePsdFull(ab), L = psd.layers[b];
  if (!L || !(L.placedBlocks && L.placedBlocks.length)) return { fallback: '选中的不是智能对象' };
  if (!isPsd(inner)) return { fallback: '内嵌内容不是 PSD（PNG / JPG 等只有一张像素图）' };
  let sd = null; try { sd = readLayerSoLd(ab, L); } catch { sd = null; }
  const pl = soPlacement(sd && sd.desc);
  if (!pl.ok) return { fallback: pl.why };
  const innerAB = toAB(inner);
  const why = transplantCheck(ab, innerAB);
  if (why) return { fallback: why };
  const ip = parsePsdFull(innerAB);
  const n = ip.layers.length;
  if (!n) return { fallback: '内嵌文件没有图层记录（只有合成图）' };
  
  const kx = pl.width / ip.header.width, ky = pl.height / ip.header.height;
  const A = [pl.A[0] * kx, pl.A[1] * kx, pl.A[2] * ky, pl.A[3] * ky, pl.A[4], pl.A[5]];

  const warnings = [];
  
  let mask = null;
  try {
    const doc = parsePsdDocument(ab), dec = decodeLayerPixels(doc, new Uint8Array(ab), b, { strict: true });
    const m = dec.mask, plane = dec.byId && dec.byId[-2];
    if (m && plane && m.width > 0 && m.height > 0) {
      const g = plane.data || plane.samples || plane;
      mask = { gray: new Uint8Array(g.subarray ? g.subarray(0, m.width * m.height) : g), width: m.width, height: m.height,
        bounds: { left: m.left, top: m.top, right: m.left + m.width, bottom: m.top + m.height }, defaultColor: m.defaultColor ?? 0, disabled: !!m.disabled };
    }
  } catch { mask = null; }

  
  let buf = applyEdits(ab, [{ op: 'newGroup', at: b + 1, name: o.name || L.unicodeName || L.name || '智能对象' }]).buffer;
  
  const t = transplantLayers(buf, innerAB, [...Array(n).keys()], b + 2);
  buf = t.buffer;
  const from = t.from, header = from + t.count;
  
  const idx = []; for (let i = from; i < header; i++) idx.push(i);
  const tr = transformLayersLocal(buf, A, idx, { scaleStyles: true });
  buf = tr.buffer; warnings.push(...tr.warnings);
  
  const gp = { op: 'setLayerProps', index: header };
  const op = o.opacity != null ? o.opacity : (L.opacity ?? 255);
  if (op !== 255) gp.opacity = op;
  const bk = o.blendKey || L.blendMode || 'norm';
  gp.blendKey = bk === 'norm' ? 'pass' : bk;
  if (o.hidden != null ? o.hidden : L.hidden) gp.visible = false;
  buf = applyEdits(buf, [gp]).buffer;
  if (mask) {
    buf = applyEdits(buf, [{ op: 'addLayerMask', index: header, gray: { data: mask.gray, width: mask.width, height: mask.height }, bounds: mask.bounds, defaultColor: mask.defaultColor, ...(mask.disabled ? { disabled: true } : {}) }]).buffer;
  }
  const keys = ['lfx2', 'lmfx', 'vmsk', 'vsms'].filter(k => (L.blocks || []).some(x => x.key === k));
  if (keys.length) {
    try { buf = applyEdits(buf, [{ op: 'copyLayerBlocks', from: b, to: header, keys }]).buffer; }
    catch (e) { warnings.push('智能对象的样式 / 矢量蒙版没能带到组上：' + (e && e.message || e)); }
  }
  
  buf = applyEdits(buf, [{ op: 'deleteLayer', index: b }]).buffer;
  const list = sd && sd.desc && sd.desc.filterFX && sd.desc.filterFX.filterFXList;
  if (Array.isArray(list) && list.length) warnings.push(`智能对象上的 ${list.length} 条智能滤镜没有带出来（转换后不再作用；需要的话先栅格化智能滤镜效果）`);
  return { buffer: buf, sel: header - 1, count: t.count, warnings };
}
export default { convertSmartObjectToLayers };
