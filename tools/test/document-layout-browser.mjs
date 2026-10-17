import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  fs.mkdirSync('tools/test/out/ui-parity-20261014', { recursive: true });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docs);
  await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js');
    const px = new Uint8Array(80 * 60 * 4).fill(255);
    const bytes = writePsd({ width: 80, height: 60, layers: [{ name: 'Layer', bounds: { left: 0, top: 0, right: 80, bottom: 60 }, rgba: px }] });
    for (const name of ['one', 'two', 'three']) await window.__psd_editor.docs.openBuffer(bytes.buffer.slice(0), `${name}.psd`);
  });
  await page.evaluate(async () => {
    const S = await import('/editor/app/02-doc-state.js');
    const D = window.__psd_editor.docs;
    for (const v of D.list()) { await D.activate(v.view); S.setDocViewState({ zoom: 1.25 + v.view / 10, fit: false, cap: 2, panX: 12, panY: -8, angle: 0, flip: false }); }
  });
  const before = await page.evaluate(() => window.__psd_editor.docs.list().map(v => v.name));
  const zooms = await page.evaluate(() => window.__psd_editor.docs.list().map(v => v.view_state.zoom));
  const activeBefore = await page.evaluate(() => window.__psd_editor.docs.list().find(v => v.active).name);
  await page.evaluate(() => window.__psd_editor.docs.arrangeGrid('tileV'));
  const tiled = await page.evaluate(() => ({ layout: window.__psd_editor.docs.layout, frames: [...document.querySelectorAll('.dframe')].map(e => ({ w: e.getBoundingClientRect().width, tabs: [...e.querySelectorAll('.doctab-title')].map(t => t.textContent) })) }));
  assert.equal(tiled.layout.mode, 'grid');
  assert.deepEqual(tiled.frames.map(f => f.tabs[0]?.split(' @ ')[0]), before);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.list().find(v => v.active).name), activeBefore);
  const widths = tiled.frames.map(f => f.w); assert.ok(widths.every(w => w > 300)); assert.ok(Math.max(...widths) - Math.min(...widths) < 3);
  assert.deepEqual(await page.evaluate(() => window.__psd_editor.docs.list().map(v => v.view_state.zoom)), zooms);
  assert.equal(await page.locator('#docTabs').isVisible(), false, 'split frames have their own tab bars');
  const divider = page.locator('.dframe-divider').first(), db = await divider.boundingBox();
  await page.mouse.move(db.x + db.width / 2, db.y + 150); await page.mouse.down(); await page.mouse.move(db.x + db.width / 2 + 65, db.y + 150, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.locator('.dframe').first().evaluate(e => e.getBoundingClientRect().width) > widths[0] + 50);
  assert.deepEqual(await page.evaluate(() => window.__psd_editor.docs.list().map(v => v.view_state.zoom)), zooms);
  const firstFrame = page.locator('.dframe').nth(0), secondFrame = page.locator('.dframe').nth(1);
  const firstTab = firstFrame.locator('.doctab').first(), firstTabBox = await firstTab.boundingBox(), secondBarBox = await secondFrame.locator('.dframe-bar').boundingBox();
  assert.ok(firstTabBox && secondBarBox);
  await page.mouse.move(firstTabBox.x + firstTabBox.width / 2, firstTabBox.y + firstTabBox.height / 2); await page.mouse.down();
  await page.mouse.move(secondBarBox.x + secondBarBox.width / 2, secondBarBox.y + secondBarBox.height / 2); await page.mouse.up();
  const grouped = await page.evaluate(() => window.__psd_editor.docs.layout.frames.map(f => f.views.length));
  assert.ok(grouped.some(n => n >= 2), 'dragging a split tab onto another frame should group documents');
  const geometry = await page.locator('.dframe').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }).sort((a, b) => a[0] - b[0]));
  assert.ok(Math.abs(geometry[0][1] - geometry[1][0]) <= 1, 'removing a pane must fill its space');
  assert.equal(await page.locator('#viewport').count(), 1);
  assert.equal(await page.locator('.dframe > .statusbar').count(), 1);
  assert.equal(await page.locator('.docarea > .statusbar').count(), 0);
  await page.evaluate(() => window.__psd_editor.docs.arrangeFloat('float'));
  const floatView = await page.evaluate(() => window.__psd_editor.docs.list().find(v => v.active).view);
  const float = page.locator('.dframe.float').first(), box = await float.boundingBox(); assert.ok(box);
  await page.mouse.move(box.x + 60, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + 180, box.y + 90); await page.mouse.up();
  const moved = await page.evaluate(id => { const f = window.__psd_editor.docs.layout.frames.find(x => x.views.includes(id)); return { f, active: window.__psd_editor.docs.list().find(v => v.active).view }; }, floatView);
  assert.equal(moved.active, floatView); assert.ok(moved.f.float); assert.ok(moved.f.rect.x > 80 && moved.f.rect.y > 40);
  const east = await float.locator('.dframe-resize-e').boundingBox();
  const resizeHit = await page.evaluate(p => document.elementsFromPoint(p.x + 2, p.y + p.height / 2).map(e => e.id || e.className).slice(0, 8), east);
  await page.mouse.move(east.x + 2, east.y + east.height / 2); await page.mouse.down(); await page.mouse.move(east.x + 62, east.y + east.height / 2, { steps: 4 }); await page.mouse.up();
  const expanded = await page.evaluate(id => window.__psd_editor.docs.layout.frames.find(f => f.views.includes(id)).rect, floatView);
  assert.ok(expanded.w >= moved.f.rect.w + 55, JSON.stringify({ expanded, previous: moved.f.rect, east, resizeHit })); moved.f.rect = expanded;
  const movedBox = await float.boundingBox();
  await page.mouse.move(movedBox.x + 60, movedBox.y + 12); await page.mouse.down(); await page.mouse.move(movedBox.x + 100, movedBox.y + 72, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await page.evaluate(id => window.__psd_editor.docs.layout.frames.find(f => f.views.includes(id)).rect, floatView), moved.f.rect, 'Escape cancels floating window drag');
  
  const dockBar = await page.locator('.dframe:not(.float) .dframe-bar').boundingBox();
  await page.mouse.move(movedBox.x + 60, movedBox.y + 12); await page.mouse.down(); await page.mouse.move(dockBar.x + 40, dockBar.y + 12, { steps: 8 }); await page.mouse.up();
  assert.equal(await page.locator('.dframe.float').count(), 0);
  assert.equal(await page.locator('#viewport').count(), 1);
  await page.evaluate(() => window.__psd_editor.docs.consolidate());
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.layout.mode), 'tabs');
  assert.deepEqual(await page.evaluate(() => window.__psd_editor.docs.list().map(v => v.name)), before);
  
  const sourceBox = await page.locator('#docTabs .doctab').first().boundingBox();
  await page.mouse.move(sourceBox.x + 45, sourceBox.y + 12); await page.mouse.down(); await page.mouse.move(sourceBox.x + 120, sourceBox.y + 130, { steps: 6 }); await page.mouse.up();
  assert.equal(await page.locator('.dframe.float').count(), 1);
  const floatingBox = await page.locator('.dframe.float').boundingBox(), dockedBox = await page.locator('.dframe:not(.float)').boundingBox();
  await page.mouse.move(floatingBox.x + 50, floatingBox.y + 12); await page.mouse.down(); await page.mouse.move(dockedBox.x + dockedBox.width - 12, dockedBox.y + dockedBox.height / 2, { steps: 6 });
  assert.equal(await page.locator('.dt-split-preview').count(), 1);
  await page.mouse.up();
  assert.equal(await page.locator('.dframe.float').count(), 0); assert.equal(await page.locator('.dframe').count(), 2);
  assert.equal(await page.locator('.dframe-divider').count(), 1); assert.equal(await page.locator('#viewport').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__psd_editor.docs.list().map(v => v.view_state.zoom)), zooms);
  await page.screenshot({ path: 'tools/test/out/ui-parity-20261014/editor-document-split.png' });
  await page.evaluate(() => window.__psd_editor.docs.consolidate());
  
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.arrangeGrid('4')), false);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.layout.mode), 'tabs');
  
  
  await page.evaluate(() => window.__psd_editor.docs.newWindow());
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.count()), 3);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.list().length), 4);
  await page.evaluate(() => window.__psd_editor.docs.arrangeGrid('4'));
  assert.equal(await page.locator('.dframe').count(), 4);
  const newView = await page.evaluate(() => window.__psd_editor.docs.list().find(v => v.active).view);
  await page.evaluate(id => window.__psd_editor.docs.closeView(id, { discard: true }), newView);
  assert.equal(await page.evaluate(() => window.__psd_editor.docs.count()), 3);
  assert.equal(await page.locator('#viewport').count(), 1);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__psd_editor.docs.newWindow());
  for (const [kind, count] of [['2h', 2], ['3s', 3], ['6', 6], ['tileH', 6]]) {
    await page.evaluate(kind => window.__psd_editor.docs.arrangeGrid(kind), kind);
    const cells = await page.locator('.dframe').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
    assert.equal(cells.length, count);
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
      const overlapX = Math.min(cells[a].x + cells[a].w, cells[b].x + cells[b].w) - Math.max(cells[a].x, cells[b].x);
      const overlapY = Math.min(cells[a].y + cells[a].h, cells[b].y + cells[b].h) - Math.max(cells[a].y, cells[b].y);
      assert.ok(overlapX <= 1 || overlapY <= 1, `${kind} panes overlap`);
    }
    assert.equal(await page.locator('#viewport').count(), 1);
  }
  await page.evaluate(() => window.__psd_editor.docs.arrangeGrid('2h'));
  const horizontal = await page.locator('.dframe-divider.horizontal').boundingBox();
  const topHeight = await page.locator('.dframe').first().evaluate(e => e.clientHeight);
  await page.mouse.move(horizontal.x + 150, horizontal.y + 3); await page.mouse.down(); await page.mouse.move(horizontal.x + 150, horizontal.y + 48, { steps: 4 }); await page.mouse.up();
  assert.ok(await page.locator('.dframe').first().evaluate(e => e.clientHeight) >= topHeight + 40);
  const inactiveZoom = page.locator('.dframe-status:not([hidden]) .dframe-zoom').first();
  const zoomTarget = await inactiveZoom.evaluate(e => +e.closest('.dframe').querySelector('.doctab.active').dataset.view);
  await inactiveZoom.fill('200%'); await inactiveZoom.press('Enter');
  await page.waitForFunction(id => window.__psd_editor.docs.list().some(v => v.view === id && v.active && v.view_state.zoom === 2), zoomTarget, { timeout: 5000 });
  
  await page.evaluate(async () => {
    const P = await import('/editor/preferences.js'), D = window.__psd_editor.docs, S = await import('/editor/app/02-doc-state.js');
    P.set({ workspace: { openAsTabs: false } }); await D.openBuffer(S.origBuffer.slice(0), 'floating-pref.psd');
  });
  assert.equal(await page.evaluate(() => { const D = window.__psd_editor.docs; return D.layout.frames.find(f => f.views.includes(D.list().find(v => v.active).view)).float; }), true);
  await page.evaluate(async () => (await import('/editor/preferences.js')).set({ workspace: { floatDocDocking: false } }));
  const prefFloat = await page.locator('.dframe.float').boundingBox(), prefBar = await page.locator('.dframe:not(.float) .dframe-bar').first().boundingBox();
  await page.mouse.move(prefFloat.x + 50, prefFloat.y + 12); await page.mouse.down(); await page.mouse.move(prefBar.x + 40, prefBar.y + 12, { steps: 6 }); await page.mouse.up();
  assert.equal(await page.locator('.dframe.float').count(), 1, 'disabled docking keeps floating window separate');
  await page.evaluate(async () => (await import('/editor/preferences.js')).set({ workspace: { openAsTabs: true, floatDocDocking: true } }));
  assert.deepEqual(errors, []);
  console.log('✓ order/zoom preserved, resize dividers, group/tear off/edge dock/float redock, Esc, viewport survival, shared windows and workspace preferences');
} finally { await browser.close(); }
