import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docSize);
  await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.docSize.newDocument({ width: 128, height: 128, background: 'transparent', name: 'brush-undo-render' });
    A.selectLayers([0]);
    A.actions.run('tool.key.B');
    A.paint.setColors([255, 0, 0]);
    A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true });
  });
  const painted = await page.evaluate(() => {
    const d = window.__psd_editor.state.doc.layers[0].rgba;
    return [...d.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)];
  });
  assert.ok(painted[3] > 0, `brush stroke did not reach the document: ${painted}`);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await page.waitForTimeout(120);
  const result = await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.gpu.flush();
    const d = A.state.doc.layers[0].rgba;
    const out = { layer: [...d.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)], redo: A.state.brushRedo, gpu: A.gpu.active(), rendered: null };
    if (out.gpu) {
      const rgba = await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList, { W: 128, H: 128, s: 1, tx: 0, ty: 0 });
      out.rendered = [...rgba.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)];
    }
    return out;
  });
  assert.deepEqual(result.layer, [0, 0, 0, 0], `Ctrl+Z did not restore layer pixels: ${JSON.stringify(result)}`);
  assert.equal(result.redo, 1, `Ctrl+Z did not move the brush stroke to redo: ${JSON.stringify(result)}`);
  if (result.rendered) assert.deepEqual(result.rendered, [0, 0, 0, 0], `canvas compositor still shows the brush stroke: ${JSON.stringify(result)}`);

  
  
  await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.docSize.newDocument({ width: 128, height: 128, background: 'transparent', name: 'cut-brush-render' });
    A.selectLayers([0]); A.actions.run('tool.key.B'); A.paint.setColors([255, 0, 0]);
    A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true });
  });
  
  
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+x`);
  await page.waitForTimeout(120);
  const cut = await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.gpu.flush();
    const d = A.state.doc.layers[0].rgba;
    const out = { layer: [...d.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)], rendered: null };
    if (A.gpu.active()) {
      const rgba = await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList, { W: 128, H: 128, s: 1, tx: 0, ty: 0 });
      out.rendered = [...rgba.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)];
    }
    return out;
  });
  assert.equal(cut.layer[3], 0, `Ctrl+X did not clear pixels: ${JSON.stringify(cut)}`);
  if (cut.rendered) assert.equal(cut.rendered[3], 0, `Ctrl+X left stale pixels in the canvas compositor: ${JSON.stringify(cut)}`);
  await page.evaluate(() => window.__psd_editor.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush' }));
  await page.waitForTimeout(120);
  const afterCutBrush = await page.evaluate(() => {
    const d = window.__psd_editor.state.doc.layers[0].rgba;
    return [...d.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)];
  });
  assert.ok(afterCutBrush[3] > 0, `brush could not paint after Ctrl+X: ${afterCutBrush}`);

  
  
  
  await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.docSize.newDocument({ width: 128, height: 128, background: 'white', name: 'background-cut-render' });
    A.selectLayers([0]); A.actions.run('tool.key.B'); A.paint.setColors([255, 0, 0]);
    A.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush', noSel: true });
  });
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+x'); await page.waitForTimeout(120);
  const backgroundCut = await page.evaluate(() => {
    const d = window.__psd_editor.state.doc.layers[0].rgba;
    return [...d.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)];
  });
  assert.deepEqual(backgroundCut, [255, 255, 255, 255], `Background cut should keep opaque background color: ${backgroundCut}`);
  await page.evaluate(() => window.__psd_editor.paint.stroke([{ x: 64, y: 64 }, { x: 65, y: 64 }], { size: 24, tool: 'brush' }));
  const backgroundPaint = await page.evaluate(() => {
    const d = window.__psd_editor.state.doc.layers[0].rgba;
    return [...d.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)];
  });
  assert.deepEqual(backgroundPaint, [255, 0, 0, 255], `Background should remain paintable after cut: ${backgroundPaint}`);
  assert.deepEqual(errors, []);
  console.log('✓ 新建透明文档画笔绘制后 Ctrl+Z 同步清空图层像素与可见合成帧');
} finally {
  await browser.close();
}
