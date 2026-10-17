
















const tagAt = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);

export function openFont(u8) {
  if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let base = 0;
  if (tagAt(u8, 0) === 'ttcf') base = dv.getUint32(12);           
  const n = dv.getUint16(base + 4);
  const T = {};
  for (let k = 0; k < n; k++) {
    const r = base + 12 + k * 16;
    T[tagAt(u8, r)] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) };
  }
  if (!T.head || !T.cmap) throw new Error('字体缺少 head / cmap 表');
  const u16 = o => dv.getUint16(o), i16 = o => dv.getInt16(o), u32 = o => dv.getUint32(o);
  const unitsPerEm = u16(T.head.off + 18) || 1000;
  const locFmt = i16(T.head.off + 50);
  const numGlyphs = T.maxp ? u16(T.maxp.off + 4) : 0;
  
  let ascender = unitsPerEm * 0.8, descender = -unitsPerEm * 0.2, numHM = 0;
  if (T.hhea) { ascender = i16(T.hhea.off + 4); descender = i16(T.hhea.off + 6); numHM = u16(T.hhea.off + 34); }
  if (T['OS/2'] && T['OS/2'].len >= 72) {                         
    const a = i16(T['OS/2'].off + 68), d = i16(T['OS/2'].off + 70);
    if (a > 0) { ascender = a; descender = d; }
  }
  const advance = gid => {
    if (!T.hmtx || !numHM) return unitsPerEm / 2;
    const k = Math.min(gid, numHM - 1);
    return u16(T.hmtx.off + k * 4);
  };
  
  const cmapOff = T.cmap.off, nSub = u16(cmapOff + 2);
  let best = null, bestScore = -1;
  for (let k = 0; k < nSub; k++) {
    const r = cmapOff + 4 + k * 8, pid = u16(r), eid = u16(r + 2), so = cmapOff + u32(r + 4);
    const fmt = u16(so);
    let score = -1;
    if (fmt === 12 && (pid === 3 && eid === 10 || pid === 0)) score = 5;
    else if (fmt === 4 && (pid === 3 && (eid === 1 || eid === 0) || pid === 0)) score = 4;
    else if (fmt === 6) score = 2;
    else if (fmt === 0) score = 1;
    if (score > bestScore) { best = { fmt, so }; bestScore = score; }
  }
  const gcache = new Map();
  const glyphIndex = cp => {
    if (gcache.has(cp)) return gcache.get(cp);
    let g = 0;
    if (best) {
      const { fmt, so } = best;
      if (fmt === 4) {
        const segX2 = u16(so + 6), ends = so + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
        for (let s = 0; s < segX2; s += 2) {
          const end = u16(ends + s);
          if (cp > end) continue;
          const start = u16(starts + s);
          if (cp < start) break;
          const delta = i16(deltas + s), ro = u16(ranges + s);
          if (!ro) g = (cp + delta) & 0xffff;
          else { const gi = u16(ranges + s + ro + (cp - start) * 2); g = gi ? (gi + delta) & 0xffff : 0; }
          break;
        }
      } else if (fmt === 12) {
        const ng = u32(so + 12);
        let lo = 0, hi = ng - 1;
        while (lo <= hi) {
          const m = (lo + hi) >> 1, r = so + 16 + m * 12, s0 = u32(r), e0 = u32(r + 4);
          if (cp < s0) hi = m - 1; else if (cp > e0) lo = m + 1; else { g = u32(r + 8) + (cp - s0); break; }
        }
      } else if (fmt === 6) {
        const first = u16(so + 6), cnt = u16(so + 8);
        if (cp >= first && cp < first + cnt) g = u16(so + 10 + (cp - first) * 2);
      } else if (fmt === 0) { if (cp < 256) g = u8[so + 6 + cp]; }
    }
    gcache.set(cp, g);
    return g;
  };
  
  let kernPairs = null;
  if (T.kern) {
    try {
      const ko = T.kern.off, nt = u16(ko + 2);
      let o = ko + 4;
      for (let t = 0; t < nt; t++) {
        const len = u16(o + 2), cov = u16(o + 4);
        if ((cov >> 8) === 0 && (cov & 1)) {
          const np = u16(o + 6); kernPairs = new Map();
          for (let p = 0; p < np; p++) { const r = o + 14 + p * 6; kernPairs.set(u16(r) * 65536 + u16(r + 2), i16(r + 4)); }
          break;
        }
        o += len;
      }
    } catch { kernPairs = null; }
  }
  const kern = (a, b) => (kernPairs && kernPairs.get(a * 65536 + b)) || 0;
  
  let outlineFn;
  if (T.glyf && T.loca) outlineFn = glyfReader(dv, T, locFmt, numGlyphs);
  else if (T['CFF ']) outlineFn = cffReader(u8, T['CFF '].off, T['CFF '].len);
  else throw new Error('字体没有可读的字形轮廓（glyf / CFF）；CFF2（可变字体）暂不支持');
  const ocache = new Map();
  const outline = gid => { if (!ocache.has(gid)) { let o; try { o = outlineFn(gid); } catch { o = []; } ocache.set(gid, o); } return ocache.get(gid); };
  return { unitsPerEm, ascender, descender, numGlyphs, glyphIndex, advance, kern, outline, kind: T.glyf ? 'truetype' : 'cff' };
}


function glyfReader(dv, T, locFmt, numGlyphs) {
  const u16 = o => dv.getUint16(o), i16 = o => dv.getInt16(o), u32 = o => dv.getUint32(o);
  const loc = gid => locFmt ? [u32(T.loca.off + gid * 4), u32(T.loca.off + gid * 4 + 4)] : [u16(T.loca.off + gid * 2) * 2, u16(T.loca.off + gid * 2 + 2) * 2];
  const read = (gid, depth) => {
    if (gid < 0 || (numGlyphs && gid >= numGlyphs) || depth > 8) return [];
    const [a, b] = loc(gid);
    if (b <= a) return [];
    const o = T.glyf.off + a, nc = i16(o);
    if (nc >= 0) return simple(o, nc);
    
    const out = [];
    let p = o + 10, more = true;
    while (more) {
      const flags = u16(p), gi = u16(p + 2); p += 4;
      let dx, dy;
      if (flags & 1) { dx = i16(p); dy = i16(p + 2); p += 4; } else { dx = dv.getInt8(p); dy = dv.getInt8(p + 1); p += 2; }
      let m = [1, 0, 0, 1];
      const f2 = q => i16(q) / 16384;
      if (flags & 8) { const s = f2(p); m = [s, 0, 0, s]; p += 2; }
      else if (flags & 0x40) { m = [f2(p), 0, 0, f2(p + 2)]; p += 4; }
      else if (flags & 0x80) { m = [f2(p), f2(p + 2), f2(p + 4), f2(p + 6)]; p += 8; }
      if (!(flags & 2)) { dx = 0; dy = 0; }                        
      for (const c of read(gi, depth + 1)) out.push({ closed: true, segs: c.segs.map(s => ({ t: s.t, p: xfPts(s.p, m, dx, dy) })) });
      more = !!(flags & 0x20);
    }
    return out;
  };
  const simple = (o, nc) => {
    const ends = []; for (let k = 0; k < nc; k++) ends.push(u16(o + 10 + k * 2));
    const np = nc ? ends[nc - 1] + 1 : 0;
    let p = o + 10 + nc * 2; p += 2 + u16(p);                      
    const flags = new Uint8Array(np);
    for (let k = 0; k < np;) { const f = dv.getUint8(p++); flags[k++] = f; if (f & 8) { let r = dv.getUint8(p++); while (r-- > 0 && k < np) flags[k++] = f; } }
    const xs = new Float64Array(np), ys = new Float64Array(np);
    let v = 0;
    for (let k = 0; k < np; k++) { const f = flags[k]; if (f & 2) { const d = dv.getUint8(p++); v += f & 16 ? d : -d; } else if (!(f & 16)) { v += i16(p); p += 2; } xs[k] = v; }
    v = 0;
    for (let k = 0; k < np; k++) { const f = flags[k]; if (f & 4) { const d = dv.getUint8(p++); v += f & 32 ? d : -d; } else if (!(f & 32)) { v += i16(p); p += 2; } ys[k] = v; }
    const contours = [];
    let s0 = 0;
    for (const e of ends) {
      const pts = [];
      for (let k = s0; k <= e; k++) pts.push({ x: xs[k], y: ys[k], on: !!(flags[k] & 1) });
      s0 = e + 1;
      if (pts.length) contours.push(quadContour(pts));
    }
    return contours;
  };
  return gid => read(gid, 0);
}
function xfPts(p, m, dx, dy) {
  const out = [];
  for (let k = 0; k < p.length; k += 2) out.push(m[0] * p[k] + m[2] * p[k + 1] + dx, m[1] * p[k] + m[3] * p[k + 1] + dy);
  return out;
}

function quadContour(pts) {
  const n = pts.length;
  let start = pts.findIndex(q => q.on);
  let first;
  if (start < 0) { first = { x: (pts[0].x + pts[n - 1].x) / 2, y: (pts[0].y + pts[n - 1].y) / 2 }; start = 0; }
  else { first = pts[start]; start = start + 1; }
  const segs = [{ t: 'M', p: [first.x, first.y] }];
  let ctrl = null;
  for (let k = 0; k < n; k++) {
    const q = pts[(start + k) % n];
    if (q === first) continue;
    if (q.on) { if (ctrl) { segs.push({ t: 'Q', p: [ctrl.x, ctrl.y, q.x, q.y] }); ctrl = null; } else segs.push({ t: 'L', p: [q.x, q.y] }); }
    else if (ctrl) { const mx = (ctrl.x + q.x) / 2, my = (ctrl.y + q.y) / 2; segs.push({ t: 'Q', p: [ctrl.x, ctrl.y, mx, my] }); ctrl = q; }
    else ctrl = q;
  }
  if (ctrl) segs.push({ t: 'Q', p: [ctrl.x, ctrl.y, first.x, first.y] });
  else segs.push({ t: 'L', p: [first.x, first.y] });
  return { closed: true, segs };
}


function cffReader(u8, off, len) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hdrSize = u8[off + 2];
  const readIndex = o => {
    const count = dv.getUint16(o);
    if (!count) return { items: [], end: o + 2 };
    const os = u8[o + 2];
    const offAt = k => { let v = 0; for (let q = 0; q < os; q++) v = v * 256 + u8[o + 3 + k * os + q]; return v; };
    const dataBase = o + 3 + (count + 1) * os - 1;
    const items = [];
    for (let k = 0; k < count; k++) items.push([dataBase + offAt(k), dataBase + offAt(k + 1)]);
    return { items, end: dataBase + offAt(count) };
  };
  const readDict = (a, b) => {
    const d = {}; const ops = [];
    let p = a;
    while (p < b) {
      const v = u8[p];
      if (v <= 21) {
        let key = v; p++;
        if (v === 12) { key = 1200 + u8[p]; p++; }
        d[key] = ops.splice(0);
      } else if (v === 28) { ops.push(dv.getInt16(p + 1)); p += 3; }
      else if (v === 29) { ops.push(dv.getInt32(p + 1)); p += 5; }
      else if (v === 30) {                                          
        let s = ''; p++;
        const tab = '0123456789.EE?-';
        outer: for (;;) { const byte = u8[p++]; for (const nib of [byte >> 4, byte & 15]) { if (nib === 15) break outer; if (nib === 12) s += 'E-'; else s += tab[nib]; } }
        ops.push(parseFloat(s));
      } else if (v >= 32 && v <= 246) { ops.push(v - 139); p++; }
      else if (v >= 247 && v <= 250) { ops.push((v - 247) * 256 + u8[p + 1] + 108); p += 2; }
      else if (v >= 251 && v <= 254) { ops.push(-(v - 251) * 256 - u8[p + 1] - 108); p += 2; }
      else p++;
    }
    return d;
  };
  const nameIdx = readIndex(off + hdrSize);
  const topIdx = readIndex(nameIdx.end);
  const strIdx = readIndex(topIdx.end);
  const gsubrIdx = readIndex(strIdx.end);
  const top = readDict(...topIdx.items[0]);
  const csIdx = readIndex(off + top[17][0]);
  const privOf = (pd) => {
    if (!pd || pd.length < 2) return { subrs: [], nominal: 0, dflt: 0 };
    const [size, po] = pd, pa = off + po;
    const priv = readDict(pa, pa + size);
    const subrs = priv[19] ? readIndex(pa + priv[19][0]).items : [];
    return { subrs, nominal: priv[21] ? priv[21][0] : 0, dflt: priv[20] ? priv[20][0] : 0 };
  };
  let fdSelect = null, fdPrivs = null;
  const mainPriv = privOf(top[18]);
  if (top[1230] && top[1236] && top[1237]) {                        
    const fdArr = readIndex(off + top[1236][0]).items.map(([a, b]) => privOf(readDict(a, b)[18]));
    fdPrivs = fdArr;
    const fo = off + top[1237][0], fmt = u8[fo];
    if (fmt === 0) fdSelect = gid => u8[fo + 1 + gid];
    else if (fmt === 3) {
      const nr = dv.getUint16(fo + 1);
      fdSelect = gid => { for (let k = 0; k < nr; k++) { const r = fo + 3 + k * 3; const f = dv.getUint16(r), nx = dv.getUint16(r + 3); if (gid >= f && gid < nx) return u8[r + 2]; } return 0; };
    }
  }
  const bias = n => n < 1240 ? 107 : n < 33900 ? 1131 : 32768;
  const gsubrs = gsubrIdx.items, gBias = bias(gsubrs.length);
  return gid => {
    const cs = csIdx.items[gid]; if (!cs) return [];
    const pv = fdPrivs ? (fdPrivs[fdSelect ? fdSelect(gid) : 0] || mainPriv) : mainPriv;
    const lsubrs = pv.subrs, lBias = bias(lsubrs.length);
    const contours = []; let cur = null;
    let x = 0, y = 0, stack = [], nStems = 0, haveWidth = false, done = false;
    const move = (nx, ny) => { if (cur) contours.push(cur); x = nx; y = ny; cur = { closed: true, segs: [{ t: 'M', p: [x, y] }] }; };
    const line = (nx, ny) => { if (!cur) move(x, y); x = nx; y = ny; cur.segs.push({ t: 'L', p: [x, y] }); };
    const curve = (a, b, c, d, e, f) => { if (!cur) move(x, y); cur.segs.push({ t: 'C', p: [a, b, c, d, e, f] }); x = e; y = f; };
    const width = (odd) => { if (!haveWidth) { haveWidth = true; if (odd) stack.shift(); } };
    const exec = (a, b, depth) => {
      if (depth > 10) return;
      let p = a;
      while (p < b && !done) {
        const v = u8[p];
        if (v >= 32) {
          if (v <= 246) { stack.push(v - 139); p++; }
          else if (v <= 250) { stack.push((v - 247) * 256 + u8[p + 1] + 108); p += 2; }
          else if (v <= 254) { stack.push(-(v - 251) * 256 - u8[p + 1] - 108); p += 2; }
          else { stack.push(dv.getInt32(p + 1) / 65536); p += 5; }
          continue;
        }
        if (v === 28) { stack.push(dv.getInt16(p + 1)); p += 3; continue; }
        p++;
        switch (v) {
          case 1: case 3: case 18: case 23: width(stack.length % 2); nStems += stack.length >> 1; stack = []; break;   
          case 19: case 20: width(stack.length % 2); nStems += stack.length >> 1; stack = []; p += (nStems + 7) >> 3; break;   
          case 21: width(stack.length > 2); move(x + stack[0], y + stack[1]); stack = []; break;    
          case 22: width(stack.length > 1); move(x + stack[0], y); stack = []; break;               
          case 4: width(stack.length > 1); move(x, y + stack[0]); stack = []; break;                
          case 5: for (let k = 0; k + 1 < stack.length; k += 2) line(x + stack[k], y + stack[k + 1]); stack = []; break;   
          case 6: case 7: {                                                                          
            let hz = v === 6;
            for (let k = 0; k < stack.length; k++) { if (hz) line(x + stack[k], y); else line(x, y + stack[k]); hz = !hz; }
            stack = []; break;
          }
          case 8: for (let k = 0; k + 5 < stack.length; k += 6) { const s = stack; curve(x + s[k], y + s[k + 1], x + s[k] + s[k + 2], y + s[k + 1] + s[k + 3], x + s[k] + s[k + 2] + s[k + 4], y + s[k + 1] + s[k + 3] + s[k + 5]); } stack = []; break;   
          case 24: {                                                                                 
            const s = stack; let k = 0;
            for (; k + 5 < s.length - 2; k += 6) curve(x + s[k], y + s[k + 1], x + s[k] + s[k + 2], y + s[k + 1] + s[k + 3], x + s[k] + s[k + 2] + s[k + 4], y + s[k + 1] + s[k + 3] + s[k + 5]);
            line(x + s[k], y + s[k + 1]); stack = []; break;
          }
          case 25: {                                                                                 
            const s = stack; let k = 0;
            for (; k + 1 < s.length - 6; k += 2) line(x + s[k], y + s[k + 1]);
            curve(x + s[k], y + s[k + 1], x + s[k] + s[k + 2], y + s[k + 1] + s[k + 3], x + s[k] + s[k + 2] + s[k + 4], y + s[k + 1] + s[k + 3] + s[k + 5]);
            stack = []; break;
          }
          case 26: {                                                                                 
            const s = stack; let k = 0, dx1 = 0;
            if (s.length % 2) { dx1 = s[0]; k = 1; }
            for (; k + 3 < s.length; k += 4) { const ax = x + dx1, ay = y + s[k]; const bx = ax + s[k + 1], by = ay + s[k + 2]; curve(ax, ay, bx, by, bx, by + s[k + 3]); dx1 = 0; }
            stack = []; break;
          }
          case 27: {                                                                                 
            const s = stack; let k = 0, dy1 = 0;
            if (s.length % 2) { dy1 = s[0]; k = 1; }
            for (; k + 3 < s.length; k += 4) { const ax = x + s[k], ay = y + dy1; const bx = ax + s[k + 1], by = ay + s[k + 2]; curve(ax, ay, bx, by, bx + s[k + 3], by); dy1 = 0; }
            stack = []; break;
          }
          case 30: case 31: {                                                                        
            const s = stack; let k = 0, hz = v === 31;
            while (k + 3 < s.length) {
              const last = k + 4 === s.length - 1 ? s[k + 4] : 0;
              if (hz) { const ax = x + s[k], ay = y, bx = ax + s[k + 1], by = ay + s[k + 2]; curve(ax, ay, bx, by, bx + last, by + s[k + 3]); }
              else { const ax = x, ay = y + s[k], bx = ax + s[k + 1], by = ay + s[k + 2]; curve(ax, ay, bx, by, bx + s[k + 3], by + last); }
              k += 4; hz = !hz;
            }
            stack = []; break;
          }
          case 10: { const i = stack.pop() + lBias; const r = lsubrs[i]; if (r) exec(r[0], r[1], depth + 1); break; }   
          case 29: { const i = stack.pop() + gBias; const r = gsubrs[i]; if (r) exec(r[0], r[1], depth + 1); break; }   
          case 11: return;                                                                           
          case 14: width(stack.length % 2 === 1 || stack.length === 5); stack = []; done = true; break;   
          case 12: {                                                                                 
            const e = u8[p++], s = stack;
            if (e === 35) { curve(x + s[0], y + s[1], x + s[0] + s[2], y + s[1] + s[3], x + s[0] + s[2] + s[4], y + s[1] + s[3] + s[5]);
              curve(x + s[6], y + s[7], x + s[6] + s[8], y + s[7] + s[9], x + s[6] + s[8] + s[10], y + s[7] + s[9] + s[11]); }
            else if (e === 34) { const y0 = y; curve(x + s[0], y, x + s[0] + s[1], y + s[2], x + s[0] + s[1] + s[3], y + s[2]);
              curve(x + s[4], y, x + s[4] + s[5], y0, x + s[4] + s[5] + s[6], y0); }
            else if (e === 36) { const y0 = y; curve(x + s[0], y + s[1], x + s[0] + s[2], y + s[1] + s[3], x + s[0] + s[2] + s[4], y + s[1] + s[3]);
              curve(x + s[5], y, x + s[5] + s[6], y + s[7], x + s[5] + s[6] + s[8], y0); }
            else if (e === 37) {
              const x0 = x, y0 = y;
              const ax = x + s[0], ay = y + s[1], bx = ax + s[2], by = ay + s[3], cx = bx + s[4], cy = by + s[5];
              curve(ax, ay, bx, by, cx, cy);
              const dx = cx + s[6], dy = cy + s[7], ex = dx + s[8], ey = dy + s[9];
              if (Math.abs(ex - x0) > Math.abs(ey - y0)) curve(dx, dy, ex, ey, ex + s[10], y0); else curve(dx, dy, ex, ey, x0, ey + s[10]);
            }
            stack = []; break;
          }
          default: stack = [];
        }
      }
    };
    exec(cs[0], cs[1], 0);
    if (cur) contours.push(cur);
    return contours.filter(c => c.segs.length > 1);
  };
}


export function outlineToCubics(outline) {
  const out = [];
  for (const c of outline) {
    const knots = [];
    let px = 0, py = 0;
    for (const s of c.segs) {
      if (s.t === 'M') { knots.push({ anchor: [s.p[0], s.p[1]], in: [s.p[0], s.p[1]], out: [s.p[0], s.p[1]] }); px = s.p[0]; py = s.p[1]; continue; }
      const last = knots[knots.length - 1];
      if (s.t === 'L') { knots.push({ anchor: [s.p[0], s.p[1]], in: [s.p[0], s.p[1]], out: [s.p[0], s.p[1]] }); px = s.p[0]; py = s.p[1]; }
      else if (s.t === 'Q') {
        const [qx, qy, x, y] = s.p;
        last.out = [px + (qx - px) * 2 / 3, py + (qy - py) * 2 / 3];
        knots.push({ anchor: [x, y], in: [x + (qx - x) * 2 / 3, y + (qy - y) * 2 / 3], out: [x, y] }); px = x; py = y;
      } else if (s.t === 'C') {
        const [a, b, cc, d, x, y] = s.p;
        last.out = [a, b];
        knots.push({ anchor: [x, y], in: [cc, d], out: [x, y] }); px = x; py = y;
      }
    }
    
    if (knots.length > 2) {
      const f = knots[0], l = knots[knots.length - 1];
      if (Math.abs(f.anchor[0] - l.anchor[0]) < 1e-6 && Math.abs(f.anchor[1] - l.anchor[1]) < 1e-6) { f.in = l.in; knots.pop(); }
    }
    if (knots.length >= 2) out.push(knots);
  }
  return out;
}


export function knotsArea(knots) {
  let a = 0;
  const n = knots.length;
  for (let k = 0; k < n; k++) {
    const p = knots[k], q = knots[(k + 1) % n];
    
    const P = [p.anchor, p.out, q.in, q.anchor];
    let prev = P[0];
    for (let s = 1; s <= 8; s++) {
      const t = s / 8, mt = 1 - t;
      const x = mt * mt * mt * P[0][0] + 3 * mt * mt * t * P[1][0] + 3 * mt * t * t * P[2][0] + t * t * t * P[3][0];
      const y = mt * mt * mt * P[0][1] + 3 * mt * mt * t * P[1][1] + 3 * mt * t * t * P[2][1] + t * t * t * P[3][1];
      a += prev[0] * y - x * prev[1]; prev = [x, y];
    }
  }
  return a / 2;
}
