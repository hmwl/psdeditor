import assert from 'node:assert/strict';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: process.env.PSD_EDITOR_PERF_NATIVE_GPU === '1' ? [] : WEBGPU_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const fixture = await largeZipFixture(9390, 30000, { compression: process.env.PSD_EDITOR_PERF_COMPRESSION || 'rle', patterned: true });
  await page.route('**/__sparse-fill.psd', r => r.fulfill({ body: fixture, contentType: 'application/octet-stream' }));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint);
  const out = await page.evaluate(async () => {
    const A = window.__psd_editor;
    const blob = await (await fetch('/__sparse-fill.psd')).blob();
    await A.loadPsd(new File([blob], 'sparse-fill.psd'));
    A.selectLayers([0]);
    A.view.setZoom(1);
    const x = 4600, y = 14800;
    const sample = async (px, py) => {
      await A.gpu.flush();
      const p = await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList, { W: 1, H: 1, s: 1, tx: -px, ty: -py });
      return [...p];
    };
    await A.decode.tile(0, Math.floor(x / 256) * 256, Math.floor(y / 256) * 256);
    const before = await sample(x + 8, y + 8);
    await A.lazy.selection();
    A.sel.rect(x, y, 64, 48);
    const selBounds = A.sel.bounds(), selAt = A.sel.valueAt(x + 8, y + 8);
    const filled = await A.fillSelectionPixels([255, 0, 0]);
    const red = await sample(x + 8, y + 8);
    const outside = await sample(x + 96, y + 8);
    const pp = A.paint.pixelPaint[0];
    const filledStats = pp.sparse.stats;
    const cleared = await A.clearSelectionPixels();
    const clearedPixel = await sample(x + 8, y + 8);
    const historyKind = A.paint.history.undo.at(-1)?.kind;
    await A.actions.run('edit.undo'); await A.lastAction;
    const undoPixel = await sample(x + 8, y + 8);
    await A.actions.run('edit.redo'); await A.lastAction;
    const redoPixel = await sample(x + 8, y + 8);
    await A.actions.run('edit.undo'); await A.lastAction;
    await A.actions.run('edit.undo'); await A.lastAction;
    const fillUndoPixel = await sample(x + 8, y + 8);
    return { before, filled, red, outside, cleared, clearedPixel, undoPixel, redoPixel, filledStats, lazy: !A.state.doc.layers[0].rgba,
      fillUndoPixel, history: historyKind, err: document.querySelector('#err').textContent,
      notice: document.querySelector('#notice').textContent, pp: !!pp, sparse: !!pp?.sparse, selBounds, selAt,
      layer: { w: A.state.doc.layers[0].width, h: A.state.doc.layers[0].height, lazy: !!A.state.doc.layers[0].lazyChannels, compressed: !!A.state.doc.layers[0].lazyCompressedChannels } };
  });
  assert.equal(out.lazy, true);
  assert.equal(out.filled, true);
  assert.equal(out.cleared, true);
  assert.deepEqual(out.red, [255, 0, 0, 255]);
  assert.deepEqual(out.outside, out.before);
  assert.deepEqual(out.clearedPixel, [0, 0, 0, 0]);
  assert.deepEqual(out.undoPixel, [255, 0, 0, 255]);
  assert.deepEqual(out.redoPixel, [0, 0, 0, 0]);
  assert.deepEqual(out.fillUndoPixel, out.before);
  assert.equal(out.history, 'sparsePixels');
  assert.ok(out.filledStats.editedBytes <= 2 * 256 * 256 * 4);
  assert.equal(out.err, '');
  console.log('✓ 超大图层局部填充/清除走稀疏瓦片事务并支持撤销/重做');
} finally {
  await browser.close();
}
