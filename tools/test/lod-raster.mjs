import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createLodAccumulator, lodForScale } from '../../core/psd-lod.js';
import { createLayerTileSession, decodeLayerJob } from '../../core/psd-raster.js';

const W = 131, H = 67;
for (const k of [2,4,8,16,32,64]) for (const e of [-Number.EPSILON,0,Number.EPSILON]) assert.equal(lodForScale(1/k+e),k);
assert.equal(lodForScale(.51),1);assert.equal(lodForScale(.26),2);assert.equal(lodForScale(.01),64);assert.equal(lodForScale(NaN),1);
const value = (c, x, y) => c === -1 ? ((x ^ y) % 4 === 0 ? 0 : (x * 5 + y * 3) & 255) : (x * 17 + y * 11 + c * 37) & 255;
function reference(x, y, w, h, scale) {
  const sw = Math.ceil(w / scale), sh = Math.ceil(h / scale), out = new Uint8ClampedArray(sw * sh * 4);
  for (let py = 0; py < sh; py++) for (let px = 0; px < sw; px++) {
    const sum = [0, 0, 0, 0]; let count = 0;
    for (let dy = 0; dy < scale && py * scale + dy < h; dy++) for (let dx = 0; dx < scale && px * scale + dx < w; dx++) {
      const sx = x + px * scale + dx, sy = y + py * scale + dy, a = value(-1, sx, sy);
      for (let c = 0; c < 3; c++) sum[c] += value(c, sx, sy) * a;
      sum[3] += a; count++;
    }
    const o = (py * sw + px) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = sum[3] ? Math.round(sum[c] / sum[3]) : 0;
    out[o + 3] = Math.round(sum[3] / count);
  }
  return out;
}
function channels(comp, depth = 8, psb = false) {
  return [0, 1, 2, -1].map(c => {
    const rowBytes = W * depth / 8, raw = new Uint8Array(rowBytes * H), dv = new DataView(raw.buffer);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = value(c, x, y); if (depth === 8) raw[y * W + x] = v; else dv.setUint16(y * rowBytes + x * 2, v * 257);
    }
    let bytes;
    if (comp === 0) bytes = Uint8Array.from([0, 0, ...raw]);
    else if (comp === 1) {
      const header = new Uint8Array(2 + H * (psb ? 4 : 2)), hd = new DataView(header.buffer), body = []; hd.setUint16(0, 1);
      for (let y = 0; y < H; y++) {
        const row = []; for (let x = 0; x < rowBytes; x += 128) { const n = Math.min(128, rowBytes - x); row.push(n - 1, ...raw.subarray(y * rowBytes + x, y * rowBytes + x + n)); }
        if (psb) hd.setUint32(2 + y * 4, row.length); else hd.setUint16(2 + y * 2, row.length); body.push(...row);
      }
      bytes = Uint8Array.from([...header, ...body]);
    } else {
      if (comp === 3) for (let y = 0; y < H; y++) for (let x = W - 1; x > 0; x--) raw[y * W + x] = (raw[y * W + x] - raw[y * W + x - 1]) & 255;
      bytes = Uint8Array.from([0, comp, ...deflateSync(raw)]);
    }
    return { id: c, w: W, h: H, bytes };
  });
}
for (const comp of [0, 1, 2, 3]) for (const depth of comp < 2 ? [8, 16] : [8]) for (const psb of [false, true]) {
  const chans = channels(comp, depth, psb), stats = {}, budget = 16000, session = createLayerTileSession(chans, { rowBudget: budget, stats });
  const job = (x, y, scale, size = 16 * scale) => ({ chans, width: W, height: H, depth, psb, mode: 3, zipTile: true, tile: { x, y, width: size, height: size, scale } });
  for (const scale of [2, 4, 8, 64]) {
    const a = await decodeLayerJob(job(0, 0, scale), session);
    assert.deepEqual(a.tile.data, reference(0, 0, Math.min(16 * scale, W), Math.min(16 * scale, H), scale));
    assert.equal(a.rgba, null); assert.ok(session.rowBytes <= budget);
    const before = { ...stats }, edgeX = Math.floor((W - 1) / (16 * scale)) * 16 * scale, edgeY = Math.floor((H - 1) / (16 * scale)) * 16 * scale;
    if (edgeX > 0) {
      const b = await decodeLayerJob(job(edgeX, 0, scale), session);
      assert.deepEqual(b.tile.data, reference(edgeX, 0, W - edgeX, Math.min(16 * scale, H), scale));
      assert.equal(stats.rowsRead, before.rowsRead, 'horizontal LOD tiles must reuse filtered whole rows');
      assert.equal(stats.streamStarts, before.streamStarts);
    }
    const edge = await decodeLayerJob(job(edgeX, edgeY, scale), session);
    assert.deepEqual(edge.tile.data, reference(edgeX, edgeY, W - edgeX, H - edgeY, scale));
    assert.ok(session.rowBytes <= budget);
  }
  const native = await decodeLayerJob({ ...job(0, 0, 1), tile: { x: 0, y: 0, width: 16, height: 16 } }, session);
  assert.deepEqual(native.tile.data.slice(0, 4), new Uint8ClampedArray([0, 37, 74, 0]), 'native RGBA remains straight and exact');
  assert.ok(session.rowBytes <= budget); session.close(); assert.equal(session.rowBytes, 0);
}
const acc = createLodAccumulator(3, 3, 2), rgba = new Uint8ClampedArray(3 * 3 * 4);
for (let i = 0; i < 9; i++) rgba.set(i === 0 ? [255, 0, 0, 255] : [0, 0, 255, 0], i * 4);
acc.add(rgba.subarray(0, 12), 1); acc.add(rgba.subarray(12), 2);
assert.deepEqual([...acc.finish().data.slice(0, 4)], [255, 0, 0, 64], 'invisible blue must not tint visible red');
assert.throws(() => createLodAccumulator(3, 3, 3), /二次幂/);
const incomplete = createLodAccumulator(3, 3, 2); assert.throws(() => incomplete.finish(), /尚未完整/);
assert.throws(() => incomplete.add(rgba, 3, 1), /顺序/);
const white = createLodAccumulator(64,64,64); white.add(new Uint8ClampedArray(64*64*4).fill(255),64);
assert.deepEqual([...white.finish().data],[255,255,255,255],'maximum premultiplied block sum fits uint32 without overflow');
await assert.rejects(() => decodeLayerJob({ width: W, height: H, depth: 8, mode: 3, zipTile: true, tile: { x: 0, y: 0, width: 32, height: 32, scale: 2 }, chans: [{ id: -2, w: W, h: H, bytes: channels(0)[0].bytes }] }), /不支持/);
console.log('✓ 8/16 位 Raw/RLE、ZIP/Prediction 分级瓦片，预乘 alpha、奇数边缘、水平复用与有界条带');
