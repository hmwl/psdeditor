












import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';

function readSoLd(bytes) {
  const r = new Reader(bytes);
  const sig = r.key4(); if (sig !== 'soLD') throw new Error('SoLd 块签名不对：' + sig);
  const version = r.u32(), descVersion = r.u32();
  return { version, descVersion, desc: readDescriptor(r) };
}
function writeSoLd({ version, descVersion, desc }) {
  const body = serializeDescriptor(desc), out = new Uint8Array(12 + body.length), dv = new DataView(out.buffer);
  out.set([0x73, 0x6f, 0x4c, 0x44], 0); dv.setUint32(4, version); dv.setUint32(8, descVersion); out.set(body, 12);
  return out;
}

export function insertFilterFX(desc, entry) {
  const fx0 = desc.filterFX;
  if (fx0 && Array.isArray(fx0.filterFXList)) { fx0.filterFXList.push(entry); return desc; }
  const fx = { __name: '', __classID: 'filterFXStyle', enab: true, validAtPosition: true, filterMaskEnable: true, filterMaskLinked: false,
    filterMaskExtendWithWhite: true, filterFXList: [entry] };
  const out = {}; let put = false;
  for (const k of Object.keys(desc)) {
    if (k === 'filterFX') continue;
    out[k] = desc[k];
    if (k === 'Rslt') { out.filterFX = fx; put = true; }
  }
  if (!put) out.filterFX = fx;
  return out;
}

export function createGalleryOps(h) {
  function validate(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (!layer.isSmartObject) throw h.opFail(i, op, '这一层不是智能对象：滤镜库只有作用在智能对象上才会写成智能滤镜');
    if (!op.entry || op.entry.__classID !== 'filterFX' || !op.entry.Fltr) throw h.opFail(i, op, 'entry 必须是一条 filterFX 描述符（galleryFilterFXEntry 生成）');
    return { affected: [op.index], _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」追加智能滤镜「滤镜库」` };
  }
  function apply(ab, state, op, plan) {
    const psd = h.parsePsdFull(ab), layer = psd.layers[op.index];
    const blk = layer && (layer.placedBlocks || []).find(b => b.key === 'SoLd');
    if (!blk) throw h.opFail(plan._i, op, '这个智能对象没有 SoLd 放置描述符（旧版 PlLd-only 的文件），写不了智能滤镜');
    const u8 = new Uint8Array(ab, blk.dataOffset, blk.dataLength);
    let s;
    try { s = readSoLd(u8.slice()); } catch (e) { throw h.opFail(plan._i, op, 'SoLd 描述符读不了：' + (e && e.message || e)); }
    s.desc = insertFilterFX(s.desc, op.entry);
    const out = h.upsertLayerBlock(ab, op.index, 'SoLd', writeSoLd(s));
    
    const chk = h.parsePsdFull(out).layers[op.index];
    const b2 = chk && (chk.placedBlocks || []).find(b => b.key === 'SoLd');
    let ok = false;
    try { const d2 = readSoLd(new Uint8Array(out, b2.dataOffset, b2.dataLength).slice()).desc; const l = d2.filterFX && d2.filterFX.filterFXList; ok = Array.isArray(l) && l.length && l[l.length - 1].Fltr && l[l.length - 1].Fltr.__classID === op.entry.Fltr.__classID; } catch {}
    if (!ok) throw h.opFail(plan._i, op, '写智能滤镜后的自检没通过，已放弃这次改动');
    return { buffer: out, result: { changed: true, note: `图层 ${op.index} 追加智能滤镜「滤镜库」` } };
  }
  return { addGallerySmartFilter: { validate, apply, structural: true } };
}
export default { createGalleryOps, insertFilterFX };
