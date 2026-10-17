





























const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

export function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(l) {
  const c = l <= 0 ? 0 : l >= 1 ? 1 : l;
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
}

export function rgbToOklab(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}

export function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
          linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
          linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}



export const GRADIENT_METHODS = ['perceptual', 'linear', 'classic', 'smooth', 'stripes'];

export const GRADIENT_METHOD_KEYS = { perceptual: 'Perc', linear: 'Lnr ', classic: 'Gcls', smooth: 'Smoo', stripes: 'Stri' };
export const GRADIENT_METHOD_LABELS = { perceptual: '可感知', linear: '线性', classic: '古典', smooth: '平滑', stripes: '条纹' };
export function methodFromKey(k) {
  for (const [m, v] of Object.entries(GRADIENT_METHOD_KEYS)) if (v === k || v.trim() === String(k || '').trim()) return m;
  return null;
}


function midCurve(f, mid) {
  if (!(mid > 0.001 && mid < 0.999) || Math.abs(mid - 0.5) < 1e-3) return f;
  return Math.pow(f, Math.log(0.5) / Math.log(mid));
}

function segOf(stops, t) {
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1].pos) i++;
  return i;
}

function monotoneTangents(xs, ys) {
  const n = xs.length, d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) { const h = xs[i + 1] - xs[i]; d[i] = h > 1e-9 ? (ys[i + 1] - ys[i]) / h : 0; }
  m[0] = d[0] || 0; m[n - 1] = d[n - 2] || 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-12) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return m;
}
function hermite(y0, y1, m0, m1, h, f) {
  const f2 = f * f, f3 = f2 * f;
  return (2 * f3 - 3 * f2 + 1) * y0 + (f3 - 2 * f2 + f) * h * m0 + (-2 * f3 + 3 * f2) * y1 + (f3 - f2) * h * m1;
}


function normStops(list, pick) {
  const s = (list || []).map(pick).filter(Boolean).sort((a, b) => a.pos - b.pos);
  s.forEach(x => { x.pos = clamp01(x.pos); });
  if (s.length === 1) s.push({ ...s[0], pos: 1 });
  return s;
}








export function buildGradientLut(g) {
  const size = Math.max(2, g.size | 0 || 1024);
  const method = GRADIENT_METHODS.includes(g.method) ? g.method : 'classic';
  const smooth = g.smoothness == null ? 1 : clamp01(+g.smoothness);
  const cs = normStops(g.colors, s => s && s.color ? { pos: +s.pos || 0, c: s.color.slice(0, 3).map(Number), mid: s.mid == null ? 0.5 : +s.mid } : null);
  const as = g.transparency === false ? [] : normStops(g.alphas, s => s ? { pos: +s.pos || 0, a: clamp01(+s.a), mid: s.mid == null ? 0.5 : +s.mid } : null);
  const lut = new Float32Array(size * 4);
  if (cs.length < 2) { for (let k = 0; k < size; k++) lut[k * 4 + 3] = 255; return lut; }
  
  const lab = method === 'perceptual' ? cs.map(s => rgbToOklab(s.c[0], s.c[1], s.c[2])) : null;
  const lin = method === 'linear' ? cs.map(s => s.c.map(srgbToLinear)) : null;
  const xs = cs.map(s => s.pos);
  const tan = method === 'classic' && smooth > 0 && cs.length > 2 ? [0, 1, 2].map(ch => monotoneTangents(xs, cs.map(s => s.c[ch]))) : null;
  for (let k = 0; k < size; k++) {
    const t = k / (size - 1), o = k * 4;
    let rgb;
    if (t <= cs[0].pos) rgb = cs[0].c;
    else if (t >= cs[cs.length - 1].pos) rgb = cs[cs.length - 1].c;
    else {
      const i = segOf(cs, t), A = cs[i], B = cs[i + 1], h = B.pos - A.pos;
      let f = h > 1e-9 ? clamp01((t - A.pos) / h) : 1;
      f = midCurve(f, A.mid);
      if (method === 'stripes') rgb = f < 1 ? A.c : B.c;
      else if (method === 'perceptual') {
        const P = lab[i], Q = lab[i + 1];
        rgb = oklabToRgb(P[0] + (Q[0] - P[0]) * f, P[1] + (Q[1] - P[1]) * f, P[2] + (Q[2] - P[2]) * f);
      } else if (method === 'linear') {
        const P = lin[i], Q = lin[i + 1];
        rgb = [0, 1, 2].map(ch => linearToSrgb(P[ch] + (Q[ch] - P[ch]) * f));
      } else if (method === 'smooth') {
        const e = f * f * (3 - 2 * f);
        rgb = [0, 1, 2].map(ch => A.c[ch] + (B.c[ch] - A.c[ch]) * e);
      } else {
        rgb = [0, 1, 2].map(ch => {
          const straight = A.c[ch] + (B.c[ch] - A.c[ch]) * f;
          if (!tan) {
            




            if (method === 'classic' && smooth > 0) {
              const s = f * f * (3 - 2 * f);
              return straight + (A.c[ch] + (B.c[ch] - A.c[ch]) * s - straight) * (smooth * 0.5);
            }
            return straight;
          }
          const curved = hermite(A.c[ch], B.c[ch], tan[ch][i], tan[ch][i + 1], h, f);
          return straight + (curved - straight) * smooth;
        });
      }
    }
    lut[o] = rgb[0] < 0 ? 0 : rgb[0] > 255 ? 255 : rgb[0];
    lut[o + 1] = rgb[1] < 0 ? 0 : rgb[1] > 255 ? 255 : rgb[1];
    lut[o + 2] = rgb[2] < 0 ? 0 : rgb[2] > 255 ? 255 : rgb[2];
    let al = 1;
    if (as.length >= 2) {
      if (t <= as[0].pos) al = as[0].a;
      else if (t >= as[as.length - 1].pos) al = as[as.length - 1].a;
      else {
        const i = segOf(as, t), A = as[i], B = as[i + 1], h = B.pos - A.pos;
        let f = h > 1e-9 ? clamp01((t - A.pos) / h) : 1;
        f = midCurve(f, A.mid);
        if (method === 'stripes') f = f < 1 ? 0 : 1;
        else if (method === 'smooth') f = f * f * (3 - 2 * f);
        al = A.a + (B.a - A.a) * f;
      }
    }
    lut[o + 3] = al * 255;
  }
  return lut;
}








export function buildNoiseLut(n, size = 1024) {
  const rough = clamp01((n && n.roughness != null ? n.roughness : 50) / 100);
  const model = n && n.model || 'rgb';
  const lo = (n && n.min) || [0, 0, 0, 0], hi = (n && n.max) || [100, 100, 100, 100];
  let seed = ((n && n.seed) >>> 0) || 1;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  
  const knots = Math.max(2, Math.round(2 + rough * 62));
  const ch = [0, 1, 2, 3].map(c => {
    const a = Math.min(lo[c] ?? 0, hi[c] ?? 100) / 100, b = Math.max(lo[c] ?? 0, hi[c] ?? 100) / 100;
    const v = []; let cur = a + (b - a) * rnd();
    for (let k = 0; k < knots; k++) { cur = k ? cur + (rnd() - 0.5) * (b - a) * (0.4 + rough * 1.6) : cur; cur = Math.max(a, Math.min(b, cur)); v.push(cur); }
    return v;
  });
  const lut = new Float32Array(size * 4);
  for (let k = 0; k < size; k++) {
    const t = k / (size - 1) * (knots - 1), i = Math.min(knots - 2, Math.floor(t)), f = t - i;
    const v = ch.map(arr => arr[i] + (arr[i + 1] - arr[i]) * f);
    let rgb;
    if (model === 'hsb') rgb = hsbToRgb(v[0] * 360, v[1], v[2]);
    else if (model === 'lab') rgb = labToRgb(v[0] * 100, (v[1] - 0.5) * 256, (v[2] - 0.5) * 256);
    else rgb = [v[0] * 255, v[1] * 255, v[2] * 255];
    if (n && n.restrict) {                       
      const m = (rgb[0] + rgb[1] + rgb[2]) / 3;
      rgb = rgb.map(x => m + (x - m) * 0.85);
    }
    const o = k * 4;
    for (let c = 0; c < 3; c++) lut[o + c] = Math.max(0, Math.min(255, rgb[c]));
    lut[o + 3] = n && n.transparency ? v[3] * 255 : 255;
  }
  return lut;
}
function hsbToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = t => t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;
  const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
  return [linearToSrgb(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
          linearToSrgb(-0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z),
          linearToSrgb(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)];
}





export function ditherNoise(x, y) {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  return (v % 1) - 0.5;
}





export const PAINT_MODES = [
  ['normal', '正常'], ['dissolve', '溶解'], ['behind', '背后'], ['clear', '清除'], null,
  ['darken', '变暗'], ['multiply', '正片叠底'], ['colorBurn', '颜色加深'], ['linearBurn', '线性加深'], ['darkerColor', '深色'], null,
  ['lighten', '变亮'], ['screen', '滤色'], ['colorDodge', '颜色减淡'], ['linearDodge', '线性减淡（添加）'], ['lighterColor', '浅色'], null,
  ['overlay', '叠加'], ['softLight', '柔光'], ['hardLight', '强光'], ['vividLight', '亮光'], ['linearLight', '线性光'], ['pinLight', '点光'], ['hardMix', '实色混合'], null,
  ['difference', '差值'], ['exclusion', '排除'], ['subtract', '减去'], ['divide', '划分'], null,
  ['hue', '色相'], ['saturation', '饱和度'], ['color', '颜色'], ['luminosity', '明度'],
];

const SEP = {
  darken: (b, s) => Math.min(b, s), multiply: (b, s) => b * s,
  colorBurn: (b, s) => b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s),
  linearBurn: (b, s) => Math.max(0, b + s - 1),
  lighten: (b, s) => Math.max(b, s), screen: (b, s) => b + s - b * s,
  colorDodge: (b, s) => b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)),
  linearDodge: (b, s) => Math.min(1, b + s),
  overlay: (b, s) => b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s),
  hardLight: (b, s) => s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s),
  softLight: (b, s) => s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b)
    : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b),
  vividLight: (b, s) => s <= 0.5 ? (s <= 0 ? 0 : Math.max(0, 1 - (1 - b) / (2 * s))) : (s >= 1 ? 1 : Math.min(1, b / (2 * (1 - s)))),
  linearLight: (b, s) => Math.max(0, Math.min(1, b + 2 * s - 1)),
  pinLight: (b, s) => s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1),
  hardMix: (b, s) => b + s >= 1 ? 1 : 0,
  difference: (b, s) => Math.abs(b - s), exclusion: (b, s) => b + s - 2 * b * s,
  subtract: (b, s) => Math.max(0, b - s), divide: (b, s) => s <= 0 ? (b > 0 ? 1 : 0) : Math.min(1, b / s),
};
export const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function clipColor(c) {
  const l = lum(c), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  let o = c;
  if (n < 0) o = o.map(v => l + (v - l) * l / (l - n));
  if (x > 1) o = o.map(v => l + (v - l) * (1 - l) / (x - l));
  return o;
}
export const setLum = (c, l) => { const d = l - lum(c); return clipColor(c.map(v => v + d)); };
const sat = c => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSat(c, s) {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), [mn, md, mx] = idx, o = [0, 0, 0];
  if (c[mx] > c[mn]) { o[md] = (c[md] - c[mn]) * s / (c[mx] - c[mn]); o[mx] = s; }
  return o;
}

export function blendRGB(mode, b, s) {
  const f = SEP[mode];
  if (f) return [f(b[0], s[0]), f(b[1], s[1]), f(b[2], s[2])];
  switch (mode) {
    case 'darkerColor': return lum(s) < lum(b) ? s : b;
    case 'lighterColor': return lum(s) > lum(b) ? s : b;
    case 'hue': return setLum(setSat(s, sat(b)), lum(b));
    case 'saturation': return setLum(setSat(b, sat(s)), lum(b));
    case 'color': return setLum(s, lum(b));
    case 'luminosity': return setLum(b, lum(s));
    default: return s;
  }
}














export function paintBlend(mode, dst, src, cov, rnd) {
  const a = cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
  const ab = dst[3] / 255;
  if (mode === 'clear') return [dst[0], dst[1], dst[2], dst[3] * (1 - a)];
  if (mode === 'behind') {
    const oa = ab + a * (1 - ab);
    if (oa <= 0) return [0, 0, 0, 0];
    return [0, 1, 2].map(c => (dst[c] * ab + src[c] * a * (1 - ab)) / oa).concat(oa * 255);
  }
  let ca = a;
  if (mode === 'dissolve') ca = (rnd == null ? Math.random() : rnd) < a ? 1 : 0;
  if (ca <= 0) return dst.slice(0, 4);
  let cs = src;
  if (mode !== 'normal' && mode !== 'dissolve' && ab > 0) {
    const B = blendRGB(mode, [dst[0] / 255, dst[1] / 255, dst[2] / 255], [src[0] / 255, src[1] / 255, src[2] / 255]);
    cs = [0, 1, 2].map(c => (1 - ab) * src[c] + ab * B[c] * 255);
  }
  const oa = ca + ab * (1 - ca);
  if (oa <= 0) return [0, 0, 0, 0];
  return [0, 1, 2].map(c => (cs[c] * ca + dst[c] * ab * (1 - ca)) / oa).concat(oa * 255);
}

export default { srgbToLinear, linearToSrgb, rgbToOklab, oklabToRgb, GRADIENT_METHODS, GRADIENT_METHOD_KEYS, GRADIENT_METHOD_LABELS,
  methodFromKey, buildGradientLut, buildNoiseLut, ditherNoise, PAINT_MODES, paintBlend, blendRGB, setLum, lum };
