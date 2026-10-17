






















import { serializeDescriptor } from './psd-descriptor.js';
import { writePsd } from './psd-write.js';
import { readPlacedIdentity } from './psd-parse.js';

const GLOBAL_BIG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf']);

function uuid() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const h = [];
  for (let i = 0; i < 32; i++) h.push(Math.floor(Math.random() * 16).toString(16));
  h[12] = '4'; h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
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
  pascal(s) { this.u8(s.length); this.ascii(s); }
  unicode(s) { this.u32(s.length + 1); const b = new Uint8Array((s.length + 1) * 2), d = new DataView(b.buffer);
    for (let i = 0; i < s.length; i++) d.setUint16(i * 2, s.charCodeAt(i)); this.push(b); }
  bytes(b) { this.push(b); }
  finish() { const out = new Uint8Array(this.len); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
}

const long = (o, keys) => { o.__long = Object.fromEntries(keys.map(k => [k, true])); return o; };
const doub = (o, keys) => { o.__doub = Object.fromEntries(keys.map(k => [k, true])); return o; };


function identityWarp(w, h) {
  const H = [], V = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { H.push(w * c / 3); V.push(h * r / 3); }
  return {
    __explicit: { __classID: true }, __name: '', __classID: 'warp',
    warpStyle: { __enumType: 'warpStyle', value: 'warpCustom' },
    ...doub({ warpValue: 0, warpPerspective: 0, warpPerspectiveOther: 0 }, ['warpValue', 'warpPerspective', 'warpPerspectiveOther']),
    warpRotate: { __enumType: 'Ornt', value: 'Hrzn' },
    bounds: doub({ __name: '', __classID: 'classFloatRect', 'Top ': 0, Left: 0, Btom: h, Rght: w }, ['Top ', 'Left', 'Btom', 'Rght']),
    ...long({ uOrder: 4, vOrder: 4 }, ['uOrder', 'vOrder']),
    customEnvelopeWarp: {
      __name: '', __classID: 'customEnvelopeWarp',
      meshPoints: { __objectArray: true, __itemsCount: 16, __name: '', __classID: 'rationalPoint',
        Hrzn: { __unit: '#Pxl', values: H }, Vrtc: { __unit: '#Pxl', values: V } },
    },
  };
}

function soldDescriptor({ id, placed, trnf, w, h, res }) {
  const d = { __name: '', __classID: 'null' };
  d.Idnt = id; d.placed = placed;
  d.PgNm = 1; d.totalPages = 1; d.Crop = 1;
  d.frameStep = long({ __name: '', __classID: 'null', numerator: 0, denominator: 600 }, ['numerator', 'denominator']);
  d.duration = long({ __name: '', __classID: 'null', numerator: 0, denominator: 600 }, ['numerator', 'denominator']);
  d.frameCount = 1; d.Annt = 16; d.Type = 2;
  d.Trnf = trnf.slice(); d.nonAffineTransform = trnf.slice();
  d.warp = identityWarp(w, h);
  d['Sz  '] = doub({ __name: '', __classID: 'Pnt ', Wdth: w, Hght: h }, ['Wdth', 'Hght']);
  d.Rslt = { __unit: '#Rsl', value: res || 72 };
  d.comp = -1;
  d.compInfo = long({ __name: '', __classID: 'null', compID: -1, originalCompID: -1 }, ['compID', 'originalCompID']);
  d.__long = { PgNm: true, totalPages: true, Crop: true, frameCount: true, Annt: true, Type: true, comp: true };
  d.__explicit = { warp: true };
  return d;
}

export function buildSoLdData(o) {
  const w = new W();
  w.ascii('soLD'); w.u32(4); w.u32(16);
  w.bytes(serializeDescriptor(soldDescriptor(o)));
  return w.finish();
}
export function buildPlLdData({ id, trnf, w: width, h: height }) {
  const w = new W();
  w.ascii('plcL'); w.u32(3); w.pascal(id);
  w.i32(1); w.i32(1); w.i32(16); w.i32(2);
  for (const v of trnf) w.f64(v);
  w.u32(0); w.u32(16);
  w.bytes(serializeDescriptor(identityWarp(width, height)));
  return w.finish();
}

export function buildLinkedFileRecord({ id, name, data, fileType = '8BPS' }) {
  const body = new W();
  body.ascii('liFD'); body.u32(2); body.pascal(id); body.unicode(name);
  body.ascii(fileType.padEnd(4).slice(0, 4)); body.ascii('8BIM');
  body.u64(data.length); body.u8(0); body.bytes(data);
  const b = body.finish();
  const rec = new W();
  rec.u64(b.length); rec.bytes(b);
  const pad = (4 - ((8 + b.length) % 4)) % 4;
  if (pad) rec.bytes(new Uint8Array(pad));
  return rec.finish();
}

export function createSmartOps(h) {
  function validate(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if ([1, 2, 3].includes(layer.groupType)) throw h.opFail(i, op, '组不能直接转换为智能对象（本编辑器暂不支持把整个组打包）');
    if (layer.isSmartObject) throw h.opFail(i, op, '这一层已经是智能对象');
    const s = op.source;
    if (!s || !(s.width > 0) || !(s.height > 0) || !s.data || s.data.length < s.width * s.height * 4)
      throw h.opFail(i, op, 'source 必须是 { data: RGBA, width, height }');
    if (op.embedded != null && !(op.embedded instanceof Uint8Array && op.embedded.length > 26 && op.embedded[0] === 0x38 && op.embedded[1] === 0x42))
      throw h.opFail(i, op, 'embedded 必须是一份 PSD 的字节（Uint8Array，8BPS 开头）');
    return { affected: [op.index], _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」转换为智能对象` };
  }

  function apply(ab, state, op, plan) {
    const u8 = new Uint8Array(ab);
    const psd = h.parsePsdFull(ab);
    const layer = psd.layers[op.index];
    if (!layer) throw h.opFail(plan._i, op, '图层不存在');
    if (layer.placedBlocks && layer.placedBlocks.length)
      return { buffer: ab, result: { changed: false, note: `图层 ${op.index} 已经是智能对象` } };
    const s = op.source, W0 = s.width | 0, H0 = s.height | 0;
    const b = op.bounds || layer.bounds;
    const L = +b.left, T = +b.top, R = +b.right, B = +b.bottom;
    const trnf = [L, T, R, T, R, B, L, B];
    const id = op.id || uuid(), placed = op.placedId || uuid();
    const lname = layer.unicodeName || layer.name || '图层';
    const fileName = op.name || `${lname}.psd`;

    
    

    const rgba = s.data instanceof Uint8ClampedArray ? new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.length) : s.data;
    const embedded = op.embedded || writePsd({ width: W0, height: H0,
      layers: [{ name: lname, bounds: { top: 0, left: 0, bottom: H0, right: W0 }, rgba }], composite: null });

    
    let out = h.upsertLayerBlock(ab, op.index, 'PlLd', buildPlLdData({ id, trnf, w: W0, h: H0 }));
    out = h.upsertLayerBlock(out, op.index, 'SoLd', buildSoLdData({ id, placed, trnf, w: W0, h: H0, res: op.resolution }));

    
    out = appendLinkedFile(h, out, buildLinkedFileRecord({ id, name: fileName, data: embedded }));

    void u8;
    const check = h.parsePsdFull(out);
    const l2 = check.layers[op.index];
    const ok = l2 && l2.placedBlocks && l2.placedBlocks.length >= 2 && (check.linkedFiles || []).some(f => f.id === id && f.bytes && f.bytes.length === embedded.length);
    if (!ok) throw h.opFail(plan._i, op, '转换为智能对象的自检没通过（放置块或内嵌文件没写对），已放弃这次改动');
    return { buffer: out, result: { changed: true, id, placed, embeddedBytes: embedded.length,
      note: `图层 ${op.index}「${lname}」→ 智能对象（内嵌 ${W0}×${H0}）` } };
  }

  






  function validateDetach(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (!layer.isSmartObject && !(layer.placedBlocks && layer.placedBlocks.length))
      throw h.opFail(i, op, `图层 ${op.index}「${layer.name}」不是智能对象`);
    return { affected: [op.index], _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」拆成独立的智能对象` };
  }
  function applyDetach(ab, state, op, plan) {
    const psd = h.parsePsdFull(ab);
    const layer = psd.layers[op.index];
    const blocks = (layer && layer.placedBlocks) || [];
    if (!blocks.length) throw h.opFail(plan._i, op, '这一层没有放置块');
    const u8 = new Uint8Array(ab.slice(0));
    let oldId = null;
    for (const b of blocks) {
      try { const idn = readPlacedIdentity(u8.subarray(b.dataOffset, b.dataOffset + b.dataLength), b.key); if (idn.linkId) { oldId = idn.linkId; if (b.key === 'SoLd') break; } } catch {}
    }
    const lf = oldId && (psd.linkedFiles || []).find(f => f.id === oldId && f.bytes);
    if (!lf) throw h.opFail(plan._i, op, '找不到这个智能对象的内嵌文件（外部链接的智能对象不能拆成独立副本）');
    
    let newId = uuid();
    if (newId.length !== oldId.length) { let t = ''; while (t.length < oldId.length) t += Math.floor(Math.random() * 16).toString(16); newId = t.slice(0, oldId.length); }
    const enc = (str, wide) => { const out = new Uint8Array(str.length * (wide ? 2 : 1));
      for (let k = 0; k < str.length; k++) { const c = str.charCodeAt(k); if (wide) { out[k * 2] = c >> 8; out[k * 2 + 1] = c & 255; } else out[k] = c & 255; } return out; };
    let hits = 0;
    for (const b of blocks) {
      for (const wide of [false, true]) {
        const from = enc(oldId, wide), to = enc(newId, wide);
        const end = b.dataOffset + b.dataLength - from.length;
        for (let o = b.dataOffset; o <= end; o++) {
          let m = true; for (let q = 0; q < from.length; q++) if (u8[o + q] !== from[q]) { m = false; break; }
          if (m) { u8.set(to, o); hits++; o += from.length - 1; }
        }
      }
    }
    if (!hits) throw h.opFail(plan._i, op, '放置块里没找到内嵌文件的 id，已放弃');
    const rec = buildLinkedFileRecord({ id: newId, name: lf.name || '智能对象.psb', data: lf.bytes, fileType: (lf.fileType || '8BPB') });
    const out = appendLinkedFile(h, u8.buffer, rec);
    return { buffer: out, result: { changed: true, id: newId, oldId, note: `图层 ${op.index} 已拆成独立的智能对象（新内嵌文件 ${newId.slice(0, 8)}…）` } };
  }

  return { convertToSmartObject: { validate, apply, structural: true },
           detachSmartObject: { validate: validateDetach, apply: applyDetach, structural: true } };
}


function appendLinkedFile(h, ab, record) {
  const psd = h.parsePsdFull(ab);
  const s = psd.sections;
  const psb = !!s.psb;
  const u8 = new Uint8Array(ab), dv = new DataView(ab);
  const key4 = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  let insertAt, replaceFrom, replaceTo, newBlock;
  
  let o = s.globalAddlStart, hit = null;
  while (s.globalAddlStart && o + 12 <= s.globalAddlEnd) {
    const sig = key4(o); if (sig !== '8BIM' && sig !== '8B64') break;
    const k = key4(o + 4);
    const big = sig === '8B64' || (psb && GLOBAL_BIG_KEYS.has(k));
    const len = big ? dv.getUint32(o + 8) * 0x100000000 + dv.getUint32(o + 12) : dv.getUint32(o + 8);
    const dataStart = o + 8 + (big ? 8 : 4);
    const end = dataStart + len + ((4 - (len % 4)) % 4);
    if (k === 'lnk2') { hit = { o, big, len, dataStart, end }; break; }
    o = end;
  }
  const lenField = (big, n) => { const b = new Uint8Array(big ? 8 : 4), d = new DataView(b.buffer);
    if (big) { d.setUint32(0, Math.floor(n / 0x100000000)); d.setUint32(4, n >>> 0); } else d.setUint32(0, n >>> 0); return b; };
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const r = new Uint8Array(n); let q = 0; for (const p of parts) { r.set(p, q); q += p.length; } return r; };
  if (hit) {
    
    const oldData = u8.subarray(hit.dataStart, hit.dataStart + hit.len);
    const oldPad = (4 - (hit.len % 4)) % 4;
    const data = cat([oldData, new Uint8Array(oldPad), record]);
    newBlock = cat([u8.subarray(hit.o, hit.o + 8), lenField(hit.big, data.length), data]);
    replaceFrom = hit.o; replaceTo = hit.end;
  } else {
    const big = psb;
    newBlock = cat([new Uint8Array([0x38, 0x42, 0x49, 0x4d]), new Uint8Array([0x6c, 0x6e, 0x6b, 0x32]), lenField(big, record.length), record]);
    const hasGlobalMaskField = s.globalMaskEnd > s.globalMaskStart;
    insertAt = hasGlobalMaskField ? (s.globalAddlEnd || s.globalMaskEnd) : s.globalMaskStart;
    if (!hasGlobalMaskField) newBlock = cat([new Uint8Array(4), newBlock]);   
    replaceFrom = insertAt; replaceTo = insertAt;
  }
  const out = cat([u8.subarray(0, replaceFrom), newBlock, u8.subarray(replaceTo)]);
  const delta = newBlock.length - (replaceTo - replaceFrom);
  const odv = new DataView(out.buffer);
  if (s.lmiLenFieldSize === 8) {
    const n = odv.getUint32(s.lmiLenOffset) * 0x100000000 + odv.getUint32(s.lmiLenOffset + 4) + delta;
    odv.setUint32(s.lmiLenOffset, Math.floor(n / 0x100000000)); odv.setUint32(s.lmiLenOffset + 4, n >>> 0);
  } else odv.setUint32(s.lmiLenOffset, odv.getUint32(s.lmiLenOffset) + delta);
  return out.buffer;
}









export function patchPlacedTransform(buffer, layer, quad) {
  if (!Array.isArray(quad) || quad.length !== 8 || !quad.every(Number.isFinite)) return buffer;
  const blocks = (layer && layer.placedBlocks) || [];
  if (!blocks.length) return buffer;
  const out = buffer.slice(0), u8 = new Uint8Array(out), dv = new DataView(out);
  const keyAt = (o, key) => {                    
    const len = key.length === 4 ? 0 : key.length;
    if (dv.getUint32(o) !== len) return false;
    for (let q = 0; q < key.length; q++) if (u8[o + 4 + q] !== key.charCodeAt(q)) return false;
    return true;
  };
  for (const b of blocks) {
    const a = b.dataOffset, z = b.dataOffset + b.dataLength;
    if (b.key === 'PlLd' || b.key === 'plLd') {
      
      let o = a + 8; const n = u8[o]; o += 1 + n + 16;
      if (o + 64 <= z) for (let q = 0; q < 8; q++) dv.setFloat64(o + q * 8, quad[q]);
      continue;
    }
    for (const key of ['Trnf', 'nonAffineTransform']) {
      const klen = key.length === 4 ? 8 : 4 + key.length;
      for (let o = a; o + klen + 8 <= z; o++) {
        if (!keyAt(o, key)) continue;
        let p = o + klen;
        if (String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]) !== 'VlLs' || dv.getUint32(p + 4) !== 8) continue;
        p += 8;
        for (let q = 0; q < 8 && p + 12 <= z; q++) {
          if (String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]) !== 'doub') break;
          dv.setFloat64(p + 4, quad[q]); p += 12;
        }
        break;
      }
    }
  }
  return out;
}

export default { createSmartOps, buildSoLdData, buildPlLdData, buildLinkedFileRecord, patchPlacedTransform };
