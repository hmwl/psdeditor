

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright(); if (!PW) { console.log('跳过：没有 Playwright'); process.exit(0); }
const here = path.dirname(fileURLToPath(import.meta.url)), FX = path.join(here, 'fixtures/formats');
const port = process.argv[2] || process.env.PORT || 8789;
const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await PW.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/editor`); await page.waitForFunction(() => window.__psd_editor && window.__psd_editor.actions, null, { timeout: 60000 });
await page.evaluate(() => { window.__fpDialog = d => (d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : true); });
const cases = [['t_LZW.tif', 97, 61], ['t_tiled.tif', 97, 61], ['t_16zip.tif', 97, 61], ['t_cmyk.tif', 97, 61], ['t.tga', 97, 61], ['t_rle.tga', 97, 61], ['t.ppm', 97, 61], ['t.pam', 97, 61], ['t.ico', 48, 48],
  ['t.hdr', 97, 61], ['t_zip_half.exr', 97, 61], ['t_rle_float.exr', 97, 61], ['t.svg', 120, 80], ['t.pdf', null, null], ['t.dng', null, null], ['t.jxl', 97, 61]];
let fail = 0;
for (const [f, w, h] of cases) {
  await page.evaluate(() => { const s = window.__psd_editor.state; window.__prevDoc = s.doc; document.querySelector('#err').textContent = ''; });
  await page.setInputFiles('#file', path.join(FX, f));
  let r;
  try {
    await page.waitForFunction(() => { const s = window.__psd_editor.state; return (s.doc && s.doc !== window.__prevDoc) || document.querySelector('#err').textContent; }, null, { timeout: 60000 });
    r = await page.evaluate(() => { const s = window.__psd_editor.state; return { w: s.docW, h: s.docH, err: document.querySelector('#err').textContent, layers: s.doc && s.doc.layers.length, px: (() => { const l = s.doc && s.doc.layers[0]; return l && l.rgba ? Array.from(l.rgba.slice(0, 4)) : null; })() }; });
  } catch (e) { r = { err: 'timeout' }; }
  const ok = !r.err && (w == null || (r.w === w && r.h === h));
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', f.padEnd(18), JSON.stringify(r));
}
console.log(errs.length ? 'page errors: ' + errs.slice(0, 3).join(' | ') : '');
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
