












let SC = null;
export async function loadCas() { if (!SC) SC = await import('../../core/seam-carve.js'); return SC; }
export const casReady = () => !!SC;

function shrinkRGBA(src, w, h, f) {
  if (f >= 1) return { data: src, width: w, height: h };
  const W = Math.max(1, Math.round(w * f)), H = Math.max(1, Math.round(h * f));
  const a = document.createElement('canvas'); a.width = w; a.height = h;
  a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(src), w, h), 0, 0);
  const b = document.createElement('canvas'); b.width = W; b.height = H;
  const g = b.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(a, 0, 0, W, H);
  return { data: g.getImageData(0, 0, W, H).data, width: W, height: H };
}
function shrinkGray(src, w, h, W, H) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = src[Math.min(h - 1, Math.floor((y + 0.5) * h / H)) * w + Math.min(w - 1, Math.floor((x + 0.5) * w / W))];
  return o;
}

export function casRect(q) {
  const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)), flipX: q[1][0] < q[0][0], flipY: q[3][1] < q[0][1] };
}
function flip(data, w, h, fx, fy) {
  if (!fx && !fy) return data;
  const o = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((fy ? h - 1 - y : y) * w + (fx ? w - 1 - x : x)) * 4, d = (y * w + x) * 4;
    o[d] = data[s]; o[d + 1] = data[s + 1]; o[d + 2] = data[s + 2]; o[d + 3] = data[s + 3];
  }
  return o;
}





export function casPreview(S, cas, quad, dragging) {
  if (!SC) return null;
  const r = casRect(quad), src = S.src;
  const lim = dragging ? 240 : 640;
  const f = Math.min(1, lim / Math.max(src.width, src.height, r.w, r.h));
  const key = f.toFixed(4);
  if (!S.casSmall || S.casSmall.key !== key) {
    const sm = shrinkRGBA(src.data, src.width, src.height, f);
    S.casSmall = { key, sm, prot: cas.protect ? shrinkGray(cas.protect, src.width, src.height, sm.width, sm.height) : null, protSrc: cas.protect };
  }
  if (S.casSmall.protSrc !== cas.protect) { const sm = S.casSmall.sm; S.casSmall.prot = cas.protect ? shrinkGray(cas.protect, src.width, src.height, sm.width, sm.height) : null; S.casSmall.protSrc = cas.protect; }
  const sm = S.casSmall.sm;
  const W = Math.max(1, Math.round(r.w * f)), H = Math.max(1, Math.round(r.h * f));
  const out = SC.contentAwareScale(sm.data, sm.width, sm.height, W, H, { amount: cas.amount / 100, protect: S.casSmall.prot, skin: cas.skin });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(new ImageData(flip(out.data, W, H, r.flipX, r.flipY), W, H), 0, 0);
  return { cv, x: r.x, y: r.y, w: r.w, h: r.h };
}

export function casFull(S, cas, quad) {
  const r = casRect(quad), src = S.src;
  const out = SC.contentAwareScale(src.data, src.width, src.height, r.w, r.h, { amount: cas.amount / 100, protect: cas.protect, skin: cas.skin });
  return { data: flip(out.data, r.w, r.h, r.flipX, r.flipY), width: r.w, height: r.h, x: r.x, y: r.y };
}
