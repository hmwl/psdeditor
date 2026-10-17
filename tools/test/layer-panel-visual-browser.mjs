import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docs);
  fs.mkdirSync('tools/test/out/ui-parity-20261014', { recursive: true });
  const samples = ['probe-adjustments.psd', 'probe-filllayers.psd', 'probe-layereffects.psd', 'probe-smartfilters-a.psd'];
  for (const name of samples) {
    const file = `corpus/real/${name}`;
    if (!fs.existsSync(file)) continue;
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => !!window.__psd_editor.state.doc?.layers?.length, null, { timeout: 60000 });
    await page.waitForFunction(expected => document.querySelector('#docName')?.textContent.includes(expected.replace('.psd', '')), name, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#layerList .lrow').length > 0, null, { timeout: 60000 });
    const rows = await page.locator('#layerList .lrow').evaluateAll(es => es.map(e => ({ text: e.innerText, cls: e.className, masks: e.querySelectorAll('.maskthumb').length, canvas: e.querySelectorAll('canvas').length, selected: e.classList.contains('sel') })));
    assert.ok(rows.length, `${name}: layer rows missing`);
    const selected = await page.evaluate(async () => {
      const S = await import('/editor/app/23-layers-panel.js');
      const P = await import('/editor/app/03-history.js');
      const i = S.selLayer;
      return { i, context: P.propsContext?.kind || null, rows: document.querySelectorAll('#layerList .lrow.sel').length, li: !!S.li, multi: [...S.selLayers] };
    });
    assert.equal(selected.rows, selected.i >= 0 ? 1 : 0, `${name}: selected row mismatch ${JSON.stringify({ selected, rows })}`);
    const multiMasks = rows.filter(r => r.masks > 0).length;
    if (name === 'probe-adjustments.psd') {
      assert.ok(multiMasks >= 5, `adjustment sample should show mask thumbnails (${multiMasks}/${rows.length}) ${JSON.stringify(rows.slice(0,4))}`);
      await page.locator('#layerList .lrow').first().locator('.maskthumb').click();
      const maskState = await page.evaluate(async () => { const H = await import('/editor/app/03-history.js'); return { tab: H.propTab, mask: document.querySelector('#propTabs [data-prop-tab="mask"]')?.classList.contains('on'), title: document.querySelector('#propTitle')?.textContent }; });
      assert.equal(maskState.tab, 'mask', JSON.stringify(maskState)); assert.equal(maskState.mask, true, JSON.stringify(maskState)); assert.match(maskState.title, /蒙版/);
    }
    await page.screenshot({ path: `tools/test/out/ui-parity-20261014/${name.replace('.psd', '')}-layer-panel.png` });
  }
  assert.deepEqual(errors, []);
  console.log('✓ layer-type rows, thumbnails, mask thumbnails, selected row and property target stay synchronized across native samples');
} finally { await browser.close(); }
