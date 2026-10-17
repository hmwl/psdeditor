













import { parsePsdFull, setTextLayerMeta } from './psd-parse.js';
import { parsePsdDocument, decodeLayerPixels } from './psd-document.js';
import { applyEdits } from './psd-edit.js';
import { getVectorMaskPath } from './psd-edit-path.js';
import { mapFillLayers, mapVectorOrigin, scaleLayerStyles, linearInfo, affMul, affApply } from './geo-meta.js';

const EPS = 1e-6;
const toAB = b => (b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
export const isTranslation = A => Math.abs(A[0] - 1) < EPS && Math.abs(A[3] - 1) < EPS && Math.abs(A[1]) < EPS && Math.abs(A[2]) < EPS;
export function affInv(A) {
  const det = A[0] * A[3] - A[1] * A[2];
  if (Math.abs(det) < 1e-12) return null;
  const a = A[3] / det, b = -A[1] / det, c = -A[2] / det, d = A[0] / det;
  return [a, b, c, d, -(a * A[4] + c * A[5]), -(b * A[4] + d * A[5])];
}


const num = v => +(v && typeof v === 'object' ? v.value : v);
function meshIsIdentity(warp, w, h) {
  const m = warp && warp.customEnvelopeWarp && warp.customEnvelopeWarp.meshPoints;
  if (!m) return true;
  const xs = m.Hrzn && m.Hrzn.values, ys = m.Vrtc && m.Vrtc.values;
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length) return false;
  const b = warp.bounds || {}, L = num(b.Left) || 0, T = num(b['Top ']) || 0, R = b.Rght != null ? num(b.Rght) : w, B = b.Btom != null ? num(b.Btom) : h;
  const n = Math.round(Math.sqrt(xs.length)); if (n * n !== xs.length) return false;
  const tol = Math.max(R - L, B - T) * 1e-4 + 1e-3;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c;
    if (Math.abs(xs[i] - (L + (R - L) * c / (n - 1))) > tol || Math.abs(ys[i] - (T + (B - T) * r / (n - 1))) > tol) return false;
  }
  return true;
}




export function soPlacement(desc) {
  if (!desc) return { ok: false, why: '读不到智能对象的放置描述符' };
  const sz = desc['Sz  '] || {};
  const w = num(sz.Wdth), h = num(sz.Hght);
  const q = desc.Trnf, na = desc.nonAffineTransform;
  if (!(w > 0 && h > 0) || !Array.isArray(q) || q.length !== 8) return { ok: false, why: '放置描述符里没有尺寸 / 四点' };
  if (Array.isArray(na) && na.some((v, i) => Math.abs(v - q[i]) > 1e-3)) return { ok: false, why: '智能对象做过扭曲 / 透视变换' };
  if (desc.quiltWarp) return { ok: false, why: '智能对象带网格变形（拆分变形）' };
  const ws = desc.warp && desc.warp.warpStyle && (desc.warp.warpStyle.value || desc.warp.warpStyle);
  if (ws && ws !== 'warpNone') {
    if (ws === 'warpCustom') { if (!meshIsIdentity(desc.warp, w, h)) return { ok: false, why: '智能对象带自定变形网格' }; }
    else if (Math.abs(num(desc.warp.warpValue) || 0) > 1e-6 || Math.abs(num(desc.warp.warpPerspective) || 0) > 1e-6 || Math.abs(num(desc.warp.warpPerspectiveOther) || 0) > 1e-6)
      return { ok: false, why: '智能对象带变形（' + ws + '）' };
  }
  const list = desc.filterFX && Array.isArray(desc.filterFX.filterFXList) ? desc.filterFX.filterFXList : [];
  if (list.some(e => e && e.Fltr && (e.Fltr.__classID === 'rigidTransform' || e.Fltr.__classID === 'perspectiveWarpTransform')))
    return { ok: false, why: '智能对象带操控变形 / 透视变形' };
  
  const A = [(q[2] - q[0]) / w, (q[3] - q[1]) / w, (q[6] - q[0]) / h, (q[7] - q[1]) / h, q[0], q[1]];
  const br = affApply(A, w, h), tol = Math.max(1e-3, Math.hypot(q[2] - q[0], q[3] - q[1]) * 1e-5);
  if (Math.abs(br[0] - q[4]) > tol + 0.01 || Math.abs(br[1] - q[5]) > tol + 0.01) return { ok: false, why: '放置四点不是平行四边形（透视）' };
  return { ok: true, A, width: w, height: h };
}






export function resampleAffine(data, w, h, ch, bounds, A, bg = 0) {
  if (isTranslation(A)) {
    const dx = Math.round(A[4]), dy = Math.round(A[5]);
    return { data, width: w, height: h, bounds: { left: bounds.left + dx, top: bounds.top + dy, right: bounds.right + dx, bottom: bounds.bottom + dy } };
  }
  const pts = [[bounds.left, bounds.top], [bounds.right, bounds.top], [bounds.right, bounds.bottom], [bounds.left, bounds.bottom]].map(p => affApply(A, p[0], p[1]));
  const minX = Math.floor(Math.min(...pts.map(p => p[0])) + 1e-6), minY = Math.floor(Math.min(...pts.map(p => p[1])) + 1e-6);
  const maxX = Math.ceil(Math.max(...pts.map(p => p[0])) - 1e-6), maxY = Math.ceil(Math.max(...pts.map(p => p[1])) - 1e-6);
  const W = Math.max(1, maxX - minX), H = Math.max(1, maxY - minY);
  if (W * H > 200e6) throw new Error(`变换后图层 ${W}×${H} 太大`);
  const I = affInv(A); if (!I) throw new Error('变换矩阵不可逆');
  const out = ch === 4 ? new Uint8ClampedArray(W * H * 4) : new Uint8Array(W * H).fill(bg);
  const k = Math.sqrt(Math.abs(A[0] * A[3] - A[1] * A[2]));
  const ss = k < 1 ? Math.min(4, Math.ceil(1 / k)) : 1;             
  const inv = 1 / (ss * ss);
  const sample = (sx, sy, acc) => {
    
    const fx = sx - 0.5, fy = sy - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    for (let j = 0; j < 4; j++) {
      const xx = x0 + (j & 1), yy = y0 + (j >> 1);
      const wgt = ((j & 1) ? tx : 1 - tx) * ((j >> 1) ? ty : 1 - ty);
      if (wgt <= 0) continue;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) { if (ch === 1) acc[0] += bg * wgt; continue; }
      const o = (yy * w + xx) * ch;
      if (ch === 1) { acc[0] += data[o] * wgt; continue; }
      const a = data[o + 3] * wgt;
      acc[0] += data[o] * a; acc[1] += data[o + 1] * a; acc[2] += data[o + 2] * a; acc[3] += a;
    }
  };
  const acc = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    acc[0] = acc[1] = acc[2] = acc[3] = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const dx = minX + x + (sx + 0.5) / ss, dy = minY + y + (sy + 0.5) / ss;
      const px = I[0] * dx + I[2] * dy + I[4] - bounds.left, py = I[1] * dx + I[3] * dy + I[5] - bounds.top;
      sample(px, py, acc);
    }
    const o = (y * W + x) * ch;
    if (ch === 1) { out[o] = Math.round(acc[0] * inv); continue; }
    const a = acc[3] * inv;
    if (a > 0) { out[o] = acc[0] / acc[3]; out[o + 1] = acc[1] / acc[3]; out[o + 2] = acc[2] / acc[3]; out[o + 3] = Math.round(a); }
  }
  return { data: out, width: W, height: H, bounds: { left: minX, top: minY, right: minX + W, bottom: minY + H } };
}



export function mapPlacedTransforms(ab, layerIndex, A) {
  const full = parsePsdFull(ab);
  const layer = full.layers[layerIndex];
  const blocks = (layer && layer.placedBlocks) || [];
  if (!blocks.length) return { buffer: ab, count: 0 };
  const out = ab.slice(0), u8 = new Uint8Array(out), dv = new DataView(out);
  let count = 0;
  const mapQuad = (read, write) => {
    const q = []; for (let k = 0; k < 8; k++) q.push(read(k));
    if (!q.every(Number.isFinite)) return;
    for (let k = 0; k < 4; k++) { const p = affApply(A, q[k * 2], q[k * 2 + 1]); write(k * 2, p[0]); write(k * 2 + 1, p[1]); }
    count++;
  };
  const keyAt = (o, key) => {
    const len = key.length === 4 ? 0 : key.length;
    if (dv.getUint32(o) !== len) return false;
    for (let q = 0; q < key.length; q++) if (u8[o + 4 + q] !== key.charCodeAt(q)) return false;
    return true;
  };
  for (const b of blocks) {
    const a = b.dataOffset, z = b.dataOffset + b.dataLength;
    if (b.key === 'PlLd' || b.key === 'plLd') {
      let o = a + 8; const n = u8[o]; o += 1 + n + 16;
      if (o + 64 <= z) mapQuad(k => dv.getFloat64(o + k * 8), (k, v) => dv.setFloat64(o + k * 8, v));
      continue;
    }
    for (const key of ['Trnf', 'nonAffineTransform']) {
      const klen = key.length === 4 ? 8 : 4 + key.length;
      for (let o = a; o + klen + 8 <= z; o++) {
        if (!keyAt(o, key)) continue;
        let p = o + klen;
        if (String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]) !== 'VlLs' || dv.getUint32(p + 4) !== 8) continue;
        p += 8;
        const offs = [];
        for (let q = 0; q < 8 && p + 12 <= z; q++) {
          if (String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]) !== 'doub') break;
          offs.push(p + 4); p += 12;
        }
        if (offs.length === 8) mapQuad(k => dv.getFloat64(offs[k]), (k, v) => dv.setFloat64(offs[k], v));
        break;
      }
    }
  }
  return { buffer: out, count };
}









export function transformLayersLocal(buf, A, indices, o = {}) {
  let ab = toAB(buf);
  const warnings = [], stats = { pixels: 0, masks: 0, text: 0, smartObjects: 0, vectors: 0 };
  const want = [...new Set(indices)].sort((a, b) => a - b);
  
  const vectors = [];
  for (const i of want) {
    let p = null;
    try { p = getVectorMaskPath(ab, i, { units: 'pixel' }); } catch { p = null; }
    if (!p || !p.subpaths) continue;
    const mp = pt => affApply(A, pt[0], pt[1]);
    vectors.push({ i, subpaths: p.subpaths.map(s => ({ closed: s.closed, operation: s.operation,
      knots: s.knots.map(k => ({ anchor: mp(k.anchor), in: mp(k.in), out: mp(k.out), linked: k.linked })) })) });
  }
  for (const i of want) {
    const doc = parsePsdDocument(ab), l = doc.layers[i];
    if (!l) continue;
    const full = parsePsdFull(ab).layers[i];
    const gt = full && full.groupType;
    const b = l.bounds || { left: 0, top: 0, right: 0, bottom: 0 };
    const w = b.right - b.left, h = b.bottom - b.top;
    let dec = null;
    try { dec = decodeLayerPixels(doc, new Uint8Array(ab), i, { strict: true }); } catch { dec = null; }
    if (dec && w > 0 && h > 0 && !(gt === 1 || gt === 2 || gt === 3)) {
      const rgba = dec.toRGBA({ opacity: 255, applyMask: false });
      const t = resampleAffine(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), w, h, 4, b, A);
      ab = applyEdits(ab, [{ op: 'replaceLayerPixels', index: i, rgba: { data: new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), width: t.width, height: t.height }, bounds: t.bounds }], { verify: false }).buffer;
      stats.pixels++;
    }
    
    const m = dec && dec.mask, plane = dec && dec.byId && dec.byId[-2];
    if (m && plane && m.width > 0 && m.height > 0) {
      const g = plane.data || plane.samples || plane;
      const dc = (m.defaultColor ?? 0) >= 128 ? 255 : 0;
      const mb = { left: m.left, top: m.top, right: m.left + m.width, bottom: m.top + m.height };
      try {
        const t = resampleAffine(g.length === m.width * m.height ? g : g.subarray(0, m.width * m.height), m.width, m.height, 1, mb, A, dc);
        ab = applyEdits(ab, [{ op: 'replaceLayerMask', index: i, bounds: t.bounds, gray: t.data, defaultColor: dc }], { verify: false }).buffer;
        stats.masks++;
      } catch (e) { warnings.push(`图层 ${i} 蒙版未变换：${e.message}`); }
    }
    const f2 = parsePsdFull(ab).layers[i];
    if (f2 && f2.text) {
      const T = (f2.textTransform || [1, 0, 0, 1, 0, 0]).slice(0, 6);
      try { ab = toAB(setTextLayerMeta(ab, i, { transform: affMul(A, T) })); stats.text++; }
      catch (e) { warnings.push(`文字层 ${i} 变换矩阵未写回：${e.message}`); }
    }
    if (f2 && f2.placedBlocks && f2.placedBlocks.length) {
      const r = mapPlacedTransforms(ab, i, A); ab = r.buffer; if (r.count) stats.smartObjects++;
    }
  }
  for (const v of vectors) {
    try { ab = applyEdits(ab, [{ op: 'setVectorMaskPath', index: v.i, subpaths: v.subpaths, units: 'pixel' }], { verify: false }).buffer; stats.vectors++; }
    catch (e) { warnings.push(`图层 ${v.i} 矢量路径未变换：${e.message}`); }
  }
  try { ab = mapFillLayers(ab, want, A, warnings).buffer; } catch (e) { warnings.push('填充层角度未更新：' + e.message); }
  try { ab = mapVectorOrigin(ab, want, A, warnings).buffer; } catch (e) { warnings.push('实时形状尺寸未更新：' + e.message); }
  if (o.scaleStyles && !isTranslation(A)) { try { ab = scaleLayerStyles(ab, want, linearInfo(A).k, warnings).buffer; } catch (e) { warnings.push('图层样式未缩放：' + e.message); } }
  return { buffer: ab, warnings, stats };
}

export default { soPlacement, resampleAffine, mapPlacedTransforms, transformLayersLocal, affInv, isTranslation };
