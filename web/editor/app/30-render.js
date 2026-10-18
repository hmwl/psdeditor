




import './29-scrubby-live.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import { drawWarpCachedPreview } from '../warp-cached-preview.js';
import { contourDescFrom } from '../../../core/contour.js';
import { compositeCMYK, cmykCompositeRGBA } from '../../../core/cmyk-compose.js';
import { getModeCodec } from '../../../core/color-convert.js';
import {
  adjustmentRenderParams, compositeAll, compositeSplitPoints, drawLayer, hasRenderableEffects, hasRenderableFill, regionizeDoc,
  hasRenderableVectorMask, groupHasMask, groupMaskAlpha, vectorStrokeRenderParams,
} from '../../../core/app.js';
import { applyAdjustment } from '../../../core/adjust.js';
import { buildDrawList, createDrawListState, markDirty as markDrawListDirty } from '../../../core/render/draw-list.js';
import { createFrameQueue } from '../../../core/render/frame-queue.js';
import { lodForScale } from '../../../core/psd-lod.js';
import { interleaveTileStreams, lazyDetailLevels, lazyTileLevel, lazyTileState, planVisibleTiles } from '../../../core/render/tile-cache.js';
import { buildLazyLayerPreview, readLazyLayerPixel, readLazyLayerTile } from '../../../core/psd-raster.js';
import { preferences as PREF } from '../preferences.js';
import { psPanels } from '../ps-panels.js';
import { shell } from '../shell.js';
import {
  $, BLEND, CORE_BLEND, CREATABLE_FX, FIT_LABELS, PREVIEW_ADJUSTMENTS, QUADM, blitToCanvas,
  createEffectTemplate, deformEquals, engineOK, meshTopology, patchCountX, patchCountY, renderWarp,
  surfacePoint,
} from './01-boot.js';
import {
  CHP, CM, LP, cur, doc, docH, docW, dragState, img, layerDeletes, layerEdits, layerOps, layerReorder,
  layerStateVersion, layerTransforms, layerTree, li, maskPaint, pixelPaint, proofOn, replImg, set_li,
  set_proofOn, set_replFile, set_replImg, set_soLayerIndex, soBaked, soEdits, soLayerIndex, soRepl, textCrops,
  textRenders, viewPar, viewParCorrect,
} from './02-doc-state.js';
import { backend, fitOf, pushDocHistory, uiQuiet } from './03-history.js';
import { padL, padT, syncRulers, viewH, viewHold, viewW, zoom } from './04-view-chrome.js';
import { moveDrag } from './07-nav-histogram.js';
import { tfState } from './19-free-transform.js';
import { filterInputForSO, loadImage } from './20-snap-smart-object.js';
import { decodeLazyTiles, decodedTileCache } from './21-load-document.js';
import { deformEnter, deformOpts, deformTool } from './22-deform-tools.js';
import { layerCanvasCache, layerCanvasCacheRaw, selLayer, set_layerPixelHook } from './23-layers-panel.js';
import {
  cloneOpValue, effClipping, effFillOpacity, humanEditError, layerOpsVersion, opField,
} from './24-layer-ops-queue.js';
import { warpSession } from './26-layer-create.js';
import { isMeshTransform, transformChanged } from './28-layer-props-transform.js';
import { displayOrder, rasterizeTransformed, set_gizmoTx } from './29-scrubby-live.js';
import { docTool, stageLocal, viewAngle } from './31-selection-brush.js';
import { selReady, setSelection, syncAnts, syncToolButtons } from './32-cursors-select-options.js';
import { maskOverrideOf } from './38-brush-engine.js';
import { drawGizmo, soFilterEdits } from './46-smart-filter-panel.js';













const DPR = () => Math.max(1, Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1));


function visibleWindow(x, y, w, h){
  const vp = $('#viewport'), st = $('#stage');
  if (!vp || !st || !st.getBoundingClientRect) return null;
  const sr = st.getBoundingClientRect(), vr = vp.getBoundingClientRect();
  if (!(sr.width > 0 && sr.height > 0 && vr.width > 0 && vr.height > 0)) return null;
  const dpr = DPR();
  if (viewAngle || (viewParCorrect && viewPar !== 1)) {     
    const corners = [[vr.left,vr.top],[vr.right,vr.top],[vr.left,vr.bottom],[vr.right,vr.bottom]].map(p => stageLocal(...p));
    const L=Math.max(x,Math.floor(Math.min(...corners.map(p=>p.x))-2)), T=Math.max(y,Math.floor(Math.min(...corners.map(p=>p.y))-2));
    const R=Math.min(x+w,Math.ceil(Math.max(...corners.map(p=>p.x))+2)), B=Math.min(y+h,Math.ceil(Math.max(...corners.map(p=>p.y))+2));
    return {L,T,W:Math.max(0,R-L),H:Math.max(0,B-T),dpr};
  }
  const snapD = v => Math.floor(v * dpr + 1e-6) / dpr, snapU = v => Math.ceil(v * dpr - 1e-6) / dpr;
  
  const L = snapD(Math.max(sr.left + x, vr.left)), T = snapD(Math.max(sr.top + y, vr.top));
  const R = snapU(Math.min(sr.left + x + w, vr.right)), B = snapU(Math.min(sr.top + y + h, vr.bottom));
  return { L: L - sr.left, T: T - sr.top, W: Math.max(0, R - L), H: Math.max(0, B - T), dpr };
}
function placeWindow(cv, win){
  const st = cv.style;
  const l = win.L + 'px', t = win.T + 'px', w = win.W + 'px', h = win.H + 'px';
  if (st.left !== l) st.left = l; if (st.top !== t) st.top = t;
  if (st.width !== w) st.width = w; if (st.height !== h) st.height = h;
}
export function gizmoCanvas(){ return $('#gizmoView') || $('#gizmo'); }
export function ensureGizmoCanvas(g){
  if (g && g.id === 'gizmo' && $('#gizmoView')) {         
    const tiny = g.width !== 1 || g.height !== 1; if (tiny) { g.width = 1; g.height = 1; }
    g = $('#gizmoView');
  }
  
  const wide = docTool === 'artboard' && !li;
  const win = docW && docH ? (wide ? visibleWindow(-1e6, -1e6, 2e6, 2e6) : visibleWindow(0, 0, viewW() * zoom, viewH() * zoom)) : null;
  if (!win) {                                                
    set_gizmoTx({ sx: 1, sy: 1, tx: padL(), ty: padT() });
    if (g.style) { g.style.left = g.style.top = ''; g.style.width = g.style.height = ''; }
    const w0 = Math.max(1, Math.round(viewW())), h0 = Math.max(1, Math.round(viewH()));
    if (g.width !== w0 || g.height !== h0) { g.width = w0; g.height = h0; return true; }
    return false;
  }
  placeWindow(g, win);
  const w = Math.max(1, Math.round(win.W * win.dpr)), h = Math.max(1, Math.round(win.H * win.dpr));
  if (g.width !== w || g.height !== h) { g.width = w; g.height = h; }
  const sc = zoom * win.dpr;
  set_gizmoTx({ sx: sc, sy: sc, tx: (padL() * zoom - win.L) * win.dpr, ty: (padT() * zoom - win.T) * win.dpr });
  return true;
}






export const viewScratch = new Map();          
export function scratchCanvas(id){
  let cv = viewScratch.get(id);
  if (!cv) { cv = document.createElement('canvas'); viewScratch.set(id, cv); }
  if (cv.width !== docW || cv.height !== docH) { cv.width = Math.max(1, docW); cv.height = Math.max(1, docH); }
  return cv;
}
export const scratchCtx = id => scratchCanvas(id).getContext('2d');
const VIEW_BUDGET = 32e6;               
function viewScale(){
  let k = (zoom || 1) * DPR();
  const maxK = Math.sqrt(VIEW_BUDGET / Math.max(1, docW * docH));
  if (k > maxK) k = Math.max(1, maxK);
  return k;
}
export const viewEmpty = new Set();            
const mipCache = new Map();             
export const mipGen = new Map();
let sharpTmp = null;
function mipLevel(id, src, level){
  let m = mipCache.get(id);
  const gen = mipGen.get(id) || 0;
  if (!m || m.gen !== gen || m.w !== docW || m.h !== docH) { m = { gen, w: docW, h: docH, levels: [] }; mipCache.set(id, m); }
  for (let i = m.levels.length; i < level; i++) {
    const prev = i === 0 ? src : m.levels[i - 1];
    const nw = Math.max(1, Math.floor(prev.width / 2)), nh = Math.max(1, Math.floor(prev.height / 2));
    const t = document.createElement('canvas'); t.width = nw; t.height = nh;
    const tc = t.getContext('2d');
    tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
    tc.drawImage(prev, 0, 0, nw, nh);
    m.levels.push(t);
  }
  return level === 0 ? src : m.levels[level - 1];
}

export function refreshView(){
  if (viewHold && viewHold.freeze) return;
  if (!doc || !docW || !docH) return;
  requestLazyUpgrades();
  if (GPUV.on) {                                        
    if (!gpuFrame()) { gpuShow(false); renderPreviewOnly(); return; }
    for (const id of ['#warp', '#above']) if (viewScratch.has(id)) presentCanvas(id, { view: true });
  } else if (docW * docH > 64e6 && renderLargeViewportFallback()) {
    
    
  } else for (const id of ['#below', '#warp', '#above']) if (viewScratch.has(id)) presentCanvas(id, { view: true });
  try { drawGizmo(); } catch {}
}
let refreshViewRAF = 0;
const lazyUpgradeJobs = new Map();
let lazyUpgradeDoc = 0;
const lazyUpgradeFailures = new Set();
function requestLazyUpgrades(){
  const docID = doc ? sceneRef(doc) : 0;
  if (lazyUpgradeDoc !== docID) { lazyUpgradeDoc = docID; lazyUpgradeFailures.clear(); }
  if (!doc) { decodedTileCache.setWanted([]); return; }
  const sourceDoc = doc;
  const win = visibleWindow(padL() * zoom, padT() * zoom, docW * zoom, docH * zoom); if (!win) return;
  const s = zoom * win.dpr, tx = (padL() * zoom - win.L) * win.dpr, ty = (padT() * zoom - win.T) * win.dpr;
  const scale = lodForScale(s), cellSize = 256 * scale;
  const vx0 = Math.max(0, Math.floor(-tx / s) - cellSize), vy0 = Math.max(0, Math.floor(-ty / s) - cellSize);
  const vx1 = Math.min(docW, Math.ceil((win.W * win.dpr - tx) / s) + cellSize), vy1 = Math.min(docH, Math.ceil((win.H * win.dpr - ty) / s) + cellSize);
  const layers = [];
  for (const i of displayOrder()) {
    const l = doc.layers[i]; if (!(l?.lazyCompressedChannels || l?.lazyChannels || l?.lazyImage) || l.rgba || l.hidden) continue;
    const p = l.lazyPreview;
    if (p && s * Math.max(l.width / p.width, l.height / p.height) <= 1) continue;
    const b = l.bounds || { left: 0, top: 0, right: l.width, bottom: l.height };
    const x0 = Math.max(vx0, b.left), y0 = Math.max(vy0, b.top), x1 = Math.min(vx1, b.right), y1 = Math.min(vy1, b.bottom);
    if (!(x1 > x0 && y1 > y0)) continue;
    const candidates = [], cx = (x0 + x1) / 2 - b.left, cy = (y0 + y1) / 2 - b.top;
    for (let y = Math.max(0, Math.floor((y0 - b.top) / cellSize) * cellSize); y < y1 - b.top; y += cellSize) for (let x = Math.max(0, Math.floor((x0 - b.left) / cellSize) * cellSize); x < x1 - b.left; x += cellSize)
      candidates.push({ x, y, scale, key: `${x}:${y}`, bytes: Math.ceil(Math.min(cellSize, l.width - x) / scale) * Math.ceil(Math.min(cellSize, l.height - y) / scale) * 4, distance: (x + cellSize / 2 - cx) ** 2 + (y + cellSize / 2 - cy) ** 2 });
    layers.push({ index: i, state: lazyTileLevel(l, doc.editorDocUID, scale), cells: candidates.sort((a, b) => a.distance - b.distance).slice(0, 96) });
  }
  const plan = planVisibleTiles(layers, decodedTileCache.budget);
  decodedTileCache.setWanted(plan.cells);
  for (const cell of plan.cells) decodedTileCache.get(cell.state, cell.key);
  
  
  
  
  const groups = new Map();
  for (const cell of interleaveTileStreams(plan.cells)) {
    const { x, y, index: i, state } = cell, key = `${sceneRef(sourceDoc)}:${i}:${scale}:${x}:${y}`;
    if (state.tiles.has(`${x}:${y}`) || lazyUpgradeJobs.has(key) || lazyUpgradeFailures.has(key)) continue;
    const groupKey = `${i}:${scale}`, group = groups.get(groupKey) || { index: i, cells: [] };
    group.cells.push({ x, y, key }); groups.set(groupKey, group);
  }
  for (const group of groups.values()) {
    if (lazyUpgradeJobs.size >= 6) return;
    const first = group.cells[0], batch = group.cells.filter(c => c.y === first.y && Math.abs(c.x - first.x) <= cellSize * 3).slice(0, 4), keys = batch.map(c => c.key);
    const job = Promise.resolve().then(() => doc === sourceDoc && decodeLazyTiles(group.index, batch, 256, { wantedOnly: true, scale })).catch(() => false).then(ok => {
      if (!ok && doc === sourceDoc) for (const key of keys) lazyUpgradeFailures.add(key);
      return ok;
    }).finally(() => {
      for (const key of keys) lazyUpgradeJobs.delete(key);
      if (doc) scheduleRefreshView();
    });
    for (const key of keys) lazyUpgradeJobs.set(key, job);
  }
}
export function scheduleRefreshView(){
  if (refreshViewRAF) return;
  refreshViewRAF = requestAnimationFrame(() => { refreshViewRAF = 0; refreshView(); syncRulers(); });
}
export function presentCanvas(id, opts = {}){
  if (viewHold && viewHold.freeze) return;
  const vis = $(id), src = viewScratch.get(id);
  if (!vis || !src || !docW || !docH) return;
  vis.docID = sceneRef(doc);
  vis.ownerID = frameOwnerOf(doc);
  if (opts.empty) viewEmpty.add(id); else if (!opts.view) viewEmpty.delete(id);
  if (!opts.view) mipGen.set(id, (mipGen.get(id) || 0) + 1);     
  
  if (viewEmpty.has(id)) { if (vis.width !== 1 || vis.height !== 1) { vis.width = 1; vis.height = 1; } else { const c0 = vis.getContext('2d'); if (c0) c0.clearRect(0, 0, 1, 1); } return; }
  const c = vis.getContext('2d');
  if (!c) return;
  const win = visibleWindow(padL() * zoom, padT() * zoom, docW * zoom, docH * zoom);
  let W, H, s, tx, ty;
  if (win) {
    placeWindow(vis, win);
    W = Math.max(1, Math.round(win.W * win.dpr)); H = Math.max(1, Math.round(win.H * win.dpr));
    s = zoom * win.dpr;
    tx = (padL() * zoom - win.L) * win.dpr; ty = (padT() * zoom - win.T) * win.dpr;
  } else {                                                  
    const k = viewScale();
    W = Math.max(1, Math.round(docW * k)); H = Math.max(1, Math.round(docH * k));
    s = W / docW; tx = 0; ty = 0;
  }
  const resized = vis.width !== W || vis.height !== H;
  if (resized) { vis.width = W; vis.height = H; }
  if (c.setTransform) c.setTransform(1, 0, 0, 1, 0, 0);
  if (win && (win.W <= 0 || win.H <= 0)) { c.clearRect(0, 0, W, H); return; }
  
  let dx0 = Math.max(0, Math.floor(-tx / s)), dy0 = Math.max(0, Math.floor(-ty / s));
  let dx1 = Math.min(docW, Math.ceil((W - tx) / s)), dy1 = Math.min(docH, Math.ceil((H - ty) / s));
  
  if (opts.rect && !resized) {
    const r = opts.rect, px = Math.max(1, Math.ceil(1 / s));
    const rx0 = Math.max(dx0, Math.floor(r.x0) - px), ry0 = Math.max(dy0, Math.floor(r.y0) - px);
    const rx1 = Math.min(dx1, Math.ceil(r.x1) + px), ry1 = Math.min(dy1, Math.ceil(r.y1) + px);
    if (rx1 <= rx0 || ry1 <= ry0) return;
    const X0 = Math.floor(tx + rx0 * s), Y0 = Math.floor(ty + ry0 * s), X1 = Math.ceil(tx + rx1 * s), Y1 = Math.ceil(ty + ry1 * s);
    c.save(); c.beginPath(); c.rect(X0, Y0, X1 - X0, Y1 - Y0); c.clip();
    c.clearRect(X0, Y0, X1 - X0, Y1 - Y0);
    const hard = s >= 2 || (Math.abs(s - Math.round(s)) < 1e-6 && s >= 1);
    c.imageSmoothingEnabled = !hard; if (!hard) c.imageSmoothingQuality = s < 1 ? 'medium' : 'high';
    
    const ex = Math.max(2, Math.ceil(2 / s)), sx0 = Math.max(0, rx0 - ex), sy0 = Math.max(0, ry0 - ex), sx1 = Math.min(docW, rx1 + ex), sy1 = Math.min(docH, ry1 + ex);
    c.drawImage(src, sx0, sy0, sx1 - sx0, sy1 - sy0, tx + sx0 * s, ty + sy0 * s, (sx1 - sx0) * s, (sy1 - sy0) * s);
    c.restore();
    return;
  }
  c.clearRect(0, 0, W, H);
  if (dx1 <= dx0 || dy1 <= dy0) return;
  const sw = dx1 - dx0, sh = dy1 - dy0;
  const X = tx + dx0 * s, Y = ty + dy0 * s, DW = sw * s, DH = sh * s;
  const isInt = Math.abs(s - Math.round(s)) < 1e-6;
  if (s >= 2 || (isInt && s >= 1)) {                        
    c.imageSmoothingEnabled = false;
    c.drawImage(src, dx0, dy0, sw, sh, X, Y, DW, DH);
    return;
  }
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  if (s > 1) {                                              
    const m = Math.ceil(s), tw = sw * m, th = sh * m;
    if (!sharpTmp) sharpTmp = document.createElement('canvas');
    if (sharpTmp.width < tw || sharpTmp.height < th) { sharpTmp.width = Math.max(sharpTmp.width, tw); sharpTmp.height = Math.max(sharpTmp.height, th); }
    const t = sharpTmp.getContext('2d');
    if (t.setTransform) t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, tw, th);
    t.imageSmoothingEnabled = false;
    t.drawImage(src, dx0, dy0, sw, sh, 0, 0, tw, th);
    c.drawImage(sharpTmp, 0, 0, tw, th, X, Y, DW, DH);
    return;
  }
  
  let level = 0;
  while (s * Math.pow(2, level + 1) <= 1 + 1e-6 && Math.min(docW, docH) >> (level + 1) >= 1) level++;
  const lv = mipLevel(id, src, level);
  const kx = lv.width / docW, ky = lv.height / docH;
  c.drawImage(lv, dx0 * kx, dy0 * ky, sw * kx, sh * ky, X, Y, DW, DH);
}

export function renderPreviewOnly(){
  if (!doc || !docW || !docH) return;
  if(doc?.mode!==4)nativeInkCache={doc:null,key:'',value:null};
  if (uiQuiet) return;                 
  set_li(null); set_soLayerIndex(-1);
  ensureLazyPreviews();
  requestLazyUpgrades();
  if (!GPUV.gc && !GPUV.loading && !GPUV.failed && gpuPrefOn()) ensureGpu();
  if (!(viewHold && viewHold.freeze) && gpuFrame()) { gpuShow(true); GPUV.stale = true; gpuAfterFrame(); }
  else if (docW * docH > 64e6 && renderLargeViewportFallback()) {
    


  }
  else if (GPUV.loading && docW * docH > 4e6) {
    
    const b = $('#below'); if (b && (b.width > 1 || b.height > 1)) { b.width = 1; b.height = 1; }
  } else {
    gpuShow(false); GPUV.stale = false; GPUV.cpuFrames = (GPUV.cpuFrames || 0) + 1;
    const bc = scratchCtx('#below');
    bc.clearRect(0,0,docW,docH);
    paintLayers(bc, displayOrder());
    presentCanvas('#below');
  }
  for(const id of ['#warp','#above']){
    
    
    let empty = viewScratch.get(id);
    if (!empty) { empty = document.createElement('canvas'); viewScratch.set(id, empty); }
    empty.width = empty.height = 1;
    presentCanvas(id, { empty: true });
  }
  if (!(viewHold && viewHold.freeze)) { const cv=gizmoCanvas(); ensureGizmoCanvas(cv); const c2=cv.getContext('2d');
    if (c2.setTransform) c2.setTransform(1,0,0,1,0,0);
    c2.clearRect(0,0,cv.width,cv.height); }
  set_li(null); set_soLayerIndex(-1);
  $('.app').classList.add('preview');        
  $('#meshInfo').textContent = '';
  drawGizmo();                               
  if (channelsPanelVisible()) syncChannelPanel();   
  
  $('.optbar').classList.add('preview');
  $('#docInfo').textContent = `文档 ${docW}×${docH} · ${doc.layers.length} 个图层`;
  syncToolButtons(); syncAnts();              
  const oh = $('#optHint'); oh.hidden = false;
  oh.innerHTML = '左侧工具栏：<kbd>V</kbd> 移动 · <kbd>M</kbd> 选框 · <kbd>L</kbd> 套索 · <kbd>W</kbd> 魔棒 · <kbd>B</kbd> 画笔 · <kbd>E</kbd> 橡皮 ｜ '
    + '<kbd>⌘/Ctrl+A</kbd> 全选 · <kbd>⌘/Ctrl+D</kbd> 取消选择 · <kbd>⌘/Ctrl+Z</kbd> 撤销 · <kbd>⌘/Ctrl+S</kbd> 导出';
  $('#info').textContent = `文档 ${docW}×${docH} · 图层 ${doc.layers.length} 层 · 双击智能对象进入内部编辑，属性面板可编辑智能对象`;
}
function ensureLazyPreviews(){
  if (!doc || docW * docH <= 64e6 || ![1, 3, 8].includes(doc.mode)) return;
  for (const l of doc.layers) {
    if ((!l?.lazyChannels && !l?.lazyImage) || l.lazyPreview) continue;
    const p = buildLazyLayerPreview(l, 2048, doc.mode);
    if (p) l.lazyPreview = p;
  }
}




export function renderLargeViewportFallback({ keepGPU = false, rect = null } = {}){
  if (!doc || !docW || !docH || li || soLayerIndex >= 0) return false;
  const win = visibleWindow(padL() * zoom, padT() * zoom, docW * zoom, docH * zoom);
  const cv = $('#below'); if (!win || !cv) return false;
  const dpr = win.dpr || 1, W = Math.max(1, Math.round(win.W * dpr)), H = Math.max(1, Math.round(win.H * dpr));
  placeWindow(cv, win); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d'); if (!ctx) return false;
  const s = zoom * dpr;
  const tx = (padL() * zoom - win.L) * dpr, ty = (padT() * zoom - win.T) * dpr;
  let px0 = 0, py0 = 0, px1 = W, py1 = H;
  if (rect && Number.isFinite(rect.x0) && Number.isFinite(rect.y0) && Number.isFinite(rect.x1) && Number.isFinite(rect.y1)) {
    px0 = Math.max(0, Math.floor(tx + rect.x0 * s) - 2); py0 = Math.max(0, Math.floor(ty + rect.y0 * s) - 2);
    px1 = Math.min(W, Math.ceil(tx + rect.x1 * s) + 2); py1 = Math.min(H, Math.ceil(ty + rect.y1 * s) + 2);
    if (px1 <= px0 || py1 <= py0) return true;
  }
  


  const complex = doc.layers.some(l => l && ((l.group && l.group.type != null) || l.knockout ||
    hasRenderableEffects(l.effects, doc.patterns) || hasRenderableFill(l.fill, l.vectorMask, doc.patterns) ||
    hasRenderableVectorMask(l.vectorMask) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask) ||
    (l.adjustment && adjustmentRenderParams(l.adjustment)) || (!!l.blendMode && l.blendMode !== 'norm' && l.blendMode !== 'pass')));
  const hasLazy = doc.layers.some(l => l && (l.lazyChannels || l.lazyImage));
  if (complex && !Object.keys(layerTransforms).length && !Object.keys(textRenders).length) {
    const x0 = Math.max(0, Math.floor((px0 - tx) / s) - 1), y0 = Math.max(0, Math.floor((py0 - ty) / s) - 1);
    const x1 = Math.min(docW, Math.ceil((px1 - tx) / s) + 1), y1 = Math.min(docH, Math.ceil((py1 - ty) / s) + 1);
    if (x1 > x0 && y1 > y0) {
      try {
        let source = composeDocForOrder(previewCompositeDoc(doc), displayOrder());
        if (hasLazy) {
          

          source = { ...source, layers: source.layers.map((layer, i) => {
            const raw = doc.layers[i];
            if (!raw || !(raw.lazyChannels || raw.lazyImage || raw.lazyRasterSource)) return layer;
            const rgba = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4);
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
              let p = readLazyLayerPixel(raw, x - (raw.bounds?.left || 0), y - (raw.bounds?.top || 0), doc.mode);
              if (!p && raw.lazyPreview) { const sx = Math.min(raw.lazyPreview.width - 1, Math.max(0, Math.floor((x - (raw.bounds?.left || 0)) * raw.lazyPreview.width / Math.max(1, raw.width)))); const sy = Math.min(raw.lazyPreview.height - 1, Math.max(0, Math.floor((y - (raw.bounds?.top || 0)) * raw.lazyPreview.height / Math.max(1, raw.height)))); const q0 = (sy * raw.lazyPreview.width + sx) * 4; p = [raw.lazyPreview.data[q0], raw.lazyPreview.data[q0 + 1], raw.lazyPreview.data[q0 + 2], raw.lazyPreview.data[q0 + 3]]; }
              const q = ((y - y0) * (x1 - x0) + x - x0) * 4;
              if (p) { rgba[q] = p[0]; rgba[q + 1] = p[1]; rgba[q + 2] = p[2]; rgba[q + 3] = p[3]; }
            }
            return { ...layer, rgba, width: x1 - x0, height: y1 - y0,
              bounds: { left: x0, top: y0, right: x1, bottom: y1 }, lazyChannels: null, lazyImage: null, lazyRasterSource: false };
          }) };
        }
        const shifted = regionizeDoc(source, docW, docH, x0, y0, x1 - x0, y1 - y0);
        const surf = shifted && compositeAll(shifted, x1 - x0, y1 - y0, new Map());
        if (surf?.data) {
          const local = document.createElement('canvas'); local.width = x1 - x0; local.height = y1 - y0;
          local.getContext('2d').putImageData(new ImageData(surf.data, local.width, local.height), 0, 0);
          ctx.save(); ctx.imageSmoothingEnabled = zoom < 1;
          ctx.drawImage(local, 0, 0, local.width, local.height,
            Math.round(tx + x0 * s), Math.round(ty + y0 * s), Math.max(1, Math.ceil((x1 - x0) * s)), Math.max(1, Math.ceil((y1 - y0) * s)));
          ctx.restore();
          cv.docID = sceneRef(doc); cv.ownerID = frameOwnerOf(doc);
          if (!keepGPU) { GPUV.stale = false; gpuShow(false); }
          drawGizmo(); return true;
        }
      } catch {  }
    }
  }
  const rw = px1 - px0, rh = py1 - py0, out = new Uint8ClampedArray(rw * rh * 4);
  const order = displayOrder();
  const useTiles = zoom > 1.25;
  for (const idx of order) {
    const l = doc.layers[idx], n = layerTree?.flat?.[idx];
    if (!l || l.hidden || n?.group || n?.groupType) continue;
    const adj = l.adjustment && adjustmentRenderParams(l.adjustment);
    if (adj) {
      

      const adjusted = applyAdjustment(out, rw, rh, adj);
      const opacity = (l.opacity == null ? 255 : l.opacity) / 255;
      const mask = l.mask && l.mask.gray && !l.mask.disabled ? l.mask : null;
      for (let py = py0; py < py1; py++) for (let outX = px0; outX < px1; outX++) {
        const oi = ((py - py0) * rw + outX - px0) * 4;
        let k = opacity;
        if (mask) {
          const dx = Math.floor((outX + .5 - tx) / s), dy = Math.floor((py + .5 - ty) / s);
          const mx = (mask.relative ? dx - (l.bounds?.left || 0) : dx) - (mask.left || 0);
          const my = (mask.relative ? dy - (l.bounds?.top || 0) : dy) - (mask.top || 0);
          if (mx >= 0 && my >= 0 && mx < mask.width && my < mask.height) k *= (mask.gray[my * mask.width + mx] || 0) / 255;
          else k *= (mask.defaultColor == null ? 255 : mask.defaultColor) / 255;
          if (mask.invert) k = opacity - k + opacity * 0;
        }
        if (k <= 0) continue;
        if (k >= 1) { out[oi] = adjusted[oi]; out[oi + 1] = adjusted[oi + 1]; out[oi + 2] = adjusted[oi + 2]; out[oi + 3] = adjusted[oi + 3]; continue; }
        for (let c = 0; c < 4; c++) out[oi + c] = Math.round(out[oi + c] + (adjusted[oi + c] - out[oi + c]) * k);
      }
      continue;
    }
    const textLayer = textRenders[idx] && textCrops[idx] && textCrops[idx].rgba ? textCrops[idx] : null;
    const srcLayer = textLayer ? { ...l, rgba: textLayer.rgba, width: textLayer.bounds.right - textLayer.bounds.left,
      height: textLayer.bounds.bottom - textLayer.bounds.top, bounds: textLayer.bounds } : l;
    if (!(srcLayer.rgba || srcLayer.lazyChannels || srcLayer.lazyImage || srcLayer.lazyPreview) || !(srcLayer.width > 0 && srcLayer.height > 0)) continue;
    const mode = srcLayer.blendMode || 'norm'; if (mode !== 'norm' && mode !== 'pass') continue;
    const op = (srcLayer.opacity == null ? 255 : srcLayer.opacity) / 255;
    const b = srcLayer.bounds || { left: 0, top: 0 };
    const levels = lazyDetailLevels(l.lazyGpuDetail), preferred = lodForScale(s);
    const detailLevels = [...levels.filter(v => (v.scale || 1) <= preferred).reverse(), ...levels.filter(v => (v.scale || 1) > preferred)];
    for (let py = py0; py < py1; py++) {
      const dy = (py + .5 - ty) / s, sy = Math.floor(dy - b.top); if (sy < 0 || sy >= srcLayer.height) continue;
      for (let outX = px0; outX < px1; outX++) {
        const dx = (outX + .5 - tx) / s, sx = Math.floor(dx - b.left); if (sx < 0 || sx >= srcLayer.width) continue;
        const si = (sy * srcLayer.width + sx) * 4;
        let sample;
        const editKey=`${Math.floor(sx/256)*256}:${Math.floor(sy/256)*256}`;
        const edited=l.lazyGpuDetail?.edits?.tiles.get(editKey)||pixelPaint[idx]?.sparse?.tiles.get(editKey);
        if (srcLayer.rgba) sample = [srcLayer.rgba[si], srcLayer.rgba[si + 1], srcLayer.rgba[si + 2], srcLayer.rgba[si + 3]];
        else if(edited){const ti=((sy-edited.y)*edited.width+sx-edited.x)*4;sample=[edited.data[ti],edited.data[ti+1],edited.data[ti+2],edited.data[ti+3]];}
        else if (detailLevels.length) {
          for (const level of detailLevels) {
            const tile = level.tiles.get(`${Math.floor(sx / level.tileSize) * level.tileSize}:${Math.floor(sy / level.tileSize) * level.tileSize}`);
            if (!tile) continue;
            const k = tile.scale || 1, ti = (Math.floor((sy - tile.y) / k) * (tile.sampleWidth || tile.width) + Math.floor((sx - tile.x) / k)) * 4;
            sample = [tile.data[ti], tile.data[ti + 1], tile.data[ti + 2], tile.data[ti + 3]]; break;
          }
        } else if (l.lazyHighTiles) {
          const tile = l.lazyHighTiles.get(`${Math.floor(sx / 256) * 256}:${Math.floor(sy / 256) * 256}`);
          if (tile) { const ti = ((sy - tile.y) * tile.width + sx - tile.x) * 4; sample = [tile.data[ti], tile.data[ti + 1], tile.data[ti + 2], tile.data[ti + 3]]; }
        }
        if (!sample && useTiles && l.lazyChannels) {
          const tile = readLazyLayerTile(l, Math.floor(sx / 256), Math.floor(sy / 256), doc.mode);
          if (tile) { const ti = ((sy - tile.y) * tile.width + sx - tile.x) * 4; sample = [tile.data[ti], tile.data[ti + 1], tile.data[ti + 2], tile.data[ti + 3]]; }
        }
        if (!sample && useTiles && l.lazyImageTiles) {
          const tile = l.lazyImageTiles.get(`${Math.floor(sx / 256) * 256}:${Math.floor(sy / 256) * 256}`);
          if (tile) { const ti = ((sy - tile.y) * tile.width + sx - tile.x) * 4; sample = [tile.data[ti], tile.data[ti + 1], tile.data[ti + 2], tile.data[ti + 3]]; }
        }
        if (!sample && l.lazyPreview) {
          const qx = Math.min(l.lazyPreview.width - 1, Math.max(0, Math.floor(sx * l.lazyPreview.width / l.width)));
          const qy = Math.min(l.lazyPreview.height - 1, Math.max(0, Math.floor(sy * l.lazyPreview.height / l.height)));
          const qi = (qy * l.lazyPreview.width + qx) * 4, d = l.lazyPreview.data;
          sample = [d[qi], d[qi + 1], d[qi + 2], d[qi + 3]];
        }
        if (!sample) sample = readLazyLayerPixel(l, sx, sy, doc.mode);
        if (!sample) continue;
        const sa = (sample[3] / 255) * op; if (sa <= 0) continue;
        const oi = ((py - py0) * rw + outX - px0) * 4, da = out[oi + 3] / 255, oa = sa + da * (1 - sa);
        if (oa <= 0) continue;
        out[oi] = Math.round((sample[0] * sa + out[oi] * da * (1 - sa)) / oa);
        out[oi + 1] = Math.round((sample[1] * sa + out[oi + 1] * da * (1 - sa)) / oa);
        out[oi + 2] = Math.round((sample[2] * sa + out[oi + 2] * da * (1 - sa)) / oa);
        out[oi + 3] = Math.round(oa * 255);
      }
    }
  }
  ctx.putImageData(new ImageData(out, rw, rh), px0, py0);
  cv.docID = sceneRef(doc);
  cv.ownerID = frameOwnerOf(doc);
  if (!keepGPU) { GPUV.stale = false; gpuShow(false); }
  drawGizmo();
  return true;
}


export function renderStaticLayers(){
  if(doc?.mode!==4)nativeInkCache={doc:null,key:'',value:null};
  if (uiQuiet) return;                 
  if(soLayerIndex < 0){ renderPreviewOnly(); return; }   
  gpuShow(false); GPUV.stale = false;                     
  const bc = scratchCtx('#below'), ac = scratchCtx('#above');
  const order = displayOrder(), pos = order.indexOf(soLayerIndex);
  if (pos < 0) {                       
    paintLayers(bc, order);
    ac.clearRect(0,0,docW,docH);
    presentCanvas('#below'); presentCanvas('#above');
    return;
  }
  paintLayers(bc, order.slice(0, pos));
  paintLayers(ac, order.slice(pos + 1));
  presentCanvas('#below'); presentCanvas('#above');
}




export function renderOpacityRegion(idx){
  if (uiQuiet || !doc || li || soLayerIndex >= 0 || proofOn || cmDisplay() || chanView.single || chanView.off.size) return false;
  const order = displayOrder(), pos = order.indexOf(idx);
  if (pos < 0 || Object.keys(textRenders).length || Object.keys(layerTransforms).some(i => transformChanged(+i))) return false;
  const cdoc = composeDocForOrder(previewCompositeDoc(doc), order);
  const l = cdoc?.layers?.[pos]; if (!cdoc || !l) return false;
  const b = l.bounds || { left: 0, top: 0, right: docW, bottom: docH };
  const m = 4;
  const x0 = Math.max(0, Math.floor(b.left - m)), y0 = Math.max(0, Math.floor(b.top - m));
  const x1 = Math.min(docW, Math.ceil(b.right + m)), y1 = Math.min(docH, Math.ceil(b.bottom + m));
  if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) > docW * docH * 0.6) return false;
  const shifted = regionizeDoc(cdoc, docW, docH, x0, y0, x1 - x0, y1 - y0, pos);
  if (!shifted) return false;
  const surf = compositeAll(shifted, x1 - x0, y1 - y0, new Map());
  scratchCtx('#below').putImageData(new ImageData(surf.data, x1 - x0, y1 - y0), x0, y0);
  presentCanvas('#below', { rect: { x0, y0, x1, y1 } });
  drawGizmo();
  return true;
}



function fillFactor(i){
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  if (!L) return 1;
  return effFillOpacity(i, L) / 255;
}


export function paintStates(){
  const order = displayOrder();
  const hidden = new Set(), opac = {};
  const stack = [];
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k], l = doc.layers[i];
    const gt = l.group ? l.group.type : null;
    if (gt === 1 || gt === 2) { stack.push({ l, i }); hidden.add(i); }
    else if (gt === 3) { if (stack.length) stack.pop(); hidden.add(i); }
    else {
      if (l.hidden || stack.some(g => g.l.hidden)) hidden.add(i);
      opac[i] = ((l.opacity ?? 255) / 255) * fillFactor(i)
              * stack.reduce((a, g) => a * ((g.l.opacity ?? 255) / 255) * fillFactor(g.i), 1);
    }
  }
  return { hidden, opac };
}

export function layerPixelSource(i){
  const tc = textCrops[i];
  if (textRenders[i] && tc) return { data: tc.rgba, width: tc.bounds.right - tc.bounds.left, height: tc.bounds.bottom - tc.bounds.top };
  const l = doc && doc.layers[i];
  if (l && l.rgba && l.width > 0 && l.height > 0) return { data: l.rgba, width: l.width, height: l.height };
  return null;
}



const quadWarpCache = new WeakMap();




function warpedLayerCanvas(i, t, key, draft){
  const px = layerPixelSource(i);
  if (!px || !QUADM) return null;
  const sig = t.quad.map(q => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(';')
            + '|' + (t.flipX ? 1 : 0) + (t.flipY ? 1 : 0) + '|' + (draft ? 'd' : 'f') + '|' + docW + 'x' + docH;
  const hit = quadWarpCache.get(key);
  if (hit && hit.sig === sig) return hit;
  const k = draft ? 0.5 : 1;
  const q = k === 1 ? t.quad : t.quad.map(pt => [pt[0] * k, pt[1] * k]);
  const r = QUADM.warpQuad(px, q, {
    samples: draft ? 1 : 2, flipX: !!t.flipX, flipY: !!t.flipY,
    clip: { x: 0, y: 0, width: Math.ceil(docW * k), height: Math.ceil(docH * k) },
  });
  if (!r) return null;
  const cv = new OffscreenCanvas(r.width, r.height);
  cv.getContext('2d').putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  const out = { sig, cv, x: r.x / k, y: r.y / k, w: r.width / k, h: r.height / k };
  quadWarpCache.set(key, out);
  return out;
}

export function drawLayerContent(ctx, src, base, i, op, blend){
  const t = isMeshTransform(i) ? null : transformChanged(i);
  ctx.globalAlpha = op; ctx.globalCompositeOperation = blend;
  if (!t) { ctx.drawImage(src, base.left, base.top); return; }
  if (t.quad) {                                  
    const w = warpedLayerCanvas(i, t, src, !!(tfState && tfState.dragging));
    if (w) { ctx.drawImage(w.cv, w.x, w.y, w.w, w.h); return; }
    
  }
  ctx.save();
  ctx.translate(t.x + t.w/2, t.y + t.h/2);
  ctx.rotate(t.rot * Math.PI / 180);
  ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  ctx.drawImage(src, -t.w/2, -t.h/2, t.w, t.h);
  ctx.restore();
}




export function textCropCanvas(i){
  const tc = textCrops[i]; if (!tc) return null;
  if (tc._crop) return tc._crop;
  const w = tc.bounds.right - tc.bounds.left, h = tc.bounds.bottom - tc.bounds.top;
  if (!(w > 0 && h > 0)) return null;
  const off = new OffscreenCanvas(w, h);
  off.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(tc.rgba), w, h), 0, 0);
  return (tc._crop = off);
}

export function layerOffscreen(i){
  if (layerCanvasCache[i]) return layerCanvasCache[i];
  const l = doc.layers[i];
  const off = new OffscreenCanvas(l.width, l.height);
  off.getContext('2d').putImageData(new ImageData(l.rgba instanceof Uint8ClampedArray && l.rgba.length === l.width * l.height * 4 ? l.rgba : new Uint8ClampedArray(l.rgba), l.width, l.height), 0, 0);   
  return (layerCanvasCache[i] = off);
}


export function setPreviewPath(root, path, value){
  const segs = String(path).split('.'); let node = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = Array.isArray(node) ? Number(segs[i]) : segs[i];
    if (node == null || !Object.prototype.hasOwnProperty.call(node, k)) return;
    node = node[k];
  }
  const last = Array.isArray(node) ? Number(segs.at(-1)) : segs.at(-1);
  if (node == null || !Object.prototype.hasOwnProperty.call(node, last)) return;
  const old = node[last];
  
  
  
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) && old && typeof old === 'object' &&
      ['Rd  ', 'Grn ', 'Bl  '].every(k => Object.prototype.hasOwnProperty.call(old, k))) {
    old['Rd  '] = parseInt(value.slice(1, 3), 16);
    old['Grn '] = parseInt(value.slice(3, 5), 16);
    old['Bl  '] = parseInt(value.slice(5, 7), 16);
  
  
  
  } else if (typeof value === 'number' && old && typeof old === 'object' && old.__unit !== undefined) {
    old.value = value;
  } else if (typeof value === 'string' && old && typeof old === 'object' && old.__enumType !== undefined) {
    old.value = value;
  } else if (value && typeof value === 'object' && Array.isArray(value.points) && old && typeof old === 'object' && old.__classID === 'ShpC') {
    const r = contourDescFrom(value, old);   
    if (r.desc) node[last] = r.desc;
  } else node[last] = cloneOpValue(value);
}



export function previewPathValue(root, path){
  let node = root;
  for (const seg of String(path).split('.')) {
    const key = Array.isArray(node) ? Number(seg) : seg;
    if (node == null || !Object.prototype.hasOwnProperty.call(node, key)) return undefined;
    node = node[key];
  }
  return node;
}
export function applyPreviewArrayOps(root, arrayOps){
  for (const op of arrayOps || []) {
    const arr = previewPathValue(root, op.path);
    if (!Array.isArray(arr)) continue; 
    if (Number.isInteger(op.insertAt) && op.insertAt >= 0 && op.insertAt <= arr.length && arr.length) {
      const from = Number.isInteger(op.copyFrom) ? op.copyFrom : Math.min(op.insertAt, arr.length - 1);
      if (from < 0 || from >= arr.length) continue;
      const item = cloneOpValue(arr[from]);
      arr.splice(op.insertAt, 0, item);
      for (const [path, value] of Object.entries(op.value || {})) setPreviewPath(item, path, value);
    } else if (Number.isInteger(op.removeAt) && op.removeAt >= 0 && op.removeAt < arr.length) {
      arr.splice(op.removeAt, 1);
    } else if (op.sortBy !== undefined) {
      const field = op.sortBy === true ? 'Lctn' : op.sortBy;
      if (typeof field === 'string') arr.sort((a, b) => {
        const av = previewPathValue(a, field), bv = previewPathValue(b, field);
        return (Number(av) || 0) - (Number(bv) || 0);
      });
    }
  }
}
function previewVectorMask(layer, ops){
  if (!layer.vectorMask || typeof layer.vectorMask !== 'object') return layer.vectorMask;
  const next = cloneOpValue(layer.vectorMask), pathOp = ops.find(o => o.op === 'setVectorMaskPath');
  if (pathOp && Array.isArray(pathOp.subpaths)) {
    const code = { exclude: 0, combine: 1, subtract: 2, intersect: 3 };
    const records = [];
    for (const sp of pathOp.subpaths) {
      records.push({ type: 'subpath', open: sp.closed === false, operation: code[sp.operation] ?? 1 });
      for (const k of sp.knots || []) {
        const point = p => ({ x: (p?.[0] ?? k.anchor[0]) / docW, y: (p?.[1] ?? k.anchor[1]) / docH });
        records.push({ type: 'knot', linked: !!k.linked, anchor: point(k.anchor), preceding: point(k.in), leaving: point(k.out) });
      }
    }
    next.path = { ...(next.path || {}), records };
  }
  for (const op of ops.filter(o => o.op === 'setMaskProps')) {       
    if (op.vectorDensity !== undefined) next.density = op.vectorDensity;
    if (op.vectorFeather !== undefined) next.feather = op.vectorFeather;
  }
  for (const op of ops.filter(o => o.op === 'setVectorMaskFlags')) {
    for (const key of ['invert', 'notLink', 'disable']) if (op[key] !== undefined) next[key] = op[key];
    if (op.fillStartsWithAllPixels !== undefined && next.path?.records) {
      const initial = next.path.records.find(r => r.type === 'initialFill');
      if (initial) initial.fillStartsWithAllPixels = op.fillStartsWithAllPixels;
    }
  }
  return next;
}
function previewVectorStroke(layer, ops){
  if (!layer.vectorStroke || typeof layer.vectorStroke !== 'object') return layer.vectorStroke;
  const next = cloneOpValue(layer.vectorStroke), d = next.desc, op = ops.find(o => o.op === 'setVectorStroke');
  if (!d || !op) return next;
  const values = op.values || {}, enums = {
    cap: { butt: 'strokeStyleButtCap', round: 'strokeStyleRoundCap', square: 'strokeStyleSquareCap' },
    join: { miter: 'strokeStyleMiterJoin', round: 'strokeStyleRoundJoin', bevel: 'strokeStyleBevelJoin' },
    align: { inside: 'strokeStyleAlignInside', center: 'strokeStyleAlignCenter', outside: 'strokeStyleAlignOutside' },
    blendMode: { normal: 'Nrml' }
  };
  if (values.enabled !== undefined) d.strokeEnabled = values.enabled;
  if (values.fillEnabled !== undefined) d.fillEnabled = values.fillEnabled;
  for (const [name, key] of [['width', 'strokeStyleLineWidth'], ['opacity', 'strokeStyleOpacity'], ['dashOffset', 'strokeStyleLineDashOffset']]) {
    if (values[name] !== undefined) d[key] = { ...(d[key] || { __unit: name === 'opacity' ? '#Prc' : '#Pxl' }), value: values[name] };
  }
  for (const name of ['cap', 'join', 'align', 'blendMode']) if (values[name] !== undefined && enums[name][values[name]]) {
    const key = { cap: 'strokeStyleLineCapType', join: 'strokeStyleLineJoinType', align: 'strokeStyleLineAlignment', blendMode: 'strokeStyleBlendMode' }[name];
    d[key] = { ...(d[key] || {}), value: enums[name][values[name]] };
  }
  if (values.dashes !== undefined) d.strokeStyleLineDashSet = values.dashes.map(value => ({ __unit: '#Pxl', value }));
  if (values.color && d.strokeStyleContent && d.strokeStyleContent['Clr ']) {
    const c = d.strokeStyleContent['Clr ']; [c['Rd  '], c['Grn '], c['Bl  ']] = values.color;
  }
  return next;
}


function addPreviewEffect(effects, op){
  const spec = CREATABLE_FX[op.effect], next = createEffectTemplate(op.effect);
  if (!spec || !next) return effects;
  
  
  
  
  
  applyPreviewArrayOps(next, op.arrayOps);
  for (const [path, value] of Object.entries(op.values || {})) setPreviewPath(next, path, value);
  const out = effects || { __name: '', __classID: 'Lefx', masterFXSwitch: true };
  
  if (spec.multi) {
    if (Array.isArray(out[spec.multi])) out[spec.multi].unshift(next);
    else if (out[spec.key]) { out[spec.multi] = [next, out[spec.key]]; delete out[spec.key]; }
    else out[spec.key] = next;
  } else if (!out[spec.key]) out[spec.key] = next;
  return out;
}



export const PREVIEW_EFFECT_MULTI = {
  DrSh: 'dropShadowMulti', IrSh: 'innerShadowMulti', SoFi: 'solidFillMulti',
  GrFl: 'gradientFillMulti', patternFill: 'patternFillMulti', FrFX: 'frameFXMulti',
};
export function previewCompositeDoc(source){
  if (!source || !Object.keys(layerOps).length) return source;
  let changed = false;
  const layers = source.layers.map((layer, index) => {
    const ops = layerOps[index] || [];
    const contentOps = layer.fill ? ops.filter(o => o.op === 'setLayerParams' && o.target === `adjustment:${layer.fill.key}`) : [];
    const adjOps = layer.adjustment && layer.adjustment.params
      ? ops.filter(o => o.op === 'setLayerParams' && o.target === `adjustment:${layer.adjustment.key}`) : [];
    const fxOps = ops.filter(o => o.op === 'addLayerEffect' ||
      (layer.effects && typeof layer.effects === 'object' && (o.op === 'setLayerEffectsEnabled' || o.op === 'setLayerEffect' || o.op === 'removeLayerEffect' ||
        (o.op === 'setLayerParams' && (o.target === 'effects' || o.target.startsWith('effect:'))))));
    const fillOp = ops.find(o => o.op === 'setFillOpacity');
    const koOp = ops.find(o => o.op === 'setLayerKnockout');
    const boOp = ops.find(o => o.op === 'setBlendOptions' && (o.blendIf || o.channels));
    const pathOps = ops.filter(o => o.op === 'setVectorMaskPath' || o.op === 'setVectorMaskFlags' ||
      (o.op === 'setMaskProps' && (o.vectorDensity !== undefined || o.vectorFeather !== undefined)));
    const strokeOp = ops.find(o => o.op === 'setVectorStroke');
    

    const isGroupHead = layer.group && (layer.group.type === 1 || layer.group.type === 2);
    
    const isAdjLayer = !!(layer.adjustment && layer.adjustment.kind !== 'fill');
    const groupMaskOv = (isGroupHead || isAdjLayer) && (maskPaint[index] || ops.some(o => o.op === 'setMaskProps'))
      ? (maskPaint[index] ? { ...(layer.mask || {}), ...maskOverrideOf(index, maskPaint[index]) }
        : { ...layer.mask, ...(opField(index, 'setMaskProps', 'disabled') !== undefined ? { disabled: opField(index, 'setMaskProps', 'disabled') } : {}),
            ...(opField(index, 'setMaskProps', 'invert') !== undefined ? { invert: opField(index, 'setMaskProps', 'invert') } : {}),
            ...(opField(index, 'setMaskProps', 'density') !== undefined ? { density: opField(index, 'setMaskProps', 'density') } : {}),
            ...(opField(index, 'setMaskProps', 'feather') !== undefined ? { feather: opField(index, 'setMaskProps', 'feather') } : {}) })
      : null;
    if (!adjOps.length && !contentOps.length && !fxOps.length && !fillOp && !koOp && !boOp && !pathOps.length && !strokeOp && !groupMaskOv) return layer;
    const fill = contentOps.length ? cloneOpValue(layer.fill) : layer.fill;
    for (const op of contentOps) {
      const root = fill.params?.desc || fill.desc;
      if (!root) continue;
      applyPreviewArrayOps(root, op.arrayOps);
      for (const [path, value] of Object.entries(op.values || {})) setPreviewPath(root, path, value);
    }
    const params = layer.adjustment && layer.adjustment.params ? cloneOpValue(layer.adjustment.params) : null;
    for (const op of adjOps) {
      
      
      
      const root = params && params.desc && typeof params.desc === 'object' ? params.desc : params;
      applyPreviewArrayOps(root, op.arrayOps);
      for (const [path, value] of Object.entries(op.values || {})) setPreviewPath(root, path, value);
    }
    let effects = layer.effects && typeof layer.effects === 'object' ? cloneOpValue(layer.effects) : layer.effects;
    
    
    const previewEffectAt = (key, at = 0) => {
      const effect = effects && (effects[key] ?? effects[PREVIEW_EFFECT_MULTI[key]]);
      return Array.isArray(effect) ? effect[at] : effect;
    };
    for (const op of fxOps) {
      if (op.op === 'addLayerEffect') { effects = addPreviewEffect(effects, op); continue; }
      if (op.op === 'setLayerEffectsEnabled' && effects) effects.masterFXSwitch = op.enabled;
      if (op.op === 'setLayerEffect') { const fx = previewEffectAt(op.effect, op.at || 0); if (fx) fx.enab = op.enabled; }
      if (op.op === 'removeLayerEffect') { const fx = previewEffectAt(op.effect, op.at || 0); if (fx) fx.enab = false; }
      if (op.op === 'setLayerParams' && effects) {
        


        const fx = op.target === 'effects' ? effects : previewEffectAt(op.target.slice('effect:'.length), op.at || 0);
        if (fx) {
          applyPreviewArrayOps(fx, op.arrayOps);
          for (const [path, value] of Object.entries(op.values || {})) setPreviewPath(fx, path, value);
        }
      }
    }
    changed = true;
    return { ...layer, ...(contentOps.length ? { fill } : {}), ...(params ? { adjustment: { ...layer.adjustment, params } } : {}), ...(fillOp ? { fillOpacity: fillOp.fillOpacity } : {}),
      ...(koOp ? { knockout: koOp.knockout } : {}), ...(boOp ? previewBlendOptions(layer, boOp) : {}), ...(groupMaskOv && groupMaskOv.gray ? { mask: groupMaskOv } : {}),
      ...(pathOps.length ? { vectorMask: previewVectorMask(layer, pathOps) } : {}), ...(strokeOp ? { vectorStroke: previewVectorStroke(layer, ops) } : {}), effects };
  });
  return changed ? { ...source, layers } : source;
}

function previewBlendOptions(layer, op){
  const out = {};
  if (op.blendIf) {
    const base = layer.blendIf || { gray: { src: [0, 0, 255, 255], dst: [0, 0, 255, 255] }, channels: [] };
    const bi = { gray: { ...base.gray }, channels: [0, 1, 2].map(k => ({ ...(base.channels[k] || { src: [0, 0, 255, 255], dst: [0, 0, 255, 255] }) })) };
    const put = (t, v) => { if (v.this) t.src = v.this.slice(); if (v.under) t.dst = v.under.slice(); };
    if (op.blendIf.gray) put(bi.gray, op.blendIf.gray);
    ['red', 'green', 'blue'].forEach((n, k) => { if (op.blendIf[n]) put(bi.channels[k], op.blendIf[n]); });
    out.blendIf = bi;
  }
  if (op.channels) {
    const off = new Set(layer.channelsOff || []);
    [['r', 0], ['g', 1], ['b', 2]].forEach(([n, c]) => { if (op.channels[n] === false) off.add(c); else if (op.channels[n] === true) off.delete(c); });
    out.channelsOff = off.size ? [...off] : null;
  }
  return out;
}
export let paintTempPair = null;
export function set_paintTempPair(v) { return (paintTempPair = v); }   
function paintTemps(needClipped, needBase){
  const mk = () => (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(docW, docH) : Object.assign(document.createElement('canvas'), { width: docW, height: docH });
  if (!paintTempPair) paintTempPair = { clipped: null, baseAlpha: null };
  const fit = cv => { if (cv.width !== docW || cv.height !== docH) { cv.width = docW; cv.height = docH; } return cv; };
  if (needClipped) paintTempPair.clipped = fit(paintTempPair.clipped || mk());
  if (needBase) paintTempPair.baseAlpha = fit(paintTempPair.baseAlpha || mk());
  return { clipped: needClipped ? paintTempPair.clipped : null, baseAlpha: needBase ? paintTempPair.baseAlpha : null };
}













export let composeLiveIdx = null;
export function set_composeLiveIdx(v) { return (composeLiveIdx = v); }   
export let belowCache = null;        
export function set_belowCache(v) { return (belowCache = v); }   
function coreCompose(cdoc, w, h, warped){
  const idx = composeLiveIdx;
  const usable = idx != null && !layerReorder && !layerDeletes.size
    && doc && cdoc.layers.length === doc.layers.length && idx < cdoc.layers.length;
  if (!usable) { belowCache = null; return compositeAll(cdoc, w, h, warped); }
  let at = -1;
  for (const p of compositeSplitPoints(cdoc)) if (p <= idx && p > at) at = p;
  if (at <= 0) return compositeAll(cdoc, w, h, warped);      
  if (belowCache && belowCache.idx === idx && belowCache.at === at
      && belowCache.w === w && belowCache.h === h && belowCache.n === cdoc.layers.length)
    return compositeAll(cdoc, w, h, warped, { below: { at, data: belowCache.data } });
  const opts = { captureBelow: at };
  const surf = compositeAll(cdoc, w, h, warped, opts);
  belowCache = opts.captured ? { idx, at, w, h, n: cdoc.layers.length, data: opts.captured } : null;
  return surf;
}



let lastComposeMs = 0;
const COMPOSE_BUDGET_MS = 16;                 
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());




let paintForExport = false;
export function paintLayersExport(ctx, indexes){
  const wasProof = proofOn, was = paintForExport;
  set_proofOn(false); paintForExport = true;
  try { paintLayers(ctx, indexes); }
  finally { paintForExport = was; set_proofOn(wasProof); }
}
export function paintLayers(ctx, indexes){
  


  if (!paintForExport && docW * docH > 64e6 && !li && soLayerIndex < 0) {
    renderLargeViewportFallback();
    return;
  }
  ctx.clearRect(0,0,docW,docH);
  
  
  
  const normalOrder = doc && doc.layers.map((_, i) => i);
  const effectiveOrder = (layerReorder || normalOrder || []).filter(i => !layerDeletes.has(i));
  const fullDocument = effectiveOrder && indexes.length === effectiveOrder.length && indexes.every((v, i) => v === effectiveOrder[i]);
  const hasDynamicRaster = Object.keys(textRenders).length || Object.keys(layerTransforms).some(i => transformChanged(+i));
  let composedDocBase = previewCompositeDoc(doc);
  
  const abNoClip = !!(moveDrag && !li);
  if (abNoClip && composedDocBase.layers.some(l => l.artboard))
    composedDocBase = { ...composedDocBase, layers: composedDocBase.layers.map(l => l.artboard ? { ...l, artboard: { ...l.artboard, noClip: true } } : l) };
  const composeDoc = fullDocument ? composeDocForOrder(composedDocBase, indexes) : composedDocBase;
  if(fullDocument&&doc.mode===4){
    const native=nativeCMYKPreview();
    if(native?.supported){
      const surf=cmykCompositeRGBA(native,getModeCodec(4));ctx.putImageData(new ImageData(surf.data,docW,docH),0,0);
      if(!paintForExport&&(proofOn||cmDisplay()))applyCmykProof(ctx);
      captureChanThumb(ctx);applyChannelView(ctx);return;
    }
  }
  const needsCoreCompose = composeDoc && composeDoc.layers.some(l => (l.group && l.group.type != null) || l.knockout || hasRenderableEffects(l.effects, composeDoc.patterns) || hasRenderableFill(l.fill, l.vectorMask, composeDoc.patterns) || hasRenderableVectorMask(l.vectorMask) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask) || (l.adjustment && PREVIEW_ADJUSTMENTS.has(l.adjustment.key)) || (!BLEND[l.blendMode] && CORE_BLEND.has(l.blendMode)) || !!l.blendIf || !!(l.channelsOff && l.channelsOff.length));
  



  





  const dragging = !!(moveDrag || (tfState && tfState.dragging))
    && (lastComposeMs > COMPOSE_BUDGET_MS || docW * docH > 2.6e6);
  if (fullDocument && needsCoreCompose && hasDynamicRaster && !dragging) {
    const over = new Map();
    try {
      for (let i = 0; i < doc.layers.length; i++) {
        const base = composedDocBase.layers[i];
        if (!base) continue;
        const t = isMeshTransform(i) ? null : transformChanged(i);
        if (t) {
          const r = rasterizeTransformed(i);
          if (r && r.rgba) over.set(base, { ...base, rgba: r.rgba, bounds: { ...r.bounds },
            width: r.bounds.right - r.bounds.left, height: r.bounds.bottom - r.bounds.top });
          else over.set(base, { ...base, rgba: null, width: 0, height: 0, bounds: { top: 0, left: 0, bottom: 0, right: 0 } });
        } else if (textRenders[i] && textCrops[i] && textCrops[i].rgba) {
          const b = textCrops[i].bounds;
          over.set(base, { ...base, rgba: textCrops[i].rgba, bounds: { ...b }, width: b.right - b.left, height: b.bottom - b.top });
        }
      }
      const doc2 = { ...composeDoc, layers: composeDoc.layers.map(l => over.get(l) || l) };
      const t0 = now();
      const surf = coreCompose(doc2, docW, docH, new Map());
      ctx.putImageData(new ImageData(surf.data, docW, docH), 0, 0);
      lastComposeMs = now() - t0;
      if (proofOn || cmDisplay()) applyCmykProof(ctx);
      captureChanThumb(ctx);
      applyChannelView(ctx);
      return;
    } catch (e) {  }
  }
  if (fullDocument && needsCoreCompose && !hasDynamicRaster) {
    const t0 = now();
    const surf = coreCompose(composeDoc, docW, docH, new Map());
    ctx.putImageData(new ImageData(surf.data, docW, docH), 0, 0);
    lastComposeMs = now() - t0;
    if (proofOn || cmDisplay()) applyCmykProof(ctx);
    captureChanThumb(ctx);
    applyChannelView(ctx);
    return;
  }
  const st = paintStates();
  
  
  


  const anyClip = indexes.some(i => doc.layers[i] && effClipping(i, doc.layers[i]));
  const anyCore = indexes.some(i => { const k = doc.layers[i] && doc.layers[i].blendMode; return k && !BLEND[k] && CORE_BLEND.has(k); });
  const { clipped, baseAlpha } = paintTemps(anyClip || anyCore, anyClip);
  const cc = clipped && clipped.getContext('2d'), bc = baseAlpha && baseAlpha.getContext('2d');
  let hasClipBase = false;
  
  
  
  const drawComposited = (source, key) => {
    if (BLEND[key] || !CORE_BLEND.has(key)) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = BLEND[key] || 'source-over'; ctx.drawImage(source, 0, 0); return; }
    const dst = ctx.getImageData(0, 0, docW, docH), src = source.getContext('2d').getImageData(0, 0, docW, docH);
    drawLayer({ data: dst.data, width: docW, height: docH }, { data: src.data, width: docW, height: docH }, 0, 0, { blendMode: key });
    ctx.putImageData(dst, 0, 0);
  };
  

  const groupHeadOf = new Map();
  { const stk = [];
    for (let k = composedDocBase.layers.length - 1; k >= 0; k--) {
      const t = composedDocBase.layers[k].group && composedDocBase.layers[k].group.type;
      if (t === 1 || t === 2) stk.push(k); else if (t === 3 && stk.length) groupHeadOf.set(k, stk.pop());
    } }
  const groupStack = [];
  const rootCtx = ctx;
  const closeGroupFrame = () => {
    const fr = groupStack.pop(), g = composedDocBase.layers[fr.hdr];
    if (groupHasMask(g)) {
      const m = groupMaskAlpha(g, docW, docH), md = new Uint8ClampedArray(docW * docH * 4);
      for (let q = 0; q < m.length; q++) md[q * 4 + 3] = m[q];
      const mc = mkGroupCv(); mc.getContext('2d').putImageData(new ImageData(md, docW, docH), 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mc, 0, 0);
    }
    if (g.artboard && g.artboard.rect && !g.artboard.noClip) {   
      const r = g.artboard.rect;
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx = fr.prev; hasClipBase = false;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = (g.blendMode !== 'pass' && BLEND[g.blendMode]) || 'source-over'; ctx.drawImage(fr.cv, 0, 0);
  };
  const mkGroupCv = () => (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(docW, docH) : Object.assign(document.createElement('canvas'), { width: docW, height: docH });
  for(const i of indexes){
    const l = doc.layers[i];
    const gType = l.group && l.group.type;
    if (gType === 3 && groupHeadOf.has(i)) {
      const hdr = groupHeadOf.get(i), g = composedDocBase.layers[hdr];
      const gVis = layerEdits[hdr] && layerEdits[hdr].visible != null ? layerEdits[hdr].visible : !g?.hidden;   
      if (g && (groupHasMask(g) || (g.artboard && g.artboard.rect)) && gVis) {
        const cv = mkGroupCv();
        groupStack.push({ hdr, prev: ctx, prevClip: hasClipBase, cv });
        ctx = cv.getContext('2d'); hasClipBase = false;
        
        const abd = g.artboard;
        if (abd && abd.rect && (abd.bgType | 0) !== 3) {
          const c = abd.bgType === 2 ? [0, 0, 0] : abd.bgType === 4 && Array.isArray(abd.color) ? abd.color : [255, 255, 255];
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(abd.rect.x, abd.rect.y, abd.rect.w, abd.rect.h);
        }
      }
      continue;
    }
    if ((gType === 1 || gType === 2) && groupStack.length && groupStack[groupStack.length - 1].hdr === i) {
      closeGroupFrame();
      continue;
    }
    if(st.hidden.has(i)) continue;
    const op = st.opac[i] ?? 1;
    const blend = BLEND[l.blendMode] || 'source-over';
    const text = textRenders[i], tc = textCrops[i];
    const src = text ? (tc ? textCropCanvas(i) : text) : (l.rgba && l.width > 0 && l.height > 0 ? layerOffscreen(i) : null);
    const base = text ? (tc ? tc.bounds : { left:0, top:0, right:docW, bottom:docH })
      : { left: l.bounds.left, top: l.bounds.top, right: l.bounds.right, bottom: l.bounds.bottom };
    if (!src) { if (!effClipping(i, l)) hasClipBase = false; continue; }
    if (effClipping(i, l)) {
      if (!hasClipBase) continue;
      cc.clearRect(0, 0, docW, docH);
      drawLayerContent(cc, src, base, i, op, 'source-over');
      cc.globalAlpha = 1; cc.globalCompositeOperation = 'destination-in'; cc.drawImage(baseAlpha, 0, 0);
      drawComposited(clipped, l.blendMode);
    } else {
      if (BLEND[l.blendMode] || !CORE_BLEND.has(l.blendMode)) drawLayerContent(ctx, src, base, i, op, blend);
      else {
        cc.clearRect(0, 0, docW, docH);
        drawLayerContent(cc, src, base, i, op, 'source-over');
        drawComposited(clipped, l.blendMode);
      }
      if (bc) { bc.clearRect(0, 0, docW, docH); drawLayerContent(bc, src, base, i, 1, 'source-over'); }
      hasClipBase = true;
    }
  }
  while (groupStack.length) closeGroupFrame();   
  ctx = rootCtx;
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  if (proofOn || cmDisplay()) applyCmykProof(ctx);
  captureChanThumb(ctx);
  applyChannelView(ctx);
}
export function composeDocForOrder(source, order){
  if (!source || !Array.isArray(order) || !Array.isArray(source.layers)) return source;
  for (const i of order) if (!Number.isInteger(i) || i < 0 || i >= source.layers.length) return source;
  if (order.length === source.layers.length && order.every((v, i) => v === i)) return source;
  return { ...source, layers: order.map(i => source.layers[i]) };
}
let nativeInkCache={doc:null,key:'',value:null};
onDocumentCacheRelease(() => { nativeInkCache = { doc: null, key: '', value: null }; });
export function nativeCMYKPreview(){
  if(!doc||doc.mode!==4){nativeInkCache={doc:null,key:'',value:null};return null;}
  if(li||Object.values(pixelPaint).some(p=>p&&!p.clean)||Object.keys(textRenders).length||Object.keys(soBaked).length||Object.keys(soEdits).length||Object.keys(soFilterEdits).length||Object.keys(soRepl).length||Object.keys(layerTransforms).some(i=>transformChanged(+i))||Object.keys(maskPaint).length||Object.values(layerOps).some(ops=>ops.some(o=>o.op!=='setFillOpacity'))){nativeInkCache={doc:null,key:'',value:null};return {supported:false,reasons:['当前像素/蒙版/变形仍在RGB编辑路径']};}
  const base=previewCompositeDoc(doc),order=displayOrder(),layers=base.layers.map((l,i)=>{
    const e=layerEdits[i]||{};return {...l,opacity:e.opacity??l.opacity,blendMode:e.blendKey??l.blendMode,hidden:e.visible==null?l.hidden:!e.visible};
  });
  const key=JSON.stringify([docW,docH,order,layers.map(l=>[l.hidden,l.opacity,l.fillOpacity,l.blendMode,l.bounds,l.effects,l.adjustment,l.blendIf,l.channelsOff,l.knockout,l.clipping])]);
  if(nativeInkCache.doc===doc&&nativeInkCache.key===key)return nativeInkCache.value;
  const value=compositeCMYK(composeDocForOrder({...base,layers},order),docW,docH);
  nativeInkCache={doc,key,value};return value;
}






export const chanView = { single: null, off: new Set() };
export const chanCount = () => (!doc ? 0 : doc.mode === 1 || doc.mode === 8 || doc.mode === 0 ? 1 : doc.mode === 4 ? 4 : 3);

export const chanSupported = () => !!doc && (doc.mode === 3 || doc.mode === 9 || doc.mode === 1 || doc.mode === 8);
const chanFiltered = () => chanSupported() && (chanView.single !== null || chanView.off.size > 0);

export function channelViewPixels(d){
  if (!chanFiltered()) return false;
  if (chanView.single !== null) {
    const c = chanView.single;
    for (let o = 0; o < d.length; o += 4) { const v = d[o + c]; d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255; }
  } else {
    for (const c of chanView.off) for (let o = c; o < d.length; o += 4) d[o] = 0;
  }
  return true;
}
function applyChannelView(ctx){
  if (paintForExport) return;
  if (LP) { try { if (LP.applyView(ctx)) return; } catch (e) { console.warn(e); } }     
  if (CHP) { try { if (CHP.applyView(ctx)) return; } catch (e) { console.warn(e); } }   
  if (!chanFiltered()) return;
  const img = ctx.getImageData(0, 0, docW, docH);
  channelViewPixels(img.data);
  ctx.putImageData(img, 0, 0);
}

export function setChannelView(o = {}){
  if (!chanSupported()) return false;
  const n = chanCount();
  if (o.single !== undefined) {
    chanView.single = o.single === null ? null : Math.max(0, Math.min(n - 1, o.single | 0));
    chanView.off.clear();
  } else if (o.toggle === 'all') {
    if (chanView.single !== null || chanView.off.size) { chanView.single = null; chanView.off.clear(); }
    else for (let c = 0; c < n; c++) chanView.off.add(c);
  } else if (o.toggle !== undefined) {
    const c = Math.max(0, Math.min(n - 1, o.toggle | 0));
    chanView.single = null;
    if (chanView.off.has(c)) chanView.off.delete(c); else chanView.off.add(c);
    if (chanView.off.size >= n) chanView.off.clear();     
  }
  renderPreviewOnly();
  syncChannelPanel();
  const names = ['红', '绿', '蓝'];
  shell.status(chanView.single !== null ? `只看「${doc.mode === 9 ? ['明度', 'a', 'b'][chanView.single] : (chanCount() === 1 ? '灰色' : names[chanView.single])}」通道（灰度显示）`
    : chanView.off.size ? `隐藏了 ${chanView.off.size} 个通道` : '合成通道');
  return true;
}

export function loadChannelSelection(c){
  if (!doc || !docW) return false;
  if (!selReady('载入通道选区')) return false;
  

  let src;
  const effectiveOrder = (layerReorder || doc.layers.map((_, i) => i)).filter(i => !layerDeletes.has(i));
  const srcDoc = composeDocForOrder(previewCompositeDoc(doc), effectiveOrder);
  try { src = compositeAll(srcDoc, docW, docH, new Map()).data; }
  catch (e) { $('#err').textContent = '载入通道选区失败：' + humanEditError(e && e.message || e); return false; }
  const data = new Uint8Array(docW * docH);
  const ch = c == null ? null : Math.max(0, Math.min(2, c | 0));
  for (let i = 0, o = 0; i < data.length; i++, o += 4)
    data[i] = ch === null ? Math.round(src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114) : src[o + ch];
  setSelection({ x: 0, y: 0, width: docW, height: docH, data, docW, docH }, { label: '载入通道选区' });
  shell.status(`已把${ch === null ? '合成' : ['红', '绿', '蓝'][ch]}通道载入为选区`);
  return true;
}


export let chanThumb = null;
function captureChanThumb(ctx){
  if (paintForExport || !doc || !docW || !docH) return;
  try { if (ctx.canvas !== viewScratch.get('#below')) return; } catch { return; }
  const w = 64, h = Math.max(1, Math.round(64 * docH / docW));
  if (!chanThumb) chanThumb = document.createElement('canvas');
  if (chanThumb.width !== w || chanThumb.height !== h) { chanThumb.width = w; chanThumb.height = h; }
  const g = chanThumb.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);          
  try { g.drawImage(ctx.canvas, 0, 0, w, h); } catch {}
}
function channelsPanelVisible(){
  const sec = document.querySelector('[data-panel="channels"]');
  return !!sec && !sec.hidden && sec.offsetParent !== null;
}
export function syncChannelPanel(){
  try { psPanels.refreshChannels(doc ? { mode: doc.mode } : null); } catch {}
}




export function cmDisplay(){ try { return !!(CM && CM.needsDisplay()); } catch { return false; } }
function applyCmykProof(ctx){
  try { if (CM && CM.applyDisplay(ctx)) return; } catch (e) { console.warn(e); }
  const cv = ctx.canvas; if (!cv.width || !cv.height) return;
  const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255;
    const k = 1 - Math.max(r, g, b), ik = 1 - k;
    if (ik < 1e-6) { d[i] = d[i+1] = d[i+2] = 0; continue; }
    const c = (ik - r) / ik, m = (ik - g) / ik, y = (ik - b) / ik;
    d[i]   = Math.round(255 * (1 - Math.min(1, c + k)));
    d[i+1] = Math.round(255 * (1 - Math.min(1, m + k)));
    d[i+2] = Math.round(255 * (1 - Math.min(1, y + k)));
  }
  ctx.putImageData(im, 0, 0);
}











export const GPUV = { gc: null, mod: null, canvas: null, st: createDrawListState(), loading: null, failed: '', on: false, stale: false, opacityHold: false,
  lutKey: '', snap: null, snapTimer: 0, snapBusy: false, snapVersion: 0, name: '', xfCache: new WeakMap(), refineRAF: 0,
  drawList: null, drawListSig: '', drawListBuilds: 0, frameQueue: null, frameQueueOwner: null, frameLimit: 1,
  completedDocID: 0, requestedDocID: 0, displayOwnerID: null, preserveExistingGPU: false,
  transitionVersion: 0, contentVersion: 0, presentationReady: false, lastView: null };
const gpuPrefOn = () => { try { return (PREF.get('performance') || {}).gpu !== false; } catch { return true; } };

export function gpuStatus(){
  if (!gpuPrefOn()) return { on: false, why: '首选项里关掉了「使用图形处理器」', name: GPUV.name };
  if (GPUV.failed) return { on: false, why: GPUV.failed, name: GPUV.name };
  if (!GPUV.gc) return { on: false, why: GPUV.loading ? '正在初始化' : '尚未初始化', name: GPUV.name };
  return { on: GPUV.on, why: GPUV.on ? '' : '当前状态走 CPU 合成', name: GPUV.name, bytes: GPUV.gc.bytesResident, stats: { ...GPUV.gc.stats }, frames: GPUV.frameQueue?.stats || null };
}
export const gpuActive = () => !!(GPUV.on && GPUV.gc);
export function ensureGpu(){
  if (GPUV.gc || GPUV.loading || GPUV.failed || !gpuPrefOn()) return GPUV.loading;
  if (typeof navigator === 'undefined' || !navigator.gpu) { GPUV.failed = '这个浏览器没有 WebGPU（Chrome / Edge 113+、Safari 26+ 有）'; return null; }
  GPUV.loading = (async () => {
    try {
      const m = await import('../../../core/render/gpu-compositor.js');
      const cv = document.createElement('canvas');
      cv.id = 'gpuView'; cv.setAttribute('aria-hidden', 'true'); cv.style.display = 'none';
      const below = $('#below'); if (!below || !below.parentNode) throw new Error('舞台还没建好');
      below.after(cv);
      const gc = await m.createGpuCompositor({ canvas: cv });
      GPUV.name = gc.name;
      GPUV.mod = m; GPUV.gc = gc; GPUV.canvas = cv;
      if (gc.device && gc.device.lost) gc.device.lost.then(info => { if (GPUV.gc !== gc || (info && info.reason === 'destroyed')) return; GPUV.failed = 'GPU 设备丢失（' + ((info && info.message) || '驱动重置') + '），已退回 CPU 合成'; GPUV.frameQueue?.dispose(); GPUV.frameQueue = null; GPUV.frameQueueOwner = null; GPUV.gc = null; try { if (doc) renderPreviewOnly(); else gpuShow(false); } catch {} });
      if (doc && soLayerIndex < 0 && !li) renderPreviewOnly();
    } catch (e) {
      GPUV.failed = 'WebGPU 初始化失败：' + (e && e.message || e);
      console.warn('[GPU 合成]', e);
      const cv = $('#gpuView'); if (cv) cv.remove();
    } finally { GPUV.loading = null; }
  })();
  return GPUV.loading;
}

export function gpuApplyPref(){
  if (!gpuPrefOn()) { GPUV.frameQueue?.dispose(); GPUV.frameQueue = null; GPUV.frameQueueOwner = null; if (GPUV.gc) { try { GPUV.gc.destroy(); } catch {} GPUV.gc = null; } gpuShow(false); const cv = $('#gpuView'); if (cv) cv.remove(); GPUV.failed = ''; if (doc) renderPreviewOnly(); return; }
  ensureGpu();
}
export function gpuShow(on){
  on = !!on;
  if (!on) { GPUV.frameQueue?.cancel(); GPUV.presentationReady = false; GPUV.preserveExistingGPU = false; GPUV.transitionVersion++; }
  const wasOn = GPUV.on;
  GPUV.on = on;
  if (GPUV.canvas) GPUV.canvas.style.display = on ? '' : 'none';
  if (on) { syncGpuVisibility(); if (GPUV.presentationReady && !wasOn) releaseCpuSurfaces(); }
  else {
    const b = $('#below'); if (b) b.style.visibility = '';
    if (wasOn && GPUV.stale) { GPUV.stale = false; try {
      if (!(docW * docH > 64e6 && renderLargeViewportFallback())) {
        const bc = scratchCtx('#below'); bc.clearRect(0, 0, docW, docH); paintLayers(bc, displayOrder()); presentCanvas('#below');
      }
    } catch {} }
  }
}
function syncGpuVisibility(){
  const ready = GPUV.presentationReady, b = $('#below');
  const cpuValid = b && b.ownerID === frameOwnerOf(doc) && b.width > 1 && b.height > 1;
  const retainedGPU = GPUV.preserveExistingGPU && GPUV.displayOwnerID === frameOwnerOf(doc) && !cpuValid;
  if (GPUV.canvas) GPUV.canvas.style.visibility = ready || retainedGPU ? '' : 'hidden';
  
  
  if (b) b.style.visibility = ready || retainedGPU || !cpuValid ? 'hidden' : '';
}


function releaseCpuSurfaces(){
  const sc = viewScratch.get('#below'); if (sc && (sc.width > 1 || sc.height > 1)) { sc.width = 1; sc.height = 1; }
  GPUV.stale = true;
  mipCache.clear();
  if (sharpTmp) { sharpTmp.width = 1; sharpTmp.height = 1; }
  if (paintTempPair) { for (const k of ['clipped', 'baseAlpha']) { const c = paintTempPair[k]; if (c) { c.width = 1; c.height = 1; } } }
  for (const k of Object.keys(layerCanvasCacheRaw)) delete layerCanvasCacheRaw[k];
  const b = $('#below'); if (b && (b.width > 1 || b.height > 1)) { b.width = 1; b.height = 1; }
  belowCache = null;
}
function gpuEligible(){
  if (!GPUV.gc || GPUV.failed || !doc || !docW || !docH || !gpuPrefOn()) return false;
  if (doc.layers.some(l => l && l.lazyChannels && !l.lazyPreview)) return false;
  

  if (GPUV.opacityHold) return false;
  if (li || soLayerIndex >= 0) return false;
  if(doc.mode===4&&nativeCMYKPreview()?.supported)return false; 
  if (viewAngle || (viewParCorrect && viewPar !== 1)) return false;
  try { if (LP && LP.maskView) return false; } catch {}
  try { if (CHP && CHP.view && CHP.view.extraOn && CHP.view.extraOn.length) return false; } catch {}
  return true;
}
export function setGpuOpacityHold(hold){
  const next = !!hold;
  if (GPUV.opacityHold === next) return;
  GPUV.opacityHold = next;
  if (next) gpuShow(false);
  else if (doc && !li && soLayerIndex < 0) renderPreviewOnly();
}
function opacityDragVectorLayer(target){
  if (!target || !doc || !layerTree || selLayer < 0) return false;
  const l = layerTree.flat?.[selLayer], d = doc.layers[selLayer];
  return !!(l && d && (l.vectorMask || l.fill || l.adjustment?.kind === 'fill' || d.vectorMask));
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    const t = e.target?.closest?.('#hdrOpacity, #panelLayers .lc-label.lp-scrub, input[data-attr="layer-opacity"]');
    if (t && opacityDragVectorLayer(t)) setGpuOpacityHold(true);
  }, true);
  const endOpacityHold = () => { if (GPUV.opacityHold) setGpuOpacityHold(false); };
  document.addEventListener('pointerup', endOpacityHold, true);
  document.addEventListener('pointercancel', endOpacityHold, true);
  window.addEventListener('blur', endOpacityHold, true);
}


function gpuLayerOverride(i, base){
  const t = isMeshTransform(i) ? null : transformChanged(i);
  const text = textRenders[i] && textCrops[i] && textCrops[i].rgba ? textCrops[i] : null;
  if (!t) {
    if (!text) return null;
    const b = text.bounds;
    return { ...base, rgba: text.rgba, bounds: { ...b }, width: b.right - b.left, height: b.bottom - b.top };
  }
  const plainPixels = !t.quad && !hasRenderableEffects(base.effects, doc.patterns) && !hasRenderableFill(base.fill, base.vectorMask, doc.patterns)
    && !vectorStrokeRenderParams(base.vectorStroke, base.vectorMask) && !hasRenderableVectorMask(base.vectorMask);
  if (plainPixels && !base.rgba && base.lazyPreview && (base.lazyChannels || base.lazyCompressedChannels)) {
    const p = base.lazyPreview, d = lazyTileState(base), sx = t.w / p.width, sy = t.h / p.height;
    const fx = t.flipX ? -1 : 1, fy = t.flipY ? -1 : 1, a = (t.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2, u0 = -t.w / 2 * fx, v0 = -t.h / 2 * fy;
    return { ...base, rgba: p.data, width: p.width, height: p.height, bounds: { left: 0, top: 0, right: p.width, bottom: p.height }, gpuXform: [co * sx * fx, si * sx * fx, -si * sy * fy, co * sy * fy, cx + co * u0 - si * v0, cy + si * u0 + co * v0], gpuDetailTiles: d };
  }
  const px = text ? { data: text.rgba, w: text.bounds.right - text.bounds.left, h: text.bounds.bottom - text.bounds.top, b: text.bounds }
    : (base.rgba && base.width > 0 && base.height > 0 ? { data: base.rgba, w: base.width, h: base.height, b: base.bounds } : null);
  if (plainPixels && px && px.w > 0 && px.h > 0) {
    const sx = t.w / px.w, sy = t.h / px.h, fx = t.flipX ? -1 : 1, fy = t.flipY ? -1 : 1, a = (t.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2, u0 = -t.w / 2 * fx, v0 = -t.h / 2 * fy;
    const F = [co * sx * fx, si * sx * fx, -si * sy * fy, co * sy * fy, cx + co * u0 - si * v0, cy + si * u0 + co * v0];
    return { ...base, rgba: px.data, width: px.w, height: px.h, bounds: { left: 0, top: 0, right: px.w, bottom: px.h }, gpuXform: F };
  }
  const key = px ? px.data : base;
  const sig = JSON.stringify(t) + '|' + (base.effects ? 1 : 0);
  let hit = GPUV.xfCache.get(key);
  if (!hit || hit.sig !== sig) {
    const r = rasterizeTransformed(i);
    hit = { sig, layer: r && r.rgba ? { rgba: r.rgba, bounds: { ...r.bounds }, width: r.bounds.right - r.bounds.left, height: r.bounds.bottom - r.bounds.top }
      : { rgba: null, width: 0, height: 0, bounds: { top: 0, left: 0, bottom: 0, right: 0 } } };
    GPUV.xfCache.set(key, hit);
  }
  return { ...base, ...hit.layer };
}
const lazyGpuLayerCache = new WeakMap();
function gpuLazyLayer(l, i){
  const p = l?.lazyPreview;
  if (!p || l.rgba) return null;
  const source = doc?.layers?.[i] || l;
  const root=lazyTileState(source);root.edits=pixelPaint[i]?.sparse?.descriptor;
  const map = l.lazyHighTiles || (l.lazyHighTiles = new Map());
  const b = l.bounds || { left: 0, top: 0 };
  const sig = [l.width, l.height, b.left, b.top, l.opacity, l.hidden, l.blendMode, l.fillOpacity, layerStateVersion, layerOpsVersion].join(':');
  const old = lazyGpuLayerCache.get(l);
  if (old?.preview === p && old.map === map && old.sig === sig) return old.layer;
  const simple = !l.effects && !l.vectorMask && !l.fill && !transformChanged(i);
  const detail = simple ? lazyTileState(source) : null;
  const layer = { ...l, rgba: p.data, width: p.width, height: p.height,
    gpuXform: [l.width / p.width, 0, 0, l.height / p.height, b.left || 0, b.top || 0],
    ...(simple ? { gpuDetailTiles: detail } : {}),
  };
  lazyGpuLayerCache.set(l, { preview: p, map, sig, layer });
  return layer;
}
export function gpuComposeDoc(){
  let base = previewCompositeDoc(doc);
  if (moveDrag && !li && base.layers.some(l => l.artboard))
    base = { ...base, layers: base.layers.map(l => l.artboard ? { ...l, artboard: { ...l.artboard, noClip: true } } : l) };
  let layers = base.layers, changed = false;
  for (let i = 0; i < layers.length; i++) {
    let o = gpuLazyLayer(layers[i], i);
    if (!o) o = gpuLayerOverride(i, layers[i]);
    if (o) { if (!changed) { layers = layers.slice(); changed = true; } layers[i] = o; }
  }
  return composeDocForOrder(changed ? { ...base, layers } : base, displayOrder());
}
const sceneRefs = new WeakMap(); let sceneRefSeq = 0;
const sceneRef = o => { if (!o || typeof o !== 'object') return '-'; let n = sceneRefs.get(o); if (!n) sceneRefs.set(o, n = ++sceneRefSeq); return n; };
function frameOwnerOf(d){ return d ? d.editorDocUID != null ? `tab:${d.editorDocUID}` : `parsed:${sceneRef(d)}` : null; }
function gpuSceneSignature(base){
  const parts = [docW, docH, displayOrder().join(','), layerStateVersion, layerOpsVersion];
  for (const l of base.layers || []) parts.push([sceneRef(l), sceneRef(l.rgba), GPUV.st.ver.get(l.rgba) || 0, GPUV.st.ver.get(l.mask?.gray) || 0, sceneRef(l.lazyPreview?.data), l.opacity, l.hidden, l.blendMode, sceneRef(l.effects), sceneRef(l.fill), sceneRef(l.adjustment), sceneRef(l.vectorMask)].join(':'));
  return parts.join('|');
}

function syncDisplayLut(){
  const need = proofOn || cmDisplay();
  if (!need) { if (GPUV.lutKey) { GPUV.gc.setDisplayLut(null); GPUV.lutKey = ''; } return; }
  let key = 'naive';
  try { if (CM) key = JSON.stringify([CM.state.displayKey, CM.state.proofOn, CM.state.gamut, CM.settings && CM.settings.gamutColor, proofOn, CM.state.mode, CM.state.profile && CM.state.profile.name]); } catch {}
  if (key === GPUV.lutKey) return;
  const data = GPUV.mod.bakeDisplayLut((px, w, h) => {
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
    g.putImageData(new ImageData(px, w, h), 0, 0);
    applyCmykProof(g);
    px.set(g.getImageData(0, 0, w, h).data);
  });
  GPUV.gc.setDisplayLut(data);
  GPUV.lutKey = key;
}
function gpuFrameQueue(){
  const gc = GPUV.gc;
  if (GPUV.frameQueue && GPUV.frameQueueOwner === gc) return GPUV.frameQueue;
  GPUV.frameQueue?.dispose(); GPUV.frameQueueOwner = gc;
  GPUV.frameQueue = createFrameQueue({
    maxInFlight: GPUV.frameLimit,
    isCurrent: p => !!doc && sceneRef(doc) === p.docID && p.transition === GPUV.transitionVersion && GPUV.gc === gc && !(viewHold && viewHold.freeze) && gpuEligible(),
    submit(p, deferred){
      const docID = p.docID, transition = p.transition;
      const pixels = GPUV.contentVersion, stateVersion = layerStateVersion, opsVersion = layerOpsVersion;
      const result = gpuFrameNow();
      if (result === 'layout') return null;
      if (!result) {
        if (deferred) requestAnimationFrame(() => { if (doc && sceneRef(doc) === docID && GPUV.gc === gc) renderPreviewOnly(); });
        return false;
      }
      return gc.device.queue.onSubmittedWorkDone().then(() => {
        if (GPUV.gc === gc && doc && sceneRef(doc) === docID && GPUV.transitionVersion === transition) {
          GPUV.completedDocID = docID;
          if (GPUV.on && gpuEligible() && !GPUV.presentationReady) {
            if (pixels === GPUV.contentVersion && stateVersion === layerStateVersion && opsVersion === layerOpsVersion) {
              GPUV.presentationReady = true; GPUV.displayOwnerID = frameOwnerOf(doc); GPUV.preserveExistingGPU = false;
              syncGpuVisibility(); releaseCpuSurfaces();
            } else gpuFrame(); 
          }
        }
      });
    },
    onError(e){
      if (GPUV.gc !== gc) return;
      GPUV.failed = 'GPU 提交失败：' + e.message;
      console.warn('[GPU 合成]', e);
      try { if (doc) renderPreviewOnly(); else gpuShow(false); } catch {}
    },
  });
  return GPUV.frameQueue;
}


export function gpuFrame(){
  if (!gpuEligible()) { GPUV.frameQueue?.cancel(); return false; }
  const docID = sceneRef(doc);
  if (GPUV.requestedDocID !== docID) {
    GPUV.preserveExistingGPU = GPUV.on && GPUV.displayOwnerID === frameOwnerOf(doc);
    GPUV.requestedDocID = docID; GPUV.presentationReady = false;
    if (GPUV.on) syncGpuVisibility();
  }
  return gpuFrameQueue().request({ docID, transition: GPUV.transitionVersion });
}

export async function gpuFlush(){
  try { await GPUV.frameQueue?.flush(); return !GPUV.frameQueue?.stats.failed; }
  catch { return false; } 
}
function gpuFrameNow(){
  try {
    const composeDoc = gpuComposeDoc();
    const sig = gpuSceneSignature(composeDoc);
    const list = sig === GPUV.drawListSig && GPUV.drawList ? GPUV.drawList : (GPUV.drawList = buildDrawList(composeDoc, docW, docH, GPUV.st), GPUV.drawListSig = sig, GPUV.drawListBuilds++, GPUV.drawList);
    if (!GPUV.gc.supports(list)) return false;
    const win = visibleWindow(padL() * zoom, padT() * zoom, docW * zoom, docH * zoom);
    if (!win) {                       
      if (!GPUV.layoutRAF) GPUV.layoutRAF = requestAnimationFrame(() => { GPUV.layoutRAF = 0; if (doc && !li && GPUV.on && !gpuFrame()) { gpuShow(false); renderPreviewOnly(); } });
      return 'layout';
    }
    const cv = GPUV.canvas;
    placeWindow(cv, win);
    const W = Math.max(1, Math.round(win.W * win.dpr)), H = Math.max(1, Math.round(win.H * win.dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const s = zoom * win.dpr, tx = (padL() * zoom - win.L) * win.dpr, ty = (padT() * zoom - win.T) * win.dpr;
    GPUV.wholeDoc = Math.abs(tx) < 1 && Math.abs(ty) < 1 && Math.abs(W - docW * s) <= 2 && Math.abs(H - docH * s) <= 2;   
    syncDisplayLut();
    GPUV.lastView = { W, H, s, tx, ty };
    GPUV.gc.render(list, { W, H, s, tx, ty }, chanFiltered() ? { single: chanView.single, off: chanView.off } : null);
    
    if (GPUV.gc.needsRefine && !GPUV.refineRAF) GPUV.refineRAF = requestAnimationFrame(() => { GPUV.refineRAF = 0; if (GPUV.on && !(viewHold && viewHold.freeze)) gpuFrame(); });
    return true;
  } catch (e) {
    console.warn('[GPU 合成] 这一帧退回 CPU：', e);
    return false;
  }
}

export async function gpuBench(n = 30){
  if (!gpuActive() || !doc) return null;
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    if (!gpuFrame()) return null;
    if (!await gpuFlush()) return null;
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const cv = GPUV.canvas, mid = times.slice(Math.floor(n * 0.1), Math.ceil(n * 0.9));
  return { W: cv.width, H: cv.height, ops: GPUV.gc.stats.ops, avg: mid.reduce((a, b) => a + b, 0) / mid.length, max: times[times.length - 1] };
}

export function gpuRepaintLayer(data, rect){
  if (!gpuActive() || !data) return false;
  GPUV.contentVersion++;
  GPUV.xfCache.delete(data);
  GPUV.gc.invalidate(data, rect || null);
  markDrawListDirty(GPUV.st, data);
  if (!gpuFrame()) return false;
  GPUV.stale = true;
  const b = $('#below');
  if (!GPUV.presentationReady && b?.ownerID === frameOwnerOf(doc) && b.width > 1 && b.height > 1) {
    
    
    if (docW * docH > 64e6) renderLargeViewportFallback({ keepGPU: true });
    else { const ctx = scratchCtx('#below'); ctx.clearRect(0, 0, docW, docH); paintLayers(ctx, displayOrder()); presentCanvas('#below'); }
  }
  try { drawGizmo(); } catch {}
  gpuAfterFrame();
  return true;
}



export function gpuForgetLayer(data){
  if (!data) return false;
  GPUV.contentVersion++;
  GPUV.xfCache.delete(data); markDrawListDirty(GPUV.st, data);
  if (!gpuActive()) return false;
  try { GPUV.gc.forget(data); return true; } catch { return false; }
}

export function gpuRekey(from, to){
  if (!GPUV.gc || !from || !to || from === to) return false;
  try { return GPUV.gc.rekey(from, to); } catch { return false; }
}
export function gpuInvalidateData(data){
  if (!data) return;
  GPUV.contentVersion++;
  GPUV.xfCache.delete(data);
  markDrawListDirty(GPUV.st, data);
  if (GPUV.gc) GPUV.gc.invalidate(data, null);
}
export function gpuPruneDetailTiles(state){
  GPUV.gc?.pruneDetailTiles(state);
}
export function gpuSparseChanged(){GPUV.contentVersion++;GPUV.stale=true;}

export function ensureScratch(){
  if (!GPUV.stale || !doc || !docW) return;
  GPUV.stale = false;
  const bc = scratchCtx('#below');
  bc.clearRect(0, 0, docW, docH);
  paintLayers(bc, displayOrder());
}

function gpuAfterFrame(){
  mipGen.set('#below', (mipGen.get('#below') || 0) + 1);
  GPUV.snapVersion++;
  scheduleGpuSnapshot();
}
function scheduleGpuSnapshot(){
  if (GPUV.snapTimer) clearTimeout(GPUV.snapTimer);
  GPUV.snapTimer = setTimeout(gpuSnapshot, 300);
}
async function gpuSnapshot(){
  GPUV.snapTimer = 0;
  if (!gpuActive() || !doc) return;
  if (GPUV.snapBusy) { scheduleGpuSnapshot(); return; }
  GPUV.snapBusy = true;
  try {
    const sourceDoc = doc, gc = GPUV.gc, queue = gpuFrameQueue(), revision = GPUV.snapVersion;
    if (queue.busy) { scheduleGpuSnapshot(); return; }
    const k = Math.min(1, 1024 / Math.max(docW, docH)), W = Math.max(1, Math.round(docW * k)), H = Math.max(1, Math.round(docH * k));
    const list = buildDrawList(gpuComposeDoc(), docW, docH, GPUV.st);
    if (!GPUV.gc.supports(list)) return;
    const readback = queue.background(() => gc.renderToRGBA(list, { W, H, s: k, tx: 0, ty: 0 }));
    if (!readback) { scheduleGpuSnapshot(); return; }
    const px = await readback;
    if (doc !== sourceDoc || GPUV.gc !== gc || !gpuActive() || revision !== GPUV.snapVersion) return;
    const c = GPUV.snap && GPUV.snap.width === W && GPUV.snap.height === H ? GPUV.snap : document.createElement('canvas');
    c.width = W; c.height = H; c.docW = docW; c.docH = docH; c.docID = sceneRef(sourceDoc); c.ownerID = frameOwnerOf(sourceDoc);
    

    c.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(px, W, H), 0, 0);
    GPUV.snap = c;
    const w = 64, h = Math.max(1, Math.round(64 * docH / docW));
    if (!chanThumb) chanThumb = document.createElement('canvas');
    if (chanThumb.width !== w || chanThumb.height !== h) { chanThumb.width = w; chanThumb.height = h; }
    const g = chanThumb.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(c, 0, 0, w, h);
    mipGen.set('#below', (mipGen.get('#below') || 0) + 1);
    if (channelsPanelVisible()) syncChannelPanel();
  } catch (e) { console.warn('[GPU 合成] 快照失败', e); }
  finally { GPUV.snapBusy = false; }
}

export function gpuSnapshotCanvas(){
  if (!gpuActive()) return null;
  if (GPUV.snap && GPUV.snap.ownerID === frameOwnerOf(doc) && GPUV.snap.docW === docW && GPUV.snap.docH === docH) return GPUV.snap;
  
  const cv = GPUV.canvas; if (!cv || GPUV.completedDocID !== sceneRef(doc) || !(cv.width > 1) || !GPUV.wholeDoc) return null;
  try {
    const c = document.createElement('canvas'), k = Math.min(1, 512 / Math.max(cv.width, cv.height));
    c.width = Math.max(1, Math.round(cv.width * k)); c.height = Math.max(1, Math.round(cv.height * k));
    c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height); c.docW = docW; c.docH = docH; c.partial = true;
    return c;
  } catch { return null; }
}
set_layerPixelHook(k => { const l = doc && doc.layers[k]; if (l && l.rgba) gpuInvalidateData(l.rgba); });

export async function replaceImg(file){
  if (!engineOK) { $('#err').textContent = '渲染引擎未加载：换设计图不可用（图层 / 文字编辑不受影响）。'; return; }
  if (cur < 0 || !li) { $('#err').textContent = '请先选择一个智能对象进入变形编辑，再换设计图。'; return; }
  pushDocHistory();                                           
  
  const url = URL.createObjectURL(file);
  set_replImg(await loadImage(url));
  set_replFile(file);                      
  if($('#fitMode').value==='stretch') $('#fitMode').value='cover';
  soRepl[cur] = { file, img: replImg, url, fit: fitOf() };
  renderWarpNow();
}

export function renderWarpNow(){
  const useImg = replImg || img;
  if(!useImg || !li){ return; }
  try {
    const cached=scratchCtx('#warp');
    if(warpSession?.preview){
      cached.clearRect(0,0,docW,docH);
      if(drawWarpCachedPreview(cached,warpSession,li)){
        if(proofOn||cmDisplay())applyCmykProof(cached);
        presentCanvas('#warp');drawGizmo();return;
      }
    }
    const saved = deformEnter?.raster;
    const layout = deformTool === 'perspectiveWarp' && deformOpts.pMode === 'layout';
    const same = saved && !layout && !replImg && deformEnter.k === cur
      && li.deforms?.length === deformEnter.stack.length
      && li.deforms.every((d, i) => deformEquals(d, deformEnter.stack[i]));
    if (same) {
      
      
      const target = scratchCtx('#warp');
      target.clearRect(0, 0, docW, docH);
      target.putImageData(new ImageData(new Uint8ClampedArray(saved.data), saved.width, saved.height), saved.bounds.left, saved.bounds.top);
      if (proofOn || cmDisplay()) applyCmykProof(target);
      presentCanvas('#warp'); drawGizmo();
      return;
    }
    let displayInfo = li;
    if (layout) {
      const prefix = (li.deforms || []).slice(0, Math.max(0, (li.deforms || []).indexOf(li.deform)));
      
      displayInfo = { ...li, points: null, deforms: prefix.length ? prefix : [{ ...li.deform, enabled: false }] };
    }
    renderWarp({
      backend, image: useImg, imageKey: useImg.src,
      layerInfo: displayInfo, docWidth: docW, docHeight: docH,
      filterInput: replImg ? null : filterInputForSO(cur, fitOf()),
      subdiv: 24, meshTolerance:dragState ? .8 : .2, supersample: +$('#ss').value,
      fit: fitOf(),
      readback: false            
    });
    blitToCanvas(scratchCanvas('#warp'), docW, docH);
    if (proofOn || cmDisplay()) applyCmykProof(scratchCtx('#warp'));
    presentCanvas('#warp');
  } catch(e){ $('#err').textContent='渲染失败：'+e.message; return; }
  drawGizmo();
  $('#info').textContent = `文档 ${docW}×${docH} · `
    + (li.deform ? `${li.deformName}（智能滤镜，可拖顶点/图钉）` : `网格 ${li.xn}×${li.yn}（patch ${patchCountX(li.xn)}×${patchCountY(li.yn)}） · warp=${li.warpStyle}`)
    + ` · 设计区 ${li.width}×${li.height} · 源图 ${useImg.naturalWidth || useImg.width}×${useImg.naturalHeight || useImg.height}`
    + ` · 覆盖 ${FIT_LABELS[$('#fitMode').value]}`;
}

export const topo = () => meshTopology(li.xn, li.yn);


export function isoU(U, steps=60){ const o=[]; for(let k=0;k<=steps;k++) o.push(surfacePoint(li.points,li.xn,li.yn,U,k/steps,li.sliceX,li.sliceY)); return o; }
export function isoV(V, steps=60){ const o=[]; for(let k=0;k<=steps;k++) o.push(surfacePoint(li.points,li.xn,li.yn,k/steps,V,li.sliceX,li.sliceY)); return o; }
export function polyDist(line, pt){
  let best=Infinity;
  for(let i=0;i<line.length-1;i++){
    const a=line[i], b=line[i+1], vx=b.x-a.x, vy=b.y-a.y, L=vx*vx+vy*vy;
    let t = L>1e-9 ? ((pt.x-a.x)*vx+(pt.y-a.y)*vy)/L : 0; t=Math.max(0,Math.min(1,t));
    const d=Math.hypot(a.x+vx*t-pt.x, a.y+vy*t-pt.y); if(d<best) best=d;
  }
  return best;
}
export const stroke = (ctx, line) => { ctx.beginPath(); line.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke(); };
