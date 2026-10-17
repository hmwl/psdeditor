













import { computeHomographyQuad, applyHomography } from './homography.js';
import { applyPuppetPinsNative } from './puppet-solve.js';

export const FILTER_IDS = { perspectiveWarp: 714, puppetWarp: 687 };
export const puppetRotationMode = p => p.rotationMode || ((+p.rot || 0) ? 'fixed' : 'auto');
const pinCopy = p => ({ orig: { ...p.orig }, pos: { ...p.pos }, vertex:p.vertex, rot:+p.rot || 0, depth:+p.depth || 0, rotationMode:puppetRotationMode(p) });
const shapeMeta = s => Object.fromEntries(['meshRigidity','meshQuality','meshExpansion'].filter(k=>s[k]!=null).map(k=>[k,s[k]]));








const stackMeta = d => ({
  ...(d.at != null ? { at: d.at } : {}),
  ...(d.enabled != null ? { enabled: !!d.enabled } : {}),
  ...(d.name != null ? { name: d.name } : {}),
});


export function deformToJSON(d) {
  if (!d) return null;
  if (d.kind === 'perspectiveWarp')
    return { kind: d.kind, HplaceInv: d.HplaceInv, vertices: d.vertices, warped: d.warped, quadIdx: d.quadIdx,
             ...(d.constrainedSides ? { constrainedSides: d.constrainedSides.map(q => q.slice()) } : {}),
             ...(d.referenceRect ? { referenceRect: { ...d.referenceRect } } : {}),
             ...stackMeta(d), ...(d.grid ? { grid: { cols: d.grid.cols, rows: d.grid.rows } } : {}) };
  if (d.kind === 'puppetWarp')
    return { kind: d.kind, HplaceInv: d.HplaceInv, ...stackMeta(d), shapes: d.shapes.map(s => ({
      srcIndex: s.srcIndex, ...shapeMeta(s), orig: s.orig, def: s.def, indices: Array.from(s.indices), pins: s.pins,
      ...(s.boundary ? { boundary: s.boundary } : {}) })) };
  return d;
}


export function deformFromJSON(j) {
  if (!j) return null;
  if (j.kind === 'perspectiveWarp')
    return rebuildPerspectiveQuads({ kind: j.kind, HplaceInv: j.HplaceInv, ...stackMeta(j), vertices: j.vertices.map(p => ({ x: p.x, y: p.y })),
      warped: j.warped.map(p => ({ x: p.x, y: p.y })), quadIdx: j.quadIdx.map(q => q.slice()),
      ...(j.constrainedSides ? { constrainedSides: j.constrainedSides.map(q => q.slice()) } : {}),
      ...(j.referenceRect ? { referenceRect: { ...j.referenceRect } } : {}),
      ...(j.grid ? { grid: { cols: j.grid.cols, rows: j.grid.rows } } : {}) });
  if (j.kind === 'puppetWarp')
    return { kind: j.kind, HplaceInv: j.HplaceInv, ...stackMeta(j), shapes: j.shapes.map(s => ({
      srcIndex: s.srcIndex, ...shapeMeta(s), orig: s.orig.map(p => ({ x: p.x, y: p.y })), def: s.def.map(p => ({ x: p.x, y: p.y })),
      indices: s.indices instanceof Uint32Array ? s.indices : Uint32Array.from(s.indices),
      pins: s.pins.map(pinCopy),
      ...(s.boundary ? { boundary: s.boundary.map(l => l.map(p => ({ x: p.x, y: p.y }))) } : {}) })) };
  return j;
}








export function perspectiveQuads(d) {
  if (Array.isArray(d.quadIdx))
    return d.quadIdx.map(idx => ({ src: idx.map(i => d.vertices[i]), dst: idx.map(i => d.warped[i]) }));
  return d.quads || [];
}


export function rebuildPerspectiveQuads(d) {
  d.quads = d.quadIdx.map(idx => ({ src: idx.map(i => d.vertices[i]), dst: idx.map(i => d.warped[i]) }));
  return d;
}














export const MLS_MODES = ['rigid', 'similarity', 'affine'];

export function mlsDeform(v, src, dst, mode = 'rigid') {
  const n = src.length;
  if (!n) return { x: v.x, y: v.y };
  if (n === 1) return { x: v.x + dst[0].x - src[0].x, y: v.y + dst[0].y - src[0].y };
  let sw = 0, px = 0, py = 0, qx = 0, qy = 0;
  const w = new Array(n);
  for (let i = 0; i < n; i++) {
    const dx = v.x - src[i].x, dy = v.y - src[i].y, d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) return { x: dst[i].x, y: dst[i].y };
    w[i] = 1 / d2; sw += w[i];
    px += w[i] * src[i].x; py += w[i] * src[i].y; qx += w[i] * dst[i].x; qy += w[i] * dst[i].y;
  }
  px /= sw; py /= sw; qx /= sw; qy /= sw;
  const rx = v.x - px, ry = v.y - py;
  if (mode === 'affine') {
    
    let a = 0, b = 0, d = 0, e = 0, f = 0, g = 0, h = 0;
    for (let i = 0; i < n; i++) {
      const ax = src[i].x - px, ay = src[i].y - py, bx = dst[i].x - qx, by = dst[i].y - qy;
      a += w[i] * ax * ax; b += w[i] * ax * ay; d += w[i] * ay * ay;
      e += w[i] * ax * bx; f += w[i] * ax * by; g += w[i] * ay * bx; h += w[i] * ay * by;
    }
    const det = a * d - b * b;
    if (Math.abs(det) > 1e-12) {
      const i00 = d / det, i01 = -b / det, i11 = a / det;          
      const m00 = i00 * e + i01 * g, m01 = i00 * f + i01 * h;
      const m10 = i01 * e + i11 * g, m11 = i01 * f + i11 * h;
      return { x: qx + rx * m00 + ry * m10, y: qy + rx * m01 + ry * m11 };
    }
    
    mode = 'similarity';
  }
  
  let dot = 0, cross = 0, mu = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i].x - px, ay = src[i].y - py, bx = dst[i].x - qx, by = dst[i].y - qy;
    dot += w[i] * (ax * bx + ay * by); cross += w[i] * (ax * by - ay * bx);
    mu += w[i] * (ax * ax + ay * ay);
  }
  const th = (Math.abs(dot) < 1e-12 && Math.abs(cross) < 1e-12) ? 0 : Math.atan2(cross, dot);
  const k = mode === 'similarity' && mu > 1e-12 ? Math.hypot(dot, cross) / mu : 1;
  const c = Math.cos(th) * k, s = Math.sin(th) * k;
  return { x: qx + rx * c - ry * s, y: qy + rx * s + ry * c };
}


export function mlsRigid(v, src, dst, mode = 'rigid') { return mlsDeform(v, src, dst, mode); }




export function applyPuppetPins(shape, base, opts = {}) {
  return applyPuppetPinsNative(shape, base, opts);
}


export function cloneDeform(d) {
  if (!d) return d;
  if (d.kind === 'perspectiveWarp') {
    const c = { kind: d.kind, HplaceInv: d.HplaceInv, ...stackMeta(d), vertices: d.vertices.map(p => ({ x: p.x, y: p.y })),
                warped: d.warped.map(p => ({ x: p.x, y: p.y })), quadIdx: d.quadIdx.map(q => q.slice()),
                ...(d.constrainedSides ? { constrainedSides: d.constrainedSides.map(q => q.slice()) } : {}),
                ...(d.referenceRect ? { referenceRect: { ...d.referenceRect } } : {}),
                ...(d.grid ? { grid: { cols: d.grid.cols, rows: d.grid.rows } } : {}) };
    return rebuildPerspectiveQuads(c);
  }
  if (d.kind === 'puppetWarp') {
    return { kind: d.kind, HplaceInv: d.HplaceInv, ...stackMeta(d),
      
      ...(d.fromAlpha === undefined ? {} : { fromAlpha: d.fromAlpha }),
      shapes: d.shapes.map(s => ({
      srcIndex: s.srcIndex, ...shapeMeta(s), orig: s.orig, indices: s.indices, boundary: s.boundary,
      def: s.def.map(p => ({ x: p.x, y: p.y })),
      pins: s.pins.map(pinCopy) })) };
  }
  return d;
}


export function deformEquals(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if ((a.enabled !== false) !== (b.enabled !== false) || (a.name || '') !== (b.name || '')) return false;
  const eq = (p, q) => Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3;   
  if (a.kind === 'perspectiveWarp') return a.vertices.length === b.vertices.length && a.vertices.every((p, i) => eq(p, b.vertices[i]))
    && a.warped.length === b.warped.length && a.warped.every((p, i) => eq(p, b.warped[i]))
    && a.quadIdx.length === b.quadIdx.length && a.quadIdx.every((q, i) => q.length === b.quadIdx[i].length && q.every((v, k) => v === b.quadIdx[i][k]))
    && (a.constrainedSides || []).length === (b.constrainedSides || []).length
    && (a.constrainedSides || []).every((q, i) => q.length === b.constrainedSides[i].length && q.every((v, k) => v === b.constrainedSides[i][k]));
  return a.shapes.length === b.shapes.length && a.shapes.every((s, j) => {
    const t = b.shapes[j];
    return (s.meshRigidity ?? 2) === (t.meshRigidity ?? 2) && s.def.length === t.def.length && s.def.every((p, i) => eq(p, t.def[i])) && s.pins.length === t.pins.length && s.pins.every((p, i) => {
      const q = t.pins[i];
      return eq(p.pos, q.pos) && eq(p.orig, q.orig) && p.vertex === q.vertex
        && puppetRotationMode(p) === puppetRotationMode(q)
        && Math.abs((+p.rot || 0) - (+q.rot || 0)) < 1e-3 && Math.abs((+p.depth || 0) - (+q.depth || 0)) < 1e-3;
    });
  });
}











export function buildDeformMesh(deform, subdiv = 12, opts = {}) {
  const positions = [], uvs = [], indices = [];
  



  const docUV = opts.docUV && opts.docUV.width > 0 && opts.docUV.height > 0 ? opts.docUV : null;
  const Hinv = deform.HplaceInv;                    
  if (!Hinv && !docUV) throw new Error('deform 缺少放置单应 HplaceInv');
  const toUV = docUV ? (x, y) => ({ x: (x - (docUV.left || 0)) / docUV.width, y: (y - (docUV.top || 0)) / docUV.height })
                     : (x, y) => applyHomography(Hinv, x, y);
  const push = (pos, uv) => { positions.push(pos.x, pos.y); uvs.push(uv.x, uv.y); };

  if (deform.kind === 'puppetWarp') {
    for (const s of deform.shapes) {
      const base = positions.length / 2;
      for (let i = 0; i < s.orig.length; i++) {
        push(s.def[i], toUV(s.orig[i].x, s.orig[i].y));
      }
      for (let k = 0; k + 2 < s.indices.length; k += 3) {
        indices.push(base + s.indices[k], base + s.indices[k + 1], base + s.indices[k + 2]);
      }
    }
  } else if (deform.kind === 'perspectiveWarp') {
    
    
    
    const flat = pts => pts.flatMap(p => [p.x, p.y]);
    const quads = perspectiveQuads(deform);
    const sb = opts.sourceBounds;
    const domain = opts.sourceQuad || (sb ? [{ x: sb.left, y: sb.top }, { x: sb.right, y: sb.top },
      { x: sb.right, y: sb.bottom }, { x: sb.left, y: sb.bottom }] : null);
    const N = Math.max(1, subdiv | 0);
    for (let qi = 0; qi < quads.length; qi++) {
      const q = quads[qi];
      const Hs = computeHomographyQuad([0, 0, 1, 0, 1, 1, 0, 1], flat(q.src));
      const Hd = computeHomographyQuad([0, 0, 1, 0, 1, 1, 0, 1], flat(q.dst));
      if (!Hs || !Hd) continue;
      if (domain) {
        const Hmap = computeHomographyQuad(flat(q.src), flat(q.dst));
        if (!Hmap) continue;
        let polygon = domain.map(p => ({ x: p.x, y: p.y }));
        const center = q.src.reduce((p, v) => ({ x: p.x + v.x / 4, y: p.y + v.y / 4 }), { x: 0, y: 0 });
        const same = (a, b) => Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5;
        for (let edge = 0; edge < 4 && polygon.length; edge++) {
          const a = q.src[edge], b = q.src[(edge + 1) % 4];
          const shared = quads.some((other, oi) => oi !== qi && other.src.some((p, j) => {
            const next = other.src[(j + 1) % 4];
            return (same(a, p) && same(b, next)) || (same(a, next) && same(b, p));
          }));
          if (!shared) continue;
          const cross = p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
          const side = cross(center) >= 0 ? 1 : -1, clipped = [];
          for (let j = 0; j < polygon.length; j++) {
            const p = polygon[j], r = polygon[(j + 1) % polygon.length], dp = cross(p) * side, dr = cross(r) * side;
            if (dp >= -1e-7) clipped.push(p);
            if ((dp >= 0) !== (dr >= 0)) {
              const t = dp / (dp - dr);
              clipped.push({ x: p.x + t * (r.x - p.x), y: p.y + t * (r.y - p.y) });
            }
          }
          polygon = clipped;
        }
        for (let f = 1; f + 1 < polygon.length; f++) {
          const triangle = [polygon[0], polygon[f], polygon[f + 1]], rows = [];
          for (let j = 0; j <= N; j++) {
            const row = [];
            for (let i = 0; i <= N - j; i++) {
              const u = i / N, v = j / N, p = { x: triangle[0].x * (1 - u - v) + triangle[1].x * u + triangle[2].x * v,
                y: triangle[0].y * (1 - u - v) + triangle[1].y * u + triangle[2].y * v };
              row.push(positions.length / 2);
              push(applyHomography(Hmap, p.x, p.y), toUV(p.x, p.y));
            }
            rows.push(row);
          }
          for (let j = 0; j < N; j++) for (let i = 0; i < N - j; i++) {
            indices.push(rows[j][i], rows[j][i + 1], rows[j + 1][i]);
            if (i + 1 < N - j) indices.push(rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
          }
        }
      } else {
        const stride = N + 1, base = positions.length / 2;
        for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
          const t = i / N, u = j / N, sp = applyHomography(Hs, t, u);
          push(applyHomography(Hd, t, u), toUV(sp.x, sp.y));
        }
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const a = base + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
  } else {
    throw new Error('未知变形滤镜类型：' + deform.kind);
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}


export function deformStackBounds(list) {
  let out = null;
  for (const d of list || []) {
    const b = deformBounds(d);
    if (!b) continue;
    out = out ? { left: Math.min(out.left, b.left), top: Math.min(out.top, b.top),
                  right: Math.max(out.right, b.right), bottom: Math.max(out.bottom, b.bottom) } : b;
  }
  return out;
}


export function deformBounds(deform) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  const eat = pts => { for (const p of pts) { if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y; if (p.x > mxx) mxx = p.x; if (p.y > mxy) mxy = p.y; } };
  if (deform.kind === 'puppetWarp') for (const s of deform.shapes) eat(s.def);
  else if (deform.kind === 'perspectiveWarp') for (const q of perspectiveQuads(deform)) eat(q.dst);
  if (mnx === Infinity) return null;
  return { left: mnx, top: mny, right: mxx, bottom: mxy };
}
