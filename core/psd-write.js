












import { patchFilterEffectsTail } from './psd-filter-effects.js';
import { SAMPLE16_PS, byteTo16, encodeChannel, decodeChannel, encodeCompositeImage, decodeCompositeImage, hasMergedTransparency, Compression } from './psd-image.js';

import { getModeCodec, displayByteToFloat, makeCodec } from './color-convert.js';
import { parseIcc } from './icc.js';
import { parsePsdDocument } from './psd-document.js';
import { parseLayerMask } from './psd-layer.js';
import { featherDensityPlane } from './mask-feather.js';
import { mergeNativePixelEdits } from './native-pixel-edit.js';
const NATIVE_EDIT_CODECS=new WeakMap();
function nativeEditCodec(bytes,intent,bpc){
  let codecs=NATIVE_EDIT_CODECS.get(bytes);if(!codecs){codecs=new Map();NATIVE_EDIT_CODECS.set(bytes,codecs);}
  const key=`${intent??0}:${bpc!==false}`;if(!codecs.has(key))codecs.set(key,makeCodec(parseIcc(bytes),{intent,bpc}));return codecs.get(key);
}

class BW {
  constructor() { this.chunks = []; this.len = 0; }
  _p(u8) { this.chunks.push(u8); this.len += u8.length; }
  u8(v) { this._p(Uint8Array.of(v & 0xff)); }
  u16(v) { this._p(Uint8Array.of((v >>> 8) & 0xff, v & 0xff)); }
  u32(v) { this._p(Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff)); }
  i16(v) { this.u16(v & 0xffff); }
  i32(v) { this.u32(v >>> 0); }
  ascii(s) { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff; this._p(a); }
  bytes(u8) { if (u8 instanceof BW) { for (const c of u8.chunks) this.chunks.push(c); this.len += u8.len; } else this._p(u8); }   
  get length() { return this.len; }
  pad(n) { const r = this.len % n; if (r) this._p(new Uint8Array(n - r)); return this; }
  build() { const out = new Uint8Array(this.len); let o = 0; for (const c of this.chunks) { out.set(c, o); o += c.length; } return out; }
}




function packBits(data, scratch) {
  const len = data.length;
  const out = scratch && scratch.length >= len + ((len + 127) >> 7) + 8 ? scratch : new Uint8Array(len + ((len + 127) >> 7) + 8);   
  let i = 0, o = 0;
  const runAt = p => { const v = data[p]; let r = 1; while (p + r < len && r < 128 && data[p + r] === v) r++; return r; };
  while (i < len) {
    const run = runAt(i);
    if (run >= 3) { out[o++] = 257 - run; out[o++] = data[i]; i += run; continue; }
    const start = i; i += run;
    while (i < len && (i - start) < 128) {
      const r = runAt(i);
      if (r >= 3) break;                       
      if (i - start + r > 128) break;
      i += r;
    }
    const lit = i - start;
    out[o++] = lit - 1;
    out.set(data.subarray(start, start + lit), o); o += lit;
  }
  return out.subarray(0, o);
}


function planes4(rgba, w, h) {
  const n = w * h, r = new Uint8Array(n), g = new Uint8Array(n), b = new Uint8Array(n), a = new Uint8Array(n);
  for (let i = 0, q = 0; i < n; i++, q += 4) { r[i] = rgba[q]; g[i] = rgba[q + 1]; b[i] = rgba[q + 2]; a[i] = rgba[q + 3]; }
  return [r, g, b, a];
}

function plane(rgba, w, h, ch) {
  const p = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) p[i] = rgba[i * 4 + ch];
  return p;
}







function float32Raw(planeData, n, isColor) {
  const out = new Uint8Array(n * 4), dv = new DataView(out.buffer);
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = isColor ? displayByteToFloat(v) : v / 255;
  for (let i = 0; i < n; i++) dv.setFloat32(i * 4, lut[planeData[i]]);
  return out;
}



function oldRowsOf(prev, w, h, psb) {
  if (!prev || prev.length < 2 || ((prev[0] << 8) | prev[1]) !== 1) return null;
  const hdr = psb ? 4 : 2, rows = new Uint32Array(h + 1);
  if (prev.length < 2 + h * hdr) return null;
  const dv = new DataView(prev.buffer, prev.byteOffset, prev.byteLength);
  let o = 2 + h * hdr;
  for (let y = 0; y < h; y++) { rows[y] = o; o += psb ? dv.getUint32(2 + y * 4) : dv.getUint16(2 + y * 2); }
  rows[h] = o;
  return o <= prev.length ? rows : null;
}
function rowEquals(prev, from, to, want, tmp) {
  let i = from, n = 0; const w = want.length;
  while (i < to) {
    const c = prev[i++];
    if (c < 128) { const len = c + 1; if (n + len > w || i + len > to) return false; for (let k = 0; k < len; k++) if (prev[i + k] !== want[n + k]) return false; i += len; n += len; }
    else if (c > 128) { const len = 257 - c, v = prev[i++]; if (n + len > w) return false; for (let k = 0; k < len; k++) if (want[n + k] !== v) return false; n += len; }
  }
  return n === w;
}
function channelRLE(planeData, w, h, depth = 8, psb = false, sample16Max = SAMPLE16_PS, isColor = true, prev = null) {
  if (depth === 32) {
    const out = new Uint8Array(2 + w * h * 4);
    out.set(float32Raw(planeData, w * h, isColor), 2);
    return out;
  }
  if (depth === 16) {
    const out = new Uint8Array(2 + w * h * 2);
    for (let i = 0; i < w * h; i++) { const v = byteTo16(planeData[i], sample16Max); out[2 + i * 2] = v >> 8; out[3 + i * 2] = v & 255; }
    return out;                    
  }
  if (depth !== 8) throw new Error(`不支持写出 ${depth} 位/通道的 PSD（仅 8/16 位）`);
  
  const cap = w + ((w + 127) >> 7) + 8, scratch = new Uint8Array(cap);
  const counts = new Uint32Array(h);
  let body = new Uint8Array(Math.max(16, (w * h) >> 1)), bl = 0;
  const old = prev ? oldRowsOf(prev, w, h, psb) : null;
  for (let y = 0; y < h; y++) {
    const row = planeData.subarray(y * w, y * w + w);
    const packed = old && rowEquals(prev, old[y], old[y + 1], row) ? prev.subarray(old[y], old[y + 1]) : packBits(row, scratch);
    if (bl + packed.length > body.length) { const t = new Uint8Array(Math.max(body.length * 2, bl + packed.length)); t.set(body.subarray(0, bl)); body = t; }
    body.set(packed, bl); bl += packed.length; counts[y] = packed.length;
  }
  const hdr = psb ? 4 : 2, out = new Uint8Array(2 + h * hdr + bl), dv = new DataView(out.buffer);
  dv.setUint16(0, 1);              
  for (let y = 0; y < h; y++) psb ? dv.setUint32(2 + y * 4, counts[y]) : dv.setUint16(2 + y * 2, counts[y]);
  out.set(body.subarray(0, bl), 2 + h * hdr);
  return out;
}

function mergedImageData(planes, W, H, depth = 8, psb = false, sample16Max = SAMPLE16_PS, nColor = planes.length) {
  const bw = new BW();
  if (depth === 32) {
    bw.u16(0);
    planes.forEach((pl, k) => bw.bytes(float32Raw(pl, W * H, k < nColor)));
    return bw.build();
  }
  if (depth === 16) {
    bw.u16(0);
    for (const pl of planes) { const b = new Uint8Array(W * H * 2); for (let i = 0; i < W * H; i++) { const v = byteTo16(pl[i], sample16Max); b[i * 2] = v >> 8; b[i * 2 + 1] = v & 255; } bw.bytes(b); }
    return bw.build();
  }
  if (depth !== 8) throw new Error(`不支持写出 ${depth} 位/通道的 PSD（仅 8/16 位）`);
  bw.u16(1);
  const packed = [];
  for (const pl of planes) for (let y = 0; y < H; y++) { const pk = packBits(pl.subarray(y * W, y * W + W)); packed.push(pk); psb ? bw.u32(pk.length) : bw.u16(pk.length); }
  for (const pk of packed) bw.bytes(pk);
  return bw.build();
}



const colorCountOf = mode => (mode === 4 ? 4 : (mode === 1 || mode === 8) ? 1 : 3);
function mergedPlanesFromRgba(mergedRgba, W, H, headerCh, mode, documentCodec) {
  if (!mergedRgba || mergedRgba.length !== W * H * 4) throw new Error('合成图尺寸与 PSD 画布不一致');
  let planes;
  const codec = documentCodec === undefined ? ((mode === 4 || mode === 9) ? getModeCodec(mode) : null) : documentCodec;
  if (codec) {
    const nc = colorCountOf(mode), pl = []; for (let c = 0; c < nc; c++) pl.push(new Uint8Array(W * H));
    const aPl = new Uint8Array(W * H), t = [0, 0, 0, 0];
    for (let i = 0; i < W * H; i++) { codec.fromRgb8(mergedRgba[i * 4], mergedRgba[i * 4 + 1], mergedRgba[i * 4 + 2], t); for (let c = 0; c < nc; c++) pl[c][i] = t[c]; aPl[i] = mergedRgba[i * 4 + 3]; }
    planes = pl; if (headerCh > nc) planes.push(aPl);
  } else if (mode === 4) {
    const cPl = new Uint8Array(W * H), mPl = new Uint8Array(W * H);
    const yPl = new Uint8Array(W * H), kPl = new Uint8Array(W * H), aPl = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = mergedRgba[i * 4] / 255, g = mergedRgba[i * 4 + 1] / 255, b = mergedRgba[i * 4 + 2] / 255;
      const k = 1 - Math.max(r, g, b), ik = 1 - k;
      cPl[i] = Math.round(255 - (ik > 1e-6 ? (1 - r - k) / ik : 0) * 255);
      mPl[i] = Math.round(255 - (ik > 1e-6 ? (1 - g - k) / ik : 0) * 255);
      yPl[i] = Math.round(255 - (ik > 1e-6 ? (1 - b - k) / ik : 0) * 255);
      kPl[i] = Math.round(255 - k * 255); aPl[i] = mergedRgba[i * 4 + 3];
    }
    planes = [cPl, mPl, yPl, kPl]; if (headerCh > 4) planes.push(aPl);
  } else if (mode === 1 || mode === 8) {
    const gPl = new Uint8Array(W * H), aPl = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      gPl[i] = Math.round(0.299 * mergedRgba[i * 4] + 0.587 * mergedRgba[i * 4 + 1] + 0.114 * mergedRgba[i * 4 + 2]);
      aPl[i] = mergedRgba[i * 4 + 3];
    }
    planes = [gPl]; if (headerCh > 1) planes.push(aPl);
  } else {
    planes = [0, 1, 2].map(ch => plane(mergedRgba, W, H, ch));
    if (headerCh >= 4) planes.push(plane(mergedRgba, W, H, 3));
  }
  while (planes.length < headerCh) planes.push(new Uint8Array(W * H).fill(255));
  return planes;
}





export function replacePsdCompositeImage(buffer, mergedRgba, options = {}) {
  const src = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  if (src.length < 30 || dv.getUint32(0) !== 0x38425053) throw new Error('不是 PSD/PSB');
  const version = dv.getUint16(4), psb = version === 2;
  if (version !== 1 && version !== 2) throw new Error(`不支持 PSD 版本 ${version}`);
  const channels = dv.getUint16(12), H = dv.getUint32(14), W = dv.getUint32(18), depth = dv.getUint16(22), mode = dv.getUint16(24);
  if (depth !== 8 && depth !== 16 && depth !== 32) throw new Error(`不支持更新 ${depth} 位/通道 PSD 的合成预览（仅 8/16/32 位）`);
  
  if (mode === 0 || mode === 2 || mode === 7) return src.slice();
  let o = 26;
  const take32 = () => { if (o + 4 > src.length) throw new Error('PSD 段长度损坏'); const n = dv.getUint32(o); o += 4; return n; };
  const skip = n => { if (!Number.isSafeInteger(n) || n < 0 || o + n > src.length) throw new Error('PSD 段长度损坏'); o += n; };
  skip(take32());                         
  skip(take32());                         
  let lmiLen;
  if (psb) { const hi = take32(), lo = take32(); lmiLen = hi * 0x100000000 + lo; }
  else lmiLen = take32();
  skip(lmiLen);                           
  let image,newChannels=channels,transparencyCountOffset=null;
  if(options.nativeComposite){
    const c=options.nativeComposite,Type=depth===16?Uint16Array:Uint8Array;
    if(mode!==4||![8,16].includes(depth)||!c.supported||c.depth!==depth||c.width!==W||c.height!==H||c.planes.length!==4||c.planes.some(p=>!(p instanceof Type)||p.length!==W*H)||!(c.alpha instanceof Type)||c.alpha.length!==W*H)throw new Error('原生CMYK合成的模式/尺寸/位深不一致');
    const max=depth===16?65535:255,parsed=parsePsdDocument(src);
    const layerInfo=parsed.layerInfo?.layers.length?parsed.layerInfo:parsed.globalAdditional.find(b=>b.layerInfo?.layers.length)?.layerInfo;
    const hadTransparency=!!(layerInfo&&layerInfo.countRaw<0),needsTransparency=hadTransparency||c.alpha.some(a=>a!==max);
    let planes=c.planes.slice();
    if(needsTransparency){
      if(!layerInfo||!layerInfo.countRaw)throw new Error('原生CMYK透明缓存缺图层计数标记');
      
      
      
      planes=planes.map(p=>Type.from(p,(v,i)=>Math.round(max-(max-v)*c.alpha[i]/max)));
      planes.push(c.alpha);transparencyCountOffset=layerInfo._off.start;
      if(!hadTransparency)newChannels++;
    }
    const extraStart=4+(hadTransparency?1:0);
    if(channels>extraStart){const previous=decodeCompositeImage(src,null,null,{strict:true});planes.push(...previous.channels.slice(extraStart,channels));}
    if(newChannels>56||planes.length!==newChannels)throw new Error('CMYK合成透明度/附加通道数量不一致');
    image=encodeCompositeImage({planes,width:W,height:H,depth,psb,compression:depth===8?Compression.RLE:Compression.RAW});
  } else {
    const nColor = colorCountOf(mode), mergedChannels = nColor + (hasMergedTransparency(src) ? 1 : 0);
    let planes = mergedPlanesFromRgba(mergedRgba, W, H, mergedChannels, mode, options.codec);
    if (channels > mergedChannels) {

      if (depth === 16) planes = planes.map(p => Uint16Array.from(p, v => byteTo16(v)));
      else if (depth === 32) planes = planes.map((p, c) => Float32Array.from(p, v => c < nColor ? displayByteToFloat(v) : v / 255));
      const previous = decodeCompositeImage(src, null, null, { strict: true });
      planes.push(...previous.channels.slice(mergedChannels));
      image = encodeCompositeImage({ planes, width: W, height: H, depth, psb, compression: depth === 8 ? Compression.RLE : Compression.RAW });
    } else image = mergedImageData(planes, W, H, depth, psb, SAMPLE16_PS, nColor);
  }
  const out = new Uint8Array(o + image.length); out.set(src.subarray(0, o)); out.set(image, o);
  if(options.nativeComposite){
    const newDv=new DataView(out.buffer);newDv.setUint16(12,newChannels);
    if(transparencyCountOffset!=null)newDv.setInt16(transparencyCountOffset,-Math.abs(dv.getInt16(transparencyCountOffset)));
  }
  return out;
}

function flattenLayers(layers, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (const L of layers) {
    if (L.hidden || !L.rgba) continue;
    const a = (L.opacity == null ? 255 : L.opacity) / 255;
    const { top, left } = L.bounds, lw = L.bounds.right - L.bounds.left, lh = L.bounds.bottom - L.bounds.top;
    for (let y = 0; y < lh; y++) {
      const gy = top + y; if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < lw; x++) {
        const gx = left + x; if (gx < 0 || gx >= w) continue;
        const si = (y * lw + x) * 4, di = (gy * w + gx) * 4;
        const sa = (L.rgba[si + 3] / 255) * a; if (sa <= 0) continue;
        const da = out[di + 3] / 255, oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++) out[di + k] = oa > 0 ? (L.rgba[si + k] * sa + out[di + k] * da * (1 - sa)) / oa : 0;
        out[di + 3] = oa * 255;
      }
    }
  }
  return out;
}

export function writePsd({ width: w, height: h, layers, composite }) {
  
  const layerBlocks = layers.map(L => {
    const lw = L.bounds.right - L.bounds.left, lh = L.bounds.bottom - L.bounds.top;
    const chans = [0, 1, 2, 3].map(ch => channelRLE(plane(L.rgba, lw, lh, ch), lw, lh));
    return { L, lw, lh, chans };
  });

  
  const rec = new BW();
  rec.i16(layers.length);
  for (const { L, lw, lh, chans } of layerBlocks) {
    const b = L.bounds;
    rec.i32(b.top); rec.i32(b.left); rec.i32(b.bottom); rec.i32(b.right);
    rec.u16(4);                                   
    const ids = [0, 1, 2, -1];
    for (let c = 0; c < 4; c++) { rec.i16(ids[c]); rec.u32(chans[c].length); }
    rec.ascii('8BIM'); rec.ascii((L.blendMode || 'norm').padEnd(4).slice(0, 4));
    rec.u8(L.opacity == null ? 255 : L.opacity); rec.u8(0); rec.u8(L.hidden ? 2 : 0); rec.u8(0);
    
    const name = L.name || 'Layer';
    const uni = new BW(); uni.u32(name.length);
    for (let i = 0; i < name.length; i++) uni.u16(name.charCodeAt(i));
    const uniBytes = uni.build();
    
    
    
    const uniPad = (4 - (uniBytes.length % 4)) % 4;
    const nameLen = 1 + name.length, namePad = (4 - (nameLen % 4)) % 4;
    const extraLen = 4 + 4 + (nameLen + namePad) + (4 + 4 + 4 + uniBytes.length + uniPad);
    rec.u32(extraLen);
    rec.u32(0);                                   
    rec.u32(0);                                   
    rec.u8(name.length); rec.ascii(name); for (let i = 0; i < namePad; i++) rec.u8(0);
    rec.ascii('8BIM'); rec.ascii('luni'); rec.u32(uniBytes.length + uniPad); rec.bytes(uniBytes);
    for (let i = 0; i < uniPad; i++) rec.u8(0);
  }
  
  const chanData = new BW();
  for (const { chans } of layerBlocks) for (const c of chans) chanData.bytes(c);

  const layerInfo = new BW();
  const recBytes = rec.build(), chanBytes = chanData.build();
  let layerInfoLen = recBytes.length + chanBytes.length;
  layerInfo.u32(layerInfoLen);
  layerInfo.bytes(recBytes); layerInfo.bytes(chanBytes);
  let liBytes = layerInfo.build();
  if (liBytes.length % 2) { const t = new Uint8Array(liBytes.length + 1); t.set(liBytes); liBytes = t; }

  const lmi = new BW();
  lmi.u32(liBytes.length + 4);                    
  lmi.bytes(liBytes);
  lmi.u32(0);                                     
  const lmiBytes = lmi.build();

  
  const comp = composite || flattenLayers(layers, w, h);
  const merged = new BW();
  merged.u16(1);                                  
  const planes = [0, 1, 2].map(ch => plane(comp, w, h, ch));
  const packedRows = [];
  for (const pl of planes) { for (let y = 0; y < h; y++) { const pk = packBits(pl.subarray(y * w, y * w + w)); packedRows.push(pk); merged.u16(pk.length); } }
  for (const pk of packedRows) merged.bytes(pk);
  const mergedBytes = merged.build();

  
  const f = new BW();
  f.ascii('8BPS'); f.u16(1); f.bytes(new Uint8Array(6));
  f.u16(3); f.u32(h); f.u32(w); f.u16(8); f.u16(3); 
  f.u32(0);                                        
  f.u32(0);                                        
  f.bytes(lmiBytes);
  f.bytes(mergedBytes);
  return f.build();
}







const align4 = x => (x % 4 === 0) ? x : x + 4 - (x % 4);
function u64Bytes(v) {
  const b = new Uint8Array(8), d = new DataView(b.buffer);
  d.setUint32(0, Math.floor(v / 0x100000000)); d.setUint32(4, v >>> 0);
  return b;
}


function unicodeBytes(s, nulTerminated = true) {
  const n = s.length + (nulTerminated ? 1 : 0);
  const b = new Uint8Array(4 + n * 2), d = new DataView(b.buffer);
  d.setUint32(0, n);
  for (let i = 0; i < s.length; i++) d.setUint16(4 + i * 2, s.charCodeAt(i));
  return b;
}

function guessFileTypeCode(b) {
  if (!b || b.length < 4) return null;
  const h = (a, c, d, e) => b[0] === a && b[1] === c && b[2] === d && b[3] === e;
  if (h(0x89, 0x50, 0x4e, 0x47)) return 'png ';
  if (h(0xff, 0xd8, 0xff, 0x00) || (b[0] === 0xff && b[1] === 0xd8)) return 'JPEG';
  if (h(0x38, 0x42, 0x50, 0x53)) return '8BPS';
  if (h(0x47, 0x49, 0x46, 0x38)) return 'GIFf';
  if (h(0x4d, 0x4d, 0x00, 0x2a) || h(0x49, 0x49, 0x2a, 0x00)) return 'TIFF';
  return null;
}
function concatBytes(list) {
  let n = 0; for (const b of list) n += b.length;
  const out = new Uint8Array(n); let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}







function patchLinkedFileBytes(tail, origin, p) {
  const off = p.off, blk = off.block;
  const rel = o => o - origin;
  if (!blk) throw new Error('内嵌源图缺少所在块位置信息');
  if (rel(off.recStart) < 0 || rel(off.recEnd) > tail.length) throw new Error('内嵌源图记录不在全局附加信息段内（偏移已失效，请重新解析）');
  if (!off.bytesLength) throw new Error('该智能对象是外部链接，没有内嵌字节可替换');

  const nb = p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes);
  if (!nb.length) throw new Error('新源图字节为空');

  const bodyStart = off.recStart + 8;                 
  const rawHead = tail.subarray(rel(bodyStart), rel(off.bytesOffset));  
  
  let nameDelta = 0, headParts;
  if (p.filename && p.filename !== p.oldFilename) {
    const nn = unicodeBytes(p.filename);
    nameDelta = nn.length - (off.nameEnd - off.nameOffset);
    headParts = [rawHead.subarray(0, off.nameOffset - bodyStart), nn, rawHead.subarray(off.nameEnd - bodyStart)];
  } else {
    headParts = [rawHead];
  }
  const head = concatBytes(headParts);
  const hdv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  
  const code = p.fileType || guessFileTypeCode(nb);
  if (code) {
    const fto = off.fileTypeOffset - bodyStart + nameDelta;
    for (let i = 0; i < 4; i++) head[fto + i] = code.charCodeAt(i);
  }
  
  const dso = off.dataSizeOffset - bodyStart + nameDelta;
  hdv.setUint32(dso, Math.floor(nb.length / 0x100000000));
  hdv.setUint32(dso + 4, nb.length >>> 0);

  
  const body = concatBytes([head, nb, tail.subarray(rel(off.bytesOffset + off.bytesLength), rel(off.recEnd))]);
  const newSize = body.length;
  
  
  
  const recPad = (4 - (newSize % 4)) % 4;

  
  
  
  const before = tail.subarray(0, rel(off.recStart));
  const midAfter = tail.subarray(rel(off.recEnd), rel(blk.dataOffset + blk.dataLength));
  const newBlockContent = concatBytes([before, u64Bytes(newSize), body, new Uint8Array(recPad), midAfter]);
  
  const blockBodyLen = newBlockContent.length - rel(blk.dataOffset);
  const newBlockPad = (4 - (blockBodyLen % 4)) % 4;
  const newBlockLen = blockBodyLen + newBlockPad;

  const out = concatBytes([newBlockContent, new Uint8Array(newBlockPad), tail.subarray(rel(blk.end))]);
  if (blk.isBig) out.set(u64Bytes(newBlockLen), rel(blk.lenOffset));
  else new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(rel(blk.lenOffset), newBlockLen);
  return out;
}
























function originalMaskPlane(u8, dv, rec, depth, psb) {
  const es = rec.afterChanInfo + 16;
  if (es + 4 > u8.length) return null;
  const maskLen = dv.getUint32(es);
  if (maskLen < 18 || es + 4 + maskLen > u8.length) return null;
  const flags = u8[es + 4 + 16 + 1];
  if (flags & 2) return null;                     
  const chan = rec.channels.find(c => c.id === -2) || rec.channels.find(c => c.id === -3);
  if (!chan || !chan.len || chan.len < 2 || chan._off == null) return null;
  const top = dv.getInt32(es + 4), left = dv.getInt32(es + 4 + 4);
  const bottom = dv.getInt32(es + 4 + 8), right = dv.getInt32(es + 4 + 12);
  const w = right - left, h = bottom - top;
  if (w < 0 || h < 0) return null;
  const samples = w && h ? decodeChannel({ bytes: u8.subarray(chan._off, chan._off + chan.len), width: w, height: h, depth, psb, strict: true }) : new Uint8Array(0);
  const gray = depth === 8 ? samples : Uint8Array.from(samples, v => Math.round(v * 255 / (depth === 16 ? 65535 : 1)));
  const params = flags & 0x10 ? parseLayerMask(u8.subarray(es + 4, es + 4 + maskLen), { withLength: false }).parameters : null;
  return { gray, w, h, left, top, flags, defaultColor: u8[es + 4 + 16], density: params?.userMaskDensity, feather: params?.userMaskFeather };
}




function unmultiplyMask(rgba, bounds, m) {
  const W = bounds.right - bounds.left, H = bounds.bottom - bounds.top;
  if (m.feather > 0.2 || m.density != null && m.density < 255) {
    const plane = featherDensityPlane({ ...m, width: m.w, height: m.h }, { ...bounds, width: W, height: H }, m.feather, m.density);
    m = { ...m, ...plane, w: W, h: H };
  }
  const out = new Uint8ClampedArray(rgba);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = bounds.left + x, dy = bounds.top + y;
    const ox = dx - m.left;
    const oy = dy - m.top;
    let v = m.defaultColor;
    if (ox >= 0 && ox < m.w && oy >= 0 && oy < m.h) v = m.gray[oy * m.w + ox];
    if (m.flags & 4) v = 255 - v;
    if (v >= 255) continue;
    out[(y * W + x) * 4 + 3] = v <= 0 ? 0 : Math.min(255, Math.round(out[(y * W + x) * 4 + 3] * 255 / v));
  }
  return out;
}

export function rebuildPsdReplacingLayerPixels(buffer, layerIndex, newRgba, newBounds, mergedRgba, opts = {}) {
  const u8src = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dv = new DataView(u8src.buffer, u8src.byteOffset, u8src.byteLength);
  const rd = { o: 0 };
  const u16 = () => { const v = dv.getUint16(rd.o); rd.o += 2; return v; };
  const i16 = () => { const v = dv.getInt16(rd.o); rd.o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(rd.o); rd.o += 4; return v; };
  const i32 = () => { const v = dv.getInt32(rd.o); rd.o += 4; return v; };
  const u64 = () => { const hi = u32(), lo = u32(); return hi * 0x100000000 + lo; };

  if (dv.getUint32(0) !== 0x38425053) throw new Error('不是 PSD');
  const version = dv.getUint16(4); const psb = version === 2;
  const depth = dv.getUint16(22);
  if (depth !== 8 && depth !== 16 && depth !== 32) throw new Error(`不支持 ${depth} 位/通道的 PSD（仅 8/16/32 位）`);
  if (opts.premultiplied && depth !== 8 && !opts.nativePlanes && !opts.nativeSource)
    throw new Error(`预乘蒙版写回暂不支持 ${depth} 位文档；请传入未预乘的 nativePlanes/nativeSource，避免破坏高位深原始像素`);
  const lenPSB = () => psb ? u64() : u32();
  rd.o = 26;
  rd.o += 4 + u32();                       
  const irStart = rd.o; rd.o += 4 + u32(); 
  const prefixEnd = rd.o;                  
  const lmiLen = lenPSB(); const lmiEnd = rd.o + lmiLen;
  const liLen = lenPSB(); const liEnd = rd.o + liLen;
  let count = i16(); const layerCount = Math.abs(count);

  const recs = [];
  for (let i = 0; i < layerCount; i++) {
    const recStart = rd.o;
    const top = i32(), left = i32(), bottom = i32(), right = i32();
    const nch = u16();
    const channels = [];
    for (let c = 0; c < nch; c++) { const id = i16(); const len = lenPSB(); channels.push({ id, len }); }
    const afterChanInfo = rd.o;
    rd.o += 4;                              
    rd.o += 4;                              
    rd.o += 4;                              
    const extraLen = u32(); rd.o += extraLen;
    const recEnd = rd.o;
    recs.push({ recStart, top, left, bottom, right, nch, channels, afterChanInfo, recEnd });
  }
  
  for (const r of recs) {
    r.chanDataStart = rd.o;
    let off = rd.o;
    for (const ch of r.channels) { ch._off = off; off += ch.len; }
    rd.o = off;
    r.chanDataEnd = rd.o;
  }
  const globalTailStart = liEnd;            
  let globalTail = u8src.subarray(globalTailStart, lmiEnd);
  
  if (opts.sourcePatch) globalTail = patchLinkedFileBytes(globalTail, globalTailStart, opts.sourcePatch);
  
  
  if (opts.filterEffectsPatch) globalTail = patchFilterEffectsTail(globalTail, psb, dv.getUint16(24), opts.filterEffectsPatch);
  const merged = u8src.subarray(lmiEnd);    

  
  const lw = newBounds.right - newBounds.left, lh = newBounds.bottom - newBounds.top;
  const mode = dv.getUint16(24);
  const isCmyk = mode === 4;
  const isGray = mode === 1 || mode === 8;          
  const codec = opts.codec === undefined ? ((mode === 4 || mode === 9) ? getModeCodec(mode) : null) : opts.codec;

  
  
  
  
  let encodeRgba = newRgba;
  if (opts.premultiplied && depth === 8 && !opts.nativePlanes && !opts.nativeSource) {
    const m = originalMaskPlane(u8src, dv, recs[layerIndex], depth, psb);
    if (m) encodeRgba = unmultiplyMask(newRgba, newBounds, m);
  }

  let newChans, newChanIds;
  const sourceCodec=mode===4&&opts.nativeProfile?nativeEditCodec(opts.nativeProfile,opts.nativeIntent,opts.nativeBpc):codec;
  const nativePlanes = opts.nativePlanes || (opts.nativeSource ? mergeNativePixelEdits(opts.nativeSource, opts.displaySource, newRgba, lw, lh, depth, mode, sourceCodec) : null);
  if (nativePlanes) {
    
    const nc = isCmyk ? 4 : isGray ? 1 : 3;
    newChanIds = [...Array.from({ length: nc }, (_, i) => i), -1];
    newChans = newChanIds.map(id => {
      const data = nativePlanes[id];
      const validType = depth === 32 ? data instanceof Float32Array : depth === 16 ? data instanceof Uint16Array : data instanceof Uint8Array || data instanceof Uint8ClampedArray;
      if (!validType || data.length !== lw * lh) throw new Error(`原生通道 ${id} 的类型/尺寸与 ${depth} 位文档不一致`);
      return encodeChannel({ data, width: lw, height: lh, depth, psb, compression: depth === 8 ? Compression.RLE : Compression.RAW, reuseRaw: false, withHeader: true });
    });
  } else if (codec) {
    const nc = colorCountOf(mode), pl = []; for (let c = 0; c < nc; c++) pl.push(new Uint8Array(lw * lh));
    const aPl = new Uint8Array(lw * lh), t = [0, 0, 0, 0];
    for (let i = 0; i < lw * lh; i++) { codec.fromRgb8(encodeRgba[i * 4], encodeRgba[i * 4 + 1], encodeRgba[i * 4 + 2], t); for (let c = 0; c < nc; c++) pl[c][i] = t[c]; aPl[i] = encodeRgba[i * 4 + 3]; }
    newChans = [...pl, aPl].map((p, k) => channelRLE(p, lw, lh, depth, psb, SAMPLE16_PS, k < pl.length));
    newChanIds = [...pl.map((_, c) => c), -1];
  } else if (isCmyk) {
    const cPl = new Uint8Array(lw * lh), mPl = new Uint8Array(lw * lh);
    const yPl = new Uint8Array(lw * lh), kPl = new Uint8Array(lw * lh);
    const aPl = new Uint8Array(lw * lh);
    for (let i = 0; i < lw * lh; i++) {
      const r = encodeRgba[i * 4] / 255, g = encodeRgba[i * 4 + 1] / 255, b = encodeRgba[i * 4 + 2] / 255;
      const k = 1 - Math.max(r, g, b);
      const ik = 1 - k;
      const c = ik > 1e-6 ? (1 - r - k) / ik : 0;
      const m = ik > 1e-6 ? (1 - g - k) / ik : 0;
      const y = ik > 1e-6 ? (1 - b - k) / ik : 0;
      cPl[i] = Math.round(255 - c * 255);
      mPl[i] = Math.round(255 - m * 255);
      yPl[i] = Math.round(255 - y * 255);
      kPl[i] = Math.round(255 - k * 255);
      aPl[i] = encodeRgba[i * 4 + 3];
    }
    newChans = [
      channelRLE(cPl, lw, lh, depth, psb),
      channelRLE(mPl, lw, lh, depth, psb),
      channelRLE(yPl, lw, lh, depth, psb),
      channelRLE(kPl, lw, lh, depth, psb),
      channelRLE(aPl, lw, lh, depth, psb, SAMPLE16_PS, false)
    ];
    newChanIds = [0, 1, 2, 3, -1];
  } else if (isGray) {
    const gPl = new Uint8Array(lw * lh), aPl = new Uint8Array(lw * lh);
    for (let i = 0; i < lw * lh; i++) {
      gPl[i] = Math.round(0.299 * encodeRgba[i * 4] + 0.587 * encodeRgba[i * 4 + 1] + 0.114 * encodeRgba[i * 4 + 2]);
      aPl[i] = encodeRgba[i * 4 + 3];
    }
    newChans = [
      channelRLE(gPl, lw, lh, depth, psb),
      channelRLE(aPl, lw, lh, depth, psb, SAMPLE16_PS, false)
    ];
    newChanIds = [0, -1];
  } else {
    
    const r0 = recs[layerIndex];
    const sameGeo = depth === 8 && r0 && r0.right - r0.left === lw && r0.bottom - r0.top === lh;
    const prevOf = id => { if (!sameGeo) return null; const c = r0.channels.find(x => x.id === id); return c ? u8src.subarray(c._off, c._off + c.len) : null; };
    const pl = planes4(encodeRgba, lw, lh);
    newChans = [3, 0, 1, 2].map(ch => channelRLE(pl[ch], lw, lh, depth, psb, SAMPLE16_PS, ch !== 3, prevOf(ch === 3 ? -1 : ch))); 
    newChanIds = [-1, 0, 1, 2];
  }

  
  const KEPT = new Set(newChanIds);

  
  const li = new BW();
  li.i16(count < 0 ? -layerCount : layerCount);
  for (let i = 0; i < layerCount; i++) {
    const r = recs[i];
    if (i === layerIndex) {
      r.kept = r.channels.filter(ch => !KEPT.has(ch.id));
      li.i32(newBounds.top); li.i32(newBounds.left); li.i32(newBounds.bottom); li.i32(newBounds.right);
      li.u16(newChanIds.length + r.kept.length);
      for (let c = 0; c < newChanIds.length; c++) { li.i16(newChanIds[c]); if (psb) { li.u32(0); li.u32(newChans[c].length); } else li.u32(newChans[c].length); }
      for (const ch of r.kept) { li.i16(ch.id); if (psb) { li.u32(0); li.u32(ch.len); } else li.u32(ch.len); }
      li.bytes(u8src.subarray(r.afterChanInfo, r.recEnd));
    } else {
      li.bytes(u8src.subarray(r.recStart, r.recEnd));      
    }
  }
  for (let i = 0; i < layerCount; i++) {
    const r = recs[i];
    if (i === layerIndex) {
      for (const c of newChans) li.bytes(c);
      for (const ch of (r.kept || [])) li.bytes(u8src.subarray(ch._off, ch._off + ch.len));
    }
    else li.bytes(u8src.subarray(r.chanDataStart, r.chanDataEnd));
  }
  
  const liBytes = li.pad(4);         

  
  const out = new BW();
  out.bytes(u8src.subarray(0, prefixEnd));  
  
  const lmi = new BW();
  if (psb) { lmi.u32(0); lmi.u32(liBytes.length); } else lmi.u32(liBytes.length);
  lmi.bytes(liBytes);
  lmi.bytes(globalTail);
  const lmiBytes = lmi.pad(psb ? 4 : 2);              
  if (psb) { out.u32(0); out.u32(lmiBytes.length); } else out.u32(lmiBytes.length);
  out.bytes(lmiBytes);
  out.bytes(merged);
  const result = out.build();
  return mergedRgba ? replacePsdCompositeImage(result, mergedRgba, { codec }) : result;
}



















export function rebuildPsdChannels(buffer, layerPlanes, merged, opts = {}) {
  const u8src = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dv = new DataView(u8src.buffer, u8src.byteOffset, u8src.byteLength);
  const rd = { o: 0 };
  const u16 = () => { const v = dv.getUint16(rd.o); rd.o += 2; return v; };
  const i16 = () => { const v = dv.getInt16(rd.o); rd.o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(rd.o); rd.o += 4; return v; };
  const i32 = () => { const v = dv.getInt32(rd.o); rd.o += 4; return v; };
  const u64 = () => { const hi = u32(), lo = u32(); return hi * 0x100000000 + lo; };
  if (dv.getUint32(0) !== 0x38425053) throw new Error('不是 PSD');
  const psb = dv.getUint16(4) === 2;
  const depth = dv.getUint16(22);
  if (depth !== 8 && depth !== 16 && depth !== 32) throw new Error(`不支持 ${depth} 位/通道的 PSD（仅 8/16/32 位）`);
  if (opts.premultiplied && depth !== 8 && !opts.nativePlanes && !opts.nativeSource)
    throw new Error(`预乘蒙版写回暂不支持 ${depth} 位文档；请传入未预乘的 nativePlanes/nativeSource，避免破坏高位深原始像素`);
  const lenPSB = () => psb ? u64() : u32();
  const cmyk = (opts.colorMode || 'rgb') === 'cmyk';
  const nColor = cmyk ? 4 : 3;

  rd.o = 26;
  const cmStart = rd.o; rd.o += 4 + u32();              
  const irStart = rd.o; const irLen = u32(); const irEnd = rd.o + irLen; rd.o = irEnd;   
  const lmiLen = lenPSB(); const lmiEnd = rd.o + lmiLen;
  const liLen = lenPSB(); const liEnd = rd.o + liLen;
  const count = i16(); const layerCount = Math.abs(count);
  const recs = [];
  for (let i = 0; i < layerCount; i++) {
    const recStart = rd.o;
    const top = i32(), left = i32(), bottom = i32(), right = i32();
    const nch = u16(); const channels = [];
    for (let c = 0; c < nch; c++) { const id = i16(); const len = lenPSB(); channels.push({ id, len }); }
    const afterChanInfo = rd.o;
    rd.o += 12; const extraLen = u32(); rd.o += extraLen;
    recs.push({ recStart, top, left, bottom, right, channels, afterChanInfo, recEnd: rd.o });
  }
  for (const r of recs) { r.chanDataStart = rd.o; let off = rd.o; for (const ch of r.channels) { ch._off = off; off += ch.len; } rd.o = off; r.chanDataEnd = rd.o; }
  let globalTail = u8src.subarray(liEnd, lmiEnd);
  for (const sp of (opts.sourcePatches || [])) globalTail = patchLinkedFileBytes(globalTail, liEnd, sp);
  
  for (const fp of (opts.filterEffectsPatches || [])) globalTail = patchFilterEffectsTail(globalTail, psb, cmyk ? 4 : dv.getUint16(24), fp);

  
  const li = new BW();
  li.i16(count);
  const encoded = new Map();
  for (let i = 0; i < layerCount; i++) {
    const r = recs[i], e = layerPlanes.get(i);
    if (!e) {
      if (cmyk) throw new Error(`CMYK 模式需要提供全部图层的通道平面（缺图层 ${i}）`);
      li.bytes(u8src.subarray(r.recStart, r.recEnd)); continue;
    }
    const b = e.bounds, lw = b.right - b.left, lh = b.bottom - b.top;
    const colorIds = Array.from({ length: nColor }, (_, k) => k);
    const wanted = [-1, ...colorIds];
    const chans = wanted.map(id => {
      const pl = e.planes.find(p => p.id === id);
      const data = pl ? pl.data : new Uint8Array(lw * lh).fill(id === -1 ? 255 : 0);
      return { id, rle: lw > 0 && lh > 0 ? channelRLE(data, lw, lh, depth, psb, SAMPLE16_PS, id >= 0) : Uint8Array.of(0, 0) };
    });
    const kept = r.channels.filter(ch => ch.id < -1);          
    encoded.set(i, { chans, kept });
    li.i32(b.top); li.i32(b.left); li.i32(b.bottom); li.i32(b.right);
    li.u16(chans.length + kept.length);
    for (const c of chans) { li.i16(c.id); if (psb) { li.u32(0); li.u32(c.rle.length); } else li.u32(c.rle.length); }
    for (const ch of kept) { li.i16(ch.id); if (psb) { li.u32(0); li.u32(ch.len); } else li.u32(ch.len); }
    li.bytes(u8src.subarray(r.afterChanInfo, r.recEnd));
  }
  for (let i = 0; i < layerCount; i++) {
    const r = recs[i], e = encoded.get(i);
    if (!e) { li.bytes(u8src.subarray(r.chanDataStart, r.chanDataEnd)); continue; }
    for (const c of e.chans) li.bytes(c.rle);
    for (const ch of e.kept) li.bytes(u8src.subarray(ch._off, ch._off + ch.len));
  }
  const liBytes = li.pad(4);

  
  const W = dv.getUint32(18), H = dv.getUint32(14);
  const mplanes = merged.planes;                 
  if (mplanes.length < nColor) throw new Error(`合成图需要 ${nColor} 个颜色平面`);
  const mergedNew = mergedImageData(mplanes, W, H, depth, psb, SAMPLE16_PS, nColor);

  
  const head = u8src.slice(0, cmStart);
  const hv = new DataView(head.buffer);
  hv.setUint16(12, mplanes.length);             
  hv.setUint16(24, cmyk ? 4 : hv.getUint16(24)); 
  const colorModeData = u8src.subarray(cmStart, irStart);
  let resources = u8src.subarray(irStart + 4, irEnd);
  if (opts.icc) resources = replaceImageResource(resources, 1039, opts.icc);

  const out = new BW();
  out.bytes(head); out.bytes(colorModeData);
  out.u32(resources.length); out.bytes(resources);
  const lmi = new BW();
  if (psb) { lmi.u32(0); lmi.u32(liBytes.length); } else lmi.u32(liBytes.length);
  lmi.bytes(liBytes); lmi.bytes(globalTail);
  const lmiBytes = lmi.pad(psb ? 4 : 2);
  if (psb) { out.u32(0); out.u32(lmiBytes.length); } else out.u32(lmiBytes.length);
  out.bytes(lmiBytes);
  out.bytes(mergedNew);
  return out.build();
}










const isPathResourceId = id => id === 1025 || (id >= 2000 && id <= 2997);

export function writeImageResource(buffer, id, data, opts = {}) {
  const u8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0) !== 0x38425053) throw new Error('不是 PSD');
  let o = 26; o += 4 + dv.getUint32(o);                    
  const irLenOff = o, irLen = dv.getUint32(o), irStart = o + 4, irEnd = irStart + irLen;
  let res = replaceImageResource(u8.subarray(irStart, irEnd), id, data, opts.name);
  
  
  
  
  for (let pad = 1; !opts.exact && !isPathResourceId(id) && (res.length - irLen) % 4 && pad <= 4; pad++) {
    const padded = new Uint8Array(data.length + pad); padded.set(data, 0);
    res = replaceImageResource(u8.subarray(irStart, irEnd), id, padded, opts.name);
  }
  const out = new Uint8Array(irStart + res.length + (u8.length - irEnd));
  out.set(u8.subarray(0, irStart), 0); out.set(res, irStart); out.set(u8.subarray(irEnd), irStart + res.length);
  new DataView(out.buffer).setUint32(irLenOff, res.length);
  return out.buffer;
}






export function writeThumbnail(buffer, jpeg, width, height) {
  const widthBytes = Math.floor((width * 24 + 31) / 32) * 4;
  const head = new Uint8Array(28), hd = new DataView(head.buffer);
  hd.setUint32(0, 1);                       
  hd.setUint32(4, width); hd.setUint32(8, height);
  hd.setUint32(12, widthBytes);
  hd.setUint32(16, widthBytes * height);    
  hd.setUint32(20, jpeg.length);            
  hd.setUint16(24, 24); hd.setUint16(26, 1); 
  const data = new Uint8Array(28 + jpeg.length); data.set(head, 0); data.set(jpeg, 28);
  let out = writeImageResource(buffer, 1036, data);
  
  return removeImageResource(out, 1033);
}
export function removeImageResource(buffer, id) {
  const u8 = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 26; o += 4 + dv.getUint32(o);
  const irLenOff = o, irLen = dv.getUint32(o), irStart = o + 4, irEnd = irStart + irLen;
  const resources = u8.subarray(irStart, irEnd);
  const rdv = new DataView(resources.buffer, resources.byteOffset, resources.byteLength);
  const parts = []; let p = 0, found = false;
  while (p + 12 <= resources.length) {
    const start = p;
    if (rdv.getUint32(p) !== 0x3842494d) break;
    const rid = rdv.getUint16(p + 4); p += 6;
    const nameLen = resources[p]; p += 1 + nameLen; if ((1 + nameLen) % 2) p++;
    const len = rdv.getUint32(p); p += 4 + len; if (len % 2) p++;
    if (rid === id) found = true; else parts.push(resources.subarray(start, Math.min(p, resources.length)));
  }
  if (!found) return u8.buffer;
  const res = concatBytes(parts);
  const out = new Uint8Array(irStart + res.length + (u8.length - irEnd));
  out.set(u8.subarray(0, irStart), 0); out.set(res, irStart); out.set(u8.subarray(irEnd), irStart + res.length);
  new DataView(out.buffer).setUint32(irLenOff, res.length);
  return out.buffer;
}



function pascalNameBytes(name) {
  if (!name) return new Uint8Array(2);
  
  const str = String(name).slice(0, 255);
  const raw = Uint8Array.from(str, ch => ch.charCodeAt(0) & 255);
  const out = new Uint8Array((1 + raw.length) % 2 ? raw.length + 2 : raw.length + 1);
  out[0] = raw.length; out.set(raw, 1);
  return out;
}
function replaceImageResource(resources, id, data, name) {
  const parts = [];
  const dv = new DataView(resources.buffer, resources.byteOffset, resources.byteLength);
  let o = 0;
  while (o + 12 <= resources.length) {
    const start = o;
    if (dv.getUint32(o) !== 0x3842494d) break;    
    const rid = dv.getUint16(o + 4); o += 6;
    const nameLen = resources[o]; o += 1 + nameLen; if ((1 + nameLen) % 2) o++;
    const len = dv.getUint32(o); o += 4 + len; if (len % 2) o++;
    if (rid !== id) parts.push(resources.subarray(start, Math.min(o, resources.length)));
  }
  const nm = pascalNameBytes(name);
  const hdr = new Uint8Array(6 + nm.length + 4), hd = new DataView(hdr.buffer);
  hd.setUint32(0, 0x3842494d); hd.setUint16(4, id); hdr.set(nm, 6); hd.setUint32(6 + nm.length, data.length);
  parts.push(hdr, data instanceof Uint8Array ? data : new Uint8Array(data));
  if (data.length % 2) parts.push(new Uint8Array(1));
  return concatBytes(parts);
}

export default { writePsd, rebuildPsdReplacingLayerPixels, rebuildPsdChannels };
