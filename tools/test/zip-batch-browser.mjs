import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const width = 1024, height = 768;
const channels = [0, 1, 2, -1].map(id => {
  const raw = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * width + x] = id < 0 ? 200 : (x * (id + 1) + y * 3 + 11) & 255;
  return { id, w: width, h: height, bytes: new Uint8Array([0, 2, ...deflateSync(raw)]) };
});
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/health`);
  const out = await page.evaluate(async ({ width, height, channels }) => {
    const { createDecodePool } = await import('/core/psd-decode-worker.js');
    const chans = channels.map(c => ({ ...c, view: new Uint8Array(c.bytes) }));
    const work = { width, height, mode: 3, depth: 8, zipTile: true };
    const pool = createDecodePool(1, { sourceBudget: 32 * 1024 * 1024, rowBudget: width * 4 * 256 });
    try {
      await pool.run({ ...work, tile: { x: 0, y: 0, width: 256, height: 256 } }, chans);
      const before = pool.stats;
      const batch = await pool.runBatch(work, chans, [
        { x: 0, y: 256, width: 256, height: 256 },
        { x: 256, y: 256, width: 256, height: 256 },
        { x: 512, y: 256, width: 256, height: 256 },
      ]);
      const pixel = (t, x, y) => [...t.data.slice((y * t.width + x) * 4, (y * t.width + x + 1) * 4)];
      return { before, after: pool.stats, count: batch.tiles.length,
        pixels: batch.tiles.map(t => pixel(t, 17, 19)), resident: pool.stats.sources };
    } finally { pool.terminate(); }
  }, { width, height, channels });
  const expected = x => [0, 1, 2].map(c => (x * (c + 1) + 256 * 3 + 19 * 3 + 11) & 255).concat(200);
  assert.equal(out.count, 3);
  assert.deepEqual(out.pixels, [expected(17), expected(273), expected(529)]);
  assert.equal(out.after.sourceTransfers, 1);
  assert.equal(out.after.sources, 1);
  assert.ok(out.after.rowsRead > out.before.rowsRead);
  console.log('✓ ZIP 相邻瓦片批量 Worker 解码复用同一压缩源与行缓存');
} finally {
  await browser.close();
}
