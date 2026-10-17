














import { computePlacement, IDENTITY_PLACEMENT } from './placement.js';
import { sampleBilinear } from './render/cpu.js';








export function bakeSourceRaster(o) {
  const img = o.image;
  const dstW = Math.max(1, Math.round(o.dstW)), dstH = Math.max(1, Math.round(o.dstH));
  if (!img || !img.data || !(img.width > 0 && img.height > 0)) throw new Error('bakeSourceRaster 需要 RGBA 图像 {data,width,height}');

  const f = o.fit;
  const plainStretch = !f || !f.mode || f.mode === 'none' || (f.mode === 'stretch'
    && !f.rotate && !f.offsetX && !f.offsetY && (f.scale == null || f.scale === 1));
  const place = plainStretch ? IDENTITY_PLACEMENT
    : computePlacement({ srcW: img.width, srcH: img.height, dstW, dstH, ...f });
  const m = place.matrix, repeat = place.repeat;

  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const px = new Float64Array(4);
  for (let y = 0; y < dstH; y++) {
    const v0 = (y + 0.5) / dstH;
    for (let x = 0; x < dstW; x++) {
      const u0 = (x + 0.5) / dstW;
      const u = m[0] * u0 + m[1] * v0 + m[2];
      const v = m[3] * u0 + m[4] * v0 + m[5];
      if (!sampleBilinear(img, u, v, repeat, px)) continue;
      const oi = (y * dstW + x) * 4;
      out[oi] = px[0]; out[oi + 1] = px[1]; out[oi + 2] = px[2]; out[oi + 3] = px[3];
    }
  }
  return { data: out, width: dstW, height: dstH };
}


export function pngFilename(name, fallback = 'source.png') {
  const base = String(name || '').replace(/\.[^./\\]*$/, '');
  return (base || fallback.replace(/\.png$/, '')) + '.png';
}
