

import { createDeflate } from 'node:zlib';
import { once } from 'node:events';

const sample = (color, x, y, patterned) => !patterned ? color : color === 255 ? 80 + (y % 64) * 2 : (color + (Math.floor(x / 128) % 8) * 7 + (y % 64) * 3) & 255;
async function zipBands(width, height, colors, patterned = false, flattened = false, prediction = false) {
  const zip = createDeflate(), chunks = [];
  zip.on('data', part => chunks.push(part));
  const done = once(zip, 'end');
  for (const color of colors) {
    const block = Buffer.alloc(width * Math.min(height, 64), color);
    if (patterned) for (let y = 0; y < Math.min(height, 64); y++) for (let x = 0; x < width; x++) {
      let v = sample(color, x, y, true);
      if (flattened) { const a = sample(255, x, y, true) / 255; v = Math.round(v * a + 255 * (1 - a)); }
      block[y * width + x] = v;
    }
    if(prediction)for(let y=0;y<Math.min(height,64);y++)for(let x=width-1;x>0;x--)block[y*width+x]=(block[y*width+x]-block[y*width+x-1])&255;
    for (let y = 0; y < height; y += 64) {
      const bytes = block.subarray(0, width * Math.min(64, height - y));
      if (!zip.write(bytes)) await once(zip, 'drain');
    }
  }
  zip.end(); await done;
  return Buffer.concat([Buffer.from([0, prediction?3:2]), ...chunks]);
}
function rlePlane(width, height, color, patterned, psb) {
  const rowBytes = Math.ceil(width / 128) * 2, header = 2 + height * (psb ? 4 : 2);
  const out = Buffer.alloc(header + height * rowBytes); out.writeUInt16BE(1, 0);
  for (let y = 0; y < height; y++) {
    if (psb) out.writeUInt32BE(rowBytes, 2 + y * 4); else out.writeUInt16BE(rowBytes, 2 + y * 2);
    let at = header + y * rowBytes;
    for (let x = 0; x < width; x += 128) { out[at++] = (1 - Math.min(128, width - x)) & 255; out[at++] = sample(color, x, y, patterned); }
  }
  return out;
}
function packRun(value, length, parts) {
  while (length > 0) { const n = Math.min(128, length); parts.push(Buffer.from([1 - n, value])); length -= n; }
}

function rleMaskPlane(width, height, psb) {
  const half = Math.floor(width / 2), rows = [], counts = [];
  for (let y = 0; y < height; y++) {
    const parts = []; packRun(255, half, parts); packRun(0, width - half, parts);
    const row = Buffer.concat(parts); rows.push(row); counts.push(row.length);
  }
  const header = Buffer.alloc(2 + height * (psb ? 4 : 2)); header.writeUInt16BE(1, 0);
  for (let y = 0; y < height; y++) { if (psb) header.writeUInt32BE(counts[y], 2 + y * 4); else header.writeUInt16BE(counts[y], 2 + y * 2); }
  return Buffer.concat([header, ...rows]);
}
export async function largeZipFixture(width = 9390, height = 30000, { patterned = false, compression = 'zip', layerCount = 1, opaque = false, mask = false } = {}) {
  if (!Number.isInteger(layerCount) || layerCount < 1 || layerCount > 64) throw new Error('invalid fixture layerCount');
  const psb = width > 30000 || height > 30000;
  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 65535); return b; };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const len = n => { if (!psb) return u32(n); const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
  const colors = [171, 65, 211, 255], channels = [];
  for (const c of colors) {
    const pattern=patterned&&!(opaque&&c===255);
    if(compression==='raw'){
      if(width*height>64e6)throw new Error('Raw fixture must stay within the test memory budget');
      const b=Buffer.alloc(2+width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)b[2+y*width+x]=sample(c,x,y,pattern);channels.push(b);
    }else channels.push(compression === 'rle' ? rlePlane(width, height, c, pattern, psb) : await zipBands(width, height, [c], pattern,false,compression==='prediction'));
  }
  const header = Buffer.alloc(26); header.write('8BPS'); header.writeUInt16BE(psb ? 2 : 1, 4);
  header.writeUInt16BE(3, 12); header.writeUInt32BE(height, 14); header.writeUInt32BE(width, 18);
  header.writeUInt16BE(8, 22); header.writeUInt16BE(3, 24);
  const name = Buffer.from('Large ZIP'), pascal = Buffer.alloc(Math.ceil((name.length + 1) / 4) * 4);
  pascal[0] = name.length; name.copy(pascal, 1);
  const layerChannels = channels.map((bytes, i) => ({ id: i === 3 ? -1 : i, bytes }));
  let maskExtra = u32(0);
  if (mask) {
    layerChannels.push({ id: -2, bytes: rleMaskPlane(width, height, psb) });
    const rect = Buffer.alloc(16); rect.writeUInt32BE(0, 0); rect.writeUInt32BE(0, 4);
    rect.writeUInt32BE(height, 8); rect.writeUInt32BE(width, 12);
    maskExtra = Buffer.concat([u32(18), rect, Buffer.from([0, 0])]);
  }
  const extra = Buffer.concat([maskExtra, u32(0), pascal]);
  const record = Buffer.concat([u32(0), u32(0), u32(height), u32(width), u16(layerChannels.length),
    ...layerChannels.flatMap(c => [u16(c.id), len(c.bytes.length)]),
    Buffer.from('8BIMnorm'), Buffer.from([255, 0, 0, 0]), u32(extra.length), extra]);
  let info = Buffer.concat([u16(layerCount), ...Array(layerCount).fill(record),
    ...Array.from({ length: layerCount }, () => layerChannels.map(c => c.bytes)).flat()]);
  if (info.length & 1) info = Buffer.concat([info, Buffer.alloc(1)]);
  const lmi = Buffer.concat([len(info.length), info, u32(0)]);
  const composite = await zipBands(width, height, colors.slice(0, 3), patterned, patterned&&!opaque);
  return Buffer.concat([header, u32(0), u32(0), len(lmi.length), lmi, composite]);
}
