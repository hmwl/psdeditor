import assert from 'node:assert/strict';
import { writePsd, rebuildPsdReplacingLayerPixels } from '../../core/psd-write.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { convertDocument } from '../../core/doc-mode.js';
import { sRGBProfile } from '../../core/icc.js';
const width = 1024, height = 1, bounds = { left: 0, top: 0, right: width, bottom: height };
const rgba = new Uint8Array(width * 4).fill(255);
const base = writePsd({ width, height, layers: [{ name: 'native', bounds, rgba }], composite: rgba });
for (const depth of [16, 32]) {
  const buffer = convertDocument(base, { mode: 'rgb', depth }, { srcProfile: sRGBProfile(), dstProfile: sRGBProfile() }).buffer;
  const planes = {};
  for (const id of [0, 1, 2, -1]) {
    const values = depth === 16 ? new Uint16Array(width) : new Float32Array(width);
    for (let i = 0; i < width; i++) values[i] = id === -1 ? (depth === 16 ? 32768 : 1) : depth === 16 ? i + id * 2048 : (i - 128) / 64 + id;
    planes[id] = values;
  }
  const original = new Uint8Array(buffer).slice();
  const result = rebuildPsdReplacingLayerPixels(buffer, 0, rgba, bounds, null, { nativePlanes: planes });
  const doc = await parsePsdRaster(result, { keepNativePlanes: true, strictChannels: true });
  for (const id of [0, 1, 2, -1]) assert.deepEqual(doc.layers[0].nativePlanes[id], planes[id], `${depth} 位样本必须原精度往返`);
  assert.deepEqual(new Uint8Array(buffer), original, '不得修改原文件');
  assert.equal(new Set(doc.layers[0].nativePlanes[0]).size, width, '不能合并为256档');
  if (depth === 32) { assert.ok(doc.layers[0].nativePlanes[0][0] < 0); assert.ok(doc.layers[0].nativePlanes[0].at(-1) > 1); }
  assert.throws(() => rebuildPsdReplacingLayerPixels(buffer, 0, rgba, bounds, null, { nativePlanes: { ...planes, 0: new Uint8Array(width) } }), /类型/);
}
console.log('✓ 16 位1024档及32位负值/HDR原生通道编辑往返与输入不变');
