




import './49-fonts-text-model.js';   
import { compositeAll } from '../../../core/app.js';
import { createTileWriter } from '../../../core/tile-store.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy, selectionBounds, selectionToMaskGray, selectionValueAt } from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, layerDeletes, layerRenames, layerReorder, layerTree, li, maskPaint,
  origBuffer, pixelPaint, selection, set_layerReorder, textCrops, textRenders,
} from './02-doc-state.js';
import { pushDocHistory, structuralApply, structuralBegin, structuralDone, updateUndoButtons } from './03-history.js';
import {
  isBackgroundLayer, rasterKindOf, rasterizeLayerUI, renderLayerAlone, toggleLayerLock,
} from './05-layer-lock-guides.js';
import { paintMap } from './11-paint-common.js';
import { activeDocSubs } from './17-shape-pen.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument, lazyPixelSource, readLazyImageBand } from './21-load-document.js';
import { layerOrderView, renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import {
  commitLayerOps, effClipping, effLock, humanEditError, putLayerOp, renderProps, setOpField,
} from './24-layer-ops-queue.js';
import { nextLayerName } from './26-layer-create.js';
import { setLayerOpacity } from './27-gradient-editor.js';
import { deleteLayersReal, isMeshTransform, syncLayerControls, transformChanged } from './28-layer-props-transform.js';
import { displayOrder, rasterizeTransformed } from './29-scrubby-live.js';
import {
  composeDocForOrder, paintLayersExport, previewCompositeDoc, renderPreviewOnly, renderStaticLayers,
} from './30-render.js';
import { clearSelectionPixels } from './32-cursors-select-options.js';
import { artboardOfLayer, docArtboards } from './35-artboard.js';
import { set_lastClipKind } from './36-clipboard-frame.js';
import { commitMaskPaint, ensureMaskPaint, ensurePixelPaint } from './38-brush-engine.js';
import { fileLayerIndex, vpathCache } from './44-vector-path.js';
import { buildPsdBuffer, ensureStructuralBase } from './48-info-export.js';










export let pixelClipboard = null;
export function set_pixelClipboard(v) { return (pixelClipboard = v); }   


function layerSampler(idx){
  const pp = ensurePixelPaint(idx);
  if (pp) {
    const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top)
      || { M: [1, 0, 0, 1, pp.left, pp.top], inv: [1, 0, 0, 1, -pp.left, -pp.top] };
    return { rgba: pp.rgba, w: pp.w, h: pp.h, M: map.M, inv: map.inv };
  }
  if (doc?.layers?.[idx]?.lazyChannels || doc?.layers?.[idx]?.lazyCompressedChannels) return null;
  const full = renderLayerAlone(idx);
  if (!full) return null;
  return { rgba: full, w: docW, h: docH, M: [1, 0, 0, 1, 0, 0], inv: [1, 0, 0, 1, 0, 0] };
}



export function compositeNowRGBA(){
  const cv = document.createElement('canvas');
  cv.width = docW; cv.height = docH;
  const ctx = cv.getContext('2d');
  paintLayersExport(ctx, displayOrder());
  return ctx.getImageData(0, 0, docW, docH).data;
}



const layerNeedsStore = l => !!(l && (l.lazyTileStore || l.lazyPixelOps?.length || l.lazyChannels || l.lazyCompressedChannels || l.lazyImage || l.lazyRasterFile));
function useStoreCopy(merged){
  if (docW * docH > 64e6) return true;
  return (merged ? doc.layers : [doc.layers[selLayer]]).some(layerNeedsStore);
}

// shortcut: disk compositing handles plain raster layers; reject richer appearance until band rendering supports it.
function storeCompositeWhy(ids){
  for (const i of ids) {
    const l = doc.layers[i], tree = layerTree?.flat?.[i];
    if (!l || layerDeletes.has(i)) continue;
    if (l.group || tree?.isGroup || tree?.groupType != null || l.mask || l.vectorMask || l.lazyMaskEdits
        || l.effects || l.adjustment || l.fill || l.vectorStroke || l.clipping || l.blendIf || l.knockout
        || (l.blendMode || 'norm') !== 'norm' || transformChanged(i) || isMeshTransform(i)
        || tree?.isSmartObject || (l.lazyPixelOps?.length && !l.lazyTileStore))
      return `图层「${layerRenames[i] || l.name || i}」包含分块合成尚不支持的蒙版、混合、效果、分组或变换；请先栅格化。`;
  }
  return '';
}

async function layerBandRGBA(l, idx, y0, h){
  const out = new Uint8ClampedArray(docW * h * 4);
  if (!l) return out;
  const b = l.bounds || { left: 0, top: 0 }, L = b.left | 0, T = b.top | 0, w = l.width | 0, lh = l.height | 0;
  const tc = textRenders[idx] && textCrops[idx];
  if (tc?.rgba) {
    const tb = tc.bounds, tw = tb.right - tb.left;
    const ya = Math.max(y0, tb.top), yb = Math.min(y0 + h, tb.bottom);
    for (let y = ya; y < yb; y++) {
      const xa = Math.max(0, tb.left), xb = Math.min(docW, tb.right);
      if (xb > xa) out.set(tc.rgba.subarray(((y - tb.top) * tw + (xa - tb.left)) * 4, ((y - tb.top) * tw + (xb - tb.left)) * 4), ((y - y0) * docW + xa) * 4);
    }
  } else if (l.rgba && w > 0 && lh > 0) {
    const ya = Math.max(y0, T), yb = Math.min(y0 + h, T + lh);
    const xa = Math.max(0, L), xb = Math.min(docW, L + w);
    if (xb > xa) for (let y = ya; y < yb; y++)
      out.set(l.rgba.subarray(((y - T) * w + (xa - L)) * 4, ((y - T) * w + (xb - L)) * 4), ((y - y0) * docW + xa) * 4);
  } else if (layerNeedsStore(l) && w > 0 && lh > 0) {
    const ya = Math.max(y0, T), yb = Math.min(y0 + h, T + lh), xa = Math.max(0, L), xb = Math.min(docW, L + w);
    if (xb > xa && yb > ya) {
      if (!l.lazyTileStore && !l.lazyImage && !l.lazyRasterFile && (l.lazyChannels || l.lazyCompressedChannels)) {
        const read = lazyPixelSource(l, doc.depth || 8, doc.mode || 3);
        for (let ty = Math.floor((ya - T) / 256) * 256; ty < yb - T; ty += 256)
          for (let tx = Math.floor((xa - L) / 256) * 256; tx < xb - L; tx += 256) {
            const tile = await read(tx, ty);
            if (!tile?.data) throw new Error('无法读取原始 PSD 像素；已取消操作');
            const x0 = Math.max(xa, L + tile.x), x1 = Math.min(xb, L + tile.x + tile.width);
            for (let y = Math.max(ya, T + tile.y); y < Math.min(yb, T + tile.y + tile.height); y++) {
              const offset = ((y - T - tile.y) * tile.width + x0 - L - tile.x) * 4;
              out.set(tile.data.subarray(offset, offset + (x1 - x0) * 4), ((y - y0) * docW + x0) * 4);
            }
          }
      } else {
        const band = await readLazyImageBand(l, ya - T, yb - ya);
        if (!band || band.preview) throw new Error('无法读取原始图片像素；已取消操作，避免使用缩略预览');
        for (let yy = 0; yy < band.height; yy++)
          out.set(band.data.subarray((yy * band.width + (xa - L)) * 4, (yy * band.width + (xb - L)) * 4), ((ya + yy - y0) * docW + xa) * 4);
      }
    }
  }
  const pp = pixelPaint[idx], tiles = pp?.sparse?.tiles;
  if (tiles?.size) {
    const left = pp.left | 0, top = pp.top | 0;
    for (const t of tiles.values()) {
      const ya = Math.max(y0, top + t.y), yb = Math.min(y0 + h, top + t.y + t.height);
      const xa = Math.max(0, left + t.x), xb = Math.min(docW, left + t.x + t.width);
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const s = ((y - top - t.y) * t.width + (x - left - t.x)) * 4, d = ((y - y0) * docW + x) * 4;
        out[d] = t.data[s]; out[d + 1] = t.data[s + 1]; out[d + 2] = t.data[s + 2]; out[d + 3] = t.data[s + 3];
      }
    }
  }
  return out;
}
async function mergedBandRGBA(y0, h){
  const out = new Uint8ClampedArray(docW * h * 4);
  const over = (r, g, b, a, q, op) => {
    const sa = a / 255 * op; if (!(sa > 0)) return;
    const da = out[q + 3] / 255, oa = sa + da * (1 - sa); if (!(oa > 0)) return;
    out[q] = Math.round((r * sa + out[q] * da * (1 - sa)) / oa);
    out[q + 1] = Math.round((g * sa + out[q + 1] * da * (1 - sa)) / oa);
    out[q + 2] = Math.round((b * sa + out[q + 2] * da * (1 - sa)) / oa);
    out[q + 3] = Math.round(oa * 255);
  };
  for (const i of displayOrder()) {
    const l = doc.layers[i]; if (!l || l.hidden || layerDeletes.has(i)) continue;
    const op = ((l.opacity ?? 255) / 255) * ((l.fillOpacity ?? 255) / 255); if (!(op > 0)) continue;
    const band = await layerBandRGBA(l, i, y0, h);
    for (let q = 0; q < band.length; q += 4) over(band[q], band[q + 1], band[q + 2], band[q + 3], q, op);
  }
  return out;
}
const selCoversFull = () => {
  const d = selection?.data;
  return !!(selection && d?.__virtual && !d.__tiles.size && !d.__base && !d.__neg && (d.__fill | 0) === 255
    && selection.x === 0 && selection.y === 0 && selection.width === docW && selection.height === docH);
};
async function copyToStore(merged){
  const why = storeCompositeWhy(merged ? displayOrder() : [selLayer]);
  if (why) { $('#notice').textContent = why; return false; }
  let region;
  if (merged) {
    const sb = selection ? selectionBounds(selection) : null;
    if (selection && !(sb && sb.width > 0 && sb.height > 0)) { $('#notice').textContent = '选区是空的：先画一个选区，或取消选择拷整幅画布。'; return false; }
    region = sb ? { x: Math.max(0, sb.x), y: Math.max(0, sb.y), w: Math.min(docW, sb.x + sb.width) - Math.max(0, sb.x), h: Math.min(docH, sb.y + sb.height) - Math.max(0, sb.y) }
                 : { x: 0, y: 0, w: docW, h: docH };
  } else {
    const l = doc.layers[selLayer]; if (!l) return false;
    const b = l.bounds || { left: 0, top: 0, right: l.width, bottom: l.height };
    if (selection) {
      const sb = selectionBounds(selection);
      if (!(sb && sb.width > 0 && sb.height > 0)) { $('#notice').textContent = '选区是空的：先画一个选区。'; return false; }
      region = { x: Math.max(0, sb.x), y: Math.max(0, sb.y), w: Math.min(docW, sb.x + sb.width) - Math.max(0, sb.x), h: Math.min(docH, sb.y + sb.height) - Math.max(0, sb.y) };
    } else {
      const x0 = Math.max(0, b.left | 0), y0 = Math.max(0, b.top | 0), x1 = Math.min(docW, b.right | 0), y1 = Math.min(docH, b.bottom | 0);
      if (!(x1 > x0 && y1 > y0)) { $('#notice').textContent = '这一层在画布上没有像素。'; return false; }
      region = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  }
  if (!(region.w > 0 && region.h > 0)) return false;
  const { x: rx, y: ry, w, h } = region;
  const fs = selCoversFull();
  const k = Math.max(1, Math.ceil(Math.max(w, h) / 512));
  const pw = Math.max(1, Math.ceil(w / k)), ph = Math.max(1, Math.ceil(h / k));
  const preview = new Uint8ClampedArray(pw * ph * 4);
  const writer = await createTileWriter(w, h, 256);
  try {
    for (let yy = 0; yy < h; yy += 256) {
      const bh = Math.min(256, h - yy);
      const src = merged ? await mergedBandRGBA(ry + yy, bh) : await layerBandRGBA(doc.layers[selLayer], selLayer, ry + yy, bh);
      const data = new Uint8ClampedArray(w * bh * 4);
      for (let row = 0; row < bh; row++) data.set(src.subarray(((row) * docW + rx) * 4, ((row) * docW + rx + w) * 4), row * w * 4);
      if (selection && !fs) {
        for (let row = 0; row < bh; row++) for (let x = 0; x < w; x++) {
          const a = data[(row * w + x) * 4 + 3];
          if (!a) continue;
          data[(row * w + x) * 4 + 3] = Math.round(a * selectionValueAt(selection, rx + x, ry + yy + row) / 255);
        }
      }
      for (let py = 0; py < ph; py++) {
        const sy = Math.min(h - 1, py * k);
        if (sy < yy || sy >= yy + bh) continue;
        for (let px = 0; px < pw; px++) {
          const sx = Math.min(w - 1, px * k);
          preview.set(data.subarray(((sy - yy) * w + sx) * 4, ((sy - yy) * w + sx) * 4 + 4), (py * pw + px) * 4);
        }
      }
      await writer.write({ x: 0, y: yy, width: w, height: bh, data });
      await new Promise(r => setTimeout(r, 0));
    }
    const store = await writer.close();
    pixelClipboard = { x: rx, y: ry, w, h, store, lazy: true, preview: { data: preview, width: pw, height: ph } };
    set_lastClipKind('pixels');
    $('#notice').textContent = `已${merged ? '合并' : ''}拷贝 ${w}×${h} 像素（磁盘瓦片 ${Math.round(w * h / 1e6)} MP）`;
    return true;
  } catch (e) {
    try { await writer.abort(); } catch {}
    $('#notice').textContent = '拷贝失败：' + humanEditError(e && e.message || e);
    return false;
  }
}
export function copyPixelsUI(merged){
  if (!doc || li || selLayer < 0) return false;
  if (useStoreCopy(merged)) return copyToStore(merged);
  if (merged) {
    
    const sb = selection ? selectionBounds(selection) : null;
    const box = sb ? { x: sb.x, y: sb.y, w: sb.width, h: sb.height } : { x: 0, y: 0, w: docW, h: docH };
    if (selection && !box.w) { $('#notice').textContent = '选区是空的：先画一个选区，或取消选择拷整幅画布。'; return false; }
    const img = compositeNowRGBA();
    const data = new Uint8ClampedArray(box.w * box.h * 4);
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      const dx = box.x + x, dy = box.y + y;
      const o = (dy * docW + dx) * 4, t = (y * box.w + x) * 4;
      for (let k = 0; k < 4; k++) data[t + k] = img[o + k];
      if (selection) data[t + 3] = Math.round(data[t + 3] * selectionValueAt(selection, dx, dy) / 255);
    }
    pixelClipboard = { x: box.x, y: box.y, w: box.w, h: box.h, data, ab: null };
    set_lastClipKind('pixels');
    $('#notice').textContent = `已合并拷贝 ${box.w}×${box.h} 像素`;
    return true;
  }
  const s = layerSampler(selLayer);
  if (!s) { $('#notice').textContent = '这一层没有可拷贝的像素。'; return false; }
  let region;
  if (selection) {
    const sb = selectionBounds(selection);          
    if (!sb || !sb.width || !sb.height) { $('#notice').textContent = '选区是空的：先画一个选区。'; return false; }
    region = { x: sb.x, y: sb.y, w: sb.width, h: sb.height };
  } else {
    
    const pts = [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]]
      .map(([x, y]) => [s.M[0] * x + s.M[2] * y + s.M[4], s.M[1] * x + s.M[3] * y + s.M[5]]);
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))));
    const x1 = Math.min(docW, Math.ceil(Math.max(...pts.map(p => p[0]))));
    const y1 = Math.min(docH, Math.ceil(Math.max(...pts.map(p => p[1]))));
    if (x1 <= x0 || y1 <= y0) { $('#notice').textContent = '这一层在画布上没有像素。'; return false; }
    region = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  
  const tmp = new Uint8ClampedArray(region.w * region.h * 4);
  for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) {
    const dx = region.x + x, dy = region.y + y;
    const sx = Math.floor(s.inv[0] * (dx + 0.5) + s.inv[2] * (dy + 0.5) + s.inv[4]);
    const sy = Math.floor(s.inv[1] * (dx + 0.5) + s.inv[3] * (dy + 0.5) + s.inv[5]);
    if (sx < 0 || sy < 0 || sx >= s.w || sy >= s.h) continue;
    const o = (y * region.w + x) * 4, si = (sy * s.w + sx) * 4;
    for (let k = 0; k < 4; k++) tmp[o + k] = s.rgba[si + k];
    if (selection) tmp[o + 3] = Math.round(tmp[o + 3] * selectionValueAt(selection, dx, dy) / 255);
  }
  const b = tightAlphaBox(tmp, region.w, region.h);
  if (!b) { $('#notice').textContent = '没有可拷贝的像素（选区内是透明的）。'; return false; }
  const srcAb = artboardOfLayer(selLayer);
  pixelClipboard = { x: region.x + b.x, y: region.y + b.y, w: b.w, h: b.h, data: cropRGBABox(tmp, region.w, b),
    ab: srcAb ? { ...srcAb.rect } : null };              
  set_lastClipKind('pixels');
  $('#notice').textContent = `已拷贝 ${b.w}×${b.h} 像素`;
  return true;
}
export function tightAlphaBox(data, w, h){
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (data[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function cropRGBABox(data, w, b){
  const out = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++)
    out.set(data.subarray(((y + b.y) * w + b.x) * 4, ((y + b.y) * w + b.x + b.w) * 4), y * b.w * 4);
  return out;
}




function pasteLazyClipboard(c, mode){
  if (mode === 'into' || mode === 'outside') {
    $('#notice').textContent = '大文档的磁盘剪贴板暂只支持普通粘贴 / 原位粘贴（贴入/外部粘贴需要把选区蒙版写进新层）。';
    return false;
  }
  if (!c.store?.id) { $('#notice').textContent = '剪贴板的磁盘瓦片已经失效，请重新拷贝。'; return false; }
  let c2 = c;
  const target = artboardOfLayer(selLayer);
  if (target && mode === 'inPlace' && c.ab) c2 = { ...c, x: c.x - c.ab.x + target.rect.x, y: c.y - c.ab.y + target.rect.y };
  else if (target && mode === 'paste') {
    const t = target.rect;
    c2 = { ...c, x: Math.round(t.x + (t.w - c.w) / 2), y: Math.round(t.y + (t.h - c.h) / 2) };
  }
  const name = nextLayerName('图层');
  const view = layerOrderView();
  const synth = doc.layers.length;
  pushDocHistory('粘贴');
  const layer = {
    name, width: c2.w, height: c2.h,
    bounds: { top: c2.y, left: c2.x, bottom: c2.y + c2.h, right: c2.x + c2.w },
    rgba: null, hidden: false, opacity: 255, fillOpacity: 255, blendMode: 'norm', clipping: false,
    lazyTileStore: c.store,
    lazyPreview: c.preview ? { data: c.preview.data, width: c.preview.width, height: c.preview.height } : null,
  };
  doc.layers.push(layer);
  const order = (layerReorder ? layerReorder.slice() : doc.layers.slice(0, synth).map((_, i) => i));
  let at = order.indexOf(selLayer); if (at < 0) at = order.length - 1;
  order.splice(at + 1, 0, synth);
  set_layerReorder(order);
  const proto = (layerTree?.flat || []).find(n => n && !n.group && n.groupType == null) || {};
  layerTree.flat[synth] = { ...proto, index: synth, name, width: c2.w, height: c2.h,
    bounds: { ...layer.bounds }, groupType: null, group: null, mask: null, vectorMask: null,
    adjustment: null, fill: null, text: null, isText: false, isSmartObject: false, hidden: false,
    opacity: 255, blendMode: 'norm' };
  layerRenames[synth] = name;
  selLayers.clear();
  set_selLayer(synth);
  renderLayerPanel(); renderProps(); renderPreviewOnly(); updateUndoButtons();
  const msg = `已粘贴为图层「${name}」（${c2.w}×${c2.h} @ ${c2.x},${c2.y}，磁盘瓦片）`;
  $('#notice').textContent = msg; shell.status(msg);
  return true;
}
export async function pasteClipboardUI(mode){
  if (!doc || li) return false;
  if (!pixelClipboard) { $('#notice').textContent = '剪贴板是空的：先拷贝或剪切一些像素。'; return false; }
  if (pixelClipboard.lazy) return pasteLazyClipboard(pixelClipboard, mode);
  if (mode === 'into' && !selection) { $('#notice').textContent = '「贴入」需要先有一个选区。'; return false; }
  if (mode === 'outside' && !selection) { $('#notice').textContent = '「外部粘贴」需要先有一个选区。'; return false; }
  if (!await ensureLazy(EDIT, '粘贴')) return false;
  const c = pixelClipboard;
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    

    const view = layerOrderView();
    const effOrder = view.order.filter(i => !layerDeletes.has(i));
    const node = selLayer >= 0 ? view.nodes[selLayer] : null;
    let at = effOrder.length;
    const selAb = docArtboards().find(a => a.index === selLayer);
    if (selAb && !li) {
      
      const p = effOrder.indexOf(selLayer);
      if (p >= 0) at = p;
    } else if (node && node.block) {
      const p = effOrder.indexOf(node.block.ids[node.block.ids.length - 1]);
      if (p >= 0) at = p + 1;
    }
    

    
    let c2 = c;
    const target = artboardOfLayer(selLayer);
    if (target && mode === 'inPlace' && c.ab) c2 = { ...c, x: c.x - c.ab.x + target.rect.x, y: c.y - c.ab.y + target.rect.y };
    else if (target && mode === 'paste') {
      const t = target.rect;
      c2 = { ...c, x: Math.round(t.x + (t.w - c.w) / 2), y: Math.round(t.y + (t.h - c.h) / 2) };
    }
    const name = nextLayerName('图层');
    const ops = [
      { op: 'createLayer', at, name },
      { op: 'replaceLayerPixels', index: at, rgba: { data: c2.data, width: c2.w, height: c2.h },
        bounds: { top: c2.y, left: c2.x, bottom: c2.y + c2.h, right: c2.x + c2.w } },
    ];
    if (mode === 'into' || mode === 'outside') {        
      const { gray } = selectionToMaskGray(selection, { x: c.x, y: c.y, width: c.w, height: c.h });
      if (mode === 'outside') for (let k = 0; k < gray.length; k++) gray[k] = 255 - gray[k];
      ops.push({ op: 'addLayerMask', index: at, gray,
                 bounds: { top: c.y, left: c.x, bottom: c.y + c.h, right: c.x + c.w } });
    }
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, mode === 'into' ? '贴入' : mode === 'outside' ? '外部粘贴' : '粘贴');
    const where = mode === 'into' ? '，只显示选区内的部分' : mode === 'outside' ? '，只显示选区外的部分' : '';
    const msg = `已粘贴为图层「${name}」（${c2.w}×${c2.h} @ ${c2.x},${c2.y}${where}${target && mode !== 'into' && mode !== 'outside' ? `，放进「${target.name}」` : ''}）`;
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    $('#err').textContent = '粘贴没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}

export function cutPixelsUI(){
  const r = copyPixelsUI(false);
  if (r && typeof r.then === 'function') return r.then(ok => { if (!ok) return false; clearSelectionPixels(); return true; });
  if (!r) return false;
  clearSelectionPixels();
  return true;
}






export function topLevelBlockList(view){
  const blocks = [];
  for (const i of view.order) {
    const n = view.nodes[i];
    if (n.depth === 0 && !n.divider) blocks.push(n.block.ids);   
  }
  return blocks;
}


export function composeSegmentRGBA(ids, normalizeIdx){
  const base = previewCompositeDoc(doc);
  let sub = composeDocForOrder(base, ids);
  const over = new Map();
  for (let k = 0; k < ids.length; k++) {
    const i = ids[k], l = sub.layers[k];
    const t = isMeshTransform(i) ? null : transformChanged(i);
    if (t) {
      const r = rasterizeTransformed(i);
      over.set(l, r && r.rgba
        ? { ...l, rgba: r.rgba, bounds: { ...r.bounds }, width: r.bounds.right - r.bounds.left, height: r.bounds.bottom - r.bounds.top }
        : { ...l, rgba: null, width: 0, height: 0, bounds: { top: 0, left: 0, bottom: 0, right: 0 } });
    } else if (textRenders[i] && textCrops[i] && textCrops[i].rgba) {
      const b = textCrops[i].bounds;
      over.set(l, { ...l, rgba: textCrops[i].rgba, bounds: { ...b }, width: b.right - b.left, height: b.bottom - b.top });
    }
  }
  for (const i of normalizeIdx) {
    const l = sub.layers[ids.indexOf(i)];
    if (l) over.set(l, { ...l, opacity: 255 });
  }
  if (over.size) sub = { ...sub, layers: sub.layers.map(l => over.get(l) || l) };
  return compositeAll(sub, docW, docH, new Map());
}
function layerAnyLocked(idx){
  const l = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!l) return false;
  return ['transparency', 'composite', 'position', 'all']
    .some((k, gi) => effLock(idx, l, ['lockTransparency', 'lockComposite', 'lockPosition', 'lockAll'][gi], k));
}

export function canMergeDown(){
  if (!doc || li || !origBuffer || selLayer < 0) return false;
  const blocks = topLevelBlockList(layerOrderView()), pi = blocks.findIndex(b => b.includes(selLayer));
  if (pi < 0) return false;
  for (let p = pi - 1; p >= 0; p--) {
    const id = blocks[p][blocks[p].length - 1];
    if (!doc.layers[id]?.hidden) return true;
  }
  return false;
}

async function composeIdsBand(ids, y0, h, flatten){
  const out = new Uint8ClampedArray(docW * h * 4);
  if (flatten) { out.fill(255); }
  else for (let q = 3; q < out.length; q += 4) out[q] = 0;
  const want = new Set(ids);
  for (const i of displayOrder()) {
    if (!want.has(i)) continue;
    const l = doc.layers[i]; if (!l || l.hidden || layerDeletes.has(i)) continue;
    const op = ((l.opacity ?? 255) / 255) * ((l.fillOpacity ?? 255) / 255); if (!(op > 0)) continue;
    const band = await layerBandRGBA(l, i, y0, h);
    for (let q = 0; q < band.length; q += 4) {
      let sa = band[q + 3] / 255 * op;
      if (l.clipping) sa *= out[q + 3] / 255;
      if (!(sa > 0)) continue;
      const da = out[q + 3] / 255, oa = sa + da * (1 - sa);
      out[q] = Math.round((band[q] * sa + out[q] * da * (1 - sa)) / oa);
      out[q + 1] = Math.round((band[q + 1] * sa + out[q + 1] * da * (1 - sa)) / oa);
      out[q + 2] = Math.round((band[q + 2] * sa + out[q + 2] * da * (1 - sa)) / oa);
      out[q + 3] = Math.round(oa * 255);
    }
  }
  return out;
}


async function mergeHugeLayers(kind, involved, targetIdx, targetIsGroup, targetHead){
  const ids = [...new Set(involved.flat())];
  const why = storeCompositeWhy(ids);
  if (why) { $('#notice').textContent = why; return false; }
  const content = ids.filter(i => doc.layers[i] && !doc.layers[i].hidden);
  const name = targetIsGroup
    ? (layerRenames[targetHead] || layerTree.flat[targetHead]?.name || layerTree.flat[targetHead]?.unicodeName || '图层')
    : (layerRenames[targetIdx] || doc.layers[targetIdx]?.name || '图层');
  const flatten = kind === 'flatten';
  const pk = Math.max(1, Math.ceil(Math.max(docW, docH) / 512));
  const pw = Math.max(1, Math.ceil(docW / pk)), ph = Math.max(1, Math.ceil(docH / pk));
  const preview = new Uint8ClampedArray(pw * ph * 4);
  const writer = await createTileWriter(docW, docH, 256);
  let prev = null;
  try {
    for (let y0 = 0; y0 < docH; y0 += 256) {
      const bh = Math.min(256, docH - y0);
      const band = await composeIdsBand(content, y0, bh, flatten);
      for (let py = 0; py < ph; py++) {
        const sy = Math.min(docH - 1, py * pk);
        if (sy < y0 || sy >= y0 + bh) continue;
        for (let px = 0; px < pw; px++) {
          const sx = Math.min(docW - 1, px * pk);
          preview.set(band.subarray(((sy - y0) * docW + sx) * 4, ((sy - y0) * docW + sx) * 4 + 4), (py * pw + px) * 4);
        }
      }
      await writer.write({ x: 0, y: y0, width: docW, height: bh, data: band });
      await new Promise(r => setTimeout(r, 0));
    }
    const store = await writer.close();
    prev = structuralBegin();
    const synth = doc.layers.length;
    const layer = { name, width: docW, height: docH,
      bounds: { top: 0, left: 0, bottom: docH, right: docW },
      rgba: null, hidden: false, opacity: 255, fillOpacity: 255, blendMode: 'norm', clipping: false,
      lazyTileStore: store, lazyPreview: { data: preview, width: pw, height: ph } };
    doc.layers.push(layer);
    const order = layerReorder ? layerReorder.slice() : doc.layers.slice(0, synth).map((_, i) => i);
    const lowId = involved[0]?.[0];
    let pos = order.indexOf(lowId);
    if (pos < 0) pos = 0;
    order.splice(pos, 0, synth);
    for (const i of ids) layerDeletes.add(i);
    set_layerReorder(order);
    const proto = (layerTree?.flat || []).find(n => n && !n.group && n.groupType == null) || {};
    layerTree.flat[synth] = { ...proto, index: synth, name, width: docW, height: docH,
      bounds: { ...layer.bounds }, groupType: null, group: null, mask: null, vectorMask: null,
      adjustment: null, fill: null, text: null, isText: false, isSmartObject: false, hidden: false,
      opacity: 255, blendMode: 'norm' };
    layerRenames[synth] = name;


    const built = await buildPsdBuffer({ fast: true });
    if (!built?.buf) throw new Error('合并结果没能写回分块缓冲');
    const mergedSel = order.indexOf(synth);
    await initDocument(built.buf, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.min(Math.max(mergedSel, 0), doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, flatten ? '拼合图像' : '合并图层');
    const msg = `${flatten ? '已拼合' : '已合并'} ${ids.length} 个图层（分块合成，共 ${(docW * docH / 1e6).toFixed(1)} MP）`;
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    try { await writer.abort(); } catch {}
    if (prev) { try { structuralApply(prev); } catch {} }
    $('#notice').textContent = '合并失败：' + humanEditError(e && e.message || e);
    return false;
  }
}
export async function mergeLayersUI(kind){
  if (!doc || li || !origBuffer) return false;
  const view = layerOrderView();
  const blocks = topLevelBlockList(view);
  if (!blocks.length) { $('#notice').textContent = '没有可合并的图层。'; return false; }
  let involved;                                        
  if (kind === 'merge') {
    const chosen = blocks.filter(b => b.some(id => selLayers.has(id)));
    if (chosen.length >= 2) involved = chosen;
    else {
      const pi = blocks.findIndex(b => b.includes(selLayer));
      if (pi < 0) { $('#notice').textContent = '先选中要合并的图层。'; return false; }
      
      let pj = -1;
      for (let p = pi - 1; p >= 0; p--) if (!doc.layers[blocks[p][blocks[p].length - 1]].hidden) { pj = p; break; }
      if (pj < 0) { $('#notice').textContent = '下面没有可见的图层可以合并。'; return false; }
      involved = [blocks[pj], blocks[pi]];
    }
  } else if (kind === 'flatten') {
    involved = blocks.slice();
  } else {
    involved = blocks.filter(b => !doc.layers[b[b.length - 1]].hidden);   
  }
  if (involved.length < 2 && kind !== 'flatten') { $('#notice').textContent = '至少需要两个图层才能合并。'; return false; }
  const targetBlock = involved[0];
  const targetHead = targetBlock[targetBlock.length - 1];
  const targetNode = view.nodes[targetHead];
  const targetIsGroup = !!targetNode.group;
  const targetIdx = targetIsGroup ? targetNode.index : targetBlock[0];
  const flat = layerTree && layerTree.flat;
  
  if (!targetIsGroup && !isBackgroundLayer(targetIdx) && layerAnyLocked(targetIdx)) {
    $('#notice').textContent = `「${layerRenames[targetIdx] || (flat[targetIdx] || {}).name || '图层'}」已锁定：先解锁再合并。`;
    return false;
  }
  if (docW * docH > 128e6 || involved.flat().some(i => layerNeedsStore(doc.layers[i])))
    return mergeHugeLayers(kind, involved, targetIdx, targetIsGroup, targetHead);
  if (!await ensureLazy(EDIT, '合并图层')) return false;
  $('#err').textContent = '';
  try {
    
    
    const surf = composeSegmentRGBA(involved.flatMap(b => b), targetIsGroup ? [] : [targetIdx]);
    const box = tightAlphaBox(surf.data, docW, docH);
    const merged = box ? { x: box.x, y: box.y, w: box.w, h: box.h,
                           data: cropRGBABox(surf.data, docW, box) } : null;
    const prev = structuralBegin();
    if (!targetIsGroup) setLayerOpacity(targetIdx, 255);
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    
    const view2 = layerOrderView();
    const effOrder = view2.order.filter(i => !layerDeletes.has(i));
    const posOf = i => effOrder.indexOf(i);
    const ops = [];
    let newLayerAt = -1, newName = '';
    if (targetIsGroup) {
      if (merged) {
        const topIds = involved[involved.length - 1];
        newName = layerRenames[topIds[topIds.length - 1]]
          || (flat[topIds[topIds.length - 1]] || {}).unicodeName || (flat[topIds[topIds.length - 1]] || {}).name || '图层';
        newLayerAt = posOf(targetBlock[0]);            
        ops.push({ op: 'createLayer', at: newLayerAt, name: newName });
        ops.push({ op: 'replaceLayerPixels', index: newLayerAt, rgba: { data: merged.data, width: merged.w, height: merged.h },
                   bounds: { top: merged.y, left: merged.x, bottom: merged.y + merged.h, right: merged.x + merged.w } });
      }
    } else if (merged) {
      const p = posOf(targetIdx);
      if (rasterKindOf(targetIdx)) ops.push({ op: 'rasterizeLayer', index: p });  
      ops.push({ op: 'replaceLayerPixels', index: p, rgba: { data: merged.data, width: merged.w, height: merged.h },
                 bounds: { top: merged.y, left: merged.x, bottom: merged.y + merged.h, right: merged.x + merged.w },
                 opts: { premultiplied: true } });      
    }
    
    const del = new Set();
    for (const b of involved) {
      if (!targetIsGroup && b === targetBlock) continue;
      for (const id of b) del.add(id);
    }
    const order = [];
    effOrder.forEach((i, p) => {
      if (newLayerAt >= 0 && p === newLayerAt) order.push(newLayerAt);
      if (!del.has(i)) order.push(newLayerAt >= 0 && p >= newLayerAt ? p + 1 : p);
    });
    ops.push({ op: 'reorderLayers', order });
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    
    const sel = order.indexOf(newLayerAt >= 0 ? newLayerAt : effOrder.indexOf(targetIdx));
    selLayers.clear();
    set_selLayer(Math.min(Math.max(sel, 0), doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, kind === 'flatten' ? '拼合图像' : kind === 'mergeVisible' ? '合并可见图层' : '合并图层');
    const nDel = [...del].filter(i => (flat[i] || {}).groupType !== 3).length;
    const label = targetIsGroup && merged ? `「${newName}」` : `「${layerRenames[targetIdx] || (flat[targetIdx] || {}).name || '图层'}」`;
    const msg = `${kind === 'flatten' ? '已拼合图像' : kind === 'mergeVisible' ? '已合并可见图层' : '已合并图层'}为 ${label}（${nDel} 个图层被合入${kind === 'flatten' ? '，隐藏图层已丢弃' : ''}）`;
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    $('#err').textContent = '合并没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}



export function maskFromTransparencyUI(){
  if (!doc || li || selLayer < 0) return false;
  const dl = doc.layers[selLayer];
  if (!dl) return false;
  const s = layerSampler(selLayer);
  if (!s) { $('#notice').textContent = '这一层没有像素，透明区域无从谈起。'; return false; }
  const gray = new Uint8Array(s.w * s.h);
  for (let i = 0; i < gray.length; i++) gray[i] = s.rgba[i * 4 + 3];
  if (!gray.some(v => v > 0)) { $('#notice').textContent = '这一层完全不透明，「从透明区域」生成的是整白蒙版，没有任何变化。'; return false; }
  delete maskPaint[selLayer];
  if (!ensureMaskPaint(selLayer, { create: true, gray })) { $('#err').textContent = '从透明区域生成蒙版没能完成。'; return false; }
  commitMaskPaint(selLayer);
  renderProps();
  const msg = `已按「${layerRenames[selLayer] || dl.name || '图层'}」的透明区域生成图层蒙版`;
  $('#notice').textContent = msg; shell.status(msg);
  return true;
}


export async function deleteVectorMaskUI(){
  if (!doc || li || selLayer < 0) return false;
  const L = layerTree && layerTree.flat[selLayer];
  if (!L || !L.vectorMask) return false;
  if (rasterKindOf(selLayer)) return rasterizeLayerUI(selLayer);
  const dl = doc.layers[selLayer];
  pushDocHistory('删除矢量蒙版');
  delete dl.vectorMask; delete L.vectorMask;
  delete vpathCache[selLayer];
  putLayerOp(selLayer, { op: 'rasterizeLayer', index: selLayer, keys: ['vmsk', 'vsms'] });
  renderPreviewOnly(); renderLayerPanel(); renderProps();
  const msg = '已删除矢量蒙版（路径不再裁剪这一层）';
  $('#notice').textContent = msg; shell.status(msg);
  return true;
}


export function setVectorMaskPathsUI(subpaths){
  const idx = selLayer, L = layerTree && layerTree.flat[idx];
  if (!L || !L.vectorMask) return false;
  return commitLayerOps(idx, () => {
    putLayerOp(idx, { op: 'setVectorMaskPath', index: idx, subpaths, units: 'pixel' });
    if (!subpaths.length)
      putLayerOp(idx, { op: 'setVectorMaskFlags', index: idx, fillStartsWithAllPixels: false });
  });
}


export async function addVectorMaskUI(mode){
  const idx = selLayer, L = layerTree && layerTree.flat[idx];
  if (!doc || li || !L || L.vectorMask || L.groupType != null && L.groupType !== 0) return false;
  if (mode === 'path' && !activeDocSubs()) { $('#notice').textContent = '先用钢笔画一条路径（工作路径）。'; return false; }
  if (!await ensureLazy(EDIT, '新建矢量蒙版')) return false;
  const full = [{ closed: true, operation: 1, knots: [[0, 0], [docW, 0], [docW, docH], [0, docH]].map(p => ({ anchor: p, in: p, out: p })) }];
  const subpaths = mode === 'path' ? activeDocSubs() : full;
  try {
    const prev = structuralBegin();
    const built = await buildPsdBuffer({ fast: true });
    const at = fileLayerIndex(idx);
    let r = applyEdits(built.buf, [{ op: 'addVectorMask', index: at, subpaths, units: 'pixel' }]);
    if (mode === 'hide') r = applyEdits(r.buffer, [{ op: 'setVectorMaskPath', index: at, subpaths: [], units: 'pixel' }, { op: 'setVectorMaskFlags', index: at, fillStartsWithAllPixels: false }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(idx, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '添加矢量蒙版');
    shell.status('已添加矢量蒙版' + (mode === 'hide' ? '（隐藏全部）' : mode === 'path' ? '（当前路径）' : '（显示全部）'));
    return true;
  } catch (e) { $('#err').textContent = '添加矢量蒙版没能完成：' + humanEditError(e && e.message || e); return false; }
}


export function toggleClippingMaskUI(){
  const idx = selLayer, L = layerTree && layerTree.flat[idx];
  if (!doc || !L || L.groupType === 3) return false;
  const on = effClipping(idx, L);
  setOpField(idx, { op: 'setLayerProps' }, 'clipping', !on, !!L.clipping);
  if (doc.layers[idx]) doc.layers[idx].clipping = !on ? 1 : 0;   
  renderProps(); syncLayerControls();
  const nm = layerRenames[idx] || L.unicodeName || L.name || '图层';
  const msg = !on ? `「${nm}」已剪贴到下方图层` : `已释放「${nm}」的剪贴蒙版`;
  $('#notice').textContent = msg; shell.status(msg);
  return true;
}




export function reverseLayersUI(){
  if (!doc || li) return false;
  const view = layerOrderView();
  const blocks = topLevelBlockList(view);
  if (blocks.length < 2) { $('#notice').textContent = '至少要有两个图层才能反向。'; return false; }
  const chosen = selLayers.size >= 2 ? blocks.filter(b => b.some(id => selLayers.has(id))) : null;
  if (chosen && chosen.length < 2) { $('#notice').textContent = '多选至少两个图层才能反向它们。'; return false; }
  const rev = chosen ? chosen.slice().reverse() : blocks.slice().reverse();
  const next = [];
  let ri = 0;
  for (const b of blocks) {
    if (chosen && !chosen.includes(b)) { next.push(b); continue; }
    next.push(rev[ri++]);
  }
  const order = next.flatMap(b => b);
  if (order.every((v, i) => v === view.order[i])) return false;
  pushDocHistory('反向');
  set_layerReorder(order);
  renderLayerPanel();
  renderStaticLayers();
  return true;
}

let lockDlgEl = null;
const LOCK_DLG_FIELDS = [
  ['transparency', 'lockTransparency', '锁定透明像素', '画笔只落在已有像素上（透明区域受保护）'],
  ['composite', 'lockComposite', '锁定图像像素', '不能修改这一层的像素（画笔 / 橡皮 / 滤镜都用不了）'],
  ['position', 'lockPosition', '锁定位置', '像素能改，但不能移动 / 变换这一层'],
  ['all', 'lockAll', '全部锁定', '透明像素、图像像素、位置全部锁住'],
];
export async function lockLayersDialog(){
  const flat = layerTree && layerTree.flat;
  if (!doc || li || !flat || selLayer < 0) return false;
  const l = flat[selLayer];
  if (!l || l.groupType === 3) { $('#notice').textContent = '这条结束记录不是图层。'; return false; }
  if (l.isGroup) { $('#notice').textContent = '组没有锁定项（PS 同）：要保护组内图层请逐层锁定。'; return false; }
  if (isBackgroundLayer(selLayer)) { $('#notice').textContent = '背景图层的锁是天生的：点面板锁定行第一颗锁把它转成普通图层。'; return false; }
  if (!lockDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:300px">'
      + '<h3 class="fp-dlg-title">锁定图层</h3>'
      + '<div class="lockDlg-body"></div>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    lockDlgEl = dlg;
  }
  const body = lockDlgEl.querySelector('.lockDlg-body');
  body.innerHTML = '';
  const boxes = LOCK_DLG_FIELDS.map(([key, field, label, tip]) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = effLock(selLayer, l, field, key);
    const sp = document.createElement('span'); sp.textContent = label; sp.title = tip;
    row.append(cb, sp);
    body.append(row);
    return { key, field, cb, orig: cb.checked };
  });
  const nm = layerRenames[selLayer] || l.unicodeName || l.name || '图层';
  lockDlgEl.querySelector('.fp-dlg-title').textContent = `锁定图层（${nm}）`;
  return await new Promise(res => {
    const ok = lockDlgEl.querySelector('.fp-dlg-ok');
    const cancel = lockDlgEl.querySelector('.fp-dlg-cancel');
    const done = v => { try { lockDlgEl.close(); } catch { lockDlgEl.removeAttribute('open'); } res(v); };
    ok.onclick = () => {
      const changed = boxes.filter(b => b.cb.checked !== b.orig);
      if (changed.length) {
        pushDocHistory('锁定图层');
        for (const b of changed) toggleLayerLock(selLayer, b.field, b.key);
      }
      done(true);
    };
    cancel.onclick = () => done(false);
    lockDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!lockDlgEl.open) { if (lockDlgEl.showModal) lockDlgEl.showModal(); else lockDlgEl.setAttribute('open', ''); } } catch { lockDlgEl.setAttribute('open', ''); }
  });
}

export function deleteHiddenLayersUI(){
  if (!doc || li) return false;
  const view = layerOrderView();
  const picks = view.visible.filter(i => doc.layers[i] && doc.layers[i].hidden);
  if (!picks.length) { $('#notice').textContent = '没有隐藏的图层。'; return false; }
  return deleteLayersReal(picks);
}
