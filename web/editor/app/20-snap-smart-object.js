




import './19-free-transform.js';
import { DOCS } from '../documents.js';   
import {
  getSmartObjectImageURL, parsePsdRaster, compositeAll, multiplyLayerMask, vectorStrokeRenderParams,
} from '../../../core/app.js';
import { decodeFilterEffectsEntry, filterEffectsIdOf, parseFilterEffects } from '../../../core/psd-filter-effects.js';
import { choiceDialog } from '../dialog.js';
import { DOC_EXT } from '../layerb.js';
import { pathBounds } from '../property-panel.js';
import { shell } from '../shell.js';
import { savedWarpBakeOutput } from '../warp-cached-preview.js';
import { $, EDIT, QUADM, applySoEdit, engineOK, ensureLazy, freshLayerInfo, renderWarp } from './01-boot.js';
import {
  LP, LX, applyDocFull, applyState, captureState, cur, doc, docH, docLabel, docName, docStack, docW,
  globalLightDirty, gridOpts, guides, guidesVisible, img, layerDeletes, layerDupes, layerEdits, layerRenames,
  layerReorder, layerTextEdits, layerTransforms, layerTree, li, maskPaint, origBuffer, set_layerReorder,
  set_soImgURL, soBaked, soEdits, soOrigRaster, soRepl, sos, textCrops, textOverlay, textRenders,
  textStyleEdits, vpDirty,
} from './02-doc-state.js';
import {
  HXP, actRecord, backend, beginLayerEdit, docHistLock, docHistory, endLayerEdit, pushDocHistory,
  set_docHistLock, set_hxFresh, set_layerEditInProgress, structuralApply, structuralBegin, structuralDone,
  updateUndoButtons,
} from './03-history.js';
import { fitStage } from './04-view-chrome.js';
import { layerSelBBox } from './06-view-zoom-move.js';
import { isVectorOnlyLayer, moveDrag, syncLayerRowSel } from './07-nav-histogram.js';
import { docResolution, docResolutionBase, docSizeBase } from './08-doc-size.js';
import { cropState } from './10-crop.js';
import { savedPathsDirty, workPathDirty } from './17-shape-pen.js';
import { moveLockWhy, sayLocked, tfState } from './19-free-transform.js';
import { buildTabs, initDocument, loadSourceImageOf } from './21-load-document.js';
import { exitSO, matchLayer } from './22-deform-tools.js';
import {
  layerCanvasCache, layerOrderView, renderLayerPanel, selLayer, selLayers, set_selLayer, thumbCache,
} from './23-layers-panel.js';
import { countLayerOps, humanEditError, maskStructOp, opField, renderProps } from './24-layer-ops-queue.js';
import { warpSession } from './26-layer-create.js';
import {
  batchTargets, getPropertyTransformValues, getTransformValues, setLayerPos, setShapePropertyTransform,
  transformChanged,
} from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import { paintStates, renderPreviewOnly, renderStaticLayers, renderWarpNow } from './30-render.js';
import { toolData } from './31-selection-brush.js';
import { allSlices, sliceOpts, sliceRect, userSlices } from './34-perspective-crop-slice.js';
import { syncArtboardPad } from './36-clipboard-frame.js';
import { isU8 } from './38-brush-engine.js';
import { effPathSubpaths } from './44-vector-path.js';
import { dispThr, drawGizmo, filterEditsPayload, soFilterEdits } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import { buildPsdBuffer, setWaitCursor } from './48-info-export.js';
import { textDescEdits } from './52-alpha-text-menu.js';
import { textSheetsForExport } from './57-layer-style-text-path.js';






export let snapOn = true;
export function set_snapOn(v) { return (snapOn = v); }   
export const snapTo = { documentBounds: true, guides: true, layers: true, grid: true, slices: true };

function userSlicesSafe(){ try { return (userSlices() || []).map(s => sliceRect(s)).filter(r => r && r.w > 0); } catch { return []; } }
export let snapLines = [];                     
export function set_snapLines(v) { return (snapLines = v); }   
export function snapTargets(exceptIdx, opts = {}){
  const xs = [], ys = [];
  if (!doc) return { xs, ys };
  

  const ox = opts.dx || 0, oy = opts.dy || 0, content = !opts.noContent;
  if (snapTo.guides && guidesVisible) for (const g of guides) (g.vertical ? xs : ys).push(g.px);
  if (!content) return { xs, ys };
  const n0x = xs.length, n0y = ys.length;
  if (snapTo.documentBounds) { xs.push(0, docW / 2, docW); ys.push(0, docH / 2, docH); }
  if (snapTo.slices && sliceOpts.show) for (const s of (typeof allSlices === 'function' ? userSlicesSafe() : [])) { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); }
  if (snapTo.grid && gridOpts.on) {
    const st = gridOpts.every / Math.max(1, gridOpts.sub);
    for (let x = 0; x <= docW; x += st) xs.push(x);
    for (let y = 0; y <= docH; y += st) ys.push(y);
  }
  if (snapTo.layers) {
    const st = paintStates();
    for (let i = 0; i < doc.layers.length; i++) {
      if (i === exceptIdx || layerDeletes.has(i) || st.hidden.has(i)) continue;
      const L = layerTree && layerTree.flat && layerTree.flat[i];
      if (L && L.groupType != null) continue;            
      const b = layerSelBBox(i);
      if (!b || !(b.w > 0 && b.h > 0)) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
  }
  if (ox || oy) { for (let k = n0x; k < xs.length; k++) xs[k] += ox; for (let k = n0y; k < ys.length; k++) ys[k] += oy; }
  return { xs, ys };
}







export function snapHandlePointer(exceptIdx, handle0, start, pt, opts = {}){
  snapLines = [];
  if (!snapOn || !doc || opts.off) return pt;
  const thr = Math.max(dispThr(8), 0.5);
  const { xs, ys } = snapTargets(exceptIdx);
  const hx = handle0[0] + pt.x - start.x, hy = handle0[1] + pt.y - start.y;
  const near = (cands, v) => {
    let best = null;
    for (const c of cands) { const dd = c - v; if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.dd))) best = { dd, px: c }; }
    return best;
  };
  let bx = opts.noX ? null : near(xs, hx), by = opts.noY ? null : near(ys, hy);
  if (opts.one && bx && by) { if (Math.abs(bx.dd) <= Math.abs(by.dd)) by = null; else bx = null; }
  if (bx) snapLines.push({ vertical: true, px: bx.px });
  if (by) snapLines.push({ vertical: false, px: by.px });
  return { x: pt.x + (bx ? bx.dd : 0), y: pt.y + (by ? by.dd : 0) };
}
export const quadBBoxExact = q => { const X = q.map(p => p[0]), Y = q.map(p => p[1]); const x = Math.min(...X), y = Math.min(...Y); return { x, y, w: Math.max(...X) - x, h: Math.max(...Y) - y }; };
export const quadAxisAligned = q => Math.abs(q[1][1] - q[0][1]) < 1e-6 && Math.abs(q[3][0] - q[0][0]) < 1e-6 && Math.abs(q[2][0] - q[1][0]) < 1e-6 && Math.abs(q[2][1] - q[3][1]) < 1e-6;

export function snapMoveDelta(idx, rect, dx, dy, opts = {}){
  snapLines = [];
  if (!snapOn || !doc) return { dx, dy };
  const thr = Math.max(dispThr(8), 0.5);
  const { xs, ys } = snapTargets(idx);
  const pick = (cands, edges, d) => {
    let best = null;
    for (const e of edges) for (const c of cands) {
      const delta = c - (e + d);
      if (Math.abs(delta) <= thr && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, px: c };
    }
    return best;
  };
  if (!opts.skipX) {
    const bx = pick(xs, [rect.x, rect.x + rect.w / 2, rect.x + rect.w], dx);
    if (bx) { dx += bx.delta; snapLines.push({ vertical: true, px: bx.px }); }
  }
  if (!opts.skipY) {
    const by = pick(ys, [rect.y, rect.y + rect.h / 2, rect.y + rect.h], dy);
    if (by) { dy += by.delta; snapLines.push({ vertical: false, px: by.px }); }
  }
  return { dx, dy };
}

export function snapGuidePx(vertical, px){
  if (!snapOn || !doc) return px;
  const thr = Math.max(dispThr(8), 0.5);
  const { xs, ys } = snapTargets(-1);
  let best = null;
  for (const c of (vertical ? xs : ys)) {
    const d = c - px;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best == null ? px : px + best;
}



export function nudgeLayer(dx, dy){
  if (selLayer < 0 || layerDeletes.has(selLayer)) return;
  const targets = [...new Set([...batchTargets(selLayer), ...(LX ? LX.linkedOf(selLayer) : [])])].filter(i => i >= 0 && doc.layers[i] && !layerDeletes.has(i));
  const free = targets.filter(i => !moveLockWhy(i));
  if (!free.length) { sayLocked(moveLockWhy(selLayer)); return; }
  beginLayerEdit();                              
  const lock = docHistLock; set_docHistLock(true);
  try {
    for (const i of free) {
      if (isVectorOnlyLayer(i)) {                
        const v2 = getPropertyTransformValues(i);
        setShapePropertyTransform(i, { x: v2.x + dx, y: v2.y + dy });
        continue;
      }
      const l = doc.layers[i];
      if (!((l.rgba && l.width > 0 && l.height > 0) || textCrops[i])) continue;   
      const v = getTransformValues(i);
      setLayerPos(i, v.x + dx, v.y + dy);
    }
  } finally { set_docHistLock(lock); }
  actRecord('move', { dx, dy });
  drawGizmo();
}

export function nudgeDuplicate(dx, dy){
  if (selLayer < 0 || layerDeletes.has(selLayer)) return;
  

  const many = batchTargets(selLayer).filter(i => i >= 0 && doc.layers[i] && !layerDeletes.has(i) && !moveLockWhy(i)
    && !(layerOrderView().nodes[i] || {}).group && !(layerOrderView().nodes[i] || {}).divider);
  if (many.length > 1) {
    endLayerEdit();
    const active = selLayer, lock = docHistLock, copies = [];
    let activeCopy = -1;
    try {
      for (const i of many) {
        const cp = duplicateLayerUI(i, { defer: true });
        set_docHistLock(true);                      
        if (cp < 0) continue;
        copies.push(cp); if (i === active) activeCopy = cp;
      }
      for (const cp of copies) {
        if (isVectorOnlyLayer(cp)) { const v2 = getPropertyTransformValues(cp); setShapePropertyTransform(cp, { x: v2.x + dx, y: v2.y + dy }); continue; }
        const v = getTransformValues(cp); setLayerPos(cp, v.x + dx, v.y + dy);
      }
    } finally { set_docHistLock(lock); }
    if (!copies.length) return;
    set_selLayer(activeCopy >= 0 ? activeCopy : copies[0]);
    selLayers.clear(); for (const cp of copies) selLayers.add(cp);
    dupKeepSel = copies.slice();
    set_layerEditInProgress(true);
    syncLayerRowSel(); drawGizmo();
    scheduleDupMaterialize();
    return;
  }
  endLayerEdit();
  const dup = duplicateLayerUI(selLayer, { defer: true });
  if (dup < 0) return;
  set_layerEditInProgress(true);                    
  const v = getTransformValues(dup);
  setLayerPos(dup, v.x + dx, v.y + dy);
  drawGizmo();
  scheduleDupMaterialize();
}



export function pointInQuadLocal(q, x, y){
  const tri = (A, B, C) => {
    const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(d) < 1e-12) return false;
    const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d;
    const l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d;
    return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
  };
  return tri(q[0], q[1], q[2]) || tri(q[0], q[2], q[3]);
}

function pointInShapePath(i, px, py){
  const sp = effPathSubpaths(i); const b = sp && pathBounds(sp);
  if (!b) return false;
  const dl = doc.layers[i], sw = vectorStrokeRenderParams(dl.vectorStroke, dl.vectorMask);
  const pad = sw ? sw.width : 0;
  if (px < b.x - pad || py < b.y - pad || px > b.x + b.w + pad || py > b.y + b.h + pad) return false;
  try {
    if (typeof Path2D === 'undefined') return true;
    const path = new Path2D();
    for (const s2 of sp) {
      const k = s2.knots; if (!k.length) continue;
      path.moveTo(k[0].anchor[0], k[0].anchor[1]);
      const n = s2.closed === false ? k.length - 1 : k.length;
      for (let j = 0; j < n; j++) { const a = k[j], c = k[(j + 1) % k.length]; path.bezierCurveTo(a.out[0], a.out[1], c.in[0], c.in[1], c.anchor[0], c.anchor[1]); }
      if (s2.closed !== false) path.closePath();
    }
    const cx = document.createElement('canvas').getContext('2d');
    if (cx.isPointInPath(path, px, py, 'evenodd')) return true;
    if (pad) { cx.lineWidth = pad * 2; return cx.isPointInStroke(path, px, py); }
    return false;
  } catch { return true; }
}

export function hitLayerAt(px, py, opts){
  if (!doc) return -1;
  const only = opts && opts.only != null ? opts.only : null;
  const st = paintStates();
  for (const i of displayOrder().slice().reverse()) {
    if (only != null && i !== only) continue;
    if (st.hidden.has(i)) continue;
    if (textRenders[i]) {                       
      const t = transformChanged(i), tc = textCrops[i];
      if (!t) { if (tc) { const b = tc.bounds; if (px >= b.left && px < b.right && py >= b.top && py < b.bottom) return i; } continue; }
      if (px >= t.x && px < t.x + t.w && py >= t.y && py < t.y + t.h) return i;
      continue;
    }
    const l = doc.layers[i];
    if (!l.rgba || l.width <= 0 || l.height <= 0) {
      
      if (isVectorOnlyLayer(i) && pointInShapePath(i, px, py)) return i;
      continue;
    }
    let sx, sy;
    const t = transformChanged(i);
    if (t && t.quad) {                          
      if (!QUADM) { if (!pointInQuadLocal(t.quad, px, py)) continue; return i; }
      const sp = QUADM.quadToSource(t.quad, l.width, l.height, px, py);
      if (!sp) continue;
      sx = Math.min(l.width - 1, Math.max(0, Math.round(t.flipX ? l.width - sp[0] : sp[0])));
      sy = Math.min(l.height - 1, Math.max(0, Math.round(t.flipY ? l.height - sp[1] : sp[1])));
    } else if (t) {                             
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      const a = -t.rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      const dx = px - cx, dy = py - cy;
      let rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
      if (t.flipX) rx = -rx; if (t.flipY) ry = -ry;
      sx = Math.round(l.bounds.left + (rx / t.w + 0.5) * l.width);
      sy = Math.round(l.bounds.top + (ry / t.h + 0.5) * l.height);
    } else { sx = Math.round(px - l.bounds.left); sy = Math.round(py - l.bounds.top); }
    if (sx < 0 || sy < 0 || sx >= l.width || sy >= l.height) continue;
    if (l.rgba[(sy * l.width + sx) * 4 + 3] > 8) return i;
  }
  return -1;
}

export function loadImage(src){ return new Promise((res,rej)=>{ const im=new Image(); im.crossOrigin='anonymous'; im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }





export const soRasterCache = {};
let filterInputBuffer = null, filterInputEntries = null;
const filterInputImages = new WeakMap();
export function filterInputForSO(k, fit){
  const so = sos[k];
  if (!so || soRepl[k] || soInside[k]?.changed || !origBuffer) return null;
  if (fit && ((fit.mode && fit.mode !== 'stretch' && fit.mode !== 'none') || fit.rotate || fit.offsetX || fit.offsetY || (fit.scale != null && fit.scale !== 1))) return null;
  const hit = filterInputImages.get(so);
  if (hit) return hit;
  try {
    if (filterInputBuffer !== origBuffer) {
      filterInputBuffer = origBuffer;
      const parsed = parseFilterEffects(origBuffer);
      filterInputEntries = parsed?.mode === 3 ? parsed.entries : null;
    }
    const id = filterEffectsIdOf(so);
    const entry = filterInputEntries?.find(e => e.id === id);
    if (!entry || entry.depth !== 8) return null;
    const decoded = decodeFilterEffectsEntry(entry);
    const input = { data: decoded.rgba, width: decoded.width, height: decoded.height,
      left: decoded.rect.left, top: decoded.rect.top };
    filterInputImages.set(so, input);
    return input;
  } catch (e) { console.warn('滤镜输入缓存解码失败', e); return null; }
}
export async function loadSourceImage(so, cacheKey = sos.indexOf(so), active = true){
  const si = so.sourceImage;
  if (!si || !si.bytes) return null;
  const sig = String.fromCharCode(si.bytes[0], si.bytes[1], si.bytes[2], si.bytes[3]);
  if (sig !== '8BPS') {
    const url = getSmartObjectImageURL(so);
    if (!url) return null;
    if (active) set_soImgURL(url);
    try { return await loadImage(url); }
    finally { if (!active) URL.revokeObjectURL(url); }
  }
  if (cacheKey >= 0 && soRasterCache[cacheKey]) return soRasterCache[cacheKey];
  try {
    const ab = si.bytes.slice().buffer;                    
    const sdoc = await parsePsdRaster(ab, { strictChannels: true });
    const surf = compositeAll(sdoc, sdoc.width, sdoc.height, new Map());
    const cv = document.createElement('canvas'); cv.width = surf.width; cv.height = surf.height;
    cv.getContext('2d').putImageData(new ImageData(surf.data, surf.width, surf.height), 0, 0);
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('PNG 编码失败')), 'image/png'));
    const url = URL.createObjectURL(blob);
    const im = await loadImage(url);
    URL.revokeObjectURL(url);
    if (cacheKey >= 0 && sos[cacheKey] === so) soRasterCache[cacheKey] = im;
    return im;
  } catch (e) {
    $('#err').textContent = `智能对象源图（PSD/PSB 格式）解码失败：${e.message}`;
    return null;
  }
}







export const soInside = {};                   

export async function openInside(k){
  const so = sos[k];
  if (!so) return;
  if (!engineOK) { $('#err').textContent = '渲染引擎未加载：内部编辑的变形回放需要引擎（图层 / 文字编辑不受影响）。'; return; }
  const si = so.sourceImage;
  

  let srcBytes = si && si.bytes;
  if (!srcBytes && LX && !(soInside[k] && soInside[k].state)) { try { srcBytes = await LX.contentBytes(k); } catch { srcBytes = null; } }
  if (!srcBytes) { $('#err').textContent = '该智能对象是外部链接文件，PSD 里没有缓存、也还没链接到本机文件：先「图层 › 智能对象 › 重新链接到文件…」。'; return; }
  const sig = String.fromCharCode(srcBytes[0], srcBytes[1], srcBytes[2], srcBytes[3]);
  let imageFormat = null;
  if (sig !== '8BPS') {
    imageFormat = srcBytes[0] === 0xff && srcBytes[1] === 0xd8 ? 'jpeg' : 'png';
    if (!LX) { $('#err').textContent = '该智能对象的源图是单张图片（非 PSD/PSB）。'; return; }
  }
  if (li) await exitSO();                               
  

  {
    const pend = sos.some(s2 => { const i = matchLayer(s2); return i >= 0 && !layerDeletes.has(i) && transformChanged(i); });
    if (pend && await ensureLazy(EDIT, '进入智能对象')) {
      const at = builtIndexOf(matchLayer(so));
      const prev = structuralBegin();
      try {
        const built = await buildPsdBuffer({ fast: true });
        await initDocument(built.buf, docName, { nested: docStack.length > 0 });
        refreshAll(false);
        structuralDone(prev, '变换');
      } catch (e) { try { structuralApply(prev); } catch {} $('#err').textContent = '进入智能对象前落地变换没能完成：' + humanEditError(e && e.message || e); return; }
      const k2 = sos.findIndex(s2 => matchLayer(s2) === at);
      if (k2 >= 0) return openInside(k2);
      return;
    }
  }
  const documentToken = await DOCS.beginEmbedded(so.linkId || `layer:${k}`);
  if (documentToken?.existing) return;
  const parent = captureState();
  const insideName = (si && si.filename) || ('内部 ' + (so.layerName || k));
  docStack.push({ state: parent, soIdx: k, insideName, imageFormat, external: !!(si && !si.embedded), hx: HXP && HXP.capture() });
  if (HXP) HXP.reset();                                  
  const saved = soInside[k];
  try {
    if (saved && saved.state) applyState(saved.state);
    else {
      const src = saved && saved.bytes ? saved.bytes : srcBytes;   
      let ab = src instanceof ArrayBuffer ? src.slice(0) : src.slice().buffer;
      const u0 = new Uint8Array(ab);
      if (!(u0[0] === 0x38 && u0[1] === 0x42)) ab = LX.imageToPsd(await LX.imageFromBytes(u0, insideName), insideName);
      set_hxFresh(true); await initDocument(ab, insideName, { nested: true });
    }
    docStack[docStack.length - 1].base = origBuffer;       
  } catch (e) {
    { const e0 = docStack.pop(); applyState(parent); if (HXP && e0) HXP.apply(e0.hx); }
    if (documentToken) DOCS.abortOpen(documentToken);
    $('#err').textContent = '内嵌源图（PSD/PSB）解码失败：' + e.message; return;
  }
  document.querySelector('.app').classList.add('inside');
  DOCS.endEmbedded(documentToken);
  refreshAll(true);
}


export function hasAnyEdits(){
  if (toolData && Object.values(toolData.dirty).some(Boolean)) return true;
  if (textSheetsForExport()) return true;             
  if (workPathDirty || savedPathsDirty) return true;  
  if (DOC_EXT.some(x => x.dirty && x.dirty())) return true;   
  if (globalLightDirty) return true;                  
  if (vpDirty) return true;                           
  if (docSizeBase && (docW !== docSizeBase.w || docH !== docSizeBase.h)) return true;
  if (Math.abs(docResolution - docResolutionBase) > 1e-6) return true;
  return !!(Object.keys(soEdits).length || Object.keys(soRepl).length || Object.keys(soBaked).length
    || Object.keys(layerEdits).length || Object.keys(layerTextEdits).length || Object.keys(textStyleEdits).length || Object.keys(textDescEdits).length || Object.keys(layerRenames).length
    || countLayerOps()
    || layerDeletes.size || layerReorder || layerDupes.length || Object.keys(layerTransforms).some(k => transformChanged(+k))
    || Object.keys(soFilterEdits).some(k => !!filterEditsPayload(+k))     
    || Object.keys(soInside).some(k => soInside[k].changed));
}







function uniqueCopyName(base){
  const names = new Set((layerTree && layerTree.flat || []).map((l, i) => layerRenames[i] || (l && l.name)).filter(Boolean));
  if (!names.has(base)) return base;
  for (let k = 2; k < 1000; k++) if (!names.has(`${base} ${k}`)) return `${base} ${k}`;
  return base;
}
export function duplicateLayerUI(idx, opts = {}){
  if (!doc || idx < 0 || idx >= doc.layers.length || layerDeletes.has(idx) || li) return -1;
  const src = doc.layers[idx];
  dupBegin();
  pushDocHistory('复制图层');
  const N = doc.layers.length - layerDupes.length;         
  const baseName = layerRenames[idx] || layerTree.flat[idx]?.name || src.name || '图层';
  const name = LP && !LP.opts.addCopy ? baseName : uniqueCopyName(baseName + ' 拷贝');   
  const clone = { ...src, rgba: src.rgba ? src.rgba.slice() : null, bounds: { ...src.bounds } };
  

  const tc = textRenders[idx] && textCrops[idx];
  if (tc && tc.rgba) {
    const b = tc.bounds;
    Object.assign(clone, { rgba: tc.rgba.slice(), bounds: { ...b }, width: b.right - b.left, height: b.bottom - b.top });
  }
  doc.layers.push(clone);
  const synthetic = doc.layers.length - 1;                 
  
  if (transformChanged(idx)) layerTransforms[synthetic] = JSON.parse(JSON.stringify(layerTransforms[idx]));
  layerDupes.push({ src: idx < N ? idx : layerDupes[idx - N].src, name });
  if (!layerReorder) set_layerReorder(doc.layers.slice(0, N).map((_, i) => i));
  const at = layerReorder.indexOf(idx);                    
  layerReorder.splice(at + 1, 0, synthetic);
  
  layerTree.flat[synthetic] = { ...layerTree.flat[idx], index: synthetic, name, isSmartObject: false, text: null };
  set_selLayer(synthetic);
  renderLayerPanel(); renderProps(); renderPreviewOnly(); updateUndoButtons();
  if (!opts.defer) scheduleDupMaterialize();
  return synthetic;
}







export let dupPending = null;                 
export function set_dupPending(v) { return (dupPending = v); }   
export let dupAuto = true;                    
export function set_dupAuto(v) { return (dupAuto = v); }   
export let dupTask = Promise.resolve();
function dupBegin(){
  if (!dupAuto || dupPending) return;
  try { dupPending = { prev: structuralBegin() }; } catch { dupPending = null; }
}
export let dupTimer = 0;
let dupKeepSel = null;                 
export function scheduleDupMaterialize(){
  if (!dupAuto || !dupPending) return dupTask;
  clearTimeout(dupTimer);
  dupTask = new Promise(res => { dupTimer = setTimeout(() => materializeDupes().then(res, res), 0); });
  return dupTask;
}

export function builtIndexOf(i){
  if (!layerReorder && !(layerTree && layerTree.flat)) return -1;   
  const baseOrder = layerReorder || layerTree.flat.map(l => l.index);
  return baseOrder.filter(k => !layerDeletes.has(k)).indexOf(i);
}
export async function materializeDupes(){
  const d = dupPending;
  if (!d || !doc || !origBuffer) { dupPending = null; return false; }
  if (li || tfState || moveDrag || cropState) { dupTimer = setTimeout(() => materializeDupes(), 120); return false; }   
  if (!layerDupes.length) { dupPending = null; return false; }
  dupPending = null;
  if (textOverlay) closeInlineText(true);
  const selAfter = builtIndexOf(selLayer);
  const keepAfter = dupKeepSel ? dupKeepSel.map(builtIndexOf).filter(k => k >= 0) : null;   
  dupKeepSel = null;
  setWaitCursor(true, '正在处理当前视图…');
  try {
    const built = await buildPsdBuffer({ fast: true });
    const undoTop = docHistory.undo.length;
    await initDocument(built.buf, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.max(0, Math.min(selAfter >= 0 ? selAfter : doc.layers.length - 1, doc.layers.length - 1)));
    if (keepAfter && keepAfter.length > 1) for (const k of keepAfter) if (k < doc.layers.length) selLayers.add(k);
    refreshAll(false);
    structuralDone(d.prev, '复制图层');
    void undoTop;
    return true;
  } catch (e) {
    $('#err').textContent = '复制的图层没能落成完整图层（先按像素副本保留）：' + humanEditError(e && e.message || e);
    return false;
  } finally { setWaitCursor(false); }
}







export function duplicateLayerBlockUI(idx){
  if (!doc || li || idx < 0 || idx >= doc.layers.length || layerDeletes.has(idx)) return -1;
  const node = layerOrderView().nodes[idx];
  if (!node || node.divider) return -1;
  if (!node.group) return duplicateLayerUI(idx);                 
  const ids = (node.block && node.block.ids) || [idx];           
  if (ids.length < 2) return -1;
  
  for (const k of ids) if (!doc.layers[k] || !(layerTree.flat && layerTree.flat[k])) return -1;
  const N = doc.layers.length - layerDupes.length;               
  const nmOf = k => layerRenames[k] || ((layerTree.flat[k] || {}).name) || ('图层 ' + k);
  const headerName = uniqueCopyName(nmOf(idx) + ' 拷贝');
  dupBegin();
  pushDocHistory('复制图层');
  if (!layerReorder) set_layerReorder(doc.layers.slice(0, N).map((_, i) => i));
  const synth = [];
  for (const k of ids) {
    const src = doc.layers[k];
    const nm = k === idx ? headerName : nmOf(k);
    doc.layers.push({ ...src, rgba: src.rgba ? src.rgba.slice() : null, bounds: src.bounds ? { ...src.bounds } : src.bounds });
    const s = doc.layers.length - 1;
    layerDupes.push({ src: k, name: nm });
    layerTree.flat[s] = { ...layerTree.flat[k], index: s, name: nm, isSmartObject: false, text: null };
    synth.push(s);
  }
  const at = layerReorder.indexOf(idx);                          
  layerReorder.splice(at + 1, 0, ...synth);                      
  selLayers.clear();
  set_selLayer(synth[synth.length - 1]);                            
  renderLayerPanel(); renderProps(); renderPreviewOnly(); updateUndoButtons();
  const msg = `已复制「${nmOf(idx)}」（整组 ${ids.length - 2} 个图层）。`;
  $('#notice').textContent = msg; shell.status(msg);
  scheduleDupMaterialize();
  return selLayer;
}


addEventListener('beforeunload', e => { if (docStack.length ? insideDirty() : DOCS.isDirty()) { e.preventDefault(); e.returnValue = ''; } });






export function insideDirty(){
  const top = docStack[docStack.length - 1];
  if (!top) return false;
  return hasAnyEdits() || (top.base !== undefined && origBuffer !== top.base);
}

async function commitInsideToParent(){
  const top = docStack[docStack.length - 1];
  if (!top) return null;
  if (li) await exitSO();
  let built;
  try { built = await buildPsdBuffer(); }
  catch (e) { $('#err').textContent = '内部文档构建失败：' + e.message; return null; }
  const parentDocument = DOCS.embeddedParent();
  docStack.pop();
  if (parentDocument) applyDocFull(parentDocument);
  else applyState(top.state);
  if (HXP && !parentDocument) HXP.apply(top.hx);
  const k = top.soIdx;
  pushDocHistory('编辑智能对象内容「' + (top.insideName || '智能对象') + '」');   
  
  let outBytes = built.buf;
  if (top.imageFormat && LX && built.composite) { try { outBytes = (await LX.encodeAs(top.imageFormat, built.composite)).buffer; } catch (e) { $('#err').textContent = '按原格式编码失败，改存为 PSD：' + e.message; } }
  soInside[k] = { state: null, changed: true, bytes: outBytes, composite: built.composite };
  if (top.external && LX) LX.writeBackExternal(k, outBytes);   
  delete soRasterCache[k];
  await bakeSO(k, built.composite);                       
  

  const lid = sos[k] && sos[k].linkId;
  let twins = 0;
  if (lid) for (let j = 0; j < sos.length; j++) {
    if (j === k || !sos[j] || sos[j].linkId !== lid || layerDeletes.has(matchLayer(sos[j]))) continue;
    soInside[j] = { state: null, changed: true, bytes: outBytes, composite: built.composite };
    delete soRasterCache[j];
    try { await bakeSO(j, built.composite); twins++; } catch {  }
  }
  if (twins) shell.status(`「${top.insideName || '智能对象'}」的 ${twins + 1} 个实例一起更新了（同一个内嵌文件）`);
  DOCS.updateEmbeddedParent();
  return { k, built, name: top.insideName, imageFormat: top.imageFormat, external: top.external };
}

export async function saveInside(){
  if (!docStack.length) return false;
  if (!insideDirty()) { shell.status('没有需要存储的改动'); return true; }
  const r = await commitInsideToParent();
  if (!r) return false;
  docStack.push({ state: captureState(), soIdx: r.k, insideName: r.name, imageFormat: r.imageFormat, external: r.external, hx: HXP && HXP.capture() });
  const ab = r.built.buf instanceof ArrayBuffer ? r.built.buf.slice(0) : r.built.buf.slice().buffer;
  if (HXP) HXP.reset(); set_hxFresh(true);
  await initDocument(ab, r.name, { nested: true });
  docStack[docStack.length - 1].base = origBuffer;
  document.querySelector('.app').classList.add('inside');
  refreshAll(false);
  shell.status(`已存储「${r.name}」：父文档中的智能对象已更新`);
  if (HXP) HXP.onSaved();
  return true;
}

export async function exitInside(opts = {}){
  if (!docStack.length) return false;
  if (li) await exitSO();
  const top = docStack[docStack.length - 1];
  if (insideDirty()) {
    let choice = opts.save === true ? 'ok' : opts.save === false ? 'extra' : null;
    if (!choice) choice = await choiceDialog(`要将更改存储到「${top.insideName || '智能对象'}」吗？`,
      { title: '存储', okText: '存储', extraText: '不存储', cancelText: '取消' });
    if (choice === 'cancel') return false;
    if (choice === 'ok') {
      const r = await commitInsideToParent();
      if (!r) return false;
      DOCS.endEmbeddedClose();
      document.querySelector('.app').classList.toggle('inside', docStack.length > 0);
      refreshAll(true);
      return true;
    }
  }
  const parentDocument = DOCS.embeddedParent();
  docStack.pop();
  if (parentDocument) applyDocFull(parentDocument);
  else applyState(top.state);                              
  if (HXP && !parentDocument) HXP.apply(top.hx);
  document.querySelector('.app').classList.toggle('inside', docStack.length > 0);
  DOCS.endEmbeddedClose();
  refreshAll(true);
  return true;
}


export function refreshAll(fit){
  $('#err').textContent = '';
  $('#docName').textContent = breadcrumb();
  $('#emptyHint').hidden = !!doc;
  $('#stage').hidden = !doc;
  buildTabs();
  renderLayerPanel();
  if (doc) { if (li) { renderStaticLayers(); renderWarpNow(); } else renderPreviewOnly(); }
  try { syncArtboardPad(); } catch {  }
  if (fit) fitStage(true);
  updateUndoButtons();
}
function breadcrumb(){
  const parts = docStack.map(d => d.state.docLabel);
  parts.push(docLabel);
  return parts.join('  ›  ');
}











export function effectiveLayerMaskForBake(idx){
  const dl = doc.layers[idx], m = dl && dl.mask;
  if (!m) return null;
  const struct = maskStructOp(idx);
  if (struct && struct.op === 'deleteLayerMask') {
    
    const which = struct.which || 'user';
    const hasUser = !!(dl.planes && dl.planes[-2] !== undefined), hasReal = !!(dl.planes && dl.planes[-3] !== undefined);
    const removed = which === 'all' ? true : which === 'real' ? !hasUser : !(hasReal && hasUser);
    if (removed) return null;
  }
  const mp = maskPaint[idx];
  const fromMp = !!(mp && mp.mode === 'existing' && isU8(mp.gray));
  const gray = fromMp ? mp.gray : m.gray;
  if (!isU8(gray)) return null;
  const flag = f => { const v = opField(idx, 'setMaskProps', f); return v !== undefined ? v : !!m[f]; };
  if (flag('disabled')) return null;
  const num = (f, dflt) => { const v = opField(idx, 'setMaskProps', f); return v !== undefined ? v : (m[f] != null ? m[f] : dflt); };
  return { gray, width: fromMp ? mp.w : m.width, height: fromMp ? mp.h : m.height,
           top: fromMp ? mp.top : m.top, left: fromMp ? mp.left : m.left,
           relative: !!m.relative, invert: flag('invert'),
           defaultColor: m.defaultColor != null ? m.defaultColor : 255,
           density: num('density', 255) };
}



export function multiplyBakeMask(rgba, bounds, mk, origTop, origLeft){
  multiplyLayerMask(rgba, bounds.right - bounds.left, bounds.bottom - bounds.top, bounds.left, bounds.top, mk, origTop, origLeft);
}
export let bakeSeq = 0;                 
export function set_bakeSeq(v) { return (bakeSeq = v); }   
export async function bakeSO(k, image, fit, previewOutput = null){
  const so = sos[k];
  const layerIdx = matchLayer(so);
  if (layerIdx < 0) return null;
  const li2 = freshLayerInfo(so);
  const ed = soEdits[k];
  applySoEdit(li2, ed);
  let useImg = image, useFit = fit;
  if (!useImg) {
    const rp = soRepl[k];
    if (rp) { useImg = rp.img; useFit = rp.fit; }
    else if (soInside[k] && soInside[k].composite) { useImg = soInside[k].composite; useFit = { mode: 'stretch' }; }
    else { useImg = await loadSourceImageOf(k); useFit = { mode: 'stretch' }; }
  }
  if (!useImg) return null;
  const res = previewOutput || renderWarp({ backend, image: useImg, imageKey: 'bake' + k + '#' + (++bakeSeq), layerInfo: li2,
    filterInput: filterInputForSO(k, useFit),
    docWidth: docW, docHeight: docH, supersample: +$('#ss').value || 2, fit: useFit || { mode: 'stretch' } });
  if (!res.data) return null;
  const W = res.width, H = res.height, d = res.data;
  let mnx = W, mny = H, mxx = -1, mxy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
  const dl = doc.layers[layerIdx];
  let rgba, bounds, raw = null;
  if (mxx < mnx) { rgba = new Uint8ClampedArray(0); bounds = { top: 0, left: 0, bottom: 0, right: 0 }; }
  else {
    const cw = mxx - mnx + 1, ch = mxy - mny + 1; rgba = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const si = ((y + mny) * W + (x + mnx)) * 4, di = (y * cw + x) * 4; rgba[di] = d[si]; rgba[di + 1] = d[si + 1]; rgba[di + 2] = d[si + 2]; rgba[di + 3] = d[si + 3]; }
    bounds = { top: mny, left: mnx, bottom: mny + ch, right: mnx + cw };
    raw = rgba;   
  }
  const prevB = { ...dl.bounds };
  if (!soOrigRaster[layerIdx]) soOrigRaster[layerIdx] = { rgba: dl.rgba, bounds: { ...dl.bounds }, width: dl.width, height: dl.height };
  
  const mk = raw ? effectiveLayerMaskForBake(layerIdx) : null;
  if (mk) { const origB = soOrigRaster[layerIdx].bounds; rgba = new Uint8ClampedArray(raw); multiplyBakeMask(rgba, bounds, mk, origB.top, origB.left); }
  dl.rgba = rgba; dl.width = bounds.right - bounds.left; dl.height = bounds.bottom - bounds.top; dl.bounds = bounds;
  
  const lt = layerTransforms[layerIdx];
  if (lt && !lt.rot && !lt.flipX && !lt.flipY && lt.x === prevB.left && lt.y === prevB.top
      && lt.w === prevB.right - prevB.left && lt.h === prevB.bottom - prevB.top) delete layerTransforms[layerIdx];
  delete thumbCache[layerIdx];
  delete layerCanvasCache[layerIdx];          
  soBaked[k] = { layerIdx, rgba, bounds, raw };
  
  if (image && image.data && !soRepl[k]) {
    const oc = document.createElement('canvas'); oc.width = image.width; oc.height = image.height;
    oc.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    soRasterCache[k] = await loadImage(URL.createObjectURL(await new Promise(r2 => oc.toBlob(r2, 'image/png'))));
  }
  return soBaked[k];
}

export async function bakeCurrentSO(){
  if (!li || cur < 0) return;
  const rp = soRepl[cur];
  const edited = !!(soEdits[cur] || rp || (soInside[cur] && soInside[cur].changed));
  if (!edited) {                                   
    const b = soBaked[cur];
    if (b) {
      const o = soOrigRaster[b.layerIdx], dl = doc.layers[b.layerIdx];
      if (o && dl) { dl.rgba = o.rgba; dl.bounds = { ...o.bounds }; dl.width = o.width; dl.height = o.height; delete thumbCache[b.layerIdx]; delete layerCanvasCache[b.layerIdx]; }
      delete soBaked[cur];
    }
    return;
  }
  await bakeSO(cur, rp ? rp.img : (soInside[cur] && soInside[cur].composite) || img, rp ? rp.fit : { mode: 'stretch' }, savedWarpBakeOutput(warpSession,li,docW,docH));
}
