















export function rng(seed) {
  let s = ((seed | 0) >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = h => { const n = parseInt(String(h || '#000').replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function noise1(seed) {
  const r = rng(seed), T = Array.from({ length: 256 }, () => r() * 2 - 1);
  return x => { const i = Math.floor(x), f = x - i, a = T[i & 255], b = T[(i + 1) & 255], t = f * f * (3 - 2 * f); return a + (b - a) * t; };
}



export function flattenPaths(subs, step = 2) {
  const out = [];
  for (const sp of subs || []) {
    const k = sp.knots; if (!k || k.length < 2) { if (k && k.length === 1) out.push([{ x: k[0].anchor[0], y: k[0].anchor[1], s: 0 }]); continue; }
    const n = k.length, segs = sp.closed === false ? n - 1 : n, pts = [];
    for (let i = 0; i < segs; i++) {
      const a = k[i], b = k[(i + 1) % n];
      const P0 = a.anchor, P1 = a.out || a.anchor, P2 = b.in || b.anchor, P3 = b.anchor;
      const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) + Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) + Math.hypot(P3[0] - P2[0], P3[1] - P2[1]);
      const m = Math.max(2, Math.ceil(L / step));
      for (let j = i ? 1 : 0; j <= m; j++) {
        const t = j / m, u = 1 - t;
        pts.push({ x: u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0], y: u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1] });
      }
    }
    let s = 0; pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = s; });
    out.push(pts);
  }
  return out;
}
function atLen(pts, s) {
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s < s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  const tx = b.x - a.x, ty = b.y - a.y, tn = Math.hypot(tx, ty) || 1;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), tx: tx / tn, ty: ty / tn };
}


export const FLAME_TYPES = [
  ['alongOne', '1. 沿路径一个火焰'], ['alongMany', '2. 沿路径多个火焰'], ['oneDir', '3. 一个方向多个火焰'],
  ['pathDir', '4. 路径方向多个火焰'], ['multiAngle', '5. 多个角度多个火焰'], ['candle', '6. 烛光'],
];
export const FLAME_DEFAULTS = {
  type: 'alongMany', length: 120, randomLength: false, width: 40, angle: 0, interval: 30, customColor: false, color: '#ff7a00',
  quality: 'medium', turbulence: 30, jaggedness: 10, opacity: 80, lines: 12, bottomAlign: 20, style: 'normal', shape: 'parallel', seed: 1, adjustInterval: false,
};
const QUALITY = { draft: 5, low: 8, medium: 14, high: 22, fine: 34 };
function firePalette(p) {
  if (!p.customColor) return { core: [255, 250, 225], mid: [255, 190, 50], outer: [240, 70, 10], tip: [160, 20, 0] };
  const c = hexRgb(p.color);
  return { core: mix(c, [255, 255, 255], 0.8), mid: mix(c, [255, 255, 255], 0.35), outer: c, tip: mix(c, [0, 0, 0], 0.45) };
}

function drawTongue(ctx, bx, by, dx, dy, L, W, p, r, pal, spine) {
  const segs = QUALITY[p.quality] || 14, nl = clamp(Math.round(p.lines || 12), 1, 60);
  const turb = (p.turbulence || 0) / 100, jag = (p.jaggedness || 0) / 100, op = clamp((p.opacity == null ? 80 : p.opacity) / 100, 0, 1);
  const violent = p.style === 'violent', flat = p.style === 'flat';
  const nx = -dy, ny = dx;                                       
  const N = noise1(Math.floor(r() * 1e9));
  const botAlign = clamp((p.bottomAlign || 0) / 100, 0, 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let li = 0; li < nl; li++) {
    const off = nl === 1 ? 0 : (li / (nl - 1) - 0.5);            
    
    const startT = (1 - botAlign) * r() * 0.25;
    const lenK = 0.55 + 0.45 * (1 - Math.abs(off) * 1.6) + (r() - 0.5) * 0.25;
    const lineL = L * clamp(lenK, 0.25, 1.1) * (violent ? 1.1 : 1);
    const ph = r() * 100, pts = [];
    for (let s = 0; s <= segs; s++) {
      const t = startT + (1 - startT) * s / segs, along = t * lineL;
      
      let lat;
      if (p.shape === 'converge') lat = off * W * (1 - t);                          
      else if (p.shape === 'diverge') lat = off * W * (0.6 + t * 0.9);             
      else if (p.shape === 'oval') lat = off * W * Math.sin(Math.PI * clamp(t * 0.9 + 0.1, 0, 1)) * 1.2;
      else if (p.shape === 'directional') lat = off * W * (1 - t) + t * t * W * 0.5; 
      else lat = off * W * (1 - t * 0.55);                                            
      const amp = W * (0.15 + turb * 0.9) * t * (violent ? 1.5 : 1);
      lat += N(ph + t * (2 + turb * 5)) * amp + (jag > 0 ? (r() - 0.5) * jag * W * 0.35 * t : 0);
      let x, y;
      if (spine) { const q = atLen(spine, clamp(along / lineL, 0, 1) * spine[spine.length - 1].s); x = q.x - q.ty * lat; y = q.y + q.tx * lat; }
      else { x = bx + dx * along + nx * lat; y = by + dy * along + ny * lat; }
      pts.push([x, y, t]);
    }
    const baseW = Math.max(1, W / nl * (flat ? 2.4 : 1.8));
    
    for (const [pass, wk, ak] of [[0, 2.6, 0.18], [1, 1, 0.5], [2, 0.4, 0.55]]) {
      for (let s = 1; s < pts.length; s++) {
        const [x0, y0, t0] = pts[s - 1], [x1, y1, t1] = pts[s], tm = (t0 + t1) / 2;
        const taper = flat ? 1 - tm * 0.5 : 1 - tm * 0.92;
        const col = tm < 0.2 ? mix(pal.mid, pal.core, pass === 2 ? 1 : 0.5) : tm < 0.6 ? mix(pal.core, pal.mid, (tm - 0.2) / 0.4) : mix(pal.outer, pal.tip, (tm - 0.6) / 0.4);
        const c2 = pass === 0 ? mix(col, pal.outer, 0.6) : col;
        const a = ak * op * (tm < 0.08 ? tm / 0.08 : 1) * (1 - Math.pow(tm, 3) * 0.8);
        ctx.strokeStyle = rgba(c2, a); ctx.lineWidth = Math.max(0.5, baseW * wk * taper);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function drawCandle(ctx, x, y, dx, dy, L, W, p, r, pal) {
  const op = clamp((p.opacity == null ? 80 : p.opacity) / 100, 0, 1), nx = -dy, ny = dx;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  
  const g = ctx.createRadialGradient(x + dx * L * 0.4, y + dy * L * 0.4, 0, x + dx * L * 0.4, y + dy * L * 0.4, L * 1.3);
  g.addColorStop(0, rgba(pal.mid, 0.35 * op)); g.addColorStop(1, rgba(pal.outer, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx * L * 0.4, y + dy * L * 0.4, L * 1.3, 0, 7); ctx.fill();
  
  const sway = (r() - 0.5) * W * 0.3;
  const drop = (sc, col, a) => {
    ctx.fillStyle = rgba(col, a * op); ctx.beginPath();
    const w2 = W * 0.5 * sc, l2 = L * sc;
    ctx.moveTo(x - nx * 0 + dx * l2 + nx * sway, y + dy * l2 + ny * sway);
    ctx.bezierCurveTo(x + nx * w2 + dx * l2 * 0.35, y + ny * w2 + dy * l2 * 0.35, x + nx * w2 * 0.9 - dx * w2 * 0.6, y + ny * w2 * 0.9 - dy * w2 * 0.6, x - dx * w2 * 0.6, y - dy * w2 * 0.6);
    ctx.bezierCurveTo(x - nx * w2 * 0.9 - dx * w2 * 0.6, y - ny * w2 * 0.9 - dy * w2 * 0.6, x - nx * w2 + dx * l2 * 0.35, y - ny * w2 + dy * l2 * 0.35, x + dx * l2 + nx * sway, y + dy * l2 + ny * sway);
    ctx.fill();
  };
  drop(1, pal.outer, 0.55); drop(0.78, pal.mid, 0.7); drop(0.5, pal.core, 0.9);
  ctx.fillStyle = rgba([60, 110, 255], 0.35 * op); ctx.beginPath(); ctx.ellipse(x, y, W * 0.18, W * 0.12, Math.atan2(dy, dx), 0, 7); ctx.fill();
  ctx.restore();
}
export function renderFlame(ctx, subs, p0) {
  const p = { ...FLAME_DEFAULTS, ...p0 }, r = rng(p.seed), pal = firePalette(p);
  const polys = flattenPaths(subs, 2).filter(q => q.length > 1);
  const ang = (p.angle || 0) * Math.PI / 180, up = [Math.sin(ang), -Math.cos(ang)];    
  const lenOf = () => p.length * (p.randomLength ? 0.45 + r() * 0.9 : 1);
  for (const poly of polys) {
    const total = poly[poly.length - 1].s;
    if (p.type === 'alongOne') {
      
      drawTongue(ctx, 0, 0, 0, -1, total, Math.min(p.width, total * 0.5), p, r, pal, poly);
      continue;
    }
    let iv = Math.max(2, p.interval || 30);
    if (p.adjustInterval) { const n = Math.max(1, Math.round(total / iv)); iv = total / n; }
    for (let s = 0; s <= total + 1e-6; s += iv) {
      const q = atLen(poly, s);
      let d;
      if (p.type === 'oneDir' || p.type === 'candle') d = up;
      else if (p.type === 'alongMany') { const nrm = [q.ty, -q.tx]; const c = Math.cos(ang), si = Math.sin(ang); d = [nrm[0] * c - nrm[1] * si, nrm[0] * si + nrm[1] * c]; }
      else if (p.type === 'pathDir') { const c = Math.cos(ang), si = Math.sin(ang); d = [q.tx * c - q.ty * si, q.tx * si + q.ty * c]; }
      else { const a2 = ang + (r() - 0.5) * Math.PI * 0.9; d = [Math.sin(a2), -Math.cos(a2)]; }
      if (p.type === 'candle') drawCandle(ctx, q.x, q.y, d[0], d[1], lenOf() * 0.5, p.width * 0.5, p, r, pal);
      else drawTongue(ctx, q.x, q.y, d[0], d[1], lenOf(), p.width, p, r, pal, null);
    }
  }
}


export const FRAME_TYPES = [
  ['lines', '1. 线框'], ['double', '2. 圆角双线'], ['beads', '3. 珠链'], ['scallop', '4. 波浪花边'], ['vine', '5. 藤蔓'],
  ['flowerVine', '6. 花藤'], ['wreath', '7. 叶环'], ['corners', '8. 花角'], ['rope', '9. 绳纹'], ['stars', '10. 星点'],
  ['checker', '11. 格纹'], ['scroll', '12. 卷草角花'],
];
export const FLOWER_TYPES = [['none', '无'], ['five', '五瓣花'], ['daisy', '雏菊'], ['four', '四瓣花'], ['rose', '玫瑰'], ['bell', '铃兰'], ['star', '星形花']];
export const LEAF_TYPES = [['none', '无'], ['oval', '椭圆叶'], ['heart', '心形叶'], ['willow', '柳叶'], ['trefoil', '三裂叶'], ['maple', '枫叶'], ['needle', '针叶']];
export const FRAME_DEFAULTS = {
  type: 'flowerVine', vineColor: '#3f6b2a', margin: 20, size: 50, arrange: 50, lines: 2, thickness: 3, angle: 30, fade: 0,
  flower: 'five', flowerColor: '#e25b7a', flowerSize: 50, leaf: 'oval', leafColor: '#5e9b3a', leafSize: 50, seed: 3,
};

function perimeter(R, rr = 0) {
  const { x, y, w, h } = R, r = Math.min(rr, w / 2, h / 2), sw = w - 2 * r, sh = h - 2 * r, arc = Math.PI * r / 2;
  const L = 2 * sw + 2 * sh + 4 * arc;
  const at = t => {
    let s = ((t % 1) + 1) % 1 * L;
    const segs = [
      [sw, u => [x + r + u, y, 1, 0]], [arc, u => { const a = -Math.PI / 2 + u / r; return [x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r, -Math.sin(a), Math.cos(a)]; }],
      [sh, u => [x + w, y + r + u, 0, 1]], [arc, u => { const a = u / r; return [x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r, -Math.sin(a), Math.cos(a)]; }],
      [sw, u => [x + w - r - u, y + h, -1, 0]], [arc, u => { const a = Math.PI / 2 + u / r; return [x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r, -Math.sin(a), Math.cos(a)]; }],
      [sh, u => [x, y + h - r - u, 0, -1]], [arc, u => { const a = Math.PI + u / r; return [x + r + Math.cos(a) * r, y + r + Math.sin(a) * r, -Math.sin(a), Math.cos(a)]; }],
    ];
    for (const [len, f] of segs) { if (s <= len || len === segs[7][0] && f === segs[7][1]) { const [px, py, tx, ty] = f(Math.min(s, len)); return { x: px, y: py, tx, ty, nx: -ty, ny: tx }; } s -= len; }
    return { x, y, tx: 1, ty: 0, nx: 0, ny: 1 };
  };
  return { L, at };
}
function drawLeaf(ctx, type, x, y, ang, size, col, r) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = rgba(col, 1); ctx.strokeStyle = rgba(mix(col, [0, 0, 0], 0.35), 0.9); ctx.lineWidth = Math.max(0.5, size * 0.05);
  const s = size; ctx.beginPath();
  if (type === 'heart') { ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.2, -s * 0.55, s * 0.95, -s * 0.35, s, 0); ctx.bezierCurveTo(s * 0.95, s * 0.35, s * 0.2, s * 0.55, 0, 0); }
  else if (type === 'willow') { ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.6, -s * 0.16, s * 1.3, 0); ctx.quadraticCurveTo(s * 0.6, s * 0.16, 0, 0); }
  else if (type === 'trefoil') { for (const a of [-0.7, 0, 0.7]) { ctx.moveTo(0, 0); const ex = Math.cos(a) * s, ey = Math.sin(a) * s; ctx.quadraticCurveTo(ex * 0.5 - ey * 0.35, ey * 0.5 + ex * 0.35, ex, ey); ctx.quadraticCurveTo(ex * 0.5 + ey * 0.35, ey * 0.5 - ex * 0.35, 0, 0); } }
  else if (type === 'maple') { const n = 5; ctx.moveTo(0, 0); for (let i = 0; i <= n * 2; i++) { const a = -Math.PI * 0.55 + i / (n * 2) * Math.PI * 1.1, rr = i % 2 ? s * 0.45 : s * (i === n ? 1 : 0.8); ctx.lineTo(s * 0.35 + Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
  else if (type === 'needle') { ctx.moveTo(0, -s * 0.04); ctx.lineTo(s * 1.1, 0); ctx.lineTo(0, s * 0.04); }
  else { ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.3, -s * 0.4, s * 0.8, -s * 0.3, s, 0); ctx.bezierCurveTo(s * 0.8, s * 0.3, s * 0.3, s * 0.4, 0, 0); }
  ctx.fill(); ctx.stroke();
  if (type !== 'needle' && type !== 'trefoil') { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.85, 0); ctx.strokeStyle = rgba(mix(col, [255, 255, 255], 0.35), 0.8); ctx.stroke(); }
  ctx.restore(); void r;
}
function drawFlower(ctx, type, x, y, size, col, rot) {
  const s = size, light = mix(col, [255, 255, 255], 0.45), dark = mix(col, [0, 0, 0], 0.3);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const petals = (n, len, wid, c1, c2) => { for (let i = 0; i < n; i++) { ctx.save(); ctx.rotate(i / n * Math.PI * 2); const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgba(c1, 1)); g.addColorStop(1, rgba(c2, 1)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.3, -wid, len * 0.95, -wid, len, 0); ctx.bezierCurveTo(len * 0.95, wid, len * 0.3, wid, 0, 0); ctx.fill(); ctx.restore(); } };
  if (type === 'daisy') { petals(14, s, s * 0.14, [255, 255, 255], light); ctx.fillStyle = 'rgb(240,190,40)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, 7); ctx.fill(); }
  else if (type === 'four') { petals(4, s, s * 0.45, dark, light); ctx.fillStyle = 'rgb(250,220,120)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, 7); ctx.fill(); }
  else if (type === 'rose') { for (let k = 3; k >= 1; k--) { ctx.fillStyle = rgba(mix(dark, light, k / 3), 1); ctx.beginPath(); for (let i = 0; i <= 5; i++) { const a = i / 5 * Math.PI * 2 + k; const rr = s * k / 3; i ? ctx.quadraticCurveTo(Math.cos(a - 0.6) * rr * 1.25, Math.sin(a - 0.6) * rr * 1.25, Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill(); ctx.strokeStyle = rgba(dark, 0.6); ctx.lineWidth = s * 0.03; ctx.stroke(); } }
  else if (type === 'bell') { ctx.fillStyle = rgba(light, 1); ctx.strokeStyle = rgba(dark, 0.7); ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.quadraticCurveTo(-s * 0.45, -s * 0.8, 0, -s * 0.8); ctx.quadraticCurveTo(s * 0.45, -s * 0.8, s * 0.4, 0); for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(s * (0.3 - i * 0.2), s * 0.25, s * (0.2 - i * 0.2), 0); ctx.fill(); ctx.stroke(); }
  else if (type === 'star') { ctx.fillStyle = rgba(col, 1); ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = i % 2 ? s * 0.4 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.fillStyle = rgba(light, 1); ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, 7); ctx.fill(); }
  else { petals(5, s, s * 0.42, dark, light); ctx.fillStyle = 'rgb(255,214,90)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, 7); ctx.fill(); }
  ctx.restore();
}
export function renderFrame(ctx, rect, p0) {
  const p = { ...FRAME_DEFAULTS, ...p0 }, r = rng(p.seed);
  const m = Math.max(0, p.margin), R = { x: rect.x + m, y: rect.y + m, w: Math.max(4, rect.w - 2 * m), h: Math.max(4, rect.h - 2 * m) };
  const base = Math.min(R.w, R.h), size = base * (0.012 + p.size / 100 * 0.04), vine = hexRgb(p.vineColor), fl = hexRgb(p.flowerColor), lf = hexRgb(p.leafColor);
  const th = Math.max(0.5, p.thickness), nLines = clamp(Math.round(p.lines), 1, 20), density = 0.3 + p.arrange / 100 * 1.7, ang = (p.angle || 0) * Math.PI / 180;
  const fsz = size * (0.3 + p.flowerSize / 100 * 0.9), lsz = size * (0.4 + p.leafSize / 100 * 1.0);
  const fade = clamp((p.fade || 0) / 100, 0, 1);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const alphaAt = t => 1 - fade * (0.5 - 0.5 * Math.cos(t * Math.PI * 4));                
  const strokeRect = (inset, rad, lw, col, a = 1) => { ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.beginPath(); roundRectPath(ctx, R.x + inset, R.y + inset, R.w - 2 * inset, R.h - 2 * inset, rad); ctx.stroke(); };
  const P = perimeter(R, p.type === 'double' ? size : 0);
  const count = Math.max(8, Math.round(P.L / (size * 2.2) * density));
  const leafAt = (q, side, t) => { if (p.leaf === 'none') return; const a = Math.atan2(q.ty, q.tx) + side * (Math.PI / 2 - ang * 0.9 + (r() - 0.5) * 0.3); ctx.globalAlpha = alphaAt(t); drawLeaf(ctx, p.leaf, q.x, q.y, a, lsz, lf, r); ctx.globalAlpha = 1; };
  const flowerAt = (x, y, t, k = 1) => { if (p.flower === 'none') return; ctx.globalAlpha = alphaAt(t); drawFlower(ctx, p.flower, x, y, fsz * k, fl, r() * Math.PI); ctx.globalAlpha = 1; };
  switch (p.type) {
    case 'lines': for (let i = 0; i < nLines; i++) strokeRect(i * th * 2.5, 0, th, vine); break;
    case 'double': for (let i = 0; i < Math.max(2, nLines); i++) strokeRect(i * th * 3, size * 1.2, th, vine); break;
    case 'beads': {
      for (let k = 0; k < nLines; k++) { const inset = k * size * 1.2, P2 = perimeter({ x: R.x + inset, y: R.y + inset, w: R.w - 2 * inset, h: R.h - 2 * inset }), n = Math.max(8, Math.round(P2.L / (size * 1.1) * density));
        for (let i = 0; i < n; i++) { const t = i / n, q = P2.at(t), rr = size * 0.42; const g = ctx.createRadialGradient(q.x - rr * 0.3, q.y - rr * 0.3, rr * 0.1, q.x, q.y, rr); g.addColorStop(0, rgba(mix(vine, [255, 255, 255], 0.7), alphaAt(t))); g.addColorStop(1, rgba(vine, alphaAt(t))); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 7); ctx.fill(); } }
      break;
    }
    case 'scallop': {
      const n = Math.max(8, Math.round(P.L / (size * 1.6) * density));
      for (let k = 0; k < nLines; k++) { ctx.strokeStyle = rgba(vine, 1); ctx.lineWidth = th; ctx.beginPath();
        for (let i = 0; i <= n * 8; i++) { const t = i / (n * 8), q = P.at(t), bump = Math.abs(Math.sin(t * n * Math.PI)) * size * 0.8 - k * th * 2.5; const x = q.x + q.nx * bump, y = q.y + q.ny * bump; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); }
      strokeRect(size * 1.1, 0, th * 0.6, vine, 0.8);
      break;
    }
    case 'vine': case 'flowerVine': case 'wreath': {
      
      const waves = Math.max(4, Math.round(P.L / (size * 4) * density));
      const pts = [];
      for (let i = 0; i <= waves * 24; i++) { const t = i / (waves * 24), q = P.at(t), o = p.type === 'wreath' ? 0 : Math.sin(t * waves * Math.PI * 2) * size * 0.7; pts.push({ x: q.x + q.nx * o, y: q.y + q.ny * o, tx: q.tx, ty: q.ty, t }); }
      for (let k = 0; k < (p.type === 'wreath' ? nLines : 1); k++) {
        ctx.strokeStyle = rgba(vine, 1); ctx.lineWidth = th; ctx.beginPath(); pts.forEach((q, i) => { const o = k * size * 0.6; i ? ctx.lineTo(q.x + P.at(q.t).nx * o, q.y + P.at(q.t).ny * o) : ctx.moveTo(q.x + P.at(q.t).nx * o, q.y + P.at(q.t).ny * o); }); ctx.stroke();
      }
      const nLeaves = Math.round(count * (p.type === 'wreath' ? 2.2 : 1.4));
      for (let i = 0; i < nLeaves; i++) { const t = (i + 0.5) / nLeaves, q = pts[Math.floor(t * (pts.length - 1))]; leafAt(q, i % 2 ? 1 : -1, t); }
      if (p.type !== 'vine') { const nf = Math.max(4, Math.round(waves * (p.type === 'wreath' ? 0.5 : 1))); for (let i = 0; i < nf; i++) { const t = (i + 0.25) / nf, q = pts[Math.floor(t * (pts.length - 1))]; flowerAt(q.x, q.y, t); } }
      break;
    }
    case 'corners': {
      for (let i = 0; i < nLines; i++) strokeRect(i * th * 2.5 + size * 0.5, 0, th, vine);
      for (const [cx, cy, a] of [[R.x, R.y, 0], [R.x + R.w, R.y, Math.PI / 2], [R.x + R.w, R.y + R.h, Math.PI], [R.x, R.y + R.h, -Math.PI / 2]]) {
        const nl = Math.max(3, Math.round(4 * density));
        for (let j = 0; j < nl; j++) { const aa = a + (j / (nl - 1)) * Math.PI / 2 - ang * 0.2; if (p.leaf !== 'none') drawLeaf(ctx, p.leaf, cx, cy, aa, lsz * 1.3, lf, r); }
        flowerAt(cx, cy, 0.5, 1.4);
        for (let j = 0; j < 2; j++) { const aa = a + Math.PI / 4 + (j ? 0.5 : -0.5), d = size * 2.2; flowerAt(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d, 0.5, 0.7); }
      }
      break;
    }
    case 'rope': {
      const n = Math.max(10, Math.round(P.L / (size * 0.9) * density));
      for (let s2 = 0; s2 < 2; s2++) {
        for (let i = 0; i < n; i++) {
          const t0 = (i + s2 * 0.5) / n, t1 = t0 + 0.6 / n, a = P.at(t0), b = P.at(t1), o = size * 0.35;
          ctx.strokeStyle = rgba(s2 ? mix(vine, [255, 255, 255], 0.3) : vine, alphaAt(t0)); ctx.lineWidth = Math.max(th, size * 0.3);
          ctx.beginPath(); ctx.moveTo(a.x - a.nx * o, a.y - a.ny * o); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2, b.x + b.nx * o, b.y + b.ny * o); ctx.stroke();
        }
      }
      break;
    }
    case 'stars': {
      strokeRect(0, 0, th * 0.6, vine, 0.7);
      for (let i = 0; i < count; i++) { const t = (i + 0.5) / count, q = P.at(t), sz = size * (0.35 + r() * 0.4) * (i % 3 === 0 ? 1.4 : 1);
        ctx.fillStyle = rgba(i % 3 === 0 ? fl : vine, alphaAt(t)); ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + ang, rr = k % 2 ? sz * 0.42 : sz; ctx.lineTo(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'checker': {
      const band = size * 1.2, cells = Math.max(8, Math.round(P.L / band * density * 0.8)), rows = clamp(nLines, 1, 4);
      for (let row = 0; row < rows; row++) for (let i = 0; i < cells; i++) {
        if ((i + row) % 2) continue; const t0 = i / cells, t1 = (i + 1) / cells, a = P.at(t0), b = P.at(t1), o0 = row * band / rows, o1 = (row + 1) * band / rows;
        ctx.fillStyle = rgba(vine, alphaAt(t0)); ctx.beginPath(); ctx.moveTo(a.x + a.nx * o0, a.y + a.ny * o0); ctx.lineTo(b.x + b.nx * o0, b.y + b.ny * o0); ctx.lineTo(b.x + b.nx * o1, b.y + b.ny * o1); ctx.lineTo(a.x + a.nx * o1, a.y + a.ny * o1); ctx.fill();
      }
      strokeRect(0, 0, th * 0.6, vine); strokeRect(band, 0, th * 0.6, vine);
      break;
    }
    case 'scroll': default: {
      strokeRect(size * 0.6, 0, th, vine);
      for (const [cx, cy, a] of [[R.x, R.y, 0], [R.x + R.w, R.y, Math.PI / 2], [R.x + R.w, R.y + R.h, Math.PI], [R.x, R.y + R.h, -Math.PI / 2]]) {
        for (const side of [0, 1]) {
          
          ctx.strokeStyle = rgba(vine, 1); ctx.lineWidth = th; ctx.beginPath();
          const dir = a + (side ? Math.PI / 2 : 0), L = size * 5 * (0.6 + density * 0.4), sgn = side ? -1 : 1;
          for (let i = 0; i <= 60; i++) { const t = i / 60, rr = size * 1.3 * Math.exp(-2.2 * t), th2 = t * Math.PI * 2.4 * sgn;
            const bx = cx + Math.cos(dir) * (size * 0.6 + t * L * 0.6), by = cy + Math.sin(dir) * (size * 0.6 + t * L * 0.6);
            const x = bx + Math.cos(dir + Math.PI / 2 * sgn + th2) * rr, y = by + Math.sin(dir + Math.PI / 2 * sgn + th2) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
          if (p.leaf !== 'none') drawLeaf(ctx, p.leaf, cx + Math.cos(dir) * size * 1.8, cy + Math.sin(dir) * size * 1.8, dir + sgn * (Math.PI / 3 - ang * 0.3), lsz, lf, r);
        }
        flowerAt(cx + Math.cos(a + Math.PI / 4) * size * 0.9, cy + Math.sin(a + Math.PI / 4) * size * 0.9, 0.5, 1.1);
      }
    }
  }
  ctx.restore();
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}







export const TREE_SPECIES = [
  ['oak', '1. 橡树', { depth: 6, kids: 2, spread: 0.75, decay: 0.72, tropism: 0.05, trunk: 0.32, taper: 0.66, leafAt: 4, leaf: 'oval', leafCol: '#4f7f2e', bark: '#5a4632', twist: 0.35 }],
  ['maple', '2. 枫树', { depth: 7, kids: 2, spread: 0.6, decay: 0.75, tropism: 0.18, trunk: 0.3, taper: 0.68, leafAt: 4, leaf: 'maple', leafCol: '#c8452a', bark: '#4a3a2e', twist: 0.3 }],
  ['cherry', '3. 樱花', { depth: 7, kids: 2, spread: 0.7, decay: 0.74, tropism: 0.08, trunk: 0.28, taper: 0.64, leafAt: 3, leaf: 'blossom', leafCol: '#f4b6c8', bark: '#3d2c2a', twist: 0.45 }],
  ['pine', '4. 松树', { special: 'conifer', depth: 3, kids: 2, spread: 1.2, decay: 0.6, tropism: -0.05, trunk: 0.95, taper: 0.8, leafAt: 1, leaf: 'needle', leafCol: '#2f5a33', bark: '#4b3526', twist: 0.1 }],
  ['poplar', '5. 白杨', { depth: 7, kids: 2, spread: 0.28, decay: 0.8, tropism: 0.45, trunk: 0.25, taper: 0.7, leafAt: 3, leaf: 'heart', leafCol: '#7a9d3c', bark: '#8a8373', twist: 0.2 }],
  ['willow', '6. 柳树', { depth: 6, kids: 3, spread: 0.7, decay: 0.72, tropism: -0.3, trunk: 0.35, taper: 0.62, leafAt: 3, leaf: 'willow', leafCol: '#8db34a', bark: '#4d4030', twist: 0.3, droop: true }],
  ['birch', '7. 白桦', { depth: 6, kids: 2, spread: 0.45, decay: 0.76, tropism: 0.25, trunk: 0.4, taper: 0.72, leafAt: 3, leaf: 'oval', leafCol: '#9cbf45', bark: '#e8e4dc', twist: 0.25, stripes: true }],
  ['palm', '8. 棕榈', { special: 'palm', depth: 1, kids: 0, spread: 0, decay: 0, tropism: 0, trunk: 0.8, taper: 0.9, leafAt: 0, leaf: 'frond', leafCol: '#4c8a2f', bark: '#8b6d48', twist: 0 }],
  ['shrub', '9. 灌木', { depth: 5, kids: 4, spread: 0.9, decay: 0.7, tropism: 0.1, trunk: 0.06, taper: 0.6, leafAt: 2, leaf: 'oval', leafCol: '#557f35', bark: '#4a3b2b', twist: 0.4, bush: true }],
  ['dead', '10. 枯树', { depth: 7, kids: 2, spread: 0.8, decay: 0.72, tropism: 0.05, trunk: 0.3, taper: 0.62, leafAt: 99, leaf: 'none', leafCol: '#000000', bark: '#3b322b', twist: 0.55 }],
];
export const TREE_DEFAULTS = {
  species: 'oak', light: 45, leafAmount: 60, leafSize: 100, branchHeight: 100, branchThick: 100, defaultLeaves: true, leafType: 'oval', seed: 5,
  tilt: 0, customLeafColor: false, leafColor: '#4f7f2e', customBranchColor: false, branchColor: '#5a4632', flatShade: false, leafContrast: 30, arrange: 50,
};
export function renderTree(ctx, W, H, p0, anchors) {
  const p = { ...TREE_DEFAULTS, ...p0 };
  const sp = (TREE_SPECIES.find(s => s[0] === p.species) || TREE_SPECIES[0])[2];
  const spots = anchors && anchors.length ? anchors : [{ x: W / 2, y: H * 0.96, h: H * 0.8 }];
  spots.forEach((s, i) => oneTree(ctx, s.x, s.y, s.h || H * 0.8, p, sp, rng((p.seed || 1) * 7919 + i * 101)));
}
function oneTree(ctx, x0, y0, height, p, sp, r) {
  const lightA = (p.light == null ? 45 : p.light) * Math.PI / 180;           
  const lx = Math.cos(lightA), tilt = clamp(p.tilt / 100, 0, 1);
  const bark = hexRgb(p.customBranchColor ? p.branchColor : sp.bark);
  const leafCol = hexRgb(p.customLeafColor ? p.leafColor : sp.leafCol);
  const leafType = p.defaultLeaves ? sp.leaf : p.leafType;
  const thick = p.branchThick / 100, hK = p.branchHeight / 100, leafAmt = clamp(p.leafAmount / 100, 0, 1), leafSz = p.leafSize / 100;
  const contrast = clamp(p.leafContrast / 100, 0, 1), arr = (p.arrange - 50) / 50;
  const vy = 1 - tilt * 0.5;                                                   
  const trunkLen = height * sp.trunk * hK, baseW = height * 0.045 * thick * (sp.bush ? 0.6 : 1);
  const branches = [], leaves = [];
  
  const crown0 = height * (1 - sp.trunk) * hK * (1 - sp.decay) * 0.95;
  
  const grow = (x, y, ang, len, wid, depth) => {
    const segs = Math.max(2, Math.round(len / 12));
    let cx = x, cy = y, a = ang;
    const pts = [[cx, cy, wid]];
    for (let s = 1; s <= segs; s++) {
      a += (r() - 0.5) * sp.twist * 0.35;
      
      const target = sp.tropism >= 0 ? -Math.PI / 2 : Math.PI / 2, k = Math.abs(sp.tropism) * 0.12 * (sp.droop ? depth / 3 : 1);
      a += Math.atan2(Math.sin(target - a), Math.cos(target - a)) * k;
      cx += Math.cos(a) * len / segs; cy += Math.sin(a) * len / segs * vy;
      pts.push([cx, cy, wid * lerp(1, sp.taper, s / segs)]);
    }
    branches.push({ pts, depth });
    const endW = wid * sp.taper;
    if (depth >= sp.leafAt && leafType !== 'none') {
      const n = Math.round((sp.droop ? 8 : 4) * leafAmt * (depth >= sp.depth ? 1.6 : 0.6));
      for (let i = 0; i < n; i++) { const t = 0.3 + r() * 0.7, q = pts[Math.floor(t * (pts.length - 1))]; leaves.push({ x: q[0] + (r() - 0.5) * len * 0.3, y: q[1] + (r() - 0.5) * len * 0.3, a: a + (r() - 0.5) * 2.4 + (sp.droop ? 1.2 : 0), s: (0.7 + r() * 0.6) }); }
    }
    if (depth >= sp.depth || len < 4) return;
    const kids = sp.kids + (r() < 0.3 ? 1 : 0) - (depth > 4 && r() < 0.3 ? 1 : 0);
    for (let i = 0; i < kids; i++) {
      const off = kids === 1 ? 0 : (i / (kids - 1) - 0.5) * 2;
      const na = a + off * sp.spread * (1 + arr * 0.4) + (r() - 0.5) * 0.4;
      grow(cx, cy, na, (depth === 0 ? crown0 : len * sp.decay) * (0.85 + r() * 0.3), endW * (0.75 + r() * 0.15), depth + 1);
    }
    if (depth < 3 && r() < 0.6) grow(pts[Math.floor(pts.length / 2)][0], pts[Math.floor(pts.length / 2)][1], a + (r() < 0.5 ? -1 : 1) * sp.spread * 1.2, len * sp.decay * 0.7, wid * 0.55, depth + 2);
  };
  if (sp.special === 'conifer') {
    
    const top = [x0, y0 - trunkLen * vy];
    branches.push({ pts: [[x0, y0, baseW], [top[0], top[1], baseW * 0.15]], depth: 0 });
    const whorls = Math.round(10 + 6 * leafAmt);
    for (let i = 1; i < whorls; i++) {
      const t = 0.12 + 0.88 * i / whorls, y = y0 - trunkLen * t * vy, L = height * 0.35 * (1 - t) * (0.8 + r() * 0.4);
      for (const side of [-1, 1]) {
        const a = side < 0 ? Math.PI + 0.25 + r() * 0.15 : -0.25 - r() * 0.15, pts = [];
        for (let s = 0; s <= 6; s++) { const u = s / 6; pts.push([x0 + Math.cos(a) * L * u * -(-1), y + (Math.sin(a) * L * u + u * u * L * 0.25) * vy, baseW * 0.3 * (1 - u)]); }
        branches.push({ pts, depth: 2 });
        const n = Math.round(90 * leafAmt * (0.4 + (1 - t)));
        for (let k = 0; k < n; k++) { const u = 0.1 + r() * 0.9, q = pts[Math.min(6, Math.round(u * 6))]; leaves.push({ x: q[0] + (r() - 0.5) * 8, y: q[1] + (r() - 0.5) * 8, a: (side < 0 ? Math.PI : 0) + (r() - 0.5) * 2.6 + 0.6, s: 1.4 + r() * 0.8 }); }
      }
    }
  } else if (sp.special === 'palm') {
    
    const pts = [], lean = (r() - 0.5) * 0.6;
    for (let s = 0; s <= 16; s++) { const t = s / 16; pts.push([x0 + Math.sin(t * 1.4) * trunkLen * 0.18 * (lean > 0 ? 1 : -1) + lean * trunkLen * t * 0.2, y0 - trunkLen * t * vy, baseW * lerp(1, 0.75, t)]); }
    branches.push({ pts, depth: 0, rings: true });
    const top = pts[pts.length - 1], nf = Math.round(7 + 5 * leafAmt);
    for (let i = 0; i < nf; i++) {
      const a = -Math.PI / 2 + (i / (nf - 1) - 0.5) * Math.PI * 1.7 + (r() - 0.5) * 0.2, L = height * 0.3 * leafSz * (0.8 + r() * 0.3), fp = [];
      for (let s = 0; s <= 12; s++) { const u = s / 12; fp.push([top[0] + Math.cos(a) * L * u, top[1] + (Math.sin(a) * L * u + u * u * L * 0.55) * vy]); }
      leaves.push({ frond: fp, s: 1 });
    }
  } else {
    
    grow(x0, y0, -Math.PI / 2 + (r() - 0.5) * 0.08, trunkLen, baseW, 0);
    if (!sp.bush) {
      
      const b0 = branches[0], top = b0.pts[b0.pts.length - 1];
      grow(top[0], top[1], -Math.PI / 2 + (r() - 0.5) * 0.3, crown0, top[2] * 0.85, 1);
    } else {
      for (let i = 0; i < 5; i++) grow(x0 + (r() - 0.5) * baseW * 4, y0, -Math.PI / 2 + (i / 4 - 0.5) * 1.3, crown0 * 0.75, baseW * 0.7, 1);
    }
  }
  
  const shadeCol = (c, k) => (p.flatShade ? c : mix(c, k > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(k)));
  for (const b of branches.sort((a, b) => a.depth - b.depth)) {
    const P = b.pts;
    for (let s = 1; s < P.length; s++) {
      const [xa, ya, wa] = P[s - 1], [xb, yb, wb] = P[s], dx = xb - xa, dy = yb - ya, n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      const g = ctx.createLinearGradient(xa + nx * wa, ya + ny * wa, xa - nx * wa, ya - ny * wa);
      const lit = nx * lx;                                             
      g.addColorStop(0, rgba(shadeCol(bark, 0.35 * Math.sign(lit || 1) * Math.min(1, Math.abs(lit) + 0.3)), 1));
      g.addColorStop(0.5, rgba(bark, 1));
      g.addColorStop(1, rgba(shadeCol(bark, -0.4 * Math.sign(lit || 1) * Math.min(1, Math.abs(lit) + 0.3)), 1));
      ctx.fillStyle = p.flatShade ? rgba(bark, 1) : g;
      ctx.beginPath(); ctx.moveTo(xa + nx * wa / 2, ya + ny * wa / 2); ctx.lineTo(xb + nx * wb / 2, yb + ny * wb / 2); ctx.lineTo(xb - nx * wb / 2, yb - ny * wb / 2); ctx.lineTo(xa - nx * wa / 2, ya - ny * wa / 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(xb, yb, wb / 2, 0, 7); ctx.fill();
      if (sp.stripes && b.depth < 2 && r() < 0.5) { ctx.fillStyle = 'rgba(40,35,30,.8)'; ctx.fillRect(xa - wa * 0.3 + r() * wa * 0.3, ya, wa * 0.4, Math.max(1, wa * 0.12)); }
      if (b.rings && s % 1 === 0) { ctx.strokeStyle = rgba(mix(bark, [0, 0, 0], 0.35), 0.8); ctx.lineWidth = Math.max(1, wa * 0.08); ctx.beginPath(); ctx.moveTo(xa + nx * wa / 2, ya + ny * wa / 2); ctx.quadraticCurveTo(xa, ya + wa * 0.15, xa - nx * wa / 2, ya - ny * wa / 2); ctx.stroke(); }
    }
  }
  const lsz = height * 0.022 * leafSz * (leafType === 'needle' ? 0.8 : 1) * (leafType === 'blossom' ? 0.8 : 1);
  
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const L of leaves) if (!L.frond) { bx0 = Math.min(bx0, L.x); bx1 = Math.max(bx1, L.x); by0 = Math.min(by0, L.y); by1 = Math.max(by1, L.y); }
  const cxL = (bx0 + bx1) / 2, cyL = (by0 + by1) / 2, rw = Math.max(1, (bx1 - bx0) / 2), rh = Math.max(1, (by1 - by0) / 2);
  const shade = L => { const u = (L.x - cxL) / rw, v = (L.y - cyL) / rh; return clamp(u * Math.cos(lightA) - v * Math.sin(lightA), -1, 1); };
  const sorted = leaves.filter(L => !L.frond).map(L => ({ L, k: shade(L) })).sort((a, b) => a.k - b.k);
  for (const { L, k } of sorted) {
    const col = p.flatShade ? leafCol : mix(leafCol, k > 0 ? [255, 255, 200] : [0, 20, 0], Math.abs(k) * (0.15 + contrast * 0.45) + (r() - 0.5) * 0.1);
    if (leafType === 'blossom') { drawFlower(ctx, 'five', L.x, L.y, lsz * L.s * 0.9, col, L.a); continue; }
    drawLeaf(ctx, leafType, L.x, L.y, L.a, lsz * L.s, col, r);
  }
  for (const L of leaves) if (L.frond) {
    const fp = L.frond;
    ctx.strokeStyle = rgba(mix(leafCol, [0, 0, 0], 0.3), 1); ctx.lineWidth = Math.max(1, baseW * 0.12); ctx.beginPath(); fp.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
    for (let i = 1; i < fp.length; i++) {
      const [xa, ya] = fp[i - 1], [xb, yb] = fp[i], a = Math.atan2(yb - ya, xb - xa), len = height * 0.06 * leafSz * (1 - i / fp.length * 0.6);
      for (const sd of [-1, 1]) drawLeaf(ctx, 'willow', xb, yb, a + sd * 1.0 + 0.35, len, mix(leafCol, [255, 255, 200], sd > 0 ? 0.1 : 0), r);
    }
  }
}
