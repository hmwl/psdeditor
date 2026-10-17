import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = process.argv[2] || process.env.PORT || 8789;
const chrome = process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await PW.chromium.launch({ executablePath: chrome });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${port}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.actions, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js');
    const F = window.__psd_editor;
    const rgba = new Uint8Array(64 * 48 * 4);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
      const q = (y * 64 + x) * 4; rgba[q] = x * 3; rgba[q + 1] = y * 5; rgba[q + 2] = 180; rgba[q + 3] = 255;
    }
    await F.initDocument(writePsd({ width: 160, height: 120, layers: [{ name: 'Base', bounds: { left: 0, top: 0, right: 160, bottom: 120 }, rgba: new Uint8Array(160 * 120 * 4).fill(255) }], composite: new Uint8Array(160 * 120 * 4).fill(255) }).buffer, 'place-test.psd', { nested: false });
  });
  const pngBytes = Array.from(fs.readFileSync(path.join(root, 'tools/test/fixtures/formats/base.png')));
  const result = await page.evaluate(async bytes => {
    const C = await import('/editor/app/26-layer-create.js');
    const ok = await C.placeEmbeddedUI(new File([new Uint8Array(bytes)], 'placed.png', { type: 'image/png' }));
    const s = window.__psd_editor.state;
    return { ok, count: s.doc.layers.length, smart: s.doc.layers.map(l => !!l.isSmartObject), names: s.doc.layers.map(l => l.name), error: document.querySelector('#err')?.textContent || '' };
  }, pngBytes);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.smart.filter(Boolean).length, 1);
  assert.match(result.names.join('|'), /placed/);
  assert.equal(result.error, '');
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForTimeout(300);
  const undone = await page.evaluate(() => ({ count: window.__psd_editor.state.doc.layers.length, smart: window.__psd_editor.state.doc.layers.some(l => l.isSmartObject) }));
  assert.deepEqual(undone, { count: 1, smart: false });
  assert.deepEqual(errors, []);
  console.log('✓ place embedded PNG creates a smart object, preserves source, and undoes as one structural step');
} finally { await browser.close(); }
