

































import { parsePsdFull, Reader, readDescriptor } from './psd-parse.js';
import {
  parseColorModeData, writeColorModeData,
  parseImageResources, writeImageResources,
  paletteRGB, COLOR_MODE,
} from './psd-resources.js';
import {
  parseLayerExtras, writeLayerMask, writeBlendingRanges,
  parseGlobalLayerMask, writeGlobalLayerMask,
  channelInfo, parseLayerFlags,
} from './psd-layer.js';
import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';
import { frameInfoOf } from './psd-frame.js';
import { decodeLayerChannels, decodeCompositeImage, readSections } from './psd-image.js';



const EMPTY = new Uint8Array(0);

function toU8(b) {
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return new Uint8Array(b || 0);
}


class Chunks { constructor(parts) { this.parts = parts; let n = 0; for (const p of parts) n += p.length; this.length = n; } }
const vconcat = parts => new Chunks(parts);
function flatParts(parts, out = []) { for (const p of parts) { if (p instanceof Chunks) flatParts(p.parts, out); else out.push(p); } return out; }
function concat(parts) {
  const flat = flatParts(parts);
  let n = 0;
  for (const p of flat) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of flat) { out.set(p, o); o += p.length; }
  return out;
}
function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const u8be = v => new Uint8Array([v & 0xff]);
function u16be(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff); return b; }
function u32be(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; }
function i32be(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); return b; }
function i16be(v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v | 0); return b; }
function u64be(v) {
  const b = new Uint8Array(8), d = new DataView(b.buffer);
  d.setUint32(0, Math.floor(v / 0x100000000)); d.setUint32(4, v >>> 0);
  return b;
}

const lenField = (v, big) => (big ? u64be(v) : u32be(v));
function ascii4(s) {
  const t = String(s == null ? '    ' : s).padEnd(4).slice(0, 4);
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) b[i] = t.charCodeAt(i) & 0xff;
  return b;
}
const key4At = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
const u64At = (dv, o) => dv.getUint32(o) * 0x100000000 + dv.getUint32(o + 4);



const PAD4_BLOCK_KEYS = new Set(['Txt2', 'luni', 'vmsk', 'artb', 'artd', 'frgb', 'vogk', 'SoLd', 'lnk2', 'lnk3', 'lnkD', 'lnkE',
  'vscg', 'vsms', 'GdFl', 'lmfx', 'lrFX', 'cinf', 'PlLd', 'Anno', 'CAI ', 'OCIO', 'GenI', 'FEid', 'curv', 'CgEd', 'vibA', 'blwh', 'grdm']);


const BIG_LEN_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk',
  'lnk2', 'lnkD', 'lnk3', 'lnkE', 'FEid', 'FXid', 'PxSD', 'cinf']);


const SECTION_KEYS = ['lsct', 'lsdk'];

const EFFECT_BLOCK_KEYS = ['lfx2', 'lmfx', 'lfxs', 'lrFX'];

function padFor(key, len, psb, scope) {
  if (scope === 'global') return (4 - (len % 4)) % 4;      
  if (psb) return (4 - (len % 4)) % 4;                     
  return PAD4_BLOCK_KEYS.has(key) ? (4 - (len % 4)) % 4 : len % 2;
}

function isBlockSigAt(u8, o, end) {
  if (o + 12 > end) return false;
  const s = key4At(u8, o);
  return s === '8BIM' || s === '8B64';
}








function readBlockList(u8, dv, start, end, ctx, scope) {
  const blocks = [];
  let o = Math.min(start, end);
  while (o + 12 <= end) {
    const sig = key4At(u8, o);
    if (sig !== '8BIM' && sig !== '8B64') break;
    const key = key4At(u8, o + 4);
    const isBig = sig === '8B64' || (ctx.psb && BIG_LEN_KEYS.has(key));
    const lenOffset = o + 8;
    const lenSize = isBig ? 8 : 4;
    if (lenOffset + lenSize > end) break;
    const len = isBig ? u64At(dv, lenOffset) : dv.getUint32(lenOffset);
    const dataOffset = lenOffset + lenSize;
    if (!Number.isFinite(len) || len < 0 || dataOffset + len > end) {
      ctx.warn(`${scope} 附加块 ${key} @${o} 长度 ${len} 越界，剩余字节按原样保留`);
      break;
    }
    const dataEnd = dataOffset + len;

    
    let pad = padFor(key, len, ctx.psb, scope);
    if (dataEnd + pad > end) pad = end - dataEnd;
    if (dataEnd + pad < end && !isBlockSigAt(u8, dataEnd + pad, end)) {
      for (let p = dataEnd; p <= Math.min(dataEnd + 4, end); p++) {
        if (p === end || isBlockSigAt(u8, p, end)) { pad = p - dataEnd; break; }
      }
    }

    const data = u8.subarray(dataOffset, dataEnd);
    const block = {
      sig, key, isBig, length: len,
      _off: { blockStart: o, lenOffset, dataOffset, dataEnd, blockEnd: dataEnd + pad },
      _raw: data,
      _pad: u8.subarray(dataEnd, dataEnd + pad),
      model: null,
    };
    
    try {
      block.model = parseAdditionalBlock(key, data, { psb: ctx.psb });
      if (block.model && block.model._error) ctx.warn(`附加块 ${key}: ${block.model._error}`);
    } catch (e) {
      block.model = { _key: key, _kind: 'raw', _raw: data.slice(), _error: String(e && e.message || e) };
      ctx.warn(`附加块 ${key} 解析抛错：${e && e.message}`);
    }
    blocks.push(block);
    o = dataEnd + pad;
  }
  return { blocks, tail: u8.subarray(o, end) };
}


function writeBlock(block, psb, scope) {
  let data;
  try {
    data = block.model ? toU8(writeAdditionalBlock(block.key, block.model, { psb })) : toU8(block._raw);
  } catch (e) {
    data = toU8(block._raw);
  }
  let pad = block._pad || EMPTY;
  if (data.length !== block.length) {
    
    const need = padFor(block.key, data.length, psb, scope);
    if (need) data = concat([data, new Uint8Array(need)]);
    pad = EMPTY;
  }
  return concat([ascii4(block.sig || '8BIM'), ascii4(block.key), lenField(data.length, block.isBig), data, pad]);
}







function readLayerRecord(u8, dv, start, end, ctx) {
  if (start + 18 > end) return null;
  let o = start;
  const bounds = { top: dv.getInt32(o), left: dv.getInt32(o + 4), bottom: dv.getInt32(o + 8), right: dv.getInt32(o + 12) };
  o += 16;
  const nChannels = dv.getUint16(o); o += 2;
  const chLenSize = ctx.psb ? 8 : 4;
  if (o + nChannels * (2 + chLenSize) + 16 > end) return null;
  const channels = [];
  for (let c = 0; c < nChannels; c++) {
    const id = dv.getInt16(o); o += 2;
    const length = ctx.psb ? u64At(dv, o) : dv.getUint32(o);
    o += chLenSize;
    channels.push({ id, info: channelInfo(id, ctx.mode), length, compression: null, _off: null, _raw: EMPTY });
  }
  const blendSig = key4At(u8, o); o += 4;
  const offBlendKey = o;
  const blendKey = key4At(u8, o); o += 4;
  const offOpacity = o;
  const opacity = u8[o]; o += 1;
  const clipping = u8[o]; o += 1;
  const offFlags = o;
  const flags = u8[o]; o += 1;
  const filler = u8[o]; o += 1;
  const extraLenOffset = o;
  if (extraLenOffset + 4 > end) return null;
  const extraLen = dv.getUint32(extraLenOffset);
  const extraStart = extraLenOffset + 4;
  let extraEnd = extraStart + extraLen;
  if (extraEnd > end) {
    ctx.warn(`图层 extra 长度 ${extraLen} 越界（@${extraLenOffset}），已截断到段尾`);
    extraEnd = end;
  }

  const layer = {
    index: -1,
    name: '', unicodeName: null,
    bounds,
    blend: {
      sig: blendSig, key: blendKey, opacity, clipping, flags,
      flagsParsed: parseLayerFlags(flags), filler,
      visible: !(flags & 0x02),
    },
    channels,
    mask: null, blendingRanges: null,
    additional: Object.create(null), additionalBlocks: [],
    groupType: null, path: null, text: null, effects: null, smartObject: null,
    _section: ctx.section,
    _off: {
      recordStart: start, recordEnd: extraEnd,
      offBlendKey, offOpacity, offFlags,
      extraLenOffset, extraStart, extraEnd,
    },
    _extraTail: EMPTY,
    _nameRaw: EMPTY,
  };

  
  if (extraLen < 9) {
    layer._extraRaw = u8.subarray(extraStart, extraEnd);
    return layer;
  }

  let extras = null;
  try {
    extras = parseLayerExtras(u8, { extraLenOffset });
  } catch (e) {
    ctx.warn(`图层 extra 解析失败 @${extraLenOffset}：${e && e.message}`);
    layer._extraRaw = u8.subarray(extraStart, extraEnd);
    return layer;
  }

  
  const maskEnd = Math.min(extras.mask._off.end, extraEnd);
  const maskRaw = u8.subarray(extras.mask._off.start, maskEnd);
  const mask = extras.mask;
  mask._sectionRaw = maskRaw;
  mask._writeMode = 'semantic';
  try {
    if (!sameBytes(toU8(writeLayerMask(mask)), maskRaw)) {
      mask._writeMode = 'raw';
      ctx.warn(`图层蒙版段语义写回不一致 @${extras.mask._off.start}，已降级为原样字节`);
    }
  } catch (e) {
    mask._writeMode = 'raw';
    ctx.warn(`图层蒙版段写回抛错 @${extras.mask._off.start}：${e && e.message}`);
  }
  layer.mask = mask;

  
  const brEnd = Math.min(extras.blendingRanges._off.end, extraEnd);
  const brRaw = u8.subarray(extras.blendingRanges._off.start, brEnd);
  const br = extras.blendingRanges;
  br._sectionRaw = brRaw;
  br._writeMode = 'semantic';
  try {
    if (!sameBytes(toU8(writeBlendingRanges(br)), brRaw)) {
      br._writeMode = 'raw';
      ctx.warn(`图层混合范围段语义写回不一致 @${extras.blendingRanges._off.start}，已降级为原样字节`);
    }
  } catch (e) {
    br._writeMode = 'raw';
    ctx.warn(`图层混合范围段写回抛错：${e && e.message}`);
  }
  layer.blendingRanges = br;

  
  const nameStart = extras.name.offset;
  const additionalStart = Math.min(Math.max(extras.additionalStart, nameStart), extraEnd);
  layer.name = extras.name.value;
  layer._nameRaw = u8.subarray(nameStart, additionalStart);
  layer._off.nameStart = nameStart;
  layer._off.additionalStart = additionalStart;
  if (extras.nameSkew) ctx.warn(`图层「${layer.name}」名字后有 ${extras.nameSkew} 字节非常规填充`);

  
  const { blocks, tail } = readBlockList(u8, dv, additionalStart, extraEnd, ctx, 'layer');
  layer.additionalBlocks = blocks;
  layer._extraTail = tail;
  for (const b of blocks) {
    if (layer.additional[b.key] === undefined) layer.additional[b.key] = b.model;
  }
  applyLayerSemantics(layer, ctx);
  return layer;
}


function applyLayerSemantics(layer, ctx) {
  const a = layer.additional;
  layer.frame = frameInfoOf(a.frgb);
  layer.isFrame = !!layer.frame;
  if (a.luni && typeof a.luni.name === 'string') layer.unicodeName = a.luni.name;
  for (const k of SECTION_KEYS) {
    if (a[k] && a[k].sectionType !== undefined) {
      layer.groupType = a[k].sectionType;
      layer.groupTypeName = a[k].sectionTypeName;
      layer.passThroughBlendKey = a[k].blendKey || null;
      break;
    }
  }
  const vm = a.vmsk || a.vsms;
  if (vm && vm.path) layer.path = vm;

  
  const tysh = layer.additionalBlocks.find(b => b.key === 'TySh');
  if (tysh) {
    try { layer.text = readTySh(tysh._raw); }
    catch (e) { ctx.warn(`图层「${layer.name}」TySh 解析失败：${e && e.message}`); }
  }

  const fxBlocks = layer.additionalBlocks.filter(b => EFFECT_BLOCK_KEYS.includes(b.key));
  if (fxBlocks.length) {
    layer.effects = { keys: fxBlocks.map(b => b.key), models: fxBlocks.map(b => b.model) };
    const desc = fxBlocks.map(b => b.model && b.model.desc).find(Boolean);
    if (desc) layer.effects.descriptor = desc;
  }

  const placed = layer.additionalBlocks.filter(b => b.key === 'SoLd' || b.key === 'PlLd' || b.key === 'plLd' || b.key === 'SoLE');
  if (placed.length) {
    const primary = placed.find(b => b.key === 'SoLd') || placed[placed.length - 1];
    const m = primary.model || {};
    layer.smartObject = {
      kind: primary.key,
      linkId: (m.desc && typeof m.desc['Idnt'] === 'string' ? m.desc['Idnt'] : null) || m.uniqueId || null,
      placedId: (m.desc && typeof m.desc['placed'] === 'string') ? m.desc['placed'] : null,
      transform: m.transform || null,
      blocks: placed.map(b => ({ key: b.key, _off: b._off, length: b.length })),
    };
  }
}



function readTySh(bytes) {
  const r = new Reader(toU8(bytes));
  const version = r.u16();
  const transform = [];
  for (let i = 0; i < 6; i++) transform.push(r.f64());
  const textToolVersion = r.u16();
  const textDescVersion = r.u32();
  const descriptor = readDescriptor(r);
  const warpVersion = r.u16();
  const warpDescVersion = r.u32();
  const warp = readDescriptor(r);
  return { version, transform, textToolVersion, textDescVersion, descriptor, warpVersion, warpDescVersion, warp };
}


function writeLayerRecord(layer, psb) {
  const parts = [];
  const b = layer.bounds;
  parts.push(i32be(b.top), i32be(b.left), i32be(b.bottom), i32be(b.right));
  parts.push(u16be(layer.channels.length));
  for (const ch of layer.channels) {
    const len = ch._dirty ? ch._raw.length : (ch.length ?? ch._raw.length);
    parts.push(i16be(ch.id), lenField(len, psb));
  }
  const bl = layer.blend;
  parts.push(ascii4(bl.sig || '8BIM'), ascii4(bl.key), u8be(bl.opacity), u8be(bl.clipping), u8be(bl.flags), u8be(bl.filler || 0));

  let extra;
  if (layer._extraRaw) {
    extra = toU8(layer._extraRaw);
  } else {
    const ep = [];
    ep.push(layer.mask && layer.mask._writeMode === 'raw'
      ? toU8(layer.mask._sectionRaw) : toU8(writeLayerMask(layer.mask)));
    ep.push(layer.blendingRanges && layer.blendingRanges._writeMode === 'raw'
      ? toU8(layer.blendingRanges._sectionRaw) : toU8(writeBlendingRanges(layer.blendingRanges)));
    ep.push(toU8(layer._nameRaw));
    for (const blk of layer.additionalBlocks) ep.push(writeBlock(blk, psb, 'layer'));
    if (layer._extraTail && layer._extraTail.length) ep.push(toU8(layer._extraTail));
    extra = concat(ep);
  }
  parts.push(u32be(extra.length), extra);
  return concat(parts);
}








function readLayerInfoBody(u8, dv, start, end, ctx) {
  const sec = {
    _off: { start, end }, present: true, countRaw: 0,
    layers: [], channelDataStart: start, tail: EMPTY, section: ctx.section,
  };
  if (end - start < 2) {
    sec.present = false;
    sec.tail = u8.subarray(start, end);
    return sec;
  }
  sec.countRaw = dv.getInt16(start);
  const count = Math.abs(sec.countRaw);
  let o = start + 2;
  for (let i = 0; i < count; i++) {
    const rec = readLayerRecord(u8, dv, o, end, ctx);
    if (!rec) {
      ctx.warn(`${ctx.section} 第 ${i} 条图层记录读取失败（@${o}），后续字节按原样保留`);
      break;
    }
    rec.index = i;
    sec.layers.push(rec);
    o = rec._off.recordEnd;
  }
  
  sec.channelDataStart = o;
  for (const l of sec.layers) {
    l._off.channelDataOffset = o;
    for (const ch of l.channels) {
      const chEnd = Math.min(o + ch.length, end);
      ch._off = o;
      ch._end = chEnd;
      ch._raw = u8.subarray(o, chEnd);
      ch.compression = chEnd - o >= 2 ? dv.getUint16(o) : null;
      if (chEnd < o + ch.length) ctx.warn(`图层「${l.unicodeName || l.name}」通道 ${ch.id} 数据越界，已截断`);
      o = chEnd;
    }
  }
  sec.tail = u8.subarray(o, end);
  return sec;
}


function writeLayerInfoBody(sec, psb) {
  if (!sec || !sec.present) return toU8(sec && sec.tail ? sec.tail : EMPTY);
  const parts = [i16be(sec.countRaw)];
  for (const l of sec.layers) parts.push(writeLayerRecord(l, psb));
  for (const l of sec.layers) for (const ch of l.channels) parts.push(toU8(ch._raw));
  if (sec.tail && sec.tail.length) parts.push(toU8(sec.tail));
  return vconcat(parts);
}










export function parsePsdDocument(buffer, opts = {}) {
  const u8 = toU8(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const warnings = [];
  const warn = m => { warnings.push(String(m)); };

  if (u8.length < 26 || key4At(u8, 0) !== '8BPS') throw new Error('不是 PSD/PSB 文件（缺少 8BPS 签名）');

  
  const version = dv.getUint16(4);
  const psb = version === 2;
  const header = {
    signature: '8BPS', version, psb,
    _reserved: u8.subarray(6, 12),
    channels: dv.getUint16(12),
    height: dv.getUint32(14),
    width: dv.getUint32(18),
    depth: dv.getUint16(22),
    mode: dv.getUint16(24),
    _off: 0, _raw: u8.subarray(0, 26),
  };
  header.modeName = COLOR_MODE[header.mode] || `未知(${header.mode})`;

  
  const cmLenOff = 26;
  const cmLen = dv.getUint32(cmLenOff);
  const cmDataOff = cmLenOff + 4;
  const cmEnd = Math.min(cmDataOff + cmLen, u8.length);
  const cmRaw = u8.subarray(cmDataOff, cmEnd);
  let colorModeData;
  try {
    colorModeData = parseColorModeData(cmRaw, header, cmDataOff);
  } catch (e) {
    colorModeData = { _off: cmDataOff, _raw: cmRaw, length: cmRaw.length, kind: 'unknown' };
    warn(`Color Mode Data 解析失败：${e && e.message}`);
  }
  colorModeData._writeMode = 'semantic';
  try {
    if (!sameBytes(toU8(writeColorModeData(colorModeData)), cmRaw)) {
      colorModeData._writeMode = 'raw';
      warn('Color Mode Data 语义写回不一致，已降级为原样字节');
    }
  } catch (e) { colorModeData._writeMode = 'raw'; warn(`Color Mode Data 写回抛错：${e && e.message}`); }
  colorModeData._raw = cmRaw;

  const irLenOff = cmEnd;
  const irLen = irLenOff + 4 <= u8.length ? dv.getUint32(irLenOff) : 0;
  const irDataOff = irLenOff + 4;
  const irEnd = Math.min(irDataOff + irLen, u8.length);
  const irRaw = u8.subarray(irDataOff, irEnd);
  let imageResources;
  try {
    imageResources = parseImageResources(irRaw, irDataOff);
  } catch (e) {
    imageResources = Object.assign([], { _off: irDataOff, _trailing: irRaw });
    warn(`Image Resources 解析失败：${e && e.message}`);
  }
  imageResources._raw = irRaw;
  imageResources._writeMode = 'semantic';
  try {
    if (!sameBytes(toU8(writeImageResources(imageResources)), irRaw)) {
      imageResources._writeMode = 'raw';
      warn('Image Resources 段语义写回不一致，已降级为原样字节');
    }
  } catch (e) { imageResources._writeMode = 'raw'; warn(`Image Resources 写回抛错：${e && e.message}`); }

  
  
  
  
  let sections = null;
  let linkedFiles = [];
  try {
    
    
    const ab = (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength)
      ? u8.buffer : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const full = parsePsdFull(ab);
    sections = full.sections;
    linkedFiles = full.linkedFiles || [];
  } catch (e) {
    warn(`parsePsdFull 段定位失败，改用本模块自算偏移：${e && e.message}`);
  }

  const lmiLenOff = irEnd;
  const lmiLenSize = psb ? 8 : 4;
  const ctx = { psb, mode: header.mode, depth: header.depth, warn, section: 'layerInfo' };
  const doc = {
    header, colorModeData, imageResources,
    layers: [],
    layerAndMask: null,
    layerInfo: null,
    globalLayerMask: null,
    globalAdditional: [],
    globalAdditionalTail: EMPTY,
    linkedFiles,
    imageData: null,
    warnings,
    _off: {
      header: 0,
      colorModeLength: cmLenOff, colorModeData: cmDataOff, colorModeEnd: cmEnd,
      imageResourcesLength: irLenOff, imageResourcesData: irDataOff, imageResourcesEnd: irEnd,
      layerAndMaskLength: lmiLenOff,
    },
    _bytes: u8,
    _psb: psb,
  };

  if (lmiLenOff + lmiLenSize > u8.length) {
    
    warn('文件在 Layer & Mask 段之前结束，没有层信息与合成图');
    doc.layerAndMask = { present: false, _absent: true };
    doc.imageData = { compression: null, _off: Math.min(lmiLenOff, u8.length), _raw: u8.subarray(Math.min(lmiLenOff, u8.length)) };
    return doc;
  }

  const lmiLen = psb ? u64At(dv, lmiLenOff) : dv.getUint32(lmiLenOff);
  const lmiStart = lmiLenOff + lmiLenSize;
  const lmiEnd = Math.min(lmiStart + lmiLen, u8.length);
  doc._off.layerAndMaskData = lmiStart;
  doc._off.layerAndMaskEnd = lmiEnd;
  if (lmiStart + lmiLen > u8.length) warn(`Layer & Mask 段长度 ${lmiLen} 越界，已截断到文件尾`);

  const lam = { present: lmiLen > 0, _off: { start: lmiStart, end: lmiEnd }, _raw: u8.subarray(lmiStart, lmiEnd) };
  doc.layerAndMask = lam;

  if (lam.present) {
    if (lmiEnd - lmiStart < lmiLenSize) {
      
      lam._writeMode = 'raw';
      warn('Layer & Mask 段太短，整段按原样保留');
    } else {
      const liLen = psb ? u64At(dv, lmiStart) : dv.getUint32(lmiStart);
      const liStart = lmiStart + lmiLenSize;
      const liEnd = Math.min(liStart + liLen, lmiEnd);
      if (liStart + liLen > lmiEnd) warn(`层信息段长度 ${liLen} 超出 Layer & Mask 段，已截断`);
      doc._off.layerInfoLength = lmiStart;
      doc._off.layerInfoData = liStart;
      doc._off.layerInfoEnd = liEnd;
      ctx.section = 'layerInfo';
      doc.layerInfo = readLayerInfoBody(u8, dv, liStart, liEnd, ctx);
      doc.layerInfo._declaredLength = liLen;

      
      let o = liEnd;
      doc._off.globalLayerMask = o;
      if (o + 4 <= lmiEnd) {
        const gmLen = dv.getUint32(o);
        const gmEnd = Math.min(o + 4 + gmLen, lmiEnd);
        if (o + 4 + gmLen > lmiEnd) warn(`全局图层蒙版长度 ${gmLen} 越界，已截断`);
        const gmRaw = u8.subarray(o, gmEnd);
        let gm;
        try { gm = parseGlobalLayerMask(gmRaw, { offset: o }); }
        catch (e) { gm = { present: gmRaw.length > 4, _raw: gmRaw.subarray(4) }; warn(`全局图层蒙版解析失败：${e && e.message}`); }
        gm._sectionRaw = gmRaw;
        gm._writeMode = 'semantic';
        try {
          if (!sameBytes(toU8(writeGlobalLayerMask(gm)), gmRaw)) {
            gm._writeMode = 'raw';
            warn('全局图层蒙版语义写回不一致，已降级为原样字节');
          }
        } catch (e) { gm._writeMode = 'raw'; warn(`全局图层蒙版写回抛错：${e && e.message}`); }
        doc.globalLayerMask = gm;
        o = gmEnd;
      } else if (o < lmiEnd) {
        warn('全局图层蒙版段不足 4 字节，剩余字节按原样保留');
      }
      doc._off.globalAdditional = o;

      
      const g = readBlockList(u8, dv, o, lmiEnd, ctx, 'global');
      doc.globalAdditional = g.blocks;
      doc.globalAdditionalTail = g.tail;

      
      if (sections && lmiStart + lmiLen <= u8.length) {
        const cmp = [
          ['lmiLenOffset', sections.lmiLenOffset, lmiLenOff],
          ['lmiEndAbs', sections.lmiEndAbs, lmiEnd],
          ['layerInfoStart', sections.layerInfoStart, liStart],
          ['layerInfoEndAbs', sections.layerInfoEndAbs, liEnd],
          ['globalMaskStart', sections.globalMaskStart, doc._off.globalLayerMask],
          ['globalAddlStart', sections.globalAddlStart, doc._off.globalAdditional],
          ['layerCountRaw', sections.layerCountRaw, doc.layerInfo.countRaw],
        ].filter(([, a, b]) => a !== b);
        if (cmp.length) warn(`段定位与 psd-parse.js 不一致：${cmp.map(([k, a, b]) => `${k} ${a}≠${b}`).join('，')}`);
      }
    }
  }

  
  for (const blk of doc.globalAdditional) {
    if (blk.key !== 'Lr16' && blk.key !== 'Lr32' && blk.key !== 'Layr') continue;
    const start = blk._off.dataOffset, end = blk._off.dataEnd;
    const subCtx = { ...ctx, section: blk.key };
    let body = null;
    try {
      body = readLayerInfoBody(u8, dv, start, end, subCtx);
    } catch (e) {
      warn(`${blk.key} 块内层信息解析失败：${e && e.message}`);
      continue;
    }
    
    if (body.layers.length) {
      blk.layerInfo = body;
      blk.model = null;   
    } else if (body.countRaw === 0) {
      blk.layerInfo = body;
      blk.model = null;
    }
  }

  
  const all = [];
  if (doc.layerInfo && doc.layerInfo.layers.length) all.push(...doc.layerInfo.layers);
  for (const blk of doc.globalAdditional) {
    if (blk.layerInfo && blk.layerInfo.layers.length) all.push(...blk.layerInfo.layers);
  }
  all.forEach((l, i) => { l.index = i; });
  doc.layers = all;

  
  const idOff = Math.min(lmiEnd, u8.length);
  doc.imageData = {
    compression: idOff + 2 <= u8.length ? dv.getUint16(idOff) : null,
    _off: idOff,
    _raw: u8.subarray(idOff),
    length: u8.length - idOff,
  };
  doc._off.imageData = idOff;

  
  if (linkedFiles.length) {
    const byId = Object.create(null);
    for (const f of linkedFiles) if (f && f.id) byId[f.id] = f;
    for (const l of doc.layers) {
      if (l.smartObject && l.smartObject.linkId && byId[l.smartObject.linkId]) {
        const f = byId[l.smartObject.linkId];
        l.smartObject.sourceFile = {
          id: f.id, name: f.name, fileType: (f.fileType || '').trim(),
          embedded: f.type === 'liFD', byteLength: f.bytes ? f.bytes.length : 0,
        };
      }
    }
  }

  
  if (opts.pixels) {
    for (const l of doc.layers) {
      try { l.pixels = decodeLayerPixels(doc, u8, l.index, opts); }
      catch (e) { warn(`图层 ${l.index}「${l.unicodeName || l.name}」像素解码失败：${e && e.message}`); }
    }
    try { doc.imageData.pixels = decodeComposite(doc, u8, opts); }
    catch (e) { warn(`合成图解码失败：${e && e.message}`); }
  }

  return doc;
}









export function serializePsdDocument(doc) {
  if (!doc || !doc.header) throw new Error('serializePsdDocument：缺少文档模型');
  const psb = !!doc.header.psb;
  const parts = [];

  
  const h = doc.header;
  parts.push(ascii4(h.signature || '8BPS'), u16be(h.version || (psb ? 2 : 1)));
  parts.push(h._reserved && h._reserved.length === 6 ? toU8(h._reserved) : new Uint8Array(6));
  parts.push(u16be(h.channels), u32be(h.height), u32be(h.width), u16be(h.depth), u16be(h.mode));

  
  const cm = doc.colorModeData
    ? (doc.colorModeData._writeMode === 'raw' ? toU8(doc.colorModeData._raw) : toU8(writeColorModeData(doc.colorModeData)))
    : EMPTY;
  parts.push(u32be(cm.length), cm);

  
  const ir = doc.imageResources
    ? (doc.imageResources._writeMode === 'raw' ? toU8(doc.imageResources._raw) : toU8(writeImageResources(doc.imageResources)))
    : EMPTY;
  parts.push(u32be(ir.length), ir);

  
  if (!doc.layerAndMask || !doc.layerAndMask._absent) {
    const lam = buildLayerAndMask(doc, psb);
    parts.push(lenField(lam.length, psb), lam);
  }

  
  if (doc.imageData && doc.imageData._raw) parts.push(toU8(doc.imageData._raw));

  return concat(parts);
}

function buildLayerAndMask(doc, psb) {
  const lam = doc.layerAndMask;
  if (!lam || !lam.present) return EMPTY;
  if (lam._writeMode === 'raw') return toU8(lam._raw);

  const parts = [];
  
  const liBody = writeLayerInfoBody(doc.layerInfo, psb);
  parts.push(lenField(liBody.length, psb), liBody);
  
  if (doc.globalLayerMask) {
    parts.push(doc.globalLayerMask._writeMode === 'raw'
      ? toU8(doc.globalLayerMask._sectionRaw)
      : toU8(writeGlobalLayerMask(doc.globalLayerMask)));
  }
  
  for (const blk of doc.globalAdditional) {
    if (blk.layerInfo) {
      let data = writeLayerInfoBody(blk.layerInfo, psb);
      let pad = blk._pad || EMPTY;
      if (data.length !== blk.length) {
        const need = padFor(blk.key, data.length, psb, 'global');
        if (need) data = vconcat([data, new Uint8Array(need)]);
        pad = EMPTY;
      }
      parts.push(vconcat([ascii4(blk.sig || '8BIM'), ascii4(blk.key), lenField(data.length, blk.isBig), data, pad]));
    } else {
      parts.push(writeBlock(blk, psb, 'global'));
    }
  }
  if (doc.globalAdditionalTail && doc.globalAdditionalTail.length) parts.push(toU8(doc.globalAdditionalTail));
  return vconcat(parts);
}









export function decodeLayerPixels(doc, buffer, index, opts = {}) {
  const u8 = toU8(buffer || doc._bytes);
  const layer = doc.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  return decodeLayerChannels(u8, {
    bounds: layer.bounds,
    opacity: layer.blend.opacity,
    mask: layer.mask && layer.mask.present ? layer.mask : null,
    channels: layer.channels.map(c => ({ id: c.id, length: c.length, _off: c._off })),
    channelDataOffset: layer._off.channelDataOffset,
  }, doc.header, opts);
}


export function decodeComposite(doc, buffer, opts = {}) {
  const u8 = toU8(buffer || doc._bytes);
  const sections = readSections(u8);
  return decodeCompositeImage(u8, doc.header, sections, opts);
}



const FX_LABELS = {
  DrSh: '投影', IrSh: '内阴影', OrGl: '外发光', IrGl: '内发光', ebbl: '斜面与浮雕',
  SoFi: '颜色叠加', GrFl: '渐变叠加', SoFl: '图案叠加', FrFX: '描边', ChFX: '光泽',
  patternFill: '图案叠加',
};

function effectSwitches(layer) {
  const d = layer.effects && layer.effects.descriptor;
  if (!d) return layer.effects ? { keys: layer.effects.keys, items: [] } : null;
  const items = [];
  for (const k of Object.keys(FX_LABELS)) {
    const v = d[k];
    if (v == null) continue;
    const list = Array.isArray(v) ? v : [v];
    for (const one of list) {
      const enabled = one && typeof one === 'object' && one['enab'] != null ? !!one['enab'] : true;
      items.push({ key: k, label: FX_LABELS[k], enabled });
    }
  }
  return { keys: layer.effects.keys, items };
}





export function summarizeDocument(doc) {
  const flat = doc.layers.map(l => {
    const kind = l.frame ? 'frame' : l.groupType === 3 ? 'divider'
      : (l.groupType === 1 || l.groupType === 2) ? 'group'
      : l.smartObject ? 'smartObject'
      : l.text ? 'text'
      : l.path ? 'shape'
      : 'raster';
    return {
      index: l.index,
      name: l.unicodeName || l.name,
      pascalName: l.name,
      bounds: { ...l.bounds },
      width: Math.max(0, l.bounds.right - l.bounds.left),
      height: Math.max(0, l.bounds.bottom - l.bounds.top),
      kind,
      section: l._section,
      visible: l.blend.visible,
      opacity: l.blend.opacity,
      clipping: !!l.blend.clipping,
      blendKey: l.blend.key,
      passThrough: l.passThroughBlendKey || null,
      groupType: l.groupType,
      frame: l.frame || null, isFrame: !!l.frame,
      locked: !!(l.additional.lspf && l.additional.lspf.flags),
      colorLabel: l.additional.lclr ? l.additional.lclr.color : null,
      layerId: l.additional.lyid ? l.additional.lyid.id : null,
      hasMask: !!(l.mask && l.mask.present),
      maskDisabled: !!(l.mask && l.mask.flagsParsed && l.mask.flagsParsed.disabled),
      hasVectorMask: !!l.path,
      vectorKnots: l.path && l.path.path ? l.path.path.records.filter(r => r.type === 'knot').length : 0,
      isSmartObject: !!l.smartObject,
      isText: !!l.text,
      text: l.text && typeof l.text.descriptor['Txt '] === 'string' ? l.text.descriptor['Txt '] : null,
      smartObject: l.smartObject
        ? { kind: l.smartObject.kind, linkId: l.smartObject.linkId, source: l.smartObject.sourceFile || null }
        : null,
      effects: effectSwitches(l),
      channels: l.channels.map(c => ({ id: c.id, kind: c.info.kind, name: c.info.name, length: c.length, compression: c.compression })),
      additionalKeys: l.additionalBlocks.map(b => b.key),
    };
  });

  
  
  const roots = [];
  const stack = [];
  for (let i = flat.length - 1; i >= 0; i--) {
    const f = flat[i];
    if (f.groupType === 3) { if (stack.length) stack.pop(); continue; }
    const node = { ...f, depth: stack.length, isGroup: false, children: null };
    const parent = stack.length ? stack[stack.length - 1].children : roots;
    if (f.groupType === 1 || f.groupType === 2) {
      node.isGroup = true;
      node.children = [];
      parent.push(node);
      stack.push(node);
    } else {
      parent.push(node);
    }
  }

  return {
    header: {
      signature: doc.header.signature, version: doc.header.version, psb: doc.header.psb,
      width: doc.header.width, height: doc.header.height,
      channels: doc.header.channels, depth: doc.header.depth,
      mode: doc.header.mode, modeName: doc.header.modeName,
    },
    colorModeData: { kind: doc.colorModeData.kind, length: doc.colorModeData.length },
    imageResources: doc.imageResources.map(r => ({ id: r.id, sig: r.sig, name: r.name, label: r.label, length: r._len })),
    layerCount: flat.length,
    layers: roots,
    flat,
    globalAdditionalKeys: doc.globalAdditional.map(b => b.key),
    linkedFiles: (doc.linkedFiles || []).map(f => ({
      id: f.id, name: f.name, type: f.type,
      fileType: (f.fileType || '').trim(), embedded: f.type === 'liFD',
      byteLength: f.bytes ? f.bytes.length : 0,
    })),
    imageData: { compression: doc.imageData ? doc.imageData.compression : null, length: doc.imageData ? doc.imageData.length : 0 },
    warnings: doc.warnings,
  };
}


























const JSON_ENVELOPE = '__psd_editorDocument';

const TAG_KEYS = ['__u8', '__ta', '__arr', '__ref', '__esc', '__undef', '__num'];
const TAG_SET = new Set(TAG_KEYS);

const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64INV =  (() => {
  const a = new Uint8Array(256).fill(255);
  for (let i = 0; i < 64; i++) a[B64C.charCodeAt(i)] = i;
  return a;
})();


function b64encode(u8) {
  const n = u8.length;
  const chunks = [];
  let s = '', i = 0;
  for (; i + 2 < n; i += 3) {
    const x = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
    s += B64C[(x >> 18) & 63] + B64C[(x >> 12) & 63] + B64C[(x >> 6) & 63] + B64C[x & 63];
    if (s.length >= 65536) { chunks.push(s); s = ''; }
  }
  const rem = n - i;
  if (rem === 1) { const x = u8[i] << 16; s += B64C[(x >> 18) & 63] + B64C[(x >> 12) & 63] + '=='; }
  else if (rem === 2) { const x = (u8[i] << 16) | (u8[i + 1] << 8); s += B64C[(x >> 18) & 63] + B64C[(x >> 12) & 63] + B64C[(x >> 6) & 63] + '='; }
  chunks.push(s);
  return chunks.join('');
}


function b64decode(str) {
  const s = String(str);
  let n = s.length;
  while (n > 0 && s.charCodeAt(n - 1) === 61) n--;          
  const out = new Uint8Array((n * 3) >> 2);
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < n; i++) {
    const c = B64INV[s.charCodeAt(i)];
    if (c === 255) continue;                                 
    acc = (acc << 6) | c; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >>> bits) & 0xff; }
  }
  return o === out.length ? out : out.slice(0, o);
}







export function documentToJSON(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('documentToJSON：缺少文档模型');
  const state = { seen: new Map(), n: 0 };
  return { [JSON_ENVELOPE]: 1, root: encodeNode(doc, state) };
}

function encodeNode(v, state) {
  if (v === undefined) return { __undef: 1 };
  if (v === null) return null;
  const t = typeof v;
  if (t === 'boolean' || t === 'string') return v;
  if (t === 'number') {
    if (Number.isFinite(v)) return Object.is(v, -0) ? { __num: '-0' } : v;
    return { __num: String(v) };                             
  }
  if (t === 'bigint') return { __num: v.toString() };
  if (t === 'function' || t === 'symbol') return { __undef: 1 };   
  if (t !== 'object') return { __undef: 1 };

  
  
  if (v instanceof String) return String(v);
  if (v instanceof Number) return encodeNode(Number(v), state);
  if (v instanceof Boolean) return Boolean(v);

  const hit = state.seen.get(v);
  if (hit !== undefined) return { __ref: hit };
  const id = state.n++;
  state.seen.set(v, id);

  if (v instanceof ArrayBuffer) return { __u8: b64encode(new Uint8Array(v)) };
  if (ArrayBuffer.isView(v)) {
    if (v instanceof Uint8Array) return { __u8: b64encode(v) };
    if (v instanceof DataView) return { __u8: b64encode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    
    return { __ta: v.constructor.name, v: Array.from(v, x => (typeof x === 'bigint' ? x.toString() : x)) };
  }

  if (Array.isArray(v)) {
    const items = v.map(x => encodeNode(x, state));
    
    const extra = Object.keys(v).filter(k => !isIndexKey(k));
    if (!extra.length) return items;
    const props = {};
    for (const k of extra) props[k] = encodeNode(v[k], state);
    return { __arr: items, __props: props };
  }

  const body = {};
  let collides = false;
  for (const k of Object.keys(v)) {
    if (typeof v[k] === 'function') continue;                
    if (TAG_SET.has(k)) collides = true;
    body[k] = encodeNode(v[k], state);
  }
  return collides ? { __esc: body } : body;
}

const isIndexKey = k => /^(0|[1-9]\d*)$/.test(k);







export function documentFromJSON(json) {
  if (!json || typeof json !== 'object') throw new Error('documentFromJSON：缺少 JSON');
  const root = Object.prototype.hasOwnProperty.call(json, JSON_ENVELOPE) ? json.root : json;
  const doc = decodeNode(root, { list: [], n: 0 });
  if (!doc || !doc.header) throw new Error('documentFromJSON：不是文档模型（缺 header）');
  
  const cm = doc.colorModeData;
  if (cm && cm.kind === 'indexed' && cm.palette && typeof cm.paletteRGB !== 'function') {
    Object.defineProperty(cm, 'paletteRGB', {
      value: () => paletteRGB(cm), enumerable: false, configurable: true, writable: true,
    });
  }
  return doc;
}

function decodeNode(v, state) {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'boolean' || t === 'string' || t === 'number') return v;
  if (t !== 'object') return v;

  if (Array.isArray(v)) {
    const arr = [];
    state.list[state.n++] = arr;
    for (const x of v) arr.push(decodeNode(x, state));
    return arr;
  }

  
  if (Object.prototype.hasOwnProperty.call(v, '__ref')) return state.list[v.__ref];
  if (Object.prototype.hasOwnProperty.call(v, '__undef')) return undefined;
  if (Object.prototype.hasOwnProperty.call(v, '__num')) {
    const s = v.__num;
    return s === 'NaN' ? NaN : s === 'Infinity' ? Infinity : s === '-Infinity' ? -Infinity : s === '-0' ? -0 : Number(s);
  }
  if (Object.prototype.hasOwnProperty.call(v, '__u8')) {
    const u8 = b64decode(v.__u8);
    state.list[state.n++] = u8;
    return u8;
  }
  if (Object.prototype.hasOwnProperty.call(v, '__ta')) {
    const Ctor = TYPED_ARRAYS[v.__ta] || Uint8Array;
    const ta = Ctor.from(v.v || []);
    state.list[state.n++] = ta;
    return ta;
  }
  if (Object.prototype.hasOwnProperty.call(v, '__arr')) {
    const arr = [];
    state.list[state.n++] = arr;
    for (const x of v.__arr) arr.push(decodeNode(x, state));
    for (const k of Object.keys(v.__props || {})) arr[k] = decodeNode(v.__props[k], state);
    return arr;
  }
  const body = Object.prototype.hasOwnProperty.call(v, '__esc') ? v.__esc : v;
  const obj = {};
  state.list[state.n++] = obj;
  for (const k of Object.keys(body)) obj[k] = decodeNode(body[k], state);
  return obj;
}

const TYPED_ARRAYS = {
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float32Array, Float64Array,
};







export function setLayerName(doc, index, name) {
  const layer = doc.layers[index];
  if (!layer) throw new Error('图层不存在: index=' + index);
  if (name == null || name === '') throw new Error('图层名不能为空');
  const blk = layer.additionalBlocks.find(b => b.key === 'luni');
  if (blk) {
    blk.model = { _key: 'luni', _kind: 'semantic', name: String(name), _units: String(name).length + 1, _tail: EMPTY };
  } else {
    const model = { _key: 'luni', _kind: 'semantic', name: String(name), _units: String(name).length + 1, _tail: EMPTY };
    const nb = { sig: '8BIM', key: 'luni', isBig: false, length: 0, _off: null, _raw: EMPTY, _pad: EMPTY, model };
    layer.additionalBlocks.unshift(nb);
    layer.additional.luni = model;
  }
  layer.unicodeName = String(name);
  return doc;
}

export default {
  parsePsdDocument, serializePsdDocument, summarizeDocument,
  decodeLayerPixels, decodeComposite, setLayerName,
  documentToJSON, documentFromJSON,
};
