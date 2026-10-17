




import './17-shape-pen.js';   
import { LiveWire, snapToEdge, arcLength, indexAtArc } from '../../../core/live-wire.js';
import { CUSTOM_SHAPES, CUSTOM_SHAPE_BY_ID, customShapeSubpaths } from '../shapes.js';
import { shell } from '../shell.js';
import { tools } from '../tools.js';
import { $ } from './01-boot.js';
import { doc, docH, docW, li } from './02-doc-state.js';
import {
  SHAPE_MODES, cancelPen, commitPen, knotOf, makeFromPath, opCompositeOf, openContentPopover, paintSwatch,
  penBarBound, penConstrain, penDeleteAnchor, penNearAnchor, penNearestSegment, penOpts, penPointer, penState,
  savePenOpts, setShapeMode, set_penBarBound, set_penPointer, set_penState, shapeDashArr, shapeOpts, shapeState,
  shapeSubpaths, subpathsBBox, syncShapeBar, tracePath,
} from './17-shape-pen.js';
import { mkEl } from './28-layer-props-transform.js';
import { bgRGB, docTool, fgRGB, hexOf } from './31-selection-brush.js';
import { dispPx, syncGizmoCursor } from './32-cursors-select-options.js';
import { magBuildCost, magRound } from './33-lasso-quick-select.js';
import {
  PATH_OP_SVG, mountPathButtons, openPathLookPopover, pathHitTol, pathLook, pathOpts, savePathOpts,
  tracePathSub,
} from './45-path-tools.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';












export const PEN_TOOLS = new Set(['pen', 'penFree', 'penCurvature']);
export let freePen = null;               
export function set_freePen(v) { return (freePen = v); }   
export const freePenOpts = { tolerance: 2 };   


export function rdpSimplify(pts, eps){
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const a = pts[i0], b = pts[i1];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    let far = -1, fd = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const p = pts[i];
      const d = len < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y)
                           : Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([i0, far], [far, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}




export const V2 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1]], add: (a, b) => [a[0] + b[0], a[1] + b[1]], mul: (a, k) => [a[0] * k, a[1] * k],
             dot: (a, b) => a[0] * b[0] + a[1] * b[1], len: a => Math.hypot(a[0], a[1]),
             norm: a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; } };
function bezPt(B, t){ const u = 1 - t; return [u*u*u*B[0][0] + 3*u*u*t*B[1][0] + 3*u*t*t*B[2][0] + t*t*t*B[3][0], u*u*u*B[0][1] + 3*u*u*t*B[1][1] + 3*u*t*t*B[2][1] + t*t*t*B[3][1]]; }
function bezD1(B, t){ const u = 1 - t; return [3*u*u*(B[1][0]-B[0][0]) + 6*u*t*(B[2][0]-B[1][0]) + 3*t*t*(B[3][0]-B[2][0]), 3*u*u*(B[1][1]-B[0][1]) + 6*u*t*(B[2][1]-B[1][1]) + 3*t*t*(B[3][1]-B[2][1])]; }
function bezD2(B, t){ const u = 1 - t; return [6*u*(B[2][0]-2*B[1][0]+B[0][0]) + 6*t*(B[3][0]-2*B[2][0]+B[1][0]), 6*u*(B[2][1]-2*B[1][1]+B[0][1]) + 6*t*(B[3][1]-2*B[2][1]+B[1][1])]; }
function fitCubicRange(P, first, last, tHat1, tHat2, err, out, depth = 0){
  const n = last - first + 1;
  if (n === 2 || depth > 24) {
    const d = V2.len(V2.sub(P[last], P[first])) / 3;
    out.push([P[first], V2.add(P[first], V2.mul(tHat1, d)), V2.add(P[last], V2.mul(tHat2, d)), P[last]]);
    return;
  }
  
  let u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + V2.len(V2.sub(P[i], P[i - 1])));
  const tot = u[u.length - 1] || 1; u = u.map(v => v / tot);
  const gen = uu => {
    let C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
    for (let i = 0; i < n; i++) {
      const t = uu[i], m = 1 - t, b0 = m*m*m, b1 = 3*t*m*m, b2 = 3*t*t*m, b3 = t*t*t;
      const A1 = V2.mul(tHat1, b1), A2 = V2.mul(tHat2, b2);
      C00 += V2.dot(A1, A1); C01 += V2.dot(A1, A2); C11 += V2.dot(A2, A2);
      const tmp = V2.sub(P[first + i], V2.add(V2.mul(P[first], b0 + b1), V2.mul(P[last], b2 + b3)));
      X0 += V2.dot(A1, tmp); X1 += V2.dot(A2, tmp);
    }
    const det = C00 * C11 - C01 * C01;
    let a1 = det ? (X0 * C11 - X1 * C01) / det : 0, a2 = det ? (C00 * X1 - C01 * X0) / det : 0;
    const seg = V2.len(V2.sub(P[last], P[first])), eps = 1e-6 * seg;
    if (a1 < eps || a2 < eps) a1 = a2 = seg / 3;             
    return [P[first], V2.add(P[first], V2.mul(tHat1, a1)), V2.add(P[last], V2.mul(tHat2, a2)), P[last]];
  };
  const maxErr = (B, uu) => {
    let m = 0, at = Math.floor((first + last) / 2);
    for (let i = first + 1; i < last; i++) {
      const d = V2.sub(bezPt(B, uu[i - first]), P[i]), e = V2.dot(d, d);
      if (e >= m) { m = e; at = i; }
    }
    return [m, at];
  };
  let B = gen(u), [e, split] = maxErr(B, u);
  if (e < err * err) { out.push(B); return; }
  if (e < err * err * 4) {
    for (let it = 0; it < 20; it++) {                          
      u = u.map((t, i) => {
        const p = P[first + i], q = bezPt(B, t), q1 = bezD1(B, t), q2 = bezD2(B, t);
        const num = V2.dot(V2.sub(q, p), q1), den = V2.dot(q1, q1) + V2.dot(V2.sub(q, p), q2);
        return den ? Math.max(0, Math.min(1, t - num / den)) : t;
      });
      B = gen(u); [e, split] = maxErr(B, u);
      if (e < err * err) { out.push(B); return; }
    }
  }
  split = Math.max(first + 1, Math.min(last - 1, split));
  const tc = V2.norm(V2.sub(P[split - 1], P[split + 1]));
  fitCubicRange(P, first, split, tHat1, tc, err, out, depth + 1);
  fitCubicRange(P, split, last, V2.mul(tc, -1), tHat2, err, out, depth + 1);
}

function fitBezierSegs(P, err, corners){
  const segs = [];
  const cs = (corners && corners.length ? corners : [0, P.length - 1]);
  for (let c = 0; c + 1 < cs.length; c++) {
    const a = cs[c], b = cs[c + 1];
    if (b - a < 1) continue;
    const t1 = V2.norm(V2.sub(P[a + 1], P[a])), t2 = V2.norm(V2.sub(P[b - 1], P[b]));
    fitCubicRange(P, a, b, t1, t2, err, segs);
  }
  return segs;
}

function findCorners(P, closed, look = 3, cosLim = -0.17){
  const n = P.length, sharp = new Float32Array(n).fill(-2);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = P[closed ? (i - look + n) % n : Math.max(0, i - look)], b = P[closed ? (i + look) % n : Math.min(n - 1, i + look)];
    const v1 = V2.norm(V2.sub(a, P[i])), v2 = V2.norm(V2.sub(b, P[i]));
    const d = V2.dot(v1, v2);
    if (d > cosLim) sharp[i] = d;
  }
  
  const keep = closed ? [] : [0];
  
  let z = 0; if (closed) { z = sharp.findIndex(v => v <= -2); if (z < 0) z = 0; }
  const S = k => sharp[(k + z) % n];
  for (let i = 0; i < n; i++) {
    if (S(i) <= -2) continue;
    let j = i, best = i;
    while (j + 1 < n && S(j + 1) > -2) { j++; if (S(j) > S(best)) best = j; }
    keep.push((best + z) % n); i = j;
  }
  if (!closed) keep.push(n - 1);
  return [...new Set(keep)].sort((x, y) => x - y);
}

function segsToKnots(segs, closed){
  if (!segs.length) return [];
  const K = segs.map((B, i) => ({ anchor: B[0].slice(), in: i ? segs[i - 1][2].slice() : B[0].slice(), out: B[1].slice() }));
  const last = segs[segs.length - 1];
  if (closed) K[0].in = last[2].slice();
  else K.push({ anchor: last[3].slice(), in: last[2].slice(), out: last[3].slice() });
  return K;
}

export function fitBezierPoints(pts, err, closed){
  let P = pts.map(p => Array.isArray(p) ? p.slice() : [p.x, p.y]);
  P = P.filter((p, i) => !i || V2.len(V2.sub(p, P[i - 1])) > 1e-6);
  if (closed && P.length > 2 && V2.len(V2.sub(P[0], P[P.length - 1])) < 1e-6) P.pop();
  if (P.length < 2) return P.map(p => ({ anchor: p, in: p.slice(), out: p.slice() }));
  

  const look = Math.max(3, Math.round(err * 4));
  if (!closed) return segsToKnots(fitBezierSegs(P, err, findCorners(P, false, look)), false);
  
  const cs = findCorners(P, true, look);
  const s0 = cs.length ? cs[0] : 0;
  const R = P.slice(s0).concat(P.slice(0, s0)); R.push(R[0].slice());
  const rc = cs.map(i => (i - s0 + P.length) % P.length).sort((a, b) => a - b);
  if (!rc.length || rc[0] !== 0) rc.unshift(0);
  rc.push(R.length - 1);
  return segsToKnots(fitBezierSegs(R, err, [...new Set(rc)]), true);
}
export const fitBezierClosed = (pts, err) => fitBezierPoints(pts, err, true);

export function densifyPts(pts, step = 1){
  const P = pts.map(p => Array.isArray(p) ? p : [p.x, p.y]), out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const n = Math.max(1, Math.round(V2.len(V2.sub(b, a)) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}


function smoothKnots(anchors, closed){
  const n = anchors.length;
  return anchors.map((a, i) => {
    const kn = knotOf([a[0], a[1]], [a[0], a[1]], [a[0], a[1]]);
    if (n < 2) return kn;
    let tx, ty;
    if (!closed && (i === 0 || i === n - 1)) {
      const o = i === 0 ? anchors[1] : anchors[n - 2];
      tx = (o[0] - a[0]) / 3; ty = (o[1] - a[1]) / 3;
      if (i === n - 1) { tx = -tx; ty = -ty; }
    } else {
      const prev = anchors[(i - 1 + n) % n], next = anchors[(i + 1) % n];
      tx = (next[0] - prev[0]) / 6; ty = (next[1] - prev[1]) / 6;
    }
    kn.in = [a[0] - tx, a[1] - ty];
    kn.out = [a[0] + tx, a[1] + ty];
    kn.linked = true;
    return kn;
  });
}

export function curvatureResmooth(closed){
  if (!penState) return;
  const anchors = penState.pts.map(k => k.anchor);
  const fresh = smoothKnots(anchors, !!closed);
  penState.pts.forEach((k, i) => {
    if (k.corner) { k.in = k.anchor.slice(); k.out = k.anchor.slice(); k.linked = false; return; }
    k.in = fresh[i].in; k.out = fresh[i].out; k.linked = true;
  });
}







export function freePenDown(ev, pt){
  if (!doc || li) return false;
  if (penOpts.magnetic) return magPenDown(ev, pt);
  if (penState) cancelPen();                        
  freePen = { pts: [{ x: pt.x, y: pt.y }] };
  gizmo.classList.add('drag', 'pen-drawing');
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  drawGizmo();
  return true;
}
export function freePenMove(ev, pt){
  if (!freePen) return;
  const last = freePen.pts[freePen.pts.length - 1];
  if (Math.hypot(pt.x - last.x, pt.y - last.y) < 1) return;   
  freePen.pts.push({ x: pt.x, y: pt.y });
  drawGizmo();
}

function fitAndCommitFree(raw, closedHint){
  const eps = Math.max(0.5, Math.min(10, +freePenOpts.tolerance || 2));
  if (raw.length < 2) { drawGizmo(); $('#penInfo').textContent = '这一笔太短，没画出路径。'; return false; }
  const first = raw[0], lastP = raw[raw.length - 1];
  const closed = closedHint != null ? closedHint
    : raw.length > 3 && Math.hypot(first.x - lastP.x, first.y - lastP.y) <= Math.max(Number.isFinite(dispThr(9)) ? dispThr(9) : 6, 4);
  const knots = fitBezierPoints(raw, eps, closed);
  if (knots.length < 2) { drawGizmo(); $('#penInfo').textContent = '这一笔太短，没画出路径。'; return false; }
  set_penState({ pts: knots.map(k => knotOf(k.anchor.slice(), k.in.slice(), k.out.slice())), drag: null, closeHover: false });
  const ok = commitPen(closed && knots.length >= 3);
  if (ok) shell.status(`自由钢笔：${raw.length} 个采样点拟合成 ${knots.length} 个锚点（曲线拟合 ${eps} 像素）`);
  drawGizmo();
  return ok;
}
export function endFreePen(){
  const F = freePen; freePen = null;
  gizmo.classList.remove('drag', 'pen-drawing');
  if (!F) return false;
  return fitAndCommitFree(F.pts, null);
}

export let magPen = null;   
export function set_magPen(v) { return (magPen = v); }   
const magPenOpt = () => ({ width: Math.max(1, +penOpts.magWidth || 10), contrast: Math.max(1, Math.min(100, +penOpts.magContrast || 10)), frequency: Math.max(0, Math.min(100, +penOpts.magFreq || 57)) });
const magPenEvery = () => Math.max(4, Math.round(100 / (1 + magPenOpt().frequency / 10)));
function magPenPath(st, a, b){
  if (!st.cost) return [a, b];
  const o = magPenOpt();
  if (!st.wire || st.wire.seed.x !== a.x || st.wire.seed.y !== a.y)
    st.wire = new LiveWire(st.cost, docW, docH, a, { contrast: o.contrast, radius: Math.max(96, magPenEvery() * 4 + o.width * 2) });
  let p = null;
  try { p = st.wire.pathTo(b); } catch { p = null; }
  return p && p.length > 1 ? p : [a, b];
}
function magPenSnap(st, p){
  if (!st.cost) return p;
  try { const s = snapToEdge(st.cost, docW, docH, p.x, p.y, magPenOpt()); return { x: s.x, y: s.y }; } catch { return p; }
}
export function magPenDown(ev, pt){
  const raw = magRound(pt);
  if (!magPen) {
    if (penState) cancelPen();
    const cost = magBuildCost();
    const st = { anchors: [], path: [], preview: [], cost, wire: null, cur: raw };
    const p = magPenSnap(st, raw);
    st.anchors.push(p); st.path.push(p);
    magPen = st;
    gizmo.classList.add('pen-drawing');
    shell.status(cost ? '磁性钢笔：沿着边缘移动鼠标（不用按住），点一下落固定点，双击 / 点回起点闭合，Enter 完成，Esc 放弃'
                      : '磁性钢笔：读不到画面像素，这一条会退化成直线段');
    drawGizmo(); return true;
  }
  const st = magPen, p0 = st.anchors[0];
  if ((ev && ev.detail >= 2) || (st.path.length > 3 && Math.hypot(raw.x - p0.x, raw.y - p0.y) <= Math.max(dispThr(8), 3))) return finishMagPen(true);
  st.preview = magPenPath(st, st.anchors[st.anchors.length - 1], raw);
  magPenCommit(st, st.preview.length - 1);
  drawGizmo(); return true;
}
function magPenCommit(st, k){
  const seg = st.preview && st.preview.length > 1 ? st.preview : null;
  if (!seg) return;
  k = Math.max(1, Math.min(seg.length - 1, k));
  for (let i = 1; i <= k; i++) st.path.push(seg[i]);
  st.anchors.push(seg[k]);
  st.preview = seg.slice(k); st.wire = null;
}
export function magPenMove(pt){
  const st = magPen; if (!st) return;
  const raw = magRound(pt);
  st.cur = raw;
  const t = magPenSnap(st, raw);
  st.preview = magPenPath(st, st.anchors[st.anchors.length - 1], t);
  if (st.cost) {
    const every = magPenEvery(); let guard = 0;
    while (st.preview.length > 2 && arcLength(st.preview) >= every * 1.5 && guard++ < 64) {
      magPenCommit(st, indexAtArc(st.preview, every));
      st.preview = magPenPath(st, st.anchors[st.anchors.length - 1], t);
    }
  }
  drawGizmo();
}
export function finishMagPen(closed){
  const st = magPen; magPen = null;
  gizmo.classList.remove('pen-drawing');
  if (!st) return false;
  const pts = st.path.slice();
  if (!closed && st.preview && st.preview.length > 1) for (let i = 1; i < st.preview.length; i++) pts.push(st.preview[i]);
  if (closed && st.cost) {
    const last = pts[pts.length - 1], first = st.anchors[0];
    st.wire = null;
    const back = magPenPath(st, last, first);
    for (let i = 1; i < back.length - 1; i++) pts.push(back[i]);
  }
  return fitAndCommitFree(pts, closed);
}
export function cancelMagPen(){ magPen = null; gizmo.classList.remove('pen-drawing'); drawGizmo(); }
export function drawMagPenGizmo(ctx){
  const st = magPen; if (!st) return;
  ctx.save();
  const line = pts => { if (pts.length < 2) return; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); };
  ctx.lineWidth = dispPx(Math.max(0.5, +pathLook.width || 1)); ctx.strokeStyle = pathLook.color || '#0096ff';
  line(st.path); ctx.globalAlpha = 0.7; line(st.preview); ctx.globalAlpha = 1;
  const s = dispThr(5);
  for (const a of st.anchors) { ctx.beginPath(); ctx.rect(a.x - s / 2, a.y - s / 2, s, s); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
  if (st.cur) {                                               
    ctx.beginPath(); ctx.arc(st.cur.x, st.cur.y, magPenOpt().width, 0, Math.PI * 2);
    ctx.setLineDash([dispPx(3), dispPx(3)]); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = dispPx(1); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}





let curvLastClick = { t: 0, i: -1 };
export function curvatureDown(ev, pt){
  if (!doc || li) return false;
  if (pathOpts.snapEdges) pt = { x: Math.round(pt.x), y: Math.round(pt.y) };
  set_penPointer({ ...pt });
  const now = performance.now();
  const dbl = ev && (ev.detail >= 2);
  const ah = penNearAnchor(pt);
  if (penState && ah === 0 && penState.pts.length >= 3 && penState.sel !== 0 && !dbl) { curvatureResmooth(true); return commitPen(true); }   
  if (ah >= 0) {
    const k = penState.pts[ah];
    const isDbl = dbl || (now - curvLastClick.t < 350 && curvLastClick.i === ah);
    if (isDbl || (ev && ev.altKey)) {                        
      k.corner = !k.corner;
      curvatureResmooth(false);
      shell.status(k.corner ? '这个锚点变成角点' : '这个锚点变回平滑点');
    }
    penState.sel = ah;
    penState.drag = { mode: 'curv', i: ah, start: { ...pt }, orig: k.anchor.slice(), moved: false };
    curvLastClick = { t: now, i: ah };
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    gizmo.classList.add('pen-drawing');
    syncPenBar(); drawGizmo(); syncGizmoCursor();
    return true;
  }
  const seg = penState ? penNearestSegment(pt) : null;
  if (!penState) set_penState({ pts: [], drag: null, closeHover: false });
  let i;
  if (seg) { penState.pts.splice(seg.i + 1, 0, knotOf([seg.x, seg.y], [seg.x, seg.y], [seg.x, seg.y])); i = seg.i + 1; }   
  else {
    if (penState.pts.length && ev && ev.shiftKey) pt = penConstrain(pt, penState.pts[penState.pts.length - 1].anchor);
    penState.pts.push(knotOf([pt.x, pt.y], [pt.x, pt.y], [pt.x, pt.y])); i = penState.pts.length - 1;
  }
  const kn = penState.pts[i];
  if (ev && ev.altKey) kn.corner = true;
  penState.sel = i;
  penState.drag = { mode: 'curv', i, start: { ...pt }, orig: kn.anchor.slice(), moved: false };
  curvLastClick = { t: now, i };
  curvatureResmooth(false);
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  gizmo.classList.add('pen-drawing');
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}
export function curvatureMove(ev, pt){
  const d = penState && penState.drag; if (!d || d.mode !== 'curv') return false;
  const k = penState.pts[d.i]; if (!k) return false;
  let x = d.orig[0] + pt.x - d.start.x, y = d.orig[1] + pt.y - d.start.y;
  if (pathOpts.snapEdges) { x = Math.round(x); y = Math.round(y); }
  if (Math.hypot(pt.x - d.start.x, pt.y - d.start.y) > pathHitTol(1.5)) d.moved = true;
  if (!d.moved) return true;
  k.anchor = [x, y];
  curvatureResmooth(false);
  drawGizmo();
  return true;
}

export function curvatureDeleteSelected(){
  if (!penState) return false;
  const i = penState.sel != null && penState.sel < penState.pts.length ? penState.sel : penState.pts.length - 1;
  penDeleteAnchor(i);
  if (penState) { penState.sel = Math.min(i, penState.pts.length - 1); curvatureResmooth(false); }
  drawGizmo();
  return true;
}


function openPenGear(anchor){
  openPathLookPopover(anchor, (pop, row) => {
    if (docTool === 'pen') {
      const l = mkEl('label'); const c = mkEl('input', { type: 'checkbox', checked: !!penOpts.rubberBand });
      c.onchange = () => { penOpts.rubberBand = c.checked; savePenOpts(); drawGizmo(); };
      l.append(c, document.createTextNode(' 橡皮带')); pop.append(l);
    }
    if (docTool === 'penFree') {
      const cf = mkEl('input', { type: 'number', value: freePenOpts.tolerance, min: 0.5, max: 10, step: 0.5 }); cf.style.width = '56px';
      cf.onchange = () => { freePenOpts.tolerance = Math.max(0.5, Math.min(10, +cf.value || 2)); cf.value = freePenOpts.tolerance; syncPenBar(); };
      row('曲线拟合:', cf, mkEl('span', { textContent: '像素' }));
      const ml = mkEl('label'); const mc = mkEl('input', { type: 'checkbox', checked: !!penOpts.magnetic });
      ml.append(mc, document.createTextNode(' 磁性的')); pop.append(ml);
      const fields = [];
      for (const [k, t, lo, hi, unit] of [['magWidth', '宽度:', 1, 256, '像素'], ['magContrast', '对比:', 1, 100, '%'], ['magFreq', '频率:', 0, 100, '']]) {
        const i = mkEl('input', { type: 'number', value: penOpts[k], min: lo, max: hi, step: 1 }); i.style.width = '56px';
        i.onchange = () => { penOpts[k] = Math.max(lo, Math.min(hi, +i.value || lo)); i.value = penOpts[k]; savePenOpts(); };
        fields.push(i); row(t, i, mkEl('span', { textContent: unit }));
      }
      const en = () => fields.forEach(f => f.disabled = !penOpts.magnetic);
      mc.onchange = () => { penOpts.magnetic = mc.checked; savePenOpts(); en(); syncPenBar(); };
      en();
    }
  });
}
export function syncPenBar(){
  const g = $('#grpPen'); if (!g) return;
  if (!penBarBound) {
    set_penBarBound(true);
    const fill = () => { shapeOpts.fill = $('#penFill').value; shapeOpts.fillFromFg = false; shapeOpts.fillType = 'solid';
      const s = $('#shpFill'); if (s) s.value = shapeOpts.fill; syncPenBar(); drawGizmo(); };
    $('#penFill').addEventListener('change', fill);
    $('#penFill').addEventListener('input', fill);
    $('#penFillBtn').onclick = e => openContentPopover(e.currentTarget, 'fill');
    $('#penStrokeBtn').onclick = e => openContentPopover(e.currentTarget, 'stroke');
    $('#penStrokeW').addEventListener('change', () => { $('#shpStrokeW').value = $('#penStrokeW').value; $('#shpStrokeW').dispatchEvent(new Event('change')); syncPenBar(); });
    $('#penClose').onclick = () => { if (docTool === 'penCurvature') curvatureResmooth(true); commitPen(true); };
    $('#penFinish').onclick = () => { if (docTool === 'penCurvature') curvatureResmooth(false); commitPen(false); };
    $('#penCancel').onclick = () => { if (magPen) cancelMagPen(); cancelPen(); };
    $('#penMkSel').onclick = () => makeFromPath('sel');
    $('#penMkMask').onclick = () => makeFromPath('mask');
    $('#penMkShape').onclick = () => makeFromPath('shape');
    $('#penAuto').onchange = () => { penOpts.autoAddDelete = $('#penAuto').checked; savePenOpts(); syncGizmoCursor(); };
    $('#penMag').onchange = () => { penOpts.magnetic = $('#penMag').checked; savePenOpts(); if (!penOpts.magnetic && magPen) cancelMagPen(); syncPenBar(); };
    $('#penSnap').onchange = () => { pathOpts.snapEdges = $('#penSnap').checked; savePathOpts(); syncShapeBar(); };
    const msel = $('#penMode');
    for (const m of SHAPE_MODES) { const el = document.createElement('option'); el.value = m.value; el.textContent = m.label; msel.appendChild(el); }
    msel.onchange = () => { setShapeMode(msel.value); };
    mountPathButtons($('#penBtns'), { draw: true, onGear: openPenGear, gearTitle: '设置其它钢笔和路径选项' });
  }
  if (shapeOpts.fillFromFg) shapeOpts.fill = hexOf(fgRGB);
  const mode = shapeOpts.mode;
  $('#penMode').value = mode;
  $('#penKindName').textContent = docTool === 'penFree' ? (penOpts.magnetic ? '磁性钢笔' : '自由钢笔') : docTool === 'penCurvature' ? '弯度钢笔' : '钢笔';
  $('#penFillWrap').hidden = mode !== 'shape';
  $('#penStrokeWrap').hidden = mode !== 'shape';
  $('#penMakeWrap').hidden = mode !== 'path';
  $('#penAutoWrap').hidden = docTool === 'penCurvature';          
  $('#penMagWrap').hidden = docTool !== 'penFree';
  $('#penAuto').checked = !!penOpts.autoAddDelete;
  $('#penMag').checked = !!penOpts.magnetic;
  $('#penSnap').checked = !!pathOpts.snapEdges;
  paintSwatch($('#penFillBtn'), shapeOpts.fillType || 'solid', shapeOpts.fill, shapeOpts.fillGrad, false);
  const sOn = +shapeOpts.strokeW > 0 && shapeOpts.strokeType !== 'none';
  paintSwatch($('#penStrokeBtn'), sOn ? shapeOpts.strokeType : 'none', shapeOpts.stroke, shapeOpts.strokeGrad, true);
  { const el = $('#penStrokeW'); if (el && document.activeElement !== el) el.value = String(shapeOpts.strokeW || 0); }
  const el = $('#penFill'); if (el && document.activeElement !== el) el.value = shapeOpts.fill;
  const ob = $('#penBtns') && $('#penBtns').querySelector('[data-path-btn="op"]');
  if (ob) { const cur = ob.querySelector('svg'); const html = PATH_OP_SVG[shapeOpts.pathOp] || PATH_OP_SVG.new; if (cur && cur.outerHTML !== html) cur.outerHTML = html; }
  const n = penState ? penState.pts.length : 0;
  const pathMode = mode === 'path';
  $('#penClose').disabled = n < 3;
  $('#penFinish').hidden = !penState;
  $('#penFinish').disabled = n < 2;
  $('#penCancel').disabled = !penState && !magPen;
  $('#penWhy').textContent = '';
  $('#penWhy').title = docTool === 'penFree'
    ? (penOpts.magnetic ? '点一下起步，沿边缘移动（不用按住）；点一下落点，双击 / 点回起点闭合，Enter 完成，Esc 放弃，[ ] 调宽度'
                        : `按住拖一条手绘线，松手按曲线拟合 ${freePenOpts.tolerance} 像素拟合成贝塞尔路径；末点回到起点附近就闭合`)
    : docTool === 'penCurvature'
    ? '点一下 = 平滑点、双击 = 角点；拖已有的点 = 挪它；Delete 删掉选中的点；点在线段上 = 加点；点回起点 = 闭合；Enter / Esc 完成'
    : '点击 = 角点 · 拖动 = 平滑点 · 拖出手柄时按 Alt = 断开 · Alt 点锚点 = 去掉一侧手柄 · ⌘ = 临时直接选择 · Shift = 45° · 空格 = 挪动当前锚点 · Enter / Esc 完成';
  if (!$('#penInfo').textContent.startsWith('只有') || penState)
    $('#penInfo').textContent = n ? `${n} 个锚点` : '';
}


export let customPopBound = false;
export function set_customPopBound(v) { return (customPopBound = v); }   

export function customShapeThumb(id, w = 22, h = 22){
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (!c) return cv;
  const pad = 2;
  const subs = customShapeSubpaths(id, { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 });
  if (!subs) return cv;
  
  subs.forEach((sub, si) => {
    c.save();
    tracePathSub(c, sub);
    if (si > 0) c.globalCompositeOperation = opCompositeOf(sub.operation);
    c.fillStyle = '#d6d6d6'; c.fill();
    c.restore();
  });
  return cv;
}
function renderCustomPop(){
  const pop = $('#shpCustomPop'); if (!pop) return;
  pop.innerHTML = '';
  for (const s of CUSTOM_SHAPES) {
    const b = document.createElement('button');
    b.className = 'presetcell' + (s.id === shapeOpts.custom ? ' cur' : '');
    b.title = s.name;
    b.dataset.id = s.id;
    b.appendChild(customShapeThumb(s.id, 26, 26));
    const n = document.createElement('span'); n.className = 'pn'; n.textContent = s.name;
    b.appendChild(n);
    b.addEventListener('click', () => { setCustomShape(s.id); hideCustomPop(); });
    pop.appendChild(b);
  }
}
export function showCustomPop(){
  const pop = $('#shpCustomPop'), btn = $('#shpCustomBtn');
  if (!pop || !btn) return;
  renderCustomPop();
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  pop.style.left = Math.round(Math.min(r.left, innerWidth - pr.width - 8)) + 'px';
  pop.style.top = Math.round(Math.min(r.bottom + 2, innerHeight - pr.height - 8)) + 'px';
}
export function hideCustomPop(){ const p = $('#shpCustomPop'); if (p) p.hidden = true; }
export function setCustomShape(id){
  if (!CUSTOM_SHAPE_BY_ID[id]) return false;
  shapeOpts.custom = id;
  if (shapeOpts.kind !== 'customShape') { shapeOpts.kind = 'customShape'; tools.syncFromDocTool('shape'); }
  syncShapeBar(); drawGizmo();
  return true;
}


export function drawShapeGizmo(ctx){
  if (!shapeState) return;
  const subs = shapeSubpaths(shapeOpts.kind, shapeState);
  if (!subs) return;
  ctx.save();
  ctx.beginPath(); tracePath(ctx, subs);
  
  const mode = shapeOpts.mode, ft = mode === 'pixel' ? 'solid' : (shapeOpts.fillType || 'solid');
  const bb = subpathsBBox(subs);
  const paintOf = (type, color, G) => {
    if (type === 'gradient' && bb) { const g0 = G || {}; const lg = ctx.createLinearGradient(bb.x, 0, bb.x + bb.width, 0);
      lg.addColorStop(0, g0.c0 || hexOf(fgRGB)); lg.addColorStop(1, g0.c1 || hexOf(bgRGB)); return lg; }
    if (type === 'pattern') return 'rgba(150,150,150,.8)';
    return color;
  };
  if (mode !== 'path' && ft !== 'none') {
    ctx.fillStyle = mode === 'pixel' ? hexOf(fgRGB) : paintOf(ft, shapeOpts.fill, shapeOpts.fillGrad);
    ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
  }
  
  const sw = +shapeOpts.strokeW;
  if (mode === 'shape' && sw > 0 && shapeOpts.strokeType !== 'none') {
    ctx.save();
    const dash = shapeDashArr();
    if (dash) ctx.setLineDash(dash.map(v => Math.max(0.01, v * sw)));
    ctx.lineWidth = sw; ctx.strokeStyle = paintOf(shapeOpts.strokeType, shapeOpts.stroke, shapeOpts.strokeGrad); ctx.globalAlpha = 0.85;
    ctx.lineCap = shapeOpts.strokeCap || (shapeOpts.dash === 'dot' ? 'round' : 'butt');
    ctx.lineJoin = shapeOpts.strokeJoin || 'miter';
    ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = dispPx(1);
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  ctx.setLineDash([dispPx(4), dispPx(3)]); ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.stroke();
  ctx.restore();
}

export function drawFreePenGizmo(ctx){
  const F = freePen; if (!F || F.pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(F.pts[0].x, F.pts[0].y);
  for (let i = 1; i < F.pts.length; i++) ctx.lineTo(F.pts[i].x, F.pts[i].y);
  ctx.lineWidth = dispPx(1);
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  ctx.setLineDash([dispPx(4), dispPx(3)]); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
export function drawPenGizmo(ctx){
  const st = penState;
  const col = pathLook.color || '#0096ff';
  if (!st || !st.pts.length) return;
  const pts = st.pts;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].anchor[0], pts[0].anchor[1]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    ctx.bezierCurveTo(a.out[0], a.out[1], b.in[0], b.in[1], b.anchor[0], b.anchor[1]);
  }
  ctx.lineWidth = dispPx(Math.max(0.5, +pathLook.width || 1));
  ctx.strokeStyle = col; ctx.stroke();
  
  const last = pts[pts.length - 1];
  if (penOpts.rubberBand && penPointer && !st.drag) {
    ctx.beginPath(); ctx.moveTo(last.anchor[0], last.anchor[1]);
    ctx.bezierCurveTo(last.out[0], last.out[1], penPointer.x, penPointer.y, penPointer.x, penPointer.y);
    ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
  }
  
  if (docTool === 'penCurvature' && penPointer && !st.drag) {
    const anchors = pts.map(k => k.anchor).concat([[penPointer.x, penPointer.y]]);
    const fresh = smoothKnots(anchors, false);
    pts.forEach((k, i) => { if (k.corner) { fresh[i].in = k.anchor.slice(); fresh[i].out = k.anchor.slice(); } });
    const a = fresh[fresh.length - 2], b = fresh[fresh.length - 1];
    ctx.beginPath(); ctx.moveTo(a.anchor[0], a.anchor[1]);
    ctx.bezierCurveTo(a.out[0], a.out[1], b.in[0], b.in[1], b.anchor[0], b.anchor[1]);
    ctx.setLineDash([dispPx(4), dispPx(3)]); ctx.globalAlpha = 0.8; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const s = dispThr(6);
  
  const showH = new Set([pts.length - 1]);
  if (st.drag && st.drag.i != null) showH.add(st.drag.i);
  if (pts.length > 1) showH.add(pts.length - 2);
  pts.forEach((k, i) => {
    if (showH.has(i) && docTool !== 'penCurvature') for (const hd of (i === pts.length - 2 && !st.drag ? [k.out] : [k.in, k.out])) {
      if (Math.hypot(hd[0] - k.anchor[0], hd[1] - k.anchor[1]) < 0.5) continue;
      ctx.beginPath(); ctx.moveTo(k.anchor[0], k.anchor[1]); ctx.lineTo(hd[0], hd[1]);
      ctx.strokeStyle = col; ctx.lineWidth = dispPx(1); ctx.stroke();
      ctx.beginPath(); ctx.arc(hd[0], hd[1], s / 2.4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    }
    ctx.beginPath(); ctx.rect(k.anchor[0] - s / 2, k.anchor[1] - s / 2, s, s);
    const on = docTool === 'penCurvature' && st.sel != null ? i === st.sel : i === pts.length - 1;
    ctx.fillStyle = on ? col : '#fff'; ctx.strokeStyle = col; ctx.lineWidth = dispPx(1);
    if (docTool === 'penCurvature' && !k.corner) { ctx.beginPath(); ctx.arc(k.anchor[0], k.anchor[1], s / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); return; }   
    ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}
