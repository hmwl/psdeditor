
















import { applyEdits } from '../core/psd-edit.js';
import { applyFilter as runFilter, FILTERS, normalizeFilterParams } from '../core/filters.js';
import { applyAdjustment as runAdjustment, ADJUSTMENT_TYPES } from '../core/adjust.js';
import { contentAwareFill as runCAF } from '../core/content-aware.js';
import {
  toAB, toBuf, bad, parseDoc, pickLayer, layerKind, layerLabel, readLayerRGBA, assertPixelDoc,
  buildSelection, selectionCoverage, blendByCoverage, parseColor,
} from './ops-util.js';
import { selectionBounds } from '../core/selection.js';

const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;
const PIXEL_KINDS = new Set(['raster', 'empty']);

function needPixelLayer(doc, op, what) {
  const idx = pickLayer(doc, op, what);
  const l = doc.layers[idx], kind = layerKind(l);
  if (!PIXEL_KINDS.has(kind)) {
    const hint = kind === 'text' || kind === 'smartObject' || kind === 'shape' || kind === 'fill'
      ? `；先在同一批 ops 里跑 { "op":"rasterizeLayer", "index":${idx} } 栅格化（PS 同）`
      : '';
    bad(`${what}：图层 ${idx}「${layerLabel(l)}」是 ${kind}，只能作用于普通像素图层${hint}`, 'target');
  }
  assertPixelDoc(doc, what);
  return { idx, layer: l };
}

function writePixels(buf, idx, rgba, width, height, bounds) {
  if (width * height > MAX_PIXELS) bad(`图层 ${width}×${height} 超过像素上限 ${MAX_PIXELS}`, 'op');
  const r = applyEdits(toAB(buf), [{ op: 'replaceLayerPixels', index: idx, rgba: { data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height }, bounds }], { verify: false });
  return toBuf(r.buffer);
}

export function fadeMix(prev, next, fade) {
  if (fade == null) return next;
  const k = Math.max(0, Math.min(100, +fade)) / 100;
  if (k >= 1) return next;
  const out = new Uint8ClampedArray(next.length);
  for (let i = 0; i < next.length; i++) out[i] = Math.round(prev[i] + (next[i] - prev[i]) * k);
  return out;
}


export function padLayer(src, w, h, bounds, pad, docW, docH) {
  const l = Math.max(Math.min(0, bounds.left), bounds.left - pad), t = Math.max(Math.min(0, bounds.top), bounds.top - pad);
  const r = Math.min(Math.max(docW, bounds.right), bounds.right + pad), b = Math.min(Math.max(docH, bounds.bottom), bounds.bottom + pad);
  const W = r - l, H = b - t;
  if (W === w && H === h) return { rgba: src, width: w, height: h, bounds };
  const out = new Uint8ClampedArray(W * H * 4);
  const ox = bounds.left - l, oy = bounds.top - t;
  for (let y = 0; y < h; y++) out.set(src.subarray(y * w * 4, (y + 1) * w * 4), ((y + oy) * W + ox) * 4);
  return { rgba: out, width: W, height: H, bounds: { left: l, top: t, right: r, bottom: b } };
}


export function trimAlpha(rgba, w, h, bounds) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return { rgba, width: w, height: h, bounds };
  const W = x1 - x0 + 1, H = y1 - y0 + 1, out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * W * 4);
  return { rgba: out, width: W, height: H, bounds: { left: bounds.left + x0, top: bounds.top + y0, right: bounds.left + x0 + W, bottom: bounds.top + y0 + H } };
}



export function applyFilterOp(buf, op) {
  const doc = parseDoc(buf);
  const { idx, layer } = needPixelLayer(doc, op, 'applyFilter');
  const kind = op.filter || op.kind;
  const f = FILTERS[kind];
  if (!f) bad(`applyFilter：未知滤镜「${kind}」；可用：${Object.keys(FILTERS).join(' ')}（完整参数表见 GET /api/catalog）`, 'op');
  let params;
  try { params = normalizeFilterParams(kind, op.params || {}); }
  catch (e) { bad('applyFilter：' + e.message, 'op'); }
  if (op.foreground != null) params._fg = parseColor(op.foreground);
  if (op.background != null) params._bg = parseColor(op.background);
  const W = doc.header.width, H = doc.header.height;
  let px = readLayerRGBA(doc, buf, idx);
  if (!px.rgba) bad(`applyFilter：图层 ${idx}「${layerLabel(layer)}」没有像素`, 'target');
  
  let pad = 0;
  if (op.expand !== false) {
    for (const p of f.params) if (p.spatial && Number.isFinite(+params[p.key])) pad = Math.max(pad, Math.ceil(+params[p.key] * 3));
    if (Number.isFinite(+op.expand)) pad = Math.max(0, +op.expand | 0);
    pad = Math.min(pad, 512);
  }
  const base = pad ? padLayer(px.rgba, px.width, px.height, px.bounds, pad, W, H) : px;
  let next;
  try { next = runFilter(kind, base.rgba, base.width, base.height, params); }
  catch (e) { bad('applyFilter：' + (e && e.message || e), 'op'); }
  next = fadeMix(base.rgba, next, op.fade);
  const sel = buildSelection(op.selection, W, H, 'applyFilter.selection');
  const outPx = blendByCoverage(base.rgba, next, selectionCoverage(sel, base.bounds));
  const t = trimAlpha(outPx, base.width, base.height, base.bounds);
  if (!t) bad(`applyFilter：结果全透明，拒绝写回（图层会变空）。检查参数或选区`, 'op');
  return {
    buffer: writePixels(buf, idx, t.rgba, t.width, t.height, t.bounds),
    affected: [idx], note: `图层 ${idx}「${layerLabel(layer)}」应用滤镜「${f.label}」`,
    meta: { filter: kind, label: f.label, params: stripCtx(params), bounds: t.bounds, selection: !!sel },
    pixels: true,
  };
}
const stripCtx = p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_')));



export function applyAdjustmentOp(buf, op) {
  const doc = parseDoc(buf);
  const { idx, layer } = needPixelLayer(doc, op, 'applyAdjustment');
  const params = op.adjustment || (op.type ? { ...op, op: undefined, index: undefined, target: undefined, selection: undefined, fade: undefined } : null);
  if (!params || !params.type) bad(`applyAdjustment：缺少 adjustment:{ type, … }；type 可用：${ADJUSTMENT_TYPES.join(' ')}`, 'op');
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  const px = readLayerRGBA(doc, buf, idx);
  if (!px.rgba) bad(`applyAdjustment：图层 ${idx}「${layerLabel(layer)}」没有像素`, 'target');
  let next;
  try { next = runAdjustment(px.rgba, px.width, px.height, clean); }
  catch (e) { bad('applyAdjustment：' + (e && e.message || e), 'op'); }
  next = fadeMix(px.rgba, next, op.fade);
  const sel = buildSelection(op.selection, doc.header.width, doc.header.height, 'applyAdjustment.selection');
  const out = blendByCoverage(px.rgba, next, selectionCoverage(sel, px.bounds));
  return {
    buffer: writePixels(buf, idx, out, px.width, px.height, px.bounds),
    affected: [idx], note: `图层 ${idx}「${layerLabel(layer)}」调整「${clean.type}」（破坏性）`,
    meta: { adjustment: clean.type, selection: !!sel }, pixels: true,
  };
}



export function contentAwareFillOp(buf, op) {
  const doc = parseDoc(buf);
  const { idx, layer } = needPixelLayer(doc, op, 'contentAwareFill');
  if (!op.selection) bad('contentAwareFill：必须给 selection（要填掉的区域）', 'selection');
  const px = readLayerRGBA(doc, buf, idx);
  if (!px.rgba) bad(`contentAwareFill：图层 ${idx}「${layerLabel(layer)}」没有像素`, 'target');
  const sel = buildSelection(op.selection, doc.header.width, doc.header.height, 'contentAwareFill.selection');
  const cov = selectionCoverage(sel, px.bounds);
  const mask = new Uint8Array(cov.length);
  let n = 0;
  for (let i = 0; i < cov.length; i++) if (cov[i] >= 128) { mask[i] = 255; n++; }
  if (!n) bad('contentAwareFill：选区与图层没有交集', 'selection');
  if (n === cov.length) bad('contentAwareFill：选区盖住了整个图层，没有可取样的像素', 'selection');
  let out;
  try { out = runCAF(px.rgba, px.width, px.height, mask, { patch: op.patch, samples: op.samples, seed: op.seed ?? 1 }); }
  catch (e) { bad('contentAwareFill：' + (e && e.message || e), 'op'); }
  out = blendByCoverage(px.rgba, out, cov);
  return {
    buffer: writePixels(buf, idx, out, px.width, px.height, px.bounds),
    affected: [idx], note: `图层 ${idx}「${layerLabel(layer)}」内容识别填充 ${n} 像素`,
    meta: { filledPixels: n }, pixels: true,
  };
}



export function fillPixelsOp(buf, op) {
  const doc = parseDoc(buf);
  const { idx, layer } = needPixelLayer(doc, op, 'fillPixels');
  const W = doc.header.width, H = doc.header.height;
  const color = parseColor(op.color, null);
  if (!color) bad('fillPixels：缺少 color（"#rrggbb" 或 [r,g,b]）', 'op');
  const alpha = Math.round(Math.max(0, Math.min(100, op.opacity == null ? 100 : +op.opacity)) * 2.55);
  const sel = buildSelection(op.selection || { type: 'all' }, W, H, 'fillPixels.selection');
  let px = readLayerRGBA(doc, buf, idx);
  
  let tb = px.rgba ? { ...px.bounds } : null;
  if (!op.preserveTransparency) {
    const sb = selectionBounds(sel);
    if (sb && sb.width > 0) {
      const s = { left: Math.max(0, sb.x), top: Math.max(0, sb.y), right: Math.min(W, sb.x + sb.width), bottom: Math.min(H, sb.y + sb.height) };
      tb = tb ? { left: Math.min(tb.left, s.left), top: Math.min(tb.top, s.top), right: Math.max(tb.right, s.right), bottom: Math.max(tb.bottom, s.bottom) } : s;
    }
  }
  if (!tb || !(tb.right > tb.left && tb.bottom > tb.top)) bad('fillPixels：没有可填充的区域', 'selection');
  const w = tb.right - tb.left, h = tb.bottom - tb.top;
  const base = new Uint8ClampedArray(w * h * 4);
  if (px.rgba) for (let y = 0; y < px.height; y++)
    base.set(px.rgba.subarray(y * px.width * 4, (y + 1) * px.width * 4), ((y + px.bounds.top - tb.top) * w + (px.bounds.left - tb.left)) * 4);
  const next = new Uint8ClampedArray(base.length);
  for (let i = 0; i < w * h; i++) {
    const q = i * 4, da = base[q + 3] / 255, sa = alpha / 255;
    if (op.preserveTransparency) {
      next[q] = Math.round(base[q] + (color[0] - base[q]) * sa); next[q + 1] = Math.round(base[q + 1] + (color[1] - base[q + 1]) * sa);
      next[q + 2] = Math.round(base[q + 2] + (color[2] - base[q + 2]) * sa); next[q + 3] = base[q + 3];
      continue;
    }
    const oa = sa + da * (1 - sa);
    next[q + 3] = Math.round(oa * 255);
    for (let c = 0; c < 3; c++) next[q + c] = oa > 0 ? Math.round((color[c] * sa + base[q + c] * da * (1 - sa)) / oa) : 0;
  }
  const out = blendByCoverage(base, next, selectionCoverage(sel, tb));
  return {
    buffer: writePixels(buf, idx, out, w, h, tb),
    affected: [idx], note: `图层 ${idx}「${layerLabel(layer)}」填充 ${'#' + color.map(v => v.toString(16).padStart(2, '0')).join('')}`,
    meta: { bounds: tb }, pixels: true,
  };
}

export function clearPixelsOp(buf, op) {
  const doc = parseDoc(buf);
  const { idx, layer } = needPixelLayer(doc, op, 'clearPixels');
  if (!op.selection) bad('clearPixels：必须给 selection（要清除的区域）', 'selection');
  const px = readLayerRGBA(doc, buf, idx);
  if (!px.rgba) bad(`clearPixels：图层 ${idx}「${layerLabel(layer)}」没有像素`, 'target');
  const sel = buildSelection(op.selection, doc.header.width, doc.header.height, 'clearPixels.selection');
  const cov = selectionCoverage(sel, px.bounds);
  const out = new Uint8ClampedArray(px.rgba);
  for (let i = 0; i < cov.length; i++) if (cov[i]) out[i * 4 + 3] = Math.round(out[i * 4 + 3] * (1 - cov[i] / 255));
  const t = trimAlpha(out, px.width, px.height, px.bounds);
  if (!t) bad('clearPixels：会把整层清空；要删图层请用 deleteLayer', 'op');
  return {
    buffer: writePixels(buf, idx, t.rgba, t.width, t.height, t.bounds),
    affected: [idx], note: `图层 ${idx}「${layerLabel(layer)}」清除选区像素`, meta: { bounds: t.bounds }, pixels: true,
  };
}
