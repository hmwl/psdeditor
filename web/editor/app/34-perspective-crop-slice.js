




import './33-lasso-quick-select.js';   
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, QUADM, QUADW, kick } from './01-boot.js';
import { doc, docH, docW, guides, li, set_guides, set_guidesDirty, slicesLocked } from './02-doc-state.js';
import { docHistory, docSnapshot, histPush, pushDocHistory, updateUndoButtons } from './03-history.js';
import { padL, padT, viewH, viewW } from './04-view-chrome.js';
import { applyDocSize, docResolution, set_docResolution } from './08-doc-size.js';
import { cropExtGen, cropOpts, cropShieldRGB, mid, set_cropExtGen } from './10-crop.js';
import { pointInQuadLocal } from './20-snap-smart-object.js';
import { docTool, mapAuxGeometry } from './31-selection-brush.js';
import { dispPx, modKeys } from './32-cursors-select-options.js';
import { dispThr, drawGizmo } from './46-smart-filter-panel.js';
import { mapCanvasGeometry } from './51-image-select-menu.js';
















export let pcropState = null;      
const PCROP_GRID = { on: true };

export const pcropOpts = { w: '', h: '', res: '', resUnit: 'in' };
export let pcropHover = null;      
export function set_pcropHover(v) { return (pcropHover = v); }   


function pcropOrder(pts){
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const withAng = pts.map(p => ({ p, a: Math.atan2(p[1] - cy, p[0] - cx) }));
  withAng.sort((u, v) => u.a - v.a);                 
  
  let best = 0, bestD = Infinity;
  withAng.forEach((o, i) => { const d = o.p[0] + o.p[1]; if (d < bestD) { bestD = d; best = i; } });
  return withAng.slice(best).concat(withAng.slice(0, best)).map(o => o.p);
}

export function pcropConvex(q){
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return sign !== 0;
}

function pcropNaturalSize(q){
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const w = (len(q[0], q[1]) + len(q[3], q[2])) / 2;
  const h = (len(q[0], q[3]) + len(q[1], q[2])) / 2;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

function pcropOutSize(q){
  const nat = pcropNaturalSize(q);
  const w = Math.round(+pcropOpts.w) || 0, h = Math.round(+pcropOpts.h) || 0;
  if (w && h) return { w, h };
  if (w) return { w, h: Math.max(1, Math.round(w * nat.h / nat.w)) };
  if (h) return { w: Math.max(1, Math.round(h * nat.w / nat.h)), h };
  return nat;
}
export function pcropSyncOut(){
  const st = pcropState; if (!st || !st.pts) return;
  if (!st.sizeLocked) st.out = pcropOutSize(st.pts);
}
function beginPCrop(q){
  const pts = pcropOrder(q.map(p => [p[0], p[1]]));
  pcropState = { pts, drag: null, out: pcropNaturalSize(pts), sizeLocked: false };
  pcropSyncOut();
  QUADW.load().catch(() => {});
  syncPCropBar(); drawGizmo();
  return true;
}

function pcropHandleAt(pt){
  if (!pcropState || !pcropState.pts) return -1;
  const r = Math.max(dispThr(8), 4), q = pcropState.pts;
  for (let i = 0; i < 4; i++) if (Math.hypot(pt.x - q[i][0], pt.y - q[i][1]) <= r) return i;
  for (let i = 0; i < 4; i++) { const m = mid(q[i], q[(i + 1) % 4]); if (Math.hypot(pt.x - m[0], pt.y - m[1]) <= r) return 'e' + i; }
  if (pointInQuadLocal(q, pt.x, pt.y)) return 'move';
  return -1;
}
export function pcropDown(ev, pt){
  if (!doc || li) return;
  const st = pcropState;
  if (st && st.clicks) {                              
    st.clicks.push([pt.x, pt.y]);
    if (st.clicks.length === 4) {
      const q = st.clicks;
      pcropState = null; pcropHover = null;
      beginPCrop(q);
      if (!pcropConvex(pcropState.pts)) shell.status('这四个点围不成凸四边形：拖角把它摆开再提交');
      else shell.status('透视裁剪：拖四个角 / 四条边去对齐画面里「本该是矩形」的那个东西，Enter 提交、Esc 放弃');
    }
    drawGizmo(); return;
  }
  if (st && st.pts) {
    const h = pcropHandleAt(pt);
    if (h !== -1) { st.drag = h; st.from = { ...pt }; st.pts0 = st.pts.map(p => p.slice()); return; }
    
  }
  pcropState = { pts: null, drag: 'rect', rect: { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }, out: { w: 1, h: 1 }, sizeLocked: false };
  drawGizmo();
}
export function pcropMove(pt){
  const st = pcropState; if (!st) return;
  if (st.drag === 'rect') { st.rect.x1 = pt.x; st.rect.y1 = pt.y; drawGizmo(); return; }
  if (st.drag == null) return;
  const dx = st.from ? pt.x - st.from.x : 0, dy = st.from ? pt.y - st.from.y : 0;
  if (typeof st.drag === 'number') st.pts[st.drag] = [pt.x, pt.y];
  else if (st.drag === 'move') st.pts = st.pts0.map(p => [p[0] + dx, p[1] + dy]);
  else if (typeof st.drag === 'string' && st.drag[0] === 'e') {
    const i = +st.drag.slice(1), j = (i + 1) % 4;
    st.pts[i] = [st.pts0[i][0] + dx, st.pts0[i][1] + dy]; st.pts[j] = [st.pts0[j][0] + dx, st.pts0[j][1] + dy];
  }
  pcropSyncOut();
  syncPCropBar(); drawGizmo();
}
export function pcropUp(){
  const st = pcropState; if (!st) return false;
  if (st.drag === 'rect') {
    const r = st.rect;
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
    const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    if (x1 - x0 < 4 || y1 - y0 < 4) {
      
      pcropState = { pts: null, drag: null, clicks: [[r.x0, r.y0]], out: { w: 1, h: 1 }, sizeLocked: false };
      shell.status('透视裁剪：再单击三下放下其余三个角（Esc 放弃）');
      drawGizmo(); syncPCropBar(); return false;
    }
    beginPCrop([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    shell.status('透视裁剪：拖四个角 / 四条边去对齐画面里「本该是矩形」的那个东西，Enter 提交、Esc 放弃');
    return true;
  }
  st.drag = null; st.from = null; st.pts0 = null;
  drawGizmo();
  return true;
}
export function cancelPCrop(){ if (!pcropState) return false; pcropState = null; pcropHover = null; syncPCropBar(); drawGizmo(); return true; }

export function commitPCrop(){
  const st = pcropState;
  if (!st || !st.pts) return false;
  if (!QUADM) { kick(QUADW); $('#notice').textContent = '自由变换内核还没到位（投影矩阵要用它），稍等一下再提交。'; return false; }
  if (!pcropConvex(st.pts)) {
    $('#notice').textContent = '这四个角围不成一个凸四边形（边交叉了），摆正之后画面会翻面 —— 把角拖开再提交。';
    return false;
  }
  const w = Math.max(1, Math.min(30000, Math.round(st.out.w)));
  const h = Math.max(1, Math.min(30000, Math.round(st.out.h)));
  
  let M = null;
  try { const F = QUADM.quadMatrix(w, h, st.pts.map(p => [p[0], p[1]])); M = F ? QUADM.invert3(F) : null; }
  catch { M = null; }
  if (!M) { $('#notice').textContent = '这四个角解不出投影矩阵（可能三点共线），换个摆法再试。'; return false; }
  pushDocHistory('透视裁剪');
  

  let skipped = 0;
  const map = p => { const o = QUADM.applyMatrix(M, p[0], p[1]); if (!o) { skipped++; return [p[0], p[1]]; } return o; };
  mapCanvasGeometry(map);
  mapAuxGeometry(map);
  set_guides([]);                                  
  set_guidesDirty(true);
  const res = +pcropOpts.res > 0 ? +pcropOpts.res * (pcropOpts.resUnit === 'cm' ? 2.54 : 1) : 0;
  if (res) set_docResolution(Math.round(res * 100) / 100);
  set_cropExtGen(cropExtGen + 1);
  pcropState = null;
  applyDocSize(w, h);
  syncPCropBar();
  shell.status(`透视裁剪：已把选中的四边形摆正成 ${w} × ${h} 像素${res ? ` · ${docResolution} 像素/英寸` : ''}（每层记的是投影变换，像素没被破坏）`
    + (skipped ? ` · 有 ${skipped} 个角落在消失线上，那几层没动` : ''));
  return true;
}
export function drawPCropGizmo(ctx){
  const st = pcropState; if (!st || docTool !== 'cropPerspective') return;
  ctx.save();
  ctx.lineWidth = dispPx(1);
  if (st.drag === 'rect' && st.rect) {
    const r = st.rect;
    ctx.setLineDash([dispPx(4), dispPx(3)]);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.strokeRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
    ctx.restore(); return;
  }
  if (st.clicks) {                                   
    const pts = st.clicks.concat(pcropHover ? [[pcropHover.x, pcropHover.y]] : []);
    for (const [color, dash] of [['rgba(0,0,0,.85)', []], ['rgba(255,255,255,.95)', [dispPx(4), dispPx(3)]]]) {
      ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    }
    ctx.setLineDash([]);
    const r = dispThr(4);
    for (const p of st.clicks) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); ctx.strokeRect(p[0] - r, p[1] - r, r * 2, r * 2); }
    ctx.restore(); return;
  }
  const q = st.pts; if (!q) { ctx.restore(); return; }
  
  if (cropOpts.shield) {
    ctx.beginPath(); ctx.rect(-padL(), -padT(), viewW(), viewH());
    ctx.moveTo(q[0][0], q[0][1]); for (let k = 3; k >= 1; k--) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath();
    ctx.fillStyle = cropShieldRGB(); ctx.globalAlpha = Math.max(0, Math.min(100, cropOpts.shieldOpacity)) / 100 * (st.drag != null && cropOpts.autoOpacity ? .55 : 1);
    ctx.fill('evenodd'); ctx.globalAlpha = 1;
  }
  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  
  if (PCROP_GRID.on) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    const nat = pcropNaturalSize(q);
    const cells = Math.max(2, Math.min(24, Math.round(Math.min(nat.w, nat.h) / Math.max(1, dispThr(40)))));
    let F = null; try { F = QUADM && QUADM.quadMatrix(1, 1, q.map(p => [p[0], p[1]])); } catch { F = null; }
    const P = (u, v) => { if (F) { const o = QUADM.applyMatrix(F, u, v); if (o) return o; }
      const a = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u], b = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
      return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; };
    for (let k = 1; k < cells; k++) { const t = k / cells; line(P(t, 0), P(t, 1)); line(P(0, t), P(1, t)); }
  }
  
  for (const [color, dash] of [['rgba(0,0,0,.85)', []], ['rgba(255,255,255,.95)', [dispPx(4), dispPx(3)]]]) {
    ctx.strokeStyle = color; ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
    ctx.closePath(); ctx.stroke();
  }
  ctx.setLineDash([]);
  const r = dispThr(4);
  const handles = q.concat(q.map((p, i) => mid(p, q[(i + 1) % 4])));
  for (const p of handles) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
    ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    ctx.strokeRect(p[0] - r, p[1] - r, r * 2, r * 2);
  }
  ctx.restore();
}
export function syncPCropBar(){
  const g = $('#grpPCrop'); if (!g) return;
  g.hidden = docTool !== 'cropPerspective' || !!li;
  const st = pcropState;
  const wI = $('#pcW'), hI = $('#pcH'), rI = $('#pcRes'), ruI = $('#pcResUnit'), info = $('#pcInfo'), ok = $('#pcOk'), cancel = $('#pcCancel');
  if (wI && document.activeElement !== wI) wI.value = pcropOpts.w;
  if (hI && document.activeElement !== hI) hI.value = pcropOpts.h;
  if (rI && document.activeElement !== rI) rI.value = pcropOpts.res;
  if (ruI) ruI.value = pcropOpts.resUnit;
  for (const el of [ok, cancel]) if (el) el.disabled = !st;
  if (info) info.textContent = !doc ? '先打开一个 PSD'
    : !st ? '拖一个框（或逐个单击四个角），再把四个角对到「本该是矩形」的东西上'
    : st.clicks ? `已放 ${st.clicks.length} / 4 个角`
    : !st.pts ? '松手之后就能拖四个角'
    : pcropConvex(st.pts) ? `摆正成 ${st.out.w} × ${st.out.h}（Enter 提交 / Esc 放弃）`
    : '四个角交叉了：这样摆正会把画面翻面，先把角拖开';
  if (g.dataset.bound) return;
  g.dataset.bound = '1';
  const refresh = () => { if (pcropState && pcropState.pts) { pcropState.sizeLocked = false; pcropSyncOut(); } syncPCropBar(); drawGizmo(); };
  const bindNum = (el, key, max) => {
    if (!el) return;
    el.addEventListener('change', () => {
      const v = Math.round(+el.value || 0);
      pcropOpts[key] = v > 0 ? String(Math.min(max, v)) : '';
      refresh();
    });
  };
  bindNum(wI, 'w', 30000); bindNum(hI, 'h', 30000); bindNum(rI, 'res', 10000);
  if (ruI) ruI.addEventListener('change', () => { pcropOpts.resUnit = ruI.value; ruI.blur(); });
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', () => { fn(); try { el.blur(); } catch {} }); };
  on('#pcSwap', () => { [pcropOpts.w, pcropOpts.h] = [pcropOpts.h, pcropOpts.w]; refresh(); });
  on('#pcFront', () => { pcropOpts.w = String(docW); pcropOpts.h = String(docH); pcropOpts.res = String(Math.round(docResolution)); pcropOpts.resUnit = 'in'; refresh(); });
  on('#pcClear', () => { pcropOpts.w = ''; pcropOpts.h = ''; pcropOpts.res = ''; refresh(); });
  if (ok) ok.addEventListener('click', () => commitPCrop());
  if (cancel) cancel.addEventListener('click', () => cancelPCrop());
  const grid = $('#pcGrid');
  if (grid) { grid.checked = PCROP_GRID.on; grid.addEventListener('change', () => { PCROP_GRID.on = grid.checked; drawGizmo(); grid.blur(); }); }
}














export let docSlices = null;        
export function set_docSlices(v) { return (docSlices = v); }   
export let slicesDirty = false;
export function set_slicesDirty(v) { return (slicesDirty = v); }   
export let sliceSel = -1;           
export function set_sliceSel(v) { return (sliceSel = v); }   
export let sliceDrag = null;        
export function set_sliceDrag(v) { return (sliceDrag = v); }   
export const sliceOpts = { show: true, style: 'normal', w: 1, h: 1, hideAuto: false };

const SLICE_ORIGIN = { user: 0, layer: 1, auto: 2 };

function freshSliceModel(){
  return { version: 6, bounds: { top: 0, left: 0, bottom: docH, right: docW }, groupName: '',
           __noNul: {}, slices: [], _extra: null, readOnly: false };
}
export function sliceModel(){
  if (!docSlices) docSlices = freshSliceModel();
  return docSlices;
}
export const userSlices = () => (docSlices ? docSlices.slices : []);

export function sliceWriteWhy(){
  if (!doc) return '先打开一个文档';
  if (li) return '正在编辑智能对象：先退回文档视图';
  if (slicesLocked) return '切片已锁定（视图 › 锁定切片）';
  if (docSlices && docSlices.readOnly)
    return `这份文件里的切片表是 PS 7 之后的描述符版（v${docSlices.version}）—— 本编辑器只写得了经典的 v6 表，改了会丢掉里面的导出设置，所以这份只读`;
  return '';
}
function nextSliceId(){
  let m = 0;
  for (const s of userSlices()) if (s.id > m) m = s.id;
  return m + 1;
}

export function makeSlice(rect, name){
  const id = nextSliceId();
  return {
    id, groupId: 0, origin: SLICE_ORIGIN.user, name: name || `切片 ${id}`, type: 0,
    bounds: { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h },
    url: '', target: '', message: '', altTag: '',
    cellTextIsHTML: false, cellText: '',
    horizontalAlignment: 0, verticalAlignment: 0,
    alpha: 0, red: 0, green: 0, blue: 0,
    
    
    __noNul: { name: true, url: true, target: true, message: true, altTag: true, cellText: true },
  };
}
export const sliceRect = s => ({ x: s.bounds.left, y: s.bounds.top, w: s.bounds.right - s.bounds.left, h: s.bounds.bottom - s.bounds.top });




export function autoSlices(){
  if (!doc) return [];
  const xs = new Set([0, docW]), ys = new Set([0, docH]);
  for (const s of userSlices()) {
    for (const v of [s.bounds.left, s.bounds.right]) if (v > 0 && v < docW) xs.add(v);
    for (const v of [s.bounds.top, s.bounds.bottom]) if (v > 0 && v < docH) ys.add(v);
  }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  const covered = (x, y) => userSlices().some(s => x >= s.bounds.left && x < s.bounds.right && y >= s.bounds.top && y < s.bounds.bottom);
  const out = [];
  

  for (let j = 0; j + 1 < Y.length; j++) {
    const y = Y[j], h = Y[j + 1] - y;
    if (h <= 0) continue;
    let run = null;
    for (let i = 0; i + 1 < X.length; i++) {
      const x = X[i], w = X[i + 1] - x;
      if (w <= 0) continue;
      if (covered(x + w / 2, y + h / 2)) { if (run) { out.push(run); run = null; } continue; }
      if (run) run.w = x + w - run.x; else run = { x, y, w, h };
    }
    if (run) out.push(run);
  }
  return out;
}

export function allSlices(){
  const u = userSlices().map((s, i) => ({ kind: 'user', at: i, rect: sliceRect(s), name: s.name, id: s.id }));
  const a = autoSlices().map((r, i) => ({ kind: 'auto', at: i, rect: r, name: '', id: 0 }));
  return [...u, ...a].map((s, i) => ({ ...s, no: i + 1 }));
}
function sliceChanged(label){
  slicesDirty = true;
  syncSliceBar(); drawGizmo();
  if (label) shell.status(label);
}

export function sliceHit(pt){
  const u = userSlices();
  for (let i = u.length - 1; i >= 0; i--) {
    const r = sliceRect(u[i]);
    if (pt.x >= r.x && pt.y >= r.y && pt.x < r.x + r.w && pt.y < r.y + r.h) return { kind: 'user', at: i, rect: r };
  }
  const a = autoSlices();
  for (let i = 0; i < a.length; i++) {
    const r = a[i];
    if (pt.x >= r.x && pt.y >= r.y && pt.x < r.x + r.w && pt.y < r.y + r.h) return { kind: 'auto', at: i, rect: r };
  }
  return null;
}

function sliceHandleAt(pt){
  if (sliceSel < 0 || !userSlices()[sliceSel]) return null;
  const r = sliceRect(userSlices()[sliceSel]);
  const t = Math.max(dispThr(5), 3);
  const nearX = [r.x, r.x + r.w / 2, r.x + r.w], nearY = [r.y, r.y + r.h / 2, r.y + r.h];
  const NAMES = [['nw', 'n', 'ne'], ['w', '', 'e'], ['sw', 's', 'se']];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (!NAMES[j][i]) continue;
    if (Math.abs(pt.x - nearX[i]) <= t && Math.abs(pt.y - nearY[j]) <= t) return NAMES[j][i];
  }
  return null;
}
export function clampSliceRect(r){
  const x = Math.max(0, Math.min(docW - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(docH - 1, Math.round(r.y)));
  const w = Math.max(1, Math.min(docW - x, Math.round(r.w)));
  const h = Math.max(1, Math.min(docH - y, Math.round(r.h)));
  return { x, y, w, h };
}
function setSliceRect(at, r){
  const s = userSlices()[at]; if (!s) return false;
  const c = clampSliceRect(r);
  s.bounds = { left: c.x, top: c.y, right: c.x + c.w, bottom: c.y + c.h };
  return true;
}




function sliceNewRect(d){
  const st = sliceOpts.style;
  if (st === 'fixed') {
    const w = Math.max(1, Math.round(+sliceOpts.w || 1)), h = Math.max(1, Math.round(+sliceOpts.h || 1));
    return d.alt ? { x: d.x1 - w / 2, y: d.y1 - h / 2, w, h } : { x: d.x1, y: d.y1, w, h };
  }
  let w = d.x1 - d.x0, h = d.y1 - d.y0;
  const ratio = st === 'ratio' ? Math.max(1e-6, +sliceOpts.w || 1) / Math.max(1e-6, +sliceOpts.h || 1) : d.shift ? 1 : 0;
  if (ratio > 0) {
    if (Math.abs(w) / Math.max(1e-6, Math.abs(h)) > ratio) w = Math.sign(w || 1) * Math.abs(h) * ratio;
    else h = Math.sign(h || 1) * Math.abs(w) / ratio;
  }
  if (d.alt) return { x: d.x0 - Math.abs(w), y: d.y0 - Math.abs(h), w: Math.abs(w) * 2, h: Math.abs(h) * 2 };
  return { x: w < 0 ? d.x0 + w : d.x0, y: h < 0 ? d.y0 + h : d.y0, w: Math.abs(w), h: Math.abs(h) };
}
export function sliceDown(ev, pt){
  const why = sliceWriteWhy();
  if (why) { $('#notice').textContent = why; return; }
  sliceModel();
  sliceDrag = { kind: 'new', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, shift: !!ev.shiftKey, alt: !!ev.altKey };
  drawGizmo();
}

export function sliceSelectDown(ev, pt){
  const hit = sliceHit(pt);
  const handle = sliceHandleAt(pt);
  if (handle && !sliceWriteWhy()) {
    const r = sliceRect(userSlices()[sliceSel]);
    sliceDrag = { kind: 'resize', handle, base: r, from: { ...pt }, snap: docSnapshot() };
    return;
  }
  if (!hit) { sliceSel = -1; lastAutoHit = null; sliceChanged(); return; }
  if (hit.kind === 'auto') {
    sliceSel = -1;
    lastAutoHit = hit;
    sliceChanged(`这是自动切片（第 ${hit.at + 1} 块）—— 点「提升」把它变成可编辑的用户切片`);
    return;
  }
  lastAutoHit = null;
  sliceSel = hit.at;
  if (!sliceWriteWhy()) sliceDrag = { kind: 'move', base: hit.rect, from: { ...pt }, snap: docSnapshot(), copy: !!ev.altKey };
  sliceChanged();
}
export let lastAutoHit = null;
export function set_lastAutoHit(v) { return (lastAutoHit = v); }   
export function sliceMove(pt){
  const d = sliceDrag; if (!d) return;
  if (d.kind === 'new') { d.x1 = pt.x; d.y1 = pt.y; d.shift = !!modKeys.shift; d.alt = !!modKeys.alt; drawGizmo(); return; }
  let dx = pt.x - d.from.x, dy = pt.y - d.from.y;
  if (Math.abs(dx) + Math.abs(dy) > 0.5 && !d.moved) {
    d.moved = true;
    if (d.snap) { docHistory.undo.push(d.snap); docHistory.redo.length = 0; histPush(d.kind === 'move' ? (d.copy ? '复制切片' : '移动切片') : '调整切片大小', 'doc'); updateUndoButtons(); }
    if (d.kind === 'move' && d.copy) {                  
      const src = userSlices()[sliceSel];
      const c = makeSlice(sliceRect(src)); for (const k of ['url', 'target', 'message', 'altTag']) c[k] = src[k];
      userSlices().push(c); sliceSel = userSlices().length - 1;
    }
  }
  if (d.kind === 'move' && modKeys.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }   
  if (d.kind === 'move') { setSliceRect(sliceSel, { ...d.base, x: d.base.x + dx, y: d.base.y + dy }); drawGizmo(); return; }
  if (d.kind === 'resize') {
    const b = d.base;
    let x = b.x, y = b.y, w = b.w, h = b.h;
    if (d.handle.includes('w')) { x = b.x + dx; w = b.w - dx; }
    if (d.handle.includes('e')) { w = b.w + dx; }
    if (d.handle.includes('n')) { y = b.y + dy; h = b.h - dy; }
    if (d.handle.includes('s')) { h = b.h + dy; }
    if (w < 1) { x = x + w - 1; w = 1; }
    if (h < 1) { y = y + h - 1; h = 1; }
    setSliceRect(sliceSel, { x, y, w, h });
    drawGizmo();
  }
}
export function sliceUp(){
  const d = sliceDrag; sliceDrag = null;
  if (!d) return false;
  if (d.kind === 'new') {
    const r = clampSliceRect(sliceNewRect(d));
    if (r.w < 2 || r.h < 2) { drawGizmo(); shell.status('切片太小了（至少 2×2 像素）'); return false; }
    pushDocHistory('新建切片');
    sliceModel().slices.push(makeSlice(r));
    sliceSel = userSlices().length - 1;
    sliceChanged(`新建切片「${userSlices()[sliceSel].name}」${r.w}×${r.h}`);
    return true;
  }
  if (!d.moved) { drawGizmo(); return true; }
  sliceChanged(d.kind === 'move' ? (d.copy ? '复制切片' : '移动切片') : '调整切片大小');
  return true;
}

function sliceArrangeUI(how){
  if (sliceWriteWhy() || sliceSel < 0) return false;
  const list = userSlices(), n = list.length, i = sliceSel;
  const j = how === 'top' ? n - 1 : how === 'bottom' ? 0 : how === 'up' ? Math.min(n - 1, i + 1) : Math.max(0, i - 1);
  if (j === i) return false;
  pushDocHistory('调整切片顺序');
  const [s] = list.splice(i, 1); list.splice(j, 0, s);
  sliceSel = j;
  sliceChanged({ top: '置为顶层', bottom: '置为底层', up: '前移一层', down: '后移一层' }[how]);
  return true;
}

export function nudgeSliceUI(dx, dy){
  if (sliceWriteWhy() || sliceSel < 0 || !userSlices()[sliceSel]) return false;
  pushDocHistory('移动切片');
  const r = sliceRect(userSlices()[sliceSel]);
  setSliceRect(sliceSel, { ...r, x: r.x + dx, y: r.y + dy });
  sliceChanged();
  return true;
}
export function deleteSliceUI(){
  if (sliceWriteWhy() || sliceSel < 0 || !userSlices()[sliceSel]) return false;
  pushDocHistory('删除切片');
  const nm = userSlices()[sliceSel].name;
  userSlices().splice(sliceSel, 1);
  sliceSel = -1;
  sliceChanged(`删除切片「${nm}」`);
  return true;
}

export function promoteSliceUI(){
  const why = sliceWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  if (!lastAutoHit) { shell.status('先在画布上点一块自动切片（灰色号码的那种），再点「提升」'); return false; }
  pushDocHistory('提升为用户切片');
  sliceModel().slices.push(makeSlice(clampSliceRect(lastAutoHit.rect)));
  sliceSel = userSlices().length - 1;
  lastAutoHit = null;
  sliceChanged(`已提升为用户切片「${userSlices()[sliceSel].name}」`);
  return true;
}

export function slicesFromGuidesUI(){
  const why = sliceWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  const xs = [0, ...guides.filter(g => g.vertical).map(g => g.px), docW];
  const ys = [0, ...guides.filter(g => !g.vertical).map(g => g.px), docH];
  const X = [...new Set(xs.map(v => Math.max(0, Math.min(docW, Math.round(v)))))].sort((a, b) => a - b);
  const Y = [...new Set(ys.map(v => Math.max(0, Math.min(docH, Math.round(v)))))].sort((a, b) => a - b);
  if (X.length < 2 || Y.length < 2) { $('#notice').textContent = '这份文档里没有参考线，切不出网格。'; return false; }
  pushDocHistory('基于参考线的切片');
  const m = sliceModel();
  m.slices.length = 0;                          
  for (let j = 0; j + 1 < Y.length; j++) for (let i = 0; i + 1 < X.length; i++) {
    const r = { x: X[i], y: Y[j], w: X[i + 1] - X[i], h: Y[j + 1] - Y[j] };
    if (r.w > 0 && r.h > 0) m.slices.push(makeSlice(r));
  }
  sliceSel = -1;
  sliceChanged(`基于参考线切出 ${m.slices.length} 块切片（${X.length - 1} × ${Y.length - 1}）`);
  return true;
}

let sliceDivDlgEl = null;
export async function divideSliceUI(){
  const why = sliceWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  const s = userSlices()[sliceSel];
  if (!s) { $('#notice').textContent = '先用切片选择工具选中一块用户切片。'; return false; }
  const r = sliceRect(s);
  if (!sliceDivDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:320px">'
      + '<h3 class="fp-dlg-title">划分切片</h3><div class="sdDlg-body"></div>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    sliceDivDlgEl = dlg;
  }
  const body = sliceDivDlgEl.querySelector('.sdDlg-body');
  body.innerHTML = '';
  const num = (attr, label, max) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    row.append(Object.assign(document.createElement('span'), { textContent: label, style: 'flex:1' }));
    const el = document.createElement('input');
    el.type = 'number'; el.min = '1'; el.max = String(Math.max(1, max)); el.step = '1'; el.value = '2';
    el.dataset.attr = attr; el.style.width = '64px';
    row.append(el); body.append(row);
    return el;
  };
  const nxI = num('slice-div-x', '水平划分为（纵向切片）', r.w);
  const nyI = num('slice-div-y', '垂直划分为（横向切片）', r.h);
  const hint = document.createElement('p');
  hint.style.cssText = 'opacity:.7;font-size:12px;margin:6px 0 0';
  hint.textContent = `这块切片 ${r.w} × ${r.h} —— 每份至少 1 像素，所以最多分成 ${r.w} × ${r.h} 份。`;
  body.append(hint);
  return await new Promise(res => {
    const done = v => { try { sliceDivDlgEl.close(); } catch { sliceDivDlgEl.removeAttribute('open'); } res(v); };
    sliceDivDlgEl.querySelector('.fp-dlg-ok').onclick = () => {
      const nx = Math.max(1, Math.min(r.w, Math.round(+nxI.value || 1)));
      const ny = Math.max(1, Math.min(r.h, Math.round(+nyI.value || 1)));
      if (nx * ny === 1) { done(false); return; }
      pushDocHistory('划分切片');
      const m = sliceModel();
      m.slices.splice(sliceSel, 1);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = r.x + Math.round(r.w * i / nx), y = r.y + Math.round(r.h * j / ny);
        const x2 = r.x + Math.round(r.w * (i + 1) / nx), y2 = r.y + Math.round(r.h * (j + 1) / ny);
        m.slices.push(makeSlice({ x, y, w: x2 - x, h: y2 - y }));
      }
      sliceSel = -1;
      sliceChanged(`划分成 ${nx} × ${ny} = ${nx * ny} 块`);
      done(true);
    };
    sliceDivDlgEl.querySelector('.fp-dlg-cancel').onclick = () => done(false);
    sliceDivDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!sliceDivDlgEl.open) { if (sliceDivDlgEl.showModal) sliceDivDlgEl.showModal(); else sliceDivDlgEl.setAttribute('open', ''); } }
    catch { sliceDivDlgEl.setAttribute('open', ''); }
  });
}

let sliceOptDlgEl = null;
export async function sliceOptionsUI(){
  const s = userSlices()[sliceSel];
  if (!s) { $('#notice').textContent = '先用切片选择工具选中一块用户切片。'; return false; }
  const ro = !!sliceWriteWhy();
  if (!sliceOptDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:360px">'
      + '<h3 class="fp-dlg-title">切片选项</h3><div class="slDlg-body"></div>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    sliceOptDlgEl = dlg;
  }
  const body = sliceOptDlgEl.querySelector('.slDlg-body');
  body.innerHTML = '';
  const FIELDS = [['name', '名称'], ['url', 'URL'], ['target', '目标'], ['message', '信息文本'], ['altTag', 'Alt 标记']];
  const inputs = {};
  for (const [key, label] of FIELDS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    row.append(Object.assign(document.createElement('span'), { textContent: label, style: 'min-width:64px' }));
    const el = document.createElement('input');
    el.type = 'text'; el.dataset.attr = 'slice-' + key; el.style.flex = '1';
    el.value = s[key] || ''; el.disabled = ro;
    row.append(el); body.append(row);
    inputs[key] = el;
  }
  const dim = document.createElement('p');
  dim.style.cssText = 'opacity:.7;font-size:12px;margin:6px 0 0';
  const r = sliceRect(s);
  dim.textContent = `尺寸 ${r.w} × ${r.h}，位置 ${r.x}, ${r.y}` + (ro ? ' · 只读：' + sliceWriteWhy() : '');
  body.append(dim);
  return await new Promise(res => {
    const done = v => { try { sliceOptDlgEl.close(); } catch { sliceOptDlgEl.removeAttribute('open'); } res(v); };
    sliceOptDlgEl.querySelector('.fp-dlg-ok').onclick = () => {
      if (ro) { done(false); return; }
      pushDocHistory('切片选项');
      for (const [key] of FIELDS) s[key] = inputs[key].value;
      if (!s.name) s.name = `切片 ${s.id}`;
      sliceChanged(`切片「${s.name}」的选项已更新`);
      done(true);
    };
    sliceOptDlgEl.querySelector('.fp-dlg-cancel').onclick = () => done(false);
    sliceOptDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!sliceOptDlgEl.open) { if (sliceOptDlgEl.showModal) sliceOptDlgEl.showModal(); else sliceOptDlgEl.setAttribute('open', ''); } }
    catch { sliceOptDlgEl.setAttribute('open', ''); }
  });
}

export function drawSliceGizmo(ctx){
  if (li || !doc) return;
  const active = docTool === 'slice' || docTool === 'sliceSelect';
  if (!active || !sliceOpts.show) return;
  const list = allSlices();
  ctx.save();
  ctx.lineWidth = dispPx(1);
  for (const s of list) {
    const r = s.rect;
    const user = s.kind === 'user';
    if (!user && sliceOpts.hideAuto) continue;          
    ctx.setLineDash(user ? [] : [dispPx(3), dispPx(3)]);
    const slc = PREF.get('guides.sliceColor') || '#3c8cff';
    ctx.strokeStyle = user ? slc : 'rgba(170,170,170,.8)';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (!PREF.get('guides.sliceNumbers')) continue;   
    
    const bw = dispPx(16), bh = dispPx(11);
    ctx.setLineDash([]);
    ctx.fillStyle = user ? slc : 'rgba(150,150,150,.9)';
    ctx.fillRect(r.x, r.y, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.font = `${dispPx(8)}px sans-serif`;
    ctx.textBaseline = 'top';
    try { ctx.fillText(String(s.no), r.x + dispPx(2), r.y + dispPx(1.5)); } catch {}
  }
  
  if (docTool === 'sliceSelect' && sliceSel >= 0 && userSlices()[sliceSel]) {
    const r = sliceRect(userSlices()[sliceSel]);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,220,0,.95)';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const t = dispThr(3);
    for (const [hx, hy] of [[r.x, r.y], [r.x + r.w / 2, r.y], [r.x + r.w, r.y],
                            [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2],
                            [r.x, r.y + r.h], [r.x + r.w / 2, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
      ctx.fillRect(hx - t, hy - t, t * 2, t * 2);
      ctx.strokeRect(hx - t, hy - t, t * 2, t * 2);
    }
  }
  
  if (sliceDrag && sliceDrag.kind === 'new') {
    ctx.setLineDash([dispPx(4), dispPx(3)]);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    const r = sliceNewRect(sliceDrag);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}
export function syncSliceBar(){
  const g = $('#grpSlice'); if (!g) return;
  const on = docTool === 'slice' || docTool === 'sliceSelect';
  g.hidden = !on;
  if (!on) return;
  
  const selTool = docTool === 'sliceSelect';
  const show = (id, v) => { const el = $(id); if (el) el.hidden = !v; };
  show('#slStyleWrap', !selTool); show('#slSizeWrap', !selTool && sliceOpts.style !== 'normal'); show('#slFromGuides', !selTool);
  for (const id of ['#slOrderWrap', '#slPromote', '#slDivide', '#slHideAuto', '#slDelete']) show(id, selTool);
  show('#slOptions', true);
  const why = sliceWriteWhy();
  const sel = sliceSel >= 0 ? userSlices()[sliceSel] : null;
  const setDis = (id, dis, tip) => { const el = $(id); if (!el) return; el.disabled = dis; if (tip) el.title = tip; };
  setDis('#slPromote', !!why || !lastAutoHit, why || '提升：把选中的自动切片变成用户切片');
  setDis('#slDivide', !!why || !sel, why || '划分切片：把选中的切片横竖均分');
  setDis('#slDelete', !!why || !sel, why || '删除选中的切片（Delete）');
  setDis('#slOptions', !sel, sel ? '为当前切片设置选项（名称 / URL / 目标 / 信息文本 / Alt 标记）；双击切片同效' : '先选中一块用户切片');
  setDis('#slFromGuides', !!why || !guides.length, why || (guides.length ? '按现有参考线把画布切成网格' : '这份文档里没有参考线'));
  const n = userSlices().length;
  setDis('#slTop', !!why || !sel || sliceSel === n - 1); setDis('#slUp', !!why || !sel || sliceSel === n - 1);
  setDis('#slDown', !!why || !sel || sliceSel === 0); setDis('#slBottom', !!why || !sel || sliceSel === 0);
  const ha = $('#slHideAuto'); if (ha) { ha.textContent = sliceOpts.hideAuto ? '显示自动切片' : '隐藏自动切片'; ha.classList.toggle('on', sliceOpts.hideAuto); }
  if ($('#slStyle') && document.activeElement !== $('#slStyle')) $('#slStyle').value = sliceOpts.style;
  if ($('#slW') && document.activeElement !== $('#slW')) $('#slW').value = sliceOpts.w;
  if ($('#slH') && document.activeElement !== $('#slH')) $('#slH').value = sliceOpts.h;
  const info = $('#slInfo');
  if (info) {
    const u = userSlices().length, a = autoSlices().length;
    info.textContent = why ? why
      : sel ? `「${sel.name}」 ${sliceRect(sel).w}×${sliceRect(sel).h} @${sliceRect(sel).x},${sliceRect(sel).y} · 共 ${u} 块用户切片 + ${a} 块自动切片`
      : `共 ${u} 块用户切片 + ${a} 块自动切片` + (docTool === 'slice' ? ' —— 拖一个框就是一块新切片（按住 ⌘/Ctrl 临时切换到切片选择）' : ' —— 点一块来选中它（按住 ⌘/Ctrl 临时切换到切片工具）');
    info.title = why || '文件里只存用户切片；自动切片是按用户切片的边切出来的空格子，PS 也是这样显示的';
  }
  if (g.dataset.bound) return;
  g.dataset.bound = '1';
  const on2 = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', e => { fn(e); try { el.blur(); } catch {} }); };
  on2('#slPromote', () => promoteSliceUI());
  on2('#slDivide', () => divideSliceUI());
  on2('#slDelete', () => deleteSliceUI());
  on2('#slOptions', () => sliceOptionsUI());
  on2('#slFromGuides', () => slicesFromGuidesUI());
  on2('#slTop', () => sliceArrangeUI('top')); on2('#slUp', () => sliceArrangeUI('up'));
  on2('#slDown', () => sliceArrangeUI('down')); on2('#slBottom', () => sliceArrangeUI('bottom'));
  on2('#slHideAuto', () => { sliceOpts.hideAuto = !sliceOpts.hideAuto; syncSliceBar(); drawGizmo(); });
  const st = $('#slStyle');
  if (st) st.addEventListener('change', () => {
    sliceOpts.style = st.value;
    if (st.value === 'fixed' && (+sliceOpts.w || 1) <= 1 && (+sliceOpts.h || 1) <= 1) { sliceOpts.w = 64; sliceOpts.h = 64; }   
    if (st.value === 'ratio' && !(+sliceOpts.w > 0)) { sliceOpts.w = 1; sliceOpts.h = 1; }
    syncSliceBar(); st.blur();
  });
  for (const [id, k] of [['#slW', 'w'], ['#slH', 'h']]) { const el = $(id); if (el) el.addEventListener('change', () => { sliceOpts[k] = Math.max(1, Math.round(+el.value || 1)); syncSliceBar(); }); }
  const sh = $('#slShow');
  if (sh) { sh.checked = sliceOpts.show; sh.addEventListener('change', () => { sliceOpts.show = sh.checked; drawGizmo(); sh.blur(); }); }
}
