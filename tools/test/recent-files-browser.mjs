import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
const origin = `http://127.0.0.1:${process.argv[2] || 18949}`;
try {
  
  await page.goto(origin);
  await page.evaluate(async () => {
    localStorage.setItem('psd_editor.recentFiles', JSON.stringify([{ id: 'legacy', name: 'legacy.psd', size: 4, time: 123 }]));
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('psd_editor-recent', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const db = r.result, t = db.transaction('files', 'readwrite');
        t.objectStore('files').put(new File(['8BPS'], 'legacy.psd'), 'legacy');
        t.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  await page.goto(origin + '/editor');
  await page.waitForFunction(() => window.__psd_editor?.state, null, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(async () => {
    const R = await import('/editor/recent-files.js'); await R.load();
    return [R.items()[0].name, await (await R.get('legacy')).text()];
  }), ['legacy.psd', '8BPS']);
  console.log('✓ legacy database migration preserves names and bytes');
  await page.evaluate(async () => {
    const R = await import('/editor/recent-files.js');
    const { writePsd } = await import('/core/psd-write.js');
    const bytes = writePsd({ width: 2, height: 2, layers: [{ name: 'test', bounds: { left: 0, top: 0, right: 2, bottom: 2 }, rgba: new Uint8Array(16).fill(255) }], composite: new Uint8Array(16).fill(255) });
    window.showOpenFilePicker = async () => [{ name: 'opened.psd', getFile: async () => new File([bytes], 'opened.psd') }];
    await (await import('/editor/document-file.js')).openDocumentFile();
    if (R.items()[0]?.name !== 'opened.psd') throw Error('native open not recorded');
    const file = await R.get(R.items()[0].id);
    await Promise.all([R.load(), R.add(file), R.load()]);
    if (R.items().filter(x => x.name === file.name).length !== 1) throw Error('duplicate or lost entry');
  });
  await page.reload();
  await page.waitForFunction(() => window.__psd_editor?.state, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const R = await import('/editor/recent-files.js'); await R.load();
    const file = await R.get(R.items().find(x => x.name === 'opened.psd').id);
    if (!await (await import('/editor/app/21-load-document.js')).loadPsd(file)) throw Error('reopen failed');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2;
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    if (!await (await import('/editor/app/21-load-document.js')).openImageAsDocument(new File([blob], 'image.png', { type: 'image/png' }))) throw Error('image open failed');
    if (R.items()[0].name !== 'image.png') throw Error('image missing');
    await R.setLimit(() => 1); await R.load();
    if (R.items().length !== 1) throw Error('limit failed');
    await R.clear(); await R.load();
    if (R.items().length) throw Error('clear failed');
  });
  console.log('✓ native and image opens, concurrent load/add, persistence, reopen, limit and clear');
  
  const sizes = await page.evaluate(async () => {
    const { colorPanel } = await import('/editor/color-panel.js');
    const sec = document.getElementById('panelColor');
    const group = sec.closest('.panel-group');
    group.style.flex = 'none';
    const column = group.parentElement;
    colorPanel.setMode('hueCube');
    const measure = async (w, h) => {
      column.style.width = w + 'px'; column.style.minWidth = w + 'px'; group.style.height = h + 'px';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const r = sec.querySelector('.cp2-field').getBoundingClientRect();
      return [r.width, r.height];
    };
    return [await measure(300, 200), await measure(400, 200), await measure(400, 300), await measure(300, 150)];
  });
  assert.ok(sizes[1][0] > sizes[0][0], JSON.stringify(sizes));
  assert.equal(sizes[1][1], sizes[0][1]);
  assert.equal(sizes[1][0], sizes[2][0]);
  assert.ok(sizes[2][1] > sizes[1][1], JSON.stringify(sizes));
  assert.ok(sizes[3][0] < sizes[2][0] && sizes[3][1] < sizes[2][1]);
  assert.equal(sizes[3][1], 110);
  console.log('✓ color field follows panel width and height independently, including shrinking');
  await page.evaluate(async () => {
    const { colorPanel } = await import('/editor/color-panel.js');
    const sec = document.getElementById('panelColor'), group = sec.closest('.panel-group');
    group.style.height = '96px';
    for (const mode of ['hueCube', 'brightCube', 'wheel', 'rgb', 'cmyk', 'web', 'gray']) {
      colorPanel.setMode(mode);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const body = group.querySelector('.pg-body'), bounds = body.getBoundingClientRect();
      for (const el of sec.querySelectorAll('.cp2-field,.cp2-vbar,.cp2-row,.cp2-ramp,.cp2-chips,.cp2-warn')) {
        if (!el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1) throw Error(mode + ': content clipped ' + el.className);
      }
      if (body.scrollHeight > body.clientHeight + 1) throw Error(mode + ': body overflows');
    }
    colorPanel.setMode('hueCube');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const bar = page.locator('.cp2-vbar');
  const r = await bar.boundingBox();
  for (const fraction of [0.1, 0.5, 0.9]) {
    await page.mouse.click(r.x + 2, r.y + r.height * fraction);
    const pointer = await page.locator('.cp2-vbar-pointer').boundingBox();
    assert.ok(Math.abs(pointer.y + pointer.height / 2 - (r.y + r.height * fraction)) < 2, JSON.stringify({ r, pointer, fraction }));
    assert.ok(pointer.x + pointer.width <= r.x + 2);
  }
  assert.equal(await page.locator('.cp2-vbar-pointer').evaluate(img => img.complete && img.naturalWidth === 11), true);
  console.log('✓ all color modes fit their minimum height; source arrow follows hue selection');
  for (const seedV1 of [false, true]) {
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await fresh.goto(origin);
    await fresh.evaluate(async seed => {
      if (seed) await new Promise((resolve, reject) => {
        const r = indexedDB.open('psd_editor-recent', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result, t = db.transaction('files', 'readwrite');
          t.objectStore('files').put({ id: 'existing', name: 'existing.psd', size: 4, time: 1, file: new File(['8BPS'], 'existing.psd') });
          t.oncomplete = () => { db.close(); resolve(); };
        };
      });
      const R = await import('/editor/recent-files.js');
      await R.load();
      if (seed && await (await R.get('existing')).text() !== '8BPS') throw Error('keyed v1 migration failed');
      await R.add(new File(['test'], 'fresh.psd'));
      await R.load();
      if (await (await R.get(R.items()[0].id)).text() !== 'test') throw Error('fresh record failed');
    }, seedV1);
    await context.close();
  }
  console.log('✓ fresh database and existing keyed v1 database');
} finally { await browser.close(); }
