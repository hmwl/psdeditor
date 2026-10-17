
















import { parsePsdFull, readPlacedIdentity } from './psd-parse.js';
import { syncLayerCountResources } from './psd-layer-resources.js';

const cat = parts => { let n = 0; for (const p of parts) n += p.length; const r = new Uint8Array(n); let q = 0; for (const p of parts) { r.set(p, q); q += p.length; } return r; };
const toAB = b => b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const lenField = (n, big) => { const b = new Uint8Array(big ? 8 : 4), d = new DataView(b.buffer);
  if (big) { d.setUint32(0, Math.floor(n / 0x100000000)); d.setUint32(4, n >>> 0); } else d.setUint32(0, n >>> 0); return b; };


export function transplantCheck(tgtBuf, srcBuf) {
  let T, S;
  try { T = parsePsdFull(toAB(tgtBuf)); S = parsePsdFull(toAB(srcBuf)); } catch (e) { return '文件解析失败：' + e.message; }
  if (T.header.depth !== S.header.depth) return `两份文档位深不同（${S.header.depth} 位 → ${T.header.depth} 位）`;
  if (T.header.mode !== S.header.mode) return '两份文档颜色模式不同';
  if (!!T.header.psb !== !!S.header.psb) return 'PSD 与 PSB 之间不能按字节搬图层';
  if (!T.layers.length || !S.layers.length) return '图层记录不在普通层信息段（16/32 位文档）';
  return null;
}


function rescalePath(u8, off, len, ky, kx) {
  const dv = new DataView(u8.buffer, u8.byteOffset + off, len);
  const sc = (o, k) => dv.setInt32(o, Math.round(dv.getInt32(o) * k));
  for (let o = 8; o + 26 <= len; o += 26) {
    const sel = dv.getUint16(o);
    if (sel === 1 || sel === 2 || sel === 4 || sel === 5) {
      for (let p = 0; p < 3; p++) { sc(o + 2 + p * 8, ky); sc(o + 6 + p * 8, kx); }
    } else if (sel === 7) { sc(o + 2, ky); sc(o + 6, kx); sc(o + 10, ky); sc(o + 14, kx); }
  }
}





export function transplantLayers(tgtBuf, srcBuf, srcIdx, insertAt) {
  const why = transplantCheck(tgtBuf, srcBuf); if (why) throw new Error(why);
  const tab = toAB(tgtBuf), sab = toAB(srcBuf);
  const T = parsePsdFull(tab), S = parsePsdFull(sab);
  const tu = new Uint8Array(tab), su = new Uint8Array(sab);
  const s = T.sections, psb = !!s.psb;
  const ky = S.header.height / T.header.height, kx = S.header.width / T.header.width;
  const ids = [...new Set(srcIdx)].filter(i => i >= 0 && i < S.layers.length).sort((a, b) => a - b);
  if (!ids.length) throw new Error('没有可搬的图层');
  const linkIds = new Set();
  const moved = ids.map(i => {
    const L = S.layers[i];
    const rec = su.slice(L.recordStart, L.recordEnd);
    if (kx !== 1 || ky !== 1) for (const b of (L.blocks || [])) {
      if (b.key === 'vmsk' || b.key === 'vsms') rescalePath(rec, b.dataOffset - L.recordStart, b.dataLength, ky, kx);
    }
    for (const b of (L.placedBlocks || [])) {
      try { const idn = readPlacedIdentity(su.subarray(b.dataOffset, b.dataOffset + b.dataLength), b.key); if (idn.linkId) linkIds.add(idn.linkId); } catch {}
    }
    return { rec, ch: su.subarray(L.chDataStart, L.chDataEnd) };
  });
  const at = Math.max(0, Math.min(T.layers.length, insertAt | 0));
  const list = T.layers.map(L => ({ rec: tu.subarray(L.recordStart, L.recordEnd), ch: tu.subarray(L.chDataStart, L.chDataEnd) }));
  list.splice(at, 0, ...moved);

  
  const lc = new Uint8Array(2); new DataView(lc.buffer).setInt16(0, s.layerCountRaw >= 0 ? list.length : -list.length);
  let li = cat([lc, ...list.map(x => x.rec), ...list.map(x => x.ch)]);
  const liAlign = (s.layerInfoEndAbs - s.layerInfoStart) % 4 === 0 ? 4 : 2;
  if (li.length % liAlign) li = cat([li, new Uint8Array(liAlign - (li.length % liAlign))]);

  
  const have = new Set((T.linkedFiles || []).map(f => f.id));
  const recs = [];
  for (const f of (S.linkedFiles || [])) {
    if (!linkIds.has(f.id) || have.has(f.id) || !f._off) continue;
    have.add(f.id);
    let r = su.slice(f._off.recStart, f._off.recEnd);
    if (r.length % 4) r = cat([r, new Uint8Array(4 - (r.length % 4))]);
    recs.push(r);
  }
  let globalSection = tu.subarray(s.globalMaskStart, s.globalAddlEnd);
  if (recs.length) {
    const add = cat(recs);
    const g0 = s.globalMaskStart, parts = [];
    const dv = new DataView(tab), key4 = o => String.fromCharCode(tu[o], tu[o + 1], tu[o + 2], tu[o + 3]);
    let o = s.globalAddlStart, done = false;
    parts.push(tu.subarray(g0, s.globalAddlStart));
    while (s.globalAddlStart && o + 12 <= s.globalAddlEnd) {
      const sig = key4(o); if (sig !== '8BIM' && sig !== '8B64') break;
      const k = key4(o + 4);
      const big = sig === '8B64' || (psb && ['lnk2', 'lnkD', 'lnk3', 'lnkE', 'Lr16', 'Lr32', 'Layr', 'Mtrn', 'Mt16', 'Mt32', 'Alph', 'FMsk', 'LMsk', 'FEid', 'FXid', 'PxSD', 'cinf'].includes(k));
      const len = big ? dv.getUint32(o + 8) * 0x100000000 + dv.getUint32(o + 12) : dv.getUint32(o + 8);
      const ds = o + 8 + (big ? 8 : 4), end = ds + len + ((4 - (len % 4)) % 4);
      if (k === 'lnk2' && !done) {
        const old = tu.subarray(ds, ds + len), pad = (4 - (len % 4)) % 4;
        const data = cat([old, new Uint8Array(pad), add]);
        parts.push(cat([tu.subarray(o, o + 8), lenField(data.length, big), data]));
        done = true;
      } else parts.push(tu.subarray(o, end));
      o = end;
    }
    if (o < s.globalAddlEnd) parts.push(tu.subarray(o, s.globalAddlEnd));
    if (!done) {
      let blk = cat([new Uint8Array([0x38, 0x42, 0x49, 0x4d, 0x6c, 0x6e, 0x6b, 0x32]), lenField(add.length, psb), add]);
      if (s.globalMaskEnd <= s.globalMaskStart) { parts.length = 0; blk = cat([new Uint8Array(4), blk]); parts.push(tu.subarray(g0, s.globalAddlEnd)); }
      parts.push(blk);
    }
    globalSection = cat(parts);
  }

  let lmi = cat([lenField(li.length, psb), li, globalSection]);
  const lmiAlign = (s.lmiEndAbs - s.lmiLenOffset - s.lmiLenFieldSize) % 4 === 0 ? 4 : 2;
  if (lmi.length % lmiAlign) lmi = cat([lmi, new Uint8Array(lmiAlign - (lmi.length % lmiAlign))]);
  const out = cat([tu.subarray(0, s.lmiLenOffset), lenField(lmi.length, psb), lmi, tu.subarray(s.lmiEndAbs)]);
  let buffer = out.buffer;
  try { buffer = syncLayerCountResources(buffer); } catch {}
  return { buffer, from: at, count: moved.length };
}

export default { transplantCheck, transplantLayers };
