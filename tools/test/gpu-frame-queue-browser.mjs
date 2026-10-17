import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: WEBGPU_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.exposeFunction('__queueCapture', async () => {
    const box = await page.locator('#gpuView').boundingBox();
    return [...await page.screenshot({ clip: box })];
  });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.gpu.flush);
  const out = await page.evaluate(async ({ frameLimit }) => {
    const A = window.__psd_editor, raf = () => new Promise(r => requestAnimationFrame(r));
    await A.docSize.newDocument({ width: 128, height: 128, background: 'transparent', name: 'queued-a' });
    A.selectLayers([0]); A.actions.run('tool.key.B'); A.paint.setColors([255, 0, 0]);
    if (A.gpu.G.loading) await A.gpu.G.loading;
    await A.gpu.flush();
    if (!A.gpu.G.gc) throw new Error(JSON.stringify({ gpu: A.gpu.status(), error: document.querySelector('#err').textContent }));
    const G = A.gpu.G, nativeQueue = G.gc.device.queue, nativeDone = nativeQueue.onSubmittedWorkDone;
    if (frameLimit) { G.frameQueue.dispose(); G.frameQueue = null; G.frameLimit = frameLimit; A.gpu.frame(); await A.gpu.flush(); }
    let held = [];
    function pause(){
      held = [];
      
      
      nativeQueue.onSubmittedWorkDone = function(){
        const done = nativeDone.call(this);
        let release; const gate = new Promise(r => { release = r; }); held.push(release);
        return done.then(() => gate);
      };
    }
    async function occupy(){
      await A.gpu.flush(); pause(); for (let i = 0; i < G.frameLimit; i++) { A.gpu.frame(); await raf(); }
      return G.frameQueue.stats;
    }
    async function release(){
      nativeQueue.onSubmittedWorkDone = nativeDone;
      held.forEach(fn => fn()); await A.gpu.flush(); await raf(); await raf();
    }
    async function logical(){
      const data = await G.gc.renderToRGBA(G.drawList, { W: 128, H: 128, s: 1, tx: 0, ty: 0 });
      return [...data.slice((64 * 128 + 64) * 4, (64 * 128 + 65) * 4)];
    }
    async function displayed(){
      const bytes = await window.__queueCapture();
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, 128, 128); image.close();
      const center = [...ctx.getImageData(64, 64, 1, 1).data];
      const block = ctx.getImageData(60, 60, 8, 8).data;
      return { center, allWhite: block.every(v => v === 255) };
    }
    try {
      const before = G.frameQueue.stats;
      const occupied = await occupy();
      for (let i = 0; i < 100; i++) A.view.setZoom(1 + i / 100);
      A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true });
      A.view.setZoom(2.25); A.gpu.frame();
      const queued = G.frameQueue.stats;
      await release();
      const after = G.frameQueue.stats, canvasSize = [G.canvas.width, G.canvas.height], view = G.lastView;
      const paintedLayer = [...A.state.doc.layers[0].rgba.slice((64 * 128 + 64) * 4, (64 * 128 + 65) * 4)];
      const displayPainted = await displayed();
      const paintedGPU = await logical();

      G.opacityHold = true; A.renderPreviewOnly();
      const below = document.querySelector('#below');
      const cpuVisible = below.style.visibility !== 'hidden';
      pause(); G.opacityHold = false; A.renderPreviewOnly(); await raf();
      const keptCPUWhilePending = below.style.visibility !== 'hidden' && G.canvas.style.visibility === 'hidden';
      A.paint.setColors([0, 0, 255]); A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true });
      const cpuEditedDuringHandoff = [...below.getContext('2d').getImageData(Math.floor(below.width / 2), Math.floor(below.height / 2), 1, 1).data];
      held[0](); await raf(); await raf();
      const keptCPUAfterStaleFrame = !G.presentationReady && below.style.visibility !== 'hidden' && G.canvas.style.visibility === 'hidden';
      await release();
      const promotedAfterReady = G.presentationReady && below.style.visibility === 'hidden' && G.canvas.style.visibility !== 'hidden';
      const displayHandoff = await displayed(); A.paint.setColors([255, 0, 0]);

      await occupy(); A.paint.undo(); A.paint.undo(); A.gpu.frame(); await release();
      const displayUndone = await displayed();
      const undone = await logical();

      A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true }); await A.gpu.flush();
      await occupy(); await A.actions.run('select.all'); await A.actions.run('edit.cut'); A.gpu.frame(); await release();
      const displayCut = await displayed();
      const cut = await logical();

      A.paint.setColors([0, 255, 0]); A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true }); await A.gpu.flush();
      const built = await A.buildPsdBuffer({ fast: true }), beforeReload = A.state.doc;
      await occupy();
      const reloading = A.initDocument(built.buf, 'queued-a-reload.psd', { nested: false }).then(async () => { A.refreshAll(false); await A.gpu.flush(); });
      for (let i = 0; i < 120 && (!A.state.doc || A.state.doc === beforeReload); i++) await raf();
      await raf();
      const preservedSameDocument = G.preserveExistingGPU && G.canvas.style.visibility !== 'hidden';
      const displayReloadPending = await displayed();
      await release(); await reloading;

      
      
      
      for (let i = 0; i < 120 && !G.snap; i++) await raf();
      const hadSnapshot = !!A.gpu.snapshot();
      await occupy();
      const creating = A.docSize.newDocument({ width: 128, height: 128, background: 'white', name: 'queued-b' });
      let switched = false;
      for (let i = 0; i < 120; i++) {
        const p = A.state.doc?.layers[0]?.rgba;
        if (p && p[0] === 255 && p[1] === 255 && p[2] === 255 && p[3] === 255) { switched = true; break; }
        await raf();
      }
      await raf();
      const hiddenUntilReady = G.canvas.style.visibility === 'hidden', staleSnapshotRejected = A.gpu.snapshot() === null;
      await release(); const created = await creating; await A.gpu.flush(); await raf(); await raf();
      const displayNew = await displayed(), originalDoc = A.state.doc, source = A.state.origBuffer;
      await occupy();
      const opening = A.loadPsd(new File([source], 'queued-open.psd'));
      let reparsed = false;
      for (let i = 0; i < 120; i++) {
        if (A.state.doc && A.state.doc !== originalDoc) { reparsed = true; break; }
        await raf();
      }
      await raf();
      const blockedUntilDisplay = reparsed && document.body.classList.contains('doc-loading') && !A.actions.enabled('tool.key.V');
      await release(); const opened = await opening;
      const unblockedAfterDisplay = !document.body.classList.contains('doc-loading') && A.actions.enabled('tool.key.V');
      await A.gpu.flush();
      return { occupied, queued, before, after, paintedLayer, paintedGPU, view, displayPainted, displayUndone, displayCut, displayNew, displayHandoff, cpuEditedDuringHandoff, keptCPUAfterStaleFrame, preservedSameDocument, displayReloadPending, undone, cut, canvasSize, cpuVisible, keptCPUWhilePending, promotedAfterReady, switched, hadSnapshot, hiddenUntilReady, staleSnapshotRejected,
        created, blockedUntilDisplay, unblockedAfterDisplay, opened, final: G.frameQueue.stats };
    } finally { nativeQueue.onSubmittedWorkDone = nativeDone; held.forEach(fn => fn()); }
  }, { frameLimit: [1, 2].includes(Number(process.env.PSD_EDITOR_TEST_FRAME_LIMIT)) ? Number(process.env.PSD_EDITOR_TEST_FRAME_LIMIT) : null });
  console.log(JSON.stringify({ painted: out.displayPainted, undone: out.displayUndone, cut: out.displayCut, new: out.displayNew, layer: out.paintedLayer, gpu: out.paintedGPU }));
  assert.equal(out.occupied.inFlight, out.after.limit);
  assert.equal(out.queued.inFlight, out.after.limit); assert.equal(out.queued.pending, true);
  assert.ok(out.queued.coalesced - out.before.coalesced >= 95);
  assert.equal(out.after.inFlight, 0); assert.equal(out.after.pending, false);
  assert.equal(out.after.lastCompleted, out.queued.requested);
  assert.deepEqual(out.displayPainted.center, [255, 0, 0, 255]);
  
  
  assert.ok(out.canvasSize.every(n => n >= 288 && n <= 289), JSON.stringify(out));
  assert.deepEqual(out.canvasSize, [out.view.W, out.view.H]);
  assert.deepEqual(out.paintedLayer, [255, 0, 0, 255]); assert.deepEqual(out.paintedGPU, [255, 0, 0, 255]); assert.equal(out.view.s, 2.25);
  assert.ok(out.cpuVisible && out.keptCPUWhilePending && out.promotedAfterReady, JSON.stringify(out));
  assert.deepEqual(out.cpuEditedDuringHandoff, [0, 0, 255, 255]); assert.deepEqual(out.displayHandoff.center, [0, 0, 255, 255]);
  assert.equal(out.keptCPUAfterStaleFrame, true);
  assert.equal(out.preservedSameDocument, true); assert.deepEqual(out.displayReloadPending.center, [0, 255, 0, 255]);
  assert.equal(out.undone[3], 0); assert.equal(out.cut[3], 0);
  for (const frame of [out.displayUndone, out.displayCut]) { assert.equal(frame.center[0], frame.center[1]); assert.equal(frame.center[1], frame.center[2]); }
  assert.ok(out.switched && out.hadSnapshot && out.hiddenUntilReady && out.staleSnapshotRejected, JSON.stringify(out));
  assert.equal(out.created, true); assert.equal(out.displayNew.allWhite, true);
  assert.ok(out.opened && out.blockedUntilDisplay && out.unblockedAfterDisplay, JSON.stringify(out));
  assert.ok(out.final.maxObservedInFlight <= out.final.limit); assert.equal(out.final.inFlight, 0); assert.deepEqual(errors, []);
  console.log('✓ 实际 WebGPU 渲染：百次请求合并、最终缩放/画笔/撤销/剪切像素、同尺寸文档切换与旧快照保护');
} finally { await browser.close(); }
