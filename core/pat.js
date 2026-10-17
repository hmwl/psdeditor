
























import { decompressChannelBody, compressChannelBody } from './psd-image.js';

const MODE_NAME = { 0: 'bitmap', 1: 'gray', 2: 'indexed', 3: 'rgb', 4: 'cmyk', 7: 'multichannel', 8: 'duotone', 9: 'lab' };
const MODE_CHANNELS = { 0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 7: 1, 8: 1, 9: 3 };


class R {
  constructor(u8) { this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.o = 0; }
  get left() { return this.u8.length - this.o; }
  need(n) { if (this.o + n > this.u8.length) throw new Error(`数据被截断（@${this.o} 还要 ${n} 字节）`); }
  u8v() { this.need(1); return this.u8[this.o++]; }
  u16() { this.need(2); const v = this.dv.getUint16(this.o); this.o += 2; return v; }
  i16() { this.need(2); const v = this.dv.getInt16(this.o); this.o += 2; return v; }
  u32() { this.need(4); const v = this.dv.getUint32(this.o); this.o += 4; return v; }
  i32() { this.need(4); const v = this.dv.getInt32(this.o); this.o += 4; return v; }
  bytes(n) { this.need(n); const b = this.u8.subarray(this.o, this.o + n); this.o += n; return b; }
  ascii(n) { let s = ''; for (const c of this.bytes(n)) s += String.fromCharCode(c); return s; }
  uni() { const n = this.u32(); if (n > 0x100000) throw new Error('Unicode 串长度异常'); let s = ''; for (let i = 0; i < n; i++) { const c = this.u16(); if (c) s += String.fromCharCode(c); } return s; }
  pascal() { return this.ascii(this.u8v()); }
}
export class W {
  constructor() { this.parts = []; this.len = 0; }
  push(u8) { this.parts.push(u8); this.len += u8.length; return this; }
  u8(v) { return this.push(new Uint8Array([v & 255])); }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff); return this.push(b); }
  i16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v); return this.push(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return this.push(b); }
  i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); return this.push(b); }
  f32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v); return this.push(b); }
  ascii(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return this.push(b); }
  
  uni(s) { s = String(s || ''); this.u32(s.length + 1); const b = new Uint8Array((s.length + 1) * 2), d = new DataView(b.buffer); for (let i = 0; i < s.length; i++) d.setUint16(i * 2, s.charCodeAt(i)); return this.push(b); }
  pascal(s) { s = String(s || '').slice(0, 255); this.u8(s.length); return this.ascii(s); }
  pad(n) { const r = this.len % n; if (r) this.push(new Uint8Array(n - r)); return this; }
  finish() { const out = new Uint8Array(this.len); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}
const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);


export function newPatternId() {
  try { if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  const h = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-${h(4)}-${h(4)}-${h(12)}`;
}


function labToRgb(L, a, b) {
  
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f = t => t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29);
  const X = 0.9642 * f(fx), Y = f(fy), Z = 0.8249 * f(fz);
  let r = 3.1339 * X - 1.6169 * Y - 0.4906 * Z, g = -0.9785 * X + 1.9160 * Y + 0.0334 * Z, bl = 0.0720 * X - 0.2290 * Y + 1.4057 * Z;
  const gam = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
  return [gam(r), gam(g), gam(bl)];
}


function readVmal(r) {
  const ver = r.u32();
  if (ver !== 3) throw new Error('VMAL 版本不是 3：' + ver);
  const len = r.u32(), start = r.o;
  const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
  const count = r.u32();
  if (count > 64) throw new Error('VMAL 通道数异常：' + count);
  const slots = [];
  for (let i = 0; i < count + 2; i++) {
    const written = r.u32();
    if (!written) { slots.push(null); continue; }
    const clen = r.u32();
    if (clen < 23) throw new Error('VMAL 通道槽长度异常');
    const pixelDepth = r.u32();
    const ct = r.i32(), cl = r.i32(), cb = r.i32(), cr = r.i32();
    const depth = r.u16();
    const comp = r.u8v();
    const data = r.bytes(clen - 23);
    slots.push({ pixelDepth, rect: { top: ct, left: cl, bottom: cb, right: cr }, depth: depth || pixelDepth || 8, comp, data });
  }
  
  if (len && start + len <= r.u8.length && start + len >= r.o) r.o = start + len;
  return { rect: { top, left, bottom, right }, count, slots };
}

function decodeSlot(s) {
  const w = s.rect.right - s.rect.left, h = s.rect.bottom - s.rect.top;
  if (w <= 0 || h <= 0) return null;
  const depth = s.depth === 1 ? 1 : s.depth === 16 ? 16 : s.depth === 32 ? 32 : 8;
  const raw = decompressChannelBody({ body: s.data, width: w, rows: h, depth, compression: s.comp, psb: false });
  
  const out = new Uint8Array(w * h);
  if (depth === 8) out.set(raw.subarray(0, w * h));
  else if (depth === 16) for (let i = 0; i < w * h; i++) out[i] = raw[i * 2];
  else if (depth === 32) { const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength); for (let i = 0; i < w * h; i++) out[i] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, dv.getFloat32(i * 4)), 1 / 2.2) * 255))); }
  else if (depth === 1) { const rb = Math.ceil(w / 8); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (raw[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255; }
  return { w, h, px: out, left: s.rect.left, top: s.rect.top };
}





export function readPatternRecord(bytes) {
  const r = new R(toU8(bytes));
  return readPatternFrom(r);
}
function readPatternFrom(r) {
  const version = r.u32();
  if (version !== 1) throw new Error('图案记录版本不是 1：' + version);
  const modeNum = r.u32();
  const point = [r.i16(), r.i16()];
  const name = r.uni();
  const id = r.pascal();
  let palette = null;
  if (modeNum === 2) { palette = []; for (let i = 0; i < 256; i++) palette.push([r.u8v(), r.u8v(), r.u8v()]); r.bytes(4); }
  const v = readVmal(r);
  const W0 = v.rect.right - v.rect.left, H0 = v.rect.bottom - v.rect.top;
  if (W0 <= 0 || H0 <= 0 || W0 * H0 > 100e6) throw new Error(`图案「${name}」尺寸异常：${W0}×${H0}`);
  const rgba = new Uint8ClampedArray(W0 * H0 * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const nColor = MODE_CHANNELS[modeNum] || 1;
  const planes = [];
  for (let c = 0; c < nColor; c++) planes.push(v.slots[c] ? decodeSlot(v.slots[c]) : null);
  const alphaSlot = v.slots[v.count + 1];
  const alpha = alphaSlot ? decodeSlot(alphaSlot) : null;
  const at = (p, x, y, def) => {
    if (!p) return def;
    const px = x + v.rect.left - p.left, py = y + v.rect.top - p.top;
    return (px < 0 || py < 0 || px >= p.w || py >= p.h) ? def : p.px[py * p.w + px];
  };
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
    const o = (y * W0 + x) * 4;
    let rr, gg, bb;
    if (modeNum === 3) { rr = at(planes[0], x, y, 0); gg = at(planes[1], x, y, 0); bb = at(planes[2], x, y, 0); }
    else if (modeNum === 2) { const p = palette[at(planes[0], x, y, 0)] || [0, 0, 0]; rr = p[0]; gg = p[1]; bb = p[2]; }
    else if (modeNum === 4) {
      const c = at(planes[0], x, y, 255), m = at(planes[1], x, y, 255), yy = at(planes[2], x, y, 255), k = at(planes[3], x, y, 255);
      rr = c * k / 255; gg = m * k / 255; bb = yy * k / 255;
    } else if (modeNum === 9) {
      [rr, gg, bb] = labToRgb(at(planes[0], x, y, 0) * 100 / 255, at(planes[1], x, y, 128) - 128, at(planes[2], x, y, 128) - 128);
    } else { rr = gg = bb = at(planes[0], x, y, 0); }
    rgba[o] = rr; rgba[o + 1] = gg; rgba[o + 2] = bb;
    if (alpha) rgba[o + 3] = at(alpha, x, y, 0);
  }
  return { id, name, width: W0, height: H0, rgba, mode: MODE_NAME[modeNum] || String(modeNum), point };
}


function encodePlane(px, w, h) {
  return compressChannelBody({ raw: px, width: w, rows: h, depth: 8, compression: 1, psb: false });
}




export function encodePatternRecord(p) {
  const w = p.width | 0, h = p.height | 0;
  if (w <= 0 || h <= 0) throw new Error('图案尺寸必须为正');
  const rgba = p.rgba;
  if (!rgba || rgba.length < w * h * 4) throw new Error('图案像素长度不对');
  const gray = p.mode === 'gray';
  const n = w * h;
  const planes = gray ? [new Uint8Array(n)] : [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  const a = new Uint8Array(n);
  let opaque = true;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (gray) planes[0][i] = Math.round(rgba[o] * 0.299 + rgba[o + 1] * 0.587 + rgba[o + 2] * 0.114);
    else { planes[0][i] = rgba[o]; planes[1][i] = rgba[o + 1]; planes[2][i] = rgba[o + 2]; }
    a[i] = rgba[o + 3]; if (a[i] !== 255) opaque = false;
  }
  const COUNT = 24;                             
  const vm = new W();
  vm.i32(0); vm.i32(0); vm.i32(h); vm.i32(w);
  vm.u32(COUNT);
  const slot = px => {
    const data = encodePlane(px, w, h);
    vm.u32(1); vm.u32(23 + data.length); vm.u32(8);
    vm.i32(0); vm.i32(0); vm.i32(h); vm.i32(w);
    vm.u16(8); vm.u8(1); vm.push(data);
  };
  for (let i = 0; i < COUNT + 2; i++) {
    if (i < planes.length) slot(planes[i]);
    else if (i === COUNT + 1 && !opaque) slot(a);
    else vm.u32(0);
  }
  const vmBody = vm.finish();
  const out = new W();
  out.u32(1); out.u32(gray ? 1 : 3);
  out.i16(h); out.i16(w);
  out.uni(p.name || '');
  out.pascal(p.id || newPatternId());
  out.u32(3); out.u32(vmBody.length); out.push(vmBody);
  return out.finish();
}



export function readPat(bytes) {
  const r = new R(toU8(bytes));
  if (r.ascii(4) !== '8BPT') throw new Error('不是 Photoshop 图案文件（缺 8BPT 签名）');
  const ver = r.u16();
  if (ver !== 1) throw new Error('不支持的 .pat 版本：' + ver);
  const count = r.u32();
  const patterns = [], warnings = [];
  for (let i = 0; i < count; i++) {
    if (r.left < 12) { warnings.push(`声明 ${count} 个图案，只读到 ${i} 个`); break; }
    try { patterns.push(readPatternFrom(r)); }
    catch (e) { warnings.push(`第 ${i + 1} 个图案：${e.message}`); break; }   
  }
  return Object.assign(patterns, { warnings });
}

export function writePat(patterns) {
  const w = new W();
  w.ascii('8BPT'); w.u16(1); w.u32(patterns.length);
  for (const p of patterns) w.push(encodePatternRecord(p));
  return w.finish();
}



export function writePatternBlock(patterns) {
  const w = new W();
  for (const p of patterns) {
    const rec = encodePatternRecord(p);
    w.u32(rec.length); w.push(rec); w.pad(4);
  }
  return w.finish();
}

export function readPatternBlock(bytes) {
  const u8 = toU8(bytes);
  const r = new R(u8);
  const out = [], warnings = [];
  while (r.left >= 4) {
    const len = r.u32();
    if (!len || len > r.left) break;
    const body = r.bytes(len);
    try { out.push(readPatternRecord(body)); } catch (e) { warnings.push(e.message); }
    r.o += (4 - (len % 4)) % 4;
  }
  return Object.assign(out, { warnings });
}



export function cropPattern(rgba, W0, H0, rect) {
  const w = Math.max(1, rect.w | 0), h = Math.max(1, rect.h | 0), out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y + (rect.y | 0); if (sy < 0 || sy >= H0) continue;
    for (let x = 0; x < w; x++) {
      const sx = x + (rect.x | 0); if (sx < 0 || sx >= W0) continue;
      const s = (sy * W0 + sx) * 4, d = (y * w + x) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  }
  return { width: w, height: h, rgba: out };
}

export default { readPat, writePat, readPatternRecord, encodePatternRecord, writePatternBlock, readPatternBlock, cropPattern, newPatternId };
