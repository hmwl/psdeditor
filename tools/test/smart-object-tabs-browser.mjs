import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docs);
  await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js'), { applyEdits } = await import('/core/psd-edit.js');
    const source = { width: 32, height: 24, data: new Uint8Array(32 * 24 * 4).fill(255) };
    const encoded = writePsd({ width: 80, height: 60, layers: [{ name: 'Design', bounds: { left: 10, top: 12, right: 42, bottom: 36 }, rgba: source.data }] });
    const converted = applyEdits(encoded, [{ op: 'convertToSmartObject', index: 0, source }]);
    await window.__psd_editor.docs.openBuffer(converted.buffer, 'parent.psd');
    window.__psd_editor.selectLayers([0]);
    window.__parentView = window.__psd_editor.docs.list().find(v => v.active).view;
  });
  await page.locator('.lrow[data-layer-index="0"] .lname').dblclick();
  await page.waitForFunction(() => window.__psd_editor.state.docStack.length === 1 && window.__psd_editor.docs.count() === 2);
  const childView = await page.evaluate(() => window.__psd_editor.docs.list().find(v => v.active).view);
  const parentView = await page.evaluate(() => window.__parentView);
  const childName = await page.evaluate(() => window.__psd_editor.state.docName);
  assert.notEqual(childName, 'parent.psd');
  assert.equal(await page.locator('#docTabs .doctab:not([hidden])').count(), 2);
  assert.match(await page.locator(`#docTabs [data-view="${parentView}"]`).innerText(), /parent\.psd/);
  assert.doesNotMatch(await page.locator('#docTab').innerText(), /parent\.psd|›/);
  await page.evaluate(() => window.__psd_editor.docs.newWindow());
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.list().length), 3);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.count()), 2);
  await page.locator('#docTab .doctab-close').click();
  await page.waitForFunction(() => window.__psd_editor.docs.list().length === 2);
  assert.equal(await page.evaluate(() => window.__psd_editor.state.docStack.length), 1, 'closing a second source window keeps the source document open');
  
  await page.evaluate(async () => {
    const S = await import('/editor/app/02-doc-state.js'); S.layerRenames[0] = 'Unsaved source'; window.__psd_editor.refreshAll(false);
  });
  await page.evaluate(id => window.__psd_editor.docs.activate(id), parentView);
  await page.waitForFunction(() => window.__psd_editor.state.docStack.length === 0);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.count()), 2);
  await page.evaluate(async () => { const S = await import('/editor/app/02-doc-state.js'); S.layerRenames[0] = 'Parent change'; });
  await page.evaluate(id => window.__psd_editor.docs.activate(id), childView);
  await page.waitForFunction(() => window.__psd_editor.state.docStack.length === 1);
  assert.equal(await page.evaluate(async () => (await import('/editor/app/02-doc-state.js')).layerRenames[0]), 'Unsaved source');
  
  await page.evaluate(id => window.__psd_editor.docs.activate(id), parentView);
  await page.waitForFunction(() => window.__psd_editor.state.docStack.length === 0);
  await page.locator('.lrow[data-layer-index="0"] .lname').dblclick();
  await page.waitForFunction(id => window.__psd_editor.docs.list().some(v => v.view === id && v.active), childView);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.count()), 2);
  await page.evaluate(async () => { const M = await import('/editor/app/20-snap-smart-object.js'); assertResult(await M.saveInside()); function assertResult(v) { if (!v) throw new Error('saveInside failed'); } });
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.count()), 2);
  assert.equal(await page.evaluate(async () => (await import('/editor/app/20-snap-smart-object.js')).insideDirty()), false);
  await page.locator('#docTab .doctab-close').click();
  await page.waitForFunction(() => window.__psd_editor.state.docStack.length === 0 && window.__psd_editor.docs.count() === 1);
  assert.equal(await page.evaluate(async () => (await import('/editor/app/02-doc-state.js')).layerRenames[0]), 'Parent change');
  assert.equal(await page.evaluate(async () => (await import('/editor/app/02-doc-state.js')).docName), 'parent.psd');
  assert.deepEqual(errors, []);
  console.log('✓ double-click opens independent parent/source tabs; switches retain unsaved edits; reopen reuses tab; Save updates latest parent; Close returns to parent');
} finally { await browser.close(); }
