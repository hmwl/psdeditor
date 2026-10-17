












export const PERSPECTIVE_FIELD_PROFILES = Object.freeze([
  Object.freeze({ tolerance: 1, maxIterations: 0 }),
  Object.freeze({ tolerance: .1, maxIterations: 10 }),
  Object.freeze({ tolerance: .001, maxIterations: 100 }),
]);
export const PERSPECTIVE_FIELD_FREE_ANGLE = 720;

function coordinates(points) {
  const p = Array.isArray(points) && points[0] && typeof points[0] === 'object'
    ? Float64Array.from(points.flatMap(v => [v.x, v.y])) : Float64Array.from(points);
  if (!p.length || p.length % 2 || p.some(v => !Number.isFinite(v))) throw new Error('Invalid field coordinates');
  return p;
}
function add(rows, i, j, value) { rows[i].set(j, (rows[i].get(j) || 0) + value); }
function multiply(rows, vector, out = new Float64Array(rows.length)) {
  for (let i = 0; i < rows.length; i++) { let sum = 0; for (const [j, v] of rows[i]) sum += v * vector[j]; out[i] = sum; }
  return out;
}
function dot(a, b) { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; }


export function preparePerspectiveField({ original, triangles }) {
  const p = coordinates(original), n = p.length / 2;
  const inputTriangles = Array.isArray(triangles?.[0]) ? triangles.flat() : Array.from(triangles || []);
  if (!inputTriangles.length || inputTriangles.length % 3 || inputTriangles.some(v => !Number.isInteger(v) || v < 0 || v >= n))
    throw new Error('Invalid field triangles');
  const t = Uint32Array.from(inputTriangles);
  const rows = Array.from({ length: n }, () => new Map()), directedEdges = [], adjacency = Array.from({ length: n }, () => new Set());
  const boundaryEdges = new Map(), nativePreviousNeighbors = Array.from({ length: n }, () => []);
  for (let q = 0; q < t.length; q += 3) {
    const a = t[q], b = t[q + 1], c = t[q + 2];
    nativePreviousNeighbors[a].unshift(c); nativePreviousNeighbors[b].unshift(a); nativePreviousNeighbors[c].unshift(b);
    for (const [i, j, k] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const ux = p[j * 2] - p[i * 2], uy = p[j * 2 + 1] - p[i * 2 + 1];
      const vx = p[k * 2] - p[i * 2], vy = p[k * 2 + 1] - p[i * 2 + 1];
      const cross = ux * vy - uy * vx;
      if (!cross) throw new Error('Degenerate field triangle');
      
      const weight = .5 * (ux * vx + uy * vy) / cross;
      add(rows, j, j, weight); add(rows, k, k, weight); add(rows, j, k, -weight); add(rows, k, j, -weight);
      directedEdges.push({ i: j, j: k, weight }, { i: k, j, weight });
      adjacency[j].add(k); adjacency[k].add(j);
      const key = j < k ? `${j}:${k}` : `${k}:${j}`;
      const edge = boundaryEdges.get(key);
      if (edge) edge.count++; else boundaryEdges.set(key, { i: j, j: k, count: 1 });
    }
  }
  const boundary = new Uint8Array(n);
  for (const edge of boundaryEdges.values()) if (edge.count === 1) { boundary[edge.i] = 1; boundary[edge.j] = 1; }
  return { original: p, triangles: t, vertexCount: n, laplacian: rows, directedEdges, adjacency, nativePreviousNeighbors, boundary };
}





export function assembleNativeMixedHessian(system, boundary = system.boundary) {
  const n = system.vertexCount, rows = Array.from({ length: n * 2 }, () => new Map());
  for (let i = 0; i < n; i++) for (const [j, value] of system.laplacian[i]) {
    add(rows, i, j, value * 2); add(rows, i + n, j + n, value * 2);
  }
  const t = system.triangles;
  for (let q = 0; q < t.length; q += 3) {
    const tri = [t[q], t[q + 1], t[q + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3], c = tri[(k + 2) % 3];
      if (!boundary[a]) continue;
      add(rows, a, c + n, 1); add(rows, a, b + n, -1);
      add(rows, a + n, c, -1); add(rows, a + n, b, 1);
    }
  }
  return rows;
}


function denseFactor(rows) {
  const n = rows.length, a = new Float64Array(n * n), pivots = new Uint32Array(n);
  for (let i = 0; i < n; i++) for (const [j, v] of rows[i]) a[i * n + j] = v;
  for (let k = 0; k < n; k++) {
    let pivot = k, maximum = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i * n + k]) > maximum) { maximum = Math.abs(a[i * n + k]); pivot = i; }
    if (!(maximum > 0) || !Number.isFinite(maximum)) throw new Error('Singular field system: constrain every connected component');
    pivots[k] = pivot;
    if (pivot !== k) for (let j = 0; j < n; j++) { const v = a[k * n + j]; a[k * n + j] = a[pivot * n + j]; a[pivot * n + j] = v; }
    for (let i = k + 1; i < n; i++) {
      const scale = a[i * n + k] /= a[k * n + k];
      for (let j = k + 1; j < n; j++) a[i * n + j] -= scale * a[k * n + j];
    }
  }
  return rhs => {
    const x = Float64Array.from(rhs);
    for (let k = 0; k < n; k++) if (pivots[k] !== k) { const v = x[k]; x[k] = x[pivots[k]]; x[pivots[k]] = v; }
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) x[i] -= a[i * n + j] * x[j];
    for (let i = n - 1; i >= 0; i--) { for (let j = i + 1; j < n; j++) x[i] -= a[i * n + j] * x[j]; x[i] /= a[i * n + i]; }
    return x;
  };
}
function pcgSolve(rows, rhs, options) {
  const n = rows.length, x = new Float64Array(n), r = Float64Array.from(rhs), z = new Float64Array(n), p = new Float64Array(n);
  const diag = rows.map((row, i) => row.get(i) || 0), rhsNorm = Math.sqrt(dot(rhs, rhs));
  if (!rhsNorm) return x;
  for (let i = 0; i < n; i++) { if (!(diag[i] > 0)) throw new Error('PCG requires a positive field Laplacian'); z[i] = r[i] / diag[i]; p[i] = z[i]; }
  let rz = dot(r, z);
  for (let iteration = 0; iteration < (options.linearMaxIterations ?? n * 2 + 32); iteration++) {
    const ap = multiply(rows, p), denominator = dot(p, ap);
    if (!(denominator > 0)) throw new Error('Field Laplacian is not positive definite');
    const alpha = rz / denominator;
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * ap[i]; }
    if (Math.sqrt(dot(r, r)) <= (options.linearTolerance ?? 1e-10) * rhsNorm) return x;
    for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
    const next = dot(r, z), beta = next / rz;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rz = next;
  }
  throw new Error('Field PCG did not converge');
}
function constrainedSolver(system, constraints, options) {
  const n = system.vertexCount, fixed = new Map();
  for (const constraint of constraints) {
    if (!Number.isInteger(constraint.index) || constraint.index < 0 || constraint.index >= n) throw new Error('Invalid field constraint index');
    const target = constraint.target;
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new Error('Invalid field constraint target');
    if (fixed.has(constraint.index)) throw new Error('Duplicate field constraint');
    fixed.set(constraint.index, target);
  }
  if (!fixed.size) throw new Error('Field requires positional constraints');
  const free = [], inverse = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (!fixed.has(i)) { inverse[i] = free.length; free.push(i); }
  const rows = free.map(i => { const row = new Map(); for (const [j, v] of system.laplacian[i]) if (!fixed.has(j)) row.set(inverse[j], v); return row; });
  const method = options.linearSolver === 'pcg' || (options.linearSolver !== 'dense' && free.length > 256) ? 'pcg' : 'dense';
  const solve = method === 'dense' ? denseFactor(rows) : rhs => pcgSolve(rows, rhs, options);
  return { method, solve(rhs, axis) {
    const reduced = Float64Array.from(free, i => { let v = rhs[i]; for (const [j, coefficient] of system.laplacian[i]) if (fixed.has(j)) v -= coefficient * fixed.get(j)[axis]; return v; });
    const solved = solve(reduced), out = new Float64Array(n);
    for (const [i, target] of fixed) out[i] = target[axis];
    for (let k = 0; k < free.length; k++) out[free[k]] = solved[k];
    return out;
  } };
}





export function nativeFieldPolarRotation(c00, c01, c10, c11) {
  const a = c00 + c11, b = c01 - c10, norm = Math.hypot(a, b);
  if (!norm) return [1, 0, 0, 1];
  const cos = a / norm, sin = b / norm;
  return [cos, -sin, sin, cos];
}
export function perspectiveFieldLocalStep(system, positions) {
  const p = system.original, q = coordinates(positions), covariance = new Float64Array(system.vertexCount * 4);
  if (q.length !== p.length) throw new Error('Field coordinate count differs');
  for (const edge of system.directedEdges) {
    const { i, j, weight } = edge, px = p[i * 2] - p[j * 2], py = p[i * 2 + 1] - p[j * 2 + 1];
    const qx = q[i * 2] - q[j * 2], qy = q[i * 2 + 1] - q[j * 2 + 1], k = i * 4;
    covariance[k] += weight * px * qx; covariance[k + 1] += weight * px * qy;
    covariance[k + 2] += weight * py * qx; covariance[k + 3] += weight * py * qy;
  }
  const rotations = new Float64Array(covariance.length);
  for (let i = 0; i < system.vertexCount; i++) rotations.set(nativeFieldPolarRotation(...covariance.subarray(i * 4, i * 4 + 4)), i * 4);
  return rotations;
}
export function perspectiveFieldGlobalRHS(system, rotations) {
  const rhs = new Float64Array(system.vertexCount * 2), p = system.original;
  for (const { i, j, weight } of system.directedEdges) {
    const x = p[i * 2] - p[j * 2], y = p[i * 2 + 1] - p[j * 2 + 1], a = i * 4, b = j * 4;
    rhs[i * 2] += weight * .5 * ((rotations[a] + rotations[b]) * x + (rotations[a + 1] + rotations[b + 1]) * y);
    rhs[i * 2 + 1] += weight * .5 * ((rotations[a + 2] + rotations[b + 2]) * x + (rotations[a + 3] + rotations[b + 3]) * y);
  }
  return rhs;
}
export function perspectiveFieldEnergy(system, positions, rotations) {
  const p = system.original;
  let energy = 0;
  for (const { i, j, weight } of system.directedEdges) {
    const x = p[i * 2] - p[j * 2], y = p[i * 2 + 1] - p[j * 2 + 1], k = i * 4;
    const dx = positions[i * 2] - positions[j * 2] - rotations[k] * x - rotations[k + 1] * y;
    const dy = positions[i * 2 + 1] - positions[j * 2 + 1] - rotations[k + 2] * x - rotations[k + 3] * y;
    energy += weight * (dx * dx + dy * dy);
  }
  return energy;
}
function angleRotation(nativeRadians) { const c = Math.cos(nativeRadians), s = Math.sin(nativeRadians); return [c, s, -s, c]; }
function radians(degrees) { let a = degrees * Math.PI / 180; if (a >= Math.PI) a -= Math.PI * 2; return a; }

function solvePinnedMatrix(rows, fixed, options) {
  const n = rows.length, free = [], inverse = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (!fixed.has(i)) { inverse[i] = free.length; free.push(i); }
  const reduced = free.map(i => { const row = new Map(); for (const [j, v] of rows[i]) if (!fixed.has(j)) row.set(inverse[j], v); return row; });
  const rhs = Float64Array.from(free, i => { let value = 0; for (const [j, v] of rows[i]) if (fixed.has(j)) value -= v * fixed.get(j); return value; });
  const method = options.linearSolver === 'pcg' || (options.linearSolver !== 'dense' && free.length > 256) ? 'pcg' : 'dense';
  const solved = method === 'dense' ? denseFactor(reduced)(rhs) : pcgSolve(reduced, rhs, options), out = new Float64Array(n);
  for (const [i, value] of fixed) out[i] = value;
  for (let k = 0; k < free.length; k++) out[free[k]] = solved[k];
  return { values: out, method };
}
function nativeRotationAngle(rotations, offset) {
  let angle = Math.acos(Math.max(-1, Math.min(1, rotations[offset])));
  if (rotations[offset + 1] < 0) angle = -angle;
  return angle;
}







export function initializePerspectiveField(system, { constraints, ...options }) {
  const n = system.vertexCount, p = system.original, seed = Float64Array.from(p), fixed = new Map(), seen = new Set();
  for (const constraint of constraints) {
    const i = constraint.index, target = constraint.target, angle = constraint.angle ?? PERSPECTIVE_FIELD_FREE_ANGLE;
    if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i) || !Number.isFinite(target?.x) || !Number.isFinite(target?.y) || !Number.isFinite(angle))
      throw new Error('Invalid native initializer constraint');
    seen.add(i);
    if (angle !== PERSPECTIVE_FIELD_FREE_ANGLE) {
      const r = angleRotation(radians(angle));
      for (const j of system.nativePreviousNeighbors[i]) {
        const dx = p[j * 2] - p[i * 2], dy = p[j * 2 + 1] - p[i * 2 + 1];
        seed[j * 2] = target.x + r[0] * dx + r[1] * dy;
        seed[j * 2 + 1] = target.y + r[2] * dx + r[3] * dy;
      }
    }
  }
  if (!seen.size) throw new Error('Native field initialization requires constraints');
  for (const constraint of constraints) if (constraint.lockNeighbors)
    for (const j of system.nativePreviousNeighbors[constraint.index]) { fixed.set(j, seed[j * 2]); fixed.set(j + n, seed[j * 2 + 1]); }
  for (const constraint of constraints) { fixed.set(constraint.index, constraint.target.x); fixed.set(constraint.index + n, constraint.target.y); }
  const mixed = assembleNativeMixedHessian(system);
  for (let i = 0; i < mixed.length; i++) for (const [j, v] of mixed[i]) if (Math.abs(v - (mixed[j].get(i) || 0)) > 1e-12)
    throw new Error('Native mixed Hessian has an invalid boundary cycle/orientation');
  const solved = solvePinnedMatrix(mixed, fixed, options), conformal = new Float64Array(p.length);
  for (let i = 0; i < n; i++) { conformal[i * 2] = solved.values[i]; conformal[i * 2 + 1] = solved.values[i + n]; }
  const pinAngles = constraints.map(constraint => {
    if ((constraint.angle ?? PERSPECTIVE_FIELD_FREE_ANGLE) !== PERSPECTIVE_FIELD_FREE_ANGLE) return radians(constraint.angle);
    const i = constraint.index, covariance = new Float64Array(4);
    for (const j of system.nativePreviousNeighbors[i]) {
      const px = p[i * 2] - p[j * 2], py = p[i * 2 + 1] - p[j * 2 + 1];
      const qx = conformal[i * 2] - conformal[j * 2], qy = conformal[i * 2 + 1] - conformal[j * 2 + 1];
      covariance[0] += px * qx; covariance[1] += px * qy; covariance[2] += py * qx; covariance[3] += py * qy;
    }
    return nativeRotationAngle(nativeFieldPolarRotation(...covariance), 0);
  });
  const harmonicSolver = constrainedSolver(system, constraints.map((c, i) => ({ index: c.index, target: { x: pinAngles[i], y: 0 } })), options);
  const angles = harmonicSolver.solve(new Float64Array(n), 'x'), rotations = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) rotations.set(angleRotation(angles[i]), i * 4);
  return { conformalPositions: conformal, rotations, pinAngles, interpolatedAngles: angles,
    mixedLinearSolver: solved.method, harmonicLinearSolver: harmonicSolver.method };
}






export function solvePerspectiveField({ system, original, triangles, constraints, initial, initialRotations, profile = 1, ...options }) {
  system ||= preparePerspectiveField({ original, triangles });
  const n = system.vertexCount, config = PERSPECTIVE_FIELD_PROFILES[profile];
  if (!config) throw new Error('Invalid native field profile');
  const initialization = initialRotations ? null : initializePerspectiveField(system, { constraints, ...options });
  if (!initialRotations) initialRotations = initialization.rotations;
  if (initialRotations.length !== n * 4) throw new Error('Invalid native initial rotation count');
  let positions = coordinates(initial || system.original), rotations = Float64Array.from(initialRotations);
  if (positions.length !== n * 2 || rotations.some(v => !Number.isFinite(v))) throw new Error('Invalid native field initial state');
  if (!config.maxIterations) {
    if (!initialization) throw new Error('Native profile 0 requires conformal initialization, not supplied rotations');
    return { positions: initialization.conformalPositions, rotations, angles: constraints.map((c, i) => {
      if ((c.angle ?? 720) !== 720) return c.angle;
      const degrees = initialization.pinAngles[i] * 180 / Math.PI;
      return degrees > 0 ? degrees : degrees + 360;
    }), iterations: 0,
      converged: true, energyHistory: [], initialization, axisOrder: 'unchanged' };
  }
  const solver = constrainedSolver(system, constraints, options);
  const angles = constraints.map(c => c.angle ?? PERSPECTIVE_FIELD_FREE_ANGLE);
  if (angles.some(v => !Number.isFinite(v))) throw new Error('Invalid native field angle');
  for (const c of constraints) { positions[c.index * 2] = c.target.x; positions[c.index * 2 + 1] = c.target.y; }
  const energyHistory = [perspectiveFieldEnergy(system, positions, rotations)];
  let converged = false, iterations = 0;
  for (; iterations < config.maxIterations;) {
    for (let k = 0; k < constraints.length; k++) {
      const i = constraints[k].index * 4;
      if (angles[k] === PERSPECTIVE_FIELD_FREE_ANGLE) {
        
        const a = nativeRotationAngle(rotations, i);
        angles[k] = a * 180 / Math.PI; if (!(angles[k] > 0)) angles[k] += 360;
      } else rotations.set(angleRotation(radians(angles[k])), i);
    }
    const rhs = perspectiveFieldGlobalRHS(system, rotations);
    const x = solver.solve(Float64Array.from({ length: n }, (_, i) => rhs[i * 2]), 'x');
    const y = solver.solve(Float64Array.from({ length: n }, (_, i) => rhs[i * 2 + 1]), 'y');
    for (let i = 0; i < n; i++) { positions[i * 2] = x[i]; positions[i * 2 + 1] = y[i]; }
    rotations = perspectiveFieldLocalStep(system, positions);
    const energy = perspectiveFieldEnergy(system, positions, rotations), previous = energyHistory.at(-1);
    energyHistory.push(energy); iterations++;
    if (Math.abs(energy - previous) < (Math.abs(previous) + 1) * config.tolerance) { converged = true; break; }
  }
  return { positions, rotations, angles, iterations, converged, energyHistory, linearSolver: solver.method,
    initialization: initialization || 'caller-supplied native rotations', axisOrder: 'unchanged' };
}
