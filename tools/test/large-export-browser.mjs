
import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
import { largeZipFixture } from './large-zip-fixture.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const buf = await largeZipFixture(9390, 20000, { compression: 'rle' });
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
  await page.setInputFiles('#file', { name: 'large-187.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: buf });
  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && (l.lazyChannels || l.rgba);
  }, null, { timeout: 180000 });
  await page.waitForTimeout(700);

  const out = await page.evaluate(async () => {
    const A = window.__psd_editor, M = await import('/editor/app/48-info-export.js'), L = A.state.doc.layers[0];
    const TE = await import('/core/tiff-encode.js'), TD = await import('/core/formats/tiff-decode.js');
    const sw = 257, sh = 193;
    const small = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const o = (y * sw + x) * 4;
      small[o] = Math.round(x * 255 / (sw - 1)); small[o + 1] = Math.round(y * 255 / (sh - 1)); small[o + 2] = 77; small[o + 3] = (x + y) % 2 ? 255 : 128;
    }
    const ts = performance.now();
    const smallBlob = await TE.encodeTiffStreaming({ width: sw, height: sh, rowsPerStrip: 64,
      readRows: (y, rows) => small.subarray(y * sw * 4, (y + rows) * sw * 4) });
    const inflate = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const smallImg = await TD.decodeTIFF(new Uint8Array(await smallBlob.arrayBuffer()), { inflate });
    const sp = (x, y) => [...smallImg.rgba.subarray((y * sw + x) * 4, (y * sw + x) * 4 + 4)];
    const tiffSmall = { ms: Math.round(performance.now() - ts), w: smallImg.width, h: smallImg.height, p00: sp(0, 0), p11: sp(sw - 1, 0), pm: sp(128, 96) };
    const tw = performance.now();
    const webp = await M.writeLazyCanvas(L, 0, null, 'image/webp', 90, null, null);
    const webpMs = Math.round(performance.now() - tw);
    const bmp = await createImageBitmap(webp.blob, { resizeWidth: 256, resizeHeight: 256 });
    const cv = new OffscreenCanvas(256, 256), g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    const center = [...g.getImageData(128, 128, 1, 1).data];
    const tp = performance.now();
    const pdf = await M.writeLazyPdf(L, 0, null, 90, null, null);
    const pdfMs = Math.round(performance.now() - tp);
    const bytes = new Uint8Array(await pdf.blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 200000)));
    const tt = performance.now();
    const tiff = await M.writeLazyTiff(L, 0, null, null, null);
    const tbytes = new Uint8Array(await tiff.blob.arrayBuffer());
    const dv = new DataView(tbytes.buffer), u16 = o => dv.getUint16(o, tbytes[0] === 0x49), u32 = o => dv.getUint32(o, tbytes[0] === 0x49);
    const ifd = u32(4), n = u16(ifd), tags = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
      const vo = (type === 3 && cnt === 1) ? e + 8 : (cnt * ({ 3: 2, 4: 4 }[type] || 1) <= 4 ? e + 8 : u32(e + 8));
      tags[tag] = { type, cnt, vo };
    }
    const val = tag => { const t = tags[tag]; if (!t) return null; const out = []; for (let i = 0; i < t.cnt; i++) out.push(t.type === 3 ? u16(t.vo + i * 2) : u32(t.vo + i * 4)); return out; };
    const tiffHuge = { ms: Math.round(performance.now() - tt), bytes: tbytes.length, w: val(256), h: val(257), comp: val(259),
      spp: val(277), extra: val(338), bps: val(258), strips: val(273)?.length };
    return {
      tiffSmall, webpMs, webpBytes: webp.blob.size, w: bmp.width, h: bmp.height, center,
      pdfMs, pdfBytes: bytes.length, pdfHead: String.fromCharCode(...bytes.subarray(0, 8)),
      pdfPage: pdf.page, pdfDct: text.includes('/DCTDecode'), pdfW: text.includes('/Width 9390'),
      pdfH: text.includes('/Height 20000'), tiffHuge, err: document.querySelector('#err')?.textContent || '',
    };
  });
  console.log(JSON.stringify(out));
  assert.equal(out.tiffSmall.w, 257);
  assert.equal(out.tiffSmall.h, 193);
  assert.ok(Math.abs(out.tiffSmall.p00[0] - 0) <= 1 && Math.abs(out.tiffSmall.p00[2] - 77) <= 1);
  assert.ok(Math.abs(out.tiffSmall.p11[0] - 255) <= 1 && Math.abs(out.tiffSmall.p11[2] - 77) <= 1);
  assert.ok(Math.abs(out.tiffSmall.pm[0] - 128) <= 2 && Math.abs(out.tiffSmall.pm[1] - 128) <= 2);
  assert.deepEqual(out.tiffHuge.w, [9390]);
  assert.deepEqual(out.tiffHuge.h, [20000]);
  assert.deepEqual(out.tiffHuge.comp, [8]);
  assert.deepEqual(out.tiffHuge.spp, [4]);
  assert.deepEqual(out.tiffHuge.extra, [2]);
  assert.deepEqual(out.tiffHuge.bps, [8, 8, 8, 8]);
  assert.equal(out.tiffHuge.strips, 79);
  assert.ok(out.tiffHuge.bytes > 1000);
  assert.equal(out.w, 256);
  assert.equal(out.h, 256);
  assert.ok(out.webpBytes > 1000);
  assert.ok(Math.abs(out.center[0] - 171) <= 4);
  assert.ok(Math.abs(out.center[1] - 65) <= 4);
  assert.ok(Math.abs(out.center[2] - 211) <= 4);
  assert.equal(out.pdfHead, '%PDF-1.4');
  assert.ok(out.pdfBytes > 1000);
  assert.ok(out.pdfPage.w <= 14400 && out.pdfPage.h <= 14400);
  assert.equal(out.pdfDct, true);
  assert.equal(out.pdfW, true);
  assert.equal(out.pdfH, true);
  assert.equal(out.err, '');

  const maskedBuf = await largeZipFixture(9390, 20000, { compression: 'rle', mask: true });
  await page.setInputFiles('#file', { name: 'large-masked.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: maskedBuf });
  await page.waitForFunction(() => {
    const l = window.__psd_editor.state.doc?.layers?.[0];
    return l && (l.lazyChannels || l.rgba) && l.mask && l.mask.lazyChannel;
  }, null, { timeout: 180000 });
  await page.waitForTimeout(500);
  const masked = await page.evaluate(async () => {
    const A = window.__psd_editor, M = await import('/editor/app/48-info-export.js'), L = A.state.doc.layers[0];
    const sample = async (blob) => {
      const bmp = await createImageBitmap(blob, { resizeWidth: 256, resizeHeight: 256 });
      const cv = new OffscreenCanvas(256, 256), g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
      const p = g.getImageData(0, 0, 256, 256).data;
      const at = x => [...p.subarray((128 * 256 + x) * 4, (128 * 256 + x) * 4 + 4)];
      return { left: at(50), right: at(230) };
    };
    const jpeg = await sample((await M.writeLazyJpeg(L, 0, null, 90, null, null)).blob);
    const webp = await sample((await M.writeLazyCanvas(L, 0, null, 'image/webp', 90, null, null)).blob);
    return { jpeg, webp, err: document.querySelector('#err')?.textContent || '' };
  });
  console.log(JSON.stringify(masked));
  assert.ok(Math.abs(masked.jpeg.left[0] - 171) <= 4 && Math.abs(masked.jpeg.left[1] - 65) <= 4 && Math.abs(masked.jpeg.left[2] - 211) <= 4);
  assert.deepEqual(masked.jpeg.right, [255, 255, 255, 255]);
  assert.ok(Math.abs(masked.webp.left[0] - 171) <= 4 && Math.abs(masked.webp.left[1] - 65) <= 4 && Math.abs(masked.webp.left[2] - 211) <= 4);
  assert.equal(masked.webp.right[3], 0);
  assert.equal(masked.err, '');


  await page.waitForFunction(() => window.__psd_editor.actions.enabled('layer.new'), null, { timeout: 120000 });
  const grouped = await page.evaluate(async () => {
    const A = window.__psd_editor, out = {};
    A.selectLayers([0]);
    out.grouped = await A.actions.run('layer.group');
    await new Promise(r => setTimeout(r, 1500));
    out.names = A.state.doc.layers.map(l => l.name);
    out.markers = A.state.doc.layers.filter(l => l.group).length;
    const blobs = [], orig = URL.createObjectURL;
    URL.createObjectURL = b => { try { if (b instanceof Blob) { blobs.push(b); } } catch {} return orig(b); };
    const X = await import('/editor/app/48-info-export.js');
    try { await X.quickExportPng(); } finally { URL.createObjectURL = orig; }
    const bm = await createImageBitmap(blobs[0], { resizeWidth: 256, resizeHeight: 256 });
    const cv = new OffscreenCanvas(256, 256), g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
    out.png = { bytes: blobs[0]?.size || 0, center: [...g.getImageData(64, 128, 1, 1).data] };

    const V = await import('/editor/app/27-gradient-editor.js');
    const gi = A.state.doc.layers.findIndex(l => l.group?.type === 1);
    V.setLayerVisible(gi, false); await new Promise(r => setTimeout(r, 500));
    const hb = [], orig2 = URL.createObjectURL;
    URL.createObjectURL = b => { try { if (b instanceof Blob) hb.push(b); } catch {} return orig2(b); };
    try { await X.quickExportPng(); } finally { URL.createObjectURL = orig2; }
    const bm2 = await createImageBitmap(hb[0], { resizeWidth: 256, resizeHeight: 256 });
    const cv2 = new OffscreenCanvas(256, 256), g2 = cv2.getContext('2d'); g2.drawImage(bm2, 0, 0);
    out.hiddenGroup = { bytes: hb[0]?.size || 0, center: [...g2.getImageData(64, 128, 1, 1).data] };
    V.setLayerVisible(gi, true); await new Promise(r => setTimeout(r, 300));
    const b = await A.buildPsdBuffer({ fast: true });
    await A.loadPsd(new File([b.buf], 'grouped.psd')); await new Promise(r => setTimeout(r, 1200));
    out.reopen = { names: A.state.doc.layers.map(l => l.name), groups: A.state.doc.layers.filter(l => l.group).length };
    out.err = document.querySelector('#err')?.textContent || '';
    return out;
  });
  console.log(JSON.stringify(grouped));
  assert.equal(grouped.grouped, true);
  assert.ok(grouped.markers >= 2);
  assert.ok(grouped.png.bytes > 1000);
  assert.ok(Math.abs(grouped.png.center[0] - 171) <= 4 && Math.abs(grouped.png.center[1] - 65) <= 4);
  assert.equal(grouped.hiddenGroup.center[3], 0, '隐藏组后流式 PNG 应透明');
  assert.equal(grouped.reopen.groups, grouped.markers);
  assert.equal(grouped.err, '');
  assert.deepEqual(errors, []);
  console.log('✓ 187MP WebP / TIFF 与 JPEG→PDF 导出尺寸/颜色/页面均正确；带蒙版 JPG/WebP 正确应用蒙版；直通组 PNG/PSD 导出正常');
} finally {
  await browser.close();
}
