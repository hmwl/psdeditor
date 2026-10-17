
















import { parseIcc, writeDeviceLink, sRGBProfile } from './icc.js';
import { buildTransform } from './color-convert.js';

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const textOf = b => typeof b === 'string' ? b : new TextDecoder('utf-8').decode(b instanceof Uint8Array ? b : new Uint8Array(b));



export function parseCube(src) {
  const lines = textOf(src).split(/\r?\n/);
  let size3 = 0, size1 = 0, title = '', min = [0, 0, 0], max = [1, 1, 1];
  const vals = [];
  for (let raw of lines) {
    const ln = raw.replace(/#.*$/, '').trim(); if (!ln) continue;
    const kw = ln.split(/\s+/);
    const k = kw[0].toUpperCase();
    if (k === 'TITLE') { title = ln.replace(/^TITLE\s+/i, '').replace(/^"|"$/g, ''); continue; }
    if (k === 'LUT_3D_SIZE') { size3 = +kw[1]; continue; }
    if (k === 'LUT_1D_SIZE') { size1 = +kw[1]; continue; }
    if (k === 'DOMAIN_MIN') { min = kw.slice(1, 4).map(Number); continue; }
    if (k === 'DOMAIN_MAX') { max = kw.slice(1, 4).map(Number); continue; }
    if (k === 'LUT_1D_INPUT_RANGE' || k === 'LUT_3D_INPUT_RANGE') { min = [+kw[1], +kw[1], +kw[1]]; max = [+kw[2], +kw[2], +kw[2]]; continue; }
    if (/^[A-Z_]+$/.test(k)) continue;                      
    if (kw.length >= 3) vals.push(+kw[0], +kw[1], +kw[2]);
  }
  if (size3) {
    if (vals.length < size3 ** 3 * 3) throw new Error(`.cube 数据不足：需要 ${size3 ** 3} 行，只有 ${vals.length / 3} 行`);
    return { kind: '3d', size: size3, data: Float32Array.from(vals.slice(0, size3 ** 3 * 3)), min, max, title, format: 'cube' };
  }
  if (size1) {
    if (vals.length < size1 * 3) throw new Error('.cube 1D 数据不足');
    return { kind: '1d', size: size1, data: Float32Array.from(vals.slice(0, size1 * 3)), min, max, title, format: 'cube' };
  }
  throw new Error('.cube 缺少 LUT_3D_SIZE / LUT_1D_SIZE');
}


export function parse3dl(src) {
  const lines = textOf(src).split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
  let mesh = null; const rows = [];
  for (const l of lines) {
    if (/^3DMESH|^Mesh/i.test(l)) continue;
    const p = l.split(/\s+/).map(Number);
    if (p.some(v => !Number.isFinite(v))) continue;
    if (!mesh && p.length > 3) { mesh = p; continue; }
    if (p.length === 3) rows.push(p);
  }
  const N = mesh ? mesh.length : Math.round(Math.cbrt(rows.length));
  if (N < 2 || rows.length < N ** 3) throw new Error(`.3dl 数据行数 ${rows.length} 与网格 ${N}³ 不符`);
  let mx = 0; for (const r of rows) for (const v of r) if (v > mx) mx = v;
  const outMax = mx <= 1.0001 ? 1 : mx <= 1023 ? 1023 : mx <= 4095 ? 4095 : mx <= 16383 ? 16383 : 65535;
  const data = new Float32Array(N ** 3 * 3);
  
  for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
    const src3 = rows[(r * N + g) * N + b], o = ((b * N + g) * N + r) * 3;
    data[o] = src3[0] / outMax; data[o + 1] = src3[1] / outMax; data[o + 2] = src3[2] / outMax;
  }
  return { kind: '3d', size: N, data, min: [0, 0, 0], max: [1, 1, 1], title: '', format: '3dl' };
}


export function parseCsp(src) {
  const lines = textOf(src).split(/\r?\n/).map(l => l.trim());
  let i = 0;
  if (!/^CSPLUTV100/.test(lines[i++] || '')) throw new Error('不是 CSP 文件（缺少 CSPLUTV100）');
  const type = (lines[i++] || '').toUpperCase();
  while (i < lines.length && !lines[i]) i++;
  if (lines[i] === 'BEGIN METADATA') { while (i < lines.length && lines[i] !== 'END METADATA') i++; i++; }
  while (i < lines.length && !lines[i]) i++;
  const shaper = [];
  for (let c = 0; c < 3; c++) {
    while (i < lines.length && !lines[i]) i++;
    const n = +lines[i++]; const ins = lines[i++].split(/\s+/).map(Number), outs = lines[i++].split(/\s+/).map(Number);
    if (ins.length !== n || outs.length !== n) throw new Error('CSP 预整形曲线点数不一致');
    shaper.push({ ins, outs });
  }
  const shapeFn = s => v => { const { ins, outs } = s; if (v <= ins[0]) return outs[0]; for (let k = 1; k < ins.length; k++) if (v <= ins[k]) { const t = (v - ins[k - 1]) / (ins[k] - ins[k - 1] || 1); return outs[k - 1] + (outs[k] - outs[k - 1]) * t; } return outs[outs.length - 1]; };
  while (i < lines.length && !lines[i]) i++;
  if (type === '1D') {
    const n = +lines[i++]; const data = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const p = lines[i++].split(/\s+/).map(Number); data.set(p.slice(0, 3), k * 3); }
    return { kind: '1d', size: n, data, min: [0, 0, 0], max: [1, 1, 1], shaper: shaper.map(shapeFn), title: '', format: 'csp' };
  }
  const dims = lines[i++].split(/\s+/).map(Number), N = dims[0];
  const data = new Float32Array(N ** 3 * 3);
  for (let k = 0; k < N ** 3; k++) { while (i < lines.length && !lines[i]) i++; const p = (lines[i++] || '').split(/\s+/).map(Number); data[k * 3] = p[0]; data[k * 3 + 1] = p[1]; data[k * 3 + 2] = p[2]; }
  return { kind: '3d', size: N, data, min: [0, 0, 0], max: [1, 1, 1], shaper: shaper.map(shapeFn), title: '', format: 'csp' };
}


export function parseLook(src) {
  const t = textOf(src);
  const size = +((t.match(/<size>\s*"?(\d+)"?\s*<\/size>/i) || [])[1] || 0);
  const dataStr = ((t.match(/<data>([\s\S]*?)<\/data>/i) || [])[1] || '').replace(/[\s"]/g, '');
  if (!size || !dataStr) throw new Error('.look 里没找到 <size>/<data>：这个 .look 可能只含调色参数、不含查找表');
  const n = size ** 3 * 3;
  const data = new Float32Array(n);
  if (/^[0-9a-f]+$/i.test(dataStr) && dataStr.length >= n * 8) {
    const dv = new DataView(new ArrayBuffer(4));
    for (let k = 0; k < n; k++) { for (let b = 0; b < 4; b++) dv.setUint8(b, parseInt(dataStr.substr(k * 8 + b * 2, 2), 16)); data[k] = dv.getFloat32(0, true); }
  } else throw new Error('.look 的 <data> 不是十六进制 float32');
  return { kind: '3d', size, data, min: [0, 0, 0], max: [1, 1, 1], title: '', format: 'look' };
}


export function parseLut(bytes, name = '') {
  const ext = (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const isIcc = u8.length > 40 && String.fromCharCode(u8[36], u8[37], u8[38], u8[39]) === 'acsp';
  if (isIcc || ext === 'icc' || ext === 'icm') {
    const P = parseIcc(u8);
    return { kind: 'icc', profile: P, format: 'icc', title: P.name };
  }
  if (ext === '3dl') return parse3dl(u8);
  if (ext === 'csp') return parseCsp(u8);
  if (ext === 'look') return parseLook(u8);
  const head = textOf(u8.subarray(0, 64));
  if (/CSPLUTV100/.test(head)) return parseCsp(u8);
  if (/<\?xml|<look/i.test(head)) return parseLook(u8);
  try { return parseCube(u8); } catch (e) { if (ext === 'cube') throw e; return parse3dl(u8); }
}




export function lutEvaluator(L, interp = 'tetrahedral') {
  if (L.kind === 'icc') {
    const P = L.profile;
    if (P.link) return (i, o) => P.link.eval(i, o);
    
    const s = sRGBProfile();
    if (P.deviceClass === 'abst' && P.tags.A2B0) {
      const xf1 = buildTransform(s, P, { intent: 0 }), xf2 = buildTransform(P, s, { intent: 0 });
      const t = new Float64Array(3);
      return (i, o) => { xf1.eval(i, t); return xf2.eval(t, o); };
    }
    const xf = buildTransform(s, P, { intent: 0 }), back = buildTransform(P, s, { intent: 0 }), t = new Float64Array(P.nChannels || 3);
    return (i, o) => { xf.eval(i, t); return back.eval(t, o); };
  }
  const { size: N, data, min, max } = L;
  const sh = L.shaper || null;
  const norm = (v, c) => { let x = sh ? sh[c](v) : v; x = (x - min[c]) / ((max[c] - min[c]) || 1); return clamp01(x); };
  if (L.kind === '1d') {
    return (i, o) => { for (let c = 0; c < 3; c++) { const p = norm(i[c], c) * (N - 1), k = Math.min(N - 2, p | 0), f = p - k; o[c] = data[k * 3 + c] + (data[(k + 1) * 3 + c] - data[k * 3 + c]) * f; } return o; };
  }
  const G = N - 1, X = 3, Y = N * 3, Z = N * N * 3;   
  if (interp === 'trilinear') {
    return (i, o) => {
      const px = norm(i[0], 0) * G, py = norm(i[1], 1) * G, pz = norm(i[2], 2) * G;
      const x = Math.min(G - 1, px | 0), y = Math.min(G - 1, py | 0), z = Math.min(G - 1, pz | 0), fx = px - x, fy = py - y, fz = pz - z;
      const b = x * X + y * Y + z * Z;
      for (let c = 0; c < 3; c++) {
        const d = (q) => data[b + q + c];
        const c00 = d(0) + (d(X) - d(0)) * fx, c10 = d(Y) + (d(X + Y) - d(Y)) * fx, c01 = d(Z) + (d(X + Z) - d(Z)) * fx, c11 = d(Y + Z) + (d(X + Y + Z) - d(Y + Z)) * fx;
        const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy; o[c] = c0 + (c1 - c0) * fz;
      }
      return o;
    };
  }
  return (i, o) => {
    const px = norm(i[0], 0) * G, py = norm(i[1], 1) * G, pz = norm(i[2], 2) * G;
    const x = Math.min(G - 1, px | 0), y = Math.min(G - 1, py | 0), z = Math.min(G - 1, pz | 0), rx = px - x, ry = py - y, rz = pz - z;
    const b = x * X + y * Y + z * Z, T = data;
    for (let c = 0; c < 3; c++) {
      const c000 = T[b + c], c111 = T[b + X + Y + Z + c]; let v;
      if (rx >= ry) {
        if (ry >= rz) v = c000 + rx * (T[b + X + c] - c000) + ry * (T[b + X + Y + c] - T[b + X + c]) + rz * (c111 - T[b + X + Y + c]);
        else if (rx >= rz) v = c000 + rx * (T[b + X + c] - c000) + rz * (T[b + X + Z + c] - T[b + X + c]) + ry * (c111 - T[b + X + Z + c]);
        else v = c000 + rz * (T[b + Z + c] - c000) + rx * (T[b + X + Z + c] - T[b + Z + c]) + ry * (c111 - T[b + X + Z + c]);
      } else if (rz >= ry) v = c000 + rz * (T[b + Z + c] - c000) + ry * (T[b + Y + Z + c] - T[b + Z + c]) + rx * (c111 - T[b + Y + Z + c]);
      else if (rz >= rx) v = c000 + ry * (T[b + Y + c] - c000) + rz * (T[b + Y + Z + c] - T[b + Y + c]) + rx * (c111 - T[b + Y + Z + c]);
      else v = c000 + ry * (T[b + Y + c] - c000) + rx * (T[b + X + Y + c] - T[b + Y + c]) + rz * (c111 - T[b + X + Y + c]);
      o[c] = v;
    }
    return o;
  };
}





export function applyLutRGBA(rgba, L, opts = {}) {
  const ev = lutEvaluator(L, opts.interp);
  const out = new Uint8ClampedArray(rgba.length);
  const bgr = opts.order === 'bgr';
  const i3 = new Float64Array(3), o3 = new Float64Array(3);
  const cache = new Map();
  const dither = !!opts.dither;
  for (let p = 0, px = 0; p < rgba.length; p += 4, px++) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const key = r | (g << 8) | (b << 16);
    let hit = dither ? undefined : cache.get(key);
    if (hit === undefined) {
      if (bgr) { i3[0] = b / 255; i3[1] = g / 255; i3[2] = r / 255; } else { i3[0] = r / 255; i3[1] = g / 255; i3[2] = b / 255; }
      ev(i3, o3);
      if (bgr) { const t = o3[0]; o3[0] = o3[2]; o3[2] = t; }
      if (dither) { const d = ((px * 2654435761) >>> 24) / 256 - 0.5; hit = [clamp01(o3[0]) * 255 + d, clamp01(o3[1]) * 255 + d, clamp01(o3[2]) * 255 + d]; }
      else { hit = [Math.round(clamp01(o3[0]) * 255), Math.round(clamp01(o3[1]) * 255), Math.round(clamp01(o3[2]) * 255)]; if (cache.size < 1 << 18) cache.set(key, hit); }
    }
    out[p] = hit[0]; out[p + 1] = hit[1]; out[p + 2] = hit[2]; out[p + 3] = rgba[p + 3];
  }
  return out;
}




export function sampleToLut(fn, N = 33) {
  const data = new Float32Array(N ** 3 * 3), i3 = new Float64Array(3), o3 = new Float64Array(3);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    i3[0] = r / (N - 1); i3[1] = g / (N - 1); i3[2] = b / (N - 1); fn(i3, o3);
    const o = ((b * N + g) * N + r) * 3; data[o] = clamp01(o3[0]); data[o + 1] = clamp01(o3[1]); data[o + 2] = clamp01(o3[2]);
  }
  return { kind: '3d', size: N, data, min: [0, 0, 0], max: [1, 1, 1], title: '', format: 'cube' };
}
const f6 = v => (Math.round(v * 1e6) / 1e6).toFixed(6);
export function writeCube(L, o = {}) {
  const N = L.size, lines = [`# Created by PSD Editor`, `TITLE "${(o.title || L.title || 'PSD Editor LUT').replace(/"/g, "'")}"`];
  if (o.copyright) lines.push(`# ${o.copyright}`);
  lines.push(`LUT_3D_SIZE ${N}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0');
  for (let k = 0; k < N ** 3; k++) lines.push(`${f6(L.data[k * 3])} ${f6(L.data[k * 3 + 1])} ${f6(L.data[k * 3 + 2])}`);
  return lines.join('\n') + '\n';
}
export function write3dl(L, o = {}) {
  const N = L.size, maxOut = o.bits === 10 ? 1023 : o.bits === 16 ? 65535 : 4095;
  const meshMax = 1023, lines = [];
  lines.push(Array.from({ length: N }, (_, i) => Math.round(i * meshMax / (N - 1))).join(' '));
  for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
    const k = ((b * N + g) * N + r) * 3;
    lines.push(`${Math.round(clamp01(L.data[k]) * maxOut)} ${Math.round(clamp01(L.data[k + 1]) * maxOut)} ${Math.round(clamp01(L.data[k + 2]) * maxOut)}`);
  }
  return lines.join('\n') + '\n';
}
export function writeCsp(L, o = {}) {
  const N = L.size, lines = ['CSPLUTV100', '3D', '', 'BEGIN METADATA', (o.title || L.title || 'PSD Editor LUT'), 'END METADATA', ''];
  for (let c = 0; c < 3; c++) lines.push('2', '0.0 1.0', '0.0 1.0');
  lines.push('', `${N} ${N} ${N}`);
  for (let k = 0; k < N ** 3; k++) lines.push(`${f6(L.data[k * 3])} ${f6(L.data[k * 3 + 1])} ${f6(L.data[k * 3 + 2])}`);
  return lines.join('\n') + '\n';
}
export function writeIccLink(L, o = {}) {
  const ev = lutEvaluator(L);
  return writeDeviceLink({ nIn: 3, nOut: 3, grid: Math.min(33, L.size || 33), evalFn: ev, description: o.title || L.title || 'PSD Editor Color Lookup' });
}

export const LUT_EXTS = ['.cube', '.3dl', '.look', '.csp', '.icc', '.icm'];
export default { parseLut, parseCube, parse3dl, parseCsp, parseLook, lutEvaluator, applyLutRGBA, sampleToLut, writeCube, write3dl, writeCsp, writeIccLink };
