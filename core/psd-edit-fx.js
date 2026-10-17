








































import { serializeDescriptor } from './psd-descriptor.js';
import { Reader, readDescriptor, parsePsdFull } from './psd-parse.js';







const FX = {
  dropShadow:      { key: 'DrSh',        multi: 'dropShadowMulti',    label: '投影' },
  innerShadow:     { key: 'IrSh',        multi: 'innerShadowMulti',   label: '内阴影' },
  outerGlow:       { key: 'OrGl',        multi: null,                 label: '外发光' },
  innerGlow:       { key: 'IrGl',        multi: null,                 label: '内发光' },
  bevelEmboss:     { key: 'ebbl',        multi: null,                 label: '斜面和浮雕' },
  satin:           { key: 'ChFX',        multi: null,                 label: '光泽' },
  colorOverlay:    { key: 'SoFi',        multi: 'solidFillMulti',     label: '颜色叠加' },
  gradientOverlay: { key: 'GrFl',        multi: 'gradientFillMulti',  label: '渐变叠加' },
  patternOverlay:  { key: 'patternFill', multi: null,                 label: '图案叠加' },
  stroke:          { key: 'FrFX',        multi: 'frameFXMulti',       label: '描边' },
};


const ALIAS = (() => {
  const m = new Map();
  const add = (name, canon) => m.set(String(name).toLowerCase().trim(), canon);
  for (const canon of Object.keys(FX)) {
    add(canon, canon);
    add(FX[canon].key, canon);
    if (FX[canon].multi) add(FX[canon].multi, canon);
  }
  
  const extra = {
    'drop-shadow': 'dropShadow', 'drop_shadow': 'dropShadow', 'shadow': 'dropShadow',
    'inner-shadow': 'innerShadow', 'inner_shadow': 'innerShadow',
    'outer-glow': 'outerGlow', 'outer_glow': 'outerGlow', 'glow': 'outerGlow',
    'inner-glow': 'innerGlow', 'inner_glow': 'innerGlow',
    'bevel': 'bevelEmboss', 'bevelandemboss': 'bevelEmboss', 'bevel-emboss': 'bevelEmboss',
    'bevel_emboss': 'bevelEmboss', 'emboss': 'bevelEmboss',
    'gloss': 'satin',
    'solidfill': 'colorOverlay', 'color-overlay': 'colorOverlay', 'color_overlay': 'colorOverlay',
    'colorfill': 'colorOverlay',
    'gradientfill': 'gradientOverlay', 'gradient-overlay': 'gradientOverlay',
    'gradient_overlay': 'gradientOverlay',
    'pattern-overlay': 'patternOverlay', 'pattern_overlay': 'patternOverlay',
    'patternoverlay': 'patternOverlay',
    'framefx': 'stroke', 'frame': 'stroke',
  };
  for (const k of Object.keys(extra)) add(k, extra[k]);
  return m;
})();


function effectMenu() {
  return Object.keys(FX).map(c => `${c}/${FX[c].key}`).join(' ');
}




const FX_BLOCK_KEYS = ['lmfx', 'lfx2', 'lfxs'];

const LEGACY_FX_KEY = 'lrFX';



const isMeta = k => k.startsWith('__');

function isEffectObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array)
    && v.__unit === undefined && v.__enumType === undefined && v.__class === undefined
    && v.__reference === undefined;
}






function slotOf(desc, spec) {
  for (const k of [spec.multi, spec.key]) {
    if (!k) continue;
    const v = desc[k];
    if (Array.isArray(v)) return { slotKey: k, items: v, multi: true };
    if (isEffectObj(v)) return { slotKey: k, items: [v], multi: false };
  }
  return null;
}


function presentEffects(desc) {
  const out = [];
  for (const canon of Object.keys(FX)) {
    const slot = slotOf(desc, FX[canon]);
    if (!slot) continue;
    out.push(slot.multi
      ? `${canon}(${slot.slotKey}，${slot.items.length} 条)`
      : `${canon}(${slot.slotKey})`);
  }
  return out;
}


function unknownEffectKeys(desc) {
  const known = new Set();
  for (const c of Object.keys(FX)) { known.add(FX[c].key); if (FX[c].multi) known.add(FX[c].multi); }
  const out = [];
  for (const k of Object.keys(desc)) {
    if (isMeta(k) || known.has(k)) continue;
    const v = desc[k];
    if (isEffectObj(v) && typeof v.enab === 'boolean') out.push(k);
    else if (Array.isArray(v) && v.length && isEffectObj(v[0]) && typeof v[0].enab === 'boolean') out.push(k);
  }
  return out;
}






function switchSnapshot(desc) {
  const snap = {};
  if (typeof desc.masterFXSwitch === 'boolean') snap.masterFXSwitch = desc.masterFXSwitch;
  for (const k of Object.keys(desc)) {
    if (isMeta(k)) continue;
    const v = desc[k];
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (isEffectObj(v[i]) && typeof v[i].enab === 'boolean') snap[`${k}#${i}`] = v[i].enab;
      }
    } else if (isEffectObj(v) && typeof v.enab === 'boolean') {
      snap[`${k}#0`] = v.enab;
    }
  }
  return snap;
}


function snapshotDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) if (a[k] !== b[k]) out.push(`${k}: ${a[k]} → ${b[k]}`);
  return out;
}

const hex = n => '0x' + n.toString(16).padStart(2, '0');













function probeBlock(h, ab, index, key) {
  let raw;
  try { raw = h.readLayerBlock(ab, index, key); } catch (e) { return { ok: false, key, reason: `读取 ${key} 块失败：${e && e.message}` }; }
  if (!raw) return { ok: false, key, reason: `图层 ${index} 没有 ${key} 块` };
  if (raw.length < 12) return { ok: false, key, reason: `${key} 块只有 ${raw.length} 字节，放不下 version(4)+descriptorVersion(4)+描述符` };

  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const version = dv.getUint32(0), descVersion = dv.getUint32(4);
  if (descVersion !== 16)
    return { ok: false, key, reason: `${key} 的 descriptorVersion=${descVersion}（只认识 16），不敢按描述符改写` };

  let desc, consumed;
  try {
    const r = new Reader(raw);
    r.seek(8);
    desc = readDescriptor(r);
    consumed = r.o;
  } catch (e) {
    return { ok: false, key, reason: `${key} 的描述符解析失败（${e && e.message}）` };
  }
  if (consumed > raw.length) return { ok: false, key, reason: `${key} 的描述符读过了块尾（读到 ${consumed} / 块长 ${raw.length}）` };

  let ser;
  try { ser = serializeDescriptor(desc); } catch (e) {
    return { ok: false, key, reason: `${key} 的描述符无法重新序列化（${e && e.message}）` };
  }
  const body = raw.subarray(8, consumed);
  if (ser.length !== body.length)
    return { ok: false, key, reason: `${key} 的描述符重序列化长度对不上（原 ${body.length} 字节 → 重建 ${ser.length} 字节）` };
  for (let i = 0; i < ser.length; i++) {
    if (ser[i] !== body[i])
      return { ok: false, key, reason: `${key} 的描述符重序列化在描述符第 ${i} 字节（块内偏移 ${8 + i}）就对不上（原 ${hex(body[i])} → 重建 ${hex(ser[i])}）` };
  }
  return {
    ok: true, key, raw, desc, version, descVersion,
    head: raw.subarray(0, 8),        
    tail: raw.subarray(consumed),    
    blockLen: raw.length,
  };
}


function fxBlocksOf(h, ab, index) {
  const desc = [], legacy = [];
  for (const k of FX_BLOCK_KEYS) if (h.findLayerBlockRange(ab, index, k)) desc.push(k);
  if (h.findLayerBlockRange(ab, index, LEGACY_FX_KEY)) legacy.push(LEGACY_FX_KEY);
  return { desc, legacy };
}








export function probeLayerEffects(buffer, index) {
  const ab = buffer instanceof ArrayBuffer ? buffer
    : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const found = fxBlocksOf(LOCAL_H, ab, index);
  const h = LOCAL_H;
  const blocks = found.desc.map(k => {
    const p = probeBlock(h, ab, index, k);
    return p.ok
      ? { key: k, ok: true, master: p.desc.masterFXSwitch, effects: presentEffects(p.desc), unknown: unknownEffectKeys(p.desc) }
      : { key: k, ok: false, reason: p.reason };
  });
  return { hasFx: !!(found.desc.length || found.legacy.length), blocks, legacy: found.legacy };
}






const LOCAL_H = {
  _blk(ab, index, key) {
    const psd = parsePsdFull(ab);
    const L = psd.layers[index];
    if (!L) throw new Error('图层不存在: index=' + index);
    return (L.blocks || []).find(b => b.key === key) || null;
  },
  readLayerBlock(ab, index, key) {
    const b = LOCAL_H._blk(ab, index, key);
    return b ? new Uint8Array(ab, b.dataOffset, b.dataLength) : null;
  },
  findLayerBlockRange(ab, index, key) {
    const b = LOCAL_H._blk(ab, index, key);
    return b ? { from: b.sigOffset, to: b.blockEnd, length: b.dataLength, isBig: !!b.isBig } : null;
  },
};



export function createFxOps(h) {
  

  









  function flipInBlock(ab, op, i, key, pick, enabled) {
    
    const probe = probeBlock(h, ab, op.index, key);
    if (!probe.ok)
      throw h.opFail(i, op, `图层 ${op.index} 的图层样式块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${probe.reason}`,
        { index: op.index, block: key, reason: probe.reason });

    const { raw, desc, head, tail } = probe;
    const hit = pick(desc);
    if (!hit.ok) throw h.opFail(i, op, hit.reason, { index: op.index, block: key, ...(hit.info || {}) });

    const before = hit.node[hit.field];
    if (typeof before !== 'boolean')
      throw h.opFail(i, op, `图层 ${op.index} 的 ${key}·${hit.path} 不是布尔值（读到 ${JSON.stringify(before)}），不敢改写`,
        { index: op.index, block: key });

    const snapBefore = switchSnapshot(desc);
    const noop = before === enabled;

    
    hit.node[hit.field] = enabled;
    let ser;
    try { ser = serializeDescriptor(desc); } catch (e) {
      throw h.opFail(i, op, `改完 ${hit.path} 之后描述符无法重新序列化（${e && e.message}），拒绝写回`, { index: op.index, block: key });
    }
    const data = h.concat([head, ser, tail]);
    if (data.length !== raw.length)
      throw h.opFail(i, op, `改一个布尔值不该改变块长度，但 ${key} 从 ${raw.length} 字节变成了 ${data.length} 字节，说明描述符重建有偏差，拒绝写回`,
        { index: op.index, block: key, before: raw.length, after: data.length });

    const out = h.upsertLayerBlock(ab, op.index, key, data);

    
    if (out.byteLength !== ab.byteLength)
      throw h.opFail(i, op, `写回 ${key} 之后文件长度从 ${ab.byteLength} 变成了 ${out.byteLength}（等长改写不该变），拒绝返回文件`,
        { index: op.index, block: key });

    const raw2 = h.readLayerBlock(out, op.index, key);
    if (!raw2 || raw2.length !== raw.length)
      throw h.opFail(i, op, `写回后重新读到的 ${key} 块长度是 ${raw2 ? raw2.length : 0}，与原来的 ${raw.length} 不一致，拒绝返回文件`,
        { index: op.index, block: key });

    const diffs = [];
    for (let k = 0; k < raw.length; k++) if (raw[k] !== raw2[k]) { diffs.push(k); if (diffs.length > 8) break; }
    const wantDiff = noop ? 0 : 1;
    if (diffs.length !== wantDiff)
      throw h.opFail(i, op,
        `写回 ${key} 之后块内有 ${diffs.length} 处字节变化（预期 ${wantDiff} 处：${hit.path} 那一个 bool），` +
        `说明描述符重建改动了别的字段，拒绝返回文件；变化位置：${diffs.join(',')}`,
        { index: op.index, block: key, diffs });
    if (diffs.length === 1) {
      const off = diffs[0], want = enabled ? 1 : 0;
      if (raw2[off] !== want)
        throw h.opFail(i, op, `写回 ${key} 之后块内偏移 ${off} 的新值是 ${hex(raw2[off])}，不是预期的 bool ${want}，拒绝返回文件`,
          { index: op.index, block: key, offset: off });
    }

    
    const probe2 = probeBlock(h, out, op.index, key);
    if (!probe2.ok)
      throw h.opFail(i, op, `写回 ${key} 之后重新探测不过（${probe2.reason}），拒绝返回文件`, { index: op.index, block: key });
    const hit2 = pick(probe2.desc);
    if (!hit2.ok)
      throw h.opFail(i, op, `写回 ${key} 之后重新解析找不到 ${hit.path}（${hit2.reason}），拒绝返回文件`, { index: op.index, block: key });
    if (hit2.node[hit2.field] !== enabled)
      throw h.opFail(i, op, `写回 ${key} 之后重新解析 ${hit.path} 仍是 ${hit2.node[hit2.field]}，不是 ${enabled}，拒绝返回文件`,
        { index: op.index, block: key });
    const snapAfter = switchSnapshot(probe2.desc);
    const changedSwitches = snapshotDiff(snapBefore, snapAfter);
    const expectOne = noop ? [] : [`${hit.snapKey}: ${before} → ${enabled}`];
    if (changedSwitches.length !== expectOne.length || (expectOne.length && changedSwitches[0] !== expectOne[0]))
      throw h.opFail(i, op,
        `写回 ${key} 之后开关状态的变化不止预期的那一个：${changedSwitches.join('；') || '无'}（预期：${expectOne.join('；') || '无变化'}），拒绝返回文件`,
        { index: op.index, block: key, changed: changedSwitches });

    return { buffer: out, changed: !noop, path: hit.path, before, offset: diffs.length ? diffs[0] : null };
  }

  





  function resolveTarget(ab, op, i, pick) {
    const found = fxBlocksOf(h, ab, op.index);
    if (!found.desc.length) {
      if (found.legacy.length)
        throw h.opFail(i, op,
          `图层 ${op.index} 只有老式的 ${LEGACY_FX_KEY} 图层样式块（不是描述符结构），本 op 只支持描述符型（${FX_BLOCK_KEYS.join('/')}），拒绝改写`,
          { index: op.index, blocks: found.legacy });
      throw h.opFail(i, op,
        `图层 ${op.index} 没有图层样式块（找不到 ${FX_BLOCK_KEYS.join('/')} 或 ${LEGACY_FX_KEY}），没有可以启停的图层样式`,
        { index: op.index });
    }

    
    const usable = [];
    for (const key of found.desc) {
      const p = probeBlock(h, ab, op.index, key);
      if (!p.ok)
        throw h.opFail(i, op, `图层 ${op.index} 的图层样式块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${p.reason}`,
          { index: op.index, block: key, reason: p.reason });
      const hit = pick(p.desc);
      if (hit.ok) usable.push(key);
      else if (found.desc.length === 1) throw h.opFail(i, op, hit.reason, { index: op.index, block: key, ...(hit.info || {}) });
    }
    if (!usable.length) {
      const p = probeBlock(h, ab, op.index, found.desc[0]);
      const hit = pick(p.desc);
      throw h.opFail(i, op, hit.reason, { index: op.index, block: found.desc[0], ...(hit.info || {}) });
    }
    return { found, usable };
  }

  








  function earlyProbe(state, op, i, pick) {
    const ab = state && (state.__ab || state.buffer);
    if (!(ab instanceof ArrayBuffer)) return false;
    resolveTarget(ab, op, i, pick);
    return true;
  }

  




  function flipOnLayer(ab, op, i, plan, warnings, pick, enabled, what) {
    const { found, usable } = resolveTarget(ab, op, i, pick);

    let cur = ab, changed = false, path = '', before = null;
    for (const key of usable) {
      const r = flipInBlock(cur, op, i, key, pick, enabled);
      cur = r.buffer; changed = changed || r.changed; path = r.path; before = r.before;
    }
    const skipped = found.desc.filter(k => !usable.includes(k));
    if (skipped.length)
      warnings.push(`图层 ${op.index}：${skipped.join('/')} 块里没有 ${what}，只改了 ${usable.join('/')}`);
    if (found.legacy.length)
      warnings.push(`图层 ${op.index} 旁边还挂着一份老式 ${LEGACY_FX_KEY} 块，本次没有同步改写` +
        `（PS 与 ag-psd 都优先读 ${usable.join('/')}，只有很老的读取器才会看 ${LEGACY_FX_KEY}）`);

    return {
      buffer: cur,
      result: {
        changed,
        note: changed
          ? `${plan.note}（${usable.join('/')}·${path}：${before} → ${enabled}）`
          : `${plan.note} —— 本来就是 ${enabled}，文件字节未变`,
      },
    };
  }

  

  function pickMaster(desc) {
    if (typeof desc.masterFXSwitch !== 'boolean') {
      return {
        ok: false,
        reason: `这个图层样式描述符里没有 masterFXSwitch（整体开关）字段；实际有的字段：${Object.keys(desc).filter(k => !isMeta(k)).join(' ') || '无'}`,
      };
    }
    return { ok: true, node: desc, field: 'masterFXSwitch', path: 'masterFXSwitch', snapKey: 'masterFXSwitch' };
  }

  function validateMaster(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (typeof op.enabled !== 'boolean')
      throw h.opFail(i, op, `enabled 必须是布尔值，收到 ${JSON.stringify(op.enabled)}`);
    earlyProbe(state, op, i, pickMaster);   
    return {
      affected: [op.index], changed: ['effects.masterFXSwitch'], opIndex: i,
      note: `图层 ${op.index}「${layer.name}」图层样式整体开关 → ${op.enabled ? '启用' : '停用'}`,
    };
  }

  function applyMaster(ab, state, op, plan, warnings) {
    return flipOnLayer(ab, op, plan.opIndex ?? 0, plan, warnings, pickMaster, op.enabled, 'masterFXSwitch');
  }

  

  function makePickEffect(canon, at) {
    const spec = FX[canon];
    return function pickEffect(desc) {
      const slot = slotOf(desc, spec);
      if (!slot) {
        const have = presentEffects(desc);
        const unk = unknownEffectKeys(desc);
        return {
          ok: false,
          info: { effect: canon, available: have },
          reason: `图层样式里没有「${spec.label}」(${canon}/${spec.key})；这一层实际有的效果：` +
            (have.length ? have.join('、') : '一个都没有') +
            (unk.length ? `（另有我们没识别的效果块：${unk.join(' ')}）` : ''),
        };
      }
      if (at >= slot.items.length) {
        return {
          ok: false,
          info: { effect: canon, count: slot.items.length, at },
          reason: `at=${at} 越界：这一层的「${spec.label}」一共只有 ${slot.items.length} 条（合法范围 0…${slot.items.length - 1}）`,
        };
      }
      const node = slot.items[at];
      if (!isEffectObj(node))
        return { ok: false, reason: `「${spec.label}」的第 ${at} 条不是一个效果描述符（读到 ${JSON.stringify(node)}）` };
      if (typeof node.enab !== 'boolean')
        return {
          ok: false,
          reason: `「${spec.label}」的第 ${at} 条里没有 enab（启用）字段；这条实际有的字段：${Object.keys(node).filter(k => !isMeta(k)).join(' ') || '无'}`,
        };
      return {
        ok: true, node, field: 'enab',
        path: `${slot.slotKey}[${at}].enab`,
        snapKey: `${slot.slotKey}#${at}`,
        count: slot.items.length,
      };
    };
  }

  function validateEffect(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (typeof op.effect !== 'string' || !op.effect.trim())
      throw h.opFail(i, op, `effect 必须是非空字符串（效果名或 4 字符 key）；可用：${effectMenu()}`);
    const canon = ALIAS.get(op.effect.toLowerCase().trim());
    if (!canon)
      throw h.opFail(i, op, `不认识的效果名「${op.effect}」；可用（英文名/PS key）：${effectMenu()}`,
        { effect: op.effect, available: Object.keys(FX) });
    if (typeof op.enabled !== 'boolean')
      throw h.opFail(i, op, `enabled 必须是布尔值，收到 ${JSON.stringify(op.enabled)}`);
    const at = op.at === undefined ? 0 : op.at;
    if (!Number.isInteger(at) || at < 0)
      throw h.opFail(i, op, `at 必须是 ≥0 的整数（多重效果里改第几条，默认 0），收到 ${JSON.stringify(op.at)}`);
    earlyProbe(state, op, i, makePickEffect(canon, at));   
    return {
      affected: [op.index], changed: [`effects.${canon}.enab`], opIndex: i, canon, at,
      note: `图层 ${op.index}「${layer.name}」的「${FX[canon].label}」` +
        (at ? `第 ${at + 1} 条` : '') + ` → ${op.enabled ? '启用' : '停用'}`,
    };
  }

  function applyEffect(ab, state, op, plan, warnings) {
    const canon = plan.canon || ALIAS.get(String(op.effect).toLowerCase().trim());
    const at = plan.at === undefined ? (op.at === undefined ? 0 : op.at) : plan.at;
    return flipOnLayer(ab, op, plan.opIndex ?? 0, plan, warnings,
      makePickEffect(canon, at), op.enabled, `「${FX[canon].label}」`);
  }

  return {
    setLayerEffectsEnabled: { validate: validateMaster, apply: applyMaster },
    setLayerEffect: { validate: validateEffect, apply: applyEffect },
  };
}


export const FX_EFFECTS = FX;
export function resolveEffectName(name) {
  return ALIAS.get(String(name || '').toLowerCase().trim()) || null;
}
