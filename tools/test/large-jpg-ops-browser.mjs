

import { existsSync } from 'node:fs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const JPG = process.env.PSD_EDITOR_BIG_JPG || 'corpus/real/large.jpg';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({
  executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: WEBGPU_ARGS,
});
const lines = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint, null, { timeout: 60000 });

  if (!existsSync(JPG)) { console.log(`⚠ 缺少样例 ${JPG}，跳过`); await browser.close(); process.exit(0); }

  const t0 = Date.now();
  await page.setInputFiles('#file', JPG);

  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && (l.lazyRasterSource || (l.rgba && l.width > 1));
  }, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  const openMs = Date.now() - t0;

  const snap = async () => page.evaluate(() => {
    const A = window.__psd_editor, s = A.state, l = s.doc?.layers?.[0];
    return { w: s.docW, h: s.docH, layers: s.doc?.layers?.length ?? 0,
      lazy: !!l?.lazyRasterSource, rgba: !!l?.rgba, lw: l?.width, lh: l?.height,
      preview: l?.lazyPreview ? `${l.lazyPreview.width}×${l.lazyPreview.height}` : null,
      file: !!l?.lazyRasterFile, tool: A.tool?.(),
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  const s0 = await snap();
  lines.push(`打开 ${openMs}ms → ${s0.w}×${s0.h}｜层 ${s0.layers}｜lazy=${s0.lazy} rgba=${s0.rgba} ${s0.lw}×${s0.lh} preview=${s0.preview}`);
  lines.push(`工具=${s0.tool} err="${s0.err}"`);

  const runAction = async id => {
    await page.evaluate(id => { window.__psd_editor.actions.run(id); }, id);
    await page.evaluate(async () => { if (window.__psd_editor.lastAction) await window.__psd_editor.lastAction; });
  };



  const pngGate = await page.evaluate(async () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'CompressionStream');
    let reached = false;
    const Fake = class { constructor(){ reached = true; throw new Error('PNG_GATE_REACHED'); } };
    try { Object.defineProperty(window, 'CompressionStream', { value: Fake, configurable: true, writable: true }); } catch {}
    if (window.CompressionStream !== Fake) return { installed: false };
    try {
      const M = await import('/editor/app/48-info-export.js');
      await M.quickExportPng();
    } catch {}
    if (desc) Object.defineProperty(window, 'CompressionStream', desc); else delete window.CompressionStream;
    return { installed: true, reached, err: document.querySelector('#err')?.textContent || '' };
  });
  lines.push(`PNG 门禁：${JSON.stringify(pngGate)}`);

  const band = await page.evaluate(async () => {
    const A = window.__psd_editor, l = A.state.doc.layers[0];
    const M = await import('/editor/app/21-load-document.js');
    const t = performance.now();
    const b = await M.readLazyImageBand(l, 0, 256);
    return { ms: Math.round(performance.now() - t), w: b?.width, h: b?.height, len: b?.data?.length, preview: !!b?.preview };
  });
  lines.push(`行带读取：${JSON.stringify(band)}`);
  await page.evaluate(() => { const e = document.querySelector('#err'); if (e) e.textContent = ''; });

  const step = async (label, fn, wait = 800) => {
    const before = await snap();
    let ret = null, threw = '';
    try { ret = await page.evaluate(fn); } catch (e) { threw = String(e.message || e).split('\n')[0]; }
    await page.waitForTimeout(wait);
    const after = await snap();
    const errNow = after.err && after.err !== before.err ? after.err : '';
    lines.push(`${errNow || threw ? '❌' : '✅'} ${label}｜${JSON.stringify(ret)}${threw ? ' [异常] ' + threw : ''}${errNow ? ' [err] ' + errNow.slice(0, 160) : ''}｜层 ${before.layers}→${after.layers}`);
    return { before, after, ret };
  };

  await step('选中图层0 + 切画笔', () => {
    const A = window.__psd_editor; A.selectLayers([0]); A.selectTool('brush');
    A.paint.setColors([255, 0, 0]);
    return { tool: A.tool?.(), target: (document.querySelector('#brTarget') || {}).value };
  });

  const diag = await page.evaluate(() => {
    const A = window.__psd_editor, d = A.state.doc, l = d?.layers?.[0];
    const tv = A.getTransformValues ? A.getTransformValues(0) : null;
    return { rgba: !!l.rgba, lc: !!l.lazyChannels, lcc: !!l.lazyCompressedChannels, li: !!l.lazyImage, lrf: !!l.lazyRasterFile,
      mask: !!l.mask, vmask: !!l.vectorMask, eff: !!l.effects, fill: !!l.fill, hidden: !!l.hidden,
      depth: d.depth, mode: d.mode, bounds: l.bounds, tv, w: l.width, h: l.height,
      pixelPaint: !!A.paint.pixelPaint[0], layerTransforms: Object.keys(A.state.doc.layers).length };
  });
  lines.push('画笔条件诊断：' + JSON.stringify(diag));

  await step('原图层画一笔', async () => {
    const A = window.__psd_editor; const t = performance.now();
    const r = await A.paint.stroke([{ x: 600, y: 600 }, { x: 700, y: 700 }], { size: 100, hardness: 1, plain: true, noSel: true });
    await A.gpu.flush();
    return { ms: Math.round(performance.now() - t), rect: r ? { w: r.width, h: r.height } : null,
      sparse: !!A.paint.pixelPaint[0]?.sparse };
  }, 1500);

  const hugeRetouch = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('spotHeal');
    A.retouch.setOpts({ size: 90, spotType: 'content', spotMode: 'normal' });
    const pp = A.paint.pixelPaint[0], rect = { x: 1980, y: 1980, w: 180, h: 140 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素', pp: Object.keys(pp || {}) };
    const grab = () => pp.sparse.readRect(rect).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(2050, 2050);
    A.retouch.move(2090, 2060);
    A.retouch.move(2120, 2080);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const after = await grab();
    const changed = count(before, after), tiles = pp.sparse.tiles.size;
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.actions.run('edit.redo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const redone = count(before, await grab());
    A.selectTool('brush');
    return { down, up, ms, changed, tiles, undone, redone,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '',
      status: document.querySelector('#status')?.textContent || '' };
  });
  lines.push(`超大文档污点修复（分块 + 撤销/重做）：${JSON.stringify(hugeRetouch)}`);
  if (!hugeRetouch.skipped && !(hugeRetouch.changed > 0 && hugeRetouch.undone === 0 && hugeRetouch.redone > 0))
    lines.push('❌ 污点修复分块路径未通过像素/撤销检查');

  const hugeHeal = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('healBrush');
    A.retouch.setOpts({ size: 90, healSource: 'sample', sample: 'layer', aligned: true, diffusion: 5, legacy: false });
    A.retouch.setSource(2300.5, 2300.5);
    const pp = A.paint.pixelPaint[0], rect = { x: 1990, y: 1990, w: 170, h: 150 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = () => pp.sparse.readRect(rect).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(2050, 2060);
    A.retouch.move(2090, 2060);
    A.retouch.move(2120, 2070);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab());
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.actions.run('edit.redo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const redone = count(before, await grab());
    A.selectTool('brush');
    return { down, up, ms, changed, undone, redone,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档修复画笔（分块 + 撤销/重做）：${JSON.stringify(hugeHeal)}`);
  if (!hugeHeal.skipped && !(hugeHeal.changed > 0 && hugeHeal.undone === 0 && hugeHeal.redone > 0))
    lines.push('❌ 修复画笔分块路径未通过像素/撤销检查');

  const hugeHealAll = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('healBrush');
    A.retouch.setOpts({ size: 90, healSource: 'sample', sample: 'all', ignoreAdj: true, aligned: true, diffusion: 5 });
    A.retouch.setSource(3800.5, 3500.5);
    const pp = A.paint.pixelPaint[0], rect = { x: 3340, y: 3400, w: 280, h: 240 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = () => pp.sparse.readRect(rect).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(3400, 3500);
    A.retouch.move(3460, 3510);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab());
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.retouch.setOpts({ sample: 'layer', ignoreAdj: false });
    A.selectTool('brush');
    return { down, up, ms, changed, undone,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档修复画笔「所有图层」取样：${JSON.stringify(hugeHealAll)}`);
  if (!hugeHealAll.skipped && !(hugeHealAll.changed > 0 && hugeHealAll.undone === 0))
    lines.push('❌ 修复画笔「所有图层」取样未通过像素/撤销检查');

  const hugePatch = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('patch');
    A.retouch.setOpts({ size: 60, patchKind: 'normal', patchMode: 'source', patchDiffusion: 5, patchAll: false });
    A.sel.rect(2500, 2500, 120, 120, 'replace');
    await new Promise(r => setTimeout(r, 60));
    const pp = A.paint.pixelPaint[0], rect = { x: 2480, y: 2480, w: 160, h: 160 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = () => pp.sparse.readRect(rect).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(2550, 2550);
    A.retouch.move(2650, 2650);
    A.retouch.move(2750, 2750);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab());
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.actions.run('edit.redo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const redone = count(before, await grab());
    A.actions.run('select.none');
    A.selectTool('brush');
    return { down, up, ms, changed, undone, redone,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档修补（分块 + 撤销/重做）：${JSON.stringify(hugePatch)}`);
  if (!hugePatch.skipped && !(hugePatch.changed > 0 && hugePatch.undone === 0 && hugePatch.redone > 0))
    lines.push('❌ 修补分块路径未通过像素/撤销检查');

  const hugePatchAll = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('patch');
    A.retouch.setOpts({ size: 60, patchKind: 'normal', patchMode: 'source', patchDiffusion: 5, patchAll: true });
    A.sel.rect(3400, 3400, 160, 160, 'replace');
    await new Promise(r => setTimeout(r, 60));
    const pp = A.paint.pixelPaint[0], rect = { x: 3360, y: 3360, w: 520, h: 420 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = () => pp.sparse.readRect(rect).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(3460, 3460);
    A.retouch.move(3560, 3530);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab());
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.retouch.setOpts({ patchAll: false });
    A.actions.run('select.none'); A.selectTool('brush');
    return { down, up, ms, changed, undone,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档修补「对所有图层取样」：${JSON.stringify(hugePatchAll)}`);
  if (!hugePatchAll.skipped && !(hugePatchAll.changed > 0 && hugePatchAll.undone === 0))
    lines.push('❌ 修补「对所有图层取样」未通过像素/撤销检查');

  const hugeRedEye = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('brush'); A.paint.setColors([255, 0, 0]);
    await A.paint.stroke([{ x: 3500, y: 3500 }, { x: 3500, y: 3500 }], { size: 60, hardness: 1, plain: true, noSel: true });
    await A.gpu.flush();
    A.selectTool('redEye'); A.retouch.setOpts({ pupilSize: 50, amount: 50 });
    const pp = A.paint.pixelPaint[0], rect = { x: 3450, y: 3450, w: 100, h: 100 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = () => pp.sparse.readRect(rect).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(3500, 3500);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab());
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.actions.run('edit.redo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const redone = count(before, await grab());
    A.selectTool('brush');
    return { down, up, ms, changed, undone, redone,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档红眼（分块 + 撤销/重做）：${JSON.stringify(hugeRedEye)}`);
  if (!hugeRedEye.skipped && !(hugeRedEye.down && hugeRedEye.up && hugeRedEye.changed > 0 && hugeRedEye.undone === 0 && hugeRedEye.redone > 0))
    lines.push('❌ 红眼分块路径未通过像素/撤销检查');

  const hugeMove = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]); A.selectTool('contentMove');
    A.retouch.setOpts({ size: 60, moveMode: 'move', structure: 4, color: 0, moveAll: false, transformOnDrop: false });
    A.sel.rect(4000, 4000, 150, 150, 'replace');
    await new Promise(r => setTimeout(r, 60));
    const pp = A.paint.pixelPaint[0], rect = { x: 3960, y: 3960, w: 520, h: 470 };
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = (r = rect) => pp.sparse.readRect(r).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const before = await grab();
    const t = performance.now();
    const down = A.retouch.down(4070, 4070);
    A.retouch.move(4150, 4130);
    A.retouch.move(4290, 4250);
    const up = await A.retouch.up();
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab());
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone = count(before, await grab());
    A.actions.run('edit.redo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const redone = count(before, await grab());


    A.retouch.setOpts({ transformOnDrop: true });
    A.sel.rect(3400, 3400, 160, 160, 'replace');
    await new Promise(r => setTimeout(r, 60));
    const r2 = { x: 3360, y: 3360, w: 700, h: 560 };
    const before2 = await grab(r2);
    const down2 = A.retouch.down(3460, 3460);
    A.retouch.move(3540, 3520);
    const up2 = await A.retouch.up();
    const pending = !!A.retouch.pending;
    A.retouch.setPending({ dx: 220, dy: 140 });
    const commit = await A.retouch.commitPending();
    await A.gpu.flush();
    const changed2 = count(before2, await grab(r2));
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone2 = count(before2, await grab(r2));

    A.retouch.setOpts({ moveAll: true, transformOnDrop: false });
    A.sel.rect(3400, 3400, 160, 160, 'replace');
    await new Promise(r => setTimeout(r, 60));
    const before3 = await grab(r2);
    const down3 = A.retouch.down(3460, 3460);
    A.retouch.move(3560, 3520);
    const up3 = await A.retouch.up();
    await A.gpu.flush();
    const changed3 = count(before3, await grab(r2));
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r => setTimeout(r, 120));
    const undone3 = count(before3, await grab(r2));
    A.retouch.setOpts({ moveAll: false, transformOnDrop: true });
    A.actions.run('select.none'); A.selectTool('brush');
    return { down, up, ms, changed, undone, redone, down2, up2, pending, commit, changed2, undone2,
      down3, up3, changed3, undone3,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档内容感知移动（分块 + 投影时变换 + 撤销）：${JSON.stringify(hugeMove)}`);
  if (!hugeMove.skipped && !(hugeMove.changed > 0 && hugeMove.undone === 0 && hugeMove.redone > 0 &&
    hugeMove.pending && hugeMove.commit && hugeMove.changed2 > 0 && hugeMove.undone2 === 0 &&
    hugeMove.up3 && hugeMove.changed3 > 0 && hugeMove.undone3 === 0))
    lines.push('❌ 内容感知移动分块路径未通过像素/撤销检查');

  const hugeClone = await page.evaluate(async () => {
    const A = window.__psd_editor;
    await A.lazy.brushOps();
    A.selectLayers([0]); A.selectTool('cloneStamp');
    A.paint.options.size = 90; A.paint.options.hardness = 1; A.paint.options.spacing = 0.25;
    A.brushOps.setOpts({ csSample: 'layer', csMode: 'norm', align: true, airbrush: false });
    A.brushOps.setSample(2300.5, 2300.5);
    const pp = A.paint.pixelPaint[0];
    if (!pp?.sparse) return { skipped: '图层不是稀疏像素' };
    const grab = r => pp.sparse.readRect(r).then(d => new Uint8ClampedArray(d));
    const count = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++; return n; };
    const rect = { x: 2040, y: 2240, w: 260, h: 220 };
    const before = await grab(rect);
    const t = performance.now();
    const r = await A.brushOps.stroke([[2100, 2300], [2180, 2350]], {});
    await A.gpu.flush();
    const ms = Math.round(performance.now() - t);
    const changed = count(before, await grab(rect));
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r2 => setTimeout(r2, 120));
    const undone = count(before, await grab(rect));
    A.actions.run('edit.redo'); await A.lastAction; await new Promise(r2 => setTimeout(r2, 120));
    const redone = count(before, await grab(rect));

    A.selectTool('patternStamp');
    const prect = { x: 2540, y: 2940, w: 280, h: 220 };
    const pbefore = await grab(prect);
    const pr = await A.brushOps.stroke([[2600, 3000], [2680, 3050]], {});
    await A.gpu.flush();
    const pchanged = count(pbefore, await grab(prect));
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r2 => setTimeout(r2, 120));
    const pundone = count(pbefore, await grab(prect));

    A.selectTool('cloneStamp');
    A.brushOps.setOpts({ csSample: 'all', csMode: 'norm', align: true });
    A.brushOps.setSample(2300.5, 5000.5);
    const arect = { x: 2040, y: 4940, w: 260, h: 220 };
    const abefore = await grab(arect);
    const ar = await A.brushOps.stroke([[2100, 5000], [2180, 5050]], {});
    await A.gpu.flush();
    const achanged = count(abefore, await grab(arect));
    A.actions.run('edit.undo'); await A.lastAction; await new Promise(r2 => setTimeout(r2, 120));
    const aundone = count(abefore, await grab(arect));
    A.brushOps.setOpts({ csSample: 'layer' });
    A.selectTool('brush');
    return { r, ms, changed, undone, redone, pr, pchanged, pundone, ar, achanged, aundone,
      patterns: A.brushOps.patterns().length, pattern: A.brushOps.patternImage(),
      cloneSample: A.brushOps.sample && { x: A.brushOps.sample.x, y: A.brushOps.sample.y },
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`超大文档仿制 / 图案图章（稀疏笔触 + 撤销）：${JSON.stringify(hugeClone)}`);
  if (!hugeClone.skipped && !(hugeClone.changed > 0 && hugeClone.undone === 0 && hugeClone.redone > 0 &&
    hugeClone.pchanged > 0 && hugeClone.pundone === 0 && hugeClone.achanged > 0 && hugeClone.aundone === 0))
    lines.push('❌ 仿制 / 图案图章稀疏路径未通过像素/撤销检查');

  const noSelFilter = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.actions.run('select.none');
    await new Promise(r => setTimeout(r, 50));
    await A.lazy.filters();
    const M = await import('/editor/app/16-filters-menu.js');
    const beforeTiles = A.paint.pixelPaint[0]?.sparse?.tiles?.size || 0;
    const t = performance.now();
    const ok = await M.applyFilterNow('solarize');
    return { ms: Math.round(performance.now() - t), ok, beforeTiles,
      afterTiles: A.paint.pixelPaint[0]?.sparse?.tiles?.size || 0,
      err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
  });
  lines.push(`无选区滤镜（只跑已画块）：${JSON.stringify(noSelFilter)}`);



  const vpBox = await page.locator('#viewport').boundingBox().catch(() => null);
  let rectSel = '未执行';
  if (vpBox) {
    const cx = vpBox.x + vpBox.width / 2, cy = vpBox.y + vpBox.height / 2;
    const toolInfo = await page.evaluate(() => {
      const A = window.__psd_editor; A.selectLayers([0]);
      const r = A.selectTool('marqueeRect');
      return { ret: String(r), active: !!document.querySelector('#toolSelRect')?.classList.contains('active') };
    });
    await page.mouse.move(cx - 40, cy - 40);
    await page.mouse.down();
    await page.mouse.move(cx - 10, cy - 10, { steps: 3 });
    await page.mouse.move(cx + 40, cy + 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const s1 = await page.evaluate(() => {
      const A = window.__psd_editor, s = A.state.selection;
      return { sel: !!s, bbox: s ? { x: s.x, y: s.y, w: s.width, h: s.height, sparse: !!s.data?.__virtual } : null,
        err: document.querySelector('#err')?.textContent || '' };
    });
    const flt = await page.evaluate(async () => {
      const A = window.__psd_editor;
      if (!A.state.selection) return { skipped: true };
      const t = performance.now();
      A.actions.run('filter.stylize.solarize');
      await A.lastAction;
      return { ms: Math.round(performance.now() - t), tiles: A.paint.pixelPaint[0]?.sparse?.tiles?.size || 0,
        err: document.querySelector('#err')?.textContent || '', notice: document.querySelector('#notice')?.textContent || '' };
    });
    rectSel = `工具=${JSON.stringify(toolInfo)} 选区=${JSON.stringify(s1)} 太阳化=${JSON.stringify(flt)}`;
    await page.evaluate(() => window.__psd_editor.actions.run('select.none'));
    await page.waitForTimeout(400);
  }
  lines.push(`拖框选区 + 滤镜：${rectSel}`);

  const selBrush = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]);
    A.selectTool('selectionBrush');
    A.sel.setSbOpts({ size: 1200, show: 'overlay' });
    A.actions.run('select.all');
    await new Promise(r => setTimeout(r, 80));
    const baseArea = A.sel.area();
    const t = performance.now();
    A.sel.sbDown(1200, 1200, { alt: true });
    for (let i = 1; i <= 12; i++) A.sel.sbMove(1200 + i * 120, 1200 + i * 80);
    A.sel.sbUp();
    await A.gpu.flush();
    const s = A.sel.current;
    const out = { ms: Math.round(performance.now() - t), baseArea, afterArea: A.sel.area(),
      far: A.sel.valueAt(5000, 30000), near: A.sel.valueAt(1200, 1200),
      sparse: !!s?.data?.__virtual, brushBase: !!s?.data?.__brushBase, tiles: s?.data?.__tiles?.size || 0,
      err: document.querySelector('#err')?.textContent || '' };
    A.actions.run('select.none');
    await new Promise(r => setTimeout(r, 50));
    A.selectTool('brush');
    return out;
  });
  lines.push(`选区画笔（全选底图减一笔）：${JSON.stringify(selBrush)}`);

  const textMask = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]);
    const started = await A.auxiliary.startTextMask({ x: 3000, y: 3000 }, false, 'replace');
    const ta = document.querySelector('#textMaskOverlay');
    if (!ta) return { started, missing: true };
    const t = performance.now();
    ta.value = '测试文字蒙版';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const s = A.sel.current;
    const out = { started, ms: Math.round(performance.now() - t),
      sel: s ? { x: s.x, y: s.y, w: s.width, h: s.height, area: A.sel.area() } : null,
      overlayGone: !document.querySelector('#textMaskOverlay'),
      err: document.querySelector('#err')?.textContent || '' };
    A.actions.run('select.none');
    await new Promise(r => setTimeout(r, 50));
    A.selectTool('brush');
    return out;
  });
  lines.push(`文字蒙版：${JSON.stringify(textMask)}`);

  const combineSel = await page.evaluate(async () => {
    const A = window.__psd_editor;
    A.selectLayers([0]);
    A.actions.run('select.all');
    await new Promise(r => setTimeout(r, 80));
    const t = performance.now();
    A.sel.rect(1000, 1000, 1000, 1000, 'subtract');
    const cut = A.sel.current;
    const out = { ms: Math.round(performance.now() - t), virtual: !!cut?.data?.__virtual, neg: !!cut?.data?.__neg,
      inside: A.sel.valueAt(1200, 1200), outside: A.sel.valueAt(5000, 30000),
      area: A.sel.area(), expected: A.state.docW * A.state.docH - 1e6,
      err: document.querySelector('#err')?.textContent || '' };
    A.sel.rect(10.5, 20.25, 8000, 8000, 'replace');
    const fr = A.sel.current;
    out.fractional = { virtual: !!fr?.data?.__virtual, area: Math.round(A.sel.area()), w: fr?.width, h: fr?.height,
      err: document.querySelector('#err')?.textContent || '' };
    A.actions.run('select.none');
    await new Promise(r => setTimeout(r, 50));
    return out;
  });
  lines.push(`全选减框 + 小数矩形：${JSON.stringify(combineSel)}`);

  const guards = await page.evaluate(async () => {
    const A = window.__psd_editor;
    const CLIP = await import('/editor/app/50-clipboard-merge-mask.js');
    const QM = await import('/editor/app/13-quickmask-apply-image.js');
    const err = () => document.querySelector('#err')?.textContent || '';
    const notice = () => document.querySelector('#notice')?.textContent || '';
    A.selectLayers([0]); A.actions.run('select.all');
    await new Promise(r => setTimeout(r, 80));
    A.actions.run('select.transform'); await new Promise(r => setTimeout(r, 80));
    const transformStarted = !!document.querySelector('.app')?.classList.contains('transforming');
    if (transformStarted) { A.actions.run('edit.freeTransform.cancel'); await new Promise(r => setTimeout(r, 80)); }
    A.actions.run('select.selectAndMask'); await new Promise(r => setTimeout(r, 350));
    const smOpen = !!document.querySelector('#selMaskDlg')?.open;
    document.querySelector('#smCancel')?.click(); await new Promise(r => setTimeout(r, 120));
    const sm = { open: smOpen, closed: !document.querySelector('#selMaskDlg')?.open, notice: notice(), err: err() };
    A.actions.run('select.colorRange'); await new Promise(r => setTimeout(r, 350));
    const crOpen = !!document.querySelector('.fp-dlg[open]');
    document.querySelector('.fp-dlg-cancel')?.click(); await new Promise(r => setTimeout(r, 120));
    const cr = { open: crOpen, closed: !document.querySelector('.fp-dlg[open]'), notice: notice(), err: err() };

    A.sel.rect(1000, 1000, 1500, 1500, 'replace'); await new Promise(r => setTimeout(r, 80));
    const copyOk = await CLIP.copyPixelsUI(true);
    const copy = { ok: copyOk, lazy: !!CLIP.pixelClipboard?.lazy, store: CLIP.pixelClipboard?.store?.type || null,
      notice: notice(), err: err() };
    A.actions.run('tool.quickMask'); await new Promise(r => setTimeout(r, 250));
    const qmEntered = !!QM.qmask, qmSel = A.state.selection ? { sparse: !!A.state.selection.data?.__virtual, tags: A.state.selection.data?.__tiles?.size || 0 } : null;
    A.actions.run('tool.quickMask'); await new Promise(r => setTimeout(r, 200));
    const qm = { entered: qmEntered, exited: !QM.qmask, sel: qmSel, notice: notice(), err: err() };
    A.actions.run('select.none'); await new Promise(r => setTimeout(r, 50));
    return { transformStarted, sm, cr, copy, qm };
  });
  lines.push(`超大文档能力（选择并遮住 / 色彩范围 / 磁盘剪贴板 / 快速蒙版）：${JSON.stringify(guards)}`);

  await step('缩放 50%', () => { const A = window.__psd_editor; const t = performance.now(); A.view.setZoom(0.5); return { ms: Math.round(performance.now() - t), zoom: A.view.zoom }; });
  await step('适应窗口', () => { const A = window.__psd_editor; const t = performance.now(); A.view.fit(); return { ms: Math.round(performance.now() - t), zoom: +A.view.zoom.toFixed(4) }; });
  await step('移动（微调 10px）', () => { const A = window.__psd_editor; const b0 = { ...A.getTransformValues(0) }; A.nudgeLayer(0, 10, 10); const b1 = { ...A.getTransformValues(0) }; return { from: b0, to: b1 }; });
  await step('旋转 30°', () => { const A = window.__psd_editor; A.actions.run('edit.freeTransform'); return { tf: !!A.tfFrame }; });
  await step('自由变换取消', () => { const A = window.__psd_editor; A.actions.run('edit.freeTransform.cancel'); return 'ok'; });

  await step('新建图层', async () => { const A = window.__psd_editor; const r = await A.actions.run('layer.new'); return { r: r === undefined ? 'void' : r }; }, 3000);
  await step('新图层画一笔', async () => {
    const A = window.__psd_editor; const t = performance.now();
    const r = await A.paint.stroke([{ x: 800, y: 800 }, { x: 900, y: 900 }], { size: 80, hardness: 1, plain: true, noSel: true });
    await A.gpu.flush();
    return { ms: Math.round(performance.now() - t), rect: r ? { w: r.width, h: r.height } : null };
  }, 1500);
  await step('再新建图层', async () => { const A = window.__psd_editor; await A.actions.run('layer.new'); return { paints: Object.entries(A.paint.pixelPaint).map(([k, p]) => [+k, p?.sparse?.tiles?.size || 0]) }; }, 3000);


  await step('切文字工具', () => { const A = window.__psd_editor; A.selectTool('typeH'); return { tool: A.tool?.() }; });
  let textInfo = '未执行';
  if (vpBox) {
    const cx = vpBox.x + vpBox.width / 2, cy = vpBox.y + vpBox.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(700);
    const afterClick = await snap();
    await page.keyboard.type('测试文字', { delay: 20 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
    const afterType = await snap();
    textInfo = `点击后层 ${afterClick.layers}（err="${afterClick.err}"）→ 输入后层 ${afterType.layers}（err="${afterType.err}"）`;
  }
  lines.push(`文字层：${textInfo}`);

  await step('移动（微调 10px，修复后）', () => {
    const A = window.__psd_editor; A.selectLayers([0]);
    const b0 = { ...A.getTransformValues(0) }; A.nudgeLayer(0, 10, 10); const b1 = { ...A.getTransformValues(0) };
    return { fromX: b0.x, toX: b1.x, moved: b0.x !== b1.x || b0.y !== b1.y, err: document.querySelector('#err')?.textContent || '' };
  });

  await step('高斯模糊（无选区）', () => { const A = window.__psd_editor; A.selectLayers([0]); return { enabled: A.actions.enabled('filter.blur.gaussian') }; });

  const allSel = await page.evaluate(() => {
    const A = window.__psd_editor;
    A.selectLayers([0]);
    const t = performance.now();
    try { A.actions.run('select.all'); } catch (e) { return { error: String(e.message || e).slice(0, 120) }; }
    return { ms: Math.round(performance.now() - t), sel: !!A.state.selection,
      w: A.state.selection?.width, h: A.state.selection?.height,
      sparse: !!A.state.selection?.data?.__virtual,
      enabled: Object.fromEntries(['filter.blur.gaussian', 'image.adjust.levels', 'image.adjust.brightnessContrast', 'edit.fill'].map(id => [id, A.actions.enabled(id)])) };
  });
  lines.push('全选后：' + JSON.stringify(allSel));

  const coreSel = await page.evaluate(async () => {
    const A = window.__psd_editor, d = A.state.doc;
    const out = {};
    try {
      const S = await import('/core/selection.js');
      const t0 = performance.now();
      const s1 = S.rectSelection(d.width, d.height, 0, 0, 2000, 2000);
      out.small = { w: s1.width, h: s1.height, len: s1.data.length, ms: Math.round(performance.now() - t0) };
      const t1 = performance.now();
      try { const s2 = S.rectSelection(d.width, d.height, 0, 0, d.width, d.height); out.full = { len: s2.data.length, ms: Math.round(performance.now() - t1) }; }
      catch (e) { out.full = { error: String(e.message || e).slice(0, 90) }; }
    } catch (e) { out.err = String(e.message || e).slice(0, 120); }
    return out;
  });
  lines.push('选区内核直测：' + JSON.stringify(coreSel));
  const perLayer = await page.evaluate(() => {
    const A = window.__psd_editor, n = A.state.doc.layers.length, out = [];
    for (let i = 0; i < n; i++) {
      A.selectLayers([i]);
      const l = A.state.doc.layers[i];
      out.push({ i, name: l.name, sparse: !!A.paint.pixelPaint[i]?.sparse, rgba: !!l.rgba, lazy: !!l.lazyRasterSource,
        blur: A.actions.enabled('filter.blur.gaussian'), levels: A.actions.enabled('image.adjust.levels'),
        fill: A.actions.enabled('edit.fill'), move: !!(A.actions.why ? '' : ''), text: !!A.state.layerTree?.flat?.[i]?.text });
    }
    return out;
  });
  lines.push('逐图层能力：' + JSON.stringify(perLayer));


  await step('删除中间图层', async () => {
    const A = window.__psd_editor; const n0 = A.state.doc.layers.length;
    const target = A.state.doc.layers.length > 1 ? 1 : 0;
    A.selectLayers([target]);
    const t = performance.now();
    await A.actions.run('layer.delete');
    return { target, ms: Math.round(performance.now() - t), before: n0, after: A.state.doc.layers.length,
      names: A.state.doc.layers.map(l => l.name), lazy: !!A.state.doc.layers[0]?.lazyRasterSource };
  }, 2500);
  await step('复制图层', async () => {
    const A = window.__psd_editor; A.selectLayers([0]);
    const n0 = A.state.doc.layers.length;
    const t = performance.now();
    await A.actions.run('layer.duplicate');
    return { ms: Math.round(performance.now() - t), before: n0, after: A.state.doc.layers.length };
  }, 2500);
  await step('全选 + 反相（原图层，瓦片通道）', async () => {
    const A = window.__psd_editor; A.selectLayers([0]); A.actions.run('select.all');
    await new Promise(r => setTimeout(r, 80));
    const t = performance.now();
    A.actions.run('image.adjust.invert');
    await A.lastAction;
    return { ms: Math.round(performance.now() - t),
      tiles: A.paint.pixelPaint[0]?.sparse?.tiles?.size || 0,
      err: document.querySelector('#err')?.textContent || '' };
  }, 3000);
  await step('框选后高斯模糊是否可用', () => {
    const A = window.__psd_editor; A.selectLayers([0]);
    return { blur: A.actions.enabled('filter.blur.gaussian'), sharpen: A.actions.enabled('filter.sharpen.sharpen'),
      levels: A.actions.enabled('image.adjust.levels'), fill: A.actions.enabled('edit.fill'),
      why: (A.actions.why ? A.actions.why('filter.blur.gaussian') : '') };
  });
  await step('混合选项', () => { const A = window.__psd_editor; return { enabled: A.actions.enabled('layer.style.blendingOptions') }; });

  const enabledList = await page.evaluate(() => {
    const A = window.__psd_editor; const out = [];
    for (const id of ['layer.new', 'edit.freeTransform', 'filter.blur.gaussian', 'filter.sharpen.sharpen', 'layer.style.blendingOptions', 'layer.duplicate', 'layer.rasterize', 'image.adjust.brightnessContrast', 'image.adjust.levels', 'edit.fill', 'edit.stroke'])
      { try { out.push([id, A.actions.enabled(id)]); } catch (e) { out.push([id, 'throw']); } }
    return out;
  });
  lines.push('动作可用性：' + enabledList.map(([id, ok]) => `${id}=${ok}`).join(' '));
  const whys = await page.evaluate(() => {
    const A = window.__psd_editor; const out = {};
    for (const id of ['filter.blur.gaussian', 'image.adjust.brightnessContrast', 'image.adjust.levels', 'edit.fill', 'edit.stroke', 'layer.rasterize']) {
      try { out[id] = { enabled: A.actions.enabled(id), why: (A.actions.why ? A.actions.why(id) : 'why() 不存在') || '' }; }
      catch (e) { out[id] = String(e.message || e).slice(0, 80); }
    }
    return out;
  });
  lines.push('禁用原因：' + JSON.stringify(whys, null, 0));

  const unexpected = errors.filter(e => !/PNG_GATE_REACHED/.test(e));
  if (unexpected.length) lines.push('页面错误：\n  ' + [...new Set(unexpected)].slice(0, 10).join('\n  '));
  console.log('\n━━━━ 实测结果 ━━━━');
  for (const l of lines) console.log(l);
} finally { await browser.close(); }
