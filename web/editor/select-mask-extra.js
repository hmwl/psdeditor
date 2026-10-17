







export function blendCoverage(valA, valB, mask, W, H) {
  const out = new Uint8Array(W * H);
  for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o++) {
    const m = mask[o], a = valA(x, y);
    out[o] = m ? Math.round(a + (valB(x, y) - a) * m / 255) : a;
  }
  return out;
}


export function stampDisk(mask, W, H, cx, cy, r, add) {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const v = Math.max(0, Math.min(1, r - d + 0.5));
    if (!v) continue;
    const o = y * W + x, t = Math.round(v * 255);
    mask[o] = add ? Math.max(mask[o], t) : Math.min(mask[o], 255 - t);
  }
  return { x0, y0, x1, y1 };
}


function boxSum(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let s = 0; const row = y * W;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < W) s += src[row + x];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = s;
      const a = x - r, b = x + r + 1;
      if (a >= 0) s -= src[row + a];
      if (b < W) s += src[row + b];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < H) s += tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s;
      const a = y - r, b = y + r + 1;
      if (a >= 0) s -= tmp[a * W + x];
      if (b < H) s += tmp[b * W + x];
    }
  }
  return out;
}






export function decontaminateColors(rgba, lw, lh, left, top, cov, amount, radius = 6) {
  if (!(amount > 0)) return 0;
  const N = lw * lh, c = new Uint8Array(N);
  for (let y = 0, o = 0; y < lh; y++) for (let x = 0; x < lw; x++, o++) c[o] = cov(x + left, y + top);
  const w = new Float32Array(N), R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  for (let o = 0; o < N; o++) {
    if (c[o] < 250 || rgba[o * 4 + 3] < 250) continue;
    w[o] = 1; R[o] = rgba[o * 4]; G[o] = rgba[o * 4 + 1]; B[o] = rgba[o * 4 + 2];
  }
  const need = o => c[o] > 0 && c[o] < 250;           
  let todo = 0; for (let o = 0; o < N; o++) if (need(o)) todo++;
  if (!todo) return 0;
  const done = new Uint8Array(N);
  let changed = 0;
  for (const r of [Math.max(2, radius | 0), Math.max(4, radius * 3 | 0), Math.max(8, radius * 9 | 0)]) {
    const sw = boxSum(w, lw, lh, r), sr = boxSum(R, lw, lh, r), sg = boxSum(G, lw, lh, r), sb = boxSum(B, lw, lh, r);
    for (let o = 0; o < N; o++) {
      if (done[o] || !need(o) || sw[o] < 0.5) continue;
      const k = amount * (1 - c[o] / 255), p = o * 4;
      rgba[p] = Math.round(rgba[p] + (sr[o] / sw[o] - rgba[p]) * k);
      rgba[p + 1] = Math.round(rgba[p + 1] + (sg[o] / sw[o] - rgba[p + 1]) * k);
      rgba[p + 2] = Math.round(rgba[p + 2] + (sb[o] / sw[o] - rgba[p + 2]) * k);
      done[o] = 1; changed++;
    }
    if (changed >= todo) break;
  }
  return changed;
}
