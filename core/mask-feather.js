












function boxSizes(sigma, n = 3) {
  const wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--; if (wl < 1) wl = 1;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}


function boxLine(src, dst, w, h, r, horiz) {
  if (!r) { dst.set(src); return; }
  const inv = 1 / (2 * r + 1), lines = horiz ? h : w, len = horiz ? w : h, step = horiz ? 1 : w;
  const line = new Float32Array(len + 2 * r + 1);
  for (let L = 0; L < lines; L++) {
    const base = horiz ? L * w : L;
    const first = src[base], last = src[base + (len - 1) * step];
    for (let t = 0; t < r; t++) line[t] = first;
    for (let t = 0, o = base; t < len; t++, o += step) line[r + t] = src[o];
    for (let t = r + len; t < line.length; t++) line[t] = last;
    let acc = 0;
    for (let t = 0; t <= 2 * r; t++) acc += line[t];
    for (let t = 0, o = base; t < len; t++, o += step) {
      dst[o] = acc * inv;
      acc += line[t + 2 * r + 1] - line[t];
    }
  }
}


export function gaussGray(src, w, h, sigma) {
  let a = Float32Array.from(src);
  if (!(sigma > 0.2) || !(w > 0 && h > 0)) return a;
  let b = new Float32Array(a.length);
  for (const r of boxSizes(sigma)) {
    const rr = Math.round(r);
    boxLine(a, b, w, h, rr, true);
    boxLine(b, a, w, h, rr, false);
  }
  return a;
}

const densityOf = (v, k) => 255 - (255 - v) * k;







export function featherDensityPlane(m, region, feather = 0, density = 255) {
  const f = Math.max(0, Math.min(1000, +feather || 0));
  const k = Math.max(0, Math.min(255, density == null ? 255 : density)) / 255;
  const pad = f > 0.2 ? Math.min(3000, Math.ceil(f * 3)) : 0;
  const W = region.width + pad * 2, H = region.height + pad * 2;
  const top = region.top - pad, left = region.left - pad;
  const def = m.defaultColor == null ? 255 : m.defaultColor;
  const mTop = m.relative ? (m.layerTop || 0) + m.top : m.top, mLeft = m.relative ? (m.layerLeft || 0) + m.left : m.left;
  const src = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const my = top + y - mTop;
    for (let x = 0; x < W; x++) {
      const mx = left + x - mLeft;
      src[y * W + x] = (mx >= 0 && mx < m.width && my >= 0 && my < m.height) ? m.gray[my * m.width + mx] : def;
    }
  }
  const bl = pad ? gaussGray(src, W, H, f) : src;
  const out = new Uint8Array(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    const row = (y + pad) * W + pad;
    for (let x = 0; x < region.width; x++) out[y * region.width + x] = Math.round(densityOf(bl[row + x], k));
  }
  return { gray: out, top: region.top, left: region.left, width: region.width, height: region.height };
}


export function adjustAlpha(alpha, w, h, density = 255, feather = 0) {
  const f = Math.max(0, Math.min(1000, +feather || 0));
  const d = density == null ? 255 : Math.max(0, Math.min(255, density));
  if (!(f > 0.2) && d >= 255) return alpha;
  const k = d / 255;
  const bl = f > 0.2 ? gaussGray(alpha, w, h, f) : alpha;
  const out = new Uint8ClampedArray(alpha.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(densityOf(bl[i], k));
  return out;
}

export default { gaussGray, featherDensityPlane, adjustAlpha };
