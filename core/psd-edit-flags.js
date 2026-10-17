






























































import { writeLayerMask } from './psd-layer.js';




const M_RELATIVE = 0x01;   
const M_DISABLED = 0x02;   
const M_INVERT = 0x04;     
const M_HAS_PARAMS = 0x10; 


const P_USER_DENSITY = 0x01;
const P_USER_FEATHER = 0x02;
const P_VECTOR_DENSITY = 0x04;
const P_VECTOR_FEATHER = 0x08;

const MASK_HEAD = 18;      
const MASK_REAL = 18;      


const LOCK_BITS = {
  lockTransparency: 0x00000001,   
  lockComposite: 0x00000002,      
  lockPosition: 0x00000004,       
  lockNesting: 0x00000008,        
  lockAll: 0x80000000,            
};
const LOCK_FIELDS = Object.keys(LOCK_BITS);


const COLOR_NAMES = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
const COLOR_ALIAS = { grey: 7, 无: 0, none: 0 };


const GT_DIVIDER = 3;



const toU8Local = b => (b instanceof Uint8Array ? b : new Uint8Array(b));

const u32bytes = f => [(f >>> 24) & 0xff, (f >>> 16) & 0xff, (f >>> 8) & 0xff, f & 0xff];


function f64bytes(v) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return Array.from(b);
}


function diffWrites(cur, curStart, offset, values) {
  const writes = [];
  for (let k = 0; k < values.length; k++) {
    const abs = offset + k;
    const now = cur ? cur[abs - curStart] : undefined;
    if (now !== (values[k] & 0xff)) writes.push({ offset: abs, value: values[k] & 0xff });
  }
  return writes;
}



export function createFlagOps(h) {
  const { opFail, needLayer } = h;

  
  function pickLayer(state, op, i, what) {
    const layer = needLayer(state, i, op, op.index);
    if (layer.groupType === GT_DIVIDER) {
      throw opFail(i, op, `图层 ${op.index} 是分组结束分隔记录（PS 面板上的 </Layer group>），` +
        `它是分组的内部占位记录、用户选不中，改${what}没有意义；请把 index 换成组头那一条（sectionType 1/2）`,
        { groupType: layer.groupType });
    }
    return layer;
  }

  




  function maskOf(ab, idx, op, i) {
    const r = h.maskRange(ab, idx);
    const doc = h.parsePsdDocument(ab);
    const layer = doc.layers[idx];
    const m = layer && layer.mask;
    if (!r || !m || !m.present) {
      throw opFail(i, op, `图层 ${idx}「${(layer && (layer.unicodeName || layer.name)) || ''}」没有图层蒙版，` +
        `无从设置蒙版开关；请先在 PS 里给它加一个蒙版再存`, { index: idx });
    }
    if (m._raw || m.flags == null || r.flagsOffset == null) {
      throw opFail(i, op, `图层 ${idx} 的蒙版段只有 ${r.maskLen} 字节，短到读不出 flags（规范最少 18 字节），` +
        `本模块不改这种残缺蒙版段`, { index: idx, maskLen: r.maskLen });
    }
    const dataStart = r.start;
    if (m._off && m._off.dataStart !== dataStart) {
      throw opFail(i, op, `图层 ${idx} 的蒙版段起点两套解析对不上（${m._off.dataStart} vs ${dataStart}），` +
        `文件结构可疑，拒绝写入`, { index: idx, offset: dataStart });
    }
    
    
    let paramsStart = dataStart + MASK_HEAD;
    if (m.realFirst !== false && m.real) paramsStart += MASK_REAL;
    return { model: m, dataStart, flagsOffset: r.flagsOffset, paramsStart, maskLen: r.maskLen };
  }

  

  function validateMask(state, op, i) {
    const layer = pickLayer(state, op, i, '蒙版属性');
    const changed = [];
    for (const k of ['disabled', 'invert', 'relative']) {
      if (op[k] === undefined) continue;
      if (typeof op[k] !== 'boolean') throw opFail(i, op, `${k} 必须是布尔值，收到 ${JSON.stringify(op[k])}`);
      changed.push(k);
    }
    for (const k of ['density', 'vectorDensity']) {
      if (op[k] === undefined) continue;
      if (!Number.isInteger(op[k]) || op[k] < 0 || op[k] > 255)
        throw opFail(i, op, `${k} 必须是 0…255 的整数（255 = 蒙版全效，PS 面板的「浓度 100%」），收到 ${JSON.stringify(op[k])}`);
      changed.push(k);
    }
    for (const k of ['feather', 'vectorFeather']) {
      if (op[k] === undefined) continue;
      if (typeof op[k] !== 'number' || !Number.isFinite(op[k]) || op[k] < 0 || op[k] > 1000)
        throw opFail(i, op, `${k} 必须是 0…1000 的有限数字（单位像素，PS 羽化滑杆的量程），收到 ${JSON.stringify(op[k])}`);
      changed.push(k);
    }
    if (!changed.length)
      throw opFail(i, op, '没有给出任何要改的字段（disabled / invert / relative / density / feather / vectorDensity / vectorFeather）');
    return {
      affected: [op.index], changed, _i: i, _op: op,
      note: `图层 ${op.index}「${layer.name}」蒙版 → ${changed.map(k => `${k}=${op[k]}`).join('、')}`,
    };
  }

  
  const PARAM_SLOTS = [
    { bit: P_USER_DENSITY, key: 'userMaskDensity', op: 'density', size: 1 },
    { bit: P_USER_FEATHER, key: 'userMaskFeather', op: 'feather', size: 8 },
    { bit: P_VECTOR_DENSITY, key: 'vectorMaskDensity', op: 'vectorDensity', size: 1 },
    { bit: P_VECTOR_FEATHER, key: 'vectorMaskFeather', op: 'vectorFeather', size: 8 },
  ];
  const USER_FIELDS = ['disabled', 'invert', 'relative', 'density', 'feather'];

  function applyMask(ab, state, op, plan) {
    const i = plan._i, idx = op.index;
    const doc = h.parsePsdDocument(ab);
    const dl = doc.layers[idx];
    const wantUser = USER_FIELDS.some(k => op[k] !== undefined);
    const wantVec = op.vectorDensity !== undefined || op.vectorFeather !== undefined;
    const chIds = (dl && dl.channels || []).map(c => c.id);
    const hasUserMask = !!(dl && dl.mask && dl.mask.present && (chIds.includes(-2) || chIds.includes(-3)));
    if (wantUser && !hasUserMask) {
      throw opFail(i, op, `图层 ${idx}「${(dl && (dl.unicodeName || dl.name)) || ''}」没有图层蒙版（像素蒙版），` +
        `无从设置蒙版开关 / 浓度 / 羽化；请先给它加一个蒙版`, { index: idx });
    }
    if (wantVec && !(dl && dl.additionalBlocks.some(b => b.key === 'vmsk' || b.key === 'vsms'))) {
      throw opFail(i, op, `图层 ${idx}「${(dl && (dl.unicodeName || dl.name)) || ''}」没有矢量蒙版（vmsk / vsms），` +
        `vectorDensity / vectorFeather 无处可用`, { index: idx });
    }
    const m0 = dl.mask && dl.mask.present ? dl.mask : null;
    const pf0 = m0 && (m0.flags & M_HAS_PARAMS) && m0.parameters ? (m0.parameters._flags & 0xff) : 0;
    const missing = PARAM_SLOTS.filter(sl => op[sl.op] !== undefined && !(pf0 & sl.bit));

    
    if (!missing.length) {
      const writes = [];
      let flags = null;
      if (m0) {
        const info = maskOf(ab, idx, op, i);
        const m = info.model;
        flags = m.flags & 0xff;
        if (op.relative !== undefined) flags = op.relative ? (flags | M_RELATIVE) : (flags & ~M_RELATIVE);
        if (op.disabled !== undefined) flags = op.disabled ? (flags | M_DISABLED) : (flags & ~M_DISABLED);
        if (op.invert !== undefined) flags = op.invert ? (flags | M_INVERT) : (flags & ~M_INVERT);
        flags &= 0xff;
        if (flags !== (m.flags & 0xff)) writes.push({ offset: info.flagsOffset, value: flags });
        let o = info.paramsStart + 1;                     
        for (const sl of PARAM_SLOTS) {
          if (!(pf0 & sl.bit)) continue;
          if (op[sl.op] !== undefined) writes.push(...diffWrites(null, 0, o, sl.size === 1 ? [op[sl.op]] : f64bytes(op[sl.op])));
          o += sl.size;
        }
      }
      if (!writes.length) return { buffer: ab, result: { changed: false, note: plan.note + '（现值已经是目标值，未改动任何字节）' } };
      return {
        buffer: h.patchBytes(ab, writes),
        result: { changed: true, note: plan.note, maskFlagsBefore: m0.flags & 0xff, maskFlagsAfter: flags, bytesPatched: writes.length },
      };
    }

    
    if (m0 && (m0._writeMode === 'raw' || m0._raw || m0.flags == null)) {
      throw opFail(i, op, `图层 ${idx} 的蒙版段结构读不全（语义写回与原字节不一致），为保真不重写这一段；` +
        `请在 PS 里对这个蒙版调一次浓度或羽化再存`, { index: idx });
    }
    const model = m0
      ? { ...m0, parameters: m0.parameters ? { ...m0.parameters } : {} }
      : { present: true, _withLength: true, top: 0, left: 0, bottom: 0, right: 0, defaultColor: 255, flags: 0,
          parameters: {}, real: null, realFirst: true, tail: new Uint8Array(0) };
    const p = model.parameters;
    for (const sl of PARAM_SLOTS) if (op[sl.op] !== undefined) p[sl.key] = op[sl.op];
    
    p._flags = (pf0 | missing.reduce((a, sl) => a | sl.bit, 0)) & 0xff;
    let flags = (model.flags & 0xff) | M_HAS_PARAMS;
    if (op.relative !== undefined) flags = op.relative ? (flags | M_RELATIVE) : (flags & ~M_RELATIVE);
    if (op.disabled !== undefined) flags = op.disabled ? (flags | M_DISABLED) : (flags & ~M_DISABLED);
    if (op.invert !== undefined) flags = op.invert ? (flags | M_INVERT) : (flags & ~M_INVERT);
    model.flags = flags & 0xff;
    delete model.flagsParsed;
    

    const tail0 = model.tail ? toU8Local(model.tail) : new Uint8Array(0);
    if (tail0.every(v => v === 0)) {
      model.tail = new Uint8Array(0);
      const bodyLen = toU8Local(writeLayerMask(model)).length - 4;
      model.tail = new Uint8Array((4 - (bodyLen % 4)) % 4);
    }
    const bytes = toU8Local(writeLayerMask(model));
    const range = h.layerExtraRange(ab, idx);
    const from = range.extraStart;                                  
    const oldLen = new DataView(ab).getUint32(from);
    const out = h.spliceLayerExtra(ab, idx, from, from + 4 + oldLen, bytes);
    return {
      buffer: out,
      result: { changed: true, note: plan.note + `（蒙版参数段补写 ${missing.map(sl => sl.op).join('、')}，蒙版段 ${oldLen} → ${bytes.length - 4} 字节）`,
        maskFlagsBefore: m0 ? m0.flags & 0xff : null, maskFlagsAfter: model.flags },
    };
  }

  

  function validateFlags(state, op, i) {
    const layer = pickLayer(state, op, i, '锁定标志');
    const changed = [];
    for (const k of LOCK_FIELDS) {
      if (op[k] === undefined) continue;
      if (typeof op[k] !== 'boolean') throw opFail(i, op, `${k} 必须是布尔值，收到 ${JSON.stringify(op[k])}`);
      changed.push(k);
    }
    if (!changed.length)
      throw opFail(i, op, `没有给出任何要改的字段（${LOCK_FIELDS.join(' / ')}）`);
    return {
      affected: [op.index], changed, _i: i, _op: op,
      note: `图层 ${op.index}「${layer.name}」锁定 → ${changed.map(k => `${k}=${op[k]}`).join('、')}`,
    };
  }

  function applyFlags(ab, state, op, plan) {
    const idx = op.index;
    const cur = h.readLayerBlock(ab, idx, 'lspf');
    const has = !!(cur && cur.length >= 4);
    const before = has ? ((cur[0] << 24) | (cur[1] << 16) | (cur[2] << 8) | cur[3]) >>> 0 : 0;
    let after = before;
    for (const k of LOCK_FIELDS) {
      if (op[k] === undefined) continue;
      after = op[k] ? (after | LOCK_BITS[k]) >>> 0 : (after & ~LOCK_BITS[k]) >>> 0;
    }
    return writeSmallBlock(ab, idx, 'lspf', cur, has, u32bytes(after), after === 0, plan,
      { locksBefore: before, locksAfter: after });
  }

  

  function normalizeColor(v, op, i) {
    if (typeof v === 'number') {
      if (!Number.isInteger(v) || v < 0 || v > 7)
        throw opFail(i, op, `color 是数字时必须是 0…7 的整数（0=无 1=红 2=橙 3=黄 4=绿 5=蓝 6=紫 7=灰），收到 ${JSON.stringify(v)}`);
      return v;
    }
    if (typeof v === 'string') {
      const key = v.trim().toLowerCase();
      const idx = COLOR_NAMES.indexOf(key);
      if (idx >= 0) return idx;
      if (Object.prototype.hasOwnProperty.call(COLOR_ALIAS, key)) return COLOR_ALIAS[key];
      throw opFail(i, op, `未知的颜色标签「${v}」；可用：${COLOR_NAMES.join(' / ')}（或 0…7 的数字）`);
    }
    throw opFail(i, op, `color 必须是 0…7 的整数或颜色名（${COLOR_NAMES.join(' / ')}），收到 ${JSON.stringify(v)}`);
  }

  function validateColor(state, op, i) {
    const layer = pickLayer(state, op, i, '颜色标签');
    if (op.color === undefined) throw opFail(i, op, `缺少 color（0…7 的整数或颜色名：${COLOR_NAMES.join(' / ')}）`);
    const color = normalizeColor(op.color, op, i);
    return {
      affected: [op.index], changed: ['colorLabel'], _i: i, _op: op, _color: color,
      note: `图层 ${op.index}「${layer.name}」颜色标签 → ${COLOR_NAMES[color]}（${color}）`,
    };
  }

  function applyColor(ab, state, op, plan) {
    const idx = op.index;
    const color = plan._color;
    const cur = h.readLayerBlock(ab, idx, 'lclr');
    const has = !!(cur && cur.length >= 2);
    const before = has ? ((cur[0] << 8) | cur[1]) : 0;
    
    const newBytes = [(color >> 8) & 0xff, color & 0xff];
    return writeSmallBlock(ab, idx, 'lclr', cur, has, newBytes, color === 0, plan,
      { colorLabelBefore: before, colorLabelAfter: color }, 8);
  }

  

  function validateFill(state, op, i) {
    const layer = pickLayer(state, op, i, '填充不透明度');
    if (!Number.isInteger(op.fillOpacity) || op.fillOpacity < 0 || op.fillOpacity > 255)
      throw opFail(i, op, `fillOpacity 必须是 0…255 的整数（255 = 完全填充，对应 PS 面板的「填充 100%」），收到 ${JSON.stringify(op.fillOpacity)}`);
    return {
      affected: [op.index], changed: ['fillOpacity'], _i: i, _op: op,
      note: `图层 ${op.index}「${layer.name}」填充不透明度 → ${op.fillOpacity}`,
    };
  }

  function applyFill(ab, state, op, plan) {
    const idx = op.index;
    const cur = h.readLayerBlock(ab, idx, 'iOpa');
    const has = !!(cur && cur.length >= 1);
    const before = has ? cur[0] : 255;
    
    return writeSmallBlock(ab, idx, 'iOpa', cur, has, [op.fillOpacity], op.fillOpacity === 255, plan,
      { fillOpacityBefore: before, fillOpacityAfter: op.fillOpacity }, 4);
  }

  

  




  function writeSmallBlock(ab, idx, key, cur, has, newBytes, isDefault, plan, extra, blockSize) {
    const size = blockSize || newBytes.length;
    if (has) {
      if (cur.length >= newBytes.length) {
        
        const writes = diffWrites(cur, cur.byteOffset, cur.byteOffset, newBytes);
        if (!writes.length) return { buffer: ab, result: { changed: false, note: plan.note + '（现值已经是目标值，未改动任何字节）', ...extra } };
        return { buffer: h.patchBytes(ab, writes), result: { changed: true, note: plan.note, block: key, mode: 'patch', ...extra } };
      }
      
      const data = new Uint8Array(size);
      data.set(newBytes.slice(0, size));
      return { buffer: h.upsertLayerBlock(ab, idx, key, data), result: { changed: true, note: plan.note, block: key, mode: 'rebuild', ...extra } };
    }
    if (isDefault) {
      
      return { buffer: ab, result: { changed: false, note: plan.note + `（默认值且原本没有 ${key} 块，不新建）`, ...extra } };
    }
    const data = new Uint8Array(size);
    data.set(newBytes.slice(0, size));
    return { buffer: h.upsertLayerBlock(ab, idx, key, data), result: { changed: true, note: plan.note, block: key, mode: 'create', ...extra } };
  }

  

  function validateKnockout(state, op, i) {
    const layer = pickLayer(state, op, i, '挖空');
    if (!Number.isInteger(op.knockout) || op.knockout < 0 || op.knockout > 2)
      throw opFail(i, op, `knockout 必须是 0…2 的整数（0 无 / 1 浅 / 2 深，PS 混合选项的「挖空」），收到 ${JSON.stringify(op.knockout)}`);
    return {
      affected: [op.index], changed: ['knockout'], _i: i, _op: op,
      note: `图层 ${op.index}「${layer.name}」挖空 → ${op.knockout === 0 ? '无' : op.knockout === 1 ? '浅' : '深'}`,
    };
  }

  function applyKnockout(ab, state, op, plan) {
    const idx = op.index;
    const cur = h.readLayerBlock(ab, idx, 'knko');
    const has = !!(cur && cur.length >= 1);
    const before = has ? cur[0] : 0;
    
    return writeSmallBlock(ab, idx, 'knko', cur, has, [op.knockout], op.knockout === 0, plan,
      { knockoutBefore: before, knockoutAfter: op.knockout }, 4);
  }

  










  const BOOL_BLEND = { blendInterior: ['infx', false], blendClipped: ['clbl', true], transparencyShapes: ['tsly', true],
    layerMaskHidesEffects: ['lmgm', false], vectorMaskHidesEffects: ['vmgm', false] };
  const BI_CH = { gray: 0, red: 1, green: 2, blue: 3 };
  function validateBlendOptions(state, op, i) {
    const layer = pickLayer(state, op, i, '混合选项');
    const changed = [];
    for (const k of Object.keys(BOOL_BLEND)) if (op[k] !== undefined) {
      if (typeof op[k] !== 'boolean') throw opFail(i, op, `${k} 必须是布尔值，收到 ${JSON.stringify(op[k])}`);
      changed.push(k);
    }
    if (op.channels !== undefined) {
      const c = op.channels;
      if (!c || typeof c !== 'object' || Object.keys(c).some(k => !['r', 'g', 'b'].includes(k) || typeof c[k] !== 'boolean'))
        throw opFail(i, op, `channels 必须是 { r?, g?, b? } 布尔对象，收到 ${JSON.stringify(c)}`);
      changed.push('channels');
    }
    if (op.blendIf !== undefined) {
      const b = op.blendIf;
      if (!b || typeof b !== 'object') throw opFail(i, op, 'blendIf 必须是对象 { gray|red|green|blue: { this?, under? } }');
      for (const [k, v] of Object.entries(b)) {
        if (!(k in BI_CH)) throw opFail(i, op, `blendIf 的通道只能是 gray / red / green / blue，收到「${k}」`);
        for (const side of ['this', 'under']) {
          const q = v && v[side];
          if (q === undefined) continue;
          if (!Array.isArray(q) || q.length !== 4 || q.some(n => !Number.isInteger(n) || n < 0 || n > 255) || !(q[0] <= q[1] && q[1] <= q[2] && q[2] <= q[3]))
            throw opFail(i, op, `blendIf.${k}.${side} 必须是 4 个 0…255 的整数且 黑低≤黑高≤白低≤白高，收到 ${JSON.stringify(q)}`);
        }
      }
      changed.push('blendIf');
    }
    if (!changed.length) throw opFail(i, op, 'setBlendOptions 至少要给一项（blendInterior / blendClipped / transparencyShapes / layerMaskHidesEffects / vectorMaskHidesEffects / channels / blendIf）');
    return { affected: [op.index], changed, _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」混合选项：${changed.join('、')}` };
  }
  function applyBlendOptions(ab, state, op, plan) {
    const idx = op.index, notes = [];
    let out = ab, changedAny = false;
    for (const [k, [key, def]] of Object.entries(BOOL_BLEND)) {
      if (op[k] === undefined) continue;
      const cur = h.readLayerBlock(out, idx, key);
      const has = !!(cur && cur.length >= 1);
      const r = writeSmallBlock(out, idx, key, cur, has, [op[k] ? 1 : 0], op[k] === def, plan, {}, 4);
      if (r.result.changed) { out = r.buffer; changedAny = true; notes.push(`${key}=${op[k] ? 1 : 0}`); }
    }
    if (op.channels) {
      const cur = h.readLayerBlock(out, idx, 'brst');
      const off = new Set();
      if (cur) for (let k = 0; k + 4 <= cur.length; k += 4) { const c = new DataView(cur.buffer, cur.byteOffset + k, 4).getInt32(0); if (c >= 0) off.add(c); }
      [['r', 0], ['g', 1], ['b', 2]].forEach(([n, c]) => { if (op.channels[n] === true) off.delete(c); else if (op.channels[n] === false) off.add(c); });
      const list = [...off].sort((a, b) => a - b), data = new Uint8Array(list.length * 4), dv = new DataView(data.buffer);
      list.forEach((c, k) => dv.setInt32(k * 4, c));
      const same = cur && cur.length === data.length && data.every((v, k) => v === cur[k]);
      if (!same && (cur || list.length)) { out = h.upsertLayerBlock(out, idx, 'brst', data); changedAny = true; notes.push(`brst=[${list.join(',')}]`); }
    }
    if (op.blendIf) {
      const L = h.parsePsdFull(out).layers[idx];
      if (!L || !Number.isFinite(L.extraLenOffset)) throw opFail(plan._i, op, `图层 ${idx} 的记录结构读不出来，没法改混合颜色带`);
      const dv = new DataView(out);
      const maskLen = dv.getUint32(L.extraLenOffset + 4), brAt = L.extraLenOffset + 8 + maskLen, brLen = dv.getUint32(brAt);
      const writes = [];
      for (const [k, v] of Object.entries(op.blendIf)) {
        const pair = BI_CH[k], base = brAt + 4 + pair * 8;
        if (pair * 8 + 8 > brLen) throw opFail(plan._i, op, `图层 ${idx} 的记录里没有「${k}」的混合颜色带（段长 ${brLen} 字节）；新增这一段要改记录长度，本轮不做`, { index: idx, blendRangesLength: brLen });
        const u8 = new Uint8Array(out);
        if (v.this) writes.push(...diffWrites(u8, 0, base, v.this));
        if (v.under) writes.push(...diffWrites(u8, 0, base + 4, v.under));
      }
      if (writes.length) { out = h.patchBytes(out, writes); changedAny = true; notes.push('混合颜色带'); }
    }
    return { buffer: out, result: { changed: changedAny, note: plan.note + (notes.length ? `（${notes.join('；')}）` : '（现值已经是目标值）') } };
  }

  

  return {
    setMaskProps: { validate: validateMask, apply: applyMask },
    setLayerFlags: { validate: validateFlags, apply: applyFlags },
    setLayerColorLabel: { validate: validateColor, apply: applyColor },
    setFillOpacity: { validate: validateFill, apply: applyFill },
    setLayerKnockout: { validate: validateKnockout, apply: applyKnockout },
    setBlendOptions: { validate: validateBlendOptions, apply: applyBlendOptions },
  };
}

export default { createFlagOps };
