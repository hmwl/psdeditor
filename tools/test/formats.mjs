
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
const here = path.dirname(fileURLToPath(import.meta.url)), FX = path.join(here, 'fixtures/formats');
const C = await import('../../core/formats/raster-codecs.js');
const { decodeTIFF } = await import('../../core/formats/tiff-decode.js');
const inflate = async u => new Uint8Array(zlib.inflateSync(Buffer.from(u)));
const deflate = async u => new Uint8Array(zlib.deflateSync(Buffer.from(u)));
let fail = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) fail++; console.log(c ? '✓' : '✗', msg); };
const read = f => new Uint8Array(fs.readFileSync(path.join(FX, f)));

const ref = C.decodePNM(read('t.pam'));
const diff = (a, b, rgbOnly = false) => { let m = 0; for (let i = 0; i < a.length; i++) { if (rgbOnly && i % 4 === 3) continue; m = Math.max(m, Math.abs(a[i] - b[i])); } return m; };
ok(ref.width === 97 && ref.height === 61, 'PAM 参考 97×61');
for (const f of ['t_None.tif', 't_LZW.tif', 't_Zip.tif', 't_PackBits.tif', 't_tiled.tif', 't_16zip.tif', 't_pred.tif', 't_planar.tif']) {
  const d = await decodeTIFF(read(f), { inflate });
  const alpha = !/pred/.test(f);
  ok(d.width === 97 && d.height === 61 && diff(ref.rgba, d.rgba, !alpha) <= 1, `TIFF ${f}（最大差 ${diff(ref.rgba, d.rgba, !alpha)}）`);
}
{ const d = await decodeTIFF(read('t_gray.tif'), { inflate }); const g = C.decodePNM(read('t.pgm')); ok(diff(g.rgba, d.rgba) <= 1, 'TIFF 灰度 LZW vs PGM'); }
{ const d = await decodeTIFF(read('t_cmyk.tif'), { inflate }); ok(diff(ref.rgba, d.rgba, true) <= 3, `TIFF CMYK（最大差 ${diff(ref.rgba, d.rgba, true)}）`); }
for (const f of ['t.tga', 't_rle.tga']) { const d = C.decodeTGA(read(f)); ok(diff(ref.rgba, d.rgba) <= 1, `TGA ${f}（PIL 写的，最大差 ${diff(ref.rgba, d.rgba)}）`); }
{ const d = C.decodePNM(read('t.ppm')); ok(diff(ref.rgba, d.rgba, true) <= 0, 'PPM'); }
{ const d = C.decodeICO(read('t.ico')); ok(d.length === 3 && d[0].width === 48, 'ICO 三个尺寸（' + d.map(x => x.width + (x.png ? 'png' : 'bmp')).join(' ') + '）'); }
{ const d = C.decodeHDR(read('t.hdr')); const t = C.toneMapFloat(d, { gamma: 1 }); ok(d.width === 97 && diff(ref.rgba, t.rgba, true) <= 3, `HDR（ImageMagick 写的不做线性化，按 γ=1 比；最大差 ${diff(ref.rgba, t.rgba, true)}）`); }

const fr = new Float32Array(fs.readFileSync(path.join(FX, 'exr_ref.f32')).buffer.slice(0));
for (const f of fs.readdirSync(FX).filter(f => f.endsWith('.exr'))) {
  const d = await C.decodeEXR(read(f), { inflate });
  let m = 0; for (let i = 0; i < fr.length; i++) m = Math.max(m, Math.abs(fr[i] - d.float[i]));
  ok(m < (/half/.test(f) ? 4e-3 : 1e-6), `EXR ${f}（最大差 ${m.toExponential(1)}）`);
}

const rgba = ref.rgba, W = ref.width, H = ref.height;
ok(diff(rgba, C.decodeTGA(C.encodeTGA(rgba, W, H)).rgba) === 0, 'TGA 写→读（RLE）');
ok(diff(rgba, C.decodeTGA(C.encodeTGA(rgba, W, H, { rle: false })).rgba) === 0, 'TGA 写→读（未压缩）');
ok(diff(rgba, C.decodePNM(C.encodePNM(rgba, W, H, 'pam')).rgba) === 0, 'PAM 写→读');
ok(diff(rgba, C.decodePNM(C.encodePNM(rgba, W, H, 'ppm')).rgba, true) === 0, 'PPM 写→读');
{ const f = C.rgbaToLinearFloat(rgba, W, H); const back = C.toneMapFloat(C.decodeHDR(C.encodeHDR(f, W, H))).rgba; ok(diff(rgba, back, true) <= 12, `HDR 写→读（RGBE 三通道共用指数，暗通道精度有限）（最大差 ${diff(rgba, back, true)}）`); }
for (const z of [null, deflate]) { const f = C.rgbaToLinearFloat(rgba, W, H); const back = C.toneMapFloat(await C.decodeEXR(await C.encodeEXR(f, W, H, { deflate: z }), { inflate })).rgba; ok(diff(rgba, back) <= 1, `EXR 写→读（${z ? 'ZIP' : 'NONE'}，最大差 ${diff(rgba, back)}）`); }
{ const bmp = C.encodeBMP(rgba, W, H); ok(bmp[0] === 0x42 && bmp.length === 14 + 108 + W * H * 4, 'BMP 32 位写出（V4 头）'); }

console.log(`\n${n - fail}/${n} 通过`);
if (process.env.EXR_OUT) { const f = C.rgbaToLinearFloat(rgba, W, H); fs.writeFileSync(process.env.EXR_OUT, await C.encodeEXR(f, W, H, { deflate })); fs.writeFileSync(process.env.EXR_OUT + '.none.exr', await C.encodeEXR(f, W, H)); fs.writeFileSync(process.env.EXR_OUT + '.hdr', C.encodeHDR(f, W, H)); fs.writeFileSync(process.env.EXR_OUT + '.tga', C.encodeTGA(rgba, W, H)); fs.writeFileSync(process.env.EXR_OUT + '.bmp', C.encodeBMP(rgba, W, H)); }
process.exit(fail ? 1 : 0);
