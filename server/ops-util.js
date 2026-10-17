













import { parsePsdDocument, decodeLayerPixels } from '../core/psd-document.js';
import {
  rectSelection, ellipseSelection, lassoSelection, combineSelection, invertSelection,
  selectionToMaskGray, isEmptySelection, SELECTION_MODES,
} from '../core/selection.js';
import { EditOpError } from './edit-ops.js';

export const toU8 = b => b instanceof Uint8Array ? b
  : b instanceof ArrayBuffer ? new Uint8Array(b)
  : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  : (() => { throw new Error('需要 Buffer / Uint8Array / ArrayBuffer'); })();
export const toAB = b => { const u = toU8(b); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); };
export const toBuf = b => Buffer.isBuffer(b) ? b : Buffer.from(toU8(b));

export const bad = (m, code = 'op') => { throw new EditOpError(m, code); };



const FILL_KEYS = new Set(['SoCo', 'GdFl', 'PtFl']);
const ADJ_KEYS = new Set(['brit', 'levl', 'curv', 'expA', 'vibA', 'hue2', 'hue ', 'blnc', 'blwh', 'phfl', 'mixr',
  'clrL', 'nvrt', 'post', 'thrs', 'grdm', 'selc', 'CgEd']);






export function layerKind(l) {
  if (!l) return null;
  if (l.groupType === 3) return 'divider';
  if (l.groupType === 1 || l.groupType === 2) return 'group';
  if (l.smartObject) return 'smartObject';
  if (l.text) return 'text';
  const keys = new Set((l.additionalBlocks || []).map(b => b.key));
  const isFill = [...FILL_KEYS].some(k => keys.has(k));
  if (isFill) return l.path ? 'shape' : 'fill';
  if ([...ADJ_KEYS].some(k => keys.has(k))) return 'adjustment';
  const b = l.bounds;
  if (!(b.right > b.left && b.bottom > b.top)) return 'empty';
  return 'raster';
}

export const layerLabel = l => (l && (l.unicodeName || l.name)) || '(未命名)';

export function parseDoc(buf) {
  try { return parsePsdDocument(toAB(buf)); }
  catch (e) { bad('PSD 解析失败：' + (e && e.message || e), 'parse'); }
}








export function pickLayer(doc, op, where = 'op') {
  const layers = doc.layers || [];
  const names = () => layers.map((l, i) => `${i}:${layerLabel(l)}`).join(' / ');
  let idx = null;
  const t = op.index !== undefined ? op.index : op.target;
  if (t === undefined || t === null) bad(`${where} 缺少 index（图层下标）或 target（图层名）`, 'target');
  if (Number.isInteger(t) || (typeof t === 'string' && /^\d+$/.test(t))) idx = +t;
  else if (typeof t === 'string') idx = byName(t);
  else if (t && typeof t === 'object') {
    if (Number.isInteger(t.layerIndex)) idx = t.layerIndex;
    else if (typeof t.name === 'string') idx = byName(t.name);
  }
  if (idx === null) bad(`${where} 无法识别的定位：${JSON.stringify(t)}`, 'target');
  if (idx < 0 || idx >= layers.length) bad(`${where} 图层下标 ${idx} 越界（共 ${layers.length} 层）。可用：${names()}`, 'target');
  return idx;
  function byName(s) {
    const hit = [];
    layers.forEach((l, i) => { if (layerLabel(l) === s && l.groupType !== 3) hit.push(i); });
    if (!hit.length) bad(`${where} 找不到名为「${s}」的图层。可用：${names()}`, 'target');
    if (hit.length > 1) bad(`${where} 图层名「${s}」不唯一（下标 ${hit.join(', ')}），请改用 index`, 'target');
    return hit[0];
  }
}







export function readLayerRGBA(doc, buf, index) {
  const l = doc.layers[index];
  const b = l.bounds;
  const w = b.right - b.left, h = b.bottom - b.top;
  if (!(w > 0 && h > 0)) return { rgba: null, width: 0, height: 0, bounds: { ...b } };
  let dec;
  try { dec = decodeLayerPixels(doc, toU8(buf), index, { strict: true }); }
  catch (e) { bad(`图层 ${index}「${layerLabel(l)}」像素解码失败：${e && e.message || e}`, 'parse'); }
  const rgba = dec.toRGBA({ opacity: 255, applyMask: false });
  const out = { rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: w, height: h, bounds: { ...b } };
  const m = dec.mask, plane = dec.byId && (dec.byId[-2] || null);
  if (m && plane && m.width > 0 && m.height > 0) {
    const g = plane.data || plane.samples || plane;
    if (g && g.length >= m.width * m.height) {
      out.mask = m;
      out.maskGray = g.length === m.width * m.height ? new Uint8Array(g) : new Uint8Array(g.subarray(0, m.width * m.height));
    }
  }
  return out;
}


export function assertPixelDoc(doc, what) {
  const h = doc.header;
  if (h.depth !== 8) bad(`${what}：只支持 8 位/通道文档（本文档 ${h.depth} 位）`, 'op');
  if (![1, 3, 4].includes(h.mode)) bad(`${what}：只支持 RGB / 灰度 / CMYK 文档（本文档 ${h.modeName || h.mode}）`, 'op');
}













export function buildSelection(spec, docW, docH, where = 'selection') {
  if (spec == null) return null;
  let shapes = spec, invert = false;
  if (!Array.isArray(spec)) {
    if (spec.shapes) { shapes = spec.shapes; invert = !!spec.invert; }
    else { shapes = [spec]; invert = !!spec.invert; }
  }
  if (!Array.isArray(shapes) || !shapes.length) bad(`${where} 为空`, 'selection');
  let sel = null;
  shapes.forEach((s, k) => {
    if (!s || typeof s !== 'object') bad(`${where}[${k}] 不是对象`, 'selection');
    const opts = { feather: Math.max(0, +s.feather || 0), antiAlias: s.antiAlias !== false };
    const num = (v, n) => { if (!Number.isFinite(+v)) bad(`${where}[${k}].${n} 必须是数字`, 'selection'); return +v; };
    let one;
    switch (s.type || (s.points ? 'polygon' : 'rect')) {
      case 'all': one = rectSelection(docW, docH, 0, 0, docW, docH); break;
      case 'rect': one = rectSelection(docW, docH, num(s.x, 'x'), num(s.y, 'y'), num(s.width, 'width'), num(s.height, 'height'), opts); break;
      case 'ellipse': one = ellipseSelection(docW, docH, num(s.x, 'x'), num(s.y, 'y'), num(s.width, 'width'), num(s.height, 'height'), opts); break;
      case 'polygon': case 'lasso': {
        if (!Array.isArray(s.points) || s.points.length < 3) bad(`${where}[${k}].points 至少 3 个点 [[x,y],…]`, 'selection');
        const pts = s.points.map((p, i) => Array.isArray(p) ? { x: num(p[0], `points[${i}][0]`), y: num(p[1], `points[${i}][1]`) }
                                                          : { x: num(p.x, `points[${i}].x`), y: num(p.y, `points[${i}].y`) });
        one = lassoSelection(docW, docH, pts, opts); break;
      }
      default: bad(`${where}[${k}].type 只能是 rect / ellipse / polygon / all`, 'selection');
    }
    const mode = k === 0 ? 'replace' : (s.mode || 'add');
    if (!SELECTION_MODES.includes(mode)) bad(`${where}[${k}].mode 只能是 ${SELECTION_MODES.join(' / ')}`, 'selection');
    sel = sel ? combineSelection(sel, one, mode) : one;
  });
  if (invert) sel = invertSelection(sel);
  return sel;
}


export function selectionCoverage(sel, bounds) {
  if (!sel) return null;
  if (isEmptySelection(sel)) return new Uint8Array((bounds.right - bounds.left) * (bounds.bottom - bounds.top));
  return selectionToMaskGray(sel, bounds).gray;
}


export function blendByCoverage(prev, next, cov) {
  if (!cov) return next;
  const out = new Uint8ClampedArray(prev.length);
  for (let i = 0, q = 0; i < cov.length; i++, q += 4) {
    const f = cov[i];
    if (f === 255) { out[q] = next[q]; out[q + 1] = next[q + 1]; out[q + 2] = next[q + 2]; out[q + 3] = next[q + 3]; continue; }
    if (f === 0) { out[q] = prev[q]; out[q + 1] = prev[q + 1]; out[q + 2] = prev[q + 2]; out[q + 3] = prev[q + 3]; continue; }
    const k = f / 255;
    for (let c = 0; c < 4; c++) out[q + c] = Math.round(prev[q + c] + (next[q + c] - prev[q + c]) * k);
  }
  return out;
}




export const affMul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
export const affApply = (A, x, y) => [A[0] * x + A[2] * y + A[4], A[1] * x + A[3] * y + A[5]];

export function parseColor(v, dflt = [255, 255, 255]) {
  if (v == null) return dflt;
  if (Array.isArray(v) && v.length >= 3) return v.slice(0, 3).map(x => Math.max(0, Math.min(255, Math.round(+x || 0))));
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v).trim());
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  bad(`颜色 ${JSON.stringify(v)} 无法识别（用 "#rrggbb" 或 [r,g,b]）`, 'op');
}
