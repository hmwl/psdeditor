

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];
const DC_L_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_L_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DC_C_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_C_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_L_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_L_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const AC_C_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_C_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

function scaleTable(base, quality) {
  const q = Math.max(1, Math.min(100, Math.round(quality || 90)));
  const s = q < 50 ? 5000 / q : 200 - q * 2;
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) out[i] = Math.max(1, Math.min(255, Math.floor((base[i] * s + 50) / 100)));
  return out;
}
function huffTable(bits, vals) {
  const codes = new Uint16Array(256), lens = new Uint8Array(256);
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) { codes[vals[k]] = code++; lens[vals[k]] = len; k++; }
    code <<= 1;
  }
  return { codes, lens };
}
const COS = new Float32Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++)
  COS[u * 8 + x] = Math.cos((2 * x + 1) * u * Math.PI / 16) * (u ? 0.5 : Math.SQRT1_2 * 0.5);

class BitWriter {
  constructor() {
    this.buf = new Uint8Array(1 << 20); this.n = 0; this.parts = [];
    this.acc = 0; this.nbits = 0;
  }
  ensure(n) {
    if (this.n + n <= this.buf.length) return;
    if (this.n) this.parts.push(this.buf.subarray(0, this.n));
    this.buf = new Uint8Array(Math.max(1 << 20, n)); this.n = 0;
  }
  byte(b) {
    this.ensure(1); this.buf[this.n++] = b & 255;
    if ((b & 255) === 0xFF) { this.ensure(1); this.buf[this.n++] = 0; }
  }
  bits(code, len) {
    if (!len) return;
    this.acc = (this.acc << len) | (code & ((1 << len) - 1));
    this.nbits += len;
    while (this.nbits >= 8) { this.nbits -= 8; this.byte((this.acc >>> this.nbits) & 255); }
    this.acc &= (1 << this.nbits) - 1;
  }
  flush() { if (this.nbits) this.bits((1 << (8 - this.nbits)) - 1, 8 - this.nbits); }
  take() { if (this.n) this.parts.push(this.buf.subarray(0, this.n)); this.buf = null; this.n = 0; return this.parts; }
}
function u16(v) { return [(v >> 8) & 255, v & 255]; }
function seg(marker, body) { return [0xFF, marker, ...u16(body.length + 2), ...body]; }
function dht(tableClassId, bits, vals) { return [tableClassId, ...bits, ...vals]; }
function header(width, height, q0, q1) {
  const out = [0xFF, 0xD8];
  out.push(...seg(0xE0, [0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  const dqt = [0x00, ...ZIGZAG.map(i => q0[i]), 0x01, ...ZIGZAG.map(i => q1[i])];
  out.push(...seg(0xDB, dqt));
  out.push(...seg(0xC0, [8, ...u16(height), ...u16(width), 3,
    1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]));
  const dhtBody = [
    ...dht(0x00, DC_L_BITS, DC_L_VALS), ...dht(0x10, AC_L_BITS, AC_L_VALS),
    ...dht(0x01, DC_C_BITS, DC_C_VALS), ...dht(0x11, AC_C_BITS, AC_C_VALS),
  ];
  out.push(...seg(0xC4, dhtBody));
  out.push(...seg(0xDA, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]));
  return Uint8Array.from(out);
}
function mag(v) { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; }

export function createJpegEncoder({ width, height, quality = 90 } = {}) {
  if (!(width > 0 && height > 0)) throw new Error('JPEG 尺寸非法');
  const q0 = scaleTable(LUMA_Q, quality), q1 = scaleTable(CHROMA_Q, quality);
  const dcL = huffTable(DC_L_BITS, DC_L_VALS), acL = huffTable(AC_L_BITS, AC_L_VALS);
  const dcC = huffTable(DC_C_BITS, DC_C_VALS), acC = huffTable(AC_C_BITS, AC_C_VALS);
  const w = new BitWriter();
  const rowBuf = new Uint8Array(width * 8 * 4);
  const Y = new Float32Array(64), Cb = new Float32Array(64), Cr = new Float32Array(64);
  const T = new Float32Array(64), D = new Float32Array(64), Q = new Int16Array(64);
  const prev = new Int16Array(3);
  let fill = 0, y0 = 0, done = false;

  const dct = src => {
    for (let y = 0; y < 8; y++) {
      const row = y * 8;
      for (let u = 0; u < 8; u++) {
        let s = 0;
        for (let x = 0; x < 8; x++) s += src[row + x] * COS[u * 8 + x];
        T[row + u] = s;
      }
    }
    for (let x = 0; x < 8; x++) for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += T[y * 8 + x] * COS[v * 8 + y];
      D[v * 8 + x] = s;
    }
  };
  const writeHuff = (table, sym) => w.bits(table.codes[sym], table.lens[sym]);
  const writeVal = (v, n) => { if (!n) return; if (v < 0) v += (1 << n) - 1; w.bits(v, n); };
  const block = (src, qi, comp) => {
    dct(src);
    const q = qi ? q1 : q0;
    for (let k = 0; k < 64; k++) {
      const i = ZIGZAG[k];
      Q[k] = Math.max(-1023, Math.min(1023, Math.round(D[i] / q[i])));
    }
    const dc = Q[0], diff = dc - prev[comp]; prev[comp] = dc;
    const n = mag(diff), dctab = comp ? dcC : dcL, actab = comp ? acC : acL;
    writeHuff(dctab, n); writeVal(diff, n);
    let run = 0;
    for (let k = 1; k < 64; k++) {
      const v = Q[k];
      if (!v) { run++; continue; }
      while (run > 15) { writeHuff(actab, 0xF0); run -= 16; }
      const c = mag(v);
      writeHuff(actab, (run << 4) | c); writeVal(v, c); run = 0;
    }
    if (run) writeHuff(actab, 0x00);
  };
  const encodeStrip = (rows) => {
    for (let x0 = 0; x0 < width; x0 += 8) {
      for (let yy = 0; yy < 8; yy++) {
        for (let xx = 0; xx < 8; xx++) {
          const sx = Math.min(x0 + xx, width - 1), o = yy * width * 4 + sx * 4;
          let r = rows[o], g = rows[o + 1], b = rows[o + 2], a = rows[o + 3];
          if (a < 255) { const k = a / 255; r = Math.round(r * k + 255 * (1 - k)); g = Math.round(g * k + 255 * (1 - k)); b = Math.round(b * k + 255 * (1 - k)); }
          const q = yy * 8 + xx;
          Y[q] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          Cb[q] = -0.168736 * r - 0.331264 * g + 0.5 * b;
          Cr[q] = 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
      block(Y, 0, 0); block(Cb, 1, 1); block(Cr, 1, 2);
    }
    y0 += 8;
  };
  const writeRows = (rgba, rows) => {
    if (done) throw new Error('JPEG 已结束');
    let off = 0;
    while (off < rows) {
      const take = Math.min(rows - off, 8 - fill);
      rowBuf.set(rgba.subarray(off * width * 4, (off + take) * width * 4), fill * width * 4);
      fill += take; off += take;
      if (fill === 8) { encodeStrip(rowBuf); fill = 0; }
    }
  };
  const finish = () => {
    if (done) return null;
    done = true;
    if (fill > 0) {
      const last = (fill - 1) * width * 4;
      for (let r = fill; r < 8; r++) rowBuf.set(rowBuf.subarray(last, last + width * 4), r * width * 4);
      encodeStrip(rowBuf);
    }
    w.flush();
    const parts = [header(width, height, q0, q1), ...w.take(), Uint8Array.of(0xFF, 0xD9)];
    return new Blob(parts, { type: 'image/jpeg' });
  };
  return { width, height, writeRows, finish, get y() { return y0; } };
}
export default { createJpegEncoder };
