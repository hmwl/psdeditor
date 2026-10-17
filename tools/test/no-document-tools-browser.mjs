
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('需要 Playwright，不能跳过此回归');
const browser = await PW.chromium.launch({
  executablePath: process.env.CHROMIUM || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.initDocument);
  const initial = await page.evaluate(async () => {
    const A = window.__psd_editor;
    const { tools } = await import('/editor/tools.js');
    const tested = [];
    if (A.state.doc) throw Error('fixture must start with no document');
    for (const group of tools.TOOL_GROUPS) for (const t of group.tools) {
      if (!t.impl) continue;
      if (!tools.select(t.id)) throw Error('cannot select ' + t.id);
      const expected = t.impl.slice('docTool:'.length);
      if (A.docTool !== expected) throw Error('tool reset: ' + t.id);
      const groups = [...document.querySelectorAll('.optbar .group')].filter(e => e.getClientRects().length);
      if (!groups.length) throw Error('no options: ' + t.id);
      
      A.down(20, 20); A.moveTo(30, 30); A.up();
      if (A.state.doc || A.crop.state || A.state.docUndo || A.state.brushUndo) throw Error('empty gesture mutated state: ' + t.id);
      tested.push(t.id);
    }
    tools.select('brush');
    return { tested, disabled: [...document.querySelectorAll('#toolbar .tool-btn')].filter(e => e.disabled).length };
  });
  assert.ok(initial.tested.length >= 60);
  assert.equal(initial.disabled, 0);

  
  await page.keyboard.press('h');
  assert.equal(await page.evaluate(() => window.__psd_editor.docTool), 'hand');
  await page.evaluate(async () => (await import('/editor/tools.js')).tools.select('crop'));
  assert.equal(await page.evaluate(() => window.__psd_editor.docTool), 'crop');
  assert.equal(await page.evaluate(() => window.__psd_editor.crop.state), null);
  await page.locator('#cropRatio').selectOption('ratio');
  await page.locator('#cropW').fill('4'); await page.locator('#cropW').dispatchEvent('change');
  await page.locator('#cropH').fill('3'); await page.locator('#cropH').dispatchEvent('change');
  assert.equal(await page.evaluate(() => window.__psd_editor.crop.state), null);
  assert.equal(await page.locator('#cropOk').isDisabled(), true);

  await page.evaluate(async () => (await import('/editor/tools.js')).tools.select('brush'));
  await page.locator('#brOpacity').fill('37'); await page.locator('#brOpacity').dispatchEvent('input');
  await page.locator('#brFlow').fill('61'); await page.locator('#brFlow').dispatchEvent('input');
  await page.evaluate(async () => (await import('/editor/tools.js')).tools.select('typeH'));
  await page.locator('#txSize').fill('43'); await page.locator('#txSize').dispatchEvent('change');
  await page.locator('#txColor').fill('#123456'); await page.locator('#txColor').dispatchEvent('change');
  await page.locator('#txAligns [data-align="center"]').click();
  await page.locator('#txOrient').click();
  assert.equal(await page.evaluate(() => window.__psd_editor.docTool), 'textVertical');
  await page.evaluate(async () => (await import('/editor/tools.js')).tools.select('colorSampler'));
  await page.getByLabel('取样大小：', { exact: true }).selectOption('11');
  await page.evaluate(async () => (await import('/editor/tools.js')).tools.select('note'));
  await page.getByLabel('作者：', { exact: true }).fill('Before document');
  await page.getByLabel('作者：', { exact: true }).dispatchEvent('change');
  await page.evaluate(async () => (await import('/editor/tools.js')).tools.select('count'));
  await page.getByLabel('计数组颜色', { exact: true }).fill('#2468ac');
  await page.getByLabel('计数组颜色', { exact: true }).dispatchEvent('change');
  await page.locator('#grpAuxTools label').filter({ hasText: '标记大小：' }).locator('input').fill('7');
  await page.locator('#grpAuxTools label').filter({ hasText: '标记大小：' }).locator('input').dispatchEvent('change');
  const opened = await page.evaluate(async () => {
    const A = window.__psd_editor, { tools } = await import('/editor/tools.js');
    const { brush, samplerOpts, noteOpts, countGroups } = await import('/editor/app/31-selection-brush.js');
    const { textToolOpts } = await import('/editor/app/09-text-tool.js');
    tools.select('brush');
    if (!await A.docSize.newDocument({ width: 64, height: 64, background: 'transparent', name: 'tool-defaults' })) throw Error('new document failed');
    const inherited = { tool: A.docTool, opacity: brush.opacity, flow: brush.flow, text: { ...textToolOpts }, sample: samplerOpts.size, author: noteOpts.author, crop: A.crop.opts, cropSession: A.crop.state };
    tools.select('count'); A.down(10, 10); A.up();
    const group = countGroups()[0];
    const count = group && { color: [group['Rd  '], group['Grn '], group['Bl  ']], radius: group['Rds '], points: group.countObjectList.length };
    tools.select('brush');
    A.closeDocument();
    return { inherited, count, closed: { doc: A.state.doc, tool: A.docTool, opacity: brush.opacity, flow: brush.flow, shown: !document.querySelector('#grpBrush').hidden } };
  });
  assert.equal(opened.inherited.tool, 'brush');
  assert.equal(opened.inherited.opacity, 0.37); assert.equal(opened.inherited.flow, 0.61);
  assert.deepEqual(opened.inherited.text, { sizePt: 43, color: '#123456', align: 'center', aa: 'antiAliasSharp' });
  assert.equal(opened.inherited.sample, 11); assert.equal(opened.inherited.author, 'Before document');
  assert.equal(opened.inherited.crop.w, '4'); assert.equal(opened.inherited.crop.h, '3'); assert.equal(opened.inherited.cropSession, null);
  assert.deepEqual(opened.count, { color: [36, 104, 172], radius: 7, points: 1 });
  assert.deepEqual(opened.closed, { doc: null, tool: 'brush', opacity: 0.37, flow: 0.61, shown: true });
  assert.deepEqual(errors, []);
  console.log(`✓ 无文档 ${initial.tested.length} 把工具可选、空画布无操作、默认参数可编辑、新建/关闭继承，页面异常 0`);
} finally { await browser.close(); }
