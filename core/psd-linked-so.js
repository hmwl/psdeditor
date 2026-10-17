





















import { Reader, readDescriptor, parsePsdFull } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';
import { buildLinkedFileRecord } from './psd-edit-smart.js';

const LINK_KEYS = new Set(['lnk2', 'lnkD', 'lnk3', 'lnkE']);
const BIG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf']);
const toAB = b => b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const key4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);


function globalBlocks(ab) {
  const psd = parsePsdFull(ab), s = psd.sections, u8 = new Uint8Array(ab), dv = new DataView(ab);
  const out = [];
  let o = s.globalAddlStart;
  while (s.globalAddlStart && o + 12 <= s.globalAddlEnd) {
    const sig = key4(u8, o); if (sig !== '8BIM' && sig !== '8B64') break;
    const k = key4(u8, o + 4);
    const big = sig === '8B64' || (s.psb && BIG_KEYS.has(k));
    const len = big ? dv.getUint32(o + 8) * 0x100000000 + dv.getUint32(o + 12) : dv.getUint32(o + 8);
    const dataStart = o + 8 + (big ? 8 : 4);
    const end = dataStart + len + ((4 - (len % 4)) % 4);
    out.push({ key: k, sig, big, start: o, dataStart, len, end: Math.min(end, s.globalAddlEnd) });
    o = end;
  }
  return { psd, s, blocks: out };
}


function readRecord(u8, start, limit) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const size = dv.getUint32(start) * 0x100000000 + dv.getUint32(start + 4);
  if (size <= 0) return null;
  let end = start + 8 + size; end += (4 - (size % 4)) % 4;
  if (end > limit) end = limit;
  const r = new Reader(u8.subarray(start + 8, Math.min(start + 8 + size, limit)));
  const rec = { recStart: start, recEnd: end };
  try {
    rec.type = r.key4(); rec.version = r.u32(); rec.id = r.pascal(); rec.name = r.unicode();
    rec.fileType = r.key4(); rec.creator = r.key4(); rec.dataSize = r.u64();
    if (r.u8()) { r.u32(); rec.openDesc = readDescriptor(r); }
    if (rec.type === 'liFE') {
      r.u32(); const d = readDescriptor(r);
      rec.link = { name: d['Nm  '] || '', fullPath: d.fullPath || '', originalPath: d.originalPath || '', relPath: d.relPath || '' };
      if (rec.version > 3) {
        const y = r.i32(), mo = r.u8(), da = r.u8(), hh = r.u8(), mi = r.u8(), sec = r.f64();
        rec.time = Date.UTC(y, mo, da, hh, mi, Math.floor(sec), Math.round((sec % 1) * 1000));
      }
      rec.fileSize = r.u64();
      if (rec.version === 2 && rec.fileSize > 0 && r.remaining >= rec.fileSize) rec.data = r.bytes(rec.fileSize).slice();
    } else if (rec.type === 'liFD') {
      rec.data = r.bytes(Math.min(rec.dataSize, r.remaining)).slice();
    }
  } catch {  }
  return rec;
}


export function parseLinkedRecords(buffer) {
  const ab = toAB(buffer), u8 = new Uint8Array(ab);
  const { blocks } = globalBlocks(ab);
  const out = [];
  for (const b of blocks) {
    if (!LINK_KEYS.has(b.key)) continue;
    let o = b.dataStart; const lim = b.dataStart + b.len;
    while (o + 8 <= lim) {
      const rec = readRecord(u8, o, lim);
      if (!rec) break;
      rec.block = b.key; rec.bytes = u8.slice(rec.recStart, rec.recEnd);
      out.push(rec);
      o = rec.recEnd;
    }
  }
  return out;
}

class W {
  constructor() { this.parts = []; this.len = 0; }
  push(b) { this.parts.push(b); this.len += b.length; }
  u8(v) { this.push(new Uint8Array([v & 255])); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); this.push(b); }
  i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); this.push(b); }
  u64(v) { const b = new Uint8Array(8), d = new DataView(b.buffer); d.setUint32(0, Math.floor(v / 0x100000000)); d.setUint32(4, v >>> 0); this.push(b); }
  f64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); this.push(b); }
  ascii(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; this.push(b); }
  unicode(s) { this.u32(s.length + 1); const b = new Uint8Array((s.length + 1) * 2), d = new DataView(b.buffer);
    for (let i = 0; i < s.length; i++) d.setUint16(i * 2, s.charCodeAt(i)); this.push(b); }
  finish() { const out = new Uint8Array(this.len); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

export function fileTypeOf(name, data) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (data && data.length > 4) {
    if (data[0] === 0x38 && data[1] === 0x42 && data[2] === 0x50 && data[3] === 0x53) return data[5] === 2 ? '8BPB' : '8BPS';
    if (data[0] === 0x89 && data[1] === 0x50) return 'png ';
    if (data[0] === 0xff && data[1] === 0xd8) return 'JPEG';
  }
  return { psd: '8BPS', psb: '8BPB', png: 'png ', jpg: 'JPEG', jpeg: 'JPEG', tif: 'TIFF', tiff: 'TIFF', gif: 'GIFf', webp: 'webp' }[ext] || '    ';
}






export function buildExternalRecord(o) {
  const cache = !!(o.cache && o.data);
  const version = cache ? 2 : 4;
  const w = new W();
  w.ascii('liFE'); w.u32(version);
  w.u8(o.id.length); w.ascii(o.id);
  w.unicode(o.name);
  w.ascii((o.fileType || fileTypeOf(o.name, o.data)).padEnd(4).slice(0, 4));
  w.push(new Uint8Array(4));                        
  w.u64(0);                                          
  w.u8(0);                                           
  w.u32(16);
  w.push(serializeDescriptor({ __name: '', __classID: 'ExternalFileLink', descVersion: 2,
    'Nm  ': o.name, fullPath: o.fullPath || o.name, originalPath: o.originalPath || o.name, relPath: o.relPath || o.name,
    __long: { descVersion: true } }));
  if (version > 3) {
    const t = new Date(o.time || Date.now());
    w.i32(t.getUTCFullYear()); w.u8(t.getUTCMonth()); w.u8(t.getUTCDate()); w.u8(t.getUTCHours()); w.u8(t.getUTCMinutes());
    w.f64(t.getUTCSeconds() + t.getUTCMilliseconds() / 1000);
  }
  const size = cache ? o.data.length : (o.fileSize || (o.data ? o.data.length : 0));
  w.u64(size);
  if (cache) w.push(o.data);
  const body = w.finish();
  const rec = new W(); rec.u64(body.length); rec.push(body);
  const pad = (4 - (body.length % 4)) % 4; if (pad) rec.push(new Uint8Array(pad));
  return rec.finish();
}

export function buildEmbeddedRecord({ id, name, data, fileType }) {
  return buildLinkedFileRecord({ id, name, data, fileType: fileType || fileTypeOf(name, data) });
}





export function rewriteLinkedRecords(buffer, mutate) {
  const ab = toAB(buffer), u8 = new Uint8Array(ab);
  const { s, blocks } = globalBlocks(ab);
  const list = parseLinkedRecords(ab);
  const next = mutate(list.slice()) || list;
  const byKey = new Map();
  for (const r of next) { const k = r.block || 'lnk2'; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r.bytes); }
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let q = 0; for (const p of parts) { o.set(p, q); q += p.length; } return o; };
  const mkBlock = (key, data) => {
    const big = s.psb && BIG_KEYS.has(key);
    const len = new Uint8Array(big ? 8 : 4), d = new DataView(len.buffer);
    if (big) { d.setUint32(0, Math.floor(data.length / 0x100000000)); d.setUint32(4, data.length >>> 0); } else d.setUint32(0, data.length);
    const pad = (4 - (data.length % 4)) % 4;
    return cat([new Uint8Array([0x38, 0x42, 0x49, 0x4d]), new Uint8Array([...key].map(c => c.charCodeAt(0))), len, data, new Uint8Array(pad)]);
  };
  const done = new Set();
  const parts = [];
  for (const b of blocks) {
    if (!LINK_KEYS.has(b.key)) { parts.push(u8.subarray(b.start, b.end)); continue; }
    if (done.has(b.key)) continue;                      
    done.add(b.key);
    const recs = byKey.get(b.key) || [];
    if (recs.length) parts.push(mkBlock(b.key, cat(recs)));
  }
  for (const [k, recs] of byKey) if (!done.has(k) && recs.length) parts.push(mkBlock(k, cat(recs)));
  const region = cat(parts);
  let from, to, prefix = new Uint8Array(0);
  if (s.globalAddlStart) { from = s.globalAddlStart; to = s.globalAddlEnd; }
  else if (s.globalMaskEnd > s.globalMaskStart) { from = to = s.globalMaskEnd; }
  else { from = to = s.globalMaskStart; prefix = new Uint8Array(4); }
  const out = cat([u8.subarray(0, from), prefix, region, u8.subarray(to)]);
  const delta = out.length - u8.length;
  const odv = new DataView(out.buffer);
  if (s.lmiLenFieldSize === 8) {
    const n = odv.getUint32(s.lmiLenOffset) * 0x100000000 + odv.getUint32(s.lmiLenOffset + 4) + delta;
    odv.setUint32(s.lmiLenOffset, Math.floor(n / 0x100000000)); odv.setUint32(s.lmiLenOffset + 4, n >>> 0);
  } else odv.setUint32(s.lmiLenOffset, odv.getUint32(s.lmiLenOffset) + delta);
  return out.buffer;
}


export function makeRecordExternal(buffer, id, o) {
  return rewriteLinkedRecords(buffer, list => list.map(r => r.id !== id ? r
    : { ...r, block: 'lnkE', bytes: buildExternalRecord({ id, name: o.name || r.name, data: o.data, cache: o.cache, time: o.time, fileSize: o.fileSize, fileType: o.fileType }) }));
}

export function makeRecordEmbedded(buffer, id, o) {
  return rewriteLinkedRecords(buffer, list => list.map(r => r.id !== id ? r
    : { ...r, block: 'lnk2', bytes: buildEmbeddedRecord({ id, name: o.name || r.name, data: o.data, fileType: o.fileType }) }));
}
export default { parseLinkedRecords, buildExternalRecord, buildEmbeddedRecord, rewriteLinkedRecords, makeRecordExternal, makeRecordEmbedded, fileTypeOf };
