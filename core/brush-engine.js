

















const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;






const SIZE_BANDS = [[10, 1], [50, 5], [100, 10], [200, 25], [300, 50], [Infinity, 100]];
export const BRUSH_SIZE_MAX = 5000;
export function bracketStep(size, dir) {
  size = Math.round(size);
  if (dir > 0) {
    for (const [top, step] of SIZE_BANDS) if (size < top) return Math.min(BRUSH_SIZE_MAX, Math.floor(size / step) * step + step);
    return BRUSH_SIZE_MAX;
  }
  for (const [top, step] of SIZE_BANDS) if (size <= top) return Math.max(1, Math.ceil(size / step) * step - step);
  return Math.max(1, size - 100);
}

export function hardnessStep(h, dir) {
  const q = Math.round(h * 100);
  const n = dir > 0 ? Math.floor(q / 25) * 25 + 25 : Math.ceil(q / 25) * 25 - 25;
  return clamp01(n / 100);
}





export const PAINT_MODES = [
  ['normal', '正常'], ['dissolve', '溶解'], ['behind', '背后'], ['clear', '清除'], null,
  ['darken', '变暗'], ['multiply', '正片叠底'], ['colorBurn', '颜色加深'], ['linearBurn', '线性加深'], ['darkerColor', '深色'], null,
  ['lighten', '变亮'], ['screen', '滤色'], ['colorDodge', '颜色减淡'], ['linearDodge', '线性减淡（添加）'], ['lighterColor', '浅色'], null,
  ['overlay', '叠加'], ['softLight', '柔光'], ['hardLight', '强光'], ['vividLight', '亮光'], ['linearLight', '线性光'], ['pinLight', '点光'], ['hardMix', '实色混合'], null,
  ['difference', '差值'], ['exclusion', '排除'], ['subtract', '减去'], ['divide', '划分'], null,
  ['hue', '色相'], ['saturation', '饱和度'], ['color', '颜色'], ['luminosity', '明度'],
];
export const PAINT_MODE_LABEL = Object.fromEntries(PAINT_MODES.filter(Boolean));


function sep(mode, b, s) {
  switch (mode) {
    case 'multiply': return b * s;
    case 'screen': return b + s - b * s;
    case 'darken': return Math.min(b, s);
    case 'lighten': return Math.max(b, s);
    case 'colorBurn': return b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'linearBurn': return Math.max(0, b + s - 1);
    case 'colorDodge': return b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'linearDodge': return Math.min(1, b + s);
    case 'overlay': return b <= .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case 'hardLight': return s <= .5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case 'softLight': {       
      if (s <= .5) return b - (1 - 2 * s) * b * (1 - b);
      const d = b <= .25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      return b + (2 * s - 1) * (d - b);
    }
    case 'vividLight': return s <= .5 ? (s <= 0 ? 0 : Math.max(0, 1 - (1 - b) / (2 * s))) : (s >= 1 ? 1 : Math.min(1, b / (2 * (1 - s))));
    case 'linearLight': return clamp01(b + 2 * s - 1);
    case 'pinLight': return s <= .5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1);
    case 'hardMix': return b + s >= 1 ? 1 : 0;
    case 'difference': return Math.abs(b - s);
    case 'exclusion': return b + s - 2 * b * s;
    case 'subtract': return Math.max(0, b - s);
    case 'divide': return s <= 0 ? (b > 0 ? 1 : 0) : Math.min(1, b / s);
    default: return s;
  }
}

const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
function clipColor(c) {
  const l = lum(c), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  let o = c;
  if (n < 0) o = o.map(v => l + (v - l) * l / (l - n || 1));
  if (x > 1) o = o.map(v => l + (v - l) * (1 - l) / (x - l || 1));
  return o;
}
const setLum = (c, l) => { const d = l - lum(c); return clipColor([c[0] + d, c[1] + d, c[2] + d]); };
const sat = c => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSat(c, s) {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), [mn, md, mx] = idx, o = [0, 0, 0];
  if (c[mx] > c[mn]) { o[md] = (c[md] - c[mn]) * s / (c[mx] - c[mn]); o[mx] = s; }
  return o;
}




export function blendRGB(mode, b, s) {
  if (mode === 'normal' || mode === 'dissolve' || mode === 'behind' || mode === 'clear' || !mode) return s;
  const B = [b[0] / 255, b[1] / 255, b[2] / 255], S = [s[0] / 255, s[1] / 255, s[2] / 255];
  let o;
  if (mode === 'hue') o = setLum(setSat(S, sat(B)), lum(B));
  else if (mode === 'saturation') o = setLum(setSat(B, sat(S)), lum(B));
  else if (mode === 'color') o = setLum(S, lum(B));
  else if (mode === 'luminosity') o = setLum(B, lum(S));
  else if (mode === 'darkerColor') o = lum(S) < lum(B) ? S : B;
  else if (mode === 'lighterColor') o = lum(S) > lum(B) ? S : B;
  else o = [sep(mode, B[0], S[0]), sep(mode, B[1], S[1]), sep(mode, B[2], S[2])];
  return [clamp255(Math.round(o[0] * 255)), clamp255(Math.round(o[1] * 255)), clamp255(Math.round(o[2] * 255))];
}

export function hash01(i, seed) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}








export function compositePaint(out, base, o, color, na, mode, lockAlpha, rnd) {
  const ba = base[o + 3] / 255;
  if (mode === 'clear') {
    if (lockAlpha) return false;
    out[o] = base[o]; out[o + 1] = base[o + 1]; out[o + 2] = base[o + 2];
    out[o + 3] = Math.round(base[o + 3] * (1 - na)); return true;
  }
  if (mode === 'dissolve') { na = rnd < na ? 1 : 0; if (!na) { out[o] = base[o]; out[o + 1] = base[o + 1]; out[o + 2] = base[o + 2]; out[o + 3] = base[o + 3]; return true; } }
  if (mode === 'behind') {
    if (lockAlpha) return false;
    const oa = ba + na * (1 - ba);
    if (oa <= 0) return false;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round((base[o + c] * ba + color[c] * na * (1 - ba)) / oa);
    out[o + 3] = Math.round(oa * 255); return true;
  }
  let E = color;
  if (mode !== 'normal' && mode !== 'dissolve' && ba > 0) {
    const B = blendRGB(mode, [base[o], base[o + 1], base[o + 2]], color);
    E = ba >= 1 ? B : [color[0] + (B[0] - color[0]) * ba, color[1] + (B[1] - color[1]) * ba, color[2] + (B[2] - color[2]) * ba];
  }
  if (lockAlpha) {
    if (ba <= 0) return false;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(base[o + c] + (E[c] - base[o + c]) * na);
    out[o + 3] = base[o + 3]; return true;
  }
  const oa = na + ba * (1 - na);
  if (oa <= 0) { out[o + 3] = 0; return true; }
  for (let c = 0; c < 3; c++) out[o + c] = Math.round((E[c] * na + base[o + c] * ba * (1 - na)) / oa);
  out[o + 3] = Math.round(oa * 255);
  return true;
}





export const BRUSH_PRESETS = [
  { id: 'softRound', label: '柔边圆', group: '常规画笔', tip: 'round', hardness: 0, size: 60 },
  { id: 'hardRound', label: '硬边圆', group: '常规画笔', tip: 'round', hardness: 1, size: 30 },
  { id: 'softRoundPO', label: '柔边圆压力不透明度', group: '常规画笔', tip: 'round', hardness: 0, size: 60, pressureOpacity: true },
  { id: 'hardRoundPO', label: '硬边圆压力不透明度', group: '常规画笔', tip: 'round', hardness: 1, size: 30, pressureOpacity: true },
  { id: 'softRoundPS', label: '柔边圆压力大小', group: '常规画笔', tip: 'round', hardness: 0, size: 60, pressureSize: true },
  { id: 'hardRoundPS', label: '硬边圆压力大小', group: '常规画笔', tip: 'round', hardness: 1, size: 30, pressureSize: true },
  { id: 'square', label: '方头画笔', group: '常规画笔', tip: 'square', hardness: 1, size: 30 },
  { id: 'chalk', label: '粉笔', group: '干介质画笔', tip: 'chalk', hardness: 1, size: 60, spacing: .15 },
  { id: 'charcoal', label: '炭笔（颗粒）', group: '干介质画笔', tip: 'grain', hardness: 1, size: 40, spacing: .1 },
  { id: 'bristle', label: '硬毛刷', group: '湿介质画笔', tip: 'bristle', hardness: 1, size: 60, spacing: .05 },
  { id: 'spatter', label: '喷溅', group: '特殊效果画笔', tip: 'spatter', hardness: 1, size: 60, spacing: .5,
    dyn: { shape: { on: true, sizeJitter: .3, angleJitter: 1 }, scatter: { on: true, amount: 1, count: 1 } } },
  { id: 'star', label: '星形', group: '特殊效果画笔', tip: 'star', hardness: 1, size: 50, spacing: 1.2,
    dyn: { shape: { on: true, sizeJitter: .5, angleJitter: 1 }, scatter: { on: true, amount: 1.5, both: true } } },
];



const TIP_N = 64;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tipCache = new Map();



const sampledTips = new Map();
export function registerSampledTip(key, w, h, data) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = data[i] / 255;
  const tip = { kind: key, n: Math.max(w, h), w, h, data: d, sampled: true, mips: null };
  sampledTips.set(key, tip);
  return tip;
}
export const hasSampledTip = key => sampledTips.has(key);
export function sampledTipInfo(key) { const t = sampledTips.get(key); return t ? { w: t.w, h: t.h } : null; }

export function tipForDiameter(tip, diam) {
  if (!tip || !tip.sampled) return tip;
  let t = tip;
  while (Math.max(t.w, t.h) > Math.max(8, diam * 2) && t.w > 2 && t.h > 2) {
    if (!t.next) {
      const W = t.w >> 1, H = t.h >> 1, d = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = y * 2 * t.w + x * 2;
        d[y * W + x] = (t.data[o] + t.data[o + 1] + t.data[o + t.w] + t.data[o + t.w + 1]) / 4;
      }
      t.next = { kind: t.kind, n: Math.max(W, H), w: W, h: H, data: d, sampled: true };
    }
    t = t.next;
  }
  return t;
}
export function makeTip(kind) {
  if (kind === 'round' || kind === 'square' || !kind) return null;
  if (sampledTips.has(kind)) return sampledTips.get(kind);
  if (tipCache.has(kind)) return tipCache.get(kind);
  const N = TIP_N, d = new Float32Array(N * N), R = rng(kind.length * 7919 + kind.charCodeAt(0));
  const disk = (x, y) => Math.hypot((x + .5) / N * 2 - 1, (y + .5) / N * 2 - 1);
  if (kind === 'chalk' || kind === 'grain') {
    
    const coarse = new Float32Array(N * N).map(() => R()), fine = new Float32Array(N * N).map(() => R());
    const blur = (a, r) => { const o = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const X = (x + i + N) % N, Y = (y + j + N) % N; s += a[Y * N + X]; n++; } o[y * N + x] = s / n; } return o; };
    const c2 = blur(coarse, 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = disk(x, y); if (r >= 1) continue;
      const g = kind === 'grain' ? fine[y * N + x] : (c2[y * N + x] - .5) * 3 + fine[y * N + x] * .6;
      const edge = 1 - Math.pow(r, 3);
      d[y * N + x] = clamp01((g * edge - (kind === 'grain' ? .3 : 0)) * 2.2);
    }
  } else if (kind === 'spatter') {
    for (let k = 0; k < 26; k++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * .8, cx = (Math.cos(a) * rr + 1) / 2 * N, cy = (Math.sin(a) * rr + 1) / 2 * N, s = (.04 + R() * .12) * N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const q = Math.hypot(x + .5 - cx, y + .5 - cy) / s; if (q < 1) d[y * N + x] = Math.max(d[y * N + x], clamp01((1 - q) * 3)); }
    }
  } else if (kind === 'bristle') {
    
    for (let k = 0; k < 22; k++) {
      const cx = (.08 + .84 * R()) * N, w = (.015 + R() * .035) * N, v = .5 + R() * .5, len = .55 + R() * .4;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const q = Math.abs(x + .5 - cx) / w, t = Math.abs((y + .5) / N * 2 - 1) / len;
        if (q < 1 && t < 1) d[y * N + x] = Math.max(d[y * N + x], v * (1 - q * q) * (1 - Math.pow(t, 4)));
      }
    }
  } else if (kind === 'star') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + .5) / N * 2 - 1, v = (y + .5) / N * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
      const lim = .42 + .5 * Math.pow(Math.abs(Math.cos(a * 2.5)), 3);
      d[y * N + x] = clamp01((lim - r) * 20);
    }
  }
  const tip = { kind, n: N, w: N, h: N, data: d };
  tipCache.set(kind, tip);
  return tip;
}

export function sampleTip(tip, u, v) {
  const W = tip.w || tip.n, H = tip.h || tip.n, S = Math.max(W, H);
  const fx = (u + 1) / 2 * S - (S - W) / 2 - .5, fy = (v + 1) / 2 * S - (S - H) / 2 - .5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const g = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : tip.data[y * W + x];
  return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
}

export function tipThumb(kind, hardness, size) {
  const tip = tipForDiameter(makeTip(kind), size), out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    out[y * size + x] = tip ? sampleTip(tip, u, v) : roundCov(kind === 'square' ? Math.max(Math.abs(u), Math.abs(v)) : Math.hypot(u, v), hardness, false);
  }
  return out;
}

export function roundCov(d, hardness, aliased) {
  if (d >= 1) return 0;
  if (aliased) return 1;
  const span = Math.max(1e-6, 1 - hardness);
  const ri = 1 - span;
  let c = d <= ri ? 1 : (1 - d) / span;
  return c * c * (3 - 2 * c);
}




export function defaultDynamics() {
  return {
    shape: { on: false, sizeJitter: 0, sizeCtl: 'off', fadeSteps: 25, minDiameter: 0, angleJitter: 0, angleCtl: 'off', roundJitter: 0, minRound: .25, flipX: false, flipY: false },
    scatter: { on: false, amount: 0, both: false, ctl: 'off', count: 1, countJitter: 0 },
    transfer: { on: false, opJitter: 0, opCtl: 'off', flowJitter: 0, flowCtl: 'off' },
    color: { on: false, perTip: true, fgbg: 0, fgbgCtl: 'off', hue: 0, sat: 0, bri: 0, purity: 0 },
    noise: false, wetEdges: false,
    

    texture: { on: false, pattern: '', patternName: '', invert: false, scale: 1, brightness: 0, contrast: 0,
      eachTip: true, mode: 'multiply', depth: 1, minDepth: 0, depthJitter: 0, depthCtl: 'off' },
    
    dual: { on: false, tip: 'round', hardness: 1, roundness: 1, angle: 0, flip: false, mode: 'multiply', size: 25, spacing: .25, scatter: 0, both: false, count: 1 },
    
    pose: { on: false, tiltX: 0, tiltY: 0, rotation: 0, pressure: 1, overTiltX: false, overTiltY: false, overRotation: false, overPressure: false },
    protectTexture: false,
  };
}

export const TEXTURE_MODES = [['multiply', '正片叠底'], ['subtract', '减去'], ['darken', '变暗'], ['overlay', '叠加'], ['colorDodge', '颜色减淡'],
  ['colorBurn', '颜色加深'], ['linearBurn', '线性加深'], ['hardMix', '实色混合'], ['linearHeight', '线性高度'], ['height', '高度']];
export const DUAL_MODES = [['multiply', '正片叠底'], ['darken', '变暗'], ['overlay', '叠加'], ['colorDodge', '颜色减淡'],
  ['colorBurn', '颜色加深'], ['linearBurn', '线性加深'], ['hardMix', '实色混合']];

export function normalizeDynamics(d) {
  const def = defaultDynamics();
  if (!d) return def;
  for (const k of Object.keys(def)) {
    if (def[k] && typeof def[k] === 'object') d[k] = Object.assign(def[k], d[k] || {});
    else if (d[k] === undefined) d[k] = def[k];
  }
  return d;
}




export function textureHeight(lum255, tex) {
  let t = lum255 / 255;
  t = (t - .5) * (tex.contrast >= 0 ? 1 + tex.contrast / 50 : 1 + tex.contrast / 50) + .5 + tex.brightness / 255;   
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return tex.invert ? 1 - t : t;
}
export function textureCombine(mode, c, t, depth) {
  if (depth <= 0) return c;
  const d = depth > 1 ? 1 : depth, h = 1 - d * (1 - t);        
  switch (mode) {
    case 'subtract': return clamp01(c - d * (1 - t));
    case 'darken': return Math.min(c, h);
    case 'overlay': { const o = c <= .5 ? 2 * c * h : 1 - 2 * (1 - c) * (1 - h); return clamp01(o); }
    case 'colorDodge': return h >= 1 ? c : clamp01(c / (1 - (1 - h) * .999) * h);
    case 'colorBurn': return h <= 0 ? 0 : clamp01(1 - (1 - c) / h);
    case 'linearBurn': return clamp01(c + h - 1);
    case 'hardMix': return c + h >= 1.5 ? c : c * (1 - d);
    case 'linearHeight': return clamp01(c * (t * 2 * d + (1 - d)) - d * (1 - c));
    case 'height': return clamp01((c + t * d) - d);
    default: return c * h;                                        
  }
}

export function dualCombine(mode, a, b) {
  switch (mode) {
    case 'darken': return Math.min(a, b);
    case 'overlay': return clamp01(a <= .5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b));
    case 'colorDodge': return b >= 1 ? (a > 0 ? 1 : 0) : clamp01(a / (1 - b));
    case 'colorBurn': return b <= 0 ? 0 : clamp01(1 - (1 - a) / b);
    case 'linearBurn': return clamp01(a + b - 1);
    case 'hardMix': return a + b >= 1 ? a : 0;
    default: return a * b;
  }
}

function ctlValue(ctl, ctx, fadeSteps) {
  if (ctl === 'pressure') return ctx.pressure;
  if (ctl === 'fade') return Math.max(0, 1 - ctx.index / Math.max(1, fadeSteps));
  
  if (ctl === 'tilt') return 1 - Math.min(1, Math.hypot(ctx.tiltX || 0, ctx.tiltY || 0) / 90);
  if (ctl === 'rotation') return (((ctx.twist || 0) % 360) + 360) % 360 / 360;
  return 1;
}

export function applyPose(dyn, ctx, pen) {
  const po = dyn && dyn.pose;
  const isPen = !!(pen && pen.pen);
  if (!po || !po.on) { ctx.tiltX = isPen ? pen.tiltX || 0 : 0; ctx.tiltY = isPen ? pen.tiltY || 0 : 0; ctx.twist = isPen ? pen.twist || 0 : 0; return ctx; }
  
  ctx.tiltX = isPen && !po.overTiltX ? pen.tiltX || 0 : (po.tiltX || 0) * .9;
  ctx.tiltY = isPen && !po.overTiltY ? pen.tiltY || 0 : (po.tiltY || 0) * .9;
  ctx.twist = isPen && !po.overRotation ? pen.twist || 0 : po.rotation;
  if (!isPen || po.overPressure) ctx.pressure = po.pressure;
  return ctx;
}
const rgbToHsb = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, mx ? d / mx : 0, mx / 255]; };
const hsbToRgb = (h, s, v) => { h = ((h % 1) + 1) % 1; const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]; };





export function dabDynamics(dyn, base, ctx) {
  const R = ctx.rand;
  if (dyn && dyn.pose && dyn.pose.on) applyPose(dyn, ctx, ctx.pen);
  const o = { size: 1, angle: base.angle || 0, round: base.roundness == null ? 1 : base.roundness, flipX: false, flipY: false, flow: 1, opacity: 1, color: null, offsets: [[0, 0]], depth: 1 };
  
  if (dyn && dyn.pose && dyn.pose.on) {
    o.angle -= (ctx.twist || 0) * Math.PI / 180;
    const tilt = Math.min(1, Math.hypot(ctx.tiltX || 0, ctx.tiltY || 0) / 90);
    if (tilt > 0) { o.round *= 1 - .6 * tilt; o.angle += Math.atan2(ctx.tiltY || 0, ctx.tiltX || 1e-9); }
  }
  
  if (base.pressureSize) o.size *= ctx.pressure;
  if (base.pressureOpacity) o.opacity *= ctx.pressure;
  if (!dyn) return o;
  const sh = dyn.shape;
  
  if (sh && sh.flipXFixed) o.flipX = !o.flipX;
  if (sh && sh.flipYFixed) o.flipY = !o.flipY;
  if (sh && sh.on) {
    if (!base.pressureSize && sh.sizeCtl !== 'off') o.size *= Math.max(sh.minDiameter, ctlValue(sh.sizeCtl, ctx, sh.fadeSteps));
    if (sh.sizeJitter > 0) o.size *= Math.max(sh.minDiameter, 1 - sh.sizeJitter * R());
    if (sh.angleCtl === 'direction') o.angle += ctx.dir || 0;
    else if (sh.angleCtl === 'initial') o.angle += ctx.dir0 || 0;
    else if (sh.angleCtl === 'fade') o.angle += (1 - ctlValue('fade', ctx, sh.fadeSteps)) * Math.PI * 2;
    else if (sh.angleCtl === 'tilt') o.angle += Math.atan2(ctx.tiltY || 0, ctx.tiltX || 1e-9);
    else if (sh.angleCtl === 'rotation') o.angle -= (ctx.twist || 0) * Math.PI / 180;
    if (sh.roundCtl && sh.roundCtl !== 'off') o.round *= Math.max(sh.minRound, ctlValue(sh.roundCtl, ctx, sh.fadeSteps));
    if (sh.angleJitter > 0) o.angle += (R() * 2 - 1) * sh.angleJitter * Math.PI;
    if (sh.roundJitter > 0) o.round *= Math.max(sh.minRound, 1 - sh.roundJitter * R());
    if (sh.flipX && R() < .5) o.flipX = !o.flipX;
    if (sh.flipY && R() < .5) o.flipY = !o.flipY;
  }
  const tr = dyn.transfer;
  if (tr && tr.on) {
    if (!base.pressureOpacity && tr.opCtl !== 'off') o.opacity *= ctlValue(tr.opCtl, ctx, 25);
    if (tr.opJitter > 0) o.opacity *= 1 - tr.opJitter * R();
    if (tr.flowCtl !== 'off') o.flow *= ctlValue(tr.flowCtl, ctx, 25);
    if (tr.flowJitter > 0) o.flow *= 1 - tr.flowJitter * R();
  }
  const sc = dyn.scatter;
  if (sc && sc.on && (sc.amount > 0 || sc.count > 1)) {
    const n = Math.max(1, Math.round(sc.count * (1 - (sc.countJitter || 0) * R())));
    const amt = sc.amount * (sc.ctl === 'pressure' ? ctx.pressure : 1);
    o.offsets = [];
    const nx = -Math.sin(ctx.dir || 0), ny = Math.cos(ctx.dir || 0);   
    for (let k = 0; k < n; k++) {
      const a = (R() * 2 - 1) * amt / 2, b = sc.both ? (R() * 2 - 1) * amt / 2 : 0;
      
      o.offsets.push([nx * a + Math.cos(ctx.dir || 0) * b, ny * a + Math.sin(ctx.dir || 0) * b]);
    }
  }
  const tx = dyn.texture;
  if (tx && tx.on && tx.eachTip) {
    
    let dp = tx.depth;
    if (tx.depthCtl && tx.depthCtl !== 'off') dp *= Math.max(tx.minDepth, ctlValue(tx.depthCtl, ctx, 25));
    if (tx.depthJitter > 0) dp *= Math.max(tx.minDepth, 1 - tx.depthJitter * R());
    o.depth = dp;
  } else if (tx && tx.on) o.depth = tx.depth;
  const cd = dyn.color;
  if (cd && cd.on && base.fg) {
    let c = base.fg;
    if (cd.fgbg > 0 && base.bg) { const t = cd.fgbg * R(); c = [0, 1, 2].map(i => Math.round(base.fg[i] + (base.bg[i] - base.fg[i]) * t)); }
    let [h, s, v] = rgbToHsb(c[0], c[1], c[2]);
    if (cd.hue > 0) h += (R() * 2 - 1) * cd.hue / 2;
    if (cd.sat > 0) s = clamp01(s + (R() * 2 - 1) * cd.sat);
    if (cd.bri > 0) v = clamp01(v + (R() * 2 - 1) * cd.bri);
    if (cd.purity) s = clamp01(s + cd.purity);
    o.color = hsbToRgb(h, s, v);
  }
  return o;
}



export function textureLum(pat) {
  const w = pat.width, h = pat.height, lum = new Uint8Array(w * h), d = pat.rgba;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4, a = d[o + 3] / 255, l = .299 * d[o] + .587 * d[o + 1] + .114 * d[o + 2];
    lum[i] = Math.round(l * a + 255 * (1 - a));
  }
  return { w, h, lum };
}

export function textureAt(T, tex, x, y) {
  const sc = Math.max(.01, tex.scale || 1);
  let u = Math.floor(x / sc) % T.w, v = Math.floor(y / sc) % T.h;
  if (u < 0) u += T.w; if (v < 0) v += T.h;
  return textureHeight(T.lum[v * T.w + u], tex);
}





export function stampMask(mask, w, h, M, inv, cx, cy, r, tip, hardness, cos, sin, round, square, flip) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [ax, ay] of [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]]) {
    const sx = inv[0] * ax + inv[2] * ay + inv[4], sy = inv[1] * ax + inv[3] * ay + inv[5];
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(h - 1, Math.ceil(y1));
  const t = tip && tip.sampled ? tipForDiameter(tip, r * 2) : tip, span = Math.max(1e-3, 1 - (hardness == null ? 1 : hardness));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = M[0] * (x + .5) + M[2] * (y + .5) + M[4], py = M[1] * (x + .5) + M[3] * (y + .5) + M[5];
    const dx = px - cx, dy = py - cy;
    const u = (flip ? -1 : 1) * (dx * cos + dy * sin) / r, v = (-dx * sin + dy * cos) / (r * round);
    let c;
    if (t) { if (u <= -1 || u >= 1 || v <= -1 || v >= 1) continue; c = sampleTip(t, u, v); }
    else {
      const dn = square ? Math.max(Math.abs(u), Math.abs(v)) : Math.sqrt(u * u + v * v);
      if (dn >= 1) continue;
      c = dn <= 1 - span ? 1 : (1 - dn) / span; c = c * c * (3 - 2 * c);
    }
    const i = y * w + x; if (c > mask[i]) mask[i] = c;
  }
}






export const SYMMETRY_TYPES = [
  ['vertical', '垂直', 'symVertical'], ['horizontal', '水平', 'symHorizontal'], ['dual', '双轴', 'symDual'],
  ['diagonal', '对角', 'symDiagonal'], ['wavy', '波纹', 'symWavy'], ['circle', '圆形', 'symCircle'],
  ['spiral', '螺线', 'symSpiral'], ['parallel', '平行线', 'symParallel'], ['radial', '径向', 'symRadial'], ['mandala', '曼陀罗', 'symMandala'],
];
export function symmetryMaps(sym) {
  if (!sym || !sym.type) return [{ f: (x, y) => [x, y], mirror: false, rot: 0 }];
  const cx = sym.cx, cy = sym.cy, th = (sym.angle || 0) * Math.PI / 180;
  const rot = a => (x, y) => { const dx = x - cx, dy = y - cy, c = Math.cos(a), s = Math.sin(a); return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
  
  const mir = phi => (x, y) => { const dx = x - cx, dy = y - cy, c = Math.cos(2 * phi), s = Math.sin(2 * phi); return [cx + dx * c + dy * s, cy + dx * s - dy * c]; };
  const id = { f: (x, y) => [x, y], mirror: false, rot: 0 };
  const M = [id];
  switch (sym.type) {
    case 'vertical': M.push({ f: mir(th + Math.PI / 2), mirror: true, phi: th + Math.PI / 2 }); break;
    case 'horizontal': M.push({ f: mir(th), mirror: true, phi: th }); break;
    case 'dual': M.push({ f: mir(th + Math.PI / 2), mirror: true, phi: th + Math.PI / 2 }, { f: mir(th), mirror: true, phi: th }, { f: rot(Math.PI), mirror: false, rot: Math.PI }); break;
    case 'diagonal': M.push({ f: mir(th + Math.PI / 4), mirror: true, phi: th + Math.PI / 4 }); break;
    case 'parallel': {
      
      const gap = Math.max(4, (sym.gap || 200) * (sym.scale || 1)), n = Math.max(1, sym.segments || 3);
      const ax = Math.cos(th), ay = Math.sin(th);   
      for (let k = -n; k <= n; k++) {
        if (!k) continue;
        const odd = Math.abs(k) % 2 === 1, t = k * gap;
        
        if (odd) { const m = mir(th + Math.PI / 2); M.push({ f: (x, y) => { const [a, b] = m(x, y); return [a + ax * t, b + ay * t]; }, mirror: true, phi: th + Math.PI / 2 }); }
        else M.push({ f: (x, y) => [x + ax * t, y + ay * t], mirror: false, rot: 0 });
      }
      break;
    }
    case 'circle': {
      
      const R0 = Math.max(4, (sym.radius || 200) * (sym.scale || 1));
      M.push({ f: (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1e-6, r2 = 2 * R0 - r; return [cx + dx / r * r2, cy + dy / r * r2]; }, mirror: true, phi: null });
      break;
    }
    case 'radial': case 'mandala': {
      const n = Math.max(2, Math.min(12, sym.segments || 5));
      for (let k = 1; k < n; k++) M.push({ f: rot(k * 2 * Math.PI / n), mirror: false, rot: k * 2 * Math.PI / n });
      if (sym.type === 'mandala') for (let k = 0; k < n; k++) {
        const phi = th + k * Math.PI / n;
        M.push({ f: mir(phi), mirror: true, phi });
      }
      break;
    }
    case 'wavy': {
      

      const w = wavyParams(sym), c = Math.cos(th), s2 = Math.sin(th);
      const toAx = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * c + dy * s2, -dx * s2 + dy * c]; };
      const fromAx = (u, v) => [cx + u * c - v * s2, cy + u * s2 + v * c];
      M.push({ f: (x, y) => { const [u, v] = toAx(x, y); return fromAx(u, 2 * w.f(u) - v); }, mirror: true,
        phiFn: (x, y) => { const [u] = toAx(x, y); return th + Math.atan(w.df(u)); } });
      break;
    }
    case 'spiral': {
      

      const n = Math.max(2, Math.min(12, sym.segments || 6)), k = Math.max(.3, Math.min(.98, sym.shrink || .8));
      for (let i = 1; i < n; i++) {
        const a = i * 2 * Math.PI / n, sc = Math.pow(k, i), ca = Math.cos(a), sa = Math.sin(a);
        M.push({ f: (x, y) => { const dx = x - cx, dy = y - cy; return [cx + (dx * ca - dy * sa) * sc, cy + (dx * sa + dy * ca) * sc]; }, mirror: false, rot: a, scale: sc });
      }
      break;
    }
    default: return [id];
  }
  return M;
}

export function wavyParams(sym) {
  const sc = sym.scale || 1, A = (sym.amp || 60) * sc, L = Math.max(8, (sym.wavelength || 300) * sc), k = 2 * Math.PI / L;
  return { A, L, f: u => A * Math.sin(u * k), df: u => A * k * Math.cos(u * k) };
}

export function spiralPath(sym, R) {
  const n = Math.max(2, Math.min(12, sym.segments || 6)), k = Math.max(.3, Math.min(.98, sym.shrink || .8));
  const b = Math.log(1 / k) / (2 * Math.PI / n), th = (sym.angle || 0) * Math.PI / 180, pts = [];
  const r0 = Math.max(4, (sym.radius || 200) * (sym.scale || 1));
  for (let t = 0; t < 40; t += .05) { const r = r0 * Math.exp(-b * t); if (r < 1) break; pts.push([sym.cx + Math.cos(th + t) * r, sym.cy + Math.sin(th + t) * r]); }
  for (let t = 0; t > -40; t -= .05) { const r = r0 * Math.exp(-b * t); if (r > R) break; pts.unshift([sym.cx + Math.cos(th + t) * r, sym.cy + Math.sin(th + t) * r]); }
  return pts;
}












export class Smoother {
  constructor(opts) {
    this.o = opts;                    
    this.p = null; this.t = null; this.win = [];
    this.k = Math.max(1, Math.round(1 + opts.amount * 24));   
  }
  get radius() { return this.o.radiusDoc; }
  start(pt) { this.p = { ...pt }; this.t = { ...pt }; this.win = [{ ...pt }]; return this.p; }
  feed(pt) {
    this.t = { ...pt };
    return this.step(false);
  }
  
  step(idle) {
    const p = this.p, t = this.t;
    if (!p || !t) return null;
    if (this.o.pulled) {
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), R = this.o.radiusDoc;
      if (d <= R || d < 1e-3) return null;
      const k = (d - R) / d;
      p.x += dx * k; p.y += dy * k; p.p = t.p;
      return { ...p };
    }
    this.win.push({ ...t });
    while (this.win.length > this.k) this.win.shift();
    let x = 0, y = 0; for (const q of this.win) { x += q.x; y += q.y; }
    x /= this.win.length; y /= this.win.length;
    if (Math.hypot(x - p.x, y - p.y) < 1e-3) return null;
    p.x = x; p.y = y; p.p = t.p;
    return { ...p };
  }
  
  get lagging() { return !!(this.p && this.t && !this.o.pulled && Math.hypot(this.t.x - this.p.x, this.t.y - this.p.y) > .5); }
}




export const MIXER_PRESETS = [
  ['custom', '自定', null],
  ['dry', '干燥', [0, 50, 0]], ['dryLight', '干燥，浅描', [0, 1, 0]], ['dryHeavy', '干燥，深描', [0, 100, 0]],
  ['moist', '湿润', [10, 50, 50]], ['moistLight', '湿润，浅混合', [10, 50, 20]], ['moistHeavy', '湿润，深混合', [10, 50, 90]],
  ['wet', '潮湿', [50, 50, 50]], ['wetLight', '潮湿，浅混合', [50, 50, 20]], ['wetHeavy', '潮湿，深混合', [50, 50, 90]],
  ['veryWet', '非常潮湿', [100, 50, 50]], ['veryWetLight', '非常潮湿，浅混合', [100, 50, 20]], ['veryWetHeavy', '非常潮湿，深混合', [100, 50, 90]],
];




export const ART_STYLES = [
  ['tightShort', '绷紧短', { len: .6, tight: 1, curl: 0 }], ['tightMedium', '绷紧中', { len: 1.2, tight: 1, curl: 0 }],
  ['tightLong', '绷紧长', { len: 2.4, tight: 1, curl: 0 }], ['looseMedium', '松散中等', { len: 1.2, tight: .3, curl: 0 }],
  ['looseLong', '松散长', { len: 2.4, tight: .3, curl: 0 }], ['dab', '轻涂', { len: .15, tight: 0, curl: 0 }],
  ['tightCurl', '绷紧卷曲', { len: 1.2, tight: 1, curl: 1 }], ['tightCurlLong', '绷紧卷曲长', { len: 2.4, tight: 1, curl: 1 }],
  ['looseCurl', '松散卷曲', { len: 1.2, tight: .3, curl: 1 }], ['looseCurlLong', '松散卷曲长', { len: 2.4, tight: .3, curl: 1 }],
];








export function regionMask(w, h, x0, y0, x1, y1, sx, sy, match, edge) {
  const W = x1 - x0 + 1, H = y1 - y0 + 1, out = new Uint8Array(W * H);
  if (sx < x0 || sy < y0 || sx > x1 || sy > y1) return out;
  const st = [(sy - y0) * W + (sx - x0)];
  const gi = k => (y0 + ((k / W) | 0)) * w + x0 + (k % W);
  if (!match(gi(st[0]))) return out;
  out[st[0]] = 1;
  while (st.length) {
    const k = st.pop(), x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const n = Y * W + X; if (out[n]) continue;
      const g = gi(n);
      if (!match(g) || (edge && edge(g))) continue;
      out[n] = 1; st.push(n);
    }
  }
  return out;
}

export const tolPct255 = p => Math.round(Math.max(0, Math.min(100, p)) * 2.55);
