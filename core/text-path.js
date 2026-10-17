
























import { parseEngineData } from './engine-data.js';




export function subSegments(sub) {
  const K = (sub && sub.knots) || [];
  const segs = [];
  for (let k = 0; k + 1 < K.length; k++) segs.push([K[k].anchor, K[k].out || K[k].anchor, K[k + 1].in || K[k + 1].anchor, K[k + 1].anchor]);
  if (sub && sub.closed !== false && K.length > 1) {
    const a = K[K.length - 1], b = K[0];
    segs.push([a.anchor, a.out || a.anchor, b.in || b.anchor, b.anchor]);
  }
  return segs;
}

export function segmentsToFrame(segs) { const out = []; for (const s of segs) for (const p of s) out.push(+p[0], +p[1]); return out; }

export function frameToSub(cp) {
  const segs = [];
  for (let k = 0; k + 7 < cp.length; k += 8) segs.push([[cp[k], cp[k + 1]], [cp[k + 2], cp[k + 3]], [cp[k + 4], cp[k + 5]], [cp[k + 6], cp[k + 7]]]);
  if (!segs.length) return null;
  const f = segs[0][0], l = segs[segs.length - 1][3];
  const closed = segs.length > 1 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-3;
  const knots = [{ anchor: f.slice(), in: f.slice(), out: segs[0][1].slice() }];
  segs.forEach((s, i) => {
    const last = i === segs.length - 1;
    if (last && closed) { knots[0].in = s[2].slice(); return; }
    knots.push({ anchor: s[3].slice(), in: s[2].slice(), out: (segs[i + 1] ? segs[i + 1][1] : s[3]).slice() });
  });
  return { closed, knots };
}
const bez = (s, t) => { const m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]]; };
const bezD = (s, t) => { const m = 1 - t;
  return [3 * m * m * (s[1][0] - s[0][0]) + 6 * m * t * (s[2][0] - s[1][0]) + 3 * t * t * (s[3][0] - s[2][0]),
          3 * m * m * (s[1][1] - s[0][1]) + 6 * m * t * (s[2][1] - s[1][1]) + 3 * t * t * (s[3][1] - s[2][1])]; };


export function arcTable(segs, N = 64) {
  const S = [0], P = [0];
  let acc = 0, prev = segs.length ? segs[0][0] : [0, 0];
  segs.forEach((s, i) => {
    for (let k = 1; k <= N; k++) {
      const q = bez(s, k / N);
      acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q;
      S.push(acc); P.push(i + k / N);
    }
  });
  const total = acc;
  const tOfS = s => {                              
    if (s <= 0) return 0; if (s >= total) return segs.length;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const f = (s - S[lo]) / ((S[hi] - S[lo]) || 1);
    return P[lo] + (P[hi] - P[lo]) * f;
  };
  const sOfT = t => {                              
    if (t <= 0) return 0; if (t >= segs.length) return total;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= t) lo = m; else hi = m; }
    const f = (t - P[lo]) / ((P[hi] - P[lo]) || 1);
    return S[lo] + (S[hi] - S[lo]) * f;
  };
  const at = t => {                                
    const n = segs.length; if (!n) return { x: 0, y: 0, ang: 0 };
    const tt = Math.max(0, Math.min(n, t));
    const i = Math.min(n - 1, Math.floor(tt)), u = tt - i, s = segs[i];
    const p = bez(s, u); let d = bezD(s, u);
    if (Math.hypot(d[0], d[1]) < 1e-9) { const a = bez(s, Math.max(0, u - 1e-3)), b = bez(s, Math.min(1, u + 1e-3)); d = [b[0] - a[0], b[1] - a[1]]; }
    return { x: p[0], y: p[1], ang: Math.atan2(d[1], d[0]) };
  };
  return { total, tOfS, sOfT, at, n: segs.length };
}

export function nearestOnSegs(segs, x, y) {
  let best = { t: 0, d: Infinity, x: 0, y: 0 };
  segs.forEach((s, i) => {
    for (let k = 0; k <= 32; k++) { const q = bez(s, k / 32), d = Math.hypot(q[0] - x, q[1] - y); if (d < best.d) best = { t: i + k / 32, d, x: q[0], y: q[1] }; }
  });
  
  const n = segs.length;
  let lo = Math.max(0, best.t - 1 / 32), hi = Math.min(n, best.t + 1 / 32);
  const pt = t => { const i = Math.min(n - 1, Math.floor(t)); return bez(segs[i], t - i); };
  for (let it = 0; it < 24; it++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    const pa = pt(a), pb = pt(b);
    if (Math.hypot(pa[0] - x, pa[1] - y) < Math.hypot(pb[0] - x, pb[1] - y)) hi = b; else lo = a;
  }
  const t = (lo + hi) / 2, q = pt(t);
  return { t, d: Math.hypot(q[0] - x, q[1] - y), x: q[0], y: q[1] };
}

export function flattenSegs(segs, tol = 0.5) {
  const out = [];
  segs.forEach((s, i) => {
    const L = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) + Math.hypot(s[2][0] - s[1][0], s[2][1] - s[1][1]) + Math.hypot(s[3][0] - s[2][0], s[3][1] - s[2][1]);
    const n = Math.max(1, Math.min(200, Math.ceil(L / Math.max(0.25, tol * 4))));
    for (let k = i ? 1 : 0; k <= n; k++) out.push(bez(s, k / n));
  });
  return out;
}
export function segsBounds(segs) {
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  for (const p of flattenSegs(segs, 1)) { L = Math.min(L, p[0]); R = Math.max(R, p[0]); T = Math.min(T, p[1]); B = Math.max(B, p[1]); }
  return isFinite(L) ? { left: L, top: T, right: R, bottom: B } : null;
}

export function scanSpans(poly, y) {
  const xs = [];
  for (let k = 0, n = poly.length; k < n; k++) {
    const a = poly[k], b = poly[(k + 1) % n];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
  }
  xs.sort((p, q) => p - q);
  const out = [];
  for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
  return out;
}

export function bandSpans(poly, y0, y1) {
  const ys = [y0 + 0.01, (y0 + y1) / 2, y1 - 0.01];
  let cur = scanSpans(poly, ys[0]);
  for (const y of ys.slice(1)) {
    const nx = scanSpans(poly, y), out = [];
    for (const a of cur) for (const b of nx) { const l = Math.max(a[0], b[0]), r = Math.min(a[1], b[1]); if (r > l) out.push([l, r]); }
    cur = out;
  }
  return cur;
}







export function parseTxt2Frames(bytes) {
  let e;
  try { e = parseEngineData(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); } catch { return []; }
  const R = e && e['0'], D = e && e['1'];
  const frames = (R && R['8'] && R['8']['0']) || [];
  const decoded = frames.map(fr => {
    const p = fr && fr['0']; if (!p) return null;
    const cps = p['1'] && p['1']['0'];
    const data = p['2'] || {};
    const type = +data['0'] || 0;
    if (!Array.isArray(cps) || cps.length < 8 || !type) return null;
    const pd = data['11'] || {};
    return { type, sub: frameToSub(cps.map(Number)), range: Array.isArray(data['6']) ? data['6'].map(Number) : null,
      flip: pd['0'] === true, matrix: Array.isArray(data['2']) ? data['2'].map(Number) : null };
  });
  
  const objs = (D && D['1']) || [];
  if (!Array.isArray(objs) || !objs.length) return decoded;
  return objs.map((o, k) => {
    const fi = o && o['1'] && o['1']['0'] && o['1']['0'][0] && o['1']['0'][0]['0'];
    const idx = Number.isInteger(fi) ? fi : k;
    return decoded[idx] || null;
  });
}


export function readTextOnPath(desc) {
  const d = desc && desc.textOnPath;
  if (!d || typeof d !== 'object') return null;
  const cps = Array.isArray(d.controlPoints) ? d.controlPoints.map(Number) : null;
  if (!cps || cps.length < 8) return null;
  const kind = d.textType && (d.textType.value || d.textType);
  const ori = d.orientation && (d.orientation.value || d.orientation);
  return { type: kind === 'area' ? 1 : 2, sub: frameToSub(cps), range: [numOf(d.start, 0), numOf(d.end, cps.length / 8)], flip: !!d.flip,
    ...(ori ? { orientation: ori === 'vertical' ? 'vertical' : 'horizontal' } : {}) };
}
const numOf = (v, dflt) => (typeof v === 'number' && isFinite(v) ? v : (v && typeof v.value === 'number' ? v.value : dflt));

export function buildTextOnPathDesc(tp) {
  const cps = segmentsToFrame(subSegments(tp.sub));
  const n = cps.length / 8;
  return { __classID: 'textOnPath', __name: '',
    textType: { __enumType: 'textType', value: tp.type === 1 ? 'area' : 'path' },
    controlPoints: cps, start: +((tp.range && tp.range[0]) || 0), end: +((tp.range && tp.range[1] != null) ? tp.range[1] : n), flip: !!tp.flip,
    
    orientation: { __enumType: 'orientation', value: tp.orientation === 'vertical' ? 'vertical' : 'horizontal' },
    __doub: { start: true, end: true } };
}



const isCJK = c => /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿︰-﹏＀-￯]/.test(c);
function runAtOf(runs, text) { return i => { for (const r of runs) if (i >= r.from && i < r.to) return r; return runs[runs.length - 1]; }; }
function pieceStyle(run, ch, S) {
  let scale = 1, rise = run.baselineShift || 0, t = ch;
  if (run.caps === 'all') t = ch.toUpperCase();
  else if (run.caps === 'small' && ch !== ch.toUpperCase()) { t = ch.toUpperCase(); scale *= S.smallCaps; }
  if (run.baseline === 'superscript') { rise += run.fontSize * S.superPos; scale *= S.superSize; }
  else if (run.baseline === 'subscript') { rise -= run.fontSize * S.subPos; scale *= S.subSize; }
  return { t, scale, rise };
}
const SCRIPT = { superSize: 0.583, superPos: 0.333, subSize: 0.583, subPos: 0.333, smallCaps: 0.7 };





export function layoutPathText(model, api, tp) {
  const text = String(model.text || '').replace(/\n/g, ' ');
  const runs = model.runs && model.runs.length ? model.runs : [{ from: 0, to: text.length, fontSize: 12 }];
  const runAt = runAtOf(runs, text);
  let segs = subSegments(tp.sub);
  if (!segs.length) return { lines: [], bounds: null, overflow: false };
  const A0 = arcTable(segs);
  let s0 = A0.sOfT(tp.range ? tp.range[0] : 0), s1 = A0.sOfT(tp.range && tp.range[1] != null ? tp.range[1] : segs.length);
  const closed = tp.sub.closed !== false;
  if (closed && s1 <= s0) s1 += A0.total;            
  let A = A0;
  if (tp.flip) {                                      
    segs = segs.slice().reverse().map(s => [s[3], s[2], s[1], s[0]]);
    A = arcTable(segs);
    
    let r0 = A0.total - s1, r1 = A0.total - s0;
    if (r0 < 0) { r0 += A0.total; r1 += A0.total; }
    s0 = r0; s1 = r1;
  }
  const total = A.total;
  const posAt = s => {                                
    let ss = s;
    if (closed && total > 0) { ss = ((s % total) + total) % total; }
    return A.at(A.tOfS(ss));
  };
  
  const chars = [];
  let W = 0, asc = 0, desc = 0, lead = 0;
  const para = (model.paragraphs && model.paragraphs[0]) || {};
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length;
    const run = runAt(i), ps = pieceStyle(run, ch, SCRIPT);
    const w = api.measure(ps.t, run, ps.scale);
    const m = api.metrics(run, ps.scale);
    asc = Math.max(asc, m.ascent); desc = Math.max(desc, m.descent);
    lead = Math.max(lead, run.leading != null ? run.leading : (para.autoLeading || 1.2) * run.fontSize);
    chars.push({ t: ps.t, run, w, scale: ps.scale, rise: ps.rise, from: i, to: i + n, body: !/\s/.test(ch) });
    W += w; i += n;
  }
  const span = Math.max(0, s1 - s0);
  const J = para.justification != null ? para.justification : 0;
  let start = s0, gap = 0;
  if (J === 2 || J === 5) start = s0 + (span - W) / 2;
  else if (J === 1 || J === 4) start = s1 - W;
  else if ((J === 3 || J === 6) && chars.length > 1 && W < span) gap = (span - W) / (chars.length - 1);
  const pieces = [];
  let acc = start, overflow = false;
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  for (const c of chars) {
    const mid = acc + c.w / 2;
    
    if (mid < s0 - 0.01 || mid > s1 + 0.01 || (!closed && (mid < 0 || mid > total))) { overflow = overflow || mid > s1; acc += c.w + gap; continue; }
    const p = posAt(mid), tx = Math.cos(p.ang), ty = Math.sin(p.ang);
    const at = [p.x - tx * c.w / 2, p.y - ty * c.w / 2];
    pieces.push({ text: c.t, run: c.run, x: 0, w: c.w, scale: c.scale, rise: c.rise, from: c.from, to: c.to, body: c.body, at, rot: p.ang });
    const r = asc + desc;
    L = Math.min(L, p.x - r); R = Math.max(R, p.x + r); T = Math.min(T, p.y - r); B = Math.max(B, p.y + r);
    acc += c.w + gap;
  }
  
  for (const p of pieces) { const c = Math.cos(p.rot), s = Math.sin(p.rot); p.fr = { o: p.at, d: [c, s], n: [s, -c], len: p.w, h0: desc, h1: asc }; }
  const o0 = posAt(Math.max(s0, Math.min(s1, start))), c0 = Math.cos(o0.ang), n0 = Math.sin(o0.ang);
  const origin = { o: [o0.x, o0.y], d: [c0, n0], n: [n0, -c0], len: 0, h0: desc || 3, h1: asc || 12 };
  const lines = pieces.length ? [{ y: 0, x: 0, w: W, lead, ascent: asc, descent: desc, para: 0, pieces, from: 0 }] : [];
  return { lines, overflow, pathText: true, origin, bounds: pieces.length ? { left: L, top: T, right: R, bottom: B } : null,
    path: { total, s0, s1, flip: !!tp.flip } };
}








const NO_START = new Set('，。、；：？！）】」』》〉’”…—–,.;:?!)]}%‰·ー々〻ぁぃぅぇぉゃゅょっァィゥェォャュョッ～');
export function layoutAreaText(model, api, tp) {
  const text = String(model.text || '');
  const runs = model.runs && model.runs.length ? model.runs : [{ from: 0, to: text.length, fontSize: 12 }];
  const runAt = runAtOf(runs, text);
  const paras = model.paragraphs && model.paragraphs.length ? model.paragraphs : [{ from: 0, to: text.length }];
  const paraAt = i => { for (const p of paras) if (i >= p.from && i < p.to) return p; return paras[paras.length - 1]; };
  const segs = subSegments({ ...tp.sub, closed: true });
  const poly = flattenSegs(segs, 0.35);
  const bb = segsBounds(segs);
  if (!bb) return { lines: [], bounds: null, overflow: false };
  
  const tokens = [];
  const pushTok = (from, to) => {
    const pieces = []; let w = 0, trimW = 0, cur = null;
    let trail = to; while (trail > from && /\s/.test(text[trail - 1])) trail--;
    for (let i = from; i < to;) {
      const cp = text.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length;
      const run = runAt(i), ps = pieceStyle(run, ch, SCRIPT), body = i < trail;
      if (cur && cur.run === run && cur.scale === ps.scale && cur.rise === ps.rise && cur.body === body) { cur.text += ps.t; cur.to = i + n; }
      else { cur = { text: ps.t, run, scale: ps.scale, rise: ps.rise, from: i, to: i + n, body }; pieces.push(cur); }
      i += n;
    }
    for (const p of pieces) { p.w = api.measure(p.text, p.run, p.scale); w += p.w; if (p.body) trimW = w; }
    tokens.push({ from, to, pieces, w, trimW, first: text[from] });
  };
  const brks = [];
  let pf = 0;
  for (let k = 0; k <= text.length; k++) if (k === text.length || text[k] === '\n') {
    const toks0 = tokens.length;
    let i = pf;
    while (i < k) {
      const ch = String.fromCodePoint(text.codePointAt(i));
      if (isCJK(ch)) { let j = i + ch.length; while (j < k && /\s/.test(text[j])) j++; pushTok(i, j); i = j; continue; }
      let j = i;
      while (j < k && !/\s/.test(text[j]) && !isCJK(String.fromCodePoint(text.codePointAt(j)))) j += String.fromCodePoint(text.codePointAt(j)).length;
      while (j < k && /\s/.test(text[j])) j++;
      if (j === i) j = i + 1;
      pushTok(i, j); i = j;
    }
    brks.push([toks0, tokens.length, pf]);
    pf = k + 1;
  }
  const lines = [];
  let y = null, overflow = false, L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
  const lineMetrics = (pcs, para, emptyRun) => {
    let lead = 0, asc = 0, desc = 0;
    for (const p of (pcs.length ? pcs : [{ run: emptyRun, scale: 1, rise: 0 }])) {
      lead = Math.max(lead, p.run.leading != null ? p.run.leading : (para.autoLeading || 1.2) * p.run.fontSize);
      const m = api.metrics(p.run, p.scale);
      asc = Math.max(asc, m.ascent + Math.max(0, p.rise)); desc = Math.max(desc, m.descent - Math.min(0, p.rise));
    }
    return { lead, asc, desc };
  };
  
  const spanAt = (base, asc, desc) => {
    const sp = bandSpans(poly, base - asc, base + desc);
    let best = null; for (const s of sp) if (!best || s[1] - s[0] > best[1] - best[0]) best = s;
    return best;
  };
  let done = false;
  for (const [t0, t1, pStart] of brks) {
    if (done) break;
    const para = paraAt(pStart);
    const J = para.justification != null ? para.justification : 0;
    const indL = para.startIndent || 0, indR = para.endIndent || 0, indF = para.firstLineIndent || 0;
    if (lines.length) y += (para.spaceBefore || 0);
    let ti = t0, firstLine = true;
    do {
      const m0 = lineMetrics(ti < t1 ? tokens[ti].pieces : [], para, runAt(pStart));
      
      let base = y == null ? bb.top + m0.asc : y + m0.lead;
      let span = null;
      for (let guard = 0; guard < 400; guard++) {
        if (base + m0.desc > bb.bottom + 0.5) break;
        span = spanAt(base, m0.asc, m0.desc);
        const need = ti < t1 ? Math.min(tokens[ti].trimW || tokens[ti].w, 4 * m0.asc) : 0;
        if (span && span[1] - span[0] - indL - indR - (firstLine ? indF : 0) >= Math.max(1, need)) break;
        span = null; base += Math.max(1, m0.lead / 4);
      }
      if (!span) { overflow = ti < t1 || lines.length === 0; done = true; break; }
      const x0 = span[0] + indL + (firstLine ? indF : 0), avail = span[1] - indR - x0;
      const ln = []; let lw = 0;
      while (ti < t1) {
        const tk = tokens[ti];
        if (ln.length && lw + tk.trimW > avail) {
          if (NO_START.has(tk.first) && ln.length > 1) { ln.push(tk); lw += tk.w; ti++; }   
          break;
        }
        ln.push(tk); lw += tk.w; ti++;
      }
      const pcs = ln.flatMap(t => t.pieces);
      const m = lineMetrics(pcs, para, runAt(pStart));
      const trimW = ln.length ? ln.slice(0, -1).reduce((s, t) => s + t.w, 0) + ln[ln.length - 1].trimW : 0;
      const last = ti >= t1;
      let x = x0, gap = 0;
      const justify = J >= 3 && (J === 6 || !last) && ln.length > 1;
      if (justify) gap = (avail - trimW) / (ln.length - 1);
      else if (J === 1 || J === 4) x = x0 + avail - trimW;
      else if (J === 2 || J === 5) x = x0 + (avail - trimW) / 2;
      const placed = []; let cx = x;
      ln.forEach((t, k) => { for (const p of t.pieces) { placed.push({ text: p.text, run: p.run, x: cx, w: p.w, scale: p.scale, rise: p.rise, from: p.from, to: p.to, body: p.body }); cx += p.w; } if (k < ln.length - 1) cx += gap; });
      y = base;
      lines.push({ y, x, w: trimW + gap * Math.max(0, ln.length - 1), lead: m.lead, ascent: m.asc, descent: m.desc, para: 0, pieces: placed, from: pcs.length ? pcs[0].from : pStart });
      L = Math.min(L, x); R = Math.max(R, x + trimW); T = Math.min(T, y - m.asc); B = Math.max(B, y + m.desc);
      firstLine = false;
    } while (ti < t1);
    if (!done) y += (para.spaceAfter || 0);
  }
  return { lines, overflow, areaText: true, bounds: lines.length ? { left: L, top: T, right: R, bottom: B } : null };
}




export function pathTextMarkers(tp) {
  const segs = subSegments(tp.sub); if (!segs.length) return null;
  const A = arcTable(segs), n = segs.length;
  const r0 = tp.range ? tp.range[0] : 0, r1 = tp.range && tp.range[1] != null ? tp.range[1] : n;
  const p0 = A.at(r0), p1 = A.at(r1);
  return { start: { ...p0, t: r0 }, end: { ...p1, t: r1 }, total: A.total, n };
}








export function setEnginePathFallback(ed, tp) {
  const E = ed && ed.EngineDict; if (!E) throw new Error('EngineData 缺少 EngineDict');
  const b = segsBounds(subSegments(tp.sub)) || { left: 0, top: 0, right: 1, bottom: 1 };
  const R = E.Rendered || (E.Rendered = { Version: 1, Shapes: { WritingDirection: 0, Children: [{}] } });
  const shapes = R.Shapes || (R.Shapes = { WritingDirection: 0, Children: [{}] });
  const ch = (shapes.Children && shapes.Children[0]) || (shapes.Children = [{}])[0];
  ch.ShapeType = 1;
  if (ch.Procession == null) ch.Procession = 0;
  const ck = ch.Cookie || (ch.Cookie = {});
  const ps = ck.Photoshop || (ck.Photoshop = {});
  ps.ShapeType = 1;
  delete ps.PointBase;
  ps.BoxBounds = [b.left, b.top, Math.max(b.left + 1, b.right), Math.max(b.top + 1, b.bottom)];
  if (!ps.Base) ps.Base = { ShapeType: 1, TransformPoint0: [1, 0], TransformPoint1: [0, 1], TransformPoint2: [0, 0] };
  else ps.Base.ShapeType = 1;
  if (ps.__engineKeys) {
    ps.__engineKeys = ps.__engineKeys.filter(k => k !== 'PointBase');
    if (!ps.__engineKeys.includes('BoxBounds')) ps.__engineKeys.splice(1, 0, 'BoxBounds');
  }
  return ed;
}
