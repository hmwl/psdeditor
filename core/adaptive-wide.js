




















const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const MODELS = [['fisheye', '鱼眼'], ['perspective', '透视'], ['auto', '自动'], ['spherical', '完整球面']];


function srcToDir(model, x, y, cx, cy, f, w, h) {
  if (model === 'spherical') {
    const lon = (x / w - 0.5) * TAU, lat = (y / h - 0.5) * Math.PI;
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  }
  const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
  if (model === 'perspective') { const n = Math.hypot(dx / f, dy / f, 1); return [dx / f / n, dy / f / n, 1 / n]; }
  let th;
  if (model === 'auto') th = 2 * Math.asin(clamp(r / (2 * f), -1, 1));
  else th = r / f;                                          
  if (r < 1e-9) return [0, 0, 1];
  const s = Math.sin(th) / r;
  return [dx * s, dy * s, Math.cos(th)];
}
function dirToSrc(model, d, cx, cy, f, w, h) {
  if (model === 'spherical') {
    const lon = Math.atan2(d[0], d[2]), lat = Math.asin(clamp(d[1], -1, 1));
    return [(lon / TAU + 0.5) * w, (lat / Math.PI + 0.5) * h];
  }
  const th = Math.acos(clamp(d[2], -1, 1)), rr = Math.hypot(d[0], d[1]);
  if (rr < 1e-12) return [cx, cy];
  let r;
  if (model === 'perspective') { if (d[2] <= 1e-6) return null; r = f * Math.tan(th); }
  else if (model === 'auto') r = 2 * f * Math.sin(th / 2);
  else r = f * th;
  return [cx + d[0] / rr * r, cy + d[1] / rr * r];
}

function dirToBase(model, d, f, w, h) {
  if (model === 'spherical') { const lon = Math.atan2(d[0], d[2]), lat = Math.asin(clamp(d[1], -1, 1)); return [lon / TAU * w, lat / Math.PI * h]; }
  if (model === 'perspective') { if (d[2] <= 1e-6) return null; return [d[0] / d[2] * f, d[1] / d[2] * f]; }
  
  const k = 2 * f / (1 + d[2]); if (!isFinite(k) || k > 1e7) return null;
  return [d[0] * k, d[1] * k];
}
function baseToDir(model, b, f, w, h) {
  if (model === 'spherical') { const lon = b[0] / w * TAU, lat = clamp(b[1] / h * Math.PI, -Math.PI / 2, Math.PI / 2); return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]; }
  if (model === 'perspective') { const n = Math.hypot(b[0] / f, b[1] / f, 1); return [b[0] / f / n, b[1] / f / n, 1 / n]; }
  const X = b[0] / (2 * f), Y = b[1] / (2 * f), q = X * X + Y * Y;
  return [2 * X / (1 + q), 2 * Y / (1 + q), (1 - q) / (1 + q)];
}

function arcPoint(a, b, t, long) {
  if (!long) return slerp(a, b, t);
  const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1), om = Math.acos(d);
  let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const nl = Math.hypot(...n) || 1; n = n.map(v => v / nl);
  const e = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const ph = (om - TAU) * t, c = Math.cos(ph), s = Math.sin(ph);
  return [a[0] * c + e[0] * s, a[1] * c + e[1] * s, a[2] * c + e[2] * s];
}
const slerp = (a, b, t) => {
  const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1), om = Math.acos(d);
  if (om < 1e-6) return a.slice();
  const s = Math.sin(om), ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
};


const U = r2 => (r2 <= 1e-12 ? 0 : r2 * Math.log(r2) * 0.5);
function solve(A, B) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-12) continue;
    [A[i], A[p]] = [A[p], A[i]]; [B[i], B[p]] = [B[p], B[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue; const k = A[r][i] / A[i][i]; if (!k) continue;
      for (let c = i; c < n; c++) A[r][c] -= k * A[i][c];
      B[r][0] -= k * B[i][0]; B[r][1] -= k * B[i][1];
    }
  }
  return B.map((b, i) => (Math.abs(A[i][i]) < 1e-12 ? [0, 0] : [b[0] / A[i][i], b[1] / A[i][i]]));
}

export function fitTPS(src, dst, lambda) {
  const n = src.length;
  if (!n) return (x, y) => [x, y];
  
  let mx = 0, my = 0; for (const p of src) { mx += p[0]; my += p[1]; } mx /= n; my /= n;
  let sc = 0; for (const p of src) sc = Math.max(sc, Math.abs(p[0] - mx), Math.abs(p[1] - my)); sc = sc || 1;
  const S = src.map(p => [(p[0] - mx) / sc, (p[1] - my) / sc]);
  const N = n + 3, A = Array.from({ length: N }, () => new Float64Array(N)), B = Array.from({ length: N }, () => [0, 0]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { const dx = S[i][0] - S[j][0], dy = S[i][1] - S[j][1]; A[i][j] = U(dx * dx + dy * dy); }
    A[i][i] += lambda ? lambda[i] : 0;
    A[i][n] = 1; A[i][n + 1] = S[i][0]; A[i][n + 2] = S[i][1];
    A[n][i] = 1; A[n + 1][i] = S[i][0]; A[n + 2][i] = S[i][1];
    B[i] = [(dst[i][0] - src[i][0]) / sc, (dst[i][1] - src[i][1]) / sc];   
  }
  const W = solve(A.map(r => Array.from(r)), B);
  return (x, y) => {
    const X = (x - mx) / sc, Y = (y - my) / sc;
    let ox = W[n][0] + W[n + 1][0] * X + W[n + 2][0] * Y, oy = W[n][1] + W[n + 1][1] * X + W[n + 2][1] * Y;
    for (let i = 0; i < n; i++) { const dx = X - S[i][0], dy = Y - S[i][1], u = U(dx * dx + dy * dy); ox += W[i][0] * u; oy += W[i][1] * u; }
    return [x + ox * sc, y + oy * sc];
  };
}


export function focalPx(params, w) {
  const mm = clamp(+params.focal || 10, 1, 1000), crop = clamp(+params.crop || 1, 0.1, 20);
  return mm / (36 / crop) * w;
}
export function buildModel(w, h, params) {
  const model = params.model || 'fisheye';
  const cx = w / 2, cy = h / 2, f = focalPx(params, w), sc = clamp((+params.scale || 100) / 100, 0.05, 10);
  const s2d = (x, y) => srcToDir(model, x, y, cx, cy, f, w, h);
  const d2s = d => dirToSrc(model, d, cx, cy, f, w, h);
  const d2b = d => dirToBase(model, d, f, w, h);
  const b2d = b => baseToDir(model, b, f, w, h);
  
  const K = 14, src = [], dst = [], lam = [];
  const cons = (params.constraints || []).filter(c => c && c.a && c.b);
  
  const isLong = c => {
    if (model !== 'spherical') return false;
    const m = d2s(slerp(s2d(c.a[0], c.a[1]), s2d(c.b[0], c.b[1]), 0.5));
    const lo = Math.min(c.a[0], c.b[0]), hi = Math.max(c.a[0], c.b[0]);
    return !!m && (m[0] < lo - 1 || m[0] > hi + 1);
  };
  const samples = [];
  for (const c of cons) {
    const da = s2d(c.a[0], c.a[1]), db = s2d(c.b[0], c.b[1]);
    const pts = [];
    const lg = isLong(c);
    for (let k = 0; k <= K; k++) { const b = d2b(arcPoint(da, db, k / K, lg)); if (b) pts.push(b); }
    if (pts.length < 3) continue;
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    let dirx, diry;
    if (c.type === 'h') { dirx = 1; diry = 0; }
    else if (c.type === 'v') { dirx = 0; diry = 1; }
    else { 
      let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; sxy += x * y; syy += y * y; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); dirx = Math.cos(th); diry = Math.sin(th);
    }
    for (const p of pts) {
      const t = (p[0] - mx) * dirx + (p[1] - my) * diry;
      src.push(p); dst.push([mx + dirx * t, my + diry * t]); lam.push(1e-4);
      samples.push(p);
    }
  }
  
  if (src.length) {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h], [cx, 0], [cx, h], [0, cy], [w, cy]]) { const b = d2b(s2d(x, y)); if (!b) continue; bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bx1 = Math.max(bx1, b[0]); by1 = Math.max(by1, b[1]); }
    const G = 7, minD = Math.max(bx1 - bx0, by1 - by0) / (G * 1.6);
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const p = [bx0 + (bx1 - bx0) * i / G, by0 + (by1 - by0) * j / G];
      if (samples.some(s => Math.hypot(s[0] - p[0], s[1] - p[1]) < minD)) continue;
      src.push(p); dst.push(p); lam.push(0.05);
    }
  }
  const fwd = src.length ? fitTPS(src, dst, lam) : (x, y) => [x, y];
  const inv = src.length ? fitTPS(dst, src, lam) : (x, y) => [x, y];
  const M = {
    w, h, f, model, scale: sc,
    srcToOut(x, y) { const b = d2b(s2d(x, y)); if (!b) return null; const q = fwd(b[0], b[1]); return [cx + q[0] * sc, cy + q[1] * sc]; },
    outToSrc(x, y) {
      
      const qx = (x - cx) / sc, qy = (y - cy) / sc;
      let b = inv(qx, qy);
      for (let it = 0; it < 3 && src.length; it++) { const f2 = fwd(b[0], b[1]); b = [b[0] + (qx - f2[0]), b[1] + (qy - f2[1])]; }
      return d2s(b2d(b));
    },
    arcOut(c, n = 24) {
      const da = s2d(c.a[0], c.a[1]), db = s2d(c.b[0], c.b[1]), out = [], lg = isLong(c);
      for (let k = 0; k <= n; k++) { const b = d2b(arcPoint(da, db, k / n, lg)); if (!b) continue; const q = fwd(b[0], b[1]); out.push([cx + q[0] * sc, cy + q[1] * sc]); }
      return out;
    },
    
    arcSrc(c, n = 24) { const da = s2d(c.a[0], c.a[1]), db = s2d(c.b[0], c.b[1]), out = [], lg = isLong(c); for (let k = 0; k <= n; k++) { const s = d2s(arcPoint(da, db, k / n, lg)); if (s) out.push(s); } return out; },
  };
  return M;
}

function sample(src, w, h, x, y, out) {
  x -= 0.5; y -= 0.5;
  if (!(x > -1 && y > -1 && x < w && y < h)) { out[0] = out[1] = out[2] = out[3] = 0; return; }
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = clamp(x0 + i, 0, w - 1), yy = clamp(y0 + j, 0, h - 1), k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), o = (yy * w + xx) * 4, al = src[o + 3] * k;
    r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
  }
  if (a > 0) { out[0] = r / a; out[1] = g / a; out[2] = b / a; } else out[0] = out[1] = out[2] = 0;
  out[3] = a;
}




export function renderAdaptive(rgba, w, h, M, o = {}) {
  const step = Math.max(1, o.step || 4), ow = o.outW || w, oh = o.outH || h, k = o.srcScale || 1, kx = (o.outScale || 1);
  const gw = Math.ceil(ow / step) + 1, gh = Math.ceil(oh / step) + 1, gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const s = M.outToSrc(i * step / kx, j * step / kx), q = j * gw + i;
    if (s && isFinite(s[0]) && isFinite(s[1])) { gx[q] = s[0] * k; gy[q] = s[1] * k; } else { gx[q] = NaN; gy[q] = NaN; }
  }
  const out = new Uint8ClampedArray(ow * oh * 4), px = [0, 0, 0, 0];
  for (let y = 0; y < oh; y++) {
    const j = Math.min(gh - 2, Math.floor(y / step)), fy = y / step - j;
    for (let x = 0; x < ow; x++) {
      const i = Math.min(gw - 2, Math.floor(x / step)), fx = x / step - i, q = j * gw + i;
      const sx = (gx[q] * (1 - fx) + gx[q + 1] * fx) * (1 - fy) + (gx[q + gw] * (1 - fx) + gx[q + gw + 1] * fx) * fy;
      const sy = (gy[q] * (1 - fx) + gy[q + 1] * fx) * (1 - fy) + (gy[q + gw] * (1 - fx) + gy[q + gw + 1] * fx) * fy;
      if (!isFinite(sx) || !isFinite(sy)) continue;
      sample(rgba, o.srcW || w, o.srcH || h, sx, sy, px);
      const d = (y * ow + x) * 4; out[d] = px[0]; out[d + 1] = px[1]; out[d + 2] = px[2]; out[d + 3] = px[3];
    }
  }
  return out;
}
