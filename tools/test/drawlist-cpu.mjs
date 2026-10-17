
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { parsePsdRaster, compositeAll } = await import(root + '/core/app.js');
const DL = await import(root + '/core/render/draw-list.js');
const md5 = d => crypto.createHash('md5').update(d).digest('hex');
const files = (process.env.PSDS || '').split(',').filter(Boolean);
let fail = 0, n = 0;
function check(name, doc, W, H) {
  const a = compositeAll(doc, W, H, new Map());
  const st = DL.createDrawListState();
  const list = DL.buildDrawList(doc, W, H, st);
  const b = DL.executeDrawListCPU(list);
  const list2 = DL.buildDrawList(doc, W, H, st);            
  const c = DL.executeDrawListCPU(list2);
  n++;
  const ok = md5(a.data) === md5(b.data) && md5(a.data) === md5(c.data);
  if (!ok) { fail++; let diff = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++; console.log('✗', name, 'diff bytes', diff, 'ops', DL.countOps(list.ops)); }
  else console.log('✓', name, W + '×' + H, 'ops', DL.countOps(list.ops));
}
async function load(p) { const b = fs.readFileSync(p); return parsePsdRaster(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { strictChannels: false }); }
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const doc = await load(f);
  check(path.basename(f), doc, doc.width, doc.height);
}
const { synthDoc: synth } = await import('./synth-doc.mjs');
const d1 = synth(120, 100, 7);
check('synth-120x100', d1, 120, 100);
const fxDoc = fs.existsSync('/tmp/claude-0/fx.psd') ? await load('/tmp/claude-0/fx.psd') : null;
if (fxDoc) {
  
  const v = { ...fxDoc, layers: fxDoc.layers.map((l, i) => ({ ...l, blendMode: i % 3 === 1 ? 'mul ' : l.blendMode, fillOpacity: i % 2 ? 120 : l.fillOpacity })) };
  check('fx-variant', v, fxDoc.width, fxDoc.height);
  const v2 = { ...fxDoc, layers: fxDoc.layers.map((l, i) => i > 1 ? { ...l, clipping: 1 } : l) };
  check('fx-clipped', v2, fxDoc.width, fxDoc.height);
}
console.log(`\n${n - fail}/${n} 一致`);
process.exit(fail ? 1 : 0);
