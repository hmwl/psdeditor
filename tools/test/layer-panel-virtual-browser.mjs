import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docSize);
  const out = await page.evaluate(async () => {
    await window.__psd_editor.docSize.newDocument({ width: 64, height: 64, background: 'transparent', name: 'layer-virtual' });
    const S = await import('/editor/app/02-doc-state.js');
    const P = await import('/editor/app/23-layers-panel.js');
    const baseDoc = S.doc.layers[0], baseNode = S.layerTree.flat[0];
    const n = 1200;
    S.set_doc({ ...S.doc, layers: Array.from({ length: n }, (_, i) => ({ ...baseDoc, name: `Layer ${i}`, rgba: null, width: 0, height: 0, bounds: { left: 0, top: 0, right: 0, bottom: 0 } })) });
    S.set_layerTree({ flat: Array.from({ length: n }, (_, i) => ({ ...baseNode, index: i, name: `Layer ${i}`, group: false, groupType: null })) });
    P.set_selLayer(0);
    P.renderLayerPanel();
    const list = document.querySelector('#layerList');
    const snap = () => ({ rows: list.querySelectorAll('.lrow').length, spacer: !!list.querySelector('.layer-virtual-spacer'), first: list.querySelector('.lrow')?.dataset.layerIndex || null });
    const before = snap();
    const totalBefore = list.scrollHeight;
    list.scrollTop = 20000; list.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 80));
    const after = snap(), totalMiddle = list.scrollHeight;
    const same = list.querySelector('.lrow');
    list.dispatchEvent(new Event('scroll')); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const reused = same === list.querySelector('.lrow');
    list.scrollTop = list.scrollHeight; list.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 50));
    const bottom = snap(), totalBottom = list.scrollHeight;
    const last = list.querySelector('.lrow:last-of-type')?.dataset.layerIndex;
    window.__psd_editor.actions.run('layer.selectTop');
    const topSelected = P.selLayer, topMounted = !!P.rowEls[1199];
    window.__psd_editor.actions.run('layer.selectBottom');
    const bottomSelected = P.selLayer, bottomMounted = !!P.rowEls[0];
    
    P.set_selLayer(800); window.__psd_editor.actions.run('layer.rename');
    const editing = document.activeElement;
    const renamed = editing?.isContentEditable && editing.closest('.lrow')?.dataset.layerIndex === '800';
    list.dispatchEvent(new Event('scroll')); await new Promise(r => setTimeout(r, 40));
    const editRetained = editing === document.activeElement && editing.isConnected;
    editing.blur();
    
    window.__psd_editor.LP.setOpt({ thumbSize: 'large' });
    const totalLarge = list.scrollHeight;
    window.__psd_editor.LP.setOpt({ thumbSize: 'medium' });
    
    S.layerTree.flat[1000].groupType = 1; S.layerTree.flat[1000].isGroup = true;
    S.layerTree.flat[998].groupType = 3;
    S.layerTree.flat[900].effectsOpen = true;
    S.layerTree.flat[900].effects = [{ key: 'DrSh', enabled: true, label: '投影' }];
    S.set_layerTree({ ...S.layerTree }); P.renderLayerPanel();
    const expandedHeight = list.scrollHeight;
    P.collapsedGroups.add(1000); P.renderLayerPanel();
    const collapsedHeight = list.scrollHeight;
    return { before, after, bottom, last, reused, totalBefore, totalMiddle, totalBottom, topSelected, topMounted, bottomSelected, bottomMounted, renamed, editRetained, totalLarge, expandedHeight, collapsedHeight };
  });
  assert.ok(out.before.spacer && out.after.spacer, JSON.stringify(out));
  assert.ok(out.before.rows < 100 && out.after.rows < 100, `virtual panel mounted too many rows: ${JSON.stringify(out)}`);
  assert.notEqual(out.before.first, out.after.first, `scroll did not advance virtual window: ${JSON.stringify(out)}`);
  assert.equal(out.totalBefore, 48000, JSON.stringify(out));
  assert.equal(out.totalMiddle, out.totalBefore); assert.equal(out.totalBottom, out.totalBefore);
  assert.equal(out.last, '0'); assert.ok(out.reused);
  assert.equal(out.topSelected, 1199); assert.ok(out.topMounted);
  assert.equal(out.bottomSelected, 0); assert.ok(out.bottomMounted);
  assert.ok(out.renamed && out.editRetained, JSON.stringify(out));
  assert.equal(out.totalLarge, 1200 * 68);
  assert.equal(out.expandedHeight, 48000 - 40 - 6 + 44);
  assert.equal(out.collapsedHeight, out.expandedHeight - 40);
  console.log('✓ 1200 层按可视窗口挂载；首尾/尺寸/组/效果行高准确；键盘跨窗口选层和重命名正常');
} finally { await browser.close(); }
