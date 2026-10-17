import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const nativeGPU = process.env.PSD_EDITOR_PERF_NATIVE_GPU === '1';
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: nativeGPU ? [] : WEBGPU_ARGS });
const reports = [];
try {
  const codecs = process.env.PSD_EDITOR_PERF_COMPRESSION ? [process.env.PSD_EDITOR_PERF_COMPRESSION] : ['zip', 'rle'];
  for (const compression of codecs) {
    const fixture = await largeZipFixture(9390, 30000, { patterned: true, compression });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message));
    await page.route('**/__large-pattern.psd', route => route.fulfill({ body: fixture, contentType: 'application/octet-stream' }));
    await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
    await page.waitForFunction(() => window.__psd_editor?.decode);
    let profiler;
    if (process.env.PSD_EDITOR_PERF_PROFILE) {
      profiler = await page.context().newCDPSession(page);
      await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
    }
    const opened = await page.evaluate(async () => {
      const A = window.__psd_editor, blob = await (await fetch('/__large-pattern.psd')).blob();
      window.__tileLongTasks = [];
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => {
        for (const e of list.getEntries()) window.__tileLongTasks.push({ start: e.startTime, duration: e.duration, name: e.name });
      }).observe({ entryTypes: ['longtask'] });
      const start = performance.now();
      const ok = await A.loadPsd(new File([blob], 'large-pattern.psd'));
      const openMs = performance.now() - start;
      if (!ok) return { ok, error: document.querySelector('#err').textContent };
      const beforeCPU = A.gpu.G.cpuFrames || 0;
      const startZoom = performance.now(); A.view.setZoom(1);
      window.__tileZoomStart = startZoom;
      return { ok, openMs, beforeCPU, lazy: !A.state.doc.layers[0].rgba };
    });
    assert.equal(opened.ok, true, JSON.stringify(opened)); assert.equal(opened.lazy, true);
    await page.waitForFunction(() => {
      const A = window.__psd_editor, l = A.state.doc?.layers[0], s = A.decode.status();
      if (!l?.lazyHighTiles?.has('4608:14848') || !A.gpu.active() || !s || s.pending || s.queued) return false;
      const stamp = `${s.jobs}:${l.lazyHighTiles.size}`;
      if (window.__tileStableStamp !== stamp) { window.__tileStableStamp = stamp; window.__tileStableAt = performance.now(); return false; }
      return performance.now() - window.__tileStableAt > 150;
    }, null, { timeout: 30000 });
    const out = await page.evaluate(async ({ panFrames, frameLimit }) => {
      const A = window.__psd_editor, G = A.gpu.G;
      if (frameLimit) {
        await A.gpu.flush(); G.frameQueue.dispose(); G.frameQueue = null; G.frameLimit = frameLimit;
      }
      A.gpu.frame(); await A.gpu.flush();
      const virtualTiles = G.gc.stats.virtualTiles, zoomReadyMs = performance.now() - window.__tileZoomStart;
      const px = await G.gc.renderToRGBA(G.drawList, { W: 32, H: 32, s: 1, tx: -4680, ty: -14980 });
      let maxError = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const sx = 4680 + x, sy = 14980 + y;
        const expected = [171, 65, 211].map(v => (v + (Math.floor(sx / 128) % 8) * 7 + (sy % 64) * 3) & 255).concat(80 + (sy % 64) * 2);
        for (let c = 0; c < 4; c++) maxError = Math.max(maxError, Math.abs(px[(y * 32 + x) * 4 + c] - expected[c]));
      }
      
      
      A.gpu.frame(); await A.gpu.flush(); await new Promise(r => requestAnimationFrame(r));
      const builds = G.drawListBuilds, upload = G.gc.stats.uploadPx, decodeJobs = A.decode.status().jobs, samples = [], frames = [], panStart = performance.now();
      const queueBefore = G.frameQueue.stats;
      for (let i = 0; i < panFrames; i++) {
        const start = performance.now(); A.view.wheel(0, { deltaX: i % 2 ? -2 : 2 });
        const frame = { start, wheelMs: performance.now() - start, submitMs: G.gc.stats.ms, requestID: G.frameQueue.stats.requested };
        await new Promise(r => requestAnimationFrame(r));
        const duration = performance.now() - start; samples.push(duration);
        frame.duration = duration; frames.push(frame);
      }
      const panEnd = performance.now(); await A.gpu.flush(); await new Promise(r => setTimeout(r, 0));
      const queueAfter = G.frameQueue.stats;
      for (const f of frames) {
        const done = queueAfter.latencies.find(s => s.id >= f.requestID);
        f.inputStateDoneMs = done ? done.completedAt - f.start : null;
      }
      const completion = frames.map(f => f.inputStateDoneMs).filter(v => v != null).sort((a, b) => a - b);
      samples.sort((a, b) => a - b);
      return { zoomReadyMs, virtualTiles, maxError, cpuFrames: G.cpuFrames || 0, buildsBefore: builds, buildsAfter: G.drawListBuilds,
        uploadBefore: upload, uploadAfter: G.gc.stats.uploadPx, decodeJobsBefore: decodeJobs, decodeJobsAfter: A.decode.status().jobs,
        panMedianMs: samples[Math.floor(samples.length / 2)], panP95Ms: samples[Math.ceil(samples.length * .95) - 1], panMaxMs: samples[samples.length - 1], frames, longTasks: window.__tileLongTasks.filter(e => e.start + e.duration >= panStart && e.start <= panEnd),
        inputStateDoneMedianMs: completion[Math.floor(completion.length / 2)], inputStateDoneP95Ms: completion[Math.ceil(completion.length * .95) - 1], inputStateDoneMaxMs: completion.at(-1),
        queue: { limit: queueAfter.limit, peak: queueAfter.maxObservedInFlight, inFlight: queueAfter.inFlight, pending: queueAfter.pending,
          requested: queueAfter.requested - queueBefore.requested, submitted: queueAfter.submitted - queueBefore.submitted, coalesced: queueAfter.coalesced - queueBefore.coalesced },
        tileCount: A.state.doc.layers[0].lazyHighTiles.size, decode: A.decode.status(),
        gpu: A.gpu.active(), gpuName: G.name, scratch: [...A.viewScratch.entries()].map(([id, c]) => [id, c.width, c.height]) };
    }, { panFrames: Math.max(12, Math.min(600, Number(process.env.PSD_EDITOR_PERF_PAN_FRAMES) || 12)), frameLimit: [1, 2, 8].includes(Number(process.env.PSD_EDITOR_PERF_FRAME_LIMIT)) ? Number(process.env.PSD_EDITOR_PERF_FRAME_LIMIT) : null });
    if (profiler) {
      const { profile } = await profiler.send('Profiler.stop');
      await writeFile(`${process.env.PSD_EDITOR_PERF_PROFILE}-${compression}.cpuprofile`, JSON.stringify(profile));
      await profiler.detach();
    }
    assert.equal(out.gpu, true); assert.ok(out.virtualTiles > 0, JSON.stringify(out));
    assert.ok(out.maxError <= 1, `${compression}: native detail differs from the source pattern: ${JSON.stringify(out)}`);
    assert.equal(out.cpuFrames, opened.beforeCPU, `${compression}: pan/zoom fell back to CPU`);
    assert.equal(out.buildsAfter, out.buildsBefore, 'warm pans rebuilt the scene');
    assert.equal(out.uploadAfter, out.uploadBefore, 'warm pans reuploaded source pixels');
    assert.equal(out.decodeJobsAfter, out.decodeJobsBefore, 'warm pans redecoded cached tiles');
    assert.ok(out.tileCount <= 96); assert.deepEqual(errors, []);
    assert.ok(out.queue.peak <= out.queue.limit); assert.equal(out.queue.inFlight, 0); assert.equal(out.queue.pending, false);
    assert.ok(out.frames.every(f => f.inputStateDoneMs != null));
    assert.ok(out.scratch.every(([, w, h]) => w * h <= 1200 * 800));
    const report = { compression, width: 9390, height: 30000, fileBytes: fixture.length, browser: await browser.version(),
      build: process.env.PSD_EDITOR_TEST_DIST === '1' ? 'dist' : 'source', viewport: { width: 1200, height: 800 }, renderer: nativeGPU ? 'Chrome headless, default adapter requested' : 'Chrome headless, SwiftShader requested',
      fixture: 'generated RGB stripes with varying alpha', openMs: opened.openMs, ...out };
    reports.push(report); console.log(JSON.stringify(report)); await page.close();
  }
  if (process.env.PSD_EDITOR_PERF_REPORT) await writeFile(process.env.PSD_EDITOR_PERF_REPORT, JSON.stringify(reports, null, 2) + '\n');
  console.log('✓ 2.8 亿像素 ZIP/RLE 半透明图层：100% 高清与连续平移保持 GPU，无重复解码/上传/场景构建');
} finally { await browser.close(); }
