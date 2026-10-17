import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { readAcb } from '../core/color-books.js';
const source = '/Applications/Adobe Photoshop 2026/Presets/Color Books';
const output = new URL('../web/assets/color-books/', import.meta.url);
const names = ['ANPA Color', 'DIC Color Guide', 'FOCOLTONE', 'HKS E Process', 'HKS E', 'HKS K Process', 'HKS K', 'HKS N Process', 'HKS N', 'HKS Z Process', 'HKS Z', 'TRUMATCH'];
const labels = ['ANPA 颜色', 'DIC 颜色参考', 'FOCOLTONE', 'HKS E 印刷色', 'HKS E', 'HKS K 印刷色', 'HKS K', 'HKS N 印刷色', 'HKS N', 'HKS Z 印刷色', 'HKS Z', 'TRUMATCH'];
const books = [];
for (const [i, name] of names.entries()) {
  const bytes = await fs.readFile(path.join(source, name + '.acb')), book = readAcb(bytes);
  const file = name.toLowerCase().replaceAll(' ', '-') + '.acb';
  await fs.writeFile(new URL(file, output), bytes);
  books.push({ id: book.id, title: labels[i], file, count: book.count, pageSize: book.pageSize, pageOffset: book.pageOffset, model: book.model, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile(new URL('manifest.json', output), JSON.stringify({ source, books }, null, 2) + '\n');
console.log(JSON.stringify(books.map(({ title, count, model }) => ({ title, count, model }))));
