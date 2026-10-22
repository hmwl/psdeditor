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
  const interop = await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js');
    const { applyEdits } = await import('/core/psd-edit.js');
    const { parsePsdDocument, serializePsdDocument } = await import('/core/psd-document.js');
    const bounds = { left: 0, top: 0, right: 32, bottom: 24 };
    let bytes = writePsd({ width: 32, height: 24, layers: [0, 1].map(i => ({ name: 'Mask ' + i, bounds, rgba: new Uint8Array(32 * 24 * 4).fill(255) })) });
    bytes = applyEdits(bytes, [
      { op: 'addLayerMask', index: 0, fill: 'reveal' }, { op: 'addLayerMask', index: 1, fill: 'hide' },
      { op: 'setLayerProps', index: 1, clipping: true },
      { op: 'addAdjustmentLayer', kind: 'invert', name: 'No mask adjustment' },
    ]).buffer;
    const doc = parsePsdDocument(bytes);
    for (const layer of doc.layerInfo.layers.slice(0, 2)) {
      Object.assign(layer.mask, { top: 0, left: 0, bottom: 0, right: 0, _dirty: true });
      Object.assign(layer.channels.find(c => c.id === -2), { _raw: new Uint8Array([0, 0]), length: 2, _dirty: true });
    }
    await window.__psd_editor.initDocument(serializePsdDocument(doc), 'mask-panel-interop.psd');
    window.__psd_editor.refreshAll(true);
    return [0, 1, 2].map(i => {
      const row = document.querySelector(`#layerList .lrow[data-layer-index="${i}"]`), mask = row.querySelector('.maskthumb canvas');
      const thumb = row.querySelector('.thumb').getBoundingClientRect();
      return { rowHeight: row.getBoundingClientRect().height, thumb: { width: thumb.width, height: thumb.height },
        underlined: row.querySelector('.lname').classList.contains('clipped'), mask: !!mask,
        maskSize: mask ? [mask.parentElement.getBoundingClientRect().width, mask.parentElement.getBoundingClientRect().height] : null,
        firstPixel: mask ? [...mask.getContext('2d').getImageData(0, 0, 1, 1).data] : null,
        contentPixel: row.querySelector('.thumb canvas') ? [...row.querySelector('.thumb canvas').getContext('2d').getImageData(8, 8, 1, 1).data] : null,
        children: [...row.children].map(c => c.className.split(' ')[0]) };
    });
  });
  assert.deepEqual(interop.slice(0, 2).map(r => r.maskSize), [[32, 24], [32, 24]]);
  assert.deepEqual(interop.map(r => r.underlined), [true, false, false], 'only the clipping base name is underlined');
  assert.deepEqual(interop.map(r => r.firstPixel), [[255, 255, 255, 255], [0, 0, 0, 255], null]);
  assert.deepEqual(interop.slice(0, 2).map(r => r.contentPixel), [[255, 255, 255, 255], [255, 255, 255, 255]], 'content thumbnails retain original alpha independently of the mask');
  assert.equal(interop[2].mask, false, 'adjustments without real masks do not receive fabricated mask targets');
  assert.deepEqual(interop.map(r => r.rowHeight), [34, 34, 41], 'document-shaped thumbnails and square adjustment slots determine row heights');
  assert.deepEqual(interop.map(r => r.thumb), [{ width: 32, height: 24 }, { width: 32, height: 24 }, { width: 32, height: 32 }]);
  assert.ok(interop[1].children.indexOf('clipmark') < interop[1].children.indexOf('thumb'));
  assert.ok(interop[1].children.indexOf('thumb') < interop[1].children.indexOf('masklink'));
  assert.ok(interop[1].children.indexOf('masklink') < interop[1].children.indexOf('maskthumb'));
  const thumbCss = await page.evaluate(() => {
    const row = document.querySelector('#layerList .lrow[data-layer-index="0"]');
    const thumb = row.querySelector('.thumb'), mask = row.querySelector('.maskthumb');
    const cs = e => { const s = getComputedStyle(e); return { bg: s.backgroundImage, border: s.borderTopColor + ' ' + s.borderTopWidth, shadow: s.boxShadow }; };
    const before = { thumb: cs(thumb), mask: mask && cs(mask) };
    thumb.classList.add('target'); mask?.classList.add('target');
    return { before, thumb: cs(thumb), mask: mask && cs(mask) };
  });
  assert.match(thumbCss.thumb.bg, /repeating-conic-gradient/);
  assert.equal(thumbCss.before.thumb.border, 'rgb(119, 119, 119) 1px');
  assert.equal(thumbCss.thumb.border, 'rgb(102, 102, 102) 1px');
  assert.match(thumbCss.thumb.shadow, /rgb\(255, 255, 255\)/);
  if (thumbCss.mask) { assert.match(thumbCss.mask.bg, /repeating-conic-gradient/); assert.equal(thumbCss.before.mask.border, 'rgb(119, 119, 119) 1px'); assert.equal(thumbCss.mask.border, 'rgb(102, 102, 102) 1px'); assert.match(thumbCss.mask.shadow, /rgb\(255, 255, 255\)/); }
  const pixelLink = page.locator('#layerList .lrow[data-layer-index="0"] .masklink[data-mask-kind="pixel"]');
  const linkGeometry = () => pixelLink.evaluate(e => {
    const r = e.getBoundingClientRect(), thumb = e.previousElementSibling.getBoundingClientRect(), mask = e.nextElementSibling.getBoundingClientRect();
    return { x: r.x, width: r.width, right: r.right, thumbRight: thumb.right, maskX: mask.x };
  });
  const beforeLink = await linkGeometry();
  assert.equal(beforeLink.width, 16);
  assert.equal(beforeLink.maskX - beforeLink.thumbRight, 16, 'the chain hit box replaces both row gaps');
  assert.equal(beforeLink.x, beforeLink.thumbRight, 'chain button starts after content without overlap');
  assert.equal(beforeLink.right, beforeLink.maskX, 'chain button ends before mask without overlap');
  await page.evaluate(() => window.__psd_editor.selectLayers([1]));
  const historyBefore = await page.evaluate(async () => (await import('/editor/app/03-history.js')).histLog.cursor);
  await pixelLink.click();
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink')?.getAttribute('aria-pressed') === 'false');
  assert.equal(await page.evaluate(async () => (await import('/editor/app/23-layers-panel.js')).selLayer), 0);
  assert.equal(await page.evaluate(async () => (await import('/editor/app/03-history.js')).histLog.cursor), historyBefore + 1);
  assert.deepEqual(await linkGeometry(), beforeLink, 'unlink preserves the button and mask hit positions');
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink')?.getAttribute('aria-pressed') === 'true');
  await page.evaluate(() => window.__psd_editor.actions.run('edit.redo'));
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink')?.getAttribute('aria-pressed') === 'false');
  await pixelLink.press('Enter');
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink')?.getAttribute('aria-pressed') === 'true');
  await pixelLink.press('Space');
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink')?.getAttribute('aria-pressed') === 'false');
  const savedLink = await page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    const { parsePsdDocument } = await import('/core/psd-document.js');
    return parsePsdDocument(built.buf).layerInfo.layers[0].mask.flags & 1;
  });
  assert.equal(savedLink, 1, 'actual click/keyboard unlink persists in PSD mask flags');
  await pixelLink.click();
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink')?.getAttribute('aria-pressed') === 'true');
  await page.locator('#layerList .lrow[data-layer-index="0"] .maskthumb').click();
  await page.waitForTimeout(30);
  const targetState = await page.evaluate(() => ({
    tab: document.querySelector('#propTabs [data-prop-tab="mask"]')?.classList.contains('on'),
    contentTarget: document.querySelector('#layerList .lrow[data-layer-index="0"] .thumb')?.classList.contains('target'),
    maskTarget: document.querySelector('#layerList .lrow[data-layer-index="0"] .maskthumb')?.classList.contains('target'),
    maskOutline: getComputedStyle(document.querySelector('#layerList .lrow[data-layer-index="0"] .maskthumb')).outlineStyle,
  }));
  assert.deepEqual(targetState, { tab: true, contentTarget: false, maskTarget: true, maskOutline: 'solid' }, 'selected mask owns the property target and white outline');
  const editedContent = await page.evaluate(async () => {
    const { ensurePixelPaint } = await import('/editor/app/38-brush-engine.js');
    const { renderLayerPanel, thumbCache } = await import('/editor/app/23-layers-panel.js');
    const paint = ensurePixelPaint(1);
    for (let p = 0; p < paint.rgba.length; p += 4) paint.rgba.set([64, 128, 192, 128], p);
    delete thumbCache[1]; renderLayerPanel();
    return [...document.querySelector('#layerList .lrow[data-layer-index="1"] .thumb canvas').getContext('2d').getImageData(8, 8, 1, 1).data];
  });
  assert.equal(editedContent[3], 128, 'edited alpha must not revert to the original decoded plane');
  for (const [c, value] of [64, 128, 192].entries()) assert.ok(Math.abs(editedContent[c] - value) <= 1);
  await page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    const { applyEdits } = await import('/core/psd-edit.js');
    const bytes = applyEdits(built.buf, [{ op: 'addVectorMask', index: 0, units: 'pixel', subpaths: [{ closed: true, operation: 1, knots: [[0, 0], [32, 0], [32, 24], [0, 24]].map(anchor => ({ anchor, in: anchor, out: anchor })) }] }]).buffer;
    await window.__psd_editor.initDocument(bytes, 'vector-link-interaction.psd');
    window.__psd_editor.selectLayers([1]);
  });
  const vectorLink = page.locator('#layerList .lrow[data-layer-index="0"] .masklink[data-mask-kind="vector"]');
  await vectorLink.click();
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink[data-mask-kind="vector"]')?.getAttribute('aria-pressed') === 'false');
  assert.equal(await page.evaluate(async () => (await import('/editor/app/23-layers-panel.js')).selLayer), 0);
  const vectorSaved = await page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    const { parsePsdRaster } = await import('/core/psd-raster.js');
    return (await parsePsdRaster(built.buf)).layers[0].vectorMask.notLink;
  });
  assert.equal(vectorSaved, true, 'vector unlink writes its own flag, independently of pixel-mask linking');
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink[data-mask-kind="vector"]')?.getAttribute('aria-pressed') === 'true');
  await vectorLink.press('Enter');
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink[data-mask-kind="vector"]')?.getAttribute('aria-pressed') === 'false');
  await vectorLink.click();
  await page.waitForFunction(() => document.querySelector('.lrow[data-layer-index="0"] .masklink[data-mask-kind="vector"]')?.getAttribute('aria-pressed') === 'true');
  console.log('✓ pixel/vector chain buttons: real pointer clicks, Enter/Space, target layer, one-step Undo/Redo, fixed hit geometry and PSD persistence');
  console.log('✓ default-color mask pixels, actual mask targets, clipping-base underline and clip/content/link/mask DOM order');
  await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js'), { applyEdits } = await import('/core/psd-edit.js');
    const { parseLayerTree, writeLayerProperties } = await import('/core/psd-parse.js');
    let bytes = writePsd({ width: 32, height: 24, layers: [{ name: 'Base', bounds: { left: 0, top: 0, right: 32, bottom: 24 }, rgba: new Uint8Array(32 * 24 * 4).fill(255) }] });
    bytes = applyEdits(bytes, [{ op: 'addAdjustmentLayer', kind: 'invert', name: 'Clipped adjustment' },
      { op: 'addLayerMask', index: 1, fill: 'reveal', bounds: { left: 0, top: 0, right: 32, bottom: 24 } }, { op: 'setLayerProps', index: 1, clipping: true },
      { op: 'groupLayers', indices: [0, 1], name: 'Group' }]).buffer;
    const group = parseLayerTree(bytes).flat.find(l => l.groupType === 1);
    bytes = writeLayerProperties(bytes, [{ index: group.index, groupCollapsed: true }]);
    await window.__psd_editor.initDocument(bytes, 'group-spacing.psd'); window.__psd_editor.refreshAll(true);
  });
  const foldArrow = page.locator('#layerList .grouprow .fold-arrow');
  for (const expectedRows of [3, 1, 3]) {
    const hit = await foldArrow.evaluate(el => {
      const r = el.getBoundingClientRect(), x = r.left + 1, y = r.top + r.height / 2;
      return { x, y, inside: el.contains(document.elementFromPoint(x, y)) };
    });
    assert.ok(hit.inside, 'The left edge of the group arrow must remain visible and clickable in both states');
    await page.mouse.click(hit.x, hit.y);
    assert.equal(await page.locator('#layerList .lrow').count(), expectedRows);
  }
  const adjustmentGeometry = await page.locator('#layerList .lrow:has(.thumb.adj)').evaluate(row => {
    const origin = row.getBoundingClientRect().x;
    return Object.fromEntries(['clipmark', 'thumb', 'masklink', 'maskthumb', 'lname'].map(cls => {
      const r = row.querySelector('.' + cls).getBoundingClientRect(); return [cls, { x: r.x - origin, right: r.right - origin }];
    }));
  });
  assert.equal(adjustmentGeometry.clipmark.x, 51, 'Clipping marker keeps the parent indentation');
  assert.equal(adjustmentGeometry.thumb.x, 65, 'Clipped adjustment content is pulled toward the marker');
  assert.equal(adjustmentGeometry.masklink.x, adjustmentGeometry.thumb.right, 'Chain hit area does not overlap adjustment content');
  assert.equal(adjustmentGeometry.masklink.right, adjustmentGeometry.maskthumb.x, 'Chain hit area does not overlap the mask');
  assert.equal(adjustmentGeometry.maskthumb.x, 113);
  const adjustmentLink = page.locator('#layerList .lrow:has(.thumb.adj) .masklink');
  await adjustmentLink.click(); assert.equal(await adjustmentLink.getAttribute('aria-pressed'), 'false');
  await adjustmentLink.click(); assert.equal(await adjustmentLink.getAttribute('aria-pressed'), 'true');
  console.log('✓ group arrow edge clicks expand/collapse; clipped adjustment spacing preserves non-overlapping chain targets');
  assert.deepEqual(errors, []);
  console.log('✓ layer-type rows, thumbnails, mask thumbnails, selected row and property target stay synchronized across native samples');
} finally { await browser.close(); }
