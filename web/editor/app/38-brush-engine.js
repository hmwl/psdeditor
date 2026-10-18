




import './37-local-pixel-tools.js';   
import { createSparsePixels, sparseCoverage } from '../../../core/sparse-pixels.js';
import { lazyTileState } from '../../../core/render/tile-cache.js';
import { onDocumentCacheRelease } from '../document-cache.js';
import { compositeAll, regionizeDoc, patternToRGBA } from '../../../core/app.js';
import {
  compositePaint, hash01, makeTip, sampleTip, dabDynamics, symmetryMaps, tipForDiameter, normalizeDynamics,
  textureLum, textureAt, textureCombine, dualCombine, stampMask,
} from '../../../core/brush-engine.js';
import { recomposeLayerRGBA } from '../../../core/psd-raster.js';
import { growNativePlanes } from '../../../core/native-pixel-edit.js';
import { brushLib } from '../brushes-panel.js';
import { colorPanel as colorPanelUI } from '../color-panel.js';
import { presets } from '../presets-panels.js';
import { psPanels } from '../ps-panels.js';
import { tools } from '../tools.js';
import { $, selectionToMaskGray } from './01-boot.js';
import {
  CHP, CM, brushHistory, curStroke, doc, docH, docW, layerDeletes, layerTransforms, layerTree, li, maskPaint,
  pixelPaint, proofOn, selection, set_curStroke, set_selPathCache, set_selection, soBaked, soLayerIndex,
  textRenders,
} from './02-doc-state.js';
import { actRecord, histCap, histLog, histPush, syncHistoryPanel, updateUndoButtons } from './03-history.js';
import { RASTER_KIND, isBackgroundLayer, rasterKindOf } from './05-layer-lock-guides.js';
import { PAINT_WARP_WHY, paintMap, srcBoxOfDocRect } from './11-paint-common.js';
import { qmask, qmaskRefresh } from './13-quickmask-apply-image.js';
import { shapeOpts } from './17-shape-pen.js';
import { lazyPixelSource } from './21-load-document.js';
import {
  layerCanvasCache, layerCanvasCacheRaw, maskThumbCache, renderLayerPanel, selLayer, thumbCache,
} from './23-layers-panel.js';
import {
  commitLayerOps, dropLayerOp, effLock, humanEditError, maskStructOp, opField, opLabel, putLayerOp, renderProps,
} from './24-layer-ops-queue.js';
import { transformChanged } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import {
  chanView, cmDisplay, composeDocForOrder, gpuActive, gpuForgetLayer, gpuFrame, gpuInvalidateData,
  gpuPruneDetailTiles, gpuRekey, gpuRepaintLayer, gpuSparseChanged, presentCanvas, previewCompositeDoc,
  renderLargeViewportFallback, renderPreviewOnly, scratchCtx,
} from './30-render.js';
import {
  PAINT_TOOLS, bgRGB, brush, docTool, fgRGB, grayOf, hexOf, mixerOpts, set_mixerAmount, set_mixerCarry,
  set_mixerReservoir, symmetryOn, tileMean, toolModes,
} from './31-selection-brush.js';
import { syncAnts, syncGizmoCursor } from './32-cursors-select-options.js';
import { BRUSHOP_TOOLS, beginBrushOpStroke } from './37-local-pixel-tools.js';
import { beginEraserStroke, beginPencilStroke, endPaintGesture, paintGest, stylusState } from './39-brush-options.js';
import { syncBrushPanel } from './40-options-bar-wiring.js';
import { drawGizmo } from './46-smart-filter-panel.js';
import { alphaPaintBuffer, alphaWriteWhy, markAlphaPainted } from './52-alpha-text-menu.js';





const RASTER_HINT = {
  adjustment: '调整 / 填充图层自己没有像素：Photoshop 画的是它的蒙版 —— 已把画笔的「作用于」切到蒙版',
  shape: '这是形状 / 矢量图层：Photoshop 会先问「是否栅格化图层」。栅格化本编辑器还没做 —— '
       + '可以用形状工具的「像素」模式直接画像素，或另建一个像素图层',
};

export function autoTargetMask(){
  const L = layerTree && layerTree.flat && layerTree.flat[selLayer];
  if (!L || !L.adjustment) return false;
  

  if (rasterKindOf(selLayer)) return false;
  

  const sel = $('#brTarget');
  if (!sel || sel.value === 'mask') return false;
  sel.value = 'mask';
  syncBrushPanel();
  return true;
}
export function paintGuard(){
  if (!doc) return '先打开一个 PSD';
  if (li) return '正在变形编辑中：先退出变形（Esc）再用画笔';
  if (selLayer < 0) return '先在图层面板里选中一个图层';
  const idx = selLayer;
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  const dl = doc.layers[idx];
  if (!L || !dl) return '选中的图层读不到';
  if (L.groupType === 3) return '分组结束分隔记录不能涂';
  if (L.isGroup) return '图层组本身没有像素，请选中组里的某一层';
  if (layerDeletes.has(idx)) return '这个图层已排队删除：先在图层面板恢复它';
  const target = brushTarget();
  if (target === 'mask') {
    const mp = maskPaint[idx];
    if (!mp && !dl.mask) return '';          
    if (!mp && dl.mask && !isU8(dl.mask.gray)) return `这份文档是 ${doc.depth} 位/通道，蒙版是 16 位样本，暂时只支持涂 8 位蒙版`;
    if (!mp && dl.mask && !(L.mask)) return '这个图层只有真实蒙版(-3)、没有用户蒙版(-2)，暂不支持直接涂';
    const struct = maskStructOp(idx);
    if (struct && (struct.op === 'deleteLayerMask' || struct.op === 'applyLayerMask'))
      return `已排队「${opLabel(struct)}」：先点一次撤销它再涂蒙版`;
    return '';
  }
  



  

  if (L.adjustment && !(L.vectorMask || dl.vectorMask) && L.adjustment.kind !== 'fill') return RASTER_HINT.adjustment;
  { const rk = rasterKindOf(idx);
    if (rk) return `这是${RASTER_KIND[rk]}图层：落笔时会先问一句「是否栅格化图层」（PS 同），答应了就地栅格化再画`; }
  if (effLock(idx, L, 'lockAll', 'all')) return '这个图层「全部锁定」：点图层面板上那把锁解开';
  if (effLock(idx, L, 'lockComposite', 'composite')) return '这个图层「锁定图像像素」：点图层面板「锁定」那一排的 ✎ 解开';
  if (doc.depth !== 8 && doc.depth !== 16 && doc.depth !== 32) return `本文档是 ${doc.depth} 位/通道，改图层像素只支持 8 / 16 / 32 位`;
  if (!(dl.width > 0 && dl.height > 0) || !dl.rgba) {
    



    
  }
  if (textRenders[idx]) return '这一层的像素已经被文字重绘接管：撤销文字修改后再画';
  for (const k in soBaked) if (soBaked[k] && soBaked[k].layerIdx === idx) return '这一层的像素来自智能对象烘焙：请在智能对象内部编辑';
  return '';
}
export const isU8 = a => a instanceof Uint8Array || a instanceof Uint8ClampedArray;




export const brushTarget = () => {
  const v = ($('#brTarget') && $('#brTarget').value) || 'pixels';
  
  if (doc && selLayer >= 0) { const L = layerTree && layerTree.flat && layerTree.flat[selLayer]; if (L && L.adjustment && !rasterKindOf(selLayer)) return 'mask'; }
  if (v !== 'mask' || !doc || selLayer < 0) return v;
  const dl = doc.layers[selLayer]; if (!dl) return v;
  if (maskPaint[selLayer] || dl.mask) return 'mask';
  return 'pixels';
};






export function ensureMaskPaint(idx, opts = {}){
  if (maskPaint[idx]) return maskPaint[idx];
  const dl = doc && doc.layers[idx];
  if (!dl) return null;
  const m = dl.mask;
  if (m && isU8(m.gray)) {
    const docLeft = m.relative ? dl.bounds.left + m.left : m.left;
    const docTop = m.relative ? dl.bounds.top + m.top : m.top;
    const compact = docW * docH > 64e6 && m.width === 1 && m.height === 1 && m.gray.length === 1
      && (m.defaultColor == null || m.gray[0] === m.defaultColor);
    if (compact && opts.point && Number.isFinite(opts.point.x) && Number.isFinite(opts.point.y)) {
      const W = Math.min(docW, 2048), H = Math.min(docH, 2048);
      const L = Math.max(0, Math.min(docW - W, Math.floor(opts.point.x - W / 2)));
      const T = Math.max(0, Math.min(docH - H, Math.floor(opts.point.y - H / 2)));
      const def = m.defaultColor == null ? m.gray[0] : m.defaultColor;
      const gray = new Uint8Array(W * H).fill(def), orig = new Uint8Array(W * H).fill(def);
      const sx = m.left - L, sy = m.top - T;
      if (sx >= 0 && sy >= 0 && sx < W && sy < H) gray[sy * W + sx] = orig[sy * W + sx] = m.gray[0];
      return (maskPaint[idx] = { mode: 'existing', compact: true, gray, orig,
        w: W, h: H, left: L, top: T, docLeft: L, docTop: T, defaultColor: def });
    }
    const orig = Uint8Array.from(m.gray);
    return (maskPaint[idx] = { mode: 'existing', gray: Uint8Array.from(m.gray), orig,
                               w: m.width, h: m.height, left: m.left, top: m.top, docLeft, docTop,
                               defaultColor: m.defaultColor == null ? 255 : m.defaultColor });
  }
  if (!opts.create) return null;
  
  const empty = !(dl.width > 0 && dl.height > 0);
  if (empty && !(docW > 0 && docH > 0)) return null;
  const compact = docW * docH > 64e6 && opts.point && Number.isFinite(opts.point.x) && Number.isFinite(opts.point.y);
  const W = compact ? Math.min(docW, 2048) : empty ? docW : dl.width;
  const H = compact ? Math.min(docH, 2048) : empty ? docH : dl.height;
  const L0 = compact ? Math.max(0, Math.min(docW - W, Math.floor(opts.point.x - W / 2))) : empty ? 0 : dl.bounds.left;
  const T0 = compact ? Math.max(0, Math.min(docH - H, Math.floor(opts.point.y - H / 2))) : empty ? 0 : dl.bounds.top;
  const n = W * H;
  const gray = opts.gray ? Uint8Array.from(opts.gray) : new Uint8Array(n).fill(opts.fill != null ? opts.fill : 255);
  if (gray.length !== n) return null;
  const def = opts.fill != null ? opts.fill : 255;
  return (maskPaint[idx] = { mode: 'new', compact, gray, orig: new Uint8Array(n).fill(def),
                             w: W, h: H, left: L0, top: T0, docLeft: L0, docTop: T0, defaultColor: def });
}
const sparseOwners=new Set();let sparseTail=Promise.resolve(),sparsePending=0;
function registerSparse(pp,root){
  const roots=new Map();for(const e of sparseOwners){const r=e.root?.deref();if(r)roots.set(r,(roots.get(r)||0)+1);}
  for(const e of sparseOwners)if(!e.model.deref()){const r=e.root?.deref();if(!r||(roots.get(r)||0)>1){sparseOwners.delete(e);if(r)roots.set(r,roots.get(r)-1);}}
  sparseOwners.add({uid:pp.ownerID,model:new WeakRef(pp.sparse),root:root?new WeakRef(root):null});
}
onDocumentCacheRelease((uid,last)=>{for(const e of sparseOwners)if(last||e.uid===uid){e.model.deref()?.clear();const root=e.root?.deref();if(root){if(root.edits){root.edits.tiles.clear();root.edits.version++;}gpuPruneDetailTiles(root);}sparseOwners.delete(e);}});
export const sparsePaintBusy=()=>sparsePending>0;
export function flushSparsePaint(){if(curStroke?.sparse)return endStroke();return sparseTail;}
export function forkPixelPaint(pp){
  if(!pp?.sparse)return pp;
  const copy={...pp,sparse:pp.sparse.fork()};registerSparse(copy,pp.root);return copy;
}
export function ensurePixelPaint(idx,{sparse:allowSparse=false}={}){
  if(pixelPaint[idx]?.sparse)return allowSparse?pixelPaint[idx]:null;
  if (pixelPaint[idx]) {
    
    const p0 = pixelPaint[idx];
    if (doc.layers[idx] && doc.layers[idx].rgba !== p0.rgba) {
      p0.rgba.set(doc.layers[idx].rgba); doc.layers[idx].rgba = p0.rgba;
      delete layerCanvasCache[idx]; delete thumbCache[idx];
    }
    return p0;
  }
  const dl = doc && doc.layers[idx];
  if (!dl) return null;
  const emptyNew = !dl.rgba && !dl.mask && !dl.vectorMask && dl.width === 0 && dl.height === 0
    && !dl.bounds.top && !dl.bounds.left && !dl.bounds.bottom && !dl.bounds.right;
  if(allowSparse&&emptyNew&&doc.depth===8&&doc.mode===3&&doc.width>0&&doc.height>0){
    dl.width = doc.width; dl.height = doc.height;
    dl.bounds = { top: 0, left: 0, bottom: doc.height, right: doc.width };
    const sparse=createSparsePixels({width:doc.width,height:doc.height,readTile:(x,y,w,h)=>({x,y,width:w,height:h,data:new Uint8ClampedArray(w*h*4)})}),root=lazyTileState(dl,doc.editorDocUID);
    root.edits=sparse.descriptor;
    const pp={sparse,root,w:doc.width,h:doc.height,left:0,top:0,clean:true,emptySource:true,ownerID:doc.editorDocUID};
    

    dl.lazyPreview={data:new Uint8ClampedArray(4),width:1,height:1};
    registerSparse(pp,root);return(pixelPaint[idx]=pp);
  }
  if(allowSparse&&!dl.rgba&&(dl.lazyChannels||dl.lazyCompressedChannels||dl.lazyImage)&&doc.depth===8&&doc.mode===3&&!dl.mask&&!dl.vectorMask&&!dl.effects&&!dl.fill&&!transformChanged(idx)){
    const sparse=createSparsePixels({width:dl.width,height:dl.height,readTile:lazyPixelSource(dl,doc.depth,doc.mode)}),root=lazyTileState(dl,doc.editorDocUID);
    root.edits=sparse.descriptor;
    const pp={sparse,root,w:dl.width,h:dl.height,left:dl.bounds.left,top:dl.bounds.top,clean:true,ownerID:doc.editorDocUID};
    registerSparse(pp,root);return(pixelPaint[idx]=pp);
  }
  if (!dl.rgba || !(dl.width > 0 && dl.height > 0)) {
    
    
    if (!emptyNew || !doc.width || !doc.height) return null;
    
    
    if(doc.width*doc.height>64e6)return null;
    



    const tfUntouched = !transformChanged(idx);
    dl.rgba = new Uint8ClampedArray(doc.width * doc.height * 4);
    dl.width = doc.width; dl.height = doc.height;
    dl.bounds = { top: 0, left: 0, bottom: doc.height, right: doc.width };
    if (tfUntouched) delete layerTransforms[idx];
  }
  
  const pp = { rgba: new Uint8ClampedArray(dl.rgba), orig: dl.rgba,
               w: dl.width, h: dl.height, left: dl.bounds.left, top: dl.bounds.top };
  if ((doc.mode===4 || doc.depth > 8 && (doc.mode === 3 || doc.mode === 1)) && dl.nativePlanes?.[0]) pp.nativeSource = dl.nativePlanes;
  const moved = gpuRekey(dl.rgba, pp.rgba);           
  dl.rgba = pp.rgba;                                  
  if (moved) delete layerCanvasCacheRaw[idx]; else delete layerCanvasCache[idx];   
  delete thumbCache[idx];
  return (pixelPaint[idx] = pp);
}



export function growPixelPaintToCanvas(idx, pp){
  if(pp?.sparse)return false;
  const dl = doc && doc.layers[idx];
  if (!dl || !pp || !docW || !docH || transformChanged(idx) || rasterKindOf(idx)) return false;
  if (dl.mask && dl.mask.relative) return false;
  const L = Math.min(pp.left, 0), T = Math.min(pp.top, 0), R = Math.max(pp.left + pp.w, docW), B = Math.max(pp.top + pp.h, docH);
  if (L === pp.left && T === pp.top && R === pp.left + pp.w && B === pp.top + pp.h) return false;
  const W = R - L, H = B - T, ox = pp.left - L, oy = pp.top - T;
  if (W * H > 64e6) return false;                              
  const grow = src => { const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < pp.h; y++) out.set(src.subarray(y * pp.w * 4, (y + 1) * pp.w * 4), ((y + oy) * W + ox) * 4);
    return out; };
  const rgba = grow(pp.rgba), orig = grow(pp.orig);
  const nativeSource = pp.nativeSource ? growNativePlanes(pp.nativeSource,pp.w,pp.h,W,H,ox,oy) : null;
  for (const st of [brushHistory.undo, brushHistory.redo]) for (const e of st)
    if (e && e.kind === 'pixels' && e.idx === idx && e.rect) e.rect = { ...e.rect, x: e.rect.x + ox, y: e.rect.y + oy };
  Object.assign(pp, { rgba, orig, w: W, h: H, left: L, top: T });
  if (nativeSource) pp.nativeSource = nativeSource;
  dl.rgba = rgba; dl.width = W; dl.height = H; dl.bounds = { top: T, left: L, bottom: B, right: R };
  delete layerTransforms[idx]; delete layerCanvasCache[idx]; delete thumbCache[idx];
  return true;
}
function dropMaskPaint(idx){ delete maskPaint[idx]; }

export function maskAdded(idx){
  const mp = maskPaint[idx], dl = doc && doc.layers[idx];
  if (mp && dl && dl.rgba) {
    const rgba = recomposeLayerRGBA(dl, doc.mode, maskOverrideOf(idx, mp));
    if (rgba) { dl.rgba = rgba; if (pixelPaint[idx]) pixelPaint[idx].rgba = rgba; }
  }
  delete maskThumbCache[idx]; delete layerCanvasCache[idx]; delete thumbCache[idx];
  const t = $('#brTarget'); if (t) t.value = 'mask';
  syncBrushPanel(); renderLayerPanel(); renderProps(); renderPreviewOnly(); updateUndoButtons();
}


export function cutRect(buf, w, r, px){
  const out = new (buf.constructor === Uint8ClampedArray ? Uint8ClampedArray : Uint8Array)(r.w * r.h * px);
  for (let y = 0; y < r.h; y++) out.set(buf.subarray(((r.y + y) * w + r.x) * px, ((r.y + y) * w + r.x + r.w) * px), y * r.w * px);
  return out;
}
export function pasteRect(buf, w, r, src, px){
  for (let y = 0; y < r.h; y++) buf.set(src.subarray(y * r.w * px, (y + 1) * r.w * px), ((r.y + y) * w + r.x) * px);
}
export function diffBox(a, b, w, h, px){
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const o = (row + x) * px;
      let same = true;
      for (let c = 0; c < px; c++) if (a[o + c] !== b[o + c]) { same = false; break; }
      if (same) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export const sameBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };



export function activeAlphaTarget(){
  if (qmask || !CHP) return null;
  try { const v = CHP.view; return v && v.active != null ? v.active : null; } catch { return null; }
}
export function beginStroke(pt, opts = {}){
  const aAt = activeAlphaTarget();
  const why = qmask ? '' : aAt != null ? alphaWriteWhy() : paintGuard();
  if (why) { $('#err').textContent = '画笔用不了：' + why; return null; }
  const idx = selLayer;
  const target = qmask ? 'qmask' : aAt != null ? 'alpha' : brushTarget();
  const erase = opts.erase !== undefined ? opts.erase : docTool === 'eraser';
  let S;
  if (target === 'qmask') {
    
    if (opts.opFn) { $('#err').textContent = '快速蒙版模式下只能用画笔 / 铅笔 / 橡皮擦涂抹'; return null; }
    S = { target: 'qmask', idx: -1, buf: qmask.gray, base: Uint8Array.from(qmask.gray), w: docW, h: docH,
          ox: 0, oy: 0, M: [1, 0, 0, 1, 0, 0], inv: [1, 0, 0, 1, 0, 0], px: 1, tone: grayOf(erase ? bgRGB : fgRGB), label: '快速蒙版' };
  } else if (target === 'alpha') {
    
    if (opts.opFn) { $('#err').textContent = '在 Alpha 通道上只能用画笔 / 铅笔 / 橡皮擦涂抹'; return null; }
    const g = alphaPaintBuffer(aAt);
    if (!g) { $('#err').textContent = '画笔用不了：这条通道读不出来'; return null; }
    S = { target: 'alpha', idx: aAt, buf: g, base: Uint8Array.from(g), w: docW, h: docH,
          ox: 0, oy: 0, M: [1, 0, 0, 1, 0, 0], inv: [1, 0, 0, 1, 0, 0], px: 1, tone: opts.tone !== undefined ? opts.tone : grayOf(erase ? bgRGB : fgRGB), label: 'Alpha 通道' };
  } else if (target === 'mask') {
    let mp = ensureMaskPaint(idx, { point: pt });
    if (!mp) {
      
      delete maskPaint[idx]; ensureMaskPaint(idx, { create: true, fill: 255, point: pt }); commitMaskPaint(idx); maskAdded(idx);
      mp = ensureMaskPaint(idx, { point: pt });
      if (!mp) { $('#err').textContent = '画笔用不了：这一层建不了蒙版'; return null; }
    }
    

    const g = opts.tone !== undefined ? opts.tone : erase ? 0 : grayOf(fgRGB);   
    S = { target: 'mask', idx, buf: mp.gray, base: Uint8Array.from(mp.gray), w: mp.w, h: mp.h,
          ox: mp.docLeft, oy: mp.docTop, M: [1, 0, 0, 1, mp.docLeft, mp.docTop],
          inv: [1, 0, 0, 1, -mp.docLeft, -mp.docTop], px: 1, tone: g };
  } else {
    const pp = ensurePixelPaint(idx,{sparse:true});
    if (!pp) { $('#err').textContent = '画笔用不了：这一层没有可改的像素'; return null; }
    growPixelPaintToCanvas(idx, pp);
    

    const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
    if (!map) { $('#err').textContent = '画笔用不了：' + PAINT_WARP_WHY; return null; }
    

    const L0 = layerTree && layerTree.flat && layerTree.flat[idx];
    const lockAlpha = isBackgroundLayer(idx) || !!(L0 && effLock(idx, L0, 'lockTransparency', 'transparency'));
    const eraseBg = erase && lockAlpha;
    S = { target: 'pixels', idx, buf: pp.rgba, base: pp.sparse?null:Uint8ClampedArray.from(pp.rgba), w: pp.w, h: pp.h,
          ox: pp.left, oy: pp.top, M: map.M, inv: map.inv, lockAlpha,
          px: 4, color: eraseBg ? bgRGB.slice() : erase ? null : (opts.color || fgRGB), erase: erase && !eraseBg };
    if(pp.sparse){
      if(curStroke?.sparse)endStroke();
      S.sparse=pp.sparse;S.transaction=pp.sparse.begin();S.docRef=doc;S.pending=sparseTail;
    }
  }
  strokeSetup(S, pt, opts);
  if(S.sparse&&(opts.op||S.opFn||S.dual)){$('#err').textContent='此超大图层目前支持画笔、铅笔和普通橡皮擦';return null;}
  if(S.sparse)sparsePending++;
  set_curStroke(S);
  if(S.sparse)updateUndoButtons();
  $('#err').textContent = '';
  if (!opts.deferDab) emitDab(S, pt.x, pt.y, S.lastP);
  return S;
}

export function strokeSetup(S, pt, opts){
  const size = Math.max(1, opts.size || brush.size);
  S.radius = size / 2;
  S.hardness = opts.hardness !== undefined ? opts.hardness : brush.hardness;
  S.span = Math.max(1, S.radius * (1 - S.hardness));
  S.inner = Math.max(0, S.radius - S.span);
  S.aliased = !!opts.aliased;
  S.opacity = Math.max(0, Math.min(1, opts.opacity !== undefined ? opts.opacity : brush.opacity));
  S.flow = Math.max(0.01, Math.min(1, opts.flow !== undefined ? opts.flow : brush.flow));
  S.spacing = Math.max(0.01, opts.spacing !== undefined ? opts.spacing : brush.spacing);
  

  const plain = !!opts.plain;
  S.tipKind = opts.tip || (plain ? 'round' : brush.tip);
  S.tip = makeTip(S.tipKind);
  S.angle = plain ? 0 : -((opts.angle !== undefined ? opts.angle : brush.angle) * Math.PI / 180);   
  S.round = plain ? 1 : Math.max(.01, Math.min(1, opts.roundness !== undefined ? opts.roundness : brush.roundness));
  S.mode = opts.mode || (!opts.op && toolModes[docTool]) || 'normal';
  S.seed = (Math.random() * 2147483647) | 0;
  { let z = S.seed >>> 0; S.rand = () => { z = (z + 0x6D2B79F5) >>> 0; let t = Math.imul(z ^ (z >>> 15), z | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  S.dyn = plain ? null : (opts.dyn !== undefined ? opts.dyn : brush.dyn);
  if (S.dyn) normalizeDynamics(S.dyn);
  const dx0 = S.dyn;
  const dynOn = !!(dx0 && (dx0.shape.on || dx0.scatter.on || dx0.transfer.on || dx0.color.on || dx0.texture.on || dx0.dual.on || dx0.pose.on || dx0.shape.flipXFixed || dx0.shape.flipYFixed));
  if (!dynOn) S.dyn = S.dyn && (S.dyn.noise || S.dyn.wetEdges) ? { ...S.dyn, shape: { on: false }, scatter: { on: false }, transfer: { on: false }, color: { on: false } } : null;
  S.noise = !!(S.dyn && S.dyn.noise); S.wet = !!(S.dyn && S.dyn.wetEdges);
  
  S.tex = null;
  if (S.dyn && S.dyn.texture && S.dyn.texture.on) { const T = brushTextureLum(S.dyn.texture.pattern); if (T) S.tex = { T, cfg: S.dyn.texture, each: S.dyn.texture.eachTip !== false }; }
  
  S.dual = null;
  if (S.dyn && S.dyn.dual && S.dyn.dual.on) {
    const c = S.dyn.dual, tipK = c.sample ? brushLib.ensureSample(c.sample) : c.tip;
    S.dual = { cfg: c, tip: makeTip(tipK), sq: tipK === 'square', mask: S.sparse?sparseCoverage(S.w,S.h):new Float32Array(S.w * S.h), carry: 0, last: { x: pt.x, y: pt.y } };
  }
  S.dynBase = { angle: S.angle, roundness: S.round, fg: S.color, bg: bgRGB.slice(),
    pressureSize: !plain && (opts.pressureSize !== undefined ? opts.pressureSize : brush.pressureSize),
    pressureOpacity: !plain && (opts.pressureOpacity !== undefined ? opts.pressureOpacity : brush.pressureOpacity) };
  
  S.sym = !plain && symmetryOn && brush.symmetry && SYM_TOOLS.has(opts.tool || docTool) ? symmetryMaps(brush.symmetry) : null;
  S.shaped = !!S.tip || S.tipKind === 'square' || S.round < .999 || !!(dynOn && S.dyn.shape.on && (S.dyn.shape.roundJitter > 0 || S.dyn.shape.flipX || S.dyn.shape.flipY));
  S.fancy = S.shaped || dynOn || !!S.sym || S.dynBase.pressureSize || S.dynBase.pressureOpacity || !!S.tex || !!S.dual;
  S.dabIndex = 0; S.dir = 0; S.dir0 = null; S.lastP = pt.p !== undefined ? pt.p : 1; S.pen = opts.noSel ? null : stylusState;
  S.acc = S.sparse?null:new Float32Array(S.w * S.h);
  S.selCov = qmask || opts.noSel ? null : selCovFn();
  S.dirty = null; S.carry = 0; S.last = { x: pt.x, y: pt.y }; S.dabs = 0;
}

export function artStamp(S, cx, cy, r, c, op){
  const M = S.M, inv = S.inv, buf = S.buf, base = S.base;
  { const d = S.dirtyDoc || (S.dirtyDoc = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    if (cx - r < d.x0) d.x0 = cx - r; if (cy - r < d.y0) d.y0 = cy - r; if (cx + r > d.x1) d.x1 = cx + r; if (cy + r > d.y1) d.y1 = cy + r; }
  const b = srcBoxOfDocRect(inv, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  const x0 = Math.max(0, b.x0), x1 = Math.min(S.w - 1, b.x1), y0 = Math.max(0, b.y0), y1 = Math.min(S.h - 1, b.y1);
  if (x1 < x0 || y1 < y0) return;
  const span = Math.max(1, r * (1 - S.hardness)), ri = Math.max(0, r - span);
  let tx0 = S.w, ty0 = S.h, tx1 = -1, ty1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = M[0] * (x + .5) + M[2] * (y + .5) + M[4], py = M[1] * (x + .5) + M[3] * (y + .5) + M[5];
    const d = Math.hypot(px - cx, py - cy); if (d >= r) continue;
    let cov = d <= ri ? 1 : (r - d) / span; cov = cov * cov * (3 - 2 * cov);
    if (S.selCov) { const sv = S.selCov(Math.floor(px), Math.floor(py)); if (!sv) continue; cov *= sv / 255; }
    const a = cov * op; if (a <= 0) continue;
    const o = (y * S.w + x) * 4, ba = buf[o + 3] / 255;
    if (S.lockAlpha) { for (let k = 0; k < 3; k++) buf[o + k] = Math.round(buf[o + k] + (c[k] - buf[o + k]) * a); buf[o + 3] = base[o + 3]; }
    else { const oa = a + ba * (1 - a); for (let k = 0; k < 3; k++) buf[o + k] = Math.round((c[k] * a + buf[o + k] * ba * (1 - a)) / oa); buf[o + 3] = Math.round(oa * 255); }
    if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
  }
  if (tx1 < 0) return;
  S.dabs++;
  const d0 = S.dirty;
  S.dirty = d0 ? { x0: Math.min(d0.x0, tx0), y0: Math.min(d0.y0, ty0), x1: Math.max(d0.x1, tx1), y1: Math.max(d0.y1, ty1) } : { x0: tx0, y0: ty0, x1: tx1, y1: ty1 };
}

export const SYM_TOOLS = new Set(['brush', 'pencil', 'mixerBrush', 'eraser']);




export function emitDab(S, x, y, p){
  if (S.dual && !S.dualStarted) { S.dualStarted = true; dualDab(S, x, y); }
  if (!S.fancy) { stampDab(S, x, y); return; }
  const pen = S.pen || null, isPen = !!(pen && pen.pen);
  const dd = dabDynamics(S.dyn, S.dynBase, { pressure: p !== undefined ? p : 1, index: S.dabIndex++, dir: S.dir, dir0: S.dir0 == null ? S.dir : S.dir0, rand: S.rand,
    pen, tiltX: isPen ? pen.tiltX || 0 : 0, tiltY: isPen ? pen.tiltY || 0 : 0, twist: isPen ? pen.twist || 0 : 0 });
  if (dd.size <= 0 || dd.opacity <= 0 || dd.flow <= 0) return;
  const r = Math.max(.5, S.radius * dd.size), D2 = S.radius * 2;
  const maps = S.sym || [null];
  for (const [ox, oy] of dd.offsets) {
    const X = x + ox * D2, Y = y + oy * D2;
    for (const m of maps) {
      let px = X, py = Y, a = dd.angle, fy = dd.flipY, rk = 1;
      if (m) {
        [px, py] = m.f(X, Y);
        if (m.mirror && m.phi != null) { a = 2 * m.phi - a; fy = !fy; }   
        else if (m.mirror && m.phiFn) { a = 2 * m.phiFn(X, Y) - a; fy = !fy; }   
        else if (m.rot) a += m.rot;
        if (m.scale) rk = m.scale;                                    
      }
      stampDab(S, px, py, { r: Math.max(.5, r * rk), cos: Math.cos(a), sin: Math.sin(a), round: dd.round, flipX: dd.flipX, flipY: fy,
        flowK: dd.flow, opK: dd.opacity, color: dd.color, depth: dd.depth });
    }
  }
}

function dualDab(S, x, y){
  const du = S.dual, c = du.cfg, r = Math.max(.5, (c.size || 25) / 2), maps = S.sym || [null];
  const n = Math.max(1, Math.round(c.count || 1)), dir = S.dir || 0;
  for (let k = 0; k < n; k++) {
    let X = x, Y = y;
    if (c.scatter > 0) {
      const a = (S.rand() * 2 - 1) * c.scatter * r, b = c.both ? (S.rand() * 2 - 1) * c.scatter * r : 0;
      X += -Math.sin(dir) * a + Math.cos(dir) * b; Y += Math.cos(dir) * a + Math.sin(dir) * b;
    }
    const ang = -((c.angle || 0) * Math.PI / 180) + (c.angleJitter ? (S.rand() * 2 - 1) * Math.PI : 0);
    for (const m of maps) {
      let px = X, py = Y, a = ang;
      if (m) { [px, py] = m.f(X, Y); if (m.mirror && m.phi != null) a = 2 * m.phi - a; else if (m.mirror && m.phiFn) a = 2 * m.phiFn(X, Y) - a; else if (m.rot) a += m.rot; }
      stampMask(du.mask, S.w, S.h, S.M, S.inv, px, py, r * (m && m.scale || 1), du.tip, c.hardness, Math.cos(a), Math.sin(a), Math.max(.01, c.roundness || 1), du.sq, !!c.flip);
    }
  }
}

function dualAdvance(S, x0, y0, x1, y1){
  const du = S.dual, step = Math.max(.5, (du.cfg.spacing || .25) * (du.cfg.size || 25)), dist = Math.hypot(x1 - x0, y1 - y0);
  if (dist < 1e-6) return;
  let t = du.carry > 0 ? du.carry : step;
  while (t <= dist) { const k = t / dist; dualDab(S, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); t += step; }
  du.carry = t - dist;
}

export const texLumCache = new Map();
function brushTextureLum(id){
  if (!id) return null;
  if (texLumCache.has(id)) return texLumCache.get(id);
  let P = (presets.lib.patterns || []).find(p => p.id === id) || null;
  if (!P && doc) { const dp = (doc.patterns || []).find(p => p.id === id); const r = dp && patternToRGBA(dp); if (r) P = { width: r.width, height: r.height, rgba: r.data }; }
  if (!P) return null;
  const T = textureLum(P); texLumCache.set(id, T); return T;
}

export function selCovFn(){
  if (!selection) return null;
  const { x: sx, y: sy, width: sw, height: sh, data } = selection;
  return (dx, dy) => { const i = dx - sx, j = dy - sy; return (i < 0 || j < 0 || i >= sw || j >= sh) ? 0 : data[j * sw + i]; };
}




function queueSparseDab(S,cx,cy,D){
  const r=D?D.r:S.radius,b=srcBoxOfDocRect(S.inv,{x:cx-r,y:cy-r,width:2*r,height:2*r});
  const rect={x:Math.max(0,b.x0),y:Math.max(0,b.y0),w:Math.min(S.w,b.x1+1)-Math.max(0,b.x0),h:Math.min(S.h,b.y1+1)-Math.max(0,b.y0)};
  if(rect.w<=0||rect.h<=0)return;
  const q=S.sparseQueue||(S.sparseQueue=[]);q.push({cx,cy,D,rect});
  if(S.sparseBatch)return;
  S.sparseBatch=true;
  S.pending=S.pending.then(async()=>{
    while(q.length&&!S.error&&doc===S.docRef){
      

      const batch=q.splice(0,16), box=batch.reduce((a,v)=>a?{x:Math.min(a.x,v.rect.x),y:Math.min(a.y,v.rect.y),r:Math.max(a.r,v.rect.x+v.rect.w),b:Math.max(a.b,v.rect.y+v.rect.h)}:{x:v.rect.x,y:v.rect.y,r:v.rect.x+v.rect.w,b:v.rect.y+v.rect.h},null);
      const rect={x:box.x,y:box.y,w:box.r-box.x,h:box.b-box.y};
      await S.transaction.prepare(rect); if(doc!==S.docRef)break;
      let changed=false;
      for(const t of S.transaction.contexts(rect)){
        const M=S.M,inv=S.inv;
        const sub={...S,sparse:null,buf:t.rgba,base:t.base,acc:t.acc,w:t.width,h:t.height,dirty:null,dirtyDoc:null,
          rasterOrigin:{x:t.x,y:t.y,width:S.w},
          M:[M[0],M[1],M[2],M[3],M[4]+M[0]*t.x+M[2]*t.y,M[5]+M[1]*t.x+M[3]*t.y],
          inv:[inv[0],inv[1],inv[2],inv[3],inv[4]-t.x,inv[5]-t.y]};
        for(const dab of batch){stampDab(sub,dab.cx,dab.cy,dab.D);if(!sub.dirty)continue;changed=true;}
        if(!sub.dirty)continue;
        S.transaction.dirty(t.key,sub.dirty);
        const d=sub.dirty,a={x0:d.x0+t.x,y0:d.y0+t.y,x1:d.x1+t.x,y1:d.y1+t.y},old=S.dirty;
        S.dirty=old?{x0:Math.min(old.x0,a.x0),y0:Math.min(old.y0,a.y0),x1:Math.max(old.x1,a.x1),y1:Math.max(old.y1,a.y1)}:a;
      }
      if(changed){S.dabs+=batch.length;gpuSparseChanged();scheduleStrokeRepaint(S);}
    }
  }).catch(e=>{S.error=e;S.transaction.rollback();if(doc===S.docRef){$('#err').textContent='画笔未能完成：'+e.message;renderPreviewOnly();}}).finally(()=>{
    if(q.length&&!S.error){const next=q.shift();S.sparseBatch=false;queueSparseDab(S,next.cx,next.cy,next.D);}else S.sparseBatch=false;
  });
}
export function stampDab(S, cx, cy, D){
  if(S.sparse){queueSparseDab(S,cx,cy,D);return;}
  if (S.beforeDab) S.beforeDab(cx, cy, D);
  if (S.skipStamp) return;                          
  const r = D ? D.r : S.radius, M = S.M, inv = S.inv;
  { const d = S.dirtyDoc || (S.dirtyDoc = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });   
    if (cx - r < d.x0) d.x0 = cx - r; if (cy - r < d.y0) d.y0 = cy - r; if (cx + r > d.x1) d.x1 = cx + r; if (cy + r > d.y1) d.y1 = cy + r; }
  const b = srcBoxOfDocRect(inv, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  const x0 = Math.max(0, b.x0), x1 = Math.min(S.w - 1, b.x1);
  const y0 = Math.max(0, b.y0), y1 = Math.min(S.h - 1, b.y1);
  if (x1 < x0 || y1 < y0) return;
  const buf = S.buf, acc = S.acc, base = S.base;
  const span = D ? Math.max(1, r * (1 - S.hardness)) : S.span, ri = D ? Math.max(0, r - span) : S.inner;
  

  const shaped = !!D && S.shaped, tip = S.tip && S.tip.sampled ? tipForDiameter(S.tip, r * 2) : S.tip, sq = S.tipKind === 'square';
  const tex = S.tex, dual = S.dual, tdepth = D && D.depth != null ? D.depth : (tex ? tex.cfg.depth : 1);
  const cs = D ? D.cos : 1, sn = D ? D.sin : 0, rr = D ? D.round : 1, fX = D && D.flipX ? -1 : 1, fY = D && D.flipY ? -1 : 1;
  const opCap = Math.min(1, S.opacity * (D ? D.opK : 1)), flow = Math.min(1, S.flow * (D ? D.flowK : 1));
  const color = (D && D.color && S.color) ? D.color : S.color;
  const plainPaint = S.mode === 'normal' && !S.lockAlpha;
  let tx0 = S.w, ty0 = S.h, tx1 = -1, ty1 = -1;
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5, row = y * S.w;
    for (let x = x0; x <= x1; x++) {
      const sx = x + 0.5;
      const px = M[0] * sx + M[2] * sy + M[4], py = M[1] * sx + M[3] * sy + M[5];
      const dx = px - cx, dy = py - cy;
      let cov, dn;
      if (!shaped) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        
        cov = S.aliased ? 1 : (d <= ri ? 1 : (r - d) / span);
        if (!S.aliased) cov = cov * cov * (3 - 2 * cov);       
        dn = d / r;
      } else {
        const u = fX * (dx * cs + dy * sn) / r, v = fY * (-dx * sn + dy * cs) / (r * rr);
        if (tip) {
          if (u <= -1 || u >= 1 || v <= -1 || v >= 1) continue;
          cov = sampleTip(tip, u, v);
          if (S.aliased) cov = cov >= .5 ? 1 : 0;              
          dn = Math.min(1, Math.hypot(u, v));
        } else {
          dn = sq ? Math.max(Math.abs(u), Math.abs(v)) : Math.sqrt(u * u + v * v);
          if (dn >= 1) continue;
          const d = dn * r;
          cov = S.aliased ? 1 : (d <= ri ? 1 : (r - d) / span);
          if (!S.aliased) cov = cov * cov * (3 - 2 * cov);
        }
      }
      if (S.wet && cov > 0) cov *= .45 + .55 * dn * dn;       
      const nativeIndex=S.rasterOrigin?(y+S.rasterOrigin.y)*S.rasterOrigin.width+x+S.rasterOrigin.x:row+x;
      if (S.noise && cov > 0 && cov < 1) cov = Math.max(0, Math.min(1, cov + (hash01(nativeIndex, S.seed + S.dabs) - .5) * 1.8 * Math.min(cov, 1 - cov)));   
      if (dual && cov > 0) cov = dualCombine(dual.cfg.mode, cov, dual.mask[row + x]);   
      let cap = opCap;
      if (tex && cov > 0) {
        const t = textureAt(tex.T, tex.cfg, px, py);
        if (tex.each) cov = textureCombine(tex.cfg.mode, cov, t, tdepth);            
        else cap = textureCombine(tex.cfg.mode, opCap, t, tdepth);                   
      }
      if (S.selCov) { const s = S.selCov(Math.floor(px), Math.floor(py)); if (!s) continue; cov *= s / 255; }
      if (cov <= 0) continue;
      const i = row + x, a = S.iterative ? 0 : acc[i];
      if (a >= cap) continue;
      const na = Math.min(cap, a + flow * cov * (1 - a));
      if (na <= a) continue;
      acc[i] = na;
      if (S.px === 1) {
        const b = base[i];
        buf[i] = Math.round(b + (S.tone - b) * na);
      } else if (S.opFn) {
        

        S.opFn(S, i, na, px, py);
        if (S.lockAlpha) buf[i * 4 + 3] = base[i * 4 + 3];   
      } else {
        const o = i * 4, ba = base[o + 3] / 255;
        if (S.erase) {
          buf[o + 3] = Math.round(base[o + 3] * (1 - na));   
        } else if (!plainPaint || color !== S.color) {
          
          compositePaint(buf, base, o, color, na, S.mode, S.lockAlpha, S.mode === 'dissolve' ? hash01(nativeIndex, S.seed) : 0);
        } else {
          const ca = na, oa = ca + ba * (1 - ca);            
          if (oa <= 0) { buf[o + 3] = 0; }
          else {
            for (let c = 0; c < 3; c++) buf[o + c] = Math.round((S.color[c] * ca + base[o + c] * ba * (1 - ca)) / oa);
            buf[o + 3] = Math.round(oa * 255);
          }
        }
      }
      if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
      if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
    }
  }
  if (tx1 < 0) return;
  S.dabs++;
  const d0 = S.dirty;
  S.dirty = d0 ? { x0: Math.min(d0.x0, tx0), y0: Math.min(d0.y0, ty0), x1: Math.max(d0.x1, tx1), y1: Math.max(d0.y1, ty1) }
               : { x0: tx0, y0: ty0, x1: tx1, y1: ty1 };
}

export function strokeTo(S, pt){
  if (S.recPts) S.recPts.push([Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10, pt.p !== undefined ? Math.round(pt.p * 100) / 100 : 1]);   
  const step = Math.max(0.5, S.spacing * S.radius * 2);
  const x = S.last.x, y = S.last.y;
  const dx = pt.x - x, dy = pt.y - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return;
  
  const p0 = S.lastP !== undefined ? S.lastP : 1, p1 = pt.p !== undefined ? pt.p : p0;
  S.dir = Math.atan2(dy, dx); if (S.dir0 == null) S.dir0 = S.dir;
  if (S.dual) dualAdvance(S, x, y, pt.x, pt.y);
  let t = S.carry > 0 ? S.carry : step;
  while (t <= dist) {
    const k = t / dist;
    emitDab(S, x + dx * k, y + dy * k, p0 + (p1 - p0) * k);
    t += step;
  }
  S.carry = t - dist;
  S.last = { x: pt.x, y: pt.y };
  S.lastP = p1;
}


let strokeRAF = 0;
export function scheduleStrokeRepaint(S){
  if (strokeRAF) return;
  strokeRAF = requestAnimationFrame(() => { strokeRAF = 0; if (curStroke === S || S.forced) repaintStrokeLayer(S); });
}





const fxNum = v => (v && typeof v === 'object') ? (+v.value || 0) : (+v || 0);
function fxMargin(l){
  const e = l && l.effects; if (!e || e.masterFXSwitch === false) return 0;
  const sc = fxNum(e['Scl ']) ? fxNum(e['Scl ']) / 100 : 1;
  let m = 0;
  const each = (fx, f) => { for (const x of [].concat(fx || [])) if (x && x.enab !== false) m = Math.max(m, f(x)); };
  each(e.DrSh, x => fxNum(x.blur) + fxNum(x.Dstn)); each(e.dropShadowMulti, x => fxNum(x.blur) + fxNum(x.Dstn));
  each(e.IrSh, x => fxNum(x.blur) + fxNum(x.Dstn)); each(e.innerShadowMulti, x => fxNum(x.blur) + fxNum(x.Dstn));
  each(e.OrGl, x => fxNum(x.blur)); each(e.IrGl, x => fxNum(x.blur));
  each(e.FrFX, x => fxNum(x['Sz  '])); each(e.frameFXMulti, x => fxNum(x['Sz  ']));
  each(e.ChFX, x => fxNum(x.blur) + fxNum(x.Dstn)); each(e.ebbl, x => fxNum(x.blur) * 2);
  return Math.ceil(m * sc) + 4;
}
export function strokeRegionRepaint(S){
  const d = S.dirtyDoc; S.dirtyDoc = null;
  if (!d || !isFinite(d.x0) || soLayerIndex >= 0 || li || proofOn || cmDisplay() || chanView.single || chanView.off.size) return false;
  if (Object.keys(textRenders).length || Object.keys(layerTransforms).some(i => transformChanged(+i))) return false;
  const order = displayOrder(), pos = order.indexOf(S.idx); if (pos < 0) return false;
  const cdoc = composeDocForOrder(previewCompositeDoc(doc), order);
  if (!cdoc) return false;
  const m = fxMargin(cdoc.layers[pos]) + 2;
  const x0 = Math.max(0, Math.floor(d.x0 - m)), y0 = Math.max(0, Math.floor(d.y0 - m));
  const x1 = Math.min(docW, Math.ceil(d.x1 + m)), y1 = Math.min(docH, Math.ceil(d.y1 + m));
  if (x1 <= x0 || y1 <= y0) return true;
  if ((x1 - x0) * (y1 - y0) > docW * docH * 0.6) return false;    
  const rw = x1 - x0, rh = y1 - y0;
  const shifted = regionizeDoc(cdoc, docW, docH, x0, y0, rw, rh, pos);
  if (!shifted) return false;
  if (!S.fxCache) S.fxCache = new Map();
  const surf = compositeAll(shifted, rw, rh, new Map(), { fxCache: S.fxCache, fresh: new Set([pos]) });
  scratchCtx('#below').putImageData(new ImageData(surf.data, rw, rh), x0, y0);
  presentCanvas('#below', { rect: { x0, y0, x1, y1 } });
  drawGizmo();
  return true;
}
function sparseDirtyDocRect(S){
  const d = S && S.dirty, l = doc?.layers?.[S?.idx];
  if (!d || !l || !isFinite(d.x0) || !isFinite(d.y0) || !isFinite(d.x1) || !isFinite(d.y1)) return null;
  const b = l.bounds || { left: 0, top: 0 };
  return { x0: d.x0 + (b.left || 0) - 4, y0: d.y0 + (b.top || 0) - 4,
    x1: d.x1 + (b.left || 0) + 4, y1: d.y1 + (b.top || 0) + 4 };
}

export function repaintStrokeLayer(S){
  if(S.sparse){
    if(doc===S.docRef){
      delete thumbCache[S.idx];
      


      if(gpuActive() && gpuFrame()){ drawGizmo(); return; }
      if (!renderLargeViewportFallback({ rect: sparseDirtyDocRect(S) })) renderPreviewOnly();
    }
    return;
  }
  if (S.target === 'qmask') { qmaskRefresh(); drawGizmo(); return; }
  if (S.target === 'alpha') { markAlphaPainted(S.idx, true); renderPreviewOnly(); return; }
  if (S.target === 'mask') {
    const mp = maskPaint[S.idx], dl = doc.layers[S.idx];
    const Lm = layerTree && layerTree.flat && layerTree.flat[S.idx];
    
    const adjL = !!(Lm && Lm.adjustment && Lm.adjustment.kind !== 'fill');
    const rgba = adjL ? null : recomposeLayerRGBA(dl, doc.mode, maskOverrideOf(S.idx, mp));
    if (adjL) { delete layerCanvasCache[S.idx]; delete thumbCache[S.idx]; }
    else if (rgba) { dl.rgba = rgba; delete layerCanvasCache[S.idx]; delete thumbCache[S.idx]; }
    else if (!S.warned) { S.warned = true; $('#notice').textContent = cmykMaskNote(); }
    delete maskThumbCache[S.idx];
  } else {
    
    delete layerCanvasCacheRaw[S.idx]; delete thumbCache[S.idx];
    const dl = doc.layers[S.idx];
    if (gpuActive() && dl && dl.rgba) {
      const d = S.dirtyDoc; S.dirtyDoc = null;
      const r = d && isFinite(d.x0) ? srcBoxOfDocRect(S.inv, { x: d.x0, y: d.y0, width: d.x1 - d.x0, height: d.y1 - d.y0 }) : null;
      if (gpuRepaintLayer(dl.rgba, r ? { x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 2, y1: r.y1 + 2 } : null)) return;
      gpuInvalidateData(dl.rgba);              
    } else gpuInvalidateData(dl && dl.rgba);
  }
  if (S.target !== 'qmask' && curStroke === S) { try { if (strokeRegionRepaint(S)) return; } catch (e) {  } }
  renderPreviewOnly();
}
export function maskOverrideOf(idx, mp){
  const o = { gray: mp.gray, width: mp.w, height: mp.h, top: mp.top, left: mp.left, defaultColor: mp.defaultColor };
  if (mp.mode === 'new') { o.relative = false; o.disabled = false; o.invert = false; }
  else {
    const l = layerTree && layerTree.flat && layerTree.flat[idx];
    if (l) {
      const d = opField(idx, 'setMaskProps', 'disabled'); if (d !== undefined) o.disabled = d;
      const v = opField(idx, 'setMaskProps', 'invert'); if (v !== undefined) o.invert = v;
      const den = opField(idx, 'setMaskProps', 'density'); if (den !== undefined) o.density = den;
      const fea = opField(idx, 'setMaskProps', 'feather'); if (fea !== undefined) o.feather = fea;
    }
  }
  return o;
}
const cmykMaskNote = () => doc && doc.mode === 4
  ? 'CMYK 文档：这一层没法从 rgba 反推出通道平面，蒙版**预览**不会更新 —— 涂上去的内容是记下来了，导出的 PSD 是对的，只是画布看不出变化。'
  : '这一层没有原始通道平面，蒙版预览不会更新；涂上去的内容仍会写进导出的 PSD。';


export let lastPaintPt = null;
export function set_lastPaintPt(v) { return (lastPaintPt = v); }   

export function strokeLineTo(pt, keepOpen){
  const from = lastPaintPt;
  const S = docTool === 'eraser' ? beginEraserStroke({ x: from.x, y: from.y }, null) : docTool === 'pencil' ? beginPencilStroke({ x: from.x, y: from.y }) : BRUSHOP_TOOLS.has(docTool) ? beginBrushOpStroke({x:from.x,y:from.y},{}) : beginStroke({ x: from.x, y: from.y }, { tool: docTool });
  if (!S) { syncBrushPanel(); return false; }
  strokeTo(S, pt);
  if (keepOpen) { scheduleStrokeRepaint(S); return S; }
  S.forced = true;
  endStroke();
  repaintStrokeLayer(S);
  syncBrushPanel();
  return true;
}
export function endStroke(){
  const S = curStroke;
  if(S?.sparse){
    if(S.ending)return S.ending;
    if(paintGest?.S===S)endPaintGesture(false);
    S.closed=true;S.forced=true;
    S.ending=S.pending.then(()=>{
      if(curStroke===S)set_curStroke(null);
      if(doc!==S.docRef)return null;
      const patches=S.error?[]:S.transaction.finish();
      if(patches.length){
        brushHistory.undo.push({kind:'sparsePixels',idx:S.idx,patches});brushHistory.redo.length=0;
        if(brushHistory.undo.length>histCap('brush'))brushHistory.undo.shift();
        histPush(S.erase?'橡皮擦':'画笔','brush');
      }
      if(S.last)lastPaintPt={x:S.last.x,y:S.last.y,idx:S.idx,target:S.target,tool:docTool};
      commitPixelPaint(S.idx);renderLayerPanel();repaintStrokeLayer(S);
      return S.dirty?{x:S.dirty.x0,y:S.dirty.y0,w:S.dirty.x1-S.dirty.x0+1,h:S.dirty.y1-S.dirty.y0+1}:null;
    }).finally(()=>{sparsePending--;updateUndoButtons();});
    sparseTail=S.ending.catch(()=>{});return S.ending;
  }
  if (paintGest && paintGest.S === S) endPaintGesture(false);   
  set_curStroke(null);
  if (!S) return null;
  if (S.last) lastPaintPt = { x: S.last.x, y: S.last.y, idx: S.idx, target: S.target, tool: docTool };
  if (S.mixerAmount !== undefined) { set_mixerAmount(S.mixerAmount); set_mixerCarry(mixerOpts.autoClean ? null : S.mixerPickup?.slice()); if (S.mixerTile) set_mixerReservoir(tileMean(S.mixerTile)); }
  if (!S.dirty) { syncGizmoCursor(); return null; }
  const r = { x: S.dirty.x0, y: S.dirty.y0, w: S.dirty.x1 - S.dirty.x0 + 1, h: S.dirty.y1 - S.dirty.y0 + 1 };
  const before = cutRect(S.base, S.w, r, S.px), after = cutRect(S.buf, S.w, r, S.px);
  if (!sameBytes(before, after)) {
    brushHistory.undo.push({ kind: S.target, idx: S.idx, rect: r, before, after, px: S.px });
    if (S.recPts && S.recPts.length) actRecord('toolStroke', { tool: S.recTool, pts: S.recPts, size: brush.size, fg: fgRGB.slice(), bg: bgRGB.slice() });
    histPush(S.label || (S.erase ? '橡皮擦' : (S.target === 'mask' ? '蒙版画笔' : '画笔')), 'brush');
    if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
    brushHistory.redo.length = 0;
  }
  commitPaint(S.target, S.idx);
  return r;
}


function commitPaint(target, idx){
  if (target === 'qmask') { qmaskRefresh(); drawGizmo(); return true; }
  if (target === 'alpha') { markAlphaPainted(idx); renderPreviewOnly(); updateUndoButtons(); return true; }
  if (target === 'mask') return commitMaskPaint(idx);
  return commitPixelPaint(idx);
}
export function commitMaskPaint(idx){
  const mp = maskPaint[idx];
  if (!mp) return false;
  const box = diffBox(mp.gray, mp.orig, mp.w, mp.h, 1);
  const ok = commitLayerOps(idx, () => {
    if (mp.mode === 'new') {
      putLayerOp(idx, { op: 'addLayerMask', index: idx, gray: Uint8Array.from(mp.gray),
                        bounds: { top: mp.top, left: mp.left, bottom: mp.top + mp.h, right: mp.left + mp.w },
                        defaultColor: mp.defaultColor == null ? 0 : mp.defaultColor });
    } else if (mp.compact && box) {
      putLayerOp(idx, { op: 'replaceLayerMask', index: idx, gray: Uint8Array.from(mp.gray),
                        bounds: { top: mp.top, left: mp.left, bottom: mp.top + mp.h, right: mp.left + mp.w },
                        defaultColor: mp.defaultColor == null ? 255 : mp.defaultColor });
    } else if (!box) {
      dropLayerOp(idx, 'setLayerMaskPixels');
    } else {
      putLayerOp(idx, { op: 'setLayerMaskPixels', index: idx, which: 'user',
                        x: box.x, y: box.y, w: box.w, h: box.h, gray: cutRect(mp.gray, mp.w, box, 1) });
    }
  });
  if (!ok) return false;
  

  updateUndoButtons();
  return true;
}
export function commitPixelPaint(idx){
  const pp = pixelPaint[idx];
  if (!pp) return false;
  if(pp.sparse){
    pp.clean=!pp.sparse.tiles.size;
    if(pp.clean)dropLayerOp(idx,'sparsePixels');else putLayerOp(idx,{op:'sparsePixels',index:idx});
    gpuSparseChanged();delete thumbCache[idx];updateUndoButtons();return true;
  }
  const changed = !sameBytes(pp.rgba, pp.orig);
  const ok = commitLayerOps(idx, () => {
    
    if (!changed) dropLayerOp(idx, 'replaceLayerPixels');
    
    
    


    else putLayerOp(idx, { op: 'replaceLayerPixels', index: idx,
      rgba: { data: pp.rgba, width: pp.w, height: pp.h },
      bounds: { top: pp.top, left: pp.left, bottom: pp.top + pp.h, right: pp.left + pp.w },
      opts: { premultiplied: true, ...(pp.nativeSource ? { nativeSource: pp.nativeSource, displaySource: pp.orig } : {}),
        ...(doc.mode===4&&pp.nativeSource?{nativeProfile:CM?.state?.profile?.bytes,nativeIntent:CM?.settings?.intent,nativeBpc:CM?.settings?.bpc}: {}) } });
  });
  if (!ok) return false;
  
  delete layerCanvasCacheRaw[idx]; delete thumbCache[idx];
  
  pp.clean = !changed;
  doc.layers[idx].rgba = pp.rgba;
  renderPreviewOnly();
  updateUndoButtons();
  return true;
}

function brushApply(e, which){
  if(e.kind==='sparsePixels'){
    const pp=pixelPaint[e.idx];if(!pp?.sparse)return false;
    pp.sparse.apply(e.patches,which);commitPixelPaint(e.idx);renderLayerPanel();renderPreviewOnly();return true;
  }
  const t = e.kind === 'qmask' ? (qmask && { gray: qmask.gray, w: docW }) : e.kind === 'alpha' ? (alphaPaintBuffer(e.idx) && { gray: alphaPaintBuffer(e.idx), w: docW })
    : e.kind === 'mask' ? maskPaint[e.idx] : pixelPaint[e.idx];
  if (!t) return false;
  pasteRect(e.kind === 'mask' || e.kind === 'qmask' || e.kind === 'alpha' ? t.gray : t.rgba, t.w, e.rect, which === 'before' ? e.before : e.after, e.px);
  if (e.selBefore !== undefined) {                  
    const want = which === 'before' ? e.selBefore : e.selAfter;
    if (want !== selection) { set_selection(want); set_selPathCache(null); syncAnts(); }
  }
  if (e.kind === 'mask') {
    const dl = doc.layers[e.idx];
    const rgba = recomposeLayerRGBA(dl, doc.mode, maskOverrideOf(e.idx, t));
    if (rgba) { dl.rgba = rgba; delete layerCanvasCache[e.idx]; delete thumbCache[e.idx]; }
    delete maskThumbCache[e.idx];
  }
  commitPaint(e.kind, e.idx);
  
  
  
  
  if (e.kind === 'pixels' && doc?.layers[e.idx]?.rgba) {
    

    gpuForgetLayer(doc.layers[e.idx].rgba);
    gpuRepaintLayer(doc.layers[e.idx].rgba, {
      x0: e.rect.x, y0: e.rect.y, x1: e.rect.x + e.rect.w, y1: e.rect.y + e.rect.h,
    });
  }
  renderPreviewOnly();
  return true;
}
export function brushUndo(quiet){ if(sparsePaintBusy())return flushSparsePaint().then(()=>brushUndo(quiet));const e = brushHistory.undo.pop(); if (!e) return false; brushHistory.redo.push(e); brushApply(e, 'before'); updateUndoButtons();
  if (!quiet) { histLog.cursor = Math.max(0, histLog.cursor - 1); syncHistoryPanel(); } return true; }
export function brushRedo(quiet){ const e = brushHistory.redo.pop(); if (!e) return false; brushHistory.undo.push(e); brushApply(e, 'after'); updateUndoButtons();
  if (!quiet) { histLog.cursor = Math.min(histLog.items.length - 1, histLog.cursor + 1); syncHistoryPanel(); } return true; }


const topIsAdjust = st => { const e = st[st.length - 1]; return !!(e && e.adjust); };

const PIXEL_TOOLS = new Set(['brush', 'eraser', 'gradient', 'bucket',
  'spotHeal', 'healBrush', 'patch', 'contentMove', 'redEye',      
  'pencil', 'cloneStamp', 'patternStamp', 'backgroundEraser', 'magicEraser',
  'colorReplace', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge']);   

export const ALT_EYEDROP = new Set(['brush', 'pencil', 'gradient', 'bucket', 'colorReplace']);
export const brushUndoable = () => !li && brushHistory.undo.length > 0 && (PIXEL_TOOLS.has(docTool) || topIsAdjust(brushHistory.undo));
export const brushRedoable = () => !li && brushHistory.redo.length > 0 && (PAINT_TOOLS.has(docTool) || topIsAdjust(brushHistory.redo));


export function maskFromSelection(idx){
  if (!selection || !doc) return false;
  const dl = doc.layers[idx];
  if (!dl) return false;
  try {
    if (dl.mask && isU8(dl.mask.gray)) {                       
      const mp = ensureMaskPaint(idx);
      if (!mp) return false;
      const { gray } = selectionToMaskGray(selection, { x: mp.docLeft, y: mp.docTop, width: mp.w, height: mp.h });
      mp.gray.set(gray);
      const rect = { x: 0, y: 0, w: mp.w, h: mp.h };
      brushHistory.undo.push({ kind: 'mask', idx, rect, px: 1, before: Uint8Array.from(mp.orig), after: Uint8Array.from(mp.gray) });
      histPush('蒙版', 'brush');
      brushHistory.redo.length = 0;
      const dl2 = doc.layers[idx];
      const rgba = recomposeLayerRGBA(dl2, doc.mode, maskOverrideOf(idx, mp));
      if (rgba) { dl2.rgba = rgba; delete layerCanvasCache[idx]; delete thumbCache[idx]; }
      else $('#notice').textContent = cmykMaskNote();
      delete maskThumbCache[idx];
      return commitMaskPaint(idx);
    }
    
    const emp = !(dl.width > 0 && dl.height > 0);   
    const { gray } = selectionToMaskGray(selection, emp ? { x: 0, y: 0, width: docW, height: docH } : { x: dl.bounds.left, y: dl.bounds.top, width: dl.width, height: dl.height });
    delete maskPaint[idx];
    ensureMaskPaint(idx, { create: true, gray, fill: 255 });
    return commitMaskPaint(idx);
  } catch (e) { $('#err').textContent = '用选区生成蒙版没能完成：' + humanEditError(e && e.message || e); return false; }
}


export function syncBrushSwatches(){
  tools.setColors(hexOf(fgRGB), hexOf(bgRGB));
  psPanels.refreshColors();
  colorPanelUI.refresh();
  presets.refreshGradientThumbnails();
  
  if (shapeOpts.fillFromFg) { shapeOpts.fill = hexOf(fgRGB);
    const a1 = $('#shpFill'); if (a1 && document.activeElement !== a1) a1.value = shapeOpts.fill;
    const a2 = $('#penFill'); if (a2 && document.activeElement !== a2) a2.value = shapeOpts.fill; }
  $('#brFg').style.background = hexOf(fgRGB);
  $('#brBg').style.background = hexOf(bgRGB);
  $('#brFg').title = `前景色 ${hexOf(fgRGB)}（蒙版按灰度 ${grayOf(fgRGB)} 用）`;
  $('#brBg').title = `背景色 ${hexOf(bgRGB)}（蒙版按灰度 ${grayOf(bgRGB)} 用）`;
}
