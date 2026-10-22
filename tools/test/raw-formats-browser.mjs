
import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
import { largeZipFixture } from './large-zip-fixture.mjs';

const psd = await largeZipFixture(300, 200, { compression: 'rle' });
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
  await page.setInputFiles('#file', { name: 'raw-formats.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from(psd) });
  await page.waitForFunction(() => { const l = window.__psd_editor.state.doc?.layers?.[0]; return l && l.width > 1; }, null, { timeout: 120000 });
  await page.waitForTimeout(500);

  const out = await page.evaluate(async () => {
    const A = window.__psd_editor, X = await import('/editor/app/48-info-export.js');
    const L = A.state.doc.layers[0], enc = new TextEncoder();
    const bytes = async (blob, start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
    const res = {};
    for (const fmt of ['ppm', 'pam', 'tga', 'bmp', 'hdr']) {
      const { blob } = await X.writeLazyRawImage(L, 0, null, fmt, null, null, null, false);
      res[fmt] = { size: blob.size, type: blob.type };
      if (fmt === 'ppm') {
        const head = new TextDecoder('latin1').decode(await bytes(blob, 0, 40));
        res[fmt].head = head.split('\n').slice(0, 3);
        const off = enc.encode(`P6\n300 200\n255\n`).length;
        res[fmt].px = [...await bytes(blob, off, off + 4)];
      } else if (fmt === 'pam') {
        const head = new TextDecoder('latin1').decode(await bytes(blob, 0, 80));
        res[fmt].head = head.split('\n').slice(0, 7);
        const off = enc.encode(`P7\nWIDTH 300\nHEIGHT 200\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`).length;
        res[fmt].px = [...await bytes(blob, off, off + 4)];
      } else if (fmt === 'tga' || fmt === 'bmp') {
        const off = fmt === 'tga' ? 18 : 54;
        res[fmt].header = [...await bytes(blob, 0, off)];
        res[fmt].px = [...await bytes(blob, off, off + 4)];
      } else if (fmt === 'hdr') {
        res[fmt].head = new TextDecoder('latin1').decode(await bytes(blob, 0, 60));
      }
    }
    const sample = async blob => {
      const bm = await createImageBitmap(blob), cv = new OffscreenCanvas(1, 1), g = cv.getContext('2d'); g.drawImage(bm, 0, 0, 1, 1);
      return [...g.getImageData(0, 0, 1, 1).data];
    };
    const exr = await X.writeLazyExr(L, 0, null, null, null, null, false);
    const { decodeEXR } = await import('/core/formats/raster-codecs.js');
    const dec = await decodeEXR(new Uint8Array(await exr.blob.arrayBuffer()));
    res.exr = { size: exr.blob.size, w: dec.width, h: dec.height, px: [...dec.float.slice((100 * 300 + 150) * 4, (100 * 300 + 150) * 4 + 4)] };
    const p8 = await X.writeLazyPng8(L, 0, null, null, null, null, false);
    res.png8 = { size: p8.blob.size, type: p8.blob.type, head: [...await bytes(p8.blob, 0, 26)], px: await sample(p8.blob) };
    const gif = await X.writeLazyGif(L, 0, null, null, null, null, false);
    res.gif = { size: gif.blob.size, type: gif.blob.type, head: new TextDecoder('latin1').decode(await bytes(gif.blob, 0, 13)), px: await sample(gif.blob) };
    const p8h = await X.writeLazyPng8(L, 0, null, null, null, null, true);
    const gifh = await X.writeLazyGif(L, 0, null, null, null, null, true);
    res.hidden = { png8: await sample(p8h.blob), gif: await sample(gifh.blob) };
    return res;
  });
  console.log(JSON.stringify(out));
  assert.deepEqual(out.ppm.head, ['P6', '300 200', '255']);
  assert.deepEqual(out.ppm.px.slice(0, 3), [171, 65, 211]);
  assert.deepEqual(out.pam.head.slice(0, 5), ['P7', 'WIDTH 300', 'HEIGHT 200', 'DEPTH 4', 'MAXVAL 255']);
  assert.deepEqual(out.pam.px, [171, 65, 211, 255]);
  assert.equal(out.tga.header[2], 2);
  assert.equal(out.tga.header[16], 32);
  assert.deepEqual(out.tga.px, [211, 65, 171, 255]);
  assert.deepEqual([...out.bmp.header.slice(0, 2)], [0x42, 0x4d]);
  assert.deepEqual(out.bmp.px, [211, 65, 171, 255]);
  assert.match(out.hdr.head, /^#\?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 200 \+X 300\n/);
  assert.equal(out.exr.w, 300);
  assert.equal(out.exr.h, 200);
  assert.ok(Math.abs(out.exr.px[0] - 0.407) < 0.01 && Math.abs(out.exr.px[1] - 0.0529) < 0.01 && Math.abs(out.exr.px[2] - 0.651) < 0.01, 'EXR 线性半浮点颜色');
  assert.equal(out.exr.px[3], 1);
  assert.equal(out.png8.head[0], 137);
  assert.equal(out.png8.head[25], 3, 'PNG-8 应是索引色 (color type 3)');
  assert.deepEqual(out.png8.px, [171, 65, 211, 255]);
  assert.match(out.gif.head, /^GIF89a/);
  assert.deepEqual(out.gif.px.slice(0, 3), [171, 65, 211]);
  assert.equal(out.hidden.png8[3], 0);
  assert.equal(out.hidden.gif[3], 0);
  assert.deepEqual(errors, []);
  console.log('✓ PPM / PAM / TGA / BMP / HDR / EXR / PNG-8 / GIF 流式编码头部与像素正确');
} finally {
  await browser.close();
}
