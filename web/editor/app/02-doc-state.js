




import './01-boot.js';   
import { captureRasterWarpOptions, restoreRasterWarpOptions } from '../transform-warp-raster.js';
import { installColorMgmt } from '../color-mgmt.js';
import { DOC_EXT } from '../layerb.js';
import { shell } from '../shell.js';
import { $, EDIT, NEWDOC, applyEdits, cloneDeform, ensureLazy } from './01-boot.js';
import {
  HXP, docHistory, histCap, histLog, set_hxFresh, set_pendingReplSO, set_soEnterSnap, structuralApply,
  structuralBegin, structuralDone, syncHistoryPanel,
} from './03-history.js';
import {
  fitStage, panX, panY, set_panX, set_panY, set_zoom, set_zoomFitCap, set_zoomFitMode, zoom, zoomFitCap,
  zoomFitMode,
} from './04-view-chrome.js';
import { commit } from './06-view-zoom-move.js';
import { endMoveDrag, moveDrag, set_layerMarq, set_moveDrag } from './07-nav-histogram.js';
import {
  docResolution, docResolutionBase, docSizeBase, pendingCropDelete, set_docResolution, set_docResolutionBase,
  set_docSizeBase, set_pendingCropDelete,
} from './08-doc-size.js';
import { commitCrop, cropState, set_cropAwareCache } from './10-crop.js';
import { set_gradDrag } from './11-paint-common.js';
import { qmask, toggleQuickMask } from './13-quickmask-apply-image.js';
import { layerPixelJob } from './14-edit-misc.js';
import { set_liveGradEdit } from './15-gradient-bucket-eyedropper.js';
import {
  activePath, cancelPen, commitPen, docPathsKey, penState, savedPaths, savedPathsDirty, set_activePath,
  set_docPathsKey, set_savedPaths, set_savedPathsDirty, set_shapeState, set_workPath, set_workPathDirty,
  workPath, workPathDirty,
} from './17-shape-pen.js';
import { set_freePen, set_magPen } from './18-pen-extra.js';
import { commitFreeTransform, tfState } from './19-free-transform.js';
import {
  builtIndexOf, dupPending, dupTask, dupTimer, hasAnyEdits, materializeDupes, refreshAll, soInside,
  soRasterCache,
} from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { DEFORM_LABEL, applyDeformClass, deformPending, deformTool, exitSO, syncDeformBar } from './22-deform-tools.js';
import {
  collapsedGroups, fxListOpenSet, layerCanvasCache, maskThumbCache, selLayer, selLayers, set_selLayer,
  sfListOpenSet, thumbCache,
} from './23-layers-panel.js';
import { addAdjustmentLayer, cloneOpValue, humanEditError, renderProps } from './24-layer-ops-queue.js';
import { set_dragRowIndex } from './28-layer-props-transform.js';
import { set_soloSnapshot, soloSnapshot } from './29-scrubby-live.js';
import {
  chanView, ensureScratch, gpuSnapshotCanvas, renderPreviewOnly, renderStaticLayers, renderWarpNow,
  set_belowCache, set_composeLiveIdx, set_paintTempPair, viewEmpty, viewScratch,
} from './30-render.js';
import {
  closeMaskEdit, copyToolData, countGroup, historySource, historySourceInfo, measureLine, set_auxDrag,
  set_countGroup, set_historySource, set_historySourceInfo, set_measureLine, set_mixerCarry, set_moveHover,
  set_panelHover, set_samplerPxCache, set_toolData, set_viewAngle, viewAngle,
} from './31-selection-brush.js';
import { endSelBrush, sbState, syncToolButtons } from './32-cursors-select-options.js';
import {
  cancelMagLasso, cancelPolyLasso, magLasso, objFinderReset, polyLasso, set_osState, set_qsEdgeCache,
  set_qsState,
} from './33-lasso-quick-select.js';
import {
  cancelPCrop, docSlices, pcropState, set_docSlices, set_lastAutoHit, set_sliceDrag, set_sliceSel,
  set_slicesDirty, sliceSel, slicesDirty,
} from './34-perspective-crop-slice.js';
import { abSel, artboardCache, set_abSel, set_abState, set_artboardCache } from './35-artboard.js';
import { set_abPending, set_frameState } from './36-clipboard-frame.js';
import { set_boOffset } from './37-local-pixel-tools.js';
import { endStroke, forkPixelPaint, set_lastPaintPt } from './38-brush-engine.js';
import { set_adjOverlayCache } from './39-brush-options.js';
import { set_smViewCache } from './40-options-bar-wiring.js';
import { adjRAF, adjState, adjustGuard, set_adjRAF, set_adjState } from './41-image-adjust.js';
import {
  set_pathDrag, set_pathHoverNode, set_pathModel, set_pathNodes, set_pathSelNode, vpathCache, vstrokeCache,
} from './44-vector-path.js';
import {
  pathSelAnchors, pathSelSubs, set_pathAnchorDrag, set_pathMarquee, set_pathSegDrag, set_pathSubDrag,
} from './45-path-tools.js';
import { filterPending, soFilterEdits, soFilterOrig, soFilterShadow, soFilters } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import {
  buildPsdBuffer, exportName, setWaitCursor, set_exportName, set_infoCompCache, syncInfoPanel,
} from './48-info-export.js';
import { set_alphaCarry, set_textDynamicCarry, textDescEdits, textDynamicCarry } from './52-alpha-text-menu.js';
import { rtPending, set_csOverlayCache, set_retouchState } from './53-retouch-clone-pattern.js';
import { rtPendingCommit } from './54-gestures-hints.js';







export let doc = null, sos = [], cur = 0, docW = 0, docH = 0;
export function set_doc(v) { return (doc = v); }   
export function set_sos(v) { return (sos = v); }   
export function set_cur(v) { return (cur = v); }   
export function set_docW(v) { return (docW = v); }   
export function set_docH(v) { return (docH = v); }   
export let SFX = null;                   
export function set_SFX(v) { return (SFX = v); }   
export let LX = null;                    
export function set_LX(v) { return (LX = v); }   
export let LP = null;                    
export function set_LP(v) { return (LP = v); }   
export let CHP = null;                   
export function set_CHP(v) { return (CHP = v); }   
export let li = null, img = null, replImg = null, soImgURL = null, replImgURL = null;
export function set_li(v) { return (li = v); }   
export function set_img(v) { return (img = v); }   
export function set_replImg(v) { return (replImg = v); }   
export function set_soImgURL(v) { return (soImgURL = v); }   
export function set_replImgURL(v) { return (replImgURL = v); }   
export let replFile = null;            
export function set_replFile(v) { return (replFile = v); }   
export let soLayerIndex = -1, dragState = null;
export function set_soLayerIndex(v) { return (soLayerIndex = v); }   
export function set_dragState(v) { return (dragState = v); }   
export let origBuffer = null;            
export function set_origBuffer(v) { return (origBuffer = v); }   
export let docLabel = '';                
export function set_docLabel(v) { return (docLabel = v); }   
export let docName = '';                 
export function set_docName(v) { return (docName = v); }   
export const soEdits = {};               
export const soRepl = {};                
export const soBaked = {};               
export const soOrigRaster = {};          
export let layerTree = null;             
export function set_layerTree(v) { return (layerTree = v); }   
export const layerEdits = {};            
export let layerStateVersion = 0;
export function bumpLayerStateVersion(){ return ++layerStateVersion; }
export const layerRenames = {};          
export const layerDeletes = new Set();   
export const layerTextEdits = {};        
export const textRenders = {};           
export const textCrops = {};             
export const layerTransforms = {};       
export const layerOps = {};              
export const layerParamsCache = {};      
export const paramUI = {};               
export const gradState = {};             
export let aspectLock = true;            
export function set_aspectLock(v) { return (aspectLock = v); }   

export const DOC_MODE_NAMES = { 0: '位图', 1: '灰度', 2: '索引', 3: 'RGB', 4: 'CMYK', 7: '多通道', 8: '双色调', 9: 'Lab' };
export let proofOn = false;              
export function set_proofOn(v) { return (proofOn = v); }   

export const CM = installColorMgmt({
  getDoc: () => doc, getBuffer: () => origBuffer, docName: () => docName,
  hasEdits: () => hasAnyEdits(),
  buildFull: async () => (await buildPsdBuffer()).buf,
  commit: async (buf, label) => {
    const prev = structuralBegin();
    await initDocument(buf, docName, { nested: docStack.length > 0 });
    refreshAll(false);
    structuralDone(prev, label);
  },
  reparse: async () => {
    const buf = hasAnyEdits() ? (await buildPsdBuffer()).buf : origBuffer.slice(0);
    const prev = structuralBegin();
    await initDocument(buf, docName, { nested: docStack.length > 0 });
    refreshAll(false);
    structuralDone(prev, '重新显示');
  },
  rerender: () => { if (doc) { if (li) { renderStaticLayers(); renderWarpNow(); } else renderPreviewOnly(); } },
  setProofOn: () => {},
  status: m => shell.status(m), err: m => { $('#err').textContent = m; },
  busy: v => setWaitCursor(!!v),
  syncInfo: () => syncInfoPanel(),
  resolution: () => docResolution || 72,
  selLayer: () => selLayer,
  canPixelJob: () => !!doc && !li && selLayer >= 0 && !adjustGuard(),
  layerPixelJob: (label, fn) => layerPixelJob(label, fn),
  addAdjustmentLayer: (k, v) => addAdjustmentLayer(k, v),
});
export let TInputs = null;               
export function set_TInputs(v) { return (TInputs = v); }   
export const meshRotState = {};          
export const meshFlipState = {};         
export let meshEditInProgress = false;   
export function beginMeshEdit(){ if (!meshEditInProgress) { pushHistory(); meshEditInProgress = true; } }
export function endMeshEdit(){ meshEditInProgress = false; }
export let textDrag = null;               
export function set_textDrag(v) { return (textDrag = v); }   
export let textOverlay = null;            
export function set_textOverlay(v) { return (textOverlay = v); }   
export let maskEdit = null;               
export function set_maskEdit(v) { return (maskEdit = v); }   
export const textFontSubst = {};         
export const textStyleEdits = {};        
export const fontCache = {};             
export let layerReorder = null;          
export function set_layerReorder(v) { return (layerReorder = v); }   




export const layerDupes = [];            



export let guides = [];
export function set_guides(v) { return (guides = v); }   
export let guidesGrid = { h: 0, v: 0 };  
export function set_guidesGrid(v) { return (guidesGrid = v); }   
export let guidesDirty = false;
export function set_guidesDirty(v) { return (guidesDirty = v); }   


export let vpRaw = null, vpPlanesDoc = null, vpDirty = false, vpMod = null;
export function set_vpRaw(v) { return (vpRaw = v); }   
export function set_vpPlanesDoc(v) { return (vpPlanesDoc = v); }   
export function set_vpDirty(v) { return (vpDirty = v); }   
export function set_vpMod(v) { return (vpMod = v); }   
export let guidesVisible = true;
export function set_guidesVisible(v) { return (guidesVisible = v); }   

export let artboardGuidesOn = true, countVisible = true, notesVisible = true, editPinsOn = true, brushPreviewOn = true;
export function set_artboardGuidesOn(v) { return (artboardGuidesOn = v); }   
export function set_countVisible(v) { return (countVisible = v); }   
export function set_notesVisible(v) { return (notesVisible = v); }   
export function set_editPinsOn(v) { return (editPinsOn = v); }   
export function set_brushPreviewOn(v) { return (brushPreviewOn = v); }   

export let viewPar = 1, viewParCorrect = false;
export function set_viewPar(v) { return (viewPar = v); }   
export function set_viewParCorrect(v) { return (viewParCorrect = v); }   
export let hexAlpha = (c, a) => `rgba(120,120,120,${a})`;   
export function set_hexAlpha(v) { return (hexAlpha = v); }   




export let globalLight = { angle: 120, altitude: 30 };
export function set_globalLight(v) { return (globalLight = v); }   
export let globalLightBase = { angle: 120, altitude: 30 };
export function set_globalLightBase(v) { return (globalLightBase = v); }   
export let globalLightDirty = false;
export function set_globalLightDirty(v) { return (globalLightDirty = v); }   


export let pixelGridOn = true;
export function set_pixelGridOn(v) { return (pixelGridOn = v); }   
export let viewFlip = false;               
export function set_viewFlip(v) { return (viewFlip = v); }   

export const gridOpts = { on: false, every: 64, sub: 4, color: 'rgba(120,120,120,.55)' };
export let layerEdgesOn = false, smartGuidesOn = true, guidesLocked = false, slicesLocked = false, selEdgesOn = true;
export function set_layerEdgesOn(v) { return (layerEdgesOn = v); }   
export function set_smartGuidesOn(v) { return (smartGuidesOn = v); }   
export function set_guidesLocked(v) { return (guidesLocked = v); }   
export function set_slicesLocked(v) { return (slicesLocked = v); }   
export function set_selEdgesOn(v) { return (selEdgesOn = v); }   
export const PIXEL_GRID_MIN_ZOOM = 5;
export let rulersVisible = false;     
export function set_rulersVisible(v) { return (rulersVisible = v); }   
export let guideDrag = null;             
export function set_guideDrag(v) { return (guideDrag = v); }   




export let selection = null;             
export function set_selection(v) { return (selection = v); }   
export let lastSelection = null;         
export function set_lastSelection(v) { return (lastSelection = v); }   
export const maskPaint = {};             
export const pixelPaint = {};            
export const brushHistory = { undo: [], redo: [] };   
export let selPathCache = null;          
export function set_selPathCache(v) { return (selPathCache = v); }   
export let selDrag = null;               
export function set_selDrag(v) { return (selDrag = v); }   
export let curStroke = null;             
export function set_curStroke(v) { return (curStroke = v); }   

export let hover = null;                 
export function set_hover(v) { return (hover = v); }   
export let hoverPt = -1, selPt = -1;     
export function set_hoverPt(v) { return (hoverPt = v); }   
export function set_selPt(v) { return (selPt = v); }   
export const history = {};               







export let deformIdx = -1;                 
export function set_deformIdx(v) { return (deformIdx = v); }   
export let deformMeshMeta = null;          
export function set_deformMeshMeta(v) { return (deformMeshMeta = v); }   

export const snapshot = () => (li.deforms && li.deforms.length)
  ? { deforms: li.deforms.map(cloneDeform), idx: deformIdx, rot: meshRotState[soLayerIndex] || 0, flip: { ...(meshFlipState[soLayerIndex] || {}) } }
  : { points: li.points.map(p => ({ x:p.x, y:p.y })), xn: li.xn, yn: li.yn, sliceX: li.sliceX.slice(), sliceY: li.sliceY.slice(), warpToolbar:captureRasterWarpOptions(), rot: meshRotState[soLayerIndex] || 0, flip: { ...(meshFlipState[soLayerIndex] || {}) } };
export function pushHistory(){            
  if(!li || (!li.points && !(li.deforms && li.deforms.length))) return;
  const h = history[cur] || (history[cur] = { undo: [], redo: [] });
  h.undo.push(snapshot()); if(h.undo.length > histCap()) h.undo.shift();
  h.redo.length = 0;
}
export function restore(snap){
  if (snap.deforms) {
    li.deforms = snap.deforms.map(cloneDeform);
    deformIdx = Math.max(0, Math.min(li.deforms.length - 1, snap.idx == null ? 0 : snap.idx));
    li.deform = li.deforms[deformIdx] || null;
    li.points = null; li.xn = null; li.yn = null;
  } else if (snap.deform) {                                   
    li.deforms = [cloneDeform(snap.deform)]; deformIdx = 0; li.deform = li.deforms[0];
    li.points = null; li.xn = null; li.yn = null;
  } else { li.deform = null; li.deforms = null; deformIdx = -1;
    li.points = snap.points.map(p => ({ x:p.x, y:p.y })); li.xn = snap.xn; li.yn = snap.yn; li.sliceX = snap.sliceX.slice(); li.sliceY = snap.sliceY.slice(); }
  if (snap.rot != null) meshRotState[soLayerIndex] = snap.rot; if (snap.flip) meshFlipState[soLayerIndex] = { ...snap.flip };
  selPt = -1; applyDeformClass(); restoreRasterWarpOptions(snap.warpToolbar,commit); syncDeformBar();
}


export const docStack = [];              
const STATE_MAPS = () => ({ soEdits, soRepl, soBaked, soOrigRaster, layerEdits, layerRenames, layerTextEdits, textStyleEdits, textDescEdits, textRenders, textCrops, layerTransforms, layerOps, layerParamsCache, paramUI, gradState, meshRotState, meshFlipState, textFontSubst, history, thumbCache, maskThumbCache, layerCanvasCache, soRasterCache, soInside, maskPaint, pixelPaint, vpathCache, vstrokeCache, soFilters, soFilterEdits, soFilterShadow, soFilterOrig, layerDupes });

function captureDocHistory(){ return { undo: docHistory.undo.slice(), redo: docHistory.redo.slice() }; }
function restoreDocHistory(h){ docHistory.undo.length = 0; docHistory.undo.push(...(h ? h.undo : [])); docHistory.redo.length = 0; docHistory.redo.push(...(h ? h.redo : [])); }
function captureBrushHistory(){ return { undo: brushHistory.undo.slice(), redo: brushHistory.redo.slice() }; }
function restoreBrushHistory(h){ brushHistory.undo.length = 0; brushHistory.undo.push(...(h ? h.undo : [])); brushHistory.redo.length = 0; brushHistory.redo.push(...(h ? h.redo : [])); }
export function captureState(opts={}){
  const st = { doc, sos, cur, docW, docH, li, img, replImg, soImgURL, replImgURL, replFile, soLayerIndex, origBuffer, docLabel, docName, layerTree, layerReorder, selLayer, soloSnapshot, selection, maps: {}, deletes: new Set(layerDeletes), docHist: captureDocHistory(), brushHist: captureBrushHistory(), histLog: { items: histLog.items.slice(), cursor: histLog.cursor },
               docSizeBase: docSizeBase && { ...docSizeBase }, docResolution, docResolutionBase, toolData: copyToolData(), measureLine, viewAngle, historySource, historySourceInfo, countGroup,
               docPaths: { work: workPath, workDirty: workPathDirty, saved: savedPaths, savedDirty: savedPathsDirty, active: activePath, key: docPathsKey } };
  const M = STATE_MAPS(); for (const k in M) st.maps[k] = { ...M[k] };
  if(opts.cloneSparse!==false)for(const k in st.maps.pixelPaint)st.maps.pixelPaint[k]=forkPixelPaint(st.maps.pixelPaint[k]);
  return st;
}
export function applyState(st){
  set_toolData(st.toolData ? cloneOpValue(st.toolData) : null); set_measureLine(st.measureLine || null); set_viewAngle(st.viewAngle || 0); set_historySource(st.historySource || new Map()); set_historySourceInfo(st.historySourceInfo || null); set_countGroup(st.countGroup || 0); set_auxDrag(null);
  doc = st.doc; sos = st.sos; cur = st.cur; docW = st.docW; docH = st.docH; li = st.li; img = st.img; replImg = st.replImg;
  soImgURL = st.soImgURL; replImgURL = st.replImgURL; replFile = st.replFile; soLayerIndex = st.soLayerIndex; origBuffer = st.origBuffer;
  docLabel = st.docLabel; docName = st.docName || ''; layerTree = st.layerTree; layerReorder = st.layerReorder; set_selLayer(st.selLayer); set_soloSnapshot(st.soloSnapshot);
  const M = STATE_MAPS(); for (const k in M) { const m = M[k]; for (const q in m) delete m[q]; Object.assign(m, st.maps[k] || {}); }
  for(const k in pixelPaint)pixelPaint[k]=forkPixelPaint(pixelPaint[k]);
  restoreDocHistory(st.docHist);
  restoreBrushHistory(st.brushHist);
  
  if (st.histLog && st.histLog.items.length) { histLog.items = st.histLog.items.slice(); histLog.cursor = st.histLog.cursor; }
  else { histLog.items = st.doc ? [{ label: '打开', kind: 'open' }] : []; histLog.cursor = histLog.items.length - 1; }
  try { syncHistoryPanel(); } catch {}
  layerDeletes.clear(); for (const i of st.deletes) layerDeletes.add(i);
  
  { const P = st.docPaths; set_workPath(P ? P.work : null); set_workPathDirty(P ? P.workDirty : false); set_savedPaths(P ? P.saved : []);
    set_savedPathsDirty(P ? P.savedDirty : false); set_activePath(P ? P.active : null); set_docPathsKey(P ? P.key : null); }
  if (st.docSizeBase !== undefined) { set_docSizeBase(st.docSizeBase && { ...st.docSizeBase }); set_docResolution(st.docResolution); set_docResolutionBase(st.docResolutionBase); }
  selection = st.selection || null; selPathCache = null; selDrag = null; curStroke = null;
  dragState = null; hover = null; hoverPt = -1; selPt = -1; set_dragRowIndex(-1); meshEditInProgress = false; TInputs = null;
  
  set_pathModel(null); set_pathSelNode(null); set_pathDrag(null); set_pathHoverNode(-1); set_pathNodes([]); pathSelAnchors.clear(); pathSelSubs.clear();
  if (adjState) { if (adjRAF) { cancelAnimationFrame(adjRAF); set_adjRAF(0); } set_adjState(null);
    const d = $('#adjDlg'); if (d && d.open) { try { d.close(); } catch { d.removeAttribute('open'); } } }
}
export function emptyState(){
  return { doc: null, sos: [], cur: -1, docW: 0, docH: 0, li: null, img: null, replImg: null, soImgURL: null, replImgURL: null, replFile: null, soLayerIndex: -1,
           origBuffer: null, docLabel: '', docName: '', layerTree: null, layerReorder: null, selLayer: -1, soloSnapshot: null, selection: null, maps: {}, deletes: new Set() };
}





export function captureDocFull(opts={}){
  const st = captureState(opts);
  st.full = {
    docStack: docStack.slice(), guides: guides.map(g => ({ ...g })), guidesGrid: { ...guidesGrid }, guidesDirty,
    globalLight: { ...globalLight }, globalLightBase: { ...globalLightBase }, globalLightDirty,
    docSlices, slicesDirty, sliceSel, artboardCache, abSel, lastSelection, pendingCropDelete, exportName,
    selLayers: new Set(selLayers), layerDupes: layerDupes.map(d => ({ ...d })), collapsed: new Set(collapsedGroups),
    fxOpen: new Map(fxListOpenSet), sfOpen: new Map(sfListOpenSet),
    chan: { single: chanView.single, off: new Set(chanView.off) }, proofOn, modeSel: $('#modeSel').value,
    docResolution, docResolutionBase, docSizeBase: docSizeBase && { ...docSizeBase }, textDynamicCarry, historySource, historySourceInfo,
    vp: { raw: vpRaw, planes: vpPlanesDoc, dirty: vpDirty },
    ext: Object.fromEntries(DOC_EXT.map(x => [x.key, x.capture()])),   
    par: { v: viewPar, c: viewParCorrect },          
  };
  return st;
}
export function applyDocFull(st){
  applyState(st);
  const f = st.full || {};
  docStack.length = 0; if (f.docStack) docStack.push(...f.docStack);
  guides = f.guides || []; guidesGrid = f.guidesGrid || { h: 0, v: 0 }; guidesDirty = !!f.guidesDirty;
  viewPar = (f.par && f.par.v) || 1; viewParCorrect = !!(f.par && f.par.c);
  globalLight = f.globalLight || { angle: 120, altitude: 30 }; globalLightBase = f.globalLightBase || { ...globalLight }; globalLightDirty = !!f.globalLightDirty;
  set_docSlices(f.docSlices || null); set_slicesDirty(!!f.slicesDirty); set_sliceSel(f.sliceSel ?? -1); set_sliceDrag(null);
  set_artboardCache(f.artboardCache || { buf: null, list: [] }); set_abSel(f.abSel ?? -1); set_abState(null); set_abPending(null);
  lastSelection = f.lastSelection || null; set_pendingCropDelete(!!f.pendingCropDelete); set_exportName(f.exportName || 'modified');
  selLayers.clear(); if (f.selLayers) for (const i of f.selLayers) selLayers.add(i);
  layerDupes.length = 0; if (f.layerDupes) layerDupes.push(...f.layerDupes);
  collapsedGroups.clear(); if (f.collapsed) for (const i of f.collapsed) collapsedGroups.add(i);
  fxListOpenSet.clear(); if (f.fxOpen) for (const [k, v] of f.fxOpen) fxListOpenSet.set(k, v);
  sfListOpenSet.clear(); if (f.sfOpen) for (const [k, v] of f.sfOpen) sfListOpenSet.set(k, v);
  chanView.single = f.chan ? f.chan.single : null; chanView.off.clear(); if (f.chan) for (const c of f.chan.off) chanView.off.add(c);
  proofOn = !!f.proofOn; if (f.modeSel) $('#modeSel').value = f.modeSel;
  if (f.docResolution != null) { set_docResolution(f.docResolution); set_docResolutionBase(f.docResolutionBase); set_docSizeBase(f.docSizeBase && { ...f.docSizeBase }); }
  set_textDynamicCarry(f.textDynamicCarry || null);
  vpRaw = f.vp ? f.vp.raw : null; vpPlanesDoc = f.vp ? f.vp.planes : null; vpDirty = !!(f.vp && f.vp.dirty);
  if (f.historySource) { set_historySource(f.historySource); set_historySourceInfo(f.historySourceInfo || null); }
  for (const x of DOC_EXT) x.apply(f.ext ? f.ext[x.key] : null);
  
  set_belowCache(null); set_composeLiveIdx(null); set_paintTempPair(null); set_samplerPxCache({ key: '', px: null }); set_infoCompCache({ key: '', px: null });
  objFinderReset(); set_qsEdgeCache(null); set_adjOverlayCache(null); set_smViewCache(null); set_csOverlayCache(null); set_alphaCarry(null); set_lastAutoHit(null);
  set_cropAwareCache({ snap: null, w: 0, h: 0, pad: 0, cv: null }); set_mixerCarry(null); set_lastPaintPt(null); set_boOffset(null);
  set_moveDrag(null); set_moveHover(-1); set_panelHover(-1); set_layerMarq(null); set_soEnterSnap(null); set_pendingReplSO(-1);
  document.querySelector('.app').classList.toggle('inside', docStack.length > 0);
}

export async function settleForDocSwitch(){
  if (deformTool) { shell.status(`先按 ✓ 提交或 ✕ 取消「${DEFORM_LABEL[deformTool] || '变形'}」，再切换文档`); return false; }
  if (tfState) await commitFreeTransform();
  if (textOverlay) closeInlineText(true);
  if (maskEdit) closeMaskEdit(true);
  if (curStroke) await endStroke();
  if (cropState) commitCrop();
  if (polyLasso) cancelPolyLasso();
  if (sbState) endSelBrush();
  if (magLasso) cancelMagLasso();
  set_qsState(null); set_osState(null); if (pcropState) cancelPCrop();
  set_sliceDrag(null); set_abState(null); set_frameState(null); set_shapeState(null); set_gradDrag(null); set_liveGradEdit(null); selDrag = null;
  if (penState) { penState.drag = null; if (!commitPen(false)) cancelPen(); }
  set_freePen(null); set_magPen(null); set_pathSubDrag(null); set_pathAnchorDrag(null); set_pathSegDrag(null); set_pathMarquee(null); set_retouchState(null);
  if (rtPending) await rtPendingCommit();
  if (moveDrag) endMoveDrag();
  if (qmask) toggleQuickMask();                      
  if (li) await exitSO();
  try { await dupTask; } catch {}
  if (dupPending) { clearTimeout(dupTimer); try { await materializeDupes(); } catch {} }
  try { await filterPending; } catch {}
  try { await deformPending; } catch {}
  return true;
}

export function resetForNewDoc(){
  if (HXP) HXP.reset(); set_hxFresh(true);          
  collapsedGroups.clear(); fxListOpenSet.clear(); sfListOpenSet.clear(); selLayers.clear();
  viewFlip = false; set_exportName('modified'); set_pendingCropDelete(false); set_textDynamicCarry(null);
  docStack.length = 0; document.querySelector('.app').classList.remove('inside');
}
export const docViewState = () => ({ zoom, fit: zoomFitMode, cap: zoomFitCap, panX, panY, angle: viewAngle, flip: viewFlip });
export function setDocViewState(v, opts = {}){
  if (!v) { fitStage(true); return; }
  set_zoom(v.zoom); set_zoomFitMode(!!v.fit); set_zoomFitCap(v.cap || 2); set_panX(v.panX || 0); set_panY(v.panY || 0); set_viewAngle(v.angle || 0); viewFlip = !!v.flip;
  if (opts.render !== false) fitStage(false);
}

export function docSnapshotCanvas(max = 2048){
  if (!doc || !docW || !docH) return null;
  const k = Math.min(1, max / Math.max(docW, docH));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(docW * k)); c.height = Math.max(1, Math.round(docH * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  
  const gs = gpuSnapshotCanvas();
  if (gs && (docW*docH>64e6||max <= Math.max(gs.width, gs.height) || Math.max(docW, docH) <= Math.max(gs.width, gs.height))) { g.drawImage(gs, 0, 0, c.width, c.height); c.docW = docW; c.docH = docH; return c; }
  if(docW*docH>64e6){
    
    
    const lc=document.createElement('canvas');lc.width=c.width;lc.height=c.height;const lctx=lc.getContext('2d'),cell=document.createElement('canvas'),cg=cell.getContext('2d');
    const modes={'mul ':'multiply',scrn:'screen',over:'overlay',diff:'difference',smud:'exclusion',dark:'darken',lite:'lighten',sLit:'soft-light',hLit:'hard-light'};
    for(const idx of layerReorder||doc.layers.map((_,i)=>i)){
      const l=doc.layers[idx];if(!l||l.hidden||layerDeletes.has(idx)||[1,2,3].includes(l.group?.type))continue;
      const p=l.lazyPreview||(l.rgba?{data:l.rgba,width:l.width,height:l.height}:null);if(!p||p.width>4096||p.height>4096)continue;
      lctx.clearRect(0,0,c.width,c.height);cell.width=p.width;cell.height=p.height;
      cg.putImageData(new ImageData(new Uint8ClampedArray(p.data.buffer,p.data.byteOffset,p.data.byteLength),p.width,p.height),0,0);
      const b=l.bounds;lctx.drawImage(cell,b.left*k,b.top*k,l.width*k,l.height*k);
      for(const t of pixelPaint[idx]?.sparse?.tiles.values()||[]){
        cell.width=t.width;cell.height=t.height;cg.putImageData(new ImageData(t.data,t.width,t.height),0,0);
        lctx.save();lctx.beginPath();lctx.rect((b.left+t.x)*k,(b.top+t.y)*k,t.width*k,t.height*k);lctx.clip();lctx.clearRect(0,0,c.width,c.height);lctx.drawImage(cell,(b.left+t.x)*k,(b.top+t.y)*k,t.width*k,t.height*k);lctx.restore();
      }
      g.globalAlpha=(l.opacity??255)/255*(l.fillOpacity??255)/255;g.globalCompositeOperation=modes[l.blendMode]||'source-over';g.drawImage(lc,0,0);
    }
    g.globalAlpha=1;g.globalCompositeOperation='source-over';c.docW=docW;c.docH=docH;c.partial=true;return c;
  }
  ensureScratch();
  for (const id of ['#below', '#warp', '#above']) { const s = viewScratch.get(id); if (s && s.width === docW && s.height === docH && !viewEmpty.has(id)) try { g.drawImage(s, 0, 0, c.width, c.height); } catch {} }
  c.docW = docW; c.docH = docH;
  return c;
}

export async function docStructural(label, mutate){
  if (!doc || li) return false;
  if (!await ensureLazy(EDIT, label)) return false;
  if (textOverlay) closeInlineText(true);
  $('#err').textContent = '';
  const prev = structuralBegin();
  try {
    const built = await buildPsdBuffer({ fast: true });
    const r = await mutate(built.buf, { selBuilt: builtIndexOf(selLayer), docW, docH });
    if (!r) return false;
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    if (r.after) r.after();
    refreshAll(false);
    structuralDone(prev, label);
    syncToolButtons(); renderProps();
    return true;
  } catch (e) {
    try { structuralApply(prev); } catch {}
    $('#err').textContent = label + '没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}

export async function psdFromPixels(rgba, w, h, name, background = 'transparent'){
  if (!await ensureLazy(EDIT, '新建文档')) return null;
  const m = await NEWDOC.load();
  const blank = m.createPsd({ width: w, height: h, background, name });
  const data = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length);
  return applyEdits(blank, [{ op: 'replaceLayerPixels', index: 0, rgba: { data, width: w, height: h }, bounds: { top: 0, left: 0, bottom: h, right: w } }]).buffer;
}
export function undo(){ const h = history[cur]; if(!li || !h || !h.undo.length) return; h.redo.push(snapshot()); restore(h.undo.pop()); }
export function redo(){ const h = history[cur]; if(!li || !h || !h.redo.length) return; h.undo.push(snapshot()); restore(h.redo.pop()); }
