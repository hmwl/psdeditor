import assert from 'node:assert/strict';
import fs from 'node:fs';
import { writePsd } from '../../core/psd-write.js';
import { applyEdits } from '../../core/psd-edit.js';
import { parseLayerTree, parsePsdFull, parseSmartObjects, smartObjectFragment, writeLayerProperties, replaceLayerBlock } from '../../core/psd-parse.js';
import { serializeDescriptor } from '../../core/psd-descriptor.js';
import { validateFragment, resolveFragment } from '../../server/private/fragment.js';
import { resolveSmartFilters } from '../../server/private/smart-filter.js';
import { toFoxpsdLayerInfo } from '../../server/private/smart-object.js';

const bounds = { left: 0, top: 0, right: 2, bottom: 2 };
const pixelFile = writePsd({ width: 2, height: 2, layers: [{ name: 'Pixels', bounds, rgba: new Uint8Array(16).fill(255) }] });
const grouped = applyEdits(pixelFile, [{ op: 'groupLayers', indices: [0], name: 'Group' }]).buffer;
const group = parseLayerTree(grouped).flat.find(l => l.groupType === 1);
const collapsed = writeLayerProperties(grouped.slice(0), [{ index: group.index, groupCollapsed: true }]);
assert.equal(parseLayerTree(collapsed).flat[group.index].groupType, 2);
assert.deepEqual(new Uint8Array(writeLayerProperties(collapsed.slice(0), [{ index: group.index, groupCollapsed: false }])), new Uint8Array(grouped), 'Opening and closing a group changes only the section divider flag');
assert.throws(() => writeLayerProperties(grouped.slice(0), [{ index: 1, groupCollapsed: true }]), /组头/);
assert.throws(() => writeLayerProperties(grouped.slice(0), [{ index: group.index, groupCollapsed: 1 }]), /布尔/);

let effectsFile = applyEdits(pixelFile, [{ op: 'addLayerEffect', index: 0, effect: 'dropShadow' }]).buffer;
const effects = parsePsdFull(effectsFile).layers[0].effects;
effects.dropShadowMulti = [{ ...effects.DrSh, present: false }, { ...effects.DrSh, present: true, enab: false }];
effects.SoFi = { __name: '', __classID: 'SoFi', enab: true, present: false };
delete effects.DrSh;
const encodedEffects = serializeDescriptor(effects), block = new Uint8Array(8 + encodedEffects.length);
new DataView(block.buffer).setUint32(4, 16); block.set(encodedEffects, 8);
const effectKey = parsePsdFull(effectsFile).layers[0].blocks.find(b => ['lfx2', 'lfxs', 'lmfx'].includes(b.key)).key;
effectsFile = replaceLayerBlock(effectsFile, 0, effectKey, block);
assert.deepEqual(parseLayerTree(effectsFile).flat[0].effects.map(e => [e.key, e.at, e.enabled]), [['DrSh', 1, false]], 'Absent placeholders are hidden without dropping disabled present effects or changing their writeback indices');

const fragment = bytes => ({ bounds, blocks: [{ key: 'SoLd', data: new Uint8Array(bytes) }] });
assert.equal(validateFragment(fragment(9_002_424)).blocks[0].data.length, 9_002_424);
const maxBlock = fragment(16 * 1024 * 1024);
assert.equal(validateFragment(maxBlock), maxBlock);
const maxFragment = { bounds, blocks: [maxBlock.blocks[0], fragment(8 * 1024 * 1024).blocks[0]] };
assert.equal(validateFragment(maxFragment), maxFragment);
assert.throws(() => validateFragment({ bounds, blocks: [...maxFragment.blocks, fragment(1).blocks[0]] }), /24 MiB/);
assert.throws(() => validateFragment(fragment(16 * 1024 * 1024 + 1)), /16 MiB/);
assert.throws(() => validateFragment({ bounds, blocks: Array(2).fill(fragment(13 * 1024 * 1024).blocks[0]) }), /24 MiB/);
assert.throws(() => validateFragment({ bounds, blocks: [{ key: 'SoLd', data: [] }] }), /字节/);

const rotation = quad => toFoxpsdLayerInfo({ bounds, originalSize: { width: 2, height: 2 }, transformQuad: [0, 0, 2, 0, 2, 2, 0, 2], nonAffineTransform: quad }).placementRotation;
for (const degrees of [-136.27, -36.27, 0, 45, 140]) {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const q = [[0, 0], [2, 0], [2, 2], [0, 2]].flatMap(([x, y]) => [x * c - y * s, x * s + y * c]);
  assert.ok(Math.abs(rotation(q) - degrees) < 1e-10);
}
assert.equal(rotation([0, 2, 2, 2, 2, 0, 0, 0]), 0, 'Vertical reflection preserves the placed horizontal direction');
assert.equal(Math.abs(rotation([2, 0, 0, 0, 0, 2, 2, 2])), 180, 'Horizontal reflection reverses the placed horizontal direction');
assert.equal(rotation([NaN, 0]), 0, 'Malformed non-affine quad falls back to the affine placement');

const sample = new URL('../../5cf0d68f1a3bb.psd', import.meta.url);
if (fs.existsSync(sample)) {
  const bytes = fs.readFileSync(sample), tree = parseLayerTree(bytes);
  assert.equal(tree.flat.filter(l => l.groupType !== 3).length, 92);
  assert.equal(tree.flat.filter(l => l.groupType === 2).length, 18);
  const visibleRows = nodes => nodes.reduce((n, l) => n + 1 + (l.groupType === 2 ? 0 : visibleRows(l.children || [])), 0);
  assert.equal(visibleRows(tree.layers), 35);
  assert.deepEqual(tree.flat.filter(l => l.effects?.length).map(l => l.effects.length).sort(), [1, 2]);
  const smartObjects = parseSmartObjects(bytes);
  for (const index of [40, 43]) {
    const so = smartObjects.find(s => s.layerIndex === index), f = smartObjectFragment(bytes, so);
    const filters = resolveSmartFilters(f);
    assert.equal(filters.count, 1); assert.equal(filters.filters[0].classID, 'LqFy');
  }
  for (const [index, nativeRotation] of [[37, -36.27], [38, -42.38], [39, -47.12], [40, -1.44]]) {
    const so = smartObjects.find(s => s.layerIndex === index);
    const info = resolveFragment(smartObjectFragment(bytes, so)).layerInfo;
    assert.equal(Math.round(info.placementRotation * 100) / 100, nativeRotation, `Layer ${index}: Photoshop native Properties rotation`);
  }
  console.log('✓ 原生 PSD：92 节点、18 折叠组、35 初始行、1/2 个效果、两条 9MB 液化、四层 PS 旋转角度');
}
console.log('✓ 组折叠字节往返、效果 present/disabled/索引、片段边界、旋转及镜像方向');
