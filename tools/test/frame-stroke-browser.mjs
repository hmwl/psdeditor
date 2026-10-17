
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('需要 Playwright，不能跳过此回归');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/native-frames.json', import.meta.url))).files['native-frame-rect.psd'];
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined), args: WEBGPU_ARGS });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/health`);
  const rows = await page.evaluate(async fixture => {
    const { parsePsdRaster } = await import('/core/psd-raster.js');
    const { compositeAll } = await import('/core/compose.js');
    const { buildDrawList, executeDrawListCPU, createDrawListState } = await import('/core/render/draw-list.js');
    const { createGpuCompositor } = await import('/core/render/gpu-compositor.js');
    const compressed = Uint8Array.from(atob(fixture.deflateBase64), c => c.charCodeAt(0));
    const bytes = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const native = await parsePsdRaster(bytes), frame = native.layers.find(l => l.frame);
    frame.vectorStroke = structuredClone(frame.vectorStroke);
    Object.assign(frame.vectorStroke.desc, { strokeEnabled: true, strokeStyleLineWidth: { __unit: '#Pxl', value: 10 } });
    frame.vectorStroke.desc.strokeStyleContent['Clr '] = { __classID: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 };
    const gpu = await createGpuCompositor({});
    if (!gpu) throw Error('GPU compositor unavailable');
    const W = native.width, H = native.height, results = [];
    try {
      for (const blendMode of ['norm', 'pass']) for (const opacity of [255, 128]) {
        frame.blendMode = blendMode; frame.opacity = opacity;
        const doc = { ...native, layers: [{ group: { type: 3 } }, frame] };
        const state = createDrawListState(), list = buildDrawList(doc, W, H, state);
        const direct = compositeAll(doc, W, H, new Map()).data, cpu = executeDrawListCPU(list).data;
        if (direct.some((v, i) => v !== cpu[i])) throw Error('CPU draw list mismatch');
        const pixels = await gpu.renderToRGBA(list, { W, H, s: 1, tx: 0, ty: 0 });
        let max = 0;
        for (let i = 0; i < cpu.length; i++) {
          const c = i % 4, a = cpu[i - c + 3] / 255, b = pixels[i - c + 3] / 255;
          max = Math.max(max, Math.abs(c === 3 ? cpu[i] - pixels[i] : cpu[i] * a - pixels[i] * b));
        }
        const alpha = (x, y) => pixels[(y * W + x) * 4 + 3];
        if (alpha(200, 175) !== 0 || Math.abs(alpha(200, 96) - opacity) > 1) throw Error('filled center or clipped border');
        results.push({ blendMode, opacity, max });
      }
    } finally { gpu.destroy(); }
    return results;
  }, fixture);
  for (const row of rows) assert.ok(row.max <= 2, JSON.stringify(row));
  assert.deepEqual(errors, []);
  console.log('✓ native frame hollow outline GPU/CPU agreement (norm/pass, opacity 100%/50%, max difference ≤2)');
} finally { await browser.close(); }
