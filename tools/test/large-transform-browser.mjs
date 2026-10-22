

import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { createJpegEncoder } from '../../core/jpeg-encode.js';

const W = 9000, H = 8000;
const enc = createJpegEncoder({ width: W, height: H, quality: 90 });
const row = new Uint8Array(W * 8 * 4);
for (let y = 0; y < H; y += 8) {
  for (let r = 0; r < 8; r++) {
    const yy = y + r;
    for (let x = 0; x < W; x++) {
      const o = (r * W + x) * 4;
      if (yy < H / 2 && x < W / 2) { row[o] = 255; row[o + 1] = 0; row[o + 2] = 0; }
      else if (yy < H / 2) { row[o] = 0; row[o + 1] = 255; row[o + 2] = 0; }
      else if (x < W / 2) { row[o] = 0; row[o + 1] = 0; row[o + 2] = 255; }
      else { row[o] = 255; row[o + 1] = 255; row[o + 2] = 0; }
      row[o + 3] = 255;
    }
  }
  enc.writeRows(row, 8);
}
const jpg = new Uint8Array(await enc.finish().arrayBuffer());
const psd = await largeZipFixture(9390, 20000, { compression: 'rle' });

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({
  executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: WEBGPU_ARGS,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint, null, { timeout: 60000 });

  const run = async (label, file, width, height, sample, quickPng = false) => {
    await page.setInputFiles('#file', file);
    await page.waitForFunction(() => {
      const l = window.__psd_editor.state.doc?.layers?.[0];
      return l && l.width > 1 && (l.lazyChannels || l.lazyRasterSource || l.rgba);
    }, null, { timeout: 180000 });
    await page.waitForTimeout(900);
    const out = await page.evaluate(async ({ width, height, sample, quickPng }) => {
      const A = window.__psd_editor, M = await import('/editor/app/28-layer-props-transform.js');
      const X = await import('/editor/app/48-info-export.js');
      const t = M.ensureLayerTransform(0);
      t.rot = 90; t.w = width / 2; t.h = height / 2; t.x = (width - t.w) / 2; t.y = (height - t.h) / 2;
      let png = null;
      if (quickPng) {
        const blobs = [], orig = URL.createObjectURL;
        URL.createObjectURL = b => { try { if (b instanceof Blob) blobs.push(b); } catch {} return orig(b); };
        try { await X.quickExportPng(); } finally { URL.createObjectURL = orig; }
        const bm0 = await createImageBitmap(blobs[0]);
        const tw0 = 400, th0 = Math.round(400 * height / width), cv0 = new OffscreenCanvas(tw0, th0), g0 = cv0.getContext('2d');
        g0.drawImage(bm0, 0, 0, tw0, th0);
        const P0 = (dx, dy) => [...g0.getImageData(Math.floor(dx / width * tw0), Math.floor(dy / height * th0), 1, 1).data];
        png = { dims: [bm0.width, bm0.height], px: { outside: P0(200, 200), center: P0(width / 2, height / 2) } };
      }
      const built = await A.buildPsdBuffer({ fast: true });
      const bytes = built.buf;
      await A.loadPsd(new File([bytes], 'transform.psd'));
      await new Promise(r => setTimeout(r, 1200));
      const L = A.state.doc.layers[0];
      const j = await X.writeLazyJpeg(L, 0, null, 70, null, null);
      const tw = 400, th = Math.round(400 * height / width);
      const bm = await createImageBitmap(j.blob, { resizeWidth: tw, resizeHeight: th });
      const cv = new OffscreenCanvas(tw, th), g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
      const px = (dx, dy) => [...g.getImageData(Math.floor(dx / width * tw), Math.floor(dy / height * th), 1, 1).data];
      return { bytes: bytes.byteLength || bytes.length, staleSource: !!L.lazyRasterFile, px: Object.fromEntries(sample.map(s => [s[0], px(s[1], s[2])])), png };
    }, { width, height, sample, quickPng });
    console.log(label, JSON.stringify(out));
    assert.equal(out.staleSource, false, `${label}: 重新载入后不能挂着上一份文档的惰性原图源`);
    return out;
  };

  const isColor = (p, r, g, b) => Math.abs(p[0] - r) < 70 && Math.abs(p[1] - g) < 70 && Math.abs(p[2] - b) < 70;

  const img = await run('72MP JPG', { name: 'large-quad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) }, W, H,
    [['red', 5500, 2875], ['green', 5500, 5125], ['yellow', 3500, 5125], ['blue', 3500, 2875], ['outside', 100, 100]]);
  assert.ok(isColor(img.px.red, 255, 0, 0), '旋转后左上象限应为红色');
  assert.ok(isColor(img.px.green, 0, 255, 0), '旋转后右上象限应为绿色');
  assert.ok(isColor(img.px.yellow, 255, 255, 0), '旋转后右下象限应为黄色（JPEG 取样）');
  assert.ok(isColor(img.px.blue, 0, 0, 255), '旋转后左下象限应为蓝色');
  assert.ok(img.px.outside.every(v => v > 245), '缩放到 50% 后四角应露出白底');

  const huge = await run('187MP PSD', { name: 'large-transform.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(psd) }, 9390, 20000,
    [['outside', 200, 200], ['center', 4695, 10000]], true);
  assert.deepEqual(huge.png?.dims, [9390, 20000], '187MP 变换 PNG 应保持原始尺寸（流式仿射导出版本）');
  assert.equal(huge.png?.px.outside[3], 0, '187MP 变换 PNG 四角应透明');
  assert.ok(Math.max(...(huge.png?.px.center || [255, 255, 255]).slice(0, 3)) < 250 || (huge.png?.px.center || [255,255,255]).some(v => v < 220), '187MP 变换 PNG 中心应保留图内容');
  assert.ok(huge.px.outside.every(v => v > 245), 'PSD 旋转缩放后四角应透明（JPG 白底）');
  assert.ok(Math.max(...huge.px.center.slice(0, 3)) < 250 || Math.min(...huge.px.center.slice(0, 3)) < 220, 'PSD 中心应保留图内容');
  assert.ok(huge.bytes > psd.byteLength * 0.5, 'PSD 变换应重新编码图层像素');


  const noopTf = await page.evaluate(async () => {
    const A = window.__psd_editor, M = await import('/editor/app/28-layer-props-transform.js');
    M.ensureLayerTransform(0);
    try { const b = await A.buildPsdBuffer({ fast: true }); return { ok: true, bytes: b.buf.byteLength || b.buf.length }; }
    catch (e) { return { err: String(e.message || e) }; }
  });
  assert.equal(noopTf.err, undefined, '无实际改动的变换记录不应阻止保存');


  await page.setInputFiles('#file', { name: 'large-quad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && l.width > 1 && (l.lazyRasterSource || l.rgba);
  }, null, { timeout: 180000 });
  await page.waitForTimeout(900);
  const png = await page.evaluate(async ({ width, height }) => {
    const A = window.__psd_editor, M = await import('/editor/app/28-layer-props-transform.js');
    const X = await import('/editor/app/48-info-export.js');
    const t = M.ensureLayerTransform(0);
    t.rot = 90; t.w = width / 2; t.h = height / 2; t.x = (width - t.w) / 2; t.y = (height - t.h) / 2;
    const blobs = [], orig = URL.createObjectURL;
    URL.createObjectURL = b => { try { if (b instanceof Blob) blobs.push(b); } catch {} return orig(b); };
    try { await X.quickExportPng(); } finally { URL.createObjectURL = orig; }
    const bm = await createImageBitmap(blobs[0]);
    const tw = 400, th = Math.round(400 * height / width);
    const cv = new OffscreenCanvas(tw, th), g = cv.getContext('2d'); g.drawImage(bm, 0, 0, tw, th);
    const P = (dx, dy) => [...g.getImageData(Math.floor(dx / width * tw), Math.floor(dy / height * th), 1, 1).data];
    return { dims: [bm.width, bm.height], px: { red: P(5500, 2875), green: P(5500, 5125), blue: P(3500, 2875), yellow: P(3500, 5125), outside: P(100, 100) } };
  }, { width: W, height: H });
  assert.deepEqual(png.dims, [W, H], 'PNG 导出应保持原始尺寸');
  assert.ok(isColor(png.px.red, 255, 0, 0) && isColor(png.px.green, 0, 255, 0), 'PNG 导出应包含旋转变换');
  assert.ok(isColor(png.px.blue, 0, 0, 255) && isColor(png.px.yellow, 255, 255, 0), 'PNG 导出四个象限都应正确');
  assert.ok(png.px.outside[3] === 0, 'PNG 旋转后的四角应透明');
  console.log('PNG quick export', JSON.stringify(png));


  await page.setInputFiles('#file', { name: 'large-quad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
  await page.waitForFunction(() => { const l = window.__psd_editor.state.doc?.layers?.[0]; return l && l.width > 1 && (l.lazyRasterSource || l.rgba); }, null, { timeout: 180000 });
  await page.waitForTimeout(900);
  const region = await page.evaluate(async ({ width, height }) => {
    const A = window.__psd_editor, M = await import('/editor/app/28-layer-props-transform.js'), R = await import('/editor/app/30-render.js');
    const t = M.ensureLayerTransform(0);
    t.rot = 90; t.w = width / 2; t.h = height / 2; t.x = (width - t.w) / 2; t.y = (height - t.h) / 2;
    const at = async (x, y) => { const r = await R.compositeRegionRGBA(x - 12, y - 12, x + 12, y + 12); if (!r) return null; const o = (12 * r.width + 12) * 4; return [...r.data.subarray(o, o + 4)]; };
    return { red: await at(5500, 2875), blue: await at(3500, 2875), outside: await at(100, 100) };
  }, { width: W, height: H });
  assert.ok(isColor(region.red, 255, 0, 0), '局部合成取样应读取旋转后的红色象限');
  assert.ok(isColor(region.blue, 0, 0, 255), '局部合成取样应读取旋转后的蓝色象限');
  assert.equal(region.outside[3], 0, '变换后空白区域的取样应透明');
  console.log('region composite', JSON.stringify(region));


  await page.setInputFiles('#file', { name: 'large-quad.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
  await page.waitForFunction(() => { const l = window.__psd_editor.state.doc?.layers?.[0]; return l && l.width > 1 && (l.lazyRasterSource || l.rgba); }, null, { timeout: 180000 });
  await page.waitForTimeout(900);
  const quad = await page.evaluate(async ({ width, height }) => {
    const A = window.__psd_editor, M = await import('/editor/app/28-layer-props-transform.js'), Q = await import('/core/quad-warp.js'),
      R = await import('/editor/app/30-render.js'), X = await import('/editor/app/48-info-export.js');
    const t = M.ensureLayerTransform(0), q = [[1500, 0], [7500, 1000], [9000, 8000], [0, 7000]];
    t.quad = q; t.x = 0; t.y = 0; t.w = width; t.h = height;
    const fwd = Q.quadMatrix(width, height, q), pts = { red: Q.applyMatrix(fwd, 2250, 2000), green: Q.applyMatrix(fwd, 6750, 2000), blue: Q.applyMatrix(fwd, 2250, 6000), yellow: Q.applyMatrix(fwd, 6750, 6000) };
    const rr = await R.compositeRegionRGBA(pts.red[0] - 12, pts.red[1] - 12, pts.red[0] + 12, pts.red[1] + 12);
    const regionRed = rr ? [...rr.data.subarray((12 * rr.width + 12) * 4, (12 * rr.width + 12) * 4 + 4)] : null;
    const blobs = [], orig = URL.createObjectURL;
    URL.createObjectURL = b => { try { if (b instanceof Blob) blobs.push(b); } catch {} return orig(b); };
    try { await X.quickExportPng(); } finally { URL.createObjectURL = orig; }
    const bm = await createImageBitmap(blobs[0], { resizeWidth: 600, resizeHeight: Math.round(600 * height / width) });
    const cv = new OffscreenCanvas(bm.width, bm.height), g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
    const P = p => [...g.getImageData(Math.min(bm.width - 1, Math.floor(p[0] / width * bm.width)), Math.min(bm.height - 1, Math.floor(p[1] / height * bm.height)), 1, 1).data];
    return { regionRed, png: Object.fromEntries(Object.entries(pts).map(([k, p]) => [k, P(p)])) };
  }, { width: W, height: H });
  assert.ok(isColor(quad.regionRed, 255, 0, 0), '透视变换的局部取样应命中红色象限');
  assert.ok(isColor(quad.png.red, 255, 0, 0) && isColor(quad.png.green, 0, 255, 0), '透视 PNG 红/绿象限应正确');
  assert.ok(isColor(quad.png.blue, 0, 0, 255) && isColor(quad.png.yellow, 255, 255, 0), '透视 PNG 蓝/黄象限应正确');
  console.log('perspective quad', JSON.stringify(quad));

  assert.deepEqual(errors, [], '页面不应出现异常');
  console.log('✓ 超大 JPG/PSD 的旋转+缩放导出正确，重新载入不继承旧惰性源');
} finally {
  await browser.close();
}
