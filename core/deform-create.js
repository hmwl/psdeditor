















import { computeHomographyQuad, applyHomography, invert3x3 } from './homography.js';
import { rebuildPerspectiveQuads } from './psd-deform.js';

const UNIT = [0, 0, 1, 0, 1, 1, 0, 1];                      
const flatQuad = q => [q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y];
const P = (x, y) => ({ x, y });


export function placementFrom(quad) {
  if (!quad || quad.length !== 4) throw new Error('放置四点缺失，无法新建变形');
  const H = computeHomographyQuad(UNIT, flatQuad(quad));
  const Hinv = H && invert3x3(H);
  if (!H || !Hinv) throw new Error('放置四点退化（面积为 0 或三点共线），无法新建变形');
  return { H, Hinv };
}


export function quadBounds(quad) {
  const xs = quad.map(p => p.x), ys = quad.map(p => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}








export function createPerspectiveDeform(quad, cols = 1, rows = 1) {
  cols = Math.max(1, Math.min(16, cols | 0)); rows = Math.max(1, Math.min(16, rows | 0));
  const { H, Hinv } = placementFrom(quad);
  const vertices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const p = applyHomography(H, i / cols, j / rows);
    vertices.push(P(p.x, p.y));
  }
  const at = (i, j) => j * (cols + 1) + i;
  const quadIdx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
    quadIdx.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);   
  return rebuildPerspectiveQuads({
    kind: 'perspectiveWarp', HplaceInv: Hinv, referenceRect: quadBounds(quad), grid: { cols, rows },
    vertices, warped: vertices.map(p => P(p.x, p.y)), quadIdx,
  });
}






export function resizePerspectiveGrid(deform, cols, rows) {
  if (!deform || deform.kind !== 'perspectiveWarp' || !deform.grid)
    throw new Error('这份透视变形不是规则网格（来自 PSD 的任意面），不能改行列数');
  cols = Math.max(1, Math.min(16, cols | 0)); rows = Math.max(1, Math.min(16, rows | 0));
  const oc = deform.grid.cols, or = deform.grid.rows;
  if (cols === oc && rows === or) return deform;
  const oAt = (i, j) => j * (oc + 1) + i;
  
  const quad = [deform.vertices[oAt(0, 0)], deform.vertices[oAt(oc, 0)],
                deform.vertices[oAt(oc, or)], deform.vertices[oAt(0, or)]];
  const next = createPerspectiveDeform(quad, cols, rows);
  
  const cellH = [];
  for (let j = 0; j < or; j++) for (let i = 0; i < oc; i++) {
    const idx = [oAt(i, j), oAt(i + 1, j), oAt(i + 1, j + 1), oAt(i, j + 1)];
    cellH[j * oc + i] = computeHomographyQuad(UNIT, flatQuad(idx.map(k => deform.warped[k])));
  }
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols * oc, v = j / rows * or;
    const ci = Math.min(oc - 1, Math.floor(u)), cj = Math.min(or - 1, Math.floor(v));
    const Hc = cellH[cj * oc + ci];
    if (!Hc) continue;
    const p = applyHomography(Hc, u - ci, v - cj);
    const k = j * (cols + 1) + i;
    next.warped[k] = P(p.x, p.y);
  }
  return rebuildPerspectiveQuads(next);
}














export function createPuppetDeform(o) {
  const img = o && o.image;
  if (!img || !img.data || !img.width || !img.height) throw new Error('缺少源图像素，无法生成操控变形网格');
  const { H, Hinv } = placementFrom(o.quad);
  const W = img.width | 0, Hh = img.height | 0, data = img.data;
  const cell = Math.max(2, Math.min(256, (o.cell | 0) || Math.max(4, Math.round(Math.max(W, Hh) / 24))));
  const expand = Math.max(0, Math.min(8, o.expand == null ? 1 : o.expand | 0));
  const thr = o.threshold == null ? 10 : o.threshold | 0;
  const cw = Math.max(1, Math.ceil(W / cell)), chh = Math.max(1, Math.ceil(Hh / cell));

  
  let occ = new Uint8Array(cw * chh), any = 0;
  for (let y = 0; y < Hh; y++) {
    const row = y * W * 4, cy = (y / cell) | 0;
    for (let x = 0; x < W; x++) if (data[row + x * 4 + 3] > thr) { occ[cy * cw + ((x / cell) | 0)] = 1; any = 1; }
  }
  if (!any) occ.fill(1);                      
  
  for (let k = 0; k < expand; k++) {
    const next = occ.slice();
    for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) {
      if (occ[cy * cw + cx]) continue;
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < cw && ny < chh && occ[ny * cw + nx]) { hit = 1; break; }
      }
      if (hit) next[cy * cw + cx] = 1;
    }
    occ = next;
  }

  
  const comp = new Int32Array(cw * chh).fill(-1);
  const comps = [];
  for (let s = 0; s < occ.length; s++) {
    if (!occ[s] || comp[s] >= 0) continue;
    const id = comps.length, cells = [s];
    comp[s] = id;
    for (let h = 0; h < cells.length; h++) {
      const c = cells[h], cx = c % cw, cy = (c / cw) | 0;
      const nb = [cx > 0 ? c - 1 : -1, cx < cw - 1 ? c + 1 : -1, cy > 0 ? c - cw : -1, cy < chh - 1 ? c + cw : -1];
      for (const n of nb) if (n >= 0 && occ[n] && comp[n] < 0) { comp[n] = id; cells.push(n); }
    }
    comps.push(cells);
  }
  comps.sort((a, b) => b.length - a.length);
  const maxShapes = Math.max(1, Math.min(256, o.maxShapes | 0 || 64));
  const kept = comps.slice(0, maxShapes);

  
  const corner = (vx, vy) => {
    const p = applyHomography(H, Math.min(vx * cell, W) / W, Math.min(vy * cell, Hh) / Hh);
    return P(p.x, p.y);
  };

  const shapes = kept.map((cells, srcIndex) => {
    const inSet = new Set(cells);
    const vmap = new Map(), orig = [], indices = [];
    const vid = (vx, vy) => {
      const k = vy * (cw + 1) + vx;
      let i = vmap.get(k);
      if (i === undefined) { i = orig.length; vmap.set(k, i); orig.push(corner(vx, vy)); }
      return i;
    };
    for (const c of cells) {
      const cx = c % cw, cy = (c / cw) | 0;
      const a = vid(cx, cy), b = vid(cx + 1, cy), d = vid(cx + 1, cy + 1), e = vid(cx, cy + 1);
      indices.push(a, b, d, a, d, e);
    }
    return {
      srcIndex, orig, def: orig.map(p => P(p.x, p.y)),
      indices: Uint32Array.from(indices), pins: [],
      boundary: traceBoundary(inSet, cw, corner),
    };
  });

  

  return { kind: 'puppetWarp', HplaceInv: Hinv, shapes, fromAlpha: !!any };
}


function traceBoundary(cells, cw, corner) {
  
  const edges = new Map();                        
  const key = (x, y) => x * 100000 + y;
  const add = (x0, y0, x1, y1) => {
    const a = key(x0, y0), b = key(x1, y1), rev = edges.get(b);
    if (rev) { const i = rev.indexOf(a); if (i >= 0) { rev.splice(i, 1); if (!rev.length) edges.delete(b); return; } }
    const cur = edges.get(a); if (cur) cur.push(b); else edges.set(a, [b]);
  };
  for (const c of cells) {
    const cx = c % cw, cy = (c / cw) | 0;
    add(cx, cy, cx + 1, cy); add(cx + 1, cy, cx + 1, cy + 1);
    add(cx + 1, cy + 1, cx, cy + 1); add(cx, cy + 1, cx, cy);
  }
  const loops = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    const pts = [];
    let at = start, guard = 0;
    while (guard++ < 1e5) {
      const outs = edges.get(at);
      if (!outs || !outs.length) break;
      const nxt = outs.pop(); if (!outs.length) edges.delete(at);
      pts.push(at);
      at = nxt;
      if (at === start) break;
    }
    if (pts.length >= 4) loops.push(pts.map(k => corner(Math.floor(k / 100000), k % 100000)));
  }
  
  return loops.map(loop => loop.filter((p, i) => {
    const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
    return Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) > 1e-6;
  })).filter(l => l.length >= 3);
}




export function nearestPuppetVertex(deform, pt) {
  let best = null;
  if (!deform || deform.kind !== 'puppetWarp') return null;
  deform.shapes.forEach((s, j) => s.def.forEach((p, i) => {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (!best || d < best.dist) best = { j, i, dist: d };
  }));
  return best;
}





export function addPuppetPin(deform, pt, maxDist = Infinity) {
  const hit = nearestPuppetVertex(deform, pt);
  if (!hit || hit.dist > maxDist) return null;
  const s = deform.shapes[hit.j];
  if (s.pins.some(p => p.vertex === hit.i)) return null;          
  
  
  
  
  s.pins.push({ orig: P(s.orig[hit.i].x-s.def[hit.i].x+pt.x, s.orig[hit.i].y-s.def[hit.i].y+pt.y),
    pos: P(pt.x,pt.y), vertex: hit.i, rot: 0, depth: 0, rotationMode:'auto' });
  return { j: hit.j, i: s.pins.length - 1 };
}


export function removePuppetPin(deform, j, i) {
  const s = deform && deform.shapes && deform.shapes[j];
  if (!s || !s.pins[i]) return false;
  s.pins.splice(i, 1);
  return true;
}







export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}


export function perspectiveQuadAt(deform, pt, layout = false) {
  if (!deform || deform.kind !== 'perspectiveWarp') return -1;
  for (let i = deform.quadIdx.length - 1; i >= 0; i--) {          
    const poly = deform.quadIdx[i].map(k => (layout ? deform.vertices : deform.warped)[k]);
    if (pointInPoly(pt, poly)) return i;
  }
  return -1;
}








export function addPerspectiveQuad(deform, corners, snap = 8) {
  if (!deform || deform.kind !== 'perspectiveWarp' || !corners || corners.length !== 4) return null;
  const idx = corners.map(p => {
    let best = -1, bd = snap;
    deform.vertices.forEach((v, i) => { const d = Math.hypot(v.x - p.x, v.y - p.y); if (d <= bd) { bd = d; best = i; } });
    if (best >= 0) return best;
    deform.vertices.push(P(p.x, p.y));
    deform.warped.push(P(p.x, p.y));                              
    return deform.vertices.length - 1;
  });
  if (new Set(idx).size !== 4) return null;
  deform.quadIdx.push(idx);
  delete deform.grid;
  rebuildPerspectiveQuads(deform);
  return deform.quadIdx.length - 1;
}

function remapConstrainedSides(deform, map){
  if (!Array.isArray(deform.constrainedSides)) return;
  const seen = new Set();
  deform.constrainedSides = deform.constrainedSides.map(side => side.map(map)).filter(side => {
    if (side.length !== 2 || !side.every(Number.isInteger) || side[0] === side[1]) return false;
    const [a, b] = side;
    const edge = deform.quadIdx.some(q => q.some((k, i) => k === a && (q[(i + 1) % 4] === b || q[(i + 3) % 4] === b)));
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (!edge || seen.has(key)) return false;
    seen.add(key); return true;
  });
}


export function removePerspectiveQuad(deform, qi) {
  if (!deform || deform.kind !== 'perspectiveWarp') return false;
  if (!(qi >= 0 && qi < deform.quadIdx.length)) return false;
  const quads = deform.quadIdx.filter((_, i) => i !== qi);
  const used = new Set(); for (const q of quads) for (const k of q) used.add(k);
  const remap = new Map(); const vertices = [], warped = [];
  deform.vertices.forEach((v, i) => {
    if (!used.has(i)) return;
    remap.set(i, vertices.length);
    vertices.push(P(v.x, v.y)); warped.push(P(deform.warped[i].x, deform.warped[i].y));
  });
  deform.vertices = vertices; deform.warped = warped;
  deform.quadIdx = quads.map(q => q.map(k => remap.get(k)));
  remapConstrainedSides(deform, k => remap.get(k));
  delete deform.grid;
  rebuildPerspectiveQuads(deform);
  return true;
}


export function weldPerspectiveEdges(deform, epsilon = 1e-6) {
  if (!deform || deform.kind !== 'perspectiveWarp' || deform.quadIdx.length < 2) return 0;
  let parents = deform.vertices.map((_, i) => i), welded = 0;
  const root = (p, i) => { while (p[i] !== i) i = p[i]; return i; };
  const equal = (a, b) => Math.hypot(deform.vertices[a].x - deform.vertices[b].x, deform.vertices[a].y - deform.vertices[b].y) <= epsilon;
  const join = (p, a, b) => { const x = root(p, a), y = root(p, b); p[Math.max(x, y)] = Math.min(x, y); };
  for (let i = 0; i < deform.quadIdx.length; i++) for (let j = i + 1; j < deform.quadIdx.length; j++) {
    const a = deform.quadIdx[i], b = deform.quadIdx[j];
    for (let ea = 0; ea < 4; ea++) for (let eb = 0; eb < 4; eb++) {
      const a0 = a[ea], a1 = a[(ea + 1) % 4], b0 = b[eb], b1 = b[(eb + 1) % 4];
      let pairs;
      if (equal(a0, b1) && equal(a1, b0)) pairs = [[a0, b1], [a1, b0]];
      else if (equal(a0, b0) && equal(a1, b1)) pairs = [[a0, b0], [a1, b1]];
      else continue;
      if (pairs.every(([x, y]) => root(parents, x) === root(parents, y))) continue;
      const next = parents.slice(); pairs.forEach(([x, y]) => join(next, x, y));
      
      if (deform.quadIdx.some(q => new Set(q.map(k => root(next, k))).size !== 4)) continue;
      parents = next; welded++;
    }
  }
  if (!welded) return 0;
  const remap = new Map(), vertices = [], warped = [];
  const index = k => {
    const r = root(parents, k);
    if (!remap.has(r)) { remap.set(r, vertices.length); vertices.push(P(deform.vertices[r].x, deform.vertices[r].y)); warped.push(P(deform.warped[r].x, deform.warped[r].y)); }
    return remap.get(r);
  };
  deform.quadIdx = deform.quadIdx.map(q => q.map(index));
  remapConstrainedSides(deform, k => remap.get(root(parents, k)));
  deform.vertices = vertices; deform.warped = warped; delete deform.grid;
  rebuildPerspectiveQuads(deform);
  return welded;
}
