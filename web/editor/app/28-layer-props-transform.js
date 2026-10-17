




import './27-gradient-editor.js';   
import { isShapeLayer, pathBounds } from '../property-panel.js';
import { shell } from '../shell.js';
import { $, BLEND_KEYS, BLEND_LABELS, EDIT, ensureLazy, selectionBounds } from './01-boot.js';
import {
  TInputs, aspectLock, doc, docH, docName, docStack, docW, layerDeletes, layerEdits, layerRenames,
  layerTransforms, layerTree, li, meshEditInProgress, meshFlipState, meshRotState, origBuffer, pushHistory,
  selection, set_layerReorder, soLayerIndex, sos, textCrops,
} from './02-doc-state.js';
import {
  actRecord, docHistLock, pushDocHistory, set_docHistLock, structuralBegin, structuralDone, updateUndoButtons,
} from './03-history.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { commit, editablePoints, layerSelBBox, mapEditable, quadBBox } from './06-view-zoom-move.js';
import { moveLockWhy, sayLocked, tfState } from './19-free-transform.js';
import { duplicateLayerBlockUI, refreshAll } from './20-snap-smart-object.js';
import { defaultTargetLayer, initDocument } from './21-load-document.js';
import { exitSO, matchLayer } from './22-deform-tools.js';
import {
  hideAltClipLine, layerCanvasCache, layerOrderView, renderLayerPanel, selLayer, selLayers, set_selLayer,
  thumbCache,
} from './23-layers-panel.js';
import {
  commitLayerOps, dropLayerOp, effFillOpacity, findLayerOp, humanEditError, putLayerOp, setSingleOp,
  syncNewAdjMenu,
} from './24-layer-ops-queue.js';
import { groupSelectedUI } from './26-layer-create.js';
import { setLayerBlend, setLayerOpacity } from './27-gradient-editor.js';
import { renderStaticLayers } from './30-render.js';
import { PAINT_TOOLS, docTool, moveOpts, syncMoveBar } from './31-selection-brush.js';
import { abOpts, artboardOfLayer, docArtboards } from './35-artboard.js';
import { abRelayoutByOrder, frameRectOfLayer } from './36-clipboard-frame.js';
import { autoTargetMask } from './38-brush-engine.js';
import { syncBrushPanel } from './40-options-bar-wiring.js';
import { clonePathSubpaths, effPathSubpaths, pathSubpathsEq, readVectorPath, set_pathModel } from './44-vector-path.js';
import { drawGizmo } from './46-smart-filter-panel.js';
import { buildPsdBuffer } from './48-info-export.js';



const hdrBlend = $('#hdrBlend'), hdrOpacity = $('#hdrOpacity'), hdrFill = $('#hdrFill');
export const mkEl = (tag, props = {}) => Object.assign(document.createElement(tag), props);
export function syncLayerControls(){
  syncNewAdjMenu();
  if (docTool === 'move') { try { syncMoveBar(); } catch {} }   
  if (PAINT_TOOLS.has(docTool)) { autoTargetMask(); syncBrushPanel(); }   
  const l = layerTree && layerTree.flat && layerTree.flat[selLayer];
  if (!l || layerDeletes.has(l.index)) {
    hdrBlend.disabled = true; hdrOpacity.disabled = true;
    if (hdrFill) hdrFill.disabled = true;
    hdrBlend.innerHTML = '';
    hdrBlend.appendChild(mkEl('option', { textContent: '未选中图层', disabled: true, selected: true }));
    return;
  }
  hdrBlend.disabled = false; hdrOpacity.disabled = false;
  if (hdrFill) { hdrFill.disabled = false; hdrFill.value = Math.round(effFillOpacity(l.index, l) / 2.55); }
  const ed = layerEdits[l.index] || {};
  const cur = ed.blendKey != null ? ed.blendKey : (l.blendKey || (l.isGroup ? 'pass' : 'norm'));
  const keys = l.isGroup ? ['pass', ...BLEND_KEYS] : BLEND_KEYS.slice();
  hdrBlend.innerHTML = '';
  for (const k of keys) hdrBlend.appendChild(mkEl('option', { value: k, textContent: BLEND_LABELS[k] || k }));
  if (!keys.includes(cur)) hdrBlend.appendChild(mkEl('option', { value: cur, textContent: '[' + String(cur).trim() + ']' }));
  hdrBlend.value = cur;
  hdrOpacity.value = Math.round((ed.opacity != null ? ed.opacity : (l.opacity ?? 255)) / 2.55);
}

export function batchTargets(idx){
  return selLayers.size > 1 && selLayers.has(idx) ? [...selLayers] : [idx];
}
hdrBlend.onchange = () => {
  if (selLayer < 0) return;
  pushDocHistory();
  for (const i of batchTargets(selLayer)) setLayerBlend(i, hdrBlend.value);
  actRecord('layerProps', { mode: hdrBlend.value });
  syncLayerControls();
};
hdrOpacity.onchange = () => {
  if (selLayer < 0) return;
  const v = Math.max(0, Math.min(100, Math.round(+hdrOpacity.value || 0)));
  pushDocHistory();
  for (const i of batchTargets(selLayer)) setLayerOpacity(i, Math.round(v * 2.55));
  actRecord('layerProps', { opacity: v });
  syncLayerControls();
};


if (hdrFill) hdrFill.onchange = () => {
  if (selLayer < 0) return;
  const pct = Math.max(0, Math.min(100, Math.round(+hdrFill.value || 0)));
  hdrFill.value = pct;
  let ok = true;
  for (const i of batchTargets(selLayer)) {
    const L = layerTree && layerTree.flat && layerTree.flat[i];
    if (!L) continue;
    const orig = L.fillOpacity != null ? L.fillOpacity : 255;
    const v = pct === Math.round(orig / 2.55) ? orig : Math.round(pct * 2.55);
    if (!setSingleOp(i, { op: 'setFillOpacity', index: i, fillOpacity: v }, v === orig)) ok = false;
  }
  
  if (!ok) { const L = layerTree && layerTree.flat && layerTree.flat[selLayer]; if (L) hdrFill.value = Math.round(effFillOpacity(selLayer, L) / 2.55); }
  syncLayerControls();
};
export function moveLayer(i, dir){
  const view = layerOrderView(), source = view.nodes[i];
  if (!source || source.divider || !source.block) return false;
  const own = source.block.visualIds, start = view.visible.indexOf(own[0]);
  const target = dir > 0 ? view.visible[start - 1] : view.visible[start + own.length];
  
  return target == null ? false : moveLayerTo(i, target, dir < 0);
}

export let dragRowIndex = -1;           
export function set_dragRowIndex(v) { return (dragRowIndex = v); }   
export let dropOpenTimer = 0;           
export function set_dropOpenTimer(v) { return (dropOpenTimer = v); }   




export function moveLayerTo(from, to, after = false, into = false){
  if (from === to || !layerTree || !layerTree.flat) return false;
  const view = layerOrderView(), source = view.nodes[from], target = view.nodes[to];
  if (!source || !target || source.divider || target.divider || !source.block || !target.block) return false;
  const sourceSet = new Set(source.block.ids);
  
  
  
  if (sourceSet.has(target.block.ids[0])) return false;
  const rest = view.order.filter(i => !sourceSet.has(i));       
  
  
  const rawIds = target.group && into
    ? [target.index]
    : [target.block.ids[0]];
  const targetStart = rest.indexOf(rawIds[0]);
  if (targetStart < 0) return false;
  
  

  const targetLen = target.block.ids.filter(i => !sourceSet.has(i)).length;
  const insertAt = target.group && into ? targetStart
    : after ? targetStart : targetStart + targetLen;
  const next = [...rest.slice(0, insertAt), ...source.block.ids, ...rest.slice(insertAt)];
  if (next.every((v, i) => v === view.order[i])) return false;
  pushDocHistory();
  set_layerReorder(next);
  renderLayerPanel();
  renderStaticLayers();          
  

  if (source.group && !abOpts.keepRel && docArtboards().some(a => a.index === from)) setTimeout(() => { abRelayoutByOrder(); }, 0);
  return true;
}






export async function deleteLayerForReal(idx){
  
  
  return deleteLayersReal([idx]);
}






export async function deleteLayersReal(picks){
  if (li || !doc || !origBuffer) return false;
  actRecord('deleteLayer', {});
  const view = layerOrderView();
  const targets = new Set();
  let skippedBg = 0;
  for (const i of picks) {
    const node = view.nodes[i];
    if (!node) continue;
    if (node.divider && node.header == null) continue;          
    const owner = node.group ? i : node.divider ? node.header : i;
    const on = view.nodes[owner];
    const ids = on && on.group && on.block ? on.block.ids : [i];
    if (ids.length === 1 && isBackgroundLayer(i)) { skippedBg++; continue; }   
    for (const k of ids) targets.add(k);
  }
  if (!targets.size) {
    $('#notice').textContent = skippedBg ? '背景图层不能删除（PS 同）。' : '没有可删除的图层。';
    return false;
  }
  if (doc.layers.length - targets.size < 1) { $('#notice').textContent = '不能把图层全删光。'; return false; }
  if (!await ensureLazy(EDIT, '删除图层')) return false;
  $('#err').textContent = '';
  const names = [...targets]
    .filter(k => { const n = layerTree && layerTree.flat && layerTree.flat[k]; return !(n && n.groupType === 3); })
    .map(k => layerRenames[k] || ((layerTree.flat[k] || {}).name) || ('图层 ' + k));
  try {
    const prev = structuralBegin();
    for (const k of targets) layerDeletes.add(k);               
    if (li && targets.has(soLayerIndex)) exitSO();
    const built = await buildPsdBuffer({ fast: true });
    await initDocument(built.buf, docName, { nested: docStack.length > 0 });
    

    const lo = Math.min(...targets);
    const survivors = view.order.filter(i => !targets.has(i));
    const below = survivors.filter(i => i < lo);
    const pickOld = below.length ? below[below.length - 1] : survivors[0];
    const dec = s => s - [...targets].filter(t => t < s).length;
    selLayers.clear();
    set_selLayer(defaultTargetLayer(pickOld == null ? -1 : dec(pickOld)));
    refreshAll(false);
    structuralDone(prev, '删除图层');
    const msg = names.length === 1
      ? `已删除「${names[0]}」`
      : `已删除 ${names.length} 个图层（${names.slice(0, 3).join('、')}${names.length > 3 ? ' 等' : ''}）`;
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    $('#err').textContent = '删除图层没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}


function deleteTargetPicks(){
  if (selLayer < 0) return [];
  return batchTargets(selLayer);
}
export async function deleteSelectedLayersUI(){
  const picks = deleteTargetPicks();
  if (!picks.length) { $('#notice').textContent = '先选一个图层。'; return false; }
  return deleteLayersReal(picks);
}






export function groupPicksUI(picks){
  if (!picks || !picks.length) return;
  selLayers.clear(); for (const i of picks) selLayers.add(i);
  set_selLayer(picks[picks.length - 1]);
  renderLayerPanel();
  groupSelectedUI();
}

export const LAYER_DROP_CLASS = 'lf-drop';
export function clearLayerDropHl(){ for (const el of document.querySelectorAll('.' + LAYER_DROP_CLASS)) el.classList.remove(LAYER_DROP_CLASS); }
export function wireLayerFootDrops(){
  const bind = (el, kind) => {
    if (!el || el.dataset.dropKind) return; el.dataset.dropKind = kind;
    
    const allow = () => dragRowIndex >= 0 && !!doc && !li;
    el.addEventListener('dragover', e => {
      if (!allow()) return;
      e.preventDefault(); e.stopPropagation();
      


      try {
        const ea = String(e.dataTransfer.effectAllowed || '');
        const copyOk = ea === '' || ea === 'all' || ea === 'uninitialized' || /copy/i.test(ea);
        e.dataTransfer.dropEffect = kind === 'copy' && copyOk ? 'copy' : 'move';
      } catch {  }
      el.classList.add(LAYER_DROP_CLASS);
    });
    el.addEventListener('dragleave', () => el.classList.remove(LAYER_DROP_CLASS));
    el.addEventListener('drop', e => {
      if (!allow()) return;
      e.preventDefault(); e.stopPropagation();
      clearLayerDropHl();
      const idx = dragRowIndex, picks = batchTargets(idx);
      dragRowIndex = -1;
      hideAltClipLine();
      if (kind === 'delete') void deleteLayersReal(picks);
      else if (kind === 'copy') duplicateLayerBlockUI(idx);
      else if (kind === 'group') void groupPicksUI(picks);
    });
  };
  bind(document.querySelector('.layer-foot .lf-btn[data-action="layer.delete"]'), 'delete');
  bind(document.getElementById('newLayerBtn'), 'copy');
  bind(document.querySelector('.layer-foot .lf-btn[data-action="layer.newGroup"]'), 'group');
  
  document.addEventListener('dragend', clearLayerDropHl, true);
}
export function toggleLayerDelete(idx){
  
  const batch = batchTargets(idx);
  if (batch.length > 1) {
    pushDocHistory('排队删除图层');
    let touchedSO = false;
    for (const i of batch) {
      const node = layerOrderView().nodes[i];
      const ids = node && node.group ? node.block.ids : [i];
      const all = ids.every(k => layerDeletes.has(k));
      for (const k of ids) { if (all) layerDeletes.delete(k); else layerDeletes.add(k); }
      if (ids.includes(soLayerIndex)) touchedSO = true;
    }
    if (touchedSO) { exitSO(); return; }
    renderLayerPanel(); renderStaticLayers(); updateUndoButtons();
    return;
  }
  pushDocHistory(layerDeletes.has(idx) ? '恢复图层' : '排队删除图层');
  if (layerDeletes.has(idx)) { layerDeletes.delete(idx); $('#notice').textContent = ''; }
  else {
    layerDeletes.add(idx);
    $('#notice').textContent = '已排队删除（导出时不写它）：再点一次「删除」就立刻从文档移除；右键可恢复。';
    if (idx === soLayerIndex) { exitSO(); return; }
  }
  renderLayerPanel();
  renderStaticLayers();
}










export function isMeshTransform(idx){ return !!(li && idx === soLayerIndex); }
export function meshBBox(){
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of editablePoints()) { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; }
  return { x: a, y: b, w: c - a, h: d - b };
}
export function transformBase(idx){
  if (textCrops[idx]) { const b = textCrops[idx].bounds; return { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top }; }
  const b = doc.layers[idx].bounds;
  return { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top };
}
export function ensureLayerTransform(idx){
  if (!layerTransforms[idx]) { const b = transformBase(idx); layerTransforms[idx] = { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0, flipX: false, flipY: false }; }
  return layerTransforms[idx];
}

export function transformChanged(idx){
  const t = layerTransforms[idx]; if (!t) return null;
  const b = transformBase(idx);
  
  
  if (!t.quad && !t.rot && !t.flipX && !t.flipY && t.w === 0 && t.h === 0 && (b.w || b.h)) { t.x = b.x; t.y = b.y; t.w = b.w; t.h = b.h; return null; }
  return (t.quad || t.x !== b.x || t.y !== b.y || t.w !== b.w || t.h !== b.h || t.rot || t.flipX || t.flipY) ? t : null;
}
export function getTransformValues(idx){
  if (tfState?.idx === idx && tfState.vector) return tfState.vector.frame;
  if (isMeshTransform(idx)) {
    const b = meshBBox();
    const f = meshFlipState[idx] || {};
    return { x: b.x, y: b.y, w: b.w, h: b.h, rot: meshRotState[idx] || 0, flipX: !!f.x, flipY: !!f.y };
  }
  return ensureLayerTransform(idx);
}
export function getPropertyTransformValues(idx){
  if (isShapeLayer(layerTree?.flat[idx])) {
    const bounds = pathBounds(effPathSubpaths(idx));
    if (bounds) return { ...bounds, rot: 0, flipX: false, flipY: false,
      ...findLayerOp(idx, 'setVectorMaskPath')?.propertyTransform };
  }
  const v = getTransformValues(idx);
  if (layerTree?.flat[idx]?.isSmartObject) {
    const rot = smartPropertyBaseRotation(idx) + (v.rot || 0);
    return { ...v, rot: ((rot + 540) % 360) - 180 };
  }
  return v;
}
export function smartPropertyBaseRotation(idx){
  const so = sos.find(s => matchLayer(s) === idx), q = so?.info?.layerInfo?.placementQuad;
  return q?.length === 4 ? Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) * 180 / Math.PI : 0;
}
export function setShapePropertyTransform(idx, patch){
  if (sayLocked(moveLockWhy(idx))) return false;
  const source = effPathSubpaths(idx), base = readVectorPath(idx);
  if (!source || !base || base.error) return false;
  const before = getPropertyTransformValues(idx), after = { ...before, ...patch };
  const originalBounds = pathBounds(base.subpaths);
  for (const key of ['x', 'y', 'w', 'h']) {
    if (patch[key] != null && patch[key] === Math.round(originalBounds[key])) after[key] = originalBounds[key];
  }
  if (Object.values(patch).some(v => typeof v === 'number' && !Number.isFinite(v)) || after.w < 0 || after.h < 0) return false;
  const sx = (before.w ? after.w / before.w : 1) * (before.flipX !== after.flipX ? -1 : 1);
  const sy = (before.h ? after.h / before.h : 1) * (before.flipY !== after.flipY ? -1 : 1);
  const angle = (after.rot - before.rot) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const subpaths = clonePathSubpaths(source);
  for (const sub of subpaths) for (const knot of sub.knots) for (const key of ['anchor', 'in', 'out']) {
    const p = knot[key], x = (p[0] - before.x - before.w / 2) * sx, y = (p[1] - before.y - before.h / 2) * sy;
    knot[key] = [after.x + after.w / 2 + x*cos - y*sin, after.y + after.h / 2 + x*sin + y*cos];
  }
  const same = pathSubpathsEq(subpaths, base.subpaths);
  set_pathModel(null); delete thumbCache[idx];
  return commitLayerOps(idx, () => {
    if (same) dropLayerOp(idx, 'setVectorMaskPath');
    else putLayerOp(idx, { op: 'setVectorMaskPath', index: idx, units: 'pixel', subpaths,
      propertyTransform: { rot: after.rot, flipX: after.flipX, flipY: after.flipY } });
  });
}
export function alignPropertyLayers(how, alignTo = 'selection'){
  const picks = selLayers.size > 1 ? [...selLayers] : [selLayer];
  
  const selectedBounds = alignTo === 'selection' && !selection && picks.length > 1
    ? picks.map(i => isShapeLayer(layerTree?.flat[i]) ? getPropertyTransformValues(i) : layerSelBBox(i))
      .filter(b => b && b.w > 0 && b.h > 0) : [];
  const union = selectedBounds.length ? (() => {
    const x = Math.min(...selectedBounds.map(b => b.x)), y = Math.min(...selectedBounds.map(b => b.y));
    return { x, y, w: Math.max(...selectedBounds.map(b => b.x + b.w)) - x,
      h: Math.max(...selectedBounds.map(b => b.y + b.h)) - y };
  })() : null;
  for (const idx of picks) {
    const ab = alignTo === 'canvas' ? artboardOfLayer(idx) : null;
    const target = union || (alignTo === 'canvas'
      ? ab && ab.index !== idx ? { ...ab.rect } : { x: 0, y: 0, w: docW, h: docH }
      : alignTargetBox(idx));
    if (!isShapeLayer(layerTree?.flat[idx])) { alignLayerTo(idx, how, target); continue; }
    const b = getPropertyTransformValues(idx), patch = {};
    if (how === 'left') patch.x = target.x;
    if (how === 'hcenter') patch.x = target.x + (target.w - b.w) / 2;
    if (how === 'right') patch.x = target.x + target.w - b.w;
    if (how === 'top') patch.y = target.y;
    if (how === 'vcenter') patch.y = target.y + (target.h - b.h) / 2;
    if (how === 'bottom') patch.y = target.y + target.h - b.h;
    pushDocHistory('对齐形状'); setShapePropertyTransform(idx, patch);
  }
}
export function syncTransformInputs(){
  if (!TInputs || selLayer < 0) return;
  const v = getPropertyTransformValues(selLayer);
  if (TInputs.x) TInputs.x.value = Math.round(v.x);
  if (TInputs.y) TInputs.y.value = Math.round(v.y);
  if (TInputs.w) TInputs.w.value = Math.round(v.w);
  if (TInputs.h) TInputs.h.value = Math.round(v.h);
  if (TInputs.rot) TInputs.rot.value = Math.round(v.rot);
  if (TInputs.rotVal) TInputs.rotVal.textContent = '°';
  if (TInputs.fh) TInputs.fh.classList.toggle('on', !!v.flipX);
  if (TInputs.fv) TInputs.fv.classList.toggle('on', !!v.flipY);
}

export function setLayerBox(idx, box){
  if (!doc || idx < 0 || !doc.layers[idx]) return false;
  const lock = moveLockWhy(idx);
  if (lock && (box.x != null || box.y != null)) { sayLocked(lock); return false; }
  const t = ensureLayerTransform(idx);
  const before = { ...t };
  if (box.x != null) t.x = Math.round(box.x);
  if (box.y != null) t.y = Math.round(box.y);
  if (box.w != null) t.w = Math.max(1, Math.round(box.w));
  if (box.h != null) t.h = Math.max(1, Math.round(box.h));
  if (box.rot != null) t.rot = box.rot;
  if (t.x === before.x && t.y === before.y && t.w === before.w && t.h === before.h && t.rot === before.rot) return false;
  pushDocHistory('变换');
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  renderStaticLayers(); syncTransformInputs(); drawGizmo(); renderLayerPanel();
  return true;
}

function alignTargetBox(idx = -1){
  if (selection) { const b = selectionBounds(selection); if (b && b.width > 0 && b.height > 0) return { x: b.x, y: b.y, w: b.width, h: b.height }; }
  
  const ab = idx >= 0 ? artboardOfLayer(idx) : null;
  if (ab && ab.index !== idx) return { x: ab.rect.x, y: ab.rect.y, w: ab.rect.w, h: ab.rect.h, ab };
  return { x: 0, y: 0, w: docW, h: docH };
}
export const ALIGN_LABEL = { left: '左边', hcenter: '水平居中', right: '右边', top: '顶边', vcenter: '垂直居中', bottom: '底边' };

export const ALIGN_BTNS = [['left', 'align-left'], ['hcenter', 'align-center'], ['right', 'align-right'],
                    ['top', 'align-start-vertical'], ['vcenter', 'align-center-vertical'], ['bottom', 'align-end-vertical']];

export const DISTRIBUTE_ICONS = { left: 'distribute-left', hcenter: 'distribute-hcenter', right: 'distribute-right',
                          top: 'distribute-top', vcenter: 'distribute-vcenter', bottom: 'distribute-bottom' };

function alignLayerTo(idx, how, T){
  const b = layerSelBBox(idx); if (!b || !(b.w > 0 && b.h > 0)) return false;
  if (moveLockWhy(idx)) return false;
  let nx = b.x, ny = b.y;
  if (how === 'left') nx = T.x;
  else if (how === 'hcenter') nx = T.x + (T.w - b.w) / 2;
  else if (how === 'right') nx = T.x + T.w - b.w;
  else if (how === 'top') ny = T.y;
  else if (how === 'vcenter') ny = T.y + (T.h - b.h) / 2;
  else if (how === 'bottom') ny = T.y + T.h - b.h;
  const t = ensureLayerTransform(idx);          
  return setLayerBox(idx, { x: t.x + (nx - b.x), y: t.y + (ny - b.y) });
}


function applyLayerShifts(plans, label){
  const todo = plans.filter(p => p && (Math.round(p.dx) || Math.round(p.dy)) && !moveLockWhy(p.i));
  if (!todo.length) return 0;
  pushDocHistory(label);
  const lock = docHistLock; set_docHistLock(true);       
  let n = 0;
  try {
    for (const p of todo) {
      const t = ensureLayerTransform(p.i);
      if (setLayerBox(p.i, { x: t.x + p.dx, y: t.y + p.dy })) n++;
    }
  } finally { set_docHistLock(lock); }
  updateUndoButtons();
  return n;
}

function alignPicks(){
  const picks = [...selLayers].filter(i => i >= 0 && i < (doc ? doc.layers.length : 0) && !layerDeletes.has(i));
  if (selLayer >= 0 && picks.length && !picks.includes(selLayer)) picks.push(selLayer);
  const list = picks.length > 1 ? picks : (selLayer >= 0 ? [selLayer] : []);
  return list.filter(i => { const b = layerSelBBox(i); return b && b.w > 0 && b.h > 0; });
}




export function alignLayers(how, targetMode = null){
  const list = alignPicks();
  if (!list.length) { shell.status('没有可对齐的图层（组 / 空层 / 锁住的层不参与）'); return false; }
  let where, union = null;
  if (targetMode === 'artboard') where = '画板';
  else if (targetMode === 'canvas') where = '画布';
  else if (targetMode === 'selection') {
    if (!selection) { shell.status('将图层与选区对齐需要先建立选区'); return false; }
    where = '选区';
  } else if (selection) where = '选区';
  else if (list.length > 1 && moveOpts.alignTo !== 'canvas') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of list) { const b = layerSelBBox(i); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    union = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; where = '选中图层的外框';
  } else where = '画布';
  const plans = [];
  for (const i of list) {
    let T;
    if (union) T = union;
    else if (targetMode === 'canvas') T = { x: 0, y: 0, w: docW, h: docH };
    else if (targetMode === 'artboard') {
      const ab = artboardOfLayer(i);
      T = ab ? { x: ab.rect.x, y: ab.rect.y, w: ab.rect.w, h: ab.rect.h } : { x: 0, y: 0, w: docW, h: docH };
      if (ab) where = `画板「${ab.name}」`;
    } else if (targetMode === 'frame') {
      const fr = frameRectOfLayer(i);
      T = fr ? { x: fr.x, y: fr.y, w: fr.w, h: fr.h } : { x: 0, y: 0, w: docW, h: docH };
      if (fr) where = '图框';
    } else T = alignTargetBox(i);             
    if (!union && T.ab) where = `画板「${T.ab.name}」`;
    const b = layerSelBBox(i);
    let nx = b.x, ny = b.y;
    if (how === 'left') nx = T.x;
    else if (how === 'hcenter') nx = T.x + (T.w - b.w) / 2;
    else if (how === 'right') nx = T.x + T.w - b.w;
    else if (how === 'top') ny = T.y;
    else if (how === 'vcenter') ny = T.y + (T.h - b.h) / 2;
    else if (how === 'bottom') ny = T.y + T.h - b.h;
    plans.push({ i, dx: nx - b.x, dy: ny - b.y });
  }
  const n = applyLayerShifts(plans, '对齐');
  shell.status(n ? `已对齐${ALIGN_LABEL[how] || how}（${n} 层，对到${where}）` : `已经是${ALIGN_LABEL[how] || how}对齐的了（或图层被锁定）`);
  return n > 0;
}

export function distributeLayers(how){
  const picks = alignPicks().filter(i => !moveLockWhy(i));
  if (picks.length < 3) { shell.status('分布需要至少选中三个图层（⌘/Ctrl 点图层行多选）'); return false; }
  const horiz = how === 'left' || how === 'hcenter' || how === 'right';
  const key = b => horiz ? (how === 'left' ? b.x : how === 'right' ? b.x + b.w : b.x + b.w / 2)
                         : (how === 'top' ? b.y : how === 'bottom' ? b.y + b.h : b.y + b.h / 2);
  const items = picks.map(i => ({ i, b: layerSelBBox(i) })).sort((a, b) => key(a.b) - key(b.b));
  const first = key(items[0].b), last = key(items[items.length - 1].b);
  const step = (last - first) / (items.length - 1);
  const plans = [];
  for (let k = 1; k < items.length - 1; k++) {
    const it = items[k], d = first + step * k - key(it.b);
    plans.push(horiz ? { i: it.i, dx: d, dy: 0 } : { i: it.i, dx: 0, dy: d });
  }
  applyLayerShifts(plans, '分布');
  shell.status(`已按${ALIGN_LABEL[how] || how}分布 ${items.length} 个图层`);
  return true;
}

export function distributeSpacing(axis){
  const picks = alignPicks().filter(i => !moveLockWhy(i));
  if (picks.length < 3) { shell.status('分布间距需要至少选中三个图层'); return false; }
  const h = axis === 'h';
  const pos = b => h ? b.x : b.y, size = b => h ? b.w : b.h;
  const items = picks.map(i => ({ i, b: layerSelBBox(i) })).sort((a, b) => pos(a.b) - pos(b.b));
  const firstB = items[0].b, lastB = items[items.length - 1].b;
  const span = pos(lastB) + size(lastB) - pos(firstB);
  const total = items.reduce((acc, it) => acc + size(it.b), 0);
  const gap = (span - total) / (items.length - 1);
  const plans = [];
  let cur = pos(firstB) + size(firstB) + gap;
  for (let k = 1; k < items.length - 1; k++) {
    const it = items[k], d = cur - pos(it.b);
    plans.push(h ? { i: it.i, dx: d, dy: 0 } : { i: it.i, dx: 0, dy: d });
    cur += size(it.b) + gap;
  }
  applyLayerShifts(plans, '分布间距');
  shell.status(`已${h ? '水平' : '垂直'}分布间距（${items.length} 个图层，间距 ${Math.round(gap)} 像素）`);
  return true;
}
export function setLayerPos(idx, nx, ny){
  if (isMeshTransform(idx)) {
    const b = meshBBox();
    const dx = (nx != null ? nx : b.x) - b.x, dy = (ny != null ? ny : b.y) - b.y;
    if (!dx && !dy) return;
    if (!meshEditInProgress) pushHistory();
    mapEditable(p => ({ x: p.x + dx, y: p.y + dy }));
    commit();
  } else {
    const t = ensureLayerTransform(idx);
    const dx2 = nx != null ? nx - t.x : 0, dy2 = ny != null ? ny - t.y : 0;
    if (nx != null) t.x = nx;
    if (ny != null) t.y = ny;
    if (t.quad && (dx2 || dy2)) t.quad = t.quad.map(p => [p[0] + dx2, p[1] + dy2]);   
    renderStaticLayers();
  }
  syncTransformInputs();
}
export function setLayerSize(idx, nw, nh){
  if (isMeshTransform(idx)) {
    const b = meshBBox();
    let sx = nw != null ? nw / Math.max(1e-6, b.w) : 1;
    let sy = nh != null ? nh / Math.max(1e-6, b.h) : 1;
    if (aspectLock) { const s = nw != null ? sx : sy; sx = sy = s; }
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    if (!meshEditInProgress) pushHistory();
    mapEditable(p => ({ x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy }));
    commit();
  } else {
    const t = ensureLayerTransform(idx), base = transformBase(idx);
    const q0 = t.quad && t.quad.map(p => p.slice()), b0 = q0 && quadBBox(q0);
    if (nw != null) { t.w = Math.max(1, nw); if (aspectLock && nh == null) t.h = Math.max(1, Math.round(base.h * (t.w / base.w))); }
    if (nh != null) { t.h = Math.max(1, nh); if (aspectLock && nw == null) t.w = Math.max(1, Math.round(base.w * (t.h / base.h))); }
    
    if (q0 && b0.w > 0 && b0.h > 0) {
      const kx = t.w / b0.w, ky = t.h / b0.h;
      t.quad = q0.map(p => [b0.x + (p[0] - b0.x) * kx, b0.y + (p[1] - b0.y) * ky]);
    }
    renderStaticLayers();
  }
  syncTransformInputs();
}
export function flipLayer(idx, axis){
  if (isMeshTransform(idx)) {
    const b = meshBBox(); const cx = b.x + b.w/2, cy = b.y + b.h/2;
    if (!meshEditInProgress) pushHistory();
    mapEditable(p => axis === 'x' ? { x: 2*cx - p.x, y: p.y } : { x: p.x, y: 2*cy - p.y });
    const f = meshFlipState[idx] || {};
    meshFlipState[idx] = { x: axis === 'x' ? !f.x : !!f.x, y: axis === 'y' ? !f.y : !!f.y };
    commit();
  } else {
    const t = ensureLayerTransform(idx);
    if (axis === 'x') t.flipX = !t.flipX; else t.flipY = !t.flipY;
    renderStaticLayers();
  }
  syncTransformInputs();
}

