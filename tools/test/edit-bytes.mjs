




import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createPsd } = await import(ROOT + '/core/psd-new.js');
const { applyEdits } = await import(ROOT + '/core/psd-edit.js');
const { parsePsdRaster, layerRasterSig } = await import(ROOT + '/core/psd-raster.js');
const md5 = b => crypto.createHash('md5').update(new Uint8Array(b)).digest('hex');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('✓', m); };

const W = 300, H = 200;
const img = (w, h, f) => { const d = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4, v = f(x, y); d.set(v, q); } return d; };
let base = createPsd({ width: W, height: H, background: 'white', name: 't' });
base = applyEdits(base, [
  { op: 'createLayer', at: 1, name: 'A' },
  { op: 'replaceLayerPixels', index: 1, rgba: { data: img(W, H, (x, y) => [x & 255, (y * 3) & 255, 128, x < 20 ? 0 : 255]), width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } },
  { op: 'createLayer', at: 2, name: 'B' },
  { op: 'replaceLayerPixels', index: 2, rgba: { data: img(100, 60, () => [10, 200, 30, 200]), width: 100, height: 60 }, bounds: { top: 30, left: 40, bottom: 90, right: 140 } },
]).buffer;
const h0 = md5(base);


const ops = [
  [{ op: 'createLayer', at: 1, name: 'n' }], [{ op: 'setLayerProps', index: 1, opacity: 9, visible: false }], [{ op: 'setLayerProps', index: 2, clipping: true }],
  [{ op: 'deleteLayer', index: 2 }], [{ op: 'newGroup', at: 1, name: 'g' }, { op: 'setLayerProps', index: 0, opacity: 3 }], [{ op: 'groupLayers', indices: [1, 2] }], [],
  [{ op: 'replaceLayerPixels', index: 1, rgba: { data: img(W, H, () => [1, 2, 3, 255]), width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } }],
];
for (const o of ops) { const r = applyEdits(base, o, { verify: 'fast' }); assert.notEqual(r.buffer, base); }
ok(md5(base) === h0, 'applyEdits 不改调用方的缓冲、产物不共用内存（' + ops.length + ' 组 op）');


const d0 = await parsePsdRaster(base, { strictChannels: false });
const want = new Uint8Array(d0.layers[1].rgba);
for (let y = 50; y < 58; y++) for (let x = 100; x < 180; x++) { const q = (y * W + x) * 4; want[q] = 255 - want[q]; want[q + 3] = 255; }
const r2 = applyEdits(base, [{ op: 'replaceLayerPixels', index: 1, rgba: { data: want, width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } }]);
const d2 = await parsePsdRaster(r2.buffer, { strictChannels: false });
ok(Buffer.compare(Buffer.from(d2.layers[1].rgba), Buffer.from(want)) === 0, '换像素（复用旧 RLE 行）解出来与写入的像素逐字节相同');
ok(md5(d2.layers[2].rgba) === md5(d0.layers[2].rgba), '其它图层不受影响');


const c1 = applyEdits(base, [{ op: 'createLayer', at: 1, name: 'tmp' }]).buffer;
const back = applyEdits(c1, [{ op: 'deleteLayer', index: 1 }]).buffer;
ok(md5(back) === h0, '新建图层再删掉 = 原文件逐字节不变');
ok(layerRasterSig(base, 2) === layerRasterSig(c1, 3), '图层前面插了一条记录：像素签名不变（结构性重载能认回旧像素）');
const d3 = await parsePsdRaster(applyEdits(base, [{ op: 'createLayer', at: 2, name: 'x' }, { op: 'groupLayers', indices: [1, 2] }]).buffer, { strictChannels: false });
ok(d3.layers.length === 6, '新建 + 编组之后完整解析');

{
  const { parsePsdFull } = await import(ROOT + '/core/psd-parse.js');
  const P = parsePsdFull(base), L = P.layers[1], s = P.sections;
  const data = new Uint8Array([0, 0, 0, 1, 0x38, 0x42, 0x49, 0x4d, 0x63, 0x6d, 0x6e, 0x53, 0, 0, 0, 7, 0, 0, 0, 0, 1, 0, 0, 0]);   
  const blk = new Uint8Array(12 + data.length); blk.set([0x38, 0x42, 0x49, 0x4d, 0x6c, 0x72, 0x46, 0x58]); new DataView(blk.buffer).setUint32(8, data.length); blk.set(data, 12);
  const src = new Uint8Array(base), ext = new DataView(base).getUint32(L.extraLenOffset), at = L.extraLenOffset + 4 + ext;
  const out = new Uint8Array(src.length + blk.length); out.set(src.subarray(0, at)); out.set(blk, at); out.set(src.subarray(at), at + blk.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(L.extraLenOffset, ext + blk.length); dv.setUint32(s.layerInfoLenOffset, dv.getUint32(s.layerInfoLenOffset) + blk.length); dv.setUint32(s.lmiLenOffset, dv.getUint32(s.lmiLenOffset) + blk.length);
  const t0 = Date.now(); const q = parsePsdFull(out.buffer); const d4 = await parsePsdRaster(out.buffer, { strictChannels: false });
  ok(Date.now() - t0 < 5000 && q.layers.length === 3 && !q.layers[1]._error && d4.layers.length === 3, '带旧版 lrFX 效果块的文件正常解析（不卡死）');
}

{
  const { writePsd } = await import(ROOT + '/core/psd-write.js');
  const { parsePsdFull, readPlacedIdentity } = await import(ROOT + '/core/psd-parse.js');
  const { parsePsdDocument, serializePsdDocument } = await import(ROOT + '/core/psd-document.js');
  const { readPsd } = await import(ROOT + '/server/node_modules/ag-psd/dist/index.js');
  let cases = 0;
  for (const size of [48, 49, 64]) for (const name of ['A', 'AB', 'Pixel', 'Pixels', '图', '图层', '图层😀x', '😀']) {
    const rgba = img(size, size, (x, y) => [x * 3 & 255, y * 5 & 255, 40, (x + y) % 3 ? 255 : 100]);
    const source = writePsd({ width: size, height: size, layers: [{ name, bounds: { top: 0, left: 0, bottom: size, right: size }, rgba }], composite: rgba });
    const unchanged = source.slice();
    const result = applyEdits(source, [{ op: 'convertToSmartObject', index: 0, source: { data: rgba, width: size, height: size } }]);
    assert.deepEqual(source, unchanged, 'conversion preserves source bytes');
    assert.equal(result.summary.verified, true);
    const full = parsePsdFull(result.buffer), layer = full.layers[0], linked = full.linkedFiles[0];
    assert.equal(layer.unicodeName, name);
    assert.deepEqual(layer.placedBlocks.map(b => b.key), ['PlLd', 'SoLd']);
    for (const b of layer.placedBlocks) assert.equal(readPlacedIdentity(new Uint8Array(result.buffer, b.dataOffset, b.dataLength), b.key).linkId, linked.id);
    const document = parsePsdDocument(result.buffer);
    assert.deepEqual(new Uint8Array(serializePsdDocument(document)), new Uint8Array(result.buffer), 'converted PSD roundtrips byte-exactly');
    const embedded = await parsePsdRaster(linked.bytes, { strictChannels: true });
    const outer = await parsePsdRaster(result.buffer, { strictChannels: true });
    assert.deepEqual(new Uint8Array(embedded.layers[0].rgba), rgba, 'embedded source pixels preserved');
    assert.deepEqual(new Uint8Array(outer.layers[0].rgba), rgba, 'cached pixels preserved');
    const thirdParty = readPsd(result.buffer, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    assert.equal(thirdParty.children[0].name, name);
    assert.equal(thirdParty.children[0].placedLayer.id, linked.id);
    assert.deepEqual(thirdParty.linkedFiles[0].data, linked.bytes, 'third-party reader resolves exact embedded bytes');
    cases++;
  }
  ok(cases === 24, '普通像素转智能对象：24 组尺寸/Unicode 名称，自检、字节往返、内嵌/缓存像素及 ag-psd 引用一致');
}
console.log(`edit-bytes ✓ ${n} 项`);
