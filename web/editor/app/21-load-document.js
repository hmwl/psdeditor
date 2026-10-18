




import './20-snap-smart-object.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import { parseSmartObjects, parsePsdRaster, parseLayerTree, writeImageResource } from '../../../core/app.js';
import { findExifTiff } from '../../../core/exif.js';
import { decodeLayerJob, readLazyLayerRectChannels, readLazyLayerTile } from '../../../core/psd-raster.js';
import { createTileCache, lazyTileLevel } from '../../../core/render/tile-cache.js';
import { lodScale } from '../../../core/psd-lod.js';
import { DOCS } from '../documents.js';
import { recentFiles } from '../recent-files.js';
import { DOC_EXT } from '../layerb.js';
import { libMaterialize } from '../presets-panels.js';
import { shell } from '../shell.js';
import { rasterOpenLayerOptions } from '../raster-open-options.js';
import { askRasterizeProWarps, proWarpNotice } from '../pro.js';
import {
  $, ADJUST, EDIT, NEWDOC, QUADW, applyEdits, applySoEdit, engineOK, ensureLazy, freshLayerInfo,
  previewCompatibilityWarnings, renderWarp, resolveSmartObjects, showCompatibilityWarnings,
} from './01-boot.js';
import {
  CM, DOC_MODE_NAMES, applyState, cur, curStroke, doc, docH, docName, docStack, docW, emptyState, fontCache,
  globalLight, img, layerDupes, layerTree, li, meshFlipState, meshRotState, origBuffer, replImgURL, set_cur,
  set_doc, set_docH, set_docLabel, set_docName, set_docW, set_globalLight, set_globalLightBase,
  set_globalLightDirty, set_guides, set_guidesDirty, set_guidesGrid, set_hoverPt, set_img, set_lastSelection,
  set_layerTree, set_li, set_origBuffer, set_proofOn, set_replFile, set_replImg, set_replImgURL, set_selPt,
  set_soImgURL, set_soLayerIndex, set_sos, set_vpDirty, set_vpPlanesDoc, set_vpRaw, soEdits, soImgURL,
  soLayerIndex, soRepl, sos, textOverlay, textRenders,
} from './02-doc-state.js';
import {
  HXP, backend, docSnapshot, histReset, hxFresh, hxOpenLabel, set_hxFresh, set_hxOpenLabel, set_soEnterSnap,
  structuralApply, structuralBegin, structuralDone, updateUndoButtons,
} from './03-history.js';
import { syncRulers } from './04-view-chrome.js';
import { rasterizeLayerUI } from './05-layer-lock-guides.js';
import {
  docImageResources, readResolution, set_docResolution, set_docResolutionBase, set_docSizeBase,
} from './08-doc-size.js';
import { cancelCrop, cropState, set_cropArmed, set_cropStraight } from './10-crop.js';
import {
  set_docPathsKey, set_savedPaths, set_savedPathsDirty, set_workPath, set_workPathDirty,
} from './17-shape-pen.js';
import {
  bakeCurrentSO, bakeSeq, builtIndexOf, filterInputForSO, hasAnyEdits, loadSourceImage, refreshAll, set_bakeSeq,
} from './20-snap-smart-object.js';
import { applyDeformClass, matchLayer, setFitControls, settleSoEnter } from './22-deform-tools.js';
import { layerCanvasCache, renderLayerPanel, selLayers, set_selLayer, thumbCache } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import {
  chanView, ensureGpu, gpuFlush, gpuPruneDetailTiles, renderPreviewOnly, renderStaticLayers, renderWarpNow,
  scheduleRefreshView,
} from './30-render.js';
import {
  auxDrag, auxUp, captureHistorySource, historySource, set_auxDrag, set_countGroup, set_historySource,
  set_historySourceInfo, set_measureLine, set_mixerAmount, set_mixerCarry, set_toolData, set_toolDataAPI,
  set_viewAngle, toolDataAPI,
} from './31-selection-brush.js';
import { syncAnts, syncToolButtons, syncToolOptions } from './32-cursors-select-options.js';
import {
  set_docSlices, set_lastAutoHit, set_sliceDrag, set_sliceSel, set_slicesDirty,
} from './34-perspective-crop-slice.js';
import { docArtboards, set_abSel, set_abState, set_artboardCache } from './35-artboard.js';
import { endStroke } from './38-brush-engine.js';
import { closeInlineText, textOwnRaster } from './47-canvas-context-menu.js';
import { buildPsdBuffer, ensureStructuralBase, setWaitCursor } from './48-info-export.js';
import { ensureTextRaster, resolveFont } from './49-fonts-text-model.js';
import { applyTextDynamicCarry, set_textDynamicCarry } from './52-alpha-text-menu.js';
import { fireScriptEvent } from './58-scripting.js';






export async function lxStructural(label, fn){
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, label)) return false;
  if (textOverlay) closeInlineText(true);
  $('#err').textContent = '';
  const prev = structuralBegin();
  let loaded = false;
  setWaitCursor(true, '正在处理当前视图…');
  try {
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) base = (await buildPsdBuffer({ fast: true })).buf;
    base = await ensureStructuralBase(base);
    const r = await fn(base, { map: i => builtIndexOf(i), applyEdits });
    if (!r || !r.buf) return false;
    loaded = true;
    await initDocument(r.buf, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    const s2 = r.sel != null ? r.sel : -1;
    set_selLayer(Math.max(-1, Math.min(s2, doc.layers.length - 1)));
    if (r.sels) for (const i of r.sels) if (doc.layers[i]) selLayers.add(i);
    if (selLayers.size === 1) selLayers.clear();
    refreshAll(false);
    structuralDone(prev, label);
    return true;
  } catch (e) {
    if (loaded) { try { structuralApply(prev); } catch {} }
    $('#err').textContent = label + '没能完成：' + humanEditError(e && e.message || e);
    return false;
  } finally { setWaitCursor(false); }
}

export function soRenderImage(k, image, options = {}){
  const so = sos[k];
  const li2 = options.layerInfo || freshLayerInfo(so);
  if (!options.layerInfo) applySoEdit(li2, soEdits[k]);
  const res = renderWarp({ backend, image, imageKey: 'lx' + k + '#' + (set_bakeSeq(bakeSeq + 1)), layerInfo: li2,
    filterInput: !options.layerInfo && image === img ? filterInputForSO(k) : null,
    docWidth: docW, docHeight: docH, supersample: +$('#ss').value || 2, fit: { mode: 'stretch' } });
  if (!res || !res.data) return null;
  const W = res.width, H = res.height, d = res.data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return { rgba: new Uint8ClampedArray(0), bounds: { top: 0, left: 0, bottom: 0, right: 0 } };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, rgba = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) rgba.set(d.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + cw) * 4), y * cw * 4);
  return { rgba, bounds: { top: y0, left: x0, bottom: y0 + ch, right: x0 + cw } };
}

export function lxSetLayerRaster(idx, rgba, rect){
  const dl = doc && doc.layers[idx]; if (!dl) return;
  dl.rgba = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  dl.bounds = { ...rect }; dl.width = rect.right - rect.left; dl.height = rect.bottom - rect.top;
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  renderPreviewOnly();
}
export async function loadSourceImageOf(k){
  
  return loadSourceImage(sos[k], k, false);
}








const EXTRA_IMG = /\.(tiff?|tga|icb|vda|vst|pbm|pgm|ppm|pnm|pam|ico|cur|hdr|rgbe|exr|svgz?|pdf|ai|heic|heif|hif|jxl|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|raw|pef|ptx|dng|srw|x3f|3fr|fff|iiq|erf|mef|mos|mrw|kdc|dcr|rwl|gpr)$/i;
export const needsFormatOpen = f => EXTRA_IMG.test((f && f.name) || '');
export const isImageFileName = f => {
  const name = f.name || '', type = f.type || '';
  if (/\.ps[db]$/i.test(name)) return false;
  if (/\.(png|jpe?g|jfif|webp|bmp|dib|gif|avif)$/i.test(name) || EXTRA_IMG.test(name)) return true;
  return !!type.startsWith('image/') && !/photoshop/i.test(type);
};
let formatOpenP = null;
const formatOpen = () => (formatOpenP || (formatOpenP = import('../format-open.js')));
const LARGE_RASTER_PIXELS = 64e6, LARGE_RASTER_MAX_PIXELS = 16e6;
async function rasterHeaderSize(file){
  if (!/\.jpe?g$/i.test(file?.name || '') || !(file?.size > 0)) return null;
  const b = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < b.length) {
    while (o < b.length && b[o] !== 0xff) o++;
    while (o < b.length && b[o] === 0xff) o++;
    const marker = b[o++]; if (marker === 0xda || marker === 0xd9) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (o + 2 > b.length) break;
    const n = (b[o] << 8) | b[o + 1]; if (n < 2 || o + n > b.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf))
      return { width: (b[o + 5] << 8) | b[o + 6], height: (b[o + 3] << 8) | b[o + 4] };
    o += n;
  }
  return null;
}
function rasterResizeFor(size){
  if (!size || !(size.width > 0 && size.height > 0) || size.width * size.height <= LARGE_RASTER_PIXELS) return null;
  const scale = Math.sqrt(LARGE_RASTER_MAX_PIXELS / (size.width * size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}


export async function decodeImageFile(file, opts = {}){
  if (needsFormatOpen(file)) {
    const m = await formatOpen();
    const r = await m.decodeAnyImage(file, { interactive: !!opts.interactive });
    if (!r || !r.length) throw new Error('CANCELLED');
    return r[0].canvas;
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const r = opts.resize;
      return await (r ? createImageBitmap(file, { resizeWidth: r.width, resizeHeight: r.height, resizeQuality: 'high' }) : createImageBitmap(file));
    } catch {  }
  }
  return await new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('IMAGE_DECODE_FAILED')); };
    im.src = url;
  });
}





export let reuseHints = null;
export function set_reuseHints(v) { return (reuseHints = v); }   
export async function openImageAsDocument(file){
  $('#err').textContent = ''; $('#notice').textContent = '';
  docLoading++; setWaitCursor(true);
  try {
    let items;
    if (needsFormatOpen(file)) {
      try { const m = await formatOpen(); items = await m.decodeAnyImage(file, { interactive: true }); }
      catch (e) { $('#err').textContent = `打不开「${file.name}」：` + humanOpenError(e); return false; }
      if (!items || !items.length) return false;                      
    } else {
      let img = null, source = null, sourceSize = null;
      try {
        const hint = await rasterHeaderSize(file), resize = rasterResizeFor(hint);
        if (resize) {
          


          try { source = await decodeImageFile(file); } catch { source = null; }
          const cv = document.createElement('canvas'); cv.width = resize.width; cv.height = resize.height;
          const preview = source || await decodeImageFile(file, { resize });
          cv.getContext('2d').drawImage(preview, 0, 0, resize.width, resize.height); if (!source) preview.close?.();
          img = cv; sourceSize = hint;
        } else img = await decodeImageFile(file);
      }
      catch { return loadPsd(file); }                      
      items = [{ canvas: img, source, sourceFile: file, sourceSize, width: img.width, height: img.height, name: file.name }];
    }
    let ok = true;
    for (const it of items) ok = (await openRasterAsDocument(it, file)) && ok;
    if (ok) { await recentFiles.add(file); fireScriptEvent('open'); }
    const notes = items.map(it => it.note).filter(Boolean);
    if (notes.length) $('#notice').textContent = notes.join('\n');
    return ok;
  } finally { docLoading--; setWaitCursor(false); }
}
function humanOpenError(e){
  const m = String(e && e.message || e);
  if (/Failed to fetch|dynamically imported|Importing a module/i.test(m)) return '解码组件没能加载（离线？）——联网后重试';
  return m;
}
async function openRasterAsDocument(it, file){
  const img = it.canvas;
  const w = Math.max(1, Math.round(it.width || img.width)), h = Math.max(1, Math.round(it.height || img.height));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d');
  c2.drawImage(img, 0, 0, w, h);                       
  const raw = c2.getImageData(0, 0, w, h).data;
  

  if (!await ensureLazy(EDIT, '打开图片')) return false;
  const m = await NEWDOC.load();
  if (it.sourceSize && it.sourceFile) {
    const ow = it.sourceSize.width, oh = it.sourceSize.height;
    let openBuf = m.createPsd({ width: 1, height: 1, background: 'transparent', name: '图层 0' });
    const hd = new DataView(openBuf); hd.setUint32(14, oh); hd.setUint32(18, ow);
    const dtk = await DOCS.beginOpen(); if (!dtk) return false;
    try {
      docStack.length = 0; document.querySelector('.app').classList.remove('inside');
      await initDocument(openBuf, it.name || file.name, { nested: false });
      const l = doc.layers[0];
      if (!l) throw new Error('无法建立大图层');
      l.rgba = null; l.lazyImage = it.source || null; l.lazyRasterSource = true; l.lazyRasterFile = it.sourceFile;
      doc.lazyRasterFile = file;
      l.lazyPreview = { data: new Uint8ClampedArray(raw), width: w, height: h };
      l.width = ow; l.height = oh; l.bounds = { top: 0, left: 0, right: ow, bottom: oh };
      if (layerTree?.flat?.[0]) layerTree.flat[0].bounds = { ...l.bounds };
      refreshAll(true); await gpuFlush();
    } catch (e) { DOCS.abortOpen(dtk); $('#err').textContent = '大图打开失败：' + (e?.message || e); return false; }
    DOCS.endOpen(dtk); shell.status(`已打开图片 ${ow} × ${oh} 像素`); return true;
  }
  const name = it.name || file.name;
  const blank = m.createPsd({ width: w, height: h, ...rasterOpenLayerOptions(file, name), ...(it.ppi ? { resolution: it.ppi } : {}) });
  const r = applyEdits(blank, [{ op: 'replaceLayerPixels', index: 0,
    rgba: { data: new Uint8Array(raw.buffer, raw.byteOffset, raw.length), width: w, height: h },
    bounds: { top: 0, left: 0, bottom: h, right: w } }]);
  

  let openBuf = r.buffer;
  try {
    const exifBuf = file.size > 8 * 1024 * 1024 ? await file.slice(0, 2 * 1024 * 1024).arrayBuffer() : await file.arrayBuffer();
    const t = findExifTiff(new Uint8Array(exifBuf)); if (t) openBuf = writeImageResource(openBuf, 1058, t.slice());
  } catch {}
  const dtk = await DOCS.beginOpen(); if (!dtk) return false;
  try {
    docStack.length = 0;
    document.querySelector('.app').classList.remove('inside');
    await initDocument(openBuf, name, { nested: false });
    refreshAll(true);
    await gpuFlush();
  } catch (e) { DOCS.abortOpen(dtk); $('#err').textContent = '图片打开失败：' + (e && e.message || e); return false; }
  DOCS.endOpen(dtk);
  shell.status(`已打开图片 ${docW} × ${docH} 像素（${name}）`);
  return true;
}
export async function loadPsd(file){
  $('#err').textContent = ''; $('#notice').textContent = '';
  const dtk = await DOCS.beginOpen(); if (!dtk) return;      
  docLoading++;
  let opened = false;
  setWaitCursor(true);
  try {
    docStack.length = 0;
    document.querySelector('.app').classList.remove('inside');
    set_textDynamicCarry(null);               
    await initDocument(await file.arrayBuffer(), file.name, { nested: false, proWarpPrompt: true });
    if (doc) doc.sourceFile = file;
    refreshAll(true);
    await gpuFlush();
    DOCS.endOpen(dtk);
    await recentFiles.add(file);
    opened = true;
  } catch(e){
    DOCS.abortOpen(dtk);
    
    const raw = String(e && e.message || e);
    let why = '这个文件打不开。', how = '';
    if (/不是 PSD\/PSB|8BPS/.test(raw)) { why = '这不是一份 PSD / PSB 文件。'; how = '请确认扩展名与内容一致；PSD 文件开头 4 个字节应为 8BPS。'; }
    else if (/outside the bounds|越界|Unexpected end|RangeError/i.test(raw)) { why = '文件内容不完整或已损坏，读到一半就没有了。'; how = '试试在 Photoshop 里重新「存储为」一份，或换一份文件；如果是从网盘/邮件拿到的，先确认下载完整。'; }
    else if (/位\/通道|depth/i.test(raw)) { how = '在 Photoshop 里用「图像 › 模式」转成 8 位或 16 位后再打开。'; }
    else how = '如果这份文件在 Photoshop 里能正常打开，欢迎把它作为样例反馈给我们。';
    $('#err').textContent = why + (how ? ' ' + how : '') + `\n（技术细节：${raw}）`;
    if (window.__PSD_EDITOR_DEV__) console.error(e);
  } finally { docLoading--; setWaitCursor(false); }
  if (opened) { fireScriptEvent('open'); return true; }
}




export function bytesEqual(a, b){
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const n = a.byteLength >>> 2;
  if (!(a.byteOffset & 3) && !(b.byteOffset & 3) && n > 64) {
    const x = new Uint32Array(a.buffer, a.byteOffset, n), y = new Uint32Array(b.buffer, b.byteOffset, n);
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false;
    for (let i = n * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}



function carryLayerCaches(oldLayers, prev){
  const at = new Map();
  oldLayers.forEach((o, j) => { if (o && o.rgba) at.set(o.rgba, j); });
  const sameSize = prev.w === docW && prev.h === docH;
  doc.layers.forEach((l, i) => {
    if (!l || !l.rgba) return;
    const j = at.get(l.rgba); if (j == null) return;
    const o = oldLayers[j];
    if (o.width !== l.width || o.height !== l.height) return;
    if (prev.canvas[j] && !layerCanvasCache[i]) layerCanvasCache[i] = prev.canvas[j];
    if (sameSize && prev.thumb[j] && !thumbCache[i] && !l.isSmartObject && !l.isText && !o.isSmartObject && !o.isText
        && o.bounds.top === l.bounds.top && o.bounds.left === l.bounds.left) thumbCache[i] = prev.thumb[j];
  });
}
function shareUnchangedPixels(oldLayers, newLayers){
  const key = l => `${l.name}|${l.bounds.top},${l.bounds.left},${l.bounds.bottom},${l.bounds.right}`;
  const pool = new Map();
  for (const o of oldLayers) if (o && o.rgba && o.bounds) { const k = key(o); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(o); }
  for (const l of newLayers) {
    if (!l || !l.rgba || !l.bounds) continue;
    const cands = pool.get(key(l)); if (!cands) continue;
    const j = cands.findIndex(o => bytesEqual(o.rgba, l.rgba));
    if (j < 0) continue;
    const o = cands.splice(j, 1)[0];
    l.rgba = o.rgba;
    if (l.planes && o.planes) {                      
      for (const id of Object.keys(l.planes)) if (o.planes[id] && bytesEqual(o.planes[id], l.planes[id])) l.planes[id] = o.planes[id];
    }
    if (l.mask && o.mask && l.mask.gray && o.mask.gray && bytesEqual(l.mask.gray, o.mask.gray)) l.mask.gray = o.mask.gray;
  }
}




export let docLoading = 0;


const DOC_GATES = [];
export function addDocGate(load){ DOC_GATES.push(load); }

let decodePoolP = null;
let activeDecodePool = null;
const lazyDecodeJobs = new Map();
const lazyTileJobs = new WeakMap();
const lazySourceJobs = new WeakMap();
export const decodedTileCache = createTileCache({ onEvict: state => gpuPruneDetailTiles(state) });
onDocumentCacheRelease((uid, last) => {
  if(last){decodedTileCache.clear();activeDecodePool?.clearSources().catch(()=>{});}
  else decodedTileCache.releaseOwner(uid);
});
onDocumentCacheRelease((uid, last) => {
  if (!doc || (!last && doc.editorDocUID !== uid)) return;
  for (const l of doc.layers || []) {
    if (!l?.lazyRasterSource) continue;
    l.lazyImage?.close?.(); l.lazyImage = null;
    if (l.lazyImageChunks) { for (const c of l.lazyImageChunks.values()) c?.image?.close?.(); l.lazyImageChunks.clear(); }
    l.lazyImageTiles?.clear?.();
  }
});
export function decodeCacheStatus(){ return activeDecodePool ? { ...activeDecodePool.stats, tiles: decodedTileCache.stats } : null; }
function decodePoolLazy(force = false){
  const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 0;
  if (typeof Worker === 'undefined' || hc < 4 && !force) return Promise.resolve(null);
  if (!decodePoolP) decodePoolP = import('../../../core/psd-decode-worker.js')
    .then(m => m.createDecodePool(Math.max(1, Math.min(6, hc - 1))))
    .catch(e => { console.warn('[载入] 解码 Worker 起不来，主线程解', e); return null; });
  return decodePoolP.then(p => (p && !p.broken ? p : null));
}



export async function decodeLazyLayer(index){
  const l = doc && doc.layers[index];
  if (!l || !l.lazyCompressedChannels || l.rgba || !activeDecodePool) return false;
  if (lazyDecodeJobs.has(index)) return lazyDecodeJobs.get(index);
  const job = (async () => {
    const depth = doc.depth || 8, mode = doc.mode || 3;
    const mask = l.mask || {};
    const work = {
      width: l.width, height: l.height, depth, mode, psb: !!l.lazyCompressedPsb, previewMax: 0,
      maskInfo: { maskW: mask.width || l.width, maskH: mask.height || l.height, top: mask.top || 0, left: mask.left || 0,
        layerTop: l.bounds.top, layerLeft: l.bounds.left, defaultColor: mask.defaultColor, maskFlags: mask.flags || 0 },
      geo: { bounds: l.bounds, width: l.width, height: l.height, maskDensity: mask.density, maskFeather: mask.feather },
      keepPlanes: 'mask',
    };
    const chans = l.lazyCompressedChannels;
    const res = await activeDecodePool.run(work, chans);
    if (res.rgba) {
      l.rgba = res.rgba; delete l.lazyPreview; delete l.lazyCompressedChannels;
      renderLayerPanel(); renderPreviewOnly();
      return true;
    }
    return false;
  })().finally(() => lazyDecodeJobs.delete(index));
  lazyDecodeJobs.set(index, job); return job;
}
export function lazyPixelSource(layer, depth, mode){
  const pool=activeDecodePool;
  if (layer?.lazyImage || layer?.lazyRasterFile) return (x, y) => readLazyImageTile(layer, x, y);
  return (x,y)=>readLazySourceTile(layer,depth,mode,pool,x,y);
}
export async function readLazyImageTile(layer, x, y, tileSize = 256){
  const tx = Math.max(0, x | 0), ty = Math.max(0, y | 0), key = `${tx}:${ty}`;
  const cache = layer.lazyImageTiles || (layer.lazyImageTiles = new Map()), hit = cache.get(key); if (hit) return hit;
  if (!layer.lazyImage && !layer.lazyRasterFile) throw new Error('原始图片源已释放，无法读取画笔瓦片');
  const w = Math.min(tileSize, layer.width - tx), h = Math.min(tileSize, layer.height - ty); if (w <= 0 || h <= 0) return null;
  const cv = layer.lazyImageCanvas || (layer.lazyImageCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(tileSize, tileSize) : Object.assign(document.createElement('canvas'), { width: tileSize, height: tileSize }));
  if (cv.width !== tileSize || cv.height !== tileSize) { cv.width = tileSize; cv.height = tileSize; }
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.clearRect(0, 0, tileSize, tileSize);
  if (layer.lazyImage) ctx.drawImage(layer.lazyImage, tx, ty, w, h, 0, 0, w, h);
  else {
    


    const sourceSize = Math.max(tileSize, 1024), sx = Math.floor(tx / sourceSize) * sourceSize, sy = Math.floor(ty / sourceSize) * sourceSize;
    const chunks = layer.lazyImageChunks || (layer.lazyImageChunks = new Map()), ckey = `${sx}:${sy}`;
    let chunk = chunks.get(ckey);
    if (!chunk) {
      const cw = Math.min(sourceSize, layer.width - sx), ch = Math.min(sourceSize, layer.height - sy);
      chunk = { image: await createImageBitmap(layer.lazyRasterFile, sx, sy, cw, ch), x: sx, y: sy, width: cw, height: ch };
      chunks.set(ckey, chunk);
      while (chunks.size > 8) { const k = chunks.keys().next().value, old = chunks.get(k); old?.image?.close?.(); chunks.delete(k); }
    }
    ctx.drawImage(chunk.image, tx - chunk.x, ty - chunk.y, w, h, 0, 0, w, h);
  }
  const tile = { x: tx, y: ty, width: w, height: h, data: new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data) };
  cache.set(key, tile); if (cache.size > 96) cache.delete(cache.keys().next().value); return tile;
}
function readLazySourceTile(l,depth,mode,pool,x,y,tileSize=256,scale=1){
  
  
  let jobs=lazySourceJobs.get(l);if(!jobs)lazySourceJobs.set(l,jobs=new Map());
  const key=`${depth}:${mode}:${x}:${y}:${tileSize}:${scale}`;
  if(jobs.has(key))return jobs.get(key);
  const pending=readLazySourceTileNow(l,depth,mode,pool,x,y,tileSize,scale).finally(()=>jobs.delete(key));
  jobs.set(key,pending);return pending;
}
async function readLazySourceTileNow(l,depth,mode,pool,x,y,tileSize=256,scale=1){
  const [tile] = await readLazySourceTilesNow(l, depth, mode, pool, [{ x, y }], tileSize, scale);
  return tile || null;
}
async function readLazySourceTilesNow(l, depth, mode, pool, requests, tileSize = 256, scale = 1){
  const list = requests.map(t => ({ x: Math.max(0, t.x | 0), y: Math.max(0, t.y | 0) }));
  const out = new Array(list.length).fill(null), missing = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i], cached = scale === 1 && tileSize === 256 && l.lazyHighTiles?.get(`${t.x}:${t.y}`);
    if (cached) out[i] = cached; else missing.push({ ...t, i });
  }
  if (!missing.length) return out;
  if (l.lazyImage || l.lazyRasterFile) { for (const t of missing) out[t.i] = await readLazyImageTile(l, t.x, t.y, tileSize); return out; }
  if (!pool && l.lazyChannels && scale === 1) {
    for (const t of missing) out[t.i] = readLazyLayerTile(l, Math.floor(t.x / tileSize), Math.floor(t.y / tileSize), mode, tileSize);
    return out;
  }
  const chans = l.lazyCompressedChannels || (l.lazyChannels && [8, 16].includes(depth)
    ? (l.lazyWorkerChannels || (l.lazyWorkerChannels = Object.entries(l.lazyChannels).map(([id, c]) => ({ id: +id, view: c.bytes, w: l.width, h: l.height })))) : null);
  if (!chans) return out;
  const sourcePsb = l.lazyCompressedPsb ?? Object.values(l.lazyChannels || {})[0]?.psb ?? false;
  const extent=tileSize*scale;
    const shapes = missing.map(t => ({ ...t, width: Math.min(extent, l.width - t.x), height: Math.min(extent, l.height - t.y) }));
    if (shapes.some(t => t.width <= 0 || t.height <= 0)) return out;
    const cropInput = !!l.lazyChannels || chans.reduce((n, c) => n + c.view.byteLength, 0) > (pool?.limits?.sourceBudget ?? 32 * 1048576);
    const mask = l.mask || {}, work = {
      width: cropInput ? shapes[0].width : l.width, height: cropInput ? shapes[0].height : l.height, depth, mode,
      psb: !!sourcePsb, previewMax: 0, ...(!cropInput ? { zipTile: true } : {}),
      maskInfo: { maskW: mask.width || l.width, maskH: mask.height || l.height, top: mask.top || 0, left: mask.left || 0,
        layerTop: l.bounds.top, layerLeft: l.bounds.left, defaultColor: mask.defaultColor, maskFlags: mask.flags || 0 },
      geo: { bounds: l.bounds, width: l.width, height: l.height, maskDensity: mask.density, maskFeather: mask.feather },
      keepPlanes: false,
    };
    if (cropInput) {
      for (const t of shapes) {
        const roi = readLazyLayerRectChannels(l, t.x, t.y, t.width, t.height);
        const res = !pool ? await decodeLayerJob({ ...work, width: t.width, height: t.height, chans: roi.map(c => ({ ...c, bytes: c.view })) })
          : scale > 1
            ? await pool.runLod({ ...work, width: t.width, height: t.height, x: t.x, y: t.y, scale }, (dy, rows) => readLazyLayerRectChannels(l, t.x, t.y + dy, t.width, rows), { transferChannels: true })
            : await pool.run({ ...work, width: t.width, height: t.height }, readLazyLayerRectChannels(l, t.x, t.y, t.width, t.height));
        out[t.i] = res?.tile || (res?.rgba ? { x: t.x, y: t.y, width: t.width, height: t.height, data: res.rgba } : null);
      }
      return out;
    }
    const res = !pool
      ? await Promise.all(shapes.map(t => decodeLayerJob({ ...work, tile: { x: t.x, y: t.y, width: extent, height: extent, scale }, chans: chans.map(c => ({ ...c, bytes: c.view })) })))
      : await pool.runBatch(work, chans, shapes.map(t => ({ x: t.x, y: t.y, width: extent, height: extent, scale })));
    const tiles = pool ? (res?.tiles || []) : res.map(r => r?.tile);
    for (let i = 0; i < shapes.length; i++) out[shapes[i].i] = tiles[i] || null;
    return out;
}
export async function decodeLazyTiles(index, requests, tileSize = 256, { wantedOnly = false, scale = 1 } = {}){
  scale = lodScale(scale);
  const l = doc && doc.layers[index]; if (!l || (!activeDecodePool && !l.lazyImage && !l.lazyRasterFile) || !Array.isArray(requests) || !requests.length) return false;
  const sourceDoc = doc, pool = activeDecodePool, state = lazyTileLevel(l, doc.editorDocUID, scale), pending = lazyTileJobs.get(l) || new Map();
  lazyTileJobs.set(l, pending);
  const todo = [], keys = [];
  for (const r of requests) {
    const x = Math.max(0, r.x | 0), y = Math.max(0, r.y | 0), key = `${index}:${x}:${y}:${tileSize}:${scale}`;
    if (decodedTileCache.get(state, `${x}:${y}`) || pending.has(key)) continue;
    todo.push({ x, y }); keys.push(key);
  }
  if (!todo.length) return true;
  const batch = (async () => {
    const tiles = await readLazySourceTilesNow(l, sourceDoc.depth || 8, sourceDoc.mode || 3, pool, todo, tileSize, scale);
    for (let i = 0; i < todo.length; i++) {
      const tile = tiles[i]; if (!tile) continue;
      decodedTileCache.put(state, `${tile.x}:${tile.y}`, tile, { wantedOnly });
      l.lazyTileVersion = (l.lazyTileVersion || 0) + 1;
    }
    if (doc === sourceDoc) scheduleRefreshView();
    return tiles.every(Boolean);
  })();
  for (const key of keys) pending.set(key, batch.finally(() => pending.delete(key)));
  return batch;
}
export async function decodeLazyTile(index, tileX, tileY, tileSize = 256, { wantedOnly = false, scale = 1 } = {}){
  scale = lodScale(scale);
  const l = doc && doc.layers[index]; if (!l || (!activeDecodePool && !l.lazyImage && !l.lazyRasterFile)) return false;
  const sourceDoc=doc,pool=activeDecodePool;
  const x=Math.max(0,tileX|0),y=Math.max(0,tileY|0),key=`${index}:${x}:${y}:${tileSize}:${scale}`;
  const state=lazyTileLevel(l,doc.editorDocUID,scale);
  if(decodedTileCache.get(state,`${x}:${y}`))return true;
  let pending=lazyTileJobs.get(l);if(!pending)lazyTileJobs.set(l,pending=new Map());if(pending.has(key))return pending.get(key);
  const job=(async()=>{
    const tile=await readLazySourceTile(l,sourceDoc.depth||8,sourceDoc.mode||3,pool,x,y,tileSize,scale);
    if(!tile)return false;
    decodedTileCache.put(state, `${tile.x}:${tile.y}`, tile, { wantedOnly });
    l.lazyTileVersion = (l.lazyTileVersion || 0) + 1;
    if (doc === sourceDoc) scheduleRefreshView();
    return true;
  })().finally(() => pending.delete(key));
  pending.set(key, job); return job;
}
export async function initDocument(buf, label, opts = {}){
  docLoading++;
  try {
    

    const gpuReady = ensureGpu();
    if (DOC_GATES.length) await Promise.all(DOC_GATES.map(f => Promise.resolve().then(f).catch(e => console.warn('[载入] 文档相关代码包没到位', e))));
    const r = await initDocumentBody(buf, label, opts);
    


    const pixels = (docW || 0) * (docH || 0);
    const waitMs = pixels > 64e6 ? 30000 : 3000;
    const loadingText = document.getElementById('docLoadingText');
    if (loadingText && pixels > 64e6) loadingText.textContent = '正在建立大画布 GPU 分块缓存…';
    if (gpuReady) await Promise.race([gpuReady, new Promise(res => setTimeout(res, waitMs))]).catch(() => {});
    return r;
  }
  finally { docLoading--; }
}
async function initDocumentBody(buf, label, opts = {}){
  QUADW.load().catch(() => {});      
  histReset('打开');                     
  if (cropState) cancelCrop();           
  set_cropArmed(false); set_cropStraight(null);
  chanView.single = null; chanView.off.clear();   
  
  if (soImgURL) { URL.revokeObjectURL(soImgURL); set_soImgURL(null); }
  if (replImgURL) { URL.revokeObjectURL(replImgURL); set_replImgURL(null); }
  const prevLayers = doc && doc.layers ? doc.layers : null;   
  


  const prevLazyRaster = prevLayers && prevLayers.find(l => l?.lazyRasterSource) || null;
  const prevLazyRasterIndex = prevLazyRaster ? prevLayers.indexOf(prevLazyRaster) : -1;
  const prevLazyRasterFile = prevLazyRaster?.lazyRasterFile || doc?.lazyRasterFile || null;
  const prevLazyRasterImage = prevLazyRaster?.lazyImage || null;
  const prevLazyRasterPreview = prevLazyRaster?.lazyPreview || null;
  const prevHistSrc = historySource;                            
  const prevCaches = prevLayers ? { canvas: layerCanvasCache, thumb: thumbCache, w: docW, h: docH } : null;   
  applyState(emptyState());
  histReset(hxOpenLabel || '打开');      
  try { buf = await CM.prepareDocument(buf); } catch (e) { console.warn('色彩管理：文档准备失败', e); }   
  set_origBuffer(buf);                    
  set_sos(parseSmartObjects(buf));
  try { await resolveSmartObjects(buf, sos); }
  catch (e) { $('#err').textContent = '智能对象解析失败（服务端）：' + e.message; }
  



  
  const reusePool = new Map();
  if (prevLayers) for (const l of prevLayers) if (l && l.rasterSig && l.rgba && !reusePool.has(l.rasterSig)) reusePool.set(l.rasterSig, l.rgba);
  
  if (prevLayers && reuseHints) for (const [k, v] of reuseHints) if (!reusePool.has(k)) reusePool.set(k, v);
  reuseHints = null;
  const bufBytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const bufView = new DataView(bufBytes.buffer, bufBytes.byteOffset, bufBytes.byteLength);
  const psdW = bufView.getUint32(18), psdH = bufView.getUint32(14);
  


  const largePixels = psdW * psdH > 64e6;
  const decodePool = largePixels || (buf.byteLength || 0) > 24 * 1048576 ? await decodePoolLazy(largePixels) : null;
  activeDecodePool = decodePool;
  set_doc(await parsePsdRaster(buf, { lazyTiles: psdW * psdH > 64e6, keepPlanes: 'mask', keepNativePlanes: bufView.getUint16(22) > 8 || bufView.getUint16(24) === 4, decodePool, reuse: reusePool.size ? sig => { const v = reusePool.get(sig); if (v) reusePool.delete(sig); return v || null; } : null }));
  doc.editorDocUID = DOCS.openingUid();
  if (prevLazyRaster && (prevLazyRasterFile || prevLazyRasterImage) && doc.layers.length) {
    
    let target = doc.layers[prevLazyRasterIndex];
    if (!target || target.name !== prevLazyRaster.name) target = doc.layers.find(l => l && l.name === prevLazyRaster.name) || null;
    if (target) {
      target.rgba = null; target.lazyImage = prevLazyRasterImage; target.lazyRasterSource = true;
      target.lazyRasterFile = prevLazyRasterFile || null; target.lazyPreview = prevLazyRasterPreview;
      target.lazyImageTiles = prevLazyRaster.lazyImageTiles || new Map(); target.lazyImageChunks = prevLazyRaster.lazyImageChunks || new Map();
      target.lazyImageCanvas = prevLazyRaster.lazyImageCanvas || null;
      target.width = prevLazyRaster.width; target.height = prevLazyRaster.height;
      target.bounds = { ...prevLazyRaster.bounds };
      if (prevLazyRasterFile) doc.lazyRasterFile = prevLazyRasterFile;
    }
  }
  if (prevLayers) try { shareUnchangedPixels(prevLayers, doc.layers); } catch (e) { console.warn('[载入] 像素共用失败', e); }
  try { libMaterialize(doc); } catch {}   
  

  if (!doc.layers.length) { try { const flat = CM.flatBackdrop(buf); if (flat) doc.layers.push(flat); } catch (e) { console.warn(e); } }
  set_docName(label);
  set_docW(doc.width); set_docH(doc.height);
  if (prevCaches) try { carryLayerCaches(prevLayers, prevCaches); } catch (e) { console.warn('[载入] 缓存沿用失败', e); }
  set_docLabel(`${label} · ${docW}×${docH} · ${doc.depth} 位 ${DOC_MODE_NAMES[doc.mode] || 'RGB'}`);
  showCompatibilityWarnings(previewCompatibilityWarnings(doc));
  if (doc.depth === 32) shell.status('32 位/通道文档：按「视图 › 32 位预览选项」色调映射显示；改过像素的图层按显示值反解回线性浮点写回（近似：超过 1.0 的高光会截到 1.0，没改过的图层原样保留）');
  if (!opts.nested) {
    $('#modeSel').value = doc.mode === 4 ? 'cmyk' : 'rgb';    
    set_proofOn(false);                                          
  }
  

  set_docSizeBase({ w: docW, h: docH }); set_docResolution(set_docResolutionBase(readResolution(origBuffer)));
  set_layerTree(parseLayerTree(origBuffer));
  

  const lazyTreeIndex = doc.layers.findIndex(l => l?.lazyRasterSource);
  if (lazyTreeIndex >= 0 && layerTree?.flat?.[lazyTreeIndex]) {
    const l = doc.layers[lazyTreeIndex];
    layerTree.flat[lazyTreeIndex].width = l.width; layerTree.flat[lazyTreeIndex].height = l.height;
    layerTree.flat[lazyTreeIndex].bounds = { ...l.bounds };
  }
  


  
  setTimeout(async () => { let any = false; for (const L of ((layerTree && layerTree.flat) || [])) if (L.text && L.text.font && !fontCache[L.text.font]) { await resolveFont(L.text.font); any = true; } if (any) renderLayerPanel(); }, 0);
  



  setTimeout(async () => {
    const d0 = doc;
    for (const L of ((layerTree && layerTree.flat) || [])) {
      if (!L || !L.text || L.text.content == null) continue;
      if (textOwnRaster(L.index) || textRenders[L.index]) continue;
      try { await ensureTextRaster(L.index); } catch {  }
      if (doc !== d0) return;                       
    }
  }, 0);
  set_cur(-1); set_selLayer(-1);
  selLayers.clear();
  layerDupes.length = 0;           
  
  set_workPath(null); set_workPathDirty(false);      
  set_savedPaths([]); set_savedPathsDirty(false); set_docPathsKey(null);   
  set_guides([]); set_guidesDirty(false); set_guidesGrid({ h: 0, v: 0 });
  set_vpRaw(null); set_vpPlanesDoc(null); set_vpDirty(false);
  set_toolDataAPI(await import('../../../core/tool-metadata.js'));
  try { set_toolData(toolDataAPI.readToolMetadata(origBuffer)); }
  catch { set_toolData(null); $('#notice').textContent = '取样、计数或注释数据无法可靠载入；保留文件原始数据。'; }
  set_historySource(new Map()); set_historySourceInfo(null); set_mixerCarry(null); set_mixerAmount(0); set_measureLine(null); set_viewAngle(0); set_auxDrag(null); set_countGroup(0);
  set_docSlices(null); set_slicesDirty(false); set_sliceSel(-1); set_sliceDrag(null); set_lastAutoHit(null);   
  set_artboardCache({ buf: null, list: [] }); set_abSel(-1); set_abState(null);                          
  try { docArtboards(); } catch {  }                              
  set_lastSelection(null);                       
  for (const x of DOC_EXT) { try { x.load && x.load(origBuffer); } catch (e) { console.warn('[' + x.key + '] 载入失败', e); } }   
  set_globalLight({ angle: 120, altitude: 30 }); set_globalLightBase({ ...globalLight }); set_globalLightDirty(false);
  let targetLayer = null;
  try {
    const list = docImageResources(origBuffer);
    const r1032 = list.find(r => r.id === 1032);
    { const rv = list.find(r => r.id === 4090); if (rv && rv._raw) set_vpRaw(Uint8Array.from(rv._raw)); }
    if (r1032 && r1032.data && Array.isArray(r1032.data.guides)) {
      set_guidesGrid({ h: r1032.data.gridHorizontal || 0, v: r1032.data.gridVertical || 0 });
      set_guides(r1032.data.guides.map(g => ({ vertical: !!g.vertical, px: g.locationPx != null ? g.locationPx : g.location / 32 })));
    }
    

    const r1050 = list.find(r => r.id === 1050);
    if (r1050 && r1050.data) {
      const d = r1050.data;
      set_docSlices(d.version === 6 && Array.isArray(d.slices)
        ? { version: 6, bounds: d.bounds || { top: 0, left: 0, bottom: docH, right: docW },
            groupName: d.groupName || '', __noNul: d.__noNul || {},
            slices: d.slices.filter(x => x && x.bounds), _extra: d._extra || null, readOnly: false }
        : { ...d, slices: [], readOnly: true });
    }
    const r1024 = list.find(r => r.id === 1024);      
    if (r1024 && r1024.data && Number.isInteger(r1024.data.targetLayer)) targetLayer = r1024.data.targetLayer;
    


    const r1037 = list.find(r => r.id === 1037), r1049 = list.find(r => r.id === 1049);
    set_globalLight({
      angle: r1037 && r1037.data && Number.isFinite(r1037.data.globalAngle) ? r1037.data.globalAngle : 120,
      altitude: r1049 && r1049.data && Number.isFinite(r1049.data.globalAltitude) ? r1049.data.globalAltitude : 30,
    });
    set_globalLightBase({ ...globalLight });
  } catch {  }
  

  set_selLayer(defaultTargetLayer(targetLayer));
  applyTextDynamicCarry();                
  captureHistorySource(true, prevHistSrc);
  syncToolButtons(); syncAnts();     
  syncRulers();
  



  EDIT.prefetch();
  ADJUST.prefetch();
  if (opts.proWarpPrompt) await promptRasterizeProWarps();
  if (hxFresh) { set_hxFresh(false); set_hxOpenLabel(null); setTimeout(() => { if (HXP) HXP.opened(); }, 0); }   
}

async function promptRasterizeProWarps(){
  if (!doc || !sos.length) return false;
  const items = [];
  for (const so of sos) {
    const kinds = so && so.info && so.info.layerInfo && so.info.layerInfo.proWarp;
    if (!Array.isArray(kinds) || !kinds.length) continue;
    const index = matchLayer(so);
    const L = layerTree && layerTree.flat && layerTree.flat[index];
    if (index < 0 || !L || !L.isSmartObject) continue;
    items.push({ index, name: L.unicodeName || L.name || so.layerName, kinds });
  }
  if (!items.length) return false;
  if (!await askRasterizeProWarps(items)) {
    shell.status('已保留 Pro 版变形图层；该功能需联系作者开启。');
    return false;
  }
  for (const it of items) {
    try { await rasterizeLayerUI(it.index, { silent: true }); }
    catch (e) { console.warn('[Pro 变形] 栅格化失败', e); }
  }
  return true;
}

export function defaultTargetLayer(pref){
  if (!doc || !doc.layers.length) return -1;
  const ok = i => { const L = layerTree && layerTree.flat && layerTree.flat[i]; return !!doc.layers[i] && !(L && L.groupType === 3); };
  if (Number.isInteger(pref) && pref >= 0 && pref < doc.layers.length && ok(pref)) return pref;
  for (let i = doc.layers.length - 1; i >= 0; i--) if (ok(i)) return i;
  return -1;
}
export function buildTabs(){
  
  
  document.getElementById('tabs')?.remove();
  DOCS.refreshTabs();
}


let soLeaveResolve = null;
export function confirmLeaveSO(){
  const dlg = $('#soLeaveDlg');
  if (soLeaveResolve) return Promise.resolve('stay');
  $('#soLeaveMsg').textContent = `正在编辑「${(sos[cur] && sos[cur].layerName) || ''}」的变形，切换图层会退出变形编辑。当前调整如何处理？\n（丢弃 = 撤销本次变形 · 留在变形 = 不切换 · 保留并切换 = 保留调整，之后仍可导出）`;
  return new Promise(res => { soLeaveResolve = res; dlg.showModal(); });
}
{
  const dlg = $('#soLeaveDlg');
  const done = v => { if (soLeaveResolve) { const r = soLeaveResolve; soLeaveResolve = null; dlg.close(); r(v); } };
  $('#soLeaveCommit').onclick = () => done('commit');    
  $('#soLeaveDiscard').onclick = () => done('discard');  
  $('#soLeaveStay').onclick = () => done('stay');        
  dlg.addEventListener('cancel', () => done('stay'));    
  dlg.addEventListener('close', () => done('stay'));     
}
export function discardSoAdjustments(){
  delete soEdits[cur]; delete meshRotState[cur]; delete meshFlipState[cur];
}

export async function selectSO(i){
  if (!engineOK) { $('#err').textContent = '渲染引擎未加载：变形 / 换图不可用（图层 / 文字编辑不受影响）。请确认服务已启动并完成构建。'; return; }
  if (li && i !== cur && soEdits[cur]) {
    const v = await confirmLeaveSO();
    if (v === 'stay') { buildTabs(); return; }
    if (v === 'discard') discardSoAdjustments();
  }
  






  return doSelectSO(i);
}
export async function doSelectSO(i){
  const proKinds = sos[i] && sos[i].info && sos[i].info.layerInfo && sos[i].info.layerInfo.proWarp;
  if (Array.isArray(proKinds) && proKinds.length) {
    await proWarpNotice(proKinds[0]);
    $('#err').textContent = '该图层包含 Pro 版变形：请先栅格化对应图层，或联系作者。';
    return;
  }
  if (li && cur >= 0 && cur !== i) { await bakeCurrentSO(); settleSoEnter(); }   
  set_cur(i); buildTabs(); set_selPt(-1); set_hoverPt(-1);
  if (layerTree) renderLayerPanel();
  const so = sos[i];
  try { set_li(freshLayerInfo(so)); } catch (e) { $('#err').textContent = e.message; set_li(null); return; }
  const ed = soEdits[i];
  applySoEdit(li, ed);
  li.sliceX = li.sliceX || []; li.sliceY = li.sliceY || [];
  if (!li.deform && (!li.points || li.points.length !== li.xn*li.yn)){ $('#err').textContent = '该智能对象包含不支持的变形数据；请先在 Photoshop 中栅格化对应图层。'; return; }
  $('#err').textContent = '';
  
  applyDeformClass();
  
  const rp = soRepl[i];
  set_replImg(rp ? rp.img : null); set_replFile(rp ? rp.file : null); set_replImgURL(null);
  if (rp && rp.fit) setFitControls(rp.fit);
  else if ($('#fitMode').value !== 'stretch') setFitControls({ mode: 'stretch', alignX: .5, alignY: .5, scale: 1 });
  if (soImgURL) { URL.revokeObjectURL(soImgURL); set_soImgURL(null); }        
  set_img(await loadSourceImage(so));
  
  set_soEnterSnap({ k: i, snap: docSnapshot(), edits: soEdits[i] ? JSON.stringify(soEdits[i]) : null });
  
  set_soLayerIndex(matchLayer(so));
  if (soLayerIndex < 0) $('#err').textContent = `警告：栅格图层里找不到「${so.layerName}」对应图层，导出 PSD 时将只写回 warp 描述符、不更新缓存栅格。`;
  if (auxDrag) auxUp(true);
  if (curStroke) endStroke();                 
  $('.optbar').classList.remove('preview');   
  $('.app').classList.remove('preview');      
  syncToolOptions(); syncAnts();
  renderStaticLayers();
  renderWarpNow();
  updateUndoButtons();
}
