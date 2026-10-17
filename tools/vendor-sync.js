


















import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import { RELIGHT_MODELS, RELIGHT_FACE_MODEL, RELIGHT_ASSETS, verifyRelightAsset, fetchRelightAssets } from './fetch-relight-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules'), OUT = path.join(ROOT, 'web', 'vendor');
const check = process.argv.includes('--check');

const plan = [];          
const add = (pkgRel, dst) => plan.push([path.join(NM, pkgRel), dst]);
const addDir = (pkgRel, dst) => { const d = path.join(NM, pkgRel); for (const f of fs.readdirSync(d)) if (fs.statSync(path.join(d, f)).isFile()) add(path.join(pkgRel, f), path.join(dst, f)); };

add('pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjs/pdf.min.mjs');          
add('pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs');
addDir('pdfjs-dist/cmaps', 'pdfjs/cmaps');
addDir('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts');
addDir('pdfjs-dist/wasm', 'pdfjs/wasm');
add('pdfjs-dist/LICENSE', 'pdfjs/LICENSE');

for (const f of ['index.js', 'worker.js', 'libraw.js', 'libraw.wasm']) add('libraw-wasm/dist/' + f, 'libraw/' + f);

add('libheif-js/libheif-wasm/libheif-bundle.mjs', 'heif/libheif-bundle.mjs');
add('libheif-js/libheif-wasm/LICENSE', 'heif/LICENSE');

for (const f of ['decode.js', 'utils.js', 'codec/dec/jxl_dec.js', 'codec/dec/jxl_dec.wasm', 'LICENSE']) add('@jsquash/jxl/' + f, 'jxl/' + f);

add('@jitl/quickjs-wasmfile-release-asyncify/dist/emscripten-module.wasm', 'quickjs/emscripten-module.wasm');
add('quickjs-emscripten-core/LICENSE', 'quickjs/LICENSE');


const relightRuntimeFiles = ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];
for (const f of relightRuntimeFiles) add('onnxruntime-web/dist/' + f, 'relight/' + f);
const faceRuntimeFiles = ['vision_bundle.mjs', 'wasm/vision_wasm_module_internal.js', 'wasm/vision_wasm_module_internal.wasm'];
const faceRuntimeDirectory = `mediapipe/${ver('@mediapipe/tasks-vision')}`;
for (const f of faceRuntimeFiles) add('@mediapipe/tasks-vision/' + f, 'relight/' + faceRuntimeDirectory + '/' + path.basename(f));
if (!check) await fetchRelightAssets();

for (const asset of RELIGHT_ASSETS) {
  const source = path.join(OUT, 'relight', asset.filename);
  if (!fs.existsSync(source) || !verifyRelightAsset(asset, fs.readFileSync(source))) {
    throw new Error(`重新打光资源缺失或校验失败：${asset.filename}。运行 node tools/fetch-relight-model.mjs 下载固定版本，再运行 npm run vendor。`);
  }
  plan.push([source, 'relight/' + asset.filename]);
}
const relightManifest = {
  models: RELIGHT_MODELS,
  faceModel: RELIGHT_FACE_MODEL,
  assets: RELIGHT_ASSETS,
  runtime: {
    name: 'onnxruntime-web', version: ver('onnxruntime-web'), license: 'MIT',
    source: 'https://github.com/microsoft/onnxruntime', backends: ['webgpu', 'wasm'],
    files: relightRuntimeFiles.map(filename => {
      const data = fs.readFileSync(path.join(NM, 'onnxruntime-web/dist', filename));
      return { filename, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
    }),
  },
  faceRuntime: {
    name: '@mediapipe/tasks-vision', version: ver('@mediapipe/tasks-vision'), license: 'Apache-2.0',
    source: 'https://github.com/google-ai-edge/mediapipe', backend: 'CPU',
    files: faceRuntimeFiles.map(filename => {
      const data = fs.readFileSync(path.join(NM, '@mediapipe/tasks-vision', filename));
      return { filename: faceRuntimeDirectory + '/' + path.basename(filename), bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
    }),
  },
  privacy: 'All inference and image processing run locally in the browser. Only same-origin static resources are requested.',
};
plan.push([{ content: JSON.stringify(relightManifest, null, 2) + '\n' }, 'relight/manifest.json']);

const LICENSES = `第三方组件（按需加载，原样发布，未经混淆）
pdfjs/   pdf.js ${ver('pdfjs-dist')} — Apache License 2.0 — https://github.com/mozilla/pdf.js
libraw/  libraw-wasm ${ver('libraw-wasm')} — ISC；内含 LibRaw（LGPL-2.1 或 CDDL-1.0，任选）— https://www.libraw.org
heif/    libheif-js ${ver('libheif-js')} — LGPL-3.0；内含 libheif / libde265 — https://github.com/strukturag/libheif
jxl/     @jsquash/jxl ${ver('@jsquash/jxl')} — Apache License 2.0；内含 libjxl（BSD-3-Clause）
quickjs/ quickjs-emscripten ${ver('quickjs-emscripten-core')} — MIT；内含 QuickJS（MIT）
relight/ ONNX Runtime Web ${ver('onnxruntime-web')} — MIT — https://github.com/microsoft/onnxruntime
relight/mediapipe/ @mediapipe/tasks-vision ${ver('@mediapipe/tasks-vision')} — Apache License 2.0 — https://github.com/google-ai-edge/mediapipe
relight/face-landmarker.task  Google MediaPipe Face Landmarker float16/1 — Apache License 2.0 — ${RELIGHT_FACE_MODEL.modelCard}
${RELIGHT_MODELS.map(model => `relight/${model.filename}  ${model.name} — ${model.license} — ${model.repository}\n                       revision ${model.revision}；详见 relight/manifest.json 和各模型 LICENSE`).join('\n')}
LGPL 组件以独立文件动态加载，可被替换为任意兼容版本。
`;
plan.push([{ content: LICENSES }, 'LICENSES.txt']);
function ver(p) { try { return JSON.parse(fs.readFileSync(path.join(NM, p, 'package.json'), 'utf8')).version; } catch { return '?'; } }


async function quickjsBundle() {
  const entry = `import { newQuickJSAsyncWASMModuleFromVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-asyncify';
export async function loadQuickJS(wasmUrl) {
  return newQuickJSAsyncWASMModuleFromVariant({ ...variant, importModuleLoader: async () => { const m = await variant.importModuleLoader(); return opts => m({ ...(opts || {}), locateFile: () => wasmUrl }); } });
}
export * from 'quickjs-emscripten-core';`;
  const r = await esbuild.build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'esm', platform: 'browser', minify: true, write: false,
    conditions: ['browser'], external: ['node:*', 'module', 'fs', 'path', 'url', 'crypto'], legalComments: 'none', logLevel: 'silent' });
  return r.outputFiles[0].text;
}
plan.push([{ content: await quickjsBundle() }, 'quickjs/quickjs.mjs']);

const hash = b => crypto.createHash('sha1').update(b).digest('hex');
let bad = 0, wrote = 0;
const want = new Set();
for (const [src, dst] of plan) {
  const to = path.join(OUT, dst); want.add(path.normalize(to));
  const data = typeof src === 'string' ? fs.readFileSync(src) : Buffer.from(src.content);
  const cur = fs.existsSync(to) ? fs.readFileSync(to) : null;
  if (cur && hash(cur) === hash(data)) continue;
  if (check) { bad++; console.error('vendor 不同步：' + dst); continue; }
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, data); wrote++;
}

const walk = d => fs.existsSync(d) ? fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; }) : [];
for (const f of walk(OUT)) if (!want.has(path.normalize(f))) { if (check) { bad++; console.error('vendor 多余：' + path.relative(OUT, f)); } else fs.rmSync(f); }
if (check) { if (bad) { console.error('运行 node tools/vendor-sync.js 同步'); process.exit(1); } console.log('vendor 同步 ✓'); }
else console.log(`vendor：写了 ${wrote} 个文件 → web/vendor（共 ${plan.length} 个）`);
