















































































function clamp255(v) {
  if (!(v > 0)) return 0;            
  if (v >= 255) return 255;
  return Math.round(v);
}

function clamp01(v) {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}


function identityLut() {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) t[i] = i;
  return t;
}


function triple(lut) {
  return [lut, lut, lut];
}

function fail(msg, info) {
  const e = new Error(msg);
  if (info) Object.assign(e, info);
  e.code = 'ADJUST_BAD_PARAM';
  return e;
}


function num(p, used, key, def, min, max, label) {
  if (!Object.prototype.hasOwnProperty.call(p, key) || p[key] === undefined) {
    used.add(key);
    return def;
  }
  used.add(key);
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw fail(`${label}.${key} 必须是有限数字，收到 ${JSON.stringify(v)}`, { key });
  if (v < min || v > max)
    throw fail(`${label}.${key} 必须在 ${min}…${max} 之间，收到 ${v}`, { key, min, max });
  return v;
}

function bool(p, used, key, def, label) {
  if (!Object.prototype.hasOwnProperty.call(p, key) || p[key] === undefined) {
    used.add(key);
    return def;
  }
  used.add(key);
  const v = p[key];
  if (typeof v !== 'boolean')
    throw fail(`${label}.${key} 必须是布尔值，收到 ${JSON.stringify(v)}`, { key });
  return v;
}


function assertNoUnknown(p, used, label, accepts) {
  const unknown = Object.keys(p).filter(k => k !== 'type' && !used.has(k));
  if (unknown.length)
    throw fail(`「${label}」不认识的参数：${unknown.join(' ')}；本调整接受：${accepts}`,
      { unknown });
}


function normChannel(v, label) {
  if (v === undefined || v === null) return 'rgb';
  const s = String(v).toLowerCase();
  if (s === 'rgb' || s === 'composite' || s === 'all' || s === '') return 'rgb';
  if (s === 'r' || s === 'red' || s === '0') return 'r';
  if (s === 'g' || s === 'green' || s === '1') return 'g';
  if (s === 'b' || s === 'blue' || s === '2') return 'b';
  throw fail(`${label}.channel 只能是 rgb / r / g / b，收到 ${JSON.stringify(v)}`, { channel: v });
}






const LUMA_R = 0.299, LUMA_G = 0.587, LUMA_B = 0.114;

































const EXPOSURE_ACCEPTS = 'exposure(-20…20) offset(-0.5…0.5) gamma(0.01…9.99) workingGamma(1…3 或 "srgb"，默认 2.2)';

function parseExposure(p) {
  const used = new Set();
  const exposure = num(p, used, 'exposure', 0, -20, 20, '曝光度');
  const offset = num(p, used, 'offset', 0, -0.5, 0.5, '曝光度');
  const gamma = num(p, used, 'gamma', 1, 0.01, 9.99, '曝光度');
  let workingGamma = 2.2;
  if (Object.prototype.hasOwnProperty.call(p, 'workingGamma') && p.workingGamma !== undefined) {
    used.add('workingGamma');
    if (p.workingGamma === 'srgb') workingGamma = 'srgb';
    else workingGamma = num(p, used, 'workingGamma', 2.2, 1, 3, '曝光度');
  }
  used.add('workingGamma');
  assertNoUnknown(p, used, '曝光度', EXPOSURE_ACCEPTS);
  return { exposure, offset, gamma, workingGamma };
}


function srgbToLinear(x) { return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
function linearToSrgb(x) { return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }

function exposureLut(p) {
  
  if (p.exposure === 0 && p.offset === 0 && p.gamma === 1) return triple(identityLut());
  const lut = new Uint8ClampedArray(256);
  const mul = Math.pow(2, p.exposure);
  const invG = 1 / p.gamma;
  const srgb = p.workingGamma === 'srgb';
  const g = srgb ? 0 : p.workingGamma;
  const invWg = srgb ? 0 : 1 / p.workingGamma;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let L = srgb ? srgbToLinear(x) : Math.pow(x, g);
    L = clamp01(L * mul + p.offset);
    if (invG !== 1) L = Math.pow(L, invG);
    const y = srgb ? linearToSrgb(L) : Math.pow(L, invWg);
    lut[i] = clamp255(y * 255);
  }
  return triple(lut);
}



























const LEVELS_ONE_ACCEPTS = 'inputBlack(0…254) inputWhite(1…255) gamma(0.01…9.99) outputBlack(0…255) outputWhite(0…255)';
const LEVELS_ACCEPTS = LEVELS_ONE_ACCEPTS + ' channel(rgb|r|g|b) channels({rgb,r,g,b})';

function parseOneLevels(p, label) {
  const used = new Set();
  
  const alias = (a, b) => (p[a] !== undefined ? a : (p[b] !== undefined ? b : a));
  const kIn0 = alias('inputBlack', 'shadowInput');
  const kIn1 = alias('inputWhite', 'highlightInput');
  const kOut0 = alias('outputBlack', 'shadowOutput');
  const kOut1 = alias('outputWhite', 'highlightOutput');
  const inputBlack = num(p, used, kIn0, 0, 0, 254, label);
  const inputWhite = num(p, used, kIn1, 255, 1, 255, label);
  const gamma = num(p, used, 'gamma', 1, 0.01, 9.99, label);
  const outputBlack = num(p, used, kOut0, 0, 0, 255, label);
  const outputWhite = num(p, used, kOut1, 255, 0, 255, label);
  if (inputBlack >= inputWhite)
    throw fail(`${label} 的输入黑场 ${inputBlack} 必须小于输入白场 ${inputWhite}`);
  return { v: { inputBlack, inputWhite, gamma, outputBlack, outputWhite }, used };
}

function parseLevels(p) {
  const used = new Set(['channel', 'channels']);
  const per = { rgb: null, r: null, g: null, b: null };
  if (p.channels !== undefined) {
    if (!p.channels || typeof p.channels !== 'object' || Array.isArray(p.channels))
      throw fail('色阶.channels 必须是 { rgb, r, g, b } 形式的对象');
    for (const k of Object.keys(p.channels)) {
      const ch = normChannel(k, '色阶.channels');
      per[ch] = parseOneLevels(p.channels[k], `色阶.channels.${k}`).v;
    }
    
    assertNoUnknown(p, used, '色阶', LEVELS_ACCEPTS);
  } else {
    const one = parseOneLevels(p, '色阶');
    for (const k of one.used) used.add(k);
    assertNoUnknown(p, used, '色阶', LEVELS_ACCEPTS);
    per[normChannel(p.channel, '色阶')] = one.v;
  }
  return per;
}


function oneLevelsLut(v) {
  const lut = new Uint8ClampedArray(256);
  const { inputBlack, inputWhite, gamma, outputBlack, outputWhite } = v;
  if (inputBlack === 0 && inputWhite === 255 && gamma === 1 && outputBlack === 0 && outputWhite === 255)
    return identityLut();
  const span = inputWhite - inputBlack;
  const invG = 1 / gamma;
  const outSpan = outputWhite - outputBlack;
  for (let i = 0; i < 256; i++) {
    let t = clamp01((i - inputBlack) / span);
    if (invG !== 1) t = Math.pow(t, invG);
    lut[i] = clamp255(t * outSpan + outputBlack);
  }
  return lut;
}

function levelsLut(per) {
  const comp = per.rgb ? oneLevelsLut(per.rgb) : null;
  const out = [];
  for (const ch of ['r', 'g', 'b']) {
    const own = per[ch] ? oneLevelsLut(per[ch]) : null;
    if (!own && !comp) { out.push(identityLut()); continue; }
    if (!own) { out.push(comp); continue; }
    if (!comp) { out.push(own); continue; }
    const merged = new Uint8ClampedArray(256);   
    for (let i = 0; i < 256; i++) merged[i] = comp[own[i]];
    out.push(merged);
  }
  return out;
}
















const CURVES_ACCEPTS = 'points([[输入,输出],…] 2…19 个点，输入严格递增，0…255) channel(rgb|r|g|b) channels({rgb,r,g,b}) interpolation(spline|monotone|linear，默认 spline = PS 的自然三次样条)';

function parsePoints(raw, label) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 19)
    throw fail(`${label}.points 必须是 2…19 个点的数组，收到 ${JSON.stringify(raw)}`);
  const xs = [], ys = [];
  let prev = -1;
  for (const it of raw) {
    let x, y;
    if (Array.isArray(it) && it.length === 2) { x = it[0]; y = it[1]; }
    else if (it && typeof it === 'object') { x = it.input; y = it.output; }
    else throw fail(`${label}.points 的每一项要么是 [输入,输出]，要么是 { input, output }，收到 ${JSON.stringify(it)}`);
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
      throw fail(`${label}.points 的坐标必须是有限数字，收到 ${JSON.stringify(it)}`);
    if (x < 0 || x > 255 || y < 0 || y > 255)
      throw fail(`${label}.points 的坐标要在 0…255 之间，收到 ${JSON.stringify(it)}`);
    if (x <= prev) throw fail(`${label}.points 的输入值必须严格递增，${x} 出现在 ${prev} 之后`);
    prev = x;
    xs.push(x); ys.push(y);
  }
  return { xs, ys };
}

function parseCurves(p) {
  const used = new Set(['channel', 'channels', 'points', 'interpolation']);
  let interpolation = 'spline';
  if (p.interpolation !== undefined) {
    if (p.interpolation !== 'spline' && p.interpolation !== 'monotone' && p.interpolation !== 'linear')
      throw fail(`曲线.interpolation 只能是 spline / monotone / linear，收到 ${JSON.stringify(p.interpolation)}`);
    interpolation = p.interpolation;
  }
  const per = { rgb: null, r: null, g: null, b: null };
  if (p.channels !== undefined) {
    if (!p.channels || typeof p.channels !== 'object' || Array.isArray(p.channels))
      throw fail('曲线.channels 必须是 { rgb, r, g, b } 形式的对象');
    for (const k of Object.keys(p.channels))
      per[normChannel(k, '曲线.channels')] = parsePoints(p.channels[k], `曲线.channels.${k}`);
  } else {
    if (p.points === undefined) throw fail(`曲线必须给 points；接受：${CURVES_ACCEPTS}`);
    per[normChannel(p.channel, '曲线')] = parsePoints(p.points, '曲线');
  }
  assertNoUnknown(p, used, '曲线', CURVES_ACCEPTS);
  return { per, interpolation };
}


function monotoneSlopes(xs, ys) {
  const n = xs.length;
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const m = new Float64Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}


function naturalSplineY2(xs, ys) {
  const n = xs.length;
  const y2 = new Float64Array(n), u = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const sig = (xs[i] - xs[i - 1]) / (xs[i + 1] - xs[i - 1]);
    const q = sig * y2[i - 1] + 2;
    y2[i] = (sig - 1) / q;
    const dd = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) - (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
    u[i] = (6 * dd / (xs[i + 1] - xs[i - 1]) - sig * u[i - 1]) / q;
  }
  y2[n - 1] = 0;
  for (let k = n - 2; k >= 0; k--) y2[k] = y2[k] * y2[k + 1] + u[k];
  return y2;
}

function curveLut({ xs, ys }, interpolation) {
  const lut = new Uint8ClampedArray(256);
  const n = xs.length;
  const m = interpolation === 'monotone' ? monotoneSlopes(xs, ys) : null;
  const y2 = interpolation === 'linear' || m ? null : naturalSplineY2(xs, ys);
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    if (i <= xs[0]) { lut[i] = clamp255(ys[0]); continue; }
    if (i >= xs[n - 1]) { lut[i] = clamp255(ys[n - 1]); continue; }
    while (seg < n - 2 && i > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    const t = (i - xs[seg]) / h;
    let v;
    if (m) {
      const t2 = t * t, t3 = t2 * t;
      v = (2 * t3 - 3 * t2 + 1) * ys[seg]
        + (t3 - 2 * t2 + t) * h * m[seg]
        + (-2 * t3 + 3 * t2) * ys[seg + 1]
        + (t3 - t2) * h * m[seg + 1];
    } else if (y2) {
      const a = 1 - t;
      v = a * ys[seg] + t * ys[seg + 1] + ((a * a * a - a) * y2[seg] + (t * t * t - t) * y2[seg + 1]) * h * h / 6;
    } else {
      v = ys[seg] + (ys[seg + 1] - ys[seg]) * t;
    }
    lut[i] = clamp255(v);
  }
  return lut;
}

function curvesLut({ per, interpolation }) {
  const comp = per.rgb ? curveLut(per.rgb, interpolation) : null;
  const out = [];
  for (const ch of ['r', 'g', 'b']) {
    const own = per[ch] ? curveLut(per[ch], interpolation) : null;
    if (!own && !comp) { out.push(identityLut()); continue; }
    if (!own) { out.push(comp); continue; }
    if (!comp) { out.push(own); continue; }
    const merged = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) merged[i] = comp[own[i]];
    out.push(merged);
  }
  return out;
}






























const BC_ACCEPTS = 'brightness(-150…150) contrast(-100…100，PS 面板只给 -50…100) useLegacy(必须 true) meanValue(0…255，默认 127)';

function parseBrightnessContrast(p) {
  const used = new Set();
  const brightness = num(p, used, 'brightness', 0, -150, 150, '亮度/对比度');
  const contrast = num(p, used, 'contrast', 0, -100, 100, '亮度/对比度');
  const meanValue = num(p, used, 'meanValue', 127, 0, 255, '亮度/对比度');
  const useLegacy = bool(p, used, 'useLegacy', true, '亮度/对比度');
  assertNoUnknown(p, used, '亮度/对比度', BC_ACCEPTS);
  if (!useLegacy)
    throw fail('亮度/对比度：新式（非 Legacy）算法 Adobe 没有公开，我们拒绝拿拟合曲线冒充它。' +
      '请传 useLegacy:true 用旧式公式，或者改用 curves 自己画曲线。');
  return { brightness, contrast, meanValue };
}

function brightnessContrastLut(p) {
  const lut = new Uint8ClampedArray(256);
  const mean = p.meanValue;
  if (p.contrast >= 100) {                    
    for (let i = 0; i < 256; i++) {
      const x = i + p.brightness;
      lut[i] = x > mean ? 255 : (x < mean ? 0 : clamp255(mean));
    }
    return triple(lut);
  }
  const k = p.contrast >= 0 ? 100 / (100 - p.contrast) : (100 + p.contrast) / 100;
  for (let i = 0; i < 256; i++) lut[i] = clamp255((i + p.brightness - mean) * k + mean);
  return triple(lut);
}
















function parseNoParams(p, label) {
  assertNoUnknown(p, new Set(), label, '（无参数）');
  return {};
}

function invertLut() {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = 255 - i;
  return triple(lut);
}

function parsePosterize(p) {
  const used = new Set();
  const levels = num(p, used, 'levels', 4, 2, 255, '色调分离');
  if (!Number.isInteger(levels)) throw fail(`色调分离.levels 必须是整数，收到 ${levels}`);
  assertNoUnknown(p, used, '色调分离', 'levels(2…255 整数)');
  return { levels };
}

function posterizeLut(p) {
  const lut = new Uint8ClampedArray(256);
  const n = p.levels;
  const step = 255 / (n - 1);
  for (let i = 0; i < 256; i++) {
    let bin = Math.floor(i * n / 256);
    if (bin > n - 1) bin = n - 1;
    lut[i] = clamp255(bin * step);
  }
  return triple(lut);
}

function parseThreshold(p) {
  const used = new Set();
  const level = num(p, used, 'level', 128, 1, 255, '阈值');
  if (!Number.isInteger(level)) throw fail(`阈值.level 必须是整数，收到 ${level}`);
  assertNoUnknown(p, used, '阈值', 'level(1…255 整数)');
  return { level };
}

function runThreshold(src, dst, width, rect, p) {
  const { x0, y0, x1, y1 } = rect;
  const level = p.level;
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const gray = src[q] * LUMA_R + src[q + 1] * LUMA_G + src[q + 2] * LUMA_B;
      const v = (gray + 0.5 | 0) >= level ? 255 : 0;
      dst[q] = v; dst[q + 1] = v; dst[q + 2] = v;
    }
  }
}










function runDesaturate(src, dst, width, rect) {
  const { x0, y0, x1, y1 } = rect;
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q], g = src[q + 1], b = src[q + 2];
      let mx = r > g ? r : g; if (b > mx) mx = b;
      let mn = r < g ? r : g; if (b < mn) mn = b;
      const v = (mx + mn + 1) >> 1;
      dst[q] = v; dst[q + 1] = v; dst[q + 2] = v;
    }
  }
}






















const BW_ACCEPTS = 'red yellow green cyan blue magenta（均 -200…300，默认 40/60/40/60/20/80）useTint(boolean) tintColor([r,g,b]，useTint 时必填)';

function parseBlackWhite(p) {
  const used = new Set();
  const v = {
    red: num(p, used, 'red', 40, -200, 300, '黑白'),
    yellow: num(p, used, 'yellow', 60, -200, 300, '黑白'),
    green: num(p, used, 'green', 40, -200, 300, '黑白'),
    cyan: num(p, used, 'cyan', 60, -200, 300, '黑白'),
    blue: num(p, used, 'blue', 20, -200, 300, '黑白'),
    magenta: num(p, used, 'magenta', 80, -200, 300, '黑白'),
  };
  const useTint = bool(p, used, 'useTint', false, '黑白');
  let tintColor = null;
  if (useTint) {
    used.add('tintColor'); tintColor = p.tintColor;
    if (!Array.isArray(tintColor) || tintColor.length !== 3 || tintColor.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 255))
      throw fail('黑白.tintColor 必须是三个 0…255 的有限数字（useTint:true 时必填）', { key: 'tintColor' });
  }
  assertNoUnknown(p, used, '黑白', BW_ACCEPTS);
  if (useTint) {
    const r = tintColor[0] / 255, g = tintColor[1] / 255, b = tintColor[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h6 = 0;
    if (d) {
      if (mx === r) h6 = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h6 = (b - r) / d + 2;
      else h6 = (r - g) / d + 4;
    }
    v.useTint = true; v.tintH6 = h6; v.tintS = d ? (l > .5 ? d / (2 - mx - mn) : d / (mx + mn)) : 0;
  }
  return v;
}

function runBlackWhite(src, dst, width, rect, p) {
  const { x0, y0, x1, y1 } = rect;
  const wR = p.red / 100, wY = p.yellow / 100, wG = p.green / 100;
  const wC = p.cyan / 100, wB = p.blue / 100, wM = p.magenta / 100;
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q], g = src[q + 1], b = src[q + 2];
      let mx, md, mn, wPri, wSec;
      if (r >= g) {
        if (g >= b) { mx = r; md = g; mn = b; wPri = wR; wSec = wY; }          
        else if (r >= b) { mx = r; md = b; mn = g; wPri = wR; wSec = wM; }     
        else { mx = b; md = r; mn = g; wPri = wB; wSec = wM; }                 
      } else {
        if (r >= b) { mx = g; md = r; mn = b; wPri = wG; wSec = wY; }          
        else if (g >= b) { mx = g; md = b; mn = r; wPri = wG; wSec = wC; }     
        else { mx = b; md = g; mn = r; wPri = wB; wSec = wC; }                 
      }
      const v = clamp255(mn + (md - mn) * wSec + (mx - md) * wPri);
      if (!p.useTint || p.tintS === 0) { dst[q] = v; dst[q + 1] = v; dst[q + 2] = v; continue; }
      const l = v / 255, qq = l < .5 ? l * (1 + p.tintS) : l + p.tintS - l * p.tintS, pp = 2 * l - qq;
      dst[q] = clamp255(hue2rgb(pp, qq, p.tintH6 + 2) * 255);
      dst[q + 1] = clamp255(hue2rgb(pp, qq, p.tintH6) * 255);
      dst[q + 2] = clamp255(hue2rgb(pp, qq, p.tintH6 - 2) * 255);
    }
  }
}













const CM_ACCEPTS = 'monochrome red/green/blue/gray 各 { red, green, blue, constant }（-200…200）';

function parseMixRow(raw, def, label) {
  if (raw === undefined) return def;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw fail(`${label} 必须是 { red, green, blue, constant } 对象`);
  const used = new Set();
  const row = {
    red: num(raw, used, 'red', def.red, -200, 200, label),
    green: num(raw, used, 'green', def.green, -200, 200, label),
    blue: num(raw, used, 'blue', def.blue, -200, 200, label),
    constant: num(raw, used, 'constant', def.constant, -200, 200, label),
  };
  assertNoUnknown(raw, used, label, 'red green blue constant');
  return row;
}

function parseChannelMixer(p) {
  const used = new Set(['red', 'green', 'blue', 'gray']);
  const monochrome = bool(p, used, 'monochrome', false, '通道混合器');
  const v = {
    monochrome,
    red: parseMixRow(p.red, { red: 100, green: 0, blue: 0, constant: 0 }, '通道混合器.red'),
    green: parseMixRow(p.green, { red: 0, green: 100, blue: 0, constant: 0 }, '通道混合器.green'),
    blue: parseMixRow(p.blue, { red: 0, green: 0, blue: 100, constant: 0 }, '通道混合器.blue'),
    gray: parseMixRow(p.gray, { red: 40, green: 40, blue: 20, constant: 0 }, '通道混合器.gray'),
  };
  assertNoUnknown(p, used, '通道混合器', CM_ACCEPTS);
  return v;
}


function mixTables(row) {
  const tr = new Float32Array(256), tg = new Float32Array(256), tb = new Float32Array(256);
  const kr = row.red / 100, kg = row.green / 100, kb = row.blue / 100;
  for (let i = 0; i < 256; i++) { tr[i] = i * kr; tg[i] = i * kg; tb[i] = i * kb; }
  return { tr, tg, tb, c: row.constant * 2.55 };
}

function runChannelMixer(src, dst, width, rect, p) {
  const { x0, y0, x1, y1 } = rect;
  if (p.monochrome) {
    const m = mixTables(p.gray);
    for (let y = y0; y < y1; y++) {
      let q = (y * width + x0) * 4;
      for (let x = x0; x < x1; x++, q += 4) {
        const v = clamp255(m.tr[src[q]] + m.tg[src[q + 1]] + m.tb[src[q + 2]] + m.c);
        dst[q] = v; dst[q + 1] = v; dst[q + 2] = v;
      }
    }
    return;
  }
  const R = mixTables(p.red), G = mixTables(p.green), B = mixTables(p.blue);
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q], g = src[q + 1], b = src[q + 2];
      dst[q] = clamp255(R.tr[r] + R.tg[g] + R.tb[b] + R.c);
      dst[q + 1] = clamp255(G.tr[r] + G.tg[g] + G.tb[b] + G.c);
      dst[q + 2] = clamp255(B.tr[r] + B.tg[g] + B.tb[b] + B.c);
    }
  }
}




















const CB_ACCEPTS = 'shadows/midtones/highlights（各 3 个 -100…100：[青-红, 洋红-绿, 黄-蓝]）preserveLuminosity';

function parseTriple(raw, key, label) {
  if (raw === undefined) return [0, 0, 0];
  if (!Array.isArray(raw) || raw.length !== 3)
    throw fail(`${label}.${key} 必须是 3 个数字的数组 [青-红, 洋红-绿, 黄-蓝]，收到 ${JSON.stringify(raw)}`);
  return raw.map((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw fail(`${label}.${key}[${i}] 必须是有限数字，收到 ${JSON.stringify(v)}`);
    if (v < -100 || v > 100)
      throw fail(`${label}.${key}[${i}] 必须在 -100…100 之间，收到 ${v}`);
    return v;
  });
}

function parseColorBalance(p) {
  const used = new Set(['shadows', 'midtones', 'highlights']);
  const v = {
    shadows: parseTriple(p.shadows, 'shadows', '色彩平衡'),
    midtones: parseTriple(p.midtones, 'midtones', '色彩平衡'),
    highlights: parseTriple(p.highlights, 'highlights', '色彩平衡'),
    preserveLuminosity: bool(p, used, 'preserveLuminosity', true, '色彩平衡'),
  };
  assertNoUnknown(p, used, '色彩平衡', CB_ACCEPTS);
  return v;
}

function runColorBalance(src, dst, width, rect, p) {
  const { x0, y0, x1, y1 } = rect;
  
  const mS = new Float32Array(256), mM = new Float32Array(256), mH = new Float32Array(256);
  const a = 0.25, b = 0.333, scale = 0.7;
  for (let i = 0; i < 256; i++) {
    const L = i / 255;
    mS[i] = clamp01((L - b) / -a + 0.5) * scale;
    mM[i] = clamp01((L - b) / a + 0.5) * clamp01((L + b - 1) / -a + 0.5) * scale;
    mH[i] = clamp01((L + b - 1) / a + 0.5) * scale;
  }
  const s = p.shadows, m = p.midtones, h = p.highlights;
  const keep = p.preserveLuminosity;
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q], g = src[q + 1], bl = src[q + 2];
      const luma = r * LUMA_R + g * LUMA_G + bl * LUMA_B;
      const li = luma + 0.5 | 0;
      const ws = mS[li], wm = mM[li], wh = mH[li];
      let nr = r + (s[0] * ws + m[0] * wm + h[0] * wh) * 2.55;
      let ng = g + (s[1] * ws + m[1] * wm + h[1] * wh) * 2.55;
      let nb = bl + (s[2] * ws + m[2] * wm + h[2] * wh) * 2.55;
      if (nr < 0) nr = 0; else if (nr > 255) nr = 255;
      if (ng < 0) ng = 0; else if (ng > 255) ng = 255;
      if (nb < 0) nb = 0; else if (nb > 255) nb = 255;
      if (keep) {
        const d = luma - (nr * LUMA_R + ng * LUMA_G + nb * LUMA_B);
        nr += d; ng += d; nb += d;
      }
      dst[q] = clamp255(nr); dst[q + 1] = clamp255(ng); dst[q + 2] = clamp255(nb);
    }
  }
}













const GM_ACCEPTS = 'stops([{ position:0…1, color:[r,g,b], midpoint?:0…1 }, …] 至少 2 个) reverse';

function parseGradientMap(p) {
  const used = new Set(['stops']);
  const reverse = bool(p, used, 'reverse', false, '渐变映射');
  assertNoUnknown(p, used, '渐变映射', GM_ACCEPTS);
  const raw = p.stops;
  if (!Array.isArray(raw) || raw.length < 2)
    throw fail(`渐变映射.stops 至少要 2 个色标，收到 ${JSON.stringify(raw)}`);
  const stops = [];
  let prev = -Infinity;
  for (const it of raw) {
    if (!it || typeof it !== 'object') throw fail(`渐变映射.stops 的每一项要是 { position, color }，收到 ${JSON.stringify(it)}`);
    const pos = it.position;
    if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0 || pos > 1)
      throw fail(`渐变映射色标的 position 必须是 0…1 的数字，收到 ${JSON.stringify(pos)}`);
    if (pos < prev) throw fail(`渐变映射.stops 的 position 必须不降序，${pos} 出现在 ${prev} 之后`);
    prev = pos;
    const c = it.color;
    if (!Array.isArray(c) || c.length !== 3 || c.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255))
      throw fail(`渐变映射色标的 color 必须是 [r,g,b]（0…255），收到 ${JSON.stringify(c)}`);
    let mid = 0.5;
    if (it.midpoint !== undefined) {
      if (typeof it.midpoint !== 'number' || !(it.midpoint > 0) || !(it.midpoint < 1))
        throw fail(`渐变映射色标的 midpoint 必须是 0…1 的开区间数字，收到 ${JSON.stringify(it.midpoint)}`);
      mid = it.midpoint;
    }
    stops.push({ position: pos, color: [c[0], c[1], c[2]], midpoint: mid });
  }
  return { stops, reverse };
}

function gradientTables(p) {
  const tr = new Uint8ClampedArray(256), tg = new Uint8ClampedArray(256), tb = new Uint8ClampedArray(256);
  const st = p.stops;
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    let t = i / 255;
    if (p.reverse) t = 1 - t;
    if (t <= st[0].position) { tr[i] = clamp255(st[0].color[0]); tg[i] = clamp255(st[0].color[1]); tb[i] = clamp255(st[0].color[2]); continue; }
    const last = st.length - 1;
    if (t >= st[last].position) { tr[i] = clamp255(st[last].color[0]); tg[i] = clamp255(st[last].color[1]); tb[i] = clamp255(st[last].color[2]); continue; }
    seg = 0;
    while (seg < last - 1 && t > st[seg + 1].position) seg++;
    const a = st[seg], b = st[seg + 1];
    const span = b.position - a.position;
    let u = span > 0 ? (t - a.position) / span : 0;
    if (a.midpoint !== 0.5) u = Math.pow(u, Math.log(0.5) / Math.log(a.midpoint));
    tr[i] = clamp255(a.color[0] + (b.color[0] - a.color[0]) * u);
    tg[i] = clamp255(a.color[1] + (b.color[1] - a.color[1]) * u);
    tb[i] = clamp255(a.color[2] + (b.color[2] - a.color[2]) * u);
  }
  return { tr, tg, tb };
}

function runGradientMap(src, dst, width, rect, p) {
  const { x0, y0, x1, y1 } = rect;
  const { tr, tg, tb } = gradientTables(p);
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const gray = src[q] * LUMA_R + src[q + 1] * LUMA_G + src[q + 2] * LUMA_B + 0.5 | 0;
      dst[q] = tr[gray]; dst[q + 1] = tg[gray]; dst[q + 2] = tb[gray];
    }
  }
}








































const HUE_RANGE_NAMES = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'];
const HUE_RANGE_DEFAULTS = [
  [315, 345, 15, 45],    
  [15, 45, 75, 105],     
  [75, 105, 135, 165],   
  [135, 165, 195, 225],  
  [195, 225, 255, 285],  
  [255, 285, 315, 345],  
];

const HS_ACCEPTS = 'hue(-180…180) saturation(-100…100) lightness(-100…100) colorize ' +
  'colorizeHue(0…360) colorizeSaturation(0…100) ' +
  'reds/yellows/greens/cyans/blues/magentas（各 { hue, saturation, lightness }，可带 range:[外低,内低,内高,外高]）';

function parseBand(raw, def, label) {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw fail(`${label} 必须是 { hue, saturation, lightness } 对象`);
  const used = new Set(['range']);
  const band = {
    hue: num(raw, used, 'hue', 0, -180, 180, label),
    saturation: num(raw, used, 'saturation', 0, -100, 100, label),
    lightness: num(raw, used, 'lightness', 0, -100, 100, label),
    range: def.slice(),
  };
  if (raw.range !== undefined) {
    if (!Array.isArray(raw.range) || raw.range.length !== 4 ||
        raw.range.some(v => typeof v !== 'number' || !Number.isFinite(v)))
      throw fail(`${label}.range 必须是 4 个角度 [外低, 内低, 内高, 外高]，收到 ${JSON.stringify(raw.range)}`);
    band.range = raw.range.slice();
  }
  assertNoUnknown(raw, used, label, 'hue saturation lightness range');
  return band;
}

function parseHueSaturation(p) {
  const used = new Set(HUE_RANGE_NAMES);
  const v = {
    hue: num(p, used, 'hue', 0, -180, 180, '色相/饱和度'),
    saturation: num(p, used, 'saturation', 0, -100, 100, '色相/饱和度'),
    lightness: num(p, used, 'lightness', 0, -100, 100, '色相/饱和度'),
    colorize: bool(p, used, 'colorize', false, '色相/饱和度'),
    colorizeHue: num(p, used, 'colorizeHue', 0, 0, 360, '色相/饱和度'),
    colorizeSaturation: num(p, used, 'colorizeSaturation', 25, 0, 100, '色相/饱和度'),
    bands: null,
  };
  const bands = [];
  let any = false;
  for (let i = 0; i < 6; i++) {
    const b = parseBand(p[HUE_RANGE_NAMES[i]], HUE_RANGE_DEFAULTS[i], `色相/饱和度.${HUE_RANGE_NAMES[i]}`);
    bands.push(b);
    if (b && (b.hue !== 0 || b.saturation !== 0 || b.lightness !== 0)) any = true;
  }
  assertNoUnknown(p, used, '色相/饱和度', HS_ACCEPTS);
  if (any) {
    if (v.colorize)
      throw fail('色相/饱和度：colorize 模式下 PS 的六个色域是灰掉的，本模块也不接受两者同时给。');
    v.bands = bands;
  }
  return v;
}


function bandWeight(hueDeg, range) {
  const w = (x) => ((x % 360) + 360) % 360;
  const a = w(range[0]);
  const rel = (x) => w(x - a);
  const B = rel(range[1]), C = rel(range[2]), D = rel(range[3]), H = rel(hueDeg);
  if (H >= D) return 0;
  if (H < B) return B > 0 ? H / B : 1;
  if (H <= C) return 1;
  return D > C ? (D - H) / (D - C) : 1;
}






function satFactor(s) {
  if (s >= 100) return Infinity;
  if (s <= -100) return 0;
  return s >= 0 ? 100 / (100 - s) : (100 + s) / 100;
}


function lightnessLut(l) {
  if (l > 100) l = 100; else if (l < -100) l = -100;
  const lut = new Uint8ClampedArray(256);
  if (l === 0) return identityLut();
  if (l > 0) { const f = l / 100; for (let i = 0; i < 256; i++) lut[i] = clamp255(i + (255 - i) * f); }
  else { const f = 1 + l / 100; for (let i = 0; i < 256; i++) lut[i] = clamp255(i * f); }
  return lut;
}


const HS_TABLE_N = 3600;

function buildBandTables(p) {
  const dh = new Float32Array(HS_TABLE_N + 1);
  const ds = new Float32Array(HS_TABLE_N + 1);
  const dl = new Float32Array(HS_TABLE_N + 1);
  for (let i = 0; i <= HS_TABLE_N; i++) {
    const hue = i * 360 / HS_TABLE_N;
    let h = p.hue, s = p.saturation, l = p.lightness;
    for (let k = 0; k < 6; k++) {
      const band = p.bands[k];
      if (!band) continue;
      const w = bandWeight(hue, band.range);
      if (w <= 0) continue;
      h += w * band.hue; s += w * band.saturation; l += w * band.lightness;
    }
    dh[i] = h; ds[i] = s; dl[i] = l;
  }
  return { dh, ds, dl };
}


function hue2rgb(pp, qq, t) {
  if (t < 0) t += 6; else if (t >= 6) t -= 6;
  if (t < 1) return pp + (qq - pp) * t;
  if (t < 3) return qq;
  if (t < 4) return pp + (qq - pp) * (4 - t);
  return pp;
}

function runHueSaturation(src, dst, width, rect, p) {
  const { x0, y0, x1, y1 } = rect;

  
  if (p.colorize) {
    const h6 = (p.colorizeHue % 360) / 60;
    const s2 = p.colorizeSaturation / 100;
    const lLut = lightnessLut(p.lightness);
    for (let y = y0; y < y1; y++) {
      let q = (y * width + x0) * 4;
      for (let x = x0; x < x1; x++, q += 4) {
        const r = src[q], g = src[q + 1], b = src[q + 2];
        let mx = r > g ? r : g; if (b > mx) mx = b;
        let mn = r < g ? r : g; if (b < mn) mn = b;
        const l = (mx + mn) / 510;
        if (s2 === 0) {
          const v = lLut[clamp255(l * 255)];
          dst[q] = v; dst[q + 1] = v; dst[q + 2] = v;
          continue;
        }
        const qq = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2;
        const pp = 2 * l - qq;
        dst[q] = lLut[clamp255(hue2rgb(pp, qq, h6 + 2) * 255)];
        dst[q + 1] = lLut[clamp255(hue2rgb(pp, qq, h6) * 255)];
        dst[q + 2] = lLut[clamp255(hue2rgb(pp, qq, h6 - 2) * 255)];
      }
    }
    return;
  }

  const tables = p.bands ? buildBandTables(p) : null;

  
  if (!tables && p.hue === 0 && p.saturation === 0) {
    if (p.lightness === 0) return;                 
    const lLut = lightnessLut(p.lightness);
    for (let y = y0; y < y1; y++) {
      let q = (y * width + x0) * 4;
      for (let x = x0; x < x1; x++, q += 4) {
        dst[q] = lLut[src[q]]; dst[q + 1] = lLut[src[q + 1]]; dst[q + 2] = lLut[src[q + 2]];
      }
    }
    return;
  }

  
  const masterDh = p.hue / 60;                     
  const masterK = satFactor(p.saturation);
  const masterLLut = lightnessLut(p.lightness);    
  const lLutCache = tables ? new Map() : null;     

  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q], g = src[q + 1], b = src[q + 2];
      let mx = r > g ? r : g; if (b > mx) mx = b;
      let mn = r < g ? r : g; if (b < mn) mn = b;
      const d = mx - mn;

      
      
      if (d === 0) {
        dst[q] = masterLLut[r]; dst[q + 1] = masterLLut[g]; dst[q + 2] = masterLLut[b];
        continue;
      }

      
      let h6;
      if (mx === r) h6 = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h6 = (b - r) / d + 2;
      else h6 = (r - g) / d + 4;

      let dh6, k, lLut;
      if (tables) {
        const idx = (h6 * (HS_TABLE_N / 6) + 0.5) | 0;
        dh6 = tables.dh[idx] / 60;
        k = satFactor(tables.ds[idx]);
        lLut = lutForLightness(lLutCache, tables.dl[idx]);
        if (dh6 === 0 && k === 1 && tables.dl[idx] === 0) {   
          dst[q] = r; dst[q + 1] = g; dst[q + 2] = b;
          continue;
        }
      } else {
        dh6 = masterDh; k = masterK; lLut = masterLLut;
      }

      const sum = mx + mn;
      const l = sum / 510;
      let s = l > 0.5 ? d / (510 - sum) : d / sum;
      if (k === Infinity) s = 1;
      else { s *= k; if (s > 1) s = 1; else if (!(s > 0)) s = 0; }

      let t = h6 + dh6;
      t %= 6; if (t < 0) t += 6;

      const qq = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const pp = 2 * l - qq;
      dst[q] = lLut[clamp255(hue2rgb(pp, qq, t + 2) * 255)];
      dst[q + 1] = lLut[clamp255(hue2rgb(pp, qq, t) * 255)];
      dst[q + 2] = lLut[clamp255(hue2rgb(pp, qq, t - 2) * 255)];
    }
  }
}










const VIBRANCE_ACCEPTS = 'vibrance(-100…100) saturation(-100…100)';
function parseVibrance(p) {
  const used = new Set();
  const vibrance = num(p, used, 'vibrance', 0, -100, 100, '自然饱和度');
  const saturation = num(p, used, 'saturation', 0, -100, 100, '自然饱和度');
  assertNoUnknown(p, used, '自然饱和度', VIBRANCE_ACCEPTS);
  return { vibrance, saturation };
}
function runVibrance(src, dst, width, rect, p) {
  if (p.vibrance === 0 && p.saturation === 0) return;
  const { x0, y0, x1, y1 } = rect;
  const satK = satFactor(p.saturation), vib = p.vibrance / 100;
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q], g = src[q + 1], b = src[q + 2];
      let mx = r > g ? r : g; if (b > mx) mx = b;
      let mn = r < g ? r : g; if (b < mn) mn = b;
      const d = mx - mn;
      if (d === 0) continue; 
      const sum = mx + mn, l = sum / 510;
      let h6;
      if (mx === r) h6 = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h6 = (b - r) / d + 2;
      else h6 = (r - g) / d + 4;
      let s = l > 0.5 ? d / (510 - sum) : d / sum;
      if (satK === Infinity) s = 1;
      else s = Math.max(0, Math.min(1, s * satK));
      
      
      const vibK = vib >= 0 ? 1 + vib * (1 - s) : 1 + vib;
      s = Math.max(0, Math.min(1, s * vibK));
      const qq = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - qq;
      dst[q] = clamp255(hue2rgb(pp, qq, h6 + 2) * 255);
      dst[q + 1] = clamp255(hue2rgb(pp, qq, h6) * 255);
      dst[q + 2] = clamp255(hue2rgb(pp, qq, h6 - 2) * 255);
    }
  }
}














const PHOTO_FILTER_ACCEPTS = 'color([r,g,b]，每项 0…255) density(0…100) preserveLuminosity(boolean)';
function parsePhotoFilter(p) {
  const used = new Set();
  used.add('color');
  const color = p.color;
  if (!Array.isArray(color) || color.length !== 3 || color.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255))
    throw fail('照片滤镜.color 必须是三个 0…255 的有限数字', { key: 'color' });
  const density = num(p, used, 'density', 25, 0, 100, '照片滤镜');
  const preserveLuminosity = bool(p, used, 'preserveLuminosity', true, '照片滤镜');
  assertNoUnknown(p, used, '照片滤镜', PHOTO_FILTER_ACCEPTS);
  const r = color[0] / 255, g = color[1] / 255, b = color[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h6 = 0;
  if (d) {
    if (mx === r) h6 = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h6 = (b - r) / d + 2;
    else h6 = (r - g) / d + 4;
  }
  return { color: [r, g, b], density: density / 100, preserveLuminosity, targetH6: h6, targetS: d ? (l > .5 ? d / (2 - mx - mn) : d / (mx + mn)) : 0 };
}
function runPhotoFilter(src, dst, width, rect, p) {
  if (p.density === 0) return;
  const { x0, y0, x1, y1 } = rect, t = p.density, tr = p.color[0], tg = p.color[1], tb = p.color[2];
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q] / 255, g = src[q + 1] / 255, b = src[q + 2] / 255;
      let fr = tr, fg = tg, fb = tb;
      if (p.preserveLuminosity) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (p.targetS === 0) fr = fg = fb = l;
        else {
          const qq = l < .5 ? l * (1 + p.targetS) : l + p.targetS - l * p.targetS;
          const pp = 2 * l - qq;
          fr = hue2rgb(pp, qq, p.targetH6 + 2);
          fg = hue2rgb(pp, qq, p.targetH6);
          fb = hue2rgb(pp, qq, p.targetH6 - 2);
        }
      }
      dst[q] = clamp255((r + (fr - r) * t) * 255);
      dst[q + 1] = clamp255((g + (fg - g) * t) * 255);
      dst[q + 2] = clamp255((b + (fb - b) * t) * 255);
    }
  }
}



















const SELECTIVE_COLOR_ACCEPTS = 'plates(10×4 个 -100…100 整数，plates[0] 为 PSD 占位) method(0 相对 / 1 绝对)';
function parseSelectiveColor(p) {
  const used = new Set();
  used.add('plates');
  if (!Array.isArray(p.plates) || p.plates.length < 10 || p.plates.slice(0, 10).some(row => !Array.isArray(row) || row.length !== 4 || row.some(v => !Number.isInteger(v) || v < -100 || v > 100)))
    throw fail('可选颜色.plates 必须是至少 10 组、每组 4 个 -100…100 的整数', { key: 'plates' });
  const method = num(p, used, 'method', 0, 0, 1, '可选颜色');
  if (!Number.isInteger(method)) throw fail(`可选颜色.method 必须是 0 或 1 的整数，收到 ${method}`, { key: 'method' });
  assertNoUnknown(p, used, '可选颜色', SELECTIVE_COLOR_ACCEPTS);
  return { plates: p.plates.slice(1, 10).map(row => row.slice()), relative: method === 0 };
}
function runSelectiveColor(src, dst, width, rect, p) {
  const active = p.plates.map(row => row.some(v => v !== 0));
  if (!active.some(Boolean)) return;
  const { x0, y0, x1, y1 } = rect;
  const P = p.plates.map(row => row.map(v => v / 100));
  const rel = p.relative;
  const w = new Float64Array(9);
  for (let y = y0; y < y1; y++) {
    let q = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, q += 4) {
      const r = src[q] / 255, g = src[q + 1] / 255, b = src[q + 2] / 255;
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const mid = r + g + b - mx - mn;
      w[0] = r === mx ? mx - mid : 0;                 
      w[1] = b === mn ? mid - mn : 0;                 
      w[2] = g === mx ? mx - mid : 0;                 
      w[3] = r === mn ? mid - mn : 0;                 
      w[4] = b === mx ? mx - mid : 0;                 
      w[5] = g === mn ? mid - mn : 0;                 
      w[6] = mn > 0.5 ? (mn - 0.5) * 2 : 0;           
      w[7] = 1 - (Math.abs(mx - 0.5) + Math.abs(mn - 0.5));   
      w[8] = mx < 0.5 ? (0.5 - mx) * 2 : 0;           
      let dr = 0, dg = 0, db = 0;
      for (let i = 0; i < 9; i++) {
        const wi = w[i]; if (!wi || !active[i]) continue;
        const [c, m, ye, k] = P[i];
        dr += ((-1 - c) * k - c) * (rel ? 1 - r : 1) * wi;
        dg += ((-1 - m) * k - m) * (rel ? 1 - g : 1) * wi;
        db += ((-1 - ye) * k - ye) * (rel ? 1 - b : 1) * wi;
      }
      dst[q] = clamp255((r + dr) * 255); dst[q + 1] = clamp255((g + dg) * 255); dst[q + 2] = clamp255((b + db) * 255);
    }
  }
}


function lutForLightness(cache, l) {
  const key = Math.round(l * 10);
  let lut = cache.get(key);
  if (!lut) { lut = lightnessLut(key / 10); cache.set(key, lut); }
  return lut;
}





const ADJUSTMENTS = {
  exposure: {
    label: '曝光度',
    accepts: EXPOSURE_ACCEPTS,
    neutral: { exposure: 0, offset: 0, gamma: 1 },
    parse: parseExposure, lut: exposureLut,
  },
  levels: {
    label: '色阶',
    accepts: LEVELS_ACCEPTS,
    neutral: { inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 },
    parse: parseLevels, lut: levelsLut,
  },
  curves: {
    label: '曲线',
    accepts: CURVES_ACCEPTS,
    neutral: { points: [[0, 0], [255, 255]] },
    parse: parseCurves, lut: curvesLut,
  },
  hueSaturation: {
    label: '色相/饱和度',
    accepts: HS_ACCEPTS,
    neutral: { hue: 0, saturation: 0, lightness: 0 },
    parse: parseHueSaturation, run: runHueSaturation,
  },
  vibrance: {
    label: '自然饱和度（近似）',
    accepts: VIBRANCE_ACCEPTS,
    neutral: { vibrance: 0, saturation: 0 },
    parse: parseVibrance, run: runVibrance,
  },
  photoFilter: {
    label: '照片滤镜（近似）',
    accepts: PHOTO_FILTER_ACCEPTS,
    neutral: { color: [0, 0, 0], density: 0, preserveLuminosity: true },
    parse: parsePhotoFilter, run: runPhotoFilter,
  },
  selectiveColor: {
    label: '可选颜色',
    accepts: SELECTIVE_COLOR_ACCEPTS,
    neutral: { plates: Array.from({ length: 10 }, () => [0, 0, 0, 0]), method: 0 },
    parse: parseSelectiveColor, run: runSelectiveColor,
  },
  brightnessContrast: {
    label: '亮度/对比度（旧式）',
    accepts: BC_ACCEPTS,
    neutral: { brightness: 0, contrast: 0 },
    parse: parseBrightnessContrast, lut: brightnessContrastLut,
  },
  invert: {
    label: '反相',
    accepts: '（无参数）',
    neutral: null,
    parse: (p) => parseNoParams(p, '反相'), lut: invertLut,
  },
  posterize: {
    label: '色调分离',
    accepts: 'levels(2…255 整数)',
    neutral: null,
    parse: parsePosterize, lut: posterizeLut,
  },
  threshold: {
    label: '阈值',
    accepts: 'level(1…255 整数)',
    neutral: null,
    parse: parseThreshold, run: runThreshold,
  },
  desaturate: {
    label: '去色',
    accepts: '（无参数）',
    neutral: null,
    parse: (p) => parseNoParams(p, '去色'), run: runDesaturate,
  },
  blackWhite: {
    label: '黑白',
    accepts: BW_ACCEPTS,
    neutral: null,
    parse: parseBlackWhite, run: runBlackWhite,
  },
  channelMixer: {
    label: '通道混合器',
    accepts: CM_ACCEPTS,
    neutral: { monochrome: false },
    parse: parseChannelMixer, run: runChannelMixer,
  },
  colorBalance: {
    label: '色彩平衡（近似）',
    accepts: CB_ACCEPTS,
    neutral: { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] },
    parse: parseColorBalance, run: runColorBalance,
  },
  gradientMap: {
    label: '渐变映射',
    accepts: GM_ACCEPTS,
    neutral: null,
    parse: parseGradientMap, run: runGradientMap,
  },
};












const TYPE_ALIAS = new Map();
for (const key of Object.keys(ADJUSTMENTS)) TYPE_ALIAS.set(key.toLowerCase(), key);
for (const [alias, key] of [
  ['hue-saturation', 'hueSaturation'], ['huesaturation', 'hueSaturation'], ['hsl', 'hueSaturation'],
  ['brightness-contrast', 'brightnessContrast'], ['brightnesscontrast', 'brightnessContrast'],
  ['channel-mixer', 'channelMixer'], ['channelmixer', 'channelMixer'],
  ['color-balance', 'colorBalance'], ['colorbalance', 'colorBalance'],
  ['gradient-map', 'gradientMap'], ['gradientmap', 'gradientMap'],
  ['black-white', 'blackWhite'], ['blackwhite', 'blackWhite'],
]) TYPE_ALIAS.set(alias, key);

function resolveType(type) {
  if (typeof type !== 'string' || !type.trim())
    throw fail(`调整参数缺少 type；可用：${Object.keys(ADJUSTMENTS).join(' ')}`);
  const key = TYPE_ALIAS.get(type.toLowerCase().replace(/[-_\s]/g, ''));
  if (!key)
    throw fail(`不认识的调整类型「${type}」；可用：${Object.keys(ADJUSTMENTS).join(' ')}`,
      { type, available: Object.keys(ADJUSTMENTS) });
  return key;
}






function selDataOf(sel) {
  const d = sel.data;
  if (d instanceof Uint8Array) return d;
  if (d instanceof Uint8ClampedArray) return new Uint8Array(d.buffer, d.byteOffset, d.length);
  return Uint8Array.from(d || []);
}

function assertSelection(sel) {
  if (!sel || typeof sel !== 'object')
    throw fail('opts.selection 必须是 core/selection.js 的选区对象 { x, y, width, height, data, docW, docH }');
  for (const k of ['x', 'y', 'width', 'height'])
    if (!Number.isInteger(sel[k])) throw fail(`opts.selection.${k} 必须是整数，收到 ${JSON.stringify(sel[k])}`);
  if (sel.width < 0 || sel.height < 0) throw fail(`opts.selection 尺寸非法：${sel.width}×${sel.height}`);
  if (sel.width > 0 && sel.height > 0) {
    const d = selDataOf(sel);
    if (d.length !== sel.width * sel.height)
      throw fail(`opts.selection.data 长度 ${d.length} ≠ ${sel.width}×${sel.height}`);
  }
}











export function applyAdjustment(rgba, width, height, params, opts = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw fail(`尺寸非法：${width}×${height}（必须是正整数）`);
  if (!rgba || typeof rgba.length !== 'number')
    throw fail('rgba 必须是类型化数组（Uint8ClampedArray / Uint8Array）');
  if (rgba.length !== width * height * 4)
    throw fail(`rgba 长度 ${rgba.length} ≠ ${width}×${height}×4 = ${width * height * 4}`);
  if (!params || typeof params !== 'object' || Array.isArray(params))
    throw fail(`params 必须是 { type, … } 对象，收到 ${JSON.stringify(params)}`);

  const key = resolveType(params.type);
  const spec = ADJUSTMENTS[key];
  const p = spec.parse(params);

  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);

  
  const sel = opts.selection;
  let rect = { x0: 0, y0: 0, x1: width, y1: height };
  let selInfo = null;
  if (sel !== undefined && sel !== null) {
    assertSelection(sel);
    const lb = opts.layerBounds || { left: 0, top: 0 };
    const left = Number.isInteger(lb.left) ? lb.left : (Number.isInteger(lb.x) ? lb.x : 0);
    const top = Number.isInteger(lb.top) ? lb.top : (Number.isInteger(lb.y) ? lb.y : 0);
    if (sel.width === 0 || sel.height === 0) return out;      
    const x0 = Math.max(0, sel.x - left);
    const y0 = Math.max(0, sel.y - top);
    const x1 = Math.min(width, sel.x + sel.width - left);
    const y1 = Math.min(height, sel.y + sel.height - top);
    if (x0 >= x1 || y0 >= y1) return out;                     
    rect = { x0, y0, x1, y1 };
    selInfo = { data: selDataOf(sel), sx: sel.x - left, sy: sel.y - top, sw: sel.width };
  }

  if (spec.lut) {
    const luts = spec.lut(p);
    const [lr, lg, lb] = luts;
    for (let y = rect.y0; y < rect.y1; y++) {
      let q = (y * width + rect.x0) * 4;
      for (let x = rect.x0; x < rect.x1; x++, q += 4) {
        out[q] = lr[rgba[q]];
        out[q + 1] = lg[rgba[q + 1]];
        out[q + 2] = lb[rgba[q + 2]];
      }
    }
  } else {
    spec.run(rgba, out, width, rect, p);
  }

  
  if (selInfo) {
    const { data, sx, sy, sw } = selInfo;
    for (let y = rect.y0; y < rect.y1; y++) {
      let q = (y * width + rect.x0) * 4;
      const rowBase = (y - sy) * sw - sx;
      for (let x = rect.x0; x < rect.x1; x++, q += 4) {
        const cov = data[rowBase + x];
        if (cov === 255) continue;
        if (cov === 0) { out[q] = rgba[q]; out[q + 1] = rgba[q + 1]; out[q + 2] = rgba[q + 2]; continue; }
        const f = cov / 255;
        out[q] = Math.round(rgba[q] + (out[q] - rgba[q]) * f);
        out[q + 1] = Math.round(rgba[q + 1] + (out[q + 1] - rgba[q + 1]) * f);
        out[q + 2] = Math.round(rgba[q + 2] + (out[q + 2] - rgba[q + 2]) * f);
      }
    }
  }

  return out;
}






export function buildAdjustmentLut(params) {
  if (!params || typeof params !== 'object') throw fail('params 必须是 { type, … } 对象');
  const spec = ADJUSTMENTS[resolveType(params.type)];
  if (!spec.lut) return null;
  const [r, g, b] = spec.lut(spec.parse(params));
  return { r, g, b };
}


export const ADJUSTMENT_TYPES = Object.freeze(Object.keys(ADJUSTMENTS));


export function listAdjustments() {
  const out = {};
  for (const [key, spec] of Object.entries(ADJUSTMENTS)) {
    out[key] = {
      label: spec.label,
      accepts: spec.accepts,
      lut: !!spec.lut,
      neutral: spec.neutral ? JSON.parse(JSON.stringify(spec.neutral)) : null,
    };
  }
  return out;
}
