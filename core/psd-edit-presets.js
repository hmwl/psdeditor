










import { serializeDescriptor } from './psd-descriptor.js';
import { encodePatternRecord } from './pat.js';

const PATT_KEYS = ['Patt', 'Pat2', 'Pat3'];

export function createPresetOps(h) {
  const toU8 = h.toU8;

  
  const rgbaOf = v => {
    if (typeof v === 'string') {
      if (typeof atob === 'function') return Uint8Array.from(atob(v), c => c.charCodeAt(0));
      return new Uint8Array(globalThis.Buffer.from(v, 'base64'));
    }
    return Array.isArray(v) ? Uint8Array.from(v) : v;
  };
  function validateAddPatterns(state, op, i) {
    if (!Array.isArray(op.patterns) || !op.patterns.length) throw h.opFail(i, op, 'patterns 必须是非空数组');
    op.patterns = op.patterns.map(p => (p && p.rgba != null ? { ...p, rgba: rgbaOf(p.rgba) } : p));
    op.patterns.forEach((p, k) => {
      if (!p || typeof p.id !== 'string' || !p.id) throw h.opFail(i, op, `patterns[${k}].id 必须是非空字符串（图案 uuid）`);
      if (!(p.width > 0 && p.height > 0)) throw h.opFail(i, op, `patterns[${k}] 尺寸必须为正`);
      if (!p.rgba || p.rgba.length < p.width * p.height * 4) throw h.opFail(i, op, `patterns[${k}].rgba 长度不对`);
      if (/[^\x20-\x7e]/.test(p.id) || p.id.length > 255) throw h.opFail(i, op, `patterns[${k}].id 只能是 ASCII（Pascal 串）`);
    });
    return { affected: [], _i: i, note: `写入 ${op.patterns.length} 个图案到全局图案资源` };
  }
  function applyAddPatterns(ab, state, op, plan) {
    const doc = h.parsePsdDocument(ab);
    const have = new Set();
    for (const b of doc.globalAdditional) if (PATT_KEYS.includes(b.key) && b.model && Array.isArray(b.model.patterns))
      for (const p of b.model.patterns) if (p && p.id) have.add(p.id);
    const add = op.patterns.filter(p => !have.has(p.id));
    if (!add.length) return { buffer: ab, result: { changed: false, note: '图案都已在文档里' } };
    const recs = [];
    for (const p of add) {
      const rec = encodePatternRecord(p);
      const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, rec.length);
      recs.push(len, rec, new Uint8Array((4 - (rec.length % 4)) % 4));
    }
    const depth = doc.header ? doc.header.depth : 8;
    const key = depth === 16 ? 'Pat2' : depth === 32 ? 'Pat3' : 'Patt';
    let blk = doc.globalAdditional.find(b => b.key === key);
    if (blk) {
      blk._raw = h.concat([toU8(blk._raw), ...recs]);
      blk.model = null;
    } else {
      blk = { sig: '8BIM', key, isBig: false, length: -1, _raw: h.concat(recs), _pad: new Uint8Array(0), model: null };
      
      let at = 0;
      while (at < doc.globalAdditional.length && ['Lr16', 'Lr32', 'Layr'].includes(doc.globalAdditional[at].key)) at++;
      doc.globalAdditional.splice(at, 0, blk);
    }
    const out = h.serializePsdDocument(doc);
    const buf = out.buffer.byteLength === out.length ? out.buffer : out.slice().buffer;
    return { buffer: buf, result: { changed: true, added: add.map(p => p.id), note: `写入 ${add.length} 个图案（${key}）` } };
  }

  function validateSetStyle(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (op.effects !== null && (!op.effects || typeof op.effects !== 'object') && !op.effectsBytes)
      throw h.opFail(i, op, 'effects 必须是图层效果描述符对象（或 null = 清除样式）');
    return { affected: [op.index], _i: i, note: `图层 ${op.index}「${layer.name}」整份替换图层样式` };
  }
  function applySetStyle(ab, state, op, plan) {
    let out = ab;
    for (const k of ['lmfx', 'lrFX']) out = h.upsertLayerBlock(out, op.index, k, null);
    if (op.effects === null && !op.effectsBytes) {
      out = h.upsertLayerBlock(out, op.index, 'lfx2', null);
      return { buffer: out, result: { changed: true, note: `图层 ${op.index} 清除图层样式` } };
    }
    const desc = op.effectsBytes ? toU8(op.effectsBytes) : serializeDescriptor({ ...op.effects, __classID: 'null' });
    const data = new Uint8Array(8 + desc.length), dv = new DataView(data.buffer);
    dv.setUint32(0, 0); dv.setUint32(4, 16); data.set(desc, 8);
    out = h.upsertLayerBlock(out, op.index, 'lfx2', data);
    return { buffer: out, result: { changed: true, note: `图层 ${op.index} 应用图层样式` } };
  }

  return {
    addPatterns: { validate: validateAddPatterns, apply: applyAddPatterns, structural: true },
    setLayerStyle: { validate: validateSetStyle, apply: applySetStyle, structural: true },
  };
}

export default { createPresetOps };
