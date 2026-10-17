





























import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'web', 'assets', 'icons');




const ALPHA_MIN = 24;



function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let p = 8, w = 0, h = 0, depth = 0, ct = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ct = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`只支持 8bit，这张是 ${depth}bit`);
  if (interlace) throw new Error('不支持隔行扫描的 PNG');
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : ct === 0 ? 1 : 0;
  if (!ch) throw new Error(`不支持的颜色类型 ${ct}`);
  const stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (ft === 1) line[x] = (line[x] + a) & 255;
      else if (ft === 2) line[x] = (line[x] + b) & 255;
      else if (ft === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(px, y * stride);
    prev = line;
  }
  return { w, h, ch, px };
}



const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}


function encodePng(w, h, rgba) {
  const stride = w * 4;
  const out = Buffer.alloc(h * (stride + 1));
  const line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y++) {
    rgba.copy(line, 0, y * stride, (y + 1) * stride);
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const b = cand[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? line[x - 4] : 0, c = prev[x], d = x >= 4 ? prev[x - 4] : 0;
        let v = line[x];
        if (f === 1) v -= a;
        else if (f === 2) v -= c;
        else if (f === 3) v -= (a + c) >> 1;
        else if (f === 4) {
          const pa = Math.abs(c - d), pb = Math.abs(a - d), pc = Math.abs(a + c - 2 * d);
          v -= pa <= pb && pa <= pc ? a : pb <= pc ? c : d;
        }
        v &= 255;
        b[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
    line.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}


function toRgba({ w, h, ch, px }) {
  if (ch === 4) return px;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4;
    if (ch === 3) { out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = 255; }
    else if (ch === 2) { out[d] = out[d + 1] = out[d + 2] = px[s]; out[d + 3] = px[s + 1]; }
    else { out[d] = out[d + 1] = out[d + 2] = px[s]; out[d + 3] = 255; }
  }
  return out;
}


function inkBox(w, h, rgba, alphaMin = ALPHA_MIN) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (rgba[row + x * 4 + 3] < alphaMin) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function cropRgba(w, h, rgba, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const s = ((y + box.y0) * w + box.x0) * 4;
    rgba.copy(out, y * box.w * 4, s, s + box.w * 4);
  }
  return out;
}



const map = JSON.parse(fs.readFileSync(path.join(SRC, 'map.json'), 'utf8'));











const panelSources = [...new Set(Object.values(map.ui)
  .map(v => (typeof v === 'string' ? v : v.src)))].filter(s => /^(PL_|CxUI_)/.test(s)
    && !fs.existsSync(path.join(SRC, 'svg', s + '.svg'))).sort();

const PNGDIR = path.join(SRC, 'png');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const reportOnly = args.includes('--report');
const restoreIdx = args.indexOf('--restore');
const restoreDir = restoreIdx >= 0 ? args[restoreIdx + 1] : null;


if (restoreDir) {
  if (!fs.existsSync(restoreDir)) { console.error(`找不到目录：${restoreDir}`); process.exit(1); }
  let n = 0;
  for (const f of fs.readdirSync(restoreDir)) {
    const m = /^((?:PL_|CxUI_).+)@2x\.png$/.exec(f);
    if (!m) continue;
    fs.copyFileSync(path.join(restoreDir, f), path.join(PNGDIR, m[1] + '.png'));
    n++;
  }
  console.log(`从 ${restoreDir} 重新导入 ${n} 张（还没裁）`);
}

let dirty = 0, total = 0;
const rows = [];
for (const src of panelSources) {
  const file = path.join(PNGDIR, src + '.png');
  if (!fs.existsSync(file)) { console.error(`缺文件：${file}`); process.exit(1); }
  const buf = fs.readFileSync(file);
  const dec = decodePng(buf);
  const { w, h, ch } = dec;
  const rgba = toRgba(dec);
  const box = inkBox(w, h, rgba);
  if (!box) { console.error(`${src}.png 整张全透明？`); process.exit(1); }
  const tight = box.x0 === 0 && box.y0 === 0 && box.w === w && box.h === h;

  if (reportOnly) {
    const line = [8, 16, 24, 48, 96].map(t => {
      const b = inkBox(w, h, rgba, t);
      return `${b.w}×${b.h}`;
    });
    console.log(`${src.padEnd(24)} 画布 ${w}×${h}  ch${ch}  阈值 8/16/24/48/96 → ${line.join('  ')}`);
    continue;
  }

  total++;
  if (tight) { rows.push({ src, before: `${w}×${h}`, after: `${w}×${h}`, changed: false }); continue; }
  dirty++;
  rows.push({ src, before: `${w}×${h}`, after: `${box.w}×${box.h}`, changed: true, box });

  if (!checkOnly) {
    fs.writeFileSync(file, encodePng(box.w, box.h, cropRgba(w, h, rgba, box)));
  }
}

if (reportOnly) process.exit(0);

const pad = s => String(s).padEnd(12);
console.log('');
console.log('源文件'.padEnd(26) + pad('画布(裁前)') + pad('墨迹=裁后') + '最大边占格');
for (const r of rows) {
  const [aw, ah] = r.after.split('×').map(Number);
  const ratio = r.changed ? `  (缩到 16px 格子里：长边顶满 16px，另一边 ${(Math.min(aw, ah) / Math.max(aw, ah) * 16).toFixed(1)}px)` : '';
  console.log(r.src.padEnd(26) + pad(r.before) + pad(r.after) + (r.changed ? '裁紧' : '本来就紧') + ratio);
}
console.log('');
if (checkOnly) {
  if (dirty) { console.error(`${dirty}/${total} 张没裁紧：跑 node tools/crop-icons.js`); process.exit(1); }
  console.log(`面板图标墨迹已裁紧 ✓（${total} 张）`);
} else {
  console.log(`写入 ${dirty} 张（${total - dirty} 张本来就紧）。改完记得：node tools/gen-icons.js`);
}
