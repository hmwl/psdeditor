import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const pw = await loadPlaywright();
assert.ok(pw, 'Layer header browser check requires Playwright');
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined), args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: process.env.HEADER_SLIDER_SCREENSHOT ? 2 : 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || process.env.PORT || 8792}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.initDocument);
  await page.evaluate(async () => {
    const { writePsd } = await import('/core/psd-write.js');
    const { applyEdits } = await import('/core/psd-edit.js');
    const rgba = new Uint8Array(16 * 16 * 4).fill(255), bounds = { left: 0, top: 0, right: 16, bottom: 16 };
    let bytes = writePsd({ width: 16, height: 16, layers: [{ name: 'Pixel', bounds, rgba }, { name: 'Smart', bounds, rgba }] });
    bytes = applyEdits(bytes, [{ op: 'convertToSmartObject', index: 1, source: { width: 16, height: 16, data: rgba } }]).buffer;
    await window.__psd_editor.initDocument(bytes, 'layer-header.psd');
    window.__psd_editor.refreshAll(true); window.__psd_editor.selectLayers([0]);
  });
  assert.equal(await page.locator('.lpf-kind-field .lpf-search img').count(), 1);
  assert.equal(await page.locator('#panelLayers .layer-foot .lf-btn').count(), 6);
  assert.equal(await page.locator('#panelLayers .layer-foot #newAdjSel').count(), 1);
  const footerSize = await page.evaluate(() => {
    const e = document.querySelector('#panelLayers .layer-foot');
    return { h: e.getBoundingClientRect().height,
      buttons: [...e.querySelectorAll('.lf-btn')].map(b => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]) };
  });
  assert.ok(footerSize.h >= 24 && footerSize.h <= 30, `Layer footer height drifted: ${JSON.stringify(footerSize)}`);
  assert.ok(footerSize.buttons.every(([w, h]) => w === 24 && h === 20), `Layer footer button geometry drifted: ${JSON.stringify(footerSize)}`);
  const footerIcons = await page.locator('#panelLayers .layer-foot .lf-btn').evaluateAll(buttons => buttons.map(b => {
    const r = b.querySelector('.ps-icon').getBoundingClientRect(); return { action: b.dataset.action, width: r.width, height: r.height };
  }));
  for (const icon of footerIcons) {
    const size = icon.action === 'layer.delete' ? 12 : 13;
    assert.equal(icon.width, size, icon.action); assert.equal(icon.height, size, icon.action);
  }
  assert.equal(await page.locator('.panel-group[data-group="props"] .pg-tabs > button[data-panel]').count(), 2);
  assert.equal(await page.locator('.lpf-ctl [data-kind] img').count(), 5);
  assert.equal(await page.locator('.lc-percent-field #hdrOpacity').count(), 1);
  assert.equal(await page.locator('.lc-percent-field #hdrFill').count(), 1);
  assert.equal(await page.locator('#hdrOpacity').inputValue(), '100');
  const widths = await page.evaluate(() => [...document.querySelectorAll('.lc-percent-field')].map(f => ({ field: f.clientWidth, input: f.querySelector('input').scrollWidth, visible: f.querySelector('input').clientWidth })));
  assert.ok(widths.every(x => x.input <= x.visible + 1), `Percent input clips its value: ${JSON.stringify(widths)}`);
  const inside = await page.evaluate(() => [...document.querySelectorAll('.lc-percent-field')].every(field => {
    const f = field.getBoundingClientRect(), p = field.querySelector('.lc-pct').getBoundingClientRect();
    return p.left > f.left && p.right < f.right;
  }));
  assert.ok(inside, 'Both percent units are inside the input border');
  assert.equal(await page.locator('.lc-percent-field .scrub-grip').count(), 0, 'A second scrub handle must not displace the arrow');
  const arrows = await page.locator('.lc-percent-field .lp-drop').evaluateAll(buttons => buttons.map(button => {
    const b = button.getBoundingClientRect(), f = button.parentElement.getBoundingClientRect();
    return { inside: b.left >= f.left && b.right <= f.right, width: b.width };
  }));
  assert.ok(arrows.every(b => b.inside && b.width >= 12), `Dropdown arrows clipped: ${JSON.stringify(arrows)}`);
  await page.locator('.lpf-btn[data-kind="smart"]').click();
  assert.equal(await page.locator('#layerList .lrow').count(), 1);
  assert.equal(await page.locator('.lpf-btn[data-kind="smart"]').getAttribute('aria-pressed'), 'true');
  await page.locator('.lpf-toggle').click();
  assert.equal(await page.locator('.lpf-toggle').getAttribute('aria-checked'), 'false');
  assert.equal(await page.locator('#layerList .lrow').count(), 2);
  await page.locator('.lpf-toggle').click();
  await page.locator('.lpf-kind').selectOption('name');
  await page.locator('.lpf-name').fill('Pixel');
  assert.equal(await page.locator('#layerList .lrow').count(), 1);
  await page.locator('.lpf-name').fill('');
  await page.locator('#hdrOpacity').fill('53'); await page.locator('#hdrOpacity').dispatchEvent('change');
  assert.equal(await page.locator('#hdrOpacity').inputValue(), '53');
  await page.locator('#hdrFill').fill('61'); await page.locator('#hdrFill').dispatchEvent('change');
  assert.equal(await page.locator('#hdrFill').inputValue(), '61');
  const label = await page.locator('#panelLayers .lp-scrub').first().boundingBox();
  await page.mouse.move(label.x + 10, label.y + 8); await page.mouse.down();
  await page.mouse.move(label.x + 20, label.y + 8); await page.mouse.up();
  assert.equal(await page.locator('#hdrOpacity').inputValue(), '58', 'Scrub handler survives the input wrapper');
  await page.locator('.lc-percent-field:has(#hdrFill) .lp-drop').click();
  const slider = page.getByRole('slider', { name: '填充滑块' });
  const popup = await page.locator('.lp-slider-pop').boundingBox();
  assert.equal(popup.width, 119); assert.equal(popup.height, 26);
  const track = await slider.boundingBox();
  await page.mouse.move(track.x + track.width * .6, track.y + track.height / 2); await page.mouse.down();
  await page.mouse.move(track.x + track.width * .4, track.y + track.height / 2, { steps: 5 }); await page.mouse.up();
  const fillAfterDrag = +(await page.locator('#hdrFill').inputValue());
  assert.ok(fillAfterDrag >= 35 && fillAfterDrag <= 45, `Actual slider drag did not update fill: ${fillAfterDrag}`);
  await slider.press('Escape');
  assert.equal(await page.locator('.lp-slider-pop').count(), 0);
  const fillArrow = page.locator('.lc-percent-field:has(#hdrFill) .lp-drop');
  await fillArrow.click(); await fillArrow.click();
  assert.equal(await page.locator('.lp-slider-pop').count(), 0, 'Clicking the same arrow closes its popup');
  assert.equal(await fillArrow.getAttribute('aria-expanded'), 'false');
  await page.locator('#hdrOpacity').fill('76');
  await page.evaluate(async () => (await import('/editor/app/28-layer-props-transform.js')).syncLayerControls());
  assert.equal(await page.locator('#hdrOpacity').inputValue(), '76', 'Preview refresh must not overwrite an in-progress edit');
  await page.locator('#hdrOpacity').press('Tab');
  assert.equal(await page.locator('#hdrOpacity').inputValue(), '76');
  assert.equal(await page.evaluate(() => window.__psd_editor.state.doc.layers[0].opacity), Math.round(76 * 2.55), 'Typed opacity must reach the layer, not only its input');
  if (process.env.HEADER_SLIDER_SCREENSHOT) {
    await page.locator('.lc-percent-field:has(#hdrOpacity) .lp-drop').click();
    await page.mouse.move(20, 20);
    const pop = await page.locator('.lp-slider-pop').boundingBox();
    await page.screenshot({ path: process.env.HEADER_SLIDER_SCREENSHOT, clip: { x: pop.x - 9, y: pop.y - 33, width: 154, height: 68 } });
    await page.locator('.pg-tabs').first().click();
  }
  await page.locator('.lpf-kind').selectOption('kind');
  await page.locator('.lpf-btn[data-kind="smart"]').click();
  if (process.env.HEADER_SCREENSHOT) await page.locator('#panelLayers').screenshot({ path: process.env.HEADER_SCREENSHOT });
  assert.deepEqual(errors, []);
  console.log('✓ 图层header：原稿图标、搜索内嵌、筛选类型/开关、百分比输入、擦洗及弹出滑块');
} finally { await browser.close(); }
