



















import { GALLERY_GROUPS, GALLERY_EFFECTS, TEXTURE_OPTS, effectSpec, effectByClass, effectDefaults, normalizeEffectParams } from './filter-gallery-spec.js';
export { GALLERY_GROUPS, GALLERY_EFFECTS, TEXTURE_OPTS, effectSpec, effectByClass, effectDefaults, normalizeEffectParams };
const BY_ID = Object.fromEntries(GALLERY_EFFECTS.map(e => [e.id, e]));
const BY_CLS = Object.fromEntries(GALLERY_EFFECTS.map(e => [e.cls, e]));



const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

function rng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hash2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

function channels(src, n) {
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { R[i] = src[j]; G[i] = src[j + 1]; B[i] = src[j + 2]; }
  return [R, G, B];
}
function lumOf(src, n) { const L = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = 0.299 * src[j] + 0.587 * src[j + 1] + 0.114 * src[j + 2]; return L; }
function lumRGB(R, G, B) { const n = R.length, L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]; return L; }
function outRGB(src, R, G, B) {
  const n = R.length, o = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < n; i++, j += 4) { o[j] = R[i]; o[j + 1] = G[i]; o[j + 2] = B[i]; o[j + 3] = src[j + 3]; }
  return o;
}

function outFgBg(src, t, fg, bg) {
  const n = t.length, o = new Uint8ClampedArray(n * 4);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const k = t[i] < 0 ? 0 : t[i] > 1 ? 1 : t[i];
    o[j] = fg[0] + (bg[0] - fg[0]) * k; o[j + 1] = fg[1] + (bg[1] - fg[1]) * k; o[j + 2] = fg[2] + (bg[2] - fg[2]) * k; o[j + 3] = src[j + 3];
  }
  return o;
}


function boxSizes(sigma) {
  const wIdeal = Math.sqrt(12 * sigma * sigma / 3 + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
  return [0, 1, 2].map(i => ((i < m ? wl : wl + 2) - 1) / 2);
}
function boxH(s, d, w, h, r) {
  if (r < 1) { d.set(s); return; }
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = s[o] * (r + 1);
    for (let x = 1; x <= r; x++) acc += s[o + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      d[o + x] = acc * k;
      acc += s[o + Math.min(x + r + 1, w - 1)] - s[o + Math.max(x - r, 0)];
    }
  }
}
function boxV(s, d, w, h, r) {
  if (r < 1) { d.set(s); return; }
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = s[x] * (r + 1);
    for (let y = 1; y <= r; y++) acc += s[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      d[y * w + x] = acc * k;
      acc += s[Math.min(y + r + 1, h - 1) * w + x] - s[Math.max(y - r, 0) * w + x];
    }
  }
}
function blurF(f, w, h, sigma) {
  const a = new Float32Array(f);
  if (!(sigma > 0.25)) return a;
  const b = new Float32Array(f.length);
  for (const r of boxSizes(sigma)) { const ri = Math.round(r); boxH(a, b, w, h, ri); boxV(b, a, w, h, ri); }
  return a;
}
const blur3 = (R, G, B, w, h, s) => [blurF(R, w, h, s), blurF(G, w, h, s), blurF(B, w, h, s)];

function sobel(f, w, h) {
  const n = w * h, gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const ym = (y > 0 ? y - 1 : 0) * w, y0 = y * w, yp = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : x;
      gx[y0 + x] = (f[ym + xp] + 2 * f[y0 + xp] + f[yp + xp] - f[ym + xm] - 2 * f[y0 + xm] - f[yp + xm]) / 8;
      gy[y0 + x] = (f[yp + xm] + 2 * f[yp + x] + f[yp + xp] - f[ym + xm] - 2 * f[ym + x] - f[ym + xp]) / 8;
    }
  }
  return [gx, gy];
}
function gradMag(f, w, h) { const [gx, gy] = sobel(f, w, h); const m = new Float32Array(f.length); for (let i = 0; i < m.length; i++) m[i] = Math.hypot(gx[i], gy[i]); return m; }


function dilate(f, w, h, r) {
  r = Math.round(r); if (r < 1) return new Float32Array(f);
  const a = new Float32Array(f.length), b = new Float32Array(f.length);
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) { let m = -1e9; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (f[o + k] > m) m = f[o + k]; a[o + x] = m; } }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = -1e9; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (a[k * w + x] > m) m = a[k * w + x]; b[y * w + x] = m; }
  return b;
}


function whiteNoise(w, h, seed, ox = 0, oy = 0) {
  const n = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) n[y * w + x] = hash2(x + ox, y + oy, seed);
  return n;
}

function valueNoise(w, h, cell, seed, octaves = 1, ox = 0, oy = 0) {
  const out = new Float32Array(w * h); let amp = 1, tot = 0, c = Math.max(1, cell);
  for (let o = 0; o < octaves; o++) {
    for (let y = 0; y < h; y++) {
      const fy = (y + oy) / c, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = (x + ox) / c, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const a = hash2(ix, iy, seed + o), b = hash2(ix + 1, iy, seed + o), cc = hash2(ix, iy + 1, seed + o), d = hash2(ix + 1, iy + 1, seed + o);
        out[y * w + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (cc + (d - cc) * sx) * sy);
      }
    }
    tot += amp; amp *= 0.5; c /= 2; if (c < 1) break;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function motionF(f, w, h, angle, len) {
  len = Math.max(1, Math.round(len));
  if (len <= 1) return new Float32Array(f);
  const a = angle * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a);
  const offs = []; for (let k = 0; k < len; k++) { const t = k - (len - 1) / 2; offs.push([Math.round(t * dx), Math.round(t * dy)]); }
  const out = new Float32Array(f.length), inv = 1 / len;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k < len; k++) {
      let xx = x + offs[k][0], yy = y + offs[k][1];
      xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
      s += f[yy * w + xx];
    }
    out[y * w + x] = s * inv;
  }
  return out;
}

function detrend(f) {
  let m = 0; for (let i = 0; i < f.length; i++) m += f[i]; m /= f.length || 1;
  let v = 0; for (let i = 0; i < f.length; i++) v += (f[i] - m) ** 2; const sd = Math.sqrt(v / (f.length || 1)) || 1;
  const o = new Float32Array(f.length); for (let i = 0; i < f.length; i++) o[i] = (f[i] - m) / sd; return o;
}
function strokeNoise(w, h, angle, len, seed, pre = 0) {
  let n = whiteNoise(w, h, seed);
  if (pre > 0.3) n = blurF(n, w, h, pre);
  return detrend(motionF(n, w, h, angle, len));
}


function kuwahara(R, G, B, w, h, r) {
  r = Math.max(1, Math.round(r));
  const W1 = w + 1, n1 = W1 * (h + 1);
  const iR = new Float64Array(n1), iG = new Float64Array(n1), iB = new Float64Array(n1), iL = new Float64Array(n1), iL2 = new Float64Array(n1);
  for (let y = 0; y < h; y++) {
    let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, l = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
      sr += R[i]; sg += G[i]; sb += B[i]; sl += l; sl2 += l * l;
      const q = (y + 1) * W1 + x + 1, p = y * W1 + x + 1;
      iR[q] = iR[p] + sr; iG[q] = iG[p] + sg; iB[q] = iB[p] + sb; iL[q] = iL[p] + sl; iL2[q] = iL2[p] + sl2;
    }
  }
  const oR = new Float32Array(w * h), oG = new Float32Array(w * h), oB = new Float32Array(w * h);
  const S = (A, x0, y0, x1, y1) => A[(y1 + 1) * W1 + x1 + 1] - A[y0 * W1 + x1 + 1] - A[(y1 + 1) * W1 + x0] + A[y0 * W1 + x0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = Infinity, bx0 = 0, by0 = 0, bx1 = 0, by1 = 0, bn = 1;
    for (let q = 0; q < 4; q++) {
      const x0 = Math.max(0, q & 1 ? x : x - r), x1 = Math.min(w - 1, q & 1 ? x + r : x);
      const y0 = Math.max(0, q & 2 ? y : y - r), y1 = Math.min(h - 1, q & 2 ? y + r : y);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const m = S(iL, x0, y0, x1, y1) / cnt, v = S(iL2, x0, y0, x1, y1) / cnt - m * m;
      if (v < best) { best = v; bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; bn = cnt; }
    }
    const i = y * w + x;
    oR[i] = S(iR, bx0, by0, bx1, by1) / bn; oG[i] = S(iG, bx0, by0, bx1, by1) / bn; oB[i] = S(iB, bx0, by0, bx1, by1) / bn;
  }
  return [oR, oG, oB];
}
function sharpen3(C, w, h, sigma, amt) {
  return C.map(c => { const b = blurF(c, w, h, sigma), o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] + (c[i] - b[i]) * amt; return o; });
}


const LIGHT_VEC = { LDBt: [0, 1], LDBL: [-1, 1], LDLf: [-1, 0], LDTL: [-1, -1], LDTp: [0, -1], LDTR: [1, -1], LDRg: [1, 0], LDBR: [1, 1] };
function shadeOf(H, w, h, light, k) {
  const v = LIGHT_VEC[light] || LIGHT_VEC.LDTL, len = Math.hypot(v[0], v[1]) || 1, lx = v[0] / len, ly = v[1] / len;
  const [gx, gy] = sobel(H, w, h), o = new Float32Array(H.length);
  
  for (let i = 0; i < o.length; i++) o[i] = -(gx[i] * lx + gy[i] * ly) * k;
  return o;
}


function textureTile(type, scale, custom) {
  const s = Math.max(0.5, scale / 100);
  if (type === 'custom' && custom && custom.w > 0 && custom.h > 0) {
    const tw = Math.max(1, Math.round(custom.w * s)), th = Math.max(1, Math.round(custom.h * s)), t = new Float32Array(tw * th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const sx = Math.min(custom.w - 1, Math.floor(x / s)), sy = Math.min(custom.h - 1, Math.floor(y / s)), j = (sy * custom.w + sx) * 4;
      const a = custom.rgba[j + 3] / 255;
      t[y * tw + x] = ((0.299 * custom.rgba[j] + 0.587 * custom.rgba[j + 1] + 0.114 * custom.rgba[j + 2]) * a + 255 * (1 - a)) / 255;
    }
    return { t, tw, th };
  }
  const T = Math.round(128 * s), tw = T, th = T, t = new Float32Array(tw * th);
  const nz = valueNoise(tw, th, Math.max(2, 3 * s), 71, 2);
  if (type === 'TxCa' || type === 'TxBu') {
    
    const p = (type === 'TxBu' ? 8 : 4) * s, jit = type === 'TxBu' ? valueNoise(tw, th, 12 * s, 5, 2) : null;
    const per = Math.max(2, Math.round(T / p)), pp = T / per;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const i = y * tw + x, u = x / pp, v = y / pp, cu = Math.floor(u), cv = Math.floor(v);
      const warp = Math.sin(Math.PI * (v - cv)), weft = Math.sin(Math.PI * (u - cu));
      const over = ((cu + cv) & 1) === 0;
      let hh = over ? 0.55 + 0.45 * warp * (0.6 + 0.4 * weft) : 0.55 + 0.45 * weft * (0.6 + 0.4 * warp);
      if (jit) hh = hh * (0.7 + 0.6 * jit[i]) - 0.15 * (1 - Math.min(warp, weft));
      t[i] = hh * 0.85 + nz[i] * 0.15;
    }
  } else if (type === 'TxBr') {
    const bw = T / 2, bh = T / 6, m = Math.max(1.2, 2.2 * s);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const row = Math.floor(y / bh), xo = (x + (row & 1 ? bw / 2 : 0)) % bw, yo = y - row * bh;
      const d = Math.min(xo, bw - xo, yo, bh - yo);
      t[y * tw + x] = smooth01(0, m, d) * (0.8 + 0.2 * nz[y * tw + x]);
    }
  } else if (type === 'TxSt') {
    const f = valueNoise(tw, th, 10 * s, 13, 4), g = whiteNoise(tw, th, 17);
    for (let i = 0; i < t.length; i++) t[i] = f[i] * 0.75 + g[i] * 0.25;
  } else if (type === 'Blks') {
    const c = T / 5;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const u = (x % c) / c, v = (y % c) / c; t[y * tw + x] = Math.min(u, 1 - u, v, 1 - v) * 2;
    }
  } else if (type === 'TxTL') {
    const c = T / 12;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const u = (x % c) / c * 2 - 1, v = (y % c) / c * 2 - 1, r2 = u * u + v * v; t[y * tw + x] = r2 < 1 ? Math.sqrt(1 - r2) : 0;
    }
  } else { 
    const g = blurF(whiteNoise(tw, th, 23), tw, th, 1.2 * s);
    let mn = 1, mx = 0; for (const v of g) { if (v < mn) mn = v; if (v > mx) mx = v; }
    for (let i = 0; i < t.length; i++) t[i] = (g[i] - mn) / (mx - mn || 1);
  }
  return { t, tw, th };
}
function textureField(w, h, type, scale, invert, custom) {
  const { t, tw, th } = textureTile(type, scale, custom), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = t[(y % th) * tw + (x % tw)]; o[y * w + x] = invert ? 1 - v : v; }
  return o;
}

function applyTexture(R, G, B, w, h, p, env, reliefScale = 1) {
  const rel = (p['Rlf '] ?? 4) * reliefScale;
  if (rel <= 0) return [R, G, B];
  const H = blurF(textureField(w, h, p.TxtT, p.Scln ?? 100, !!p.InvT, env.texture), w, h, 0.6);
  const sh = shadeOf(H, w, h, p.LghD || 'LDTp', rel * 0.8);
  const o = [new Float32Array(R.length), new Float32Array(R.length), new Float32Array(R.length)];
  for (let i = 0; i < R.length; i++) {
    const k = 1 + sh[i];
    o[0][i] = R[i] * k + sh[i] * 40; o[1][i] = G[i] * k + sh[i] * 40; o[2][i] = B[i] * k + sh[i] * 40;
  }
  return o;
}


function voronoi(w, h, cell, jitter, seed) {
  const gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1;
  const sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    sx[k] = (i + 0.5 + (hash2(i, j, seed) - 0.5) * jitter) * cell;
    sy[k] = (j + 0.5 + (hash2(i, j, seed + 7) - 0.5) * jitter) * cell;
  }
  const id = new Int32Array(w * h), e = new Float32Array(w * h);
  
  const R = jitter > 1 ? 2 : 1, cand = new Int32Array((2 * R + 1) ** 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    let best = -1, bd = Infinity, nc = 0;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
      const k = j * gw + i; cand[nc++] = k;
      const d = (sx[k] - x) ** 2 + (sy[k] - y) ** 2; if (d < bd) { bd = d; best = k; }
    }
    let me = Infinity; const ax = sx[best], ay = sy[best];
    for (let q = 0; q < nc; q++) {
      const k = cand[q]; if (k === best) continue;
      const bx = sx[k] - ax, by = sy[k] - ay, bl = Math.hypot(bx, by) || 1;
      const d = ((sx[k] + ax) / 2 - x) * bx / bl + ((sy[k] + ay) / 2 - y) * by / bl;
      if (d < me) me = d;
    }
    const p = y * w + x; id[p] = best; e[p] = me;
  }
  return { id, e, count: gw * gh, sx, sy };
}
function perCellMean(src, w, h, id, count) {
  const acc = new Float64Array(count * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) { const k = id[i] * 4; acc[k] += src[j]; acc[k + 1] += src[j + 1]; acc[k + 2] += src[j + 2]; acc[k + 3]++; }
  return acc;
}
const posterize = (v, lv) => Math.round(v / 255 * (lv - 1)) / (lv - 1) * 255;
const DIR_ANGLE = { SDRD: 45, SDHz: 0, SDLD: -45, SDVt: 90 };




const FX = {
  
  glowingEdges(src, w, h, p) {
    const n = w * h, [R, G, B] = blur3(...channels(src, n), w, h, p.Smth * 0.3);
    const gain = 0.6 + p.EdgB * 0.28, out = [];
    for (const c of [R, G, B]) {
      let m = gradMag(c, w, h); if (p.EdgW > 1) m = dilate(m, w, h, (p.EdgW - 1) / 2);
      const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = m[i] * gain * 2.2; out.push(o);
    }
    return outRGB(src, ...out);
  },

  
  angledStrokes(src, w, h, p, env) {
    const n = w * h, C = channels(src, n), L = lumOf(src, n), nz = whiteNoise(w, h, env.seed);
    void nz;
    const len = Math.max(2, p.StrL * 0.6), a = C.map(c => motionF(c, w, h, 45, len)); env.progress(0.4);
    const b = C.map(c => motionF(c, w, h, -45, len)); env.progress(0.7);
    const sa = strokeNoise(w, h, 45, p.StrL, env.seed, 0.5), sb = strokeNoise(w, h, -45, p.StrL, env.seed + 1, 0.5), amp = 10 + p.Shrp * 2;
    const bal = 1 - p.DrcB / 100, o = [0, 1, 2].map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) { const k = clamp((L[i] / 255 - bal) * 5 + 0.5, 0, 1), s = (sa[i] * k + sb[i] * (1 - k)) * amp; for (let c = 0; c < 3; c++) o[c][i] = a[c][i] * k + b[c][i] * (1 - k) + s; }
    return outRGB(src, ...(p.Shrp ? sharpen3(o, w, h, 1, p.Shrp * 0.12) : o));
  },
  inkOutlines(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), L = lumOf(src, n);
    const sn = strokeNoise(w, h, -45, p.StrL + 2, env.seed, 0.6), E = gradMag(blurF(L, w, h, 0.8), w, h);
    const dk = p.DrkI / 50, lt = p.LghI / 50, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const d = clamp((150 - L[i]) / 150, 0, 1), l = clamp((L[i] - 110) / 145, 0, 1);
      const ink = clamp(d * dk * (1.1 + sn[i] * 0.45) + clamp(E[i] / 40, 0, 1) * 0.55 * (0.4 + dk), 0, 0.95);
      const lift = l * lt * (0.55 + sn[i] * 0.2);
      for (const [c, s] of [[0, R], [1, G], [2, B]]) o[c][i] = (s[i] + (255 - s[i]) * lift) * (1 - ink);
    }
    return outRGB(src, ...o);
  },
  spatter(src, w, h, p, env) { return spatterRGBA(src, w, h, p.SprR, p.Smth, env.seed); },
  sprayedStrokes(src, w, h, p, env) {
    const sp = spatterRGBA(src, w, h, p.SprR, 4, env.seed), n = w * h, C = channels(sp, n);
    const ang = DIR_ANGLE[p.SDir] ?? 45, sn = strokeNoise(w, h, ang, p.StrL * 1.5 + 2, env.seed + 3, 0.5);
    return outRGB(src, ...C.map(c => motionF(c, w, h, ang, p.StrL * 0.8 + 1).map((v, i) => v + sn[i] * 14)));
  },
  accentedEdges(src, w, h, p) {
    const n = w * h, C = blur3(...channels(src, n), w, h, p.Smth * 0.22), L = lumRGB(...C);
    let E = gradMag(blurF(L, w, h, 0.7), w, h); if (p.EdgW > 1) E = dilate(E, w, h, (p.EdgW - 1) / 2);
    E = blurF(E, w, h, 0.6);
    const white = p.EdgB >= 25, amt = white ? (p.EdgB - 25) / 25 : (25 - p.EdgB) / 25, o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const k = clamp(E[i] / 22, 0, 1) * (0.25 + amt * 0.85);
      for (let c = 0; c < 3; c++) { const v = C[c][i] * 0.92; o[c][i] = white ? v + (255 - v) * k : v * (1 - k); }
    }
    return outRGB(src, ...o);
  },
  darkStrokes(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), L = lumOf(src, n);
    const sd = strokeNoise(w, h, 45, 8, env.seed, 0.5), sl = strokeNoise(w, h, -45, 18, env.seed + 1, 0.5);
    const thr = 60 + p.Blnc * 14, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const d = smooth01(thr + 30, thr - 60, L[i]), l = smooth01(thr - 20, thr + 80, L[i]);
      const dark = clamp(d * (p.BlcI / 10) * (1 + sd[i] * 0.35), 0, 1), lig = clamp(l * (p.WhtI / 10) * (0.8 + sl[i] * 0.3), 0, 1);
      for (const [c, s] of [[0, R], [1, G], [2, B]]) { const v = s[i] * (1 - dark * 0.92); o[c][i] = v + (255 - v) * lig * 0.8; }
    }
    return outRGB(src, ...o);
  },
  sumie(src, w, h, p) {
    const n = w * h, C = blur3(...channels(src, n), w, h, 0.5 + p.StrW * 0.12), L = lumRGB(...C);
    const ink = blurF(L.map(v => 255 - v), w, h, p.StrW * 0.35), pr = 0.55 + p.StrP / 15 * 0.8, ct = 1 + p.Cntr / 40 * 1.2;
    const o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const k = clamp((ink[i] / 255 * pr - 0.25) * 1.6, 0, 0.97);
      for (let c = 0; c < 3; c++) o[c][i] = ((C[c][i] * (1 - k)) - 128) * ct + 128 - k * 30;
    }
    return outRGB(src, ...o);
  },
  crosshatch(src, w, h, p, env) {
    const n = w * h; let C = channels(src, n);
    for (let pass = 0; pass < p.Intn; pass++) {
      const a = strokeNoise(w, h, 45, p.StrL, env.seed + pass * 2), b = strokeNoise(w, h, -45, p.StrL, env.seed + pass * 2 + 1);
      C = C.map(c => c.map((v, i) => v + (a[i] + b[i]) * (13 + pass * 4) * (0.45 + (255 - v) / 255)));
      env.progress((pass + 1) / (p.Intn + 1));
    }
    return outRGB(src, ...(p.Shrp ? sharpen3(C, w, h, 1, p.Shrp * 0.08) : C));
  },

  
  glass(src, w, h, p, env) {
    let H = textureField(w, h, p.TxtT, p.Scln, !!p.InvT, env.texture);
    H = blurF(H, w, h, p.Smth * 0.45);
    const [gx, gy] = sobel(H, w, h), k = p.Dstr * 4.5;
    const dx = gx.map(v => v * k), dy = gy.map(v => v * k);
    return remapRGBA(src, w, h, dx, dy);
  },
  oceanRipple(src, w, h, p, env) {
    
    const cell = 2 + p.RplS * 1.1, a = valueNoise(w, h, cell, env.seed + 11, 2);
    const [gx, gy] = sobel(a, w, h), k = p.RplM * cell * 0.9, dx = new Float32Array(w * h), dy = new Float32Array(w * h);
    for (let i = 0; i < dx.length; i++) { dx[i] = gx[i] * k; dy[i] = gy[i] * k; }
    return remapRGBA(src, w, h, dx, dy);
  },
  diffuseGlow(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), L = lumOf(src, n), nz = whiteNoise(w, h, env.seed), bg = env.bg;
    const thr = 255 * (p.ClrA / 20) * 0.75, g0 = new Float32Array(n);
    for (let i = 0; i < n; i++) g0[i] = clamp((L[i] - thr) / (255 - thr + 20), 0, 1);
    const g = blurF(g0, w, h, 3), amt = p.GlwA / 20 * 2.2, grn = p.Grns / 10, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      let k = g[i] * amt; if (k > 0.01) k += (nz[i] - 0.5) * grn * 0.9 * Math.min(1, k * 3);
      k = clamp(k, 0, 1); o[0][i] = R[i] + (bg[0] - R[i]) * k; o[1][i] = G[i] + (bg[1] - G[i]) * k; o[2][i] = B[i] + (bg[2] - B[i]) * k;
    }
    return outRGB(src, ...o);
  },

  
  halftonePattern(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.6), per = 2 + p['Sz  '] * 2, t = new Float32Array(n), gain = 2 + p.Cntr * 0.9;
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let s;
      if (p.ScrT === 'ScrC') s = 0.5 + 0.5 * Math.cos(2 * Math.PI * Math.hypot(x - cx, y - cy) / per);
      else if (p.ScrT === 'ScrL') s = 0.5 + 0.5 * Math.cos(2 * Math.PI * y / per);
      else { const u = (x + y) / Math.SQRT2, v = (x - y) / Math.SQRT2; s = 0.5 + 0.25 * (Math.cos(2 * Math.PI * u / per) + Math.cos(2 * Math.PI * v / per)); }
      const tone = (L[i] / 255 - 0.5) * (1 + p.Cntr / 25) + 0.5;
      t[i] = (tone - (1 - s)) * gain + 0.5;
    }
    return outFgBg(src, t, env.fg, env.bg);
  },
  notePaper(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 1), thr = 255 * p.ImgB / 50, nz = whiteNoise(w, h, env.seed);
    const M = new Float32Array(n); for (let i = 0; i < n; i++) M[i] = clamp((L[i] - thr) / 24 + 0.5, 0, 1);
    const sh = shadeOf(blurF(M, w, h, 1.3), w, h, 'LDTL', p['Rlf '] * 0.9), t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = 0.28 + M[i] * 0.55 + sh[i] + (nz[i] - 0.5) * p.Grns * 0.022;
    return outFgBg(src, t, env.fg, env.bg);
  },
  chalkCharcoal(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.7), a = strokeNoise(w, h, 45, 14, env.seed, 0.5), b = strokeNoise(w, h, 45, 14, env.seed + 5, 0.5);
    const tc = 0.2 + p.ChrA / 20 * 0.45, tk = 0.8 - p.ChlA / 20 * 0.45, pr = 0.25 + p.StrP * 0.18, t = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const l = L[i] / 255;
      const ch = clamp((tc - l) * 4 + 0.5 + a[i] * pr, 0, 1), ck = clamp((l - tk) * 4 + 0.5 + b[i] * pr, 0, 1);
      t[i] = 0.5 - ch * 0.5 + ck * 0.5;
    }
    return outFgBg(src, t, env.fg, env.bg);
  },
  chrome(src, w, h, p) {
    const n = w * h, L0 = lumOf(src, n), Ls = blurF(L0, w, h, 0.8 + p.Smth * 0.7), L = new Float32Array(n);
    const det = p['Dtl '] / 10;
    for (let i = 0; i < n; i++) L[i] = Ls[i] * (1 - det * 0.35) + L0[i] * det * 0.35;
    const sh = shadeOf(L, w, h, 'LDTL', 0.03), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = 0.5 + 0.5 * Math.cos(L[i] / 255 * Math.PI * 2.6) + sh[i]; o[i] = clamp(v, 0, 1) * 255; }
    return outRGB(src, o, o, o);
  },
  graphicPen(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.6), sn = strokeNoise(w, h, DIR_ANGLE[p.SDir] ?? 45, p.StrL * 1.6 + 1, env.seed), t = new Float32Array(n);
    const thr = p.LgDr / 100;
    for (let i = 0; i < n; i++) t[i] = ((L[i] / 255 + sn[i] * 0.18) - thr) * 10 + 0.5;
    return outFgBg(src, t, env.fg, env.bg);
  },
  basRelief(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.4 + p.Smth * 0.35), sh = shadeOf(L, w, h, p.LghD, p['Dtl '] * 0.0055), t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = 0.5 + sh[i] + (L[i] / 255 - 0.5) * 0.55;
    return outFgBg(src, t, env.fg, env.bg);
  },
  plaster(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.6 + p.Smth * 0.45), thr = 255 * p.ImgB / 50;
    const M = new Float32Array(n); for (let i = 0; i < n; i++) M[i] = clamp((L[i] - thr) / 30 + 0.5, 0, 1);
    const Hh = blurF(M.map(v => 1 - v), w, h, 1.6), sh = shadeOf(Hh, w, h, p.LghD, 7), t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = 0.62 + sh[i] - (1 - M[i]) * 0.18;
    return outFgBg(src, t, env.fg, env.bg);
  },
  waterPaper(src, w, h, p, env) {
    const n = w * h, C = blur3(...channels(src, n), w, h, 1.4);
    const f1 = strokeNoise(w, h, 30, p.FbrL, env.seed, 0.4), f2 = strokeNoise(w, h, 115, p.FbrL * 0.7, env.seed + 1, 0.4);
    const fib = new Float32Array(n); for (let i = 0; i < n; i++) fib[i] = Math.max(f1[i], f2[i]);
    const dx = blurF(f1, w, h, 1).map(v => v * 1.5), dy = blurF(f2, w, h, 1).map(v => v * 1.5);
    const disp = remapF3(C, w, h, dx, dy), br = (p.Brgh - 50) * 1.6, ct = 0.35 + p.Cntr / 100 * 0.9, o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      const v = disp[c][i] * (0.9 + clamp(fib[i], -1.5, 2) * 0.06);
      o[c][i] = (v - 128) * ct + 128 + br + 18;
    }
    return outRGB(src, ...o);
  },
  tornEdges(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 1.2), nz = valueNoise(w, h, 2, env.seed, 2), wn = whiteNoise(w, h, env.seed + 1);
    const thr = 255 * p.ImgB / 50, rough = 90 / (1 + p.Smth * 0.35), t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = ((L[i] + ((nz[i] - 0.5) * 0.7 + (wn[i] - 0.5) * 0.3) * rough) - thr) * p.Cntr * 0.012 + 0.5;
    return outFgBg(src, blurF(t, w, h, 0.5), env.fg, env.bg);
  },
  charcoal(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.8), sn = strokeNoise(w, h, 45, 5 + p.ChAm * 3, env.seed, 0.3 + p.ChAm * 0.35);
    const E = gradMag(L, w, h), bal = (p.LgDr - 50) / 100, t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = (L[i] / 255 - 0.5 + bal) * 3 + 0.5 + sn[i] * 0.35 - clamp(E[i] / 30, 0, 1) * p['Dtl '] * 0.22;
    return outFgBg(src, t, env.fg, env.bg);
  },
  conteCrayon(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.6), fg = env.fg, bg = env.bg, mid = [0, 1, 2].map(c => (fg[c] + bg[c]) / 2);
    const o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], fl = p.FrgL / 15, bl = p.BckL / 15;
    for (let i = 0; i < n; i++) {
      const t = L[i] / 255, dw = clamp((0.65 - t) * 2.2, 0, 1) * fl * 1.15, lw = clamp((t - 0.35) * 2.2, 0, 1) * bl * 1.15;
      for (let c = 0; c < 3; c++) o[c][i] = mid[c] + (fg[c] - mid[c]) * clamp(dw, 0, 1) + (bg[c] - mid[c]) * clamp(lw, 0, 1);
    }
    return outRGB(src, ...applyTexture(...o, w, h, p, env, 1.6));
  },
  stamp(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.3 + p.Smth * 0.28), thr = 255 * p.LgDr / 50, t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = (L[i] - thr) / 6 + 0.5;
    return outFgBg(src, t, env.fg, env.bg);
  },
  reticulation(src, w, h, p, env) {
    const n = w * h, L = lumOf(src, n), nz = blurF(whiteNoise(w, h, env.seed), w, h, 0.7), fg = env.fg, bg = env.bg, mid = [0, 1, 2].map(c => (fg[c] + bg[c]) / 2);
    const fgc = mid.map((m, c) => m + (fg[c] - m) * p.FrgL / 50), bgc = mid.map((m, c) => m + (bg[c] - m) * (0.5 + p.BckL / 100)), t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = (L[i] / 255 - 0.5 + (nz[i] - 0.5) * (0.4 + p.Dnst / 50 * 3)) * 6 + 0.5;
    return outFgBg(src, t, fgc, bgc);
  },
  photocopy(src, w, h, p, env) {
    const n = w * h, L = lumOf(src, n), a = blurF(L, w, h, 0.7), b = blurF(L, w, h, 1 + p['Dtl '] * 0.55), t = new Float32Array(n);
    for (let i = 0; i < n; i++) { const d = a[i] - b[i]; t[i] = 1 - clamp((-d - 1.5) * p.Drkn * 0.035, 0, 1) - clamp((40 - L[i]) / 40, 0, 1) * 0.3; }
    return outFgBg(src, t, env.fg, env.bg);
  },

  
  craquelure(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), v = voronoi(w, h, 4 + p.CrcS * 1.3, 0.9, env.seed);
    const width = 0.6 + p.CrcD * 0.12, H = new Float32Array(n);
    for (let i = 0; i < n; i++) H[i] = Math.min(v.e[i], 3 + p.CrcD) / (3 + p.CrcD);
    const sh = shadeOf(blurF(H, w, h, 0.8), w, h, 'LDTL', p.CrcD * 0.45), dark = 1 - p.CrcB / 10, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    const imgSh = shadeOf(blurF(lumOf(src, n), w, h, 1), w, h, 'LDTL', 0.004 * p.CrcD);
    for (let i = 0; i < n; i++) {
      const crack = 1 - smooth01(0, width + 0.6, v.e[i]), k = 1 + sh[i] + imgSh[i];
      const m = k * (1 - crack * (0.35 + dark * 0.6));
      o[0][i] = R[i] * m; o[1][i] = G[i] * m; o[2][i] = B[i] * m;
    }
    return outRGB(src, ...o);
  },
  grain(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), ct = (p.Cntr - 50) / 50, I = p.Intn / 100, type = p.Grnt;
    const o = [R, G, B].map(c => c.map(v => (v - 128) * (1 + ct * 0.9) + 128));
    const wn = whiteNoise(w, h, env.seed), fg = env.fg, bg = env.bg;
    let nz;
    if (type === 'GrSf') nz = detrend(blurF(wn, w, h, 0.8));
    else if (type === 'GrnC') nz = detrend(blurF(wn, w, h, 1.6));
    else if (type === 'GrnE') nz = detrend(blurF(wn, w, h, 2.6));
    else if (type === 'GrnH') nz = detrend(motionF(wn, w, h, 0, 12));
    else if (type === 'GrnV') nz = detrend(motionF(wn, w, h, 90, 12));
    else nz = detrend(wn);
    if (type === 'GrSr' || type === 'GrSp' || type === 'GrSt') {
      const L = lumOf(src, n);
      for (let i = 0; i < n; i++) {
        const r = wn[i];
        if (type === 'GrSr') { if (r < I * 0.25) for (let c = 0; c < 3; c++) o[c][i] = bg[c]; }
        else if (type === 'GrSp') { if (r < I * 0.12) for (let c = 0; c < 3; c++) o[c][i] *= 0.25; else for (let c = 0; c < 3; c++) o[c][i] += (hash2(i, 3, env.seed) - 0.5) * I * 30; }
        else { const t = L[i] / 255 + (r - 0.5) * (0.4 + I); const col = t < 0.5 ? fg : bg; for (let c = 0; c < 3; c++) o[c][i] = o[c][i] * (1 - I) + col[c] * I; }
      }
      return outRGB(src, ...o);
    }
    const amp = I * (type === 'GrCn' ? 120 : type === 'GrSf' ? 60 : 80);
    const cn = type === 'GrnR' ? [detrend(whiteNoise(w, h, env.seed + 1)), detrend(whiteNoise(w, h, env.seed + 2))] : null;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      const e = cn && c > 0 ? cn[c - 1][i] * 0.5 + nz[i] * 0.5 : nz[i];
      let v = o[c][i] + e * amp * 0.5; if (type === 'GrCn') v = (v - 128) * 1.5 + 128; o[c][i] = v;
    }
    return outRGB(src, ...o);
  },
  mosaicTiles(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), v = voronoi(w, h, p.TlSz * 1.6 + 3, 0.35, env.seed);
    const gw = p.GrtW * 0.6, H = new Float32Array(n);
    for (let i = 0; i < n; i++) H[i] = smooth01(gw, gw + 2.5, v.e[i]);
    const sh = shadeOf(H, w, h, 'LDTL', 0.9), lg = p.LghG / 10, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const g = 1 - smooth01(gw - 0.5, gw + 0.5, v.e[i]);
      for (const [c, s] of [[0, R], [1, G], [2, B]]) { const tile = s[i] * (1 + sh[i] * 0.8), grout = s[i] * (0.25 + lg * 0.35) + lg * 70; o[c][i] = tile * (1 - g) + grout * g; }
    }
    return outRGB(src, ...o);
  },
  patchwork(src, w, h, p, env) {
    const n = w * h, s = p.SqrS + 3, rel = p['Rlf '] / 25, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / s), cy = Math.floor(y / s), sx = Math.min(w - 1, cx * s + (s >> 1)), sy = Math.min(h - 1, cy * s + (s >> 1));
      const j = (sy * w + sx) * 4, lx = x - cx * s, ly = y - cy * s;
      const hgt = (hash2(cx, cy, env.seed) - 0.5) * rel * 70;
      const edge = (lx === 0 || ly === 0) ? rel * 60 : (lx === s - 1 || ly === s - 1) ? -rel * 80 : 0;
      const i = y * w + x; o[0][i] = src[j] + hgt + edge; o[1][i] = src[j + 1] + hgt + edge; o[2][i] = src[j + 2] + hgt + edge;
    }
    return outRGB(src, ...o);
  },
  stainedGlass(src, w, h, p, env) {
    const n = w * h, v = voronoi(w, h, p.ClSz * 2 + 2, 0.9, env.seed), acc = perCellMean(src, w, h, v.id, v.count), fg = env.fg;
    const bw = p.BrdT * 0.5, cx = w / 2, cy = h / 2, rmax = Math.hypot(cx, cy) || 1, li = p.LghI / 10;
    const o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, k = v.id[i] * 4, c = acc[k + 3] || 1, b = smooth01(bw - 0.6, bw + 0.6, v.e[i]);
      const glow = 1 + li * 0.9 * Math.max(0, 1 - Math.hypot(x - cx, y - cy) / rmax) ** 2;
      for (let q = 0; q < 3; q++) o[q][i] = (acc[k + q] / c) * glow * b + fg[q] * (1 - b);
    }
    return outRGB(src, ...o);
  },
  texturizer(src, w, h, p, env) {
    const n = w * h; return outRGB(src, ...applyTexture(...channels(src, n), w, h, p, env, 1));
  },

  
  fresco(src, w, h, p, env) {
    const n = w * h, r = 1 + p.BrsS * 0.6;
    let C = kuwahara(...channels(src, n), w, h, r); env.progress(0.4);
    C = sharpen3(C, w, h, r * 0.8 + 0.8, 0.5 + p.BrsD * 0.12);
    const L = lumRGB(...C), E = gradMag(blurF(L, w, h, 0.8), w, h), tex = blurF(whiteNoise(w, h, env.seed), w, h, 0.9);
    const o = C.map(c => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const k = 1 + (tex[i] - 0.5) * p.Txtr * 0.22, dk = clamp(E[i] / 30, 0, 1) * 0.28;
      for (let c = 0; c < 3; c++) o[c][i] = ((C[c][i] - 128) * 1.3 + 112) * k * (1 - dk);
    }
    return outRGB(src, ...o);
  },
  coloredPencil(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), L = lumOf(src, n), E = gradMag(blurF(L, w, h, 0.8), w, h);
    const pre = 0.3 + p.Pncl * 0.18, len = 4 + p.Pncl * 2;
    const h1 = strokeNoise(w, h, 45, len, env.seed, pre), h2 = strokeNoise(w, h, -45, len, env.seed + 1, pre);
    const bg = env.bg, pk = p.PprB / 25, paper = bg.map(c => c255(c * pk)), pr = 0.35 + p.StrP / 15 * 1.1;
    const o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const want = clamp((1 - L[i] / 255) * 0.9 + E[i] / 25, 0, 1) * pr;
      const hatch = Math.max(h1[i], h2[i] * (want > 0.5 ? 1 : 0.4));
      const cov = clamp((want - 0.45) * 2.2 + hatch * 0.45 + 0.1, 0, 1);
      o[0][i] = paper[0] + (R[i] * 0.92 - paper[0]) * cov; o[1][i] = paper[1] + (G[i] * 0.92 - paper[1]) * cov; o[2][i] = paper[2] + (B[i] * 0.92 - paper[2]) * cov;
    }
    return outRGB(src, ...o);
  },
  roughPastels(src, w, h, p, env) {
    const n = w * h, C = channels(src, n), nz = whiteNoise(w, h, env.seed);
    void nz; const sn = strokeNoise(w, h, 45, p.StrL * 1.5 + 3, env.seed, 0.6);
    let S = C.map(c => motionF(c, w, h, 45, p.StrL * 0.8 + 1).map((v, i) => v + sn[i] * 16)); env.progress(0.5);
    const det = p.StDt / 20;
    S = S.map((c, q) => c.map((v, i) => v * (1 - det * 0.5) + C[q][i] * det * 0.5));
    return outRGB(src, ...applyTexture(...S, w, h, p, env, 0.5));
  },
  underpainting(src, w, h, p, env) {
    const n = w * h, C = channels(src, n);
    let K = p.BrsS > 0 ? kuwahara(...C, w, h, 1 + p.BrsS / 5) : C; K = blur3(...K, w, h, 0.6 + p.BrsS * 0.08); env.progress(0.5);
    const cov = p.TxtC / 40, M = K.map((c, q) => c.map((v, i) => v * (0.75 + cov * 0.25) + C[q][i] * (0.25 - cov * 0.25)));
    return outRGB(src, ...applyTexture(...M, w, h, p, env, 0.4 + cov * 1.4));
  },
  dryBrush(src, w, h, p, env) {
    const n = w * h; let C = kuwahara(...channels(src, n), w, h, 1 + p.BrsS * 0.8); env.progress(0.5);
    const lv = 3 + p.BrsD, tex = strokeNoise(w, h, 30, 6, env.seed, 0.5);
    C = C.map(c => c.map((v, i) => { const q = posterize(v, lv); return (q * 0.55 + v * 0.45) * (1 + tex[i] * p.Txtr * 0.035); }));
    return outRGB(src, ...C);
  },
  posterEdges(src, w, h, p) {
    const n = w * h, C = blur3(...channels(src, n), w, h, 0.7), L = lumRGB(...C), lv = p.Pstr + 2;
    let E = gradMag(blurF(L, w, h, 1), w, h);
    if (p.EdgT > 1) E = dilate(E, w, h, (p.EdgT - 1) / 3);
    const thr = 14 - p.EdgI * 0.9, amt = 0.35 + p.EdgI * 0.065, o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) { const ink = clamp((E[i] - thr) / 14, 0, 1) * amt; for (let c = 0; c < 3; c++) o[c][i] = posterize(C[c][i], lv) * (1 - ink); }
    return outRGB(src, ...o);
  },
  sponge(src, w, h, p, env) {
    const n = w * h, C = blur3(...channels(src, n), w, h, p.Smth * 0.3), sp = valueNoise(w, h, 3 + p.BrsS * 1.6, env.seed, 3), df = p.Dfnt / 25;
    const o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const l0 = 0.299 * C[0][i] + 0.587 * C[1][i] + 0.114 * C[2][i], hole = 1 - smooth01(0.4, 0.56, sp[i]), k = 1 - hole * (0.2 + df * 0.5) * (0.5 + (1 - l0 / 255) * 0.7), sat = 1.2;
      const l = 0.299 * C[0][i] + 0.587 * C[1][i] + 0.114 * C[2][i];
      for (let c = 0; c < 3; c++) o[c][i] = (l + (C[c][i] - l) * sat) * k;
    }
    return outRGB(src, ...o);
  },
  paintDaubs(src, w, h, p, env) {
    const n = w * h, t = p.BrsT, wide = t === 'BrsW' || t === 'BrbW', r = Math.max(1, p.BrsS / (wide ? 2.7 : 4));
    let C = kuwahara(...channels(src, n), w, h, r); env.progress(0.5);
    if (t === 'BrbW') C = blur3(...C, w, h, 1 + r * 0.3);
    const sh = p.Shrp * (t === 'BrsW' ? 0.12 : 0.07);
    if (sh > 0 && t !== 'BrbW') C = sharpen3(C, w, h, 0.8 + r * 0.3, sh);
    if (t === 'BrsL' || t === 'BrDR' || t === 'BrSp') {
      const sn = strokeNoise(w, h, 30, 3 + r, env.seed, 0.5), wn = whiteNoise(w, h, env.seed + 9), L = lumRGB(...C), E = gradMag(L, w, h);
      C = C.map(c => c.map((v, i) => t === 'BrsL' ? v + clamp(sn[i], 0, 3) * 18 : t === 'BrDR' ? v * (1 - clamp(-sn[i], 0, 3) * 0.18) - 12
        : v + (wn[i] > 0.985 && E[i] > 6 ? 150 : 0)));
    }
    return outRGB(src, ...C);
  },
  filmGrain(src, w, h, p, env) {
    const n = w * h, [R, G, B] = channels(src, n), L = lumOf(src, n), nz = detrend(whiteNoise(w, h, env.seed));
    let hl = null;
    if (p.HghA > 0) { const thr = 255 - p.HghA * 11, m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = smooth01(thr - 20, 255, L[i]); hl = blurF(m, w, h, 2.5); }
    const hk = (1 - p.Intn / 10) * 180 + 25, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const g = nz[i] * p['Grn '] * 3.2 * (1 - L[i] / 255 * 0.65), add = hl ? hl[i] * hk : 0;
      o[0][i] = R[i] + g + add; o[1][i] = G[i] + g + add; o[2][i] = B[i] + g + add;
    }
    return outRGB(src, ...o);
  },
  cutout(src, w, h, p) {
    const n = w * h, C = blur3(...channels(src, n), w, h, 0.4 + p.EdgS * 0.75 + (3 - p.EdgF) * 0.6), L = lumRGB(...C), lv = p.NmbL;
    
    const hist = new Float64Array(256); for (let i = 0; i < n; i++) hist[L[i] | 0]++;
    const cuts = []; let acc = 0, q = 1;
    for (let v = 0; v < 256 && q < lv; v++) { acc += hist[v]; while (q < lv && acc >= n * q / lv) { cuts.push(v); q++; } }
    const lvOf = v => { let k = 0; while (k < cuts.length && v > cuts[k]) k++; return k; };
    const sum = new Float64Array(lv * 4), lab = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) { const k = lvOf(L[i]); lab[i] = k; sum[k * 4] += src[j]; sum[k * 4 + 1] += src[j + 1]; sum[k * 4 + 2] += src[j + 2]; sum[k * 4 + 3]++; }
    const o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) { const k = lab[i] * 4, c = sum[k + 3] || 1; o[0][i] = sum[k] / c; o[1][i] = sum[k + 1] / c; o[2][i] = sum[k + 2] / c; }
    return outRGB(src, ...o);
  },
  neonGlow(src, w, h, p, env) {
    const n = w * h, L = blurF(lumOf(src, n), w, h, 0.6), fg = env.fg, bg = env.bg, gc = p['Clr '] || [0, 72, 255], sz = p['Sz  '];
    const base = new Float32Array(n); for (let i = 0; i < n; i++) base[i] = L[i] / 255;
    let mask;
    if (sz >= 0) mask = blurF(base.map(v => v * v), w, h, 0.5 + sz * 0.8);                      
    else mask = blurF(base.map(v => (1 - v) ** 2), w, h, 0.5 - sz * 0.8).map(v => 1 - v);       
    const amt = p.Brgh / 50 * 1.8, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const t = base[i] * 0.6, g = clamp(mask[i] * amt, 0, 1);
      for (let c = 0; c < 3; c++) { const b = fg[c] + (bg[c] - fg[c]) * t, s = gc[c] * g; o[c][i] = 255 - (255 - b * 0.8) * (255 - s) / 255; }
    }
    return outRGB(src, ...o);
  },
  watercolor(src, w, h, p, env) {
    const n = w * h; let C = kuwahara(...channels(src, n), w, h, 1 + (15 - p.BrsD) / 3); env.progress(0.5);
    C = blur3(...C, w, h, 0.8);
    const L = lumRGB(...C), E = gradMag(L, w, h), tex = blurF(whiteNoise(w, h, env.seed), w, h, 1.2), o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const l = L[i], sd = l < 110 ? (1 - l / 110) * p.ShdI * 0.075 : 0, pool = clamp(E[i] / 25, 0, 1) * (0.12 + p.ShdI * 0.03);
      const k = (1 - sd - pool) * (1 + (tex[i] - 0.5) * p.Txtr * 0.12);
      for (let c = 0; c < 3; c++) o[c][i] = (l + (C[c][i] - l) * 1.25) * k;
    }
    return outRGB(src, ...o);
  },
  plasticWrap(src, w, h, p) {
    
    const n = w * h, [R, G, B] = channels(src, n), L = lumOf(src, n);
    const Hh = blurF(L, w, h, 0.8 + (16 - p['Dtl ']) * 0.25 + p.Smth * 0.3);
    const [gx, gy] = sobel(Hh, w, h), lap = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; lap[i] = Hh[i - 1] + Hh[i + 1] + Hh[i - w] + Hh[i + w] - 4 * Hh[i]; }
    const lx = -0.5, ly = -0.5, lz = 0.707, hx = lx, hy = ly, hz = lz + 1, hl0 = Math.hypot(hx, hy, hz), s0 = 0.12;
    const hlRaw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const nx = -gx[i] * s0, ny = -gy[i] * s0, nl = Math.hypot(nx, ny, 1);
      const d = (nx * hx + ny * hy + hz) / (nl * hl0), flat = hz / hl0;
      const spec = d > flat ? ((d - flat) / (1 - flat + 1e-6)) : 0;
      hlRaw[i] = clamp(spec * 2.2, 0, 1) ** 1.5 + clamp((-lap[i] - 0.6) / 3, 0, 1) * 0.5;
    }
    const hl = blurF(hlRaw, w, h, 0.6), k = p.HghS / 20, o = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) {
      const sp = clamp(hl[i], 0, 1) * k, shadow = clamp(((gx[i] + gy[i]) * 0.7071 * s0 - 0.25) * 1.5, 0, 1) * 0.35 * k;
      for (const [c, S] of [[0, R], [1, G], [2, B]]) o[c][i] = (S[i] * (1 - shadow)) + (255 - S[i] * (1 - shadow)) * sp;
    }
    return outRGB(src, ...o);
  },
  paletteKnife(src, w, h, p, env) {
    const n = w * h, r = Math.max(1, p.StrS / 4.5), C0 = channels(src, n);
    let C = kuwahara(...C0, w, h, r); env.progress(0.4);
    if (p.StDt > 1) { const F = kuwahara(...C0, w, h, Math.max(1, r / 2.5)), a = (p.StDt - 1) / 2 * 0.5; C = C.map((c, q) => c.map((v, i) => v * (1 - a) + F[q][i] * a)); }
    if (p.Sftn > 0) C = blur3(...C, w, h, p.Sftn * 0.45);
    return outRGB(src, ...C);
  },
  smudgeStick(src, w, h, p, env) {
    const n = w * h, C = channels(src, n), nz = whiteNoise(w, h, env.seed), L = lumOf(src, n);
    void nz; const sn = strokeNoise(w, h, 45, p.StrL * 2.5 + 3, env.seed, 0.5);
    const S = C.map(c => motionF(c, w, h, 45, p.StrL * 1.6 + 1).map((v, i) => v + sn[i] * 9));
    let hl = null;
    if (p.HghA > 0) { const thr = 255 - p.HghA * 11, m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = smooth01(thr - 20, 255, L[i]); hl = blurF(m, w, h, 2); }
    const hk = (1 - p.Intn / 10) * 160 + 30, o = C.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      const v = S[c][i], mn = Math.min(v, C[c][i]); o[c][i] = v * 0.6 + mn * 0.4 - 6 + (hl ? hl[i] * hk : 0);
    }
    return outRGB(src, ...o);
  },
};


function spatterRGBA(src, w, h, radius, smoothness, seed) {
  if (radius <= 0) return new Uint8ClampedArray(src);
  const s = 0.25 + smoothness * 0.12;
  const nx = detrend(blurF(whiteNoise(w, h, seed + 21), w, h, s)), ny = detrend(blurF(whiteNoise(w, h, seed + 22), w, h, s));
  const k = radius * 0.3, dx = nx.map(v => clamp(v, -2, 2) * k), dy = ny.map(v => clamp(v, -2, 2) * k);
  return remapRGBA(src, w, h, dx, dy, true);
}
function remapRGBA(src, w, h, dx, dy, nearest = false) {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    let fx = clamp(x + dx[i], 0, w - 1), fy = clamp(y + dy[i], 0, h - 1);
    if (nearest) { const j = (Math.round(fy) * w + Math.round(fx)) * 4; out[o] = src[j]; out[o + 1] = src[j + 1]; out[o + 2] = src[j + 2]; out[o + 3] = src[o + 3]; continue; }
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
    for (let q = 0; q < 3; q++) out[o + q] = (src[a + q] * (1 - tx) + src[b + q] * tx) * (1 - ty) + (src[c + q] * (1 - tx) + src[d + q] * tx) * ty;
    out[o + 3] = src[o + 3];
  }
  return out;
}
function remapF3(C, w, h, dx, dy) {
  const o = C.map(() => new Float32Array(w * h));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, sx = Math.round(clamp(x + dx[i], 0, w - 1)), sy = Math.round(clamp(y + dy[i], 0, h - 1)), j = sy * w + sx;
    o[0][i] = C[0][j]; o[1][i] = C[1][j]; o[2][i] = C[2][j];
  }
  return o;
}



export class GalleryCancelled extends Error { constructor() { super('已取消'); this.cancelled = true; } }








export function applyGalleryEffect(id, rgba, w, h, params, env = {}) {
  const fn = FX[id]; if (!fn) throw new Error('滤镜库没有这个效果：' + id);
  if (!(w > 0 && h > 0) || rgba.length < w * h * 4) throw new Error('滤镜库：像素尺寸不对');
  const p = normalizeEffectParams(id, params);
  const e = { fg: env.fg || [0, 0, 0], bg: env.bg || [255, 255, 255], texture: env.texture || null, seed: (env.seed ?? 1) | 0, progress: env.progress || (() => {}) };
  if (p.TxtT === 'custom' && !e.texture) p.TxtT = 'TxCa';     
  const src = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
  return fn(src, w, h, p, e);
}





export function applyGalleryStack(rgba, w, h, layers, env = {}) {
  let cur = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  const live = (layers || []).filter(l => l && l.visible !== false && FX[l.id]);
  const prog = env.progress || (() => {});
  for (let k = 0; k < live.length; k++) {
    if (env.isCancelled && env.isCancelled()) throw new GalleryCancelled();
    const L = live[k];
    cur = applyGalleryEffect(L.id, cur, w, h, L.params || {}, { ...env, texture: (L.texture || env.texture || null), progress: f => prog((k + clamp(f, 0, 1)) / live.length) });
    prog((k + 1) / live.length);
  }
  return cur;
}


export { effectDescriptor, galleryDescriptor, decodeGalleryDescriptor, galleryFilterFXEntry } from './filter-gallery-spec.js';
import { effectDescriptor, galleryDescriptor, decodeGalleryDescriptor, galleryFilterFXEntry } from './filter-gallery-spec.js';

export default { GALLERY_GROUPS, GALLERY_EFFECTS, effectSpec, effectByClass, effectDefaults, normalizeEffectParams,
  applyGalleryEffect, applyGalleryStack, effectDescriptor, galleryDescriptor, decodeGalleryDescriptor, galleryFilterFXEntry, GalleryCancelled };
