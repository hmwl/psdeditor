












import { applyEdits } from '../core/psd-edit.js';
import { parsePsdDocument, decodeComposite } from '../core/psd-document.js';
import { alphaBounds, crop } from '../core/compose.js';
import { renderWarp } from '../core/warp.js';
import { decodeFilterEffectsEntry, filterEffectsIdOf, parseFilterEffects } from '../core/psd-filter-effects.js';
import { parseSmartObjects, toFoxpsdLayerInfo } from './private/index.js';
import { resolveTarget } from './edit-ops.js';
import { getBackend, decodeImage } from './pipeline.js';
import {
  toU8, toAB, toBuf, bad, parseDoc, pickLayer, layerKind, layerLabel, readLayerRGBA, parseColor,
} from './ops-util.js';
import { listArtboards, renderLayers } from './doc-render.js';
import { growCanvasToArtboards } from './doc-geometry.js';







export function ensureSmartObject(buf, idx, what, warnings = []) {
  let ab = toAB(buf);
  const doc = parseDoc(ab);
  const l = doc.layers[idx], lk = layerKind(l);
  if (lk === 'smartObject') return { buffer: ab, converted: false };
  if (!['raster', 'text', 'shape', 'fill'].includes(lk)) bad(`${what}：图层 ${idx}「${layerLabel(l)}」是 ${lk}，不能转成智能对象`, 'target');
  const px = readLayerRGBA(doc, ab, idx);
  if (!px.rgba) bad(`${what}：图层 ${idx}「${layerLabel(l)}」没有像素`, 'target');
  const r = applyEdits(ab, [{ op: 'convertToSmartObject', index: idx, source: { data: new Uint8Array(px.rgba.buffer, px.rgba.byteOffset, px.rgba.byteLength), width: px.width, height: px.height } }], { verify: false });
  if (lk === 'text') warnings.push('文字图层按像素转成了智能对象：进入智能对象后是位图，不再是可编辑文字');
  return { buffer: r.buffer, converted: true };
}


async function decodeSource(so) {
  const si = so.sourceImage;
  if (!si || !si.bytes || !si.bytes.length) return null;
  const bytes = toU8(si.bytes);
  if (/photoshop/.test(si.mime || '') || (bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53)) {
    
    const ab = toAB(bytes);
    try { const r = await renderLayers(ab); return { data: r.data, width: r.width, height: r.height }; }
    catch {
      const d = parsePsdDocument(ab);
      const img = decodeComposite(d, ab);
      return { data: img.toRGBA(), width: img.width, height: img.height };
    }
  }
  return decodeImage(Buffer.from(bytes));
}


export async function rebakeSmartObject(buf, layerIndex, warnings = [], st = {}) {
  const ab = toAB(buf);
  const t = resolveTarget(ab, { layerIndex });
  if (t.smartObjectIndex < 0) return toBuf(ab);
  const so = parseSmartObjects(ab)[t.smartObjectIndex];
  const li = toFoxpsdLayerInfo(so);
  let img = null;
  try { img = await decodeSource(so); } catch (e) { warnings.push(`「${so.layerName}」内嵌源图解码失败，缓存像素未更新：${e.message}`); }
  if (!img) { if (!warnings.length) warnings.push(`「${so.layerName}」读不到内嵌源图（外链文件？），缓存像素未更新`); return toBuf(ab); }
  const doc = parsePsdDocument(ab);
  const W = doc.header.width, H = doc.header.height;
  const backend = await getBackend('auto');
  let filterInput = null;
  const cache = parseFilterEffects(ab);
  if (cache?.mode === 3) {
    const entry = cache.entries.find(e => e.id === filterEffectsIdOf(so));
    if (entry?.depth === 8) {
      const input = decodeFilterEffectsEntry(entry);
      filterInput = { data: input.rgba, width: input.width, height: input.height, left: input.rect.left, top: input.rect.top };
    }
  }
  const res = renderWarp({ backend, image: img, imageKey: 'rebake' + layerIndex + ':' + Date.now(), layerInfo: li,
    filterInput,
    docWidth: W, docHeight: H, subdiv: 20, supersample: 2, fit: { mode: 'stretch' } });
  const surf = { data: res.data, width: res.width, height: res.height };
  const b = alphaBounds(surf);
  if (!b) { warnings.push(`「${so.layerName}」变形结果全透明，缓存像素未更新`); return toBuf(ab); }
  const c = crop(surf, b);
  const r = applyEdits(ab, [{ op: 'replaceLayerPixels', index: layerIndex, rgba: { data: new Uint8Array(c.data.buffer, c.data.byteOffset, c.data.byteLength), width: c.width, height: c.height }, bounds: b }], { verify: false });
  if (doc.layers[layerIndex]?.mask?.present && (li.deform || (li.deforms && li.deforms.length))) warnings.push(`「${so.layerName}」带图层蒙版：蒙版没有随变形移动`);
  st.ok = true;
  return toBuf(r.buffer);
}

const pt = (p, where) => {
  const x = Array.isArray(p) ? +p[0] : +(p && p.x), y = Array.isArray(p) ? +p[1] : +(p && p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) bad(`${where} 必须是 [x, y]`, 'op');
  return { x, y };
};


function normRect(r, where) {
  if (!r || typeof r !== 'object') bad(`${where} 缺失：{ x, y, width, height } 或 { left, top, right, bottom }`, 'op');
  let left, top, right, bottom;
  if (r.width != null || r.w != null) { left = +r.x || 0; top = +r.y || 0; right = left + +(r.width ?? r.w); bottom = top + +(r.height ?? r.h); }
  else { left = +r.left; top = +r.top; right = +r.right; bottom = +r.bottom; }
  const out = { left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom) };
  if (!Object.values(out).every(Number.isFinite) || out.right <= out.left || out.bottom <= out.top) bad(`${where} 非法：宽高必须 > 0`, 'op');
  return out;
}

export async function createArtboardOp(buf, op) {
  let ab = toAB(buf);
  const doc = parseDoc(ab);
  const n = listArtboards(ab).length + 1;
  const name = typeof op.name === 'string' && op.name ? op.name : `画板 ${n}`;
  let rect = op.rect ? normRect(op.rect, 'createArtboard.rect') : null;
  const indices = Array.isArray(op.indices) ? op.indices.map((x, k) => pickLayer(doc, { index: x }, `createArtboard.indices[${k}]`)) : null;
  if (indices && indices.some(i => doc.layers[i].groupType === 3)) bad('createArtboard：分隔记录不能放进画板，请选图层或组头', 'op');
  if (!rect) {
    if (!indices || !indices.length) bad('createArtboard：没有 indices 时必须给 rect', 'op');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of indices) { const b = doc.layers[i].bounds; if (b.right > b.left && b.bottom > b.top) { x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); } }
    if (!(x1 > x0)) bad('createArtboard：选中的图层没有可见内容，定不出画板范围（请给 rect）', 'op');
    rect = { left: x0, top: y0, right: x1, bottom: y1 };
  }
  const bg = op.backgroundType ?? 1;
  const abOp = header => ({ op: 'setArtboard', index: header, rect, presetName: op.presetName || `自定 ${rect.right - rect.left}×${rect.bottom - rect.top}`,
    backgroundType: bg, ...(op.color != null ? { color: '#' + parseColor(op.color).map(v => v.toString(16).padStart(2, '0')).join('') } : {}) });
  let header;
  if (indices && indices.length) {
    const r1 = applyEdits(ab, [{ op: 'groupLayers', indices: [...indices].sort((a, b) => a - b), name }], { verify: false });
    header = (r1.results && r1.results[0] && r1.results[0].headerIndex) ?? Math.max(...indices) + 2;
    ab = applyEdits(r1.buffer, [abOp(header)], { verify: false }).buffer;
  } else {
    const at = doc.layers.length;
    header = at + 1;
    ab = applyEdits(ab, [{ op: 'newGroup', at, name }, abOp(header)], { verify: false }).buffer;
  }
  const warnings = [];
  let buffer = toBuf(ab), grown = null;
  
  if (op.autoSizeCanvas !== false) { const g = await growCanvasToArtboards(buffer); buffer = g.buffer; grown = g.grown; warnings.push(...g.warnings); }
  return {
    buffer, affected: [header], warnings, structural: true, pixels: !!grown, docChanged: !!grown,
    note: `新建画板「${name}」${rect.right - rect.left}×${rect.bottom - rect.top}${indices ? `（装入 ${indices.length} 个图层）` : ''}${grown ? `，画布撑大到 ${grown.width}×${grown.height}` : ''}`,
    meta: { header, name, rect, canvasGrown: grown },
  };
}
