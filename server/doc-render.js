
















import sharp from 'sharp';
import { parsePsdRaster } from '../core/psd-raster.js';
import { compositeAll } from '../core/compose.js';
import { parsePsdFull } from '../core/psd-parse.js';
import { parseAdditionalBlock } from '../core/psd-additional.js';
import { replacePsdCompositeImage, writeThumbnail } from '../core/psd-write.js';
import { readEmbeddedProfile } from '../core/doc-mode.js';
import { parseIcc, labProfile, loadGenericCmykProfile } from '../core/icc.js';
import { makeCodec } from '../core/color-convert.js';
import { compositeCMYK, cmykCompositeRGBA } from '../core/cmyk-compose.js';
import { toU8, toAB, toBuf, bad } from './ops-util.js';

const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;


export function listArtboards(buf) {
  const ab = toAB(buf), u8 = new Uint8Array(ab);
  const list = [];
  let full;
  try { full = parsePsdFull(ab); } catch { return list; }
  full.layers.forEach((L, index) => {
    const blocks = L.blocks || [];
    const blk = blocks.find(x => x.key === 'artb') || blocks.find(x => x.key === 'abdd') || blocks.find(x => x.key === 'artd');
    if (!blk) return;
    let m = null;
    try { m = parseAdditionalBlock(blk.key, u8.subarray(blk.dataOffset, blk.dataOffset + blk.dataLength)); } catch { m = null; }
    const d = m && m.desc;
    const rc = d && d.artboardRect;
    if (!rc) return;
    const c = d['Clr '] || {};
    list.push({
      index, key: blk.key,
      name: L.unicodeName || L.name || '画板',
      presetName: typeof d.artboardPresetName === 'string' ? d.artboardPresetName : '',
      rect: { x: +rc.Left || 0, y: +rc['Top '] || 0, w: (+rc.Rght || 0) - (+rc.Left || 0), h: (+rc.Btom || 0) - (+rc['Top '] || 0) },
      color: [Math.round(+c['Rd  '] || 0), Math.round(+c['Grn '] || 0), Math.round(+c['Bl  '] || 0)],
      bgType: Number.isFinite(+d.artboardBackgroundType) ? +d.artboardBackgroundType : 1,
    });
  });
  return list;
}









export async function renderLayers(buf, o = {}) {
  const ab = toAB(buf);
  const mode = new DataView(ab).getUint16(24);
  const embedded = readEmbeddedProfile(ab);
  const profile = embedded ? parseIcc(embedded) : mode === 9 ? labProfile() : mode===4 ? await loadGenericCmykProfile() : null;
  const expectedChannels = mode === 4 ? 4 : mode === 1 || mode === 8 ? 1 : 3;
  if (profile && profile.nChannels !== expectedChannels) throw new Error('嵌入 ICC 的通道数与文档模式不一致');
  const expectedSpace = { 1:'GRAY', 3:'RGB ', 4:'CMYK', 8:'GRAY', 9:'Lab ' }[mode];
  if (profile && expectedSpace && profile.colorSpace !== expectedSpace) throw new Error('嵌入 ICC 的色彩空间与文档模式不一致');
  
  const codec = profile ? makeCodec(profile) : null;
  
  const doc = await parsePsdRaster(ab, { strictChannels: false, keepNativePlanes:mode===4, codec: mode === 3 ? null : codec });
  const W = doc.width, H = doc.height;
  if (!(W > 0 && H > 0)) bad('文档尺寸为 0，无法合成', 'op');
  if (W * H > MAX_PIXELS) { const e = new Error(`画布 ${W}×${H} 超过像素上限 ${MAX_PIXELS}（PSD_EDITOR_DOC_MAX_PIXELS）`); e.status = 413; throw e; }
  const boards = listArtboards(ab);
  for (const b of boards) {
    const L = doc.layers[b.index];
    if (L) L.artboard = { rect: { ...b.rect }, bgType: b.bgType, color: b.color.slice() };
  }
  if (Array.isArray(o.hide)) for (const i of o.hide) if (doc.layers[i]) doc.layers[i].hidden = true;
  const nativeComposite=mode===4?compositeCMYK(doc,W,H):null;
  const surf = nativeComposite?.supported?cmykCompositeRGBA(nativeComposite,codec):compositeAll(doc, W, H, new Map());
  const compositeRgba = mode === 3 && codec ? surf.data.slice() : null;
  if (mode === 3 && codec) {
    const planes = [new Uint8Array(W * H), new Uint8Array(W * H), new Uint8Array(W * H)], rgb = [0,0,0];
    for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) planes[c][i] = surf.data[i * 4 + c];
    for (let i = 0; i < W * H; i++) { codec.toRgb8(planes, i, rgb); for (let c = 0; c < 3; c++) surf.data[i * 4 + c] = rgb[c]; }
  }

  let rect = { x: 0, y: 0, w: W, h: H }, board = null;
  if (o.artboard != null && o.artboard !== false) {
    if (!boards.length) bad('这份文档里没有画板', 'artboard');
    board = o.artboard === true ? boards[0]
      : Number.isInteger(o.artboard) ? boards.find(b => b.index === o.artboard)
      : boards.find(b => b.name === String(o.artboard));
    if (!board) bad(`找不到画板 ${JSON.stringify(o.artboard)}；可用：${boards.map(b => `${b.index}:${b.name}`).join(' / ')}`, 'artboard');
    rect = { ...board.rect };
  } else if (o.region) {
    const r = o.region;
    rect = { x: Math.round(+r.x || 0), y: Math.round(+r.y || 0), w: Math.round(+r.width || 0), h: Math.round(+r.height || 0) };
    if (!(rect.w > 0 && rect.h > 0)) bad('region 的 width / height 必须 > 0', 'op');
  }
  if (rect.x === 0 && rect.y === 0 && rect.w === W && rect.h === H)
    return { data: surf.data, width: W, height: H, x: 0, y: 0, codec, compositeRgba, nativeComposite, assumedProfile:mode===4&&!embedded, ...(board ? { artboard: board } : {}) };
  
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const sy = rect.y + y; if (sy < 0 || sy >= H) continue;
    const x0 = Math.max(0, -rect.x), x1 = Math.min(rect.w, W - rect.x);
    if (x1 <= x0) continue;
    out.set(surf.data.subarray((sy * W + rect.x + x0) * 4, (sy * W + rect.x + x1) * 4), (y * rect.w + x0) * 4);
  }
  return { data: out, width: rect.w, height: rect.h, x: rect.x, y: rect.y, codec, ...(board ? { artboard: board } : {}) };
}


export async function encodeRaster(r, o = {}) {
  const format = String(o.format || 'png').toLowerCase();
  const quality = Math.min(100, Math.max(1, (+o.quality || 92) | 0));
  const maxSize = Math.max(0, (+o.maxSize || 0) | 0);
  let s = sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength), { raw: { width: r.width, height: r.height, channels: 4 } });
  if (maxSize && (r.width > maxSize || r.height > maxSize))
    s = s.resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
  const bg = o.background || '#ffffff';
  if (o.flatten) s = s.flatten({ background: bg });
  switch (format) {
    case 'png': return { buffer: await s.png({ compressionLevel: 9 }).toBuffer(), contentType: 'image/png', ext: 'png' };
    case 'jpg': case 'jpeg':
      return { buffer: await s.flatten({ background: bg }).jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' };
    case 'webp': return { buffer: await s.webp({ quality }).toBuffer(), contentType: 'image/webp', ext: 'webp' };
    case 'tif': case 'tiff': return { buffer: await s.tiff({ quality }).toBuffer(), contentType: 'image/tiff', ext: 'tif' };
    default: bad(`不支持的位图格式 "${format}"（png / jpg / webp / tiff）`, 'op');
  }
}






export async function refreshComposite(buf) {
  let r;
  try { r = await renderLayers(buf); }
  catch (e) { return { buffer: toBuf(buf), warning: '合成图未刷新（按图层合成失败）：' + (e && e.message || e) }; }
  let out;
  if(r.nativeComposite&&!r.nativeComposite.supported)return {buffer:toBuf(buf),warning:'CMYK合成缓存保持原样，避免重新分色改变黑版：'+r.nativeComposite.reasons.join('；')};
  
  try { out = replacePsdCompositeImage(toAB(buf), r.compositeRgba || r.data, { codec: r.compositeRgba ? null : r.codec, nativeComposite:r.nativeComposite }); }
  catch (e) { return { buffer: toBuf(buf), warning: '合成图未刷新：' + (e && e.message || e) }; }
  let ab = out instanceof ArrayBuffer ? out : toAB(out.buffer || out);
  try {
    const k = Math.min(1, 160 / Math.max(r.width, r.height));
    const tw = Math.max(1, Math.round(r.width * k)), th = Math.max(1, Math.round(r.height * k));
    const jpeg = await sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength), { raw: { width: r.width, height: r.height, channels: 4 } })
      .flatten({ background: '#fff' }).resize(tw, th).jpeg({ quality: 80 }).toBuffer();
    const t = writeThumbnail(ab, new Uint8Array(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength), tw, th);
    ab = t instanceof ArrayBuffer ? t : toAB(t.buffer || t);
  } catch (e) { return { buffer: toBuf(ab), warning: '缩略图未更新：' + (e && e.message || e) }; }
  return { buffer: toBuf(ab) };
}

export { toU8 };
