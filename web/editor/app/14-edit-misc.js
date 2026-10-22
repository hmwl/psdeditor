




import './13-quickmask-apply-image.js';   
import { compositeAll, drawLayer } from '../../../core/app.js';
import { readExif, describeExif } from '../../../core/exif.js';
import { actions } from '../actions.js';
import { confirmDialog, formDialog, alertDialog } from '../dialog.js';
import { isShapeLayer } from '../property-panel.js';
import { shell } from '../shell.js';
import { $, BLEND_KEYS, BLEND_LABELS, CAFILL, ensureLazy, selectionBounds } from './01-boot.js';
import {
  brushHistory, doc, docH, docName, docW, layerTextEdits, layerTree, li, origBuffer, pixelPaint, selection,
} from './02-doc-state.js';
import {
  actRecord, docHistory, histCap, histLog, histPush, histReset, historyStep, pushDocHistory, updateUndoButtons,
} from './03-history.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { readResolution } from './08-doc-size.js';
import { PAINT_WARP_WHY, paintMap, srcBoxOfDocRect } from './11-paint-common.js';
import { readLazyImageTile } from './21-load-document.js';
import {
  layerCanvasCache, layerOrderView, renderLayerPanel, selLayer, set_selLayer, thumbCache,
} from './23-layers-panel.js';
import { humanEditError, renderProps } from './24-layer-ops-queue.js';
import { deleteLayersReal } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import { composeDocForOrder, previewCompositeDoc, renderPreviewOnly, renderStaticLayers } from './30-render.js';
import { bgRGB, fgRGB, hexOf } from './31-selection-brush.js';
import {
  commitPixelPaint, cutRect, diffBox, ensurePixelPaint, paintGuard, pasteRect, sameBytes, selCovFn,
  sparsePixelHistory,
} from './38-brush-engine.js';
import { dispTextOf } from './48-info-export.js';
import { renderTextLayer } from './49-fonts-text-model.js';
import { set_pixelClipboard } from './50-clipboard-merge-mask.js';





const blendFormOpts = () => BLEND_KEYS.map(k => [k, BLEND_LABELS[k] || k]);
export const hexToRGB = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16) || 0);


function sparseTileRects(pp, lim){
  const ts = pp.sparse.tileSize || 256;
  const x0 = Math.floor(Math.max(0, lim.x) / ts) * ts;
  const y0 = Math.floor(Math.max(0, lim.y) / ts) * ts;
  const x1 = Math.min(pp.w, Math.ceil((lim.x + lim.w) / ts) * ts);
  const y1 = Math.min(pp.h, Math.ceil((lim.y + lim.h) / ts) * ts);
  const out = [];
  for (let y = y0; y < y1; y += ts) for (let x = x0; x < x1; x += ts)
    out.push({ x, y, w: Math.min(ts, pp.w - x), h: Math.min(ts, pp.h - y) });
  return out;
}


export function layerPixelJob(label, compute, options = {}){
  if (!doc || li) return false;
  const brt = $('#brTarget'); const prevT = brt ? brt.value : null;
  if (brt) brt.value = 'pixels';
  const guard = paintGuard();
  if (brt) brt.value = prevT;
  if (guard) { $('#err').textContent = label + '用不了：' + guard; return false; }
  const idx = options.index ?? selLayer, pp = ensurePixelPaint(idx, { sparse: !!options.tile });
  if (!pp) { $('#err').textContent = label + '用不了：这一层没有可改的像素'; return false; }
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) { $('#err').textContent = label + '用不了：' + PAINT_WARP_WHY; return false; }
  const M = map.M, sc = selCovFn();


  const selUniform = !!(selection && selection.data?.__virtual && !selection.data.__base
    && !selection.data.__neg && !selection.data.__tiles?.size && selection.data.__fill === 255);
  if (pp.sparse) {
    return (async () => {

    const tr = pp.sparse.begin(); let patches = [];



    const docLim = options.rect || (selection ? selectionBounds(selection) : null);
    const sourceBox = docLim ? srcBoxOfDocRect(map.inv, docLim) : null;
    const lim = sourceBox ? {
      x: sourceBox.x0, y: sourceBox.y0,
      w: sourceBox.x1 - sourceBox.x0, h: sourceBox.y1 - sourceBox.y0,
    } : null;
    if (docLim && !lim) { tr.rollback(); $('#notice').textContent = `「${label}」和这一层没有重叠。`; return false; }


    const tileRects = lim ? sparseTileRects(pp, lim)
      : options.paintedOnly ? [...pp.sparse.tiles.values()].map(t => ({ x: t.x, y: t.y, w: t.width, h: t.height }))
      : sparseTileRects(pp, { x: 0, y: 0, w: pp.w, h: pp.h });
    if (!tileRects.length) {
      tr.rollback();
      $('#notice').textContent = `「${label}」没有已编辑的像素；超大图层请先建立选区。`;
      return false;
    }
    const revertApplied = () => { if (patches.length) pp.sparse.apply(patches, 'before'); };
    try {
      for (const r of tileRects) {
        await tr.prepare(r);
        for (const ctx of tr.contexts(r)) {
          const base = new Uint8ClampedArray(ctx.base), docXY = (sx, sy) => [
            Math.floor(M[0] * (sx + ctx.x + .5) + M[2] * (sy + ctx.y + .5) + M[4]),
            Math.floor(M[1] * (sx + ctx.x + .5) + M[3] * (sy + ctx.y + .5) + M[5]),
          ], fullySelected = selUniform && ctx.x >= selection.x && ctx.y >= selection.y
            && ctx.x + ctx.width <= selection.x + selection.width
            && ctx.y + ctx.height <= selection.y + selection.height,
          cov = sc && !fullySelected ? (sx, sy) => { const [dx, dy] = docXY(sx, sy); return sc(dx, dy) / 255; } : null;
          const layerBounds = { left: pp.left + ctx.x, top: pp.top + ctx.y };
          const out = compute({ base, w: ctx.width, h: ctx.height, docXY, cov, idx, pp, layerBounds });
          if (!out || out.length !== base.length) { tr.rollback(); revertApplied(); return false; }
          if (!sameBytes(base, out)) {
            let x0 = ctx.width, y0 = ctx.height, x1 = -1, y1 = -1;
            for (let y = 0; y < ctx.height; y++) for (let x = 0; x < ctx.width; x++) {
              const q = (y * ctx.width + x) * 4, a = cov ? cov(x, y) : 1;
              if (!(a > 0) || (ctx.clip && (x < ctx.clip.x0 || x >= ctx.clip.x1 || y < ctx.clip.y0 || y >= ctx.clip.y1))) continue;
              ctx.rgba[q] = out[q]; ctx.rgba[q + 1] = out[q + 1];
              ctx.rgba[q + 2] = out[q + 2]; ctx.rgba[q + 3] = out[q + 3];
              x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
            if (x1 >= x0) tr.dirty(ctx.key, { x0, y0, x1, y1 });
          }
        }
        patches.push(...tr.finish());
      }
    } catch (e) { tr.rollback(); revertApplied(); $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e); return false; }
    if (!patches.length) { $('#notice').textContent = `「${label}」没有改变任何像素。`; return false; }
    brushHistory.undo.push({ kind: 'sparsePixels', idx, patches });
    if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
    brushHistory.redo.length = 0; histPush(label, 'brush'); commitPixelPaint(idx);
    renderPreviewOnly(); updateUndoButtons(); lastPixelJob = { label, idx }; $('#err').textContent = ''; shell.status(label); return true;
    })();
  }
  const docXY = (sx, sy) => [Math.floor(M[0] * (sx + 0.5) + M[2] * (sy + 0.5) + M[4]), Math.floor(M[1] * (sx + 0.5) + M[3] * (sy + 0.5) + M[5])];
  const selAllDoc = selUniform && selection.x === 0 && selection.y === 0 && selection.width === docW && selection.height === docH;
  const cov = sc && !selAllDoc ? (sx, sy) => { const [dx, dy] = docXY(sx, sy); return sc(dx, dy) / 255; } : null;
  const base = Uint8ClampedArray.from(pp.rgba);
  let out;
  try { out = compute({ base, w: pp.w, h: pp.h, docXY, cov, idx, pp }); }
  catch (e) { $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e); return false; }
  if (!out) return false;
  const rect = diffBox(base, out, pp.w, pp.h, 4);
  if (!rect) { $('#notice').textContent = `「${label}」没有改变任何像素。`; return false; }
  const before = cutRect(base, pp.w, rect, 4), after = cutRect(out, pp.w, rect, 4);
  pp.rgba.set(out);
  brushHistory.undo.push(sparsePixelHistory(idx, base, out, pp.w, pp.h));
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  histPush(label, 'brush');
  commitPixelPaint(idx);
  renderPreviewOnly(); updateUndoButtons();
  lastPixelJob = { label, idx };
  $('#err').textContent = '';
  shell.status(label);
  return true;
}
let lastPixelJob = null;


export function selectionCoversAll(sel, left, top, w, h) {
  if (!sel || sel.width <= 0 || sel.height <= 0) return false;
  if (sel.x > left || sel.y > top || sel.x + sel.width < left + w || sel.y + sel.height < top + h) return false;
  const d = sel.data;
  return !!(d && d.__virtual && !d.__tiles.size && !d.__base && !d.__neg && (d.__fill | 0) === 255);
}




export async function bakeLayerTiles(label, compute, opts = {}) {
  const idx = opts.index ?? selLayer, layer = doc?.layers?.[idx];
  if (!doc || !layer || !(layer.width > 0 && layer.height > 0)) return false;
  let pp = pixelPaint[idx];
  if (!pp && (layer.lazyChannels || layer.lazyCompressedChannels || layer.lazyRasterSource || layer.lazyImage || layer.lazyRasterFile)) {
    try { pp = ensurePixelPaint(idx, { sparse: true }); } catch {}
  }
  const totalW = layer.width | 0, totalH = layer.height | 0;
  const left = pp?.left ?? (layer.bounds?.left | 0) ?? 0, top = pp?.top ?? (layer.bounds?.top | 0) ?? 0;
  const halo = Math.max(0, opts.halo | 0);


  if (!halo && opts.apply && !pp?.sparse?.tiles?.size && layer.lazyPreview?.data
      && (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile)) {
    const beforeOps = layer.lazyPixelOps ? [...layer.lazyPixelOps] : [];
    const beforePreview = layer.lazyPreview;
    let preview = null;
    try {
      const d = opts.apply(new Uint8ClampedArray(beforePreview.data), beforePreview.width, beforePreview.height, 0, 0);
      if (d && d.length === beforePreview.data.length) preview = { data: d, width: beforePreview.width, height: beforePreview.height };
    } catch {}
    if (preview) {
      const afterOps = [...beforeOps, { label, apply: opts.apply }];
      layer.lazyPixelOps = afterOps; layer.lazyPreview = preview;
      layer.lazyPreviewCanvas = null; layer.lazyHighTiles = new Map(); layer.lazyImageTiles = new Map();
      layer.lazyImageChunks = new Map(); layer.lazyImageCanvas = null; layer.lazyGpuDetail = null; layer.lazyTileCache = null;
      layer.lazyTileVersion = (layer.lazyTileVersion || 0) + 1;
      brushHistory.undo.push({ kind: 'pixelOps', idx, before: { ops: beforeOps, preview: beforePreview }, after: { ops: afterOps, preview } });
      if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
      brushHistory.redo.length = 0; histPush(label, 'brush');
      delete layerCanvasCache[idx]; delete thumbCache[idx];
      renderPreviewOnly(); updateUndoButtons(); lastPixelJob = { label, idx }; $('#err').textContent = ''; shell.status(label);
      return true;
    }
  }
  const store = await import('../../../core/tile-store.js');
  await store.requestPersistence?.();
  const writer = await store.createTileWriter(totalW, totalH);
  const target = 16e6, scale = Math.min(1, Math.sqrt(target / Math.max(1, totalW * totalH)));
  const pw = Math.max(1, Math.round(totalW * scale)), ph = Math.max(1, Math.round(totalH * scale));
  const preview = new Uint8ClampedArray(pw * ph * 4);
  const tileRects = [];
  for (let y = 0; y < totalH; y += 256) for (let x = 0; x < totalW; x += 256)
    tileRects.push({ x, y, w: Math.min(256, totalW - x), h: Math.min(256, totalH - y) });
  const readRegion = async (x, y, w, h) => {
    const out = new Uint8ClampedArray(w * h * 4);
    if (layer.rgba) {
      for (let yy = 0; yy < h; yy++) out.set(layer.rgba.subarray(((y + yy) * totalW + x) * 4, ((y + yy) * totalW + x + w) * 4), yy * w * 4);
      return out;
    }
    for (let ty = Math.floor(y / 256) * 256; ty < y + h; ty += 256) for (let tx = Math.floor(x / 256) * 256; tx < x + w; tx += 256) {
      const tw = Math.min(256, totalW - tx), th = Math.min(256, totalH - ty);
      let t = pp?.sparse?.tiles.get(`${tx}:${ty}`);
      if (!t) {
        if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) t = await readLazyImageTile(layer, tx, ty, 256);
        else if (pp?.sparse) t = { x: tx, y: ty, width: tw, height: th, data: await pp.sparse.readRect({ x: tx, y: ty, w: tw, h: th }) };
      }
      if (!t) continue;
      const x0 = Math.max(x, tx), x1 = Math.min(x + w, tx + tw), y0 = Math.max(y, ty), y1 = Math.min(y + h, ty + th);
      if (!(x1 > x0 && y1 > y0)) continue;
      for (let yy = y0; yy < y1; yy++) out.set(
        t.data.subarray(((yy - t.y) * t.width + (x0 - t.x)) * 4, ((yy - t.y) * t.width + (x1 - t.x)) * 4),
        ((yy - y) * w + (x0 - x)) * 4);
    }
    return out;
  };
  let done = 0;
  try {
    for (const r of tileRects) {
      if (opts.signal?.aborted) throw opts.signal.reason || new DOMException('操作已取消', 'AbortError');
      let bw = r.w, bh = r.h, bx = r.x, by = r.y, base;
      if (halo) {
        bx = Math.max(0, r.x - halo); by = Math.max(0, r.y - halo);
        bw = Math.min(totalW, r.x + r.w + halo) - bx; bh = Math.min(totalH, r.y + r.h + halo) - by;
        base = await readRegion(bx, by, bw, bh);
      } else {
        const edit = pp?.sparse?.tiles?.get(`${r.x}:${r.y}`);
        if (edit) base = edit.data;
        else if (layer.rgba) {
          base = new Uint8ClampedArray(r.w * r.h * 4);
          for (let y = 0; y < r.h; y++) base.set(layer.rgba.subarray(((r.y + y) * totalW + r.x) * 4, ((r.y + y) * totalW + r.x + r.w) * 4), y * r.w * 4);
        } else if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
          const t = await readLazyImageTile(layer, r.x, r.y, 256);
          if (t) base = t.data.length === r.w * r.h * 4 ? t.data : (() => {
            const d = new Uint8ClampedArray(r.w * r.h * 4);
            for (let y = 0; y < r.h; y++) d.set(t.data.subarray(y * t.width * 4, (y * t.width + r.w) * 4), y * r.w * 4);
            return d;
          })();
        } else if (pp?.sparse) {
          base = await pp.sparse.readRect({ x: r.x, y: r.y, w: r.w, h: r.h });
        }
      }
      if (!base) throw new Error('图层像素读取失败');
      const wide = await compute({ base, w: bw, h: bh, x: bx, y: by, left, top, layer });
      if (!wide || wide.length !== bw * bh * 4) throw new Error('分块计算返回尺寸不一致');
      let out = wide;
      if (halo) {
        out = new Uint8ClampedArray(r.w * r.h * 4);
        const ox = r.x - bx, oy = r.y - by;
        for (let y = 0; y < r.h; y++) out.set(wide.subarray(((oy + y) * bw + ox) * 4, ((oy + y) * bw + ox + r.w) * 4), y * r.w * 4);
      }
      await writer.write({ x: r.x, y: r.y, width: r.w, height: r.h, data: out });
      const px0 = Math.max(0, Math.floor(r.x * scale)), px1 = Math.min(pw, Math.ceil((r.x + r.w) * scale));
      const py0 = Math.max(0, Math.floor(r.y * scale)), py1 = Math.min(ph, Math.ceil((r.y + r.h) * scale));
      for (let py = py0; py < py1; py++) {
        const sy = Math.min(totalH - 1, Math.floor((py + .5) / scale));
        if (sy < r.y || sy >= r.y + r.h) continue;
        for (let px = px0; px < px1; px++) {
          const sx = Math.min(totalW - 1, Math.floor((px + .5) / scale));
          if (sx < r.x || sx >= r.x + r.w) continue;
          const si = ((sy - r.y) * r.w + (sx - r.x)) * 4, di = (py * pw + px) * 4;
          preview[di] = out[si]; preview[di + 1] = out[si + 1]; preview[di + 2] = out[si + 2]; preview[di + 3] = out[si + 3];
        }
      }
      done++;
      if ((done & 15) === 0) await new Promise(r => setTimeout(r, 0));
      if ((done & 63) === 0) shell.status(`${label}：${done}/${tileRects.length} 块`);
    }
  } catch (e) {
    try { await writer.abort(); } catch {}
    throw e;
  }
  const before = {
    store: layer.lazyTileStore || null, preview: layer.lazyPreview || null, previewCanvas: layer.lazyPreviewCanvas || null,
    highTiles: layer.lazyHighTiles || null, imageTiles: layer.lazyImageTiles || null,
    imageChunks: layer.lazyImageChunks || null, imageCanvas: layer.lazyImageCanvas || null,
    tileCache: layer.lazyTileCache || null, sparseTiles: pp?.sparse ? new Map(pp.sparse.tiles) : null,
    ops: layer.lazyPixelOps || [],
  };
  const nextStore = await writer.close(); nextStore.complete = true;
  layer.lazyTileStore = nextStore;
  layer.lazyPreview = { data: preview, width: pw, height: ph };
  layer.lazyPreviewCanvas = null; layer.lazyHighTiles = new Map(); layer.lazyImageTiles = new Map();
  layer.lazyImageChunks = new Map(); layer.lazyImageCanvas = null; layer.lazyGpuDetail = null; layer.lazyTileCache = null;
  layer.lazyTileVersion = (layer.lazyTileVersion || 0) + 1;
  layer.lazyPixelOps = [];
  if (pp?.sparse) { pp.sparse.tiles.clear(); pp.sparse.descriptor.version++; pp.clean = true; }
  commitPixelPaint(idx);
  brushHistory.undo.push({ kind: 'tileStore', idx, before,
    after: { store: nextStore, preview: layer.lazyPreview, previewCanvas: null, highTiles: null, imageTiles: null,
      imageChunks: null, imageCanvas: null, tileCache: null, sparseTiles: new Map(), ops: [] } });
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  histPush(label, 'brush');
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  renderPreviewOnly(); updateUndoButtons();
  lastPixelJob = { label, idx }; $('#err').textContent = ''; shell.status(label);
  return true;
}


function blendFill(base, w, h, colorAt, alphaAt, mode, opacity, preserve){
  const src = { width: w, height: h, data: new Uint8ClampedArray(base.length) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = alphaAt(x, y); if (!(a > 0)) continue;
    const o = (y * w + x) * 4;
    if (preserve) { if (!base[o + 3]) continue; }
    const c = colorAt(x, y); src.data[o] = c[0]; src.data[o + 1] = c[1]; src.data[o + 2] = c[2]; src.data[o + 3] = Math.round(Math.min(1, a) * 255);
  }
  const dst = { width: w, height: h, data: new Uint8ClampedArray(base), dirty: null };
  drawLayer(dst, src, 0, 0, { opacity, blendMode: mode || 'norm' });
  if (preserve) for (let o = 3; o < base.length; o += 4) dst.data[o] = base[o];
  return dst.data;
}

export async function editFillDialog(){
  if (!doc || li || selLayer < 0) return false;
  const v = await formDialog('填充', [
    { key: 'contents', label: '内容', type: 'select', value: 'fg', options: [['fg', '前景色'], ['bg', '背景色'], ['color', '颜色…'], ['contentAware', '内容识别'], ['black', '黑色'], ['gray', '50% 灰色'], ['white', '白色']] },
    { key: 'color', label: '颜色', type: 'color', value: hexOf(fgRGB), showIf: o => o.contents === 'color' },
    { key: 'mode', label: '模式', type: 'select', value: 'norm', options: blendFormOpts(), showIf: o => o.contents !== 'contentAware' },
    { key: 'opacity', label: '不透明度', type: 'number', value: 100, min: 0, max: 100, unit: '%', showIf: o => o.contents !== 'contentAware' },
    { key: 'preserve', label: '保留透明区域', type: 'check', value: false, showIf: o => o.contents !== 'contentAware' },
    { type: 'note', label: '内容识别：用选区周围的纹理把选区补上（需要先做选区）。', showIf: o => o.contents === 'contentAware' },
  ]);
  if (!v) return false;
  return fillWith(v);
}

export async function fillWith(v){
  if (!doc || li || selLayer < 0) return false;
  if (v.contents === 'contentAware') { const ok = await contentAwareFillNow(); if (ok !== false) actRecord('fill', { using: 'contentAware' }); return ok; }
  const col = { fg: fgRGB, bg: bgRGB, black: [0, 0, 0], gray: [128, 128, 128], white: [255, 255, 255], color: hexToRGB(v.color || '#000000') }[v.contents] || fgRGB;
  const layer = doc.layers[selLayer], pp0 = pixelPaint[selLayer];
  const left = pp0?.left ?? (layer?.bounds?.left | 0), top = pp0?.top ?? (layer?.bounds?.top | 0);
  const fullCover = !selection || selectionCoversAll(selection, left, top, pp0?.w || layer?.width || docW, pp0?.h || layer?.height || docH);
  if (docW * docH > 64e6 && fullCover && (pixelPaint[selLayer]?.sparse || layer?.lazyTileStore || layer?.lazyImage || layer?.lazyRasterFile || layer?.lazyChannels)) {
    try {
      const applyFill = (base, w, h) =>
        blendFill(base, w, h, () => col, () => 1, v.mode || 'norm', (v.opacity ?? 100) / 100, !!v.preserve);
      const ok = await bakeLayerTiles('填充', ({ base, w, h }) => applyFill(base, w, h), { index: selLayer, apply: applyFill });
      if (ok) actRecord('fill', { using: v.contents, color: v.contents === 'color' ? hexToRGB(v.color) : undefined, mode: v.mode || 'norm', opacity: v.opacity ?? 100, preserve: !!v.preserve });
      return ok;
    } catch (e) {
      $('#err').textContent = '填充失败：' + humanEditError(e && e.message || e);
      return false;
    }
  }
  const r = await layerPixelJob('填充', ({ base, w, h, cov }) =>
    blendFill(base, w, h, () => col, cov ? (x, y) => cov(x, y) : () => 1, v.mode || 'norm', (v.opacity ?? 100) / 100, !!v.preserve), { tile: true });
  if (r !== false) actRecord('fill', { using: v.contents, color: v.contents === 'color' ? hexToRGB(v.color) : undefined, mode: v.mode || 'norm', opacity: v.opacity ?? 100, preserve: !!v.preserve });
  return r;
}


function edt2D(f, w, h){
  const INF = 1e20, n = Math.max(w, h), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
  const pass = (get, set, len) => {
    for (let q = 0; q < len; q++) g[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + g[v[k]]; }
    for (let q = 0; q < len; q++) set(q, d[q]);
  };
  for (let x = 0; x < w; x++) pass(y => f[y * w + x], (y, val) => { f[y * w + x] = val; }, h);
  for (let y = 0; y < h; y++) pass(x => f[y * w + x], (x, val) => { f[y * w + x] = val; }, w);
  return f;
}

function selectionStrokeMap(width, location){
  const sel = selection; if (!sel) return null;
  const pad = Math.ceil(width) + 2;
  const X0 = sel.x - pad, Y0 = sel.y - pad, W = sel.width + pad * 2, H = sel.height + pad * 2;
  const inside = new Float64Array(W * H), outside = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + X0 - sel.x, j = y + Y0 - sel.y;
    const on = i >= 0 && j >= 0 && i < sel.width && j < sel.height && sel.data[j * sel.width + i] >= 128;
    inside[y * W + x] = on ? 1e20 : 0;           
    outside[y * W + x] = on ? 0 : 1e20;          
  }
  edt2D(inside, W, H); edt2D(outside, W, H);
  const a = new Float32Array(W * H);
  const [inW, outW] = location === 'inside' ? [width, 0] : location === 'outside' ? [0, width] : [width / 2, width / 2];
  for (let k = 0; k < W * H; k++) {
    const di = Math.sqrt(inside[k]), dout = Math.sqrt(outside[k]);
    if (di > 0) a[k] = Math.max(0, Math.min(1, inW - di + 1));        
    else a[k] = Math.max(0, Math.min(1, outW - dout + 1));             
  }
  return { x: X0, y: Y0, w: W, h: H, a };
}
export async function editStrokeDialog(){
  if (!doc || li || selLayer < 0) return false;
  if (!selection) { $('#notice').textContent = '描边：先做一个选区（PS 的「编辑 › 描边」沿选区边缘画线）。'; return false; }
  const v = await formDialog('描边', [
    { key: 'width', label: '宽度', type: 'number', value: 3, min: 1, max: 250, unit: '像素' },
    { key: 'color', label: '颜色', type: 'color', value: hexOf(fgRGB) },
    { key: 'location', label: '位置', type: 'select', value: 'center', options: [['inside', '内部'], ['center', '居中'], ['outside', '居外']] },
    { key: 'mode', label: '模式', type: 'select', value: 'norm', options: blendFormOpts() },
    { key: 'opacity', label: '不透明度', type: 'number', value: 100, min: 0, max: 100, unit: '%' },
    { key: 'preserve', label: '保留透明区域', type: 'check', value: false },
  ]);
  if (!v) return false;
  const m = selectionStrokeMap(v.width, v.location), col = hexToRGB(v.color);
  return layerPixelJob('描边', ({ base, w, h, docXY }) => blendFill(base, w, h, () => col, (x, y) => {
    const [dx, dy] = docXY(x, y), i = dx - m.x, j = dy - m.y;
    return (i < 0 || j < 0 || i >= m.w || j >= m.h) ? 0 : m.a[j * m.w + i];
  }, v.mode, v.opacity / 100, v.preserve), { tile: true });
}


export function fadeTarget(){
  const e = brushHistory.undo[brushHistory.undo.length - 1];
  if (!e || e.kind !== 'pixels' || e.px !== 4) return null;
  const last = histLog.items[histLog.cursor];
  if (!last || last.kind !== 'brush' || /^渐隐/.test(last.label)) return null;
  const pp = pixelPaint[e.idx]; if (!pp) return null;
  if (!sameBytes(cutRect(pp.rgba, pp.w, e.rect, 4), e.after)) return null;
  return { e, label: last.label };
}
export async function editFadeDialog(){
  const t = fadeTarget(); if (!t) { $('#notice').textContent = '渐隐：只有紧接着一步像素操作（画笔 / 填充 / 滤镜…）之后才能用。'; return false; }
  const { e } = t, pp = pixelPaint[e.idx];
  const make = v => {
    const R = e.rect, bs = { width: R.w, height: R.h, data: new Uint8ClampedArray(e.before), dirty: null };
    const op = v.opacity / 100;
    if (v.mode === 'norm') { for (let i = 0; i < bs.data.length; i++) bs.data[i] = Math.round(e.before[i] + (e.after[i] - e.before[i]) * op); }
    else drawLayer(bs, { width: R.w, height: R.h, data: e.after }, 0, 0, { opacity: op, blendMode: v.mode });
    const out = new Uint8ClampedArray(pp.rgba); pasteRect(out, pp.w, R, bs.data, 4); return out;
  };
  const preview = v => { pp.rgba.set(make(v)); delete layerCanvasCache[e.idx]; delete thumbCache[e.idx]; renderPreviewOnly(); };
  const orig = Uint8ClampedArray.from(pp.rgba);
  const v = await formDialog('渐隐 ' + t.label, [
    { key: 'opacity', label: '不透明度', type: 'number', value: 100, min: 0, max: 100, unit: '%' },
    { key: 'mode', label: '模式', type: 'select', value: 'norm', options: blendFormOpts() },
  ], { onChange: preview });
  pp.rgba.set(orig); delete layerCanvasCache[e.idx]; delete thumbCache[e.idx];
  if (!v) { renderPreviewOnly(); return false; }
  const prevSel = selLayer; set_selLayer(e.idx);
  const ok = layerPixelJob('渐隐 ' + t.label, () => make(v));
  set_selLayer(prevSel);
  return ok;
}

export async function contentAwareFillNow(){
  if (!selection) { $('#notice').textContent = '内容识别填充：先用选区圈出要去掉的东西。'; return false; }
  if (!await ensureLazy(CAFILL, '内容识别填充')) return false;
  const CA = CAFILL.peek ? CAFILL.peek() : await CAFILL.load();
  shell.status('内容识别填充：计算中…');
  await new Promise(r => setTimeout(r, 30));
  return layerPixelJob('内容识别填充', ({ base, w, h, cov }) => {
    const mask = new Uint8Array(w * h);
    let any = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = cov(x, y); if (c > 0) { mask[y * w + x] = Math.round(c * 255); any = true; } }
    if (!any) throw new Error('选区和这个图层没有重叠');
    
    const filled = CA.contentAwareFill(base, w, h, mask, { seed: 1 });
    const out = new Uint8ClampedArray(base);
    for (let i = 0; i < w * h; i++) { const a = mask[i] / 255; if (!a) continue; for (let c = 0; c < 4; c++) out[i * 4 + c] = Math.round(base[i * 4 + c] + (filled[i * 4 + c] - base[i * 4 + c]) * a); }
    return out;
  });
}


export async function commandSearch(){
  const { MENUS } = await import('../menu.js');
  const items = [];
  const walk = (list, path) => { for (const i of list) { if (i.sep) continue; if (i.sub) walk(i.sub, path.concat(i.label)); else if (i.action) items.push({ id: i.action, label: i.label.replace(/[…]/g, ''), path: path.join(' › ') }); } };
  for (const m of MENUS) walk(m.items, [m.label]);
  let d = document.getElementById('cmdSearchDlg');
  if (d) d.remove();
  d = Object.assign(document.createElement('dialog'), { id: 'cmdSearchDlg', className: 'fp-dlg' });
  d.innerHTML = '<form method="dialog" class="fp-dlg-form" style="width:520px"><h3 class="fp-dlg-title">搜索命令</h3>'
    + '<input type="text" placeholder="输入命令名，例如：高斯模糊 / 填充 / 参考线" style="width:100%;box-sizing:border-box">'
    + '<div class="cmd-list" style="max-height:50vh;overflow:auto;margin-top:8px"></div></form>';
  document.body.append(d);
  const inp = d.querySelector('input'), list = d.querySelector('.cmd-list');
  let sel = 0, shown = [];
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    shown = items.filter(i => !q || i.label.toLowerCase().includes(q) || i.path.toLowerCase().includes(q))
      .sort((a, b) => (actions.enabled(b.id) - actions.enabled(a.id))).slice(0, 60);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    shown.forEach((it, k) => {
      const on = actions.enabled(it.id);
      const row = Object.assign(document.createElement('div'), { style: `padding:5px 8px;border-radius:4px;cursor:${on ? 'pointer' : 'default'};opacity:${on ? 1 : 0.45};${k === sel ? 'background:var(--accent,#1473e6);color:#fff' : ''}` });
      row.innerHTML = `<b style="font-weight:600"></b><span style="float:right;opacity:.7;font-size:11px"></span>`;
      row.firstChild.textContent = it.label; row.lastChild.textContent = it.path + (on ? '' : '（当前不可用）');
      if (!on) row.title = actions.why(it.id) || '';
      row.onclick = () => { if (on) { d.close(); d.remove(); actions.run(it.id); } };
      list.append(row);
    });
  };
  inp.oninput = () => { sel = 0; draw(); };
  inp.onkeydown = ev => {
    if (ev.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const it = shown[sel]; if (it && actions.enabled(it.id)) { d.close(); d.remove(); actions.run(it.id); } }
  };
  d.addEventListener('close', () => d.remove());
  draw(); d.showModal(); inp.focus();
  return true;
}


export async function findReplaceText(){
  const flat = (layerTree && layerTree.flat) || [];
  const idxs = doc ? flat.map((l, i) => (l && l.text && l.text.content != null ? i : -1)).filter(i => i >= 0) : [];
  if (!idxs.length) { $('#notice').textContent = '这个文档里没有文字图层。'; return false; }
  const v = await formDialog('查找和替换文本', [
    { key: 'find', label: '查找内容', type: 'text', value: '' },
    { key: 'repl', label: '更改为', type: 'text', value: '' },
    { key: 'caseSens', label: '区分大小写', type: 'check', value: false },
    { key: 'whole', label: '全字匹配', type: 'check', value: false },
    { key: 'scope', label: '范围', type: 'select', value: 'all', options: [['all', '所有文字图层'], ['sel', '仅当前图层']] },
  ], { okText: '全部更改' });
  if (!v || !v.find) return false;
  const esc = v.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(v.whole ? `\\b${esc}\\b` : esc, v.caseSens ? 'g' : 'gi');
  const targets = v.scope === 'sel' ? idxs.filter(i => i === selLayer) : idxs;
  let changed = 0, hits = 0;
  pushDocHistory('替换文本');
  for (const i of targets) {
    const L = flat[i], cur = dispTextOf(i, L), m = cur.match(re);
    if (!m) continue;
    hits += m.length;
    const t = cur.replace(re, v.repl);
    if (!t) continue;
    if (t !== L.text.content) layerTextEdits[i] = t; else delete layerTextEdits[i];
    await renderTextLayer(i, L); changed++;
  }
  renderStaticLayers(); renderProps(); renderLayerPanel();
  await alertDialog(changed ? `在 ${changed} 个文字图层里替换了 ${hits} 处。` : `没有找到「${v.find}」。`, { title: '查找和替换文本' });
  return changed > 0;
}


export function deleteEmptyLayersUI(){
  if (!doc || li) return false;
  const view = layerOrderView();
  const empty = view.visible.filter(i => {
    const l = doc.layers[i], t = layerTree && layerTree.flat && layerTree.flat[i]; if (!l) return false;
    if (l.text || (t && (t.text || t.adjustment || t.isSmartObject)) || l.adjustment || l.isSmartObject || isShapeLayer(l) || l.vectorMask) return false;
    const n = view.nodes[i]; if (n && (n.group || n.divider)) return false;
    if (isBackgroundLayer(i)) return false;
    const px = (pixelPaint[i] && pixelPaint[i].rgba) || l.rgba;
    if (!px || !l.width || !l.height) return true;
    for (let o = 3; o < px.length; o += 4) if (px[o]) return false;
    return true;
  });
  if (!empty.length) { $('#notice').textContent = '没有空图层。'; return false; }
  return deleteLayersReal(empty);
}


export function printDocument(){
  if (!doc) return false;
  let url;
  try {
    const surf = compositeAll(composeDocForOrder(previewCompositeDoc(doc), displayOrder()), docW, docH, new Map());
    const c = document.createElement('canvas'); c.width = docW; c.height = docH;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(surf.data), docW, docH), 0, 0);
    url = c.toDataURL('image/png');
  } catch (e) { $('#err').textContent = '打印失败：' + (e && e.message || e); return false; }
  const ifr = Object.assign(document.createElement('iframe'), { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
  document.body.append(ifr);
  const dpi = origBuffer ? readResolution(origBuffer) : 72;
  ifr.contentDocument.write(`<!doctype html><title>${(docName || 'PSD Editor').replace(/</g, '')}</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}img{max-width:100%;width:${(docW / dpi).toFixed(3)}in}</style><img src="${url}">`);
  ifr.contentDocument.close();
  const go = () => { try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } finally { setTimeout(() => ifr.remove(), 1000); } };
  const img = ifr.contentDocument.querySelector('img');
  if (img.complete) go(); else img.onload = go;
  return true;
}


function exifRows(){
  let d = null;
  try { d = origBuffer ? describeExif(readExif(new Uint8Array(origBuffer))) : null; } catch {}
  if (!d) return [];
  return [
    { type: 'note', label: '相机数据（EXIF）' },
    ...[['camCamera', '相机', d.camera], ['camLens', '镜头', d.lens], ['camExposure', '曝光', d.exposure], ['camDate', '拍摄时间', d.date], ['camSoftware', '软件', d.software]]
      .filter(r => r[2]).map(([key, label, value]) => ({ key, label, type: 'text', value, readonly: true })),
  ];
}

export async function fileInfoDialog(){
  if (!doc) return false;
  let xmp = '';
  try {
    const u8 = new Uint8Array(origBuffer), head = new TextDecoder('utf-8', { fatal: false }).decode(u8.subarray(0, Math.min(u8.length, 4 << 20)));
    const a = head.indexOf('<x:xmpmeta'), b = head.indexOf('</x:xmpmeta>');
    if (a >= 0 && b > a) xmp = head.slice(a, b);
  } catch {}
  const tag = t => { const m = xmp.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; };
  const n = doc.layers.length, dpi = `${origBuffer ? readResolution(origBuffer) : 72} ppi`;
  const size = origBuffer ? (origBuffer.byteLength / 1048576).toFixed(2) + ' MB' : '—';
  await formDialog('文件简介', [
    { key: 'name', label: '文件名', type: 'text', value: docName || '', readonly: true },
    { key: 'dim', label: '尺寸', type: 'text', value: `${docW} × ${docH} 像素 · ${dpi}`, readonly: true },
    { key: 'mode', label: '模式', type: 'text', value: `${({ 3: 'RGB', 1: '灰度', 4: 'CMYK', 9: 'Lab', 2: '索引' })[doc.colorMode] || 'RGB'} · ${doc.depth || 8} 位/通道`, readonly: true },
    { key: 'layers', label: '图层', type: 'text', value: String(n), readonly: true },
    { key: 'bytes', label: '文件大小', type: 'text', value: size, readonly: true },
    { key: 'title', label: '文档标题', type: 'text', value: tag('dc:title'), readonly: true },
    { key: 'author', label: '作者', type: 'text', value: tag('dc:creator'), readonly: true },
    { key: 'rights', label: '版权', type: 'text', value: tag('dc:rights'), readonly: true },
    { key: 'tool', label: '创作工具', type: 'text', value: tag('xmp:CreatorTool'), readonly: true },
    ...exifRows(),
    { type: 'note', label: '元数据目前只读（XMP 在图像资源 1060 里；写回 XMP 还没做）。' },
  ], { okOnly: true, okText: '关闭' });
  return true;
}


export let toggledBack = false;
export function toggleLastState(){
  if (toggledBack) { if (historyStep(false)) { toggledBack = false; return true; } toggledBack = false; return false; }
  if (histLog.cursor !== histLog.items.length - 1) return false;
  if (historyStep(true)) { toggledBack = true; return true; }
  return false;
}

export async function purgeHistory(what){
  const labels = { undo: '还原', clipboard: '剪贴板', histories: '历史记录', all: '全部' };
  if (!await confirmDialog(`清理「${labels[what]}」不能还原。继续吗？`, { title: '清理', okText: '确定', danger: true })) return false;
  if (what === 'clipboard' || what === 'all') set_pixelClipboard(null);
  if (what === 'undo' || what === 'histories' || what === 'all') {
    docHistory.undo.length = 0; docHistory.redo.length = 0; brushHistory.undo.length = 0; brushHistory.redo.length = 0;
    histReset('清理');
    updateUndoButtons();
  }
  $('#notice').textContent = `已清理「${labels[what]}」。`;
  return true;
}
