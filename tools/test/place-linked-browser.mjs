import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = process.argv[2] || process.env.PORT || 8789;
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${port}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.actions, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js');
    await window.__psd_editor.initDocument(writePsd({ width: 160, height: 120, layers: [{ name: 'Base', bounds: { left: 0, top: 0, right: 160, bottom: 120 }, rgba: new Uint8Array(160 * 120 * 4).fill(255) }] }).buffer, 'link-test.psd', { nested: false });
    window.__fpDialog = () => 'ok';
  });
  const bytes = Array.from(fs.readFileSync(path.join(root, 'tools/test/fixtures/formats/base.png')));
  await page.evaluate(b => {
    window.__linkedBytes = b;
  }, bytes);
  await page.evaluate(async () => {
    const S = await import('/editor/app/02-doc-state.js');
    S.LX.linkPicker.pick = async () => ({ file: new File([new Uint8Array(window.__linkedBytes)], 'linked.png', { type: 'image/png' }), handle: null });
    window.__psd_editor.actions.run('file.placeLinked');
  });
  await page.waitForFunction(() => window.__psd_editor.state.doc?.layers?.length === 2, null, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const S = await import('/editor/app/02-doc-state.js');
    const L = S.doc.layers[1];
    return { name: L.name, smart: !!L.isSmartObject, linkId: S.sos.find(so => S.sos.indexOf(so) === 0)?.linkId || S.sos[0]?.linkId, error: document.querySelector('#err')?.textContent || '' };
  });
  assert.equal(result.smart, true);
  assert.ok(result.linkId, 'linked smart object should have a link id');
  assert.equal(result.error, '');
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__psd_editor.state.doc.layers.length), 1);
  assert.deepEqual(errors, []);
  console.log('✓ injected File System picker places a linked smart object and undoes as one structural step');
} finally { await browser.close(); }
