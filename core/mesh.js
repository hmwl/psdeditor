

















function bern3(t) { const m = 1 - t; return [m * m * m, 3 * t * m * m, 3 * t * t * m, t * t * t]; }

export function cubicBezier(p0, p1, p2, p3, steps = 24) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, b = bern3(t);
    out.push({ x: b[0] * p0.x + b[1] * p1.x + b[2] * p2.x + b[3] * p3.x,
               y: b[0] * p0.y + b[1] * p1.y + b[2] * p2.y + b[3] * p3.y });
  }
  return out;
}


function patchPoint(P, u, v) {
  const bu = bern3(u), bv = bern3(v);
  let x = 0, y = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const w = bv[r] * bu[c]; x += w * P[r][c].x; y += w * P[r][c].y; }
  return { x, y };
}
function toGrid(points, cols, rows) {
  const g = [];
  for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(points[r * cols + c]); g.push(row); }
  return g;
}






export function warpCageCurves(points, cols, rows, steps = 20) {
  const g = toGrid(points, cols, rows);
  const patchesX = Math.max(1, (cols - 1) / 3), patchesY = Math.max(1, (rows - 1) / 3);
  const rowCurves = [], colCurves = [];
  
  for (let r = 0; r < rows; r++) {
    let line = [];
    for (let px = 0; px < patchesX; px++) {
      const c0 = px * 3;
      const seg = cubicBezier(g[r][c0], g[r][c0 + 1], g[r][c0 + 2], g[r][c0 + 3], steps);
      line = line.concat(px === 0 ? seg : seg.slice(1));
    }
    rowCurves.push(line);
  }
  for (let c = 0; c < cols; c++) {
    let line = [];
    for (let py = 0; py < patchesY; py++) {
      const r0 = py * 3;
      const seg = cubicBezier(g[r0][c], g[r0 + 1][c], g[r0 + 2][c], g[r0 + 3][c], steps);
      line = line.concat(py === 0 ? seg : seg.slice(1));
    }
    colCurves.push(line);
  }
  return { rows: rowCurves, cols: colCurves };
}






export const patchCountX = cols => Math.max(1, (cols - 1) / 3);
export const patchCountY = rows => Math.max(1, (rows - 1) / 3);


export function spanEdges(nPatch, slices) {
  if (Array.isArray(slices) && slices.length === nPatch - 1) return [0, ...slices, 1];
  const out = []; for (let i = 0; i <= nPatch; i++) out.push(i / nPatch);
  return out;
}

function locate(U, edges) {
  const n = edges.length - 1;
  let i = 0; while (i < n - 1 && U >= edges[i + 1]) i++;
  const d = edges[i + 1] - edges[i];
  return { i, t: d > 1e-12 ? (U - edges[i]) / d : 0 };
}


function surfacePointGlobal(grid, cols, rows, U, V, sx, sy) {
  const ex = spanEdges(patchCountX(cols), sx), ey = spanEdges(patchCountY(rows), sy);
  const a = locate(U, ex), b = locate(V, ey);
  const P = [];
  for (let r = 0; r < 4; r++) { const row = []; for (let c = 0; c < 4; c++) row.push(grid[b.i * 3 + r][a.i * 3 + c]); P.push(row); }
  return patchPoint(P, a.t, b.t);
}






export function surfaceIsoCurves(points, cols, rows, linesPerPatch = 3, steps = 10, sx, sy) {
  const grid = toGrid(points, cols, rows);
  const nx = patchCountX(cols), ny = patchCountY(rows);
  const ex = spanEdges(nx, sx), ey = spanEdges(ny, sy);
  const uLines = [], vLines = [];
  const plan=warpSubdivisionPlan(points,cols,rows,Math.max(24,steps*linesPerPatch),{tolerance:.2});
  const samples=(edges,counts)=>{const out=[];for(let i=0;i<counts.length;i++)for(let k=0;k<counts[i];k++)out.push(edges[i]+(edges[i+1]-edges[i])*k/counts[i]);out.push(1);return out;};
  const uSamples=samples(ex,plan.u),vSamples=samples(ey,plan.v);
  
  const paramsAlong = (edges, per) => {
    const out = [];
    for (let i = 0; i < edges.length - 1; i++)
      for (let k = 0; k < per; k++) out.push({ p: edges[i] + (edges[i + 1] - edges[i]) * k / per, isSplit: k === 0 });
    out.push({ p: 1, isSplit: true });
    return out;
  };
  for (const { p: V, isSplit } of paramsAlong(ey, linesPerPatch)) {
    const line = uSamples.map(U=>surfacePointGlobal(grid,cols,rows,U,V,sx,sy));
    line.isSplit = isSplit; line.param = V; vLines.push(line);
  }
  for (const { p: U, isSplit } of paramsAlong(ex, linesPerPatch)) {
    const line = vSamples.map(V=>surfacePointGlobal(grid,cols,rows,U,V,sx,sy));
    line.isSplit = isSplit; line.param = U; uLines.push(line);
  }
  return { u: uLines, v: vLines };
}


export function surfacePoint(points, cols, rows, U, V, sx, sy) {
  return surfacePointGlobal(toGrid(points, cols, rows), cols, rows, U, V, sx, sy);
}



export function patchWeights(cols, rows, U, V, sx, sy) {
  const a = locate(U, spanEdges(patchCountX(cols), sx));
  const b = locate(V, spanEdges(patchCountY(rows), sy));
  const bu = bern3(a.t), bv = bern3(b.t);
  const indices = [], weights = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { indices.push((b.i * 3 + r) * cols + (a.i * 3 + c)); weights.push(bv[r] * bu[c]); }
  return { indices, weights };
}


export function nearestSurfaceParam(points, cols, rows, pt, coarse = 40, sx, sy) {
  const grid = toGrid(points, cols, rows);
  let bU = 0, bV = 0, bd = Infinity;
  for (let i = 0; i <= coarse; i++) for (let j = 0; j <= coarse; j++) {
    const U = i / coarse, V = j / coarse, s = surfacePointGlobal(grid, cols, rows, U, V, sx, sy);
    const d = (s.x - pt.x) ** 2 + (s.y - pt.y) ** 2;
    if (d < bd) { bd = d; bU = U; bV = V; }
  }
  let step = 1 / coarse;
  for (let iter = 0; iter < 6; iter++) {
    step *= 0.5;
    for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]]) {
      const U = Math.max(0, Math.min(1, bU + du)), V = Math.max(0, Math.min(1, bV + dv));
      const s = surfacePointGlobal(grid, cols, rows, U, V, sx, sy);
      const d = (s.x - pt.x) ** 2 + (s.y - pt.y) ** 2;
      if (d < bd) { bd = d; bU = U; bV = V; }
    }
  }
  return { U: bU, V: bV, dist: Math.sqrt(bd) };
}






const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });


function splitCubic(p0, p1, p2, p3, t) {
  const a0 = lerp(p0, p1, t), a1 = lerp(p1, p2, t), a2 = lerp(p2, p3, t);
  const b0 = lerp(a0, a1, t), b1 = lerp(a1, a2, t);
  const c = lerp(b0, b1, t);
  return [p0, a0, b0, c, b1, a2, p3];
}


function fitCubicThrough(q0, q1, q2, q3) {
  const A = { x: 27 * q1.x - 8 * q0.x - q3.x, y: 27 * q1.y - 8 * q0.y - q3.y };  
  const B = { x: 27 * q2.x - q0.x - 8 * q3.x, y: 27 * q2.y - q0.y - 8 * q3.y };  
  return [q0,
    { x: (2 * A.x - B.x) / 18, y: (2 * A.y - B.y) / 18 },
    { x: (2 * B.x - A.x) / 18, y: (2 * B.y - A.y) / 18 },
    q3];
}

const gridToPoints = g => g.flat();
const insertSorted = (arr, v) => [...(arr || []), v].sort((a, b) => a - b);


export function splitMeshU(points, cols, rows, U, sliceX) {
  const nx = patchCountX(cols), ex = spanEdges(nx, sliceX);
  const { i: px, t } = locate(U, ex);
  if (t < 1e-4 || t > 1 - 1e-4) return { points: points.slice(), cols, rows, sliceX: sliceX || [] };
  const g = toGrid(points, cols, rows), c0 = px * 3;
  const ng = g.map(row => {
    const seg = splitCubic(row[c0], row[c0 + 1], row[c0 + 2], row[c0 + 3], t);
    return row.slice(0, c0).concat(seg, row.slice(c0 + 4));
  });
  return { points: gridToPoints(ng), cols: cols + 3, rows, sliceX: insertSorted(sliceX, U) };
}


export function splitMeshV(points, cols, rows, V, sliceY) {
  const ny = patchCountY(rows), ey = spanEdges(ny, sliceY);
  const { i: py, t } = locate(V, ey);
  if (t < 1e-4 || t > 1 - 1e-4) return { points: points.slice(), cols, rows, sliceY: sliceY || [] };
  const g = toGrid(points, cols, rows), r0 = py * 3;
  const cut = [];
  for (let c = 0; c < cols; c++) cut.push(splitCubic(g[r0][c], g[r0 + 1][c], g[r0 + 2][c], g[r0 + 3][c], t));
  const mid = [];
  for (let k = 0; k < 7; k++) { const row = []; for (let c = 0; c < cols; c++) row.push(cut[c][k]); mid.push(row); }
  const ng = g.slice(0, r0).concat(mid, g.slice(r0 + 4));
  return { points: gridToPoints(ng), cols, rows: rows + 3, sliceY: insertSorted(sliceY, V) };
}

const evalSeg = (P, t) => { const w = bern3(t); return { x: w[0] * P[0].x + w[1] * P[1].x + w[2] * P[2].x + w[3] * P[3].x, y: w[0] * P[0].y + w[1] * P[1].y + w[2] * P[2].y + w[3] * P[3].y }; };

function mergeCubicPair(a, b, ratio) {
  const at = s => s < ratio ? evalSeg(a, s / ratio) : evalSeg(b, (s - ratio) / (1 - ratio));
  return fitCubicThrough(a[0], at(1 / 3), at(2 / 3), b[3]);
}


export function unsplitMeshU(points, cols, rows, k, sliceX) {
  const nx = patchCountX(cols);
  if (nx < 2 || k < 1 || k > nx - 1) return { points: points.slice(), cols, rows, sliceX: sliceX || [] };
  const ex = spanEdges(nx, sliceX);
  const ratio = (ex[k] - ex[k - 1]) / (ex[k + 1] - ex[k - 1]);
  const g = toGrid(points, cols, rows), b = k * 3;
  const ng = g.map(row => row.slice(0, b - 3)
    .concat(mergeCubicPair(row.slice(b - 3, b + 1), row.slice(b, b + 4), ratio), row.slice(b + 4)));
  const ns = (sliceX || []).filter((_, i) => i !== k - 1);
  return { points: gridToPoints(ng), cols: cols - 3, rows, sliceX: ns };
}


export function unsplitMeshV(points, cols, rows, k, sliceY) {
  const ny = patchCountY(rows);
  if (ny < 2 || k < 1 || k > ny - 1) return { points: points.slice(), cols, rows, sliceY: sliceY || [] };
  const ey = spanEdges(ny, sliceY);
  const ratio = (ey[k] - ey[k - 1]) / (ey[k + 1] - ey[k - 1]);
  const g = toGrid(points, cols, rows), b = k * 3;
  const merged = [[], [], [], []];
  for (let c = 0; c < cols; c++) {
    const m = mergeCubicPair([g[b - 3][c], g[b - 2][c], g[b - 1][c], g[b][c]],
                             [g[b][c], g[b + 1][c], g[b + 2][c], g[b + 3][c]], ratio);
    for (let i = 0; i < 4; i++) merged[i].push(m[i]);
  }
  const ng = g.slice(0, b - 3).concat(merged, g.slice(b + 4));
  const ns = (sliceY || []).filter((_, i) => i !== k - 1);
  return { points: gridToPoints(ng), cols, rows: rows - 3, sliceY: ns };
}






export function meshTopology(cols, rows) {
  const idx = (r, c) => r * cols + c;
  const roles = new Array(cols * rows).fill('grid');
  const arms = [], anchors = [], anchorHandles = {}, handleAnchor = {};
  for (let r = 0; r < rows; r += 3) for (let c = 0; c < cols; c += 3) { roles[idx(r, c)] = 'corner'; anchors.push(idx(r, c)); }
  for (let r = 0; r < rows; r += 3) for (let c = 0; c < cols; c += 3) {
    const a = idx(r, c); anchorHandles[a] = [];
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const h = idx(nr, nc);
      if (roles[h] === 'corner') continue;
      roles[h] = 'handle';
      anchorHandles[a].push({ i: h, dr, dc });
      handleAnchor[h] = { a, dr, dc };
      arms.push([a, h]);
    }
  }
  return { roles, arms, anchors, anchorHandles, handleAnchor };
}


export function moveControlPoint(points, cols, rows, i, to, { smooth = true } = {}) {
  const T = meshTopology(cols, rows);
  if (T.roles[i] === 'corner') {
    const a = points[i], dx = to.x - a.x, dy = to.y - a.y;
    points[i] = { x: to.x, y: to.y };
    for (const h of T.anchorHandles[i]) { const p = points[h.i]; points[h.i] = { x: p.x + dx, y: p.y + dy }; }
    return points;
  }
  points[i] = { x: to.x, y: to.y };
  const info = T.handleAnchor[i];
  if (!info || !smooth) return points;
  const opp = T.anchorHandles[info.a].find(o => o.dr === -info.dr && o.dc === -info.dc);
  if (!opp) return points;                              
  const A = points[info.a], H = points[i], O = points[opp.i];
  const len = Math.hypot(O.x - A.x, O.y - A.y);
  const vx = A.x - H.x, vy = A.y - H.y, m = Math.hypot(vx, vy);
  if (m > 1e-6 && len > 1e-6) points[opp.i] = { x: A.x + vx / m * len, y: A.y + vy / m * len };
  return points;
}




















export function dragSurfacePoint(base, cols, rows, U, V, delta, sx, sy, { smooth = true } = {}) {
  const pts = base.map(p => ({ x: p.x, y: p.y }));
  const { indices } = patchWeights(cols, rows, U, V, sx, sy);
  const onBorder = i => { const r = Math.floor(i / cols), c = i % cols; return r === 0 || r === rows - 1 || c === 0 || c === cols - 1; };
  
  const b = [1 / 8, 3 / 8, 3 / 8, 1 / 8];
  let wsum = 0;
  for (let k = 0; k < 16; k++) if (!onBorder(indices[k])) wsum += b[k >> 2] * b[k & 3];
  if (wsum < 1e-9) return pts;                        
  
  
  const gain = Math.min(1 / wsum, 2);
  const dx = delta.x * gain, dy = delta.y * gain;
  const T = meshTopology(cols, rows);
  const inPatch = new Set(indices);
  const moved = new Set();
  for (const i of indices) { if (onBorder(i)) continue; pts[i] = { x: pts[i].x + dx, y: pts[i].y + dy }; moved.add(i); }
  
  for (const i of moved) {
    if (T.roles[i] !== 'corner') continue;
    for (const h of T.anchorHandles[i]) if (!inPatch.has(h.i) && !moved.has(h.i)) { pts[h.i] = { x: pts[h.i].x + dx, y: pts[h.i].y + dy }; moved.add(h.i); }
  }
  
  if (smooth) for (const i of moved) {
    const info = T.handleAnchor[i]; if (!info) continue;
    const opp = T.anchorHandles[info.a].find(o => o.dr === -info.dr && o.dc === -info.dc);
    if (!opp || inPatch.has(opp.i)) continue;
    const A = pts[info.a], H = pts[i], O = pts[opp.i];
    const len = Math.hypot(O.x - A.x, O.y - A.y), vx = A.x - H.x, vy = A.y - H.y, m = Math.hypot(vx, vy);
    if (m > 1e-6 && len > 1e-6) pts[opp.i] = { x: A.x + vx / m * len, y: A.y + vy / m * len };
  }
  return pts;
}




export function warpSubdivisionPlan(points,cols,rows,minimum=18,{tolerance=.2,scale=1,maxSubdiv=512}={}){
 const nx=patchCountX(cols),ny=patchCountY(rows),base=Math.max(1,Math.ceil(minimum)),cap=Math.max(base,Math.min(512,maxSubdiv));
 const U=Array(nx).fill(base),V=Array(ny).fill(base),tol=Math.max(.001,tolerance/Math.max(1,scale));
 const norm=(x,y)=>Math.hypot(x,y),at=(px,py,c,r)=>points[(py*3+r)*cols+px*3+c];
 for(let py=0;py<ny;py++)for(let px=0;px<nx;px++){
  let uu=0,vv=0,uv=0;
  for(let r=0;r<4;r++)for(let c=0;c<2;c++){const a=at(px,py,c,r),b=at(px,py,c+1,r),d=at(px,py,c+2,r);uu=Math.max(uu,6*norm(a.x-2*b.x+d.x,a.y-2*b.y+d.y));}
  for(let c=0;c<4;c++)for(let r=0;r<2;r++){const a=at(px,py,c,r),b=at(px,py,c,r+1),d=at(px,py,c,r+2);vv=Math.max(vv,6*norm(a.x-2*b.x+d.x,a.y-2*b.y+d.y));}
  for(let r=0;r<3;r++)for(let c=0;c<3;c++){const a=at(px,py,c,r),b=at(px,py,c+1,r),d=at(px,py,c,r+1),e=at(px,py,c+1,r+1);uv=Math.max(uv,9*norm(e.x-b.x-d.x+a.x,e.y-b.y-d.y+a.y));}
  let u=Math.max(base,Math.ceil(Math.sqrt(3*uu/(8*tol)))),v=Math.max(base,Math.ceil(Math.sqrt(3*vv/(8*tol))));
  const factor=Math.max(1,Math.sqrt(3*uv/(4*tol*u*v)));u=Math.ceil(u*factor);v=Math.ceil(v*factor);
  U[px]=Math.max(U[px],Math.min(cap,u));V[py]=Math.max(V[py],Math.min(cap,v));
 }
 return {u:U,v:V,tolerance:tol};
}
export function tessellateWarp(points, cols, rows, subdiv = 18, sx, sy, options={}) {
  const grid = toGrid(points, cols, rows);
  const patchesX = patchCountX(cols), patchesY = patchCountY(rows);
  const ex = spanEdges(patchesX, sx), ey = spanEdges(patchesY, sy);
  const positions = [], uvs = [], indices = [];
  const plan=options.adaptive===false?{u:Array(patchesX).fill(subdiv),v:Array(patchesY).fill(subdiv)}:warpSubdivisionPlan(points,cols,rows,subdiv,options);
  let base = 0;
  for (let py = 0; py < patchesY; py++) for (let px = 0; px < patchesX; px++) {
    const P = [];
    for (let r = 0; r < 4; r++) { const rr = py * 3 + r, row = []; for (let c = 0; c < 4; c++) row.push(grid[rr][px * 3 + c]); P.push(row); }
    const Nu=plan.u[px],Nv=plan.v[py];
    for (let iv = 0; iv <= Nv; iv++) for (let iu = 0; iu <= Nu; iu++) {
      const lu = iu / Nu, lv = iv / Nv, p = patchPoint(P, lu, lv);
      positions.push(p.x, p.y);
      
      uvs.push(ex[px] + (ex[px + 1] - ex[px]) * lu, ey[py] + (ey[py + 1] - ey[py]) * lv);
    }
    const stride = Nu + 1;
    for (let iv = 0; iv < Nv; iv++) for (let iu = 0; iu < Nu; iu++) {
      const a = base + iv * stride + iu, b = a + 1, c = a + stride, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
    base += (Nu+1)*(Nv+1);
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}
