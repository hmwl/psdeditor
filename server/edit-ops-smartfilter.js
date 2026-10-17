
















import { applyEdits } from '../core/psd-edit.js';
import { parseSmartObjects, smartObjectFragment, replacePlacedBlocks } from '../core/index.js';
import { applyFilter, normalizeFilterParams, FILTERS } from '../core/filters.js';
import { renderLiquifyMesh } from '../core/liquify-mesh.js';
import { resolveSmartFilters, writebackSmartFilters, buildSoLdRewrite, parseSmartObjects as parseSOFull } from './private/index.js';
import { resolveTarget, EditOpError } from './edit-ops.js';
import { toAB, toBuf, toU8, bad, parseDoc, pickLayer, readLayerRGBA, layerLabel } from './ops-util.js';
import { padLayer, trimAlpha, fadeMix } from './edit-ops-pixel.js';
import { ensureSmartObject, rebakeSmartObject } from './edit-ops-create.js';

import { applyGalleryStack, decodeGalleryDescriptor, galleryFilterFXEntry } from '../core/filter-gallery.js';




import { SMART_FILTERS, buildSmartFilterEntry as buildEntryCore, decodeFltr as decodeFltrCore, BLEND_MODES, blendOptionsOf } from '../core/smart-filter-spec.js';
import { blendStep } from '../core/smart-filter-render.js';
export { SMART_FILTERS };
const BLEND_ENUM = Object.fromEntries(BLEND_MODES.map(m => [m.ids[m.ids.length - 1], m.key]));


export function buildSmartFilterEntry(kind, params, o = {}) {
  if (o.mode != null && !BLEND_ENUM[o.mode] && !BLEND_MODES.some(m => m.ids.includes(o.mode)))
    bad(`addSmartFilter：mode 只能是 ${Object.keys(BLEND_ENUM).join(' / ')}`, 'op');
  try { return buildEntryCore(kind, params, { ...o, modeValue: o.mode && !BLEND_MODES[0].ids.includes(o.mode) ? o.mode : undefined }); }
  catch (e) { bad('addSmartFilter：' + (e && e.message || e), 'op'); }
}
const decodeFltr = decodeFltrCore;

function insertFilter(desc, entry) {
  const fx0 = desc['filterFX'];
  if (fx0 && Array.isArray(fx0['filterFXList'])) { fx0['filterFXList'] = [...fx0['filterFXList'], entry]; return desc; }
  const fx = { __name: '', __classID: 'filterFXStyle',
    enab: true, validAtPosition: true, filterMaskEnable: true, filterMaskLinked: false, filterMaskExtendWithWhite: true,
    filterFXList: [entry] };
  const out = {};
  let put = false;
  for (const k of Object.keys(desc)) {
    if (k === 'filterFX') continue;
    out[k] = desc[k];
    if (k === 'Rslt') { out.filterFX = fx; put = true; }            
  }
  if (!put) out.filterFX = fx;
  return out;
}

function soOf(ab, target) {
  const t = resolveTarget(ab, target, { numberMeans: 'smartObject' });
  if (t.smartObjectIndex < 0) throw new EditOpError(`图层 ${t.layerIndex}「${t.layerName}」不是智能对象，没有智能滤镜`, 'target');
  return { t, so: parseSmartObjects(ab)[t.smartObjectIndex] };
}
const soDescriptor = (ab, si) => {
  const so = parseSOFull(ab)[si];
  const blk = so && so.placedBlocks.find(b => b.key === 'SoLd' && b.placed);
  return { so, desc: blk ? blk.placed.descriptor : null };
};



function runFilterOnLayer(px, kind, params, opacity, W, H, mode) {
  const mix = (a, b, k) => (mode && mode !== 'norm' ? blendStep(a, b, mode, k) : fadeMix(a, b, k));
  if (kind === 'filterGallery') {
    
    let next = applyGalleryStack(px.rgba, px.width, px.height, params.layers || [], { fg: params.fg, bg: params.bg });
    next = mix(px.rgba, next, opacity);
    return { rgba: next, width: px.width, height: px.height, bounds: px.bounds };
  }
  if (kind === 'liquify') {
    
    if (!params.mesh) return null;
    const next = mix(px.rgba, renderLiquifyMesh(px.rgba, px.width, px.height, params.mesh, px.bounds), opacity);
    return { rgba: next, width: px.width, height: px.height, bounds: px.bounds };
  }
  const f = FILTERS[kind];
  let pad = 0;
  for (const p of f.params) if (p.spatial && Number.isFinite(+params[p.key])) pad = Math.max(pad, Math.ceil(+params[p.key] * 3));
  pad = Math.min(pad, 512);
  const base = pad ? padLayer(px.rgba, px.width, px.height, px.bounds, pad, W, H) : px;
  let next = applyFilter(kind, base.rgba, base.width, base.height, normalizeFilterParams(kind, params));
  next = mix(base.rgba, next, opacity);
  const t = trimAlpha(next, base.width, base.height, base.bounds);
  return t ? { rgba: t.rgba, width: t.width, height: t.height, bounds: t.bounds } : null;
}





export async function rerenderSmartFilters(buf, layerIndex, warnings = []) {
  let ab = toAB(buf);
  const t = resolveTarget(ab, { layerIndex });
  if (t.smartObjectIndex < 0) return { buffer: toBuf(ab), rendered: false };
  const { desc } = soDescriptor(ab, t.smartObjectIndex);
  const fx = desc && desc.filterFX;
  const list = (fx && Array.isArray(fx.filterFXList)) ? fx.filterFXList : [];
  const styleOn = !fx || fx.enab !== false;
  const steps = [];
  for (const [i, e] of list.entries()) {
    const id = e.filterID, cls = e.Fltr && e.Fltr.__classID;
    if (id === 714 || id === 687 || cls === 'perspectiveWarpTransform' || cls === 'rigidTransform') continue;   
    if (!styleOn || e.enab === false) continue;
    const d = decodeFltr(e.Fltr);
    if (!d) { warnings.push(`智能滤镜第 ${i} 条「${e['Nm  '] || cls}」服务端没有对应的像素内核，缓存栅格未重渲染（PS 打开时会重新求值）`); return { buffer: toBuf(ab), rendered: false }; }
    const opc = e.blendOptions && e.blendOptions.Opct ? +(e.blendOptions.Opct.value ?? e.blendOptions.Opct) : 100;
    const mode = blendOptionsOf(e).mode;
    if (d.kind === 'filterGallery') { const c = (o, k) => (o && o[k] != null ? +o[k] : null); const col = o => o && c(o, 'Rd  ') != null ? [c(o, 'Rd  '), c(o, 'Grn '), c(o, 'Bl  ')] : null;
      d.params.fg = col(e.FrgC) || [0, 0, 0]; d.params.bg = col(e.BckC) || [255, 255, 255]; }
    steps.push({ ...d, opacity: opc, mode });
  }
  
  const w0 = [], st = {};
  const baked = await rebakeSmartObject(ab, layerIndex, w0, st);
  if (!st.ok) {
    if (steps.length) warnings.push(...w0.map(w => w + '；智能滤镜效果没有重渲染'));
    return { buffer: toBuf(ab), rendered: false };
  }
  ab = toAB(baked);
  warnings.push(...w0);
  if (!steps.length) return { buffer: toBuf(ab), rendered: true };
  const doc = parseDoc(ab);
  let px = readLayerRGBA(doc, ab, layerIndex);
  if (!px.rgba) return { buffer: toBuf(ab), rendered: true };
  for (const s of steps) { const r = runFilterOnLayer(px, s.kind, s.params, s.opacity, doc.header.width, doc.header.height, s.mode); if (r) px = r; }
  const r = applyEdits(ab, [{ op: 'replaceLayerPixels', index: layerIndex, rgba: { data: new Uint8Array(px.rgba.buffer, px.rgba.byteOffset, px.rgba.byteLength), width: px.width, height: px.height }, bounds: px.bounds }], { verify: false });
  return { buffer: toBuf(r.buffer), rendered: true };
}




export function listSmartFilters(buf, target) {
  const ab = toAB(buf);
  const { t, so } = soOf(ab, target);
  return { target: { layerIndex: t.layerIndex, layerName: t.layerName, smartObjectIndex: t.smartObjectIndex }, ...resolveSmartFilters(smartObjectFragment(ab, so)) };
}

export async function addSmartFilterOp(buf, op) {
  let ab = toAB(buf);
  const doc = parseDoc(ab);
  const idx = pickLayer(doc, op, 'addSmartFilter');
  const layer = doc.layers[idx];
  const kind = op.filter || op.kind;
  if (kind === 'filterGallery') return addGallerySmartFilterOp(buf, op);
  if (!SMART_FILTERS[kind]) bad(`addSmartFilter：「${kind}」还不能作为智能滤镜；可用：${Object.keys(SMART_FILTERS).join(' ')}（其余滤镜请用 applyFilter 直接作用于像素）`, 'op');
  if (kind === 'liquify') bad('addSmartFilter：液化智能滤镜的位移网格只能在编辑器的液化工作区里画（接口不接受网格数据）', 'op');
  let params;
  try { params = normalizeFilterParams(kind, op.params || {}); } catch (e) { bad('addSmartFilter：' + e.message, 'op'); }
  const warnings = [];
  
  const ens = ensureSmartObject(ab, idx, 'addSmartFilter', warnings);
  ab = ens.buffer;
  const t = resolveTarget(ab, { layerIndex: idx });
  const so = parseSOFull(ab)[t.smartObjectIndex];
  const entry = buildSmartFilterEntry(kind, params, { opacity: op.opacity, mode: op.mode, enabled: op.enabled });
  let blocks;
  try { blocks = buildSoLdRewrite(so, desc => insertFilter(desc, entry)); }
  catch (e) { bad('addSmartFilter：写智能滤镜描述符失败：' + (e && e.message || e), 'writeback'); }
  const pre = parseDoc(ab), prePx = readLayerRGBA(pre, ab, idx);
  const coreSo = parseSmartObjects(ab)[t.smartObjectIndex];
  let out = replacePlacedBlocks(ab, coreSo, blocks);
  out = out instanceof ArrayBuffer ? out : toAB(toU8(out));
  const rw = [];
  let rr = await rerenderSmartFilters(out, idx, rw);
  let buffer = rr.buffer;
  if (!rr.rendered && prePx.rgba && op.enabled !== false) {
    
    const r = runFilterOnLayer(prePx, kind, params, op.opacity == null ? 100 : +op.opacity, pre.header.width, pre.header.height);
    if (r) buffer = toBuf(applyEdits(toAB(buffer), [{ op: 'replaceLayerPixels', index: idx, rgba: { data: new Uint8Array(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength), width: r.width, height: r.height }, bounds: r.bounds }], { verify: false }).buffer);
    warnings.push('在现有缓存栅格上叠加了这条滤镜的效果（其余智能滤镜没有重算）');
  } else warnings.push(...rw);
  return {
    buffer, affected: [idx], warnings, pixels: true, structural: ens.converted,
    note: `图层 ${idx}「${layerLabel(layer)}」${ens.converted ? '转为智能对象并' : ''}新增智能滤镜「${SMART_FILTERS[kind].label.replace(/\.\.\.$/, '')}」`,
    meta: { filter: kind, classID: SMART_FILTERS[kind].cls, params, converted: ens.converted, rerendered: rr.rendered },
  };
}

export async function setSmartFiltersOp(buf, op) {
  const ab = toAB(buf);
  const { t, so } = soOf(ab, op.target ?? (op.index != null ? { layerIndex: op.index } : undefined));
  let out;
  try { out = writebackSmartFilters(smartObjectFragment(ab, so), op.edits ?? op.edit); }
  catch (e) { throw new EditOpError('智能滤镜写回失败：' + (e && e.message || e), 'edit'); }
  const next = replacePlacedBlocks(ab, so, out.blocks);
  const warnings = [...(out.warnings || [])];
  const rr = await rerenderSmartFilters(next instanceof ArrayBuffer ? next : toU8(next), t.layerIndex, warnings);
  return {
    buffer: rr.buffer, affected: [t.layerIndex], warnings,
    note: `智能对象「${t.layerName}」智能滤镜：${(out.changed || []).slice(0, 6).join('、') || '无变化'}`,
    meta: { count: out.count, changed: out.changed, rerendered: rr.rendered }, pixels: rr.rendered,
  };
}



async function addGallerySmartFilterOp(buf, op) {
  let ab = toAB(buf);
  const doc = parseDoc(ab);
  const idx = pickLayer(doc, op, 'addSmartFilter');
  const layer = doc.layers[idx];
  const p = op.params || {};
  let layers;
  try { layers = (p.layers || []).map(l => ({ id: l.id, params: l.params || {}, visible: l.visible !== false })); galleryFilterFXEntry(layers); }
  catch (e) { bad('addSmartFilter：滤镜库参数不对：' + (e && e.message || e), 'op'); }
  if (!layers.length) bad('addSmartFilter：滤镜库至少要一个效果图层（params.layers）', 'op');
  const fg = Array.isArray(p.fg) ? p.fg : [0, 0, 0], bg = Array.isArray(p.bg) ? p.bg : [255, 255, 255];
  const warnings = [];
  const ens = ensureSmartObject(ab, idx, 'addSmartFilter', warnings);
  ab = ens.buffer;
  const t = resolveTarget(ab, { layerIndex: idx });
  const so = parseSOFull(ab)[t.smartObjectIndex];
  const entry = galleryFilterFXEntry(layers, { opacity: op.opacity, mode: op.mode, enabled: op.enabled, fg, bg });
  let blocks;
  try { blocks = buildSoLdRewrite(so, desc => insertFilter(desc, entry)); }
  catch (e) { bad('addSmartFilter：写智能滤镜描述符失败：' + (e && e.message || e), 'writeback'); }
  const pre = parseDoc(ab), prePx = readLayerRGBA(pre, ab, idx);
  const coreSo = parseSmartObjects(ab)[t.smartObjectIndex];
  let out = replacePlacedBlocks(ab, coreSo, blocks);
  out = out instanceof ArrayBuffer ? out : toAB(toU8(out));
  const rw = [];
  const rr = await rerenderSmartFilters(out, idx, rw);
  let buffer = rr.buffer;
  if (!rr.rendered && prePx.rgba && op.enabled !== false) {
    const r = runFilterOnLayer(prePx, 'filterGallery', { layers, fg, bg }, op.opacity == null ? 100 : +op.opacity, pre.header.width, pre.header.height);
    buffer = toBuf(applyEdits(toAB(buffer), [{ op: 'replaceLayerPixels', index: idx, rgba: { data: new Uint8Array(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength), width: r.width, height: r.height }, bounds: r.bounds }], { verify: false }).buffer);
    warnings.push('在现有缓存栅格上叠加了滤镜库的效果（其余智能滤镜没有重算）');
  } else warnings.push(...rw);
  return { buffer, affected: [idx], warnings, pixels: true, structural: ens.converted,
    note: `图层 ${idx}「${layerLabel(layer)}」${ens.converted ? '转为智能对象并' : ''}新增智能滤镜「滤镜库」（${layers.length} 个效果图层）`,
    meta: { filter: 'filterGallery', classID: 'GEfc', layers, converted: ens.converted, rerendered: rr.rendered } };
}
