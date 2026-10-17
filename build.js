





























import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { collectForbidden, scanChunkSet, scriptTextOf, selfTest } from './tools/scan-private.js';
import { obfOptions } from './tools/scan-obf-options.js';
import { buildPageChunks, assertResolvable } from './tools/build-chunks.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'web');
const DIST = path.join(WEB, 'dist');
const ENGINE_OUT = path.join(ROOT, 'server', 'engine', 'engine.js');
const checkOnly = process.argv.includes('--check');
const fast = process.argv.includes('--fast');


const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const SCRIPT_TAG = '<script type="module" src="editor/main.js"></script>';
const CSS_TAG = '<link rel="stylesheet" href="editor/editor.css">\n<link rel="stylesheet" href="editor/ps-shell.css">';
if (!html.includes(SCRIPT_TAG)) throw new Error('web/index.html 里找不到 ' + SCRIPT_TAG);
if (!html.includes(CSS_TAG)) throw new Error('web/index.html 里找不到 ' + CSS_TAG);
const editorEntry = path.join(WEB, 'editor', 'main.js');

const editorCss = ['editor.css', 'ps-shell.css'].map(f => fs.readFileSync(path.join(WEB, 'editor', f), 'utf8')).join('\n');


const page0 = await buildPageChunks({ esbuild, entryFile: editorEntry, outdir: path.join(WEB, '.dist-tmp'), dev: false });
  
const engineJs = (await esbuild.build({
    entryPoints: [path.join(ROOT, 'core', 'engine.js')], bundle: true, format: 'esm', target: ['es2022'],
    platform: 'browser', write: false, minify: true, legalComments: 'none', charset: 'utf8',
    logLevel: 'silent', external: ['node:*'],
    define: { 'globalThis.__PSD_EDITOR_DEV__': 'false', 'window.__PSD_EDITOR_DEV__': 'false' }
  })).outputFiles[0].text;

const preObf = page0.files;            
const appEntry = page0.entry;          
const appJs = preObf.get(appEntry);    























const obf = (code, strong) => fast ? code : JavaScriptObfuscator.obfuscate(code, obfOptions(strong)).getObfuscatedCode();






const NO_OBF = new Set(['ps-icons']);
const chunkOut = new Map();            
for (const [name, code] of preObf) {
  chunkOut.set(name, NO_OBF.has(page0.labels.get(name)) ? code : obf(code, false));
}
const engineOut = obf(engineJs, true);



if (!fast) for (const [name, code] of [...chunkOut, ['engine.js', engineOut]]) {
  try { await esbuild.transform(code, { loader: 'js', format: 'esm', logLevel: 'silent' }); }
  catch (e) { throw new Error(`${name} 混淆后语法不合法：${e.message}（请下调 build.js 的混淆档位）`); }
}

const resolveStat = assertResolvable(preObf);








const cssMin = fast ? editorCss
  : (await esbuild.transform(editorCss, { loader: 'css', minify: true, charset: 'utf8', logLevel: 'silent' })).code;


const stripHtmlComments = s => s.replace(/<!--(?!\[if)[\s\S]*?-->\s*/g, '');
let page = stripHtmlComments(html.replace(/<script id="dev-reload">[\s\S]*?<\/script>\s*/g, ''))
  .replace(SCRIPT_TAG, `<script type="module" src="${appEntry}"></script>`)
  .replace(CSS_TAG, '<style>' + cssMin + '</style>');        
if (page.includes('<!--')) throw new Error('页面产物里仍有 HTML 注释（stripHtmlComments 漏了）');


const readIfExists = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;




const ASSETS_SRC = path.join(WEB, 'assets');
const ASSETS_OUT = path.join(DIST, 'assets');


const ASSET_SUBDIRS = ['ui', 'ps-presets'];
const assetFiles = fs.existsSync(ASSETS_SRC)
  ? [...fs.readdirSync(ASSETS_SRC).filter(f => !f.startsWith('.') && fs.statSync(path.join(ASSETS_SRC, f)).isFile()),
     ...ASSET_SUBDIRS.filter(d => fs.existsSync(path.join(ASSETS_SRC, d))).flatMap(d => fs.readdirSync(path.join(ASSETS_SRC, d))
       .filter(f => !f.startsWith('.') && fs.statSync(path.join(ASSETS_SRC, d, f)).isFile()).map(f => d + '/' + f))]
  : [];







const FORBIDDEN = collectForbidden({
  privateDir: path.join(ROOT, 'server', 'private'),
  publicDir: path.join(ROOT, 'core'),
  extraIdentifiers: ['toFoxpsdLayerInfo', 'buildQuiltWarpDescriptor', 'applyDeformToDescriptor',
                     'locateWarpOffsetsInBlock',
                     'buildWarpRewrites', 'resolveFragment'],
  literals: ['server/private']
});

const probe = selfTest(FORBIDDEN);
console.log(`私有标识扫描：本次纳入 ${FORBIDDEN.identifiers.length} 个标识 + ${FORBIDDEN.literals.length} 个字面量`
          + `（跳过 ${FORBIDDEN.skipped.length} 个：${FORBIDDEN.skipped.join('、') || '无'}；自测样本命中「${probe}」）`);


function assertNoPrivate(outputs) {
  const r = scanChunkSet({ preObf, outputs, forbidden: FORBIDDEN });
  if (r.bad.length) {
    const lines = r.bad.map(b => `  · ${b.name}：${b.hits.join('、')}`).join('\n');
    throw new Error(`产物里出现了服务端私有标识（检查 core/ 与 web/ 是否误引用 server/private）：\n${lines}`);
  }
  return r;
}
if (/core\/engine\.js|core\\\\engine\.js/.test(appJs)) throw new Error('app.js 不应静态包含引擎源码（开发分支未被剔除）');

const ENGINE_MARKS = ['warp 需要规则网格', '未知变形滤镜类型', 'gl_Position', 'computePlacement 需要正的尺寸'];
const allChunkText = [...preObf.values()].join('\n');
if (ENGINE_MARKS.some(k => allChunkText.includes(k))) throw new Error('页面 chunk 里出现了引擎实现（引擎源码泄漏进页面 bundle）');
if (!ENGINE_MARKS.every(k => engineJs.includes(k))) throw new Error('engine.js 缺少预期的引擎实现');


const outputs = { [path.join(DIST, 'editor.html')]: page, [ENGINE_OUT]: engineOut };


{
  const swSrc = readIfExists(path.join(WEB, 'sw.js'));
  if (swSrc) {
    const buildId = (appEntry.match(/\.([a-f0-9]{8,})\.js$/) || [, 'dev'])[1];
    const precache = ['/editor', ...[...page0.eager].map(n => '/' + n), ...assetFiles.filter(f => f.startsWith('ui/')).map(f => '/assets/' + f)];   
    outputs[path.join(DIST, 'sw.js')] = swSrc.replace("'__BUILD_ID__'", JSON.stringify(buildId)).replace('const PRECACHE = [];', 'const PRECACHE = ' + JSON.stringify(precache) + ';');
  }
  const mf = readIfExists(path.join(WEB, 'manifest.webmanifest'));
  if (mf) outputs[path.join(DIST, 'manifest.webmanifest')] = mf;
}
for (const [name, code] of chunkOut) outputs[path.join(DIST, name)] = code;



const scanTargets = c => Object.entries(c).map(([f, t]) =>
  [path.relative(ROOT, f), f.endsWith('.html') ? scriptTextOf(t) : t]);
const scanReport = assertNoPrivate([['engine.js（混淆前）', engineJs], ...scanTargets(outputs)]);
console.log(`私有标识扫描：${scanReport.summary}，命中 0`);

const expectedJs = new Set([...chunkOut.keys(), 'sw.js']);   
const same = f => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === outputs[f];
if (checkOnly) {
  
  const onDisk = {};
  for (const d of [DIST, path.dirname(ENGINE_OUT)]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (/\.(js|html)$/.test(f) && fs.statSync(p).isFile()) onDisk[p] = fs.readFileSync(p, 'utf8');
    }
  }
  assertNoPrivate(scanTargets(onDisk));
  
  
  const distJs = fs.existsSync(DIST) ? fs.readdirSync(DIST).filter(f => /\.js$/.test(f)) : [];
  const missing = [...expectedJs].filter(f => !fs.existsSync(path.join(DIST, f)));
  const extra = distJs.filter(f => !expectedJs.has(f));
  const stalePages = Object.keys(outputs).filter(f => /\.(html|webmanifest)$|[\\/]sw\.js$/.test(f) && !same(f));
  const staleAssets = assetFiles.filter(f => !fs.existsSync(path.join(ASSETS_OUT, f))
    || fs.statSync(path.join(ASSETS_OUT, f)).size !== fs.statSync(path.join(ASSETS_SRC, f)).size);
  const stale = stalePages.length > 0 || staleAssets.length > 0 || !fs.existsSync(ENGINE_OUT)
    || missing.length > 0 || extra.length > 0;
  if (stale) {
    console.error('web/dist 已过期。请运行：npm run build'
      + (missing.length ? `\n  缺少 chunk：${missing.join('、')}` : '')
      + (extra.length ? `\n  多余 chunk（旧产物没清干净）：${extra.join('、')}` : '')
      + (stalePages.length ? `\n  页面不同步：${stalePages.map(f => path.basename(f)).join('、')}` : ''));
    process.exitCode = 1;
  } else console.log(`web/dist 已同步（${expectedJs.size} 个 chunk）`);
} else {
  fs.mkdirSync(DIST, { recursive: true }); fs.mkdirSync(path.dirname(ENGINE_OUT), { recursive: true });
  
  for (const f of fs.readdirSync(DIST)) if (/\.js$/.test(f) && !expectedJs.has(f)) fs.rmSync(path.join(DIST, f));
  
  
  for (const f of fs.readdirSync(DIST)) if (/\.(gz|br)$/.test(f)) fs.rmSync(path.join(DIST, f));
  for (const [f, c] of Object.entries(outputs)) fs.writeFileSync(f, c);
  if (assetFiles.length) {
    fs.mkdirSync(ASSETS_OUT, { recursive: true });
    for (const f of fs.readdirSync(ASSETS_OUT)) if (!assetFiles.includes(f) && !ASSET_SUBDIRS.includes(f)) fs.rmSync(path.join(ASSETS_OUT, f), { recursive: true, force: true });
    for (const d of ASSET_SUBDIRS) {
      const od = path.join(ASSETS_OUT, d);
      if (fs.existsSync(od)) for (const f of fs.readdirSync(od)) if (!assetFiles.includes(d + '/' + f)) fs.rmSync(path.join(od, f), { recursive: true, force: true });
    }
    for (const f of assetFiles) { fs.mkdirSync(path.dirname(path.join(ASSETS_OUT, f)), { recursive: true }); fs.copyFileSync(path.join(ASSETS_SRC, f), path.join(ASSETS_OUT, f)); }
  }
  
  {
    const VS = path.join(WEB, 'vendor'), VO = path.join(DIST, 'vendor');
    fs.rmSync(VO, { recursive: true, force: true });
    if (fs.existsSync(VS)) fs.cpSync(VS, VO, { recursive: true });
  }
  const pages = Object.keys(outputs).filter(f => f.endsWith('.html')).map(f => path.basename(f)).join(' / ');
  

  const kb = n => (n / 1024).toFixed(0).padStart(4);
  const gzipOf = t => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
  const eager = page0.eager, lazy = [...chunkOut.keys()].filter(n => !eager.has(n));
  const total = (names, pick) => [...names].reduce((a, n) => a + pick(n), 0);
  const pre = n => preObf.get(n).length, post = n => chunkOut.get(n).length, gz = n => gzipOf(chunkOut.get(n));
  console.log(`已生成 web/dist：${chunkOut.size} 个 chunk（相对 import ${resolveStat.refs} 处，全部可解析）`);
  

  for (const name of chunkOut.keys())
    console.log(`  ${eager.has(name) ? '首屏' : '按需'} ${name.padEnd(22)}${kb(pre(name))} KB minify →${kb(post(name))} KB 混淆 →${kb(gz(name))} KB gzip`
              + `　← ${page0.labels.get(name) || '?'}`);
  console.log(`  首屏合计 ${(total(eager, pre) / 1024).toFixed(0)} KB minify / ${(total(eager, post) / 1024).toFixed(0)} KB 混淆 / ${(total(eager, gz) / 1024).toFixed(0)} KB gzip`
            + `　按需合计 ${(total(lazy, pre) / 1024).toFixed(0)} KB minify / ${(total(lazy, gz) / 1024).toFixed(0)} KB gzip`);
  console.log(`页面 ${pages}、server/engine/engine.js (${(engineOut.length / 1024).toFixed(0)} KB)${fast ? '【未混淆：--fast】' : ''}`);
}
