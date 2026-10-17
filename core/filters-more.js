




















import { gaussPremul } from './gauss-premul.js';   

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const cx = (x, w) => (x < 0 ? 0 : x >= w ? w - 1 : x);
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function copyOf(rgba) { return new Uint8ClampedArray(rgba); }

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

function toPremul(rgba) {
  const n = rgba.length >> 2, f = new Float32Array(rgba.length);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const a = rgba[o + 3] / 255;
    f[o] = rgba[o] * a; f[o + 1] = rgba[o + 1] * a; f[o + 2] = rgba[o + 2] * a; f[o + 3] = rgba[o + 3];
  }
  return f;
}
function fromPremul(f, out) {
  for (let o = 0; o < f.length; o += 4) {
    const a = f[o + 3];
    out[o + 3] = clamp255(Math.round(a));
    if (a <= 0.001) { out[o] = out[o + 1] = out[o + 2] = 0; continue; }
    const inv = 255 / a;
    out[o] = clamp255(Math.round(f[o] * inv));
    out[o + 1] = clamp255(Math.round(f[o + 1] * inv));
    out[o + 2] = clamp255(Math.round(f[o + 2] * inv));
  }
  return out;
}


function gKernel(r) {
  const n = Math.max(1, Math.ceil(r)), sigma = r / 3 || 1e-6, k = new Float32Array(2 * n + 1);
  let s = 0;
  for (let i = -n; i <= n; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + n] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

function blurPlanes(src, w, h, ch, r) {
  if (r <= 0) return Float32Array.from(src);
  const k = gKernel(r), n = (k.length - 1) >> 1;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (y * w + x) * ch;
    for (let c = 0; c < ch; c++) {
      let s = 0;
      for (let i = -n; i <= n; i++) s += src[(y * w + cx(x + i, w)) * ch + c] * k[i + n];
      tmp[d + c] = s;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (y * w + x) * ch;
    for (let c = 0; c < ch; c++) {
      let s = 0;
      for (let i = -n; i <= n; i++) s += tmp[(cx(y + i, h) * w + x) * ch + c] * k[i + n];
      out[d + c] = s;
    }
  }
  return out;
}

function gauss(rgba, w, h, r) {
  if (r <= 0) return copyOf(rgba);
  return fromPremul(gaussPremul(toPremul(rgba), w, h, r), new Uint8ClampedArray(rgba.length));
}

function lumaPlane(rgba, w, h) {
  const L = new Float32Array(w * h);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) L[i] = lum(rgba[o], rgba[o + 1], rgba[o + 2]);
  return L;
}




function sampleBilinear(P, w, h, x, y, edge, out) {
  if (edge === 'clear' && (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5)) { out[0] = out[1] = out[2] = out[3] = 0; return; }
  const x0f = Math.floor(x), y0f = Math.floor(y), tx = x - x0f, ty = y - y0f;
  const ix = v => (edge === 'wrap' ? ((v % w) + w) % w : cx(v, w));
  const iy = v => (edge === 'wrap' ? ((v % h) + h) % h : cx(v, h));
  const x0 = ix(x0f), x1 = ix(x0f + 1), y0 = iy(y0f), y1 = iy(y0f + 1);
  const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  for (let k = 0; k < 4; k++) out[k] = P[a + k] * w00 + P[b + k] * w10 + P[c + k] * w01 + P[d + k] * w11;
}

function remap(rgba, w, h, fn, edge = 'repeat') {
  const P = toPremul(rgba), F = new Float32Array(rgba.length), s = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = fn(x + 0.5, y + 0.5);
    const o = (y * w + x) * 4;
    if (!r) { F[o] = F[o + 1] = F[o + 2] = F[o + 3] = 0; continue; }
    sampleBilinear(P, w, h, r[0] - 0.5, r[1] - 0.5, edge, s);
    F[o] = s[0]; F[o + 1] = s[1]; F[o + 2] = s[2]; F[o + 3] = s[3];
  }
  return fromPremul(F, new Uint8ClampedArray(rgba.length));
}
const EDGE = [['wrap', '折回'], ['repeat', '重复边缘像素'], ['clear', '透明']];




function twirl(rgba, w, h, p) {
  const A = (+p.angle || 0) * Math.PI / 180;
  if (!A) return copyOf(rgba);
  const cX = w / 2, cY = h / 2, R = Math.min(w, h) / 2;
  return remap(rgba, w, h, (x, y) => {
    const dx = x - cX, dy = y - cY, r = Math.hypot(dx, dy);
    if (r >= R) return [x, y];
    const t = 1 - r / R, a = -A * t * t, co = Math.cos(a), si = Math.sin(a);
    return [cX + dx * co - dy * si, cY + dx * si + dy * co];
  });
}


function pinch(rgba, w, h, p) {
  const k = clamp(+p.amount || 0, -100, 100) / 100;
  if (!k) return copyOf(rgba);
  const cX = w / 2, cY = h / 2, rx = w / 2, ry = h / 2;
  return remap(rgba, w, h, (x, y) => {
    const nx = (x - cX) / rx, ny = (y - cY) / ry, d = Math.hypot(nx, ny);
    if (d >= 1 || d === 0) return [x, y];
    const f = Math.pow(Math.sin(Math.PI / 2 * d), -k);
    return [cX + nx * f * rx, cY + ny * f * ry];
  });
}


function spherize(rgba, w, h, p) {
  const t = clamp(+p.amount || 0, -100, 100) / 100;
  if (!t) return copyOf(rgba);
  const mode = p.mode || 'normal';
  const cX = w / 2, cY = h / 2, rx = w / 2, ry = h / 2;
  const ex = t > 0 ? 1 + t : 1 / (1 - t);
  return remap(rgba, w, h, (x, y) => {
    let nx = (x - cX) / rx, ny = (y - cY) / ry;
    if (mode === 'horizontal') { const d = Math.abs(nx); if (d >= 1) return [x, y]; nx = Math.sign(nx) * Math.pow(d, ex); return [cX + nx * rx, y]; }
    if (mode === 'vertical') { const d = Math.abs(ny); if (d >= 1) return [x, y]; ny = Math.sign(ny) * Math.pow(d, ex); return [x, cY + ny * ry]; }
    const d = Math.hypot(nx, ny);
    if (d >= 1 || d === 0) return [x, y];
    const f = Math.pow(d, ex) / d;
    return [cX + nx * f * rx, cY + ny * f * ry];
  });
}


function wave(rgba, w, h, p) {
  const n = Math.round(clamp(+p.generators || 5, 1, 99));
  const wl0 = clamp(+p.wavelengthMin || 10, 1, 998), wl1 = Math.max(wl0, clamp(+p.wavelengthMax || 120, 2, 999));
  const am0 = clamp(+p.amplitudeMin || 5, 0, 998), am1 = Math.max(am0, clamp(+p.amplitudeMax || 35, 1, 999));
  const sx = clamp(p.scaleH == null ? 100 : +p.scaleH, 0, 100) / 100, sy = clamp(p.scaleV == null ? 100 : +p.scaleV, 0, 100) / 100;
  const type = p.type || 'sine', rand = rng(p.seed == null ? 1 : p.seed | 0);
  const fn = type === 'triangle' ? t => 2 / Math.PI * Math.asin(Math.sin(t))
    : type === 'square' ? t => (Math.sin(t) >= 0 ? 1 : -1) : Math.sin;
  const gens = [];
  for (let i = 0; i < n; i++) gens.push({
    wl: wl0 + (wl1 - wl0) * rand(), amp: (am0 + (am1 - am0) * rand()) / n, ph: rand() * Math.PI * 2, dir: rand() < 0.5 });
  return remap(rgba, w, h, (x, y) => {
    let dx = 0, dy = 0;
    for (const g of gens) {
      if (g.dir) dx += g.amp * fn(2 * Math.PI * y / g.wl + g.ph);
      else dy += g.amp * fn(2 * Math.PI * x / g.wl + g.ph);
    }
    return [x + dx * sx, y + dy * sy];
  }, p.edge || 'wrap');
}


function ripple(rgba, w, h, p) {
  const amt = clamp(+p.amount || 0, -999, 999) / 100;
  if (!amt) return copyOf(rgba);
  const wl = { small: 6, medium: 14, large: 28 }[p.size || 'medium'] || 14;
  const A = amt * wl / 3;
  return remap(rgba, w, h, (x, y) => {
    const jx = (hash2(Math.floor(y / wl), 7, 3) - 0.5) * 1.2, jy = (hash2(Math.floor(x / wl), 11, 5) - 0.5) * 1.2;
    return [x + A * Math.sin(2 * Math.PI * y / wl + jx), y + A * Math.sin(2 * Math.PI * x / wl + jy)];
  }, 'repeat');
}


function polar(rgba, w, h, p) {
  const cX = w / 2, cY = h / 2, TAU = Math.PI * 2;
  if ((p.mode || 'rectToPolar') === 'rectToPolar') {
    return remap(rgba, w, h, (x, y) => {
      const nx = (x - cX) / (w / 2), ny = (y - cY) / (h / 2), r = Math.hypot(nx, ny);
      let th = Math.atan2(nx, -ny); if (th < 0) th += TAU;
      return [th / TAU * w, r * h];
    }, 'repeat');
  }
  return remap(rgba, w, h, (x, y) => {
    const th = x / w * TAU, r = y / h;
    return [cX + Math.sin(th) * r * (w / 2), cY - Math.cos(th) * r * (h / 2)];
  }, 'repeat');
}


function shear(rgba, w, h, p) {
  const k = clamp(+p.amount || 0, -100, 100) / 100 * w / 2;
  if (!k) return copyOf(rgba);
  const s = p.shape === 's';
  return remap(rgba, w, h, (x, y) => {
    const t = y / h;
    return [x - k * (s ? Math.sin(2 * Math.PI * t) : Math.sin(Math.PI * t)), y];
  }, p.edge || 'wrap');
}


function zigzag(rgba, w, h, p) {
  const amt = clamp(+p.amount || 0, -100, 100) / 100;
  if (!amt) return copyOf(rgba);
  const ridges = clamp(+p.ridges || 5, 1, 20), style = p.style || 'pondRipples';
  const cX = w / 2, cY = h / 2, R = Math.min(w, h) / 2;
  const A = amt * R / ridges / 2;
  return remap(rgba, w, h, (x, y) => {
    const dx = x - cX, dy = y - cY, r = Math.hypot(dx, dy);
    if (r >= R || r === 0) return [x, y];
    const fall = 1 - r / R, s = Math.sin(2 * Math.PI * ridges * r / R) * A * fall;
    let nr = r, ang = Math.atan2(dy, dx);
    if (style !== 'aroundCenter') nr = r + s;
    if (style !== 'outFromCenter') ang += s / Math.max(r, 1) * (style === 'aroundCenter' ? 1 : 0.5);
    return [cX + Math.cos(ang) * nr, cY + Math.sin(ang) * nr];
  });
}




function displace(rgba, w, h, p) {
  const M = p._map;
  if (!M || !M.rgba || !M.w || !M.h) throw new Error('先选一张置换图');
  const sx = clamp(+p.scaleH || 10, -999, 999) / 100, sy = clamp(+p.scaleV || 10, -999, 999) / 100, tile = p.mode === 'tile';
  const mv = (x, y, c) => {
    const mx = tile ? ((Math.floor(x) % M.w) + M.w) % M.w : Math.min(M.w - 1, Math.floor(x / w * M.w));
    const my = tile ? ((Math.floor(y) % M.h) + M.h) % M.h : Math.min(M.h - 1, Math.floor(y / h * M.h));
    return M.rgba[(my * M.w + mx) * 4 + c];
  };
  return remap(rgba, w, h, (x, y) => {
    const dx = (mv(x, y, 0) - 128) * sx, dy = (mv(x, y, 1) - 128) * sy;
    return [x + dx, y + dy];
  }, p.edge || 'repeat');
}




function wind(rgba, w, h, p) {
  const method = p.method || 'wind', dir = p.direction === 'fromLeft' ? 1 : -1;
  const rand = rng(p.seed == null ? 7 : p.seed | 0);
  const maxLen = method === 'blast' ? 60 : method === 'stagger' ? 30 : 20;
  const out = copyOf(rgba), L = lumaPlane(rgba, w, h);
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < w; i++) {
      const x = dir > 0 ? i : w - 1 - i, xp = x - dir;
      if (xp < 0 || xp >= w) continue;
      const d = L[y * w + xp] - L[y * w + x];
      if (Math.abs(d) < 16 || rand() > 0.6) continue;
      const src = (y * w + xp) * 4;
      const len = Math.round(maxLen * (0.3 + 0.7 * rand()));
      const yy = method === 'stagger' ? cx(y + Math.round((rand() - 0.5) * 4), h) : y;
      for (let k = 0; k < len; k++) {
        const tx = x + k * dir; if (tx < 0 || tx >= w) break;
        const o = (yy * w + tx) * 4, a = (1 - k / len) * 0.8;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(out[o + c] + (rgba[src + c] - out[o + c]) * a);
      }
    }
  }
  return out;
}


function diffuse(rgba, w, h, p) {
  const mode = p.mode || 'normal', rand = rng(p.seed == null ? 3 : p.seed | 0), out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (mode === 'anisotropic') {
      let best = -1, bd = 1e9;
      for (let k = 0; k < 4; k++) {
        const s = (cx(y + Math.round((rand() - 0.5) * 4), h) * w + cx(x + Math.round((rand() - 0.5) * 4), w)) * 4;
        const d = Math.abs(rgba[s] - rgba[o]) + Math.abs(rgba[s + 1] - rgba[o + 1]) + Math.abs(rgba[s + 2] - rgba[o + 2]);
        if (d > 0 && d < bd) { bd = d; best = s; }
      }
      if (best >= 0) for (let c = 0; c < 4; c++) out[o + c] = rgba[best + c];
      continue;
    }
    const s = (cx(y + Math.round((rand() - 0.5) * 4), h) * w + cx(x + Math.round((rand() - 0.5) * 4), w)) * 4;
    const ls = lum(rgba[s], rgba[s + 1], rgba[s + 2]), lo = lum(rgba[o], rgba[o + 1], rgba[o + 2]);
    if (mode === 'darkenOnly' && ls >= lo) continue;
    if (mode === 'lightenOnly' && ls <= lo) continue;
    for (let c = 0; c < 4; c++) out[o + c] = rgba[s + c];
  }
  return out;
}


function tiles(rgba, w, h, p) {
  const n = Math.round(clamp(+p.number || 10, 1, 99)), size = Math.max(1, Math.floor(Math.min(w, h) / n));
  const maxOff = clamp(+p.maxOffset || 10, 1, 99) / 100 * size, rand = rng(p.seed == null ? 5 : p.seed | 0);
  const out = new Uint8ClampedArray(rgba.length), fill = p.fill || 'background';
  const fg = p._fg || [0, 0, 0], bg = p._bg || [255, 255, 255];
  for (let o = 0; o < out.length; o += 4) {
    if (fill === 'unaltered') { for (let c = 0; c < 4; c++) out[o + c] = rgba[o + c]; continue; }
    if (fill === 'inverse') { out[o] = 255 - rgba[o]; out[o + 1] = 255 - rgba[o + 1]; out[o + 2] = 255 - rgba[o + 2]; out[o + 3] = rgba[o + 3]; continue; }
    const col = fill === 'foreground' ? fg : bg;
    out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
  }
  for (let ty = 0; ty < h; ty += size) for (let tx = 0; tx < w; tx += size) {
    const ox = Math.round((rand() * 2 - 1) * maxOff), oy = Math.round((rand() * 2 - 1) * maxOff);
    for (let y = ty; y < Math.min(h, ty + size); y++) for (let x = tx; x < Math.min(w, tx + size); x++) {
      const X = x + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const s = (y * w + x) * 4, d = (Y * w + X) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = rgba[s + c];
    }
  }
  return out;
}


function traceContour(rgba, w, h, p) {
  const lv = clamp(+p.level || 128, 0, 255), upper = (p.edge || 'lower') === 'upper';
  const out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      const v = rgba[o + c], r = rgba[(y * w + cx(x + 1, w)) * 4 + c], d = rgba[(cx(y + 1, h) * w + x) * 4 + c];
      const me = upper ? v > lv : v < lv;
      const cross = me && ((upper ? r <= lv : r >= lv) || (upper ? d <= lv : d >= lv));
      out[o + c] = cross ? 0 : 255;
    }
  }
  return out;
}


function extrude(rgba, w, h, p) {
  const size = Math.round(clamp(+p.size || 30, 2, 255)), depth = clamp(+p.depth || 30, 1, 255);
  const pyr = (p.type || 'blocks') === 'pyramids', solid = p.solidFront !== false;
  const rand = rng(p.seed == null ? 9 : p.seed | 0), levelBased = p.depthMode === 'level';
  const out = copyOf(rgba);
  const shade = [1.35, 1.1, 0.85, 0.6];                  
  for (let by = 0; by < h; by += size) for (let bx = 0; bx < w; bx += size) {
    const x1 = Math.min(w, bx + size), y1 = Math.min(h, by + size);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) { const o = (y * w + x) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; n++; }
    r /= n; g /= n; b /= n;
    const hgt = levelBased ? lum(r, g, b) / 255 * depth : rand() * depth;
    const bevel = Math.min(size / 2, Math.max(1, hgt / 255 * size / 2 + (pyr ? size : 0)));
    const cw = x1 - bx, ch = y1 - by;
    for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) {
      const o = (y * w + x) * 4, lx = x - bx, ly = y - by;
      const dT = ly, dB = ch - 1 - ly, dL = lx, dR = cw - 1 - lx, m = Math.min(dT, dB, dL, dR);
      let base = [r, g, b];
      if (!solid && !pyr) base = [rgba[o], rgba[o + 1], rgba[o + 2]];
      if (!pyr && m >= bevel) { out[o] = base[0]; out[o + 1] = base[1]; out[o + 2] = base[2]; continue; }
      const face = m === dT ? 0 : m === dL ? 1 : m === dR ? 2 : 3;
      out[o] = clamp255(base[0] * shade[face]); out[o + 1] = clamp255(base[1] * shade[face]); out[o + 2] = clamp255(base[2] * shade[face]);
    }
  }
  return out;
}


function oilPaint(rgba, w, h, p) {
  const sty = clamp(+p.stylization || 3, 0.1, 10), clean = clamp(p.cleanliness == null ? 5 : +p.cleanliness, 0, 10);
  const r = Math.max(1, Math.round((1 + clean * 0.4 + sty * 0.3) * clamp(+p.scale || 1, 0.1, 10) ** 0.5));
  const bins = Math.max(4, Math.round(24 - sty * 1.8));
  const out = copyOf(rgba), cnt = new Int32Array(bins), sr = new Float64Array(bins), sg = new Float64Array(bins), sb = new Float64Array(bins);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    cnt.fill(0); sr.fill(0); sg.fill(0); sb.fill(0);
    for (let j = -r; j <= r; j++) { const yy = cx(y + j, h); for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      const o = (yy * w + cx(x + i, w)) * 4, k = Math.min(bins - 1, (lum(rgba[o], rgba[o + 1], rgba[o + 2]) * bins / 256) | 0);
      cnt[k]++; sr[k] += rgba[o]; sg[k] += rgba[o + 1]; sb[k] += rgba[o + 2];
    } }
    let best = 0; for (let k = 1; k < bins; k++) if (cnt[k] > cnt[best]) best = k;
    const o = (y * w + x) * 4;
    out[o] = sr[best] / cnt[best]; out[o + 1] = sg[best] / cnt[best]; out[o + 2] = sb[best] / cnt[best];
  }
  if (p.lighting === false) return out;
  const shine = clamp(p.shine == null ? 1 : +p.shine, 0, 10), a = (p.angle == null ? -60 : +p.angle) * Math.PI / 180;
  const detail = clamp(p.bristle == null ? 5 : +p.bristle, 0, 10);
  const H = blurPlanes(lumaPlane(out, w, h), w, h, 1, Math.max(0.5, 2 - detail * 0.15));
  const lx = Math.cos(a), ly = -Math.sin(a);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = H[y * w + cx(x + 1, w)] - H[y * w + cx(x - 1, w)], gy = H[cx(y + 1, h) * w + x] - H[cx(y - 1, h) * w + x];
    const s = -(gx * lx + gy * ly) * shine * 0.12, o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = clamp255(out[o + c] + s * 8);
  }
  return out;
}




function surfaceBlur(rgba, w, h, p) {
  const r = Math.round(clamp(+p.radius || 5, 1, 100)), thr = clamp(+p.threshold || 15, 2, 255);
  const step = Math.max(1, Math.floor(r / 6)), inv = 1 / (2.5 * thr), out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      const v0 = rgba[o + c]; let s = 0, ws = 0;
      for (let j = -r; j <= r; j += step) { const row = cx(y + j, h) * w; for (let i = -r; i <= r; i += step) {
        const v = rgba[(row + cx(x + i, w)) * 4 + c], wt = 1 - Math.abs(v - v0) * inv;
        if (wt > 0) { s += v * wt; ws += wt; }
      } }
      out[o + c] = ws > 0 ? Math.round(s / ws) : v0;
    }
  }
  return out;
}


function smartBlur(rgba, w, h, p) {
  const r = Math.round(clamp(+p.radius || 3, 0.1, 100)) || 1, thr = clamp(+p.threshold || 25, 0.1, 100) * 2.55;
  const q = { low: 3, medium: 2, high: 1 }[p.quality || 'medium'] || 2, mode = p.mode || 'normal';
  const step = Math.max(1, Math.min(q, r)), out = copyOf(rgba);
  if (mode !== 'normal') {
    const L = lumaPlane(rgba, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = L[y * w + cx(x + 1, w)] - L[y * w + cx(x - 1, w)], gy = L[cx(y + 1, h) * w + x] - L[cx(y - 1, h) * w + x];
      const edge = Math.hypot(gx, gy) > thr * 0.6, o = (y * w + x) * 4;
      if (mode === 'edgeOnly') { const v = edge ? 255 : 0; out[o] = out[o + 1] = out[o + 2] = v; }
      else if (edge) out[o] = out[o + 1] = out[o + 2] = 255;
    }
    return out;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      const v0 = rgba[o + c]; let s = 0, n = 0;
      for (let j = -r; j <= r; j += step) { const row = cx(y + j, h) * w; for (let i = -r; i <= r; i += step) {
        const v = rgba[(row + cx(x + i, w)) * 4 + c];
        if (Math.abs(v - v0) < thr) { s += v; n++; }
      } }
      out[o + c] = n ? Math.round(s / n) : v0;
    }
  }
  return out;
}


function shapeSamples(shape, n = 192) {
  const pts = [], GA = Math.PI * (3 - Math.sqrt(5));
  const inside = (x, y) => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    switch (shape) {
      case 'ring': return r <= 1 && r >= 0.75;
      case 'square': return Math.abs(x) <= 0.72 && Math.abs(y) <= 0.72;
      case 'triangle': return y >= -0.5 && y <= 1 - 1.732 * Math.abs(x) - 0.0 && y <= 1;
      case 'star': { const k = 0.55 + 0.45 * Math.cos(5 * a); return r <= k; }
      case 'hexagon': { const t = Math.PI / 3, aa = ((a % t) + t) % t - t / 2; return r * Math.cos(aa) <= 0.87; }
      case 'heart': { const X = x * 1.2, Y = -y * 1.2 + 0.25; return (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y <= 0; }
      default: return r <= 1;
    }
  };
  for (let i = 0; i < n * 4 && pts.length < n; i++) {
    const r = Math.sqrt((i + 0.5) / (n * 4)), a = i * GA, x = r * Math.cos(a), y = r * Math.sin(a);
    if (inside(x, y)) pts.push([x, y]);
  }
  return pts.length ? pts : [[0, 0]];
}

function kernelAverage(rgba, w, h, pts, R, boost) {
  const P = toPremul(rgba), n = w * h, F = new Float32Array(rgba.length);
  let W = null;
  if (boost) {                                           
    W = new Float32Array(n);
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const L = P[o + 3] > 0 ? lum(P[o], P[o + 1], P[o + 2]) * 255 / P[o + 3] : 0;
      const wt = L > boost.thr ? 1 + boost.gain * (L - boost.thr) / (256 - boost.thr) : 1;
      W[i] = wt; P[o] *= wt; P[o + 1] *= wt; P[o + 2] *= wt; P[o + 3] *= wt;
    }
  }
  const seen = new Set(), offs = [];
  for (const [x, y] of pts) { const k = Math.round(x * R) + ',' + Math.round(y * R); if (!seen.has(k)) { seen.add(k); offs.push([Math.round(x * R), Math.round(y * R)]); } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, ws = 0;
    for (let k = 0; k < offs.length; k++) {
      const i = cx(y + offs[k][1], h) * w + cx(x + offs[k][0], w), o = i * 4;
      r += P[o]; g += P[o + 1]; b += P[o + 2]; a += P[o + 3]; ws += W ? W[i] : 1;
    }
    const o = (y * w + x) * 4;
    F[o] = r / ws; F[o + 1] = g / ws; F[o + 2] = b / ws; F[o + 3] = a / ws;
  }
  return fromPremul(F, new Uint8ClampedArray(rgba.length));
}


function lensBlur(rgba, w, h, p) {
  const R = clamp(+p.radius || 15, 0, 100);
  if (R < 0.5) return copyOf(rgba);
  let out = kernelAverage(rgba, w, h, shapeSamples(p.iris || 'hexagon', 112), R,
    (+p.brightness || 0) > 0 ? { thr: clamp(p.threshold == null ? 255 : +p.threshold, 0, 255), gain: +p.brightness / 10 } : null);
  const nz = clamp(+p.noise || 0, 0, 100);
  if (nz > 0) { const rand = rng(11); for (let o = 0; o < out.length; o += 4) { const d = (rand() - 0.5) * nz * 1.2; for (let c = 0; c < 3; c++) out[o + c] = clamp255(out[o + c] + d); } }
  return out;
}


function shapeBlur(rgba, w, h, p) {
  const R = clamp(+p.radius || 10, 4, 1000);
  return kernelAverage(rgba, w, h, shapeSamples(p.shape || 'disc', 128), R, null);
}



function mixByMask(sharp, blurred, w, h, m) {
  const out = new Uint8ClampedArray(sharp.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = m(x + 0.5, y + 0.5), o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = Math.round(sharp[o + c] + (blurred[o + c] - sharp[o + c]) * t);
  }
  return out;
}
function fieldBlur(rgba, w, h, p) { return gauss(rgba, w, h, clamp(+p.blur || 15, 0, 500)); }
function irisBlur(rgba, w, h, p) {
  const B = gauss(rgba, w, h, clamp(+p.blur || 15, 0, 500));
  const cX = clamp(p.centerX == null ? 50 : +p.centerX, 0, 100) / 100 * w, cY = clamp(p.centerY == null ? 50 : +p.centerY, 0, 100) / 100 * h;
  const rx = Math.max(1, clamp(+p.radiusX || 30, 1, 200) / 100 * w), ry = Math.max(1, clamp(+p.radiusY || 30, 1, 200) / 100 * h);
  const f = clamp(p.feather == null ? 60 : +p.feather, 0, 100) / 100;
  return mixByMask(rgba, B, w, h, (x, y) => { const d = Math.hypot((x - cX) / rx, (y - cY) / ry); return smooth((d - (1 - f)) / Math.max(f, 1e-3)); });
}
function tiltShift(rgba, w, h, p) {
  const B = gauss(rgba, w, h, clamp(+p.blur || 15, 0, 500));
  const cY = clamp(p.centerY == null ? 50 : +p.centerY, 0, 100) / 100 * h, cX = w / 2;
  const a = (+p.angle || 0) * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a);
  const focus = clamp(p.focus == null ? 10 : +p.focus, 0, 100) / 100 * h, tr = Math.max(1, clamp(p.transition == null ? 20 : +p.transition, 0, 100) / 100 * h);
  return mixByMask(rgba, B, w, h, (x, y) => smooth((Math.abs((x - cX) * nx + (y - cY) * ny) - focus) / tr));
}
function spinBlur(rgba, w, h, p) {
  const ang = clamp(p.angle == null ? 15 : +p.angle, 0, 360) * Math.PI / 180;
  const cX = clamp(p.centerX == null ? 50 : +p.centerX, 0, 100) / 100 * w, cY = clamp(p.centerY == null ? 50 : +p.centerY, 0, 100) / 100 * h;
  const R = Math.max(1, clamp(+p.radius || 40, 1, 200) / 100 * Math.min(w, h));
  const P = toPremul(rgba), F = new Float32Array(rgba.length), s = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cX, dy = y + 0.5 - cY, r = Math.hypot(dx, dy), o = (y * w + x) * 4;
    const m = 1 - smooth((r / R - 0.85) / 0.15);
    const span = ang * m, steps = Math.max(1, Math.min(96, Math.ceil(span * r / 1.5)));
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = 0; k < steps; k++) {
      const t = steps === 1 ? 0 : (k / (steps - 1) - 0.5) * span, co = Math.cos(t), si = Math.sin(t);
      sampleBilinear(P, w, h, cX + dx * co - dy * si - 0.5, cY + dx * si + dy * co - 0.5, 'repeat', s);
      a0 += s[0]; a1 += s[1]; a2 += s[2]; a3 += s[3];
    }
    F[o] = a0 / steps; F[o + 1] = a1 / steps; F[o + 2] = a2 / steps; F[o + 3] = a3 / steps;
  }
  return fromPremul(F, new Uint8ClampedArray(rgba.length));
}



function motionPlanes(src, w, h, ch, len, ang) {
  if (len < 1) return Float32Array.from(src);
  const dx = Math.cos(ang), dy = -Math.sin(ang), steps = Math.max(1, Math.round(len)), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = (y * w + x) * ch;
    for (let s = 0; s < steps; s++) {
      const t = steps === 1 ? 0 : (s / (steps - 1) - 0.5) * len;
      const o = (cx(Math.round(y + dy * t), h) * w + cx(Math.round(x + dx * t), w)) * ch;
      for (let c = 0; c < ch; c++) out[d + c] += src[o + c];
    }
    for (let c = 0; c < ch; c++) out[d + c] /= steps;
  }
  return out;
}


function smartSharpen(rgba, w, h, p) {
  const amount = clamp(p.amount == null ? 200 : +p.amount, 0, 500) / 100, r = clamp(+p.radius || 1, 0.1, 64);
  const nr = clamp(+p.reduceNoise || 10, 0, 100);
  const base = nr > 0 ? surfaceBlur(rgba, w, h, { radius: 1, threshold: 2 + nr * 0.4 }) : rgba;
  let blur;
  const rem = p.remove || 'gaussian';
  if (rem === 'lens') blur = kernelAverage(base, w, h, shapeSamples('disc', 48), r, null);
  else if (rem === 'motion') blur = fromPremul(motionPlanes(toPremul(base), w, h, 4, r * 2, (+p.angle || 0) * Math.PI / 180), new Uint8ClampedArray(rgba.length));
  else blur = gauss(base, w, h, r);
  const out = copyOf(rgba);
  for (let o = 0; o < out.length; o += 4) for (let c = 0; c < 3; c++) out[o + c] = clamp255(Math.round(base[o + c] + amount * (base[o + c] - blur[o + c])));
  return out;
}

function sharpenEdges(rgba, w, h) {
  const B = gauss(rgba, w, h, 0.6), L = lumaPlane(rgba, w, h), out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = Math.hypot(L[y * w + cx(x + 1, w)] - L[y * w + cx(x - 1, w)], L[cx(y + 1, h) * w + x] - L[cx(y - 1, h) * w + x]);
    const k = smooth((g - 8) / 24), o = (y * w + x) * 4;
    if (k <= 0) continue;
    for (let c = 0; c < 3; c++) out[o + c] = clamp255(Math.round(rgba[o + c] + k * 1.2 * (rgba[o + c] - B[o + c])));
  }
  return out;
}

function shakeReduction(rgba, w, h, p) {
  const len = clamp(+p.length || 10, 1, 199), ang = (+p.angle || 0) * Math.PI / 180;
  const iters = Math.round(clamp(p.iterations == null ? 10 : +p.iterations, 1, 40));
  const sm = clamp(+p.smoothing || 20, 0, 100);
  const n = w * h, obs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { obs[i * 3] = rgba[i * 4] + 1; obs[i * 3 + 1] = rgba[i * 4 + 1] + 1; obs[i * 3 + 2] = rgba[i * 4 + 2] + 1; }
  let est = Float32Array.from(obs);
  for (let it = 0; it < iters; it++) {
    const conv = motionPlanes(est, w, h, 3, len, ang);
    for (let i = 0; i < conv.length; i++) conv[i] = obs[i] / Math.max(conv[i], 1e-3);
    const corr = motionPlanes(conv, w, h, 3, len, ang + Math.PI);
    for (let i = 0; i < est.length; i++) est[i] = Math.min(600, est[i] * corr[i]);
    if (sm > 0) { const b = blurPlanes(est, w, h, 3, 0.6); const k = sm / 300; for (let i = 0; i < est.length; i++) est[i] += (b[i] - est[i]) * k; }
  }
  const out = copyOf(rgba);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[i * 4 + c] = clamp255(Math.round(est[i * 3 + c] - 1));
  return out;
}




function facet(rgba, w, h) {
  const out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 0, bd = Infinity;
    const idx = [];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) idx.push((cx(y + j, h) * w + cx(x + i, w)) * 4);
    for (const a of idx) { let d = 0; for (const b of idx) d += Math.abs(rgba[a] - rgba[b]) + Math.abs(rgba[a + 1] - rgba[b + 1]) + Math.abs(rgba[a + 2] - rgba[b + 2]); if (d < bd) { bd = d; best = a; } }
    const o = (y * w + x) * 4; for (let c = 0; c < 4; c++) out[o + c] = rgba[best + c];
  }
  return out;
}

function colorHalftone(rgba, w, h, p) {
  const R = clamp(+p.maxRadius || 8, 4, 127), cell = R * 2;
  const angs = [p.angle1 ?? 108, p.angle2 ?? 162, p.angle3 ?? 90].map(a => a * Math.PI / 180);
  const out = copyOf(rgba);
  for (let c = 0; c < 3; c++) {
    const co = Math.cos(angs[c]), si = Math.sin(angs[c]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x * co + y * si) / cell, v = (-x * si + y * co) / cell;
      let cov = 0;
      const fu = Math.floor(u), fv = Math.floor(v);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cu = fu + di + 0.5, cv = fv + dj + 0.5;
        const X = (cu * co - cv * si) * cell, Y = (cu * si + cv * co) * cell;
        const sv = rgba[(cx(Math.floor(Y), h) * w + cx(Math.floor(X), w)) * 4 + c];
        const rad = R * Math.sqrt(sv / 255) * 1.15, d = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
        cov = Math.max(cov, clamp(rad - d + 0.5, 0, 1));
      }
      out[(y * w + x) * 4 + c] = Math.round(cov * 255);
    }
  }
  return out;
}

function seeds(w, h, size, seed) {
  const gw = Math.ceil(w / size) + 1, gh = Math.ceil(h / size) + 1, S = new Float32Array(gw * gh * 2);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    S[(j * gw + i) * 2] = (i + hash2(i, j, seed)) * size; S[(j * gw + i) * 2 + 1] = (j + hash2(i, j, seed + 17)) * size;
  }
  return { S, gw, gh };
}
function nearestSeed(sd, size, x, y) {
  const gi = Math.floor(x / size), gj = Math.floor(y / size); let best = -1, bd = Infinity;
  for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
    if (i < 0 || j < 0 || i >= sd.gw || j >= sd.gh) continue;
    const k = j * sd.gw + i, d = (sd.S[k * 2] - x) ** 2 + (sd.S[k * 2 + 1] - y) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function crystallize(rgba, w, h, p) {
  const size = clamp(+p.cell || 10, 3, 300), sd = seeds(w, h, size, p.seed == null ? 1 : p.seed | 0);
  const K = sd.gw * sd.gh, acc = new Float64Array(K * 5), lab = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = nearestSeed(sd, size, x + 0.5, y + 0.5), o = (y * w + x) * 4, a = rgba[o + 3] / 255;
    lab[y * w + x] = k; acc[k * 5] += rgba[o] * a; acc[k * 5 + 1] += rgba[o + 1] * a; acc[k * 5 + 2] += rgba[o + 2] * a; acc[k * 5 + 3] += a; acc[k * 5 + 4]++;
  }
  const out = copyOf(rgba);
  for (let i = 0; i < w * h; i++) {
    const k = lab[i], o = i * 4, a = acc[k * 5 + 3];
    if (a > 0) { out[o] = acc[k * 5] / a; out[o + 1] = acc[k * 5 + 1] / a; out[o + 2] = acc[k * 5 + 2] / a; }
    out[o + 3] = Math.round(a / acc[k * 5 + 4] * 255);
  }
  return out;
}

function pointillize(rgba, w, h, p) {
  const size = clamp(+p.cell || 5, 3, 300), seed = p.seed == null ? 2 : p.seed | 0, sd = seeds(w, h, size, seed);
  const bg = p._bg || [255, 255, 255], out = new Uint8ClampedArray(rgba.length);
  for (let o = 0; o < out.length; o += 4) { out[o] = bg[0]; out[o + 1] = bg[1]; out[o + 2] = bg[2]; out[o + 3] = rgba[o + 3]; }
  const rad = size * 0.62;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gi = Math.floor(x / size), gj = Math.floor(y / size), o = (y * w + x) * 4;
    for (let j = gj - 1; j <= gj + 1; j++) for (let i = gi - 1; i <= gi + 1; i++) {
      if (i < 0 || j < 0 || i >= sd.gw || j >= sd.gh) continue;
      const k = j * sd.gw + i, X = sd.S[k * 2], Y = sd.S[k * 2 + 1], d = Math.hypot(x + 0.5 - X, y + 0.5 - Y);
      const rr = rad * (0.8 + 0.4 * hash2(i, j, seed + 5));
      if (d > rr) continue;
      const s = (cx(Math.floor(Y), h) * w + cx(Math.floor(X), w)) * 4, jit = (hash2(i, j, seed + 9) - 0.5) * 40;
      out[o] = clamp255(rgba[s] + jit); out[o + 1] = clamp255(rgba[s + 1] + jit); out[o + 2] = clamp255(rgba[s + 2] + jit);
    }
  }
  return out;
}

function fragment(rgba, w, h) {
  const P = toPremul(rgba), F = new Float32Array(rgba.length), D = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (const [dx, dy] of D) { const s = (cx(y + dy, h) * w + cx(x + dx, w)) * 4; for (let c = 0; c < 4; c++) F[o + c] += P[s + c] / 4; }
  }
  return fromPremul(F, new Uint8ClampedArray(rgba.length));
}

function mezzotint(rgba, w, h, p) {
  const type = p.type || 'fineDots', seed = p.seed == null ? 4 : p.seed | 0;
  const dot = { fineDots: 1, mediumDots: 2, grainyDots: 1, coarseDots: 3 }[type];
  const line = { shortLines: 4, mediumLines: 10, longLines: 24, shortStrokes: 3, mediumStrokes: 7, longStrokes: 14 }[type];
  const out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let t;
      if (line) { const diag = type.endsWith('Strokes') ? x - y : x; t = hash2(Math.floor(diag / line) + c * 7919, y, seed); }
      else t = type === 'grainyDots' ? hash2(x, y, seed + c) * 0.7 + 0.15 : hash2(Math.floor(x / dot) + c * 104729, Math.floor(y / dot), seed);
      out[o + c] = rgba[o + c] > t * 255 ? 255 : 0;
    }
  }
  return out;
}



function fbm(w, h, seed, octaves, sx = 1, sy = 1) {
  const f = new Float32Array(w * h); let amp = 1, tot = 0;
  for (let oc = 0; oc < octaves; oc++) {
    const cells = 1 << (oc + 1), cX = Math.max(1, Math.round(cells * sx)), cY = Math.max(1, Math.round(cells * sy));
    for (let y = 0; y < h; y++) {
      const fy = y / h * cY, y0 = Math.floor(fy), ty = smooth(fy - y0);
      for (let x = 0; x < w; x++) {
        const fx = x / w * cX, x0 = Math.floor(fx), tx = smooth(fx - x0);
        const a = hash2(x0, y0, seed + oc * 131), b = hash2(x0 + 1, y0, seed + oc * 131);
        const c = hash2(x0, y0 + 1, seed + oc * 131), d = hash2(x0 + 1, y0 + 1, seed + oc * 131);
        f[y * w + x] += ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * amp;
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < f.length; i++) f[i] /= tot;
  return f;
}

function differenceClouds(rgba, w, h, p) {
  const fg = p._fg || [0, 0, 0], bg = p._bg || [255, 255, 255], f = fbm(w, h, p.seed == null ? 1 : p.seed | 0, 7), out = copyOf(rgba);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) for (let c = 0; c < 3; c++) out[o + c] = Math.abs(rgba[o + c] - (fg[c] + (bg[c] - fg[c]) * f[i]));
  return out;
}

function fibers(rgba, w, h, p) {
  const variance = clamp(+p.variance || 16, 1, 64), strength = clamp(+p.strength || 4, 1, 64);
  const fg = p._fg || [0, 0, 0], bg = p._bg || [255, 255, 255];
  const f = fbm(w, h, p.seed == null ? 1 : p.seed | 0, 6, Math.max(1, w / 8 / Math.sqrt(variance)), 1 / strength);
  const out = copyOf(rgba), k = 0.5 + variance / 40;
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const t = clamp(0.5 + (f[i] - 0.5) * k * 2, 0, 1);
    for (let c = 0; c < 3; c++) out[o + c] = fg[c] + (bg[c] - fg[c]) * t;
    out[o + 3] = 255;
  }
  return out;
}

function lensFlare(rgba, w, h, p) {
  const br = clamp(+p.brightness || 100, 10, 300) / 100;
  const X = clamp(p.centerX == null ? 30 : +p.centerX, 0, 100) / 100 * w, Y = clamp(p.centerY == null ? 30 : +p.centerY, 0, 100) / 100 * h;
  const lens = p.lens || 'zoom', S = Math.hypot(w, h);
  const ghosts = { zoom: [[0.35, 0.03, [120, 170, 255]], [0.6, 0.05, [255, 180, 110]], [0.9, 0.02, [150, 255, 170]], [1.3, 0.08, [110, 150, 255]]],
    prime35: [[0.5, 0.04, [255, 200, 120]], [1.1, 0.06, [140, 170, 255]]],
    prime105: [[0.7, 0.03, [255, 220, 170]]], movie: [[0.4, 0.02, [120, 190, 255]], [0.8, 0.02, [120, 190, 255]], [1.2, 0.03, [120, 190, 255]]] }[lens] || [];
  const vx = w / 2 - X, vy = h / 2 - Y, out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - X, dy = y - Y, d = Math.hypot(dx, dy) / S;
    let r = 0, g = 0, b = 0;
    const glow = Math.exp(-d * d / 0.0015) * 255 + Math.exp(-d / 0.08) * 90;
    r += glow; g += glow * 0.95; b += glow * 0.85;
    if (lens === 'movie') { const st = Math.exp(-Math.abs(dy) / S / 0.002) * Math.exp(-Math.abs(dx) / S / 0.35) * 200; r += st * 0.6; g += st * 0.8; b += st; }
    else { const a = Math.atan2(dy, dx), ray = Math.pow(Math.abs(Math.cos(a * 6)), 40) * Math.exp(-d / 0.12) * 120; r += ray; g += ray; b += ray; }
    const ring = Math.exp(-((d - 0.09) ** 2) / 0.00004) * 60; r += ring * 0.8; g += ring * 0.6; b += ring;
    for (const [t, rad, col] of ghosts) {
      const gd = Math.hypot(x - (X + vx * t * 2), y - (Y + vy * t * 2)) / S, v = smooth(1 - gd / rad) * 0.5;
      r += col[0] * v; g += col[1] * v; b += col[2] * v;
    }
    const o = (y * w + x) * 4, add = [r * br, g * br, b * br];
    for (let c = 0; c < 3; c++) out[o + c] = 255 - (255 - out[o + c]) * (255 - clamp255(add[c])) / 255;
  }
  return out;
}

function lighting(rgba, w, h, p) {
  const type = p.type || 'spot', inten = clamp(p.intensity == null ? 35 : +p.intensity, -100, 100) / 35;
  const amb = clamp(p.ambience == null ? 8 : +p.ambience, -100, 100) / 100, gloss = clamp(p.gloss == null ? 0 : +p.gloss, -100, 100) / 100;
  const X = clamp(p.centerX == null ? 50 : +p.centerX, 0, 100) / 100 * w, Y = clamp(p.centerY == null ? 50 : +p.centerY, 0, 100) / 100 * h;
  const R = Math.max(1, clamp(+p.radius || 50, 1, 200) / 100 * Math.min(w, h));
  const ang = (p.angle == null ? -45 : +p.angle) * Math.PI / 180, col = p._fg && p.useFg ? p._fg : [255, 255, 255];
  const height = clamp(p.bump == null ? 0 : +p.bump, 0, 100) / 100;
  const H = height > 0 ? blurPlanes(lumaPlane(rgba, w, h), w, h, 1, 1) : null;
  const out = copyOf(rgba), L = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let nx = 0, ny = 0, nz = 1;
    if (H) { nx = -(H[y * w + cx(x + 1, w)] - H[y * w + cx(x - 1, w)]) * height * 0.05; ny = -(H[cx(y + 1, h) * w + x] - H[cx(y - 1, h) * w + x]) * height * 0.05; const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n; }
    let atten = 1;
    if (type === 'infinite') { L[0] = Math.cos(ang); L[1] = -Math.sin(ang); L[2] = 0.7; }
    else {
      const dx = X - x, dy = Y - y, zz = R * 0.6; L[0] = dx; L[1] = dy; L[2] = zz;
      const d = Math.hypot(dx, dy);
      if (type === 'spot') {
        const ex = x - X, ey = y - Y, ca = Math.cos(ang), sa = -Math.sin(ang);
        const along = ex * ca + ey * sa, perp = -ex * sa + ey * ca;
        const u = (along - R * 0.35) / (R * 0.75), v = perp / (R * 0.45);
        atten = 1 - smooth((Math.hypot(u, v) - 0.55) / 0.45);
      } else atten = 1 - smooth((d / R - 0.5) / 0.5);
    }
    const ln = Math.hypot(L[0], L[1], L[2]); L[0] /= ln; L[1] /= ln; L[2] /= ln;
    const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const hz = L[2] + 1, hn = Math.hypot(L[0], L[1], hz), spec = Math.pow(Math.max(0, (nx * L[0] + ny * L[1] + nz * hz) / hn), 8 + (gloss + 1) * 40) * (gloss + 1) * 0.5;
    const k = amb + 0.5 + diff * inten * atten, o = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = clamp255(rgba[o + c] * k * col[c] / 255 + spec * atten * 255 * Math.max(0, inten));
  }
  return out;
}




function medianHuang(rgba, w, h, r, c) {
  const out = new Uint8ClampedArray(w * h), hist = new Int32Array(256), half = ((2 * r + 1) ** 2 + 1) >> 1;
  for (let y = 0; y < h; y++) {
    hist.fill(0);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) hist[rgba[(cx(y + j, h) * w + cx(i, w)) * 4 + c]]++;
    for (let x = 0; x < w; x++) {
      if (x > 0) for (let j = -r; j <= r; j++) { const row = cx(y + j, h) * w; hist[rgba[(row + cx(x - r - 1, w)) * 4 + c]]--; hist[rgba[(row + cx(x + r, w)) * 4 + c]]++; }
      let s = 0, m = 0; while (m < 255 && (s += hist[m]) < half) m++;
      out[y * w + x] = m;
    }
  }
  return out;
}

function dustScratches(rgba, w, h, p) {
  const r = Math.round(clamp(+p.radius || 1, 1, 100)), thr = clamp(+p.threshold || 0, 0, 255), out = copyOf(rgba);
  for (let c = 0; c < 3; c++) {
    const m = medianHuang(rgba, w, h, r, c);
    for (let i = 0; i < w * h; i++) if (Math.abs(rgba[i * 4 + c] - m[i]) > thr) out[i * 4 + c] = m[i];
  }
  return out;
}

function reduceNoise(rgba, w, h, p) {
  const st = clamp(p.strength == null ? 6 : +p.strength, 0, 10), keep = clamp(p.preserveDetails == null ? 60 : +p.preserveDetails, 0, 100) / 100;
  const cn = clamp(p.colorNoise == null ? 45 : +p.colorNoise, 0, 100) / 100, sh = clamp(p.sharpen == null ? 25 : +p.sharpen, 0, 100) / 100;
  const n = w * h, Y = new Float32Array(n), CC = new Float32Array(n * 2);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; CC[i * 2] = -0.168736 * r - 0.331264 * g + 0.5 * b; CC[i * 2 + 1] = 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  let Yd = Y;
  if (st > 0) {
    const thr = 2 + st * 3 * (1.2 - keep), rad = 1 + Math.round(st / 3), inv = 1 / (2.5 * thr);
    Yd = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v0 = Y[y * w + x]; let s = 0, ws = 0;
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { const v = Y[cx(y + j, h) * w + cx(x + i, w)], wt = 1 - Math.abs(v - v0) * inv; if (wt > 0) { s += v * wt; ws += wt; } }
      Yd[y * w + x] = s / ws;
    }
  }
  const Cd = cn > 0 ? blurPlanes(CC, w, h, 2, cn * 6) : CC;
  if (sh > 0) { const b = blurPlanes(Yd, w, h, 1, 1.5), t = new Float32Array(n); for (let i = 0; i < n; i++) t[i] = Yd[i] + sh * 1.5 * (Yd[i] - b[i]); Yd = t; }
  const out = copyOf(rgba);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const yy = Yd[i], cb = Cd[i * 2], cr = Cd[i * 2 + 1];
    out[o] = clamp255(Math.round(yy + 1.402 * cr)); out[o + 1] = clamp255(Math.round(yy - 0.344136 * cb - 0.714136 * cr)); out[o + 2] = clamp255(Math.round(yy + 1.772 * cb));
  }
  return out;
}




function ntscColors(rgba) {
  const out = copyOf(rgba);
  for (let o = 0; o < out.length; o += 4) {
    const r = rgba[o] / 255, g = rgba[o + 1] / 255, b = rgba[o + 2] / 255;
    const Y = 0.299 * r + 0.587 * g + 0.114 * b; let I = 0.596 * r - 0.274 * g - 0.322 * b, Q = 0.211 * r - 0.523 * g + 0.312 * b;
    const C = Math.hypot(I, Q), maxC = Math.max(0, Math.min(1.1 - Y, Y + 0.15));
    if (C > maxC && C > 0) { const k = maxC / C; I *= k; Q *= k; }
    out[o] = clamp255(Math.round((Y + 0.956 * I + 0.621 * Q) * 255));
    out[o + 1] = clamp255(Math.round((Y - 0.272 * I - 0.647 * Q) * 255));
    out[o + 2] = clamp255(Math.round((Y - 1.106 * I + 1.703 * Q) * 255));
  }
  return out;
}

function deinterlace(rgba, w, h, p) {
  const drop = p.eliminate === 'even' ? 0 : 1, interp = (p.create || 'interpolation') === 'interpolation', out = copyOf(rgba);
  for (let y = drop; y < h; y += 2) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, a = ((y - 1 >= 0 ? y - 1 : y + 1) * w + x) * 4, b = ((y + 1 < h ? y + 1 : y - 1) * w + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = interp ? (rgba[a + c] + rgba[b + c]) / 2 : rgba[a + c];
  }
  return out;
}



function heightField(rgba, w, h, p) {
  const H = blurPlanes(lumaPlane(rgba, w, h), w, h, 1, clamp(p.blur == null ? 1 : +p.blur, 0, 50));
  const ct = clamp(p.contrast == null ? 0 : +p.contrast, -100, 100) / 100;
  for (let i = 0; i < H.length; i++) { let v = (H[i] - 128) * (1 + ct) + 128; if (p.invert) v = 255 - v; H[i] = clamp(v, 0, 255); }
  return H;
}

function bumpMap(rgba, w, h, p) {
  const H = heightField(rgba, w, h, p), out = copyOf(rgba);
  for (let i = 0; i < H.length; i++) { const v = Math.round(H[i]); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; }
  return out;
}

function normalMap(rgba, w, h, p) {
  const H = heightField(rgba, w, h, p), s = clamp(p.strength == null ? 2 : +p.strength, 0.1, 20) / 255 * 8, out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (H[y * w + cx(x + 1, w)] - H[y * w + cx(x - 1, w)]) * s, gy = (H[cx(y + 1, h) * w + x] - H[cx(y - 1, h) * w + x]) * s;
    const n = Math.hypot(gx, gy, 1), o = (y * w + x) * 4;
    out[o] = Math.round((-gx / n * 0.5 + 0.5) * 255); out[o + 1] = Math.round((gy / n * 0.5 + 0.5) * 255); out[o + 2] = Math.round((1 / n * 0.5 + 0.5) * 255); out[o + 3] = 255;
  }
  return out;
}




function hsbHsl(rgba, w, h, p) {
  const hsl = p.mode === 'hsl', out = copyOf(rgba);
  for (let o = 0; o < out.length; o += 4) {
    const r = rgba[o] / 255, g = rgba[o + 1] / 255, b = rgba[o + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let H = 0;
    if (d) H = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    let S, V;
    if (hsl) { V = (mx + mn) / 2; S = d === 0 ? 0 : d / (1 - Math.abs(2 * V - 1)); } else { V = mx; S = mx ? d / mx : 0; }
    out[o] = Math.round(H / 6 * 255); out[o + 1] = Math.round(clamp(S, 0, 1) * 255); out[o + 2] = Math.round(V * 255);
  }
  return out;
}

function customKernel(rgba, w, h, p) {
  const m = Array.isArray(p.matrix) && p.matrix.length === 25 ? p.matrix.map(v => +v || 0) : [0,0,0,0,0, 0,0,0,0,0, 0,0,1,0,0, 0,0,0,0,0, 0,0,0,0,0];
  let scale = +p.scale || 0; if (!scale) scale = m.reduce((a, b) => a + b, 0) || 1;
  const off = +p.offset || 0, out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const k = m[(j + 2) * 5 + i + 2]; if (!k) continue;
      const o = (cx(y + j, h) * w + cx(x + i, w)) * 4; r += rgba[o] * k; g += rgba[o + 1] * k; b += rgba[o + 2] * k;
    }
    const o = (y * w + x) * 4;
    out[o] = clamp255(Math.round(r / scale + off)); out[o + 1] = clamp255(Math.round(g / scale + off)); out[o + 2] = clamp255(Math.round(b / scale + off));
  }
  return out;
}





function cameraRaw(rgba, w, h, p) {
  const n = w * h, P = k => +p[k] || 0;
  const exp = Math.pow(2, P('exposure')), con = P('contrast') / 100, hi = P('highlights') / 100, sh = P('shadows') / 100;
  const wh = P('whites') / 100, bl = P('blacks') / 100, temp = P('temperature') / 100, tint = P('tint') / 100;
  const tex = P('texture') / 100, cla = P('clarity') / 100, dh = P('dehaze') / 100, vib = P('vibrance') / 100, sat = P('saturation') / 100;
  const toLin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), toS = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  const wb = [1 + temp * 0.25 + tint * 0.1, 1 - tint * 0.2, 1 - temp * 0.25 + tint * 0.1];
  const F = new Float32Array(n * 3);
  for (let i = 0, o = 0; i < n; i++, o += 4) for (let c = 0; c < 3; c++) F[i * 3 + c] = clamp(toS(clamp(toLin(rgba[o + c] / 255) * exp * wb[c], 0, 4)), 0, 1.5);
  const Lp = new Float32Array(n); for (let i = 0; i < n; i++) Lp[i] = lum(F[i * 3], F[i * 3 + 1], F[i * 3 + 2]);
  const needBig = cla || dh, needSmall = tex;
  const Lb = needBig ? blurPlanes(Lp, w, h, 1, Math.max(3, Math.min(w, h) / 40)) : null;
  const Ls = needSmall ? blurPlanes(Lp, w, h, 1, 2) : null;
  const out = copyOf(rgba);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const L0 = Lp[i]; let L = L0;
    const wH = smooth((L - 0.35) / 0.65), wS = smooth((0.65 - L) / 0.65);
    L += hi * 0.3 * wH * (hi > 0 ? 1.2 - L : L);
    L += sh * 0.35 * wS * (sh > 0 ? 1 - L : L);
    L += wh * 0.25 * smooth((L - 0.7) / 0.3);
    L += bl * 0.25 * smooth((0.3 - L) / 0.3);
    L = 0.5 + (L - 0.5) * (1 + con * 0.8);
    if (Lb) { L += cla * (L0 - Lb[i]) * 1.2; if (dh) L = (L - dh * 0.25 * Lb[i]) / Math.max(0.2, 1 - dh * 0.25); }
    if (Ls) L += tex * (L0 - Ls[i]) * 1.5;
    const k = L0 > 1e-4 ? L / L0 : 1;
    let r = F[i * 3] * k, g = F[i * 3 + 1] * k, b = F[i * 3 + 2] * k;
    const m = (r + g + b) / 3, s0 = Math.max(r, g, b) - Math.min(r, g, b);
    const sK = 1 + sat + vib * (1 - clamp(s0 * 1.5, 0, 1)) + (dh > 0 ? dh * 0.3 : 0);
    r = m + (r - m) * sK; g = m + (g - m) * sK; b = m + (b - m) * sK;
    out[o] = clamp255(Math.round(r * 255)); out[o + 1] = clamp255(Math.round(g * 255)); out[o + 2] = clamp255(Math.round(b * 255));
  }
  return out;
}





function lensCorrection(rgba, w, h, p) {
  const k = -clamp(+p.distortion || 0, -100, 100) / 100 * 0.35;
  const vp = clamp(+p.vertical || 0, -100, 100) / 100 * 0.5, hp = clamp(+p.horizontal || 0, -100, 100) / 100 * 0.5;
  const ang = -(+p.angle || 0) * Math.PI / 180, sc = clamp(+p.scale || 100, 50, 150) / 100;
  const caR = clamp(+p.caRed || 0, -100, 100) / 100 * 0.01, caB = clamp(+p.caBlue || 0, -100, 100) / 100 * 0.01;
  const vig = clamp(+p.vignette || 0, -100, 100) / 100, mid = clamp(p.midpoint == null ? 50 : +p.midpoint, 0, 100) / 100;
  const cX = w / 2, cY = h / 2, N = Math.hypot(cX, cY), co = Math.cos(ang), si = Math.sin(ang);
  const P = toPremul(rgba), out = new Uint8ClampedArray(rgba.length), s = [0, 0, 0, 0], F = [0, 0, 0, 0];
  const edge = p.edge || 'clear';
  const mapPt = (x, y, ca) => {
    let u = (x - cX) / N, v = (y - cY) / N;
    u /= sc; v /= sc;
    const ru = u * co - v * si, rv = u * si + v * co; u = ru; v = rv;
    const den = 1 + vp * v + hp * u; u /= den; v /= den;
    const r2 = u * u + v * v, f = (1 + k * r2) * (1 + ca);
    return [cX + u * f * N, cY + v * f * N];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, X = x + 0.5, Y = y + 0.5;
    const [gx, gy] = mapPt(X, Y, 0);
    sampleBilinear(P, w, h, gx - 0.5, gy - 0.5, edge, F);
    if (caR || caB) {
      const [rx, ry] = mapPt(X, Y, caR); sampleBilinear(P, w, h, rx - 0.5, ry - 0.5, edge, s); F[0] = s[0];
      const [bx, by] = mapPt(X, Y, caB); sampleBilinear(P, w, h, bx - 0.5, by - 0.5, edge, s); F[2] = s[2];
    }
    let m = 1;
    if (vig) { const d = Math.hypot(X - cX, Y - cY) / N, t = smooth((d - mid * 0.7) / Math.max(0.05, 1 - mid * 0.7)); m = 1 + vig * t; }
    const a = F[3];
    out[o + 3] = clamp255(Math.round(a));
    if (a > 0.001) for (let c = 0; c < 3; c++) out[o + c] = clamp255(Math.round(F[c] * 255 / a * m));
  }
  return out;
}




function histo(rgba, c) {
  const H = new Float64Array(256);
  for (let o = 0; o < rgba.length; o += 4) if (rgba[o + 3]) { H[c < 0 ? Math.round(lum(rgba[o], rgba[o + 1], rgba[o + 2])) : rgba[o + c]] += rgba[o + 3] / 255; }
  return H;
}

function clipRange(H, clip) {
  let tot = 0; for (let i = 0; i < 256; i++) tot += H[i];
  if (!tot) return [0, 255];
  let lo = 0, hi = 255, s = 0;
  while (lo < 255 && (s += H[lo]) <= tot * clip) lo++;
  s = 0; while (hi > 0 && (s += H[hi]) <= tot * clip) hi--;
  return hi > lo ? [lo, hi] : [0, 255];
}
const stretchLUT = (lo, hi, gamma = 1) => { const L = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) L[v] = Math.round(255 * Math.pow(clamp((v - lo) / (hi - lo), 0, 1), gamma)); return L; };
function applyLUTs(rgba, luts) {
  const out = copyOf(rgba);
  for (let o = 0; o < out.length; o += 4) for (let c = 0; c < 3; c++) out[o + c] = luts[c][rgba[o + c]];
  return out;
}

function autoTone(rgba, w, h, p) {
  const clip = clamp(p.clip == null ? 0.1 : +p.clip, 0, 10) / 100;
  return applyLUTs(rgba, [0, 1, 2].map(c => { const [lo, hi] = clipRange(histo(rgba, c), clip); return stretchLUT(lo, hi); }));
}

function autoContrast(rgba, w, h, p) {
  const clip = clamp(p.clip == null ? 0.1 : +p.clip, 0, 10) / 100, H = new Float64Array(256);
  for (let c = 0; c < 3; c++) { const hc = histo(rgba, c); for (let i = 0; i < 256; i++) H[i] += hc[i]; }
  const [lo, hi] = clipRange(H, clip), L = stretchLUT(lo, hi);
  return applyLUTs(rgba, [L, L, L]);
}

function autoColor(rgba, w, h, p) {
  const s1 = autoTone(rgba, w, h, p), sum = [0, 0, 0]; let n = 0;
  for (let o = 0; o < s1.length; o += 4) { if (!s1[o + 3]) continue; const L = lum(s1[o], s1[o + 1], s1[o + 2]); if (L < 60 || L > 200) continue; sum[0] += s1[o]; sum[1] += s1[o + 1]; sum[2] += s1[o + 2]; n++; }
  if (!n) return s1;
  const m = sum.map(v => v / n), g = (m[0] + m[1] + m[2]) / 3;
  const luts = m.map(mc => { const gm = Math.log(clamp(g / 255, 0.01, 0.99)) / Math.log(clamp(mc / 255, 0.01, 0.99)); const L = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) L[v] = Math.round(255 * Math.pow(v / 255, clamp(gm, 0.5, 2))); return L; });
  return applyLUTs(s1, luts);
}


function shadowsHighlights(rgba, w, h, p) {
  const sa = clamp(p.shadowAmount == null ? 35 : +p.shadowAmount, 0, 100) / 100, st = clamp(p.shadowTone == null ? 50 : +p.shadowTone, 0, 100) / 100;
  const ha = clamp(+p.highlightAmount || 0, 0, 100) / 100, ht = clamp(p.highlightTone == null ? 50 : +p.highlightTone, 0, 100) / 100;
  const rad = clamp(p.radius == null ? 30 : +p.radius, 0, 2500), cc = clamp(p.colorCorrection == null ? 20 : +p.colorCorrection, -100, 100) / 100;
  const mc = clamp(+p.midtoneContrast || 0, -100, 100) / 100;
  const L = lumaPlane(rgba, w, h), Lb = blurPlanes(L, w, h, 1, rad), out = copyOf(rgba);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const l = L[i] / 255, b = Lb[i] / 255;
    const ms = st > 0 ? smooth((st * 0.75 - b) / Math.max(st * 0.75, 1e-3) + 0.0) : 0;
    const mh = ht > 0 ? smooth((b - (1 - ht * 0.75)) / Math.max(ht * 0.75, 1e-3)) : 0;
    let nl = l + sa * ms * (1 - l) * 0.9 - ha * mh * l * 0.9;
    if (mc) nl = nl + mc * (nl - 0.5) * (1 - Math.abs(nl - 0.5) * 2) * 1.2;
    nl = clamp(nl, 0, 1);
    const k = l > 1e-3 ? nl / l : 1, change = Math.abs(nl - l), satK = 1 + cc * change * 2;
    const r = rgba[o] * k, g = rgba[o + 1] * k, bb = rgba[o + 2] * k, m = (r + g + bb) / 3;
    out[o] = clamp255(Math.round(m + (r - m) * satK)); out[o + 1] = clamp255(Math.round(m + (g - m) * satK)); out[o + 2] = clamp255(Math.round(m + (bb - m) * satK));
  }
  return out;
}


function hdrToning(rgba, w, h, p) {
  const rad = clamp(p.radius == null ? 50 : +p.radius, 1, 500), strength = clamp(p.strength == null ? 0.5 : +p.strength, 0.1, 4);
  const gamma = clamp(p.gamma == null ? 1 : +p.gamma, 0.1, 2), expo = clamp(+p.exposure || 0, -5, 5), detail = clamp(p.detail == null ? 30 : +p.detail, -100, 300) / 100;
  const vib = clamp(+p.vibrance || 0, -100, 100) / 100, sat = clamp(p.saturation == null ? 20 : +p.saturation, -100, 100) / 100;
  const n = w * h, LL = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 4) LL[i] = Math.log(lum(rgba[o], rgba[o + 1], rgba[o + 2]) / 255 + 1e-3);
  const base = blurPlanes(LL, w, h, 1, rad);
  let mean = 0; for (let i = 0; i < n; i++) mean += base[i]; mean /= n;
  const comp = 1 / (1 + strength), out = copyOf(rgba);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const d = LL[i] - base[i], nl = Math.exp(mean + (base[i] - mean) * comp + d * (1 + detail) + expo * 0.693) - 1e-3;
    const l0 = Math.exp(LL[i]) - 1e-3, k = l0 > 1e-4 ? clamp(nl, 0, 1.5) / l0 : 1;
    let c = [rgba[o] / 255 * k, rgba[o + 1] / 255 * k, rgba[o + 2] / 255 * k].map(v => Math.pow(clamp(v, 0, 1), 1 / gamma));
    const m = (c[0] + c[1] + c[2]) / 3, s0 = Math.max(...c) - Math.min(...c), sk = 1 + sat + vib * (1 - clamp(s0 * 1.5, 0, 1));
    c = c.map(v => m + (v - m) * sk);
    for (let q = 0; q < 3; q++) out[o + q] = clamp255(Math.round(c[q] * 255));
  }
  return out;
}

function matchColor(rgba, w, h, p) {
  const lu = clamp(p.luminance == null ? 100 : +p.luminance, 1, 200) / 100, ci = clamp(p.intensity == null ? 100 : +p.intensity, 1, 200) / 100;
  const fade = clamp(+p.fade || 0, 0, 100) / 100, neu = p.neutralize !== false;
  const sum = [0, 0, 0]; let n = 0;
  for (let o = 0; o < rgba.length; o += 4) if (rgba[o + 3]) { sum[0] += rgba[o]; sum[1] += rgba[o + 1]; sum[2] += rgba[o + 2]; n++; }
  const m = n ? sum.map(v => v / n) : [128, 128, 128], g = (m[0] + m[1] + m[2]) / 3, gain = neu ? m.map(v => g / Math.max(v, 1)) : [1, 1, 1];
  const out = copyOf(rgba);
  for (let o = 0; o < out.length; o += 4) {
    const c = [rgba[o] * gain[0] * lu, rgba[o + 1] * gain[1] * lu, rgba[o + 2] * gain[2] * lu], mm = (c[0] + c[1] + c[2]) / 3;
    for (let q = 0; q < 3; q++) { const v = mm + (c[q] - mm) * ci; out[o + q] = clamp255(Math.round(v + (rgba[o + q] - v) * fade)); }
  }
  return out;
}
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
function hsl2rgb(hh, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function replaceColor(rgba, w, h, p) {
  const t = Array.isArray(p.color) ? p.color : [255, 0, 0], fz = clamp(p.fuzziness == null ? 40 : +p.fuzziness, 0, 200);
  const dh = clamp(+p.hue || 0, -180, 180), ds = clamp(+p.saturation || 0, -100, 100) / 100, dl = clamp(+p.lightness || 0, -100, 100) / 100;
  const out = copyOf(rgba), R = fz * 1.2 + 1;
  for (let o = 0; o < out.length; o += 4) {
    const d = Math.hypot(rgba[o] - t[0], rgba[o + 1] - t[1], rgba[o + 2] - t[2]), wgt = clamp(1 - d / R, 0, 1);
    if (!wgt) continue;
    let [hh, s, l] = rgb2hsl(rgba[o], rgba[o + 1], rgba[o + 2]);
    hh = ((hh + dh) % 360 + 360) % 360; s = clamp(ds > 0 ? s + (1 - s) * ds : s * (1 + ds), 0, 1); l = clamp(dl > 0 ? l + (1 - l) * dl : l * (1 + dl), 0, 1);
    const c = hsl2rgb(hh, s, l);
    for (let q = 0; q < 3; q++) out[o + q] = clamp255(Math.round(rgba[o + q] + (c[q] - rgba[o + q]) * wgt));
  }
  return out;
}



const N = (key, label, def, min, max, step, unit, spatial) =>
  ({ key, label, def, min, max, step, unit: unit || '', ...(spatial ? { spatial: true } : {}) });
const B = (key, label, def) => ({ key, label, def, type: 'bool' });
const E = (key, label, def, options) => ({ key, label, def, type: 'enum', options });
const M = (key, label, def) => ({ key, label, def, type: 'matrix', size: 5 });
const C = (key, label, def) => ({ key, label, def, type: 'color' });
const SEED = (def = 1) => N('seed', '随机种子', def, 0, 999999, 1);
const CENTER = (dx = 50, dy = 50) => [N('centerX', '中心 X', dx, 0, 100, 1, '%'), N('centerY', '中心 Y', dy, 0, 100, 1, '%')];


export const MORE_FILTERS = {
  
  wave: { label: '波浪', group: '扭曲', action: 'filter.distort.wave', apply: wave, params: [
    N('generators', '生成器数', 5, 1, 99, 1), N('wavelengthMin', '波长 最小', 10, 1, 998, 1, '', true), N('wavelengthMax', '波长 最大', 120, 2, 999, 1, '', true),
    N('amplitudeMin', '波幅 最小', 5, 0, 998, 1, '', true), N('amplitudeMax', '波幅 最大', 35, 1, 999, 1, '', true),
    N('scaleH', '比例 水平', 100, 0, 100, 1, '%'), N('scaleV', '比例 垂直', 100, 0, 100, 1, '%'),
    E('type', '类型', 'sine', [['sine', '正弦'], ['triangle', '三角形'], ['square', '方形']]), E('edge', '未定义区域', 'wrap', EDGE.slice(0, 2)), SEED(1)] },
  ripple: { label: '波纹', group: '扭曲', action: 'filter.distort.ripple', apply: ripple, params: [
    N('amount', '数量', 100, -999, 999, 1, '%'), E('size', '大小', 'medium', [['small', '小'], ['medium', '中'], ['large', '大']])] },
  polar: { label: '极坐标', group: '扭曲', action: 'filter.distort.polar', apply: polar, params: [
    E('mode', '方式', 'rectToPolar', [['rectToPolar', '平面坐标到极坐标'], ['polarToRect', '极坐标到平面坐标']])] },
  pinch: { label: '挤压', group: '扭曲', action: 'filter.distort.pinch', apply: pinch, params: [N('amount', '数量', 50, -100, 100, 1, '%')] },
  shear: { label: '切变', group: '扭曲', action: 'filter.distort.shear', apply: shear, params: [
    N('amount', '弯曲', 30, -100, 100, 1, '%'), E('shape', '曲线形状', 'bow', [['bow', '弓形'], ['s', 'S 形']]), E('edge', '未定义区域', 'wrap', EDGE.slice(0, 2))] },
  spherize: { label: '球面化', group: '扭曲', action: 'filter.distort.spherize', apply: spherize, params: [
    N('amount', '数量', 100, -100, 100, 1, '%'), E('mode', '模式', 'normal', [['normal', '正常'], ['horizontal', '水平优先'], ['vertical', '垂直优先']])] },
  zigzag: { label: '水波', group: '扭曲', action: 'filter.distort.zigzag', apply: zigzag, params: [
    N('amount', '数量', 10, -100, 100, 1), N('ridges', '起伏', 5, 1, 20, 1),
    E('style', '样式', 'pondRipples', [['aroundCenter', '围绕中心'], ['outFromCenter', '从中心向外'], ['pondRipples', '水池波纹']])] },
  displace: { label: '置换', group: '扭曲', action: 'filter.distort.displace', apply: displace, needsMap: true, params: [
    N('scaleH', '水平比例', 10, -999, 999, 1, '%', true), N('scaleV', '垂直比例', 10, -999, 999, 1, '%', true),
    E('mode', '置换图', 'stretch', [['stretch', '伸展以适合'], ['tile', '拼贴']]), E('edge', '未定义区域', 'repeat', EDGE.slice(0, 2))] },
  twirl: { label: '旋转扭曲', group: '扭曲', action: 'filter.distort.twirl', apply: twirl, params: [N('angle', '角度', 50, -999, 999, 1, '度')] },

  
  traceContour: { label: '等高线', group: '风格化', action: 'filter.stylize.traceContour', apply: traceContour, params: [
    N('level', '色阶', 128, 0, 255, 1), E('edge', '边缘', 'lower', [['lower', '较低'], ['upper', '较高']])] },
  wind: { label: '风', group: '风格化', action: 'filter.stylize.wind', apply: wind, params: [
    E('method', '方法', 'wind', [['wind', '风'], ['blast', '大风'], ['stagger', '飓风']]),
    E('direction', '方向', 'fromRight', [['fromRight', '从右'], ['fromLeft', '从左']]), SEED(7)] },
  diffuse: { label: '扩散', group: '风格化', action: 'filter.stylize.diffuse', apply: diffuse, params: [
    E('mode', '模式', 'normal', [['normal', '正常'], ['darkenOnly', '变暗优先'], ['lightenOnly', '变亮优先'], ['anisotropic', '各向异性']]), SEED(3)] },
  tiles: { label: '拼贴', group: '风格化', action: 'filter.stylize.tiles', apply: tiles, colors: true, params: [
    N('number', '拼贴数', 10, 1, 99, 1), N('maxOffset', '最大位移', 10, 1, 99, 1, '%'),
    E('fill', '填充空白区域用', 'background', [['background', '背景色'], ['foreground', '前景颜色'], ['inverse', '反向图像'], ['unaltered', '未改变的图像']]), SEED(5)] },
  extrude: { label: '凸出', group: '风格化', action: 'filter.stylize.extrude', apply: extrude, params: [
    E('type', '类型', 'blocks', [['blocks', '块'], ['pyramids', '金字塔']]), N('size', '大小', 30, 2, 255, 1, '像素', true), N('depth', '深度', 30, 1, 255, 1),
    E('depthMode', '深度依据', 'random', [['random', '随机'], ['level', '基于色阶']]), B('solidFront', '立方体正面', true), SEED(9)] },
  oilPaint: { label: '油画', group: '风格化', action: 'filter.stylize.oilPaint', apply: oilPaint, params: [
    N('stylization', '描边样式', 3, 0.1, 10, 0.1), N('cleanliness', '描边清洁度', 5, 0, 10, 0.1), N('scale', '缩放', 1, 0.1, 10, 0.1, '', true),
    N('bristle', '硬毛刷细节', 5, 0, 10, 0.1), B('lighting', '光照', true), N('angle', '角度', -60, -180, 180, 1, '度'), N('shine', '闪亮', 1, 0, 10, 0.1)] },

  
  surfaceBlur: { label: '表面模糊', group: '模糊', action: 'filter.blur.surface', apply: surfaceBlur, params: [
    N('radius', '半径', 5, 1, 100, 1, '像素', true), N('threshold', '阈值', 15, 2, 255, 1, '色阶')] },
  lensBlur: { label: '镜头模糊', group: '模糊', action: 'filter.blur.lens', apply: lensBlur, params: [
    E('iris', '光圈形状', 'hexagon', [['disc', '圆形'], ['hexagon', '六边形'], ['square', '方形'], ['triangle', '三角形']]),
    N('radius', '半径', 15, 0, 100, 1, '', true), N('brightness', '镜面高光 亮度', 0, 0, 100, 1), N('threshold', '镜面高光 阈值', 255, 0, 255, 1), N('noise', '杂色 数量', 0, 0, 100, 1)] },
  smartBlur: { label: '特殊模糊', group: '模糊', action: 'filter.blur.smart', apply: smartBlur, params: [
    N('radius', '半径', 3, 0.1, 100, 0.1, '', true), N('threshold', '阈值', 25, 0.1, 100, 0.1),
    E('quality', '品质', 'medium', [['low', '低'], ['medium', '中'], ['high', '高']]), E('mode', '模式', 'normal', [['normal', '正常'], ['edgeOnly', '仅限边缘'], ['overlayEdge', '叠加边缘']])] },
  shapeBlur: { label: '形状模糊', group: '模糊', action: 'filter.blur.shape', apply: shapeBlur, params: [
    N('radius', '半径', 10, 4, 1000, 1, '像素', true),
    E('shape', '形状', 'disc', [['disc', '圆形'], ['ring', '圆环'], ['square', '方形'], ['triangle', '三角形'], ['hexagon', '六边形'], ['star', '星形'], ['heart', '心形']])] },

  
  fieldBlur: { label: '场景模糊', group: '模糊画廊', action: 'filter.blurGallery.field', apply: fieldBlur, params: [N('blur', '模糊', 15, 0, 500, 1, '像素', true)] },
  irisBlur: { label: '光圈模糊', group: '模糊画廊', action: 'filter.blurGallery.iris', apply: irisBlur, params: [
    N('blur', '模糊', 15, 0, 500, 1, '像素', true), ...CENTER(), N('radiusX', '半径 X', 30, 1, 200, 1, '%'), N('radiusY', '半径 Y', 30, 1, 200, 1, '%'), N('feather', '过渡', 60, 0, 100, 1, '%')] },
  tiltShift: { label: '移轴模糊', group: '模糊画廊', action: 'filter.blurGallery.tiltShift', apply: tiltShift, params: [
    N('blur', '模糊', 15, 0, 500, 1, '像素', true), N('centerY', '中心 Y', 50, 0, 100, 1, '%'), N('angle', '角度', 0, -90, 90, 1, '度'),
    N('focus', '清晰带（半高）', 10, 0, 100, 1, '%'), N('transition', '过渡', 20, 0, 100, 1, '%')] },
  spinBlur: { label: '旋转模糊', group: '模糊画廊', action: 'filter.blurGallery.spin', apply: spinBlur, params: [
    N('angle', '模糊角度', 15, 0, 360, 1, '度'), ...CENTER(), N('radius', '半径', 40, 1, 200, 1, '%')] },

  
  smartSharpen: { label: '智能锐化', group: '锐化', action: 'filter.sharpen.smart', apply: smartSharpen, params: [
    N('amount', '数量', 200, 0, 500, 1, '%'), N('radius', '半径', 1, 0.1, 64, 0.1, '像素', true), N('reduceNoise', '减少杂色', 10, 0, 100, 1, '%'),
    E('remove', '移去', 'gaussian', [['gaussian', '高斯模糊'], ['lens', '镜头模糊'], ['motion', '动感模糊']]), N('angle', '角度（动感）', 0, -180, 180, 1, '度')] },
  sharpenEdges: { label: '锐化边缘', group: '锐化', action: 'filter.sharpen.edges', apply: sharpenEdges, params: [] },
  shake: { label: '防抖', group: '锐化', action: 'filter.sharpen.shake', apply: shakeReduction, params: [
    N('length', '模糊描摹边界', 10, 1, 199, 1, '像素', true), N('angle', '模糊方向', 0, -180, 180, 1, '度'),
    N('smoothing', '平滑', 20, 0, 100, 1, '%'), N('iterations', '迭代次数', 10, 1, 40, 1)] },

  
  ntsc: { label: 'NTSC 颜色', group: '视频', action: 'filter.video.ntsc', apply: ntscColors, params: [] },
  deinterlace: { label: '逐行', group: '视频', action: 'filter.video.deinterlace', apply: deinterlace, params: [
    E('eliminate', '消除', 'odd', [['odd', '奇数行'], ['even', '偶数行']]), E('create', '创建新场方式', 'interpolation', [['duplication', '复制'], ['interpolation', '插值']])] },

  
  facet: { label: '彩块化', group: '像素化', action: 'filter.pixelate.facet', apply: facet, params: [] },
  colorHalftone: { label: '彩色半调', group: '像素化', action: 'filter.pixelate.halftone', apply: colorHalftone, params: [
    N('maxRadius', '最大半径', 8, 4, 127, 1, '像素', true), N('angle1', '通道 1', 108, -360, 360, 1, '度'), N('angle2', '通道 2', 162, -360, 360, 1, '度'), N('angle3', '通道 3', 90, -360, 360, 1, '度')] },
  pointillize: { label: '点状化', group: '像素化', action: 'filter.pixelate.pointillize', apply: pointillize, colors: true, params: [N('cell', '单元格大小', 5, 3, 300, 1, '', true), SEED(2)] },
  crystallize: { label: '晶格化', group: '像素化', action: 'filter.pixelate.crystallize', apply: crystallize, params: [N('cell', '单元格大小', 10, 3, 300, 1, '', true), SEED(1)] },
  fragment: { label: '碎片', group: '像素化', action: 'filter.pixelate.fragment', apply: fragment, params: [] },
  mezzotint: { label: '铜版雕刻', group: '像素化', action: 'filter.pixelate.mezzotint', apply: mezzotint, params: [
    E('type', '类型', 'fineDots', [['fineDots', '精细点'], ['mediumDots', '中等点'], ['grainyDots', '粒状点'], ['coarseDots', '粗网点'],
      ['shortLines', '短直线'], ['mediumLines', '中长直线'], ['longLines', '长直线'], ['shortStrokes', '短描边'], ['mediumStrokes', '中长描边'], ['longStrokes', '长边']]), SEED(4)] },

  
  differenceClouds: { label: '分层云彩', group: '渲染', action: 'filter.render.differenceClouds', apply: differenceClouds, colors: true, params: [SEED(1)] },
  fibers: { label: '纤维', group: '渲染', action: 'filter.render.fibers', apply: fibers, colors: true, replaces: true, params: [
    N('variance', '差异', 16, 1, 64, 1), N('strength', '强度', 4, 1, 64, 1), SEED(1)] },
  lensFlare: { label: '镜头光晕', group: '渲染', action: 'filter.render.lensFlare', apply: lensFlare, params: [
    N('brightness', '亮度', 100, 10, 300, 1, '%'), ...CENTER(30, 30),
    E('lens', '镜头类型', 'zoom', [['zoom', '50-300 毫米变焦'], ['prime35', '35 毫米聚焦'], ['prime105', '105 毫米聚焦'], ['movie', '电影镜头']])] },
  lighting: { label: '光照效果', group: '渲染', action: 'filter.render.lighting', apply: lighting, colors: true, params: [
    E('type', '光源', 'spot', [['spot', '聚光灯'], ['point', '点光'], ['infinite', '无限光']]), N('intensity', '强度', 35, -100, 100, 1),
    ...CENTER(), N('radius', '范围', 50, 1, 200, 1, '%'), N('angle', '方向', -45, -180, 180, 1, '度'),
    N('ambience', '环境', 8, -100, 100, 1), N('gloss', '光泽', 0, -100, 100, 1), N('bump', '纹理高度（亮度）', 0, 0, 100, 1), B('useFg', '光色用前景色', false)] },

  
  reduceNoise: { label: '减少杂色', group: '杂色', action: 'filter.noise.reduce', apply: reduceNoise, params: [
    N('strength', '强度', 6, 0, 10, 1), N('preserveDetails', '保留细节', 60, 0, 100, 1, '%'), N('colorNoise', '减少杂色', 45, 0, 100, 1, '%'), N('sharpen', '锐化细节', 25, 0, 100, 1, '%')] },
  dustScratches: { label: '蒙尘与划痕', group: '杂色', action: 'filter.noise.dustScratches', apply: dustScratches, params: [
    N('radius', '半径', 1, 1, 100, 1, '像素', true), N('threshold', '阈值', 0, 0, 255, 1, '色阶')] },

  
  bumpMap: { label: '生成凹凸图', group: '3D', action: 'filter.3d.bump', apply: bumpMap, params: [
    N('blur', '模糊', 1, 0, 50, 0.5, '像素', true), N('contrast', '对比度', 0, -100, 100, 1), B('invert', '反相高度', false)] },
  normalMap: { label: '生成法线图', group: '3D', action: 'filter.3d.normal', apply: normalMap, params: [
    N('blur', '模糊', 1, 0, 50, 0.5, '像素', true), N('strength', '细节缩放', 2, 0.1, 20, 0.1), N('contrast', '对比度', 0, -100, 100, 1), B('invert', '反相高度', false)] },

  
  hsbHsl: { label: 'HSB/HSL', group: '其它', action: 'filter.other.hsb', apply: hsbHsl, params: [E('mode', '行序', 'hsb', [['hsb', 'HSB'], ['hsl', 'HSL']])] },
  custom: { label: '自定', group: '其它', action: 'filter.other.custom', apply: customKernel, params: [
    M('matrix', '卷积核', [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, -1, 5, -1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0]),
    N('scale', '缩放', 1, 1, 9999, 1), N('offset', '位移', 0, -9999, 9999, 1)] },

  
  autoTone: { label: '自动色调', group: '调整', action: 'image.autoTone', apply: autoTone, params: [] },
  autoContrast: { label: '自动对比度', group: '调整', action: 'image.autoContrast', apply: autoContrast, params: [] },
  autoColor: { label: '自动颜色', group: '调整', action: 'image.autoColor', apply: autoColor, params: [] },
  shadowsHighlights: { label: '阴影/高光', group: '调整', action: 'image.adjust.shadowsHighlights', apply: shadowsHighlights, params: [
    N('shadowAmount', '阴影 数量', 35, 0, 100, 1, '%'), N('shadowTone', '阴影 色调', 50, 0, 100, 1, '%'),
    N('highlightAmount', '高光 数量', 0, 0, 100, 1, '%'), N('highlightTone', '高光 色调', 50, 0, 100, 1, '%'),
    N('radius', '半径', 30, 0, 2500, 1, '像素', true), N('colorCorrection', '颜色', 20, -100, 100, 1), N('midtoneContrast', '中间调', 0, -100, 100, 1)] },
  hdrToning: { label: 'HDR 色调', group: '调整', action: 'image.adjust.hdrToning', apply: hdrToning, params: [
    N('radius', '半径', 50, 1, 500, 1, '像素', true), N('strength', '强度', 0.5, 0.1, 4, 0.01), N('gamma', '灰度系数', 1, 0.1, 2, 0.01),
    N('exposure', '曝光度', 0, -5, 5, 0.05), N('detail', '细节', 30, -100, 300, 1, '%'), N('vibrance', '自然饱和度', 0, -100, 100, 1, '%'), N('saturation', '饱和度', 20, -100, 100, 1, '%')] },
  matchColor: { label: '匹配颜色', group: '调整', action: 'image.adjust.matchColor', apply: matchColor, params: [
    N('luminance', '明亮度', 100, 1, 200, 1), N('intensity', '颜色强度', 100, 1, 200, 1), N('fade', '渐隐', 0, 0, 100, 1), B('neutralize', '中和', true)] },
  replaceColor: { label: '替换颜色', group: '调整', action: 'image.adjust.replaceColor', apply: replaceColor, params: [
    C('color', '取样颜色', [255, 0, 0]), N('fuzziness', '颜色容差', 40, 0, 200, 1),
    N('hue', '色相', 0, -180, 180, 1), N('saturation', '饱和度', 0, -100, 100, 1), N('lightness', '明度', 0, -100, 100, 1)] },

  
  cameraRaw: { label: 'Camera Raw 滤镜', group: '校正', action: 'filter.cameraRaw', apply: cameraRaw, params: [
    N('temperature', '色温', 0, -100, 100, 1), N('tint', '色调', 0, -100, 100, 1),
    N('exposure', '曝光', 0, -5, 5, 0.05), N('contrast', '对比度', 0, -100, 100, 1), N('highlights', '高光', 0, -100, 100, 1), N('shadows', '阴影', 0, -100, 100, 1),
    N('whites', '白色', 0, -100, 100, 1), N('blacks', '黑色', 0, -100, 100, 1),
    N('texture', '纹理', 0, -100, 100, 1), N('clarity', '清晰度', 0, -100, 100, 1), N('dehaze', '去除薄雾', 0, -100, 100, 1),
    N('vibrance', '自然饱和度', 0, -100, 100, 1), N('saturation', '饱和度', 0, -100, 100, 1)] },
  lensCorrection: { label: '镜头校正', group: '校正', action: 'filter.lensCorrection', apply: lensCorrection, params: [
    N('distortion', '移去扭曲', 0, -100, 100, 1), N('caRed', '修复红/青边', 0, -100, 100, 1), N('caBlue', '修复蓝/黄边', 0, -100, 100, 1),
    N('vignette', '晕影 数量', 0, -100, 100, 1), N('midpoint', '晕影 中点', 50, 0, 100, 1),
    N('vertical', '垂直透视', 0, -100, 100, 1), N('horizontal', '水平透视', 0, -100, 100, 1), N('angle', '角度', 0, -180, 180, 0.1, '度'),
    N('scale', '比例', 100, 50, 150, 1, '%'), E('edge', '边缘', 'clear', [['clear', '透明度'], ['repeat', '边缘扩展']])] },
};


export const _internals = { remap, sampleBilinear, shapeSamples, medianHuang, gauss };
