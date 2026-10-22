
import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
import { largeZipFixture } from './large-zip-fixture.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const buf = await largeZipFixture(9390, 30000, { compression: 'rle', mask: true });
const browser = await PW.chromium.launch({
  executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: WEBGPU_ARGS,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint, null, { timeout: 60000 });
  await page.setInputFiles('#file', { name: 'large-mask.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: buf });
  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && (l.lazyChannels || l.rgba);
  }, null, { timeout: 180000 });

  const out = await page.evaluate(async () => {
    const A = window.__psd_editor, L = A.state.doc.layers[0];
    const RP = await import('/core/psd-raster.js');
    const M = await import('/editor/app/30-render.js');
    const alpha = (p, o) => p ? p[o * 4 + 3] : null;
    const leftTile = RP.readLazyLayerTile(L, 0, 0);
    const rightTile = RP.readLazyLayerTile(L, Math.floor((L.width - 1) / 256), 0);
    const left = await M.readLayerRegionRGBA(L, 0, 40, 40, 80, 80);
    const right = await M.readLayerRegionRGBA(L, 0, L.width - 120, 40, 80, 80);
    return {
      w: L.width, h: L.height, rgba: !!L.rgba,
      lazyMaskChannel: L.lazyChannels?.[-2] ? -2 : L.lazyChannels?.[-3] ? -3 : null,
      mask: L.mask && { width: L.mask.width, height: L.mask.height, lazyChannel: L.mask.lazyChannel, gray: !!L.mask.gray },
      sampleLeft: RP.readLazyLayerPixel(L, 40, 40),
      sampleRight: RP.readLazyLayerPixel(L, L.width - 40, 40),
      tileLeftAlpha: alpha(leftTile?.data, 40), tileRightAlpha: alpha(rightTile?.data, rightTile.width - 40),
      regionLeftAlpha: left?.[(40 * 80 + 40) * 4 + 3], regionRightAlpha: right?.[(40 * 80 + 40) * 4 + 3],
      err: document.querySelector('#err')?.textContent || '',
    };
  });
  console.log(JSON.stringify(out));
  assert.equal(out.w, 9390);
  assert.equal(out.h, 30000);
  assert.equal(out.rgba, false, 'layered large PSD with a mask must stay lazy');
  assert.equal(out.lazyMaskChannel, -2, 'mask channel must stay in the lazy channel map');
  assert.equal(out.mask.lazyChannel, -2);
  assert.equal(out.mask.gray, false, 'mask must not materialize a full gray plane');
  assert.equal(out.sampleLeft[3], 255, 'left half of the mask is visible');
  assert.equal(out.sampleRight[3], 0, 'right half of the mask is hidden');
  assert.equal(out.tileLeftAlpha, 255, 'decoded tile must apply the mask');
  assert.equal(out.tileRightAlpha, 0, 'decoded right tile must apply the mask');
  assert.equal(out.regionLeftAlpha, 255);
  assert.equal(out.regionRightAlpha, 0);
  assert.equal(out.err, '');

  const saved = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('brush'); A.paint.setTarget('mask'); A.paint.setColors([0, 0, 0]);
    A.paint.options.size = 80; A.paint.options.hardness = 1; A.paint.options.spacing = 0.25;
    await A.paint.stroke([{ x: 100, y: 120 }, { x: 150, y: 120 }], { size: 80, hardness: 1, plain: true, noSel: true });
    await A.gpu.flush();
    const t = performance.now();
    const built = await A.buildPsdBuffer();
    const ms = Math.round(performance.now() - t), bytes = built.buf;
    const { decodeCompositeImage } = await import('/core/psd-image.js');
    const v = new DataView(bytes), c = decodeCompositeImage(bytes, {
      width: v.getUint32(18), height: v.getUint32(14), channels: v.getUint16(12),
      depth: v.getUint16(22), mode: v.getUint16(24), psb: v.getUint16(4) === 2,
    }).toRGBA();
    const px = (x, y) => [...c.subarray((y * 9390 + x) * 4, (y * 9390 + x) * 4 + 4)];
    await A.loadPsd(new File([bytes], 'mask-saved.psd'));
    await new Promise(r => setTimeout(r, 800));
    const L = A.state.doc.layers[0];
    const RP = await import('/core/psd-raster.js'), M = await import('/editor/app/30-render.js');
    const LQ = await import('/editor/app/24-layer-ops-queue.js');
    const alpha = async (x, y) => { const d = await M.readLayerRegionRGBA(L, 0, x, y, 16, 16); return d[(8 * 16 + 8) * 4 + 3]; };
    LQ.setOpField(0, { op: 'setMaskProps' }, 'feather', 30, 0); await new Promise(r => setTimeout(r, 300));
    const feather = { mid: RP.readLazyMaskPixel(L, 4695, 100), left: RP.readLazyMaskPixel(L, 4680, 100),
      right: RP.readLazyMaskPixel(L, 4700, 100), b1: RP.readLazyMaskPixel(L, 4607, 100),
      b2: RP.readLazyMaskPixel(L, 4608, 100), ov: L.lazyMaskOverride };
    LQ.setOpField(0, { op: 'setMaskProps' }, 'feather', 0, 30); await new Promise(r => setTimeout(r, 120));
    A.paint.setTarget('pixels');
    return {
      ms, bytes: bytes.byteLength || bytes.length, feather,
      composite: { painted: px(120, 120), otherLeft: px(300, 300), right: px(9300, 120) },
      lazy: !!L.lazyChannels, rgba: !!L.rgba, lazyMask: L.mask && L.mask.lazyChannel,
      paintedMask: RP.readLazyMaskPixel(L, 120, 120), otherMask: RP.readLazyMaskPixel(L, 300, 300),
      rightMask: RP.readLazyMaskPixel(L, 9300, 120),
      paintedAlpha: await alpha(112, 112), otherAlpha: await alpha(292, 292), rightAlpha: await alpha(9292, 112),
      err: document.querySelector('#err')?.textContent || '',
    };
  });
  console.log(JSON.stringify(saved));
  assert.deepEqual(saved.composite.painted, [0, 0, 0, 0], 'saved merged composite must include the painted mask');
  assert.deepEqual(saved.composite.otherLeft, [171, 65, 211, 255]);
  assert.deepEqual(saved.composite.right, [0, 0, 0, 0]);
  assert.equal(saved.lazy, true);
  assert.equal(saved.rgba, false);
  assert.equal(saved.lazyMask, -2);
  assert.equal(saved.paintedMask, 0);
  assert.equal(saved.otherMask, 255);
  assert.equal(saved.rightMask, 0);
  assert.equal(saved.paintedAlpha, 0);
  assert.equal(saved.otherAlpha, 255);
  assert.equal(saved.rightAlpha, 0);
  assert.deepEqual(saved.feather.ov, { feather: 30 });
  assert.ok(saved.feather.mid > 60 && saved.feather.mid < 200, 'feathered mask mid value');
  assert.ok(saved.feather.left > saved.feather.right, 'feather direction');
  assert.ok(Math.abs(saved.feather.b1 - saved.feather.b2) <= 3, 'feather continuous across 256px tiles');
  assert.equal(saved.err, '');

  const menu = await page.evaluate(async () => {
    const A = window.__psd_editor, B = await import('/editor/app/38-brush-engine.js'), RP = await import('/core/psd-raster.js');
    A.selectLayers([0]); A.selectTool('brush');
    const L = () => A.state.doc.layers[0], wait = ms => new Promise(r => setTimeout(r, ms));
    const mask = (x, y) => RP.readLazyMaskPixel(L(), x, y);
    const setUniform = v => {
      delete A.paint.maskPaint[0];
      const mp = B.ensureMaskPaint(0, { create: true, fill: v });
      const ok = mp ? B.commitMaskPaint(0) : false;
      B.maskAdded(0); return ok;
    };
    const base = { left: mask(300, 300), right: mask(9300, 100) };
    const hide = setUniform(0); await wait(120);
    const hidden = { left: mask(300, 300), right: mask(9300, 100) };
    A.paint.undo(); await wait(120);
    const unhidden = { left: mask(300, 300), right: mask(9300, 100) };
    const reveal = setUniform(255); await wait(120);
    const revealed = { left: mask(300, 300), right: mask(9300, 100) };
    A.paint.undo(); await wait(120);
    A.sel.rect(500, 500, 600, 400, 'replace'); await wait(80);
    const selOk = B.maskFromSelection(0); B.maskAdded(0); await wait(150);
    const fromSel = { inside: mask(700, 700), outside: mask(300, 300), right: mask(9300, 100) };
    const built = await A.buildPsdBuffer(), bytes = built.buf;
    const { decodeCompositeImage } = await import('/core/psd-image.js'), v = new DataView(bytes);
    const c = decodeCompositeImage(bytes, { width: v.getUint32(18), height: v.getUint32(14), channels: v.getUint16(12),
      depth: v.getUint16(22), mode: v.getUint16(24), psb: v.getUint16(4) === 2 }).toRGBA();
    const px = (x, y) => [...c.subarray((y * 9390 + x) * 4, (y * 9390 + x) * 4 + 4)];
    const composite = { inside: px(700, 700), outside: px(100, 100), right: px(9300, 100) };
    A.paint.undo(); await wait(120);
    const undone = { inside: mask(700, 700), outside: mask(300, 300) };
    A.actions.run('select.none');
    return { base, hide, hidden, unhidden, reveal, revealed, selOk, fromSel, composite, undone,
      err: document.querySelector('#err')?.textContent || '' };
  });
  console.log(JSON.stringify(menu));
  assert.deepEqual(menu.base, { left: 255, right: 0 });
  assert.equal(menu.hide, true);
  assert.deepEqual(menu.hidden, { left: 0, right: 0 });
  assert.deepEqual(menu.unhidden, { left: 255, right: 0 });
  assert.equal(menu.reveal, true);
  assert.deepEqual(menu.revealed, { left: 255, right: 255 });
  assert.equal(menu.selOk, true);
  assert.deepEqual(menu.fromSel, { inside: 255, outside: 0, right: 0 });
  assert.deepEqual(menu.composite.inside, [171, 65, 211, 255]);
  assert.deepEqual(menu.composite.outside, [0, 0, 0, 0]);
  assert.deepEqual(menu.composite.right, [0, 0, 0, 0]);
  assert.deepEqual(menu.undone, { inside: 255, outside: 255 });
  assert.equal(menu.err, '');


  const noMaskBuf = await largeZipFixture(9390, 30000, { compression: 'rle' });
  await page.setInputFiles('#file', { name: 'no-mask.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: noMaskBuf });
  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && (l.lazyChannels || l.rgba) && !l.mask;
  }, null, { timeout: 180000 });
  const created = await page.evaluate(async () => {
    const A = window.__psd_editor, B = await import('/editor/app/38-brush-engine.js'), RP = await import('/core/psd-raster.js'), M = await import('/editor/app/30-render.js');
    const EM = await import('/editor/app/48-info-export.js');
    A.selectLayers([0]); A.selectTool('brush');

    const jt = performance.now();
    const jr = await EM.writeLazyJpeg(A.state.doc.layers[0], 0, null, 90, null, null);
    const jpegMs = Math.round(performance.now() - jt);
    const bmp = await createImageBitmap(jr.blob, { resizeWidth: 256, resizeHeight: 256 });
    const jcv = new OffscreenCanvas(256, 256), jg = jcv.getContext('2d'); jg.drawImage(bmp, 0, 0);
    const jp = jg.getImageData(128, 128, 1, 1).data;
    const jpeg = { ms: jpegMs, bytes: jr.blob.size, w: bmp.width, h: bmp.height, center: [...jp] };
    A.sel.rect(500, 500, 600, 400, 'replace'); await new Promise(r => setTimeout(r, 80));
    const ok = B.maskFromSelection(0); B.maskAdded(0); await new Promise(r => setTimeout(r, 200));
    const L = A.state.doc.layers[0];
    const alpha = async (x, y) => { const d = await M.readLayerRegionRGBA(L, 0, x, y, 16, 16); return d[(8 * 16 + 8) * 4 + 3]; };
    const live = { ok, mask: L.mask && { w: L.mask.width, h: L.mask.height, left: L.mask.left, top: L.mask.top, def: L.mask.defaultColor, gray: !!L.mask.gray },
      inside: RP.readLazyMaskPixel(L, 700, 700), outside: RP.readLazyMaskPixel(L, 100, 100),
      alphaInside: await alpha(692, 692), alphaOutside: await alpha(92, 92) };
    const built = await A.buildPsdBuffer(), bytes = built.buf;
    const { decodeCompositeImage } = await import('/core/psd-image.js'), v = new DataView(bytes);
    const c = decodeCompositeImage(bytes, { width: v.getUint32(18), height: v.getUint32(14), channels: v.getUint16(12),
      depth: v.getUint16(22), mode: v.getUint16(24), psb: v.getUint16(4) === 2 }).toRGBA();
    const px = (x, y) => [...c.subarray((y * 9390 + x) * 4, (y * 9390 + x) * 4 + 4)];
    const composite = { inside: px(700, 700), outside: px(100, 100) };
    await A.loadPsd(new File([bytes], 'created-mask.psd')); await new Promise(r => setTimeout(r, 800));
    const R = A.state.doc.layers[0], RP2 = await import('/core/psd-raster.js');
    A.actions.run('select.none');
    return { jpeg, live, composite, bytes: bytes.byteLength || bytes.length,
      reopen: { mask: !!R.mask, inside: RP2.readLazyMaskPixel(R, 700, 700), outside: RP2.readLazyMaskPixel(R, 100, 100) },
      err: document.querySelector('#err')?.textContent || '' };
  });
  console.log(JSON.stringify(created));
  assert.equal(created.live.ok, true);
  assert.equal(created.live.mask.w, 600);
  assert.equal(created.live.mask.h, 400);
  assert.equal(created.live.mask.left, 500);
  assert.equal(created.live.mask.top, 500);
  assert.equal(created.live.mask.def, 0);
  assert.equal(created.live.inside, 255);
  assert.equal(created.live.outside, 0);
  assert.equal(created.live.alphaInside, 255);
  assert.equal(created.live.alphaOutside, 0);
  assert.equal(created.jpeg.w, 256);
  assert.equal(created.jpeg.h, 256);
  assert.ok(created.jpeg.bytes > 1000);
  assert.ok(Math.abs(created.jpeg.center[0] - 171) <= 4, 'JPEG red channel');
  assert.ok(Math.abs(created.jpeg.center[1] - 65) <= 4, 'JPEG green channel');
  assert.ok(Math.abs(created.jpeg.center[2] - 211) <= 4, 'JPEG blue channel');
  assert.deepEqual(created.composite.inside, [171, 65, 211, 255]);
  assert.deepEqual(created.composite.outside, [0, 0, 0, 0]);
  assert.equal(created.reopen.mask, true);
  assert.equal(created.reopen.inside, 255);
  assert.equal(created.reopen.outside, 0);
  assert.equal(created.err, '');


  const negated = await page.evaluate(async () => {
    const A = window.__psd_editor, B = await import('/editor/app/38-brush-engine.js'), RP = await import('/core/psd-raster.js');
    await A.lazy.selection();
    A.sel.rect(0, 0, A.state.docW, A.state.docH, 'replace'); await new Promise(r => setTimeout(r, 150));
    A.sel.rect(600, 600, 200, 200, 'subtract'); await new Promise(r => setTimeout(r, 100));
    const t0 = performance.now(), ok = B.maskFromSelection(0), ms = Math.round(performance.now() - t0);
    const L = A.state.doc.layers[0], e = L.lazyMaskEdits;
    const value = (x, y) => RP.readLazyMaskPixel(L, x, y, false);
    const live = { hole: value(700, 700), outside: value(900, 700), corner: value(550, 550), ok, ms, uniform: e?.uniform, tiles: e?.tiles?.size || 0 };
    const b = await A.buildPsdBuffer({ fast: true });
    await A.loadPsd(new File([b.buf], 'neg-mask.psd')); await new Promise(r => setTimeout(r, 900));
    const L2 = A.state.doc.layers[0];
    const reopen = { hole: RP.readLazyMaskPixel(L2, 700, 700, false), outside: RP.readLazyMaskPixel(L2, 900, 700, false) };

    A.sel.rect(0, 0, A.state.docW, A.state.docH, 'replace'); await new Promise(r => setTimeout(r, 150));
    const uniOk = B.maskFromSelection(0);
    const e2 = A.state.doc.layers[0].lazyMaskEdits;
    const uniformOnly = { ok: uniOk, uniform: e2?.uniform, tiles: e2?.tiles?.size || 0,
      hole: RP.readLazyMaskPixel(A.state.doc.layers[0], 700, 700, false) };
    const b2 = await A.buildPsdBuffer({ fast: true });
    await A.loadPsd(new File([b2.buf], 'uni-mask.psd')); await new Promise(r => setTimeout(r, 900));
    uniformOnly.reopen = RP.readLazyMaskPixel(A.state.doc.layers[0], 700, 700, false);
    return { live, reopen, uniformOnly, err: document.querySelector('#err')?.textContent || '' };
  });
  console.log(JSON.stringify(negated));
  assert.equal(negated.live.ok, true);
  assert.equal(negated.live.uniform, 255);
  assert.equal(negated.live.hole, 0);
  assert.equal(negated.live.outside, 255);
  assert.equal(negated.live.corner, 255);
  assert.ok(negated.live.tiles < 30, '反选只应写洞附近的瓦片');
  assert.deepEqual(negated.reopen, { hole: 0, outside: 255 });
  assert.equal(negated.uniformOnly.ok, true);
  assert.equal(negated.uniformOnly.uniform, 255);
  assert.equal(negated.uniformOnly.tiles, 0);
  assert.equal(negated.uniformOnly.hole, 255);
  assert.equal(negated.uniformOnly.reopen, 255);
  assert.equal(negated.err, '');
  assert.deepEqual(errors, []);
  console.log('✓ 超大蒙版 PSD 保持惰性通道，蒙版逐块/逐区域正确生效，编辑后可写回并重开');
} finally {
  await browser.close();
}
