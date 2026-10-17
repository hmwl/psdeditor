





















export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h), bad = new Uint8Array(w * h);
  for (let i = 0, o = 0; i < g.length; i++, o += 4) {
    g[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
    if (rgba[o + 3] < 128) bad[i] = 1;
  }
  return { g, bad };
}


export function gaussBlur(src, w, h, sigma) {
  if (!(sigma > 0.2)) return Float32Array.from(src);
  const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1);
  let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let j = -r; j <= r; j++) { let xx = x + j; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; a += src[row + xx] * k[j + r]; }
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0;
    for (let j = -r; j <= r; j++) { let yy = y + j; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; a += tmp[yy * w + x] * k[j + r]; }
    out[y * w + x] = a;
  }
  return out;
}


export function downscale(src, w, h, f) {
  const W = Math.max(1, Math.round(w * f)), H = Math.max(1, Math.round(h * f));
  const s = gaussBlur(src, w, h, 0.5 / f * 0.6);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      out[y * W + x] = (s[y0 * w + x0] * (1 - tx) + s[y0 * w + x1] * tx) * (1 - ty) + (s[y1 * w + x0] * (1 - tx) + s[y1 * w + x1] * tx) * ty;
    }
  }
  return { g: out, w: W, h: H };
}


const CIRCLE = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];

function fastCorners(g, w, h, t, border, bad) {
  const off = CIRCLE.map(([dx, dy]) => dy * w + dx);
  const out = [];
  const st = new Int8Array(32);
  for (let y = border; y < h - border; y++) for (let x = border; x < w - border; x++) {
    const i = y * w + x;
    if (bad && bad[i]) continue;
    const c = g[i], hi = c + t, lo = c - t;
    
    const p0 = g[i + off[0]], p4 = g[i + off[4]], p8 = g[i + off[8]], p12 = g[i + off[12]];
    let nb = (p0 > hi) + (p4 > hi) + (p8 > hi) + (p12 > hi), nd = (p0 < lo) + (p4 < lo) + (p8 < lo) + (p12 < lo);
    if (nb < 2 && nd < 2) continue;
    for (let k = 0; k < 16; k++) { const v = g[i + off[k]]; st[k] = st[k + 16] = v > hi ? 1 : v < lo ? -1 : 0; }
    let run = 0, best = 0, prev = 0;
    for (let k = 0; k < 32; k++) {
      if (st[k] !== 0 && st[k] === prev) run++; else run = st[k] !== 0 ? 1 : 0;
      prev = st[k]; if (run > best) best = run;
      if (best >= 9) break;
    }
    if (best >= 9) out.push(i);
  }
  return out;
}


function harrisMap(g, w, h) {
  
  const ix = new Float32Array(w * h), iy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    ix[i] = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]) / 8;
    iy[i] = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]) / 8;
  }
  const xx = new Float32Array(w * h), yy = new Float32Array(w * h), xy = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { xx[i] = ix[i] * ix[i]; yy[i] = iy[i] * iy[i]; xy[i] = ix[i] * iy[i]; }
  const A = gaussBlur(xx, w, h, 1.5), B = gaussBlur(yy, w, h, 1.5), C = gaussBlur(xy, w, h, 1.5);
  const R = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const tr = A[i] + B[i]; R[i] = A[i] * B[i] - C[i] * C[i] - 0.04 * tr * tr; }
  return R;
}


const PATCH_R = 15;
const UMAX = (() => { const u = []; for (let v = 0; v <= PATCH_R; v++) u.push(Math.floor(Math.sqrt(PATCH_R * PATCH_R - v * v) + 0.5)); return u; })();
function orientation(g, w, x, y) {
  let m01 = 0, m10 = 0;
  for (let v = -PATCH_R; v <= PATCH_R; v++) {
    const u0 = UMAX[Math.abs(v)], row = (y + v) * w + x;
    for (let u = -u0; u <= u0; u++) { const p = g[row + u]; m10 += u * p; m01 += v * p; }
  }
  return Math.atan2(m01, m10);
}

const PAIRS = (() => {
  let s = 0x2545f491;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const gauss = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const p = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    for (let k = 0; k < 2; k++) {
      let a, b; do { a = gauss() * 31 / 5; b = gauss() * 31 / 5; } while (a * a + b * b > 13 * 13);
      p[i * 4 + k * 2] = a; p[i * 4 + k * 2 + 1] = b;
    }
  }
  return p;
})();
function describe(sm, w, h, x, y, ang, out, o) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let wd = 0; wd < 8; wd++) {
    let bits = 0;
    for (let b = 0; b < 32; b++) {
      const k = (wd * 32 + b) * 4;
      const ax = PAIRS[k], ay = PAIRS[k + 1], bx = PAIRS[k + 2], by = PAIRS[k + 3];
      const x1 = Math.round(x + ax * c - ay * s), y1 = Math.round(y + ax * s + ay * c);
      const x2 = Math.round(x + bx * c - by * s), y2 = Math.round(y + bx * s + by * c);
      if (sm[y1 * w + x1] < sm[y2 * w + x2]) bits |= 1 << b;
    }
    out[o + wd] = bits >>> 0;
  }
}







export function detectAndDescribe(rgba, w, h, opt = {}) {
  const { g: g0, bad: bad0 } = toGray(rgba, w, h);
  return detectGray(g0, w, h, bad0, opt);
}
export function detectGray(g0, w, h, bad0, opt = {}) {
  const maxN = opt.maxFeatures || 1500, levels = opt.levels || 4, scale = opt.scale || 1.5, grid = opt.grid || 8;
  const border = PATCH_R + 3;
  const all = [];
  let g = g0, W = w, Hh = h, bad = bad0, f = 1;
  const perLevel = [];
  let totalW = 0;
  for (let L = 0; L < levels; L++) { const k = 1 / Math.pow(scale * scale, L); perLevel.push(k); totalW += k; }
  const descs = [];
  for (let L = 0; L < levels; L++) {
    if (W < border * 2 + 8 || Hh < border * 2 + 8) break;
    const want = Math.ceil(maxN * perLevel[L] / totalW);
    
    let t = opt.fastThreshold || 20, cand = [];
    for (;;) { cand = fastCorners(g, W, Hh, t, border, bad); if (cand.length >= want * 2 || t <= 4) break; t = Math.max(4, Math.floor(t * 0.6)); }
    if (cand.length) {
      const R = harrisMap(g, W, Hh);
      
      const isC = new Uint8Array(W * Hh); for (const i of cand) isC[i] = 1;
      const keep = [];
      for (const i of cand) {
        const r = R[i]; let ok = true;
        for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const j = i + dy * W + dx; if (isC[j] && R[j] > r) { ok = false; break; } }
        if (ok) keep.push(i);
      }
      
      const gx = Math.max(1, Math.round(grid * W / Math.max(W, Hh))), gy = Math.max(1, Math.round(grid * Hh / Math.max(W, Hh)));
      const cells = Array.from({ length: gx * gy }, () => []);
      for (const i of keep) { const x = i % W, y = (i / W) | 0; cells[Math.min(gy - 1, (y * gy / Hh) | 0) * gx + Math.min(gx - 1, (x * gx / W) | 0)].push(i); }
      const per = Math.ceil(want / (gx * gy)) + 1;
      let chosen = [];
      const rest = [];
      for (const c of cells) { c.sort((a, b) => R[b] - R[a]); chosen.push(...c.slice(0, per)); rest.push(...c.slice(per)); }
      if (chosen.length > want) { chosen.sort((a, b) => R[b] - R[a]); chosen = chosen.slice(0, want); }
      else if (chosen.length < want) { rest.sort((a, b) => R[b] - R[a]); chosen.push(...rest.slice(0, want - chosen.length)); }
      const sm = gaussBlur(g, W, Hh, 2);
      const d = new Uint32Array(chosen.length * 8);
      chosen.forEach((i, k) => {
        const x = i % W, y = (i / W) | 0;
        const ang = orientation(g, W, x, y);
        describe(sm, W, Hh, x, y, ang, d, k * 8);
        
        let sx = 0, sy = 0;
        const c0 = R[i], l = R[i - 1], r = R[i + 1], u = R[i - W], dn = R[i + W];
        const ddx = l - 2 * c0 + r, ddy = u - 2 * c0 + dn;
        if (ddx < 0) sx = Math.max(-0.5, Math.min(0.5, (l - r) / (2 * ddx)));
        if (ddy < 0) sy = Math.max(-0.5, Math.min(0.5, (u - dn) / (2 * ddy)));
        all.push({ x: (x + sx + 0.5) / f - 0.5, y: (y + sy + 0.5) / f - 0.5, angle: ang, level: L, score: R[i] });
      });
      descs.push(d);
    }
    if (L < levels - 1) {
      const ds = downscale(g, W, Hh, 1 / scale);
      if (bad) {
        const nb = new Uint8Array(ds.w * ds.h);
        for (let y = 0; y < ds.h; y++) for (let x = 0; x < ds.w; x++) {
          const sx = Math.min(W - 1, Math.round((x + 0.5) * scale - 0.5)), sy = Math.min(Hh - 1, Math.round((y + 0.5) * scale - 0.5));
          nb[y * ds.w + x] = bad[sy * W + sx];
        }
        bad = nb;
      }
      g = ds.g; W = ds.w; Hh = ds.h; f = f / scale;
    }
  }
  const desc = new Uint32Array(all.length * 8);
  let o = 0; for (const d of descs) { desc.set(d, o); o += d.length; }
  return { kps: all, desc };
}


function popcnt(v) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
function nearest(dA, nA, dB, nB) {
  const best = new Int32Array(nA), d1 = new Int32Array(nA), d2 = new Int32Array(nA);
  for (let i = 0; i < nA; i++) {
    let b1 = 1e9, b2 = 1e9, bi = -1; const oa = i * 8;
    for (let j = 0; j < nB; j++) {
      const ob = j * 8; let d = 0;
      for (let k = 0; k < 8; k++) { d += popcnt(dA[oa + k] ^ dB[ob + k]); if (d >= b2) break; }
      if (d < b1) { b2 = b1; b1 = d; bi = j; } else if (d < b2) b2 = d;
    }
    best[i] = bi; d1[i] = b1; d2[i] = b2;
  }
  return { best, d1, d2 };
}



export function matchFeatures(A, B, opt = {}) {
  const ratio = opt.ratio || 0.8, maxDist = opt.maxDist || 80;
  const nA = A.kps.length, nB = B.kps.length;
  if (!nA || !nB) return [];
  const ab = nearest(A.desc, nA, B.desc, nB), ba = opt.cross === false ? null : nearest(B.desc, nB, A.desc, nA);
  const out = [];
  for (let i = 0; i < nA; i++) {
    const j = ab.best[i]; if (j < 0) continue;
    if (ab.d1[i] > maxDist) continue;
    if (ab.d1[i] > ratio * ab.d2[i]) continue;
    if (ba && ba.best[j] !== i) continue;
    out.push({ i, j, dist: ab.d1[i] });
  }
  return out;
}

export default { toGray, gaussBlur, downscale, detectAndDescribe, detectGray, matchFeatures };
