




import './39-brush-options.js';   
import { openColorPicker } from '../color-picker.js';
import { MIXER_PRESETS, ART_STYLES } from '../../../core/brush-engine.js';
import { actions } from '../actions.js';
import { hasUiIcon, toolIcon } from '../icons.js';
import { panels } from '../panels.js';
import { blendCoverage, stampDisk, decontaminateColors } from '../select-mask-extra.js';
import { REFINE_EDGE_SVG } from '../toolfix-icons.js';
import {
  $, ADJ_KINDS_MENU, SELECT, SELM, cloneSelection, contractSelection, createSelection, emptySelection,
  expandSelection, featherSelection, icon, isEmptySelection, runLazy, selectionArea, selectionValueAt,
  smoothSelection,
} from './01-boot.js';
import {
  brushHistory, doc, docH, docW, layerTree, maskPaint, pixelPaint, selection, set_selPathCache, set_selection,
  textCrops, textRenders,
} from './02-doc-state.js';
import { docHistory, docSnapshot, histCap, histPush, updateUndoButtons } from './03-history.js';
import { spaceDown } from './06-view-zoom-move.js';
import { layerViaSelection } from './13-quickmask-apply-image.js';
import { syncBucketBar, syncGradBar } from './15-gradient-bucket-eyedropper.js';
import { builtIndexOf, dupTask, duplicateLayerUI } from './20-snap-smart-object.js';
import { readLazyImageBand } from './21-load-document.js';
import {
  layerCanvasCache, renderLayerPanel, selLayer, selLayers, set_selLayer, thumbCache,
} from './23-layers-panel.js';
import { humanEditError, renderProps } from './24-layer-ops-queue.js';
import { setLayerVisible } from './27-gradient-editor.js';
import { displayOrder } from './29-scrubby-live.js';
import { renderPreviewOnly } from './30-render.js';
import {
  DOC_TOOLS, MIX_G, TOOL_BTN, artHistoryOpts, bgRGB, brush, cleanMixerBrush, docTool, eraserOpts, fgRGB, hexOf,
  loadMixerBrush, mixerAmount, mixerOpts, mixerReservoir, mixerTile, pencilOpts, setDocTool, set_bgRGB,
  set_fgRGB, toolModes,
} from './31-selection-brush.js';
import {
  brushCursor, combineInto, contractSel, deselect, expandSel, featherSel, invertSelLazy, sampleRGBA, sbOpts,
  selOpts, selReady, setBrushCursor, setSelMode, setSelection, syncAnts, syncGizmoCursor, syncToolButtons,
  syncToolOptions,
} from './32-cursors-select-options.js';
import { qsOpts } from './33-lasso-quick-select.js';
import { AB_BAR_ICONS } from './36-clipboard-frame.js';
import {
  SYM_TOOLS, brushTarget, commitMaskPaint, commitPixelPaint, ensureMaskPaint, ensurePixelPaint, maskAdded,
  maskFromSelection, paintGuard, sparsePixelHistory, syncBrushSwatches,
} from './38-brush-engine.js';
import {
  ADJ_BRUSH_KINDS, AIR_TOOLS, MODE_TOOLS, NO_FLOW_TOOLS, NO_OPACITY_TOOLS, SMOOTH_TOOLS, adjBrushOpts, barImg,
  bsPanelEl, fillModeSelect, openSymmetryMenu, renderBrushSettings, setBrushHardness, setBrushSize,
  set_adjOverlayCache, syncBrushControls, togglePresetPop,
} from './39-brush-options.js';
import { drawGizmo, gizmo, toDoc } from './46-smart-filter-panel.js';
import { loadSelData } from './51-image-select-menu.js';


function bindBrushBar(){
  const pb = $('#brPresetBtn'); if (!pb || pb.dataset.bound) return; pb.dataset.bound = '1';
  pb.onclick = () => togglePresetPop();
  const ib = (id, key, title) => { const el = $(id); if (el) { el.replaceChildren(barImg(key, title)); } return el; };
  ib('#brPanelBtn', 'brushPanel', '画笔设置').onclick = () => { try { panels.toggle('brushSettings'); } catch {} setTimeout(() => renderBrushSettings(), 0); };
  ib('#brPressOp', 'pressureOpacity').onclick = () => { brush.pressureOpacity = !brush.pressureOpacity; syncBrushControls(); };
  ib('#brPressSize', 'pressureSize').onclick = () => { brush.pressureSize = !brush.pressureSize; syncBrushControls(); };
  ib('#brAir', 'airbrush').onclick = () => { brush.airbrush = !brush.airbrush; syncBrushControls(); };
  ib('#brSmoothGear', 'smoothing');
  { const [src, px] = AB_BAR_ICONS.abGear; const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; $('#brSmoothGear').replaceChildren(img); }
  $('#brSmoothGear').onclick = e => {
    const tog = k => () => { brush.smoothOpts[k] = !brush.smoothOpts[k]; };
    panels.popup([
      { label: '拉绳模式', checked: brush.smoothOpts.pulled, run: tog('pulled') },
      { sep: true },
      { label: '描边补齐', checked: brush.smoothOpts.catchUp, run: tog('catchUp') },
      { label: '补齐描边末端', checked: brush.smoothOpts.catchUpEnd, run: tog('catchUpEnd') },
      { label: '调整缩放', checked: brush.smoothOpts.zoomAdjust, run: tog('zoomAdjust') },
    ], e.currentTarget.getBoundingClientRect());
  };
  $('#brAngleIco').replaceChildren(barImg('angle', '角度'));
  ib('#brSym', 'symOptions', '对称').onclick = e => openSymmetryMenu(e.currentTarget);
  ib('#brAdjAdd', 'adjAdd').onclick = () => { adjBrushOpts.subtract = false; syncBrushPanel(); };
  ib('#brAdjSub', 'adjSub').onclick = () => { adjBrushOpts.subtract = true; syncBrushPanel(); };
  $('#brAdjOverlay').onchange = () => { adjBrushOpts.overlay = $('#brAdjOverlay').checked; set_adjOverlayCache(null); drawGizmo(); };
  $('#brAdjKind').onchange = () => { adjBrushOpts.kind = $('#brAdjKind').value; };
  fillModeSelect($('#brMode'));
  $('#brMode').onchange = () => { if (MODE_TOOLS.has(docTool)) toolModes[docTool] = $('#brMode').value; };
  $('#brEraseMode').onchange = () => { eraserOpts.mode = $('#brEraseMode').value; syncBrushPanel(); };
  $('#brAutoErase').onchange = () => { pencilOpts.autoErase = $('#brAutoErase').checked; };
  $('#brToHist').onchange = () => { eraserOpts.toHistory = $('#brToHist').checked; };
  const sm = $('#brSmooth'); sm.oninput = () => { brush.smoothing = +sm.value / 100; $('#brSmoothVal').textContent = sm.value + '%'; };
  const num = (id, fn) => { const el = $(id); el.onchange = () => { const v = +el.value; if (Number.isFinite(v)) fn(v); syncBrushControls(); }; el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); el.onchange(); } }; };
  num('#brAngle', v => { brush.angle = ((Math.round(v) + 180) % 360 + 360) % 360 - 180; });
  num('#brAngleNum', v => { brush.angle = ((Math.round(v) + 180) % 360 + 360) % 360 - 180; });
  num('#brRoundNum', v => { brush.roundness = Math.max(.01, Math.min(1, v / 100)); });
  num('#brSizeNum', v => setBrushSize(v));
  num('#brHardNum', v => setBrushHardness(v / 100));
  
  for (const id of ['#brAngle', '#brAngleNum']) $(id).addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault();
    brush.angle = Math.max(-180, Math.min(180, brush.angle + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))); syncBrushControls();
  });
  const bs = bsPanelEl();
  if (bs) new MutationObserver(() => { if (!bs.hidden) renderBrushSettings(); }).observe(bs, { attributes: true, attributeFilter: ['hidden'] });
}

export function syncBrushBarFor(t){
  const show = (id, v) => { const el = $(id); if (el) el.hidden = !v; };
  const blk = t === 'eraser' && eraserOpts.mode === 'block';
  show('#brPresetBtn', !blk);
  show('#brPanelBtn', !blk);
  show('#brAngleWrap', !blk);
  show('#brPressSize', !blk && t !== 'adjBrush');
  show('#brModeWrap', MODE_TOOLS.has(t));
  show('#brEraseModeWrap', t === 'eraser');
  const hasOp = !NO_OPACITY_TOOLS.has(t) && !blk;
  show('#brOpacityWrap', hasOp);
  show('#brPressOp', hasOp && ['brush', 'pencil', 'eraser', 'historyBrush', 'historyArtBrush', 'cloneStamp', 'patternStamp'].includes(t));
  show('#brFlowWrap', !NO_FLOW_TOOLS.has(t) && !blk);
  show('#brAir', AIR_TOOLS.has(t) && !blk);
  show('#brSmoothWrap', SMOOTH_TOOLS.has(t) && !blk);
  show('#brAutoEraseWrap', t === 'pencil');
  show('#brToHistWrap', t === 'eraser');
  show('#brSym', SYM_TOOLS.has(t) && !blk);
  show('#brMixerSlot', t === 'mixerBrush');
  show('#brArtSlot', t === 'historyArtBrush');
  const adj = t === 'adjBrush';
  show('#brAdjWrap', adj); show('#brAdjOps', adj); show('#brAdjOverlayWrap', adj);
  const tg = $('#brTarget'); if (tg) tg.parentElement.hidden = adj;
  if (adj) {
    const sel = $('#brAdjKind');
    if (sel && sel.dataset.n !== String(Object.keys(ADJ_KINDS_MENU).length)) {
      sel.dataset.n = String(Object.keys(ADJ_KINDS_MENU).length); sel.replaceChildren();
      for (const k of ADJ_BRUSH_KINDS) sel.append(Object.assign(document.createElement('option'), { value: k, textContent: (ADJ_KINDS_MENU[k] || {}).label || ({ brightnessContrast: '亮度/对比度', exposure: '曝光度', hueSaturation: '色相/饱和度', vibrance: '自然饱和度', blackWhite: '黑白', photoFilter: '照片滤镜' })[k] }));
    }
    if (sel) sel.value = adjBrushOpts.kind;
    $('#brAdjAdd').classList.toggle('on', !adjBrushOpts.subtract); $('#brAdjSub').classList.toggle('on', adjBrushOpts.subtract);
    $('#brAdjOverlay').checked = adjBrushOpts.overlay;
  }
  if (t === 'mixerBrush') syncMixerSlot();
  if (t === 'historyArtBrush') syncArtSlot();
}


function mixerPresetOf(){
  const v = [Math.round(mixerOpts.wet * 100), Math.round(mixerOpts.load * 100), Math.round(mixerOpts.mix * 100)];
  const hit = MIXER_PRESETS.find(p => p[2] && p[2][0] === v[0] && p[2][1] === v[1] && p[2][2] === v[2]);
  return hit ? hit[0] : 'custom';
}
function syncMixerSlot(){
  const slot = $('#brMixerSlot'); if (!slot) return;
  slot.replaceChildren();
  const sw = document.createElement('button'); sw.className = 'br-ibtn'; sw.style.width = '34px';
  const c = mixerAmount > 0 && mixerReservoir ? mixerReservoir : null;
  sw.innerHTML = `<span style="display:block;width:18px;height:18px;border:1px solid #777;background:${c ? `rgb(${c[0]},${c[1]},${c[2]})` : 'repeating-conic-gradient(#bbb 0 25%,#fff 0 50%) 0 0/8px 8px'}"></span><span style="font-size:9px;color:var(--muted)">▾</span>`;
  if (c && mixerTile) {
    
    const cv = document.createElement('canvas'); cv.width = cv.height = MIX_G; cv.style.cssText = 'display:block;width:18px;height:18px;border:1px solid #777;image-rendering:auto';
    const id = new ImageData(MIX_G, MIX_G); mixerTile.forEach((q, k) => { id.data.set([q[0], q[1], q[2], q[3]], k * 4); });
    cv.getContext('2d').putImageData(id, 0, 0); cv.dataset.attr = 'mixer-reservoir';
    sw.firstChild.replaceWith(cv);
  }
  sw.title = '当前画笔载入：' + (c ? `RGB ${c.slice(0, 3).join(', ')}（剩余 ${Math.round(mixerAmount * 100)}%）` : '空（已清理）') + '。按住 Alt 在画布上点 = 从画布取样载入';
  sw.onclick = e => panels.popup([
    { label: '载入画笔', run: () => { loadMixerBrush(); syncMixerSlot(); } },
    { label: '清理画笔', run: () => { cleanMixerBrush(); syncMixerSlot(); } },
    { sep: true },
    { label: '只载入纯色', checked: mixerOpts.solidOnly !== false, run: () => { mixerOpts.solidOnly = mixerOpts.solidOnly === false; } },
  ], e.currentTarget.getBoundingClientRect());
  const tb = (key, on, title, fn) => { const b = document.createElement('button'); b.className = 'br-ibtn' + (on ? ' on' : ''); b.title = title; b.append(barImg(key, title)); b.onclick = () => { fn(); syncMixerSlot(); }; return b; };
  const ld = tb('loadPaint', mixerOpts.autoLoad, '每次描边后载入画笔', () => { mixerOpts.autoLoad = !mixerOpts.autoLoad; });
  const cl = tb('cleanPaint', mixerOpts.autoClean, '每次描边后清理画笔', () => { mixerOpts.autoClean = !mixerOpts.autoClean; });
  const ps = document.createElement('select'); ps.title = '有用的混合画笔组合'; ps.style.width = '118px';
  for (const [v, t] of MIXER_PRESETS) ps.append(Object.assign(document.createElement('option'), { value: v, textContent: t }));
  ps.value = mixerPresetOf();
  ps.onchange = () => { const p = MIXER_PRESETS.find(x => x[0] === ps.value); if (p && p[2]) { mixerOpts.wet = p[2][0] / 100; mixerOpts.load = p[2][1] / 100; mixerOpts.mix = p[2][2] / 100; } syncMixerSlot(); };
  const pct = (label, key, title) => {
    const lab = document.createElement('span'); lab.className = 'seg'; lab.title = title; lab.append(label + ': ');
    const el = document.createElement('input'); el.type = 'number'; el.min = 0; el.max = 100; el.value = Math.round(mixerOpts[key] * 100); el.style.width = '46px';
    el.onchange = () => { mixerOpts[key] = Math.max(0, Math.min(100, +el.value || 0)) / 100; syncMixerSlot(); };
    if (key === 'mix' && mixerOpts.wet <= 0) { el.disabled = true; lab.title += '（潮湿为 0 时不混合）'; }
    lab.append(el, '%'); return lab;
  };
  const all = document.createElement('label'); all.className = 'seg'; all.title = '对所有图层取样：从所有可见图层取画布颜色';
  const ac = document.createElement('input'); ac.type = 'checkbox'; ac.checked = mixerOpts.allLayers; ac.onchange = () => { mixerOpts.allLayers = ac.checked; };
  all.append(ac, ' 对所有图层取样');
  slot.append(sw, ld, cl, ps, pct('潮湿', 'wet', '画笔从画布拾取的油彩量'), pct('载入', 'load', '储槽中载入的油彩量（越低描边干得越快）'), pct('混合', 'mix', '画布油彩量与储槽油彩量的比例'), all);
}

function syncArtSlot(){
  const slot = $('#brArtSlot'); if (!slot) return;
  slot.replaceChildren();
  const lab = document.createElement('span'); lab.append('样式: ');
  const st = document.createElement('select'); st.style.width = '96px';
  for (const [v, t] of ART_STYLES) st.append(Object.assign(document.createElement('option'), { value: v, textContent: t }));
  st.value = artHistoryOpts.style; st.onchange = () => { artHistoryOpts.style = st.value; };
  lab.append(st);
  const num = (label, key, max, unit, title) => {
    const l = document.createElement('span'); l.title = title; l.append(' ' + label + ': ');
    const el = document.createElement('input'); el.type = 'number'; el.min = 0; el.max = max; el.value = artHistoryOpts[key]; el.style.width = '50px';
    el.onchange = () => { artHistoryOpts[key] = Math.max(0, Math.min(max, +el.value || 0)); el.value = artHistoryOpts[key]; };
    l.append(el, unit); return l;
  };
  slot.append(lab, num('区域', 'area', 500, ' 像素', '绘画描边所覆盖的区域（越大小笔触越多、铺得越开）'), num('容差', 'tolerance', 100, '%', '低容差 = 哪里都画；高容差 = 只在与源状态颜色差别明显的地方画'));
}

export function syncBrushPanel(){
  const why = paintGuard();
  $('#brWhy').textContent = '';                     
  $('#brWhy').title = why || '';
  { const t = $('#brTarget'), eff = brushTarget(); if (t && t.value !== eff) t.value = eff; }   
  const noMask = brushTarget() === 'mask' && !!doc && selLayer >= 0 && !maskPaint[selLayer] && !(doc.layers[selLayer] && doc.layers[selLayer].mask);
  $('#brAddMask').hidden = !noMask;
  syncBrushSwatches();
  syncBrushBarFor(docTool);
  syncBrushControls();
  syncGizmoCursor();
}
function bindPaintUI(){
  const num = (id, valId, key, fmt) => {
    const el = $(id), v = $(valId);
    const on = () => {
      brush[key] = key === 'size' ? +el.value : +el.value / 100;
      v.textContent = fmt(+el.value);
      


      if (brushCursor) drawGizmo();
    };
    el.oninput = on; on();
  };
  num('#brSize', '#brSizeVal', 'size', n => String(n));
  num('#brHard', '#brHardVal', 'hardness', n => n + '%');
  num('#brOpacity', '#brOpacityVal', 'opacity', n => n + '%');
  num('#brFlow', '#brFlowVal', 'flow', n => n + '%');
  bindBrushBar();
  for (const id of ['#brSize', '#brHard']) $(id).addEventListener('input', () => syncBrushControls());
  $('#brTarget').onchange = () => { syncBrushPanel(); renderProps(); };
  $('#brSwap').onclick = swapColors;
  $('#brFg').onclick = () => pickColor('fg');
  $('#brBg').onclick = () => pickColor('bg');
  $('#brAddMask').onclick = () => {
    if (selLayer < 0) return;
    if (selection) { maskFromSelection(selLayer); }
    else { delete maskPaint[selLayer]; ensureMaskPaint(selLayer, { create: true, fill: 255 }); commitMaskPaint(selLayer); }
    maskAdded(selLayer);
  };
  $('#selInvert').onclick = () => invertSelLazy();
  $('#selFeatherBtn').onclick = () => featherSel(selOpts().feather);
  $('#selExpand').onclick = () => expandSel(1);
  $('#selContract').onclick = () => contractSel(1);
  $('#selMaskBtn').onclick = () => openSelectAndMask();
  
  for (const [id, ic, txt] of [['#selSubjectBtn', 'opt-select-subject', '选择主体'], ['#selMaskBtn', 'opt-select-and-mask', '选择并遮住…']]) {
    const b = $(id); if (!b || !hasUiIcon(ic)) continue;
    const sp = document.createElement('span'); sp.textContent = txt;
    b.replaceChildren(icon(ic, 15), sp); b.style.display = 'inline-flex'; b.style.alignItems = 'center'; b.style.gap = '4px';
  }
  for (const [id, ic] of [['#frRect', 'opt-frame-rect'], ['#frEllipse', 'opt-frame-ellipse'], ['#cropStraight', 'opt-crop-straighten']]) {
    const b = $(id); if (b && hasUiIcon(ic)) b.replaceChildren(icon(ic, 16));
  }
  $('#selNone').onclick = () => deselect();
  for (const [m, id, ic] of [['replace', '#selModeReplace', 'sel-new'], ['add', '#selModeAdd', 'sel-add'],
                             ['subtract', '#selModeSubtract', 'sel-subtract'], ['intersect', '#selModeIntersect', 'sel-intersect']]) {
    const b = $(id);
    b.onclick = () => setSelMode(m);
    b.textContent = '';                       
    b.append(icon(ic, 15)); b.dataset.ic = ic;
  }
  for (const k of DOC_TOOLS) { const b = $('#' + TOOL_BTN[k]); if (b) b.onclick = () => setDocTool(k); }
  syncBrushSwatches();
  
  
  queueMicrotask(syncToolButtons);
}






var smBase = null, smSnapshot = null, smPx = null, smHuge = false;



export var smPrevSbShow = null, smTool = null, smToolOp = 'add', smToolSize = 30, smPrevTool = null, smInternal = false, smToolDrag = false;
let smRefine = null, smRefineR = 0, smRefineDrag = null, smRefCache = null;
const SM_TOOL_DOC = { quick: 'quickSelect', refine: 'quickSelect', brush: 'selectionBrush', lasso: 'lasso', hand: 'hand', zoom: 'zoom' };
const SM_TOOL_KEYS = { w: 'quick', r: 'refine', b: 'brush', l: 'lasso', h: 'hand', z: 'zoom' };
export function smTakeToolSelection(sel){
  smBase = (sel && !isEmptySelection(sel)) ? sel : emptySelection(docW, docH);
  if (smToolDrag) {                          
    set_selection(isEmptySelection(smBase) ? null : smBase); set_selPathCache(null); syncAnts(); drawGizmo();
    return selection;
  }
  smPreview();
  return selection;
}
function smSetTool(t){
  if (!smOpen() || !SM_TOOL_DOC[t]) return;
  smTool = t;
  smInternal = true;
  try { if (docTool !== SM_TOOL_DOC[t]) setDocTool(SM_TOOL_DOC[t]); } finally { smInternal = false; }
  smApplyToolOpts();
}
function smApplyToolOpts(){
  if (!smTool) return;
  const sz = Math.max(1, Math.min(1000, smToolSize | 0));
  qsOpts.size = sz; sbOpts.size = sz;
  if (smTool === 'quick' || smTool === 'brush' || smTool === 'lasso') { try { setSelMode(smToolOp); } catch {} }
  for (const b of $('#smToolBtns').children) b.classList.toggle('on', b.dataset.smt === smTool);
  for (const b of $('#smToolOps').children) { b.classList.toggle('on', b.dataset.op === smToolOp); b.disabled = smTool === 'hand' || smTool === 'zoom'; }
  const si = $('#smToolSize'); if (si) { si.disabled = !(smTool === 'quick' || smTool === 'refine' || smTool === 'brush'); if (document.activeElement !== si) si.value = sz; }
  try { syncToolOptions(); } catch {}
  syncGizmoCursor(); drawGizmo();
}

function smRefineStamp(pt, erase){
  const r = Math.max(1, smToolSize / 2);
  const add = !erase && smToolOp !== 'subtract';
  if (add) smRefineR = Math.max(smRefineR, r);
  if (!smHuge) {
    if (!smRefine) smRefine = new Uint8Array(docW * docH);
    stampDisk(smRefine, docW, docH, pt.x, pt.y, r, add);
    return;
  }
  if (!smRefine || !smRefine.tiles) smRefine = { tiles: new Map() };
  const x0 = Math.max(0, Math.floor(pt.x - r - 1)), x1 = Math.min(docW - 1, Math.ceil(pt.x + r + 1));
  const y0 = Math.max(0, Math.floor(pt.y - r - 1)), y1 = Math.min(docH - 1, Math.ceil(pt.y + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y);
    const v = Math.max(0, Math.min(1, r - d + 0.5));
    if (!v) continue;
    const tx = (x / 256) | 0, ty = (y / 256) | 0, k = ty * Math.ceil(docW / 256) + tx;
    let t = smRefine.tiles.get(k);
    if (!t) { t = new Uint8Array(256 * 256); smRefine.tiles.set(k, t); }
    const o = (y % 256) * 256 + (x % 256), q = Math.round(v * 255);
    t[o] = add ? Math.max(t[o], q) : Math.min(t[o], 255 - q);
  }
}
addEventListener('pointerdown', ev => {
  if (ev.target !== gizmo || !smOpen() || !smTool || ev.button !== 0 || spaceDown) return;
  if (smTool === 'refine') {
    ev.preventDefault(); ev.stopImmediatePropagation();
    const pt = toDoc(ev);
    smRefineDrag = { last: pt, erase: ev.altKey };
    smRefineStamp(pt, ev.altKey);
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    drawGizmo(); return;
  }
  if (smTool === 'quick' || smTool === 'brush' || smTool === 'lasso') {
    
    set_selection(isEmptySelection(smBase) ? null : smBase); set_selPathCache(null);
    smToolDrag = true;
  }
}, true);
addEventListener('pointermove', ev => {
  if (!smRefineDrag || !smOpen()) return;
  ev.stopImmediatePropagation();
  const pt = toDoc(ev), a = smRefineDrag.last, d = Math.hypot(pt.x - a.x, pt.y - a.y), step = Math.max(1, smToolSize / 8);
  for (let t = step; t <= d; t += step) smRefineStamp({ x: a.x + (pt.x - a.x) * t / d, y: a.y + (pt.y - a.y) * t / d }, smRefineDrag.erase);
  smRefineStamp(pt, smRefineDrag.erase);
  smRefineDrag.last = pt;
  if (brushCursor) setBrushCursor(pt);
  drawGizmo();
}, true);
addEventListener('pointerup', ev => {
  if (smRefineDrag) { smRefineDrag = null; ev.stopImmediatePropagation(); if (smOpen()) smPreview(); return; }
  if (smToolDrag) setTimeout(() => { smToolDrag = false; if (smOpen()) smPreview(); }, 0);
}, true);

addEventListener('keydown', e => {
  if (!smOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && !/^(range|checkbox)$/.test(e.target.type)) return;
  const k = e.key.toLowerCase();
  if (SM_TOOL_KEYS[k] && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); smSetTool(SM_TOOL_KEYS[k]); return; }
  if ((e.key === '[' || e.key === ']') && smTool) {
    e.preventDefault(); e.stopImmediatePropagation();
    const s0 = smToolSize, st = s0 < 10 ? 1 : s0 < 50 ? 5 : s0 < 100 ? 10 : 25;
    smToolSize = Math.max(1, Math.min(1000, s0 + (e.key === ']' ? st : -st))); smApplyToolOpts(); return;
  }
  if (SM_VIEW_KEYS[k] && !e.shiftKey && e.target === document.body) { e.preventDefault(); e.stopImmediatePropagation(); smView = SM_VIEW_KEYS[k]; smSyncView(); }
}, true);

function smApplyRefine(sel, rad){
  if (!smRefine || !smPx || !(smRefineR > 0)) return sel;
  let any = false; for (let i = 0; i < smRefine.length; i += 7) if (smRefine[i]) { any = true; break; }
  if (!any) return sel;
  const R = Math.max(rad, Math.round(smRefineR));
  if (!smRefCache || smRefCache.base !== smBase || smRefCache.R !== R) {
    let big = null;
    try { big = SELM.refineEdgeSelection(cloneSelection(smBase), smPx, docW, docH, { radius: R, smart: true }); } catch { big = null; }
    smRefCache = { base: smBase, R, big };
  }
  if (!smRefCache.big) return sel;
  const big = smRefCache.big;
  const cov = blendCoverage((x, y) => selectionValueAt(sel, x, y), (x, y) => selectionValueAt(big, x, y), smRefine, docW, docH);
  return createSelection(docW, docH, 0, 0, docW, docH, cov);
}
let smView = 'onion', smViewOp = 0.5, smShowOrig = false;
export let smViewCache = null;        
export function set_smViewCache(v) { return (smViewCache = v); }   
const SM_VIEW_KEYS = { o: 'onion', m: 'ants', v: 'overlay', a: 'black', t: 'white', k: 'bw', y: 'layers' };
export function smOpen(){ return !!smBase && !!$('#selMaskDlg').open; }
export function smViewHidesAnts(){ return smOpen() && !smShowOrig && smView !== 'ants'; }

const smBandCache = new Map(), smBandOrder = [];
async function smSampleBand(sy) {
  const hit = smBandCache.get(sy);
  if (hit) { smBandOrder.splice(smBandOrder.indexOf(sy), 1); smBandOrder.push(sy); return hit; }
  const bh = Math.min(256, docH - sy), out = new Uint8ClampedArray(docW * bh * 4);
  const over = (r, g, b, a, q, op) => {
    const sa = a / 255 * op; if (!(sa > 0)) return;
    const da = out[q + 3] / 255, oa = sa + da * (1 - sa); if (!(oa > 0)) return;
    out[q] = Math.round((r * sa + out[q] * da * (1 - sa)) / oa);
    out[q + 1] = Math.round((g * sa + out[q + 1] * da * (1 - sa)) / oa);
    out[q + 2] = Math.round((b * sa + out[q + 2] * da * (1 - sa)) / oa);
    out[q + 3] = Math.round(oa * 255);
  };
  for (const i of displayOrder()) {
    const l = doc.layers[i]; if (!l || l.hidden) continue;
    const op = ((l.opacity ?? 255) / 255) * ((l.fillOpacity ?? 255) / 255); if (!(op > 0)) continue;
    const b = l.bounds || { left: 0, top: 0 }, L = b.left | 0, T = b.top | 0, w = l.width | 0, lh = l.height | 0;
    const ya = Math.max(sy, T), yb = Math.min(sy + bh, T + lh);
    const tc = textRenders[i] && textCrops[i];
    if (tc?.rgba) {
      const tb = tc.bounds, tw = tb.right - tb.left;
      for (let y = Math.max(sy, tb.top); y < Math.min(sy + bh, tb.bottom); y++)
        for (let x = Math.max(0, tb.left); x < Math.min(docW, tb.right); x++) {
          const s = ((y - tb.top) * tw + x - tb.left) * 4;
          over(tc.rgba[s], tc.rgba[s + 1], tc.rgba[s + 2], tc.rgba[s + 3], ((y - sy) * docW + x) * 4, op);
        }
    } else if (l.rgba && w > 0 && lh > 0 && yb > ya) {
      const xa = Math.max(0, L), xb = Math.min(docW, L + w);
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const s = ((y - T) * w + x - L) * 4;
        over(l.rgba[s], l.rgba[s + 1], l.rgba[s + 2], l.rgba[s + 3], ((y - sy) * docW + x) * 4, op);
      }
    } else if ((l.lazyTileStore || l.lazyPixelOps?.length || l.lazyImage || l.lazyRasterFile) && w > 0 && lh > 0 && yb > ya) {
      const band = await readLazyImageBand(l, ya - T, yb - ya);
      if (band) for (let yy = 0; yy < band.height; yy++) for (let x = Math.max(0, L); x < Math.min(docW, L + w); x++) {
        const s = (yy * band.width + x - L) * 4;
        over(band.data[s], band.data[s + 1], band.data[s + 2], band.data[s + 3], ((ya + yy - sy) * docW + x) * 4, op);
      }
    }
    const pp = pixelPaint[i], tiles = pp?.sparse?.tiles;
    if (tiles?.size) {
      const left = pp.left | 0, top = pp.top | 0;
      for (const t of tiles.values()) {
        const ya2 = Math.max(sy, top + t.y), yb2 = Math.min(sy + bh, top + t.y + t.height);
        const xa2 = Math.max(0, left + t.x), xb2 = Math.min(docW, left + t.x + t.width);
        for (let y = ya2; y < yb2; y++) for (let x = xa2; x < xb2; x++) {
          const s = ((y - top - t.y) * t.width + x - left - t.x) * 4;
          over(t.data[s], t.data[s + 1], t.data[s + 2], t.data[s + 3], ((y - sy) * docW + x) * 4, op);
        }
      }
    }
  }
  const band = { y: sy, height: bh, data: out };
  smBandCache.set(sy, band); smBandOrder.push(sy);
  while (smBandOrder.length > 6) { const k = smBandOrder.shift(); smBandCache.delete(k); }
  return band;
}
async function smSampleRect(x0, y0, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let sy = Math.floor(y0 / 256) * 256; sy < y0 + h; sy += 256) {
    const band = await smSampleBand(sy);
    const ya = Math.max(y0, sy), yb = Math.min(y0 + h, sy + band.height);
    for (let y = ya; y < yb; y++) out.set(band.data.subarray(((y - sy) * docW + x0) * 4, ((y - sy) * docW + x0 + w) * 4), ((y - y0) * w) * 4);
  }
  return out;
}
async function refineHugeSelection(sel, R, smart, alive = () => true) {
  const tilesToDo = SELM.selectionBorderTiles(sel, R + 2);
  if (!tilesToDo.length) return cloneSelection(sel);
  const input = sel.data?.__tiles || new Map();
  const outTiles = new Map(input), owned = new Set();
  const fill = isFinite(sel.data?.__fill) ? sel.data.__fill : 0;
  const TS = 256, cols = Math.ceil(sel.width / TS);
  const write = (gx, gy, v) => {
    const i = gx - sel.x, j = gy - sel.y;
    if (i < 0 || j < 0 || i >= sel.width || j >= sel.height) return;
    const k = ((j / TS) | 0) * cols + ((i / TS) | 0);
    let t = outTiles.get(k);
    if (!owned.has(k)) { t = t ? Uint8Array.from(t) : new Uint8Array(TS * TS); outTiles.set(k, t); owned.add(k); }
    t[(j % TS) * TS + (i % TS)] = v;
  };
  const pad = R + 4;
  for (const rect of tilesToDo) {
    if (!alive()) throw new DOMException('已取消', 'AbortError');
    const cx0 = Math.max(0, rect.x - pad), cy0 = Math.max(0, rect.y - pad);
    const cx1 = Math.min(docW, rect.x + rect.width + pad), cy1 = Math.min(docH, rect.y + rect.height + pad);
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (!(cw > 0 && ch > 0)) continue;
    const crop = SELM.selectionCropDense(sel, cx0, cy0, cw, ch);
    const rgb = await smSampleRect(cx0, cy0, cw, ch);
    if (!alive()) throw new DOMException('已取消', 'AbortError');
    let ref;
    try { ref = SELM.refineEdgeSelection(crop, rgb, cw, ch, { radius: R, smart }); } catch { continue; }
    for (let gy = Math.max(rect.y, sel.y); gy < Math.min(rect.y + rect.height, sel.y + sel.height); gy++)
      for (let gx = Math.max(rect.x, sel.x); gx < Math.min(rect.x + rect.width, sel.x + sel.width); gx++)
        write(gx, gy, selectionValueAt(ref, gx - cx0, gy - cy0));
  }
  return SELM.selectionFromTiles(sel.x, sel.y, sel.width, sel.height, outTiles, fill, docW, docH);
}
async function smApplyRefineHuge(sel, rad, alive) {
  if (!smRefine?.tiles?.size || !(smRefineR > 0)) return sel;
  const R = Math.max(rad, Math.round(smRefineR)), TS = 256, cols = Math.ceil(docW / TS);
  const targets = new Map();
  for (const [k, t] of smRefine.tiles) {
    let any = false;
    for (let i = 0; i < t.length; i += 7) if (t[i]) { any = true; break; }
    if (!any) continue;
    const tx = k % cols, ty = (k / cols) | 0;
    const pad = R + 4;
    const gx0 = Math.max(0, Math.floor((tx * TS - pad) / TS) * TS), gy0 = Math.max(0, Math.floor((ty * TS - pad) / TS) * TS);
    const gx1 = Math.min(docW, Math.ceil((tx * TS + TS + pad) / TS) * TS), gy1 = Math.min(docH, Math.ceil((ty * TS + TS + pad) / TS) * TS);
    for (let y = gy0; y < gy1; y += TS) for (let x = gx0; x < gx1; x += TS)
      targets.set(`${x}:${y}`, { x, y, width: Math.min(TS, docW - x), height: Math.min(TS, docH - y) });
  }
  if (!targets.size) return sel;
  const input = sel.data?.__tiles || new Map(), outTiles = new Map(input), owned = new Set();
  const fill = isFinite(sel.data?.__fill) ? sel.data.__fill | 0 : 0;
  const selCols = Math.ceil(sel.width / TS);
  const baseAt = (gx, gy) => {
    const i = gx - sel.x, j = gy - sel.y;
    if (i < 0 || j < 0 || i >= sel.width || j >= sel.height) return 0;
    return sel.data[j * sel.width + i];
  };
  const tileFor = (gx, gy) => {
    const i = gx - sel.x, j = gy - sel.y;
    const k = ((j / TS) | 0) * selCols + ((i / TS) | 0);
    let t = outTiles.get(k);
    if (owned.has(k)) return t;
    if (t) t = Uint8Array.from(t);
    else {
      t = new Uint8Array(TS * TS);
      if (!sel.data?.__virtual || sel.data?.__base || sel.data?.__neg || sel.data?.__brushBase) {
        const lx0 = sel.x + (((i / TS) | 0) * TS), ly0 = sel.y + (((j / TS) | 0) * TS);
        for (let yy = 0; yy < TS; yy++) for (let xx = 0; xx < TS; xx++) {
          const gx2 = lx0 + xx, gy2 = ly0 + yy;
          t[yy * TS + xx] = gx2 < docW && gy2 < docH ? baseAt(gx2, gy2) : 0;
        }
      } else t.fill(fill);
    }
    outTiles.set(k, t); owned.add(k);
    return t;
  };
  const maskAt = (gx, gy) => {
    const t = smRefine.tiles.get(((gy / TS) | 0) * cols + ((gx / TS) | 0));
    return t ? t[(gy % TS) * TS + (gx % TS)] : 0;
  };
  const pad = R + 4;
  for (const rect of targets.values()) {
    if (!alive()) throw new DOMException('已取消', 'AbortError');
    const cx0 = Math.max(0, rect.x - pad), cy0 = Math.max(0, rect.y - pad);
    const cx1 = Math.min(docW, rect.x + rect.width + pad), cy1 = Math.min(docH, rect.y + rect.height + pad);
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (!(cw > 0 && ch > 0)) continue;
    const crop = SELM.selectionCropDense(smBase, cx0, cy0, cw, ch);
    const rgb = await smSampleRect(cx0, cy0, cw, ch);
    if (!alive()) throw new DOMException('已取消', 'AbortError');
    let ref;
    try { ref = SELM.refineEdgeSelection(crop, rgb, cw, ch, { radius: R, smart: true }); } catch { continue; }
    for (let gy = Math.max(rect.y, sel.y); gy < Math.min(rect.y + rect.height, sel.y + sel.height); gy++)
      for (let gx = Math.max(rect.x, sel.x); gx < Math.min(rect.x + rect.width, sel.x + sel.width); gx++) {
        const m = maskAt(gx, gy); if (!m) continue;
        const a = baseAt(gx, gy), b = selectionValueAt(ref, gx - cx0, gy - cy0);
        const v = Math.round(a + (b - a) * m / 255);
        tileFor(gx, gy)[((gy - sel.y) % TS) * TS + ((gx - sel.x) % TS)] = v;
      }
  }
  return SELM.selectionFromTiles(sel.x, sel.y, sel.width, sel.height, outTiles, fill, docW, docH);
}
async function smChainHuge(token) {
  let sel = cloneSelection(smBase);
  const rad = +$('#smRadius').value, sm = +$('#smSmooth').value, fe = +$('#smFeather').value;
  const ct = +$('#smContrast').value, mv = +$('#smMove').value;
  const alive = () => token === smPreviewToken && smOpen();
  if (rad > 0) sel = await refineHugeSelection(sel, rad, $('#smSmart').checked, alive);
  if (!alive()) return null;
  sel = await smApplyRefineHuge(sel, rad, alive);
  if (!alive()) return null;
  if (sm > 0) sel = smoothSelection(sel, Math.max(1, Math.round(sm / 2)));
  if (fe > 0) sel = featherSelection(sel, fe);
  if (ct > 0) { try { sel = SELM.contrastSelection(sel, ct); } catch {} }
  if (mv) {
    const px = Math.round(Math.abs(mv) / 100 * Math.max(3, fe + rad));
    if (px > 0) sel = mv > 0 ? expandSelection(sel, px) : contractSelection(sel, px);
  }
  return sel;
}
function smChain(){
  let sel = cloneSelection(smBase);
  const rad = +$('#smRadius').value, sm = +$('#smSmooth').value, fe = +$('#smFeather').value;
  const ct = +$('#smContrast').value, mv = +$('#smMove').value;
  if (rad > 0 && smPx) { try { sel = SELM.refineEdgeSelection(sel, smPx, docW, docH, { radius: rad, smart: $('#smSmart').checked }); } catch {} }
  sel = smApplyRefine(sel, rad);                                             
  if (sm > 0) sel = smoothSelection(sel, Math.max(1, Math.round(sm / 2)));   
  if (fe > 0) sel = featherSelection(sel, fe);
  if (ct > 0) { try { sel = SELM.contrastSelection(sel, ct); } catch {} }
  
  if (mv) {
    const px = Math.round(Math.abs(mv) / 100 * Math.max(3, fe + rad));
    if (px > 0) sel = mv > 0 ? expandSelection(sel, px) : contractSelection(sel, px);
  }
  return sel;
}
let smPreviewTimer = 0, smPreviewToken = 0;
function smPreview(){
  if (!smBase) return;
  $('#smRadiusVal').textContent = $('#smRadius').value + ' 像素';
  $('#smSmoothVal').textContent = $('#smSmooth').value;
  $('#smFeatherVal').textContent = $('#smFeather').value + ' 像素';
  $('#smContrastVal').textContent = $('#smContrast').value + '%';
  $('#smMoveVal').textContent = $('#smMove').value + '%';
  const apply = sel => {
    if (!smOpen()) return;
    smInternal = true;
    try { setSelection(sel, { history: false, props: false }); } finally { smInternal = false; }
    const a = sel ? selectionArea(sel) : 0;
    $('#smStats').textContent = `预览：覆盖 ${Math.round(a)} px（原 ${Math.round(selectionArea(smBase))} px）`;
  };
  if (!smHuge) { apply(smChain()); return; }

  const token = ++smPreviewToken;
  clearTimeout(smPreviewTimer);
  $('#smStats').textContent = '正在按分块计算预览…';
  smPreviewTimer = setTimeout(() => {
    if (token !== smPreviewToken || !smOpen()) return;
    let sel = null;
    (async () => {
      try { sel = await smChainHuge(token); }
      catch (e) { if (e?.name !== 'AbortError' && token === smPreviewToken) $('#smStats').textContent = '预览失败：' + humanEditError(e && e.message || e); return; }
      if (!sel || token !== smPreviewToken || !smOpen()) return;
      apply(sel);
    })();
  }, 120);
}
function smSyncView(){
  $('#smView').value = smView; $('#smViewOp').value = String(Math.round(smViewOp * 100));
  $('#smViewOpVal').textContent = Math.round(smViewOp * 100) + '%';
  $('#smShowOrig').checked = smShowOrig;
  syncAnts(); drawGizmo();
}

export function maskSelectAndMask(idx){
  return runLazy(SELECT, '选择并遮住', () => {
    if (idx !== selLayer) return;
    const d = loadSelData('mask'); if (!d) return;
    combineInto(createSelection(docW, docH, 0, 0, docW, docH, d), 'replace');
    openSelectAndMask();
  });
}
export async function openSelectAndMask(){
  if (!doc) return;
  if (!selection) { $('#notice').textContent = '先做一个选区（选区工具 / ⌘A / ⌘点缩略图）。'; return; }
  smHuge = docW * docH > 64e6;
  if (!selReady('选择并遮住')) return;                              
  smBase = cloneSelection(selection);
  smSnapshot = docSnapshot();
  if (!smHuge) { try { smPx = sampleRGBA(true); } catch { smPx = null; } }
  else smPx = null;
  const dlg = $('#selMaskDlg');
  for (const id of ['#smRadius', '#smSmooth', '#smFeather', '#smContrast', '#smMove']) $(id).value = 0;
  $('#smSmart').checked = false;
  smRefine = null; smRefineR = 0; smRefCache = null; smToolDrag = false; smRefineDrag = null;
  $('#smDecon').checked = false; $('#smDeconAmt').disabled = true; smSyncOutput();
  smPreview();
  dlg.returnValue = '';
  dlg.show();                              
  
  Object.assign(dlg.style, { position: 'fixed', zIndex: '900', top: '64px', right: '12px', left: 'auto', bottom: 'auto', margin: '0', maxHeight: 'calc(100vh - 80px)', overflow: 'auto' });
  smSyncView();
  smPrevTool = docTool;
  smPrevSbShow = sbOpts.show; sbOpts.show = 'ants';       
  smSetTool('quick');                      
}

function smLeaveTools(){
  const prev = smPrevTool;
  if (smPrevSbShow) { sbOpts.show = smPrevSbShow; smPrevSbShow = null; }
  smTool = null; smPrevTool = null; smToolDrag = false; smRefineDrag = null; smRefine = null; smRefCache = null;
  if (prev && prev !== docTool) { try { setDocTool(prev); } catch {} }
}

function smSyncOutput(){
  const on = $('#smDecon').checked, sel = $('#smOutput');
  for (const o of sel.options) o.disabled = on && (o.value === 'selection' || o.value === 'mask');
  if (on && (sel.value === 'selection' || sel.value === 'mask')) sel.value = 'layerMask';
  $('#smDeconAmt').disabled = !on;
  $('#smDeconAmtVal').textContent = $('#smDeconAmt').value + '%';
}
$('#smDecon').onchange = smSyncOutput;
$('#smDeconAmt').oninput = smSyncOutput;
{ 
  const TI = { quick: 'quickSelect', brush: 'brush', lasso: 'lasso', hand: 'hand', zoom: 'zoom' };
  for (const b of $('#smToolBtns').children) {
    const t = b.dataset.smt;
    if (t === 'refine') b.innerHTML = REFINE_EDGE_SVG; else { const ic = toolIcon(TI[t], 16); if (ic) b.replaceChildren(ic); }
    b.onclick = () => smSetTool(t);
  }
  for (const b of $('#smToolOps').children) b.onclick = () => { smToolOp = b.dataset.op; smApplyToolOpts(); };
  $('#smToolSize').onchange = () => { smToolSize = Math.max(1, Math.min(1000, +$('#smToolSize').value || 30)); smApplyToolOpts(); };
}

function smDecontaminate(idx, amount, sel){
  if (!(amount > 0) || idx < 0 || !sel) return false;
  const pp = ensurePixelPaint(idx); if (!pp) return false;
  const before = Uint8ClampedArray.from(pp.rgba);
  const rad = Math.max(3, Math.round(+$('#smRadius').value || 0) + 2);
  const n = decontaminateColors(pp.rgba, pp.w, pp.h, pp.left, pp.top, (x, y) => selectionValueAt(sel, x, y), amount, rad);
  if (!n) return false;
  const rect = { x: 0, y: 0, w: pp.w, h: pp.h };
  brushHistory.undo.push(sparsePixelHistory(idx, before, pp.rgba, pp.w, pp.h));
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  histPush('净化颜色', 'brush');
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  commitPixelPaint(idx);
  renderPreviewOnly(); updateUndoButtons();
  return true;
}
for (const id of ['#smRadius', '#smSmooth', '#smFeather', '#smContrast', '#smMove']) $(id).oninput = smPreview;
$('#smSmart').onchange = smPreview;
$('#smView').onchange = () => { smView = $('#smView').value; smSyncView(); };
$('#smViewOp').oninput = () => { smViewOp = +$('#smViewOp').value / 100; smSyncView(); };
$('#smShowOrig').onchange = () => { smShowOrig = $('#smShowOrig').checked; smSyncView(); };
$('#smReset').onclick = () => { for (const id of ['#smRadius', '#smSmooth', '#smFeather', '#smContrast', '#smMove']) $(id).value = 0; $('#smSmart').checked = false; smRefine = null; smRefineR = 0; smRefCache = null; smPreview(); };

$('#selMaskDlg').addEventListener('keydown', e => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  const k = e.key.toLowerCase();
  if (SM_TOOL_KEYS[k] && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); smSetTool(SM_TOOL_KEYS[k]); return; }
  if (SM_VIEW_KEYS[k] && !e.metaKey && !e.ctrlKey) { e.preventDefault(); smView = SM_VIEW_KEYS[k]; smSyncView(); return; }
  if (k === 'f') { e.preventDefault(); const L = Object.values(SM_VIEW_KEYS); smView = L[(L.indexOf(smView) + 1) % L.length]; smSyncView(); return; }
  if (k === 'p') { e.preventDefault(); smShowOrig = !smShowOrig; smSyncView(); return; }
  if (e.key === 'Enter') { e.preventDefault(); $('#smOk').click(); return; }
  if (e.key === 'Escape') { e.preventDefault(); $('#smCancel').click(); }
});
$('#smOk').onclick = async () => {
  const decon = $('#smDecon').checked ? (+$('#smDeconAmt').value || 0) / 100 : 0;
  $('#selMaskDlg').close('ok');
  smLeaveTools();
  docHistory.undo.push(smSnapshot);
  if (docHistory.undo.length > histCap()) docHistory.undo.shift();
  docHistory.redo.length = 0;
  smSnapshot = null; smBase = null; smPx = null; smViewCache = null; smHuge = false;
  clearTimeout(smPreviewTimer); smPreviewToken++;
  smBandCache.clear(); smBandOrder.length = 0;
  updateUndoButtons(); syncAnts(); drawGizmo();
  const out = $('#smOutput').value, src = selLayer;
  if (out === 'selection' || !selection) return;
  
  if (out === 'mask') { if (src >= 0) { actions.run('layer.mask.revealSelection'); setSelection(null, { history: false }); } return; }
  if (out === 'layer') {
    const outSel = selection;
    const ok = await layerViaSelection(false);
    if (!ok) return;                                 
    if (decon) smDecontaminate(selLayer, decon, outSel);
    if (src >= 0) setLayerVisible(src, false);
    setSelection(null, { history: false }); renderLayerPanel();
    return;
  }
  if (out === 'layerMask' && src >= 0) {
    

    const L = layerTree && layerTree.flat && layerTree.flat[src];
    if (L && L.isGroup) { $('#notice').textContent = '选中的是图层组：「新建带有图层蒙版的图层」需要一个像素图层，已改为只输出选区。'; return; }
    const outSel = selection;
    const n = duplicateLayerUI(src);
    if (n < 0) return;
    const srcAfter = builtIndexOf(src);
    await dupTask;
    const cp = selLayer;                             
    if (cp < 0 || cp === srcAfter) return;
    if (selection !== outSel) setSelection(outSel, { history: false });
    selLayers.clear();
    if (maskFromSelection(cp) !== false) maskAdded(cp);
    if (decon) smDecontaminate(cp, decon, outSel);     
    if (srcAfter >= 0) setLayerVisible(srcAfter, false);
    set_selLayer(cp);
    setSelection(null, { history: false }); renderLayerPanel(); renderProps();
  }
};
$('#smCancel').onclick = () => {
  $('#selMaskDlg').close('cancel');
  smLeaveTools();
  if (smBase) setSelection(cloneSelection(smBase), { history: false });
  smSnapshot = null; smBase = null; smPx = null; smViewCache = null; smHuge = false;
  clearTimeout(smPreviewTimer); smPreviewToken++;
  smBandCache.clear(); smBandOrder.length = 0;
  syncAnts(); drawGizmo();
};



function drawSmViewLarge(ctx){
  const s = selection;
  if (!s) return;
  const op = smView === 'layers' || smView === 'bw' ? 1 : smViewOp;
  const m = ctx.getTransform ? ctx.getTransform() : null;
  const sx = (m && m.a) || 1, sy = (m && m.d) || 1, tx = m ? m.e : 0, ty = m ? m.f : 0;
  const cw = ctx.canvas?.width || docW, ch = ctx.canvas?.height || docH;
  const x0 = Math.max(0, Math.floor(-tx / sx) - 2), y0 = Math.max(0, Math.floor(-ty / sy) - 2);
  const x1 = Math.min(docW, Math.ceil((cw - tx) / sx) + 2), y1 = Math.min(docH, Math.ceil((ch - ty) / sy) + 2);
  const vw = x1 - x0, vh = y1 - y0;
  if (!(vw > 0 && vh > 0)) return;
  const k = Math.max(1, Math.ceil(vw / Math.max(1, cw)), Math.ceil(vh / Math.max(1, ch)));
  const ow = Math.max(1, Math.ceil(vw / k)), oh = Math.max(1, Math.ceil(vh / k));
  const c = smViewCache?.canvas || document.createElement('canvas');
  const cache = smViewCache;
  if (!cache || cache.key !== s || cache.mode !== smView || cache.op !== op || cache.x0 !== x0 || cache.y0 !== y0
      || cache.k !== k || c.width !== ow || c.height !== oh) {
    c.width = ow; c.height = oh;
    const g = c.getContext('2d'), img = g.createImageData(ow, oh), D = img.data;
    const sd = s.data, sxx = s.x, syy = s.y, sw = s.width, sh = s.height;
    let o = 0;
    for (let j = 0; j < oh; j++) {
      const yy = y0 + Math.min(vh - 1, Math.floor((j + .5) * k));
      for (let i = 0; i < ow; i++) {
        const xx = x0 + Math.min(vw - 1, Math.floor((i + .5) * k));
        const qi = xx - sxx, qj = yy - syy;
        const a = qi < 0 || qj < 0 || qi >= sw || qj >= sh ? 0 : sd[qj * sw + qi];
        if (smView === 'bw') { D[o] = D[o + 1] = D[o + 2] = a; D[o + 3] = 255; o += 4; continue; }
        let r = 0, gg = 0, b = 0;
        if (smView === 'overlay') r = 255;
        else if (smView === 'white') r = gg = b = 255;
        else { const v = (((xx >> 3) + (yy >> 3)) & 1) ? 204 : 255; r = gg = b = v; }
        D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = Math.round((255 - a) * op); o += 4;
      }
    }
    g.putImageData(img, 0, 0);
    smViewCache = { key: s, mode: smView, op, x0, y0, k, canvas: c };
  }
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x0, y0, vw, vh); ctx.restore();
}
export function drawSmView(ctx){
  if (!smOpen()) { smViewCache = null; return; }
  if (smShowOrig || smView === 'ants') return;
  if (docW * docH > 64e6) return drawSmViewLarge(ctx);
  const op = smView === 'layers' || smView === 'bw' ? 1 : smViewOp;
  const key = selection;
  if (!smViewCache || smViewCache.key !== key || smViewCache.mode !== smView || smViewCache.op !== op || smViewCache.canvas.width !== docW || smViewCache.canvas.height !== docH) {
    const c = (smViewCache && smViewCache.canvas.width === docW && smViewCache.canvas.height === docH) ? smViewCache.canvas : document.createElement('canvas');
    c.width = docW; c.height = docH;
    const g = c.getContext('2d'), img = g.createImageData(docW, docH), D = img.data;
    const s = selection;
    const covAt = (x, y) => { if (!s) return 0; const i = x - s.x, j = y - s.y; return (i < 0 || j < 0 || i >= s.width || j >= s.height) ? 0 : s.data[j * s.width + i]; };
    for (let y = 0; y < docH; y++) for (let x = 0; x < docW; x++) {
      const a = covAt(x, y), o = (y * docW + x) * 4;
      if (smView === 'bw') { D[o] = D[o + 1] = D[o + 2] = a; D[o + 3] = 255; continue; }
      let r = 0, gg = 0, b = 0;
      if (smView === 'overlay') { r = 255; }
      else if (smView === 'white') { r = gg = b = 255; }
      else if (smView === 'onion' || smView === 'layers') { const v = (((x >> 3) + (y >> 3)) & 1) ? 204 : 255; r = gg = b = v; }
      D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = Math.round((255 - a) * op);
    }
    g.putImageData(img, 0, 0);
    smViewCache = { key, mode: smView, op, canvas: c };
  }
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(smViewCache.canvas, 0, 0); ctx.restore();
}

export function swapColors(){ const t = fgRGB; set_fgRGB(bgRGB); set_bgRGB(t); syncBrushSwatches(); syncGradBar(); syncBucketBar(); }
export function resetColors(){ set_fgRGB([0, 0, 0]); set_bgRGB([255, 255, 255]); syncBrushSwatches(); syncGradBar(); syncBucketBar(); }

export async function pickColor(which){
  const value = await openColorPicker({ value: hexOf(which === 'fg' ? fgRGB : bgRGB), title: which === 'fg' ? '拾色器（前景色）' : '拾色器（背景色）' });
  if (!value) return;
  const c = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  if (which === 'fg') set_fgRGB(c); else set_bgRGB(c);
  syncBrushSwatches(); syncGradBar(); syncBucketBar();
}
bindPaintUI();
