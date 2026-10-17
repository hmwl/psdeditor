

































































































import { writeLayerMask } from './psd-layer.js';
import { decodeChannel, encodeChannel, Compression, SAMPLE16_PS } from './psd-image.js';


const sampleArr = d => (d === 32 ? Float32Array : d === 16 ? Uint16Array : Uint8Array);
const sampleScale = d => (d === 32 ? 1 / 255 : d === 16 ? SAMPLE16_PS / 255 : 1);
const sampleMax = d => (d === 32 ? 1 : d === 16 ? 65535 : 255);




const M_RELATIVE = 0x01;    
const M_DISABLED = 0x02;    
const M_INVERT = 0x04;      
const M_FROM_OTHER = 0x08;  
const M_HAS_PARAMS = 0x10;  


const P_USER_DENSITY = 0x01;
const P_USER_FEATHER = 0x02;


const ID_ALPHA = -1, ID_USER = -2, ID_REAL = -3;


const GT_DIVIDER = 3;

const EMPTY = new Uint8Array(0);

const WHICH_LABEL = { user: '用户蒙版(-2)', real: 'real 用户蒙版(-3)', all: '全部蒙版(-2/-3)' };


const COMP_NAME = { 0: 'raw', 1: 'rle', 2: 'zip', 3: 'zip-prediction' };



function u8of(b) {
  if (b == null) return EMPTY;
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return Uint8Array.from(b);
}
function join(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const isBytes = v => v instanceof Uint8Array || v instanceof ArrayBuffer || ArrayBuffer.isView(v) || Array.isArray(v);


function layerInfoLengthOf(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const psb = dv.getUint16(4) === 2;
  const u64 = o => dv.getUint32(o) * 0x100000000 + dv.getUint32(o + 4);
  let o = 26;
  o += 4 + dv.getUint32(o);                    
  o += 4 + dv.getUint32(o);                    
  const lenSize = psb ? 8 : 4;
  if (o + lenSize > u8.length) return null;
  const lmiLen = psb ? u64(o) : dv.getUint32(o);
  if (!lmiLen) return null;
  o += lenSize;
  if (o + lenSize > u8.length) return null;
  return psb ? u64(o) : dv.getUint32(o);
}


const chIndex = (layer, id) => layer.channels.findIndex(c => c.id === id);
const hasCh = (layer, id) => chIndex(layer, id) >= 0;


const nameOf = layer => (layer && (layer.unicodeName || layer.name)) || '';




function maskInsertAt(layer, id) {
  const n = layer.channels.length;
  if (id === ID_USER) {
    const r = chIndex(layer, ID_REAL);
    return r >= 0 ? r : n;
  }
  return n;               
}










function finalizeMask(m) {
  if (!m || !m.present) return { present: false, _withLength: true, _writeMode: 'semantic', tail: EMPTY };
  const out = { ...m, _withLength: true, _writeMode: 'semantic' };
  delete out._raw;
  delete out._sectionRaw;
  delete out._off;
  const tail = u8of(m.tail);
  
  const keep = tail.some(v => v !== 0) ? tail : EMPTY;
  out.tail = keep;
  const len = u8of(writeLayerMask(out)).length - 4;
  const pad = (4 - (len % 4)) % 4;
  if (pad) out.tail = join([keep, new Uint8Array(pad)]);
  return out;
}


function makeMask(bounds, defaultColor, flags) {
  return finalizeMask({
    present: true, _withLength: true,
    top: bounds.top, left: bounds.left, bottom: bounds.bottom, right: bounds.right,
    defaultColor: defaultColor & 0xff,
    flags: flags & 0xff,
    parameters: null, real: null, realFirst: true, tail: EMPTY,
  });
}





const P_VECTOR_BITS = 0x04 | 0x08;
function vectorParamsOf(m) {
  const p = m && m.present && (m.flags & M_HAS_PARAMS) ? m.parameters : null;
  if (!p || !((p._flags ?? 0) & P_VECTOR_BITS) && p.vectorMaskDensity == null && p.vectorMaskFeather == null) return null;
  const out = {};
  let pf = 0;
  if (p.vectorMaskDensity != null) { out.vectorMaskDensity = p.vectorMaskDensity; pf |= 0x04; }
  if (p.vectorMaskFeather != null) { out.vectorMaskFeather = p.vectorMaskFeather; pf |= 0x08; }
  out._flags = pf;
  return pf ? out : null;
}

function vectorOnlyMask(vp) {
  return finalizeMask({
    present: true, _withLength: true, top: 0, left: 0, bottom: 0, right: 0, defaultColor: 255,
    flags: M_HAS_PARAMS, parameters: vp, real: null, realFirst: true, tail: EMPTY,
  });
}
const isEmptyRect = m => !(m.right - m.left > 0 && m.bottom - m.top > 0);








function serializeAligned(h, doc) {
  const li = doc.layerInfo;
  if (!li || !li.present) return h.asAB(h.serializePsdDocument(doc));
  const tail = u8of(li.tail);
  const keep = tail.some(v => v !== 0) ? tail : EMPTY;
  li.tail = keep;
  let out = u8of(h.serializePsdDocument(doc));
  const len = layerInfoLengthOf(out);
  if (len == null) return h.asAB(out);
  const pad = (4 - (len % 4)) % 4;
  if (!pad) return h.asAB(out);
  li.tail = join([keep, new Uint8Array(pad)]);
  return h.asAB(h.serializePsdDocument(doc));
}



export function createMaskOps(h) {
  const { opFail, needLayer } = h;

  

  
  function pickLayer(state, op, i, what) {
    const layer = needLayer(state, i, op, op.index);
    if (layer.groupType === GT_DIVIDER) {
      throw opFail(i, op, `图层 ${op.index} 是分组结束分隔记录（PS 面板上的 </Layer group>），` +
        `它是分组的内部占位记录、用户选不中，给它${what}没有意义；请把 index 换成组头那一条（sectionType 1/2）`,
        { groupType: layer.groupType });
    }
    return layer;
  }

  



  function open(ab, op, i, idx) {
    const doc = h.parsePsdDocument(ab);
    const layer = doc.layers[idx];
    if (!layer) throw opFail(i, op, `图层 ${idx} 不存在（本文档 ${doc.layers.length} 个图层）`, { index: idx });
    if (layer._section && layer._section !== 'layerInfo') {
      throw opFail(i, op, `图层 ${idx} 的记录在全局块 ${layer._section} 里（16/32 位文档），` +
        `本模块的通道表重排只在普通层信息段上做，拒绝执行`, { index: idx, section: layer._section });
    }
    if (layer._extraRaw) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的 extra 区解析已降级为原样字节，` +
        `读不出蒙版段结构，改蒙版会写出一个坏文件，拒绝执行`, { index: idx });
    }
    if (!doc.layerInfo || !doc.layerInfo.present) {
      throw opFail(i, op, '本文档没有层信息段，无从编辑蒙版', { index: idx });
    }
    const depth = doc.header.depth;
    if (depth !== 8 && depth !== 16 && depth !== 32) {
      throw opFail(i, op, `本文档是 ${depth} 位/通道；蒙版通道的编解码只支持 8 / 16 / 32 位` +
        `（1 位是位图模式、32 位是浮点，走的是另一套压缩规则），拒绝执行`, { depth });
    }
    return { doc, layer, psb: !!doc.header.psb, depth };
  }

  
  const hasVectorMask = layer => !!(layer.additional && (layer.additional.vmsk || layer.additional.vsms));

  




  function warnVector(warnings, layer, idx, what) {
    if (!hasVectorMask(layer)) return;
    warnings.push(`图层 ${idx}「${nameOf(layer)}」还带着矢量蒙版块（vmsk/vsms）：` +
      `${what}不会动矢量路径，PS 下次打开可能按 vmsk 重新渲染出一个 -2 通道。` +
      `要彻底去掉矢量蒙版请另外删 vmsk/vsms 块`);
  }

  
  function maskModel(layer, op, i, idx) {
    const m = layer.mask;
    if (!m || !m.present) return null;
    if (m._raw || m.flags == null) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的蒙版段只有 ${m._size} 字节，` +
        `短到读不出 bounds/flags（规范最少 18 字节），本模块不改这种残缺蒙版段`,
        { index: idx, maskLen: m._size });
    }
    return m;
  }

  

  
  function siblingCompression(layer, depth = 8) {
    if (depth === 32) return Compression.RAW;   
    for (const id of [ID_ALPHA, 0, 1, 2, 3]) {
      const k = chIndex(layer, id);
      if (k < 0) continue;
      const c = layer.channels[k].compression;
      if (c === Compression.RAW || c === Compression.RLE) return c;
    }
    for (const ch of layer.channels) {
      if (ch.compression === Compression.RAW || ch.compression === Compression.RLE) return ch.compression;
    }
    return Compression.RLE;
  }

  function decodePlane(ch, width, height, depth, psb, op, i, what) {
    try {
      return decodeChannel({ bytes: u8of(ch._raw), width, height, depth, psb, keepRaw: false, strict: true });
    } catch (e) {
      throw opFail(i, op, `${what}解码失败：${e && e.message}`, { channelId: ch.id });
    }
  }

  









  function channelTail(ch, width, height, depth, psb) {
    const raw = u8of(ch._raw);
    if (raw.length < 2) return EMPTY;
    const rowBytes = width * (depth === 32 ? 4 : depth === 16 ? 2 : 1);
    let consumed;
    if (ch.compression === Compression.RAW) {
      consumed = rowBytes * height;
    } else if (ch.compression === Compression.RLE) {
      const step = psb ? 4 : 2;                            
      if (raw.length < 2 + height * step) return EMPTY;
      let sum = 0, p = 2;
      for (let y = 0; y < height; y++) {
        sum += psb ? (((raw[p] << 24) | (raw[p + 1] << 16) | (raw[p + 2] << 8) | raw[p + 3]) >>> 0)
                   : ((raw[p] << 8) | raw[p + 1]);
        p += step;
      }
      consumed = height * step + sum;
    } else return EMPTY;
    const end = 2 + consumed;
    return end < raw.length ? raw.subarray(end) : EMPTY;
  }

  
  function makeChannel(id, data, width, height, depth, compression, psb) {
    const raw = encodeChannel({ data, width, height, depth, compression, psb, reuseRaw: false, withHeader: true });
    return { id, length: raw.length, compression, _off: null, _end: null, _raw: raw, _dirty: true };
  }
  function setChannel(ch, data, width, height, depth, compression, psb) {
    const raw = encodeChannel({ data, width, height, depth, compression, psb, reuseRaw: false, withHeader: true });
    ch._raw = raw; ch.length = raw.length; ch.compression = compression; ch._dirty = true;
    return ch;
  }

  

  













  function stripMask(layer, m, which, op, i, idx) {
    const hasUser = hasCh(layer, ID_USER), hasReal = hasCh(layer, ID_REAL);
    if (which === 'user' && !hasUser) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」没有用户蒙版（通道表里没有 id=-2）；` +
        `它${hasReal ? '只有 real 用户蒙版(-3)，请用 which:\'real\'' : '一个蒙版都没有'}`,
        { index: idx, channels: layer.channels.map(c => c.id) });
    }
    if (which === 'real' && !hasReal) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」没有 real 用户蒙版（通道表里没有 id=-3）；` +
        `它${hasUser ? '只有用户蒙版(-2)，请用 which:\'user\'（默认值）' : '一个蒙版都没有'}`,
        { index: idx, channels: layer.channels.map(c => c.id) });
    }
    if (which === 'all' && !hasUser && !hasReal) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」一个蒙版通道都没有（通道表 ${layer.channels.map(c => c.id).join(',')}）`,
        { index: idx, channels: layer.channels.map(c => c.id) });
    }
    if (!m) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的通道表里有蒙版通道，蒙版段却是空的（长度 0）；` +
        `文件结构自相矛盾，拒绝改写`, { index: idx });
    }

    const dropUser = which === 'user' || which === 'all';
    const dropReal = which === 'real' || which === 'all';
    const removed = [];
    const maskLenBefore = m._size;

    if (dropUser && hasUser) { layer.channels.splice(chIndex(layer, ID_USER), 1); removed.push(ID_USER); }
    if (dropReal && hasReal) { layer.channels.splice(chIndex(layer, ID_REAL), 1); removed.push(ID_REAL); }

    const keepUser = hasUser && !dropUser;
    const keepReal = hasReal && !dropReal;
    let renamed = false;

    if (!keepUser && !keepReal) {
      const vp = vectorParamsOf(m);                 
      layer.mask = vp ? vectorOnlyMask(vp) : finalizeMask(null);
    } else if (keepUser) {
      
      layer.mask = finalizeMask({ ...m, real: null });
    } else {
      
      const r = m.real;
      if (!r) {
        throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的蒙版段里没有 real 子块（段长 ${m._size} 字节），` +
          `删掉用户蒙版之后剩下的 -3 通道就没人描述了；请改用 which:'all' 一起删`,
          { index: idx, maskLen: m._size });
      }
      const params = m.parameters;
      let flags = (r.flags != null ? r.flags : 0) & 0xff;
      flags = params ? (flags | M_HAS_PARAMS) : (flags & ~M_HAS_PARAMS);
      layer.mask = finalizeMask({
        present: true, _withLength: true,
        top: r.top, left: r.left, bottom: r.bottom, right: r.right,
        defaultColor: r.defaultColor & 0xff,
        flags, parameters: params, real: null, realFirst: true, tail: m.tail,
      });
      const k = chIndex(layer, ID_REAL);
      layer.channels[k] = { ...layer.channels[k], id: ID_USER };
      renamed = true;
    }
    const maskLenAfter = layer.mask.present ? u8of(writeLayerMask(layer.mask)).length - 4 : 0;
    return { removed, renamed, maskLenBefore, maskLenAfter };
  }

  



  function validateDelete(state, op, i) {
    const layer = pickLayer(state, op, i, '删蒙版');
    const which = op.which === undefined ? 'user' : op.which;
    if (which !== 'user' && which !== 'real' && which !== 'all') {
      throw opFail(i, op, `which 只能是 'user'（默认，通道 -2）/ 'real'（通道 -3）/ 'all'，收到 ${JSON.stringify(op.which)}`);
    }
    return {
      affected: [op.index], changed: ['mask', 'channels'], _i: i, _op: op, which,
      note: `图层 ${op.index}「${layer.name}」删除${WHICH_LABEL[which]}`,
    };
  }

  function applyDelete(ab, state, op, plan, warnings) {
    const i = plan._i, idx = op.index, which = plan.which;
    const { doc, layer } = open(ab, op, i, idx);
    const m = maskModel(layer, op, i, idx);
    if (which !== 'real') warnVector(warnings, layer, idx, '删除蒙版');
    const r = stripMask(layer, m, which, op, i, idx);
    return {
      buffer: serializeAligned(h, doc),
      result: {
        changed: true, note: plan.note,
        which, removedChannels: r.removed, renamedRealToUser: r.renamed,
        maskLenBefore: r.maskLenBefore, maskLenAfter: r.maskLenAfter,
        channelsAfter: layer.channels.map(c => c.id),
      },
    };
  }

  



  function validateApply(state, op, i) {
    const layer = pickLayer(state, op, i, '应用蒙版');
    if (op.which !== undefined && op.which !== 'user' && op.which !== 'real') {
      throw opFail(i, op, `which 只能是 'user'（通道 -2）或 'real'（通道 -3），收到 ${JSON.stringify(op.which)}；` +
        `不传则优先用 -2，没有 -2 才用 -3`);
    }
    if (state.depth !== 8 && state.depth !== 16 && state.depth !== 32) {
      throw opFail(i, op, `本文档是 ${state.depth} 位/通道；applyLayerMask 只支持 8 / 16 / 32 位`, { depth: state.depth });
    }
    return {
      affected: [op.index], changed: ['pixels', 'mask', 'channels'], _i: i, _op: op,
      note: `图层 ${op.index}「${layer.name}」应用蒙版（灰度乘进 alpha 后删除蒙版）`,
    };
  }

  function applyApply(ab, state, op, plan, warnings) {
    const i = plan._i, idx = op.index;
    const { doc, layer, psb, depth } = open(ab, op, i, idx);
    const m = maskModel(layer, op, i, idx);

    
    let which = op.which;
    if (!which) which = hasCh(layer, ID_USER) ? 'user' : (hasCh(layer, ID_REAL) ? 'real' : null);
    if (!which || !hasCh(layer, which === 'user' ? ID_USER : ID_REAL)) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」没有可应用的蒙版通道` +
        `（通道表 ${layer.channels.map(c => c.id).join(',')}）`, { index: idx });
    }
    if (!m) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的通道表里有蒙版通道，蒙版段却是空的，拒绝改写`, { index: idx });
    }

    const maskId = which === 'user' ? ID_USER : ID_REAL;
    
    const geom = maskId === ID_REAL
      ? (m.real || null)
      : { top: m.top, left: m.left, bottom: m.bottom, right: m.right, defaultColor: m.defaultColor, flags: m.flags };
    if (!geom) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」要应用的是 real 用户蒙版(-3)，` +
        `但蒙版段里没有 real 子块（段长 ${m._size} 字节），读不到它的 bounds`, { index: idx });
    }
    const mFlags = (geom.flags != null ? geom.flags : 0) & 0xff;

    const lw = layer.bounds.right - layer.bounds.left;
    const lh = layer.bounds.bottom - layer.bounds.top;

    




    if (mFlags & M_DISABLED) {
      if (which !== 'real') warnVector(warnings, layer, idx, '应用蒙版');
      const r = stripMask(layer, m, which, op, i, idx);
      return {
        buffer: serializeAligned(h, doc),
        result: {
          changed: true, applied: false, reason: 'mask-disabled', which,
          note: plan.note + `：该蒙版处于停用状态（flags 位1），按 PS 语义直接删除、像素不变`,
          removedChannels: r.removed, pixelsChanged: false,
        },
      };
    }

    
    
    const p = m.parameters;
    if ((mFlags & M_HAS_PARAMS) && p) {
      const dens = p.userMaskDensity;
      const feat = p.userMaskFeather;
      if ((dens != null && dens !== 255) || (feat != null && feat !== 0)) {
        throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的蒙版带浓度/羽化参数` +
          `（density=${dens}, feather=${feat}）；这两项的合成规则 PS 未公开，` +
          `硬烘出来的像素会与 PS 显示的不一致。请先把浓度调回 255、羽化调回 0` +
          `（setMaskProps），或改用 deleteLayerMask`,
          { index: idx, density: dens, feather: feat });
      }
    }

    if (lw <= 0 || lh <= 0) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的包围盒是 ${lw}×${lh}（空图层），没有像素可以应用蒙版`,
        { index: idx, bounds: layer.bounds });
    }

    const mw = Math.max(0, geom.right - geom.left);
    const mh = Math.max(0, geom.bottom - geom.top);
    const maxV = sampleMax(depth);
    const scale = sampleScale(depth);   

    
    const maskCh = layer.channels[chIndex(layer, maskId)];
    let plane = null;
    if (mw > 0 && mh > 0 && maskCh.length > 0) {
      plane = decodePlane(maskCh, mw, mh, depth, psb, op, i, `图层 ${idx} 的蒙版通道 ${maskId}`);
    }
    const defV = ((geom.defaultColor == null ? 0 : geom.defaultColor) & 0xff) * scale;
    const relative = !!(mFlags & M_RELATIVE);
    const invert = !!(mFlags & M_INVERT);
    
    
    const values = new (sampleArr(depth))(lw * lh);
    for (let ly = 0; ly < lh; ly++) {
      for (let lx = 0; lx < lw; lx++) {
        let v = defV;
        if (plane) {
          const mx = relative ? (lx - geom.left) : ((layer.bounds.left + lx) - geom.left);
          const my = relative ? (ly - geom.top) : ((layer.bounds.top + ly) - geom.top);
          if (mx >= 0 && mx < mw && my >= 0 && my < mh) v = plane[my * mw + mx];
        }
        values[ly * lw + lx] = invert ? (maxV - v) : v;
      }
    }

    
    const alphaAt = chIndex(layer, ID_ALPHA);
    const alphaCreated = alphaAt < 0;
    let alpha, alphaComp;
    if (alphaCreated) {
      alpha = new (sampleArr(depth))(lw * lh).fill(maxV);
      alphaComp = siblingCompression(layer, depth);
    } else {
      const ch = layer.channels[alphaAt];
      alphaComp = (ch.compression === Compression.RAW || ch.compression === Compression.RLE
        || ch.compression === Compression.ZIP || ch.compression === Compression.ZIP_PREDICTION)
        ? ch.compression : Compression.RLE;
      const decoded = decodePlane(ch, lw, lh, depth, psb, op, i, `图层 ${idx} 的 alpha 通道(-1)`);
      alpha = sampleArr(depth).from(decoded);
    }

    
    let changedPixels = 0;
    for (let k = 0; k < lw * lh; k++) {
      const before = alpha[k];
      const after = depth === 32 ? (before * values[k]) / maxV : Math.round((before * values[k]) / maxV);
      if (after !== before) { alpha[k] = after; changedPixels++; }
    }

    if (alphaCreated) {
      layer.channels.splice(0, 0, makeChannel(ID_ALPHA, alpha, lw, lh, depth, alphaComp, psb));
    } else {
      setChannel(layer.channels[chIndex(layer, ID_ALPHA)], alpha, lw, lh, depth, alphaComp, psb);
    }

    
    
    
    if (changedPixels > 0) {
      warnings.push(`图层 ${idx}「${nameOf(layer)}」应用蒙版改了 ${changedPixels} 个 alpha 像素，` +
        `但整幅合成图（Image Data 段）与缩略图资源没有重编 —— 需要的话请另外调 replaceLayerPixels 传 merged`);
    }
    if (which !== 'real') warnVector(warnings, layer, idx, '应用蒙版');

    
    const r = stripMask(layer, m, which, op, i, idx);

    return {
      buffer: serializeAligned(h, doc),
      result: {
        changed: true, applied: true, which, note: plan.note,
        alphaCreated, pixelsChanged: changedPixels,
        removedChannels: r.removed, renamedRealToUser: r.renamed,
        maskBounds: { top: geom.top, left: geom.left, bottom: geom.bottom, right: geom.right },
        maskDefaultColor: geom.defaultColor, maskInverted: invert,
        channelsAfter: layer.channels.map(c => c.id),
      },
    };
  }

  



  const FILL_NAME = { reveal: '全显示(255)', hide: '全隐藏(0)' };

  function validateAdd(state, op, i) {
    const layer = pickLayer(state, op, i, '加蒙版');
    if (op.fill !== undefined && op.gray !== undefined)
      throw opFail(i, op, 'fill 与 gray 只能给一个：gray 是现成的灰度位图，fill 是纯色填充值');

    let fillValue = 255, fillName = FILL_NAME.reveal;
    if (op.fill !== undefined) {
      if (op.fill === 'reveal') { fillValue = 255; fillName = FILL_NAME.reveal; }
      else if (op.fill === 'hide') { fillValue = 0; fillName = FILL_NAME.hide; }
      else if (Number.isInteger(op.fill) && op.fill >= 0 && op.fill <= 255) { fillValue = op.fill; fillName = `灰度 ${op.fill}`; }
      else throw opFail(i, op, `fill 只能是 'reveal'（全白 255，默认）/ 'hide'（全黑 0）/ 0…255 的整数，收到 ${JSON.stringify(op.fill)}`);
    }

    let bounds = null;
    if (op.bounds !== undefined) {
      const b = op.bounds;
      if (!b || typeof b !== 'object') throw opFail(i, op, 'bounds 必须是 { top, left, bottom, right }');
      for (const k of ['top', 'left', 'bottom', 'right']) {
        if (!Number.isInteger(b[k])) throw opFail(i, op, `bounds.${k} 必须是整数，收到 ${JSON.stringify(b[k])}`);
      }
      if (b.right <= b.left || b.bottom <= b.top)
        throw opFail(i, op, `bounds 尺寸非法：${b.right - b.left}×${b.bottom - b.top}（宽高都必须 > 0）`);
      bounds = { top: b.top, left: b.left, bottom: b.bottom, right: b.right };
    } else {
      const lb = layer.bounds;
      if (lb.right <= lb.left || lb.bottom <= lb.top)
        throw opFail(i, op, `图层 ${op.index}「${layer.name}」的包围盒是 ${lb.right - lb.left}×${lb.bottom - lb.top}（空图层），` +
          `没法用它当蒙版 bounds；请显式给 bounds`, { bounds: lb });
      bounds = { top: lb.top, left: lb.left, bottom: lb.bottom, right: lb.right };
    }
    


    if (op.compact && op.gray === undefined && op.fill !== undefined)
      bounds = { top: 0, left: 0, bottom: 1, right: 1 };
    const w = bounds.right - bounds.left, hgt = bounds.bottom - bounds.top;

    let gray = null;
    if (op.gray !== undefined) {
      const g = op.gray;
      const data = (g && !isBytes(g) && isBytes(g.data)) ? g.data : g;
      if (!isBytes(data)) throw opFail(i, op, 'gray 必须是灰度字节（Uint8Array / ArrayBuffer / number[]），或 { data, width, height }');
      gray = data instanceof Uint8Array ? data : u8of(data);
      if (g && !isBytes(g) && (g.width !== undefined || g.height !== undefined)) {
        if (op.bounds === undefined) {
          bounds = { top: layer.bounds.top, left: layer.bounds.left, bottom: layer.bounds.top + (g.height | 0), right: layer.bounds.left + (g.width | 0) };
        } else if ((g.width | 0) !== w || (g.height | 0) !== hgt) {
          throw opFail(i, op, `gray 尺寸 ${g.width}×${g.height} 与 bounds ${w}×${hgt} 不符`);
        }
      }
      const gw = bounds.right - bounds.left, gh = bounds.bottom - bounds.top;
      if (gray.length !== gw * gh)
        throw opFail(i, op, `gray 长度 ${gray.length} ≠ bounds 尺寸 ${gw}×${gh} = ${gw * gh}（8 位灰度，一个像素一字节）`);
      fillName = `外部灰度位图 ${gw}×${gh}`;
    }

    let defaultColor = gray ? 0 : fillValue;
    if (op.defaultColor !== undefined) {
      if (!Number.isInteger(op.defaultColor) || op.defaultColor < 0 || op.defaultColor > 255)
        throw opFail(i, op, `defaultColor 必须是 0…255 的整数（蒙版矩形之外按它取值），收到 ${JSON.stringify(op.defaultColor)}`);
      defaultColor = op.defaultColor;
    }
    for (const k of ['disabled', 'invert']) {
      if (op[k] !== undefined && typeof op[k] !== 'boolean')
        throw opFail(i, op, `${k} 必须是布尔值，收到 ${JSON.stringify(op[k])}`);
    }

    return {
      affected: [op.index], changed: ['mask', 'channels'], _i: i, _op: op,
      bounds, fillValue, gray, defaultColor,
      note: `图层 ${op.index}「${layer.name}」新建蒙版 ${bounds.right - bounds.left}×${bounds.bottom - bounds.top}（${fillName}）`,
    };
  }

  function applyAdd(ab, state, op, plan, warnings) {
    const i = plan._i, idx = op.index;
    const { doc, layer, psb, depth } = open(ab, op, i, idx);

    if (hasCh(layer, ID_USER)) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」已经有用户蒙版了（通道 -2，蒙版段 ${layer.mask ? layer.mask._size : 0} 字节）；` +
        `要换一张请先 deleteLayerMask，本 op 不做覆盖`, { index: idx });
    }
    if (hasCh(layer, ID_REAL)) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」有 real 用户蒙版(-3) 却没有用户蒙版(-2)，` +
        `这是个非法形态（-3 的定义就是「与 -2 成对出现」）；请先 deleteLayerMask which:'all'`,
        { index: idx, channels: layer.channels.map(c => c.id) });
    }
    const cur = layer.mask;
    const curVp = cur && cur.present && isEmptyRect(cur) ? vectorParamsOf(cur) : null;   
    if (cur && cur.present && !curVp) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的通道表里没有蒙版通道，蒙版段却有 ${cur._size} 字节；` +
        `文件结构自相矛盾，拒绝在上面新建蒙版`, { index: idx, maskLen: cur._size });
    }

    const b = plan.bounds;
    const w = b.right - b.left, hgt = b.bottom - b.top;
    const scale = sampleScale(depth);
    const Arr = sampleArr(depth);

    let data;
    if (plan.gray) {
      data = new Arr(w * hgt);
      for (let k = 0; k < w * hgt; k++) data[k] = plan.gray[k] * scale;
    } else {
      data = new Arr(w * hgt).fill(plan.fillValue * scale);
    }

    const comp = siblingCompression(layer, depth);
    const ch = makeChannel(ID_USER, data, w, hgt, depth, comp, psb);
    layer.channels.splice(maskInsertAt(layer, ID_USER), 0, ch);

    let flags = 0;
    if (op.disabled) flags |= M_DISABLED;
    if (op.invert) flags |= M_INVERT;
    layer.mask = makeMask(b, plan.defaultColor, flags);
    if (curVp) layer.mask = finalizeMask({ ...layer.mask, flags: flags | M_HAS_PARAMS, parameters: curVp });

    return {
      buffer: serializeAligned(h, doc),
      result: {
        changed: true, note: plan.note,
        bounds: b, defaultColor: plan.defaultColor, maskFlags: flags,
        fill: plan.gray ? null : plan.fillValue,
        compression: COMP_NAME[comp] || String(comp),
        channelBytes: ch.length, maskLen: u8of(writeLayerMask(layer.mask)).length - 4,
        channelsAfter: layer.channels.map(c => c.id),
      },
    };
  }

  



  
  function grayView(g) {
    const data = (g && !isBytes(g) && !(g instanceof Uint16Array) && isBytes(g.data)) ? g.data : g;
    if (data instanceof Uint16Array) return data;
    return u8of(data);
  }

  function validateSetPixels(state, op, i) {
    const layer = pickLayer(state, op, i, '涂蒙版');
    const which = op.which === undefined ? 'user' : op.which;
    if (which !== 'user' && which !== 'real') {
      throw opFail(i, op, `which 只能是 'user'（默认，通道 -2）或 'real'（通道 -3），收到 ${JSON.stringify(op.which)}`);
    }

    const g = op.gray;
    const raw = (g && !isBytes(g) && !(g instanceof Uint16Array) && g.data !== undefined) ? g.data : g;
    if (!isBytes(raw) && !(raw instanceof Uint16Array)) {
      throw opFail(i, op, 'gray 必须是灰度样本（Uint8Array / Uint16Array / ArrayBuffer / number[]），或 { data, width, height }');
    }
    const gray = grayView(g);

    
    const rectKeys = ['x', 'y', 'w', 'h'].filter(k => op[k] !== undefined);
    let rect = null;
    if (rectKeys.length) {
      for (const k of rectKeys) {
        if (!Number.isInteger(op[k])) throw opFail(i, op, `${k} 必须是整数，收到 ${JSON.stringify(op[k])}`);
      }
      if (op.w === undefined || op.h === undefined) {
        throw opFail(i, op, `给了 ${rectKeys.join('/')} 就必须同时给出 w 与 h（矩形的宽高）；` +
          `x/y 可以省略（默认 0），w/h 不能猜`);
      }
      if (op.w <= 0 || op.h <= 0) throw opFail(i, op, `矩形尺寸非法：${op.w}×${op.h}（宽高都必须 > 0）`);
      const x = op.x === undefined ? 0 : op.x, y = op.y === undefined ? 0 : op.y;
      if (x < 0 || y < 0) throw opFail(i, op, `x/y 是相对蒙版左上角的偏移，不能是负数（收到 ${x},${y}）`);
      rect = { x, y, w: op.w, h: op.h };
      if (gray.length !== rect.w * rect.h) {
        throw opFail(i, op, `gray 长度 ${gray.length} ≠ 矩形 ${rect.w}×${rect.h} = ${rect.w * rect.h}`,
          { expected: rect.w * rect.h, actual: gray.length });
      }
    }

    
    let bounds = null;
    if (op.bounds !== undefined) {
      if (rect) throw opFail(i, op, 'bounds 与 x/y/w/h 不能一起给：改 bounds 时必须提供覆盖整张新蒙版的 gray');
      const b = op.bounds;
      if (!b || typeof b !== 'object') throw opFail(i, op, 'bounds 必须是 { top, left, bottom, right }');
      for (const k of ['top', 'left', 'bottom', 'right']) {
        if (!Number.isInteger(b[k])) throw opFail(i, op, `bounds.${k} 必须是整数，收到 ${JSON.stringify(b[k])}`);
      }
      if (b.right <= b.left || b.bottom <= b.top) {
        throw opFail(i, op, `bounds 尺寸非法：${b.right - b.left}×${b.bottom - b.top}（宽高都必须 > 0）`);
      }
      bounds = { top: b.top, left: b.left, bottom: b.bottom, right: b.right };
      const bw = bounds.right - bounds.left, bh = bounds.bottom - bounds.top;
      if (gray.length !== bw * bh) {
        throw opFail(i, op, `gray 长度 ${gray.length} ≠ 新 bounds 尺寸 ${bw}×${bh} = ${bw * bh}`,
          { expected: bw * bh, actual: gray.length });
      }
    }

    
    if (g && !isBytes(g) && !(g instanceof Uint16Array) && (g.width !== undefined || g.height !== undefined)) {
      const gw = g.width | 0, gh = g.height | 0;
      if (gw * gh !== gray.length) {
        throw opFail(i, op, `gray.width×gray.height = ${gw}×${gh} = ${gw * gh} 与 gray.data 长度 ${gray.length} 不符`,
          { expected: gw * gh, actual: gray.length });
      }
      if (rect && (gw !== rect.w || gh !== rect.h)) {
        throw opFail(i, op, `gray 尺寸 ${gw}×${gh} 与矩形 ${rect.w}×${rect.h} 不符`);
      }
      if (!rect && !bounds) rect = { x: 0, y: 0, w: gw, h: gh, _fromGray: true };
    }

    const where = bounds ? `并把 bounds 改成 ${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`
      : rect ? `矩形 ${rect.x},${rect.y} ${rect.w}×${rect.h}` : '整张';
    return {
      affected: [op.index], changed: ['maskPixels'], _i: i, _op: op,
      which, gray, rect, bounds,
      note: `图层 ${op.index}「${layer.name}」改写${WHICH_LABEL[which]}像素（${where}）`,
    };
  }

  function applySetPixels(ab, state, op, plan, warnings) {
    const i = plan._i, idx = op.index, which = plan.which;
    const { doc, layer, psb, depth } = open(ab, op, i, idx);
    const maskId = which === 'user' ? ID_USER : ID_REAL;
    const k = chIndex(layer, maskId);

    if (k < 0) {
      const other = which === 'user' ? ID_REAL : ID_USER;
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」没有${WHICH_LABEL[which]}（通道表 ${layer.channels.map(c => c.id).join(',')}）；` +
        (hasCh(layer, other) ? `它只有${WHICH_LABEL[which === 'user' ? 'real' : 'user']}，请换 which` :
          `本 op 只改现成蒙版的像素，要新建蒙版请先用 addLayerMask`),
        { index: idx, which, channels: layer.channels.map(c => c.id) });
    }
    const m = maskModel(layer, op, i, idx);
    if (!m) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的通道表里有蒙版通道，蒙版段却是空的（长度 0）；` +
        `文件结构自相矛盾，拒绝改写`, { index: idx });
    }
    
    const geom = maskId === ID_REAL ? m.real : m;
    if (!geom || geom.right == null) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的蒙版段里没有 real 子块（段长 ${m._size} 字节），` +
        `读不到 -3 通道的 bounds，无从定位要改哪些像素`, { index: idx, maskLen: m._size });
    }

    const ch = layer.channels[k];
    const curW = geom.right - geom.left, curH = geom.bottom - geom.top;
    const comp = ch.compression;
    const Arr = sampleArr(depth);
    const scale = sampleScale(depth);
    const gray = plan.gray;
    const grayIsNative16 = depth === 16 && gray instanceof Uint16Array;

    
    const sample = j => (grayIsNative16 ? gray[j] : gray[j] * scale);

    
    if (plan.bounds) {
      const nb = plan.bounds;
      const changedBounds = nb.top !== geom.top || nb.left !== geom.left
        || nb.bottom !== geom.bottom || nb.right !== geom.right;
      if (changedBounds) {
        
        if (m._writeMode !== 'semantic') {
          throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的蒙版段解析没能语义自校验通过` +
            `（_writeMode=${m._writeMode}，写回时会照抄原字节），改 bounds 会被静默丢掉；` +
            `请改用 deleteLayerMask + addLayerMask 重建蒙版`, { index: idx, writeMode: m._writeMode });
        }
      }
      const nw = nb.right - nb.left, nh = nb.bottom - nb.top;
      const data = new Arr(nw * nh);
      for (let j = 0; j < nw * nh; j++) data[j] = sample(j);
      const bytes = encodeChannel({ data, width: nw, height: nh, depth, compression: comp, psb, reuseRaw: false, withHeader: true });
      
      if (changedBounds && curW > 0 && curH > 0) {
        const dropped = channelTail(ch, curW, curH, depth, psb);
        if (dropped.length) {
          warnings.push(`图层 ${idx}「${nameOf(layer)}」的${WHICH_LABEL[which]}通道原本比 ${curW}×${curH} ` +
            `多出 ${dropped.length} 字节读不懂的尾巴；蒙版尺寸变了，这段字节已丢弃`);
        }
      }
      
      geom.top = nb.top; geom.left = nb.left; geom.bottom = nb.bottom; geom.right = nb.right;
      ch._raw = bytes; ch.length = bytes.length; ch.compression = comp; ch._dirty = true;
      if (changedBounds) {
        warnings.push(`图层 ${idx}「${nameOf(layer)}」的${WHICH_LABEL[which]} bounds 从 ` +
          `${curW}×${curH} 改成了 ${nw}×${nh}：蒙版矩形之外的像素按 defaultColor=${geom.defaultColor} 取值`);
      }
      return {
        buffer: serializeAligned(h, doc),
        result: {
          changed: true, note: plan.note, which, structural: changedBounds,
          bounds: { ...nb }, boundsChanged: changedBounds, maskSectionTouched: changedBounds,
          maskSize: { width: nw, height: nh },
          rect: { x: 0, y: 0, w: nw, h: nh },
          pixelsChanged: nw * nh,
          compression: COMP_NAME[comp] || String(comp),
          channelBytes: bytes.length, path: 'reserialize',
        },
      };
    }

    
    if (curW <= 0 || curH <= 0) {
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」的${WHICH_LABEL[which]} bounds 是 ${curW}×${curH}（空蒙版），` +
        `没有像素可以改；请用 bounds 参数给它一个尺寸，或删掉重建`, { index: idx, maskSize: { width: curW, height: curH } });
    }
    const rect = plan.rect || { x: 0, y: 0, w: curW, h: curH };
    if (rect.x + rect.w > curW || rect.y + rect.h > curH) {
      throw opFail(i, op, `矩形 ${rect.x},${rect.y} ${rect.w}×${rect.h} 超出了${WHICH_LABEL[which]}的范围 ` +
        `${curW}×${curH}（x/y 是相对蒙版左上角的偏移，不是文档坐标）`,
        { index: idx, rect: { ...rect }, maskSize: { width: curW, height: curH } });
    }
    if (gray.length !== rect.w * rect.h) {
      throw opFail(i, op, `gray 长度 ${gray.length} ≠ 目标区域 ${rect.w}×${rect.h} = ${rect.w * rect.h}` +
        (plan.rect ? '' : `（没给 x/y/w/h 就是整张蒙版 ${curW}×${curH}）`),
        { expected: rect.w * rect.h, actual: gray.length, maskSize: { width: curW, height: curH } });
    }

    
    const plane = decodePlane(ch, curW, curH, depth, psb, op, i, `图层 ${idx} 的${WHICH_LABEL[which]}通道`);
    const next = Arr.from(plane);
    let changedPixels = 0;
    for (let ry = 0; ry < rect.h; ry++) {
      const dst = (ry + rect.y) * curW + rect.x, src = ry * rect.w;
      for (let rx = 0; rx < rect.w; rx++) {
        const v = depth === 32 ? Math.fround(sample(src + rx)) : sample(src + rx);
        if (next[dst + rx] !== v) { next[dst + rx] = v; changedPixels++; }
      }
    }

    const base = {
      changed: changedPixels > 0, note: plan.note, which,
      rect: { ...rect }, pixelsChanged: changedPixels,
      maskSize: { width: curW, height: curH },
      maskBounds: { top: geom.top, left: geom.left, bottom: geom.bottom, right: geom.right },
      compression: COMP_NAME[comp] || String(comp),
      boundsChanged: false, maskSectionTouched: false,
    };

    
    if (!changedPixels) {
      return { buffer: h.copyAB(ab), result: { ...base, path: 'noop', channelBytes: ch.length } };
    }

    const enc = encodeChannel({ data: next, width: curW, height: curH, depth, compression: comp, psb, reuseRaw: false, withHeader: true });
    
    const tail = channelTail(ch, curW, curH, depth, psb);
    const bytes = tail.length ? join([enc, tail]) : enc;
    if (tail.length) {
      warnings.push(`图层 ${idx}「${nameOf(layer)}」的${WHICH_LABEL[which]}通道比 ${curW}×${curH} 的蒙版` +
        `多出 ${tail.length} 字节（文件本身给多了）；这段读不懂的字节已原样接回，没有丢`);
    }

    
    if (ch._off != null && ch._end != null && ch._end - ch._off === bytes.length) {
      const out = h.copyAB(ab);
      new Uint8Array(out).set(bytes, ch._off);
      return { buffer: out, result: { ...base, path: 'patch', channelBytes: bytes.length } };
    }

    
    ch._raw = bytes; ch.length = bytes.length; ch.compression = comp; ch._dirty = true;
    return { buffer: serializeAligned(h, doc), result: { ...base, path: 'reserialize', channelBytes: bytes.length } };
  }

  

  






  function validateReplace(state, op, i) {
    const layer = pickLayer(state, op, i, '换蒙版');
    const b = op.bounds;
    if (!b || ['top', 'left', 'bottom', 'right'].some(k => !Number.isInteger(b[k])))
      throw opFail(i, op, 'bounds 必须是整数 { top, left, bottom, right }');
    const w = b.right - b.left, hgt = b.bottom - b.top;
    if (!(w > 0 && hgt > 0)) throw opFail(i, op, `bounds 尺寸非法：${w}×${hgt}`);
    const g = grayView(op.gray);
    if (!g || g.length !== w * hgt) throw opFail(i, op, `gray 长度 ${g ? g.length : 0} ≠ ${w}×${hgt}`);
    if (op.defaultColor !== undefined && !(op.defaultColor === 0 || op.defaultColor === 255))
      throw opFail(i, op, 'defaultColor 只能是 0 或 255');
    return { affected: [op.index], _i: i, _op: op, bounds: { ...b }, gray: g,
      note: `图层 ${op.index}「${nameOf(layer)}」换用户蒙版 → ${w}×${hgt} @${b.left},${b.top}` };
  }
  function applyReplace(ab, state, op, plan) {
    const i = plan._i, idx = op.index;
    const { doc, layer, psb, depth } = open(ab, op, i, idx);
    const k = layer.channels.findIndex(c => c.id === ID_USER);
    if (k < 0 || !layer.mask || !layer.mask.present)
      throw opFail(i, op, `图层 ${idx}「${nameOf(layer)}」没有用户蒙版，换不了；新建请用 addLayerMask`, { index: idx });
    const b = plan.bounds, w = b.right - b.left, hgt = b.bottom - b.top;
    const scale = sampleScale(depth), Arr = sampleArr(depth);
    const data = new Arr(w * hgt);
    for (let q = 0; q < w * hgt; q++) data[q] = plan.gray[q] * scale;
    layer.channels[k] = makeChannel(ID_USER, data, w, hgt, depth, siblingCompression(layer, depth), psb);
    const m = { ...layer.mask, top: b.top, left: b.left, bottom: b.bottom, right: b.right };
    if (op.defaultColor !== undefined) m.defaultColor = op.defaultColor;
    layer.mask = finalizeMask(m);
    return { buffer: serializeAligned(h, doc), result: { changed: true, note: plan.note, bounds: b } };
  }

  return {
    
    
    deleteLayerMask: { validate: validateDelete, apply: applyDelete, structural: true },
    replaceLayerMask: { validate: validateReplace, apply: applyReplace, structural: true },
    applyLayerMask: { validate: validateApply, apply: applyApply, structural: true },
    addLayerMask: { validate: validateAdd, apply: applyAdd, structural: true },
    
    
    
    setLayerMaskPixels: { validate: validateSetPixels, apply: applySetPixels },
  };
}

export default { createMaskOps };
