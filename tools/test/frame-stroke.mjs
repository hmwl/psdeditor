

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import crypto from 'node:crypto';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { applyEdits } from '../../core/psd-edit.js';
import { parsePsdDocument } from '../../core/psd-document.js';
import { decodeCompositeImage } from '../../core/psd-image.js';
import { compositeAll, regionizeDoc, vectorStrokeRenderParams } from '../../core/compose.js';
import { buildDrawList, createDrawListState, executeDrawListCPU } from '../../core/render/draw-list.js';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/native-frames.json', import.meta.url))).files['native-frame-rect.psd'];
const native = await parsePsdRaster(inflateSync(Buffer.from(fixture.deflateBase64, 'base64')));
const header = native.layers.find(l => l.frame);
assert.equal(header.vectorStroke.desc.strokeStyleBlendMode.value, 'normal');
const stroke = structuredClone(header.vectorStroke);
Object.assign(stroke.desc, { strokeEnabled: true, strokeStyleLineWidth: { __unit: '#Pxl', value: 10 } });
stroke.desc.strokeStyleContent['Clr '] = { __classID: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 };
assert.ok(vectorStrokeRenderParams(stroke, header.vectorMask));
const divider = { group: { type: 3 }, hidden: false };
const frame = { ...header, vectorStroke: stroke, opacity: 255,
  
  fill: { key: 'SoCo', params: { color: [0, 255, 0] } } };
const doc = { ...native, layers: [divider, frame] };
const W = native.width, H = native.height;
const px = (data, x, y, w = W) => Array.from(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
function check(d) {
  const cpu = compositeAll(d, W, H, new Map()).data;
  const state = createDrawListState(), list = buildDrawList(d, W, H, state);
  assert.deepEqual(executeDrawListCPU(list).data, cpu);
  const cached = buildDrawList(d, W, H, state);
  assert.deepEqual(executeDrawListCPU(cached).data, cpu);
  const sources = ops => ops.flatMap(o => o.k === 'group' ? sources(o.ops) : o.k === 'src' ? [o.src.data] : []);
  assert.deepEqual(sources(cached.ops), sources(list.ops));
  for (let i = 0; i < sources(list.ops).length; i++) assert.equal(sources(cached.ops)[i], sources(list.ops)[i]);
  return cpu;
}
for (const blendMode of ['norm', 'pass']) for (const opacity of [255, 128]) {
  frame.blendMode = blendMode; frame.opacity = opacity;
  const data = check(doc);
  assert.deepEqual(px(data, 200, 175), [0, 0, 0, 0]);
  
  const red = blendMode === 'pass' ? opacity : 255;
  assert.deepEqual(px(data, 200, 100), [red, 0, 0, opacity]);
  assert.deepEqual(px(data, 200, 96), [red, 0, 0, opacity]);
  const cropped = regionizeDoc(doc, W, H, 90, 90, 230, 180);
  const local = compositeAll(cropped, 230, 180, new Map()).data;
  assert.deepEqual(executeDrawListCPU(buildDrawList(cropped, 230, 180)).data, local);
  for (let y = 0; y < 180; y++) for (let x = 0; x < 230; x++) assert.deepEqual(px(local, x, y, 230), px(data, x + 90, y + 90));
}

const content = { name: 'blue', bounds: { left: 0, top: 0, right: W, bottom: H }, width: W, height: H,
  rgba: new Uint8ClampedArray(W * H * 4), opacity: 255, blendMode: 'norm' };
for (let p = 0; p < content.rgba.length; p += 4) content.rgba.set([0, 0, 255, 255], p);
for (const blendMode of ['norm', 'pass']) {
  const data = check({ ...doc, layers: [divider, content, { ...frame, blendMode, opacity: 128 }] });
  const channel = blendMode === 'pass' ? 128 : 255;
  assert.deepEqual(px(data, 200, 175), [0, 0, channel, 128]);
  assert.deepEqual(px(data, 200, 100), [channel, 0, 0, 128]);
  assert.equal(px(data, 50, 50)[3], 0);
}
frame.opacity = 255;
const aligned = structuredClone(frame);
for (const [value, outside, inside] of [['strokeStyleAlignInside', 0, 255], ['strokeStyleAlignOutside', 255, 0]]) {
  aligned.vectorStroke.desc.strokeStyleLineAlignment.value = value;
  const data = check({ ...doc, layers: [divider, aligned] });
  assert.equal(px(data, 200, 96)[3], outside);
  assert.equal(px(data, 200, 103)[3], inside);
}
const hidden = check({ ...doc, layers: [divider, { ...frame, hidden: true }] });
assert.ok(hidden.every(v => v === 0));
const disabled = structuredClone(frame);
disabled.vectorStroke.desc.strokeEnabled = false;
assert.ok(check({ ...doc, layers: [divider, disabled] }).every(v => v === 0));
const ellipseFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/native-frames.json', import.meta.url))).files['native-frame-true-ellipse.psd'];
const ellipseBytes = inflateSync(Buffer.from(ellipseFixture.deflateBase64, 'base64'));
const ellipseIndex = parsePsdDocument(ellipseBytes).layers.findIndex(l => l.frame?.shape === 'ellipse');
const movedEllipse = applyEdits(ellipseBytes, [{ op: 'setFrameRect', index: ellipseIndex, rect: { x: 100, y: 100, w: 200, h: 150 } }]);
const ellipseFrame = (await parsePsdRaster(movedEllipse.buffer)).layers[ellipseIndex];
ellipseFrame.vectorStroke = structuredClone(stroke);
const ellipsePixels = check({ ...doc, layers: [divider, ellipseFrame] });
assert.equal(px(ellipsePixels, 200, 175)[3], 0);
assert.equal(px(ellipsePixels, 200, 100)[3], 255);
assert.equal(px(ellipsePixels, 101, 101)[3], 0);
console.log('✓ native vstk frame outline: hollow center, clipping order, inside/outside, opacity once, norm/pass groups, CPU/draw list/cache/region agreement');



const pair = JSON.parse(fs.readFileSync(new URL('./fixtures/native-frame-stroke.json', import.meta.url)));
function recordedBytes(name) {
  const f = pair.files[name], b = inflateSync(Buffer.from(f.deflateBase64, 'base64'));
  assert.equal(b.length, f.bytes);
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'), f.sha256);
  return b;
}
const candidate = await parsePsdRaster(recordedBytes('psd_editor-frame-stroke-candidate.psd'));
const nativePixels = decodeCompositeImage(recordedBytes('psd_editor-frame-stroke-native.psd')).toRGBA();
const candidatePixels = compositeAll(candidate, candidate.width, candidate.height, new Map()).data;
assert.deepEqual(executeDrawListCPU(buildDrawList(candidate, candidate.width, candidate.height)).data, candidatePixels);
let max = 0, sum = 0, changed = 0;
for (let y = 0; y < candidate.height; y++) for (let x = 0; x < candidate.width; x++) {
  let different = false;
  for (let c = 0; c < 4; c++) {
    const i = (y * candidate.width + x) * 4 + c, delta = Math.abs(candidatePixels[i] - nativePixels[i]);
    
    
    if (x < 205) assert.equal(delta, 0, `native rectangle pixel ${x},${y} channel ${c}`);
    max = Math.max(max, delta); sum += delta; different ||= delta > 0;
  }
  if (different) changed++;
}
const mean = sum / nativePixels.length;
assert.ok(max <= 55 && mean < 0.11 && changed < 650, `ellipse AA residual: max=${max}, mean=${mean}, pixels=${changed}`);
console.log(`✓ Photoshop enabled-stroke composite: rectangle exact; ellipse AA residual max ${max}, mean ${mean.toFixed(6)}, ${changed} pixels`);






const matrixMeta = JSON.parse(fs.readFileSync(new URL('./fixtures/frame-native-20261014/ellipse-stroke-aa-matrix.json', import.meta.url)));
const matrixBytes = fs.readFileSync(new URL('./fixtures/frame-native-20261014/ellipse-stroke-aa-native.psd', import.meta.url));
const matrixDoc = await parsePsdRaster(matrixBytes), matrixNative = decodeCompositeImage(matrixBytes).toRGBA();
const matrixPixels = compositeAll(matrixDoc, matrixDoc.width, matrixDoc.height, new Map()).data;
let matrixSum = 0, matrixMax = 0, matrixChanged = 0;
for (const c of matrixMeta.cases) {
  let localSum = 0, localMax = 0, localChanged = 0;
  for (let y = c.bounds.top; y < c.bounds.bottom; y++) for (let x = c.bounds.left; x < c.bounds.right; x++) {
    let pixelChanged = false;
    for (let channel = 0; channel < 3; channel++) {
      const i = (y * matrixDoc.width + x) * 4 + channel, delta = Math.abs(matrixPixels[i] - matrixNative[i]);
      localSum += delta; localMax = Math.max(localMax, delta); pixelChanged ||= delta > 0;
    }
    if (pixelChanged) localChanged++;
  }
  
  
  assert.ok(localMax <= 51 && localSum < 21000, `${c.name}: max=${localMax} sum=${localSum}`);
  matrixSum += localSum; matrixMax = Math.max(matrixMax, localMax); matrixChanged += localChanged;
}
assert.ok(matrixSum < 260000 && matrixMax <= 51);
console.log(`✓ Photoshop ellipse matrix 36 cases: max ${matrixMax}, sum ${matrixSum}, changed pixels ${matrixChanged}`);
