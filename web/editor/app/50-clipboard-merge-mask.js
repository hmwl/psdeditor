




import './49-fonts-text-model.js';   
import { compositeAll } from '../../../core/app.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy, selectionBounds, selectionToMaskGray, selectionValueAt } from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, layerDeletes, layerRenames, layerTree, li, maskPaint, origBuffer,
  selection, set_layerReorder, textCrops, textRenders,
} from './02-doc-state.js';
import { pushDocHistory, structuralBegin, structuralDone } from './03-history.js';
import {
  isBackgroundLayer, rasterKindOf, rasterizeLayerUI, renderLayerAlone, toggleLayerLock,
} from './05-layer-lock-guides.js';
import { paintMap } from './11-paint-common.js';
import { activeDocSubs } from './17-shape-pen.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
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



export function copyPixelsUI(merged){
  if (!doc || li || selLayer < 0) return false;
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


export async function pasteClipboardUI(mode){
  if (!doc || li) return false;
  if (!pixelClipboard) { $('#notice').textContent = '剪贴板是空的：先拷贝或剪切一些像素。'; return false; }
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
  if (!copyPixelsUI(false)) return false;
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
