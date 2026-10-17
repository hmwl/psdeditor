

export function blendHistoryPixel(base, target, amount) {
  const t = Math.max(0, Math.min(1, amount));
  const a = base[3] * (1-t) + target[3] * t;
  return [0,1,2].map(k => a ? Math.round((base[k]*base[3]*(1-t)+target[k]*target[3]*t)/a) : 0).concat(Math.round(a));
}
export function mixPaint(load, canvas, wet, mix) {
  
  
  if (wet <= 0) return load.slice();
  return blendHistoryPixel(load, canvas, mix);
}
export function averageSample(source, x, y, size = 1) {
  const cx = Math.floor(x), cy = Math.floor(y), r = Math.floor(size / 2);
  if (cx < 0 || cy < 0 || cx >= source.w || cy >= source.h) return null;
  let n = 0, alpha = 0; const rgb = [0, 0, 0];
  for (let py = Math.max(0, cy-r); py <= Math.min(source.h-1, cy+r); py++)
    for (let px = Math.max(0, cx-r); px <= Math.min(source.w-1, cx+r); px++) {
      const o = (py*source.w+px)*4, a = source.data[o+3]; n++; alpha += a;
      for (let k=0; k<3; k++) rgb[k] += source.data[o+k]*a;
    }
  return rgb.map(v => alpha ? Math.round(v/alpha) : 0).concat(Math.round(alpha/n));
}
export function consumeMixerLoad(amount, spacing, load) {
  
  return Math.max(0, amount - Math.max(.01, spacing) / (1 + Math.max(0, load)*99));
}
export function sourcePixel(source, x, y, cell = 1) {
  const px = Math.max(0, Math.min(source.w-1, Math.floor(x/cell)*cell + Math.floor(cell/2)));
  const py = Math.max(0, Math.min(source.h-1, Math.floor(y/cell)*cell + Math.floor(cell/2)));
  const o=(py*source.w+px)*4;
  return [source.data[o],source.data[o+1],source.data[o+2],source.data[o+3]];
}
