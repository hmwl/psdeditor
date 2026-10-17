
































import { Writer, writeDescriptor } from './psd-descriptor.js';

export const ATN_VERSION = 16;

export const ATN_COLORS = [
  ['none', '无', ''], ['red', '红色', '#b8413b'], ['orange', '橙色', '#c7792d'], ['yellow', '黄色', '#bfa738'],
  ['green', '绿色', '#4f9a45'], ['blue', '蓝色', '#3d6fb8'], ['violet', '紫色', '#8352b0'], ['gray', '灰色', '#7d7d7d'],
];


class R {
  constructor(u8) { this.u8a = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.o = 0; }
  need(n) { if (this.o + n > this.u8a.length) throw new Error('.atn 文件提前结束（@' + this.o + '，还要 ' + n + ' 字节）'); }
  u8() { this.need(1); return this.dv.getUint8(this.o++); }
  u16() { this.need(2); const v = this.dv.getUint16(this.o); this.o += 2; return v; }
  u32() { this.need(4); const v = this.dv.getUint32(this.o); this.o += 4; return v; }
  i32() { this.need(4); const v = this.dv.getInt32(this.o); this.o += 4; return v; }
  f64() { this.need(8); const v = this.dv.getFloat64(this.o); this.o += 8; return v; }
  u64() { const hi = this.u32(), lo = this.u32(); return hi * 0x100000000 + lo; }
  ascii(n) { this.need(n); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8a[this.o + i]); this.o += n; return s; }
  bytes(n) { this.need(n); const b = this.u8a.slice(this.o, this.o + n); this.o += n; return b; }
  unicode() {
    const n = this.u32(); if (n > 1e6) throw new Error('.atn 字符串长度不合理：' + n);
    let s = ''; for (let i = 0; i < n; i++) { const c = this.u16(); if (c) s += String.fromCharCode(c); }
    return s;
  }
  
  pstr() { const n = this.u32(); if (n > 1e5) throw new Error('.atn 字符串长度不合理：' + n); return this.ascii(n); }
}

function key(r, host, slot) {
  const len = r.u32();
  const s = len === 0 ? r.ascii(4) : r.ascii(len);
  if (len !== 0 && s.length === 4 && host) (host.__explicit || (host.__explicit = {}))[slot || s] = true;
  return s;
}
function mark(host, k, t) {
  if (t === 'long') (host.__long || (host.__long = {}))[k] = true;
  else if (t === 'doub') (host.__doub || (host.__doub = {}))[k] = true;
  else if (t === 'comp') (host.__comp || (host.__comp = {}))[k] = true;
}
export function readDesc(r) {
  const obj = {};
  obj.__name = r.unicode();
  obj.__classID = key(r, obj, '__classID');
  const n = r.u32();
  for (let i = 0; i < n; i++) {
    const k = key(r, obj);
    const it = item(r);
    obj[k] = it.v; mark(obj, k, it.t);
  }
  return obj;
}
function item(r) {
  const t = r.ascii(4);
  switch (t) {
    case 'Objc': case 'GlbO': return { t, v: readDesc(r) };
    case 'VlLs': {
      const n = r.u32(), arr = [];
      for (let i = 0; i < n; i++) { const it = item(r); arr.push(it.v); mark(arr, i, it.t); }
      return { t, v: arr };
    }
    case 'doub': return { t, v: r.f64() };
    case 'UntF': { const u = r.ascii(4); return { t, v: { __unit: u, value: r.f64() } }; }
    case 'UnFl': { const u = r.ascii(4), n = r.u32(), vs = []; for (let i = 0; i < n; i++) vs.push(r.f64()); return { t, v: { __unit: u, values: vs } }; }
    case 'TEXT': return { t, v: r.unicode() };
    case 'enum': { const o = {}; o.__enumType = key(r, o, '__enumType'); o.value = key(r, o, '__value'); return { t, v: o }; }
    case 'long': return { t, v: r.i32() };
    case 'comp': return { t, v: r.u64() };
    case 'bool': return { t, v: r.u8() !== 0 };
    case 'type': case 'GlbC': { const nm = r.unicode(); return { t, v: { __class: key(r), __name: nm } }; }
    case 'obj ': { const n = r.u32(), refs = []; for (let i = 0; i < n; i++) refs.push(refItem(r)); return { t, v: { __reference: refs } }; }
    case 'tdta': { const n = r.u32(); return { t, v: r.bytes(n) }; }
    case 'alis': case 'Pth ': { const n = r.u32(); return { t, v: { __rawItem: t, bytes: r.bytes(n) } }; }
    case 'ObAr': {
      const o = { __objectArray: true, __itemsCount: r.u32() };
      o.__name = r.unicode(); o.__classID = key(r, o, '__classID');
      const n = r.u32();
      for (let i = 0; i < n; i++) { const k = key(r, o); const it = item(r); o[k] = it.v; mark(o, k, it.t); }
      return { t, v: o };
    }
    default: throw new Error('.atn 描述符里有不认识的类型「' + t + '」@' + (r.o - 4));
  }
}
function cls(r) { const name = r.unicode(); return { name, cid: key(r) }; }
function optionalRefClass(r) {
  
  
  const start = r.o;
  try {
    const n = r.dv.getUint32(start);
    if (n < 1 || n > 256) return null;
    const c = cls(r);
    if (!c.cid || !/^[\x20-\x7e]+$/.test(c.cid)) { r.o = start; return null; }
    return c;
  } catch { r.o = start; return null; }
}
function refItem(r) {
  const type = r.ascii(4);
  switch (type) {
    case 'prop': { const c = cls(r); return { type, cls: c, key: key(r) }; }
    case 'Clss': return { type, cls: cls(r) };
    case 'Enmr': { const c = cls(r); return { type, cls: c, enumType: key(r), value: key(r) }; }
    case 'rele': { const c = cls(r); return { type, cls: c, offset: r.u32() }; }
    case 'Idnt': { const c = optionalRefClass(r); return { type, ...(c ? { cls: c } : {}), id: r.u32() }; }
    case 'indx': { const c = optionalRefClass(r); return { type, ...(c ? { cls: c } : {}), index: r.u32() }; }
    case 'name': { const c = cls(r); return { type, cls: c, name: r.unicode() }; }
    default: throw new Error('.atn 引用里有不认识的类型「' + type + '」');
  }
}


export function parseAtn(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const r = new R(u8);
  const version = r.u32();
  if (version !== 16 && version !== 12) throw new Error('不是 Photoshop 动作文件（版本号 ' + version + '，应为 16）');
  const set = { version, name: r.unicode(), expanded: !!r.u8(), actions: [] };
  const na = r.u32();
  if (na > 100000) throw new Error('.atn 动作数不合理：' + na);
  for (let a = 0; a < na; a++) {
    const act = { fkey: r.u16(), shift: !!r.u8(), cmd: !!r.u8(), color: r.u16(), name: r.unicode(), expanded: !!r.u8(), steps: [] };
    const ns = r.u32();
    if (ns > 100000) throw new Error('.atn 步骤数不合理：' + ns);
    for (let s = 0; s < ns; s++) {
      const st = { expanded: !!r.u8(), enabled: !!r.u8(), dialog: !!r.u8(), dialogOptions: r.u8() };
      st.idType = r.ascii(4);
      if (st.idType === 'TEXT') st.event = r.pstr();
      else if (st.idType === 'long') st.event = r.ascii(4);
      else throw new Error(`第 ${a + 1} 个动作第 ${s + 1} 步：事件 ID 类型「${st.idType}」不认识`);
      st.name = r.pstr();
      const has = r.i32();
      st.desc = has === -1 ? readDesc(r) : null;
      act.steps.push(st);
    }
    set.actions.push(act);
  }
  return set;
}


function wUnicode(w, s) { w.unicode(String(s == null ? '' : s)); }
function wPstr(w, s) {
  s = String(s || '');
  
  const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c < 128 ? c : 63; }
  w.u32(b.length); w.bytes(b);
}

export function writeAtn(set) {
  const w = new Writer();
  w.u32(set.version || ATN_VERSION);
  wUnicode(w, set.name || '组 1');
  w.u8(set.expanded ? 1 : 0);
  const acts = set.actions || [];
  w.u32(acts.length);
  for (const a of acts) {
    w.u16(a.fkey | 0); w.u8(a.shift ? 1 : 0); w.u8(a.cmd ? 1 : 0); w.u16(a.color | 0);
    wUnicode(w, a.name || '动作 1');
    w.u8(a.expanded ? 1 : 0);
    const steps = a.steps || [];
    w.u32(steps.length);
    for (const s of steps) {
      w.u8(s.expanded ? 1 : 0); w.u8(s.enabled === false ? 0 : 1); w.u8(s.dialog ? 1 : 0); w.u8(s.dialogOptions | 0);
      const idType = s.idType || (String(s.event).length === 4 ? 'long' : 'TEXT');
      w.ascii(idType);
      if (idType === 'long') w.ascii(String(s.event).padEnd(4, ' ').slice(0, 4));
      else wPstr(w, s.event);
      wPstr(w, s.name || s.event);
      if (s.desc) { w.i32(-1); writeDescriptor(s.desc, w); }
      else w.i32(0);
    }
  }
  return w.finish();
}


export function cloneDeep(v) {
  if (v instanceof Uint8Array) return v.slice();
  if (Array.isArray(v)) { const a = v.map(cloneDeep); for (const k of ['__long', '__doub', '__comp']) if (v[k]) a[k] = { ...v[k] }; return a; }
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = cloneDeep(v[k]); return o; }
  return v;
}
