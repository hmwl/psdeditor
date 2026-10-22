import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint);
  const result = await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.docSize.newDocument({ width: 513, height: 515, background: 'transparent', name: 'sparse-operations' });
    await A.createLayer({ name: 'Empty paint layer' });
    const idx = A.state.selLayer;
    A.paint.setColors([255, 0, 0]);
    await A.paint.stroke([{ x: 64, y: 64 }], { size: 16, hardness: 1, plain: true, noSel: true });
    await A.gpu.flush();
    const layer = A.state.doc.layers[idx];
    const painted = [...await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList, { W: 1, H: 1, s: 1, tx: -64, ty: -64 })];
    const bounds = { ...layer.bounds }, sparse = !!A.paint.pixelPaint[idx]?.sparse;
    const { fillWith } = await import('/editor/app/14-edit-misc.js');
    await fillWith({ contents: 'color', color: '#c83264', opacity: 100 });
    await A.lazy.selection();
    A.sel.rect(255, 255, 3, 3);


    layer.lazyChannels = {};
    const filtered = await A.actions.run('filter.stylize.solarize'); await A.lastAction;
    const pp = A.paint.pixelPaint[idx];
    const at = async (x, y) => [...await pp.sparse.readRect({ x, y, w: 1, h: 1 })];
    const raw = key => { const t = pp.sparse.tiles.get(key); return t ? { size: t.data.length, data: [...t.data.subarray((255 * t.width + 255) * 4, (255 * t.width + 255) * 4 + 4)], original: [...t.original.subarray((255 * t.width + 255) * 4, (255 * t.width + 255) * 4 + 4)] } : null; };
    const inside = await at(255, 255), outside = await at(258, 256), edge = await at(512, 514), raw0 = raw('0:0'), raw256 = raw('256:256'), keysAfterFilter = [...pp.sparse.tiles.keys()];
    const tileKeys = [...pp.sparse.tiles.keys()], undoTop = A.paint.history.undo.at(-1), history = A.paint.history.undo.slice(-3).map(e => ({ kind: e.kind, idx: e.idx, patches: e.patches?.map(p => ({ key: p.key, rect: p.rect, before: [...p.before], after: [...p.after] })) }));
    await A.actions.run('edit.undo'); await A.lastAction;
    const undo = await at(256, 256);
    const adjusted = await A.actions.run('image.adjust.invert'); await A.lastAction;
    const inverted = await at(256, 256), untouched = await at(258, 256);
    return { painted, bounds, sparse, filtered, inside, outside, edge, undo, adjusted, inverted, untouched };
  });
  assert.equal(result.sparse, true);
  assert.deepEqual(result.bounds, { left: 0, top: 0, right: 513, bottom: 515 });
  assert.deepEqual(result.painted, [255, 0, 0, 255]);
  assert.equal(result.filtered, true);
  assert.notDeepEqual(result.inside, result.outside);
  for (const key of ['outside', 'edge', 'undo', 'untouched']) assert.deepEqual(result[key], [200, 50, 100, 255], key);
  assert.equal(result.adjusted, true);
  assert.deepEqual(result.inverted, [55, 205, 155, 255]);
  assert.deepEqual(errors, []);
  console.log('✓ empty-layer sparse paint is visible; tile-edge fill, selected filter/adjustment and undo preserve other pixels');
} finally { await browser.close(); }
