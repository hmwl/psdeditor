import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { decodePNG } from '../../core/formats/png.js';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  const fixture = await largeZipFixture(8001, 8000, { compression: 'rle', opaque: true });
  await page.route('**/__lazy-png.psd', route => route.fulfill({ body: fixture }));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint);
  const editedPixel = await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.loadPsd(new File([await (await fetch('/__lazy-png.psd')).blob()], 'lazy-png.psd'));
    A.selectLayers([0]); A.paint.setColors([255, 0, 0]);
    await A.paint.stroke([{ x: 8000, y: 7999 }], { size: 2, hardness: 1, plain: true, noSel: true });
    return [...await A.paint.pixelPaint[0].sparse.readRect({ x: 8000, y: 7999, w: 1, h: 1 })];
  });
  const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
  downloadPromise.catch(() => {});
  const exported = await page.evaluate(async () => (await import('/editor/app/48-info-export.js')).quickExportPng());
  assert.equal(exported, true, await page.locator('#err').textContent());
  const download = await downloadPromise;
  const png = decodePNG(await fs.readFile(await download.path()), { inflate: inflateSync });
  assert.equal(png.width, 8001); assert.equal(png.height, 8000);
  assert.deepEqual([...png.rgba.subarray(0, 4)], [171, 65, 211, 255]);
  assert.notDeepEqual(editedPixel, [171, 65, 211, 255]);
  assert.deepEqual([...png.rgba.subarray(-4)], editedPixel);
  assert.equal(await page.evaluate(() => !!window.__psd_editor.state.doc.layers[0].rgba), false);
  console.log('✓ 64MP lazy PSD exports an original-size PNG with edited edge tiles and unchanged source pixels');
} finally { await browser.close(); }
