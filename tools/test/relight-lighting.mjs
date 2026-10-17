import assert from 'node:assert/strict';
import { buildRelightMaterials } from '../../core/relight-materials.js';
import { relightPassQuality, relightPenumbraSigma, diffuseRelightIrradiance, blurRelightShadows, renderRelightLighting } from '../../core/relight-lighting.js';

assert.deepEqual(relightPassQuality(512, 512), { shadowScale: 0.5, areaSamples: 6, shadowSteps: 32, spillSamples: 48 });
assert.deepEqual(relightPassQuality(828, 828), { shadowScale: 1, areaSamples: 16, shadowSteps: 64, spillSamples: 64 });
assert.equal(relightPassQuality(512, 512, { areaSamples: 2.9, shadowSteps: 12.5, spillSamples: 4.2 }).areaSamples, 2);
assert.deepEqual(relightPassQuality(512, 512, { areaSamples: NaN, shadowSteps: NaN, spillSamples: NaN }), relightPassQuality(512, 512));
assert.ok(Math.abs(relightPenumbraSigma(0.8, 1, 100, 80, 1, 1) - 4.8) < 1e-8, 'blocker increases penumbra, capped at 1.6');
const w = 31, depth = new Float32Array(w).fill(1), impulse = new Float32Array(w * 3);
impulse.set([1, 1, 1], 15 * 3);
const scattered = diffuseRelightIrradiance(impulse, depth, w, 1, 4);
assert.ok(scattered[19 * 3] > scattered[19 * 3 + 2] * 5, 'red diffuses further than blue');
const steppedDepth = Float32Array.from({ length: w }, (_, i) => i < 16 ? 1 : 2), blockedScatter = diffuseRelightIrradiance(impulse, steppedDepth, w, 1, 4);
assert.ok(blockedScatter[19 * 3] < 0.001, 'SSS filter respects depth discontinuity');
const invalid = new Float32Array(w); invalid.fill(1, 16);
const noLeak = diffuseRelightIrradiance(impulse, depth, w, 1, 4, [1, 0.5, 0.25], invalid);
assert.ok(noLeak.every(v => v === 0), 'invalid/transparency irradiance cannot colour valid surface');
const shadow = Float32Array.from({ length: w * 4 }, (_, i) => i % 4 === 3 ? (Math.floor(i / 4) < 15 ? 1 : -1) : Math.floor(i / 4) < 15 ? 0 : 1);
const normal = Float32Array.from({ length: w * 3 }, (_, i) => i % 3 === 2 ? -1 : 0);
const soft = blurRelightShadows(shadow, depth, normal, w, 1, 4);
assert.ok(soft[14 * 4] > 0.1 && soft[14 * 4] < 0.8 && soft[16 * 4] > 0.2 && soft[16 * 4] < 0.9, 'hard visibility edge becomes a penumbra');

function maps(width, height) {
  const n = width * height;
  return { width, height, albedo: new Float32Array(n * 3).fill(0.2), originalLinear: new Float32Array(n * 3).fill(0.2), alpha: new Float32Array(n).fill(1), depth: new Float32Array(n).fill(1), depthRaw: new Float32Array(n).fill(1),
    normals: Float32Array.from({ length: n * 3 }, (_, i) => i % 3 === 2 ? -1 : 0), shading: new Float32Array(n).fill(1), detail: new Float32Array(n),
    scene: { near: 1, far: 3, referenceDepth: 1, scale: 1, intrinsics: { fx: width, fy: width, cx: width / 2, cy: height / 2 } } };
}
const faceMaps = maps(40, 40), landmarks = new Float32Array(478 * 3), eyeMask = new Float32Array(1600), lips = new Float32Array(1600);
for (let i = 0; i < 478; i++) landmarks.set([20, 20, 1], i * 3);
faceMaps.faces = [{ landmarks, box: [8, 4, 32, 36], irises: [{ x: 15, y: 16, r: 3 }, { x: 25, y: 16, r: 2 }] }];
faceMaps.faceMask = new Float32Array(1600).fill(1); faceMaps.eyesMask = eyeMask; faceMaps.lipsMask = lips;
const material = buildRelightMaterials(faceMaps);
assert.ok(Math.abs(material.scatterPx - 0.64) < 1e-8, 'face scatter uses .02 of largest face dimension');
assert.equal(material.eyes.length, 1, 'iris smaller than 2.5px is omitted');
assert.ok(material.prototype?.samples >= 200 && material.prototype.scales[0] >= 0.035 && material.prototype.scales[2] >= 0.4, 'robust MAD material prototype uses measured face pixels');
assert.ok([...material.regions, ...material.surface].every(Number.isFinite));
const noFace = maps(8, 8); noFace.albedo.set(new Float32Array(192).fill(0.2));
const photo = new Uint8ClampedArray(256); for (let i = 0; i < 64; i++) photo.set([120, 110, 100, i === 0 ? 0 : i === 1 ? 128 : 255], i * 4);
noFace.alpha[0] = 0;
const identity = renderRelightLighting(photo, 8, 8, noFace, { originalLighting: 100, lights: [] });
assert.deepEqual(identity, photo);
const settings = { originalLighting: 50, areaSamples: 2, shadowSteps: 12, spillSamples: 8, lights: [{ x: 0, y: 0, depth: 0.25, intensity: 12, diffusion: 30, color: [255, 255, 255] }] };
const baseline = renderRelightLighting(photo, 8, 8, noFace, settings);
assert.ok(baseline.some((v, i) => i % 4 !== 3 && v !== photo[i]), 'full CPU renderer actually shades');
assert.ok(baseline.every((v, i) => i % 4 !== 3 || v === photo[i]), 'source alpha remains exact');
assert.deepEqual(baseline.slice(0, 4), photo.slice(0, 4), 'transparent hidden RGB stays exact');
const custom = { ...noFace, materials: { regions: new Float32Array(256), surface: Float32Array.from({ length: 256 }, (_, i) => i % 4 === 0 ? 0.5 : 0), scatterPx: 1, eyes: [{ x: 4, y: 4, r: 3, z: 1 }] } };
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x + 0.5 - 4, y + 0.5 - 4) < 3) custom.materials.regions[(y * 8 + x) * 4 + 3] = 1;
const eyeOff = renderRelightLighting(photo, 8, 8, { ...custom, materials: { ...custom.materials, eyes: [] } }, settings), eyeOn = renderRelightLighting(photo, 8, 8, custom, settings);
assert.ok(eyeOn.some((v, i) => i % 4 !== 3 && v > eyeOff[i] + 10), 'iris catchlight responds to actual light direction');
console.log('✓ 重新打光多pass：blocker柔化/波长扩散/深度边界/MAD材质/完整CPU降级/眼高光/透明度');
