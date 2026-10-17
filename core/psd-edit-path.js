















































import { serializeDescriptor } from './psd-descriptor.js';
import { Reader, readDescriptor, parsePsdFull } from './psd-parse.js';
import {
  PATH_OPERATIONS, fixedToFloat, floatToFixed,
  parseVectorMask, writeVectorMask, groupSubpaths,
} from './psd-path.js';



const MASK_KEYS = ['vmsk', 'vsms'];   
const STROKE_KEY = 'vstk';            
const RECORD_SIZE = 26;               
const VM_HEAD = 8;                    
const PAD = 4;                        

const UNITS = ['pixel', 'normalized', 'fixed'];





const PAD4_FALLBACK = new Set(['Txt2', 'luni', 'vmsk', 'artb', 'artd', 'vogk', 'SoLd', 'lnk2', 'lnk3', 'lnkD', 'lnkE',
  'vscg', 'vsms', 'GdFl', 'lmfx', 'lrFX', 'cinf', 'PlLd', 'Anno', 'CAI ', 'OCIO', 'GenI', 'FEid', 'curv', 'CgEd', 'vibA', 'blwh', 'grdm']);

const hex = n => '0x' + (n & 0xff).toString(16).padStart(2, '0');
const numStr = v => (Object.is(v, -0) ? '-0' : String(v));
const isMeta = k => k.startsWith('__');
function checksum(u8) { let s = 0; for (let i = 0; i < u8.length; i++) s = (s * 31 + u8[i]) >>> 0; return s; }




function toUser(fixed, dim, units) {
  if (units === 'fixed') return fixed | 0;
  const n = fixedToFloat(fixed | 0);
  return units === 'normalized' ? n : n * dim;
}


function toFixedInt(val, dim, units) {
  if (units === 'fixed') return val | 0;
  return floatToFixed(units === 'normalized' ? val : val / dim);
}






function coordFixed(oldFixed, val, dim, units) {
  if (oldFixed !== undefined && oldFixed !== null && toUser(oldFixed, dim, units) === val) return oldFixed | 0;
  return toFixedInt(val, dim, units);
}




const FULL_CACHE = new WeakMap();
function fullOf(ab) {
  let v = FULL_CACHE.get(ab);
  if (!v) { v = parsePsdFull(ab); FULL_CACHE.set(ab, v); }
  return v;
}


function rawBlock(ab, index, key) {
  const psd = fullOf(ab);
  const L = psd.layers[index];
  if (!L) return null;
  const b = (L.blocks || []).find(x => x.key === key);
  if (!b) return null;
  return {
    key, dataOffset: b.dataOffset, dataLength: b.dataLength,
    sigOffset: b.sigOffset, blockEnd: b.blockEnd, isBig: !!b.isBig,
    raw: new Uint8Array(ab, b.dataOffset, b.dataLength),
  };
}


function blockKeysOf(ab, index) {
  const psd = fullOf(ab);
  const L = psd.layers[index];
  return L ? (L.blocks || []).map(b => b.key) : [];
}


function layersWithMask(ab) {
  const psd = fullOf(ab);
  const out = [];
  psd.layers.forEach((L, i) => {
    const keys = (L.blocks || []).map(b => b.key).filter(k => MASK_KEYS.includes(k));
    if (keys.length) out.push(`${i}(${keys.join('+')})`);
  });
  return out;
}

function layersWithStroke(ab) {
  const psd = fullOf(ab);
  const out = [];
  psd.layers.forEach((L, i) => { if ((L.blocks || []).some(b => b.key === STROKE_KEY)) out.push(String(i)); });
  return out;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}


function blockFingerprints(ab) {
  const psd = fullOf(ab);
  const map = new Map();
  psd.layers.forEach((L, i) => {
    (L.blocks || []).forEach((b, k) => {
      map.set(`${i}/${k}/${b.key}`, `${b.dataLength}:${checksum(new Uint8Array(ab, b.dataOffset, b.dataLength))}`);
    });
  });
  return map;
}

function fingerprintDiff(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const k of keys) if (a.get(k) !== b.get(k)) out.push(`${k}: ${a.get(k) ?? '无'} → ${b.get(k) ?? '无'}`);
  return out;
}







function probeMaskBlock(ab, index, key) {
  const blk = rawBlock(ab, index, key);
  if (!blk) return { ok: false, key, reason: `图层 ${index} 没有 ${key} 块` };
  if (blk.dataLength < VM_HEAD)
    return { ok: false, key, reason: `${key} 块只有 ${blk.dataLength} 字节，放不下 version(4)+flags(4)` };

  let model;
  try { model = parseVectorMask(blk.raw); } catch (e) {
    return { ok: false, key, reason: `${key} 解析失败（${e && e.message}）` };
  }
  if (model.version !== 3)
    return { ok: false, key, reason: `${key} 的 version=${model.version}（只认识 3），不敢按路径记录改写` };

  let re;
  try { re = writeVectorMask(model); } catch (e) {
    return { ok: false, key, reason: `${key} 无法重新序列化（${e && e.message}）` };
  }
  if (re.length !== blk.raw.length)
    return { ok: false, key, reason: `${key} 重序列化长度对不上（原 ${blk.raw.length} 字节 → 重建 ${re.length} 字节）` };
  const d = firstDiff(re, blk.raw);
  if (d >= 0)
    return {
      ok: false, key,
      reason: `${key} 重序列化在块内偏移 ${d}（文件绝对偏移 ${blk.dataOffset + d}）就对不上（原 ${hex(blk.raw[d])} → 重建 ${hex(re[d])}）`,
    };

  
  const recs = model.path.records;
  const first = recs.findIndex(r => r.type === 'subpath');
  const head = first < 0 ? recs.slice() : recs.slice(0, first);
  const body = first < 0 ? [] : recs.slice(first);
  const bad = body.find(r => r.type !== 'subpath' && r.type !== 'knot');
  if (bad)
    return {
      ok: false, key,
      reason: `${key} 的子路径区里混着 ${bad.type}(selector=${bad.selector}) 记录，这种排布本模块没见过，拒绝重排路径`,
    };

  return { ok: true, key, blk, model, records: recs, head, body, tail: model.path._tail };
}



function asAB(buffer) {
  if (buffer instanceof ArrayBuffer) return buffer;
  if (ArrayBuffer.isView(buffer)) return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  throw new Error('psd-edit-path：需要 ArrayBuffer 或 TypedArray');
}












export function getVectorMaskPath(buffer, index, opts = {}) {
  const ab = asAB(buffer);
  const units = opts.units || 'pixel';
  if (!UNITS.includes(units)) throw new Error(`units 只能是 ${UNITS.join('/')}，收到 ${JSON.stringify(units)}`);
  const keys = opts.block ? [opts.block] : MASK_KEYS.filter(k => rawBlock(ab, index, k));
  if (!keys.length) return null;
  const p = probeMaskBlock(ab, index, keys[0]);
  if (!p.ok) throw new Error(p.reason);
  const { width, height } = fullOf(ab).header;
  const init = p.head.find(r => r.type === 'initialFill');
  return {
    block: p.key, units, width, height,
    version: p.model.version, flags: p.model.flags,
    invert: p.model.invert, notLink: p.model.notLink, disable: p.model.disable,
    fillStartsWithAllPixels: init ? !!init.fillStartsWithAllPixels : null,
    knotCount: p.body.filter(r => r.type === 'knot').length,
    subpaths: groupSubpaths(p.body).map(g => ({
      closed: !g.subpath.open,
      operation: g.subpath.operationName || (g.subpath.operation === -1 ? null : g.subpath.operation),
      knots: g.knots.map(k => ({
        anchor: [toUser(k.fixed[3], width, units), toUser(k.fixed[2], height, units)],
        in: [toUser(k.fixed[1], width, units), toUser(k.fixed[0], height, units)],
        out: [toUser(k.fixed[5], width, units), toUser(k.fixed[4], height, units)],
        linked: k.linked,
      })),
    })),
  };
}





export function probeVectorPath(buffer, index) {
  const ab = asAB(buffer);
  const blocks = blockKeysOf(ab, index);
  const masks = MASK_KEYS.filter(k => blocks.includes(k)).map(k => {
    const p = probeMaskBlock(ab, index, k);
    return p.ok
      ? {
        key: k, ok: true, bytes: p.blk.dataLength,
        subpaths: groupSubpaths(p.body).length,
        knots: p.body.filter(r => r.type === 'knot').length,
        flags: p.model.flags,
      }
      : { key: k, ok: false, reason: p.reason };
  });
  let stroke = null;
  if (blocks.includes(STROKE_KEY)) {
    const p = probeStrokeBlock(ab, index);
    stroke = p.ok
      ? { key: STROKE_KEY, ok: true, bytes: p.blk.dataLength, fields: Object.keys(p.desc).filter(k => !isMeta(k)) }
      : { key: STROKE_KEY, ok: false, reason: p.reason };
  }
  return { hasMask: !!masks.length, hasStroke: !!stroke, masks, stroke, blocks };
}





export function getVectorStroke(buffer, index) {
  const ab = asAB(buffer);
  const p = probeStrokeBlock(ab, index);
  if (!p.ok) {
    if (!rawBlock(ab, index, STROKE_KEY)) return null;
    throw new Error(p.reason);
  }
  const out = {};
  for (const name of Object.keys(STROKE_FIELDS)) {
    const spec = STROKE_FIELDS[name];
    const v = readStrokeField(p.desc, spec);
    if (v !== undefined) out[name] = v;
  }
  return out;
}




function probeStrokeBlock(ab, index) {
  const blk = rawBlock(ab, index, STROKE_KEY);
  if (!blk) return { ok: false, reason: `图层 ${index} 没有 ${STROKE_KEY}（矢量描边参数）块` };
  if (blk.dataLength < 8)
    return { ok: false, reason: `${STROKE_KEY} 块只有 ${blk.dataLength} 字节，放不下 descriptorVersion(4)+描述符` };

  const dv = new DataView(blk.raw.buffer, blk.raw.byteOffset, blk.raw.byteLength);
  const descVersion = dv.getUint32(0, false);
  if (descVersion !== 16)
    return { ok: false, reason: `${STROKE_KEY} 的 descriptorVersion=${descVersion}（只认识 16），不敢按描述符改写` };

  let desc, consumed;
  try {
    const r = new Reader(blk.raw);
    r.seek(4);
    desc = readDescriptor(r);
    consumed = r.o;
  } catch (e) {
    return { ok: false, reason: `${STROKE_KEY} 的描述符解析失败（${e && e.message}）` };
  }
  if (consumed > blk.raw.length)
    return { ok: false, reason: `${STROKE_KEY} 的描述符读过了块尾（读到 ${consumed} / 块长 ${blk.raw.length}）` };

  let ser;
  try { ser = serializeDescriptor(desc); } catch (e) {
    return { ok: false, reason: `${STROKE_KEY} 的描述符无法重新序列化（${e && e.message}）` };
  }
  const body = blk.raw.subarray(4, consumed);
  if (ser.length !== body.length)
    return { ok: false, reason: `${STROKE_KEY} 的描述符重序列化长度对不上（原 ${body.length} 字节 → 重建 ${ser.length} 字节）` };
  const d = firstDiff(ser, body);
  if (d >= 0)
    return {
      ok: false,
      reason: `${STROKE_KEY} 的描述符重序列化在描述符第 ${d} 字节（块内偏移 ${4 + d}，文件绝对偏移 ${blk.dataOffset + 4 + d}）就对不上（原 ${hex(body[d])} → 重建 ${hex(ser[d])}）`,
    };

  return {
    ok: true, blk, desc, descVersion,
    head: blk.raw.subarray(0, 4),        
    tail: blk.raw.subarray(consumed),    
  };
}



const CAP_VALUES = { butt: 'strokeStyleButtCap', round: 'strokeStyleRoundCap', square: 'strokeStyleSquareCap' };
const JOIN_VALUES = { miter: 'strokeStyleMiterJoin', round: 'strokeStyleRoundJoin', bevel: 'strokeStyleBevelJoin' };
const ALIGN_VALUES = { inside: 'strokeStyleAlignInside', center: 'strokeStyleAlignCenter', outside: 'strokeStyleAlignOutside' };

const BLEND_VALUES = {
  normal: 'Nrml', dissolve: 'Dslv', darken: 'Drkn', multiply: 'Mltp', colorburn: 'CBrn',
  linearburn: 'linearBurn', darkercolor: 'darkerColor', lighten: 'Lghn', screen: 'Scrn',
  colordodge: 'CDdg', lineardodge: 'linearDodge', lightercolor: 'lighterColor', overlay: 'Ovrl',
  softlight: 'SftL', hardlight: 'HrdL', vividlight: 'vividLight', linearlight: 'linearLight',
  pinlight: 'pinLight', hardmix: 'hardMix', difference: 'Dfrn', exclusion: 'Xclu',
  subtract: 'blendSubtraction', divide: 'blendDivide', hue: 'H   ', saturation: 'Strt',
  color: 'Clr ', luminosity: 'Lmns',
};

const STROKE_FIELDS = {
  enabled:      { path: 'strokeEnabled',             kind: 'bool',  label: '描边开关' },
  fillEnabled:  { path: 'fillEnabled',               kind: 'bool',  label: '填充开关' },
  width:        { path: 'strokeStyleLineWidth',      kind: 'unit',  label: '描边宽度', min: 0 },
  dashOffset:   { path: 'strokeStyleLineDashOffset', kind: 'unit',  label: '虚线偏移' },
  miterLimit:   { path: 'strokeStyleMiterLimit',     kind: 'num',   label: '斜接限制' },
  cap:          { path: 'strokeStyleLineCapType',    kind: 'enum',  label: '端点', values: CAP_VALUES },
  join:         { path: 'strokeStyleLineJoinType',   kind: 'enum',  label: '连接', values: JOIN_VALUES },
  align:        { path: 'strokeStyleLineAlignment',  kind: 'enum',  label: '对齐', values: ALIGN_VALUES },
  dashes:       { path: 'strokeStyleLineDashSet',    kind: 'dash',  label: '虚线数组' },
  opacity:      { path: 'strokeStyleOpacity',        kind: 'unit',  label: '不透明度', min: 0, max: 100 },
  blendMode:    { path: 'strokeStyleBlendMode',      kind: 'enum',  label: '混合模式', values: BLEND_VALUES },
  resolution:   { path: 'strokeStyleResolution',     kind: 'num',   label: '分辨率' },
  scaleLock:    { path: 'strokeStyleScaleLock',      kind: 'bool',  label: '缩放锁定' },
  strokeAdjust: { path: 'strokeStyleStrokeAdjust',   kind: 'bool',  label: '描边对齐像素' },
  color:        { path: 'strokeStyleContent',        kind: 'color', label: '描边颜色' },
};


const STROKE_ALIAS = (() => {
  const m = new Map();
  const add = (k, v) => m.set(String(k).toLowerCase(), v);
  for (const name of Object.keys(STROKE_FIELDS)) {
    add(name, name);
    const p = STROKE_FIELDS[name].path;
    add(p, name);
    if (p.startsWith('strokeStyle')) add(p.slice('strokeStyle'.length), name);
  }
  const extra = {
    linewidth: 'width', strokewidth: 'width', size: 'width',
    strokeenabled: 'enabled', stroke: 'enabled',
    linecap: 'cap', captype: 'cap', linecaptype: 'cap',
    linejoin: 'join', jointype: 'join', linejointype: 'join',
    alignment: 'align', linealignment: 'align',
    dash: 'dashes', dasharray: 'dashes', linedash: 'dashes', linedashset: 'dashes',
    dashoffset: 'dashOffset', linedashoffset: 'dashOffset',
    blend: 'blendMode', blendmode: 'blendMode',
    strokecolor: 'color', colour: 'color',
    miter: 'miterLimit',
  };
  for (const k of Object.keys(extra)) add(k, extra[k]);
  return m;
})();

function strokeMenu() {
  return Object.keys(STROKE_FIELDS).map(n => `${n}(${STROKE_FIELDS[n].label})`).join(' ');
}


function readStrokeField(desc, spec) {
  const v = desc[spec.path];
  if (v === undefined) return undefined;
  switch (spec.kind) {
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'num': return typeof v === 'number' ? v : undefined;
    case 'unit': return (v && v.__unit) ? v.value : undefined;
    case 'enum': {
      if (!v || v.__enumType === undefined) return undefined;
      const friendly = Object.keys(spec.values).find(k => spec.values[k] === v.value);
      return friendly || v.value;
    }
    case 'dash': return Array.isArray(v) ? v.map(e => (e && e.__unit) ? e.value : e) : undefined;
    case 'color': {
      const c = v && v['Clr '];
      if (!c || c.__classID !== 'RGBC') return undefined;
      return [c['Rd  '], c['Grn '], c['Bl  ']];
    }
    default: return undefined;
  }
}


function readRawStrokeField(desc, spec) {
  const v = desc[spec.path];
  if (v === undefined) return undefined;
  switch (spec.kind) {
    case 'bool': case 'num': return v;
    case 'unit': case 'enum': return v && v.value;
    case 'dash': return Array.isArray(v) ? v.map(e => (e && e.__unit) ? e.value : e) : undefined;
    case 'color': {
      const c = v && v['Clr '];
      return (c && c.__classID === 'RGBC') ? [c['Rd  '], c['Grn '], c['Bl  ']] : undefined;
    }
    default: return undefined;
  }
}

function parseColorInput(v) {
  if (typeof v === 'string') {
    const s = v.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  if (Array.isArray(v) && v.length === 3) return v.slice();
  if (v && typeof v === 'object' && ['r', 'g', 'b'].every(k => typeof v[k] === 'number')) return [v.r, v.g, v.b];
  return null;
}


function flatten(node, prefix, out) {
  if (node === null || node === undefined) { out[prefix] = String(node); return out; }
  if (node instanceof Uint8Array) { out[prefix] = `u8:${node.length}:${checksum(node)}`; return out; }
  if (Array.isArray(node)) {
    out[prefix + '.length'] = node.length;
    node.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof node === 'object') {
    if (node.__unit !== undefined && Array.isArray(node.values)) { out[prefix] = `${node.__unit}:[${node.values.map(numStr).join(',')}]`; return out; }
    if (node.__unit !== undefined) { out[prefix] = `${node.__unit}:${numStr(node.value)}`; return out; }
    if (node.__enumType !== undefined) { out[prefix] = `enum ${node.__enumType}:${node.value}`; return out; }
    if (node.__class !== undefined) { out[prefix] = `type:${node.__class}`; return out; }
    if (node.__reference) { out[prefix] = 'ref:' + JSON.stringify(node.__reference); return out; }
    for (const k of Object.keys(node)) if (!isMeta(k)) flatten(node[k], prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out[prefix] = typeof node === 'number' ? numStr(node) : String(node);
  return out;
}

function snapshotDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) if (a[k] !== b[k]) out.push(`${k}: ${a[k] === undefined ? '无' : a[k]} → ${b[k] === undefined ? '无' : b[k]}`);
  return out.sort();
}














export function normalizeSubpathInput(subpathsIn, unitsIn, fail) {
  const units = unitsIn === undefined ? 'pixel' : unitsIn;
  if (!UNITS.includes(units))
    throw fail( `units 只能是 ${UNITS.join(' / ')}（默认 pixel＝绝对像素），收到 ${JSON.stringify(unitsIn)}`);
  if (!Array.isArray(subpathsIn))
    throw fail( `subpaths 必须是数组，收到 ${JSON.stringify(subpathsIn)}；` +
      `形如 [{closed:true, operation:'combine', knots:[{anchor:[x,y], in:[x,y], out:[x,y]}, …]}, …]`);

  const num = (v, where) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw fail( `${where} 必须是有限数字，收到 ${JSON.stringify(v)}`);
    return v;
  };
  const pt = (v, where) => {
    if (Array.isArray(v) && v.length === 2) return [num(v[0], `${where}.x`), num(v[1], `${where}.y`)];
    if (v && typeof v === 'object' && !Array.isArray(v) && 'x' in v && 'y' in v)
      return [num(v.x, `${where}.x`), num(v.y, `${where}.y`)];
    throw fail( `${where} 必须是 [x, y] 或 {x, y}，收到 ${JSON.stringify(v)}`);
  };

  const out = subpathsIn.map((sp, si) => {
    if (!sp || typeof sp !== 'object' || Array.isArray(sp))
      throw fail( `subpaths[${si}] 必须是对象 {closed, operation, knots}，收到 ${JSON.stringify(sp)}`);
    if (sp.closed !== undefined && typeof sp.closed !== 'boolean')
      throw fail( `subpaths[${si}].closed 必须是布尔值，收到 ${JSON.stringify(sp.closed)}`);
    let operation;
    if (sp.operation === undefined) operation = undefined;
    else if (sp.operation === null || sp.operation === -1 || sp.operation === 'none') operation = -1;
    else if (typeof sp.operation === 'string') {
      const k = PATH_OPERATIONS.indexOf(sp.operation.trim().toLowerCase());
      if (k < 0)
        throw fail(
          `subpaths[${si}].operation 不认识「${sp.operation}」；可用：${PATH_OPERATIONS.join(' ')}（或 null / -1 表示未指定）`,
          { available: PATH_OPERATIONS });
      operation = k;
    } else if (Number.isInteger(sp.operation) && sp.operation >= 0 && sp.operation <= 3) operation = sp.operation;
    else
      throw fail(
        `subpaths[${si}].operation 必须是 ${PATH_OPERATIONS.map((n, k) => `'${n}'(${k})`).join(' / ')} 之一，收到 ${JSON.stringify(sp.operation)}`,
        { available: PATH_OPERATIONS });

    if (!Array.isArray(sp.knots) || !sp.knots.length)
      throw fail( `subpaths[${si}].knots 必须是非空数组（每个锚点形如 {anchor:[x,y], in:[x,y], out:[x,y]}）`);
    if (sp.knots.length > 0xffff)
      throw fail( `subpaths[${si}] 有 ${sp.knots.length} 个锚点，超过记录里 knotCount 的 uint16 上限 65535`);

    const knots = sp.knots.map((kn, ki) => {
      const where = `subpaths[${si}].knots[${ki}]`;
      if (!kn || typeof kn !== 'object' || Array.isArray(kn))
        throw fail( `${where} 必须是对象 {anchor, in, out, linked}，收到 ${JSON.stringify(kn)}`);
      if (kn.anchor === undefined) throw fail( `${where} 缺少 anchor（锚点坐标）`);
      const anchor = pt(kn.anchor, `${where}.anchor`);
      
      
      const inn = kn.in === undefined ? anchor.slice() : pt(kn.in, `${where}.in`);
      const outp = kn.out === undefined ? anchor.slice() : pt(kn.out, `${where}.out`);
      if (kn.linked !== undefined && typeof kn.linked !== 'boolean')
        throw fail( `${where}.linked 必须是布尔值，收到 ${JSON.stringify(kn.linked)}`);
      return { anchor, in: inn, out: outp, linked: kn.linked };
    });
    return { closed: sp.closed, operation, knots };
  });
  return { units, subpaths: out };
}







export function freshPathRecords(norm, width, height, fail) {
  const { units, subpaths } = norm;
  if (!subpaths.length) throw fail('subpaths 不能是空数组：形状图层至少要有一条子路径');
  const records = [
    { selector: 6, type: 'fillRule', _raw: new Uint8Array(24) },
    { selector: 8, type: 'initialFill', fillStartsWithAllPixels: false, _rest: new Uint8Array(22) },
  ];
  subpaths.forEach((sp, si) => {
    const closed = sp.closed === undefined ? true : sp.closed;
    const open = !closed;
    const operation = sp.operation === undefined ? 1 : sp.operation;   
    records.push({
      selector: open ? 3 : 0, type: 'subpath', open,
      knotCount: sp.knots.length, operation,
      operationName: PATH_OPERATIONS[operation] || null,
      
      unknown1: 1, unknown2: 0, index: 0, unknown3: new Uint8Array(10),
    });
    sp.knots.forEach((kn, ki) => {
      const linked = kn.linked === undefined ? false : kn.linked;
      

      const q = (val, dim, where) => {
        if (units === 'fixed' && !Number.isInteger(val))
          throw fail(`subpaths[${si}].knots[${ki}].${where} = ${val}：units:'fixed' 要的是 int32 定点整数，不是小数`,
            { subpath: si, knot: ki });
        const n = units === 'fixed' ? val : (units === 'normalized' ? val : val / dim) * 0x1000000;
        if (!Number.isFinite(n) || n < -0x80000000 || n > 0x7fffffff)
          throw fail(`subpaths[${si}].knots[${ki}].${where} = ${val} 换算成 8.24 定点数是 ${n}，超出 int32 范围；` +
            `${units === 'pixel' ? `像素坐标要落在 0…${width} / 0…${height} 附近` : '坐标超界'}`,
            { subpath: si, knot: ki });
        return toFixedInt(val, dim, units);
      };
      const fixed = [
        q(kn.in[1], height, 'in.y'), q(kn.in[0], width, 'in.x'),
        q(kn.anchor[1], height, 'anchor.y'), q(kn.anchor[0], width, 'anchor.x'),
        q(kn.out[1], height, 'out.y'), q(kn.out[0], width, 'out.x'),
      ];
      records.push({
        selector: open ? (linked ? 4 : 5) : (linked ? 1 : 2),
        type: 'knot', linked, open, fixed,
        preceding: { y: fixedToFloat(fixed[0]), x: fixedToFloat(fixed[1]) },
        anchor: { y: fixedToFloat(fixed[2]), x: fixedToFloat(fixed[3]) },
        leaving: { y: fixedToFloat(fixed[4]), x: fixedToFloat(fixed[5]) },
      });
    });
  });
  return records;
}

export function createPathOps(h) {

  
  function blockRound(key, psb) {
    if (psb) return PAD;
    const set = (h.PAD4_BLOCK_KEYS instanceof Set) ? h.PAD4_BLOCK_KEYS : PAD4_FALLBACK;
    return set.has(key) ? 4 : 2;
  }
  
  function padBlock(n, key, psb) {
    const r = blockRound(key, psb);
    return n + ((r - (n % r)) % r);
  }
  
  function padData(data, key, psb) {
    const n = padBlock(data.length, key, psb);
    if (n === data.length) return data;
    const out = new Uint8Array(n);
    out.set(data);
    return out;
  }
  




  function stripPad(tail, key, psb) {
    const r = blockRound(key, psb);
    if (tail.length && tail.length < r && [...tail].every(b => b === 0)) return new Uint8Array(0);
    return tail;
  }
  const isPsb = ab => !!fullOf(ab).sections.psb;

  



  




  function resolveMaskKeys(ab, op, i, what) {
    const present = MASK_KEYS.filter(k => rawBlock(ab, op.index, k));
    if (op.block !== undefined) {
      if (!MASK_KEYS.includes(op.block))
        throw h.opFail(i, op, `block 只能是 ${MASK_KEYS.join(' / ')}，收到 ${JSON.stringify(op.block)}`, { index: op.index });
      if (!present.includes(op.block))
        throw h.opFail(i, op, `图层 ${op.index} 没有 ${op.block} 块；这一层实际有的附加块：${blockKeysOf(ab, op.index).join(' ') || '无'}`,
          { index: op.index, blocks: blockKeysOf(ab, op.index) });
      return [op.block];
    }
    if (!present.length) {
      const others = layersWithMask(ab);
      throw h.opFail(i, op,
        `图层 ${op.index} 没有矢量蒙版（找不到 ${MASK_KEYS.join(' / ')} 块），${what}无从改起；` +
        `这一层实际有的附加块：${blockKeysOf(ab, op.index).join(' ') || '无'}；` +
        (others.length ? `本文档里有矢量蒙版的图层是：${others.join(' ')}` : '本文档没有任何图层带矢量蒙版'),
        { index: op.index, blocks: blockKeysOf(ab, op.index), layersWithMask: others });
    }
    if (present.length === 1) return present;
    const a = rawBlock(ab, op.index, present[0]).raw, b = rawBlock(ab, op.index, present[1]).raw;
    if (sameBytes(a, b)) return present;
    throw h.opFail(i, op,
      `图层 ${op.index} 上 ${present.join(' 和 ')} 两个块的内容不一致（${a.length} / ${b.length} 字节，首个差异 @${firstDiff(a, b)}），` +
      `不敢替你猜改哪个；请在 op 里显式写 block:'${present[0]}' 或 block:'${present[1]}'`,
      { index: op.index, blocks: present });
  }

  function needMaskProbe(ab, op, i, key) {
    const p = probeMaskBlock(ab, op.index, key);
    if (!p.ok)
      throw h.opFail(i, op,
        `图层 ${op.index} 的矢量蒙版块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${p.reason}`,
        { index: op.index, block: key, reason: p.reason });
    return p;
  }

  
  function assertSameLength(before, after, from, to, op, i, what) {
    if (before.length !== after.length)
      throw h.opFail(i, op, `${what}是等长改写，但文件长度从 ${before.length} 变成了 ${after.length}，拒绝返回文件`,
        { index: op.index, before: before.length, after: after.length });
    let n = 0;
    for (let k = 0; k < before.length; k++) {
      if (before[k] === after[k]) continue;
      if (k < from || k >= to)
        throw h.opFail(i, op,
          `${what}之后块外偏移 ${k} 的字节也变了（${hex(before[k])} → ${hex(after[k])}），说明写回越界，拒绝返回文件`,
          { index: op.index, offset: k });
      n++;
    }
    return n;
  }

  








  function assertGrowth(ab, out, op, i, key, blk, data, fpBefore, what) {
    const psb = isPsb(ab);
    const padded = padBlock(data.length, key, psb);
    const oldSpan = blk.blockEnd - blk.sigOffset;
    const newSpan = 12 + padded;                 
    const blockDelta = newSpan - oldSpan;
    const fileDelta = out.byteLength - ab.byteLength;

    
    const nb = rawBlock(out, op.index, key);
    if (!nb || nb.dataLength !== padded)
      throw h.opFail(i, op,
        `${what}之后重新读到的 ${key} 块数据长度是 ${nb ? nb.dataLength : 0}，期望 ${padded}，拒绝返回文件`,
        { index: op.index, block: key });
    for (let k = 0; k < padded; k++) {
      const want = k < data.length ? data[k] : 0;
      if (nb.raw[k] !== want)
        throw h.opFail(i, op,
          `${what}之后 ${key} 块内偏移 ${k} 的字节是 ${hex(nb.raw[k])}，与我们构造的 ${hex(want)} 不符，拒绝返回文件`,
          { index: op.index, block: key, offset: k });
    }

    
    const sb = fullOf(ab).sections, sa = fullOf(out).sections;
    const liDelta = (sa.layerInfoEndAbs - sa.layerInfoStart) - (sb.layerInfoEndAbs - sb.layerInfoStart);
    if (fileDelta !== liDelta)
      throw h.opFail(i, op,
        `${what}之后文件长度增量 ${fileDelta} 与图层信息段长度增量 ${liDelta} 对不上，说明动到了别的段，拒绝返回文件`,
        { index: op.index, block: key, fileDelta, liDelta });
    if (Math.abs(fileDelta - blockDelta) > 3)
      throw h.opFail(i, op,
        `${what}之后文件长度增量是 ${fileDelta} 字节，而 ${key} 块本身只涨了 ${blockDelta} 字节` +
        `（${oldSpan} → ${newSpan}，块数据 ${blk.dataLength} → ${padded}，${blockRound(key, psb)} 字节对齐）；` +
        `段尾对齐填充最多解释 3 字节的出入，拒绝返回文件`,
        { index: op.index, block: key, fileDelta, blockDelta });

    
    const tb = new Uint8Array(ab, sb.layerInfoEndAbs), ta = new Uint8Array(out, sa.layerInfoEndAbs);
    if (!sameBytes(tb, ta))
      throw h.opFail(i, op,
        `${what}之后图层信息段以后的字节（合成图等）也变了（长度 ${tb.length} → ${ta.length}，首个差异 @${firstDiff(tb, ta)}），拒绝返回文件`,
        { index: op.index, block: key });
    const diffs = fingerprintDiff(fpBefore, blockFingerprints(out))
      .filter(s => !s.includes(`/${key}:`));
    if (diffs.length)
      throw h.opFail(i, op,
        `${what}之后除了 ${key} 还有别的附加块跟着变了：${diffs.slice(0, 5).join('；')}，拒绝返回文件`,
        { index: op.index, block: key, changed: diffs });
  }

  



  
  function normalizeSubpaths(op, i) {
    return normalizeSubpathInput(op.subpaths, op.units, (msg, info) => h.opFail(i, op, msg, info));
  }

  
  function buildRecords(probe, norm, width, height, op, i) {
    const { units, subpaths } = norm;
    const oldGroups = groupSubpaths(probe.body);
    const template = oldGroups[0] ? oldGroups[0].subpath : null;
    const recs = probe.head.slice();          
    const touched = [];

    subpaths.forEach((sp, si) => {
      const og = oldGroups[si] || null;
      const base = og ? og.subpath : template;
      const closed = sp.closed === undefined ? (base ? !base.open : true) : sp.closed;
      const open = !closed;
      let operation = sp.operation;
      if (operation === undefined) operation = base ? base.operation : 1;   
      recs.push({
        selector: open ? 3 : 0, type: 'subpath', open,
        knotCount: sp.knots.length,
        operation,
        operationName: PATH_OPERATIONS[operation] || null,
        unknown1: base ? base.unknown1 : 1,     
        unknown2: base ? base.unknown2 : 0,
        index: base ? base.index : 0,
        unknown3: base ? base.unknown3 : new Uint8Array(10),
      });
      sp.knots.forEach((kn, ki) => {
        const ok = og ? og.knots[ki] : null;
        const of = ok ? ok.fixed : null;
        const linked = kn.linked === undefined ? (ok ? ok.linked : false) : kn.linked;
        const fixed = [
          coordFixed(of ? of[0] : undefined, kn.in[1], height, units),
          coordFixed(of ? of[1] : undefined, kn.in[0], width, units),
          coordFixed(of ? of[2] : undefined, kn.anchor[1], height, units),
          coordFixed(of ? of[3] : undefined, kn.anchor[0], width, units),
          coordFixed(of ? of[4] : undefined, kn.out[1], height, units),
          coordFixed(of ? of[5] : undefined, kn.out[0], width, units),
        ];
        for (const f of fixed) {
          if (!Number.isInteger(f) || f < -0x80000000 || f > 0x7fffffff)
            throw h.opFail(i, op,
              `subpaths[${si}].knots[${ki}] 换算出的定点数 ${f} 超出 int32 范围；` +
              `${units === 'pixel' ? `像素坐标要落在 0…${width}/0…${height} 附近` : '坐标超界'}`,
              { index: op.index, subpath: si, knot: ki });
        }
        if (!of || fixed.some((v, k) => v !== of[k]) || (ok && ok.linked !== linked) || (ok && ok.open !== open))
          touched.push(`${si}/${ki}`);
        recs.push({
          selector: open ? (linked ? 4 : 5) : (linked ? 1 : 2),
          type: 'knot', linked, open, fixed,
          preceding: { y: fixedToFloat(fixed[0]), x: fixedToFloat(fixed[1]) },
          anchor: { y: fixedToFloat(fixed[2]), x: fixedToFloat(fixed[3]) },
          leaving: { y: fixedToFloat(fixed[4]), x: fixedToFloat(fixed[5]) },
        });
      });
    });
    return { records: recs, touched, oldSubpaths: oldGroups.length };
  }

  
  function writeMaskPath(ab, op, i, key, norm, warnings) {
    const probe = needMaskProbe(ab, op, i, key);
    const { width, height } = fullOf(ab).header;
    const built = buildRecords(probe, norm, width, height, op, i);

    const sameCount = built.records.length === probe.records.length;
    
    let tail = probe.tail;
    if (!sameCount) {
      if (![...probe.tail].every(b => b === 0))
        throw h.opFail(i, op,
          `${key} 块尾部的 ${probe.tail.length} 字节对齐填充不是全 0（${[...probe.tail].map(hex).join(' ')}），` +
          `改变子路径数量要重排这段填充，不敢乱动，拒绝改写`,
          { index: op.index, block: key });
      const bodyLen = VM_HEAD + built.records.length * RECORD_SIZE;
      tail = new Uint8Array(padBlock(bodyLen, key, isPsb(ab)) - bodyLen);
    }

    const newModel = { ...probe.model, path: { records: built.records, _tail: tail } };
    const data = writeVectorMask(newModel);
    const oldRaw = probe.blk.raw;
    const noop = sameBytes(data, oldRaw);

    const fpBefore = blockFingerprints(ab);
    const out = h.upsertLayerBlock(ab, op.index, key, data);
    const before = new Uint8Array(ab), after = new Uint8Array(out);

    if (data.length === oldRaw.length) {
      
      const n = assertSameLength(before, after, probe.blk.dataOffset, probe.blk.dataOffset + oldRaw.length,
        op, i, `改写 ${key} 的锚点`);
      if (noop && n !== 0)
        throw h.opFail(i, op, `新旧路径字节完全相同，文件却有 ${n} 处变化，拒绝返回文件`, { index: op.index, block: key });
    } else {
      
      assertGrowth(ab, out, op, i, key, probe.blk, data, fpBefore, `改写 ${key} 的子路径数量`);
    }

    
    const p2 = probeMaskBlock(out, op.index, key);
    if (!p2.ok)
      throw h.opFail(i, op, `写回 ${key} 之后重新探测不过（${p2.reason}），拒绝返回文件`, { index: op.index, block: key });
    const g2 = groupSubpaths(p2.body);
    if (g2.length !== norm.subpaths.length)
      throw h.opFail(i, op, `写回 ${key} 之后读回 ${g2.length} 条子路径，与期望的 ${norm.subpaths.length} 条不一致，拒绝返回文件`,
        { index: op.index, block: key });
    const wantGroups = groupSubpaths(built.records);
    for (let s = 0; s < g2.length; s++) {
      const wg = wantGroups[s], gg = g2[s];
      if (gg.knots.length !== wg.knots.length || gg.subpath.knotCount !== wg.subpath.knotCount)
        throw h.opFail(i, op,
          `写回 ${key} 之后子路径 ${s} 读回 ${gg.knots.length} 个锚点（记录里写着 ${gg.subpath.knotCount}），期望 ${wg.knots.length} 个，拒绝返回文件`,
          { index: op.index, block: key, subpath: s });
      if (gg.subpath.operation !== wg.subpath.operation || gg.subpath.open !== wg.subpath.open)
        throw h.opFail(i, op,
          `写回 ${key} 之后子路径 ${s} 的布尔运算/开合读回 ${gg.subpath.operation}/${gg.subpath.open ? '开' : '闭'}，` +
          `期望 ${wg.subpath.operation}/${wg.subpath.open ? '开' : '闭'}，拒绝返回文件`,
          { index: op.index, block: key, subpath: s });
      for (let k = 0; k < gg.knots.length; k++) {
        for (let m = 0; m < 6; m++) {
          if (gg.knots[k].fixed[m] !== wg.knots[k].fixed[m])
            throw h.opFail(i, op,
              `写回 ${key} 之后子路径 ${s} 的第 ${k} 个锚点第 ${m} 个坐标读回 ${gg.knots[k].fixed[m]}，期望 ${wg.knots[k].fixed[m]}，拒绝返回文件`,
              { index: op.index, block: key, subpath: s, knot: k });
        }
      }
    }
    
    const headBefore = writeMaskHead(probe.head), headAfter = writeMaskHead(p2.head);
    if (!sameBytes(headBefore, headAfter))
      throw h.opFail(i, op, `写回 ${key} 之后路径头部记录（填充规则等）也变了，拒绝返回文件`, { index: op.index, block: key });

    if (built.oldSubpaths !== norm.subpaths.length)
      warnings.push(`图层 ${op.index} 的 ${key}：子路径 ${built.oldSubpaths} → ${norm.subpaths.length} 条，整块重写（块长 ${oldRaw.length} → ${padBlock(data.length, key, isPsb(ab))} 字节）`);

    return { buffer: out, changed: !noop, touched: built.touched, key };
  }

  





  function syncOriginAfterPath(before, after, op, i, warnings) {
    if (op.keepOrigin) return after;
    const blk = rawBlock(after, op.index, 'vogk');
    if (!blk || blk.dataLength < 8) return after;
    let desc, consumed;
    try { const r = new Reader(blk.raw); r.seek(8); desc = readDescriptor(r); consumed = r.o; }
    catch (e) { warnings.push(`图层 ${op.index} 的 vogk（实时形状属性）读不懂，原样保留：${e && e.message}`); return after; }
    const list = desc && Array.isArray(desc.keyDescriptorList) ? desc.keyDescriptorList : null;
    if (!list) return after;
    
    let dx = null, dy = null, pure = true;
    try {
      const a = getVectorMaskPath(before, op.index, { units: 'pixel' }), b = getVectorMaskPath(after, op.index, { units: 'pixel' });
      if (!a || !b || a.subpaths.length !== b.subpaths.length) pure = false;
      else a.subpaths.forEach((sa, si) => {
        const sb = b.subpaths[si];
        if (!pure || sa.knots.length !== sb.knots.length) { pure = false; return; }
        sa.knots.forEach((ka, ki) => { for (const f of ['anchor', 'in', 'out']) {
          const ex = sb.knots[ki][f][0] - ka[f][0], ey = sb.knots[ki][f][1] - ka[f][1];
          if (dx === null) { dx = ex; dy = ey; }
          else if (Math.abs(ex - dx) > 1e-3 || Math.abs(ey - dy) > 1e-3) pure = false;
        } });
      });
    } catch { pure = false; }
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      if (pure && dx !== null) {
        const bb = it.keyOriginShapeBBox;
        const sh = (o, k, d) => { if (o && o[k] && typeof o[k] === 'object' && Number.isFinite(o[k].value)) o[k].value += d; else if (o && Number.isFinite(o[k])) o[k] += d; };
        if (bb) { sh(bb, 'Left', dx); sh(bb, 'Rght', dx); sh(bb, 'Top ', dy); sh(bb, 'Btom', dy); }
        const bc = it.keyOriginBoxCorners;
        if (bc) for (const c of ['rectangleCornerA', 'rectangleCornerB', 'rectangleCornerC', 'rectangleCornerD']) { sh(bc[c], 'Hrzn', dx); sh(bc[c], 'Vrtc', dy); }
      } else it.keyShapeInvalidated = true;
    }
    let ser;
    try { ser = serializeDescriptor(desc); } catch (e) { warnings.push(`图层 ${op.index} 的 vogk 改完写不回去，原样保留：${e && e.message}`); return after; }
    const psb = isPsb(after);
    const head = blk.raw.subarray(0, 8), tail = stripPad(blk.raw.subarray(consumed), 'vogk', psb);
    const data = padData(h.concat([head, ser, tail]), 'vogk', psb);
    warnings.push(pure ? `图层 ${op.index}：路径整体平移，vogk 的实时形状外框跟着平移` : `图层 ${op.index}：路径被改过形，vogk 标记 keyShapeInvalidated（PS 里它变成普通路径）`);
    return h.upsertLayerBlock(after, op.index, 'vogk', data);
  }

  function writeMaskHead(head) {
    
    return writeVectorMask({ version: 3, flags: 0, path: { records: head, _tail: new Uint8Array(0) } });
  }

  function validatePath(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    const norm = normalizeSubpaths(op, i);
    const knots = norm.subpaths.reduce((n, s) => n + s.knots.length, 0);
    return {
      affected: [op.index], changed: ['vectorMask.path'], opIndex: i, norm,
      note: `图层 ${op.index}「${layer.name}」矢量蒙版路径 → ${norm.subpaths.length} 条子路径 / ${knots} 个锚点（${norm.units} 坐标）`,
    };
  }

  function applyPath(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const norm = plan.norm || normalizeSubpaths(op, i);
    const keys = resolveMaskKeys(ab, op, i, '路径');
    if (!norm.subpaths.length)
      warnings.push(`图层 ${op.index}：subpaths 是空数组，写回后这个矢量蒙版将没有任何子路径`);

    let cur = ab, changed = false, touched = [];
    for (const key of keys) {
      const r = writeMaskPath(cur, op, i, key, norm, warnings);
      cur = r.buffer; changed = changed || r.changed; touched = r.touched;
    }
    if (changed) cur = syncOriginAfterPath(ab, cur, op, i, warnings);
    return {
      buffer: cur,
      result: {
        changed, blocks: keys, touchedKnots: touched,
        note: changed
          ? `${plan.note}（${keys.join('+')}：改动了 ${touched.length} 个锚点）`
          : `${plan.note} —— 与原路径完全一致，文件字节未变`,
      },
    };
  }

  



  
  function normalizeStroke(op, i) {
    const values = op.values;
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw h.opFail(i, op, `values 必须是对象，收到 ${JSON.stringify(values)}；可用字段：${strokeMenu()}`,
        { available: Object.keys(STROKE_FIELDS) });
    const keys = Object.keys(values);
    if (!keys.length)
      throw h.opFail(i, op, `values 是空对象，没有任何要改的字段；可用字段：${strokeMenu()}`,
        { available: Object.keys(STROKE_FIELDS) });

    const writes = [];
    for (const raw of keys) {
      const name = STROKE_ALIAS.get(String(raw).toLowerCase());
      if (!name)
        throw h.opFail(i, op,
          `不认识的描边字段「${raw}」；可用字段（友好名→描述符字段）：` +
          Object.keys(STROKE_FIELDS).map(n => `${n}→${STROKE_FIELDS[n].path}`).join(' '),
          { field: raw, available: Object.keys(STROKE_FIELDS) });
      const spec = STROKE_FIELDS[name];
      const v = values[raw];
      switch (spec.kind) {
        case 'bool':
          if (typeof v !== 'boolean') throw h.opFail(i, op, `${name}（${spec.label}）必须是布尔值，收到 ${JSON.stringify(v)}`);
          writes.push({ name, spec, value: v });
          break;
        case 'num':
        case 'unit': {
          if (typeof v !== 'number' || !Number.isFinite(v))
            throw h.opFail(i, op, `${name}（${spec.label}）必须是有限数字，收到 ${JSON.stringify(v)}`);
          if (spec.min !== undefined && v < spec.min)
            throw h.opFail(i, op, `${name}（${spec.label}）不能小于 ${spec.min}，收到 ${v}`);
          if (spec.max !== undefined && v > spec.max)
            throw h.opFail(i, op, `${name}（${spec.label}）不能大于 ${spec.max}，收到 ${v}`);
          writes.push({ name, spec, value: v });
          break;
        }
        case 'enum': {
          if (typeof v !== 'string' || !v.trim())
            throw h.opFail(i, op, `${name}（${spec.label}）必须是字符串；可用：${Object.keys(spec.values).join(' ')}`,
              { available: Object.keys(spec.values) });
          const t = v.trim();
          const mapped = spec.values[t.toLowerCase()] || (Object.values(spec.values).includes(t) ? t : null);
          if (!mapped)
            throw h.opFail(i, op,
              `${name}（${spec.label}）不认识「${v}」；可用（友好名 / PS 原值）：` +
              Object.keys(spec.values).map(k => `${k}=${spec.values[k]}`).join(' '),
              { available: Object.keys(spec.values) });
          writes.push({ name, spec, value: mapped });
          break;
        }
        case 'dash': {
          if (!Array.isArray(v))
            throw h.opFail(i, op, `${name}（${spec.label}）必须是数字数组，例如 [3, 2] 表示「3 实 2 虚」；空数组 [] 表示实线，收到 ${JSON.stringify(v)}`);
          const nums = v.map((e, k) => {
            const n = (e && typeof e === 'object' && typeof e.value === 'number') ? e.value : e;
            if (typeof n !== 'number' || !Number.isFinite(n) || n < 0)
              throw h.opFail(i, op, `${name}[${k}] 必须是 ≥0 的有限数字，收到 ${JSON.stringify(e)}`);
            return n;
          });
          writes.push({ name, spec, value: nums });
          break;
        }
        case 'color': {
          const rgb = parseColorInput(v);
          if (!rgb)
            throw h.opFail(i, op, `${name}（${spec.label}）必须是 '#rrggbb' / [r,g,b] / {r,g,b}，收到 ${JSON.stringify(v)}`);
          for (const c of rgb) {
            if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 255)
              throw h.opFail(i, op, `${name}（${spec.label}）的分量必须在 0…255 之间，收到 ${JSON.stringify(rgb)}`);
          }
          writes.push({ name, spec, value: rgb });
          break;
        }
        default:
          throw h.opFail(i, op, `内部错误：字段 ${name} 的 kind=${spec.kind} 没有实现`);
      }
    }
    return writes;
  }

  



  function applyStrokeField(desc, w, op, i) {
    const { spec, name, value } = w;
    const cur = desc[spec.path];
    const have = () => Object.keys(desc).filter(k => !isMeta(k)).join(' ') || '无';
    if (cur === undefined)
      throw h.opFail(i, op,
        `图层 ${op.index} 的 ${STROKE_KEY} 描述符里没有 ${spec.path}（${spec.label}）字段；` +
        `这份描述符实际有的字段：${have()}`,
        { index: op.index, field: spec.path, available: Object.keys(desc).filter(k => !isMeta(k)) });

    switch (spec.kind) {
      case 'bool':
        if (typeof cur !== 'boolean')
          throw h.opFail(i, op, `${spec.path} 不是布尔值（读到 ${JSON.stringify(cur)}），不敢改写`, { index: op.index, field: spec.path });
        desc[spec.path] = value;
        return [spec.path];
      case 'num':
        if (typeof cur !== 'number')
          throw h.opFail(i, op, `${spec.path} 不是数字（读到 ${JSON.stringify(cur)}），不敢改写`, { index: op.index, field: spec.path });
        desc[spec.path] = value;
        return [spec.path];
      case 'unit':
        if (!cur || cur.__unit === undefined || typeof cur.value !== 'number')
          throw h.opFail(i, op, `${spec.path} 不是带单位的数值（UntF，读到 ${JSON.stringify(cur)}），不敢改写`, { index: op.index, field: spec.path });
        cur.value = value;                                    
        return [spec.path];
      case 'enum':
        if (!cur || cur.__enumType === undefined)
          throw h.opFail(i, op, `${spec.path} 不是枚举（读到 ${JSON.stringify(cur)}），不敢改写`, { index: op.index, field: spec.path });
        cur.value = value;
        return [spec.path];
      case 'dash': {
        if (!Array.isArray(cur))
          throw h.opFail(i, op, `${spec.path} 不是数组（读到 ${JSON.stringify(cur)}），不敢改写`, { index: op.index, field: spec.path });
        
        const unitAt = k => (cur[k] && cur[k].__unit) || (cur[0] && cur[0].__unit) || '#Pxl';
        desc[spec.path] = value.map((n, k) => ({ __unit: unitAt(k), value: n }));
        return [spec.path];
      }
      case 'color': {
        const c = cur && cur['Clr '];
        if (!cur || cur.__classID === undefined)
          throw h.opFail(i, op, `${spec.path} 不是描述符（读到 ${JSON.stringify(cur)}），不敢改写`, { index: op.index, field: spec.path });
        if (!c || c.__classID !== 'RGBC')
          throw h.opFail(i, op,
            `图层 ${op.index} 的描边内容是「${cur.__classID}」（不是 solidColorLayer 的 RGBC 纯色），本 op 只会改纯色描边的 RGB；` +
            `这份 ${spec.path} 里实际有的字段：${Object.keys(cur).filter(k => !isMeta(k)).join(' ') || '无'}`,
            { index: op.index, field: spec.path, contentClass: cur.__classID });
        for (const k of ['Rd  ', 'Grn ', 'Bl  ']) {
          if (typeof c[k] !== 'number')
            throw h.opFail(i, op, `${spec.path}.Clr 里的 ${JSON.stringify(k)} 不是数字（读到 ${JSON.stringify(c[k])}），不敢改写`,
              { index: op.index, field: spec.path });
        }
        c['Rd  '] = value[0]; c['Grn '] = value[1]; c['Bl  '] = value[2];
        return [`${spec.path}.Clr `];
      }
      default:
        throw h.opFail(i, op, `内部错误：字段 ${name} 的 kind=${spec.kind} 没有实现`);
    }
  }

  function validateStroke(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    const writes = normalizeStroke(op, i);
    return {
      affected: [op.index], changed: writes.map(w => `vectorStroke.${w.name}`), opIndex: i, writes,
      note: `图层 ${op.index}「${layer.name}」矢量描边 → ${writes.map(w => `${w.name}=${JSON.stringify(w.value)}`).join(' ')}`,
    };
  }

  function applyStroke(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const writes = plan.writes || normalizeStroke(op, i);

    
    const probe = probeStrokeBlock(ab, op.index);
    if (!probe.ok) {
      if (!rawBlock(ab, op.index, STROKE_KEY)) {
        const others = layersWithStroke(ab);
        throw h.opFail(i, op,
          `图层 ${op.index} 没有矢量描边参数块（${STROKE_KEY}），改不了描边样式；` +
          `这一层实际有的附加块：${blockKeysOf(ab, op.index).join(' ') || '无'}；` +
          (others.length ? `本文档里有 ${STROKE_KEY} 的图层是：${others.join(' ')}` : `本文档没有任何图层带 ${STROKE_KEY}`),
          { index: op.index, blocks: blockKeysOf(ab, op.index), layersWithStroke: others });
      }
      throw h.opFail(i, op,
        `图层 ${op.index} 的 ${STROKE_KEY} 用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${probe.reason}`,
        { index: op.index, block: STROKE_KEY, reason: probe.reason });
    }

    const { blk, desc, head, tail } = probe;
    const snapBefore = flatten(desc, '', {});
    const touched = new Set();
    for (const w of writes) for (const k of applyStrokeField(desc, w, op, i)) touched.add(k);

    
    let ser;
    try { ser = serializeDescriptor(desc); } catch (e) {
      throw h.opFail(i, op, `改完描边字段之后描述符无法重新序列化（${e && e.message}），拒绝写回`, { index: op.index, block: STROKE_KEY });
    }
    const psb = isPsb(ab);
    const data = padData(h.concat([head, ser, stripPad(tail, STROKE_KEY, psb)]), STROKE_KEY, psb);
    const oldRaw = blk.raw;
    const noop = sameBytes(data, oldRaw);

    const fpBefore = blockFingerprints(ab);
    const out = h.upsertLayerBlock(ab, op.index, STROKE_KEY, data);

    if (data.length === oldRaw.length) {
      const n = assertSameLength(new Uint8Array(ab), new Uint8Array(out), blk.dataOffset, blk.dataOffset + oldRaw.length,
        op, i, `改写 ${STROKE_KEY}`);
      if (noop && n !== 0)
        throw h.opFail(i, op, `新旧描边字节完全相同，文件却有 ${n} 处变化，拒绝返回文件`, { index: op.index, block: STROKE_KEY });
    } else {
      assertGrowth(ab, out, op, i, STROKE_KEY, blk, data, fpBefore, `改写 ${STROKE_KEY}`);
    }

    
    const p2 = probeStrokeBlock(out, op.index);
    if (!p2.ok)
      throw h.opFail(i, op, `写回 ${STROKE_KEY} 之后重新探测不过（${p2.reason}），拒绝返回文件`, { index: op.index, block: STROKE_KEY });
    const snapAfter = flatten(p2.desc, '', {});
    const diffs = snapshotDiff(snapBefore, snapAfter);
    const stray = diffs.filter(d => ![...touched].some(t => d.startsWith(t)));
    if (stray.length)
      throw h.opFail(i, op,
        `写回 ${STROKE_KEY} 之后有没点名的字段跟着变了：${stray.slice(0, 6).join('；')}（本次只应改 ${[...touched].join(' ')}），拒绝返回文件`,
        { index: op.index, block: STROKE_KEY, changed: stray });
    for (const w of writes) {
      const got = readRawStrokeField(p2.desc, w.spec);
      const want = w.value;
      const same = Array.isArray(want) ? (Array.isArray(got) && got.length === want.length && got.every((v, k) => v === want[k]))
        : got === want;
      if (!same)
        throw h.opFail(i, op,
          `写回 ${STROKE_KEY} 之后重新解析 ${w.name}（${w.spec.label}）读到 ${JSON.stringify(got)}，不是 ${JSON.stringify(want)}，拒绝返回文件`,
          { index: op.index, block: STROKE_KEY, field: w.name });
    }
    if (data.length !== oldRaw.length)
      warnings.push(`图层 ${op.index} 的 ${STROKE_KEY}：块长 ${oldRaw.length} → ${padBlock(data.length, STROKE_KEY, isPsb(ab))} 字节（虚线数组长度变了，走变长写回）`);

    return {
      buffer: out,
      result: {
        changed: !noop, block: STROKE_KEY, fields: writes.map(w => w.name),
        note: noop ? `${plan.note} —— 与原值完全一致，文件字节未变` : `${plan.note}（${diffs.length} 处描述符字段变化）`,
      },
    };
  }

  



  const FLAG_BITS = { invert: 1, notLink: 2, disable: 4 };

  function validateFlags(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    const changed = [];
    for (const k of Object.keys(FLAG_BITS)) {
      if (op[k] === undefined) continue;
      if (typeof op[k] !== 'boolean') throw h.opFail(i, op, `${k} 必须是布尔值，收到 ${JSON.stringify(op[k])}`);
      changed.push(`vectorMask.${k}`);
    }
    if (op.fillStartsWithAllPixels !== undefined) {
      if (typeof op.fillStartsWithAllPixels !== 'boolean')
        throw h.opFail(i, op, `fillStartsWithAllPixels 必须是布尔值，收到 ${JSON.stringify(op.fillStartsWithAllPixels)}`);
      changed.push('vectorMask.fillStartsWithAllPixels');
    }
    if (!changed.length)
      throw h.opFail(i, op, `没有给出任何要改的字段（可用：invert 反相 / notLink 不链接 / disable 停用 / fillStartsWithAllPixels 初始填充）`);
    return {
      affected: [op.index], changed, opIndex: i,
      note: `图层 ${op.index}「${layer.name}」矢量蒙版标志 → ${changed.map(c => c.split('.')[1] + '=' + op[c.split('.')[1]]).join(' ')}`,
    };
  }

  function applyFlags(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const keys = resolveMaskKeys(ab, op, i, '标志位');

    let cur = ab, changed = false;
    for (const key of keys) {
      const probe = needMaskProbe(cur, op, i, key);
      const { blk, model } = probe;

      
      let flags = model.flags >>> 0;
      for (const k of Object.keys(FLAG_BITS)) {
        if (op[k] === undefined) continue;
        flags = op[k] ? (flags | FLAG_BITS[k]) : (flags & ~FLAG_BITS[k]);
      }
      flags = flags >>> 0;
      const writes = [];
      if ((flags & 0xff) !== (model.flags & 0xff))
        writes.push({ offset: blk.dataOffset + 7, value: flags & 0xff });
      if (flags >>> 8 !== model.flags >>> 8)
        throw h.opFail(i, op, `内部错误：只该改 flags 的低 3 位，却动到了高位（${model.flags} → ${flags}）`, { index: op.index, block: key });

      
      if (op.fillStartsWithAllPixels !== undefined) {
        const at = probe.records.findIndex(r => r.type === 'initialFill');
        if (at < 0)
          throw h.opFail(i, op,
            `图层 ${op.index} 的 ${key} 里没有「初始填充规则」记录（selector=8），改不了 fillStartsWithAllPixels；` +
            `这个块里的记录种类：${[...new Set(probe.records.map(r => `${r.type}(${r.selector})`))].join(' ') || '无'}`,
            { index: op.index, block: key });
        const want = op.fillStartsWithAllPixels ? 1 : 0;
        const has = probe.records[at].fillStartsWithAllPixels ? 1 : 0;
        if (want !== has) {
          const o = blk.dataOffset + VM_HEAD + at * RECORD_SIZE + 2;   
          writes.push({ offset: o, value: 0 }, { offset: o + 1, value: want });
        }
      }

      if (!writes.length) continue;
      const next = h.patchBytes(cur, writes);

      
      const before = new Uint8Array(cur), after = new Uint8Array(next);
      assertSameLength(before, after, blk.dataOffset, blk.dataOffset + blk.dataLength, op, i, `改写 ${key} 的标志位`);
      const want = new Set(writes.map(w => w.offset));
      for (let k = 0; k < before.length; k++) {
        if (before[k] !== after[k] && !want.has(k))
          throw h.opFail(i, op, `改写 ${key} 标志位时偏移 ${k} 的字节意外变化（${hex(before[k])} → ${hex(after[k])}），拒绝返回文件`,
            { index: op.index, block: key, offset: k });
      }

      
      const p2 = probeMaskBlock(next, op.index, key);
      if (!p2.ok)
        throw h.opFail(i, op, `写回 ${key} 标志位之后重新探测不过（${p2.reason}），拒绝返回文件`, { index: op.index, block: key });
      if ((p2.model.flags >>> 0) !== flags)
        throw h.opFail(i, op, `写回 ${key} 之后 flags 读回 ${p2.model.flags}，期望 ${flags}，拒绝返回文件`, { index: op.index, block: key });
      if (op.fillStartsWithAllPixels !== undefined) {
        const r2 = p2.records.find(r => r.type === 'initialFill');
        if (!r2 || !!r2.fillStartsWithAllPixels !== op.fillStartsWithAllPixels)
          throw h.opFail(i, op, `写回 ${key} 之后 fillStartsWithAllPixels 读回 ${r2 && r2.fillStartsWithAllPixels}，期望 ${op.fillStartsWithAllPixels}，拒绝返回文件`,
            { index: op.index, block: key });
      }
      
      const oldPath = writeVectorMask({ version: 3, flags: 0, path: probe.model.path });
      const newPath = writeVectorMask({ version: 3, flags: 0, path: p2.model.path });
      const pd = firstDiff(oldPath.subarray(VM_HEAD), newPath.subarray(VM_HEAD));
      const allowInit = op.fillStartsWithAllPixels !== undefined;
      if (pd >= 0 && !allowInit)
        throw h.opFail(i, op, `改标志位不该动到路径记录，但路径区第 ${pd} 字节变了，拒绝返回文件`, { index: op.index, block: key });

      cur = next; changed = true;
    }

    return {
      buffer: cur,
      result: {
        changed, blocks: keys,
        note: changed ? plan.note : `${plan.note} —— 本来就是这些值，文件字节未变`,
      },
    };
  }

  

  return {
    setVectorMaskPath: { validate: validatePath, apply: applyPath, structural: true },
    setVectorStroke: { validate: validateStroke, apply: applyStroke, structural: true },
    setVectorMaskFlags: { validate: validateFlags, apply: applyFlags },
  };
}




export const STROKE_FIELD_SPEC = STROKE_FIELDS;

export const PATH_UNITS = UNITS;
export function resolveStrokeField(name) {
  return STROKE_ALIAS.get(String(name || '').toLowerCase()) || null;
}

export default { createPathOps, getVectorMaskPath, getVectorStroke, probeVectorPath, STROKE_FIELD_SPEC, PATH_UNITS };
