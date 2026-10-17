















import { D50, xyzToLab, labToXyz, deltaE76, sRGBProfile, labProfile } from './icc.js';

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;


export function blackPoint(P, intent = 1) {
  if (!P) return [0, 0, 0];
  if (P.colorSpace === 'Lab ' || P.colorSpace === 'XYZ ') return [0, 0, 0];
  const to = P.toPCS(intent === 3 ? 1 : intent), from = P.fromPCS(intent === 3 ? 1 : intent);
  if (!to) return [0, 0, 0];
  const n = P.nChannels || 3, dev = new Float64Array(n), xyz = [0, 0, 0];
  if (P.colorSpace === 'CMYK' || P.colorSpace === 'CMY ' || /CLR$/.test(P.colorSpace)) {
    if (from) { from([0, 0, 0], dev); to(dev, xyz); } else { dev.fill(1); to(dev, xyz); }
  } else { dev.fill(0); to(dev, xyz); }
  
  const Y = Math.max(0, Math.min(0.5, xyz[1]));
  return [D50[0] * Y, Y, D50[2] * Y];
}





export function buildTransform(src, dst, o = {}) {
  const intent = o.intent == null ? 0 : o.intent;
  if (src && src.link && !dst) return { nIn: src.link.nIn, nOut: src.link.nOut, eval: src.link.eval, src, dst: null, intent, bpc: false };
  const to = src.toPCS(intent), from = dst.fromPCS(intent);
  if (!to) throw new Error(`源配置文件「${src.name}」没有可用的「设备 → PCS」数据`);
  if (!from) throw new Error(`目标配置文件「${dst.name}」没有可用的「PCS → 设备」数据`);
  const bpc = !!o.bpc && intent !== 3;
  const nIn = src.nChannels || 3, nOut = dst.nChannels || 3;
  const xyz = [0, 0, 0];
  let fix = null;
  if (bpc) {
    const Bs = blackPoint(src, intent), Bd = blackPoint(dst, intent);
    if (Math.abs(Bs[1] - Bd[1]) > 1e-5) {
      const k = [0, 1, 2].map(i => (D50[i] - Bd[i]) / (D50[i] - Bs[i]));
      fix = v => { for (let i = 0; i < 3; i++) v[i] = Bd[i] + (v[i] - Bs[i]) * k[i]; };
    }
  }
  const ev = (inp, out) => { to(inp, xyz); if (fix) fix(xyz); return from(xyz, out); };
  return { nIn, nOut, eval: ev, src, dst, intent, bpc };
}


export function toXYZ(P, dev, intent = 1) { const xyz = [0, 0, 0]; P.toPCS(intent)(dev, xyz); return xyz; }





export function compileTransform(xf, o = {}) {
  const nIn = xf.nIn, nOut = xf.nOut;
  if (nIn === 1) {
    const N = 4096, t = new Float32Array((N + 1) * nOut), inp = [0], out = new Float64Array(nOut);
    for (let i = 0; i <= N; i++) { inp[0] = i / N; xf.eval(inp, out); for (let c = 0; c < nOut; c++) t[i * nOut + c] = out[c]; }
    return { nIn, nOut, apply(inp, o2) { const p = clamp01(inp[0]) * N, i = Math.min(N - 1, p | 0), f = p - i; for (let c = 0; c < nOut; c++) o2[c] = t[i * nOut + c] + (t[(i + 1) * nOut + c] - t[i * nOut + c]) * f; return o2; } };
  }
  if (nIn !== 3 && nIn !== 4) return { nIn, nOut, apply: (i, o2) => xf.eval(i, o2) };
  const g = o.grid || (nIn === 3 ? 33 : 17), gk = nIn === 4 ? (o.gridK || 17) : 1;
  const stride = nOut, sz = g * g, table = new Float32Array(g * g * g * gk * nOut);
  const inp = new Float64Array(nIn), out = new Float64Array(nOut);
  let q = 0;
  for (let k = 0; k < gk; k++) for (let a = 0; a < g; a++) for (let b = 0; b < g; b++) for (let c = 0; c < g; c++) {
    inp[0] = a / (g - 1); inp[1] = b / (g - 1); inp[2] = c / (g - 1); if (nIn === 4) inp[3] = k / (gk - 1);
    xf.eval(inp, out);
    for (let d = 0; d < nOut; d++) table[q++] = out[d];
  }
  const X = sz * stride, Y = g * stride, Z = stride;
  const tet = (base, rx, ry, rz, c) => {
    const T = table, c000 = T[base + c], c111 = T[base + X + Y + Z + c];
    if (rx >= ry) {
      if (ry >= rz) return c000 + rx * (T[base + X + c] - c000) + ry * (T[base + X + Y + c] - T[base + X + c]) + rz * (c111 - T[base + X + Y + c]);
      if (rx >= rz) return c000 + rx * (T[base + X + c] - c000) + rz * (T[base + X + Z + c] - T[base + X + c]) + ry * (c111 - T[base + X + Z + c]);
      return c000 + rz * (T[base + Z + c] - c000) + rx * (T[base + X + Z + c] - T[base + Z + c]) + ry * (c111 - T[base + X + Z + c]);
    }
    if (rz >= ry) return c000 + rz * (T[base + Z + c] - c000) + ry * (T[base + Y + Z + c] - T[base + Z + c]) + rx * (c111 - T[base + Y + Z + c]);
    if (rz >= rx) return c000 + ry * (T[base + Y + c] - c000) + rz * (T[base + Y + Z + c] - T[base + Y + c]) + rx * (c111 - T[base + Y + Z + c]);
    return c000 + ry * (T[base + Y + c] - c000) + rx * (T[base + X + Y + c] - T[base + Y + c]) + rz * (c111 - T[base + X + Y + c]);
  };
  const G = g - 1, KS = g * g * g * stride;
  return {
    nIn, nOut, grid: g, table,
    apply(i3, o2) {
      const px = clamp01(i3[0]) * G, py = clamp01(i3[1]) * G, pz = clamp01(i3[2]) * G;
      const x = px >= G ? G - 1 : px | 0, y = py >= G ? G - 1 : py | 0, z = pz >= G ? G - 1 : pz | 0;
      const rx = px - x, ry = py - y, rz = pz - z;
      let base = x * X + y * Y + z * Z;
      if (nIn === 3) { for (let c = 0; c < nOut; c++) o2[c] = tet(base, rx, ry, rz, c); return o2; }
      const pk = clamp01(i3[3]) * (gk - 1), k = pk >= gk - 1 ? gk - 2 : pk | 0, rk = pk - k;
      base += k * KS;
      for (let c = 0; c < nOut; c++) { const a = tet(base, rx, ry, rz, c), b = tet(base + KS, rx, ry, rz, c); o2[c] = a + (b - a) * rk; }
      return o2;
    },
  };
}








export function convertPlanes(fast, inPlanes, n, o = {}) {
  const inMax = o.inMax || 255, outMax = o.outMax || 255, OutT = o.outType || Uint8Array;
  const nIn = fast.nIn, nOut = fast.nOut, float = OutT === Float32Array;
  const outs = []; for (let c = 0; c < nOut; c++) outs.push(new OutT(n));
  const inp = new Float64Array(nIn), out = new Float64Array(nOut);
  const invI = !!o.invertIn, invO = !!o.invertOut;
  
  const cache = (!float && inMax === 255 && nIn <= 3) ? new Map() : null;
  for (let i = 0; i < n; i++) {
    let key = 0;
    if (cache) { key = inPlanes[0][i] | ((nIn > 1 ? inPlanes[1][i] : 0) << 8) | ((nIn > 2 ? inPlanes[2][i] : 0) << 16); const hit = cache.get(key); if (hit !== undefined) { for (let c = 0; c < nOut; c++) outs[c][i] = hit[c]; continue; } }
    for (let c = 0; c < nIn; c++) { let v = inPlanes[c][i] / inMax; if (invI) v = 1 - v; inp[c] = v; }
    fast.apply(inp, out);
    for (let c = 0; c < nOut; c++) { let v = clamp01(out[c]); if (invO) v = 1 - v; outs[c][i] = float ? v * outMax : Math.round(v * outMax); }
    if (cache && cache.size < 1 << 18) { const r = new Array(nOut); for (let c = 0; c < nOut; c++) r[c] = outs[c][i]; cache.set(key, r); }
  }
  return outs;
}


export function gamutChecker(rgbProfile, cmykProfile, o = {}) {
  const intent = o.intent == null ? 1 : o.intent;
  const to = rgbProfile.toPCS(1), f = cmykProfile.fromPCS(intent), b = cmykProfile.toPCS(1);
  const xyz = [0, 0, 0], dev = new Float64Array(cmykProfile.nChannels || 4), x2 = [0, 0, 0], l1 = [0, 0, 0], l2 = [0, 0, 0];
  const g = 17, table = new Float32Array(g * g * g);
  const inp = [0, 0, 0];
  const Lk = xyzToLab(blackPoint(cmykProfile, 1))[0];
  for (let r = 0, q = 0; r < g; r++) for (let gg = 0; gg < g; gg++) for (let bb = 0; bb < g; bb++, q++) {
    inp[0] = r / (g - 1); inp[1] = gg / (g - 1); inp[2] = bb / (g - 1);
    to(inp, xyz); f(xyz, dev); b(dev, x2); xyzToLab(xyz, l1);
    if (l1[0] < Lk) l1[0] = Lk;                      
    table[q] = deltaE76(l1, xyzToLab(x2, l2));
  }
  
  return (r, gg, bb) => {
    const G = g - 1, px = clamp01(r) * G, py = clamp01(gg) * G, pz = clamp01(bb) * G;
    const x = Math.min(G - 1, px | 0), y = Math.min(G - 1, py | 0), z = Math.min(G - 1, pz | 0), fx = px - x, fy = py - y, fz = pz - z;
    const at = (a, bq, c) => table[(a * g + bq) * g + c];
    const l = (a, bq) => at(a, bq, z) + (at(a, bq, z + 1) - at(a, bq, z)) * fz;
    const m0 = l(x, y) + (l(x, y + 1) - l(x, y)) * fy, m1 = l(x + 1, y) + (l(x + 1, y + 1) - l(x + 1, y)) * fy;
    return m0 + (m1 - m0) * fx;
  };
}





const CODECS = new Map();
export function setModeCodec(mode, codec) { if (codec) CODECS.set(mode, codec); else CODECS.delete(mode); }
export function getModeCodec(mode) { return CODECS.get(mode) || null; }


export function makeCodec(docProfile, o = {}) {
  const srgb = o.display || sRGBProfile();
  const intent = o.intent == null ? 0 : o.intent;
  const n = docProfile.nChannels || 3;
  const toRgb = compileTransform(buildTransform(docProfile, srgb, { intent, bpc: o.bpc !== false }), { grid: n === 4 ? 17 : 33, gridK: 17 });
  const fromRgb = compileTransform(buildTransform(srgb, docProfile, { intent, bpc: o.bpc !== false }), { grid: 33 });
  const inv = docProfile.colorSpace === 'CMYK';
  const a = new Float64Array(n), b = new Float64Array(3), c = new Float64Array(n), rgb3 = new Float64Array(3);
  
  const cache = new Map();
  return {
    profile: docProfile, nChannels: n,
    toRgb8(planes, i, out, sampleMax = 255) {
      for (let k = 0; k < n; k++) { const v = planes[k] ? planes[k][i] / sampleMax : (inv ? 1 : 0); a[k] = inv ? 1 - v : v; }
      toRgb.apply(a, b);
      out[0] = Math.round(clamp01(b[0]) * 255); out[1] = Math.round(clamp01(b[1]) * 255); out[2] = Math.round(clamp01(b[2]) * 255);
      return out;
    },
    fromRgb8(r, g, bb, out) {
      const key = r | (g << 8) | (bb << 16), hit = cache.get(key);
      if (hit) { for (let k = 0; k < n; k++) out[k] = hit[k]; return out; }
      rgb3[0] = r / 255; rgb3[1] = g / 255; rgb3[2] = bb / 255;
      fromRgb.apply(rgb3, c);
      const res = new Array(n);
      for (let k = 0; k < n; k++) { const v = clamp01(c[k]); res[k] = out[k] = Math.round((inv ? 1 - v : v) * 255); }
      if (cache.size < 1 << 17) cache.set(key, res);
      return out;
    },
  };
}


export function rgbToProfile(rgb8, dst, o = {}) {
  const xf = buildTransform(o.src || sRGBProfile(), dst, { intent: o.intent == null ? 1 : o.intent, bpc: o.bpc !== false });
  const out = new Float64Array(dst.nChannels || 3); xf.eval([rgb8[0] / 255, rgb8[1] / 255, rgb8[2] / 255], out); return Array.from(out);
}


const FLOAT_PREVIEW = { method: 'exposureGamma', exposure: 0, gamma: 1 };
export function setFloatPreview(o) { Object.assign(FLOAT_PREVIEW, o || {}); FLOAT_PREVIEW._k = Math.pow(2, FLOAT_PREVIEW.exposure || 0); }
export function getFloatPreview() { return { ...FLOAT_PREVIEW }; }
FLOAT_PREVIEW._k = 1;
const enc = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

export function floatToDisplayByte(v) {
  if (!(v > 0)) return 0;
  let x;
  if (FLOAT_PREVIEW.method === 'highlightCompression') x = v / (1 + v);
  else x = v * FLOAT_PREVIEW._k;
  if (x >= 1) return 255;
  let e = enc(x);
  if (FLOAT_PREVIEW.gamma && FLOAT_PREVIEW.gamma !== 1 && FLOAT_PREVIEW.method !== 'highlightCompression') e = Math.pow(e, 1 / FLOAT_PREVIEW.gamma);
  return Math.round(e * 255);
}
const dec = e => e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);

export function displayByteToFloat(b) {
  if (!(b > 0)) return 0;
  let e = Math.min(255, b) / 255;
  const hc = FLOAT_PREVIEW.method === 'highlightCompression';
  if (!hc && FLOAT_PREVIEW.gamma && FLOAT_PREVIEW.gamma !== 1) e = Math.pow(e, FLOAT_PREVIEW.gamma);
  const x = dec(e);
  if (hc) return x >= 1 ? 1e4 : x / (1 - x);
  return x / (FLOAT_PREVIEW._k || 1);
}
export { xyzToLab, labToXyz, deltaE76, labProfile };
export default { buildTransform, compileTransform, convertPlanes, gamutChecker, makeCodec, setModeCodec, getModeCodec, blackPoint, rgbToProfile };
