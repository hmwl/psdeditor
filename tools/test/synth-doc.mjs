


const MODES = ['norm', 'mul ', 'scrn', 'over', 'sLit', 'hLit', 'vLit', 'lLit', 'pLit', 'hMix', 'diff', 'smud', 'fsub', 'fdiv', 'idiv', 'div ', 'lbrn', 'lddg', 'dark', 'lite', 'hue ', 'sat ', 'colr', 'lum ', 'dkCl', 'lgCl', 'diss'];
export function synthDoc(W, H, seed = 1) {
  let s = seed; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const px = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; const v = f(x, y); d[q] = v[0]; d[q + 1] = v[1]; d[q + 2] = v[2]; d[q + 3] = v[3]; } return d; };
  const layer = (o) => ({ name: o.name || 'L', opacity: 255, blendMode: 'norm', hidden: false, clipping: 0, ...o });
  const pix = (l, t, w, h, f, o = {}) => layer({ rgba: px(w, h, f), width: w, height: h, bounds: { left: l, top: t, right: l + w, bottom: t + h }, ...o });
  const grad = (x, y) => [x * 3 & 255, y * 5 & 255, (x + y) & 255, 255];
  const blob = (w, h) => (x, y) => { const dx = x - w / 2, dy = y - h / 2, r = Math.hypot(dx, dy) / (w / 2); return [200 * rnd() | 0, 120, 40 + (x & 63), Math.max(0, Math.min(255, (1.1 - r) * 255)) | 0]; };
  const mask = (l, t, w, h, o = {}) => ({ gray: Uint8Array.from({ length: w * h }, (_, i) => (i % w) * 255 / w | 0), width: w, height: h, left: l, top: t, right: l + w, bottom: t + h, defaultColor: 0, relative: false, ...o });
  const gHead = (o) => layer({ name: 'G', group: { type: 1 }, blendMode: 'pass', bounds: { left: 0, top: 0, right: 0, bottom: 0 }, ...o });
  const gEnd = () => layer({ name: '</G>', group: { type: 3 }, bounds: { left: 0, top: 0, right: 0, bottom: 0 } });
  const adj = (key, params, o = {}) => layer({ name: 'adj ' + key, adjustment: { key, params }, bounds: { left: 0, top: 0, right: 0, bottom: 0 }, ...o });
  const L = [];
  L.push(pix(0, 0, W, H, grad));
  MODES.forEach((m, k) => L.push(pix((k * 13) % (W - 40), (k * 29) % (H - 40), 48, 40, blob(48, 40), { blendMode: m, opacity: 128 + (k * 37) % 128 })));
  L.push(pix(10, 10, 60, 50, blob(60, 50), { blendMode: 'mul ' }));
  L.push(pix(20, 20, 30, 30, grad, { clipping: 1, blendMode: 'scrn' }));
  L.push(adj('nvrt', {}, { clipping: 1, opacity: 200 }));
  L.push(pix(30, 30, 30, 30, grad, { clipping: 1 }));
  L.push(adj('post', { levels: 4 }, { mask: mask(5, 5, 50, 40, { defaultColor: 255 }), blendMode: 'over' }));
  L.push(adj('thrs', { level: 128 }, { opacity: 90 }));
  
  L.push(gEnd());
  L.push(pix(40, 5, 50, 50, blob(50, 50), { blendMode: 'hLit' }));
  L.push(pix(50, 15, 30, 30, grad, { clipping: 1 }));
  L.push(gHead({ blendMode: 'mul ', opacity: 200, mask: mask(30, 0, 70, 60) }));
  
  L.push(gEnd());
  L.push(pix(5, 50, 70, 30, blob(70, 30)));
  L.push(adj('nvrt', {}));
  L.push(gHead({ blendMode: 'pass', mask: mask(0, 40, 80, 50, { invert: true }) }));
  
  L.push(gEnd());
  L.push(pix(60, 60, 20, 20, grad, { blendMode: 'diff' }));
  L.push(gEnd()); L.push(pix(0, 0, 10, 10, grad)); L.push(gHead({ hidden: true }));
  L.push(gHead({ blendMode: 'pass' }));
  
  L.push(gEnd());
  L.push(pix(W - 50, H - 50, 70, 70, blob(70, 70)));
  L.push(gHead({ blendMode: 'pass', artboard: { rect: { x: W - 60, y: H - 60, w: 40, h: 40 }, bgType: 4, color: [10, 200, 30] } }));
  
  L.push(pix(5, 5, 40, 40, blob(40, 40), { blendIf: { gray: { src: [0, 30, 200, 255], dst: [20, 60, 255, 255] }, channels: [{ src: [0, 0, 128, 255], dst: [0, 0, 255, 255] }] } }));
  L.push(pix(15, 25, 40, 40, grad, { channelsOff: [1] }));
  L.push(pix(25, 35, 30, 30, grad, { knockout: 1, fillOpacity: 180 }));
  L.push(pix(35, 45, 30, 30, blob(30, 30), { fillOpacity: 100, opacity: 200 }));
  return { width: W, height: H, layers: L };     
}
