




import './31-selection-brush.js';   
import { compositeAll } from '../../../core/app.js';
import { cmykCompositeRGBA } from '../../../core/cmyk-compose.js';
import { getModeCodec } from '../../../core/color-convert.js';
import { bracketStep } from '../../../core/brush-engine.js';
import { readLazyLayerPixel } from '../../../core/psd-raster.js';
import { actions } from '../actions.js';
import { promptDialog, formDialog } from '../dialog.js';
import { hasUiIcon, toolCursor } from '../icons.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { tools } from '../tools.js';
import {
  $, QUADM, SELECT, SELM, combineSelection, contractSelection, createSelection, ellipseSelection,
  emptySelection, expandSelection, featherSelection, icon, invertSelection, isEmptySelection, lassoSelection,
  magicWandSelection, rectSelection, runLazy, selectionArea, selectionBounds, selectionToPath, selectionValueAt,
} from './01-boot.js';
import {
  brushHistory, curStroke, doc, docH, docW, layerDeletes, li, selDrag, selEdgesOn, selPathCache, selection,
  set_lastSelection, set_selPathCache, set_selection, textCrops, textRenders,
} from './02-doc-state.js';
import { histCap, histPush, pushDocHistory, updateUndoButtons } from './03-history.js';
import { RULER_UNITS, padL, padT, viewH, viewW, zoom } from './04-view-chrome.js';
import { isBackgroundLayer, opaqueBBox, renderLayerAlone } from './05-layer-lock-guides.js';
import { layerSelBBox, panState, spaceDown, tempZoomMode, updatePanCursor } from './06-view-zoom-move.js';
import { refreshMoveHover } from './07-nav-histogram.js';
import { isTextLayer, syncTextBar } from './09-text-tool.js';
import { cropState, syncCropBar } from './10-crop.js';
import { PAINT_WARP_WHY, paintMap, paintPixelsWith, srcBoxOfDocRect } from './11-paint-common.js';
import { hexToRGB } from './14-edit-misc.js';
import { adjEye, syncBucketBar, syncEyeBar, syncGradBar } from './15-gradient-bucket-eyedropper.js';
import {
  penHoverCursor, penNearAnchor, penNearSegment, penNearStart, penPointer, penState, syncShapeBar, workPathSet,
} from './17-shape-pen.js';
import { PEN_TOOLS, freePenOpts, syncPenBar } from './18-pen-extra.js';
import { tfSelEligible, tfState } from './19-free-transform.js';
import { selLayer } from './23-layers-panel.js';
import { humanEditError, renderProps } from './24-layer-ops-queue.js';
import { isMeshTransform, transformBase, transformChanged } from './28-layer-props-transform.js';
import { displayOrder, rasterizeTransformed } from './29-scrubby-live.js';
import {
  composeDocForOrder, gpuForgetLayer, layerPixelSource, nativeCMYKPreview, paintStates, previewCompositeDoc,
  renderPreviewOnly,
} from './30-render.js';
import {
  AUX_TOOLS, DOC_TOOLS, PAINT_TOOLS, SEL_TOOLS, TEXT_TOOLS, TOOL_BTN, bgRGB, brush, countGroup, countGroups,
  docTool, eraserOpts, handActive, hexOf, lastMoveCtrl, measureLine, selMode, set_lastMoveCtrl, set_selMode,
  syncAuxBar, syncMoveBar, syncToolPreset, syncZoomBar, toolData, viewAngle, zoomOutMode,
} from './31-selection-brush.js';
import { magLasso, magOpts, osOpts, polyLasso, qsOpts, syncQuickSelBar } from './33-lasso-quick-select.js';
import { pcropState, syncPCropBar, syncSliceBar } from './34-perspective-crop-slice.js';
import { abCursorName } from './35-artboard.js';
import { frameWhy, syncArtboardBar, syncFrameBar } from './36-clipboard-frame.js';
import { syncBrushOpBar, syncMagBar } from './37-local-pixel-tools.js';
import {
  ALT_EYEDROP, commitPixelPaint, cutRect, ensurePixelPaint, paintGuard, sameBytes, sparsePixelHistory,
} from './38-brush-engine.js';
import { capsPrecise } from './39-brush-options.js';
import { smInternal, smOpen, smTakeToolSelection, smViewHidesAnts, syncBrushPanel } from './40-options-bar-wiring.js';
import { pathGuard } from './44-vector-path.js';
import { PATH_EDIT_TOOLS, syncPathPanel } from './45-path-tools.js';
import { dispThr, drawGizmo, gizmo, syncDocTab } from './46-smart-filter-panel.js';
import { affMul } from './47-canvas-context-menu.js';
import { RETOUCH_TOOLS, isRetouchBrush, retouchGuard, retouchOpts, rtPending } from './53-retouch-clone-pattern.js';
import { syncRetouchBar } from './54-gestures-hints.js';
import { effTextPath, textPathCursor } from './57-layer-style-text-path.js';

















export const modKeys = { shift: false, alt: false, ctrl: false, caps: false };

const MOD_KEYS = new Set(['Shift', 'Alt', 'Meta', 'Control', 'CapsLock']);
addEventListener('keydown', e => { if (MOD_KEYS.has(e.key)) { syncModKeys(e); syncGizmoCursor(); syncMoveCtrl(); if (spaceDown || handActive()) updatePanCursor(); } });
addEventListener('keyup', e => { if (MOD_KEYS.has(e.key)) { syncModKeys(e); syncGizmoCursor(); syncMoveCtrl(); if (spaceDown || handActive()) updatePanCursor(); } });
addEventListener('blur', () => { modKeys.shift = modKeys.alt = modKeys.ctrl = false; syncGizmoCursor(); updatePanCursor(); syncMoveCtrl(); });

function syncMoveCtrl(){
  if (!!modKeys.ctrl === lastMoveCtrl) return;
  set_lastMoveCtrl(!!modKeys.ctrl);
  if (typeof docTool === 'undefined' || docTool !== 'move') return;
  try { syncMoveBar(); } catch {}
  refreshMoveHover();
}
function syncModKeys(e) { modKeys.shift = e.shiftKey; modKeys.alt = e.altKey; modKeys.ctrl = e.metaKey || e.ctrlKey; modKeys.caps = capsOf(e); }

function capsOf(e){ try { return !!(e && e.getModifierState && e.getModifierState('CapsLock')); } catch { return false; } }



export function syncPointerModifiers(e) {
  const next = { shift: !!e.shiftKey, alt: !!e.altKey, ctrl: !!(e.metaKey || e.ctrlKey), caps: capsOf(e) };
  if (next.shift === modKeys.shift && next.alt === modKeys.alt && next.ctrl === modKeys.ctrl && next.caps === modKeys.caps) return;
  modKeys.shift = next.shift; modKeys.alt = next.alt; modKeys.ctrl = next.ctrl; modKeys.caps = next.caps;
  syncGizmoCursor(); updatePanCursor(); syncMoveCtrl();
}




function canPan(){
  const vp = $('#viewport'), st = $('#stage');
  if (!vp || !st || !docW) return true;
  const vw = vp.clientWidth, vh = vp.clientHeight;
  if (!vw && !vh) return true;
  return (vw + st.offsetWidth > 56) || (vh + st.offsetHeight > 56);
}

export function panCursorName(){ return !canPan() ? 'handNo' : (panState ? 'handGrab' : 'hand'); }



const CAPS_PRECISE = new Set([...PAINT_TOOLS, 'quickSelect', 'spotHeal', 'healBrush', 'patch', 'redEye', 'magicEraser',
  'selRect', 'selEllipse', 'selRow', 'selCol', 'lasso', 'lassoPoly', 'lassoMagnetic', 'wand', 'objectSelect',
  'crop', 'cropPerspective', 'slice', 'eyedropper', 'colorSampler', 'ruler', 'count',
  'pen', 'penFree', 'penCurvature', 'gradient', 'bucket', 'shape']);


export let cursorHover = '', cursorHoverPt = null;
export function set_cursorHover(v) { return (cursorHover = v); }   
export function set_cursorHoverPt(v) { return (cursorHoverPt = v); }   

export function cursorHoverKind(pt){
  if (!pt || li || !doc) return '';
  try {
    const inSel = () => selection && selectionValueAt(selection, Math.floor(pt.x), Math.floor(pt.y)) > 0;
    
    if (['selRect', 'selEllipse', 'lasso'].includes(docTool))
      return effSelMode({ shiftKey: modKeys.shift, altKey: modKeys.alt }) === 'replace' && inSel() ? 'moveSel' : '';
    
    if (docTool === 'move')
      return !modKeys.ctrl && selLayer >= 0 && !layerDeletes.has(selLayer) && inSel() && tfSelEligible(selLayer)
        ? (modKeys.alt ? 'pathCopy' : 'cutSel') : '';
    const near = (x, y) => Math.hypot(x - pt.x, y - pt.y) < dispPx(12);
    if (docTool === 'colorSampler' && toolData && toolData.samplers) {
      const hit = (toolData.samplers.samplers || []).some(p => near(p.horizontal, p.vertical));
      return hit ? (modKeys.alt ? 'sampleDel' : 'sampleMove') : '';
    }
    if (docTool === 'count') {
      const g = countGroups()[countGroup];
      const hit = !!g && (g.countObjectList || []).some(p => near(p['X   '], p['Y   ']));
      return hit ? (modKeys.alt ? 'countDel' : 'countMove') : '';
    }
    if (docTool === 'ruler' && measureLine) {
      const end = ['a', 'b', 'c'].some(k => measureLine[k] && Math.hypot(pt.x - measureLine[k].x, pt.y - measureLine[k].y) < dispPx(9));
      if (end) return modKeys.alt ? 'protractor' : 'rulerPoint';
      const { a, b } = measureLine; const dx = b.x - a.x, dy = b.y - a.y, t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1);
      return t >= 0 && t <= 1 && Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy) < dispPx(6) ? 'rulerMove' : '';
    }
  } catch {}
  return '';
}




const paintCursorPref = () => PREF.get('cursors.paint') || 'normal';
const paintCursorTool = t => PAINT_TOOLS.has(t) || isRetouchBrush(t);
function ringCursorOn(){
  if (li || !doc || modKeys.caps) return false;
  if (paintCursorTool(docTool) && (paintCursorPref() === 'standard' || paintCursorPref() === 'precise')) return false;
  if (docTool === 'eraser' && eraserOpts.mode === 'block') return false;   
  if (docTool === 'quickSelect' || docTool === 'selectionBrush') return true;
  if (isRetouchBrush(docTool)) return !retouchGuard() && !(modKeys.alt && docTool === 'healBrush');
  
  return PAINT_TOOLS.has(docTool) && (docTool === 'adjBrush' || !paintGuard()) && !(modKeys.alt && (ALT_EYEDROP.has(docTool) || docTool === 'cloneStamp'));
}

export function currentCursorName(){
  if (li) return null;                                  
  


  if (!doc) return 'moveArrow';
  
  if (adjEye.active) return 'eyedropper';
  

  if (tempZoomMode()) return tempZoomMode() === 'out' ? 'zoomOut' : 'zoomIn';   
  if (spaceDown || handActive()) return panCursorName();
  if (cropState) return 'crop';
  

  if (modKeys.caps && CAPS_PRECISE.has(docTool) && !(PAINT_TOOLS.has(docTool) && paintGuard())) return 'precise';
  
  if (PREF.get('cursors.other') === 'precise' && CAPS_PRECISE.has(docTool) && !paintCursorTool(docTool) && docTool !== 'quickSelect' && !modKeys.alt) return 'precise';
  
  if (modKeys.alt && (docTool === 'cloneStamp' || docTool === 'healBrush')) return 'cloneSrc';
  

  const hk = cursorHoverPt ? cursorHoverKind(cursorHoverPt) : '';
  if (hk) return hk;
  

  if (modKeys.alt && ALT_EYEDROP.has(docTool)) return 'eyedropper';
  
  
  if ((docTool === 'cloneStamp' || docTool === 'healBrush') && modKeys.alt && !li && doc)
    return (docTool === 'cloneStamp' ? paintGuard() : retouchGuard()) ? 'no' : 'toolRing';
  if (docTool === 'eraser' && eraserOpts.mode === 'block') return paintGuard() ? 'no' : 'eraserBlock';
  if (PAINT_TOOLS.has(docTool)) return paintGuard() ? 'no' : paintCursorPref() === 'precise' ? 'precise' : paintCursorPref() === 'standard' ? 'std:' + docTool : null;
  if (docTool === 'quickSelect' || docTool === 'selectionBrush') return null;   
  
  if (docTool === 'zoom') return zoomOutMode !== modKeys.alt ? 'zoomOut' : 'zoomIn';
  if (docTool === 'hand') return panCursorName();
  



  if (docTool === 'pen') {
    if (modKeys.ctrl) return 'pathDirect';   
    if (modKeys.alt) return 'penConvert';
    if (penState && penState.drag && penState.drag.moved) return 'penDrag';
    return penHoverCursor(penPointer)
        || 'pen';
  }
  

  

  if (docTool === 'shape') return 'shape';
  
  
  
  if (RETOUCH_TOOLS.has(docTool)) {
    if (retouchGuard()) return 'no';
    if (docTool === 'patch') return 'patch';
    if (docTool === 'contentMove') return rtPending ? 'moveSmall' : 'contentMove';   
    if (docTool === 'redEye') return 'redEye';
    return paintCursorPref() === 'precise' ? 'precise' : paintCursorPref() === 'standard' ? 'std:' + docTool : null;
  }
  if (docTool === 'penFree') return 'penFree';
  if (docTool === 'penCurvature') {
    if (penNearStart(penPointer)) return 'penCurvClose';
    if (penState && penNearAnchor(penPointer) >= 0) return 'penCurvAnchor';
    if (penState && penPointer && penNearSegment(penPointer)) return 'penCurvAdd';   
    return 'penCurv';
  }
  

  if (PATH_EDIT_TOOLS.has(docTool)) {
    if (pathGuard() && !(selLayer >= 0 && isTextLayer(selLayer) && effTextPath(selLayer))) return 'no';
    if (docTool === 'addAnchor') return 'penAdd';
    if (docTool === 'deleteAnchor') return 'penDel';
    if (docTool === 'convertPoint') return 'penConvert';
    if (docTool === 'pathSelect') return modKeys.alt ? 'pathCopy' : 'path';
    return modKeys.alt ? 'pathCopy' : 'pathDirect';
  }
  

  if (docTool === 'move') return modKeys.alt ? 'pathCopy' : 'moveArrow';
  if (docTool === 'bucket') return 'bucket';
  if (docTool === 'gradient') return 'gradient';
  
  if (AUX_TOOLS.has(docTool)) return docTool === 'colorSampler' ? 'sample' : docTool;
  if (docTool === 'eyedropper') return 'eyedropper';
  

  { const tpc = textPathCursor(); if (tpc) return tpc; }      
  if (TEXT_TOOLS.has(docTool)) {
    if (textBoxHover) return { nw: 'resizeNWSE', se: 'resizeNWSE', ne: 'resizeNESW', sw: 'resizeNESW', e: 'stretchH', w: 'stretchH', n: 'stretchV', s: 'stretchV' }[textBoxHover];
    const v = docTool === 'textVertical' || docTool === 'textMaskVertical';
    return v ? (textHover ? 'textVOver' : 'textV') : (textHover ? 'textOver' : 'text');
  }
  

  

  if (docTool === 'magicEraser') return paintGuard() ? 'no' : 'magicEraser';
  if (docTool === 'frame') return frameWhy() ? 'no' : 'shape';
  if (docTool === 'artboard') return abCursorName() || 'artboard';        
  if (docTool === 'slice') return 'slice';
  if (docTool === 'sliceSelect') return 'sliceSelect';
  if (docTool === 'cropPerspective') return pcropState && pcropState.pts ? 'moveSmall' : 'cropPersp';
  if (docTool === 'objectSelect') return osOpts.mode === 'lasso' ? 'objSelLasso' : 'objSelRect';
  


  if (SEL_TOOLS.has(docTool)) return docTool;
  return null;
}





export let textHover = false;
export function set_textHover(v) { return (textHover = v); }   
export let textBoxHover = null;          
export function set_textBoxHover(v) { return (textBoxHover = v); }   


function cursorCloseHint(){
  if (li || !doc) return false;
  const near = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(dispThr(8), 3);
  if (polyLasso) return polyLasso.pts.length >= 3 && near(polyLasso.cur, polyLasso.pts[0]);
  if (magLasso) return magLasso.path.length > 3 && near(magLasso.cur, magLasso.anchors[0]);
  return false;
}
function currentCursorMark(){
  

  if (!li && doc && docTool === 'patch') {
    const m = modKeys.shift && modKeys.alt ? 'intersect' : modKeys.shift ? 'add' : modKeys.alt ? 'subtract' : retouchOpts.selMode;
    return m === 'replace' || m === 'new' ? null : m;
  }
  if (li || !doc || !SEL_TOOLS.has(docTool)) return null;
  const m = effSelMode({ shiftKey: modKeys.shift, altKey: modKeys.alt });
  return m === 'replace' ? null : m;                    
}




export let lastGizmoCursor = '', cursorKickEl = null, cursorKickTimer = 0, inPointerEvt = false, lastPtr = null;
for (const t of ['pointermove', 'pointerdown', 'pointerup'])
  addEventListener(t, e => { lastPtr = { x: e.clientX, y: e.clientY }; inPointerEvt = true; setTimeout(() => { inPointerEvt = false; }, 0); }, true);
function kickCursor(css){
  if (inPointerEvt || !lastPtr || !document.body) return;
  const vp = $('#viewport'); if (!vp) return;
  const r = vp.getBoundingClientRect();
  if (lastPtr.x < r.left || lastPtr.x >= r.right || lastPtr.y < r.top || lastPtr.y >= r.bottom) return;
  let el = cursorKickEl;
  if (!el) {
    el = cursorKickEl = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent';
    const drop = () => { clearTimeout(cursorKickTimer); if (el.parentNode) el.remove(); };
    const forward = e => {
      drop();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      if (under && under !== el) under.dispatchEvent(new e.constructor(e.type, e));
      e.preventDefault(); e.stopPropagation();
    };
    el.addEventListener('pointerdown', forward);
    el.addEventListener('wheel', forward, { passive: false });
    el.addEventListener('pointermove', drop);
  }
  el.style.cursor = css || '';
  if (!el.parentNode) document.body.appendChild(el);
  clearTimeout(cursorKickTimer);
  cursorKickTimer = setTimeout(() => { if (el.parentNode) el.remove(); }, 150);
}
export function setGizmoCursorString(s){
  const g = $('#gizmo'); if (!g) return;
  const changed = (s || '') !== lastGizmoCursor; lastGizmoCursor = s || '';
  if (s) {
    g.style.setProperty('--gizmo-cursor', s);
    

    g.style.setProperty('cursor', s, 'important');
  } else {
    g.style.removeProperty('--gizmo-cursor');
    g.style.removeProperty('cursor');
  }
  const vp = $('#viewport');
  if (vp) {
    if (s) { vp.style.setProperty('--viewport-cursor', s); vp.style.setProperty('cursor', s, 'important'); }
    else { vp.style.removeProperty('--viewport-cursor'); vp.style.removeProperty('cursor'); }
  }
  if (changed) kickCursor(s);
}
function setViewportCursorString(s){
  const vp = $('#viewport'); if (!vp) return;
  if (s) vp.style.setProperty('--viewport-cursor', s); else vp.style.removeProperty('--viewport-cursor');
}

export function setGizmoCursor(name){
  if (!name) { syncGizmoCursor(); return; }
  const css = toolCursor(name, { mark: currentCursorMark(), eye: adjEye.active ? adjEyeTone() : '' }) || name;   
  setGizmoCursorString(css); setViewportCursorString(css);
}


export let brushCursor = null;
export function setBrushCursor(pt){
  
  
  const want = ringCursorOn();
  
  if (gizmo.classList.contains('ringcur') !== want) gizmo.classList.toggle('ringcur', want);
  if (!want) { if (brushCursor) { brushCursor = null; drawGizmo(); } return; }
  if (brushCursor && Math.abs(brushCursor.x - pt.x) < 0.4 && Math.abs(brushCursor.y - pt.y) < 0.4) return;
  brushCursor = { x: pt.x, y: pt.y };
  drawGizmo();
}
export function clearBrushCursor(){ if (brushCursor) { brushCursor = null; drawGizmo(); } }
export function drawBrushCursor(ctx){
  const c = brushCursor; if (!c) return;
  const qs = docTool === 'quickSelect', sb = docTool === 'selectionBrush', rtb = isRetouchBrush(docTool);
  const block = docTool === 'eraser' && eraserOpts.mode === 'block';
  const r = block ? 8 / zoom : Math.max(0.5, (qs ? qsOpts.size : sb ? sbOpts.size : rtb ? retouchOpts.size : brush.size) / 2);
  const hard = sb ? sbOpts.hardness : qs ? 1 : rtb ? retouchOpts.hardness : brush.hardness;
  const own = qs || sb || rtb;                  
  ctx.save();
  ctx.lineWidth = dispPx(1);
  

  const cp = PREF.get('cursors') || {}, prefTool = !own || rtb;
  const onlyCross = prefTool && cp.crosshairWhilePainting && !!curStroke;
  if ((capsPrecise && !qs) || onlyCross) {
    const t = dispPx(9), g = dispPx(2);
    for (const [color, w] of [['rgba(0,0,0,.85)', 3], ['rgba(255,255,255,.95)', 1]]) {
      ctx.lineWidth = dispPx(w); ctx.strokeStyle = color; ctx.beginPath();
      ctx.moveTo(c.x - t, c.y); ctx.lineTo(c.x - g, c.y); ctx.moveTo(c.x + g, c.y); ctx.lineTo(c.x + t, c.y);
      ctx.moveTo(c.x, c.y - t); ctx.lineTo(c.x, c.y - g); ctx.moveTo(c.x, c.y + g); ctx.lineTo(c.x, c.y + t); ctx.stroke();
    }
    ctx.restore(); return;
  }
  
  const tip = own ? 'round' : brush.tip, a = own || block ? 0 : -brush.angle * Math.PI / 180, rr = own || block ? 1 : brush.roundness;
  const outline = (rad, color, off) => {
    ctx.beginPath();
    const R = Math.max(0.5, rad - off * dispPx(1)), Ry = Math.max(0.5, rad * rr - off * dispPx(1));
    if (block || tip === 'square') { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a); ctx.rect(-R, -Ry, R * 2, Ry * 2); ctx.restore(); }
    else ctx.ellipse(c.x, c.y, R, Ry, a, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.stroke();
  };
  const rOut = (prefTool && cp.paint === 'normal' && !block && hard < 0.99) ? Math.max(0.5, r * (1 + hard) / 2) : r;
  for (const [color, off] of [['rgba(0,0,0,.85)', 0.5], ['rgba(255,255,255,.95)', 0]]) outline(rOut, color, off);
  if (prefTool && cp.crosshairInTip && !block) {
    const t = dispPx(5);
    ctx.beginPath(); ctx.moveTo(c.x - t, c.y); ctx.lineTo(c.x + t, c.y); ctx.moveTo(c.x, c.y - t); ctx.lineTo(c.x, c.y + t);
    ctx.lineWidth = dispPx(3); ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.stroke();
    ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  }
  if (hard < 0.99 && !block && (tip === 'round' || tip === 'square') && !(prefTool && cp.paint === 'normal')) {
    

    const ri = Math.max(0.5, r * hard);
    for (const [color, off] of [['rgba(0,0,0,.55)', 0.5], ['rgba(255,255,255,.6)', 0]]) outline(ri, color, off);
  }
  
  const mk = docTool === 'backgroundEraser' ? 'cross' : docTool === 'quickSelect'
    ? (currentCursorMark() === 'subtract' ? 'minus' : currentCursorMark() === 'intersect' ? '' : 'plus') : '';
  if (mk) {
    const t = dispPx(4);
    ctx.beginPath(); ctx.moveTo(c.x - t, c.y); ctx.lineTo(c.x + t, c.y);
    if (mk !== 'minus') { ctx.moveTo(c.x, c.y - t); ctx.lineTo(c.x, c.y + t); }
    ctx.lineWidth = dispPx(3); ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.stroke();
    ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  }
  
  if (!mk && r * (gizmo.getBoundingClientRect().width / (viewW() || 1) || 1) < 3) {
    const t = dispPx(5);
    ctx.beginPath(); ctx.moveTo(c.x - t, c.y); ctx.lineTo(c.x + t, c.y);
    ctx.moveTo(c.x, c.y - t); ctx.lineTo(c.x, c.y + t);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
  }
  ctx.restore();
}



function adjEyeTone(){
  const w = adjEye.active && adjEye.active.which;
  return w === 'black' ? 'Dark' : w === 'gray' ? 'Mid' : 'Light';
}
export function syncGizmoCursor(){
  const g = $('#gizmo'); if (!g) return;
  const on = !li && !!doc;
  
  const ring = on && ringCursorOn();
  g.classList.toggle('ringcur', ring);
  if (!ring) clearBrushCursor();         
  
  const cn = currentCursorName();
  const css = ring ? 'none' : (cn && cn.startsWith('std:')) ? PREF.standardToolCursor(cn.slice(4)) : (cn ? toolCursor(cn, {
    mark: currentCursorMark(), penStart: PEN_TOOLS.has(docTool) && !penState,
    eye: adjEye.active ? adjEyeTone() : '',      
    close: cursorCloseHint(), magnetic: !!freePenOpts.magnetic
  }) : '');
  setGizmoCursorString(css);
  setViewportCursorString(css);
}


export function syncToolButtons(){
  tools.setEnabled(true);
  for (const k of DOC_TOOLS) {
    const b = $('#' + TOOL_BTN[k]); if (!b) continue;
    b.disabled = false;
    if (!b.dataset.tip) b.dataset.tip = b.title;      
    b.title = b.dataset.tip;
  }
  syncToolOptions();
  syncToolPreset();
  syncDocTab();
}
export function syncToolOptions(){
  const tfOn = !!tfState, cropOn = !!cropState;
  const g = $('#grpTransform'); if (g) g.hidden = !tfOn;
  
  const gc = $('#grpCrop'); if (gc) { gc.hidden = !(cropOn || (!tfOn && !li && docTool === 'crop')); if (!gc.hidden) syncCropBar(); }
  const gt = $('#grpText'); if (gt) { gt.hidden = tfOn || cropOn || !!li || !TEXT_TOOLS.has(docTool); if (!gt.hidden) syncTextBar(); }
  const selOn = !tfOn && !cropOn && !li && SEL_TOOLS.has(docTool);
  const paintOn = !tfOn && !cropOn && !li && PAINT_TOOLS.has(docTool);
  const pathOn = !tfOn && !cropOn && !li && PATH_EDIT_TOOLS.has(docTool);
  const moveOn = !tfOn && !cropOn && !li && docTool === 'move';
  const zoomOn = !tfOn && !cropOn && !li && (docTool === 'zoom' || docTool === 'hand');
  const gmv = $('#grpMove'); if (gmv) gmv.hidden = !moveOn;
  const gzm = $('#grpZoom'); if (gzm) gzm.hidden = !zoomOn;
  if (moveOn) syncMoveBar();
  if (zoomOn) syncZoomBar();
  const shapeOn = !tfOn && !cropOn && !li && docTool === 'shape';
  const penOn = !tfOn && !cropOn && !li && PEN_TOOLS.has(docTool);
  const gradOn = !tfOn && !cropOn && !li && docTool === 'gradient';
  const bucketOn = !tfOn && !cropOn && !li && docTool === 'bucket';
  const eyeOn = !tfOn && !cropOn && !li && docTool === 'eyedropper';
  const retouchOn = !tfOn && !cropOn && !li && RETOUCH_TOOLS.has(docTool);
  const grt = $('#grpRetouch'); if (grt) grt.hidden = !retouchOn;
  if (retouchOn) syncRetouchBar();
  const ggd = $('#grpGrad'); if (ggd) ggd.hidden = !gradOn;
  const gbk = $('#grpBucket'); if (gbk) gbk.hidden = !bucketOn;
  const ged = $('#grpEyedrop'); if (ged) ged.hidden = !eyeOn;
  if (gradOn) syncGradBar();
  if (bucketOn) syncBucketBar();
  if (eyeOn) syncEyeBar();
  const gsh = $('#grpShape'); if (gsh) gsh.hidden = !shapeOn;
  const gpn = $('#grpPen'); if (gpn) gpn.hidden = !penOn;
  if (shapeOn) syncShapeBar();
  if (penOn) syncPenBar();
  $('#grpSel').hidden = !selOn;
  syncMagBar();
  syncPCropBar();
  syncSliceBar();
  syncArtboardBar();
  syncFrameBar();
  syncBrushOpBar();
  syncAuxBar();
  $('#grpBrush').hidden = !paintOn;
  $('#grpPath').hidden = !pathOn;
  if (selOn) syncSelBar();
  if (selOn) updateSelInfo();
  if (doc) syncAnts();                     
  if (paintOn) syncBrushPanel();
  if (pathOn) syncPathPanel();
}



const SEL_NO_AA = new Set(['selRect', 'selRow', 'selCol']);
export const selOpts = () => ({ feather: Math.max(0, +$('#selFeather').value || 0), antialias: SEL_NO_AA.has(docTool) ? false : $('#selAA').checked });


export const SEL_MODE_OWN = { quickSelect: 'replace', selectionBrush: 'add' };
const curSelMode = () => Object.prototype.hasOwnProperty.call(SEL_MODE_OWN, docTool) ? SEL_MODE_OWN[docTool] : selMode;
export function effSelMode(ev){
  const sh = !!(ev && ev.shiftKey), al = !!(ev && ev.altKey);
  if (docTool === 'selectionBrush') return al ? (SEL_MODE_OWN.selectionBrush === 'subtract' ? 'add' : 'subtract') : SEL_MODE_OWN.selectionBrush;
  if (docTool === 'quickSelect') return al ? 'subtract' : sh ? 'add' : SEL_MODE_OWN.quickSelect;
  if (sh && al) return 'intersect';
  if (sh) return 'add';
  if (al) return 'subtract';
  return selMode;
}
export function setSelMode(m){
  if (docTool === 'selectionBrush') { if (m === 'add' || m === 'subtract') SEL_MODE_OWN.selectionBrush = m; }
  else if (docTool === 'quickSelect') { if (m !== 'intersect') SEL_MODE_OWN.quickSelect = m; }
  else set_selMode(m);
  syncSelModeBtns();
}
export function syncSelModeBtns(){
  $('#grpSel')?.classList.toggle('selection-brush-options', docTool === 'selectionBrush');
  const m = curSelMode();
  for (const [k, id] of [['replace', '#selModeReplace'], ['add', '#selModeAdd'], ['subtract', '#selModeSubtract'], ['intersect', '#selModeIntersect']]) {
    const b = $(id); if (!b) continue;
    b.classList.toggle('on', k === m);
    b.hidden = (docTool === 'selectionBrush' && (k === 'replace' || k === 'intersect')) || (docTool === 'quickSelect' && k === 'intersect');
    
    const ic = docTool === 'selectionBrush' && (k === 'add' || k === 'subtract') ? { add: 'opt-sb-add', subtract: 'opt-sb-subtract' }[k]
      : docTool === 'quickSelect' && k !== 'intersect' ? { replace: 'opt-qs-new', add: 'opt-qs-add', subtract: 'opt-qs-subtract' }[k]
      : { replace: 'sel-new', add: 'sel-add', subtract: 'sel-subtract', intersect: 'sel-intersect' }[k];
    if (b.dataset.ic !== ic && hasUiIcon(ic)) {
      b.dataset.ic = ic; b.replaceChildren(icon(ic, 15));
      if (docTool === 'selectionBrush') b.append(k === 'add' ? '添加' : '减去');
    }
  }
}












const SEL_BAR_ICONS = {
  pen: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAC7UlEQVR42s2YPWhTURiGn4aA+BPp4pAsomgKgg6mgyBo3FSaSRczuZgunbSok203KbVDcTBBsFOy6GIdBJerONqAdMoVHJMhY7WDiLq8Fw6Xc+6fCckHlyRfTnKe+/28+U5mhsMhE7QLwA/ge+DITRDmBvASeAWcmwagS9r/KLAFnJkU0HXgCrAGvJdvFngBnMpPIE1rwB/gIfDEgJwFTmYBqgBVYA44CxTk3we+AV+AVgRMTte6AfUX+Ap4Mym6rAbcA0pAH/B1mVYW8LWQ/xbwyFIivwX1KXAkiVAZWNXjjp53U0T0NvDY8V4eOBF2RFkVWAEGQCMlSBwMwFPgjenIxcBsALtjhHltC5krTSuAByxnKPw4mHUbDICrqNt6bEjaw1YC7qiAy8B8CpjnwDYRRRW2BW3ignkgGNRlnvHeXWApK4wLqKFu6joiVxbEMxX7yGBsRV1ROnYsa+8LpqW6MmHOjwLGBnRVote11ExdkQmr8HFgT5smhXmrTMSmbM6ivkihUZrCtqx5Jth0KUFkfGUjFqgMdCzrAtBByH9IPxM39dqEikqTbzRGJFAhQpc8i/8ycDgUmW2J6V5MuRSS1FCW2Sawn8BpbbSX9QvDEdqPCHEp5DsiQfyg6zPwK8Xe+0mAfKUnbD2NH8HoYYrogWPDkrqpDWxaSsBPkrKeA6hlaFFgBxEw5tqOoyZ7SYA83Vm4JQe606pLPyxqX9VnBg7x9ZIAdZWSBcvaTYW5obGk5EjThtb4llQFae67xpm8Iz2rwDu1r2l1paKuCJjaVDTS3XbAVFSLq67QusaPptp30dENRQnbvAHRVxo6ljQFutPU9y2mBSrqLj2dFEZhK4pq3QEcKYwD3UUwUxf+A6RgwCxGwcQptW9ANR1ykOTE0jRg/LTjhw2qpvpoG8ehpEentj5bSwITVUM2u2h0Vx/4qAI1u6ygmSrQmXba08pMhv+Hjql95ywCuisF3nXM42MBGqvlmDKbOqB/xn7GDh5Efs4AAAAASUVORK5CYII=', 18],
  swap: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABa0lEQVR42u3XMUtbURQH8F8kVSmhWAKhg6P0K3QpGCUUAhVcOnbyI6gYCp0EEXFodz9AwUVxqFCFfotObnYKmkI6tFpJl1sIgebdR1/eBel/e++ed8//nnvO/7xT6Xa7UmJKYtwrArM4QjMVgQeYxz528DjlFbzAIVopc2AOuyEi9ZRJ2AzRaKesgkfYxns0hhcqEUL0AQsFkvmONVyk0oFfuMsTgQpqERvXcJJhcx4Ss/fnRTVi4wH6/3jqb8Hx2ehCtYSQf8Le8KnLInAdFPFzkULUwjGmM+xO8SrLeZ4I1LGF5fA8g5sRm1tc4l2M4zwE2tgMYjIOP7Ca957GEWjgDZ5PMkOrf6n7l1iPrP9CCTzBWzwrSxaHlfApDvCwwP2/4HVsGQ6CTpeK0V5QD4m3mPHdSuhqWejnJRBbeksF9IexSvgxVskm+Vt+hQ10QjdLNhechWicpxxMeqEXdPAVPydVBf9nw9LxG0GXSoJWSObwAAAAAElFTkSuQmCC', 16],
  refresh: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACVElEQVR42u3XS4iNYRgH8N/RXEymMdKUaYiFIpSmbFyyUe4rTSSUhRVWJCmxEGXGfibGmLKTjXJJkRGFmtgMKwuNjMts0BjjbvNOvR1nzvm+b05Mmv/q+Z7vfG//81z/b25wcNBEwhQTDJOESqFiHN/mMAM1qMRbfP7bhKqxESvRjOl579/gMS6hL0F2fv7xLxN2WQV2YkeIShI8RTfu5PkrcRq/cDBLDTXhHPanIAOL0YZDUSaqgm81ZmZJ2Tx0oj7P/xLX8AID4ZwmLMCmPOLbgv8ojoR0j12YRVLWiC40RL5+tOJRCHkhVGIdDqAu8n/PC0AfdqdJ2fE8MrewCw+LkIFvuBrq7VnaBhqL0GYsi57vh3B/SlFDr7EPQ+UYjHsiewDHSkSlEKpwArXjJdSM2dFzJz5mINOKVeUYjOsj+wNuZjizrVQ3pSE0GArzB87iS8ozG7E0dFUxvE/b9pPbfpJQ1qK+FzROMbwLOyvtbDqFtaHgD+NukgjVJDj4cgYyCwOZ0UBMK1fKOsLSTYutkT2CnnIQ6giTOy0WBaU5itsYHi+hvoxk6sMaqYhkyIVydNmSID3TLMu5IaqzIl93EHaZCX2N7DW4GPZUrsg3U9ESfjs/8veWqr9Cq6M3stvDGGgLEjXGK9yIZGx1JGM3FIhkH/aOVTtJCLXjfLDrcBLLM867KziT5N5WiND1MGe6CqS3BdsxJyGR56GGehLfPgsQypUYejmswJbQzg157/vxJGjwB6mvw2WQH7WhtUdCfQz/q7v9KIbSCvlJ+fFfEfoNXomHqBS9s8wAAAAASUVORK5CYII=', 18],
  objSub: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAApElEQVR42mN8/fo1w0ACJoYBBixI7A4GBgYXKpm7m4GBoZLUEHChosdch0wUjDpg1AEsNDSbEY/cf3o44DQeub0MDAzlAxkFzpSEgAmFlp8ZzQXDLhvuY2Bg4MMh94mBgcGJ1iHAR6bcaBoYfA44PNC5oJCBgYEdRyXCSCsHomfDn2TUbJ8IZEOalwNOo7lgxNUFZwYiBP5Dm1HUAnvg2WvE944BoIUXLPuwHQoAAAAASUVORK5CYII=', 16],
  showAll: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiUlEQVR42mN8/fo1w0ACJoYBBixI7IkMDAzWaPJHGRgY8tHEsKkjVT1cHXIIWNPR43C7GJHSwBkobUJjy1HsGfA0MKgS4VE62YliD+OILwdGHcCEVmJNpIOdKPawDEBJaD2aBkZLwtGScNQBoyXhaBrAVRCht1pp2S/AGgJH6ejxo6Ml4agDYAAAxcUlYVViH8IAAAAASUVORK5CYII=', 16],
  subject: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAC6klEQVR42u2YSUhVYRTHf/dpZpYhSFKLjIhULEhaiItsoCiymYgsySSKNtGiWlVQC6Fdy1aVrSppICoKAlNoFpEmWjQgmGZpFhlEg2mb/4XDx5vuu++FC//wePc773zn/e/5znSvNzAwwFhChDGG7DTY2AGsALKAu8DZ/+2haqDSrCcB84AyINfIK4ElmfTQBOAwsA54DdQBo8BN4BnwF+iVrgfsF8lbQCPwO90eqgBqZLjN7P0APAE6gD5jt026q7Q3KXgBs2w58BXoTFJ/IVCg2MoIoTGRZY3AK+AK8Ms57rXABqBE8fQGuKa4GjW6E4HNQDlwNIyHZgGXgT/68y/mRk4Ay2LsawGOAMNaF4pktoh1pxrU1cqY+4YMwO44ZPxY22XWg7LhyWbKR/ZA3ukysnylfCLUAxeBIa0vKRPbwxDqcsgALFIxTIRcoAq4o3V7IjKpVuqyDOkmRageOKig9DE1gP0Cc10oWw1hCK0HtgFzjex7AELfzHWJbK0JQ6jHpL+P7gCE3jslxNpMKahb1Eg7jOxRAEKPzXUH0JTohhIRuhFF1qvKXZ5g70s1Xh9v9QmdZVN09qVGdi6JfXZQKwVqgclhCdUA15Udm4y8FbgXZ99D5/eNwCF5vCYMoY+qzD3AcyMfVdONheNOc30hG/nAp6DNNQ/44cw0T4ERRy9fnoqGxY4N/+YrnFkqF/gZz0MrgWZgppF1RiFTBOyJc6N7gWmObMQhMwM4D6yO5aFiNcMc4KSUXRK1wFLpJoNuebEZ6Hd+2w4ckIe2+vO49VCVHmVaHTKeWshVfRcHqEPFwE4Nd3Wy5eOCAj/HjiRuDM1Wa/hsjrRRR5kO3AaOmRAoUiy+i1UY3VFjXxrJoHjpA05p3e8eZUTFaoHmXtfddaQfDVGOPQuYA+RF9NR5BjjtKNVKMRPvE7Y4siYF/vwIMF3CvigPhpmCa3vQn5n8LBtSVbYYziAht64NqZB63vj7oXFCIfEPxcOr1JFXeDQAAAAASUVORK5CYII=', 18],
};
export const mqOpts = { style: 'normal', w: 1, h: 1, sizeW: 64, sizeH: 64,   
  unitW: 'px', unitH: 'px', valW: 64, valH: 64 };                         


const MQ_UNITS = [
  ['px', '像素', /^(px|像素|pixels?)$/i], ['in', '英寸', /^(in|inch(es)?|英寸|")$/i], ['cm', '厘米', /^(cm|厘米)$/i],
  ['mm', '毫米', /^(mm|毫米)$/i], ['pt', '点', /^(pt|points?|点)$/i], ['pc', '派卡', /^(pc|picas?|派卡)$/i], ['%', '%', /^(%|百分比|percent)$/i],
];
function mqUnitPx(v, u, axis){
  if (u === '%') return v / 100 * (axis === 'h' ? docH : docW);
  const R = RULER_UNITS[u]; return R ? v * R.per() : v;
}

function mqParseLen(txt, curUnit){
  const m = String(txt).trim().replace(/，/g, ',').match(/^([+-]?\d*\.?\d+)\s*(.*)$/);
  if (!m) return null;
  const v = +m[1], us = m[2].trim();
  if (!(v > 0)) return null;
  if (!us) return { v, u: curUnit || 'px' };
  const hit = MQ_UNITS.find(q => q[2].test(us));
  return hit ? { v, u: hit[0] } : null;
}
const mqFmt = (v, u) => `${Math.round(v * 1000) / 1000} ${(MQ_UNITS.find(q => q[0] === u) || MQ_UNITS[0])[1]}`;

export function mqSizePx(){
  const one = (u, val, px, axis) => u === 'px' ? px : Math.max(1, Math.round(mqUnitPx(val, u, axis)));
  return { w: one(mqOpts.unitW, mqOpts.valW, mqOpts.sizeW, 'w'), h: one(mqOpts.unitH, mqOpts.valH, mqOpts.sizeH, 'h') };
}
export const wandOpts = { sample: 1, antialias: true };
const FEATHER_TOOLS = new Set(['selRect', 'selEllipse', 'selRow', 'selCol', 'lasso', 'lassoPoly', 'lassoMagnetic']);
export function selBarIcon(btn, key, alt){
  if (!btn || btn.dataset.iconed) return;
  const [src, px] = SEL_BAR_ICONS[key];
  const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; img.alt = alt || '';
  img.style.cssText = 'display:block;pointer-events:none';
  btn.replaceChildren(img); btn.dataset.iconed = '1';
}
export function syncSelBar(){
  const t = docTool;
  const show = (id, v) => { const e = $(id); if (e) e.hidden = !v; };
  const MQ = t === 'selRect' || t === 'selEllipse';
  show('#selFeatherWrap', FEATHER_TOOLS.has(t));
  show('#selAAWrap', FEATHER_TOOLS.has(t));
  const aaDis = SEL_NO_AA.has(t), aa = $('#selAA');
  
  if (aaDis && !aa.disabled) { aa.dataset.keep = aa.checked ? '1' : '0'; aa.checked = false; }
  else if (!aaDis && aa.disabled) aa.checked = aa.dataset.keep !== '0';
  aa.disabled = aaDis;
  $('#selAAWrap').style.opacity = aaDis ? '.45' : '';
  show('#mqStyleWrap', MQ);
  for (const id of ['#wandOpts', '#wandAAWrap', '#wandContigWrap', '#wandAllWrap']) show(id, t === 'wand');
  for (const id of ['#sbOpacityWrap', '#sbBrushBtn', '#sbOverlayBtn']) show(id, t === 'selectionBrush');
  if (t !== 'selectionBrush') for (const id of ['#sbOpts', '#sbShowWrap']) show(id, false);
  for (const id of ['#qsOpts', '#qsAllWrap', '#qsEnhanceWrap']) show(id, t === 'quickSelect');
  for (const id of ['#osFinderWrap', '#osOpts', '#osAllWrap', '#osHardWrap']) show(id, t === 'objectSelect');
  show('#osGear', t === 'objectSelect' || t === 'quickSelect');
  show('#selSubjectWrap', t === 'objectSelect' || t === 'quickSelect' || t === 'wand');
  show('#selMaskBtn', t !== 'selectionBrush');
  syncSelModeBtns();
  
  const st = $('#mqStyle'); if (st) st.value = mqOpts.style;
  const ratio = mqOpts.style === 'ratio', size = mqOpts.style === 'size';
  for (const [id, v, ax] of [['#mqW', ratio ? mqOpts.w : mqOpts.sizeW, 'W'], ['#mqH', ratio ? mqOpts.h : mqOpts.sizeH, 'H']]) {
    const e = $(id); if (!e) continue;
    e.disabled = !(ratio || size);
    const wantType = size ? 'text' : 'number';                 
    if (e.type !== wantType) e.type = wantType;
    const u = mqOpts['unit' + ax];
    if (document.activeElement !== e) e.value = mqOpts.style === 'normal' ? '' : size ? mqFmt(u === 'px' ? v : mqOpts['val' + ax], u) : String(v);
    e.title = size ? '固定大小：可带单位输入（像素 / 英寸 / 厘米 / 毫米 / 点 / 派卡 / %），按文档分辨率换算' : '比例值';
    e.style.width = size ? '76px' : '56px';
  }
  if ($('#mqSwap')) $('#mqSwap').disabled = !(ratio || size);
  const ws = $('#wandSample'); if (ws) ws.value = String(wandOpts.sample);
  const wa = $('#wandAA'); if (wa) wa.checked = wandOpts.antialias;
  syncSelBrushBar();
  syncQuickSelBar();
  const g = $('#grpSel');
  if (!g || g.dataset.selBound) return;
  g.dataset.selBound = '1';
  if (st) st.addEventListener('change', () => { mqOpts.style = st.value; syncSelBar(); });
  const numIn = (id, key) => { const e = $(id); if (!e) return;
    e.addEventListener('change', () => {
      if (mqOpts.style === 'size') {
        const ax = key === 'w' ? 'W' : 'H';
        const r = mqParseLen(e.value, mqOpts['unit' + ax]);
        if (r) {
          mqOpts['unit' + ax] = r.u; mqOpts['val' + ax] = r.v;
          mqOpts['size' + ax] = Math.max(1, Math.round(mqUnitPx(r.v, r.u, key)));
        }
        e.blur(); syncSelBar(); return;
      }
      const v = Math.max(0.001, +e.value || 0); if (!(v > 0)) return;
      if (mqOpts.style === 'ratio') mqOpts[key] = v;
      syncSelBar();
    }); };
  numIn('#mqW', 'w'); numIn('#mqH', 'h');
  const sw = $('#mqSwap');
  if (sw) { selBarIcon(sw, 'swap', '高度和宽度互换');
    sw.addEventListener('click', () => {
      if (mqOpts.style === 'ratio') [mqOpts.w, mqOpts.h] = [mqOpts.h, mqOpts.w];
      else if (mqOpts.style === 'size') { [mqOpts.sizeW, mqOpts.sizeH] = [mqOpts.sizeH, mqOpts.sizeW];
        [mqOpts.unitW, mqOpts.unitH] = [mqOpts.unitH, mqOpts.unitW]; [mqOpts.valW, mqOpts.valH] = [mqOpts.valH, mqOpts.valW]; }
      syncSelBar();
    }); }
  if (ws) ws.addEventListener('change', () => { wandOpts.sample = +ws.value || 1; });
  if (wa) wa.addEventListener('change', () => { wandOpts.antialias = wa.checked; });
  const ssb = $('#selSubjectBtn'); if (ssb) ssb.addEventListener('click', () => actions.run('select.subject'));
  const mp = $('#magPen'); if (mp) { selBarIcon(mp, 'pen', '光笔压力');
    mp.addEventListener('click', () => { magOpts.pen = !magOpts.pen; mp.classList.toggle('on', magOpts.pen); }); }
}



export function selBracket(dir, hardness){
  if (li || !doc) return false;
  if (docTool === 'lassoMagnetic') {
    if (hardness) return true;
    magOpts.width = Math.max(1, Math.min(256, magOpts.width + dir)); syncMagBar(); drawGizmo();
    shell.status(`磁性套索宽度：${magOpts.width} 像素`); return true;
  }
  if (docTool === 'quickSelect') {
    if (hardness) return true;
    qsOpts.size = bracketStep(qsOpts.size, dir);   
    syncQuickSelBar(); drawGizmo(); shell.status(`快速选择笔尖：${qsOpts.size} 像素`); return true;
  }
  if (docTool === 'selectionBrush') {
    if (hardness) sbOpts.hardness = Math.max(0, Math.min(1, Math.round((sbOpts.hardness + dir * 0.25) * 100) / 100));
    else sbOpts.size = bracketStep(sbOpts.size, dir);
    syncSelBrushBar(); drawGizmo();
    shell.status(hardness ? `选区画笔硬度：${Math.round(sbOpts.hardness * 100)}%` : `选区画笔大小：${sbOpts.size} 像素`); return true;
  }
  return false;
}







export const sbOpts = { size: 60, hardness: 1, opacity: 1, show: 'overlay', color: [255, 0, 128], overlayOp: 0.5 };
const SB_TILE = 256;
export let sbState = null;       
const sbTileKey = (x, y, cols) => ((y / SB_TILE) | 0) * cols + ((x / SB_TILE) | 0);
function sbTileSlot(x, y) { return ((y % SB_TILE) * SB_TILE) + (x % SB_TILE); }
function sbBaseAt(sel, x, y) {
  if (!sel || sel.width <= 0 || sel.height <= 0) return 0;
  const i = x - sel.x, j = y - sel.y;
  return i < 0 || j < 0 || i >= sel.width || j >= sel.height ? 0 : sel.data[j * sel.width + i];
}

function sbBaseUniform(sel) {
  if (!sel) return 0;
  const d = sel.data;
  if (!d || !d.__virtual || d.__base || d.__neg || d.__tiles?.size) return -1;
  if (sel.x !== 0 || sel.y !== 0 || sel.width !== docW || sel.height !== docH) return -1;
  return d.__fill | 0;
}
export let selOverlay = null;    
let qmaskOverlay = null;


export function setQuickMaskOverlay(sel, opts = {}) {
  if (!sel) { qmaskOverlay = null; return; }
  qmaskOverlay = { sel, color: opts.color || [255, 0, 0], opacity: opts.opacity ?? 0.5, inverted: !!opts.inverted, canvas: qmaskOverlay?.canvas || null, cache: null };
  selOverlay = null;
  syncAnts();
}
export function drawQuickMaskOverlay(ctx){
  const q = qmaskOverlay; if (!q || !q.sel) return;
  const s = q.sel, color = q.color, op = q.opacity;
  const m = ctx.getTransform ? ctx.getTransform() : null;
  const sx = (m && m.a) || 1, sy = (m && m.d) || 1, tx = m ? m.e : 0, ty = m ? m.f : 0;
  const cw = ctx.canvas?.width || docW, ch = ctx.canvas?.height || docH;
  const x0 = Math.max(0, Math.floor(-tx / sx) - 2), y0 = Math.max(0, Math.floor(-ty / sy) - 2);
  const x1 = Math.min(docW, Math.ceil((cw - tx) / sx) + 2), y1 = Math.min(docH, Math.ceil((ch - ty) / sy) + 2);
  const vw = x1 - x0, vh = y1 - y0;
  if (!(vw > 0 && vh > 0)) return;
  const k = Math.max(1, Math.ceil(vw / Math.max(1, cw)), Math.ceil(vh / Math.max(1, ch)));
  const ow = Math.max(1, Math.ceil(vw / k)), oh = Math.max(1, Math.ceil(vh / k));
  const key = { s, x0, y0, vw, vh, k, color, op, inverted: q.inverted };
  const cache = q.cache;
  if (!cache || cache.s !== s || cache.x0 !== x0 || cache.y0 !== y0 || cache.vw !== vw || cache.vh !== vh
      || cache.k !== k || cache.color !== color || cache.op !== op || cache.inverted !== q.inverted) {
    const c = q.canvas || document.createElement('canvas');
    c.width = ow; c.height = oh;
    const g = c.getContext('2d'), img = g.createImageData(ow, oh), D = img.data;
    const [r, gg, b] = color, sd = s.data, sxx = s.x, syy = s.y, sw = s.width, sh = s.height;
    let o = 0;
    for (let j = 0; j < oh; j++) {
      const yy = y0 + Math.min(vh - 1, Math.floor((j + .5) * k));
      for (let i = 0; i < ow; i++) {
        const xx = x0 + Math.min(vw - 1, Math.floor((i + .5) * k));
        const qi = xx - sxx, qj = yy - syy;
        const cov = qi < 0 || qj < 0 || qi >= sw || qj >= sh ? 0 : sd[qj * sw + qi];
        const v = q.inverted ? cov : 255 - cov;
        D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = Math.round(v * op); o += 4;
      }
    }
    g.putImageData(img, 0, 0);
    q.canvas = c; q.cache = key;
  }
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(q.canvas, x0, y0, vw, vh); ctx.restore();
}
export function set_selOverlay(v) { return (selOverlay = v); }   
export function syncSelBrushBar(){
  const g = $('#sbOpts'); if (!g) return;
  const set = (id, v) => { const e = $(id); if (e && document.activeElement !== e) e.value = String(v); };
  set('#sbSize', Math.round(sbOpts.size)); set('#sbHard', Math.round(sbOpts.hardness * 100)); set('#sbOpac', Math.round(sbOpts.opacity * 100));
  set('#sbShow', sbOpts.show); set('#sbOverlayOp', Math.round(sbOpts.overlayOp * 100));
  const c = $('#sbColor'); if (c && document.activeElement !== c) c.value = hexOf(sbOpts.color);
  const brushBtn = $('#sbBrushBtn');
  if (brushBtn) {
    brushBtn.textContent = `${Math.round(sbOpts.size)} ▾`;
    brushBtn.setAttribute('aria-expanded', String(!g.hidden));
    $('#sbOverlayBtn')?.setAttribute('aria-expanded', String(!$('#sbShowWrap').hidden));
  }
  if (g.dataset.bound) return;
  g.dataset.bound = '1';
  const overlayBtn = $('#sbOverlayBtn'); if (overlayBtn) overlayBtn.replaceChildren(icon('opt-settings', 16));
  const pop = (btn, box) => {
    if (!btn || !box) return;
    btn.onclick = () => {
      const open = box.hidden;
      for (const id of ['#sbOpts', '#sbShowWrap']) $(id).hidden = true;
      box.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) { const r = btn.getBoundingClientRect(); box.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;z-index:100`; }
    };
  };
  pop(brushBtn, g); pop(overlayBtn, $('#sbShowWrap'));
  document.addEventListener('pointerdown', ev => {
    if (ev.target.closest('#sbOpts,#sbShowWrap,#sbBrushBtn,#sbOverlayBtn')) return;
    for (const id of ['#sbOpts', '#sbShowWrap']) $(id).hidden = true;
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') for (const id of ['#sbOpts', '#sbShowWrap']) $(id).hidden = true;
  });
  const num = (id, fn, min, max) => { const e = $(id); if (e) e.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Math.round(+e.value || min))); e.value = String(v); fn(v); syncSelBrushBar(); drawGizmo(); }); };
  num('#sbSize', v => { sbOpts.size = v; }, 1, 5000);
  num('#sbHard', v => { sbOpts.hardness = v / 100; }, 0, 100);
  num('#sbOpac', v => { sbOpts.opacity = v / 100; }, 1, 100);
  num('#sbOverlayOp', v => { sbOpts.overlayOp = v / 100; selOverlay = null; }, 1, 100);
  const sh = $('#sbShow'); if (sh) sh.addEventListener('change', () => { sbOpts.show = sh.value; selOverlay = null; syncAnts(); drawGizmo(); });
  const c2 = $('#sbColor'); if (c2) c2.addEventListener('input', () => { sbOpts.color = hexToRGB(c2.value); selOverlay = null; drawGizmo(); });
}

const selBrushOverlayOn = () => !li && !!doc && docTool === 'selectionBrush' && sbOpts.show === 'overlay';
export function selBrushDown(ev, pt, override = {}){
  if (!selReady('选区画笔')) return;


  sbState = { base: override.base !== undefined ? override.base : selection, strokeTiles: new Map(), covTiles: new Map(),
              cols: Math.ceil(docW / SB_TILE), mode: override.mode || effSelMode(ev),
              last: { x: pt.x, y: pt.y }, dirty: null, raf: 0, opts: override.opts || null,
              onUpdate: override.onUpdate || null, onEnd: override.onEnd || null,
              pressure: ev?.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 1 };
  sbStamp(pt, pt);
  sbFlush();
}
export function selBrushMove(ev, pt){
  const st = sbState; if (!st) return;
  if (ev && ev.pointerType === 'pen' && ev.pressure > 0) st.pressure = ev.pressure;
  sbStamp(st.last, pt);
  st.last = { x: pt.x, y: pt.y };
  if (!st.raf) st.raf = requestAnimationFrame(() => { if (sbState) { sbState.raf = 0; sbFlush(); } });
}

function sbStamp(a, b){
  const st = sbState; if (!st) return;
  const opt = st.opts || sbOpts;
  const r = Math.max(0.5, opt.size / 2), h = Math.max(0, Math.min(1, opt.hardness));
  const top = Math.round(255 * opt.opacity * st.pressure);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.5, r * 0.2)));
  const sub = st.mode === 'subtract';
  let dx0 = docW, dy0 = docH, dx1 = -1, dy1 = -1;
  for (let s = (a === b ? 0 : 1); s <= steps; s++) {
    const cx = a.x + (b.x - a.x) * s / steps, cy = a.y + (b.y - a.y) * s / steps;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(docW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(docH - 1, Math.ceil(cy + r));
    if (x0 > x1 || y0 > y1) continue;
    if (x0 < dx0) dx0 = x0; if (y0 < dy0) dy0 = y0; if (x1 > dx1) dx1 = x1; if (y1 > dy1) dy1 = y1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (t >= 1) continue;
      let f = 1;
      if (t > h) { const u = 1 - (t - h) / (1 - h || 1); f = u * u * (3 - 2 * u); }
      const v = Math.round(top * f);
      const key = sbTileKey(x, y, st.cols), slot = sbTileSlot(x, y);
      let stroke = st.strokeTiles.get(key);
      if (!stroke) { stroke = new Uint8Array(SB_TILE * SB_TILE); st.strokeTiles.set(key, stroke); }
      if (v <= stroke[slot]) continue;
      stroke[slot] = v;
      let cov = st.covTiles.get(key);
      if (!cov) {

        cov = new Uint8Array(SB_TILE * SB_TILE);
        const uniform = sbBaseUniform(st.base);
        if (uniform >= 0) cov.fill(uniform);
        else {
          const tx0 = (x / SB_TILE) | 0, ty0 = (y / SB_TILE) | 0;
          for (let yy = 0; yy < SB_TILE; yy++) {
            const gy = ty0 * SB_TILE + yy; if (gy >= docH) break;
            for (let xx = 0; xx < SB_TILE; xx++) {
              const gx = tx0 * SB_TILE + xx; if (gx >= docW) break;
              cov[yy * SB_TILE + xx] = sbBaseAt(st.base, gx, gy);
            }
          }
        }
        st.covTiles.set(key, cov);
      }
      const bse = sbBaseAt(st.base, x, y);
      cov[slot] = sub ? Math.round(bse * (255 - v) / 255) : Math.round(bse + v * (255 - bse) / 255);
    }
  }
  if (dx1 < 0) return;
  const d = st.dirty;
  st.dirty = d ? { x0: Math.min(d.x0, dx0), y0: Math.min(d.y0, dy0), x1: Math.max(d.x1, dx1), y1: Math.max(d.y1, dy1) } : { x0: dx0, y0: dy0, x1: dx1, y1: dy1 };
}

function sbFlush(){
  const st = sbState; if (!st) return;
  const sel = SELM.brushSelection(docW, docH, st.covTiles, st.base);
  st.dirty = null;
  if (st.onUpdate) {
    st.onUpdate(isEmptySelection(sel) ? null : sel);
    drawGizmo();
    return;
  }
  set_selection(isEmptySelection(sel) ? null : sel);
  set_selPathCache(null);
  if (!selBrushOverlayOn()) syncAnts();
  drawGizmo(); updateSelInfo();
}
export function endSelBrush(){
  const st = sbState; sbState = null;
  if (!st) return false;
  if (st.raf) cancelAnimationFrame(st.raf);
  
  let sel = SELM.brushSelection(docW, docH, st.covTiles, st.base);
  if (isEmptySelection(sel)) sel = null;
  if (st.onEnd) { st.onEnd(sel); return true; }
  set_selection(st.base);
  setSelection(sel, { label: '选区画笔' });
  return true;
}

export function drawSelBrushOverlay(ctx){
  if (!selBrushOverlayOn() || !selection) return;
  const color = sbOpts.color, op = sbOpts.overlayOp, s = selection;
  const m = ctx.getTransform ? ctx.getTransform() : null;
  const sx = (m && m.a) || 1, sy = (m && m.d) || 1, tx = m ? m.e : 0, ty = m ? m.f : 0;
  const cw = ctx.canvas?.width || docW, ch = ctx.canvas?.height || docH;
  const x0 = Math.max(0, Math.floor(-tx / sx) - 2), y0 = Math.max(0, Math.floor(-ty / sy) - 2);
  const x1 = Math.min(docW, Math.ceil((cw - tx) / sx) + 2), y1 = Math.min(docH, Math.ceil((ch - ty) / sy) + 2);
  const vw = x1 - x0, vh = y1 - y0;
  if (!(vw > 0 && vh > 0)) return;

  const k = Math.max(1, Math.ceil(vw / Math.max(1, cw)), Math.ceil(vh / Math.max(1, ch)));
  const ow = Math.max(1, Math.ceil(vw / k)), oh = Math.max(1, Math.ceil(vh / k));
  if (!selOverlay || selOverlay.key !== s || selOverlay.x0 !== x0 || selOverlay.y0 !== y0
      || selOverlay.vw !== vw || selOverlay.vh !== vh || selOverlay.k !== k
      || selOverlay.color !== color || selOverlay.op !== op) {
    const c = selOverlay?.canvas || document.createElement('canvas');
    c.width = ow; c.height = oh;
    const g = c.getContext('2d'), img = g.createImageData(ow, oh), D = img.data;
    const [r, gg, b] = color, sd = s.data, sxx = s.x, syy = s.y, sw = s.width, sh = s.height;
    let o = 0;
    for (let j = 0; j < oh; j++) {
      const yy = y0 + Math.min(vh - 1, Math.floor((j + .5) * k));
      for (let i = 0; i < ow; i++) {
        const xx = x0 + Math.min(vw - 1, Math.floor((i + .5) * k));
        const qi = xx - sxx, qj = yy - syy;
        const v = qi < 0 || qj < 0 || qi >= sw || qj >= sh ? 0 : sd[qj * sw + qi];
        D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = Math.round(v * op); o += 4;
      }
    }
    g.putImageData(img, 0, 0);
    selOverlay = { key: s, x0, y0, vw, vh, k, canvas: c, color, op };
  }
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(selOverlay.canvas, x0, y0, vw, vh); ctx.restore();
}




function simplifyClosed(pts, tol){
  const n = pts.length >> 1; if (n <= 4 || tol <= 0) return pts;
  const P = i => [pts[2 * (i % n)], pts[2 * (i % n) + 1]];
  const keep = new Uint8Array(n); keep[0] = 1;
  
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const [x, y] = P(i); const d = (x - pts[0]) ** 2 + (y - pts[1]) ** 2; if (d > fd) { fd = d; far = i; } }
  keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop(); if (b - a < 2) continue;
    const [ax, ay] = P(a), [bx, by] = P(b);
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let mi = -1, md = -1;
    for (let i = a + 1; i < b; i++) { const [x, y] = P(i); const d = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out.length >= 6 ? out : pts;
}
export async function makeWorkPathFromSelectionUI(){
  if (!doc || !selection) { $('#notice').textContent = '先做一个选区。'; return false; }
  const v = await formDialog('建立工作路径', [
    { key: 'tol', label: '容差', type: 'number', value: 2, min: 0.5, max: 10, step: 0.5, unit: '像素' },
  ], { okText: '确定' });
  if (!v) return false;
  const tol = Math.max(0.5, Math.min(10, +v.tol || 2));
  const polys = selPath().filter(p => p.length >= 6);
  if (!polys.length) { $('#notice').textContent = '这个选区描不出路径（太小或全透明）。'; return false; }
  const subs = polys.map(p => simplifyClosed(p, tol)).map(p => {
    const knots = [];
    for (let k = 0; k + 1 < p.length; k += 2) knots.push({ anchor: [p[k], p[k + 1]] });
    return { closed: true, knots };
  });
  pushDocHistory('建立工作路径');
  workPathSet(subs, 'new');
  setSelection(null, { history: false });        
  shell.status(`建立工作路径：${subs.length} 条子路径（容差 ${tol} 像素）`);
  return true;
}


export function setSelection(sel, opts = {}){
  

  if (smOpen() && !smInternal) return smTakeToolSelection(sel);
  const next = (sel && !isEmptySelection(sel)) ? sel : null;
  if (next === selection) { syncAnts(); return selection; }
  

  if (!next && selection) set_lastSelection(selection);
  if (opts.history !== false) pushDocHistory(opts.label || (next ? '建立选区' : '取消选择'));
  set_selection(next);
  set_selPathCache(null);
  syncAnts();
  drawGizmo();
  updateSelInfo();
  if (opts.props !== false) renderProps();
  return selection;
}
export function combineInto(next, mode){
  if (!docW) return null;
  const base = selection || emptySelection(docW, docH);
  
  let out;
  try { out = mode === 'replace' ? next : combineSelection(base, next, mode); }
  catch (e) { $('#notice').textContent = e && e.message || String(e); return null; }
  return setSelection(out);
}
export function updateSelInfo(){
  const el = $('#selInfo'); if (!el) return;
  if (!selection) { el.textContent = doc ? '无选区' : ''; return; }
  const b = selectionBounds(selection);
  el.textContent = b ? `选区 ${b.width}×${b.height} @ ${b.x},${b.y} · ${Math.round(selectionArea(selection))} px` : '无选区';
}




export function affInv(m){
  const [a, b, c, d, e, f] = m, det = a * d - b * c;
  if (!det || !isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}









export function layerOnCanvas(i, opts){
  const rgb = !!(opts && opts.rgb);
  if (!docW || !docH || !doc || !doc.layers[i]) return null;
  const px = layerPixelSource(i);
  const tc = textRenders[i] && textCrops[i];
  const l = doc.layers[i];
  


  let srcArr = null, srcIdx = null, sw = 0, sh = 0, base = null;
  if (px) {
    sw = px.width; sh = px.height;
    base = tc ? { left: tc.bounds.left, top: tc.bounds.top } : { left: l.bounds.left, top: l.bounds.top };
    srcArr = px.data;
    srcIdx = (x, y) => (y * sw + x) * 4;
  } else {
    const full = renderLayerAlone(i);
    if (!full) return null;
    const tb = transformBase(i);
    const bb = (tb && tb.w > 0 && tb.h > 0) ? { left: tb.x, top: tb.y, w: tb.w, h: tb.h }
             : (() => { const q = opaqueBBox(full, docW, docH); return q ? { left: q.left, top: q.top, w: q.right - q.left, h: q.bottom - q.top } : null; })();
    if (!bb) return null;
    sw = Math.round(bb.w); sh = Math.round(bb.h); base = { left: Math.round(bb.left), top: Math.round(bb.top) };
    srcArr = full;
    srcIdx = (x, y) => { const dx = base.left + x, dy = base.top + y;
      return (dx >= 0 && dy >= 0 && dx < docW && dy < docH) ? (dy * docW + dx) * 4 : -1; };
  }
  if (!srcArr || !(sw > 0 && sh > 0)) return null;
  const out = rgb ? new Uint8Array(docW * docH * 4) : new Uint8Array(docW * docH);
  
  const emit = (arr, si, di) => {
    const a = arr[si + 3]; if (!a) return;
    if (!rgb) { out[di] = a; return; }
    const d = di * 4;
    out[d] = arr[si]; out[d + 1] = arr[si + 1]; out[d + 2] = arr[si + 2]; out[d + 3] = a;
  };
  const put = (data, w, h, ox, oy) => {
    for (let y = 0; y < h; y++) {
      const dy = Math.round(oy) + y; if (dy < 0 || dy >= docH) continue;
      for (let x = 0; x < w; x++) {
        const dx = Math.round(ox) + x; if (dx < 0 || dx >= docW) continue;
        emit(data, (y * w + x) * 4, dy * docW + dx);
      }
    }
  };
  const direct = () => {
    for (let y = 0; y < sh; y++) { const dy = base.top + y; if (dy < 0 || dy >= docH) continue;
      for (let x = 0; x < sw; x++) { const dx = base.left + x; if (dx < 0 || dx >= docW) continue;
        const si = srcIdx(x, y); if (si >= 0) emit(srcArr, si, dy * docW + dx); } }
    return out;
  };
  const t = isMeshTransform(i) ? null : transformChanged(i);
  if (!t) return direct();
  if (t.quad && QUADM && px) {                    
    try {
      const r = QUADM.warpQuad(px, t.quad, { samples: 2, flipX: !!t.flipX, flipY: !!t.flipY,
        clip: { x: 0, y: 0, width: docW, height: docH } });
      if (r && r.data) { put(r.data, r.width, r.height, r.x, r.y); return out; }
    } catch {  }
  }
  


  const ang = (t.rot || 0) * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang);
  const M = affMul([1, 0, 0, 1, t.x + t.w / 2, t.y + t.h / 2],
            affMul([cos, sin, -sin, cos, 0, 0],
            affMul([t.flipX ? -1 : 1, 0, 0, t.flipY ? -1 : 1, 0, 0],
                   [t.w / sw, 0, 0, t.h / sh, -t.w / 2, -t.h / 2])));
  const inv = affInv(M);
  if (!inv) return direct();
  
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sx, sy] of [[0, 0], [sw, 0], [sw, sh], [0, sh]]) {
    const dx = M[0] * sx + M[2] * sy + M[4], dy = M[1] * sx + M[3] * sy + M[5];
    x0 = Math.min(x0, dx); y0 = Math.min(y0, dy); x1 = Math.max(x1, dx); y1 = Math.max(y1, dy);
  }
  const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0));
  const bx = Math.min(docW, Math.ceil(x1)), by = Math.min(docH, Math.ceil(y1));
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    const sx = inv[0] * cx + inv[2] * cy + inv[4], sy = inv[1] * cx + inv[3] * cy + inv[5];
    if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
    const si = srcIdx(sx | 0, sy | 0);
    if (si >= 0) emit(srcArr, si, y * docW + x);
  }
  return out;
}

export const layerAlphaOnCanvas = i => layerOnCanvas(i);






export const loadLayerAlphaAsSelectionLazy = (idx, mode) =>
  doc ? runLazy(SELECT, '载入图层选区', () => loadLayerAlphaAsSelection(idx, mode)) : undefined;

export function loadLayerAlphaAsSelection(idx, mode){
  if (!doc) return;
  if (!selReady('载入图层选区')) return;
  const alpha = layerAlphaOnCanvas(idx);
  if (!alpha) { $('#notice').textContent = '这个图层没有像素，载入不了选区。'; return; }
  let b = layerSelBBox(idx);
  if (!b || !(b.w > 0 && b.h > 0)) {              
    const q = (() => { let x0 = docW, y0 = docH, x1 = -1, y1 = -1;
      for (let y = 0; y < docH; y++) for (let x = 0; x < docW; x++) if (alpha[y * docW + x]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; })();
    if (!q) { $('#notice').textContent = '这个图层在画布上没有可见像素，载入不了选区。'; return; }
    b = q;
  }
  const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
  const x1 = Math.min(docW, Math.round(b.x + b.w)), y1 = Math.min(docH, Math.round(b.y + b.h));
  if (x1 <= x || y1 <= y) { $('#notice').textContent = '图层完全在画布外，载入不了选区。'; return; }
  const w = x1 - x, h = y1 - y, data = new Uint8Array(w * h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) data[yy * w + xx] = alpha[(y + yy) * docW + (x + xx)];
  combineInto(createSelection(docW, docH, x, y, w, h, data), mode || 'replace');
}


const SPARSE_EDIT_PIXEL_LIMIT = 8 * 1024 * 1024;
function sparseEditRect(pp, map, label){
  let rect = { x: 0, y: 0, w: pp.w, h: pp.h };
  if (selection) {
    const b = selectionBounds(selection);
    if (!b) return null;
    const s = srcBoxOfDocRect(map.inv, b), x = Math.max(0, s.x0), y = Math.max(0, s.y0);
    rect = { x, y, w: Math.min(pp.w, s.x1) - x, h: Math.min(pp.h, s.y1) - y };
  }
  if (rect.w <= 0 || rect.h <= 0) return null;
  if (rect.w * rect.h > SPARSE_EDIT_PIXEL_LIMIT) {
    $('#notice').textContent = `超大图层${label}请先框选局部区域（当前范围 ${rect.w} × ${rect.h} 像素）`;
    return null;
  }
  return rect;
}
async function finishSparsePixelCommand(idx, pp, tx, label){
  const patches = tx.finish();
  if (!patches.length) return false;
  brushHistory.undo.push({ kind: 'sparsePixels', idx, patches });
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  histPush(label, 'brush');
  commitPixelPaint(idx);
  updateUndoButtons();
  return true;
}
async function clearSparseSelectionPixels(idx, pp){
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) { $('#notice').textContent = PAINT_WARP_WHY; return false; }
  const rect = sparseEditRect(pp, map, '清除'); if (!rect) return false;
  const tx = pp.sparse.begin();
  try {
    await tx.prepare(rect);
    const isBg = isBackgroundLayer(idx), contexts = tx.contexts(rect), M = map.M;
    for (const t of contexts) {
      let changed = false;
      for (let yy = 0; yy < t.height; yy++) for (let xx = 0; xx < t.width; xx++) {
      const sx = t.x + xx + 0.5, sy = t.y + yy + 0.5;
      const dx = Math.floor(M[0] * sx + M[2] * sy + M[4]), dy = Math.floor(M[1] * sx + M[3] * sy + M[5]);
      const cov = selection ? selectionValueAt(selection, dx, dy) : 255;
      if (cov <= 0) continue;
      const o = (yy * t.width + xx) * 4, a = cov / 255;
      if (isBg) {
        for (let c = 0; c < 3; c++) t.rgba[o + c] = Math.round(t.rgba[o + c] * (1 - a) + bgRGB[c] * a);
        t.rgba[o + 3] = 255;
      } else t.rgba[o + 3] = Math.round(t.rgba[o + 3] * (1 - a));
      changed = true;
      }
      if (changed) tx.dirty(t.key, { x0: 0, y0: 0, x1: t.width - 1, y1: t.height - 1 });
    }
    return await finishSparsePixelCommand(idx, pp, tx, '清除');
  } catch (e) {
    try { tx.rollback(); } catch {}
    $('#notice').textContent = '超大图层清除失败：' + (e?.message || e);
    return false;
  }
}
async function fillSparseSelectionPixels(idx, pp, color){
  const brt = $('#brTarget'), prevT = brt ? brt.value : null;
  if (brt) brt.value = 'pixels';
  const guard = paintGuard();
  if (brt) brt.value = prevT;
  if (guard) { $('#notice').textContent = guard; return false; }
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) { $('#notice').textContent = PAINT_WARP_WHY; return false; }
  const rect = sparseEditRect(pp, map, '填充'); if (!rect) return false;
  const tx = pp.sparse.begin();
  try {
    await tx.prepare(rect);
    const contexts = tx.contexts(rect), M = map.M;
    for (const t of contexts) {
      let changed = false;
      for (let yy = 0; yy < t.height; yy++) for (let xx = 0; xx < t.width; xx++) {
      const sx = t.x + xx + 0.5, sy = t.y + yy + 0.5;
      const dx = Math.floor(M[0] * sx + M[2] * sy + M[4]), dy = Math.floor(M[1] * sx + M[3] * sy + M[5]);
      const a = selection ? selectionValueAt(selection, dx, dy) : 255;
      if (a <= 0) continue;
      const o = (yy * t.width + xx) * 4, ca = a / 255, ba = t.rgba[o + 3] / 255, oa = ca + ba * (1 - ca);
      if (oa <= 0) { t.rgba[o + 3] = 0; continue; }
      for (let c = 0; c < 3; c++) t.rgba[o + c] = Math.round((color[c] * ca + t.rgba[o + c] * ba * (1 - ca)) / oa);
      t.rgba[o + 3] = Math.round(oa * 255);
      changed = true;
      }
      if (changed) tx.dirty(t.key, { x0: 0, y0: 0, x1: t.width - 1, y1: t.height - 1 });
    }
    return await finishSparsePixelCommand(idx, pp, tx, '填充');
  } catch (e) {
    try { tx.rollback(); } catch {}
    $('#notice').textContent = '超大图层填充失败：' + (e?.message || e);
    return false;
  }
}



export function clearSelectionPixels(){
  if (!doc || li) return;
  
  const brt = $('#brTarget');
  const prevT = brt ? brt.value : null;
  if (brt) brt.value = 'pixels';
  const guard = paintGuard();
  if (brt) brt.value = prevT;
  if (guard) { $('#notice').textContent = guard; return; }
  const idx = selLayer;
  const pp = ensurePixelPaint(idx, { sparse: true });
  if (!pp) { $('#notice').textContent = '这个图层没有像素。'; return; }
  if (pp.sparse) return clearSparseSelectionPixels(idx, pp);
  
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) { $('#notice').textContent = PAINT_WARP_WHY; return; }
  const M = map.M;
  let rect;
  if (selection) {
    const b = selectionBounds(selection);
    if (!b) return;
    const s = srcBoxOfDocRect(map.inv, b);
    const x0 = Math.max(0, s.x0), y0 = Math.max(0, s.y0);
    const x1 = Math.min(pp.w, s.x1), y1 = Math.min(pp.h, s.y1);
    if (x1 <= x0 || y1 <= y0) return;
    rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } else rect = { x: 0, y: 0, w: pp.w, h: pp.h };
  const before = cutRect(pp.rgba, pp.w, rect, 4);
  const isBg = isBackgroundLayer(idx);
  for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
    let cov = 255;
    if (selection) {
      const sx = rect.x + x + 0.5, sy = rect.y + y + 0.5;
      cov = selectionValueAt(selection, Math.floor(M[0] * sx + M[2] * sy + M[4]), Math.floor(M[1] * sx + M[3] * sy + M[5]));
    }
    if (cov <= 0) continue;
    const p = ((rect.y + y) * pp.w + rect.x + x) * 4;
    if (isBg) {
      


      const a = cov / 255;
      for (let c = 0; c < 3; c++) pp.rgba[p + c] = Math.round(pp.rgba[p + c] * (1 - a) + bgRGB[c] * a);
      pp.rgba[p + 3] = 255;
    } else {
      pp.rgba[p + 3] = Math.round(pp.rgba[p + 3] * (255 - cov) / 255);
    }
  }
  const after = cutRect(pp.rgba, pp.w, rect, 4);
  if (!sameBytes(before, after)) {
    const base = Uint8ClampedArray.from(pp.rgba); for (let y = 0; y < rect.h; y++) base.set(before.subarray(y * rect.w * 4, (y + 1) * rect.w * 4), ((rect.y + y) * pp.w + rect.x) * 4);
    brushHistory.undo.push(sparsePixelHistory(idx, base, pp.rgba, pp.w, pp.h));
    if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
    brushHistory.redo.length = 0;
    histPush('清除', 'brush');
    commitPixelPaint(idx);
    
    
    
    gpuForgetLayer(pp.rgba);
    renderPreviewOnly(); updateUndoButtons();
  }
}


export function fillSelectionPixels(color){
  if (!doc || li || !Array.isArray(color)) return;
  
  const pp = ensurePixelPaint(selLayer, { sparse: true });
  if (pp?.sparse) return fillSparseSelectionPixels(selLayer, pp, color);
  return paintPixelsWith(() => color);
}





export function selReady(what){
  if (SELM) return true;
  SELECT.load().catch(() => {});      

  $('#err').textContent = `${what}用不了：${SELECT.statusText()}`
    + (SELECT.error ? ' —— 再试一次，或刷新页面（其余功能不受影响）。' : '（马上就好，请再操作一次）');
  return false;
}
export const selectAll = () => { if (docW && selReady('全选')) combineInto(rectSelection(docW, docH, 0, 0, docW, docH, { antialias: false }), 'replace'); };

export const selectAllLazy = () => docW ? runLazy(SELECT, '全选', selectAll) : undefined;
export const deselect = () => setSelection(null);
export function invertSel(){ if (selection) setSelection(invertSelection(selection)); else selectAll(); }
export const invertSelLazy = () => (selection || docW) ? runLazy(SELECT, '反选', invertSel) : undefined;
export function featherSel(r){
  if (!(selection && r > 0)) return;
  try { setSelection(featherSelection(selection, r)); }
  catch (e) { $('#notice').textContent = e && e.message || String(e); }
}
export function expandSel(px){
  if (!selection) return;
  try { setSelection(expandSelection(selection, px)); } catch (e) { $('#notice').textContent = e && e.message || String(e); }
}
export function contractSel(px){
  if (!selection) return;
  try { setSelection(contractSelection(selection, px)); } catch (e) { $('#notice').textContent = e && e.message || String(e); }
}


export async function askPixels(label, def){
  const v = await promptDialog(label, String(def ?? ''), { title: label, label: '像素', okText: '确定' });
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export const askFeather = def => askPixels('羽化半径', def);









export function sampleRGBA(all, hide){
  if(all&&!hide&&doc?.mode===4){const n=nativeCMYKPreview();if(n?.supported)return cmykCompositeRGBA(n,getModeCodec(4)).data;}
  if (all) {
    const source=previewCompositeDoc(doc);
    const layers=source.layers.map((layer,i)=>{
      if (hide && hide(i, layer)) return {...layer, hidden:true};   
      if (transformChanged(i) && !isMeshTransform(i)) {
        const r=rasterizeTransformed(i);
        if(r?.rgba)return {...layer,rgba:r.rgba,bounds:{...r.bounds},width:r.bounds.right-r.bounds.left,height:r.bounds.bottom-r.bounds.top};
      }
      const cp=textRenders[i] && textCrops[i];
      if(cp?.rgba)return {...layer,rgba:cp.rgba,bounds:{...cp.bounds},width:cp.bounds.right-cp.bounds.left,height:cp.bounds.bottom-cp.bounds.top};
      return layer;
    });
    return compositeAll(composeDocForOrder({...source,layers},displayOrder()),docW,docH,new Map()).data;
  }
  const out = new Uint8Array(docW * docH * 4);
  const st = paintStates();
  const list = all ? displayOrder().filter(i => !st.hidden.has(i)) : (selLayer >= 0 ? [selLayer] : []);
  
  const over = (sr, sg, sb, sa0, d, op) => {
    const sa = sa0 / 255 * op;
    if (sa <= 0) return;
    const da = out[d + 3] / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    out[d]     = Math.round((sr * sa + out[d]     * da * (1 - sa)) / oa);
    out[d + 1] = Math.round((sg * sa + out[d + 1] * da * (1 - sa)) / oa);
    out[d + 2] = Math.round((sb * sa + out[d + 2] * da * (1 - sa)) / oa);
    out[d + 3] = Math.round(oa * 255);
  };
  for (const i of list) {
    const l = doc.layers[i];
    if (!l) continue;
    const op = all ? (st.opac[i] ?? 1) : 1;
    if (op <= 0) continue;
    

    const plain = l.rgba && l.width > 0 && l.height > 0 && !textRenders[i]
               && !isMeshTransform(i) && !transformChanged(i);
    if (plain) {
      const x0 = l.bounds.left, y0 = l.bounds.top;
      for (let y = 0; y < l.height; y++) {
        const dy = y0 + y; if (dy < 0 || dy >= docH) continue;
        for (let x = 0; x < l.width; x++) {
          const dx = x0 + x; if (dx < 0 || dx >= docW) continue;
          const s = (y * l.width + x) * 4;
          over(l.rgba[s], l.rgba[s + 1], l.rgba[s + 2], l.rgba[s + 3], (dy * docW + dx) * 4, op);
        }
      }
      continue;
    }
    const cv = layerOnCanvas(i, { rgb: true });   
    if (!cv) continue;
    for (let d = 0; d < out.length; d += 4) {
      if (cv[d + 3]) over(cv[d], cv[d + 1], cv[d + 2], cv[d + 3], d, op);
    }
  }
  return out;
}


export function sampleRGBAViewport(all = true, hide){
  if (docW * docH <= 64e6) return { data: sampleRGBA(all, hide), width: docW, height: docH, x: 0, y: 0 };
  const vp = $('#viewport'), st = $('#stage'), sr = vp?.getBoundingClientRect?.(), vr = st?.getBoundingClientRect?.();
  const originX = padL() * zoom, originY = padT() * zoom;
  const x0 = Math.max(0, Math.floor(((sr && vr) ? (vr.left - sr.left) : 0) / zoom - originX / zoom) - 2);
  const y0 = Math.max(0, Math.floor(((sr && vr) ? (vr.top - sr.top) : 0) / zoom - originY / zoom) - 2);
  const x1 = Math.min(docW, Math.ceil(((sr && vr) ? (vr.right - sr.left) : viewW() * zoom) / zoom - originX / zoom) + 2);
  const y1 = Math.min(docH, Math.ceil(((sr && vr) ? (vr.bottom - sr.top) : viewH() * zoom) / zoom - originY / zoom) + 2);
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), out = new Uint8Array(w * h * 4);
  const over = (r, g, b, a, q) => { const sa = a / 255, da = out[q + 3] / 255, oa = sa + da * (1 - sa); if (!oa) return;
    out[q] = Math.round((r * sa + out[q] * da * (1 - sa)) / oa); out[q + 1] = Math.round((g * sa + out[q + 1] * da * (1 - sa)) / oa);
    out[q + 2] = Math.round((b * sa + out[q + 2] * da * (1 - sa)) / oa); out[q + 3] = Math.round(oa * 255); };
  const ids = all || selLayer < 0 ? displayOrder() : [selLayer];
  for (const i of ids) {
    const l = doc.layers[i]; if (!l || l.hidden) continue;
    const b = l.bounds || { left: 0, top: 0 }, src = l.rgba, sw = l.width, sh = l.height;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const sx = x - b.left, sy = y - b.top; if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      let p = null;
      if (src) { const q = (sy * sw + sx) * 4; p = [src[q], src[q + 1], src[q + 2], src[q + 3]]; }
      else if (!l.lazyTileStore && !l.lazyPixelOps?.length && (l.lazyChannels || l.lazyImage || l.lazyRasterSource)) p = readLazyLayerPixel(l, sx, sy, doc.mode);
      if (!p && l.lazyPreview) { const qx = Math.min(l.lazyPreview.width - 1, Math.max(0, Math.floor(sx * l.lazyPreview.width / Math.max(1, l.width)))); const qy = Math.min(l.lazyPreview.height - 1, Math.max(0, Math.floor(sy * l.lazyPreview.height / Math.max(1, l.height)))); const q = (qy * l.lazyPreview.width + qx) * 4; p = [l.lazyPreview.data[q], l.lazyPreview.data[q + 1], l.lazyPreview.data[q + 2], l.lazyPreview.data[q + 3]]; }
      if (p) over(p[0], p[1], p[2], p[3], ((y - y0) * w + x - x0) * 4);
    }
  }
  return { data: out, width: w, height: h, x: x0, y: y0 };
}
export function shiftViewportSelection(sel, ox, oy){
  if (!sel || (!ox && !oy)) return sel;
  return { ...sel, x: sel.x + ox, y: sel.y + oy, docW, docH };
}
export function doWand(pt, mode){
  if (!doc || !docW) return;
  if (!selReady('魔棒')) return;
  
  const sx = Math.max(0, Math.min(docW - 1, Math.floor(pt.x)));
  const sy = Math.max(0, Math.min(docH - 1, Math.floor(pt.y)));
  const all = $('#wandAll').checked;
  if (!all && selLayer < 0) { $('#err').textContent = '魔棒按「当前图层」取样：请先在图层面板选中一个图层，或勾选「对所有图层取样」。'; return; }
  try {
    const sample = sampleRGBAViewport(all), rgba = sample.data;
    const sw = sample.width, sh = sample.height, sx0 = sx - sample.x, sy0 = sy - sample.y;
    

    const N = Math.max(1, wandOpts.sample | 0);
    let sampleColor = null;
    if (N > 1) {
      const h = N >> 1, acc = [0, 0, 0, 0]; let cnt = 0;
      for (let y = Math.max(0, sy0 - h); y <= Math.min(sh - 1, sy0 + h); y++)
        for (let x = Math.max(0, sx0 - h); x <= Math.min(sw - 1, sx0 + h); x++) {
          const o4 = (y * sw + x) * 4; for (let c = 0; c < 4; c++) acc[c] += rgba[o4 + c]; cnt++;
        }
      sampleColor = acc.map(v => Math.round(v / cnt));
    }
    
    const sel = shiftViewportSelection(magicWandSelection(rgba, sw, sh, sx0, sy0, {
      tolerance: Math.max(0, Math.min(255, +$('#wandTol').value || 0)),
      contiguous: $('#wandContig').checked, antialias: wandOpts.antialias, sampleColor,
    }), sample.x, sample.y);
    combineInto(sel, mode);
    $('#err').textContent = '';
  } catch (e) { $('#err').textContent = '魔棒取样失败：' + humanEditError(e && e.message || e); }
}


export function selPath(){
  if (!selection) return [];
  if (!selPathCache) set_selPathCache(selectionToPath(selection, { threshold: 128 }));
  return selPathCache;
}




let gizmoSizeCache = { w: -1, h: -1, at: -1e9 };
function gizmoSize(){
  const g = $('#gizmo'); if (!g) return null;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - gizmoSizeCache.at < 16 && now >= gizmoSizeCache.at) return gizmoSizeCache;
  const r = g.getBoundingClientRect();
  gizmoSizeCache = { w: r.width, h: r.height, at: now };
  return gizmoSizeCache;
}









export function dispPx(n){
  if (viewAngle && zoom>0) return n/zoom;
  const g = gizmoSize();
  const w = g ? g.w : 0;
  return w > 0 && docW > 0 ? n * viewW() / w : n;
}
export let antsOffset = 0, antsRAF = 0;
function antsWanted(){
  if (!doc || !docW || !selection || qmaskOverlay) return false;
  if (selBrushOverlayOn() || smViewHidesAnts()) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  const st = $('#stage'); if (!st || st.hidden) return false;
  const r = gizmoSize();
  return !!r && r.w > 0 && r.h > 0;
}
function antsFrame(){
  antsRAF = 0;
  if (!antsWanted()) return;                 
  antsOffset = (antsOffset + 0.5) % 1024;
  drawGizmo();
  antsRAF = requestAnimationFrame(antsFrame);
}
export function syncAnts(){
  if (antsWanted()) { if (!antsRAF) antsRAF = requestAnimationFrame(antsFrame); }
  else if (antsRAF) { cancelAnimationFrame(antsRAF); antsRAF = 0; }
}
addEventListener('visibilitychange', syncAnts);
function tracePolys(ctx, polys){
  ctx.beginPath();
  for (const p of polys) {
    if (p.length < 4) continue;
    ctx.moveTo(p[0], p[1]);
    for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
    ctx.closePath();
  }
}






export function strokeAnts(ctx, trace, offset){
  const dash = dispPx(4);                                  
  ctx.save();
  ctx.lineWidth = dispPx(1);
  ctx.setLineDash([dash, dash]);
  trace(ctx);
  const ph = offset == null ? 0 : -offset * dash / 4;
  ctx.lineDashOffset = ph;                                 
  ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.stroke();
  ctx.lineDashOffset = ph + dash;                          
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  ctx.restore();
}
export function drawAnts(ctx){
  if (!selection || !selEdgesOn) return;
  if (selBrushOverlayOn() || smViewHidesAnts()) return;   
  if (tfState && tfState.sel) return;          
  const polys = selPath();
  if (!polys.length) return;
  strokeAnts(ctx, c => tracePolys(c, polys), antsOffset);
}

export function drawSelDragPreview(ctx){
  if (!selDrag) return;
  
  
  if (selDrag.mode && selDrag.mode !== 'replace' && docW) {
    try {
      const o = selOpts();
      let next = null, key = selDrag.mode + '|' + selDrag.tool + '|';
      if (selDrag.tool === 'lasso') {
        key += selDrag.pts.length;
        if (selDrag.pts.length >= 3) next = lassoSelection(docW, docH, selDrag.pts, o);
      } else {
        const r = selDragRect(selDrag);
        key += r.x + ',' + r.y + ',' + r.w + ',' + r.h;
        if (r.w >= 1 && r.h >= 1) next = (selDrag.tool === 'selEllipse' ? ellipseSelection : rectSelection)(docW, docH, r.x, r.y, r.w, r.h, o);
      }
      if (selDrag._previewKey !== key) {
        selDrag._previewKey = key;
        selDrag._previewPolys = next ? selectionToPath(combineSelection(selection || emptySelection(docW, docH), next, selDrag.mode)) : [];
      }
      const polys = selDrag._previewPolys || [];
      if (polys.length) {
        strokeAnts(ctx, c => tracePolys(c, polys), null);
        return;
      }
    } catch {  }
  }
  
  
  strokeAnts(ctx, c => {
    if (selDrag.tool === 'lasso') {
      const p = selDrag.pts;
      if (p.length < 2) { c.beginPath(); return; }
      c.beginPath(); c.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y);
      c.closePath();
      return;
    }
    const r = selDragRect(selDrag);
    c.beginPath();
    if (!(r.w > 0 && r.h > 0)) return;
    if (selDrag.tool === 'selEllipse') c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    else c.rect(r.x, r.y, r.w, r.h);
  }, null);
}
export function selDragRect(d){
  
  if (d.tool === 'selRow') return { x: 0, y: Math.max(0, Math.min(docH - 1, Math.floor(d.y1))), w: docW, h: 1 };
  if (d.tool === 'selCol') return { x: Math.max(0, Math.min(docW - 1, Math.floor(d.x1))), y: 0, w: 1, h: docH };
  
  const snap = d.tool === 'selRect' ? (r => { const x0 = Math.round(r.x), y0 = Math.round(r.y);
    return { x: x0, y: y0, w: Math.round(r.x + r.w) - x0, h: Math.round(r.y + r.h) - y0 }; }) : (r => r);
  const style = d.style || 'normal';
  
  if (style === 'size') {
    const w = Math.max(1, d.sizeW), h = Math.max(1, d.sizeH);
    return snap(d.center ? { x: d.x1 - w / 2, y: d.y1 - h / 2, w, h } : { x: d.x1, y: d.y1, w, h });
  }
  let dx = d.x1 - d.x0, dy = d.y1 - d.y0;
  
  if (style === 'ratio' && d.ratio > 0) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax * d.ratio >= ay) dy = Math.sign(dy || 1) * ax * d.ratio; else dx = Math.sign(dx || 1) * ay / d.ratio;
  } else if (d.square) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
  if (d.center) {                                
    const hw = Math.abs(dx), hh = Math.abs(dy);
    return snap({ x: d.x0 - hw, y: d.y0 - hh, w: hw * 2, h: hh * 2 });
  }
  return snap({ x: Math.min(d.x0, d.x0 + dx), y: Math.min(d.y0, d.y0 + dy), w: Math.abs(dx), h: Math.abs(dy) });
}
