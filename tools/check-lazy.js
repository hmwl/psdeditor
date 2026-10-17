








import * as esbuild from 'esbuild';

const MUST_BE_LAZY = [
  'core/psd-edit.js', 'core/psd-edit-create.js', 'core/filters.js', 'core/filters-more.js', 'core/smart-filter-render.js',
  'core/so-convert.js', 'core/selection.js', 'core/retouch.js', 'core/content-aware.js',
  'web/editor/actions-panel.js', 'web/editor/automate.js', 'web/editor/timeline-panel.js', 'web/editor/stitch.js',
  'web/editor/layer-style.js', 'web/editor/preferences-dialog.js', 'web/editor/shortcut-editor-dialog.js',
  'web/editor/info-panels.js', 'web/editor/text-panels.js', 'web/editor/char-para-panels.js',
  'web/editor/layer-comps-panel.js', 'web/editor/variables-ui.js', 'web/editor/save-for-web.js',
  'core/render/gpu-compositor.js', 'core/psd-decode-worker.js',
  'web/editor/ps-script.js', 'web/editor/ps-script-guest.js', 'web/editor/format-open.js', 'web/editor/format-save.js',
  'web/editor/relight.js', 'core/relight.js', 'core/relight-worker.js', 'core/relight-gpu.js',
  'core/relight-face-infer.js', 'core/relight-face-geometry.js', 'core/relight-materials.js', 'core/relight-lighting.js',
];

const r = await esbuild.build({
  entryPoints: ['web/editor/main.js'], bundle: true, format: 'esm', splitting: true, outdir: 'web/.lazy-check',
  write: false, metafile: true, platform: 'browser', logLevel: 'silent', external: ['node:*'],
  define: { 'globalThis.__PSD_EDITOR_DEV__': 'false', 'window.__PSD_EDITOR_DEV__': 'false', '__PSD_EDITOR_VERSION__': '"check"' },
});
const I = r.metafile.inputs;
const prev = new Map([['web/editor/main.js', null]]);
const queue = ['web/editor/main.js'];
while (queue.length) {
  const k = queue.shift();
  for (const im of (I[k] && I[k].imports) || []) if (im.kind === 'import-statement' && !prev.has(im.path)) { prev.set(im.path, k); queue.push(im.path); }
}
const bad = MUST_BE_LAZY.filter(m => prev.has(m));
if (bad.length) {
  for (const m of bad) {
    const chain = []; for (let c = m; c; c = prev.get(c)) chain.push(c);
    console.error(`✗ ${m} 被首屏静态 import 拖进来了：\n    ` + chain.reverse().join('\n  → '));
  }
  console.error('\n改成 import()（或走 app/01-boot.js 的 EDIT / FILTER 门面），见 ARCHITECTURE.md「按需拆包」。');
  process.exit(1);
}
console.log(`首屏拆包 ✓（${MUST_BE_LAZY.length} 个按需模块都不在首屏静态链上）`);
