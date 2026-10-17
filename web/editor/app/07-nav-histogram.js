




import './06-view-zoom-move.js';   
import { averageSample } from '../../../core/remaining-brush.js';
import { actions } from '../actions.js';
import { whenIdle } from '../lazy.js';
import { installBrushSettingsExtras } from '../brush-settings-extras.js';
import { brushPanel } from '../brushes-panel.js';
import { uiIcon, hasUiIcon, toolIcon, rotCursorSmooth } from '../icons.js';
import { panels } from '../panels.js';
import { pathBounds } from '../property-panel.js';
import { shell } from '../shell.js';
import { sampleCMYK } from '../../../core/cmyk-compose.js';
import { $, selectionBounds, selectionValueAt } from './01-boot.js';
import {
  CM, LX, doc, docH, docSnapshotCanvas, docW, layerDeletes, layerTransforms, layerTree, li, origBuffer, selDrag,
  selection, textCrops, textRenders,
} from './02-doc-state.js';
import { ACTP, PP, docHistory, propTab, pushDocHistory, set_docHistLock, updateUndoButtons } from './03-history.js';
import {
  RULER_UNITS, applyPan, nextZoomStep, panX, panY, rulerUnit, setZoom, set_panX, set_panY, zoom,
} from './04-view-chrome.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { tfFrame, zoomBox } from './06-view-zoom-move.js';
import { docResolution, tfFreeRatio } from './08-doc-size.js';
import { cropState } from './10-crop.js';
import { eyeOpts } from './11-paint-common.js';
import {
  actRecordTransform, beginTfDrag, cancelFreeTransform, commitFreeTransform, endTfDrag, moveLockWhy, moveTfDrag,
  sayLocked, tfBeginSelection, tfSelEligible, tfState,
} from './19-free-transform.js';
import {
  dupPending, duplicateLayerUI, hitLayerAt, scheduleDupMaterialize, set_snapLines, snapHandlePointer,
  snapMoveDelta,
} from './20-snap-smart-object.js';
import {
  collapsedGroups, layerCanvasCache, layerOrderView, renderLayerPanel, rowEls, selLayer, selLayers,
  set_selLayer, thumbCache,
} from './23-layers-panel.js';
import { renderProps } from './24-layer-ops-queue.js';
import { toolLabelOf } from './25-presets-actions-wiring.js';
import {
  ensureLayerTransform, getPropertyTransformValues, getTransformValues, isMeshTransform,
  setShapePropertyTransform, syncTransformInputs, transformBase,
} from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import { mipGen, nativeCMYKPreview, paintStates, renderStaticLayers } from './30-render.js';
import {
  brush, docTool, moveAutoOn, moveHover, moveHoverPt, moveOpts, panelHover, rulerMetrics, samplerOpts,
  samplerPixels, set_moveHover, toolData, toolDataChanged,
} from './31-selection-brush.js';
import { dispPx, sampleRGBA, setGizmoCursorString } from './32-cursors-select-options.js';
import { artboardAutoNest } from './36-clipboard-frame.js';
import { brushTarget, ensurePixelPaint } from './38-brush-engine.js';
import { renderBrushSettings, syncBrushControls } from './39-brush-options.js';
import { effPathSubpaths } from './44-vector-path.js';
import { dispThr, drawGizmo, fmtBytes, gizmo, toDoc } from './46-smart-filter-panel.js';
import { infoCompKey, infoComposite, infoLayerPixels } from './48-info-export.js';
import { buildCloneSrcPanel, toggleCloneSrcPanel } from './53-retouch-clone-pattern.js';
import { RT_BAR_ICONS, retouchSelectionMask } from './54-gestures-hints.js';
import { LB } from './57-layer-style-text-path.js';



function navVisibleDocRect(){
  const vp = $('#viewport').getBoundingClientRect(), gb = gizmo.getBoundingClientRect();
  if (!gb.width || !gb.height) return null;
  const sx = docW / gb.width, sy = docH / gb.height;
  return { x: (vp.left - gb.left) * sx, y: (vp.top - gb.top) * sy, w: vp.width * sx, h: vp.height * sy };
}

function navCenterOn(cx, cy){
  const r = navVisibleDocRect(); if (!r) return;
  const gb = gizmo.getBoundingClientRect(), k = gb.width / docW;
  set_panX(panX - ((cx - (r.x + r.w / 2)) * k)); set_panY(panY - ((cy - (r.y + r.h / 2)) * k));
  applyPan();
}
function refreshNavigator(){ try { INFOP && INFOP.refreshNavigator(); } catch {} }
function refreshHistogram(){ try { INFOP && INFOP.drawHist(); } catch {} }
export let INFOP = null;
const selKeyIds = new WeakMap(); let selKeySeq = 0;
export function installInfoPanelsWiring(){
  
  try { panels.setPanelIcon('cloneSource', size => { const img = document.createElement('img'); img.src = RT_BAR_ICONS.CloneSourcePanel[0]; img.width = img.height = size; img.style.cssText = 'display:block;object-fit:contain;pointer-events:none'; return img; }); } catch {}
  try { buildCloneSrcPanel(); } catch (e) { console.warn('[仿制源]', e); }
  try { installBrushSettingsExtras({ panels, uiIcon, brush: () => brush, render: () => renderBrushSettings(), changed: () => { syncBrushControls(); renderBrushSettings(); },
    showBrushes: () => { try { panels.show('brushes'); } catch {} }, newBrush: () => brushPanel.newFromCurrent() }); } catch (e) { console.warn('[画笔设置]', e); }
  if (!actions.has('window.cloneSource')) actions.register('window.cloneSource', { run: () => toggleCloneSrcPanel(), checked: () => panels.isOpen('cloneSource'), enabled: () => panels.exists('cloneSource') });
  const iconEl = (n, sz) => hasUiIcon(n) ? uiIcon(n, sz) : toolIcon(n, sz);
  const isAdj = i => { const L = layerTree && layerTree.flat && layerTree.flat[i]; return !!(L && L.adjustment && L.adjustment.kind !== 'fill'); };
  let adjCache = { key: '', px: null };
  
  const infoCtx = {
    panels, uiIcon: iconEl, iconHtml: (n, sz) => { const e = iconEl(n, sz); return e ? e.outerHTML : ''; },
    hasDoc: () => !!doc && !!docW,
    docInfo: () => ({ w: docW || 1, h: docH || 1, res: docResolution || 72, depth: (doc && doc.depth) || 8, mode: doc ? doc.mode : 3,
      sizes: doc ? `${fmtBytes(docW * docH * (doc.mode === 4 ? 4 : 3) * ((doc.depth || 8) / 8))}/${fmtBytes(origBuffer ? origBuffer.byteLength : 0)}` : '' }),
    colorAt: (x, y) => { const px = infoComposite(); return px ? averageSample({ data: px, w: docW, h: docH }, x, y, docTool === 'eyedropper' ? eyeOpts.size : 1) : null; },
    layerAlphaAt: (x, y) => { const px = infoLayerPixels(); if (!px) return null; const xi = Math.floor(x), yi = Math.floor(y); if (xi < 0 || yi < 0 || xi >= docW || yi >= docH) return null; return px[(yi * docW + xi) * 4 + 3]; },
    cmyk: c => (CM && CM.cmykReadout(c)) || null, cmykNote: () => nativeCMYKPreview()?.supported ? 'CMYK 原生合成墨量（校样读数另行估算）' : CM && CM.cmykNote(),
    nativeCmykAt: (x,y) => sampleCMYK(nativeCMYKPreview(),x,y,docTool==='eyedropper'?eyeOpts.size:1),
    rulerUnit: () => rulerUnit, unitPer: u => RULER_UNITS[u] ? RULER_UNITS[u].per() : 1,
    toDoc: ev => toDoc(ev),
    samplers: () => (toolData && toolData.samplers && toolData.samplers.samplers) || [],
    samplerColors: () => { const list = (toolData && toolData.samplers && toolData.samplers.samplers) || []; const sp = list.length ? samplerPixels() : null;
      return list.map(p => sp ? averageSample({ data: sp, w: docW, h: docH }, p.horizontal, p.vertical, samplerOpts.size) : null); },
    setSamplerColorSpace: (i, cs) => { const list = toolData && toolData.samplers && toolData.samplers.samplers; if (!list || !list[i] || toolData.samplerReadOnly || list[i].colorSpace === cs) return;
      toolDataChanged('samplers', '颜色取样点读数', () => { list[i].colorSpace = cs; }); },
    transform: () => tfState ? { ...tfState.num, kind: tfState.kind } : null,
    moveDrag: () => moveDrag && !moveDrag.tf && moveDrag.mode === 'move' && moveDrag.start ? { x: moveDrag.start.x, y: moveDrag.start.y } : null,
    crop: () => cropState && cropState.rect ? { w: cropState.rect.w, h: cropState.rect.h, angle: cropState.angle || 0 } : null,
    selDrag: () => selDrag && !selDrag.moveSel && /^sel(Rect|Ellipse)$/.test(selDrag.tool || '') ? selDrag : null,
    rulerMetrics: () => docTool === 'ruler' ? rulerMetrics() : null,
    selectionBounds: () => selection ? selectionBounds(selection) : null,
    currentTool: () => docTool, toolLabel: t => toolLabelOf(t),
    profileName: () => { try { const p = CM && CM.profileInfo(); return p && (p.description || p.name) || ''; } catch { return ''; } },
    measureScale: () => { try { return LB && LB.measure && LB.measure.scale && LB.measure.scale(); } catch { return null; } },
    smartObjectCount: () => layerTree && layerTree.flat ? layerTree.flat.filter((L, i) => L && L.isSmartObject && !layerDeletes.has(i)).length : 0,
    layerCount: () => layerTree && layerTree.flat ? layerTree.flat.filter((L, i) => L && !layerDeletes.has(i)).length : 0,
    snapshot: max => docSnapshotCanvas(max),
    contentGen: () => [...mipGen.values()].join(',') + '|' + (doc ? 1 : 0),
    zoom: () => zoom, setZoom: z => setZoom(z), nextZoomStep: d => nextZoomStep(d),
    visibleDocRect: () => doc ? navVisibleDocRect() : null, centerOn: (x, y) => navCenterOn(x, y),
    zoomToDocRect: r => { const vp = $('#viewport'); const z = Math.min(vp.clientWidth / r.w, vp.clientHeight / r.h); setZoom(z); navCenterOn(r.x + r.w / 2, r.y + r.h / 2); },
    histSource: (kind, maxPx) => {
      if (!doc || !docW) return null;
      if (kind === 'layer') { const px = infoLayerPixels(); return px ? { data: px, w: docW, h: docH, level: 1 } : null; }
      if (kind === 'adjust') {
        const key = infoCompKey() + '|' + selLayer;
        if (adjCache.key !== key) {
          const ord = displayOrder(), at = ord.indexOf(selLayer);
          let px = null; try { px = sampleRGBA(true, i => at >= 0 && ord.indexOf(i) > at); } catch {}
          adjCache = { key, px };
        }
        return adjCache.px ? { data: adjCache.px, w: docW, h: docH, level: 1 } : null;
      }
      if (docW * docH <= maxPx) { const px = infoComposite(); return px ? { data: px, w: docW, h: docH, level: 1 } : null; }
      
      const step = Math.max(1, Math.ceil(Math.log2(Math.sqrt(docW * docH / maxPx)))), level = step + 1;
      const cv = docSnapshotCanvas(Math.max(1, Math.round(Math.max(docW, docH) / 2 ** step))); if (!cv) return null;
      return { data: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height, level };
    },
    contentKey: kind => infoCompKey() + (kind === 'image' ? '' : '|' + selLayer),
    selectionKey: () => { if (!selection) return 0; let id = selKeyIds.get(selection); if (!id) { id = ++selKeySeq; selKeyIds.set(selection, id); } return id; },
    selectionMask: () => selection ? retouchSelectionMask(selection) : null,
    hasSelectedLayer: () => !!doc && selLayer >= 0 && !layerDeletes.has(selLayer),
    selectedIsAdjustment: () => !!doc && selLayer >= 0 && isAdj(selLayer),
  };
  const load = () => import('../info-panels.js').then(m => { INFOP = m.installInfoPanels(infoCtx); }).catch(e => { console.warn('[信息 / 导航器 / 直方图] 代码包没载入', e); });
  whenIdle(load, 1500);
}
export let eyeDrag = null;                
export function set_eyeDrag(v) { return (eyeDrag = v); }   
export let moveDrag = null;               
export function set_moveDrag(v) { return (moveDrag = v); }   

export function refreshMoveHover(){
  let h = -1;
  if (doc && !li && docTool === 'move' && moveOpts.hoverBounds && moveHoverPt && !moveDrag && !tfState && moveAutoOn()) {
    h = hitLayerAt(moveHoverPt.x, moveHoverPt.y);
    if (h >= 0 && moveOpts.kind === 'group') h = groupHeadOf(h);
  }
  if (h !== moveHover) { set_moveHover(h); drawGizmo(); }
}

function layerOutlineCorners(i){
  if (!doc || i == null || i < 0 || layerDeletes.has(i)) return null;
  const view = typeof layerOrderView === 'function' ? layerOrderView() : null;
  const n = view && view.nodes[i];
  if (n && n.divider) return null;
  if (n && n.group) {
    const hidden = paintStates().hidden;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of (n.block && n.block.visualIds) || []) {
      const nk = view.nodes[k];
      if (k === i || !nk || nk.group || nk.divider || hidden.has(k)) continue;
      const c = layerOutlineCorners(k); if (!c) continue;
      for (const p of c) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    }
    return x1 > x0 && y1 > y0 ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] : null;
  }
  const l = doc.layers[i]; if (!l) return null;
  let t;
  if (!(l.rgba && l.width > 0 && l.height > 0) && !textCrops[i]) {
    if (!isVectorOnlyLayer(i)) return null;                 
    t = getPropertyTransformValues(i);
  } else if ((tfState && tfState.idx === i) || isMeshTransform(i)) t = getTransformValues(i);
  else { const b = layerTransforms[i] || transformBase(i); t = { rot: 0, ...b }; }   
  if (!t || !(t.w > 0) || !(t.h > 0)) return null;
  return tfFrame(t).corners;
}
export function drawHoverBounds(ctx){
  if (!doc || li) return;
  const want = [];
  if (docTool === 'move' && moveOpts.hoverBounds && moveHover >= 0 && !moveDrag
      && !(moveHover === selLayer && moveOpts.showTf)) want.push(moveHover);     
  if (moveOpts.panelHover && panelHover >= 0 && !want.includes(panelHover)) want.push(panelHover);
  if (!want.length) return;
  ctx.save();
  ctx.lineWidth = dispPx(1.5);
  ctx.strokeStyle = '#2d8ceb';                   
  for (const i of want) {
    const c = layerOutlineCorners(i); if (!c) continue;
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
    for (let k = 1; k < 4; k++) ctx.lineTo(c[k][0], c[k][1]);
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function revealLayerRow(i){
  const view = typeof layerOrderView === 'function' ? layerOrderView() : null;
  if (!view || !view.nodes[i]) return;
  let changed = false;
  for (let a = view.nodes[i].parent, guard = 0; a != null && guard < 64; a = view.nodes[a] && view.nodes[a].parent, guard++)
    if (collapsedGroups.delete(a)) changed = true;
  if (changed) renderLayerPanel();
  const r = rowEls[i];
  if (r && r.scrollIntoView) { try { r.scrollIntoView({ block: 'nearest' }); } catch {} }
}

export function syncThumbTargets(){
  for (const [k, row] of Object.entries(rowEls)) {
    const on = +k === selLayer;
    const th = row.querySelector(':scope > .thumb'), masks = [...row.querySelectorAll(':scope > .maskthumb')];
    const kind = (propTab === 'mask' || (on && brushTarget() === 'mask')) ? PP?.maskKind(+k, layerTree?.flat[+k]) : null;
    const selected = on && masks.find(m => m.dataset.maskKind === kind);
    if (th) th.classList.toggle('target', on && !th.classList.contains('folder') && !selected);
    for (const mask of masks) { mask.classList.toggle('target', mask === selected); mask.classList.toggle('selected', mask === selected); }
  }
}

export function groupHeadOf(i){
  const view = typeof layerOrderView === 'function' ? layerOrderView() : null;
  let k = i;
  for (let guard = 0; guard < 32; guard++) {
    const n = view && view.nodes && view.nodes[k];
    if (!n || n.parent == null) break;
    k = n.parent;
  }
  return k;
}
export function beginMoveDrag(ev, pt){
  if (tfState) return beginTfDrag(ev, pt);       
  

  if (selection && selLayer >= 0 && !(ev && (ev.metaKey || ev.ctrlKey)) && !layerDeletes.has(selLayer)
      && selectionValueAt(selection, Math.floor(pt.x), Math.floor(pt.y)) > 0 && tfSelEligible(selLayer)) {
    const alt = !!(ev && ev.altKey);
    let backupForAlt = null;
    if (alt) { const pp = ensurePixelPaint(selLayer); backupForAlt = pp && Uint8ClampedArray.from(pp.rgba); }
    if (tfBeginSelection(selLayer, 'free')) {
      tfState.moveTool = true;
      
      if (alt && backupForAlt) { tfState.sel.pp.rgba.set(backupForAlt); delete layerCanvasCache[selLayer]; }
      beginTfDrag(ev, pt);
      if (moveDrag) moveDrag.mode = 'move';
      return;
    }
  }
  let altDuplicated = false;                     
  let handle = -1, rotateZone = false, a0 = 0;
  
  if (moveOpts.showTf && selLayer >= 0 && !layerDeletes.has(selLayer)) {
    const t = getTransformValues(selLayer);
    if (t.w > 0 && t.h > 0) {
      
      const scale = gizmo.getBoundingClientRect().width ? dispThr(1) : 1;   
      const f = tfFrame(t);
      for (let k = 0; k < f.handles.length; k++)
        if (Math.abs(pt.x - f.handles[k][0]) <= Math.max(7 * scale, 5) && Math.abs(pt.y - f.handles[k][1]) <= Math.max(7 * scale, 5)) { handle = k; break; }
      
      if (handle < 0) {
        const rz = Math.max(24 * scale, 14);
        rotateZone = f.corners.some(c => Math.hypot(pt.x - c[0], pt.y - c[1]) <= rz);
        a0 = Math.atan2(pt.y - f.cy, pt.x - f.cx);
      }
    }
  }
  

  const autoOn = moveAutoOn(ev);
  let hit;
  if (handle >= 0 || rotateZone) hit = selLayer;
  else if (autoOn) { hit = hitLayerAt(pt.x, pt.y); if (hit >= 0 && moveOpts.kind === 'group') hit = groupHeadOf(hit); }
  else hit = selLayer;
  
  if (autoOn && hit < 0 && handle < 0 && !rotateZone && ev && ev.button === 0) { beginLayerMarquee(ev, pt); return; }
  
  if (autoOn && ev && ev.shiftKey && hit >= 0 && handle < 0 && !rotateZone) {
    if (!selLayers.size && selLayer >= 0) selLayers.add(selLayer);
    if (selLayers.has(hit) && selLayers.size > 1) {
      selLayers.delete(hit);
      if (selLayer === hit) set_selLayer([...selLayers][selLayers.size - 1]);
      syncLayerRowSel(); renderProps(); drawGizmo();
      return;                                    
    }
    selLayers.add(hit); set_selLayer(hit);
    syncLayerRowSel(); renderProps();
  } else if (hit >= 0 && hit !== selLayer) {   
    const prev = selLayer;
    set_selLayer(hit);
    
    if (selLayers.size && !selLayers.has(hit)) { selLayers.clear(); syncLayerRowSel(); }
    if (prev >= 0 && rowEls[prev] && !selLayers.has(prev)) rowEls[prev].classList.remove('sel');
    if (rowEls[hit]) rowEls[hit].classList.add('sel');
    syncThumbTargets();
    if (autoOn && moveOpts.expandGroups) revealLayerRow(hit);   
    renderProps();
  }
  set_moveHover(-1);                                
  

  if (hit >= 0 && handle < 0 && !rotateZone && ev && ev.altKey && !layerDeletes.has(hit)) {
    const dup = duplicateLayerUI(hit, { defer: true });          
    if (dup >= 0) { hit = dup; altDuplicated = true; }
  }
  const l = hit >= 0 ? doc.layers[hit] : null;
  
  if (hit >= 0 && sayLocked(moveLockWhy(hit))) { if (altDuplicated) scheduleDupMaterialize(); drawGizmo(); return; }
  

  if (hit >= 0 && !layerDeletes.has(hit) && !(l.rgba && l.width > 0 && l.height > 0) && isVectorOnlyLayer(hit)) {
    const o = getPropertyTransformValues(hit);
    moveDrag = { idx: hit, shape: true, mode: handle >= 0 ? 'scale' : rotateZone ? 'rotate' : 'move',
                 handle, start: pt, a0, orig: { ...o }, cur: { ...o }, pushed: altDuplicated };
    gizmo.classList.add('drag');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    drawGizmo();
    return;
  }
  if (hit >= 0 && !layerDeletes.has(hit) && ((l.rgba && l.width > 0 && l.height > 0) || textCrops[hit])) {
    moveDrag = { idx: hit, mode: handle >= 0 ? 'scale' : rotateZone ? 'rotate' : 'move',
                 handle, start: pt, a0, orig: { ...ensureLayerTransform(hit) }, pushed: false };
    
    if (altDuplicated) moveDrag.pushed = true;   
    
    const linked = LX ? LX.linkedOf(hit) : [];
    if (moveDrag.mode === 'move' && ((selLayers.size > 1 && selLayers.has(hit)) || linked.length)) {
      const origs = new Map();
      for (const i of new Set([...(selLayers.size > 1 && selLayers.has(hit) ? selLayers : []), ...linked])) {
        if (i === hit || layerDeletes.has(i) || moveLockWhy(i)) continue;   
        const l2 = doc.layers[i];
        if ((l2 && l2.rgba && l2.width > 0) || textCrops[i]) origs.set(i, { ...ensureLayerTransform(i) });
      }
      if (origs.size) moveDrag.origs = origs;
    }
    gizmo.classList.add('drag');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  }
  if (altDuplicated && !moveDrag) scheduleDupMaterialize();   
  drawGizmo();
}

export function syncLayerRowSel(){
  for (const [i, el] of Object.entries(rowEls)) el.classList.toggle('sel', +i === selLayer || selLayers.has(+i));
  syncThumbTargets();
}


export let layerMarq = null;
export function set_layerMarq(v) { return (layerMarq = v); }   
export function beginLayerMarquee(ev, pt){
  layerMarq = { x0: ev.clientX, y0: ev.clientY, p0: pt, add: !!ev.shiftKey, moved: false };
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  const move = e => {
    if (!layerMarq) return;
    if (!layerMarq.moved && Math.hypot(e.clientX - layerMarq.x0, e.clientY - layerMarq.y0) < 3) return;
    layerMarq.moved = true;
    zoomBox(true, layerMarq.x0, layerMarq.y0, e.clientX, e.clientY);
  };
  const up = e => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const m = layerMarq; layerMarq = null; zoomBox(false);
    if (!m) return;
    if (!m.moved) {                                
      if (!m.add && (selLayer >= 0 || selLayers.size)) { set_selLayer(-1); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo(); }
      return;
    }
    const p1 = toDoc(e);
    const x0 = Math.min(m.p0.x, p1.x), y0 = Math.min(m.p0.y, p1.y), x1 = Math.max(m.p0.x, p1.x), y1 = Math.max(m.p0.y, p1.y);
    const hidden = paintStates().hidden, got = [];
    for (const i of displayOrder().slice().reverse()) {
      if (hidden.has(i) || layerDeletes.has(i) || isBackgroundLayer(i)) continue;
      const c = layerOutlineCorners(i); if (!c) continue;
      const bx0 = Math.min(...c.map(q => q[0])), by0 = Math.min(...c.map(q => q[1])), bx1 = Math.max(...c.map(q => q[0])), by1 = Math.max(...c.map(q => q[1]));
      if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
      const k = moveOpts.kind === 'group' ? groupHeadOf(i) : i;
      if (!got.includes(k)) got.push(k);
    }
    if (!m.add) selLayers.clear();
    else if (!selLayers.size && selLayer >= 0) selLayers.add(selLayer);
    for (const i of got) selLayers.add(i);
    if (got.length) set_selLayer(got[0]);
    else if (!m.add) set_selLayer(-1);
    if (selLayers.size < 2) selLayers.clear();
    renderLayerPanel(); renderProps(); drawGizmo();
    shell.status(got.length ? `框选了 ${got.length} 个图层` : '框里没有图层');
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
export function moveMoveDrag(ev, pt){
  if (!moveDrag) return;                         
  if (moveDrag.tf) return moveTfDrag(ev, pt);
  const d = moveDrag, o = d.orig, t = d.shape ? d.cur : ensureLayerTransform(d.idx);
  if (d.shape && !d.pushed && (pt.x !== d.start.x || pt.y !== d.start.y)) {
    pushDocHistory(d.mode === 'scale' ? '缩放形状' : d.mode === 'rotate' ? '旋转形状' : '移动形状'); d.pushed = true;
  }
  if (d.shape && d.pushed && !d.locked) { d.locked = true; set_docHistLock(true); }   
  const flushShape = () => {                     
    if (d.raf) return;
    d.raf = requestAnimationFrame(() => {
      d.raf = 0;
      if (moveDrag !== d && !d.final) return;
      const c = d.cur;
      setShapePropertyTransform(d.idx, { x: c.x, y: c.y, w: c.w, h: c.h, rot: c.rot });
      syncTransformInputs(); drawGizmo();
    });
  };
  if (d.mode === 'rotate') {                     
    if (!d.pushed) { pushDocHistory('旋转'); d.pushed = true; }
    let deg = o.rot + (Math.atan2(pt.y - (o.y + o.h / 2), pt.x - (o.x + o.w / 2)) - d.a0) * 180 / Math.PI;
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
    t.rot = Math.round(deg * 100) / 100;
    
    setGizmoCursorString(rotCursorSmooth(Math.atan2(pt.y - (o.y + o.h / 2), pt.x - (o.x + o.w / 2)) * 180 / Math.PI));
    if (d.shape) { flushShape(); return; }
    scheduleMoveRepaint(); return;
  }
  let dx = pt.x - d.start.x, dy = pt.y - d.start.y;
  if (!d.pushed && (d.mode === 'scale' || dx || dy)) { pushDocHistory(d.mode === 'scale' ? '缩放' : '移动'); d.pushed = true; }   
  if (d.mode !== 'scale') {                      
    
    let diag = false;
    if (ev.shiftKey && (dx || dy)) {
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const L = dx * Math.cos(a) + dy * Math.sin(a);
      dx = Math.abs(Math.cos(a)) < 1e-9 ? 0 : L * Math.cos(a);
      dy = Math.abs(Math.sin(a)) < 1e-9 ? 0 : L * Math.sin(a);
      diag = dx !== 0 && dy !== 0;
    }
    
    const sn = snapMoveDelta(d.idx, { x: o.x, y: o.y, w: o.w, h: o.h }, dx, dy,
      { skipX: ev.shiftKey && (dx === 0 || diag), skipY: ev.shiftKey && (dy === 0 || diag) });
    dx = sn.dx; dy = sn.dy;
    t.x = Math.round(o.x + dx); t.y = Math.round(o.y + dy);
    if (d.origs) for (const [i2, oo] of d.origs) {   
      const tt = ensureLayerTransform(i2);
      tt.x = Math.round(oo.x + dx); tt.y = Math.round(oo.y + dy);
    }
  } else {                                       
    if (!o.rot) {                                
      const hs = tfFrame({ x: o.x, y: o.y, w: o.w, h: o.h, rot: 0 }).handles, hh = d.handle;
      if (hs[hh]) pt = snapHandlePointer(d.idx, hs[hh], d.start, pt, {
        noX: hh === 1 || hh === 5, noY: hh === 3 || hh === 7, one: hh % 2 === 0 && !ev.shiftKey });
    }
    const cx0 = o.x + o.w / 2, cy0 = o.y + o.h / 2;
    const a = (o.rot || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const toLocal = (px, py) => { const dx2 = px - cx0, dy2 = py - cy0; return [dx2 * cos + dy2 * sin + o.w / 2, -dx2 * sin + dy2 * cos + o.h / 2]; };
    const L = toLocal(pt.x, pt.y);
    const h = d.handle, sx = (h === 0 || h === 6) ? -1 : 1, sy = (h === 0 || h === 2) ? -1 : 1;
    const Ax = sx < 0 ? o.w : 0, Ay = sy < 0 ? o.h : 0;         
    let x0l, x1l, y0l, y1l;
    const fromAnchor = (w2, h2) => {                             
      x0l = sx < 0 ? Ax - w2 : Ax; x1l = sx < 0 ? Ax : Ax + w2;
      y0l = sy < 0 ? Ay - h2 : Ay; y1l = sy < 0 ? Ay : Ay + h2;
    };
    if (ev.altKey) {                                             
      let w2, h2;
      if (h % 2 === 0 && !tfFreeRatio(ev)) {                     
        const s = Math.max(Math.abs(L[0] - o.w / 2) * 2 / o.w, Math.abs(L[1] - o.h / 2) * 2 / o.h, 2 / o.w, 2 / o.h);
        w2 = Math.max(2, Math.round(o.w * s)); h2 = Math.max(2, Math.round(o.h * s));
      } else if (h % 2 === 0) {                                  
        w2 = Math.max(2, Math.round(Math.abs(L[0] - o.w / 2) * 2)); h2 = Math.max(2, Math.round(Math.abs(L[1] - o.h / 2) * 2));
      } else if (h === 3 || h === 7) { w2 = Math.max(2, Math.round(Math.abs(L[0] - o.w / 2) * 2)); h2 = o.h; }
      else { w2 = o.w; h2 = Math.max(2, Math.round(Math.abs(L[1] - o.h / 2) * 2)); }
      x0l = o.w / 2 - w2 / 2; x1l = o.w / 2 + w2 / 2;
      y0l = o.h / 2 - h2 / 2; y1l = o.h / 2 + h2 / 2;
    } else if (h % 2 === 0) {                                    
      if (tfFreeRatio(ev)) fromAnchor(Math.max(1, Math.round(Math.abs(L[0] - Ax))), Math.max(1, Math.round(Math.abs(L[1] - Ay))));
      else {
        const s = Math.max(Math.abs(L[0] - Ax) / o.w, Math.abs(L[1] - Ay) / o.h, 1 / o.w, 1 / o.h);
        fromAnchor(Math.max(1, Math.round(o.w * s)), Math.max(1, Math.round(o.h * s)));
      }
    } else {                                                     
      if (h === 3 || h === 7) { const w2 = Math.max(1, Math.round(Math.abs(L[0] - Ax))); fromAnchor(w2, o.h); }
      else                    { const h2 = Math.max(1, Math.round(Math.abs(L[1] - Ay))); fromAnchor(o.w, h2); }
    }
    
    const lc = [(x0l + x1l) / 2, (y0l + y1l) / 2];
    const ncx = cx0 + (lc[0] - o.w / 2) * cos - (lc[1] - o.h / 2) * sin;
    const ncy = cy0 + (lc[0] - o.w / 2) * sin + (lc[1] - o.h / 2) * cos;
    t.w = Math.max(1, Math.round(x1l - x0l)); t.h = Math.max(1, Math.round(y1l - y0l));
    t.x = Math.round(ncx - t.w / 2); t.y = Math.round(ncy - t.h / 2);
  }
  if (d.shape) {
    if (d.mode !== 'scale') { t.x = o.x + dx; t.y = o.y + dy; }   
    flushShape(); return;
  }
  scheduleMoveRepaint();
}





let moveRAF = 0;
function scheduleMoveRepaint(){
  if (moveRAF) return;
  moveRAF = requestAnimationFrame(() => {
    moveRAF = 0;
    if (!moveDrag) return;                       
    renderStaticLayers(); syncTransformInputs(); drawGizmo();
  });
}
function cancelMoveRepaint(){ if (moveRAF) { cancelAnimationFrame(moveRAF); moveRAF = 0; } }

export function isVectorOnlyLayer(i){
  const dl = doc && doc.layers[i];
  if (!dl || (dl.rgba && dl.width > 0 && dl.height > 0) || textRenders[i]) return false;
  const p = effPathSubpaths(i);
  return !!(p && p.length && pathBounds(p));
}

function finishShapeDrag(d){
  if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
  if (d.pushed) {
    const c = d.cur, o = d.orig;
    if (c.x !== o.x || c.y !== o.y || c.w !== o.w || c.h !== o.h || c.rot !== o.rot)
      setShapePropertyTransform(d.idx, { x: c.x, y: c.y, w: c.w, h: c.h, rot: c.rot });
  }
  if (d.locked) set_docHistLock(false);
  delete thumbCache[d.idx];
  renderLayerPanel();
}
export function endMoveDrag(){
  if (moveDrag && moveDrag.tf) {
    const p = moveDrag.pushed; endTfDrag();
    if (tfState && tfState.moveTool) { commitFreeTransform(); return true; }   
    return p;
  }
  const wasPushed = moveDrag && moveDrag.pushed;
  if (wasPushed && ACTP && moveDrag && !moveDrag.shape && moveDrag.orig) actRecordTransform(moveDrag.orig, layerTransforms[moveDrag.idx]);
  const nestIds = wasPushed && moveDrag.mode === 'move' ? [moveDrag.idx, ...(moveDrag.origs ? moveDrag.origs.keys() : [])] : null;
  if (moveDrag && moveDrag.shape) finishShapeDrag(moveDrag);
  moveDrag = null; set_snapLines([]); gizmo.classList.remove('drag');
  cancelMoveRepaint();                           
  if (dupPending) scheduleDupMaterialize();      
  if (wasPushed) renderStaticLayers();           
  if (nestIds) { try { artboardAutoNest(nestIds); } catch {  } }   
  syncTransformInputs(); renderProps(); drawGizmo();
  return wasPushed;                              
}
export function cancelMoveDrag(){                       
  if (!moveDrag) return;
  if (moveDrag.tf) { moveDrag = null; set_snapLines([]); if (tfState) tfState.dragging = false; gizmo.classList.remove('drag');
    if (tfState && tfState.moveTool) cancelFreeTransform(); drawGizmo(); return; }
  const d = moveDrag; moveDrag = null; set_snapLines([]);
  cancelMoveRepaint();
  if (dupPending) setTimeout(() => scheduleDupMaterialize(), 0);
  if (d.shape) {                                 
    if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
    if (d.locked) set_docHistLock(false);
    gizmo.classList.remove('drag');
    if (d.pushed) { setShapePropertyTransform(d.idx, { ...d.orig }); docHistory.undo.pop(); }
    updateUndoButtons(); renderLayerPanel(); syncTransformInputs(); drawGizmo();
    return;
  }
  Object.assign(ensureLayerTransform(d.idx), d.orig);
  if (d.pushed) docHistory.undo.pop();
  updateUndoButtons(); renderStaticLayers(); syncTransformInputs(); drawGizmo();
}
