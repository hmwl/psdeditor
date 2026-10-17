








import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { runPsScript, preprocess, isUxpScript } = await import(path.join(ROOT, 'web/editor/ps-script.js'));
const { newQuickJSAsyncWASMModuleFromVariant } = await import('quickjs-emscripten-core');
const variant = (await import('@jitl/quickjs-wasmfile-release-asyncify')).default;
const quickjs = newQuickJSAsyncWASMModuleFromVariant(variant);


function mockHost() {
  let nextId = 10, nextUid = 2;
  const mkL = (name, o = {}) => ({ id: nextId++, name, kind: 'pixel', visible: true, opacity: 100, fillOpacity: 100, blend: 'norm', bounds: [0, 0, 100, 100], group: null, parent: null, ...o });
  const docs = [{ uid: 1, id: 1, name: '测试.psd', width: 800, height: 600, resolution: 72, mode: 3, depth: 8, dirty: false, hasBackground: true, selection: null,
    layers: [mkL('背景', { isBackground: true, bounds: [0, 0, 800, 600] }), mkL('图片', { bounds: [100, 50, 300, 250] }), mkL('标题', { kind: 'text', text: { contents: '原标题', size: 24, color: [10, 20, 30], position: [120, 80] } })], active: 2 }];
  let active = 0;
  const S = { ops: [], alerts: [], fg: [0, 0, 0], bg: [255, 255, 255], saved: [], written: [] };
  const D = () => docs[active];
  const fixParents = d => { const stack = []; for (let i = d.layers.length - 1; i >= 0; i--) { const L = d.layers[i]; if (L.group === 'end') { stack.pop(); continue; } L.parent = stack.length ? stack[stack.length - 1] : null; if (L.group === 'head') stack.push(i); } };
  const host = {
    S, docs,
    get(n, a) {
      if (n === 'info') return { docs: docs.map(d => ({ uid: d.uid, name: d.name, active: d === D() })), doc: D() ? { ...D(), index: active, layers: D().layers.map(l => ({ ...l })) } : null, fg: S.fg, bg: S.bg };
      if (n === 'readText') return { text: 'line1\nline2' };
      if (n === 'fileExists') return { exists: false };
      if (n === 'customOptions') return { value: null };
      throw new Error('get 不认识 ' + n);
    },
    async do(n, a) {
      S.ops.push([n, a]);
      const d = D();
      switch (n) {
        case 'setLayer': { const L = d.layers[a.i]; for (const k of ['name', 'visible', 'opacity', 'fillOpacity', 'blend']) if (a[k] !== undefined) L[k] = a[k]; if (a.text) L.text = { ...L.text, ...a.text }; return {}; }
        case 'selectLayer': d.active = a.i; return {};
        case 'translate': { const b = d.layers[a.i].bounds; d.layers[a.i].bounds = [b[0] + a.dx, b[1] + a.dy, b[2] + a.dx, b[3] + a.dy]; return {}; }
        case 'newLayer': { const at = a.inside != null ? a.inside : d.active + 1; d.layers.splice(at, 0, mkL(a.name || '图层 ' + d.layers.length)); fixParents(d); d.active = at; return { index: at }; }
        case 'newGroup': { const at = a.inside != null ? a.inside : d.active + 1; d.layers.splice(at, 0, mkL('</组>', { group: 'end' }), mkL(a.name || '组 1', { group: 'head' })); fixParents(d); d.active = at + 1; return { index: at + 1 }; }
        case 'deleteLayer': d.layers.splice(a.i, 1); d.active = Math.min(d.active, d.layers.length - 1); return {};
        case 'duplicateLayer': { const c = { ...d.layers[a.i], id: nextId++, name: d.layers[a.i].name + ' 拷贝' }; d.layers.splice(a.i + 1, 0, c); d.active = a.i + 1; return { index: a.i + 1 }; }
        case 'exec': if (a.event === 'slct') { const r = a.desc.null.__reference[0]; if (r.type === '__idx') d.active = r.index; } return { desc: { __name: '', __classID: 'null' } };
        case 'alert': S.alerts.push(a.message); return {};
        case 'confirm': return { value: true };
        case 'prompt': return { value: a.value + '!' };
        case 'color': S[a.which] = a.rgb; return {};
        case 'save': S.saved.push(a); return {};
        case 'writeText': S.written.push(a); return {};
        case 'newDocument': docs.push({ uid: nextUid++, id: nextUid, name: (a.name || '未标题') + '.psd', width: a.width, height: a.height, resolution: a.resolution, mode: 3, depth: 8, layers: [mkL('背景', { isBackground: true })], active: 0, hasBackground: true }); active = docs.length - 1; return { uid: D().uid };
        case 'activateDoc': active = docs.findIndex(x => x.uid === a.uid); return {};
        case 'closeDoc': docs.splice(docs.findIndex(x => x.uid === a.uid), 1); active = Math.max(0, docs.length - 1); return {};
        case 'sleep': await new Promise(r => setTimeout(r, a.ms)); return {};
        case 'pickFiles': return { files: [{ id: 7, name: 'a.txt' }] };
        default: return {};
      }
    },
  };
  return host;
}
const run = (src, o = {}) => runPsScript(src, { quickjs, host: o.host || mockHost(), ...o });
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };


{
  const host = mockHost();
  const r = await run(`#target photoshop
var doc = app.activeDocument;
$.writeln(doc.name + ' ' + doc.width.as('px') + 'x' + doc.height.value + ' layers=' + doc.layers.length);
var l = doc.artLayers.add(); l.name = '新层'; l.opacity = 50; l.blendMode = BlendMode.MULTIPLY;
$.writeln('active=' + doc.activeLayer.name + ' kind=' + l.kind + ' blend=' + l.blendMode);
var t = doc.layers.getByName('标题'); t.textItem.contents = 'Hello';
$.writeln('text=' + t.textItem.contents + ' size=' + t.textItem.size + ' color=' + t.textItem.color.rgb.hexValue);
doc.activeLayer = doc.layers.getByName('图片');
doc.activeLayer.translate(10, 20);
$.writeln('bounds=' + doc.activeLayer.bounds[0].value + ',' + doc.activeLayer.bounds[1].value);
var ref = new ActionReference(); ref.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
var d = executeActionGet(ref);
$.writeln('get=' + d.getString(charIDToTypeID('Nm  ')) + ' op=' + d.getUnitDoubleValue(stringIDToTypeID('opacity')) + ' id=' + d.getInteger(stringIDToTypeID('layerID')));
var desc = new ActionDescriptor(); desc.putUnitDouble(charIDToTypeID('Rds '), charIDToTypeID('#Pxl'), 4);
executeAction(charIDToTypeID('GsnB'), desc, DialogModes.NO);
var r2 = new ActionReference(); r2.putIdentifier(charIDToTypeID('Lyr '), d.getInteger(stringIDToTypeID('layerID')));
var s = new ActionDescriptor(); s.putReference(charIDToTypeID('null'), r2); executeAction(charIDToTypeID('slct'), s, DialogModes.NO);
doc.resizeImage(UnitValue(50, '%'));
var c = new SolidColor(); c.rgb.hexValue = 'FF8000'; app.foregroundColor = c;
var name = prompt('名字？', 'abc');
alert('done ' + name);
var u = new UnitValue('1 in'); $.writeln('in=' + u.as('px') + ' cm=' + u.as('cm').toFixed(2));
var str = desc.toStream(); var d2 = new ActionDescriptor(); d2.fromStream(str); $.writeln('round=' + d2.getUnitDoubleValue(charIDToTypeID('Rds ')) + ' ' + d2.isEqual(desc));
doc.saveAs(new File('~/out.jpg'), new JPEGSaveOptions(), true);
var f = new File('~/notes.txt'); f.open('w'); f.writeln('hi'); f.close();
doc.layers.length;`, { host, fileName: 't.jsx' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  ok(/测试\.psd 800x600 layers=3/.test(r.log), r.log);
  ok(/active=新层 kind=LayerKind\.NORMAL blend=BlendMode\.MULTIPLY/.test(r.log), r.log);
  ok(/text=Hello size=24 color=0A141E/.test(r.log), r.log);
  ok(/bounds=110,70/.test(r.log), r.log);
  ok(/get=图片 op=100 id=11/.test(r.log), r.log);
  ok(/in=72 cm=2\.54/.test(r.log), r.log);
  ok(/round=4 true/.test(r.log), r.log);
  const ops = host.S.ops.map(o => o[0]);
  ok(ops.includes('newLayer') && ops.includes('translate'), ops.join(','));
  const ex = host.S.ops.filter(o => o[0] === 'exec').map(o => o[1]);
  ok(ex[0].event === 'GsnB' && ex[0].desc['Rds '].__unit === '#Pxl' && ex[0].desc['Rds '].value === 4, JSON.stringify(ex[0]));
  ok(ex[1].event === 'slct' && ex[1].desc.null.__reference[0].type === '__idx' && ex[1].desc.null.__reference[0].index === 1, JSON.stringify(ex[1]));
  ok(ex[2].event === 'ImgS' && ex[2].desc.Wdth.value === 400 && ex[2].desc.Hght.value === 300, JSON.stringify(ex[2]));
  ok(host.S.fg.join() === '255,128,0', host.S.fg);
  ok(host.S.alerts[0] === 'done abc!', host.S.alerts);
  ok(host.S.saved[0].format === 'jpg' && host.S.saved[0].quality === 83, JSON.stringify(host.S.saved));
  ok(host.S.written[0].name === 'notes.txt' && host.S.written[0].text === 'hi\n', JSON.stringify(host.S.written));
  ok(r.value === 4, 'value ' + r.value);
  const L = host.docs[0].layers;
  ok(L[3].name === '新层' && L[3].opacity === 50 && L[3].blend === 'mul ' && L[2].text.contents === 'Hello', JSON.stringify(L.map(x => x.name)));
}

{
  const r = await run(`var doc = app.activeDocument;
var g = doc.layerSets.add(); g.name = '组A';
var inner = g.artLayers.add(); inner.name = '里面';
$.writeln('top=' + doc.layers.length + ' sets=' + doc.layerSets.length + ' in=' + g.layers.length + ' parent=' + inner.parent.name);
var p = doc.layers.getByName('图片'); p.remove();
try { p.name; } catch (e) { $.writeln('gone ' + e.message); }`);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  ok(/sets=1/.test(r.log) && /parent=组A/.test(r.log) && /gone 图层「图片」已经不在了/.test(r.log), r.log);
}

{
  const r = await run('var a = 1;\nvar b = 2;\nnull.x;\n', { fileName: 'bad.jsx' });
  ok(!r.ok && r.error.line === 3, JSON.stringify(r.error));
  const r2 = await run('#include "lib.jsx"\n$.writeln(add(2, 3));', { includes: { 'lib.jsx': 'function add(a, b) {\n return a + b;\n}' } });
  ok(r2.ok && r2.log.trim() === '5', JSON.stringify(r2));
  const r3 = await run('#include "missing.jsx"\n');
  ok(!r3.ok && /missing\.jsx/.test(r3.error.message), JSON.stringify(r3.error));
  const r4 = await run('while (true) {}', { timeoutMs: 300 });
  ok(!r4.ok && /超过/.test(r4.error.message), JSON.stringify(r4.error));
  const r5 = await run('app.activeDocument.layers.getByName("没有");');
  ok(!r5.ok && /没有名为「没有」/.test(r5.error.message), JSON.stringify(r5.error));
  ok(preprocess('#target photoshop\n//@include "x"\nfoo()', { x: 'bar()' }) === '\nbar()\nfoo()', JSON.stringify(preprocess('#target photoshop\n//@include "x"\nfoo()', { x: 'bar()' })));
  ok(isUxpScript("const { app } = require('photoshop');") && isUxpScript('x', 'a.psjs') && !isUxpScript('app.activeDocument'), 'isUxp');
}

{
  const host = mockHost();
  const r = await run(`const { app, core, action, constants } = require('photoshop');
await core.executeAsModal(async () => {
  const doc = app.activeDocument;
  const L = await doc.createLayer({ name: 'U' });
  L.opacity = 30;
  L.blendMode = constants.BlendMode.SCREEN;
  const r = await action.batchPlay([
    { _obj: 'get', _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }] },
    { _obj: 'gaussianBlur', radius: { _unit: 'pixelsUnit', _value: 3 } },
  ], {});
  console.log('got', r[0].name, r[0].opacity._value, doc.layers.length, L.bounds.width);
  await app.showAlert('hi');
}, { commandName: 'test' });
'end';`, { host, fileName: 'u.psjs' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  ok(/got U 30 4 100/.test(r.log), r.log);
  const ex = host.S.ops.filter(o => o[0] === 'exec').map(o => o[1]);
  ok(ex.length === 1 && ex[0].event === 'GsnB' && ex[0].desc['Rds '].__unit === '#Pxl', JSON.stringify(ex));
  ok(host.docs[0].layers[3].blend === 'scrn' && host.S.alerts[0] === 'hi', JSON.stringify(host.docs[0].layers[3]));
  ok(r.value === undefined, 'uxp value');
  const r2 = await run(`const { app } = require('photoshop'); await new Promise(() => {});`);
  ok(!r2.ok && /永远不会完成/.test(r2.error.message), JSON.stringify(r2.error));
  const r3 = await run(`const ps = require('photoshop'); await ps.app.activeDocument.createLayer({ name: 'x' }); throw new Error('坏了');`);
  ok(!r3.ok && /坏了/.test(r3.error.message), JSON.stringify(r3.error));
}
for (const method of ['addNotificationListener', 'removeNotificationListener', 'validateReference']) {
  const r = await run(`const {action}=require('photoshop'); await action.${method}([],()=>{});`, { fileName: 'unsupported.psjs' });
  ok(!r.ok && r.error.message.includes(method), JSON.stringify(r));
}
console.log(`ps-script ✓ ${n} 项`);
