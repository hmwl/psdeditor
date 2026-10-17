



import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlaywright } from './pw.mjs';
import { createPsd } from '../../core/psd-new.js';
import { applyEdits } from '../../core/psd-edit.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { RELIGHT_DEFAULTS, decodeMogeNormals, renderRelight, relightLightParameters, buildRelightRenderState } from '../../core/relight.js';

const PW = await loadPlaywright();
if (!PW) { console.log('跳过：没有 Playwright（设置 PLAYWRIGHT_MODULE 可使用现有安装）'); process.exit(0); }
const port = process.argv[2] || process.env.PORT || 8789;
const origin = `http://127.0.0.1:${port}`;
const readyTimeout = Math.max(30000, Number(process.env.PSD_EDITOR_RELIGHT_TIMEOUT) || 180000);
const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpsd-relight-'));
const requiredModels = [
  { id: 'depth', name: 'Depth Anything V2', filename: 'depth-anything-v2-small-fp16.onnx' },
  { id: 'normals', name: 'MoGe-2', filename: 'moge-2-vits-normal.onnx' },
  { id: 'intrinsics', name: 'ShadeNet-3.2', filename: 'shadenet-fp16.onnx' },
];
const file = path.join(tempDir, 'relight.psd');
const W = 96, H = 72, LEFT = 13, TOP = 11, IDX = 1;
const pixels = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4;
  const sphere = Math.max(0, 1 - Math.hypot((x - W / 2) / 35, (y - H / 2) / 28));
  pixels[o] = 45 + x + Math.round(sphere * 55);
  pixels[o + 1] = 50 + y + Math.round(sphere * 85);
  pixels[o + 2] = 65 + Math.round((x + y) / 2) + Math.round(sphere * 30);
  pixels[o + 3] = x < 4 || y < 3 ? 0 : x < 12 ? Math.round((x - 4) * 255 / 8) : 255;
}
const blank = createPsd({ width: 128, height: 96, background: 'white', name: 'Relight acceptance' });
const fixture = applyEdits(blank, [
  { op: 'createLayer', at: IDX, name: 'Offset translucent scene' },
  { op: 'replaceLayerPixels', index: IDX, rgba: { data: pixels, width: W, height: H },
    bounds: { left: LEFT, top: TOP, right: LEFT + W, bottom: TOP + H } },
]).buffer;
fs.writeFileSync(file, new Uint8Array(fixture));

let browser, page, failures = 0, tracking = false;
const requests = [], modelTimings = [], pageErrors = [];
const modelPath = url => /\.(?:onnx|task)(?:$|\?)|\/models?\//i.test(url);
const equal = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
const check = (label, condition, extra) => {
  if (!condition) failures++;
  console.log(condition ? '✓' : '✗', label, condition || extra === undefined ? '' : JSON.stringify(extra));
};

function checkReferenceContract() {
  const defaults = { x: -0.65, y: -0.7, depth: 0.25, intensity: 20, diffusion: 50, originalLighting: 75 };
  check('内核参数默认值与参考站一致', Object.entries(defaults).every(([key, value]) => RELIGHT_DEFAULTS[key] === value)
    && equal([...RELIGHT_DEFAULTS.color], [255, 255, 255]), RELIGHT_DEFAULTS);
  const source = Float32Array.from([0, 0, -1, 0.6, 0, -0.8, -0.6, 0, -0.8, 0, 0.6, -0.8, 0, -0.6, -0.8]);
  const decoded = decodeMogeNormals(source, new Float32Array(5).fill(1), 5, 1);
  check('MoGe法线保持参考站OpenCV坐标', source.every((value, i) => Math.abs(value - decoded.normals[i]) < 1e-6),
    [...decoded.normals]);
  const dot = (i, light) => decoded.normals[i * 3] * light[0] + decoded.normals[i * 3 + 1] * light[1] + decoded.normals[i * 3 + 2] * light[2];
  check('OpenCV正面法线朝向相机灯，右下法线朝向右下灯', dot(0, [0, 0, -1]) > 0 && dot(0, [0, 0, 1]) < 0
    && dot(1, [0.9, 0, -0.436]) > 0 && dot(2, [0.9, 0, -0.436]) < 0
    && dot(3, [0, 0.9, -0.436]) > 0 && dot(4, [0, 0.9, -0.436]) < 0);
  
  const material = { width: 1, height: 2, albedo: new Float32Array(6).fill(0.2), albedoSpace: 'linear',
    shading: new Float32Array(2).fill(1), depth: new Float32Array(2).fill(1),
    normals: Float32Array.from([0.6, 0, -0.8, -0.6, 0, -0.8]),
    positions: Float32Array.from([0, -0.5, 1, 0, 0.5, 1]),
    scene: { near: 1, far: 3, referenceDepth: 1, scale: 1, intrinsics: { fx: 1, fy: 1, cx: 0.5, cy: 1 } } };
  const photo = Uint8ClampedArray.from([100, 100, 100, 255, 100, 100, 100, 255]);
  const lamp = { ...RELIGHT_DEFAULTS, y: 0, depth: 0.25, intensity: 8, diffusion: 0, color: [255, 255, 255] };
  const right = renderRelight(photo, 1, 2, material, { originalLighting: 0, lights: [{ ...lamp, x: 1.5 }] });
  const left = renderRelight(photo, 1, 2, material, { originalLighting: 0, lights: [{ ...lamp, x: -1.5 }] });
  check('真实渲染使用法线N·L而非仅光源距离渐变', right[0] > right[4] + 8 && left[4] > left[0] + 8,
    { right: [right[0], right[4]], left: [left[0], left[4]] });
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  const scene = { referenceDepth: 2, far: 6, scale: 4, intrinsics: { fx: 2, fy: 2, cx: 1, cy: 1 } };
  const white = { ...RELIGHT_DEFAULTS, color: [1, 1, 1] };
  const canonical = relightLightParameters(white, scene, 2, 2, 75);
  check('参考站XY相机投影、默认近远与扩散指数映射', close(canonical.position[0], -0.65)
    && close(canonical.position[1], -0.7) && close(canonical.position[2], 1.15)
    && close(canonical.radius, 0.015 * 4 * (0.8 / 0.015) ** 0.5), canonical);
  check('参考站强度平方与原光灯强补偿映射', canonical.radiance.every(value => close(value,
    32 * 0.2 ** 2 * (1 + 1.2 * (1 - 0.75 ** 3)))), canonical.radiance);
  check('参考站近远位置的两段映射', [0, 0.25, 0.5, 1].every((depth, i) => close(
    relightLightParameters({ ...white, depth }, scene, 2, 2).position[2], [0.3, 1.15, 2, 4][i])));
  check('参考站扩散半径两端值', close(relightLightParameters({ ...white, diffusion: 0 }, scene, 2, 2).radius, 0.06)
    && close(relightLightParameters({ ...white, diffusion: 100 }, scene, 2, 2).radius, 3.2));
  check('参考站原始光照立方映射', [0, 25, 50, 75, 100].every(value => close(
    buildRelightRenderState(photo, 1, 2, material, { originalLighting: value, lights: [] }).originalGain, (value / 100) ** 3)));
}
const snapshot = () => page.evaluate(idx => {
  const F = window.__psd_editor, s = F.state, l = s.doc.layers[idx];
  return { rgba: Array.from(l.rgba), w: l.width, h: l.height, bounds: { ...l.bounds }, layers: s.doc.layers.length,
    undo: s.brushUndo, redo: s.brushRedo, history: F.historyEntries().items.map(e => typeof e === 'string' ? e : e.label) };
}, IDX);
const dialog = () => page.locator('.relight-dlg');
const apply = () => dialog().locator('[data-relight-apply]');
const cancel = () => dialog().locator('[data-relight-cancel]');
const canvasHash = () => dialog().locator('[data-relight-canvas]').evaluate(canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
  return hash >>> 0;
});
const parameterSnapshot = () => dialog().evaluate(d => Array.from(d.querySelectorAll('input,select'), el => ({
  label: el.getAttribute('aria-label') || el.closest('label')?.textContent || el.type,
  value: el.value, checked: el.type === 'checkbox' ? el.checked : undefined,
})));
const installLoadingObserver = () => dialog().evaluate(d => {
  const samples = [], expected = JSON.stringify(Array.from(d.querySelectorAll('input,select'), el => [el.value, el.type === 'checkbox' ? el.checked : null]));
  const record = () => {
    const cancel = d.querySelector('[data-relight-cancel]');
    const exceptions = new Set([cancel, ...Array.from(d.querySelectorAll('button')).filter(el => el.textContent === '重试')]);
    const enabled = Array.from(d.querySelectorAll('input,select,button')).filter(el => !el.disabled && !exceptions.has(el));
    const canvas = d.querySelector('[data-relight-canvas]'), width = Math.min(96, canvas.width), height = Math.min(72, canvas.height);
    let imageHash = 2166136261;
    if (width && height) {
      const data = canvas.getContext('2d').getImageData(Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2), width, height).data;
      for (const byte of data) imageHash = Math.imul(imageHash ^ byte, 16777619);
    }
    samples.push({ phase: d.dataset.phase, ready: d.dataset.ready, frames: Number(d.dataset.previewFrames) || 0,
      quality: d.dataset.previewQuality, locked: enabled.length === 0, enabled: enabled.map(el => el.getAttribute('aria-label') || el.textContent),
      cancellable: !!cancel && !cancel.disabled, pointerEvents: canvas.style.pointerEvents, imageHash: imageHash >>> 0,
      parametersUnchanged: expected === JSON.stringify(Array.from(d.querySelectorAll('input,select'), el => [el.value, el.type === 'checkbox' ? el.checked : null])) });
  };
  record(); const observer = new MutationObserver(record);
  observer.observe(d, { attributes: true, attributeFilter: ['data-phase', 'data-ready', 'data-preview-frames'] });
  d.__relightLoadingTest = { samples, observer };
});
const readLoadingObserver = () => dialog().evaluate(d => {
  d.__relightLoadingTest?.observer.disconnect();
  return d.__relightLoadingTest?.samples || [];
});
const checkGenericVisibleText = async phase => {
  const text = await dialog().innerText();
  check(`${phase}界面只显示光影提示，不暴露模型、执行位置、加载或百分比`, !/Depth|MoGe|Shade|Face|ONNX|加载|百分比|浏览器|Worker|WebGPU|本地|%/i.test(text), text);
};
const watchProcessingHints = () => dialog().evaluate(d => {
  const status = d.querySelector('[data-relight-status]'), state = { messages: [status.textContent], animated: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, observer: null };
  state.observer = new MutationObserver(() => { state.messages.push(status.textContent);
    state.animated ||= status.getAnimations().some(animation => animation.playState === 'running'); });
  state.observer.observe(status, { childList: true, characterData: true, subtree: true });
  d.__relightHintTest = state;
});
const readProcessingHints = () => dialog().evaluate(d => {
  const state = d.__relightHintTest; state.observer.disconnect();
  return { messages: state.messages, animated: state.animated, reducedMotion: state.reducedMotion };
});
const tryLockedInteractions = async () => {
  const before = await parameterSnapshot(), canvas = dialog().locator('[data-relight-canvas]');
  const box = await canvas.boundingBox(), field = await dialog().locator('[data-relight-strength]').first().boundingBox();
  const add = await dialog().getByRole('button', { name: '+ 添加', exact: true }).boundingBox();
  
  await page.mouse.click(field.x + field.width * 0.9, field.y + field.height / 2);
  await page.mouse.click(add.x + add.width / 2, add.y + add.height / 2);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65); await page.mouse.up();
  await page.mouse.wheel(0, 150); await page.keyboard.press('ArrowRight');
  check('加载时真实input/button/canvas操作不能修改参数', JSON.stringify(before) === JSON.stringify(await parameterSnapshot()));
  check('加载时取消按钮仍可用', !await cancel().isDisabled());
};
const beginPreviewProbe = async kind => dialog().evaluate((d, type) => {
  const canvas = d.querySelector('[data-relight-canvas]');
  const hash = () => {
    const width = Math.min(96, canvas.width), height = Math.min(72, canvas.height);
    const data = canvas.getContext('2d').getImageData(Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2), width, height).data;
    let value = 2166136261; for (const byte of data) value = Math.imul(value ^ byte, 16777619); return value >>> 0;
  };
  const state = { type, running: true, started: performance.now(), inputs: 0, inputTimes: [], paints: [], startFrame: Number(d.dataset.previewFrames) || 0,
    startHash: hash(), lastFrame: Number(d.dataset.previewFrames) || 0, observer: null, timer: null };
  const record = () => { const frame = Number(d.dataset.previewFrames) || 0; if (frame <= state.lastFrame || !state.running) return;
    state.lastFrame = frame; state.paints.push({ frame, hash: hash(), quality: d.dataset.previewQuality, inputs: state.inputs, time: performance.now() - state.started }); };
  state.observer = new MutationObserver(record); state.observer.observe(d, { attributes: true, attributeFilter: ['data-preview-frames'] });
  d.__relightPreviewProbe = state;
  if (type === 'range') {
    const field = d.querySelector('[data-relight-strength]');
    state.timer = setInterval(() => { if (!state.running) return; state.inputs++; state.inputTimes.push(performance.now());
      field.value = String(8 + (state.inputs * 7) % 31); field.dispatchEvent(new Event('input', { bubbles: true })); }, 8);
  } else {
    state.move = () => { if (!state.running) return; state.inputs++; state.inputTimes.push(performance.now()); };
    canvas.addEventListener('pointermove', state.move);
  }
  return { frame: state.startFrame, hash: state.startHash };
}, kind);
const previewProbe = () => dialog().evaluate(d => {
  const p = d.__relightPreviewProbe, gaps = p.inputTimes.slice(1).map((time, i) => time - p.inputTimes[i]); gaps.sort((a, b) => a - b);
  const interactivePaints = p.paints.filter(item => item.quality === 'drag' && item.inputs > 0);
  return { running: p.running, inputs: p.inputs, frameDelta: p.lastFrame - p.startFrame, paints: p.paints,
    interactivePaints, uniqueHashes: new Set(interactivePaints.map(item => item.hash)).size, medianInputGapMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    elapsedMs: performance.now() - p.started };
});
const endPreviewProbe = () => dialog().evaluate(d => {
  const p = d.__relightPreviewProbe; p.running = false; clearInterval(p.timer); p.observer.disconnect();
  if (p.move) d.querySelector('[data-relight-canvas]').removeEventListener('pointermove', p.move);
  const field = d.querySelector('[data-relight-strength]'); if (p.type === 'range') field.dispatchEvent(new Event('change', { bubbles: true }));
});
const waitIdlePreview = async afterFrame => {
  await page.waitForFunction(frame => {
    const d = document.querySelector('.relight-dlg');
    return d && Number(d.dataset.previewFrames) > frame && d.dataset.previewQuality === 'idle';
  }, afterFrame, { timeout: readyTimeout });
};
const continuousPreviewAcceptance = async () => {
  await dialog().getByLabel('显示光源', { exact: true }).uncheck();
  
  check('实时预览验收使用结果画面且不把光源标记当作图像变化', await dialog().locator('[data-relight-view]').inputValue() === 'result');
  await beginPreviewProbe('range');
  let range;
  try {
    await page.waitForFunction(() => { const p = document.querySelector('.relight-dlg').__relightPreviewProbe, paints = p.paints.filter(item => item.quality === 'drag' && item.inputs > 0);
      return p.running && paints.length >= 3 && new Set(paints.map(item => item.hash)).size >= 3; }, null, { timeout: 20000 });
    range = await previewProbe();
    check('持续8ms range input未结束时多次完成真实图像paint', range.running && range.interactivePaints.length >= 3 && range.uniqueHashes >= 3, range);
  } finally { await endPreviewProbe(); }
  await waitIdlePreview(range?.paints.at(-1)?.frame || 0);
  check('range change结束后明确恢复idle质量', await dialog().evaluate(d => d.dataset.previewQuality) === 'idle');

  const canvas = dialog().locator('[data-relight-canvas]'), box = await canvas.boundingBox();
  const scale = Math.min(box.width / W, box.height / H) * 0.94, image = { x: box.x + (box.width - W * scale) / 2, y: box.y + (box.height - H * scale) / 2 };
  await page.mouse.move(image.x + W * scale * 0.3, image.y + H * scale * 0.35);
  await page.mouse.down(); await beginPreviewProbe('mouse');
  const deadline = Date.now() + 20000; let mouse, moves = 0;
  try {
    
    while (Date.now() < deadline) {
      const phase = moves++ * 0.075;
      await page.mouse.move(image.x + W * scale * (0.5 + 0.32 * Math.sin(phase)), image.y + H * scale * (0.5 + 0.28 * Math.cos(phase * 0.83)));
      if (moves % 32 === 0) { mouse = await previewProbe(); if (mouse.interactivePaints.length >= 3 && mouse.uniqueHashes >= 3) break; }
    }
    mouse = await previewProbe();
    check('鼠标持续按住且未mouseup前多次完成真实图像paint', mouse.running && mouse.interactivePaints.length >= 3 && mouse.uniqueHashes >= 3, mouse);
  } finally { await endPreviewProbe(); await page.mouse.up(); }
  await waitIdlePreview(mouse?.paints.at(-1)?.frame || 0);
  check('mouseup后明确恢复idle质量', await dialog().evaluate(d => d.dataset.previewQuality) === 'idle');
  console.log('  持续交互预览证据', JSON.stringify({ range, mouse }));
  await dialog().getByRole('button', { name: '重置当前光源', exact: true }).click();
  const frame = await dialog().evaluate(d => Number(d.dataset.previewFrames)); await waitIdlePreview(frame);
};
const startAction = async () => {
  
  await page.evaluate(() => window.__psd_editor.actions.run('ai.relight'));
  await dialog().waitFor({ state: 'visible', timeout: 30000 });
};
const waitReady = async () => {
  const started = Date.now();
  await dialog().evaluate(d => {
    const times = { start: performance.now(), analyzing: null, ready: null };
    const record = () => {
      if (d.dataset.phase === 'analyzing' && times.analyzing === null) times.analyzing = performance.now();
      if (d.dataset.phase === 'ready' && times.ready === null) times.ready = performance.now();
    };
    record();
    const observer = new MutationObserver(record);
    observer.observe(d, { attributes: true, attributeFilter: ['data-phase'] });
    d.__relightTestTiming = { times, observer };
  });
  const progressReport = setInterval(() => { page.evaluate(() => {
    const d = document.querySelector('.relight-dlg');
    return { phase: d?.dataset.phase, ready: d?.dataset.ready, previewFrames: d?.dataset.previewFrames,
      status: d?.querySelector('[data-relight-status]')?.textContent, models: d?.dataset.modelCount };
  }).then(state => console.log('  等待真实分析/首帧', JSON.stringify(state))).catch(() => {}); }, 15000);
  try {
    await page.waitForFunction(() => {
      const d = document.querySelector('.relight-dlg');
      const button = d && d.querySelector('[data-relight-apply]');
      const error = d && (d.dataset.relightPhase === 'error' || d.dataset.phase === 'error');
      return error || (button && !button.disabled);
    }, null, { timeout: readyTimeout });
  } finally { clearInterval(progressReport); }
  const info = await dialog().evaluate(d => {
    const timing = d.__relightTestTiming;
    timing?.observer.disconnect();
    let models = [], events = [], faceInference = null;
    try { models = JSON.parse(d.dataset.models || '[]'); } catch {  }
    try { events = JSON.parse(d.dataset.analysisEvents || '[]'); } catch {  }
    try { faceInference = JSON.parse(d.dataset.faceInference || 'null'); } catch {  }
    return { text: d.querySelector('[data-relight-status]')?.textContent || '', dataset: { ...d.dataset }, models, events, faceInference,
      firstInferenceToReadyMs: timing?.times.analyzing !== null && timing?.times.ready !== null
        ? Math.round(timing.times.ready - timing.times.analyzing) : null };
  });
  if (await apply().isDisabled()) throw new Error('本地 AI 没能就绪：' + info.text);
  await checkGenericVisibleText('就绪');
  for (const expected of requiredModels) {
    const record = info.models.find(model => model.id === expected.id);
    const hasShape = shape => Array.isArray(shape) && shape.length > 0 && shape.every(v => Number.isInteger(v) && v > 0);
    check(`${expected.name} 实际推理完成并返回有效张量记录`, !!record && ['wasm', 'webgpu', 'webgpu/wasm'].includes(record.backend)
      && Number(record.runMs) > 0 && hasShape(record.inputShape) && hasShape(record.outputShape), record);
    const stages = info.events.filter(event => event.model === expected.id || event.id === expected.id);
    check(`${expected.name} 留存加载与执行完成阶段`, stages.some(event => event.stage === 'model')
      && stages.some(event => event.stage === 'analyze' && event.completed >= info.models.findIndex(model => model.id === expected.id) + 1), stages);
  }
  check('Face Landmarker 实际执行；无脸图片也可以继续打光', info.faceInference?.id === 'face-landmarker'
    && info.faceInference.backend === 'cpu' && info.faceInference.runtimeVersion === '1.0.1'
    && Number.isInteger(info.faceInference.faceCount) && info.faceInference.faceCount >= 0
    && info.faceInference.inputShape?.[0] === H && info.faceInference.inputShape?.[1] === W, info.faceInference);
  check('完整四模型分析终态就绪', info.events.some(event => event.stage === 'ready' && event.completed === 4 && event.total === 4), info.events.at(-1));
  console.log('  本地四模型就绪', JSON.stringify({ waitMs: Date.now() - started, analysisMs: Number(info.dataset.analysisMs),
    inferenceMs: info.models.reduce((sum, model) => sum + (Number(model.runMs) || 0), 0), models: info.models,
    faceInference: info.faceInference, firstInferenceToReadyMs: info.firstInferenceToReadyMs }));
  return info;
};
const finishAction = async () => {
  await dialog().waitFor({ state: 'hidden', timeout: readyTimeout });
  await page.waitForFunction(() => window.__psd_editor.actions.enabled('ai.relight'), null, { timeout: readyTimeout });
  const error = await page.locator('#err').textContent();
  if (error) throw new Error(error);
  return true;
};
const setStrength = value => dialog().locator('[data-relight-strength]').first().evaluate((el, v) => {
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, value);

try {
  checkReferenceContract();
  browser = await PW.chromium.launch({ executablePath: exe });
  page = await browser.newPage({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.context().on('request', request => {
    if (tracking) requests.push({ url: request.url(), method: request.method(), type: request.resourceType() });
  });
  page.context().on('requestfinished', request => {
    if (tracking && /\.onnx(?:$|\?)|\.wasm(?:$|\?)/i.test(request.url())) {
      const timing = request.timing();
      modelTimings.push({ path: new URL(request.url()).pathname, downloadMs: Math.round(timing.responseEnd - timing.responseStart),
        totalMs: Math.round(timing.responseEnd) });
    }
  });
  const editorResponse = await page.goto(origin + (process.env.PSD_EDITOR_TEST_EDITOR || '/editor'));
  if (process.env.PSD_EDITOR_RELIGHT_REQUIRE_CSP === '1') {
    const csp = editorResponse.headers()['content-security-policy'] || '';
    check('严格同源 CSP 已开启', /worker-src 'self'/.test(csp) && /connect-src 'self'/.test(csp)
      && /'wasm-unsafe-eval'/.test(csp), csp);
  }
  await page.waitForFunction(() => window.__psd_editor && window.__psd_editor.actions, null, { timeout: 60000 });
  await page.evaluate(() => { window.__fpDialog = d => d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : true; });

  const menus = await page.locator('.menu-title').evaluateAll(titles => titles.map(t => ({ id: t.dataset.menu, label: t.textContent })));
  const aiIndex = menus.findIndex(m => m.id === 'ai'), helpIndex = menus.findIndex(m => m.id === 'help');
  check('Ai 入口位于帮助菜单左侧', aiIndex >= 0 && helpIndex === aiIndex + 1 && menus[aiIndex].label === 'Ai', menus);
  await page.locator('.menu-title[data-menu="ai"]').click();
  const menuItem = page.getByRole('menuitem', { name: /^重新打光/ });
  check('无文档时重新打光置灰', await menuItem.evaluate(el => el.classList.contains('disabled'))
    && !await page.evaluate(() => window.__psd_editor.actions.enabled('ai.relight')));
  await page.keyboard.press('Escape');

  await page.setInputFiles('#file', file);
  await page.waitForFunction(() => window.__psd_editor.state.doc && window.__psd_editor.state.doc.layers.length === 2, null, { timeout: 60000 });
  await page.evaluate(idx => window.__psd_editor.selectLayers([idx]), IDX);
  await page.waitForFunction(idx => window.__psd_editor.state.selLayer === idx && window.__psd_editor.actions.enabled('ai.relight'), IDX, { timeout: 30000 });
  const base = await snapshot();
  check('测试图层包含偏移、透明及半透明像素', base.bounds.left === LEFT && base.bounds.top === TOP
    && base.rgba.some((v, i) => i % 4 === 3 && v === 0) && base.rgba.some((v, i) => i % 4 === 3 && v > 0 && v < 255));

  tracking = true;
  
  const heldModelPattern = /\/vendor\/relight\/.*\.(?:onnx|task)(?:\?|$)/;
  let releaseLoading, announceHeld, heldRequest = false;
  const loadingGate = new Promise(resolve => { releaseLoading = resolve; }), modelHeld = new Promise(resolve => { announceHeld = resolve; });
  const holdModel = async route => { if (!heldRequest) { heldRequest = true; announceHeld(); await loadingGate; } await route.continue().catch(() => {}); };
  await page.context().route(heldModelPattern, holdModel);
  await page.locator('.menu-title[data-menu="ai"]').click();
  await menuItem.click();
  await dialog().waitFor({ state: 'visible', timeout: 30000 });
  check('真实菜单打开重新打光工作区', /重新打光/.test(await dialog().innerText()));
  try {
    await Promise.race([modelHeld, page.waitForTimeout(15000).then(() => { throw new Error('未能建立真实模型加载锁定时序'); })]);
    await installLoadingObserver(); await watchProcessingHints(); await tryLockedInteractions();
    await page.waitForFunction(() => document.querySelector('.relight-dlg').__relightHintTest.messages.length >= 3, null, { timeout: 6500 });
    const hints = await readProcessingHints();
    check('等待期间泛化提示会随机轮换，相邻提示不重复', hints.messages.length >= 3
      && hints.messages.slice(1).every((text, i) => text !== hints.messages[i])
      && hints.messages.every(text => /正在/.test(text) && !/Depth|MoGe|Shade|Face|ONNX|加载|百分比|浏览器|Worker|WebGPU|本地|%/i.test(text)), hints);
    check('正常动效偏好下提示带轻微跳动', hints.reducedMotion || hints.animated, hints);
    await checkGenericVisibleText('等待');
    const locked = await readLoadingObserver();
    check('模型加载阶段所有可变控件锁定且画布不可操作', locked.every(s => s.ready !== 'true' && s.locked && s.cancellable && s.pointerEvents === 'none'), locked);
    await cancel().click();
  } finally { releaseLoading(); await page.context().unroute(heldModelPattern, holdModel); }
  await finishAction();
  const cancelled = await snapshot();
  check('模型加载中取消保留原像素和撤销记录', equal(base.rgba, cancelled.rgba) && base.undo === cancelled.undo
    && base.layers === cancelled.layers);

  const readyStarted = Date.now();
  await startAction();
  await installLoadingObserver();
  await waitReady();
  const initialization = await readLoadingObserver(), pending = initialization.filter(s => s.ready !== 'true'), firstReady = initialization.find(s => s.ready === 'true');
  const lastOriginalPaint = initialization.filter(s => s.frames === 0).at(-1);
  check('从加载到first preview完成前保持全部控件锁定且仍可取消', pending.length > 0 && pending.every(s => s.locked && s.cancellable)
    && pending.some(s => s.phase === 'previewing'), initialization);
  check('首次解锁时已有真实idle结果画面，不只是模型分析完成', !!firstReady && firstReady.frames >= 1 && firstReady.quality === 'idle'
    && !!lastOriginalPaint && firstReady.imageHash !== lastOriginalPaint.imageHash, { firstReady, lastOriginalPaint });
  console.log(`  首次真实模型总就绪耗时 ${Date.now() - readyStarted} ms`);
  const controls = await dialog().innerText();
  check('光源参数与参考站一致', ['水平位置', '垂直位置', '近远位置', '光照强度', '光源扩散', '光源颜色', '原始光照'].every(t => controls.includes(t)));
  const axes = [
    ['水平位置', -200, 200, -65], ['垂直位置', -200, 200, -70], ['近远位置', 0, 100, 25],
    ['光照强度', 0, 100, 20], ['光源扩散', 0, 100, 50], ['原始光照', 0, 100, 75],
  ];
  for (const [label, min, max, value] of axes) {
    const field = await dialog().locator(`input[type="range"][aria-label="${label}"]`).evaluate(el =>
      ({ min: Number(el.min), max: Number(el.max), value: Number(el.value) }));
    check(`${label}范围和默认值与参考站一致`, field.min === min && field.max === max && field.value === value, field);
  }
  check('默认光源为白色', await dialog().locator('input[type="color"][aria-label="光源颜色"]').inputValue() === '#ffffff');
  const addLight = dialog().getByRole('button', { name: '+ 添加', exact: true });
  const removeLight = dialog().getByRole('button', { name: '移除', exact: true });
  const lightList = dialog().locator('select[aria-label="当前光源"]');
  check('至少保留一个光源', await removeLight.isDisabled());
  await addLight.click(); await addLight.click();
  check('参考站最多三个光源', await lightList.locator('option').count() === 3 && await addLight.isDisabled());
  await removeLight.click(); await removeLight.click();
  check('删除额外光源后恢复初始光源', await lightList.locator('option').count() === 1 && await removeLight.isDisabled()
    && Number(await dialog().locator('[data-relight-strength]').inputValue()) === 20);
  const view = dialog().locator('[data-relight-view]');
  const viewInfo = await view.evaluate(el => ({ selected: el.selectedOptions[0].textContent, labels: Array.from(el.options, o => o.textContent) }));
  check('默认直接显示打光结果并提供原图、对比、深度、法线视图', await view.inputValue() === 'result' && /打光结果/.test(viewInfo.selected)
    && ['原图', '打光结果', '对比', '深度', '法线'].every(t => viewInfo.labels.some(label => label.includes(t))), viewInfo);
  const preview = dialog().locator('[data-relight-preview]');
  check('预览开关默认开启', await preview.isChecked());
  const defaultResult = await canvasHash();
  await preview.uncheck();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const originalCanvas = await canvasHash();
  check('默认result画面已经显示实际重新打光像素', defaultResult !== originalCanvas);
  check('关闭预览不写入文档', equal(base.rgba, (await snapshot()).rgba));
  await preview.check();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await continuousPreviewAcceptance();

  
  await cancel().click(); await finishAction();
  await page.evaluate(async () => { for (const name of await caches.keys()) if (name.startsWith('image-models-relight-')) {
    const cache = await caches.open(name); for (const request of await cache.keys()) if (request.url.includes('depth-anything-v2-small-fp16.onnx')) await cache.delete(request);
  } });
  const failingModelPattern = /\/vendor\/relight\/depth-anything-v2-small-fp16\.onnx(?:\?|$)/;
  let rejectedModel = 0;
  const failModelOnce = async route => { if (!rejectedModel++) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'relight retry acceptance: one intentional model GET failure' }); else await route.continue(); };
  await page.context().route(failingModelPattern, failModelOnce);
  try {
    await startAction();
    await page.waitForFunction(() => document.querySelector('.relight-dlg')?.dataset.phase === 'error', null, { timeout: readyTimeout });
    const retry = dialog().getByRole('button', { name: '重试', exact: true });
    check('模型失败仍锁定参数且提供取消/重试', rejectedModel === 1 && await retry.isVisible() && !await retry.isDisabled()
      && !await cancel().isDisabled() && await apply().isDisabled()
      && await dialog().locator('input,select').evaluateAll(fields => fields.every(el => el.disabled)));
    await checkGenericVisibleText('失败');
    const errorDetail = await dialog().evaluate(d => d.dataset.error);
    check('失败详情保留于诊断元数据且不进入可见提示', /503/.test(errorDetail || '') && !await dialog().innerText().then(text => text.includes(errorDetail)), errorDetail);
    const beforeRetry = await snapshot();
    check('模型失败未写入文档或撤销历史', equal(base.rgba, beforeRetry.rgba) && base.undo === beforeRetry.undo);
    await page.context().unroute(failingModelPattern, failModelOnce);
    await retry.click(); await installLoadingObserver(); await waitReady();
    check('重试真实模型后first result就绪并重新开放参数', !await apply().isDisabled() && await view.inputValue() === 'result'
      && Number(await dialog().evaluate(d => d.dataset.previewFrames)) >= 1);
  } finally { await page.context().unroute(failingModelPattern, failModelOnce).catch(() => {}); }

  const beforePreview = await canvasHash();
  const strength = await dialog().locator('[data-relight-strength]').first().evaluate(el => {
    const min = Number(el.min) || 0, max = Number(el.max) || 200, step = Number(el.step) || 1;
    const desired = min + (max - min) * (Number(el.value) > min + (max - min) * 0.7 ? 0.35 : 0.95);
    return Math.min(max, Math.max(min, Math.round(desired / step) * step));
  });
  await setStrength(strength);
  await page.waitForFunction(old => {
    const canvas = document.querySelector('.relight-dlg [data-relight-canvas]');
    if (!canvas) return false;
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261; for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
    return (hash >>> 0) !== old;
  }, beforePreview, { timeout: 15000 });
  check('调整光照强度更新真实预览', beforePreview !== await canvasHash());
  const renderer = await dialog().evaluate(d => d.dataset.renderer);
  check('真实渲染后端有明确记录', ['webgpu', 'cpu'].includes(renderer), renderer);
  console.log('  完整几何打光后端', renderer);
  check('工作区预览不修改原图层', equal(base.rgba, (await snapshot()).rgba));
  await apply().click();
  check('真实推理结果成功应用', await finishAction() !== false);
  const full = await snapshot();
  check('应用改变 RGB、保留图层数量与边界', !equal(base.rgba, full.rgba) && full.layers === base.layers
    && JSON.stringify(full.bounds) === JSON.stringify(base.bounds));
  check('透明度逐像素保持', base.rgba.every((v, i) => i % 4 !== 3 || v === full.rgba[i]));
  check('应用只产生一次可撤销像素步骤', full.undo === base.undo + 1 && /重新打光/.test(full.history.at(-1)), { undo: full.undo, history: full.history });
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  check('撤销精确恢复原像素', equal(base.rgba, (await snapshot()).rgba));
  await page.evaluate(() => window.__psd_editor.actions.run('edit.redo'));
  check('重做精确恢复打光结果', equal(full.rgba, (await snapshot()).rgba));
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));

  
  const coverage = Array.from({ length: W * H }, (_, i) => {
    const x = i % W, y = Math.floor(i / W);
    if (y < 12 || y > 56 || x < 22 || x > 76) return 0;
    return x < 27 || y < 17 ? 128 : 255;
  });
  await page.evaluate(() => window.__psd_editor.actions.run('tool.key.M'));
  await page.waitForFunction(({ x, y, width, height, data }) => {
    try {
      const F = window.__psd_editor;
      F.sel.set({ x, y, width, height, data: Uint8Array.from(data), docW: F.state.docW, docH: F.state.docH });
      return true;
    } catch (e) { if (/模块还没加载完成/.test(e.message)) return false; throw e; }
  }, { x: LEFT, y: TOP, width: W, height: H, data: coverage }, { timeout: 30000 });
  await startAction();
  await waitReady();
  await setStrength(strength);
  await page.waitForTimeout(100);
  await apply().click();
  check('选区内真实推理结果成功应用', await finishAction() !== false);
  const selected = await snapshot();
  let outsideDiff = 0, alphaDiff = 0, blendDiff = 0, insideChanges = 0;
  for (let i = 0; i < base.rgba.length; i++) {
    const c = coverage[Math.floor(i / 4)];
    if (!c && selected.rgba[i] !== base.rgba[i]) outsideDiff++;
    if (i % 4 === 3 && selected.rgba[i] !== base.rgba[i]) alphaDiff++;
    const expected = Math.round(base.rgba[i] + (full.rgba[i] - base.rgba[i]) * c / 255);
    if (Math.abs(selected.rgba[i] - expected) > 1) blendDiff++;
    if (c === 255 && i % 4 !== 3 && selected.rgba[i] !== base.rgba[i]) insideChanges++;
  }
  check('偏移选区外逐字节不变且选区内改变', outsideDiff === 0 && insideChanges > 0, { outsideDiff, insideChanges });
  check('羽化按覆盖率混合且透明度保持', blendDiff === 0 && alphaDiff === 0, { blendDiff, alphaDiff });

  
  const exportedBytes = await page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    return Array.from(new Uint8Array(built.buf));
  });
  const fresh = await parsePsdRaster(Uint8Array.from(exportedBytes).buffer, { strictChannels: true });
  const got = Array.from(fresh.layers[IDX].rgba);
  check('PSD 导出像素与完整重新解析一致', equal(selected.rgba, got), { bytes: exportedBytes.length, layers: fresh.layers.length });
  await page.evaluate(async ({ bytes, idx }) => {
    const F = window.__psd_editor;
    await F.initDocument(Uint8Array.from(bytes).buffer, 'relight-reopened.psd');
    F.refreshAll(false); F.selectLayers([idx]);
  }, { bytes: exportedBytes, idx: IDX });
  check('重新打开保留打光结果', equal(selected.rgba, (await snapshot()).rgba));
  tracking = false;

  const external = requests.filter(r => /^https?:/.test(r.url) && new URL(r.url).origin !== origin);
  const uploads = requests.filter(r => !['GET', 'HEAD', 'OPTIONS'].includes(r.method));
  const modelRequests = requests.filter(r => modelPath(r.url));
  for (const expected of requiredModels) {
    const matches = modelRequests.filter(r => new URL(r.url).pathname === '/vendor/relight/' + expected.filename);
    check(`${expected.name} 模型通过同源GET真实下载`, matches.length > 0 && matches.every(r => r.method === 'GET'), matches);
  }
  check('重新打光没有外部请求或图片上传', external.length === 0 && uploads.length === 0, { external, uploads });
  console.log('  本地模型下载耗时', JSON.stringify(modelTimings));
} catch (e) {
  failures++;
  console.error('✗ 重新打光浏览器验收', e.stack || String(e));
  if (page) console.error('  页面状态', await page.evaluate(() => ({ error: document.querySelector('#err')?.textContent,
    dialog: document.querySelector('.relight-dlg')?.textContent?.slice(-1600) })).catch(() => null));
} finally {
  check('浏览器无未捕获错误', pageErrors.length === 0, pageErrors);
  if (browser) await browser.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
