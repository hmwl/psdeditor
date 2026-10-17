import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { writePsd, writeImageResource } from '../../core/psd-write.js';
import { resourceHandler } from '../../core/psd-resources.js';
import { applyEdits } from '../../core/psd-edit.js';
import { compsToDescriptor, buildCmlsDesc } from '../../core/layer-comps.js';
import { parsePsdFull } from '../../core/psd-parse.js';
import { parsePsdDocument } from '../../core/psd-document.js';
import { parseAdditionalBlock } from '../../core/psd-additional.js';
import { smartObjectPropertyModel, sourceLayerCompImage, rewriteSmartObjectProperty, resetSmartObjectPlacement, setSmartObjectComp } from '../../web/editor/smart-object-properties.js';

const hash = b => createHash('sha256').update(b instanceof ArrayBuffer ? new Uint8Array(b) : b).digest('hex');
const pixels = rgb => { const p = new Uint8Array(12 * 10 * 4); for (let q = 0; q < p.length; q += 4) p.set([...rgb, 255], q); return p; };
const red = pixels([230, 40, 40]), green = pixels([40, 210, 80]);
let source = writePsd({ width: 40, height: 30, layers: [
  { name: 'RED', bounds: { left: 2, top: 3, right: 14, bottom: 13 }, rgba: red },
  { name: 'GREEN', bounds: { left: 20, top: 10, right: 32, bottom: 20 }, rgba: green },
] });
source = applyEdits(source, [{ op: 'ensureLayerIds' }, { op: 'setLayerCompsMeta', entries: [
  { index: 0, cmls: buildCmlsDesc(1, [{ compId: 101, v: true, dx: 8, dy: 4 }, { compId: 202, v: false }]) },
  { index: 1, cmls: buildCmlsDesc(2, [{ compId: 101, v: false }, { compId: 202, v: true, dx: -5, dy: 2 }]) },
] }]).buffer;
source = writeImageResource(source, 1065, resourceHandler(1065).write({ descriptorVersion: 16,
  descriptor: compsToDescriptor([{ id: 101, name: 'Red moved', cap: { vis: true, pos: true } },
    { id: 202, name: 'Green moved', cap: { vis: true, pos: true } }], 202) }));
const sourceBytes = new Uint8Array(source), sourceHash = hash(sourceBytes);
const nativeCompsEncoding = parsePsdDocument(source).imageResources.find(r => r.id === 1065).data.descriptor;
assert.equal(nativeCompsEncoding.__explicit.list, true, 'Native layer comps list uses a string ID');
assert.ok(nativeCompsEncoding.list.every(c => c.__explicit.__classID === true), 'Native Comp descriptor class uses a string ID');
const nativeCompFixture = JSON.parse(fs.readFileSync(new URL('./fixtures/native-comp-info.json', import.meta.url), 'utf8'));
assert.equal(nativeCompFixture.outer.compInfo.compID, -1);
assert.equal(nativeCompFixture.outer.compInfo.originalCompID, 202);
assert.deepEqual(nativeCompFixture.outer.compInfo.compList.map(c => [c['Nm  '], c.Idnt]), [['RED ONLY', 101], ['GREEN ONLY', 202]]);
let outer = writePsd({ width: 160, height: 120, layers: [{ name: 'Placed',
  bounds: { left: 40, top: 30, right: 80, bottom: 60 }, rgba: new Uint8Array(40 * 30 * 4) }] });
outer = applyEdits(outer, [{ op: 'convertToSmartObject', index: 0,
  source: { width: 40, height: 30, data: new Uint8Array(40 * 30 * 4) }, embedded: sourceBytes }]).buffer;
const model = smartObjectPropertyModel(outer, 0);
assert.deepEqual(model.comps.list.map(c => [c.id, c.name]), [[101, 'Red moved'], [202, 'Green moved']]);
assert.equal(model.compId, -1);
const pixel = (im, x, y) => [...im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4)];
const movedRed = await sourceLayerCompImage(model.source.bytes, 101);
assert.deepEqual(pixel(movedRed, 10, 7), [230, 40, 40, 255]);
assert.equal(pixel(movedRed, 2, 3)[3], 0);
assert.equal(pixel(movedRed, 25, 15)[3], 0);
const movedGreen = await sourceLayerCompImage(model.source.bytes, 202);
assert.deepEqual(pixel(movedGreen, 15, 12), [40, 210, 80, 255]);
assert.equal(pixel(movedGreen, 2, 3)[3], 0);
const saved = await sourceLayerCompImage(model.source.bytes, -1);
assert.deepEqual(pixel(saved, 2, 3), [230, 40, 40, 255]);
assert.deepEqual(pixel(saved, 20, 10), [40, 210, 80, 255]);
assert.equal(hash(model.source.bytes), sourceHash, 'Applying instance comps must not mutate the embedded document');
await assert.rejects(() => sourceLayerCompImage(model.source.bytes, 999), /没有这个图层复合/);




const before = model.placed.desc;
const edited = rewriteSmartObjectProperty(outer, 0, d => { d.comp = 101; });
const after = smartObjectPropertyModel(edited, 0);
assert.equal(after.compId, 101);
assert.deepEqual({ ...after.placed.desc, comp: before.comp }, before);
assert.equal(hash(after.source.bytes), sourceHash);
const beforeLayers = parsePsdFull(outer).layers, afterLayers = parsePsdFull(edited).layers;
assert.deepEqual(afterLayers.map(l => l.bounds), beforeLayers.map(l => l.bounds));
const withMarker = rewriteSmartObjectProperty(outer, 0, d => { d.compInfo.originalCompID = 202; d.compInfo.nativeMarker = 'retain'; });
for (const id of [101, 202, -1]) {
  const selected = smartObjectPropertyModel(setSmartObjectComp(withMarker, 0, id), 0);
  assert.equal(selected.compId, id); assert.equal(selected.placed.desc.compInfo.compID, -1);
  assert.equal(selected.placed.desc.compInfo.originalCompID, id === -1 ? 202 : id);
  assert.deepEqual(selected.placed.desc.compInfo.compList.map(x => [x['Nm  '], x.Idnt]), model.comps.list.map(x => [x.name, x.id]));
  assert.equal(selected.placed.desc.compInfo.nativeMarker, 'retain');
  assert.equal(hash(selected.source.bytes), sourceHash);
}
assert.throws(() => setSmartObjectComp(withMarker, 0, 999), /没有这个图层复合/);
const reset = resetSmartObjectPlacement(edited, 0, { x: 60, y: 45, w: 40, h: 30 });
const resetModel = smartObjectPropertyModel(reset.buffer, 0), resetLayer = parsePsdFull(reset.buffer).layers[0];
const quad = [60, 45, 100, 45, 100, 75, 60, 75];
assert.deepEqual([...resetModel.placed.desc.Trnf], quad);
assert.deepEqual([...resetModel.placed.desc.nonAffineTransform], quad);
assert.equal(resetModel.placed.desc.warp.warpStyle.value, 'warpNone');
assert.equal(resetModel.compId, 101, 'Resetting placement must retain the selected source comp');
assert.equal(hash(resetModel.source.bytes), sourceHash);
const pl = resetLayer.placedBlocks.find(b => b.key === 'PlLd');
const legacy = parseAdditionalBlock('PlLd', new Uint8Array(reset.buffer, pl.dataOffset, pl.dataLength));
assert.deepEqual(legacy.transform, quad);
assert.equal(legacy.desc.warpStyle.value, 'warpNone');
assert.equal(reset.layerInfo.points.length, 16);
assert.deepEqual(reset.layerInfo.points[0], { x: 60, y: 45 });
assert.deepEqual(reset.layerInfo.points[15], { x: 100, y: 75 });
const nativeFixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/smart-properties-native.json', import.meta.url), 'utf8'));
for (const fixture of nativeFixtures.cases) {
  const beforeBytes = inflateRawSync(Buffer.from(fixture.inputDeflateRawBase64, 'base64'));
  assert.equal(hash(beforeBytes), fixture.inputSha256);
  const resetBytes = resetSmartObjectPlacement(beforeBytes, 0).buffer;
  const actual = smartObjectPropertyModel(resetBytes, 0).placed.desc;
  const expected = fixture.expected;
  const semantic = v => Array.isArray(v) ? v.map(semantic) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('__')).map(([k, x]) => [k, semantic(x)])) : v;
  for (const key of ['Trnf', 'nonAffineTransform', 'warp', 'Sz  ', 'Rslt'])
    assert.deepEqual(semantic(actual[key]), semantic(expected[key]), `${fixture.name}: native ${key}`);
}
console.log('✓ 智能对象图层复合列表、可见性/位置合成、最后文档状态、SoLd定向写回与源文档保护');
console.log('✓ 本机PS2026的72/300ppi复位样本语义一致：中心、原像素尺寸、warpNone、warp文档边界');
