

























const FE_BIG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf']);

function feToU8(buffer) {
  return buffer instanceof ArrayBuffer ? new Uint8Array(buffer)
       : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
const feKey4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);




function feSections(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0) !== 0x38425053) throw new Error('不是 PSD');
  const psb = dv.getUint16(4) === 2;
  let o = 26;
  o += 4 + dv.getUint32(o);                     
  o += 4 + dv.getUint32(o);                     
  const u64 = p => dv.getUint32(p) * 0x100000000 + dv.getUint32(p + 4);
  const lmiLen = psb ? u64(o) : dv.getUint32(o); o += psb ? 8 : 4;
  const lmiStart = o, lmiEnd = o + lmiLen;
  const liLen = psb ? u64(o) : dv.getUint32(o); o += psb ? 8 : 4;
  const liEnd = o + liLen;
  return { psb, lmiStart, lmiEnd, liEnd, mode: dv.getUint16(24), depth: dv.getUint16(22) };
}



function feLocateBlock(tail, psb, keys) {
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const u64 = p => dv.getUint32(p) * 0x100000000 + dv.getUint32(p + 4);
  let o = 0;
  if (o + 4 <= tail.length) { o += 4 + dv.getUint32(o); }   
  while (o + 12 <= tail.length) {
    const sig = feKey4(tail, o);
    if (sig !== '8BIM' && sig !== '8B64') break;
    const k = feKey4(tail, o + 4);
    const big = sig === '8B64' || (psb && FE_BIG_KEYS.has(k));
    const len = big ? u64(o + 8) : dv.getUint32(o + 8);
    const dataStart = o + 8 + (big ? 8 : 4), dataEnd = dataStart + len;
    if (dataEnd > tail.length) break;
    if (keys.includes(k)) return { key: k, blockStart: o, lenOffset: o + 8, big, dataStart, dataEnd, len };
    o = dataEnd; while ((o - dataStart) % 4 && o < tail.length) o++;
  }
  return null;
}



function feParseEntries(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = p => dv.getUint32(p) * 0x100000000 + dv.getUint32(p + 4);
  const version = dv.getInt32(0);
  if (version < 1 || version > 3) throw new Error('FEid 版本非法：' + version);
  const entries = [];
  let o = 4;
  while (o + 8 <= data.length) {
    const length = u64(o); o += 8;
    const entryStart = o, entryEnd = o + length;
    if (length <= 0 || entryEnd > data.length) break;
    const idLen = data[o]; let id = ''; for (let i = 0; i < idLen; i++) id += String.fromCharCode(data[o + 1 + i]);
    o += 1 + idLen;
    const effectVersion = dv.getInt32(o); o += 4;
    const effectLength = u64(o); o += 8;
    const effStart = o;
    const rect = { top: dv.getInt32(o), left: dv.getInt32(o + 4), bottom: dv.getInt32(o + 8), right: dv.getInt32(o + 12) }; o += 16;
    const depth = dv.getInt32(o), maxChannels = dv.getInt32(o + 4); o += 8;
    const channels = [];
    for (let c = 0; c < maxChannels + 2; c++) {
      const exists = dv.getInt32(o); o += 4;
      if (!exists) { channels.push(null); continue; }
      const len = u64(o); o += 8;
      const compression = dv.getUint16(o);
      channels.push({ index: c, compression, data: data.subarray(o + 2, o + len) });
      o += len;
    }
    const effEnd = effStart + effectLength;
    let extra = null;
    let p = Math.max(o, effEnd);
    if (p < entryEnd && data[p]) {
      p++;
      const r = { top: dv.getInt32(p), left: dv.getInt32(p + 4), bottom: dv.getInt32(p + 8), right: dv.getInt32(p + 12) }; p += 16;
      const len = u64(p); p += 8;
      extra = { rect: r, compression: dv.getUint16(p), data: data.subarray(p + 2, p + len), raw: data.subarray(Math.max(o, effEnd), p + len) };
      p += len;
    }
    o = entryStart + length; while ((o - entryStart) % 4) o++;   
    entries.push({ id, effectVersion, rect, depth, maxChannels, channels, extra,
                   _entryStart: entryStart, _entryEnd: entryEnd, _effStart: effStart, _effEnd: effEnd,
                   _tail: data.subarray(p, entryEnd),
                   
                   __length: length, __effectLength: effectLength, __span: 8 + (o - entryStart) });
  }
  return { version, entries };
}







export function parseFilterEffectsBlock(bytes) {
  const data = feToU8(bytes);
  const m = feParseEntries(data);
  
  const last = m.entries[m.entries.length - 1];
  let consumed = 4;
  if (last) { consumed = last._entryStart - 8 + last.__span; }   
  m._tail = data.subarray(Math.min(consumed, data.length)).slice();
  return m;
}







export function writeFilterEffectsBlock(m) {
  const parts = [feI32(m.version)];
  for (const e of m.entries || []) {
    const idBytes = new Uint8Array(1 + e.id.length);
    idBytes[0] = e.id.length;
    for (let i = 0; i < e.id.length; i++) idBytes[1 + i] = e.id.charCodeAt(i) & 255;
    const eff = [feI32(e.rect.top), feI32(e.rect.left), feI32(e.rect.bottom), feI32(e.rect.right),
                 feI32(e.depth), feI32(e.maxChannels)];
    for (let c = 0; c < e.maxChannels + 2; c++) {
      const ch = e.channels[c];
      if (!ch) { eff.push(feI32(0)); continue; }
      eff.push(feI32(1), feU64(ch.data.length + 2), Uint8Array.of((ch.compression >> 8) & 255, ch.compression & 255), ch.data);
    }
    const effBytes = feConcat(eff);
    const body = feConcat([idBytes, feI32(e.effectVersion), feU64(e.__effectLength ?? effBytes.length), effBytes,
                           e.extra ? e.extra.raw : new Uint8Array(0), e._tail || new Uint8Array(0)]);
    const span = e.__span ?? (8 + body.length + ((4 - body.length % 4) % 4));
    const pad = span - 8 - body.length;
    parts.push(feU64(e.__length ?? body.length), body, new Uint8Array(Math.max(0, pad)));
  }
  if (m._tail && m._tail.length) parts.push(feToU8(m._tail));
  return feConcat(parts);
}





export function parseFilterEffects(buffer) {
  const u8 = feToU8(buffer);
  const s = feSections(u8);
  const tail = u8.subarray(s.liEnd, s.lmiEnd);
  const blk = feLocateBlock(tail, s.psb, ['FEid', 'FXid']);
  if (!blk) return null;
  const parsed = feParseEntries(tail.subarray(blk.dataStart, blk.dataEnd));
  return { key: blk.key, version: parsed.version, entries: parsed.entries, psb: s.psb, mode: s.mode };
}




function feDecodeRle4(data, w, h) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Uint8Array(w * h);
  let o = h * 4, p = 0;
  for (let y = 0; y < h; y++) {
    const end = o + dv.getUint32(y * 4);
    while (o < end && p < out.length) {
      let n = data[o++]; if (n > 127) n -= 256;
      if (n >= 0) { for (let i = 0; i <= n && p < out.length; i++) out[p++] = data[o++]; }
      else if (n !== -128) { const v = data[o++]; for (let i = 0; i < 1 - n && p < out.length; i++) out[p++] = v; }
    }
    o = end;
  }
  return out;
}

function fePackBits(data) {          
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



function feEncodeChannel(plane, w, h) {
  const rows = []; let total = 0;
  for (let y = 0; y < h; y++) { const r = fePackBits(plane.subarray(y * w, y * w + w)); rows.push(r); total += r.length; }
  const out = new Uint8Array(2 + h * 4 + total), dv = new DataView(out.buffer);
  dv.setUint16(0, 1);
  let o = 2 + h * 4;
  rows.forEach((r, y) => { dv.setUint32(2 + y * 4, r.length); out.set(r, o); o += r.length; });
  return out;
}


export function decodeFilterEffectsEntry(entry) {
  const w = entry.rect.right - entry.rect.left, h = entry.rect.bottom - entry.rect.top;
  if (entry.depth !== 8) throw new Error('只支持 8 位 FEid 解码');
  const get = c => {
    const ch = entry.channels[c];
    if (!ch) return null;
    if (ch.compression === 0) return ch.data.subarray(0, w * h);
    if (ch.compression === 1) return feDecodeRle4(ch.data, w, h);
    throw new Error('FEid 通道压缩方式不支持：' + ch.compression);
  };
  const r = get(0), g = get(1) || r, b = get(2) || r, a = get(entry.maxChannels + 1);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r ? r[i] : 0; rgba[i * 4 + 1] = g ? g[i] : 0; rgba[i * 4 + 2] = b ? b[i] : 0;
    rgba[i * 4 + 3] = a ? a[i] : 255;
  }
  return { rgba, width: w, height: h, rect: entry.rect };
}



function feU64(v) {
  const b = new Uint8Array(8), d = new DataView(b.buffer);
  d.setUint32(0, Math.floor(v / 0x100000000)); d.setUint32(4, v >>> 0);
  return b;
}
function feI32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v); return b; }
function feConcat(list) {
  let n = 0; for (const b of list) n += b.length;
  const out = new Uint8Array(n); let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}


function fePlanesFor(patch, rect, mode) {
  const w = rect.right - rect.left, h = rect.bottom - rect.top;
  
  if (patch.planes) {
    if (patch.planes.color.some(pl => pl.length !== w * h)) throw new Error('FEid 预分色平面尺寸与条目 rect 不符');
    return patch.planes;
  }
  const src = patch.rgba, sw = patch.width, sh = patch.height;
  const ox = patch.left || 0, oy = patch.top || 0;          
  const n = w * h;
  const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n), A = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const sy = rect.top + y - oy; if (sy < 0 || sy >= sh) continue;
    for (let x = 0; x < w; x++) {
      const sx = rect.left + x - ox; if (sx < 0 || sx >= sw) continue;
      const si = (sy * sw + sx) * 4, di = y * w + x;
      R[di] = src[si]; G[di] = src[si + 1]; B[di] = src[si + 2]; A[di] = src[si + 3];
    }
  }
  if (mode === 1) {                                        
    const g = new Uint8Array(n);
    for (let i = 0; i < n; i++) g[i] = Math.round(0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]);
    return { color: [g], alpha: A };
  }
  if (mode === 4) {                                        
    const C = new Uint8Array(n), M = new Uint8Array(n), Y = new Uint8Array(n), K = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = R[i] / 255, g = G[i] / 255, b = B[i] / 255, k = 1 - Math.max(r, g, b), ik = 1 - k;
      C[i] = Math.round(255 - (ik > 1e-6 ? (1 - r - k) / ik : 0) * 255);
      M[i] = Math.round(255 - (ik > 1e-6 ? (1 - g - k) / ik : 0) * 255);
      Y[i] = Math.round(255 - (ik > 1e-6 ? (1 - b - k) / ik : 0) * 255);
      K[i] = Math.round(255 - k * 255);
    }
    return { color: [C, M, Y, K], alpha: A };
  }
  return { color: [R, G, B], alpha: A };
}


function feBuildEntry(entry, patch, mode) {
  if (entry.depth !== 8) throw new Error(`FEid 条目 ${entry.id} 位深 ${entry.depth}，只支持 8 位`);
  const rect = entry.rect, w = rect.right - rect.left, h = rect.bottom - rect.top;
  const { color, alpha } = fePlanesFor(patch, rect, mode);
  const parts = [];
  parts.push(feI32(rect.top), feI32(rect.left), feI32(rect.bottom), feI32(rect.right));
  parts.push(feI32(entry.depth), feI32(entry.maxChannels));
  for (let c = 0; c < entry.maxChannels + 2; c++) {
    let bytes = null;
    if (c < color.length) bytes = feEncodeChannel(color[c], w, h);
    else if (c === entry.maxChannels + 1) bytes = feEncodeChannel(alpha, w, h);
    else if (c < entry.maxChannels) bytes = null;                       
    else if (entry.channels[c]) { const ch = entry.channels[c]; bytes = feConcat([Uint8Array.of(ch.compression >> 8, ch.compression & 255), ch.data]); } 
    if (!bytes) { parts.push(feI32(0)); continue; }
    parts.push(feI32(1), feU64(bytes.length), bytes);
  }
  const eff = feConcat(parts);
  const idBytes = new Uint8Array(1 + entry.id.length);
  idBytes[0] = entry.id.length; for (let i = 0; i < entry.id.length; i++) idBytes[1 + i] = entry.id.charCodeAt(i);
  const body = feConcat([idBytes, feI32(entry.effectVersion), feU64(eff.length), eff,
                       entry.extra ? entry.extra.raw : new Uint8Array(0), entry._tail]);
  const pad = (4 - body.length % 4) % 4;
  return feConcat([feU64(body.length), body, new Uint8Array(pad)]);
}










export function patchFilterEffectsTail(tail, psb, mode, patch) {
  const blk = feLocateBlock(tail, psb, ['FEid', 'FXid']);
  if (!blk) throw new Error('文件里没有滤镜输入缓存块（FEid）');
  const data = tail.subarray(blk.dataStart, blk.dataEnd);
  const { entries } = feParseEntries(data);
  const hit = entries.find(e => e.id === patch.id);
  if (!hit) throw new Error(`FEid 里没有 id=${patch.id} 的条目（现有：${entries.map(e => e.id).join(' / ') || '无'}）`);
  const newEntry = feBuildEntry(hit, patch, mode);
  
  const from = hit._entryStart - 8;
  let to = hit._entryEnd; while ((to - hit._entryStart) % 4 && to < data.length) to++;
  const newData = feConcat([data.subarray(0, from), newEntry, data.subarray(to)]);
  const head = tail.subarray(0, blk.dataStart);
  const after = tail.subarray(blk.dataEnd + ((4 - blk.len % 4) % 4));
  const pad = (4 - newData.length % 4) % 4;
  const out = feConcat([head, newData, new Uint8Array(pad), after]);
  const odv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  if (blk.big) { odv.setUint32(blk.lenOffset, 0); odv.setUint32(blk.lenOffset + 4, newData.length); }
  else odv.setUint32(blk.lenOffset, newData.length);
  return out;
}





export function writeFilterEffects(buffer, patch) {
  const u8 = feToU8(buffer);
  const s = feSections(u8);
  const tail = u8.subarray(s.liEnd, s.lmiEnd);
  const newTail = patchFilterEffectsTail(tail, s.psb, s.mode, patch);
  const lmiLen = (s.liEnd - s.lmiStart) + newTail.length;
  const lenField = s.psb ? feU64(lmiLen) : feI32(lmiLen);
  const out = feConcat([u8.subarray(0, s.lmiStart - lenField.length), lenField, u8.subarray(s.lmiStart, s.liEnd), newTail, u8.subarray(s.lmiEnd)]);
  return out.buffer;
}


export function filterEffectsIdOf(so) {
  if (!so) return null;
  if (typeof so.placedId === 'string') return so.placedId;
  const d = so._raw && so._raw.descriptor;            
  return (d && typeof d.placed === 'string') ? d.placed : null;
}













export function buildFilterEffectsPatch(o) {
  const so = o.so;
  const id = filterEffectsIdOf(so);
  if (!id) return null;
  const fe = parseFilterEffects(o.buffer);
  if (!fe || !fe.entries.some(e => e.id === id)) return null;
  let li = o.layerInfoBase || null;
  if (!li) {
    if (!o.resolveBase || !so.deformFilter) return null;
    li = o.resolveBase(so);
  }
  if (!li.points || li.points.length !== li.xn * li.yn) return null;
  const res = o.renderWarp({ backend: o.backend, image: o.image, imageKey: o.imageKey || ('feid:' + id),
    layerInfo: li, docWidth: o.docWidth, docHeight: o.docHeight,
    supersample: o.supersample != null ? o.supersample : 2, fit: o.fit || { mode: 'stretch' } });
  if (!res || !res.data) return null;
  return { id, rgba: res.data, width: res.width, height: res.height, left: 0, top: 0 };
}
