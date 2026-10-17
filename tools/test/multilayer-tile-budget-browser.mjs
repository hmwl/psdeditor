import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const width = 2048, height = 32768, layerCount = 12;
const fixture = await largeZipFixture(width, height, { patterned: true, compression: 'rle', layerCount });
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: process.env.PSD_EDITOR_PERF_NATIVE_GPU === '1' ? [] : WEBGPU_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.route('**/__multilayer.psb', route => route.fulfill({ body: fixture, contentType: 'application/octet-stream' }));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.decode);
  const opened = await page.evaluate(async () => {
    const A = window.__psd_editor, blob = await (await fetch('/__multilayer.psb')).blob(), start = performance.now();
    const ok = await A.loadPsd(new File([blob], 'multilayer.psb'));
    window.__budgetGPUErrors = [];
    A.gpu.G.gc.device.addEventListener('uncapturederror', e => { window.__budgetGPUErrors.push(e.error.message); e.preventDefault(); });
    A.view.setZoom(1);
    return { ok, ms: performance.now() - start, lazy: A.state.doc.layers.every(l => !l.rgba && !!l.lazyChannels), count: A.state.doc.layers.length };
  });
  assert.equal(opened.ok, true); assert.equal(opened.count, layerCount); assert.equal(opened.lazy, true);
  await page.waitForFunction(() => {
    const s = window.__psd_editor.decode.status();
    return s && !s.pending && !s.queued && s.tiles.wanted === 256 && s.tiles.residentWanted === 256;
  }, null, { timeout: 90000 });
  const result = await page.evaluate(async () => {
    const A = window.__psd_editor; await A.gpu.flush();
    const before = A.decode.status(), upload = A.gpu.G.gc.stats.uploadPx, builds = A.gpu.G.drawListBuilds;
    const perLayer = A.state.doc.layers.map(l => ({ tiles: l.lazyHighTiles.size, center: l.lazyHighTiles.has('1024:16384') }));
    const px = await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList, { W: 32, H: 32, s: 1, tx: -1008, ty: -16368 });
    let maxError = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const sx = 1008 + x, sy = 16368 + y, alpha = (80 + (sy % 64) * 2) / 255;
      const expected = [171, 65, 211].map(v => (v + (Math.floor(sx / 128) % 8) * 7 + (sy % 64) * 3) & 255).concat(Math.round((1 - (1 - alpha) ** 12) * 255));
      for (let c = 0; c < 4; c++) maxError = Math.max(maxError, Math.abs(px[(y * 32 + x) * 4 + c] - expected[c]));
    }
    A.gpu.frame(); await A.gpu.flush();
    
    
    for (let i = 0; i < 40; i++) { A.view.wheel(0, { deltaX: 0 }); await new Promise(r => requestAnimationFrame(r)); }
    await A.gpu.flush();
    return { before, after: A.decode.status(), perLayer, maxError, gpu: A.gpu.active(), gpuName: A.gpu.G.name, cpuFrames: A.gpu.G.cpuFrames || 0,
      uploadBefore: upload, uploadAfter: A.gpu.G.gc.stats.uploadPx, buildsBefore: builds, buildsAfter: A.gpu.G.drawListBuilds,
      residentGPU: A.gpu.G.gc.bytesResident, scratch: [...A.viewScratch.entries()].map(([id, c]) => [id, c.width, c.height]) };
  });
  assert.equal(result.gpu, true); assert.equal(result.cpuFrames, 0); assert.ok(result.maxError <= 2, JSON.stringify(result));
  assert.ok(result.perLayer.every(l => l.tiles > 0 && l.tiles <= 96 && l.center), JSON.stringify(result.perLayer));
  assert.equal(result.before.tiles.bytes, result.before.tiles.budget);
  assert.equal(result.after.tiles.bytes, result.before.tiles.bytes); assert.equal(result.after.jobs, result.before.jobs);
  assert.equal(result.uploadAfter, result.uploadBefore); assert.equal(result.buildsAfter, result.buildsBefore);
  assert.ok(result.scratch.every(([, w, h]) => w * h <= 1600 * 1000)); assert.deepEqual(errors, []);
  const hops = [];
  for (const [dy, centerY] of [[-2048, 18432], [2048, 16384], [-15360, 31744], [15360, 16384]]) {
    await page.evaluate(async dy => { window.__psd_editor.view.wheel(-dy); await new Promise(r => requestAnimationFrame(r)); }, dy);
    await page.waitForFunction(() => {
      const s = window.__psd_editor.decode.status();
      return s && !s.pending && !s.queued && s.tiles.wanted === 256 && s.tiles.residentWanted === 256;
    }, null, { timeout: 90000 });
    const hop = await page.evaluate(async centerY => {
      const A = window.__psd_editor; await A.gpu.flush();
      const before = A.decode.status(), layers = A.state.doc.layers.map(l => ({ tiles: l.lazyHighTiles.size, center: l.lazyHighTiles.has(`1024:${centerY}`) }));
      const px = await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList, { W: 1, H: 1, s: 1, tx: -1024, ty: -centerY });
      A.gpu.frame(); await A.gpu.flush();
      for (let i = 0; i < 20; i++) { A.view.wheel(0, { deltaX: 0 }); await new Promise(r => requestAnimationFrame(r)); }
      await A.gpu.flush();
      return { centerY, before, after: A.decode.status(), layers, pixel: [...px], residentGPU: A.gpu.G.gc.bytesResident, view: A.gpu.G.lastView, pan: A.view.pan,
        firstKeys: [...A.state.doc.layers[0].lazyHighTiles.keys()] };
    }, centerY);
    assert.ok(hop.layers.every(l => l.tiles > 0 && l.center), JSON.stringify(hop));
    assert.equal(hop.after.jobs, hop.before.jobs, 'stationary view must settle after eviction');
    assert.equal(hop.after.tiles.bytes, hop.after.tiles.budget); assert.ok(hop.after.tiles.evictions > 0);
    const expected = [171, 65, 211].concat(Math.round((1 - (1 - 80 / 255) ** 12) * 255));
    assert.ok(hop.pixel.every((v, c) => Math.abs(v - expected[c]) <= 2), JSON.stringify(hop));
    assert.ok(hop.residentGPU <= result.residentGPU * 1.15, 'panning must release old padded textures alongside CPU eviction');
    hops.push(hop);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.__budgetGPUErrors), []);
  const closed = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.state.doc.__closedPSBProbe = true;
    A.state.origBuffer.__closedPSBBufferProbe = true;
    window.__budgetWeak = { doc: new WeakRef(A.state.doc), buffer: new WeakRef(A.state.origBuffer) };
    const ok = await A.docs.closeAll();
    return ok && !A.state.doc && A.docs.count() === 0;
  });
  assert.equal(closed, true);
  const closedCache = await page.evaluate(() => ({ tiles: window.__psd_editor.decode.status().tiles, residentGPU: window.__psd_editor.gpu.G.gc.bytesResident }));
  assert.equal(closedCache.tiles.bytes, 0); assert.equal(closedCache.tiles.tiles, 0); assert.equal(closedCache.tiles.wanted, 0);
  assert.ok(closedCache.residentGPU < result.residentGPU / 2, 'closing releases padded detail textures');
  const profiler = await page.context().newCDPSession(page);
  await profiler.send('HeapProfiler.collectGarbage'); await profiler.send('HeapProfiler.collectGarbage');
  const released = await page.evaluate(() => ({ doc: !window.__budgetWeak.doc.deref(), buffer: !window.__budgetWeak.buffer.deref() }));
  if ((!released.doc || !released.buffer) && process.env.PSD_EDITOR_HEAP_REPORT) {
    const chunks = []; profiler.on('HeapProfiler.addHeapSnapshotChunk', e => chunks.push(e.chunk));
    await profiler.send('HeapProfiler.takeHeapSnapshot');
    await writeFile(process.env.PSD_EDITOR_HEAP_REPORT, chunks.join(''));
  }
  await profiler.detach();
  assert.deepEqual(released, { doc: true, buffer: true }, 'idle caches must not retain the closed PSB or its original bytes');
  const report = { width, height, layerCount, layerPixels: width * height * layerCount, fileBytes: fixture.length, browser: await browser.version(),
    build: process.env.PSD_EDITOR_TEST_DIST === '1' ? 'dist' : 'source', fixture: 'generated 12-layer RLE PSB with patterned RGB and varying alpha', opened, ...result, hops, released, closedCache };
  if (process.env.PSD_EDITOR_PERF_REPORT) await writeFile(process.env.PSD_EDITOR_PERF_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  console.log('✓ 12 层真实 PSB：全局 64 MiB 原生瓦片预算、每层中心细节、稳定视口不重复解码/上传');
} finally { await browser.close(); }
