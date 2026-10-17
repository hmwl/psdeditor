


























import { parsePsdDocument, serializePsdDocument, decodeLayerPixels, decodeComposite } from './psd-document.js';
import { serializeEven } from './psd-highdepth.js';
import { defaultHdrColorModeData } from './psd-hdr.js';
import { encodeChannel, detectSample16Max, SAMPLE16_PS, Compression } from './psd-image.js';
import { writeImageResource, removeImageResource } from './psd-write.js';
import { buildTransform, compileTransform } from './color-convert.js';
import { labProfile, sRGBProfile, grayProfile, srgbDecode, srgbEncode } from './icc.js';

export const MODE_ID = { bitmap: 0, gray: 1, indexed: 2, rgb: 3, cmyk: 4, multichannel: 7, duotone: 8, lab: 9 };
export const MODE_KEY = { 0: 'bitmap', 1: 'gray', 2: 'indexed', 3: 'rgb', 4: 'cmyk', 7: 'multichannel', 8: 'duotone', 9: 'lab' };
export const MODE_LABEL = { bitmap: '位图', gray: '灰度', duotone: '双色调', indexed: '索引颜色', rgb: 'RGB 颜色', cmyk: 'CMYK 颜色', lab: 'Lab 颜色', multichannel: '多通道' };
const COLOR_N = { bitmap: 1, gray: 1, duotone: 1, indexed: 1, rgb: 3, cmyk: 4, lab: 3 };
const FLAT_ONLY = new Set(['bitmap', 'indexed', 'multichannel']);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const toU8 = b => b instanceof Uint8Array ? b : new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer, b.byteOffset || 0, b.byteLength);



export function readEmbeddedProfile(buffer) {
  const u8 = toU8(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 26; o += 4 + dv.getUint32(o);
  const len = dv.getUint32(o), end = o + 4 + len; o += 4;
  while (o + 12 <= end) {
    if (dv.getUint32(o) !== 0x3842494d) break;
    const id = dv.getUint16(o + 4); o += 6;
    const nl = u8[o]; o += 1 + nl; if ((1 + nl) % 2) o++;
    const sz = dv.getUint32(o); o += 4;
    if (id === 1039) return u8.slice(o, o + sz);
    o += sz + (sz % 2);
  }
  return null;
}
export function setEmbeddedProfile(buffer, iccBytes) {
  const ab = buffer instanceof ArrayBuffer ? buffer : toU8(buffer).slice().buffer;
  return iccBytes ? writeImageResource(ab, 1039, toU8(iccBytes), { exact: true }) : removeImageResource(ab, 1039);
}




export function writeDuotoneData(inks) {
  const out = new Uint8Array(524), dv = new DataView(out.buffer);
  dv.setUint16(0, 1); dv.setUint16(2, inks.length);
  let o = 4;
  for (let i = 0; i < 4; i++) {                      
    const k = inks[i]; dv.setUint16(o, 0);
    if (k) for (let c = 0; c < 3; c++) dv.setUint16(o + 2 + c * 2, Math.round((k.rgb[c] || 0) * 257));
    o += 10;
  }
  for (let i = 0; i < 4; i++) {                      
    const nm = inks[i] ? String(inks[i].name || '').slice(0, 63) : '';
    out[o] = nm.length; for (let c = 0; c < nm.length; c++) out[o + 1 + c] = nm.charCodeAt(c) < 256 ? nm.charCodeAt(c) : 63;
    o += 64;
  }
  for (let i = 0; i < 4; i++) {                      
    const cv = inks[i] ? (inks[i].curve || DEFAULT_CURVE) : null;
    for (let k = 0; k < 13; k++) dv.setInt16(o + k * 2, cv ? Math.round(cv[k] == null ? -1 : cv[k]) : -1);
    o += 28;
  }
  dv.setUint16(o, 0); o += 2;                        
  return out;                                        
}
export const DEFAULT_CURVE = [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1000];

export function readDuotoneData(bytes) {
  const u8 = toU8(bytes); if (u8.length < 4 + 40 + 256 + 112) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(0) !== 1) return null;
  const n = dv.getUint16(2); if (n < 1 || n > 4) return null;
  const inks = [];
  for (let i = 0; i < n; i++) {
    const co = 4 + i * 10, cs = dv.getUint16(co);
    let rgb = [0, 0, 0];
    if (cs === 0) rgb = [0, 1, 2].map(c => Math.round(dv.getUint16(co + 2 + c * 2) / 257));
    else if (cs === 2) { const c = 1 - dv.getUint16(co + 2) / 65535, m = 1 - dv.getUint16(co + 4) / 65535, y = 1 - dv.getUint16(co + 6) / 65535, k = 1 - dv.getUint16(co + 8) / 65535; rgb = [c, m, y].map(v => Math.round(255 * (1 - Math.min(1, v + k)))); }
    else if (cs === 8) { const g = 1 - dv.getUint16(co + 2) / 10000; rgb = [g, g, g].map(v => Math.round(v * 255)); }
    const no = 44 + i * 64, nl = u8[no]; let name = ''; for (let c = 0; c < nl && c < 63; c++) name += String.fromCharCode(u8[no + 1 + c]);
    const cvo = 300 + i * 28, curve = []; for (let k = 0; k < 13; k++) curve.push(dv.getInt16(cvo + k * 2));
    if (curve.some(v => v < -1 || v > 1000)) return null;
    inks.push({ name, rgb, curve });
  }
  return { inks };
}

export function duotoneCurveFn(curve) {
  const X = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
  const pts = []; for (let k = 0; k < 13; k++) if (curve[k] >= 0) pts.push([X[k] / 100, curve[k] / 1000]);
  if (!pts.length) return t => t;
  if (pts[0][0] > 0) pts.unshift([0, 0]); if (pts[pts.length - 1][0] < 1) pts.push([1, 1]);
  return t => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * ((t - x0) / (x1 - x0 || 1)); } return pts[pts.length - 1][1]; };
}

export function duotoneToRgb(inks) {
  const fns = inks.map(k => duotoneCurveFn(k.curve || DEFAULT_CURVE)), cols = inks.map(k => k.rgb.map(v => srgbDecode(v / 255)));
  return (g, out) => {
    const t = 1 - g; let r = 1, gg = 1, b = 1;
    for (let i = 0; i < fns.length; i++) { const c = clamp01(fns[i](t)); r *= 1 - c * (1 - cols[i][0]); gg *= 1 - c * (1 - cols[i][1]); b *= 1 - c * (1 - cols[i][2]); }
    out[0] = srgbEncode(r); out[1] = srgbEncode(gg); out[2] = srgbEncode(b); return out;
  };
}



function samplesToFloat(arr, depth, max16) {
  const n = arr.length, f = new Float32Array(n);
  if (depth === 8) for (let i = 0; i < n; i++) f[i] = arr[i] / 255;
  else if (depth === 16) { const k = 1 / max16; for (let i = 0; i < n; i++) f[i] = arr[i] * k; }
  else if (depth === 32) f.set(arr);
  else if (depth === 1) for (let i = 0; i < n; i++) f[i] = arr[i] ? 0 : 1;      
  return f;
}
function floatToSamples(f, depth) {
  const n = f.length;
  if (depth === 8) { const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = Math.round(clamp01(f[i]) * 255); return o; }
  if (depth === 16) { const o = new Uint16Array(n); for (let i = 0; i < n; i++) o[i] = Math.round(clamp01(f[i]) * SAMPLE16_PS); return o; }
  if (depth === 32) return Float32Array.from(f);
  if (depth === 1) { const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = f[i] < 0.5 ? 1 : 0; return o; }
  throw new Error('位深 ' + depth);
}


function linearCodec(P) {
  const trc = P && P.trc ? P.trc[0] : null;
  if (trc) return { enc: v => trc.inv(clamp01(v)), dec: v => trc.eval(clamp01(v)) };
  if (P && P.colorSpace === 'GRAY' && P.tags && P.tags.kTRC && P.tags.kTRC.eval) { const c = P.tags.kTRC; return { enc: v => c.inv(clamp01(v)), dec: v => c.eval(clamp01(v)) }; }
  return { enc: v => srgbEncode(clamp01(v)), dec: v => srgbDecode(clamp01(v)) };
}


export function hdrToneMap(planes, o = {}) {
  const m = o.method || 'exposureGamma', n = planes[0].length;
  if (m === 'exposureGamma') {
    const k = Math.pow(2, o.exposure || 0), g = o.gamma || 1;
    for (const p of planes) for (let i = 0; i < n; i++) { const v = clamp01(p[i] * k); p[i] = g === 1 ? v : srgbDecode(Math.pow(srgbEncode(v), 1 / g)); }
  } else if (m === 'highlightCompression') {
    let Lw = 0; for (const p of planes) for (let i = 0; i < n; i++) if (p[i] > Lw) Lw = p[i];
    const w2 = Math.max(1, Lw) ** 2;
    for (const p of planes) for (let i = 0; i < n; i++) { const L = Math.max(0, p[i]); p[i] = clamp01(L * (1 + L / w2) / (1 + L)); }
  } else if (m === 'equalize') {
    const lum = new Float32Array(n), B = 1024; let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { let y = 0; for (let c = 0; c < planes.length; c++) y += planes[c][i] / planes.length; const l = Math.log(Math.max(1e-6, y)); lum[i] = l; if (l < lo) lo = l; if (l > hi) hi = l; }
    const hist = new Float64Array(B + 1), span = (hi - lo) || 1;
    for (let i = 0; i < n; i++) hist[Math.round((lum[i] - lo) / span * B)]++;
    for (let i = 1; i <= B; i++) hist[i] += hist[i - 1];
    for (let i = 0; i < n; i++) {
      const y = Math.exp(lum[i]), ny = srgbDecode(hist[Math.round((lum[i] - lo) / span * B)] / n), s = y > 1e-6 ? ny / y : 0;
      for (const p of planes) p[i] = clamp01(p[i] * s);
    }
  }
  return planes;
}



function profileFor(key, opts, which) {
  if (key === 'lab') return labProfile();
  const P = opts[which];
  const want = key === 'cmyk' ? 'CMYK' : (key === 'gray' || key === 'duotone' || key === 'bitmap') ? 'GRAY' : 'RGB ';
  if (P && P.colorSpace === want) return P;          
  if (key === 'rgb' || key === 'indexed') return sRGBProfile();
  if (key === 'gray' || key === 'duotone' || key === 'bitmap') return grayProfile({ gamma: 2.2 });
  if (key === 'cmyk') throw new Error('转换 CMYK 需要一个 CMYK 配置文件（颜色设置里的工作中的 CMYK）');
  return sRGBProfile();
}


function convertColorPlanes(planes, srcKey, dstKey, opts) {
  const n = planes[0].length;
  const sKey = srcKey === 'duotone' || srcKey === 'bitmap' ? 'gray' : srcKey;
  const dKey = dstKey === 'duotone' || dstKey === 'bitmap' ? 'gray' : dstKey;
  if (sKey === dKey && !opts.dstProfile) return planes;
  if (sKey === dKey && opts.dstProfile && opts.srcProfile && opts.dstProfile === opts.srcProfile) return planes;
  const src = profileFor(sKey, opts, 'srcProfile'), dst = profileFor(dKey, opts, 'dstProfile');
  const xf = buildTransform(src, dst, { intent: opts.intent == null ? 0 : opts.intent, bpc: opts.bpc !== false });
  
  const fast = compileTransform(xf, { grid: xf.nIn === 4 ? 17 : 33 });
  const nOut = xf.nOut, out = []; for (let c = 0; c < nOut; c++) out.push(new Float32Array(n));
  const a = new Float64Array(xf.nIn), b = new Float64Array(nOut);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < xf.nIn; c++) a[c] = planes[c][i];
    fast.apply(a, b);
    for (let c = 0; c < nOut; c++) out[c][i] = b[c];
  }
  return out;
}


const storedInverted = key => key === 'cmyk' || key === 'multichannel';



const WEB = (() => { const a = []; for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) a.push([r * 51, g * 51, b * 51]); return a; })();

function medianCut(rgb, n, N, weights = [1, 1, 1]) {
  
  const H = new Map();
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let e = H.get(k); if (!e) H.set(k, e = [0, 0, 0, 0]); e[0] += r; e[1] += g; e[2] += b; e[3]++;
  }
  let boxes = [[...H.values()].map(e => [e[0] / e[3], e[1] / e[3], e[2] / e[3], e[3]])];
  const score = box => { let mn = [255, 255, 255], mx = [0, 0, 0], cnt = 0; for (const c of box) { for (let d = 0; d < 3; d++) { if (c[d] < mn[d]) mn[d] = c[d]; if (c[d] > mx[d]) mx[d] = c[d]; } cnt += c[3]; } const rg = [0, 1, 2].map(d => (mx[d] - mn[d]) * weights[d]); const ax = rg.indexOf(Math.max(...rg)); return { ax, s: Math.max(...rg) * Math.sqrt(cnt), cnt }; };
  while (boxes.length < N) {
    let bi = -1, best = 0, bax = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; const sc = score(b); if (sc.s > best) { best = sc.s; bi = i; bax = sc.ax; } });
    if (bi < 0) break;
    const box = boxes[bi].sort((p, q) => p[bax] - q[bax]);
    let tot = 0; for (const c of box) tot += c[3];
    let acc = 0, cut = 1; for (let i = 0; i < box.length - 1; i++) { acc += box[i][3]; if (acc >= tot / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes.map(b => { let s = [0, 0, 0], c = 0; for (const e of b) { s[0] += e[0] * e[3]; s[1] += e[1] * e[3]; s[2] += e[2] * e[3]; c += e[3]; } return s.map(v => Math.round(v / (c || 1))); });
}


export function buildPalette(rgb, n, o = {}) {
  const N = Math.max(2, Math.min(256, o.colors || 256));
  const kind = o.palette || 'selective';
  let pal;
  if (kind === 'exact' || kind === 'perceptual' || kind === 'selective' || kind === 'adaptive') {
    const set = new Map();
    for (let i = 0; i < n && set.size <= 256; i++) set.set((rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2], 1);
    if (set.size <= N) pal = [...set.keys()].map(k => [k >> 16, (k >> 8) & 255, k & 255]);
    else if (kind === 'exact') throw new Error(`图像有超过 ${N} 种颜色，不能用「实际」调板`);
    else if (kind === 'perceptual') pal = medianCut(rgb, n, N, [1.0, 1.25, 0.75]);   
    else if (kind === 'adaptive') pal = medianCut(rgb, n, N, [1, 1, 1]);
    else {                                                                          
      pal = medianCut(rgb, n, N, [1.0, 1.2, 0.8]).map(c => { const w = WEB.reduce((b, q) => { const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; return d < b[0] ? [d, q] : b; }, [Infinity, null]); return w[0] < 144 ? w[1].slice() : c; });
    }
  } else if (kind === 'web') pal = WEB.map(c => c.slice()).slice(0, N);
  else if (kind === 'uniform') {
    const s = Math.max(2, Math.floor(Math.cbrt(N))); pal = [];
    for (let r = 0; r < s; r++) for (let g = 0; g < s; g++) for (let b = 0; b < s; b++) pal.push([r, g, b].map(v => Math.round(v * 255 / (s - 1))));
  } else if (kind === 'gray') { pal = []; for (let i = 0; i < N; i++) { const v = Math.round(i * 255 / (N - 1)); pal.push([v, v, v]); } }
  else if (kind === 'bw') pal = [[0, 0, 0], [255, 255, 255]];
  else if (kind === 'custom') pal = (o.custom || []).slice(0, 256).map(c => c.slice(0, 3));
  else throw new Error('未知调板 ' + kind);
  
  const force = { bw: [[0, 0, 0], [255, 255, 255]], primaries: [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255], [255, 0, 255], [255, 255, 0]], web: WEB }[o.forced || 'none'];
  if (force) for (const f of force) if (!pal.some(c => c[0] === f[0] && c[1] === f[1] && c[2] === f[2])) { if (pal.length < 256) pal.push(f.slice()); }
  return pal.slice(0, 256);
}

const BAYER8 = (() => { const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]]; return m.map(r => r.map(v => (v + 0.5) / 64)); })();


export function quantize(rgb, w, h, pal, o = {}) {
  const n = w * h, idx = new Uint8Array(n);
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b; const hit = cache.get(key); if (hit !== undefined) return hit;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) { const c = pal[i]; const dr = c[0] - r, dg = c[1] - g, db = c[2] - b; const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (d < bd) { bd = d; bi = i; } }
    if (cache.size < 1 << 18) cache.set(key, bi); return bi;
  };
  const dither = o.dither || 'none', amt = (o.amount == null ? 75 : o.amount) / 100;
  if (dither === 'diffusion') {
    const err = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) err[i] = rgb[i];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, r = Math.max(0, Math.min(255, Math.round(err[i * 3]))), g = Math.max(0, Math.min(255, Math.round(err[i * 3 + 1]))), b = Math.max(0, Math.min(255, Math.round(err[i * 3 + 2])));
      const k = nearest(r, g, b); idx[i] = k; const c = pal[k];
      const e = [(err[i * 3] - c[0]) * amt, (err[i * 3 + 1] - c[1]) * amt, (err[i * 3 + 2] - c[2]) * amt];
      const push = (xx, yy, f) => { if (xx < 0 || xx >= w || yy >= h) return; const j = (yy * w + xx) * 3; err[j] += e[0] * f; err[j + 1] += e[1] * f; err[j + 2] += e[2] * f; };
      push(x + 1, y, 7 / 16); push(x - 1, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + 1, y + 1, 1 / 16);
    }
    return idx;
  }
  const spread = 255 / Math.max(2, Math.cbrt(pal.length));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let d = 0;
    if (dither === 'pattern') d = (BAYER8[y & 7][x & 7] - 0.5) * spread * amt;
    else if (dither === 'noise') d = ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000 - 0.5) * spread * amt;
    const cl = v => Math.max(0, Math.min(255, Math.round(v + d)));
    idx[i] = nearest(cl(rgb[i * 3]), cl(rgb[i * 3 + 1]), cl(rgb[i * 3 + 2]));
  }
  return idx;
}




export function toBitmap(gray, w, h, o = {}) {
  const m = o.method || 'diffusion', n = w * h, out = new Uint8Array(n);
  if (m === 'threshold') { for (let i = 0; i < n; i++) out[i] = gray[i] < 0.5 ? 1 : 0; return out; }
  if (m === 'pattern') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = gray[y * w + x] < BAYER8[y & 7][x & 7] ? 1 : 0; return out; }
  if (m === 'diffusion') {
    const e = Float32Array.from(gray);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = e[i], b = v < 0.5 ? 1 : 0, err = v - (b ? 0 : 1); out[i] = b;
      if (x + 1 < w) e[i + 1] += err * 7 / 16;
      if (y + 1 < h) { if (x > 0) e[i + w - 1] += err * 3 / 16; e[i + w] += err * 5 / 16; if (x + 1 < w) e[i + w + 1] += err / 16; }
    }
    return out;
  }
  if (m === 'custom') {
    const P = o.pattern; if (!P || !P.gray) throw new Error('自定图案：先选一个图案');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = gray[y * w + x] < P.gray[(y % P.height) * P.width + (x % P.width)] / 255 ? 1 : 0;
    return out;
  }
  if (m === 'halftone') {
    
    const res = o.resolution || 72, freq = Math.max(1, o.frequency || 53), cell = Math.max(2, res / freq);
    const a = (o.angle == null ? 45 : o.angle) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), shape = o.shape || 'round';
    const spot = (u, v) => {        
      switch (shape) {
        case 'ellipse': return 1 - (u * u * 0.8 + v * v * 1.2) / 2;
        case 'line': return 1 - Math.abs(v);
        case 'square': return 1 - Math.max(Math.abs(u), Math.abs(v));
        case 'cross': return 1 - Math.min(Math.abs(u), Math.abs(v));
        case 'diamond': return 1 - (Math.abs(u) + Math.abs(v)) / 2;
        default: return 1 - (u * u + v * v) / 2;
      }
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = (x * ca + y * sa) / cell, py = (-x * sa + y * ca) / cell;
      const u = (px - Math.floor(px)) * 2 - 1, v = (py - Math.floor(py)) * 2 - 1;
      const t = clamp01(spot(u, v));
      out[y * w + x] = (1 - gray[y * w + x]) > 1 - t ? 1 : 0;
    }
    return out;
  }
  throw new Error('未知位图方法 ' + m);
}



function colorPlanesOf(byId, nColor) { const a = []; for (let c = 0; c < nColor; c++) a.push(byId[c] || null); return a; }


function decodeColorPlanes(raw, n, srcKey, depth, max16, lin, palette, duo) {
  if (srcKey === 'indexed') {
    const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), p = raw[0];
    for (let i = 0; i < n; i++) { const k = p ? p[i] : 0; r[i] = palette.r[k] / 255; g[i] = palette.g[k] / 255; b[i] = palette.b[k] / 255; }
    return { planes: [r, g, b], key: 'rgb' };
  }
  const f = raw.map(p => p ? samplesToFloat(p, depth, max16) : new Float32Array(n).fill(storedInverted(srcKey) ? 1 : 0));
  if (storedInverted(srcKey)) for (const p of f) for (let i = 0; i < n; i++) p[i] = 1 - p[i];
  if (depth === 32 && (srcKey === 'rgb' || srcKey === 'gray')) for (const p of f) for (let i = 0; i < n; i++) p[i] = lin.enc(p[i]);   
  if (srcKey === 'duotone' && duo && raw.length) {
    
    const fn = duotoneToRgb(duo.inks), o = [0, 0, 0], r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { fn(f[0][i], o); r[i] = o[0]; g[i] = o[1]; b[i] = o[2]; }
    return { planes: [r, g, b], key: 'rgb', duoRgb: true };
  }
  if (srcKey === 'multichannel') {
    
    if (f.length >= 4) return { planes: f.slice(0, 4), key: 'cmyk' };
    if (f.length === 3) return { planes: f.map(p => { const q = new Float32Array(n); for (let i = 0; i < n; i++) q[i] = 1 - p[i]; return q; }), key: 'rgb' };
    const q = new Float32Array(n); for (let i = 0; i < n; i++) q[i] = 1 - f[0][i]; return { planes: [q], key: 'gray' };
  }
  return { planes: f, key: srcKey };
}

function encodePlanesForTarget(planes, dstKey, depth, lin) {
  const out = planes.map(p => Float32Array.from(p));
  
  for (const p of out) for (let i = 0; i < p.length; i++) { const v = p[i]; if (v < 0.006) p[i] = 0; else if (v > 0.994 && v <= 1.006) p[i] = 1; }
  if (storedInverted(dstKey)) for (const p of out) for (let i = 0; i < p.length; i++) p[i] = 1 - p[i];
  if (depth === 32 && (dstKey === 'rgb' || dstKey === 'gray')) for (const p of out) for (let i = 0; i < p.length; i++) p[i] = lin.dec(p[i]);
  return out.map(p => floatToSamples(p, depth));
}


function toTargetFloat(dec, dstKey, opts) {
  if (dstKey === 'multichannel') {
    
    if (dec.key === 'cmyk') return dec.planes;
    if (dec.key === 'gray') return [dec.planes[0].map(v => 1 - v)];
    const rgb = dec.key === 'rgb' ? dec.planes : convertColorPlanes(dec.planes, dec.key, 'rgb', { ...opts, dstProfile: opts.srcRgbProfile || null });
    return rgb.map(p => p.map(v => 1 - v));
  }
  const tKey = dstKey === 'indexed' ? 'rgb' : dstKey;
  const o = { ...opts };
  if (dec.key !== (opts.srcKey === 'indexed' ? 'rgb' : opts.srcKey) && dec.key !== tKey) o.srcProfile = null;   
  if (dec.duoRgb) o.srcProfile = null;
  return convertColorPlanes(dec.planes, dec.key, tKey, o);
}




export function convertDocument(buffer, target, opts = {}) {
  const u8 = toU8(buffer);
  const doc = parsePsdDocument(u8);
  const H = doc.header;
  const srcKey = MODE_KEY[H.mode];
  if (!srcKey) throw new Error(`不认识的颜色模式 ${H.mode}`);
  const dstKey = target.mode || srcKey;
  if (!(dstKey in MODE_ID)) throw new Error('目标模式 ' + dstKey + ' 不认识');
  const srcDepth = H.depth;
  let dstDepth = target.depth || (srcDepth === 1 ? 8 : srcDepth);
  if (dstKey === 'bitmap') dstDepth = 1;
  else if (dstDepth === 1) dstDepth = 8;
  if ((dstKey === 'indexed' || dstKey === 'duotone') && dstDepth !== 8 && !(dstKey === 'duotone' && dstDepth === 16)) {
    if (dstKey === 'indexed') dstDepth = 8;
  }
  
  const W = H.width, Hh = H.height, N = W * Hh;
  const srcNColor = srcKey === 'multichannel' ? Math.max(1, H.channels) : COLOR_N[srcKey];
  const lamRaw = doc.layerAndMask && doc.layerAndMask._writeMode === 'raw';
  if (lamRaw) throw new Error('这份文件的图层段无法按结构改写（解析时已降级为原样字节）');
  const opt2 = { ...opts, srcKey };
  const srcP = opts.srcProfile || null;
  const linSrc = linearCodec(srcP), linDst = linearCodec(opts.dstProfile || srcP);
  let palette = null;
  if (srcKey === 'indexed') {
    const pm = doc.colorModeData && doc.colorModeData.palette;
    palette = pm ? { r: pm.r, g: pm.g, b: pm.b } : { r: new Uint8Array(256).map((_, i) => i), g: new Uint8Array(256).map((_, i) => i), b: new Uint8Array(256).map((_, i) => i) };
  }
  const duo = srcKey === 'duotone' ? (readDuotoneData(doc.colorModeData && doc.colorModeData._raw || []) || { inks: [{ name: 'Black', rgb: [0, 0, 0], curve: DEFAULT_CURVE }] }) : null;
  const hdr = srcDepth === 32 && dstDepth !== 32 && (dstKey === 'rgb' || dstKey === 'gray' || srcKey === 'rgb' || srcKey === 'gray');
  const notes = [];

  
  const comp = decodeComposite(doc, u8);
  const cPlanes = comp.channels || comp.planes || [];
  const max16c = srcDepth === 16 ? detectSample16Max(cPlanes) : SAMPLE16_PS;
  const nExtra = Math.max(0, H.channels - srcNColor);
  const hasMergedAlpha = doc.layerInfo && doc.layerInfo.countRaw < 0 && nExtra > 0;
  let dec = decodeColorPlanes(colorPlanesOf(cPlanes, srcNColor), N, srcKey, srcDepth, max16c, linSrc, palette, duo);
  if (hdr) { dec.planes = dec.planes.map(p => p.map(v => linSrc.dec(v))); hdrToneMap(dec.planes, opts.hdr || {}); dec.planes = dec.planes.map(p => p.map(v => linSrc.enc(v))); }
  const flatten = FLAT_ONLY.has(dstKey);
  let extras = cPlanes.slice(srcNColor);
  if (flatten && hasMergedAlpha) {
    
    const A = samplesToFloat(extras[0], srcDepth, max16c), m = opts.matte || [255, 255, 255];
    const matteDev = dec.key === 'cmyk' ? [0, 0, 0, 0] : dec.key === 'gray' ? [m[0] / 255] : dec.key === 'lab' ? [1, 0.5, 0.5] : m.map(v => v / 255);
    for (let c = 0; c < dec.planes.length; c++) { const p = dec.planes[c]; for (let i = 0; i < N; i++) p[i] = p[i] * A[i] + matteDev[c] * (1 - A[i]); }
    extras = extras.slice(1);
  }
  let colorOut, cmData = null, resources = [];
  if (dstKey === 'bitmap' || dstKey === 'indexed') {
    if (dstKey === 'bitmap') {
      const g = toTargetFloat(dec, 'gray', opt2)[0];
      colorOut = [toBitmap(g, W, Hh, { ...(opts.bitmap || {}), resolution: opts.resolution })];
    } else {
      const rgbF = toTargetFloat(dec, 'rgb', opt2), rgb = new Uint8Array(N * 3);
      for (let i = 0; i < N; i++) { rgb[i * 3] = Math.round(clamp01(rgbF[0][i]) * 255); rgb[i * 3 + 1] = Math.round(clamp01(rgbF[1][i]) * 255); rgb[i * 3 + 2] = Math.round(clamp01(rgbF[2][i]) * 255); }
      const io = opts.indexed || {};
      const pal = buildPalette(rgb, N, io);
      colorOut = [quantize(rgb, W, Hh, pal, io)];
      const r = new Uint8Array(256), g = new Uint8Array(256), b = new Uint8Array(256);
      pal.forEach((c, i) => { r[i] = c[0]; g[i] = c[1]; b[i] = c[2]; });
      cmData = { kind: 'indexed', palette: { r, g, b } };
      const cnt = new Uint8Array(2); new DataView(cnt.buffer).setUint16(0, pal.length);
      resources.push([1046, cnt]);
      notes.push(`调板 ${pal.length} 色`);
    }
  } else {
    const fl = toTargetFloat(dec, dstKey, opt2);
    colorOut = encodePlanesForTarget(fl, dstKey, dstDepth, linDst);
  }
  if (dstKey === 'duotone') cmData = { kind: 'duotone', _raw: writeDuotoneData((opts.duotone && opts.duotone.inks) || [{ name: 'Black', rgb: [0, 0, 0], curve: DEFAULT_CURVE }]) };
  
  const extraOut = extras.map(p => floatToSamples(samplesToFloat(p, srcDepth, max16c), dstDepth === 1 ? 8 : dstDepth));
  if (dstKey === 'bitmap' && extraOut.length) { notes.push('位图模式不能带 Alpha 通道，已丢弃'); extraOut.length = 0; }
  const allOut = colorOut.concat(extraOut);
  const compression = dstDepth === 32 ? Compression.RAW : Compression.RLE;
  const { encodeCompositeImage } = PSDIMG;
  const imgBytes = encodeCompositeImage({ planes: allOut, width: W, height: Hh, depth: dstDepth, compression, psb: H.psb });
  doc.imageData = { compression, _raw: imgBytes };

  
  const allLayers = doc.layers.slice();
  
  if (!flatten && !allLayers.length) {
    const bg = makeBackgroundLayer(colorOut, W, Hh, dstDepth, H.psb);
    if (!doc.layerInfo) doc.layerInfo = { present: true, countRaw: 0, layers: [], tail: new Uint8Array(0) };
    doc.layerInfo.present = true; doc.layerInfo.layers = [bg]; doc.layerInfo.countRaw = 1; doc.layerInfo.tail = new Uint8Array(0);
    if (!doc.layerAndMask || !doc.layerAndMask.present) doc.layerAndMask = { present: true };
    if (!doc.globalLayerMask) doc.globalLayerMask = null;
  }
  if (flatten) {
    if (allLayers.length) notes.push(`已拼合 ${allLayers.length} 个图层（${MODE_LABEL[dstKey]}模式不支持图层）`);
    if (doc.layerInfo) { doc.layerInfo.layers = []; doc.layerInfo.countRaw = 0; doc.layerInfo.tail = new Uint8Array(0); doc.layerInfo.present = true; }
    doc.globalAdditional = doc.globalAdditional.filter(b => !b.layerInfo && b.key !== 'Lr16' && b.key !== 'Lr32');
  } else {
    const dstNColor = dstKey === 'multichannel' ? (dec.key === 'cmyk' ? 4 : dec.key === 'gray' ? 1 : 3) : COLOR_N[dstKey];
    for (const L of allLayers) {
      const w = L.bounds.right - L.bounds.left, h = L.bounds.bottom - L.bounds.top;
      let px = null;
      try { px = decodeLayerPixels(doc, u8, L.index); } catch (e) { throw new Error(`图层「${L.unicodeName || L.name}」像素解码失败：${e.message}`); }
      const byId = px.byId || px.channels;
      const n = w * h;
      const newCh = [];
      const encode = (id, samples, cw, chh) => ({ id, info: null, length: 0, compression: dstDepth === 32 ? 2 : 1,
        _raw: encodeChannel({ data: samples, width: cw, height: chh, depth: dstDepth, compression: dstDepth === 32 ? Compression.ZIP : Compression.RLE, psb: H.psb, reuseRaw: false, withHeader: true }), _dirty: true });
      const max16 = srcDepth === 16 ? detectSample16Max(Object.values(byId || {})) : SAMPLE16_PS;
      if (n > 0 && byId && byId[0]) {
        let d = decodeColorPlanes(colorPlanesOf(byId, srcNColor), n, srcKey, srcDepth, max16, linSrc, palette, duo);
        if (hdr) { d.planes = d.planes.map(p => p.map(v => linSrc.dec(v))); hdrToneMap(d.planes, opts.hdr || {}); d.planes = d.planes.map(p => p.map(v => linSrc.enc(v))); }
        const outP = encodePlanesForTarget(toTargetFloat(d, dstKey, opt2), dstKey, dstDepth, linDst);
        if (byId[-1]) newCh.push(encode(-1, floatToSamples(samplesToFloat(byId[-1], srcDepth, max16), dstDepth), w, h));
        outP.forEach((p, c) => newCh.push(encode(c, p, w, h)));
      } else if (n > 0) {
        if (byId && byId[-1]) newCh.push(encode(-1, floatToSamples(samplesToFloat(byId[-1], srcDepth, max16), dstDepth), w, h));
        for (let c = 0; c < dstNColor; c++) newCh.push(encode(c, floatToSamples(new Float32Array(n).fill(storedInverted(dstKey) ? 1 : 0), dstDepth), w, h));
      } else {
        const empty = (id) => ({ id, info: null, length: 2, compression: 0, _raw: Uint8Array.of(0, 0), _dirty: true });
        if (L.channels.some(c => c.id === -1)) newCh.push(empty(-1));
        for (let c = 0; c < dstNColor; c++) newCh.push(empty(c));
      }
      
      for (const ch of L.channels) {
        if (ch.id >= -1) continue;
        if (srcDepth === dstDepth) { newCh.push(ch); continue; }
        const s = byId && byId[ch.id];
        const m = ch.id === -3 && L.mask && L.mask.realUser ? L.mask.realUser : L.mask;
        const mw = s && s._width != null ? s._width : (m ? (m.right - m.left) : 0), mh = s && s._height != null ? s._height : (m ? (m.bottom - m.top) : 0);
        if (s && mw * mh === s.length && s.length) newCh.push(encode(ch.id, floatToSamples(samplesToFloat(s, srcDepth, max16), dstDepth), mw, mh));
        else newCh.push({ id: ch.id, info: null, length: 2, compression: 0, _raw: Uint8Array.of(0, 0), _dirty: true });
      }
      for (const c of newCh) c.length = c._raw.length;
      L.channels = newCh;
    }
    
    if (srcDepth !== dstDepth && doc.globalAdditional.some(b => b.layerInfo && b.layerInfo.layers.length)) {
      const main = doc.layerInfo || (doc.layerInfo = { present: true, countRaw: 0, layers: [], tail: new Uint8Array(0) });
      main.present = true;
      main.layers = allLayers; main.countRaw = (doc.globalAdditional.find(b => b.layerInfo && b.layerInfo.countRaw < 0) ? -1 : 1) * allLayers.length;
      main.tail = new Uint8Array(0);
      doc.globalAdditional = doc.globalAdditional.filter(b => !(b.layerInfo && (b.key === 'Lr16' || b.key === 'Lr32')));
    }
  }

  
  H.mode = MODE_ID[dstKey]; H.depth = dstDepth; H.channels = allOut.length;
  const previousColorData = doc.colorModeData?._raw;
  doc.colorModeData = cmData ? { ...cmData, _writeMode: 'semantic', _raw: cmData._raw || new Uint8Array(0), duotone: cmData.kind === 'duotone' ? { _raw: cmData._raw } : undefined } : { kind: 'empty', _raw: new Uint8Array(0), _writeMode: 'semantic' };
  if (dstDepth===32 && (dstKey==='rgb'||dstKey==='gray')) doc.colorModeData={kind:'unknown',_writeMode:'raw',_raw:srcDepth===32&&previousColorData?.length?previousColorData:defaultHdrColorModeData()};
  if (doc.layerAndMask && !doc.layerAndMask.present && !flatten && doc.layers.length) doc.layerAndMask.present = true;

  let out = serializeEven(doc);
  
  let ab = out.buffer.byteLength === out.length ? out.buffer : out.slice().buffer;
  const iccFor = dstKey === 'lab' || dstKey === 'bitmap' || dstKey === 'multichannel' || dstKey === 'duotone' ? null
    : (dstKey === 'indexed' ? (opts.dstProfile || opts.srcProfile) : (opts.dstProfile || (MODE_ID[dstKey] === H.mode && srcKey === dstKey ? opts.srcProfile : null)));
  if (opts.embedProfile !== false) {
    if (iccFor && iccFor.bytes) ab = setEmbeddedProfile(ab, iccFor.bytes);
    else if (dstKey !== srcKey) ab = removeImageResource(ab, 1039);
  }
  if (dstKey !== 'indexed') { ab = removeImageResource(ab, 1046); ab = removeImageResource(ab, 1047); }
  for (const [id, data] of resources) ab = writeImageResource(ab, id, data, { exact: true });
  return { buffer: ab, notes };
}

import * as PSDIMG from './psd-image.js';


function makeBackgroundLayer(planes, W, H, depth, psb) {
  const name = '背景';
  const enc = (id, data) => { const raw = encodeChannel({ data, width: W, height: H, depth, compression: depth === 32 ? Compression.ZIP : Compression.RLE, psb, reuseRaw: false, withHeader: true }); return { id, info: null, length: raw.length, compression: 1, _raw: raw, _dirty: true }; };
  const alpha = depth === 8 ? new Uint8Array(W * H).fill(255) : depth === 16 ? new Uint16Array(W * H).fill(SAMPLE16_PS) : new Float32Array(W * H).fill(1);
  const channels = [enc(-1, alpha), ...planes.map((p, c) => enc(c, p))];
  
  const bytes = []; const u32 = v => bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  u32(0); u32(0);
  const pn = 'Background'; bytes.push(pn.length); for (const ch of pn) bytes.push(ch.charCodeAt(0)); while ((bytes.length - 8) % 4) bytes.push(0);
  const luni = []; const lu32 = v => luni.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  lu32(name.length); for (const ch of name) luni.push(ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 255); while (luni.length % 4) luni.push(0);
  for (const c of '8BIMluni') bytes.push(c.charCodeAt(0)); u32(luni.length); bytes.push(...luni);
  for (const c of '8BIMlspf') bytes.push(c.charCodeAt(0)); u32(4); u32(1);
  return {
    index: 0, name: pn, unicodeName: name, bounds: { top: 0, left: 0, bottom: H, right: W },
    blend: { sig: '8BIM', key: 'norm', opacity: 255, clipping: 0, flags: 0x09, filler: 0 },
    channels, mask: null, additional: Object.create(null), additionalBlocks: [], _extraRaw: Uint8Array.from(bytes), _off: {},
  };
}


export { normalizeHighDepthLayers } from './psd-highdepth.js';



export function readIndexedPalette(buffer) {
  const doc = parsePsdDocument(toU8(buffer));
  if (doc.header.mode !== 2) return null;
  const p = doc.colorModeData.palette; if (!p) return null;
  const out = []; for (let i = 0; i < 256; i++) out.push([p.r[i], p.g[i], p.b[i]]);
  let count = 256;
  const u8 = toU8(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  try { let o = 26; o += 4 + dv.getUint32(o); const end = o + 4 + dv.getUint32(o); o += 4; while (o + 12 <= end) { const id = dv.getUint16(o + 4); o += 6; const nl = u8[o]; o += 1 + nl; if ((1 + nl) % 2) o++; const sz = dv.getUint32(o); o += 4; if (id === 1046 && sz >= 2) count = dv.getUint16(o); o += sz + (sz % 2); } } catch {}
  return { colors: out.slice(0, count), count };
}

export function setIndexedPalette(buffer, colors) {
  const doc = parsePsdDocument(toU8(buffer));
  if (doc.header.mode !== 2) throw new Error('只有索引颜色模式的文档才有颜色表');
  const r = new Uint8Array(256), g = new Uint8Array(256), b = new Uint8Array(256);
  colors.slice(0, 256).forEach((c, i) => { r[i] = c[0]; g[i] = c[1]; b[i] = c[2]; });
  doc.colorModeData = { kind: 'indexed', palette: { r, g, b }, _writeMode: 'semantic', _raw: new Uint8Array(0) };
  let ab = serializePsdDocument(doc).slice().buffer;
  const cnt = new Uint8Array(2); new DataView(cnt.buffer).setUint16(0, Math.min(256, colors.length));
  return writeImageResource(ab, 1046, cnt, { exact: true });
}










export function trapCmyk(planes, w, h, width = 1) {
  const r = Math.max(1, Math.round(width)), n = w * h;
  const [C, M, Y, K] = planes;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (1 - C[i]) * 0.3 + (1 - M[i]) * 0.59 + (1 - Y[i]) * 0.11 - K[i];   
  const out = [Float32Array.from(C), Float32Array.from(M), Float32Array.from(Y), Float32Array.from(K)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = y * w + x, lq = lum[q];
    let c = C[q], m = M[q], yy = Y[q];
    for (let dy = -r; dy <= r; dy++) {
      const yy2 = y + dy; if (yy2 < 0 || yy2 >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (!dx && !dy) continue; if (dx * dx + dy * dy > r * r + r) continue;
        const x2 = x + dx; if (x2 < 0 || x2 >= w) continue;
        const p = yy2 * w + x2;
        if (lum[p] + 1e-3 < lq) continue;                
        if (Math.abs(lum[p] - lq) < 1e-3 && !(C[p] > 0.5 && M[q] > 0.5) && !(M[p] > 0.5 && C[q] > 0.5)) continue;
        if (C[p] > c) c = C[p]; if (M[p] > m) m = M[p]; if (Y[p] > yy) yy = Y[p];
      }
    }
    if (lq < 1) { out[0][q] = c; out[1][q] = m; out[2][q] = yy; }
  }
  return out;
}


export function trapDocument(buffer, layerIndex, width) {
  const u8 = toU8(buffer), doc = parsePsdDocument(u8), H = doc.header;
  if (H.mode !== 4) throw new Error('陷印只适用于 CMYK 模式的文档');
  const depth = H.depth;
  const run = (byId, w, h) => {
    const max16 = depth === 16 ? detectSample16Max([byId[0], byId[1], byId[2], byId[3]]) : SAMPLE16_PS;
    const f = [0, 1, 2, 3].map(c => { const p = samplesToFloat(byId[c], depth, max16); for (let i = 0; i < p.length; i++) p[i] = 1 - p[i]; return p; });
    const t = trapCmyk(f, w, h, width);
    return t.map(p => { for (let i = 0; i < p.length; i++) p[i] = 1 - p[i]; return floatToSamples(p, depth); });
  };
  if (layerIndex >= 0) {
    const L = doc.layers[layerIndex]; if (!L) throw new Error('图层不存在');
    const w = L.bounds.right - L.bounds.left, h = L.bounds.bottom - L.bounds.top;
    const px = decodeLayerPixels(doc, u8, layerIndex), byId = px.byId || px.channels;
    if (!byId[0]) throw new Error('这个图层没有像素');
    const outP = run(byId, w, h);
    for (const ch of L.channels) if (ch.id >= 0 && ch.id < 4) {
      ch._raw = encodeChannel({ data: outP[ch.id], width: w, height: h, depth, compression: Compression.RLE, psb: H.psb, reuseRaw: false, withHeader: true });
      ch.length = ch._raw.length; ch._dirty = true;
    }
  }
  
  const comp = decodeComposite(doc, u8), cp = comp.channels;
  const t = run({ 0: cp[0], 1: cp[1], 2: cp[2], 3: cp[3] }, H.width, H.height);
  doc.imageData = { _raw: PSDIMG.encodeCompositeImage({ planes: [...t, ...cp.slice(4)], width: H.width, height: H.height, depth, compression: Compression.RLE, psb: H.psb }) };
  const out = serializeEven(doc);
  return out.slice().buffer;
}

export default { convertDocument, readEmbeddedProfile, setEmbeddedProfile, trapDocument, trapCmyk, setIndexedPalette, readIndexedPalette, buildPalette, quantize, toBitmap, hdrToneMap, writeDuotoneData, readDuotoneData, duotoneToRgb, MODE_ID, MODE_KEY, MODE_LABEL };
