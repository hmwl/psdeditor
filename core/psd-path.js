























export const PATH_SELECTOR = {
  CLOSED_LENGTH: 0,
  CLOSED_KNOT_LINKED: 1,
  CLOSED_KNOT_UNLINKED: 2,
  OPEN_LENGTH: 3,
  OPEN_KNOT_LINKED: 4,
  OPEN_KNOT_UNLINKED: 5,
  PATH_FILL: 6,
  CLIPBOARD: 7,
  INITIAL_FILL: 8,
};


export const PATH_OPERATIONS = ['exclude', 'combine', 'subtract', 'intersect'];

const FIXED = 0x01000000;             
export const fixedToFloat = v => v / FIXED;
export const floatToFixed = v => Math.round(v * FIXED) | 0;

const RECORD_SIZE = 26;               





export function parsePathRecords(bytes) {
  const u8 = toU8(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const records = [];
  let o = 0;
  for (; o + RECORD_SIZE <= u8.length; o += RECORD_SIZE) {
    const selector = dv.getUint16(o, false);
    const d = o + 2;                             
    const raw = u8.slice(d, d + 24);
    switch (selector) {
      case 0: case 3: {
        
        const operation = dv.getInt16(d + 2, false);
        records.push({
          selector, type: 'subpath',
          open: selector === 3,
          knotCount: dv.getUint16(d, false),
          operation,
          operationName: PATH_OPERATIONS[operation] || null,   
          unknown1: dv.getUint16(d + 4, false),
          unknown2: dv.getUint32(d + 6, false),
          index: dv.getUint32(d + 10, false),
          unknown3: u8.slice(d + 14, d + 24),
        });
        break;
      }
      case 1: case 2: case 4: case 5: {
        
        const fixed = new Array(6);
        for (let i = 0; i < 6; i++) fixed[i] = dv.getInt32(d + i * 4, false);
        records.push({
          selector, type: 'knot',
          linked: selector === 1 || selector === 4,
          open: selector === 4 || selector === 5,
          fixed,
          
          preceding: { y: fixedToFloat(fixed[0]), x: fixedToFloat(fixed[1]) },
          anchor: { y: fixedToFloat(fixed[2]), x: fixedToFloat(fixed[3]) },
          leaving: { y: fixedToFloat(fixed[4]), x: fixedToFloat(fixed[5]) },
        });
        break;
      }
      case 6:
        
        records.push({ selector, type: 'fillRule', _raw: raw });
        break;
      case 7: {
        
        const fixed = new Array(5);
        for (let i = 0; i < 5; i++) fixed[i] = dv.getInt32(d + i * 4, false);
        records.push({
          selector, type: 'clipboard', fixed,
          top: fixedToFloat(fixed[0]), left: fixedToFloat(fixed[1]),
          bottom: fixedToFloat(fixed[2]), right: fixedToFloat(fixed[3]),
          resolution: fixedToFloat(fixed[4]),
          _rest: u8.slice(d + 20, d + 24),
        });
        break;
      }
      case 8:
        
        records.push({
          selector, type: 'initialFill',
          fillStartsWithAllPixels: dv.getUint16(d, false) !== 0,
          _rest: u8.slice(d + 2, d + 24),
        });
        break;
      default:
        
        records.push({ selector, type: 'unknown', _raw: raw });
        break;
    }
  }
  return { records, _tail: u8.slice(o) };
}




export function writePathRecords(model) {
  const records = Array.isArray(model) ? model : (model && model.records) || [];
  const tail = (!Array.isArray(model) && model && model._tail) ? toU8(model._tail) : null;
  const out = new Uint8Array(records.length * RECORD_SIZE + (tail ? tail.length : 0));
  const dv = new DataView(out.buffer);
  let o = 0;
  for (const rec of records) {
    dv.setUint16(o, rec.selector, false);
    const d = o + 2;
    switch (rec.type) {
      case 'subpath':
        dv.setUint16(d, rec.knotCount >>> 0, false);
        dv.setInt16(d + 2, rec.operation | 0, false);
        dv.setUint16(d + 4, rec.unknown1 >>> 0, false);
        dv.setUint32(d + 6, rec.unknown2 >>> 0, false);
        dv.setUint32(d + 10, rec.index >>> 0, false);
        out.set(pad(rec.unknown3, 10), d + 14);
        break;
      case 'knot':
        for (let i = 0; i < 6; i++) dv.setInt32(d + i * 4, fixedOf(rec, i), false);
        break;
      case 'clipboard':
        for (let i = 0; i < 5; i++) dv.setInt32(d + i * 4, (rec.fixed && rec.fixed[i]) | 0, false);
        out.set(pad(rec._rest, 4), d + 20);
        break;
      case 'initialFill':
        dv.setUint16(d, rec.fillStartsWithAllPixels ? 1 : 0, false);
        out.set(pad(rec._rest, 22), d + 2);
        break;
      default:   
        out.set(pad(rec._raw, 24), d);
        break;
    }
    o += RECORD_SIZE;
  }
  if (tail) out.set(tail, o);
  return out;
}


function fixedOf(rec, i) {
  if (rec.fixed && rec.fixed.length === 6) return rec.fixed[i] | 0;
  const pts = [rec.preceding, rec.anchor, rec.leaving][i >> 1] || {};
  return floatToFixed((i % 2 === 0 ? pts.y : pts.x) || 0);
}





export function parseVectorMask(bytes) {
  const u8 = toU8(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 8) return { version: 3, flags: 0, path: { records: [], _tail: u8.slice(0) } };
  const version = dv.getUint32(0, false);
  const flags = dv.getUint32(4, false);
  return {
    version, flags,
    invert: (flags & 1) !== 0,
    notLink: (flags & 2) !== 0,
    disable: (flags & 4) !== 0,
    path: parsePathRecords(u8.subarray(8)),
  };
}

export function writeVectorMask(m) {
  const body = writePathRecords(m.path || { records: [] });
  const out = new Uint8Array(8 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, m.version ?? 3, false);
  
  const flags = m.flags !== undefined ? m.flags
    : ((m.invert ? 1 : 0) | (m.notLink ? 2 : 0) | (m.disable ? 4 : 0));
  dv.setUint32(4, flags >>> 0, false);
  out.set(body, 8);
  return out;
}




export function countKnots(model) {
  const records = Array.isArray(model) ? model : (model && model.records) || [];
  return records.filter(r => r.type === 'knot').length;
}


export function groupSubpaths(model) {
  const records = Array.isArray(model) ? model : (model && model.records) || [];
  const groups = [];
  let cur = null;
  for (const r of records) {
    if (r.type === 'subpath') { cur = { subpath: r, knots: [] }; groups.push(cur); }
    else if (r.type === 'knot' && cur) cur.knots.push(r);
  }
  return groups;
}

function toU8(b) {
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return new Uint8Array(b || 0);
}

function pad(u8, n) {
  const b = toU8(u8);
  if (b.length === n) return b;
  const out = new Uint8Array(n);
  out.set(b.subarray(0, n));
  return out;
}
