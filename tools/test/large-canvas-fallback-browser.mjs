import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: WEBGPU_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.docSize);
  const result = await page.evaluate(async () => {
    await window.__psd_editor.docSize.newDocument({ width: 100, height: 100, background: 'transparent', name: 'fallback-host' });
    const S = await import('/editor/app/02-doc-state.js');
    const R = await import('/editor/app/30-render.js');
    const w = 9390, h = 30000;
    S.set_doc({ width: w, height: h, mode: 3, depth: 8, layers: [{
      width: w, height: h, bounds: { left: 0, top: 0, right: w, bottom: h }, opacity: 255, blendMode: 'norm',
      lazyPreview: { width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]) },
    }] });
    S.set_docW(w); S.set_docH(h); S.set_layerTree({ flat: [{ index: 0 }] });
    const ok = R.renderLargeViewportFallback();
    const cv = document.querySelector('#below');
    const sample = [...(cv?.getContext('2d')?.getImageData(Math.floor((cv?.width || 1) / 2), Math.floor((cv?.height || 1) / 2), 1, 1).data || [])];
    
    S.doc.layers[0].lazyHighTiles = new Map(); R.renderLargeViewportFallback();
    const missingTile = [...cv.getContext('2d').getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data];
    const { createGpuCompositor } = await import('/core/render/gpu-compositor.js');
    const { buildDrawList } = await import('/core/render/draw-list.js');
    const gc = await createGpuCompositor({});
    const list = buildDrawList(R.gpuComposeDoc(), w, h);
    const rgba = await gc.renderToRGBA(list, { W: 64, H: 64, s: .002, tx: 0, ty: 0 });
    const proxyAt = (x, y) => [...rgba.slice((y * 64 + x) * 4, (y * 64 + x + 1) * 4)];
    const gpuProxyCenter = proxyAt(9, 30), gpuProxyOutside = proxyAt(30, 30);
    gc.destroy();
    return { ok, width: cv?.width || 0, height: cv?.height || 0, sample, missingTile, gpuProxyCenter, gpuProxyOutside };
  });
  assert.equal(result.ok, true);
  assert.ok(result.width > 0 && result.height > 0);
  assert.ok(result.width < 4096 && result.height < 4096, `fallback allocated an unbounded surface: ${JSON.stringify(result)}`);
  assert.equal(result.sample[0], 255);
  assert.deepEqual(result.missingTile, [255, 0, 0, 255]);
  assert.deepEqual(result.gpuProxyCenter, [255, 0, 0, 255], 'GPU proxy must cover the full document bounds');
  assert.equal(result.gpuProxyOutside[3], 0);
  console.log('✓ 9390×30000 超大文档只按视口采样，未创建整幅 Canvas');
} finally { await browser.close(); }
