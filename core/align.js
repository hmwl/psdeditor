























import { detectAndDescribe, matchFeatures, toGray, gaussBlur } from './features.js';


export function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
export function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !Number.isFinite(det)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}
export function apply3(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function solve(A, b, n) {
  const M = Float64Array.from(A), v = Float64Array.from(b);
  for (let c = 0; c < n; c++) {
    let p = c, pv = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) { const q = Math.abs(M[r * n + c]); if (q > pv) { pv = q; p = r; } }
    if (pv < 1e-12) return null;
    if (p !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; } const t = v[c]; v[c] = v[p]; v[p] = t; }
    const d = M[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / d; if (!f) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
      v[r] -= f * v[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = v[r]; for (let k = r + 1; k < n; k++) s -= M[r * n + k] * x[k]; x[r] = s / M[r * n + r]; }
  return x;
}

function lsq(rows, rhs, n, ridge = 0) {
  const A = new Float64Array(n * n), b = new Float64Array(n);
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k], y = rhs[k];
    for (let i = 0; i < n; i++) { if (!r[i]) continue; b[i] += r[i] * y; for (let j = 0; j < n; j++) A[i * n + j] += r[i] * r[j]; }
  }
  if (ridge) for (let i = 0; i < n; i++) A[i * n + i] += ridge;
  return solve(A, b, n);
}


function normT(pts) {
  let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
  let d = 0; for (const p of pts) d += Math.hypot(p[0] - mx, p[1] - my); d = d / pts.length || 1;
  const s = Math.SQRT2 / d;
  return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
}
export function fitTranslation(P, Q) {
  let dx = 0, dy = 0; for (let k = 0; k < P.length; k++) { dx += Q[k][0] - P[k][0]; dy += Q[k][1] - P[k][1]; }
  return [1, 0, dx / P.length, 0, 1, dy / P.length, 0, 0, 1];
}

export function fitSimilarity(P, Q) {
  const n = P.length; let px = 0, py = 0, qx = 0, qy = 0;
  for (let k = 0; k < n; k++) { px += P[k][0]; py += P[k][1]; qx += Q[k][0]; qy += Q[k][1]; }
  px /= n; py /= n; qx /= n; qy /= n;
  let a = 0, b = 0, s2 = 0;
  for (let k = 0; k < n; k++) {
    const x = P[k][0] - px, y = P[k][1] - py, u = Q[k][0] - qx, v = Q[k][1] - qy;
    a += x * u + y * v; b += x * v - y * u; s2 += x * x + y * y;
  }
  if (!s2) return fitTranslation(P, Q);
  const c = a / s2, s = b / s2;
  return [c, -s, qx - c * px + s * py, s, c, qy - s * px - c * py, 0, 0, 1];
}
export function fitAffine(P, Q) {
  const rows = [], rhs = [];
  for (let k = 0; k < P.length; k++) {
    const [x, y] = P[k];
    rows.push([x, y, 1, 0, 0, 0]); rhs.push(Q[k][0]);
    rows.push([0, 0, 0, x, y, 1]); rhs.push(Q[k][1]);
  }
  const s = lsq(rows, rhs, 6); if (!s) return null;
  return [s[0], s[1], s[2], s[3], s[4], s[5], 0, 0, 1];
}

export function fitHomography(P, Q) {
  if (P.length < 4) return null;
  const Tp = normT(P), Tq = normT(Q);
  const rows = [], rhs = [];
  for (let k = 0; k < P.length; k++) {
    const [x, y] = apply3(Tp, P[k][0], P[k][1]), [u, v] = apply3(Tq, Q[k][0], Q[k][1]);
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.push(v);
  }
  const s = lsq(rows, rhs, 8); if (!s) return null;
  const Hn = [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
  const Tqi = inv3(Tq); if (!Tqi) return null;
  const H = mul3(Tqi, mul3(Hn, Tp));
  const k = H[8]; if (!k) return null;
  return H.map(v => v / k);
}
const FIT = { translation: [fitTranslation, 1], similarity: [fitSimilarity, 2], affine: [fitAffine, 3], homography: [fitHomography, 4] };


export function ransac(P, Q, model, opt = {}) {
  const [fit, need] = FIT[model];
  const n = P.length;
  if (n < need) return null;
  const thr = opt.threshold || 3, thr2 = thr * thr;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let best = null, bestN = 0, bestErr = Infinity;
  let iters = opt.iterations || 1500;
  const idx = new Array(need);
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < need; k++) { let r; do { r = (rnd() * n) | 0; } while (idx.slice(0, k).includes(r)); idx[k] = r; }
    const M = fit(idx.map(i => P[i]), idx.map(i => Q[i]));
    if (!M || M.some(v => !Number.isFinite(v))) continue;
    if (model === 'homography' && !sane(M)) continue;
    let cnt = 0, err = 0;
    for (let k = 0; k < n; k++) {
      const [x, y] = apply3(M, P[k][0], P[k][1]);
      const e = (x - Q[k][0]) ** 2 + (y - Q[k][1]) ** 2;
      if (e < thr2) { cnt++; err += e; }
    }
    if (cnt > bestN || (cnt === bestN && err < bestErr)) {
      bestN = cnt; bestErr = err; best = M;
      const w = cnt / n, pNo = 1 - Math.pow(w, need);
      if (pNo < 1e-9) break;
      const need2 = Math.ceil(Math.log(1 - 0.999) / Math.log(pNo));
      if (need2 < iters) iters = Math.max(it + 1, need2);
    }
  }
  if (!best) return null;
  
  let M = best, inl = [];
  for (let round = 0; round < 3; round++) {
    inl = [];
    for (let k = 0; k < n; k++) { const [x, y] = apply3(M, P[k][0], P[k][1]); if ((x - Q[k][0]) ** 2 + (y - Q[k][1]) ** 2 < thr2) inl.push(k); }
    if (inl.length < need) break;
    const M2 = fit(inl.map(i => P[i]), inl.map(i => Q[i]));
    if (!M2 || (model === 'homography' && !sane(M2))) break;
    M = M2;
  }
  return { M, inliers: inl };
}

function sane(H) {
  const det = H[0] * H[4] - H[1] * H[3];
  if (!(det > 0.05 && det < 20)) return false;
  if (Math.abs(H[6]) > 0.01 || Math.abs(H[7]) > 0.01) return false;
  return true;
}



function refinePairs(gA, wA, hA, gB, wB, hB, P, Q, M, r = 5, s = 2) {
  const outP = [], outQ = [];
  const n = (2 * r + 1) ** 2;
  const patch = new Float32Array(n);
  const bil = (g, w, h, x, y) => {
    if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return NaN;
    const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, o = y0 * w + x0;
    return (g[o] * (1 - tx) + g[o + 1] * tx) * (1 - ty) + (g[o + w] * (1 - tx) + g[o + w + 1] * tx) * ty;
  };
  for (let k = 0; k < P.length; k++) {
    const [ax, ay] = P[k];
    const ix = Math.round(ax), iy = Math.round(ay);
    if (ix - r < 0 || iy - r < 0 || ix + r >= wA || iy + r >= hA) continue;
    let m = 0, q = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const v = gA[(iy + dy) * wA + ix + dx]; patch[q++] = v; m += v; }
    m /= n; let var0 = 0; for (let t = 0; t < n; t++) { patch[t] -= m; var0 += patch[t] * patch[t]; }
    if (var0 < n * 4) continue;               
    
    const [bx, by] = apply3(M, ix, iy);
    const [bx1] = apply3(M, ix + 1, iy), [, by1] = apply3(M, ix, iy + 1);
    const [bxy] = apply3(M, ix, iy + 1), [, byx] = apply3(M, ix + 1, iy);
    const J = [bx1 - bx, bxy - bx, byx - by, by1 - by];
    const S = new Float32Array((2 * s + 1) ** 2);
    let bi = -1, bv = Infinity;
    const cand = new Float32Array(n);
    for (let oy = -s; oy <= s; oy++) for (let ox = -s; ox <= s; ox++) {
      let mm = 0, t = 0, ok = true;
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) {
        const v = bil(gB, wB, hB, bx + ox + J[0] * dx + J[1] * dy, by + oy + J[2] * dx + J[3] * dy);
        if (!(v === v)) { ok = false; break; }
        cand[t++] = v; mm += v;
      }
      const si = (oy + s) * (2 * s + 1) + (ox + s);
      if (!ok) { S[si] = Infinity; continue; }
      mm /= n; let e = 0; for (let u = 0; u < n; u++) { const d = cand[u] - mm - patch[u]; e += d * d; }
      S[si] = e; if (e < bv) { bv = e; bi = si; }
    }
    if (bi < 0) continue;
    const W = 2 * s + 1, cx = bi % W, cy = (bi / W) | 0;
    if (cx === 0 || cy === 0 || cx === W - 1 || cy === W - 1) continue;   
    const l = S[bi - 1], rr = S[bi + 1], u = S[bi - W], d = S[bi + W], c = S[bi];
    const ddx = l - 2 * c + rr, ddy = u - 2 * c + d;
    const fx = ddx > 0 ? (l - rr) / (2 * ddx) : 0, fy = ddy > 0 ? (u - d) / (2 * ddy) : 0;
    if (bv > var0 * 0.5) continue;             
    outP.push([ix, iy]); outQ.push([bx + cx - s + fx, by + cy - s + fy]);
  }
  return { P: outP, Q: outQ };
}


function focalsFromH(H) {
  const h = H;
  let f0 = 0, f1 = 0, d1, d2, v1, v2;
  d1 = h[6] * h[7]; d2 = (h[7] - h[6]) * (h[7] + h[6]);
  v1 = -(h[0] * h[1] + h[3] * h[4]) / d1; v2 = (h[0] * h[0] + h[3] * h[3] - h[1] * h[1] - h[4] * h[4]) / d2;
  if (v1 < v2) [v1, v2] = [v2, v1];
  if (v1 > 0 && v2 > 0) f1 = Math.sqrt(Math.abs(d1) > Math.abs(d2) ? v1 : v2); else if (v1 > 0) f1 = Math.sqrt(v1);
  d1 = h[0] * h[3] + h[1] * h[4]; d2 = h[0] * h[0] + h[1] * h[1] - h[3] * h[3] - h[4] * h[4];
  v1 = -h[2] * h[5] / d1; v2 = (h[5] * h[5] - h[2] * h[2]) / d2;
  if (v1 < v2) [v1, v2] = [v2, v1];
  if (v1 > 0 && v2 > 0) f0 = Math.sqrt(Math.abs(d1) > Math.abs(d2) ? v1 : v2); else if (v1 > 0) f0 = Math.sqrt(v1);
  return f0 > 0 && f1 > 0 && Number.isFinite(f0) && Number.isFinite(f1) ? Math.sqrt(f0 * f1) : 0;
}



export function undistortPt(x, y, cam) {
  if (!cam.k1) return [x, y];
  const dx = x - cam.cx, dy = y - cam.cy, r2 = (dx * dx + dy * dy) / (cam.R * cam.R), k = 1 + cam.k1 * r2;
  return [cam.cx + dx * k, cam.cy + dy * k];
}
export function distortPt(x, y, cam) {
  if (!cam.k1) return [x, y];
  const ux = x - cam.cx, uy = y - cam.cy, ru = Math.hypot(ux, uy) / cam.R;
  let rd = ru;
  for (let it = 0; it < 8; it++) rd = ru / (1 + cam.k1 * rd * rd);
  const k = ru > 1e-12 ? rd / ru : 1;
  return [cam.cx + ux * k, cam.cy + uy * k];
}
function toSurface(kind, f, cx, cy, x, y) {
  const dx = x - cx, dy = y - cy;
  if (kind === 'cylindrical') { const t = Math.atan2(dx, f); return [f * t, f * dy / Math.hypot(dx, f)]; }
  const t = Math.atan2(dx, f), p = Math.atan2(dy, Math.hypot(dx, f));
  return [f * t, f * p];
}
function fromSurface(kind, f, cx, cy, u, v) {
  const t = u / f;
  if (Math.abs(t) >= Math.PI / 2 - 1e-3) return null;
  const x = cx + f * Math.tan(t);
  if (kind === 'cylindrical') return [x, cy + (v / f) * f / Math.cos(t)];
  const p = v / f;
  if (Math.abs(p) >= Math.PI / 2 - 1e-3) return null;
  return [x, cy + f * Math.tan(p) / Math.cos(t)];
}







export function makeMapper(m) {
  const cam = m.cam;
  if (m.kind === 'h') {
    const Hi = inv3(m.H);
    return {
      fwd: (x, y) => { const [u, v] = undistortPt(x, y, cam); return apply3(m.H, u, v); },
      inv: (X, Y) => { const w = Hi[6] * X + Hi[7] * Y + Hi[8]; if (w <= 1e-9) return null; const u = (Hi[0] * X + Hi[1] * Y + Hi[2]) / w, v = (Hi[3] * X + Hi[4] * Y + Hi[5]) / w; return distortPt(u, v, cam); },
    };
  }
  const Mi = inv3(m.M);
  return {
    fwd: (x, y) => { const [u, v] = undistortPt(x, y, cam); const s = toSurface(m.kind, m.f, cam.cx, cam.cy, u, v); return apply3(m.M, s[0], s[1]); },
    inv: (X, Y) => { const s = apply3(Mi, X, Y); const p = fromSurface(m.kind, m.f, cam.cx, cam.cy, s[0], s[1]); return p ? distortPt(p[0], p[1], cam) : null; },
  };
}



const MODEL_OF = { perspective: 'homography', collage: 'similarity', reposition: 'translation', cylindrical: 'similarity', spherical: 'similarity' };
export const PROJECTIONS = { auto: '自动', perspective: '透视', collage: '拼贴', cylindrical: '圆柱', spherical: '球面', reposition: '调整位置' };













export function alignImages(imgs, opt = {}) {
  const n = imgs.length;
  const want = opt.projection || 'auto';
  const maxDim = opt.maxDim || 1600;
  const feats = [], grays = [], scales = [];
  for (const im of imgs) {
    const s = Math.min(1, maxDim / Math.max(im.width, im.height));
    let rgba = im.rgba, w = im.width, h = im.height;
    if (s < 1) ({ rgba, w, h } = shrinkRGBA(im.rgba, im.width, im.height, s));
    scales.push(s);
    const f = detectAndDescribe(rgba, w, h, { maxFeatures: opt.maxFeatures || 2000 });
    feats.push({ ...f, w, h });
    grays.push({ g: gaussBlur(toGray(rgba, w, h).g, w, h, 0.7), w, h });
  }
  
  const pairs = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const m = matchFeatures(feats[a], feats[b]);
    if (m.length < 8) continue;
    const P = m.map(t => [feats[a].kps[t.i].x, feats[a].kps[t.i].y]), Q = m.map(t => [feats[b].kps[t.j].x, feats[b].kps[t.j].y]);
    const thr = Math.max(2, 2.5 * Math.max(feats[a].w, feats[a].h) / 1000);
    const rh = ransac(P, Q, 'homography', { threshold: thr });
    if (!rh || rh.inliers.length < 12) continue;
    
    if (rh.inliers.length < 0.08 * m.length && rh.inliers.length < 30) continue;
    let iP = rh.inliers.map(i => P[i]), iQ = rh.inliers.map(i => Q[i]);
    const ref = refinePairs(grays[a].g, grays[a].w, grays[a].h, grays[b].g, grays[b].w, grays[b].h, iP, iQ, rh.M);
    if (ref.P.length >= 12) { iP = ref.P; iQ = ref.Q; }
    
    const sa = scales[a], sb = scales[b];
    iP = iP.map(p => [(p[0] + 0.5) / sa - 0.5, (p[1] + 0.5) / sa - 0.5]);
    iQ = iQ.map(p => [(p[0] + 0.5) / sb - 0.5, (p[1] + 0.5) / sb - 0.5]);
    pairs.push({ a, b, P: iP, Q: iQ, H: fitHomography(iP, iQ) || scaleH(rh.M, sa, sb), n: iP.length });
  }
  if (!pairs.length && n > 1) return { ok: false, message: '图层之间找不到足够的共同特征点：请确认它们有重叠（建议 25%～40%），且重叠区里有纹理（纯色天空 / 白墙对不上）', projection: want, maps: [], stats: [] };

  
  const cams = imgs.map(im => ({ cx: (im.width - 1) / 2, cy: (im.height - 1) / 2, R: Math.hypot(im.width, im.height) / 2, k1: 0 }));

  
  let refIdx = opt.reference;
  if (refIdx == null) {
    if (want === 'perspective' || want === 'auto' || want === 'cylindrical' || want === 'spherical') refIdx = centralImage(n, pairs);
    else refIdx = 0;
  }

  
  const fs = pairs.map(p => focalsFromH(centerH(p.H, cams[p.a], cams[p.b]))).filter(f => f > 0);
  fs.sort((x, y) => x - y);
  const longSide = Math.max(...imgs.map(im => Math.max(im.width, im.height)));
  let focal = fs.length ? fs[fs.length >> 1] : 0;
  if (!(focal > longSide * 0.3 && focal < longSide * 20)) focal = longSide * 1.5;

  let projection = want;
  let solved = null;
  const solve1 = proj => solveGlobal(n, pairs, cams, refIdx, proj, focal);
  if (want === 'auto') {
    solved = solve1('perspective');
    const bad = !solved.ok || solved.maps.some((m, i) => m && m.kind === 'h' && distortionRatio(m.H, imgs[i]) > 3);
    if (bad) { projection = 'cylindrical'; solved = solve1('cylindrical'); }
    else projection = 'perspective';
  } else solved = solve1(want);
  if (!solved.ok) return { ok: false, message: solved.message, projection, maps: [], stats: [] };

  
  let k1 = 0;
  if (opt.distortion && pairs.length) {
    const cost = k => { for (const c of cams) c.k1 = k; const r = solve1(projection); return r.ok ? r.err : Infinity; };
    let lo = -0.3, hi = 0.3; const gr = (Math.sqrt(5) - 1) / 2;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = cost(c), fd = cost(d);
    for (let it = 0; it < 24; it++) {
      if (fc < fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = cost(c); }
      else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = cost(d); }
    }
    k1 = (lo + hi) / 2;
    const f0 = cost(0);
    if (!(cost(k1) < f0 * 0.97)) k1 = 0;       
    for (const c2 of cams) c2.k1 = k1;
    solved = solve1(projection);
  }

  
  let vignette = null, gains = imgs.map(() => 1);
  if (opt.vignette || opt.gains) {
    const r = estimateVignette(imgs, pairs, cams, !!opt.vignette);
    if (r) { vignette = opt.vignette ? r.vig : null; gains = r.gains; }
  }
  for (let i = 0; i < n; i++) if (solved.maps[i]) solved.maps[i].cam = cams[i];

  
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const m = solved.maps[i]; if (!m) continue;
    const mp = makeMapper(m), im = imgs[i];
    const N = 16;
    for (let k = 0; k <= N; k++) for (const [x, y] of [[k / N * (im.width - 1), 0], [k / N * (im.width - 1), im.height - 1], [0, k / N * (im.height - 1)], [im.width - 1, k / N * (im.height - 1)]]) {
      const [X, Y] = mp.fwd(x, y);
      if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
  }
  const stats = pairs.map(p => ({ a: p.a, b: p.b, matches: p.n, rms: pairRms(p, solved.maps, cams) }));
  return { ok: true, projection, reference: refIdx, maps: solved.maps, bbox: { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1 + 1), y1: Math.ceil(y1 + 1) },
    gains, vignette, k1, focal, stats, unaligned: solved.maps.map((m, i) => m ? -1 : i).filter(i => i >= 0) };
}

function scaleH(H, sa, sb) {
  const A = [sa, 0, 0.5 * sa - 0.5, 0, sa, 0.5 * sa - 0.5, 0, 0, 1];
  const Bi = [1 / sb, 0, (0.5 - 0.5 * sb) / sb, 0, 1 / sb, (0.5 - 0.5 * sb) / sb, 0, 0, 1];
  return mul3(Bi, mul3(H, A));
}
function centerH(H, ca, cb) {
  const Ta = [1, 0, ca.cx, 0, 1, ca.cy, 0, 0, 1], Tb = [1, 0, -cb.cx, 0, 1, -cb.cy, 0, 0, 1];
  const M = mul3(Tb, mul3(H, Ta)); const k = M[8] || 1; return M.map(v => v / k);
}
function centralImage(n, pairs) {
  
  const adj = Array.from({ length: n }, () => []);
  for (const p of pairs) { adj[p.a].push(p.b); adj[p.b].push(p.a); }
  let best = 0, bs = Infinity;
  for (let s = 0; s < n; s++) {
    const d = new Array(n).fill(Infinity); d[s] = 0; const q = [s];
    while (q.length) { const u = q.shift(); for (const v of adj[u]) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v); } }
    const sum = d.reduce((a, b) => a + (b === Infinity ? n * 10 : b), 0);
    const deg = adj[s].length;
    if (sum < bs || (sum === bs && deg > adj[best].length)) { bs = sum; best = s; }
  }
  return best;
}
function distortionRatio(H, im) {
  const c = [[0, 0], [im.width, 0], [im.width, im.height], [0, im.height]].map(([x, y]) => apply3(H, x, y));
  let a = 0; for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; a += p[0] * q[1] - q[0] * p[1]; }
  a = Math.abs(a) / 2;
  const r = a / (im.width * im.height);
  return Math.max(r, 1 / Math.max(1e-6, r));
}





function solveGlobal(n, pairs, cams, ref, projection, f) {
  let model = MODEL_OF[projection] || 'homography';
  const surf = projection === 'cylindrical' || projection === 'spherical';
  
  const prep = pairs.map(p => {
    const tr = (pt, c) => { const u = undistortPt(pt[0], pt[1], c); return surf ? toSurface(projection, f, c.cx, c.cy, u[0], u[1]) : u; };
    return { a: p.a, b: p.b, P: p.P.map(pt => tr(pt, cams[p.a])), Q: p.Q.map(pt => tr(pt, cams[p.b])) };
  });
  


  if (model === 'homography' && prep.length) {
    const rmsOf = (m, p) => { const r = ransac(p.P, p.Q, m, { threshold: 3 }); if (!r || r.inliers.length < 6) return Infinity;
      let s = 0; for (const i of r.inliers) { const [x, y] = apply3(r.M, p.P[i][0], p.P[i][1]); s += (x - p.Q[i][0]) ** 2 + (y - p.Q[i][1]) ** 2; }
      return Math.sqrt(s / r.inliers.length) * Math.sqrt(p.P.length / r.inliers.length); };
    const hR = prep.map(p => rmsOf('homography', p));
    for (const m of ['similarity', 'affine']) {
      if (prep.every((p, k) => rmsOf(m, p) <= Math.max(hR[k] * 1.2, hR[k] + 0.35))) { model = m; break; }
    }
  }
  
  const edge = [];
  for (const p of prep) {
    const r = ransac(p.P, p.Q, model, { threshold: 3 });
    if (!r || r.inliers.length < 6) continue;
    const Pi = r.inliers.map(i => p.P[i]), Qi = r.inliers.map(i => p.Q[i]);
    edge.push({ a: p.a, b: p.b, M: r.M, P: Pi, Q: Qi, w: Pi.length });
  }
  
  const T = new Array(n).fill(null); T[ref] = I3();
  const done = new Array(n).fill(false); done[ref] = true;
  for (;;) {
    let best = null;
    for (const e of edge) {
      if (done[e.a] && !done[e.b] && (!best || e.w > best.w)) best = { ...e, from: e.a, to: e.b };
      else if (done[e.b] && !done[e.a] && (!best || e.w > best.w)) best = { ...e, from: e.b, to: e.a };
    }
    if (!best) break;
    
    if (best.to === best.b) { const Mi = inv3(best.M); if (!Mi) break; T[best.b] = mul3(T[best.a], Mi); }
    else T[best.a] = mul3(T[best.b], best.M);
    done[best.to] = true;
  }
  if (!done.some((d, i) => d && i !== ref) && n > 1) return { ok: false, message: '没有一张图能和参考图对上' };
  
  refineJoint(T, edge, ref, model, done);
  
  const res = [];
  for (const e of edge) {
    if (!T[e.a] || !T[e.b]) continue;
    for (let k = 0; k < e.P.length; k++) { const A = apply3(T[e.a], e.P[k][0], e.P[k][1]), B = apply3(T[e.b], e.Q[k][0], e.Q[k][1]); res.push(Math.hypot(A[0] - B[0], A[1] - B[1])); }
  }
  res.sort((x, y) => x - y);
  const err = res.length ? res[res.length >> 1] : Infinity;
  const maps = T.map((M, i) => !M ? null : surf ? { kind: projection, f, M, cam: cams[i] } : { kind: 'h', H: M, cam: cams[i] });
  return { ok: true, maps, err };
}

function refineJoint(T, edges, ref, model, done) {
  const idx = [], nP = { translation: 2, similarity: 4, affine: 6, homography: 8 }[model];
  for (let i = 0; i < T.length; i++) if (i !== ref && done[i]) idx.push(i);
  if (!idx.length || !edges.length) return;
  const toP = M => model === 'translation' ? [M[2], M[5]] : model === 'similarity' ? [M[0], M[3], M[2], M[5]] : model === 'affine' ? [M[0], M[1], M[2], M[3], M[4], M[5]] : M.slice(0, 8);
  const fromP = p => model === 'translation' ? [1, 0, p[0], 0, 1, p[1], 0, 0, 1] : model === 'similarity' ? [p[0], -p[1], p[2], p[1], p[0], p[3], 0, 0, 1]
    : model === 'affine' ? [p[0], p[1], p[2], p[3], p[4], p[5], 0, 0, 1] : [...p, 1];
  const N = idx.length * nP;
  if (N > 400) return;
  const pos = new Map(idx.map((i, k) => [i, k * nP]));
  let params = new Float64Array(N);
  for (const i of idx) params.set(toP(T[i]), pos.get(i));
  
  const obs = [];
  for (const e of edges) {
    if (!T[e.a] || !T[e.b]) continue;
    const step = Math.max(1, Math.floor(e.P.length / 150));
    for (let k = 0; k < e.P.length; k += step) obs.push([e.a, e.P[k], e.b, e.Q[k]]);
  }
  const getM = (i, p) => i === ref ? T[ref] : fromP(Array.from(p.subarray(pos.get(i), pos.get(i) + nP)));
  const resid = p => {
    const r = new Float64Array(obs.length * 2);
    obs.forEach(([a, P, b, Q], k) => { const A = apply3(getM(a, p), P[0], P[1]), B = apply3(getM(b, p), Q[0], Q[1]); r[k * 2] = A[0] - B[0]; r[k * 2 + 1] = A[1] - B[1]; });
    return r;
  };
  for (let it = 0; it < 4; it++) {
    const r0 = resid(params);
    
    const wts = new Float64Array(obs.length);
    for (let k = 0; k < obs.length; k++) { const e = Math.hypot(r0[k * 2], r0[k * 2 + 1]); wts[k] = e < 1.5 ? 1 : 1.5 / e; }
    const Jt = [];
    for (let j = 0; j < N; j++) {
      const h = Math.max(1e-6, Math.abs(params[j]) * 1e-6);
      const p2 = Float64Array.from(params); p2[j] += h;
      const r1 = resid(p2); const col = new Float64Array(r0.length);
      for (let k = 0; k < r0.length; k++) col[k] = (r1[k] - r0[k]) / h;
      Jt.push(col);
    }
    const A = new Float64Array(N * N), g = new Float64Array(N);
    for (let a = 0; a < N; a++) {
      for (let b = a; b < N; b++) { let s = 0; const ca = Jt[a], cb = Jt[b]; for (let k = 0; k < r0.length; k++) s += ca[k] * cb[k] * wts[k >> 1]; A[a * N + b] = A[b * N + a] = s; }
      let s = 0; for (let k = 0; k < r0.length; k++) s += Jt[a][k] * r0[k] * wts[k >> 1]; g[a] = -s;
    }
    for (let a = 0; a < N; a++) A[a * N + a] *= 1.0001;
    const d = solve(A, g, N); if (!d) break;
    let step = 0; for (let j = 0; j < N; j++) { params[j] += d[j]; step += Math.abs(d[j]); }
    if (step < 1e-9) break;
  }
  for (const i of idx) T[i] = fromP(Array.from(params.subarray(pos.get(i), pos.get(i) + nP)));
}
function pairRms(p, maps, cams) {
  const A = maps[p.a], B = maps[p.b]; if (!A || !B) return null;
  A.cam = cams[p.a]; B.cam = cams[p.b];
  const ma = makeMapper(A), mb = makeMapper(B);
  let s = 0; for (let k = 0; k < p.P.length; k++) { const a = ma.fwd(p.P[k][0], p.P[k][1]), b = mb.fwd(p.Q[k][0], p.Q[k][1]); s += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; }
  return Math.sqrt(s / Math.max(1, p.P.length));
}


function estimateVignette(imgs, pairs, cams, withVig) {
  const n = imgs.length;
  const rows = [], rhs = [];
  const lum = (im, x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 1 || yi < 1 || xi >= im.width - 1 || yi >= im.height - 1) return NaN;
    let s = 0, a = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const o = ((yi + dy) * im.width + xi + dx) * 4;
      if (im.rgba[o + 3] < 250) return NaN;
      const r = im.rgba[o], g = im.rgba[o + 1], b = im.rgba[o + 2];
      if (Math.max(r, g, b) > 250 || Math.max(r, g, b) < 8) return NaN;   
      s += srgbToLin(0.299 * r + 0.587 * g + 0.114 * b); a++;
    }
    return s / a;
  };
  for (const p of pairs) {
    const A = imgs[p.a], B = imgs[p.b], ca = cams[p.a], cb = cams[p.b];
    const step = Math.max(1, Math.floor(p.P.length / 400));
    for (let k = 0; k < p.P.length; k += step) {
      const la = lum(A, p.P[k][0], p.P[k][1]), lb = lum(B, p.Q[k][0], p.Q[k][1]);
      if (!(la > 0 && lb > 0)) continue;
      const ra = ((p.P[k][0] - ca.cx) ** 2 + (p.P[k][1] - ca.cy) ** 2) / (ca.R * ca.R), rb = ((p.Q[k][0] - cb.cx) ** 2 + (p.Q[k][1] - cb.cy) ** 2) / (cb.R * cb.R);
      const row = new Array(n + 2).fill(0);
      row[p.a] += 1; row[p.b] -= 1;
      if (withVig) { row[n] = ra - rb; row[n + 1] = ra * ra - rb * rb; }
      rows.push(row); rhs.push(Math.log(la) - Math.log(lb));
    }
  }
  if (rows.length < 20) return null;
  
  rows.push([...new Array(n).fill(10), 0, 0]); rhs.push(0);
  const s = lsq(rows, rhs, n + 2, 1e-6);
  if (!s) return null;
  const gains = Array.from(s.subarray(0, n), v => Math.exp(v));
  const vig = withVig ? { a: s[n], b: s[n + 1] } : null;
  return { gains, vig };
}
export const srgbToLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const linToSrgb = v => { v = v <= 0 ? 0 : v >= 1 ? 1 : v; return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };

function shrinkRGBA(src, w, h, s) {
  const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  const out = new Uint8ClampedArray(W * H * 4);
  const k = 1 / s;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx0 = Math.floor(x * k), sy0 = Math.floor(y * k), sx1 = Math.min(w, Math.ceil((x + 1) * k)), sy1 = Math.min(h, Math.ceil((y + 1) * k));
    let r = 0, g = 0, b = 0, a = 0, c = 0;
    for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) { const o = (yy * w + xx) * 4; r += src[o]; g += src[o + 1]; b += src[o + 2]; a += src[o + 3]; c++; }
    const d = (y * W + x) * 4; out[d] = r / c; out[d + 1] = g / c; out[d + 2] = b / c; out[d + 3] = a / c;
  }
  return { rgba: out, w: W, h: H };
}









export function renderWarped(im, map, rect, o = {}) {
  const W = rect.x1 - rect.x0, H = rect.y1 - rect.y0, out = new Uint8ClampedArray(W * H * 4);
  const mp = makeMapper(map), cam = map.cam, src = im.rgba, w = im.width, h = im.height;
  const gain = o.gain || 1, vig = o.vignette;
  const needTone = gain !== 1 || !!vig;
  const lut = needTone ? null : null;
  void lut;
  const lin = needTone ? Float32Array.from({ length: 256 }, (_, v) => srgbToLin(v)) : null;
  
  const G = 8;
  const gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1;
  const gx = new Float64Array(gw * gh), gy = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const p = mp.inv(rect.x0 + Math.min(W, i * G), rect.y0 + Math.min(H, j * G));
    gx[j * gw + i] = p ? p[0] : NaN; gy[j * gw + i] = p ? p[1] : NaN;
  }
  for (let y = 0; y < H; y++) {
    const j = Math.min(gh - 2, (y / G) | 0), ty = (y - j * G) / G;
    for (let x = 0; x < W; x++) {
      const i = Math.min(gw - 2, (x / G) | 0), tx = (x - i * G) / G;
      const q = j * gw + i;
      const sx = (gx[q] * (1 - tx) + gx[q + 1] * tx) * (1 - ty) + (gx[q + gw] * (1 - tx) + gx[q + gw + 1] * tx) * ty;
      const sy = (gy[q] * (1 - tx) + gy[q + 1] * tx) * (1 - ty) + (gy[q + gw] * (1 - tx) + gy[q + gw + 1] * tx) * ty;
      if (!(sx >= -0.5 && sy >= -0.5 && sx <= w - 0.5 && sy <= h - 0.5)) continue;
      const fx = Math.min(w - 1, Math.max(0, sx)), fy = Math.min(h - 1, Math.max(0, sy));
      const x0 = Math.min(w - 2, Math.floor(fx)), y0 = Math.min(h - 2, Math.floor(fy));
      const ax = w > 1 ? fx - x0 : 0, ay = h > 1 ? fy - y0 : 0;
      const o00 = (y0 * w + x0) * 4, o10 = o00 + 4, o01 = o00 + w * 4, o11 = o01 + 4;
      const w00 = (1 - ax) * (1 - ay) * src[o00 + 3], w10 = ax * (1 - ay) * src[o10 + 3], w01 = (1 - ax) * ay * src[o01 + 3], w11 = ax * ay * src[o11 + 3];
      const a = w00 + w10 + w01 + w11;
      if (a <= 0) continue;
      const d = (y * W + x) * 4;
      let k = 1;
      if (needTone) {
        k = 1 / gain;                          
        if (vig) { const r2 = ((sx - cam.cx) ** 2 + (sy - cam.cy) ** 2) / (cam.R * cam.R); k /= Math.max(0.2, Math.exp(vig.a * r2 + vig.b * r2 * r2)); }
      }
      for (let c = 0; c < 3; c++) {
        const v = (src[o00 + c] * w00 + src[o10 + c] * w10 + src[o01 + c] * w01 + src[o11 + c] * w11) / a;
        out[d + c] = needTone ? linToSrgb(lin[Math.round(v)] * k) : v;
      }
      
      const edge = Math.min(1, sx + 0.5, sy + 0.5, w - 0.5 - sx, h - 0.5 - sy);
      out[d + 3] = a * Math.max(0, Math.min(1, edge + 0.5));
    }
  }
  return out;
}

export default { alignImages, renderWarped, makeMapper, ransac, fitHomography, fitSimilarity, fitTranslation, fitAffine, PROJECTIONS, srgbToLin, linToSrgb };
