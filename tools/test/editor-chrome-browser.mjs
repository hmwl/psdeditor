import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required for editor chrome/context-menu regression');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8788}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.initDocument);
  const policy = await page.evaluate(async () => {
    const host = document.createElement('section'); host.id = 'policy-regression';
    host.innerHTML = '<input id="policy-input"><textarea id="policy-textarea"></textarea><div id="policy-editable" contenteditable="true">Editable</div><div id="policy-blank" tabindex="0">Blank</div>';
    document.body.append(host);
    let targetCalls = 0, bubbleCalls = 0;
    host.addEventListener('contextmenu', () => targetCalls++);
    const bubble = event => { if (host.contains(event.target)) bubbleCalls++; };
    document.addEventListener('contextmenu', bubble);
    const probe = target => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      return { accepted: target.dispatchEvent(event), prevented: event.defaultPrevented };
    };
    const initial = ['#viewport', '#panelLayers', '#docTabs', '#toolbar', '#gizmo', '#policy-input', '#policy-textarea', '#policy-editable', '#policy-blank'].map(selector => ({ selector, ...probe(document.querySelector(selector)) }));
    const dialog = document.createElement('dialog'); dialog.innerHTML = '<input id="policy-dialog-input"><button>Action</button>'; document.body.append(dialog); dialog.showModal();
    const popup = probe(dialog.querySelector('input')); dialog.close(); dialog.remove();
    const menu = document.createElement('div'); menu.className = 'menu-pop'; menu.textContent = 'Dynamic popup'; host.append(menu); const dynamic = probe(menu); menu.remove();
    const frame = document.createElement('iframe'); frame.id = 'policy-frame'; frame.srcdoc = '<input id="inside"><div id="inside-target" tabindex="0">Inner custom menu</div>';
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true })); host.append(frame); await loaded;
    let innerCalls = 0; frame.contentDocument.addEventListener('contextmenu', () => innerCalls++);
    const iframe = probe(frame.contentDocument.querySelector('input'));
    const innerKey = new frame.contentWindow.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true });
    frame.contentDocument.querySelector('#inside-target').dispatchEvent(innerKey);
    const nested = frame.contentDocument.createElement('iframe'); nested.srcdoc = '<textarea id="nested-input"></textarea>';
    const nestedLoaded = new Promise(resolve => nested.addEventListener('load', resolve, { once: true })); frame.contentDocument.body.append(nested); await nestedLoaded;
    const nestedResult = probe(nested.contentDocument.querySelector('textarea'));
    const reloaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true })); frame.srcdoc = '<input id="reloaded-input">'; await reloaded;
    const afterNavigation = probe(frame.contentDocument.querySelector('input'));
    document.removeEventListener('contextmenu', bubble);
    window.__policyKeyboard = [];
    document.querySelector('#policy-blank').addEventListener('keydown', event => { if (event.key === 'ContextMenu' || event.key === 'F10') window.__policyKeyboard.push({ key: event.key, shift: event.shiftKey, prevented: event.defaultPrevented }); });
    window.__policyMenus = 0; document.querySelector('#policy-blank').addEventListener('contextmenu', () => window.__policyMenus++);
    return { initial, popup, dynamic, iframe, nested: nestedResult, afterNavigation, innerKey: innerKey.defaultPrevented, innerCalls, targetCalls, bubbleCalls };
  });
  for (const result of [...policy.initial, policy.popup, policy.dynamic, policy.iframe, policy.nested, policy.afterNavigation]) { assert.equal(result.accepted, false); assert.equal(result.prevented, true); }
  assert.equal(policy.innerKey, true); assert.equal(policy.innerCalls, 2);
  assert.equal(policy.targetCalls, 5); assert.equal(policy.bubbleCalls, 5);
  await page.locator('#policy-blank').focus(); await page.keyboard.press('ContextMenu'); await page.keyboard.press('Shift+F10');
  const keyboard = await page.evaluate(() => ({ keys: window.__policyKeyboard, menus: window.__policyMenus }));
  assert.equal(keyboard.menus, 2); assert.deepEqual(keyboard.keys.map(k => k.prevented), [true, true]);
  console.log('✓ browser menus prevented on blank/panel/input/editable/dialog/dynamic popup and same-origin iframe navigation; target/bubble listeners still run');

  await page.evaluate(async () => {
    document.querySelector('#policy-regression').remove();
    const { writePsd } = await import('/core/psd-write.js');
    const { applyEdits } = await import('/core/psd-edit.js');
    const rgba = new Uint8Array(80 * 60 * 4).fill(255), source = new Uint8Array(20 * 20 * 4).fill(255);
    const bytes = writePsd({ width: 80, height: 60, layers: [
      { name: 'Background', bounds: { left: 0, top: 0, right: 80, bottom: 60 }, rgba },
      { name: 'Design', bounds: { left: 15, top: 20, right: 35, bottom: 40 }, rgba: source },
    ], composite: rgba });
    const result = applyEdits(bytes, [{ op: 'convertToSmartObject', index: 1, source: { data: source, width: 20, height: 20 } }]);
    await window.__psd_editor.initDocument(result.buffer, 'smart-chrome.psd'); window.__psd_editor.refreshAll(true); window.__psd_editor.selectLayers([1]);
  });
  await page.locator('.lrow[data-layer-index="1"]').click({ button: 'right' });
  await page.waitForFunction(() => !!document.querySelector('.menu-pop') || document.querySelector('#layerCtx')?.hidden === false);
  assert.ok(await page.locator('.menu-pop, #layerCtx:not([hidden])').count() > 0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const row = document.querySelector('.lrow[data-layer-index="1"]'); row.tabIndex = 0; row.focus(); });
  await page.keyboard.press('Shift+F10');
  await page.waitForFunction(() => !!document.querySelector('.menu-pop') || document.querySelector('#layerCtx')?.hidden === false);
  await page.keyboard.press('Escape');
  console.log('✓ existing application layer menus still open by right click and Shift+F10');
  const tabs = await page.evaluate(async () => {
    const F = window.__psd_editor, { buildTabs } = await import('/editor/app/21-load-document.js');
    const check = () => ({ forbidden: document.querySelectorAll('#docTabs button:not(.doctab-close), #docTabs select, #tabs').length,
      text: document.querySelector('#docTabs').textContent, documentTabs: document.querySelectorAll('#docTabs .doctab').length });
    buildTabs(); const loaded = check();
    await F.selectSO(0); buildTabs(); const transforming = check(); const selected = F.state.cur; await F.exitSO();
    await F.openInside(0); buildTabs(); const inside = { ...check(), depth: F.state.docStack.length }; await F.exitInside({ save: false });
    return { loaded, transforming, selected, inside, returned: F.state.docStack.length };
  });
  for (const phase of [tabs.loaded, tabs.transforming, tabs.inside]) { assert.equal(phase.forbidden, 0); assert.ok(phase.documentTabs >= 1); assert.doesNotMatch(phase.text, /退出变形|返回上级|选择智能对象/); }
  assert.equal(tabs.selected, 0); assert.equal(tabs.inside.depth, 1); assert.equal(tabs.returned, 0);
  assert.deepEqual(errors, []);
  console.log('✓ smart-object load/transform/inside editing preserve document tabs and workflow without auxiliary selectors or exit buttons');
} finally { await browser.close(); }
