















import { packBits, unpackBits } from './psd-image.js';
import { renderLiquify } from './liquify.js';

const MAGIC = [0x46, 0x50, 0x4c, 0x51];   
const Q = 16;                              


export function encodeLiquifyMesh(F) {
  const n = F.fw * F.fh * 2;
  const lo = new Uint8Array(n), hi = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(F.d[i] * Q))) & 0xffff;
    lo[i] = v & 255; hi[i] = v >> 8;
  }
  const pl = packBits(lo), ph = packBits(hi);
  const hasFreeze = !!(F.freeze && F.freeze.some(v => v > 0));
  let fz = null;
  if (hasFreeze) { const f8 = new Uint8Array(F.fw * F.fh); for (let i = 0; i < f8.length; i++) f8[i] = Math.round(Math.max(0, Math.min(1, F.freeze[i])) * 255); fz = packBits(f8); }
  const size = 44 + pl.length + ph.length + (fz ? 4 + fz.length : 0);
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  out.set(MAGIC, 0); out[4] = 1; out[5] = hasFreeze ? 1 : 0;
  dv.setUint32(8, F.w); dv.setUint32(12, F.h); dv.setUint32(16, F.g); dv.setUint32(20, F.fw); dv.setUint32(24, F.fh);
  dv.setInt32(28, Math.round(F.left || 0)); dv.setInt32(32, Math.round(F.top || 0));
  dv.setUint32(36, pl.length); dv.setUint32(40, ph.length);
  let o = 44; out.set(pl, o); o += pl.length; out.set(ph, o); o += ph.length;
  if (fz) { dv.setUint32(o, fz.length); o += 4; out.set(fz, o); }
  return out;
}


export function decodeLiquifyMesh(u8) {
  const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  if (b.length < 44 || MAGIC.some((m, i) => b[i] !== m)) throw new Error('液化网格数据损坏（不是 PSD Editor 写的液化智能滤镜）');
  if (b[4] !== 1) throw new Error('液化网格数据的版本不认识：' + b[4]);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(8), h = dv.getUint32(12), g = dv.getUint32(16), fw = dv.getUint32(20), fh = dv.getUint32(24);
  if (!w || !h || !g || fw * fh > 64e6) throw new Error('液化网格数据的尺寸不合理');
  const left = dv.getInt32(28), top = dv.getInt32(32);
  const pl = dv.getUint32(36), ph = dv.getUint32(40);
  const n = fw * fh * 2, lo = new Uint8Array(n), hi = new Uint8Array(n);
  let o = 44;
  unpackBits(b.subarray(o, o + pl), lo, 0, n); o += pl;
  unpackBits(b.subarray(o, o + ph), hi, 0, n); o += ph;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = lo[i] | (hi[i] << 8); if (v & 0x8000) v -= 0x10000; d[i] = v / Q; }
  const freeze = new Float32Array(fw * fh);
  if ((b[5] & 1) && o + 4 <= b.length) {
    const fl = dv.getUint32(o); o += 4;
    const f8 = new Uint8Array(fw * fh); unpackBits(b.subarray(o, o + fl), f8, 0, f8.length);
    for (let i = 0; i < f8.length; i++) freeze[i] = f8[i] / 255;
  }
  return { w, h, g, fw, fh, d, freeze, left, top };
}


export function alignLiquifyMesh(F, w, h, rect) {
  const dx = (rect ? rect.left : 0) - (F.left || 0), dy = (rect ? rect.top : 0) - (F.top || 0);
  if (!dx && !dy && F.w === w && F.h === h) return F;
  const g = F.g, fw = Math.ceil(w / g) + 1, fh = Math.ceil(h / g) + 1;
  const d = new Float32Array(fw * fh * 2), freeze = new Float32Array(fw * fh);
  for (let gy = 0; gy < fh; gy++) for (let gx = 0; gx < fw; gx++) {
    const sx = gx * g + dx, sy = gy * g + dy;          
    if (sx < 0 || sy < 0 || sx > F.w || sy > F.h) continue;
    const ox = Math.min(F.fw - 1.0001, sx / F.g), oy = Math.min(F.fh - 1.0001, sy / F.g);
    const x0 = ox | 0, y0 = oy | 0, tx = ox - x0, ty = oy - y0;
    const a = y0 * F.fw + x0, b2 = a + 1, c = a + F.fw, e = c + 1;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    const k = gy * fw + gx;
    d[k * 2] = F.d[a * 2] * w00 + F.d[b2 * 2] * w10 + F.d[c * 2] * w01 + F.d[e * 2] * w11;
    d[k * 2 + 1] = F.d[a * 2 + 1] * w00 + F.d[b2 * 2 + 1] * w10 + F.d[c * 2 + 1] * w01 + F.d[e * 2 + 1] * w11;
    freeze[k] = F.freeze[a] * w00 + F.freeze[b2] * w10 + F.freeze[c] * w01 + F.freeze[e] * w11;
  }
  return { w, h, g, fw, fh, d, freeze, left: rect ? rect.left : 0, top: rect ? rect.top : 0 };
}


export function renderLiquifyMesh(rgba, w, h, mesh, rect = null) {
  const F = alignLiquifyMesh(decodeLiquifyMesh(mesh), w, h, rect);
  const src = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  return renderLiquify(src, F, new Uint8ClampedArray(src.length), null);
}

export default { encodeLiquifyMesh, decodeLiquifyMesh, alignLiquifyMesh, renderLiquifyMesh };
