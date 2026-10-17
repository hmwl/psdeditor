


































import { Reader } from './psd-parse.js';

const EMPTY = new Uint8Array(0);

function toU8(b) {
  if (b == null) return EMPTY;
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return Uint8Array.from(b);
}


class W {
  constructor() { this.b = []; }
  get length() { return this.b.length; }
  u8(v) { this.b.push(v & 0xff); return this; }
  u16(v) { this.b.push((v >>> 8) & 0xff, v & 0xff); return this; }
  u32(v) { this.b.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); return this; }
  i32(v) { return this.u32(v | 0); }          
  f64(v) {
    const t = new Uint8Array(8);
    new DataView(t.buffer).setFloat64(0, v, false);
    for (let i = 0; i < 8; i++) this.b.push(t[i]);
    return this;
  }
  raw(u) { const a = toU8(u); for (let i = 0; i < a.length; i++) this.b.push(a[i]); return this; }
  bytes() { return Uint8Array.from(this.b); }
}


function openSection(bytes, withLength) {
  const u8 = toU8(bytes);
  if (!withLength) return { u8, size: u8.length, start: 0, end: u8.length };
  if (u8.length < 4) return { u8, size: 0, start: u8.length, end: u8.length, truncated: true };
  const size = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(0);
  const end = Math.min(4 + size, u8.length);
  return { u8, size: Math.max(0, end - 4), start: 4, end };
}


function closeSection(body, withLength) {
  if (!withLength) return body;
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, false);
  out.set(body, 4);
  return out;
}




export const MASK_FLAG = {
  POSITION_RELATIVE: 0x01,   
  DISABLED: 0x02,            
  INVERT: 0x04,              
  FROM_OTHER_DATA: 0x08,     
  HAS_PARAMETERS: 0x10,      
};


export const MASK_PARAM_FLAG = {
  USER_DENSITY: 0x01,        
  USER_FEATHER: 0x02,        
  VECTOR_DENSITY: 0x04,      
  VECTOR_FEATHER: 0x08,      
};


export function parseMaskFlags(flags) {
  return {
    raw: flags & 0xff,
    positionRelativeToLayer: !!(flags & MASK_FLAG.POSITION_RELATIVE),
    disabled: !!(flags & MASK_FLAG.DISABLED),
    invert: !!(flags & MASK_FLAG.INVERT),                 
    fromOtherData: !!(flags & MASK_FLAG.FROM_OTHER_DATA),
    hasParameters: !!(flags & MASK_FLAG.HAS_PARAMETERS),
    unknownBits: flags & 0xe0,                             
  };
}

export function encodeMaskFlags(f) {
  if (!f) return 0;
  if (typeof f === 'number') return f & 0xff;
  return ((f.positionRelativeToLayer ? MASK_FLAG.POSITION_RELATIVE : 0)
    | (f.disabled ? MASK_FLAG.DISABLED : 0)
    | (f.invert ? MASK_FLAG.INVERT : 0)
    | (f.fromOtherData ? MASK_FLAG.FROM_OTHER_DATA : 0)
    | (f.hasParameters ? MASK_FLAG.HAS_PARAMETERS : 0)
    | (f.unknownBits || 0)) & 0xff;
}

const MASK_HEAD = 18;   
const MASK_REAL = 18;   


function tryParams(dv, off, end) {
  if (off >= end) return null;
  const pf = dv.getUint8(off);
  if (pf & 0xf0) return null;                       
  let need = 1;
  if (pf & MASK_PARAM_FLAG.USER_DENSITY) need += 1;
  if (pf & MASK_PARAM_FLAG.USER_FEATHER) need += 8;
  if (pf & MASK_PARAM_FLAG.VECTOR_DENSITY) need += 1;
  if (pf & MASK_PARAM_FLAG.VECTOR_FEATHER) need += 8;
  if (off + need > end) return null;
  let p = off + 1;
  const out = { _flags: pf };
  
  if (pf & MASK_PARAM_FLAG.USER_DENSITY) { out.userMaskDensity = dv.getUint8(p); p += 1; }
  if (pf & MASK_PARAM_FLAG.USER_FEATHER) { out.userMaskFeather = dv.getFloat64(p); p += 8; }
  if (pf & MASK_PARAM_FLAG.VECTOR_DENSITY) { out.vectorMaskDensity = dv.getUint8(p); p += 1; }
  if (pf & MASK_PARAM_FLAG.VECTOR_FEATHER) { out.vectorMaskFeather = dv.getFloat64(p); p += 8; }
  if ((out.userMaskFeather !== undefined && !Number.isFinite(out.userMaskFeather))
    || (out.vectorMaskFeather !== undefined && !Number.isFinite(out.vectorMaskFeather))) return null;
  return { params: out, length: need };
}


function tryReal(dv, off, end) {
  if (off + MASK_REAL > end) return null;
  const flags = dv.getUint8(off);
  const bg = dv.getUint8(off + 1);
  if (bg !== 0 && bg !== 255) return null;          
  const top = dv.getInt32(off + 2), left = dv.getInt32(off + 6);
  const bottom = dv.getInt32(off + 10), right = dv.getInt32(off + 14);
  const w = right - left, h = bottom - top;
  if (w < 0 || h < 0 || w > 300000 || h > 300000) return null;
  return { real: { flags, flagsParsed: parseMaskFlags(flags), defaultColor: bg, top, left, bottom, right },
    length: MASK_REAL };
}














export function parseLayerMask(bytes, opts = {}) {
  const withLength = opts.withLength !== false;
  const sec = openSection(bytes, withLength);
  const m = {
    _withLength: withLength, _size: sec.size, _off: opts.offset ?? null,
    present: sec.size > 0, tail: EMPTY,
  };
  if (!sec.size) return m;

  const body = sec.u8.subarray(sec.start, sec.end);
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (sec.size < MASK_HEAD) {           
    m._raw = body.slice();
    return m;
  }
  const r = new Reader(body);
  m.top = r.i32(); m.left = r.i32(); m.bottom = r.i32(); m.right = r.i32();
  m.defaultColor = r.u8();
  m.flags = r.u8();
  m.flagsParsed = parseMaskFlags(m.flags);
  m.parameters = null;
  m.real = null;
  m.realFirst = true;                   

  const end = sec.size;
  let o = MASK_HEAD;
  const hasParams = m.flagsParsed.hasParameters;

  if (!hasParams) {
    
    const rr = tryReal(dv, o, end);
    if (rr) { m.real = rr.real; o += rr.length; }
  } else {
    
    const planA = planRealFirst(dv, o, end);
    const planB = planParamsFirst(dv, o, end);
    const pick = planA && (!planB || planA.leftover <= planB.leftover) ? planA : (planB || planA);
    if (pick) {
      m.real = pick.real || null;
      m.parameters = pick.params || null;
      m.realFirst = pick.realFirst;
      o = pick.end;
    }
  }
  m.tail = o < end ? body.slice(o, end) : EMPTY;   
  return m;
}


function planRealFirst(dv, o, end) {
  const rr = tryReal(dv, o, end);
  const p = tryParams(dv, rr ? o + rr.length : o, end);
  if (!p) return null;
  const e = (rr ? o + rr.length : o) + p.length;
  return { real: rr ? rr.real : null, params: p.params, realFirst: true, end: e, leftover: end - e };
}


function planParamsFirst(dv, o, end) {
  const p = tryParams(dv, o, end);
  if (!p) return null;
  let e = o + p.length;
  const rr = tryReal(dv, e, end);
  if (rr) e += rr.length;
  return { real: rr ? rr.real : null, params: p.params, realFirst: false, end: e, leftover: end - e };
}


export function writeLayerMask(model) {
  const withLength = !model || model._withLength !== false;
  if (!model || !model.present) return closeSection(EMPTY, withLength);
  if (model._raw) return closeSection(toU8(model._raw), withLength);

  const w = new W();
  w.i32(model.top | 0).i32(model.left | 0).i32(model.bottom | 0).i32(model.right | 0);
  w.u8(model.defaultColor ?? 0);
  const flags = model.flags != null ? (model.flags & 0xff)
    : encodeMaskFlags({ ...(model.flagsParsed || {}), hasParameters: !!model.parameters });
  w.u8(flags);

  const writeReal = () => {
    const r = model.real;
    if (!r) return;
    w.u8(r.flags != null ? (r.flags & 0xff) : encodeMaskFlags(r.flagsParsed));
    w.u8(r.defaultColor ?? 0);
    w.i32(r.top | 0).i32(r.left | 0).i32(r.bottom | 0).i32(r.right | 0);
  };
  const writeParams = () => {
    const p = model.parameters;
    if (!p) return;
    const pf = p._flags != null ? (p._flags & 0xff)
      : ((p.userMaskDensity != null ? MASK_PARAM_FLAG.USER_DENSITY : 0)
        | (p.userMaskFeather != null ? MASK_PARAM_FLAG.USER_FEATHER : 0)
        | (p.vectorMaskDensity != null ? MASK_PARAM_FLAG.VECTOR_DENSITY : 0)
        | (p.vectorMaskFeather != null ? MASK_PARAM_FLAG.VECTOR_FEATHER : 0));
    w.u8(pf);
    
    if (pf & MASK_PARAM_FLAG.USER_DENSITY) w.u8(p.userMaskDensity ?? 0);
    if (pf & MASK_PARAM_FLAG.USER_FEATHER) w.f64(p.userMaskFeather ?? 0);
    if (pf & MASK_PARAM_FLAG.VECTOR_DENSITY) w.u8(p.vectorMaskDensity ?? 0);
    if (pf & MASK_PARAM_FLAG.VECTOR_FEATHER) w.f64(p.vectorMaskFeather ?? 0);
  };
  if (model.realFirst === false) { writeParams(); writeReal(); }
  else { writeReal(); writeParams(); }

  if (model.tail && model.tail.length) w.raw(model.tail);
  return closeSection(w.bytes(), withLength);
}




function readRange4(dv, o) {
  const v = [dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)];
  return { blackLo: v[0], blackHi: v[1], whiteLo: v[2], whiteHi: v[3], bytes: v };
}
function writeRange4(w, r) {
  const v = r && r.bytes ? r.bytes
    : [r?.blackLo || 0, r?.blackHi || 0, r?.whiteLo || 0, r?.whiteHi || 0];
  w.u8(v[0]).u8(v[1]).u8(v[2]).u8(v[3]);
}







export function parseBlendingRanges(bytes, opts = {}) {
  const withLength = opts.withLength !== false;
  const sec = openSection(bytes, withLength);
  const m = { _withLength: withLength, _size: sec.size, _off: opts.offset ?? null,
    present: sec.size > 0, compositeGray: null, channels: [], tail: EMPTY };
  if (!sec.size) return m;
  const body = sec.u8.subarray(sec.start, sec.end);
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (sec.size < 8) { m._raw = body.slice(); return m; }
  m.compositeGray = { source: readRange4(dv, 0), dest: readRange4(dv, 4) };
  let o = 8;
  while (o + 8 <= sec.size) {
    m.channels.push({ source: readRange4(dv, o), dest: readRange4(dv, o + 4) });
    o += 8;
  }
  m.tail = o < sec.size ? body.slice(o, sec.size) : EMPTY;   
  return m;
}


export function writeBlendingRanges(model) {
  const withLength = !model || model._withLength !== false;
  if (!model || !model.present) return closeSection(EMPTY, withLength);
  if (model._raw) return closeSection(toU8(model._raw), withLength);
  const w = new W();
  writeRange4(w, model.compositeGray?.source);
  writeRange4(w, model.compositeGray?.dest);
  for (const c of model.channels || []) { writeRange4(w, c.source); writeRange4(w, c.dest); }
  if (model.tail && model.tail.length) w.raw(model.tail);
  return closeSection(w.bytes(), withLength);
}




export const GLOBAL_MASK_KIND = { COLOR_SELECTED: 0, COLOR_PROTECTED: 1, PER_LAYER: 128 };
export const GLOBAL_MASK_KIND_NAME = { 0: '选中的颜色（反相）', 1: '受保护的颜色', 128: '按图层各自设置' };






export function parseGlobalLayerMask(bytes, opts = {}) {
  const withLength = opts.withLength !== false;
  const sec = openSection(bytes, withLength);
  const m = { _withLength: withLength, _size: sec.size, _off: opts.offset ?? null,
    present: sec.size > 0, tail: EMPTY };
  if (!sec.size) return m;
  const body = sec.u8.subarray(sec.start, sec.end);
  if (sec.size < 13) { m._raw = body.slice(); return m; }   
  const r = new Reader(body);
  m.overlayColorSpace = r.u16();
  m.color = [r.u16(), r.u16(), r.u16(), r.u16()];
  m.opacity = r.u16();                    
  m.kind = r.u8();
  m.kindName = GLOBAL_MASK_KIND_NAME[m.kind] || `未知(${m.kind})`;
  m.tail = sec.size > 13 ? body.slice(13, sec.size) : EMPTY;   
  return m;
}


export function writeGlobalLayerMask(model) {
  const withLength = !model || model._withLength !== false;
  if (!model || !model.present) return closeSection(EMPTY, withLength);
  if (model._raw) return closeSection(toU8(model._raw), withLength);
  const w = new W();
  w.u16(model.overlayColorSpace || 0);
  const c = model.color || [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) w.u16(c[i] || 0);
  w.u16(model.opacity || 0);
  w.u8(model.kind == null ? GLOBAL_MASK_KIND.PER_LAYER : model.kind);
  if (model.tail && model.tail.length) w.raw(model.tail);
  return closeSection(w.bytes(), withLength);
}




export const CHANNEL_ID = { TRANSPARENCY: -1, USER_MASK: -2, REAL_USER_MASK: -3 };


export const COLOR_MODE_CHANNEL_NAMES = {
  0: ['Bitmap'],                 
  1: ['Gray'],                   
  2: ['Index'],                  
  3: ['R', 'G', 'B'],            
  4: ['C', 'M', 'Y', 'K'],       
  7: [],                         
  8: ['Gray'],                   
  9: ['L', 'a', 'b'],            
};

export const COLOR_MODE_NAME = {
  0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB',
  4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab',
};


const SPECIAL_CHANNEL = {
  '-1': { kind: 'transparency', name: 'Transparency', label: '透明蒙版' },
  '-2': { kind: 'userMask', name: 'UserMask', label: '用户蒙版' },
  '-3': { kind: 'realUserMask', name: 'RealUserMask', label: 'real 用户蒙版' },
};








export function channelInfo(id, mode = 3) {
  const base = { id, colorMode: mode, colorModeName: COLOR_MODE_NAME[mode] || `mode${mode}`, index: -1 };
  const sp = SPECIAL_CHANNEL[String(id)];
  if (sp) return { ...base, ...sp };
  if (id < 0) return { ...base, kind: 'unknown', name: `Channel${id}`, label: `未知通道(${id})` };
  const names = COLOR_MODE_CHANNEL_NAMES[mode] || [];
  if (id < names.length) return { ...base, kind: 'color', name: names[id], label: names[id], index: id };
  
  const n = id - names.length + 1;
  return { ...base, kind: 'alpha', name: `Alpha${n}`, label: `备用通道 ${n}`, index: id };
}



export const LAYER_FLAG = {
  TRANSPARENCY_PROTECTED: 0x01,  
  HIDDEN: 0x02,                  
  OBSOLETE: 0x04,                
  BIT4_MEANINGFUL: 0x08,         
  PIXELS_IRRELEVANT: 0x10,       
  EFFECTS_OPEN: 0x20,            
};





export function parseLayerFlags(flags) {
  const f = flags & 0xff;
  return {
    raw: f,
    transparencyProtected: !!(f & LAYER_FLAG.TRANSPARENCY_PROTECTED),
    hidden: !!(f & LAYER_FLAG.HIDDEN),
    visible: !(f & LAYER_FLAG.HIDDEN),
    obsolete: !!(f & LAYER_FLAG.OBSOLETE),
    bit4Meaningful: !!(f & LAYER_FLAG.BIT4_MEANINGFUL),
    pixelDataIrrelevant: !!(f & LAYER_FLAG.PIXELS_IRRELEVANT),
    effectsOpen: !!(f & LAYER_FLAG.EFFECTS_OPEN),
    unknownBits: f & 0xc0,
  };
}


export function encodeLayerFlags(f) {
  if (typeof f === 'number') return f & 0xff;
  if (!f) return 0;
  return ((f.transparencyProtected ? LAYER_FLAG.TRANSPARENCY_PROTECTED : 0)
    | ((f.hidden ?? (f.visible === false)) ? LAYER_FLAG.HIDDEN : 0)
    | (f.obsolete ? LAYER_FLAG.OBSOLETE : 0)
    | (f.bit4Meaningful ? LAYER_FLAG.BIT4_MEANINGFUL : 0)
    | (f.pixelDataIrrelevant ? LAYER_FLAG.PIXELS_IRRELEVANT : 0)
    | (f.effectsOpen ? LAYER_FLAG.EFFECTS_OPEN : 0)
    | (f.unknownBits || 0)) & 0xff;
}



const isSigAt = (u8, o) => {
  if (o + 4 > u8.length) return false;
  const s = String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  return s === '8BIM' || s === '8B64';
};














export function parseLayerExtras(buffer, layerRecord) {
  const u8 = toU8(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const extraLenOffset = layerRecord && layerRecord.extraLenOffset;
  if (!Number.isFinite(extraLenOffset)) throw new Error('layerRecord 缺少 extraLenOffset');
  const extraLen = dv.getUint32(extraLenOffset);
  const extraStart = extraLenOffset + 4;
  const extraEnd = extraStart + extraLen;

  
  const maskOffset = extraStart;
  const maskLen = dv.getUint32(maskOffset);
  const maskEnd = maskOffset + 4 + maskLen;
  const mask = parseLayerMask(u8.subarray(maskOffset, Math.min(maskEnd, extraEnd)), { offset: maskOffset });
  mask._off = { start: maskOffset, dataStart: maskOffset + 4, end: maskEnd, length: maskLen };

  
  const brOffset = maskEnd;
  const brLen = dv.getUint32(brOffset);
  const brEnd = brOffset + 4 + brLen;
  const blendingRanges = parseBlendingRanges(u8.subarray(brOffset, Math.min(brEnd, extraEnd)), { offset: brOffset });
  blendingRanges._off = { start: brOffset, dataStart: brOffset + 4, end: brEnd, length: brLen };

  
  const nameOffset = brEnd;
  const nameLen = u8[nameOffset];
  let s = '';
  for (let i = 0; i < nameLen; i++) s += String.fromCharCode(u8[nameOffset + 1 + i]);
  const rawTotal = 1 + nameLen;
  const padded = rawTotal + ((4 - (rawTotal % 4)) % 4);
  let additionalStart = nameOffset + padded;
  
  let nameSkew = 0;
  if (additionalStart + 12 <= extraEnd && !isSigAt(u8, additionalStart)) {
    let p = additionalStart;
    while (p + 4 <= extraEnd && !isSigAt(u8, p)) p++;
    if (p + 12 <= extraEnd) { nameSkew = p - additionalStart; additionalStart = p; }
  }

  return {
    extraLenOffset, extraLen, extraStart, extraEnd,
    mask, blendingRanges,
    name: { value: s, offset: nameOffset, length: nameLen, padded },
    additionalStart, additionalEnd: extraEnd, nameSkew,
  };
}

export default {
  parseLayerMask, writeLayerMask,
  parseBlendingRanges, writeBlendingRanges,
  parseGlobalLayerMask, writeGlobalLayerMask,
  channelInfo, parseLayerFlags, encodeLayerFlags,
  parseMaskFlags, encodeMaskFlags, parseLayerExtras,
};
