import assert from 'node:assert/strict';
import { compositeAll, createSurface, drawContent } from '../../core/compose.js';
import { buildDrawList, executeDrawListCPU } from '../../core/render/draw-list.js';
const W = 2, H = 1, cases = [];
const layer = (rgb, extra = {}) => ({ width: W, height: H, bounds: { left: 0, top: 0, right: W, bottom: H }, rgba: Uint8ClampedArray.from([...rgb, ...rgb]), opacity: 255, fillOpacity: 255, blendMode: 'norm', ...extra });
const invert = (extra = {}) => ({ bounds: { left: 0, top: 0, right: W, bottom: H }, clipping: true, adjustment: { key: 'nvrt', params: {} }, opacity: 255, blendMode: 'norm', ...extra });
const render = layers => {
  const doc = { layers }, cpu = compositeAll(doc, W, H, new Map());
  const list = buildDrawList(doc, W, H), dl = executeDrawListCPU(list);
  assert.deepEqual(dl.data, cpu.data, 'Direct CPU and draw list agree');
  cases.push({ doc, expected: [...cpu.data] });
  return { pixels: [...cpu.data], list };
};
const bg = layer([200, 160, 120, 255]);
const base = layer([100, 100, 100, 128], { blendMode: 'mul ', opacity: 153, fillOpacity: 85 });
const expected = (color, props = base) => {
  const target = createSurface(W, H); target.data.set(bg.rgba);
  drawContent(target, { data: Uint8ClampedArray.from([...color, ...color]), width: W, height: H }, 0, 0,
    { opacity: props.opacity / 255 * props.fillOpacity / 255, blendMode: props.blendMode }, props);
  return [...target.data];
};
assert.deepEqual(render([bg, base, invert()]).pixels, expected([155, 155, 155, 128]), 'Invert the multiply source before blending it over the background');
assert.deepEqual(render([bg, base, invert(), invert()]).pixels, expected([100, 100, 100, 128]), 'Consecutive clipped adjustments do not thicken partial alpha');
assert.deepEqual(render([base, invert(), invert()]).pixels, [...base.rgba].map((v, i) => i % 4 === 3 ? Math.round(128 * .6 / 3) : v), 'Transparent backdrop retains base coverage');
const overlay = layer([0, 0, 200, 255], { clipping: true, opacity: 128 });
assert.deepEqual(render([bg, base, overlay, invert()]).pixels, expected([205, 205, 105, 128]), 'Clipped raster between base and adjustment contributes to the adjusted color stack');
const mask = { gray: Uint8Array.of(255, 0), width: 2, height: 1, left: 0, top: 0, defaultColor: 0 };
const masked = render([bg, base, invert({ opacity: 128, mask })]).pixels;
assert.deepEqual(masked.slice(0, 4), expected([128, 128, 128, 128]).slice(0, 4));
assert.deepEqual(masked.slice(4), expected([100, 100, 100, 128]).slice(4));
for (const invalid of [{ ...base, hidden: true }, { ...base, rgba: null, width: 0 }, { ...base, rgba: new Uint8ClampedArray(8) }])
  assert.deepEqual(render([bg, invalid, invert(), overlay]).pixels, [...bg.rgba], 'Hidden/empty/transparent clipping base cannot adjust background');
assert.deepEqual(render([bg, base, invert({ hidden: true })]).pixels, render([bg, base]).pixels);
const constrained = { ...base, channelsOff: [1], blendIf: { gray: { src: [0, 0, 255, 255], dst: [0, 0, 190, 210] } } };
assert.deepEqual(render([bg, constrained, invert()]).pixels, expected([155, 155, 155, 128], constrained), 'Base channel restrictions and Blend If still apply against the real backdrop');
const groups = [bg, { group: { type: 3 } }, base, invert(), { group: { type: 1 }, blendMode: 'pass', opacity: 255 }, invert()];
assert.deepEqual(render(groups).pixels, expected([155, 155, 155, 128]), 'A clipped adjustment after a group cannot escape into the background');
const detail = { width: 2, height: 1, tileSize: 256, tiles: new Map(), version: 1 };
const transformed = { ...base, gpuXform: [1, 0, 0, 1, 4, 5], gpuDetailTiles: detail };
const stack = buildDrawList({ layers: [bg, transformed, invert()] }, W, H).ops.find(o => o.k === 'clipStack');
assert.deepEqual(stack.ops[0].xf, transformed.gpuXform);
assert.equal(stack.ops[0].src.detail, detail, 'GPU stack keeps source detail tiles');
console.log('✓ 剪贴调整：源颜色、多个调整、像素夹层、蒙版/透明度、隐藏/空基底、组边界、Blend If/通道及GPU变换/高清tiles');

if (process.argv.includes('--gpu')) {
  const { loadPlaywright, WEBGPU_ARGS } = await import('./pw.mjs');
  const pw = await loadPlaywright();
  assert.ok(pw, 'GPU check requires Playwright');
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM,
    args: process.platform === 'darwin' ? ['--enable-unsafe-webgpu'] : WEBGPU_ARGS });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${process.env.PORT || 8792}/health`);
    const results = await page.evaluate(async json => {
      const { buildDrawList } = await import('/core/render/draw-list.js');
      const { createGpuCompositor } = await import('/core/render/gpu-compositor.js');
      const gc = await createGpuCompositor({}), results = [];
      try {
        for (const { doc, expected } of JSON.parse(json, (k, v) => v?.bytes ? Uint8ClampedArray.from(v.bytes) : v)) {
          const actual = await gc.renderToRGBA(buildDrawList(doc, 2, 1), { W: 2, H: 1, s: 1, tx: 0, ty: 0 });
          let max = 0;
          for (let i = 0; i < expected.length; i++) {
            const p = i - i % 4, a = i % 4 === 3 ? actual[i] : actual[i] * actual[p + 3] / 255;
            const b = i % 4 === 3 ? expected[i] : expected[i] * expected[p + 3] / 255;
            max = Math.max(max, Math.abs(a - b));
          }
          results.push(max);
        }
      } finally { gc.destroy(); }
      return results;
    }, JSON.stringify(cases, (k, v) => ArrayBuffer.isView(v) ? { bytes: [...v] } : v));
    assert.ok(results.every(x => x <= 2), `GPU clipped stack mismatch: ${JSON.stringify(results)}`);
    console.log(`✓ GPU 剪贴栈 ${results.length} 例，最大预乘通道差 ${Math.max(...results).toFixed(3)}/255`);
  } finally { await browser.close(); }
}
