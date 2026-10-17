












import { lzw } from './web-formats.js';
import { buildPalette, quantize } from './doc-mode.js';







export function encodeAnimatedGif(frames, w, h, o = {}) {
  const n = w * h, matte = o.matte || [255, 255, 255];
  const transOn = o.transparency !== false;
  
  const rgbs = [], clears = []; let anyClear = false;
  for (const f of frames) {
    const rgb = new Uint8Array(n * 3), clear = new Uint8Array(n), a8 = f.rgba;
    for (let i = 0; i < n; i++) {
      const a = a8[i * 4 + 3] / 255;
      if (transOn && a < 0.5) { clear[i] = 1; anyClear = true; rgb[i * 3] = matte[0]; rgb[i * 3 + 1] = matte[1]; rgb[i * 3 + 2] = matte[2]; continue; }
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(a8[i * 4 + c] * a + matte[c] * (1 - a));
    }
    rgbs.push(rgb); clears.push(clear);
  }
  const optimize = !!(o.bbox || o.redundant);
  const needTrans = anyClear || !!o.redundant;
  
  const want = Math.max(2, Math.min(256, o.colors || 256)) - (needTrans ? 1 : 0);
  const total = n * frames.length, step = Math.max(1, Math.ceil(total / 1e6));
  const samp = []; let k = 0;
  for (let f = 0; f < frames.length; f++) for (let i = 0; i < n; i++, k++) {
    if (k % step || clears[f][i]) continue;
    samp.push(rgbs[f][i * 3], rgbs[f][i * 3 + 1], rgbs[f][i * 3 + 2]);
  }
  const kind = { selective: 'selective', perceptual: 'perceptual', adaptive: 'adaptive', restrictive: 'web', web: 'web', gray: 'gray', bw: 'bw' }[o.palette || 'selective'] || 'selective';
  let pal = samp.length ? buildPalette(Uint8Array.from(samp), samp.length / 3, { colors: Math.max(1, want), palette: kind }) : [matte.slice(0, 3)];
  if (pal.length > want) pal = pal.slice(0, want);
  let transIndex = -1;
  if (needTrans) { transIndex = pal.length; pal = pal.concat([matte.slice(0, 3)]); }
  let bitsPer = 1; while ((1 << bitsPer) < pal.length) bitsPer++;
  const size = 1 << bitsPer;
  
  const out = [];
  const u8 = v => out.push(v & 255), u16 = v => out.push(v & 255, (v >> 8) & 255), str = s => { for (const ch of s) out.push(ch.charCodeAt(0)); };
  str('GIF89a'); u16(w); u16(h);
  u8(0x80 | ((bitsPer - 1) << 4) | (bitsPer - 1)); u8(0); u8(0);
  for (let i = 0; i < size; i++) { const c = pal[i] || [0, 0, 0]; u8(c[0]); u8(c[1]); u8(c[2]); }
  const loop = o.loop | 0;
  if (frames.length > 1 && loop !== 1) { u8(0x21); u8(0xff); u8(11); str('NETSCAPE2.0'); u8(3); u8(1); u16(loop <= 0 ? 0 : Math.min(65535, loop - 1)); u8(0); }
  
  let prevShown = null, prevDisp = 1;
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    const idx = quantize(rgbs[f], w, h, pal, { dither: o.dither || 'none', amount: o.amount ?? 100 });
    const clear = clears[f]; let hasClear = false;
    if (transIndex >= 0) for (let i = 0; i < n; i++) if (clear[i]) { idx[i] = transIndex; hasClear = true; }
    
    let disp = fr.disp === 'disp' ? 2 : fr.disp === 'none' ? 1 : (hasClear ? 2 : 1);
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1, data = idx;
    const canOpt = optimize && prevShown && prevDisp === 1 && !hasClear;
    if (canOpt) {
      if (o.bbox) {
        x0 = w; y0 = h; x1 = -1; y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (idx[i] !== prevShown[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }            
      }
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      data = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = (y0 + y) * w + x0 + x;
        data[y * cw + x] = (o.redundant && transIndex >= 0 && idx[i] === prevShown[i]) ? transIndex : idx[i];
      }
    }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const usesTrans = transIndex >= 0 && (hasClear || (canOpt && o.redundant));
    const delay = Math.max(0, Math.round((+fr.delay || 0) * 100));
    u8(0x21); u8(0xf9); u8(4); u8((disp << 2) | (usesTrans ? 1 : 0)); u16(delay); u8(usesTrans ? transIndex : 0); u8(0);
    u8(0x2c); u16(x0); u16(y0); u16(cw); u16(ch); u8(0);
    const minCode = Math.max(2, bitsPer);
    u8(minCode);
    const z = lzw(data, minCode);
    for (let p = 0; p < z.length; p += 255) { const m = Math.min(255, z.length - p); u8(m); for (let q = 0; q < m; q++) out.push(z[p + q]); }
    u8(0);
    
    if (disp === 2) prevShown = null;
    else prevShown = idx;
    prevDisp = disp;
  }
  u8(0x3b);
  return Uint8Array.from(out);
}


const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(parts) { let c = 0xffffffff; for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = Uint8Array.from(type, ch => ch.charCodeAt(0)), out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8); dv.setUint32(8 + data.length, crc32([t, data]));
  return out;
}
function pngChunks(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength), list = [];
  for (let o = 8; o + 12 <= png.length;) { const len = dv.getUint32(o), type = String.fromCharCode(...png.subarray(o + 4, o + 8)); list.push({ type, data: png.subarray(o + 8, o + 8 + len) }); o += 12 + len; }
  return list;
}



export function encodeApng(pngs, frames, w, h, o = {}) {
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const first = pngChunks(pngs[0]);
  let seq = 0;
  for (const c of first) {
    if (c.type === 'IDAT' || c.type === 'IEND') continue;
    parts.push(chunk(c.type, c.data));
    if (c.type === 'IHDR') {
      const ac = new Uint8Array(8), dv = new DataView(ac.buffer); dv.setUint32(0, pngs.length); dv.setUint32(4, Math.max(0, o.loop | 0));
      parts.push(chunk('acTL', ac));
    }
  }
  const fctl = k => {
    const b = new Uint8Array(26), dv = new DataView(b.buffer), f = frames[k] || {};
    dv.setUint32(0, seq++); dv.setUint32(4, w); dv.setUint32(8, h); dv.setUint32(12, 0); dv.setUint32(16, 0);
    dv.setUint16(20, Math.max(0, Math.min(65535, Math.round((+f.delay || 0) * 100)))); dv.setUint16(22, 100);
    b[24] = f.disp === 'disp' ? 1 : 0; b[25] = 0;
    return chunk('fcTL', b);
  };
  for (let k = 0; k < pngs.length; k++) {
    parts.push(fctl(k));
    for (const c of pngChunks(pngs[k])) {
      if (c.type !== 'IDAT') continue;
      if (k === 0) parts.push(chunk('IDAT', c.data));
      else { const d = new Uint8Array(4 + c.data.length); new DataView(d.buffer).setUint32(0, seq++); d.set(c.data, 4); parts.push(chunk('fdAT', d)); }
    }
  }
  parts.push(chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let p = 0; for (const x of parts) { out.set(x, p); p += x.length; }
  return out;
}
