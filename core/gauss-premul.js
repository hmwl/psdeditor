








export const cx = (x, w) => (x < 0 ? 0 : x >= w ? w - 1 : x);



export function gaussianKernel(radius) {
  const sigma = Math.max(1e-6, radius);
  const n = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * n + 1);
  let sum = 0;
  for (let i = -n; i <= n; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + n] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

export function boxSizes(sigma) {
  const wIdeal = Math.sqrt(12 * sigma * sigma / 3 + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--; if (wl < 1) wl = 1;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
  return [0, 1, 2].map(i => (i < m ? wl : wu));
}
export function boxPass(src, dst, w, h, r, horiz) {
  const inv = 1 / (2 * r + 1);
  const lines = horiz ? h : w, len = horiz ? w : h;
  for (let L = 0; L < lines; L++) {
    const idx = t => (horiz ? (L * w + (t < 0 ? 0 : t >= len ? len - 1 : t)) : ((t < 0 ? 0 : t >= len ? len - 1 : t) * w + L)) * 4;
    let a = 0, b = 0, c = 0, d = 0;
    for (let t = -r; t <= r; t++) { const o = idx(t); a += src[o]; b += src[o + 1]; c += src[o + 2]; d += src[o + 3]; }
    for (let t = 0; t < len; t++) {
      const o = idx(t); dst[o] = a * inv; dst[o + 1] = b * inv; dst[o + 2] = c * inv; dst[o + 3] = d * inv;
      const add = idx(t + r + 1), sub = idx(t - r);
      a += src[add] - src[sub]; b += src[add + 1] - src[sub + 1]; c += src[add + 2] - src[sub + 2]; d += src[add + 3] - src[sub + 3];
    }
  }
}

export function gaussPremul(src, w, h, sigma) {
  if (sigma <= 3) return convolveSeparable(src, w, h, gaussianKernel(sigma));
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  for (const size of boxSizes(sigma)) { const r = (size - 1) >> 1; if (!r) continue; boxPass(a, b, w, h, r, true); boxPass(b, a, w, h, r, false); }
  return a;
}


export function convolveSeparable(src, w, h, kernel) {
  const n = (kernel.length - 1) >> 1;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, c = 0, d = 0;
      for (let i = -n; i <= n; i++) {
        const o = (row + cx(x + i, w)) * 4, k = kernel[i + n];
        a += src[o] * k; b += src[o + 1] * k; c += src[o + 2] * k; d += src[o + 3] * k;
      }
      const o2 = (row + x) * 4;
      tmp[o2] = a; tmp[o2 + 1] = b; tmp[o2 + 2] = c; tmp[o2 + 3] = d;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let a = 0, b = 0, c = 0, d = 0;
      for (let i = -n; i <= n; i++) {
        const o = (cx(y + i, h) * w + x) * 4, k = kernel[i + n];
        a += tmp[o] * k; b += tmp[o + 1] * k; c += tmp[o + 2] * k; d += tmp[o + 3] * k;
      }
      const o2 = (y * w + x) * 4;
      out[o2] = a; out[o2 + 1] = b; out[o2 + 2] = c; out[o2 + 3] = d;
    }
  }
  return out;
}
