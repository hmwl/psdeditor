



































export const D50 = [0.9642, 1.0, 0.8249];
export const INTENT_NAMES = ['可感知', '相对比色', '饱和度', '绝对比色'];
export const SPACE_CHANNELS = {
  'XYZ ': 3, 'Lab ': 3, 'Luv ': 3, 'YCbr': 3, 'Yxy ': 3, 'RGB ': 3, 'GRAY': 1, 'HSV ': 3, 'HLS ': 3,
  'CMYK': 4, 'CMY ': 3, '2CLR': 2, '3CLR': 3, '4CLR': 4, '5CLR': 5, '6CLR': 6, '7CLR': 7, '8CLR': 8,
  '9CLR': 9, 'ACLR': 10, 'BCLR': 11, 'CCLR': 12, 'DCLR': 13, 'ECLR': 14, 'FCLR': 15,
};
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sig = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);


const EPS = 216 / 24389, KAP = 24389 / 27;
export function xyzToLab(xyz, out = [0, 0, 0]) {
  const f = t => t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116;
  const fx = f(xyz[0] / D50[0]), fy = f(xyz[1] / D50[1]), fz = f(xyz[2] / D50[2]);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}
export function labToXyz(lab, out = [0, 0, 0]) {
  const fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200;
  const inv = t => { const t3 = t * t * t; return t3 > EPS ? t3 : (116 * t - 16) / KAP; };
  out[0] = D50[0] * inv(fx); out[1] = D50[1] * (lab[0] > KAP * EPS ? fy * fy * fy : lab[0] / KAP); out[2] = D50[2] * inv(fz);
  return out;
}
export function deltaE76(a, b) { const d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2]; return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2); }


export function mat3inv(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det) throw new Error('矩阵不可逆');
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
          B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
          C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
export function mat3mul(m, v, out = [0, 0, 0]) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0] * x + m[1] * y + m[2] * z; out[1] = m[3] * x + m[4] * y + m[5] * z; out[2] = m[6] * x + m[7] * y + m[8] * z;
  return out;
}
function mat3x3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

export function bradford(src, dst) {
  const M = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
  const Mi = mat3inv(M);
  const s = mat3mul(M, src), d = mat3mul(M, dst);
  const D = [d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]];
  return mat3x3(Mi, mat3x3(D, M));
}




function makeCurve(kind, data) {
  let f;
  if (kind === 'identity') f = x => x;
  else if (kind === 'gamma') { const g = data; f = x => x <= 0 ? 0 : Math.pow(x, g); }
  else if (kind === 'table') {
    const t = data, n = t.length - 1;
    f = x => { if (x <= 0) return t[0]; if (x >= 1) return t[n]; const p = x * n, i = p | 0, fr = p - i; return t[i] + (t[i + 1] - t[i]) * fr; };
  } else if (kind === 'para') {
    const { type, p } = data; const [g, a = 1, b = 0, c = 0, d = 0, e = 0, ff = 0] = p;
    if (type === 0) f = x => x <= 0 ? 0 : Math.pow(x, g);
    else if (type === 1) f = x => x >= -b / a ? Math.pow(Math.max(0, a * x + b), g) : 0;
    else if (type === 2) f = x => x >= -b / a ? Math.pow(Math.max(0, a * x + b), g) + c : c;
    else if (type === 3) f = x => x >= d ? Math.pow(Math.max(0, a * x + b), g) : c * x;
    else f = x => x >= d ? Math.pow(Math.max(0, a * x + b), g) + e : c * x + ff;
  } else throw new Error('未知曲线 ' + kind);
  const curve = { kind, data, eval: x => clamp01(f(x)) };
  
  let invT = null;
  curve.inv = y => {
    if (kind === 'identity') return clamp01(y);
    if (kind === 'gamma') return y <= 0 ? 0 : clamp01(Math.pow(y, 1 / data));
    if (!invT) {
      const N = 4096, fw = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) fw[i] = curve.eval(i / N);
      const dec = fw[N] < fw[0];
      if (dec) fw.reverse();
      for (let i = 1; i <= N; i++) if (fw[i] < fw[i - 1]) fw[i] = fw[i - 1];
      invT = { fw, N, dec };
    }
    const { fw, N, dec } = invT;
    if (y <= fw[0]) return dec ? 1 : 0;
    if (y >= fw[N]) return dec ? 0 : 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fw[m] <= y) lo = m; else hi = m; }
    const span = fw[hi] - fw[lo];
    const x = (lo + (span > 0 ? (y - fw[lo]) / span : 0)) / N;
    return dec ? 1 - x : x;
  };
  return curve;
}
export const curveGamma = g => makeCurve('gamma', g);
export const curveTable = t => makeCurve('table', t);
export const curvePara = (type, p) => makeCurve('para', { type, p });
export const curveIdentity = () => makeCurve('identity');

export const srgbCurve = () => curvePara(3, [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045]);



class Rd {
  constructor(u8) { this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  u8a(o) { return this.u8[o]; }
  u16(o) { return this.dv.getUint16(o); }
  u32(o) { return this.dv.getUint32(o); }
  s15(o) { return this.dv.getInt32(o) / 65536; }
  sig(o) { return sig(this.u8, o); }
}

function readCurveAt(r, o) {
  const t = r.sig(o);
  if (t === 'curv') {
    const n = r.u32(o + 8);
    if (n === 0) return { curve: curveIdentity(), size: 12 };
    if (n === 1) return { curve: curveGamma(r.u16(o + 12) / 256), size: 14 };
    const tab = new Float64Array(n);
    for (let i = 0; i < n; i++) tab[i] = r.u16(o + 12 + i * 2) / 65535;
    return { curve: curveTable(tab), size: 12 + n * 2 };
  }
  if (t === 'para') {
    const type = r.u16(o + 8), np = [1, 3, 4, 5, 7][type];
    if (np == null) throw new Error('para 曲线类型 ' + type + ' 不认识');
    const p = []; for (let i = 0; i < np; i++) p.push(r.s15(o + 12 + i * 4));
    return { curve: curvePara(type, p), size: 12 + np * 4 };
  }
  throw new Error(`期望 curv/para，读到「${t}」`);
}
function readCurveSeq(r, o, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const { curve, size } = readCurveAt(r, o); out.push(curve); o += size; o += (4 - (o % 4)) % 4; }
  return out;
}


function makeClut(grid, nOut, data) {
  const nIn = grid.length;
  const strides = new Array(nIn);
  let s = nOut;
  for (let i = nIn - 1; i >= 0; i--) { strides[i] = s; s *= grid[i]; }
  const tmpIdx = new Int32Array(nIn), tmpFr = new Float64Array(nIn);
  
  const evalN = (inp, out) => {
    for (let i = 0; i < nIn; i++) {
      const g = grid[i] - 1; let p = clamp01(inp[i]) * g; let k = Math.floor(p); if (k >= g) k = g - 1; if (k < 0) k = 0;
      tmpIdx[i] = k; tmpFr[i] = g > 0 ? p - k : 0;
    }
    for (let c = 0; c < nOut; c++) out[c] = 0;
    const corners = 1 << nIn;
    for (let m = 0; m < corners; m++) {
      let w = 1, off = 0;
      for (let i = 0; i < nIn; i++) {
        const bit = (m >> (nIn - 1 - i)) & 1;
        const gi = grid[i] > 1 ? tmpIdx[i] + bit : 0;
        w *= bit ? tmpFr[i] : 1 - tmpFr[i];
        off += gi * strides[i];
      }
      if (w === 0) continue;
      for (let c = 0; c < nOut; c++) out[c] += w * data[off + c];
    }
    return out;
  };
  const eval3 = (inp, out) => {
    const g0 = grid[0] - 1, g1 = grid[1] - 1, g2 = grid[2] - 1;
    let px = clamp01(inp[0]) * g0, py = clamp01(inp[1]) * g1, pz = clamp01(inp[2]) * g2;
    let x = Math.min(g0 - 1, px | 0), y = Math.min(g1 - 1, py | 0), z = Math.min(g2 - 1, pz | 0);
    if (x < 0) x = 0; if (y < 0) y = 0; if (z < 0) z = 0;
    const rx = px - x, ry = py - y, rz = pz - z;
    const sx = strides[0], sy = strides[1], sz = strides[2];
    const b = x * sx + y * sy + z * sz;
    const X = sx, Y = sy, Z = sz;
    for (let c = 0; c < nOut; c++) {
      const c000 = data[b + c], c111 = data[b + X + Y + Z + c];
      let v;
      if (rx >= ry) {
        if (ry >= rz) v = c000 + rx * (data[b + X + c] - c000) + ry * (data[b + X + Y + c] - data[b + X + c]) + rz * (c111 - data[b + X + Y + c]);
        else if (rx >= rz) v = c000 + rx * (data[b + X + c] - c000) + rz * (data[b + X + Z + c] - data[b + X + c]) + ry * (c111 - data[b + X + Z + c]);
        else v = c000 + rz * (data[b + Z + c] - c000) + rx * (data[b + X + Z + c] - data[b + Z + c]) + ry * (c111 - data[b + X + Z + c]);
      } else {
        if (rz >= ry) v = c000 + rz * (data[b + Z + c] - c000) + ry * (data[b + Y + Z + c] - data[b + Z + c]) + rx * (c111 - data[b + Y + Z + c]);
        else if (rz >= rx) v = c000 + ry * (data[b + Y + c] - c000) + rz * (data[b + Y + Z + c] - data[b + Y + c]) + rx * (c111 - data[b + Y + Z + c]);
        else v = c000 + ry * (data[b + Y + c] - c000) + rx * (data[b + X + Y + c] - data[b + Y + c]) + rz * (c111 - data[b + X + Y + c]);
      }
      out[c] = v;
    }
    return out;
  };
  const ok3 = nIn === 3 && grid.every(g => g >= 2);
  return { grid, nIn, nOut, data, eval: ok3 ? eval3 : evalN };
}


function readLutV2(r, o, is16) {
  const nIn = r.u8a(o + 8), nOut = r.u8a(o + 9), g = r.u8a(o + 10);
  const mtx = []; for (let i = 0; i < 9; i++) mtx.push(r.s15(o + 12 + i * 4));
  let p = o + 48;
  let inN = 256, outN = 256;
  if (is16) { inN = r.u16(p); outN = r.u16(p + 2); p += 4; }
  const rdv = is16 ? (q => r.u16(q) / 65535) : (q => r.u8a(q) / 255), bs = is16 ? 2 : 1;
  const inCurves = [];
  for (let c = 0; c < nIn; c++) { const t = new Float64Array(inN); for (let i = 0; i < inN; i++) { t[i] = rdv(p); p += bs; } inCurves.push(curveTable(t)); }
  const n = Math.pow(g, nIn) * nOut, data = new Float64Array(n);
  for (let i = 0; i < n; i++) { data[i] = rdv(p); p += bs; }
  const outCurves = [];
  for (let c = 0; c < nOut; c++) { const t = new Float64Array(outN); for (let i = 0; i < outN; i++) { t[i] = rdv(p); p += bs; } outCurves.push(curveTable(t)); }
  const identity = Math.abs(mtx[0] - 1) + Math.abs(mtx[4] - 1) + Math.abs(mtx[8] - 1) + Math.abs(mtx[1]) + Math.abs(mtx[2]) + Math.abs(mtx[3]) + Math.abs(mtx[5]) + Math.abs(mtx[6]) + Math.abs(mtx[7]) < 1e-6;
  return { type: is16 ? 'mft2' : 'mft1', nIn, nOut, matrix: identity ? null : mtx, inCurves, clut: makeClut(new Array(nIn).fill(g), nOut, data), outCurves };
}


function readLutV4(r, o, aToB) {
  const nIn = r.u8a(o + 8), nOut = r.u8a(o + 9);
  const offB = r.u32(o + 12), offM = r.u32(o + 16), offMtx = r.u32(o + 20), offC = r.u32(o + 24), offA = r.u32(o + 28);
  const L = { type: aToB ? 'mAB ' : 'mBA ', nIn, nOut, A: null, B: null, M: null, matrix: null, clut: null };
  
  if (offB) L.B = readCurveSeq(r, o + offB, aToB ? nOut : nIn);
  if (offM) L.M = readCurveSeq(r, o + offM, 3);
  if (offMtx) { const m = []; for (let i = 0; i < 12; i++) m.push(r.s15(o + offMtx + i * 4)); L.matrix = m; }
  if (offA) L.A = readCurveSeq(r, o + offA, aToB ? nIn : nOut);
  if (offC) {
    const cIn = aToB ? nIn : nIn, cOut = aToB ? nOut : nOut;
    const grid = []; for (let i = 0; i < cIn; i++) grid.push(r.u8a(o + offC + i));
    const prec = r.u8a(o + offC + 16);
    let p = o + offC + 20; const n = grid.reduce((a, b) => a * b, 1) * cOut, data = new Float64Array(n);
    for (let i = 0; i < n; i++) { data[i] = prec === 2 ? r.u16(p) / 65535 : r.u8a(p) / 255; p += prec === 2 ? 2 : 1; }
    L.clut = makeClut(grid, cOut, data);
  }
  return L;
}

function readText(r, o, size) {
  const t = r.sig(o);
  const dec = (a, b, u16) => { let s = ''; if (u16) { for (let i = a; i + 1 < b; i += 2) { const c = r.u16(i); if (!c) break; s += String.fromCharCode(c); } } else { for (let i = a; i < b; i++) { const c = r.u8a(i); if (!c) break; s += String.fromCharCode(c); } } return s; };
  if (t === 'desc') {
    
    const n = r.u32(o + 8), ascii = dec(o + 12, o + 12 + n, false);
    try { const q = o + 12 + n, un = r.u32(q + 4); if (un > 1 && q + 8 + un * 2 <= o + size) { const u = dec(q + 8, q + 8 + un * 2, true); if (u && /[^\x00-\x7f]/.test(u)) return u; } } catch {}
    return ascii;
  }
  if (t === 'text') return dec(o + 8, o + size, false);
  if (t === 'mluc') {
    const n = r.u32(o + 8), rs = r.u32(o + 12);
    let best = null;
    for (let i = 0; i < n; i++) {
      const q = o + 16 + i * rs, lang = r.sig(q).slice(0, 2), len = r.u32(q + 4), off = r.u32(q + 8);
      const s = dec(o + off, o + off + len, true);
      if (!best || lang === 'zh' || (lang === 'en' && !best.zh)) best = { s, zh: lang === 'zh' };
    }
    return best ? best.s : '';
  }
  return '';
}






export function parseIcc(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 132) throw new Error('ICC 文件太短');
  const r = new Rd(u8);
  if (r.sig(36) !== 'acsp') throw new Error('不是 ICC 配置文件（缺少 acsp 签名）');
  const size = r.u32(0);
  const vMaj = u8[8], vMin = u8[9] >> 4, vFix = u8[9] & 15;
  const P = {
    bytes: u8.subarray(0, Math.min(size || u8.length, u8.length)),
    version: `${vMaj}.${vMin}.${vFix}`, major: vMaj,
    deviceClass: r.sig(12), colorSpace: r.sig(16), pcs: r.sig(20),
    intent: r.u32(64) & 3,
    illuminant: [r.s15(68), r.s15(72), r.s15(76)],
    creator: r.sig(80), tags: Object.create(null), tagList: [],
  };
  P.nChannels = SPACE_CHANNELS[P.colorSpace] || 0;
  P.nPcs = SPACE_CHANNELS[P.pcs] || 3;
  const n = r.u32(128);
  for (let i = 0; i < n; i++) {
    const q = 132 + i * 12; if (q + 12 > u8.length) break;
    const s = r.sig(q), off = r.u32(q + 4), sz = r.u32(q + 8);
    P.tagList.push({ sig: s, off, size: sz });
    if (off + 8 > u8.length) continue;
    try { P.tags[s] = readTag(r, s, off, sz); } catch (e) { P.tags[s] = { error: String(e.message || e) }; }
  }
  P.description = (P.tags.desc && typeof P.tags.desc === 'string') ? P.tags.desc : '';
  P.copyright = typeof P.tags.cprt === 'string' ? P.tags.cprt : '';
  P.wtpt = Array.isArray(P.tags.wtpt) ? P.tags.wtpt : D50.slice();
  P.bkpt = Array.isArray(P.tags.bkpt) ? P.tags.bkpt : null;
  
  if (P.major >= 4 && Array.isArray(P.tags.chad) && P.tags.chad.length === 9) {
    try { P.mediaWhite = mat3mul(mat3inv(P.tags.chad), P.wtpt); } catch { P.mediaWhite = P.wtpt; }
  } else P.mediaWhite = P.wtpt;
  return finishProfile(P);
}

function readTag(r, s, off, size) {
  const t = r.sig(off);
  switch (t) {
    case 'XYZ ': return [r.s15(off + 8), r.s15(off + 12), r.s15(off + 16)];
    case 'curv': case 'para': return readCurveAt(r, off).curve;
    case 'mft1': return readLutV2(r, off, false);
    case 'mft2': return readLutV2(r, off, true);
    case 'mAB ': return readLutV4(r, off, true);
    case 'mBA ': return readLutV4(r, off, false);
    case 'desc': case 'text': case 'mluc': return readText(r, off, size);
    case 'sf32': { const a = []; for (let i = off + 8; i + 4 <= off + size; i += 4) a.push(r.s15(i)); return a; }
    case 'sig ': return r.sig(off + 8);
    default: return { type: t, off, size };
  }
}



const XYZ_SCALE = 65535 / 32768;

function pcsDecoder(pcs, kind) {
  if (pcs === 'XYZ ') return (n, out) => { out[0] = n[0] * XYZ_SCALE; out[1] = n[1] * XYZ_SCALE; out[2] = n[2] * XYZ_SCALE; return out; };
  const lab = [0, 0, 0];
  if (kind === 'mft2') return (n, out) => { lab[0] = n[0] * 65535 / 65280 * 100; lab[1] = n[1] * 65535 / 256 - 128; lab[2] = n[2] * 65535 / 256 - 128; return labToXyz(lab, out); };
  return (n, out) => { lab[0] = n[0] * 100; lab[1] = n[1] * 255 - 128; lab[2] = n[2] * 255 - 128; return labToXyz(lab, out); };
}
function pcsEncoder(pcs, kind) {
  if (pcs === 'XYZ ') return (xyz, n) => { n[0] = clamp01(xyz[0] / XYZ_SCALE); n[1] = clamp01(xyz[1] / XYZ_SCALE); n[2] = clamp01(xyz[2] / XYZ_SCALE); return n; };
  const lab = [0, 0, 0];
  if (kind === 'mft2') return (xyz, n) => { xyzToLab(xyz, lab); n[0] = clamp01(lab[0] / 100 * 65280 / 65535); n[1] = clamp01((lab[1] + 128) * 256 / 65535); n[2] = clamp01((lab[2] + 128) * 256 / 65535); return n; };
  return (xyz, n) => { xyzToLab(xyz, lab); n[0] = clamp01(lab[0] / 100); n[1] = clamp01((lab[1] + 128) / 255); n[2] = clamp01((lab[2] + 128) / 255); return n; };
}


function lutEvaluator(L) {
  const nIn = L.nIn, nOut = L.nOut;
  const a = new Float64Array(Math.max(nIn, 16)), b = new Float64Array(Math.max(nOut, 16)), t3 = [0, 0, 0];
  if (L.type === 'mft1' || L.type === 'mft2') {
    return (inp, out) => {
      if (L.matrix && nIn === 3) { mat3mul(L.matrix, inp, t3); for (let i = 0; i < 3; i++) a[i] = t3[i]; }
      else for (let i = 0; i < nIn; i++) a[i] = inp[i];
      for (let i = 0; i < nIn; i++) a[i] = L.inCurves[i].eval(clamp01(a[i]));
      L.clut.eval(a, b);
      for (let i = 0; i < nOut; i++) out[i] = L.outCurves[i].eval(clamp01(b[i]));
      return out;
    };
  }
  const mtx = L.matrix;
  const applyMtx = v => { mat3mul(mtx, v, t3); v[0] = clamp01(t3[0] + mtx[9]); v[1] = clamp01(t3[1] + mtx[10]); v[2] = clamp01(t3[2] + mtx[11]); };
  if (L.type === 'mAB ') {
    return (inp, out) => {
      for (let i = 0; i < nIn; i++) a[i] = inp[i];
      if (L.A) for (let i = 0; i < nIn; i++) a[i] = L.A[i].eval(clamp01(a[i]));
      let v;
      if (L.clut) { L.clut.eval(a, b); v = b; } else v = a;
      if (L.M) for (let i = 0; i < 3; i++) v[i] = L.M[i].eval(clamp01(v[i]));
      if (mtx) applyMtx(v);
      if (L.B) for (let i = 0; i < nOut; i++) v[i] = L.B[i].eval(clamp01(v[i]));
      for (let i = 0; i < nOut; i++) out[i] = clamp01(v[i]);
      return out;
    };
  }
  return (inp, out) => {         
    for (let i = 0; i < nIn; i++) a[i] = inp[i];
    if (L.B) for (let i = 0; i < nIn; i++) a[i] = L.B[i].eval(clamp01(a[i]));
    if (mtx) applyMtx(a);
    if (L.M) for (let i = 0; i < 3; i++) a[i] = L.M[i].eval(clamp01(a[i]));
    let v;
    if (L.clut) { L.clut.eval(a, b); v = b; } else v = a;
    if (L.A) for (let i = 0; i < nOut; i++) v[i] = L.A[i].eval(clamp01(v[i]));
    for (let i = 0; i < nOut; i++) out[i] = clamp01(v[i]);
    return out;
  };
}

const isLut = t => t && typeof t === 'object' && (t.type === 'mft1' || t.type === 'mft2' || t.type === 'mAB ' || t.type === 'mBA ');


function finishProfile(P) {
  const T = P.tags;
  const hasMatrix = P.colorSpace === 'RGB ' && Array.isArray(T.rXYZ) && Array.isArray(T.gXYZ) && Array.isArray(T.bXYZ) && T.rTRC && T.rTRC.eval && T.gTRC && T.bTRC;
  const hasGray = P.colorSpace === 'GRAY' && T.kTRC && T.kTRC.eval;
  P.kind = P.deviceClass === 'link' ? 'link' : (isLut(T.A2B0) || isLut(T.A2B1)) ? 'lut' : hasMatrix ? 'matrix' : hasGray ? 'gray' : P.colorSpace === 'Lab ' ? 'lab' : 'unknown';
  if (hasMatrix) {
    P.matrix = [T.rXYZ[0], T.gXYZ[0], T.bXYZ[0], T.rXYZ[1], T.gXYZ[1], T.bXYZ[1], T.rXYZ[2], T.gXYZ[2], T.bXYZ[2]];
    P.matrixInv = mat3inv(P.matrix);
    P.trc = [T.rTRC, T.gTRC, T.bTRC];
  }
  const cache = new Map();
  P.toPCS = (intent = 0) => {
    const key = 'to' + intent; if (cache.has(key)) return cache.get(key);
    let fn = null;
    const rel = intent === 3 ? 1 : intent;
    const tag = [T['A2B' + rel], T.A2B0, T.A2B1, T.A2B2].find(isLut);
    if (tag && P.kind !== 'link') {
      const ev = lutEvaluator(tag), dec = pcsDecoder(P.pcs, tag.type), n = new Float64Array(16);
      fn = (inp, xyz) => dec(ev(inp, n), xyz);
    } else if (hasMatrix) {
      const lin = [0, 0, 0];
      fn = (inp, xyz) => { lin[0] = P.trc[0].eval(inp[0]); lin[1] = P.trc[1].eval(inp[1]); lin[2] = P.trc[2].eval(inp[2]); return mat3mul(P.matrix, lin, xyz); };
    } else if (hasGray) {
      fn = (inp, xyz) => { const y = T.kTRC.eval(inp[0]); xyz[0] = D50[0] * y; xyz[1] = y; xyz[2] = D50[2] * y; return xyz; };
    } else if (P.colorSpace === 'Lab ') {
      const lab = [0, 0, 0];
      fn = (inp, xyz) => { lab[0] = inp[0] * 100; lab[1] = inp[1] * 255 - 128; lab[2] = inp[2] * 255 - 128; return labToXyz(lab, xyz); };
    }
    if (fn && intent === 3) fn = absWrap(fn, P, true);
    cache.set(key, fn); return fn;
  };
  P.fromPCS = (intent = 0) => {
    const key = 'from' + intent; if (cache.has(key)) return cache.get(key);
    let fn = null;
    const rel = intent === 3 ? 1 : intent;
    const tag = [T['B2A' + rel], T.B2A0, T.B2A1, T.B2A2].find(isLut);
    if (tag && P.kind !== 'link') {
      const ev = lutEvaluator(tag), enc = pcsEncoder(P.pcs, tag.type), n = new Float64Array(16);
      fn = (xyz, out) => ev(enc(xyz, n), out);
    } else if (hasMatrix) {
      const lin = [0, 0, 0];
      fn = (xyz, out) => { mat3mul(P.matrixInv, xyz, lin); out[0] = P.trc[0].inv(clamp01(lin[0])); out[1] = P.trc[1].inv(clamp01(lin[1])); out[2] = P.trc[2].inv(clamp01(lin[2])); return out; };
    } else if (hasGray) {
      fn = (xyz, out) => { out[0] = T.kTRC.inv(clamp01(xyz[1])); return out; };
    } else if (P.colorSpace === 'Lab ') {
      const lab = [0, 0, 0];
      fn = (xyz, out) => { xyzToLab(xyz, lab); out[0] = clamp01(lab[0] / 100); out[1] = clamp01((lab[1] + 128) / 255); out[2] = clamp01((lab[2] + 128) / 255); return out; };
    }
    if (fn && intent === 3) fn = absWrap(fn, P, false);
    cache.set(key, fn); return fn;
  };
  
  if (hasMatrix) P.xyzToLinear = (xyz, out = [0, 0, 0]) => mat3mul(P.matrixInv, xyz, out);
  
  if (P.kind === 'link' && isLut(T.A2B0)) { const ev = lutEvaluator(T.A2B0); P.link = { nIn: T.A2B0.nIn, nOut: T.A2B0.nOut, eval: ev }; }
  P.name = P.description || '(未命名配置文件)';
  return P;
}
function absWrap(fn, P, toPcs) {
  const w = P.mediaWhite || D50, k = [w[0] / D50[0], w[1] / D50[1], w[2] / D50[2]], t = [0, 0, 0];
  return toPcs
    ? (inp, xyz) => { fn(inp, xyz); xyz[0] *= k[0]; xyz[1] *= k[1]; xyz[2] *= k[2]; return xyz; }
    : (xyz, out) => { t[0] = xyz[0] / k[0]; t[1] = xyz[1] / k[1]; t[2] = xyz[2] / k[2]; return fn(t, out); };
}



class Wr {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); }
  u16(v) { this.a.push((v >>> 8) & 255, v & 255); }
  u32(v) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
  s15(v) { this.u32(Math.round(v * 65536) | 0); }
  sig(s) { for (let i = 0; i < 4; i++) this.a.push(s.charCodeAt(i) & 255); }
  pad4() { while (this.a.length % 4) this.a.push(0); }
  bytes() { return Uint8Array.from(this.a); }
}
const tagXYZ = v => { const w = new Wr(); w.sig('XYZ '); w.u32(0); w.s15(v[0]); w.s15(v[1]); w.s15(v[2]); return w.bytes(); };
const tagText = s => { const w = new Wr(); w.sig('text'); w.u32(0); for (const ch of String(s)) w.u8(ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 63); w.u8(0); return w.bytes(); };
function tagDesc(s) {
  
  const w = new Wr(); w.sig('desc'); w.u32(0);
  const ascii = String(s).replace(/[^\x20-\x7e]/g, '?');
  w.u32(ascii.length + 1); for (const ch of ascii) w.u8(ch.charCodeAt(0)); w.u8(0);
  w.u32(0); w.u32(s.length + 1); for (const ch of String(s)) w.u16(ch.charCodeAt(0)); w.u16(0);
  w.u16(0); w.u8(0); for (let i = 0; i < 67; i++) w.u8(0);
  return w.bytes();
}
function tagCurve(c) {
  const w = new Wr(); w.sig('curv'); w.u32(0);
  if (c == null || c === 1) { w.u32(0); return w.bytes(); }
  if (typeof c === 'number') { w.u32(1); w.u16(Math.round(c * 256)); return w.bytes(); }
  const n = c.length; w.u32(n); for (let i = 0; i < n; i++) w.u16(Math.round(clamp01(c[i]) * 65535));
  return w.bytes();
}
const tagSf32 = arr => { const w = new Wr(); w.sig('sf32'); w.u32(0); for (const v of arr) w.s15(v); return w.bytes(); };

function tagLut16(L) {
  const w = new Wr(); w.sig('mft2'); w.u32(0);
  w.u8(L.nIn); w.u8(L.nOut); w.u8(L.grid); w.u8(0);
  const m = L.matrix || [1, 0, 0, 0, 1, 0, 0, 0, 1]; for (const v of m) w.s15(v);
  const inN = L.inCurves ? L.inCurves[0].length : 2, outN = L.outCurves ? L.outCurves[0].length : 2;
  w.u16(inN); w.u16(outN);
  for (let c = 0; c < L.nIn; c++) for (let i = 0; i < inN; i++) w.u16(Math.round(clamp01(L.inCurves ? L.inCurves[c][i] : i / (inN - 1)) * 65535));
  for (let i = 0; i < L.clut.length; i++) w.u16(Math.round(clamp01(L.clut[i]) * 65535));
  for (let c = 0; c < L.nOut; c++) for (let i = 0; i < outN; i++) w.u16(Math.round(clamp01(L.outCurves ? L.outCurves[c][i] : i / (outN - 1)) * 65535));
  return w.bytes();
}






export function writeIcc(s) {
  const entries = [];
  const add = (tsig, data) => entries.push({ sig: tsig, data });
  add('desc', tagDesc(s.description || 'PSD Editor Profile'));
  add('cprt', tagText(s.copyright || 'No copyright, use freely (generated by PSD Editor)'));
  if (s.deviceClass !== 'link') add('wtpt', tagXYZ(s.wtpt || D50));
  if (s.bkpt) add('bkpt', tagXYZ(s.bkpt));
  for (const [k, v] of Object.entries(s.tags || {})) {
    if (v instanceof Uint8Array) add(k, v);
    else if (v.xyz) add(k, tagXYZ(v.xyz));
    else if ('curve' in v) add(k, tagCurve(v.curve));
    else if (v.lut16) add(k, tagLut16(v.lut16));
    else if (v.sf32) add(k, tagSf32(v.sf32));
    else if (v.text != null) add(k, tagText(v.text));
    else if (v.same) entries.push({ sig: k, same: v.same });
  }
  
  const count = entries.length;
  let off = 128 + 4 + count * 12;
  const placed = new Map();
  for (const e of entries) {
    if (e.same) continue;
    e.off = off; e.size = e.data.length; placed.set(e.sig, e);
    off += e.size; off += (4 - (off % 4)) % 4;
  }
  for (const e of entries) if (e.same) { const t = placed.get(e.same); e.off = t.off; e.size = t.size; }
  const total = off;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, total);
  out.set([0x6c, 0x63, 0x6d, 0x73], 4);                       
  out[8] = 2; out[9] = 0x10;                                   
  const put4 = (o, t) => { for (let i = 0; i < 4; i++) out[o + i] = t.charCodeAt(i); };
  put4(12, s.deviceClass || 'mntr'); put4(16, s.colorSpace || 'RGB '); put4(20, s.pcs || 'XYZ ');
  const d = new Date(); [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].forEach((v, i) => dv.setUint16(24 + i * 2, v));
  put4(36, 'acsp'); put4(40, 'APPL');
  dv.setUint32(64, s.intent || 0);
  dv.setInt32(68, Math.round(D50[0] * 65536)); dv.setInt32(72, 65536); dv.setInt32(76, Math.round(D50[2] * 65536));
  put4(80, 'FPSD');
  dv.setUint32(128, count);
  entries.forEach((e, i) => { const q = 132 + i * 12; put4(q, e.sig); dv.setUint32(q + 4, e.off); dv.setUint32(q + 8, e.size); });
  for (const e of entries) if (!e.same) out.set(e.data, e.off);
  return out;
}



const memo = new Map();
const once = (k, f) => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k); };


export function primariesToD50Matrix(prim, white) {
  const xyz = ([x, y]) => [x / y, 1, (1 - x - y) / y];
  const R = xyz(prim[0]), G = xyz(prim[1]), B = xyz(prim[2]), W = xyz(white);
  const M = [R[0], G[0], B[0], R[1], G[1], B[1], R[2], G[2], B[2]];
  const S = mat3mul(mat3inv(M), W);
  const Mw = [M[0] * S[0], M[1] * S[1], M[2] * S[2], M[3] * S[0], M[4] * S[1], M[5] * S[2], M[6] * S[0], M[7] * S[1], M[8] * S[2]];
  return mat3x3(bradford(W, D50), Mw);
}
function curveSamples(fn, n = 1024) { const t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = fn(i / (n - 1)); return t; }

function rgbMatrixProfile(desc, prim, white, trcFn, trcGamma) {
  const M = primariesToD50Matrix(prim, white);
  const trc = trcGamma != null ? { curve: trcGamma } : { curve: curveSamples(trcFn) };
  return parseIcc(writeIcc({
    deviceClass: 'mntr', colorSpace: 'RGB ', pcs: 'XYZ ', description: desc,
    wtpt: D50,
    tags: {
      rXYZ: { xyz: [M[0], M[3], M[6]] }, gXYZ: { xyz: [M[1], M[4], M[7]] }, bXYZ: { xyz: [M[2], M[5], M[8]] },
      rTRC: trc, gTRC: { same: 'rTRC' }, bTRC: { same: 'rTRC' },
      chad: { sf32: bradford([0.95047, 1, 1.08883], D50) },
    },
  }));
}
const srgbEncode = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
const srgbDecode = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
export { srgbEncode, srgbDecode };
const D65xy = [0.3127, 0.3290];


export const sRGBProfile = () => once('srgb', () => rgbMatrixProfile('sRGB IEC61966-2.1', [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]], D65xy, srgbDecode));

export const displayP3Profile = () => once('p3', () => rgbMatrixProfile('Display P3', [[0.680, 0.320], [0.265, 0.690], [0.150, 0.060]], D65xy, srgbDecode));

export const macRgbProfile = () => once('mac', () => rgbMatrixProfile('Legacy Macintosh RGB (Gamma 1.8)', [[0.625, 0.340], [0.280, 0.595], [0.155, 0.070]], D65xy, null, 1.8));

export const romRgbProfile = () => once('romm', () => rgbMatrixProfile('ROMM RGB (ProPhoto primaries)', [[0.7347, 0.2653], [0.1596, 0.8404], [0.0366, 0.0001]], [0.3457, 0.3585], null, 1.8));

export const wideRgb1998Profile = () => once('w98', () => rgbMatrixProfile('Compatible RGB (1998 primaries, Gamma 2.2)', [[0.64, 0.33], [0.21, 0.71], [0.15, 0.06]], D65xy, null, 563 / 256));


export function grayProfile(o = {}) {
  const key = 'gray:' + (o.dotGain != null ? 'dg' + o.dotGain : 'g' + (o.gamma || 2.2));
  return once(key, () => {
    let fn, desc;
    if (o.dotGain != null) {
      
      const dg = o.dotGain / 100;
      const T = t => clamp01(t + 4 * dg * t * (1 - t));
      
      fn = v => { const refl = 1 - T(1 - v); return refl; };
      desc = `Dot Gain ${o.dotGain}%`;
    } else { const g = o.gamma || 2.2; fn = v => Math.pow(v, g); desc = `Gray Gamma ${g}`; }
    return parseIcc(writeIcc({ deviceClass: 'mntr', colorSpace: 'GRAY', pcs: 'XYZ ', description: desc, wtpt: D50, tags: { kTRC: { curve: curveSamples(fn, 1024) } } }));
  });
}

export const labProfile = () => once('lab', () => {
  const P = { bytes: null, version: '4.0.0', major: 4, deviceClass: 'abst', colorSpace: 'Lab ', pcs: 'Lab ', intent: 0, tags: {}, tagList: [], nChannels: 3, nPcs: 3, description: 'Lab (D50)', wtpt: D50.slice(), mediaWhite: D50.slice() };
  return finishProfile(P);
});








const CMYK_PRIM = {
  W: [95, 0, -2], C: [56, -37, -50], M: [48, 74, -3], Y: [89, -5, 93],
  MY: [47, 68, 48], CY: [50, -65, 27], CM: [24, 22, -46], CMY: [23, 0, 0], K: [16, 0, 0],
};
const YN = 2;
export function cmykModel() {
  return once('cmykModel', () => {
    const toR = lab => { const x = labToXyz(lab); const w = labToXyz(CMYK_PRIM.W); return [x[0] / w[0], x[1] / w[1], x[2] / w[2]]; };
    const P = {}; for (const k of Object.keys(CMYK_PRIM)) P[k] = toR(CMYK_PRIM[k]).map(v => Math.pow(v, 1 / YN));
    const paper = labToXyz(CMYK_PRIM.W);
    const kFilt = toR(CMYK_PRIM.K);
    const tvi = (t, g) => clamp01(t + 4 * g * t * (1 - t));
    const minR = labToXyz([8.5, 0, 0])[1] / paper[1];
    const xyz = [0, 0, 0];
    
    const forward = (c, m, y, k, out = xyz) => {
      c = tvi(clamp01(c), 0.15); m = tvi(clamp01(m), 0.15); y = tvi(clamp01(y), 0.14); k = tvi(clamp01(k), 0.16);
      const w = [(1 - c) * (1 - m) * (1 - y), c * (1 - m) * (1 - y), (1 - c) * m * (1 - y), (1 - c) * (1 - m) * y,
                 (1 - c) * m * y, c * (1 - m) * y, c * m * (1 - y), c * m * y];
      const prim = [P.W, P.C, P.M, P.Y, P.MY, P.CY, P.CM, P.CMY];
      for (let ch = 0; ch < 3; ch++) {
        let s = 0; for (let i = 0; i < 8; i++) s += w[i] * prim[i][ch];
        let R = s * s;
        
        const kr = Math.sqrt(R * kFilt[ch]), rr = Math.sqrt(R);
        R = Math.pow((1 - k) * rr + k * kr, 2);
        R = Math.sqrt(R * R + minR * minR);                   
        out[ch] = R * paper[ch];
      }
      return out;
    };
    return { forward, paper, minR };
  });
}


function makeCmykInverse() {
  const { forward } = cmykModel();
  const lab = [0, 0, 0], t = [0, 0, 0];
  const labOf = (c, m, y, k, out) => xyzToLab(forward(c, m, y, k, t), out);
  
  function solveCMY(target, k, init) {
    let v = init ? init.slice() : [0.3, 0.3, 0.3];
    const cur = [0, 0, 0], jp = [0, 0, 0];
    let lambda = 1e-3;
    labOf(v[0], v[1], v[2], k, cur);
    let err = deltaE76(cur, target);
    for (let it = 0; it < 40 && err > 0.01; it++) {
      const J = [];
      for (let j = 0; j < 3; j++) {
        const h = 1e-4, vv = v.slice(); vv[j] = Math.min(1, vv[j] + h);
        const hh = vv[j] - v[j] || -h; if (hh < 0) vv[j] = v[j] + hh;
        labOf(vv[0], vv[1], vv[2], k, jp);
        J.push([(jp[0] - cur[0]) / hh, (jp[1] - cur[1]) / hh, (jp[2] - cur[2]) / hh]);
      }
      
      const r = [target[0] - cur[0], target[1] - cur[1], target[2] - cur[2]];
      const A = [], g = [0, 0, 0];
      for (let a = 0; a < 3; a++) { A.push([0, 0, 0]); for (let b = 0; b < 3; b++) { let s = 0; for (let q = 0; q < 3; q++) s += J[a][q] * J[b][q]; A[a][b] = s + (a === b ? lambda * (1 + s) : 0); } for (let q = 0; q < 3; q++) g[a] += J[a][q] * r[q]; }
      let dvv;
      try { dvv = mat3mul(mat3inv([...A[0], ...A[1], ...A[2]]), g); } catch { break; }
      const nv = v.map((x, i) => clamp01(x + dvv[i]));
      const nl = labOf(nv[0], nv[1], nv[2], k, [0, 0, 0]);
      const ne = deltaE76(nl, target);
      if (ne < err) { v = nv; cur[0] = nl[0]; cur[1] = nl[1]; cur[2] = nl[2]; err = ne; lambda *= 0.3; }
      else { lambda *= 10; if (lambda > 1e6) break; }
    }
    return { v, err };
  }
  

  return function invert(xyz, out, opts = {}) {
    xyzToLab(xyz, lab);
    const target = lab.slice();
    const first = solveCMY(target, 0, opts.init ? opts.init.slice(0, 3) : null);
    const g = Math.min(first.v[0], first.v[1], first.v[2]);
    const L = target[0];
    let k = g <= 0.25 ? 0 : Math.pow((g - 0.25) / 0.75, 1.15) * 0.97;
    if (L < 12) k = Math.max(k, 0.9);
    let sol = k > 0 ? solveCMY(target, k, first.v.map(x => Math.max(0, x - k * 0.6))) : first;
    for (let guard = 0; guard < 8 && sol.v[0] + sol.v[1] + sol.v[2] + k > 3.0 && k < 1; guard++) {
      k = Math.min(1, k + 0.08); sol = solveCMY(target, k, sol.v);
    }
    
    const tac = sol.v[0] + sol.v[1] + sol.v[2] + k;
    if (tac > 3.0) { const s = (3.0 - k) / (sol.v[0] + sol.v[1] + sol.v[2]); sol.v = sol.v.map(x => x * s); }
    out[0] = sol.v[0]; out[1] = sol.v[1]; out[2] = sol.v[2]; out[3] = k;
    return out;
  };
}






export function genericCmykProfile(opts = {}) {
  if (!opts.gridB2A && memo.has('cmyk:pre')) return memo.get('cmyk:pre');
  const gB = opts.gridB2A || 21, gA = opts.gridA2B || 9;
  return once('cmyk:' + gB + ':' + gA, () => parseIcc(buildGenericCmykBytes(gB, gA)));
}

export async function loadGenericCmykProfile() {
  if (memo.has('cmyk:pre')) return memo.get('cmyk:pre');
  let P;
  try {
    const m = await import('./icc-cmyk-data.js');
    const bin = typeof atob === 'function' ? Uint8Array.from(atob(m.default), c => c.charCodeAt(0)) : Uint8Array.from(Buffer.from(m.default, 'base64'));
    P = parseIcc(bin);
  } catch { P = genericCmykProfile({ gridB2A: 21 }); }
  memo.set('cmyk:pre', P);
  return P;
}
export function buildGenericCmykBytes(gB = 25, gA = 11) {
  const { forward, paper } = cmykModel();
  const invert = makeCmykInverse();
  const lab = [0, 0, 0], xyz = [0, 0, 0];
  
  const relXYZ = (X, out) => { out[0] = X[0] / paper[0] * D50[0]; out[1] = X[1] / paper[1] * D50[1]; out[2] = X[2] / paper[2] * D50[2]; return out; };
  
  const nA = Math.pow(gA, 4), a2b = new Float64Array(nA * 3);
  let q = 0;
  for (let c = 0; c < gA; c++) for (let m = 0; m < gA; m++) for (let y = 0; y < gA; y++) for (let k = 0; k < gA; k++) {
    relXYZ(forward(c / (gA - 1), m / (gA - 1), y / (gA - 1), k / (gA - 1), [0, 0, 0]), xyz); xyzToLab(xyz, lab);
    a2b[q++] = lab[0] / 100 * 65280 / 65535; a2b[q++] = (lab[1] + 128) * 256 / 65535; a2b[q++] = (lab[2] + 128) * 256 / 65535;
  }
  
  const blackRel = relXYZ(forward(1, 1, 1, 1, [0, 0, 0]), [0, 0, 0]);
  const Lk = xyzToLab(blackRel)[0];
  
  
  const nB = Math.pow(gB, 3);
  const relT = new Float64Array(nB * 4), perT = new Float64Array(nB * 4);
  const outC = [0, 0, 0, 0], txyz = [0, 0, 0], chk = [0, 0, 0];
  const absFromRel = (x, o) => { o[0] = x[0] * paper[0] / D50[0]; o[1] = x[1] * paper[1] / D50[1]; o[2] = x[2] * paper[2] / D50[2]; return o; };
  const printable = (L, a, b, cmykOut) => {
    labToXyz([L, a, b], txyz); absFromRel(txyz, txyz);
    invert(txyz, cmykOut);
    xyzToLab(relXYZ(forward(cmykOut[0], cmykOut[1], cmykOut[2], cmykOut[3], [0, 0, 0]), [0, 0, 0]), chk);
    return deltaE76(chk, [L, a, b]);
  };
  




  const HUES = 72, LSTEP = 2.5, NL = Math.round(100 / LSTEP) + 1, KL = 2;
  const bound = new Float64Array(HUES * NL);
  {
    const tmp = [0, 0, 0, 0];
    for (let hI = 0; hI < HUES; hI++) {
      const h = hI / HUES * 2 * Math.PI, ca = Math.cos(h), sa = Math.sin(h);
      for (let li = 0; li < NL; li++) {
        const Lq = li * LSTEP;
        if (Lq <= Lk + 0.5 || Lq >= 99.5) { bound[hI * NL + li] = 0; continue; }
        let lo = 0, hi = 130;
        for (let it = 0; it < 9; it++) { const c = (lo + hi) / 2; if (printable(Lq, c * ca, c * sa, tmp) < 1.5) lo = c; else hi = c; }
        bound[hI * NL + li] = lo;
      }
    }
  }
  const boundAt = (hue, li) => {
    const f = hue / (2 * Math.PI) * HUES, i0 = Math.floor(f) % HUES, i1 = (i0 + 1) % HUES, t = f - Math.floor(f);
    return bound[i0 * NL + li] * (1 - t) + bound[i1 * NL + li] * t;
  };
  let p = 0;
  for (let i = 0; i < gB; i++) for (let j = 0; j < gB; j++) for (let l = 0; l < gB; l++) {
    const L = i / (gB - 1) * 100 * 65535 / 65280, a = j / (gB - 1) * 65535 / 256 - 128, b = l / (gB - 1) * 65535 / 256 - 128;
    const Lc = Math.min(100, L);
    printable(Lc, a, b, outC);
    relT.set(outC, p);
    
    const Lp = Lk + (Lc / 100) * (100 - Lk);
    let best = null;
    if (printable(Lp, a, b, outC) < 1.5) best = outC.slice();
    else {
      const C = Math.hypot(a, b);
      let hue = Math.atan2(b, a); if (hue < 0) hue += 2 * Math.PI;
      let bestCost = Infinity, bL = Lp, bC = 0;
      for (let li = 0; li < NL; li++) {
        const Lq = li * LSTEP, Cb = boundAt(hue, li);
        const cc = Math.min(C, Cb), dL = (Lp - Lq) / KL, dC = C - cc;
        const cost = dL * dL + dC * dC;
        if (cost < bestCost) { bestCost = cost; bL = Lq; bC = cc; }
      }
      const sc = C > 1e-6 ? bC / C : 0;
      for (let k = 0; k < 8 && !best; k++) {
        const f = sc * (1 - 0.03 * k);
        if (printable(bL, a * f, b * f, outC) < 1.5 || k === 7) best = outC.slice();
      }
    }
    perT.set(best, p);
    p += 4;
  }
  const bkpt = labToXyz([Lk, 0, 0]);
  const A2B = { lut16: { nIn: 4, nOut: 3, grid: gA, clut: a2b } };
  const B2Arel = { lut16: { nIn: 3, nOut: 4, grid: gB, clut: relT } };
  const B2Aper = { lut16: { nIn: 3, nOut: 4, grid: gB, clut: perT } };
  const white = paper.map((v, i) => v / labToXyz(CMYK_PRIM.W)[1] * 1);   
  return writeIcc({
    deviceClass: 'prtr', colorSpace: 'CMYK', pcs: 'Lab ', description: 'PSD Editor Generic CMYK (Coated model, 300% TAC, Medium GCR)',
    copyright: 'Generated by PSD Editor from a public printing model; no vendor data. Free to use.',
    wtpt: labToXyz(CMYK_PRIM.W), bkpt,
    tags: { A2B0: A2B, A2B1: { same: 'A2B0' }, A2B2: { same: 'A2B0' }, B2A0: B2Aper, B2A1: B2Arel, B2A2: { same: 'B2A0' } },
  });
}


export function writeDeviceLink({ nIn, nOut, grid, evalFn, description, srcSpace = 'RGB ', dstSpace = 'RGB ' }) {
  const n = Math.pow(grid, nIn), clut = new Float64Array(n * nOut);
  const idx = new Array(nIn).fill(0), inp = new Float64Array(nIn), out = new Float64Array(nOut);
  for (let q = 0; q < n; q++) {
    let r = q; for (let d = nIn - 1; d >= 0; d--) { idx[d] = r % grid; r = (r / grid) | 0; }
    for (let d = 0; d < nIn; d++) inp[d] = idx[d] / (grid - 1);
    evalFn(inp, out);
    for (let c = 0; c < nOut; c++) clut[q * nOut + c] = out[c];
  }
  return writeIcc({ deviceClass: 'link', colorSpace: srcSpace, pcs: dstSpace, description: description || 'PSD Editor Device Link',
    tags: { A2B0: { lut16: { nIn, nOut, grid, clut } } } });
}


export function profileInfo(P) {
  return { name: P.name, version: P.version, deviceClass: P.deviceClass, colorSpace: P.colorSpace.trim(), pcs: P.pcs.trim(), kind: P.kind, bytes: P.bytes ? P.bytes.length : 0 };
}

export default { parseIcc, writeIcc, sRGBProfile, displayP3Profile, macRgbProfile, grayProfile, labProfile, genericCmykProfile, writeDeviceLink, xyzToLab, labToXyz, deltaE76, D50 };
