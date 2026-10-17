



















export function squareToQuad(quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {          
    return [x1 - x0, x3 - x0, x0,
            y1 - y0, y3 - y0, y0,
            0, 0, 1];
  }
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (!Number.isFinite(den) || Math.abs(den) < 1e-12) return null;   
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
          y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
          g, h, 1];
}


export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [A * s, (c * h - b * i) * s, (b * f - c * e) * s,
          B * s, (a * i - c * g) * s, (c * d - a * f) * s,
          C * s, (b * g - a * h) * s, (a * e - b * d) * s];
}


export function quadMatrix(w, h, quad) {
  const m = squareToQuad(quad);
  if (!m) return null;
  return [m[0] / w, m[1] / h, m[2],
          m[3] / w, m[4] / h, m[5],
          m[6] / w, m[7] / h, m[8]];
}


export function applyMatrix(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  if (Math.abs(w) < 1e-12) return null;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}


export function quadBounds(quad, clip) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of quad) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  if (clip) { x0 = Math.max(x0, clip.x); y0 = Math.max(y0, clip.y); x1 = Math.min(x1, clip.x + clip.width); y1 = Math.min(y1, clip.y + clip.height); }
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}


export function quadIsRect(quad, tol = 0.02) {
  const [p0, p1, p2, p3] = quad;
  const e0 = [p1[0] - p0[0], p1[1] - p0[1]], e1 = [p2[0] - p1[0], p2[1] - p1[1]];
  const e2 = [p3[0] - p2[0], p3[1] - p2[1]], e3 = [p0[0] - p3[0], p0[1] - p3[1]];
  const len = v => Math.hypot(v[0], v[1]);
  const w = len(e0), h = len(e1), scale = Math.max(w, h, 1);
  if (Math.abs(w - len(e2)) > tol * scale || Math.abs(h - len(e3)) > tol * scale) return false;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  return Math.abs(dot(e0, e1)) <= tol * scale * scale;
}













export function warpQuad(src, quad, opts = {}) {
  const { clip = null, flipX = false, flipY = false, samples = 2, smooth = true } = opts;
  const sw = src.width, sh = src.height;
  if (!(sw > 0 && sh > 0)) return null;
  const fwd = quadMatrix(sw, sh, quad);
  if (!fwd) return null;
  const inv = invert3(fwd);
  if (!inv) return null;
  const box = quadBounds(quad, clip);
  if (!(box.width > 0 && box.height > 0)) return null;

  const S = Math.max(1, Math.min(4, samples | 0));
  const sub = 1 / S, off = sub / 2;
  const sd = src.data;
  const out = new Uint8ClampedArray(box.width * box.height * 4);
  const [a, b, c, d, e, f, g, h, i] = inv;

  
  const toSrc = (x, y) => {
    const w = g * x + h * y + i;
    if (Math.abs(w) < 1e-12) return null;
    let u = (a * x + b * y + c) / w, v = (d * x + e * y + f) / w;
    if (flipX) u = sw - u;
    if (flipY) v = sh - v;
    return [u, v];
  };
  
  const acc = [0, 0, 0, 0];
  const sample = (u, v) => {
    const fx = u - 0.5, fy = v - 0.5;             
    if (fx < -0.5 || fy < -0.5 || fx > sw - 0.5 || fy > sh - 0.5) return 0;
    if (!smooth) {
      const ix = Math.min(sw - 1, Math.max(0, Math.round(fx))), iy = Math.min(sh - 1, Math.max(0, Math.round(fy)));
      const o = (iy * sw + ix) * 4, al = sd[o + 3] / 255;
      acc[0] += sd[o] * al; acc[1] += sd[o + 1] * al; acc[2] += sd[o + 2] * al; acc[3] += sd[o + 3];
      return 1;
    }
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const x1 = Math.min(sw - 1, Math.max(0, x0 + 1)), y1 = Math.min(sh - 1, Math.max(0, y0 + 1));
    const cx0 = Math.min(sw - 1, Math.max(0, x0)), cy0 = Math.min(sh - 1, Math.max(0, y0));
    const o00 = (cy0 * sw + cx0) * 4, o10 = (cy0 * sw + x1) * 4, o01 = (y1 * sw + cx0) * 4, o11 = (y1 * sw + x1) * 4;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    
    const a00 = sd[o00 + 3] / 255, a10 = sd[o10 + 3] / 255, a01 = sd[o01 + 3] / 255, a11 = sd[o11 + 3] / 255;
    acc[0] += sd[o00] * a00 * w00 + sd[o10] * a10 * w10 + sd[o01] * a01 * w01 + sd[o11] * a11 * w11;
    acc[1] += sd[o00 + 1] * a00 * w00 + sd[o10 + 1] * a10 * w10 + sd[o01 + 1] * a01 * w01 + sd[o11 + 1] * a11 * w11;
    acc[2] += sd[o00 + 2] * a00 * w00 + sd[o10 + 2] * a10 * w10 + sd[o01 + 2] * a01 * w01 + sd[o11 + 2] * a11 * w11;
    acc[3] += sd[o00 + 3] * w00 + sd[o10 + 3] * w10 + sd[o01 + 3] * w01 + sd[o11 + 3] * w11;
    return 1;
  };

  
  let rowTop = new Array(box.width + 1), rowBot = new Array(box.width + 1);
  for (let px = 0; px <= box.width; px++) rowTop[px] = toSrc(box.x + px, box.y);
  const covers = p => p && p[0] >= 0 && p[1] >= 0 && p[0] <= sw && p[1] <= sh;

  for (let py = 0; py < box.height; py++) {
    const Y = box.y + py;
    for (let px = 0; px <= box.width; px++) rowBot[px] = toSrc(box.x + px, Y + 1);
    for (let px = 0; px < box.width; px++) {
      const X = box.x + px;
      const q0 = rowTop[px], q1 = rowTop[px + 1], q2 = rowBot[px], q3 = rowBot[px + 1];
      const full = covers(q0) && covers(q1) && covers(q2) && covers(q3);
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      let n;
      if (full) {
        
        
        const p = toSrc(X + 0.5, Y + 0.5);
        if (!p || !sample(p[0], p[1])) continue;
        n = 1;
      } else {
        
        
        const ps = [q0, q1, q2, q3];
        if (ps.every(p => p && p[0] < 0) || ps.every(p => p && p[0] > sw)
         || ps.every(p => p && p[1] < 0) || ps.every(p => p && p[1] > sh)) continue;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          const p = toSrc(X + sx * sub + off, Y + sy * sub + off);
          if (p) sample(p[0], p[1]);
        }
        n = S * S;
      }
      if (acc[3] <= 0) continue;
      const o = (py * box.width + px) * 4;
      const un = 255 / acc[3];                    
      out[o] = acc[0] * un; out[o + 1] = acc[1] * un; out[o + 2] = acc[2] * un; out[o + 3] = acc[3] / n;
    }
    const t = rowTop; rowTop = rowBot; rowBot = t;
  }
  return { data: out, width: box.width, height: box.height, x: box.x, y: box.y };
}




export function rectToQuad(t) {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2, a = (t.rot || 0) * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a), hw = t.w / 2, hh = t.h / 2;
  const P = (lx, ly) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
  return [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
}


export function quadToRect(quad, tol = 0.02) {
  if (!quadIsRect(quad, tol)) return null;
  const [p0, p1, p2, p3] = quad;
  
  if ((p1[0] - p0[0]) * (p3[1] - p0[1]) - (p1[1] - p0[1]) * (p3[0] - p0[0]) <= 0) return null;
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const h = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (!(w > 0 && h > 0)) return null;
  const rot = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180 / Math.PI;
  const cx = (quad[0][0] + quad[2][0]) / 2, cy = (quad[0][1] + quad[2][1]) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rot };
}


export function pointInQuad(quad, x, y) {
  const tri = (A, B, C) => {
    const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(d) < 1e-12) return false;
    const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d;
    const l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d;
    return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
  };
  return tri(quad[0], quad[1], quad[2]) || tri(quad[0], quad[2], quad[3]);
}


export function quadToSource(quad, sw, sh, x, y) {
  const fwd = quadMatrix(sw, sh, quad);
  if (!fwd) return null;
  const inv = invert3(fwd);
  if (!inv) return null;
  const p = applyMatrix(inv, x, y);
  if (!p) return null;
  if (p[0] < 0 || p[1] < 0 || p[0] >= sw || p[1] >= sh) return null;
  return p;
}




export function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}


export function composeTransform({ px = 0, py = 0, dx = 0, dy = 0, sx = 1, sy = 1, rot = 0, skewX = 0, skewY = 0 }) {
  const a = rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const kx = Math.tan(skewX * Math.PI / 180), ky = Math.tan(skewY * Math.PI / 180);
  const R = [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
  const K = [1, kx, 0, ky, 1, 0, 0, 0, 1];
  const S = [sx, 0, 0, 0, sy, 0, 0, 0, 1];
  const toO = [1, 0, -px, 0, 1, -py, 0, 0, 1];
  const back = [1, 0, px + dx, 0, 1, py + dy, 0, 0, 1];
  return mul3(back, mul3(R, mul3(K, mul3(S, toO))));
}


export function transformQuad(m, quad) {
  const out = [];
  for (const [x, y] of quad) { const p = applyMatrix(m, x, y); if (!p) return null; out.push(p); }
  return out;
}


export function isParallelogram(quad, tol = 0.01) {
  const s = Math.max(1, Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]));
  return Math.abs((quad[0][0] + quad[2][0]) - (quad[1][0] + quad[3][0])) <= tol * s
      && Math.abs((quad[0][1] + quad[2][1]) - (quad[1][1] + quad[3][1])) <= tol * s;
}


export function affineBetween(from, to) {
  const [a0, a1, a3] = [from[0], from[1], from[3]];
  const [b0, b1, b3] = [to[0], to[1], to[3]];
  const u = [a1[0] - a0[0], a1[1] - a0[1]], v = [a3[0] - a0[0], a3[1] - a0[1]];
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) < 1e-9) return null;
  const U = [b1[0] - b0[0], b1[1] - b0[1]], V = [b3[0] - b0[0], b3[1] - b0[1]];
  
  const a = (U[0] * v[1] - V[0] * u[1]) / den, b = (V[0] * u[0] - U[0] * v[0]) / den;
  const c = (U[1] * v[1] - V[1] * u[1]) / den, d = (V[1] * u[0] - U[1] * v[0]) / den;
  return [a, b, b0[0] - (a * a0[0] + b * a0[1]), c, d, b0[1] - (c * a0[0] + d * a0[1]), 0, 0, 1];
}






export function decomposeAffine(m) {
  const a = m[0], b = m[1], c = m[3], d = m[4];
  const sx = Math.hypot(a, c);
  if (sx < 1e-9) return { sx: 0, sy: 0, rot: 0, skewX: 0 };
  const rot = Math.atan2(c, a);
  const cos = Math.cos(rot), sin = Math.sin(rot);
  
  const b2 = cos * b + sin * d, d2 = -sin * b + cos * d;
  const sy = d2;
  const kx = Math.abs(sy) > 1e-9 ? b2 / sy : 0;
  return { sx, sy, rot: rot * 180 / Math.PI, skewX: Math.atan(kx) * 180 / Math.PI };
}
