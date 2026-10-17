


import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) { console.log('跳过：没有 Playwright'); process.exit(0); }
const origin = `http://127.0.0.1:${process.argv[2] || process.env.PORT || 8796}`;
const photoFile = process.env.PSD_EDITOR_RELIGHT_PHOTO;
if (!photoFile) throw new Error('请设置 PSD_EDITOR_RELIGHT_PHOTO 为用户指定的本地照片路径');
fs.accessSync(photoFile);
const directory = path.resolve(process.env.PSD_EDITOR_RELIGHT_PROOF_DIR || path.join(os.tmpdir(), 'psd_editor-relight-photo-' + Date.now()));
const targetFile = process.env.PSD_EDITOR_RELIGHT_TARGET;
const baselineFile = process.env.PSD_EDITOR_RELIGHT_BASELINE;
fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(photoFile, path.join(directory, 'original-photo.jpg'));
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const pageErrors = [], requests = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.context().on('request', request => requests.push({ url: request.url(), method: request.method(),
  emptySession: request.method() === 'POST' && new URL(request.url()).origin === origin
    && new URL(request.url()).pathname === '/api/session' && request.postData()?.trim() === '{}' }));
const hashDocument = () => page.evaluate(() => {
  const s = window.__psd_editor.state; let hash = 2166136261;
  for (const value of s.doc.layers[s.selLayer].rgba) hash = Math.imul(hash ^ value, 16777619);
  return { hash: hash >>> 0, undo: s.brushUndo, layers: s.doc.layers.length };
});
const dialog = () => page.locator('.relight-dlg');
const canvasHash = () => dialog().locator('[data-relight-canvas]').evaluate(canvas => {
  let hash = 2166136261;
  for (const value of canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) hash = Math.imul(hash ^ value, 16777619);
  return hash >>> 0;
});
const field = (label, value) => dialog().locator(`input[type="range"][aria-label="${label}"]`).evaluate((input, v) => {
  input.value = String(v); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
let result;
try {
  await page.goto(origin + '/editor');
  await page.waitForFunction(() => window.__psd_editor?.actions, null, { timeout: 60000 });
  await page.evaluate(() => { window.__fpDialog = d => d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : true; });
  await page.setInputFiles('#file', photoFile);
  await page.waitForFunction(() => window.__psd_editor.state.doc?.layers.length && window.__psd_editor.state.selLayer >= 0, null, { timeout: 60000 });
  const before = await hashDocument();
  await page.evaluate(() => window.__psd_editor.actions.run('ai.relight'));
  await dialog().waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const d = document.querySelector('.relight-dlg');
    return d?.dataset.phase === 'error' || (d?.querySelector('[data-relight-apply]') && !d.querySelector('[data-relight-apply]').disabled);
  }, null, { timeout: 240000 });
  const analysis = await dialog().evaluate(d => ({ phase: d.dataset.phase, analysisMs: Number(d.dataset.analysisMs), models: JSON.parse(d.dataset.models || '[]'),
    faceInference: JSON.parse(d.dataset.faceInference || 'null'), text: d.querySelector('[data-relight-status]').textContent }));
  if (analysis.phase === 'error') throw new Error(analysis.text);
  if (process.env.PSD_EDITOR_RELIGHT_EXPECT_FACE === '1' && !(analysis.faceInference?.faceCount > 0)) throw new Error('指定人像没有完成真实人脸检测');
  await dialog().locator('[data-relight-view]').selectOption('result');
  await dialog().getByLabel('显示光源', { exact: true }).uncheck();
  await field('垂直位置', -30); await field('近远位置', 25); await field('光照强度', 20); await field('光源扩散', 30); await field('原始光照', 35);
  for (const [name, value] of [['ui-left', -110], ['ui-right', 110]]) {
    const old = await canvasHash(); await field('水平位置', value);
    await page.waitForFunction(old => {
      const canvas = document.querySelector('.relight-dlg [data-relight-canvas]'); let hash = 2166136261;
      for (const byte of canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) hash = Math.imul(hash ^ byte, 16777619);
      return (hash >>> 0) !== old;
    }, old, { timeout: 30000 });
    await page.waitForTimeout(150);
    await dialog().screenshot({ path: path.join(directory, name + '.png') });
  }
  await dialog().locator('[data-relight-view]').selectOption('normals');
  await page.waitForTimeout(100);
  await dialog().screenshot({ path: path.join(directory, 'ui-normals.png') });
  await dialog().locator('[data-relight-cancel]').click();
  await dialog().waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__psd_editor.actions.enabled('ai.relight'));
  const after = await hashDocument();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('真实照片预览取消后修改了图层或撤销栈');
  console.log('✓ 真实照片左右灯/法线视图和取消无改', JSON.stringify(analysis));

  
  result = await page.evaluate(async () => {
    const { analyzeRelight, renderRelightAsync, disposeRelight, RELIGHT_DEFAULTS } = await import('/core/relight.js');
    
    const state = window.__psd_editor.state, layer = state.doc.layers[state.selLayer], w = layer.width, h = layer.height;
    const rgba = new Uint8ClampedArray(layer.rgba), start = performance.now();
    const stages = [], maps = await analyzeRelight(rgba, w, h, event => { if (event.progress === 1) stages.push(event); });
    const analysisEnd = performance.now();
    const flatNormals = Float32Array.from({ length: maps.normals.length }, (_, i) => i % 3 === 2 ? -1 : 0);
    const flat = { ...maps, normals: flatNormals };
    const params = { originalLighting: 35, lights: [{ x: -1.1, y: -0.3, depth: 0.25, intensity: 20, diffusion: 30, color: [255, 255, 255], enabled: true }] };
    const normalLeft = await renderRelightAsync(rgba, w, h, maps, params);
    const flatLeft = await renderRelightAsync(rgba, w, h, flat, params);
    const normalRight = await renderRelightAsync(rgba, w, h, maps, { ...params, lights: [{ ...params.lights[0], x: 1.1 }] });
    const defaults = { originalLighting: RELIGHT_DEFAULTS.originalLighting, lights: [{ ...RELIGHT_DEFAULTS, color: [...RELIGHT_DEFAULTS.color] }] };
    const defaultLeft = await renderRelightAsync(rgba, w, h, maps, defaults);
    const defaultRight = await renderRelightAsync(rgba, w, h, maps, { ...defaults, lights: [{ ...defaults.lights[0], x: -defaults.lights[0].x }] });
    const views = [{ label: '原图', data: rgba }, { label: '左侧光 · 真实法线', data: normalLeft }, { label: '右侧光 · 真实法线', data: normalRight },
      { label: '左侧光 · 平面法线消融', data: flatLeft }];
    let difference = 0, changed = 0, count = 0;
    for (let y = Math.floor(h * 0.2); y < h * 0.7; y++) for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) {
      const i = (y * w + x) * 4; let delta = 0;
      for (let c = 0; c < 3; c++) delta += Math.abs(normalLeft[i + c] - flatLeft[i + c]);
      difference += delta / 3; if (delta > 3) changed++; count++;
    }
    const sums = [0, 0, 0], squares = [0, 0, 0], n = maps.width * maps.height;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const value = maps.normals[i * 3 + c]; sums[c] += value; squares[c] += value * value; }
    const normalStd = sums.map((sum, c) => Math.sqrt(Math.max(0, squares[c] / n - (sum / n) ** 2)));
    const display = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { display[i * 4] = (maps.normals[i * 3] + 1) * 127.5; display[i * 4 + 1] = (1 - maps.normals[i * 3 + 1]) * 127.5; display[i * 4 + 2] = (1 - maps.normals[i * 3 + 2]) * 127.5; display[i * 4 + 3] = 255; }
    const normals = document.createElement('canvas'); normals.width = maps.width; normals.height = maps.height;
    normals.getContext('2d').putImageData(new ImageData(display, maps.width, maps.height), 0, 0);
    const tileW = Math.min(w, 640), tileH = Math.round(h * tileW / w);
    const sheet = document.createElement('canvas'); sheet.width = tileW * 3; sheet.height = (tileH + 40) * 2;
    const context = sheet.getContext('2d'); context.fillStyle = '#17191d'; context.fillRect(0, 0, sheet.width, sheet.height);
    const images = {};
    for (const [index, entry] of views.entries()) {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d').putImageData(new ImageData(entry.data, w, h), 0, 0);
      const x = index % 3 * tileW, y = Math.floor(index / 3) * (tileH + 40); context.drawImage(canvas, x, y + 40, tileW, tileH);
      context.fillStyle = '#fff'; context.font = '18px sans-serif'; context.fillText(entry.label, x + 12, y + 26);
      images[['original', 'left', 'right', 'flat-left'][index]] = canvas.toDataURL('image/png');
    }
    context.drawImage(normals, tileW, tileH + 80, tileW, tileH); context.fillStyle = '#fff'; context.fillText('融合后的真实法线（OpenCV显示映射）', tileW + 12, tileH + 66);
    const defaultSheet = document.createElement('canvas'); defaultSheet.width = tileW * 3; defaultSheet.height = tileH + 40;
    const dc = defaultSheet.getContext('2d'); dc.fillStyle = '#17191d'; dc.fillRect(0, 0, defaultSheet.width, defaultSheet.height);
    for (const [index, entry] of [{ label: '原图', data: rgba, name: null }, { label: '默认左上光 · 原始光照75%', data: defaultLeft, name: 'default-left' },
      { label: '镜像右上光 · 原始光照75%', data: defaultRight, name: 'default-right' }].entries()) {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d').putImageData(new ImageData(entry.data, w, h), 0, 0);
      dc.drawImage(canvas, index * tileW, 40, tileW, tileH); dc.fillStyle = '#fff'; dc.font = '18px sans-serif'; dc.fillText(entry.label, index * tileW + 12, 26);
      if (entry.name) images[entry.name] = canvas.toDataURL('image/png');
    }
    const stats = { sourceWidth: w, sourceHeight: h, analysisMs: Math.round(analysisEnd - start), totalProofMs: Math.round(performance.now() - start), modelRecords: maps.models,
      faceInference: maps.faceInference, geometryFaceCount: maps.faces?.length || 0, originalLight: maps.originalLight,
      renderers: [normalLeft.renderBackend, flatLeft.renderBackend, normalRight.renderBackend, defaultLeft.renderBackend, defaultRight.renderBackend],
      renderPasses: normalRight.renderPasses,
      diagnosticParameters: params, targetParameters: { ...params, lights: [{ ...params.lights[0], x: 1.1 }] }, defaultParameters: defaults,
      normalStd, faceRegion: [0.25, 0.2, 0.75, 0.7], faceNormalVsFlatMeanRgb: difference / count, faceChangedFraction: changed / count,
      sameAlbedo: flat.albedo === maps.albedo, sameDepth: flat.depth === maps.depth, stages };
    images.normals = normals.toDataURL('image/png'); images.comparison = sheet.toDataURL('image/png'); images['comparison-default'] = defaultSheet.toDataURL('image/png');
    disposeRelight(); return { stats, images };
  });
  for (const [name, data] of Object.entries(result.images)) fs.writeFileSync(path.join(directory, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  if (targetFile) {
    const comparison = await page.evaluate(async ({ target, current, baseline }) => {
      const decode = async url => { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0); return canvas; };
      const targetCanvas = await decode(target), currentCanvas = await decode(current), baselineCanvas = baseline ? await decode(baseline) : null;
      const w = targetCanvas.width, h = targetCanvas.height;
      if ([currentCanvas, baselineCanvas].filter(Boolean).some(c => c.width !== w || c.height !== h)) throw new Error('同参数比较必须使用相同尺寸的完整像素');
      const reference = targetCanvas.getContext('2d').getImageData(0, 0, w, h).data;
      const measure = canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, w, h).data; let abs = 0, sq = 0, above10 = 0, above25 = 0;
        for (let i = 0; i < w * h; i++) { let largest = 0; for (let c = 0; c < 3; c++) { const d = Math.abs(data[i * 4 + c] - reference[i * 4 + c]); abs += d; sq += d * d; largest = Math.max(largest, d); }
          if (largest > 10) above10++; if (largest > 25) above25++; }
        const regions = {};
        
        const bounds = { forehead: [0.55, 0.205, 0.755, 0.338], eye: [0.399, 0.344, 0.592, 0.495], cheek: [0.67, 0.423, 0.815, 0.586], lips: [0.489, 0.586, 0.676, 0.662] };
        for (const [name, box] of Object.entries(bounds)) { let n = 0, error = 0, targetLuma = 0, currentLuma = 0;
          for (let y = Math.floor(box[1] * h); y < box[3] * h; y++) for (let x = Math.floor(box[0] * w); x < box[2] * w; x++) {
            const i = (y * w + x) * 4; n++; for (let c = 0; c < 3; c++) { error += Math.abs(data[i + c] - reference[i + c]);
              const weight = [0.2126, 0.7152, 0.0722][c]; targetLuma += reference[i + c] * weight; currentLuma += data[i + c] * weight; } }
          regions[name] = { rgbMAE: error / (n * 3), targetMeanEncodedLuma: targetLuma / n, currentMeanEncodedLuma: currentLuma / n };
        }
        return { rgbMAE: abs / (w * h * 3), rgbRMSE: Math.sqrt(sq / (w * h * 3)), fractionPixelMaxDiffAbove10: above10 / (w * h), fractionPixelMaxDiffAbove25: above25 / (w * h), regions };
      };
      const panels = [{ title: 'ImageFlow · 同参数完整导出', canvas: targetCanvas }, { title: '本次实现 · 同参数完整渲染', canvas: currentCanvas }];
      if (baselineCanvas) panels.splice(1, 0, { title: '修改前实现', canvas: baselineCanvas });
      const sheet = document.createElement('canvas'); sheet.width = w * panels.length; sheet.height = h + 48;
      const context = sheet.getContext('2d'); context.fillStyle = '#17191d'; context.fillRect(0, 0, sheet.width, sheet.height); context.fillStyle = '#fff'; context.font = '20px sans-serif';
      panels.forEach((p, i) => { context.drawImage(p.canvas, i * w, 48); context.fillText(p.title, i * w + 14, 32); });
      return { metrics: { dimensions: [w, h], domain: '8-bit encoded RGB; numerical differences do not establish perceptual equivalence', current: measure(currentCanvas),
        baseline: baselineCanvas ? measure(baselineCanvas) : null, panelPixelsCopiedExactly: true }, image: sheet.toDataURL('image/png') };
    }, { target: 'data:image/png;base64,' + fs.readFileSync(targetFile).toString('base64'), current: result.images.right,
      baseline: baselineFile ? 'data:image/png;base64,' + fs.readFileSync(baselineFile).toString('base64') : null });
    fs.writeFileSync(path.join(directory, 'target-comparison.png'), Buffer.from(comparison.image.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(directory, 'target-comparison.json'), JSON.stringify(comparison.metrics, null, 2));
    result.stats.targetComparison = comparison.metrics;
    console.log('✓ 同参数完整尺寸参考对比', JSON.stringify(comparison.metrics));
  }
  fs.writeFileSync(path.join(directory, 'proof.json'), JSON.stringify(result.stats, null, 2));
  const stats = result.stats;
  if (!stats.renderers.every(name => name === 'webgpu')) throw new Error('真实照片GPU消融没有全部在GPU渲染');
  if (!(stats.normalStd[0] > 0.02 && stats.normalStd[1] > 0.02 && stats.faceNormalVsFlatMeanRgb > 1 && stats.faceChangedFraction > 0.05)) {
    throw new Error('真实法线对照片主体贡献不足，不能以仅RGB变化通过：' + JSON.stringify(stats));
  }
  if (pageErrors.length) throw new Error('浏览器错误：' + pageErrors.join(' | '));
  const external = requests.filter(request => /^https?:/.test(request.url) && new URL(request.url).origin !== origin);
  
  const uploads = requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !request.emptySession);
  if (external.length || uploads.length) throw new Error('发现外部请求或图片上传：' + JSON.stringify({ external, uploads }));
  stats.network = { externalRequests: external.length, imageUploads: uploads.length, emptyLocalSessionRequests: requests.filter(request => request.emptySession).length,
    modelGets: requests.filter(request => /\.(?:onnx|task)(?:$|\?)/.test(request.url) && request.method === 'GET').map(request => new URL(request.url).pathname),
    runtimeGets: [...new Set(requests.filter(request => request.method === 'GET' && /\/vendor\/relight\/.*\.(?:wasm|mjs|js)(?:$|\?)/.test(request.url)).map(request => new URL(request.url).pathname))] };
  fs.writeFileSync(path.join(directory, 'proof.json'), JSON.stringify(stats, null, 2));
  console.log('✓ 真实照片GPU法线消融', JSON.stringify(stats));
  console.log('证据目录', directory);
} catch (e) {
  console.error(e.stack || e);
  console.error('证据目录', directory);
  process.exitCode = 1;
} finally { await browser.close(); }
