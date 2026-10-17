

import { preparePerspectiveField, solvePerspectiveField } from './perspective-field.js';

const systems = new WeakMap();
const MODE = Object.freeze({ rigid: 1, normal: 2, similarity: 2, distort: 3, affine: 3 });
export const PUPPET_NATIVE_PROFILES = Object.freeze({ 1: 2, 2: 1, 3: 0 });
const copyPoints = p => p.map(v => ({ x: v.x, y: v.y }));
const fixed = p => p.rotationMode === 'fixed' || p.rotationOverride === true || p.override === true;
const copyPin = p => ({ ...p, orig: p.orig && { ...p.orig }, pos: { ...p.pos }, rotationMode: fixed(p) ? 'fixed' : 'auto' });

function validateShape(shape) {
  if (!Array.isArray(shape?.orig) || shape.orig.length < 3 || !Array.isArray(shape.pins) ||
      shape.orig.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) throw new Error('操控变形原始网格无效');
  const indices = Array.from(shape.indices || []);
  if (!indices.length || indices.length % 3 || indices.some(i => !Number.isInteger(i) || i < 0 || i >= shape.orig.length))
    throw new Error('操控变形三角形索引无效');
  for (const p of shape.pins) if (!Number.isFinite(p.pos?.x) || !Number.isFinite(p.pos?.y) ||
    (p.rot != null && !Number.isFinite(+p.rot)) || (p.depth != null && !Number.isFinite(+p.depth))) throw new Error('操控变形图钉无效');
  return indices;
}

function binding(p, shape, initial) {
  let vertex = p.vertex;
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= shape.orig.length) {
    let best = Infinity;
    for (let i = 0; i < initial.length; i++) {
      const distance = (initial[i].x - p.pos.x) ** 2 + (initial[i].y - p.pos.y) ** 2;
      if (distance < best) { best = distance; vertex = i; }
    }
  }
  const origin = p.orig || shape.orig[vertex];
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) throw new Error('操控变形图钉原位无效');
  return { vertex, origin, offset: { x: shape.orig[vertex].x - origin.x, y: shape.orig[vertex].y - origin.y } };
}

function systemFor(shape, indices) {
  const signature = JSON.stringify([shape.orig, indices]);
  let saved = systems.get(shape);
  if (!saved || saved.signature !== signature) {
    
    
    
    
    const original = copyPoints(shape.orig), triangles = indices.slice();
    for (let i = 0; i < triangles.length; i += 3) {
      const a = original[triangles[i]], b = original[triangles[i + 1]], c = original[triangles[i + 2]];
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (!area) throw new Error('操控变形网格包含退化三角形');
      if (area < 0) [triangles[i + 1], triangles[i + 2]] = [triangles[i + 2], triangles[i + 1]];
    }
    saved = { signature, system: preparePerspectiveField({ original, triangles }) };
    systems.set(shape, saved);
  }
  return saved.system;
}







export function solvePuppetPins(shape, base = null, options = {}) {
  const indices = validateShape(shape), pins = shape.pins.map(copyPin);
  const initial = options.initial || shape.def || base?.def || shape.orig;
  if (!Array.isArray(initial) || initial.length !== shape.orig.length || initial.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y)))
    throw new Error('操控变形上一帧网格无效');
  const rigidity = options.meshRigidity ?? MODE[options.mode] ?? shape.meshRigidity ?? 2;
  const profile = PUPPET_NATIVE_PROFILES[rigidity];
  if (profile === undefined) throw new Error('操控变形模式必须为 Rigid / Normal / Distort');
  const bindings = pins.map(p => binding(p, shape, initial));
  const vertices = new Set(bindings.map(b => b.vertex));
  if (vertices.size !== pins.length) throw new Error('图钉距离过近，绑定到了同一个网格顶点');
  pins.forEach((p, i) => { p.vertex = bindings[i].vertex; p.orig = { ...bindings[i].origin }; });
  const samePins = base && base.pins?.length === pins.length && pins.every((p, i) => {
    const old = base.pins[i];
    return p.vertex === old.vertex && p.pos.x === old.pos.x && p.pos.y === old.pos.y && fixed(p) === fixed(old) &&
      (!fixed(p) || +p.rot === +old.rot);
  });
  if (samePins && !options.force && rigidity === (base.meshRigidity ?? shape.meshRigidity ?? rigidity)) {
    const restored = base.def || initial;
    if (!Array.isArray(restored) || restored.length !== shape.orig.length || restored.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y)))
      throw new Error('操控变形手势快照无效');
    pins.forEach((p, i) => { if (!fixed(p) && Number.isFinite(+base.pins[i].rot)) p.rot = +base.pins[i].rot; });
    return { def: copyPoints(restored), pins, profile, path: 'unchanged', changed: false, iterations: 0 };
  }
  if (!pins.length) return { def: copyPoints(shape.orig), pins, profile, path: 'no-pins', changed: true, iterations: 0 };
  if (pins.length === 1) {
    
    
    const dx = Math.fround(pins[0].pos.x - bindings[0].origin.x), dy = Math.fround(pins[0].pos.y - bindings[0].origin.y);
    return { def: shape.orig.map(p => ({ x: p.x + dx, y: p.y + dy })), pins, profile, path: 'translation', changed: true, iterations: 0 };
  }
  
  
  const order = pins.map((_, i) => i).sort((a, b) => pins[a].vertex - pins[b].vertex);
  const constraints = order.map(i => ({ index: pins[i].vertex,
    target: { x: Math.fround(pins[i].pos.x + bindings[i].offset.x), y: Math.fround(pins[i].pos.y + bindings[i].offset.y) },
    angle: fixed(pins[i]) ? Math.fround(Math.trunc(+pins[i].rot || 0)) : 720,
    lockNeighbors: fixed(pins[i]) }));
  const result = solvePerspectiveField({ system: systemFor(shape, indices), constraints,
    initial: initial.map(p => ({ x: p.x, y: p.y })), profile,
    ...(options.linearSolver ? { linearSolver: options.linearSolver } : {}) });
  order.forEach((index, i) => { pins[index].rot = Math.trunc(result.angles[i]); });
  return { def: shape.orig.map((_, i) => ({ x: result.positions[i * 2], y: result.positions[i * 2 + 1] })),
    pins, profile, path: 'arap', changed: true, iterations: result.iterations, converged: result.converged,
    energyHistory: result.energyHistory, angles: result.angles, linearSolver: result.linearSolver };
}


export function applyPuppetPinsNative(shape, base, options = {}) {
  const result = solvePuppetPins(shape, base, options);
  shape.def = result.def;
  result.pins.forEach((p, i) => {
    const existing = shape.pins[i], orig = existing.orig, pos = existing.pos;
    Object.assign(existing, p);
    if (orig && p.orig) { Object.assign(orig, p.orig); existing.orig = orig; }
    if (pos && p.pos) { Object.assign(pos, p.pos); existing.pos = pos; }
  });
  return shape;
}
