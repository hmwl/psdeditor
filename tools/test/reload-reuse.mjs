



import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright(); if (!PW) { console.log('跳过：没有 Playwright'); process.exit(0); }
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(here, '../..');
const port = process.argv[2] || process.env.PORT || 8789;


const { createPsd } = await import(ROOT + '/core/psd-new.js');
const { applyEdits } = await import(ROOT + '/core/psd-edit.js');
const W = 640, H = 420;
const px = (w, h, f) => { const d = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4, v = f(x, y); d[q] = v[0]; d[q + 1] = v[1]; d[q + 2] = v[2]; d[q + 3] = v[3]; } return d; };
let ab = createPsd({ width: W, height: H, background: 'white', name: 'reuse' });
ab = applyEdits(ab, [
  { op: 'createLayer', at: 1, name: 'A' }, { op: 'replaceLayerPixels', index: 1, rgba: { data: px(W, H, (x, y) => [x & 255, y & 255, (x ^ y) & 255, 255]), width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } },
  { op: 'createLayer', at: 2, name: 'B' }, { op: 'replaceLayerPixels', index: 2, rgba: { data: px(300, 200, (x, y) => [200, (x * 3) & 255, 80, (y * 2) & 255]), width: 300, height: 200 }, bounds: { top: 100, left: 150, bottom: 300, right: 450 } },
  { op: 'createLayer', at: 3, name: 'C' }, { op: 'replaceLayerPixels', index: 3, rgba: { data: px(W, H, (x, y) => [40, 90, (x + y) & 255, 160]), width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } },
  { op: 'addLayerMask', index: 3, gray: { data: px(W, H, x => [x & 255, 0, 0, 0]).filter((_, i) => i % 4 === 0), width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } },
]).buffer;
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fpsd-reuse-')), 'reuse.psd');
fs.writeFileSync(file, new Uint8Array(ab));

const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await PW.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/editor`); await page.waitForFunction(() => window.__psd_editor && window.__psd_editor.actions, null, { timeout: 60000 });
await page.evaluate(() => { window.__fpDialog = d => (d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : true); });
await page.setInputFiles('#file', file);
await page.waitForFunction(() => window.__psd_editor.state.doc && window.__psd_editor.state.layerTree, null, { timeout: 60000 });
await page.waitForTimeout(500);

let fail = 0;
const check = async label => {
  const r = await page.evaluate(async () => {
    const { parsePsdRaster } = await import('/core/psd-raster.js');
    const s = window.__psd_editor.state;
    const fresh = await parsePsdRaster(s.origBuffer, { keepPlanes: 'mask', strictChannels: false });
    const out = [];
    s.doc.layers.forEach((l, i) => {
      const f = fresh.layers[i];
      if (!f) { out.push(`层 ${i} 在文件里没有`); return; }
      const a = l.rgba, b = f.rgba;
      if (!a && !b) return;
      if (!a || !b || a.length !== b.length) { out.push(`层 ${i}「${l.name}」长度 ${a && a.length} vs ${b && b.length}`); return; }
      let d = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) d++;
      if (d) out.push(`层 ${i}「${l.name}」差 ${d} 字节`);
    });
    return { n: s.doc.layers.length, out };
  });
  const ok = !r.out.length;
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', label, `（${r.n} 层）`, ok ? '' : r.out.join('；'));
};
const stroke = (i, pts) => page.evaluate(([i, pts]) => { window.__psd_editor.selectLayers([i]); window.__psd_editor.actions.run('tool.key.B'); return window.__psd_editor.paint.stroke(pts); }, [i, pts]);
const run = id => page.evaluate(async id => { const s0 = window.__psd_editor.state.doc; await window.__psd_editor.actions.run(id); for (let k = 0; k < 500 && window.__psd_editor.state.doc === s0; k++) await new Promise(r => setTimeout(r, 10)); await new Promise(r => setTimeout(r, 50)); }, id);

await check('打开');
await stroke(1, [{ x: 50, y: 50 }, { x: 300, y: 200 }]);
await run('layer.new'); await check('画一笔 → 新建图层');
await stroke(1, [{ x: 400, y: 60 }, { x: 500, y: 300 }]);
await stroke(2, [{ x: 160, y: 120 }, { x: 420, y: 280 }]);           
await run('layer.new'); await check('再画两层 → 新建图层');
await stroke(4, [{ x: 100, y: 300 }, { x: 600, y: 100 }]);            
await page.evaluate(() => window.__psd_editor.selectLayers([1, 2]));
await run('layer.group'); await check('画带蒙版的层 → 编组');
await page.evaluate(() => window.__psd_editor.selectLayers([1]));
await run('layer.duplicate'); await page.waitForTimeout(300); await check('复制图层');
await run('edit.undo'); await page.waitForTimeout(200); await check('撤销');

console.log(errs.length ? 'page errors: ' + errs.slice(0, 3).join(' | ') : '');
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
