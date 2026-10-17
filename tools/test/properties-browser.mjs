import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('需要 Playwright，不能跳过属性回归');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM
  || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.initDocument);
  const result = await page.evaluate(async () => {
    const F = window.__psd_editor;
    const { writePsd } = await import('/core/psd-write.js');
    const { applyEdits } = await import('/core/psd-edit.js');
    const { getPropertyTransformValues } = await import('/editor/app/28-layer-props-transform.js');
    const layers = [{ name: '背景', bounds: { left: 0, top: 0, right: 200, bottom: 150 }, rgba: new Uint8Array(200 * 150 * 4).fill(255) },
      ...[[20, 30, 10, 10], [80, 50, 20, 20], [130, 90, 30, 20]].map(([x, y, w, h], i) => ({ name: 'P' + i,
        bounds: { left: x, top: y, right: x + w, bottom: y + h }, rgba: new Uint8Array(w * h * 4).fill(255) }))];
    let bytes = writePsd({ width: 200, height: 150, layers });
    bytes = applyEdits(bytes, [{ op: 'setLayerFlags', index: 0, lockTransparency: true }]).buffer;
    await F.initDocument(bytes, 'properties-parity.psd'); F.refreshAll(true); F.selectLayers([1]);
    const pixel = { kind: document.querySelector('#props').dataset.context,
      widthTag: document.querySelector('[data-transform="w"]').tagName,
      widthDisabled: document.querySelector('[data-transform="w"]').disabled };
    F.selectLayers([0]);
    const background = [...document.querySelectorAll('[data-transform]')].map(e => e.disabled);
    F.selectLayers([1, 2, 3]);
    const target = document.querySelector('[data-attr="prop-align-to"]'); target.value = 'canvas'; target.dispatchEvent(new Event('change'));
    const spacing = document.querySelector('[data-attr="prop-spacing-h"]');
    const spacingEnabled = !spacing.disabled; spacing.click();
    const spaced = [1, 2, 3].map(i => getPropertyTransformValues(i).x);
    const smart = applyEdits(bytes, [{ op: 'convertToSmartObject', index: 1,
      source: { width: 10, height: 10, data: new Uint8Array(400).fill(255) } }]).buffer;
    await F.initDocument(smart, 'smart-parity.psd'); F.refreshAll(true); F.selectLayers([1]);
    const smartFields = { title: document.querySelector('#propHeadTitle').textContent,
      widthTag: document.querySelector('[data-transform="w"]').tagName,
      align: !!document.querySelector('#props [data-section="align"]'),
      subject: !!document.querySelector('#props [data-attr="quick-subject"]'),
      quick: document.querySelector('#props [data-section="quick"]')?.textContent };
    return { pixel, background, spacingEnabled, spaced, smartFields };
  });
  assert.deepEqual(result.pixel, { kind: 'pixel', widthTag: 'INPUT', widthDisabled: false });
  assert.ok(result.background.every(Boolean)); assert.equal(result.spacingEnabled, true);
  assert.deepEqual(result.spaced, [20, 70, 130]);
  assert.equal(result.smartFields.title, '嵌入的智能对象'); assert.equal(result.smartFields.widthTag, 'OUTPUT');
  assert.equal(result.smartFields.align, false); assert.equal(result.smartFields.subject, false);
  assert.match(result.smartFields.quick, /编辑内容/); assert.deepEqual(errors, []);
  const resetFixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/smart-properties-native.json', import.meta.url), 'utf8'));
  const beforeBytes = inflateRawSync(Buffer.from(resetFixtures.cases.find(c => c.name.includes('300')).inputDeflateRawBase64, 'base64'));
  await page.evaluate(async bytes => {
    const F = window.__psd_editor;
    await F.initDocument(Uint8Array.from(bytes).buffer, 'reset-300.psd'); F.refreshAll(true); F.selectLayers([0]);
  }, [...beforeBytes]);
  await page.waitForFunction(() => document.querySelector('[data-attr="so-reset-transform"]')?.disabled === false);
  assert.equal(await page.locator('[data-transform="rot"]').inputValue(), '30');
  await page.locator('[data-transform="rot"]').fill('60'); await page.locator('[data-transform="rot"]').press('Tab');
  assert.equal(await page.locator('[data-transform="rot"]').inputValue(), '60');
  const rotatedAngle = await page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    const { smartObjectPropertyModel } = await import('/editor/smart-object-properties.js');
    const q = smartObjectPropertyModel(built.buf, 0).placed.desc.Trnf;
    return Math.atan2(q[3] - q[1], q[2] - q[0]) * 180 / Math.PI;
  });
  assert.ok(Math.abs(rotatedAngle - 60) < 1e-6, `Absolute smart angle persisted as ${rotatedAngle}`);
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForFunction(() => document.querySelector('[data-transform="rot"]')?.value === '30');
  assert.equal(await page.locator('#props summary button, #props summary input, #props summary select, #props summary a').count(), 0);
  await page.locator('.prop-section[data-section="transform"] > summary').press('Space');
  await page.waitForFunction(() => document.querySelector('.prop-section[data-section="transform"]')?.open === false);
  assert.equal(await page.locator('[data-attr="so-reset-transform"]').isVisible(), true);
  await page.locator('[data-attr="so-reset-transform"]').focus();
  await page.locator('[data-attr="so-reset-transform"]').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-transform="rot"]')?.value === '0'
    && document.querySelector('[data-transform="w"]')?.value === '100');
  const reset = await page.evaluate(async () => {
    const F = window.__psd_editor, built = await F.buildPsdBuffer({ fast: true });
    const { smartObjectPropertyModel } = await import('/editor/smart-object-properties.js');
    const { parsePsdRaster } = await import('/core/psd-raster.js');
    const m = smartObjectPropertyModel(built.buf, 0), doc = await parsePsdRaster(built.buf);
    return { quad: [...m.placed.desc.Trnf], warp: m.placed.desc.warp.warpStyle.value,
      warpBounds: m.placed.desc.warp.bounds, resolution: m.placed.desc.Rslt.value,
      bounds: doc.layers[0].bounds, width: doc.layers[0].width, height: doc.layers[0].height,
      firstPixel: [...doc.layers[0].rgba.slice(0, 4)] };
  });
  assert.deepEqual(reset.quad, [220, 150, 320, 150, 320, 230, 220, 230]);
  assert.equal(reset.warp, 'warpNone'); assert.equal(reset.resolution, 300);
  assert.deepEqual(reset.bounds, { left: 220, top: 150, right: 320, bottom: 230 });
  assert.equal(reset.width, 100); assert.equal(reset.height, 80);
  assert.deepEqual(reset.firstPixel, [240, 60, 70, 255]);
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForFunction(() => document.querySelector('[data-transform="rot"]')?.value === '30');
  await page.evaluate(() => window.__psd_editor.actions.run('edit.redo'));
  await page.waitForFunction(() => document.querySelector('[data-transform="rot"]')?.value === '0');
  await page.evaluate(async () => {
    const F = window.__psd_editor, { writePsd } = await import('/core/psd-write.js'), { applyEdits } = await import('/core/psd-edit.js');
    let bytes = writePsd({ width: 200, height: 150, layers: [{ name: 'Base', bounds: { left: 0, top: 0, right: 200, bottom: 150 }, rgba: new Uint8Array(200 * 150 * 4).fill(255) }] });
    const r = applyEdits(bytes, [{ op: 'addFrameLayer', at: 1, name: 'Native frame', rect: { x: 20, y: 30, w: 80, h: 60 } }]);
    await F.initDocument(r.buffer, 'native-frame.psd'); F.refreshAll(true); F.selectLayers([r.results[0].headerIndex]);
  });
  await page.waitForFunction(() => document.querySelector('#props')?.dataset.context === 'frame');
  const frame = await page.evaluate(() => ({ title: document.querySelector('#propHeadTitle').textContent,
    maskTabHidden: document.querySelector('#propTabs [data-prop-tab="mask"]').hidden,
    width: document.querySelector('[data-attr="frame-w"]').value }));
  assert.deepEqual(frame, { title: '图框', maskTabHidden: true, width: '80' });
  await page.locator('[data-attr="frame-w"]').fill('100'); await page.locator('[data-attr="frame-w"]').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('[data-attr="frame-w"]')?.value === '100');
  const frameRect = await page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    const { parsePsdFull } = await import('/core/psd-parse.js');
    return parsePsdFull(built.buf).layers.find(l => l.frame).frame.rect;
  });
  assert.deepEqual(frameRect, { x: 20, y: 30, w: 100, h: 60 });
  assert.equal(await page.locator('[data-attr="frame-stroke-width"]').isEnabled(), false);
  await page.locator('[data-attr="frame-stroke-enabled"]').check();
  await page.waitForFunction(() => document.querySelector('.pp-frame-stroke')?.disabled === false
    && document.querySelector('[data-attr="frame-stroke-enabled"]')?.checked === true);
  await page.locator('[data-attr="frame-stroke-width"]').fill('5');
  await page.locator('[data-attr="frame-stroke-width"]').press('Tab');
  await page.waitForFunction(() => document.querySelector('.pp-frame-stroke')?.disabled === false
    && document.querySelector('[data-attr="frame-stroke-width"]')?.value === '5');
  await page.locator('[data-attr="frame-stroke-color"]').evaluate(el => {
    el.value = '#336699'; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('.pp-frame-stroke')?.disabled === false
    && document.querySelector('[data-attr="frame-stroke-color"]')?.value === '#336699');
  await page.locator('[data-attr="frame-stroke-align"]').selectOption('outside');
  await page.waitForFunction(() => document.querySelector('.pp-frame-stroke')?.disabled === false
    && document.querySelector('[data-attr="frame-stroke-align"]')?.value === 'outside');
  const frameStroke = () => page.evaluate(async () => {
    const built = await window.__psd_editor.buildPsdBuffer({ fast: true });
    const { parsePsdFull } = await import('/core/psd-parse.js'), { getVectorStroke } = await import('/core/psd-edit-path.js');
    const index = parsePsdFull(built.buf).layers.findIndex(l => l.frame), s = getVectorStroke(built.buf, index);
    return { enabled: s.enabled, width: s.width, color: s.color, align: s.align };
  });
  const strokeExpected = { enabled: true, width: 5, color: [51, 102, 153], align: 'outside' };
  assert.deepEqual(await frameStroke(), strokeExpected);
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForFunction(() => document.querySelector('[data-attr="frame-stroke-align"]')?.value === 'center');
  assert.deepEqual(await frameStroke(), { ...strokeExpected, align: 'center' });
  await page.evaluate(() => window.__psd_editor.actions.run('edit.redo'));
  await page.waitForFunction(() => document.querySelector('[data-attr="frame-stroke-align"]')?.value === 'outside');
  assert.deepEqual(await frameStroke(), strokeExpected);
  await page.locator('[data-attr="frame-stroke-enabled"]').uncheck();
  await page.waitForFunction(() => document.querySelector('.pp-frame-stroke')?.disabled === false
    && document.querySelector('[data-attr="frame-stroke-enabled"]')?.checked === false);
  assert.deepEqual(await frameStroke(), { ...strokeExpected, enabled: false });
  assert.equal(await page.locator('[data-attr="frame-stroke-width"]').isEnabled(), false);
  const compInput = inflateRawSync(Buffer.from(resetFixtures.compInput.deflateRawBase64, 'base64'));
  await page.evaluate(async bytes => {
    const F = window.__psd_editor; await F.initDocument(Uint8Array.from(bytes).buffer, 'comp-probe.psd'); F.refreshAll(true); F.selectLayers([0]);
  }, [...compInput]);
  await page.waitForFunction(() => document.querySelector('[data-attr="so-layer-comp"]')?.disabled === false);
  const compSnapshot = () => page.evaluate(async () => {
    const F = window.__psd_editor, built = await F.buildPsdBuffer({ fast: true });
    const { smartObjectPropertyModel } = await import('/editor/smart-object-properties.js');
    const m = smartObjectPropertyModel(built.buf, 0);
    const digest = await crypto.subtle.digest('SHA-256', m.source.bytes);
    return { id: m.compId, original: m.placed.desc.compInfo.originalCompID,
      marker: m.placed.desc.compInfo.compID, firstPixel: [...F.state.doc.layers[0].rgba.slice(0, 4)],
      sourceHash: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') };
  });
  const compBefore = await compSnapshot();
  await page.locator('[data-attr="so-layer-comp"]').selectOption('101');
  await page.waitForFunction(() => document.querySelector('[data-attr="so-layer-comp"]')?.value === '101'
    && document.querySelector('[data-attr="so-layer-comp"]')?.disabled === false);
  const compRed = await compSnapshot();
  assert.equal(compRed.id, 101); assert.equal(compRed.marker, -1);
  assert.deepEqual(compRed.firstPixel, [230, 40, 40, 255]);
  assert.equal(compRed.sourceHash, compBefore.sourceHash); assert.equal(compRed.original, 101);
  await page.evaluate(() => window.__psd_editor.actions.run('edit.undo'));
  await page.waitForFunction(() => document.querySelector('[data-attr="so-layer-comp"]')?.value === '-1');
  assert.deepEqual((await compSnapshot()).firstPixel, [40, 210, 80, 255]);
  await page.evaluate(() => window.__psd_editor.actions.run('edit.redo'));
  await page.waitForFunction(() => document.querySelector('[data-attr="so-layer-comp"]')?.value === '101');
  await page.locator('[data-attr="so-layer-comp"]').selectOption('202');
  await page.waitForFunction(() => document.querySelector('[data-attr="so-layer-comp"]')?.value === '202'
    && document.querySelector('[data-attr="so-layer-comp"]')?.disabled === false);
  assert.deepEqual((await compSnapshot()).firstPixel, [40, 210, 80, 255]);
  await page.locator('[data-attr="so-layer-comp"]').selectOption('-1');
  await page.waitForFunction(() => document.querySelector('[data-attr="so-layer-comp"]')?.value === '-1'
    && document.querySelector('[data-attr="so-layer-comp"]')?.disabled === false);
  const compSaved = await compSnapshot();
  assert.equal(compSaved.sourceHash, compBefore.sourceHash); assert.equal(compSaved.original, 202);
  await page.evaluate(async () => {
    const F = window.__psd_editor, { applyEdits } = await import('/core/psd-edit.js');
    const built = await F.buildPsdBuffer({ fast: true });
    const grouped = applyEdits(built.buf, [{ op: 'newGroup', at: 1, name: '普通组' }]);
    await F.initDocument(grouped.buffer, 'group-probe.psd'); F.refreshAll(true); F.selectLayers([grouped.results[0].headerIndex]);
  });
  const group = await page.evaluate(() => ({ kind: document.querySelector('#props').dataset.context,
    title: document.querySelector('#propHeadTitle').textContent,
    empty: !!document.querySelector('#props .prop-no-properties'),
    transform: !!document.querySelector('#props [data-section="transform"]'),
    align: !!document.querySelector('#props [data-section="align"]') }));
  assert.deepEqual(group, { kind: 'group', title: '', empty: true, transform: false, align: false });
  assert.deepEqual(errors, []);
  console.log('✓ 属性分型、背景锁定、均匀间距真实几何、嵌入智能对象只读尺寸/快速操作，页面异常0');
  console.log('✓ 300ppi智能对象原生复位策略、SoLd/warp及栅格保存闭环、撤销/重做');
  console.log('✓ 原生画框属性分型/内部蒙版隐藏/边框改宽frgb写回');
  console.log('✓ 图框描边启用/宽度5/颜色/对齐vstk导出，Undo/Redo与停用保护');
  console.log('✓ 智能对象图层复合红/绿/保存态切换与SoLd/缓存导出、Undo/Redo、源字节及originalCompID保护');
  console.log('✓ 原生普通组无属性，无多余标题/变换/对齐');
} finally { await browser.close(); }
