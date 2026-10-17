import assert from 'node:assert/strict';
import { RELIGHT_DEFAULTS, decodeRelightOutput, prepareRelightInput, prepareGeometryInput, decodeDepthOutput, decodeMogeNormals, estimateMogeFov, assembleRelightMaps,
  buildRelightRenderState, relightLightParameters, renderRelight, renderRelightAsync, analyzeRelight, disposeRelight } from '../../core/relight.js';

function maps(width, height, normal = [0, 0, -1]) {
  const n = width * height, focal = width / (2 * Math.tan(25 * Math.PI / 180));
  const intrinsics = { fx: focal, fy: focal, cx: width / 2, cy: height / 2 };
  return { width, height, albedo: new Float32Array(n * 3).fill(0.2), depth: new Float32Array(n).fill(1),
    normals: Float32Array.from({ length: n * 3 }, (_, i) => normal[i % 3]), shading: new Float32Array(n).fill(1),
    albedoSpace: 'linear', scene: { near: 1, far: 6, referenceDepth: 1, scale: width / focal, intrinsics }, intrinsics };
}
const close = (a, b, why, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${why}: ${a} ≠ ${b}`);
const linear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const encode = v => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;

assert.deepEqual({ ...RELIGHT_DEFAULTS, color: [...RELIGHT_DEFAULTS.color] },
  { x: -0.65, y: -0.7, depth: 0.25, intensity: 20, diffusion: 50, color: [255, 255, 255], enabled: true, originalLighting: 75, blend: 1 }, 'reference controls/defaults');
const image = new Uint8ClampedArray([61, 72, 83, 255, 90, 80, 70, 128, 23, 45, 67, 0]), original = image.slice(), analysis = maps(3, 1);
assert.deepEqual(renderRelight(image, 3, 1, analysis, { blend: 0 }), image, 'zero blend exact identity');
assert.deepEqual(renderRelight(image, 3, 1, analysis, { intensity: 0, originalLighting: 100 }), image, 'disabled light and full original exact identity');
assert.deepEqual(renderRelight(image, 3, 1, analysis, { lights: [], originalLighting: 100 }), image);
for (const percent of [0, 25, 50, 75, 100]) {
  const output = renderRelight(image, 3, 1, analysis, { lights: [], originalLighting: percent });
  for (let i = 0; i < 8; i++) if (i % 4 !== 3) assert.equal(output[i], Math.round(encode(linear(image[i] / 255) * (percent / 100) ** 3) * 255), 'Original Lighting is cubic linear gain');
  assert.equal(output[3], 255); assert.equal(output[7], 128); assert.deepEqual(output.slice(8), image.slice(8), 'hidden RGB and alpha preserved');
}
assert.deepEqual(image, original, 'source immutable');

const scene = { near: 1, far: 6, referenceDepth: 2, scale: 4, intrinsics: { fx: 50, fy: 50, cx: 50, cy: 25 } };
const lamp = { x: -0.65, y: -0.7, depth: 0.25, intensity: 20, diffusion: 50, color: [1, 1, 1] };
const state = relightLightParameters(lamp, scene, 100, 50, 75);
close(state.position[0], -1.3, 'camera light x'); close(state.position[1], -0.7, 'camera light y'); close(state.position[2], 1.15, 'piecewise light depth');
close(state.radius, 4 * 0.015 * (0.8 / 0.015) ** 0.5, 'diffusion exponent');
close(state.radiance[0], 32 * 0.2 ** 2 * (1 + 1.2 * (1 - 0.75 ** 3)), 'radiance/intensity and original-light boost');
close(relightLightParameters({ ...lamp, depth: 0, diffusion: 0 }, scene, 100, 50).position[2], 0.3, 'nearest lamp');
close(relightLightParameters({ ...lamp, depth: 0.5 }, scene, 100, 50).position[2], 2, 'reference lamp depth');
close(relightLightParameters({ ...lamp, depth: 1 }, scene, 100, 50).position[2], 4, 'far clamp');
close(relightLightParameters({ ...lamp, diffusion: 100 }, scene, 100, 50).radius, 3.2, 'max area radius');
assert.equal(buildRelightRenderState(image, 3, 1, analysis, { lights: Array(4).fill(lamp) }).lights.length, 3, 'three-light limit');

const row = new Uint8ClampedArray([120, 120, 120, 255, 120, 120, 120, 255]), surface = maps(2, 1);
surface.normals.set([0.8, 0, -0.6, -0.8, 0, -0.6]);
const settings = { originalLighting: 0, diffusion: 0, depth: 0.25, intensity: 20, y: 0, areaSamples: 1 };
const right = renderRelight(row, 2, 1, surface, { ...settings, x: 1.2 }), left = renderRelight(row, 2, 1, surface, { ...settings, x: -1.2 });
assert.ok(right[0] > right[4] + 10 && left[4] > left[0] + 10, 'surface-facing light switches with direction, rather than a color gradient');
const flat = renderRelight(row, 2, 1, maps(2, 1), { ...settings, x: 1.2 });
assert.ok(Math.abs(flat[0] - right[0]) + Math.abs(flat[4] - right[4]) > 20, 'actual normals contribute independently of distance falloff');
const warm = renderRelight(row, 2, 1, maps(2, 1), { ...settings, x: 0, color: [255, 130, 60] });
assert.ok(warm[0] > warm[1] && warm[1] > warm[2], 'sRGB light color decodes to radiance');

const pixel = new Uint8ClampedArray([255, 0, 128, 255]);
const input = prepareRelightInput(pixel, 1, 1);
assert.equal(input.inputWidth, 32); assert.equal(input.inputHeight, 32); assert.equal(input.width, 32); assert.equal(input.data[0], 1); assert.equal(input.data[1024], -1);
close(input.data[2048], 128 / 255 * 2 - 1, 'Shade NCHW -1..1');
const wide = prepareRelightInput(new Uint8ClampedArray(800 * 200 * 4), 800, 200);
assert.equal(wide.width, 640); assert.equal(wide.height, 160, 'Shade maxedge640 / 32 multiples');
const geomDepth = prepareGeometryInput(new Uint8ClampedArray(96 * 72 * 4).fill(255), 96, 72, 'depth');
assert.equal(geomDepth.width, 518); assert.equal(geomDepth.height, 392, 'DPT chooses resize nearest to 1 and rounds to 14');
close(geomDepth.data[0], (1 - 0.485) / 0.229, 'DA ImageNet RGB normalization');
const geomNormal = prepareGeometryInput(pixel, 1, 1, 'normals');
assert.equal(geomNormal.data[0], 1); assert.equal(geomNormal.data[1], 0); close(geomNormal.data[2], 128 / 255, 'MoGe RGB01 without external normalization');
const depthRamp = decodeDepthOutput(new Float32Array([1, 2, 3]), 3, 1);
assert.deepEqual([...depthRamp], [1, 0.5, 0], 'larger DA inverse-depth values are closer');
const normalOutput = decodeMogeNormals(new Float32Array([0.6, 0.3, -0.8]), new Float32Array([1]), 1, 1);
assert.ok(normalOutput.normals[0] > 0 && normalOutput.normals[1] > 0 && normalOutput.normals[2] < 0, 'MoGe stays OpenCV x-right/y-down/z-forward');
const tensor = new Float32Array(32 * 32 * 8); tensor.fill(1.0000001, 0, 1024); tensor.fill(-1, 1024, 2048); tensor.fill(1, 7168);
const decoded = decodeRelightOutput(tensor, 32, 32, 2, 1);
assert.deepEqual([...decoded.albedo.slice(0, 3)], [1, 0, 0.5]); assert.equal(decoded.shading[0], 1);

const mw = 48, mh = 40, points = new Float32Array(mw * mh * 3), mask = new Float32Array(mw * mh).fill(1), focal = 45;
for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = y * mw + x, z = 1 + x / mw * 3 + y / mh; points[i * 3] = (x + 0.5 - mw / 2) / focal * z; points[i * 3 + 1] = (y + 0.5 - mh / 2) / focal * z; points[i * 3 + 2] = z - 0.7; }
close(estimateMogeFov(points, mask, mw, mh), Math.atan(mw / (2 * focal)) * 360 / Math.PI, 'MoGe affine shift-independent FOV', 1e-4);
const photo = new Uint8ClampedArray(mw * mh * 4); for (let i = 0; i < mw * mh; i++) { photo.set([100 + i % 48, 110, 120, i % 17 ? 255 : 0], i * 4); }
const assembled = assembleRelightMaps(photo, mw, mh, { data: Float32Array.from({ length: mw * mh }, (_, i) => 1 + i % mw / mw), width: mw, height: mh },
  { points, mask, normals: Float32Array.from({ length: mw * mh * 3 }, (_, i) => i % 3 === 2 ? -0.8 : i % 3 === 0 ? 0.4 : 0.2), width: mw, height: mh },
  { ...maps(mw, mh), albedo: new Float32Array(mw * mh * 3).fill(0.5), shading: new Float32Array(mw * mh).fill(0.5) });
assert.equal(assembled.albedoSpace, 'linear'); assert.equal(assembled.positions.length, mw * mh * 3);
for (const field of ['depth', 'depthRaw', 'normals', 'albedo', 'detail', 'ao', 'farField', 'specularLikelihood']) assert.ok([...assembled[field]].every(Number.isFinite), `${field} finite`);
assert.ok(assembled.scene.referenceDepth > 0 && assembled.scene.intrinsics.fx > 0);
assert.ok(assembled.normals.some((v, i) => i % 3 !== 2 && Math.abs(v) > 0.1), 'AI normal detail survives depth fusion');



const sw = 96, sh = 96, sn = sw * sh, shaded = new Uint8ClampedArray(sn * 4), curved = new Float32Array(sn * 3), affine = new Float32Array(sn * 3);
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
  const i = y * sw + x, nx = 0.55 * Math.sin(x / sw * Math.PI * 2), ny = 0.3 * Math.sin(y / sh * Math.PI * 2), nz = -Math.sqrt(1 - nx * nx - ny * ny);
  curved.set([nx, ny, nz], i * 3); affine.set([(x - sw / 2) / 80, (y - sh / 2) / 80, 1], i * 3);
  const value = Math.round(encode(0.2 * (0.4 + 0.5 * Math.max(0, nx * -0.6 + nz * -0.8))) * 255);
  shaded.set([value, value, value, 255], i * 4);
}
const fitted = assembleRelightMaps(shaded, sw, sh, { data: new Float32Array(sn).fill(1), width: sw, height: sh },
  { normals: curved, points: affine, mask: new Float32Array(sn).fill(1), width: sw, height: sh },
  { ...maps(sw, sh), albedo: new Float32Array(sn * 3).fill(0.5), shading: new Float32Array(sn).fill(0.5) });
assert.ok(fitted.originalLight && fitted.originalLight.pixels >= 400 && fitted.originalLight.coefficients.length === 9, 'nine-term SH original lighting actually executes');
assert.ok(Number.isFinite(fitted.originalLight.r2) && [...fitted.materialConfidence.luma].every(Number.isFinite), 'light fit and material confidence are valid');

assert.throws(() => renderRelight(image, 1, 1, analysis), /尺寸/);
assert.throws(() => renderRelight(image, 3, 1, { width: 3, height: 1 }), /分析数据/);
const created = [], messages = [], savedWorker = globalThis.Worker;
globalThis.Worker = class {
  constructor() { created.push(this); this.terminated = false; }
  terminate() { this.terminated = true; }
  postMessage(message) {
    messages.push(message);
    queueMicrotask(() => this.onmessage?.({ data: message.type === 'analyze' ? { job: message.job, maps: maps(1, 1), sceneId: 1 } : { job: message.job, rgba: new Uint8ClampedArray(message.rgba), sceneId: 1, renderBackend: 'cpu' } }));
  }
};
try {
  const cancelled = analyzeRelight(pixel, 1, 1); disposeRelight(); const reopened = analyzeRelight(pixel, 1, 1);
  await assert.rejects(cancelled, /取消/); const cached = await reopened;
  assert.equal(created.length, 1, 'cancelled unresolved import creates no leaked Worker');
  const rendered = await renderRelightAsync(pixel, 1, 1, cached, { lights: [], originalLighting: 100 });
  assert.equal(rendered.renderBackend, 'cpu'); assert.equal(messages.at(-1).sceneId, 1); assert.equal(messages.at(-1).maps, undefined, 'preview sends sceneId instead of cloning G-buffer');
  disposeRelight(); assert.equal(created[0].terminated, true);
} finally { disposeRelight(); if (savedWorker === undefined) delete globalThis.Worker; else globalThis.Worker = savedWorker; }
console.log('✓ 重新打光：参考参数/线性光照/三模型预处理/OpenCV几何/法线融合/透明度/Worker场景缓存');
