






















import { MORE_FILTERS } from './filters-more.js';
import { cx, gaussianKernel, gaussPremul, convolveSeparable } from './gauss-premul.js';

export { gaussianKernel, gaussPremul };



const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function copyOf(rgba) {
  return rgba instanceof Uint8ClampedArray ? new Uint8ClampedArray(rgba) : Uint8ClampedArray.from(rgba);
}
function checkSize(rgba, width, height, who) {
  if (!rgba || typeof rgba.length !== 'number') throw new Error(`${who}：rgba 必须是类型化数组`);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error(`${who}：width/height 必须是正整数，收到 ${width}×${height}`);
  if (rgba.length !== width * height * 4)
    throw new Error(`${who}：rgba 长度 ${rgba.length} 与 ${width}×${height}×4 = ${width * height * 4} 对不上`);
}



function toPremul(rgba, n) {
  const f = new Float32Array(n * 4);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const a = rgba[o + 3] / 255;
    f[o] = rgba[o] * a; f[o + 1] = rgba[o + 1] * a; f[o + 2] = rgba[o + 2] * a; f[o + 3] = rgba[o + 3];
  }
  return f;
}

function fromPremul(f, out, n) {
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const a = f[o + 3];
    out[o + 3] = clamp255(Math.round(a));
    if (a <= 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; continue; }
    const inv = 255 / a;
    out[o] = clamp255(Math.round(f[o] * inv));
    out[o + 1] = clamp255(Math.round(f[o + 1] * inv));
    out[o + 2] = clamp255(Math.round(f[o + 2] * inv));
  }
}


function convolve3(rgba, w, h, m, divisor, bias) {
  const out = copyOf(rgba);
  const div = divisor || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const o = (cx(y + j, h) * w + cx(x + i, w)) * 4, k = m[(j + 1) * 3 + (i + 1)];
      r += rgba[o] * k; g += rgba[o + 1] * k; b += rgba[o + 2] * k;
    }
    const o2 = (y * w + x) * 4;
    out[o2] = clamp255(Math.round(r / div + bias));
    out[o2 + 1] = clamp255(Math.round(g / div + bias));
    out[o2 + 2] = clamp255(Math.round(b / div + bias));
  }
  return out;
}


function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}




function gaussianBlur(rgba, w, h, p) {
  const r = clamp(+p.radius || 0, 0, 250);
  if (r <= 0) return copyOf(rgba);
  const n = w * h;
  const out = copyOf(rgba);
  fromPremul(gaussPremul(toPremul(rgba, n), w, h, r), out, n);
  return out;
}


function boxBlur(rgba, w, h, p) {
  const r = Math.round(clamp(+p.radius || 0, 0, 250));
  if (r <= 0) return copyOf(rgba);
  const k = new Float32Array(2 * r + 1).fill(1 / (2 * r + 1));
  const n = w * h, out = copyOf(rgba);
  fromPremul(convolveSeparable(toPremul(rgba, n), w, h, k), out, n);
  return out;
}


function motionBlur(rgba, w, h, p) {
  const dist = clamp(+p.distance || 0, 0, 2000);
  if (dist <= 0) return copyOf(rgba);
  const a = (+p.angle || 0) * Math.PI / 180;
  const dx = Math.cos(a), dy = -Math.sin(a);           
  const steps = Math.max(1, Math.round(dist));
  const n = w * h, src = toPremul(rgba, n), acc = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, al = 0;
    for (let s = 0; s < steps; s++) {
      const t = steps === 1 ? 0 : (s / (steps - 1) - 0.5) * dist;   
      const o = (cx(Math.round(y + dy * t), h) * w + cx(Math.round(x + dx * t), w)) * 4;
      r += src[o]; g += src[o + 1]; b += src[o + 2]; al += src[o + 3];
    }
    const o2 = (y * w + x) * 4;
    acc[o2] = r / steps; acc[o2 + 1] = g / steps; acc[o2 + 2] = b / steps; acc[o2 + 3] = al / steps;
  }
  const out = copyOf(rgba);
  fromPremul(acc, out, n);
  return out;
}


function radialBlur(rgba, w, h, p) {
  const amount = clamp(+p.amount || 0, 0, 100);
  if (amount <= 0) return copyOf(rgba);
  const spin = (p.method || 'spin') === 'spin';
  const cxp = p.centerX == null ? w / 2 : +p.centerX;
  const cyp = p.centerY == null ? h / 2 : +p.centerY;
  const steps = Math.max(2, Math.min(64, Math.round(amount / 2) + 2));
  const n = w * h, src = toPremul(rgba, n), acc = new Float32Array(src.length);
  const maxAng = amount / 100 * 0.35;          
  const maxScale = amount / 100 * 0.35;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const vx = x - cxp, vy = y - cyp;
    let r = 0, g = 0, b = 0, al = 0;
    for (let s = 0; s < steps; s++) {
      const t = s / (steps - 1) - 0.5;
      let sx, sy;
      if (spin) { const a = t * maxAng, co = Math.cos(a), si = Math.sin(a);
                  sx = cxp + vx * co - vy * si; sy = cyp + vx * si + vy * co; }
      else { const k = 1 + t * maxScale; sx = cxp + vx * k; sy = cyp + vy * k; }
      const o = (cx(Math.round(sy), h) * w + cx(Math.round(sx), w)) * 4;
      r += src[o]; g += src[o + 1]; b += src[o + 2]; al += src[o + 3];
    }
    const o2 = (y * w + x) * 4;
    acc[o2] = r / steps; acc[o2 + 1] = g / steps; acc[o2 + 2] = b / steps; acc[o2 + 3] = al / steps;
  }
  const out = copyOf(rgba);
  fromPremul(acc, out, n);
  return out;
}


function averageColor(rgba, w, h) {
  let r = 0, g = 0, b = 0, a = 0, wsum = 0;
  const n = w * h;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const al = rgba[o + 3] / 255;
    r += rgba[o] * al; g += rgba[o + 1] * al; b += rgba[o + 2] * al; a += rgba[o + 3]; wsum += al;
  }
  const out = copyOf(rgba);
  const R = wsum > 0 ? Math.round(r / wsum) : 0, G = wsum > 0 ? Math.round(g / wsum) : 0, B = wsum > 0 ? Math.round(b / wsum) : 0;
  const A = Math.round(a / n);
  for (let i = 0, o = 0; i < n; i++, o += 4) { out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A; }
  return out;
}


function unsharpMask(rgba, w, h, p) {
  const amount = clamp(+p.amount || 0, 0, 500) / 100;
  const radius = clamp(p.radius == null ? 1 : +p.radius, 0.1, 250);
  const thr = clamp(Math.round(+p.threshold || 0), 0, 255);
  if (amount <= 0) return copyOf(rgba);
  const blur = gaussianBlur(rgba, w, h, { radius });
  const out = copyOf(rgba);
  for (let o = 0; o < rgba.length; o += 4) {
    for (let c = 0; c < 3; c++) {
      const d = rgba[o + c] - blur[o + c];
      if (Math.abs(d) <= thr) continue;
      out[o + c] = clamp255(Math.round(rgba[o + c] + amount * d));
    }
  }
  return out;
}


function sharpen(rgba, w, h, p) {
  const k = p && p.more ? 1.6 : 0.8;
  const m = [0, -k, 0, -k, 1 + 4 * k, -k, 0, -k, 0];
  return convolve3(rgba, w, h, m, 1, 0);
}


function addNoise(rgba, w, h, p) {
  const amount = clamp(+p.amount || 0, 0, 400) / 100 * 255 / 3;   
  if (amount <= 0) return copyOf(rgba);
  const mono = !!p.monochromatic;
  const gauss = (p.distribution || 'gaussian') === 'gaussian';
  const rand = rng(p.seed == null ? 12345 : p.seed | 0);
  const g2 = () => {                                    
    let u = 0, v = 0;
    while (u <= 1e-12) u = rand();
    v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const out = copyOf(rgba);
  for (let o = 0; o < rgba.length; o += 4) {
    if (mono) {
      const d = (gauss ? g2() : rand() * 2 - 1) * amount;
      for (let c = 0; c < 3; c++) out[o + c] = clamp255(Math.round(rgba[o + c] + d));
    } else {
      for (let c = 0; c < 3; c++) {
        const d = (gauss ? g2() : rand() * 2 - 1) * amount;
        out[o + c] = clamp255(Math.round(rgba[o + c] + d));
      }
    }
  }
  return out;
}


function median(rgba, w, h, p) {
  const r = Math.round(clamp(p.radius == null ? 1 : +p.radius, 0, 16));
  if (r <= 0) return copyOf(rgba);
  const out = copyOf(rgba);
  const size = (2 * r + 1) * (2 * r + 1);
  const buf = new Uint8Array(size);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let k = 0;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++)
        buf[k++] = rgba[(cx(y + j, h) * w + cx(x + i, w)) * 4 + c];
      const arr = buf.slice(0, k).sort();
      out[(y * w + x) * 4 + c] = arr[(k - 1) >> 1];
    }
  }
  return out;
}


function mosaic(rgba, w, h, p) {
  const cell = Math.max(1, Math.round(+p.cell || 1));
  if (cell <= 1) return copyOf(rgba);
  const out = copyOf(rgba);
  for (let by = 0; by < h; by += cell) for (let bx = 0; bx < w; bx += cell) {
    const x1 = Math.min(w, bx + cell), y1 = Math.min(h, by + cell);
    let r = 0, g = 0, b = 0, a = 0, wsum = 0, cnt = 0;
    for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) {
      const o = (y * w + x) * 4, al = rgba[o + 3] / 255;
      r += rgba[o] * al; g += rgba[o + 1] * al; b += rgba[o + 2] * al; a += rgba[o + 3]; wsum += al; cnt++;
    }
    const R = wsum > 0 ? Math.round(r / wsum) : 0, G = wsum > 0 ? Math.round(g / wsum) : 0;
    const B = wsum > 0 ? Math.round(b / wsum) : 0, A = Math.round(a / cnt);
    for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) {
      const o = (y * w + x) * 4;
      out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
    }
  }
  return out;
}


function findEdges(rgba, w, h) {
  const out = copyOf(rgba);
  const GX = [-1, 0, 1, -2, 0, 2, -1, 0, 1], GY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let gx = 0, gy = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const v = rgba[(cx(y + j, h) * w + cx(x + i, w)) * 4 + c], k = (j + 1) * 3 + (i + 1);
        gx += v * GX[k]; gy += v * GY[k];
      }
      out[(y * w + x) * 4 + c] = clamp255(Math.round(255 - Math.hypot(gx, gy)));
    }
  }
  return out;
}


function emboss(rgba, w, h, p) {
  const a = (p.angle == null || p.angle === "" || !Number.isFinite(+p.angle) ? 135 : +p.angle) * Math.PI / 180;
  const height = Math.max(1, Math.round(+p.height || 1));
  const amount = clamp(p.amount == null ? 100 : +p.amount, 1, 500) / 100;
  const dx = Math.round(Math.cos(a) * height), dy = -Math.round(Math.sin(a) * height);
  const out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      const p1 = rgba[(cx(y - dy, h) * w + cx(x - dx, w)) * 4 + c];
      const p2 = rgba[(cx(y + dy, h) * w + cx(x + dx, w)) * 4 + c];
      out[(y * w + x) * 4 + c] = clamp255(Math.round(128 + (p1 - p2) * amount));
    }
  }
  return out;
}


function solarize(rgba) {
  const out = copyOf(rgba);
  for (let o = 0; o < rgba.length; o += 4)
    for (let c = 0; c < 3; c++) {
      const v = rgba[o + c];
      out[o + c] = clamp255(v <= 127 ? v * 2 : (255 - v) * 2);
    }
  return out;
}


function highPass(rgba, w, h, p) {
  const radius = clamp(p.radius == null ? 3 : +p.radius, 0.1, 250);
  const blur = gaussianBlur(rgba, w, h, { radius });
  const out = copyOf(rgba);
  for (let o = 0; o < rgba.length; o += 4)
    for (let c = 0; c < 3; c++) out[o + c] = clamp255(Math.round(128 + rgba[o + c] - blur[o + c]));
  return out;
}


function offset(rgba, w, h, p) {
  const dx = Math.round(+p.dx || 0), dy = Math.round(+p.dy || 0);
  const wrap = p.wrap !== false;
  const out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x - dx, sy = y - dy;
    if (wrap) { sx = ((sx % w) + w) % w; sy = ((sy % h) + h) % h; }
    else { sx = cx(sx, w); sy = cx(sy, h); }
    const s = (sy * w + sx) * 4, o = (y * w + x) * 4;
    out[o] = rgba[s]; out[o + 1] = rgba[s + 1]; out[o + 2] = rgba[s + 2]; out[o + 3] = rgba[s + 3];
  }
  return out;
}


function morph(rgba, w, h, p, isMax) {
  const r = Math.round(clamp(p.radius == null ? 1 : +p.radius, 0, 100));
  if (r <= 0) return copyOf(rgba);
  const out = copyOf(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let best = isMax ? 0 : 255;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const v = rgba[(cx(y + j, h) * w + cx(x + i, w)) * 4 + c];
        if (isMax ? v > best : v < best) best = v;
      }
      out[(y * w + x) * 4 + c] = best;
    }
  }
  return out;
}


function clouds(rgba, w, h, p) {
  const fg = p.foreground || [0, 0, 0], bg = p.background || [255, 255, 255];
  const seed = p.seed == null ? 1 : p.seed | 0;
  const octaves = Math.max(1, Math.min(9, Math.round(+p.octaves || 6)));
  const field = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let oc = 0; oc < octaves; oc++) {
    const cells = 1 << (oc + 1);
    const gw = cells + 1, gh = cells + 1;
    const rand = rng(seed * 2654435761 + oc * 40503);
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    for (let y = 0; y < h; y++) {
      const fy = y / h * cells, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const fx = x / w * cells, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
        const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
        field[y * w + x] += (a + (b - a) * sx + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy) * amp;
      }
    }
    total += amp; amp *= 0.5;
  }
  const out = copyOf(rgba);
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const t = clamp(field[i] / total, 0, 1);
    out[o] = clamp255(Math.round(fg[0] + (bg[0] - fg[0]) * t));
    out[o + 1] = clamp255(Math.round(fg[1] + (bg[1] - fg[1]) * t));
    out[o + 2] = clamp255(Math.round(fg[2] + (bg[2] - fg[2]) * t));
    out[o + 3] = 255;
  }
  return out;
}





const N = (key, label, def, min, max, step, unit, spatial) =>
  ({ key, label, def, min, max, step, unit: unit || '', ...(spatial ? { spatial: true } : {}) });
const B = (key, label, def) => ({ key, label, def, type: 'bool' });
const E = (key, label, def, options) => ({ key, label, def, type: 'enum', options });

export const FILTERS = Object.freeze({
  gaussianBlur: { label: '高斯模糊', group: '模糊', action: 'filter.blur.gaussian',
    params: [N('radius', '半径', 2, 0, 250, 0.1, '像素', true)], apply: gaussianBlur },
  boxBlur: { label: '方框模糊', group: '模糊', action: 'filter.blur.box',
    params: [N('radius', '半径', 4, 0, 250, 1, '像素', true)], apply: boxBlur },
  blur: { label: '模糊', group: '模糊', action: 'filter.blur.blur', params: [],
    apply: (r, w, h) => gaussianBlur(r, w, h, { radius: 0.5 }) },
  blurMore: { label: '进一步模糊', group: '模糊', action: 'filter.blur.more', params: [],
    apply: (r, w, h) => gaussianBlur(r, w, h, { radius: 1 }) },
  motionBlur: { label: '动感模糊', group: '模糊', action: 'filter.blur.motion',
    params: [N('angle', '角度', 0, -180, 180, 1, '度'), N('distance', '距离', 20, 0, 2000, 1, '像素', true)], apply: motionBlur },
  radialBlur: { label: '径向模糊', group: '模糊', action: 'filter.blur.radial',
    params: [N('amount', '数量', 20, 0, 100, 1), E('method', '方法', 'spin', [['spin', '旋转'], ['zoom', '缩放']])],
    apply: radialBlur },
  average: { label: '平均', group: '模糊', action: 'filter.blur.average', params: [], apply: averageColor },

  unsharpMask: { label: 'USM 锐化', group: '锐化', action: 'filter.sharpen.unsharp',
    params: [N('amount', '数量', 100, 0, 500, 1, '%'), N('radius', '半径', 1, 0.1, 250, 0.1, '像素', true), N('threshold', '阈值', 0, 0, 255, 1, '色阶')],
    apply: unsharpMask },
  sharpen: { label: '锐化', group: '锐化', action: 'filter.sharpen.sharpen', params: [], apply: (r, w, h) => sharpen(r, w, h, {}) },
  sharpenMore: { label: '进一步锐化', group: '锐化', action: 'filter.sharpen.more', params: [], apply: (r, w, h) => sharpen(r, w, h, { more: true }) },

  addNoise: { label: '添加杂色', group: '杂色', action: 'filter.noise.add',
    params: [N('amount', '数量', 12, 0, 400, 0.1, '%'),
             E('distribution', '分布', 'gaussian', [['uniform', '平均分布'], ['gaussian', '高斯分布']]),
             B('monochromatic', '单色', false), N('seed', '随机种子', 12345, 0, 999999, 1)],
    apply: addNoise },
  median: { label: '中间值', group: '杂色', action: 'filter.noise.median',
    params: [N('radius', '半径', 1, 0, 16, 1, '像素', true)], apply: median },
  despeckle: { label: '去斑', group: '杂色', action: 'filter.noise.despeckle', params: [],
    apply: (r, w, h) => median(r, w, h, { radius: 1 }) },

  mosaic: { label: '马赛克', group: '像素化', action: 'filter.pixelate.mosaic',
    params: [N('cell', '单元格大小', 10, 1, 200, 1, '方形', true)], apply: mosaic },

  findEdges: { label: '查找边缘', group: '风格化', action: 'filter.stylize.findEdges', params: [], apply: findEdges },
  emboss: { label: '浮雕效果', group: '风格化', action: 'filter.stylize.emboss',
    params: [N('angle', '角度', 135, -180, 180, 1, '度'), N('height', '高度', 3, 1, 100, 1, '像素', true), N('amount', '数量', 100, 1, 500, 1, '%')],
    apply: emboss },
  solarize: { label: '曝光过度', group: '风格化', action: 'filter.stylize.solarize', params: [], apply: solarize },

  highPass: { label: '高反差保留', group: '其它', action: 'filter.other.highPass',
    params: [N('radius', '半径', 3, 0.1, 250, 0.1, '像素', true)], apply: highPass },
  offset: { label: '位移', group: '其它', action: 'filter.other.offset',
    params: [N('dx', '水平', 10, -4000, 4000, 1, '像素', true), N('dy', '垂直', 10, -4000, 4000, 1, '像素', true), B('wrap', '折回', true)],
    apply: offset },
  maximum: { label: '最大值', group: '其它', action: 'filter.other.maximum',
    params: [N('radius', '半径', 1, 0, 100, 1, '像素', true)], apply: (r, w, h, p) => morph(r, w, h, p, true) },
  minimum: { label: '最小值', group: '其它', action: 'filter.other.minimum',
    params: [N('radius', '半径', 1, 0, 100, 1, '像素', true)], apply: (r, w, h, p) => morph(r, w, h, p, false) },

  clouds: { label: '云彩', group: '渲染', action: 'filter.render.clouds', replaces: true, colors: true,
    params: [N('octaves', '细节层数', 6, 1, 9, 1), N('seed', '随机种子', 1, 0, 999999, 1)],
    apply: (r, w, h, p) => clouds(r, w, h, { ...p, foreground: p._fg, background: p._bg }) },
  
  ...MORE_FILTERS,
});

export const FILTER_TYPES = Object.freeze(Object.keys(FILTERS));


export function listFilters() {
  return FILTER_TYPES.map(k => ({
    kind: k, label: FILTERS[k].label, group: FILTERS[k].group, action: FILTERS[k].action,
    replaces: !!FILTERS[k].replaces, colors: !!FILTERS[k].colors,
    params: FILTERS[k].params.map(p => ({ ...p })),
  }));
}


export function filterDefaults(kind) {
  const f = FILTERS[kind];
  if (!f) throw new Error(`未知滤镜「${kind}」；可用：${FILTER_TYPES.join(' ')}`);
  const out = {};
  for (const p of f.params) out[p.key] = p.def;
  return out;
}


export function normalizeFilterParams(kind, params = {}) {
  const f = FILTERS[kind];
  if (!f) throw new Error(`未知滤镜「${kind}」；可用：${FILTER_TYPES.join(' ')}`);
  const out = {};
  for (const p of f.params) {
    const v = params[p.key];
    if (v === undefined || v === null) { out[p.key] = p.def; continue; }
    if (p.type === 'bool') { out[p.key] = !!v; continue; }
    if (p.type === 'color') {
      if (!Array.isArray(v) || v.length < 3 || v.slice(0, 3).some(x => !Number.isFinite(+x)))
        throw new Error(`${f.label}：${p.label} 必须是 [r, g, b]`);
      out[p.key] = v.slice(0, 3).map(x => clamp(Math.round(+x), 0, 255)); continue;
    }
    if (p.type === 'matrix') {
      const n = (p.size || 5) ** 2;
      if (!Array.isArray(v) || v.length !== n || v.some(x => !Number.isFinite(+x)))
        throw new Error(`${f.label}：${p.label} 必须是 ${n} 个数字`);
      out[p.key] = v.map(x => Math.max(-999, Math.min(999, Math.round(+x)))); continue;
    }
    if (p.type === 'enum') {
      const ok = p.options.some(o => o[0] === v);
      if (!ok) throw new Error(`${f.label}：${p.label} 不认识「${v}」；可用：${p.options.map(o => o[0]).join(' / ')}`);
      out[p.key] = v; continue;
    }
    const n = +v;
    if (!Number.isFinite(n)) throw new Error(`${f.label}：${p.label} 必须是数字，收到 ${JSON.stringify(v)}`);
    out[p.key] = clamp(n, p.min, p.max);
  }
  
  const known = new Set(f.params.map(p => p.key));
  const extra = Object.keys(params).filter(k => !known.has(k) && !k.startsWith('_'));
  if (extra.length) throw new Error(`${f.label}：不认识的参数 ${extra.join(' ')}；这一类接受：${[...known].join(' ') || '（无参数）'}`);
  
  for (const k of Object.keys(params)) if (k.startsWith('_')) out[k] = params[k];
  return out;
}








export function applyFilter(kind, rgba, width, height, params) {
  const f = FILTERS[kind];
  if (!f) throw new Error(`未知滤镜「${kind}」；可用：${FILTER_TYPES.join(' ')}`);
  checkSize(rgba, width, height, f.label);
  const p = normalizeFilterParams(kind, params || {});
  const out = f.apply(rgba, width, height, p);
  if (out.length !== rgba.length) throw new Error(`${f.label}：内部错误，输出长度 ${out.length} ≠ ${rgba.length}`);
  return out;
}

export default { FILTERS, FILTER_TYPES, listFilters, filterDefaults, normalizeFilterParams, applyFilter, gaussianKernel };
