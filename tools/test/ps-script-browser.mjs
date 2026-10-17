

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright(); if (!PW) { console.log('跳过：没有 Playwright'); process.exit(0); }
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(here, '../..');
const port = process.argv[2] || process.env.PORT || 8789;
const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await PW.chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const errs = []; page.on('pageerror', e => errs.push(e.stack || e.message));
const downloads = []; page.on('download', d => downloads.push(d.suggestedFilename()));
await page.goto(`http://127.0.0.1:${port}/editor`); await page.waitForFunction(() => window.__psd_editor && window.__psd_editor.actions && window.__psd_editor.scripts, null, { timeout: 60000 });
const answers = [];
await page.exposeFunction('__dlgLog', s => answers.push(s));
await page.evaluate(() => { window.__fpDialog = d => { window.__dlgLog(JSON.stringify({ msg: d.msg, title: d.title })); return d.form ? Object.fromEntries((d.fields || []).filter(f => f.key).map(f => [f.key, f.value])) : d.input ? d.input.value + '!' : true; }; });
const psd = path.join(ROOT, 'tshirt.psd');
await page.setInputFiles('#file', psd);
await page.waitForFunction(() => window.__psd_editor.state.doc && window.__psd_editor.state.layerTree, null, { timeout: 60000 });
await page.waitForTimeout(500);
const run = (src, name = 't.jsx') => Promise.race([page.evaluate(([s, n]) => window.__psd_editor.scripts.run(s, n, { quiet: true }), [src, name]),
  new Promise(res => setTimeout(() => res({ ok: false, error: { message: '测试超时（60 秒）' }, log: '' }), 60000))]);
let fail = 0;
const check = (label, cond, extra) => { if (!cond) fail++; console.log(cond ? '✓' : '✗', label, cond ? '' : JSON.stringify(extra)); };


let r = await run(`var d = app.activeDocument; var out = [d.name, d.width.as('px'), d.height.as('px'), d.layers.length];
for (var i = 0; i < d.layers.length; i++) out.push(d.layers[i].name + ':' + d.layers[i].kind);
var ref = new ActionReference(); ref.putEnumerated(charIDToTypeID('Dcmn'), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
out.push(executeActionGet(ref).getInteger(stringIDToTypeID('numberOfLayers')));
$.writeln(out.join('|'));`);
check('读文档与图层', r.ok && /tshirt\.psd\|1200\|1200\|3\|无法无天:LayerKind\.TEXT\|img:LayerKind\.SMARTOBJECT\|背景:LayerKind\.NORMAL\|2/.test(r.log), r);


r = await run(`var d = app.activeDocument;
var t = d.layers.getByName('无法无天'); t.textItem.contents = '天天向上'; t.opacity = 80;
var img = d.layers.getByName('img'); img.visible = false; img.blendMode = BlendMode.SCREEN; img.name = '图片';
var l = d.artLayers.add(); l.name = '脚本新层';
d.activeLayer = d.layers.getByName('背景');
var desc = new ActionDescriptor(); desc.putUnitDouble(charIDToTypeID('Rds '), charIDToTypeID('#Pxl'), 3);
executeAction(charIDToTypeID('GsnB'), desc, DialogModes.NO);
img.translate(15, -5);
$.writeln(d.layers.length + ' ' + d.activeLayer.name + ' ' + img.name + ' ' + img.bounds[0].as('px'));`);
const st = await page.evaluate(() => { const F = window.__psd_editor, s = F.state; const info = F.scripts.info(); return { layers: info.doc.layers.map(l => [l.name, l.visible, l.opacity, l.blend, l.text && l.text.contents]), undo: s.docUndo, hist: F.historyEntries().items.map(x => x.label || x.name || x.title || String(x)) }; });
check('写属性 / 文字 / 新建 / 滤镜', r.ok && st.layers.some(l => l[0] === '脚本新层') && st.layers.some(l => l[0] === '图片' && l[1] === false && l[3] === 'scrn')
  && st.layers.some(l => l[4] === '天天向上' && l[2] === 80) && st.hist.some(h => /高斯模糊/.test(h)), { r, st });
check('移动后位置', r.ok && / 476$/.test(r.log.trim()), r.log);


r = await run('var a = 1;\nalert("你好");\nvar x = prompt("名字", "abc");\n$.writeln(x);\napp.activeDocument.layers.getByName("没有这层");');
check('报错行号 + 对话框', !r.ok && r.error.line === 5 && /没有名为/.test(r.error.message) && /abc!/.test(r.log) && answers.some(a => /你好/.test(a)), { r, answers });


r = await run(`const { app, core, action } = require('photoshop');
await core.executeAsModal(async () => {
  const doc = await app.createDocument({ width: 300, height: 200, name: '脚本文档' });
  const L = await doc.createLayer({ name: 'UXP 层' });
  L.opacity = 40;
  const got = await action.batchPlay([{ _obj: 'get', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }] }], {});
  console.log(app.documents.length, doc.width, got[0].name, got[0].opacity._value);
  await doc.saveAs.png({ name: 'uxp-out.png' });
});`, 'u.psjs');
await page.waitForTimeout(800);
check('UXP 新建 / batchPlay / 存储', r.ok && /^2 300 UXP 层 40/.test(r.log.trim()) && downloads.some(d => /uxp-out\.png$/.test(d)), { r, downloads });


r = await run(`var a = app.documents[0], b = app.documents[1]; app.activeDocument = a; $.writeln(app.activeDocument.name); b.close(SaveOptions.DONOTSAVECHANGES); $.writeln(app.documents.length);`);
check('切换 / 关闭文档', r.ok && /tshirt\.psd\s+1/.test(r.log), r);
r = await page.evaluate(() => window.__psd_editor.scripts.run('while (true) {}', 'loop.jsx', { quiet: true, timeoutMs: 800 }));
check('超时中止', !r.ok && /超过/.test(r.error.message), r);

console.log(errs.length ? 'page errors: ' + errs.slice(0, 3).join(' | ') : '');
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
