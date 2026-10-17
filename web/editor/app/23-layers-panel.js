




import './22-deform-tools.js';   
import { compositeAll, hasRenderableFill, vectorStrokeRenderParams } from '../../../core/app.js';
import { rasterizeVectorMask } from '../../../core/compose.js';
import { readLazyLayerPixel } from '../../../core/psd-raster.js';
import { toolCursor, UI_CURSOR_VAR } from '../icons.js';
import { FX_PANEL_ORDER, FX_PANE_LIST } from '../layer-style-panes.js';
import { preferences as PREF } from '../preferences.js';
import { isShapeLayer } from '../property-panel.js';
import { $, ADJ_KEY_ICON, CREATABLE_FX, icon, openLayerStyleDialog } from './01-boot.js';
import {
  LP, LX, SFX, cur, doc, docH, docW, layerDeletes, layerEdits, layerOps, layerRenames, layerReorder, layerTree,
  li, maskPaint, pixelPaint, selection, soEdits, soLayerIndex, sos, textCrops, textRenders,
} from './02-doc-state.js';
import {
  HXP, PP, actRecord, propTab, pushDocHistory, revealPropsPanel, set_propMaskTarget, set_propTab, syncPropTabs,
  uiQuiet, visibilityIntoHistory,
} from './03-history.js';
import {
  LOCK_BTN_FIELD, isBackgroundLayer, rasterKindOf, rasterizeLayerUI, syncLockRow, unlockBackground,
} from './05-layer-lock-guides.js';
import { eyeDrag, set_eyeDrag, syncThumbTargets } from './07-nav-histogram.js';
import { isTextLayer } from './09-text-tool.js';
import { duplicateLayerUI, openInside, soInside, soRasterCache } from './20-snap-smart-object.js';
import { confirmLeaveSO, discardSoAdjustments } from './21-load-document.js';
import { DEFORM_LABEL, deformRun, exitSO, matchLayer } from './22-deform-tools.js';
import {
  FX_LABELS, addedFxValue, effClipping, effColorLabel, effFxEnabled, effFxMaster, effLock, findLayerOp, opField,
  renderProps, setAddedFxParam, setOpField, setSingleOp,
} from './24-layer-ops-queue.js';
import { convertToSmartObjectUI, createLayerUI, groupSelectedUI, ungroupSelectedUI } from './26-layer-create.js';
import { setLayerVisible } from './27-gradient-editor.js';
import {
  batchTargets, deleteLayerForReal, deleteLayersReal, dragRowIndex, dropOpenTimer, mkEl, moveLayer, moveLayerTo,
  set_dragRowIndex, set_dropOpenTimer, toggleLayerDelete,
} from './28-layer-props-transform.js';
import { setLayerSolo } from './29-scrubby-live.js';
import { previewCompositeDoc, renderStaticLayers, textCropCanvas } from './30-render.js';
import { docTool, moveOpts, panelHover, setDocTool, set_panelHover } from './31-selection-brush.js';
import { loadLayerAlphaAsSelectionLazy } from './32-cursors-select-options.js';
import { docArtboards } from './35-artboard.js';
import { maskSelectAndMask, syncBrushPanel } from './40-options-bar-wiring.js';
import { pathToSelectionUI } from './44-vector-path.js';
import { selectionToLayerPath } from './45-path-tools.js';
import {
  drawGizmo, editFilter, effFilterEnabled, filterSoIndexOf, loadFilterList, origFilterOf, origStyleEnabled,
  pushFilterEdits, soFilterEdits, soFilters,
} from './46-smart-filter-panel.js';
import { ctxSep, openInlineTextEditor } from './47-canvas-context-menu.js';
import {
  convertTextShapeUI, effTextShape, openTextWarpDialog, textDynamicOf, toggleDynamicText,
} from './52-alpha-text-menu.js';
import { CPP, TXP } from './57-layer-style-text-path.js';


export let selLayer = -1;                 
export function set_selLayer(v) { return (selLayer = v); }   
export const selLayers = new Set();       
export const collapsedGroups = new Set(); 
export const thumbCache = {};             




export const layerCanvasCacheRaw = {};
export let layerPixelHook = null;
export function set_layerPixelHook(v) { return (layerPixelHook = v); }   
export const layerCanvasCache = new Proxy(layerCanvasCacheRaw, {
  deleteProperty(t, k) { delete t[k]; if (layerPixelHook) { try { layerPixelHook(k); } catch {} } return true; },
});
export let rowEls = {};                   
let layerVirtualScrollRAF = 0;
let layerVirtualWindow = null;
let layerVirtualModel = null;
export function panelLayerIndices(){ return layerVirtualModel?.doc === doc ? layerVirtualModel.entries.map(e => e.idx) : []; }

export function revealLayerRow(idx){
  const list = $('#layerList'), m = layerVirtualModel;
  const entry = m?.entries.find(e => e.idx === idx);
  if (list && entry) {
    if (entry.top < list.scrollTop) list.scrollTop = entry.top;
    else if (entry.bottom > list.scrollTop + list.clientHeight) list.scrollTop = entry.bottom - list.clientHeight;
    renderLayerPanel({ scrollOnly: true });
  }
  return rowEls[idx] || null;
}
function measureLayerRowHeights(list){
  const classes = ['lrow', 'lrow grouprow', 'lrow frame-row grouprow', 'lrow fillrow', 'lfx'];
  const probes = classes.map(c => {
    const el = mkEl('div', { className: c });
    el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    if (c === 'lrow fillrow') el.append(mkEl('span', { className: 'fillthumb-small' }));
    return el;
  });
  list.append(...probes);
  const heights = probes.map(el => el.getBoundingClientRect().height || parseFloat(getComputedStyle(el).height) || 27);
  probes.forEach(el => el.remove());
  return { regular: heights[0], group: heights[1], frame: heights[2], smallFill: heights[3], effect: heights[4] };
}
{ const lf = $('#layerFilter'); if (lf) lf.addEventListener('input', () => renderLayerPanel()); }   


export let THUMB_BOX = 38;                 
export function set_THUMB_BOX(v) { return (THUMB_BOX = v); }   

function thumbRect(i){
  const dl = doc && doc.layers[i];
  if (LP && LP.opts.thumbContent === 'bounds' && dl && !dl.isSmartObject) {
    const tc = textRenders[i] && textCrops[i];
    const b = tc && tc.bounds ? tc.bounds : (dl.rgba && dl.width > 0 && dl.height > 0 ? dl.bounds : null);
    if (b && b.right > b.left && b.bottom > b.top) return { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top, bounds: true };
  }
  return { x: 0, y: 0, w: docW, h: docH, bounds: false };
}
function thumbAspectSize(i){
  let W = docW, H = docH;
  const dl = doc && doc.layers[i];
  { const tr = thumbRect(i); if (tr.bounds) { W = tr.w; H = tr.h; } }
  if (dl && dl.isSmartObject && Array.isArray(sos)) {
    const so = sos.find(x => matchLayer(x) === i);
    const o = so && (so.info?.summary?.originalSize || null);
    if (o && o.width > 0 && o.height > 0) { W = o.width; H = o.height; }
  }
  if (!(W > 0 && H > 0)) return { w: THUMB_BOX, h: THUMB_BOX };
  const k = THUMB_BOX / Math.max(W, H);
  return { w: Math.max(4, Math.round(W * k)), h: Math.max(4, Math.round(H * k)) };
}

function applyThumbFrame(el, i){
  const { w, h } = thumbAspectSize(i);
  el.style.width = w + 'px'; el.style.height = h + 'px';
  el.style.margin = `${(THUMB_BOX - h) / 2}px ${(THUMB_BOX - w) / 2}px`;
}



export function drawRGBAThumb(ctx, rgba, w, h, dx, dy, dw, dh, sample=null){
  const W = Math.max(1, Math.round(dw)), H = Math.max(1, Math.round(dh));
  if (!(w > 0 && h > 0) || !(rgba||sample)) return;
  const out = new ImageData(W, H), o = out.data;
  const sampled={data:null,offset:0};
  const fx = w / W, fy = h / H, kx = Math.max(1, Math.min(4, Math.ceil(fx))), ky = Math.max(1, Math.min(4, Math.ceil(fy)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < ky; j++) {
      const sy = Math.min(h - 1, Math.floor((y + (j + 0.5) / ky) * fy));
      for (let i = 0; i < kx; i++) {
        const sx = Math.min(w - 1, Math.floor((x + (i + 0.5) / kx) * fx));
        if(sample)sample(sx,sy,sampled);
        const source=sample?sampled.data:rgba,q=sample?sampled.offset:(sy*w+sx)*4;if(!source)continue;
        const al=source[q+3];r+=source[q]*al;g+=source[q+1]*al;b+=source[q+2]*al;a+=al;
      }
    }
    const p = (y * W + x) * 4, n = kx * ky;
    if (a > 0) { o[p] = r / a; o[p + 1] = g / a; o[p + 2] = b / a; o[p + 3] = a / n; }
  }
  const t = new OffscreenCanvas(W, H); t.getContext('2d').putImageData(out, 0, 0);
  ctx.drawImage(t, 0, 0, W, H, dx, dy, dw, dh);
}
function drawLazyThumb(ctx, layer, index, dx, dy, dw, dh){
  if (!layer || !(layer.width > 0 && layer.height > 0)) return;
  const sparse=pixelPaint[index]?.sparse,p=layer.lazyPreview,cell=sparse?.tileSize||256;
  drawRGBAThumb(ctx,null,layer.width,layer.height,dx,dy,dw,dh,(sx,sy,out)=>{
    const tile=sparse?.tiles.get(`${Math.floor(sx/cell)*cell}:${Math.floor(sy/cell)*cell}`);
    if(tile){out.data=tile.data;out.offset=((sy-tile.y)*tile.width+sx-tile.x)*4;}
    else if(p?.data){out.data=p.data;out.offset=(Math.min(p.height-1,Math.floor(sy*p.height/layer.height))*p.width+Math.min(p.width-1,Math.floor(sx*p.width/layer.width)))*4;}
    else{out.data=readLazyLayerPixel(layer,sx,sy,doc?.mode||3);out.offset=0;}
  });
}
function layerThumb(i){
  if (thumbCache[i]) return thumbCache[i];
  const l = doc && doc.layers[i];
  const fr = thumbAspectSize(i), dpr = 2;
  const CW = fr.w * dpr, CH = fr.h * dpr;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const kx = docW ? CW / docW : 1, ky = docH ? CH / docH : 1;
  const soIdx = l && l.isSmartObject && Array.isArray(sos) ? sos.findIndex(x => matchLayer(x) === i) : -1;
  const src = textRenders[i];                    
  if (soIdx >= 0) {
    

    const ins = soInside[soIdx] && soInside[soIdx].composite;
    const img = soRasterCache[soIdx];
    if (ins && ins.data && ins.width > 0) {
      drawRGBAThumb(ctx, ins.data, ins.width, ins.height, 0, 0, CW, CH);
    } else if (img && (img.naturalWidth || img.width)) {
      ctx.drawImage(img, 0, 0, CW, CH);
    } else if (l.rgba && l.width > 0 && l.height > 0) {
      const k = Math.min(CW / l.width, CH / l.height), w = Math.max(1, l.width * k), h = Math.max(1, l.height * k);
      drawRGBAThumb(ctx, l.rgba, l.width, l.height, (CW - w) / 2, (CH - h) / 2, w, h);
    }
  } else if (src) {
    
    const tc = textCrops[i];
    const cropCv = tc && tc.bounds ? textCropCanvas(i) : null;
    if (cropCv && thumbRect(i).bounds) ctx.drawImage(cropCv, 0, 0, CW, CH);   
    else if (cropCv) { const b = tc.bounds; ctx.drawImage(cropCv, b.left * kx, b.top * ky, (b.right - b.left) * kx, (b.bottom - b.top) * ky); }
    else if (src.width === docW && src.height === docH) ctx.drawImage(src, 0, 0, CW, CH);
  } else if (l && l.rgba && l.width > 0 && l.height > 0) {
    
    if (thumbRect(i).bounds) drawRGBAThumb(ctx, l.rgba, l.width, l.height, 0, 0, CW, CH);
    else drawRGBAThumb(ctx, l.rgba, l.width, l.height, l.bounds.left * kx, l.bounds.top * ky, l.width * kx, l.height * ky);
  } else if (l && l.lazyPreview && l.lazyPreview.data) {
    if (thumbRect(i).bounds) drawLazyThumb(ctx,l,i,0,0,CW,CH);
    else drawLazyThumb(ctx,l,i,l.bounds.left*kx,l.bounds.top*ky,l.width*kx,l.height*ky);
  } else if (l && l.lazyChannels) {
    if (thumbRect(i).bounds) drawLazyThumb(ctx,l,i,0,0,CW,CH);
    else drawLazyThumb(ctx,l,i,l.bounds.left*kx,l.bounds.top*ky,l.width*kx,l.height*ky);
  } else if (l && docW && docH && (hasRenderableFill(l.fill, l.vectorMask, doc.patterns) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask) || findLayerOp(i, 'setVectorMaskPath'))) {
    

    try {
      const pd = previewCompositeDoc(doc), pl = pd.layers[i];
      const one = { ...pl, opacity: 255, fillOpacity: 255, blendMode: 'norm', hidden: false, clipping: 0, effects: null, knockout: 0, mask: null, group: null };
      const surf = compositeAll({ layers: [one], patterns: pd.patterns }, docW, docH, new Map());
      const off = new OffscreenCanvas(docW, docH);
      off.getContext('2d').putImageData(new ImageData(surf.data, docW, docH), 0, 0);
      ctx.drawImage(off, 0, 0, CW, CH);
    } catch {  }
  }
  return (thumbCache[i] = c);
}



export function layerTypeIconKey(l, idx = -1){
  if (!l) return 'layer-bitmap';
  if (l.isFrame) return 'layer-frame-badge';
  

  if (l.isSmartObject) {
    const k = idx >= 0 && LX?.test ? LX.test.soIndexOf(idx) : -1;
    if (k >= 0 && LX.test.isExternal(k)) {
      const status = LX.test.linkStatus(k);
      if (status === 'missing') return 'layer-smart-missing-badge';
      if (status === 'modified') return 'layer-smart-differs-badge';
      return 'layer-smart-linked-badge';
    }
    return 'layer-smart-badge';
  }
  if (l.text) return 'layer-text';
  
  if (l.vectorMask || isShapeLayer(l)) return 'layer-vector-mask-badge';
  if (l.adjustment) {
    if (l.adjustment.kind === 'fill') {
      const k = String(l.adjustment.key || '').trim();
      if (k === 'GdFl') return 'layer-fill-gradient';
      if (k === 'GrdM') return 'layer-fill-gradient-map';
      return 'layer-fill-solid';
    }
    return 'layer-adjust';
  }
  return 'layer-bitmap';
}
function layerTypeBadge(l, idx){
  const key = layerTypeIconKey(l, idx), b = document.createElement('span');
  b.className = 'layer-type-badge';
  b.title = ({
    'layer-bitmap': '像素图层', 'layer-text': '文字图层', 'layer-smart': '智能对象',
    'layer-smart-badge': '嵌入的智能对象', 'layer-smart-linked-badge': '链接的智能对象',
    'layer-smart-missing-badge': '缺失的链接智能对象', 'layer-smart-differs-badge': '已修改的链接智能对象',
    'layer-frame-badge': '画框图层', 'layer-vector-mask-badge': '矢量蒙版',
    'layer-adjust': '调整图层', 'layer-vector': '形状/矢量图层',
    'layer-fill-solid': '纯色填充图层', 'layer-fill-gradient': '渐变填充图层',
    'layer-fill-gradient-map': '渐变映射图层'
  })[key] || '图层类型';
  b.append(icon(key, 12));
  return b;
}

export const LABEL_COLORS = { 1:'#c9463f', 2:'#d08834', 3:'#c9bb3f', 4:'#4f9f4f', 5:'#3f6fc9', 6:'#8a4fc9', 7:'#7a7a7e' };
const LABEL_NAMES  = { 1:'红', 2:'橙', 3:'黄', 4:'绿', 5:'蓝', 6:'紫', 7:'灰' };



export const maskThumbCache = {};
function maskThumb(i, node, kind = 'pixel'){
  
  
  const cacheKey = kind === 'vector' ? `${i}:vector` : i;
  if (kind === 'pixel' && maskThumbCache[cacheKey] !== undefined) return maskThumbCache[cacheKey];
  const dl = doc && doc.layers[i];
  if (kind === 'vector') {
    const model = previewCompositeDoc(doc).layers[i]?.vectorMask;
    if (!model?.path) return null;
    const box = mkEl('span', { className: 'maskthumb vector', title: '矢量蒙版' });
    box.dataset.maskKind = 'vector';
    box.classList.toggle('off', !!model.disable);
    
    
    const fr = thumbAspectSize(i), width = Math.max(8, fr.w * 2), height = Math.max(8, fr.h * 2);
    const alpha = rasterizeVectorMask({ ...model, disable: false, density: 255, feather: 0 }, width, height);
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const g = c.getContext('2d'), image = g.createImageData(width, height);
    for (let p = 0; p < alpha.length; p++) { const o = p * 4; image.data[o] = image.data[o + 1] = image.data[o + 2] = alpha[p]; image.data[o + 3] = 255; }
    g.putImageData(image, 0, 0); box.append(c); applyThumbFrame(box, i);
    return box;
  }
  const mpN = maskPaint[i] && maskPaint[i].mode === 'new' ? maskPaint[i] : null;   
  const m = (dl && dl.mask) || (mpN ? { gray: mpN.gray, width: mpN.w, height: mpN.h, left: mpN.docLeft, top: mpN.docTop, relative: false, defaultColor: 255 } : null);
  if (!m) return (maskThumbCache[cacheKey] = null);
  
  const opD = opField(i, 'setMaskProps', 'disabled'), opI = opField(i, 'setMaskProps', 'invert');
  const mDis = opD !== undefined ? opD : !!(m && m.disabled);
  const mInv = opI !== undefined ? opI : !!(m && m.invert);
  const box = document.createElement('span');
  box.className = 'maskthumb' + (mDis ? ' off' : '');
  box.dataset.maskKind = 'pixel';
  if (m && m.gray && m.width > 0 && m.height > 0) {
    
    const fr = thumbAspectSize(dl && dl.isSmartObject ? -1 : i), CW = fr.w * 2, CH = fr.h * 2;
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const ctx = c.getContext('2d');
    const off = new OffscreenCanvas(m.width, m.height);
    const img = new ImageData(m.width, m.height);
    for (let p = 0; p < m.width * m.height; p++) {
      const v = mInv ? 255 - m.gray[p] : m.gray[p];
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v; img.data[p * 4 + 3] = 255;
    }
    off.getContext('2d').putImageData(img, 0, 0);
    const def = m.defaultColor != null ? m.defaultColor : 255, dv = mInv ? 255 - def : def;
    ctx.fillStyle = `rgb(${dv},${dv},${dv})`; ctx.fillRect(0, 0, CW, CH);
    const mL = m.relative ? dl.bounds.left + m.left : m.left, mT = m.relative ? dl.bounds.top + m.top : m.top;
    const tR = thumbRect(dl && dl.isSmartObject ? -1 : i);
    if (tR.bounds) ctx.drawImage(off, (mL - tR.x) * CW / tR.w, (mT - tR.y) * CH / tR.h, m.width * CW / tR.w, m.height * CH / tR.h);
    else if (docW && docH) ctx.drawImage(off, mL * CW / docW, mT * CH / docH, m.width * CW / docW, m.height * CH / docH);
    else { const k = Math.min(CW / m.width, CH / m.height); ctx.drawImage(off, (CW - m.width * k) / 2, (CH - m.height * k) / 2, m.width * k, m.height * k); }
    box.appendChild(c);
    box.title = `像素蒙版 ${m.width}×${m.height}${mDis ? '（已停用）' : ''}${mInv ? '（反相）' : ''}`;
  } else {
    box.title = node.vectorMask ? '矢量蒙版 / 形状路径' : '蒙版';
  }
  applyThumbFrame(box, dl && dl.isSmartObject ? -1 : i);
  return (maskThumbCache[cacheKey] = box);
}









let layerViewCache = null, layerViewCacheTree = null, layerViewCacheOrder = null, layerViewCacheDefault = false;
export function layerOrderView(order = null){
  const supplied = order || layerReorder;
  const isDefault = !supplied;
  if (layerViewCache && layerViewCacheTree === layerTree && layerViewCacheOrder === supplied && layerViewCacheDefault === isDefault) return layerViewCache;
  const base = supplied || (layerTree && layerTree.flat || []).map(l => l.index);
  const groupType = i => {
    const n = layerTree && layerTree.flat && layerTree.flat[i];
    return n && n.groupType != null ? n.groupType : (doc && doc.layers[i] && doc.layers[i].group ? doc.layers[i].group.type : null);
  };
  const nodes = {}, stack = [];
  for (let p = base.length - 1; p >= 0; p--) {
    const idx = base[p], gt = groupType(idx);
    if (gt === 1 || gt === 2) {
      const node = nodes[idx] = { index: idx, depth: stack.length, parent: stack.length ? stack[stack.length - 1].index : null,
        group: true, divider: false, pos: p, block: null };
      stack.push({ index: idx, pos: p, node });
    } else if (gt === 3) {
      const open = stack.pop();
      nodes[idx] = { index: idx, depth: stack.length, parent: open ? open.node.parent : null, group: false, divider: true, pos: p, block: null };
      if (open) {
        const ids = base.slice(p, open.pos + 1);
        open.node.block = { ids, visualIds: ids.slice().reverse().filter(i => groupType(i) !== 3) };
        nodes[idx].header = open.index;
      }
    } else {
      nodes[idx] = { index: idx, depth: stack.length, parent: stack.length ? stack[stack.length - 1].index : null,
        group: false, divider: false, pos: p, block: { ids: [idx], visualIds: [idx] } };
    }
  }
  
  Object.values(nodes).forEach(n => { if (n.group && !n.block) n.block = { ids: [n.index], visualIds: [n.index] }; });
  return (layerViewCache = { order: base.slice(), nodes, visible: base.slice().reverse().filter(i => !nodes[i].divider) },
    layerViewCacheTree = layerTree, layerViewCacheOrder = supplied, layerViewCacheDefault = isDefault, layerViewCache);
}


export const layerCtx = document.createElement('div');
layerCtx.id = 'layerCtx';
layerCtx.hidden = true;
Object.assign(layerCtx.style, {
  position: 'fixed', zIndex: 99, minWidth: '176px', background: '#2b2b2c', border: '1px solid #4a4a4b',
  borderRadius: '8px', padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,.45)', display: 'none', flexDirection: 'column', gap: '2px',
});
document.body.appendChild(layerCtx);




export const hideLayerCtx = () => { layerCtx.hidden = true; layerCtx.style.display = 'none'; };
export const showLayerCtx = () => { layerCtx.hidden = false; layerCtx.style.display = 'flex'; };
export function ctxItem(label, fn, danger){
  const b = mkEl('button', { textContent: label });
  b.style.cssText = 'all:unset;cursor:pointer;padding:5px 10px;border-radius:5px;font-size:12px;color:var(--text)';
  b.onmouseenter = () => { b.style.background = danger ? 'rgba(224,82,82,.18)' : '#4a4a4b'; };
  b.onmouseleave = () => { b.style.background = 'transparent'; };
  b.onclick = e => { e.stopPropagation(); hideLayerCtx(); fn(); };
  layerCtx.appendChild(b);
}


export function openFxMenu(){
  const l = layerTree && layerTree.flat && layerTree.flat[selLayer];
  if (!doc || !l || l.groupType === 3) return false;
  const btn = document.querySelector('.layer-foot [data-action="layer.style.menu"]');
  layerCtx.innerHTML = '';
  ctxItem('混合选项…', () => openLayerStyleDialog(selLayer, 'blend'));
  ctxSep();
  const have = new Set(layerFxItems(selLayer, l).map(e => e.key));
  for (const p of FX_PANE_LIST) ctxItem((have.has(p.key) ? '✓ ' : '　') + p.label + '…', () => openLayerStyleDialog(selLayer, p.id));
  showLayerCtx();
  const r = layerCtx.getBoundingClientRect(), br = btn ? btn.getBoundingClientRect() : null;
  
  layerCtx.style.left = Math.max(8, Math.min(br ? br.left : 8, innerWidth - r.width - 8)) + 'px';
  layerCtx.style.top = Math.max(8, (br ? br.top : innerHeight) - r.height - 4) + 'px';
  return true;
}

export function openLayerCtx(e, idx){
  if (!doc || !layerTree) return;
  const l = layerTree.flat[idx];
  if (!l || l.groupType === 3) return;
  e.preventDefault(); e.stopPropagation();
  if (LP && LP.openRowMenu(e, idx)) return;            
  layerCtx.innerHTML = '';
  ctxItem('新建图层', () => createLayerUI());
  if (l.groupType == null) ctxItem('复制图层（⌘J）', () => duplicateLayerUI(idx));
  ctxItem(l.groupType === 1 ? '编组（组中组，⌘G）' : '编组（⌘G）', () => {
    selLayers.clear(); selLayers.add(idx); selLayer = idx; renderLayerPanel(); groupSelectedUI();
  });
  const nd = layerOrderView().nodes[idx];
  if (nd && (nd.group || nd.parent != null))
    ctxItem('取消编组（⇧⌘G）', () => { selLayer = idx; ungroupSelectedUI(); });
  const dl = doc.layers[idx];
  if (l.groupType == null && dl && dl.rgba && dl.width > 0)
    ctxItem('载入图层选区（⌘点缩略图）', () => { selLayer = idx; renderLayerPanel(); loadLayerAlphaAsSelectionLazy(idx, 'replace'); });
  if (l.groupType == null && !l.isSmartObject && !layerDeletes.has(idx))
    ctxItem('转换为智能对象', () => { if (!selLayers.has(idx)) selLayers.clear(); selLayer = idx; convertToSmartObjectUI(idx, { multi: true }); });
  if (l.groupType == null && rasterKindOf(idx) && !layerDeletes.has(idx))
    ctxItem('栅格化图层', () => { selLayer = idx; rasterizeLayerUI(idx); });
  if (isTextLayer(idx) && !layerDeletes.has(idx)) {       
    ctxItem(effTextShape(idx) === 'box' ? '转换为点文本' : '转换为段落文本', () => { selLayer = idx; convertTextShapeUI(idx); });
    ctxItem('文字变形…', () => { selLayer = idx; renderLayerPanel(); openTextWarpDialog(idx); });
    ctxItem(textDynamicOf(idx) ? '还原为普通文字' : '转换为动态文本', () => { selLayer = idx; renderLayerPanel(); toggleDynamicText(idx); });
  }
  ctxItem('上移一层（⌘/Ctrl+]）', () => moveLayer(idx, 1));
  ctxItem('下移一层（⌘/Ctrl+[）', () => moveLayer(idx, -1));
  ctxItem('重命名', () => { const nm = rowEls[idx] && rowEls[idx].querySelector('.lname'); if (nm) nm.dispatchEvent(new Event('dblclick')); });
  if (l.groupType == null)
  if (l.groupType == null) {
    if (layerDeletes.has(idx)) {
      ctxItem('恢复图层', () => toggleLayerDelete(idx));
      ctxItem('彻底删除', () => deleteLayerForReal(idx), true);
    } else ctxItem('删除图层', () => deleteLayersReal(batchTargets(idx)), true);   
  }
  showLayerCtx();
  const r = layerCtx.getBoundingClientRect();
  layerCtx.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  layerCtx.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
}
addEventListener('pointerdown', e => { if (!layerCtx.hidden && !layerCtx.contains(e.target)) hideLayerCtx(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape') hideLayerCtx(); });
addEventListener('blur', hideLayerCtx);
addEventListener('resize', hideLayerCtx);
addEventListener('wheel', () => { if (!layerCtx.hidden) hideLayerCtx(); }, true);
addEventListener('contextmenu', e => { if (!layerCtx.hidden && !layerCtx.contains(e.target)) hideLayerCtx(); }, true);
$('#pathToSel').onclick = () => pathToSelectionUI(false, 'replace');
$('#selToPath').onclick = () => selectionToLayerPath(selLayer);

export let __syncPsPanels = () => {};
export function set___syncPsPanels(v) { return (__syncPsPanels = v); }   



let altClipLineEl = null, altClipTarget = -1;

const CLIP_BAND = 6;
export function hideAltClipLine(){
  altClipTarget = -1;
  if (altClipLineEl) altClipLineEl.hidden = true;
  const list = $('#layerList');
  
  if (list && list.style.getPropertyValue(UI_CURSOR_VAR)) list.style.removeProperty(UI_CURSOR_VAR);
}
function updateAltClipLine(idx, ev, row){
  if (!doc || !layerTree) return;
  const r = row.getBoundingClientRect();
  if (!(r.height > 0)) return;                       
  const dTop = ev.clientY - r.top, dBot = r.bottom - ev.clientY;
  let target = -1;                                   
  if (dTop >= 0 && dTop <= CLIP_BAND) target = idx + 1;          
  else if (dBot >= 0 && dBot <= CLIP_BAND) target = idx;         
  if (target <= 0 || target >= doc.layers.length || isBackgroundLayer(target)) return hideAltClipLine();
  const tr = rowEls[target];
  if (!tr || !tr.isConnected) return hideAltClipLine();
  if (!altClipLineEl || !altClipLineEl.isConnected) {
    altClipLineEl = mkEl('div', { className: 'alt-clipline' });
    (tr.offsetParent || $('#layerList') || document.body).appendChild(altClipLineEl);
  }
  altClipLineEl.hidden = false;
  altClipLineEl.style.top = (tr.offsetTop + tr.offsetHeight) + 'px';
  altClipTarget = target;
  




  const cur = effClipping(target, layerTree.flat[target]) ? 'clipOff' : 'clipOn';
  const css = toolCursor(cur);
  const list = $('#layerList');
  if (css && list) list.style.setProperty(UI_CURSOR_VAR, css);
}

addEventListener('keyup', e => { if (e.key === 'Alt') hideAltClipLine(); });
addEventListener('blur', hideAltClipLine);


export function canLoadLayerSelection(idx){
  const l = doc && doc.layers[idx];
  if (!l || layerDeletes.has(idx) || l.isGroup || l.groupType != null) return false;
  if (l.rgba && l.width > 0 && l.height > 0) return true;
  if (textRenders[idx] && textCrops[idx]) return true;
  return !!(hasRenderableFill(l.fill, l.vectorMask, doc.patterns) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask)
            || findLayerOp(idx, 'setVectorMaskPath'));
}










export const thumbSelHover = { el: null };                  
export const liveMods = { ctrl: false, shift: false, alt: false };   
function selCursorKind(){
  if (!selection) return 'selReplace';
  return liveMods.alt && liveMods.shift ? 'selInt'
       : liveMods.alt ? 'selSub'
       : liveMods.shift ? 'selAdd' : 'selReplace';
}
export function syncThumbSelCursor(){
  const el = thumbSelHover.el;
  if (el && !el.isConnected) thumbSelHover.el = null;
  const on = el && el.isConnected && liveMods.ctrl && el.dataset.selLoad === '1';
  if (el && el.isConnected) el.style.cursor = on ? (toolCursor(selCursorKind()) || '') : '';
}
function trackLiveMods(e, down){
  const k = e.key;
  if (k === 'Control' || k === 'Meta') liveMods.ctrl = down;
  else if (k === 'Shift') liveMods.shift = down;
  else if (k === 'Alt') liveMods.alt = down;
  else return;
  syncThumbSelCursor();
}

addEventListener('keydown', e => trackLiveMods(e, true), true);
addEventListener('keyup', e => trackLiveMods(e, false), true);
addEventListener('blur', () => { liveMods.ctrl = liveMods.shift = liveMods.alt = false; syncThumbSelCursor(); });






export function renderLayerPanel({ scrollOnly = false } = {}){
  if (uiQuiet) return;                 
  if (!scrollOnly) {
    try { __syncPsPanels(); } catch {}
    if (CPP) CPP.refresh(); if (TXP) TXP.refresh();
  }
  const list = $('#layerList');
  const priorScrollTop = list.scrollTop || 0;
  list.onpointerleave = () => {             
    hideAltClipLine();
    if (panelHover >= 0) { set_panelHover(-1); drawGizmo(); }
  };
  
  list.onpointerover = e => {
    if (!moveOpts.panelHover || li || !doc) return;
    const r = e.target && e.target.closest ? e.target.closest('.lrow') : null;
    const i = r && r.dataset.layerIndex != null ? +r.dataset.layerIndex : -1;
    if (i !== panelHover) { set_panelHover(i); drawGizmo(); }
  };
  if (!layerTree || !layerTree.flat) {
    list.replaceChildren(); rowEls = {}; layerVirtualModel = layerVirtualWindow = null; list.onscroll = null;
    layerViewCache = layerViewCacheTree = layerViewCacheOrder = null; layerViewCacheDefault = false;
    renderProps(); return;
  }
  const view = layerOrderView();
  


  if (!scrollOnly || layerVirtualModel?.doc !== doc || layerVirtualModel?.view !== view) {
    const lpFilter = LP ? LP.filterFn(view) : null;
    const filter = LP ? '' : (($('#layerFilter') || {}).value || '').trim().toLowerCase();
    const heights = measureLayerRowHeights(list), entries = [];
    let top = 0;
    for (const idx of view.visible) {
      const l = layerTree.flat[idx], vnode = view.nodes[idx]; if (!l) continue;
      let ancestor = vnode.parent, folded = false;
      while (ancestor != null) { if (collapsedGroups.has(ancestor)) { folded = true; break; } ancestor = view.nodes[ancestor]?.parent; }
      if (folded && !lpFilter || LX?.rowHidden(idx, view) || lpFilter && !lpFilter(idx, l, vnode)) continue;
      if (filter && !String(layerRenames[idx] || l.name || ('图层 ' + idx)).toLowerCase().includes(filter)) continue;
      const smallFill = l.adjustment?.kind === 'fill' && !isShapeLayer(l) && Math.min(docW, docH) < THUMB_BOX && ['GdFl', 'PtFl'].includes(l.adjustment.key);
      let height = smallFill ? heights.smallFill : l.isFrame && vnode.group ? heights.frame : vnode.group ? heights.group : heights.regular;
      if (fxListOpen(idx, l)) { const count = layerFxItems(idx, l).length; if (count) height += (count + 1) * heights.effect; }
      
      if (l.isSmartObject && sfListOpen(idx)) { const info = smartFilterInfo(idx, false); if (info?.filters.length) height += (info.filters.length + 1) * heights.effect; }
      entries.push({ idx, top, bottom: top + height }); top += height;
    }
    layerVirtualModel = { doc, view, entries, height: top };
  }
  const model = layerVirtualModel, order = model.entries;
  const virtual = order.length > 240 && list.clientHeight > 0;
  const overscan = 16;
  const scrollTop = virtual ? Math.min(priorScrollTop, Math.max(0, model.height - list.clientHeight)) : priorScrollTop;
  const lowerBound = y => { let a = 0, b = order.length; while (a < b) { const m = (a + b) >> 1; if (order[m].bottom <= y) a = m + 1; else b = m; } return a; };
  const start = virtual ? Math.max(0, lowerBound(scrollTop) - overscan) : 0;
  const end = virtual ? Math.min(order.length, lowerBound(scrollTop + list.clientHeight) + 1 + overscan) : order.length;
  if (scrollOnly && layerVirtualWindow?.model === model && layerVirtualWindow.start === start && layerVirtualWindow.end === end) return;
  
  if (scrollOnly && (list.contains(document.activeElement) && document.activeElement.isContentEditable || dragRowIndex >= 0)) return;
  layerVirtualWindow = virtual ? { start, end, model } : null;
  list.replaceChildren(); rowEls = {};
  list.onscroll = virtual ? () => {
    if (layerVirtualScrollRAF) return;
    layerVirtualScrollRAF = requestAnimationFrame(() => { layerVirtualScrollRAF = 0; renderLayerPanel({ scrollOnly: true }); });
  } : null;
  if (virtual && start > 0) {
    const spacer = mkEl('div', { className: 'layer-virtual-spacer' });
    spacer.style.height = `${order[start].top}px`; list.appendChild(spacer);
  }
  
  for (let orderPos = start; orderPos < end; orderPos++) {
    const idx = order[orderPos].idx;
    const l = layerTree.flat[idx];
    const vnode = view.nodes[idx];
    if (!l) continue;
    const row = document.createElement('div'); row.className = 'lrow' + (idx === selLayer || selLayers.has(idx) ? ' sel' : '') + (layerDeletes.has(idx) ? ' del' : '');
    row.dataset.layerIndex = String(idx);
    rowEls[idx] = row;
    
    const isArtboardRow = !!vnode.group && !li && docArtboards().some(a => a.index === idx);
    if (isArtboardRow) row.classList.add('artboard');
    else if (vnode.group) row.classList.add('grouprow');
    const visible = layerEdits[idx] && layerEdits[idx].visible != null ? layerEdits[idx].visible : l.visible;
    const eye = document.createElement('span'); eye.className = 'eye' + (visible ? '' : ' off'); eye.append(icon(visible ? 'eye' : 'eye-off', 13));
    eye.title = '显示/隐藏（Alt+点击 = 单独显示该层，再按一次恢复；多选时批量开关）';
    eye.draggable = false;
    eye.onclick = e => e.stopPropagation();
    
    eye.onpointerdown = e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      if (e.altKey) { setLayerSolo(idx); renderLayerPanel(); return; }
      const visUndo = !HXP || HXP.opts.visUndo;       
      if (visUndo) pushDocHistory('显示/隐藏图层');
      const nv = !visible;
      for (const i of batchTargets(idx)) setLayerVisible(i, nv);
      if (!visUndo) visibilityIntoHistory();
      if (idx === selLayer) actRecord('visible', { visible: nv });
      set_eyeDrag({ nv, done: new Set([idx]) });
      eye.classList.toggle('off', !nv); eye.replaceChildren(icon(nv ? 'eye' : 'eye-off', 13));
      const up = () => { removeEventListener('pointerup', up, true); set_eyeDrag(null); if (!visUndo) visibilityIntoHistory(); renderLayerPanel(); };
      addEventListener('pointerup', up, true);
    };
    eye.onpointerenter = () => {
      if (!eyeDrag || eyeDrag.done.has(idx)) return;
      eyeDrag.done.add(idx); setLayerVisible(idx, eyeDrag.nv);
      eye.classList.toggle('off', !eyeDrag.nv); eye.replaceChildren(icon(eyeDrag.nv ? 'eye' : 'eye-off', 13));
    };
    const isFillThumb = l.adjustment?.kind === 'fill' && !isShapeLayer(l);
    row.classList.toggle('fillrow', isFillThumb);
    row.classList.toggle('frame-row', !!l.isFrame);
    const th = document.createElement('span'); th.className = 'thumb';
    let frameContentThumb = null;
    if (vnode.group) {
      const folded = collapsedGroups.has(idx);
      th.classList.add('folder');
      

      const wrap = document.createElement('span'); wrap.className = 'fold-wrap';
      const ar = document.createElement('span');
      ar.className = 'fold-arrow' + (folded ? '' : ' open');
      ar.append(icon('chevron-right', 9));
      const fi = document.createElement('span'); fi.className = 'fold-icon';
      fi.append(icon(l.isFrame ? (l.frame?.shape === 'ellipse' ? 'opt-frame-ellipse' : 'opt-frame-rect') : 'folder', l.isFrame ? 24 : 16));
      if (l.isFrame) {
        th.classList.add('frame-folder'); fi.append(layerTypeBadge(l, idx));
        const child = view.visible.find(i => view.nodes[i]?.parent === idx && !view.nodes[i].group);
        frameContentThumb = document.createElement('span'); frameContentThumb.className = 'thumb frame-content';
        frameContentThumb.dataset.frameContent = String(child ?? -1);
        frameContentThumb.title = child == null ? '空图框：置入图像' : '图框内容：单击选中，双击编辑智能对象';
        if (child != null) {
          
          const source = layerThumb(child), copy = document.createElement('canvas');
          copy.width = source.width; copy.height = source.height;
          copy.getContext('2d').drawImage(source, 0, 0); frameContentThumb.append(copy);
        }
        frameContentThumb.onclick = e => { e.stopPropagation(); selLayers.clear(); selLayer = child ?? idx; renderLayerPanel(); renderProps(); drawGizmo(); };
        frameContentThumb.ondblclick = e => {
          e.stopPropagation(); const soIdx = child == null ? -1 : sos.findIndex(so => matchLayer(so) === child);
          if (soIdx >= 0) openInside(soIdx);
        };
      }
      if (isArtboardRow) wrap.append(ar);            
      else wrap.append(ar, fi);
      th.append(wrap);
      th.title = folded ? '展开组' : '折叠组';
      const toggleGroup = e => { e.stopPropagation(); if (collapsedGroups.has(idx)) collapsedGroups.delete(idx); else collapsedGroups.add(idx); renderLayerPanel(); };
      if (l.isFrame) {
        ar.onclick = toggleGroup;
        th.onclick = e => { e.stopPropagation(); selLayers.clear(); selLayer = idx; renderLayerPanel(); renderProps(); drawGizmo(); };
      } else th.onclick = toggleGroup;
    } else if (l.groupType === 3) th.textContent = '⌐';
    else {
      

      const adjIco = l.adjustment && l.adjustment.kind !== 'fill' ? ADJ_KEY_ICON[l.adjustment.key] : null;
      if (adjIco) {
        th.classList.add('adj');
        th.append(icon('adj-' + adjIco, 18));
      } else if (l.text && !l.isSmartObject) {
        
        th.classList.add('textthumb');
        th.append(icon('layer-text', 22));
      } else {
        th.appendChild(layerThumb(idx));
        applyThumbFrame(th, idx);
        
        if (isFillThumb) {
          th.classList.add('fillthumb');
          const fillKey = l.adjustment?.key;
          const smallCanvas = Math.min(docW, docH) < THUMB_BOX && ['GdFl', 'PtFl'].includes(fillKey);
          if (smallCanvas) {
            th.classList.add('fillthumb-small');
            th.replaceChildren(icon(fillKey === 'GdFl' ? 'fill-thumb-gradient' : 'fill-thumb-pattern', 16));
            th.style.width = th.style.height = '18px';
          } else {
            const fr = thumbAspectSize(idx), scale = Math.max(16, THUMB_BOX - 6) / THUMB_BOX;
            th.style.width = Math.max(8, Math.round(fr.w * scale)) + 'px'; th.style.height = Math.max(12, Math.round(fr.h * scale) + 6) + 'px';
            const frame = icon('fill-thumb-frame', 32); frame.classList.add('fillthumb-plate');
            frame.style.width = frame.style.height = '100%'; frame.style.objectFit = 'fill'; th.prepend(frame);
          }
          th.style.margin = '0 2px';
        } else if (layerTypeIconKey(l, idx) !== 'layer-bitmap') th.appendChild(layerTypeBadge(l, idx));
      }
      
      if (l.isSmartObject) {
        th.ondblclick = e => {
          e.stopPropagation();
          const soIdx = sos.findIndex(so => matchLayer(so) === idx);
          if (soIdx >= 0) openInside(soIdx);
        };
      } else if (l.text && l.text.content != null) {
        
        th.ondblclick = e => {
          e.stopPropagation();
          if (selLayer !== idx) { selLayer = idx; renderLayerPanel(); renderProps(); }
          openInlineTextEditor(idx);
        };
      } else if (l.adjustment) {
        

        th.ondblclick = e => {
          e.stopPropagation();
          
          
          if (selLayer !== idx) { selLayer = idx; renderLayerPanel(); }
          revealPropsPanel();
        };
      }
      
      th.title = (l.isSmartObject ? '双击 = 进入智能对象内部编辑\n'
        : l.adjustment ? '双击 = 在「属性」面板里编辑它的参数' : '');
      th.onclick = e => {
        if (!(e.metaKey || e.ctrlKey)) return;               
        e.stopPropagation();
        loadLayerAlphaAsSelectionLazy(idx, e.altKey && e.shiftKey ? 'intersect' : e.altKey ? 'subtract' : e.shiftKey ? 'add' : 'replace');
      };
      

      if (canLoadLayerSelection(idx)) {
        th.dataset.selLoad = '1';
        th.onpointerover = () => { thumbSelHover.el = th; syncThumbSelCursor(); };
        
        
        th.onpointerleave = () => { if (thumbSelHover.el === th) { th.style.cursor = ''; thumbSelHover.el = null; } };
      }
    }
    const name = document.createElement('span'); name.className = 'lname';
    name.textContent = layerRenames[idx] || l.name || ('图层 ' + idx);
    


    if (effClipping(idx, l)) {
      name.classList.add('clipped');
    }
    name.title = '双击重命名；⌥/Alt + 点行 = 剪贴到下层开关';
    name.ondblclick = e => {
      e.stopPropagation();
      if (l.isSmartObject) { const soIdx = sos.findIndex(so => matchLayer(so) === idx); if (soIdx >= 0) { openInside(soIdx); return; } }
      name.contentEditable = 'true'; name.focus();
      const range = document.createRange(); range.selectNodeContents(name); getSelection().removeAllRanges(); getSelection().addRange(range);
    };
    name.onblur = () => {
      if (name.contentEditable !== 'true') return;
      name.contentEditable = 'false';
      const nn = name.textContent.trim();
      if (nn && nn !== (l.name || ('图层 ' + idx))) { pushDocHistory('重命名图层'); layerRenames[idx] = nn; if (idx === selLayer) actRecord('layerProps', { name: nn }); }
      else { delete layerRenames[idx]; name.textContent = l.name || ('图层 ' + idx); }
      renderProps();
      try { drawGizmo(); } catch {}                      
    };
    name.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } if (e.key === 'Escape') { name.textContent = layerRenames[idx] || l.name; name.contentEditable = 'false'; } };
    row.append(eye);
    if (vnode.depth) { const ind = mkEl('span', { className: 'lindent' }); ind.style.width = (vnode.depth * 18) + 'px'; row.append(ind); }
    
    
    const clab = effColorLabel(idx, l);
    if (clab) { const c = document.createElement('span'); c.className = 'clabel'; c.style.background = LABEL_COLORS[clab] || 'transparent'; c.title = '颜色标签：' + (LABEL_NAMES[clab] || clab); row.append(c); }
    row.append(th);
    if (frameContentThumb) row.append(frameContentThumb);
    
    const internalFrameMask = l.isFrame && (!l.mask || l.mask.fromOtherData) && !maskPaint[idx];
    const masks = [];
    if (!internalFrameMask) {
      const pixel = maskThumb(idx, l, 'pixel');
      if (pixel) masks.push(pixel);
    }
    if (l.vectorMask && !isShapeLayer(l) && !l.isFrame) {
      const vector = maskThumb(idx, l, 'vector');
      if (vector) masks.push(vector);
    }
    if (!masks.length && l.adjustment?.kind === 'adjust' && LP?.opts?.showMaskBadges !== false) {
      const plain = document.createElement('span'); plain.className = 'maskthumb plain'; plain.dataset.maskKind = 'pixel'; plain.title = '蒙版（全显）';
      const c = document.createElement('canvas'); const side = Math.max(8, thumbAspectSize(idx).w * 2); c.width = c.height = side;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, side, side); plain.append(c); applyThumbFrame(plain, idx); masks.push(plain);
    }
    for (const mask of masks) {
      const kind = mask.dataset.maskKind;
      const ml = mkEl('span', { className: 'masklink', title: '蒙版' });
      if (kind === 'vector' ? !doc.layers[idx]?.vectorMask?.notLink : l.mask?.relative === false)
        ml.append(icon('mask-link', 16));
      row.append(ml, mask);
      const showMask = async ev => {
        ev.stopPropagation();
        await row.onclick({});
        if (selLayer !== idx) return;
        PP?.selectMask?.(idx, kind); set_propMaskTarget(idx, kind);
        const target = $('#brTarget');
        if (target) target.value = kind === 'pixel' ? 'mask' : 'pixels';
        syncBrushPanel();
        set_propTab('mask'); renderProps(); syncPropTabs(); syncThumbTargets(); revealPropsPanel();
      };
      mask.onclick = showMask;
      mask.ondblclick = async ev => {
        await showMask(ev);
        if (kind === 'pixel' && PREF.get('tools.dblClickMaskSelectAndMask')) maskSelectAndMask(idx);
      };
      const active = idx === selLayer && propTab === 'mask' && (PP?.maskKind?.(idx, l) === kind || kind === 'pixel');
      mask.classList.toggle('target', !!active);
      mask.classList.toggle('selected', !!active);
    }
    if (idx === selLayer && !vnode.group && !(propTab === 'mask' && masks.length)) th.classList.add('target');
    th.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey) return;
      const target = $('#brTarget'); if (target) target.value = 'pixels';
      set_propTab('layer'); syncBrushPanel(); syncPropTabs(); syncThumbTargets();
    });
    row.append(name);
    

    row.append(mkEl('span', { className: 'lgap' }));
    
    if (effClipping(idx, l)) {
      const c = mkEl('span', { className: 'clipmark', title: '剪贴蒙版：内容被下方图层裁剪' });
      c.append(icon('clip-mask', 11));
      row.insertBefore(c, th);
    }
    

    const fxItems = layerFxItems(idx, l);
    if (fxItems.length) {
      const anyOn = fxItems.some(e => e.on);
      const t = document.createElement('span'); t.className = 'ltag fx icon-only' + (anyOn ? '' : ' lock');
      t.append(icon('fx', 11));
      t.title = '图层样式：' + fxItems.map(e => (e.on ? '✓ ' : '✗ ') + e.label).join('\n')
        + '\n双击 = 打开「图层样式」对话框';
      t.dataset.attr = 'fx-badge';
      t.ondblclick = ev => { ev.stopPropagation(); openLayerStyleDialog(idx, (fxItems.find(e => e.on) || fxItems[0]).key); };
      row.append(t);
      const open = fxListOpen(idx, l);
      const ch = document.createElement('button');
      ch.type = 'button'; ch.className = 'fxopen';
      ch.dataset.attr = 'fx-expand';
      ch.append(icon(open ? 'chevron-up' : 'chevron-down', 11));
      ch.title = open ? '收起这一层的效果列表' : '展开这一层的效果列表（PS 的 fx 箭头）';
      ch.setAttribute('aria-label', ch.title);
      ch.onclick = ev => { ev.stopPropagation(); fxListOpenSet.set(idx, !open); renderLayerPanel(); };
      row.append(ch);
    }
    

    const sfInfo = smartFilterInfo(idx);
    if (sfInfo && sfInfo.filters.length) {
      const anyOn = sfInfo.master && sfInfo.filters.some(f => f.on);
      const t = document.createElement('span'); t.className = 'ltag fx icon-only' + (anyOn ? '' : ' lock');
      t.append(icon('sliders-horizontal', 11));
      t.title = '智能滤镜：' + sfInfo.filters.map(f => (sfInfo.master && f.on ? '✓ ' : '✗ ') + f.label).join('\n');
      t.dataset.attr = 'sf-badge';
      row.append(t);
      const open = sfListOpen(idx);
      const ch = document.createElement('button');
      ch.type = 'button'; ch.className = 'fxopen';
      ch.dataset.attr = 'sf-expand';
      ch.append(icon(open ? 'chevron-up' : 'chevron-down', 11));
      ch.title = open ? '收起这一层的智能滤镜' : '展开这一层的智能滤镜';
      ch.setAttribute('aria-label', ch.title);
      ch.onclick = ev => { ev.stopPropagation(); sfListOpenSet.set(idx, !open); renderLayerPanel(); };
      row.append(ch);
    }
    if (LX) LX.decorateRow(row, idx, l);                  
    
    if (l.adjustment) {
      const t = document.createElement('span'); t.className = 'ltag adj type-legacy';
      t.textContent = l.adjustment.label;
      t.title = (l.adjustment.kind === 'fill' ? '填充图层' : '调整图层') + '（' + l.adjustment.key.trim() + '）';
      row.append(t);
    }
    if (l.isGroup && l.passThrough) { const t = document.createElement('span'); t.className = 'ltag lock type-legacy'; t.textContent = '直通'; t.title = '组混合模式为「直通」（pass through）'; row.append(t); }
    const lk = { all: effLock(idx, l, 'lockAll', 'all'), transparency: effLock(idx, l, 'lockTransparency', 'transparency'),
                 composite: effLock(idx, l, 'lockComposite', 'composite'), position: effLock(idx, l, 'lockPosition', 'position') };
    if (lk.all || lk.transparency || lk.composite || lk.position) {
      const which = lk.all ? '全部锁定'
        : [lk.transparency && '透明像素', lk.composite && '图像像素', lk.position && '位置'].filter(Boolean).join(' / ');
      const bg = isBackgroundLayer(idx);
      const t = document.createElement('button');
      t.type = 'button'; t.className = 'ltag lock icon-only';
      t.append(icon(lk.all ? 'lock-badge' : 'lock-partial', 11));
      t.title = bg ? '背景是锁定的：点一下把它转成普通图层（PS 同）'
                   : '锁定：' + which + '（点一下解锁）';
      t.addEventListener('click', e => {
        e.stopPropagation();
        if (bg) { unlockBackground(idx); return; }
        
        for (const [field, key] of Object.values(LOCK_BTN_FIELD))
          if (effLock(idx, l, field, key)) setOpField(idx, { op: 'setLayerFlags' }, field, false, !!(l.locks && l.locks[key]));
        renderLayerPanel(); renderProps(); syncLockRow();
      });
      row.append(t);
    }
    
    if (!vnode.divider) {
      

    }
    
    row.onpointermove = ev => {
      
      if (!ev.altKey || ev.ctrlKey || ev.metaKey || vnode.divider || li) { hideAltClipLine(); return; }
      updateAltClipLine(idx, ev, row);
    };
    



    row.ondblclick = ev => {
      if (vnode.divider) return;
      const t = ev.target;
      if (t && t.closest && t.closest('.lname, .eye, .ltag.lock, .fxdel, button')) return;
      ev.stopPropagation();
      openLayerStyleDialog(idx);
    };
    row.onclick = async ev => {
      
      
      
      
      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !vnode.divider && !li) {
        ev.stopPropagation();
        const r = row.getBoundingClientRect();
        let target = idx;
        if (r.height > 0) {
          const dTop = ev.clientY - r.top, dBot = r.bottom - ev.clientY;
          if (dTop >= 0 && dTop <= CLIP_BAND) target = idx + 1;
          else if (dBot >= 0 && dBot <= CLIP_BAND) target = idx;
          else return;
        }
        if (target >= doc.layers.length || target - 1 < 0) return;
        if (isBackgroundLayer(target)) { $('#notice').textContent = '背景图层不能被剪贴（PS 同）。'; return; }
        const on = !effClipping(target, layerTree.flat[target]);
        setOpField(target, { op: 'setLayerProps' }, 'clipping', on, !!layerTree.flat[target].clipping);
        if (doc && doc.layers[target]) doc.layers[target].clipping = on ? 1 : 0;   
        renderStaticLayers();     
        renderLayerPanel();                                                
        return;
      }
      
      if (!li && (ev.metaKey || ev.ctrlKey || ev.shiftKey) && !vnode.divider) {
        const vis = layerOrderView().visible;                  
        if (ev.shiftKey && selLayer >= 0) {
          const a = vis.indexOf(selLayer), b = vis.indexOf(idx);
          if (a >= 0 && b >= 0) for (let k = Math.min(a, b); k <= Math.max(a, b); k++) selLayers.add(vis[k]);
        } else if (selLayers.has(idx)) selLayers.delete(idx); else selLayers.add(idx);
        selLayer = idx;
        for (const [i, el] of Object.entries(rowEls)) el.classList.toggle('sel', i == idx || selLayers.has(+i));
        syncThumbTargets();
        renderProps(); drawGizmo();
        return;
      }
      selLayers.clear();
      
      if (li && idx !== soLayerIndex && soEdits[cur]) {
        const v = await confirmLeaveSO();
        if (v === 'stay') return;
        if (v === 'discard') { discardSoAdjustments(); renderStaticLayers(); }
        exitSO();
      }
      const prev = selLayer;
      selLayer = idx;
      set_propTab('layer');
      
      if (prev >= 0 && rowEls[prev]) rowEls[prev].classList.remove('sel');
      if (rowEls[idx]) rowEls[idx].classList.add('sel');
      syncThumbTargets();          
      
      if (!li && docTool !== 'artboard' && docArtboards().some(a => a.index === idx)) { try { setDocTool('artboard'); } catch {} }
      
      else if (!li && docTool === 'artboard' && !docArtboards().some(a => a.index === idx)) { try { setDocTool('move'); } catch {} }
      renderProps();               
      drawGizmo();                 
    };
    
    if (!vnode.divider) {
      row.draggable = true;
      row.ondragstart = e => {
        if (e.target.closest && e.target.closest('.ract, .eye')) { e.preventDefault(); return; }  
        set_dragRowIndex(idx);
        


        row.style.opacity = '.9';
        setTimeout(() => { row.style.opacity = ''; row.classList.add('dragging'); });
        



        try { e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', String(idx)); } catch { }
      };
      row.ondragend = () => { set_dragRowIndex(-1); row.classList.remove('dragging'); row.style.removeProperty('opacity'); clearTimeout(dropOpenTimer); for (const el of list.querySelectorAll('.drop-target')) { el.classList.remove('drop-target', 'drop-after', 'drop-into'); el.style.removeProperty('--drop-inset'); delete el.dataset.dropAfter, delete el.dataset.dropInto; } };
      row.ondragover = e => {
        if (dragRowIndex < 0 || dragRowIndex === idx) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        const rc = row.getBoundingClientRect();
        



        const rel = e.clientY - rc.top;
        const after = vnode.group ? rel >= rc.height - 8 : rel >= rc.height / 2;
        const into = !!vnode.group && rel >= 8 && rel < rc.height - 8;
        clearTimeout(dropOpenTimer);
        for (const el of list.querySelectorAll('.drop-target')) if (el !== row) { el.classList.remove('drop-target', 'drop-after', 'drop-into'); el.style.removeProperty('--drop-inset'); delete el.dataset.dropAfter, delete el.dataset.dropInto; }
        if (into) {
          row.classList.add('drop-into');
          row.dataset.dropInto = '1';
          if (collapsedGroups.has(idx)) set_dropOpenTimer(setTimeout(() => { collapsedGroups.delete(idx); renderLayerPanel(); }, 600));
        } else {
          row.style.setProperty('--drop-inset', (36 + vnode.depth * 18) + 'px');
          row.classList.add('drop-target'); row.classList.toggle('drop-after', after);
          row.dataset.dropAfter = after ? '1' : '';
        }
      };
    row.ondragleave = () => { clearTimeout(dropOpenTimer); row.classList.remove('drop-target', 'drop-after', 'drop-into'); row.style.removeProperty('--drop-inset'); delete row.dataset.dropAfter; delete row.dataset.dropInto; };
    row.ondrop = e => {
      e.preventDefault();
      clearTimeout(dropOpenTimer);
      const after = row.dataset.dropAfter === '1', into = row.dataset.dropInto === '1';
      row.classList.remove('drop-target', 'drop-after', 'drop-into'); row.style.removeProperty('--drop-inset'); delete row.dataset.dropAfter; delete row.dataset.dropInto;
      if (dragRowIndex >= 0 && dragRowIndex !== idx) moveLayerTo(dragRowIndex, idx, after, into);
    };
    row.oncontextmenu = e => {
      
      if (idx !== selLayer && !selLayers.has(idx)) {
        const prev = selLayer; selLayer = idx; selLayers.clear();
        if (prev >= 0 && rowEls[prev]) rowEls[prev].classList.remove('sel');
        row.classList.add('sel'); syncThumbTargets(); renderProps(); drawGizmo();
      }
      openLayerCtx(e, idx);
    };
    }
    list.appendChild(row);
    if (fxItems.length && fxListOpen(idx, l)) appendFxRows(list, idx, l, vnode, fxItems);
    if (sfInfo && sfInfo.filters.length && sfListOpen(idx)) appendSmartFilterRows(list, idx, vnode, sfInfo);
  }
  if (virtual && end < order.length) {
    const spacer = mkEl('div', { className: 'layer-virtual-spacer' });
    spacer.style.height = `${model.height - order[end].top}px`; list.appendChild(spacer);
  }
  list.scrollTop = scrollTop;
  if (!scrollOnly) renderProps();
  syncThumbTargets();
}







export const fxListOpenSet = new Map();                       
const fxListOpen = (idx, l) => (fxListOpenSet.has(idx) ? fxListOpenSet.get(idx)
  : !!l.effectsOpen || !!(LP && LP.opts.expandNewFx && (layerOps[idx] || []).some(o => o.op === 'addLayerEffect')));   

export function layerFxItems(idx, l){
  const out = [];
  for (const e of l.effects || []) {
    const at = e.at || 0;
    if (findLayerOp(idx, `removeLayerEffect:${e.key}:${at}`)) continue;   
    out.push({ key: e.key, at, ord: at, canon: null, label: FX_LABELS[e.key] || e.label, count: e.count || 1,
               base: e.enabled, on: effFxEnabled(idx, e.key, at, e.enabled) });
  }
  for (const op of layerOps[idx] || []) {
    if (op.op !== 'addLayerEffect') continue;
    const spec = CREATABLE_FX[op.effect];
    if (!spec) continue;
    const on = addedFxValue(op, 'enab') !== false;
    
    out.push({ key: spec.key, at: 0, ord: -1 - (op.seq || 0), canon: op.effect, seq: op.seq || 0,
               label: spec.label, count: 1, base: true, on, isNew: true });
  }
  const rank = k => { const i = FX_PANEL_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  

  return out.sort((a, b) => rank(a.key) - rank(b.key) || a.ord - b.ord);
}

export function fxMasterBase(idx){
  const d = doc && doc.layers[idx] && doc.layers[idx].effects;
  return !(d && typeof d === 'object' && d.masterFXSwitch === false);
}
function appendFxRows(list, idx, l, vnode, items){
  const base = 6 + vnode.depth * 14;
  const master = effFxMaster(idx, fxMasterBase(idx));
  const mkRow = (pad, cls) => {
    const r = mkEl('div', { className: 'lfx' + (cls ? ' ' + cls : '') });
    r.style.paddingLeft = pad + 'px';
    r.dataset.layerIndex = String(idx);
    list.appendChild(r);
    return r;
  };
  const mkEye = (on, title, onClick) => {
    const e = mkEl('span', { className: 'eye' + (on ? '' : ' off'), title });
    e.append(icon(on ? 'eye' : 'eye-off', 12));
    e.onclick = ev => { ev.stopPropagation(); onClick(); renderLayerPanel(); renderProps(); };
    return e;
  };
  
  const head = mkRow(base + 24, master ? '' : 'off');
  head.dataset.attr = 'fx-row-master';
  head.append(mkEye(master, '图层样式总开关（关掉这一层所有效果都不显示）',
    () => setSingleOp(idx, { op: 'setLayerEffectsEnabled', index: idx, enabled: !master }, !master === fxMasterBase(idx))));
  head.append(mkEl('span', { className: 'lfxname', textContent: '效果' }));
  head.onclick = () => { if (selLayer !== idx) { selLayer = idx; selLayers.clear(); renderLayerPanel(); renderProps(); } };
  head.ondblclick = ev => { ev.stopPropagation(); openLayerStyleDialog(idx); };
  head.title = '双击 = 打开「图层样式」对话框';
  for (const e of items) {
    const r = mkRow(base + 42, master && e.on ? '' : 'off');
    r.dataset.attr = 'fx-row'; r.dataset.fx = e.key; r.dataset.at = String(e.at);
    r.append(mkEye(e.on, e.on ? '停用这条效果' : '启用这条效果', () => {
      
      if (e.isNew) setAddedFxParam(idx, e.canon, 'enab', !e.on, true, e.seq);
      else setSingleOp(idx, { op: 'setLayerEffect', index: idx, effect: e.key, at: e.at, enabled: !e.on }, !e.on === e.base);
    }));
    r.append(mkEl('span', { className: 'lfxname',
      textContent: e.label + (e.count > 1 ? ` ${e.at + 1}` : '') + (e.isNew ? '（新增）' : '') }));
    r.title = '双击 = 在「图层样式」对话框里编辑它';
    r.onclick = () => { if (selLayer !== idx) { selLayer = idx; selLayers.clear(); renderLayerPanel(); renderProps(); } };
    r.ondblclick = ev => { ev.stopPropagation(); openLayerStyleDialog(idx, e.key); };
  }
}








export const sfListOpenSet = new Map();                 
const sfListOpen = idx => (sfListOpenSet.has(idx) ? sfListOpenSet.get(idx) : true);   
const DEFORM_CLASS_KIND = { rigidTransform: 'puppetWarp', perspectiveWarpTransform: 'perspectiveWarp' };


export function smartFilterInfo(idx, load = true){
  const k = filterSoIndexOf(idx);
  if (k < 0) return null;
  const S = soFilters[k];
  if (!S && load) loadFilterList(k);                      
  const d = (S && S.state === 'ok' && S.data && S.data.present && Array.isArray(S.data.filters)) ? S.data : null;
  

  const e = soEdits[k];
  const pendingNew = e && e.deforms ? e.deforms.filter(x => x.create).map(x => x.deform)
                   : (e && e.deform && e.created ? [e.deform] : []);
  if (!d && !pendingNew.length) return null;
  const master = (soFilterEdits[k] && soFilterEdits[k].style && soFilterEdits[k].style.enabled !== undefined)
    ? soFilterEdits[k].style.enabled : (d && d.style ? d.style.enabled !== false : true);
  const filters = d ? d.filters.map(f => ({
    raw: f, index: f.index, on: effFilterEnabled(k, f), at: f.index,
    deform: f.owner === 'deform',
    kind: DEFORM_CLASS_KIND[f.classID] || null,
    label: f.nameSource === 'classID' ? f.classID : (f.displayName || f.name || f.classID),
  })) : [];
  for (const pd of pendingNew) filters.push({
    raw: { classID: pd.kind === 'puppetWarp' ? 'rigidTransform' : 'perspectiveWarpTransform',
           filterID: pd.kind === 'puppetWarp' ? 687 : 714, enabledEditable: false,
           note: '这条是本次新建的，导出时才写进 PSD；顶点 / 图钉在变形工具里改' },
    index: -1, on: true, deform: true, isNew: true, kind: pd.kind, at: null,
    label: (DEFORM_LABEL[pd.kind] || '变形') + '（新建）',
  });
  return { soIdx: k, master, busy: !!(S && S.busy), writable: !d || d.writable !== false, filters };
}

function appendSmartFilterRows(list, idx, vnode, info){
  const base = 6 + vnode.depth * 14;
  const k = info.soIdx;
  const mkRow = (pad, cls) => {
    const r = mkEl('div', { className: 'lfx' + (cls ? ' ' + cls : '') });
    r.style.paddingLeft = pad + 'px';
    r.dataset.layerIndex = String(idx);
    list.appendChild(r);
    return r;
  };
  const mkEye = (on, title, onClick, disabled) => {
    const e = mkEl('span', { className: 'eye' + (on ? '' : ' off') + (disabled ? ' lock' : ''), title });
    e.append(icon(on ? 'eye' : 'eye-off', 12));
    if (!disabled) e.onclick = ev => { ev.stopPropagation(); onClick(); renderLayerPanel(); renderProps(); };
    return e;
  };
  const lockWhy = info.writable ? '' : '这个智能对象的描述符块我们还原不了（前置探针没过），不敢改它的滤镜';
  
  const head = mkRow(base + 24, info.master ? '' : 'off');
  head.dataset.attr = 'sf-row-master';
  head.append(mkEye(info.master, lockWhy || '智能滤镜总开关（关掉这一层所有滤镜都不生效）', () => {
    const prev = soFilterEdits[k] ? JSON.parse(JSON.stringify(soFilterEdits[k])) : undefined;
    const e = soFilterEdits[k] || (soFilterEdits[k] = { style: {}, filters: {} });
    const want = !info.master;
    if (want === origStyleEnabled(k)) delete e.style.enabled; else e.style.enabled = want;   
    if (!Object.keys(e.style).length && !Object.keys(e.filters).length) delete soFilterEdits[k];
    pushFilterEdits(k, prev);
  }, !!lockWhy || info.busy));
  if (LX) LX.decorateFilterHead(head, idx, info);   
  head.append(mkEl('span', { className: 'lfxname', textContent: '智能滤镜' }));
  head.onclick = () => { if (selLayer !== idx) { selLayer = idx; selLayers.clear(); renderLayerPanel(); renderProps(); } };
  for (const f of info.filters.slice().reverse()) {      
    const r = mkRow(base + 42, info.master && f.on ? '' : 'off');
    r.dataset.attr = 'sf-row'; r.dataset.index = String(f.index);
    if (f.deform) r.dataset.deform = '1';
    

    
    const why = lockWhy || (f.isNew ? (f.raw.note || '这条是本次新建的，导出时才写进 PSD') : '');
    r.append(mkEye(info.master && f.on, why || (f.on ? '停用这条滤镜' : '启用这条滤镜'), () => {
      editFilter(k, f.index, q => {
        const of0 = origFilterOf(k, f.index);
        const next = !f.on;
        if (of0 && next === of0.enabled) delete q.enabled; else q.enabled = next;
      });
    }, !!why || info.busy || !f.raw.enabledEditable));
    r.append(mkEl('span', { className: 'lfxname', textContent: f.label }));
    r.title = f.deform
      ? `${f.label}（classID ${f.raw.classID} · filterID ${f.raw.filterID}）—— 双击进变形工具`
      : `${f.label}（classID ${f.raw.classID}）—— 参数在右侧「属性」面板里改`;
    r.onclick = () => { if (selLayer !== idx) { selLayer = idx; selLayers.clear(); renderLayerPanel(); renderProps(); } };
    
    if (f.deform && f.kind) r.ondblclick = ev => { ev.stopPropagation(); selLayer = idx; deformRun(f.kind, f.at); };
    
    else if (SFX && info.writable && !info.busy) SFX.decorateFilterRow(r, idx, f);
  }
}
