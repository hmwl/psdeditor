


























import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';

const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = v => (v && typeof v === 'object' && 'value' in v) ? +v.value : +v;


function hsbToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60; const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [r * 255, g * 255, b * 255];
}
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f = t => t > 6 / 29 ? t * t * t : 3 * (6 / 29) ** 2 * (t - 4 / 29);
  const X = 0.9642 * f(fx), Y = f(fy), Z = 0.8249 * f(fz);
  const lin = [3.1339 * X - 1.6169 * Y - 0.4906 * Z, -0.9785 * X + 1.9160 * Y + 0.0334 * Z, 0.0720 * X - 0.2290 * Y + 1.4057 * Z];
  return lin.map(v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055));
}

export function colorDescToRgb(c) {
  if (!c || typeof c !== 'object') return null;
  const k = c.__classID;
  let rgb = null;
  if (k === 'RGBC') rgb = [num(c['Rd  ']), num(c['Grn ']), num(c['Bl  '] ?? c.Bl)];
  else if (k === 'HSBC') rgb = hsbToRgb(num(c['H   ']), num(c.Strt) / 100, num(c.Brgh) / 100);
  else if (k === 'CMYC') { const C = num(c['Cyn ']) / 100, M = num(c.Mgnt) / 100, Y = num(c['Ylw ']) / 100, K = num(c.Blck) / 100; rgb = [255 * (1 - C) * (1 - K), 255 * (1 - M) * (1 - K), 255 * (1 - Y) * (1 - K)]; }
  else if (k === 'LbCl') rgb = labToRgb(num(c.Lmnc), num(c['A   ']), num(c['B   ']));
  else if (k === 'Grsc') { const g = 255 * (1 - num(c['Gry ']) / 100); rgb = [g, g, g]; }
  else if (k === 'BkCl') {            
    for (const key of Object.keys(c)) { const v = c[key]; if (v && typeof v === 'object' && v.__classID) { const r = colorDescToRgb(v); if (r) return r; } }
    return null;
  }
  if (!rgb || rgb.some(v => !Number.isFinite(v))) return null;
  return rgb.map(v => Math.round(clamp(v, 0, 255)));
}
export function rgbToColorDesc(r, g, b) {
  return { __name: '', __classID: 'RGBC', 'Rd  ': +r, 'Grn ': +g, 'Bl  ': +b, __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true } };
}



export function gradientFromDesc(g) {
  const name = typeof g['Nm  '] === 'string' ? g['Nm  '] : '渐变';
  const form = g.GrdF && g.GrdF.value;
  if (form === 'ClNs') {
    const cs = g.ClrS && g.ClrS.value;
    const arr4 = (a, d) => Array.isArray(a) ? [0, 1, 2, 3].map(i => clamp(num(a[i] ?? d), 0, 100)) : [d, d, d, d];
    const noise = {
      roughness: Math.round(clamp(num(g.Smth ?? 2048) / 40.96, 0, 100)),
      model: cs === 'HSBl' ? 'hsb' : cs === 'LbCl' ? 'lab' : 'rgb',
      min: arr4(g['Mnm '], 0), max: arr4(g['Mxm '], 100),
      restrict: !!g.VctC, transparency: !!g.ShTr,
      seed: (num(g.RndS ?? 1) >>> 0) || 1,
    };
    return { name, model: {
      clrs: [{ loc: 0, r: 0, g: 0, b: 0, mid: 50 }, { loc: 4096, r: 255, g: 255, b: 255, mid: 50 }],
      trns: [{ loc: 0, opct: 100, mid: 50 }, { loc: 4096, opct: 100, mid: 50 }], noise } };
  }
  const clrs = (Array.isArray(g.Clrs) ? g.Clrs : []).map(s => {
    const t = s.Type && s.Type.value;
    const type = t === 'FrgC' ? 'fg' : t === 'BckC' ? 'bg' : undefined;
    const rgb = colorDescToRgb(s['Clr ']) || (type === 'bg' ? [255, 255, 255] : [0, 0, 0]);
    return { loc: clamp(Math.round(num(s.Lctn ?? 0)), 0, 4096), r: rgb[0], g: rgb[1], b: rgb[2], mid: clamp(Math.round(num(s.Mdpn ?? 50)), 0, 100), ...(type ? { type } : {}) };
  });
  const trns = (Array.isArray(g.Trns) ? g.Trns : []).map(s => ({
    loc: clamp(Math.round(num(s.Lctn ?? 0)), 0, 4096), opct: clamp(num(s.Opct ?? 100), 0, 100), mid: clamp(Math.round(num(s.Mdpn ?? 50)), 0, 100),
  }));
  if (!clrs.length) clrs.push({ loc: 0, r: 0, g: 0, b: 0, mid: 50 }, { loc: 4096, r: 255, g: 255, b: 255, mid: 50 });
  if (!trns.length) trns.push({ loc: 0, opct: 100, mid: 50 }, { loc: 4096, opct: 100, mid: 50 });
  const model = { clrs, trns };
  const intr = g.Intr != null ? num(g.Intr) : 4096;
  if (Number.isFinite(intr) && Math.round(intr / 40.96) !== 100) model.smooth = Math.round(clamp(intr / 40.96, 0, 100));
  return { name, model };
}


export function gradientToDesc({ name, model: m }) {
  const g = { __name: 'Gradient', __classID: 'Grdn', 'Nm  ': String(name || '渐变') };
  if (m && m.noise) {
    const N = m.noise;
    const four = (a, d) => { const v = [0, 1, 2, 3].map(i => Math.round(clamp(+(a && a[i] != null ? a[i] : d), 0, 100))); v.__long = { 0: true, 1: true, 2: true, 3: true }; return v; };
    Object.assign(g, {
      GrdF: { __enumType: 'GrdF', value: 'ClNs' },
      ShTr: !!N.transparency,
      VctC: !!N.restrict,
      ClrS: { __enumType: 'ClrS', value: N.model === 'hsb' ? 'HSBl' : N.model === 'lab' ? 'LbCl' : 'RGBC' },
      RndS: (N.seed >>> 0) | 0,
      Smth: Math.round(clamp(+N.roughness || 0, 0, 100) * 40.96),
      'Mnm ': four(N.min, 0),
      'Mxm ': four(N.max, 100),
    });
    g.__long = { RndS: true, Smth: true };
    return g;
  }
  g.GrdF = { __enumType: 'GrdF', value: 'CstS' };
  g.Intr = (m && m.smooth != null ? clamp(+m.smooth, 0, 100) : 100) * 40.96;
  g.__doub = { Intr: true };
  g.Clrs = ((m && m.clrs) || []).map(s => ({
    __name: '', __classID: 'Clrt',
    'Clr ': rgbToColorDesc(s.r, s.g, s.b),
    Type: { __enumType: 'Clry', value: s.type === 'fg' ? 'FrgC' : s.type === 'bg' ? 'BckC' : 'UsrS' },
    Lctn: Math.round(clamp(+s.loc || 0, 0, 4096)),
    Mdpn: Math.round(clamp(s.mid == null ? 50 : +s.mid, 0, 100)),
    __long: { Lctn: true, Mdpn: true },
  }));
  g.Trns = ((m && m.trns) || []).map(s => ({
    __name: '', __classID: 'TrnS',
    Opct: { __unit: '#Prc', value: clamp(+s.opct, 0, 100) },
    Lctn: Math.round(clamp(+s.loc || 0, 0, 4096)),
    Mdpn: Math.round(clamp(s.mid == null ? 50 : +s.mid, 0, 100)),
    __long: { Lctn: true, Mdpn: true },
  }));
  return g;
}










function readGrdV3(r) {
  const count = r.u16();
  const out = [];
  for (let i = 0; i < count; i++) {
    const nl = r.u8(); const name = r.ascii(nl);
    const cn = r.u16(); const clrs = [];
    for (let k = 0; k < cn; k++) {
      const loc = r.u32(), mid = r.u32(), space = r.u16(); const c = [r.u16(), r.u16(), r.u16(), r.u16()]; r.skip(2);
      let rgb = [c[0] >> 8, c[1] >> 8, c[2] >> 8], type;
      if (space === 1) rgb = hsbToRgb(c[0] / 65535 * 360, c[1] / 65535, c[2] / 65535).map(Math.round);
      else if (space === 2) rgb = [255 * (1 - c[0] / 65535) * (1 - c[3] / 65535), 255 * (1 - c[1] / 65535) * (1 - c[3] / 65535), 255 * (1 - c[2] / 65535) * (1 - c[3] / 65535)].map(Math.round);
      else if (space === 8) { const g = Math.round(255 * (1 - c[0] / 10000)); rgb = [g, g, g]; }
      else if (space === 0xfffe || space === 0xffff) { type = space === 0xffff ? 'fg' : 'bg'; rgb = type === 'fg' ? [0, 0, 0] : [255, 255, 255]; }
      clrs.push({ loc: clamp(loc, 0, 4096), r: rgb[0], g: rgb[1], b: rgb[2], mid: clamp(mid, 0, 100), ...(type ? { type } : {}) });
    }
    const tn = r.u16(); const trns = [];
    for (let k = 0; k < tn; k++) { const loc = r.u32(), mid = r.u32(), op = r.u16(); trns.push({ loc: clamp(loc, 0, 4096), opct: Math.round(op / 255 * 100), mid: clamp(mid, 0, 100) }); }
    r.skip(6);
    out.push({ name, model: { clrs, trns } });
  }
  return out;
}



export function readGrd(bytes) {
  const u8 = toU8(bytes);
  const r = new Reader(u8);
  if (r.key4() !== '8BGR') throw new Error('不是 Photoshop 渐变文件（缺 8BGR 签名）');
  const ver = r.u16();
  if (ver === 3) return readGrdV3(r);
  if (ver !== 5) throw new Error('不支持的 .grd 版本：' + ver);
  const dv = r.u32();
  if (dv !== 16) throw new Error('渐变描述符版本不是 16：' + dv);
  const top = readDescriptor(r);
  const list = Array.isArray(top.GrdL) ? top.GrdL : [];
  const out = [];
  for (const it of list) {
    const g = it && (it.Grad || it);
    if (!g || typeof g !== 'object') continue;
    try { out.push(gradientFromDesc(g)); } catch {  }
  }
  return out;
}

export function writeGrd(list) {
  const top = {
    __name: '', __classID: 'null',
    GrdL: list.map(it => ({ __name: '', __classID: 'Grdn', Grad: gradientToDesc(it) })),
  };
  const body = serializeDescriptor(top);
  const out = new Uint8Array(4 + 2 + 4 + body.length);
  const dv = new DataView(out.buffer);
  out.set([0x38, 0x42, 0x47, 0x52], 0);          
  dv.setUint16(4, 5); dv.setUint32(6, 16);
  out.set(body, 10);
  return out;
}

export default { readGrd, writeGrd, gradientFromDesc, gradientToDesc, colorDescToRgb, rgbToColorDesc };
