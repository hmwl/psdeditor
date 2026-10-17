




import './03-history.js';   
import { setPuppetPinRotation, puppetRigidityFromMode } from '../puppet-interaction.js';
import { bindDocumentFile } from '../document-file.js';
import { confirmDialog } from '../dialog.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, cloneDeform, freshLayerInfo, resizePerspectiveGrid } from './01-boot.js';
import {
  cur, deformIdx, deformMeshMeta, doc, docH, docW, li, meshFlipState, meshRotState, origBuffer, pushHistory,
  rulersVisible, set_hover, set_hoverPt, set_li, set_rulersVisible, set_selPt, soEdits, soLayerIndex, sos,
  textOverlay, viewFlip, viewPar, viewParCorrect,
} from './02-doc-state.js';
import { updateUndoButtons } from './03-history.js';
import { zoomAtClient } from './05-layer-lock-guides.js';
import { commit } from './06-view-zoom-move.js';
import { docResolution } from './08-doc-size.js';
import { loadPsd, openImageAsDocument, selectSO } from './21-load-document.js';
import {
  applyDeformClass, deformEnter, deformFinish, deformOpts, deformTool, matchLayer, rebuildPuppetMesh,
  selectedPin, selectedPins, setCurrentDeform, setPerspectiveMode, set_deformSel, syncDeformBar,
} from './22-deform-tools.js';
import { selLayer } from './23-layers-panel.js';
import { renderProps } from './24-layer-ops-queue.js';
import { dragRowIndex } from './28-layer-props-transform.js';
import { refreshView, renderWarpNow, replaceImg, scheduleRefreshView } from './30-render.js';
import { docTool, viewAngle } from './31-selection-brush.js';
import { frameAt, placeImageInFrame, syncArtboardCheckers } from './36-clipboard-frame.js';
import { drawGizmo, gizmo, reapplyAllPins, syncDocTab, toDoc } from './46-smart-filter-panel.js';
import { layoutInlineText } from './47-canvas-context-menu.js';
import { showExportDlg } from './48-info-export.js';




{
  const isPsd = f => /\.ps[db]$/i.test(f.name || '');
  const isImg = f => (f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|tiff?|bmp|gif|avif)$/i.test(f.name || '');
  let depth = 0;
  const overlay = document.createElement('div'); overlay.id = 'dropOverlay';
  overlay.innerHTML = '<div class="dropcard"><b>松开即可打开</b><span>支持 .psd / .psb / 图片' +
    '<br>编辑智能对象时，拖入图片 = 换设计图</span></div>';
  document.body.appendChild(overlay);
  const show = on => { depth = on ? depth : 0; overlay.classList.toggle('on', on); };
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', e => {
    if (!hasFiles(e) || dragRowIndex >= 0) return;      
    e.preventDefault(); depth++; overlay.classList.add('on');
  });
  window.addEventListener('dragover', e => { if (hasFiles(e) && dragRowIndex < 0) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--depth <= 0) show(false); });
  window.addEventListener('drop', async e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); show(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    const psd = files.find(isPsd);
    if (psd) {
      
      const item = Array.from(e.dataTransfer.items || []).find(item => item.kind === 'file' && item.getAsFile()?.name === psd.name);
      const handle = item?.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null);
      if (await loadPsd(psd)) bindDocumentFile(await handle);                           
      return;
    }
    const im = files.find(isImg);
    
    if (im && !li && doc && docTool === 'frame') {
      const fi = frameAt(toDoc(e));
      if (fi >= 0) { await placeImageInFrame(fi, im); return; }
    }
    if (im && cur >= 0) { await replaceImg(im); return; }
    if (im && selLayer >= 0) {                      
      const soIdx = sos.findIndex(so => matchLayer(so) === selLayer);
      if (soIdx >= 0) { await selectSO(soIdx); if (li) { await replaceImg(im); return; } }
    }
    if (im) {                                       
      await openImageAsDocument(im);
      return;
    }
    $('#info').textContent = '只支持拖入 .psd / .psb 文件' + (cur >= 0 ? '，或图片（换设计图 / 直接打开）' : '');
  });
}
$('#showCage').onchange = drawGizmo;
$('#ss').oninput = renderWarpNow;
$('#exportPsd').onclick = showExportDlg;
$('#resetMesh').onclick = () => {
  if(!li) return;
  pushHistory();
  delete meshRotState[soLayerIndex]; delete meshFlipState[soLayerIndex];
  if (deformTool && deformEnter && li.deforms && li.deforms[deformIdx]) {   
    li.deforms[deformIdx] = cloneDeform(deformEnter.deform);
    li.deform = li.deforms[deformIdx];
    set_deformSel(null); set_selPt(-1);
    applyDeformClass(); commit(); renderProps(); drawGizmo(); updateUndoButtons(); return;
  }
  delete soEdits[cur];
  set_li(freshLayerInfo(sos[cur])); li.sliceX=li.sliceX||[]; li.sliceY=li.sliceY||[]; set_selPt(-1);
  applyDeformClass(); renderWarpNow(); renderProps(); updateUndoButtons();
};







const dfResize = () => {
  if (!li || !li.deform || li.deform.kind !== 'perspectiveWarp' || !li.deform.grid) return;
  const c = Math.max(1, Math.min(8, +$('#dfCols').value | 0)), r = Math.max(1, Math.min(8, +$('#dfRows').value | 0));
  if (c === li.deform.grid.cols && r === li.deform.grid.rows) return;
  pushHistory();
  try { setCurrentDeform(resizePerspectiveGrid(li.deform, c, r)); }
  catch (e) { shell.status(e.message); syncDeformBar(); return; }
  set_selPt(-1); set_hoverPt(-1); commit(); syncDeformBar(); drawGizmo();
};
$('#dfCols').onchange = dfResize;
$('#dfRows').onchange = dfResize;

$('#dfLayout').onclick = () => setPerspectiveMode('layout');
$('#dfWarpMode').onclick = () => setPerspectiveMode('warp');

const dfRemesh = async (what) => {
  const meta = deformMeshMeta;
  if (!li || !li.deform || li.deform.kind !== 'puppetWarp' || !meta || !meta.alpha) { syncDeformBar(); return; }
  const pins = li.deform.shapes.reduce((a, sh) => a + sh.pins.length, 0);
  if (pins && !await confirmDialog(`重铺网格会清掉已经落下的 ${pins} 枚图钉，继续吗？`, { title: '改' + what, okText: '重铺' })) { syncDeformBar(); return; }
  pushHistory();
  try { if (!rebuildPuppetMesh()) return; }
  catch (e) { shell.status('重铺网格失败：' + e.message); syncDeformBar(); return; }
  set_selPt(-1); set_hoverPt(-1); commit(); syncDeformBar(); drawGizmo();
  shell.status(`网格已重铺：${li.deform.shapes.length} 片，重新落图钉即可`);
};
$('#dfDensity').onchange = () => { deformOpts.density = $('#dfDensity').value; dfRemesh('浓度'); };
$('#dfExpand').onchange = () => { deformOpts.expandPx = Math.max(0, +$('#dfExpand').value || 0); dfRemesh('扩展'); };

$('#dfMode').onchange = () => {
  deformOpts.mode = $('#dfMode').value;
  if (li && li.deform && li.deform.kind === 'puppetWarp') { pushHistory(); for (const sh of li.deform.shapes) sh.meshRigidity = puppetRigidityFromMode(deformOpts.mode); reapplyAllPins(); commit(); drawGizmo(); }
  shell.status('模式：' + $('#dfMode').selectedOptions[0].textContent);
};
$('#dfShowMesh').onchange = () => { deformOpts.showMesh = $('#dfShowMesh').checked; drawGizmo(); };
$('#dfRemovePins').onclick = () => {
  if (!li || !li.deform || li.deform.kind !== 'puppetWarp') return;
  pushHistory();
  for (const sh of li.deform.shapes) { sh.pins.length = 0; sh.def = sh.orig.map(p => ({ x: p.x, y: p.y })); }
  set_deformSel(null); set_selPt(-1); set_hoverPt(-1); commit(); syncDeformBar(); drawGizmo();
  shell.status('已移去所有图钉，网格回到原位');
};

const dfDepth = step => {
  const sel = selectedPin(); if (!sel) return;
  pushHistory();
  for (const picked of selectedPins()) picked.pin.depth = +((+picked.pin.depth || 0) + step).toFixed(4);
  commit(); syncDeformBar();
};
$('#dfDepthUp').onclick = () => dfDepth(0.01);
$('#dfDepthDown').onclick = () => dfDepth(-0.01);
const dfRot = () => {
  const sel = selectedPin(); if (!sel) { syncDeformBar(); return; }
  pushHistory();
  for (const picked of selectedPins()) setPuppetPinRotation(picked.pin, $('#dfRotMode').value, $('#dfRotAngle').value);
  reapplyAllPins(); commit(); syncDeformBar(); drawGizmo();
};
$('#dfRotMode').onchange = dfRot;
$('#dfRotAngle').onchange = dfRot;
$('#dfCancel').onclick = () => deformFinish(false);
$('#dfOk').onclick = () => deformFinish(true);
$('#density').oninput = () => { $('#densityVal').textContent = $('#density').value; drawGizmo(); };
$('#splitMode').onchange = () => {
  $('.split-bar').classList.toggle('on', $('#splitMode').checked);
  if(!$('#splitMode').checked){ set_hover(null); gizmo.classList.remove('split','kill'); }
  else gizmo.classList.add('split');
  drawGizmo();
};
$('#splitDir').onchange = drawGizmo;

export let splitOneShot = false, splitPicked = null;   
export function set_splitOneShot(v) { return (splitOneShot = v); }   
export function set_splitPicked(v) { return (splitPicked = v); }   
export const setTool = split => { splitOneShot = false; $('#splitMode').checked = split; $('#splitMode').onchange(); $('#toolSplit').classList.toggle('active', split); $('#toolSplit').classList.toggle('warn', split); $('#toolWarp').classList.toggle('active', !split); };
$('#toolWarp').onclick = () => setTool(false);
$('#toolSplit').onclick = () => setTool(!$('#splitMode').checked);











export let cropPad = null;                 
export function set_cropPad(v) { return (cropPad = v); }   


export let abPad = null;                   
export function set_abPad(v) { return (abPad = v); }   
const curPad = () => cropPad || abPad;
export const padL = () => curPad() ? curPad().l : 0;
export const padT = () => curPad() ? curPad().t : 0;
export const padR = () => curPad() ? curPad().r : 0;
export const padB = () => curPad() ? curPad().b : 0;
export const viewW = () => docW + padL() + padR();
export const viewH = () => docH + padT() + padB();

export function syncStagePad(){
  if (viewHold && viewHold.freeze) return;                 
  const st = $('#stage'); if (!st) return;
  const on = !!cropPad;
  st.classList.toggle('padded', on);
  st.classList.toggle('abdoc', !on && !!abPad);
  syncArtboardCheckers();
  
}

export let zoom = 1, zoomFitMode = true;
export function set_zoom(v) { return (zoom = v); }   
export function set_zoomFitMode(v) { return (zoomFitMode = v); }   
export let panX = 0, panY = 0;          
export function set_panX(v) { return (panX = v); }   
export function set_panY(v) { return (panY = v); }   
export function applyPan(){
  if (viewHold && viewHold.freeze) return;
  if (!docW) return;
  const vp = $('#viewport'), st = $('#stage');
  const vr = vp.getBoundingClientRect(), sr = st.getBoundingClientRect();
  
  
  
  
  const old = /^translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(st.style.transform);
  const ox = old ? +old[1] : 0, oy = old ? +old[2] : 0;
  if (vr.width > 0 && vr.height > 0 && sr.width > 0 && sr.height > 0) {
    panX = Math.max(vr.left + 24 - (sr.right - ox), Math.min(vr.right - 24 - (sr.left - ox), panX));
    panY = Math.max(vr.top + 24 - (sr.bottom - oy), Math.min(vr.bottom - 24 - (sr.top - oy), panY));
  }
  
  const parK = viewParCorrect && viewPar !== 1 ? viewPar : 1;
  st.style.transform = `translate(${Math.round(panX)}px, ${Math.round(panY)}px) rotate(${viewAngle}deg)${viewFlip ? ' scaleX(-1)' : ''}${parK !== 1 ? ` scaleX(${parK})` : ''}`;
  st.style.transformOrigin = '50% 50%';
  syncRulers();
  syncViewScrollbars();
  refreshView();                  
}




const SB_MARGIN = 24;
let viewSB = null;
function ensureViewScrollbars(){
  if (viewSB) return viewSB;
  const vp = $('#viewport'); if (!vp) return null;
  const mkBar = axis => {
    const track = document.createElement('div'); track.className = 'view-sb view-sb-' + axis; track.hidden = true;
    const thumb = document.createElement('div'); thumb.className = 'view-sb-thumb'; track.append(thumb);
    track.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const m = viewSB && viewSB.metrics && viewSB.metrics[axis]; if (!m) return;
      const tr = track.getBoundingClientRect(), len = axis === 'x' ? tr.width : tr.height;
      const pos = axis === 'x' ? e.clientX - tr.left : e.clientY - tr.top;
      if (e.target !== thumb) {                           
        const dir = pos < m.thumbPos ? -1 : 1;
        scrollViewBy(axis, dir * m.view * 0.9);
        return;
      }
      const start = pos, startScroll = m.scroll, ratio = m.content / len;
      try { track.setPointerCapture(e.pointerId); } catch {}
      thumb.classList.add('drag');
      const move = ev => {
        const p2 = axis === 'x' ? ev.clientX - tr.left : ev.clientY - tr.top;
        const want = Math.max(0, Math.min(m.content - m.view, startScroll + (p2 - start) * ratio));
        const cur = viewSB.metrics[axis].scroll;
        scrollViewBy(axis, want - cur);
      };
      const up = () => { thumb.classList.remove('drag'); track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up); };
      track.addEventListener('pointermove', move); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
    });
    track.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    vp.append(track);
    return { track, thumb };
  };
  viewSB = { x: mkBar('x'), y: mkBar('y'), metrics: {} };
  return viewSB;
}
function scrollViewBy(axis, delta){
  if (!delta) return;
  if (axis === 'x') panX -= delta; else panY -= delta;
  applyPan();
}
function syncViewScrollbars(){
  const sb = ensureViewScrollbars(); if (!sb) return;
  const vp = $('#viewport'), st = $('#stage');
  const hideAll = () => { sb.x.track.hidden = true; sb.y.track.hidden = true; sb.metrics = {}; };
  if (!docW || !st || st.hidden) return hideAll();
  const v = vp.getBoundingClientRect(), r = st.getBoundingClientRect();
  if (!(v.width > 0 && r.width > 0)) return hideAll();
  const cs = getComputedStyle(vp);
  const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
  const areaL = v.left + pl, areaT = v.top + pt, areaW = vp.clientWidth - pl, areaH = vp.clientHeight - pt;
  const one = (axis, bar, stageStart, stageLen, areaStart, areaLen) => {
    const stageEnd = stageStart + stageLen, areaEnd = areaStart + areaLen;
    
    if (stageStart >= areaStart - 1 && stageEnd <= areaEnd + 1) { bar.track.hidden = true; delete sb.metrics[axis]; return false; }
    
    const cStart = Math.min(areaStart, stageStart - SB_MARGIN), cEnd = Math.max(areaEnd, stageEnd + SB_MARGIN);
    const content = cEnd - cStart;
    const scroll = areaStart - cStart;
    bar.track.hidden = false;
    const trackLen = Math.max(1, (axis === 'x' ? bar.track.clientWidth : bar.track.clientHeight) || areaLen);
    const thumbLen = Math.max(24, trackLen * areaLen / content);
    const maxScroll = content - areaLen;
    const thumbPos = (trackLen - thumbLen) * Math.max(0, Math.min(1, scroll / maxScroll));
    if (axis === 'x') { bar.thumb.style.width = thumbLen + 'px'; bar.thumb.style.transform = `translateX(${thumbPos}px)`; }
    else { bar.thumb.style.height = thumbLen + 'px'; bar.thumb.style.transform = `translateY(${thumbPos}px)`; }
    sb.metrics[axis] = { content, view: areaLen, scroll: Math.max(0, Math.min(maxScroll, scroll)), thumbPos, thumbLen };
    return true;
  };
  const hx = one('x', sb.x, r.left, r.width, areaL, areaW);
  const hy = one('y', sb.y, r.top, r.height, areaT, areaH);
  sb.x.track.style.left = pl + 'px'; sb.y.track.style.top = pt + 'px';
  sb.x.track.classList.toggle('both', hx && hy); sb.y.track.classList.toggle('both', hx && hy);
}




export function centerStage(){
  const vp = $('#viewport'), st = $('#stage');
  panX = 0; panY = 0;
  if (!vp || !st || !docW) return;
  st.style.transform = 'translate(0px, 0px)';
  const v = vp.getBoundingClientRect(), r = st.getBoundingClientRect();
  if (!(v.width > 0 && r.width > 0)) { applyPan(); return; }   
  panX = (v.left + v.width / 2) - (r.left + r.width / 2);
  panY = (v.top + v.height / 2) - (r.top + r.height / 2);
  applyPan();
}



export let viewHold = null;
export let zoomFitCap = 2;                 
export function set_zoomFitCap(v) { return (zoomFitCap = v); }   
function viewHoldBegin(){
  if (viewHold || !doc || !docW) return null;
  const g = $('#gizmo'), r = g && g.getBoundingClientRect();
  if (!r || !(r.width > 0)) return null;
  

  viewHold = { zoom, ox: r.left + padL() * zoom, oy: r.top + padT() * zoom, grow: null, buf: origBuffer, freeze: true };
  return viewHold;
}
function viewHoldEnd(h){
  if (!h || viewHold !== h) return;
  h.freeze = false;
  viewHold = null;
  if (!doc || !docW) return;
  zoom = h.zoom; zoomFitMode = false;
  fitStage(false);                                   
  viewHoldAlign(h);
}

function viewHoldAlign(h){
  const g = $('#gizmo'), r = g && g.getBoundingClientRect();
  if (!r || !(r.width > 0)) return;
  const q = h.grow || { dx: 0, dy: 0 };
  const nx = r.left + (padL() + q.dx) * zoom, ny = r.top + (padT() + q.dy) * zoom;
  if (Math.abs(h.ox - nx) < 0.5 && Math.abs(h.oy - ny) < 0.5) return;
  panX += h.ox - nx; panY += h.oy - ny;
  applyPan();
}
export async function withViewHold(fn){
  const h = viewHoldBegin();
  try { return await fn(); } finally { viewHoldEnd(h); }
}
export function fitStage(reset, opts = {}){
  if (!docW) return;
  if (viewHold) { reset = false; zoomFitMode = false; zoom = viewHold.zoom; opts = { ...opts, center: false }; }
  if (viewHold && viewHold.freeze) return;            
  
  const fm = abPad && !cropPad ? Math.round(Math.max(docW, docH) * 0.08) : 0;
  const vw = docW + fm * 2, vh = docH + fm * 2;
  const vp = $('#viewport'); const availW = vp.clientWidth - 48, availH = vp.clientHeight - 48;
  

  if (reset) zoomFitCap = opts.fitCap || 2;
  if (reset || zoomFitMode) { zoom = Math.min(availW / vw, availH / vh, zoomFitCap); zoomFitMode = true; panX = 0; panY = 0; }
  

  

  const st = $('#stage'); st.style.width = (viewW() * zoom) + 'px'; st.style.height = (viewH() * zoom) + 'px';
  syncStagePad();
  





  



  const dprNow = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  


  void dprNow;
  st.classList.remove('crisp');   
  
  $('#zoomVal').value = fmtZoomPct(zoom);
  if (reset || zoomFitMode || opts.center) centerStage(); else applyPan();
  if (viewHold) viewHoldAlign(viewHold);              
  syncRulers();
  

  try { drawGizmo(); } catch {}
  if (textOverlay) layoutInlineText();             
  syncDocTab();
}
const fmtZoomPct = z => { const p = z * 100; return (p >= 100 ? Math.round(p) : Math.round(p * 100) / 100) + '%'; };


export function setZoom(nz, opts = {}){
  nz = Math.min(32, Math.max(0.01, nz));
  if (opts.anchor) { zoomAtClient(opts.anchor.x, opts.anchor.y, nz); return; }
  zoomFitMode = false; zoom = nz;
  fitStage(false, { center: opts.keepPan !== true });
}





const ZOOM_STEPS = [1/18, 1/12, 1/8, 1/6, 1/4, 1/3, 1/2, 2/3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 28, 32];
export function nextZoomStep(dir){
  if (dir > 0) { for (const z of ZOOM_STEPS) if (z > zoom * (1 + 1e-6)) return z; return 32; }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < zoom * (1 - 1e-6)) return ZOOM_STEPS[i];
  return 1/18;
}
$('#zoomVal').addEventListener('change', () => { const v = parseFloat(String($('#zoomVal').value).replace('%', '')); if (Number.isFinite(v) && v > 0) setZoom(v / 100); else $('#zoomVal').value = fmtZoomPct(zoom); $('#zoomVal').blur(); });
$('#zoomVal').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#zoomVal').dispatchEvent(new Event('change')); } if (e.key === 'Escape') { $('#zoomVal').value = fmtZoomPct(zoom); $('#zoomVal').blur(); } });
$('#zoomFit').onclick = () => fitStage(true, { fitCap: 32 });
$('#zoom100').onclick = () => setZoom(1);
$('#zoomIn').onclick = () => setZoom(nextZoomStep(1));
$('#zoomOut').onclick = () => setZoom(nextZoomStep(-1));
addEventListener('resize', () => { fitStage(); syncRulers(); });

try { const RO = (typeof ResizeObserver !== 'undefined') ? ResizeObserver : null; if (RO && $('#viewport')) new RO(() => scheduleRefreshView()).observe($('#viewport')); } catch {}













export const RULER_UNITS = {
  px: { label: '像素', short: 'px', per: () => 1 },
  cm: { label: '厘米', short: 'cm', per: () => docResolution / 2.54 },
  mm: { label: '毫米', short: 'mm', per: () => docResolution / 25.4 },
  in: { label: '英寸', short: 'in', per: () => docResolution },
  pt: { label: '点',   short: 'pt', per: () => docResolution / 72 },
  pc: { label: '派卡', short: 'pc', per: () => docResolution / 6 },
};
export let rulerUnit = 'px';
export function set_rulerUnit(v) { return (rulerUnit = v); }   
export let rulerPos = null;                 
export function set_rulerPos(v) { return (rulerPos = v); }   
const RULER_W = 18;


export function niceStep(unitsPerScreenPx, minPx){
  const want = unitsPerScreenPx * minPx;                 
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, want))));
  for (const m of [1, 2, 5, 10]) if (p * m >= want) return p * m;
  return p * 10;
}

export function rulerFrame(){
  const vp = $('#viewport'), st = $('#stage');
  if (!vp || !st || !docW) return null;
  const v = vp.getBoundingClientRect(), s = st.getBoundingClientRect();
  if (!(s.width > 0)) return null;
  const kx = s.width / viewW(), ky = s.height / viewH();
  
  return { x0: s.left - v.left + padL() * kx, y0: s.top - v.top + padT() * ky, kx, ky,
           w: v.width, h: v.height };
}
function fitRulerCanvas(cv, w, h){
  
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const dpr = Math.max(1, Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
  const bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const ctx = cv.getContext('2d');
  if (!ctx || !ctx.setTransform) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}
export function syncRulers(){
  const rh = $('#rulerH'), rv = $('#rulerV'), rc = $('#rulerCorner'), vp = $('#viewport');
  if (!rh || !rv || !vp) return;
  const on = rulersVisible && !!doc && !!docW;
  vp.classList.toggle('rulers', on);
  if (rc) rc.textContent = on ? RULER_UNITS[rulerUnit].short : '';
  if (!on) return;
  const f = rulerFrame(); if (!f) return;
  const U = RULER_UNITS[rulerUnit] || RULER_UNITS.px;
  const per = Math.max(1e-6, U.per());                   
  const ink = '#a9a9a9', dim = 'rgba(169,169,169,.35)', line = '#8a8a8a';

  
  {
    const w = Math.max(1, f.w - RULER_W), h = RULER_W;
    const ctx = fitRulerCanvas(rh, w, h); if (!ctx) return;
    const kx = f.kx, ox = f.x0 - RULER_W;                
    const step = niceStep(per / kx, 60);                 
    const sub = step / (step / Math.pow(10, Math.floor(Math.log10(step))) === 2 ? 4 : 5);
    ctx.font = '9px system-ui, sans-serif'; ctx.textBaseline = 'top';
    ctx.lineWidth = 1;
    const u0 = (-ox) / kx / per, u1 = (w - ox) / kx / per;
    ctx.beginPath();
    for (let u = Math.floor(u0 / sub) * sub; u <= u1 + sub; u += sub) {
      const x = Math.round(ox + u * per * kx) + 0.5;
      if (x < 0 || x > w) continue;
      const major = Math.abs(u / step - Math.round(u / step)) < 1e-6;
      ctx.moveTo(x, major ? 3 : h - 4); ctx.lineTo(x, h);
    }
    ctx.strokeStyle = line; ctx.stroke();
    for (let u = Math.ceil(u0 / step) * step; u <= u1 + step; u += step) {
      const x = Math.round(ox + u * per * kx) + 0.5;
      if (x < 0 || x > w - 2) continue;
      const inside = u * per >= -0.5 && u * per <= docW + 0.5;
      ctx.fillStyle = inside ? ink : dim;
      ctx.fillText(String(Math.round(u * 1000) / 1000), x + 2, 2);
    }
    if (rulerPos) {                                      
      const x = Math.round(ox + rulerPos.x * kx) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.strokeStyle = '#e8e8e8'; ctx.stroke();
    }
  }
  
  {
    const w = RULER_W, h = Math.max(1, f.h - RULER_W);
    const ctx = fitRulerCanvas(rv, w, h); if (!ctx) return;
    const ky = f.ky, oy = f.y0 - RULER_W;
    const step = niceStep(per / ky, 60);
    const sub = step / (step / Math.pow(10, Math.floor(Math.log10(step))) === 2 ? 4 : 5);
    ctx.font = '9px system-ui, sans-serif'; ctx.textBaseline = 'top';
    ctx.lineWidth = 1;
    const u0 = (-oy) / ky / per, u1 = (h - oy) / ky / per;
    ctx.beginPath();
    for (let u = Math.floor(u0 / sub) * sub; u <= u1 + sub; u += sub) {
      const y = Math.round(oy + u * per * ky) + 0.5;
      if (y < 0 || y > h) continue;
      const major = Math.abs(u / step - Math.round(u / step)) < 1e-6;
      ctx.moveTo(major ? 3 : w - 4, y); ctx.lineTo(w, y);
    }
    ctx.strokeStyle = line; ctx.stroke();
    for (let u = Math.ceil(u0 / step) * step; u <= u1 + step; u += step) {
      const y = Math.round(oy + u * per * ky) + 0.5;
      if (y < 0 || y > h - 2) continue;
      const inside = u * per >= -0.5 && u * per <= docH + 0.5;
      ctx.save(); ctx.translate(2, y + 2); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = inside ? ink : dim; ctx.textBaseline = 'top';
      ctx.fillText(String(Math.round(u * 1000) / 1000), 2, 0);
      ctx.restore();
    }
    if (rulerPos) {
      const y = Math.round(oy + rulerPos.y * ky) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.strokeStyle = '#e8e8e8'; ctx.stroke();
    }
  }
}
export function setRulerUnit(u){
  if (!RULER_UNITS[u]) return false;
  rulerUnit = u; syncRulers();
  if (PREF.get('units.rulers') !== u) PREF.set({ units: { rulers: u } }, { quiet: true });   
  shell.status(`标尺单位：${RULER_UNITS[u].label}`);
  return true;
}
export function setRulersVisible(on){ set_rulersVisible(!!on); syncRulers(); fitStage(); return rulersVisible; }
