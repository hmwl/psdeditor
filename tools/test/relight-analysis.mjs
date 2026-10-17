

import fs from 'node:fs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const playwright = await loadPlaywright();
if (!playwright) throw new Error('完整重新打光分析验收需要 Playwright；请设置 PLAYWRIGHT_MODULE');
const port = process.argv[2] || process.env.PORT || '8796';
const imagePath = process.argv[3] || process.env.PSD_EDITOR_RELIGHT_PHOTO;
if (!imagePath || !fs.existsSync(imagePath)) throw new Error('请提供实际人像照片路径：relight-analysis.mjs [端口] portrait.jpg');
const origin = `http://127.0.0.1:${port}`;
const timeout = Math.max(60000, Number(process.env.PSD_EDITOR_RELIGHT_TIMEOUT) || 240000);
const executablePath = process.env.CHROMIUM || undefined;
const args = process.platform === 'darwin' ? ['--enable-unsafe-webgpu'] : WEBGPU_ARGS;
let browser, tracking = false, failures = 0;
const requests = [], pageErrors = [], progress = [];
const check = (label, passed, actual) => {
  if (!passed) failures++;
  console.log(`${passed ? '✓' : '✗'} ${label}${passed || actual === undefined ? '' : ' ' + JSON.stringify(actual)}`);
};

try {
  browser = await playwright.chromium.launch({ executablePath, headless: true, args });
  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (tracking) requests.push({ url: request.url(), method: request.method(), type: request.resourceType() });
  });
  const milestones = new Set();
  await page.exposeFunction('recordRelightAnalysisProgress', value => {
    progress.push(value);
    const milestone = `${value.model || value.stage}:${value.stage}:${value.progress === 1 ? 1 : 0}`;
    if (!milestones.has(milestone) && (value.stage === 'analyze' || value.stage === 'geometry' || value.stage === 'ready')) {
      milestones.add(milestone);
      console.log(`  ${value.label || value.model || value.stage} · ${value.stage} · ${value.completed ?? 0}/${value.total ?? 4}${value.backend ? ' · ' + value.backend : ''}`);
    }
  });
  const response = await page.goto(origin + '/editor', { waitUntil: 'networkidle' });
  const csp = response.headers()['content-security-policy'] || '';
  check('实际 GET 页面启用 self/blob/WASM CSP，未放开 unsafe-eval', csp.includes("'self'") && csp.includes("'wasm-unsafe-eval'") && !csp.includes("'unsafe-eval'"), csp);
  tracking = true;
  const encoded = fs.readFileSync(imagePath).toString('base64');
  const analysis = await page.evaluate(async ({ encoded, timeout }) => {
    const { analyzeRelight, disposeRelight } = await import('/core/relight.js');
    const image = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + encoded)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const input = context.getImageData(0, 0, image.width, image.height);
    image.close();
    const before = new Uint8ClampedArray(input.data), started = performance.now();
    const summarize = values => {
      if (!values) return null;
      let min = Infinity, max = -Infinity, sum = 0, positive = 0, nonFinite = 0;
      for (const value of values) {
        if (!Number.isFinite(value)) { nonFinite++; continue; }
        min = Math.min(min, value); max = Math.max(max, value); sum += value;
        if (value > 0) positive++;
      }
      return { length: values.length, min, max, mean: sum / Math.max(1, values.length), positive, nonFinite };
    };
    let timer;
    try {
      const maps = await Promise.race([
        analyzeRelight(input.data, input.width, input.height, value => { void window.recordRelightAnalysisProgress(value); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('完整本地分析超时')), timeout); }),
      ]);
      const scalarFields = ['alpha', 'depth', 'depthRaw', 'shading', 'detail', 'edgeConfidence', 'farField', 'backdropGate', 'specularLikelihood', 'ao', 'faceMask', 'lipsMask', 'eyesMask', 'features'];
      const vectorFields = ['albedo', 'normals', 'positions', 'faceNormals'];
      const fields = Object.fromEntries([...scalarFields, ...vectorFields].map(key => [key, summarize(maps[key])]));
      const confidence = Object.fromEntries(Object.entries(maps.materialConfidence || {}).map(([key, values]) => [key, summarize(values)]));
      let faceNormalZ = 0, faceNormalCount = 0;
      for (let pixel = 0; pixel < maps.width * maps.height; pixel++) if (maps.faceMask?.[pixel] > 0.5) {
        faceNormalZ += maps.normals[pixel * 3 + 2]; faceNormalCount++;
      }
      return {
        source: { width: input.width, height: input.height, unchanged: before.every((value, index) => value === input.data[index]) },
        elapsedMs: Math.round(performance.now() - started), width: maps.width, height: maps.height,
        models: maps.models, faceInference: maps.faceInference,
        faceGeometry: (maps.faces || []).map(face => ({
          landmarks: face.landmarks?.length / 3 || 0, box: face.box, irises: face.irises?.length || 0,
          fit: face.depthFit || face.fit || null,
        })),
        faceNormalMeanZ: faceNormalZ / Math.max(1, faceNormalCount), faceNormalCount,
        originalLight: maps.originalLight, scene: maps.scene, fields, confidence,
      };
    } finally { clearTimeout(timer); disposeRelight(); }
  }, { encoded, timeout });
  tracking = false;

  const n = analysis.width * analysis.height;
  check('真实输入未被分析过程修改', analysis.source.unchanged);
  check('人脸任务实际执行并检测到这张照片的一张脸', analysis.faceInference?.faceCount === 1 && analysis.faceInference.backend === 'cpu' && analysis.faceInference.runMs > 0, analysis.faceInference);
  check('三个 ONNX 模型各实际执行一次并返回有限张量记录', analysis.models?.length === 3 && ['depth', 'normals', 'intrinsics'].every(id => {
    const model = analysis.models.find(value => value.id === id);
    return model && ['wasm', 'webgpu', 'webgpu/wasm'].includes(model.backend) && model.runMs > 0 && model.inputType === 'float32' && model.outputType === 'float32' && model.outputShape.every(value => value > 0);
  }), analysis.models);
  check('脸部几何来自 478 个关键点且包含双眼虹膜', analysis.faceGeometry.length === 1 && analysis.faceGeometry[0].landmarks === 478 && analysis.faceGeometry[0].irises === 2, analysis.faceGeometry);
  for (const key of ['faceMask', 'eyesMask', 'lipsMask', 'features']) {
    const field = analysis.fields[key];
    check(`${key} 真实生成且覆盖非零区域`, field?.length === n && field.positive > 0 && field.nonFinite === 0, field);
  }
  check('面部法线保持朝向相机的负 Z', analysis.faceNormalCount > 0 && analysis.faceNormalMeanZ < -0.05, { count: analysis.faceNormalCount, meanZ: analysis.faceNormalMeanZ });
  check('原光照 SH 使用 face 样本分支', analysis.originalLight?.source === 'face' && Number.isFinite(analysis.originalLight.r2) && analysis.originalLight.pixels >= 400, analysis.originalLight);
  check('材质/深度/法线/细节全部有限且尺寸匹配', Object.entries(analysis.fields).every(([key, field]) => {
    const channels = ['albedo', 'normals', 'positions', 'faceNormals'].includes(key) ? 3 : 1;
    return field && field.length === n * channels && field.nonFinite === 0;
  }), analysis.fields);
  check('重建材质置信度实际生成且在 0..1 内', ['luma', 'chroma', 'materialLuma', 'materialChroma'].every(key => {
    const field = analysis.confidence[key];
    return field?.length === n && field.nonFinite === 0 && field.min >= -1e-5 && field.max <= 1.00001 && field.positive > 0;
  }), analysis.confidence);
  const expected = ['faces', 'depth', 'normals', 'intrinsics'];
  check('四阶段实际推理完成事件按 1/2/3/4 排序报告', expected.every((model, index) => progress.some(value => value.model === model && value.stage === 'analyze' && value.progress === 1 && value.completed === index + 1 && value.total === 4)), progress);
  check('所有模型完成后还报告几何融合，再进入 ready', progress.some(value => value.stage === 'geometry' && value.completed === 4) && progress.at(-1)?.stage === 'ready' && progress.at(-1).completed === 4, progress.slice(-5));
  const relevant = requests.filter(value => /\/vendor\/relight\//.test(value.url));
  check('四个模型权重均从同源 GET 读取', ['face-landmarker.task', 'depth-anything-v2-small-fp16.onnx', 'moge-2-vits-normal.onnx', 'shadenet-fp16.onnx'].every(filename => relevant.some(value => value.url.includes(filename) && value.url.startsWith(origin + '/') && value.method === 'GET')), relevant);
  check('分析阶段未发图片上传或远程推理请求', requests.every(value => value.method === 'GET' || value.method === 'HEAD') && requests.filter(value => ['fetch', 'xhr'].includes(value.type)).every(value => value.url.startsWith(origin + '/') || value.url.startsWith('data:') || value.url.startsWith('blob:')), requests);
  check('浏览器没有未处理 JS 异常', pageErrors.length === 0, pageErrors);
  console.log(JSON.stringify({ ...analysis, network: relevant, progressSummary: progress.filter(value => value.stage === 'geometry' || value.stage === 'ready' || value.stage === 'analyze' && value.progress === 1), failures }, null, 2));
  if (process.env.PSD_EDITOR_RELIGHT_REPORT) fs.writeFileSync(process.env.PSD_EDITOR_RELIGHT_REPORT, JSON.stringify({ analysis, requests, progress, pageErrors, csp, failures }, null, 2));
} finally { await browser?.close(); }
if (failures) process.exitCode = 1;
