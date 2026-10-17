

























export function mul3(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
export function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !isFinite(det)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}
export function apply3(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w, w];
}

export function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(a[0], a[1], a[2]);



export function focalFromH(H, cx, cy, fallback) {
  const h1 = [H[0], H[3], H[6]], h2 = [H[1], H[4], H[7]];
  const den = h1[2] * h2[2];
  if (Math.abs(den) > 1e-14) {
    const f2 = -((h1[0] - cx * h1[2]) * (h2[0] - cx * h2[2]) + (h1[1] - cy * h1[2]) * (h2[1] - cy * h2[2])) / den;
    if (f2 > 0 && isFinite(f2)) { const f = Math.sqrt(f2); if (f > fallback * 0.15 && f < fallback * 20) return f; }
  }
  return fallback;
}

function planeFrame(H, K, Ki) {
  const M = mul3(Ki, H);
  let c1 = [M[0], M[3], M[6]], c2 = [M[1], M[4], M[7]], c3 = [M[2], M[5], M[8]];
  const lam = 1 / norm(c1);
  c1 = scl(c1, lam); c2 = scl(c2, lam); c3 = scl(c3, lam);
  if (c3[2] < 0) { c1 = scl(c1, -1); c2 = scl(c2, -1); c3 = scl(c3, -1); }   
  return { o: c3, a: c1, b: c2 };
}
function frameToH(F, K) {
  return mul3(K, [F.a[0], F.b[0], F.o[0], F.a[1], F.b[1], F.o[1], F.a[2], F.b[2], F.o[2]]);
}






export function solvePlanes(planes, w, h) {
  const out = new Map();
  const cx = w / 2, cy = h / 2, fb = Math.max(w, h);
  const byId = new Map(planes.map(p => [p.id, p]));
  const visit = (p, depth = 0) => {
    if (out.has(p.id)) return out.get(p.id);
    if (depth > 32) return null;
    let H = null, f = fb;
    if (p.kind === 'child') {
      const par = byId.get(p.parent); const P = par && visit(par, depth + 1);
      if (!P || !P.H) { out.set(p.id, { H: null, valid: false }); return out.get(p.id); }
      f = P.f; const K = [f, 0, cx, 0, f, cy, 0, 0, 1], Ki = inv3(K);
      const F = planeFrame(P.H, K, Ki);
      const [u0, v0, u1, v1] = par.ext;
      const th = (p.angle == null ? 90 : p.angle) * Math.PI / 180;
      
      let origin, along, away, alen;
      const n = cross(F.a, F.b); const nn = scl(n, 1 / (norm(n) || 1));
      const la = norm(F.a), lb = norm(F.b);
      const ua = scl(F.a, 1 / la), ub = scl(F.b, 1 / lb);
      const P0 = (u, v) => add(add(F.o, scl(F.a, u)), scl(F.b, v));
      if (p.edge === 'u1') { origin = P0(u1, v0); along = scl(F.b, v1 - v0); away = add(scl(ua, Math.cos(th)), scl(nn, Math.sin(th))); alen = la; }
      else if (p.edge === 'u0') { origin = P0(u0, v0); along = scl(F.b, v1 - v0); away = add(scl(ua, -Math.cos(th)), scl(nn, Math.sin(th))); alen = la; }
      else if (p.edge === 'v1') { origin = P0(u0, v1); along = scl(F.a, u1 - u0); away = add(scl(ub, Math.cos(th)), scl(nn, Math.sin(th))); alen = lb; }
      else { origin = P0(u0, v0); along = scl(F.a, u1 - u0); away = add(scl(ub, -Math.cos(th)), scl(nn, Math.sin(th))); alen = lb; }
      const len = (p.len == null ? 0.5 : p.len) * alen;
      H = frameToH({ o: origin, a: along, b: scl(away, len) }, K);
    } else {
      H = squareToQuad(p.corners);
      if (H) f = focalFromH(H, cx, cy, fb);
    }
    const Hi = H && inv3(H);
    let quad = null, valid = !!Hi;
    if (H) {
      const [u0, v0, u1, v1] = p.ext || [0, 0, 1, 1];
      quad = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => apply3(H, u, v));
      if (quad.some(q => !(q[2] > 0) || !isFinite(q[0]) || !isFinite(q[1]))) valid = false;
      if (valid && !quadConvex(quad)) valid = false;
      quad = quad.map(q => [q[0], q[1]]);
    }
    const r = { H, Hi, quad, valid, f };
    out.set(p.id, r);
    return r;
  };
  for (const p of planes) visit(p);
  return out;
}
export function quadConvex(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) return false;
    if (!s) s = Math.sign(z); else if (Math.sign(z) !== s) return false;
  }
  return true;
}

export function toPlane(S, p, x, y) {
  if (!S || !S.Hi) return null;
  const [u, v, w] = apply3(S.Hi, x, y);
  if (!(w * 1 !== 0) || !isFinite(u) || !isFinite(v)) return null;
  const [u0, v0, u1, v1] = p.ext || [0, 0, 1, 1];
  return { u, v, inside: u >= u0 && u <= u1 && v >= v0 && v <= v1 };
}

export function planeScale(S, p) {
  const [u0, v0, u1, v1] = p.ext || [0, 0, 1, 1];
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, e = 1e-3;
  const a = apply3(S.H, uc, vc), b = apply3(S.H, uc + e, vc), c = apply3(S.H, uc, vc + e);
  return { su: Math.hypot(b[0] - a[0], b[1] - a[1]) / e, sv: Math.hypot(c[0] - a[0], c[1] - a[1]) / e };
}

export function planeAt(planes, solved, x, y) {
  for (let i = planes.length - 1; i >= 0; i--) {
    const p = planes[i], S = solved.get(p.id);
    if (!S || !S.valid) continue;
    const t = toPlane(S, p, x, y);
    if (t && t.inside) return { plane: p, S, u: t.u, v: t.v };
  }
  return null;
}

export function gridLines(p, S, grid) {
  const [u0, v0, u1, v1] = p.ext || [0, 0, 1, 1];
  const { su, sv } = planeScale(S, p);
  const du = Math.max(grid / Math.max(su, 1e-6), (u1 - u0) / 200), dv = Math.max(grid / Math.max(sv, 1e-6), (v1 - v0) / 200);
  const lines = [];
  const seg = (a, b) => { const A = apply3(S.H, a[0], a[1]), B = apply3(S.H, b[0], b[1]); lines.push([A[0], A[1], B[0], B[1]]); };
  for (let u = Math.ceil(u0 / du) * du; u <= u1 + 1e-9; u += du) seg([u, v0], [u, v1]);
  for (let v = Math.ceil(v0 / dv) * dv; v <= v1 + 1e-9; v += dv) seg([u0, v], [u1, v]);
  return lines;
}


export function sampleBilinear(src, w, h, x, y, out) {
  x -= 0.5; y -= 0.5;
  if (x < -1 || y < -1 || x > w || y > h) { out[0] = out[1] = out[2] = out[3] = 0; return false; }
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = Math.min(w - 1, Math.max(0, x0 + i)), yy = Math.min(h - 1, Math.max(0, y0 + j));
    const k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), o = (yy * w + xx) * 4, al = src[o + 3] * k;
    r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
  }
  if (a > 0) { out[0] = r / a; out[1] = g / a; out[2] = b / a; } else out[0] = out[1] = out[2] = 0;
  out[3] = a;
  return true;
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function polyBBox(pts, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0: clamp(Math.floor(x0) - 1, 0, w), y0: clamp(Math.floor(y0) - 1, 0, h), x1: clamp(Math.ceil(x1) + 1, 0, w), y1: clamp(Math.ceil(y1) + 1, 0, h) };
}
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));







export function healBlend(before, after, w, rect, cov, mode) {
  if (!mode || mode === 'off') return;
  const { x0, y0, x1, y1 } = rect, rw = x1 - x0, rh = y1 - y0;
  if (rw < 2 || rh < 2) return;
  const sigma = Math.max(2, Math.min(rw, rh) / 6);
  const plane = (img, c) => { const f = new Float32Array(rw * rh); for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) f[y * rw + x] = img[((y + y0) * w + x + x0) * 4 + c]; return f; };
  const lum = img => { const f = new Float32Array(rw * rh); for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const o = ((y + y0) * w + x + x0) * 4; f[y * rw + x] = 0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2]; } return f; };
  if (mode === 'luminance') {
    const d = blurF(lum(before), rw, rh, sigma), s = blurF(lum(after), rw, rh, sigma);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = y * rw + x, k = cov[i]; if (k <= 0) continue;
      const o = ((y + y0) * w + x + x0) * 4, dl = (d[i] - s[i]) * k;
      for (let c = 0; c < 3; c++) after[o + c] = clamp(after[o + c] + dl, 0, 255);
    }
  } else {
    for (let c = 0; c < 3; c++) {
      const d = blurF(plane(before, c), rw, rh, sigma), s = blurF(plane(after, c), rw, rh, sigma);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const i = y * rw + x, k = cov[i]; if (k <= 0) continue;
        const o = ((y + y0) * w + x + x0) * 4;
        after[o + c] = clamp(after[o + c] + (d[i] - s[i]) * k, 0, 255);
      }
    }
  }
}
function blurF(f, w, h, sigma) {
  
  const r = Math.max(1, Math.round(Math.sqrt(12 * sigma * sigma / 3 + 1) / 2));
  let a = f, b = new Float32Array(f.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) { b[row + x] = s / (2 * r + 1); s += a[row + clamp(x + r + 1, 0, w - 1)] - a[row + clamp(x - r, 0, w - 1)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += b[clamp(y + r + 1, 0, h - 1) * w + x] - b[clamp(y - r, 0, h - 1) * w + x]; } }
    if (pass === 0) { a = Float32Array.from(a); }
  }
  return a;
}








export function stampPlane(dst, src, w, h, T, uc, vc, radiusPx, hardness, opacity, srcOf, heal, baseImg) {
  const { plane, S } = T; const { su, sv } = planeScale(S, plane);
  const ru = radiusPx / Math.max(su, 1e-6), rv = radiusPx / Math.max(sv, 1e-6);
  const poly = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const q = apply3(S.H, uc + Math.cos(a) * ru, vc + Math.sin(a) * rv); if (!(q[2] > 0)) return null; poly.push([q[0], q[1]]); }
  const bb = polyBBox(poly, w, h); if (bb.x1 <= bb.x0 || bb.y1 <= bb.y0) return null;
  const [eu0, ev0, eu1, ev1] = plane.ext || [0, 0, 1, 1];
  const hard = clamp(hardness, 0, 1), s4 = [0, 0, 0, 0];
  const rw = bb.x1 - bb.x0, cov = heal && heal !== 'off' ? new Float32Array(rw * (bb.y1 - bb.y0)) : null;
  const before = cov ? (baseImg || Uint8ClampedArray.from(dst)) : null;
  for (let y = bb.y0; y < bb.y1; y++) for (let x = bb.x0; x < bb.x1; x++) {
    const [u, v, ww] = apply3(S.Hi, x + 0.5, y + 0.5); if (!(ww * 1)) continue;
    if (u < eu0 || u > eu1 || v < ev0 || v > ev1) continue;       
    const d = Math.hypot((u - uc) / ru, (v - vc) / rv); if (d >= 1) continue;
    const k = (hard >= 1 ? 1 : 1 - smooth((d - hard) / (1 - hard))) * opacity; if (k <= 0) continue;
    const sp = srcOf(u, v); if (!sp) continue;
    if (!sampleBilinear(src, w, h, sp[0], sp[1], s4) || s4[3] <= 0) continue;
    const o = (y * w + x) * 4, ta = s4[3] / 255 * k;
    const da = dst[o + 3] / 255, oa = ta + da * (1 - ta);
    if (oa <= 0) continue;
    for (let c = 0; c < 3; c++) dst[o + c] = (s4[c] * ta + dst[o + c] * da * (1 - ta)) / oa;
    dst[o + 3] = oa * 255;
    if (cov) cov[(y - bb.y0) * rw + x - bb.x0] = k;
  }
  if (cov) healBlend(before, dst, w, bb, cov, heal);
  return bb;
}

export function paintPlane(dst, w, h, T, uc, vc, radiusPx, hardness, opacity, rgb, heal) {
  const flat = { length: 0 };
  const src = new Uint8ClampedArray(4); src[0] = rgb[0]; src[1] = rgb[1]; src[2] = rgb[2]; src[3] = 255;
  
  const { plane, S } = T; const { su, sv } = planeScale(S, plane);
  const ru = radiusPx / Math.max(su, 1e-6), rv = radiusPx / Math.max(sv, 1e-6);
  const poly = []; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const q = apply3(S.H, uc + Math.cos(a) * ru, vc + Math.sin(a) * rv); if (!(q[2] > 0)) return null; poly.push([q[0], q[1]]); }
  const bb = polyBBox(poly, w, h); if (bb.x1 <= bb.x0 || bb.y1 <= bb.y0) return null;
  const [eu0, ev0, eu1, ev1] = plane.ext || [0, 0, 1, 1];
  const hard = clamp(hardness, 0, 1), rw = bb.x1 - bb.x0;
  const cov = heal && heal !== 'off' ? new Float32Array(rw * (bb.y1 - bb.y0)) : null, before = cov ? Uint8ClampedArray.from(dst) : null;
  for (let y = bb.y0; y < bb.y1; y++) for (let x = bb.x0; x < bb.x1; x++) {
    const [u, v] = apply3(S.Hi, x + 0.5, y + 0.5);
    if (u < eu0 || u > eu1 || v < ev0 || v > ev1) continue;
    const d = Math.hypot((u - uc) / ru, (v - vc) / rv); if (d >= 1) continue;
    const k = (hard >= 1 ? 1 : 1 - smooth((d - hard) / (1 - hard))) * opacity; if (k <= 0) continue;
    const o = (y * w + x) * 4, da = dst[o + 3] / 255, oa = k + da * (1 - k);
    for (let c = 0; c < 3; c++) dst[o + c] = (rgb[c] * k + dst[o + c] * da * (1 - k)) / oa;
    dst[o + 3] = oa * 255;
    if (cov) cov[(y - bb.y0) * rw + x - bb.x0] = k;
  }
  void flat; void src;
  if (cov) healBlend(before, dst, w, bb, cov, heal);
  return bb;
}










export function warpRegion(dst, srcImg, w, h, T, r, source, o = {}) {
  const { plane, S } = T;
  const rot = o.rot || 0, flipH = !!o.flipH, flipV = !!o.flipV;
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2, hu = (r.u1 - r.u0) / 2, hv = (r.v1 - r.v0) / 2;
  const co = Math.cos(rot), si = Math.sin(rot);
  const corner = (a, b) => { const x = a * hu, y = b * hv; return [cu + x * co - y * si, cv + x * si + y * co]; };
  const poly = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].map(([u, v]) => apply3(S.H, u, v));
  if (poly.some(q => !(q[2] > 0))) return null;
  const bb = polyBBox(poly.map(q => [q[0], q[1]]), w, h); if (bb.x1 <= bb.x0 || bb.y1 <= bb.y0) return null;
  const { su, sv } = planeScale(S, plane);
  const fu = (o.feather || 0) / Math.max(su, 1e-6), fv = (o.feather || 0) / Math.max(sv, 1e-6);
  const clipExt = o.clip !== false; const [eu0, ev0, eu1, ev1] = plane.ext || [0, 0, 1, 1];
  const op = o.opacity == null ? 1 : o.opacity, s4 = [0, 0, 0, 0], rw = bb.x1 - bb.x0;
  const heal = o.heal && o.heal !== 'off', cov = heal ? new Float32Array(rw * (bb.y1 - bb.y0)) : null;
  const before = heal ? Uint8ClampedArray.from(dst) : null;
  let srcMap;
  if (source.kind === 'plane') {
    const ST = source.T, sr = source.r;
    srcMap = (s, t) => { const u = sr.u0 + s * (sr.u1 - sr.u0), v = sr.v0 + t * (sr.v1 - sr.v0); const q = apply3(ST.S.H, u, v); return sampleBilinear(srcImg, w, h, q[0], q[1], s4); };
  } else {
    srcMap = (s, t) => sampleBilinear(source.rgba, source.w, source.h, s * source.w, t * source.h, s4);
  }
  for (let y = bb.y0; y < bb.y1; y++) for (let x = bb.x0; x < bb.x1; x++) {
    const [u, v] = apply3(S.Hi, x + 0.5, y + 0.5);
    if (clipExt && (u < eu0 || u > eu1 || v < ev0 || v > ev1)) continue;
    const du = u - cu, dv = v - cv;
    let a = (du * co + dv * si) / (hu || 1e-9), b = (-du * si + dv * co) / (hv || 1e-9);  
    if (a < -1 || a > 1 || b < -1 || b > 1) continue;
    let k = op;
    if (fu > 0 || fv > 0) k *= smooth((1 - Math.abs(a)) * hu / Math.max(fu, 1e-9)) * smooth((1 - Math.abs(b)) * hv / Math.max(fv, 1e-9));
    if (k <= 0) continue;
    if (flipH) a = -a; if (flipV) b = -b;
    if (!srcMap((a + 1) / 2, (b + 1) / 2) || s4[3] <= 0) continue;
    const oo = (y * w + x) * 4, ta = s4[3] / 255 * k, da = dst[oo + 3] / 255, oa = ta + da * (1 - ta);
    if (oa <= 0) continue;
    for (let c = 0; c < 3; c++) dst[oo + c] = (s4[c] * ta + dst[oo + c] * da * (1 - ta)) / oa;
    dst[oo + 3] = oa * 255;
    if (cov) cov[(y - bb.y0) * rw + x - bb.x0] = k;
  }
  if (cov) healBlend(before, dst, w, bb, cov, o.heal);
  return bb;
}

export function regionQuad(S, r, rot = 0) {
  const cu = (r.u0 + r.u1) / 2, cv = (r.v0 + r.v1) / 2, hu = (r.u1 - r.u0) / 2, hv = (r.v1 - r.v0) / 2, co = Math.cos(rot), si = Math.sin(rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const x = a * hu, y = b * hv; const q = apply3(S.H, cu + x * co - y * si, cv + x * si + y * co); return [q[0], q[1]]; });
}


export function renderGridInto(dst, w, h, planes, solved, rgb = [0, 0, 0], width = 1) {
  const plot = (x, y, k) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; const da = dst[o + 3] / 255, oa = k + da * (1 - k); for (let c = 0; c < 3; c++) dst[o + c] = (rgb[c] * k + dst[o + c] * da * (1 - k)) / (oa || 1); dst[o + 3] = oa * 255; };
  for (const p of planes) {
    const S = solved.get(p.id); if (!S || !S.valid) continue;
    const lines = gridLines(p, S, p.grid || 50);
    for (let i = 0; i < 4; i++) { const a = S.quad[i], b = S.quad[(i + 1) % 4]; lines.push([a[0], a[1], b[0], b[1]]); }
    for (const [x0, y0, x1, y1] of lines) {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
      for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
        for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) plot(x + dx - (width >> 1), y + dy - (width >> 1), 1); }
    }
  }
}











export const VP_RESOURCE_ID = 4090;
const MAGIC = [0x46, 0x50, 0x76, 0x70]; 
export function serializeVP(planes, offset = { x: 0, y: 0 }) {
  const clean = planes.map(p => {
    const q = { id: p.id, name: p.name || '', grid: p.grid || 50, kind: p.kind, ext: p.ext.map(v => +v.toFixed(6)) };
    if (p.kind === 'root') q.corners = p.corners.map(([x, y]) => [+(x + offset.x).toFixed(3), +(y + offset.y).toFixed(3)]);
    else Object.assign(q, { parent: p.parent, edge: p.edge, angle: p.angle, len: p.len });
    return q;
  });
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, planes: clean }));
  const out = new Uint8Array(8 + json.length);
  out.set(MAGIC, 0); new DataView(out.buffer).setUint32(4, json.length); out.set(json, 8);
  return out;
}
export function parseVP(bytes, offset = { x: 0, y: 0 }) {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.length < 8 || MAGIC.some((m, i) => u8[i] !== m)) return null;
    const n = new DataView(u8.buffer, u8.byteOffset).getUint32(4);
    const j = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)));
    if (!j || !Array.isArray(j.planes)) return null;
    return j.planes.map(p => (p.kind === 'root' ? { ...p, corners: p.corners.map(([x, y]) => [x - offset.x, y - offset.y]) } : { ...p }));
  } catch { return null; }
}
