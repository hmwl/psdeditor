






import { encodeBMP, encodeTGA, encodePNM, encodeICO, encodeHDR, encodeEXR, rgbaToLinearFloat } from '../../core/formats/raster-codecs.js';
import { quantizeRGBA, encodeGif, encodePng8 } from '../../core/web-formats.js';
import { writePdf } from '../../core/pdf-write.js';

export const EXTRA_FORMATS = {
  bmp: { ext: 'bmp', mime: 'image/bmp', label: 'BMP' },
  tga: { ext: 'tga', mime: 'image/x-tga', label: 'Targa' },
  gif: { ext: 'gif', mime: 'image/gif', label: 'GIF' },
  png8: { ext: 'png', mime: 'image/png', label: 'PNG-8' },
  ico: { ext: 'ico', mime: 'image/x-icon', label: 'ICO 图标' },
  ppm: { ext: 'ppm', mime: 'image/x-portable-pixmap', label: 'PPM' },
  pam: { ext: 'pam', mime: 'image/x-portable-arbitrarymap', label: 'PAM' },
  hdr: { ext: 'hdr', mime: 'image/vnd.radiance', label: 'Radiance HDR' },
  exr: { ext: 'exr', mime: 'image/x-exr', label: 'OpenEXR' },
  pdf: { ext: 'pdf', mime: 'application/pdf', label: 'Photoshop PDF' },
};
const deflate = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const blobBytes = (cv, mime, quality) => new Promise((res, rej) => cv.toBlob(b => {
  if (!b) { rej(new Error(`${mime} 编码失败：浏览器返回空 Blob`)); return; }
  b.arrayBuffer().then(a => res(new Uint8Array(a)), rej);
}, mime, quality));
const pngOf = (c, w, h) => new Promise((res, rej) => {
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h);
  blobBytes(t, 'image/png').then(res, rej);
});






export async function encodeCanvas(fmt, cv, o = {}) {
  const W = cv.width, H = cv.height, mime = (EXTRA_FORMATS[fmt] || {}).mime || 'application/octet-stream';
  let bytes;
  switch (fmt) {
    case 'bmp': bytes = encodeBMP(pixels(cv), W, H, { alpha: true }); break;
    case 'tga': bytes = encodeTGA(pixels(cv), W, H, { rle: true }); break;
    case 'ppm': bytes = encodePNM(pixels(cv), W, H, 'ppm'); break;
    case 'pam': bytes = encodePNM(pixels(cv), W, H, 'pam'); break;
    case 'gif': case 'png8': {
      const q = quantizeRGBA(pixels(cv), W, H, { colors: o.colors || 256, dither: o.dither !== false ? 'diffusion' : 'none', transparency: true });
      bytes = fmt === 'gif' ? encodeGif(q.idx, W, H, q.pal, { transIndex: q.transIndex ?? -1 })
        : await encodePng8(q.idx, W, H, q.pal, { transIndex: q.transIndex ?? -1, deflate });
      break;
    }
    case 'ico': {
      const sizes = (o.icoSizes || [16, 24, 32, 48, 64, 128, 256]).filter(s => s <= Math.max(W, H) * 2 || s <= 32);
      const entries = [];
      for (const s of sizes) entries.push({ width: s, height: s, png: await pngOf(cv, s, s) });
      bytes = encodeICO(entries);
      break;
    }
    case 'hdr': bytes = encodeHDR(rgbaToLinearFloat(pixels(cv), W, H), W, H); break;
    case 'exr': bytes = await encodeEXR(rgbaToLinearFloat(pixels(cv), W, H), W, H, { deflate }); break;
    case 'pdf': {
      const ppi = o.ppi || 72, pw = W / ppi * 72, ph = H / ppi * 72;
      let image;
      if (o.pdfCompression === 'jpeg') {
        const flat = document.createElement('canvas'); flat.width = W; flat.height = H;
        const g = flat.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(cv, 0, 0);
        const jpeg = await blobBytes(flat, 'image/jpeg', (o.quality || 92) / 100);
        image = { jpeg };
      } else {
        const px = pixels(cv), rgb = new Uint8Array(W * H * 3), a = new Uint8Array(W * H);
        let anyAlpha = false;
        for (let i = 0; i < W * H; i++) { rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2]; a[i] = px[i * 4 + 3]; if (a[i] !== 255) anyAlpha = true; }
        image = { flate: await deflate(rgb), ...(anyAlpha ? { smask: await deflate(a) } : {}) };
      }
      bytes = writePdf([{ width: pw, height: ph, images: [{ ...image, pw: W, ph: H, x: 0, y: 0, w: pw, h: ph }] }], { title: o.title || '' });
      break;
    }
    default: throw new Error('不支持的导出格式：' + fmt);
  }
  return new Blob([bytes], { type: mime });
}

export default { EXTRA_FORMATS, encodeCanvas };
