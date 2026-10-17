import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import crypto from 'node:crypto';
import { applyEdits, planEdits } from '../../core/psd-edit.js';
import { writePsd } from '../../core/psd-write.js';
import { parsePsdDocument, serializePsdDocument } from '../../core/psd-document.js';
import { parseLayerTree } from '../../core/psd-parse.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { getVectorMaskPath } from '../../core/psd-edit-path.js';
import { frameInfoOf } from '../../core/psd-frame.js';
import { compositeAll } from '../../core/compose.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/native-frames.json', import.meta.url), 'utf8'));
function nativeBytes(name) {
  const fixture = fixtures.files[name], bytes = inflateSync(Buffer.from(fixture.deflateBase64, 'base64'));
  assert.equal(bytes.length, fixture.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
  return bytes;
}
for (const file of ['native-frame-rect.psd', 'native-frame-content.psd', 'native-frame-true-ellipse.psd']) {
  const bytes = nativeBytes(file), doc = parsePsdDocument(bytes);
  assert.deepEqual(Buffer.from(serializePsdDocument(doc)), bytes);
  assert.deepEqual(doc.warnings, []);
  for (const layer of doc.layers.filter(l => l.frame)) {
    assert.equal(layer.additional.frgb._kind, 'semantic');
    assert.deepEqual(layer.frame, frameInfoOf(layer.additional.frgb));
    assert.ok(layer.groupType === 1 || layer.groupType === 2);
  }
}
const ellipseNative = parsePsdDocument(nativeBytes('native-frame-true-ellipse.psd')).layers.find(l => l.frame?.shape === 'ellipse');
assert.equal(ellipseNative.frame.type, 3);
assert.equal(ellipseNative.additional.vogk.desc.keyDescriptorList[0].keyOriginType, 5);
const nativeRaster = await parsePsdRaster(nativeBytes('native-frame-true-ellipse.psd'));
assert.ok(nativeRaster.layers.filter(l => l.frame).every(l => l.mask === null));
console.log('✓ native rect/content/ellipse PSDs retain byte-exact round trips; frgb is semantic and ellipse type is 3');

const rgba = new Uint8Array(80 * 60 * 4).fill(255);
const base = writePsd({ width: 80, height: 60, layers: [{ name: 'Background', bounds: { top: 0, left: 0, bottom: 60, right: 80 }, rgba }], composite: rgba });
const operations = [
  { op: 'addFrameLayer', name: 'Rectangle', rect: { x: 5, y: 8, w: 30, h: 20 } },
  { op: 'addFrameLayer', name: 'Ellipse', shape: 'ellipse', rect: { x: -10, y: 30, w: 25, h: 22 } },
];
const created = applyEdits(base, operations), doc = parsePsdDocument(created.buffer);
const planned = planEdits(base, [...operations, { op: 'setFrameRect', index: 4, rect: { x: 1, y: 2, w: 10, h: 15 } }]);
assert.equal(planned.ok, true);
assert.equal(planned.layerCount, 5);
assert.deepEqual(created.warnings, []);
assert.equal(doc.layers.length, 5);
for (const [result, expected] of created.results.map((r, i) => [r, operations[i]])) {
  const layer = doc.layers[result.index];
  assert.equal(layer.groupType, 1);
  assert.equal(doc.layers[result.dividerIndex].groupType, 3);
  assert.equal(layer.additional.lnsr.nameSource, 'fram');
  assert.equal(layer.blend.key, 'norm');
  assert.deepEqual(layer.frame.rect, expected.rect);
  assert.equal(layer.frame.shape, expected.shape || 'rect');
  assert.equal(layer.additional.SoCo, undefined);
  assert.equal(layer.mask.present, false);
}
const tree = parseLayerTree(created.buffer), raster = await parsePsdRaster(created.buffer);
assert.deepEqual(tree.flat.filter(l => l.isFrame).map(l => l.frame), doc.layers.filter(l => l.isFrame).map(l => l.frame));
assert.equal(raster.layers.filter(l => l.layerType === 'frame').length, 2);
assert.ok(getVectorMaskPath(created.buffer, 4).subpaths[0].knots.every(k => k.linked));
console.log('✓ new rectangle and ellipse are native framed groups across full/tree/raster parsers, including negative coordinates');

const red = rgba.slice();
for (let p = 0; p < red.length; p += 4) { red[p + 1] = 0; red[p + 2] = 0; }
const contentBase = writePsd({ width: 80, height: 60, layers: [
  { name: 'White', bounds: { top: 0, left: 0, bottom: 60, right: 80 }, rgba },
  { name: 'Content', bounds: { top: 0, left: 0, bottom: 60, right: 80 }, rgba: red },
], composite: red });
const framedContent = applyEdits(contentBase, [
  { op: 'addFrameLayer', at: 1, shape: 'ellipse', rect: { x: 10, y: 10, w: 50, h: 40 } },
  { op: 'reorderLayers', order: [0, 1, 3, 2] },
]);
const pixels = compositeAll(await parsePsdRaster(framedContent.buffer), 80, 60, new Map()).data;
const pixel = (x, y) => Array.from(pixels.subarray((y * 80 + x) * 4, (y * 80 + x) * 4 + 4));
assert.deepEqual(pixel(35, 30), [255, 0, 0, 255]);
assert.deepEqual(pixel(11, 11), [255, 255, 255, 255]);
assert.deepEqual(pixel(3, 3), [255, 255, 255, 255]);
console.log('✓ frame children compose through the native ellipse path without clipping flags or duplicate raster-mask alpha');

const contentBytes = nativeBytes('native-frame-content.psd'), before = parsePsdDocument(contentBytes);
const index = before.layers.findIndex(l => l.frame?.savedIteratedName), target = { x: 310, y: 75, w: 210, h: 230 };
const resized = applyEdits(contentBytes, [{ op: 'setFrameRect', index, rect: target }]), after = parsePsdDocument(resized.buffer);
assert.deepEqual(after.layers[index].frame.rect, target);
assert.equal(after.layers[index].mask.present, false);
assert.ok(after.layers[index].channels.every(c => c.id !== -2 && c.id !== -3));
for (const key of ['PlLd', 'SoLd']) assert.deepEqual(Buffer.from(after.layers[index - 1].additionalBlocks.find(b => b.key === key)._raw), Buffer.from(before.layers[index - 1].additionalBlocks.find(b => b.key === key)._raw));
assert.equal(after.layers[index - 1].blend.clipping, 0);
const path = getVectorMaskPath(resized.buffer, index, { units: 'pixel' }).subpaths[0].knots.map(k => k.anchor);
assert.ok(Math.abs(path[0][0] - target.x) < 0.001 && Math.abs(path[0][1] - target.y) < 0.001);
assert.deepEqual(Buffer.from(applyEdits(resized.buffer, [{ op: 'setFrameRect', index, rect: target }]).buffer), Buffer.from(resized.buffer));
console.log('✓ resizing updates descriptor/path/origin, removes stale derived masks, and preserves embedded child bytes');

assert.equal(planEdits(base, [{ op: 'addFrameLayer', shape: 'toString', rect: { x: 0, y: 0, w: 5, h: 5 } }]).ok, false);
assert.throws(() => applyEdits(base, [{ op: 'addFrameLayer', rect: { x: 0, y: 0, w: 0, h: 5 } }]), /rect/);
assert.throws(() => applyEdits(base, [{ op: 'setFrameRect', index: 0, rect: { x: 0, y: 0, w: 5, h: 5 } }]), /frgb/);
console.log('✓ invalid dimensions, unknown shapes and editing nonframes are rejected');
