import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createLayerTileSession, decodeLayerJob, readLazyLayerPixel, readLazyLayerTile, readLazyLayerRectChannels } from '../../core/psd-raster.js';
import { createZipLayerSession } from '../../core/psd-zip-cache.js';

const w = 4, h = 3;
function rlePlane(rows){
  const body = [0, 1], counts = [], parts = [];
  for (const row of rows) { const p = [row.length - 1, ...row]; counts.push(p.length); parts.push(p); }
  for (const n of counts) body.push(n >> 8, n & 255);
  for (const p of parts) body.push(...p);
  const offsets = new Float64Array(h); let o = 2 + h * 2;
  for (let y = 0; y < h; y++) { offsets[y] = o; o += counts[y]; }
  return { bytes: Uint8Array.from(body), width: w, height: h, depth: 8, bps: 1, rowBytes: w, comp: 1, psb: false, counts: Uint32Array.from(counts), offsets, rows: new Map() };
}
const p = (a, b, c) => ({
  0: rlePlane(a), 1: rlePlane(b), 2: rlePlane(c), '-1': rlePlane([[255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255]]),
});
const layer = { width: w, height: h, lazyChannels: p(
  [[10, 20, 30, 40], [50, 60, 70, 80], [90, 100, 110, 120]],
  [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
  [[200, 201, 202, 203], [204, 205, 206, 207], [208, 209, 210, 211]],
) };
assert.deepEqual(readLazyLayerPixel(layer, 2, 1, 3), [70, 7, 206, 255]);
const tile = readLazyLayerTile(layer, 0, 0, 3, 2);
assert.equal(tile.width, 2); assert.equal(tile.height, 2);
assert.deepEqual([...tile.data.slice(4, 8)], [20, 2, 201, 255]);
assert.equal(layer.lazyChannels[0].rows.size <= 3, true);
assert.equal(readLazyLayerTile(layer, 0, 0, 3).width, 4, 'tile sizes must not alias the same cache entry');
const cropped = readLazyLayerRectChannels(layer, 1, 1, 2, 2);
assert.equal(cropped.reduce((n, c) => n + c.view.length, 0), 4 * (2 + 2 * 2));
const croppedRGBA = await decodeLayerJob({ width: 2, height: 2, depth: 8, mode: 3, chans: cropped.map(c => ({ ...c, bytes: c.view })), maskInfo: {}, geo: { bounds: { left: 0, top: 0 } } });
assert.deepEqual([...croppedRGBA.rgba.slice(0, 4)], [60, 6, 205, 255]);
const repeated = { width: 10, height: 1, lazyChannels: { 0: { comp: 1, bps: 1, rowBytes: 10,
  bytes: new Uint8Array([0, 1, 0, 9, 128, 253, 10, 2, 20, 21, 22, 254, 30]), offsets: [4], counts: [9] } } };
assert.deepEqual([...readLazyLayerRectChannels(repeated, 2, 0, 6, 1)[0].view], [0, 0, 10, 10, 20, 21, 22, 30]);
console.log('✓ lazy Raw/RLE rows and reusable viewport tiles');



const zw = 8, zh = 4;
function zipPlane(fn, prediction = false){
  const raw = new Uint8Array(zw * zh);
  for (let y = 0; y < zh; y++) {
    let prev = 0;
    for (let x = 0; x < zw; x++) { const v = fn(x, y) & 255; raw[y * zw + x] = prediction ? (v - prev + 256) & 255 : v; prev = v; }
  }
  return Uint8Array.from([0, prediction ? 3 : 2, ...deflateSync(raw)]);
}
const zr = await decodeLayerJob({ width: zw, height: zh, depth: 8, mode: 3, previewMax: 4,
  chans: [
    { id: 0, bytes: zipPlane((x, y) => x + y * 10, true), w: zw, h: zh },
    { id: 1, bytes: zipPlane((x, y) => 40 + x + y * 10, false), w: zw, h: zh },
    { id: 2, bytes: zipPlane((x, y) => 80 + x + y * 10, false), w: zw, h: zh },
  ], maskInfo: {}, geo: { bounds: { left: 0, top: 0 }, width: zw, height: zh } });
assert.equal(zr.rgba, null); assert.equal(zr.preview.width, 4); assert.equal(zr.preview.height, 2);
assert.deepEqual([...zr.preview.data.slice(0, 4)], [0, 40, 80, 255]);
assert.deepEqual([...zr.preview.data.slice((1 * 4 + 3) * 4, (1 * 4 + 3) * 4 + 4)], [26, 66, 106, 255]);
console.log('✓ ZIP/ZIP-prediction preview streams rows and returns a bounded proxy');




const sw = 768, sh = 640, sessionChannels = [];
const channelValue = (c, x, y) => c === -1 ? 80 + ((x + y) % 176) : (x * (c + 1) + y * (c + 3)) & 255;
for (const c of [0, 1, 2, -1]) {
  const prediction = c === 0 || c === -1, raw = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    let prev = 0;
    for (let x = 0; x < sw; x++) { const v = channelValue(c, x, y); raw[y * sw + x] = prediction ? (v - prev + 256) & 255 : v; prev = v; }
  }
  sessionChannels.push({ id: c, w: sw, h: sh, bytes: Uint8Array.from([0, prediction ? 3 : 2, ...deflateSync(raw)]) });
}
const stats = {}, rowBudget = sw * 4 * 256;
const session = createZipLayerSession(sessionChannels, { rowBudget, stats });
const sessionJob = (x, y, width = 256, height = 256) => ({ width: sw, height: sh, mode: 3, depth: 8, zipTile: true, tile: { x, y, width, height } });
const checkTile = async (job, decoder = session) => {
  const r = await decodeLayerJob(job, decoder), t = r.tile;
  assert.equal(r.rgba, null);
  const ref = new Uint8ClampedArray(t.width * t.height * 4);
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
    const o = (y * t.width + x) * 4;
    for (let c = 0; c < 4; c++) ref[o + c] = channelValue(c === 3 ? -1 : c, x + t.x, y + t.y);
  }
  assert.deepEqual(t.data, ref);
  assert.ok(decoder.rowBytes <= rowBudget);
};
await checkTile(sessionJob(0, 64));
const afterFirst = { ...stats };
await checkTile(sessionJob(256, 64));
assert.equal(stats.rowsRead, afterFirst.rowsRead); assert.equal(stats.streamStarts, afterFirst.streamStarts);
assert.equal(stats.rowHits, 256 * 4);
await checkTile(sessionJob(256, 320));
assert.equal(stats.rowsRead, afterFirst.rowsRead + 256 * 4);
await checkTile(sessionJob(512, 64));
assert.equal(stats.streamStarts, afterFirst.streamStarts + 4);
await checkTile(sessionJob(700, 600));
session.clearRows(); assert.equal(session.rowBytes, 0);
await checkTile(sessionJob(256, 64));
session.close(); assert.equal(session.rowBytes, 0);
await assert.rejects(() => session.tile(sessionJob(0, 0)), /已关闭/);
const tiny = createZipLayerSession(sessionChannels, { rowBudget: 1 });
await checkTile(sessionJob(10, 10, 8, 8), tiny); assert.equal(tiny.rowBytes, 0); tiny.close();
console.log('✓ ZIP 会话相邻瓦片复用行缓存，向前增量解压，回退/边缘/预算回收像素一致');

for (const depth of [8, 16]) for (const psb of [false, true]) {
  const value = (c, x, y) => c === -1 ? (depth === 8 ? 255 : 65535) : ((c + 1) * (x + y * 4) * 193) % (depth === 8 ? 256 : 65536);
  const chans = [0, 1, 2, -1].map(c => {
    const comp = c === 0 || c === 2 ? 0 : 1, rowBytes = 4 * depth / 8, raw = new Uint8Array(rowBytes * 3);
    const dv = new DataView(raw.buffer);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      if (depth === 8) raw[y * rowBytes + x] = value(c, x, y); else dv.setUint16(y * rowBytes + x * 2, value(c, x, y));
    }
    if (!comp) return { id: c, w: 4, h: 3, bytes: Uint8Array.from([0, 0, ...raw]) };
    const header = new Uint8Array(2 + 3 * (psb ? 4 : 2)), h = new DataView(header.buffer); h.setUint16(0, 1);
    for (let y = 0; y < 3; y++) { if (psb) h.setUint32(2 + y * 4, rowBytes + 1); else h.setUint16(2 + y * 2, rowBytes + 1); }
    const parts = [...header]; for (let y = 0; y < 3; y++) parts.push(rowBytes - 1, ...raw.subarray(y * rowBytes, (y + 1) * rowBytes));
    return { id: c, w: 4, h: 3, bytes: Uint8Array.from(parts) };
  });
  const stats = {}, session = createLayerTileSession(chans, { rowBudget: 512, stats });
  const job = { width: 4, height: 3, mode: 3, depth, psb, zipTile: true, tile: { x: 1, y: 1, width: 2, height: 2 } };
  const tile = (await decodeLayerJob(job, session)).tile;
  const lazyChannels = Object.fromEntries(chans.map(ch => {
    const counts = new Uint32Array(3), offsets = new Float64Array(3), rowBytes = 4 * depth / 8, comp = new DataView(ch.bytes.buffer).getUint16(0);
    let offset = 2 + 3 * (psb ? 4 : 2);
    for (let y = 0; y < 3; y++) { counts[y] = rowBytes + 1; offsets[y] = offset; offset += rowBytes + 1; }
    return [ch.id, { bytes: ch.bytes, comp, psb, bps: depth / 8, width: 4, height: 3, rowBytes, counts, offsets, dataOffset: 2 }];
  }));
  const small = readLazyLayerRectChannels({ width: 4, height: 3, lazyChannels }, 1, 1, 2, 2);
  assert.equal(small.reduce((n, c) => n + c.view.length, 0), 4 * (2 + 2 * 2 * depth / 8));
  const exact = await decodeLayerJob({ width: 2, height: 2, mode: 3, depth, chans: small.map(c => ({ ...c, bytes: c.view })), maskInfo: {}, geo: { bounds: { left: 0, top: 0 } } });
  assert.deepEqual(exact.rgba, tile.data);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) for (let c = 0; c < 4; c++) {
    assert.equal(tile.data[(y * 2 + x) * 4 + c], Math.round(value(c === 3 ? -1 : c, x + 1, y + 1) * (depth === 8 ? 1 : 255 / 65535)));
  }
  const read = stats.rowsRead; await decodeLayerJob({ ...job, tile: { ...job.tile, x: 0 } }, session);
  assert.equal(stats.rowsRead, read); assert.equal(stats.rowHits, 8);
  session.clearRows(); assert.equal(session.rowBytes, 0); session.close();
}
console.log('✓ Raw/RLE 常驻行索引：PSD/PSB、8/16 位矩形读取与复用');
