
























import sharp from 'sharp';
import { applyEdits } from '../core/psd-edit.js';
import { parsePsdFull, setTextLayerMeta, reorderLayers, renameLayer, replaceLayerBlock } from '../core/psd-parse.js';
import { getVectorMaskPath } from '../core/psd-edit-path.js';
import { writeImageResource } from '../core/psd-write.js';
import {
  toU8, toAB, toBuf, bad, parseDoc, pickLayer, layerKind, layerLabel, readLayerRGBA,
  affMul, affApply, parseColor,
} from './ops-util.js';
import { listArtboards, refreshComposite } from './doc-render.js';
import { scaleLayerStyles, mapFillLayers, mapVectorOrigin, mapSlices, linearInfo } from './geo-meta.js';
import { mapPlacedTransforms } from '../core/layer-geometry.js';

const MAX_SIDE = 30000;
const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;
const EPS = 1e-9;



const isTranslation = A => Math.abs(A[0] - 1) < EPS && Math.abs(A[3] - 1) < EPS && Math.abs(A[1]) < EPS && Math.abs(A[2]) < EPS;

function mapRectBBox(A, b) {
  const pts = [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]].map(p => affApply(A, p[0], p[1]));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}





async function transformPlane(data, w, h, channels, bounds, A, { resample = 'lanczos3', bg = 0 } = {}) {
  if (isTranslation(A)) {
    const dx = Math.round(A[4]), dy = Math.round(A[5]);
    return { data, width: w, height: h, bounds: { left: bounds.left + dx, top: bounds.top + dy, right: bounds.right + dx, bottom: bounds.bottom + dy } };
  }
  const bb = mapRectBBox(A, bounds);
  const left = Math.round(bb.minX), top = Math.round(bb.minY);
  const W = Math.max(1, Math.round(bb.maxX) - left), H = Math.max(1, Math.round(bb.maxY) - top);
  if (W * H > MAX_PIXELS) bad(`变换后图层 ${W}×${H} 超过像素上限 ${MAX_PIXELS}`, 'op');
  const raw = { width: w, height: h, channels };
  let s = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw });
  const a = A[0], b = A[1], c = A[2], d = A[3];
  const background = channels === 4 ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: bg, g: bg, b: bg };
  const axis = Math.abs(b) < EPS && Math.abs(c) < EPS;          
  const swap = Math.abs(a) < EPS && Math.abs(d) < EPS;          
  if (axis || swap) {
    
    if (swap) {
      
      s = s.rotate(90);
      const sx = c, sy = b;          
      if (sx > 0) s = s.flop();      
      if (sy < 0) s = s.flip();
    } else {
      if (a < 0) s = s.flop();
      if (d < 0) s = s.flip();
    }
    const tw = swap ? h : w, th = swap ? w : h;
    if (tw !== W || th !== H) {
      const kernel = resample === 'nearest' ? 'nearest' : resample === 'bilinear' ? 'linear' : resample === 'bicubic' ? 'cubic' : 'lanczos3';
      
      if (channels === 1) s = s.extractChannel(0);
      const mid = await s.raw().toBuffer({ resolveWithObject: true });
      s = sharp(mid.data, { raw: { width: mid.info.width, height: mid.info.height, channels: mid.info.channels } })
        .resize(W, H, { fit: 'fill', kernel });
    }
  } else {
    const interpolator = resample === 'nearest' ? 'nearest' : resample === 'bilinear' ? 'bilinear' : 'bicubic';
    s = s.affine([a, c, b, d], { background, interpolator });
  }
  
  if (channels === 1) s = s.extractChannel(0);
  const out = await s.raw().toBuffer({ resolveWithObject: true });
  let buf = new Uint8ClampedArray(out.data.buffer, out.data.byteOffset, out.data.byteLength);
  let ow = out.info.width, oh = out.info.height;
  if (out.info.channels !== channels) bad(`重采样后通道数 ${out.info.channels} ≠ ${channels}`, 'op');
  
  if (ow !== W || oh !== H) buf = fitCanvas(buf, ow, oh, W, H, channels, channels === 1 ? bg : 0), ow = W, oh = H;
  return { data: buf, width: ow, height: oh, bounds: { left, top, right: left + ow, bottom: top + oh } };
}

function fitCanvas(src, sw, sh, W, H, ch, fill) {
  const out = new Uint8ClampedArray(W * H * ch);
  if (fill) out.fill(fill);
  const ox = Math.round((W - sw) / 2), oy = Math.round((H - sh) / 2);
  for (let y = 0; y < sh; y++) {
    const ty = y + oy; if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < sw; x++) {
      const tx = x + ox; if (tx < 0 || tx >= W) continue;
      for (let c = 0; c < ch; c++) out[(ty * W + tx) * ch + c] = src[(y * sw + x) * ch + c];
    }
  }
  return out;
}







function readResource(ab, id) {
  try {
    const d = parseDoc(ab);
    const r = (d.imageResources || []).find(x => x.id === id);
    return r && r._raw ? toU8(r._raw) : null;
  } catch { return null; }
}


function mapGuides(ab, A, W, H, warnings) {
  const d = readResource(ab, 1032);
  if (!d || d.length < 16) return ab;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const n = dv.getUint32(12);
  if (!n || d.length < 16 + n * 5) return ab;
  const axis = Math.abs(A[1]) < EPS && Math.abs(A[2]) < EPS, swap = Math.abs(A[0]) < EPS && Math.abs(A[3]) < EPS;
  if (!axis && !swap) { warnings.push(`${n} 条参考线在任意角度旋转后无法保持水平 / 竖直，已清除`); }
  const kept = [];
  for (let i = 0; i < n; i++) {
    const loc = dv.getInt32(16 + i * 5) / 32, dir = d[16 + i * 5 + 4];
    if (!axis && !swap) continue;
    
    const p = dir === 0 ? affApply(A, loc, 0) : affApply(A, 0, loc);
    const newDir = swap ? 1 - dir : dir;
    const v = newDir === 0 ? p[0] : p[1];
    if (v < 0 || v > (newDir === 0 ? W : H)) continue;
    kept.push([Math.round(v * 32), newDir]);
  }
  const out = new Uint8Array(16 + kept.length * 5), ov = new DataView(out.buffer);
  out.set(d.subarray(0, 12));
  ov.setUint32(12, kept.length);
  kept.forEach(([loc, dir], i) => { ov.setInt32(16 + i * 5, loc); out[16 + i * 5 + 4] = dir; });
  const r = writeImageResource(ab, 1032, out);
  return r instanceof ArrayBuffer ? r : toAB(r);
}

function resolutionBytes(ppi) {
  const b = new Uint8Array(16), dv = new DataView(b.buffer);
  const fx = Math.round(ppi * 65536);
  dv.setUint32(0, fx); dv.setUint16(4, 1); dv.setUint16(6, 1);
  dv.setUint32(8, fx); dv.setUint16(12, 1); dv.setUint16(14, 1);
  return b;
}



const isBackground = (l, i) => i === 0 && /^(背景|Background)$/i.test(layerLabel(l)) && !!(l.additional?.lspf?.flags);












export async function transformLayers(buf, A, o = {}) {
  let ab = toAB(buf);
  const doc = parseDoc(ab);
  const W0 = doc.header.width, H0 = doc.header.height;
  const W = o.newW ?? W0, H = o.newH ?? H0;
  if (!(W >= 1 && H >= 1 && W <= MAX_SIDE && H <= MAX_SIDE)) bad(`新画布 ${W}×${H} 超出范围（1…${MAX_SIDE}）`, 'op');
  if (doc.header.depth !== 8 && !isTranslation(A)) bad(`只支持 8 位/通道文档的重采样（本文档 ${doc.header.depth} 位）；纯平移不受限`, 'op');
  const all = !o.indices;
  const want = new Set(o.indices || doc.layers.map((_, i) => i));
  const warnings = [];
  const stats = { pixels: 0, masks: 0, text: 0, smartObjects: 0, vectors: 0, artboards: 0 };

  
  const vectors = [];
  for (const i of want) {
    const l = doc.layers[i];
    if (!l || l.groupType === 3 || !l.path) continue;
    let p = null;
    try { p = getVectorMaskPath(ab, i, { units: 'pixel' }); } catch (e) { warnings.push(`图层 ${i}「${layerLabel(l)}」矢量路径读取失败，未变换：${e.message}`); }
    if (!p || !p.subpaths) continue;
    const mp = pt => affApply(A, pt[0], pt[1]);
    vectors.push({ i, subpaths: p.subpaths.map(s => ({ closed: s.closed, operation: s.operation,
      knots: s.knots.map(k => ({ anchor: mp(k.anchor), in: mp(k.in), out: mp(k.out), linked: k.linked })) })) });
  }
  const boards = listArtboards(ab).filter(b => want.has(b.index));

  
  for (let i = 0; i < doc.layers.length; i++) {
    if (!want.has(i)) continue;
    const d0 = parseDoc(ab), l = d0.layers[i], kind = layerKind(l);
    if (kind === 'divider' || kind === 'group') { if (l.mask?.present && l.mask.width > 0) await moveMaskOnly(); continue; }
    const px = readLayerRGBA(d0, ab, i);
    if (px.rgba) {
      let rgba = px.rgba, bounds = px.bounds, w = px.width, h = px.height;
      const bg = all && isBackground(l, i) && (W !== W0 || H !== H0 || !isTranslation(A));
      let t = await transformPlane(rgba, w, h, 4, bounds, A, { resample: o.resample });
      if (bg) t = fillBackground(t, W, H, parseColor(o.extColor, [255, 255, 255]));
      else if (o.crop?.deleteCropped && kind === 'raster') t = clipTo(t, W, H) || t;
      const r = applyEdits(ab, [{ op: 'replaceLayerPixels', index: i, rgba: { data: new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), width: t.width, height: t.height }, bounds: t.bounds }], { verify: false });
      ab = r.buffer; stats.pixels++;
    }
    if (px.maskGray && px.mask) {
      const m = px.mask, mb = { left: m.left, top: m.top, right: m.right ?? m.left + m.width, bottom: m.bottom ?? m.top + m.height };
      const dc = (m.defaultColor ?? 0) >= 128 ? 255 : 0;
      const t = await transformPlane(px.maskGray, m.width, m.height, 1, mb, A, { resample: o.resample, bg: dc });
      try {
        ab = applyEdits(ab, [{ op: 'replaceLayerMask', index: i, bounds: t.bounds, gray: new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), defaultColor: dc }], { verify: false }).buffer;
        stats.masks++;
      } catch (e) { warnings.push(`图层 ${i}「${layerLabel(l)}」蒙版未变换：${e.message}`); }
    }
    if (kind === 'text') {
      const L = parsePsdFull(ab).layers[i];
      const T = (L.textTransform || [1, 0, 0, 1, 0, 0]).slice(0, 6);
      const M = affMul(A, T);
      try { const r = setTextLayerMeta(ab, i, { transform: M }); ab = r instanceof ArrayBuffer ? r : toAB(r); stats.text++; }
      catch (e) { warnings.push(`文字层 ${i}「${layerLabel(l)}」变换矩阵未写回：${e.message}`); }
    }
    if (kind === 'smartObject') {
      const r = mapPlacedTransforms(ab, i, A);
      ab = r.buffer; if (r.count) stats.smartObjects++;
      else warnings.push(`智能对象 ${i}「${layerLabel(l)}」读不到放置四点，只移动了缓存像素`);
    }
    if (l.effects && !o.scaleStyles && !isTranslation(A) && (Math.abs(Math.hypot(A[0], A[1]) - 1) > 1e-6))
      warnings.push(`图层 ${i}「${layerLabel(l)}」的图层样式尺寸没有随缩放调整（scaleStyles:false）`);

    async function moveMaskOnly() {
      const px2 = readLayerRGBA(d0, ab, i);
      if (!px2.maskGray) return;
      const m = px2.mask, mb = { left: m.left, top: m.top, right: m.left + m.width, bottom: m.top + m.height };
      const dc = (m.defaultColor ?? 0) >= 128 ? 255 : 0;
      const t = await transformPlane(px2.maskGray, m.width, m.height, 1, mb, A, { resample: o.resample, bg: dc });
      try { ab = applyEdits(ab, [{ op: 'replaceLayerMask', index: i, bounds: t.bounds, gray: new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), defaultColor: dc }], { verify: false }).buffer; stats.masks++; }
      catch (e) { warnings.push(`组 ${i} 蒙版未变换：${e.message}`); }
    }
  }

  
  if (W !== W0 || H !== H0) {
    ab = ab.slice(0);
    const dv = new DataView(ab);
    dv.setUint32(14, H); dv.setUint32(18, W);
  }

  
  for (const v of vectors) {
    try { ab = applyEdits(ab, [{ op: 'setVectorMaskPath', index: v.i, subpaths: v.subpaths, units: 'pixel' }], { verify: false }).buffer; stats.vectors++; }
    catch (e) { warnings.push(`图层 ${v.i} 矢量路径未变换：${e.message}`); }
  }
  
  for (const b of boards) {
    const bb = mapRectBBox(A, { left: b.rect.x, top: b.rect.y, right: b.rect.x + b.rect.w, bottom: b.rect.y + b.rect.h });
    const rect = { left: Math.round(bb.minX), top: Math.round(bb.minY), right: Math.round(bb.maxX), bottom: Math.round(bb.maxY) };
    try {
      ab = applyEdits(ab, [{ op: 'setArtboard', index: b.index, rect, presetName: b.presetName || undefined,
        backgroundType: b.bgType, color: '#' + b.color.map(v => v.toString(16).padStart(2, '0')).join('') }], { verify: false }).buffer;
      stats.artboards++;
    } catch (e) { warnings.push(`画板 ${b.index}「${b.name}」矩形未更新：${e.message}`); }
  }
  
  const idxList = [...want].sort((a, b) => a - b);
  { const r = mapFillLayers(ab, idxList, A, warnings); ab = r.buffer; stats.fills = r.count; }
  { const r = mapVectorOrigin(ab, idxList, A, warnings); ab = r.buffer; stats.liveShapes = r.count; }
  if (o.scaleStyles) { const r = scaleLayerStyles(ab, idxList, linearInfo(A).k, warnings); ab = r.buffer; stats.styles = r.count; }
  
  if (all) { try { ab = mapGuides(ab, A, W, H, warnings); } catch (e) { warnings.push('参考线未更新：' + e.message); } }
  if (o.resolution) {
    const r = writeImageResource(ab, 1005, resolutionBytes(o.resolution));
    ab = r instanceof ArrayBuffer ? r : toAB(r);
  }
  if (all) { const r = mapSlices(ab, A, warnings); ab = r.buffer; if (r.count) stats.slices = r.count; }
  
  let out = toBuf(ab), recomposited = false;
  if (W !== W0 || H !== H0) {
    const rc = await refreshComposite(out);
    if (rc.warning) bad('画布尺寸已改，但合成图重建失败，拒绝产出损坏文件：' + rc.warning, 'writeback');
    out = rc.buffer; recomposited = true;
  }
  return { buffer: out, stats, warnings, width: W, height: H, recomposited };
}

function fillBackground(t, W, H, col) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = col[0]; out[i * 4 + 1] = col[1]; out[i * 4 + 2] = col[2]; out[i * 4 + 3] = 255; }
  const { data, width, height, bounds } = t;
  for (let y = 0; y < height; y++) {
    const Y = bounds.top + y; if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < width; x++) {
      const X = bounds.left + x; if (X < 0 || X >= W) continue;
      const s = (y * width + x) * 4, a = data[s + 3] / 255, q = (Y * W + X) * 4;
      for (let c = 0; c < 3; c++) out[q + c] = Math.round(data[s + c] * a + col[c] * (1 - a));
    }
  }
  return { data: out, width: W, height: H, bounds: { left: 0, top: 0, right: W, bottom: H } };
}

function clipTo(t, W, H) {
  const l = Math.max(0, t.bounds.left), tp = Math.max(0, t.bounds.top), r = Math.min(W, t.bounds.right), b = Math.min(H, t.bounds.bottom);
  if (r <= l || b <= tp) return null;
  if (l === t.bounds.left && tp === t.bounds.top && r === t.bounds.right && b === t.bounds.bottom) return t;
  const w = r - l, h = b - tp, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y + tp - t.bounds.top, sx = l - t.bounds.left;
    out.set(t.data.subarray((sy * t.width + sx) * 4, (sy * t.width + sx + w) * 4), y * w * 4);
  }
  return { data: out, width: w, height: h, bounds: { left: l, top: tp, right: r, bottom: b } };
}



const ANCHORS = { 'top-left': 0, top: 1, 'top-right': 2, left: 3, center: 4, right: 5, 'bottom-left': 6, bottom: 7, 'bottom-right': 8 };
const intIn = (v, name, lo = 1, hi = MAX_SIDE) => {
  const n = Math.round(+v);
  if (!Number.isFinite(+v) || n < lo || n > hi) bad(`${name} 必须是 ${lo}…${hi} 的数字，收到 ${JSON.stringify(v)}`, 'op');
  return n;
};
const docSize = buf => { const d = parseDoc(buf); return { W: d.header.width, H: d.header.height, doc: d }; };


function expandGroups(doc, indices) {
  const set = new Set();
  for (const i of indices) {
    set.add(i);
    const l = doc.layers[i];
    if (l && (l.groupType === 1 || l.groupType === 2)) {
      let depth = 0;
      for (let k = i - 1; k >= 0; k--) {
        const g = doc.layers[k].groupType;
        set.add(k);
        if (g === 1 || g === 2) depth++;
        else if (g === 3) { if (depth === 0) break; depth--; }
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

export async function moveLayerOp(buf, op) {
  const { doc } = docSize(buf);
  const list = Array.isArray(op.indices) ? op.indices.map((x, k) => pickLayer(doc, { index: x }, `moveLayer.indices[${k}]`)) : [pickLayer(doc, op, 'moveLayer')];
  const dx = Math.round(+op.dx || 0), dy = Math.round(+op.dy || 0);
  if (!dx && !dy) bad('moveLayer：dx / dy 都是 0，没有要做的事', 'op');
  const indices = expandGroups(doc, list);
  const r = await transformLayers(buf, [1, 0, 0, 1, dx, dy], { indices });
  return { buffer: r.buffer, affected: indices, note: `平移 ${indices.length} 条图层记录 (${dx}, ${dy})`, warnings: r.warnings, meta: { dx, dy, ...r.stats }, pixels: true };
}

export async function resizeCanvasOp(buf, op) {
  const { W, H } = docSize(buf);
  const w = intIn(op.width ?? W, 'width'), h = intIn(op.height ?? H, 'height');
  let anchor = op.anchor ?? 'center';
  if (typeof anchor === 'string') { if (!(anchor in ANCHORS)) bad(`anchor 只能是 ${Object.keys(ANCHORS).join(' / ')} 或 0…8`, 'op'); anchor = ANCHORS[anchor]; }
  if (!Number.isInteger(anchor) || anchor < 0 || anchor > 8) bad('anchor 只能是 0…8（0 左上 · 4 居中 · 8 右下）', 'op');
  const dx = Math.round((w - W) * ((anchor % 3) / 2)), dy = Math.round((h - H) * (Math.floor(anchor / 3) / 2));
  if (w === W && h === H) bad('resizeCanvas：尺寸没有变化', 'op');
  const r = await transformLayers(buf, [1, 0, 0, 1, dx, dy], { newW: w, newH: h, extColor: op.extColor });
  return { buffer: r.buffer, affected: [], note: `画布 ${W}×${H} → ${w}×${h}（内容偏移 ${dx},${dy}）`, warnings: r.warnings, meta: { width: w, height: h, offset: [dx, dy], ...r.stats }, pixels: true, docChanged: true };
}

export async function cropOp(buf, op) {
  const { W, H } = docSize(buf);
  const x = Math.round(+op.x || 0), y = Math.round(+op.y || 0);
  const w = intIn(op.width, 'width'), h = intIn(op.height, 'height');
  const r = await transformLayers(buf, [1, 0, 0, 1, -x, -y], { newW: w, newH: h, crop: { deleteCropped: !!op.deleteCropped } });
  return { buffer: r.buffer, affected: [], note: `裁剪 ${W}×${H} → ${w}×${h}（原点 ${x},${y}）${op.deleteCropped ? '，删除裁掉的像素' : ''}`, warnings: r.warnings, meta: { rect: { x, y, width: w, height: h }, ...r.stats }, pixels: true, docChanged: true };
}

export async function resizeImageOp(buf, op) {
  const { W, H } = docSize(buf);
  let w = op.width != null ? intIn(op.width, 'width') : null, h = op.height != null ? intIn(op.height, 'height') : null;
  if (op.scale != null) { const k = +op.scale; if (!(k > 0)) bad('scale 必须 > 0', 'op'); w = Math.round(W * k); h = Math.round(H * k); }
  if (w == null && h == null && op.resolution == null) bad('resizeImage：给 width / height / scale / resolution 之一', 'op');
  if (w == null && h != null) w = Math.max(1, Math.round(W * h / H));      
  if (h == null && w != null) h = Math.max(1, Math.round(H * w / W));
  w = w ?? W; h = h ?? H;
  if (w > MAX_SIDE || h > MAX_SIDE) bad(`新尺寸 ${w}×${h} 超出上限 ${MAX_SIDE}`, 'op');
  const resample = op.resample || 'lanczos3';
  if (!['lanczos3', 'bicubic', 'bilinear', 'nearest'].includes(resample)) bad('resample 只能是 lanczos3 / bicubic / bilinear / nearest', 'op');
  const res = op.resolution != null ? +op.resolution : null;
  if (res != null && !(res > 0 && res <= 10000)) bad('resolution 必须是 1…10000（像素/英寸）', 'op');
  const r = await transformLayers(buf, [w / W, 0, 0, h / H, 0, 0], { newW: w, newH: h, resample, resolution: res, scaleStyles: op.scaleStyles !== false });
  return { buffer: r.buffer, affected: [], note: `图像大小 ${W}×${H} → ${w}×${h}${res ? ` · ${res} ppi` : ''}`, warnings: r.warnings, meta: { width: w, height: h, resolution: res, resample, ...r.stats }, pixels: true, docChanged: true };
}

export async function rotateCanvasOp(buf, op) {
  const { W, H } = docSize(buf);
  const deg = ((+op.angle % 360) + 360) % 360;
  if (!Number.isFinite(deg)) bad('rotateCanvas：angle 必须是数字（度，顺时针）', 'op');
  if (!deg) bad('rotateCanvas：角度为 0，没有要做的事', 'op');
  const rad = deg * Math.PI / 180;
  let cos = Math.cos(rad), sin = Math.sin(rad);
  if (deg % 90 === 0) { cos = Math.round(cos); sin = Math.round(sin); }
  const w = Math.max(1, Math.round(Math.abs(W * cos) + Math.abs(H * sin)));
  const h = Math.max(1, Math.round(Math.abs(W * sin) + Math.abs(H * cos)));
  
  const cx = W / 2, cy = H / 2;
  const A = [cos, sin, -sin, cos, w / 2 - (cos * cx - sin * cy), h / 2 - (sin * cx + cos * cy)];
  const r = await transformLayers(buf, A, { newW: w, newH: h, extColor: op.extColor });
  return { buffer: r.buffer, affected: [], note: `画布旋转 ${deg}°：${W}×${H} → ${w}×${h}`, warnings: r.warnings, meta: { angle: deg, width: w, height: h, ...r.stats }, pixels: true, docChanged: true };
}

export async function flipCanvasOp(buf, op) {
  const { W, H } = docSize(buf);
  const axis = op.axis === 'vertical' || op.axis === 'y' ? 'vertical' : op.axis === 'horizontal' || op.axis === 'x' ? 'horizontal' : null;
  if (!axis) bad('flipCanvas：axis 只能是 horizontal / vertical', 'op');
  const A = axis === 'horizontal' ? [-1, 0, 0, 1, W, 0] : [1, 0, 0, -1, 0, H];
  const r = await transformLayers(buf, A, {});
  return { buffer: r.buffer, affected: [], note: axis === 'horizontal' ? '水平翻转画布' : '垂直翻转画布', warnings: r.warnings, meta: { axis, ...r.stats }, pixels: true, docChanged: true };
}


export async function growCanvasToArtboards(buffer) {
  const doc = parseDoc(buffer);
  const W = doc.header.width, H = doc.header.height;
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  for (const b of listArtboards(buffer)) { x0 = Math.min(x0, b.rect.x); y0 = Math.min(y0, b.rect.y); x1 = Math.max(x1, b.rect.x + b.rect.w); y1 = Math.max(y1, b.rect.y + b.rect.h); }
  if (!(x0 < 0 || y0 < 0 || x1 > W || y1 > H)) return { buffer: toBuf(buffer), grown: null, warnings: [] };
  const g = await transformLayers(buffer, [1, 0, 0, 1, -x0, -y0], { newW: x1 - x0, newH: y1 - y0 });
  return { buffer: g.buffer, grown: { width: x1 - x0, height: y1 - y0, offset: [-x0 || 0, -y0 || 0] }, warnings: g.warnings };
}

export async function duplicateLayerOp(buf, op) {
  let ab = toAB(buf);
  const doc = parseDoc(ab);
  const idx = pickLayer(doc, op, 'duplicateLayer');
  const l = doc.layers[idx];
  if (l.groupType === 3) bad('duplicateLayer：不能复制分组结束分隔记录（要复制整组请给组头的 index）', 'target');
  const isGroup = l.groupType === 1 || l.groupType === 2;
  
  const members = isGroup ? expandGroups(doc, [idx]) : [idx];
  const lo = members[0], hi = members[members.length - 1];
  const order = doc.layers.map((_, i) => i);
  order.splice(hi + 1, 0, ...members.map(i => ({ dup: i })));
  let out;
  try { out = reorderLayers(ab, order); } catch (e) { bad('duplicateLayer：克隆失败：' + (e && e.message || e), 'op'); }
  ab = out instanceof ArrayBuffer ? out : toAB(out);
  const newIdx = hi + 1 + (idx - lo);
  const copies = members.map((_, k) => hi + 1 + k);
  const name = typeof op.name === 'string' && op.name ? op.name : `${layerLabel(l)} 拷贝`;
  try { const r = renameLayer(ab, newIdx, name); ab = r instanceof ArrayBuffer ? r : toAB(r); } catch {}
  const warnings = [];
  
  try {
    const dd = parseDoc(ab);
    let next = Math.max(0, ...dd.layers.map(x => (x.additional && x.additional.lyid ? +x.additional.lyid.id : 0))) + 1;
    for (const c of copies) {
      if (!(dd.layers[c].additionalBlocks || []).some(b => b.key === 'lyid')) continue;
      const v = new Uint8Array(4); new DataView(v.buffer).setUint32(0, next++);
      const r = replaceLayerBlock(ab, c, 'lyid', v); ab = r instanceof ArrayBuffer ? r : toAB(r);
    }
  } catch (e) { warnings.push('图层 id 去重失败：' + e.message); }
  
  try {
    const tl = parsePsdFull(ab).layers.map((x, k) => ({ k, t: x.text })).filter(x => x.t);
    let next = Math.max(-1, ...tl.map(x => +x.t.TextIndex).filter(Number.isFinite)) + 1;
    const seen = new Set();
    for (const x of tl) {
      const n = +x.t.TextIndex;
      if (Number.isFinite(n) && !seen.has(n)) { seen.add(n); continue; }
      const r = setTextLayerMeta(ab, x.k, { textIndex: next }); ab = r instanceof ArrayBuffer ? r : toAB(r);
      seen.add(next++);
    }
  } catch (e) { warnings.push('文字层编号去重失败：' + e.message); }
  if (members.some(i => doc.layers[i].smartObject)) warnings.push('智能对象按 PS 默认做浅拷贝：副本与原层共用同一份内嵌源（改一个另一个也跟着变）');
  let buffer = toBuf(ab);
  let dx = Math.round(+op.dx || 0), dy = Math.round(+op.dy || 0);
  
  const board = isGroup ? listArtboards(buffer).find(b => b.index === newIdx) : null;
  if (board && !dx && !dy && op.dx === undefined && op.dy === undefined) dx = board.rect.w + 100;
  if (dx || dy) { const m = await transformLayers(buffer, [1, 0, 0, 1, dx, dy], { indices: copies }); buffer = m.buffer; warnings.push(...m.warnings); }
  let grown = null;
  if (board) { const g = await growCanvasToArtboards(buffer); buffer = g.buffer; grown = g.grown; warnings.push(...g.warnings); }
  return { buffer, affected: copies, note: `复制${isGroup ? (board ? '画板' : '组') : '图层'} ${idx}「${layerLabel(l)}」→ ${newIdx}「${name}」${isGroup ? `（${members.length} 条记录）` : ''}`,
    warnings, meta: { source: idx, index: newIdx, name, records: members.length, offset: [dx, dy], canvasGrown: grown },
    pixels: true, structural: true, docChanged: !!grown };
}
