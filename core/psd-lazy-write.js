
const ascii = s => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 255));
const u16 = n => Uint8Array.from([(n >>> 8) & 255, n & 255]);
const u32 = n => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const u64 = n => Uint8Array.from([Math.floor(n / 0x100000000) >>> 0, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
class Chunks { constructor(parts = []) { this.parts = parts; this.length = parts.reduce((n, p) => n + p.length, 0); } }
const flatten = (parts, out = []) => { for (const p of parts) p instanceof Chunks ? flatten(p.parts, out) : out.push(p); return out; };
const packBits = row => { const out = new Uint8Array(row.length + ((row.length + 127) >> 7) + 8); let i = 0, o = 0; const runAt = p => { const v = row[p]; let n = 1; while (p + n < row.length && n < 128 && row[p + n] === v) n++; return n; }; while (i < row.length) { const run = runAt(i); if (run >= 3) { out[o++] = 257 - run; out[o++] = row[i]; i += run; continue; } const start = i; i += run; while (i < row.length && i - start < 128) { const n = runAt(i); if (n >= 3 || i - start + n > 128) break; i += n; } const n = i - start; out[o++] = n - 1; out.set(row.subarray(start, i), o); o += n; } return out.subarray(0, o); };
const lenField = (n, psb) => psb ? u64(n) : u32(n);
const pascal = name => { const a = [Math.min(255, [...String(name || '图层 0')].length)]; for (const c of [...String(name || '图层 0')].slice(0, 255)) a.push(c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63); while (a.length % 4) a.push(0); return Uint8Array.from(a); };
const luni = name => { const chars = [...String(name || '图层 0')], body = [0, 0, 0, chars.length]; for (const c of chars) { const n = c.codePointAt(0); body.push((n >>> 8) & 255, n & 255); } while (body.length % 4) body.push(0); return cat([ascii('8BIM'), ascii('luni'), u32(body.length), Uint8Array.from(body)]); };
const block = (key, data) => cat([ascii('8BIM'), ascii(key), u32(data.length), data, data.length % 2 ? Uint8Array.of(0) : new Uint8Array(0)]);
function solidComposite(width, height, psb) { const tables = [], bodies = [], cb = psb ? 4 : 2; for (const value of [0, 0, 0, 255]) { const rows = [], counts = []; for (let y = 0; y < height; y++) { const p = packBits(new Uint8Array(width).fill(value)); rows.push(p); counts.push(p.length); } const table = new Uint8Array(height * cb), dv = new DataView(table.buffer); counts.forEach((n, y) => psb ? dv.setUint32(y * 4, n) : dv.setUint16(y * 2, n)); tables.push(table); bodies.push(...rows); } return new Chunks([u16(1), ...tables, ...bodies]); }

export async function writeLazyRasterPsd({ width, height, name = '图层 0', readTile, psb = width > 30000 || height > 30000 } = {}) {
  if (!(width > 0 && height > 0) || typeof readTile !== 'function') throw new Error('惰性 PSD 写回参数无效');
  const tileSize = 256, channels = [0, 1, 2, 3], bodies = channels.map(() => []), counts = channels.map(() => new Uint32Array(height));
  for (let y0 = 0; y0 < height; y0 += tileSize) {
    const bandH = Math.min(tileSize, height - y0), tiles = [];
    for (let x = 0; x < width; x += tileSize) tiles.push(await readTile(x, y0));
    for (let yy = 0; yy < bandH; yy++) {
      const rows = channels.map(() => new Uint8Array(width)); let x = 0;
      for (const t of tiles) { const w = Math.min(t.width, width - x); for (let xx = 0; xx < w; xx++) { const q = (yy * t.width + xx) * 4; rows[0][x + xx] = t.data[q]; rows[1][x + xx] = t.data[q + 1]; rows[2][x + xx] = t.data[q + 2]; rows[3][x + xx] = t.data[q + 3]; } x += w; }
      for (let c = 0; c < 4; c++) { const p = packBits(rows[c]); bodies[c].push(p); counts[c][y0 + yy] = p.length; }
    }
  }
  const cb = psb ? 4 : 2, channelData = channels.map((_, c) => { const table = new Uint8Array(height * cb), dv = new DataView(table.buffer); for (let y = 0; y < height; y++) psb ? dv.setUint32(y * 4, counts[c][y]) : dv.setUint16(y * 2, counts[c][y]); return new Chunks([u16(1), table, ...bodies[c]]); });
  const extra = cat([u32(0), u32(0), pascal(name), luni(name)]);
  const record = cat([u32(0), u32(0), u32(height), u32(width), u16(4), ...[-1, 0, 1, 2].map((id, i) => cat([u16(id & 0xffff), lenField(channelData[i].length, psb)])), ascii('8BIM'), ascii('norm'), Uint8Array.of(255, 0, 0, 0), u32(extra.length), extra]);
  const liBody = new Chunks([u16(1), record, ...channelData]);
  const layerInfo = new Chunks([lenField(liBody.length, psb), liBody]);
  const layerMask = new Chunks([lenField(layerInfo.length + (psb ? 4 : 4), psb), layerInfo, u32(0)]);
  const header = cat([ascii('8BPS'), u16(psb ? 2 : 1), new Uint8Array(6), u16(4), u32(height), u32(width), u16(8), u16(3), u32(0), u32(0)]);
  const out = new Chunks([header, layerMask, solidComposite(width, height, psb)]), flat = flatten(out.parts); const bytes = new Uint8Array(out.length); let at = 0; for (const p of flat) { bytes.set(p, at); at += p.length; } return bytes.buffer;
}

export default { writeLazyRasterPsd };
