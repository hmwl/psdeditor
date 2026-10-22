import assert from 'node:assert/strict';
import fs from 'node:fs';
import { writePsd, rebuildPsdReplacingLayerPixels, replacePsdCompositeImage } from '../../core/psd-write.js';
import { applyEdits } from '../../core/psd-edit.js';
import { parsePsdDocument, serializePsdDocument, decodeLayerPixels } from '../../core/psd-document.js';
import { parseLayerTree, parsePsdFull } from '../../core/psd-parse.js';
import { parsePsdRaster, recomposeLayerRGBA, decodeLayerJob } from '../../core/psd-raster.js';
import { decodeCompositeImage, encodeCompositeImage, encodeChannel, readSections, hasMergedTransparency } from '../../core/psd-image.js';
import { featherDensityPlane } from '../../core/mask-feather.js';
import { multiplyLayerMask } from '../../core/compose.js';
import { layerMaskPlane, createDrawListState } from '../../core/render/draw-list.js';

const bounds = { left: 7, top: 9, right: 10, bottom: 11 };
const rgba = new Uint8ClampedArray(24).fill(255), maskBounds = { left: 8, top: 9, right: 11, bottom: 11 };
const gray = new Uint8Array([255, 128, 0, 64, 255, 0]);
const source = writePsd({ width: 16, height: 16, layers: [{ name: 'offset layer', bounds, rgba }] });
const alpha = data => Array.from(data).filter((_, i) => i % 4 === 3);
let linked;
for (const relative of [false, true]) {
  const bytes = applyEdits(source, [
    { op: 'addLayerMask', index: 0, bounds: maskBounds, gray, defaultColor: 0 },
    { op: 'setMaskProps', index: 0, relative },
  ]).buffer;
  const doc = await parsePsdRaster(bytes, { keepPlanes: 'mask' }), layer = doc.layers[0];
  assert.deepEqual(alpha(layer.rgba), [0, 255, 128, 0, 64, 255], 'same-size mask with different origin must be placed');
  assert.equal(layer.mask.left, relative ? 1 : 8);
  assert.equal(parseLayerTree(bytes).flat[0].mask.left, layer.mask.left);
  assert.deepEqual(recomposeLayerRGBA(layer, 3), layer.rgba);
  const gpuMask = layerMaskPlane(createDrawListState(), layer.mask, 16, 16, bounds.top, bounds.left);
  assert.deepEqual([gpuMask[9 * 16 + 7], gpuMask[9 * 16 + 8], gpuMask[9 * 16 + 9]], [0, 255, 128]);
  const raw = parsePsdDocument(bytes);
  assert.equal(raw.layerInfo.layers[0].mask.left, 8, 'lossless model keeps disk coordinates');
  assert.deepEqual(decodeLayerPixels(raw, bytes, 0).toRGBA(), layer.rgba);
  const applied = await parsePsdRaster(applyEdits(bytes, [{ op: 'applyLayerMask', index: 0 }]).buffer);
  assert.deepEqual(applied.layers[0].rgba, layer.rgba, 'destructive apply agrees with preview');
  const rewritten = rebuildPsdReplacingLayerPixels(bytes, 0, layer.rgba, bounds, null, { premultiplied: true });
  assert.deepEqual((await parsePsdRaster(rewritten)).layers[0].rgba, layer.rgba, 'unmultiply and reload agree');
  const feathered = applyEdits(bytes, [{ op: 'setMaskProps', index: 0, feather: 1.5, density: 170 }]).buffer;
  const f = (await parsePsdRaster(feathered, { keepPlanes: 'mask' })).layers[0];
  const want = featherDensityPlane({ gray, width: 3, height: 2, ...maskBounds, defaultColor: 0 }, { ...bounds, width: 3, height: 2 }, 1.5, 170);
  assert.deepEqual(alpha(f.rgba), [...want.gray]);
  assert.deepEqual(recomposeLayerRGBA(f, 3), f.rgba);
  const featherSaved = rebuildPsdReplacingLayerPixels(feathered, 0, f.rgba, bounds, null, { premultiplied: true });
  assert.deepEqual((await parsePsdRaster(featherSaved)).layers[0].rgba, f.rgba, 'feather and density survive pixel writeback');
  if (relative) linked = bytes;
}


const layer = (await parsePsdRaster(linked, { keepPlanes: 'mask' })).layers[0];
const movedBounds = { left: 12, top: 13, right: 15, bottom: 15 };
const movedMask = { left: 13, top: 13, right: 16, bottom: 15 };
const moved = applyEdits(linked, [{ op: 'replaceLayerMask', index: 0, bounds: movedMask, gray }]).buffer;
const saved = rebuildPsdReplacingLayerPixels(moved, 0, rgba, movedBounds, null);
assert.deepEqual((await parsePsdRaster(saved)).layers[0].rgba, layer.rgba);
const baked = rebuildPsdReplacingLayerPixels(linked, 0, new Uint8ClampedArray(5 * 4 * 4).fill(255), { left: 6, top: 8, right: 11, bottom: 12 }, null, { maskOriginDelta: { left: 1, top: 1 } });
assert.equal(parsePsdDocument(baked).layerInfo.layers[0].mask.left, 8);
const preview = new Uint8ClampedArray(24).fill(255);
multiplyLayerMask(preview, 3, 2, movedBounds.left, movedBounds.top, layer.mask, movedBounds.top, movedBounds.left);
assert.deepEqual(alpha(preview), alpha(layer.rgba));

for (const defaultColor of [0, 255]) {
  const doc = parsePsdDocument(linked), l = doc.layerInfo.layers[0];
  Object.assign(l.mask, { left: 0, top: 0, right: 0, bottom: 0, defaultColor, _dirty: true });
  const ch = l.channels.find(c => c.id === -2);
  Object.assign(ch, { _raw: new Uint8Array([0, 0]), length: 2, _dirty: true });
  const bytes = serializePsdDocument(doc), parsed = await parsePsdRaster(bytes, { keepPlanes: 'mask' });
  assert.ok(parsed.layers[0].mask);
  assert.ok(parseLayerTree(bytes).flat[0].mask);
  assert.deepEqual(alpha(parsed.layers[0].rgba), Array(6).fill(defaultColor));
  assert.deepEqual(alpha(decodeLayerPixels(parsePsdDocument(bytes), bytes, 0).toRGBA()), Array(6).fill(defaultColor));
  const denBytes = applyEdits(bytes, [{ op: 'setMaskProps', index: 0, density: 170 }]).buffer;
  const denLayer = (await parsePsdRaster(denBytes)).layers[0];
  const denSaved = rebuildPsdReplacingLayerPixels(denBytes, 0, denLayer.rgba, bounds, null, { premultiplied: true });
  assert.deepEqual((await parsePsdRaster(denSaved)).layers[0].rgba, denLayer.rgba);
}


const job = { width: 3, height: 2, depth: 8, mode: 3, psb: false, keepPlanes: true,
  chans: [0, 1, 2].map(id => ({ id, w: 3, h: 2, bytes: encodeChannel({ data: new Uint8Array(6).fill(255), width: 3, height: 2, depth: 8, withHeader: true }) })),
  maskInfo: { maskW: 3, maskH: 2, top: 0, left: 1, layerTop: 9, layerLeft: 7, maskFlags: 1, defaultColor: 0 },
  geo: { bounds, width: 3, height: 2 } };
job.chans.push({ id: -2, w: 3, h: 2, bytes: encodeChannel({ data: gray, width: 3, height: 2, depth: 8, withHeader: true }) });
assert.deepEqual(alpha((await decodeLayerJob(job)).rgba), alpha(layer.rgba));
job.chans.at(-1).w = 0; job.chans.at(-1).h = 0;
Object.assign(job.maskInfo, { maskW: 0, maskH: 0, defaultColor: 255 });
assert.deepEqual(alpha((await decodeLayerJob(job)).rgba), Array(6).fill(255));


for (const depth of [8, 16, 32]) for (const merged of [false, true]) {
  const sec = readSections(source), prefix = new Uint8Array(source).slice(0, sec.imageData.off), view = new DataView(prefix.buffer);
  view.setUint16(12, 5); view.setUint16(22, depth);
  view.setInt16(parsePsdFull(source).sections.layerInfoStart, merged ? -1 : 1);
  const Type = depth === 8 ? Uint8Array : depth === 16 ? Uint16Array : Float32Array;
  const max = depth === 8 ? 255 : depth === 16 ? 65535 : 1;
  const planes = [0.1, 0.2, 0.3, 0.4, 0.6].map(v => new Type(256).fill(depth === 32 ? v : Math.round(v * max)));
  const body = encodeCompositeImage({ planes, width: 16, height: 16, depth, compression: 0 });
  const bytes = new Uint8Array(prefix.length + body.length); bytes.set(prefix); bytes.set(body, prefix.length);
  const composite = decodeCompositeImage(bytes);
  assert.equal(hasMergedTransparency(bytes), merged);
  assert.equal(composite.toRGBA()[3], merged ? 102 : 255);
  const updated = decodeCompositeImage(replacePsdCompositeImage(bytes, new Uint8ClampedArray(1024).fill(255)));
  for (let c = merged ? 4 : 3; c < 5; c++) assert.deepEqual([...updated.channels[c]], [...planes[c]], 'saving retains every saved channel at its original precision');
}


for (const psb of [false, true]) for (const depth of [16, 32]) {
  const header = new Uint8Array(source).slice(0, 26), dv = new DataView(header.buffer);
  dv.setUint16(4, psb ? 2 : 1); dv.setUint16(12, 4); dv.setUint16(22, depth);
  const field = psb ? 8 : 4, global = new Uint8Array(8 + field + 4);
  global.set(Buffer.from(depth === 16 ? '8BIMLr16' : '8BIMLr32'));
  new DataView(global.buffer).setUint32(8 + field - 4, 2);
  new DataView(global.buffer).setInt16(8 + field, -1);
  const lmi = new Uint8Array(field + 4 + global.length); lmi.set(global, field + 4);
  const bytes = new Uint8Array(26 + 8 + field + lmi.length);
  bytes.set(header); new DataView(bytes.buffer).setUint32(34 + field - 4, lmi.length); bytes.set(lmi, 34 + field);
  assert.equal(hasMergedTransparency(bytes), true);
  const blockCount = 34 + field + field + 4 + 8 + field;
  new DataView(bytes.buffer).setInt16(blockCount, 1);
  assert.equal(hasMergedTransparency(bytes), false);
}

if (process.argv.includes('--sample')) {
  const bytes = fs.readFileSync(new URL('../../5cf0d68f1a3bb.psd', import.meta.url));
  const doc = await parsePsdRaster(bytes), tree = parseLayerTree(bytes);
  assert.equal(doc.layers.filter(l => l.mask).length, 56);
  assert.equal(tree.flat.filter(l => l.mask).length, 56);
  assert.deepEqual([37, 38, 39, 40].map(i => alpha(doc.layers[i].rgba).filter(Boolean).length), [20492, 46785, 37027, 4188]);
  const composite = decodeCompositeImage(bytes);
  assert.equal(composite.channels.length, 10);
  assert.ok(alpha(composite.toRGBA()).every(a => a === 255));
  const savedComposite = decodeCompositeImage(replacePsdCompositeImage(bytes, composite.toRGBA()));
  for (let c = 3; c < 10; c++) assert.deepEqual([...savedComposite.channels[c]], [...composite.channels[c]]);
}
console.log('PSD mask coordinates, empty masks, edit/write roundtrips, worker decode and saved-channel separation: PASS');
