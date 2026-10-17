
















function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}








export function contentAwareFill(rgba, w, h, mask, opts = {}) {
  if (rgba.length !== w * h * 4 || mask.length !== w * h) throw new Error('内容识别填充：尺寸不对');
  const out = new Uint8ClampedArray(rgba);
  const r = Math.max(1, Math.min(6, opts.patch | 0 || 3));
  const rand = rng(opts.seed == null ? 1 : opts.seed);
  const nSamp = Math.max(16, opts.samples | 0 || 120);

  
  let x0 = w, y0 = h, x1 = -1, y1 = -1, holeN = 0;
  const known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i] >= 128) { holeN++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    else known[i] = 1;
  }
  if (!holeN) return out;
  if (holeN === w * h) throw new Error('内容识别填充：整幅都在选区里，没有可以取样的像素');

  
  const okSrc = (x, y) => {
    if (x < r || y < r || x >= w - r || y >= h - r) return false;
    const i = y * w + x;
    if (!known[i]) return false;
    if (opts.sourceMask && opts.sourceMask[i] < 128) return false;
    return true;
  };
  const margin = opts.margin || Math.max(24, Math.round(Math.max(x1 - x0, y1 - y0) * 1.5));
  const wx0 = Math.max(0, x0 - margin), wy0 = Math.max(0, y0 - margin), wx1 = Math.min(w - 1, x1 + margin), wy1 = Math.min(h - 1, y1 + margin);
  const nearList = [], allList = [];
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    if (!okSrc(x, y)) continue;
    const v = y * w + x;
    if (x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1) nearList.push(v);
    if (((x * 7 + y * 13) & 3) === 0) allList.push(v);           
  }
  if (!nearList.length && !allList.length) throw new Error('内容识别填充：洞周围没有足够的已知像素可取样（洞离画布边太近或太大）');
  const pickRand = () => {
    const useNear = nearList.length && (rand() < 0.65 || !allList.length);
    const L = useNear ? nearList : allList;
    return L[(rand() * L.length) | 0];
  };

  const srcOf = new Int32Array(w * h).fill(-1);              
  const filled = known;                                      

  
  const cost = (px, py, sx, sy, best) => {
    let d = 0, n = 0;
    for (let j = -r; j <= r; j++) {
      const ty = py + j; if (ty < 0 || ty >= h) continue;
      for (let i = -r; i <= r; i++) {
        const tx = px + i; if (tx < 0 || tx >= w) continue;
        const ti = ty * w + tx; if (!filled[ti]) continue;
        const si = (sy + j) * w + sx + i;
        if (!known[si] || mask[si] >= 128) { d += 3 * 255 * 255; n++; continue; }
        const a = ti * 4, b = si * 4;
        const dr = out[a] - rgba[b], dg = out[a + 1] - rgba[b + 1], db = out[a + 2] - rgba[b + 2], da = out[a + 3] - rgba[b + 3];
        d += dr * dr + dg * dg + db * db + da * da; n++;
      }
    }
    return n ? d / n : Infinity;
  };

  
  let front = [];
  const inFront = new Uint8Array(w * h);
  const nb8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const knownNeighbors = i => { const x = i % w, y = (i / w) | 0; let c = 0; for (const [dx, dy] of nb8) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && filled[Y * w + X]) c++; } return c; };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (filled[i]) continue;
    if (knownNeighbors(i) > 0) { front.push(i); inFront[i] = 1; }
  }
  let remaining = holeN, guard = 0;
  while (remaining > 0 && front.length && guard++ < 100000) {
    front.sort((a, b) => knownNeighbors(b) - knownNeighbors(a));
    const next = [];
    for (const i of front) {
      inFront[i] = 0;
      if (filled[i]) continue;
      const px = i % w, py = (i / w) | 0;
      let best = Infinity, bestS = -1;
      
      for (const [dx, dy] of nb8) {
        const X = px + dx, Y = py + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const s = srcOf[Y * w + X]; if (s < 0) continue;
        const sx = (s % w) - dx, sy = ((s / w) | 0) - dy;
        if (!okSrc(sx, sy)) continue;
        const c = cost(px, py, sx, sy, best) * 0.85;
        if (c < best) { best = c; bestS = sy * w + sx; }
      }
      
      for (let k = 0; k < nSamp; k++) {
        const s = pickRand(); const sx = s % w, sy = (s / w) | 0;
        const c = cost(px, py, sx, sy, best);
        if (c < best) { best = c; bestS = s; }
      }
      
      if (bestS >= 0) {
        const bx = bestS % w, by = (bestS / w) | 0;
        for (let j = -2; j <= 2; j++) for (let q = -2; q <= 2; q++) {
          if (!j && !q) continue;
          const sx = bx + q, sy = by + j; if (!okSrc(sx, sy)) continue;
          const c = cost(px, py, sx, sy, best);
          if (c < best) { best = c; bestS = sy * w + sx; }
        }
      }
      if (bestS < 0) continue;
      const a = i * 4, b = bestS * 4;
      out[a] = rgba[b]; out[a + 1] = rgba[b + 1]; out[a + 2] = rgba[b + 2]; out[a + 3] = rgba[b + 3];
      filled[i] = 1; srcOf[i] = bestS; remaining--;
    }
    for (const i of front) {
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of nb8) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X; if (filled[k] || inFront[k]) continue;
        inFront[k] = 1; next.push(k);
      }
    }
    front = next;
  }

  
  const sm = new Uint8ClampedArray(out);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (mask[i] < 128) continue;
    for (let c = 0; c < 4; c++) {
      let s = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let q = -1; q <= 1; q++) { const X = x + q, Y = y + j; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; s += out[(Y * w + X) * 4 + c]; n++; }
      sm[i * 4 + c] = Math.round(out[i * 4 + c] * 0.8 + (s / n) * 0.2);
    }
  }
  return sm;
}
































export function patchMatchInpaint(rgba, w, h, mask, opts = {}) {
  if (rgba.length < w * h * 4 || mask.length !== w * h) throw new Error('内容识别：尺寸不对');
  const P = Math.max(1, Math.min(6, opts.patch | 0 || 3));
  const rand = rng(opts.seed == null ? 7 : opts.seed);
  let holeN = 0;
  for (let i = 0; i < w * h; i++) if (mask[i] >= 128) holeN++;
  const out0 = new Uint8ClampedArray(rgba.subarray ? rgba.subarray(0, w * h * 4) : rgba);
  if (!holeN) return out0;
  if (holeN === w * h) throw new Error('内容识别：整块都在洞里，没有可以取样的像素');

  
  const lv0 = { w, h, img: new Float32Array(w * h * 4), hole: new Uint8Array(w * h), src: new Uint8Array(w * h) };
  for (let i = 0; i < w * h; i++) {
    lv0.hole[i] = mask[i] >= 128 ? 1 : 0;
    lv0.src[i] = opts.sourceMask ? (opts.sourceMask[i] >= 128 ? 1 : 0) : 1;
    const init = lv0.hole[i] && opts.init ? opts.init : rgba;
    for (let c = 0; c < 4; c++) lv0.img[i * 4 + c] = init[i * 4 + c];
  }
  const levels = [lv0];
  const holeExtent = L => {
    let x0 = L.w, y0 = L.h, x1 = -1, y1 = -1;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.hole[y * L.w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return Math.max(x1 - x0 + 1, y1 - y0 + 1);
  };
  while (levels.length < 7) {
    const L = levels[levels.length - 1];
    if (holeExtent(L) <= P * 3 || L.w < P * 8 || L.h < P * 8) break;
    const W2 = L.w >> 1, H2 = L.h >> 1;
    const N = { w: W2, h: H2, img: new Float32Array(W2 * H2 * 4), hole: new Uint8Array(W2 * H2), src: new Uint8Array(W2 * H2) };
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const j = y * W2 + x;
      let anyHole = 0, allSrc = 1, n = 0;
      const acc = [0, 0, 0, 0], accAll = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = (y * 2 + dy) * L.w + x * 2 + dx;
        if (L.hole[i]) anyHole = 1; else { for (let c = 0; c < 4; c++) acc[c] += L.img[i * 4 + c]; n++; }
        if (!L.src[i]) allSrc = 0;
        for (let c = 0; c < 4; c++) accAll[c] += L.img[i * 4 + c];
      }
      N.hole[j] = anyHole; N.src[j] = allSrc;
      
      for (let c = 0; c < 4; c++) N.img[j * 4 + c] = n ? acc[c] / n : accAll[c] / 4;
    }
    levels.push(N);
  }

  
  const coarse = levels[levels.length - 1];
  if (!opts.init) {
    const { w: W, h: H, img, hole } = coarse;
    const known = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) known[i] = hole[i] ? 0 : 1;
    let left = 0; for (let i = 0; i < W * H; i++) if (!known[i]) left++;
    for (let guard = 0; left > 0 && guard < W + H; guard++) {
      const add = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (known[i]) continue;
        const s = [0, 0, 0, 0]; let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const k = Y * W + X; if (!known[k]) continue;
          for (let c = 0; c < 4; c++) s[c] += img[k * 4 + c]; n++;
        }
        if (n) add.push([i, s.map(v => v / n)]);
      }
      if (!add.length) break;
      for (const [i, s] of add) { for (let c = 0; c < 4; c++) img[i * 4 + c] = s[c]; known[i] = 1; left--; }
    }
  }

  let nnfPrev = null, prevW = 0, prevH = 0;
  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li], W = L.w, H = L.h, img = L.img, hole = L.hole;
    
    const integ = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += hole[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row; } }
    const holesIn = (x0, y0, x1, y1) => integ[(y1 + 1) * (W + 1) + x1 + 1] - integ[y0 * (W + 1) + x1 + 1] - integ[(y1 + 1) * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
    const valid = new Uint8Array(W * H);
    const validList = [];
    for (let y = P; y < H - P; y++) for (let x = P; x < W - P; x++) {
      const i = y * W + x;
      if (!L.src[i] || holesIn(x - P, y - P, x + P, y + P)) continue;
      valid[i] = 1; validList.push(i);
    }
    if (!validList.length) {
      
      if (li === 0) throw new Error('内容识别：洞周围没有足够的像素可取样（洞离边缘太近或选区太大）');
      nnfPrev = null; continue;
    }
    
    const tgt = [];
    const isTgt = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - P), y0 = Math.max(0, y - P), x1 = Math.min(W - 1, x + P), y1 = Math.min(H - 1, y + P);
      if (holesIn(x0, y0, x1, y1)) { const i = y * W + x; tgt.push(i); isTgt[i] = 1; }
    }
    const nnf = new Int32Array(W * H).fill(-1);
    const D = new Float32Array(W * H);
    const randValid = () => validList[(rand() * validList.length) | 0];
    const NF = (2 * P + 1) * (2 * P + 1);
    const dist = (p, s, best) => {
      const px = p % W, py = (p / W) | 0, sx = s % W, sy = (s / W) | 0;
      let d = 0, n = 0;
      for (let j = -P; j <= P; j++) {
        const ty = py + j; if (ty < 0 || ty >= H) continue;
        const rt = ty * W, rs = (sy + j) * W;
        for (let i = -P; i <= P; i++) {
          const tx = px + i; if (tx < 0 || tx >= W) continue;
          const a = (rt + tx) * 4, b = (rs + sx + i) * 4;
          const d0 = img[a] - img[b], d1 = img[a + 1] - img[b + 1], d2 = img[a + 2] - img[b + 2], d3 = img[a + 3] - img[b + 3];
          d += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3; n++;
        }
        if (d > best * NF) return Infinity;   
      }
      return n ? d / n : Infinity;
    };
    
    for (const p of tgt) {
      let s = -1;
      const px = p % W, py = (p / W) | 0;
      if (nnfPrev) {
        const cx = Math.min(prevW - 1, px >> 1), cy = Math.min(prevH - 1, py >> 1);
        const q = nnfPrev[cy * prevW + cx];
        if (q >= 0) {
          const sx = (q % prevW) * 2 + (px & 1), sy = ((q / prevW) | 0) * 2 + (py & 1);
          if (sx >= 0 && sy >= 0 && sx < W && sy < H && valid[sy * W + sx]) s = sy * W + sx;
        }
      } else if (opts.initOffset) {
        const sc = 1 << li;
        const sx = px + Math.round(opts.initOffset.dx / sc), sy = py + Math.round(opts.initOffset.dy / sc);
        if (sx >= 0 && sy >= 0 && sx < W && sy < H && valid[sy * W + sx]) s = sy * W + sx;
      }
      if (s < 0) s = randValid();
      nnf[p] = s;
    }
    
    

    const vote = (sharp = false) => {
      let mean = 0; for (const p of tgt) mean += D[p]; mean = Math.max(1, mean / tgt.length) * (sharp ? 0.25 : 1);
      const acc = new Float32Array(W * H * 4), ws = new Float32Array(W * H);
      for (const p of tgt) {
        const s = nnf[p]; if (s < 0) continue;
        const wgt = Math.exp(-D[p] / (2 * mean)) + 1e-6;
        const px = p % W, py = (p / W) | 0, sx = s % W, sy = (s / W) | 0;
        for (let j = -P; j <= P; j++) {
          const ty = py + j; if (ty < 0 || ty >= H) continue;
          for (let i = -P; i <= P; i++) {
            const tx = px + i; if (tx < 0 || tx >= W) continue;
            const q = ty * W + tx; if (!hole[q]) continue;
            const b = ((sy + j) * W + sx + i) * 4;
            acc[q * 4] += img[b] * wgt; acc[q * 4 + 1] += img[b + 1] * wgt; acc[q * 4 + 2] += img[b + 2] * wgt; acc[q * 4 + 3] += img[b + 3] * wgt;
            ws[q] += wgt;
          }
        }
      }
      for (let q = 0; q < W * H; q++) if (hole[q] && ws[q] > 0) for (let c = 0; c < 4; c++) img[q * 4 + c] = acc[q * 4 + c] / ws[q];
    };
    const evalAll = () => { for (const p of tgt) D[p] = dist(p, nnf[p], Infinity); };
    if (nnfPrev) { evalAll(); vote(); }       
    evalAll();
    const maxR = Math.max(W, H);
    const pmPass = rev => {
      const n = tgt.length;
      for (let k = 0; k < n; k++) {
        const p = tgt[rev ? n - 1 - k : k];
        const px = p % W, py = (p / W) | 0;
        let best = D[p], bs = nnf[p];
        const tryS = s => { if (s < 0 || !valid[s] || s === bs) return; const d = dist(p, s, best); if (d < best) { best = d; bs = s; } };
        
        const st = rev ? 1 : -1;
        if (px + st >= 0 && px + st < W) { const q = nnf[p + st]; if (q >= 0 && isTgt[p + st]) { const sx = (q % W) - st; if (sx >= 0 && sx < W) tryS(q - st); } }
        if (py + st >= 0 && py + st < H) { const q = nnf[p + st * W]; if (q >= 0 && isTgt[p + st * W]) { const sy = ((q / W) | 0) - st; if (sy >= 0 && sy < H) tryS(q - st * W); } }
        
        const bx = bs % W, by = (bs / W) | 0;
        for (let R = maxR; R >= 1; R >>= 1) {
          const cx = bx + Math.round((rand() * 2 - 1) * R), cy = by + Math.round((rand() * 2 - 1) * R);
          if (cx < P || cy < P || cx >= W - P || cy >= H - P) continue;
          tryS(cy * W + cx);
        }
        tryS(randValid());
        nnf[p] = bs; D[p] = best;
      }
    };
    const em = li === 0 ? Math.min(opts.emIters || 2, 2) : Math.max(2, Math.min(opts.emIters || 6, li === levels.length - 1 ? 8 : 4));
    for (let it = 0; it < em; it++) {
      pmPass(false); pmPass(true);
      vote(li === 0 && it === em - 1);
      evalAll();
    }
    nnfPrev = nnf; prevW = W; prevH = H;
  }
  const out = out0;
  for (let i = 0; i < w * h; i++) if (lv0.hole[i]) for (let c = 0; c < 4; c++) out[i * 4 + c] = Math.round(lv0.img[i * 4 + c]);
  return out;
}
