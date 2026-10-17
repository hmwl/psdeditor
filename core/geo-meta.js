











import { applyEdits } from './psd-edit.js';
import { getLayerParams } from './psd-edit-params.js';
import { getVectorStroke } from './psd-edit-path.js';
import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';
import { replaceLayerBlock } from './psd-parse.js';
import { resourceHandler } from './psd-resources.js';
import { writeImageResource } from './psd-write.js';
import { parsePsdDocument } from './psd-document.js';


const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b)
  : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : (() => { throw new Error('需要 Uint8Array / ArrayBuffer'); })();
const toAB = b => { const u = toU8(b); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); };
const layerLabel = l => (l && (l.unicodeName || l.name)) || '(未命名)';
export const affMul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
export const affApply = (A, x, y) => [A[0] * x + A[2] * y + A[4], A[1] * x + A[3] * y + A[5]];

const asAB = r => (r instanceof ArrayBuffer ? r : toAB(r));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const clampF = (v, f) => Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, v));


export function linearInfo(A) {
  const det = A[0] * A[3] - A[1] * A[2];
  const k = Math.sqrt(Math.abs(det)) || 1;
  const sg = v => (v < 0 ? -1 : 1);
  
  const R = Math.abs(A[1]) < 1e-9 && Math.abs(A[2]) < 1e-9 ? [sg(A[0]), 0, 0, sg(A[3]), 0, 0]
    : Math.abs(A[0]) < 1e-9 && Math.abs(A[3]) < 1e-9 ? [0, sg(A[1]), sg(A[2]), 0, 0, 0]
    : [A[0] / k, A[1] / k, A[2] / k, A[3] / k, 0, 0];
  return { det, k, R };
}


export function mapAngle(deg, A) {
  const a = deg * Math.PI / 180;
  const { R } = linearInfo(A);
  const [x, y] = affApply(R, Math.cos(a), -Math.sin(a));
  let out = Math.atan2(-y, x) * 180 / Math.PI;
  if (out > 180) out -= 360; if (out <= -180) out += 360;
  return round(out);
}

function setParams(ab, index, target, at, values, warnings, what) {
  if (!Object.keys(values).length) return ab;
  try { return asAB(applyEdits(ab, [{ op: 'setLayerParams', index, target, ...(at != null ? { at } : {}), values }], { verify: false }).buffer); }
  catch (e) { warnings.push(`${what}：${e.message}`); return ab; }
}




const NOT_SIZE = new Set(['Ckmt']);

export function scaleLayerStyles(ab, indices, k, warnings = []) {
  let count = 0;
  if (!(k > 0) || Math.abs(k - 1) < 1e-9) return { buffer: ab, count };
  for (const i of indices) {
    let p;
    try { p = getLayerParams(ab, i); } catch { continue; }
    const doc = parsePsdDocument(ab), name = layerLabel(doc.layers[i]);
    for (const tg of (p.effects && p.effects.targets) || []) {
      if (!String(tg.target).startsWith('effect:')) continue;
      const values = {};
      for (const f of tg.fields || []) {
        if (f.type !== 'UntF' || !Number.isFinite(f.value) || !f.editable) continue;
        if (f.unit === '#Pxl' && !NOT_SIZE.has(f.path)) values[f.path] = round(clampF(f.value * k, f), 2);
        else if (f.unit === '#Prc' && f.path === 'Scl ' && /pattern|patternFill/i.test(tg.target)) values[f.path] = round(clampF(f.value * k, f), 2);
      }
      const before = ab;
      ab = setParams(ab, i, tg.target, tg.multi ? tg.at : undefined, values, warnings, `图层 ${i}「${name}」样式「${tg.label}」没有缩放`);
      if (ab !== before) count++;
    }
    for (const tg of (p.adjustment && p.adjustment.targets) || []) {
      if (tg.block !== 'PtFl') continue;
      const f = (tg.fields || []).find(x => x.path === 'Scl ' && Number.isFinite(x.value));
      if (f) { const b = ab; ab = setParams(ab, i, tg.target, undefined, { 'Scl ': round(clampF(f.value * k, f), 2) }, warnings, `图层 ${i}「${name}」图案填充缩放没有更新`); if (ab !== b) count++; }
    }
    let vs = null;
    try { vs = getVectorStroke(ab, i); } catch { vs = null; }
    if (vs && Number.isFinite(vs.width)) {
      try {
        ab = asAB(applyEdits(ab, [{ op: 'setVectorStroke', index: i, values: { width: round(vs.width * k, 2), ...(vs.dashOffset ? { dashOffset: round(vs.dashOffset * k, 2) } : {}) } }], { verify: false }).buffer);
        count++;
      } catch (e) { warnings.push(`图层 ${i}「${name}」矢量描边宽度没有缩放：${e.message}`); }
    }
  }
  return { buffer: ab, count };
}



export function mapFillLayers(ab, indices, A, warnings = []) {
  let count = 0;
  const { R, det } = linearInfo(A);
  const rotates = Math.abs(R[0] - 1) > 1e-9 || Math.abs(R[3] - 1) > 1e-9 || Math.abs(R[1]) > 1e-9 || Math.abs(R[2]) > 1e-9;
  if (!rotates) return { buffer: ab, count };
  for (const i of indices) {
    let p;
    try { p = getLayerParams(ab, i); } catch { continue; }
    for (const tg of (p.adjustment && p.adjustment.targets) || []) {
      if (tg.block !== 'GdFl' && tg.block !== 'PtFl') continue;
      const F = Object.fromEntries((tg.fields || []).map(f => [f.path, f]));
      const b = ab, what = tg.block === 'GdFl' ? '渐变' : '图案';
      if (F['Angl'] && Number.isFinite(F['Angl'].value))
        ab = setParams(ab, i, tg.target, undefined, { 'Angl': clampF(mapAngle(F['Angl'].value, A), F['Angl']) }, warnings, `图层 ${i} ${what}填充的角度没有更新`);
      

      const ty = F['Type'] && (F['Type'].value && typeof F['Type'].value === 'object' ? F['Type'].value.value : F['Type'].value);
      if (det < 0 && tg.block === 'GdFl' && String(ty || '').trim() === 'Angl') {
        const rv = F['Rvrs'] ? !!F['Rvrs'].value : false;
        ab = setParams(ab, i, tg.target, undefined, { 'Rvrs': !rv }, warnings, `图层 ${i} 角度渐变翻转后的扫向没有更新`);
      }
      const h = F['Ofst.Hrzn'], v = F['Ofst.Vrtc'];
      if (h && v && Number.isFinite(h.value) && Number.isFinite(v.value) && (h.value || v.value)) {
        const [x, y] = affApply(R, h.value, v.value);
        ab = setParams(ab, i, tg.target, undefined, { 'Ofst.Hrzn': round(x, 2), 'Ofst.Vrtc': round(y, 2) }, warnings, `图层 ${i} ${what}填充的偏移没有更新`);
      }
      if (ab !== b) count++;
    }
  }
  return { buffer: ab, count };
}



const num = v => (v && typeof v === 'object' && 'value' in v ? +v.value : +v);
const setNum = (host, key, val) => { if (host[key] && typeof host[key] === 'object' && 'value' in host[key]) host[key].value = val; else host[key] = val; };

export function mapVectorOrigin(ab, indices, A, warnings = []) {
  let count = 0;
  const { k, R, det } = linearInfo(A);
  const axisPositive = Math.abs(A[1]) < 1e-9 && Math.abs(A[2]) < 1e-9 && A[0] > 0 && A[3] > 0;
  for (const i of indices) {
    const doc = parsePsdDocument(ab);
    const l = doc.layers[i];
    const blk = l && (l.additionalBlocks || []).find(b => b.key === 'vogk');
    if (!blk) continue;
    try {
      const model = blk.model && blk.model.desc ? blk.model : parseAdditionalBlock('vogk', blk._raw);
      const list = model.desc && model.desc.keyDescriptorList;
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        const T = it.Trnf ? [num(it.Trnf.xx), num(it.Trnf.xy), num(it.Trnf.yx), num(it.Trnf.yy), num(it.Trnf.tx), num(it.Trnf.ty)] : [1, 0, 0, 1, 0, 0];
        const identity = T.every((v, j) => Math.abs(v - [1, 0, 0, 1, 0, 0][j]) < 1e-9);
        const bc = it.keyOriginBoxCorners;
        if (bc) for (const c of ['rectangleCornerA', 'rectangleCornerB', 'rectangleCornerC', 'rectangleCornerD']) {
          if (!bc[c]) continue;
          const [x, y] = affApply(A, num(bc[c].Hrzn), num(bc[c].Vrtc));
          setNum(bc[c], 'Hrzn', round(x)); setNum(bc[c], 'Vrtc', round(y));
        }
        if (identity && axisPositive) {
          
          const bb = it.keyOriginShapeBBox;
          if (bb) {
            const [l0, t0] = affApply(A, num(bb.Left), num(bb['Top ']));
            const [r0, b0] = affApply(A, num(bb.Rght), num(bb.Btom));
            setNum(bb, 'Left', round(l0)); setNum(bb, 'Top ', round(t0)); setNum(bb, 'Rght', round(r0)); setNum(bb, 'Btom', round(b0));
          }
          const rr = it.keyOriginRRectRadii;
          if (rr && Math.abs(k - 1) > 1e-9) for (const key of ['topRight', 'topLeft', 'bottomLeft', 'bottomRight']) if (rr[key] != null) setNum(rr, key, round(num(rr[key]) * k));
        } else {
          
          const M = affMul(A, T);
          if (!it.Trnf) it.Trnf = { __name: 'Transform', __classID: 'Trnf', __doub: { xx: true, xy: true, yx: true, yy: true, tx: true, ty: true } };
          for (const [j, key] of ['xx', 'xy', 'yx', 'yy', 'tx', 'ty'].entries()) setNum(it.Trnf, key, round(M[j], 6));
        }
      }
      const bytes = writeAdditionalBlock('vogk', model);
      ab = asAB(replaceLayerBlock(ab, i, 'vogk', bytes));
      count++;
    } catch (e) { warnings.push(`形状图层 ${i}「${layerLabel(l)}」的实时形状属性（vogk）没有更新：${e.message}`); }
  }
  return { buffer: ab, count, det };
}



function mapRectObj(o, A) {
  
  const keys = 'top' in o && 'left' in o ? ['top', 'left', 'bottom', 'right'] : ('Top ' in o && 'Left' in o ? ['Top ', 'Left', 'Btom', 'Rght'] : null);
  if (!keys) return false;
  const [T, L, B, Rr] = keys.map(key => num(o[key]));
  if (![T, L, B, Rr].every(Number.isFinite)) return false;
  const pts = [[L, T], [Rr, T], [Rr, B], [L, B]].map(p => affApply(A, p[0], p[1]));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const isInt = Number.isInteger(num(o[keys[0]]));
  const f = v => (isInt ? Math.round(v) : round(v));
  setNum(o, keys[0], f(Math.min(...ys))); setNum(o, keys[1], f(Math.min(...xs))); setNum(o, keys[2], f(Math.max(...ys))); setNum(o, keys[3], f(Math.max(...xs)));
  return true;
}
function walkRects(node, A, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return 0;
  let n = 0;
  if (!Array.isArray(node) && mapRectObj(node, A)) n++;
  for (const v of Array.isArray(node) ? node : Object.values(node)) if (v && typeof v === 'object') n += walkRects(v, A, depth + 1);
  return n;
}

export function mapSlices(ab, A, warnings = []) {
  const doc = parsePsdDocument(ab);
  const r = (doc.imageResources || []).find(x => x.id === 1050);
  if (!r || !r.data || r._writeMode !== 'semantic') { if (r && r._writeMode !== 'semantic') warnings.push('切片资源（1050）无法语义改写，没有随之变换'); return { buffer: ab, count: 0 }; }
  try {
    const model = JSON.parse(JSON.stringify(r.data, (k, v) => (v instanceof Uint8Array ? { __u8: [...v] } : v)), (k, v) => (v && v.__u8 ? Uint8Array.from(v.__u8) : v));
    const n = walkRects(model, A);
    const bytes = resourceHandler(1050).write(model, r);
    return { buffer: asAB(writeImageResource(ab, 1050, toU8(bytes))), count: n };
  } catch (e) { warnings.push('切片（资源 1050）没有随之变换：' + e.message); return { buffer: ab, count: 0 }; }
}
