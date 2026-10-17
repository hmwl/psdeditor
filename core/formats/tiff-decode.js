









const TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

export async function decodeTIFF(bytes, { inflate, page = 0 } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const le = b[0] === 0x49;
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  const big = u16(2) === 43;
  const u64 = o => Number(dv.getBigUint64(o, le));
  let ifd = big ? u64(8) : u32(4);
  const ifds = [];
  while (ifd && ifd < b.length && ifds.length < 256) {
    const n = big ? u64(ifd) : u16(ifd), entSize = big ? 20 : 12, base = ifd + (big ? 8 : 2);
    const tags = {};
    for (let i = 0; i < n; i++) {
      const e = base + i * entSize, tag = u16(e), type = u16(e + 2), cnt = big ? u64(e + 4) : u32(e + 4);
      const sz = (TYPES[type] || 1) * cnt, inline = big ? 8 : 4;
      const vo = sz <= inline ? e + (big ? 12 : 8) : (big ? u64(e + 12) : u32(e + 8));
      tags[tag] = { type, cnt, vo };
    }
    ifds.push(tags);
    ifd = big ? u64(base + n * entSize) : u32(base + n * entSize);
  }
  if (!ifds.length) throw new Error('TIFF 里没有图像目录');
  const T = ifds[Math.min(page, ifds.length - 1)];
  const vals = (tag, def) => {
    const t = T[tag]; if (!t) return def;
    const out = [];
    for (let i = 0; i < t.cnt; i++) {
      const o = t.vo + i * (TYPES[t.type] || 1);
      switch (t.type) {
        case 1: case 2: case 7: out.push(b[o]); break;
        case 3: out.push(u16(o)); break;
        case 4: case 13: out.push(u32(o)); break;
        case 16: case 18: out.push(u64(o)); break;
        case 5: out.push(u32(o) / u32(o + 4)); break;
        case 11: out.push(dv.getFloat32(o, le)); break;
        case 12: out.push(dv.getFloat64(o, le)); break;
        default: out.push(b[o]);
      }
    }
    return out;
  };
  const one = (tag, def) => { const v = vals(tag, null); return v ? v[0] : def; };
  const W = one(256), H = one(257);
  if (!(W > 0 && H > 0)) throw new Error('TIFF 尺寸非法');
  const bps = vals(258, [1]), spp = one(277, 1), comp = one(259, 1), photo = one(262, spp >= 3 ? 2 : 1);
  const planar = one(284, 1), pred = one(317, 1), sfmt = one(339, 1), extra = vals(338, []), inkSet = one(332, 1);
  const bits = bps[0];
  if (comp === 6 || comp === 7) throw new Error('JPEG 压缩的 TIFF 还不支持（存成 LZW / ZIP / 无压缩即可）');
  if (![1, 5, 8, 32946, 32773].includes(comp)) throw new Error('不支持的 TIFF 压缩方式 ' + comp);
  if ((comp === 8 || comp === 32946) && !inflate) throw new Error('解 ZIP 压缩的 TIFF 需要 inflate');
  const tiled = !!T[322];
  const tw = tiled ? one(322) : W, th = tiled ? one(323) : one(278, H);
  const offs = vals(tiled ? 324 : 273, []), cnts = vals(tiled ? 325 : 279, []);
  const isFloat = sfmt === 3;
  const bytesPS = Math.ceil(bits / 8);
  
  const nS = spp;
  const plane = new Float32Array(W * H * nS);
  const across = Math.ceil(W / tw), down = Math.ceil(H / th);
  const chunksPerPlane = across * down;
  for (let ci = 0; ci < offs.length; ci++) {
    const p = planar === 2 ? Math.floor(ci / chunksPerPlane) : -1, idx = planar === 2 ? ci % chunksPerPlane : ci;
    const cx = (idx % across) * tw, cy = Math.floor(idx / across) * th;
    const cw = tiled ? tw : W, ch = Math.min(th, H - cy) > 0 ? (tiled ? th : Math.min(th, H - cy)) : 0;
    if (!ch) continue;
    const sPer = planar === 2 ? 1 : nS;
    const rowBytes = bits === 1 ? Math.ceil(cw * sPer / 8) : cw * sPer * bytesPS, need = rowBytes * ch;
    let data = b.subarray(offs[ci], offs[ci] + (cnts[ci] || 0));
    if (comp === 5) data = lzwDecode(data, need);
    else if (comp === 8 || comp === 32946) data = await inflate(data);
    else if (comp === 32773) data = packBits(data, need);
    if (data.length < need) { const t = new Uint8Array(need); t.set(data); data = t; } else data = data.slice(0, need);
    if (pred === 2) undoHPred(data, cw, ch, sPer, bits, le);
    else if (pred === 3) data = undoFPred(data, cw, ch, sPer, bytesPS, le);
    const ddv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let y = 0; y < ch; y++) {
      const Y = cy + y; if (Y >= H) break;
      for (let x = 0; x < cw; x++) {
        const X = cx + x; if (X >= W) continue;
        for (let s = 0; s < sPer; s++) {
          const si = y * cw * sPer + x * sPer + s;
          let v;
          if (bits === 1) v = (data[y * rowBytes + (si - y * cw * sPer >> 3)] >> (7 - ((x * sPer + s) & 7))) & 1;
          else if (bits === 8) v = isFloat ? data[si] : data[si] / 255;
          else if (bits === 16) { const raw = pred === 3 ? (data[si * 2] << 8 | data[si * 2 + 1]) : ddv.getUint16(si * 2, le); v = isFloat ? half(raw) : raw / 65535; }
          else if (bits === 32) v = isFloat ? (pred === 3 ? new DataView(data.buffer, data.byteOffset + si * 4, 4).getFloat32(0, false) : ddv.getFloat32(si * 4, le)) : ddv.getUint32(si * 4, le) / 4294967295;
          else if (bits === 64 && isFloat) v = ddv.getFloat64(si * 8, le);
          else v = 0;
          plane[(Y * W + X) * nS + (planar === 2 ? p : s)] = v;
        }
      }
    }
  }
  
  const n = W * H, alphaIdx = extra.length ? (spp - extra.length) : -1, assoc = extra[0] === 1;
  const colorN = alphaIdx >= 0 ? alphaIdx : spp;
  const outF = isFloat ? new Float32Array(n * 4) : null, out = isFloat ? null : new Uint8ClampedArray(n * 4);
  const pal = photo === 3 ? vals(320, []) : null;
  for (let i = 0; i < n; i++) {
    const s = i * nS;
    let r, g, bb, a = alphaIdx >= 0 ? plane[s + alphaIdx] : 1;
    if (photo === 0 || photo === 1) { let v = plane[s]; if (photo === 0 && !isFloat) v = 1 - v; r = g = bb = v; }
    else if (photo === 3) { const k = Math.round(plane[s] * ((1 << bits) - 1)), m = 1 << bits; r = pal[k] / 65535; g = pal[k + m] / 65535; bb = pal[k + 2 * m] / 65535; }
    else if (photo === 5 && inkSet === 1 && colorN >= 4) { const c = plane[s], m = plane[s + 1], y = plane[s + 2], kk = plane[s + 3]; r = (1 - c) * (1 - kk); g = (1 - m) * (1 - kk); bb = (1 - y) * (1 - kk); }
    else if (photo === 8 && colorN >= 3) { const L = plane[s] * 100, A = (plane[s + 1] * 255 << 24 >> 24), B = (plane[s + 2] * 255 << 24 >> 24); [r, g, bb] = labToSrgb(L, A, B); }
    else { r = plane[s]; g = colorN > 1 ? plane[s + 1] : r; bb = colorN > 2 ? plane[s + 2] : r; }
    if (assoc && a > 0 && !isFloat) { r /= a; g /= a; bb /= a; }
    const q = i * 4;
    if (outF) { outF[q] = r; outF[q + 1] = g; outF[q + 2] = bb; outF[q + 3] = a; }
    else { out[q] = r * 255 + 0.5; out[q + 1] = g * 255 + 0.5; out[q + 2] = bb * 255 + 0.5; out[q + 3] = a * 255 + 0.5; }
  }
  const layered = T[37724] ? b.subarray(T[37724].vo, T[37724].vo + T[37724].cnt) : null;
  return isFloat ? { width: W, height: H, float: outF, linear: true, pages: ifds.length, layered, bits }
    : { width: W, height: H, rgba: out, pages: ifds.length, layered, bits };
}

function half(h) { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * Math.pow(2, -14) * m / 1024 : e === 31 ? (m ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + m / 1024); }
function packBits(src, n) {
  const out = new Uint8Array(n); let i = 0, o = 0;
  while (i < src.length && o < n) {
    let c = src[i++]; if (c > 127) c -= 256;
    if (c >= 0) { const k = c + 1; out.set(src.subarray(i, i + k), o); i += k; o += k; }
    else if (c !== -128) { out.fill(src[i++], o, o + 1 - c); o += 1 - c; }
  }
  return out;
}

function lzwDecode(src, n) {
  const out = new Uint8Array(n);
  let o = 0, bitPos = 0, width = 9;
  const dictPrefix = new Int32Array(4096), dictLast = new Uint8Array(4096), dictLen = new Uint16Array(4096), dictFirst = new Uint8Array(4096);
  let next = 258, prev = -1;
  for (let i = 0; i < 256; i++) { dictPrefix[i] = -1; dictLast[i] = i; dictLen[i] = 1; dictFirst[i] = i; }
  const read = () => {
    let v = 0;
    for (let k = 0; k < width; k++) { const byte = src[(bitPos + k) >> 3]; v = (v << 1) | ((byte >> (7 - ((bitPos + k) & 7))) & 1); }
    bitPos += width; return v;
  };
  const emit = code => {
    const len = dictLen[code]; let p = o + len - 1, c = code;
    if (o + len > n) { 
      const tmp = []; while (c >= 0) { tmp.push(dictLast[c]); c = dictPrefix[c]; } for (let k = tmp.length - 1; k >= 0 && o < n; k--) out[o++] = tmp[k]; return;
    }
    while (c >= 0) { out[p--] = dictLast[c]; c = dictPrefix[c]; }
    o += len;
  };
  while (o < n && (bitPos + width) <= src.length * 8) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { width = 9; next = 258; prev = -1; continue; }
    if (prev < 0) { emit(code); prev = code; continue; }
    if (code < next) {
      emit(code);
      if (next < 4096) { dictPrefix[next] = prev; dictLast[next] = dictFirst[code]; dictLen[next] = dictLen[prev] + 1; dictFirst[next] = dictFirst[prev]; next++; }
    } else {
      if (next < 4096) { dictPrefix[next] = prev; dictLast[next] = dictFirst[prev]; dictLen[next] = dictLen[prev] + 1; dictFirst[next] = dictFirst[prev]; next++; }
      emit(code);
    }
    prev = code;
    if (next + 1 >= (1 << width) && width < 12) width++;
  }
  return out;
}
function undoHPred(d, w, h, spp, bits, le) {
  if (bits === 8) { for (let y = 0; y < h; y++) { const r = y * w * spp; for (let i = spp; i < w * spp; i++) d[r + i] = (d[r + i] + d[r + i - spp]) & 255; } }
  else if (bits === 16) {
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    for (let y = 0; y < h; y++) { const r = y * w * spp; for (let i = spp; i < w * spp; i++) dv.setUint16((r + i) * 2, (dv.getUint16((r + i) * 2, le) + dv.getUint16((r + i - spp) * 2, le)) & 65535, le); }
  }
}

function undoFPred(d, w, h, spp, bps, _le) {
  const row = w * spp * bps, out = new Uint8Array(d.length);
  for (let y = 0; y < h; y++) {
    const r = y * row;
    for (let i = 1; i < row; i++) d[r + i] = (d[r + i] + d[r + i - 1]) & 255;
    const n = w * spp;
    for (let i = 0; i < n; i++) for (let k = 0; k < bps; k++) out[r + i * bps + k] = d[r + k * n + i];
  }
  return out;
}
function labToSrgb(L, a, b) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const f = t => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = 0.95047 * f(x); y = f(y); z = 1.08883 * f(z);
  const lin = [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z];
  return lin.map(v => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; });
}

export default { decodeTIFF };
