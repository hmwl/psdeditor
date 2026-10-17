import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const width = 768, height = 640;
function channels(seed) {
  return [0, 1, 2, -1].map(c => {
    const raw = new Uint8Array(width * height), prediction = c === 0 || c === -1;
    for (let y = 0; y < height; y++) {
      let prev = 0;
      for (let x = 0; x < width; x++) {
        const v = c === -1 ? 200 : (x * (c + 1) + y * 3 + seed) & 255;
        raw[y * width + x] = prediction ? (v - prev + 256) & 255 : v; prev = v;
      }
    }
    return { id: c, w: width, h: height, bytes: [0, prediction ? 3 : 2, ...deflateSync(raw)] };
  });
}
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/health`);
  const out = await page.evaluate(async ({ width, height, sourceA, sourceB }) => {
    const { createDecodePool } = await import('/core/psd-decode-worker.js');
    const { readLazyLayerRectChannels } = await import('/core/psd-raster.js');
    const convert = a => a.map(c => ({ id: c.id, w: c.w, h: c.h, view: new Uint8Array(c.bytes) }));
    const A = convert(sourceA), B = convert(sourceB);
    const bytes = Math.max(A.reduce((n, c) => n + c.view.length, 0), B.reduce((n, c) => n + c.view.length, 0));
    const work = (x, y) => ({ width, height, mode: 3, depth: 8, zipTile: true, tile: { x, y, width: 256, height: 256 } });
    const pixel = (t, x = 17, y = 19) => [...t.data.slice((y * t.width + x) * 4, (y * t.width + x + 1) * 4)];
    const pool = createDecodePool(2, { sourceBudget: bytes * 4, rowBudget: width * 4 * 256 * 2 });
    try {
      const preview = await pool.run({ width, height, mode: 3, depth: 8, previewMax: 64 }, A);
      const previewStats = pool.stats;
      const left = await pool.run(work(0, 64), A), first = pool.stats;
      const [middle, right] = await Promise.all([pool.run(work(256, 64), A), pool.run(work(512, 64), A)]);
      const adjacent = pool.stats;
      const forward = await pool.run(work(256, 320), A), forwardStats = pool.stats;
      const backward = await pool.run(work(512, 64), A), backwardStats = pool.stats;
      const other = await pool.run(work(0, 64), B);
      await pool.clearSources(); const cleared = pool.stats;
      const reloaded = await pool.run(work(0, 64), A), reloadStats = pool.stats;
      const evictionPool = createDecodePool(1, { sourceBudget: Math.floor(bytes * 1.5), rowBudget: width * 4 * 256 });
      let eviction;
      try {
        await evictionPool.run(work(0, 64), A);
        await evictionPool.run(work(0, 64), B);
        const returnA = await evictionPool.run(work(0, 64), A);
        eviction = { ...evictionPool.stats, pixel: pixel(returnA.tile) };
      } finally { evictionPool.terminate(); }
      const dying = createDecodePool(1);
      const pending = Promise.allSettled([dying.run(work(0, 64), A), dying.run(work(256, 64), A)]);
      dying.terminate();
      const terminated = (await pending).map(r => r.status);
      const parallel = createDecodePool(2);
      let parallelResult;
      try {
        const [a, b] = await Promise.all([parallel.run(work(0, 64), A), parallel.run(work(0, 64), B)]);
        parallelResult = { workers: parallel.stats.workers, pixels: [pixel(a.tile), pixel(b.tile)] };
      } finally { parallel.terminate(); }
      const transient = createDecodePool(1, { sourceBudget: 1, rowBudget: 1 });
      let oversized;
      try {
        await transient.run(work(0, 64), A); const r = await transient.run(work(0, 64), A);
        oversized = { ...transient.stats, pixel: pixel(r.tile) };
      } finally { transient.terminate(); }
      const damaged = createDecodePool(1);
      let recovered;
      try {
        const bad = [{ id: 0, w: width, h: height, view: new Uint8Array([0, 2, 0, 0]) }];
        const failures = await Promise.allSettled([damaged.run(work(0, 64), bad), damaged.run(work(0, 64), A)]);
        recovered = { status: failures.map(r => r.status), pixel: pixel(failures[1].value.tile), broken: damaged.broken };
      } finally { damaged.terminate(); }
      const invalid = createDecodePool(1);
      const invalidStatus = await Promise.allSettled([invalid.run(work(0, 64), [{ id: 0, view: null }])]);
      invalid.terminate();
      const rawLayer = { width, height, lazyChannels: {} };
      for (const c of [0, 1, 2, -1]) {
        const bytes = new Uint8Array(2 + width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes[2 + y * width + x] = c === -1 ? 200 : (x * (c + 1) + y * 3) & 255;
        rawLayer.lazyChannels[c] = { bytes, dataOffset: 2, comp: 0, bps: 1, rowBytes: width };
      }
      const roiPool = createDecodePool(1);
      let rawROI;
      try {
        const roi = readLazyLayerRectChannels(rawLayer, 256, 64, 256, 256);
        const result = await roiPool.run({ width: 256, height: 256, depth: 8, mode: 3, maskInfo: {}, geo: {} }, roi);
        rawROI = { bytes: roiPool.stats.transferredBytes, pixel: pixel({ width: 256, data: result.rgba }) };
      } finally { roiPool.terminate(); }
      const lodPool = createDecodePool(2, { rowBudget: width * 4 * 256 * 2 });
      let lod;
      try {
        const a = await lodPool.run({ ...work(0, 64), tile: { x: 0, y: 64, width: 512, height: 512, scale: 2 } }, A), first = lodPool.stats;
        const b = await lodPool.run({ ...work(512, 64), tile: { x: 512, y: 64, width: 512, height: 512, scale: 2 } }, A), adjacent = lodPool.stats;
        const cropJob = { width: 512, height: 512, depth: 8, mode: 3, scale: 2, x: 256, y: 64, maskInfo: {}, geo: {} };
        let firstOwned;
        const streamed = await lodPool.runLod(cropJob, (y, h) => { const band = readLazyLayerRectChannels(rawLayer, 256, 64 + y, 512, h); if (!y) firstOwned = band; return band; }, { transferChannels: true });
        let reads = 0;
        const failure = await Promise.allSettled([lodPool.runLod(cropJob, (y, h) => { if (++reads === 2) throw new Error('band failed'); return readLazyLayerRectChannels(rawLayer, 256, 64 + y, 512, h); })]);
        const afterFailure = lodPool.stats;
        const again = await lodPool.runLod(cropJob, (y, h) => readLazyLayerRectChannels(rawLayer, 256, 64 + y, 512, h));
        const at = t => [...t.data.slice((19 * t.sampleWidth + 17) * 4, (19 * t.sampleWidth + 18) * 4)];
        const dyingLod = createDecodePool(1), never = () => new Promise(() => {});
        const stopped = Promise.allSettled([dyingLod.runLod(cropJob, (y,h) => y ? never() : readLazyLayerRectChannels(rawLayer,256,64,512,h)), dyingLod.runLod(cropJob,never)]);
        for (let i = 0; i < 120 && !dyingLod.stats.lodAccumulatorBytes; i++) await new Promise(r => requestAnimationFrame(r));
        if (!dyingLod.stats.lodAccumulatorBytes) throw new Error('LOD termination probe never allocated its worker accumulator');
        dyingLod.terminate();
        lod = { first, adjacent, pixels: [a, b, streamed, again].map(r => at(r.tile)), dimensions: [a.tile, b.tile, streamed.tile].map(t => [t.width, t.height, t.sampleWidth, t.sampleHeight, t.scale]),
          failure: failure[0].status, ownedDetached: firstOwned.every(c => c.view.byteLength === 0), parentIntact: Object.values(rawLayer.lazyChannels).every(c => c.bytes.byteLength > 2), afterFailure, final: lodPool.stats, terminated: (await stopped).map(r => r.status), terminatedAccumulatorBytes: dyingLod.stats.lodAccumulatorBytes };
      } finally { lodPool.terminate(); }
      return { preview: { width: preview.preview.width, height: preview.preview.height, rgba: preview.rgba }, previewStats, first, adjacent, forwardStats, backwardStats,
        pixels: [left, middle, right, forward, backward, other, reloaded].map(r => pixel(r.tile)),
        detached: A.some(c => c.view.byteLength === 0), cleared, reloadStats, eviction, terminated, parallelResult, oversized, recovered, invalid: invalidStatus[0].status, rawROI, lod };
    } finally { pool.terminate(); }
  }, { width, height, sourceA: channels(0), sourceB: channels(71) });
  assert.equal(out.preview.rgba, null); assert.equal(out.preview.width, 64);
  assert.equal(out.previewStats.sourceTransfers, 1);
  assert.equal(out.first.sourceTransfers, 1); assert.equal(out.adjacent.sourceTransfers, 1);
  assert.equal(out.adjacent.rowsRead, out.first.rowsRead);
  assert.equal(out.adjacent.streamStarts, out.first.streamStarts);
  assert.equal(out.adjacent.rowHits, 2 * 256 * 4);
  assert.equal(out.forwardStats.rowsRead, out.first.rowsRead + 256 * 4);
  assert.equal(out.backwardStats.streamStarts, out.first.streamStarts + 4);
  assert.equal(out.detached, false);
  const expected = (x, y, seed = 0) => [0, 1, 2].map(c => ((x + 17) * (c + 1) + (y + 19) * 3 + seed) & 255).concat(200);
  assert.deepEqual(out.pixels, [expected(0, 64), expected(256, 64), expected(512, 64), expected(256, 320), expected(512, 64), expected(0, 64, 71), expected(0, 64)]);
  assert.equal(out.cleared.sourceBytes, 0); assert.equal(out.cleared.rowBytes, 0);
  assert.equal(out.reloadStats.sourceTransfers, 3);
  assert.equal(out.eviction.sourceTransfers, 3); assert.ok(out.eviction.sourceEvictions >= 2);
  assert.deepEqual(out.eviction.pixel, expected(0, 64));
  assert.ok(out.first.rowBytes <= width * 4 * 256);
  assert.deepEqual(out.terminated, ['rejected', 'rejected']);
  assert.equal(out.parallelResult.workers, 2); assert.deepEqual(out.parallelResult.pixels, [expected(0, 64), expected(0, 64, 71)]);
  assert.equal(out.oversized.sourceBytes, 0); assert.equal(out.oversized.rowBytes, 0);
  assert.equal(out.oversized.sourceTransfers, 2); assert.deepEqual(out.oversized.pixel, expected(0, 64));
  assert.deepEqual(out.recovered.status, ['rejected', 'fulfilled']); assert.deepEqual(out.recovered.pixel, expected(0, 64)); assert.equal(out.recovered.broken, false);
  assert.equal(out.invalid, 'rejected');
  assert.equal(out.rawROI.bytes, 4 * (2 + 256 * 256)); assert.deepEqual(out.rawROI.pixel, expected(256, 64));
  assert.equal(out.lod.adjacent.rowsRead, out.lod.first.rowsRead); assert.equal(out.lod.adjacent.streamStarts, out.lod.first.streamStarts);
  assert.ok(out.lod.adjacent.lodRowHits >= 256); assert.equal(out.lod.adjacent.sourceTransfers, 1);
  const expectedLod = x => [0,1,2].map(c => Math.round([0,1].flatMap(dy => [0,1].map(dx => ((x + 34 + dx) * (c + 1) + (64 + 38 + dy) * 3) & 255)).reduce((a,b)=>a+b,0) / 4)).concat(200);
  assert.deepEqual(out.lod.pixels, [expectedLod(0), expectedLod(512), expectedLod(256), expectedLod(256)]);
  assert.deepEqual(out.lod.dimensions, [[512,512,256,256,2],[256,512,128,256,2],[512,512,256,256,2]]);
  assert.equal(out.lod.failure, 'rejected'); assert.equal(out.lod.afterFailure.lodAccumulatorBytes, 0);
  assert.equal(out.lod.final.lodAccumulatorBytes, 0); assert.equal(out.lod.final.lodJobs, 0);
  assert.deepEqual(out.lod.terminated, ['rejected','rejected']);
  assert.equal(out.lod.terminatedAccumulatorBytes,0);
  assert.equal(out.lod.ownedDetached,true);assert.equal(out.lod.parentIntact,true);
  console.log('✓ 真实 Worker：预览与多瓦片仅传一次源；横向不重复解压；前进/回退像素正确；LRU/清理/终止无悬挂');
  console.log(JSON.stringify({ first: out.first, adjacent: out.adjacent, eviction: out.eviction }));
} finally { await browser.close(); }
