import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('预设库回归需要 Playwright');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8789}/editor`);
  await page.waitForFunction(() => window.__psd_editorPresets?.lib.ready && window.__psd_editorBrushes?.brushLib.ready);
  const first = await page.evaluate(async () => {
    const s = await import('/editor/preset-store.js'), p = await import('/editor/photoshop-presets.js');
    const m = await p.photoshopPresetManifest(), counts = {}, decoded = [];
    for (const k of ['brushes', 'swatches', 'shapes', 'gradients', 'toolPresets']) counts[k] = (await s.listPresets(k)).filter(x => x.sourcePack).length;
    for (const pack of m.packs) {
      const bytes = new Uint8Array(await (await fetch(pack.url)).arrayBuffer());
      const r = await p.decodePhotoshopPresetPack(pack, bytes), main = { items: r.batches.filter(b => b.kind === pack.kind).flatMap(b => b.items) };
      decoded.push({ id: pack.id, count: main.items.length, invalidNames: main.items.some(x => x.name.startsWith('$$$/')), warnings: r.warnings });
    }
    const brushes = await s.listPresets('brushes'), sampled = brushes.find(x => x.sample);
    const key = window.__psd_editorBrushes.brushLib.ensureSample(sampled.sample);
    const { hasSampledTip } = await import('/core/brush-engine.js');
    const brushPatterns = await s.listPresets('patterns');
    const dependencies = brushes.filter(x => x.dyn?.texture?.on).every(x => brushPatterns.some(y => y.id === x.dyn.texture.pattern));
    const swatches = await s.listPresets('swatches'), red = swatches.find(x => x.sourcePack === 'default-swatches' && x.name === 'RGB Red');
    const pack = m.packs.find(x => x.id === 'legacy-swatches');
    const load = await p.loadPhotoshopPresetPack(pack), duplicate = await p.loadPhotoshopPresetPack(pack, { restore: true });
    const source = (await s.listPresets('swatches')).filter(x => x.sourcePack === pack.id);
    await s.renamePreset('swatches', source[0].id, '我的保留色板');
    await s.removePreset('swatches', source[1].id);
    window.__psPresetTestIds = { keep: source[0].id, deleted: source[1].id };
    return { counts, decoded, sampleReady: hasSampledTip(key), dependencies, red: red?.color, redModel: red?.model, load: load.added, duplicate: duplicate.added, keep: source[0].id, deleted: source[1].id };
  });
  assert.deepEqual(first.counts, { brushes: 28, swatches: 122, shapes: 54, gradients: 183, toolPresets: 0 });
  assert.equal(first.decoded.length, 54);
  for (const pack of first.decoded) { assert.ok(pack.count > 0 || /tool-presets|tools-/.test(pack.id), pack.id); assert.equal(pack.invalidNames, false, pack.id); }
  assert.equal(first.sampleReady, true); assert.equal(first.dependencies, true);
  assert.deepEqual(first.red, [255, 0, 0]); assert.equal(first.redModel, 'xyz');
  assert.equal(first.load, 1652); assert.equal(first.duplicate, 0);
  console.log('✓ 54 个原生包客户端解析，默认画笔/色板/形状/渐变、未映射工具拒绝、取样笔尖与纹理依赖');
  const large = await page.evaluate(async () => {
    const s = await import('/editor/preset-store.js'), p = await import('/editor/photoshop-presets.js');
    const m = await p.photoshopPresetManifest();
    for (const id of ['preset-brushes-legacy-brushes', 'preset-brushes-converted-legacy-tool-presets']) await p.loadPhotoshopPresetPack(m.packs.find(x => x.id === id));
    const items = await s.listPresets('brushes'), groups = await s.listGroups('brushes');
    const group = groups.find(x => x.builtinPack === 'preset-brushes-legacy-brushes');
    const initiallyFolded = group.collapsed;
    await s.updateGroup('brushes', group.id, { collapsed: false });
    return { count: items.length, approximate: items.filter(x => x.approx).length, initiallyFolded, group: group.id };
  });
  assert.equal(large.count, 643); assert.equal(large.approximate, 135); assert.equal(large.initiallyFolded, true);
  await page.waitForFunction(() => window.__psd_editorBrushes.brushLib.items.length === 643);
  console.log('✓ 643画笔实际安装与135近似标记、大库折叠设置');
  const used = await page.evaluate(async () => {
    const F = window.__psd_editor, P = window.__psd_editorPresets, s = await import('/editor/preset-store.js'), p = await import('/editor/photoshop-presets.js');
    const m = await p.photoshopPresetManifest();
    await p.loadPhotoshopPresetPack(m.packs.find(x => x.id === 'default-styles'));
    await P.reload('patterns'); await P.reload('styles');
    const { writePsd } = await import('/core/psd-write.js');
    const { parsePsdRaster } = await import('/core/psd-raster.js');
    const rgba = new Uint8Array(64 * 64 * 4).fill(255);
    await F.initDocument(writePsd({ width: 64, height: 64, layers: [{ name: 'Preset canvas', bounds: { left: 0, top: 0, right: 64, bottom: 64 }, rgba }], composite: rgba }).buffer, 'preset-test.psd', { nested: false });
    F.selectLayers([0]);
    const brush = (await s.listPresets('brushes')).find(x => x.sample && !x.dyn.texture.on);
    F.brushEngine.applyRecord(brush, brush.id); F.brushEngine.brush.size = 16;
    F.paint.setColors([0, 0, 0]); F.paint.stroke([{ x: 12, y: 32 }, { x: 50, y: 32 }], { tool: 'brush', noSel: true });
    const brushed = await parsePsdRaster((await F.buildPsdBuffer({ fast: false })).buf);
    const painted = brushed.layers[0].rgba.some((v, i) => i % 4 < 3 && v < 250);
    const style = (await s.listPresets('styles')).find(x => x.sourcePack === 'default-styles' && x.patternIds.length);
    await P.applyStyle(style);
    const doc = await parsePsdRaster((await F.buildPsdBuffer({ fast: false })).buf);
    return { painted, patternIds: style.patternIds, exportedPatterns: (doc.patterns || []).map(x => x.id), effects: !!doc.layers[0].effects };
  });
  assert.equal(used.painted, true); assert.equal(used.effects, true);
  for (const id of used.patternIds) assert.ok(used.exportedPatterns.includes(id));
  console.log('✓ 原生取样画笔实际笔画写回、样式应用及纹理依赖写入导出PSD');
  await page.reload();
  await page.waitForFunction(() => window.__psd_editorPresets?.lib.ready);
  const after = await page.evaluate(async ids => {
    const s = await import('/editor/preset-store.js'), p = await import('/editor/photoshop-presets.js');
    const before = { keep: (await s.getPreset('swatches', ids.keep)).name, deleted: await s.getPreset('swatches', ids.deleted) };
    const manifest = await p.photoshopPresetManifest();
    const pack = manifest.packs.find(x => x.id === 'legacy-swatches');
    const result = await p.loadPhotoshopPresetPack(pack, { restore: true });
    await window.__psd_editorPresets.openPhotoshopPresets('swatches');
    return { before, added: result.added, keep: (await s.getPreset('swatches', ids.keep)).name, deletedRestored: !!await s.getPreset('swatches', ids.deleted) };
  }, { keep: first.keep, deleted: first.deleted });
  assert.equal(after.before.keep, '我的保留色板'); assert.equal(after.before.deleted, null);
  assert.equal(after.added, 1); assert.equal(after.keep, '我的保留色板'); assert.equal(after.deletedRestored, true);
  assert.equal(await page.evaluate(async id => (await (await import('/editor/preset-store.js')).listGroups('brushes')).find(g => g.id === id).collapsed, large.group), false);
  await page.waitForSelector('dialog.ps-preset-library [data-pack="legacy-swatches"]');
  await page.locator('dialog.ps-preset-library input[type="search"]').fill('ANPA');
  await page.waitForFunction(() => document.querySelectorAll('dialog.ps-preset-library [data-pack]').length === 2);
  assert.deepEqual((await page.locator('dialog.ps-preset-library [data-pack]').evaluateAll(rows => rows.map(x => x.dataset.pack))).sort(), ['legacy-swatches', 'preset-color-swatches-anpa-colors']);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  console.log('✓ 搜索原生库、重复导入去重、跨刷新保留改名/删除与按需补回');
} finally { await browser.close(); }
