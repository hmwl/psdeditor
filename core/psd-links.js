



















import { parsePsdFull } from './psd-parse.js';
import { writeImageResource, removeImageResource } from './psd-write.js';

function toAB(buffer) {
  return buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
function readResource(u8, want) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 26; o += 4 + dv.getUint32(o);
  const irLen = dv.getUint32(o); o += 4;
  const end = o + irLen;
  while (o + 12 <= end) {
    if (dv.getUint32(o) !== 0x3842494d) break;
    const id = dv.getUint16(o + 4); const nl = u8[o + 6];
    let p = o + 7 + nl; if ((1 + nl) % 2) p++;
    const len = dv.getUint32(p); p += 4;
    if (p + len > end) break;
    if (id === want) return u8.subarray(p, p + len);
    o = p + len + (len % 2);
  }
  return null;
}

export function layerIdsOf(buffer) {
  const ab = toAB(buffer);
  const psd = parsePsdFull(ab);
  const dv = new DataView(ab);
  return psd.layers.map(l => {
    const b = (l.blocks || []).find(x => x.key === 'lyid' && x.dataLength >= 4);
    return b ? dv.getUint32(b.dataOffset) : null;
  });
}



export function readLinkGroups(buffer) {
  const ab = toAB(buffer), u8 = new Uint8Array(ab);
  let ids;
  try { ids = layerIdsOf(ab); } catch { return { byIndex: [], disabled: [], byId: new Map() }; }
  const g = readResource(u8, 1026), en = readResource(u8, 1072);
  const byIndex = ids.map(() => 0), disabled = ids.map(() => false), byId = new Map();
  if (g) {
    const dv = new DataView(g.buffer, g.byteOffset, g.byteLength);
    for (let i = 0; i < ids.length && i * 2 + 2 <= g.length; i++) byIndex[i] = dv.getUint16(i * 2);
  }
  if (en) for (let i = 0; i < ids.length && i < en.length; i++) disabled[i] = en[i] === 0 && byIndex[i] !== 0;
  ids.forEach((id, i) => { if (id != null && byIndex[i]) byId.set(id, { gid: byIndex[i], off: disabled[i] }); });
  return { byIndex, disabled, byId };
}





export function writeLinkGroups(buffer, byId) {
  let ab = toAB(buffer);
  const u8 = new Uint8Array(ab);
  if (u8.length < 30 || new DataView(ab).getUint32(0) !== 0x38425053) return ab;
  let ids;
  try { ids = layerIdsOf(ab); } catch { return ab; }
  const n = ids.length;
  if (!n) return ab;
  const gids = ids.map(id => (id != null && byId && byId.get(id)) || null);
  const count = new Map();
  for (const x of gids) if (x && x.gid) count.set(x.gid, (count.get(x.gid) || 0) + 1);
  const g = new Uint8Array(n * 2), gdv = new DataView(g.buffer), en = new Uint8Array(n).fill(1);
  let any = false;
  gids.forEach((x, i) => {
    if (!x || !x.gid || (count.get(x.gid) || 0) < 2) return;
    gdv.setUint16(i * 2, x.gid & 0xffff); any = true;
    if (x.off) en[i] = 0;
  });
  const had = readResource(u8, 1026), hadEn = readResource(u8, 1072);
  if (!any && !had) return ab;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => v === b[i]);
  if (!same(had, g)) ab = writeImageResource(ab, 1026, g, { exact: true });
  if (hadEn || any) { const cur = readResource(new Uint8Array(ab), 1072); if (!same(cur, en)) ab = writeImageResource(ab, 1072, en, { exact: true }); }
  return ab;
}

export function nextLinkGroupId(byId) {
  let m = 0;
  for (const v of byId.values()) if (v.gid > m) m = v.gid;
  return Math.min(0xffff, m + 1);
}
export { removeImageResource };
export default { readLinkGroups, writeLinkGroups, layerIdsOf, nextLinkGroupId };
