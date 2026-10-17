
















const u16 = (v, o) => v.getUint16(o), i16 = (v, o) => v.getInt16(o);

class W {
  constructor() { this.a = []; }
  u16(n) { n = Math.max(0, Math.min(65535, Math.round(+n || 0))); this.a.push(n >> 8, n & 255); }
  i16(n) { n = Math.max(-32768, Math.min(32767, Math.round(+n || 0))) & 0xffff; this.a.push(n >> 8, n & 255); }
  u8(n) { this.a.push((+n || 0) & 255); }
  bytes() { return new Uint8Array(this.a); }
}
const view = bytes => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
};
const need = (v, n, what) => { if (v.byteLength < n) throw new Error(`${what}文件太短（${v.byteLength} 字节，至少要 ${n}）`); };


const identityLevel = () => ({ shadowInput: 0, highlightInput: 255, shadowOutput: 0, highlightOutput: 255, midtoneInput: 100 });
function encodeLevels(model) {
  const w = new W(); w.u16(2);
  const recs = (model && model.records) || [];
  for (let i = 0; i < 29; i++) {
    const r = { ...identityLevel(), ...(recs[i] || {}) };
    w.u16(r.shadowInput); w.u16(r.highlightInput); w.u16(r.shadowOutput); w.u16(r.highlightOutput); w.u16(r.midtoneInput);
  }
  return w.bytes();
}
function decodeLevels(bytes) {
  const v = view(bytes); need(v, 2 + 10, '色阶预设');
  const version = u16(v, 0);
  if (version !== 2) throw new Error(`不是色阶预设（版本 ${version}，应为 2）`);
  const records = [];
  for (let o = 2; o + 10 <= v.byteLength && records.length < 29; o += 10) {
    const r = { shadowInput: u16(v, o), highlightInput: u16(v, o + 2), shadowOutput: u16(v, o + 4), highlightOutput: u16(v, o + 6), midtoneInput: u16(v, o + 8) };
    if (r.shadowInput > 255 || r.highlightInput > 255 || r.midtoneInput < 1 || r.midtoneInput > 999) throw new Error('色阶预设里的数值超出范围，文件可能不是 .alv');
    records.push(r);
  }
  return { records };
}


function encodeCurves(lists) {
  const w = new W(); w.u16(4);
  const all = (lists || []).slice(0, 4);
  while (all.length < 5) all.push([{ input: 0, output: 0 }, { input: 255, output: 255 }]);
  w.u16(all.length);
  for (const pts of all) {
    const p = [...pts].sort((a, b) => a.input - b.input);
    w.u16(p.length);
    for (const q of p) { w.u16(q.output); w.u16(q.input); }
  }
  return w.bytes();
}
function decodeCurves(bytes) {
  const v = view(bytes); need(v, 4, '曲线预设');
  const version = u16(v, 0), count = u16(v, 2);
  if (version !== 1 && version !== 4) throw new Error(`不是曲线预设（版本 ${version}，应为 1 或 4）`);
  if (!count || count > 32) throw new Error(`曲线条数异常：${count}`);
  const out = []; let o = 4;
  for (let c = 0; c < count; c++) {
    need(v, o + 2, '曲线预设'); const n = u16(v, o); o += 2;
    if (n < 2 || n > 19) throw new Error(`第 ${c + 1} 条曲线有 ${n} 个点（PS 允许 2…19 个）`);
    need(v, o + n * 4, '曲线预设');
    const pts = [];
    for (let k = 0; k < n; k++, o += 4) pts.push({ output: u16(v, o), input: u16(v, o + 2) });
    if (pts.some(p => p.input > 255 || p.output > 255)) throw new Error('曲线预设里的点超出 0…255');
    out.push(pts);
  }
  return { curves: out };
}


function encodeHue(m) {
  const w = new W(); w.u16(2); w.u8(m.enable ? 1 : 0); w.u8(0);
  for (let k = 0; k < 3; k++) w.i16((m.colorization || [0, 25, 0])[k]);
  for (let k = 0; k < 3; k++) w.i16((m.master || [0, 0, 0])[k]);
  for (let r = 0; r < 6; r++) {
    const it = (m.ranges || [])[r] || { range: [0, 0, 0, 0], settings: [0, 0, 0] };
    for (let k = 0; k < 4; k++) w.i16(it.range[k]);
    for (let k = 0; k < 3; k++) w.i16(it.settings[k]);
  }
  return w.bytes();
}
function decodeHue(bytes) {
  const v = view(bytes); need(v, 100, '色相/饱和度预设');
  if (u16(v, 0) !== 2) throw new Error(`不是色相/饱和度预设（版本 ${u16(v, 0)}，应为 2）`);
  const m = { enable: v.getUint8(2) !== 0, colorization: [i16(v, 4), i16(v, 6), i16(v, 8)], master: [i16(v, 10), i16(v, 12), i16(v, 14)], ranges: [] };
  for (let r = 0, o = 16; r < 6; r++, o += 14)
    m.ranges.push({ range: [i16(v, o), i16(v, o + 2), i16(v, o + 4), i16(v, o + 6)], settings: [i16(v, o + 8), i16(v, o + 10), i16(v, o + 12)] });
  if (Math.abs(m.master[0]) > 180 || Math.abs(m.master[1]) > 100 || Math.abs(m.master[2]) > 100) throw new Error('色相/饱和度预设里的数值超出范围');
  return m;
}


function encodeMixer(m) {
  const w = new W(); w.u16(1); w.u16(m.monochrome ? 1 : 0);
  const ch = m.channels || [];
  for (let c = 0; c < 4; c++) { const row = ch[c] || [0, 0, 0, 0, 0]; for (let k = 0; k < 5; k++) w.i16(row[k]); }
  return w.bytes();
}
function decodeMixer(bytes) {
  const v = view(bytes); need(v, 4 + 30, '通道混合器预设');
  if (u16(v, 0) !== 1) throw new Error(`不是通道混合器预设（版本 ${u16(v, 0)}，应为 1）`);
  const m = { monochrome: u16(v, 2) !== 0, channels: [] };
  for (let o = 4; o + 10 <= v.byteLength && m.channels.length < 4; o += 10) m.channels.push([i16(v, o), i16(v, o + 2), i16(v, o + 4), i16(v, o + 6), i16(v, o + 8)]);
  return m;
}


function encodeSelective(m) {
  const w = new W(); w.u16(1); w.u16(m.method ? 1 : 0);
  for (let p = 0; p < 10; p++) { const row = (m.plates || [])[p] || [0, 0, 0, 0]; for (let k = 0; k < 4; k++) w.i16(row[k]); }
  return w.bytes();
}
function decodeSelective(bytes) {
  const v = view(bytes); need(v, 4 + 80, '可选颜色预设');
  if (u16(v, 0) !== 1) throw new Error(`不是可选颜色预设（版本 ${u16(v, 0)}，应为 1）`);
  const m = { method: u16(v, 2) ? 1 : 0, plates: [] };
  for (let p = 0, o = 4; p < 10; p++, o += 8) m.plates.push([i16(v, o), i16(v, o + 2), i16(v, o + 4), i16(v, o + 6)]);
  return m;
}


export const PRESET_FORMATS = {
  levels: { ext: '.alv', label: '色阶', encode: encodeLevels, decode: decodeLevels },
  curv: { ext: '.acv', label: '曲线', encode: encodeCurves, decode: decodeCurves, curves: true },
  hue2: { ext: '.ahu', label: '色相/饱和度', encode: encodeHue, decode: decodeHue },
  mixr: { ext: '.cha', label: '通道混合器', encode: encodeMixer, decode: decodeMixer },
  selc: { ext: '.asv', label: '可选颜色', encode: encodeSelective, decode: decodeSelective },
};

export const PRESET_UNSUPPORTED = {
  blwh: { ext: '.blw', label: '黑白' },
  expA: { ext: '.atf', label: '曝光度' },
};


export function flattenModel(m, prefix = '', out = {}) {
  if (Array.isArray(m)) m.forEach((v, i) => flattenModel(v, prefix ? `${prefix}.${i}` : String(i), out));
  else if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) flattenModel(v, prefix ? `${prefix}.${k}` : k, out);
  else if (m !== undefined) out[prefix] = m;
  return out;
}

export function unflattenPaths(map) {
  const root = {};
  for (const [path, value] of Object.entries(map)) {
    const keys = path.split('.');
    let cur = root;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1, nextIsIndex = !last && /^\d+$/.test(keys[i + 1]);
      if (last) cur[k] = value;
      else { if (cur[k] == null) cur[k] = nextIsIndex ? [] : {}; cur = cur[k]; }
    });
  }
  return root;
}
