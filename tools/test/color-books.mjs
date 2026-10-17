import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readAcb } from '../../core/color-books.js';
const dir = new URL('../../web/assets/color-books/', import.meta.url);
const { books } = JSON.parse(fs.readFileSync(new URL('manifest.json', dir)));
let total = 0;
for (const entry of books) {
  const bytes = fs.readFileSync(new URL(entry.file, dir)), b = readAcb(bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assert.equal(b.count, entry.count); assert.equal(b.pageSize, entry.pageSize);
  assert.ok(b.colors.every(c => c.values.every(Number.isFinite)));
  assert.throws(() => readAcb(bytes.subarray(0, 100)));
  total += b.count;
}
const anpa = readAcb(fs.readFileSync(new URL('anpa-color.acb', dir)));
const c = anpa.colors.find(c => c.shortName === '751-8');
assert.equal(c.name, 'ANPA 751-8 AdPro'); assert.deepEqual(c.values.map(Math.round), [60, 15, 12]);
assert.equal(anpa.spot, true);
const process = readAcb(fs.readFileSync(new URL('focoltone.acb', dir)));
assert.equal(process.spot, false); assert.deepEqual(process.colors[0].values, [100, 0, 0, 0]);
assert.equal(books.length, 12);
console.log(`✓ ${books.length} original color books, ${total} records, source hashes, screenshot Lab match and malformed input checks`);
