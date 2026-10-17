













import { parsePsdFull } from './psd-parse.js';
import { parseFilterEffectsBlock, writeFilterEffectsBlock, decodeFilterEffectsEntry } from './psd-filter-effects.js';

const BIG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf']);
const toAB = b => b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const key4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);

function locate(ab) {
  const psd = parsePsdFull(ab), s = psd.sections, u8 = new Uint8Array(ab), dv = new DataView(ab);
  let o = s.globalAddlStart;
  while (s.globalAddlStart && o + 12 <= s.globalAddlEnd) {
    const sig = key4(u8, o); if (sig !== '8BIM' && sig !== '8B64') break;
    const k = key4(u8, o + 4);
    const big = sig === '8B64' || (s.psb && BIG_KEYS.has(k));
    const len = big ? dv.getUint32(o + 8) * 0x100000000 + dv.getUint32(o + 12) : dv.getUint32(o + 8);
    const dataStart = o + 8 + (big ? 8 : 4);
    const end = dataStart + len + ((4 - (len % 4)) % 4);
    if (k === 'FEid' || k === 'FXid') return { s, key: k, start: o, big, dataStart, len, end };
    o = end;
  }
  return { s, key: null };
}
function replaceBlock(ab, loc, data) {
  const u8 = new Uint8Array(ab), s = loc.s;
  let block;
  if (data) {
    const lenB = new Uint8Array(loc.big ? 8 : 4), d = new DataView(lenB.buffer);
    if (loc.big) { d.setUint32(0, Math.floor(data.length / 0x100000000)); d.setUint32(4, data.length >>> 0); } else d.setUint32(0, data.length);
    const pad = (4 - (data.length % 4)) % 4;
    block = new Uint8Array(8 + lenB.length + data.length + pad);
    block.set(u8.subarray(loc.start, loc.start + 8), 0); block.set(lenB, 8); block.set(data, 8 + lenB.length);
  } else block = new Uint8Array(0);
  const out = new Uint8Array(u8.length - (loc.end - loc.start) + block.length);
  out.set(u8.subarray(0, loc.start), 0); out.set(block, loc.start); out.set(u8.subarray(loc.end), loc.start + block.length);
  const delta = out.length - u8.length, odv = new DataView(out.buffer);
  if (s.lmiLenFieldSize === 8) {
    const n = odv.getUint32(s.lmiLenOffset) * 0x100000000 + odv.getUint32(s.lmiLenOffset + 4) + delta;
    odv.setUint32(s.lmiLenOffset, Math.floor(n / 0x100000000)); odv.setUint32(s.lmiLenOffset + 4, n >>> 0);
  } else odv.setUint32(s.lmiLenOffset, odv.getUint32(s.lmiLenOffset) + delta);
  return out.buffer;
}
function entriesOf(ab) {
  const loc = locate(ab);
  if (!loc.key) return { loc, model: null };
  const model = parseFilterEffectsBlock(new Uint8Array(ab, loc.dataStart, loc.len));
  return { loc, model };
}
function decodeRle4(data, w, h) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Uint8Array(w * h);
  let o = h * 4, p = 0;
  for (let y = 0; y < h; y++) {
    const end = o + dv.getUint32(y * 4);
    p = y * w;
    const rowEnd = p + w;
    while (o < end && p < rowEnd) {
      let n = data[o++]; if (n > 127) n -= 256;
      if (n >= 0) { for (let i = 0; i <= n && p < rowEnd; i++) out[p++] = data[o++]; }
      else if (n !== -128) { const v = data[o++]; for (let i = 0; i < 1 - n && p < rowEnd; i++) out[p++] = v; }
    }
    o = end;
  }
  return out;
}
function packBits(data) {
  const out = [], len = data.length; let i = 0;
  const runAt = p => { let r = 1; while (p + r < len && r < 128 && data[p + r] === data[p]) r++; return r; };
  while (i < len) {
    const run = runAt(i);
    if (run >= 3) { out.push(257 - run, data[i]); i += run; continue; }
    const start = i; i += run;
    while (i < len && (i - start) < 128) { const r = runAt(i); if (r >= 3 || i - start + r > 128) break; i += r; }
    out.push(i - start - 1); for (let k = start; k < i; k++) out.push(data[k]);
  }
  return Uint8Array.from(out);
}
function encodeRle4(gray, w, h) {
  const rows = []; let total = 0;
  for (let y = 0; y < h; y++) { const r = packBits(gray.subarray(y * w, y * w + w)); rows.push(r); total += r.length; }
  const out = new Uint8Array(h * 4 + total), dv = new DataView(out.buffer);
  let o = h * 4;
  rows.forEach((r, y) => { dv.setUint32(y * 4, r.length); out.set(r, o); o += r.length; });
  return out;
}


export function readFilterInput(buffer, placedId) {
  const { model } = entriesOf(toAB(buffer));
  const e = model && model.entries.find(x => x.id === placedId);
  if (!e) return null;
  try { return decodeFilterEffectsEntry(e); } catch { return null; }
}

export function readFilterMask(buffer, placedId) {
  const { model } = entriesOf(toAB(buffer));
  const e = model && model.entries.find(x => x.id === placedId);
  if (!e || !e.extra) return null;
  const r = e.extra.rect, w = r.right - r.left, h = r.bottom - r.top;
  if (!(w > 0 && h > 0)) return null;
  let gray;
  if (e.extra.compression === 0) gray = Uint8Array.from(e.extra.data.subarray(0, w * h));
  else if (e.extra.compression === 1) gray = decodeRle4(e.extra.data, w, h);
  else return null;
  return { gray, rect: { ...r } };
}
function extraRaw(mask) {
  const r = mask.rect, w = r.right - r.left, h = r.bottom - r.top;
  const data = encodeRle4(mask.gray, w, h);
  const out = new Uint8Array(1 + 16 + 8 + 2 + data.length), dv = new DataView(out.buffer);
  out[0] = 1;
  dv.setInt32(1, r.top); dv.setInt32(5, r.left); dv.setInt32(9, r.bottom); dv.setInt32(13, r.right);
  const len = data.length + 2;
  dv.setUint32(17, Math.floor(len / 0x100000000)); dv.setUint32(21, len >>> 0);
  dv.setUint16(25, 1);
  out.set(data, 27);
  return out;
}




export function writeFilterMask(buffer, placedId, mask) {
  const ab = toAB(buffer);
  const { loc, model } = entriesOf(ab);
  const e = model && model.entries.find(x => x.id === placedId);
  if (!e) throw new Error('这一层没有滤镜输入缓存（FEid 条目），滤镜蒙版没处放');
  e.extra = mask ? { rect: { ...mask.rect }, compression: 1, raw: extraRaw(mask) } : null;
  delete e.__length; delete e.__span;                      
  e._tail = new Uint8Array(0);
  return replaceBlock(ab, loc, writeFilterEffectsBlock(model));
}

export function removeFilterEntry(buffer, placedId) {
  const ab = toAB(buffer);
  const { loc, model } = entriesOf(ab);
  if (!model) return ab;
  const keep = model.entries.filter(x => x.id !== placedId);
  if (keep.length === model.entries.length) return ab;
  if (!keep.length) return replaceBlock(ab, loc, null);
  model.entries = keep;
  return replaceBlock(ab, loc, writeFilterEffectsBlock(model));
}
function plane(rgba, w, h, c) { const o = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) o[i] = rgba[i * 4 + c]; return o; }




export function upsertFilterEntry(buffer, placedId, input, mask = null) {
  let ab = toAB(buffer);
  const r = input.rect, w = r.right - r.left, h = r.bottom - r.top;
  const ch = c => ({ compression: 1, data: encodeRle4(plane(input.rgba, w, h, c), w, h) });
  const entry = { id: placedId, effectVersion: 1, rect: { ...r }, depth: 8, maxChannels: 3,
    channels: [ch(0), ch(1), ch(2), null, ch(3)], extra: mask ? { rect: { ...mask.rect }, compression: 1, raw: extraRaw(mask) } : null,
    _tail: new Uint8Array(0) };
  let { loc, model } = entriesOf(ab);
  if (!model) {
    
    const u8 = new Uint8Array(ab), s = loc.s;
    const big = !!s.psb;
    const blk = new Uint8Array(8 + (big ? 8 : 4) + 4);
    blk.set([0x38, 0x42, 0x49, 0x4d, 0x46, 0x45, 0x69, 0x64], 0);
    const bdv = new DataView(blk.buffer);
    if (big) bdv.setUint32(12, 4); else bdv.setUint32(8, 4);
    bdv.setInt32(8 + (big ? 8 : 4), 3);
    let at, prefix = new Uint8Array(0);
    if (s.globalAddlStart) at = s.globalAddlEnd;
    else if (s.globalMaskEnd > s.globalMaskStart) at = s.globalMaskEnd;
    else { at = s.globalMaskStart; prefix = new Uint8Array(4); }
    const out = new Uint8Array(u8.length + prefix.length + blk.length);
    out.set(u8.subarray(0, at), 0); out.set(prefix, at); out.set(blk, at + prefix.length); out.set(u8.subarray(at), at + prefix.length + blk.length);
    const odv = new DataView(out.buffer), delta = prefix.length + blk.length;
    if (s.lmiLenFieldSize === 8) {
      const n = odv.getUint32(s.lmiLenOffset) * 0x100000000 + odv.getUint32(s.lmiLenOffset + 4) + delta;
      odv.setUint32(s.lmiLenOffset, Math.floor(n / 0x100000000)); odv.setUint32(s.lmiLenOffset + 4, n >>> 0);
    } else odv.setUint32(s.lmiLenOffset, odv.getUint32(s.lmiLenOffset) + delta);
    ab = out.buffer;
    ({ loc, model } = entriesOf(ab));
    model.entries = []; model._tail = new Uint8Array(0);
  }
  model.entries = model.entries.filter(x => x.id !== placedId).concat([entry]);
  return replaceBlock(ab, loc, writeFilterEffectsBlock(model));
}

export function maskSampler(mask, extendWhite = true) {
  if (!mask) return () => 255;
  const r = mask.rect, w = r.right - r.left, g = mask.gray, out = extendWhite ? 255 : 0;
  return (x, y) => (x < r.left || y < r.top || x >= r.right || y >= r.bottom) ? out : g[(y - r.top) * w + (x - r.left)];
}
export default { readFilterInput, readFilterMask, writeFilterMask, removeFilterEntry, maskSampler };
