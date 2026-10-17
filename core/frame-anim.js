
























import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';
import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';

export const ANIM_RESOURCE_ID = 4000;
export const ANIM_EXT_RESOURCE_ID = 4094;
const FPAN = [0x46, 0x50, 0x61, 0x6e];             
const DISP_TO = { auto: 'Auto', none: 'None', disp: 'Disp' };
const DISP_FROM = { Auto: 'auto', None: 'none', Disp: 'disp' };

const ascii = (u8, o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[o + i]); return s; };
const put4 = (arr, s) => { for (let i = 0; i < 4; i++) arr.push(s.charCodeAt(i) & 255); };
const putU32 = (arr, v) => arr.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const num = v => (v && typeof v === 'object' && 'value' in v) ? +v.value : +v;



export function parseManiResource(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 12 || ascii(u8, 0, 4) !== 'mani') return null;
  if (ascii(u8, 4, 4) !== 'IRFR') return { blocks: [], anim: null };
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const len = dv.getUint32(8), end = Math.min(u8.length, 12 + len);
  const blocks = []; let o = 12, anim = null;
  while (o + 12 <= end) {
    if (ascii(u8, o, 4) !== '8BIM') break;
    const key = ascii(u8, o + 4, 4), n = dv.getUint32(o + 8);
    const data = u8.slice(o + 12, Math.min(end, o + 12 + n));
    blocks.push({ key, data });
    if (key === 'AnDs') { try { anim = animFromDescriptor(readDescriptor(new Reader(data.subarray(4)))); } catch { anim = null; } }
    o += 12 + n;
  }
  return { blocks, anim };
}

export function animFromDescriptor(d) {
  if (!d) return null;
  const info = new Map();
  for (const f of d.FrIn || []) {
    const id = num(f.FrID) >>> 0;
    info.set(id, { id, delay: f.FrDl != null ? num(f.FrDl) / 100 : 0, disp: DISP_FROM[f.FrDs && f.FrDs.value] || 'auto' });
  }
  const sets = (d.FSts || []).map(s => ({ id: num(s.FsID) | 0, frames: (s.FsFr || []).map(x => num(x) >>> 0), loop: s.LCnt != null ? num(s.LCnt) | 0 : 0, active: s.AFrm != null ? num(s.AFrm) | 0 : 0 }));
  const afst = d.AFSt != null ? num(d.AFSt) | 0 : (sets[0] ? sets[0].id : 0);
  const set = sets.find(s => s.id === afst) || sets[0];
  const order = set && set.frames.length ? set.frames : [...info.keys()];
  const frames = order.map(id => info.get(id) || { id, delay: 0, disp: 'auto' });
  if (!frames.length) return null;
  return { frames, loop: set ? set.loop : 0, active: Math.max(0, Math.min(frames.length - 1, set ? set.active : 0)), setId: set ? set.id : 0 };
}

export function animToDescriptor(a) {
  const L = o => { o.__long = Object.fromEntries(Object.keys(o).filter(k => typeof o[k] === 'number').map(k => [k, true])); return o; };
  const setId = a.setId | 0;
  const FrIn = a.frames.map(f => {
    const o = { __name: '', __classID: 'null', FrID: f.id | 0 };
    const cs = Math.round((+f.delay || 0) * 100);
    if (cs > 0) o.FrDl = cs;
    o.FrDs = { __enumType: 'FrmD', value: DISP_TO[f.disp] || 'Auto' };
    return L(o);
  });
  const fsfr = a.frames.map(f => f.id | 0); fsfr.__long = Object.fromEntries(fsfr.map((_, i) => [i, true]));
  const set = L({ __name: '', __classID: 'null', FsID: setId, AFrm: Math.max(0, a.active | 0), FsFr: fsfr, LCnt: Math.max(0, a.loop | 0) });
  return L({ __name: '', __classID: 'null', AFSt: setId, FrIn, FSts: [set] });
}

export function buildManiResource(anim, keep = []) {
  const out = []; put4(out, 'mani'); put4(out, 'IRFR');
  const body = [];
  const d = serializeDescriptor(animToDescriptor(anim));
  const ands = [0, 0, 0, 16, ...d];
  put4(body, '8BIM'); put4(body, 'AnDs'); putU32(body, ands.length); for (const b of ands) body.push(b);
  for (const b of keep) { if (b.key === 'AnDs') continue; put4(body, '8BIM'); put4(body, b.key); putU32(body, b.data.length); for (const x of b.data) body.push(x); }
  putU32(out, body.length);
  return Uint8Array.from([...out, ...body]);
}


function resourceSection(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 26; o += 4 + dv.getUint32(o);
  return { lenOff: o, start: o + 4, end: o + 4 + dv.getUint32(o) };
}
function walkResources(u8, start, end, fn) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = start;
  while (p + 12 <= end) {
    const s = p; if (dv.getUint32(p) !== 0x3842494d) break;
    const id = dv.getUint16(p + 4); p += 6;
    const nl = u8[p]; p += 1 + nl; if ((1 + nl) % 2) p++;
    const len = dv.getUint32(p); p += 4;
    fn({ id, s, dataStart: p, len, e: Math.min(end, p + len + (len % 2)) });
    p += len + (len % 2);
  }
}

export function findManiResource(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const { start, end } = resourceSection(u8); let hit = null;
  walkResources(u8, start, end, r => { if (!hit && r.id === ANIM_RESOURCE_ID && r.len >= 4 && ascii(u8, r.dataStart, 4) === 'mani') hit = u8.slice(r.dataStart, r.dataStart + r.len); });
  return hit;
}

export function replaceManiResource(buffer, data) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const sec = resourceSection(u8);
  const parts = []; let total = 0;
  walkResources(u8, sec.start, sec.end, r => {
    if (r.id === ANIM_RESOURCE_ID && r.len >= 4 && ascii(u8, r.dataStart, 4) === 'mani') return;
    const seg = u8.subarray(r.s, r.e); parts.push(seg); total += seg.length;
  });
  if (data) {
    let d = data;
    const oldLen = sec.end - sec.start;
    const rec = n => 12 + n + (n % 2);
    for (let pad = 0; pad < 4 && (total + rec(d.length) - oldLen) % 4; pad++) { const t = new Uint8Array(d.length + 1); t.set(d); d = t; }
    const hdr = new Uint8Array(12), hv = new DataView(hdr.buffer);
    hv.setUint32(0, 0x3842494d); hv.setUint16(4, ANIM_RESOURCE_ID); hv.setUint32(8, d.length);   
    parts.push(hdr, d); total += 12 + d.length;
    if (d.length % 2) { parts.push(new Uint8Array(1)); total += 1; }
  }
  const out = new Uint8Array(sec.start + total + (u8.length - sec.end));
  out.set(u8.subarray(0, sec.start), 0);
  let o = sec.start; for (const p of parts) { out.set(p, o); o += p.length; }
  out.set(u8.subarray(sec.end), o);
  new DataView(out.buffer).setUint32(sec.lenOff, total);
  return out.buffer;
}



export function animFromShmd(shmdBytes) {
  const out = { mlst: null, mdyn: null };
  if (!shmdBytes || !shmdBytes.length) return out;
  const m = parseAdditionalBlock('shmd', shmdBytes, { verify: false });
  const items = m && Array.isArray(m.items) ? m.items : [];
  const ml = items.find(x => x.key === 'mlst' && x.kind === 'desc');
  if (ml && ml.desc) {
    const entries = [];
    for (const s of ml.desc.LaSt || []) {
      const e = { frames: (s.FrLs || []).map(x => num(x) >>> 0) };
      if (typeof s.enab === 'boolean') e.v = s.enab;
      if (s.Ofst && typeof s.Ofst === 'object') { e.dx = num(s.Ofst.Hrzn) || 0; e.dy = num(s.Ofst.Vrtc) || 0; }
      if (s.blendOptions && s.blendOptions.Opct != null) e.op = Math.round(Math.max(0, Math.min(100, num(s.blendOptions.Opct))) * 2.55);
      if (s.Lefx && typeof s.Lefx === 'object' && typeof s.Lefx.masterFXSwitch === 'boolean') e.fx = s.Lefx.masterFXSwitch;
      entries.push(e);
    }
    out.mlst = { layerId: ml.desc.LaID != null ? num(ml.desc.LaID) >>> 0 : null, entries };
  }
  const md = items.find(x => x.key === 'mdyn');
  if (md) {
    let v = md.kind === 'u32' ? md.value >>> 0 : (md.data && md.data.length >= 4 ? new DataView(md.data.buffer, md.data.byteOffset).getUint32(0) : 0);
    const prop = (v >>> 8) & 255, flags = v & 255;
    out.mdyn = { prop: prop === 0, pos: !!(flags & 1), sty: !!(flags & 2), vis: !!(flags & 4) };
  }
  return out;
}
export const mdynValue = f => (((f && f.prop) ? 0 : 0x0f) << 8) | ((f && f.pos) ? 1 : 0) | ((f && f.sty) ? 2 : 0) | ((f && f.vis) ? 4 : 0);

const pnt = (x, y) => ({ __name: '', __classID: 'Pnt ', Hrzn: +x || 0, Vrtc: +y || 0, __doub: { Hrzn: true, Vrtc: true } });




export function buildMlstDesc(layerId, perFrame, { withPos = true, withOp = false } = {}) {
  if (!perFrame.length) return null;
  const groups = new Map();
  for (const f of perFrame) {
    const k = `${f.v ? 1 : 0}|${withPos ? Math.round((f.dx || 0) * 1000) : '-'}|${withPos ? Math.round((f.dy || 0) * 1000) : '-'}|${withOp ? f.op : '-'}`;
    if (!groups.has(k)) groups.set(k, { f, ids: [] });
    groups.get(k).ids.push(f.id | 0);
  }
  const LaSt = [...groups.values()].map(({ f, ids }) => {
    const s = { __name: '', __classID: 'null' };
    ids.__long = Object.fromEntries(ids.map((_, i) => [i, true]));
    s.FrLs = ids;
    s.enab = !!f.v;
    if (withPos) { s.Ofst = pnt(f.dx || 0, f.dy || 0); s.FXRf = { ...pnt(0, 0), __classID: 'null' }; }   
    if (withOp) s.blendOptions = { __name: '', __classID: 'null', Opct: { __unit: '#Prc', value: Math.round((f.op ?? 255) / 2.55 * 100) / 100 } };
    return s;
  });
  return { __name: '', __classID: 'null', LaID: layerId | 0, LaSt, __long: { LaID: true } };
}

export function shmdWithAnim(shmdBytes, mlstDesc, mdyn) {
  let m = shmdBytes && shmdBytes.length ? parseAdditionalBlock('shmd', shmdBytes, { verify: false }) : { items: [] };
  if (!m || !Array.isArray(m.items)) m = { items: [] };
  const items = m.items.filter(x => x.key !== 'mlst' && x.key !== 'mdyn');
  if (mlstDesc) {
    const body = { sig: '8BIM', key: 'mlst', copyOnSheet: false, reserved: new Uint8Array(3), kind: 'desc', descVersion: 16, desc: mlstDesc, _tail: null };
    const probe = writeAdditionalBlock('shmd', { items: [body] });
    const len = new DataView(probe.buffer, probe.byteOffset).getUint32(4 + 16);
    if (len % 4) body._tail = new Uint8Array(4 - (len % 4));
    items.push(body);
  }
  if (mdyn != null) items.push({ sig: '8BIM', key: 'mdyn', copyOnSheet: false, reserved: new Uint8Array(3), kind: 'u32', value: mdyn >>> 0 });
  if (!items.length) return null;
  return writeAdditionalBlock('shmd', { ...m, items, _tail: m._tail });
}


export function serializeAnimExt(obj) {
  const js = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(8 + js.length);
  out.set(FPAN, 0); new DataView(out.buffer).setUint32(4, js.length); out.set(js, 8);
  return out;
}
export function parseAnimExt(bytes) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 8 || FPAN.some((m, i) => u8[i] !== m)) return null;
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(4);
    return JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)));
  } catch { return null; }
}

export function newFrameId(used) {
  for (;;) { const id = (Math.floor(Math.random() * 0x7ffffffe) + 1) | 0; if (!used || !used.has(id)) return id; }
}




export function createAnimOps(h) {
  const setLayerAnimMeta = {
    validate(state, op, i) {
      if (!Array.isArray(op.entries)) throw h.opFail(i, op, 'entries 必须是数组');
      for (const e of op.entries) {
        h.needLayer(state, i, op, e.index);
        if (e.mdyn != null && !(Number.isInteger(e.mdyn) && e.mdyn >= 0 && e.mdyn <= 0xffffffff)) throw h.opFail(i, op, 'mdyn 必须是 32 位无符号整数或 null');
      }
      return { affected: op.entries.map(e => e.index), note: '写帧动画（shmd/mlst + mdyn）' };
    },
    apply(ab, state, op) {
      let out = h.copyAB(ab);
      for (const e of op.entries) {
        const old = h.readLayerBlock(out, e.index, 'shmd');
        const nb = shmdWithAnim(old ? old.slice() : null, e.mlst || null, e.mdyn == null ? null : e.mdyn);
        if (!old && !nb) continue;
        out = h.upsertLayerBlock(out, e.index, 'shmd', nb);
      }
      return { buffer: out, result: { changed: true } };
    },
    structural: true,
  };
  return { setLayerAnimMeta };
}
