




import './04-view-chrome.js';   
import { compositeAll } from '../../../core/app.js';
import { confirmDialog, formDialog } from '../dialog.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, EDIT, ensureLazy } from './01-boot.js';
import {
  doc, docH, docW, gridOpts, guideDrag, guides, guidesLocked, layerEdgesOn, layerRenames, layerTextEdits,
  layerTree, li, pixelPaint, set_guideDrag, set_guides, set_guidesDirty, set_guidesVisible, set_layerEdgesOn,
  set_smartGuidesOn, smartGuidesOn, textCrops, textRenders, textStyleEdits,
} from './02-doc-state.js';
import { pushDocHistory } from './03-history.js';
import {
  applyPan, fitStage, nextZoomStep, panX, panY, setZoom, set_panX, set_panY, set_zoom, set_zoomFitMode, viewH,
  viewW, zoom,
} from './04-view-chrome.js';
import { layerSelBBox } from './06-view-zoom-move.js';
import { snapGuidePx } from './20-snap-smart-object.js';
import { layerCanvasCache, renderLayerPanel, selLayer, thumbCache } from './23-layers-panel.js';
import { effLock, putLayerOp, renderProps, setOpField } from './24-layer-ops-queue.js';
import { previewCompositeDoc, renderPreviewOnly, textCropCanvas } from './30-render.js';
import { docArtboards } from './35-artboard.js';
import { commitPixelPaint } from './38-brush-engine.js';
import { syncBrushPanel } from './40-options-bar-wiring.js';
import { vpathCache, vstrokeCache } from './44-vector-path.js';
import { dispThr, drawGizmo, toDoc } from './46-smart-filter-panel.js';
import { textDescEdits } from './52-alpha-text-menu.js';










export const LOCK_BTN_FIELD = {                 
  transparent: ['lockTransparency', 'transparency'],
  pixels:      ['lockComposite', 'composite'],
  position:    ['lockPosition', 'position'],
  all:         ['lockAll', 'all'],
  artboard:    ['lockNesting', 'nesting'],   
};



export function isBackgroundLayer(idx){
  const flat = (layerTree && layerTree.flat) || [];
  const l = flat[idx];
  if (!l || idx !== 0) return false;                    
  const nm = layerRenames[idx] || l.unicodeName || l.name || '';
  
  let locked = false;
  try { locked = !!effLock(idx, l, 'lockTransparency', 'transparency'); }
  catch { locked = !!(l.locks && l.locks.transparency); }
  if (locked) return true;
  
  return /^(背景|Background)$/i.test(nm) && !!(l.locks && l.locks.transparency);
}

export function unlockBackground(idx){
  const flat = (layerTree && layerTree.flat) || [];
  const l = flat[idx]; if (!l) return false;
  const used = new Set(flat.map((x, i) => layerRenames[i] || x.unicodeName || x.name || ''));
  let n = 0; while (used.has('图层 ' + n)) n++;
  pushDocHistory('背景转为图层');
  layerRenames[idx] = '图层 ' + n;
  putLayerOp(idx, { op: 'setLayerFlags', index: idx, lockTransparency: false });
  renderLayerPanel(); renderProps(); syncLockRow();
  shell.status(`背景已转为普通图层「${layerRenames[idx]}」（PS 里点背景的锁就是这个）`);
  return true;
}

export function toggleLayerLock(idx, field, lockKey){
  const flat = (layerTree && layerTree.flat) || [];
  const l = flat[idx]; if (!l) return false;
  const on = effLock(idx, l, field, lockKey);
  setOpField(idx, { op: 'setLayerFlags' }, field, !on, !!(l.locks && l.locks[lockKey]));
  renderLayerPanel(); renderProps(); syncLockRow();
  return true;
}

export function syncLockRow(){
  const flat = (layerTree && layerTree.flat) || [];
  const idx = selLayer, l = flat[idx];
  const usable = !li && !!doc && idx >= 0 && !!l && !l.isGroup && l.groupType !== 3;
  for (const b of document.querySelectorAll('.lock-row .lock-btn')) {
    const key = b.dataset.lock;
    const map = LOCK_BTN_FIELD[key];
    if (!map) {                                     
      b.disabled = true;
      b.title = '防止在画板和画框内外自动嵌套 —— 这一位（lspf bit3）本编辑器还没做，没给假开关';
      b.classList.remove('on');
      continue;
    }
    b.disabled = !usable;
    if (!usable) { b.classList.remove('on'); continue; }
    const on = effLock(idx, l, map[0], map[1]);
    b.classList.toggle('on', !!on);
    const bg = key === 'transparent' && isBackgroundLayer(idx);
    b.title = bg ? '背景是锁定的：点这里把它转成普通图层（PS 同）'
                 : (on ? '取消' : '') + b.getAttribute('data-title-base');
  }
}











export const RASTER_KIND = { text: '文字', shape: '形状', fill: '填充', smart: '智能对象' };

export function rasterKindOf(idx){
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  const dl = doc && doc.layers && doc.layers[idx];
  if (!L || !dl || L.isGroup || L.groupType === 3) return null;
  if (L.text && L.text.content != null) return 'text';
  if (L.isSmartObject) return 'smart';
  if (L.vectorMask || dl.vectorMask) return 'shape';        
  if (L.adjustment && L.adjustment.kind === 'fill') return 'fill';
  return null;
}

export function renderLayerAlone(idx){
  if (doc?.layers?.[idx]?.lazyChannels || doc?.layers?.[idx]?.lazyCompressedChannels) return null;
  const src = previewCompositeDoc(doc);
  if (!src || !src.layers || !src.layers[idx] || !docW || !docH) return null;
  const one = { ...src, layers: [{ ...src.layers[idx], opacity: 255, fillOpacity: 255,
                                   blendMode: 'normal', clipping: 0, group: null, hidden: false }] };
  let surf = null;
  try { surf = compositeAll(one, docW, docH, new Map()); } catch { return null; }
  if (!surf || !surf.data) return null;
  return new Uint8ClampedArray(surf.data);
}

export function opaqueBBox(rgba, w, h){
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { left: x0, top: y0, right: x1 + 1, bottom: y1 + 1 };
}

export function cropRGBA(rgba, w, b){
  const cw = b.right - b.left, ch = b.bottom - b.top;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    out.set(rgba.subarray(((b.top + y) * w + b.left) * 4, ((b.top + y) * w + b.left + cw) * 4), y * cw * 4);
  return out;
}





export async function rasterizeLayerUI(idx, opts = {}){
  if (!doc || li) return false;
  const kind = rasterKindOf(idx);
  const dl = doc.layers[idx];
  if (!kind || !dl) { $('#notice').textContent = '这一层已经是普通像素图层了。'; return false; }
  if (!dl.rgba && (dl.lazyChannels || dl.lazyCompressedChannels)) { $('#notice').textContent = '超大懒加载图层暂不能整层栅格化；请先在目标区域用画笔或分块滤镜处理。'; return false; }
  const what = RASTER_KIND[kind];
  if (!opts.silent) {
    const go = await confirmDialog(
      `此${what}图层必须栅格化后才能继续。是否栅格化${what}图层？\n`
      + `栅格化之后它就是普通像素层：${kind === 'text' ? '文字不再可编辑' : kind === 'smart' ? '不能再进入内部编辑' : '路径与填充参数不再可编辑'}。`,
      { title: `栅格化${what}图层`, okText: '栅格化', danger: true });
    if (!go) return false;
  }
  if (!await ensureLazy(EDIT, '栅格化图层')) return false;

  

  let rgba = null, bounds = null;
  const tc = textCrops[idx];
  if (textRenders[idx] && tc) {                       
    const cv = textCropCanvas(idx);
    const b = tc.bounds, cw = b.right - b.left, ch = b.bottom - b.top;
    if (cv && cw > 0 && ch > 0) {
      rgba = new Uint8ClampedArray(cv.getContext('2d').getImageData(0, 0, cw, ch).data);
      bounds = { ...b };
    }
  }
  if (!rgba && dl.rgba && dl.width > 0 && dl.height > 0) {
    rgba = new Uint8ClampedArray(dl.rgba); bounds = { ...dl.bounds };
  }
  if (!rgba) {
    const full = renderLayerAlone(idx);
    if (!full) { $('#err').textContent = `「${what}」这一层渲染不出来，没有栅格化（不敢往文件里写一层空像素）。`; return false; }
    const bb = opaqueBBox(full, docW, docH);
    if (bb) { rgba = cropRGBA(full, docW, bb); bounds = bb; }
    else { rgba = new Uint8ClampedArray(docW * docH * 4); bounds = { top: 0, left: 0, bottom: docH, right: docW }; }
  }

  const L = layerTree.flat[idx];
  const nameNow = layerRenames[idx] || L.unicodeName || L.name || ('图层 ' + idx);
  pushDocHistory('栅格化' + what);
  
  delete pixelPaint[idx];
  dl.rgba = rgba;
  dl.bounds = bounds;
  dl.width = bounds.right - bounds.left;
  dl.height = bounds.bottom - bounds.top;
  pixelPaint[idx] = { rgba, orig: new Uint8ClampedArray(rgba.length), w: dl.width, h: dl.height,
                      left: bounds.left, top: bounds.top };
  
  for (const k of ['text', 'vectorMask', 'vectorStroke', 'isSmartObject', 'smartObject', 'fill']) { delete L[k]; delete dl[k]; }
  if (L.adjustment && L.adjustment.kind === 'fill') { delete L.adjustment; delete dl.adjustment; }
  delete textRenders[idx]; delete textCrops[idx]; delete layerTextEdits[idx]; delete textStyleEdits[idx]; delete textDescEdits[idx];
  delete vpathCache[idx]; delete vstrokeCache[idx];
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  
  putLayerOp(idx, { op: 'rasterizeLayer', index: idx });
  commitPixelPaint(idx);
  
  { const t = $('#brTarget'); if (t && t.value === 'mask' && !dl.mask) t.value = 'pixels'; }
  renderPreviewOnly(); renderLayerPanel(); renderProps(); syncBrushPanel(); drawGizmo();
  const msg = `已栅格化「${nameNow}」（${what} → 普通像素图层，${dl.width}×${dl.height}）`;
  $('#notice').textContent = msg; shell.status(msg);
  return true;
}


export async function newGuideDialog(){
  const v = await formDialog('新建参考线', [
    { key: 'dir', label: '取向', type: 'select', value: 'v', options: [['v', '垂直'], ['h', '水平']] },
    { key: 'pos', label: '位置', type: 'number', value: 0, step: 1, unit: '像素' },
  ]);
  if (!v) return false;
  const isV = v.dir === 'v', size = isV ? docW : docH, px = Math.round(v.pos);
  if (px < 0 || px > size) { $('#notice').textContent = `位置超出画布（0 – ${size} 像素）`; return false; }
  guides.push({ vertical: isV, px }); set_guidesDirty(true); set_guidesVisible(true); drawGizmo();
  return true;
}
export async function newGuideLayoutDialog(){
  const v = await formDialog('新建参考线版面', [
    { key: 'cols', label: '列 数字', type: 'number', value: 8, min: 0, max: 100 },
    { key: 'gutterX', label: '列 装订线', type: 'number', value: 20, min: 0, unit: '像素' },
    { key: 'rows', label: '行 数字', type: 'number', value: 0, min: 0, max: 100 },
    { key: 'gutterY', label: '行 装订线', type: 'number', value: 0, min: 0, unit: '像素' },
    { key: 'margin', label: '边距', type: 'number', value: 0, min: 0, unit: '像素' },
    { key: 'center', label: '列居中', type: 'check', value: false },
    { key: 'clear', label: '清除现有参考线', type: 'check', value: true },
  ]);
  if (!v) return false;
  if (v.clear) set_guides([]);
  const m = v.margin, add = (vert, px) => { px = Math.round(px); if (!guides.some(g => g.vertical === vert && g.px === px)) guides.push({ vertical: vert, px }); };
  if (m > 0) { add(true, m); add(true, docW - m); add(false, m); add(false, docH - m); }
  const lay = (n, gut, len, vert) => {
    if (!(n > 0)) return;
    const inner = len - 2 * m, w = (inner - gut * (n - 1)) / n;
    if (!(w > 0)) return;
    for (let k = 0; k < n; k++) { const a = m + k * (w + gut); add(vert, a); add(vert, a + w); }
  };
  lay(v.cols, v.gutterX, docW, true); lay(v.rows, v.gutterY, docH, false);
  set_guidesDirty(true); set_guidesVisible(true); drawGizmo();
  shell.status(`参考线版面：${guides.length} 条参考线`);
  return true;
}
export function guidesFromLayer(){
  const b = layerSelBBox(selLayer);
  if (!b || !(b.w > 0 && b.h > 0)) { $('#notice').textContent = '这个图层没有可见内容，建不了参考线。'; return false; }
  const add = (vert, px) => { px = Math.round(px); if (!guides.some(g => g.vertical === vert && g.px === px)) guides.push({ vertical: vert, px }); };
  add(true, b.x); add(true, b.x + b.w / 2); add(true, b.x + b.w); add(false, b.y); add(false, b.y + b.h / 2); add(false, b.y + b.h);
  set_guidesDirty(true); set_guidesVisible(true); drawGizmo();
  return true;
}
export async function gridOptionsDialog(){
  const v = await formDialog('参考线、网格和切片', [
    { key: 'every', label: '网格线间隔', type: 'number', value: gridOpts.every, min: 2, max: 4000, unit: '像素' },
    { key: 'sub', label: '子网格', type: 'number', value: gridOpts.sub, min: 1, max: 100 },
    { key: 'on', label: '显示网格', type: 'check', value: gridOpts.on },
    { key: 'edges', label: '显示图层边缘', type: 'check', value: layerEdgesOn },
    { key: 'smart', label: '显示智能参考线', type: 'check', value: smartGuidesOn },
  ]);
  if (!v) return false;
  Object.assign(gridOpts, { every: v.every, sub: v.sub, on: v.on }); set_layerEdgesOn(v.edges); set_smartGuidesOn(v.smart);
  PREF.set({ guides: { gridEvery: v.every, gridUnit: 'px', gridSub: v.sub } }, { quiet: true });
  drawGizmo(); return true;
}


export function guideHit(pt){
  const thr = dispThr(4);
  if (guidesLocked) return -1;                   
  return guides.findIndex(g => g.vertical ? Math.abs(g.px - pt.x) <= thr : Math.abs(g.px - pt.y) <= thr);
}
function beginGuideCreate(e, vertical){
  e.preventDefault(); e.stopPropagation();
  const pt = toDoc(e);
  set_guideDrag({ axis: vertical ? 'v' : 'h', px: vertical ? pt.x : pt.y, index: -1, moved: false });
  const move = ev => { const p = toDoc(ev); guideDrag.px = snapGuidePx(vertical, vertical ? p.x : p.y); guideDrag.moved = true; drawGizmo(); };
  const up = ev => { commitGuideDrag(toDoc(ev)); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  drawGizmo();
}
export function commitGuideDrag(pt){
  if (!guideDrag) return;
  const isV = guideDrag.axis === 'v', px = isV ? pt.x : pt.y;
  const size = isV ? docW : docH, out = -dispThr(8);
  if (guideDrag.index >= 0) {
    if (px < out || px > size - out) guides.splice(guideDrag.index, 1);      
    else guides[guideDrag.index].px = Math.round(px);
    set_guidesDirty(true);
  } else if (guideDrag.moved && px >= 0 && px <= size) {
    
    const o = isV ? pt.y : pt.x;
    const ab = docArtboards().find(a => (isV ? (px >= a.rect.x && px <= a.rect.x + a.rect.w && o >= a.rect.y && o <= a.rect.y + a.rect.h)
                                           : (px >= a.rect.y && px <= a.rect.y + a.rect.h && o >= a.rect.x && o <= a.rect.x + a.rect.w)));
    guides.push(ab ? { vertical: isV, px: Math.round(px), ab: ab.index } : { vertical: isV, px: Math.round(px) });
    set_guidesDirty(true);
  }
  set_guideDrag(null); drawGizmo();
}
$('#rulerH').addEventListener('pointerdown', e => beginGuideCreate(e, true));
$('#rulerV').addEventListener('pointerdown', e => beginGuideCreate(e, false));
export const viewport = $('#viewport');





viewport.addEventListener('wheel', e => {
  e.preventDefault();
  if (!docW) return;
  
  const wz = !!PREF.get('tools.wheelZoom') && !e.shiftKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX);
  if (wz !== !!(e.altKey || e.metaKey || (e.ctrlKey && !wz))) {
    

    const nz = nextZoomStep(e.deltaY < 0 ? 1 : -1);
    if (stageFitsAt(nz)) setZoom(nz);            
    else setZoom(nz, { anchor: { x: e.clientX, y: e.clientY } });
    return;
  }
  
  const dx = e.shiftKey ? (e.deltaY || e.deltaX) : e.deltaX;
  const dy = e.shiftKey ? 0 : e.deltaY;
  if (!dx && !dy) return;
  set_panX(panX - (dx)); set_panY(panY - (dy));
  applyPan();
}, { passive: false });

function stageFitsAt(nz){
  const vp = viewport, cs = getComputedStyle(vp);
  const availW = vp.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const availH = vp.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  return viewW() * nz <= availW + 1 && viewH() * nz <= availH + 1;
}

export function zoomAtClient(clientX, clientY, nz){
  if (!docW || nz === zoom) return;
  

  const st = $('#stage');
  const r0 = st.getBoundingClientRect();
  if (!(r0.width > 0 && r0.height > 0)) {           
    const rect = viewport.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top, k = nz / zoom;
    set_panX(cx - viewport.clientWidth / 2 - (cx - viewport.clientWidth / 2 - panX) * k);
    set_panY(cy - viewport.clientHeight / 2 - (cy - viewport.clientHeight / 2 - panY) * k);
    set_zoom(nz); set_zoomFitMode(false); fitStage(); return;
  }
  const fx = (clientX - r0.left) / r0.width, fy = (clientY - r0.top) / r0.height;
  set_zoom(nz); set_zoomFitMode(false);
  st.style.width = (viewW() * zoom) + 'px'; st.style.height = (viewH() * zoom) + 'px';
  const r1 = st.getBoundingClientRect();
  set_panX(panX + (clientX - (r1.left + fx * r1.width)));
  set_panY(panY + (clientY - (r1.top + fy * r1.height)));
  fitStage();
}
