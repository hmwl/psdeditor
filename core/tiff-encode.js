

const TAG = { width: 256, height: 257, bits: 258, compression: 259, photo: 262, stripOffsets: 273,
  orientation: 274, samples: 277, rowsPerStrip: 278, stripCounts: 279, planar: 284, extra: 338, sampleFormat: 339 };

async function deflate(u8) {
  if (typeof CompressionStream !== 'function') throw new Error('当前浏览器没有流式 Deflate 压缩支持');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
}
const align4 = n => (n + 3) & ~3;
function writeEntry(dv, at, tag, type, count, value) {
  dv.setUint16(at, tag, true); dv.setUint16(at + 2, type, true); dv.setUint32(at + 4, count, true);
  if (type === 3 && count === 1) dv.setUint16(at + 8, value & 0xFFFF, true);
  else dv.setUint32(at + 8, value >>> 0, true);
}







export async function encodeTiffStreaming(opts) {
  const { width, height, rowsPerStrip = 256, readRows, onProgress = null, signal = null } = opts;
  if (!(width > 0 && height > 0)) throw new Error('TIFF 尺寸非法');
  const parts = [], offsets = [], counts = [];
  parts.push(new Uint8Array(8));
  let total = 8;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  for (let y0 = 0; y0 < height; y0 += rowsPerStrip) {
    check();
    const rows = Math.min(rowsPerStrip, height - y0);
    const rgba = await readRows(y0, rows);
    if (!rgba || rgba.length !== width * rows * 4) throw new Error('TIFF 条带尺寸不一致');
    const packed = await deflate(rgba);
    offsets.push(total); counts.push(packed.length);
    parts.push(packed); total += packed.length;
    if (onProgress) { try { onProgress(y0 + rows, height); } catch {  } }
  }
  check();
  if (total > 0xFFFFFFFF) throw new Error('TIFF 32 位偏移已超过 4GB；请改用 PSB / JPEG');
  if (total & 1) { parts.push(new Uint8Array(1)); total++; }
  const ifdOffset = total;
  const entries = [
    [TAG.width, 4, 1, width], [TAG.height, 4, 1, height],
    [TAG.bits, 3, 4, 0], [TAG.compression, 3, 1, 8], [TAG.photo, 3, 1, 2],
    [TAG.stripOffsets, 4, offsets.length, 0], [TAG.orientation, 3, 1, 1],
    [TAG.samples, 3, 1, 4], [TAG.rowsPerStrip, 4, 1, rowsPerStrip],
    [TAG.stripCounts, 4, counts.length, 0], [TAG.planar, 3, 1, 1],
    [TAG.extra, 3, 1, 2], [TAG.sampleFormat, 3, 4, 0],
  ];
  entries.sort((a, b) => a[0] - b[0]);
  const ifdSize = 2 + entries.length * 12 + 4;
  let extraAt = align4(ifdOffset + ifdSize);
  const bitsAt = extraAt; extraAt = align4(extraAt + 8);
  const fmtAt = extraAt; extraAt = align4(extraAt + 8);
  const offsAt = extraAt; extraAt = align4(extraAt + offsets.length * 4);
  const cntsAt = extraAt; extraAt = align4(extraAt + counts.length * 4);
  const extra = new Uint8Array(extraAt - (ifdOffset + ifdSize));
  const edv = new DataView(extra.buffer);
  const base = ifdOffset + ifdSize;
  for (let i = 0; i < 4; i++) { edv.setUint16(bitsAt - base + i * 2, 8, true); edv.setUint16(fmtAt - base + i * 2, 1, true); }
  for (let i = 0; i < offsets.length; i++) edv.setUint32(offsAt - base + i * 4, offsets[i], true);
  for (let i = 0; i < counts.length; i++) edv.setUint32(cntsAt - base + i * 4, counts[i], true);
  for (const e of entries) {
    if (e[0] === TAG.bits) e[3] = bitsAt;
    else if (e[0] === TAG.stripOffsets) e[3] = offsAt;
    else if (e[0] === TAG.stripCounts) e[3] = cntsAt;
    else if (e[0] === TAG.sampleFormat) e[3] = fmtAt;
  }
  const ifd = new Uint8Array(ifdSize);
  const dv = new DataView(ifd.buffer);
  dv.setUint16(0, entries.length, true);
  entries.forEach((e, i) => writeEntry(dv, 2 + i * 12, e[0], e[1], e[2], e[3]));
  dv.setUint32(2 + entries.length * 12, 0, true);
  const head = parts[0];
  head[0] = 0x49; head[1] = 0x49; new DataView(head.buffer).setUint16(2, 42, true);
  new DataView(head.buffer).setUint32(4, ifdOffset, true);
  parts.push(ifd, extra);
  return new Blob(parts, { type: 'image/tiff' });
}
export default { encodeTiffStreaming };
