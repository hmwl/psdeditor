























import { parseAdditionalBlock } from './psd-additional.js';
import { frameInfoOf } from './psd-frame.js';

import { getModeCodec, floatToDisplayByte } from './color-convert.js';
import { parseLayerMask } from './psd-layer.js';
import { featherDensityPlane } from './mask-feather.js';
import { undoPrediction } from './psd-image.js';
import { hasHighDepthBlockLayers, normalizeHighDepthLayers } from './psd-highdepth.js';
import { createZipLayerSession, zipDecodeStream } from './psd-zip-cache.js';
import { createLodTileSession, lodScale } from './psd-lod.js';

const BIG_LEN_KEYS = new Set(['LMsk','Lr16','Lr32','Layr','Mt16','Mt32','Mtrn','Alph','FMsk','lnk2','lnkD','lnk3','lnkE','FEid','FXid','PxSD','cinf']);


class R {
  constructor(buf, psb = false) {
    this.dv = new DataView(buf.buffer !== undefined ? buf.buffer : buf, buf.byteOffset || 0, buf.byteLength);
    this.o = 0; this.psb = psb;
  }
  get remaining() { return this.dv.byteLength - this.o; }
  ensure(n, what = 'PSD 数据') {
    if (!Number.isSafeInteger(n) || n < 0 || n > this.remaining)
      throw new RangeError(`${what}越界：请求 ${n} 字节，剩余 ${this.remaining} 字节`);
  }
  u8() { return this.dv.getUint8(this.o++); }
  i8() { const v = this.dv.getInt8(this.o); this.o++; return v; }
  u16() { const v = this.dv.getUint16(this.o); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o); this.o += 4; return v; }
  i32() { const v = this.dv.getInt32(this.o); this.o += 4; return v; }
  u64() { const hi = this.u32(), lo = this.u32(); return hi * 0x100000000 + lo; }
  lenPSB() { return this.psb ? this.u64() : this.u32(); }
  skip(n) { this.ensure(n); this.o += n; }
  seek(p) {
    if (!Number.isSafeInteger(p) || p < 0 || p > this.dv.byteLength)
      throw new RangeError(`PSD 定位越界：${p}（文件长 ${this.dv.byteLength}）`);
    this.o = p;
  }
  ascii(n) { if (!(n >= 0) || n > this.remaining) throw new RangeError(`字符串长度 ${n} 越界`); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8()); return s; }
  key4() { return this.ascii(4); }
  bytes(n) { this.ensure(n); const u = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.o, n); this.o += n; return u; }
  unicode() { const n = this.u32(); if (n * 2 > this.remaining) throw new RangeError(`Unicode 字符串长度 ${n} 越界`); let s = ''; for (let i = 0; i < n; i++) { const c = this.u16(); if (c) s += String.fromCharCode(c); } return s; }   
}


function decodePackBits(src, dstLen) {
  const out = new Uint8Array(dstLen);
  let i = 0, o = 0;
  while (o < dstLen && i < src.length) {
    let n = src[i++];
    if (n >= 128) n -= 256;
    if (n >= 0) { const c = n + 1; for (let k = 0; k < c && o < dstLen; k++) out[o++] = src[i++]; }
    else if (n !== -128) { const c = 1 - n; const v = src[i++]; for (let k = 0; k < c && o < dstLen; k++) out[o++] = v; }
  }
  return out;
}

function lazyChannel(bytes, width, height, depth, psb, isColor = false) {
  if (!(width > 0 && height > 0)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 2) return null;
  const comp = dv.getUint16(0); const bps = depth === 8 ? 1 : depth === 16 ? 2 : 4;
  const rowBytes = width * bps;
  const out = { bytes, width, height, depth, bps, rowBytes, comp, psb, isColor, rows: new Map() };
  if (comp === 0) { out.dataOffset = 2; return out; }
  if (comp !== 1) return null; 
  const countBytes = height * (psb ? 4 : 2), countStart = 2;
  if (bytes.byteLength < countStart + countBytes) return null;
  const counts = new Uint32Array(height); let o = countStart;
  for (let y = 0; y < height; y++, o += psb ? 4 : 2) counts[y] = psb ? dv.getUint32(o) : dv.getUint16(o);
  const offsets = new Float64Array(height); let data = countStart + countBytes;
  for (let y = 0; y < height; y++) { offsets[y] = data; data += counts[y]; if (data > bytes.byteLength) return null; }
  out.counts = counts; out.offsets = offsets; return out;
}
function lazyRow(ch, y) {
  if (!ch || y < 0 || y >= ch.height) return null;
  let row = ch.rows.get(y); if (row) return row;
  const dv = new DataView(ch.bytes.buffer, ch.bytes.byteOffset, ch.bytes.byteLength);
  if (ch.comp === 0) row = new Uint8Array(ch.bytes.buffer, ch.bytes.byteOffset + ch.dataOffset + y * ch.rowBytes, ch.rowBytes);
  else row = decodePackBits(new Uint8Array(ch.bytes.buffer, ch.bytes.byteOffset + ch.offsets[y], ch.counts[y]), ch.rowBytes);
  
  ch.rows.set(y, row); if (ch.rows.size > (ch.maxRows ?? 256)) ch.rows.delete(ch.rows.keys().next().value);
  return row;
}
function lazySample(ch, x, y) {
  const row = lazyRow(ch, y); if (!row || x < 0 || x >= ch.width) return 0;
  const o = x * ch.bps;
  if (ch.depth === 8) return row[o];
  if (ch.depth === 16) return (row[o] * 256 + row[o + 1]) * 255 / 65535;
  const f = new DataView(row.buffer, row.byteOffset + o, 4).getFloat32(0); return Math.max(0, Math.min(255, f * 255));
}
const MASK_TILE = 256;
function readLazyMaskBase(layer, mx, my) {
  const m = layer.mask, c = layer.lazyChannels && layer.lazyChannels[m.lazyChannel];
  if (!c) return null;
  const def = m.defaultColor != null ? m.defaultColor : 255;
  return (mx >= 0 && my >= 0 && mx < m.width && my < m.height) ? lazySample(c, mx, my) : def;
}

export function readLazyMaskEdit(layer, mx, my) {
  const e = layer && layer.lazyMaskEdits; if (!e) return null;
  const tx = Math.floor(mx / MASK_TILE) * MASK_TILE, ty = Math.floor(my / MASK_TILE) * MASK_TILE;
  const t = e.tiles.get(`${tx}:${ty}`); if (!t) return null;
  return t[(my - ty) * MASK_TILE + (mx - tx)];
}
const maskProp = (layer, key, fallback) => {
  const ov = layer && layer.lazyMaskOverride;
  return ov && ov[key] !== undefined ? ov[key] : fallback;
};
function readLazyMaskRaw(layer, mx, my) {
  let v = readLazyMaskEdit(layer, mx, my);
  if (v == null && layer.lazyMaskEdits && layer.lazyMaskEdits.uniform != null) v = layer.lazyMaskEdits.uniform;
  if (v == null) v = readLazyMaskBase(layer, mx, my);
  return v;
}

function featheredMaskTile(layer, tx, ty) {
  const m = layer.mask, f = m && maskProp(layer, 'feather', m.feather);
  if (!(f > 0.2)) return null;
  const e = layer.lazyMaskEdits;
  const sig = `${f}|${maskProp(layer, 'density', m.density) ?? 255}|${m.width}x${m.height}|${e?.version || 0}`;
  const cache = layer.lazyMaskFeatherCache || (layer.lazyMaskFeatherCache = { sig, tiles: new Map() });
  if (cache.sig !== sig) { cache.tiles.clear(); cache.sig = sig; }
  const key = `${tx}:${ty}`, hit = cache.tiles.get(key); if (hit) return hit;
  const pad = Math.ceil(f * 3) + 2;
  const sx0 = Math.max(0, tx - pad), sy0 = Math.max(0, ty - pad);
  const sx1 = Math.min(m.width, tx + MASK_TILE + pad), sy1 = Math.min(m.height, ty + MASK_TILE + pad);
  const sw = sx1 - sx0, sh = sy1 - sy0;
  if (!(sw > 0 && sh > 0)) return null;
  const def = m.defaultColor != null ? m.defaultColor : 255;
  const src = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++)
    src[y * sw + x] = readLazyMaskRaw(layer, sx0 + x, sy0 + y) ?? def;
  const res = featherDensityPlane({ gray: src, width: sw, height: sh, top: sy0, left: sx0, defaultColor: def, relative: false },
    { top: ty, left: tx, width: MASK_TILE, height: MASK_TILE }, f, 255);
  cache.tiles.set(key, res.gray);
  if (cache.tiles.size > 64) cache.tiles.delete(cache.tiles.keys().next().value);
  return res.gray;
}

export function readLazyMaskValue(layer, mx, my, applyProps = true) {
  const m = layer && layer.mask;
  if (!m || maskProp(layer, 'disabled', m.disabled) || (m.lazyChannel == null && !m.gray)) return null;
  let v = null;
  if (applyProps && maskProp(layer, 'feather', m.feather) > 0.2 && mx >= 0 && my >= 0 && mx < m.width && my < m.height) {
    const tx = Math.floor(mx / MASK_TILE) * MASK_TILE, ty = Math.floor(my / MASK_TILE) * MASK_TILE;
    const tile = featheredMaskTile(layer, tx, ty);
    if (tile) v = tile[(my - ty) * MASK_TILE + (mx - tx)];
  }
  if (v == null) v = readLazyMaskRaw(layer, mx, my);
  if (v == null) {
    const def = m.defaultColor != null ? m.defaultColor : 255;
    v = (mx >= 0 && my >= 0 && mx < m.width && my < m.height) ? (m.gray && m.gray[my * m.width + mx] != null ? m.gray[my * m.width + mx] : def) : def;
  }
  if (v == null) return null;
  if (!applyProps) return v;
  const den = maskProp(layer, 'density', m.density) != null ? maskProp(layer, 'density', m.density) : 255;
  if (den < 255) v = 255 - Math.round((255 - v) * den / 255);
  if (maskProp(layer, 'invert', m.invert)) v = 255 - v;
  return v;
}

export function readLazyMaskPixel(layer, x, y, applyProps = true) {
  const m = layer && layer.mask;
  if (!m || maskProp(layer, 'disabled', m.disabled) || (m.lazyChannel == null && !m.gray)) return null;
  const left = layer.bounds?.left || 0, top = layer.bounds?.top || 0, rel = maskProp(layer, 'relative', m.relative);
  return readLazyMaskValue(layer, (rel ? x : left + x) - (m.left || 0), (rel ? y : top + y) - (m.top || 0), applyProps);
}


export function writeLazyMaskRect(layer, x, y, w, h, data) {
  const m = layer && layer.mask;
  if (!m || m.lazyChannel == null || !(w > 0 && h > 0)) return false;
  const e = layer.lazyMaskEdits || (layer.lazyMaskEdits = { tiles: new Map(), version: 0 });
  for (let ty = Math.floor(y / MASK_TILE) * MASK_TILE; ty < y + h; ty += MASK_TILE)
    for (let tx = Math.floor(x / MASK_TILE) * MASK_TILE; tx < x + w; tx += MASK_TILE) {
      const key = `${tx}:${ty}`;
      let t = e.tiles.get(key);
      if (!t) {
        t = new Uint8Array(MASK_TILE * MASK_TILE);
        for (let yy = 0; yy < MASK_TILE; yy++) for (let xx = 0; xx < MASK_TILE; xx++)
          t[yy * MASK_TILE + xx] = readLazyMaskRaw(layer, tx + xx, ty + yy) ?? (m.defaultColor != null ? m.defaultColor : 255);
        e.tiles.set(key, t);
      }
      const x0 = Math.max(x, tx), x1 = Math.min(x + w, tx + MASK_TILE);
      const y0 = Math.max(y, ty), y1 = Math.min(y + h, ty + MASK_TILE);
      for (let yy = y0; yy < y1; yy++)
        t.set(data.subarray((yy - y) * w + x0 - x, (yy - y) * w + x1 - x), (yy - ty) * MASK_TILE + x0 - tx);
    }
  e.version++;
  return true;
}

export function applyLazyMaskToRGBA(layer, data, x0, y0, w, h) {
  const m = layer?.mask;
  if (!m || maskProp(layer, 'disabled', m.disabled) || (m.lazyChannel == null && !m.gray)) return data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = readLazyMaskPixel(layer, x0 + x, y0 + y);
    if (v == null) continue;
    const o = (y * w + x) * 4 + 3;
    data[o] = Math.round(data[o] * v / 255);
  }
  return data;
}

export function readLazyLayerPixel(layer, x, y, mode = 3) {
  const c = layer && layer.lazyChannels; if (!c || x < 0 || y < 0 || x >= layer.width || y >= layer.height) return null;
  let a = c[-1] ? lazySample(c[-1], x, y) : 255;
  const mv = readLazyMaskPixel(layer, x, y);
  if (mv != null) a = Math.round(a * mv / 255);
  if (mode === 3) return [lazySample(c[0], x, y), lazySample(c[1], x, y), lazySample(c[2], x, y), a];
  const g = lazySample(c[0], x, y); return [g, g, g, a];
}



export function readLazyLayerRectChannels(layer, x, y, width, height){
  if (!layer?.lazyChannels || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > layer.width || y + height > layer.height) return null;


  return Object.entries(layer.lazyChannels).filter(([id]) => +id !== -2 && +id !== -3).map(([id, c]) => {
    const start = x * c.bps, count = width * c.bps, end = start + count;
    const out = new Uint8Array(2 + count * height); 
    for (let dy = 0; dy < height; dy++) {
      const at = 2 + dy * count;
      if (c.comp === 0) {
        const offset = c.dataOffset + (y + dy) * c.rowBytes + start;
        out.set(c.bytes.subarray(offset, offset + count), at);
      } else {
        const packed = c.bytes.subarray(c.offsets[y + dy], c.offsets[y + dy] + c.counts[y + dy]);
        let i = 0, pos = 0;
        while (i < packed.length && pos < end) {
          let n = packed[i++]; if (n > 127) n -= 256;
          if (n === -128) continue;
          const length = n >= 0 ? n + 1 : 1 - n;
          const left = Math.max(start, pos), right = Math.min(end, pos + length);
          if (n >= 0) {
            if (right > left) out.set(packed.subarray(i + left - pos, i + right - pos), at + left - start);
            i += length;
          } else {
            const value = packed[i++]; if (right > left) out.fill(value, at + left - start, at + right - start);
          }
          pos += length;
        }
      }
    }
    return { id: +id, w: width, h: height, view: out };
  });
}

export function readLazyLayerTile(layer, tileX, tileY, mode = 3, tileSize = 256) {
  if (!layer?.lazyChannels) return null;
  const tx = Math.max(0, tileX | 0), ty = Math.max(0, tileY | 0), key = `${mode}:${tileSize}:${tx}:${ty}`;
  const cache = layer.lazyTileCache || (layer.lazyTileCache = new Map());
  const hit = cache.get(key); if (hit) return hit;
  const x = tx * tileSize, y = ty * tileSize, w = Math.min(tileSize, layer.width - x), h = Math.min(tileSize, layer.height - y);
  if (w <= 0 || h <= 0) return null;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const p = readLazyLayerPixel(layer, x + xx, y + yy, mode), o = (yy * w + xx) * 4;
    if (p) { data[o] = p[0]; data[o + 1] = p[1]; data[o + 2] = p[2]; data[o + 3] = p[3]; }
  }
  const tile = { x, y, width: w, height: h, data }; cache.set(key, tile);
  if (cache.size > 96) cache.delete(cache.keys().next().value);
  return tile;
}


export function buildLazyLayerPreview(layer, maxDim = 2048, mode = 3) {
  if (!layer?.lazyChannels || !(layer.width > 0 && layer.height > 0)) return null;
  const scale = Math.min(1, maxDim / Math.max(layer.width, layer.height));
  const width = Math.max(1, Math.round(layer.width * scale)), height = Math.max(1, Math.round(layer.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(layer.width - 1, Math.floor(x / scale)), sy = Math.min(layer.height - 1, Math.floor(y / scale));
    const p = readLazyLayerPixel(layer, sx, sy, mode), o = (y * width + x) * 4;
    if (p) { data[o] = p[0]; data[o + 1] = p[1]; data[o + 2] = p[2]; data[o + 3] = p[3]; }
  }
  return { data, width, height };
}
async function inflate(bytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Response(zipDecodeStream(bytes));
    return new Uint8Array(await stream.arrayBuffer());
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.inflateSync(Buffer.from(bytes)));
}
async function decodeZipTilePlane(bytes, width, height, x0, y0, tw, th, prediction = false) {
  if (typeof DecompressionStream === 'undefined') return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const comp = bytes.byteLength >= 2 ? dv.getUint16(0) : -1;
  if (comp !== 2 && comp !== 3) return null;
  const rowBytes = width, body = bytes.subarray(2), out = new Uint8Array(tw * th);
  const reader = zipDecodeStream(body).getReader();
  let pending = new Uint8Array(0), row = 0;
  try {
    while (row < y0 + th) {
      const part = await reader.read(); if (part.done) break;
      const joined = new Uint8Array(pending.length + part.value.length); joined.set(pending); joined.set(part.value, pending.length); pending = joined;
      while (pending.length >= rowBytes && row < y0 + th) {
        if (row >= y0) {
          if (prediction) {
            let prev = 0, base = (row - y0) * tw;
            for (let x = 0; x < rowBytes; x++) { prev = (prev + pending[x]) & 255; if (x >= x0 && x < x0 + tw) out[base + x - x0] = prev; }
          } else out.set(pending.subarray(x0, x0 + tw), (row - y0) * tw);
        }
        pending = pending.subarray(rowBytes); row++;
      }
    }
  } finally { try { await reader.cancel(); } catch {} }
  return out;
}



async function decodeZipPreviewPlane(bytes, width, height, previewWidth, previewHeight, prediction = false) {
  if (typeof DecompressionStream === 'undefined') return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const comp = bytes.byteLength >= 2 ? dv.getUint16(0) : -1;
  if (comp !== 2 && comp !== 3) return null;
  const rowBytes = width, body = bytes.subarray(2), out = new Uint8Array(previewWidth * previewHeight);
  const sx = Math.max(1, width / previewWidth), sy = Math.max(1, height / previewHeight);
  const wanted = new Map();
  for (let py = 0; py < previewHeight; py++) wanted.set(Math.min(height - 1, Math.floor(py * sy)), py);
  const lastRow = Math.min(height - 1, Math.floor((previewHeight - 1) * sy));
  const reader = zipDecodeStream(body).getReader();
  let pending = new Uint8Array(0), row = 0;
  try {
    while (row <= lastRow) {
      const part = await reader.read(); if (part.done) break;
      const joined = new Uint8Array(pending.length + part.value.length); joined.set(pending); joined.set(part.value, pending.length); pending = joined;
      while (pending.length >= rowBytes && row <= lastRow) {
        const py = wanted.get(row);
        if (py != null) {
          const base = py * previewWidth;
          if (prediction) {
            let prev = 0, px = 0, target = Math.min(width - 1, Math.floor(px * sx));
            for (let x = 0; x < rowBytes && px < previewWidth; x++) {
              prev = (prev + pending[x]) & 255;
              while (x >= target && px < previewWidth) {
                out[base + px] = prev; px++;
                target = px < previewWidth ? Math.min(width - 1, Math.floor(px * sx)) : width;
              }
            }
          } else for (let px = 0; px < previewWidth; px++) out[base + px] = pending[Math.min(width - 1, Math.floor(px * sx))];
        }
        pending = pending.subarray(rowBytes); row++;
      }
    }
  } finally { try { await reader.cancel(); } catch {} }
  return out;
}
async function decodeZipPreviewJob(job) {
  if (job.depth !== 8 || !(job.previewMax > 0) || !(job.width > 0 && job.height > 0)) return null;
  if (job.chans.some(ch => ch.id === -2 || ch.id === -3)) return null;
  const scale = job.previewMax / Math.max(job.width, job.height);
  if (!(scale < 1)) return null;
  const width = Math.max(1, Math.round(job.width * scale)), height = Math.max(1, Math.round(job.height * scale));
  const planes = {};
  for (const ch of job.chans) {
    const dv = new DataView(ch.bytes.buffer, ch.bytes.byteOffset, ch.bytes.byteLength);
    const comp = ch.bytes.length >= 2 ? dv.getUint16(0) : -1;
    if (comp !== 2 && comp !== 3) return null;
    const p = await decodeZipPreviewPlane(ch.bytes, job.width, job.height, width, height, comp === 3);
    if (!p) return null; planes[ch.id] = p;
  }
  const rgba = planesToRGBA(planes, width, height, job.mode, 255, null);
  return { rgba: null, preview: { data: rgba, width, height }, warns: [], planes: null };
}
async function decodeLayerTileJob(job) {
  if (job.depth !== 8 || !job.zipTile) return null;
  const t = job.tile, x0 = Math.max(0, t.x | 0), y0 = Math.max(0, t.y | 0), tw = Math.min(t.width | 0, job.width - x0), th = Math.min(t.height | 0, job.height - y0);
  if (tw <= 0 || th <= 0) return null;
  const planes = {};
  for (const ch of job.chans) {
    const dv = new DataView(ch.bytes.buffer, ch.bytes.byteOffset, ch.bytes.byteLength);
    const comp = ch.bytes.length >= 2 ? dv.getUint16(0) : -1;
    if (comp !== 2 && comp !== 3) return null; 
    const p = await decodeZipTilePlane(ch.bytes, job.width, job.height, x0, y0, tw, th, comp === 3);
    if (!p) return null; planes[ch.id] = p;
  }
  const rgba = planesToRGBA(planes, tw, th, job.mode, 255, null);
  return { rgba: null, tile: { x: x0, y: y0, width: tw, height: th, data: rgba }, warns: [], planes: null };
}



export function createLayerTileSession(chans, options = {}) {
  const zip = createZipLayerSession(chans, options), stats = options.stats || {};
  let indexed = null, signature = '', closed = false;
  const clear = () => { if (indexed) for (const ch of indexed.values()) ch.rows.clear(); };
  const native = {
    get rowBytes(){ let bytes = zip.rowBytes; if (indexed) for (const ch of indexed.values()) bytes += ch.rows.size * ch.rowBytes; return bytes; },
    clearRows(){ clear(); zip.clearRows(); },
    close(){ closed = true; clear(); indexed = null; zip.close(); },
    async tile(job){
      if (closed) throw new Error('图层解码会话已关闭');
      const raw = job.zipTile && [8, 16].includes(job.depth) && job.tile && chans.length && chans.every(ch => ch.id >= -1 && ch.w === job.width && ch.h === job.height
        && ch.bytes?.length >= 2 && new DataView(ch.bytes.buffer, ch.bytes.byteOffset, ch.bytes.byteLength).getUint16(0) <= 1);
      if (!raw) return zip.tile(job);
      const sig = `${job.width}:${job.height}:${job.depth}:${job.psb}`;
      if (!indexed || sig !== signature) {
        clear(); indexed = new Map(); signature = sig;
        const budget = options.rowBudget ?? 16 * 1024 * 1024;
        for (const ch of chans) {
          const c = lazyChannel(ch.bytes, ch.w, ch.h, job.depth, job.psb, ch.id >= 0);
          if (!c) throw new Error('图层压缩行索引无效');
          c.maxRows = Math.max(0, Math.floor(budget / (chans.length * c.rowBytes))); indexed.set(ch.id, c);
        }
      }
      const t = job.tile, x = Math.max(0, Math.min(job.width, t.x | 0)), y = Math.max(0, Math.min(job.height, t.y | 0));
      const width = Math.max(0, Math.min(t.width | 0, job.width - x)), height = Math.max(0, Math.min(t.height | 0, job.height - y));
      if (!width || !height) throw new Error('图层瓦片范围为空');
      const planes = {};
      for (const [id, c] of indexed) {
        c.maxRows = t.noRowCache ? 0 : Math.max(0, Math.floor((options.rowBudget ?? 16 * 1048576) / (chans.length * c.rowBytes)));
        while (c.rows.size > c.maxRows) c.rows.delete(c.rows.keys().next().value);
        const plane = new Uint8Array(width * height);
        for (let yy = 0; yy < height; yy++) {
          const key = c.rows.has(y + yy) ? 'rowHits' : 'rowsRead'; stats[key] = (stats[key] || 0) + 1;
          const row = lazyRow(c, y + yy);
          if (job.depth === 8) plane.set(row.subarray(x, x + width), yy * width);
          else for (let xx = 0; xx < width; xx++) { const q = (x + xx) * 2; plane[yy * width + xx] = Math.round((row[q] * 256 + row[q + 1]) * 255 / 65535); }
        }
        planes[id] = plane;
      }
      return { planes, x, y, width, height };
    },
  };
  const lod = createLodTileSession(job => native.tile(job), (planes, w, h, mode) => planesToRGBA(planes, w, h, mode, 255, null), options);
  return {
    get rowBytes() { return native.rowBytes + lod.rowBytes; },
    get indexBytes(){return zip.indexBytes;},get indexPoints(){return zip.indexPoints;},get indexWorkingBytes(){return zip.indexWorkingBytes;},
    setSeekBudget(value){zip.setSeekBudget(value);},
    detachInput(){return zip.detachInput();},attachInput(channels){zip.attachInput(channels);},
    clearIndex(){zip.clearIndex();},releaseSeekWorking(){zip.releaseSeekWorking();},
    async preview(job){const p=await zip.preview(job);return p?{rgba:null,preview:{data:planesToRGBA(p.planes,p.width,p.height,job.mode,255,null),width:p.width,height:p.height},warns:[],planes:null}:null;},
    clearRows() { native.clearRows(); lod.clearRows(); },
    close() { native.close(); lod.clearRows(); },
    async tile(job) {
      if (closed) throw new Error('图层解码会话已关闭');
      if (job.tile?.scale > 1) return lod.tile(job);
      lod.clearRows(); return native.tile(job);
    },
  };
}



async function decodeChannel(bytes, width, height, depth, psb, isColor = false, keepNative = null) {



  const r = new R(bytes, psb);
  const comp = r.u16();
  if (![8, 16, 32].includes(depth)) throw new Error(`不支持的位深 ${depth}`);
  const bytesPerSample = depth === 8 ? 1 : depth === 16 ? 2 : 4;
  const rowBytes = width * bytesPerSample;
  const expectedBytes = rowBytes * height;
  if (!Number.isSafeInteger(rowBytes) || !Number.isSafeInteger(expectedBytes) || rowBytes < 0 || expectedBytes < 0)
    throw new Error(`通道尺寸非法：${width}×${height} @ ${depth}bit`);
  let raw; 
  if (comp === 0) {                       
    raw = r.bytes(expectedBytes).slice();
  } else if (comp === 1) {                
    const counts = new Uint32Array(height);
    for (let y = 0; y < height; y++) counts[y] = psb ? r.u32() : r.u16();
    raw = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y++) {
      const packed = r.bytes(counts[y]);
      raw.set(decodePackBits(packed, rowBytes), y * rowBytes);
    }
  } else if (comp === 2 || comp === 3) {  
    raw = await inflate(r.bytes(bytes.byteLength - 2));
    
    if (comp === 3) undoPrediction(raw, width, height, depth);
  } else {
    throw new Error(`不支持的通道压缩方式 ${comp}`);
  }
  if (raw.length !== expectedBytes)
    throw new Error(`解压后通道长度 ${raw.length} ≠ 预期 ${expectedBytes}`);
  if (keepNative) {
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), n = width * height;
    const plane = depth === 32 ? new Float32Array(n) : depth === 16 ? new Uint16Array(n) : raw.slice();
    if (depth !== 8) for (let i = 0; i < n; i++) plane[i] = depth === 32 ? dv.getFloat32(i * 4) : dv.getUint16(i * 2);
    keepNative(plane);
  }
  
  if (depth === 8) return raw.subarray(0, width * height);
  const out = new Uint8Array(width * height);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (depth === 16) {
    
    for (let i=0;i<out.length;i++) out[i]=Math.round(dv.getUint16(i*2)*255/65535);
  }
  
  else if (isColor) { for (let i = 0; i < out.length; i++) out[i] = floatToDisplayByte(dv.getFloat32(i * 4)); }
  else { for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(dv.getFloat32(i * 4) * 255))); }
  return out;
}

const EMPTY_PLANE = new Uint8Array(0);
const CODEC_IDS = new WeakMap(); let codecSeq = 0;
const codecId = c => { if (!c) return 0; let v = CODEC_IDS.get(c); if (!v) CODEC_IDS.set(c, v = ++codecSeq); return v; };


export function hash2(dv, off, len) {
  const u8 = new Uint8Array(dv.buffer, dv.byteOffset + off, len);
  let h1 = 0x811c9dc5 | 0, h2 = 0x27d4eb2f | 0;
  for (let i = 0; i < len; i++) { const b = u8[i]; h1 = Math.imul(h1 ^ b, 0x01000193); h2 = Math.imul(h2 + b, 0x9e3779b1) ^ (h2 >>> 15); }
  return (h1 >>> 0).toString(36) + '.' + (h2 >>> 0).toString(36) + '.' + len;
}




export function rasterSigAt(dv, rec, dataStart, mode, depth, limit = dv.byteLength, codec = getModeCodec(mode)) {
  if (!(rec.width > 0 && rec.height > 0) || rec.channels.some(c => c.id === -2 || c.id === -3)) return null;
  const parts = [mode, depth, codecId(codec), rec.width, rec.height, rec.bounds.top, rec.bounds.left];   
  let o = dataStart;
  for (const ch of rec.channels) {
    const end = o + ch.length;
    if (!Number.isSafeInteger(end) || end > limit) return null;
    parts.push(ch.id + ':' + ch.length + ':' + hash2(dv, o, ch.length));
    o = end;
  }
  return parts.join('|');
}




export function layerRasterSig(buffer, index, o = {}) {
  if (hasHighDepthBlockLayers(buffer)) return null;
  const head = new R(buffer);
  if (head.key4() !== '8BPS') return null;
  const psb = head.u16() === 2;
  const r = new R(buffer, psb);
  r.seek(0); r.key4(); r.u16(); r.skip(6);
  r.u16(); r.u32(); r.u32(); const depth = r.u16(), mode = r.u16();
  
  if (o.exact && (mode !== 3 || depth !== 8 || getModeCodec(mode))) return null;
  r.skip(r.u32()); r.skip(r.u32());
  const lmiLen = r.lenPSB(); if (!(lmiLen > 0)) return null;
  const liLen = r.lenPSB(); if (!(liLen > 0)) return null;
  const liEnd = r.o + liLen;
  let count = r.i16(); if (count < 0) count = -count;
  if (index < 0 || index >= count) return null;
  const recs = [];
  for (let i = 0; i < count; i++) recs.push(readRecord(r, psb));
  let at = r.o;
  for (let i = 0; i < index; i++) for (const ch of recs[i].channels) at += ch.length;
  return rasterSigAt(r.dv, recs[index], at, mode, depth, liEnd, o.codec === undefined ? getModeCodec(mode) : o.codec);
}


function planesToRGBA(planes, width, height, mode, opacity255, maskInfo = null, codec = getModeCodec(mode)) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const A = planes[-1]; 
  const M = planes[-2] || planes[-3]; 
  
  const ch = (id, i) => (planes[id] ? planes[id][i] : 0);
  const maskDisabled = !!(maskInfo && (maskInfo.maskFlags & 2));
  const maskInvert = !!(maskInfo && (maskInfo.maskFlags & 4));
  const maskRelativeToLayer = !!(maskInfo && (maskInfo.maskFlags & 1));
  const hasRelativeMask = M && maskInfo && (maskInfo.maskW !== width || maskInfo.maskH !== height || maskInfo.top !== maskInfo.layerTop || maskInfo.left !== maskInfo.layerLeft);
  const mw = maskInfo ? maskInfo.maskW : width, mh = maskInfo ? maskInfo.maskH : height;
  const mTop = maskInfo ? maskInfo.top : 0, mLeft = maskInfo ? maskInfo.left : 0;
  const lTop = maskInfo ? maskInfo.layerTop : 0, lLeft = maskInfo ? maskInfo.layerLeft : 0;
  const defM = (maskInfo && maskInfo.defaultColor != null) ? maskInfo.defaultColor : 255;
  const cPl = codec ? [planes[0], planes[1], planes[2], planes[3]] : null, tmp = [0, 0, 0];



  if (!codec && mode === 3) {
    const p0 = planes[0], p1 = planes[1], p2 = planes[2], n = width * height;
    if (p0 && p1 && p2 && p0.length >= n && p1.length >= n && p2.length >= n) {
      const alphaOK = !A || A.length >= n;
      if ((!M || maskDisabled) && alphaOK) {
        if (A) for (let i = 0, o = 0; i < n; i++, o += 4) { rgba[o] = p0[i]; rgba[o + 1] = p1[i]; rgba[o + 2] = p2[i]; rgba[o + 3] = A[i]; }
        else for (let i = 0, o = 0; i < n; i++, o += 4) { rgba[o] = p0[i]; rgba[o + 1] = p1[i]; rgba[o + 2] = p2[i]; rgba[o + 3] = opacity255; }
        return rgba;
      }
      if (M && !maskDisabled && !hasRelativeMask && !maskRelativeToLayer && M.length >= n && alphaOK) {
        for (let i = 0, o = 0; i < n; i++, o += 4) {
          let mv = M[i]; if (maskInvert) mv = 255 - mv;
          let a = (A ? A[i] : 255);
          a = (a * mv) / 255;
          if (opacity255 !== 255) a = (a * opacity255) / 255;
          rgba[o] = p0[i]; rgba[o + 1] = p1[i]; rgba[o + 2] = p2[i]; rgba[o + 3] = a;
        }
        return rgba;
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    let r, g, b;
    if (codec) { codec.toRgb8(cPl, i, tmp); r = tmp[0]; g = tmp[1]; b = tmp[2]; }
    else if (mode === 3) { r = ch(0, i); g = ch(1, i); b = ch(2, i); }                   
    else if (mode === 1 || mode === 8) { r = g = b = ch(0, i); }                     
    else if (mode === 4) {                                                            
      const c = 255 - ch(0, i), m = 255 - ch(1, i), y = 255 - ch(2, i), k = 255 - ch(3, i);
      r = 255 - Math.min(255, c + k); g = 255 - Math.min(255, m + k); b = 255 - Math.min(255, y + k);
    } else { r = ch(0, i); g = planes[1] ? planes[1][i] : r; b = planes[2] ? planes[2][i] : r; }
    let a = A ? A[i] : 255;
    if (M && !maskDisabled) {
      let maskVal = defM;
      if (hasRelativeMask || maskRelativeToLayer) {
        const lx = i % width, ly = Math.floor(i / width);
        const mx = maskRelativeToLayer ? (lx - mLeft) : ((lLeft + lx) - mLeft);
        const my = maskRelativeToLayer ? (ly - mTop) : ((lTop + ly) - mTop);
        if (mx >= 0 && mx < mw && my >= 0 && my < mh) maskVal = M[my * mw + mx];
      } else {
        maskVal = M[i];
      }
      if (maskInvert) maskVal = 255 - maskVal;
      a = (a * maskVal) / 255;
    }
    if (opacity255 !== 255) a = (a * opacity255) / 255;
    const o = i * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
  }
  return rgba;
}





function maskFeathered(planes, geo, maskInfo, density = geo.maskDensity, feather = geo.maskFeather) {
  const slot = planes[-2] !== undefined ? -2 : planes[-3] !== undefined ? -3 : null;
  if (slot == null || !maskInfo || (maskInfo.maskFlags & 2)) return planes;
  const d = density == null ? 255 : density, f = feather || 0;
  if (d >= 255 && !(f > 0.2)) return planes;
  const lt = geo.bounds.top, ll = geo.bounds.left;
  const res = featherDensityPlane({
    gray: planes[slot], width: maskInfo.maskW, height: maskInfo.maskH, top: maskInfo.top, left: maskInfo.left,
    defaultColor: maskInfo.defaultColor, relative: !!(maskInfo.maskFlags & 1), layerTop: lt, layerLeft: ll,
  }, { top: lt, left: ll, width: geo.width, height: geo.height }, f, d);
  const out = Object.assign(Object.create(null), planes);
  out[slot] = res.gray;
  maskInfo.maskW = geo.width; maskInfo.maskH = geo.height; maskInfo.top = lt; maskInfo.left = ll;
  maskInfo.maskFlags &= ~1;
  return out;
}





export async function decodeLayerJob(job, tileSession = null) {
  if (job.zipTile) {
    lodScale(job.tile?.scale ?? 1);
    if (!tileSession && job.tile?.scale > 1) {
      const session = createLayerTileSession(job.chans);
      try { return await decodeLayerJob(job, session); } finally { session.close(); }
    }
    const cached = tileSession && await tileSession.tile(job);
    if (cached?.data) return { rgba: null, tile: cached, warns: [], planes: null };
    if (cached) return { rgba: null, tile: { x: cached.x, y: cached.y, width: cached.width, height: cached.height,
      data: planesToRGBA(cached.planes, cached.width, cached.height, job.mode, 255, null) }, warns: [], planes: null };
    const tile = await decodeLayerTileJob(job); if (tile) return tile;
  }
  if (job.previewMax) {
    const preview = (tileSession?.preview&&await tileSession.preview(job))||await decodeZipPreviewJob(job);
    if (preview) return preview;
  }
  const planes = {}, warns = [];
  for (const ch of job.chans) {
    if (!(ch.w > 0 && ch.h > 0)) { if (ch.id === -2 || ch.id === -3) planes[ch.id] = new Uint8Array(0); continue; }
    if (!ch.bytes || !ch.bytes.length) { warns.push({ id: ch.id, message: '通道数据为空' }); planes[ch.id] = new Uint8Array(ch.w * ch.h); continue; }
    try { planes[ch.id] = await decodeChannel(ch.bytes, ch.w, ch.h, job.depth, job.psb, ch.id >= 0); }
    catch (e) { warns.push({ id: ch.id, message: String(e && e.message || e) }); planes[ch.id] = new Uint8Array(ch.w * ch.h); }
  }
  let rgba = null;
  const mi = { ...job.maskInfo };
  if (job.width > 0 && job.height > 0 && planes[0]) rgba = planesToRGBA(maskFeathered(planes, job.geo, mi), job.width, job.height, job.mode, 255, mi);
  const hasMask = !!(planes[-2] || planes[-3]);
  if (rgba && job.tile) {
    const x0 = Math.max(0, Math.min(job.width, job.tile.x | 0)), y0 = Math.max(0, Math.min(job.height, job.tile.y | 0));
    const tw = Math.max(0, Math.min(job.tile.width | 0, job.width - x0)), th = Math.max(0, Math.min(job.tile.height | 0, job.height - y0));
    const tile = new Uint8ClampedArray(tw * th * 4);
    for (let y = 0; y < th; y++) tile.set(rgba.subarray(((y0 + y) * job.width + x0) * 4, ((y0 + y) * job.width + x0 + tw) * 4), y * tw * 4);
    return { rgba: null, tile: { x: x0, y: y0, width: tw, height: th, data: tile }, warns, planes: null };
  }
  if (rgba && !hasMask && job.previewMax && Math.max(job.width, job.height) > job.previewMax) {
    const scale = job.previewMax / Math.max(job.width, job.height);
    const pw = Math.max(1, Math.round(job.width * scale)), ph = Math.max(1, Math.round(job.height * scale));
    const preview = new Uint8ClampedArray(pw * ph * 4);
    for (let y = 0; y < ph; y++) {
      const sy = Math.min(job.height - 1, Math.floor(y / scale));
      for (let x = 0; x < pw; x++) {
        const sx = Math.min(job.width - 1, Math.floor(x / scale));
        const si = (sy * job.width + sx) * 4, di = (y * pw + x) * 4;
        preview[di] = rgba[si]; preview[di + 1] = rgba[si + 1]; preview[di + 2] = rgba[si + 2]; preview[di + 3] = rgba[si + 3];
      }
    }
    return { rgba: null, preview: { data: preview, width: pw, height: ph }, warns, planes: null };
  }
  return { rgba, preview: null, warns, planes: job.keepPlanes === true || (job.keepPlanes === 'mask' && hasMask) || hasMask ? planes : null };
}

const workerOK = (mode, depth) => (depth === 8 || depth === 16) && !getModeCodec(mode) && (mode === 3 || mode === 1 || mode === 8);






export async function parsePsdRaster(buffer, opts = {}) {
  
  if (hasHighDepthBlockLayers(buffer)) buffer = normalizeHighDepthLayers(buffer);
  const head = new R(buffer);
  if (head.key4() !== '8BPS') throw new Error('不是 PSD/PSB');
  const version = head.u16(); const psb = version === 2;
  const r = new R(buffer, psb);
  r.seek(0); r.key4(); r.u16(); r.skip(6);
  const channelsDoc = r.u16(), height = r.u32(), width = r.u32(), depth = r.u16(), mode = r.u16();
  const lazyLarge = opts.lazyTiles === true && width * height > 64e6;
  const codec = opts.codec === undefined ? getModeCodec(mode) : opts.codec;
  r.skip(r.u32());                    
  r.skip(r.u32());                    
  const lmiLen = r.lenPSB(); const lmiEnd = r.o + lmiLen;

  const layers = [], patterns = [];
  const warnings = [];
  const strictChannels = opts.strict === true || opts.strictChannels === true;
  if (lmiLen > 0) {
    const liLen = r.lenPSB(); const liEnd = r.o + liLen;
    if (liLen > 0) {
      let count = r.i16(); if (count < 0) count = -count;
      
      const recs = [];
      for (let i = 0; i < count; i++) recs.push(readRecord(r, psb));
      
      for (let layerIndex = 0; layerIndex < recs.length; layerIndex++) {
        const rec = recs[layerIndex];
        const planes = {}, nativePlanes = opts.keepNativePlanes ? {} : null;
        const decodeWarnings = [];
        const channelWarning = (ch, error) => {
          const message = `图层 ${layerIndex}「${rec.name || '(未命名)'}」通道 ${ch.id} 无法解码：${error.message || error}`;
          const warning = { code: 'channel-decode-failed', layerIndex, layerName: rec.name || '', channelId: ch.id, message };
          warnings.push(warning); decodeWarnings.push(warning);
          if (strictChannels) throw new Error(message);
        };
        


        let reused = null, sig = null;
        if (opts.reuse && opts.keepPlanes !== true && !opts.keepNativePlanes && !rec.maskPresent) {
          sig = rasterSigAt(r.dv, rec, r.o, mode, depth, liEnd, codec);
          if (sig) {
            const prev = opts.reuse(sig);
            if (prev && prev.length === rec.width * rec.height * 4) { reused = prev; r.seek(r.o + rec.channels.reduce((n, c) => n + c.length, 0)); }
          }
        }
        if (reused) { rec._planes = { 0: EMPTY_PLANE }; rec._reused = reused; rec._sig = sig; rec._decodeWarnings = decodeWarnings; continue; }
        rec._sig = sig;
        let lazyChannels = null, lazyCandidate = false;
        if (lazyLarge && rec.width > 0 && rec.height > 0) {
          lazyChannels = {}; lazyCandidate = true; let probe = r.o;
          for (const ch of rec.channels) {
            const isMask = ch.id === -2 || ch.id === -3;
            const cw = isMask ? rec.maskW : rec.width, chh = isMask ? rec.maskH : rec.height;
            const end = probe + ch.length;
            if (!Number.isSafeInteger(end) || end > liEnd) { lazyCandidate = false; break; }
            probe = end;

            if (!(cw > 0 && chh > 0)) continue;
            const bytes = new Uint8Array(r.dv.buffer, r.dv.byteOffset + end - ch.length, ch.length);
            const lazy = lazyChannel(bytes, cw, chh, depth, psb, !isMask);
            if (!lazy) { lazyCandidate = false; break; }
            lazyChannels[ch.id] = lazy;
          }
          if (lazyCandidate) {
            r.seek(probe); rec._planes = {}; rec._nativePlanes = null; rec._lazyChannels = lazyChannels;
            rec._decodeWarnings = decodeWarnings; continue;
          }
        }
        
        if (opts.decodePool && !codec && !opts.keepNativePlanes && workerOK(mode, depth) && rec.width > 0 && rec.height > 0) {
          const chans = [];
          let o = r.o, bad = false;
          for (const ch of rec.channels) {
            const isMask = ch.id === -2 || ch.id === -3, end = o + ch.length;
            if (!Number.isSafeInteger(end) || end < o || end > liEnd) { bad = true; break; }
            chans.push({ id: ch.id, view: new Uint8Array(r.dv.buffer, r.dv.byteOffset + o, ch.length), w: isMask ? rec.maskW : rec.width, h: isMask ? rec.maskH : rec.height });
            o = end;
          }
          if (!bad) {
            r.seek(o);
            rec._lazyCompressedChannels = chans;
            const job = { width: rec.width, height: rec.height, depth, psb, mode, previewMax: lazyLarge ? 2048 : 0,
              maskInfo: { maskW: rec.maskW, maskH: rec.maskH, top: rec.maskTop, left: rec.maskLeft, layerTop: rec.bounds.top, layerLeft: rec.bounds.left, defaultColor: rec.maskDefaultColor, maskFlags: rec.maskFlags },
              geo: { bounds: rec.bounds, width: rec.width, height: rec.height, maskDensity: rec.maskDensity, maskFeather: rec.maskFeather }, keepPlanes: opts.keepPlanes };
            rec._job = opts.decodePool.run(job, chans).catch(() => decodeLayerJob({ ...job, chans: chans.map(c => ({ id: c.id, bytes: c.view, w: c.w, h: c.h })) }));
            rec._decodeWarnings = decodeWarnings; rec._planes = {};
            continue;
          }
        }
        for (const ch of rec.channels) {
          const isMask = ch.id === -2 || ch.id === -3;
          const cw = isMask ? rec.maskW : rec.width;
          const chh = isMask ? rec.maskH : rec.height;
          const start = r.o; const end = start + ch.length;
          if (!Number.isSafeInteger(end) || end < start || end > liEnd)
            throw new Error(`图层 ${layerIndex}「${rec.name || '(未命名)'}」通道 ${ch.id} 数据越界（长度 ${ch.length}）`);
          if (cw > 0 && chh > 0) {
            if (ch.length === 0) {
              channelWarning(ch, new Error('通道数据为空'));
              planes[ch.id] = new Uint8Array(cw * chh);
            } else {
              try { planes[ch.id] = await decodeChannel(r.bytes(ch.length), cw, chh, depth, psb, ch.id >= 0, nativePlanes ? plane => { nativePlanes[ch.id] = plane; } : null); }
              catch (e) { channelWarning(ch, e); planes[ch.id] = new Uint8Array(cw * chh); }
            }
          }
          if (isMask && !(cw > 0 && chh > 0)) planes[ch.id] = new Uint8Array(0);
          r.seek(end);
        }
        rec._planes = planes; rec._nativePlanes = nativePlanes;
        rec._decodeWarnings = decodeWarnings;
      }
      if (opts.decodePool) {                 
        await Promise.all(recs.map(async (rec, layerIndex) => {
          if (!rec._job) return;
          const res = await rec._job; rec._job = null;
          for (const w of res.warns || []) {
            const message = `图层 ${layerIndex}「${rec.name || '(未命名)'}」通道 ${w.id} 无法解码：${w.message}`;
            const warning = { code: 'channel-decode-failed', layerIndex, layerName: rec.name || '', channelId: w.id, message };
            warnings.push(warning); rec._decodeWarnings.push(warning);
          }
          if (strictChannels && (res.warns || []).length) throw new Error(rec._decodeWarnings[0].message);
          rec._done = res.rgba; rec._preview = res.preview || null; rec._planes = res.planes || { 0: EMPTY_PLANE };
          if (!res.rgba) rec._planes = res.planes || {};
        }));
      }
      for (const rec of recs) {
        let rgba = null;
        if (rec._reused) rgba = rec._reused;
        else if (rec._done !== undefined) rgba = rec._done;
        else if (rec.width > 0 && rec.height > 0 && rec._planes[0]) {
          const maskInfo = {
            maskW: rec.maskW, maskH: rec.maskH,
            top: rec.maskTop, left: rec.maskLeft,
            layerTop: rec.bounds.top, layerLeft: rec.bounds.left,
            defaultColor: rec.maskDefaultColor,
            maskFlags: rec.maskFlags
          };
          rgba = planesToRGBA(maskFeathered(rec._planes, rec, maskInfo), rec.width, rec.height, mode, 255, maskInfo, codec);
        }
        const lazyMaskId = rec._lazyChannels ? (rec._lazyChannels[-2] ? -2 : rec._lazyChannels[-3] ? -3 : null) : null;
        const maskGray = rec._planes[-2] || rec._planes[-3] || null;
        const hasMask = !(rec.frame && (rec.maskFlags & 8)) && rec.maskPresent
          && (maskGray || lazyMaskId || rec.maskW === 0 || rec.maskH === 0);
        layers.push({
          name: rec.name, bounds: rec.bounds, width: rec.width, height: rec.height,
          isBackground: layers.length === 0 && !rec.group && !rec.channels.some(c => c.id === -1),
          rgba, opacity: rec.opacity, blendMode: rec.blendMode, clipping: rec.clipping,
          hidden: rec.hidden, isSmartObject: rec.isSmartObject, isText: rec.isText,
          group: rec.group, frame: rec.frame, isFrame: !!rec.frame, layerType: rec.layerType, adjustment: rec.adjustment,
          fill: rec.fill, fillOpacity: rec.fillOpacity, vectorMask: rec.vectorMask, vectorStroke: rec.vectorStroke, vectorOrigin: rec.vectorOrigin,
          effects: rec.effects, blendClipped: rec.blendClipped, blendInterior: rec.blendInterior, transparencyShapes: rec.transparencyShapes, knockout: rec.knockout,
          ...(rec._lazyChannels ? { lazyChannels: rec._lazyChannels } : {}),
          ...(rec._lazyCompressedChannels ? { lazyCompressedChannels: rec._lazyCompressedChannels } : {}),
          ...(rec._lazyCompressedChannels ? { lazyCompressedPsb: psb } : {}),
          ...(rec._preview ? { lazyPreview: rec._preview } : {}),
          ...(rec.blendIf ? { blendIf: rec.blendIf } : {}), ...(rec.channelsOff ? { channelsOff: rec.channelsOff } : {}),   
          
          
          
          mask: hasMask ? {
            width: rec.maskW, height: rec.maskH, top: rec.maskTop, left: rec.maskLeft,
            defaultColor: rec.maskDefaultColor, flags: rec.maskFlags,
            disabled: !!(rec.maskFlags & 2), invert: !!(rec.maskFlags & 4),
            relative: !!(rec.maskFlags & 1), fromOtherData: !!(rec.maskFlags & 8),
            ...(rec.maskDensity != null ? { density: rec.maskDensity } : {}),
            ...(rec.maskFeather != null ? { feather: rec.maskFeather } : {}),
            gray: maskGray,
            ...(lazyMaskId ? { lazyChannel: lazyMaskId } : {})
          } : null,
          ...(rec._decodeWarnings.length ? { decodeWarnings: rec._decodeWarnings } : {}),
          ...(rec._sig ? { rasterSig: rec._sig } : {}),
          ...(rec._nativePlanes ? { nativePlanes: rec._nativePlanes } : {}),
          






          ...(opts.keepPlanes === true
                ? { planes: rec._planes }
                : (opts.keepPlanes === 'mask' && (rec._planes[-2] || rec._planes[-3])
                     ? { planes: rec._planes } : {}))
        });
        delete rec._planes; delete rec._nativePlanes; delete rec._done; delete rec._preview;
        delete rec._decodeWarnings; delete rec._reused; delete rec._sig;
      }
    }
    r.seek(Math.min(liEnd, lmiEnd));
    
    
    
    if (r.o + 4 <= lmiEnd) {
      const maskLength = r.u32();
      r.seek(Math.min(lmiEnd, r.o + maskLength));
      while (r.o + 12 <= lmiEnd) {
        const sig = r.key4(); if (sig !== '8BIM' && sig !== '8B64') break;
        const key = r.key4(), isBig = sig === '8B64' || (psb && BIG_LEN_KEYS.has(key));
        if (isBig && r.o + 8 > lmiEnd) break;
        const len = isBig ? r.u64() : r.u32(), dataEnd = r.o + len;
        if (!Number.isSafeInteger(dataEnd) || dataEnd > lmiEnd) break;
        if (key === 'Patt' || key === 'Pat2' || key === 'Pat3') {
          try {
            const parsed = parseAdditionalBlock(key, new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len), { psb, verify: false });
            if (parsed && !parsed._raw && Array.isArray(parsed.patterns)) patterns.push(...parsed.patterns);
          } catch {  }
        }
        r.seek(Math.min(lmiEnd, dataEnd + ((4 - (len % 4)) % 4)));
      }
    }
  }
  return { width, height, depth, mode, channels: channelsDoc, layers,
           ...(patterns.length ? { patterns } : {}),
           ...(warnings.length ? { warnings } : {}) };
}

const ADJUSTMENT_KEYS = {
  curv: '曲线', levl: '色阶', brit: '亮度/对比度', hue2: '色相/饱和度', hue: '色相/饱和度',
  blnc: '色彩平衡', blwh: '黑白', nvrt: '反相', post: '色调分离', thrs: '阈值',
  ccls: '可选颜色', selc: '可选颜色', phfl: '照片滤镜', vibA: '自然饱和度',
  mixr: '通道混合器', grdm: '渐变映射', expA: '曝光度', clrL: '颜色查找'
};
const FILL_KEYS = { SoCo: '纯色填充', GdFl: '渐变填充', PtFl: '图案填充' };

function readRecord(r, psb) {
  const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
  const n = r.u16();
  const channels = [];
  for (let c = 0; c < n; c++) channels.push({ id: r.i16(), length: r.lenPSB() });
  r.key4(); const blendMode = r.key4(); const opacity = r.u8(); const clipping = r.u8();
  const flags = r.u8(); r.u8();
  const extraLen = r.u32(); const extraEnd = r.o + extraLen;
  
  const maskLen = r.u32(); let maskW = 0, maskH = 0;
  let maskTop = 0, maskLeft = 0, maskBottom = 0, maskRight = 0, maskDefaultColor = 255, maskFlags = 0;
  let maskParams = null;
  if (maskLen > 0) {
    const secStart = r.o;
    maskTop = r.i32(); maskLeft = r.i32(); maskBottom = r.i32(); maskRight = r.i32();
    maskW = Math.max(0, maskRight - maskLeft); maskH = Math.max(0, maskBottom - maskTop);
    if (maskLen >= 17) maskDefaultColor = r.u8();
    if (maskLen >= 18) maskFlags = r.u8();
    r.seek(r.o - (maskLen >= 18 ? 18 : maskLen >= 17 ? 17 : 16) + maskLen);
    
    if (maskFlags & 0x10) {
      try {
        const m = parseLayerMask(new Uint8Array(r.dv.buffer, r.dv.byteOffset + secStart, maskLen), { withLength: false });
        const p = m && m.parameters;
        if (p) maskParams = { density: p.userMaskDensity ?? null, feather: p.userMaskFeather ?? null,
          vectorDensity: p.vectorMaskDensity ?? null, vectorFeather: p.vectorMaskFeather ?? null };
      } catch { maskParams = null; }
    }
  }
  const brLen = r.u32();
  

  let blendIf = null;
  if (brLen >= 8) {
    const ranges = [];
    for (let k = 0; k + 8 <= brLen; k += 8) {
      const at = r.o + k, g = o => r.dv.getUint8(at + o);
      ranges.push({ src: [g(0), g(1), g(2), g(3)], dst: [g(4), g(5), g(6), g(7)] });
    }
    const def = q => q[0] === 0 && q[1] === 0 && q[2] === 255 && q[3] === 255;
    if (ranges.some(x => !def(x.src) || !def(x.dst))) blendIf = { gray: ranges[0], channels: ranges.slice(1) };
  }
  r.skip(brLen);
  const nameLen = r.u8(); let name = r.ascii(nameLen); const pad = (4 - ((nameLen + 1) % 4)) % 4; r.skip(pad);
  
  let isSmartObject = false, isText = false, group = null, uname = '';
  let adjustment = null, fill = null, fillOpacity = 255, vectorMask = false, vectorStroke = null, vectorOrigin = null, effects = false;
  let frame = null;
  let channelsOff = null;   
  let blendClipped = true, blendInterior = false, transparencyShapes = true, knockout = null;
  while (r.o + 12 <= extraEnd) {
    const sig = r.key4(); if (sig !== '8BIM' && sig !== '8B64') break;
    
    const key = r.key4();
    const isBig = psb && BIG_LEN_KEYS.has(key);
    if (isBig && r.o + 8 > extraEnd) break;  
    const len = isBig ? r.u64() : r.u32(); const de = r.o + len;
    try {
      if (key === 'luni') uname = r.unicode();
      else if (key === 'knko') knockout = r.u8();
      else if (key === 'clbl') blendClipped = r.u8() !== 0;
      else if (key === 'infx') blendInterior = r.u8() !== 0;
      else if (key === 'tsly') transparencyShapes = r.u8() !== 0;
      else if (key === 'brst') { const off = []; for (let k = 0; k + 4 <= len; k += 4) { const c = r.dv.getInt32(r.o + k); if (c >= 0 && c < 4) off.push(c); } if (off.length) channelsOff = off; }
      else if (key === 'SoLd' || key === 'PlLd') isSmartObject = true;
      else if (key === 'TySh') isText = true;
      else if (key === 'frgb') {
        const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
        frame = frameInfoOf(parseAdditionalBlock(key, raw, { psb, verify: false }));
      }
      else if (key === 'vmsk' || key === 'vsms') {
        const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
        const parsed = parseAdditionalBlock(key, raw, { psb, verify: false });
        
        
        vectorMask = parsed && !parsed._raw && parsed.path ? parsed : true;
      }
      else if (key === 'vogk') {
        
        const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
        const parsed = parseAdditionalBlock(key, raw, { psb, verify: false });
        vectorOrigin = parsed && !parsed._raw && parsed.desc ? parsed.desc : null;
      }
      else if (key === 'vstk') {
        
        
        const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
        const parsed = parseAdditionalBlock(key, raw, { psb, verify: false });
        vectorStroke = parsed && !parsed._raw && parsed.desc ? parsed : null;
      }
      else if (key === 'lrFX' || key === 'lfx2' || key === 'lfx3' || key === 'lfxs' || key === 'lmfx') {
        
        
        
        
        
        
        if (!effects) effects = true;
        if (key !== 'lrFX') {
          const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
          const parsed = parseAdditionalBlock(key, raw, { psb, verify: false });
          if (parsed && !parsed._raw && parsed.desc) effects = parsed.desc;
        }
      }
      else if (key === 'lsct' || key === 'lsdk') {                 
        const t = r.u32(); group = { type: t };
        

        if (len >= 12) { r.key4(); group.blendKey = r.key4(); }
      }
      else if (key === 'iOpa' && len >= 1) fillOpacity = r.u8();
      else if (ADJUSTMENT_KEYS[key]) {
        
        
        
        const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
        const params = parseAdditionalBlock(key, raw, { psb, verify: false });
        



        const presetOnly = key === 'CgEd' && params && !params._raw && params.desc &&
          ('presetFileName' in params.desc || 'curvesPresetFileName' in params.desc || 'mixerPresetFileName' in params.desc);
        if (!presetOnly) adjustment = { key, label: ADJUSTMENT_KEYS[key], params: params && !params._raw ? params : null };
      }
      else if (FILL_KEYS[key]) {
        const raw = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, len);
        const params = parseAdditionalBlock(key, raw, { psb, verify: false });
        fill = { key, label: FILL_KEYS[key], params: params && !params._raw ? params : null };
      }
    } catch (e) {  }
    r.seek(de + (len % 2));
  }
  r.seek(extraEnd);

  let layerType = 'pixel';
  if (frame) layerType = 'frame';
  else if (group && (group.type === 1 || group.type === 2)) layerType = 'group';
  else if (group && group.type === 3) layerType = 'groupEnd';
  else if (isSmartObject) layerType = 'smartObject';
  else if (isText) layerType = 'text';
  else if (adjustment) layerType = 'adjustment';
  else if (fill) layerType = 'fill';

  
  if (vectorMask && typeof vectorMask === 'object' && maskParams) {
    if (maskParams.vectorDensity != null) vectorMask.density = maskParams.vectorDensity;
    if (maskParams.vectorFeather != null) vectorMask.feather = maskParams.vectorFeather;
  }


  if (maskFlags & 1) { maskTop -= top; maskBottom -= top; maskLeft -= left; maskRight -= left; }
  return {
    bounds: { top, left, bottom, right }, width: right - left, height: bottom - top,
    maskPresent: maskLen >= 18, maskW, maskH, maskTop, maskLeft, maskBottom, maskRight, maskDefaultColor, maskFlags,
    maskDensity: maskParams ? maskParams.density : null, maskFeather: maskParams ? maskParams.feather : null,
    channels, blendMode: (group && (group.type === 1 || group.type === 2) && group.blendKey) ? group.blendKey : blendMode, opacity, clipping, hidden: !!(flags & 2),
    name: uname || name, isSmartObject, isText, group, frame,
    adjustment, fill, fillOpacity, vectorMask, vectorStroke, vectorOrigin, effects, layerType, blendClipped, blendInterior, transparencyShapes, knockout,
    ...(blendIf ? { blendIf } : {}), ...(channelsOff ? { channelsOff } : {}),
  };
}




















export function recomposeLayerRGBA(layer, mode, override = {}) {
  if (!layer || !layer.planes || !(layer.width > 0 && layer.height > 0)) return null;
  const planes = layer.planes;
  const m = layer.mask || null;

  
  let maskInfo = null;
  const gray = override.gray !== undefined ? override.gray : (planes[-2] || planes[-3] || null);
  if (!override.removed && gray) {
    const mw = override.width  ?? (m ? m.width  : layer.width);
    const mh = override.height ?? (m ? m.height : layer.height);
    const flags = ((override.relative ?? (m ? m.relative : false)) ? 1 : 0)
                | ((override.disabled ?? (m ? m.disabled : false)) ? 2 : 0)
                | ((override.invert   ?? (m ? m.invert   : false)) ? 4 : 0);
    maskInfo = {
      maskW: mw, maskH: mh,
      top: override.top ?? (m ? m.top : 0), left: override.left ?? (m ? m.left : 0),
      layerTop: layer.bounds.top, layerLeft: layer.bounds.left,
      defaultColor: override.defaultColor ?? (m ? m.defaultColor : 255),
      maskFlags: flags,
    };
  }

  
  
  const slot = planes[-2] !== undefined ? -2 : -3;
  const clonePlanes = () => Object.assign(Object.create(null), planes);
  let usePlanes = planes;
  if (!maskInfo) {
    if (planes[-2] !== undefined || planes[-3] !== undefined) {
      usePlanes = clonePlanes();
      delete usePlanes[-2]; delete usePlanes[-3];
    }
  } else {
    if (override.gray !== undefined) { usePlanes = clonePlanes(); usePlanes[slot] = gray; }
    
    const density = override.density !== undefined ? override.density : (m && m.density != null ? m.density : 255);
    const feather = override.feather !== undefined ? override.feather : (m && m.feather != null ? m.feather : 0);
    usePlanes = maskFeathered(usePlanes, layer, maskInfo, density, feather);
  }

  return planesToRGBA(usePlanes, layer.width, layer.height, mode, 255, maskInfo);
}

export default { parsePsdRaster, recomposeLayerRGBA };
