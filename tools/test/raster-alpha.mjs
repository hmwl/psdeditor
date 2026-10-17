import assert from 'node:assert/strict';
import { sampleBilinear, createCPUBackend } from '../../core/render/cpu.js';

const px = new Float64Array(4);
for (const hidden of [[0, 0, 0, 0], [0, 255, 255, 0], [255, 255, 255, 0]]) {
  const image = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, ...hidden]) };
  sampleBilinear(image, .5, .5, false, px);
  assert.deepEqual([...px], [255, 0, 0, 127.5], '透明像素隐藏颜色不得污染可见边缘');
  sampleBilinear(image, 1, .5, false, px);
  assert.deepEqual([...px], [0, 0, 0, 0]);
  sampleBilinear(image, 0, .5, true, px);
  assert.deepEqual([...px], [255, 0, 0, 127.5], 'repeat 接缝使用同一预乘插值');
}
const mesh = { positions: new Float32Array([0,0,4,0,4,4,0,4]), uvs: new Float32Array([0,0,1,0,1,1,0,1]) };
for (const indices of [[0,1,2,0,2,3], [2,1,0,3,2,0], [0,1,3,1,2,3]]) {
  const out = createCPUBackend().render({ width: 4, height: 4,
    image: { width: 1, height: 1, data: new Uint8Array([255, 50, 0, 128]) },
    mesh: { ...mesh, indices: new Uint32Array(indices) }, placement: [1,0,0,0,1,0,0,0,1] });
  for (let i = 0; i < out.length; i += 4) assert.deepEqual([...out.slice(i, i + 4)], [255,50,0,128], '共享边不得双重覆盖，反向 winding 不得留下裂缝');
}
console.log('✓ 透明隐藏 RGB、repeat 边界及三种剖分的半透明共享边');
