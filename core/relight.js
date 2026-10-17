





import { buildRelightFaceGeometry, applyRelightFaceNormals } from './relight-face-geometry.js';
export { renderRelightLighting as renderRelight } from './relight-lighting.js';

export const RELIGHT_DEFAULTS = Object.freeze({
  x: -0.65, y: -0.7, depth: 0.25, intensity: 20, diffusion: 50,
  color: Object.freeze([255, 255, 255]), enabled: true, originalLighting: 75, blend: 1,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const linear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const srgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
const LINEAR_BYTE = Float32Array.from({ length: 256 }, (_, i) => linear(i / 255));

function validateImage(rgba, w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || !rgba || rgba.length !== w * h * 4) {
    throw new Error('重新打光：图像尺寸不正确');
  }
}

function validateMaps(maps) {
  const n = maps?.width * maps?.height;
  if (!Number.isInteger(maps?.width) || !Number.isInteger(maps?.height) || maps.width < 1 || maps.height < 1 ||
      maps.albedo?.length !== n * 3 || maps.normals?.length !== n * 3 || maps.depth?.length !== n || maps.shading?.length !== n) {
    throw new Error('重新打光：AI 分析数据不正确');
  }
}

function sample(arr, width, height, x, y, channels, channel = 0) {
  const xx = clamp(x, 0, width - 1), yy = clamp(y, 0, height - 1);
  const x0 = Math.floor(xx), y0 = Math.floor(yy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = xx - x0, ty = yy - y0;
  const a = arr[(y0 * width + x0) * channels + channel], b = arr[(y0 * width + x1) * channels + channel];
  const c = arr[(y1 * width + x0) * channels + channel], d = arr[(y1 * width + x1) * channels + channel];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function lampsFrom(params) {
  const raw = Array.isArray(params.lights) ? params.lights.slice(0, 3) : [{ ...RELIGHT_DEFAULTS, ...params }];
  return raw.map(value => {
    const lamp = value && typeof value === 'object' ? value : {};
    const color = Array.isArray(lamp.color) || ArrayBuffer.isView(lamp.color) ? lamp.color : RELIGHT_DEFAULTS.color;
    return {
      x: clamp(finite(lamp.x, RELIGHT_DEFAULTS.x), -2, 2), y: clamp(finite(lamp.y, RELIGHT_DEFAULTS.y), -2, 2),
      depth: clamp(finite(lamp.depth, RELIGHT_DEFAULTS.depth), 0, 1),
      intensity: clamp(finite(lamp.intensity, RELIGHT_DEFAULTS.intensity), 0, 100),
      diffusion: clamp(finite(lamp.diffusion, RELIGHT_DEFAULTS.diffusion), 0, 100), enabled: lamp.enabled !== false,
      color: [0, 1, 2].map(c => linear(clamp(finite(color[c], 255), 0, 255) / 255)),
    };
  });
}






export function decodeRelightOutput(data, inputWidth, inputHeight, width = inputWidth, height = inputHeight) {
  const plane = inputWidth * inputHeight;
  if (![inputWidth, inputHeight, width, height].every(Number.isInteger) || plane < 1 || data?.length !== plane * 8 || width > inputWidth || height > inputHeight || width < 1 || height < 1) {
    throw new Error('重新打光：模型输出尺寸不正确');
  }
  const n = width * height;
  const maps = { width, height, albedo: new Float32Array(n * 3), depth: new Float32Array(n), normals: new Float32Array(n * 3), shading: new Float32Array(n) };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = y * inputWidth + x, dst = y * width + x;
    for (let c = 0; c < 3; c++) maps.albedo[dst * 3 + c] = clamp((finite(data[c * plane + src], 0) + 1) / 2, 0, 1);
    maps.depth[dst] = clamp((finite(data[3 * plane + src], 0) + 1) / 2, 0, 1);
    let nx = finite(data[4 * plane + src], 0), ny = finite(data[5 * plane + src], 0), nz = finite(data[6 * plane + src], 1);
    let length = Math.hypot(nx, ny, nz);
    if (length < 1e-6) { nx = 0; ny = 0; nz = 1; length = 1; }
    maps.normals[dst * 3] = nx / length; maps.normals[dst * 3 + 1] = ny / length; maps.normals[dst * 3 + 2] = nz / length;
    maps.shading[dst] = clamp((finite(data[7 * plane + src], 0) + 1) / 2, 0, 1);
  }
  return maps;
}


export function prepareRelightInput(rgba, w, h, maxSide = 640) {
  validateImage(rgba, w, h);
  const scale = Math.min(1, clamp(finite(maxSide, 640), 64, 768) / Math.max(w, h));
  const width = Math.max(32, Math.round(w * scale / 32) * 32), height = Math.max(32, Math.round(h * scale / 32) * 32);
  
  const inputWidth = width, inputHeight = height;
  const plane = inputWidth * inputHeight, data = new Float32Array(plane * 3);
  for (let y = 0; y < inputHeight; y++) for (let x = 0; x < inputWidth; x++) {
    const sx = (Math.min(x, width - 1) + 0.5) * w / width - 0.5;
    const sy = (Math.min(y, height - 1) + 0.5) * h / height - 0.5;
    
    const xx = clamp(sx, 0, w - 1), yy = clamp(sy, 0, h - 1);
    const x0 = Math.floor(xx), y0 = Math.floor(yy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = xx - x0, ty = yy - y0;
    const indices = [(y0 * w + x0) * 4, (y0 * w + x1) * 4, (y1 * w + x0) * 4, (y1 * w + x1) * 4];
    const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    for (let c = 0; c < 3; c++) {
      let value = 0;
      for (let k = 0; k < 4; k++) {
        const i = indices[k], alpha = rgba[i + 3] / 255;
        value += (rgba[i + c] / 255 * alpha + 0.5 * (1 - alpha)) * weights[k];
      }
      data[c * plane + y * inputWidth + x] = value * 2 - 1;
    }
  }
  return { data, width, height, inputWidth, inputHeight };
}


export function prepareRelightWorkingImage(rgba, sourceWidth, sourceHeight, maxSide = 1024) {
  validateImage(rgba, sourceWidth, sourceHeight);
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight)), width = Math.max(1, Math.round(sourceWidth * scale)), height = Math.max(1, Math.round(sourceHeight * scale)), n = width * height;
  const sums = new Float64Array(n * 4), counts = new Uint32Array(n);
  for (let y = 0; y < sourceHeight; y++) {
    const row = Math.min(height - 1, Math.floor(y * height / sourceHeight)) * width;
    for (let x = 0; x < sourceWidth; x++) {
      const src = (y * sourceWidth + x) * 4, dst = row + Math.min(width - 1, Math.floor(x * width / sourceWidth)), a = rgba[src + 3] / 255;
      counts[dst]++;
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) sums[dst * 4 + c] += rgba[src + c] / 255 * a;
      sums[dst * 4 + 3] += a;
    }
  }
  const encodedRGB = new Float32Array(n * 3), alpha = new Float32Array(n), rgba8 = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const weight = sums[i * 4 + 3]; alpha[i] = Math.min(1, weight / Math.max(1, counts[i]));
    for (let c = 0; c < 3; c++) { encodedRGB[i * 3 + c] = weight > 1e-9 ? clamp(sums[i * 4 + c] / weight, 0, 1) : 0; rgba8[i * 4 + c] = Math.round(encodedRGB[i * 3 + c] * 255); }
    rgba8[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  return { width, height, encodedRGB, alpha, rgba8 };
}

const IMAGE_MEAN = [0.485, 0.456, 0.406], IMAGE_STD = [0.229, 0.224, 0.225];
function cubicWeight(x) {
  const a = Math.abs(x);
  return a <= 1 ? (1.5 * a - 2.5) * a * a + 1 : a < 2 ? ((-0.5 * a + 2.5) * a - 4) * a + 2 : 0;
}


export function prepareGeometryInput(rgba, w, h, model) {
  validateImage(rgba, w, h);
  if (model !== 'depth' && model !== 'normals') throw new Error('重新打光：未知几何模型');
  const forDepth = model === 'depth';
  
  
  const scaleWidth = 518 / w, scaleHeight = 518 / h;
  const scale = forDepth ? (Math.abs(1 - scaleWidth) < Math.abs(1 - scaleHeight) ? scaleWidth : scaleHeight) : Math.min(1, 518 / Math.max(w, h));
  const width = forDepth ? Math.max(14, Math.round(w * scale / 14) * 14) : Math.max(1, Math.round(w * scale));
  const height = forDepth ? Math.max(14, Math.round(h * scale / 14) * 14) : Math.max(1, Math.round(h * scale));
  const plane = width * height, data = new Float32Array(plane * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = (x + 0.5) * w / width - 0.5, sy = (y + 0.5) * h / height - 0.5;
    const bx = Math.floor(sx), by = Math.floor(sy);
    const color = [0, 0, 0]; let total = 0;
    for (let dy = forDepth ? -1 : 0; dy <= (forDepth ? 2 : 1); dy++) for (let dx = forDepth ? -1 : 0; dx <= (forDepth ? 2 : 1); dx++) {
      const weight = forDepth ? cubicWeight(sx - bx - dx) * cubicWeight(sy - by - dy) :
        (dx ? sx - bx : 1 - sx + bx) * (dy ? sy - by : 1 - sy + by);
      const xx = clamp(bx + dx, 0, w - 1), yy = clamp(by + dy, 0, h - 1), i = (yy * w + xx) * 4;
      const alpha = rgba[i + 3] / 255;
      for (let c = 0; c < 3; c++) color[c] += (rgba[i + c] / 255 * alpha + 0.5 * (1 - alpha)) * weight;
      total += weight;
    }
    for (let c = 0; c < 3; c++) {
      const value = clamp(color[c] / Math.max(total, 1e-6), 0, 1);
      data[c * plane + y * width + x] = forDepth ? (value - IMAGE_MEAN[c]) / IMAGE_STD[c] : value;
    }
  }
  return { data, width, height, inputWidth: width, inputHeight: height };
}


export function decodeDepthOutput(data, width, height, targetWidth = width, targetHeight = height) {
  if (![width, height, targetWidth, targetHeight].every(v => Number.isInteger(v) && v > 0) || data?.length !== width * height) {
    throw new Error('重新打光：深度模型输出尺寸不正确');
  }
  const stride = Math.max(1, Math.floor(data.length / 16384));
  const quantiles = [];
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i])) throw new Error('重新打光：深度模型返回无效数值');
    if (i % stride === 0) quantiles.push(data[i]);
  }
  quantiles.sort((a, b) => a - b);
  const lo = quantiles[Math.floor((quantiles.length - 1) * 0.02)], hi = quantiles[Math.ceil((quantiles.length - 1) * 0.98)];
  const depth = new Float32Array(targetWidth * targetHeight);
  if (hi - lo < 1e-6) { depth.fill(0.5); return depth; }
  for (let y = 0; y < targetHeight; y++) for (let x = 0; x < targetWidth; x++) {
    const v = sample(data, width, height, (x + 0.5) * width / targetWidth - 0.5, (y + 0.5) * height / targetHeight - 0.5, 1);
    depth[y * targetWidth + x] = 1 - clamp((v - lo) / (hi - lo), 0, 1);
  }
  return depth;
}


export function decodeMogeNormals(data, mask, width, height, targetWidth = width, targetHeight = height) {
  if (![width, height, targetWidth, targetHeight].every(v => Number.isInteger(v) && v > 0) || data?.length !== width * height * 3 || mask?.length !== width * height) {
    throw new Error('重新打光：法线模型输出尺寸不正确');
  }
  for (const value of data) if (!Number.isFinite(value)) throw new Error('重新打光：法线模型返回无效数值');
  const normals = new Float32Array(targetWidth * targetHeight * 3), validity = new Float32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) for (let x = 0; x < targetWidth; x++) {
    const sx = (x + 0.5) * width / targetWidth - 0.5, sy = (y + 0.5) * height / targetHeight - 0.5, i = y * targetWidth + x;
    const confidence = clamp(finite(sample(mask, width, height, sx, sy, 1), 0), 0, 1);
    let nx = sample(data, width, height, sx, sy, 3), ny = sample(data, width, height, sx, sy, 3, 1), nz = Math.min(-0.02, sample(data, width, height, sx, sy, 3, 2));
    let norm = Math.hypot(nx, ny, nz);
    
    if (norm < 1e-6) { nx = 0; ny = 0; nz = -1; norm = 1; }
    normals[i * 3] = nx / norm; normals[i * 3 + 1] = ny / norm; normals[i * 3 + 2] = nz / norm;
    validity[i] = confidence;
  }
  return { normals, validity };
}

const smoothstep = (lo, hi, value) => { const t = clamp((value - lo) / Math.max(1e-9, hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const luminance = (r, g, b) => r * 0.2126 + g * 0.7152 + b * 0.0722;

function boxMean(values, w, h, radius) {
  const r = Math.max(1, Math.round(radius)), horizontal = new Float32Array(values.length), result = new Float32Array(values.length);
  for (let y = 0; y < h; y++) {
    let sum = 0; for (let x = 0; x <= Math.min(r, w - 1); x++) sum += values[y * w + x];
    for (let x = 0; x < w; x++) {
      horizontal[y * w + x] = sum / (Math.min(w - 1, x + r) - Math.max(0, x - r) + 1);
      if (x - r >= 0) sum -= values[y * w + x - r];
      if (x + r + 1 < w) sum += values[y * w + x + r + 1];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0; for (let y = 0; y <= Math.min(r, h - 1); y++) sum += horizontal[y * w + x];
    for (let y = 0; y < h; y++) {
      result[y * w + x] = sum / (Math.min(h - 1, y + r) - Math.max(0, y - r) + 1);
      if (y - r >= 0) sum -= horizontal[(y - r) * w + x];
      if (y + r + 1 < h) sum += horizontal[(y + r + 1) * w + x];
    }
  }
  return result;
}

export function relightGuidedFilter(guide, signal, w, h, radius, epsilon) {
  const n = w * h, meanI = boxMean(guide, w, h, radius), meanP = boxMean(signal, w, h, radius);
  const squared = new Float32Array(n), product = new Float32Array(n);
  for (let i = 0; i < n; i++) { squared[i] = guide[i] * guide[i]; product[i] = guide[i] * signal[i]; }
  const corrI = boxMean(squared, w, h, radius), corrIP = boxMean(product, w, h, radius);
  for (let i = 0; i < n; i++) {
    product[i] = (corrIP[i] - meanI[i] * meanP[i]) / (Math.max(0, corrI[i] - meanI[i] * meanI[i]) + epsilon);
    squared[i] = meanP[i] - product[i] * meanI[i];
  }
  const meanA = boxMean(product, w, h, radius), meanB = boxMean(squared, w, h, radius), result = new Float32Array(n);
  for (let i = 0; i < n; i++) result[i] = meanA[i] * guide[i] + meanB[i];
  return result;
}
const guidedFilter = relightGuidedFilter;


export function relightRgbGuidedFilter(rgb, signals, channels, w, h, radius, epsilon) {
  const n = w * h, axes = [0, 1, 2].map(c => Float32Array.from({ length: n }, (_, i) => rgb[i * 3 + c]));
  const mean = axes.map(axis => boxMean(axis, w, h, radius));
  const covariance = [];
  for (const [a, b] of [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]]) {
    const product = Float32Array.from({ length: n }, (_, i) => axes[a][i] * axes[b][i]), correlation = boxMean(product, w, h, radius);
    for (let i = 0; i < n; i++) correlation[i] -= mean[a][i] * mean[b][i];
    covariance.push(correlation);
  }
  const inverse = Array.from({ length: 6 }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const rr = Math.max(0, covariance[0][i]) + epsilon, rg = covariance[1][i], rb = covariance[2][i], gg = Math.max(0, covariance[3][i]) + epsilon, gb = covariance[4][i], bb = Math.max(0, covariance[5][i]) + epsilon;
    const crr = gg * bb - gb * gb, crg = rb * gb - rg * bb, crb = rg * gb - rb * gg, cgg = rr * bb - rb * rb, cgb = rg * rb - rr * gb, cbb = rr * gg - rg * rg;
    const determinant = Math.max(1e-20, rr * crr + rg * crg + rb * crb);
    for (const [axis, value] of [crr, crg, crb, cgg, cgb, cbb].entries()) inverse[axis][i] = value / determinant;
  }
  const result = new Float32Array(n * channels);
  for (let c = 0; c < channels; c++) {
    const signal = Float32Array.from({ length: n }, (_, i) => signals[i * channels + c]), meanP = boxMean(signal, w, h, radius);
    const covP = axes.map((axis, a) => {
      const values = boxMean(Float32Array.from({ length: n }, (_, i) => axis[i] * signal[i]), w, h, radius);
      for (let i = 0; i < n; i++) values[i] -= mean[a][i] * meanP[i];
      return values;
    });
    const a = Array.from({ length: 3 }, () => new Float32Array(n)), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[0][i] = inverse[0][i] * covP[0][i] + inverse[1][i] * covP[1][i] + inverse[2][i] * covP[2][i];
      a[1][i] = inverse[1][i] * covP[0][i] + inverse[3][i] * covP[1][i] + inverse[4][i] * covP[2][i];
      a[2][i] = inverse[2][i] * covP[0][i] + inverse[4][i] * covP[1][i] + inverse[5][i] * covP[2][i];
      b[i] = meanP[i] - a[0][i] * mean[0][i] - a[1][i] * mean[1][i] - a[2][i] * mean[2][i];
    }
    const smoothA = a.map(axis => boxMean(axis, w, h, radius)), smoothB = boxMean(b, w, h, radius);
    for (let i = 0; i < n; i++) result[i * channels + c] = smoothB[i] + smoothA[0][i] * axes[0][i] + smoothA[1][i] * axes[1][i] + smoothA[2][i] * axes[2][i];
  }
  return result;
}

function quantile(values, fraction, mask, minimumMask = 0) {
  const selected = new Float64Array(values.length); let count = 0;
  for (let i = 0; i < values.length; i++) if ((!mask || mask[i] > minimumMask) && Number.isFinite(values[i])) selected[count++] = values[i];
  if (!count) return 0;
  const rank = Math.round((count - 1) * fraction); let left = 0, right = count - 1;
  while (left < right) {
    const pivot = selected[(left + right) >> 1]; let lo = left, hi = right;
    while (lo <= hi) {
      while (selected[lo] < pivot) lo++;
      while (selected[hi] > pivot) hi--;
      if (lo <= hi) { const swap = selected[lo]; selected[lo++] = selected[hi]; selected[hi--] = swap; }
    }
    if (rank <= hi) right = hi; else if (rank >= lo) left = lo; else break;
  }
  return selected[rank];
}

function upsampleGuided(data, sw, sh, channels, rgb, w, h, radius = 2, sigmaSpatial = 1.2, sigmaRange = 0.09) {
  const lowRGB = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) for (let c = 0; c < 3; c++) {
    lowRGB[(y * sw + x) * 3 + c] = sample(rgb, w, h, (x + 0.5) * w / sw - 0.5, (y + 0.5) * h / sh - 0.5, 3, c);
  }
  const result = new Float32Array(w * h * channels), spatial = 2 * sigmaSpatial * sigmaSpatial, range = 2 * sigmaRange * sigmaRange;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = (x + 0.5) * sw / w - 0.5, sy = (y + 0.5) * sh / h - 0.5, bx = Math.round(sx), by = Math.round(sy), dst = y * w + x;
    let weights = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = clamp(bx + dx, 0, sw - 1), yy = clamp(by + dy, 0, sh - 1), src = yy * sw + xx;
      let difference = 0;
      for (let c = 0; c < 3; c++) difference += (lowRGB[src * 3 + c] - rgb[dst * 3 + c]) ** 2;
      const weight = Math.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / spatial - difference / range);
      weights += weight;
      for (let c = 0; c < channels; c++) result[dst * channels + c] += data[src * channels + c] * weight;
    }
    for (let c = 0; c < channels; c++) result[dst * channels + c] = weights > 1e-9 ? result[dst * channels + c] / weights : sample(data, sw, sh, sx, sy, channels, c);
  }
  return result;
}


export function estimateMogeFov(points, mask, w, h) {
  let A = 0, B = 0, C = 0, D = 0, E = 0, pairs = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(w * h / 20000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = y * w + x;
    if (!(mask[i] > 0.5)) continue;
    const px = points[i * 3], py = points[i * 3 + 1], z = points[i * 3 + 2];
    if (![px, py, z].every(Number.isFinite)) continue;
    for (const [screen, point] of [[x + 0.5 - w / 2, px], [y + 0.5 - h / 2, py]]) {
      A += screen * screen; B -= screen * point; C += point * point; D -= screen * screen * z; E += screen * point * z; pairs++;
    }
  }
  const determinant = A * C - B * B, focal = (A * E - B * D) / determinant;
  const degrees = Math.atan(w / (2 * focal)) * 360 / Math.PI;
  return pairs >= 32 && Math.abs(determinant) > 1e-12 && focal > 0 && degrees >= 20 && degrees <= 100 ? degrees : 50;
}

export function relightForegroundReference(depth, alpha, w, h, near, far) {
  const bins = new Float64Array(128), lo = Math.log(Math.max(near, 1e-6)), span = Math.max(1e-6, Math.log(Math.max(far, near * 1.001)) - lo);
  let total = 0, weighted = 0;
  const step = Math.max(1, Math.ceil(depth.length / 65536));
  for (let i = 0; i < depth.length; i += step) {
    if (alpha && !(alpha[i] > 0.5) || !(depth[i] > 0) || !Number.isFinite(depth[i])) continue;
    const x = i % w, y = Math.floor(i / w), b = clamp(Math.floor((Math.log(depth[i]) - lo) / span * 128), 0, 127);
    const nx = 2 * (x + 0.5) / w - 1, ny = 2 * (y + 0.5) / h - 1;
    const weight = 0.15 + Math.exp(-(nx * nx + ny * ny) / 0.5);
    bins[b] += weight; total += weight; weighted += b * weight;
  }
  if (!(total > 0)) return near || 1;
  let mass = 0, sum = 0, best = -1, threshold = 127;
  for (let b = 0; b < 127; b++) {
    mass += bins[b]; sum += b * bins[b];
    if (!(mass > 0 && total > mass)) continue;
    const score = mass * (total - mass) * (sum / mass - (weighted - sum) / (total - mass)) ** 2;
    if (score > best) { best = score; threshold = b; }
  }
  let foregroundMass = 0; for (let b = 0; b <= threshold; b++) foregroundMass += bins[b];
  if (foregroundMass < total * 0.05) { threshold = 127; foregroundMass = total; }
  let cumulative = 0;
  for (let b = 0; b <= threshold; b++) { cumulative += bins[b]; if (cumulative >= foregroundMass * 0.25) return Math.exp(lo + (b + 0.5) / 128 * span); }
  return Math.exp(lo + (threshold + 0.5) / 128 * span);
}
const foregroundReference = relightForegroundReference;

function shBasis(x, y, z) {
  return [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
}

function solveSH(bases, observations, weights) {
  const matrix = new Float64Array(81), rhs = new Float64Array(9);
  for (let i = 0; i < weights.length; i++) {
    const weight = weights[i], basis = bases[i]; if (!(weight > 0)) continue;
    for (let a = 0; a < 9; a++) {
      rhs[a] += basis[a] * weight * observations[i];
      for (let b = 0; b <= a; b++) matrix[a * 9 + b] += basis[a] * weight * basis[b];
    }
  }
  let trace = 0; for (let a = 0; a < 9; a++) trace += matrix[a * 9 + a]; trace /= 9;
  if (!(trace > 0)) return null;
  for (let a = 0; a < 9; a++) {
    matrix[a * 9 + a] += trace * ((a === 0 ? 0 : a <= 3 ? 0.0005 : 0.005) + 1e-9);
    for (let b = a + 1; b < 9; b++) matrix[a * 9 + b] = matrix[b * 9 + a];
  }
  const lower = new Float64Array(81);
  for (let a = 0; a < 9; a++) for (let b = 0; b <= a; b++) {
    let value = matrix[a * 9 + b]; for (let c = 0; c < b; c++) value -= lower[a * 9 + c] * lower[b * 9 + c];
    if (a === b) { if (!(value > 0)) return null; lower[a * 9 + b] = Math.sqrt(value); }
    else lower[a * 9 + b] = value / lower[b * 9 + b];
  }
  const interim = new Float64Array(9), coefficients = new Float64Array(9);
  for (let a = 0; a < 9; a++) { let value = rhs[a]; for (let b = 0; b < a; b++) value -= lower[a * 9 + b] * interim[b]; interim[a] = value / lower[a * 9 + a]; }
  for (let a = 8; a >= 0; a--) { let value = interim[a]; for (let b = a + 1; b < 9; b++) value -= lower[b * 9 + a] * coefficients[b]; coefficients[a] = value / lower[a * 9 + a]; }
  return coefficients;
}

function fitOriginalLight(normals, channelLow, shadingLog, alpha, edge, depth, reference, w, h, options = {}) {
  const n = w * h, medianLum = Math.exp(quantile(options.lowL || Float32Array.from({ length: n }, (_, i) => Math.log(luminance(Math.exp(channelLow[0][i]), Math.exp(channelLow[1][i]), Math.exp(channelLow[2][i])) + 1e-4)), 0.5, alpha));
  const reliable = new Float32Array(n), skin = new Float32Array(n), subject = new Float32Array(n), faceWeight = new Float32Array(n), skinWeight = new Float32Array(n), genericWeight = new Float32Array(n);
  let skinPixels = 0, facePixels = 0;
  for (let i = 0; i < n; i++) {
    const maxLog = Math.max(channelLow[0][i], channelLow[1][i], channelLow[2][i]), minLog = Math.min(channelLow[0][i], channelLow[1][i], channelLow[2][i]);
    reliable[i] = alpha[i] > 0.5 ? (1 - smoothstep(Math.log(0.85 * 0.9), Math.log(0.95), minLog)) * smoothstep(Math.log(Math.max(1e-4, medianLum * 0.02)), Math.log(Math.max(2e-4, medianLum * 0.06)), maxLog) : 0;
    const r = Math.exp(channelLow[0][i]), g = Math.exp(channelLow[1][i]), b = Math.exp(channelLow[2][i]), warm = (r - b) / Math.max(r, 1e-4), ratio = (g - b) / Math.max(r - b, 1e-4);
    subject[i] = smoothstep(0.3, 0.7, alpha[i]) * (1 - (options.farField?.[i] || 0)) * (1 - smoothstep(1.3, 1.7, depth[i] / Math.max(reference, 1e-6)));
    skin[i] = r >= g && g >= b ? smoothstep(0.12, 0.28, warm) * (1 - smoothstep(0.75, 0.92, warm)) * smoothstep(0.15, 0.3, ratio) * (1 - smoothstep(0.85, 1, ratio)) : 0;
    const trust = smoothstep(0.3, 0.6, edge[i]);
    genericWeight[i] = subject[i] * reliable[i] * trust; skinWeight[i] = skin[i] * genericWeight[i];
    faceWeight[i] = (options.faceMask?.[i] || 0) * (1 - (options.features?.[i] || 0)) * reliable[i] * (0.25 + 0.75 * skin[i]);
    if (skinWeight[i] > 0.5) skinPixels++; if (faceWeight[i] > 0.5) facePixels++;
  }
  const attempt = source => {
    const useColor = source !== 'shading', weight = source === 'face' ? faceWeight : source === 'skin' ? skinWeight : genericWeight;
    const indices = [], bases = [], lum = [], colors = [[], [], []], selectedWeights = [];
    const step = 2;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = y * w + x, wi = weight[i]; if (wi <= 0.001) continue;
      const observation = useColor ? [0, 1, 2].map(c => Math.exp(channelLow[c][i])) : [1, 1, 1].map(() => Math.exp(shadingLog[i]));
      indices.push(i); bases.push(shBasis(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])); lum.push(luminance(...observation)); selectedWeights.push(wi);
      for (let c = 0; c < 3; c++) colors[c].push(observation[c]);
    }
    if (indices.length < 400) return null;
    let weighted = 0, mass = 0; for (let i = 0; i < lum.length; i++) { weighted += lum[i] * selectedWeights[i]; mass += selectedWeights[i]; }
    const mean = weighted / mass, prediction = new Float64Array(lum.length).fill(mean), robust = new Float64Array(lum.length);
    let coefficients;
    for (let iteration = 0; iteration <= 12; iteration++) {
      const residual = Float32Array.from(lum, (value, i) => (value - prediction[i]) / Math.max(prediction[i], mean * 0.05));
      const sigma = iteration ? Math.max(0.01, 1.4826 * quantile(Float32Array.from(residual, Math.abs), 0.5)) : 1;
      for (let i = 0; i < lum.length; i++) robust[i] = selectedWeights[i] / (1 + (iteration ? residual[i] / (2.385 * sigma) : 0) ** 2) / Math.max(prediction[i], mean * 0.05) ** 2;
      coefficients = solveSH(bases, lum, robust); if (!coefficients) return null;
      for (let i = 0; i < lum.length; i++) prediction[i] = bases[i].reduce((sum, value, c) => sum + value * coefficients[c], 0);
    }
    const finalInlier = Float64Array.from(robust, (value, i) => value * Math.max(prediction[i], mean * 0.05) ** 2);
    const inlierMass = finalInlier.reduce((sum, value) => sum + value, 0), inlierMean = lum.reduce((sum, value, i) => sum + value * finalInlier[i], 0) / Math.max(1e-12, inlierMass);
    let squareError = 0, variance = 0;
    for (let i = 0; i < lum.length; i++) { squareError += finalInlier[i] * (lum[i] - prediction[i]) ** 2; variance += finalInlier[i] * (lum[i] - inlierMean) ** 2; }
    const r2 = variance > 1e-18 ? Math.max(0, 1 - squareError / variance) : 0;
    if (source === 'skin' && r2 < 0.4) return null;
    const colorCoefficients = colors.map(values => solveSH(bases, values, robust)); if (colorCoefficients.some(value => !value)) return null;
    const normalization = Math.max(1e-6, quantile(prediction, 0.5)), fittedLog = new Float32Array(n), tintLog = new Float32Array(n * 3), smoothAxes = [0, 1, 2].map(c => boxMean(boxMean(Float32Array.from({ length: n }, (_, i) => normals[i * 3 + c]), w, h, 4), w, h, 4));
    for (let i = 0; i < n; i++) {
      const normalLength = Math.hypot(smoothAxes[0][i], smoothAxes[1][i], smoothAxes[2][i]);
      const basis = normalLength > 1e-6 ? shBasis(smoothAxes[0][i] / normalLength, smoothAxes[1][i] / normalLength, smoothAxes[2][i] / normalLength) : shBasis(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
      const l = Math.max(0.12, basis.reduce((sum, value, c) => sum + value * coefficients[c], 0) / normalization);
      fittedLog[i] = Math.log(l);
      for (let c = 0; c < 3; c++) tintLog[i * 3 + c] = Math.log(Math.max(0.06, basis.reduce((sum, value, j) => sum + value * colorCoefficients[c][j], 0) / normalization) / l);
    }
    const residual = Float32Array.from(shadingLog, (value, i) => value - fittedLog[i]), offset = quantile(residual, 0.5, weight, 0.3);
    for (let i = 0; i < n; i++) residual[i] -= offset;
    const exclusions = Float32Array.from({ length: n }, (_, i) => 1 - (options.features?.[i] || 0));
    const maskedLow = (radius, secondRadius) => {
      const numerator = boxMean(boxMean(Float32Array.from(residual, (value, i) => value * exclusions[i]), w, h, radius), w, h, secondRadius), denominator = boxMean(boxMean(exclusions, w, h, radius), w, h, secondRadius);
      for (let i = 0; i < n; i++) numerator[i] = denominator[i] > 0.001 ? numerator[i] / denominator[i] : 0;
      return numerator;
    };
    const fine = maskedLow(3, 3), local = maskedLow(40, 20), ownRaw = new Float32Array(n), blendRaw = new Float32Array(n);
    for (let i = 0; i < n; i++) { const trust = smoothstep(0.3, 0.6, edge[i]), own = source === 'shading' ? 0 : Math.max(options.faceMask?.[i] || 0, skin[i] * subject[i]); ownRaw[i] = own * trust; blendRaw[i] = Math.max(own, subject[i]) * trust; }
    const own = boxMean(boxMean(ownRaw, w, h, 14), w, h, 7), blend = boxMean(boxMean(blendRaw, w, h, 14), w, h, 7), shading = new Float32Array(n), tint = new Float32Array(n * 3);
    const tintMedian = [0, 1, 2].map(c => quantile(Float32Array.from({ length: n }, (_, i) => tintLog[i * 3 + c]), 0.5, weight, 0.3));
    for (let i = 0; i < n; i++) {
      const relief = fine[i] - local[i], corrected = Math.abs(relief) <= 0.03 ? 0 : relief - Math.sign(relief) * 0.03;
      const fitted = fittedLog[i] + offset + clamp(corrected, -Math.log(4), Math.log(2)) * exclusions[i] + (1 - own[i]) * local[i];
      let delta = fitted - shadingLog[i]; if (delta < -0.15) delta = -0.15 - 0.25 * Math.tanh((-delta - 0.15) / 0.25);
      shading[i] = clamp(shadingLog[i] + blend[i] * delta, -Math.log(6), Math.log(6));
      for (let c = 0; c < 3; c++) tint[i * 3 + c] = useColor ? own[i] * clamp(tintLog[i * 3 + c] - tintMedian[c], -0.2, 0.2) : 0;
    }
    return { shading, tint, metadata: { source, r2, pixels: indices.length, coefficients: [...coefficients].map(value => value / normalization), rgbCoefficients: colorCoefficients.flatMap(values => [...values].map(value => value / normalization)) } };
  };
  return (facePixels >= 3000 ? attempt('face') : null) || (skinPixels >= 6000 ? attempt('skin') : null) || attempt('shading');
}
export { fitOriginalLight as fitRelightOriginalLight };


export function buildRelightMaterialConfidence({ width: w, height: h, albedo, lowL, shadingLog, alpha, reconstructionLog, sourceBits = 8 }) {
  const n = w * h, deep = sourceBits > 8, lumBounds = deep ? [0.0002, 0.004] : [0.0008, 0.008], chromaBounds = deep ? [0.0005, 0.008] : [0.0015, 0.015];
  const rawLuma = new Float32Array(n), rawChroma = new Float32Array(n), rawIntrinsic = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!(alpha[i] > 0)) continue;
    const low = Math.exp(lowL[i]) - 1e-4, luma = smoothstep(...lumBounds, low), chroma = smoothstep(...chromaBounds, low);
    let intrinsic = smoothstep(-0.97 * Math.log(6), -0.55 * Math.log(6), shadingLog[i]);
    if (reconstructionLog) {
      const mismatch = lowL[i] - reconstructionLog[i];
      intrinsic *= mismatch < 0 ? 1 - smoothstep(0.7, 1.6, -mismatch) : 1 - smoothstep(1.2, 2.4, mismatch);
    }
    if (luma < 1) {
      const peak = Math.max(...albedo.subarray(i * 3, i * 3 + 3)), floor = Math.min(...albedo.subarray(i * 3, i * 3 + 3)), saturation = peak > 1e-6 ? 1 - floor / peak : 0;
      intrinsic *= 1 - (1 - luma) * smoothstep(0.35, 0.85, saturation);
    }
    rawLuma[i] = luma; rawChroma[i] = chroma * chroma; rawIntrinsic[i] = intrinsic;
  }
  const luma = boxMean(rawLuma, w, h, 3), chromaLow = boxMean(rawChroma, w, h, 3), intrinsic = boxMean(rawIntrinsic, w, h, 3);
  const chroma = new Float32Array(n), materialLuma = new Float32Array(n), materialChroma = new Float32Array(n);
  for (let i = 0; i < n; i++) { chroma[i] = Math.min(chromaLow[i], luma[i]); materialLuma[i] = luma[i] * intrinsic[i]; materialChroma[i] = chroma[i] * intrinsic[i]; }
  return { luma, chroma, intrinsic, materialLuma, materialChroma };
}


export function stabilizeRelightMaterial(input) {
  const { width: w, height: h, albedo, alpha, lowL, depth, normals } = input, n = w * h, confidence = buildRelightMaterialConfidence(input);
  const downsample = 2, lw = Math.ceil(w / downsample), lh = Math.ceil(h / downsample), ln = lw * lh;
  const sums = new Float32Array(ln * 3), count = new Uint8Array(ln), valid = new Float32Array(ln), lumaConfidence = new Float32Array(ln), chromaConfidence = new Float32Array(ln);
  const intrinsic = new Float32Array(ln), photographicChroma = new Float32Array(ln), photo = new Float32Array(ln), z = depth ? new Float32Array(ln) : null, normal = normals ? new Float32Array(ln * 3) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = Math.floor(y / 2) * lw + Math.floor(x / 2); count[j]++;
    if (!(alpha[i] > 0)) continue;
    valid[j]++;
    for (let c = 0; c < 3; c++) { sums[j * 3 + c] += albedo[i * 3 + c]; if (normal) normal[j * 3 + c] += normals[i * 3 + c]; }
    lumaConfidence[j] += confidence.materialLuma[i]; chromaConfidence[j] += confidence.materialChroma[i]; intrinsic[j] += confidence.intrinsic[i]; photographicChroma[j] += confidence.chroma[i]; photo[j] += lowL[i]; if (z) z[j] += depth[i];
  }
  const coverage = new Float32Array(ln), lowLum = new Float32Array(ln), lowChroma = new Float32Array(ln * 3), accumulation = new Float32Array(ln * 6);
  for (let j = 0; j < ln; j++) {
    coverage[j] = valid[j] / Math.max(1, count[j]); if (!(valid[j] > 0)) continue;
    const inverse = 1 / valid[j], rgb = [0, 1, 2].map(c => Math.max(1e-6, sums[j * 3 + c] * inverse)), lum = luminance(...rgb);
    lowLum[j] = Math.log(lum); for (let c = 0; c < 3; c++) lowChroma[j * 3 + c] = Math.log(rgb[c] / lum);
    intrinsic[j] *= inverse; photographicChroma[j] *= inverse; photo[j] *= inverse; if (z) z[j] = Math.log(Math.max(1e-6, z[j] * inverse)); if (normal) for (let c = 0; c < 3; c++) normal[j * 3 + c] *= inverse;
    const lumConfidence = lumaConfidence[j] * inverse, colorConfidence = chromaConfidence[j] * inverse;
    const wl = coverage[j] * Math.max(smoothstep(0.4, 0.75, lumConfidence), 0.04 * lumConfidence), wc = coverage[j] * Math.max(smoothstep(0.4, 0.75, colorConfidence), 0.04 * colorConfidence);
    accumulation[j * 6] = wl * lowLum[j]; accumulation[j * 6 + 1] = wl;
    for (let c = 0; c < 3; c++) accumulation[j * 6 + 2 + c] = wc * lowChroma[j * 3 + c]; accumulation[j * 6 + 5] = wc;
  }
  const reach = 0.08 * Math.max(w, h) / 2, horizontal = new Float32Array(ln), vertical = new Float32Array(ln);
  const metric = (i, j) => {
    let difference = 0;
    if (z) difference += Math.max(0, Math.abs(z[i] - z[j]) - 0.004 * downsample) / 0.012;
    if (normal) difference += Math.max(0, Math.hypot(normal[i * 3] - normal[j * 3], normal[i * 3 + 1] - normal[j * 3 + 1], normal[i * 3 + 2] - normal[j * 3 + 2]) - 0.03 * downsample) / 0.12;
    difference += smoothstep(0.45, 0.85, Math.min(intrinsic[i], intrinsic[j])) * Math.max(0, Math.abs(lowLum[i] - lowLum[j]) - 0.05 * downsample) / 0.25;
    let chromaDistance = 0; for (let c = 0; c < 3; c++) chromaDistance += (lowChroma[i * 3 + c] - lowChroma[j * 3 + c]) ** 2;
    difference += smoothstep(0.45, 0.85, Math.sqrt(photographicChroma[i] * photographicChroma[j])) * Math.max(0, Math.sqrt(chromaDistance / 3) - 0.04 * downsample) / 0.12;
    difference += Math.max(0, Math.abs(photo[i] - photo[j]) - 0.15 * downsample) / 0.4;
    difference += Math.abs(coverage[i] - coverage[j]) * 8;
    return 1 + reach * difference;
  };
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const i = y * lw + x; horizontal[i] = x ? metric(i, i - 1) : 0; vertical[i] = y ? metric(i, i - lw) : 0; }
  for (let iteration = 0; iteration < 2; iteration++) {
    const sigma = Math.max(1e-6, reach * Math.sqrt(3) * 2 ** (1 - iteration) / Math.sqrt(15)), exponent = -Math.SQRT2 / sigma;
    for (let y = 0; y < lh; y++) {
      for (let x = 1; x < lw; x++) { const i = y * lw + x, factor = Math.exp(exponent * horizontal[i]); for (let c = 0; c < 6; c++) accumulation[i * 6 + c] += factor * (accumulation[(i - 1) * 6 + c] - accumulation[i * 6 + c]); }
      for (let x = lw - 2; x >= 0; x--) { const i = y * lw + x, factor = Math.exp(exponent * horizontal[i + 1]); for (let c = 0; c < 6; c++) accumulation[i * 6 + c] += factor * (accumulation[(i + 1) * 6 + c] - accumulation[i * 6 + c]); }
    }
    for (let y = 1; y < lh; y++) for (let x = 0; x < lw; x++) { const i = y * lw + x, factor = Math.exp(exponent * vertical[i]); for (let c = 0; c < 6; c++) accumulation[i * 6 + c] += factor * (accumulation[(i - lw) * 6 + c] - accumulation[i * 6 + c]); }
    for (let y = lh - 2; y >= 0; y--) for (let x = 0; x < lw; x++) { const i = y * lw + x, factor = Math.exp(exponent * vertical[i + lw]); for (let c = 0; c < 6; c++) accumulation[i * 6 + c] += factor * (accumulation[(i + lw) * 6 + c] - accumulation[i * 6 + c]); }
  }
  for (let j = 0; j < ln; j++) {
    const wl = accumulation[j * 6 + 1], wc = accumulation[j * 6 + 5];
    accumulation[j * 6] = wl > 1e-12 ? Math.exp(accumulation[j * 6] / wl) : 0;
    accumulation[j * 6 + 1] = wl > 1e-12 ? smoothstep(Math.log(1e-4), Math.log(0.05), Math.log(wl)) : 0;
    if (wc > 1e-12) {
      const color = [0, 1, 2].map(c => Math.exp(accumulation[j * 6 + 2 + c] / wc)), scale = 1 / Math.max(1e-6, luminance(...color));
      for (let c = 0; c < 3; c++) accumulation[j * 6 + 2 + c] = color[c] * scale;
      accumulation[j * 6 + 5] = smoothstep(Math.log(1e-4), Math.log(0.05), Math.log(wc));
    } else { for (let c = 0; c < 3; c++) accumulation[j * 6 + 2 + c] = 1; accumulation[j * 6 + 5] = 0; }
  }
  const result = new Float32Array(albedo), detailScale = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, lumaTrust = confidence.materialLuma[i], chromaTrust = confidence.materialChroma[i];
    detailScale[i] = lumaTrust >= 0.6 ? 1 : 0.35 + 0.65 * smoothstep(0.08, 0.6, lumaTrust);
    if (!(alpha[i] > 0) || lumaTrust >= 0.999 && chromaTrust >= 0.999) continue;
    const donor = [0, 1, 2, 3, 4, 5].map(c => sample(accumulation, lw, lh, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5, 6, c));
    const color = [0, 1, 2].map(c => Math.max(1e-6, albedo[i * 3 + c])), lum = luminance(...color), normalized = color.map(value => value / lum);
    const donatedLum = lum + donor[1] * (donor[0] - lum), photoTrust = 1 - (1 - confidence.luma[i]) * (1 - 0.6 * confidence.intrinsic[i]);
    const newLum = donatedLum + (lum - donatedLum) * photoTrust, saturationKeep = 0.3 + 0.7 * chromaTrust;
    const neutralized = normalized.map(value => 1 + (value - 1) * saturationKeep);
    const donatedColor = neutralized.map((value, c) => value + donor[5] * (donor[c + 2] - value));
    const newColor = donatedColor.map((value, c) => value + (normalized[c] - value) * chromaTrust), gain = newLum / Math.max(1e-6, luminance(...newColor));
    for (let c = 0; c < 3; c++) result[i * 3 + c] = Math.min(1, newColor[c] * gain);
  }
  return { albedo: result, detailScale, confidence };
}


export function assembleRelightMaps(rgba, sourceWidth, sourceHeight, depthModel, normalModel, intrinsicModel, faces = []) {
  validateImage(rgba, sourceWidth, sourceHeight);
  const working = prepareRelightWorkingImage(rgba, sourceWidth, sourceHeight), { width: w, height: h, encodedRGB: rgb, alpha } = working, n = w * h;
  const originalLinear = Float32Array.from(rgb, linear);
  const lo = quantile(depthModel.data, 0.01), hi = quantile(depthModel.data, 0.99), disparity = new Float32Array(depthModel.data.length);
  for (let i = 0; i < disparity.length; i++) disparity[i] = hi > lo ? clamp((depthModel.data[i] - lo) / (hi - lo), 0, 1) : 0.5;
  const lowFar = Float32Array.from(depthModel.data, value => 1 - smoothstep(0.006, 0.025, value / Math.max(hi, 1e-6))), farField = new Float32Array(n);
  if (lowFar.some(value => value > 0.5)) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) farField[y * w + x] = sample(lowFar, depthModel.width, depthModel.height, (x + 0.5) * depthModel.width / w - 0.5, (y + 0.5) * depthModel.height / h - 0.5, 1);
  const upDepth = upsampleGuided(disparity, depthModel.width, depthModel.height, 1, rgb, w, h);
  const logDepth = new Float32Array(n);
  for (let i = 0; i < n; i++) logDepth[i] = Math.log(alpha[i] > 0 ? 1 / (1 / 6 + 5 / 6 * upDepth[i]) : 6);
  const cleanedLog = relightRgbGuidedFilter(rgb, logDepth, 1, w, h, 2, 0.001), smoothLog = guidedFilter(logDepth, logDepth, w, h, 8, 0.0004);
  const depthRaw = new Float32Array(n), depth = new Float32Array(n);
  for (let i = 0; i < n; i++) { depthRaw[i] = Math.exp(cleanedLog[i]); depth[i] = Math.exp(smoothLog[i]); }
  const fov = estimateMogeFov(normalModel.points, normalModel.mask, normalModel.width, normalModel.height), focal = w / (2 * Math.tan(fov * Math.PI / 360));
  const intrinsics = { fx: focal, fy: focal, cx: w / 2, cy: h / 2, fov };
  const faceGeometry = buildRelightFaceGeometry(faces, depthRaw, depth, intrinsics, w, h);
  for (let i = 0; i < n; i++) smoothLog[i] = Math.log(Math.max(1e-6, depth[i]));
  const near = quantile(depthRaw, 0.02, alpha), far = quantile(depthRaw, 0.98, alpha), reference = foregroundReference(depthRaw, alpha, w, h, near, far);
  const positions = new Float32Array(n * 3), depthNormals = new Float32Array(n * 3), edge = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = depth[i]; positions[i * 3] = (x + 0.5 - w / 2) / focal * z; positions[i * 3 + 1] = (y + 0.5 - h / 2) / focal * z; positions[i * 3 + 2] = z;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, l = y * w + Math.max(0, x - 1), r = y * w + Math.min(w - 1, x + 1), t = Math.max(0, y - 1) * w + x, b = Math.min(h - 1, y + 1) * w + x;
    const ax = positions[r * 3] - positions[l * 3], ay = positions[r * 3 + 1] - positions[l * 3 + 1], az = positions[r * 3 + 2] - positions[l * 3 + 2];
    const bx = positions[b * 3] - positions[t * 3], by = positions[b * 3 + 1] - positions[t * 3 + 1], bz = positions[b * 3 + 2] - positions[t * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * positions[i * 3] + ny * positions[i * 3 + 1] + nz * positions[i * 3 + 2] > 0) { nx = -nx; ny = -ny; nz = -nz; }
    const norm = Math.hypot(nx, ny, nz) || 1;
    depthNormals[i * 3] = nx / norm; depthNormals[i * 3 + 1] = ny / norm; depthNormals[i * 3 + 2] = nz ? nz / norm : -1;
    edge[i] = 1 - smoothstep(0.012, 0.05, Math.max(Math.abs(depthRaw[r] - depthRaw[l]), Math.abs(depthRaw[b] - depthRaw[t])) * 0.5 / Math.max(depthRaw[i], 1e-6));
  }
  const edgeDilated = new Float32Array(edge);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) edgeDilated[y * w + x] = Math.min(edgeDilated[y * w + x], edge[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)]);
  const provider = upsampleGuided(normalModel.normals, normalModel.width, normalModel.height, 3, rgb, w, h, 2, 1, 0.1);
  const validity = upsampleGuided(normalModel.mask, normalModel.width, normalModel.height, 1, rgb, w, h, 2, 1, 0.1);
  for (let i = 0; i < n; i++) {
    const nx = provider[i * 3], ny = provider[i * 3 + 1], nz = Math.min(-0.02, provider[i * 3 + 2]), norm = Math.hypot(nx, ny, nz) || 1;
    provider[i * 3] = nx / norm; provider[i * 3 + 1] = ny / norm; provider[i * 3 + 2] = nz / norm;
  }
  const blurAI = [], blurDepth = [], radius = Math.max(2, Math.round(0.05 * Math.max(w, h)));
  for (let c = 0; c < 3; c++) {
    blurAI.push(guidedFilter(smoothLog, Float32Array.from({ length: n }, (_, i) => provider[i * 3 + c]), w, h, radius, 0.002));
    blurDepth.push(guidedFilter(smoothLog, Float32Array.from({ length: n }, (_, i) => depthNormals[i * 3 + c]), w, h, radius, 0.002));
  }
  const fused = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const aiLength = Math.hypot(blurAI[0][i], blurAI[1][i], blurAI[2][i]) || 1, dpLength = Math.hypot(blurDepth[0][i], blurDepth[1][i], blurDepth[2][i]) || 1;
    let agreement = 0; for (let c = 0; c < 3; c++) agreement += blurAI[c][i] / aiLength * blurDepth[c][i] / dpLength;
    const farGate = smoothstep(0.55, 0.9, (smoothLog[i] - Math.log(near)) / Math.max(1e-6, Math.log(far) - Math.log(near)));
    const aiWeight = Math.max(0.8 * smoothstep(0.2, 0.95, agreement), 0.85 * (1 - smoothstep(0, 0.35, edgeDilated[i])), 0.95 * farGate);
    for (let c = 0; c < 3; c++) fused[i * 3 + c] = blurDepth[c][i] / dpLength * (1 - aiWeight) + blurAI[c][i] / aiLength * aiWeight + provider[i * 3 + c] - blurAI[c][i] + (depthNormals[i * 3 + c] - blurDepth[c][i]) * 0.1 * (1 - aiWeight);
    fused[i * 3 + 2] = Math.min(-0.05, fused[i * 3 + 2]);
    const length = Math.hypot(...fused.subarray(i * 3, i * 3 + 3)) || 1; for (let c = 0; c < 3; c++) fused[i * 3 + c] /= length;
  }
  const normals = new Float32Array(n * 3), normalRadius = Math.max(2, Math.round(0.012 * Math.max(w, h)));
  for (let c = 0; c < 3; c++) {
    const axis = Float32Array.from({ length: n }, (_, i) => fused[i * 3 + c]), low = guidedFilter(smoothLog, axis, w, h, normalRadius, 0.002);
    for (let i = 0; i < n; i++) normals[i * 3 + c] = low[i] + (axis[i] - low[i]) * 0.4;
  }
  for (let i = 0; i < n; i++) { normals[i * 3 + 2] = Math.min(-0.05, normals[i * 3 + 2]); const length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1; for (let c = 0; c < 3; c++) normals[i * 3 + c] /= length; }
  applyRelightFaceNormals(normals, faceGeometry, w, h);
  const blurZ = boxMean(depth, w, h, Math.max(2, Math.round(0.008 * Math.max(w, h))));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, relief = (blurZ[i] - depth[i]) / depth[i];
    if (relief > 0.005) {
      const dx = blurZ[y * w + Math.min(w - 1, x + 1)] - blurZ[y * w + Math.max(0, x - 1)], dy = blurZ[Math.min(h - 1, y + 1) * w + x] - blurZ[Math.max(0, y - 1) * w + x];
      const grad = Math.hypot(dx, dy), weight = 0.8 * relief / (relief + 0.15), length = Math.hypot(1, 0.3);
      if (grad > 1e-9) { normals[i * 3] += (dx / grad / length - normals[i * 3]) * weight; normals[i * 3 + 1] += (dy / grad / length - normals[i * 3 + 1]) * weight; normals[i * 3 + 2] += (-0.3 / length - normals[i * 3 + 2]) * weight; }
    }
    normals[i * 3 + 2] = Math.min(-0.05, normals[i * 3 + 2]);
    const length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1; for (let c = 0; c < 3; c++) normals[i * 3 + c] /= length;
  }
  const sw = intrinsicModel.width, sh = intrinsicModel.height, lowRGB = new Float32Array(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) for (let c = 0; c < 3; c++) lowRGB[(y * sw + x) * 3 + c] = sample(rgb, w, h, (x + 0.5) * w / sw - 0.5, (y + 0.5) * h / sh - 0.5, 3, c);
  const intrinsicChannels = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) { for (let c = 0; c < 3; c++) intrinsicChannels[i * 4 + c] = intrinsicModel.albedo[i * 3 + c]; intrinsicChannels[i * 4 + 3] = intrinsicModel.shading[i]; }
  const degrid = relightRgbGuidedFilter(lowRGB, intrinsicChannels, 4, sw, sh, 3, 0.0015), rawAlbedo = new Float32Array(sw * sh * 3), rawShadingModel = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) { for (let c = 0; c < 3; c++) rawAlbedo[i * 3 + c] = degrid[i * 4 + c]; rawShadingModel[i] = degrid[i * 4 + 3]; }
  const aiAlbedo = upsampleGuided(rawAlbedo, sw, sh, 3, rgb, w, h, 1, 1, 0.08);
  for (let i = 0; i < aiAlbedo.length; i++) aiAlbedo[i] = linear(clamp(aiAlbedo[i], 0, 1));
  const photoLum = new Float32Array(n), logLum = new Float32Array(n), albedoLum = new Float32Array(n);
  for (let i = 0; i < n; i++) { photoLum[i] = luminance(...originalLinear.subarray(i * 3, i * 3 + 3)); logLum[i] = Math.log(photoLum[i] + 1e-4); albedoLum[i] = luminance(...aiAlbedo.subarray(i * 3, i * 3 + 3)); }
  const lowLogLum = guidedFilter(logLum, logLum, w, h, 4, 0.015), detail = new Float32Array(n), rawShading = new Float32Array(n);
  for (let i = 0; i < n; i++) { detail[i] = logLum[i] - lowLogLum[i]; rawShading[i] = lowLogLum[i] - Math.log(albedoLum[i] + 1e-4); }
  const shadingLog = guidedFilter(lowLogLum, rawShading, w, h, 12, 0.02), medianShade = quantile(shadingLog, 0.5, alpha);
  for (let i = 0; i < n; i++) shadingLog[i] = clamp(shadingLog[i] - medianShade, -Math.log(6), Math.log(6));
  const albedo = new Float32Array(n * 3), shading = new Float32Array(n), channelLow = [];
  for (let c = 0; c < 3; c++) {
    const channel = Float32Array.from({ length: n }, (_, i) => Math.log(originalLinear[i * 3 + c] + 1e-4)), low = guidedFilter(logLum, channel, w, h, 4, 0.015);
    channelLow.push(low);
  }
  const originalLight = fitOriginalLight(normals, channelLow, shadingLog, alpha, edgeDilated, depth, reference, w, h, { lowL: lowLogLum, farField, faceMask: faceGeometry.faceMask, features: faceGeometry.features });
  if (originalLight) shadingLog.set(originalLight.shading);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) albedo[i * 3 + c] = Math.exp(channelLow[c][i] - shadingLog[i] - (originalLight?.tint[i * 3 + c] || 0));
  const recoveredLum = Float32Array.from({ length: n }, (_, i) => luminance(...albedo.subarray(i * 3, i * 3 + 3)));
  const exposure = Math.max(1e-5, quantile(albedoLum, 0.5, alpha)) / Math.max(1e-5, quantile(recoveredLum, 0.5, alpha));
  for (let i = 0; i < albedo.length; i++) albedo[i] = Math.min(1, albedo[i] * exposure);
  for (let i = 0; i < n; i++) shading[i] = Math.exp(shadingLog[i]);
  
  
  const rawModelShading = upsampleGuided(rawShadingModel, sw, sh, 1, rgb, w, h, 1, 1, 0.08);
  for (let i = 0; i < n; i++) rawModelShading[i] = linear(clamp(rawModelShading[i], 0, 1));
  const modelShadeMedian = Math.max(1e-4, quantile(rawModelShading, 0.5, alpha)), reconstruction = new Float32Array(n);
  for (let i = 0; i < n; i++) reconstruction[i] = albedoLum[i] * rawModelShading[i] / modelShadeMedian;
  const reconstructionScale = Math.max(1e-5, quantile(photoLum, 0.5, alpha)) / Math.max(1e-5, quantile(reconstruction, 0.5, alpha));
  const highlight = Math.max(1e-4, quantile(photoLum, 0.99, alpha)), specRaw = new Float32Array(n), reconstructionLog = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    reconstruction[i] *= reconstructionScale;
    reconstructionLog[i] = Math.log(reconstruction[i] + 1e-4);
    specRaw[i] = alpha[i] > 0 ? smoothstep(1.12, 1.8, photoLum[i] / Math.max(1e-4, reconstruction[i])) * smoothstep(0.35, 0.8, photoLum[i] / highlight) : 0;
  }
  const specularLikelihood = boxMean(specRaw, w, h, 2);
  
  const localLum = Float32Array.from(guidedFilter(lowLogLum, lowLogLum, w, h, 12, 0.02), Math.exp);
  let materialEnergy = 0, photoEnergy = 0, allMaterial = 0, allPhoto = 0;
  for (let i = 0; i < n; i++) if (alpha[i] > 0) { const material = luminance(...albedo.subarray(i * 3, i * 3 + 3)); allMaterial += material; allPhoto += localLum[i]; if (localLum[i] >= 0.08) { materialEnergy += material; photoEnergy += localLum[i]; } }
  if (photoEnergy < allPhoto * 0.01) { materialEnergy = allMaterial; photoEnergy = allPhoto; }
  const maxLift = photoEnergy > 1e-6 ? materialEnergy / photoEnergy * 1.2 : 1;
  for (let i = 0; i < n; i++) if (localLum[i] < 0.08) {
    const material = luminance(...albedo.subarray(i * 3, i * 3 + 3)), ratio = material / Math.max(localLum[i], 1e-5);
    if (ratio <= maxLift) continue;
    const peak = Math.max(...albedo.subarray(i * 3, i * 3 + 3)), saturation = peak > 0 ? 1 - Math.min(...albedo.subarray(i * 3, i * 3 + 3)) / peak : 0;
    const factor = 1 + (1 - smoothstep(0.02, 0.08, localLum[i])) * (1 - smoothstep(0.3, 0.5, saturation)) * (maxLift / ratio - 1);
    for (let c = 0; c < 3; c++) albedo[i * 3 + c] *= factor;
  }
  const stabilized = stabilizeRelightMaterial({ width: w, height: h, albedo, lowL: lowLogLum, shadingLog, alpha, reconstructionLog, depth, normals });
  albedo.set(stabilized.albedo);
  for (let i = 0; i < n; i++) detail[i] *= stabilized.detailScale[i];
  const backdrop = Float32Array.from(depthRaw, value => smoothstep(1.3, 2.4, value / Math.max(reference, 1e-6))), backdropGate = relightRgbGuidedFilter(rgb, backdrop, 1, w, h, Math.max(2, Math.round(0.006 * Math.max(w, h))), 0.001);
  for (let i = 0; i < n; i++) backdropGate[i] = clamp(backdropGate[i], 0, 1);
  const ao = new Float32Array(n).fill(1), aoRadius = 0.07 * reference * w / focal, aoRadius2 = aoRadius * aoRadius;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!alpha[i] || farField[i] > 0.5) continue;
    const z = depthRaw[i], px = (x + 0.5 - w / 2) / focal * z, py = (y + 0.5 - h / 2) / focal * z;
    const radiusPixels = clamp(aoRadius * focal / z, 3, 0.06 * Math.max(w, h)), rotation = (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16 * Math.PI * 2;
    let occlusion = 0;
    for (let k = 0; k < 24; k++) {
      const radius = Math.sqrt((k + 0.5) / 24) * radiusPixels, angle = k * 2.399963229728653 + rotation, xx = Math.floor(x + 0.5 + Math.cos(angle) * radius), yy = Math.floor(y + 0.5 + Math.sin(angle) * radius);
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !alpha[yy * w + xx]) continue;
      const qz = depthRaw[yy * w + xx], dx = (xx + 0.5 - w / 2) / focal * qz - px, dy = (yy + 0.5 - h / 2) / focal * qz - py, dz = qz - z;
      const d2 = Math.max(1e-12, dx * dx + dy * dy + dz * dz), cosine = (normals[i * 3] * dx + normals[i * 3 + 1] * dy + normals[i * 3 + 2] * dz) / Math.sqrt(d2);
      occlusion += Math.max(cosine - 0.3, 0) * clamp(1 - d2 / Math.max(aoRadius2, 1e-12), 0, 1);
    }
    ao[i] = clamp(1 - 2.5 * occlusion / 24, 0, 1);
  }
  return { width: w, height: h, alpha, albedo, shading, detail, depth, depthRaw, normals, providerNormals: provider, depthNormals, positions, validity, edgeConfidence: edgeDilated, originalLinear, intrinsics, farField, backdropGate, specularLikelihood, ao,
    faceMask: faceGeometry.faceMask, faceNormals: faceGeometry.faceNormals, lipsMask: faceGeometry.lipsMask, eyesMask: faceGeometry.eyesMask, features: faceGeometry.features, faces: faceGeometry.faces,
    originalLight: originalLight?.metadata || null, materialConfidence: stabilized.confidence,
    scene: { near, far, referenceDepth: reference, scale: reference * w / focal, intrinsics }, albedoSpace: 'linear' };
}


export function relightLightParameters(light, scene, width, height, originalLighting = 75) {
  const ref = scene.referenceDepth, far = Math.max(1.25 * ref, Math.min(2 * ref, ref + 0.8 * (scene.far - ref)));
  const d = clamp(finite(light.depth, RELIGHT_DEFAULTS.depth), 0, 1), z = d <= 0.5 ? ref * (0.15 + 1.7 * d) : ref + (far - ref) * (2 * d - 1);
  const camera = scene.intrinsics, gain = (clamp(finite(originalLighting, 75), 0, 100) / 100) ** 3;
  const intensity = 32 * (clamp(finite(light.intensity, 20), 0, 100) / 100) ** 2 * (1 + 1.2 * (1 - gain));
  return {
    position: [((light.x + 1) * 0.5 * width - camera.cx) / camera.fx * ref, ((light.y + 1) * 0.5 * height - camera.cy) / camera.fy * ref, z],
    radius: scene.scale * 0.015 * (0.8 / 0.015) ** (clamp(finite(light.diffusion, 50), 0, 100) / 100),
    radiance: light.color.map(c => c * intensity),
  };
}

function rendererScene(maps) {
  const focal = maps.width / (2 * Math.tan(25 * Math.PI / 180));
  const intrinsics = maps.intrinsics || maps.scene?.intrinsics || { fx: focal, fy: focal, cx: maps.width / 2, cy: maps.height / 2 };
  return { near: 1, far: 6, referenceDepth: 1, scale: maps.width / focal, ...maps.scene, intrinsics };
}

const normalizationDistances = new WeakMap();
function normalizationDistance(maps, scene) {
  
  
  const cached = maps.sceneId != null ? normalizationDistances.get(maps) : null;
  if (cached) return cached;
  const light = relightLightParameters({ ...RELIGHT_DEFAULTS, color: [1, 1, 1] }, scene, maps.width, maps.height).position;
  const distances = [], step = Math.max(1, Math.floor(Math.sqrt(maps.width * maps.height / 4096))), camera = scene.intrinsics;
  for (let y = 0; y < maps.height; y += step) for (let x = 0; x < maps.width; x += step) {
    const z = maps.depth[y * maps.width + x]; if (!(z > 0 && z <= 1.3 * scene.referenceDepth)) continue;
    const px = (x + 0.5 - camera.cx) / camera.fx * z, py = (y + 0.5 - camera.cy) / camera.fy * z;
    distances.push(Math.hypot(light[0] - px, light[1] - py, light[2] - z));
  }
  distances.sort((a, b) => a - b);
  const distance = Math.max(scene.referenceDepth * 0.1, distances[Math.floor(distances.length / 2)] || scene.referenceDepth);
  if (maps.sceneId != null) normalizationDistances.set(maps, distance);
  return distance;
}


export function buildRelightRenderState(rgba, w, h, maps, params = {}) {
  validateImage(rgba, w, h); validateMaps(maps);
  const blend = clamp(finite(params.blend, 1), 0, 1), originalLighting = clamp(finite(params.originalLighting, 75), 0, 100), originalGain = (originalLighting / 100) ** 3;
  const lamps = lampsFrom(params).filter(lamp => lamp.enabled && lamp.intensity > 0), scene = rendererScene(maps), distance = normalizationDistance(maps, scene);
  return { blend, originalLighting, originalGain, identity: !blend || (originalGain === 1 && !lamps.length), scene, camera: scene.intrinsics,
    referenceDistance2: distance * distance, lights: lamps.map(lamp => relightLightParameters(lamp, scene, maps.width, maps.height, originalLighting)),
    areaSamples: Math.max(1, Math.min(16, finite(params.areaSamples, Math.max(w, h) <= 512 ? 2 : 16) | 0)),
    shadowSteps: Math.max(4, Math.min(64, finite(params.shadowSteps, Math.max(w, h) <= 512 ? 12 : 64) | 0)),
  };
}

function shadowVisibility(p, normal, emitter, maps, scene, steps) {
  if (!maps.depthRaw) return 1;
  const offset = 0.002 * p[2], start = p.map((v, c) => v + normal[c] * offset), delta = emitter.map((v, c) => v - start[c]), camera = scene.intrinsics;
  const project = v => [v[0] / Math.max(v[2], 1e-6) * camera.fx + camera.cx, v[1] / Math.max(v[2], 1e-6) * camera.fy + camera.cy];
  let end = emitter;
  if (end[2] < scene.near * 0.05) {
    const stop = (scene.near * 0.05 - start[2]) / delta[2]; end = start.map((v, c) => v + delta[c] * stop);
  }
  const from = project(start), to = project(end), span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (span < 1.5) return 1;
  const edge = maps.edgeConfidence ? sample(maps.edgeConfidence, maps.width, maps.height, from[0] - 0.5, from[1] - 0.5, 1) : 1;
  const t0 = Math.min((6 - edge * 4) / span, 0.5), hz = 0.5 * Math.abs(end[2] - start[2]) / steps;
  let occlusion = 0;
  for (let k = 0; k < steps; k++) {
    const t = t0 + (1 - t0) * (k + 0.5) / steps, q = start.map((v, c) => v + (end[c] - v) * t), screen = project(q);
    if (screen[0] < 0 || screen[1] < 0 || screen[0] >= maps.width || screen[1] >= maps.height) break;
    const z = sample(maps.depthRaw, maps.width, maps.height, screen[0] - 0.5, screen[1] - 0.5, 1), bias = 0.006 * q[2] + 2 * hz, dz = q[2] - z;
    if (dz > bias && dz < 0.35 * scene.scale) {
      const trust = maps.edgeConfidence ? sample(maps.edgeConfidence, maps.width, maps.height, screen[0] - 0.5, screen[1] - 0.5, 1) : 1;
      occlusion = Math.max(occlusion, smoothstep(bias, bias + 0.03 * q[2], dz) * (0.15 + 0.85 * trust));
    }
  }
  return 1 - occlusion;
}

function ggxSpecular(normal, direction, view, radius, distance, likelihood) {
  const nl = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2];
  if (nl <= 0) return 0;
  const half = direction.map((v, c) => v + view[c]), length = Math.hypot(...half) || 1;
  for (let c = 0; c < 3; c++) half[c] /= length;
  const nv = Math.max(0.001, normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2]);
  const nh = Math.max(0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]), vh = Math.max(0, view[0] * half[0] + view[1] * half[1] + view[2] * half[2]);
  const roughness = 0.55 + (0.3 - 0.55) * likelihood, alpha = clamp(roughness * roughness + radius / (3 * distance), 0.01, 1), a2 = alpha * alpha;
  const denominator = nh * nh * (a2 - 1) + 1, distribution = a2 / (Math.PI * denominator * denominator);
  const visibility = 0.5 / Math.max(nl * Math.sqrt(nv * nv * (1 - a2) + a2) + nv * Math.sqrt(nl * nl * (1 - a2) + a2), 1e-5);
  const fresnel = 0.04 + 0.96 * (1 - vh) ** 5;
  return Math.min(6, distribution * visibility * fresnel * nl * roughness ** 4 / a2) * 0.6 * (0.4 + 0.6 * likelihood);
}


export function relightSampleRotation(x, y) {
  const dot = Math.fround(Math.fround(x * Math.fround(0.06711056)) + Math.fround(y * Math.fround(0.00583715)));
  const hash = Math.fround(Math.fround(52.9829189) * (dot - Math.floor(dot)));
  return Math.fround((hash - Math.floor(hash)) * Math.fround(6.2831853));
}


export function renderRelightBasic(rgba, w, h, maps, params = {}) {
  const state = buildRelightRenderState(rgba, w, h, maps, params), out = new Uint8ClampedArray(rgba);
  if (state.identity) return out;
  const { blend, originalGain, scene, camera, referenceDistance2: refDistance2, lights } = state;
  
  const samples = Math.min(4, state.areaSamples), shadowSteps = Math.min(32, state.shadowSteps);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const pixel = (y * w + x) * 4; if (!rgba[pixel + 3]) continue;
    const u = (x + 0.5) * maps.width / w, v = (y + 0.5) * maps.height / h, mx = u - 0.5, my = v - 0.5;
    const z = Math.max(1e-6, sample(maps.depth, maps.width, maps.height, mx, my, 1)), p = [(u - camera.cx) / camera.fx * z, (v - camera.cy) / camera.fy * z, z];
    const normal = [0, 1, 2].map(c => sample(maps.normals, maps.width, maps.height, mx, my, 3, c)), nl = Math.hypot(...normal) || 1;
    for (let c = 0; c < 3; c++) normal[c] /= nl;
    const viewLength = Math.hypot(...p), view = p.map(value => -value / viewLength), pUnit = p.map(value => value / viewLength);
    const detail = maps.detail ? Math.exp(clamp(sample(maps.detail, maps.width, maps.height, mx, my, 1), -1.5, 1.5) * 0.85) : 1;
    const albedo = [0, 1, 2].map(c => sample(maps.albedo, maps.width, maps.height, mx, my, 3, c) * detail);
    const likelihood = maps.specularLikelihood ? clamp(sample(maps.specularLikelihood, maps.width, maps.height, mx, my, 1), 0, 1) : 0;
    const added = [0, 0, 0], irradiance = [0, 0, 0], base = [0, 1, 2].map(c => LINEAR_BYTE[rgba[pixel + c]] * originalGain);
    for (const light of lights) {
      const central = p.map((value, c) => value - light.position[c]), centralLength = Math.hypot(...central) || 1, axis = central.map(value => -value / centralLength);
      const up = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let tangent = [up[1] * axis[2] - up[2] * axis[1], up[2] * axis[0] - up[0] * axis[2], up[0] * axis[1] - up[1] * axis[0]];
      const tangentLength = Math.hypot(...tangent) || 1; tangent = tangent.map(value => value / tangentLength);
      const bitangent = [axis[1] * tangent[2] - axis[2] * tangent[1], axis[2] * tangent[0] - axis[0] * tangent[2], axis[0] * tangent[1] - axis[1] * tangent[0]];
      const rotation = relightSampleRotation(u, v);
      const aim = [-light.position[0], -light.position[1], scene.referenceDepth - light.position[2]], aimLength2 = aim.reduce((sum, value) => sum + value * value, 0);
      let diffuse = 0, specular = 0, visible = 0, attenuationMean = 0;
      for (let k = 0; k < samples; k++) {
        const radius = samples <= 1 ? 0 : Math.sqrt((k + 0.5) / samples) * light.radius, angle = rotation + k * 2.399963229728653;
        const emitter = light.position.map((value, c) => value + radius * (tangent[c] * Math.cos(angle) + bitangent[c] * Math.sin(angle)));
        const delta = emitter.map((value, c) => value - p[c]), distance2 = Math.max(1e-8, delta.reduce((sum, value) => sum + value * value, 0)), distance = Math.sqrt(distance2), direction = delta.map(value => value / distance);
        const ndl = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2], back = clamp(direction[0] * pUnit[0] + direction[1] * pUnit[1] + direction[2] * pUnit[2], 0, 1);
        const wrap = Math.min((0.3 + 2.5 * light.radius / distance) * (1 - back), 0.9);
        const angular = clamp((ndl + wrap) / (1 + wrap), 0, 1) ** ((1 + wrap) * (1 + 2 * back));
        const emissionCosine = Math.max(0, -(aim[0] * direction[0] + aim[1] * direction[1] + aim[2] * direction[2]) / Math.sqrt(Math.max(1e-20, aimLength2)));
        const emission = 1 + (emissionCosine ** 4 - 1) * smoothstep(0, 1, aimLength2 / (0.25 * refDistance2));
        const background = 1 - 0.75 * (maps.backdropGate ? clamp(sample(maps.backdropGate, maps.width, maps.height, mx, my, 1), 0, 1) : smoothstep(1.3, 2.4, z / Math.max(scene.referenceDepth, 1e-6)));
        const attenuation = background * refDistance2 / Math.max(distance2 + light.radius * light.radius * 0.5, refDistance2 * 0.01) * emission;
        const visibility = angular > 0 ? shadowVisibility(p, normal, emitter, maps, scene, shadowSteps) : 1;
        diffuse += angular * attenuation; specular += ggxSpecular(normal, direction, view, light.radius, distance, likelihood) * attenuation; visible += visibility; attenuationMean += attenuation;
      }
      const visibility = 1 - (1 - visible / samples) * 0.92 * (1 - 0.3 * originalGain);
      const ao = maps.ao ? clamp(sample(maps.ao, maps.width, maps.height, mx, my, 1), 0, 1) : 1;
      const aoLight = 1 - (1 - ao) * 0.6 * (0.35 + 0.65 * smoothstep(0.05, 0.6, light.radius / Math.max(centralLength, 1e-6)));
      const direction = light.position.map((value, c) => (value - p[c]) / centralLength), nv = Math.max(0.001, normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2]);
      const sideLength = Math.hypot(direction[0], direction[1]), side = clamp((normal[0] * direction[0] + normal[1] * direction[1]) / Math.max(sideLength, 1e-3) * 2, 0, 1);
      const rim = 14 * (1 - nv) ** 4 * clamp(-(direction[0] * view[0] + direction[1] * view[1] + direction[2] * view[2]) + 0.2, 0, 1) * side * attenuationMean / samples;
      for (let c = 0; c < 3; c++) {
        const diffuseRadiance = light.radiance[c] * diffuse / samples * 0.55 * visibility * aoLight;
        irradiance[c] += diffuseRadiance; added[c] += albedo[c] * diffuseRadiance + light.radiance[c] * (specular / samples * (0.5 + 0.5 * aoLight) + albedo[c] * rim) * visibility;
      }
    }
    const farField = maps.farField ? clamp(sample(maps.farField, maps.width, maps.height, mx, my, 1), 0, 1) : 0;
    for (let c = 0; c < 3; c++) added[c] *= 1 - farField;
    const dominant = Math.max(...irradiance), addedLum = luminance(...added), baseLum = luminance(...base);
    const tint = dominant > 1e-6 ? 0.5 * addedLum / (addedLum + baseLum + 1e-5) : 0;
    for (let c = 0; c < 3; c++) {
      const tintedBase = base[c] * (1 - tint + (dominant > 1e-6 ? irradiance[c] / dominant * tint : 0)), headroom = Math.max(0, 1 - tintedBase);
      const amount = Math.max(0, added[c]) / Math.max(headroom, 1e-6), shoulder = amount <= 0.6 ? amount : 0.6 + 0.4 * ((amount - 0.6) / 0.4) / (1 + (amount - 0.6) / 0.4);
      const lit = tintedBase + (headroom <= 1e-6 ? 0 : headroom * shoulder), source = LINEAR_BYTE[rgba[pixel + c]];
      if (Number.isFinite(lit)) out[pixel + c] = Math.round(clamp(srgb(Math.max(0, source + (lit - source) * blend)), 0, 1) * 255);
    }
  }
  return out;
}

let workerPromise = null, worker = null, nextJob = 0, workerEpoch = 0;
const pending = new Map();
const sceneOwners = new WeakMap();

function failWorker(error) {
  workerEpoch++;
  const reason = error instanceof Error ? error : new Error(String(error));
  for (const job of pending.values()) job.reject(reason);
  pending.clear();
  worker?.terminate(); worker = null; workerPromise = null;
}

async function getWorker() {
  if (!workerPromise) {
    const epoch = workerEpoch;
    const requested = (async () => {
      if (typeof Worker === 'undefined') throw new Error('重新打光需要支持 Web Worker 的浏览器');
      const { WORKER_URL } = await import('./relight-worker.js');
      if (epoch !== workerEpoch) throw new Error('重新打光已取消');
      const target = new Worker(WORKER_URL, { type: 'module', name: 'psd_editor-relight' });
      worker = target;
      target.onmessage = ev => {
        if (epoch !== workerEpoch || worker !== target) return;
        const m = ev.data || {}, request = pending.get(m.job);
        if (!request) return;
        if (m.progress) { try { request.onProgress?.(m.progress); } catch {  } return; }
        pending.delete(m.job);
        if (m.error) request.reject(new Error(m.error));
        else request.resolve(m);
      };
      target.onerror = ev => {
        if (epoch === workerEpoch && worker === target) failWorker(new Error(ev.message || '重新打光 Worker 运行失败'));
      };
      target.onmessageerror = () => {
        if (epoch === workerEpoch && worker === target) failWorker(new Error('重新打光 Worker 数据传输失败'));
      };
      return target;
    })();
    workerPromise = requested;
    requested.catch(() => { if (workerPromise === requested) workerPromise = null; });
  }
  return workerPromise;
}

async function workerJob(message, transfer, onProgress) {
  const epoch = workerEpoch;
  const target = await getWorker(), job = ++nextJob;
  if (epoch !== workerEpoch || worker !== target) throw new Error('重新打光已取消');
  return new Promise((resolve, reject) => {
    pending.set(job, { resolve, reject, onProgress });
    try { target.postMessage({ ...message, job }, transfer); }
    catch (error) { pending.delete(job); reject(error); }
  });
}


export async function analyzeRelight(rgba, w, h, onProgress) {
  validateImage(rgba, w, h);
  const pixels = new Uint8ClampedArray(rgba);
  const response = await workerJob({ type: 'analyze', rgba: pixels, w, h }, [pixels.buffer], onProgress);
  sceneOwners.set(response.maps, { epoch: workerEpoch, sceneId: response.sceneId });
  return response.maps;
}


export async function renderRelightAsync(rgba, w, h, maps, params = {}) {
  validateImage(rgba, w, h); validateMaps(maps);
  let owner = sceneOwners.get(maps), response;
  if (owner?.epoch === workerEpoch && owner.sceneId != null) {
    const pixels = new Uint8ClampedArray(rgba);
    response = await workerJob({ type: 'render', rgba: pixels, w, h, sceneId: owner.sceneId, params }, [pixels.buffer]);
  }
  if (!response || response.needScene) {
    const pixels = new Uint8ClampedArray(rgba);
    response = await workerJob({ type: 'render', rgba: pixels, w, h, maps, params }, [pixels.buffer]);
    owner = { epoch: workerEpoch, sceneId: response.sceneId }; sceneOwners.set(maps, owner);
  }
  Object.defineProperties(response.rgba, { renderBackend: { value: response.renderBackend }, renderFallback: { value: response.renderFallback }, renderPasses: { value: response.renderPasses } });
  return response.rgba;
}


export function disposeRelight() {
  failWorker(new Error('重新打光已取消'));
}
