




import './38-brush-engine.js';   
import {
  BRUSH_SIZE_MAX, PAINT_MODES, BRUSH_PRESETS, tipThumb, defaultDynamics, SYMMETRY_TYPES, Smoother,
  normalizeDynamics, wavyParams, spiralPath, TEXTURE_MODES, DUAL_MODES,
} from '../../../core/brush-engine.js';
import { BRUSH_BAR_ICONS } from '../brush-bar-icons.js';
import { bsx as BSX } from '../brush-settings-extras.js';
import { brushLib, brushPanel } from '../brushes-panel.js';
import { promptDialog, formDialog } from '../dialog.js';
import { uiIcon } from '../icons.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { presets } from '../presets-panels.js';
import { shell } from '../shell.js';
import { $, ADJ_KINDS_MENU, BRUSH, EDIT, applyEdits, ensureLazy, kick } from './01-boot.js';
import {
  brushPreviewOn, curStroke, doc, docH, docName, docStack, docW, layerTree, li, maskPaint, origBuffer,
  pixelPaint,
} from './02-doc-state.js';
import { revealPropsPanel, structuralBegin, structuralDone } from './03-history.js';
import { zoom } from './04-view-chrome.js';
import { paintMap } from './11-paint-common.js';
import { qmask } from './13-quickmask-apply-image.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { selLayer, set_selLayer } from './23-layers-panel.js';
import { cloneOpValue, humanEditError } from './24-layer-ops-queue.js';
import {
  PAINT_TOOLS, bgRGB, brush, docTool, eraserOpts, fgRGB, historySourceFor, historySourceInfo, pencilOpts,
  set_symmetryOn, symmetryOn, toolModes,
} from './31-selection-brush.js';
import { brushCursor, dispPx } from './32-cursors-select-options.js';
import { qsOpts } from './33-lasso-quick-select.js';
import { AB_BAR_ICONS } from './36-clipboard-frame.js';
import { BRUSHOP_TOOLS, brushOpFn } from './37-local-pixel-tools.js';
import {
  SYM_TOOLS, beginStroke, brushTarget, emitDab, endStroke, ensureMaskPaint, paintGuard, repaintStrokeLayer,
  scheduleStrokeRepaint, strokeSetup, strokeTo, texLumCache,
} from './38-brush-engine.js';
import { syncBrushPanel } from './40-options-bar-wiring.js';
import { dispThr, drawGizmo, gizmo, toDoc } from './46-smart-filter-panel.js';
import { buildPsdBuffer, ensureStructuralBase } from './48-info-export.js';











export const barImg = (key, title) => {
  const [src, px] = BRUSH_BAR_ICONS[key];
  const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; img.alt = title || '';
  return img;
};
export const MODE_TOOLS = new Set(['brush', 'pencil', 'historyBrush', 'historyArtBrush']);
export const SMOOTH_TOOLS = new Set(['brush', 'pencil', 'eraser', 'mixerBrush', 'adjBrush']);


export const AIR_TOOLS = new Set(['brush', 'eraser', 'mixerBrush', 'historyBrush']);


const TONE_TOOLS_NO_OPFLOW = ['blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge'];
export const NO_OPACITY_TOOLS = new Set(['colorReplace', 'backgroundEraser', 'mixerBrush', 'adjBrush', ...TONE_TOOLS_NO_OPFLOW]);
export const NO_FLOW_TOOLS = new Set(['pencil', 'historyArtBrush', 'colorReplace', 'backgroundEraser', ...TONE_TOOLS_NO_OPFLOW]);
export const MY_PAINT_TOOLS = new Set(['brush', 'pencil', 'eraser', 'colorReplace', 'mixerBrush', 'historyBrush', 'historyArtBrush', 'backgroundEraser', 'adjBrush']);
const toolPO = {};                       

export function paintToolSwitch(prev, next){
  if (prev === next) return;
  if (PAINT_TOOLS.has(prev)) toolPO[prev] = { opacity: brush.opacity, flow: brush.flow };
  if (PAINT_TOOLS.has(next)) { const v = toolPO[next] || { opacity: 1, flow: 1 }; brush.opacity = v.opacity; brush.flow = v.flow; }
  if (paintGest) endPaintGesture(false);
  if (BRUSHOP_TOOLS.has(next)) kick(BRUSH);                 
}
export const effOpacity = t => NO_OPACITY_TOOLS.has(t) ? 1 : brush.opacity;
export const effFlow = t => NO_FLOW_TOOLS.has(t) ? 1 : brush.flow;


export function setBrushSize(n){
  n = Math.max(1, Math.min(BRUSH_SIZE_MAX, Math.round(n)));
  brush.size = n; syncBrushControls(); if (brushCursor) drawGizmo();
}
export function setBrushHardness(h){
  brush.hardness = Math.max(0, Math.min(1, h)); syncBrushControls(); if (brushCursor) drawGizmo();
}

export function syncBrushControls(){
  const setv = (id, v) => { const el = $(id); if (el && document.activeElement !== el && String(el.value) !== String(v)) el.value = v; };
  const text = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setv('#brSize', brush.size); setv('#brSizeNum', brush.size); text('#brSizeVal', brush.size); text('#brPresetSize', brush.size);
  const hp = Math.round(brush.hardness * 100); setv('#brHard', hp); setv('#brHardNum', hp); text('#brHardVal', hp + '%');
  const op = Math.round(brush.opacity * 100), fl = Math.round(brush.flow * 100);
  setv('#brOpacity', op); text('#brOpacityVal', op + '%'); setv('#brFlow', fl); text('#brFlowVal', fl + '%');
  const sm = Math.round(brush.smoothing * 100); setv('#brSmooth', sm); text('#brSmoothVal', sm + '%');
  setv('#brAngle', Math.round(brush.angle)); setv('#brAngleNum', Math.round(brush.angle)); setv('#brRoundNum', Math.round(brush.roundness * 100));
  const mode = $('#brMode'); if (mode && MODE_TOOLS.has(docTool)) mode.value = toolModes[docTool] || 'normal';
  setv('#brEraseMode', eraserOpts.mode);
  const on = (id, v) => { const el = $(id); if (el) el.classList.toggle('on', !!v); };
  on('#brPressOp', brush.pressureOpacity); on('#brPressSize', brush.pressureSize); on('#brAir', brush.airbrush);
  on('#brSym', symmetryOn && !!brush.symmetry);
  const ae = $('#brAutoErase'); if (ae) ae.checked = pencilOpts.autoErase;
  const th = $('#brToHist'); if (th) th.checked = eraserOpts.toHistory;
  const blk = docTool === 'eraser' && eraserOpts.mode === 'block';
  for (const id of ['#brPresetBtn', '#brAngleWrap', '#brPressSize']) { const el = $(id); if (el) el.style.opacity = blk ? '.4' : ''; }
  drawPresetThumb($('#brPresetThumb'), brush.tip, brush.hardness, brush.angle, brush.roundness);
  if (!$('#brPresetPop').hidden) drawAngleDial();
  if (bsPanelOpen()) renderBrushSettings(false);
}

function drawPresetThumb(cv, tip, hardness, angle, roundness){
  if (!cv) return;
  const n = cv.width, ctx = cv.getContext('2d'), id = ctx.createImageData(n, n);
  const t = tipThumb(tip, hardness, 48), a = -(angle || 0) * Math.PI / 180, rr = roundness || 1;
  const cs = Math.cos(a), sn = Math.sin(a);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + .5) / n * 2 - 1, dy = (y + .5) / n * 2 - 1;
    const u = (dx * cs + dy * sn) * 1.08, v = (-dx * sn + dy * cs) / rr * 1.08;
    let c = 0;
    if (u > -1 && u < 1 && v > -1 && v < 1) { const X = Math.min(47, Math.floor((u + 1) / 2 * 48)), Y = Math.min(47, Math.floor((v + 1) / 2 * 48)); c = t[Y * 48 + X]; }
    const o = (y * n + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = 230; id.data[o + 3] = Math.round(c * 255);
  }
  ctx.putImageData(id, 0, 0);
}



export function applyBrushPreset(p){
  if (p && p.rec) { applyBrushRecord(p.rec, p.id); return; }
  const bsKeep = BSX.captureLocked(brush);                                  
  const keepTex = brush.dyn && brush.dyn.protectTexture && brush.dyn.texture && brush.dyn.texture.on ? { ...brush.dyn.texture } : null;
  brush.preset = p.id; brush.tip = p.tip; brush.hardness = p.hardness; brush.size = p.size;
  brush.angle = p.angle || 0; brush.roundness = p.roundness || 1;          
  brush.spacing = p.spacing || .25; brush.pressureOpacity = !!p.pressureOpacity; brush.pressureSize = !!p.pressureSize;
  const d = defaultDynamics();
  if (p.dyn) for (const k of Object.keys(p.dyn)) Object.assign(d[k], p.dyn[k]);
  if (keepTex) d.protectTexture = true;
  brush.dyn = d;
  BSX.restoreLocked(brush, bsKeep);
  syncBrushControls(); renderPresetList(); try { brushPanelSync(); } catch {}
}

export function applyBrushRecord(rec, id){
  const bsKeep = BSX.captureLocked(brush);                                  
  const keepTex = brush.dyn && brush.dyn.protectTexture && brush.dyn.texture && brush.dyn.texture.on ? { ...brush.dyn.texture } : null;
  brush.preset = id || rec.id || null;
  brush.tip = rec.sample ? brushLib.ensureSample(rec.sample) : (rec.tip || 'round');
  brush.hardness = rec.hardness == null ? 1 : rec.hardness;
  if (rec.useSize !== false) brush.size = Math.max(1, Math.min(BRUSH_SIZE_MAX, Math.round(rec.size || brush.size)));
  brush.angle = rec.angle || 0; brush.roundness = rec.roundness || 1; brush.spacing = rec.spacing || .25;
  const d = normalizeDynamics(cloneOpValue(rec.dyn || defaultDynamics()));
  if (rec.flipX) d.shape.flipXFixed = true; if (rec.flipY) d.shape.flipYFixed = true;
  if (d.dual && d.dual.sample) brushLib.ensureSample(d.dual.sample);
  if (keepTex && d.texture.on) { d.texture.pattern = keepTex.pattern; d.texture.patternName = keepTex.patternName; d.texture.scale = keepTex.scale; d.protectTexture = true; }
  brush.dyn = d;
  brush.airbrush = !!rec.airbrush;
  brush.pressureOpacity = !!rec.pressureOpacity; brush.pressureSize = !!rec.pressureSize;
  const to = rec.toolOpts;
  if (to) {                                                        
    if (to.opacity != null) brush.opacity = to.opacity;
    if (to.flow != null) brush.flow = to.flow;
    if (to.mode && MODE_TOOLS.has(docTool)) toolModes[docTool] = to.mode;
  }
  BSX.restoreLocked(brush, bsKeep);
  syncBrushControls(); renderPresetList(); try { brushPanelSync(); } catch {}
}

export function currentBrushRecord(){
  const d = cloneOpValue(brush.dyn || defaultDynamics());
  const rec = { name: (brushLib.find(brush.preset) || BRUSH_PRESETS.find(p => p.id === brush.preset) || {}).name
      || (BRUSH_PRESETS.find(p => p.id === brush.preset) || {}).label || '画笔',
    tip: brush.tip, size: brush.size, hardness: brush.hardness, angle: brush.angle, roundness: brush.roundness, spacing: brush.spacing,
    flipX: !!d.shape.flipXFixed, flipY: !!d.shape.flipYFixed, airbrush: !!brush.airbrush,
    pressureOpacity: !!brush.pressureOpacity, pressureSize: !!brush.pressureSize, dyn: d,
    toolOpts: { opacity: brush.opacity, flow: brush.flow, mode: MODE_TOOLS.has(docTool) ? toolModes[docTool] || 'normal' : 'normal' } };
  const s = sampleOfTip(brush.tip); if (s) rec.sample = s;
  if (d.dual && d.dual.on && !d.dual.sample) { const s2 = sampleOfTip(d.dual.tip); if (s2) d.dual.sample = s2; }
  return rec;
}

function sampleOfTip(tip){
  if (!tip || !String(tip).startsWith('abr:')) return null;
  const id = String(tip).slice(4);
  for (const it of brushLib.items) { if (it.sample && it.sample.id === id) return it.sample; const ds = it.dyn && it.dyn.dual && it.dyn.dual.sample; if (ds && ds.id === id) return ds; }
  for (const t of brushLib.tools) if (t.brush && t.brush.sample && t.brush.sample.id === id) return t.brush.sample;
  return defineBrushTemp.get(id) || null;
}
const defineBrushTemp = new Map();
function brushPanelSync(){ try { brushPanel.render(); } catch {} }
export function renderPresetList(host = $('#brPresetList')){
  if (!host) return;
  host.replaceChildren();
  const search = host.dataset.q || '';
  for (const g of brushLib.pickerGroups(search)) {
    host.append(Object.assign(document.createElement('div'), { className: 'bp-grp', textContent: '▾ ' + g.name }));
    const items = document.createElement('div'); items.className = 'bp-items'; host.append(items);
    for (const p of g.items) {
      const it = document.createElement('div'); it.className = 'bp-item' + (brush.preset === p.id ? ' on' : ''); it.title = p.label;
      const cv = document.createElement('canvas'); cv.width = cv.height = 30; drawPresetThumb(cv, p.tip, p.hardness, p.angle || 0, p.roundness || 1);
      it.append(cv, Object.assign(document.createElement('span'), { textContent: String(p.size) }));
      it.onclick = () => applyBrushPreset(p);
      it.ondblclick = () => { applyBrushPreset(p); $('#brPresetPop').hidden = true; };
      items.append(it);
    }
  }
}

function drawAngleDial(){
  const cv = $('#brAngleDial'); if (!cv) return;
  const ctx = cv.getContext('2d'), W = cv.width, c = W / 2, R = W / 2 - 6;
  const a = -brush.angle * Math.PI / 180;                 
  ctx.clearRect(0, 0, W, W);
  ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(c, c); ctx.rotate(a);
  ctx.fillStyle = 'rgba(230,230,230,.9)';
  ctx.beginPath(); ctx.ellipse(0, 0, R, Math.max(1, R * brush.roundness), 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1473e6'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R + 4, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(R + 4, 0); ctx.lineTo(R - 2, -4); ctx.lineTo(R - 2, 4); ctx.closePath(); ctx.fillStyle = '#1473e6'; ctx.fill();
  ctx.fillStyle = '#000';
  for (const s of [1, -1]) { ctx.beginPath(); ctx.arc(0, s * R * brush.roundness, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function bindAngleDial(){
  const cv = $('#brAngleDial'); if (!cv || cv.dataset.bound) return; cv.dataset.bound = '1';
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2 - 6;
    const a = -brush.angle * Math.PI / 180;
    const dot = [Math.cos(a + Math.PI / 2) * R * brush.roundness, Math.sin(a + Math.PI / 2) * R * brush.roundness];
    const rel = [e.clientX - cx, e.clientY - cy];
    const roundDrag = Math.min(Math.hypot(rel[0] - dot[0], rel[1] - dot[1]), Math.hypot(rel[0] + dot[0], rel[1] + dot[1])) < 7;
    const at = ev => {
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      if (roundDrag) {
        const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
        brush.roundness = Math.max(.01, Math.min(1, perp / R));
      } else brush.angle = Math.round(-Math.atan2(dy, dx) * 180 / Math.PI);
      syncBrushControls();
    };
    if (!roundDrag) at(e);
    const mv = ev => at(ev), up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); };
    cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
  });
}
export function togglePresetPop(force){
  const pop = $('#brPresetPop'), btn = $('#brPresetBtn');
  const open = force !== undefined ? force : pop.hidden;
  if (!open) { pop.hidden = true; return; }
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(innerWidth - 280, r.left)) + 'px'; pop.style.top = (r.bottom + 3) + 'px';
  ensurePickerBar(); renderPresetList(); drawAngleDial(); bindAngleDial();
  const close = e => { if (pop.contains(e.target) || btn.contains(e.target)) return; pop.hidden = true; removeEventListener('pointerdown', close, true); };
  setTimeout(() => addEventListener('pointerdown', close, true), 0);
}


function ensurePickerBar(){
  const list = $('#brPresetList'); if (!list || $('#brPickerBar')) return;
  const bar = document.createElement('div'); bar.id = 'brPickerBar'; bar.className = 'br-pop-row'; bar.style.gap = '4px';
  const q = document.createElement('input'); q.type = 'search'; q.placeholder = '搜索画笔'; q.style.flex = '1'; q.dataset.attr = 'brush-picker-search';
  q.oninput = () => { list.dataset.q = q.value; renderPresetList(); };
  const nb = document.createElement('button'); nb.className = 'lf-btn'; nb.title = '从此画笔创建新的预设'; nb.append(uiIcon('add-style', 15));
  nb.onclick = () => { $('#brPresetPop').hidden = true; brushPanel.newFromCurrent(); };
  const gear = document.createElement('button'); gear.className = 'lf-btn'; gear.title = '画笔预设选项';
  { const [src, px] = AB_BAR_ICONS.abGear; const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; gear.append(img); }
  gear.onclick = e => panels.popup(panels.panelMenuItems('brushes') || [], e.currentTarget.getBoundingClientRect());
  bar.append(q, nb, gear);
  list.before(bar);
}

export function fillModeSelect(sel){
  sel.replaceChildren();
  for (const m of PAINT_MODES) {
    if (!m) { sel.append(Object.assign(document.createElement('option'), { disabled: true, textContent: '──────────' })); continue; }
    sel.append(Object.assign(document.createElement('option'), { value: m[0], textContent: m[1] }));
  }
}




export let symEdit = null, symDrag = null;
const SYM_HANDLE = 120;                    
function symDefaults(type){
  const m = Math.min(docW, docH);
  return { type, cx: docW / 2, cy: docH / 2, angle: 0, scale: 1, segments: type === 'spiral' ? 6 : 5, gap: Math.round(docW / 4), radius: Math.round(m / 4),
    amp: Math.round(m / 12), wavelength: Math.round(docW / 3), shrink: .8 };
}
export function startSymEdit(){ if (!brush.symmetry) return; symEdit = { orig: { ...brush.symmetry } }; drawGizmo(); shell.status('变换对称路径：拖中心移动、拖手柄旋转 / 缩放（Shift 吸附 15°）；Enter 提交，Esc 取消'); }
export function endSymEdit(commit){
  if (!symEdit) return;
  if (!commit) Object.assign(brush.symmetry, symEdit.orig);
  symEdit = null; symDrag = null; drawGizmo();
}
function symHandles(){
  const s = brush.symmetry, th = (s.angle || 0) * Math.PI / 180, L = SYM_HANDLE * (s.scale || 1);
  return { c: [s.cx, s.cy], k: [s.cx + Math.cos(th) * L, s.cy + Math.sin(th) * L], L };
}
export function openSymmetryMenu(anchor){
  const pop = document.createElement('div'); pop.className = 'br-pop br-sym-pop';
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(innerWidth - 200, r.left)) + 'px'; pop.style.top = (r.bottom + 3) + 'px';
  const close = () => { pop.remove(); removeEventListener('pointerdown', outside, true); };
  const outside = e => { if (!pop.contains(e.target)) close(); };
  const item = (label, iconKey, on, off, run, tip) => {
    const it = document.createElement('div'); it.className = 'bs-sym-item' + (on ? ' on' : '') + (off ? ' off' : '');
    if (iconKey) it.append(barImg(iconKey)); it.append(document.createTextNode(label));
    if (tip) it.title = tip;
    if (!off) it.onclick = () => { close(); run(); };
    pop.append(it);
  };
  item('关闭对称', null, !symmetryOn, !brush.symmetry && !symmetryOn, () => { set_symmetryOn(false); endSymEdit(true); syncBrushControls(); drawGizmo(); });
  for (const [type, label, ic] of SYMMETRY_TYPES) {
    item(label, ic, symmetryOn && brush.symmetry && brush.symmetry.type === type, false, async () => {
      const sym = symDefaults(type);
      if (type === 'radial' || type === 'mandala' || type === 'spiral') {
        
        const v = await promptDialog('段计数（2–12）：', String((brush.symmetry && brush.symmetry.segments) || sym.segments), { title: label + '对称' }).catch(() => null);
        if (v == null) return;
        sym.segments = Math.max(2, Math.min(12, Math.round(+v) || sym.segments));
      }
      brush.symmetry = sym; set_symmetryOn(true); syncBrushControls();
      startSymEdit();
    });
  }
  const sep = document.createElement('div'); sep.className = 'menu-sep'; pop.append(sep);
  item('变换对称', null, false, !brush.symmetry, () => { set_symmetryOn(true); syncBrushControls(); startSymEdit(); });
  item('对称路径选项…', null, false, !brush.symmetry, () => symOptionsDialog());
  item('对称路径居中', null, false, !brush.symmetry, () => { brush.symmetry.cx = docW / 2; brush.symmetry.cy = docH / 2; drawGizmo(); });
  document.body.append(pop);
  setTimeout(() => addEventListener('pointerdown', outside, true), 0);
}
async function symOptionsDialog(){
  const s = brush.symmetry; if (!s) return;
  const t = s.type, f = [
    { key: 'cx', label: '中心 X', value: Math.round(s.cx), unit: '像素' }, { key: 'cy', label: '中心 Y', value: Math.round(s.cy), unit: '像素' },
    { key: 'angle', label: '角度', value: Math.round(s.angle || 0), min: -360, max: 360, unit: '°' }, { key: 'scale', label: '缩放', value: Math.round((s.scale || 1) * 100), min: 5, max: 2000, unit: '%' }];
  if (['radial', 'mandala', 'spiral', 'parallel'].includes(t)) f.push({ key: 'segments', label: t === 'parallel' ? '线条数' : '段计数', value: s.segments, min: t === 'parallel' ? 1 : 2, max: 12 });
  if (t === 'parallel') f.push({ key: 'gap', label: '间距', value: s.gap, min: 4, max: 20000, unit: '像素' });
  if (t === 'circle' || t === 'spiral') f.push({ key: 'radius', label: '半径', value: s.radius, min: 4, max: 20000, unit: '像素' });
  if (t === 'wavy') f.push({ key: 'amp', label: '振幅', value: s.amp, min: 1, max: 20000, unit: '像素' }, { key: 'wavelength', label: '波长', value: s.wavelength, min: 8, max: 20000, unit: '像素' });
  if (t === 'spiral') f.push({ key: 'shrink', label: '每段缩小到', value: Math.round((s.shrink || .8) * 100), min: 30, max: 98, unit: '%' });
  const v = await formDialog('对称路径选项', f).catch(() => null);
  if (!v) return;
  for (const k of Object.keys(v)) { const n = +v[k]; if (!Number.isFinite(n)) continue; s[k] = k === 'scale' || k === 'shrink' ? n / 100 : n; }
  drawGizmo();
}

function drawSymmetryPath(ctx){
  if (!symmetryOn || !brush.symmetry || !SYM_TOOLS.has(docTool) || !doc) return;
  const s = brush.symmetry, L = Math.hypot(docW, docH), sc = s.scale || 1;
  const th = (s.angle || 0) * Math.PI / 180;
  ctx.save(); ctx.lineWidth = dispPx(1.5); ctx.strokeStyle = 'rgba(40,150,255,.9)'; ctx.setLineDash([dispPx(6), dispPx(4)]);
  const line = phi => { ctx.moveTo(s.cx - Math.cos(phi) * L, s.cy - Math.sin(phi) * L); ctx.lineTo(s.cx + Math.cos(phi) * L, s.cy + Math.sin(phi) * L); };
  ctx.beginPath();
  if (s.type === 'vertical') line(th + Math.PI / 2);
  else if (s.type === 'horizontal') line(th);
  else if (s.type === 'dual') { line(th); line(th + Math.PI / 2); }
  else if (s.type === 'diagonal') line(th + Math.PI / 4);
  else if (s.type === 'parallel') { const ax = Math.cos(th + Math.PI / 2), ay = Math.sin(th + Math.PI / 2), n = s.segments || 3;
    for (let k = -n; k <= n; k++) { const o = k * s.gap * sc / 2;
      const px = s.cx + Math.cos(th) * o, py = s.cy + Math.sin(th) * o;
      ctx.moveTo(px - ax * L, py - ay * L); ctx.lineTo(px + ax * L, py + ay * L); } }
  else if (s.type === 'circle') ctx.arc(s.cx, s.cy, Math.max(4, s.radius * sc), 0, Math.PI * 2);
  else if (s.type === 'radial' || s.type === 'mandala') { const n = s.segments || 5;
    for (let k = 0; k < n; k++) { const a = th + k * 2 * Math.PI / n - Math.PI / 2; ctx.moveTo(s.cx, s.cy); ctx.lineTo(s.cx + Math.cos(a) * L, s.cy + Math.sin(a) * L); } }
  else if (s.type === 'wavy') {
    const w = wavyParams(s), c = Math.cos(th), sn = Math.sin(th);
    for (let u = -L, first = true; u <= L; u += Math.max(2, w.L / 48)) { const v = w.f(u), x = s.cx + u * c - v * sn, y = s.cy + u * sn + v * c; if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
  } else if (s.type === 'spiral') {
    const pts = spiralPath(s, L); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  }
  ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(s.cx, s.cy, dispThr(4), 0, Math.PI * 2); ctx.stroke();
  if (symEdit) {
    const h = symHandles(), hs = dispPx(5);
    ctx.strokeStyle = '#1473e6'; ctx.fillStyle = '#fff'; ctx.lineWidth = dispPx(1);
    ctx.beginPath(); ctx.arc(h.c[0], h.c[1], h.L, 0, Math.PI * 2); ctx.setLineDash([dispPx(3), dispPx(3)]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(h.c[0], h.c[1]); ctx.lineTo(h.k[0], h.k[1]); ctx.stroke();
    ctx.fillRect(h.c[0] - hs, h.c[1] - hs, hs * 2, hs * 2); ctx.strokeRect(h.c[0] - hs, h.c[1] - hs, hs * 2, hs * 2);
    ctx.beginPath(); ctx.arc(h.k[0], h.k[1], hs * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function symPointerDown(ev){
  if (!symEdit || !brush.symmetry || !SYM_TOOLS.has(docTool) || ev.button !== 0) return false;
  const pt = toDoc(ev), h = symHandles(), tol = dispThr(9);
  const near = p => Math.hypot(pt.x - p[0], pt.y - p[1]) <= tol;
  if (ev.detail >= 2) { endSymEdit(true); return true; }
  if (near(h.k)) symDrag = { mode: 'rot' };
  else if (near(h.c) || Math.hypot(pt.x - h.c[0], pt.y - h.c[1]) < h.L * .35) symDrag = { mode: 'move', dx: pt.x - brush.symmetry.cx, dy: pt.y - brush.symmetry.cy };
  else { endSymEdit(true); return false; }          
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  return true;
}
function symPointerMove(ev){
  if (!symDrag) return false;
  const pt = toDoc(ev), s = brush.symmetry;
  if (symDrag.mode === 'move') { s.cx = pt.x - symDrag.dx; s.cy = pt.y - symDrag.dy; }
  else {
    let a = Math.atan2(pt.y - s.cy, pt.x - s.cx) * 180 / Math.PI;
    if (ev.shiftKey) a = Math.round(a / 15) * 15;
    s.angle = Math.round(a * 10) / 10;
    s.scale = Math.max(.05, Math.min(20, Math.hypot(pt.x - s.cx, pt.y - s.cy) / SYM_HANDLE));
  }
  drawGizmo(); return true;
}
addEventListener('keydown', e => {
  if (!symEdit) return;
  if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endSymEdit(e.key === 'Enter'); }
}, true);


export let paintGest = null;                     
export const paintPressure = ev => ev && ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 1;   
export function startPaintGesture(S, ev, pt){
  if (paintGest) endPaintGesture(false);
  const g = { S, sm: null, raf: 0, air: 0, constrain: ev && ev.shiftKey ? { x: pt.x, y: pt.y, axis: null } : null, cursor: { ...pt } };
  if (SMOOTH_TOOLS.has(docTool) && brush.smoothing > 0) {
    
    const scr = brush.smoothing * 80;
    g.sm = new Smoother({ amount: brush.smoothing, pulled: brush.smoothOpts.pulled, radiusDoc: brush.smoothOpts.zoomAdjust ? scr / zoom : scr });
    g.sm.start({ x: pt.x, y: pt.y, p: pt.p });
  }
  if (brush.airbrush && AIR_TOOLS.has(docTool)) {
    
    g.air = setInterval(() => { if (curStroke !== S) return; emitDab(S, S.last.x, S.last.y, S.lastP); scheduleStrokeRepaint(S); }, 70);
  }
  paintGest = g;
}
export function paintMove(ev, pt){
  const S = curStroke; if (!S) return;
  pt.p = paintPressure(ev);
  const g = paintGest;
  if (!g || g.S !== S) { strokeTo(S, pt); return; }
  if (g.constrain && ev.shiftKey) {
    
    const c = g.constrain;
    if (!c.axis) {
      const dx = pt.x - c.x, dy = pt.y - c.y;
      if (Math.hypot(dx, dy) * zoom < 4) return;
      c.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    pt = c.axis === 'h' ? { ...pt, y: c.y } : { ...pt, x: c.x };
  }
  g.cursor = pt;
  if (g.sm) {
    const q = g.sm.feed(pt);
    if (q) strokeTo(S, q);
    if (brush.smoothOpts.catchUp && !g.raf) {
      const tick = () => {
        g.raf = 0;
        if (paintGest !== g || curStroke !== S || !g.sm.lagging) { if (!S.sparse) drawGizmo(); return; }
        const q2 = g.sm.step(true); if (q2) { strokeTo(S, q2); scheduleStrokeRepaint(S); }
        if (!S.sparse) drawGizmo(); g.raf = requestAnimationFrame(tick);
      };
      g.raf = requestAnimationFrame(tick);
    }
    if (!S.sparse) drawGizmo();
  } else strokeTo(S, pt);
}

export function endPaintGesture(finish){
  const g = paintGest; paintGest = null;
  if (!g) return;
  if (g.raf) cancelAnimationFrame(g.raf);
  if (g.air) clearInterval(g.air);
  if (finish && g.sm && brush.smoothOpts.catchUpEnd && curStroke === g.S) strokeTo(g.S, g.cursor);
}

function drawSmoothLeash(ctx){
  const g = paintGest; if (!g || !g.sm || !g.sm.p || !g.sm.t) return;
  ctx.save(); ctx.lineWidth = dispPx(1.5); ctx.strokeStyle = 'rgba(200,60,220,.9)';
  ctx.beginPath(); ctx.moveTo(g.sm.p.x, g.sm.p.y); ctx.lineTo(g.sm.t.x, g.sm.t.y); ctx.stroke();
  if (brush.smoothOpts.pulled) { ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(g.sm.p.x, g.sm.p.y, g.sm.radius, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}


let brushHud = null, brushHudTag = null, hudJustEnded = 0;
function hudWanted(ev){
  if (li || !doc || !(PAINT_TOOLS.has(docTool) || docTool === 'quickSelect')) return false;
  return (ev.button === 2 && ev.altKey) || (ev.button === 0 && ev.altKey && ev.ctrlKey);
}



export const stylusState = { pen: false, tiltX: 0, tiltY: 0, twist: 0 };
function trackPen(ev){ stylusState.pen = ev.pointerType === 'pen'; stylusState.tiltX = ev.tiltX || 0; stylusState.tiltY = ev.tiltY || 0; stylusState.twist = ev.twist || 0; }
export function installBrushGestures(){
gizmo.addEventListener('pointerdown', trackPen, true);
gizmo.addEventListener('pointermove', trackPen, true);
gizmo.addEventListener('pointerdown', ev => { if (symPointerDown(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
gizmo.addEventListener('pointermove', ev => { if (symPointerMove(ev)) ev.stopImmediatePropagation(); }, true);
gizmo.addEventListener('pointerup', ev => { if (symDrag) { symDrag = null; ev.stopImmediatePropagation(); drawGizmo(); } }, true);
gizmo.addEventListener('pointerdown', ev => {
  if (!hudWanted(ev)) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
  const qs = docTool === 'quickSelect';
  brushHud = { sx: ev.clientX, sy: ev.clientY, size0: qs ? qsOpts.size : brush.size, hard0: brush.hardness, at: toDoc(ev), qs };
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  if (!brushHudTag) { brushHudTag = document.createElement('div'); brushHudTag.className = 'br-hud-tag'; document.body.append(brushHudTag); }
  hudMove(ev);
}, true);
function hudMove(ev){
  const h = brushHud; if (!h) return;
  const dx = ev.clientX - h.sx, dy = ev.clientY - h.sy;
  const size = Math.max(1, Math.min(BRUSH_SIZE_MAX, Math.round(h.size0 + dx * 2 / zoom)));
  if (h.qs) { qsOpts.size = size; } else { setBrushSize(size); if (!h.qs) setBrushHardness(h.hard0 + dy / 150); }   
  brushHudTag.hidden = false;
  brushHudTag.style.left = (ev.clientX + 16) + 'px'; brushHudTag.style.top = (ev.clientY + 12) + 'px';
  brushHudTag.textContent = `直径：${size} 像素` + (h.qs ? '' : `\n硬度：${Math.round(brush.hardness * 100)}%`);
  drawGizmo();
}
gizmo.addEventListener('pointermove', ev => { if (brushHud) { ev.stopImmediatePropagation(); hudMove(ev); } }, true);
gizmo.addEventListener('pointerup', hudEnd, true);
gizmo.addEventListener('pointercancel', hudEnd, true);

gizmo.addEventListener('contextmenu', ev => {
  if ((ev.altKey && PAINT_TOOLS.has(docTool)) || brushHud || performance.now() - hudJustEnded < 400) { ev.preventDefault(); ev.stopImmediatePropagation(); }
}, true);
gizmo.addEventListener('pointermove', syncCaps, true);
}
const hudEnd = ev => { if (!brushHud) return; ev.stopImmediatePropagation(); brushHud = null; hudJustEnded = performance.now(); if (brushHudTag) brushHudTag.hidden = true; drawGizmo(); };

function drawBrushHud(ctx){
  const h = brushHud; if (!h) return;
  if (!brushPreviewOn) return;                    
  const r = Math.max(.5, (h.qs ? qsOpts.size : brush.size) / 2), hard = h.qs ? 1 : brush.hardness;
  ctx.save();
  
  const pc = /^#[0-9a-f]{6}$/i.test(PREF.get('cursors.previewColor') || '') ? PREF.get('cursors.previewColor') : '#ff0000';
  const rgb = [1, 3, 5].map(i => parseInt(pc.slice(i, i + 2), 16)).join(',');
  const g = ctx.createRadialGradient(h.at.x, h.at.y, 0, h.at.x, h.at.y, r);
  g.addColorStop(0, `rgba(${rgb},.5)`); g.addColorStop(Math.min(.999, hard), `rgba(${rgb},.5)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.at.x, h.at.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
  ctx.restore();
}


export let capsPrecise = false;
function syncCaps(ev){
  if (!ev || typeof ev.getModifierState !== 'function') return;
  const c = !!ev.getModifierState('CapsLock');
  if (c !== capsPrecise) { capsPrecise = c; if (brushCursor) drawGizmo(); }
}
addEventListener('keydown', syncCaps, true); addEventListener('keyup', syncCaps, true);


let bsPage = 'tip';
export const bsPanelEl = () => document.querySelector('section.panel[data-panel="brushSettings"]');
export const bsPanelOpen = () => { const el = bsPanelEl(); return !!(el && !el.hidden && el.offsetParent); };
export function renderBrushSettings(force = true){
  const host = bsPanelEl(); if (!host) return;
  if (!force && host.contains(document.activeElement) && document.activeElement.type === 'range') { drawBsPreview(); return; }
  const d = brush.dyn;
  const wrap = document.createElement('div'); wrap.className = 'bs-panel';
  const nav = document.createElement('div'); nav.className = 'bs-nav';
  const body = document.createElement('div'); body.className = 'bs-body';
  const pages = [
    ['tip', '画笔笔尖形状', null], ['shape', '形状动态', 'shape'], ['scatter', '散布', 'scatter'], ['texture', '纹理', 'texture'], ['dual', '双重画笔', 'dual'],
    ['color', '颜色动态', 'color'], ['transfer', '传递', 'transfer'], ['pose', '画笔笔势', 'pose'], ['noise', '杂色', 'noise'], ['wet', '湿边', 'wetEdges'],
    ['build', '建立', 'air'], ['smooth', '平滑', 'smooth'], ['protect', '保护纹理', 'protectTexture'],
  ];
  for (const [id, label, key] of pages) {
    const row = document.createElement('label'); row.className = (bsPage === id ? 'cur' : '') + (key ? '' : ' plain');
    if (key) {
      const cb = document.createElement('input'); cb.type = 'checkbox';
      if (key === 'x') { cb.disabled = true; row.title = label + '：本编辑器未实现（需要图案 / 第二笔尖 / 数位板笔势数据）'; row.style.opacity = '.45'; }
      else if (key === 'noise' || key === 'wetEdges' || key === 'protectTexture') cb.checked = !!d[key];
      else if (key === 'air') cb.checked = brush.airbrush;
      else if (key === 'smooth') cb.checked = brush.smoothing > 0;
      else cb.checked = !!d[key].on;
      cb.onclick = e => e.stopPropagation();
      cb.onchange = () => {
        if (key === 'noise' || key === 'wetEdges' || key === 'protectTexture') d[key] = cb.checked;
        else if (key === 'air') brush.airbrush = cb.checked;
        else if (key === 'smooth') brush.smoothing = cb.checked ? Math.max(.1, brush.smoothing) : 0;
        else d[key].on = cb.checked;
        syncBrushControls(); drawBsPreview();
      };
      row.append(cb);
    }
    row.append(document.createTextNode(label));
    if (key !== 'x') row.onclick = () => { bsPage = id; renderBrushSettings(); };
    nav.append(row);
  }
  const slider = (label, get, set, min, max, unit = '%', scale = 100) => {
    const r = document.createElement('div'); r.className = 'bs-row';
    const l = document.createElement('span'); l.textContent = label;
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.value = Math.round(get() * scale);
    const v = document.createElement('span'); v.className = 'v'; v.textContent = inp.value + unit;
    inp.oninput = () => { set(+inp.value / scale); v.textContent = inp.value + unit; syncBrushControls(); drawBsPreview(); };
    r.append(l, inp, v); body.append(r); return inp;
  };
  const select = (label, value, opts, set) => {
    const r = document.createElement('div'); r.className = 'bs-row';
    const l = document.createElement('span'); l.textContent = label;
    const s = document.createElement('select');
    for (const [v, t] of opts) s.append(Object.assign(document.createElement('option'), { value: v, textContent: t }));
    s.value = value; s.onchange = () => { set(s.value); drawBsPreview(); };
    r.append(l, s); body.append(r);
  };
  const check = (label, value, set) => {
    const r = document.createElement('label'); r.className = 'bs-row';
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = value;
    c.onchange = () => { set(c.checked); drawBsPreview(); };
    r.append(c, document.createTextNode(label)); body.append(r);
  };
  const CTL = [['off', '关'], ['fade', '渐隐'], ['pressure', '钢笔压力'], ['tilt', '钢笔斜度'], ['rotation', '旋转']];
  normalizeDynamics(d);
  const on = k => () => { if (!d[k].on) { d[k].on = true; renderBrushSettings(); } };
  if (bsPage === 'tip') {
    const list = document.createElement('div'); list.className = 'br-preset-list'; list.style.maxHeight = '110px'; body.append(list); renderPresetList(list);
    check('翻转 X', !!d.shape.flipXFixed, v => { d.shape.flipXFixed = v; });
    check('翻转 Y', !!d.shape.flipYFixed, v => { d.shape.flipYFixed = v; });
    slider('角度', () => brush.angle, v => { brush.angle = v; }, -180, 180, '°', 1);
    slider('圆度', () => brush.roundness, v => { brush.roundness = Math.max(.01, v); }, 1, 100);
    slider('大小', () => brush.size, v => { brush.size = Math.max(1, Math.round(v)); }, 1, 1000, ' 像素', 1);
    slider('硬度', () => brush.hardness, v => { brush.hardness = v; }, 0, 100);
    slider('间距', () => brush.spacing, v => { brush.spacing = Math.max(.01, v); }, 1, 1000);
  } else if (bsPage === 'shape') {
    const s = d.shape, o = on('shape');
    slider('大小抖动', () => s.sizeJitter, v => { s.sizeJitter = v; o(); }, 0, 100);
    select('控制', s.sizeCtl, CTL, v => { s.sizeCtl = v; o(); });
    slider('渐隐步数', () => s.fadeSteps, v => { s.fadeSteps = Math.max(1, Math.round(v)); }, 1, 200, '', 1);
    slider('最小直径', () => s.minDiameter, v => { s.minDiameter = v; o(); }, 0, 100);
    slider('角度抖动', () => s.angleJitter, v => { s.angleJitter = v; o(); }, 0, 100);
    select('控制', s.angleCtl, [['off', '关'], ['fade', '渐隐'], ['pressure', '钢笔压力'], ['tilt', '钢笔斜度'], ['rotation', '旋转'], ['initial', '初始方向'], ['direction', '方向']], v => { s.angleCtl = v; o(); });
    slider('圆度抖动', () => s.roundJitter, v => { s.roundJitter = v; o(); }, 0, 100);
    select('控制', s.roundCtl || 'off', CTL, v => { s.roundCtl = v; o(); });
    slider('最小圆度', () => s.minRound, v => { s.minRound = v; o(); }, 1, 100);
    check('翻转 X 抖动', s.flipX, v => { s.flipX = v; o(); });
    check('翻转 Y 抖动', s.flipY, v => { s.flipY = v; o(); });
  } else if (bsPage === 'scatter') {
    const s = d.scatter, o = on('scatter');
    slider('散布', () => s.amount, v => { s.amount = v; o(); }, 0, 1000);
    check('两轴', s.both, v => { s.both = v; o(); });
    select('控制', s.ctl, [['off', '关'], ['pressure', '钢笔压力']], v => { s.ctl = v; o(); });
    slider('数量', () => s.count, v => { s.count = Math.max(1, Math.round(v)); o(); }, 1, 16, '', 1);
    slider('数量抖动', () => s.countJitter, v => { s.countJitter = v; o(); }, 0, 100);
  } else if (bsPage === 'color') {
    const s = d.color, o = on('color');
    check('应用每笔尖', s.perTip, v => { s.perTip = v; });
    slider('前景/背景抖动', () => s.fgbg, v => { s.fgbg = v; o(); }, 0, 100);
    slider('色相抖动', () => s.hue, v => { s.hue = v; o(); }, 0, 100);
    slider('饱和度抖动', () => s.sat, v => { s.sat = v; o(); }, 0, 100);
    slider('亮度抖动', () => s.bri, v => { s.bri = v; o(); }, 0, 100);
    slider('纯度', () => s.purity, v => { s.purity = v; o(); }, -100, 100);
  } else if (bsPage === 'transfer') {
    const s = d.transfer, o = on('transfer');
    slider('不透明度抖动', () => s.opJitter, v => { s.opJitter = v; o(); }, 0, 100);
    select('控制', s.opCtl, CTL, v => { s.opCtl = v; o(); });
    slider('流量抖动', () => s.flowJitter, v => { s.flowJitter = v; o(); }, 0, 100);
    select('控制', s.flowCtl, CTL, v => { s.flowCtl = v; o(); });
  } else if (bsPage === 'texture') {
    
    const s = d.texture, o = on('texture');
    const pats = bsPatternList();
    const r = document.createElement('div'); r.className = 'bs-row';
    const l = document.createElement('span'); l.textContent = '图案';
    const sel = document.createElement('select'); sel.dataset.attr = 'bs-texture-pattern';
    if (!pats.length) sel.append(Object.assign(document.createElement('option'), { value: '', textContent: '（图案库是空的：先定义或导入图案）' }));
    for (const p of pats) sel.append(Object.assign(document.createElement('option'), { value: p.id, textContent: p.name || p.id }));
    if (s.pattern && !pats.some(p => p.id === s.pattern)) sel.append(Object.assign(document.createElement('option'), { value: s.pattern, textContent: (s.patternName || s.pattern) + '（缺失）' }));
    sel.value = s.pattern || (pats[0] && pats[0].id) || '';
    if (!s.pattern && pats[0]) { s.pattern = pats[0].id; s.patternName = pats[0].name; }
    sel.onchange = () => { const p = pats.find(x => x.id === sel.value); s.pattern = sel.value; s.patternName = p ? p.name : ''; texLumCache.delete(sel.value); o(); drawBsPreview(); };
    r.append(l, sel); body.append(r);
    check('反相', !!s.invert, v => { s.invert = v; o(); });
    slider('缩放', () => s.scale, v => { s.scale = Math.max(.01, v); o(); }, 1, 1000);
    slider('亮度', () => s.brightness, v => { s.brightness = v; o(); }, -150, 150, '', 1);
    slider('对比度', () => s.contrast, v => { s.contrast = v; o(); }, -50, 100, '', 1);
    check('为每个笔尖设置纹理', s.eachTip !== false, v => { s.eachTip = v; o(); renderBrushSettings(); });
    select('模式', s.mode, TEXTURE_MODES, v => { s.mode = v; o(); });
    slider('深度', () => s.depth, v => { s.depth = v; o(); }, 0, 100);
    if (s.eachTip !== false) {
      slider('最小深度', () => s.minDepth, v => { s.minDepth = v; o(); }, 0, 100);
      slider('深度抖动', () => s.depthJitter, v => { s.depthJitter = v; o(); }, 0, 100);
      select('控制', s.depthCtl || 'off', CTL, v => { s.depthCtl = v; o(); });
    }
  } else if (bsPage === 'dual') {
    
    const s = d.dual, o = on('dual');
    select('模式', s.mode, DUAL_MODES, v => { s.mode = v; o(); });
    check('翻转', !!s.flip, v => { s.flip = v; o(); });
    const list = document.createElement('div'); list.className = 'br-preset-list'; list.style.maxHeight = '96px'; body.append(list);
    for (const g of brushLib.pickerGroups('')) {
      const items = document.createElement('div'); items.className = 'bp-items';
      for (const p of g.items) {
        const it = document.createElement('div'); it.title = p.label;
        const cur = p.rec && p.rec.sample ? s.sample && s.sample.id === p.rec.sample.id : !s.sample && s.tip === p.tip && Math.abs((s.hardness ?? 1) - p.hardness) < 1e-6;
        it.className = 'bp-item' + (cur ? ' on' : '');
        const cv = document.createElement('canvas'); cv.width = cv.height = 30; drawPresetThumb(cv, p.tip, p.hardness, 0, 1);
        it.append(cv, Object.assign(document.createElement('span'), { textContent: String(p.size) }));
        it.onclick = () => { s.tip = p.tip; s.hardness = p.hardness; s.size = p.size; s.sample = p.rec && p.rec.sample ? p.rec.sample : null; if (!s.sample) delete s.sample; o(); renderBrushSettings(); };
        items.append(it);
      }
      list.append(items);
    }
    slider('大小', () => s.size, v => { s.size = Math.max(1, Math.round(v)); o(); }, 1, 1000, ' 像素', 1);
    slider('间距', () => s.spacing, v => { s.spacing = Math.max(.01, v); o(); }, 1, 1000);
    slider('散布', () => s.scatter, v => { s.scatter = v; o(); }, 0, 1000);
    check('两轴', !!s.both, v => { s.both = v; o(); });
    slider('数量', () => s.count, v => { s.count = Math.max(1, Math.round(v)); o(); }, 1, 16, '', 1);
  } else if (bsPage === 'pose') {
    
    const s = d.pose, o = on('pose');
    slider('倾斜 X', () => s.tiltX, v => { s.tiltX = Math.round(v); o(); }, -100, 100, '%', 1);
    check('覆盖倾斜 X', !!s.overTiltX, v => { s.overTiltX = v; o(); });
    slider('倾斜 Y', () => s.tiltY, v => { s.tiltY = Math.round(v); o(); }, -100, 100, '%', 1);
    check('覆盖倾斜 Y', !!s.overTiltY, v => { s.overTiltY = v; o(); });
    slider('旋转', () => s.rotation, v => { s.rotation = Math.round(v); o(); }, 0, 360, '°', 1);
    check('覆盖旋转', !!s.overRotation, v => { s.overRotation = v; o(); });
    slider('压力', () => s.pressure, v => { s.pressure = Math.max(.01, v); o(); }, 1, 100);
    check('覆盖压力', !!s.overPressure, v => { s.overPressure = v; o(); });
  } else {
    const h = document.createElement('h4');
    h.textContent = { protect: '保护纹理：切换到其它带纹理的画笔预设时，沿用当前的图案与缩放（勾选左侧即生效）', noise: '杂色：在软边上加随机颗粒（勾选左侧即生效）', wet: '湿边：颜料堆积在边缘、中间变透（勾选左侧即生效）',
      build: '建立：喷枪式持续上色（与选项栏喷枪按钮同一开关，Alt+Shift+P）', smooth: '平滑：见选项栏「平滑」百分比与齿轮里的选项' }[bsPage] || '';
    body.append(h);
  }
  const pv = document.createElement('canvas'); pv.className = 'bs-preview'; pv.width = 240; pv.height = 56; body.append(pv);
  wrap.append(nav, body);
  host.replaceChildren(wrap);
  try { BSX.decorate(host, nav, pages); } catch {}
  drawBsPreview();
}

function bsPatternList(){
  const out = (presets.lib.patterns || []).map(p => ({ id: p.id, name: p.name }));
  for (const p of (doc && doc.patterns) || []) if (!p._lib && !out.some(x => x.id === p.id)) out.push({ id: p.id, name: p.name });
  return out;
}

function drawBsPreview(){
  const host = bsPanelEl(); const cv = host && host.querySelector('canvas.bs-preview'); if (!cv) return;
  const w = cv.width, h = cv.height;
  const buf = new Uint8ClampedArray(w * h * 4);
  const S = { target: 'pixels', idx: -1, buf, base: new Uint8ClampedArray(w * h * 4), w, h, ox: 0, oy: 0, M: [1, 0, 0, 1, 0, 0], inv: [1, 0, 0, 1, 0, 0], px: 4, color: [0, 0, 0], erase: false, lockAlpha: false };
  const sz = Math.min(brush.size, h * .55);
  strokeSetup(S, { x: 14, y: h / 2 }, { size: sz, noSel: true, tool: 'brush' });
  S.sym = null; S.fancy = S.shaped || !!S.dyn || S.dynBase.pressureSize || S.dynBase.pressureOpacity;
  emitDab(S, 14, h / 2, 1);
  for (let x = 16; x <= w - 14; x += 2) strokeTo(S, { x, y: h / 2 + Math.sin((x - 14) / (w - 28) * Math.PI * 2) * h * .22, p: .2 + .8 * Math.sin((x - 14) / (w - 28) * Math.PI) });
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
  ctx.drawImage(tmp, 0, 0);
}


function historyWhy(){
  if (historySourceInfo && (historySourceInfo.width !== docW || historySourceInfo.height !== docH)) return '历史源的文档尺寸与当前不同，请在历史记录面板重新设源';
  const src = historySourceFor(selLayer), pp = pixelPaint[selLayer], dl = doc.layers[selLayer];
  if (!src || src.w !== (pp?.w || dl.width) || src.h !== (pp?.h || dl.height) || src.left !== (pp?.left ?? dl.bounds.left) || src.top !== (pp?.top ?? dl.bounds.top))
    return '历史源与当前图层尺寸或原点不同（这一层在源状态之后长大 / 挪动过），请在历史记录面板重新设源';
  return '';
}




export function beginEraserStroke(pt, ev){
  const o = { tool: 'eraser', opacity: effOpacity('eraser'), flow: effFlow('eraser') };
  if (eraserOpts.mode === 'block') {
    
    Object.assign(o, { size: Math.max(1, 16 / zoom), hardness: 1, aliased: true, tip: 'square', angle: 0, roundness: 1, dyn: null,
      opacity: 1, flow: 1, pressureSize: false, pressureOpacity: false });
  } else if (eraserOpts.mode === 'pencil') Object.assign(o, { hardness: 1, aliased: true });
  const toHist = (eraserOpts.toHistory || (ev && ev.altKey)) && brushTarget() === 'pixels' && !qmask;
  if (!toHist) return beginStroke(pt, o);
  const why = paintGuard() || historyWhy();
  if (why) { $('#err').textContent = '抹到历史记录用不了：' + why; return null; }
  const S = beginStroke(pt, { ...o, erase: false, deferDab: true, op: 'historyBrush' });
  if (!S) return null;
  S.historySource = historySourceFor(selLayer); S.label = '橡皮擦（抹到历史记录）';
  S.opFn = brushOpFn('historyBrush', S);
  emitDab(S, pt.x, pt.y, S.lastP);
  return S;
}

export function layerPixelAt(pt){
  const pp = pixelPaint[selLayer], dl = doc && doc.layers[selLayer]; if (!dl) return null;
  if (pp?.sparse) return null;
  const data = pp ? pp.rgba : dl.rgba, w = pp ? pp.w : dl.width, h = pp ? pp.h : dl.height; if (!data || !w) return null;
  const map = paintMap(selLayer, w, h, pp ? pp.left : dl.bounds.left, pp ? pp.top : dl.bounds.top); if (!map) return null;
  const iv = map.inv, x = Math.floor(iv[0] * pt.x + iv[2] * pt.y + iv[4]), y = Math.floor(iv[1] * pt.x + iv[3] * pt.y + iv[5]);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const o = (y * w + x) * 4; return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}
export function beginPencilStroke(pt){
  let color;
  if (pencilOpts.autoErase && brushTarget() === 'pixels') {
    
    const c = layerPixelAt(pt);
    if (c && c[3] > 0 && Math.max(Math.abs(c[0] - fgRGB[0]), Math.abs(c[1] - fgRGB[1]), Math.abs(c[2] - fgRGB[2])) <= 2) color = bgRGB.slice();
  }
  return beginStroke(pt, { hardness: 1, aliased: true, color, tool: 'pencil', opacity: effOpacity('pencil'), flow: 1 });
}








export const ADJ_BRUSH_KINDS = ['brightnessContrast', 'exposure', 'hueSaturation', 'vibrance', 'blackWhite', 'photoFilter'];
export const adjBrushOpts = { kind: 'brightnessContrast', subtract: false, overlay: false };
export let adjBrushPending = null, adjOverlayCache = null;
export function set_adjOverlayCache(v) { return (adjOverlayCache = v); }   
function adjBrushLayerOK(idx){
  const L = layerTree && layerTree.flat && layerTree.flat[idx], dl = doc && doc.layers[idx];
  if (!L || !dl || !L.adjustment || L.adjustment.kind === 'fill') return false;
  const kinds = ADJ_KINDS_MENU[adjBrushOpts.kind];
  const key = String(L.adjustment.key || '').trim();
  if (kinds && kinds.blocks && !kinds.blocks.some(b => String(b).trim() === key)) return false;
  return !!(dl.mask || maskPaint[idx]);
}
async function createAdjBrushLayer(kind){
  if (!doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, '调整画笔')) return false;
  const label = (ADJ_KINDS_MENU[kind] || {}).label || kind;
  const at = selLayer >= 0 ? selLayer + 1 : doc.layers.length;
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) base = (await buildPsdBuffer({ fast: true })).buf;
    base = await ensureStructuralBase(base);
    const values = kind === 'brightnessContrast' ? { useLegacy: true } : null;   
    const ops = [{ op: 'addAdjustmentLayer', kind, at, name: label, ...(values ? { values } : {}) },
      
      { op: 'addLayerMask', index: at, fill: 'hide', compact: docW * docH > 64e6, bounds: { top: 0, left: 0, bottom: docH, right: docW }, defaultColor: 0 }];
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, `调整画笔：新建${label}图层`);
    revealPropsPanel();
    return true;
  } catch (e) { $('#err').textContent = `调整画笔没能新建「${label}」调整图层：` + humanEditError(e && e.message || e); return false; }
}
function beginAdjMaskStroke(pt){
  const t = $('#brTarget'); if (t) t.value = 'mask';
  return beginStroke(pt, { tone: adjBrushOpts.subtract ? 0 : 255, tool: 'adjBrush', opacity: 1, flow: effFlow('adjBrush'), label: '调整画笔' });
}
export async function adjBrushDown(ev, pt){
  pt.p = paintPressure(ev);
  if (adjBrushLayerOK(selLayer)) {
    const S = beginAdjMaskStroke(pt);
    if (S) { S.label = '调整画笔'; try { gizmo.setPointerCapture(ev.pointerId); } catch {} startPaintGesture(S, ev, pt); scheduleStrokeRepaint(S); adjOverlayCache = null; }
    else syncBrushPanel();
    return;
  }
  if (adjBrushOpts.subtract) { shell.status('「减去」要在已有的调整画笔图层上用：先用「添加」刷出一个调整图层'); return; }
  if (adjBrushPending) return;
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  const pend = adjBrushPending = { pts: [{ ...pt }], down: true };
  drawGizmo();
  shell.status('调整画笔：正在新建调整图层…');
  const ok = await createAdjBrushLayer(adjBrushOpts.kind);
  adjBrushPending = null;
  if (!ok) { drawGizmo(); return; }
  const S = beginAdjMaskStroke(pend.pts[0]);
  if (!S) { drawGizmo(); return; }
  S.label = '调整画笔';
  for (let i = 1; i < pend.pts.length; i++) strokeTo(S, pend.pts[i]);
  adjOverlayCache = null;
  if (pend.down) { startPaintGesture(S, null, pend.pts[pend.pts.length - 1]); scheduleStrokeRepaint(S); }
  else { S.forced = true; endStroke(); repaintStrokeLayer(S); syncBrushPanel(); }
}

function drawAdjPending(ctx){
  const p = adjBrushPending; if (!p || !p.pts.length) return;
  ctx.save(); ctx.strokeStyle = 'rgba(255,0,200,.35)'; ctx.lineWidth = brush.size; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(p.pts[0].x, p.pts[0].y); for (const q of p.pts) ctx.lineTo(q.x, q.y); ctx.lineTo(p.pts[p.pts.length - 1].x + .01, p.pts[p.pts.length - 1].y);
  ctx.stroke(); ctx.restore();
}

function drawAdjOverlay(ctx){
  if (docTool !== 'adjBrush' || !adjBrushOpts.overlay || !doc || !adjBrushLayerOK(selLayer)) return;
  const mp = ensureMaskPaint(selLayer); if (!mp) return;
  const key = selLayer + ':' + mp.w + 'x' + mp.h;
  if (!adjOverlayCache || adjOverlayCache.key !== key || adjOverlayCache.dirty) {
    const cv = adjOverlayCache && adjOverlayCache.key === key ? adjOverlayCache.cv : document.createElement('canvas');
    cv.width = mp.w; cv.height = mp.h;
    const id = new ImageData(mp.w, mp.h), d = id.data;
    for (let i = 0; i < mp.gray.length; i++) { const o = i * 4; d[o] = 255; d[o + 1] = 0; d[o + 2] = 200; d[o + 3] = mp.gray[i] >> 1; }
    cv.getContext('2d').putImageData(id, 0, 0);
    adjOverlayCache = { key, cv, dirty: false };
  }
  ctx.drawImage(adjOverlayCache.cv, mp.docLeft, mp.docTop);
}

export function drawPaintExtras(ctx){
  if (li || !doc) return;
  if (curStroke && curStroke.target === 'mask' && adjOverlayCache) adjOverlayCache.dirty = true;
  drawAdjOverlay(ctx); drawAdjPending(ctx); drawSymmetryPath(ctx); drawSmoothLeash(ctx); drawBrushHud(ctx);
}
