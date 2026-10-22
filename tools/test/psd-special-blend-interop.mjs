import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { compositeAll } from '../../core/compose.js';
import { buildDrawList, executeDrawListCPU } from '../../core/render/draw-list.js';
import { parsePsdFull } from '../../core/psd-parse.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/special-blend-native.json', import.meta.url)));
const cases = [], results = [];
function error(actual, golden) {
  let max = 0;
  for (let p = 0; p < golden.length; p += 4) for (let c = 0; c < 4; c++) {
    const a = c === 3 ? actual[p + c] : actual[p + c] * actual[p + 3] / 255;
    const b = c === 3 ? golden[p + c] : golden[p + c] * golden[p + 3] / 255;
    max = Math.max(max, Math.abs(a - b));
  }
  return max;
}
for (const c of fixture.cases) {
  const bytes = inflateRawSync(Buffer.from(c.inputDeflateRawBase64, 'base64'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), c.inputSha256);
  const expected = inflateRawSync(Buffer.from(c.rgbaDeflateRawBase64, 'base64'));
  const doc = await parsePsdRaster(bytes), full = parsePsdFull(bytes).layers;
  const name = l => l.unicodeName || l.name;
  if ('blendClipped' in c.expected) {
    assert.equal(full.find(l => name(l) === 'Clip Base').blendClipped, c.expected.blendClipped);
    assert.equal(doc.layers.find(l => l.name === 'Clip Base').blendClipped, c.expected.blendClipped);
    assert.equal(full.find(l => name(l) === 'Clipped Highlight').clipping, 1);
  } else {
    assert.equal(doc.layers.find(l => l.name === 'Knockout').knockout ?? 0, c.expected.knockout);
    assert.equal(!!doc.layers[0].isBackground, c.expected.background);
  }
  const direct = compositeAll(doc, fixture.width, fixture.height, new Map()).data;
  const dl = executeDrawListCPU(buildDrawList(doc, fixture.width, fixture.height)).data;
  assert.deepEqual(dl, direct, `${c.id}: CPU executors disagree`);
  const max = error(direct, expected);
  assert.ok(max <= 1, `${c.id}: native Photoshop pixel error ${max}/255 exceeds quantization tolerance`);
  cases.push({ id: c.id, doc, expected }); results.push(max);
}
console.log(`✓ Photoshop ${fixture.photoshopVersion} native goldens: ${cases.length} cases, CPU max ${Math.max(...results)}/255`);
if (process.argv.includes('--gpu')) {
  const { loadPlaywright, WEBGPU_ARGS } = await import('./pw.mjs');
  const pw = await loadPlaywright(); assert.ok(pw, 'GPU check requires Playwright');
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    args: process.platform === 'darwin' ? ['--enable-unsafe-webgpu'] : WEBGPU_ARGS });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${process.env.PORT || 8792}/health`);
    const gpuResults = await page.evaluate(async ({ json, width, height }) => {
      const { buildDrawList } = await import('/core/render/draw-list.js');
      const { createGpuCompositor } = await import('/core/render/gpu-compositor.js');
      const gc = await createGpuCompositor({}), out = [];
      try {
        const parsed = JSON.parse(json, (k, v) => v?.bytes ? Uint8ClampedArray.from(v.bytes) : v);
        for (const { id, doc, expected } of parsed) {
          const actual = await gc.renderToRGBA(buildDrawList(doc, width, height), { W: width, H: height, s: 1, tx: 0, ty: 0 });
          let max = 0;
          for (let p = 0; p < expected.length; p += 4) for (let c = 0; c < 4; c++) {
            const a = c === 3 ? actual[p + c] : actual[p + c] * actual[p + 3] / 255;
            const b = c === 3 ? expected[p + c] : expected[p + c] * expected[p + 3] / 255;
            max = Math.max(max, Math.abs(a - b));
          }
          out.push({ id, max });
        }
      } finally { gc.destroy(); }
      return out;
    }, { json: JSON.stringify(cases.map(c => ({ ...c, expected: Uint8Array.from(c.expected) })), (k, v) => ArrayBuffer.isView(v) ? { bytes: [...v] } : v), width: fixture.width, height: fixture.height });
    assert.ok(gpuResults.every(r => r.max <= 2), `Native GPU mismatch: ${JSON.stringify(gpuResults)}`);
    console.log(`✓ Native WebGPU goldens: ${gpuResults.length} cases, max ${Math.max(...gpuResults.map(r => r.max))}/255`);
  } finally { await browser.close(); }
}
