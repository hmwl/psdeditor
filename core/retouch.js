




























import { patchMatchInpaint } from './content-aware.js';





function assertRGBA(rgba, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new RangeError(`图像尺寸非法：${width}×${height}（必须是正整数）`);
  const px = rgba && rgba.data && typeof rgba.length !== 'number' ? rgba.data : rgba;
  if (!px || typeof px.length !== 'number')
    throw new TypeError('rgba 必须是 RGBA 字节数组（Uint8Array / Uint8ClampedArray）或 { data, width, height }');
  if (px.length < width * height * 4)
    throw new RangeError(`RGBA 长度 ${px.length} < ${width}×${height}×4 = ${width * height * 4}`);
  return px;
}





function normRegion(region, width, height) {
  if (!region || typeof region !== 'object') throw new TypeError('region 必须是 { x, y, w, h, mask }');
  const x = Math.round(+region.x || 0), y = Math.round(+region.y || 0);
  const w = Math.round(+region.w || 0), h = Math.round(+region.h || 0);
  if (!(w > 0 && h > 0)) throw new RangeError(`region 尺寸非法：${w}×${h}`);
  const mask = region.mask;
  if (!mask || mask.length !== w * h) throw new RangeError(`region.mask 长度 ${mask && mask.length} ≠ ${w}×${h} = ${w * h}`);
  if (x + w <= 0 || y + h <= 0 || x >= width || y >= height) return null;   
  return { x, y, w, h, mask };
}











function relax(f, solve, w, h, iters, lambda = 0) {
  for (let it = 0; it < iters; it++) {
    
    for (let parity = 0; parity < 2; parity++) {
      for (let y = 0; y < h; y++) {
        for (let x = (y + parity) & 1; x < w; x += 2) {
          const i = y * w + x;
          if (!solve[i]) continue;
          let sum = 0, n = 0;
          if (x > 0) { sum += f[i - 1]; n++; }
          if (x < w - 1) { sum += f[i + 1]; n++; }
          if (y > 0) { sum += f[i - w]; n++; }
          if (y < h - 1) { sum += f[i + w]; n++; }
          

          if (n) f[i] = sum / (n + lambda);
        }
      }
    }
  }
}








function downsample(f, solve, w, h) {
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  const f2 = new Float32Array(hw * hh), s2 = new Uint8Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    let sum = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy), i = sy * w + sx;
      if (!solve[i]) { sum += f[i]; n++; }
    }
    const j = y * hw + x;
    s2[j] = n ? 0 : 1;
    f2[j] = n ? sum / n : 0;
  }
  return { f: f2, solve: s2, w: hw, h: hh };
}


function upsampleInto(f, solve, w, h, c) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!solve[i]) continue;
    const cx = Math.min(c.w - 1, x >> 1), cy = Math.min(c.h - 1, y >> 1);
    f[i] = c.f[cy * c.w + cx];
  }
}


function solveLaplace(f, solve, w, h, lambda = 0) {
  let any = false;
  for (let i = 0; i < solve.length; i++) if (solve[i]) { any = true; break; }
  if (!any) return f;
  if (w > 4 && h > 4) {
    const c = downsample(f, solve, w, h);
    solveLaplace(c.f, c.solve, c.w, c.h, lambda * 4);     
    upsampleInto(f, solve, w, h, c);
    relax(f, solve, w, h, 24, lambda);
  } else {
    relax(f, solve, w, h, 64, lambda);
  }
  return f;
}















export function inpaintRegion(rgba, width, height, region, opts = {}) {
  const px = assertRGBA(rgba, width, height);
  const out = new Uint8ClampedArray(px.subarray ? px.subarray(0, width * height * 4) : px);
  const R = normRegion(region, width, height);
  if (!R) return out;
  const pad = Math.max(1, Math.round(opts.padding ?? 2));
  
  const x0 = Math.max(0, R.x - pad), y0 = Math.max(0, R.y - pad);
  const x1 = Math.min(width, R.x + R.w + pad), y1 = Math.min(height, R.y + R.h + pad);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return out;

  const cov = new Uint8Array(w * h);             
  const solve = new Uint8Array(w * h);
  let hit = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = x0 + x - R.x, gy = y0 + y - R.y;
    if (gx < 0 || gy < 0 || gx >= R.w || gy >= R.h) continue;
    const c = R.mask[gy * R.w + gx];
    if (!c) continue;
    cov[y * w + x] = c;
    solve[y * w + x] = 1;
    hit++;
  }
  if (!hit) return out;

  const f = new Float32Array(w * h);
  for (let ch = 0; ch < 3; ch++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, o = ((y0 + y) * width + (x0 + x)) * 4 + ch;
      f[i] = px[o];
    }
    solveLaplace(f, solve, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = cov[i];
      if (!c) continue;
      const o = ((y0 + y) * width + (x0 + x)) * 4 + ch;
      const k = c / 255;
      out[o] = Math.round(px[o] * (1 - k) + f[i] * k);
    }
  }
  

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = cov[i];
    if (!c) continue;
    const o = ((y0 + y) * width + (x0 + x)) * 4 + 3;
    out[o] = Math.round(px[o] * (1 - c / 255) + 255 * (c / 255));
  }
  return out;
}









export const HEAL_MODES = ['normal', 'replace', 'multiply', 'screen', 'darken', 'lighten', 'color', 'luminosity'];
const lumOf = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(r, g, b) {
  const l = lumOf(r, g, b), n = Math.min(r, g, b), x = Math.max(r, g, b);
  if (n < 0) { const k = l / (l - n || 1); r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k; }
  if (x > 255) { const k = (255 - l) / (x - l || 1); r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k; }
  return [r, g, b];
}
const setLum = (c, l) => { const d = l - lumOf(c[0], c[1], c[2]); return clipColor(c[0] + d, c[1] + d, c[2] + d); };

export function healBlend(mode, b, s) {
  switch (mode) {
    case 'multiply': return [b[0] * s[0] / 255, b[1] * s[1] / 255, b[2] * s[2] / 255];
    case 'screen': return [0, 1, 2].map(c => 255 - (255 - b[c]) * (255 - s[c]) / 255);
    case 'darken': return [Math.min(b[0], s[0]), Math.min(b[1], s[1]), Math.min(b[2], s[2])];
    case 'lighten': return [Math.max(b[0], s[0]), Math.max(b[1], s[1]), Math.max(b[2], s[2])];
    case 'color': return setLum(s, lumOf(b[0], b[1], b[2]));
    case 'luminosity': return setLum(b, lumOf(s[0], s[1], s[2]));
    default: return [s[0], s[1], s[2]];
  }
}




const hash01 = (x, y) => (((x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995) >>> 0) % 4096 / 4096;
function putMixed(out, px, o, r, g, b, a, cov, mode, gx, gy) {
  let k = cov / 255;
  if (mode === 'replace' && k < 1) k = k > hash01(gx, gy) ? 1 : 0;
  if (k <= 0) return;
  let c = [r, g, b];
  if (mode && mode !== 'normal' && mode !== 'replace') c = healBlend(mode, [px[o], px[o + 1], px[o + 2]], c);
  out[o] = Math.round(px[o] * (1 - k) + c[0] * k);
  out[o + 1] = Math.round(px[o + 1] * (1 - k) + c[1] * k);
  out[o + 2] = Math.round(px[o + 2] * (1 - k) + c[2] * k);
  out[o + 3] = Math.round(px[o + 3] * (1 - k) + a * k);
}








function diffusionLambda(d, size) {
  if (!(d < 7)) return 0;
  const L = Math.max(1, size * Math.pow(2, Math.max(1, d) - 4));
  return 1 / (L * L);
}
















export function healRegion(rgba, width, height, region, src, opts = {}) {
  const px = assertRGBA(rgba, width, height);
  const out = new Uint8ClampedArray(px.subarray ? px.subarray(0, width * height * 4) : px);
  const R = normRegion(region, width, height);
  if (!R) return out;
  const dx = Math.round(+(src && src.dx) || 0), dy = Math.round(+(src && src.dy) || 0);
  const im = src && src.image;
  if (!im && !dx && !dy) return out;                     
  const clone = opts.mode === 'clone';
  const pad = Math.max(1, Math.round(opts.padding ?? 2));
  const x0 = Math.max(0, R.x - pad), y0 = Math.max(0, R.y - pad);
  const x1 = Math.min(width, R.x + R.w + pad), y1 = Math.min(height, R.y + R.h + pad);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return out;

  
  const S = new Float32Array(w * h * 4), ok = new Uint8Array(w * h);
  const sd = im ? im.data : px, sw = im ? im.width : width, sh = im ? im.height : height;
  const ix = im ? Math.round(im.x || 0) : 0, iy = im ? Math.round(im.y || 0) : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x + dx - ix, sy = y0 + y + dy - iy;
    if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
    const i = y * w + x, so = (sy * sw + sx) * 4;
    ok[i] = 1;
    S[i * 4] = sd[so]; S[i * 4 + 1] = sd[so + 1]; S[i * 4 + 2] = sd[so + 2]; S[i * 4 + 3] = sd[so + 3];
  }
  const cov = new Uint8Array(w * h), solve = new Uint8Array(w * h);
  let hit = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const gx = x0 + x - R.x, gy = y0 + y - R.y;
    if (gx < 0 || gy < 0 || gx >= R.w || gy >= R.h) continue;
    const c = R.mask[gy * R.w + gx];
    if (!c || !ok[i]) continue;                   
    cov[i] = c; solve[i] = 1; hit++;
  }
  if (!hit) return out;

  const H = new Float32Array(w * h * 3);           
  if (opts.transparent) {
    
    const r = 3;
    for (let ch = 0; ch < 3; ch++) {
      const a = new Float32Array(w * h), t = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) a[i] = ok[i] ? S[i * 4 + ch] : 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) { const X = x + k; if (X < 0 || X >= w || !ok[y * w + X]) continue; s += a[y * w + X]; n++; }
          t[y * w + x] = n ? s / n : a[y * w + x];
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) { const Y = y + k; if (Y < 0 || Y >= h || !ok[Y * w + x]) continue; s += t[Y * w + x]; n++; }
          a[y * w + x] = n ? s / n : t[y * w + x];
        }
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!solve[i]) continue;
        const o = ((y0 + y) * width + (x0 + x)) * 4 + ch;
        H[i * 3 + ch] = px[o] + (S[i * 4 + ch] - a[i]);
      }
    }
  } else {
    const lambda = clone ? 0 : diffusionLambda(opts.diffusion ?? 7, Math.sqrt(hit));
    const f = new Float32Array(w * h);
    for (let ch = 0; ch < 3; ch++) {
      if (clone) {
        for (let i = 0; i < w * h; i++) f[i] = 0;
      } else {
        

        let dc = 0, dn = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (solve[i]) { f[i] = 0; continue; }
          const o = ((y0 + y) * width + (x0 + x)) * 4 + ch;
          f[i] = ok[i] ? px[o] - S[i * 4 + ch] : 0;
          if (ok[i] && lambda > 0 && ((x > 0 && solve[i - 1]) || (x < w - 1 && solve[i + 1]) || (y > 0 && solve[i - w]) || (y < h - 1 && solve[i + w]))) { dc += f[i]; dn++; }
        }
        

        dc = dn ? dc / dn : 0;
        if (dc) for (let i = 0; i < w * h; i++) if (!solve[i]) f[i] -= dc;
        solveLaplace(f, solve, w, h, lambda);
        if (dc) for (let i = 0; i < w * h; i++) f[i] += dc;
      }
      for (let i = 0; i < w * h; i++) if (solve[i]) H[i * 3 + ch] = S[i * 4 + ch] + f[i];
    }
  }
  const blend = opts.blend || 'normal';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = cov[i];
    if (!c) continue;
    const o = ((y0 + y) * width + (x0 + x)) * 4;
    
    const a = opts.transparent ? px[o + 3] : S[i * 4 + 3];
    putMixed(out, px, o, clamp(H[i * 3]), clamp(H[i * 3 + 1]), clamp(H[i * 3 + 2]), a, c, blend, x0 + x, y0 + y);
  }
  return out;
}
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;






function cropWindow(px, width, height, R, margin) {
  const x0 = Math.max(0, R.x - margin), y0 = Math.max(0, R.y - margin);
  const x1 = Math.min(width, R.x + R.w + margin), y1 = Math.min(height, R.y + R.h + margin);
  const W = x1 - x0, H = y1 - y0;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) data.set(px.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x1) * 4), y * W * 4);
  const cov = new Uint8Array(W * H), hole = new Uint8Array(W * H);
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = x0 + x - R.x, gy = y0 + y - R.y;
    if (gx < 0 || gy < 0 || gx >= R.w || gy >= R.h) continue;
    const c = R.mask[gy * R.w + gx];
    if (c) { cov[y * W + x] = c; hole[y * W + x] = 255; n++; }
  }
  return { x0, y0, W, H, data, cov, hole, n };
}

function writeWindow(out, px, width, win, res, blend) {
  const { x0, y0, W, H, cov } = win;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = cov[i]; if (!c) continue;
    const o = ((y0 + y) * width + x0 + x) * 4, r = i * 4;
    putMixed(out, px, o, res[r], res[r + 1], res[r + 2], res[r + 3], c, blend, x0 + x, y0 + y);
  }
}

function holeIntegral(hole, W, H) {
  const I = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += hole[y * W + x] ? 1 : 0; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  return (ax, ay, bx, by) => I[(by + 1) * (W + 1) + bx + 1] - I[ay * (W + 1) + bx + 1] - I[(by + 1) * (W + 1) + ax] + I[ay * (W + 1) + ax];
}







export function proximityOffset(data, W, H, hole) {
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1; const holes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hole[y * W + x]) {
    holes.push(y * W + x); if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (!holes.length) return null;
  const hw = bx1 - bx0 + 1, hh = by1 - by0 + 1, size = Math.max(hw, hh);
  const bw = Math.max(2, Math.min(12, Math.round(Math.min(hw, hh) * 0.3)));
  
  const hin = holeIntegral(hole, W, H);
  const band = [];
  for (let y = Math.max(0, by0 - bw); y <= Math.min(H - 1, by1 + bw); y++) for (let x = Math.max(0, bx0 - bw); x <= Math.min(W - 1, bx1 + bw); x++) {
    const i = y * W + x; if (hole[i]) continue;
    if (hin(Math.max(0, x - bw), Math.max(0, y - bw), Math.min(W - 1, x + bw), Math.min(H - 1, y + bw))) band.push(i);
  }
  const pick = (L, n) => { if (L.length <= n) return L; const s = L.length / n, o = []; for (let k = 0; k < n; k++) o.push(L[Math.floor(k * s)]); return o; };
  const B = pick(band, 700), Hs = pick(holes, 600);
  

  const cost = (dx, dy) => {
    if (bx0 - bw + dx < 0 || by0 - bw + dy < 0 || bx1 + bw + dx >= W || by1 + bw + dy >= H) return Infinity;
    for (const i of Hs) if (hole[i + dy * W + dx]) return Infinity;       
    let s0 = 0, s1 = 0, s2 = 0, q = 0, n = 0;
    for (const i of B) {
      const j = i + dy * W + dx, a = i * 4, b = j * 4;
      if (hole[j]) { q += 3 * 65025; n++; continue; }
      const e0 = data[a] - data[b], e1 = data[a + 1] - data[b + 1], e2 = data[a + 2] - data[b + 2];
      s0 += e0; s1 += e1; s2 += e2; q += e0 * e0 + e1 * e1 + e2 * e2; n++;
    }
    const d = (q - (s0 * s0 + s1 * s1 + s2 * s2) / n) / n + 0.15 * (s0 * s0 + s1 * s1 + s2 * s2) / (n * n);
    
    return d * (1 + Math.hypot(dx, dy) / (size * 8));
  };
  const st = Math.max(1, Math.round(size / 16));
  const top = [];                                   
  for (let dy = -H; dy <= H; dy += st) for (let dx = -W; dx <= W; dx += st) {
    if (!dx && !dy) continue;
    const c = cost(dx, dy); if (!isFinite(c)) continue;
    if (top.length < 6 || c < top[top.length - 1].c) { top.push({ c, dx, dy }); top.sort((a, b) => a.c - b.c); if (top.length > 6) top.pop(); }
  }
  if (!top.length) return null;
  let best = Infinity, bd = null;
  for (const t of top) for (let dy = t.dy - st; dy <= t.dy + st; dy++) for (let dx = t.dx - st; dx <= t.dx + st; dx++) {
    if (!dx && !dy) continue;
    const c = cost(dx, dy); if (c < best) { best = c; bd = { dx, dy }; }
  }
  return bd;
}





export function textureFill(data, W, H, hole, seed = 3) {
  let s = (seed >>> 0) || 0x2545f491;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  let n = 0, bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hole[y * W + x]) { n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  const out = new Uint8ClampedArray(data);
  if (!n) return out;
  const B = Math.max(3, Math.min(12, Math.round(Math.sqrt(n) / 5)));
  const hin = holeIntegral(hole, W, H);
  const cand = [];
  
  const ring = Math.max(8, Math.max(bx1 - bx0, by1 - by0));
  for (let y = Math.max(0, by0 - ring); y + B <= Math.min(H, by1 + ring + B); y += 2)
    for (let x = Math.max(0, bx0 - ring); x + B <= Math.min(W, bx1 + ring + B); x += 2) if (!hin(x, y, x + B - 1, y + B - 1)) cand.push(y * W + x);
  if (!cand.length) return out;
  const acc = new Float32Array(W * H * 4), ws = new Float32Array(W * H);
  const step = Math.max(2, B - Math.max(1, B >> 2));
  for (let ty = by0 - (B >> 2); ty <= by1; ty += step) for (let tx = bx0 - (B >> 2); tx <= bx1; tx += step) {
    const c = cand[(rand() * cand.length) | 0], cx = c % W, cy = (c / W) | 0;
    

    const mu = [0, 0, 0, 0];
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) { const b = ((cy + j) * W + cx + i) * 4; for (let k = 0; k < 4; k++) mu[k] += data[b + k]; }
    for (let k = 0; k < 4; k++) mu[k] /= B * B;
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
      const X = tx + i, Y = ty + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const q = Y * W + X; if (!hole[q]) continue;
      const wgt = (Math.min(i + 1, B - i) * Math.min(j + 1, B - j));       
      const b = ((cy + j) * W + cx + i) * 4;
      for (let k = 0; k < 3; k++) acc[q * 4 + k] += (data[b + k] - mu[k]) * wgt;
      acc[q * 4 + 3] += data[b + 3] * wgt;
      ws[q] += wgt;
    }
  }
  

  for (let q = 0; q < W * H; q++) {
    if (hole[q] && ws[q] > 0) {
      for (let k = 0; k < 3; k++) out[q * 4 + k] = 128 + acc[q * 4 + k] / ws[q];
      out[q * 4 + 3] = acc[q * 4 + 3] / ws[q];
    } else { out[q * 4] = out[q * 4 + 1] = out[q * 4 + 2] = 128; }
  }
  return out;
}










function boxNorm(val, wgt, W, H, R) {
  
  const tv = new Float32Array(W * H), tw = new Float32Array(W * H), ov = new Float32Array(W * H), ow = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let sv = 0, sw = 0; const row = y * W;
    for (let x = -R; x < W; x++) {
      const xa = x + R; if (xa < W) { sv += val[row + xa]; sw += wgt[row + xa]; }
      const xr = x - R - 1; if (xr >= 0) { sv -= val[row + xr]; sw -= wgt[row + xr]; }
      if (x >= 0) { tv[row + x] = sv; tw[row + x] = sw; }
    }
  }
  for (let x = 0; x < W; x++) {
    let sv = 0, sw = 0;
    for (let y = -R; y < H; y++) {
      const ya = y + R; if (ya < H) { sv += tv[ya * W + x]; sw += tw[ya * W + x]; }
      const yr = y - R - 1; if (yr >= 0) { sv -= tv[yr * W + x]; sw -= tw[yr * W + x]; }
      if (y >= 0) { ov[y * W + x] = sv; ow[y * W + x] = sw; }
    }
  }
  for (let i = 0; i < W * H; i++) ov[i] = ow[i] > 1e-6 ? ov[i] / ow[i] : NaN;
  return ov;
}
function colorAdapt(data, synth, W, H, hole) {
  let n = 0; for (let i = 0; i < W * H; i++) if (hole[i]) n++;
  if (!n) return synth;
  const R = Math.max(3, Math.min(25, Math.round(Math.sqrt(n) / 4)));
  const mk = new Float32Array(W * H), ms = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { if (hole[i]) ms[i] = 1; else mk[i] = data[i * 4 + 3] > 0 ? 1 : 0; }
  const solve = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solve[i] = hole[i] ? 1 : 0;
  const out = new Uint8ClampedArray(synth);
  const vk = new Float32Array(W * H), vs = new Float32Array(W * H), f = new Float32Array(W * H);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < W * H; i++) { vk[i] = data[i * 4 + c] * mk[i]; vs[i] = synth[i * 4 + c] * ms[i]; }
    const Lk = boxNorm(vk, mk, W, H, R), Ls = boxNorm(vs, ms, W, H, R);
    for (let i = 0; i < W * H; i++) {
      if (hole[i]) { f[i] = 0; continue; }
      const d = Lk[i] - Ls[i];
      f[i] = Number.isFinite(d) ? d : 0;
    }
    solveLaplace(f, solve, W, H);
    for (let i = 0; i < W * H; i++) if (hole[i]) out[i * 4 + c] = Math.round(synth[i * 4 + c] + f[i]);
  }
  return out;
}









export function spotHeal(rgba, width, height, region, opts = {}) {
  const px = assertRGBA(rgba, width, height);
  const out = new Uint8ClampedArray(px.subarray ? px.subarray(0, width * height * 4) : px);
  const R = normRegion(region, width, height);
  if (!R) return out;
  const type = opts.type || 'content';
  const size = Math.max(R.w, R.h);
  const margin = Math.max(12, Math.min(220, Math.round(size * 1.2) + 6));
  const win = cropWindow(px, width, height, R, margin);
  if (!win.n) return out;
  const { W, H, data, hole } = win;
  const full = { x: 0, y: 0, w: W, h: H, mask: hole };
  let res = null;
  if (type === 'proximity') {
    const d = proximityOffset(data, W, H, hole);
    if (d) res = healRegion(data, W, H, full, d, { diffusion: 7 });
  } else if (type === 'texture') {
    const T = textureFill(data, W, H, hole, opts.seed);
    res = healRegion(data, W, H, full, { image: { data: T, width: W, height: H } }, { diffusion: 7 });
  }
  if (!res) {
    try { res = patchMatchInpaint(data, W, H, hole, { patch: size < 10 ? 2 : size < 24 ? 3 : size < 60 ? 4 : 5, seed: opts.seed ?? 11 }); }
    catch (e) { res = null; }
    if (res) res = colorAdapt(data, res, W, H, hole);
    else res = inpaintRegion(data, W, H, full);            
  }
  writeWindow(out, px, width, win, res, opts.blend || 'normal');
  return out;
}






function chamfer(inside, W, H) {
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = inside[i] ? INF : 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) v = Math.min(v, d[i - W] + a);
    if (x > 0 && y > 0) v = Math.min(v, d[i - W - 1] + b);
    if (x < W - 1 && y > 0) v = Math.min(v, d[i - W + 1] + b);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + a);
    if (y < H - 1) v = Math.min(v, d[i + W] + a);
    if (x < W - 1 && y < H - 1) v = Math.min(v, d[i + W + 1] + b);
    if (x > 0 && y < H - 1) v = Math.min(v, d[i + W - 1] + b);
    d[i] = v;
  }
  return d;
}













export function contentAwarePlace(rgba, width, height, region, src, opts = {}) {
  const px = assertRGBA(rgba, width, height);
  const R = normRegion(region, width, height);
  if (!R) return new Uint8ClampedArray(px.subarray ? px.subarray(0, width * height * 4) : px);
  const structure = Math.max(1, Math.min(7, Math.round(opts.structure ?? 4)));
  const color = Math.max(0, Math.min(10, +(opts.color ?? 0))) / 10;
  
  const cloned = healRegion(px, width, height, R, src, { mode: 'clone' });
  let placed = cloned;
  if (color > 0) {
    const healed = healRegion(px, width, height, R, src, { diffusion: 7 });
    placed = new Uint8ClampedArray(cloned);
    for (let i = 0; i < placed.length; i++) if (cloned[i] !== px[i] || healed[i] !== px[i]) placed[i] = Math.round(cloned[i] + (healed[i] - cloned[i]) * color);
  }
  
  const sz = Math.min(R.w, R.h);
  const bw = Math.max(1, Math.round(1 + (7 - structure) / 6 * Math.max(2, sz * 0.25)));
  const win = cropWindow(placed, width, height, R, bw * 2 + 16);
  const { W, H, data, x0, y0 } = win;
  const inside = new Uint8Array(W * H), outside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { if (win.cov[i] >= 128) inside[i] = 1; else outside[i] = 1; }
  const dIn = chamfer(inside, W, H), dOut = chamfer(outside, W, H);
  const band = new Uint8Array(W * H);
  let nb = 0;
  for (let i = 0; i < W * H; i++) {
    
    if ((inside[i] && dIn[i] <= Math.max(1, Math.round(bw * 0.6))) || (!inside[i] && dOut[i] <= bw) || (win.cov[i] > 0 && win.cov[i] < 128)) { band[i] = 255; nb++; }
  }
  const out = new Uint8ClampedArray(placed);
  if (!nb) return out;
  let res;
  try { res = patchMatchInpaint(data, W, H, band, { init: data, patch: 4, seed: opts.seed ?? 5, emIters: 3 }); }
  catch { return out; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!band[i]) continue;
    const o = ((y0 + y) * width + x0 + x) * 4;
    for (let k = 0; k < 4; k++) out[o + k] = res[i * 4 + k];
  }
  return out;
}













export function redEyeMask(rgba, width, height, rect, opts = {}) {
  const px = assertRGBA(rgba, width, height);
  const x0 = Math.max(0, Math.round(rect.x)), y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(width, Math.round(rect.x + rect.w)), y1 = Math.min(height, Math.round(rect.y + rect.h));
  const w = x1 - x0, h = y1 - y0;
  if (!(w > 0 && h > 0)) return null;
  const pupil = Math.max(0, Math.min(100, Number.isFinite(opts.pupilSize) ? opts.pupilSize : 50));
  const thr = 0.42 - pupil / 100 * 0.27;          
  const sc = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((y0 + y) * width + x0 + x) * 4, r = px[o], m = Math.max(px[o + 1], px[o + 2]);
    sc[y * w + x] = r > 40 && px[o + 3] > 0 ? Math.max(0, (r - m) / r) : 0;
  }
  const cov = new Float32Array(w * h), seen = new Uint8Array(w * h);
  const cx = w / 2, cy = h / 2, diag = Math.hypot(w, h) / 2 || 1;
  const blobs = [];
  for (let guard = 0; guard < 6; guard++) {
    let best = thr, bi = -1;
    for (let i = 0; i < w * h; i++) {
      if (seen[i]) continue;
      const x = i % w, y = (i / w) | 0;
      const v = sc[i] * (opts.single ? 1 - 0.6 * Math.hypot(x - cx, y - cy) / diag : 1);
      if (v > best) { best = v; bi = i; }
    }
    if (bi < 0) break;
    const lo = thr * 0.8, stack = [bi], pts = [];
    seen[bi] = 1;
    while (stack.length) {
      const i = stack.pop(); pts.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X; if (seen[k] || sc[k] < lo) continue;
        seen[k] = 1; stack.push(k);
      }
    }
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    for (const i of pts) { const x = i % w, y = (i / w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    
    const round = Math.min(bw, bh) / Math.max(bw, bh), fill = pts.length / (bw * bh);
    
    const touches = bx0 === 0 || by0 === 0 || bx1 === w - 1 || by1 === h - 1;
    if (pts.length >= 3 && round > 0.5 && fill > 0.45 && !(opts.single && touches)) blobs.push(pts);
    if (opts.single && blobs.length) break;
  }
  if (!blobs.length) return null;
  const grow = Math.round(pupil / 100 * 2);        
  let count = 0;
  for (const pts of blobs) for (const i of pts) {
    const x = i % w, y = (i / w) | 0;
    for (let dy = -grow - 1; dy <= grow + 1; dy++) for (let dx = -grow - 1; dx <= grow + 1; dx++) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const k = Y * w + X;
      const edge = Math.max(Math.abs(dx), Math.abs(dy)) > grow;
      
      const s = sc[k];
      const v = edge ? Math.max(0, Math.min(1, (s - thr * 0.5) / (thr * 0.5))) * 0.8
                     : Math.max(0, Math.min(1, (s - thr * 0.3) / (thr * 0.7)));
      if (v > cov[k]) cov[k] = v;
    }
  }
  for (let i = 0; i < w * h; i++) if (cov[i] > 0) count++;
  return { x0, y0, w, h, cov, count, blobs: blobs.length };
}








export function removeRedEye(rgba, width, height, rect, opts = {}) {
  const px = assertRGBA(rgba, width, height);
  const out = new Uint8ClampedArray(px.subarray ? px.subarray(0, width * height * 4) : px);
  const M = redEyeMask(px, width, height, rect, opts);
  if (!M) return out;
  const amount = Math.max(0, Math.min(100, Number.isFinite(opts.amount) ? opts.amount : 50));
  const dark = 1 - amount / 100 * 0.7;
  for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
    const k = M.cov[y * M.w + x]; if (!k) continue;
    const o = ((M.y0 + y) * width + M.x0 + x) * 4;
    const g = px[o + 1], b = px[o + 2];
    const v = (g + b) / 2 * dark;
    const t = [v, (v + g * dark) / 2, (v + b * dark) / 2];    
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(px[o + c] + (t[c] - px[o + c]) * k);
  }
  return out;
}


export function countRedEye(rgba, width, height, rect, opts = {}) {
  const M = redEyeMask(rgba, width, height, rect, opts);
  return M ? M.count : 0;
}

export default { inpaintRegion, healRegion, spotHeal, contentAwarePlace, proximityOffset, textureFill,
                 removeRedEye, countRedEye, redEyeMask, healBlend, HEAL_MODES };
