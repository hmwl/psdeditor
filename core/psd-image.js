





























import { inflate, deflateStore } from './inflate.js';
import { Reader } from './psd-parse.js';



export const ColorMode = {
  BITMAP: 0, GRAYSCALE: 1, INDEXED: 2, RGB: 3,
  CMYK: 4, MULTICHANNEL: 7, DUOTONE: 8, LAB: 9
};
export const Compression = { RAW: 0, RLE: 1, ZIP: 2, ZIP_PREDICTION: 3 };

export const COLOR_MODE_NAMES = {
  0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB',
  4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab'
};


export const COLOR_CHANNELS = { 0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 7: 1, 8: 1, 9: 3 };

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;


export function rowBytes(width, depth) {
  return Math.ceil((width * depth) / 8);
}

export function channelBytes(width, height, depth) {
  return rowBytes(width, depth) * height;
}


















export function unpackBits(src, dst, dstOff, dstLen, strict = false) {
  let i = 0, o = dstOff;
  const end = dstOff + dstLen;
  while (o < end) {
    if (i >= src.length) {
      if (strict) throw new Error(`PackBits：输入提前结束（还差 ${end - o} 字节）`);
      return i;                          
    }
    const n = src[i++];
    if (n < 128) {                       
      let c = n + 1;
      if (i + c > src.length) {
        if (strict) throw new Error('PackBits：字面串越界');
        c = src.length - i;
      }
      if (o + c > end) {
        if (strict) throw new Error('PackBits：字面串超出行长');
        c = end - o;
      }
      dst.set(src.subarray(i, i + c), o);
      i += n + 1; o += c;
    } else if (n > 128) {                
      let c = 257 - n;
      if (i >= src.length) {
        if (strict) throw new Error('PackBits：重复串越界');
        return i;
      }
      if (o + c > end) {
        if (strict) throw new Error('PackBits：重复串超出行长');
        c = end - o;
      }
      dst.fill(src[i++], o, o + c);
      o += c;
    }
    
  }
  return i;
}







export function packBits(data) {
  const len = data.length;
  if (len === 0) return new Uint8Array(0);
  
  const out = new Uint8Array(len + Math.ceil(len / 128) + 1);
  let i = 0, o = 0;
  const runAt = p => { let r = 1; while (p + r < len && r < 128 && data[p + r] === data[p]) r++; return r; };
  while (i < len) {
    const run = runAt(i);
    if (run >= 3) { out[o++] = 257 - run; out[o++] = data[i]; i += run; continue; }
    const start = i;
    i += run;
    while (i < len && (i - start) < 128) {
      const r = runAt(i);
      if (r >= 3) break;                  
      if (i - start + r > 128) break;
      i += r;
    }
    const lit = i - start;
    out[o++] = lit - 1;
    out.set(data.subarray(start, start + lit), o);
    o += lit;
  }
  return out.subarray(0, o);
}










export function undoPrediction(raw, width, height, depth) {
  if (depth === 8) {
    for (let y = 0; y < height; y++) {
      const o = y * width;
      for (let x = 1; x < width; x++) raw[o + x] = (raw[o + x] + raw[o + x - 1]) & 0xff;
    }
  } else if (depth === 16) {
    
    for (let y = 0; y < height; y++) {
      const o = y * width * 2;
      let prev = (raw[o] << 8) | raw[o + 1];
      for (let x = 1; x < width; x++) {
        const p = o + x * 2;
        const v = (((raw[p] << 8) | raw[p + 1]) + prev) & 0xffff;
        raw[p] = v >>> 8; raw[p + 1] = v & 0xff;
        prev = v;
      }
    }
  } else if (depth === 32) {
    
    const rb = width * 4;
    for (let y = 0; y < height; y++) {
      const o = y * rb;
      for (let x = 1; x < rb; x++) raw[o + x] = (raw[o + x] + raw[o + x - 1]) & 0xff;
    }
    
    const row = new Uint8Array(rb);
    for (let y = 0; y < height; y++) {
      const o = y * rb;
      row.set(raw.subarray(o, o + rb));
      for (let i = 0; i < width; i++) {
        const d = o + i * 4;
        raw[d] = row[i];
        raw[d + 1] = row[width + i];
        raw[d + 2] = row[width * 2 + i];
        raw[d + 3] = row[width * 3 + i];
      }
    }
  } else {
    throw new Error(`ZIP prediction 不支持 ${depth} 位/通道`);
  }
  return raw;
}




export function applyPrediction(src, width, height, depth) {
  const raw = new Uint8Array(src);            
  if (depth === 8) {
    for (let y = 0; y < height; y++) {
      const o = y * width;
      for (let x = width - 1; x >= 1; x--) raw[o + x] = (raw[o + x] - raw[o + x - 1]) & 0xff;
    }
  } else if (depth === 16) {
    for (let y = 0; y < height; y++) {
      const o = y * width * 2;
      for (let x = width - 1; x >= 1; x--) {
        const p = o + x * 2, q = o + (x - 1) * 2;
        const v = ((((raw[p] << 8) | raw[p + 1]) - ((raw[q] << 8) | raw[q + 1])) & 0xffff);
        raw[p] = v >>> 8; raw[p + 1] = v & 0xff;
      }
    }
  } else if (depth === 32) {
    const rb = width * 4;
    const row = new Uint8Array(rb);
    
    for (let y = 0; y < height; y++) {
      const o = y * rb;
      row.set(raw.subarray(o, o + rb));
      for (let i = 0; i < width; i++) {
        const s = i * 4;
        raw[o + i] = row[s];
        raw[o + width + i] = row[s + 1];
        raw[o + width * 2 + i] = row[s + 2];
        raw[o + width * 3 + i] = row[s + 3];
      }
    }
    
    for (let y = 0; y < height; y++) {
      const o = y * rb;
      for (let x = rb - 1; x >= 1; x--) raw[o + x] = (raw[o + x] - raw[o + x - 1]) & 0xff;
    }
  } else {
    throw new Error(`ZIP prediction 不支持 ${depth} 位/通道`);
  }
  return raw;
}

















export function decompressChannelBody({ body, width, rows, depth, compression, psb = false, rowCounts = null, strict = false, onWarn = null }) {
  const rb = rowBytes(width, depth);
  const total = rb * rows;
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error(`通道尺寸非法：${width} × ${rows} @ ${depth}bit`);
  const warn = m => { if (strict) throw new Error(m); if (onWarn) onWarn(m); };

  if (compression === Compression.RAW) {
    if (body.length < total) {
      warn(`RAW 通道数据不足：${body.length} < ${total}，缺的部分按 0 处理`);
      const out = new Uint8Array(total);
      out.set(body);
      return out;
    }
    return body.subarray(0, total);
  }

  if (compression === Compression.RLE) {
    const out = new Uint8Array(total);
    let counts = rowCounts, p = 0;
    if (!counts) {
      counts = new Int32Array(rows);
      const step = psb ? 4 : 2;
      if (body.length < rows * step) throw new Error('RLE 行长表被截断');
      for (let y = 0; y < rows; y++) {
        counts[y] = psb
          ? ((body[p] << 24) | (body[p + 1] << 16) | (body[p + 2] << 8) | body[p + 3]) >>> 0
          : (body[p] << 8) | body[p + 1];
        p += step;
      }
    }
    for (let y = 0; y < rows; y++) {
      let n = counts[y];
      if (p + n > body.length) {
        warn(`RLE 第 ${y} 行数据越界（需要 ${n} 字节，只剩 ${body.length - p}）`);
        n = Math.max(0, body.length - p);
      }
      unpackBits(body.subarray(p, p + n), out, y * rb, rb, strict);
      p += n;
    }
    return out;
  }

  if (compression === Compression.ZIP || compression === Compression.ZIP_PREDICTION) {
    
    
    
    const raw = inflate(body, { expectedSize: total, limit: total * 4 + 65536 });
    let out;
    if (raw.length < total) {
      warn(`ZIP 解压后 ${raw.length} 字节 < 预期 ${total}，缺的部分按 0 处理`);
      out = new Uint8Array(total); out.set(raw);
    } else out = raw.length === total ? raw : raw.subarray(0, total);
    if (compression === Compression.ZIP_PREDICTION) {
      
      const buf = (out.buffer === raw.buffer && out.byteOffset === 0 && out.length === raw.length)
        ? out : new Uint8Array(out);
      undoPrediction(buf, width, rows, depth);
      return buf;
    }
    return out;
  }

  throw new Error(`不支持的压缩方式 ${compression}`);
}





export function compressChannelBody({ raw, width, rows, depth, compression, psb = false }) {
  const rb = rowBytes(width, depth);
  if (raw.length !== rb * rows) throw new Error(`原始字节长度 ${raw.length} ≠ 预期 ${rb * rows}`);

  if (compression === Compression.RAW) return raw instanceof Uint8Array ? raw : new Uint8Array(raw);

  if (compression === Compression.RLE) {
    const packed = [];
    let dataLen = 0;
    for (let y = 0; y < rows; y++) {
      const p = packBits(raw.subarray(y * rb, y * rb + rb));
      packed.push(p); dataLen += p.length;
    }
    const step = psb ? 4 : 2;
    const out = new Uint8Array(rows * step + dataLen);
    let o = 0;
    for (const p of packed) {
      if (psb) { out[o++] = (p.length >>> 24) & 0xff; out[o++] = (p.length >>> 16) & 0xff; out[o++] = (p.length >>> 8) & 0xff; out[o++] = p.length & 0xff; }
      else {
        if (p.length > 0xffff) throw new Error('RLE 行长超过 65535，需要用 PSB');
        out[o++] = (p.length >>> 8) & 0xff; out[o++] = p.length & 0xff;
      }
    }
    for (const p of packed) { out.set(p, o); o += p.length; }
    return out;
  }

  if (compression === Compression.ZIP) return deflateStore(raw);
  if (compression === Compression.ZIP_PREDICTION) return deflateStore(applyPrediction(raw, width, rows, depth));

  throw new Error(`不支持的压缩方式 ${compression}`);
}








export function bytesToSamples(raw, width, height, depth) {
  const n = width * height;
  if (depth === 8) {
    return raw.length === n ? raw : raw.subarray(0, n);
  }
  if (depth === 1) {
    const rb = rowBytes(width, 1);
    const out = new Uint8Array(n);
    for (let y = 0; y < height; y++) {
      const src = y * rb, dst = y * width;
      for (let x = 0; x < width; x++) out[dst + x] = (raw[src + (x >> 3)] >>> (7 - (x & 7))) & 1;
    }
    return out;
  }
  if (depth === 16) {
    const out = new Uint16Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 2) out[i] = (raw[p] << 8) | raw[p + 1];
    return out;
  }
  if (depth === 32) {
    const buf = new ArrayBuffer(n * 4);
    const u8 = new Uint8Array(buf);
    if (LITTLE_ENDIAN) {
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        u8[p] = raw[p + 3]; u8[p + 1] = raw[p + 2]; u8[p + 2] = raw[p + 1]; u8[p + 3] = raw[p];
      }
    } else {
      u8.set(raw.subarray(0, n * 4));
    }
    return new Float32Array(buf);
  }
  throw new Error(`不支持的位深 ${depth}`);
}


export function samplesToBytes(data, width, height, depth) {
  const n = width * height;
  if (depth === 8) {
    const out = new Uint8Array(n);
    out.set(data.length === n ? data : data.subarray(0, n));
    return out;
  }
  if (depth === 1) {
    const rb = rowBytes(width, 1);
    const out = new Uint8Array(rb * height);
    for (let y = 0; y < height; y++) {
      const src = y * width, dst = y * rb;
      for (let x = 0; x < width; x++) if (data[src + x]) out[dst + (x >> 3)] |= 0x80 >>> (x & 7);
    }
    return out;
  }
  if (depth === 16) {
    const out = new Uint8Array(n * 2);
    for (let i = 0, p = 0; i < n; i++, p += 2) { const v = data[i] & 0xffff; out[p] = v >>> 8; out[p + 1] = v & 0xff; }
    return out;
  }
  if (depth === 32) {
    const f = data instanceof Float32Array ? data : Float32Array.from(data);
    const src = new Uint8Array(f.buffer, f.byteOffset, n * 4);
    const out = new Uint8Array(n * 4);
    if (LITTLE_ENDIAN) {
      for (let p = 0; p < n * 4; p += 4) { out[p] = src[p + 3]; out[p + 1] = src[p + 2]; out[p + 2] = src[p + 1]; out[p + 3] = src[p]; }
    } else out.set(src);
    return out;
  }
  throw new Error(`不支持的位深 ${depth}`);
}




export function markChannelDirty(data) {
  if (data) { try { delete data._raw; } catch {  } }
  return data;
}



function rawStillMatches(data, width, height, depth, comp, psb) {
  try {
    const raw = decompressChannelBody({ body: data._raw, width, rows: height, depth, compression: comp, psb });
    const mine = samplesToBytes(data, width, height, depth);
    return sameBytes(raw.length === mine.length ? raw : raw.subarray(0, mine.length), mine);
  } catch { return false; }
}














export function decodeChannel({ bytes, width, height, depth = 8, compression, psb = false, keepRaw = true, strict = false, onWarn = null }) {
  let body = bytes, comp = compression;
  if (comp == null) {
    if (bytes.length < 2) throw new Error('通道数据不足 2 字节，读不到压缩标记');
    comp = (bytes[0] << 8) | bytes[1];
    body = bytes.subarray(2);
  }
  if (width <= 0 || height <= 0) {
    const empty = depth === 16 ? new Uint16Array(0) : depth === 32 ? new Float32Array(0) : new Uint8Array(0);
    empty._compression = comp; empty._depth = depth; empty._width = width; empty._height = height; empty._psb = psb;
    if (keepRaw) empty._raw = body;
    return empty;
  }
  const raw = decompressChannelBody({ body, width, rows: height, depth, compression: comp, psb, strict, onWarn });
  const data = bytesToSamples(raw, width, height, depth);
  data._compression = comp;
  data._depth = depth;
  data._width = width;
  data._height = height;
  data._psb = psb;
  if (keepRaw) data._raw = body;
  return data;
}














export function encodeChannel({ data, width, height, depth, compression, psb, reuseRaw = true, withHeader = false }) {
  const w = width ?? data._width, h = height ?? data._height;
  const d = depth ?? data._depth ?? 8;
  const comp = compression ?? data._compression ?? Compression.RLE;
  const isPsb = psb ?? data._psb ?? false;

  let body;
  if (w <= 0 || h <= 0) {
    body = data._raw && reuseRaw ? data._raw : new Uint8Array(0);
  } else {
    const raw = samplesToBytes(data, w, h, d);
    body = compressChannelBody({ raw, width: w, rows: h, depth: d, compression: comp, psb: isPsb });
    
    
    if (reuseRaw && data._raw && data._compression === comp
        && !sameBytes(body, data._raw) && rawStillMatches(data, w, h, d, comp, isPsb)) {
      body = data._raw;
    }
  }
  if (!withHeader) return body;
  const out = new Uint8Array(2 + body.length);
  out[0] = (comp >>> 8) & 0xff; out[1] = comp & 0xff;
  out.set(body, 2);
  return out;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}








export function readImageHeader(buffer) {
  const r = new Reader(buffer);
  const signature = r.key4();
  if (signature !== '8BPS') throw new Error('不是 PSD/PSB（签名不是 8BPS）');
  const version = r.u16();
  if (version !== 1 && version !== 2) throw new Error(`不支持的 PSD 版本 ${version}`);
  r.skip(6);
  const channels = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  if (![1, 8, 16, 32].includes(depth)) throw new Error(`不支持的位深 ${depth}`);
  return {
    signature, version, psb: version === 2, channels, width, height, depth, mode,
    modeName: COLOR_MODE_NAMES[mode] || `未知(${mode})`, _headerEnd: r.o
  };
}






export function readSections(buffer) {
  const header = readImageHeader(buffer);
  const r = new Reader(buffer, header.psb);
  r.seek(header._headerEnd);
  const cmdLen = r.u32(); const cmdOff = r.o; r.skip(cmdLen);
  const irLen = r.u32(); const irOff = r.o; r.skip(irLen);
  const lmLen = r.len32or64(); const lmOff = r.o; r.skip(lmLen);
  const idOff = r.o;
  const total = (buffer.byteLength ?? buffer.length);
  return {
    header,
    colorModeData: { off: cmdOff, len: cmdLen },
    imageResources: { off: irOff, len: irLen },
    layerAndMask: { off: lmOff, len: lmLen },
    imageData: { off: idOff, len: Math.max(0, total - idOff) }
  };
}


export function hasMergedTransparency(buffer, sections = null) {
  const sec = sections || readSections(buffer), h = sec.header;
  if (h.mode === ColorMode.MULTICHANNEL || h.channels <= (COLOR_CHANNELS[h.mode] ?? h.channels)) return false;
  const lm = sec.layerAndMask, end = lm.off + lm.len, r = new Reader(buffer, h.psb);
  if (lm.len < (h.psb ? 8 : 4)) return false;
  r.seek(lm.off);
  const size = r.len32or64(), infoStart = r.o;
  if (!Number.isSafeInteger(size) || infoStart + size > end) return false;
  if (size >= 2 && r.i16() < 0) return true;
  r.seek(infoStart + size);
  if (r.o + 4 > end) return false;
  const maskSize = r.u32();
  if (r.o + maskSize > end) return false;
  r.skip(maskSize);
  const bigKeys = new Set(['LMsk','Lr16','Lr32','Layr','Mt16','Mt32','Mtrn','Alph','FMsk','lnk2','lnkD','lnk3','lnkE','FEid','FXid','PxSD','cinf']);
  while (r.o + 12 <= end) {
    const sig = r.key4();
    if (sig !== '8BIM' && sig !== '8B64') break;
    const key = r.key4(), big = sig === '8B64' || (h.psb && bigKeys.has(key));
    if (r.o + (big ? 8 : 4) > end) break;
    const len = big ? r.u64() : r.u32(), next = r.o + len;
    if (!Number.isSafeInteger(next) || next > end) break;
    if (len >= 2 && (key === 'Layr' || (h.depth === 16 && key === 'Lr16') || (h.depth === 32 && key === 'Lr32')) && r.i16() < 0) return true;
    r.seek(next + ((4 - len % 4) % 4));
  }
  return false;
}














let paletteProvider = null;

export function setPaletteProvider(fn) {
  if (fn != null && typeof fn !== 'function') throw new TypeError('调色板 provider 必须是函数或 null');
  paletteProvider = fn || null;
}
export function getPaletteProvider() { return paletteProvider; }






export function readPalette(buffer, sections = null) {
  const sec = sections || readSections(buffer);
  let bytes = null;
  if (paletteProvider) {
    try { bytes = paletteProvider(buffer, sec.header, sec); } catch { bytes = null; }
    
    if (bytes && !ArrayBuffer.isView(bytes)) {
      return (bytes.r && bytes.g && bytes.b) ? { r: bytes.r, g: bytes.g, b: bytes.b } : null;
    }
  }
  if (!bytes) {
    if (sec.colorModeData.len < 768) return null;
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    bytes = u8.subarray(sec.colorModeData.off, sec.colorModeData.off + 768);
  }
  if (bytes.length < 768) return null;
  return { r: bytes.subarray(0, 256), g: bytes.subarray(256, 512), b: bytes.subarray(512, 768) };
}




function linearToSrgb255(c) {
  if (!(c > 0)) return 0;
  if (c >= 1) return 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

const SRGB_LUT = (() => { const t = new Uint8Array(4097); for (let i = 0; i <= 4096; i++) t[i] = linearToSrgb255(i / 4096); return t; })();
function f32To255(c) {
  if (!(c > 0)) return 0;
  if (c >= 1) return 255;
  return SRGB_LUT[(c * 4096) | 0];
}






export const SAMPLE16_PS = 65535;
export const SAMPLE16_FULL = 65535;
export const byteTo16 = (v, max = SAMPLE16_PS) => Math.round(v * max / 255);

export function detectSample16Max(_arrays) { return SAMPLE16_FULL; }





function normalizer(depth, isBitmap, sample16Max = SAMPLE16_PS) {
  if (depth === 1) return isBitmap ? (v => v ? 0 : 255) : (v => v ? 255 : 0);
  if (depth === 8) return v => v;
  if (depth === 16) { const k = 255 / sample16Max; return v => Math.min(255, Math.round(v * k)); }
  if (depth === 32) return f32To255;
  throw new Error(`不支持的位深 ${depth}`);
}


function labToRgb(L, a, bb, out) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const finv = t => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  const X = 0.9642 * finv(fx), Y = 1.0 * finv(fy), Z = 0.8249 * finv(fz);
  const r = 3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z;
  const g = -0.9787684 * X + 1.9161415 * Y + 0.0334540 * Z;
  const b = 0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z;
  out[0] = linearToSrgb255(r); out[1] = linearToSrgb255(g); out[2] = linearToSrgb255(b);
  return out;
}













export function channelsToRGBA({ planes, width, height, depth, mode, palette = null, opacity = 255, mask = null, applyMask = true, sample16Max = null }) {
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  
  const max16 = depth === 16 ? (sample16Max || detectSample16Max(Object.values(planes || {}))) : SAMPLE16_PS;
  const norm = normalizer(depth, mode === ColorMode.BITMAP, max16);
  const coverage = depth === 32 ? v => Math.max(0, Math.min(255, Math.round(v * 255))) : norm;
  const P = id => planes[id] || null;
  const p0 = P(0), p1 = P(1), p2 = P(2), p3 = P(3);
  const A = P(-1);
  const M = applyMask ? (P(-2) || P(-3)) : null;

  
  const mFlags = mask ? (mask.flags | 0) : 0;
  const mDisabled = !!(mFlags & 2);
  const mInvert = !!(mFlags & 4);
  const mw = mask ? (mask.width | 0) : width, mh = mask ? (mask.height | 0) : height;
  const mTop = mask ? (mask.top | 0) : 0, mLeft = mask ? (mask.left | 0) : 0;
  const lTop = mask ? (mask.layerTop | 0) : 0, lLeft = mask ? (mask.layerLeft | 0) : 0;
  const mDefault = mask && mask.defaultColor != null ? mask.defaultColor : 255;
  const needsPlace = !!M && (mw !== width || mh !== height || mTop !== lTop || mLeft !== lLeft);

  const tmp = [0, 0, 0];
  const inv = v => 255 - norm(v);

  
  
  if (depth === 8 && opacity === 255 && !M && !mask) {
    if (mode === ColorMode.RGB && p0 && p1 && p2) {
      for (let i = 0, o = 0; i < n; i++, o += 4) {
        rgba[o] = p0[i]; rgba[o + 1] = p1[i]; rgba[o + 2] = p2[i]; rgba[o + 3] = A ? A[i] : 255;
      }
      return rgba;
    }
    if ((mode === ColorMode.GRAYSCALE || mode === ColorMode.DUOTONE) && p0) {
      for (let i = 0, o = 0; i < n; i++, o += 4) {
        const v = p0[i];
        rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = A ? A[i] : 255;
      }
      return rgba;
    }
  }

  for (let i = 0; i < n; i++) {
    let r, g, b;
    switch (mode) {
      case ColorMode.RGB:
        r = p0 ? norm(p0[i]) : 0; g = p1 ? norm(p1[i]) : 0; b = p2 ? norm(p2[i]) : 0;
        break;
      case ColorMode.BITMAP:
      case ColorMode.GRAYSCALE:
      case ColorMode.DUOTONE:                       
        r = g = b = p0 ? norm(p0[i]) : 0;
        break;
      case ColorMode.INDEXED: {
        const idx = p0 ? (p0[i] & 0xff) : 0;        
        if (palette) { r = palette.r[idx]; g = palette.g[idx]; b = palette.b[idx]; }
        else { r = g = b = idx; }
        break;
      }
      case ColorMode.CMYK: {                        
        const c = p0 ? inv(p0[i]) : 0, m = p1 ? inv(p1[i]) : 0;
        const y = p2 ? inv(p2[i]) : 0, k = p3 ? inv(p3[i]) : 0;
        r = 255 - Math.min(255, c + k); g = 255 - Math.min(255, m + k); b = 255 - Math.min(255, y + k);
        break;
      }
      case ColorMode.MULTICHANNEL: {                
        if (p3) {
          const c = inv(p0[i]), m = inv(p1[i]), y = inv(p2[i]), k = inv(p3[i]);
          r = 255 - Math.min(255, c + k); g = 255 - Math.min(255, m + k); b = 255 - Math.min(255, y + k);
        } else if (p2) {
          r = 255 - inv(p0[i]); g = 255 - inv(p1[i]); b = 255 - inv(p2[i]);
        } else {
          r = g = b = p0 ? norm(p0[i]) : 0;         
        }
        break;
      }
      case ColorMode.LAB: {
        
        const L = (p0 ? norm(p0[i]) : 0) * 100 / 255;
        const aa = (p1 ? norm(p1[i]) : 128) - 128;
        const bb = (p2 ? norm(p2[i]) : 128) - 128;
        labToRgb(L, aa, bb, tmp);
        r = tmp[0]; g = tmp[1]; b = tmp[2];
        break;
      }
      default:
        r = p0 ? norm(p0[i]) : 0; g = p1 ? norm(p1[i]) : r; b = p2 ? norm(p2[i]) : r;
    }

    let a = A ? coverage(A[i]) : 255;
    if (M && !mDisabled) {
      let mv = mDefault;
      if (needsPlace) {
        const lx = i % width, ly = (i / width) | 0;
        const mx = (lLeft + lx) - mLeft;
        const my = (lTop + ly) - mTop;
        if (mx >= 0 && mx < mw && my >= 0 && my < mh) mv = coverage(M[my * mw + mx]);
      } else {
        mv = coverage(M[i]);
      }
      if (mInvert) mv = 255 - mv;
      a = (a * mv) / 255;
    }
    if (opacity !== 255) a = (a * opacity) / 255;

    const o = i * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
  }
  return rgba;
}



function recBounds(rec) {
  const b = rec.bounds || rec;
  const top = b.top | 0, left = b.left | 0, bottom = b.bottom | 0, right = b.right | 0;
  return { top, left, bottom, right, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function recMask(rec) {
  const m = rec.mask || rec.layerMask || null;
  if (m && m.right != null) {
    return {
      top: m.top | 0, left: m.left | 0, bottom: m.bottom | 0, right: m.right | 0,
      width: Math.max(0, (m.right | 0) - (m.left | 0)), height: Math.max(0, (m.bottom | 0) - (m.top | 0)),
      defaultColor: m.defaultColor != null ? m.defaultColor : 255,
      flags: m.flags != null ? m.flags : (m.maskFlags | 0)
    };
  }
  
  if (rec.maskW != null || rec.maskRight != null) {
    const left = rec.maskLeft | 0, top = rec.maskTop | 0;
    const width = rec.maskW != null ? rec.maskW | 0 : Math.max(0, (rec.maskRight | 0) - left);
    const height = rec.maskH != null ? rec.maskH | 0 : Math.max(0, (rec.maskBottom | 0) - top);
    return {
      top, left, bottom: top + height, right: left + width, width, height,
      defaultColor: rec.maskDefaultColor != null ? rec.maskDefaultColor : 255,
      flags: rec.maskFlags | 0
    };
  }
  return null;
}












export function decodeLayerChannels(buffer, layerRecord, header, opts = {}) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const depth = header.depth ?? 8;
  const mode = header.mode ?? ColorMode.RGB;
  const psb = header.psb ?? (header.version === 2);
  const keepRaw = opts.keepRaw !== false;
  const bounds = recBounds(layerRecord);
  const mask = recMask(layerRecord);
  const warnings = [];

  let off = layerRecord.channelDataOffset ?? layerRecord._channelDataOffset
         ?? layerRecord._channelsOff ?? layerRecord._dataOff ?? null;
  const chans = layerRecord.channels || [];
  const byId = Object.create(null);

  for (const ch of chans) {
    const id = ch.id | 0;
    const len = ch.length ?? ch.len ?? 0;
    const start = ch._off != null ? ch._off : off;
    if (start == null) throw new Error('图层记录里没有通道数据偏移（channelDataOffset 或 channel._off）');
    if (off != null) off = start + len;

    const isMask = id === -2 || id === -3;
    const cw = isMask ? (mask ? mask.width : 0) : bounds.width;
    const chh = isMask ? (mask ? mask.height : 0) : bounds.height;
    if (cw <= 0 || chh <= 0) { if (isMask) byId[id] = new Uint8Array(0); continue; }
    if (start + len > u8.length) throw new Error(`通道 ${id} 数据越界（${start}+${len} > ${u8.length}）`);
    if (len < 2) { warnings.push({ channelId: id, message: `通道 ${id} 数据只有 ${len} 字节` }); continue; }

    try {
      byId[id] = decodeChannel({
        bytes: u8.subarray(start, start + len), width: cw, height: chh, depth, psb, keepRaw,
        strict: !!opts.strict, onWarn: m => warnings.push({ channelId: id, message: m })
      });
      byId[id]._channelId = id;
    } catch (e) {
      if (opts.strict) throw new Error(`通道 ${id} 解码失败：${e.message}`);
      warnings.push({ channelId: id, message: `通道 ${id} 解码失败：${e.message}` });
    }
  }

  const palette = opts.palette !== undefined ? opts.palette
    : (mode === ColorMode.INDEXED ? readPalette(buffer) : null);

  return {
    width: bounds.width, height: bounds.height, bounds, depth, mode, psb,
    channels: byId, byId, mask,
    endOffset: off,
    ...(warnings.length ? { warnings } : {}),
    toRGBA(o = {}) {
      return channelsToRGBA({
        planes: byId, width: bounds.width, height: bounds.height, depth, mode, palette,
        opacity: o.opacity ?? layerRecord.opacity ?? 255,
        mask: mask ? { ...mask, layerTop: bounds.top, layerLeft: bounds.left } : null,
        applyMask: o.applyMask !== false, sample16Max: o.sample16Max || null,
      });
    }
  };
}












export function decodeCompositeImage(buffer, header = null, sections = null, opts = {}) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const sec = sections || readSections(buffer);
  const h = header || sec.header;
  const { width, height, depth, mode } = h;
  const psb = h.psb ?? (h.version === 2);
  const nCh = h.channels;
  const keepRaw = opts.keepRaw !== false;
  const strict = opts.strict === true;
  const warnings = [];
  const warn = m => { if (strict) throw new Error(m); warnings.push(m); };

  const off = sec.imageData.off;
  if (off + 2 > u8.length) throw new Error('Image Data 段为空');
  const compression = (u8[off] << 8) | u8[off + 1];
  let p = off + 2;

  const rb = rowBytes(width, depth);
  const perChannel = rb * height;
  const planes = [];

  if (compression === Compression.RLE) {
    
    const step = psb ? 4 : 2;
    const nRows = nCh * height;
    if (p + nRows * step > u8.length) throw new Error('Image Data 的 RLE 行长表被截断');
    const counts = new Int32Array(nRows);
    for (let i = 0; i < nRows; i++) {
      counts[i] = psb
        ? ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0
        : (u8[p] << 8) | u8[p + 1];
      p += step;
    }
    for (let c = 0; c < nCh; c++) {
      let bodyLen = 0;
      for (let y = 0; y < height; y++) bodyLen += counts[c * height + y];
      if (p + bodyLen > u8.length) {
        
        warn(`Image Data 通道 ${c} 数据越界（需要 ${bodyLen} 字节，只剩 ${u8.length - p}）`);
        bodyLen = Math.max(0, u8.length - p);
      }
      const raw = decompressChannelBody({
        body: u8.subarray(p, p + bodyLen), width, rows: height, depth,
        compression: Compression.RLE, psb, rowCounts: counts.subarray(c * height, c * height + height),
        strict, onWarn: warn
      });
      const data = bytesToSamples(raw, width, height, depth);
      data._compression = compression; data._depth = depth; data._width = width; data._height = height; data._psb = psb;
      if (keepRaw) { data._raw = u8.subarray(p, p + bodyLen); data._rowCounts = counts.slice(c * height, c * height + height); }
      planes.push(data);
      p += bodyLen;
    }
  } else if (compression === Compression.RAW) {
    for (let c = 0; c < nCh; c++) {
      let raw = u8.subarray(p, Math.min(p + perChannel, u8.length));
      if (raw.length < perChannel) {
        warn(`Image Data 通道 ${c} 数据不足（${raw.length} < ${perChannel}），缺的部分按 0 处理`);
        const pad = new Uint8Array(perChannel); pad.set(raw); raw = pad;
      }
      const data = bytesToSamples(raw, width, height, depth);
      data._compression = compression; data._depth = depth; data._width = width; data._height = height; data._psb = psb;
      if (keepRaw) data._raw = raw;
      planes.push(data);
      p += perChannel;
    }
  } else if (compression === Compression.ZIP || compression === Compression.ZIP_PREDICTION) {
    
    const body = u8.subarray(p, Math.min(off + sec.imageData.len, u8.length));
    const all = decompressChannelBody({
      body, width, rows: height * nCh, depth, compression, psb, strict, onWarn: warn
    });
    for (let c = 0; c < nCh; c++) {
      const raw = all.subarray(c * perChannel, (c + 1) * perChannel);
      const data = bytesToSamples(raw, width, height, depth);
      data._compression = compression; data._depth = depth; data._width = width; data._height = height; data._psb = psb;
      planes.push(data);
    }
  } else {
    throw new Error(`Image Data 段的压缩方式 ${compression} 不支持`);
  }

  
  
  const nColor = mode === ColorMode.MULTICHANNEL ? nCh : Math.min(nCh, COLOR_CHANNELS[mode] ?? nCh);
  const byId = Object.create(null);
  const mergedTransparency = hasMergedTransparency(buffer, sec);
  for (let c = 0; c < nCh; c++) byId[c < nColor ? c : -(c - nColor + (mergedTransparency ? 1 : 2))] = planes[c];

  const palette = opts.palette !== undefined ? opts.palette
    : (mode === ColorMode.INDEXED ? readPalette(buffer, sec) : null);

  return {
    width, height, depth, mode, psb, compression, channelCount: nCh,
    channels: planes, byId, palette,
    ...(warnings.length ? { warnings } : {}),
    toRGBA(o = {}) {
      return channelsToRGBA({
        planes: byId, width, height, depth, mode, palette,
        opacity: o.opacity ?? 255, applyMask: false, sample16Max: o.sample16Max || null,
      });
    }
  };
}










export function encodeCompositeImage({ planes, width, height, depth, compression = Compression.RLE, psb = false }) {
  const rb = rowBytes(width, depth);
  const head = new Uint8Array(2);
  head[0] = (compression >>> 8) & 0xff; head[1] = compression & 0xff;

  if (compression === Compression.RLE) {
    const step = psb ? 4 : 2;
    const rows = [];
    for (const pl of planes) {
      const raw = samplesToBytes(pl, width, height, depth);
      for (let y = 0; y < height; y++) rows.push(packBits(raw.subarray(y * rb, y * rb + rb)));
    }
    let dataLen = 0; for (const r of rows) dataLen += r.length;
    const out = new Uint8Array(2 + rows.length * step + dataLen);
    out.set(head, 0);
    let o = 2;
    for (const r of rows) {
      if (psb) { out[o++] = (r.length >>> 24) & 0xff; out[o++] = (r.length >>> 16) & 0xff; out[o++] = (r.length >>> 8) & 0xff; out[o++] = r.length & 0xff; }
      else { if (r.length > 0xffff) throw new Error('RLE 行长超过 65535，需要用 PSB'); out[o++] = (r.length >>> 8) & 0xff; out[o++] = r.length & 0xff; }
    }
    for (const r of rows) { out.set(r, o); o += r.length; }
    return out;
  }

  const all = new Uint8Array(rb * height * planes.length);
  planes.forEach((pl, i) => all.set(samplesToBytes(pl, width, height, depth), i * rb * height));
  if (compression === Compression.RAW) {
    const out = new Uint8Array(2 + all.length); out.set(head, 0); out.set(all, 2); return out;
  }
  const body = compression === Compression.ZIP_PREDICTION
    ? deflateStore(applyPrediction(all, width, height * planes.length, depth))
    : deflateStore(all);
  const out = new Uint8Array(2 + body.length); out.set(head, 0); out.set(body, 2); return out;
}

export default {
  ColorMode, Compression, COLOR_MODE_NAMES, COLOR_CHANNELS,
  rowBytes, channelBytes, unpackBits, packBits, undoPrediction, applyPrediction,
  decompressChannelBody, compressChannelBody, bytesToSamples, samplesToBytes,
  decodeChannel, encodeChannel, markChannelDirty,
  readImageHeader, readSections, readPalette, setPaletteProvider, getPaletteProvider,
  channelsToRGBA, decodeLayerChannels, decodeCompositeImage, encodeCompositeImage
};
