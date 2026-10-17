









import { buildPalette, quantize } from './doc-mode.js';









export function quantizeRGBA(rgba, w, h, opts = {}) {
  const n = w * h, matte = opts.matte || [255, 255, 255];
  const rgb = new Uint8Array(n * 3), clear = opts.transparency ? new Uint8Array(n) : null;
  let anyClear = false;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    if (clear && a < 0.5) { clear[i] = 1; anyClear = true; rgb[i * 3] = matte[0]; rgb[i * 3 + 1] = matte[1]; rgb[i * 3 + 2] = matte[2]; continue; }
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(rgba[i * 4 + c] * a + matte[c] * (1 - a));
  }
  const want = Math.max(2, Math.min(256, opts.colors || 256)) - (anyClear ? 1 : 0);
  
  let src = rgb, cnt = n;
  if (anyClear) { const t = []; for (let i = 0; i < n; i++) if (!clear[i]) t.push(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); src = Uint8Array.from(t); cnt = t.length / 3; }
  const kind = { selective: 'selective', perceptual: 'perceptual', adaptive: 'adaptive', restrictive: 'web', web: 'web', gray: 'gray', bw: 'bw', uniform: 'uniform' }[opts.palette || 'selective'] || 'selective';
  let pal = cnt ? buildPalette(src, cnt, { colors: Math.max(1, want), palette: kind }) : [[matte[0], matte[1], matte[2]]];
  if (pal.length > want) pal = pal.slice(0, want);
  const idx = quantize(rgb, w, h, pal, { dither: opts.dither || 'none', amount: opts.amount ?? 100 });
  let transIndex = -1;
  if (anyClear) { transIndex = pal.length; pal = pal.concat([[matte[0], matte[1], matte[2]]]); for (let i = 0; i < n; i++) if (clear[i]) idx[i] = transIndex; }
  return { idx, pal, transIndex };
}


class Bytes {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); }
  u16(v) { this.a.push(v & 255, (v >> 8) & 255); }
  str(s) { for (let i = 0; i < s.length; i++) this.a.push(s.charCodeAt(i)); }
  out() { return Uint8Array.from(this.a); }
}

export function lzw(idx, minCode) {
  const out = []; let cur = 0, bits = 0;
  const clearCode = 1 << minCode, eoi = clearCode + 1;
  let codeSize = minCode + 1, next = eoi + 1;
  let dict = new Map();
  const emit = code => { cur |= code << bits; bits += codeSize; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  emit(clearCode);
  let prefix = idx.length ? idx[0] : 0;
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << codeSize) && codeSize < 12) codeSize++; }
    else { emit(clearCode); dict = new Map(); codeSize = minCode + 1; next = eoi + 1; }
    prefix = k;
  }
  if (idx.length) emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}
export function encodeGif(idx, w, h, pal, { transIndex = -1, interlace = false } = {}) {
  let bitsPer = 1; while ((1 << bitsPer) < pal.length) bitsPer++;
  const size = 1 << bitsPer, b = new Bytes();
  b.str('GIF89a'); b.u16(w); b.u16(h);
  b.u8(0x80 | ((bitsPer - 1) << 4) | (bitsPer - 1)); b.u8(0); b.u8(0);        
  for (let i = 0; i < size; i++) { const c = pal[i] || [0, 0, 0]; b.u8(c[0]); b.u8(c[1]); b.u8(c[2]); }
  if (transIndex >= 0) { b.u8(0x21); b.u8(0xf9); b.u8(4); b.u8(1); b.u16(0); b.u8(transIndex); b.u8(0); }  
  b.u8(0x2c); b.u16(0); b.u16(0); b.u16(w); b.u16(h); b.u8(interlace ? 0x40 : 0);
  let data = idx;
  if (interlace) {                                
    data = new Uint8Array(idx.length); let r = 0;
    for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) data.set(idx.subarray(y * w, y * w + w), (r++) * w);
  }
  const minCode = Math.max(2, bitsPer);
  b.u8(minCode);
  const z = lzw(data, minCode);
  for (let o = 0; o < z.length; o += 255) { const n = Math.min(255, z.length - o); b.u8(n); for (let k = 0; k < n; k++) b.a.push(z[o + k]); }
  b.u8(0); b.u8(0x3b);
  return b.out();
}


const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(parts) { let c = 0xffffffff; for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = Uint8Array.from(type, ch => ch.charCodeAt(0)), out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8); dv.setUint32(8 + data.length, crc32([t, data]));
  return out;
}

export async function encodePng8(idx, w, h, pal, { transIndex = -1, interlace = false, deflate }) {
  let depth = 8; if (pal.length <= 2) depth = 1; else if (pal.length <= 4) depth = 2; else if (pal.length <= 16) depth = 4;
  
  const packRows = (sx, sy, dx, dy) => {
    const cw = Math.ceil((w - sx) / dx), ch = Math.ceil((h - sy) / dy); if (cw <= 0 || ch <= 0) return new Uint8Array(0);
    const rb = Math.ceil(cw * depth / 8), out = new Uint8Array(ch * (rb + 1));
    for (let yy = 0; yy < ch; yy++) {
      const y = sy + yy * dy, o = yy * (rb + 1); out[o] = 0;
      for (let xx = 0; xx < cw; xx++) {
        const v = idx[y * w + sx + xx * dx], bit = xx * depth;
        out[o + 1 + (bit >> 3)] |= v << (8 - depth - (bit & 7));
      }
    }
    return out;
  };
  let raw;
  if (!interlace) raw = packRows(0, 0, 1, 1);
  else { const passes = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]].map(p => packRows(...p)); raw = new Uint8Array(passes.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of passes) { raw.set(p, o); o += p.length; } }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = depth; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = interlace ? 1 : 0;
  const plte = new Uint8Array(pal.length * 3); pal.forEach((c, i) => plte.set(c.slice(0, 3), i * 3));
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (transIndex >= 0) { const t = new Uint8Array(transIndex + 1).fill(255); t[transIndex] = 0; parts.push(chunk('tRNS', t)); }
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}


const uintvar = v => { const a = [v & 127]; v >>>= 7; while (v) { a.unshift((v & 127) | 128); v >>>= 7; } return a; };

export function encodeWbmp(bits, w, h) {
  const rb = Math.ceil(w / 8), head = [0, 0, ...uintvar(w), ...uintvar(h)];
  const out = new Uint8Array(head.length + rb * h); out.set(head, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bits[y * w + x]) out[head.length + y * rb + (x >> 3)] |= 0x80 >> (x & 7);
  return out;
}

export function rgbaToBits(rgba, w, h, { dither = 'diffusion', amount = 100, matte = [255, 255, 255] } = {}) {
  const n = w * h, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rgba[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(rgba[i * 4 + c] * a + matte[c] * (1 - a)); }
  const idx = quantize(rgb, w, h, [[0, 0, 0], [255, 255, 255]], { dither, amount });
  return idx;                                     
}
