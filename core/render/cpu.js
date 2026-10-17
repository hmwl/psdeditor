











export function sampleBilinear(img, u, v, repeat, out) {
  const w = img.width, h = img.height, d = img.data;
  if (repeat) { u = u - Math.floor(u); v = v - Math.floor(v); }
  else {
    if (u < -1e-7 || u > 1 + 1e-7 || v < -1e-7 || v > 1 + 1e-7) { out.fill(0); return false; }
    u = Math.max(0, Math.min(1, u)); v = Math.max(0, Math.min(1, v));
  }

  let x = u * w - 0.5, y = v * h - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const cl = (i, n) => repeat ? ((i % n) + n) % n : (i < 0 ? 0 : i >= n ? n - 1 : i);
  const x1 = cl(x0 + 1, w), y1 = cl(y0 + 1, h);
  x0 = cl(x0, w); y0 = cl(y0, h);

  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const a00 = d[i00 + 3] * w00, a10 = d[i10 + 3] * w10;
  const a01 = d[i01 + 3] * w01, a11 = d[i11 + 3] * w11;
  const alpha = a00 + a10 + a01 + a11;
  for (let k = 0; k < 3; k++)
    out[k] = alpha > 0 ? (d[i00 + k] * a00 + d[i10 + k] * a10 + d[i01 + k] * a01 + d[i11 + k] * a11) / alpha : 0;
  out[3] = alpha;
  return true;
}

export function createCPUBackend() {
  const px = new Float64Array(4);

  function render(o) {
    const W = o.width, H = o.height;
    const out = o.out || new Uint8Array(W * H * 4);
    out.fill(0);
    const { positions, uvs, indices } = o.mesh;
    const m = o.placement, repeat = !!o.repeat;
    const img = o.image;
    if (!img || !img.data) throw new Error('CPU 后端需要原始 RGBA 图像 {data,width,height}');

    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      const ax = positions[a * 2], ay = positions[a * 2 + 1];
      const bx = positions[b * 2], by = positions[b * 2 + 1];
      const cx = positions[c * 2], cy = positions[c * 2 + 1];

      let minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      let maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      let minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      let maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      if (minX > maxX || minY > maxY) continue;

      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const inv = 1 / den;
      
      const sign = den > 0 ? 1 : -1;
      const topLeft = (x0, y0, x1, y1) => {
        const dx = (x1 - x0) * sign, dy = (y1 - y0) * sign;
        return dy < 0 || (dy === 0 && dx > 0);
      };
      const own0 = topLeft(bx, by, cx, cy), own1 = topLeft(cx, cy, ax, ay), own2 = topLeft(ax, ay, bx, by);
      const inside = (l, own) => l > 1e-12 || (l >= -1e-12 && own);

      const au = uvs[a * 2], av = uvs[a * 2 + 1];
      const bu = uvs[b * 2], bv = uvs[b * 2 + 1];
      const cu = uvs[c * 2], cv = uvs[c * 2 + 1];

      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const pxx = x + 0.5;
          const l0 = ((by - cy) * (pxx - cx) + (cx - bx) * (py - cy)) * inv;
          const l1 = ((cy - ay) * (pxx - cx) + (ax - cx) * (py - cy)) * inv;
          const l2 = 1 - l0 - l1;
          if (!inside(l0, own0) || !inside(l1, own1) || !inside(l2, own2)) continue;

          const u0 = l0 * au + l1 * bu + l2 * cu;
          const v0 = l0 * av + l1 * bv + l2 * cv;
          const u = m[0] * u0 + m[1] * v0 + m[2];
          const v = m[3] * u0 + m[4] * v0 + m[5];
          if (!sampleBilinear(img, u, v, repeat, px)) continue;
          if (px[3] <= 0) continue;

          const oi = (y * W + x) * 4;
          const sa = px[3] / 255, da = out[oi + 3] / 255;
          const na = sa + da * (1 - sa);
          if (na <= 0) continue;
          const alphaByte = Math.round(na * 255);
          if (!alphaByte) { out.fill(0, oi, oi + 4); continue; }
          for (let k = 0; k < 3; k++)
            out[oi + k] = Math.round((px[k] * sa + out[oi + k] * da * (1 - sa)) / na);
          out[oi + 3] = alphaByte;
        }
      }
    }
    return out;
  }

  return { name: 'cpu', render };
}


export function downscale(src, W, H, ss) {
  if (ss <= 1) return { data: src, width: W, height: H };
  const w = Math.round(W / ss), h = Math.round(H / ss);
  const out = new Uint8ClampedArray(w * h * 4);
  const n = ss * ss;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const si = (((y * ss + j) * W) + (x * ss + i)) * 4;
      const al = src[si + 3];
      r += src[si] * al; g += src[si + 1] * al; b += src[si + 2] * al; a += al;   
    }
    const oi = (y * w + x) * 4;
    if (a > 0) { out[oi] = r / a; out[oi + 1] = g / a; out[oi + 2] = b / a; }
    out[oi + 3] = a / n;
  }
  return { data: out, width: w, height: h };
}
