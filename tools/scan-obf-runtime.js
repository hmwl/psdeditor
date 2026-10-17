





















import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { obfOptions } from './scan-obf-options.js';
import { buildPageChunks, assertResolvable, relativeSpecifiers } from './build-chunks.js';

const ROOT = path.join(import.meta.dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
let esbuild, JSDOM, JavaScriptObfuscator;
try {
  esbuild = await import('esbuild');
  ({ default: JavaScriptObfuscator } = await import('javascript-obfuscator'));
  ({ JSDOM } = require('jsdom'));
} catch { console.log('ℹ 缺少 esbuild / jsdom / javascript-obfuscator（仓库根 npm ci），跳过'); process.exit(0); }
if (!fs.existsSync(path.join(ROOT, 'tshirt.psd'))) { console.log('ℹ 无 tshirt.psd，跳过'); process.exit(0); }


const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
const entry = path.join(ROOT, 'web', 'editor', 'main.js');
const OUT = path.join(ROOT, 'web', '.obf-runtime-dist');
const built = await buildPageChunks({ esbuild, entryFile: entry, outdir: OUT, dev: true });

const t0 = Date.now();
const obfFiles = new Map();
for (const [name, code] of built.files) obfFiles.set(name, JavaScriptObfuscator.obfuscate(code, obfOptions(false)).getObfuscatedCode());
const obfMs = Date.now() - t0;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [name, code] of obfFiles) fs.writeFileSync(path.join(OUT, name), code);
const entryPath = path.join(OUT, built.entry);

let fail = 0; const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fail++; };
const kb = n => (n / 1024).toFixed(0);
const preSum = [...built.files.values()].reduce((a, t) => a + t.length, 0);
const obfSum = [...obfFiles.values()].reduce((a, t) => a + t.length, 0);
const eagerPre = [...built.eager].reduce((a, n) => a + built.files.get(n).length, 0);
console.log(`分割成 ${obfFiles.size} 个 chunk：混淆后合计 ${kb(obfSum)} KB（混淆前 ${kb(preSum)} KB，${obfMs}ms）`);
for (const [name, code] of obfFiles)
  console.log(`  ${built.eager.has(name) ? '首屏' : '按需'} ${name.padEnd(30)} ${kb(built.files.get(name).length).padStart(4)} KB → ${kb(code.length).padStart(4)} KB`);
console.log(`  首屏 ${kb(eagerPre)} KB / 全量 ${kb(preSum)} KB（minify 口径）`);


assertResolvable(built.files);
ok([...built.files.keys()].every(n => fs.existsSync(path.join(OUT, n))), `混淆后的 ${obfFiles.size} 个 chunk 全部落盘`);
ok(built.eager.size >= 1 && built.eager.size < obfFiles.size, `首屏只需要 ${built.eager.size} 个 chunk，其余 ${obfFiles.size - built.eager.size} 个是懒加载的`);
{
  



  const specsAfterObf = [...obfFiles.values()].flatMap(relativeSpecifiers);
  const known = new Set(built.files.keys());
  ok(specsAfterObf.length > 0 && specsAfterObf.every(s => known.has(s)),
     `混淆后静态 import 的说明符原样保留：${specsAfterObf.length} 处，全部指向本次产物`);
}


const PORT = 19500 + Math.floor(Math.random() * 400);
const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')],
  { env: { ...process.env, PORT: String(PORT), PSD_EDITOR_DEV: '1', PSD_EDITOR_AUTH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
process.on('exit', () => child.kill());
for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${PORT}/health`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }


const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { url: `http://127.0.0.1:${PORT}/`, pretendToBeVisual: true });
const w = dom.window;
const ctxProxy = (cv) => new Proxy({}, { get: (_, k) => {
  if (k === 'canvas') return cv;
  if (k === 'getImageData') return (x, y, ww, hh) => ({ data: new Uint8ClampedArray(Math.max(1, ww * hh) * 4), width: ww, height: hh });
  if (k === 'createImageData') return (ww, hh) => ({ data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh });
  if (k === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
  return () => {};
}, set: () => true });
w.HTMLCanvasElement.prototype.getContext = function (t) { return t === '2d' ? ctxProxy(this) : null; };
w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob([new Uint8Array(8)], { type: 'image/png' })); };
w.OffscreenCanvas = class { constructor(w0, h0) { this.width = w0; this.height = h0; } getContext(t) { return t === '2d' ? ctxProxy(this) : null; } transferToImageBitmap() { return {}; } };
globalThis.OffscreenCanvas = w.OffscreenCanvas;
w.createImageBitmap = async () => ({ width: 1, height: 1, close() {} }); globalThis.createImageBitmap = w.createImageBitmap;
w.ImageData = class { constructor(a, b, c) { if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c; } else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } } };
globalThis.ImageData = w.ImageData;
w.__PSD_EDITOR_DEV__ = true;
w.requestAnimationFrame = cb => setTimeout(cb, 0);
w.ResizeObserver = class { observe() {} disconnect() {} };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};


w.Image = class {
  constructor() { this.width = this.height = this.naturalWidth = this.naturalHeight = 1; this.onload = this.onerror = null; }
  set src(v) { this._src = v; setTimeout(() => this.onload?.(), 0); }
  get src() { return this._src; }
  addEventListener(type, fn) { if (type === 'load') this.onload = fn; else if (type === 'error') this.onerror = fn; }
  removeEventListener() {}
  decode() { return Promise.resolve(); }
};
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Image', 'Blob', 'File', 'FileReader', 'FormData', 'DOMParser', 'Node', 'Element', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'getComputedStyle', 'requestAnimationFrame', 'ResizeObserver', 'localStorage', 'location', 'history', 'matchMedia', 'devicePixelRatio', 'FontFace', 'DecompressionStream']) {
  try { if (!(k in globalThis) || k === 'URL') Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch {}
}
globalThis.__PSD_EDITOR_DEV__ = true;
for (const k of ['addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[k] = (...a) => w[k](...a);
for (const k of ['innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'devicePixelRatio']) if (!(k in globalThis)) Object.defineProperty(globalThis, k, { get: () => w[k], configurable: true });
for (const k of Object.getOwnPropertyNames(w)) { if (k in globalThis) continue; try { Object.defineProperty(globalThis, k, { get: () => w[k], configurable: true }); } catch {} }
globalThis.URL.createObjectURL = () => 'blob:stub'; globalThis.URL.revokeObjectURL = () => {};
const realFetch = globalThis.fetch;
globalThis.fetch = (u, init) => realFetch(typeof u === 'string' && !/^https?:/.test(u) ? `http://127.0.0.1:${PORT}/` + u : u, init);
w.fetch = globalThis.fetch;
w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {} }));
if (!w.document.fonts) w.document.fonts = { check: () => true, load: async () => [] };


try {
  const t = Date.now();
  await import(pathToFileURL(entryPath).href);
  ok(true, `混淆后的入口 chunk 能求值并初始化（${Date.now() - t}ms）`);
  const fp = w.__psd_editor;
  ok(fp && typeof fp.initDocument === 'function', 'window.__psd_editor 钩子仍在（混淆没吃掉导出）');
  ok(fp.lazy && !fp.lazy.status.edit.ready && !fp.lazy.status.adjust.ready && !fp.lazy.status.selection.ready,
     '首屏只求值了入口 + 共享 chunk：三个按需 chunk 一个都没被拉起来');
  const buf = fs.readFileSync(path.join(ROOT, 'tshirt.psd'));
  await fp.initDocument(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'tshirt.psd', { nested: false });
  const st = fp.state;
  ok(st.sos.length === 1 && st.sos[0].info?.layerInfo?.points.length === 16, '混淆后仍能解析 PSD 并走通 /api/so/resolve');
  ok(!w.document.querySelector('#err').textContent, '无错误提示：' + w.document.querySelector('#err').textContent);
  try { await fp.doSelectSO(0); } catch {  }
  ok(fp.state.li?.xn === 4, '选中智能对象后 li 正常（xn=' + fp.state.li?.xn + '）');

  


  await new Promise(r => setTimeout(r, 50));            
  ok(fp.lazy.status.edit.tries >= 1, `打开 PSD 后编辑层被预取（tries=${fp.lazy.status.edit.tries}）`);
  ok(fp.lazy.status.selection.tries === 0, '选区 chunk 没被预取（它等的是「切到选区工具」）');

  const em = await fp.lazy.edit();
  const fxKinds = Object.keys(em.listCreatableEffects()).length;
  ok(typeof em.applyEdits === 'function' && typeof em.planEdits === 'function' && fxKinds >= 10,
     `编辑层 chunk 混淆后能被动态 import 并执行：listCreatableEffects() → ${fxKinds} 种效果`);
  
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  ok(em.planEdits(ab, []).ok === true, '编辑层的 planEdits 在混淆后仍能解析文档（空队列 → ok）');
  const bad = em.planEdits(ab, [{ op: 'setLayerColorLabel', index: 99999, color: 1 }]);
  ok(bad.ok === false && bad.errors.length > 0, '并且仍能拦下不合法的 op：' + (bad.errors[0] && bad.errors[0].message));

  const am = await fp.lazy.adjust();
  ok(Object.keys(am.listAdjustments()).length >= 13, `图像调整 chunk 可用：listAdjustments() → ${Object.keys(am.listAdjustments()).length} 种`);
  ok(fp.adjust.types().length === 13, '面板拿到的调整清单也补齐了（懒加载回填了 ADJ_ALL）：' + fp.adjust.types().length + ' 种');

  
  
  try { fp.exitSO(); } catch {}
  try { fp.setDocTool('selRect'); } catch {}
  ok(fp.lazy.status.selection.tries === 1, '切到矩形选框 → 选区 chunk 被拉起来（tries=1）');
  await fp.lazy.selection();
  fp.sel.rect(4, 6, 20, 12, 'replace', { antialias: false });
  const b = fp.sel.bounds();
  ok(b && b.x === 4 && b.y === 6 && b.width === 20 && b.height === 12,
     '混淆后的选区 chunk 算出的选区正确：' + JSON.stringify(b));
  fp.sel.none();
  fp.setDocTool('move');
  ok(fp.lazy.status.edit.tries === 1 && fp.lazy.status.adjust.tries === 1 && fp.lazy.status.selection.tries === 1,
     '每个 chunk 都只拉了一次（load 幂等，预取与真正使用不会重复请求）');
} catch (e) { ok(false, '异常：' + e.stack); }
finally { fs.rmSync(OUT, { recursive: true, force: true }); child.kill(); }
if (fail) console.log(log.split('\n').slice(-15).join('\n'));
console.log(fail ? `失败 ${fail}` : '混淆后的整组 chunk 运行时冒烟通过（含懒加载）');
process.exit(fail ? 1 : 0);
