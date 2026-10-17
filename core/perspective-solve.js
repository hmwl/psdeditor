




export const PERSPECTIVE_SOLVER_PROFILE = Object.freeze({
  mouseWeight: 1, restWeight: 0.1, sharedWeight: 1000, softSideWeight: 0,
  jacobianStep: 1e-8, stepStop: 1e-6, minAlpha: 0.001,
  affineThreshold: 1e-5, maxIterations: 500,
});
const JACOBIAN_STEP = PERSPECTIVE_SOLVER_PROFILE.jacobianStep;
const STEP_STOP = PERSPECTIVE_SOLVER_PROFILE.stepStop;
const MIN_ALPHA = PERSPECTIVE_SOLVER_PROFILE.minAlpha;

const DENSE_DOF_LIMIT = 128;
const PCG_RELATIVE_TOLERANCE = 1e-10;

function quadMatrix(p) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const dx = x0 - x1 + x2 - x3, dy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx) >= PERSPECTIVE_SOLVER_PROFILE.affineThreshold || Math.abs(dy) >= PERSPECTIVE_SOLVER_PROFILE.affineThreshold) {
    const divisor = (y3 - y2) * (x1 - x2) - (x3 - x2) * (y1 - y2);
    if (Math.abs(divisor) < 1e-15) throw new Error('退化透视四边形不能求解');
    g = ((y3 - y2) * dx - (x3 - x2) * dy) / divisor;
    h = (dy * (x1 - x2) - dx * (y1 - y2)) / divisor;
  }
  return [x1 - x0 + x1 * g, x3 - x0 + x3 * h, x0,
    y1 - y0 + y1 * g, y3 - y0 + y3 * h, y0, g, h, 1];
}

function adjugate(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  return [e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d];
}

function multiply(a, b) {
  const out = new Float64Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[c + 3] + a[r * 3 + 2] * b[c + 6];
  }
  return out;
}

function denseSolve(matrix, rhs, n) {
  const a = matrix.slice(), b = rhs.slice();
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r * n + i]) > Math.abs(a[pivot * n + i])) pivot = r;
    if (Math.abs(a[pivot * n + i]) < 1e-15) throw new Error('透视约束矩阵退化');
    if (pivot !== i) {
      for (let c = i; c < n; c++) [a[i * n + c], a[pivot * n + c]] = [a[pivot * n + c], a[i * n + c]];
      [b[i], b[pivot]] = [b[pivot], b[i]];
    }
    for (let r = i + 1; r < n; r++) {
      const factor = a[r * n + i] / a[i * n + i];
      for (let c = i + 1; c < n; c++) a[r * n + c] -= factor * a[i * n + c];
      b[r] -= factor * b[i];
    }
  }
  const out = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let value = b[r];
    for (let c = r + 1; c < n; c++) value -= a[r * n + c] * out[c];
    out[r] = value / a[r * n + r];
  }
  return out;
}



function sparseNormalSolve(diagonal, rows, rhs) {
  const n = rhs.length, x = new Float64Array(n), preconditioner = diagonal.slice();
  for (const row of rows) for (let k = 0; k < row.indices.length; k++) {
    preconditioner[row.indices[k]] += PERSPECTIVE_SOLVER_PROFILE.sharedWeight * row.values[k] ** 2;
  }
  const apply = input => {
    const out = Float64Array.from(input, (v, i) => diagonal[i] * v);
    for (const row of rows) {
      let dot = 0;
      for (let k = 0; k < row.indices.length; k++) dot += row.values[k] * input[row.indices[k]];
      dot *= PERSPECTIVE_SOLVER_PROFILE.sharedWeight;
      for (let k = 0; k < row.indices.length; k++) out[row.indices[k]] += row.values[k] * dot;
    }
    return out;
  };
  const dot = (a, b) => { let sum = 0; for (let i = 0; i < n; i++) sum += a[i] * b[i]; return sum; };
  const rhsNorm = Math.sqrt(dot(rhs, rhs));
  if (rhsNorm === 0) return { direction: x, relativeResidual: 0 };
  const tolerance = rhsNorm * PCG_RELATIVE_TOLERANCE;
  let residual = rhs.slice(), z = Float64Array.from(residual, (v, i) => v / preconditioner[i]);
  let direction = z.slice(), rz = dot(residual, z);
  for (let iteration = 0; iteration < Math.min(n * 2, 2000); iteration++) {
    const ad = apply(direction), denominator = dot(direction, ad);
    if (!(denominator > 0) || !Number.isFinite(denominator)) throw new Error('透视约束矩阵退化');
    const alpha = rz / denominator;
    for (let i = 0; i < n; i++) { x[i] += alpha * direction[i]; residual[i] -= alpha * ad[i]; }
    if (Math.sqrt(dot(residual, residual)) <= tolerance) {
      const ax = apply(x);
      residual = Float64Array.from(rhs, (v, i) => v - ax[i]);
      const relativeResidual = Math.sqrt(dot(residual, residual)) / rhsNorm;
      if (relativeResidual <= PCG_RELATIVE_TOLERANCE) return { direction: x, relativeResidual };
      
      
      z = Float64Array.from(residual, (v, i) => v / preconditioner[i]);
      direction = z.slice(); rz = dot(residual, z);
      continue;
    }
    z = Float64Array.from(residual, (v, i) => v / preconditioner[i]);
    const next = dot(residual, z), beta = next / rz;
    for (let i = 0; i < n; i++) direction[i] = z[i] + beta * direction[i];
    rz = next;
  }
  throw new Error('透视约束线性求解没有收敛');
}







export function solvePerspectivePoints({ original, rest, quads, vertexIndex, target, initial = rest, coordinateGroups = [] }) {
  if (!Array.isArray(original) || !Array.isArray(rest) || original.length !== rest.length || !rest.length ||
      !Array.isArray(initial) || initial.length !== rest.length || !Array.isArray(quads) ||
      !Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= rest.length ||
      !target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new Error('透视求解参数不完整');
  for (const p of [...original, ...rest, ...initial]) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('透视顶点必须为有限坐标');
  for (const q of quads) if (!Array.isArray(q) || q.length !== 4 || new Set(q).size !== 4 ||
    q.some(i => !Number.isInteger(i) || i < 0 || i >= rest.length)) throw new Error('透视四边形索引无效');

  const scale = Math.max(1, ...rest.flatMap(p => [p.x, p.y]));
  
  const pack = points => Float64Array.from(points.flatMap(p => [p.y / scale, p.x / scale]));
  const base = pack(rest), source = pack(original), current = pack(initial);
  const wanted = [target.y / scale, target.x / scale], count = current.length;
  const root = Array.from({ length: count }, (_, i) => i);
  const find = i => root[i] === i ? i : (root[i] = find(root[i]));
  for (const group of coordinateGroups) {
    if (!Array.isArray(group) || group.some(i => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error('透视等坐标约束无效');
    const ids = group.map(i => (i & ~1) + (1 - (i & 1)));
    for (const i of ids.slice(1)) root[find(i)] = find(ids[0]);
  }
  const representatives = Array.from(new Set(root.map((_, i) => find(i)))).sort((a, b) => a - b);
  const position = new Map(representatives.map((i, j) => [i, j]));
  const variable = root.map((_, i) => position.get(find(i))), n = representatives.length;
  
  for (const representative of representatives) {
    const members = root.map((_, i) => i).filter(i => find(i) === representative);
    const b = members.reduce((s, i) => s + base[i], 0) / members.length;
    const c = members.reduce((s, i) => s + current[i], 0) / members.length;
    for (const i of members) { base[i] = b; current[i] = c; }
  }
  for (let axis = 0; axis < 2; axis++) {
    const representative = find(vertexIndex * 2 + axis);
    for (let i = 0; i < count; i++) if (find(i) === representative) current[i] = wanted[axis];
  }
  const quad = (values, indices) => indices.flatMap(i => [values[i * 2], values[i * 2 + 1]]);
  const sourceH = quads.map(q => quadMatrix(quad(source, q))), shared = [];
  for (let a = 0; a < quads.length; a++) for (let b = a + 1; b < quads.length; b++) {
    const common = quads[a].filter(i => quads[b].includes(i));
    if (common.length === 2) shared.push({ a, b, p: common[0], q: common[1], variables: [...new Set([...quads[a], ...quads[b]])].sort((x, y) => x - y).flatMap(i => [i * 2, i * 2 + 1]) });
  }
  const residual = (values, edge) => {
    const a = multiply(sourceH[edge.a], adjugate(quadMatrix(quad(values, quads[edge.a]))));
    const b = multiply(sourceH[edge.b], adjugate(quadMatrix(quad(values, quads[edge.b]))));
    const denominator = (m, i) => m[6] * values[i * 2] + m[7] * values[i * 2 + 1] + m[8];
    return denominator(a, edge.p) * denominator(b, edge.q) - denominator(b, edge.p) * denominator(a, edge.q);
  };
  const energy = values => {
    let e = 0;
    for (let i = 0; i < count; i++) e += PERSPECTIVE_SOLVER_PROFILE.restWeight * (values[i] - base[i]) ** 2;
    for (let axis = 0; axis < 2; axis++) e += PERSPECTIVE_SOLVER_PROFILE.mouseWeight * (values[vertexIndex * 2 + axis] - wanted[axis]) ** 2;
    for (const edge of shared) e += PERSPECTIVE_SOLVER_PROFILE.sharedWeight * residual(values, edge) ** 2;
    return e;
  };

  const useSparse = n > DENSE_DOF_LIMIT;
  let theta = energy(current), alpha = 1, iterations = 0, converged = false, maxLinearResidual = 0;
  for (; iterations < PERSPECTIVE_SOLVER_PROFILE.maxIterations; iterations++) {
    const diagonal = new Float64Array(n), gradient = new Float64Array(n), rows = [];
    const hessian = useSparse ? null : new Float64Array(n * n);
    for (let i = 0; i < count; i++) {
      const v = variable[i];
      diagonal[v] += PERSPECTIVE_SOLVER_PROFILE.restWeight;
      gradient[v] += PERSPECTIVE_SOLVER_PROFILE.restWeight * (current[i] - base[i]);
    }
    for (let axis = 0; axis < 2; axis++) {
      const i = vertexIndex * 2 + axis, v = variable[i];
      diagonal[v] += PERSPECTIVE_SOLVER_PROFILE.mouseWeight;
      gradient[v] += PERSPECTIVE_SOLVER_PROFILE.mouseWeight * (current[i] - wanted[axis]);
    }
    if (hessian) for (let i = 0; i < n; i++) hessian[i * n + i] = diagonal[i];
    for (const edge of shared) {
      const value = residual(current, edge), entries = new Map();
      for (const i of edge.variables) {
        const old = current[i]; current[i] = old + JACOBIAN_STEP;
        const v = variable[i];
        entries.set(v, (entries.get(v) || 0) + (residual(current, edge) - value) / JACOBIAN_STEP);
        current[i] = old;
      }
      const indices = [...entries.keys()].sort((a, b) => a - b);
      const values = Float64Array.from(indices, i => entries.get(i));
      rows.push({ indices, values });
      for (let i = 0; i < indices.length; i++) {
        gradient[indices[i]] += PERSPECTIVE_SOLVER_PROFILE.sharedWeight * value * values[i];
        if (hessian) for (let j = 0; j < indices.length; j++) hessian[indices[i] * n + indices[j]] += PERSPECTIVE_SOLVER_PROFILE.sharedWeight * values[i] * values[j];
      }
    }
    const rhs = Float64Array.from(gradient, g => -g);
    const solved = useSparse ? sparseNormalSolve(diagonal, rows, rhs) : { direction: denseSolve(hessian, rhs, n), relativeResidual: 0 };
    const direction = solved.direction;
    maxLinearResidual = Math.max(maxLinearResidual, solved.relativeResidual);
    if (Math.max(...Array.from(direction, Math.abs)) < STEP_STOP) { converged = true; break; }
    const previous = current.slice();
    let accepted = false;
    while (alpha >= MIN_ALPHA) {
      for (let i = 0; i < count; i++) current[i] = previous[i] + alpha * direction[variable[i]];
      const next = energy(current);
      if (Number.isFinite(next) && next <= theta) { theta = next; alpha = Math.min(1, alpha * 2); accepted = true; break; }
      current.set(previous); alpha *= 0.5;
    }
    if (!accepted) break;
  }
  return { points: rest.map((_, i) => ({ x: current[i * 2 + 1] * scale, y: current[i * 2] * scale })),
    iterations, energy: theta, converged, scale, coupledEdges: shared.length,
    linearSolver: useSparse ? 'pcg' : 'dense', maxLinearResidual };
}
