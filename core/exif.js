


















const TAGS0 = { 0x010F: 'make', 0x0110: 'model', 0x0131: 'software', 0x0132: 'dateTime', 0x0112: 'orientation', 0x013B: 'artist', 0x8298: 'copyright' };
const TAGSX = { 0x829A: 'exposureTime', 0x829D: 'fNumber', 0x8827: 'iso', 0x8833: 'iso2', 0x9003: 'dateTimeOriginal', 0x9201: 'shutterSpeedValue', 0x9202: 'apertureValue',
  0x9204: 'exposureBias', 0x920A: 'focalLength', 0xA405: 'focalLength35', 0xA434: 'lensModel', 0xA433: 'lensMake', 0x8822: 'exposureProgram', 0x9209: 'flash' };
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

const u8of = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);


export function findExifTiff(bytes) {
  const u = u8of(bytes), n = u.length;
  const isTiff = o => o + 8 <= n && ((u[o] === 0x49 && u[o + 1] === 0x49 && u[o + 2] === 42 && u[o + 3] === 0) || (u[o] === 0x4D && u[o + 1] === 0x4D && u[o + 2] === 0 && u[o + 3] === 42));
  const exifHdr = o => o + 6 <= n && u[o] === 0x45 && u[o + 1] === 0x78 && u[o + 2] === 0x69 && u[o + 3] === 0x66 && u[o + 4] === 0 && u[o + 5] === 0;
  if (n < 12) return null;
  if (u[0] === 0xFF && u[1] === 0xD8) {                                     
    let o = 2;
    while (o + 4 <= n) {
      if (u[o] !== 0xFF) { o++; continue; }
      const m = u[o + 1];
      if (m === 0xFF) { o++; continue; }
      if (m === 0xD9 || m === 0xDA) break;                                  
      if (m >= 0xD0 && m <= 0xD7 || m === 0x01) { o += 2; continue; }
      const len = (u[o + 2] << 8) | u[o + 3];
      if (m === 0xE1 && exifHdr(o + 4) && isTiff(o + 10)) return u.subarray(o + 10, Math.min(n, o + 2 + len));
      o += 2 + len;
    }
    return null;
  }
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) {  
    let o = 8;
    while (o + 12 <= n) {
      const len = ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
      const type = String.fromCharCode(u[o + 4], u[o + 5], u[o + 6], u[o + 7]);
      if (type === 'eXIf') { const s = o + 8; return exifHdr(s) && isTiff(s + 6) ? u.subarray(s + 6, s + len) : isTiff(s) ? u.subarray(s, s + len) : null; }
      if (type === 'IEND') break;
      o += 12 + len;
    }
    return null;
  }
  if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) {   
    let o = 12;
    while (o + 8 <= n) {
      const type = String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
      const len = (u[o + 4] | (u[o + 5] << 8) | (u[o + 6] << 16) | (u[o + 7] << 24)) >>> 0;
      if (type === 'EXIF') { const s = o + 8; return exifHdr(s) ? u.subarray(s + 6, s + len) : isTiff(s) ? u.subarray(s, s + len) : null; }
      o += 8 + len + (len & 1);
    }
    return null;
  }
  if (isTiff(0)) return u;                                                  
  if (u[0] === 0x38 && u[1] === 0x42 && u[2] === 0x50 && u[3] === 0x53) { const r = readPsdImageResource(u, 1058); return r && r.length >= 8 ? r : null; }   
  return null;
}


export function parseExifTiff(tiff) {
  const u = u8of(tiff);
  if (u.length < 8) return null;
  const le = u[0] === 0x49;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const U16 = o => dv.getUint16(o, le), U32 = o => dv.getUint32(o, le), S32 = o => dv.getInt32(o, le);
  if (U16(2) !== 42) return null;
  const out = {};
  const readIfd = (off, map, seen) => {
    if (!(off >= 8 && off + 2 <= u.length) || seen.has(off)) return null;
    seen.add(off);
    const cnt = U16(off); let sub = null;
    for (let i = 0; i < cnt; i++) {
      const e = off + 2 + i * 12; if (e + 12 > u.length) break;
      const tag = U16(e), type = U16(e + 2), num = U32(e + 4);
      const size = (TYPE_SIZE[type] || 1) * num;
      const vo = size <= 4 ? e + 8 : U32(e + 8);
      if (vo + size > u.length) continue;
      if (tag === 0x8769) { sub = U32(e + 8); continue; }
      const key = map[tag]; if (!key) continue;
      let val;
      if (type === 2) { val = ''; for (let k = 0; k < num; k++) { const c = u[vo + k]; if (!c) break; val += String.fromCharCode(c); } val = val.trim(); try { val = new TextDecoder('utf-8').decode(u.subarray(vo, vo + num)).replace(/\0[\s\S]*$/, '').trim(); } catch {} }
      else if (type === 3) val = U16(vo);
      else if (type === 4) val = U32(vo);
      else if (type === 5) { const a = U32(vo), b = U32(vo + 4); val = b ? a / b : 0; }
      else if (type === 10) { const a = S32(vo), b = S32(vo + 4); val = b ? a / b : 0; }
      else if (type === 9) val = S32(vo);
      else if (type === 8) val = dv.getInt16(vo, le);
      else if (type === 11) val = dv.getFloat32(vo, le);       
      else if (type === 12) val = dv.getFloat64(vo, le);
      else continue;
      out[key] = val;
    }
    return sub;
  };
  const seen = new Set();
  const sub = readIfd(U32(4), TAGS0, seen);
  if (sub) readIfd(sub, TAGSX, seen);
  
  if (!(out.exposureTime > 0) && Number.isFinite(out.shutterSpeedValue)) out.exposureTime = Math.pow(2, -out.shutterSpeedValue);
  if (!(out.fNumber > 0) && Number.isFinite(out.apertureValue)) out.fNumber = Math.pow(2, out.apertureValue / 2);
  if (!(out.iso > 0) && out.iso2 > 0) out.iso = out.iso2;
  delete out.iso2; delete out.shutterSpeedValue; delete out.apertureValue;
  return out;
}


export function readExif(bytes) {
  try { const t = findExifTiff(bytes); return t ? parseExifTiff(t) : null; } catch { return null; }
}


export function exposureLog2(e) {
  if (!e || !(e.exposureTime > 0)) return null;
  const N = e.fNumber > 0 ? e.fNumber : 1, iso = e.iso > 0 ? e.iso : 100;
  return Math.log2(e.exposureTime) + Math.log2(iso / 100) - 2 * Math.log2(N);
}


export function evFromExif(list) {
  const e = list.map(exposureLog2);
  if (!e.length || e.some(v => v == null || !Number.isFinite(v))) return null;
  
  const hasN = list.map(x => x.fNumber > 0), hasI = list.map(x => x.iso > 0);
  if (hasN.some(v => v !== hasN[0]) || hasI.some(v => v !== hasI[0])) return null;
  const s = [...e].sort((a, b) => a - b), mid = s[(e.length - 1) >> 1];
  return e.map(v => Math.round((v - mid) * 100) / 100);
}


export function formatExposure(t) {
  if (!(t > 0)) return '';
  if (t >= 1) return (Math.round(t * 10) / 10) + ' 秒';
  const d = 1 / t;
  return Math.abs(d - Math.round(d)) < 0.05 * d ? `1/${Math.round(d)} 秒` : `${(Math.round(t * 10000) / 10000)} 秒`;
}
export function describeExif(e) {
  if (!e) return null;
  const cam = [e.make, e.model && e.make && e.model.toLowerCase().startsWith(e.make.toLowerCase()) ? e.model.slice(e.make.length).trim() : e.model].filter(Boolean).join(' ');
  return {
    camera: cam || '',
    lens: e.lensModel || '',
    exposure: [e.exposureTime > 0 ? formatExposure(e.exposureTime) : '', e.fNumber > 0 ? `f/${Math.round(e.fNumber * 10) / 10}` : '', e.iso > 0 ? `ISO ${e.iso}` : '',
      e.focalLength > 0 ? `${Math.round(e.focalLength * 10) / 10} mm` : '', Number.isFinite(e.exposureBias) && e.exposureBias ? `${e.exposureBias > 0 ? '+' : ''}${Math.round(e.exposureBias * 100) / 100} EV` : ''].filter(Boolean).join('  ·  '),
    date: e.dateTimeOriginal || e.dateTime || '',
    software: e.software || '',
  };
}


export function readPsdImageResource(bytes, id) {
  const u = u8of(bytes);
  if (u.length < 34 || u[0] !== 0x38 || u[1] !== 0x42 || u[2] !== 0x50 || u[3] !== 0x53) return null;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let o = 26; o += 4 + dv.getUint32(o);
  const len = dv.getUint32(o), end = Math.min(u.length, o + 4 + len); o += 4;
  while (o + 12 <= end) {
    if (dv.getUint32(o) !== 0x3842494d) break;
    const rid = dv.getUint16(o + 4); o += 6;
    const nl = u[o]; o += 1 + nl; if ((1 + nl) % 2) o++;
    const sz = dv.getUint32(o); o += 4;
    if (rid === id) return u.subarray(o, Math.min(end, o + sz));
    o += sz + (sz & 1);
  }
  return null;
}
