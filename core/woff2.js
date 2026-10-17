












import { buildSfnt, FontFormatError } from './font-sfnt.js';

const fail = m => { throw new FontFormatError(m); };
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp',
  'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix',
  'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf',
  'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

class Rd {
  constructor(u8, off = 0, end = u8.length) { this.u8 = u8; this.o = off; this.end = end; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  need(n) { if (this.o + n > this.end) fail('WOFF2 数据截断'); }
  u8v() { this.need(1); return this.u8[this.o++]; }
  u16() { this.need(2); const v = this.dv.getUint16(this.o); this.o += 2; return v; }
  i16() { this.need(2); const v = this.dv.getInt16(this.o); this.o += 2; return v; }
  u32() { this.need(4); const v = this.dv.getUint32(this.o); this.o += 4; return v; }
  bytes(n) { this.need(n); const b = this.u8.subarray(this.o, this.o + n); this.o += n; return b; }
  base128() {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8v();
      if (i === 0 && b === 0x80) fail('WOFF2 UIntBase128 前导 0');
      if (v & 0xfe000000) fail('WOFF2 UIntBase128 溢出');
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v >>> 0;
    }
    fail('WOFF2 UIntBase128 过长');
  }
  u255() {
    const c = this.u8v();
    if (c === 253) return this.u16();
    if (c === 255) return this.u8v() + 253;
    if (c === 254) return this.u8v() + 506;
    return c;
  }
}

class Wr {
  constructor(n = 1024) { this.b = new Uint8Array(n); this.o = 0; }
  grow(n) { if (this.o + n <= this.b.length) return; let m = this.b.length * 2; while (m < this.o + n) m *= 2; const nb = new Uint8Array(m); nb.set(this.b.subarray(0, this.o)); this.b = nb; }
  u8(v) { this.grow(1); this.b[this.o++] = v & 0xff; }
  u16(v) { this.grow(2); this.b[this.o++] = (v >> 8) & 0xff; this.b[this.o++] = v & 0xff; }
  u32(v) { this.grow(4); for (const s of [24, 16, 8, 0]) this.b[this.o++] = (v >>> s) & 0xff; }
  raw(u8) { this.grow(u8.length); this.b.set(u8, this.o); this.o += u8.length; }
  pad(n) { while (this.o % n) this.u8(0); }
  out() { return this.b.slice(0, this.o); }
}

function checksum(u8) {
  let s = 0;
  const n = u8.length & ~3;
  for (let i = 0; i < n; i += 4) s = (s + ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3])) >>> 0;
  if (u8.length & 3) { let last = 0; for (let i = n; i < u8.length; i++) last |= u8[i] << (24 - 8 * (i - n)); s = (s + (last >>> 0)) >>> 0; }
  return s;
}



const withSign = (flag, v) => (flag & 1 ? v : -v);
function readTriplet(flag, g) {
  let dx, dy;
  if (flag < 10) { dx = 0; dy = withSign(flag, ((flag & 14) << 7) + g.u8v()); }
  else if (flag < 20) { dx = withSign(flag, (((flag - 10) & 14) << 7) + g.u8v()); dy = 0; }
  else if (flag < 84) { const b0 = flag - 20, b1 = g.u8v(); dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)); dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)); }
  else if (flag < 120) { const b0 = flag - 84; dx = withSign(flag, 1 + ((b0 / 12 | 0) << 8) + g.u8v()); dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + g.u8v()); }
  else if (flag < 124) { const a = g.u8v(), b = g.u8v(), c = g.u8v(); dx = withSign(flag, (a << 4) + (b >> 4)); dy = withSign(flag >> 1, ((b & 0x0f) << 8) + c); }
  else { const a = g.u8v(), b = g.u8v(), c = g.u8v(), d = g.u8v(); dx = withSign(flag, (a << 8) + b); dy = withSign(flag >> 1, (c << 8) + d); }
  return [dx, dy];
}


function encodeSimple(nContours, endPts, pts, instr, bbox, overlap) {
  const w = new Wr(16 + pts.length * 5 + instr.length);
  w.u16(nContours); w.u16(bbox[0] & 0xffff); w.u16(bbox[1] & 0xffff); w.u16(bbox[2] & 0xffff); w.u16(bbox[3] & 0xffff);
  for (const e of endPts) w.u16(e);
  w.u16(instr.length); w.raw(instr);
  const flags = [], xs = new Wr(pts.length * 2), ys = new Wr(pts.length * 2);
  let px = 0, py = 0;
  pts.forEach((p, i) => {
    let f = p.on ? 0x01 : 0;
    if (i === 0 && overlap) f |= 0x40;
    const dx = p.x - px, dy = p.y - py; px = p.x; py = p.y;
    if (dx === 0) f |= 0x10;
    else if (dx > -256 && dx < 256) { f |= 0x02; if (dx > 0) f |= 0x10; xs.u8(Math.abs(dx)); }
    else xs.u16(dx & 0xffff);
    if (dy === 0) f |= 0x20;
    else if (dy > -256 && dy < 256) { f |= 0x04; if (dy > 0) f |= 0x20; ys.u8(Math.abs(dy)); }
    else ys.u16(dy & 0xffff);
    flags.push(f);
  });
  for (const f of flags) w.u8(f);
  w.raw(xs.out()); w.raw(ys.out());
  return w.out();
}

function reconstructGlyf(data, locaIndexFormatHint) {
  const r = new Rd(data);
  r.u16();                                   
  const optionFlags = r.u16(), numGlyphs = r.u16(), indexFormat = r.u16();
  const sizes = []; for (let i = 0; i < 7; i++) sizes.push(r.u32());
  let off = r.o;
  const streams = sizes.map(sz => { const s = new Rd(data, off, off + sz); if (off + sz > data.length) fail('WOFF2 glyf 流越界'); off += sz; return s; });
  const [nContourS, nPointsS, flagS, glyphS, compositeS, bboxAll, instrS] = streams;
  const bmLen = 4 * Math.floor((numGlyphs + 31) / 32);
  const bboxBitmap = bboxAll.bytes(bmLen);
  const bboxS = bboxAll;                     
  let overlapBitmap = null;
  if (optionFlags & 1) { const n = (numGlyphs + 7) >> 3; if (off + n > data.length) fail('WOFF2 overlap 位图越界'); overlapBitmap = data.subarray(off, off + n); }
  const hasBbox = i => (bboxBitmap[i >> 3] >> (7 - (i & 7))) & 1;
  const glyphs = [], xMins = new Int16Array(numGlyphs);
  for (let i = 0; i < numGlyphs; i++) {
    const nContours = nContourS.i16();
    if (nContours === 0) { if (hasBbox(i)) fail('WOFF2 空字形带了 bbox'); glyphs.push(new Uint8Array(0)); continue; }
    if (nContours > 0) {
      const endPts = []; let total = 0;
      for (let c = 0; c < nContours; c++) { total += nPointsS.u255(); endPts.push(total - 1); }
      const pts = []; let x = 0, y = 0;
      for (let p = 0; p < total; p++) {
        const fl = flagS.u8v();
        const [dx, dy] = readTriplet(fl & 0x7f, glyphS);
        x += dx; y += dy;
        pts.push({ x, y, on: !(fl >> 7) });
      }
      const instrLen = glyphS.u255();
      const instr = instrS.bytes(instrLen);
      let bbox;
      if (hasBbox(i)) bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];
      else {
        let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
        for (const p of pts) { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; }
        bbox = pts.length ? [a, b, c, d] : [0, 0, 0, 0];
      }
      xMins[i] = bbox[0];
      const overlap = overlapBitmap && ((overlapBitmap[i >> 3] >> (7 - (i & 7))) & 1);
      glyphs.push(encodeSimple(nContours, endPts, pts, instr, bbox, overlap));
      continue;
    }
    
    if (!hasBbox(i)) fail('WOFF2 复合字形缺 bbox');
    const start = compositeS.o;
    let flags, haveInstr = false;
    do {
      flags = compositeS.u16(); compositeS.u16();          
      compositeS.bytes(flags & 0x0001 ? 4 : 2);
      if (flags & 0x0008) compositeS.bytes(2);
      else if (flags & 0x0040) compositeS.bytes(4);
      else if (flags & 0x0080) compositeS.bytes(8);
      if (flags & 0x0100) haveInstr = true;
    } while (flags & 0x0020);
    const comp = data.subarray(start, compositeS.o);
    const bbox = [bboxS.i16(), bboxS.i16(), bboxS.i16(), bboxS.i16()];
    xMins[i] = bbox[0];
    const w = new Wr(10 + comp.length + 2);
    w.u16(0xffff); for (const v of bbox) w.u16(v & 0xffff);
    w.raw(comp);
    if (haveInstr) { const n = glyphS.u255(); w.u16(n); w.raw(instrS.bytes(n)); }
    glyphs.push(w.out());
  }
  const fmt = indexFormat != null ? indexFormat : locaIndexFormatHint;
  const glyf = new Wr(), loca = new Wr((numGlyphs + 1) * (fmt ? 4 : 2));
  for (const g of glyphs) {
    fmt ? loca.u32(glyf.o) : loca.u16(glyf.o >> 1);
    glyf.raw(g); glyf.pad(fmt ? 4 : 2);
  }
  fmt ? loca.u32(glyf.o) : loca.u16(glyf.o >> 1);
  return { glyf: glyf.out(), loca: loca.out(), numGlyphs, indexFormat: fmt, xMins };
}

function reconstructHmtx(data, numGlyphs, numHMetrics, xMins) {
  const r = new Rd(data);
  const flags = r.u8v();
  const adv = []; for (let i = 0; i < numHMetrics; i++) adv.push(r.u16());
  const lsb = [];
  for (let i = 0; i < numHMetrics; i++) lsb.push(flags & 1 ? xMins[i] : r.i16());
  for (let i = numHMetrics; i < numGlyphs; i++) lsb.push(flags & 2 ? xMins[i] : r.i16());
  const w = new Wr(numHMetrics * 4 + (numGlyphs - numHMetrics) * 2);
  for (let i = 0; i < numHMetrics; i++) { w.u16(adv[i]); w.u16(lsb[i] & 0xffff); }
  for (let i = numHMetrics; i < numGlyphs; i++) w.u16(lsb[i] & 0xffff);
  return w.out();
}




export function woff2Payload(u8) {
  let payload = null;
  try { decodeWoff2(u8, b => { payload = b; throw new Error('stop'); }); } catch (e) { if (!payload) throw e; }
  return payload;
}

export function decodeWoff2(u8, brotli) {
  if (typeof brotli !== 'function') fail('解 WOFF2 需要 Brotli 解压函数');
  const r = new Rd(u8);
  if (u8.length < 48 || String.fromCharCode(...u8.subarray(0, 4)) !== 'wOF2') fail('不是 WOFF2 字体');
  r.o = 4;
  const flavor = r.u32(); r.u32();                 
  const numTables = r.u16(); r.u16();              
  const totalSfntSize = r.u32(), totalCompressed = r.u32();
  r.o = 48;
  if (!numTables || numTables > 256) fail(`WOFF2 表数量异常（${numTables}）`);
  const dir = [];
  for (let k = 0; k < numTables; k++) {
    const flags = r.u8v();
    const tag = (flags & 0x3f) === 0x3f ? String.fromCharCode(...r.bytes(4)) : KNOWN_TAGS[flags & 0x3f];
    if (!tag) fail('WOFF2 表标签非法');
    const ver = flags >> 6;
    const origLength = r.base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? ver === 0 : ver !== 0;
    const transformLength = transformed ? r.base128() : origLength;
    dir.push({ tag, ver, origLength, transformed, length: transformLength });
  }
  let collection = null;
  if (flavor === 0x74746366) {                     
    const ttcVersion = r.u32(), numFonts = r.u255();
    collection = { version: ttcVersion, fonts: [] };
    for (let f = 0; f < numFonts; f++) {
      const n = r.u255(), fl = r.u32(), idx = [];
      for (let t = 0; t < n; t++) idx.push(r.u255());
      collection.fonts.push({ flavor: fl, tables: idx });
    }
  }
  const comp = r.bytes(totalCompressed);
  let data;
  try { data = brotli(comp); } catch (e) { if (e && e.message === 'stop') throw e; fail('WOFF2 数据流 Brotli 解压失败：' + (e && e.message || e)); }
  data = data instanceof Uint8Array ? data : new Uint8Array(data);
  let off = 0;
  for (const t of dir) { t.data = data.subarray(off, off + t.length); off += t.length; if (off > data.length) fail(`WOFF2 表 ${t.tag} 数据越界`); }
  if (totalSfntSize > 512 * 1048576) fail('WOFF2 声明的解压尺寸过大');

  
  const buildFace = entries => {
    const byTag = Object.fromEntries(entries.map(t => [t.tag, t]));
    const out = new Map();
    let glyfRes = null;
    const head = byTag.head && byTag.head.data;
    if (byTag.glyf && byTag.glyf.transformed) {
      glyfRes = byTag.glyf._res || (byTag.glyf._res = reconstructGlyf(byTag.glyf.data, head ? new DataView(head.buffer, head.byteOffset).getInt16(50) : 1));
      out.set('glyf', glyfRes.glyf); out.set('loca', glyfRes.loca);
    }
    for (const t of entries) {
      if (out.has(t.tag)) continue;
      if (t.tag === 'loca' && t.transformed) continue;   
      if (t.tag === 'hmtx' && t.transformed) {
        if (!glyfRes) fail('WOFF2 hmtx 变换需要 glyf');
        const hh = byTag.hhea && byTag.hhea.data; if (!hh) fail('WOFF2 缺 hhea');
        const numH = new DataView(hh.buffer, hh.byteOffset, hh.byteLength).getUint16(34);
        out.set('hmtx', reconstructHmtx(t.data, glyfRes.numGlyphs, numH, glyfRes.xMins));
        continue;
      }
      if (t.transformed) fail(`WOFF2 表 ${t.tag} 用了不认识的变换`);
      out.set(t.tag, t.data.slice());
    }
    if (out.has('head')) {                              
      const h = out.get('head'); const hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
      if (glyfRes && h.length >= 52) hv.setInt16(50, glyfRes.indexFormat);
      if (h.length >= 12) hv.setUint32(8, 0);
    }
    return [...out].map(([tag, d]) => ({ tag, data: d, sum: checksum(d) }));
  };
  const finishHead = (font, tables) => {           
    const adj = (0xb1b0afba - checksum(font)) >>> 0;
    const v = new DataView(font.buffer, font.byteOffset, font.byteLength);
    const n = v.getUint16(4);
    for (let k = 0; k < n; k++) { const rr = 12 + k * 16; if (String.fromCharCode(...font.subarray(rr, rr + 4)) === 'head') { v.setUint32(v.getUint32(rr + 8) + 8, adj); break; } }
    void tables;
    return font;
  };

  if (!collection) {
    const tables = buildFace(dir);
    return finishHead(buildSfnt(flavor, tables), tables);
  }
  
  const faces = collection.fonts.map(f => { const tables = buildFace(f.tables.map(i => dir[i])); return finishHead(buildSfnt(f.flavor, tables), tables); });
  const hdr = 12 + faces.length * 4;
  let total = hdr; const offs = [];
  for (const f of faces) { offs.push(total); total += (f.length + 3) & ~3; }
  const outU8 = new Uint8Array(total), v = new DataView(outU8.buffer);
  outU8.set([0x74, 0x74, 0x63, 0x66]); v.setUint32(4, 0x00010000); v.setUint32(8, faces.length);
  faces.forEach((f, k) => {
    v.setUint32(12 + k * 4, offs[k]);
    
    const fv = new DataView(f.buffer, f.byteOffset, f.byteLength), n = fv.getUint16(4);
    const copy = f.slice(), cv = new DataView(copy.buffer);
    for (let t = 0; t < n; t++) cv.setUint32(12 + t * 16 + 8, fv.getUint32(12 + t * 16 + 8) + offs[k]);
    outU8.set(copy, offs[k]);
  });
  return outU8;
}

export default { decodeWoff2, woff2Payload };
