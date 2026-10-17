


















import { parseLayerMask } from './psd-layer.js';
import { vconcat, padChunks, flatten } from './byte-chunks.js';

import { serializeDescriptor } from './psd-descriptor.js';
import { parseEngineData, serializeEngineData } from './engine-data.js';
import { getTextInfo, remapRunSpans } from './psd-text.js';
import { parseTxt2Frames } from './text-path.js';
import { frameInfoOf } from './psd-frame.js';



export class Reader {
  constructor(buffer, psb = false) {
    this.dv = new DataView(buffer.buffer !== undefined ? buffer.buffer : buffer,
      buffer.byteOffset || 0, buffer.byteLength);
    this.o = 0;
    this.psb = psb; 
  }
  get remaining() { return this.dv.byteLength - this.o; }
  seek(o) { this.o = o; }
  skip(n) { this.o += n; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o); this.o += 4; return v; }
  i32() { const v = this.dv.getInt32(this.o); this.o += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.o); if (this._log) this._log.push({ o: this.dv.byteOffset + this.o, v }); this.o += 8; return v; }
  
  u64() { const hi = this.u32(), lo = this.u32(); return hi * 0x100000000 + lo; }
  
  len32or64() { return this.psb ? this.u64() : this.u32(); }
  ascii(n) {
    if (!(n >= 0) || n > this.remaining) throw new RangeError(`字符串长度 ${n} 越界（剩 ${this.remaining} 字节 @${this.dv.byteOffset + this.o}）`);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  key4() { return this.ascii(4); }
  bytes(n) {
    const start = this.dv.byteOffset + this.o;
    const out = new Uint8Array(this.dv.buffer, start, n);
    this.o += n;
    return out;
  }
  
  pascal(pad = 1) {
    const len = this.u8();
    const s = this.ascii(len);
    const total = 1 + len;
    if (pad > 1 && total % pad !== 0) this.skip(pad - (total % pad));
    return s;
  }
  
  unicode() {
    const n = this.u32();
    
    if (n * 2 > this.remaining) throw new RangeError(`Unicode 字符串长度 ${n} 越界（剩 ${this.remaining} 字节 @${this.dv.byteOffset + this.o - 4}）`);
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = this.u16();
      if (c !== 0) s += String.fromCharCode(c);
    }
    return s;
  }
}









const PAD4_BLOCK_KEYS = new Set(['Txt2', 'luni', 'vmsk', 'artb', 'artd', 'frgb', 'vogk', 'SoLd', 'lnk2', 'lnk3', 'lnkD', 'lnkE',
  'vscg', 'vsms', 'GdFl', 'lmfx', 'lrFX', 'cinf', 'PlLd', 'Anno', 'CAI ', 'OCIO', 'GenI', 'FEid', 'curv', 'CgEd', 'vibA', 'blwh', 'grdm']);



function readKeyOrClassId(r, host, slot) {
  const len = r.u32();
  const s = len === 0 ? r.key4() : r.ascii(len);
  if (len !== 0 && s.length === 4 && host) (host.__explicit || (host.__explicit = {}))[slot || s] = true;
  return s;
}

export function readDescriptor(r) {
  const name = r.unicode();
  const obj = {};
  const classID = readKeyOrClassId(r, obj, '__classID');
  const count = r.u32();
  obj.__name = name; obj.__classID = classID;
  for (let i = 0; i < count; i++) {
    const key = readKeyOrClassId(r, obj);
    obj[key] = readItem(r);
    
    if (r.lastType === 'long') (obj.__long || (obj.__long = {}))[key] = true;
    else if (r.lastType === 'doub') (obj.__doub || (obj.__doub = {}))[key] = true;
    else if (r.lastType === 'comp') (obj.__comp || (obj.__comp = {}))[key] = true;
  }
  return obj;
}

function readItem(r) {
  const type = r.key4();
  r.lastType = type;
  switch (type) {
    case 'Objc':
    case 'GlbO': { const d = readDescriptor(r); r.lastType = type; return d; }
    case 'VlLs': {
      const n = r.u32();
      const arr = [];
      for (let i = 0; i < n; i++) {
        arr.push(readItem(r));
        if (r.lastType === 'long') (arr.__long || (arr.__long = {}))[i] = true;
        else if (r.lastType === 'doub') (arr.__doub || (arr.__doub = {}))[i] = true;
        else if (r.lastType === 'comp') (arr.__comp || (arr.__comp = {}))[i] = true;
      }
      r.lastType = 'VlLs';
      return arr;
    }
    case 'doub':
      return r.f64();
    case 'UntF': {
      const unit = r.key4();
      const value = r.f64();
      return { __unit: unit, value };
    }
    case 'UnFl': { 
      const unit = r.key4();
      const n = r.u32();
      const values = new Array(n);
      for (let i = 0; i < n; i++) values[i] = r.f64();
      return { __unit: unit, values };
    }
    case 'ObAr': { 
      const itemsCount = r.u32();
      const name = r.unicode();
      const obj = { __objectArray: true, __itemsCount: itemsCount, __name: name };
      const classID = readKeyOrClassId(r, obj, '__classID');
      const count = r.u32();
      obj.__classID = classID;
      for (let i = 0; i < count; i++) {
        const key = readKeyOrClassId(r, obj);
        obj[key] = readItem(r);
        if (r.lastType === 'long') (obj.__long || (obj.__long = {}))[key] = true;
        else if (r.lastType === 'doub') (obj.__doub || (obj.__doub = {}))[key] = true;
        else if (r.lastType === 'comp') (obj.__comp || (obj.__comp = {}))[key] = true;
      }
      r.lastType = 'ObAr';
      return obj;
    }
    case 'TEXT':
      return r.unicode();
    case 'enum': {
      const o = {};
      const enumType = readKeyOrClassId(r, o, '__enumType');
      const value = readKeyOrClassId(r, o, '__value');
      o.__enumType = enumType; o.value = value;
      return o;
    }
    case 'long':
      return r.i32();
    case 'comp':
      
      
      return r.u64();
    case 'bool':
      return r.u8() !== 0;
    case 'type':
    case 'GlbC': {
      const nm = r.unicode();
      const cid = readKeyOrClassId(r);
      return { __class: cid, __name: nm };
    }
    case 'obj ': { 
      const n = r.u32();
      const refs = [];
      for (let i = 0; i < n; i++) refs.push(readReferenceItem(r));
      return { __reference: refs };
    }
    case 'alis':
    case 'tdta': {
      const n = r.u32();
      return r.bytes(n);
    }
    default:
      throw new Error('未知描述符类型: "' + type + '" @' + (r.o - 4));
  }
}

function readReferenceItem(r) {
  const type = r.key4();
  switch (type) {
    
    
    case 'prop': { const cls = readDescClass(r); return { type, cls, key: readKeyOrClassId(r) }; }
    case 'Clss': { return { type, cls: readDescClass(r) }; }
    case 'Enmr': { const cls = readDescClass(r); return { type, cls, enumType: readKeyOrClassId(r), value: readKeyOrClassId(r) }; }
    case 'rele': { const cls = readDescClass(r); return { type, cls, offset: r.u32() }; }
    case 'Idnt': return { type, id: r.u32() };
    case 'indx': return { type, index: r.u32() };
    case 'name': { const cls = readDescClass(r); return { type, cls, name: r.unicode() }; }
    default: throw new Error('未知 reference 类型: "' + type + '"');
  }
}
function readDescClass(r) { const name = r.unicode(); const cid = readKeyOrClassId(r); return { name, cid }; }



function parsePsd(buffer, opts = {}) {
  const r0 = new Reader(buffer);
  const sig = r0.key4();
  if (sig !== '8BPS') throw new Error('不是 PSD/PSB 文件（缺少 8BPS 签名）');
  const version = r0.u16();      
  const psb = version === 2;
  const r = new Reader(buffer, psb);
  if (opts.logFloats) r._log = [];
  r.seek(0);
  r.key4();                       
  r.u16();                        
  r.skip(6);                      
  const channels = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();

  
  const cmLen = r.u32(); r.skip(cmLen);
  
  const irLen = r.u32(); r.skip(irLen);

  
  const lmiLenOffset = r.dv.byteOffset + r.o;
  const lmiLenFieldSize = psb ? 8 : 4;
  const lmiLen = r.len32or64();
  const lmiEnd = r.o + lmiLen;
  const lmiEndAbs = lmiLenOffset + lmiLenFieldSize + lmiLen;   
  let layerInfoLenOffset = 0, layerInfoStart = 0, layerInfoEndAbs = 0;
  let globalMaskStart = 0, globalMaskEnd = 0, globalAddlStart = 0, globalAddlEnd = 0;
  let layerCountRaw = 0;

  const layers = [];
  let linkedFiles = [];
  if (lmiLen > 0) {
    layerInfoLenOffset = r.dv.byteOffset + r.o;
    const layerInfoLen = r.len32or64();
    layerInfoStart = r.dv.byteOffset + r.o;             
    const layerInfoEnd = r.o + layerInfoLen;
    layerInfoEndAbs = r.dv.byteOffset + layerInfoEnd;   
    if (layerInfoLen > 0) {
      layerCountRaw = r.i16();
      let layerCount = layerCountRaw;
      if (layerCount < 0) layerCount = -layerCount; 
      for (let i = 0; i < layerCount; i++) {
        layers.push(readLayerRecord(r, psb));
      }
      
      
      const chDataStart = r.dv.byteOffset + r.o;
      let chOff = chDataStart;
      for (const l of layers) {
        const chLen = (l.channelLengths || []).reduce((a, b) => a + b, 0);
        l.chDataStart = chOff;
        l.chDataEnd = chOff + chLen;
        chOff += chLen;
      }
    }
    r.seek(Math.min(layerInfoEnd, lmiEnd));

    
    globalMaskStart = r.dv.byteOffset + r.o;
    globalMaskEnd = globalMaskStart;
    if (r.o + 4 <= lmiEnd) {
      const glmLen = r.u32();
      r.skip(glmLen);
      globalMaskEnd = r.dv.byteOffset + r.o;
    }
    
    globalAddlStart = r.dv.byteOffset + r.o;
    while (r.o + 12 <= lmiEnd) {
      const sig = r.key4();
      if (sig !== '8BIM' && sig !== '8B64') break;
      const key = r.key4();
      const bigLenKeys = ['lnk2', 'lnkD', 'lnk3', 'lnkE', 'Lr16', 'Lr32', 'Layr', 'Mtrn', 'Mt16', 'Mt32', 'Alph', 'FMsk', 'LMsk', 'FEid', 'FXid', 'PxSD', 'cinf'];
      const isBig = psb && bigLenKeys.includes(key);
      if (isBig && r.o + 8 > lmiEnd) break;  
      const len = isBig ? r.u64() : r.u32();
      const dataEnd = r.o + len;
      
      const block = {
        key, isBig,
        lenOffset: r.dv.byteOffset + r.o - (isBig ? 8 : 4),     
        dataOffset: r.dv.byteOffset + r.o,                      
        dataLength: len,
        end: r.dv.byteOffset + dataEnd + ((4 - (len % 4)) % 4)  
      };
      try {
        if (key === 'lnk2' || key === 'lnkD' || key === 'lnk3' || key === 'lnkE') {
          linkedFiles = linkedFiles.concat(readLinkedFiles(r, Math.min(dataEnd, lmiEnd), block));
        }
      } catch (e) {  }
      
      r.seek(dataEnd + ((4 - (len % 4)) % 4));
    }
    globalAddlEnd = r.dv.byteOffset + r.o;
    r.seek(Math.min(lmiEnd, r.dv.byteLength));
  }

  return { header: { width, height, channels, depth, mode, psb }, layers, linkedFiles, floatLog: r._log,
           sections: { lmiLenOffset, lmiLenFieldSize, lmiEndAbs,
                       layerInfoLenOffset, layerInfoStart, layerInfoEndAbs,
                       globalMaskStart, globalMaskEnd, globalAddlStart, globalAddlEnd,
                       layerCountRaw, psb } };
}





function readLinkedFiles(r, end, block = null) {
  const files = [];
  const abs = () => r.dv.byteOffset + r.o;   
  while (r.o + 8 <= end) {
    const recStart = abs();
    const size = r.u64();
    if (size <= 0) break;
    let recEnd = r.o + size;
    if (size % 4 !== 0) recEnd += 4 - (size % 4);     
    if (recEnd > end) recEnd = end;
    try {
      const type = r.key4();            
      const version = r.u32();
      const id = r.pascal();
      const nameOffset = abs();
      const name = r.unicode();
      const nameEnd = abs();
      const fileTypeOffset = abs();
      const fileType = r.key4();
      const fileCreator = r.key4();
      const dataSizeOffset = abs();
      const dataSize = r.u64();
      const hasDescOffset = abs();
      const hasDesc = r.u8();
      if (hasDesc) { r.u32(); readDescriptor(r); } 
      const bytesOffset = abs();
      let bytes = null;
      if (type === 'liFD') {
        const n = Math.max(0, Math.min(dataSize, recEnd - r.o));
        bytes = r.bytes(n);
      }
      
      files.push({ type, version, id, name, fileType, fileCreator, dataSize, bytes,
        _off: { block, recStart, recEnd: r.dv.byteOffset + recEnd, nameOffset, nameEnd,
                fileTypeOffset, dataSizeOffset, hasDescOffset, bytesOffset,
                bytesLength: bytes ? bytes.length : 0 } });
    } catch (e) {  }
    r.seek(recEnd);
  }
  return files;
}

function readLayerRecord(r, psb) {
  const recordStart = r.dv.byteOffset + r.o;   
  const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
  const nChannels = r.u16();
  const channelLengths = [], channelIds = [];
  for (let c = 0; c < nChannels; c++) {
    channelIds.push(r.i16());   
    channelLengths.push(r.len32or64());   
  }
  const blendSig = r.key4(); 
  const offBlendKey = r.dv.byteOffset + r.o;   
  const blendKey = r.key4();
  const offOpacity = r.dv.byteOffset + r.o;    
  const opacity = r.u8();
  const offClipping = r.dv.byteOffset + r.o;   
  const clipping = r.u8();
  const offFlags = r.dv.byteOffset + r.o;      
  const flags = r.u8();
  r.u8();                    
  const extraLenOffset = r.dv.byteOffset + r.o;
  const extraLen = r.u32();
  const extraEnd = r.o + extraLen;

  
  
  
  const maskLen = r.u32();
  const maskStart = r.o;
  const maskOffsetAbs = r.dv.byteOffset + maskStart;
  let mask = null;
  if (maskLen >= 16) {
    








    const seg = new Uint8Array(r.dv.buffer, maskOffsetAbs, maskLen);
    let m = null;
    try { m = parseLayerMask(seg, { withLength: false }); } catch { m = null; }
    if (m && m.present && m.top !== undefined) {
      const p = m.parameters || null;
      const rl = m.real || null;
      mask = {
        top: m.top, left: m.left, bottom: m.bottom, right: m.right,
        width: Math.max(0, m.right - m.left), height: Math.max(0, m.bottom - m.top),
        defaultColor: m.defaultColor, flags: m.flags,
        relative: !!(m.flags & 1), disabled: !!(m.flags & 2), invert: !!(m.flags & 4),
        fromOtherData: !!(m.flags & 8),
        
        density: p && p.userMaskDensity != null ? p.userMaskDensity : null,
        feather: p && p.userMaskFeather != null ? p.userMaskFeather : null,
        vectorDensity: p && p.vectorMaskDensity != null ? p.vectorMaskDensity : null,
        vectorFeather: p && p.vectorMaskFeather != null ? p.vectorMaskFeather : null,
        hasParameters: !!p,
        real: rl ? {
          flags: rl.flags, background: rl.defaultColor,
          top: rl.top, left: rl.left, bottom: rl.bottom, right: rl.right,
          width: Math.max(0, rl.right - rl.left), height: Math.max(0, rl.bottom - rl.top),
          relative: !!(rl.flags & 1), disabled: !!(rl.flags & 2), invert: !!(rl.flags & 4),
        } : null,
        realFirst: m.realFirst !== false,
        _off: maskOffsetAbs, _len: maskLen,
      };
    }
  }
  r.seek(maskStart + maskLen);
  

  const vectorMaskParams = mask && (mask.vectorDensity != null || mask.vectorFeather != null)
    ? { density: mask.vectorDensity, feather: mask.vectorFeather } : null;
  if (mask && !(mask.width > 0 && mask.height > 0) && !channelIds.includes(-2) && !channelIds.includes(-3)) mask = null;
  
  const brLen = r.u32(); r.skip(brLen);
  
  const name = r.pascal(4);

  const additional = {};
  
  while (r.o + 12 <= extraEnd) {
    const sigOffset = r.dv.byteOffset + r.o;      
    const sig = r.key4();
    if (sig !== '8BIM' && sig !== '8B64') break;
    const key = r.key4();
    (additional._keys || (additional._keys = [])).push(key);
    
    const bigLenKeys = ['LMsk','Lr16','Lr32','Layr','Mt16','Mt32','Mtrn','Alph','FMsk','lnk2','FEid','FXid','PxSD','cinf'];
    const isBig = psb && bigLenKeys.includes(key);
    if (isBig && r.o + 8 > extraEnd) break;  
    const lenOffset = r.dv.byteOffset + r.o;     
    const len = isBig ? r.u64() : r.u32();
    const dataOffset = r.dv.byteOffset + r.o;    
    const dataEnd = r.o + len;
    try {
      if (key === 'luni') {
        additional.unicodeName = r.unicode();
      } else if (key === 'SoLd' || key === 'PlLd') {
        
        
        
        const blockStart = r.o;
        additional.placedBlocks = additional.placedBlocks || [];
        additional.placedBlocks.push({
          key,
          lenOffset: r.dv.byteOffset + blockStart - 4,   
          dataOffset: r.dv.byteOffset + blockStart,      
          dataLength: len,
          pad: len % 2
        });
      } else if (key === 'lsct' || key === 'lsdk') {
        
        
        if (r.o + 4 <= dataEnd) additional.groupType = r.u32();
        if (r.o + 8 <= dataEnd) { const sig2 = r.key4(); const bk = r.key4(); if (sig2 === '8BIM') additional.groupBlendKey = bk; }
      } else if (key === 'frgb') {
        if (len >= 4 && r.u32() === 16) additional.frame = frameInfoOf(readDescriptor(r));
      } else if (key === 'lspf') {
        
        if (r.o + 4 <= dataEnd) {
          const f = r.u32();
          additional.locks = { transparency: !!(f & 1), composite: !!(f & 2), position: !!(f & 4),
                               nesting: !!(f & 8), all: !!(f & 0x80000000), flags: f };
        }
      } else if (key === 'lclr') {
        
        if (r.o + 2 <= dataEnd) additional.colorLabel = r.u16();
      } else if (key === 'iOpa') {
        
        if (r.o + 1 <= dataEnd) additional.fillOpacity = r.u8();
      } else if (key === 'knko') {
        if (r.o + 1 <= dataEnd) additional.knockout = r.u8();
      } else if (key === 'TySh') {
        
        
        
        try {
          additional.textVersion = r.u16();
          const tf = []; for (let k = 0; k < 6; k++) tf.push(r.f64());
          additional.textTransform = tf;
          additional.textToolVersion = r.u16();
          additional.textDescVersion = r.u32();
          additional.text = readDescriptor(r);
          additional.textWarpVersion = r.u16();
          additional.textWarpDescVersion = r.u32();
          additional.textWarp = readDescriptor(r);
          
          additional.textTail = new Uint8Array(r.dv.buffer, r.dv.byteOffset + r.o, Math.max(0, dataEnd - r.o)).slice();
        } catch (e) { additional._error = (additional._error || '') + `[TySh: ${e.message}]`; }
      } else if (key === 'lrFX') {
        



        if (additional.effectsPriority == null) additional.legacyEffects = true;
      } else if (key === 'lfx2' || key === 'lfxs' || key === 'lmfx') {
        
        
        
        try {
          const version = r.u32(), descVersion = r.u32(), desc = readDescriptor(r);
          const priority = { lfxs: 1, lfx2: 2, lmfx: 3 };
          if (additional.effectsPriority == null || priority[key] > additional.effectsPriority) {
            additional.effectsVersion = version;
            additional.effectsDescVersion = descVersion;
            additional.effects = desc;
            additional.effectsKey = key;
            additional.effectsPriority = priority[key];
          }
        } catch (e) { additional._error = (additional._error || '') + `[${key}: ${e.message}]`; }
      } else if (key === 'vmsk' || key === 'vsms') {
        
        additional.vectorMask = true;
      }
    } catch (e) {
      additional._error = (additional._error || '') + `[${key}: ${e.message}]`;
    }
    
    
    const pad = psb ? (4 - (len % 4)) % 4 : (PAD4_BLOCK_KEYS.has(key) ? (4 - (len % 4)) % 4 : len % 2);
    const blockEnd = r.dv.byteOffset + dataEnd + pad;   
    (additional._blocks || (additional._blocks = [])).push(
      { key, sig, isBig, sigOffset, lenOffset, dataOffset, dataLength: len, blockEnd });
    r.seek(dataEnd + pad);
  }

  r.seek(extraEnd);
  const recordEnd = r.dv.byteOffset + r.o;   
  return {
    name, unicodeName: additional.unicodeName, bounds: { top, left, bottom, right },
    blendKey, opacity, clipping, flags,
    offBlendKey, offOpacity, offFlags,        
    groupType: additional.groupType ?? null,  
    frame: additional.frame || null, isFrame: !!additional.frame,
    additionalKeys: additional._keys || [],   
    text: additional.text || null,             
    textVersion: additional.textVersion ?? null,        
    textToolVersion: additional.textToolVersion ?? null, 
    textDescVersion: additional.textDescVersion ?? null, 
    textTransform: additional.textTransform || null,     
    textWarp: additional.textWarp || null,               
    textWarpVersion: additional.textWarpVersion ?? 1,
    textWarpDescVersion: additional.textWarpDescVersion ?? 16,
    textTail: additional.textTail || null,               
    effects: additional.effects || null,       
    vectorMask: !!additional.vectorMask,       
    vectorMaskParams,                          
    mask,                                      
    groupBlendKey: additional.groupBlendKey || null,  
    locks: additional.locks || null,           
    colorLabel: additional.colorLabel ?? 0,    
    fillOpacity: additional.fillOpacity ?? null,      
    knockout: additional.knockout ?? null,     
    placedBlock: additional.placedBlocks?.length ? additional.placedBlocks[additional.placedBlocks.length - 1] : null,
    placedBlocks: additional.placedBlocks || [],
    extraLenOffset,                       
    recordStart, recordEnd,              
    channelLengths,                      
    blocks: additional._blocks || [],    
    _error: additional._error
  };
}





export function readPlacedIdentity(bytes, key) {
  const r = new Reader(bytes);
  if (key === 'SoLd') {
    r.key4(); r.u32(); r.u32();               
    const d = readDescriptor(r);
    return { linkId: typeof d['Idnt'] === 'string' ? d['Idnt'] : null,
             placedId: typeof d['placed'] === 'string' ? d['placed'] : null };
  }
  r.key4(); r.u32();                          
  const uniqueId = r.pascal();
  return { linkId: uniqueId || null, placedId: null };
}








export function parseSmartObjects(buffer) {
  const ab = toAB(buffer);
  const u8 = new Uint8Array(ab);
  const psd = parsePsd(ab);
  const linkedById = {};
  for (const f of (psd.linkedFiles || [])) if (f.id) linkedById[f.id] = f;
  const out = [];
  psd.layers.forEach((layer, layerIndex) => {
    const blocks = layer.placedBlocks || [];
    if (!blocks.length) return;
    const primary = blocks.find(b => b.key === 'SoLd') || blocks[blocks.length - 1];
    let ident = { linkId: null, placedId: null };
    try { ident = readPlacedIdentity(u8.subarray(primary.dataOffset, primary.dataOffset + primary.dataLength), primary.key); }
    catch {  }
    const so = {
      layerIndex,
      layerName: layer.unicodeName || layer.name,
      bounds: layer.bounds,
      kind: primary.key,
      linkId: ident.linkId,
      placedId: ident.placedId,
      placedBlocks: blocks,
      _doc: psd.header
    };
    const lf = so.linkId && linkedById[so.linkId];
    if (lf) {
      so.sourceImage = {
        id: lf.id, filename: lf.name, fileType: (lf.fileType || '').trim(),
        fileTypeRaw: lf.fileType || '', fileCreator: lf.fileCreator || '',
        embedded: lf.type === 'liFD', byteLength: lf.bytes ? lf.bytes.length : 0,
        mime: guessMime(lf.bytes, lf.fileType), bytes: lf.bytes || null,
        _off: lf._off || null
      };
    }
    out.push(so);
  });
  return out;
}





export function smartObjectFragment(buffer, so) {
  const ab = toAB(buffer);
  const u8 = new Uint8Array(ab);
  
  const psd = parsePsd(ab);
  const layer = locatePlacedLayer(psd, so);
  return {
    layerName: so.layerName, bounds: { ...so.bounds }, kind: so.kind,
    psb: !!psd.header.psb,
    blocks: layer.placedBlocks.map(b => ({ key: b.key, data: u8.slice(b.dataOffset, b.dataOffset + b.dataLength) }))
  };
}


export function locatePlacedLayer(psd, so) {
  let layer = null, best = Infinity;
  for (const l of psd.layers) {
    if (!l.placedBlocks?.length) continue;
    const db = Math.abs(l.bounds.left - so.bounds.left) + Math.abs(l.bounds.top - so.bounds.top)
             + Math.abs(l.bounds.right - so.bounds.right) + Math.abs(l.bounds.bottom - so.bounds.bottom);
    const score = ((l.unicodeName || l.name) === so.layerName ? 0 : 1000) + db;
    if (score < best) { best = score; layer = l; }
  }
  if (!layer) throw new Error(`在文件里找不到智能对象「${so.layerName}」对应的图层块`);
  return layer;
}


export function spliceLayerBlocks(src, psd, layer, rewrites) {
  
  rewrites = rewrites.slice().sort((x, y) => y.blk.dataOffset - x.blk.dataOffset);
  let out = src, totalDelta = 0;
  for (const rw of rewrites) {
    const oldTotal = rw.blk.dataLength + rw.blk.pad;      
    const newLen = rw.bytes.length;                       
    const newTotal = newLen + (newLen % 2);
    totalDelta += newTotal - oldTotal;
    const next = new Uint8Array(out.length + (newTotal - oldTotal));
    next.set(out.subarray(0, rw.blk.dataOffset), 0);
    next.set(rw.bytes, rw.blk.dataOffset);
    next.set(out.subarray(rw.blk.dataOffset + oldTotal), rw.blk.dataOffset + newTotal);
    
    new DataView(next.buffer).setUint32(rw.blk.dataOffset - 4, newLen);
    out = next;
  }

  
  const dv = new DataView(out.buffer);
  const psb = psd.sections.psb;
  const setLen = (off, add) => {
    if (psb) { const v = dv.getUint32(off) * 0x100000000 + dv.getUint32(off + 4);
               const n = v + add; dv.setUint32(off, Math.floor(n / 0x100000000)); dv.setUint32(off + 4, n >>> 0); }
    else dv.setUint32(off, dv.getUint32(off) + add);
  };
  
  
  
  dv.setUint32(layer.extraLenOffset, dv.getUint32(layer.extraLenOffset) + totalDelta);
  if (psd.sections.layerInfoLenOffset) setLen(psd.sections.layerInfoLenOffset, totalDelta);
  if (psd.sections.lmiLenOffset) setLen(psd.sections.lmiLenOffset, totalDelta);

  return out;
}









export function replacePlacedBlocks(buffer, so, blocks) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const layer = locatePlacedLayer(psd, so);
  const seen = {};
  const rewrites = [];
  for (const nb of blocks) {
    const n = seen[nb.key] = (seen[nb.key] || 0) + 1;
    const blk = layer.placedBlocks.filter(b => b.key === nb.key)[n - 1];
    if (!blk) throw new Error(`图层「${so.layerName}」没有第 ${n} 个 ${nb.key} 块`);
    rewrites.push({ blk, bytes: nb.data instanceof Uint8Array ? nb.data : new Uint8Array(nb.data) });
  }
  if (!rewrites.length) return new Uint8Array(ab);
  return spliceLayerBlocks(new Uint8Array(ab), psd, layer, rewrites);
}


export function parseLinkedFiles(buffer) { return parsePsd(buffer).linkedFiles || []; }


function guessMime(bytes, fileType) {
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
    if (bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53) return 'image/vnd.adobe.photoshop';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  }
  const t = (fileType || '').trim();
  return ({ 'png ': 'image/png', 'JPEG': 'image/jpeg', '8BPS': 'image/vnd.adobe.photoshop' }[t]) || 'application/octet-stream';
}


export function getSmartObjectImageBlob(so) {
  if (!so || !so.sourceImage || !so.sourceImage.bytes) return null;
  if (typeof Blob === 'undefined') return null;
  return new Blob([so.sourceImage.bytes], { type: so.sourceImage.mime });
}
export function getSmartObjectImageURL(so) {
  const b = getSmartObjectImageBlob(so);
  return b && typeof URL !== 'undefined' ? URL.createObjectURL(b) : null;
}


export function parsePsdFull(buffer) { return parsePsd(buffer); }




function extractText(layer) {
  if (!layer.text) return null;
  const info = getTextInfo(layer);        
  return { ...info, version: layer.textVersion ?? null };
}





const FX_KEYS = {
  'DrSh': { label: '投影', multi: 'dropShadowMulti' },
  'IrSh': { label: '内阴影', multi: 'innerShadowMulti' },
  'OrGl': { label: '外发光' },
  'IrGl': { label: '内发光' },
  'ebbl': { label: '斜面与浮雕' },
  'SoFi': { label: '颜色叠加', multi: 'solidFillMulti' },
  'GrFl': { label: '渐变叠加', multi: 'gradientFillMulti' },
  'patternFill': { label: '图案叠加', multi: 'patternFillMulti' },
  'FrFX': { label: '描边', multi: 'frameFXMulti' },
  'ChFX': { label: '光泽' },
};
function extractEffects(layer) {
  const d = layer.effects;
  if (!d) return null;
  const out = [];
  for (const [key, spec] of Object.entries(FX_KEYS)) {
    const multi = spec.multi && d[spec.multi];
    if (Array.isArray(multi)) {
      for (let at = 0; at < multi.length; at++) {
        const v = multi[at];
        if (!v || typeof v !== 'object') continue;
        out.push({ key, label: spec.label, enabled: v.enab != null ? !!v.enab : true, at, count: multi.length, multi: true });
      }
      continue;
    }
    const v = d[key];
    if (v == null || typeof v !== 'object') continue;
    out.push({ key, label: spec.label, enabled: v.enab != null ? !!v.enab : true, at: 0, count: 1, multi: false });
  }
  return out;
}


const ADJUST_LABELS = {
  brit: '亮度/对比度', levl: '色阶', curv: '曲线', expA: '曝光度', vibA: '自然饱和度',
  'hue ': '色相/饱和度', hue2: '色相/饱和度', blnc: '色彩平衡', blwh: '黑白', phfl: '照片滤镜',
  mixr: '通道混合器', clrL: '颜色查找', nvrt: '反相', post: '色调分离', thrs: '阈值',
  grdm: '渐变映射', selc: '可选颜色', CgEd: '亮度/对比度（新版）'
};
const FILL_LABELS = { SoCo: '纯色填充', GdFl: '渐变填充', PtFl: '图案填充' };
function adjustmentOf(l) {
  for (const k of l.additionalKeys || []) {
    if (ADJUST_LABELS[k]) return { key: k, label: ADJUST_LABELS[k], kind: 'adjust' };
    if (FILL_LABELS[k]) return { key: k, label: FILL_LABELS[k], kind: 'fill' };
  }
  return null;
}




export function hasRealMask(m) {
  if (!m || typeof m !== 'object') return false;
  return (m.width || 0) > 0 || (m.height || 0) > 0;
}
function realMask(m) { return hasRealMask(m) ? m : null; }





export function parseLayerTree(buffer) {
  const psd = parsePsd(buffer);
  const doc = { width: psd.header.width, height: psd.header.height,
                depth: psd.header.depth, mode: psd.header.mode, psb: psd.header.psb };
  const flat = psd.layers.map((l, i) => ({
    index: i,
    name: l.unicodeName || l.name,
    visible: !(l.flags & 2),          
    opacity: l.opacity,
    blendKey: l.blendKey,             
    clipping: l.clipping,
    groupType: l.groupType ?? null,   
    frame: l.frame || null, isFrame: !!l.frame,
    text: extractText(l),             
    effects: extractEffects(l),       
    effectsOpen: !!(l.flags & 0x20),  
    vectorMask: l.vectorMask || false,
    vectorMaskParams: l.vectorMaskParams || null,   
    isSmartObject: !!(l.placedBlocks && l.placedBlocks.length),  
    additionalKeys: l.additionalKeys || [],                       
    
    
    
    
    mask: realMask(l.mask),                     
    groupBlendKey: l.groupBlendKey || null,     
    passThrough: l.groupBlendKey === 'pass',
    locks: l.locks || null,                     
    colorLabel: l.colorLabel || 0,              
    fillOpacity: l.fillOpacity,                 
    knockout: l.knockout,
    adjustment: adjustmentOf(l),                
    smartFilters: !!(l.additionalKeys || []).some(k => k === 'SoLE' || k === 'FXid' || k === 'FEid'),
    off: { blendKey: l.offBlendKey, opacity: l.offOpacity, flags: l.offFlags }
  }));

  

  if (flat.some(f => f.text && !f.text.pathText)) {
    try {
      const blk = readGlobalBlock(buffer, 'Txt2');
      const frames = blk ? parseTxt2Frames(blk) : [];
      if (frames.some(Boolean)) for (const f of flat) {
        if (!f.text || f.text.pathText || f.text.textIndex == null) continue;
        const fr = frames[f.text.textIndex];
        if (fr && fr.sub) f.text = { ...f.text, pathText: { type: fr.type, sub: fr.sub, range: fr.range, flip: fr.flip }, pathTextFrom: 'txt2' };
      }
    } catch {  }
  }

  
  
  const roots = [];
  const stack = [];
  for (let i = flat.length - 1; i >= 0; i--) {
    const f = flat[i];
    const gt = f.groupType;
    if (gt === 3) {
      
      f.depth = stack.length; f.isGroup = false;
      if (stack.length) stack.pop();
      continue;
    }
    
    
    f.depth = stack.length;
    f.isGroup = gt === 1 || gt === 2;
    const node = { ...f, depth: stack.length, isGroup: false, children: null };
    if (gt === 1 || gt === 2) {
      node.isGroup = true;
      node.children = [];
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
      stack.push(node);
    } else {
      (stack.length ? stack[stack.length - 1].children : roots).push(node);
    }
  }
  return { doc, layers: roots, flat };
}



export function writeLayerProperties(buffer, edits) {
  const ab = toAB(buffer);
  const dv = new DataView(ab);
  const { flat } = parseLayerTree(ab);   
  const byIndex = {};
  for (const n of flat) byIndex[n.index] = n;

  for (const e of edits || []) {
    const node = byIndex[e.index];
    if (!node || !node.off) continue;
    const o = node.off;
    if (e.visible != null) {
      const cur = dv.getUint8(o.flags);
      dv.setUint8(o.flags, e.visible ? (cur & ~0x02) : (cur | 0x02));   
    }
    if (e.opacity != null) dv.setUint8(o.opacity, e.opacity & 0xff);
    if (e.blendKey != null) {
      let s = String(e.blendKey);
      while (s.length < 4) s += ' ';
      for (let j = 0; j < 4; j++) dv.setUint8(o.blendKey + j, s.charCodeAt(j) & 0xff);
    }
  }
  return ab.slice(0);
}




export function encodeUnicode(s) {
  const codes = [];
  
  for (let i = 0; i < s.length; i++) codes.push(s.charCodeAt(i));
  const buf = new Uint8Array(4 + codes.length * 2);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, codes.length, false);       
  for (let i = 0; i < codes.length; i++) dv.setUint16(4 + i * 2, codes[i], false);
  return buf;
}






export function buildBlock(key, data, psb = false) {
  const round = psb ? 4 : (PAD4_BLOCK_KEYS.has(key) ? 4 : 2);
  const pad = (round - (data.length % round)) % round;
  const block = new Uint8Array(12 + data.length + pad);
  block[0] = 0x38; block[1] = 0x42; block[2] = 0x49; block[3] = 0x4D;   
  for (let i = 0; i < 4; i++) block[4 + i] = key.charCodeAt(i) & 0xff;
  new DataView(block.buffer).setUint32(8, data.length + pad, false);
  block.set(data, 12);
  return block;
}


export function renameLayer(buffer, index, newName) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const layer = psd.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  if (newName == null || newName === '') throw new Error('图层名不能为空');
  if (!(layer.blocks || []).some(b => b.key === 'luni')) throw new Error('图层无 luni 块，无法重命名');
  return replaceLayerBlock(ab, index, 'luni', encodeUnicode(newName));
}



export function replaceLayerBlock(buffer, index, key, newData) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const layer = psd.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  const blk = (layer.blocks || []).find(b => b.key === key);
  if (!blk) throw new Error(`图层无 ${key} 块`);
  const newBlock = buildBlock(key, newData, !!psd.sections.psb);
  const delta = newBlock.length - (blk.blockEnd - blk.sigOffset);
  const s = psd.sections;
  const orig = new Uint8Array(ab);
  
  
  const liLenOld = s.layerInfoEndAbs - s.layerInfoStart;
  let liLenNew = liLenOld + delta;
  const padNew = (4 - (liLenNew % 4)) % 4;
  liLenNew += padNew;
  const out = concat([
    orig.subarray(0, blk.sigOffset), newBlock, orig.subarray(blk.blockEnd, s.layerInfoEndAbs),
    new Uint8Array(padNew), orig.subarray(s.layerInfoEndAbs)
  ]);
  const totalDelta = liLenNew - liLenOld;
  const dv = new DataView(out.buffer);
  
  
  const psb = s.psb;
  const setLen = (off, add, is64) => {
    if (!is64) { dv.setUint32(off, dv.getUint32(off) + add); return; }
    const n = dv.getUint32(off) * 0x100000000 + dv.getUint32(off + 4) + add;
    dv.setUint32(off, Math.floor(n / 0x100000000));
    dv.setUint32(off + 4, n >>> 0);
  };
  setLen(layer.extraLenOffset, delta, false);        
  setLen(s.layerInfoLenOffset, totalDelta, psb);
  setLen(s.lmiLenOffset, totalDelta, psb);
  return out.buffer;
}



const GLOBAL_BIG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf']);

export function readGlobalBlock(buffer, key) {
  const ab = toAB(buffer);
  const s = parsePsd(ab).sections;
  if (!s.globalAddlStart || s.globalAddlEnd <= s.globalAddlStart) return null;
  const u8 = new Uint8Array(ab), dv = new DataView(ab);
  const key4 = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  let o = s.globalAddlStart;
  while (o + 12 <= s.globalAddlEnd) {
    const sig = key4(o);
    if (sig !== '8BIM' && sig !== '8B64') break;
    const k = key4(o + 4);
    const big = sig === '8B64' || (s.psb && GLOBAL_BIG_KEYS.has(k));
    const len = big ? dv.getUint32(o + 8) * 0x100000000 + dv.getUint32(o + 12) : dv.getUint32(o + 8);
    const dataStart = o + 8 + (big ? 8 : 4);
    if (k === key) return u8.slice(dataStart, Math.min(s.globalAddlEnd, dataStart + len));
    let end = dataStart + len; while ((end - dataStart) % 4 && end < s.globalAddlEnd) end++;
    o = end;
  }
  return null;
}

export function removeGlobalBlocks(buffer, keys) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const s = psd.sections;
  if (!s.globalAddlStart || s.globalAddlEnd <= s.globalAddlStart) return ab;
  const u8 = new Uint8Array(ab), dv = new DataView(ab);
  const key4 = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  const keep = [];
  let o = s.globalAddlStart, removed = 0, segStart = o;
  while (o + 12 <= s.globalAddlEnd) {
    const sig = key4(o);
    if (sig !== '8BIM' && sig !== '8B64') break;
    const k = key4(o + 4);
    const big = sig === '8B64' || (s.psb && GLOBAL_BIG_KEYS.has(k));
    const len = big ? dv.getUint32(o + 8) * 0x100000000 + dv.getUint32(o + 12) : dv.getUint32(o + 8);
    const dataStart = o + 8 + (big ? 8 : 4);
    let end = dataStart + len; while ((end - dataStart) % 4 && end < s.globalAddlEnd) end++;
    if (end > s.globalAddlEnd) end = s.globalAddlEnd;
    if (keys.includes(k)) { keep.push(u8.subarray(segStart, o)); segStart = end; removed += end - o; }
    o = end;
  }
  if (!removed) return ab;
  keep.push(u8.subarray(segStart, s.globalAddlEnd));
  const out = concat([u8.subarray(0, s.globalAddlStart), ...keep, u8.subarray(s.globalAddlEnd)]);
  const odv = new DataView(out.buffer);
  if (s.psb) {
    const n = odv.getUint32(s.lmiLenOffset) * 0x100000000 + odv.getUint32(s.lmiLenOffset + 4) - removed;
    odv.setUint32(s.lmiLenOffset, Math.floor(n / 0x100000000)); odv.setUint32(s.lmiLenOffset + 4, n >>> 0);
  } else odv.setUint32(s.lmiLenOffset, odv.getUint32(s.lmiLenOffset) - removed);
  return out.buffer;
}








export function parseTyShData(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const r = new Reader(u8);
  const textVersion = r.u16();
  const textTransform = [];
  for (let k = 0; k < 6; k++) textTransform.push(r.f64());
  const textToolVersion = r.u16();
  const textDescVersion = r.u32();
  const text = readDescriptor(r);
  const textWarpVersion = r.u16();
  const textWarpDescVersion = r.u32();
  const textWarp = readDescriptor(r);
  const textTail = u8.slice(Math.min(r.o, u8.length));
  return { textVersion, textTransform, textToolVersion, textDescVersion, text,
           textWarpVersion, textWarpDescVersion, textWarp, textTail };
}


export function buildTyShData(layer, textDesc, warpDesc) {
  const tf = layer.textTransform || [1, 0, 0, 1, 0, 0];
  const head = new Uint8Array(2 + 48 + 2 + 4), hv = new DataView(head.buffer);
  hv.setUint16(0, layer.textVersion || 1);
  for (let k = 0; k < 6; k++) hv.setFloat64(2 + k * 8, tf[k]);
  hv.setUint16(50, layer.textToolVersion || 50);
  hv.setUint32(52, layer.textDescVersion || 16);
  const mid = new Uint8Array(6), mv = new DataView(mid.buffer);
  mv.setUint16(0, layer.textWarpVersion || 1); mv.setUint32(2, layer.textWarpDescVersion || 16);
  return concat([head, serializeDescriptor(textDesc), mid, serializeDescriptor(warpDesc || layer.textWarp || {}),
                 layer.textTail || new Uint8Array(16)]);
}







export function buildTyShFromText(layer, newText, opts = {}) {
  if (!layer || !layer.text) throw new Error('图层不是文字图层（无 TySh）');
  if (newText == null) throw new Error('文字内容不能为空');
  const text = String(newText).replace(/\r?\n/g, '\r');
  const newDesc = { ...layer.text };
  newDesc['Txt '] = text;
  const raw = newDesc['EngineData'];
  if (raw && raw.length) {
    const ed = opts.engineData || parseEngineData(raw);
    setEngineText(ed, text);
    newDesc['EngineData'] = serializeEngineData(ed);
  }
  
  
  const n = text.length + (text.endsWith('\r') ? 0 : 1);
  for (const k of ['Txtt', 'paragraphStyleRange']) {
    const arr = newDesc[k];
    if (Array.isArray(arr) && arr.length) newDesc[k] = [{ ...arr[0], 'From': 0, 'T   ': n }];
  }
  if (Array.isArray(newDesc['kerningRange'])) newDesc['kerningRange'] = [];
  if (opts.font && Array.isArray(newDesc['Txtt']) && newDesc['Txtt'][0] && newDesc['Txtt'][0]['TxtS']) {
    const ts = { ...newDesc['Txtt'][0]['TxtS'], fontPostScriptName: opts.font, 'FntN': opts.font, fontAvailable: true };
    newDesc['Txtt'] = [{ ...newDesc['Txtt'][0], 'TxtS': ts }];
  }
  

  if (opts.orientation) {
    const v = opts.orientation === 'vertical' ? 'Vrtc' : 'Hrzn';
    newDesc['Ornt'] = { ...(newDesc['Ornt'] || {}), __enumType: 'Ornt', value: v };
  }
  if (opts.antiAlias) newDesc['AntA'] = { ...(newDesc['AntA'] || {}), __enumType: 'Annt', value: opts.antiAlias };
  if (opts.bounds) {
    const b = opts.bounds, mk = (o) => ({ ...(o || {}), __classID: (o && o.__classID) || 'Rctn', __name: (o && o.__name) || '',
      'Left': { __unit: '#Pnt', value: b.left }, 'Top ': { __unit: '#Pnt', value: b.top },
      'Rght': { __unit: '#Pnt', value: b.right }, 'Btom': { __unit: '#Pnt', value: b.bottom } });
    if (newDesc['bounds']) newDesc['bounds'] = mk(newDesc['bounds']);
    if (newDesc['boundingBox']) newDesc['boundingBox'] = mk(newDesc['boundingBox']);
  }
  
  if (opts.textOnPath !== undefined) {
    if (opts.textOnPath) newDesc.textOnPath = opts.textOnPath; else delete newDesc.textOnPath;
  }
  

  for (const k of ['dynamicText', 'psd_editorText']) if (opts[k] !== undefined) {
    if (opts[k]) newDesc[k] = opts[k]; else delete newDesc[k];
  }
  
  return buildTyShData(layer, newDesc, opts.warp || layer.textWarp);
}








export function setTextLayerMeta(buffer, index, meta = {}) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const layer = psd.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  if (!layer.text) throw new Error(`图层 ${index} 不是文字图层（无 TySh）`);
  const lay = { ...layer };
  if (Array.isArray(meta.transform) && meta.transform.length >= 6 && meta.transform.slice(0, 6).every(Number.isFinite))
    lay.textTransform = meta.transform.slice(0, 6);
  const desc = { ...layer.text };
  if (Number.isInteger(meta.textIndex) && meta.textIndex >= 0) desc.TextIndex = meta.textIndex;
  const out = replaceLayerBlock(ab, index, 'TySh', buildTyShData(lay, desc, layer.textWarp));
  return meta.keepTxt2 ? out : removeGlobalBlocks(out, ['Txt2']);
}




export function editLayerText(buffer, index, newText, opts = {}) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const layer = psd.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  const out = replaceLayerBlock(ab, index, 'TySh', buildTyShFromText(layer, newText, opts));
  
  
  
  
  return opts.keepTxt2 ? out : removeGlobalBlocks(out, ['Txt2']);
}





const cloneRun = r => JSON.parse(JSON.stringify(r));
export function setEngineText(ed, text) {
  const E = ed && ed.EngineDict; if (!E) throw new Error('EngineData 缺少 EngineDict');
  const t = text.endsWith('\r') ? text : text + '\r';
  if (!E.Editor) E.Editor = {};
  const old = typeof E.Editor.Text === 'string' ? E.Editor.Text : null;
  E.Editor.Text = t;
  const sum = a => (a || []).reduce((x, v) => x + (+v || 0), 0);
  const spansOf = lens => { let p = 0; return lens.map(n => [p, p += Math.max(0, +n || 0)]); };
  const paras = t.split('\r'); paras.pop();          
  const lens = paras.map(p => p.length + 1);
  const PR = E.ParagraphRun;
  if (PR && PR.RunArray && PR.RunArray.length) {
    const okOld = old != null && Array.isArray(PR.RunLengthArray) && PR.RunLengthArray.length === PR.RunArray.length && sum(PR.RunLengthArray) === old.length;
    const oldArr = PR.RunArray;
    let pick = () => oldArr[0];
    if (okOld) {
      const mapped = remapRunSpans(old, t, spansOf(PR.RunLengthArray));
      pick = pos => { for (let k = 0; k < mapped.length; k++) if (pos >= mapped[k][0] && pos < mapped[k][1]) return oldArr[k]; return oldArr[oldArr.length - 1]; };
    }
    let pos = 0;
    PR.RunArray = lens.map(n => { const r = cloneRun(pick(pos)); pos += n; return r; });
    PR.RunLengthArray = lens;
  }
  const SR = E.StyleRun;
  if (SR && SR.RunArray && SR.RunArray.length) {
    const okOld = old != null && Array.isArray(SR.RunLengthArray) && SR.RunLengthArray.length === SR.RunArray.length && sum(SR.RunLengthArray) === old.length;
    if (okOld && SR.RunArray.length > 1) {
      const mapped = remapRunSpans(old, t, spansOf(SR.RunLengthArray));
      const arr = [], ls = [];
      mapped.forEach(([f, to], k) => {
        if (to <= f) return;
        const prev = arr.length - 1;
        if (prev >= 0 && JSON.stringify(arr[prev]) === JSON.stringify(SR.RunArray[k])) { ls[prev] += to - f; return; }
        arr.push(SR.RunArray[k]); ls.push(to - f);
      });
      if (arr.length && ls.reduce((a, b) => a + b, 0) === t.length) { SR.RunArray = arr; SR.RunLengthArray = ls; return ed; }
    }
    SR.RunArray = [SR.RunArray[0]];
    SR.RunLengthArray = [t.length];
  }
  return ed;
}
function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
function u32be(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, false); return b; }
function u16be(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, false); return b; }

function lenField(v, psb) {
  if (!psb) return u32be(v);
  const b = new Uint8Array(8); const dv = new DataView(b.buffer);
  dv.setUint32(0, Math.floor(v / 0x100000000), false); dv.setUint32(4, v >>> 0, false);
  return b;
}



function rebuildWithLayers(buffer, newLayers) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const orig = new Uint8Array(ab);
  const s = psd.sections;
  const psb = !!s.psb;

  
  const n = newLayers.length;
  const newCount = s.layerCountRaw >= 0 ? n : -n;
  const lcBuf = new Uint8Array(2);
  new DataView(lcBuf.buffer).setInt16(0, newCount, false);

  
  
  const parts = [lcBuf];
  for (const l of newLayers) parts.push(orig.subarray(l.recordStart, l.recordEnd));
  for (const l of newLayers) parts.push(orig.subarray(l.chDataStart, l.chDataEnd));
  
  const origLiLen = s.layerInfoEndAbs - s.layerInfoStart;
  const newLayerInfoData = padChunks(vconcat(parts), origLiLen % 4 === 0 ? 4 : 2);
  const newLayerInfoLen = newLayerInfoData.length;

  
  const globalSection = orig.subarray(s.globalMaskStart, s.globalAddlEnd);
  const origLmiLen = s.lmiEndAbs - s.lmiLenOffset - s.lmiLenFieldSize;
  const newLmiData = padChunks(vconcat([lenField(newLayerInfoLen, psb), newLayerInfoData, globalSection]), origLmiLen % 4 === 0 ? 4 : 2);
  const newLmiLen = newLmiData.length;

  
  const result = flatten(vconcat([orig.subarray(0, s.lmiLenOffset), lenField(newLmiLen, psb), newLmiData, orig.subarray(s.lmiEndAbs)]));
  return result.buffer;
}


export function deleteLayer(buffer, index) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  if (index < 0 || index >= psd.layers.length) throw new Error('图层不存在: index=' + index);
  const newLayers = psd.layers.filter((_, j) => j !== index);
  return rebuildWithLayers(ab, newLayers);
}




export function reorderLayers(buffer, newOrder) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const newLayers = newOrder.map(e => {
    const i = typeof e === 'object' && e ? e.dup : e;
    if (!Number.isInteger(i) || i < 0 || i >= psd.layers.length) throw new Error('图层不存在: index=' + i);
    return psd.layers[i];
  });
  return rebuildWithLayers(ab, newLayers);
}

























const BLOCK_SIGS = [[0x38, 0x42, 0x49, 0x4d], [0x38, 0x42, 0x36, 0x34]];   





const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);


export function sha256Hex(bytes) {
  const msg = bytes instanceof Uint8Array ? bytes
    : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = msg.length;
  const withPad = (((len + 8) >> 6) + 1) << 6;          
  const buf = new Uint8Array(withPad);
  buf.set(msg, 0);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(withPad - 8, Math.floor(len / 0x20000000));   
  dv.setUint32(withPad - 4, (len << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, '0');
  return out;
}


export function fragmentChecksum(bytes) { return 'sha256:' + sha256Hex(bytes); }


export function layerFragmentRanges(buffer, index) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  const layer = psd.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  const u8 = new Uint8Array(ab), dv = new DataView(ab);

  const extraStart = layer.extraLenOffset + 4;
  const extraEnd = extraStart + dv.getUint32(layer.extraLenOffset);
  const maskLen = dv.getUint32(extraStart);
  const brOff = extraStart + 4 + maskLen;
  if (brOff + 4 > extraEnd) throw new Error(`图层 ${index} 的 extra 区结构异常（蒙版长度 ${maskLen}）`);
  const brLen = dv.getUint32(brOff);
  const nameOff = brOff + 4 + brLen;
  if (nameOff + 1 > extraEnd) throw new Error(`图层 ${index} 的 extra 区结构异常（混合范围长度 ${brLen}）`);
  const total = 1 + u8[nameOff];
  const nameEnd = nameOff + total + ((4 - (total % 4)) % 4);
  if (nameEnd > extraEnd) throw new Error(`图层 ${index} 的 Pascal 名越界`);

  
  
  
  const sigAt = o => BLOCK_SIGS.some(s => s.every((v, k) => u8[o + k] === v));
  const seen = {};
  const blocks = (layer.blocks || []).map(b => {
    const occurrence = (seen[b.key] = (seen[b.key] || 0) + 1) - 1;
    return {
      key: b.key, occurrence, offset: b.sigOffset, length: b.blockEnd - b.sigOffset,
      dataOffset: b.dataOffset, dataLength: b.dataLength, isBig: !!b.isBig,
      padExact: b.blockEnd === extraEnd || (b.blockEnd + 4 <= extraEnd && sigAt(b.blockEnd)),
    };
  });
  const pseen = {};
  const placedBlocks = (layer.placedBlocks || []).map(b => ({
    key: b.key, occurrence: (pseen[b.key] = (pseen[b.key] || 0) + 1) - 1,
    offset: b.dataOffset, length: b.dataLength, pad: b.pad,
  }));

  return {
    layerIndex: index, psb: !!psd.header.psb,
    layerName: layer.unicodeName || layer.name,
    bounds: { ...layer.bounds },
    blend: { offset: layer.offBlendKey, length: 8 },     
    name: { offset: nameOff, length: nameEnd - nameOff },
    extra: { lenOffset: layer.extraLenOffset, offset: extraStart, length: extraEnd - extraStart },
    blocks, placedBlocks,
  };
}






export function extractLayerFragment(buffer, spec) {
  if (!spec || typeof spec !== 'object') throw new Error('片段规格缺失');
  const r = layerFragmentRanges(buffer, spec.layerIndex);
  const u8 = new Uint8Array(toAB(buffer));
  const base = { layerIndex: spec.layerIndex, psb: r.psb, layerName: r.layerName, bounds: r.bounds };
  const cut = (kind, range, meta) => ({
    ...base, kind, offset: range.offset, length: range.length,
    data: u8.slice(range.offset, range.offset + range.length), meta: meta || {},
  });

  if (spec.kind === 'layerBlend') return cut('layerBlend', r.blend);
  if (spec.kind === 'layerName') return cut('layerName', r.name);
  if (spec.kind === 'layerBlock') {
    if (typeof spec.key !== 'string' || spec.key.length !== 4) throw new Error('layerBlock 片段须给 4 字符 key');
    const occ = spec.occurrence | 0;
    const b = r.blocks.filter(x => x.key === spec.key)[occ];
    if (!b) return null;
    if (!b.padExact)
      throw new Error(`图层 ${spec.layerIndex} 的 ${spec.key} 块填充口径与本项目约定不符，拒绝走增量路径（请走整文件模式）`);
    return cut('layerBlock', b, { key: b.key, occurrence: occ });
  }
  if (spec.kind === 'placedBlocks') {
    if (!r.placedBlocks.length) return null;
    const blocks = r.placedBlocks.map(b => ({
      key: b.key, occurrence: b.occurrence, offset: b.offset, length: b.length,
      data: u8.slice(b.offset, b.offset + b.length),
    }));
    return {
      ...base, kind: 'placedBlocks',
      offset: blocks[0].offset,
      length: blocks.reduce((a, b) => a + b.length, 0),
      data: concat(blocks.map(b => b.data)),          
      blocks, meta: { keys: blocks.map(b => b.key) },
    };
  }
  throw new Error('未知片段类型：' + spec.kind);
}






function spliceExtraRange(ab, layerIndex, from, to, newBytes) {
  const psd = parsePsd(ab);
  const layer = psd.layers[layerIndex];
  if (!layer) throw new Error('图层不存在: index=' + layerIndex);
  const s = psd.sections;
  if (to < from || from < layer.extraLenOffset + 4 || to > s.layerInfoEndAbs)
    throw new Error(`片段区间 [${from}, ${to}) 不在图层 ${layerIndex} 的 extra 区里`);
  const orig = new Uint8Array(ab);
  const delta = newBytes.length - (to - from);
  const liLenOld = s.layerInfoEndAbs - s.layerInfoStart;
  let liLenNew = liLenOld + delta;
  const padNew = (4 - (liLenNew % 4)) % 4;
  liLenNew += padNew;
  const out = concat([
    orig.subarray(0, from), newBytes, orig.subarray(to, s.layerInfoEndAbs),
    new Uint8Array(padNew), orig.subarray(s.layerInfoEndAbs),
  ]);
  const totalDelta = liLenNew - liLenOld;
  const dv = new DataView(out.buffer);
  const setLen = (off, add, is64) => {
    if (!is64) { dv.setUint32(off, dv.getUint32(off) + add); return; }
    const n = dv.getUint32(off) * 0x100000000 + dv.getUint32(off + 4) + add;
    dv.setUint32(off, Math.floor(n / 0x100000000));
    dv.setUint32(off + 4, n >>> 0);
  };
  setLen(layer.extraLenOffset, delta, false);        
  setLen(s.layerInfoLenOffset, totalDelta, !!s.psb);
  setLen(s.lmiLenOffset, totalDelta, !!s.psb);
  return out;
}








export function applyFragmentPatch(buffer, patch) {
  const ab = toAB(buffer);
  if (!patch || typeof patch !== 'object') throw new Error('补丁缺失');
  const idx = patch.layerIndex;

  if (patch.kind === 'placedBlocks') {
    const psd = parsePsd(ab);
    const layer = psd.layers[idx];
    if (!layer) throw new Error('图层不存在: index=' + idx);
    const seen = {};
    const rewrites = [];
    for (const nb of (patch.blocks || [])) {
      const n = seen[nb.key] = (seen[nb.key] || 0) + 1;
      const blk = (layer.placedBlocks || []).filter(b => b.key === nb.key)[n - 1];
      if (!blk) throw new Error(`图层 ${idx} 没有第 ${n} 个 ${nb.key} 块`);
      rewrites.push({ blk, bytes: nb.data instanceof Uint8Array ? nb.data : new Uint8Array(nb.data) });
    }
    if (!rewrites.length) return new Uint8Array(ab);
    return spliceLayerBlocks(new Uint8Array(ab), psd, layer, rewrites);
  }

  const bytes = patch.bytes instanceof Uint8Array ? patch.bytes : new Uint8Array(patch.bytes || []);
  const from = patch.offset, to = patch.offset + patch.length;

  if (patch.kind === 'layerBlend') {
    if (bytes.length !== patch.length)
      throw new Error(`layerBlend 片段必须等长（原 ${patch.length}，新 ${bytes.length}）`);
    const out = new Uint8Array(ab.slice(0));
    out.set(bytes, from);
    return out;
  }
  if (patch.kind === 'layerName' || patch.kind === 'layerBlock')
    return spliceExtraRange(ab, idx, from, to, bytes);

  throw new Error('未知片段类型：' + patch.kind);
}








export function applyFragmentPatches(buffer, patches) {
  let out = new Uint8Array(toAB(buffer));
  const list = (patches || []).slice().sort((a, b) => b.offset - a.offset);
  for (let i = 1; i < list.length; i++) {
    const hi = list[i - 1], lo = list[i];
    if (lo.offset + lo.length > hi.offset)
      throw new Error(`片段区间重叠：[${lo.offset},${lo.offset + lo.length}) 与 [${hi.offset},${hi.offset + hi.length})`);
  }
  for (const p of list) out = applyFragmentPatch(out, p);
  return out;
}




const INCREMENTAL_OPS = {
  setLayerProps: 'props', setVisible: 'props', setOpacity: 'props',
  setBlendMode: 'props', setClipping: 'props', renameLayer: 'props',
  setText: 'text',
  deform: 'placed', setMesh: 'placed', setSmartObjectDescriptor: 'placed',
};


export function isIncrementalOp(name) { return !!INCREMENTAL_OPS[name]; }


const INCREMENTAL_ALIASES = {
  renameLayer: op => ({ op: 'setLayerProps', index: op.index, name: op.name }),
  setVisible: op => ({ op: 'setLayerProps', index: op.index, visible: op.visible }),
  setOpacity: op => ({ op: 'setLayerProps', index: op.index, opacity: op.opacity }),
  setBlendMode: op => ({ op: 'setLayerProps', index: op.index, blendKey: op.blendKey }),
  setClipping: op => ({ op: 'setLayerProps', index: op.index, clipping: op.clipping }),
  setMesh: op => ({ ...op, op: 'deform' }),
};


export function normalizeIncrementalOp(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) throw new Error('op 不是对象');
  const name = op.op;
  if (!INCREMENTAL_OPS[name])
    throw new Error(`op「${name}」不支持增量编辑（可用：${Object.keys(INCREMENTAL_OPS).sort().join(' ')}）`);
  const norm = INCREMENTAL_ALIASES[name] ? { ...INCREMENTAL_ALIASES[name](op), _alias: name } : { ...op };
  if (!Number.isInteger(norm.index) || norm.index < 0) throw new Error(`op「${name}」缺少图层下标 index（≥0 整数）`);
  return norm;
}

const FIXED_PROPS = ['visible', 'opacity', 'clipping', 'blendKey'];


export function incrementalFragmentSpecs(op) {
  const norm = normalizeIncrementalOp(op);
  const i = norm.index;
  if (norm.op === 'setText') return [{ kind: 'layerBlock', layerIndex: i, key: 'TySh', occurrence: 0 }];
  if (norm.op === 'deform' || norm.op === 'setSmartObjectDescriptor')
    return [{ kind: 'placedBlocks', layerIndex: i }];
  
  const out = [];
  if (FIXED_PROPS.some(k => norm[k] !== undefined)) out.push({ kind: 'layerBlend', layerIndex: i });
  const uni = norm.unicodeName !== undefined ? norm.unicodeName : norm.name;
  if (uni !== undefined) out.push({ kind: 'layerBlock', layerIndex: i, key: 'luni', occurrence: 0 });
  if (norm.name !== undefined) out.push({ kind: 'layerName', layerIndex: i });
  if (!out.length) throw new Error('setLayerProps 没有给出任何要改的字段（name/unicodeName/visible/opacity/clipping/blendKey）');
  return out;
}

const fragmentId = s => `${s.kind}:${s.layerIndex}` + (s.key ? `:${s.key}:${s.occurrence | 0}` : '');






export function buildIncrementalRequest(buffer, ops) {
  const ab = toAB(buffer);
  const psd = parsePsd(ab);
  if (!Array.isArray(ops) || !ops.length) throw new Error('ops 为空');
  const byId = new Map();
  const outOps = ops.map((op, i) => {
    const ids = [];
    for (const spec of incrementalFragmentSpecs(op)) {
      const id = fragmentId(spec);
      if (!byId.has(id)) {
        let f = extractLayerFragment(ab, spec);
        if (!f && spec.kind === 'layerBlock' && spec.key === 'luni') {
          
          
          const r = layerFragmentRanges(ab, spec.layerIndex);
          f = { kind: 'layerBlock', layerIndex: spec.layerIndex, psb: r.psb, layerName: r.layerName, bounds: r.bounds,
                offset: r.extra.offset + r.extra.length, length: 0, data: new Uint8Array(0),
                meta: { key: 'luni', occurrence: 0, absent: true } };
        }
        if (!f) throw new Error(`ops[${i}]「${op.op}」需要的片段 ${id} 在文件里不存在`);
        byId.set(id, { id, ...f, checksum: fragmentChecksum(f.data) });
      }
      ids.push(id);
    }
    return { ...op, fragments: ids };
  });
  const fragments = [...byId.values()];
  return {
    doc: { psb: !!psd.header.psb, layerCount: psd.layers.length, bytes: ab.byteLength },
    fragments, ops: outOps,
    upBytes: fragments.reduce((a, f) => a + f.length, 0),
  };
}






export function applyIncrementalResponse(buffer, res) {
  const ab = toAB(buffer);
  if (!res || !Array.isArray(res.fragments)) throw new Error('响应里没有 fragments');
  const u8 = new Uint8Array(ab);
  const patches = res.fragments.map(f => {
    
    
    const cur = f.kind === 'placedBlocks'
      ? concat((f.blocks || []).map(b => u8.slice(b.offset, b.offset + b.length)))
      : u8.slice(f.offset, f.offset + f.length);
    if (f.checksum && fragmentChecksum(cur) !== f.checksum)
      throw new Error(`片段 ${f.id} 的本地字节与请求时不一致（文件被并发改动了？）`);
    return f.kind === 'placedBlocks'
      ? { kind: f.kind, layerIndex: f.layerIndex, offset: f.offset, length: f.length, blocks: f.blocks }
      : { kind: f.kind, layerIndex: f.layerIndex, offset: f.offset, length: f.length, bytes: f.data };
  });
  let out = applyFragmentPatches(u8, patches);
  let side = 0;
  for (const se of (res.sideEffects || [])) {
    if (se.type === 'removeGlobalBlocks' && Array.isArray(se.keys)) {
      out = new Uint8Array(removeGlobalBlocks(out, se.keys));
      side++;
    } else throw new Error('未知的 sideEffect：' + (se && se.type));
  }
  return { buffer: out, patched: patches.length, sideEffects: side };
}

function toAB(buffer) {
  return buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export default {
  parseSmartObjects, parsePsdFull, parseLinkedFiles, smartObjectFragment, replacePlacedBlocks,
  getSmartObjectImageBlob, getSmartObjectImageURL,
  layerFragmentRanges, extractLayerFragment, applyFragmentPatch, applyFragmentPatches, fragmentChecksum
};
