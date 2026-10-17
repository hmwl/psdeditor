



















import { subSegments, arcTable, flattenSegs, segsBounds, bandSpans } from './text-path.js';

const V_PUNCT_CORNER = new Set('，。、．｡､﹐﹑');
const V_ROTATE = new Set('（）「」『』【】《》〈〉〔〕［］｛｝—…～ー－―‥〜()[]{}<>');
const NO_START = new Set('，。、；：？！）】」』》〉’”…—–,.;:?!)]}%‰·ー々〻ぁぃぅぇぉゃゅょっァィゥェォャュョッ～');
const isCJK = c => /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿︰-﹏＀-￯]/.test(c);






export function verticalUnits(model, api) {
  const text = String(model.text || '');
  const runs = model.runs && model.runs.length ? model.runs : [{ from: 0, to: text.length, fontSize: 12 }];
  const paras = model.paragraphs && model.paragraphs.length ? model.paragraphs : [{ from: 0, to: text.length }];
  const runAt = i => runs.find(r => i >= r.from && i < r.to) || runs[runs.length - 1];
  const paraAt = i => { for (const p of paras) if (i >= p.from && i < p.to) return p; return paras[paras.length - 1]; };
  const units = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length;
    if (ch === '\n') { units.push({ br: true, from: i, to: i + 1, run: runAt(i) }); i += n; continue; }
    const r = runAt(i), last = units[units.length - 1];
    if (r.tcy && !/\s/.test(ch)) {
      if (last && last.kind === 'tcy' && last.run === r) { last.text += ch; last.to = i + n; }
      else units.push({ kind: 'tcy', text: ch, run: r, from: i, to: i + n });
      i += n; continue;
    }
    const half = ch === ' ' || (!isCJK(ch) && !/\s/.test(ch) && cp < 0x2E80);
    const rot = V_ROTATE.has(ch) || half;
    if (rot && !V_ROTATE.has(ch) && last && last.kind === 'rot' && last.run === r && !last.bracket) { last.text += ch; last.to = i + n; }
    else units.push({ kind: rot ? 'rot' : (V_PUNCT_CORNER.has(ch) ? 'corner' : 'up'), text: ch, run: r, from: i, to: i + n, bracket: V_ROTATE.has(ch) });
    i += n;
  }
  for (const u of units) {
    const r = u.run, size = r.fontSize || 12, para = paraAt(u.from);
    u.size = size;
    u.lead = r.leading != null ? r.leading : (para.autoLeading != null ? para.autoLeading : 1.2) * size;
    u.para = para;
    if (u.br) { u.adv = 0; u.trk = 0; continue; }
    const t = r.caps === 'all' ? u.text.toUpperCase() : u.text;
    u.t = t;
    u.trk = (r.tracking || 0) * size / 1000;
    if (u.kind === 'rot') {
      
      const cs = []; let k = u.from;
      for (const c of Array.from(t)) { const src = String.fromCodePoint(text.codePointAt(k)); cs.push({ t: c, from: k, to: k + src.length, w: api.measure(c, r, 1) }); k += src.length; }
      u.chars = cs;
      u.adv = cs.reduce((s, c) => s + c.w, 0);
      u.first = t[0];
    } else { u.adv = size * (r.vScale || 1); u.first = t[0]; }
  }
  return units;
}

function splitRot(u, m) {
  const a = { ...u, chars: u.chars.slice(0, m) }, b = { ...u, chars: u.chars.slice(m) };
  for (const x of [a, b]) {
    x.from = x.chars[0].from; x.to = x.chars[x.chars.length - 1].to;
    x.t = x.chars.map(c => c.t).join(''); x.text = x.t; x.first = x.t[0];
    x.adv = x.chars.reduce((s, c) => s + c.w, 0);
  }
  return [a, b];
}






function cellPieces(u, cx, y, api) {
  const r = u.run, m = api.metrics(r, 1), size = u.size, half = size / 2;
  const fr = (o, len, upright) => ({ o, d: [0, 1], n: [1, 0], len, h0: half, h1: half, upright: !!upright });
  if (u.kind === 'rot') {
    const bxl = cx - (m.ascent - m.descent) / 2;
    let off = 0;
    return u.chars.map(c => {
      const p = { text: c.t, run: r, x: cx - half, w: c.w, scale: 1, rise: 0, from: c.from, to: c.to, body: !/\s/.test(c.t),
        at: [bxl, y + off], rot: Math.PI / 2, fr: fr([cx, y + off], c.w), off, bxl: bxl - cx };
      off += c.w; return p;
    });
  }
  if (u.kind === 'tcy') {
    const width = api.measure(u.t, r, 1), sx = width > size ? size / width : 1;
    const gx = cx - width * sx / 2, gy = y + m.ascent;
    return [{ text: u.t, run: r, x: gx, w: width * sx, sx, scale: 1, rise: 0, from: u.from, to: u.to, body: true, gx, gy, fr: fr([cx, y], u.adv, true), off: 0 }];
  }
  const width = api.measure(u.t, r, 1);
  let gx = cx - width / 2, gy = y + m.ascent;
  if (u.kind === 'corner') { gx += size * 0.5; gy -= size * 0.55; }        
  return [{ text: u.t, run: r, x: gx, w: width, scale: 1, rise: r.baselineShift || 0, from: u.from, to: u.to, body: !/\s/.test(u.t), gx, gy, fr: fr([cx, y], u.adv, true), off: 0 }];
}




function pathFrame(tp) {
  let segs = subSegments(tp.sub);
  if (!segs.length) return null;
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
  const posAt = s => { let ss = s; if (closed && total > 0) ss = ((s % total) + total) % total; return A.at(A.tOfS(ss)); };
  return { s0, s1, total, closed, posAt };
}





export function layoutPathTextV(model, api, tp) {
  const F = pathFrame(tp);
  if (!F) return { lines: [], bounds: null, overflow: false, pathText: true, vertical: true };
  const flat = { ...model, text: String(model.text || '').replace(/\n/g, ' ') };   
  const units = verticalUnits(flat, api).filter(u => !u.br);
  const para = (model.paragraphs && model.paragraphs[0]) || {};
  const J = para.justification != null ? para.justification : 0;
  let W = 0; units.forEach((u, k) => { W += u.adv + (k < units.length - 1 ? u.trk : 0); });
  const span = Math.max(0, F.s1 - F.s0);
  let start = F.s0, gap = 0;
  if (J === 2 || J === 5) start = F.s0 + (span - W) / 2;
  else if (J === 1 || J === 4) start = F.s1 - W;
  else if ((J === 3 || J === 6) && units.length > 1 && W < span) gap = (span - W) / (units.length - 1);
  const pieces = [];
  let overflow = false, L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, maxSize = 0;
  const inRange = mid => !(mid < F.s0 - 0.01 || mid > F.s1 + 0.01 || (!F.closed && (mid < 0 || mid > F.total)));
  const frame = s => { const p = F.posAt(s), c = Math.cos(p.ang), n = Math.sin(p.ang); return { P: [p.x, p.y], T: [c, n], N: [n, -c], ang: p.ang }; };
  let acc = start;
  for (const u of units) {
    const size = u.size, half = size / 2;
    maxSize = Math.max(maxSize, size);
    const mid = acc + u.adv / 2;
    if (!inRange(mid)) { overflow = overflow || mid > F.s1; acc += u.adv + u.trk + gap; continue; }
    const local = cellPieces(u, 0, 0, api);
    if (u.kind === 'rot') {
      
      for (const p of local) {
        const s = acc + p.off + p.w / 2;
        if (!inRange(s)) { overflow = overflow || s > F.s1; continue; }
        const f = frame(s);
        const o = [f.P[0] - f.T[0] * p.w / 2, f.P[1] - f.T[1] * p.w / 2];
        pieces.push({ ...p, at: [o[0] + f.N[0] * p.bxl, o[1] + f.N[1] * p.bxl], rot: f.ang, x: 0,
          fr: { o, d: f.T, n: f.N, len: p.w, h0: half, h1: half } });
        L = Math.min(L, f.P[0] - size); R = Math.max(R, f.P[0] + size); T = Math.min(T, f.P[1] - size); B = Math.max(B, f.P[1] + size);
      }
    } else {
      
      const f = frame(mid), c = u.adv / 2;
      const map = (lx, ly) => [f.P[0] + lx * f.N[0] + (ly - c) * f.T[0], f.P[1] + lx * f.N[1] + (ly - c) * f.T[1]];
      for (const p of local) {
        pieces.push({ ...p, at: map(p.gx, p.gy), rot: f.ang - Math.PI / 2, x: 0,
          fr: { o: map(0, 0), d: f.T, n: f.N, len: u.adv, h0: half, h1: half, upright: true } });
      }
      L = Math.min(L, f.P[0] - size); R = Math.max(R, f.P[0] + size); T = Math.min(T, f.P[1] - size); B = Math.max(B, f.P[1] + size);
    }
    acc += u.adv + u.trk + gap;
  }
  const run0 = (model.runs && model.runs[0]) || { fontSize: 12 };
  const sz0 = run0.fontSize || 12;
  const f0 = frame(Math.max(F.s0, Math.min(F.s1, start)));
  const origin = { o: f0.P, d: f0.T, n: f0.N, len: 0, h0: sz0 / 2, h1: sz0 / 2 };
  const m0 = api.metrics(run0, 1);
  const lines = pieces.length ? [{ y: 0, x: 0, w: W, lead: sz0 * 1.2, ascent: m0.ascent, descent: m0.descent, para: 0, pieces, from: pieces[0].from }] : [];
  return { lines, overflow, pathText: true, vertical: true, origin,
    bounds: pieces.length ? { left: L, top: T, right: R, bottom: B } : null,
    path: { total: F.total, s0: F.s0, s1: F.s1, flip: !!tp.flip } };
}







export function layoutAreaTextV(model, api, tp) {
  const segs = subSegments({ ...tp.sub, closed: true });
  const poly = flattenSegs(segs, 0.35), polyT = poly.map(p => [p[1], p[0]]);   
  const bb = segsBounds(segs);
  const empty = { lines: [], bounds: null, overflow: false, areaText: true, vertical: true };
  if (!bb) return empty;
  let units = verticalUnits(model, api);
  const run0 = (model.runs && model.runs[0]) || { fontSize: 12 };
  const lines = [];
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, overflow = false;
  let prevCx = null, prevLead = 0, ui = 0, firstInPara = true;
  const spanAt = (cx, size) => {
    const sp = bandSpans(polyT, cx - size / 2, cx + size / 2);
    let best = null; for (const s of sp) if (!best || s[1] - s[0] > best[1] - best[0]) best = s;
    return best;
  };
  let origin = null;
  while (ui <= units.length) {
    const nu = units[ui] && !units[ui].br ? units[ui] : null;
    const head = units[ui] || { size: run0.fontSize || 12, lead: (run0.fontSize || 12) * 1.2, para: (model.paragraphs && model.paragraphs[0]) || {} };
    const size = head.size, lead = head.lead, para = head.para || {};
    const indL = para.startIndent || 0, indR = para.endIndent || 0, indF = firstInPara ? (para.firstLineIndent || 0) : 0;
    
    let cx = prevCx == null ? bb.right - size / 2 : prevCx - (prevLead + lead) / 2;
    if (prevCx != null && firstInPara && lines.length) cx -= (para.spaceBefore || 0);
    let span = null;
    for (let guard = 0; guard < 400; guard++) {
      if (cx - size / 2 < bb.left - 0.5) break;
      span = spanAt(cx, size);
      const need = nu ? Math.min(nu.adv, 4 * size) : 0;
      if (span && span[1] - span[0] - indL - indR - indF >= Math.max(1, need)) break;
      span = null; cx -= Math.max(1, lead / 4);
    }
    if (!span) { overflow = ui < units.length; break; }
    const y0 = span[0] + indL + indF, avail = span[1] - indR - y0;
    if (!origin) origin = { o: [cx, y0], d: [0, 1], n: [1, 0], len: 0, h0: size / 2, h1: size / 2 };
    
    const col = []; let len = 0, brk = false, colLead = 0;
    while (ui < units.length) {
      let u = units[ui];
      if (u.br) { ui++; brk = true; break; }
      if (col.length && len + u.adv > avail + 0.5) {
        if (NO_START.has(u.first) && col.length > 0) { col.push(u); len += u.adv + u.trk; ui++; }   
        else if (u.kind === 'rot' && u.chars.length > 1 && u.adv > avail) {                      
          let m = 0, w = 0; while (m < u.chars.length && len + w + u.chars[m].w <= avail + 0.5) { w += u.chars[m].w; m++; }
          if (m > 0) { const [a, b] = splitRot(u, m); units = units.slice(0, ui).concat([a, b], units.slice(ui + 1)); col.push(a); len += a.adv; ui++; }
        }
        break;
      }
      if (!col.length && u.adv > avail + 0.5 && u.kind === 'rot' && u.chars.length > 1) {
        let m = 0, w = 0; while (m < u.chars.length && w + u.chars[m].w <= avail + 0.5) { w += u.chars[m].w; m++; }
        m = Math.max(1, m);
        if (m < u.chars.length) { const [a, b] = splitRot(u, m); units = units.slice(0, ui).concat([a, b], units.slice(ui + 1)); u = a; }
      }
      col.push(u); len += u.adv + u.trk; colLead = Math.max(colLead, u.lead); ui++;
    }
    if (!col.length && !brk && ui >= units.length) {             
      break;
    }
    colLead = Math.max(colLead, lead);
    const colLen = Math.max(0, len - (col.length ? col[col.length - 1].trk : 0));
    const J = para.justification != null ? para.justification : 0;
    const lastOfPara = brk || ui >= units.length;
    let y = y0, gap = 0;
    if (J >= 3 && (J === 6 || !lastOfPara) && col.length > 1) gap = Math.max(0, (avail - colLen) / (col.length - 1));
    else if (J === 2 || J === 5) y = y0 + (avail - colLen) / 2;
    else if (J === 1 || J === 4) y = y0 + avail - colLen;
    for (const u of col) {
      const m = api.metrics(u.run, 1);
      const pcs = cellPieces(u, cx, y, api);
      for (const p of pcs) { delete p.gx; delete p.gy; delete p.off; delete p.bxl; }
      lines.push({ x: pcs[0].x, y: y + m.ascent, w: u.size, lead: colLead, ascent: m.ascent, descent: m.descent, from: u.from, pieces: pcs, col: lines.length });
      L = Math.min(L, cx - u.size / 2); R = Math.max(R, cx + u.size / 2); T = Math.min(T, y); B = Math.max(B, y + u.adv);
      y += u.adv + u.trk + gap;
    }
    prevCx = cx; prevLead = colLead; firstInPara = brk;
    if (ui >= units.length && !brk) break;
    if (ui >= units.length && brk) {  }
  }
  return { lines, overflow, areaText: true, vertical: true, origin, bounds: lines.length ? { left: L, top: T, right: R, bottom: B } : null };
}
