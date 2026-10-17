












export class FontFormatError extends Error { constructor(m) { super(m); this.name = 'FontFormatError'; } }
const fail = m => { throw new FontFormatError(m); };

const dv = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const tagAt = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
const SFNT = new Set([0x00010000, 0x4f54544f , 0x74727565 ]);

export function fontKind(u8) {
  if (!u8 || u8.length < 12) return null;
  const t = tagAt(u8, 0);
  if (t === 'ttcf') return 'ttc';
  if (t === 'wOFF') return 'woff';
  if (t === 'wOF2') return 'woff2';
  return SFNT.has(dv(u8).getUint32(0)) ? 'sfnt' : null;
}


export function checkSfnt(u8, base = 0) {
  const v = dv(u8);
  if (base + 12 > u8.length) fail('字体文件截断（sfnt 头不完整）');
  if (!SFNT.has(v.getUint32(base))) fail('不是 TrueType / OpenType 字体（sfnt 版本号不对）');
  const n = v.getUint16(base + 4);
  if (!n || n > 96) fail(`字体表数量异常（${n}）`);
  if (base + 12 + n * 16 > u8.length) fail('字体表目录越界');
  const tables = [];
  for (let k = 0; k < n; k++) {
    const r = base + 12 + k * 16;
    const tag = tagAt(u8, r), off = v.getUint32(r + 8), len = v.getUint32(r + 12);
    if (!/^[\x20-\x7e]{4}$/.test(tag)) fail('字体表标签非法');
    if (off < 12 || off + len > u8.length) fail(`字体表 ${tag} 越界`);
    tables.push({ tag, off, len, sum: v.getUint32(r + 4) });
  }
  const has = t => tables.some(x => x.tag === t);
  for (const t of ['name', 'cmap', 'head']) if (!has(t)) fail(`字体缺必需表 ${t}`);
  if (!(has('glyf') && has('loca')) && !has('CFF ') && !has('CFF2')) fail('字体没有字形表（glyf / CFF）');
  return tables;
}

function faceOffsets(u8) {
  if (tagAt(u8, 0) !== 'ttcf') return [0];
  const v = dv(u8);
  const n = v.getUint32(8);
  if (!n || n > 64 || 12 + n * 4 > u8.length) fail('TTC 字体数量异常');
  return Array.from({ length: n }, (_, k) => v.getUint32(12 + k * 4));
}


export function buildSfnt(version, tables) {
  const n = tables.length;
  let es = 0; while ((1 << (es + 1)) <= n) es++;
  const sr = (1 << es) * 16;
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  let total = 12 + n * 16;
  for (const t of sorted) total += (t.data.length + 3) & ~3;
  const out = new Uint8Array(total), v = dv(out);
  v.setUint32(0, version); v.setUint16(4, n); v.setUint16(6, sr); v.setUint16(8, es); v.setUint16(10, n * 16 - sr);
  let off = 12 + n * 16;
  sorted.forEach((t, k) => {
    const r = 12 + k * 16;
    for (let q = 0; q < 4; q++) out[r + q] = t.tag.charCodeAt(q);
    v.setUint32(r + 4, t.sum >>> 0); v.setUint32(r + 8, off); v.setUint32(r + 12, t.data.length);
    out.set(t.data, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}






export function splitFonts(u8, o = {}) {
  let bases = faceOffsets(u8);
  if (bases.length === 1 && bases[0] === 0) { checkSfnt(u8, 0); return [u8]; }
  if (Array.isArray(o.indices)) bases = bases.filter((_, k) => o.indices.includes(k));
  const v = dv(u8);
  const plans = bases.map(base => ({ base, tables: checkSfnt(u8, base) }));
  if (o.maxBytes) {
    const total = plans.reduce((a, p) => a + 12 + p.tables.length * 16 + p.tables.reduce((x, t) => x + ((t.len + 3) & ~3), 0), 0);
    if (total > o.maxBytes) fail(`拆开后共 ${(total / 1048576).toFixed(0)}MB，超过上限 ${(o.maxBytes / 1048576).toFixed(0)}MB（只挑需要的几款）`);
  }
  return plans.map(({ base, tables }) => {
    const face = buildSfnt(v.getUint32(base), tables.map(t => ({ tag: t.tag, sum: t.sum, data: u8.subarray(t.off, t.off + t.len) })));
    checkSfnt(face, 0);
    return face;
  });
}


export function woffTables(u8) {
  if (u8.length < 44 || tagAt(u8, 0) !== 'wOFF') fail('不是 WOFF 字体');
  const v = dv(u8);
  const flavor = v.getUint32(4), n = v.getUint16(12);
  if (!n || n > 96 || 44 + n * 20 > u8.length) fail('WOFF 表目录异常');
  const tables = [];
  for (let k = 0; k < n; k++) {
    const r = 44 + k * 20;
    const tag = tagAt(u8, r), off = v.getUint32(r + 4), comp = v.getUint32(r + 8), orig = v.getUint32(r + 12);
    if (off + comp > u8.length) fail(`WOFF 表 ${tag} 越界`);
    if (comp > orig) fail(`WOFF 表 ${tag} 长度异常`);
    tables.push({ tag, data: u8.subarray(off, off + comp), origLength: orig, sum: v.getUint32(r + 16), compressed: comp < orig });
  }
  return { flavor, tables };
}


export function readFontNames(u8) {
  const faces = [];
  let bases;
  try { bases = faceOffsets(u8); } catch { return faces; }
  const v = dv(u8);
  bases.forEach((base, index) => {
    try {
      const n = v.getUint16(base + 4);
      let nameOff = -1;
      for (let k = 0; k < n; k++) { const r = base + 12 + k * 16; if (tagAt(u8, r) === 'name') { nameOff = v.getUint32(r + 8); break; } }
      if (nameOff < 0) return;
      const count = v.getUint16(nameOff + 2), strOff = nameOff + v.getUint16(nameOff + 4);
      const got = {};
      for (let k = 0; k < count; k++) {
        const r = nameOff + 6 + k * 12;
        const plat = v.getUint16(r), enc = v.getUint16(r + 2), lang = v.getUint16(r + 4), id = v.getUint16(r + 6), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
        if (![1, 2, 4, 6, 16, 17].includes(id)) continue;
        const s0 = strOff + off;
        if (s0 + len > u8.length) continue;
        let s;
        if (plat === 3 || plat === 0) { s = ''; for (let q = 0; q + 1 < len; q += 2) s += String.fromCharCode(v.getUint16(s0 + q)); }
        else if (plat === 1 && enc === 0) { s = ''; for (let q = 0; q < len; q++) s += String.fromCharCode(u8[s0 + q]); }
        else continue;
        const pri = (plat === 3 && (lang === 0x409 || lang === 0)) ? 3 : plat === 3 ? 2 : 1;
        if (!got[id] || got[id].pri < pri) got[id] = { s, pri };
        (got['all' + id] ||= new Set()).add(s);
      }
      const ps = got[6] && got[6].s;
      if (!ps) return;
      faces.push({ ps, family: (got[16] || got[1] || {}).s || ps, sub: (got[17] || got[2] || {}).s || 'Regular',
        fullName: (got[4] || {}).s || ps, families: [...(got.all1 || []), ...(got.all16 || [])], index });
    } catch {  }
  });
  return faces;
}
