import { effectsToBytes } from './asl.js';


const ascii = s => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 255));
const u16 = n => Uint8Array.from([(n >>> 8) & 255, n & 255]);
const u32 = n => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const u64 = n => { const b = new Uint8Array(8), d = new DataView(b.buffer); d.setBigUint64(0, BigInt(n)); return b; };
const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
const partLen = p => p instanceof Blob ? p.size : p.length;
class Chunks { constructor(parts = []) { this.parts = parts; this.length = parts.reduce((n, p) => n + partLen(p), 0); } }
const flatten = (parts, out = []) => { for (const p of parts) p instanceof Chunks ? flatten(p.parts, out) : out.push(p); return out; };
const packBits = row => { const out = new Uint8Array(row.length + ((row.length + 127) >> 7) + 8); let i = 0, o = 0; const runAt = p => { const v = row[p]; let n = 1; while (p + n < row.length && n < 128 && row[p + n] === v) n++; return n; }; while (i < row.length) { const run = runAt(i); if (run >= 3) { out[o++] = 257 - run; out[o++] = row[i]; i += run; continue; } const start = i; i += run; while (i < row.length && i - start < 128) { const n = runAt(i); if (n >= 3 || i - start + n > 128) break; i += n; } const n = i - start; out[o++] = n - 1; out.set(row.subarray(start, i), o); o += n; } return out.subarray(0, o); };
const lenField = (n, psb) => psb ? u64(n) : u32(n);
const signed32 = n => u32(n | 0);
const abort = signal => { if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('导出已取消', 'AbortError'); };
const pascal = name => { const a = [Math.min(255, [...String(name || '图层 0')].length)]; for (const c of [...String(name || '图层 0')].slice(0, 255)) a.push(c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63); while (a.length % 4) a.push(0); return Uint8Array.from(a); };
const luni = name => { const chars = [...String(name || '图层 0')], body = [0, 0, 0, chars.length]; for (const c of chars) { const n = c.codePointAt(0); body.push((n >>> 8) & 255, n & 255); } while (body.length % 4) body.push(0); return cat([ascii('8BIM'), ascii('luni'), u32(body.length), Uint8Array.from(body)]); };

const block = (key, data) => { const len = data.length + ((4 - data.length % 4) % 4), out = new Uint8Array(12 + len); out.set(ascii('8BIM')); out.set(ascii(key), 4); new DataView(out.buffer).setUint32(8, len); out.set(data, 12); return out; };
const blendKey = (mode) => String(mode || 'norm').padEnd(4, ' ').slice(0, 4);
const effectBlock = effects => effects ? block('lfx2', cat([u32(0), u32(16), effectsToBytes(effects)])) : new Uint8Array(0);
const layerExtra = (name, effects, fillOpacity = 255) => cat([u32(0), u32(0), pascal(name), luni(name), block('iOpa', Uint8Array.of(fillOpacity & 255)), effectBlock(effects)]);
const channel = (rows, height, psb, cb, empty = false, skipTableCount = 0, counts = null) => {
  if (empty) return new Chunks([u16(0)]);
  const table = new Uint8Array((height + skipTableCount) * cb), dv = new DataView(table.buffer);
  if (counts) for (let y = 0; y < height; y++) psb ? dv.setUint32(y * 4, counts[y]) : dv.setUint16(y * 2, counts[y]);
  else rows.forEach((p, y) => psb ? dv.setUint32(y * 4, partLen(p)) : dv.setUint16(y * 2, partLen(p)));
  return new Chunks([u16(1), table, ...rows]);
};
const record = ({ top = 0, left = 0, bottom = 0, right = 0, channels, name, blend = 'norm', opacity = 255, clipping = 0, hidden = false, fillOpacity = 255, effects = null }, psb) => cat([
  signed32(top), signed32(left), signed32(bottom), signed32(right), u16(4),
  ...[-1, 0, 1, 2].map((id, i) => cat([u16(id & 0xffff), lenField(channels[i].length, psb)])),
  ascii('8BIM'), ascii(blendKey(blend)), Uint8Array.of(opacity & 255, clipping ? 1 : 0, hidden ? 2 : 0, fillOpacity & 255),
  u32(layerExtra(name, effects, fillOpacity).length), layerExtra(name, effects, fillOpacity),
]);
function rgbaRows(L) {
  const rows = [0, 1, 2, 3].map(() => new Uint8Array(L.width)), packed = [];
  for (let c = 0; c < 4; c++) packed.push(packBits(rows[c]));
  return packed;
}




export async function writeLazyRasterPsd({ width, height, name = '图层 0', readTile, psb = width > 30000 || height > 30000, extraLayers = [], onProgress = null, abortSignal = null, asBlob = false,
  blend = 'norm', opacity = 255, clipping = 0, hidden = false, fillOpacity = 255, effects = null } = {}) {
  if (!(width > 0 && height > 0) || typeof readTile !== 'function') throw new Error('惰性 PSD 写回参数无效');
  const cb = psb ? 4 : 2, tileSize = 256, chanOrder = [3, 0, 1, 2];
  const showBase = !hidden, baseA = showBase ? (opacity / 255) * (fillOpacity / 255) : 0;
  const bodies = chanOrder.map(() => []), counts = chanOrder.map(() => new Uint32Array(height));
  const compCounts = [0, 1, 2].map(() => new Uint32Array(height)), compBodies = [0, 1, 2].map(() => []);
  const extras = extraLayers.map(L0 => {
    const L = L0 || {}, bx = L.bounds || {};
    const top = Number(bx.top) | 0, left = Number(bx.left) | 0;
    const lw = Math.max(0, (bx.right | 0) - left), lh = Math.max(0, (bx.bottom | 0) - top);
    const dense = L.rgba && lw > 0 && lh > 0 && L.rgba.length === lw * lh * 4 ? L.rgba : null;
    const reader = typeof L.readTile === 'function' && lw > 0 && lh > 0 ? L.readTile : null;
    return { L, top, left, lw, lh, dense, reader, filled: !!(dense || reader),
      counts: chanOrder.map(() => new Uint32Array(lh)), bodies: chanOrder.map(() => []),
      chRows: chanOrder.map(() => new Uint8Array(lw)) };
  });
  abort(abortSignal);
  if (onProgress) try { onProgress(Math.floor(height * 0.04), height * 1.08); } catch {}


  const prepareExtraBand = async (e, gy0, gy1) => {
    e.band = null;
    if (!e.filled || gy1 <= e.top || gy0 >= e.top + e.lh) return;
    if (!e.reader) { e.band = {}; return; }
    const x1 = e.left + e.lw, tiles = [];
    for (let ty = Math.floor(gy0 / 256) * 256; ty < gy1; ty += 256) {
      for (let tx = Math.floor(e.left / 256) * 256; tx < x1; tx += 256) {
        abort(abortSignal);
        tiles.push({ x: tx, y: ty, t: await e.reader(tx, ty) });
        abort(abortSignal);
      }
    }
    e.band = { tiles, row: new Uint8ClampedArray(e.lw * 4) };
  };
  const extraRow = (e, gy) => {
    const sy = gy - e.top;
    if (e.dense) return e.dense.subarray(sy * e.lw * 4, (sy + 1) * e.lw * 4);
    const row = e.band?.row; if (!row) return null;
    row.fill(0);
    for (const { t } of e.band.tiles) {
      if (!t || gy < t.y || gy >= t.y + t.height) continue;
      const x0 = Math.max(e.left, t.x), x1 = Math.min(e.left + e.lw, t.x + t.width);
      for (let gx = x0; gx < x1; gx++) {
        const si = ((gy - t.y) * t.width + (gx - t.x)) * 4, di = (gx - e.left) * 4;
        row[di] = t.data[si]; row[di + 1] = t.data[si + 1];
        row[di + 2] = t.data[si + 2]; row[di + 3] = t.data[si + 3];
      }
    }
    return row;
  };
  for (let y0 = 0; y0 < height; y0 += tileSize) {
    abort(abortSignal);
    const bandH = Math.min(tileSize, height - y0), tiles = [];
    for (let x = 0; x < width; x += tileSize) { abort(abortSignal); tiles.push(await readTile(x, y0)); abort(abortSignal); }
    for (const e of extras) {
      e.bandParts = asBlob ? chanOrder.map(() => []) : null;
      await prepareExtraBand(e, y0, y0 + bandH);
    }

    const mergedRows = [0, 1, 2].map(() => new Uint8Array(width));
    const bandParts = asBlob ? chanOrder.map(() => []) : null, bandComp = asBlob ? [0, 1, 2].map(() => []) : null;
    for (let yy = 0; yy < bandH; yy++) {
      const rows = chanOrder.map(() => new Uint8Array(width)), merged = new Uint8ClampedArray(width * 4); let x = 0;
      for (const t of tiles) {
        if (!t) { x += tileSize; continue; }
        const w = Math.min(t.width, width - x);
        for (let xx = 0; xx < w; xx++) {


          const q = (yy * t.width + xx) * 4, d = (x + xx) * 4;
          rows[0][x + xx] = t.data[q + 3];
          rows[1][x + xx] = t.data[q];
          rows[2][x + xx] = t.data[q + 1];
          rows[3][x + xx] = t.data[q + 2];
          if (baseA > 0) {
            merged[d] = t.data[q]; merged[d + 1] = t.data[q + 1]; merged[d + 2] = t.data[q + 2]; merged[d + 3] = Math.round(t.data[q + 3] * baseA);
          }
        }
        x += w;
      }
      for (const e of extras) {
        const gy = y0 + yy;
        if (!e.filled || gy < e.top || gy >= e.top + e.lh) continue;
        const rgba = extraRow(e, gy);
        if (!rgba) continue;

        for (let ox = 0; ox < e.lw; ox++) {
          const si = ox * 4;
          e.chRows[0][ox] = rgba[si + 3];
          e.chRows[1][ox] = rgba[si];
          e.chRows[2][ox] = rgba[si + 1];
          e.chRows[3][ox] = rgba[si + 2];
        }
        for (let c = 0; c < chanOrder.length; c++) {
          const p = packBits(e.chRows[c]);
          (e.bandParts ? e.bandParts[c] : e.bodies[c]).push(p);
          e.counts[c][gy - e.top] = p.length;
        }
        if (e.L.hidden) continue;
        const sa = ((e.L.opacity ?? 255) / 255) * ((e.L.fillOpacity ?? 255) / 255);
        for (let ox = 0; ox < e.lw; ox++) {
          const gx = e.left + ox; if (gx < 0 || gx >= width) continue;
          const si = ox * 4, di = gx * 4;
          let a = rgba[si + 3] / 255 * sa;
          if (e.L.clipping) a *= merged[di + 3] / 255;
          if (!(a > 0)) continue;
          const da = merged[di + 3] / 255, oa = a + da * (1 - a);
          for (let c = 0; c < 3; c++) merged[di + c] = oa ? Math.round((rgba[si + c] * a + merged[di + c] * da * (1 - a)) / oa) : 0;
          merged[di + 3] = Math.round(oa * 255);
        }
      }


      for (let x = 0; x < width; x++) {
        mergedRows[0][x] = merged[x * 4];
        mergedRows[1][x] = merged[x * 4 + 1];
        mergedRows[2][x] = merged[x * 4 + 2];
      }
      for (let c = 0; c < chanOrder.length; c++) {
        const p = packBits(rows[c]); (asBlob ? bandParts[c] : bodies[c]).push(p); counts[c][y0 + yy] = p.length;
      }
      for (let c = 0; c < compBodies.length; c++) {
        const q = packBits(mergedRows[c]); (asBlob ? bandComp[c] : compBodies[c]).push(q); compCounts[c][y0 + yy] = q.length;
      }
    }
    if (asBlob) {
      for (let c = 0; c < bandParts.length; c++) if (bandParts[c].length) bodies[c].push(new Blob(bandParts[c]));
      for (let c = 0; c < bandComp.length; c++) if (bandComp[c].length) compBodies[c].push(new Blob(bandComp[c]));
      for (const e of extras) for (let c = 0; c < chanOrder.length; c++)
        if (e.bandParts?.[c].length) e.bodies[c].push(new Blob(e.bandParts[c]));
    }
    for (const e of extras) e.band = null;
    if (onProgress) try { onProgress(Math.floor(height * 0.08 + (y0 + bandH) * 100 / height), height * 1.08); } catch {}
  }
  const channelData = chanOrder.map((_, c) => channel(bodies[c], height, psb, cb, false, 0, counts[c]));
  for (const e of extras) e.channels = e.bodies.map((p, c) => channel(p, e.lh, psb, cb, !e.filled, 0, e.counts[c]));
  const baseRecord = record({ top: 0, left: 0, bottom: height, right: width, channels: channelData, name,
    blend, opacity, clipping, hidden, fillOpacity, effects }, psb);
  const extraRecords = extras.map(e => record({ top: e.top, left: e.left, bottom: e.top + e.lh, right: e.left + e.lw,
    channels: e.channels, name: e.L.name || '图层', blend: e.L.blendMode, opacity: e.L.opacity ?? 255,
    clipping: e.L.clipping, hidden: e.L.hidden, fillOpacity: e.L.fillOpacity ?? 255, effects: e.L.effects }, psb));
  const liBody = new Chunks([u16(1 + extraRecords.length), baseRecord, ...extraRecords, ...channelData, ...extras.flatMap(e => e.channels)]);
  const liPad = liBody.length & 1 ? new Uint8Array(1) : new Uint8Array(0);
  const layerInfo = new Chunks([lenField(liBody.length + liPad.length, psb), liBody, liPad]);
  const globalMask = lenField(0, psb);
  const layerMask = new Chunks([lenField(layerInfo.length + globalMask.length, psb), layerInfo, globalMask]);
  const compTable = new Uint8Array(height * compBodies.length * cb), compDv = new DataView(compTable.buffer);
  compCounts.forEach((rows, c) => rows.forEach((n, y) => {
    const at = (c * height + y) * cb;
    psb ? compDv.setUint32(at, n) : compDv.setUint16(at, n);
  }));
  const comp = new Chunks([u16(1), compTable, ...compBodies.flat()]);
  const header = cat([ascii('8BPS'), u16(psb ? 2 : 1), new Uint8Array(6), u16(3), u32(height), u32(width), u16(8), u16(3), u32(0), u32(0)]);
  abort(abortSignal);
  const flat = flatten([header, layerMask, comp]);


  if (asBlob) return new Blob(flat, { type: 'image/vnd.adobe.photoshop' });
  const bytes = new Uint8Array(flat.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of flat) { abort(abortSignal); bytes.set(p, at); at += p.length; }
  return bytes.buffer;
}

export default { writeLazyRasterPsd };
