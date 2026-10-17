import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { readAbr } from '../../core/abr.js';
import { readAco, writeAco } from '../../core/swatches.js';
import { readGrd } from '../../core/grd.js';
import { readPat } from '../../core/pat.js';
import { readCsh } from '../../core/csh.js';
import { readAsl, writeAsl } from '../../core/asl.js';
import { readTpl } from '../../core/tpl.js';
import { parseAtn, writeAtn } from '../../core/atn.js';
const dir = new URL('../../web/assets/ps-presets/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', dir)));
const readers = { abr: b => readAbr(b).brushes, aco: readAco, grd: readGrd, pat: readPat, csh: readCsh, asl: b => readAsl(b).styles, tpl: b => readTpl(b).presets, atn: b => parseAtn(b).actions };
let count = 0;
for (const pack of manifest.packs) {
  const bytes = fs.readFileSync(new URL(pack.url.split('/').pop(), dir));
  assert.equal(bytes.length, pack.byteLength);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), pack.sourceSha256, pack.id);
  const items = readers[pack.format](bytes);
  assert.equal(items.length, pack.count, pack.id); count += items.length;
}
assert.equal(count, 11477); assert.equal(manifest.packs.length, 54);
const swatches = readAco(fs.readFileSync(new URL('default-swatches.aco', dir)));
assert.deepEqual(swatches.find(x => x.name === 'RGB Red').color, [255, 0, 0]);
assert.deepEqual(swatches.find(x => x.name === 'White').color, [255, 255, 255]);
assert.deepEqual(readAco(writeAco(swatches)), swatches);
assert.equal(swatches.some(x => x.unsupported != null), false);
const atn = fs.readFileSync(new URL('default-actions.atn', dir));
assert.deepEqual(Buffer.from(writeAtn(parseAtn(atn))), atn);
const style = readAsl(fs.readFileSync(new URL('default-styles.asl', dir)));
const none = style.styles.find(s => /None/.test(s.name));
assert.ok(none);
assert.equal(Object.keys(none.effects).filter(k => !k.startsWith('__')).length, 0);
assert.equal(readAsl(writeAsl(style.styles, style.patterns)).styles.length, 21);
const abr = readAbr(fs.readFileSync(new URL('default-brushes.abr', dir)));
for (const b of abr.brushes) {
  assert.equal(!!b.missing, false);
  for (const s of [b.sample, b.dyn?.dual?.sample].filter(Boolean)) assert.equal(s.data.length, s.w * s.h);
  if (b.dyn.texture.on) assert.ok(abr.patterns.some(p => p.id === b.dyn.texture.pattern));
}
const tpl = readTpl(fs.readFileSync(new URL('default-tool-presets.tpl', dir)));
assert.equal(tpl.presets.filter(x => x.unsupported).length, 21);
const healing = tpl.presets.find(x => x.tool === 'healBrush');
assert.equal(healing.brush.size, 21); assert.equal(healing.brush.hardness, 0); assert.equal(healing.brush.tip, 'round');
console.log('✓ 54 原始包摘要/11477记录、XYZ色板往返、原生动作引用、空样式、画笔依赖、未映射工具明确拒绝');
