






















const SQ = [0, 1 / 3, 2 / 3, 1];





export function warpMesh(o, W, H) {
  const vertical = !!o.vertical;
  if (vertical) {
    const m = warpMesh({ ...o, vertical: false }, H, W);
    
    const out = new Array(16);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const p = m[i * 4 + j]; out[j * 4 + i] = [p[1], p[0]]; }
    return out;
  }
  const b = Math.max(-1, Math.min(1, +o.bend || 0));
  const P = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) P.push([SQ[i] * W, SQ[j] * H]);
  const at = (i, j) => P[j * 4 + i];
  const th = Math.abs(b) * Math.PI;
  
  const arcRow = (x0, x1, y, dir) => {
    if (th < 1e-6) return [[x0, y], [x0 + (x1 - x0) / 3, y], [x0 + (x1 - x0) * 2 / 3, y], [x1, y]];
    const c = (x1 - x0) / 2, R = c / Math.sin(th / 2), cx = (x0 + x1) / 2, cy = y - dir * R * Math.cos(th / 2);
    const k = 4 / 3 * Math.tan(th / 4) * R;
    const p0 = [x0, y], p3 = [x1, y];
    
    const t0 = [Math.cos(th / 2), dir * Math.sin(th / 2)], t1 = [Math.cos(th / 2), -dir * Math.sin(th / 2)];
    void cx; void cy;
    return [p0, [p0[0] + t0[0] * k, p0[1] + t0[1] * k], [p3[0] - t1[0] * k, p3[1] - t1[1] * k], p3];
  };
  const setRow = (j, row) => { for (let i = 0; i < 4; i++) P[j * 4 + i] = row[i].slice(); };
  const lerpRows = (j0, j1) => {            
    for (let j = j0 + 1; j < j1; j++) { const f = (j - j0) / (j1 - j0); for (let i = 0; i < 4; i++) { const a = at(i, j0), c = at(i, j1); P[j * 4 + i] = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f]; } }
  };
  const sgn = b >= 0 ? 1 : -1;
  const sag = th < 1e-6 ? 0 : (W / 2) * (1 - Math.cos(th / 2)) / Math.sin(th / 2);   
  switch (o.style) {
    case 'warpArc': {
      if (th < 1e-6) break;
      const Rm = W / th;                                   
      for (let j = 0; j < 4; j++) {
        const r = Rm + H / 2 - SQ[j] * H;                   
        const k = 4 / 3 * Math.tan(th / 4) * r;
        const cx = W / 2, cy = H / 2 + Rm;
        const p = ph => [cx + r * Math.sin(ph), cy - r * Math.cos(ph)];
        const tg = ph => [Math.cos(ph), Math.sin(ph)];
        const a0 = -th / 2, a1 = th / 2, p0 = p(a0), p3 = p(a1), t0 = tg(a0), t1 = tg(a1);
        setRow(j, [p0, [p0[0] + t0[0] * k, p0[1] + t0[1] * k], [p3[0] - t1[0] * k, p3[1] - t1[1] * k], p3]);
      }
      if (b < 0) { 
        const Q = P.map(p => [p[0], H - p[1]]);
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) P[j * 4 + i] = Q[(3 - j) * 4 + i];
      }
      break;
    }
    case 'warpArcLower': setRow(3, arcRow(0, W, H, sgn)); lerpRows(0, 3); break;
    case 'warpArcUpper': setRow(0, arcRow(0, W, 0, -sgn)); lerpRows(0, 3); break;
    case 'warpArch': {
      const top = arcRow(0, W, 0, -sgn);
      for (let j = 0; j < 4; j++) setRow(j, top.map(p => [p[0], p[1] + SQ[j] * H]));
      break;
    }
    case 'warpBulge': setRow(0, arcRow(0, W, 0, -sgn)); setRow(3, arcRow(0, W, H, sgn)); lerpRows(0, 3); break;
    case 'warpShellLower': case 'warpShellUpper': {
      const lower = o.style === 'warpShellLower';
      const j = lower ? 3 : 0, d = lower ? 1 : -1;
      
      const y = lower ? H : 0, s = sag * sgn;
      setRow(j, [[0, y + d * s], [W / 3, y - d * s * 2 / 3], [W * 2 / 3, y - d * s * 2 / 3], [W, y + d * s]]);
      lerpRows(0, 3);
      break;
    }
    case 'warpFlag': {
      const a = b * H * 1.5;                                
      for (let j = 0; j < 4; j++) { at(1, j)[1] -= a; at(2, j)[1] += a; }
      break;
    }
    case 'warpWave': {
      const a = b * H * 1.5;
      for (let j = 0; j < 4; j++) {
        const ph = (SQ[j] - 0.5) * 2;                       
        at(1, j)[1] -= a; at(2, j)[1] += a;
        at(1, j)[0] += a * 0.25 * ph; at(2, j)[0] += a * 0.25 * ph;
      }
      break;
    }
    case 'warpFish': {
      const a = b * H * 1.2;
      at(1, 0)[1] -= a; at(2, 0)[1] += a;                   
      at(1, 3)[1] += a; at(2, 3)[1] -= a;                   
      lerpRows(0, 3);
      break;
    }
    case 'warpRise': {
      const a = b * H * 0.75;
      for (let j = 0; j < 4; j++) { at(0, j)[1] += a; at(1, j)[1] += a; at(2, j)[1] -= a; at(3, j)[1] -= a; }
      break;
    }
    case 'warpFisheye': {
      const k = b * 2.4;                                    
      for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) { const p = at(i, j); p[0] = W / 2 + (p[0] - W / 2) * (1 + k); p[1] = H / 2 + (p[1] - H / 2) * (1 + k); }
      break;
    }
    case 'warpInflate': {
      const sx = b * H * 0.9, sy = b * W * 0.1;
      for (const i of [1, 2]) { at(i, 0)[1] -= sx; at(i, 3)[1] += sx; at(i, 1)[1] -= sx * 0.5; at(i, 2)[1] += sx * 0.5; }
      for (const j of [1, 2]) { at(0, j)[0] -= sy; at(3, j)[0] += sy; at(1, j)[0] -= sy * 0.5; at(2, j)[0] += sy * 0.5; }
      break;
    }
    case 'warpSqueeze': {
      const sx = b * H * 0.5, sy = b * W * 0.1;
      for (const i of [1, 2]) { at(i, 0)[1] += sx; at(i, 3)[1] -= sx; at(i, 1)[1] += sx * 0.5; at(i, 2)[1] -= sx * 0.5; }
      for (const j of [1, 2]) { at(0, j)[0] -= sy; at(3, j)[0] += sy; }
      break;
    }
    case 'warpTwist': {
      const rot = (p, a) => { const c = Math.cos(a), s = Math.sin(a), dx = (p[0] - W / 2) / W, dy = (p[1] - H / 2) / H;
        
        return [W / 2 + (dx * c - dy * s) * W, H / 2 + (dx * s + dy * c) * H]; };
      const A = b * Math.PI / 4;
      for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) P[j * 4 + i] = rot(at(i, j), A);
      for (const [i, j] of [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]]) P[j * 4 + i] = rot(at(i, j), A / 2);
      break;
    }
    default: break;
  }
  
  const hh = Math.max(-1, Math.min(1, +o.h || 0)), vv = Math.max(-1, Math.min(1, +o.v || 0));
  if (hh || vv) {
    let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    for (const p of P) { L = Math.min(L, p[0]); R = Math.max(R, p[0]); T = Math.min(T, p[1]); B = Math.max(B, p[1]); }
    const cx = (L + R) / 2, cy = (T + B) / 2, w = R - L || 1, h = B - T || 1;
    for (const p of P) {
      const u = (p[0] - L) / w, v = (p[1] - T) / h;
      
      if (hh) { const s = 1 + hh * (u - 0.5); p[1] = cy + (p[1] - cy) * s; }
      if (vv) { const s = 1 + vv * (v - 0.5); p[0] = cx + (p[0] - cx) * s; }
    }
  }
  return P;
}


export function evalMesh(P, u, v) {
  const bu = bern(u), bv = bern(v);
  let x = 0, y = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const w = bu[i] * bv[j], p = P[j * 4 + i]; x += w * p[0]; y += w * p[1]; }
  return [x, y];
}
const bern = t => { const m = 1 - t; return [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t]; };






export function warpMap({ style = 'warpNone', bend = 0, h = 0, v: vd = 0, vertical = false, aspect = 1 } = {}) {
  if (style === 'warpNone' && !h && !vd) return (u, v) => [u, v];
  const W = Math.max(1e-6, aspect), H = 1;
  const P = warpMesh({ style, bend, h, v: vd, vertical }, W, H);
  return (u, v) => { const [x, y] = evalMesh(P, u, v); return [x / W, y / H]; };
}


export const WARP_STYLES = [
  ['warpNone', '无'], ['warpArc', '扇形'], ['warpArcLower', '下弧'], ['warpArcUpper', '上弧'],
  ['warpArch', '拱形'], ['warpBulge', '凸起'], ['warpShellLower', '贝壳'], ['warpShellUpper', '花冠'],
  ['warpFlag', '旗帜'], ['warpWave', '波浪'], ['warpFish', '鱼形'], ['warpRise', '增加'],
  ['warpFisheye', '鱼眼'], ['warpInflate', '膨胀'], ['warpSqueeze', '挤压'], ['warpTwist', '扭转'],
];
