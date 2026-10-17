






















const W_Z = 0.40, W_G = 0.43, W_D = 0.12, W_BASE = 0.05;
const MAX_WIN = 1_200_000;                     








export function edgeFeatures(px, w, h, x0, y0, W, H) {
  x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
  W = Math.min(w - x0, W | 0); H = Math.min(h - y0, H | 0);
  
  const B = 2, EW = W + B * 2, EH = H + B * 2, EN = EW * EH;
  const ch = [new Float32Array(EN), new Float32Array(EN), new Float32Array(EN), new Float32Array(EN)];
  for (let j = 0; j < EH; j++) {
    const sy = Math.min(h - 1, Math.max(0, y0 + j - B));
    for (let i = 0; i < EW; i++) {
      const sx = Math.min(w - 1, Math.max(0, x0 + i - B));
      const o = (sy * w + sx) * 4, a = px[o + 3], k = j * EW + i;
      const am = a / 255;
      ch[0][k] = px[o] * am; ch[1][k] = px[o + 1] * am; ch[2][k] = px[o + 2] * am; ch[3][k] = a;
    }
  }
  
  const tmp = new Float32Array(EN);
  for (const s of ch) {
    for (let j = 0; j < EH; j++) for (let i = 0; i < EW; i++) {
      const k = j * EW + i;
      tmp[k] = (i > 0 && i < EW - 1) ? (s[k - 1] + 2 * s[k] + s[k + 1]) * 0.25 : s[k];
    }
    for (let j = 0; j < EH; j++) for (let i = 0; i < EW; i++) {
      const k = j * EW + i;
      s[k] = (j > 0 && j < EH - 1) ? (tmp[k - EW] + 2 * tmp[k] + tmp[k + EW]) * 0.25 : tmp[k];
    }
  }
  const N = W * H;
  const c = new Float32Array(N), ux = new Float32Array(N), uy = new Float32Array(N);
  const K = 1 / (4 * 255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y + B) * EW + (x + B);
    let best = 0, bx = 0, by = 0;
    for (let q = 0; q < 4; q++) {
      const s = ch[q];
      const a = s[k - EW - 1], b = s[k - EW], cc = s[k - EW + 1];
      const d = s[k - 1], f = s[k + 1];
      const p = s[k + EW - 1], qq = s[k + EW], r = s[k + EW + 1];
      const gx = -a - 2 * d - p + cc + 2 * f + r;
      const gy = -a - 2 * b - cc + p + 2 * qq + r;
      const m = gx * gx + gy * gy;
      if (m > best) { best = m; bx = gx; by = gy; }
    }
    const i = y * W + x, m = Math.sqrt(best);
    c[i] = Math.min(1, m * K);
    if (m > 1e-6) { ux[i] = bx / m; uy[i] = by / m; }
  }
  
  const ridge = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = c[i];
    if (v <= 0) continue;
    const dx = Math.round(ux[i]), dy = Math.round(uy[i]);
    const ax = x + dx, ay = y + dy, bx = x - dx, by = y - dy;
    const va = (ax >= 0 && ay >= 0 && ax < W && ay < H) ? c[ay * W + ax] : 0;
    const vb = (bx >= 0 && by >= 0 && bx < W && by < H) ? c[by * W + bx] : 0;
    if (v >= va && v >= vb) ridge[i] = 1;
  }
  return { x0, y0, W, H, c, ux, uy, ridge };
}


function quantile(c, q) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < c.length; i++) { const v = c[i]; if (v > 0) { hist[Math.min(255, (v * 255) | 0)]++; n++; } }
  if (!n) return 0;
  let acc = 0; const want = n * q;
  for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= want) return (b + 1) / 255; }
  return 1;
}






export function snapToEdge(px, w, h, x, y, opts = {}) {
  const r = Math.max(1, Math.round(opts.width ?? 10));
  const thr = Math.max(0, Math.min(1, (opts.contrast ?? 10) / 100)) * 0.5;
  x = Math.max(0, Math.min(w - 1, Math.round(x))); y = Math.max(0, Math.min(h - 1, Math.round(y)));
  const F = edgeFeatures(px, w, h, x - r - 1, y - r - 1, r * 2 + 3, r * 2 + 3);
  let top = 0;
  for (let i = 0; i < F.c.length; i++) if (F.ridge[i] && F.c[i] > top) top = F.c[i];
  if (top < thr || top <= 0) return { x, y, snapped: false };
  let best = -Infinity, bx = x, by = y;
  const r2 = r * r;
  for (let j = 0; j < F.H; j++) for (let i = 0; i < F.W; i++) {
    const k = j * F.W + i;
    if (!F.ridge[k] || F.c[k] < thr) continue;
    const X = F.x0 + i, Y = F.y0 + j, d2 = (X - x) ** 2 + (Y - y) ** 2;
    if (d2 > r2) continue;
    const s = F.c[k] / top - 0.35 * Math.sqrt(d2) / r;
    if (s > best) { best = s; bx = X; by = Y; }
  }
  return best === -Infinity ? { x, y, snapped: false } : { x: bx, y: by, snapped: true };
}






export class LiveWire {
  constructor(px, w, h, seed, opts = {}) {
    this.px = px; this.w = w; this.h = h;
    this.seed = { x: Math.round(seed.x), y: Math.round(seed.y) };
    this.contrast = opts.contrast ?? 10;
    this.radius = Math.max(48, opts.radius ?? 160);
    this.win = null;
  }
  _build(radius) {
    const { w, h, seed } = this;
    let R = radius;
    while ((2 * R + 1) ** 2 > MAX_WIN && R > 48) R = Math.floor(R * 0.8);
    const F = edgeFeatures(this.px, w, h, seed.x - R, seed.y - R, 2 * R + 1, 2 * R + 1);
    const N = F.W * F.H;
    const thr = Math.max(0, Math.min(1, this.contrast / 100)) * 0.5;
    
    const ref = Math.max(thr + 0.02, quantile(F.c, 0.98) * 0.9, 0.04);
    const node = new Float32Array(N);     
    const edge = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const v = F.c[i];
      if (v < thr) { node[i] = W_Z + W_G; continue; }
      edge[i] = 1;
      const g = Math.min(1, (v - thr) / (ref - thr));
      node[i] = (F.ridge[i] ? 0 : W_Z) + W_G * (1 - g);
    }
    this.win = {
      F, N, node, edge, R,
      dist: new Float64Array(N).fill(Infinity), prev: new Int32Array(N).fill(-1), done: new Uint8Array(N),
      hk: new Float64Array(1024), hi: new Int32Array(1024), hn: 0,
    };
    const si = (seed.y - F.y0) * F.W + (seed.x - F.x0);
    this.win.si = si;
    this.win.dist[si] = 0; this._push(0, si);
  }
  _push(k, i) {
    const S = this.win;
    if (S.hn >= S.hk.length) {
      const nk = new Float64Array(S.hk.length * 2); nk.set(S.hk); S.hk = nk;
      const ni = new Int32Array(S.hi.length * 2); ni.set(S.hi); S.hi = ni;
    }
    const hk = S.hk, hi = S.hi;
    let c = S.hn++;
    while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= k) break; hk[c] = hk[p]; hi[c] = hi[p]; c = p; }
    hk[c] = k; hi[c] = i;
  }
  _pop() {
    const S = this.win, hk = S.hk, hi = S.hi;
    const top = hi[0];
    const n = --S.hn;
    if (n > 0) {
      const k = hk[n], v = hi[n];
      let c = 0;
      for (;;) {
        const l = c * 2 + 1; if (l >= n) break;
        const r = l + 1, m = (r < n && hk[r] < hk[l]) ? r : l;
        if (hk[m] >= k) break;
        hk[c] = hk[m]; hi[c] = hi[m]; c = m;
      }
      hk[c] = k; hi[c] = v;
    }
    return top;
  }
  _expandUntil(ti) {
    const S = this.win, { F, node, edge, dist, prev, done } = S, W = F.W, H = F.H, ux = F.ux, uy = F.uy;
    const K = 2 / (3 * Math.PI);
    while (!done[ti] && S.hn > 0) {
      const i = this._pop();
      if (done[i]) continue;
      done[i] = 1;
      const d = dist[i], ix = i % W, iy = (i / W) | 0;
      
      const px_ = uy[i], py_ = -ux[i], pe = edge[i];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = iy + dy; if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = ix + dx; if (nx < 0 || nx >= W) continue;
          const j = ny * W + nx;
          if (done[j]) continue;
          const len = (dx && dy) ? Math.SQRT2 : 1;
          let fD = 0;
          if (pe && edge[j]) {
            
            let lx = dx / len, ly = dy / len;
            const qx = uy[j], qy = -ux[j];
            let dp = px_ * lx + py_ * ly;
            if (dp < 0) { lx = -lx; ly = -ly; dp = -dp; }
            const dq = lx * qx + ly * qy;
            fD = K * (Math.acos(Math.min(1, dp)) + Math.acos(Math.max(-1, Math.min(1, dq))));
          } else if (pe || edge[j]) fD = 0.5;
          const nd = d + len * (W_BASE + node[j] + W_D * fD);
          if (nd < dist[j]) { dist[j] = nd; prev[j] = i; this._push(nd, j); }
        }
      }
    }
  }
  _inWin(x, y) {
    const F = this.win && this.win.F;
    return !!F && x >= F.x0 && y >= F.y0 && x < F.x0 + F.W && y < F.y0 + F.H;
  }
  
  pathTo(t) {
    const x = Math.max(0, Math.min(this.w - 1, Math.round(t.x))), y = Math.max(0, Math.min(this.h - 1, Math.round(t.y)));
    if (!this.win) this._build(this.radius);
    if (!this._inWin(x, y)) {
      const need = Math.max(Math.abs(x - this.seed.x), Math.abs(y - this.seed.y)) + 48;
      this.radius = Math.max(need, Math.round(this.radius * 1.5));
      this._build(this.radius);
      if (!this._inWin(x, y)) return null;                 
    }
    const S = this.win, F = S.F;
    const ti = (y - F.y0) * F.W + (x - F.x0);
    this._expandUntil(ti);
    if (!S.done[ti]) return null;
    const out = [];
    for (let i = ti; i >= 0; i = S.prev[i]) { out.push({ x: F.x0 + (i % F.W), y: F.y0 + ((i / F.W) | 0) }); if (i === S.si) break; }
    out.reverse();
    return out;
  }
}


export function indexAtArc(path, dist) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (acc >= dist) return i;
  }
  return path.length - 1;
}
export function arcLength(path) {
  let acc = 0;
  for (let i = 1; i < path.length; i++) acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return acc;
}
