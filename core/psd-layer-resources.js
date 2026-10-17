















import { parsePsdFull, parseSmartObjects } from './psd-parse.js';
import { writeImageResource } from './psd-write.js';

function readResources(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 26; o += 4 + dv.getUint32(o);
  const irLen = dv.getUint32(o); o += 4;
  const end = o + irLen, out = new Map();
  while (o + 12 <= end) {
    if (dv.getUint32(o) !== 0x3842494d) break;
    const id = dv.getUint16(o + 4); const nl = u8[o + 6];
    let p = o + 7 + nl; if ((1 + nl) % 2) p++;
    const len = dv.getUint32(p); p += 4;
    if (p + len > end) break;
    out.set(id, u8.subarray(p, p + len));
    o = p + len + (len % 2);
  }
  return out;
}

export function syncLayerCountResources(buffer) {
  let ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let u8 = new Uint8Array(ab);
  if (u8.length < 30 || new DataView(ab).getUint32(0) !== 0x38425053) return ab;
  let psd;
  try { psd = parsePsdFull(ab); } catch { return ab; }
  const n = psd.layers.length;
  if (!n) return ab;
  const res = readResources(u8);
  const changes = [];

  const g = res.get(1026);
  if (g && g.length !== n * 2) {
    const out = new Uint8Array(n * 2);
    out.set(g.subarray(0, Math.min(g.length - (g.length % 2), n * 2)));
    changes.push([1026, out]);
  }
  const en = res.get(1072);
  if (en && en.length !== n) {
    const out = new Uint8Array(n).fill(1);
    out.set(en.subarray(0, Math.min(en.length, n)));
    changes.push([1072, out]);
  }
  const sel = res.get(1069);
  if (sel && sel.length >= 2) {
    const dv = new DataView(sel.buffer, sel.byteOffset, sel.byteLength);
    const cnt = dv.getUint16(0), ids = [];
    for (let i = 0; i < cnt && 2 + (i + 1) * 4 <= sel.length; i++) ids.push(dv.getUint32(2 + i * 4));
    const live = new Set();
    let topId = null;
    psd.layers.forEach(l => {
      const b = (l.blocks || []).find(x => x.key === 'lyid' && x.dataLength >= 4);
      if (b) { const id = new DataView(ab).getUint32(b.dataOffset); live.add(id); if (l.groupType !== 3) topId = id; }
    });
    const keep = ids.filter(id => live.has(id));
    if (keep.length !== ids.length) {
      if (!keep.length && topId != null) keep.push(topId);
      const out = new Uint8Array(2 + keep.length * 4), odv = new DataView(out.buffer);
      odv.setUint16(0, keep.length);
      keep.forEach((id, i) => odv.setUint32(2 + i * 4, id));
      changes.push([1069, out]);
    }
  }
  const tgt = res.get(1024);
  if (tgt && tgt.length >= 2) {
    const v = new DataView(tgt.buffer, tgt.byteOffset, 2).getUint16(0);
    if (v >= n) { const out = new Uint8Array(2); new DataView(out.buffer).setUint16(0, n - 1); changes.push([1024, out]); }
  }
  for (const [id, data] of changes) ab = writeImageResource(ab, id, data, { exact: true });
  return ab;
}









export function pruneOrphanLinkedFiles(buffer) {
  let ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  let psd;
  try { psd = parsePsdFull(ab); } catch { return ab; }
  const files = psd.linkedFiles || [];
  if (!files.length) return ab;
  let used;
  try { used = new Set(parseSmartObjects(new Uint8Array(ab)).map(so => so.linkId).filter(Boolean)); } catch { return ab; }
  const orphans = files.filter(f => f.id && !used.has(f.id) && f._off && f._off.block);
  if (!orphans.length) return ab;
  
  const blocks = new Map();
  for (const f of files) { if (!f._off || !f._off.block) continue; const k = f._off.block.lenOffset; if (!blocks.has(k)) blocks.set(k, { blk: f._off.block, recs: [] }); blocks.get(k).recs.push(f); }
  const src = new Uint8Array(ab);
  const s = psd.sections;
  let totalDelta = 0;
  const pieces = [];   
  for (const { blk, recs } of [...blocks.values()].sort((a, b) => b.blk.lenOffset - a.blk.lenOffset)) {
    const keep = recs.filter(f => !orphans.includes(f));
    if (keep.length === recs.length) continue;
    const headStart = blk.lenOffset - 8;                  
    const lenSize = blk.dataOffset - blk.lenOffset;       
    if (!keep.length) { pieces.push([headStart, blk.end, new Uint8Array(0)]); totalDelta -= blk.end - headStart; continue; }
    const parts = keep.map(f => src.subarray(f._off.recStart, f._off.recEnd));
    let dataLen = 0; for (const p of parts) dataLen += p.length;
    const pad = (4 - (dataLen % 4)) % 4;
    const nb = new Uint8Array(8 + lenSize + dataLen + pad);
    nb.set(src.subarray(headStart, headStart + 8), 0);
    const dv = new DataView(nb.buffer);
    if (lenSize === 8) { dv.setUint32(8, Math.floor(dataLen / 0x100000000)); dv.setUint32(12, dataLen >>> 0); } else dv.setUint32(8, dataLen);
    let o = 8 + lenSize; for (const p of parts) { nb.set(p, o); o += p.length; }
    pieces.push([headStart, blk.end, nb]);
    totalDelta += nb.length - (blk.end - headStart);
  }
  if (!pieces.length) return ab;
  pieces.sort((a, b) => a[0] - b[0]);
  const chunks = []; let cur = 0;
  for (const [from, to, bytes] of pieces) { chunks.push(src.subarray(cur, from), bytes); cur = to; }
  chunks.push(src.subarray(cur));
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let q = 0; for (const c of chunks) { out.set(c, q); q += c.length; }
  const odv = new DataView(out.buffer);
  if (s.lmiLenFieldSize === 8) {
    const v = odv.getUint32(s.lmiLenOffset) * 0x100000000 + odv.getUint32(s.lmiLenOffset + 4) + totalDelta;
    odv.setUint32(s.lmiLenOffset, Math.floor(v / 0x100000000)); odv.setUint32(s.lmiLenOffset + 4, v >>> 0);
  } else odv.setUint32(s.lmiLenOffset, odv.getUint32(s.lmiLenOffset) + totalDelta);
  return out.buffer;
}

export default { syncLayerCountResources, pruneOrphanLinkedFiles };
