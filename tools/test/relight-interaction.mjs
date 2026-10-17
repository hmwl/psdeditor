

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
assert.ok(PW, 'Playwright is required');
const photo = process.env.PSD_EDITOR_RELIGHT_PHOTO;
assert.ok(photo && fs.existsSync(photo), 'Set PSD_EDITOR_RELIGHT_PHOTO');
const origin = `http://127.0.0.1:${process.argv[2] || 8796}`;
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--enable-unsafe-webgpu'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/editor');
  await page.waitForFunction(() => window.__psd_editor?.actions);
  await page.evaluate(() => { window.__fpDialog = d => d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : true; });
  await page.setInputFiles('#file', photo);
  await page.waitForFunction(() => window.__psd_editor.state.doc?.layers.length && window.__psd_editor.state.selLayer >= 0 && window.__psd_editor.actions.enabled('ai.relight'));
  await page.evaluate(() => window.__psd_editor.actions.run('ai.relight'));
  await page.locator('.relight-dlg').waitFor({ state: 'visible', timeout: 15000 });
  console.log('真实照片打光弹窗已打开，等待首次预览');
  await page.waitForFunction(() => { const d = document.querySelector('.relight-dlg'); return d?.dataset.ready === 'true' || d?.dataset.phase === 'error'; }, null, { timeout: 240000 });
  const dialog = page.locator('.relight-dlg');
  assert.notEqual(await dialog.getAttribute('data-phase'), 'error', await dialog.locator('[data-relight-status]').textContent());
  assert.equal(await dialog.locator('[data-relight-view]').inputValue(), 'result');
  await dialog.getByLabel('显示光源', { exact: true }).uncheck();
  const bench = await page.evaluate(async () => {
    const d = document.querySelector('.relight-dlg'), canvas = d.querySelector('[data-relight-canvas]'), frames = [];
    const hash = () => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let value = 2166136261;
      for (let i = 0; i < data.length; i += 7919) value = Math.imul(value ^ data[i], 16777619); return value >>> 0; };
    const observer = new MutationObserver(records => { if (records.some(r => r.attributeName === 'data-preview-frames')) requestAnimationFrame(() => {
      frames.push({ at: performance.now(), ms: Number(d.dataset.previewMs), quality: d.dataset.previewQuality, hash: hash() });
    }); });
    observer.observe(d, { attributes: true, attributeFilter: ['data-preview-frames'] });
    const input = d.querySelector('input[type=range][aria-label="水平位置"]');
    const started = performance.now(), initialFrames = Number(d.dataset.previewFrames || 0);
    for (let i = 0; i < 120; i++) {
      input.value = String(-100 + Math.round(180 * i / 119)); input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    const beforeRelease = frames.filter(f => f.quality === 'drag'), framesBeforeChange = Number(d.dataset.previewFrames) - initialFrames;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const deadline = performance.now() + 30000;
    while ((d.dataset.previewQuality !== 'idle' || Number(d.dataset.previewRevision) < 120) && performance.now() < deadline) await new Promise(r => setTimeout(r, 16));
    observer.disconnect();
    const times = beforeRelease.map(f => f.ms).sort((a, b) => a - b), duration = beforeRelease.length > 1 ? beforeRelease.at(-1).at - beforeRelease[0].at : 0;
    return { renderer: d.dataset.renderer, source: [window.__psd_editor.state.doc.width, window.__psd_editor.state.doc.height], framesBeforeRelease: beforeRelease.length,
      framesBeforeChange, distinctImageHashes: new Set(beforeRelease.map(f => f.hash)).size, measuredFps: duration > 0 ? (beforeRelease.length - 1) * 1000 / duration : 0,
      requestP50Ms: times[Math.floor(times.length * 0.5)], requestP95Ms: times[Math.floor(times.length * 0.95)],
      totalMs: Math.round(performance.now() - started), settledQuality: d.dataset.previewQuality, frames: beforeRelease };
  });
  assert.ok(bench.framesBeforeRelease >= 2 && bench.distinctImageHashes >= 2, 'Image must update repeatedly before slider change/mouse release');
  assert.equal(bench.settledQuality, 'idle'); assert.deepEqual(errors, []);
  await dialog.locator('[data-relight-cancel]').click();
  if (process.env.PSD_EDITOR_RELIGHT_PROOF_DIR) { const dir = path.resolve(process.env.PSD_EDITOR_RELIGHT_PROOF_DIR); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'interaction.json'), JSON.stringify(bench, null, 2)); }
  console.log('✓ 真实照片持续拖动中更新；结束后清晰预览', JSON.stringify({ ...bench, frames: undefined }));
} finally { await browser.close(); }
