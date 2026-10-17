















export function pieceFrame(ln, p) {
  if (p.fr) return p.fr;
  if (p.at) { const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0); return { o: p.at, d: [c, s], n: [s, -c], len: p.w, h0: ln.descent || 0, h1: ln.ascent || 0 }; }
  return { o: [p.x, ln.y], d: [1, 0], n: [0, -1], len: p.w, h0: ln.descent || 0, h1: ln.ascent || 0 };
}

function alongOf(model, api, p, fr, k) {
  if (k <= p.from) return 0;
  if (k >= p.to) return fr.len;
  const src = Array.from(String(model.text || '').slice(p.from, k)).length;
  const tot = Array.from(String(model.text || '').slice(p.from, p.to)).length || 1;
  if (fr.upright) return fr.len * src / tot;
  const chars = Array.from(p.text || '');
  const pre = chars.length === tot ? chars.slice(0, src).join('') : String(model.text || '').slice(p.from, k);
  let w = 0; try { w = api.measure(pre, p.run, p.scale || 1); } catch { w = fr.len * src / tot; }
  const full = p.w || fr.len;
  return Math.max(0, Math.min(fr.len, full > 0 ? w * fr.len / full : w));
}
const at = (fr, a, side) => [fr.o[0] + fr.d[0] * a + fr.n[0] * side, fr.o[1] + fr.d[1] * a + fr.n[1] * side];
function* allPieces(lay) { for (const ln of lay.lines || []) for (const p of ln.pieces || []) yield [ln, p]; }


export function caretSegment(lay, model, api, k) {
  let hit = null, tail = null, head = null;
  for (const [ln, p] of allPieces(lay)) {
    if (k >= p.from && k < p.to) { hit = [ln, p]; break; }
    if (p.to === k) tail = [ln, p];
    if (p.from === k && !head) head = [ln, p];
  }
  const pick = hit || tail || head;
  let fr, a;
  if (pick) { fr = pieceFrame(pick[0], pick[1]); a = alongOf(model, api, pick[1], fr, k); }
  else if (lay.origin) { fr = lay.origin; a = 0; }
  else return null;
  return { a: at(fr, a, -fr.h0), b: at(fr, a, fr.h1), fr };
}


export function selectionQuads(lay, model, api, a, b) {
  const out = [];
  if (!(b > a)) return out;
  for (const [ln, p] of allPieces(lay)) {
    const s0 = Math.max(a, p.from), s1 = Math.min(b, p.to); if (s1 <= s0) continue;
    const fr = pieceFrame(ln, p);
    const u0 = alongOf(model, api, p, fr, s0), u1 = alongOf(model, api, p, fr, s1);
    out.push([at(fr, u0, -fr.h0), at(fr, u1, -fr.h0), at(fr, u1, fr.h1), at(fr, u0, fr.h1)]);
  }
  return out;
}






export function indexAtPoint(lay, model, api, x, y) {
  const wCross = lay.pathText ? 1 : 50;
  let best = null, bd = Infinity;
  for (const [ln, p] of allPieces(lay)) {
    const fr = pieceFrame(ln, p);
    const rx = x - fr.o[0], ry = y - fr.o[1];
    const al = rx * fr.d[0] + ry * fr.d[1], cr = rx * fr.n[0] + ry * fr.n[1];
    const outA = Math.max(0, -al, al - fr.len), outC = Math.max(0, -fr.h0 - cr, cr - fr.h1);
    const d = lay.pathText ? Math.hypot(outA, outC) : outA + wCross * outC;
    if (d < bd - 1e-9) { bd = d; best = { p, fr, al }; }
  }
  if (!best) return 0;
  const { p, fr, al } = best;
  const text = String(model.text || '');
  
  const bounds = [p.from];
  for (let k = p.from; k < p.to;) { k += String.fromCodePoint(text.codePointAt(k)).length; bounds.push(Math.min(k, p.to)); }
  let k = p.from, kd = Infinity;
  for (const b of bounds) { const d = Math.abs(alongOf(model, api, p, fr, b) - al); if (d < kd) { kd = d; k = b; } }
  return k;
}
