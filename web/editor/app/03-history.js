




import './02-doc-state.js';   
import { actions } from '../actions.js';
import { DOCS } from '../documents.js';
import { DOC_EXT } from '../layerb.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { psPanels } from '../ps-panels.js';
import { shell } from '../shell.js';
import { $, FIT_LABELS, FIT_MODES, createBrowserGLBackend } from './01-boot.js';
import {
  CM, applyState, brushHistory, captureState, cur, doc, docH, docName, docStack, docW, globalLight,
  globalLightDirty, guides, guidesDirty, guidesGrid, history, layerDeletes, layerDupes, layerEdits, layerOps,
  layerRenames, layerReorder, layerTextEdits, layerTransforms, layerTree, li, maskPaint, meshFlipState,
  meshRotState, origBuffer, pixelPaint, psdFromPixels, redo, selection, set_TInputs, set_docH, set_docW,
  set_dragState, set_globalLight, set_globalLightDirty, set_guides, set_guidesDirty, set_guidesGrid,
  set_layerReorder, set_selPathCache, set_selection, settleForDocSwitch, soBaked, soEdits, soOrigRaster, soRepl,
  sos, textCrops, textFontSubst, textOverlay, textRenders, textStyleEdits, undo,
} from './02-doc-state.js';
import { fitStage, syncRulers } from './04-view-chrome.js';
import { renderLayerAlone } from './05-layer-lock-guides.js';
import { INFOP } from './07-nav-histogram.js';
import {
  docResolution, docResolutionBase, docSizeBase, pendingCropDelete, set_docResolution, set_docResolutionBase,
  set_docSizeBase, set_pendingCropDelete,
} from './08-doc-size.js';
import { cancelCrop, cropState } from './10-crop.js';
import {
  activePath, docPathsKey, savedPaths, savedPathsDirty, set_activePath, set_docPathsKey, set_savedPaths,
  set_savedPathsDirty, set_workPath, set_workPathDirty, workPath, workPathDirty,
} from './17-shape-pen.js';
import { commitFreeTransform, tfState } from './19-free-transform.js';
import { refreshAll, soInside } from './20-snap-smart-object.js';
import { initDocument, isImageFileName, loadPsd, openImageAsDocument, selectSO } from './21-load-document.js';
import { matchLayer } from './22-deform-tools.js';
import {
  collapsedGroups, layerCanvasCache, maskThumbCache, renderLayerPanel, selLayer, set_selLayer, thumbCache,
} from './23-layers-panel.js';
import {
  cloneOpValue, findLayerOp, layerOpsSnapshot, renderProps, syncLazyMaskOverrides,
} from './24-layer-ops-queue.js';
import { set_soloSnapshot, soloSnapshot } from './29-scrubby-live.js';
import { renderPreviewOnly, renderStaticLayers, renderWarpNow, replaceImg } from './30-render.js';
import {
  copyToolData, historySource, historySourceInfo, historySourceKey, measureLine, set_historySource,
  set_historySourceInfo, set_measureLine, set_toolData, syncAuxBar,
} from './31-selection-brush.js';
import { syncAnts, syncToolButtons } from './32-cursors-select-options.js';
import {
  docSlices, set_docSlices, set_lastAutoHit, set_sliceSel, set_slicesDirty, sliceSel, slicesDirty, syncSliceBar,
  userSlices,
} from './34-perspective-crop-slice.js';
import {
  brushRedo, brushRedoable, brushUndo, brushUndoable, forkPixelPaint, sparsePaintBusy,
} from './38-brush-engine.js';
import { set_pathModel } from './44-vector-path.js';
import { pathSelAnchors, pathSelSubs } from './45-path-tools.js';
import { drawGizmo } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import { buildPsdBuffer, syncInfoPanel } from './48-info-export.js';
import { compositeNowRGBA } from './50-clipboard-merge-mask.js';
import { textDescEdits } from './52-alpha-text-menu.js';
import { textSheetsRestore, textSheetsSnap } from './57-layer-style-text-path.js';










export const docHistory = { undo: [], redo: [] };
export let docHistLock = false;          
export function set_docHistLock(v) { return (docHistLock = v); }   
export let uiQuiet = 0;                 
export function set_uiQuiet(v) { return (uiQuiet = v); }   
export let commitPanelTimer = 0;         
export function set_commitPanelTimer(v) { return (commitPanelTimer = v); }   
export let layerEditInProgress = false;
export function set_layerEditInProgress(v) { return (layerEditInProgress = v); }   
export let soEnterSnap = null;           
export function set_soEnterSnap(v) { return (soEnterSnap = v); }   










export const histLog = { items: [], cursor: -1 };
export let HXP = null, hxFresh = false, hxOpenLabel = null;   
export function set_HXP(v) { return (HXP = v); }   
export function set_hxFresh(v) { return (hxFresh = v); }   
export function set_hxOpenLabel(v) { return (hxOpenLabel = v); }   
export function histReset(label){
  histLog.items = [{ label: label || '打开', kind: 'open' }];
  if (HXP) HXP.stamp(histLog.items[0]);
  histLog.cursor = 0;
  syncHistoryPanel();
}


export let ACTP = null, LAST_RUN = null;
export function set_ACTP(v) { return (ACTP = v); }   
export function set_LAST_RUN(v) { return (LAST_RUN = v); }   
export function actRecord(op, p){ if (ACTP) { try { ACTP.record(op, p); } catch (e) { console.warn('[actions] 录制打点出错', e); } } }
export function histPush(label, kind){
  if (docHistLock) return;
  try { INFOP && INFOP.noteOp(); } catch {}   
  if (ACTP) { try { ACTP.onHist(label); } catch {} }
  const item = { label: label || '编辑', kind };
  if (HXP) HXP.onPush(item);                          
  histLog.items.length = histLog.cursor + 1;          
  histLog.items.push(item);
  histLog.cursor = histLog.items.length - 1;
  histTrim();
  try { histTrimChain(); } catch (e) { console.warn('[历史记录] 裁剪失败', e); }
  histLogWrite(label, kind);
  syncHistoryPanel();
}




export function histCap(kind){ const n = Math.max(1, Math.min(1000, Math.round(+PREF.get('history.states') || 50))); return kind === 'brush' ? Math.min(n, 200) : n; }
export function histTrim(){
  

  const cap = histCap();
  let cut = 0;
  

  const nested = docHistory.undo.some(e => e && e.reload);
  while (!nested && histLog.items.length > cap + 1) {
    const it = histLog.items.shift(); cut++;
    for (const kind of [...((it && it.absorbed) || []), it && it.kind]) {   
      if (kind === 'brush') { if (brushHistory.undo.length) brushHistory.undo.shift(); }
      else if (kind === 'doc') { if (docHistory.undo.length) docHistory.undo.shift(); }
    }
  }
  if (cut) histLog.cursor = Math.max(0, histLog.cursor - cut);
  while (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();   
  for (const k of Object.keys(history)) { const h = history[k]; if (h && h.undo) while (h.undo.length > cap) h.undo.shift(); }
}




export function histMemBudget(){
  const pct = Math.max(20, Math.min(100, +((PREF.get('performance') || {}).memoryPct) || 70));
  const gb = (typeof navigator !== 'undefined' && +navigator.deviceMemory) || 4;
  

  return Math.max(256, Math.min(1024, gb * 1024 * pct / 100 / 6)) * 1048576;
}
export function histMemUsage(){
  const live = new Set(), seen = new Set(), objs = new Set();
  const bufOf = a => (a && a.buffer instanceof ArrayBuffer ? a.buffer : a instanceof ArrayBuffer ? a : null);
  if (doc) for (const l of doc.layers) {
    for (const a of [l.rgba, ...Object.values(l.nativePlanes || {})]) { const b = bufOf(a); if (b) live.add(b); }
  }
  for (const k in pixelPaint) { const v = pixelPaint[k]; for (const a of [v && v.rgba, v && v.orig, ...Object.values(v?.nativeSource || {})]) { const b = bufOf(a); if (b) live.add(b); } }
  if (historySource && historySource.forEach) historySource.forEach(v => { const b = bufOf(v && v.data); if (b) live.add(b); });
  { const b = bufOf(origBuffer); if (b) live.add(b); }
  let bytes = 0;
  const addBuf = a => { const b = bufOf(a); if (!b || live.has(b) || seen.has(b)) return; seen.add(b); bytes += b.byteLength; };
  const addCanvas = c => { if (!c || objs.has(c) || !(c.width > 0)) return; objs.add(c); bytes += c.width * c.height * 4; };
  const walkSnap = sn => {
    if (!sn || objs.has(sn)) return; objs.add(sn);
    if (sn.layerFields) for (const f of sn.layerFields) if (f) addBuf(f.rgba);
    const tr = sn.maps && sn.maps.textRenders; if (tr) for (const k in tr) { const v = tr[k]; addCanvas(v && (v.canvas || v)); }
  };
  const walkEntry = (e, depth) => {
    if (!e || depth > 8) return;
    if (e.reload) {
      const r = e.reload; if (objs.has(r)) return; objs.add(r);
      const st = r.state || {};
      if (st.doc && st.doc.layers) for (const l of st.doc.layers) { addBuf(l.rgba); if (l.planes) for (const id in l.planes) addBuf(l.planes[id]); for(const a of Object.values(l.nativePlanes || {})) addBuf(a); }
      addBuf(st.origBuffer);
      const mp = st.maps || {};
      for (const k in (mp.pixelPaint || {})) { const v = mp.pixelPaint[k]; if (v) { addBuf(v.rgba); addBuf(v.orig); for(const a of Object.values(v.nativeSource || {}))addBuf(a);if(v.sparse)for(const t of v.sparse.tiles.values()){addBuf(t.data);addBuf(t.original);} } }
      for (const k in (mp.maskPaint || {})) { const v = mp.maskPaint[k]; if (v) { addBuf(v.gray); addBuf(v.orig); } }
      if (st.historySource && st.historySource.forEach) st.historySource.forEach(v => v && addBuf(v.data));   
      walkSnap(r.snap);
      for (const h of [st.docHist, st.brushHist]) if (h) for (const x of (h.undo || []).concat(h.redo || [])) walkEntry(x, depth + 1);
      return;
    }
    if(e.kind==='tileStore'||e.kind==='pixelOps'){addBuf(e.before?.preview?.data);addBuf(e.after?.preview?.data);return;}
    if(e.patches){for(const p of e.patches){addBuf(p.before);addBuf(p.after);addBuf(p.original);}return;}
    if (e.before || e.after) { addBuf(e.before); addBuf(e.after); return; }
    walkSnap(e);
  };
  for (const e of docHistory.undo.concat(docHistory.redo)) walkEntry(e, 0);
  for (const e of brushHistory.undo.concat(brushHistory.redo)) walkEntry(e, 0);
  return bytes;
}





function reloadChain(){
  const out = [];                                    
  const walk = (list, depth) => {
    if (!list || depth > 64) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e && e.reload) { out.push({ list, i, rec: e.reload }); const st = e.reload.state || {}; walk(st.docHist && st.docHist.undo, depth + 1); }
    }
  };
  walk(docHistory.undo, 0);
  return out;
}

function reachableSteps(docList, brushList, depth = 0){
  let n = (docList ? docList.length : 0) + (brushList ? brushList.length : 0);
  if (docList && depth < 64) for (const e of docList) if (e && e.reload) { const st = e.reload.state || {}; n += reachableSteps(st.docHist && st.docHist.undo, st.brushHist && st.brushHist.undo, depth + 1); }
  return n;
}

function dropChainFrom(k){
  const ch = reloadChain(); const c = ch[k]; if (!c) return false;
  c.list.splice(0, c.i + 1);
  const reach = reachableSteps(docHistory.undo, brushHistory.undo);
  const cut = histLog.cursor - reach;
  if (cut > 0) { histLog.items.splice(0, cut); histLog.cursor -= cut; }
  return true;
}
const RELOAD_KEEP = 6;
let histMemCheckAt = 0;
function histTrimChain(){
  
  if (reloadChain().length > RELOAD_KEEP) dropChainFrom(RELOAD_KEEP);
  
  const cap = histCap();
  while (reachableSteps(docHistory.undo, brushHistory.undo) > cap) { const n = reloadChain().length; if (!n || !dropChainFrom(n - 1)) break; }
  
  const now = Date.now(); if (now - histMemCheckAt < 250) return;   
  histMemCheckAt = now;
  const budget = histMemBudget();
  let used = histMemUsage(), dropped = 0;
  while (used > budget) {
    const n = reloadChain().length;
    if (n) dropChainFrom(n - 1);                        
    else if (histLog.items.length > 3) {                
      const it = histLog.items.shift();
      for (const kind of [...((it && it.absorbed) || []), it && it.kind]) {
        if (kind === 'brush') { if (brushHistory.undo.length) brushHistory.undo.shift(); }
        else if (kind === 'doc') { if (docHistory.undo.length) docHistory.undo.shift(); }
      }
      histLog.cursor = Math.max(0, histLog.cursor - 1);
    } else break;
    dropped++; used = histMemUsage();
  }
  if (dropped) console.info(`[历史记录] 撤销快照约 ${(used / 1048576) | 0} MB（预算 ${(budget / 1048576) | 0} MB），丢弃了最早的 ${dropped} 段`);
}



export const histSessionLog = [];
function histLogWrite(label, kind){
  if (!PREF.get('history.log')) return;
  const t = new Date(); const ts = t.toLocaleString('zh-CN', { hour12: false });
  if (PREF.get('history.logItems') === 'sessions' && histSessionLog.length) return;
  histSessionLog.push(PREF.get('history.logItems') === 'detailed' ? `${ts}\t${docName || '未命名'}\t${label || '编辑'}\t(${kind === 'brush' ? '绘画' : '文档'})` : `${ts}\t${label || '编辑'}`);
}
export function saveHistoryLogText(){
  const head = `PSD Editor 历史记录日志\n文档：${docName || '未命名'}\n会话开始：${histSessionStart}\n\n`;
  const blob = new Blob([head + histSessionLog.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (docName || 'PSD Editor').replace(/\.[^.]+$/, '') + ' 历史记录.txt';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const histSessionStart = new Date().toLocaleString('zh-CN', { hour12: false });

export function historyEntries(){ return histLog.items.map(i => i.label); }

export function historyStep(back){
  if(sparsePaintBusy())return false;
  

  if (back) {
    if (histLog.cursor <= 0) return false;
    const it = histLog.items[histLog.cursor];
    if (HXP && histLog.cursor === histLog.items.length - 1) HXP.leavingTip();   
    
    let done = it.kind === 'brush' ? brushUndo(true) : undoDoc(true);
    if (done && it.absorbed) for (let k = it.absorbed.length - 1; k >= 0 && done; k--) done = it.absorbed[k] === 'brush' ? brushUndo(true) : undoDoc(true);
    if (done) histLog.cursor--;
    syncHistoryPanel(); updateUndoButtons();      
    return !!done;
  }
  if (histLog.cursor >= histLog.items.length - 1) return false;
  const it = histLog.items[histLog.cursor + 1];
  let done = true;
  if (it.absorbed) for (let k = 0; k < it.absorbed.length && done; k++) done = it.absorbed[k] === 'brush' ? brushRedo(true) : redoDoc(true);
  if (done) done = it.kind === 'brush' ? brushRedo(true) : redoDoc(true);
  if (done) histLog.cursor++;
  syncHistoryPanel(); updateUndoButtons();
  return !!done;
}

export function historyJump(i){
  i = Math.max(0, Math.min(histLog.items.length - 1, i | 0));
  let guard = 0;
  while (histLog.cursor > i && guard++ < 200) if (!historyStep(true)) break;
  while (histLog.cursor < i && guard++ < 200) if (!historyStep(false)) break;
  syncHistoryPanel();
  return histLog.cursor;
}
export function syncHistoryPanel(){
  if (HXP) { try { HXP.render(); } catch (e) { console.warn('[history] 面板刷新出错', e); } return; }
  try { psPanels.refreshHistory(historyEntries(), histLog.cursor, historySourceInfo ? histLog.items.indexOf(historySourceInfo.item) : -1); } catch {}
}






function hxCopyPixels(maps, snap){
  const seen = new Map(), cp = a => { if (!a || !ArrayBuffer.isView(a)) return a; let c = seen.get(a); if (!c) { c = a.slice(); seen.set(a, c); } return c; };
  const cpEntries = m => Object.fromEntries(Object.entries(m || {}).map(([k, e]) => { const o = { ...e }; for (const q in o) if (ArrayBuffer.isView(o[q])) o[q] = cp(o[q]); return [k, o]; }));
  maps.pixelPaint = cpEntries(maps.pixelPaint); maps.maskPaint = cpEntries(maps.maskPaint);
  for(const k in maps.pixelPaint)maps.pixelPaint[k]=forkPixelPaint(maps.pixelPaint[k]);
  maps.layerOps = Object.fromEntries(Object.entries(maps.layerOps || {}).map(([k, l]) => [k, l.map(o => ({ ...o }))]));
  if (snap && snap.layerFields) snap.layerFields = snap.layerFields.map(f => ({ ...f, bounds: { ...f.bounds }, rgba: seen.has(f.rgba) ? seen.get(f.rgba) : f.rgba }));
}
export function hxCapture(noStacks){
  const b = structuralBegin();
  b.state.maps.pixelPaint = pixelPaint; b.state.maps.maskPaint = maskPaint; b.state.maps.layerOps = layerOps;
  hxCopyPixels(b.state.maps, b.snap);
  if (noStacks) { b.state.docHist = { undo: [], redo: [] }; b.state.brushHist = { undo: [], redo: [] }; }
  return b;
}
export function hxApplyCtx(ctx, fresh){
  if (textOverlay) closeInlineText(true);
  if (cropState) cancelCrop();
  if (tfState) commitFreeTransform();
  
  const cp1 = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v && typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof HTMLCanvasElement) ? { ...v } : v]));
  const maps = { ...ctx.state.maps };
  const snap = { ...ctx.snap, maps: { ...ctx.snap.maps } };
  hxCopyPixels(maps, snap);
  snap.maps.soEdits = JSON.parse(JSON.stringify(ctx.snap.maps.soEdits || {}));
  for (const k of ['soBaked', 'soOrigRaster', 'layerEdits', 'layerTransforms', 'meshFlipState', 'textStyleEdits']) snap.maps[k] = cp1(ctx.snap.maps[k]);
  const keepSrc = [historySource, historySourceInfo];
  structuralApply({ ...ctx, state: { ...ctx.state, maps }, snap });
  set_historySource(keepSrc[0]); set_historySourceInfo(keepSrc[1]);      
  if (fresh) {
    docHistory.undo.length = 0; docHistory.redo.length = 0; brushHistory.undo.length = 0; brushHistory.redo.length = 0;
    histLog.items = [HXP ? HXP.stamp({ label: fresh.label, kind: 'snapbase', snapId: fresh.snapId }) : { label: fresh.label, kind: 'snapbase', snapId: fresh.snapId }];
    histLog.cursor = 0;
  }
  updateUndoButtons(); syncAuxBar(); drawGizmo(); syncHistoryPanel();
}

export function historySourceMapNow(){
  const next = new Map();
  if (doc) doc.layers.forEach((layer, i) => {
    const pp = pixelPaint[i];
    if (layer.rgba && layer.width && layer.height && !layerDeletes.has(i)) next.set(historySourceKey(i), {
      data: pp ? Uint8ClampedArray.from(pp.rgba) : layer.rgba, w: pp?.w || layer.width, h: pp?.h || layer.height,   
      left: pp?.left ?? layer.bounds.left, top: pp?.top ?? layer.bounds.top });
  });
  return next;
}
export function rgbaThumbCanvas(px, w, h, max = 96){
  const full = document.createElement('canvas'); full.width = w; full.height = h;
  full.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(px), w, h), 0, 0);
  const k = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(full, 0, 0, c.width, c.height);
  return c;
}

export async function hxDerivedSnapshot(from){
  if (!doc) return null;
  const idx = selLayer;
  const px = from === 'merged' ? compositeNowRGBA() : renderLayerAlone(idx);
  if (!px) throw new Error('这一层渲染不出来');
  const lname = from === 'merged' ? '图层 1' : (layerRenames[idx] || (layerTree && layerTree.flat[idx] && (layerTree.flat[idx].unicodeName || layerTree.flat[idx].name)) || '图层 1');
  const buf = await psdFromPixels(px, docW, docH, lname, 'transparent');
  if (!buf) return null;
  const live = hxCapture(false), w = docW, h = docH;
  let out = null;
  try {
    await initDocument(buf, docName, { nested: docStack.length > 0 });
    out = { ctx: hxCapture(true), src: new Map([['*', { data: Uint8ClampedArray.from(px), w, h, left: 0, top: 0 }]]), thumb: rgbaThumbCanvas(px, w, h) };
  } finally { hxApplyCtx(live); }
  return out;
}

export async function hxNewDocFromState(name){
  if (!doc) return false;
  if (!await settleForDocSwitch()) return false;
  let buf;
  try { buf = (await buildPsdBuffer()).buf; } catch (e) { $('#err').textContent = '新建文档没能完成：' + (e && e.message || e); return false; }
  const nm = (String(name || '未标题').replace(/[\\/:*?"<>|]/g, '_').trim() || '未标题') + '.psd';
  const dtk = await DOCS.beginOpen(); if (!dtk) return false;
  try { await initDocument(buf instanceof ArrayBuffer ? buf.slice(0) : buf, nm, { nested: false, freshDoc: true }); refreshAll(true); }
  catch (e) { DOCS.abortOpen(dtk); $('#err').textContent = '新建文档失败：' + (e && e.message || e); return false; }
  DOCS.endOpen(dtk);
  shell.status(`已从历史状态「${name}」创建新文档`);
  return true;
}


export function visibilityIntoHistory(){
  if (!doc) return;
  const patch = s => {
    if (!s) return;
    if (s.layerFields) s.layerFields.forEach((f, i) => { const l = doc.layers[i]; if (l && f.ref === l) f.hidden = l.hidden; });
    const le = s.maps && s.maps.layerEdits;
    if (le) for (const k in layerEdits) if (layerEdits[k] && layerEdits[k].visible != null && (!s.layerFields || (s.layerFields[k] && s.layerFields[k].ref === doc.layers[k]))) le[k] = { ...(le[k] || {}), visible: layerEdits[k].visible };
  };
  for (const s of docHistory.undo.concat(docHistory.redo)) { if (s.reload) patch(s.reload.snap); else patch(s); }
}

export function pushDocHistory(label){
  if (docHistLock) return;
  docHistory.undo.push(docSnapshot());
  if (docHistory.undo.length > histCap()) docHistory.undo.shift();
  docHistory.redo.length = 0;
  histPush(label, 'doc');
  updateUndoButtons();
}
export function beginLayerEdit(){ if (!layerEditInProgress) { pushDocHistory(); layerEditInProgress = true; } }
export function endLayerEdit(){ layerEditInProgress = false; }
export function docSnapshot(){
  const cp1 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v }]));   
  return {
    maps: {
      soEdits: JSON.parse(JSON.stringify(soEdits)),          
      soRepl: Object.fromEntries(Object.entries(soRepl).map(([k, v]) => [k, { ...v, fit: { ...v.fit } }])),
      soBaked: cp1(soBaked), soOrigRaster: cp1(soOrigRaster),
      layerEdits: cp1(layerEdits), layerTransforms: cp1(layerTransforms),
      meshRotState: { ...meshRotState }, meshFlipState: cp1(meshFlipState),
      layerRenames: { ...layerRenames }, layerTextEdits: { ...layerTextEdits },
      textStyleEdits: Object.fromEntries(Object.entries(textStyleEdits).map(([k, v]) => [k, { ...v }])),
      textFontSubst: { ...textFontSubst },
      textRenders: { ...textRenders }, textCrops: { ...textCrops },   
      soInside: { ...soInside },
    },
    collapsed: new Set(collapsedGroups),
    deletes: new Set(layerDeletes),
    reorder: layerReorder ? layerReorder.slice() : null,
    solo: soloSnapshot ? { idx: soloSnapshot.idx, map: soloSnapshot.map.slice() } : null,
    toolData: copyToolData(), measureLine: measureLine && cloneOpValue(measureLine),
    
    slices: docSlices ? { model: { ...docSlices, slices: docSlices.slices.map(sl => ({ ...sl, bounds: { ...sl.bounds } })) }, dirty: slicesDirty, sel: sliceSel } : { model: null, dirty: slicesDirty, sel: -1 },
    selLayer, selection,                        
    docSize: { w: docW, h: docH, res: docResolution, cropDelete: pendingCropDelete },   
    guides: guides.map(g => ({ ...g })), guidesDirty,
    textDescEdits: cloneOpValue(textDescEdits),
    textSheets: textSheetsSnap(),               
    globalLight: { ...globalLight }, globalLightDirty,
    layerFields: doc ? doc.layers.map(l => ({ ref: l, hidden: l.hidden, opacity: l.opacity, blendMode: l.blendMode,
      rgba: l.rgba, width: l.width, height: l.height, bounds: { ...l.bounds } })) : null,
    dupes: layerDupes.map(d => ({ ...d })),
    ops: layerOpsSnapshot(),                    
    
    docPaths: { work: workPath, workDirty: workPathDirty, saved: savedPaths, savedDirty: savedPathsDirty, active: activePath, key: docPathsKey },
    ext: Object.fromEntries(DOC_EXT.filter(x => x.snap).map(x => [x.key, x.snap()])),   
  };
}


const PAINT_OP_KINDS = new Set(['replaceLayerPixels', 'setLayerMaskPixels', 'addLayerMask', 'rasterizeLayer']);
function restoreOpsFromSnapshot(snapOps){
  const keep = {};
  for (const k in layerOps) { const p = layerOps[k].filter(o => PAINT_OP_KINDS.has(o.op)); if (p.length) keep[k] = p; }
  for (const k in layerOps) delete layerOps[k];
  for (const k in snapOps) { const list = snapOps[k].filter(o => !PAINT_OP_KINDS.has(o.op)).map(cloneOpValue); if (list.length) layerOps[k] = list; }
  for (const k in keep) layerOps[k] = (layerOps[k] || []).concat(keep[k]);
  set_pathModel(null);
}
export function restoreDocSnapshot(s){
  if (s.collapsed) { collapsedGroups.clear(); for (const i of s.collapsed) collapsedGroups.add(i); }
  if (s.toolData !== undefined) set_toolData(s.toolData ? cloneOpValue(s.toolData) : null);
  if ('measureLine' in s) set_measureLine(s.measureLine && cloneOpValue(s.measureLine));
  syncAuxBar();
  if (s.textDescEdits) { for (const k in textDescEdits) delete textDescEdits[k]; Object.assign(textDescEdits, cloneOpValue(s.textDescEdits)); }
  if ('textSheets' in s) textSheetsRestore(s.textSheets);
  if (s.ext) for (const x of DOC_EXT) if (x.restore && s.ext[x.key] !== undefined) x.restore(s.ext[x.key]);
  if (s.ops) restoreOpsFromSnapshot(s.ops);
  try { syncLazyMaskOverrides(); } catch {}
  if (s.docPaths) {
    const P = s.docPaths;
    set_workPath(P.work); set_workPathDirty(P.workDirty); set_savedPaths(P.saved); set_savedPathsDirty(P.savedDirty);
    set_activePath(P.active); set_docPathsKey(P.key); set_pathModel(null); pathSelSubs.clear(); pathSelAnchors.clear();
    try { psPanels.refreshPaths(layerTree); } catch {}
  }
  const M = { soEdits, soRepl, soBaked, soOrigRaster, layerEdits, layerTransforms, meshRotState, meshFlipState,
              layerRenames, layerTextEdits, textStyleEdits, textFontSubst, textRenders, textCrops, soInside };
  for (const k in M) { const m = M[k]; for (const q in m) delete m[q]; Object.assign(m, s.maps[k] || {}); }
  layerDeletes.clear(); for (const i of s.deletes) layerDeletes.add(i);
  set_layerReorder(s.reorder ? s.reorder.slice() : null);
  set_soloSnapshot(s.solo ? { idx: s.solo.idx, map: s.solo.map.slice() } : null);
  
  layerDupes.length = 0; if (s.dupes) layerDupes.push(...s.dupes.map(d => ({ ...d })));
  if (doc && s.layerFields) {
    doc.layers.length = s.layerFields.length;
    s.layerFields.forEach((f, i) => {
      const l = f.ref || doc.layers[i];
      if (!l) return;
      doc.layers[i] = l;
      l.hidden = f.hidden; l.opacity = f.opacity; l.blendMode = f.blendMode; l.rgba = f.rgba;
      l.width = f.width; l.height = f.height; l.bounds = { ...f.bounds };
    });
    
    const N0r = doc.layers.length - layerDupes.length;
    if (layerTree && layerTree.flat && layerTree.flat.length > N0r) layerTree.flat.length = N0r;


    if (layerTree && layerTree.flat) for (let i = 0; i < doc.layers.length; i++) {
      if (layerTree.flat[i]) continue;
      const dl = doc.layers[i]; if (!dl) continue;
      layerTree.flat[i] = { index: i, name: layerRenames[i] || dl.name || ('图层 ' + i),
        width: dl.width, height: dl.height, bounds: { ...(dl.bounds || { top: 0, left: 0, bottom: 0, right: 0 }) },
        hidden: !!dl.hidden, opacity: dl.opacity ?? 255, blendMode: dl.blendMode || 'norm',
        groupType: null, group: null, mask: null, vectorMask: null, adjustment: null, fill: null,
        text: null, isText: false, isSmartObject: false };
    }
  }
  for (const k in thumbCache) delete thumbCache[k];        
  for (const k in maskThumbCache) delete maskThumbCache[k];
  for (const k in layerCanvasCache) delete layerCanvasCache[k];
  set_selLayer(s.selLayer);
  if (s.docSize && (s.docSize.w !== docW || s.docSize.h !== docH)) {
    set_docW(s.docSize.w); set_docH(s.docSize.h);
    if (doc) { doc.width = docW; doc.height = docH; }
    fitStage(true);
  }
  if (s.docSize) { set_docResolution(s.docSize.res); set_pendingCropDelete(s.docSize.cropDelete); }
  if (s.guides) { set_guides(s.guides.map(g => ({ ...g }))); set_guidesDirty(s.guidesDirty); }
  if (s.slices) { set_docSlices(s.slices.model ? { ...s.slices.model, slices: s.slices.model.slices.map(sl => ({ ...sl, bounds: { ...sl.bounds } })) } : null);
    set_slicesDirty(s.slices.dirty); set_sliceSel(Math.min(s.slices.sel, userSlices().length - 1)); set_lastAutoHit(null); try { syncSliceBar(); } catch {} }
  if (s.globalLight) { set_globalLight({ ...s.globalLight }); set_globalLightDirty(s.globalLightDirty); }
  if (s.selection !== undefined && s.selection !== selection) { set_selection(s.selection); set_selPathCache(null); syncAnts(); }
  set_dragState(null); set_TInputs(null);
  renderLayerPanel();
  renderProps();
  if (li) { renderStaticLayers(); renderWarpNow(); } else renderPreviewOnly();
  updateUndoButtons();
}
export function undoDoc(quiet){
  if (!docHistory.undo.length) return false;
  if (cropState) cancelCrop();               
  const s = docHistory.undo.pop();
  if (s.reload) {
    const cur = structuralBegin();
    


    const after = docHistory.redo.slice();
    


    const hl = { items: histLog.items.slice(), cursor: histLog.cursor };
    structuralApply(s.reload);
    histLog.items = hl.items; histLog.cursor = hl.cursor;
    docHistory.redo.length = 0; docHistory.redo.push(...after, { reload: cur });
    updateUndoButtons();
  }
  else { docHistory.redo.push(docSnapshot()); restoreDocSnapshot(s); }
  if (!quiet) { histLog.cursor = Math.max(0, histLog.cursor - 1); syncHistoryPanel(); } return true; }
export function redoDoc(quiet){
  if (!docHistory.redo.length) return false;
  if (cropState) cancelCrop();               
  const s = docHistory.redo.pop();
  if (s.reload) {
    const cur = structuralBegin(), hl = { items: histLog.items.slice(), cursor: histLog.cursor }, rest = docHistory.redo.slice();
    structuralApply(s.reload);
    histLog.items = hl.items; histLog.cursor = hl.cursor;                      
    docHistory.redo.length = 0; docHistory.redo.push(...rest);                 
    docHistory.undo.push({ reload: cur }); updateUndoButtons();
  }
  else { docHistory.undo.push(docSnapshot()); restoreDocSnapshot(s); }
  if (!quiet) { histLog.cursor = Math.min(histLog.items.length - 1, histLog.cursor + 1); syncHistoryPanel(); } return true; }











const STRUCT_CACHE_MAPS = ['thumbCache', 'maskThumbCache', 'layerCanvasCache', 'soRasterCache', 'vpathCache', 'vstrokeCache'];
export function structuralBegin(){
  const state = captureState();
  for (const k of STRUCT_CACHE_MAPS) if (state.maps[k]) state.maps[k] = {};
  return {
    state, snap: docSnapshot(),
    extra: { docSizeBase: docSizeBase && { ...docSizeBase }, docResolutionBase, workPath, workPathDirty, savedPaths, savedPathsDirty, activePath, docPathsKey, guidesGrid: { ...guidesGrid } },
    hist: { items: histLog.items.slice(), cursor: histLog.cursor },
  };
}
export function structuralDone(prev, label){
  
  histLog.items = prev.hist.items.slice(); histLog.cursor = prev.hist.cursor;
  docHistory.undo.push({ reload: prev });
  docHistory.redo.length = 0;
  histPush(label, 'doc');                              
  updateUndoButtons();
}
export function structuralApply(prev){
  if (textOverlay) closeInlineText(false);
  applyState(prev.state);
  try { CM.prepareDocument(origBuffer, { resync: true }).then(() => CM.state && syncInfoPanel()).catch(() => {}); } catch {}   
  const x = prev.extra || {};
  if (x.docSizeBase) set_docSizeBase({ ...x.docSizeBase });
  if (x.docResolutionBase != null) set_docResolutionBase(x.docResolutionBase);
  set_workPath(x.workPath || null); set_workPathDirty(!!x.workPathDirty);
  set_savedPaths(x.savedPaths || []); set_savedPathsDirty(!!x.savedPathsDirty); set_activePath(x.activePath || null);
  set_docPathsKey(x.docPathsKey === undefined ? origBuffer : x.docPathsKey);
  if (x.guidesGrid) set_guidesGrid({ ...x.guidesGrid });
  restoreDocSnapshot(prev.snap);            
  document.querySelector('.app').classList.toggle('inside', docStack.length > 0);
  refreshAll(false);
  syncToolButtons(); syncRulers(); renderProps();
}
export function undoAny(){ return li ? undo() : undoDoc(); }
export function redoAny(){ return li ? redo() : redoDoc(); }



export const undoBtn = $('#undoBtn'), redoBtn = $('#redoBtn');
export function updateUndoButtons(){
  if (li) { const h = history[cur]; undoBtn.disabled = !h || !h.undo.length; redoBtn.disabled = !h || !h.redo.length; }
  else {   
           
    undoBtn.disabled = histLog.cursor <= 0 && !docHistory.undo.length && !brushUndoable() && !sparsePaintBusy() && !(HXP && HXP.canUndoStateChange());
    redoBtn.disabled = histLog.cursor >= histLog.items.length - 1 && !docHistory.redo.length && !brushRedoable();
  }
}
undoBtn.onclick = () => actions.run('edit.undo');
redoBtn.onclick = () => actions.run('edit.redo');

export const backend = createBrowserGLBackend();


export const panelPropsEl = $('#panelProps');
export let propTab = 'layer';
export function set_propTab(v) { return (propTab = v); }   
export const propMaskTargets = new Map();
export function set_propMaskTarget(i, kind) { if (i != null) propMaskTargets.set(+i, kind); }
export let propsLayer = null;
export function set_propsLayer(v) { return (propsLayer = v); }   
export let propsContext = { kind: 'document', label: '文档', icon: 'file' };
export function set_propsContext(v) { return (propsContext = v); }   
export let ADJP = null;                       
export function set_ADJP(v) { return (ADJP = v); }   
export let PP = null;                         
export function set_PP(v) { return (PP = v); }   
const PROP_TITLES = { layer: '图层属性', mask: '蒙版' };



export function syncPropTabs(){
  
  const userMask = propsLayer?.mask && !(propsLayer.isFrame && propsLayer.mask.fromOtherData);
  const maskish = !!(propsLayer && (userMask || propMaskTargets.has(propsLayer.index)
    || (propsLayer.vectorMask && !['shape', 'frame'].includes(propsContext.kind))
    || findLayerOp(propsLayer.index, 'maskStructural')));
  if (propTab !== 'mask' || !maskish) propTab = 'layer';
  for (const b of document.querySelectorAll('#propTabs [data-prop-tab]')) {
    b.classList.toggle('on', b.dataset.propTab === propTab);
    b.hidden = b.dataset.propTab === 'mask' ? !maskish : b.dataset.propTab !== 'layer';
  }
  $('#propTitle').textContent = propTab === 'layer' ? propsContext.label : PROP_TITLES[propTab] || '属性';
  for (const el of $('#props').children) {
    const panes = (el.dataset.sourcePanes || el.dataset.propPane || 'layer').split(' ');
    el.hidden = propTab === 'mask' ? !panes.includes('mask') : (panes.length === 1 && panes[0] === 'mask');
  }
  for (const thumbnail of document.querySelectorAll('.lrow .maskthumb')) {
    const on = propTab === 'mask' && thumbnail.closest('.lrow')?.dataset.layerIndex === String(propsLayer?.index)
      && thumbnail.dataset.maskKind === propMaskTargets.get(propsLayer.index);
    thumbnail.classList.toggle('selected', !!on); thumbnail.classList.toggle('target', !!on);
  }
  if (PP) PP.syncHeader(propTab, propsContext, propsLayer);
}
export function revealPropsPanel(){
  if (panelPropsEl.classList.contains('collapsed')) panelPropsEl.classList.remove('collapsed');
  panels.show('properties');
}
$('#propTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-prop-tab]'); if (!b) return;
  e.stopPropagation();
  revealPropsPanel();
  propTab = b.dataset.propTab; syncPropTabs();
});


FIT_MODES.forEach(m => { const op=document.createElement('option'); op.value=m; op.textContent=FIT_LABELS[m]; $('#fitMode').appendChild(op); });
$('#fitMode').value = 'stretch';   
export const fitOf = () => ({
  mode: $('#fitMode').value,
  alignX: +$('#alignX').value, alignY: +$('#alignY').value,
  scale: +$('#fitScale').value
});
for (const id of ['#fitMode','#alignX','#alignY','#fitScale'])
  $(id).oninput = () => { $('#fitScaleVal').textContent = (+$('#fitScale').value).toFixed(2); if (soRepl[cur]) soRepl[cur].fit = fitOf(); renderWarpNow(); };

$('#file').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';               
  if (!f) return;
  isImageFileName(f) ? await openImageAsDocument(f) : await loadPsd(f);
};
export let pendingReplSO = -1;            
export function set_pendingReplSO(v) { return (pendingReplSO = v); }   
$('#repl').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';             
  if (!f) return;
  
  if (!li && (pendingReplSO >= 0 || selLayer >= 0)) {
    const soIdx = pendingReplSO >= 0 ? pendingReplSO : sos.findIndex(so => matchLayer(so) === selLayer);
    pendingReplSO = -1;
    if (soIdx >= 0) await selectSO(soIdx);
  }
  if (!li) { $('#err').textContent = '请先选中一个智能对象（或在其属性面板点「换设计图」），再替换图片。'; return; }
  await replaceImg(f);
};
