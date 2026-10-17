










import { parsePsdDocument, serializePsdDocument } from './psd-document.js';

const toU8 = b => b instanceof Uint8Array ? b : new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer, b.byteOffset || 0, b.byteLength);


export function serializeEven(doc) {
  const unit = doc.header.psb ? 4 : 2;
  let out = serializePsdDocument(doc);
  for (let guard = 0; guard < 4; guard++) {
    const u8 = out, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 26; o += 4 + dv.getUint32(o); o += 4 + dv.getUint32(o);
    const lmi = doc.header.psb ? dv.getUint32(o + 4) : dv.getUint32(o); o += doc.header.psb ? 8 : 4;
    if (!lmi) break;
    const li = doc.header.psb ? dv.getUint32(o + 4) : dv.getUint32(o);
    if (li % unit === 0 || !doc.layerInfo) break;
    const pad = unit - (li % unit);
    const t = doc.layerInfo.tail || new Uint8Array(0), nt = new Uint8Array(t.length + pad); nt.set(t);
    doc.layerInfo.tail = nt;
    out = serializePsdDocument(doc);
  }
  return out;
}






export function normalizeHighDepthLayers(buffer) {
  const u8 = toU8(buffer);
  if (u8.length < 26 || ((u8[22] << 8) | u8[23]) === 8) return buffer;   
  let doc;
  try { doc = parsePsdDocument(u8); } catch { return buffer; }
  if (doc.header.depth === 8 || !doc.layerAndMask || doc.layerAndMask._writeMode === 'raw') return buffer;
  const blk = doc.globalAdditional.find(b => b.layerInfo && b.layerInfo.layers.length && (b.key === 'Lr16' || b.key === 'Lr32'));
  if (!blk || (doc.layerInfo && doc.layerInfo.layers.length)) return buffer;
  doc.layerInfo = { present: true, countRaw: blk.layerInfo.countRaw, layers: blk.layerInfo.layers, tail: new Uint8Array(0) };
  doc.globalAdditional = doc.globalAdditional.filter(b => b !== blk);
  return serializeEven(doc).slice().buffer;
}



export function hasHighDepthBlockLayers(buffer) {
  const u8 = toU8(buffer);
  if (u8.length < 26 || ((u8[22] << 8) | u8[23]) === 8) return false;   
  let doc;
  try { doc = parsePsdDocument(toU8(buffer)); } catch { return false; }
  if (doc.header.depth === 8 || !doc.layerAndMask || doc.layerAndMask._writeMode === 'raw') return false;
  if (doc.layerInfo && doc.layerInfo.layers.length) return false;
  return doc.globalAdditional.some(b => b.layerInfo && b.layerInfo.layers.length && (b.key === 'Lr16' || b.key === 'Lr32'));
}

export default { normalizeHighDepthLayers, hasHighDepthBlockLayers, serializeEven };
