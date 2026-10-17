



















import { gaussPremul } from './filters.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function toPremul(rgba) {
  const f = new Float32Array(rgba.length);
  for (let o = 0; o < rgba.length; o += 4) { const a = rgba[o + 3] / 255; f[o] = rgba[o] * a; f[o + 1] = rgba[o + 1] * a; f[o + 2] = rgba[o + 2] * a; f[o + 3] = rgba[o + 3]; }
  return f;
}
function fromPremul(f, out) {
  for (let o = 0; o < f.length; o += 4) {
    const a = f[o + 3]; out[o + 3] = clamp(Math.round(a), 0, 255);
    if (a <= 0.001) { out[o] = out[o + 1] = out[o + 2] = 0; continue; }
    const inv = 255 / a; out[o] = clamp(Math.round(f[o] * inv), 0, 255); out[o + 1] = clamp(Math.round(f[o + 1] * inv), 0, 255); out[o + 2] = clamp(Math.round(f[o + 2] * inv), 0, 255);
  }
  return out;
}
function sampleP(P, w, h, x, y, s) {
  x -= 0.5; y -= 0.5;
  x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
  for (let k = 0; k < 4; k++) s[k] = (P[a + k] * (1 - fx) + P[b + k] * fx) * (1 - fy) + (P[c + k] * (1 - fx) + P[d + k] * fx) * fy;
}


export function radiusMap(state, w, h, k = 1) {
  const R = new Float32Array(w * h);
  const field = state.field && state.field.enabled !== false ? state.field.pins || [] : [];
  const iris = state.iris && state.iris.enabled !== false ? state.iris.pins || [] : [];
  const tilt = state.tilt && state.tilt.enabled !== false ? state.tilt.pins || [] : [];
  if (!field.length && !iris.length && !tilt.length) return null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = (x + 0.5) / k, py = (y + 0.5) / k; let r = 0;
    if (field.length) {
      if (field.length === 1) r = field[0].blur;
      else { let sw = 0, sb = 0; for (const p of field) { const d2 = (px - p.x) ** 2 + (py - p.y) ** 2 + 1; const wt = 1 / d2; sw += wt; sb += wt * p.blur; } r = sb / sw; }
    }
    for (const p of iris) {
      const co = Math.cos(-(p.rot || 0)), si = Math.sin(-(p.rot || 0)), dx = px - p.x, dy = py - p.y;
      const u = (dx * co - dy * si) / Math.max(1, p.rx), v = (dx * si + dy * co) / Math.max(1, p.ry);
      
      const n = 2 + (1 - (p.roundness == null ? 1 : p.roundness)) * 10;
      const d = Math.pow(Math.pow(Math.abs(u), n) + Math.pow(Math.abs(v), n), 1 / n);
      const f = clamp(p.feather == null ? 0.5 : p.feather, 0, 0.999);
      r = Math.max(r, p.blur * smooth((d - f) / (1 - f)));
    }
    for (const p of tilt) {
      const a = (p.angle || 0) * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a);
      const s = (px - p.x) * nx + (py - p.y) * ny, ad = Math.abs(s);
      const t = smooth((ad - p.focus) / Math.max(1, p.trans));
      r = Math.max(r, p.blur * t);
    }
    R[y * w + x] = r * k;
  }
  return R;
}
const LEVELS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
function variableBlur(P, w, h, R, bokeh) {
  let maxR = 0; for (let i = 0; i < R.length; i++) if (R[i] > maxR) maxR = R[i];
  const levels = [P]; const radii = [0];
  let src = P;
  if (bokeh) src = bokeh(P);
  for (let i = 1; i < LEVELS.length && LEVELS[i - 1] < maxR; i++) { levels.push(gaussPremul(src, w, h, LEVELS[i] * 0.5)); radii.push(LEVELS[i]); }
  const out = new Float32Array(P.length);
  for (let i = 0; i < w * h; i++) {
    const r = R[i], o = i * 4;
    let j = 0; while (j < radii.length - 1 && radii[j + 1] < r) j++;
    const A = levels[j], B = levels[Math.min(j + 1, levels.length - 1)];
    const t = j + 1 < radii.length ? clamp((r - radii[j]) / (radii[j + 1] - radii[j]), 0, 1) : 0;
    for (let c = 0; c < 4; c++) out[o + c] = A[o + c] + (B[o + c] - A[o + c]) * t;
  }
  return out;
}


function spinPass(P, w, h, pins, k) {
  const out = Float32Array.from(P), s = [0, 0, 0, 0];
  for (const p of pins) {
    const cx = p.x * k, cy = p.y * k, rx = Math.max(1, p.rx * k), ry = Math.max(1, p.ry * k), rot = p.rot || 0, ang = (p.angle || 15) * Math.PI / 180;
    const co = Math.cos(rot), si = Math.sin(rot), R = Math.max(rx, ry);
    const src = Float32Array.from(out);
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h, Math.ceil(cy + R));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = (dx * co + dy * si) / rx, v = (-dx * si + dy * co) / ry, d = Math.hypot(u, v);
      if (d >= 1) continue;
      const m = 1 - smooth((d - 0.85) / 0.15), span = ang * m, arc = span * d * Math.max(rx, ry);
      const n = Math.max(1, Math.min(128, Math.ceil(arc / 1.2)));
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let q = 0; q < n; q++) {
        const t = n === 1 ? 0 : (q / (n - 1) - 0.5) * span, c2 = Math.cos(t), s2 = Math.sin(t);
        const uu = u * c2 - v * s2, vv = u * s2 + v * c2;         
        const X = cx + (uu * rx) * co - (vv * ry) * si, Y = cy + (uu * rx) * si + (vv * ry) * co;
        sampleP(src, w, h, X, Y, s); a0 += s[0]; a1 += s[1]; a2 += s[2]; a3 += s[3];
      }
      const o = (y * w + x) * 4; out[o] = a0 / n; out[o + 1] = a1 / n; out[o + 2] = a2 / n; out[o + 3] = a3 / n;
    }
  }
  return out;
}



export function densePath(pts, per = 16) {
  if (!pts || pts.length < 2) return [];
  const P = pts, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1].slice());
  let L = 0; const acc = [0];
  for (let i = 1; i < out.length; i++) { L += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]); acc.push(L); }
  return out.map((p, i) => ({ x: p[0], y: p[1], t: L ? acc[i] / L : 0 }));
}

export function motionField(pathState, w, h, k = 1, step = 4) {
  const gw = Math.ceil(w / step) + 1, gh = Math.ceil(h / step) + 1, VX = new Float32Array(gw * gh), VY = new Float32Array(gw * gh);
  const paths = (pathState.paths || []).map(p => ({ ...p, dense: densePath(p.pts.map(q => [q[0] * k, q[1] * k])) })).filter(p => p.dense.length > 1);
  if (!paths.length) return null;
  const sp = (pathState.speed == null ? 50 : pathState.speed) / 50;
  const eps2 = (20 * k) ** 2;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = i * step, y = j * step; let sx = 0, sy = 0, sw = 0;
    for (const p of paths) {
      const D = p.dense; let best = 1e30, bi = 0;
      for (let q = 0; q < D.length - 1; q++) {
        const a = D[q], b = D[q + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
        const t = L ? clamp(((x - a.x) * dx + (y - a.y) * dy) / L, 0, 1) : 0;
        const d = (x - a.x - dx * t) ** 2 + (y - a.y - dy * t) ** 2;
        if (d < best) { best = d; bi = q + t; }
      }
      const q = Math.min(D.length - 2, Math.floor(bi)), a = D[q], b = D[q + 1];
      const tl = a.t + (b.t - a.t) * (bi - q);
      let vx, vy;
      const s0 = (p.speed0 == null ? 30 : p.speed0) * k, s1 = (p.speed1 == null ? 30 : p.speed1) * k;
      if (pathState.editShape && (p.shape0 || p.shape1)) {
        const tx = b.x - a.x, ty = b.y - a.y, tn = Math.hypot(tx, ty) || 1;
        const v0 = p.shape0 ? [p.shape0[0] * k, p.shape0[1] * k] : [tx / tn * s0, ty / tn * s0];
        const v1 = p.shape1 ? [p.shape1[0] * k, p.shape1[1] * k] : [tx / tn * s1, ty / tn * s1];
        vx = v0[0] + (v1[0] - v0[0]) * tl; vy = v0[1] + (v1[1] - v0[1]) * tl;
      } else {
        const tx = b.x - a.x, ty = b.y - a.y, tn = Math.hypot(tx, ty) || 1, m = s0 + (s1 - s0) * tl;
        vx = tx / tn * m; vy = ty / tn * m;
      }
      const wt = 1 / (best + eps2); sx += vx * wt; sy += vy * wt; sw += wt;
    }
    VX[j * gw + i] = sx / sw * sp; VY[j * gw + i] = sy / sw * sp;
  }
  return { VX, VY, gw, gh, step };
}
function fieldAt(F, x, y, out) {
  const fx = clamp(x / F.step, 0, F.gw - 1.001), fy = clamp(y / F.step, 0, F.gh - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, q = j * F.gw + i;
  out[0] = (F.VX[q] * (1 - u) + F.VX[q + 1] * u) * (1 - v) + (F.VX[q + F.gw] * (1 - u) + F.VX[q + F.gw + 1] * u) * v;
  out[1] = (F.VY[q] * (1 - u) + F.VY[q + 1] * u) * (1 - v) + (F.VY[q + F.gw] * (1 - u) + F.VY[q + F.gw + 1] * u) * v;
}
function pathPass(P, w, h, ps, k) {
  const F = motionField(ps, w, h, k, Math.max(2, Math.round(4 * Math.max(k, 0.5))));
  if (!F) return P;
  const out = new Float32Array(P.length), s = [0, 0, 0, 0], v = [0, 0];
  const taper = clamp((ps.taper || 0) / 100, 0, 1), centered = ps.centered !== false;
  const rear = ps.mode === 'rear', strobeK = clamp((ps.strobeStrength || 0) / 100, 0, 1), flashes = Math.max(1, Math.round(ps.strobeCount || 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fieldAt(F, x + 0.5, y + 0.5, v);
    const L = Math.hypot(v[0], v[1]), o = (y * w + x) * 4;
    if (L < 0.5) { out[o] = P[o]; out[o + 1] = P[o + 1]; out[o + 2] = P[o + 2]; out[o + 3] = P[o + 3]; continue; }
    const n = Math.max(2, Math.min(40, Math.ceil(L / 1.5)));   
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0, sw = 0;
    
    const stepLen = L / n, ix = v[0] / L, iy = v[1] / L;
    const walk = (dir, count, s0) => {
      let px = x + 0.5, py = y + 0.5, ux = ix, uy = iy;
      for (let q = 0; q <= count; q++) {
        const pos = s0 + q / n;            
        let wt = 1 - taper * pos;          
        if (wt <= 0) break;
        if (strobeK > 0 || rear) {
          
          let spike = 0;
          if (strobeK > 0) for (let f = 0; f < flashes; f++) { const at = flashes === 1 ? 0 : f / (flashes - 1); if (Math.abs(pos - at) < 0.5 / n + 1e-6) spike = 1; }
          wt = wt * (1 - strobeK) + spike * strobeK * n / flashes;
          if (rear && q === 0 && s0 === 0) wt += n * 0.35;
        }
        if (q > 0 || s0 === 0) {
          sampleP(P, w, h, px, py, s); a0 += s[0] * wt; a1 += s[1] * wt; a2 += s[2] * wt; a3 += s[3] * wt; sw += wt;
        }
        if ((q & 3) === 0) { fieldAt(F, px, py, v); const l = Math.hypot(v[0], v[1]) || 1; ux = v[0] / l; uy = v[1] / l; }   
        px += dir * ux * stepLen; py += dir * uy * stepLen;
      }
    };
    if (centered) { walk(-1, Math.ceil(n / 2), 0); walk(1, Math.ceil(n / 2), 1 / n); }
    else walk(-1, n, 0);
    if (sw > 0) { out[o] = a0 / sw; out[o + 1] = a1 / sw; out[o + 2] = a2 / sw; out[o + 3] = a3 / sw; }
    else { out[o] = P[o]; out[o + 1] = P[o + 1]; out[o + 2] = P[o + 2]; out[o + 3] = P[o + 3]; }
  }
  return out;
}


function bokehBoost(eff) {
  const amt = clamp((eff.bokeh || 0) / 100, 0, 1); if (!amt) return null;
  const col = clamp((eff.bokehColor || 0) / 100, 0, 1), lo = clamp(eff.rangeLo == null ? 191 : eff.rangeLo, 0, 255), hi = clamp(eff.rangeHi == null ? 255 : eff.rangeHi, lo + 1, 255);
  return P => {
    const out = new Float32Array(P.length);
    for (let o = 0; o < P.length; o += 4) {
      const a = P[o + 3] / 255 || 1e-6, r = P[o] / a, g = P[o + 1] / a, b = P[o + 2] / a, L = 0.299 * r + 0.587 * g + 0.114 * b;
      const t = smooth((L - lo) / (hi - lo)), k = 1 + t * amt * 6;
      let R = r * k, G = g * k, B = b * k;
      if (col && t > 0) { const m = (R + G + B) / 3; R = m + (R - m) * (1 + col * 2 * t); G = m + (G - m) * (1 + col * 2 * t); B = m + (B - m) * (1 + col * 2 * t); }
      out[o] = R * a; out[o + 1] = G * a; out[o + 2] = B * a; out[o + 3] = P[o + 3];
    }
    return out;
  };
}
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }





export function renderGallery(rgba, w, h, state, k = 1) {
  let P = toPremul(rgba), changed = false;
  const eff = state.effects || {}, boost = bokehBoost(eff);
  const R = radiusMap(state, w, h, k);
  if (R) { P = variableBlur(P, w, h, R, boost); changed = true; }
  if (state.path && state.path.enabled !== false && state.path.paths && state.path.paths.length) { P = pathPass(boost && !R ? boost(P) : P, w, h, state.path, k); changed = true; }
  if (state.spin && state.spin.enabled !== false && state.spin.pins && state.spin.pins.length) { P = spinPass(boost && !R && !changed ? boost(P) : P, w, h, state.spin.pins, k); changed = true; }
  const out = fromPremul(P, new Uint8ClampedArray(rgba.length));
  const nz = state.noise || {};
  const amt = clamp((nz.amount || 0) / 100, 0, 1) * 64;
  if (amt > 0) {
    const seed = nz.seed || 7;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; if (!out[o + 3]) continue;
      const g = nz.type === 'gauss' ? (hash(x, y, seed) + hash(x, y, seed + 1) + hash(x, y, seed + 2) - 1.5) * 2 : hash(x, y, seed) * 2 - 1;
      if (nz.mono) { const d = g * amt; out[o] = clamp(out[o] + d, 0, 255); out[o + 1] = clamp(out[o + 1] + d, 0, 255); out[o + 2] = clamp(out[o + 2] + d, 0, 255); }
      else for (let c = 0; c < 3; c++) { const gc = nz.type === 'gauss' ? (hash(x, y, seed + 3 * c) + hash(x, y, seed + 3 * c + 1) + hash(x, y, seed + 3 * c + 2) - 1.5) * 2 : hash(x, y, seed + c * 11) * 2 - 1; out[o + c] = clamp(out[o + c] + gc * amt, 0, 255); }
    }
  }
  return out;
}
