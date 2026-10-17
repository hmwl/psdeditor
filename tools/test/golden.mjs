


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const GOLD = path.join(here, 'fixtures/golden.json');
const { parsePsdRaster, compositeAll } = await import(root + '/core/app.js');
const { synthDoc } = await import('./synth-doc.mjs');
const md5 = d => crypto.createHash('md5').update(d).digest('hex');
const update = process.argv.includes('--update');
const gold = fs.existsSync(GOLD) ? JSON.parse(fs.readFileSync(GOLD, 'utf8')) : {};
const cases = [['synth-120x100-s7', () => synthDoc(120, 100, 7), 120, 100], ['synth-257x131-s3', () => synthDoc(257, 131, 3), 257, 131], ['synth-64x64-s11', () => synthDoc(64, 64, 11), 64, 64]];
for (const f of (process.env.PSDS || '').split(',').filter(Boolean)) if (fs.existsSync(f)) cases.push([path.basename(f), async () => { const b = fs.readFileSync(f); return parsePsdRaster(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { strictChannels: false }); }, 0, 0]);
let fail = 0, n = 0;
for (const [name, mk, W0, H0] of cases) {
  const doc = await mk(), W = W0 || doc.width, H = H0 || doc.height;
  const h = md5(compositeAll(doc, W, H, new Map()).data);
  n++;
  if (update) { gold[name] = h; console.log('↻', name, h); continue; }
  if (!gold[name]) { console.log('？', name, h, '（golden.json 里没有，--update 记下）'); continue; }
  if (gold[name] !== h) { fail++; console.log('✗', name, '现在', h, '应为', gold[name]); } else console.log('✓', name);
}
if (update) fs.writeFileSync(GOLD, JSON.stringify(gold, null, 2) + '\n');
console.log(`golden ${n - fail}/${n}`);
process.exit(fail ? 1 : 0);
