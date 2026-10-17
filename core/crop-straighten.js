














function median(a) { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; }


export function borderColor(rgba, w, h) {
  const R = [], G = [], B = [];
  const push = (x, y) => { const o = (y * w + x) * 4; R.push(rgba[o]); G.push(rgba[o + 1]); B.push(rgba[o + 2]); };
  for (let t = 0; t < 2 && t < h; t++) for (let x = 0; x < w; x++) { push(x, t); push(x, h - 1 - t); }
  for (let t = 0; t < 2 && t < w; t++) for (let y = 0; y < h; y++) { push(t, y); push(w - 1 - t, y); }
  return [median(R), median(G), median(B)];
}

function downscale(rgba, w, h, k) {
  const W = Math.max(1, Math.floor(w / k)), H = Math.max(1, Math.floor(h / k));
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    const y0 = Math.floor(y * k), y1 = Math.min(h, Math.floor((y + 1) * k)), x0 = Math.floor(x * k), x1 = Math.min(w, Math.floor((x + 1) * k));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * w + xx) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; n++; }
    const o = (y * W + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
  }
  return { img: out, W, H };
}
function morph(m, W, H, r, dilate) {
  
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = dilate ? 0 : 1;
    for (let d = -r; d <= r; d++) { const xx = x + d; const s = xx < 0 || xx >= W ? (dilate ? 0 : 0) : m[y * W + xx]; if (dilate ? s : !s) { v = dilate ? 1 : 0; break; } }
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = dilate ? 0 : 1;
    for (let d = -r; d <= r; d++) { const yy = y + d; const s = yy < 0 || yy >= H ? 0 : tmp[yy * W + x]; if (dilate ? s : !s) { v = dilate ? 1 : 0; break; } }
    out[y * W + x] = v;
  }
  return out;
}
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

export function minAreaRect(hp) {
  let best = null;
  const n = hp.length;
  if (n < 3) return null;
  for (let i = 0; i < n; i++) {
    const a = hp[i], b = hp[(i + 1) % n];
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(th), s = Math.sin(th);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hp) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      best = { area, cx: uc * c - vc * s, cy: uc * s + vc * c, w: u1 - u0, h: v1 - v0, angle: th };
    }
  }
  
  let { angle, w, h } = best;
  while (angle > Math.PI / 4) { angle -= Math.PI / 2; [w, h] = [h, w]; }
  while (angle <= -Math.PI / 4) { angle += Math.PI / 2; [w, h] = [h, w]; }
  return { cx: best.cx, cy: best.cy, w, h, angle };
}





export function detectPhotos(rgba, w, h, opts = {}) {
  const thr = opts.threshold ?? 28, k = Math.max(1, Math.max(w, h) / (opts.maxSide || 800));
  const bg = opts.background || borderColor(rgba, w, h);
  const { img, W, H } = downscale(rgba, w, h, k);
  let m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = Math.max(Math.abs(img[i * 3] - bg[0]), Math.abs(img[i * 3 + 1] - bg[1]), Math.abs(img[i * 3 + 2] - bg[2]));
    m[i] = d > thr ? 1 : 0;
  }
  const r = Math.max(1, Math.round(Math.min(W, H) / 150));
  m = morph(morph(m, W, H, r, true), W, H, r, false);          
  m = morph(morph(m, W, H, 1, false), W, H, 1, true);          
  const lab = new Int32Array(W * H); let nl = 0;
  const found = [];
  const minArea = (opts.minAreaFrac ?? 0.01) * W * H;
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || lab[s]) continue;
    nl++; lab[s] = nl; stack.length = 0; stack.push(s);
    const rowMin = new Map(), rowMax = new Map(); let area = 0;
    while (stack.length) {
      const q = stack.pop(); area++;
      const x = q % W, y = (q - x) / W;
      if (!rowMin.has(y) || x < rowMin.get(y)) rowMin.set(y, x);
      if (!rowMax.has(y) || x > rowMax.get(y)) rowMax.set(y, x);
      if (x > 0 && m[q - 1] && !lab[q - 1]) { lab[q - 1] = nl; stack.push(q - 1); }
      if (x < W - 1 && m[q + 1] && !lab[q + 1]) { lab[q + 1] = nl; stack.push(q + 1); }
      if (y > 0 && m[q - W] && !lab[q - W]) { lab[q - W] = nl; stack.push(q - W); }
      if (y < H - 1 && m[q + W] && !lab[q + W]) { lab[q + W] = nl; stack.push(q + W); }
    }
    if (area < minArea) continue;
    const pts = [];
    for (const [y, x0] of rowMin) { const x1 = rowMax.get(y); pts.push([x0, y], [x0, y + 1], [x1 + 1, y], [x1 + 1, y + 1]); }
    const rc = minAreaRect(hull(pts));
    if (!rc || rc.w < 4 || rc.h < 4) continue;
    
    found.push({ cx: rc.cx * k, cy: rc.cy * k, w: Math.max(1, (rc.w - 2) * k), h: Math.max(1, (rc.h - 2) * k), angle: rc.angle });
  }
  const rowH = h / 8;
  found.sort((a, b) => Math.floor(a.cy / rowH) - Math.floor(b.cy / rowH) || a.cx - b.cx);
  return found;
}


export function extractRect(rgba, w, h, rc) {
  const W = Math.max(1, Math.round(rc.w)), H = Math.max(1, Math.round(rc.h));
  const out = new Uint8ClampedArray(W * H * 4);
  const c = Math.cos(rc.angle), s = Math.sin(rc.angle);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const du = u + 0.5 - W / 2, dv = v + 0.5 - H / 2;
    const x = rc.cx + du * c - dv * s - 0.5, y = rc.cy + du * s + dv * c - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const o = (v * W + u) * 4;
    for (let ch = 0; ch < 4; ch++) {
      const px = (xx, yy) => { xx = Math.max(0, Math.min(w - 1, xx)); yy = Math.max(0, Math.min(h - 1, yy)); return rgba[(yy * w + xx) * 4 + ch]; };
      out[o + ch] = (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy) + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy;
    }
  }
  return { rgba: out, w: W, h: H };
}
