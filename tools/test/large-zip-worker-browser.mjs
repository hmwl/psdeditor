import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const fixture = await largeZipFixture();
assert.ok(fixture.length < 24 * 1048576, 'fixture must cover small compressed files with huge dimensions');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: WEBGPU_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [], startup = []; page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('console', m => { if (m.type() === 'error') startup.push(m.text()); });
  await page.route('**/__large-zip-test.psd', route => route.fulfill({ body: fixture, contentType: 'application/octet-stream' }));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  try { await Promise.race([
    page.waitForFunction(() => window.__psd_editor?.docSize),
    page.waitForEvent('pageerror').then(e => { throw e; }),
  ]); }
  catch (e) { throw new Error(`编辑器启动失败：${JSON.stringify({ errors, startup, body: (await page.locator('body').innerText()).slice(0, 500) })}`, { cause: e }); }
  const out = await page.evaluate(async () => {
    const A = window.__psd_editor;
    const decodeLazyTile = A.decode.tile, decodeCacheStatus = A.decode.status;
    const blob = await (await fetch('/__large-zip-test.psd')).blob();
    const start = performance.now();
    const loaded = await A.loadPsd(new File([blob], 'large-zip-test.psd'));
    const openMs = performance.now() - start, layer = A.state.doc?.layers[0];
    if (!loaded) return { loaded, error: document.querySelector('#err').textContent };
    const initial = decodeCacheStatus();
    const detailStart = performance.now();
    await decodeLazyTile(0, 2048, 24064); const first = decodeCacheStatus();
    const detailMs = performance.now() - detailStart;
    const adjacentStart = performance.now();
    await Promise.all([decodeLazyTile(0, 2304, 24064), decodeLazyTile(0, 2560, 24064)]);
    const adjacentMs = performance.now() - adjacentStart, adjacent = decodeCacheStatus();
    const colors = [171, 65, 211, 255];
    const validTiles = [...layer.lazyHighTiles.values()].every(t => t.data.every((v, i) => v === colors[i % 4]));
    A.gpu.frame();
    const list = A.gpu.G.drawList;
    const pixels = await A.gpu.G.gc.renderToRGBA(list, { W: 16, H: 16, s: 16 / 30000, tx: 0, ty: 0 });
    const pixel = [...pixels.slice((8 * 16 + 2) * 4, (8 * 16 + 3) * 4)];
    const overlays = ['#warp', '#above'].map(id => { const c = A.viewScratch.get(id); return c ? [c.width, c.height] : null; });
    return { loaded, width: A.state.docW, height: A.state.docH, rgba: layer.rgba, preview: { width: layer.lazyPreview.width, height: layer.lazyPreview.height },
      initial, first, adjacent, validTiles, pixel, overlays, openMs, detailMs, adjacentMs, busy: document.body.classList.contains('doc-loading') };
  });
  assert.equal(out.loaded, true, JSON.stringify(out));
  assert.equal(out.width, 9390); assert.equal(out.height, 30000); assert.equal(out.rgba, null);
  assert.ok(out.preview.width <= 2048 && out.preview.height <= 2048);
  assert.equal(out.initial.sourceTransfers, 1); assert.equal(out.first.sourceTransfers, 1); assert.equal(out.adjacent.sourceTransfers, 1);
  assert.equal(out.first.streamStarts, 4); assert.equal(out.adjacent.streamStarts, 4);
  assert.equal(out.first.rowsRead - out.initial.rowsRead, 4 * 256); assert.equal(out.adjacent.rowsRead, out.first.rowsRead);
  assert.ok(out.adjacent.rowBytes <= 64 * 1048576);
  assert.equal(out.validTiles, true); assert.deepEqual(out.pixel, [171, 65, 211, 255]);
  assert.deepEqual(out.overlays, [[1, 1], [1, 1]]);
  assert.equal(out.busy, false); assert.deepEqual(errors, []);
  console.log('✓ 真实 9390×30000 ZIP PSD 经编辑器打开/预览/GPU 读回/底部细节瓦片，无整层 RGBA 或整幅空叠加面');
  const report = { fixture: 'generated solid ZIP PSD, one 8-bit RGB layer', width: 9390, height: 30000, fileBytes: fixture.length,
    browser: await browser.version(), renderer: 'headless Chrome + SwiftShader', build: process.env.PSD_EDITOR_TEST_DIST === '1' ? 'dist' : 'source',
    openMs: out.openMs, detailMs: out.detailMs, twoAdjacentTilesMs: out.adjacentMs, first: out.first, adjacent: out.adjacent };
  console.log(JSON.stringify(report));
  if (process.env.PSD_EDITOR_PERF_REPORT) await writeFile(process.env.PSD_EDITOR_PERF_REPORT, JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
