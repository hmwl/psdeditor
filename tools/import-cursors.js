

















import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';

const ROOT = path.join(import.meta.dirname, '..');
const DST = path.join(ROOT, 'web/assets/icons/cursor');
const MAP = path.join(ROOT, 'web/assets/icons/map.json');
const args = process.argv.slice(2);
const force = args.includes('--force');
const LIB = args.find(a => !a.startsWith('--'))
  || path.join(os.homedir(), 'Downloads/PS-Icons/01-工具与界面图标/png/dark');


function decodePng(buf){
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let off = 8, w = 0, h = 0, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`只支持 8 位 RGBA 非隔行（读到 depth=${data[8]} color=${data[9]} interlace=${data[12]}）`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4), bpp = 4, stride = w * bpp;
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const up = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = up ? up[x] : 0, c = (up && x >= bpp) ? up[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      else if (ft !== 0) throw new Error('未知的行过滤器 ' + ft);
      cur[x] = v & 255;
    }
  }
  return { w, h, data: out };
}

const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return b => { let c = -1; for (const v of b) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, data){
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function halve(img){
  const w = img.w >> 1, h = img.h >> 1, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const s = ((y * 2 + dy) * img.w + x * 2 + dx) * 4, sa = img.data[s + 3];
      r += img.data[s] * sa; g += img.data[s + 1] * sa; b += img.data[s + 2] * sa; a += sa;
    }
    const d = (y * w + x) * 4;
    out[d] = a ? Math.round(r / a) : 0; out[d + 1] = a ? Math.round(g / a) : 0;
    out[d + 2] = a ? Math.round(b / a) : 0; out[d + 3] = Math.round(a / 4);
  }
  return { w, h, data: out };
}

function cropInk(img){
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++)
    if (img.data[(y * img.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('整张都是透明的');
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) img.data.copy(out, y * w * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4);
  return { w, h, data: out, box: [x0, y0, w, h] };
}

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const todo = Object.entries(map.cursorPng || {}).filter(([, v]) => v.source);
if (!fs.existsSync(LIB)) { console.error(`找不到源库目录：${LIB}\n用法：node tools/import-cursors.js [源库目录] [--force]`); process.exit(1); }
let made = 0, kept = 0;
for (const [name, v] of todo) {
  const dst = path.join(DST, v.src + '.png');
  if (fs.existsSync(dst) && !force) { kept++; continue; }
  const src = path.join(LIB, v.source);
  if (!fs.existsSync(src)) { console.error(`✗ ${name}：源库里没有 ${v.source}`); process.exitCode = 1; continue; }
  const img = cropInk(halve(decodePng(fs.readFileSync(src))));
  fs.writeFileSync(dst, encodePng(img.w, img.h, img.data));
  made++;
  const bad = v.hx > img.w || v.hy > img.h;
  console.log(`✓ ${name.padEnd(14)} ${v.source.padEnd(20)} → ${v.src}.png ${img.w}×${img.h}  热点 (${v.hx},${v.hy})${bad ? '  ⚠ 热点落在图外' : ''}`);
}
console.log(`位图光标：新导 ${made} 张，已在库里跳过 ${kept} 张（--force 整批重导）。别忘了 node tools/gen-icons.js`);
