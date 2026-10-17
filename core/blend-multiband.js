




















const clampi = (v, a, b) => v < a ? a : v > b ? b : v;
function coverOf(im, W, H) {
  
  const c = new Uint8Array(W * H);
  for (let y = 0; y < im.h; y++) {
    const Y = im.y0 + y; if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < im.w; x++) {
      const X = im.x0 + x; if (X < 0 || X >= W) continue;
      if (im.rgba[(y * im.w + x) * 4 + 3] >= 128) c[Y * W + X] = 1;
    }
  }
  return c;
}
const px = (im, X, Y, c) => im.rgba[((Y - im.y0) * im.w + (X - im.x0)) * 4 + c];
function inIm(im, X, Y) { return X >= im.x0 && Y >= im.y0 && X < im.x0 + im.w && Y < im.y0 + im.h; }








export function panoramaLabels(imgs, W, H, o = {}) {
  const n = imgs.length;
  const covers = imgs.map(im => coverOf(im, W, H));
  const cen = covers.map(c => { let sx = 0, sy = 0, k = 0; for (let i = 0; i < c.length; i++) if (c[i]) { sx += i % W; sy += (i / W) | 0; k++; } return k ? [sx / k, sy / k, k] : [0, 0, 0]; });
  let order = o.order;
  if (!order) {
    
    let mx = 0, my = 0; for (const c of cen) { mx += c[0]; my += c[1]; } mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0; for (const c of cen) { sxx += (c[0] - mx) ** 2; syy += (c[1] - my) ** 2; sxy += (c[0] - mx) * (c[1] - my); }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
    order = [...imgs.keys()].sort((a, b) => (cen[a][0] * ux + cen[a][1] * uy) - (cen[b][0] * ux + cen[b][1] * uy));
  }
  const lab = new Int16Array(W * H).fill(-1);
  for (const k of order) {
    const ck = covers[k], im = imgs[k];
    
    let ox0 = W, oy0 = H, ox1 = -1, oy1 = -1, any = false;
    let ex = 0, ey = 0, en = 0;
    for (let i = 0; i < W * H; i++) {
      if (lab[i] >= 0) { ex += i % W; ey += (i / W) | 0; en++; }
      if (!ck[i] || lab[i] < 0) continue;
      const x = i % W, y = (i / W) | 0; any = true;
      if (x < ox0) ox0 = x; if (x > ox1) ox1 = x; if (y < oy0) oy0 = y; if (y > oy1) oy1 = y;
    }
    if (any && en) {
      const dx = cen[k][0] - ex / en, dy = cen[k][1] - ey / en;
      const vertical = Math.abs(dx) >= Math.abs(dy);           
      
      const R0 = vertical ? oy0 : ox0, R1 = vertical ? oy1 : ox1, C0 = vertical ? ox0 : oy0, C1 = vertical ? ox1 : oy1;
      const nr = R1 - R0 + 1, nc = C1 - C0 + 1;
      const cost = new Float32Array(nr * nc);
      const BIG = 1e5;
      for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
        const X = vertical ? C0 + c : R0 + r, Y = vertical ? R0 + r : C0 + c, i = Y * W + X;
        if (!(ck[i] && lab[i] >= 0)) { cost[r * nc + c] = BIG; continue; }
        const other = imgs[lab[i]];
        let d = 0;
        for (let ch = 0; ch < 3; ch++) d += Math.abs(px(im, X, Y, ch) - px(other, X, Y, ch));
        
        const X2 = Math.min(W - 1, X + 1), Y2 = Math.min(H - 1, Y + 1);
        if (inIm(im, X2, Y2) && inIm(other, X2, Y2)) {
          for (let ch = 0; ch < 3; ch++) {
            const gA = Math.abs(px(im, X2, Y, ch) - px(im, X, Y, ch)) + Math.abs(px(im, X, Y2, ch) - px(im, X, Y, ch));
            const gB = Math.abs(px(other, X2, Y, ch) - px(other, X, Y, ch)) + Math.abs(px(other, X, Y2, ch) - px(other, X, Y, ch));
            d += 0.5 * Math.abs(gA - gB);
          }
        }
        cost[r * nc + c] = d + 1;
      }
      
      const acc = new Float32Array(nr * nc), back = new Int8Array(nr * nc);
      for (let c = 0; c < nc; c++) acc[c] = cost[c];
      for (let r = 1; r < nr; r++) for (let c = 0; c < nc; c++) {
        let b = acc[(r - 1) * nc + c], bb = 0;
        if (c > 0 && acc[(r - 1) * nc + c - 1] < b) { b = acc[(r - 1) * nc + c - 1]; bb = -1; }
        if (c < nc - 1 && acc[(r - 1) * nc + c + 1] < b) { b = acc[(r - 1) * nc + c + 1]; bb = 1; }
        acc[r * nc + c] = b + cost[r * nc + c]; back[r * nc + c] = bb;
      }
      let bc = 0; for (let c = 1; c < nc; c++) if (acc[(nr - 1) * nc + c] < acc[(nr - 1) * nc + bc]) bc = c;
      const seam = new Int32Array(nr);
      for (let r = nr - 1; r >= 0; r--) { seam[r] = bc; bc += back[r * nc + bc]; }
      const side = vertical ? Math.sign(dx) || 1 : Math.sign(dy) || 1;
      for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
        const X = vertical ? C0 + c : R0 + r, Y = vertical ? R0 + r : C0 + c, i = Y * W + X;
        if (!(ck[i] && lab[i] >= 0)) continue;
        if ((c - seam[r]) * side > 0) lab[i] = k;
      }
    }
    for (let i = 0; i < W * H; i++) if (ck[i] && lab[i] < 0) lab[i] = k;
  }
  return lab;
}


function grayCanvas(im, W, H) {
  const g = new Float32Array(W * H).fill(NaN);
  for (let y = 0; y < im.h; y++) { const Y = im.y0 + y; if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < im.w; x++) { const X = im.x0 + x; if (X < 0 || X >= W) continue;
      const o = (y * im.w + x) * 4; if (im.rgba[o + 3] < 128) continue;
      g[Y * W + X] = 0.299 * im.rgba[o] + 0.587 * im.rgba[o + 1] + 0.114 * im.rgba[o + 2]; } }
  return g;
}
function boxBlur(src, W, H, r) {
  
  const tmp = new Float32Array(W * H), cnt = new Float32Array(W * H), out = new Float32Array(W * H), c2 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let s = 0, n = 0; const row = y * W;
    for (let x = -r; x < W + r; x++) {
      const xi = x + r; if (xi < W) { const v = src[row + xi]; if (v === v) { s += v; n++; } }
      const xo = x - r - 1; if (xo >= 0 && xo < W) { const v = src[row + xo]; if (v === v) { s -= v; n--; } }
      if (x >= 0 && x < W) { tmp[row + x] = s; cnt[row + x] = n; }
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let y = -r; y < H + r; y++) {
      const yi = y + r; if (yi < H) { s += tmp[yi * W + x]; n += cnt[yi * W + x]; }
      const yo = y - r - 1; if (yo >= 0 && yo < H) { s -= tmp[yo * W + x]; n -= cnt[yo * W + x]; }
      if (y >= 0 && y < H) { out[y * W + x] = s; c2[y * W + x] = n; }
    }
  }
  for (let i = 0; i < W * H; i++) out[i] = c2[i] > 0 ? out[i] / c2[i] : NaN;
  return out;
}



export function stackLabels(imgs, W, H, o = {}) {
  const n = imgs.length;
  const sig = o.radius || Math.max(2, Math.round(Math.max(W, H) / 250));
  const sharp = imgs.map(im => {
    const g = grayCanvas(im, W, H);
    const s = boxBlur(g, W, H, 1);         
    const lap = new Float32Array(W * H).fill(NaN);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, c = s[i];
      if (!(c === c)) continue;
      const l = 4 * c - s[i - 1] - s[i + 1] - s[i - W] - s[i + W];
      lap[i] = l === l ? Math.abs(l) : NaN;
    }
    return boxBlur(boxBlur(lap, W, H, sig), W, H, sig);
  });
  let lab = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    let b = -1, bv = -1;
    for (let k = 0; k < n; k++) { const v = sharp[k][i]; if (v === v && v > bv) { bv = v; b = k; } }
    lab[i] = b;
  }
  
  for (let pass = 0; pass < 3; pass++) {
    const nx = new Int16Array(lab);
    const cnt = new Int32Array(n);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x; if (lab[i] < 0) continue;
      cnt.fill(0);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const l = lab[i + dy * W + dx]; if (l >= 0) cnt[l]++; }
      let b = lab[i]; for (let k = 0; k < n; k++) if (cnt[k] > cnt[b]) b = k;
      if (b !== lab[i] && imgs[b] && inIm(imgs[b], x, y) && px(imgs[b], x, y, 3) >= 128) nx[i] = b;
    }
    lab = nx;
  }
  return lab;
}


const K5 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
function reduce(src, w, h, ch) {
  const W2 = (w + 1) >> 1, H2 = (h + 1) >> 1;
  const tmp = new Float32Array(W2 * h * ch), out = new Float32Array(W2 * H2 * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < W2; x++) for (let c = 0; c < ch; c++) {
    let s = 0; for (let k = -2; k <= 2; k++) { const xx = clampi(2 * x + k, 0, w - 1); s += src[(y * w + xx) * ch + c] * K5[k + 2]; }
    tmp[(y * W2 + x) * ch + c] = s;
  }
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) for (let c = 0; c < ch; c++) {
    let s = 0; for (let k = -2; k <= 2; k++) { const yy = clampi(2 * y + k, 0, h - 1); s += tmp[(yy * W2 + x) * ch + c] * K5[k + 2]; }
    out[(y * W2 + x) * ch + c] = s;
  }
  return { d: out, w: W2, h: H2 };
}
function expand(src, w, h, W, H, ch) {
  
  const out = new Float32Array(W * H * ch);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, y / 2), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, x / 2), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < ch; c++) out[(y * W + x) * ch + c] = (src[(y0 * w + x0) * ch + c] * (1 - tx) + src[(y0 * w + x1) * ch + c] * tx) * (1 - ty) + (src[(y1 * w + x0) * ch + c] * (1 - tx) + src[(y1 * w + x1) * ch + c] * tx) * ty;
    }
  }
  return out;
}

function pullPush(rgb, a, w, h) {
  if (w <= 1 && h <= 1) return;
  let any = false; for (let i = 0; i < w * h; i++) if (a[i] < 1) { any = true; break; }
  if (!any) return;
  const W2 = (w + 1) >> 1, H2 = (h + 1) >> 1;
  const r2 = new Float32Array(W2 * H2 * 3), a2 = new Float32Array(W2 * H2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = (y >> 1) * W2 + (x >> 1), k = a[i];
    if (!k) continue;
    a2[j] += k; for (let c = 0; c < 3; c++) r2[j * 3 + c] += rgb[i * 3 + c] * k;
  }
  for (let j = 0; j < W2 * H2; j++) if (a2[j] > 0) { for (let c = 0; c < 3; c++) r2[j * 3 + c] /= a2[j]; a2[j] = Math.min(1, a2[j]); }
  if (W2 < w || H2 < h) pullPush(r2, a2, W2, H2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = a[i]; if (k >= 1) continue;
    const j = (y >> 1) * W2 + (x >> 1);
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = rgb[i * 3 + c] * k + r2[j * 3 + c] * (1 - k);
  }
}








export function multibandBlend(imgs, labels, W, H, o = {}) {
  const L = o.levels || clampi(Math.floor(Math.log2(Math.min(W, H))) - 3, 2, 7);
  const S = 1 << L;
  
  const dims = []; { let w = W, h = H; for (let l = 0; l <= L; l++) { dims.push([w, h]); w = (w + 1) >> 1; h = (h + 1) >> 1; } }
  const acc = dims.map(([w, h]) => new Float32Array(w * h * 3)), wsum = dims.map(([w, h]) => new Float32Array(w * h));
  imgs.forEach((im, k) => {
    
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    for (let y = Math.max(0, im.y0); y < Math.min(H, im.y0 + im.h); y++) for (let x = Math.max(0, im.x0); x < Math.min(W, im.x0 + im.w); x++)
      if (labels[y * W + x] === k) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 < 0) return;
    const x0 = Math.max(0, Math.floor((bx0 - S * 2) / S) * S), y0 = Math.max(0, Math.floor((by0 - S * 2) / S) * S);
    const x1 = Math.min(W, Math.ceil((bx1 + 1 + S * 2) / S) * S), y1 = Math.min(H, Math.ceil((by1 + 1 + S * 2) / S) * S);
    const w = x1 - x0, h = y1 - y0;
    let rgb = new Float32Array(w * h * 3), al = new Float32Array(w * h), m = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x0 + x, Y = y0 + y, i = y * w + x;
      if (labels[Y * W + X] === k) m[i] = 1;
      if (!inIm(im, X, Y)) continue;
      const q = ((Y - im.y0) * im.w + (X - im.x0)) * 4, a = im.rgba[q + 3] / 255;
      if (!a) continue;
      al[i] = a; for (let c = 0; c < 3; c++) rgb[i * 3 + c] = im.rgba[q + c];
    }
    pullPush(rgb, al, w, h);
    
    let gw = w, gh = h, G = rgb, M = m;
    for (let l = 0; l <= L; l++) {
      const ox = x0 >> l, oy = y0 >> l, [CW, CH] = dims[l];
      let lap = G, nextG = null, nw = 0, nh = 0, nextM = null;
      if (l < L) {
        const r = reduce(G, gw, gh, 3); nextG = r.d; nw = r.w; nh = r.h;
        const up = expand(nextG, nw, nh, gw, gh, 3);
        lap = new Float32Array(G.length); for (let t = 0; t < G.length; t++) lap[t] = G[t] - up[t];
        nextM = reduce(M, gw, gh, 1).d;
      }
      const A = acc[l], Ws = wsum[l];
      for (let y = 0; y < gh; y++) { const Y = oy + y; if (Y >= CH) break;
        for (let x = 0; x < gw; x++) { const X = ox + x; if (X >= CW) break;
          const mv = M[y * gw + x]; if (!mv) continue;
          const d = Y * CW + X, s = y * gw + x;
          Ws[d] += mv; for (let c = 0; c < 3; c++) A[d * 3 + c] += lap[s * 3 + c] * mv; } }
      if (l < L) { G = nextG; M = nextM; gw = nw; gh = nh; }
    }
  });
  
  for (let l = 0; l <= L; l++) { const A = acc[l], Ws = wsum[l]; for (let i = 0; i < Ws.length; i++) if (Ws[i] > 1e-6) for (let c = 0; c < 3; c++) A[i * 3 + c] /= Ws[i]; }
  let cur = acc[L];
  for (let l = L - 1; l >= 0; l--) {
    const [w, h] = dims[l], [sw, sh] = dims[l + 1];
    const up = expand(cur, sw, sh, w, h, 3), A = acc[l];
    for (let i = 0; i < up.length; i++) up[i] += A[i];
    cur = up;
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const k = labels[i]; if (k < 0) continue;
    const im = imgs[k], X = i % W, Y = (i / W) | 0;
    const a = inIm(im, X, Y) ? px(im, X, Y, 3) : 0;
    if (!a) continue;
    out[i * 4] = cur[i * 3]; out[i * 4 + 1] = cur[i * 3 + 1]; out[i * 4 + 2] = cur[i * 3 + 2]; out[i * 4 + 3] = a;
  }
  return out;
}


export function labelComposite(imgs, labels, W, H) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const k = labels[i]; if (k < 0) continue;
    const im = imgs[k], X = i % W, Y = (i / W) | 0;
    if (!inIm(im, X, Y)) continue;
    const q = ((Y - im.y0) * im.w + (X - im.x0)) * 4;
    out[i * 4] = im.rgba[q]; out[i * 4 + 1] = im.rgba[q + 1]; out[i * 4 + 2] = im.rgba[q + 2]; out[i * 4 + 3] = im.rgba[q + 3];
  }
  return out;
}






export function splitToLayers(imgs, labels, blended, W, H) {
  return imgs.map((im, k) => {
    const mask = new Uint8Array(im.w * im.h), pix = Uint8ClampedArray.from(im.rgba);
    for (let y = 0; y < im.h; y++) { const Y = im.y0 + y; if (Y < 0 || Y >= H) continue;
      for (let x = 0; x < im.w; x++) { const X = im.x0 + x; if (X < 0 || X >= W) continue;
        const i = Y * W + X; if (labels[i] !== k) continue;
        mask[y * im.w + x] = 255;
        if (blended) { const q = (y * im.w + x) * 4; pix[q] = blended[i * 4]; pix[q + 1] = blended[i * 4 + 1]; pix[q + 2] = blended[i * 4 + 2]; } } }
    return { mask, pixels: pix };
  });
}

export default { panoramaLabels, stackLabels, multibandBlend, labelComposite, splitToLayers };
