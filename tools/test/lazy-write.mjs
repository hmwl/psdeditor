import assert from 'node:assert/strict';
import { writeLazyRasterPsd } from '../../core/psd-lazy-write.js';
import { parsePsdFull } from '../../core/psd-parse.js';

const W = 512, H = 512;
const base = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4;
  base[o] = x & 255; base[o + 1] = y & 255; base[o + 2] = (x + y) & 255; base[o + 3] = 255;
}
const red = new Uint8ClampedArray(50 * 50 * 4);
for (let i = 0; i < red.length; i += 4) { red[i] = 255; red[i + 3] = 255; }
const green = { x: 300, y: 300, width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) };
for (let i = 0; i < green.data.length; i += 4) { green.data[i + 1] = 255; green.data[i + 3] = 255; }

let readCalls = 0;
const buf = await writeLazyRasterPsd({
  width: W, height: H, name: '底图', psb: false,
  readTile: async (x, y) => {
    readCalls++;
    const w = Math.min(256, W - x), h = Math.min(256, H - y);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(base.subarray(((y + yy) * W + x) * 4, ((y + yy) * W + x + w) * 4), yy * w * 4);
    return { x, y, width: w, height: h, data };
  },
  opacity: 200, blend: 'mul ', fillOpacity: 230,
  extraLayers: [
    { name: '红色', rgba: red, bounds: { top: 100, left: 100, bottom: 150, right: 150 }, opacity: 180 },
    { name: '绿色', bounds: { top: 300, left: 300, bottom: 400, right: 400 }, hidden: true,
      readTile: async (x, y) => x <= 300 && x + 256 > 300 && y <= 300 && y + 256 > 300 ? green : null },
  ],
});

const parsed = parsePsdFull(buf);
assert.equal(parsed.header.width, W);
assert.equal(parsed.header.height, H);
assert.equal(parsed.layers.length, 3, '底层 + 普通附加层 + 流式附加层');
assert.ok(readCalls > 0);
const nm = l => l.unicodeName || l.name;
const baseLayer = parsed.layers.find(l => nm(l) === '底图');
const redLayer = parsed.layers.find(l => nm(l) === '红色');
const greenLayer = parsed.layers.find(l => nm(l) === '绿色');
assert.ok(baseLayer && redLayer && greenLayer, parsed.layers.map(nm).join(','));
assert.deepEqual(baseLayer.bounds, { top: 0, left: 0, bottom: H, right: W });
assert.deepEqual(redLayer.bounds, { top: 100, left: 100, bottom: 150, right: 150 });
assert.deepEqual(greenLayer.bounds, { top: 300, left: 300, bottom: 400, right: 400 });
assert.equal(baseLayer.opacity, 200);
assert.equal(redLayer.opacity, 180);
assert.ok(greenLayer.flags & 2, '隐藏附加层要保留 hidden 标记');
const chSum = l => (l.channelLengths || []).reduce((a, b) => a + b, 0);
assert.ok(chSum(baseLayer) > 0);
assert.ok(chSum(redLayer) > 0);
assert.ok(chSum(greenLayer) > 0, '偏移流式层的通道不能是空的');
console.log('✓ 惰性 PSD 写回：底层属性、普通附加层、偏移流式附加层与隐藏标记');
