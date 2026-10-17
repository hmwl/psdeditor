





















import { hdrToneMap } from './doc-mode.js';

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LIN = Float32Array.from({ length: 256 }, (_, v) => lin(v));
const enc = v => { v = v <= 0 ? 0 : v >= 1 ? 1 : v; return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
const hat = z => z <= 127 ? z + 1 : 256 - z;


export function estimateEV(imgs) {
  const n = imgs.length;
  const mean = imgs.map(im => { let s = 0, c = 0; for (let o = 0; o < im.rgba.length; o += 16) { if (im.rgba[o + 3] < 250) continue; s += LIN[im.rgba[o + 1]]; c++; } return c ? s / c : 0; });
  const order = [...imgs.keys()].sort((a, b) => mean[a] - mean[b]);
  const ev = new Array(n).fill(0);
  for (let t = 1; t < n; t++) {
    const A = imgs[order[t - 1]], B = imgs[order[t]];
    const r = [];
    for (let o = 0; o < A.rgba.length; o += 12) {
      if (A.rgba[o + 3] < 250 || B.rgba[o + 3] < 250) continue;
      for (let c = 0; c < 3; c++) {
        const a = A.rgba[o + c], b = B.rgba[o + c];
        if (a < 20 || b < 20 || a > 235 || b > 235) continue;
        r.push(Math.log2(LIN[b] / LIN[a]));
      }
    }
    r.sort((x, y) => x - y);
    const d = r.length > 20 ? r[r.length >> 1] : Math.log2(Math.max(1e-4, mean[order[t]]) / Math.max(1e-4, mean[order[t - 1]]));
    ev[order[t]] = ev[order[t - 1]] + Math.max(0.1, d);
  }
  const s = [...ev].sort((x, y) => x - y), mid = s[(n - 1) >> 1];
  return ev.map(v => Math.round((v - mid) * 100) / 100);
}


export function recoverResponse(imgs, ev, opt = {}) {
  const P = imgs.length, lambda = opt.lambda ?? 50;
  const lnT = ev.map(e => e * Math.LN2);
  
  const mid = ev.indexOf([...ev].sort((a, b) => a - b)[(P - 1) >> 1]);
  const M = imgs[mid], npx = M.width * M.height;
  const want = opt.samples || Math.max(60, Math.ceil(512 / Math.max(1, P - 1)));
  const buckets = Array.from({ length: 32 }, () => []);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < npx * 0.05 + 2000 && t < npx * 4; t++) {
    const i = (rnd() * npx) | 0; if (M.rgba[i * 4 + 3] < 250) continue;
    let ok = true; for (const im of imgs) if (im.rgba[i * 4 + 3] < 250) { ok = false; break; }
    if (!ok) continue;
    const z = M.rgba[i * 4 + 1]; buckets[z >> 3].push(i);
  }
  const pts = [];
  for (let k = 0; pts.length < want && k < 1000; k++) for (const b of buckets) if (b.length > k && pts.length < want) pts.push(b[k]);
  const N = pts.length, n = 256 + N;
  const curves = [];
  for (let c = 0; c < 3; c++) {
    const A = new Float64Array(n * n), bvec = new Float64Array(n);
    const addRow = (idx, val, rhs) => { for (let a = 0; a < idx.length; a++) { bvec[idx[a]] += val[a] * rhs; for (let b = 0; b < idx.length; b++) A[idx[a] * n + idx[b]] += val[a] * val[b]; } };
    for (let i = 0; i < N; i++) for (let j = 0; j < P; j++) {
      const z = imgs[j].rgba[pts[i] * 4 + c], w = hat(z);
      addRow([z, 256 + i], [w, -w], w * lnT[j]);
    }
    addRow([128], [1], 0);
    for (let z = 1; z < 255; z++) { const w = lambda * hat(z); addRow([z - 1, z, z + 1], [w, -2 * w, w], 0); }
    for (let i = 0; i < n; i++) A[i * n + i] += 1e-8;
    const x = solveDense(A, bvec, n);
    const g = new Float32Array(256);
    if (x) for (let z = 0; z < 256; z++) g[z] = x[z];
    else for (let z = 0; z < 256; z++) g[z] = Math.log(Math.max(1e-6, LIN[z]));
    
    for (let z = 129; z < 256; z++) if (g[z] < g[z - 1] + 1e-4) g[z] = g[z - 1] + 1e-4;
    for (let z = 127; z >= 0; z--) if (g[z] > g[z + 1] - 1e-4) g[z] = g[z + 1] - 1e-4;
    
    let s = 0, k = 0; for (let z = 64; z <= 192; z++) { s += Math.log(LIN[z]) - g[z]; k++; }
    const off = s / k; for (let z = 0; z < 256; z++) g[z] += off;
    curves.push(g);
  }
  return curves;
}
function solveDense(A, b, n) {
  
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (s <= 0) return null; L[i * n + i] = Math.sqrt(s); }
      else L[i * n + j] = s / L[j * n + j];
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}






export function mergeRadiance(imgs, ev, curves, opt = {}) {
  const P = imgs.length, W = imgs[0].width, H = imgs[0].height, n = W * H;
  const lnT = ev.map(e => e * Math.LN2);
  const sorted = [...ev].sort((a, b) => a - b), refT = sorted[(P - 1) >> 1] * Math.LN2;
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], alpha = new Float32Array(n);
  
  let ghost = null;
  const base = opt.deghost ? (opt.base ?? ev.indexOf(sorted[(P - 1) >> 1])) : -1;
  if (base >= 0) {
    const bad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const zb = imgs[base].rgba[i * 4 + 1];
      if (zb < 12 || zb > 243) continue;          
      const eb = curves[1][zb] - lnT[base];
      for (let j = 0; j < P; j++) {
        if (j === base) continue;
        const z = imgs[j].rgba[i * 4 + 1]; if (z < 12 || z > 243) continue;
        if (Math.abs(curves[1][z] - lnT[j] - eb) > (opt.ghostThreshold || 0.45)) { bad[i] = 1; break; }
      }
    }
    
    const r = Math.max(2, Math.round(Math.max(W, H) / 200));
    ghost = new Uint8Array(n);
    const soft = boxBlur(dilate(bad, W, H, r), W, H, r);
    for (let i = 0; i < n; i++) ghost[i] = Math.round(Math.min(1, soft[i] * 2) * 255);
  }
  for (let i = 0; i < n; i++) {
    const gk = ghost ? ghost[i] / 255 : 0;
    let aMax = 0;
    for (let c = 0; c < 3; c++) {
      let s = 0, ws = 0, near = 0, nearD = 1e9;
      for (let j = 0; j < P; j++) {
        const q = i * 4; if (imgs[j].rgba[q + 3] < 128) continue;
        const z = imgs[j].rgba[q + c];
        let w = hat(z) / 128;
        if (gk > 0 && j !== base) w *= 1 - gk;
        s += w * (curves[c][z] - lnT[j]); ws += w;
        const d = Math.abs(z - 127.5); if (d < nearD) { nearD = d; near = j; }
      }
      let lnE;
      if (ws > 1e-3) lnE = s / ws;
      else { const z = imgs[near].rgba[i * 4 + c]; lnE = curves[c][z] - lnT[near]; }
      planes[c][i] = Math.exp(lnE + refT);
    }
    for (let j = 0; j < P; j++) aMax = Math.max(aMax, imgs[j].rgba[i * 4 + 3]);
    alpha[i] = aMax / 255;
  }
  return { planes, alpha, width: W, height: H, ghost };
}


function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let s = 0; const row = y * W;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = s / (2 * r + 1);
      s += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s / (2 * r + 1);
      s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}
function dilate(src, W, H, r) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r) && !m; k++) m = src[y * W + k]; t[y * W + x] = m; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 0; for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r) && !m; k++) m = t[k * W + x]; o[y * W + x] = m; }
  return o;
}

function guided(I, W, H, r, eps) {
  const n = W * H, I2 = new Float32Array(n);
  for (let i = 0; i < n; i++) I2[i] = I[i] * I[i];
  const mI = boxBlur(I, W, H, r), mII = boxBlur(I2, W, H, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = mII[i] - mI[i] * mI[i]; a[i] = v / (v + eps); b[i] = mI[i] - a[i] * mI[i]; }
  const ma = boxBlur(a, W, H, r), mb = boxBlur(b, W, H, r);
  const q = new Float32Array(n); for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}

export const TONE_METHODS = { local: '局部适应', exposureGamma: '曝光度和灰度系数', highlightCompression: '高光压缩', equalize: '色调均化直方图' };

export const LOCAL_DEFAULTS = { radius: 115, strength: 0.52, gamma: 1, exposure: 0, detail: 30, shadow: 0, highlight: 0, vibrance: 0, saturation: 20 };








export function toneMap(R, method, p = {}, scale = 1) {
  const { width: W, height: H } = R, n = W * H;
  const out = new Uint8ClampedArray(n * 4);
  let rgb;
  if (method === 'local') {
    const q = { ...LOCAL_DEFAULTS, ...p };
    const Lw = new Float32Array(n), l = new Float32Array(n);
    for (let i = 0; i < n; i++) { const L = 0.2126 * R.planes[0][i] + 0.7152 * R.planes[1][i] + 0.0722 * R.planes[2][i]; Lw[i] = L; l[i] = Math.log2(Math.max(1e-6, L)); }
    const r = Math.max(1, Math.round(q.radius * scale / 2));
    const base = guided(l, W, H, r, Math.max(1e-4, q.strength * q.strength));
    let bmin = Infinity, bmax = -Infinity;
    const hs = Float32Array.from(base).sort();
    bmin = hs[Math.floor(n * 0.005)]; bmax = hs[Math.min(n - 1, Math.floor(n * 0.995))];
    const target = 5.5;                                             
    const k = bmax - bmin > target ? target / (bmax - bmin) : 1;
    const det = 1 + q.detail / 100;
    rgb = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    const vib = q.vibrance / 100, sat = q.saturation / 100;
    for (let i = 0; i < n; i++) {
      let b2 = (base[i] - bmax) * k;                                 
      const t = Math.max(0, Math.min(1, (b2 + target) / target));   
      b2 += (q.shadow / 100) * (1 - t) * (1 - t) * 1.5 + (q.highlight / 100) * t * t * 1.5;
      let Lo = Math.pow(2, b2 + (l[i] - base[i]) * det + q.exposure);
      if (q.gamma !== 1) Lo = Math.pow(Math.max(0, Lo), 1 / q.gamma);
      const Li = Math.max(1e-6, Lw[i]);
      for (let c = 0; c < 3; c++) rgb[c][i] = R.planes[c][i] / Li * Lo;
      
      if (vib || sat) {
        const m = 0.2126 * rgb[0][i] + 0.7152 * rgb[1][i] + 0.0722 * rgb[2][i];
        const mx = Math.max(rgb[0][i], rgb[1][i], rgb[2][i]), mn = Math.min(rgb[0][i], rgb[1][i], rgb[2][i]);
        const s0 = mx > 1e-6 ? (mx - mn) / mx : 0;
        const f = 1 + sat + vib * (1 - s0);
        for (let c = 0; c < 3; c++) rgb[c][i] = Math.max(0, m + (rgb[c][i] - m) * f);
      }
    }
  } else {
    rgb = R.planes.map(pl => Float32Array.from(pl));
    const o = method === 'exposureGamma' ? { method, exposure: p.exposure || 0, gamma: p.gamma || 1 } : { method };
    hdrToneMap(rgb, o);
  }
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(enc(rgb[0][i]) * 255); out[i * 4 + 1] = Math.round(enc(rgb[1][i]) * 255); out[i * 4 + 2] = Math.round(enc(rgb[2][i]) * 255);
    out[i * 4 + 3] = Math.round(R.alpha[i] * 255);
  }
  return out;
}


export function shrinkRadiance(R, f) {
  if (f >= 1) return R;
  const W = Math.max(1, Math.round(R.width * f)), H = Math.max(1, Math.round(R.height * f)), k = 1 / f;
  const planes = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)], alpha = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(R.width - 1, Math.floor((x + 0.5) * k)), sy = Math.min(R.height - 1, Math.floor((y + 0.5) * k)), s = sy * R.width + sx, d = y * W + x;
    for (let c = 0; c < 3; c++) planes[c][d] = R.planes[c][s]; alpha[d] = R.alpha[s];
  }
  return { planes, alpha, width: W, height: H };
}


export function mergeHdr(imgs, opt = {}) {
  const ev = opt.ev || estimateEV(imgs);
  const curves = recoverResponse(imgs, ev, opt);
  const R = mergeRadiance(imgs, ev, curves, opt);
  return { ...R, ev, curves };
}

export default { estimateEV, recoverResponse, mergeRadiance, mergeHdr, toneMap, shrinkRadiance, TONE_METHODS, LOCAL_DEFAULTS };
