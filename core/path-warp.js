






















import { cylinderWarpMesh } from './transform-warp-cylinder.js';
import { transformWarpMesh } from './transform-warp-presets.js';
import { splitMeshU, splitMeshV, unsplitMeshU, unsplitMeshV, spanEdges, patchCountX, patchCountY } from './mesh.js';




export function identityMesh(rect, nx = 1, ny = 1) {
  const cols = 3 * nx + 1, rows = 3 * ny + 1, points = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    points.push({ x: rect.x + rect.w * c / (cols - 1), y: rect.y + rect.h * r / (rows - 1) });
  const sl = n => { const a = []; for (let k = 1; k < n; k++) a.push(k / n); return a; };
  return { rect: { ...rect }, points, cols, rows, sliceX: sl(nx), sliceY: sl(ny) };
}


export function presetMesh(rect, o) {
  if(o.style==='warpCylinder'){
    const size=o.sourceSize||{width:rect.w,height:rect.h};
    const m=cylinderWarpMesh(o.values||[0,size.height,size.width,0,.5,.5,.9]);
    return {rect:{...rect},points:m.points.map(p=>({x:rect.x+p.x*rect.w/size.width,y:rect.y+p.y*rect.h/size.height})),cols:m.xn,rows:m.yn,sliceX:m.sliceX,sliceY:m.sliceY};
  }
  const P = transformWarpMesh({ style: o.style, bend: o.bend || 0, h: o.h || 0, v: o.v || 0, vertical: !!o.vertical }, rect.w, rect.h);
  return { rect: { ...rect }, points: P.map(p => ({ x: rect.x + p[0], y: rect.y + p[1] })), cols: 4, rows: 4, sliceX: [], sliceY: [] };
}

export function cloneMesh(m) {
  return { rect: { ...m.rect }, points: m.points.map(p => ({ x: p.x, y: p.y })), cols: m.cols, rows: m.rows,
    sliceX: (m.sliceX || []).slice(), sliceY: (m.sliceY || []).slice() };
}


export function splitMesh(m, U, V, dir = 'both') {
  let o = cloneMesh(m);
  if (dir === 'both' || dir === 'u') { const r = splitMeshU(o.points, o.cols, o.rows, U, o.sliceX); o = { ...o, points: r.points, cols: r.cols, sliceX: r.sliceX }; }
  if (dir === 'both' || dir === 'v') { const r = splitMeshV(o.points, o.cols, o.rows, V, o.sliceY); o = { ...o, points: r.points, rows: r.rows, sliceY: r.sliceY }; }
  return o;
}


export function unsplitAll(m) {
  let o = cloneMesh(m);
  while (patchCountX(o.cols) > 1) { const r = unsplitMeshU(o.points, o.cols, o.rows, 1, o.sliceX); o = { ...o, points: r.points, cols: r.cols, sliceX: r.sliceX }; }
  while (patchCountY(o.rows) > 1) { const r = unsplitMeshV(o.points, o.cols, o.rows, 1, o.sliceY); o = { ...o, points: r.points, rows: r.rows, sliceY: r.sliceY }; }
  return o;
}


export function unsplitOne(m, axis, k) {
  const o = cloneMesh(m);
  if (axis === 'u') { const r = unsplitMeshU(o.points, o.cols, o.rows, k, o.sliceX); return { ...o, points: r.points, cols: r.cols, sliceX: r.sliceX }; }
  const r = unsplitMeshV(o.points, o.cols, o.rows, k, o.sliceY); return { ...o, points: r.points, rows: r.rows, sliceY: r.sliceY };
}



export function regridMesh(m, nx, ny) {
  let o = unsplitAll(m);
  for (let k = 1; k < nx; k++) { const r = splitMeshU(o.points, o.cols, o.rows, k / nx, o.sliceX); o = { ...o, points: r.points, cols: r.cols, sliceX: r.sliceX }; }
  for (let k = 1; k < ny; k++) { const r = splitMeshV(o.points, o.cols, o.rows, k / ny, o.sliceY); o = { ...o, points: r.points, rows: r.rows, sliceY: r.sliceY }; }
  return o;
}

export function meshIsIdentity(m, eps = 1e-6) {
  const id = identityMesh(m.rect, patchCountX(m.cols), patchCountY(m.rows));
  const ex = spanEdges(patchCountX(m.cols), m.sliceX), ey = spanEdges(patchCountY(m.rows), m.sliceY);
  
  const px = []; for (let i = 0; i < ex.length - 1; i++) for (let k = 0; k < 3; k++) px.push(ex[i] + (ex[i + 1] - ex[i]) * k / 3); px.push(1);
  const py = []; for (let i = 0; i < ey.length - 1; i++) for (let k = 0; k < 3; k++) py.push(ey[i] + (ey[i + 1] - ey[i]) * k / 3); py.push(1);
  void id;
  const tol = eps * Math.max(1, m.rect.w, m.rect.h);
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    const p = m.points[r * m.cols + c];
    if (Math.abs(p.x - (m.rect.x + m.rect.w * px[c])) > tol || Math.abs(p.y - (m.rect.y + m.rect.h * py[r])) > tol) return false;
  }
  return true;
}


const bern3 = t => { const m = 1 - t; return [m * m * m, 3 * t * m * m, 3 * t * t * m, t * t * t]; };
const dbern3 = t => { const m = 1 - t; return [-3 * m * m, 3 * m * m - 6 * t * m, 6 * t * m - 3 * t * t, 3 * t * t]; };
function locate(U, edges) {
  const n = edges.length - 1;
  let i = 0; while (i < n - 1 && U >= edges[i + 1]) i++;
  const d = edges[i + 1] - edges[i];
  return [i, d > 1e-12 ? (U - edges[i]) / d : 0, d > 1e-12 ? d : 1];
}





export function meshMapper(m) {
  const { rect, points, cols } = m;
  const ex = spanEdges(patchCountX(m.cols), m.sliceX), ey = spanEdges(patchCountY(m.rows), m.sliceY);
  const W = rect.w || 1, H = rect.h || 1;
  return (x, y) => {
    const [i, tu, du] = locate((x - rect.x) / W, ex), [j, tv, dv] = locate((y - rect.y) / H, ey);
    const bu = bern3(tu), bv = bern3(tv), gu = dbern3(tu), gv = dbern3(tv);
    let px = 0, py = 0, ux = 0, uy = 0, vx = 0, vy = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const P = points[(j * 3 + r) * cols + i * 3 + c];
      const w = bv[r] * bu[c], wu = bv[r] * gu[c], wv = gv[r] * bu[c];
      px += w * P.x; py += w * P.y; ux += wu * P.x; uy += wu * P.y; vx += wv * P.x; vy += wv * P.y;
    }
    const su = 1 / (du * W), sv = 1 / (dv * H);
    return { p: [px, py], J: [ux * su, vx * sv, uy * su, vy * sv] };
  };
}


export function homographyMapper(M) {
  return (x, y) => {
    const w = M[6] * x + M[7] * y + M[8];
    const X = (M[0] * x + M[1] * y + M[2]) / w, Y = (M[3] * x + M[4] * y + M[5]) / w;
    return { p: [X, Y], J: [(M[0] - M[6] * X) / w, (M[1] - M[7] * X) / w, (M[3] - M[6] * Y) / w, (M[4] - M[7] * Y) / w] };
  };
}


const bez = (P, t) => { const b = bern3(t); return [b[0] * P[0][0] + b[1] * P[1][0] + b[2] * P[2][0] + b[3] * P[3][0], b[0] * P[0][1] + b[1] * P[1][1] + b[2] * P[2][1] + b[3] * P[3][1]]; };
const bezD = (P, t) => { const m = 1 - t;
  return [3 * m * m * (P[1][0] - P[0][0]) + 6 * m * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]),
          3 * m * m * (P[1][1] - P[0][1]) + 6 * m * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1])]; };
const bezDD = (P, t) => [6 * (1 - t) * (P[2][0] - 2 * P[1][0] + P[0][0]) + 6 * t * (P[3][0] - 2 * P[2][0] + P[1][0]),
                         6 * (1 - t) * (P[2][1] - 2 * P[1][1] + P[0][1]) + 6 * t * (P[3][1] - 2 * P[2][1] + P[1][1])];
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export function splitBezier(P, t) {
  const a = lerp2(P[0], P[1], t), b = lerp2(P[1], P[2], t), c = lerp2(P[2], P[3], t);
  const d = lerp2(a, b, t), e = lerp2(b, c, t), f = lerp2(d, e, t);
  return [[P[0], a, d, f], [f, e, c, P[3]]];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = a => Math.hypot(a[0], a[1]);
const mulJ = (J, v) => [J[0] * v[0] + J[1] * v[1], J[2] * v[0] + J[3] * v[1]];
const EPS = 1e-9;


function startDir(P) { for (const k of [1, 2, 3]) { const d = sub(P[k], P[0]); if (len(d) > 1e-9) return d; } return null; }
function endDir(P) { for (const k of [2, 1, 0]) { const d = sub(P[k], P[3]); if (len(d) > 1e-9) return d; } return null; }
const unit = v => { const l = len(v); return l > EPS ? [v[0] / l, v[1] / l] : null; };


function newton(C, q, t) {
  const d = sub(bez(C, t), q), d1 = bezD(C, t), d2 = bezDD(C, t);
  const num = dot(d, d1), den = dot(d1, d1) + dot(d, d2);
  if (Math.abs(den) < EPS) return t;
  const n = t - num / den;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}





function fitMapped(P, F, tol, depth, maxDepth, out, N) {
  const A = F(P[0][0], P[0][1]), B = F(P[3][0], P[3][1]);
  const d0 = startDir(P), d3 = endDir(P);
  if (!d0 || !d3) { out.push([A.p, A.p, B.p, B.p]); return; }            
  const ts = [], Q = [];
  for (let i = 0; i <= N; i++) { const t = i / N; ts.push(t); const b = bez(P, t); Q.push(F(b[0], b[1]).p); }
  const chord = len(sub(B.p, A.p)) || 1;
  let t0 = unit(mulJ(A.J, d0)), t3 = unit(mulJ(B.J, d3));
  if (!t0) t0 = unit(sub(B.p, A.p)) || [1, 0];
  if (!t3) t3 = unit(sub(A.p, B.p)) || [-1, 0];
  
  const h1 = len(mulJ(A.J, sub(P[1], P[0]))), h2 = len(mulJ(B.J, sub(P[2], P[3])));
  const make = (a1, a2) => [A.p, [A.p[0] + t0[0] * a1, A.p[1] + t0[1] * a1], [B.p[0] + t3[0] * a2, B.p[1] + t3[1] * a2], B.p];
  const evalErr = (C, params) => {
    let e = 0, at = 0.5;
    for (let i = 1; i < N; i++) {
      let t = params[i]; t = newton(C, Q[i], t); t = newton(C, Q[i], t); params[i] = t;
      const d = len(sub(bez(C, t), Q[i])); if (d > e) { e = d; at = ts[i]; }
    }
    return [e, at];
  };
  let best = make(h1, h2), params = ts.slice(), [bestErr, worstT] = evalErr(best, params);
  

  const chordParams = () => { const c = [0]; for (let i = 1; i <= N; i++) c.push(c[i - 1] + len(sub(Q[i], Q[i - 1]))); const L = c[N] || 1; return c.map(v => v / L); };
  for (const init of [ts, null]) {
    if (bestErr <= tol) break;
    params = init ? init.slice() : chordParams();
    for (let iter = 0; iter < 6; iter++) {
      
      let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
      for (let i = 0; i <= N; i++) {
        const b = bern3(params[i]);
        const a1 = [t0[0] * b[1], t0[1] * b[1]], a2 = [t3[0] * b[2], t3[1] * b[2]];
        c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
        const base = [A.p[0] * (b[0] + b[1]) + B.p[0] * (b[2] + b[3]), A.p[1] * (b[0] + b[1]) + B.p[1] * (b[2] + b[3])];
        const tmp = sub(Q[i], base);
        x0 += dot(a1, tmp); x1 += dot(a2, tmp);
      }
      const det = c00 * c11 - c01 * c01;
      let al1, al2;
      if (Math.abs(det) > 1e-12) { al1 = (x0 * c11 - x1 * c01) / det; al2 = (c00 * x1 - c01 * x0) / det; }
      else { al1 = al2 = chord / 3; }
      if (!(al1 > 1e-6 * chord) || !(al2 > 1e-6 * chord) || al1 > 4 * chord + h1 || al2 > 4 * chord + h2) { al1 = al2 = chord / 3; }   
      const C = make(al1, al2);
      const [e, wt] = evalErr(C, params);
      if (e < bestErr) { best = C; bestErr = e; worstT = wt; }
      if (bestErr <= tol) break;
    }
  }
  if (bestErr <= tol || depth >= maxDepth) { out.push(best); return; }
  const cut = Math.min(0.75, Math.max(0.25, worstT));
  const [L, R] = splitBezier(P, cut);
  fitMapped(L, F, tol, depth + 1, maxDepth, out, N);
  fitMapped(R, F, tol, depth + 1, maxDepth, out, N);
}


function straighten(C, tol) {
  const d = sub(C[3], C[0]), l = len(d);
  if (l < EPS) return C;
  const off = p => Math.abs((p[0] - C[0][0]) * d[1] - (p[1] - C[0][1]) * d[0]) / l;
  const along = p => dot(sub(p, C[0]), d) / (l * l);
  if (off(C[1]) <= tol && off(C[2]) <= tol && along(C[1]) >= -1e-6 && along(C[2]) <= 1 + 1e-6) return [C[0], C[0].slice(), C[3].slice(), C[3]];
  return C;
}


export function mapSegment(P, F, opts = {}) {
  const tol = opts.tol ?? 0.25, out = [];
  fitMapped(P, F, tol, 0, opts.maxDepth ?? 8, out, opts.samples ?? 24);
  const wasLine = len(sub(P[1], P[0])) < 1e-9 && len(sub(P[2], P[3])) < 1e-9;
  return wasLine ? out.map(C => straighten(C, tol * 0.5)) : out;
}

const pt = a => [a[0], a[1]];

export function mapKnot(k, F) {
  const a = F(k.anchor[0], k.anchor[1]);
  const h = q => { const v = mulJ(a.J, sub(q || k.anchor, k.anchor)); return [a.p[0] + v[0], a.p[1] + v[1]]; };
  const o = { anchor: a.p, in: h(k.in), out: h(k.out) };
  if (k.linked !== undefined) o.linked = k.linked;
  return o;
}







export function warpKnots(sp, F, opts = {}) {
  const K = sp.knots, n = K.length;
  if (!n) return [];
  if (n === 1) return [mapKnot(K[0], F)];
  const closed = sp.closed !== false;
  const segs = closed ? n : n - 1;
  const pieces = [];
  for (let s = 0; s < segs; s++) {
    const a = K[s], b = K[(s + 1) % n];
    pieces.push(mapSegment([pt(a.anchor), pt(a.out || a.anchor), pt(b.in || b.anchor), pt(b.anchor)], F, opts));
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const src = K[k];
    const prev = k > 0 ? pieces[k - 1] : (closed ? pieces[segs - 1] : null);
    const next = k < segs ? pieces[k] : null;
    let knot;
    if (prev && next) knot = { anchor: next[0][0], in: prev[prev.length - 1][2], out: next[0][1] };
    else { const m = mapKnot(src, F); knot = { anchor: m.anchor, in: prev ? prev[prev.length - 1][2] : m.in, out: next ? next[0][1] : m.out }; }
    if (src.linked !== undefined) knot.linked = src.linked;
    out.push(knot);
    if (next) for (let j = 1; j < next.length; j++)            
      out.push({ anchor: next[j][0], in: next[j - 1][2], out: next[j][1], linked: true });
  }
  return out.map(k => ({ ...k, anchor: pt(k.anchor), in: pt(k.in), out: pt(k.out) }));
}


export function warpError(sp, knotsOut, F, closedOut = sp.closed !== false, samples = 64) {
  const polyOf = (K, closed) => { const pts = []; const n = K.length, segs = closed ? n : n - 1;
    for (let s = 0; s < segs; s++) { const a = K[s], b = K[(s + 1) % n]; const P = [a.anchor, a.out || a.anchor, b.in || b.anchor, b.anchor];
      for (let i = 0; i < 200; i++) pts.push(bez(P, i / 200)); } return pts; };
  const poly = polyOf(knotsOut, closedOut);
  let e = 0; const K = sp.knots, n = K.length, segs = sp.closed !== false ? n : n - 1;
  for (let s = 0; s < segs; s++) { const a = K[s], b = K[(s + 1) % n]; const P = [a.anchor, a.out || a.anchor, b.in || b.anchor, b.anchor];
    for (let i = 0; i <= samples; i++) { const q = bez(P, i / samples), m = F(q[0], q[1]).p;
      let d = Infinity; for (let j = 0; j < poly.length - 1; j++) { const A = poly[j], B = poly[j + 1], ab = sub(B, A), l2 = dot(ab, ab);
        const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(m, A), ab) / l2)) : 0; const dd = len(sub(m, [A[0] + ab[0] * t, A[1] + ab[1] * t])); if (dd < d) d = dd; }
      if (d > e) e = d; } }
  return e;
}
