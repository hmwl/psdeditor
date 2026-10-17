import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required for repeated Free Transform regression');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docs);
  for (const smart of [false, true]) {
    await page.evaluate(async smart => {
      const F = window.__psd_editor, { writePsd } = await import('/core/psd-write.js'), { applyEdits } = await import('/core/psd-edit.js');
      const source = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(255) };
      let buf = writePsd({ width: 160, height: 140, layers: [{ name: 'Repeat probe', bounds: { left: 24, top: 30, right: 88, bottom: 94 }, rgba: source.data }] }).buffer;
      if (smart) buf = applyEdits(buf, [{ op: 'convertToSmartObject', index: 0, source }]).buffer;
      await F.docs.openBuffer(buf, smart ? 'repeat-smart.psd' : 'repeat-pixels.psd'); F.selectLayers([0]);
      const { tools } = await import('/editor/tools.js'); tools.select('move');
      await (await import('/editor/app/01-boot.js')).QUADW.load();
    }, smart);
    for (let round = 0; round < 3; round++) {
      await page.keyboard.press('Control+t');
      await page.waitForFunction(() => !!window.__psd_editor.transform.state);
      await page.click('#tfWarp');
      await page.waitForFunction(() => !!window.__psd_editor.state.li);
      await page.selectOption('#twStyle', round === 1 ? 'warpBulge' : 'warpArc');
      await page.locator('#twBend').fill(String(18 + round * 5));
      await page.locator('#twBend').dispatchEvent('change');
      await page.click(round === 2 ? '#twCancel' : '#twConfirm');
      await page.waitForFunction(async () => {
        const W = await import('/editor/app/26-layer-create.js');
        return !window.__psd_editor.state.li && !W.warpSession && !window.__psd_editor.transform.state;
      });
      assert.equal(await page.evaluate(() => document.querySelector('#grpTransformWarp').hidden), true);
      assert.equal(await page.evaluate(() => !!window.__psd_editor.state.doc.layers[0].isSmartObject), smart);
    }
    console.log(`✓ Ctrl+T → Warp → confirm/reenter/cancel three times (${smart ? 'smart object' : 'pixel layer'})`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
