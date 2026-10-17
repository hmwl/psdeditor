




















const KAPPA = 0.5522847498307936;          


const corner = (x, y) => ({ anchor: [x, y], in: [x, y], out: [x, y] });
const knot = (ax, ay, ix, iy, ox, oy) => ({ anchor: [ax, ay], in: [ix, iy], out: [ox, oy] });

const poly = (pts, operation = 1) => ({ closed: true, operation, knots: pts.map(p => corner(p[0], p[1])) });

function ellipse(cx, cy, rx, ry, operation = 1) {
  const kx = rx * KAPPA, ky = ry * KAPPA;
  return { closed: true, operation, knots: [
    knot(cx, cy - ry, cx - kx, cy - ry, cx + kx, cy - ry),
    knot(cx + rx, cy, cx + rx, cy - ky, cx + rx, cy + ky),
    knot(cx, cy + ry, cx + kx, cy + ry, cx - kx, cy + ry),
    knot(cx - rx, cy, cx - rx, cy + ky, cx - rx, cy - ky),
  ] };
}

function star(points, outer, inner, cx = 0.5, cy = 0.5, operation = 1) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + i * Math.PI / points;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts, operation);
}

function flower(petals, outer, inner, cx = 0.5, cy = 0.5) {
  const knots = [];
  const half = Math.PI / petals;
  for (let i = 0; i < petals; i++) {
    const a = -Math.PI / 2 + i * 2 * half;
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = -uy, py = ux;                                  
    const tx = cx + ux * outer, ty = cy + uy * outer;
    

    const h = outer * 0.5;
    knots.push(knot(tx, ty, tx - px * h, ty - py * h, tx + px * h, ty + py * h));
    const va = a + half;
    knots.push(corner(cx + Math.cos(va) * inner, cy + Math.sin(va) * inner));
  }
  return { closed: true, operation: 1, knots };
}



export const CUSTOM_SHAPES = [
  { id: 'heart', name: '心形', subpaths: [{ closed: true, operation: 1, knots: [
      knot(0.50, 0.95, 0.70, 0.80, 0.30, 0.80),
      knot(0.00, 0.35, 0.00, 0.60, 0.00, 0.10),
      knot(0.50, 0.27, 0.32, 0.05, 0.68, 0.05),
      knot(1.00, 0.35, 1.00, 0.10, 1.00, 0.60),
    ] }] },
  { id: 'star5', name: '五角星', subpaths: [star(5, 0.5, 0.5 * 0.382)] },
  { id: 'star6', name: '六角星', subpaths: [star(6, 0.5, 0.5 * 0.577)] },
  { id: 'burst', name: '星爆', subpaths: [star(16, 0.5, 0.5 * 0.72)] },
  { id: 'arrowRight', name: '右箭头', subpaths: [poly([
      [0, 0.30], [0.60, 0.30], [0.60, 0.06], [1, 0.50], [0.60, 0.94], [0.60, 0.70], [0, 0.70]])] },
  { id: 'arrowUp', name: '上箭头', subpaths: [poly([
      [0.30, 1], [0.30, 0.40], [0.06, 0.40], [0.50, 0], [0.94, 0.40], [0.70, 0.40], [0.70, 1]])] },
  { id: 'lightning', name: '闪电', subpaths: [poly([
      [0.58, 0], [0.12, 0.58], [0.40, 0.58], [0.30, 1], [0.88, 0.40], [0.56, 0.40], [0.80, 0]])] },
  { id: 'cross', name: '十字', subpaths: [poly([
      [0.34, 0], [0.66, 0], [0.66, 0.34], [1, 0.34], [1, 0.66], [0.66, 0.66],
      [0.66, 1], [0.34, 1], [0.34, 0.66], [0, 0.66], [0, 0.34], [0.34, 0.34]])] },
  { id: 'check', name: '对勾', subpaths: [poly([
      [0.06, 0.50], [0.20, 0.36], [0.40, 0.58], [0.80, 0.12], [0.94, 0.26], [0.40, 0.88]])] },
  
  
  { id: 'moon', name: '月牙', subpaths: [ellipse(0.5, 0.5, 0.5, 0.5), ellipse(0.58, 0.42, 0.42, 0.42, 2)] },
  { id: 'droplet', name: '水滴', subpaths: [{ closed: true, operation: 1, knots: [
      knot(0.50, 0.00, 0.34, 0.26, 0.66, 0.26),
      knot(0.85, 0.65, 0.82, 0.42, 0.85, 0.84),
      knot(0.50, 1.00, 0.69, 1.00, 0.31, 1.00),
      knot(0.15, 0.65, 0.15, 0.84, 0.18, 0.42),
    ] }] },
  { id: 'speech', name: '对话气泡', subpaths: [
      ellipse(0.5, 0.36, 0.5, 0.36),
      poly([[0.26, 0.60], [0.20, 1.00], [0.50, 0.64]], 1)] },
  { id: 'ring', name: '圆环', subpaths: [ellipse(0.5, 0.5, 0.5, 0.5), ellipse(0.5, 0.5, 0.3, 0.3, 2)] },
  { id: 'frame', name: '方框', subpaths: [
      poly([[0, 0], [1, 0], [1, 1], [0, 1]]),
      poly([[0.16, 0.16], [0.84, 0.16], [0.84, 0.84], [0.16, 0.84]], 2)] },
  { id: 'flower', name: '花朵', subpaths: [flower(5, 0.44, 0.15)] },
  { id: 'tag', name: '标签', subpaths: [
      poly([[0, 0.10], [0.70, 0.10], [1, 0.50], [0.70, 0.90], [0, 0.90]]),
      ellipse(0.18, 0.50, 0.09, 0.09, 2)] },
];

export const CUSTOM_SHAPE_BY_ID = Object.fromEntries(CUSTOM_SHAPES.map(s => [s.id, s]));
export const DEFAULT_CUSTOM_SHAPE = CUSTOM_SHAPES[0].id;



export function customShapeAspect(id){
  const s = CUSTOM_SHAPE_BY_ID[id];
  return s && s.aspect ? s.aspect : 1;
}







export function customShapeSubpaths(id, rect){
  const s = CUSTOM_SHAPE_BY_ID[id];
  if (!s || !rect || !(rect.w >= 1) || !(rect.h >= 1)) return null;
  const map = p => [rect.x + p[0] * rect.w, rect.y + p[1] * rect.h];
  return s.subpaths.map(sp => ({
    closed: sp.closed !== false,
    operation: sp.operation === undefined ? 1 : sp.operation,
    knots: sp.knots.map(k => ({ anchor: map(k.anchor), in: map(k.in), out: map(k.out) })),
  }));
}






export function setLibraryShapes(list){
  for (let i = CUSTOM_SHAPES.length - 1; i >= 0; i--) if (CUSTOM_SHAPES[i]._lib) { delete CUSTOM_SHAPE_BY_ID[CUSTOM_SHAPES[i].id]; CUSTOM_SHAPES.splice(i, 1); }
  for (const s of list || []) {
    const it = { ...s, _lib: true };
    CUSTOM_SHAPES.push(it);
    CUSTOM_SHAPE_BY_ID[it.id] = it;
  }
}

export default { CUSTOM_SHAPES, CUSTOM_SHAPE_BY_ID, DEFAULT_CUSTOM_SHAPE, customShapeSubpaths, customShapeAspect, setLibraryShapes };
