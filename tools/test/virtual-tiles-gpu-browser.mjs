import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: WEBGPU_ARGS });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/health`);
  const results = await page.evaluate(async () => {
    const { createGpuCompositor } = await import('/core/render/gpu-compositor.js');
    const { buildDrawList, executeDrawListCPU } = await import('/core/render/draw-list.js');
    const gc = await createGpuCompositor({}), refgc = await createGpuCompositor({ device: gc.device });
    const N = 512, proxy = new Uint8ClampedArray(16 * 16 * 4), full = new Uint8ClampedArray(N * N * 4);
    const solid = [25, 190, 70, 100];
    for (let i = 0; i < proxy.length; i++) proxy[i] = solid[i % 4];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const q = (y * N + x) * 4;
      full.set([(x * 3 + y) & 255, (y * 5 + x) & 255, (x ^ y) & 255, 70 + ((x + y) % 170)], q);
    }
    const tile = (x, y) => {
      const data = new Uint8ClampedArray(256 * 256 * 4);
      for (let yy = 0; yy < 256; yy++) data.set(full.subarray(((y + yy) * N + x) * 4, ((y + yy) * N + x + 256) * 4), yy * 256 * 4);
      return { x, y, width: 256, height: 256, data };
    };
    const tiles = new Map([['0:0', tile(0, 0)], ['256:0', tile(256, 0)]]);
    const detail = { width: N, height: N, tileSize: 256, tiles, version: 0 };
    const bounds = { left: 0, top: 0, right: N, bottom: N };
    const base = { width: N, height: N, bounds, opacity: 255, blendMode: 'norm', rgba: new Uint8ClampedArray(N * N * 4).fill(100) };
    for (let i = 3; i < base.rgba.length; i += 4) base.rgba[i] = 255;
    const image = { width: 16, height: 16, bounds, opacity: 143, blendMode: 'norm', rgba: proxy, gpuXform: [32, 0, 0, 32, 0, 0], gpuDetailTiles: detail };
    const clipped = { ...base, opacity: 170, blendMode: 'scrn', clipping: 1 };
    const refPixels = (map = tiles) => {
      const out = new Uint8ClampedArray(full.length);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const q = (y * N + x) * 4;
        const t = map.get(`${Math.floor(x / 256) * 256}:${Math.floor(y / 256) * 256}`);
        const at = t ? ((y - t.y) * t.width + x - t.x) * 4 : 0;
        out.set(t ? t.data.subarray(at, at + 4) : solid, q);
      }
      return out;
    };
    const report = [];
    const compare = (a, b, name, tolerance = 3) => {
      let max = 0, bad = 0;
      for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 4; c++) {
        const av = c === 3 ? a[i + c] : a[i + c] * a[i + 3] / 255;
        const bv = c === 3 ? b[i + c] : b[i + c] * b[i + 3] / 255;
        const d = Math.abs(av - bv); max = Math.max(max, d); if (d > tolerance) bad++;
      }
      report.push({ name, max, bad });
    };
    try {
      for (const mode of ['norm', 'mul ', 'over', 'diff']) for (const clip of [false, true]) {
        image.blendMode = mode;
        const layers = [base, image, ...(clip ? [clipped] : [])];
        const ref = [base, { ...image, width: N, height: N, rgba: refPixels(), gpuXform: null, gpuDetailTiles: null }, ...(clip ? [clipped] : [])];
        const list = buildDrawList({ layers }, N, N);
        const result = await gc.renderToRGBA(list, { W: N, H: N, s: 1, tx: 0, ty: 0 });
        const expected = executeDrawListCPU(buildDrawList({ layers: ref }, N, N)).data;
        compare(expected, result, `partial proxy/detail ${mode} clip=${clip}`);
      }
      tiles.set('0:256', tile(0, 256)); tiles.set('256:256', tile(256, 256)); detail.version++;
      image.blendMode = 'norm';
      const list = buildDrawList({ layers: [image] }, N, N);
      const ref = buildDrawList({ layers: [{ ...image, width: N, height: N, rgba: full, gpuXform: null, gpuDetailTiles: null }] }, N, N);
      for (const s of [0.1, 0.2, 0.73, 1, 1.4, 2]) {
        const view = { W: 320, H: 300, s, tx: 160 - 256 * s, ty: 150 - 256 * s };
        compare(await refgc.renderToRGBA(ref, view), await gc.renderToRGBA(list, view), `tile gutters/seams scale ${s}`);
      }
      const view = { W: 320, H: 300, s: 1, tx: -100, ty: -100 };
      await gc.renderToRGBA(list, view); const uploads = gc.stats.uploadPx, resident = gc.bytesResident;
      await gc.renderToRGBA(list, view);
      report.push({ name: 'warm frame reuses all source textures', bad: gc.stats.uploadPx === uploads ? 0 : 1 });
      await gc.renderToRGBA(list, { W: 16, H: 16, s: 1 / 32, tx: 0, ty: 0 });
      const afterSnapshot = gc.stats.uploadPx;
      await gc.renderToRGBA(list, view);
      report.push({ name: 'navigator snapshot preserves viewport detail textures', bad: gc.stats.uploadPx === afterSnapshot ? 0 : 1 });
      
      
      for (let i = 0; i < 8; i++) {
        tiles.delete('0:0'); detail.version++; await gc.renderToRGBA(list, view);
        if (!i) {
          const missing = buildDrawList({ layers: [{ ...image, width: N, height: N, rgba: refPixels(), gpuXform: null, gpuDetailTiles: null }] }, N, N);
          compare(await refgc.renderToRGBA(missing, view), await gc.renderToRGBA(list, view), 'evicted cell reveals proxy again');
        }
        tiles.set('0:0', tile(0, 0)); detail.version++; await gc.renderToRGBA(list, view);
      }
      report.push({ name: 'detail eviction/reload stays within resident budget', bad: gc.bytesResident <= resident + 4096 ? 0 : 1, resident, after: gc.bytesResident });
      const savedTiles = new Map(tiles), beforePrune = gc.bytesResident;
      tiles.clear(); detail.version++;
      gc.pruneDetailTiles(detail);
      report.push({ name: 'empty/offscreen CPU cache releases GPU detail immediately', bad: gc.bytesResident < beforePrune - 256 * 256 * 4 ? 0 : 1, before: beforePrune, after: gc.bytesResident });
      const proxyRef = buildDrawList({ layers: [{ ...image, width: N, height: N, rgba: refPixels(), gpuXform: null, gpuDetailTiles: null }] }, N, N);
      compare(await refgc.renderToRGBA(proxyRef, view), await gc.renderToRGBA(list, view), 'all cells evicted reveal the proxy');
      for (const [key, value] of savedTiles) tiles.set(key, value);
      detail.version++; await gc.renderToRGBA(list, view);
      const half = { ...image, opacity: 83 };
      const group = l => [{ group: { type: 3 } }, l, { group: { type: 1 }, opacity: 151, blendMode: 'mul ' }];
      const a = buildDrawList({ layers: [base, ...group(half)] }, N, N);
      const b = buildDrawList({ layers: [base, ...group({ ...half, width: N, height: N, rgba: full, gpuXform: null, gpuDetailTiles: null })] }, N, N);
      compare(executeDrawListCPU(b).data, await gc.renderToRGBA(a, { W: N, H: N, s: 1, tx: 0, ty: 0 }), 'isolated group opacity applies once');
      const secondTile = tile(0, 0);
      for (let i = 0; i < secondTile.data.length; i += 4) secondTile.data[i] = 255 - secondTile.data[i];
      const secondMap = new Map([['0:0', secondTile]]);
      const second = { ...image, opacity: 127, blendMode: 'mul ', gpuDetailTiles: { ...detail, tiles: secondMap, version: 0 } };
      const two = buildDrawList({ layers: [base, image, second] }, N, N);
      const twoRef = buildDrawList({ layers: [base,
        { ...image, width: N, height: N, rgba: full, gpuXform: null, gpuDetailTiles: null },
        { ...second, width: N, height: N, rgba: refPixels(secondMap), gpuXform: null, gpuDetailTiles: null },
      ] }, N, N);
      compare(executeDrawListCPU(twoRef).data, await gc.renderToRGBA(two, { W: N, H: N, s: 1, tx: 0, ty: 0 }), 'layers sharing a proxy keep independent detail residency');
    } finally { refgc.destroy(); gc.destroy(); }
    return report;
  });
  for (const r of results) { console.log(JSON.stringify(r)); assert.equal(r.bad, 0, r.name); }
  assert.deepEqual(errors, []);
  console.log('✓ GPU 原生消费虚拟图层瓦片：代理缺块/半透明/混合/剪贴/组不透明度/缩放接缝/驻留回收');
} finally { await browser.close(); }
