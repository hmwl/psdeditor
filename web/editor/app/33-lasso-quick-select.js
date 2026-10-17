




import './32-cursors-select-options.js';   
import { LiveWire, snapToEdge, arcLength, indexAtArc } from '../../../core/live-wire.js';
import { formDialog } from '../dialog.js';
import { panels } from '../panels.js';
import { shell } from '../shell.js';
import {
  $, SELECT, SELM, combineSelection, isEmptySelection, kick, lassoSelection, rectSelection, selectionArea,
  selectionBounds, smoothSelection,
} from './01-boot.js';
import { doc, docH, docW, li, selection, set_selection } from './02-doc-state.js';
import { selLayer } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import { docTool } from './31-selection-brush.js';
import {
  SEL_MODE_OWN, combineInto, effSelMode, modKeys, sampleRGBAViewport, selBarIcon, selOpts, selReady,
  setSelection, shiftViewportSelection, strokeAnts, syncGizmoCursor, syncSelModeBtns, updateSelInfo,
} from './32-cursors-select-options.js';
import { AB_BAR_ICONS } from './36-clipboard-frame.js';
import { smOpen } from './40-options-bar-wiring.js';
import { dispThr, drawGizmo } from './46-smart-filter-panel.js';







export let polyLasso = null;             
export function set_polyLasso(v) { return (polyLasso = v); }   


function snap45(a, p){
  const dx = p.x - a.x, dy = p.y - a.y, L = Math.hypot(dx, dy);
  if (!L) return { x: p.x, y: p.y };
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  
  const ux = Math.cos(ang), uy = Math.sin(ang), t = dx * ux + dy * uy;
  return { x: a.x + ux * t, y: a.y + uy * t };
}
export function polyLassoDown(ev, pt){
  if (!selReady('多边形套索')) return;
  if (!polyLasso) { polyLasso = { tool: docTool, pts: [{ x: pt.x, y: pt.y }], mode: effSelMode(ev), cur: { x: pt.x, y: pt.y }, free: false }; drawGizmo(); return; }
  const st = polyLasso;
  const q = ev.shiftKey ? snap45(st.pts[st.pts.length - 1], pt) : { x: pt.x, y: pt.y };
  
  if ((ev.metaKey || ev.ctrlKey) && st.pts.length >= 2) { st.pts.push(q); closePolyLasso(); return; }
  const p0 = st.pts[0];
  const near = Math.hypot(pt.x - p0.x, pt.y - p0.y) <= Math.max(dispThr(8), 3);
  if (near && st.pts.length >= 3) { closePolyLasso(); return; }
  st.pts.push(q);
  st.cur = { ...q };
  
  st.free = !!ev.altKey || !!st.fromLasso;
  drawGizmo();
}
export function polyLassoMove(ev, pt){
  const st = polyLasso; if (!st) return;
  if (st.free && ev.buttons) {
    const last = st.pts[st.pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 1) st.pts.push({ x: pt.x, y: pt.y });
    st.cur = { x: pt.x, y: pt.y };
  } else st.cur = ev.shiftKey ? snap45(st.pts[st.pts.length - 1], pt) : { x: pt.x, y: pt.y };
  drawGizmo();
}

export function polyLassoUp(ev){
  const st = polyLasso; if (!st || !st.free) return false;
  st.free = false;
  if (st.fromLasso && !(ev && ev.altKey)) closePolyLasso();
  else drawGizmo();
  return true;
}
export function closePolyLasso(){
  const st = polyLasso; polyLasso = null;
  if (!st) return false;
  if (st.pts.length < 3) { drawGizmo(); return false; }
  try {
    const v = docW * docH > 64e6 ? sampleRGBAViewport(false) : { x: 0, y: 0, width: docW, height: docH };
    const pts = st.pts.map(p => ({ x: p.x - v.x, y: p.y - v.y }));
    combineInto(shiftViewportSelection(lassoSelection(v.width, v.height, pts, selOpts()), v.x, v.y), st.mode);
  }
  catch (e) { $('#err').textContent = '这个选区建不起来：' + humanEditError(e && e.message || e); drawGizmo(); }
  return true;
}
export function cancelPolyLasso(){ polyLasso = null; drawGizmo(); }

















export const magOpts = { width: 10, contrast: 10, frequency: 57, pen: false };
export let magHover = null;   

export function magEffWidth(){
  const p = magOpts.pen && magHover && magHover.pressure > 0 ? magHover.pressure : 0;
  return p ? Math.max(1, Math.round(magOpts.width * (1 - 0.9 * p))) : magOpts.width;
}
export function magHoverAt(ev, pt){
  const caps = !!(ev.getModifierState && ev.getModifierState('CapsLock'));
  const pressure = ev.pointerType === 'pen' ? ev.pressure : 0;
  const was = magHover;
  magHover = { x: pt.x, y: pt.y, caps, pressure };
  if (caps || (was && was.caps)) drawGizmo();
}
export let magLasso = null;   


export function magBuildCost(){
  

  let img = null;
  try { img = sampleRGBAViewport(true); } catch { img = null; }
  if (!img || !img.data || !img.width || !img.height) return null;
  return img;
}
const magEvery = () => Math.max(4, Math.round(100 / (1 + magOpts.frequency / 10)));   
function magWire(st, seed){
  st.wire = new LiveWire(st.cost.data, st.cost.width, st.cost.height,
    { x: seed.x - st.cost.x, y: seed.y - st.cost.y }, { contrast: magOpts.contrast, radius: Math.max(96, magEvery() * 4 + magOpts.width * 2) });
  return st.wire;
}

function magPath(st, a, b){
  if (!st.cost) return [a, b];
  if (!st.wire || st.wire.seed.x !== a.x - st.cost.x || st.wire.seed.y !== a.y - st.cost.y || st.wire.contrast !== magOpts.contrast) magWire(st, a);
  let p = null;
  try { p = st.wire.pathTo({ x: b.x - st.cost.x, y: b.y - st.cost.y }); } catch { p = null; }
  return p && p.length > 1 ? p.map(q => ({ x: q.x + st.cost.x, y: q.y + st.cost.y })) : [a, b];
}

function magSnap(st, p){
  if (!st.cost) return p;
  try { const s = snapToEdge(st.cost.data, st.cost.width, st.cost.height, p.x - st.cost.x, p.y - st.cost.y, { ...magOpts, width: magEffWidth() }); return { x: s.x + st.cost.x, y: s.y + st.cost.y }; }
  catch { return p; }
}
export const magRound = p => ({ x: Math.max(0, Math.min(docW - 1, Math.round(p.x))), y: Math.max(0, Math.min(docH - 1, Math.round(p.y))) });
export function magLassoDown(ev, pt){
  if (!selReady('磁性套索')) return;
  const raw = magRound(pt);
  if (!magLasso) {                                   
    const cost = magBuildCost();
    const st = { anchors: [], anchorIdx: [], path: [], preview: [], cur: raw, target: raw, mode: effSelMode(ev), cost, wire: null };
    const p = magSnap(st, raw);
    st.anchors.push(p); st.anchorIdx.push(0); st.path.push(p); st.target = p;
    magLasso = st;
    shell.status(cost ? '磁性套索：沿着边缘移动鼠标（不用按住），点一下落固定点，双击 / Enter 闭合，Esc 放弃'
                      : '磁性套索：读不到画面像素，这一条会退化成直线段');
    drawGizmo();
    return;
  }
  const st = magLasso, p0 = st.anchors[0];
  if (st.path.length > 3 && Math.hypot(raw.x - p0.x, raw.y - p0.y) <= Math.max(dispThr(8), 3)) { closeMagLasso(); return; }
  
  if (ev.altKey) {
    st.preview = [st.anchors[st.anchors.length - 1], raw];
    magCommit(st, 1);
    st.freeSeg = true;
    st.cur = st.target = raw;
    drawGizmo();
    return;
  }
  
  st.preview = magPath(st, st.anchors[st.anchors.length - 1], raw);
  magCommit(st, st.preview.length - 1);
  st.cur = st.target = raw;
  drawGizmo();
}

function magCommit(st, k){
  const seg = st.preview && st.preview.length > 1 ? st.preview : null;
  if (!seg) return;
  k = Math.max(1, Math.min(seg.length - 1, k));
  for (let i = 1; i <= k; i++) st.path.push(seg[i]);
  const a = seg[k];
  st.anchors.push(a); st.anchorIdx.push(st.path.length - 1);
  st.preview = seg.slice(k);
  st.wire = null;
}
export function magLassoMove(pt, ev){
  const st = magLasso; if (!st) return;
  const raw = magRound(pt);
  st.cur = raw;
  
  if ((ev ? ev.altKey : modKeys.alt)) { st.target = raw; st.preview = [st.anchors[st.anchors.length - 1], raw]; st.wire = null; drawGizmo(); return; }
  const t = magSnap(st, raw);
  st.target = t;
  st.preview = magPath(st, st.anchors[st.anchors.length - 1], t);
  

  if (st.cost) {
    const every = magEvery();
    let guard = 0;
    while (st.preview.length > 2 && arcLength(st.preview) >= every * 1.5 && guard++ < 64) {
      magCommit(st, indexAtArc(st.preview, every));
      st.preview = magPath(st, st.anchors[st.anchors.length - 1], t);
    }
  } else {
    const a = st.anchors[st.anchors.length - 1];
    if (Math.hypot(raw.x - a.x, raw.y - a.y) >= magEvery()) { magCommit(st, 1); st.preview = [raw, raw]; }
  }
  drawGizmo();
}

export function closeMagLasso(){
  const st = magLasso; magLasso = null;
  if (!st) return false;
  const pts = st.path.slice();
  if (st.preview && st.preview.length > 1) for (let i = 1; i < st.preview.length; i++) pts.push(st.preview[i]);
  const last = pts[pts.length - 1], first = st.anchors[0];
  if (st.cost && (last.x !== first.x || last.y !== first.y)) {
    st.wire = null;
    const back = magPath(st, last, first);
    for (let i = 1; i < back.length; i++) pts.push(back[i]);
  }
  if (pts.length < 3) { drawGizmo(); return false; }
  try {
    const v = st.cost || { x: 0, y: 0, width: docW, height: docH };
    const local = pts.map(p => ({ x: p.x - v.x, y: p.y - v.y }));
    combineInto(shiftViewportSelection(lassoSelection(v.width, v.height, local, selOpts()), v.x, v.y), st.mode);
  }
  catch (e) { $('#err').textContent = '这个选区建不起来：' + humanEditError(e && e.message || e); drawGizmo(); }
  return true;
}
export function cancelMagLasso(){ magLasso = null; drawGizmo(); }

export function magFreeMove(pt){
  const st = magLasso; if (!st) return;
  const raw = magRound(pt), last = st.path[st.path.length - 1];
  if (raw.x !== last.x || raw.y !== last.y) st.path.push(raw);
  st.cur = st.target = raw; st.preview = [raw, raw];
  drawGizmo();
}

export function magFreeEnd(){
  const st = magLasso; if (!st) return;
  st.freeSeg = false;
  const last = st.path[st.path.length - 1], a = st.anchors[st.anchors.length - 1];
  if (last.x !== a.x || last.y !== a.y) { st.anchors.push(last); st.anchorIdx.push(st.path.length - 1); }
  st.wire = null; st.preview = [last, last];
  drawGizmo();
}

export function magUndoAnchor(){
  const st = magLasso; if (!st) return false;
  if (st.anchors.length <= 1) { cancelMagLasso(); return true; }
  st.anchors.pop(); st.anchorIdx.pop();
  st.path.length = st.anchorIdx[st.anchorIdx.length - 1] + 1;
  st.wire = null;
  st.preview = magPath(st, st.anchors[st.anchors.length - 1], st.target || st.cur);
  drawGizmo();
  return true;
}











const QS_TOOLS = new Set(['quickSelect', 'objectSelect']);


export const qsOpts = { size: 30, tolerance: 24, edge: 10, sampleAll: false, enhance: false, method: 'cluster' };
export const osOpts = { mode: 'rect', tolerance: 28, edge: 18, fillHoles: true, sampleAll: false, hard: false, finder: true, objSub: true, showAll: false, method: 'cluster' };


export function osSegment(px, rect, o){
  const W = o.width || docW, H = o.height || docH;
  const flood = () => SELM.objectSelection(px, W, H, rect, { tolerance: o.tolerance ?? osOpts.tolerance, edgeThreshold: o.edgeThreshold ?? osOpts.edge / 100,
    fillHoles: o.fillHoles ?? osOpts.fillHoles, edges: o.edges, region: o.region, bgSides: o.bgSides });
  if (osOpts.method === 'flood') return flood();
  const sel = SELM.objectSelectionCluster(px, W, H, rect, { region: o.region, fillHoles: o.fillHoles ?? osOpts.fillHoles, bgSides: o.bgSides });
  return sel && !isEmptySelection(sel) ? sel : flood();
}
export let qsState = null;      
export function set_qsState(v) { return (qsState = v); }   
export let osState = null;      
export function set_osState(v) { return (osState = v); }   
export let qsEdgeCache = null;  
export function set_qsEdgeCache(v) { return (qsEdgeCache = v); }   



export function qsSample(all){
  let px = null;
  try { px = sampleRGBAViewport(all !== false || selLayer < 0); } catch { px = null; }
  if (!px) return null;
  if (qsEdgeCache && qsEdgeCache.px === px.data) return qsEdgeCache;
  let edges = null;
  try { edges = SELM ? SELM.edgeStrength(px.data, px.width, px.height) : null; } catch { edges = null; }
  qsEdgeCache = { px: px.data, width: px.width, height: px.height, ox: px.x, oy: px.y, edges };
  return qsEdgeCache;
}

function qsStampLine(mask, a, b, r, width = docW, height = docH){
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, r / 2)));
  for (let s = 0; s <= steps; s++) {
    const cx = a.x + (b.x - a.x) * s / steps, cy = a.y + (b.y - a.y) * s / steps;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * width + x] = 1;
  }
}


export function quickSelDown(ev, pt){
  if (!selReady('快速选择')) return;
  if (!SELM) { kick(SELECT); shell.status(SELECT.statusText()); return; }
  const s = qsSample(qsOpts.sampleAll);
  if (!s) { $('#notice').textContent = '读不到画面像素，快速选择用不了。'; return; }
  const p = { x: Math.max(0, Math.min(docW - 1, Math.round(pt.x))), y: Math.max(0, Math.min(docH - 1, Math.round(pt.y))) };
  const q = { x: p.x - s.ox, y: p.y - s.oy };
  qsState = { mask: new Uint8Array(s.width * s.height), edges: s.edges, px: s.px,
    width: s.width, height: s.height, ox: s.ox, oy: s.oy, mode: effSelMode(ev), last: q, base: selection };
  qsStampLine(qsState.mask, q, q, Math.max(1, qsOpts.size / 2), s.width, s.height);
  qsApply();
}
export function quickSelMove(pt){
  const st = qsState; if (!st) return;
  const p = { x: Math.max(0, Math.min(st.width - 1, Math.round(pt.x - st.ox))), y: Math.max(0, Math.min(st.height - 1, Math.round(pt.y - st.oy))) };
  if (p.x === st.last.x && p.y === st.last.y) return;
  qsStampLine(st.mask, st.last, p, Math.max(1, qsOpts.size / 2), st.width, st.height);
  st.last = p;
  
  if (!st.raf) st.raf = requestAnimationFrame(() => { if (qsState === st) { st.raf = 0; qsApply(); } });
}


function qsApply(){
  const st = qsState; if (!st) return;
  let sel = null;
  try {
    const qo = { tolerance: qsOpts.tolerance, edgeThreshold: qsOpts.edge / 100, antialias: true, edges: st.edges };
    sel = qsOpts.method === 'flood' ? SELM.quickSelectFromMask(st.px, st.width, st.height, st.mask, qo) : SELM.quickSelectCluster(st.px, st.width, st.height, st.mask, qo);
    sel = shiftViewportSelection(sel, st.ox, st.oy);
  } catch (e) { $('#err').textContent = '快速选择没算出来：' + humanEditError(e && e.message || e); return; }
  

  if (qsOpts.enhance && sel && !isEmptySelection(sel)) {
    try { sel = smoothSelection(sel, 2); sel = SELM.refineEdgeSelection(sel, st.px, docW, docH, { radius: 2 }); } catch {}
  }
  const next = st.base ? combineSelection(st.base, sel, st.mode === 'replace' ? 'replace' : st.mode) : (st.mode === 'subtract' ? null : sel);
  setSelection(next, { history: false, props: false });
  updateSelInfo();
}
export function endQuickSel(){
  const st = qsState;
  if (!st) return false;
  if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; qsApply(); }   
  qsState = null;
  
  const result = selection;
  set_selection(st.base);
  setSelection(result, { label: '快速选择' });
  

  if (SEL_MODE_OWN.quickSelect === 'replace' && result) { SEL_MODE_OWN.quickSelect = 'add'; syncSelModeBtns(); }
  return true;
}


export function objSelDown(ev, pt){
  if (!selReady('对象选择')) return;
  if (!SELM) { kick(SELECT); shell.status(SELECT.statusText()); return; }
  const s = qsSample(osOpts.sampleAll);
  if (!s) { $('#notice').textContent = '读不到画面像素，对象选择用不了。'; return; }
  osState = { start: { ...pt }, cur: { ...pt }, pts: [{ ...pt }], mode: effSelMode(ev), edges: s.edges, px: s.px,
    width: s.width, height: s.height, ox: s.ox, oy: s.oy };
  drawGizmo();
}
export function objSelMove(pt){
  const st = osState; if (!st) return;
  st.cur = { ...pt };
  if (osOpts.mode === 'lasso') {
    const last = st.pts[st.pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 1) st.pts.push({ ...pt });
  }
  drawGizmo();
}

function osFinish(sel, mode, what, state = osState){
  if (state && (state.ox || state.oy)) sel = shiftViewportSelection(sel, state.ox, state.oy);
  if (osOpts.hard) { try { sel = SELM.hardenSelection(sel); } catch {} }
  combineInto(sel, mode);
  const pct = Math.round(selectionArea(sel) / (docW * docH) * 1000) / 10;
  shell.status(`${what}：${Math.round(selectionArea(sel))} 像素（占画布 ${pct}%）`);
  return true;
}
export function endObjSel(){
  const st = osState; osState = null;
  if (!st) { return false; }
  drawGizmo();
  const x0 = Math.min(st.start.x, st.cur.x), x1 = Math.max(st.start.x, st.cur.x);
  const y0 = Math.min(st.start.y, st.cur.y), y1 = Math.max(st.start.y, st.cur.y);
  
  if (Math.hypot(st.cur.x - st.start.x, st.cur.y - st.start.y) < dispThr(3)) {
    if (osOpts.finder && osFound && osHover > 0) {
      let sel = null;
      try { sel = SELM.objectFromLabels(osFound, docW, docH, osHover, { fillHoles: osOpts.fillHoles }); } catch { sel = null; }
      if (sel && !isEmptySelection(sel)) return osFinish(sel, st.mode, '对象查找程序：选中对象', st);
    }
    shell.status(osOpts.finder ? '这里没有找到对象 —— 拖一个框（或圈一圈）把物体框住' : '拖一个框（或圈一圈）把物体框住');
    return false;
  }
  let rect = { x: Math.round(x0 - st.ox), y: Math.round(y0 - st.oy), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  let region = null, shapeSel = null;
  if (osOpts.mode === 'lasso' && st.pts.length >= 3) {
    
    let lassoSel = null;
    const localPts = st.pts.map(p => ({ x: p.x - st.ox, y: p.y - st.oy }));
    try { lassoSel = lassoSelection(st.width, st.height, localPts, { antialias: false }); } catch { lassoSel = null; }
    if (!lassoSel || isEmptySelection(lassoSel)) { shell.status('这一圈太小，圈不出范围'); return false; }
    shapeSel = lassoSel;
    const b = selectionBounds(lassoSel);
    rect = { x: b.x, y: b.y, width: b.width, height: b.height };
    region = new Uint8Array(st.width * st.height);
    for (let y = 0; y < lassoSel.height; y++) for (let x = 0; x < lassoSel.width; x++)
      if (lassoSel.data[y * lassoSel.width + x] >= 128) region[(lassoSel.y + y) * st.width + (lassoSel.x + x)] = 1;
  }
  if (rect.width < 3 || rect.height < 3) { shell.status('框太小了（至少 3×3 像素）'); return false; }
  

  if (st.mode === 'subtract' && !osOpts.objSub) {
    const whole = shapeSel || rectSelection(st.width, st.height, rect.x, rect.y, rect.width, rect.height, { antialias: false });
    combineInto(whole, 'subtract');
    shell.status('对象减去已关闭：减掉整块框选范围');
    return true;
  }
  let sel = null;
  try {
    sel = osSegment(st.px, rect, { edges: st.edges, region, width: st.width, height: st.height });
  } catch (e) { $('#err').textContent = '对象选择没算出来：' + humanEditError(e && e.message || e); return false; }
  if (!sel || isEmptySelection(sel)) {
    shell.status('这个范围里没扣出物体 —— 背景太花或物体与背景同色时会这样，可以在 ⚙ 里调大容差，或改用魔棒 / 快速选择');
    return false;
  }
  return osFinish(sel, st.mode, '对象选择：扣出', st);
}

export function drawObjSelGizmo(ctx){
  const st = osState; if (!st) return;
  strokeAnts(ctx, c => {
    if (osOpts.mode === 'lasso') {
      c.beginPath();
      c.moveTo(st.pts[0].x, st.pts[0].y);
      for (let i = 1; i < st.pts.length; i++) c.lineTo(st.pts[i].x, st.pts[i].y);
      c.lineTo(st.pts[0].x, st.pts[0].y);
    } else {
      const x0 = Math.min(st.start.x, st.cur.x), y0 = Math.min(st.start.y, st.cur.y);
      c.beginPath();
      c.rect(x0, y0, Math.abs(st.cur.x - st.start.x), Math.abs(st.cur.y - st.start.y));
    }
  }, null);
}





export let osFound = null;        
export function set_osFound(v) { return (osFound = v); }   
export let osHover = 0;           
export function set_osHover(v) { return (osHover = v); }   
let osFinding = 0;         
let osHoverCanvas = null;  
let osAllCanvas = null;    
export function objFinderKick(force){
  if (!osOpts.finder || !doc || !docW || li) return;
  if (!SELM) { kick(SELECT); return; }
  if (osFound && !force) return;
  if (osFinding) return;
  shell.status('对象查找程序：正在查找画面里的对象…');
  osFinding = setTimeout(() => {
    osFinding = 0;
    const s = qsSample(osOpts.sampleAll);
    if (!s) return;
    try {
      
      osFound = SELM.findObjects(s.px, docW, docH, { method: osOpts.method, tolerance: Math.min(osOpts.tolerance, 14), edgeThreshold: osOpts.edge / 100 * 0.8, edges: s.edges });
    } catch (e) { osFound = null; shell.status('对象查找程序没算出来：' + humanEditError(e && e.message || e)); return; }
    osFound.doc = doc; osFound.w = docW; osFound.h = docH;
    osHover = 0; osHoverCanvas = null; osAllCanvas = null;
    shell.status(`对象查找程序：找到 ${osFound.objects.length} 个对象 —— 悬停高亮、单击选中`);
    drawGizmo();
  }, 30);
}
export function objFinderReset(){ osFound = null; osHover = 0; osHoverCanvas = null; osAllCanvas = null; }
export function objFinderHover(pt){
  if (!osOpts.finder) { if (osHover) { osHover = 0; drawGizmo(); } return; }
  if (osFound && (osFound.doc !== doc || osFound.w !== docW || osFound.h !== docH)) objFinderReset();   
  if (!osFound) { objFinderKick(false); return; }
  const x = Math.floor(pt.x), y = Math.floor(pt.y);
  const id = (x >= 0 && y >= 0 && x < docW && y < docH) ? osFound.labels[y * docW + x] : 0;
  if (id !== osHover) { osHover = id; drawGizmo(); }
}

function objFinderCanvas(ids){
  const f = osFound; if (!f) return null;
  let bx0 = docW, by0 = docH, bx1 = -1, by1 = -1;
  for (const o of f.objects) if (ids.has(o.id)) { bx0 = Math.min(bx0, o.x); by0 = Math.min(by0, o.y); bx1 = Math.max(bx1, o.x + o.width - 1); by1 = Math.max(by1, o.y + o.height - 1); }
  if (bx1 < 0) return null;
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), D = img.data;
  const L = f.labels;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (by0 + y) * docW + bx0 + x; if (!ids.has(L[i])) continue;
    const X = bx0 + x, Y = by0 + y;
    const edge = X === 0 || Y === 0 || X === docW - 1 || Y === docH - 1 || L[i - 1] !== L[i] || L[i + 1] !== L[i] || L[i - docW] !== L[i] || L[i + docW] !== L[i];
    const o = (y * w + x) * 4;
    D[o] = 40; D[o + 1] = 120; D[o + 2] = 255; D[o + 3] = edge ? 255 : 70;
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, x: bx0, y: by0 };
}
export function drawObjFinder(ctx){
  if (li || !doc || docTool !== 'objectSelect' || !osOpts.finder || !osFound || osState || smOpen()) return;
  if (osOpts.showAll) {
    if (!osAllCanvas) osAllCanvas = objFinderCanvas(new Set(osFound.objects.map(o => o.id)));
    if (osAllCanvas) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.9; ctx.drawImage(osAllCanvas.canvas, osAllCanvas.x, osAllCanvas.y); ctx.restore(); }
  }
  if (osHover > 0) {
    if (!osHoverCanvas || osHoverCanvas.id !== osHover) { const c = objFinderCanvas(new Set([osHover])); osHoverCanvas = c && { ...c, id: osHover }; }
    if (osHoverCanvas) { ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(osHoverCanvas.canvas, osHoverCanvas.x, osHoverCanvas.y); ctx.restore(); }
  }
}
export function syncQuickSelBar(){
  const qOn = docTool === 'quickSelect', oOn = docTool === 'objectSelect';
  const setChk = (id, v) => { const e = $(id); if (e) e.checked = !!v; };
  setChk('#qsAll', qsOpts.sampleAll); setChk('#qsEnhance', qsOpts.enhance);
  setChk('#osFinder', osOpts.finder); setChk('#osAll', osOpts.sampleAll); setChk('#osHard', osOpts.hard);
  const m = $('#osMode'); if (m) m.value = osOpts.mode;
  const qz = $('#qsSize'); if (qz && document.activeElement !== qz) qz.value = String(Math.round(qsOpts.size));
  const sa = $('#osShowAll'); if (sa) { sa.classList.toggle('on', !!osOpts.showAll); sa.disabled = !osOpts.finder; }
  const rf = $('#osRefresh'); if (rf) rf.disabled = !osOpts.finder;
  if (oOn) objFinderKick(false);
  const g = $('#grpSel');
  if (!g || g.dataset.qsBound) return;
  g.dataset.qsBound = '1';
  if (qz) qz.addEventListener('change', () => { qsOpts.size = Math.max(1, Math.min(5000, Math.round(+qz.value || qsOpts.size))); qz.value = String(qsOpts.size); drawGizmo(); });
  const chk = (id, fn) => { const e = $(id); if (e) e.addEventListener('change', () => { fn(e.checked); syncQuickSelBar(); }); };
  chk('#qsAll', v => { qsOpts.sampleAll = v; qsEdgeCache = null; });
  chk('#qsEnhance', v => { qsOpts.enhance = v; });
  chk('#osFinder', v => { osOpts.finder = v; if (!v) { osHover = 0; drawGizmo(); } else objFinderKick(false); });
  chk('#osAll', v => { osOpts.sampleAll = v; qsEdgeCache = null; objFinderReset(); });
  chk('#osHard', v => { osOpts.hard = v; });
  if (m) m.addEventListener('change', () => { osOpts.mode = m.value; syncQuickSelBar(); syncGizmoCursor(); });
  if (rf) { selBarIcon(rf, 'refresh', '刷新'); rf.addEventListener('click', () => { qsEdgeCache = null; objFinderReset(); objFinderKick(true); }); }
  if (sa) { selBarIcon(sa, 'showAll', '显示所有对象'); sa.addEventListener('click', () => { osOpts.showAll = !osOpts.showAll; objFinderKick(false); syncQuickSelBar(); drawGizmo(); }); }
  

  const gear = $('#osGear');
  if (gear) {
    const [src, px] = AB_BAR_ICONS.abGear;
    const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; img.alt = '设置其它选项';
    img.style.cssText = 'display:block;pointer-events:none';
    gear.replaceChildren(img);
    gear.addEventListener('click', e => {
      const q = docTool === 'quickSelect', o = q ? qsOpts : osOpts;
      const params = async () => {
        const v = await formDialog(q ? '快速选择 · 算法参数' : '对象选择 · 算法参数', [
          { type: 'note', label: 'PS 背后是图割 / 分割模型；本编辑器用颜色统计 + 边缘阻挡的传统算法近似，这两个数决定它「吃」到哪儿停。' },
          { key: 'method', label: '算法', type: 'select', value: o.method, options: q ? [['cluster', '颜色聚类 + 边缘阻挡（默认）'], ['flood', '单一颜色模型 + 容差扩散']] : [['cluster', '颜色聚类（默认）'], ['flood', '从边往里灌 + 边缘阻挡']] },
          { key: 'tol', label: '颜色容差', type: 'number', value: o.tolerance, min: 0, max: 255, step: 1 },
          { key: 'edge', label: '边缘阈值', type: 'number', value: o.edge, min: 1, max: 100, step: 1, unit: '%' },
        ], { okText: '确定' });
        if (!v) return;
        o.tolerance = Math.max(0, Math.min(255, Math.round(+v.tol))); o.edge = Math.max(1, Math.min(100, Math.round(+v.edge)));
        if (v.method) o.method = v.method === 'flood' ? 'flood' : 'cluster';
        if (!q) { objFinderReset(); objFinderKick(false); }
      };
      const items = q ? [{ label: `算法参数…（容差 ${o.tolerance} · 边缘 ${o.edge}%）`, run: params }] : [
        { label: '对象减去', checked: osOpts.objSub, run: () => { osOpts.objSub = !osOpts.objSub; } },
        { label: '补上物体内部的洞', checked: osOpts.fillHoles, run: () => { osOpts.fillHoles = !osOpts.fillHoles; } },
        { sep: true },
        { label: `算法参数…（容差 ${o.tolerance} · 边缘 ${o.edge}%）`, run: params },
      ];
      panels.popup(items, e.currentTarget.getBoundingClientRect());
    });
  }
}
