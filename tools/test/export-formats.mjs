
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright(); if (!PW) { console.log('跳过：没有 Playwright'); process.exit(0); }
const here = path.dirname(fileURLToPath(import.meta.url)), FX = path.join(here, 'fixtures/formats');
const C = await import('../../core/formats/raster-codecs.js');
const port = process.argv[2] || process.env.PORT || 8789;
const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await PW.chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/editor`); await page.waitForFunction(() => window.__psd_editor && window.__psd_editor.actions, null, { timeout: 60000 });
await page.evaluate(() => { window.__fpDialog = d => (d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : true); });
await page.setInputFiles('#file', path.join(FX, 'base.png'));
await page.waitForFunction(() => window.__psd_editor.state.doc, null, { timeout: 60000 });
await page.waitForTimeout(800);
let fail = 0;
const inflate = async u => new Uint8Array(zlib.inflateSync(Buffer.from(u)));
for (const fmt of ['pdf', 'png8', 'gif', 'bmp', 'tga', 'ico', 'exr', 'hdr', 'ppm', 'pam', 'png', 'jpg']) {
  await page.evaluate(() => window.__psd_editor.actions.run('file.exportAs') || document.querySelector('#exportDlg').showModal());
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => document.querySelector('#exportDlg').open))) await page.evaluate(() => document.querySelector('#exportDlg').showModal());
  await page.selectOption('#exportFormat', fmt);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#exportOk')]);
  const p = await dl.path(), b = new Uint8Array(fs.readFileSync(p));
  let info = '', ok = b.length > 50;
  try {
    if (fmt === 'tga') { const d = C.decodeTGA(b); ok = d.width === 97 && d.height === 61; info = d.width + '×' + d.height; }
    else if (fmt === 'bmp') { ok = b[0] === 0x42 && new DataView(b.buffer).getInt32(18, true) === 97; info = 'BM'; }
    else if (fmt === 'ppm' || fmt === 'pam') { const d = C.decodePNM(b); ok = d.width === 97; info = d.width + '×' + d.height; }
    else if (fmt === 'exr') { const d = await C.decodeEXR(b, { inflate }); ok = d.width === 97 && d.height === 61; info = d.width + '×' + d.height + ' ' + d.channels.join(''); }
    else if (fmt === 'hdr') { const d = C.decodeHDR(b); ok = d.width === 97; info = d.width + '×' + d.height; }
    else if (fmt === 'ico') { const d = C.decodeICO(b); ok = d.length >= 3; info = d.map(x => x.width).join(','); }
    else if (fmt === 'gif') { ok = String.fromCharCode(...b.slice(0, 6)) === 'GIF89a'; info = 'GIF89a'; }
    else if (fmt === 'png8' || fmt === 'png') { ok = b[1] === 0x50 && b[2] === 0x4e; info = 'PNG colorType ' + b[25]; if (fmt === 'png8') ok = ok && b[25] === 3; }
    else if (fmt === 'pdf') { const t = new TextDecoder('latin1').decode(b); ok = t.startsWith('%PDF') && /FlateDecode/.test(t) && /SMask/.test(t); info = 'flate+smask'; }
    else if (fmt === 'jpg') { ok = b[0] === 0xff && b[1] === 0xd8; info = 'JPEG'; }
  } catch (e) { ok = false; info = 'ERR ' + e.message; }
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', fmt.padEnd(6), dl.suggestedFilename().padEnd(16), b.length, info);
}
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
