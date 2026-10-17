























import {
  readSections, readImageHeader, decodeCompositeImage, encodeCompositeImage,
  COLOR_CHANNELS, ColorMode, Compression, detectSample16Max, byteTo16, SAMPLE16_PS,
} from './psd-image.js';
import { parseImageResources, resourceHandler } from './psd-resources.js';
import { writeImageResource } from './psd-write.js';

const toU8 = b => (b instanceof Uint8Array ? b : new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer, b.byteOffset || 0, b.byteLength));


function colorChannelCount(header) {
  return header.mode === ColorMode.MULTICHANNEL ? header.channels : Math.min(header.channels, COLOR_CHANNELS[header.mode] ?? header.channels);
}


function resourceList(u8, sec) {
  return parseImageResources(u8.subarray(sec.imageResources.off, sec.imageResources.off + sec.imageResources.len)) || [];
}
function resourceModel(list, id) {
  const r = list.find(x => x.id === id);
  if (!r) return null;
  if (r.data !== undefined && r.data !== null) return r.data;
  const h = resourceHandler(id);
  if (!h || !h.read || !r._raw) return null;
  try { return h.read(new Uint8Array(r._raw)); } catch { return null; }
}

function putResource(buf, id, model) {
  const h = resourceHandler(id);
  if (!h || !h.write) throw new Error(`图像资源 ${id} 没有写入口径`);
  return writeImageResource(buf, id, h.write(model), { exact: true });
}




function auxAligned(arr, n) {
  if (!Array.isArray(arr)) return null;
  if (arr.length === n) return arr.slice();
  if (arr.length > n) return arr.slice(0, n);
  return null;                                   
}







export function hasMergedTransparency(buffer) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const lm = sec.layerAndMask;
  const w = sec.header.psb ? 8 : 4;
  if (!lm || lm.len < w + 2) return false;
  const o = lm.off;
  let infoLen = 0;
  for (let k = 0; k < w; k++) infoLen = infoLen * 256 + u8[o + k];
  if (infoLen < 2) return false;
  const cnt = (u8[o + w] << 8) | u8[o + w + 1];
  return (cnt & 0x8000) !== 0 && sec.header.channels > colorChannelCount(sec.header);
}
export function listAlphaChannels(buffer) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const merged = hasMergedTransparency(u8);
  const nColor = colorChannelCount(sec.header);
  const n = Math.max(0, sec.header.channels - nColor);
  if (!n) return [];
  const list = resourceList(u8, sec);
  const pascal = resourceModel(list, 1006);
  const uni = resourceModel(list, 1045);
  const ids = resourceModel(list, 1053);
  const disp = resourceModel(list, 1077) || resourceModel(list, 1007);
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = (uni && uni.names && uni.names[i]) || (pascal && pascal.names && pascal.names[i]) || `Alpha ${i + 1}`;
    out.push({
      at: i, index: nColor + i, name,
      identifier: ids && ids.identifiers ? (ids.identifiers[i] ?? null) : null,
      display: disp && disp.channels ? (disp.channels[i] || null) : null,
      transparency: merged && i === 0,              
    });
  }
  return out;
}





export function readAlphaChannel(buffer, at) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const nColor = colorChannelCount(sec.header);
  const n = sec.header.channels - nColor;
  if (!(at >= 0 && at < n)) return null;
  const img = decodeCompositeImage(u8, sec.header, sec, { keepRaw: false });
  const plane = img.channels[nColor + at];
  const { width, height, depth } = sec.header;
  const gray = new Uint8Array(width * height);
  if (depth === 8) gray.set(plane.subarray(0, gray.length));
  else if (depth === 16) {
    const max = detectSample16Max([plane]) || SAMPLE16_PS;
    for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, Math.round(plane[i] * 255 / max)));
  } else {
    for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, Math.round(plane[i] * 255)));
  }
  const meta = listAlphaChannels(u8)[at];
  return { name: meta ? meta.name : `Alpha ${at + 1}`, width, height, gray };
}


function grayToPlane(gray, width, height, depth, sample16Max) {
  const n = width * height;
  if (gray.length !== n) throw new RangeError(`gray 长度 ${gray.length} ≠ ${width}×${height} = ${n}`);
  if (depth === 8) return Uint8Array.from(gray);
  if (depth === 16) { const out = new Uint16Array(n); for (let i = 0; i < n; i++) out[i] = byteTo16(gray[i], sample16Max); return out; }
  if (depth === 32) { const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = gray[i] / 255; return out; }   
  throw new Error(`还不支持在 ${depth} 位/通道的文档里增删 Alpha 通道（只做了 8 / 16 / 32 位）`);
}


function rewriteChannels(u8, sec, planes) {
  const { width, height, depth, psb } = sec.header;
  const compression = (u8[sec.imageData.off] << 8) | u8[sec.imageData.off + 1];
  const body = encodeCompositeImage({
    planes, width, height, depth,
    
    
    compression: compression === Compression.RAW || depth === 32 ? Compression.RAW : Compression.RLE,   
    psb,
  });
  const out = new Uint8Array(sec.imageData.off + body.length);
  out.set(u8.subarray(0, sec.imageData.off), 0);
  out.set(body, sec.imageData.off);
  new DataView(out.buffer).setUint16(12, planes.length);      
  return out;
}











const utf8 = new TextEncoder();
function latin1For(name) {
  const s = String(name);
  if (!/[^\x00-\x7f]/.test(s)) return s.slice(0, 255);
  let bytes = utf8.encode(s);
  if (bytes.length > 255) {                       
    let end = 255;
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
    bytes = bytes.subarray(0, end);
  }
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}


function writeNameResources(buf, names, list) {
  let out = putResource(buf, 1006, { names: names.map(latin1For) });
  const old = resourceModel(list, 1045);
  out = putResource(out, 1045, { names: names.map(n => String(n).slice(0, 255)), _tail: old && old._tail ? old._tail : null });
  return out;
}






export function addAlphaChannel(buffer, o = {}) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const { width, height, depth } = sec.header;
  const nColor = colorChannelCount(sec.header);
  const n = sec.header.channels - nColor;
  if (sec.header.mode === ColorMode.MULTICHANNEL)
    throw new Error('多通道模式下每条通道都是油墨，没有「Alpha 通道」这回事');
  const img = decodeCompositeImage(u8, sec.header, sec, { keepRaw: false });
  const planes = img.channels.slice();
  const sample16Max = depth === 16 ? (detectSample16Max(planes) || SAMPLE16_PS) : 0;
  const gray = o.gray || new Uint8Array(width * height);
  planes.push(grayToPlane(gray, width, height, depth, sample16Max));

  let out = rewriteChannels(u8, sec, planes);
  const list = resourceList(u8, sec);
  const names = listAlphaChannels(u8).map(c => c.name);
  names.push(o.name && String(o.name).trim() ? String(o.name).trim() : `Alpha ${n + 1}`);
  out = toU8(writeNameResources(out.buffer, names, list));

  
  const ids = resourceModel(list, 1053);
  const idsN = ids && auxAligned(ids.identifiers, n);
  if (idsN) {
    const next = (idsN.length ? Math.max(...idsN) : 0) + 1;
    out = toU8(putResource(out.buffer, 1053, { identifiers: [...idsN, next], _tail: ids._tail || null }));
  }
  for (const rid of [1077, 1007]) {
    const d = resourceModel(list, rid);
    const ch = d && auxAligned(d.channels, n);
    if (!ch) continue;
    
    if (!ch.length) continue;
    out = toU8(putResource(out.buffer, rid, { ...d, channels: [...ch, JSON.parse(JSON.stringify(ch[ch.length - 1]))] }));
  }
  return out;
}


export function removeAlphaChannel(buffer, at) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const nColor = colorChannelCount(sec.header);
  const n = sec.header.channels - nColor;
  if (!(at >= 0 && at < n)) throw new RangeError(`没有第 ${at + 1} 条 Alpha 通道（一共 ${n} 条）`);
  const img = decodeCompositeImage(u8, sec.header, sec, { keepRaw: false });
  const planes = img.channels.slice();
  planes.splice(nColor + at, 1);

  let out = rewriteChannels(u8, sec, planes);
  const list = resourceList(u8, sec);
  const names = listAlphaChannels(u8).map(c => c.name);
  names.splice(at, 1);
  out = toU8(writeNameResources(out.buffer, names, list));
  const ids = resourceModel(list, 1053);
  const idsN = ids && auxAligned(ids.identifiers, n);
  if (idsN) { idsN.splice(at, 1); out = toU8(putResource(out.buffer, 1053, { identifiers: idsN, _tail: ids._tail || null })); }
  for (const rid of [1077, 1007]) {
    const d = resourceModel(list, rid);
    const ch = d && auxAligned(d.channels, n);
    if (!ch) continue;
    ch.splice(at, 1);
    out = toU8(putResource(out.buffer, rid, { ...d, channels: ch }));
  }
  return out;
}


export function renameAlphaChannel(buffer, at, name) {
  const u8 = toU8(buffer);
  const chans = listAlphaChannels(u8);
  if (!(at >= 0 && at < chans.length)) throw new RangeError(`没有第 ${at + 1} 条 Alpha 通道（一共 ${chans.length} 条）`);
  const names = chans.map(c => c.name);
  names[at] = String(name || '').trim() || names[at];
  const sec = readSections(u8);
  return toU8(writeNameResources(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), names, resourceList(u8, sec)));
}


export function setAlphaChannel(buffer, at, gray) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const { width, height, depth } = sec.header;
  const nColor = colorChannelCount(sec.header);
  const n = sec.header.channels - nColor;
  if (!(at >= 0 && at < n)) throw new RangeError(`没有第 ${at + 1} 条 Alpha 通道（一共 ${n} 条）`);
  const img = decodeCompositeImage(u8, sec.header, sec, { keepRaw: false });
  const planes = img.channels.slice();
  const sample16Max = depth === 16 ? (detectSample16Max(planes) || SAMPLE16_PS) : 0;
  planes[nColor + at] = grayToPlane(gray, width, height, depth, sample16Max);
  return rewriteChannels(u8, sec, planes);
}








export const CHANNEL_KIND = { masked: 0, selected: 1, spot: 2 };
export const DEFAULT_ALPHA_DISPLAY = Object.freeze({ colorSpace: 0, components: [65535, 0, 0, 0], opacity: 50, mode: 0 });

export function alphaDisplays(buffer) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const n = Math.max(0, sec.header.channels - colorChannelCount(sec.header));
  const d = resourceModel(resourceList(u8, sec), 1077);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = d && Array.isArray(d.channels) ? d.channels[i] : null;
    out.push(c ? { colorSpace: c.colorSpace, components: c.components.slice(), opacity: c.opacity, mode: c.mode } : { ...DEFAULT_ALPHA_DISPLAY, components: DEFAULT_ALPHA_DISPLAY.components.slice() });
  }
  return out;
}

export function setAlphaDisplay(buffer, at, disp) {
  const u8 = toU8(buffer);
  const sec = readSections(u8);
  const list = resourceList(u8, sec);
  const all = alphaDisplays(u8);
  if (!(at >= 0 && at < all.length)) throw new RangeError(`没有第 ${at + 1} 条额外通道（一共 ${all.length} 条）`);
  const cur = all[at];
  all[at] = {
    colorSpace: disp.colorSpace != null ? disp.colorSpace | 0 : cur.colorSpace,
    components: Array.isArray(disp.components) ? [0, 1, 2, 3].map(k => Math.max(0, Math.min(65535, Math.round(disp.components[k] || 0)))) : cur.components,
    opacity: disp.opacity != null ? Math.max(0, Math.min(100, Math.round(disp.opacity))) : cur.opacity,
    mode: disp.mode != null ? disp.mode | 0 : cur.mode,
  };
  const old = resourceModel(list, 1077);
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  return toU8(putResource(buf, 1077, { version: old && old.version != null ? old.version : 1, channels: all, _tail: old && old._tail ? old._tail : null }));
}

export const rgbDisplayColor = rgb => ({ colorSpace: 0, components: [0, 1, 2].map(k => Math.round((rgb[k] || 0) * 257)).concat(0) });






export function buildFlatPsd({ width, height, mode, planes }) {
  const n = planes.length, size = width * height;
  if (!(width > 0 && height > 0) || !n || planes.some(p => !p || p.length < size)) throw new Error('buildFlatPsd：尺寸或通道数据不对');
  const out = new Uint8Array(26 + 4 + 4 + 4 + 2 + n * size);
  const dv = new DataView(out.buffer);
  out.set([0x38, 0x42, 0x50, 0x53], 0); dv.setUint16(4, 1);
  dv.setUint16(12, n); dv.setUint32(14, height); dv.setUint32(18, width); dv.setUint16(22, 8); dv.setUint16(24, mode);
  
  let o = 26 + 12;
  dv.setUint16(o, 0); o += 2;                 
  for (const p of planes) { out.set(p.subarray(0, size), o); o += size; }
  return out.buffer;
}
export default { listAlphaChannels, readAlphaChannel, addAlphaChannel, removeAlphaChannel, renameAlphaChannel, setAlphaChannel, alphaDisplays, setAlphaDisplay, buildFlatPsd };
