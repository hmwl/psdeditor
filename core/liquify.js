
















export function createField(w, h, maxPoints = 2_500_000) {
  const g = Math.max(1, Math.ceil(Math.sqrt((w * h) / maxPoints)));
  const fw = Math.ceil(w / g) + 1, fh = Math.ceil(h / g) + 1;
  return { w, h, g, fw, fh, d: new Float32Array(fw * fh * 2), freeze: new Float32Array(fw * fh) };
}
export function cloneField(F) { return { ...F, d: new Float32Array(F.d), freeze: new Float32Array(F.freeze) }; }
export function isIdentity(F) { for (let i = 0; i < F.d.length; i++) if (Math.abs(F.d[i]) > 1e-3) return false; return true; }


function sampleD(F, x, y, out) {
  const gx = Math.max(0, Math.min(F.fw - 1.0001, x / F.g)), gy = Math.max(0, Math.min(F.fh - 1.0001, y / F.g));
  const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0, fw = F.fw, d = F.d;
  const a = (y0 * fw + x0) * 2, b = a + 2, c = a + fw * 2, e = c + 2;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  out[0] = d[a] * w00 + d[b] * w10 + d[c] * w01 + d[e] * w11;
  out[1] = d[a + 1] * w00 + d[b + 1] * w10 + d[c + 1] * w01 + d[e + 1] * w11;
  return out;
}
const sstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));








export function applyDab(F, tool, o) {
  const R = Math.max(1, o.radius), pr = Math.max(0, Math.min(1, o.pressure ?? 0.5));
  const dens = Math.max(0, Math.min(1, o.density ?? 0.5));
  const g = F.g, fw = F.fw, fh = F.fh;
  
  const gx0 = Math.max(0, Math.floor((o.cx - R) / g) - 1), gy0 = Math.max(0, Math.floor((o.cy - R) / g) - 1);
  const gx1 = Math.min(fw - 1, Math.ceil((o.cx + R) / g) + 1), gy1 = Math.min(fh - 1, Math.ceil((o.cy + R) / g) + 1);
  if (gx1 < gx0 || gy1 < gy0) return null;
  
  const inner = dens * 0.8;
  const weight = (x, y) => {
    const t = Math.hypot(x - o.cx, y - o.cy) / R;
    if (t >= 1) return 0;
    return 1 - sstep((t - inner) / Math.max(1e-3, 1 - inner));
  };
  if (tool === 'freeze' || tool === 'thaw') {
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const w = weight(gx * g, gy * g) * pr; if (!w) continue;
      const k = gy * fw + gx;
      F.freeze[k] = tool === 'freeze' ? Math.min(1, F.freeze[k] + w) : Math.max(0, F.freeze[k] - w);
    }
    return { x0: gx0 * g, y0: gy0 * g, x1: gx1 * g, y1: gy1 * g, maskOnly: true };
  }
  
  const old = F.d, src = F, tmp = [0, 0];
  const RW = gx1 - gx0 + 1, nd = new Float32Array(RW * (gy1 - gy0 + 1) * 2), touched = new Uint8Array(RW * (gy1 - gy0 + 1));
  const put = (gx, gy, vx, vy) => { const q = (gy - gy0) * RW + (gx - gx0); nd[q * 2] = vx; nd[q * 2 + 1] = vy; touched[q] = 1; };
  const rate = Math.max(0.01, Math.min(1, o.rate ?? 0.5));
  const ang = (tool === 'twirlCW' ? 1 : -1) * rate * 0.25;          
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const k = gy * fw + gx, x = gx * g, y = gy * g;
    let w = weight(x, y) * pr * (1 - F.freeze[k]); if (w <= 0) continue;
    let ux = 0, uy = 0;
    switch (tool) {
      case 'forward': ux = -w * (o.vx || 0); uy = -w * (o.vy || 0); break;
      case 'pushLeft': { const len = Math.hypot(o.vx || 0, o.vy || 0) || 1, s = w * Math.min(len, R * 0.5); ux = -(o.vy || 0) / len * s; uy = (o.vx || 0) / len * s; break; }
      case 'pucker': ux = (x - o.cx) * 0.12 * rate * w; uy = (y - o.cy) * 0.12 * rate * w; break;
      case 'bloat': ux = -(x - o.cx) * 0.12 * rate * w; uy = -(y - o.cy) * 0.12 * rate * w; break;
      case 'twirlCW': case 'twirlCCW': {
        const a = ang * w, co = Math.cos(a), si = Math.sin(a), dx = x - o.cx, dy = y - o.cy;
        ux = dx * co - dy * si - dx; uy = dx * si + dy * co - dy; break;
      }
      case 'reconstruct': { const k2 = Math.min(1, rate * w); put(gx, gy, old[k * 2] * (1 - k2), old[k * 2 + 1] * (1 - k2)); continue; }
      case 'smooth': {
        let sx = 0, sy = 0, n = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const X = gx + i, Y = gy + j; if (X < 0 || Y < 0 || X >= fw || Y >= fh) continue;
          sx += old[(Y * fw + X) * 2]; sy += old[(Y * fw + X) * 2 + 1]; n++;
        }
        const k2 = Math.min(1, rate * w);
        put(gx, gy, old[k * 2] + (sx / n - old[k * 2]) * k2, old[k * 2 + 1] + (sy / n - old[k * 2 + 1]) * k2);
        continue;
      }
      default: continue;
    }
    
    sampleD(src, x + ux, y + uy, tmp);
    put(gx, gy, tmp[0] + ux, tmp[1] + uy);
  }
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const q = (gy - gy0) * RW + (gx - gx0); if (!touched[q]) continue;
    const k = gy * fw + gx; F.d[k * 2] = nd[q * 2]; F.d[k * 2 + 1] = nd[q * 2 + 1];
  }
  return { x0: Math.max(0, gx0 * g - g), y0: Math.max(0, gy0 * g - g), x1: Math.min(F.w, gx1 * g + g), y1: Math.min(F.h, gy1 * g + g) };
}


export function reconstructAll(F, amount = 1) {
  const k = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < F.freeze.length; i++) { const w = k * (1 - F.freeze[i]); F.d[i * 2] *= 1 - w; F.d[i * 2 + 1] *= 1 - w; }
}




export function renderLiquify(src, F, out, rect) {
  const w = F.w, h = F.h;
  const x0 = Math.max(0, rect ? Math.floor(rect.x0) : 0), y0 = Math.max(0, rect ? Math.floor(rect.y0) : 0);
  const x1 = Math.min(w, rect ? Math.ceil(rect.x1) : w), y1 = Math.min(h, rect ? Math.ceil(rect.y1) : h);
  const D = [0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    sampleD(F, x, y, D);
    const o = (y * w + x) * 4;
    if (Math.abs(D[0]) < 1e-3 && Math.abs(D[1]) < 1e-3) { out[o] = src[o]; out[o + 1] = src[o + 1]; out[o + 2] = src[o + 2]; out[o + 3] = src[o + 3]; continue; }
    const sx = x + D[0], sy = y + D[1];
    const fx = Math.floor(sx), fy = Math.floor(sy), tx = sx - fx, ty = sy - fy;
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const X = fx + i, Y = fy + j; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const wt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty), s = (Y * w + X) * 4, al = src[s + 3] * wt;
      r += src[s] * al; g += src[s + 1] * al; b += src[s + 2] * al; a += al;
    }
    if (a <= 0.01) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
    out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = a;
  }
  return out;
}
