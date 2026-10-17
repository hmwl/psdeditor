

















const BIG = 1e6;


export function skinMask(rgba, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0, o = 0; i < m.length; i++, o += 4) {
    if (rgba[o + 3] < 128) continue;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) m[i] = 255;
  }
  
  return dilate(dilate(erode(m, w, h), w, h), w, h);
}
function erode(m, w, h) {
  const o = new Uint8Array(m.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) o[i] = 255;
  }
  return o;
}
function dilate(m, w, h) {
  const o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (m[i] || (x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || (y < h - 1 && m[i + w])) o[i] = 255;
  }
  return o;
}



function lumOf(p) {
  const r = p & 255, g = (p >>> 8) & 255, b = (p >>> 16) & 255, a = p >>> 24;
  return (0.299 * r + 0.587 * g + 0.114 * b) * a / 255 + (255 - a) * 0.5;   
}



function findAndRemove(state, k, remove) {
  const { stride, h } = state;
  let { cw } = state;
  const { px, lum, prot, idx } = state;
  const M = new Float32Array(stride * h);
  const back = new Int8Array(stride * h);
  const seams = [];
  for (let s = 0; s < k && cw > 1; s++) {
    
    for (let x = 0; x < cw; x++) M[x] = prot ? prot[x] : 0;
    for (let y = 1; y < h; y++) {
      const r = y * stride, rp = r - stride;
      for (let x = 0; x < cw; x++) {
        const l = x > 0 ? lum[r + x - 1] : lum[r + x], rr = x < cw - 1 ? lum[r + x + 1] : lum[r + x];
        const up = lum[rp + x];
        const cU = Math.abs(rr - l);                         
        const cL = cU + Math.abs(up - l);                    
        const cR = cU + Math.abs(up - rr);
        let best = M[rp + x] + cU, b = 0;
        if (x > 0) { const v = M[rp + x - 1] + cL; if (v < best) { best = v; b = -1; } }
        if (x < cw - 1) { const v = M[rp + x + 1] + cR; if (v < best) { best = v; b = 1; } }
        M[r + x] = best + (prot ? prot[r + x] : 0);
        back[r + x] = b;
      }
    }
    
    let bx = 0, bv = Infinity; const lr = (h - 1) * stride;
    for (let x = 0; x < cw; x++) if (M[lr + x] < bv) { bv = M[lr + x]; bx = x; }
    const seam = new Int32Array(h);
    for (let y = h - 1; y >= 0; y--) { seam[y] = bx; if (y > 0) bx += back[y * stride + bx]; }
    
    const orig = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      const r = y * stride, x = seam[y];
      orig[y] = idx[r + x];
      const n = cw - x - 1;
      if (n > 0) {
        idx.copyWithin(r + x, r + x + 1, r + cw);
        lum.copyWithin(r + x, r + x + 1, r + cw);
        if (prot) prot.copyWithin(r + x, r + x + 1, r + cw);
        if (remove) px.copyWithin(r + x, r + x + 1, r + cw);
      }
    }
    cw--;
    seams.push(orig);
  }
  state.cw = cw;
  return seams;
}

function makeState(px, w, h, prot) {
  const lum = new Float32Array(w * h), idx = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) { lum[i] = lumOf(px[i]); idx[i] = i % w; }
  let P = null;
  if (prot) { P = new Float32Array(w * h); for (let i = 0; i < P.length; i++) P[i] = prot[i] * (BIG / 255); }
  return { px, lum, prot: P, idx, stride: w, h, cw: w };
}





const COARSE_MIN_PX = 350000;
function carveWidthCoarse(px, w, h, W, prot) {
  const w2 = w >> 1, h2 = (h + 1) >> 1, grow = W > w;
  const k2 = Math.floor(Math.abs(W - w) / 2);
  
  const lp = new Uint32Array(w2 * h2), lpr = prot ? new Uint8Array(w2 * h2) : null;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const y0 = 2 * y, y1 = Math.min(h - 1, y0 + 1), a = px[y0 * w + 2 * x], b = px[y0 * w + 2 * x + 1], c = px[y1 * w + 2 * x], d = px[y1 * w + 2 * x + 1];
    lp[y * w2 + x] = avgPx(avgPx(a, b), avgPx(c, d));
    if (lpr) lpr[y * w2 + x] = Math.max(prot[y0 * w + 2 * x], prot[y0 * w + 2 * x + 1], prot[y1 * w + 2 * x], prot[y1 * w + 2 * x + 1]);
  }
  let cur = px, cw = w, cp = prot;
  let lcur = lp, lw = w2, lprot = lpr;
  let left = k2;
  while (left > 0) {
    const k = grow ? Math.min(left, Math.max(1, Math.floor(lw / 2))) : left;
    const st = makeState(lcur, lw, h2, lprot);
    const seams = findAndRemove(st, k, false);
    
    const nw = cw + (grow ? 2 * k : -2 * k), lnw = lw + (grow ? k : -k);
    const out = new Uint32Array(nw * h), np = cp ? new Uint8Array(nw * h) : null;
    const lout = new Uint32Array(lnw * h2), lnp = lprot ? new Uint8Array(lnw * h2) : null;
    const mark = new Uint16Array(lw);
    for (let r = 0; r < h2; r++) {
      mark.fill(0); for (const s of seams) mark[s[r]]++;
      
      let lo = r * lnw;
      for (let x = 0; x < lw; x++) {
        const p = lcur[r * lw + x];
        if (!grow) { if (mark[x]) continue; lout[lo] = p; if (lnp) lnp[lo] = lprot[r * lw + x]; lo++; continue; }
        lout[lo] = p; if (lnp) lnp[lo] = lprot[r * lw + x]; lo++;
        for (let d = 0; d < mark[x]; d++) { lout[lo] = avgPx(p, lcur[r * lw + Math.min(lw - 1, x + 1)]); if (lnp) lnp[lo] = lprot[r * lw + x]; lo++; }
      }
      for (let yy = 2 * r; yy <= Math.min(h - 1, 2 * r + 1); yy++) {
        let o = yy * nw; const row = yy * cw;
        for (let x = 0; x < cw; x++) {
          const lx = x >> 1, m = lx < lw ? mark[lx] : 0;       
          const p = cur[row + x];
          if (!grow) { if (m) continue; out[o] = p; if (np) np[o] = cp[row + x]; o++; continue; }
          out[o] = p; if (np) np[o] = cp[row + x]; o++;
          if (m && (x & 1)) {                                   
            const q0 = cur[row + x - 1], q1 = p, nx = cur[row + Math.min(cw - 1, x + 1)];
            for (let d = 0; d < m; d++) { out[o] = avgPx(q0, q1); out[o + 1] = avgPx(q1, nx); if (np) { np[o] = cp[row + x]; np[o + 1] = cp[row + x]; } o += 2; }
          }
        }
      }
    }
    cur = out; cw = nw; cp = np; lcur = lout; lw = lnw; lprot = lnp; left -= k;
  }
  return { px: cur, prot: cp, w: cw };
}


function carveWidth(px, w, h, W, prot) {
  if (W === w) return { px, prot };
  if (w * h >= COARSE_MIN_PX && Math.abs(W - w) >= 8 && w >= 16 && h >= 4) {
    const r = carveWidthCoarse(px, w, h, W, prot);
    if (r.w === W) return { px: r.px, prot: r.prot };
    return carveWidth(r.px, r.w, h, W, r.prot);
  }
  if (W < w) {
    const st = makeState(Uint32Array.from(px), w, h, prot);
    findAndRemove(st, w - W, true);
    const out = new Uint32Array(W * h);
    for (let y = 0; y < h; y++) out.set(st.px.subarray(y * w, y * w + W), y * W);
    let op = null;
    if (prot) { op = new Uint8Array(W * h); for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) op[y * W + x] = prot[y * w + st.idx[y * w + x]]; }
    return { px: out, prot: op };
  }
  
  let cur = px, cw = w, cp = prot;
  while (cw < W) {
    const k = Math.min(W - cw, Math.max(1, Math.floor(cw / 2)));
    const st = makeState(cur, cw, h, cp);
    const seams = findAndRemove(st, k, false);
    
    const nw = cw + k, out = new Uint32Array(nw * h), np = cp ? new Uint8Array(nw * h) : null;
    const dup = new Uint16Array(cw);
    for (let y = 0; y < h; y++) {
      dup.fill(0);
      for (const s of seams) dup[s[y]]++;
      const r = y * cw; let o = y * nw;
      for (let x = 0; x < cw; x++) {
        const p = cur[r + x];
        out[o] = p; if (np) np[o] = cp[r + x]; o++;
        for (let d = 0; d < dup[x]; d++) {
          const q = cur[r + Math.min(cw - 1, x + 1)];
          out[o] = avgPx(p, q); if (np) np[o] = cp[r + x]; o++;
        }
      }
    }
    cur = out; cw = nw; cp = np;
  }
  return { px: cur, prot: cp };
}
function avgPx(p, q) {
  return (((p & 255) + (q & 255) + 1) >> 1)
    | ((((p >>> 8) & 255) + ((q >>> 8) & 255) + 1) >> 1) << 8
    | ((((p >>> 16) & 255) + ((q >>> 16) & 255) + 1) >> 1) << 16
    | ((((p >>> 24) & 255) + ((q >>> 24) & 255) + 1) >> 1) << 24;
}
function transpose(a, w, h, Ctor) {
  const o = new Ctor(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[x * h + y] = a[y * w + x];
  return o;
}


export function resampleRGBA(src, w, h, W, H) {
  const out = new Uint8ClampedArray(W * H * 4);
  if (!(W > 0 && H > 0)) return out;
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(h - 1, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(w - 1, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const o00 = (y0 * w + x0) * 4, o10 = (y0 * w + x1) * 4, o01 = (y1 * w + x0) * 4, o11 = (y1 * w + x1) * 4;
      const w00 = (1 - tx) * (1 - ty) * src[o00 + 3], w10 = tx * (1 - ty) * src[o10 + 3], w01 = (1 - tx) * ty * src[o01 + 3], w11 = tx * ty * src[o11 + 3];
      const a = w00 + w10 + w01 + w11, d = (y * W + x) * 4;
      if (a > 0) for (let c = 0; c < 3; c++) out[d + c] = (src[o00 + c] * w00 + src[o10 + c] * w10 + src[o01 + c] * w01 + src[o11 + c] * w11) / a;
      out[d + 3] = a;
    }
  }
  return out;
}











export function contentAwareScale(rgba, w, h, W, H, opts = {}) {
  W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
  const amount = opts.amount == null ? 1 : Math.max(0, Math.min(1, +opts.amount));
  let prot = null;
  if (opts.protect) prot = Uint8Array.from(opts.protect);
  if (opts.skin) { const s = skinMask(rgba, w, h); if (!prot) prot = s; else for (let i = 0; i < s.length; i++) if (s[i] > prot[i]) prot[i] = s[i]; }
  const W1 = Math.max(1, Math.round(w + (W - w) * amount)), H1 = Math.max(1, Math.round(h + (H - h) * amount));
  let px = new Uint32Array(w * h);
  for (let i = 0, o = 0; i < px.length; i++, o += 4) px[i] = (rgba[o] | rgba[o + 1] << 8 | rgba[o + 2] << 16 | rgba[o + 3] << 24) >>> 0;
  
  let r = carveWidth(px, w, h, W1, prot);
  px = r.px; prot = r.prot;
  if (H1 !== h) {
    const tp = transpose(px, W1, h, Uint32Array), tq = prot ? transpose(prot, W1, h, Uint8Array) : null;
    r = carveWidth(tp, h, W1, H1, tq);
    px = transpose(r.px, H1, W1, Uint32Array);
  }
  let out = new Uint8ClampedArray(W1 * H1 * 4);
  for (let i = 0, o = 0; i < W1 * H1; i++, o += 4) { const p = px[i]; out[o] = p & 255; out[o + 1] = (p >>> 8) & 255; out[o + 2] = (p >>> 16) & 255; out[o + 3] = p >>> 24; }
  if (W1 !== W || H1 !== H) out = resampleRGBA(out, W1, H1, W, H);
  return { data: out, width: W, height: H };
}

export default { contentAwareScale, skinMask, resampleRGBA };
