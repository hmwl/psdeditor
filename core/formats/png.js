






const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b, s = 0, e = b.length) { let c = 0xffffffff; for (let i = s; i < e; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function decodePNG(bytes, { inflate }) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!SIG.every((v, i) => b[i] === v)) throw new Error('不是 PNG');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8, W = 0, H = 0, depth = 0, ct = 0, interlace = 0, pal = null, trns = null; const idat = [];
  while (o + 8 <= b.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { W = dv.getUint32(o + 8); H = dv.getUint32(o + 12); depth = d[8]; ct = d[9]; interlace = d[12]; }
    else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  let n = 0; for (const c of idat) n += c.length;
  const z = new Uint8Array(n); let p = 0; for (const c of idat) { z.set(c, p); p += c.length; }
  const raw = inflate(z);
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!chans) throw new Error('不认识的 PNG 颜色类型 ' + ct);
  const bpp = Math.max(1, (chans * depth) >> 3), out = new Uint8ClampedArray(W * H * 4);
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let q = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((W - x0) / dx), ph = Math.ceil((H - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rowB = Math.ceil(pw * chans * depth / 8);
    let prev = new Uint8Array(rowB);
    for (let y = 0; y < ph; y++) {
      const f = raw[q++], line = raw.slice(q, q + rowB); q += rowB;
      for (let i = 0; i < rowB; i++) {
        const a = i >= bpp ? line[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        if (f === 1) line[i] = (line[i] + a) & 255;
        else if (f === 2) line[i] = (line[i] + up) & 255;
        else if (f === 3) line[i] = (line[i] + ((a + up) >> 1)) & 255;
        else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
      }
      prev = line;
      for (let x = 0; x < pw; x++) {
        const X = x0 + x * dx, Y = y0 + y * dy, di = (Y * W + X) * 4;
        const s = k => depth === 16 ? line[(x * chans + k) * 2] : depth === 8 ? line[x * chans + k] : ((line[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1));
        if (ct === 3) { const i = s(0); out[di] = pal[i * 3]; out[di + 1] = pal[i * 3 + 1]; out[di + 2] = pal[i * 3 + 2]; out[di + 3] = trns && i < trns.length ? trns[i] : 255; continue; }
        const sc = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
        if (ct === 0 || ct === 4) { const g = s(0) * sc; out[di] = out[di + 1] = out[di + 2] = g; out[di + 3] = ct === 4 ? s(1) : 255; if (ct === 0 && trns && depth <= 8 && s(0) === ((trns[0] << 8) | trns[1])) out[di + 3] = 0; }
        else { out[di] = s(0); out[di + 1] = s(1); out[di + 2] = s(2); out[di + 3] = ct === 6 ? s(3) : 255; }
      }
    }
  }
  return { width: W, height: H, rgba: out };
}

export function encodePNG(rgba, W, H, { deflate, alpha = null } = {}) {
  if (alpha == null) { alpha = false; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { alpha = true; break; } }
  const ch = alpha ? 4 : 3, rowB = W * ch, raw = new Uint8Array((rowB + 1) * H);
  const cur = new Uint8Array(rowB), prev = new Uint8Array(rowB), cand = [new Uint8Array(rowB), new Uint8Array(rowB), new Uint8Array(rowB)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) for (let c = 0; c < ch; c++) cur[x * ch + c] = rgba[(y * W + x) * 4 + c];
    let best = 0, bestSum = Infinity;
    [0, 1, 4].forEach((f, k) => {
      const o = cand[k]; let sum = 0;
      for (let i = 0; i < rowB; i++) {
        const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0;
        let v = cur[i];
        if (f === 1) v = (v - a) & 255;
        else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = (v - (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
        o[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = k; }
    });
    raw[y * (rowB + 1)] = [0, 1, 4][best]; raw.set(cand[best], y * (rowB + 1) + 1);
    prev.set(cur);
  }
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8); dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, W); hv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const parts = [Uint8Array.from(SIG), chunk('IHDR', ihdr), chunk('IDAT', deflate(raw)), chunk('IEND', new Uint8Array(0))];
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export default { decodePNG, encodePNG };
