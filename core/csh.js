















import { parsePathRecords, writePathRecords, floatToFixed } from './psd-path.js';

const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);


export function recordsToSubpaths(records) {
  const out = [];
  let cur = null, left = 0;
  for (const r of records) {
    if (r.type === 'subpath') {
      cur = { closed: !r.open, operation: r.operation >= 0 && r.operation <= 3 ? r.operation : 1, knots: [] };
      left = r.knotCount; out.push(cur);
    } else if (r.type === 'knot' && cur && left > 0) {
      cur.knots.push({ anchor: [r.anchor.x, r.anchor.y], in: [r.preceding.x, r.preceding.y], out: [r.leaving.x, r.leaving.y] });
      left--;
    }
  }
  return out.filter(s => s.knots.length);
}


export function subpathsToRecords(subpaths) {
  const recs = [{ selector: 6, type: 'fillRule', _raw: new Uint8Array(24) }];
  for (const sp of subpaths || []) {
    const closed = sp.closed !== false;
    recs.push({ selector: closed ? 0 : 3, type: 'subpath', open: !closed, knotCount: sp.knots.length,
      operation: sp.operation == null ? 1 : sp.operation, unknown1: 1, unknown2: 0, index: 0, unknown3: new Uint8Array(10) });
    for (const k of sp.knots) {
      const [ax, ay] = k.anchor, [ix, iy] = k.in || k.anchor, [ox, oy] = k.out || k.anchor;
      
      const c = (ix - ax) * (oy - ay) - (iy - ay) * (ox - ax), d = (ix - ax) * (ox - ax) + (iy - ay) * (oy - ay);
      const linked = Math.abs(c) < 1e-6 && d < 0;
      recs.push({ selector: closed ? (linked ? 1 : 2) : (linked ? 4 : 5), type: 'knot',
        fixed: [iy, ix, ay, ax, oy, ox].map(floatToFixed) });
    }
  }
  return recs;
}


export function readCsh(bytes) {
  const u8 = toU8(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 0;
  const need = n => { if (o + n > u8.length) throw new Error('.csh 数据被截断'); };
  const u32 = () => { need(4); const v = dv.getUint32(o); o += 4; return v; };
  const sig = String.fromCharCode(...u8.subarray(0, 4)); o = 4;
  if (sig !== 'cush') throw new Error('不是 Photoshop 自定形状文件（缺 cush 签名）');
  const ver = u32();
  if (ver !== 2) throw new Error('不支持的 .csh 版本：' + ver);
  const count = u32();
  const shapes = [], warnings = [];
  for (let i = 0; i < count; i++) {
    try {
      const n = u32(); need(n * 2);
      let name = ''; for (let k = 0; k < n; k++) { const c = dv.getUint16(o + k * 2); if (c) name += String.fromCharCode(c); }
      o += n * 2;
      while (o % 4) o++;
      const sv = u32();
      if (sv !== 1) throw new Error('形状记录版本不是 1：' + sv);
      const size = u32(), end = o + size;
      if (end > u8.length) throw new Error('形状记录越界');
      const il = u8[o++]; let id = ''; for (let k = 0; k < il; k++) id += String.fromCharCode(u8[o++]);
      const top = u32(), left = u32(), bottom = u32(), right = u32();
      const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
      const recs = parsePathRecords(u8.subarray(o, end)).records;
      o = end;
      shapes.push({ id: id || undefined, name: name || `形状 ${i + 1}`, width, height, aspect: width / height, subpaths: recordsToSubpaths(recs) });
    } catch (e) { warnings.push(`第 ${i + 1} 个形状：${e.message}`); break; }
  }
  return Object.assign(shapes, { warnings });
}


export function writeCsh(shapes) {
  const parts = [];
  let len = 0;
  const push = b => { parts.push(b); len += b.length; };
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); push(b); };
  push(new Uint8Array([0x63, 0x75, 0x73, 0x68]));            
  u32(2); u32(shapes.length);
  for (const s of shapes) {
    const name = String(s.name || '');
    u32(name.length + 1);
    const nb = new Uint8Array((name.length + 1) * 2), nd = new DataView(nb.buffer);
    for (let i = 0; i < name.length; i++) nd.setUint16(i * 2, name.charCodeAt(i));
    push(nb);
    if (len % 4) push(new Uint8Array(4 - (len % 4)));
    let w = s.width, h = s.height;
    if (!(w > 0 && h > 0)) { const a = s.aspect > 0 ? s.aspect : 1; w = a >= 1 ? 1000 : Math.round(1000 * a); h = a >= 1 ? Math.round(1000 / a) : 1000; }
    const id = String(s.id || '').replace(/[^\x20-\x7e]/g, '').slice(0, 255);
    const recs = writePathRecords(subpathsToRecords(s.subpaths));
    const body = new Uint8Array(1 + id.length + 16 + recs.length), bd = new DataView(body.buffer);
    body[0] = id.length; for (let i = 0; i < id.length; i++) body[1 + i] = id.charCodeAt(i);
    let p = 1 + id.length;
    bd.setUint32(p, 0); bd.setUint32(p + 4, 0); bd.setUint32(p + 8, Math.round(h)); bd.setUint32(p + 12, Math.round(w));
    body.set(recs, p + 16);
    u32(1); u32(body.length); push(body);
  }
  const out = new Uint8Array(len); let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}


export function normalizeSubpaths(subpaths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sp of subpaths) for (const k of sp.knots) for (const p of [k.anchor, k.in || k.anchor, k.out || k.anchor]) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  const w = Math.max(1e-9, x1 - x0), h = Math.max(1e-9, y1 - y0);
  const m = p => [(p[0] - x0) / w, (p[1] - y0) / h];
  return {
    width: w, height: h,
    subpaths: subpaths.map(sp => ({ closed: sp.closed !== false, operation: sp.operation == null ? 1 : sp.operation,
      knots: sp.knots.map(k => ({ anchor: m(k.anchor), in: m(k.in || k.anchor), out: m(k.out || k.anchor) })) })),
  };
}

export default { readCsh, writeCsh, recordsToSubpaths, subpathsToRecords, normalizeSubpaths };
