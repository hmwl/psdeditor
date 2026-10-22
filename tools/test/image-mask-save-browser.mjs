
import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
import { createJpegEncoder } from '../../core/jpeg-encode.js';

const W = 9000, H = 8000;
const enc = createJpegEncoder({ width: W, height: H, quality: 85 });
const row = new Uint8Array(W * 8 * 4);
for (let y = 0; y < H; y += 8) {
  for (let r = 0; r < 8; r++) {
    for (let x = 0; x < W; x++) {
      const o = (r * W + x) * 4;
      row[o] = 170; row[o + 1] = 65; row[o + 2] = 210; row[o + 3] = 255;
    }
  }
  enc.writeRows(row, 8);
}
const jpg = new Uint8Array(await enc.finish().arrayBuffer());

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({
  executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: WEBGPU_ARGS,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint, null, { timeout: 60000 });
  await page.setInputFiles('#file', { name: 'large-mask-src.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && l.width > 1 && (l.lazyRasterSource || l.rgba);
  }, null, { timeout: 180000 });
  await page.waitForFunction(() => window.__psd_editor.actions.enabled('layer.new'), null, { timeout: 120000 });
  await page.waitForTimeout(300);

  const out = await page.evaluate(async () => {
    const A = window.__psd_editor, B = await import('/editor/app/38-brush-engine.js'), RP = await import('/core/psd-raster.js');
    await A.lazy.selection();
    A.selectLayers([0]);
    A.sel.rect(0, 0, A.state.docW, A.state.docH, 'replace');
    await new Promise(r => setTimeout(r, 150));
    const added = B.maskFromSelection(0); B.maskAdded(0);
    await new Promise(r => setTimeout(r, 250));
    const ops = (A.state.layerOps?.[0] || []).map(o => o.op);
    let saved = false, err = '';
    try {
      const built = await A.buildPsdBuffer({ fast: true });
      await A.loadPsd(new File([built.buf], 'masked-image.psd'));
      await new Promise(r => setTimeout(r, 1200));
      saved = true;
    } catch (e) { err = String(e.message || e); }
    const L = A.state.doc.layers[0];
    return { added, ops, saved, err, after: L ? { mask: !!L.mask, keys: L.additionalKeys || [] } : null,
      maskInside: L && L.mask ? RP.readLazyMaskPixel(L, 300, 300, false) : null,
      errUI: document.querySelector('#err')?.textContent || '' };
  });
  console.log(JSON.stringify(out));
  assert.equal(out.added, true);
  assert.ok(out.ops.includes('addLayerMask'));
  assert.equal(out.saved, true, out.err);
  assert.equal(out.after.mask, true, '保存后蒙版必须还在（不能被直通写回丢掉）');
  assert.equal(out.maskInside, 255);
  assert.equal(out.errUI, '');
  assert.deepEqual(errors, []);
  console.log('✓ 大 JPG 新建蒙版后保存/重开保留蒙版通道');
} finally {
  await browser.close();
}
