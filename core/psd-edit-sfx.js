























import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';
import { STACK_PLUGIN_IDS } from './stack-modes.js';
import { setBlendOptions } from './smart-filter-spec.js';

export function readSoLdBytes(bytes) {
  const r = new Reader(bytes);
  const sig = r.key4(); if (sig !== 'soLD') throw new Error('SoLd 块签名不对：' + sig);
  const version = r.u32(), descVersion = r.u32();
  return { version, descVersion, desc: readDescriptor(r) };
}
export function writeSoLdBytes({ version, descVersion, desc }) {
  const body = serializeDescriptor(desc), out = new Uint8Array(12 + body.length), dv = new DataView(out.buffer);
  out.set([0x73, 0x6f, 0x4c, 0x44], 0); dv.setUint32(4, version); dv.setUint32(8, descVersion); out.set(body, 12);
  return out;
}
const soLdOf = (layer) => (layer && (layer.placedBlocks || []).find(b => b.key === 'SoLd')) || null;
const plLdOf = (layer) => (layer && (layer.placedBlocks || []).find(b => b.key === 'PlLd' || b.key === 'plLd')) || null;


export function readLayerSoLd(ab, layer) {
  const b = soLdOf(layer); if (!b) return null;
  return readSoLdBytes(new Uint8Array(ab, b.dataOffset, b.dataLength).slice());
}

const PLUGIN_TO_MODE = Object.fromEntries(Object.entries(STACK_PLUGIN_IDS).map(([m, id]) => [id, m]));

export function stackModeOfDesc(desc) {
  if (!desc) return 'none';
  const p = desc.imageStackPlugin;
  const id = p && (p.__class || p.value || (typeof p === 'string' ? p : null));
  return (desc.Type === 3 && id && PLUGIN_TO_MODE[id]) || 'none';
}

export function withStackMode(desc, mode) {
  const id = mode && mode !== 'none' ? STACK_PLUGIN_IDS[mode] : null;
  if (mode && mode !== 'none' && !id) throw new Error('不认识的堆栈模式：' + mode);
  const out = {};
  let put = false;
  for (const k of Object.keys(desc)) {
    if (k === 'imageStackPlugin') continue;
    if (k === 'Type') { out.Type = id ? 3 : (desc.Type === 3 ? 2 : desc.Type); if (id) { out.imageStackPlugin = { __class: id, __name: '' }; put = true; } continue; }
    out[k] = desc[k];
  }
  if (id && !put) { out.Type = 3; out.imageStackPlugin = { __class: id, __name: '' }; }
  if (out.Type !== undefined) out.__long = { ...(out.__long || {}), Type: true };   
  return out;
}

export function createSfxOps(h) {
  const needSoLd = (state, op, i) => {
    const layer = h.needLayer(state, i, op, op.index);
    if (!layer.isSmartObject) throw h.opFail(i, op, '这一层不是智能对象');
    return layer;
  };
  const loadSoLd = (ab, op, plan) => {
    const psd = h.parsePsdFull(ab), layer = psd.layers[op.index];
    const blk = soLdOf(layer);
    if (!blk) throw h.opFail(plan._i, op, '这个智能对象没有 SoLd 放置描述符（旧版 PlLd-only 的文件），写不了');
    try { return { layer, blk, s: readSoLdBytes(new Uint8Array(ab, blk.dataOffset, blk.dataLength).slice()) }; }
    catch (e) { throw h.opFail(plan._i, op, 'SoLd 描述符读不了：' + (e && e.message || e)); }
  };

  const setSmartFilterEntry = {
    validate(state, op, i) {
      const layer = needSoLd(state, op, i);
      if (!Number.isInteger(op.at) || op.at < 0) throw h.opFail(i, op, 'at 必须是 filterFXList 里的下标（≥ 0 的整数）');
      if (op.Fltr !== undefined && (!op.Fltr || typeof op.Fltr !== 'object' || !op.Fltr.__classID)) throw h.opFail(i, op, 'Fltr 必须是带 __classID 的描述符');
      if (op.blendOptions !== undefined) {
        const b = op.blendOptions;
        if (!b || typeof b !== 'object') throw h.opFail(i, op, 'blendOptions 必须是 { opacity?, mode? }');
        if (b.opacity != null && !(Number.isFinite(+b.opacity) && b.opacity >= 0 && b.opacity <= 100)) throw h.opFail(i, op, 'blendOptions.opacity 必须是 0…100');
      }
      return { affected: [op.index], _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」改智能滤镜第 ${op.at} 条` };
    },
    apply(ab, state, op, plan) {
      const { s } = loadSoLd(ab, op, plan);
      const fx = s.desc.filterFX, list = fx && fx.filterFXList;
      if (!Array.isArray(list) || op.at >= list.length) throw h.opFail(plan._i, op, `这个智能对象只有 ${Array.isArray(list) ? list.length : 0} 条智能滤镜，没有第 ${op.at} 条`);
      const e = { ...list[op.at] };
      if (op.Fltr) {
        if (e.Fltr && e.Fltr.__classID !== op.Fltr.__classID) throw h.opFail(plan._i, op, `第 ${op.at} 条是 ${e.Fltr.__classID}，不能换成 ${op.Fltr.__classID}（换滤镜种类请删掉重加）`);
        e.Fltr = op.Fltr;
      }
      if (op.blendOptions) setBlendOptions(e, op.blendOptions);
      const rgb = v => ({ __name: '', __classID: 'RGBC', __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true }, 'Rd  ': +v[0], 'Grn ': +v[1], 'Bl  ': +v[2] });
      if (Array.isArray(op.fg) && e.FrgC) e.FrgC = rgb(op.fg);
      if (Array.isArray(op.bg) && e.BckC) e.BckC = rgb(op.bg);
      if (op.enabled !== undefined) e.enab = !!op.enabled;
      list[op.at] = e;
      const out = h.upsertLayerBlock(ab, op.index, 'SoLd', writeSoLdBytes(s));
      return { buffer: out, result: { changed: true, note: `图层 ${op.index} 智能滤镜第 ${op.at} 条已改` } };
    },
    structural: true,
  };

  const setStackMode = {
    validate(state, op, i) {
      const layer = needSoLd(state, op, i);
      if (op.mode !== 'none' && !STACK_PLUGIN_IDS[op.mode]) throw h.opFail(i, op, `mode 只能是 none / ${Object.keys(STACK_PLUGIN_IDS).join(' / ')}`);
      return { affected: [op.index], _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」堆栈模式 → ${op.mode}` };
    },
    apply(ab, state, op, plan) {
      const { layer, s } = loadSoLd(ab, op, plan);
      s.desc = withStackMode(s.desc, op.mode);
      let out = h.upsertLayerBlock(ab, op.index, 'SoLd', writeSoLdBytes(s));
      
      const pl = plLdOf(h.parsePsdFull(out).layers[op.index]);
      if (pl) {
        const u8 = new Uint8Array(out), off = pl.dataOffset + 8 + 1 + u8[pl.dataOffset + 8] + 12;
        if (off + 4 <= pl.dataOffset + pl.dataLength) {
          out = h.copyAB(out); const dv = new DataView(out);
          const cur = dv.getInt32(off);
          dv.setInt32(off, op.mode === 'none' ? (cur === 3 ? 2 : cur) : 3);
        }
      }
      
      const chk = readLayerSoLd(out, h.parsePsdFull(out).layers[op.index]);
      if (stackModeOfDesc(chk && chk.desc) !== op.mode) throw h.opFail(plan._i, op, '写堆栈模式后的自检没通过，已放弃这次改动');
      void layer;
      return { buffer: out, result: { changed: true } };
    },
    structural: true,
  };

  const copyLayerBlocks = {
    validate(state, op, i) {
      h.needLayer(state, i, op, op.from); h.needLayer(state, i, op, op.to);
      if (!Array.isArray(op.keys) || !op.keys.length || !op.keys.every(k => typeof k === 'string' && k.length === 4)) throw h.opFail(i, op, 'keys 必须是非空的四字符块名数组');
      if (op.keys.some(k => ['lsct', 'lsdk', 'luni', 'lyid', 'SoLd', 'PlLd', 'TySh'].includes(k))) throw h.opFail(i, op, '分组 / 名称 / id / 智能对象 / 文字块不能这样拷（会破坏图层身份）');
      return { affected: [op.to], note: `图层 ${op.from} → ${op.to} 拷贝 ${op.keys.join(' ')}` };
    },
    apply(ab, state, op) {
      let out = ab, n = 0;
      for (const k of op.keys) {
        const b = h.readLayerBlock(out, op.from, k);
        if (!b) continue;
        out = h.upsertLayerBlock(out, op.to, k, b.slice()); n++;
      }
      return { buffer: out, result: { changed: n > 0 } };
    },
    structural: true,
  };

  return { setSmartFilterEntry, setStackMode, copyLayerBlocks };
}
