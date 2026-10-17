import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required for native-frame browser regression');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.initDocument);
  const result = await page.evaluate(async () => {
    const F = window.__psd_editor;
    const { writePsd } = await import('/core/psd-write.js');
    const { parsePsdFull, parseLayerTree } = await import('/core/psd-parse.js');
    const { parsePsdDocument } = await import('/core/psd-document.js');
    const { setFrameRectUI } = await import('/editor/app/36-clipboard-frame.js');
    const { historyStep } = await import('/editor/app/03-history.js');
    const { setDocTool } = await import('/editor/app/31-selection-brush.js');
    setDocTool('artboard');
    const emptyArtboard = { doc: !!F.state.doc, preset: document.querySelector('#abPreset').disabled,
      width: document.querySelector('#abW').disabled, background: document.querySelector('#abBg').disabled, add: document.querySelector('#abAdd').disabled };
    const rgba = new Uint8Array(300 * 240 * 4).fill(255);
    const base = writePsd({ width: 300, height: 240, layers: [
      { name: 'Background', bounds: { left: 0, top: 0, right: 300, bottom: 240 }, rgba },
      { name: 'Pixel content', bounds: { left: 50, top: 50, right: 170, bottom: 150 }, rgba: new Uint8Array(120 * 100 * 4).fill(255) },
    ], composite: rgba });
    const metadata = async () => { const built = await F.buildPsdBuffer({ fast: true }); return parsePsdDocument(built.buf); };
    await F.initDocument(base.buffer.slice(base.byteOffset, base.byteOffset + base.byteLength), 'frame-browser.psd'); F.refreshAll(true); F.selectLayers([1]);
    setDocTool('frame');
    const frameIcons = [...document.querySelectorAll('#frKinds button')].every(b => !!b.querySelector('.ps-icon'));
    F.frame.setOpts({ kind: 'rect' }); F.frame.down(40, 40); F.frame.move(190, 170);
    const created = await F.frame.up();
    let d = await metadata(), frames = d.layers.filter(l => l.frame), frame = frames[0];
    const first = { created, frames: frames.length, count: d.layers.length, shape: frame?.frame.shape, selected: F.state.selLayer,
      contentSmart: !!d.layers[frame.index - 1].smartObject, clipping: d.layers[frame.index - 1].blend.clipping };
    await historyStep(true); const undone = (await metadata()).layers.length;
    await historyStep(false); d = await metadata(); frame = d.layers.find(l => l.frame);
    const redone = d.layers.length;
    const canvas = document.createElement('canvas'); canvas.width = 30; canvas.height = 20;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f33'; ctx.fillRect(0, 0, 30, 20);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'replace-first.png', { type: 'image/png' });
    const placed = await F.frame.placeImage(frame.index, file); d = await metadata(); frame = d.layers.find(l => l.frame);
    const afterPlace = { placed, count: d.layers.length, children: parseLayerTree((await F.buildPsdBuffer({ fast: true })).buf).flat[frame.index].children?.length,
      childName: d.layers[frame.index - 1].unicodeName || d.layers[frame.index - 1].name, smart: !!d.layers[frame.index - 1].smartObject, clipping: d.layers[frame.index - 1].blend.clipping };
    const replacement = await F.frame.placeImage(frame.index, new File([blob], 'replacement.png', { type: 'image/png' }));
    d = await metadata(); frame = d.layers.find(l => l.frame);
    const afterReplace = { replacement, count: d.layers.length, childName: d.layers[frame.index - 1].unicodeName || d.layers[frame.index - 1].name,
      smartCount: d.layers.filter(l => l.smartObject).length };
    const childIndex = frame.index - 1;
    F.selectLayers([childIndex]); const taken = await F.frame.take(); d = await metadata(); frame = d.layers.find(l => l.frame);
    const afterTake = { taken, selected: F.state.selLayer, frameIndex: frame.index, count: d.layers.length };
    const put = await F.frame.put(); d = await metadata(); frame = d.layers.find(l => l.frame);
    const afterPut = { put, childIndex: F.state.selLayer, frameIndex: frame.index, clipping: d.layers[frame.index - 1].blend.clipping };
    const soBefore = d.layers[frame.index - 1].additionalBlocks.find(b => b.key === 'SoLd')._raw.slice();
    const resized = await setFrameRectUI(frame.index, { x: 25, y: 20, w: 170, h: 160 }); d = await metadata(); frame = d.layers.find(l => l.frame);
    const afterResize = { resized, rect: frame.frame.rect,
      childUnchanged: [...soBefore].join(',') === [...d.layers[frame.index - 1].additionalBlocks.find(b => b.key === 'SoLd')._raw].join(',') };
    F.selectLayers([frame.index]); F.frame.setOpts({ kind: 'ellipse' }); F.frame.down(210, 30); F.frame.move(290, 110); await F.frame.up();
    d = await metadata(); const ellipse = d.layers.find(l => l.frame?.shape === 'ellipse');
    const hit = { center: F.frame.at(250, 70), corner: F.frame.at(211, 31), ellipseIndex: ellipse.index };
    const full = parsePsdFull((await F.buildPsdBuffer({ fast: true })).buf);
    const frameContentCanvases = [...document.querySelectorAll('[data-frame-content]')]
      .filter(e => +e.dataset.frameContent >= 0).every(e => !!e.querySelector('canvas'));
    return { first, undone, redone, afterPlace, afterReplace, afterTake, afterPut, afterResize, hit, emptyArtboard, frameIcons, err: document.querySelector('#err').textContent,
      groupCount: full.layers.filter(l => l.frame).length, frameContentCanvases };
  });
  assert.equal(result.first.created, true); assert.equal(result.first.frames, 1); assert.equal(result.first.count, 4);
  assert.equal(result.first.shape, 'rect'); assert.equal(result.first.contentSmart, true); assert.equal(result.first.clipping, 0);
  assert.equal(result.undone, 2); assert.equal(result.redone, 4);
  assert.equal(result.afterPlace.placed, true); assert.equal(result.afterPlace.count, 4); assert.equal(result.afterPlace.smart, true); assert.equal(result.afterPlace.clipping, 0);
  assert.equal(result.afterReplace.replacement, true); assert.equal(result.afterReplace.count, 4); assert.equal(result.afterReplace.smartCount, 1); assert.equal(result.afterReplace.childName, 'replacement');
  assert.equal(result.afterTake.taken, true); assert.ok(result.afterTake.selected > result.afterTake.frameIndex);
  assert.equal(result.afterPut.put, true); assert.equal(result.afterPut.childIndex, result.afterPut.frameIndex - 1); assert.equal(result.afterPut.clipping, 0);
  assert.equal(result.afterResize.resized, true); assert.deepEqual(result.afterResize.rect, { x: 25, y: 20, w: 170, h: 160 }); assert.equal(result.afterResize.childUnchanged, true);
  assert.equal(result.hit.center, result.hit.ellipseIndex); assert.notEqual(result.hit.corner, result.hit.ellipseIndex);
  assert.equal(result.err, ''); assert.equal(result.groupCount, 2); assert.deepEqual(errors, []);
  assert.deepEqual(result.emptyArtboard, { doc: false, preset: false, width: false, background: false, add: true });
  assert.equal(result.frameIcons, true);
  assert.equal(result.frameContentCanvases, true);
  if (process.env.FRAME_BROWSER_OUT) {
    const exported = await page.evaluate(async () => [...new Uint8Array((await window.__psd_editor.buildPsdBuffer({ fast: true })).buf)]);
    fs.writeFileSync(process.env.FRAME_BROWSER_OUT, Uint8Array.from(exported));
  }
  const fromLayers = await page.evaluate(async () => {
    const F = window.__psd_editor;
    const { writePsd } = await import('/core/psd-write.js');
    const { applyEdits } = await import('/core/psd-edit.js');
    const { parsePsdDocument } = await import('/core/psd-document.js');
    const { parseSmartObjects } = await import('/core/psd-parse.js');
    const { createFrameFromLayerUI } = await import('/editor/app/36-clipboard-frame.js');
    const { historyStep } = await import('/editor/app/03-history.js');
    const results = [];
    for (const kind of ['pixel', 'group', 'multi', 'menu']) {
      let bytes = writePsd({ width: 200, height: 150, layers: [
        { name: 'Background', bounds: { left: 0, top: 0, right: 200, bottom: 150 }, rgba: new Uint8Array(200 * 150 * 4).fill(255) },
        { name: 'Editable 1', bounds: { left: 20, top: 30, right: 70, bottom: 70 }, rgba: new Uint8Array(50 * 40 * 4).fill(255) },
        { name: 'Editable 2', bounds: { left: 80, top: 50, right: 110, bottom: 80 }, rgba: new Uint8Array(30 * 30 * 4).fill(255) },
      ] });
      if (kind === 'group') bytes = applyEdits(bytes, [{ op: 'groupLayers', indices: [1, 2], name: 'Editable group' }]).buffer;
      const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const before = parsePsdDocument(buffer);
      await F.initDocument(buffer, 'from-layer.psd'); F.refreshAll(true);
      const selected = kind === 'group' ? [4] : kind === 'multi' ? [1, 2] : [1]; F.selectLayers(selected);
      let ok;
      if (kind === 'menu') {
        const oldDialog = window.__fpDialog; window.__fpDialog = () => 'From menu';
        try {
          F.actions.run('layer.frameFromLayers');
          const history = await import('/editor/app/03-history.js'); ok = await history.LAST_RUN;
        } finally { window.__fpDialog = oldDialog; }
      } else ok = await createFrameFromLayerUI(selected.at(-1), `From ${kind}`);
      const undoCount = F.state.docUndo;
      const built = (await F.buildPsdBuffer({ fast: true })).buf, out = parsePsdDocument(built), frame = out.layers.find(l => l.frame);
      if (!frame) throw new Error(JSON.stringify({ kind, ok, enabled: F.actions.enabled?.('layer.frameFromLayers'), why: F.actions.why?.('layer.frameFromLayers'), notice: document.querySelector('#notice').textContent, error: document.querySelector('#err').textContent }));
      const child = out.layers[frame.index - 1], smart = parseSmartObjects(built).find(s => s.layerIndex === frame.index - 1);
      const embedded = smart?.sourceImage?.bytes ? parsePsdDocument(smart.sourceImage.bytes).layers.map(l => l.unicodeName || l.name) : [];
      await historyStep(true); const restored = parsePsdDocument((await F.buildPsdBuffer({ fast: true })).buf);
      results.push({ kind, ok, frame: !!frame.isFrame, name: frame.unicodeName || frame.name, smart: !!child.smartObject,
        clipping: child.blend.clipping, undoCount, before: before.layers.length, afterUndo: restored.layers.length,
        frameAfterUndo: restored.layers.filter(l => l.frame).length, embedded, error: document.querySelector('#err').textContent });
    }
    return results;
  });
  for (const r of fromLayers) {
    assert.equal(r.ok, true); assert.equal(r.frame, true); assert.equal(r.smart, true); assert.equal(r.clipping, 0);
    assert.equal(r.name, `From ${r.kind}`); assert.equal(r.undoCount, 1); assert.equal(r.afterUndo, r.before); assert.equal(r.frameAfterUndo, 0); assert.equal(r.error, '');
    if (r.kind === 'group' || r.kind === 'multi') { assert.ok(r.embedded.includes('Editable 1')); assert.ok(r.embedded.includes('Editable 2')); }
  }
  assert.deepEqual(errors, []);
  console.log('✓ from-layer menu helper wraps pixel/group/multiselection in real frames and editable child SOs, with one-step undo');
  console.log('✓ native-frame create/conversion/place/replacement/take/put/resize/ellipse hit testing and one-step undo/redo; no browser exceptions');
} finally { await browser.close(); }
