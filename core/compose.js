






import { applyAdjustment } from './adjust.js';
import { parseLut, applyLutRGBA } from './lut.js';   
import { groupSubpaths } from './psd-path.js';
import { patternToRGBA } from './psd-additional.js';
import { buildGradientLut, buildNoiseLut, ditherNoise, methodFromKey } from './paint-fill.js';
import { contourPointsOf, contourLutFromPoints } from './contour.js';   
import { adjustAlpha, featherDensityPlane } from './mask-feather.js';   





const B = {
  norm: (b, s) => s,
  pass: (b, s) => s,
  diss: (b, s) => s,
  dark: (b, s) => Math.min(b, s),
  'mul ': (b, s) => b * s,
  idiv: (b, s) => s <= 0 ? 0 : b >= 1 ? 1 : 1 - Math.min(1, (1 - b) / s),   
  lbrn: (b, s) => Math.max(0, b + s - 1),                                   
  lite: (b, s) => Math.max(b, s),
  scrn: (b, s) => b + s - b * s,
  'div ': (b, s) => s >= 1 ? 1 : b <= 0 ? 0 : Math.min(1, b / (1 - s)),     
  lddg: (b, s) => Math.min(1, b + s),                                       
  over: (b, s) => b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s),
  sLit: (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    return b + (2 * s - 1) * (Math.sqrt(b) - b);                            
  },
  hLit: (b, s) => s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s),
  vLit: (b, s) => s <= 0.5                                                  
    ? (s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / (2 * s)))
    : (s >= 1 ? 1 : Math.min(1, b / (2 - 2 * s))),
  lLit: (b, s) => Math.min(1, Math.max(0, b + 2 * s - 1)),                    
  pLit: (b, s) => s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1),   
  hMix: (b, s) => (Math.round((b + s) * 255) >= 255 ? 1 : 0),           
  diff: (b, s) => Math.abs(b - s),
  smud: (b, s) => b + s - 2 * b * s,                                         
  fsub: (b, s) => Math.max(0, b - s),                                        
  fdiv: (b, s) => s <= 0 ? 1 : Math.min(1, b / s)                            
};




const LUMA = [0.3, 0.59, 0.11];
const lumOf = C => LUMA[0] * C[0] + LUMA[1] * C[1] + LUMA[2] * C[2];
const satOf = C => Math.max(C[0], C[1], C[2]) - Math.min(C[0], C[1], C[2]);


function clipColor(C) {
  const L = lumOf(C), n = Math.min(C[0], C[1], C[2]), x = Math.max(C[0], C[1], C[2]);
  if (n < 0) { const d = L - n; for (let k = 0; k < 3; k++) C[k] = d > 0 ? L + ((C[k] - L) * L) / d : L; }
  if (x > 1) { const d = x - L; for (let k = 0; k < 3; k++) C[k] = d > 0 ? L + ((C[k] - L) * (1 - L)) / d : L; }
  return C;
}
function setLum(C, l) {
  const d = l - lumOf(C);
  C[0] += d; C[1] += d; C[2] += d;
  return clipColor(C);
}
function setSat(C, s) {
  let iMn = 0, iMx = 0;
  for (let k = 1; k < 3; k++) { if (C[k] < C[iMn]) iMn = k; if (C[k] > C[iMx]) iMx = k; }
  const mn = C[iMn], mx = C[iMx];
  if (mx > mn) {
    const iMid = 3 - iMn - iMx;                 
    C[iMid] = ((C[iMid] - mn) * s) / (mx - mn);
    C[iMx] = s; C[iMn] = 0;
  } else { C[0] = C[1] = C[2] = 0; }
  return C;
}

const NONSEP = {
  'hue ': (cb, cs) => setLum(setSat([cs[0], cs[1], cs[2]], satOf(cb)), lumOf(cb)),
  'sat ': (cb, cs) => setLum(setSat([cb[0], cb[1], cb[2]], satOf(cs)), lumOf(cb)),
  colr:   (cb, cs) => setLum([cs[0], cs[1], cs[2]], lumOf(cb)),
  'lum ': (cb, cs) => setLum([cb[0], cb[1], cb[2]], lumOf(cs)),
  dkCl:   (cb, cs) => lumOf(cs) < lumOf(cb) ? [cs[0], cs[1], cs[2]] : [cb[0], cb[1], cb[2]],
  lgCl:   (cb, cs) => lumOf(cs) > lumOf(cb) ? [cs[0], cs[1], cs[2]] : [cb[0], cb[1], cb[2]]
};

export const SUPPORTED_BLEND_MODES = Object.keys(B).concat(Object.keys(NONSEP));

export function blendSeparableChannel(key, b, s) {
  if (!B[key]) throw new Error(`非逐通道混合模式：${key}`);
  return B[key](b,s);
}





export function blendPixelRGB(key, b, s) {
  const f = B[key];
  if (f) return [f(b[0] / 255, s[0] / 255) * 255, f(b[1] / 255, s[1] / 255) * 255, f(b[2] / 255, s[2] / 255) * 255];
  const g = NONSEP[key];
  if (g) { const r = g([b[0] / 255, b[1] / 255, b[2] / 255], [s[0] / 255, s[1] / 255, s[2] / 255]); return [r[0] * 255, r[1] * 255, r[2] * 255]; }
  return [s[0], s[1], s[2]];
}








export function createSurface(width, height) {
  return { data: new Uint8ClampedArray(width * height * 4), width, height,
           dirty: { left: width, top: height, right: 0, bottom: 0 } };
}

export function markAllDirty(surf) {
  if (surf.dirty) { surf.dirty.left = 0; surf.dirty.top = 0; surf.dirty.right = surf.width; surf.dirty.bottom = surf.height; }
  return surf;
}

export function dirtyRect(surf) {
  const d = surf && surf.dirty;
  if (!d) return { left: 0, top: 0, right: surf.width, bottom: surf.height };
  return { left: Math.max(0, d.left), top: Math.max(0, d.top), right: Math.min(surf.width, d.right), bottom: Math.min(surf.height, d.bottom) };
}
function growDirty(dst, x0, y0, x1, y1) {
  const d = dst.dirty;
  if (!d || x1 <= x0 || y1 <= y0) return;
  if (x0 < d.left) d.left = x0;
  if (y0 < d.top) d.top = y0;
  if (x1 > d.right) d.right = x1;
  if (y1 > d.bottom) d.bottom = y1;
}








export function drawLayer(dst, src, left, top, o = {}) {
  const opacity = o.opacity == null ? 1 : o.opacity;
  if (opacity <= 0) return dst;
  if (o.blendMode === 'diss') {
    

    const W = src.width, H = src.height, S = src.data, out = new Uint8ClampedArray(S.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4, a = S[q + 3]; if (!a) continue;
      let h = Math.imul((x + left) | 0, 374761393) + Math.imul((y + top) | 0, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      if (((h >>> 0) / 4294967296) * 255 < a * opacity) { out[q] = S[q]; out[q + 1] = S[q + 1]; out[q + 2] = S[q + 2]; out[q + 3] = 255; }
    }
    return drawLayer(dst, { data: out, width: W, height: H }, left, top, { ...o, opacity: 1, blendMode: 'norm' });
  }
  const f = B[o.blendMode] || B.norm;
  const nf = NONSEP[o.blendMode] || null;   
  const D = dst.data, S = src.data, DW = dst.width, DH = dst.height;
  const cb = [0, 0, 0], cs = [0, 0, 0];     

  let x0 = Math.max(0, left), y0 = Math.max(0, top);
  let x1 = Math.min(DW, left + src.width), y1 = Math.min(DH, top + src.height);
  if (o.region) {   
    x0 = Math.max(x0, o.region.left); y0 = Math.max(y0, o.region.top);
    x1 = Math.min(x1, o.region.right); y1 = Math.min(y1, o.region.bottom);
  }
  if (x1 <= x0 || y1 <= y0) return dst;
  growDirty(dst, x0, y0, x1, y1);

  






  if (!nf && f === B.norm) {
    const bulk = opacity >= 1 && (D.byteOffset & 3) === 0 && (S.byteOffset & 3) === 0;
    const D32 = bulk ? new Uint32Array(D.buffer, D.byteOffset, D.length >> 2) : null;
    const S32 = bulk ? new Uint32Array(S.buffer, S.byteOffset, S.length >> 2) : null;
    for (let y = y0; y < y1; y++) {
      let si = ((y - top) * src.width + (x0 - left)) * 4, di = (y * DW + x0) * 4;
      let x = x0;
      while (x < x1) {
        if (bulk && S[si + 3] === 255) {
          let n = 1;
          while (x + n < x1 && S[si + (n << 2) + 3] === 255) n++;
          const sp = si >> 2, dp = di >> 2;
          if (n > 8) D32.set(S32.subarray(sp, sp + n), dp);
          else for (let k = 0; k < n; k++) D32[dp + k] = S32[sp + k];
          x += n; si += n << 2; di += n << 2;
          continue;
        }
        const sA = S[si + 3];
        if (sA === 0) { x++; si += 4; di += 4; continue; }
        const sa = (sA / 255) * opacity;
        if (sa <= 0) { x++; si += 4; di += 4; continue; }
        if (sa >= 1) { D[di] = S[si]; D[di + 1] = S[si + 1]; D[di + 2] = S[si + 2]; D[di + 3] = 255; x++; si += 4; di += 4; continue; }
        const da = D[di + 3] / 255;
        const na = sa + da * (1 - sa);
        if (na <= 0) { D[di + 3] = 0; x++; si += 4; di += 4; continue; }
        const kb = (1 - sa) * da, ks = sa;   
        
        D[di] = ((kb * (D[di] / 255) + ks * (S[si] / 255)) / na * 255 + .5) | 0;
        D[di + 1] = ((kb * (D[di + 1] / 255) + ks * (S[si + 1] / 255)) / na * 255 + .5) | 0;
        D[di + 2] = ((kb * (D[di + 2] / 255) + ks * (S[si + 2] / 255)) / na * 255 + .5) | 0;
        D[di + 3] = (na * 255 + .5) | 0;
        x++; si += 4; di += 4;
      }
    }
    return dst;
  }

  





  const sepFast = !nf;
  for (let y = y0; y < y1; y++) {
    let si = ((y - top) * src.width + (x0 - left)) * 4, di = (y * DW + x0) * 4;
    for (let x = x0; x < x1; x++, si += 4, di += 4) {
      const sA = S[si + 3];
      if (sA === 0) continue;
      const sa = (sA / 255) * opacity;
      if (sa <= 0) continue;
      const da = D[di + 3] / 255;
      const na = sa + da * (1 - sa);
      if (na <= 0) { D[di + 3] = 0; continue; }
      const cb0 = D[di] / 255, cb1 = D[di + 1] / 255, cb2 = D[di + 2] / 255;
      const cs0 = S[si] / 255, cs1 = S[si + 1] / 255, cs2 = S[si + 2] / 255;
      let br, bg, bb;
      if (sepFast) { br = f(cb0, cs0); bg = f(cb1, cs1); bb = f(cb2, cs2); }
      else {
        cb[0] = cb0; cb[1] = cb1; cb[2] = cb2; cs[0] = cs0; cs[1] = cs1; cs[2] = cs2;
        const r = nf(cb, cs); br = r[0]; bg = r[1]; bb = r[2];
      }
      
      const k1 = (1 - sa) * da, k2 = 1 - da;
      D[di]     = ((k1 * cb0 + sa * (k2 * cs0 + da * br)) / na * 255 + .5) | 0;
      D[di + 1] = ((k1 * cb1 + sa * (k2 * cs1 + da * bg)) / na * 255 + .5) | 0;
      D[di + 2] = ((k1 * cb2 + sa * (k2 * cs2 + da * bb)) / na * 255 + .5) | 0;
      D[di + 3] = (na * 255 + .5) | 0;
    }
  }
  return dst;
}


export function drawOver(dst, src, left = 0, top = 0, opacity = 1) {
  return drawLayer(dst, src, left, top, { opacity, blendMode: 'norm' });
}


export function alphaBounds(surface) {
  const { data, width: W, height: H } = surface;
  let mnx = W, mny = H, mxx = -1, mxy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 0) {
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
  }
  return mxx < mnx ? null : { left: mnx, top: mny, right: mxx + 1, bottom: mxy + 1 };
}


export function crop(surface, b) {
  const w = b.right - b.left, h = b.bottom - b.top;
  const out = new Uint8ClampedArray(w * h * 4);
  const { data, width: W } = surface;
  for (let y = 0; y < h; y++) {
    const s = ((y + b.top) * W + b.left) * 4;
    out.set(data.subarray(s, s + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}


export function flatten(surface, bg = [255, 255, 255]) {
  const d = surface.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a >= 1) continue;
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * a + bg[k] * (1 - a));
    d[i + 3] = 255;
  }
  return surface;
}




export function eraseWith(dst, src, left, top, strength) {
  growDirty(dst, Math.max(0, left), Math.max(0, top),
            Math.min(dst.width, left + src.width), Math.min(dst.height, top + src.height));
  if (strength <= 0) return;
  for (let y = 0; y < src.height; y++) {
    const dy = top + y; if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = left + x; if (dx < 0 || dx >= dst.width) continue;
      const sa = src.data[(y * src.width + x) * 4 + 3] * strength;
      if (sa <= 0) continue;
      const p = (dy * dst.width + dx) * 4 + 3;
      dst.data[p] = Math.round(dst.data[p] * (255 - Math.min(255, sa)) / 255);
    }
  }
}


export function baseAlphaMask(src, left, top, docW, docH) {
  const m = new Uint8ClampedArray(docW * docH * 4);
  for (let y = 0; y < src.height; y++) {
    const dy = top + y; if (dy < 0 || dy >= docH) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = left + x; if (dx < 0 || dx >= docW) continue;
      m[(dy * docW + dx) * 4 + 3] = src.data[(y * src.width + x) * 4 + 3];
    }
  }
  return { data: m, width: docW, height: docH };
}


export function clipToBase(src, left, top, base, docW, docH) {
  const out = new Uint8ClampedArray(src.data);
  for (let y = 0; y < src.height; y++) {
    const dy = top + y;
    for (let x = 0; x < src.width; x++) {
      const dx = left + x;
      const ba = (dy >= 0 && dy < docH && dx >= 0 && dx < docW) ? base.data[(dy * docW + dx) * 4 + 3] : 0;
      const si = (y * src.width + x) * 4;
      out[si + 3] = (out[si + 3] * ba) / 255;
    }
  }
  return { data: out, width: src.width, height: src.height };
}



export function adjustmentRenderParams(adjustment) {
  if (!adjustment) return null;
  const p = adjustment.params || {};
  switch (adjustment.key) {
    case 'expA': return Number.isFinite(p.exposure) && Number.isFinite(p.offset) && Number.isFinite(p.gamma)
      ? { type: 'exposure', exposure: p.exposure, offset: p.offset, gamma: p.gamma } : null;
    case 'nvrt': return { type: 'invert' };
    case 'post': return Number.isInteger(p.levels) ? { type: 'posterize', levels: p.levels } : null;
    case 'thrs': return Number.isInteger(p.level) ? { type: 'threshold', level: p.level } : null;
    case 'brit': return Number.isFinite(p.brightness) && Number.isFinite(p.contrast)
      ? { type: 'brightnessContrast', brightness: p.brightness, contrast: p.contrast,
          meanValue: Number.isFinite(p.meanValue) ? p.meanValue : 127, useLegacy: true } : null;
    case 'CgEd': {
      





      const d = p.desc;
      if (!d || 'presetFileName' in d || 'curvesPresetFileName' in d || 'mixerPresetFileName' in d) return null;
      if (d.useLegacy !== true) return null;
      return Number.isFinite(d.Brgh) && Number.isFinite(d.Cntr)
        ? { type: 'brightnessContrast', brightness: d.Brgh, contrast: d.Cntr,
            meanValue: Number.isFinite(d.means) ? d.means : 127, useLegacy: true } : null;
    }
    case 'levl': {
      const names = ['rgb', 'r', 'g', 'b'], channels = {};
      for (let i = 0; i < names.length; i++) {
        const v = p.records && p.records[i];
        if (!v) continue;
        channels[names[i]] = { shadowInput: v.shadowInput, highlightInput: v.highlightInput,
          shadowOutput: v.shadowOutput, highlightOutput: v.highlightOutput, gamma: v.midtoneInput / 100 };
      }
      return Object.keys(channels).length ? { type: 'levels', channels } : null;
    }
    case 'curv': {
      const names = ['rgb', 'r', 'g', 'b'], channels = {};
      for (const c of p.extra || p.channels || []) {
        const name = names[c.channelId ?? Object.keys(channels).length];
        if (name && Array.isArray(c.points) && c.points.length >= 2) channels[name] = c.points;
      }
      return Object.keys(channels).length ? { type: 'curves', channels, interpolation: 'spline' } : null;   
    }
    case 'hue2': {
      if (!Array.isArray(p.master) || p.master.length !== 3) return null;
      const out = { type: 'hueSaturation', hue: p.master[0], saturation: p.master[1], lightness: p.master[2],
        colorize: !!p.enable, colorizeHue: p.colorization && p.colorization[0], colorizeSaturation: p.colorization && p.colorization[1] };
      const names = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'];
      if (!out.colorize && Array.isArray(p.ranges)) for (let i = 0; i < names.length; i++) {
        const b = p.ranges[i];
        if (b && Array.isArray(b.settings) && Array.isArray(b.range))
          out[names[i]] = { hue: b.settings[0], saturation: b.settings[1], lightness: b.settings[2], range: b.range };
      }
      return out;
    }
    case 'mixr': {
      if (!Array.isArray(p.channels) || p.channels.length < 3) return null;
      const row = v => ({ red: v[0], green: v[1], blue: v[2], constant: v[4] });
      return { type: 'channelMixer', monochrome: !!p.monochrome, red: row(p.channels[0]), green: row(p.channels[1]),
        blue: row(p.channels[2]), ...(p.channels[3] ? { gray: row(p.channels[3]) } : {}) };
    }
    case 'blnc': return Array.isArray(p.shadows) && Array.isArray(p.midtones) && Array.isArray(p.highlights)
      ? { type: 'colorBalance', shadows: p.shadows, midtones: p.midtones, highlights: p.highlights,
          preserveLuminosity: !!p.preserveLuminosity } : null;
    case 'blwh': {
      const d = p.desc;
      if (!d) return null;
      const tintColor = d.useTint && descriptorColorToRgb(d.tintColor);
      if (d.useTint && !tintColor) return null;
      return { type: 'blackWhite', red: d['Rd  '], yellow: d.Yllw, green: d['Grn '], cyan: d.Cyn,
        blue: d['Bl  '], magenta: d.Mgnt, useTint: !!d.useTint, ...(tintColor ? { tintColor } : {}) };
    }
    case 'vibA': {
      const d = p.desc;
      return d && Number.isFinite(d.vibrance) && Number.isFinite(d['Strt'])
        ? { type: 'vibrance', vibrance: d.vibrance, saturation: d['Strt'] } : null;
    }
    case 'phfl': {
      const color = photoFilterColorToRgb(p);
      return color && Number.isFinite(p.density) && p.density >= 0 && p.density <= 10000
        ? { type: 'photoFilter', color, density: p.density / 100, preserveLuminosity: !!p.preserveLuminosity } : null;
    }
    case 'selc': return Array.isArray(p.plates) && p.plates.length >= 10 && (p.method === 0 || p.method === 1)
      ? { type: 'selectiveColor', plates: p.plates.map(row => Array.isArray(row) ? row.slice() : row), method: p.method } : null;
    case 'grdm': {
      if (!Array.isArray(p.colorStops) || p.colorStops.length < 2 ||
          (Array.isArray(p.transparencyStops) && p.transparencyStops.some(s => s.opacity !== 255))) return null;
      const stops = p.colorStops.map(s => ({ position: s.location / 4096,
        color: [s.color[0] / 257, s.color[1] / 257, s.color[2] / 257], midpoint: s.midpoint / 100 }));
      return stops.every(s => s.color.every(Number.isFinite) && Number.isFinite(s.position) && s.position >= 0 && s.position <= 1)
        ? { type: 'gradientMap', stops, reverse: !!p.reverse } : null;
    }
    case 'clrL': return colorLookupRenderParams(p);
    default: return null;
  }
}



const CLRL_CACHE = new WeakMap();
const enumVal = v => v && typeof v === 'object' ? (v.value ?? v.enum ?? '') : String(v || '');
export function colorLookupRenderParams(p) {
  const d = p && p.desc; if (!d || typeof d !== 'object') return null;
  if (CLRL_CACHE.has(d)) return CLRL_CACHE.get(d);
  let r = null;
  try {
    const type = enumVal(d.lookupType);
    const data = /3DLUT/i.test(type) ? d.LUT3DFileData : d.profile;
    if (data instanceof Uint8Array && data.length) {
      const name = String(d.LUT3DFileName || d['Nm  '] || '') || (/3DLUT/i.test(type) ? ({ LUTFormat3DL: 'x.3dl', LUTFormatLOOK: 'x.look', LUTFormatCSP: 'x.csp' })[enumVal(d.LUTFormat)] || 'x.cube' : 'x.icc');
      const lut = parseLut(data, name);
      r = { type: 'colorLookup', lut, opts: { order: /bgr/i.test(enumVal(d.dataOrder)) ? 'bgr' : 'rgb', interp: 'tetrahedral' } };
    }
  } catch { r = null; }
  CLRL_CACHE.set(d, r);
  return r;
}

function descriptorColorToRgb(color) {
  if (!color || typeof color !== 'object') return null;
  if (color.__classID === 'LABC' && Number.isFinite(color.Lmnc) && Number.isFinite(color['A   ']) && Number.isFinite(color['B   ']))
    return photoFilterColorToRgb({ version: 2, colorSpace: 7, color: [color.Lmnc * 100, color['A   '] * 100, color['B   '] * 100, 0] });
  if (color.__classID === 'RGBC' && Number.isFinite(color['Rd  ']) && Number.isFinite(color['Grn ']) && Number.isFinite(color['Bl  ']))
    return [color['Rd  '], color['Grn '], color['Bl  ']].map(v => Math.max(0, Math.min(255, Math.round(v))));
  return null;
}




function photoFilterColorToRgb(p) {
  if (!Array.isArray(p.color) || p.color.length !== 4 || p.version !== 2) return null;
  const c = p.color, signed16 = n => n > 0x7fff ? n - 0x10000 : n;
  const byte = n => Math.max(0, Math.min(255, Math.round(n)));
  if (p.colorSpace === 0) return [byte(c[0] / 257), byte(c[1] / 257), byte(c[2] / 257)];
  if (p.colorSpace === 1) {
    const h = c[0] / 65535 * 6, s = c[1] / 65535, v = c[2] / 65535;
    const k = n => (n + h) % 6, f = n => v - v * s * Math.max(0, Math.min(k(n), 4 - k(n), 1));
    return [byte(f(5) * 255), byte(f(3) * 255), byte(f(1) * 255)];
  }
  if (p.colorSpace === 2) { 
    const k = c[3] / 65535;
    return [byte((1 - c[0] / 65535) * (1 - k) * 255), byte((1 - c[1] / 65535) * (1 - k) * 255), byte((1 - c[2] / 65535) * (1 - k) * 255)];
  }
  if (p.colorSpace === 7) {
    const L = signed16(c[0]) / 100, a = signed16(c[1]) / 100, b = signed16(c[2]) / 100;
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const finv = t => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
    const X = 0.9642 * finv(fx), Y = finv(fy), Z = 0.8249 * finv(fz);
    const toSrgb = x => { const s = x <= .0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - .055; return byte(s * 255); };
    return [toSrgb(3.1338561 * X - 1.6168667 * Y - .4906146 * Z), toSrgb(-.9787684 * X + 1.9161415 * Y + .033454 * Z), toSrgb(.0719453 * X - .2289914 * Y + 1.4052427 * Z)];
  }
  if (p.colorSpace === 8) { const g = byte(c[0] * 255 / 10000); return [g, g, g]; }
  return null;
}



export function fillRenderParams(fill, patterns = null) {
  if (!fill) return null;
  const desc = fill.params && fill.params.desc;
  if (fill.key === 'SoCo') {
    const color = effectColor(desc && desc['Clr ']);
    return color ? { type: 'solid', color } : null;
  }
  if (fill.key === 'GdFl' && desc && ['Lnr ', 'Rdl ', 'Angl', 'Rflc', 'Dmnd'].includes(desc.Type?.value || 'Lnr ')
      && ((Array.isArray(desc.Grad?.Clrs) && desc.Grad.Clrs.length >= 2) || isNoiseGrad(desc.Grad))) return { type: 'gradient', desc };
  if (fill.key === 'PtFl' && desc?.Ptrn?.Idnt && Array.isArray(patterns)) {
    const pattern = patterns.find(p => p.id === desc.Ptrn.Idnt);
    const image = pattern && patternToRGBA(pattern);
    if (image) return { type: 'pattern', image, phase: desc.phase || {} };
  }
  return null;
}

export function hasRenderableFill(fill, vectorMask = false, patterns = null) {
  if (!fillRenderParams(fill, patterns)) return false;
  return !vectorMask || (typeof vectorMask === 'object' && !!vectorMask.path);
}

function pathPoint(point, width, height) { return { x: point.x * width, y: point.y * height }; }
function curvePoint(a, b, c, d, t) {
  const u = 1 - t, u2 = u * u, t2 = t * t;
  return { x: u2 * u * a.x + 3 * u2 * t * b.x + 3 * u * t2 * c.x + t2 * t * d.x,
    y: u2 * u * a.y + 3 * u2 * t * b.y + 3 * u * t2 * c.y + t2 * t * d.y };
}
function flattenPath(group, width, height, close = true) {
  const knots = group.knots || [];
  const open = !!group.subpath?.open;
  if (knots.length < (open ? 2 : 3)) return null;
  if (open && close) return null; 
  const out = [];
  const segments = open ? knots.length - 1 : knots.length;
  for (let i = 0; i < segments; i++) {
    const current = knots[i], next = knots[(i + 1) % knots.length];
    const a = pathPoint(current.anchor, width, height), b = pathPoint(current.leaving, width, height);
    const c = pathPoint(next.preceding, width, height), d = pathPoint(next.anchor, width, height);
    if (!i) out.push(a);
    
    
    for (let step = 1; step <= 32; step++) out.push(curvePoint(a, b, c, d, step / 32));
  }
  return out;
}
function pointInPath(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}









const vectorMaskCache = new WeakMap();
function vectorMaskSig(vectorMask, width, height) {
  const recs = vectorMask.path && vectorMask.path.records;
  let s = `${width}x${height}|${vectorMask.invert ? 1 : 0}|${vectorMask.disable ? 1 : 0}|d${vectorMask.density ?? 255}f${vectorMask.feather || 0}|`;
  if (Array.isArray(recs)) for (const r of recs) {
    s += r.type + ':';
    for (const k of ['anchor', 'leaving', 'preceding']) if (r[k]) s += r[k].x + ',' + r[k].y + ';';
    if (r.operation != null) s += 'o' + r.operation;
    if (r.open != null) s += 'p' + (r.open ? 1 : 0);
    if (r.length != null) s += 'n' + r.length;
    if (r.fillStartsWithAllPixels != null) s += 'f' + (r.fillStartsWithAllPixels ? 1 : 0);
    s += '|';
  }
  return s;
}
function maskSampleOffsets(width, height) { return width * height > 2_000_000 ? [.5] : [.25, .75]; }
function combineOp(inside, hit, op) {
  if (op === 0) return inside !== hit;
  if (op === 2) return inside && !hit;
  if (op === 3) return inside && hit;
  return inside || hit;
}
export function rasterizeVectorMask(vectorMask, width, height) {
  return vectorMaskAlphaShared(vectorMask, width, height).slice();   
}




function vectorMaskAlphaShared(vectorMask, width, height) {
  if (!vectorMask || vectorMask.disable) { const a = new Uint8ClampedArray(width * height); a.fill(255); return a; }
  const sig = vectorMaskSig(vectorMask, width, height);
  const hit = typeof vectorMask === 'object' ? vectorMaskCache.get(vectorMask) : null;
  if (hit && hit.sig === sig) return hit.alpha;
  
  const alpha = adjustAlpha(rasterizeVectorMaskScan(vectorMask, width, height), width, height, vectorMask.density, vectorMask.feather);
  if (typeof vectorMask === 'object') vectorMaskCache.set(vectorMask, { sig, alpha });
  return alpha;
}
function rasterizeVectorMaskScan(vectorMask, width, height) {
  const alpha = new Uint8ClampedArray(width * height);
  const groups = groupSubpaths(vectorMask.path).map(g => ({ group: g, points: flattenPath(g, width, height) })).filter(g => g.points);
  if (!groups.length) return alpha;
  const offs = maskSampleOffsets(width, height), nx = offs.length, total = nx * nx;
  const initial = vectorMask.path.records?.some(r => r.type === 'initialFill' && r.fillStartsWithAllPixels) || false;
  const G = groups.map(({ group, points }) => {
    const n = points.length, ex0 = new Float64Array(n), ey0 = new Float64Array(n), ex1 = new Float64Array(n), ey1 = new Float64Array(n);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      ex0[i] = points[i].x; ey0[i] = points[i].y; ex1[i] = points[j].x; ey1[i] = points[j].y;
      if (points[i].y < minY) minY = points[i].y; if (points[i].y > maxY) maxY = points[i].y;
    }
    return { op: group.subpath.operation, n, ex0, ey0, ex1, ey1, minY, maxY };
  });
  
  let empty = initial; for (const g of G) empty = combineOp(empty, false, g.op);
  const cols = width * nx;
  const inside = new Uint8Array(cols), hitRow = new Uint8Array(cols), count = new Uint16Array(width);
  const xs = [];
  const emptyV = empty ? 255 : 0;
  for (let y = 0; y < height; y++) {
    count.fill(0);
    let touched = false;
    for (let ky = 0; ky < nx; ky++) {
      const yy = y + offs[ky];
      let any = false; for (const g of G) if (yy >= g.minY && yy <= g.maxY) { any = true; break; }
      if (!any) { if (empty) for (let x = 0; x < width; x++) count[x] += nx; continue; }
      touched = true;
      inside.fill(initial ? 1 : 0);
      for (const g of G) {
        hitRow.fill(0);
        if (yy >= g.minY && yy <= g.maxY) {
          xs.length = 0;
          for (let e = 0; e < g.n; e++) {
            const ya = g.ey0[e], yb = g.ey1[e];
            if ((ya > yy) !== (yb > yy)) xs.push((g.ex1[e] - g.ex0[e]) * (yy - ya) / (yb - ya) + g.ex0[e]);
          }
          xs.sort((a, b) => a - b);
          
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const a = xs[k], b = xs[k + 1];
            for (let kx = 0; kx < nx; kx++) {
              const sx = offs[kx];
              let x0 = Math.ceil(a - sx); if (x0 < 0) x0 = 0;
              let x1 = Math.ceil(b - sx); if (x1 > width) x1 = width;
              for (let x = x0; x < x1; x++) hitRow[x * nx + kx] = 1;
            }
          }
        }
        const op = g.op;
        if (op === 0) for (let c = 0; c < cols; c++) inside[c] ^= hitRow[c];
        else if (op === 2) { for (let c = 0; c < cols; c++) if (hitRow[c]) inside[c] = 0; }
        else if (op === 3) { for (let c = 0; c < cols; c++) if (!hitRow[c]) inside[c] = 0; }
        else for (let c = 0; c < cols; c++) inside[c] |= hitRow[c];
      }
      for (let x = 0, c = 0; x < width; x++) for (let kx = 0; kx < nx; kx++, c++) count[x] += inside[c];
    }
    const row = y * width;
    if (!touched) {
      const v = vectorMask.invert ? 255 - emptyV : emptyV;
      if (v) alpha.fill(v, row, row + width);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const v = Math.round(count[x] * 255 / total);
      alpha[row + x] = vectorMask.invert ? 255 - v : v;
    }
  }
  return alpha;
}

export function hasRenderableVectorMask(vectorMask) {
  return !!(vectorMask && typeof vectorMask === 'object' && vectorMask.path);
}

export function applyVectorMaskToSource(src, vectorMask, left, top, docW, docH) {
  if (!hasRenderableVectorMask(vectorMask)) return src;
  const mask = rasterizeVectorMask(vectorMask, docW, docH), data = new Uint8ClampedArray(src.data);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const dx = left + x, dy = top + y;
    if (dx < 0 || dy < 0 || dx >= docW || dy >= docH) { data[(y * src.width + x) * 4 + 3] = 0; continue; }
    const p = (y * src.width + x) * 4 + 3;
    data[p] = Math.round(data[p] * mask[dy * docW + dx] / 255);
  }
  return { ...src, data };
}







export function multiplyLayerMask(data, width, height, left, top, mask, origTop, origLeft) {
  const g = mask && mask.gray;
  if (!g || mask.disabled) return;
  if (!(g instanceof Uint8Array) && !(g instanceof Uint8ClampedArray)) return;
  let gray = g;
  const den = mask.density != null ? mask.density : 255;
  if (mask.feather > 0.2) {   
    const res = featherDensityPlane({ gray: g, width: mask.width, height: mask.height, top: mask.top, left: mask.left,
      defaultColor: mask.defaultColor, relative: !!mask.relative, layerTop: origTop || 0, layerLeft: origLeft || 0 },
    { top, left, width, height }, mask.feather, den);
    for (let i = 0; i < width * height; i++) {
      const v = mask.invert ? 255 - res.gray[i] : res.gray[i];
      data[i * 4 + 3] = Math.round(data[i * 4 + 3] * v / 255);
    }
    return;
  }
  if (den < 255) {  
    const k = den / 255, g2 = new Uint8Array(g.length);
    for (let i = 0; i < g.length; i++) g2[i] = 255 - Math.round((255 - g[i]) * k);
    gray = g2;
  }
  const def = mask.defaultColor != null ? mask.defaultColor : 255;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    
    const dx = left + x, dy = top + y;
    const mx = (mask.relative ? dx - origLeft : dx) - mask.left;
    const my = (mask.relative ? dy - origTop : dy) - mask.top;
    let v = def;
    if (mx >= 0 && mx < mask.width && my >= 0 && my < mask.height) v = gray[my * mask.width + mx];
    if (mask.invert) v = 255 - v;
    data[(y * width + x) * 4 + 3] = Math.round(data[(y * width + x) * 4 + 3] * v / 255);
  }
}

function fillAlpha(vectorMask, width, height) { return vectorMask ? rasterizeVectorMask(vectorMask, width, height) : null; }
function renderSolidFill(fill, vectorMask, width, height, patterns) {
  const params = fillRenderParams(fill, patterns); if (!params) return null;
  const alpha = fillAlpha(vectorMask, width, height);
  const data = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = params.color;
  if (!alpha) { for (let p = 0; p < data.length; p += 4) { data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255; } }
  else for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    const a = alpha[i];
    if (!a) continue;                                   
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }
  return { data, width, height };
}
function gradientStops(gradient) {
  const raw = gradient.Grad.Clrs.map((s, i) => ({ color: effectColor(s['Clr ']), pos: Number.isFinite(s.Lctn) ? s.Lctn / 4096 : i / (gradient.Grad.Clrs.length - 1),
    mid: (Number.isFinite(s.Mdpn) ? s.Mdpn : 50) / 100 })).filter(s => s.color);
  if (raw.length < 2) return null;
  if (raw.every((s, i) => i === 0 || s.pos <= raw[i - 1].pos)) raw.forEach((s, i) => { s.pos = i / (raw.length - 1); });
  else raw.sort((a, b) => a.pos - b.pos);
  return raw;
}





function isNoiseGrad(g) { const f = g && g.GrdF; return !!f && (typeof f === 'object' ? f.value : f) === 'ClNs'; }
function noiseModelOf(g) {
  const n = v => (v && typeof v === 'object' && 'value' in v) ? +v.value : +v;
  const four = (a, d) => Array.isArray(a) ? [0, 1, 2, 3].map(k => Math.max(0, Math.min(100, n(a[k] ?? d)))) : [d, d, d, d];
  const cs = g.ClrS && (typeof g.ClrS === 'object' ? g.ClrS.value : g.ClrS);
  return { roughness: Math.max(0, Math.min(100, n(g.Smth ?? 2048) / 40.96)), model: cs === 'HSBl' ? 'hsb' : cs === 'LbCl' ? 'lab' : 'rgb',
    min: four(g['Mnm '], 0), max: four(g['Mxm '], 100), restrict: !!g.VctC, transparency: !!g.ShTr, seed: (n(g.RndS ?? 1) >>> 0) || 1 };
}
function gradientLutF(gradient, size = 1024) {
  if (isNoiseGrad(gradient.Grad)) return buildNoiseLut(noiseModelOf(gradient.Grad), size);
  const cs = gradientStops(gradient); if (!cs) return null;
  const ts = Array.isArray(gradient.Grad.Trns) ? gradient.Grad.Trns.map((s, i, A) => ({
    a: Math.max(0, Math.min(1, unitValue(s.Opct, 100) / 100)), pos: Number.isFinite(s.Lctn) ? s.Lctn / 4096 : i / Math.max(1, A.length - 1),
    mid: (Number.isFinite(s.Mdpn) ? s.Mdpn : 50) / 100 })) : [];
  const mk = gradient.gradientsInterpolationMethod;
  const method = methodFromKey(mk && typeof mk === 'object' ? mk.value : mk) || 'classic';
  const intr = Number.isFinite(gradient.Grad.Intr) ? gradient.Grad.Intr : 4096;
  return buildGradientLut({ colors: cs.map(s => ({ pos: s.pos, color: s.color, mid: s.mid })), alphas: ts.length ? ts : null,
    method, smoothness: Math.max(0, Math.min(1, intr / 4096)), size });
}
function gradientLut(gradient) {
  const f = gradientLutF(gradient, 256); if (!f) return null;
  const lut = new Uint8ClampedArray(256 * 4);
  for (let k = 0; k < lut.length; k++) lut[k] = f[k] + .5;
  return lut;
}


function gradientT(gradient, width, height, scale, ofsX = 0, ofsY = 0) {
  const ang = unitValue(gradient.Angl, 90) * Math.PI / 180, cs = Math.cos(ang), sn = -Math.sin(ang);
  const type = gradient.Type?.value || 'Lnr ', rev = !!gradient.Rvrs;
  const cx = (width - 1) / 2 + ofsX, cy = (height - 1) / 2 + ofsY;
  const span = Math.max(1, (Math.abs(cs) * width + Math.abs(sn) * height) * scale), half = span / 2;
  return (x, y) => {
    const dx = x - cx, dy = y - cy, u = dx * cs + dy * sn;
    let t;
    if (type === 'Rdl ') t = Math.hypot(dx, dy) / half;
    else if (type === 'Rflc') t = Math.abs(u) / half;
    else if (type === 'Dmnd') { const v = -dx * sn + dy * cs; t = (Math.abs(u) + Math.abs(v)) / half; }
    else if (type === 'Angl') { let a = Math.atan2(-(dy * cs - dx * sn), u); if (a < 0) a += 2 * Math.PI; t = 1 - a / (2 * Math.PI); }
    else t = u / span + .5;
    if (rev) t = 1 - t;
    return t <= 0 ? 0 : t >= 1 ? 1 : t;
  };
}
function renderGradientFill(fill, vectorMask, width, height, patterns, opts = {}) {
  const params = fillRenderParams(fill, patterns), gradient = params && params.desc, lut = gradient && gradient.Grad && gradientLutF(gradient, 1024);
  if (!lut) return null;
  const alpha = fillAlpha(vectorMask, width, height), data = new Uint8ClampedArray(width * height * 4);
  
  const rawScale = unitValue(gradient['Scl '], 100), scale = Math.max(.01, (Math.abs(rawScale) > 1000 ? rawScale / 100 : rawScale) / 100);
  


  let bx = 0, by = 0, bw = width, bh = height;
  if (gradient.Algn !== false && alpha) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) { const row = y * width; for (let x = 0; x < width; x++) if (alpha[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 >= x0) { bx = x0; by = y0; bw = x1 - x0 + 1; bh = y1 - y0 + 1; }
  }
  const ofs = v => (v && typeof v === 'object') ? unitValue(v, 0) : (+v || 0);
  const T0 = gradientT(gradient, bw, bh, scale, ofs(gradient.Ofst?.Hrzn) / 100 * bw, ofs(gradient.Ofst?.Vrtc) / 100 * bh);
  const T = (x, y) => T0(x - bx, y - by);
  
  const dither = gradient.Dthr !== false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tv = T(x, y), k = (((Number.isFinite(tv) ? tv : 0) * 1023 + .5) | 0) * 4, p = (y * width + x) * 4, n = dither ? ditherNoise(x, y) : 0;
    data[p] = lut[k] + .5 + n; data[p + 1] = lut[k + 1] + .5 + n; data[p + 2] = lut[k + 2] + .5 + n;
    data[p + 3] = (lut[k + 3] * (alpha && !opts.colorOnly ? alpha[y * width + x] : 255) / 255 + .5) | 0;   
  }
  return { data, width, height };
}
function renderPatternFill(fill, vectorMask, width, height, patterns) {
  const params = fillRenderParams(fill, patterns), image = params && params.image;
  if (!image) return null;
  const alpha = fillAlpha(vectorMask, width, height), data = new Uint8ClampedArray(width * height * 4);
  const phaseX = Math.round(params.phase.Hrzn || 0), phaseY = Math.round(params.phase.Vrtc || 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = ((x - phaseX) % image.width + image.width) % image.width, sy = ((y - phaseY) % image.height + image.height) % image.height;
    const s = (sy * image.width + sx) * 4, p = (y * width + x) * 4;
    data[p] = image.data[s]; data[p + 1] = image.data[s + 1]; data[p + 2] = image.data[s + 2];
    data[p + 3] = Math.round(image.data[s + 3] * (alpha ? alpha[y * width + x] : 255) / 255);
  }
  return { data, width, height };
}
function renderFill(fill, vectorMask, width, height, patterns = null) {
  const p = fillRenderParams(fill, patterns);
  return p?.type === 'solid' ? renderSolidFill(fill, vectorMask, width, height, patterns)
    : p?.type === 'gradient' ? renderGradientFill(fill, vectorMask, width, height, patterns)
      : p?.type === 'pattern' ? renderPatternFill(fill, vectorMask, width, height, patterns) : null;
}



export function vectorStrokeRenderParams(vectorStroke, vectorMask = false) {
  const d = vectorStroke && vectorStroke.desc;
  const content = d && d.strokeStyleContent;
  

  const grad = content && content.Grad && ((Array.isArray(content.Grad.Clrs) && content.Grad.Clrs.length >= 2) || isNoiseGrad(content.Grad)) ? content : null;
  const color = effectColor(content && content['Clr ']) || (grad ? [0, 0, 0] : null);
  const width = unitValue(d && d.strokeStyleLineWidth, 0);
  const blend = d && d.strokeStyleBlendMode && d.strokeStyleBlendMode.value;
  const dashes = Array.isArray(d && d.strokeStyleLineDashSet) ? d.strokeStyleLineDashSet.map(v => unitValue(v, NaN)).filter(v => Number.isFinite(v) && v > 0) : [];
  if (!vectorMask || typeof vectorMask !== 'object' || !vectorMask.path || !d || d.strokeEnabled === false || !color ||
      !Number.isFinite(width) || width <= 0 || (blend && blend !== 'Nrml' && blend !== 'normal')) return null;
  const align = d.strokeStyleLineAlignment && d.strokeStyleLineAlignment.value;
  if (align && !['strokeStyleAlignInside', 'strokeStyleAlignCenter', 'strokeStyleAlignOutside'].includes(align)) return null;
  return { color, width, dashes, dashOffset: unitValue(d.strokeStyleLineDashOffset, 0), opacity: Math.max(0, Math.min(1, unitValue(d.strokeStyleOpacity, 100) / 100)), align: align || 'strokeStyleAlignCenter',
    ...(grad ? { gradient: grad } : {}) };
}

function pointSegmentDistance(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, denom = dx * dx + dy * dy;
  const t = denom ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / denom)) : 0;
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

function dashIsOn(distance, dashes, offset) {
  if (!dashes.length) return true;
  const pattern = dashes.length % 2 ? [...dashes, ...dashes] : dashes;
  const total = pattern.reduce((sum, v) => sum + v, 0);
  let at = ((distance + offset) % total + total) % total;
  for (let i = 0; i < pattern.length; i++) { if (at < pattern[i]) return i % 2 === 0; at -= pattern[i]; }
  return true;
}






const vectorStrokeCache = new WeakMap();
function renderVectorStroke(vectorStroke, vectorMask, width, height) {
  const params = vectorStrokeRenderParams(vectorStroke, vectorMask);
  if (!params) return null;
  const sig = vectorMaskSig(vectorMask, width, height) + JSON.stringify(params);
  const cached = vectorStrokeCache.get(vectorStroke);
  if (cached && cached.sig === sig) return cached.out && { data: cached.out.data.slice(), width, height };
  const out = renderVectorStrokeFast(params, vectorMask, width, height);
  if (out && params.gradient) {
    
    const g = { ...params.gradient, Type: params.gradient.Type || { value: 'Lnr ' } };
    const col = renderGradientFill({ key: 'GdFl', params: { desc: g } }, vectorMask, width, height, null, { colorOnly: true });
    if (col) {
      const a = out.data, c = col.data;
      for (let p = 0; p < a.length; p += 4) { if (!a[p + 3]) continue; a[p] = c[p]; a[p + 1] = c[p + 1]; a[p + 2] = c[p + 2];
        const k = Math.max(0, Math.min(255, Math.round(c[p + 3] ?? 255))); if (k < 255) a[p + 3] = Math.round(a[p + 3] * k / 255); }
    }
  }
  vectorStrokeCache.set(vectorStroke, { sig, out });
  return out && { data: out.data.slice(), width, height };
}
function renderVectorStrokeFast(params, vectorMask, width, height) {
  const paths = groupSubpaths(vectorMask.path).map(g => flattenPath(g, width, height, false)).filter(Boolean);
  if (!paths.length) return null;
  const inside = rasterizeVectorMask(vectorMask, width, height);
  const data = new Uint8ClampedArray(width * height * 4);
  const samples = width * height > 2_000_000 ? [[.5, .5]] : [[.25, .25], [.75, .25], [.25, .75], [.75, .75]];
  const ns = samples.length;
  const radius = params.align === 'strokeStyleAlignCenter' ? params.width / 2 : params.width;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of paths) for (const q of path) { if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y; }
  const rx0 = Math.max(0, Math.floor(minX - radius - 1)), ry0 = Math.max(0, Math.floor(minY - radius - 1));
  const rx1 = Math.min(width, Math.ceil(maxX + radius + 1)), ry1 = Math.min(height, Math.ceil(maxY + radius + 1));
  const rw = rx1 - rx0, rh = ry1 - ry0;
  if (rw <= 0 || rh <= 0) return { data, width, height };
  const best = new Float64Array(rw * rh * ns).fill(Infinity), along = new Float64Array(rw * rh * ns);
  for (const path of paths) {
    let lengthSoFar = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), l2 = length * length;
      const x0 = Math.max(rx0, Math.floor(Math.min(a.x, b.x) - radius - 1)), x1 = Math.min(rx1, Math.ceil(Math.max(a.x, b.x) + radius + 1));
      const y0 = Math.max(ry0, Math.floor(Math.min(a.y, b.y) - radius - 1)), y1 = Math.min(ry1, Math.ceil(Math.max(a.y, b.y) + radius + 1));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const base = ((y - ry0) * rw + (x - rx0)) * ns;
        for (let k = 0; k < ns; k++) {
          const px = x + samples[k][0], py = y + samples[k][1];
          const t = length ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
          const hit = pointSegmentDistance(px, py, a, b);
          if (hit < best[base + k]) { best[base + k] = hit; along[base + k] = lengthSoFar + length * t; }
        }
      }
      lengthSoFar += length;
    }
  }
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    const base = ((y - ry0) * rw + (x - rx0)) * ns;
    const isInside = inside[y * width + x] >= 128;
    const sideOk = params.align === 'strokeStyleAlignCenter' || (params.align === 'strokeStyleAlignInside' ? isInside : !isInside);
    let hits = 0;
    if (sideOk) for (let k = 0; k < ns; k++) if (best[base + k] <= radius && dashIsOn(along[base + k], params.dashes, params.dashOffset)) hits++;
    const p = (y * width + x) * 4, alpha = Math.round(255 * params.opacity * hits / ns);
    data[p] = params.color[0]; data[p + 1] = params.color[1]; data[p + 2] = params.color[2]; data[p + 3] = alpha;
  }
  return { data, width, height };
}







function renderShape(fill, vectorStroke, vectorMask, width, height, patterns = null, fillAlpha = 1) {
  const fillEnabled = !vectorStroke?.desc || vectorStroke.desc.fillEnabled !== false;
  const base = fillEnabled && hasRenderableFill(fill, vectorMask, patterns) ? renderFill(fill, vectorMask, width, height, patterns) : null;
  if (base && fillAlpha < 1) { const d = base.data; for (let p = 3; p < d.length; p += 4) d[p] = Math.round(d[p] * fillAlpha); }
  const stroke = renderVectorStroke(vectorStroke, vectorMask, width, height);
  if (!base) return stroke;
  if (!stroke) return base;
  drawLayer(base, stroke, 0, 0, { opacity: 1, blendMode: 'norm' });
  return base;
}

function unitValue(v, fallback = 0) { return v && typeof v === 'object' && Number.isFinite(v.value) ? v.value : fallback; }










let globalLightAngleDeg = null;   
export function setGlobalLightAngle(deg) { globalLightAngleDeg = Number.isFinite(deg) ? deg : null; }
export function globalLightAngleOf(doc) {
  try {
    const ir = doc && doc.imageResources;
    const e = ir && ir.find && ir.find(x => x && x.id === 1037);
    const v = e && e.data && e.data.globalAngle;
    return Number.isFinite(v) ? v : null;
  } catch (e) { return null; }
}

function fxAngle(fx, fallback = 120) {
  if (fx && fx.uglg && globalLightAngleDeg !== null) return globalLightAngleDeg;
  return unitValue(fx && fx.lagl, fallback);
}
function effectScale(effects) { return Math.max(0, Math.min(10, unitValue(effects && effects['Scl '], 100) / 100)); }
function effectColor(v) {
  if (!v || typeof v !== 'object') return null;
  const c = [v['Rd  '], v['Grn '], v['Bl  ']];
  return c.every(Number.isFinite) ? c : null;
}
function isEffectEnabled(effects, key) {
  const fx = effects && effects[key];
  return !!(effects && effects.masterFXSwitch !== false && fx && fx.enab !== false);
}
function effectItems(effects, key, multiKey = null) {
  if (!effects || effects.masterFXSwitch === false) return [];
  const out = [];
  if (effects[key] && typeof effects[key] === 'object') out.push(effects[key]);
  if (multiKey && Array.isArray(effects[multiKey])) out.push(...effects[multiKey]);
  return out.filter(fx => fx && typeof fx === 'object' && fx.enab !== false);
}
function hasEffect(effects, key, multiKey, predicate) {
  return effectItems(effects, key, multiKey).some(predicate);
}



export function hasRenderableEffects(effects, patterns = null) {
  const glow = effects && effects.OrGl;
  const innerGlow = effects && effects.IrGl;
  const innerShadow = effects && effects.IrSh;
  const satin = effects && effects.ChFX;
  const bevel = effects && effects.ebbl;
  return hasEffect(effects, 'SoFi', 'solidFillMulti', fx => !!effectColor(fx['Clr ']))
    || hasEffect(effects, 'DrSh', 'dropShadowMulti', shadow => effectColor(shadow['Clr ']))
    || (isEffectEnabled(effects, 'OrGl') && glow && (!glow.glwS || glow.glwS.value === 'SrcE') && (effectColor(glow['Clr ']) || glow.Grad))
    || (isEffectEnabled(effects, 'IrGl') && innerGlow && (effectColor(innerGlow['Clr ']) || innerGlow.Grad))
    || hasEffect(effects, 'IrSh', 'innerShadowMulti', shadow => effectColor(shadow['Clr ']))
    || hasEffect(effects, 'GrFl', 'gradientFillMulti', gradient =>
      Array.isArray(gradient.Grad?.Clrs) && gradient.Grad.Clrs.length >= 2)
    || hasEffect(effects, 'patternFill', 'patternFillMulti', pattern =>
      !!patternImage(pattern, patterns))
    || (isEffectEnabled(effects, 'ChFX') && satin && !!effectColor(satin['Clr ']))
    || (isEffectEnabled(effects, 'ebbl') && bevel && !!effectColor(bevel.hglC) && !!effectColor(bevel.sdwC))
    || hasEffect(effects, 'FrFX', 'frameFXMulti', stroke => ['OutF', 'InsF', 'CtrF'].includes(stroke.Styl?.value) &&
      (!stroke.PntT || stroke.PntT.value === 'SClr') && effectColor(stroke['Clr ']));
}
export function hasUnrenderedEffects(effects, patterns = null) {
  if (!effects || typeof effects !== 'object' || effects.masterFXSwitch === false) return false;
  return Object.entries(effects).some(([key, value]) => {
    if (key === 'dropShadowMulti' && Array.isArray(value))
      return value.some(fx => fx && fx.enab !== false && !effectColor(fx['Clr ']));
    if (key === 'solidFillMulti' && Array.isArray(value))
      return value.some(fx => fx && fx.enab !== false && !effectColor(fx['Clr ']));
    if (key === 'gradientFillMulti' && Array.isArray(value))
      return value.some(fx => fx && fx.enab !== false && (Array.isArray(fx.Grad?.Clrs) && fx.Grad.Clrs.length >= 2) === false);
    if (key === 'innerShadowMulti' && Array.isArray(value))
      return value.some(fx => fx && fx.enab !== false && !effectColor(fx['Clr ']));
    if (key === 'frameFXMulti' && Array.isArray(value))
      return value.some(fx => fx && fx.enab !== false && (!['OutF', 'InsF', 'CtrF'].includes(fx.Styl?.value) || (fx.PntT && fx.PntT.value !== 'SClr') || !effectColor(fx['Clr '])));
    if (key === 'patternFillMulti' && Array.isArray(value))
      return value.some(fx => fx && fx.enab !== false && !patternImage(fx, patterns));
    if (!value || typeof value !== 'object' || value.enab === false || !value.__classID) return false;
    if (key === 'SoFi' || key === 'DrSh') return false;
    if (key === 'OrGl' && (!value.glwS || value.glwS.value === 'SrcE') && (effectColor(value['Clr ']) || value.Grad)) return false;
    if (key === 'IrGl' && (effectColor(value['Clr ']) || value.Grad)) return false;
    if (key === 'IrSh') return false;
    if (key === 'GrFl' && Array.isArray(value.Grad?.Clrs) && value.Grad.Clrs.length >= 2) return false;
    if (key === 'patternFill' && patternImage(value, patterns)) return false;
    if (key === 'ChFX' && effectColor(value['Clr '])) return false;
    if (key === 'ebbl' && effectColor(value.hglC) && effectColor(value.sdwC)) return false;   
    return key !== 'FrFX' || !['OutF', 'InsF', 'CtrF'].includes(value.Styl?.value) || (value.PntT && value.PntT.value !== 'SClr');
  });
}
function patternImage(effect, patterns) {
  const id = effect && effect.Ptrn && effect.Ptrn.Idnt;
  return id && Array.isArray(patterns) ? patternToRGBA(patterns.find(p => p.id === id)) : null;
}
export function renderLayerEffects(src, effects, patterns = null, opts = null) {
  const overlays = effectItems(effects, 'SoFi', 'solidFillMulti');
  const gradients = effectItems(effects, 'GrFl', 'gradientFillMulti');
  const patternOverlays = effectItems(effects, 'patternFill', 'patternFillMulti');
  const usableOverlays = overlays.filter(fx => (!fx['Md  '] || fx['Md  '].value === 'Nrml') && effectColor(fx['Clr ']));
  const usableGradients = gradients.filter(fx => (!fx['Md  '] || fx['Md  '].value === 'Nrml') &&
    Array.isArray(fx.Grad?.Clrs) && fx.Grad.Clrs.length >= 2);
  const usablePatterns = patternOverlays.map(fx => ({ fx, image: patternImage(fx, patterns) }))
    .filter(({ fx, image }) => (!fx['Md  '] || fx['Md  '].value === 'Nrml') && image);
  if (!usableOverlays.length && !usableGradients.length && !usablePatterns.length) return opts?.split ? { base: src, overlay: null } : src;
  



  const W = src.width, H = src.height, n = W * H, S = src.data;
  const O = new Float32Array(n * 3), K = new Float32Array(n);
  const put = (i, r, g, b, k) => { const q = i * 3, inv = 1 - k; O[q] = O[q] * inv + r * k; O[q + 1] = O[q + 1] * inv + g * k; O[q + 2] = O[q + 2] * inv + b * k; K[i] = K[i] * inv + k; };
  for (const { fx: pattern, image: PI } of usablePatterns) {
    const opacity = Math.max(0, Math.min(1, unitValue(pattern.Opct, 100) / 100)), phaseX = Math.round(pattern.phase?.Hrzn || 0), phaseY = Math.round(pattern.phase?.Vrtc || 0);
    const PW = PI.width, PH = PI.height, PD = PI.data;
    for (let y = 0, i = 0; y < H; y++) {
      const rowP = (((y - phaseY) % PH + PH) % PH) * PW;
      for (let x = 0; x < W; x++, i++) {
        if (!S[i * 4 + 3]) continue;
        const p = (rowP + ((x - phaseX) % PW + PW) % PW) * 4;
        put(i, PD[p], PD[p + 1], PD[p + 2], opacity * PD[p + 3] / 255);
      }
    }
  }
  for (const gradient of usableGradients) {
    const lut = gradientLut(gradient); if (!lut) continue;
    
    const scale = Math.max(.01, unitValue(gradient['Scl '], 100) / 100 * effectScale(effects));
    const opacity = Math.max(0, Math.min(1, unitValue(gradient.Opct, 100) / 100));
    const T = gradientT(gradient, W, H, scale, unitValue(gradient.Ofst?.Hrzn, +gradient.Ofst?.Hrzn || 0) / 100 * W, unitValue(gradient.Ofst?.Vrtc, +gradient.Ofst?.Vrtc || 0) / 100 * H);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      if (!S[i * 4 + 3]) continue;
      const k = ((T(x, y) * 255 + .5) | 0) * 4;
      put(i, lut[k], lut[k + 1], lut[k + 2], opacity * lut[k + 3] / 255);
    }
  }
  for (const overlay of usableOverlays) {
    const color = effectColor(overlay['Clr ']), opacity = Math.max(0, Math.min(1, unitValue(overlay.Opct, 100) / 100));
    for (let i = 0; i < n; i++) if (S[i * 4 + 3]) put(i, color[0], color[1], color[2], opacity);
  }
  if (opts?.split) {
    const od = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const k = K[i]; if (k <= 0) continue;
      const q = i * 3, p = i * 4;
      od[p] = O[q] / k + .5; od[p + 1] = O[q + 1] / k + .5; od[p + 2] = O[q + 2] / k + .5; od[p + 3] = S[p + 3] * k + .5;
    }
    return { base: src, overlay: { data: od, width: W, height: H } };
  }
  const data = new Uint8ClampedArray(S);
  for (let i = 0; i < n; i++) {
    const k = K[i]; if (k <= 0) continue;
    const q = i * 3, p = i * 4, inv = 1 - k;
    data[p] = S[p] * inv + O[q] + .5; data[p + 1] = S[p + 1] * inv + O[q + 1] + .5; data[p + 2] = S[p + 2] * inv + O[q + 2] + .5;
  }
  return { data, width: W, height: H };
}











const STYLE_BLEND = {
  Nrml: 'norm', Dslv: 'diss', Drkn: 'dark', Mltp: 'mul ', CBrn: 'idiv', linearBurn: 'lbrn', darkerColor: 'dkCl',
  Lghn: 'lite', Scrn: 'scrn', CDdg: 'div ', linearDodge: 'lddg', lighterColor: 'lgCl',
  Ovrl: 'over', SftL: 'sLit', HrdL: 'hLit', vividLight: 'vLit', linearLight: 'lLit', pinLight: 'pLit', hardMix: 'hMix',
  Dfrn: 'diff', Xclu: 'smud', blendSubtraction: 'fsub', blendDivide: 'fdiv',
  'H   ': 'hue ', Strt: 'sat ', 'Clr ': 'colr', Lmns: 'lum ',
  normal: 'norm', dissolve: 'diss', darken: 'dark', multiply: 'mul ', colorBurn: 'idiv',
  lighten: 'lite', screen: 'scrn', colorDodge: 'div ',
  overlay: 'over', softLight: 'sLit', hardLight: 'hLit', difference: 'diff', exclusion: 'smud',
  hue: 'hue ', saturation: 'sat ', color: 'colr', luminosity: 'lum ', passThrough: 'pass',
};
export function styleBlendKey(value) { return STYLE_BLEND[value] || (B[value] || NONSEP[value] ? value : 'norm'); }
function styleBlend(value) { return styleBlendKey(value); }
const isNormalFx = fx => !fx['Md  '] || fx['Md  '].value === 'Nrml';





export function renderModeOverlays(src, effects, patterns = null) {
  const out = [];
  const W = src.width, H = src.height, n = W * H, S = src.data;
  const mk = () => new Uint8ClampedArray(n * 4);
  for (const fx of effectItems(effects, 'patternFill', 'patternFillMulti')) {
    if (isNormalFx(fx)) continue;
    const PI = patternImage(fx, patterns); if (!PI) continue;
    const opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 100) / 100)), phaseX = Math.round(fx.phase?.Hrzn || 0), phaseY = Math.round(fx.phase?.Vrtc || 0);
    const PW = PI.width, PH = PI.height, PD = PI.data, d = mk();
    for (let y = 0, i = 0; y < H; y++) {
      const rowP = (((y - phaseY) % PH + PH) % PH) * PW;
      for (let x = 0; x < W; x++, i++) {
        const a = S[i * 4 + 3]; if (!a) continue;
        const p = (rowP + ((x - phaseX) % PW + PW) % PW) * 4, q = i * 4;
        d[q] = PD[p]; d[q + 1] = PD[p + 1]; d[q + 2] = PD[p + 2]; d[q + 3] = a * opacity * PD[p + 3] / 255;
      }
    }
    out.push({ src: { data: d, width: W, height: H }, blendMode: styleBlend(fx['Md  '].value) });
  }
  for (const fx of effectItems(effects, 'GrFl', 'gradientFillMulti')) {
    if (isNormalFx(fx) || !(Array.isArray(fx.Grad?.Clrs) && fx.Grad.Clrs.length >= 2)) continue;
    const lut = gradientLut(fx); if (!lut) continue;
    const scale = Math.max(.01, unitValue(fx['Scl '], 100) / 100 * effectScale(effects));
    const opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 100) / 100));
    const T = gradientT(fx, W, H, scale, unitValue(fx.Ofst?.Hrzn, +fx.Ofst?.Hrzn || 0) / 100 * W, unitValue(fx.Ofst?.Vrtc, +fx.Ofst?.Vrtc || 0) / 100 * H);
    const d = mk();
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const a = S[i * 4 + 3]; if (!a) continue;
      const k = ((T(x, y) * 255 + .5) | 0) * 4, q = i * 4;
      d[q] = lut[k]; d[q + 1] = lut[k + 1]; d[q + 2] = lut[k + 2]; d[q + 3] = a * opacity * lut[k + 3] / 255;
    }
    out.push({ src: { data: d, width: W, height: H }, blendMode: styleBlend(fx['Md  '].value) });
  }
  for (const fx of effectItems(effects, 'SoFi', 'solidFillMulti')) {
    if (isNormalFx(fx)) continue;
    const color = effectColor(fx['Clr ']); if (!color) continue;
    const opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 100) / 100)), d = mk();
    for (let i = 0; i < n; i++) { const a = S[i * 4 + 3]; if (!a) continue; const q = i * 4; d[q] = color[0]; d[q + 1] = color[1]; d[q + 2] = color[2]; d[q + 3] = a * opacity; }
    out.push({ src: { data: d, width: W, height: H }, blendMode: styleBlend(fx['Md  '].value) });
  }
  return out;
}





function blurAlpha(data, width, height, radius, retainFloat = false) {
  radius = Math.max(0, Math.min(250, Math.round(radius)));
  if (!radius || !width || !height) return data;
  
  
  const lo = Math.floor((radius - 1) / 2), hi = radius - 1 - lo;
  const rs = [[lo, hi], [hi, lo]];
  let cur = new Float32Array(data), tmp = new Float32Array(data.length);
  for (const [left, right] of rs) {
    if (!left && !right) continue;
    boxLine(cur, tmp, height, width, width, 1, left, right);      
    boxLine(tmp, cur, width, height, 1, width, left, right);      
  }
  if (retainFloat) return cur;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < out.length; i++) out[i] = cur[i] + .5;
  return out;
}

function boxLine(src, dst, lines, len, lineStep, step, r, right = r) {
  const span = r + right + 1, last = (len - 1) * step;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let sum = src[base] * (r + 1);
    for (let k = 1; k <= right; k++) sum += src[base + (k < len ? k : len - 1) * step];
    for (let i = 0, q = base; i < len; i++, q += step) {
      dst[q] = sum / span;
      const add = i + right + 1, sub = i - r;
      sum += src[base + (add < len ? add * step : last)] - src[base + (sub > 0 ? sub * step : 0)];
    }
  }
}




function rangeLut(q) {
  const t = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let w;
    if (v < q[0] || v > q[3]) w = 0;
    else if (v < q[1]) w = (v - q[0]) / Math.max(1, q[1] - q[0]);
    else if (v > q[2]) w = (q[3] - v) / Math.max(1, q[3] - q[2]);
    else w = 1;
    t[v] = w;
  }
  return t;
}
const isDefRange = q => !q || (q[0] === 0 && q[1] === 0 && q[2] === 255 && q[3] === 255);
function applyBlendIf(src, left, top, dst, bi) {
  const luts = [];   
  if (bi.gray) { if (!isDefRange(bi.gray.src)) luts.push([0, -1, rangeLut(bi.gray.src)]); if (!isDefRange(bi.gray.dst)) luts.push([1, -1, rangeLut(bi.gray.dst)]); }
  (bi.channels || []).slice(0, 3).forEach((c, k) => { if (!c) return; if (!isDefRange(c.src)) luts.push([0, k, rangeLut(c.src)]); if (!isDefRange(c.dst)) luts.push([1, k, rangeLut(c.dst)]); });
  if (!luts.length) return src;
  const W = src.width, H = src.height, S = src.data, D = dst.data, DW = dst.width, DH = dst.height;
  const out = new Uint8ClampedArray(S);
  for (let y = 0; y < H; y++) {
    const Y = y + top;
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4; if (!out[q + 3]) continue;
      const X = x + left, inside = X >= 0 && X < DW && Y >= 0 && Y < DH, d = inside ? (Y * DW + X) * 4 : -1;
      let w = 1;
      for (const [under, ch, lut] of luts) {
        let v;
        if (under) { if (d < 0) { v = 0; } else v = ch < 0 ? (D[d] * 0.299 + D[d + 1] * 0.587 + D[d + 2] * 0.114 + 0.5) | 0 : D[d + ch]; }
        else v = ch < 0 ? (S[q] * 0.299 + S[q + 1] * 0.587 + S[q + 2] * 0.114 + 0.5) | 0 : S[q + ch];
        w *= lut[v];
        if (!w) break;
      }
      if (w < 1) out[q + 3] = (out[q + 3] * w + 0.5) | 0;
    }
  }
  return { data: out, width: W, height: H };
}

export function drawContent(dst, src, left, top, o, l) {
  if (l && l.blendIf) src = applyBlendIf(src, left, top, dst, l.blendIf);
  const off = l && l.channelsOff && l.channelsOff.filter(c => c >= 0 && c < 3);
  if (!off || !off.length) return drawLayer(dst, src, left, top, o);
  const x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(dst.width, left + src.width), y1 = Math.min(dst.height, top + src.height);
  if (x1 <= x0 || y1 <= y0) return drawLayer(dst, src, left, top, o);
  const w = x1 - x0, keep = new Uint8ClampedArray(w * (y1 - y0) * 4), D = dst.data;
  for (let y = y0; y < y1; y++) keep.set(D.subarray((y * dst.width + x0) * 4, (y * dst.width + x1) * 4), (y - y0) * w * 4);
  drawLayer(dst, src, left, top, o);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const di = (y * dst.width + x) * 4, ki = ((y - y0) * w + (x - x0)) * 4;
    if (!keep[ki + 3]) continue;   
    for (const c of off) D[di + c] = keep[ki + c];
  }
  return dst;
}




const contourCache = new WeakMap();
function contourLut(desc) {
  if (!desc || typeof desc !== 'object') return null;
  if (contourCache.has(desc)) return contourCache.get(desc);
  const lut = contourLutFromPoints(contourPointsOf(desc));
  contourCache.set(desc, lut);
  return lut;
}

function fxHash(x, y, salt = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}









function fxProfile(fx) {
  const lut = contourLut(fx && fx.TrnS), noise = Math.max(0, Math.min(1, unitValue(fx && fx.Nose, 0) / 100));
  
  
  const range = fx && fx.Inpr ? Math.max(1 / 256, Math.min(1, unitValue(fx.Inpr, 100) / 100)) : 1;
  if (!lut && !noise && range === 1) return null;
  return (v, x, y) => {
    if (range !== 1) v = Math.max(0, Math.min(255, v / range));
    if (lut) v = lut[v | 0];
    if (noise && v) v *= 1 - noise * fxHash(x, y, 7);
    return v;
  };
}


function renderDropShadowEffect(src, fx, scale = 1) {
  const color = effectColor(fx && fx['Clr ']); if (!color) return null;
  const blur = unitValue(fx.blur, 0) * scale, distance = unitValue(fx.Dstn, 0) * scale, angle = fxAngle(fx, 120) * Math.PI / 180;
  const dx = Math.round(-Math.cos(angle) * distance), dy = Math.round(Math.sin(angle) * distance);
  const pad = Math.ceil(Math.max(0, blur) + Math.max(Math.abs(dx), Math.abs(dy)) + 2);
  const width = src.width + pad * 2, height = src.height + pad * 2, alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) alpha[(y + pad + dy) * width + x + pad + dx] = src.data[(y * src.width + x) * 4 + 3];
  const sp = Math.max(0, Math.min(1, unitValue(fx.Ckmt, 0) / 100));   
  const blurred = blurAlpha(dilateAlpha(alpha, width, height, blur * sp), width, height, blur * (1 - sp));
  const opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 75) / 100)), data = new Uint8ClampedArray(width * height * 4);
  const prof = fxProfile(fx);   
  for (let i = 0; i < blurred.length; i++) { const q = i * 4; data[q] = color[0]; data[q + 1] = color[1]; data[q + 2] = color[2]; data[q + 3] = Math.round((prof ? prof(blurred[i], i % width, (i / width) | 0) : blurred[i]) * opacity); }
  

  if (fx.layerConceals !== false)
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      const a = src.data[(y * src.width + x) * 4 + 3]; if (!a) continue;
      const q = ((y + pad) * width + x + pad) * 4 + 3; data[q] = Math.round(data[q] * (255 - a) / 255);
    }
  return { src: { data, width, height }, left: -pad, top: -pad, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}
export function renderDropShadow(src, effects) {
  return renderDropShadowEffect(src, effectItems(effects, 'DrSh', 'dropShadowMulti')[0], effectScale(effects));
}
function renderDropShadows(src, effects) {
  const scale = effectScale(effects);
  return effectItems(effects, 'DrSh', 'dropShadowMulti').map(fx => renderDropShadowEffect(src, fx, scale)).filter(Boolean);
}


function glowPaint(fx) {
  const color = effectColor(fx['Clr ']);
  if (color) return { color };
  if (fx.Grad && typeof fx.Grad === 'object') {
    const f = gradientLutF({ Grad: fx.Grad }, 256);
    if (f) return { grad: f, jitter: Math.max(0, Math.min(1, unitValue(fx.ShdN, 0) / 100)) };
  }
  return null;
}
function paintGlowPixel(data, q, paint, v, x, y) {
  
  if (paint.color) { data[q] = paint.color[0]; data[q + 1] = paint.color[1]; data[q + 2] = paint.color[2]; return v; }
  if (v <= 0) return 0;
  let pos = 1 - v / 255;
  if (paint.jitter) pos = Math.max(0, Math.min(1, pos + (fxHash(x, y, 3) - 0.5) * paint.jitter));
  const k = Math.min(255, Math.round(pos * 255)) * 4, g = paint.grad;
  data[q] = g[k]; data[q + 1] = g[k + 1]; data[q + 2] = g[k + 2];
  return g[k + 3] * Math.min(1, v / 8);   
}
export function renderOuterGlow(src, effects) {
  if (!isEffectEnabled(effects, 'OrGl')) return null;
  const fx = effects.OrGl;
  const paint = glowPaint(fx); if (!paint) return null;
  
  const size = Math.max(0, Math.min(250, unitValue(fx.blur, 0) * effectScale(effects))), sp = Math.max(0, Math.min(1, unitValue(fx.Ckmt, 0) / 100));
  const pad = Math.ceil(size + 2), width = src.width + pad * 2, height = src.height + pad * 2, alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) alpha[(y + pad) * width + x + pad] = src.data[(y * src.width + x) * 4 + 3];
  let prof;
  if (fx.GlwT && fx.GlwT.value === 'PrBL' && size > 0) {
    
    const feat = new Uint8Array(width * height); for (let i = 0; i < feat.length; i++) feat[i] = alpha[i] >= 128 ? 1 : 0;
    const dist = distanceField(feat, width, height), hard = size * sp, soft = Math.max(1e-6, size - hard);
    prof = new Uint8ClampedArray(width * height);
    for (let i = 0; i < prof.length; i++) prof[i] = feat[i] ? 255 : Math.round(255 * Math.max(0, Math.min(1, 1 - (dist[i] - hard) / soft)));
  } else {
    const grown = dilateAlpha(alpha, width, height, size * sp);
    prof = blurAlpha(grown, width, height, size * (1 - sp), true);
  }
  const shape = fxProfile(fx);
  const opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 75) / 100)), data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < alpha.length; i++) {
    const q = i * 4, x = i % width, y = (i / width) | 0;
    let v = prof[i]; if (shape && v) v = shape(v, x, y);
    const a = paintGlowPixel(data, q, paint, v, x, y);
    data[q + 3] = Math.round(a * (255 - alpha[i]) / 255 * opacity);
  }
  return { src: { data, width, height }, left: -pad, top: -pad, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}























const morphScratch = { size: 0, buf: null, g: null, h: null };
function morphBuffers(need) {
  if (morphScratch.size < need) {
    morphScratch.size = need;
    morphScratch.buf = new Int32Array(need);
    morphScratch.g = new Int32Array(need);
    morphScratch.h = new Int32Array(need);
  }
  return morphScratch;
}
function slideMax(src, dst, n, count, stride, step, radius) {
  const k = radius * 2 + 1, M = Math.ceil((n + 2 * radius) / k) * k;
  const S = morphBuffers(M), buf = S.buf, g = S.g, h = S.h;
  for (let c = 0; c < count; c++) {
    const base = c * stride;
    for (let j = 0; j < radius; j++) buf[j] = 0;
    for (let i = 0, q = base; i < n; i++, q += step) buf[radius + i] = src[q];
    for (let j = radius + n; j < M; j++) buf[j] = 0;
    for (let b = 0; b < M; b += k) {
      let v = buf[b]; g[b] = v;
      for (let j = b + 1; j < b + k; j++) { const x = buf[j]; if (x > v) v = x; g[j] = v; }
      const e = b + k - 1;
      v = buf[e]; h[e] = v;
      for (let j = e - 1; j >= b; j--) { const x = buf[j]; if (x > v) v = x; h[j] = v; }
    }
    for (let i = 0, q = base; i < n; i++, q += step) { const a = h[i], z = g[i + k - 1]; dst[q] = a > z ? a : z; }
  }
}
function slideMin(src, dst, n, count, stride, step, radius) {
  const k = radius * 2 + 1, M = Math.ceil((n + 2 * radius) / k) * k;
  const S = morphBuffers(M), buf = S.buf, g = S.g, h = S.h;
  for (let c = 0; c < count; c++) {
    const base = c * stride;
    for (let j = 0; j < radius; j++) buf[j] = 0;
    for (let i = 0, q = base; i < n; i++, q += step) buf[radius + i] = src[q];
    for (let j = radius + n; j < M; j++) buf[j] = 0;
    for (let b = 0; b < M; b += k) {
      let v = buf[b]; g[b] = v;
      for (let j = b + 1; j < b + k; j++) { const x = buf[j]; if (x < v) v = x; g[j] = v; }
      const e = b + k - 1;
      v = buf[e]; h[e] = v;
      for (let j = e - 1; j >= b; j--) { const x = buf[j]; if (x < v) v = x; h[j] = v; }
    }
    for (let i = 0, q = base; i < n; i++, q += step) { const a = h[i], z = g[i + k - 1]; dst[q] = a < z ? a : z; }
  }
}
function dilateAlpha(data, width, height, radius) {
  radius = Math.max(0, Math.min(250, Math.round(radius)));
  if (!radius) return data;
  const mid = new Uint8ClampedArray(data.length), out = new Uint8ClampedArray(data.length);
  slideMax(data, mid, width, height, width, 1, radius);      
  slideMax(mid, out, height, width, 1, width, radius);       
  return out;
}
function erodeAlpha(data, width, height, radius) {
  radius = Math.max(0, Math.min(250, Math.round(radius)));
  if (!radius) return data;
  const mid = new Uint8ClampedArray(data.length), out = new Uint8ClampedArray(data.length);
  slideMin(data, mid, width, height, width, 1, radius);
  slideMin(mid, out, height, width, 1, width, radius);
  return out;
}




function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k] && k > 0) k--; else break; }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
function distanceField(feat, W, H) {
  const INF = 1e20, N = Math.max(W, H), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  const g = new Float64Array(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = feat[y * W + x] ? 0 : INF;
    edt1(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1(f, W, d, v, z);
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]);
  }
  return out;
}
function renderOuterStrokeEffect(src, fx, scale = 1) {
  if (!fx) return null;
  if (!['OutF', 'CtrF'].includes(fx.Styl?.value) || (fx.PntT && fx.PntT.value !== 'SClr')) return null;
  const color = effectColor(fx['Clr ']); if (!color) return null;
  const fullSize = Math.max(0, Math.min(250, unitValue(fx['Sz  '], 0) * scale));
  const size = fx.Styl?.value === 'CtrF' ? fullSize / 2 : fullSize; if (size < .25) return null;
  


  const pad = Math.ceil(size) + 1, width = src.width + pad * 2, height = src.height + pad * 2, alpha = new Uint8ClampedArray(width * height), feat = new Uint8Array(width * height);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) { const a = src.data[(y * src.width + x) * 4 + 3], i = (y + pad) * width + x + pad; alpha[i] = a; feat[i] = a >= 128 ? 1 : 0; }
  const dist = distanceField(feat, width, height), opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 100) / 100));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i] / 255; if (a >= 1) continue;
    const g = Math.max(a, Math.min(1, size + 1 - dist[i]));   
    const q = i * 4; data[q] = color[0]; data[q + 1] = color[1]; data[q + 2] = color[2]; data[q + 3] = Math.round((g - a) / (1 - a) * 255 * opacity);
  }
  return { src: { data, width, height }, left: -pad, top: -pad, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}
export function renderOuterStroke(src, effects) {
  return renderOuterStrokeEffect(src, effectItems(effects, 'FrFX', 'frameFXMulti')[0], effectScale(effects));
}
function renderOuterStrokes(src, effects) {
  const scale = effectScale(effects);
  return effectItems(effects, 'FrFX', 'frameFXMulti').map(fx => renderOuterStrokeEffect(src, fx, scale)).filter(Boolean);
}


function renderInnerStrokeEffect(src, fx, scale = 1) {
  if (!fx) return null;
  if (!['InsF', 'CtrF'].includes(fx.Styl?.value) || (fx.PntT && fx.PntT.value !== 'SClr')) return null;
  const color = effectColor(fx['Clr ']); if (!color) return null;
  const fullSize = Math.max(0, Math.min(250, unitValue(fx['Sz  '], 0) * scale));
  const size = fx.Styl?.value === 'CtrF' ? fullSize / 2 : fullSize; if (size < .25) return null;
  
  const W = src.width + 2, H = src.height + 2, feat = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (src.data[(y * src.width + x) * 4 + 3] >= 128) feat[(y + 1) * W + x + 1] = 0;
  const dist = distanceField(feat, W, H), opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 100) / 100));
  const data = new Uint8ClampedArray(src.width * src.height * 4);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const i = y * src.width + x, q = i * 4, a = src.data[q + 3]; if (!a) continue;
    const k = Math.max(0, Math.min(1, size + 1 - dist[(y + 1) * W + x + 1]));   
    if (k <= 0) continue;
    data[q] = color[0]; data[q + 1] = color[1]; data[q + 2] = color[2]; data[q + 3] = Math.round(a * k * opacity);
  }
  return { src: { data, width: src.width, height: src.height }, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}
export function renderInnerStroke(src, effects) {
  return renderInnerStrokeEffect(src, effectItems(effects, 'FrFX', 'frameFXMulti')[0], effectScale(effects));
}
function renderInnerStrokes(src, effects) {
  const scale = effectScale(effects);
  return effectItems(effects, 'FrFX', 'frameFXMulti').map(fx => renderInnerStrokeEffect(src, fx, scale)).filter(Boolean);
}


export function renderInnerGlow(src, effects) {
  if (!isEffectEnabled(effects, 'IrGl')) return null;
  const fx = effects.IrGl;
  const paint = glowPaint(fx); if (!paint) return null;
  
  const size = Math.max(0, Math.min(250, unitValue(fx.blur, 0) * effectScale(effects))), ck = Math.max(0, Math.min(1, unitValue(fx.Ckmt, 0) / 100));
  const pad = Math.ceil(size + 2), W = src.width + pad * 2, H = src.height + pad * 2, inv = new Uint8ClampedArray(W * H).fill(255);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) inv[(y + pad) * W + x + pad] = 255 - src.data[(y * src.width + x) * 4 + 3];
  let g;
  if (fx.GlwT && fx.GlwT.value === 'PrBL' && size > 0) {
    const feat = new Uint8Array(W * H); for (let i = 0; i < feat.length; i++) feat[i] = inv[i] >= 128 ? 1 : 0;
    const dist = distanceField(feat, W, H), hard = size * ck, soft = Math.max(1e-6, size - hard);
    g = new Uint8ClampedArray(W * H);
    for (let i = 0; i < g.length; i++) g[i] = feat[i] ? 255 : Math.round(255 * Math.max(0, Math.min(1, 1 - (dist[i] - hard) / soft)));
  } else g = blurAlpha(dilateAlpha(inv, W, H, size * ck), W, H, size * (1 - ck), true);
  const center = fx.glwS?.value === 'SrcC', opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 75) / 100));
  const shape = fxProfile(fx);
  const data = new Uint8ClampedArray(src.width * src.height * 4);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const i = y * src.width + x, q = i * 4, a = src.data[q + 3]; if (!a) continue;
    const v = g[(y + pad) * W + x + pad];
    let k = center ? 255 - v : v;
    if (shape && k) k = shape(k, x, y);
    const c = paintGlowPixel(data, q, paint, k, x, y);
    data[q + 3] = Math.round(c * a / 255 * opacity);
  }
  return { src: { data, width: src.width, height: src.height }, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}


function renderInnerShadowEffect(src, fx, scale = 1) {
  const color = effectColor(fx && fx['Clr ']); if (!color) return null;
  const blur = Math.max(0, Math.min(250, unitValue(fx.blur, 0) * scale)), distance = unitValue(fx.Dstn, 0) * scale, angle = fxAngle(fx, 120) * Math.PI / 180;
  const dx = Math.round(-Math.cos(angle) * distance), dy = Math.round(Math.sin(angle) * distance);
  
  const pad = Math.ceil(blur + Math.max(Math.abs(dx), Math.abs(dy)) + 2);
  const W = src.width + pad * 2, H = src.height + pad * 2;
  const alpha = new Uint8ClampedArray(src.width * src.height), shifted = new Uint8ClampedArray(W * H);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const i = y * src.width + x; alpha[i] = src.data[i * 4 + 3];
    shifted[(y + pad + dy) * W + x + pad + dx] = alpha[i];
  }
  const ck = Math.max(0, Math.min(1, unitValue(fx.Ckmt, 0) / 100));   
  const blurred = blurAlpha(erodeAlpha(shifted, W, H, blur * ck), W, H, blur * (1 - ck)), opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 75) / 100));
  const data = new Uint8ClampedArray(src.width * src.height * 4);
  const prof = fxProfile(fx);
  for (let i = 0; i < alpha.length; i++) {
    const q = i * 4, x = i % src.width, y = (i / src.width) | 0;
    let v = alpha[i] * (255 - blurred[(y + pad) * W + x + pad]) / 255;
    if (prof && v) v = Math.min(alpha[i], prof(Math.round(v), i % src.width, (i / src.width) | 0));
    data[q] = color[0]; data[q + 1] = color[1]; data[q + 2] = color[2]; data[q + 3] = Math.round(v * opacity);
  }
  return { src: { data, width: src.width, height: src.height }, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}
export function renderInnerShadow(src, effects) {
  return renderInnerShadowEffect(src, effectItems(effects, 'IrSh', 'innerShadowMulti')[0], effectScale(effects));
}
function renderInnerShadows(src, effects) {
  const scale = effectScale(effects);
  return effectItems(effects, 'IrSh', 'innerShadowMulti').map(fx => renderInnerShadowEffect(src, fx, scale)).filter(Boolean);
}




export function renderSatin(src, effects) {
  if (!isEffectEnabled(effects, 'ChFX')) return null;
  const fx = effects.ChFX, color = effectColor(fx['Clr ']);
  if (!color) return null;
  const scale = effectScale(effects), blur = Math.max(0, Math.min(128, unitValue(fx.blur, 0) * scale));
  const distance = unitValue(fx.Dstn, 0) * scale, angle = fxAngle(fx, 19) * Math.PI / 180;
  const dx = Math.round(-Math.cos(angle) * distance), dy = Math.round(Math.sin(angle) * distance);
  const alpha = new Uint8ClampedArray(src.width * src.height), plus = new Uint8ClampedArray(alpha.length), minus = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const i = y * src.width + x; alpha[i] = src.data[i * 4 + 3];
    const aX = x - dx, aY = y - dy, bX = x + dx, bY = y + dy;
    if (aX >= 0 && aX < src.width && aY >= 0 && aY < src.height) plus[i] = src.data[(aY * src.width + aX) * 4 + 3];
    if (bX >= 0 && bX < src.width && bY >= 0 && bY < src.height) minus[i] = src.data[(bY * src.width + bX) * 4 + 3];
  }
  const a = blurAlpha(plus, src.width, src.height, blur), b = blurAlpha(minus, src.width, src.height, blur);
  const satinLut = contourLut(fx.MpgS);   
  const opacity = Math.max(0, Math.min(1, unitValue(fx.Opct, 50) / 100)), data = new Uint8ClampedArray(src.width * src.height * 4);
  for (let i = 0; i < alpha.length; i++) {
    const q = i * 4; let contrast = fx.Invr ? 255 - Math.abs(a[i] - b[i]) : Math.abs(a[i] - b[i]);
    if (satinLut) contrast = satinLut[contrast | 0];
    data[q] = color[0]; data[q + 1] = color[1]; data[q + 2] = color[2]; data[q + 3] = Math.round(Math.min(alpha[i], contrast) * opacity);
  }
  return { src: { data, width: src.width, height: src.height }, blendMode: styleBlend(fx['Md  '] && fx['Md  '].value) };
}












export function renderBevel(src, effects, patterns = null) {
  if (!isEffectEnabled(effects, 'ebbl')) return null;
  const fx = effects.ebbl, hiColor = effectColor(fx.hglC), shadowColor = effectColor(fx.sdwC);
  if (!hiColor || !shadowColor) return null;
  const style = fx.bvlS?.value || 'InrB', tech = fx.bvlT?.value || 'SfBL', down = fx.bvlD?.value === 'Out ';
  const scale = effectScale(effects), size = Math.max(1, Math.min(250, unitValue(fx.blur, 5) * scale));
  const soften = Math.max(0, Math.min(16, unitValue(fx.Sftn, 0) * scale)), depth = Math.max(0.01, Math.min(10, unitValue(fx.srgR, 100) / 100));
  const angle = fxAngle(fx, 120) * Math.PI / 180, alt = Math.max(0, Math.min(90, unitValue(fx.Lald, 30))) * Math.PI / 180;
  const outside = style !== 'InrB';
  const pad = outside ? Math.ceil(size + soften + 2) : Math.ceil(soften + 2);
  const W = src.width + pad * 2, H = src.height + pad * 2, N = W * H;
  const A = new Float32Array(N), inF = new Uint8Array(N), outF = new Uint8Array(N);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) A[(y + pad) * W + x + pad] = src.data[(y * src.width + x) * 4 + 3] / 255;
  for (let i = 0; i < N; i++) { if (A[i] >= 0.5) inF[i] = 1; else outF[i] = 1; }
  const dIn = distanceField(outF, W, H);    
  const dOut = distanceField(inF, W, H);    
  
  let h = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const inside = inF[i] === 1, si = inside ? dIn[i] - 0.5 : -(dOut[i] - 0.5);   
    let v;
    if (style === 'OtrB') v = inside ? 1 : Math.max(0, 1 + si / size);
    else if (style === 'Embs' || style === 'strokeEmboss') v = Math.max(0, Math.min(1, (si + size / 2) / size));
    else if (style === 'PlEb') v = Math.min(1, Math.abs(si) / (size / 2));
    else v = tech === 'SfBL' ? Math.min(1, si / size) : inside ? Math.min(1, (dIn[i] - 1) / size) : 0;
    h[i] = v;
  }
  if (tech === 'SfBL') {
    



    const ease = style === 'OtrB' ? (t => t * t)
      : (style === 'Embs' || style === 'strokeEmboss') ? (t => t <= 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))
      : (t => 2 * t - t * t);
    for (let i = 0; i < N; i++) h[i] = ease(h[i]);
    


    const solidRect = (() => {
      const L = pad, T = pad, R = pad + src.width, B = pad + src.height;
      for (let yy = T; yy < B; yy++) for (let xx = L; xx < R; xx++) if (!inF[yy * W + xx]) return false;
      return true;
    })();
    if (solidRect && style === 'InrB' && tech === 'SfBL') {
      const radius = 16, blurred = blurFloat(h, W, H, radius);
      const L = pad, T = pad, R = pad + src.width, B = pad + src.height;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        const dx = Math.min(xx - L, R - 1 - xx), dy = Math.min(yy - T, B - 1 - yy);
        if (dx < 0 || dy < 0 || dx >= size || dy >= size) continue;
        const w = 1.25 * Math.max(0, Math.min(1, 1 - Math.max(dx, dy) / size));
        if (w) { const i = yy * W + xx; h[i] = h[i] * (1 - w) + blurred[i] * w; }
      }
    }
    

    if (solidRect && style === 'OtrB' && tech === 'SfBL') {
      const radius = 8, blurred = blurFloat(h, W, H, radius);
      const L = pad, T = pad, R = pad + src.width, B = pad + src.height;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        const dx = Math.min(xx - L, R - 1 - xx), dy = Math.min(yy - T, B - 1 - yy);
        if (dx >= 0 || dy >= 0 || dx < -size || dy < -size) continue;
        const edge = Math.max(-dx - 1, -dy - 1);
        const w = 1.5 * Math.max(0, Math.min(1, 1 - edge / size));
        if (w) { const i = yy * W + xx; h[i] = h[i] * (1 - w) + blurred[i] * w; }
      }
    }
    

  } else if (tech === 'Slmt') h = blurFloat(h, W, H, 1);
  const prof = fx.useShape ? contourLut(fx.TrnS) : null;   
  
  let tex = null;
  if (fx.useTexture && fx.Ptrn && fx.Ptrn.Idnt && Array.isArray(patterns)) {
    const pat = patterns.find(q => q.id === fx.Ptrn.Idnt), img = pat && patternToRGBA(pat);
    if (img) tex = { img, sc: Math.max(0.01, unitValue(fx['Scl '], 100) / 100), depth: Math.max(-10, Math.min(10, unitValue(fx.textureDepth, 100) / 100)), inv: !!fx.InvT };
  }
  if (prof) for (let i = 0; i < N; i++) h[i] = prof[Math.max(0, Math.min(255, Math.round(h[i] * 255)))] / 255;
  if (tex) {
    const { img, sc, depth: td, inv } = tex, iw = img.width, ih = img.height, d8 = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!A[i] && style === 'InrB') continue;
      const tx = ((Math.floor((x - pad) / sc) % iw) + iw) % iw, ty = ((Math.floor((y - pad) / sc) % ih) + ih) % ih, o = (ty * iw + tx) * 4;
      let lum = (d8[o] * 0.299 + d8[o + 1] * 0.587 + d8[o + 2] * 0.114) / 255; if (inv) lum = 1 - lum;
      h[i] += (lum - 0.5) * td * 0.15;
    }
  }
  
  const k = 0.5 * size * depth * (down ? -1 : 1);
  const Lx = Math.cos(alt) * Math.cos(angle), Ly = -Math.cos(alt) * Math.sin(angle), Lz = Math.sin(alt);
  const flat = Lz, span = Math.max(1e-3, 1 - flat);
  let hi = new Float32Array(N), sh = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let gx = ((x + 1 < W ? h[i + 1] : h[i]) - (x > 0 ? h[i - 1] : h[i])) / 2 * k;
    let gy = ((y + 1 < H ? h[i + W] : h[i]) - (y > 0 ? h[i - W] : h[i])) / 2 * k;
    if (style === 'InrB' && tech === 'PrBL' && inF[i]) {
      if (x > 0 && x + 1 < W && !inF[i - 1]) gx = (h[i + 1] - h[i]) * k;
      else if (x > 0 && x + 1 < W && !inF[i + 1]) gx = (h[i] - h[i - 1]) * k;
      if (y > 0 && y + 1 < H && !inF[i - W]) gy = (h[i + W] - h[i]) * k;
      else if (y > 0 && y + 1 < H && !inF[i + W]) gy = (h[i] - h[i - W]) * k;
    }
    if (!gx && !gy) continue;
    const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    const shade = (-gx * Lx - gy * Ly + Lz) * inv;
    
    if (shade > flat) hi[i] = Math.min(1, (shade - flat) / span); else sh[i] = Math.min(1, (flat - shade) / Math.max(1e-3, flat));
  }
  const gloss = contourLut(fx.MpgS);   
  if (gloss) for (let i = 0; i < N; i++) {
    if (hi[i]) hi[i] = gloss[Math.round(hi[i] * 255)] / 255;
    if (sh[i]) sh[i] = gloss[Math.round(sh[i] * 255)] / 255;
  }
  if (soften >= 0.5) { hi = blurFloat(hi, W, H, soften); sh = blurFloat(sh, W, H, soften); }
  
  const highlight = new Uint8ClampedArray(N * 4), shadow = new Uint8ClampedArray(N * 4);
  const hiOpacity = Math.max(0, Math.min(1, unitValue(fx.hglO, 75) / 100)), shadowOpacity = Math.max(0, Math.min(1, unitValue(fx.sdwO, 75) / 100));
  for (let i = 0; i < N; i++) {
    const m = style === 'InrB' ? A[i] : style === 'OtrB' ? 1 - A[i] : 1;
    if (!m) continue;
    const q = i * 4;
    if (hi[i]) { highlight[q] = hiColor[0]; highlight[q + 1] = hiColor[1]; highlight[q + 2] = hiColor[2]; highlight[q + 3] = Math.round(hi[i] * m * 255 * hiOpacity); }
    if (sh[i]) { shadow[q] = shadowColor[0]; shadow[q + 1] = shadowColor[1]; shadow[q + 2] = shadowColor[2]; shadow[q + 3] = Math.round(sh[i] * m * 255 * shadowOpacity); }
  }
  return { highlight: { src: { data: highlight, width: W, height: H }, left: -pad, top: -pad, blendMode: styleBlend(fx.hglM?.value) },
    shadow: { src: { data: shadow, width: W, height: H }, left: -pad, top: -pad, blendMode: styleBlend(fx.sdwM?.value) } };
}

export const renderInnerBevel = renderBevel;

function blurFloat(src, width, height, radius) {
  radius = Math.max(0, Math.min(250, Math.round(radius)));
  if (!radius) return src;
  

  const lo = Math.floor(radius / 2), rs = [lo, radius - lo];
  const a = Float32Array.from(src), b = new Float32Array(src.length);
  for (const r of rs) {
    if (!r) continue;
    boxLine(a, b, height, width, width, 1, r);      
    boxLine(b, a, width, height, 1, width, r);      
  }
  return a;
}




const shapeSourceCache = new WeakMap();
export function shapeSource(l, docW, docH, patterns) {
  

  const fillAlpha = Math.max(0, Math.min(1, (l.fillOpacity == null ? 255 : l.fillOpacity) / 255));
  const render = () => {
    let fill = l.fill, vectorMask = l.vectorMask || null, rw = docW, rh = docH, left = 0, top = 0;
    



    if (docW * docH > 64e6 && vectorMask && typeof vectorMask === 'object' && vectorMask.path &&
        !vectorMask.invert && !vectorMask.path.records?.some(r => r && r.type === 'initialFill' && r.fillStartsWithAllPixels)) {
      const pts = [];
      for (const r of vectorMask.path.records || []) for (const k of ['anchor', 'leaving', 'preceding']) {
        const p = r && r[k]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push(p);
      }
      if (pts.length) {
        let x0 = Math.min(...pts.map(p => p.x)) * docW, y0 = Math.min(...pts.map(p => p.y)) * docH;
        let x1 = Math.max(...pts.map(p => p.x)) * docW, y1 = Math.max(...pts.map(p => p.y)) * docH;
        const sw = vectorStrokeRenderParams(l.vectorStroke, vectorMask)?.width || 0, pad = Math.ceil(sw + 2);
        left = Math.max(0, Math.floor(x0 - pad)); top = Math.max(0, Math.floor(y0 - pad));
        const right = Math.min(docW, Math.ceil(x1 + pad)), bottom = Math.min(docH, Math.ceil(y1 + pad));
        rw = Math.max(1, right - left); rh = Math.max(1, bottom - top);
        if (rw < docW || rh < docH) {
          const path = { ...vectorMask.path, records: (vectorMask.path.records || []).map(r => {
            const out = { ...r };
            for (const k of ['anchor', 'leaving', 'preceding']) if (r[k]) out[k] = { x: (r[k].x * docW - left) / rw, y: (r[k].y * docH - top) / rh };
            return out;
          }) };
          vectorMask = { ...vectorMask, path };
        } else { left = 0; top = 0; rw = docW; rh = docH; }
      }
    }
    const full = renderShape(fill, l.vectorStroke, vectorMask, rw, rh, patterns, fillAlpha);
    if (!full) return null;
    const b = alphaBounds(full);
    if (!b) return { src: { data: new Uint8ClampedArray(4), width: 1, height: 1 }, left: 0, top: 0 };
    if (b.left === 0 && b.top === 0 && b.right === rw && b.bottom === rh) return { src: full, left, top };
    return { src: crop(full, b), left: left + b.left, top: top + b.top };
  };
  const key = l.vectorMask && typeof l.vectorMask === 'object' ? l.vectorMask : (l.fill && typeof l.fill === 'object' ? l.fill : null);
  let sig = null;
  try {
    sig = (l.vectorMask ? vectorMaskSig(l.vectorMask, docW, docH) : `${docW}x${docH}`) + '|' + JSON.stringify(l.fill && l.fill.params)
      + '|' + (l.fill && l.fill.key) + '|' + JSON.stringify(l.vectorStroke && l.vectorStroke.desc) + '|' + (Array.isArray(patterns) ? patterns.map(p => p && p.id).join(',') : '')
      + '|f' + fillAlpha;
  } catch { sig = null; }
  if (!key || sig == null) { const r = render(); return r && { ...r, fillApplied: true }; }
  const c = shapeSourceCache.get(key);
  let out = c && c.sig === sig ? c.out : null;
  if (!c || c.sig !== sig) { out = render(); shapeSourceCache.set(key, { sig, out }); }
  return out && { src: { data: out.src.data.slice(), width: out.src.width, height: out.src.height }, left: out.left, top: out.top, fillApplied: true };
}




const frameRectStrokeCache = new WeakMap();
const frameEllipseStrokeCache = new WeakMap();




const TEXT_ALPHA_GAMMA = 1.4;
function hasCoarseTextCoverage(data) {
  const seen = new Uint8Array(256); let unique = 0, coarse = true;
  for (let q = 3; q < data.length; q += 4) {
    const a = data[q]; if (!a || a === 255) continue;
    if (!seen[a]) { seen[a] = 1; unique++; }
    if (a % 17 !== 0) coarse = false;
    if (unique > 32) return false;
  }
  return coarse && unique > 0;
}







function frameEllipseStrokeSource(group, params, docW, docH) {
  const frame = group.frame || group.frameInfo;
  if (frame?.shape !== 'ellipse' || !frame.rect || params.dashes.length || params.gradient) return null;
  const r = frame.rect, rx = r.w / 2, ry = r.h / 2, cx = r.x + rx, cy = r.y + ry;
  const outside = params.align === 'strokeStyleAlignOutside' ? params.width : params.align === 'strokeStyleAlignCenter' ? params.width / 2 : 0;
  const inside = params.width - outside;
  
  
  if (!(rx > 0 && ry > 0) || inside >= Math.min(rx * rx / ry, ry * ry / rx)) return null;
  const paths = groupSubpaths(group.vectorMask.path), k = 0.5522847498307936;
  if (paths.length !== 1 || paths[0].subpath?.open || paths[0].knots.length !== 4) return null;
  const knots = paths[0].knots;
  const expected = [
    [[cx, r.y], [cx - rx * k, r.y], [cx + rx * k, r.y]],
    [[r.x + r.w, cy], [r.x + r.w, cy - ry * k], [r.x + r.w, cy + ry * k]],
    [[cx, r.y + r.h], [cx + rx * k, r.y + r.h], [cx - rx * k, r.y + r.h]],
    [[r.x, cy], [r.x, cy + ry * k], [r.x, cy - ry * k]],
  ];
  const near = (p, q) => !!p && Math.abs(p.x * docW - q[0]) < 1e-3 && Math.abs(p.y * docH - q[1]) < 1e-3;
  if (!knots.every((p, i) => near(p.anchor, expected[i][0]) && near(p.preceding, expected[i][1]) && near(p.leaving, expected[i][2]))) return null;
  const key = group.vectorMask, sig = vectorMaskSig(key, docW, docH) + '|' + JSON.stringify(params) + '|' + JSON.stringify(r);
  const hit = frameEllipseStrokeCache.get(key);
  if (hit?.sig === sig) return hit.item;
  const left = Math.max(0, Math.floor(r.x - outside)), top = Math.max(0, Math.floor(r.y - outside));
  const right = Math.min(docW, Math.ceil(r.x + r.w + outside)), bottom = Math.min(docH, Math.ceil(r.y + r.h + outside));
  if (right <= left || bottom <= top) return null;
  const width = right - left, height = bottom - top;
  const segmentDistance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const offsetPolygon = distance => {
    const points = [];
    for (let i = 0; i < knots.length; i++) {
      const current = knots[i], next = knots[(i + 1) % knots.length];
      const a = pathPoint(current.anchor, docW, docH), b = pathPoint(current.leaving, docW, docH);
      const c = pathPoint(next.preceding, docW, docH), d = pathPoint(next.anchor, docW, docH);
      const at = t => {
        const u = 1 - t, p = curvePoint(a, b, c, d, t);
        const dx = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x);
        const dy = 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y), norm = Math.hypot(dx, dy);
        return { x: p.x + distance * dy / norm, y: p.y - distance * dx / norm };
      };
      const split = (t0, t1, a, b, depth) => {
        const dt = t1 - t0, tm = (t0 + t1) / 2, m = at(tm);
        if (depth < 14 && Math.max(segmentDistance(m, a, b), segmentDistance(at(t0 + dt / 4), a, b), segmentDistance(at(t0 + dt * 3 / 4), a, b)) > 1 / 32) {
          split(t0, tm, a, m, depth + 1); split(tm, t1, m, b, depth + 1);
        } else points.push(a);
      };
      split(0, 1, at(0), at(1), 0);
    }
    return points;
  };
  const coverage = new Float64Array(width * height);
  for (const [polygon, sign] of [[offsetPolygon(outside), 1], [offsetPolygon(-inside), -1]]) {
    for (let y = top; y < bottom; y++) for (let sample = 0; sample < 32; sample++) {
      const yy = y + (sample + .5) / 32, hits = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if ((a.y > yy) !== (b.y > yy)) hits.push(a.x + (b.x - a.x) * (yy - a.y) / (b.y - a.y));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i < hits.length; i += 2) {
        const l = Math.max(left, hits[i]), rr = Math.min(right, hits[i + 1]);
        for (let x = Math.floor(l); x < Math.ceil(rr); x++) coverage[(y - top) * width + x - left] += sign * Math.max(0, Math.min(x + 1, rr) - Math.max(x, l)) / 32;
      }
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < coverage.length; i++) {
    const alpha = Math.round(Math.max(0, Math.min(1, coverage[i])) * 255 * params.opacity);
    if (!alpha) continue;
    data[i * 4] = params.color[0]; data[i * 4 + 1] = params.color[1]; data[i * 4 + 2] = params.color[2]; data[i * 4 + 3] = alpha;
  }
  const item = { src: { data, width, height }, left, top, fillApplied: true };
  frameEllipseStrokeCache.set(key, { sig, item });
  return item;
}
function frameRectMiterSource(group, params, docW, docH) {
  const frame = group.frame || group.frameInfo, d = group.vectorStroke.desc;
  if (frame?.shape !== 'rect' || !frame.rect || params.dashes.length || params.gradient ||
      d.strokeStyleLineJoinType?.value !== 'strokeStyleMiterJoin' || (d.strokeStyleMiterLimit ?? 100) < Math.SQRT2) return null;
  const paths = groupSubpaths(group.vectorMask.path), r = frame.rect;
  if (paths.length !== 1 || paths[0].subpath?.open || paths[0].knots.length !== 4) return null;
  
  
  
  const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const near = (p, q) => !!p && Math.abs(p.x * docW - q[0]) < 1e-3 && Math.abs(p.y * docH - q[1]) < 1e-3;
  if (!paths[0].knots.every((k, i) => near(k.anchor, corners[i]) && near(k.preceding, corners[i]) && near(k.leaving, corners[i]))) return null;
  const key = group.vectorMask, sig = `${docW}x${docH}|${JSON.stringify(r)}|${JSON.stringify(params)}`;
  const hit = frameRectStrokeCache.get(key);
  if (hit?.sig === sig) return hit.item;
  const outside = params.align === 'strokeStyleAlignOutside' ? params.width : params.align === 'strokeStyleAlignCenter' ? params.width / 2 : 0;
  const inside = params.width - outside;
  const outer = { l: r.x - outside, t: r.y - outside, r: r.x + r.w + outside, b: r.y + r.h + outside };
  const inner = { l: r.x + inside, t: r.y + inside, r: r.x + r.w - inside, b: r.y + r.h - inside };
  const left = Math.max(0, Math.floor(outer.l)), top = Math.max(0, Math.floor(outer.t));
  const right = Math.min(docW, Math.ceil(outer.r)), bottom = Math.min(docH, Math.ceil(outer.b));
  if (right <= left || bottom <= top) return null;
  const width = right - left, height = bottom - top, data = new Uint8ClampedArray(width * height * 4);
  const inRect = (x, y, q) => x >= q.l && x < q.r && y >= q.t && y < q.b;
  const samples = maskSampleOffsets(docW, docH), n = samples.length ** 2;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    let hits = 0;
    for (const sy of samples) for (const sx of samples) if (inRect(x + sx, y + sy, outer) && !inRect(x + sx, y + sy, inner)) hits++;
    if (!hits) continue;
    const p = ((y - top) * width + x - left) * 4;
    data[p] = params.color[0]; data[p + 1] = params.color[1]; data[p + 2] = params.color[2]; data[p + 3] = Math.round(255 * params.opacity * hits / n);
  }
  const item = { src: { data, width, height }, left, top, fillApplied: true };
  frameRectStrokeCache.set(key, { sig, item });
  return item;
}
export function frameStrokeSource(group, docW, docH, patterns) {
  if (!group || !(group.frame || group.frameInfo || group.isFrame)) return null;
  
  
  if (group._frameStrokeSource !== undefined) return group._frameStrokeSource;
  const params = vectorStrokeRenderParams(group.vectorStroke, group.vectorMask);
  if (!params) return null;
  const rectangle = frameRectMiterSource(group, params, docW, docH);
  if (rectangle) return rectangle;
  const ellipse = frameEllipseStrokeSource(group, params, docW, docH);
  if (ellipse) return ellipse;
  return shapeSource({ ...group, fill: null, mask: null, vectorStroke: {
    ...group.vectorStroke, desc: { ...group.vectorStroke.desc, fillEnabled: false },
  } }, docW, docH, patterns);
}







const regionPrep = new WeakMap();       
export { vectorMaskSig };
export function regionizeDoc(doc, docW, docH, x0, y0, rw, rh, keepIdx = -1) {
  const layers = [];
  for (let i = 0; i < doc.layers.length; i++) {
    const l = doc.layers[i];
    const isGroupHead = l.group && (l.group.type === 1 || l.group.type === 2);
    const frameStroke = isGroupHead ? frameStrokeSource(l, docW, docH, doc.patterns) : null;
    const shapey = !isGroupHead && (hasRenderableFill(l.fill, l.vectorMask, doc.patterns) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask));
    const vmask = !isGroupHead && !l.adjustment && hasRenderableVectorMask(l.vectorMask) && l.rgba && l.width > 0;
    let base = l;
    if (isGroupHead && (groupHasMask(l) || frameStroke)) {
      const full = groupMaskAlpha(l, docW, docH), gray = new Uint8Array(rw * rh);
      const stroke = frameStroke;
      for (let y = 0; y < rh; y++) gray.set(full.subarray((y + y0) * docW + x0, (y + y0) * docW + x0 + rw), y * rw);
      layers.push({ ...l, vectorMask: null, _frameStrokeSource: stroke && { ...stroke, left: stroke.left - x0, top: stroke.top - y0 }, mask: { gray, width: rw, height: rh, left: 0, top: 0, right: rw, bottom: rh, relative: false, defaultColor: 0, disabled: false, invert: false },
        bounds: l.bounds ? { top: l.bounds.top - y0, left: l.bounds.left - x0, bottom: l.bounds.bottom - y0, right: l.bounds.right - x0 } : l.bounds,
        ...(l.artboard && l.artboard.rect ? { artboard: { ...l.artboard, rect: { ...l.artboard.rect, x: l.artboard.rect.x - x0, y: l.artboard.rect.y - y0 } } } : {}) });
      continue;
    }
    if (shapey || vmask) {
      if (i === keepIdx) return null;
      const sig = `${docW}x${docH}`;
      let c = regionPrep.get(l);
      if (!c || c.sig !== sig) {
        let conv;
        if (shapey) {
          const it = shapeSource(l, docW, docH, doc.patterns);
          
          if (it && l.mask && l.mask.gray && !l.mask.disabled)
            multiplyLayerMask(it.src.data, it.src.width, it.src.height, it.left, it.top, l.mask, (l.bounds && l.bounds.top) || 0, (l.bounds && l.bounds.left) || 0);
          conv = it ? { ...l, fill: null, vectorStroke: null, vectorMask: null, fillOpacity: 255, rgba: it.src.data, width: it.src.width, height: it.src.height,
            bounds: { top: it.top, left: it.left, bottom: it.top + it.src.height, right: it.left + it.src.width } } : { ...l, fill: null, vectorStroke: null, vectorMask: null, rgba: null, width: 0, height: 0 };
        } else {
          const src = applyVectorMaskToSource({ data: l.rgba, width: l.width, height: l.height }, l.vectorMask, l.bounds.left, l.bounds.top, docW, docH);
          conv = { ...l, vectorMask: null, rgba: src.data };
        }
        c = { sig, layer: conv }; regionPrep.set(l, c);
      }
      base = c.layer;
    }
    const b = base.bounds, out = { ...base };
    if (base.artboard && base.artboard.rect) out.artboard = { ...base.artboard, rect: { ...base.artboard.rect, x: base.artboard.rect.x - x0, y: base.artboard.rect.y - y0 } };
    if (b) out.bounds = { top: b.top - y0, left: b.left - x0, bottom: b.bottom - y0, right: b.right - x0 };
    if (base.mask && !base.mask.relative && base.mask.left != null) {
      const m = base.mask;
      out.mask = { ...m, left: m.left - x0, top: m.top - y0, ...(m.right != null ? { right: m.right - x0 } : {}), ...(m.bottom != null ? { bottom: m.bottom - y0 } : {}) };
    }
    layers.push(out);
  }
  return { ...doc, layers };
}





export function groupHasMask(g) {
  const pm = g && g.mask && g.mask.gray && !g.mask.disabled;
  return !!(pm || (g && hasRenderableVectorMask(g.vectorMask) && !g.vectorMask.disable));
}
const groupMaskCache = new WeakMap();











export function groupMaskAlpha(g, docW, docH) {
  const b = g.bounds || { top: 0, left: 0 };
  const pm = g.mask && g.mask.gray && !g.mask.disabled ? g.mask : null;
  const vm = hasRenderableVectorMask(g.vectorMask) && !g.vectorMask.disable ? g.vectorMask : null;
  const keyObj = vm || pm || null;
  const sig = keyObj
    ? `${docW}x${docH}|${b.top || 0},${b.left || 0}|${pm ? 'm' : '-'}|${vm ? vectorMaskSig(vm, docW, docH) : '-'}`
    : null;
  if (keyObj) {
    const hit = groupMaskCache.get(keyObj);
    if (hit && hit.sig === sig && hit.pm === pm && hit.vm === vm) return hit.out;
  }
  let out;
  if (!pm) {
    
    if (vm) { const v = vectorMaskAlphaShared(vm, docW, docH); out = new Uint8Array(docW * docH); out.set(v); }
    else { out = new Uint8Array(docW * docH); out.fill(255); }
  } else {
    const tmp = new Uint8ClampedArray(docW * docH * 4);
    for (let q = 3; q < tmp.length; q += 4) tmp[q] = 255;
    multiplyLayerMask(tmp, docW, docH, 0, 0, pm, b.top || 0, b.left || 0);
    out = new Uint8Array(docW * docH);
    for (let q = 0; q < out.length; q++) out[q] = tmp[q * 4 + 3];
    if (vm) {
      const v = vectorMaskAlphaShared(vm, docW, docH);
      for (let q = 0; q < out.length; q++) out[q] = Math.round(out[q] * v[q] / 255);
    }
  }
  if (keyObj) groupMaskCache.set(keyObj, { sig, pm, vm, out });
  return out;
}





export function computeLayerFx(item, l, patterns = null) {
  const fillLow = !item.fillApplied && (l.fillOpacity ?? 255) < 255;
  const FX = { data: item.src.data, effects: l.effects, fillLow, w: item.src.width, h: item.src.height };
  FX.shadows = renderDropShadows(item.src, l.effects);
  FX.glow = renderOuterGlow(item.src, l.effects);
  
  FX.overlay = null;
  if (fillLow) { const sp = renderLayerEffects(item.src, l.effects, patterns, { split: true }); FX.overlay = sp.overlay; FX.src = item.src; }
  else FX.src = renderLayerEffects(item.src, l.effects, patterns);
  FX.modeOverlays = renderModeOverlays(item.src, l.effects, patterns);
  FX.innerShadows = renderInnerShadows(FX.src, l.effects);
  FX.innerGlow = renderInnerGlow(FX.src, l.effects);
  FX.innerStrokes = renderInnerStrokes(FX.src, l.effects); FX.outerStrokes = renderOuterStrokes(FX.src, l.effects);
  FX.satin = renderSatin(FX.src, l.effects);
  FX.bevel = renderBevel(FX.src, l.effects, patterns);
  return FX;
}







export function compositeSplitPoints(doc) {
  const layers = doc.layers, pairs = new Map(), stack = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const type = layers[i].group && layers[i].group.type;
    if (type === 1 || type === 2) stack.push(i);
    else if (type === 3 && stack.length) pairs.set(i, stack.pop());
  }
  const out = new Set([layers.length]);
  for (let i = 0; i < layers.length; i++) {
    if (!layers[i].clipping) out.add(i);
    const type = layers[i].group && layers[i].group.type;
    if (type === 3 && pairs.has(i)) i = pairs.get(i);
  }
  return out;
}






export function compositeAll(doc, docW, docH, warped, opts = null) {
  setGlobalLightAngle(globalLightAngleOf(doc));   
  const layers = doc.layers, pairs = new Map(), stack = [];
  


  const hasFineTextLayer = layers.some(l => (l.isText || l.layerType === 'text') && l.rgba && !hasCoarseTextCoverage(l.rgba));
  
  for (let i = layers.length - 1; i >= 0; i--) {
    const type = layers[i].group && layers[i].group.type;
    if (type === 1 || type === 2) stack.push(i);
    else if (type === 3 && stack.length) pairs.set(i, stack.pop());
  }
  const sourceOf = i => {
    const l = layers[i];
    if (warped.has(i)) {
      
      
      
      
      const raw = warped.get(i);
      const data = new Uint8ClampedArray(raw.data);
      if (l.mask) multiplyLayerMask(data, raw.width, raw.height, 0, 0, l.mask, l.bounds.top, l.bounds.left);
      return { src: applyVectorMaskToSource({ ...raw, data }, l.vectorMask, 0, 0, docW, docH), left: 0, top: 0 };
    }
    if (hasRenderableFill(l.fill, l.vectorMask, doc.patterns) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask)) {
      const it = shapeSource(l, docW, docH, doc.patterns);
      

      if (it && l.mask && l.mask.gray && !l.mask.disabled)
        multiplyLayerMask(it.src.data, it.src.width, it.src.height, it.left, it.top, l.mask, (l.bounds && l.bounds.top) || 0, (l.bounds && l.bounds.left) || 0);
      return it;
    }
    if (l.rgba && l.width > 0 && l.height > 0) {
      let data = l.rgba;
      if ((l.isText || l.layerType === 'text') && !hasFineTextLayer && hasCoarseTextCoverage(data)) {
        data = new Uint8ClampedArray(l.rgba);
        for (let q = 3; q < data.length; q += 4)
          data[q] = Math.round(255 * Math.pow(data[q] / 255, TEXT_ALPHA_GAMMA));
      }
      const src = { data, width: l.width, height: l.height };
      return { src: applyVectorMaskToSource(src, l.vectorMask, l.bounds.left, l.bounds.top, docW, docH), left: l.bounds.left, top: l.bounds.top };
    }
    return null;
  };
  const renderRange = (dst, from, to, inheritedHidden = false, capture = null) => {
    

    let clipBase = null;
    const baseOf = cb => (cb && cb.__lazy ? baseAlphaMask(cb.__lazy.src, cb.__lazy.left, cb.__lazy.top, docW, docH) : cb);
    for (let i = from; i < to; i++) {
      if (capture && capture.at === i) { capture.opts.captured = dst.data.slice(); capture = null; }
      const l = layers[i], type = l.group && l.group.type;
      if (type === 3 && pairs.has(i)) {
        const header = pairs.get(i), group = layers[header], hidden = inheritedHidden || !!group.hidden;
        const pass = group.blendMode === 'pass';
        
        const isolated = !pass || (group.opacity ?? 255) !== 255;
        const masked = groupHasMask(group);
        const stroke = !hidden ? frameStrokeSource(group, docW, docH, doc.patterns) : null;
        if (masked && pass && !hidden) {
          

          const target = createSurface(docW, docH);
          target.data.set(dst.data);          
          renderRange(target, i + 1, header, false);   
          const m = groupMaskAlpha(group, docW, docH), k = (group.opacity ?? 255) / 255;
          const D = dst.data, T = target.data;
          const rc = dirtyRect(target);
          if (stroke) {
            
            
            for (let yy = rc.top; yy < rc.bottom; yy++) for (let xx = rc.left, q = yy * docW + rc.left, p4 = q * 4; xx < rc.right; xx++, q++, p4 += 4) {
              const a = m[q] / 255;
              for (let c = 0; c < 4; c++) T[p4 + c] = Math.round(D[p4 + c] + (T[p4 + c] - D[p4 + c]) * a);
            }
            drawLayer(target, stroke.src, stroke.left, stroke.top, { opacity: 1, blendMode: 'norm' });
            const sr = dirtyRect(target);
            for (let yy = sr.top; yy < sr.bottom; yy++) for (let xx = sr.left, p4 = (yy * docW + sr.left) * 4; xx < sr.right; xx++, p4 += 4)
              for (let c = 0; c < 4; c++) D[p4 + c] = Math.round(D[p4 + c] + (T[p4 + c] - D[p4 + c]) * k);
            growDirty(dst, sr.left, sr.top, sr.right, sr.bottom);
            clipBase = null; i = header; continue;
          }
          for (let yy = rc.top; yy < rc.bottom; yy++) for (let xx = rc.left, q = yy * docW + rc.left, p4 = q * 4; xx < rc.right; xx++, q++, p4 += 4) {
            const a = (m[q] / 255) * k;
            if (a <= 0) continue;
            if (a >= 1) { D[p4] = T[p4]; D[p4 + 1] = T[p4 + 1]; D[p4 + 2] = T[p4 + 2]; D[p4 + 3] = T[p4 + 3]; continue; }
            for (let c = 0; c < 4; c++) D[p4 + c] = Math.round(D[p4 + c] + (T[p4 + c] - D[p4 + c]) * a);
          }
          growDirty(dst, rc.left, rc.top, rc.right, rc.bottom);
          clipBase = null; i = header; continue;
        }
        


        const abd = !hidden && group.artboard && group.artboard.rect ? group.artboard : null;
        const iso = isolated || masked || !!abd || !!stroke;
        const target = iso ? createSurface(docW, docH) : dst;
        let abR = null;
        if (abd) {
          const r = abd.rect;
          abR = { l: Math.max(0, Math.round(r.x)), t: Math.max(0, Math.round(r.y)),
                  r: Math.min(docW, Math.round(r.x + r.w)), b: Math.min(docH, Math.round(r.y + r.h)) };
          const bt = abd.bgType | 0;
          if (bt !== 3 && abR.r > abR.l && abR.b > abR.t) {
            const c = bt === 2 ? [0, 0, 0] : bt === 4 && Array.isArray(abd.color) ? abd.color : [255, 255, 255];
            const T = target.data;
            for (let yy = abR.t; yy < abR.b; yy++) for (let xx = abR.l, p4 = (yy * docW + abR.l) * 4; xx < abR.r; xx++, p4 += 4) {
              T[p4] = c[0]; T[p4 + 1] = c[1]; T[p4 + 2] = c[2]; T[p4 + 3] = 255;
            }
            growDirty(target, abR.l, abR.t, abR.r, abR.b);
          }
        }
        if (!hidden) renderRange(target, i + 1, header, false);
        if (abR && !abd.noClip) {             
          const T = target.data, rc = dirtyRect(target);
          for (let yy = rc.top; yy < rc.bottom; yy++) {
            const inY = yy >= abR.t && yy < abR.b;
            for (let xx = rc.left, p4 = (yy * docW + rc.left) * 4; xx < rc.right; xx++, p4 += 4)
              if (!inY || xx < abR.l || xx >= abR.r) T[p4 + 3] = 0;
          }
        }
        
        if (masked && !hidden) {
          const m = groupMaskAlpha(group, docW, docH), T = target.data, rc = dirtyRect(target);
          
          for (let yy = rc.top; yy < rc.bottom; yy++) for (let xx = rc.left, q = yy * docW + rc.left; xx < rc.right; xx++, q++)
            if (m[q] !== 255) T[q * 4 + 3] = Math.round(T[q * 4 + 3] * m[q] / 255);
        }
        if (stroke) drawLayer(target, stroke.src, stroke.left, stroke.top, { opacity: 1, blendMode: 'norm' });
        if (iso && !hidden) drawLayer(dst, target, 0, 0, { opacity: (group.opacity ?? 255) / 255, blendMode: pass ? 'norm' : group.blendMode,
          ...(target === dst ? {} : { region: dirtyRect(target) }) });
        clipBase = null; i = header; continue;
      }
      if (type === 1 || type === 2 || type === 3 || inheritedHidden || l.hidden) { if (!l.clipping) clipBase = null; continue; }
      const adjustment = adjustmentRenderParams(l.adjustment);
      if (adjustment) {
        const adjusted = createSurface(docW, docH);
        adjusted.data.set(adjustment.type === 'colorLookup' ? applyLutRGBA(dst.data, adjustment.lut, adjustment.opts) : applyAdjustment(dst.data, docW, docH, adjustment));
        
        
        if (l.mask && l.mask.gray && !l.mask.disabled)
          multiplyLayerMask(adjusted.data, docW, docH, 0, 0, l.mask, l.bounds.top || 0, l.bounds.left || 0);
        
        
        
        
        const clipped = l.clipping && clipBase ? clipToBase(adjusted, 0, 0, (clipBase = baseOf(clipBase)), docW, docH) : adjusted;
        drawLayer(dst, clipped, 0, 0, { opacity: (l.opacity ?? 255) / 255, blendMode: l.blendMode });
        if (!l.clipping) clipBase = null;
        continue;
      }
      const item = sourceOf(i);
      if (!item) { if (!l.clipping) clipBase = null; continue; }
      


      const fxc = opts && opts.fxCache, fresh = opts && opts.fresh && opts.fresh.has(i);
      let FX = fxc && !fresh ? fxc.get(i) : null;
      const fillLow = !item.fillApplied && (l.fillOpacity ?? 255) < 255;
      if (!FX || FX.data !== item.src.data || FX.effects !== l.effects || FX.fillLow !== fillLow || FX.w !== item.src.width || FX.h !== item.src.height) {
        FX = computeLayerFx(item, l, doc.patterns);
        if (fxc) fxc.set(i, FX);
      }
      for (const shadow of FX.shadows) drawLayer(dst, shadow.src, item.left + shadow.left, item.top + shadow.top,
        { opacity: (l.opacity ?? 255) / 255, blendMode: shadow.blendMode });
      const glow = FX.glow;
      if (glow) drawLayer(dst, glow.src, item.left + glow.left, item.top + glow.top,
        { opacity: (l.opacity ?? 255) / 255, blendMode: glow.blendMode });
      const overlayLayer = FX.overlay;
      item.src = FX.src;
      const innerShadows = FX.innerShadows, innerGlow = FX.innerGlow, innerStrokes = FX.innerStrokes, outerStrokes = FX.outerStrokes;
      const satin = FX.satin, bevel = FX.bevel;
      

      const contentOpacity = ((l.opacity ?? 255) / 255) * (item.fillApplied ? 1 : ((l.fillOpacity ?? 255) / 255));
      if (!l.clipping) {
        clipBase = { __lazy: { src: item.src, left: item.left, top: item.top } };
        
        
        
        if (l.knockout) eraseWith(dst, item.src, item.left, item.top, (l.fillOpacity ?? 255) / 255);
        else drawContent(dst, item.src, item.left, item.top, { opacity: contentOpacity, blendMode: l.blendMode }, l);
        if (overlayLayer) drawLayer(dst, overlayLayer, item.left, item.top, { opacity: (l.opacity ?? 255) / 255, blendMode: l.blendMode });
        for (const mo of FX.modeOverlays || []) drawLayer(dst, mo.src, item.left, item.top, { opacity: (l.opacity ?? 255) / 255, blendMode: mo.blendMode });
        if (satin) drawLayer(dst, satin.src, item.left, item.top, { opacity: (l.opacity ?? 255) / 255, blendMode: satin.blendMode });
        if (innerGlow) drawLayer(dst, innerGlow.src, item.left, item.top, { opacity: (l.opacity ?? 255) / 255, blendMode: innerGlow.blendMode });
        for (const innerShadow of innerShadows) drawLayer(dst, innerShadow.src, item.left, item.top, { opacity: (l.opacity ?? 255) / 255, blendMode: innerShadow.blendMode });
        
        for (const stroke of outerStrokes) drawLayer(dst, stroke.src, item.left + stroke.left, item.top + stroke.top, { opacity: (l.opacity ?? 255) / 255, blendMode: stroke.blendMode });
        for (const innerStroke of innerStrokes) drawLayer(dst, innerStroke.src, item.left, item.top, { opacity: (l.opacity ??255) / 255, blendMode: innerStroke.blendMode });
        if (bevel) {
          drawLayer(dst, bevel.shadow.src, item.left + (bevel.shadow.left || 0), item.top + (bevel.shadow.top || 0), { opacity: (l.opacity ?? 255) / 255, blendMode: bevel.shadow.blendMode });
          drawLayer(dst, bevel.highlight.src, item.left + (bevel.highlight.left || 0), item.top + (bevel.highlight.top || 0), { opacity: (l.opacity ?? 255) / 255, blendMode: bevel.highlight.blendMode });
        }
      } else if (clipBase) {
        clipBase = baseOf(clipBase);
        drawContent(dst, clipToBase(item.src, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: contentOpacity, blendMode: l.blendMode }, l);
        if (overlayLayer) drawLayer(dst, clipToBase(overlayLayer, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: (l.opacity ?? 255) / 255, blendMode: l.blendMode });
        for (const mo of FX.modeOverlays || []) drawLayer(dst, clipToBase(mo.src, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: (l.opacity ?? 255) / 255, blendMode: mo.blendMode });
        if (satin) drawLayer(dst, clipToBase(satin.src, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: (l.opacity ?? 255) / 255, blendMode: satin.blendMode });
        if (innerGlow) drawLayer(dst, clipToBase(innerGlow.src, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: (l.opacity ?? 255) / 255, blendMode: innerGlow.blendMode });
        for (const innerShadow of innerShadows) drawLayer(dst, clipToBase(innerShadow.src, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: (l.opacity ?? 255) / 255, blendMode: innerShadow.blendMode });
        if (bevel) for (const part of [bevel.shadow, bevel.highlight]) {
          const bx = item.left + (part.left || 0), by = item.top + (part.top || 0);
          drawLayer(dst, clipToBase(part.src, bx, by, clipBase, docW, docH), bx, by, { opacity: (l.opacity ?? 255) / 255, blendMode: part.blendMode });
        }
        for (const innerStroke of innerStrokes) drawLayer(dst, clipToBase(innerStroke.src, item.left, item.top, clipBase, docW, docH), item.left, item.top,
          { opacity: (l.opacity ??255) / 255, blendMode: innerStroke.blendMode });
        for (const stroke of outerStrokes) drawLayer(dst, clipToBase(stroke.src, item.left + stroke.left, item.top + stroke.top, clipBase, docW, docH), item.left + stroke.left, item.top + stroke.top,
          { opacity: (l.opacity ?? 255) / 255, blendMode: stroke.blendMode });
      }
    }
  };
  const surf = createSurface(docW, docH);
  const below = opts && opts.below;
  let start = 0;
  if (below && below.data && below.data.length === surf.data.length && below.at > 0 && below.at <= layers.length) {
    surf.data.set(below.data); markAllDirty(surf); start = below.at;
  }
  const cap = opts && opts.captureBelow;
  renderRange(surf, start, layers.length, false,
    cap != null && cap > start && cap <= layers.length ? { at: cap, opts } : null);
  return surf;
}
