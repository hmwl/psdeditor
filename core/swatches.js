


















const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r255 = v => Math.round(clamp(v, 0, 255));


export function hsbToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60; s /= 100; v /= 100;
  const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map(x => r255(x * 255));
}
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f = t => t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29);
  const X = 0.9642 * f(fx), Y = f(fy), Z = 0.8249 * f(fz);
  return [3.1339 * X - 1.6169 * Y - 0.4906 * Z, -0.9785 * X + 1.9160 * Y + 0.0334 * Z, 0.0720 * X - 0.2290 * Y + 1.4057 * Z]
    .map(v => r255(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055)));
}
export const cmykToRgb = (c, m, y, k) => [c, m, y].map(x => r255(255 * (1 - x / 100) * (1 - k / 100)));
export function modelToRgb(model, v) {
  switch (model) {
    case 'xyz': {
      const [X, Y, Z] = v;
      return [3.1339 * X - 1.6169 * Y - .4906 * Z, -.9785 * X + 1.9160 * Y + .0334 * Z, .0720 * X - .2290 * Y + 1.4057 * Z]
        .map(c => r255(255 * (c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - .055)));
    }
    case 'hsb': return hsbToRgb(v[0], v[1], v[2]);
    case 'cmyk': return cmykToRgb(v[0], v[1], v[2], v[3]);
    case 'lab': return labToRgb(v[0], v[1], v[2]);
    case 'gray': { const g = r255(255 * (1 - v[0] / 100)); return [g, g, g]; }
    default: return [r255(v[0]), r255(v[1]), r255(v[2])];
  }
}
export function rgbSwatch(rgb, name = '') {
  const c = rgb.map(r255);
  return { name, color: c, model: 'rgb', values: c.slice() };
}


function acoDecode(space, w, x, y, z) {
  const s16 = v => (v > 32767 ? v - 65536 : v);
  switch (space) {
    case 0: return { model: 'rgb', values: [w / 257, x / 257, y / 257].map(v => Math.round(v * 100) / 100) };
    case 1: return { model: 'hsb', values: [w / 65535 * 360, x / 65535 * 100, y / 65535 * 100] };
    case 2: return { model: 'cmyk', values: [w, x, y, z].map(v => (65535 - v) / 65535 * 100) };
    case 7: return { model: 'lab', values: [w / 100, s16(x) / 100, s16(y) / 100] };
    case 8: return { model: 'gray', values: [w / 100] };
    default: return null;
  }
}
function acoEncode(sw) {
  const v = sw.values || sw.color, m = sw.values ? sw.model : 'rgb';
  const u = n => Math.round(clamp(n, 0, 65535));
  const s = n => { const k = Math.round(clamp(n, -32768, 32767)); return k < 0 ? k + 65536 : k; };
  switch (m) {
    case 'hsb': return [1, u(v[0] / 360 * 65535), u(v[1] / 100 * 65535), u(v[2] / 100 * 65535), 0];
    case 'cmyk': return [2, ...[0, 1, 2, 3].map(i => u(65535 - v[i] / 100 * 65535))];
    case 'lab': return [7, u(v[0] * 100), s(v[1] * 100), s(v[2] * 100), 0];
    case 'gray': return [8, u(v[0] * 100), 0, 0, 0];
    default: return [0, u(v[0] * 257), u(v[1] * 257), u(v[2] * 257), 0];
  }
}
export function readAco(bytes) {
  const u8 = toU8(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  const u16 = () => { if (o + 2 > u8.length) throw new Error('.aco 数据被截断'); const v = dv.getUint16(o); o += 2; return v; };
  const readSection = v2 => {
    const count = u16(), out = [];
    for (let i = 0; i < count; i++) {
      const space = u16();
      
      
      let d;
      if (space === 20) {
        if (o + 12 > u8.length) throw new Error('.aco XYZ 数据被截断');
        d = { model: 'xyz', values: [0, 4, 8].map(k => dv.getFloat32(o + k)) }; o += 12;
      } else d = acoDecode(space, u16(), u16(), u16(), u16());
      let name = '';
      if (v2) {
        if (o + 4 > u8.length) throw new Error('.aco v2 名字被截断');
        const n = dv.getUint32(o); o += 4;
        for (let k = 0; k < n; k++) { const c = u16(); if (c) name += String.fromCharCode(c); }
      }
      out.push(d ? { name, ...d, color: modelToRgb(d.model, d.values) } : { name, model: 'rgb', values: [0, 0, 0], color: [0, 0, 0], unsupported: space });
    }
    return out;
  };
  const ver = u16();
  if (ver !== 1 && ver !== 2) throw new Error('不是 Photoshop 色板文件（版本 ' + ver + '）');
  let list = readSection(ver === 2);
  if (ver === 1 && o + 4 <= u8.length && dv.getUint16(o) === 2) { o += 2; try { list = readSection(true); } catch {  } }
  return list;
}
export function writeAco(swatches) {
  const recordSize = s => s.model === 'xyz' && s.values ? 14 : 10;
  const size = 8 + swatches.reduce((a, s) => a + recordSize(s) * 2 + 4 + (String(s.name || '').length + 1) * 2, 0);
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  let o = 0;
  const u16 = v => { dv.setUint16(o, v); o += 2; };
  for (const v2 of [false, true]) {
    u16(v2 ? 2 : 1); u16(swatches.length);
    for (const s of swatches) {
      if (s.model === 'xyz' && s.values) { u16(20); for (const n of s.values.slice(0, 3)) { dv.setFloat32(o, n); o += 4; } }
      else for (const n of acoEncode(s)) u16(n);
      if (v2) { const nm = String(s.name || ''); dv.setUint32(o, nm.length + 1); o += 4; for (let i = 0; i < nm.length; i++) u16(nm.charCodeAt(i)); u16(0); }
    }
  }
  return out;
}


export function readAse(bytes) {
  const u8 = toU8(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'ASEF') throw new Error('不是 Adobe 色板交换文件（缺 ASEF 签名）');
  const count = dv.getUint32(8);
  let o = 12;
  const swatches = [], groups = [];
  let group = null;
  const readName = () => { const n = dv.getUint16(o); o += 2; let s = ''; for (let k = 0; k < n; k++) { const c = dv.getUint16(o + k * 2); if (c) s += String.fromCharCode(c); } o += n * 2; return s; };
  for (let i = 0; i < count && o + 6 <= u8.length; i++) {
    const type = dv.getUint16(o), len = dv.getUint32(o + 2); o += 6;
    const end = o + len;
    if (end > u8.length) break;
    if (type === 0xC001) { group = { name: len ? readName() : '', swatches: [] }; groups.push(group); }
    else if (type === 0xC002) group = null;
    else if (type === 0x0001) {
      const name = readName();
      const mdl = String.fromCharCode(...u8.subarray(o, o + 4)); o += 4;
      const f = n => { const a = []; for (let k = 0; k < n; k++) { a.push(dv.getFloat32(o)); o += 4; } return a; };
      let sw;
      if (mdl === 'RGB ') { const v = f(3).map(x => x * 255); sw = { model: 'rgb', values: v }; }
      else if (mdl === 'CMYK') sw = { model: 'cmyk', values: f(4).map(x => x * 100) };
      else if (mdl === 'LAB ') { const v = f(3); sw = { model: 'lab', values: [v[0] <= 1.0001 ? v[0] * 100 : v[0], v[1], v[2]] }; }
      else if (mdl === 'Gray') sw = { model: 'gray', values: [(1 - f(1)[0]) * 100] };   
      else sw = { model: 'rgb', values: [0, 0, 0], unsupported: mdl };
      const ctype = o + 2 <= end ? dv.getUint16(o) : 2;
      const s = { name, ...sw, color: modelToRgb(sw.model, sw.values), ...(ctype === 1 ? { spot: true } : ctype === 0 ? { global: true } : {}) };
      swatches.push(s);
      if (group) group.swatches.push(s);
    }
    o = end;
  }
  return Object.assign(swatches, { groups });
}

export function writeAse(swatches) {
  const blocks = [];
  const nameBytes = s => { s = String(s || ''); const b = new Uint8Array(2 + (s.length + 1) * 2), d = new DataView(b.buffer); d.setUint16(0, s.length + 1); for (let i = 0; i < s.length; i++) d.setUint16(2 + i * 2, s.charCodeAt(i)); return b; };
  const block = (type, body) => { const b = new Uint8Array(6 + body.length), d = new DataView(b.buffer); d.setUint16(0, type); d.setUint32(2, body.length); b.set(body, 6); blocks.push(b); };
  let curGroup = null;
  for (const s of swatches) {
    const g = s.group || null;
    if (g !== curGroup) { if (curGroup) block(0xC002, new Uint8Array(0)); if (g) block(0xC001, nameBytes(g)); curGroup = g; }
    const nb = nameBytes(s.name);
    const m = s.values ? s.model : 'rgb', v = s.values || s.color;
    let key, fl;
    if (m === 'cmyk') { key = 'CMYK'; fl = v.slice(0, 4).map(x => x / 100); }
    else if (m === 'lab') { key = 'LAB '; fl = [v[0] / 100, v[1], v[2]]; }
    else if (m === 'gray') { key = 'Gray'; fl = [1 - v[0] / 100]; }
    else { const rgb = m === 'rgb' ? v : m === 'hsb' ? modelToRgb('hsb', v) : s.color; key = 'RGB '; fl = rgb.slice(0, 3).map(x => x / 255); }
    const body = new Uint8Array(nb.length + 4 + fl.length * 4 + 2), d = new DataView(body.buffer);
    body.set(nb, 0); let o = nb.length;
    for (let i = 0; i < 4; i++) body[o + i] = key.charCodeAt(i); o += 4;
    for (const x of fl) { d.setFloat32(o, x); o += 4; }
    d.setUint16(o, s.spot ? 1 : s.global ? 0 : 2);
    block(0x0001, body);
  }
  if (curGroup) block(0xC002, new Uint8Array(0));
  const total = 12 + blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  out.set([0x41, 0x53, 0x45, 0x46], 0); dv.setUint16(4, 1); dv.setUint16(6, 0); dv.setUint32(8, blocks.length);
  let o = 12; for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}


export function readAct(bytes) {
  const u8 = toU8(bytes);
  if (u8.length < 768) throw new Error('.act 颜色表不足 768 字节');
  let n = 256, transparent = -1;
  if (u8.length >= 772) { const dv = new DataView(u8.buffer, u8.byteOffset + 768, 4); n = dv.getUint16(0) || 256; const t = dv.getUint16(2); transparent = t === 0xffff ? -1 : t; }
  const out = [];
  for (let i = 0; i < Math.min(256, n); i++) {
    if (i === transparent) continue;
    out.push(rgbSwatch([u8[i * 3], u8[i * 3 + 1], u8[i * 3 + 2]], ''));
  }
  return out;
}
export function writeAct(swatches) {
  const out = new Uint8Array(772), dv = new DataView(out.buffer);
  const list = swatches.slice(0, 256);
  list.forEach((s, i) => { out[i * 3] = s.color[0]; out[i * 3 + 1] = s.color[1]; out[i * 3 + 2] = s.color[2]; });
  dv.setUint16(768, list.length); dv.setUint16(770, 0xffff);
  return out;
}


export function readSwatchFile(bytes, name = '') {
  const u8 = toU8(bytes), ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'ase' || String.fromCharCode(...u8.subarray(0, 4)) === 'ASEF') return readAse(u8);
  if (ext === 'act') return readAct(u8);
  return readAco(u8);
}

export default { readAco, writeAco, readAse, writeAse, readAct, writeAct, readSwatchFile, modelToRgb, rgbSwatch };
