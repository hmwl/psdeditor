













import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'web', 'dist');
const TEXT = /\.(js|mjs|css|html|svg|json|map)$/i;
const MIN_BYTES = 1024;          

if (!fs.existsSync(DIST)) { console.log('web/dist 不存在，跳过预压缩（先 npm run build）'); process.exit(0); }

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const f = path.join(dir, e.name);
  return e.isDirectory() ? walk(f) : [f];
});

let n = 0, raw = 0, gz = 0, br = 0;
for (const f of walk(DIST)) {
  if (!TEXT.test(f)) continue;
  const buf = fs.readFileSync(f);
  if (buf.length < MIN_BYTES) continue;
  const g = zlib.gzipSync(buf, { level: 9 });
  const b = zlib.brotliCompressSync(buf, { params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
  }});
  fs.writeFileSync(f + '.gz', g);
  fs.writeFileSync(f + '.br', b);
  n++; raw += buf.length; gz += g.length; br += b.length;
}
const kb = v => (v / 1024).toFixed(0) + ' KB';
console.log(`预压缩 ${n} 个文件：${kb(raw)} → gzip ${kb(gz)} / brotli ${kb(br)}（Nginx 需开 gzip_static / brotli_static）`);
