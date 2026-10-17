

























import { blendRGB, setLum, lum } from './paint-fill.js';



const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
const lerp = (a, b, t) => a + (b - a) * t;


export function colorDistance(a, b) {
  let d = Math.abs(a[0] - b[0]);
  const g = Math.abs(a[1] - b[1]); if (g > d) d = g;
  const bl = Math.abs(a[2] - b[2]); if (bl > d) d = bl;
  return d;
}


export function rgbToHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0));
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  if (s <= 0) { const v = clamp255(Math.round(l * 255)); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const tc = [hk + 1 / 3, hk, hk - 1 / 3].map(t => (t < 0 ? t + 1 : t > 1 ? t - 1 : t));
  const f = t => t < 1 / 6 ? p + (q - p) * 6 * t
    : t < 1 / 2 ? q
    : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6
    : p;
  return tc.map(t => clamp255(Math.round(f(t) * 255)));
}

export const luma = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114;


function at(src, w, h, x, y) {
  const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
  const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
  const o = (cy * w + cx) * 4;
  return [src[o], src[o + 1], src[o + 2], src[o + 3]];
}








export function cloneAt(src, w, h, sx, sy) {
  if (!(w > 0 && h > 0)) return null;
  if (sx < -1 || sy < -1 || sx > w || sy > h) return null;
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const fx = sx - x0, fy = sy - y0;
  const p00 = at(src, w, h, x0, y0), p10 = at(src, w, h, x0 + 1, y0);
  const p01 = at(src, w, h, x0, y0 + 1), p11 = at(src, w, h, x0 + 1, y0 + 1);
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++)
    out[c] = clamp255(Math.round(lerp(lerp(p00[c], p10[c], fx), lerp(p01[c], p11[c], fx), fy)));
  return out;
}






export function patternAt(pat, docX, docY, opts = {}) {
  if (!pat || !pat.data || !(pat.width > 0) || !(pat.height > 0)) return null;
  const scale = opts.scale > 0 ? opts.scale : 1;
  const ox = opts.originX || 0, oy = opts.originY || 0;
  const u = (docX - ox) / scale, v = (docY - oy) / scale;
  const x = ((Math.floor(u) % pat.width) + pat.width) % pat.width;
  const y = ((Math.floor(v) % pat.height) + pat.height) % pat.height;
  const o = (y * pat.width + x) * 4;
  return [pat.data[o], pat.data[o + 1], pat.data[o + 2], pat.data[o + 3]];
}
















export function backgroundEraseAlpha(rgb, sample, tolerance, opts = {}) {
  const tol = Math.max(0, Math.min(255, tolerance));
  const d = colorDistance(rgb, sample);
  const soft = Math.max(1, tol / 2);                 
  let k = d <= tol ? 1 : d >= tol + soft ? 0 : (tol + soft - d) / soft;
  if (k > 0 && opts.protect) {
    const pt = Math.max(0, Math.min(255, opts.protectTolerance == null ? tol : opts.protectTolerance));
    if (colorDistance(rgb, opts.protect) <= pt) return 0;   
  }
  return k;
}



export const REPLACE_MODES = ['hue', 'saturation', 'color', 'luminosity'];








export function replaceColorPixel(rgb, sample, target, tolerance, mode = 'color') {
  if (!REPLACE_MODES.includes(mode)) throw new Error(`颜色替换模式不认识「${mode}」；可用：${REPLACE_MODES.join(' / ')}`);
  const tol = Math.max(0, Math.min(255, tolerance));
  if (colorDistance(rgb, sample) > tol) return null;
  const [h0, s0, l0] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const [h1, s1, l1] = rgbToHsl(target[0], target[1], target[2]);
  if (mode === 'hue') return hslToRgb(h1, s0, l0);
  if (mode === 'saturation') return hslToRgb(h0, s1, l0);
  if (mode === 'luminosity') return hslToRgb(h0, s0, l1);
  return hslToRgb(h1, s1, l0);                        
}







export function boxBlurAt(src, w, h, x, y, radius) {
  const r = Math.max(1, Math.round(radius));
  let sr = 0, sg = 0, sb = 0, sa = 0, wsum = 0, n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const p = at(src, w, h, x + dx, y + dy);
    const a = p[3] / 255;
    sr += p[0] * a; sg += p[1] * a; sb += p[2] * a;
    wsum += a; sa += p[3]; n++;
  }
  const A = Math.round(sa / n);
  if (wsum <= 1e-6) return [0, 0, 0, A];
  return [clamp255(Math.round(sr / wsum)), clamp255(Math.round(sg / wsum)), clamp255(Math.round(sb / wsum)), A];
}









export function sharpenAt(src, w, h, x, y, radius, amount, opts = {}) {
  const p = at(src, w, h, x, y);
  const m = boxBlurAt(src, w, h, x, y, radius);
  const k = Math.max(0, amount);
  if (!opts.protect) {
    return [clamp255(Math.round(p[0] + (p[0] - m[0]) * k)),
            clamp255(Math.round(p[1] + (p[1] - m[1]) * k)),
            clamp255(Math.round(p[2] + (p[2] - m[2]) * k)),
            p[3]];
  }
  const d = (luma(p[0], p[1], p[2]) - luma(m[0], m[1], m[2])) * k;
  
  let lo = 255, hi = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const q = at(src, w, h, x + dx, y + dy), l = luma(q[0], q[1], q[2]);
    if (l < lo) lo = l; if (l > hi) hi = l;
  }
  const l0 = luma(p[0], p[1], p[2]), slack = (hi - lo) * 0.15 + 2;
  const l1 = Math.max(lo - slack, Math.min(hi + slack, l0 + d)), dd = l1 - l0;
  return [clamp255(Math.round(p[0] + dd)), clamp255(Math.round(p[1] + dd)), clamp255(Math.round(p[2] + dd)), p[3]];
}










export function smudgeMix(carry, dst, strength) {
  const s = Math.max(0, Math.min(1, strength));
  const out = [0, 0, 0, 0], nc = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    out[c] = clamp255(Math.round(lerp(dst[c], carry[c], s)));
    nc[c] = clamp255(Math.round(lerp(carry[c], dst[c], 1 - s)));
  }
  return { out, carry: nc };
}







export function smudgeDab(p, d, strength, cov) {
  const k = Math.max(0, Math.min(1, strength)) * Math.max(0, Math.min(1, cov));
  const pa = p[3] / 255, da = d[3] / 255, oa = da + (pa - da) * k;
  const out = [0, 0, 0, oa * 255];
  
  for (let c = 0; c < 3; c++) out[c] = oa > 1e-6 ? (d[c] * da + (p[c] * pa - d[c] * da) * k) / oa : d[c];
  return out.map(v => clamp255(v));
}



export const TONE_RANGES = ['shadows', 'midtones', 'highlights'];


export function toneWeight(l255, range) {
  if (!TONE_RANGES.includes(range)) throw new Error(`色调范围不认识「${range}」；可用：${TONE_RANGES.join(' / ')}`);
  const t = Math.max(0, Math.min(1, l255 / 255));
  if (range === 'shadows') return Math.max(0, 1 - t * 2) ** 0.75;
  if (range === 'highlights') return Math.max(0, t * 2 - 1) ** 0.75;
  return 1 - Math.abs(t * 2 - 1);
}











export function toneCurve(v, e, mode, range) {
  const k = e / 3;
  let r;
  if (mode === 'dodge') {
    r = range === 'highlights' ? v * (1 + k) : range === 'shadows' ? k + v * (1 - k) : Math.pow(v, 1 / (1 + e));
  } else {
    r = range === 'highlights' ? v * (1 - k) : range === 'shadows' ? (k >= 1 ? 0 : (v - k) / (1 - k)) : Math.pow(v, 1 + e);
  }
  return r < 0 ? 0 : r > 1 ? 1 : r;
}












export function dodgeBurnPixel(rgb, exposure, mode, range = 'midtones', protectTones = false) {
  if (mode !== 'dodge' && mode !== 'burn') throw new Error(`减淡/加深模式不认识「${mode}」；可用：dodge / burn`);
  if (!TONE_RANGES.includes(range)) throw new Error(`色调范围不认识「${range}」；可用：${TONE_RANGES.join(' / ')}`);
  const e = Math.max(0, Math.min(1, exposure));
  if (e <= 0) return [rgb[0], rgb[1], rgb[2]];
  if (!protectTones) return rgb.slice(0, 3).map(v => clamp255(Math.round(toneCurve(v / 255, e, mode, range) * 255)));
  const c = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  const l0 = lum(c), l1 = toneCurve(l0, e, mode, range);
  return setLum(c, l1).map(v => clamp255(Math.round(v * 255)));
}








export function spongePixel(rgb, flow, mode, vibrance = false) {
  if (mode !== 'saturate' && mode !== 'desaturate') throw new Error(`海绵模式不认识「${mode}」；可用：saturate / desaturate`);
  const k0 = Math.max(0, Math.min(1, flow));
  if (k0 <= 0) return [rgb[0], rgb[1], rgb[2]];
  const c = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], L = lum(c);
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), s = mx - mn;
  let f;                                             
  if (mode === 'saturate') {
    let k = vibrance ? k0 * (1 - s) * (1 - s) : k0;
    f = 1 + k;
    if (vibrance && s > 1e-6) {                     
      const lim = Math.min(mx > L ? (1 - L) / (mx - L) : Infinity, mn < L ? L / (L - mn) : Infinity);
      f = Math.min(f, Math.max(1, lim));
    }
  } else {
    f = 1 - (vibrance ? k0 * Math.min(1, s * 2) : k0);
  }
  const out = c.map(v => L + (v - L) * f);
  return (mode === 'saturate' && !vibrance ? clipColor3(out, L) : out).map(v => clamp255(Math.round(v * 255)));
}
function clipColor3(c, l) {
  const n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  let o = c;
  if (n < 0) o = o.map(v => l + (v - l) * l / (l - n));
  if (x > 1) o = o.map(v => l + (v - l) * (1 - l) / (x - l));
  return o;
}





export function retouchModeMix(mode, orig, res) {
  if (!mode || mode === 'normal') return res;
  const o = blendRGB(mode, [orig[0] / 255, orig[1] / 255, orig[2] / 255], [res[0] / 255, res[1] / 255, res[2] / 255]);
  return [clamp255(o[0] * 255), clamp255(o[1] * 255), clamp255(o[2] * 255)];
}
export const RETOUCH_MODES = [['normal', '正常'], ['darken', '变暗'], ['lighten', '变亮'], ['hue', '色相'], ['saturation', '饱和度'], ['color', '颜色'], ['luminosity', '明度']];

export default {
  colorDistance, rgbToHsl, hslToRgb, luma,
  cloneAt, patternAt, backgroundEraseAlpha, replaceColorPixel, REPLACE_MODES,
  boxBlurAt, sharpenAt, smudgeMix, smudgeDab, retouchModeMix, RETOUCH_MODES,
  toneWeight, toneCurve, TONE_RANGES, dodgeBurnPixel, spongePixel,
};
