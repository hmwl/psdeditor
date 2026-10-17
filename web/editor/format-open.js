











import { formDialog } from './dialog.js';
import { sniffFormat, decodeTGA, decodePNM, decodeICO, decodeHDR, decodeEXR, toneMapFloat } from '../../core/formats/raster-codecs.js';
import { decodeTIFF } from '../../core/formats/tiff-decode.js';

export const RAW_EXT = new Set(['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'raw', 'pef', 'ptx', 'dng', 'srw', 'x3f', '3fr', 'fff', 'iiq', 'erf', 'mef', 'mos', 'mrw', 'kdc', 'dcr', 'rwl', 'gpr']);
export const OWN_EXT = new Set(['tif', 'tiff', 'tga', 'icb', 'vda', 'vst', 'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'pfm', 'ico', 'cur', 'hdr', 'rgbe', 'exr', 'svg', 'svgz', 'pdf', 'ai', 'heic', 'heif', 'hif', 'jxl', ...RAW_EXT]);
export const extOf = name => ((String(name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();

export function needsFormatOpen(file, head = null) {
  const e = extOf(file && file.name);
  if (OWN_EXT.has(e)) return true;
  if (head) { const k = sniffFormat(head, file.name); return ['tiff', 'tga', 'pnm', 'ico', 'cur', 'hdr', 'exr', 'pdf'].includes(k); }
  return false;
}
const VENDOR = (() => { try { return new URL('/vendor/', location.href).href; } catch { return '/vendor/'; } })();
const vimport = p => import( VENDOR + p);

async function inflate(u8) {
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
function canvasOf(w, h, rgba) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  if (rgba) c.getContext('2d').putImageData(new ImageData(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), w, h), 0, 0);
  return c;
}
const fromBitmap = bmp => { const c = canvasOf(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); return c; };
async function nativeDecode(blob) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob); } catch {  } }
  return await new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('IMAGE_DECODE_FAILED')); };
    im.src = url;
  });
}


async function toneDialog(img, interactive, name) {
  let o = { exposure: 0, gamma: 0 };
  if (interactive) {
    
    const f = img.float, n = img.width * img.height, step = Math.max(1, Math.floor(n / 50000)), lum = [];
    for (let i = 0; i < n; i += step) lum.push(0.2126 * f[i * 4] + 0.7152 * f[i * 4 + 1] + 0.0722 * f[i * 4 + 2]);
    lum.sort((a, b) => a - b);
    const p99 = lum[Math.floor(lum.length * 0.99)] || 1, auto = p99 > 0 ? Math.round(-Math.log2(p99) * 10) / 10 : 0;
    const v = await formDialog('HDR 色调 — ' + name, [
      { type: 'note', label: `这是 ${img.width}×${img.height} 的浮点（线性光）图像。文档按 8 位打开：先用曝光度和灰度系数把它映射到显示范围（PS「HDR 色调 › 曝光度和灰度系数」同口径）。` },
      { key: 'exposure', label: '曝光度', type: 'number', value: Math.abs(auto) < 0.05 ? 0 : auto, min: -20, max: 20, step: 0.1, unit: 'EV' },
      { key: 'gamma', label: '灰度系数', type: 'number', value: 0, min: 0, max: 10, step: 0.1, unit: '（0 = sRGB 曲线）' },
    ], { okText: '打开' });
    if (!v) return null;
    o = { exposure: +v.exposure || 0, gamma: +v.gamma || 0 };
  }
  return toneMapFloat(img, o);
}


async function openSVG(file, interactive) {
  let text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('不是有效的 SVG');
  const num = v => { const m = /^([\d.]+)\s*(px|pt|mm|cm|in)?$/i.exec(String(v || '').trim()); if (!m) return 0; const k = { pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[(m[2] || '').toLowerCase()] || 1; return +m[1] * k; };
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  let w = num(svg.getAttribute('width')) || (vb.length === 4 ? vb[2] : 0) || 512, h = num(svg.getAttribute('height')) || (vb.length === 4 ? vb[3] : 0) || 512;
  let outW = Math.round(w), outH = Math.round(h);
  if (interactive) {
    const v = await formDialog('栅格化 SVG 格式', [
      { type: 'note', label: `${file.name}：原始尺寸 ${Math.round(w)} × ${Math.round(h)} 像素（96 ppi）` },
      { key: 'w', label: '宽度', type: 'number', value: outW, min: 1, max: 30000, unit: '像素' },
      { key: 'h', label: '高度', type: 'number', value: outH, min: 1, max: 30000, unit: '像素' },
      { key: 'keep', label: '约束比例', type: 'check', value: true },
    ], { okText: '打开' });
    if (!v) return null;
    outW = Math.round(v.w); outH = v.keep ? Math.max(1, Math.round(v.w * h / w)) : Math.round(v.h);
  }
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', outW); svg.setAttribute('height', outH);
  svg.setAttribute('preserveAspectRatio', 'none');
  text = new XMLSerializer().serializeToString(svg);
  const img = await nativeDecode(new Blob([text], { type: 'image/svg+xml' }));
  const c = canvasOf(outW, outH); c.getContext('2d').drawImage(img, 0, 0, outW, outH);
  return [{ canvas: c, width: outW, height: outH, name: file.name }];
}


let pdfjsP = null;
async function pdfjs() {
  if (!pdfjsP) pdfjsP = vimport('pdfjs/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.mjs'; return m; });
  return pdfjsP;
}
const parsePages = (s, n) => {
  const out = new Set();
  for (const part of String(s || '').split(/[,，\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part); if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(n, Math.max(a, b)); i++) out.add(i);
  }
  return [...out];
};
async function openPDF(file, interactive) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await lib.getDocument({ data, cMapUrl: VENDOR + 'pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: VENDOR + 'pdfjs/standard_fonts/', wasmUrl: VENDOR + 'pdfjs/wasm/', isEvalSupported: false }).promise;
  const n = pdf.numPages, p1 = await pdf.getPage(1), vp1 = p1.getViewport({ scale: 1 });
  let pages = [1], ppi = 300, box = 'crop';
  if (interactive) {
    const v = await formDialog('导入 PDF', [
      { type: 'note', label: `${file.name}：共 ${n} 页；第 1 页 ${(vp1.width / 72 * 25.4).toFixed(1)} × ${(vp1.height / 72 * 25.4).toFixed(1)} 毫米` },
      { key: 'pages', label: '页面', type: 'text', value: '1' },
      { type: 'note', label: '可以写 1,3,5-7；每一页打开成一个文档。' },
      { key: 'ppi', label: '分辨率', type: 'number', value: 300, min: 1, max: 2400, unit: '像素/英寸' },
      { key: 'box', label: '裁剪到', type: 'select', value: 'crop', options: [['crop', '裁剪框'], ['media', '媒体框']] },
    ], { okText: '导入' });
    if (!v) return null;
    pages = parsePages(v.pages, n); ppi = +v.ppi || 300; box = v.box;
    if (!pages.length) throw new Error('没有选中有效的页码（1–' + n + '）');
  }
  const out = [];
  for (const pn of pages) {
    const page = pn === 1 ? p1 : await pdf.getPage(pn);
    let scale = ppi / 72;
    let vp = page.getViewport({ scale });
    if (vp.width * vp.height > 400e6) { scale *= Math.sqrt(400e6 / (vp.width * vp.height)); vp = page.getViewport({ scale }); }   
    if (box === 'media' && page.view) vp = page.getViewport({ scale, offsetX: 0, offsetY: 0 });
    const c = canvasOf(Math.ceil(vp.width), Math.ceil(vp.height));
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    out.push({ canvas: c, width: c.width, height: c.height, name: n > 1 ? file.name.replace(/\.pdf$/i, '') + ` 第 ${pn} 页.pdf` : file.name, ppi: Math.round(scale * 72) });
  }
  try { pdf.destroy(); } catch {}
  return out;
}


async function openHEIF(file) {
  try { const b = await nativeDecode(file); return [{ canvas: fromBitmap(b), width: b.width, height: b.height, name: file.name }]; } catch {  }
  const m = await vimport('heif/libheif-bundle.mjs');
  let lib = m.default || m;
  if (typeof lib === 'function' && !lib.HeifDecoder) lib = await lib();
  const dec = new lib.HeifDecoder();
  const imgs = dec.decode(new Uint8Array(await file.arrayBuffer()));
  if (!imgs || !imgs.length) throw new Error('HEIC 里没有能解的图像');
  const im = imgs[0], w = im.get_width(), h = im.get_height();
  const rgba = await new Promise((res, rej) => im.display({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }, d => d ? res(d.data) : rej(new Error('HEIC 解码失败'))));
  try { for (const x of imgs) x.free && x.free(); } catch {}
  return [{ canvas: canvasOf(w, h, rgba), width: w, height: h, name: file.name, note: imgs.length > 1 ? `HEIC 里有 ${imgs.length} 张图，打开了主图` : '' }];
}

async function openJXL(file) {
  try { const b = await nativeDecode(file); return [{ canvas: fromBitmap(b), width: b.width, height: b.height, name: file.name }]; } catch {  }
  const m = await vimport('jxl/decode.js');
  const img = await (m.default || m.decode)(await file.arrayBuffer());
  return [{ canvas: canvasOf(img.width, img.height, img.data), width: img.width, height: img.height, name: file.name }];
}


export async function openRAW(file, interactive) {
  const mod = await vimport('libraw/index.js');
  const LibRaw = mod.default || mod.LibRaw || mod;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = { wb: 'camera', bright: 1, highlight: 0, quality: 3, half: false, noAutoBright: false, color: 1 };
  let meta = null;
  if (interactive) {
    const probe = new LibRaw();
    try { await probe.open(bytes.slice(), { halfSize: true }); meta = await probe.metadata(); } catch {  }
    try { probe.dispose(); } catch {}
    const cam = meta ? [meta.make, meta.model].filter(Boolean).join(' ') : '';
    const exif = meta ? [meta.iso_speed ? 'ISO ' + meta.iso_speed : '', meta.shutter ? (meta.shutter < 1 ? '1/' + Math.round(1 / meta.shutter) : meta.shutter) + ' 秒' : '', meta.aperture ? 'f/' + meta.aperture : '', meta.focal_len ? meta.focal_len + ' mm' : ''].filter(Boolean).join(' · ') : '';
    const v = await formDialog('相机原始数据 — ' + file.name, [
      { type: 'note', label: (cam || '相机 RAW') + (meta && meta.width ? `：${meta.width} × ${meta.height}` : '') + (exif ? '\n' + exif : '') },
      { key: 'wb', label: '白平衡', type: 'select', value: 'camera', options: [['camera', '原照设置'], ['auto', '自动'], ['daylight', '日光（相机矩阵，不乘机内白平衡）']] },
      { key: 'bright', label: '亮度', type: 'number', value: 1, min: 0.1, max: 8, step: 0.05, unit: '倍' },
      { key: 'noAutoBright', label: '关闭自动亮度', type: 'check', value: false },
      { key: 'highlight', label: '高光', type: 'select', value: '0', options: [['0', '裁切（默认）'], ['1', '不裁切'], ['2', '混合'], ['5', '重建（较慢）']] },
      { key: 'quality', label: '去马赛克', type: 'select', value: '3', options: [['0', '线性（最快）'], ['1', 'VNG'], ['2', 'PPG'], ['3', 'AHD（默认）'], ['11', 'DHT'], ['12', 'AAHD']] },
      { key: 'color', label: '色彩空间', type: 'select', value: '1', options: [['1', 'sRGB'], ['2', 'Adobe RGB (1998)'], ['4', 'ProPhoto RGB']] },
      { key: 'half', label: '半尺寸（快）', type: 'check', value: false },
      { type: 'note', label: '打开后可以接着用 滤镜 › Camera Raw 滤镜 做细调（作为智能滤镜可反复调整）。' },
    ], { okText: '打开' });
    if (!v) return null;
    s = { ...s, ...v, bright: +v.bright || 1, highlight: +v.highlight, quality: +v.quality, color: +v.color };
  }
  const raw = new LibRaw();
  try {
    await raw.open(bytes, {
      useCameraWb: s.wb === 'camera', useAutoWb: s.wb === 'auto', bright: s.bright, noAutoBright: !!s.noAutoBright,
      highlight: s.highlight, userQual: s.quality, outputColor: s.color, halfSize: !!s.half, outputBps: 8,
    });
    if (!meta) { try { meta = await raw.metadata(); } catch {} }
    const img = await raw.imageData();
    const w = img.width, h = img.height, src = img.data, n = w * h, rgba = new Uint8ClampedArray(n * 4);
    const ch = src.length / n;
    if (ch === 3) for (let i = 0; i < n; i++) { rgba[i * 4] = src[i * 3]; rgba[i * 4 + 1] = src[i * 3 + 1]; rgba[i * 4 + 2] = src[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    else if (ch === 4) rgba.set(src);
    else throw new Error('RAW 解出来的数据形状不认识（' + ch + ' 通道）');
    const note = s.color === 2 ? '色彩：Adobe RGB (1998)（像素按它编码；需要的话 编辑 › 指定配置文件）' : s.color === 4 ? '色彩：ProPhoto RGB（像素按它编码；需要的话 编辑 › 指定配置文件）' : '';
    return [{ canvas: canvasOf(w, h, rgba), width: w, height: h, name: file.name.replace(/\.[^.]+$/, '') + '.psd', note, meta }];
  } finally { try { raw.dispose(); } catch {} }
}


export async function decodeAnyImage(file, { interactive = true } = {}) {
  const e = extOf(file.name);
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const kind = RAW_EXT.has(e) && !(e === 'tif' || e === 'tiff') ? 'raw' : (sniffFormat(head, file.name) || e);
  if (kind === 'raw' || RAW_EXT.has(e)) return openRAW(file, interactive);
  if (kind === 'pdf' || e === 'ai') return openPDF(file, interactive);
  if (e === 'svg' || e === 'svgz') return openSVG(file, interactive);
  if (e === 'heic' || e === 'heif' || e === 'hif') return openHEIF(file);
  if (e === 'jxl') return openJXL(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let img;
  switch (kind) {
    case 'tiff': img = await decodeTIFF(bytes, { inflate }); break;
    case 'tga': case 'icb': case 'vda': case 'vst': img = decodeTGA(bytes); break;
    case 'pnm': img = decodePNM(bytes); break;
    case 'hdr': img = decodeHDR(bytes); break;
    case 'exr': img = await decodeEXR(bytes, { inflate }); break;
    case 'ico': case 'cur': {
      const list = decodeICO(bytes), top = list[0];
      if (top.png) { const b = await nativeDecode(new Blob([top.png], { type: 'image/png' })); return [{ canvas: fromBitmap(b), width: b.width, height: b.height, name: file.name, note: list.length > 1 ? `图标里有 ${list.length} 个尺寸，打开了最大的 ${top.width}×${top.height}` : '' }]; }
      img = top;
      break;
    }
    default: {
      const b = await nativeDecode(file);
      return [{ canvas: fromBitmap(b), width: b.width, height: b.height, name: file.name }];
    }
  }
  let note = '';
  if (img.float) { const t = await toneDialog(img, interactive, file.name); if (!t) return null; img = { ...img, ...t }; note = '浮点图像已按曝光度 / 灰度系数映射到 8 位'; }
  if (img.pages > 1) note = (note ? note + '；' : '') + `TIFF 有 ${img.pages} 页，打开了第 1 页`;
  if (img.layered) note = (note ? note + '；' : '') + '这是带图层的 Photoshop TIFF：按拼合图打开（图层要在 PS 里另存为 PSD 后再开）';
  return [{ canvas: canvasOf(img.width, img.height, img.rgba), width: img.width, height: img.height, name: file.name, note }];
}

export default { decodeAnyImage, needsFormatOpen, extOf, RAW_EXT, OWN_EXT, openRAW };
