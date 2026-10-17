













const td = new TextDecoder('latin1');
const u8of = b => b instanceof Uint8Array ? b : new Uint8Array(b.buffer ? b.buffer : b, b.byteOffset || 0, b.byteLength);


export function sniffFormat(bytes, name = '') {
  const b = u8of(bytes), ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  const at = (i, s) => s.split('').every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 4 && b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01) return 'exr';
  if (at(0, '#?RADIANCE') || at(0, '#?RGBE')) return 'hdr';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0 && (ext === 'ico' || ext === 'cur' || b[4] > 0)) return ext === 'cur' || b[2] === 2 ? 'cur' : 'ico';
  if (b[0] === 0x50 && b[1] >= 0x31 && b[1] <= 0x37 && (b[2] === 0x0a || b[2] === 0x0d || b[2] === 0x20 || b[2] === 0x09)) return 'pnm';
  if (at(0, 'II*\0') || at(0, 'MM\0*') || at(0, 'II+\0') || at(0, 'MM\0+')) return 'tiff';
  if (at(0, '%PDF')) return 'pdf';
  if (ext === 'tga' || ext === 'icb' || ext === 'vda' || ext === 'vst') return 'tga';
  return ext || '';
}


export function decodeTGA(bytes) {
  const b = u8of(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 18) throw new Error('TGA 文件太短');
  const idLen = b[0], cmType = b[1], type = b[2], cmFirst = dv.getUint16(3, true), cmLen = dv.getUint16(5, true), cmBits = b[7];
  const W = dv.getUint16(12, true), H = dv.getUint16(14, true), bpp = b[16], desc = b[17];
  if (!W || !H) throw new Error('TGA 尺寸为 0');
  if (![1, 2, 3, 9, 10, 11].includes(type)) throw new Error('不支持的 TGA 类型 ' + type);
  let o = 18 + idLen;
  let pal = null;
  if (cmType === 1) {
    const eb = Math.ceil(cmBits / 8); pal = [];
    for (let i = 0; i < cmLen; i++, o += eb) pal[cmFirst + i] = readTgaPixel(b, o, cmBits);
  }
  const rle = type >= 9, px = Math.ceil(bpp / 8), n = W * H;
  const raw = new Uint8Array(n * px);
  if (!rle) raw.set(b.subarray(o, o + n * px));
  else {
    let i = 0;
    while (i < n * px && o < b.length) {
      const h = b[o++], cnt = (h & 0x7f) + 1;
      if (h & 0x80) { const v = b.subarray(o, o + px); o += px; for (let k = 0; k < cnt; k++, i += px) raw.set(v, i); }
      else { const len = cnt * px; raw.set(b.subarray(o, o + len), i); o += len; i += len; }
    }
  }
  const alphaBits = desc & 0x0f, rightToLeft = !!(desc & 0x10), topDown = !!(desc & 0x20);
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * W + x) * px;
    const dy = topDown ? y : H - 1 - y, dx = rightToLeft ? W - 1 - x : x, di = (dy * W + dx) * 4;
    let c;
    if (type === 1 || type === 9) c = (pal && pal[px === 2 ? raw[si] | (raw[si + 1] << 8) : raw[si]]) || [0, 0, 0, 255];
    else if (type === 3 || type === 11) { const g = raw[si]; c = [g, g, g, bpp === 16 ? raw[si + 1] : 255]; }
    else c = readTgaPixel(raw, si, bpp);
    out[di] = c[0]; out[di + 1] = c[1]; out[di + 2] = c[2]; out[di + 3] = (bpp === 32 && !alphaBits) ? 255 : c[3];
  }
  return { width: W, height: H, rgba: out };
}
function readTgaPixel(b, o, bits) {
  if (bits === 32) return [b[o + 2], b[o + 1], b[o], b[o + 3]];
  if (bits === 24) return [b[o + 2], b[o + 1], b[o], 255];
  if (bits === 15 || bits === 16) { const v = b[o] | (b[o + 1] << 8); return [((v >> 10) & 31) * 255 / 31 | 0, ((v >> 5) & 31) * 255 / 31 | 0, (v & 31) * 255 / 31 | 0, bits === 16 && !(v & 0x8000) ? 255 : 255]; }
  if (bits === 8) return [b[o], b[o], b[o], 255];
  return [0, 0, 0, 255];
}

export function encodeTGA(rgba, W, H, { rle = true } = {}) {
  const out = []; const head = new Uint8Array(18);
  head[2] = rle ? 10 : 2; head[12] = W & 255; head[13] = W >> 8; head[14] = H & 255; head[15] = H >> 8; head[16] = 32; head[17] = 0x28;   
  out.push(head);
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { px[i * 4] = rgba[i * 4 + 2]; px[i * 4 + 1] = rgba[i * 4 + 1]; px[i * 4 + 2] = rgba[i * 4]; px[i * 4 + 3] = rgba[i * 4 + 3]; }
  if (!rle) out.push(px);
  else {
    const p32 = new Uint32Array(px.buffer), buf = [];
    for (let y = 0; y < H; y++) {           
      let x = 0;
      while (x < W) {
        const i = y * W + x;
        let run = 1; while (run < 128 && x + run < W && p32[i + run] === p32[i]) run++;
        if (run > 1) { buf.push(0x80 | (run - 1), px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]); x += run; continue; }
        let lit = 1; while (lit < 128 && x + lit < W && !(x + lit + 1 < W && p32[i + lit] === p32[i + lit + 1])) lit++;
        buf.push(lit - 1); for (let k = 0; k < lit; k++) buf.push(px[(i + k) * 4], px[(i + k) * 4 + 1], px[(i + k) * 4 + 2], px[(i + k) * 4 + 3]);
        x += lit;
      }
    }
    out.push(Uint8Array.from(buf));
  }
  out.push(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, ...'TRUEVISION-XFILE.'.split('').map(c => c.charCodeAt(0)), 0]));   
  return concatBytes(out);
}


export function decodePNM(bytes) {
  const b = u8of(bytes);
  let o = 0;
  const token = () => {
    for (;;) {
      while (o < b.length && /\s/.test(String.fromCharCode(b[o]))) o++;
      if (b[o] === 0x23) { while (o < b.length && b[o] !== 0x0a) o++; continue; }
      break;
    }
    let s = ''; while (o < b.length && !/\s/.test(String.fromCharCode(b[o]))) s += String.fromCharCode(b[o++]);
    return s;
  };
  const magic = token();
  let W, H, maxv = 1, depth = 1, tuple = '';
  if (magic === 'P7') {
    for (;;) {
      const line = readLine(); if (line == null) throw new Error('PAM 头不完整');
      const [k, ...v] = line.trim().split(/\s+/);
      if (k === 'WIDTH') W = +v[0]; else if (k === 'HEIGHT') H = +v[0]; else if (k === 'DEPTH') depth = +v[0];
      else if (k === 'MAXVAL') maxv = +v[0]; else if (k === 'TUPLTYPE') tuple = v.join(' '); else if (k === 'ENDHDR') break;
    }
  } else {
    W = +token(); H = +token();
    if (magic !== 'P1' && magic !== 'P4') maxv = +token();
    depth = magic === 'P3' || magic === 'P6' ? 3 : 1;
    o++;                                    
  }
  function readLine() { if (o >= b.length) return null; let s = ''; while (o < b.length && b[o] !== 0x0a) s += String.fromCharCode(b[o++]); o++; return s; }
  if (!(W > 0 && H > 0)) throw new Error('PNM 尺寸非法');
  const out = new Uint8ClampedArray(W * H * 4), n = W * H, wide = maxv > 255, sc = 255 / maxv;
  const ascii = magic === 'P1' || magic === 'P2' || magic === 'P3';
  let get;
  if (ascii) get = () => +token();
  else if (wide) get = () => { const v = (b[o] << 8) | b[o + 1]; o += 2; return v; };
  else get = () => b[o++];
  if (magic === 'P4') {
    const rowB = Math.ceil(W / 8);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = (b[o + y * rowB + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255; const q = (y * W + x) * 4; out[q] = out[q + 1] = out[q + 2] = v; out[q + 3] = 255; }
    return { width: W, height: H, rgba: out };
  }
  for (let i = 0; i < n; i++) {
    const q = i * 4;
    if (magic === 'P1') { const v = get() ? 0 : 255; out[q] = out[q + 1] = out[q + 2] = v; out[q + 3] = 255; continue; }
    if (depth === 1 || depth === 2) { const g = get() * sc; out[q] = out[q + 1] = out[q + 2] = g; out[q + 3] = depth === 2 ? get() * sc : 255; }
    else { out[q] = get() * sc; out[q + 1] = get() * sc; out[q + 2] = get() * sc; out[q + 3] = depth >= 4 ? get() * sc : 255; for (let k = 4; k < depth; k++) get(); }
  }
  void tuple;
  return { width: W, height: H, rgba: out };
}

export function encodePNM(rgba, W, H, kind = 'ppm') {
  const n = W * H;
  if (kind === 'pam') {
    const head = new TextEncoder().encode(`P7\nWIDTH ${W}\nHEIGHT ${H}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`);
    return concatBytes([head, new Uint8Array(rgba.buffer, rgba.byteOffset, n * 4)]);
  }
  if (kind === 'pgm') {
    const body = new Uint8Array(n);
    for (let i = 0; i < n; i++) body[i] = Math.round(rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114);
    return concatBytes([new TextEncoder().encode(`P5\n${W} ${H}\n255\n`), body]);
  }
  const body = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { body[i * 3] = rgba[i * 4]; body[i * 3 + 1] = rgba[i * 4 + 1]; body[i * 3 + 2] = rgba[i * 4 + 2]; }
  return concatBytes([new TextEncoder().encode(`P6\n${W} ${H}\n255\n`), body]);
}



export function encodeBMP(rgba, W, H, { alpha = true } = {}) {
  const bpp = alpha ? 32 : 24, rowB = alpha ? W * 4 : (W * 3 + 3) & ~3, hdr = alpha ? 108 : 40, off = 14 + hdr, size = off + rowB * H;
  const b = new Uint8Array(size), dv = new DataView(b.buffer);
  b[0] = 0x42; b[1] = 0x4d; dv.setUint32(2, size, true); dv.setUint32(10, off, true);
  dv.setUint32(14, hdr, true); dv.setInt32(18, W, true); dv.setInt32(22, H, true); dv.setUint16(26, 1, true); dv.setUint16(28, bpp, true);
  dv.setUint32(30, alpha ? 3 : 0, true); dv.setUint32(34, rowB * H, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
  if (alpha) { dv.setUint32(54, 0x00ff0000, true); dv.setUint32(58, 0x0000ff00, true); dv.setUint32(62, 0x000000ff, true); dv.setUint32(66, 0xff000000, true); dv.setUint32(70, 0x73524742, true); }   
  for (let y = 0; y < H; y++) {
    const row = off + (H - 1 - y) * rowB;
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4, d = row + x * (alpha ? 4 : 3);
      b[d] = rgba[s + 2]; b[d + 1] = rgba[s + 1]; b[d + 2] = rgba[s];
      if (alpha) b[d + 3] = rgba[s + 3];
    }
  }
  return b;
}



export function decodeICO(bytes) {
  const b = u8of(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint16(4, true), out = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + i * 16, w = b[e] || 256, h = b[e + 1] || 256, size = dv.getUint32(e + 8, true), off = dv.getUint32(e + 12, true);
    const data = b.subarray(off, off + size);
    if (data[0] === 0x89 && data[1] === 0x50) { out.push({ width: w, height: h, png: data }); continue; }
    try { out.push(decodeDIB(data, w, h)); } catch {  }
  }
  out.sort((a, c) => c.width * c.height - a.width * a.height);
  if (!out.length) throw new Error('ICO 里没有能解的图像');
  return out;
}
function decodeDIB(d, w0, h0) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const hs = dv.getUint32(0, true), W = dv.getInt32(4, true) || w0, H = Math.abs(dv.getInt32(8, true)) / 2 || h0, bpp = dv.getUint16(14, true);
  const nPal = bpp <= 8 ? (dv.getUint32(32, true) || (1 << bpp)) : 0, palOff = hs, pxOff = hs + nPal * 4;
  const rowB = ((W * bpp + 31) >> 5) << 2, maskRow = ((W + 31) >> 5) << 2, maskOff = pxOff + rowB * H;
  const out = new Uint8ClampedArray(W * H * 4);
  let anyAlpha = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = pxOff + (H - 1 - y) * rowB, q = (y * W + x) * 4;
    let c;
    if (bpp === 32) { const o = r + x * 4; c = [d[o + 2], d[o + 1], d[o], d[o + 3]]; if (d[o + 3]) anyAlpha = true; }
    else if (bpp === 24) { const o = r + x * 3; c = [d[o + 2], d[o + 1], d[o], 255]; }
    else { const idx = bpp === 8 ? d[r + x] : bpp === 4 ? (d[r + (x >> 1)] >> ((1 - (x & 1)) * 4)) & 15 : (d[r + (x >> 3)] >> (7 - (x & 7))) & 1; const p = palOff + idx * 4; c = [d[p + 2], d[p + 1], d[p], 255]; }
    out[q] = c[0]; out[q + 1] = c[1]; out[q + 2] = c[2]; out[q + 3] = c[3];
  }
  if (bpp !== 32 || !anyAlpha) {          
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = maskOff + (H - 1 - y) * maskRow + (x >> 3);
      out[(y * W + x) * 4 + 3] = m < d.length && ((d[m] >> (7 - (x & 7))) & 1) ? 0 : 255;
    }
  }
  return { width: W, height: H, rgba: out };
}

export function encodeICO(entries, { cursor = false, hotspot = [0, 0] } = {}) {
  const head = new Uint8Array(6 + entries.length * 16), dv = new DataView(head.buffer);
  dv.setUint16(2, cursor ? 2 : 1, true); dv.setUint16(4, entries.length, true);
  let off = head.length;
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    head[o] = e.width >= 256 ? 0 : e.width; head[o + 1] = e.height >= 256 ? 0 : e.height;
    if (cursor) { dv.setUint16(o + 4, hotspot[0], true); dv.setUint16(o + 6, hotspot[1], true); } else { dv.setUint16(o + 4, 1, true); dv.setUint16(o + 6, 32, true); }
    dv.setUint32(o + 8, e.png.length, true); dv.setUint32(o + 12, off, true); off += e.png.length;
  });
  return concatBytes([head, ...entries.map(e => e.png)]);
}


export function decodeHDR(bytes) {
  const b = u8of(bytes);
  let o = 0;
  const line = () => { let s = ''; while (o < b.length && b[o] !== 0x0a) s += String.fromCharCode(b[o++]); o++; return s; };
  const first = line();
  if (!/^#\?(RADIANCE|RGBE)/.test(first)) throw new Error('不是 Radiance HDR');
  let fmt = '';
  for (;;) { const l = line(); if (l === '') break; if (o >= b.length) throw new Error('HDR 头不完整'); const m = /^FORMAT=(.*)$/.exec(l); if (m) fmt = m[1].trim(); }
  if (fmt && fmt !== '32-bit_rle_rgbe') throw new Error('只支持 32-bit_rle_rgbe 格式（这是 ' + fmt + '）');
  const res = line().trim().split(/\s+/);
  let W, H, flipY = false, flipX = false;
  if (res[0].endsWith('Y')) { H = +res[1]; W = +res[3]; flipY = res[0][0] === '+'; flipX = res[2][0] === '-'; }
  else { W = +res[1]; H = +res[3]; }
  if (!(W > 0 && H > 0)) throw new Error('HDR 尺寸非法');
  const rgbe = new Uint8Array(W * H * 4), scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (W >= 8 && W < 32768 && b[o] === 2 && b[o + 1] === 2 && !(b[o + 2] & 0x80)) {      
      if (((b[o + 2] << 8) | b[o + 3]) !== W) throw new Error('HDR 扫描线宽度不对');
      o += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < W) {
          let n = b[o++];
          if (n > 128) { n -= 128; const v = b[o++]; for (let k = 0; k < n; k++) scan[(x++) * 4 + c] = v; }
          else for (let k = 0; k < n; k++) scan[(x++) * 4 + c] = b[o++];
        }
      }
    } else {                                 
      let x = 0, shift = 0;
      while (x < W) {
        const r = b[o], g = b[o + 1], bb = b[o + 2], e = b[o + 3]; o += 4;
        if (r === 1 && g === 1 && bb === 1) { const n = e << shift; for (let k = 0; k < n && x < W; k++, x++) scan.copyWithin(x * 4, (x - 1) * 4, x * 4); shift += 8; }
        else { scan[x * 4] = r; scan[x * 4 + 1] = g; scan[x * 4 + 2] = bb; scan[x * 4 + 3] = e; x++; shift = 0; }
      }
    }
    const dy = flipY ? H - 1 - y : y;
    if (!flipX) rgbe.set(scan, dy * W * 4);
    else for (let x = 0; x < W; x++) rgbe.set(scan.subarray(x * 4, x * 4 + 4), (dy * W + W - 1 - x) * 4);
  }
  const f = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const e = rgbe[i * 4 + 3];
    if (e) { const k = Math.pow(2, e - 136); f[i * 4] = rgbe[i * 4] * k; f[i * 4 + 1] = rgbe[i * 4 + 1] * k; f[i * 4 + 2] = rgbe[i * 4 + 2] * k; }
    f[i * 4 + 3] = 1;
  }
  return { width: W, height: H, float: f, linear: true };
}
export function encodeHDR(float, W, H) {
  const out = [new TextEncoder().encode(`#?RADIANCE\n# PSD Editor\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`)];
  const ch = [new Uint8Array(W), new Uint8Array(W), new Uint8Array(W), new Uint8Array(W)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = float[i], g = float[i + 1], b = float[i + 2], v = Math.max(r, g, b);
      if (!(v > 1e-32)) { ch[0][x] = ch[1][x] = ch[2][x] = ch[3][x] = 0; continue; }
      const e = Math.ceil(Math.log2(v) + 1e-9), m = Math.pow(2, -e) * 256;
      ch[0][x] = Math.min(255, r * m); ch[1][x] = Math.min(255, g * m); ch[2][x] = Math.min(255, b * m); ch[3][x] = e + 128;
    }
    if (W < 8 || W >= 32768) { const raw = new Uint8Array(W * 4); for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) raw[x * 4 + c] = ch[c][x]; out.push(raw); continue; }
    const buf = [2, 2, W >> 8, W & 255];
    for (let c = 0; c < 4; c++) {
      const a = ch[c]; let x = 0;
      while (x < W) {
        let run = 1; while (run < 127 && x + run < W && a[x + run] === a[x]) run++;
        if (run >= 3) { buf.push(128 + run, a[x]); x += run; continue; }
        let lit = 1; while (lit < 128 && x + lit < W && !(x + lit + 2 < W && a[x + lit] === a[x + lit + 1] && a[x + lit] === a[x + lit + 2])) lit++;
        buf.push(lit); for (let k = 0; k < lit; k++) buf.push(a[x + k]); x += lit;
      }
    }
    out.push(Uint8Array.from(buf));
  }
  return concatBytes(out);
}


const halfToFloat = (() => {
  const t = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
    t[h] = e === 0 ? s * Math.pow(2, -14) * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + m / 1024);
  }
  return h => t[h];
})();
function floatToHalf(v) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer); f[0] = v;
  const x = u[0], s = (x >> 16) & 0x8000; let e = ((x >> 23) & 255) - 127 + 15, m = x & 0x7fffff;
  if (((x >> 23) & 255) === 255) return s | 0x7c00 | (m ? 0x200 : 0);
  if (e >= 31) return s | 0x7c00;
  if (e <= 0) { if (e < -10) return s; m |= 0x800000; const sh = 14 - e; return s | ((m >> sh) + ((m >> (sh - 1)) & 1)); }
  return s | (e << 10) | ((m >> 13) + ((m >> 12) & 1));
}

export async function decodeEXR(bytes, { inflate } = {}) {
  const b = u8of(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== 20000630) throw new Error('不是 OpenEXR');
  const flags = dv.getUint32(4, true);
  if (flags & 0x200) throw new Error('瓦片（tiled）EXR 还不支持，请导出成扫描线 EXR');
  if (flags & 0x1000) throw new Error('多部分（multi-part）EXR 还不支持');
  let o = 8; const attrs = {};
  const cstr = () => { let s = ''; while (b[o]) s += String.fromCharCode(b[o++]); o++; return s; };
  for (;;) {
    const name = cstr(); if (!name) break;
    const type = cstr(), size = dv.getUint32(o, true); o += 4;
    const start = o;
    if (type === 'chlist') {
      const list = [];
      for (;;) { const n = cstr(); if (!n) break; const pt = dv.getInt32(o, true); o += 16; list.push({ name: n, type: pt }); }
      attrs[name] = list;
    } else if (type === 'compression') attrs[name] = b[o];
    else if (type === 'box2i') attrs[name] = [dv.getInt32(o, true), dv.getInt32(o + 4, true), dv.getInt32(o + 8, true), dv.getInt32(o + 12, true)];
    else if (type === 'lineOrder') attrs[name] = b[o];
    o = start + size;
  }
  const dw = attrs.dataWindow, comp = attrs.compression || 0, chs = attrs.channels || [];
  if (!dw) throw new Error('EXR 缺 dataWindow');
  const W = dw[2] - dw[0] + 1, H = dw[3] - dw[1] + 1;
  const linesPer = { 0: 1, 1: 1, 2: 1, 3: 16 }[comp];
  if (linesPer == null) throw new Error('EXR 压缩方式 ' + (['NONE', 'RLE', 'ZIPS', 'ZIP', 'PIZ', 'PXR24', 'B44', 'B44A', 'DWAA', 'DWAB'][comp] || comp) + ' 还不支持（支持 NONE / RLE / ZIPS / ZIP）');
  if ((comp === 2 || comp === 3) && !inflate) throw new Error('解 ZIP 压缩的 EXR 需要 inflate');
  const nBlocks = Math.ceil(H / linesPer), offsets = [];
  for (let i = 0; i < nBlocks; i++) { offsets.push(Number(dv.getBigUint64(o, true))); o += 8; }
  const sizeOf = t => (t === 1 ? 2 : 4);
  const rowBytes = chs.reduce((a, c) => a + sizeOf(c.type) * W, 0);
  const out = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) out[i * 4 + 3] = 1;
  const pick = n => chs.findIndex(c => c.name === n || c.name.endsWith('.' + n));
  const idx = { R: pick('R'), G: pick('G'), B: pick('B'), A: pick('A'), Y: pick('Y') };
  for (let bi = 0; bi < nBlocks; bi++) {
    let p = offsets[bi];
    const y0 = dv.getInt32(p, true) - dw[1], len = dv.getUint32(p + 4, true); p += 8;
    const lines = Math.min(linesPer, H - y0);
    let data = b.subarray(p, p + len);
    const expect = rowBytes * lines;
    if (comp !== 0 && len < expect) {
      let raw = comp === 1 ? exrRLE(data, expect) : await inflate(data);
      
      for (let k = 1; k < raw.length; k++) raw[k] = (raw[k - 1] + raw[k] - 128) & 255;
      const t = new Uint8Array(raw.length), half = (raw.length + 1) >> 1;
      for (let k = 0, a = 0, c = half; k < raw.length; k += 2) { t[k] = raw[a++]; if (k + 1 < raw.length) t[k + 1] = raw[c++]; }
      data = t;
    }
    const ddv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let q = 0;
    for (let ly = 0; ly < lines; ly++) {
      const y = y0 + ly;
      for (let ci = 0; ci < chs.length; ci++) {
        const t = chs[ci].type, slot = ci === idx.R ? 0 : ci === idx.G ? 1 : ci === idx.B ? 2 : ci === idx.A ? 3 : ci === idx.Y ? 4 : -1;
        for (let x = 0; x < W; x++) {
          let v;
          if (t === 1) { v = halfToFloat(ddv.getUint16(q, true)); q += 2; }
          else if (t === 2) { v = ddv.getFloat32(q, true); q += 4; }
          else { v = ddv.getUint32(q, true) / 4294967295; q += 4; }
          if (slot < 0) continue;
          const o4 = (y * W + x) * 4;
          if (slot === 4) { out[o4] = out[o4 + 1] = out[o4 + 2] = v; } else out[o4 + slot] = v;
        }
      }
    }
  }
  return { width: W, height: H, float: out, linear: true, channels: chs.map(c => c.name) };
}
function exrRLE(src, n) {
  const out = new Uint8Array(n); let i = 0, o = 0;
  while (i < src.length && o < n) {
    const c = (src[i] << 24) >> 24; i++;
    if (c < 0) { const k = -c; out.set(src.subarray(i, i + k), o); o += k; i += k; }
    else { const v = src[i++]; out.fill(v, o, o + c + 1); o += c + 1; }
  }
  return out;
}

export async function encodeEXR(float, W, H, { deflate = null } = {}) {
  const comp = deflate ? 3 : 0, linesPer = deflate ? 16 : 1, nBlocks = Math.ceil(H / linesPer);
  const enc = new TextEncoder(), parts = [];
  const attr = (name, type, payload) => parts.push(enc.encode(name + '\0' + type + '\0'), u32le(payload.length), payload);
  const chl = concatBytes(['A', 'B', 'G', 'R'].map(n => concatBytes([enc.encode(n + '\0'), u32le(1), new Uint8Array([0, 0, 0, 0]), u32le(1), u32le(1)])).concat([new Uint8Array([0])]));
  attr('channels', 'chlist', chl);
  attr('compression', 'compression', new Uint8Array([comp]));
  const box = new Uint8Array(16), bdv = new DataView(box.buffer); bdv.setInt32(8, W - 1, true); bdv.setInt32(12, H - 1, true);
  attr('dataWindow', 'box2i', box); attr('displayWindow', 'box2i', box);
  attr('lineOrder', 'lineOrder', new Uint8Array([0]));
  const par = new Float32Array([1]); attr('pixelAspectRatio', 'float', new Uint8Array(par.buffer));
  attr('screenWindowCenter', 'v2f', new Uint8Array(8));
  const swW = new Float32Array([1]); attr('screenWindowWidth', 'float', new Uint8Array(swW.buffer));
  const header = concatBytes([u32le(20000630), u32le(2), ...parts, new Uint8Array([0])]);
  const blocks = [];
  for (let bi = 0; bi < nBlocks; bi++) {
    const y0 = bi * linesPer, lines = Math.min(linesPer, H - y0), raw = new Uint8Array(lines * W * 8), rdv = new DataView(raw.buffer);
    let q = 0;
    for (let ly = 0; ly < lines; ly++) for (const c of [3, 2, 1, 0]) for (let x = 0; x < W; x++) { rdv.setUint16(q, floatToHalf(float[((y0 + ly) * W + x) * 4 + c]), true); q += 2; }
    let data = raw;
    if (deflate) {
      const half = (raw.length + 1) >> 1, t = new Uint8Array(raw.length);
      for (let k = 0, a = 0, c = half; k < raw.length; k += 2) { t[a++] = raw[k]; if (k + 1 < raw.length) t[c++] = raw[k + 1]; }
      let prev = t[0];
      for (let k = 1; k < t.length; k++) { const d = (t[k] - prev + 128 + 256) & 255; prev = t[k]; t[k] = d; }
      const z = await deflate(t);
      if (z.length < raw.length) data = z;
    }
    blocks.push(concatBytes([i32le(y0), u32le(data.length), data]));
  }
  const table = new Uint8Array(nBlocks * 8), tdv = new DataView(table.buffer);
  let off = header.length + table.length;
  blocks.forEach((bl, i) => { tdv.setBigUint64(i * 8, BigInt(off), true); off += bl.length; });
  return concatBytes([header, table, ...blocks]);
}



export function toneMapFloat(img, { exposure = 0, gamma = 0 } = {}) {
  const f = img.float, n = img.width * img.height, out = new Uint8ClampedArray(n * 4), k = Math.pow(2, exposure);
  const enc = gamma > 0 ? v => Math.pow(Math.max(0, v), 1 / gamma) : v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const lut = new Uint8ClampedArray(4097);
  for (let i = 0; i <= 4096; i++) lut[i] = Math.round(enc(i / 4096) * 255);
  const map = v => { v *= k; if (!(v > 0)) return 0; if (v >= 1) return 255; return lut[(v * 4096) | 0]; };
  for (let i = 0; i < n; i++) {
    const q = i * 4;
    out[q] = map(f[q]); out[q + 1] = map(f[q + 1]); out[q + 2] = map(f[q + 2]); out[q + 3] = Math.round(Math.max(0, Math.min(1, f[q + 3])) * 255);
  }
  return { width: img.width, height: img.height, rgba: out };
}

export function rgbaToLinearFloat(rgba, W, H) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; lut[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const out = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = lut[rgba[i * 4]]; out[i * 4 + 1] = lut[rgba[i * 4 + 1]]; out[i * 4 + 2] = lut[rgba[i * 4 + 2]]; out[i * 4 + 3] = rgba[i * 4 + 3] / 255; }
  return out;
}


function u32le(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
function i32le(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0, true); return b; }
export function concatBytes(list) {
  let n = 0; for (const p of list) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}
void td;

export default { sniffFormat, decodeTGA, encodeTGA, decodePNM, encodePNM, encodeBMP, decodeICO, encodeICO, decodeHDR, encodeHDR, decodeEXR, encodeEXR, toneMapFloat, rgbaToLinearFloat };
