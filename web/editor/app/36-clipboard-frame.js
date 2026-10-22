




import './35-artboard.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import { parsePsdFull, parsePsdRaster } from '../../../core/app.js';
import { layerIdsOf } from '../../../core/psd-links.js';
import { DOCS } from '../documents.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy, icon } from './01-boot.js';
import {
  brushHistory, doc, docH, docName, docStack, docW, layerDeletes, layerDupes, layerEdits, layerRenames,
  layerTree, li, origBuffer, textOverlay,
} from './02-doc-state.js';
import {
  docHistLock, histPush, set_docHistLock, set_uiQuiet, structuralApply, structuralBegin, structuralDone,
  uiQuiet, updateUndoButtons,
} from './03-history.js';
import {
  abPad, cropPad, fitStage, padL, padT, set_abPad, syncStagePad, viewH, viewHold, viewW, withViewHold,
} from './04-view-chrome.js';
import { isBackgroundLayer, rasterKindOf, unlockBackground } from './05-layer-lock-guides.js';
import { layerSelBBox, tfFrame } from './06-view-zoom-move.js';
import { resizeCanvas, transformableLayers } from './08-doc-size.js';
import { fontDisplayName } from './09-text-tool.js';
import { layerNameOf } from './13-quickmask-apply-image.js';
import { shapeLayerName, shapeRect } from './17-shape-pen.js';
import {
  builtIndexOf, dupTimer, duplicateLayerBlockUI, duplicateLayerUI, hasAnyEdits, refreshAll, set_dupPending,
} from './20-snap-smart-object.js';
import { decodeImageFile, initDocument } from './21-load-document.js';
import { layerCanvasCache, layerOrderView, selLayer, selLayers, set_selLayer, thumbCache } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import { convertBlocksToSmartObjectUI, convertToSmartObjectUI } from './26-layer-create.js';
import { ensureLayerTransform, getTransformValues, moveLayerTo, transformChanged } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import { ensureScratch, renderPreviewOnly, scratchCanvas } from './30-render.js';
import { docTool, hexOf, toolData, toolDataAPI, toolDataChanged } from './31-selection-brush.js';
import { dispPx } from './32-cursors-select-options.js';
import {
  AB_BG, AB_PRESETS, abBarSize, abGizmoOn, abNudgeState, abOpts, abPlusSpots, abPresetName, abSel, abSnap,
  abState, addArtboardBeside, artboardCache, artboardMembers, artboardOfLayer, artboardWriteWhy, docArtboards,
  set_abSel,
} from './35-artboard.js';
import { commitPixelPaint, ensurePixelPaint, sparsePixelHistory } from './38-brush-engine.js';
import { dispThr, drawGizmo } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import { buildPsdBuffer, ensureStructuralBase } from './48-info-export.js';
import { selFontPs } from './49-fonts-text-model.js';







export let layerClip = null;            
export function set_layerClip(v) { return (layerClip = v); }   
function layerIdAt(buf, i){
  try {
    const full = parsePsdFull(buf), L = full.layers[i]; if (!L) return null;
    const b = (L.blocks || []).find(x => x.key === 'lyid' && x.dataLength >= 4); if (!b) return null;
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return new DataView(u8.buffer, u8.byteOffset + b.dataOffset, 4).getUint32(0);
  } catch { return null; }
}
export function indexOfLayerId(id){
  if (id == null || !origBuffer) return -1;
  try {
    const full = parsePsdFull(origBuffer), u8 = origBuffer instanceof Uint8Array ? origBuffer : new Uint8Array(origBuffer);
    return full.layers.findIndex(L => { const b = (L.blocks || []).find(x => x.key === 'lyid' && x.dataLength >= 4);
      return b && new DataView(u8.buffer, u8.byteOffset + b.dataOffset, 4).getUint32(0) === id; });
  } catch { return -1; }
}



let lbIdsCache = { buf: null, ids: [] };
onDocumentCacheRelease(() => { lbIdsCache = { buf: null, ids: [] }; });
function lbFileIds(){
  if (lbIdsCache.buf !== origBuffer) { let ids = []; try { ids = origBuffer ? layerIdsOf(origBuffer) : []; } catch {} lbIdsCache = { buf: origBuffer, ids }; }
  return lbIdsCache.ids;
}
export function lbKeyOf(i){
  const N0 = doc ? doc.layers.length - layerDupes.length : 0, ids = lbFileIds();
  return i < N0 && ids[i] != null ? 'id:' + ids[i] : 'ix:' + i;
}
export function lbIndexOfKey(k){
  if (!doc || !k) return -1;
  const alive = i => i >= 0 && !!doc.layers[i] && !layerDeletes.has(i);
  if (k.startsWith('ix:')) { const i = +k.slice(3); return alive(i) ? i : -1; }
  const i = lbFileIds().indexOf(+k.slice(3));
  return alive(i) ? i : -1;
}

export function lbReplacePixels(idx, drawFn, opts = {}){
  if (!doc || !doc.layers[idx]) return false;
  const pp = ensurePixelPaint(idx); if (!pp) return false;
  const cv = document.createElement('canvas'); cv.width = pp.w; cv.height = pp.h;
  const g = cv.getContext('2d');
  drawFn(g, { x: 0, y: 0, w: pp.w, h: pp.h });
  const out = g.getImageData(0, 0, pp.w, pp.h).data;
  const base = Uint8ClampedArray.from(pp.rgba);
  const rect = { x: 0, y: 0, w: pp.w, h: pp.h };
  pp.rgba.set(out);
  if (!opts.noHistory) {                              
    brushHistory.undo.push(sparsePixelHistory(idx, base, out, pp.w, pp.h));
    if (brushHistory.undo.length > 40) brushHistory.undo.shift();
    brushHistory.redo.length = 0;
    histPush('替换像素（变量）', 'brush');
  }
  commitPixelPaint(idx); renderPreviewOnly(); updateUndoButtons();
  return true;
}

export function lbPixelBackup(idx){
  const pp = doc && doc.layers[idx] ? ensurePixelPaint(idx) : null; if (!pp) return () => {};
  const copy = Uint8ClampedArray.from(pp.rgba);
  return () => { pp.rgba.set(copy); commitPixelPaint(idx); delete layerCanvasCache[idx]; delete thumbCache[idx]; };
}

export function lbAddNotes(notes){
  if (!toolData || toolData.noteReadOnly || !notes.length) return 0;
  const list = toolData.annotations.annotations;
  toolDataChanged('annotations', '导入注释', () => {
    for (const n0 of notes) {
      const n = toolDataAPI.newNote(Math.round(Math.max(0, Math.min(docW - 1, n0.x))), Math.round(Math.max(0, Math.min(docH - 1, n0.y))), n0.text || '');
      n.text = n0.text || ''; n._textEnc ||= { bom: true, le: false };
      n.author = { s: String(n0.author || '').replace(/[^\u0000-ÿ]/g, '?').slice(0, 255), pad: 0 };
      const c = n0.color || [255, 214, 0]; n.color = { space: 0, components: c.map(v => v * 257).concat(0) };
      list.push(n);
    }
  });
  drawGizmo(); try { panels.show('notes'); } catch {}
  return notes.length;
}

export function lbFontList(){
  const out = new Map(), flat = (layerTree && layerTree.flat) || [];
  flat.forEach((L, i) => {
    if (!L || !L.text || layerDeletes.has(i)) return;
    const fonts = new Set([selFontPs(i), ...((L.text.fonts || []).map(f => f && (f.name || f)))].filter(Boolean));
    for (const ps of fonts) { if (!out.has(ps)) out.set(ps, { ps, name: fontDisplayName(ps) || ps, layers: [] }); out.get(ps).layers.push(layerNameOf(i)); }
  });
  return [...out.values()];
}
export function copyLayersUI(opts = {}){
  if (!doc || li || selLayer < 0) return false;
  const view = layerOrderView();
  let picks = [...new Set([selLayer, ...selLayers])].filter(i => i >= 0 && !layerDeletes.has(i) && view.nodes[i] && !view.nodes[i].divider);
  
  const inside = (i, g) => { let p = view.nodes[i] && view.nodes[i].parent; while (p != null) { if (p === g) return true; p = view.nodes[p] && view.nodes[p].parent; } return false; };
  picks = picks.filter(i => !picks.some(g => g !== i && inside(i, g)));
  if (!picks.length) return false;
  
  picks.sort((a, b) => view.visible.indexOf(a) - view.visible.indexOf(b));
  
  const N = doc.layers.length - layerDupes.length;
  if (picks.some(i => i >= N)) return false;
  const srcAb = artboardOfLayer(picks[0]);
  layerClip = { buf: origBuffer, docUid: DOCS.activeUid(), docW, docH, ids: picks, lyids: picks.map(i => layerIdAt(origBuffer, i)), ab: srcAb ? { ...srcAb.rect } : null,
    names: picks.map(i => layerRenames[i] || (layerTree.flat[i] || {}).name || '图层') };
  lastClipKind = 'layers';
  const msg = picks.length > 1 ? `已拷贝 ${picks.length} 个图层` : `已拷贝图层「${layerClip.names[0]}」`;
  if (opts.quiet) return true;                    
  $('#notice').textContent = msg; shell.status(msg + '（⌘V 粘贴 = 原样的图层，不栅格化）');
  return true;
}
export async function pasteLayersUI(mode){
  const c = layerClip; if (!c || !doc || li) return false;
  
  const src = c.ids.map((i, k) => c.buf === origBuffer ? i : indexOfLayerId(c.lyids[k]));
  if (src.some(i => i < 0)) { $('#notice').textContent = '拷贝的图层已经不在了（被删掉或换了文档）：没法按图层粘贴。'; return false; }
  if (!await ensureLazy(EDIT, '粘贴图层')) return false;
  if (textOverlay) closeInlineText(true);
  $('#err').textContent = '';
  const prev = structuralBegin();
  const lock = docHistLock;
  const targetSel = selLayer;
  try {
    set_docHistLock(true); set_dupPending({ prev }); set_uiQuiet(uiQuiet + 1);
    const targetAb = docArtboards().find(a => a.index === targetSel) || null;     
    const hostAb = targetAb || artboardOfLayer(targetSel);
    const copies = [];
    
    const order = targetAb ? [...src].reverse() : src;
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const node = layerOrderView().nodes[i];
      const cp = node && node.group ? duplicateLayerBlockUI(i) : duplicateLayerUI(i, { defer: true });
      if (cp < 0) throw new Error('有一层复制不出来');
      
      const Nn = doc.layers.length - layerDupes.length;
      const nm = c.names[c.ids.length === order.length ? (targetAb ? order.length - 1 - k : k) : k];
      if (layerDupes[cp - Nn]) layerDupes[cp - Nn].name = nm;
      if (layerTree.flat[cp]) layerTree.flat[cp].name = nm;
      if (targetAb) moveLayerTo(cp, targetAb.index, false, true);
      else if (targetSel >= 0 && targetSel !== i) moveLayerTo(cp, targetSel, false, false);
      copies.push(cp);
    }
    clearTimeout(dupTimer); set_dupPending(null);
    


    let dx = 0, dy = 0;
    const view0 = layerOrderView();
    const allIds = copies.flatMap(cp => view0.nodes[cp] && view0.nodes[cp].block ? view0.nodes[cp].block.ids : [cp]);
    if (hostAb && mode === 'inPlace') {
      if (c.ab) { dx = hostAb.rect.x - c.ab.x; dy = hostAb.rect.y - c.ab.y; }
    } else if (hostAb) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of allIds) { let bb = null; try { bb = layerSelBBox(i); } catch {} if (!bb || !(bb.w > 0)) continue;
        x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y); x1 = Math.max(x1, bb.x + bb.w); y1 = Math.max(y1, bb.y + bb.h); }
      if (Number.isFinite(x0)) { const t = hostAb.rect; dx = Math.round(t.x + (t.w - (x1 - x0)) / 2 - x0); dy = Math.round(t.y + (t.h - (y1 - y0)) / 2 - y0); }
    }
    if (dx || dy) {
      const view = layerOrderView();
      for (const cp of copies) for (const i of (view.nodes[cp] && view.nodes[cp].block ? view.nodes[cp].block.ids : [cp])) {
        if (!transformableLayers().includes(i)) continue;
        const t = ensureLayerTransform(i); t.x += dx; t.y += dy; transformChanged(i);
      }
    }
    const selAfter = copies.map(builtIndexOf);
    const built = await buildPsdBuffer({ fast: true });
    set_uiQuiet(Math.max(0, uiQuiet - 1));
    await initDocument(built.buf, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    const ok = selAfter.filter(i => i >= 0);
    set_selLayer(ok.length ? Math.min(ok[0], doc.layers.length - 1) : -1);
    for (const i of ok) if (i !== selLayer) selLayers.add(i);
    refreshAll(false);
    structuralDone(prev, '粘贴');
    const msg = `已粘贴${copies.length > 1 ? ` ${copies.length} 个图层` : `图层「${c.names[0]}」`}` + (hostAb ? `，放进「${hostAb.name}」` : '');
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    clearTimeout(dupTimer); set_dupPending(null); set_uiQuiet(0);
    try { structuralApply(prev); } catch {}
    $('#err').textContent = '粘贴图层没能完成：' + humanEditError(e && e.message || e);
    return false;
  } finally { set_docHistLock(lock); }
}
export let lastClipKind = null;         
export function set_lastClipKind(v) { return (lastClipKind = v); }   



export function abAutoGrowCanvas(rects){
  

  if (!abOpts.autoSize || !rects.length) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const q of rects) { l = Math.min(l, q.x); t = Math.min(t, q.y); r = Math.max(r, q.x + q.w); b = Math.max(b, q.y + q.h); }
  const hasBg = !!(layerTree && layerTree.flat && layerTree.flat.some((x, i) => isBackgroundLayer(i)));
  if (hasBg) { l = Math.min(l, 0); t = Math.min(t, 0); r = Math.max(r, docW); b = Math.max(b, docH); }
  l = Math.floor(l); t = Math.floor(t); r = Math.ceil(r); b = Math.ceil(b);
  if (l === 0 && t === 0 && r === docW && b === docH) return null;
  const W = r - l, H = b - t;
  if (W < 1 || H < 1 || W > 30000 || H > 30000) return null;
  const was = docHistLock; set_docHistLock(true);   
  

  if (l || t) for (const L of doc.layers) if (L && L.artboard && L.artboard.rect)
    L.artboard = { ...L.artboard, rect: { ...L.artboard.rect, x: L.artboard.rect.x - l, y: L.artboard.rect.y - t } };
  try { resizeCanvas(W, H, 0, null, { dx: -l, dy: -t }); } finally { set_docHistLock(was); }
  if (viewHold) viewHold.grow = { dx: (viewHold.grow ? viewHold.grow.dx : 0) - l, dy: (viewHold.grow ? viewHold.grow.dy : 0) - t };
  return { dx: -l, dy: -t };
}

export function syncArtboardPad(){
  const want = !li && doc && docArtboards().length > 0;
  let pad = null;
  if (want) { const m = Math.max(300, Math.round(Math.max(docW, docH) * 0.35)); pad = { l: m, t: m, r: m, b: m }; }
  const same = (!pad && !abPad) || (pad && abPad && pad.l === abPad.l);
  set_abPad(pad);
  if (!same && doc && docW) fitStage(false, { center: true }); else syncStagePad();
}

export function syncArtboardCheckers(){
  const st = $('#stage'); if (!st) return;
  const want = abPad && !cropPad ? docArtboards().filter(a => a.bgType === 3) : [];
  const old = [...st.querySelectorAll(':scope > .ab-checker')];
  while (old.length > want.length) old.pop().remove();
  const W = viewW(), H = viewH();
  want.forEach((a, k) => {
    let d = old[k];
    if (!d) { d = document.createElement('div'); d.className = 'ab-checker'; st.prepend(d); }
    d.style.left = ((padL() + a.rect.x) / W * 100) + '%'; d.style.top = ((padT() + a.rect.y) / H * 100) + '%';
    d.style.width = (a.rect.w / W * 100) + '%'; d.style.height = (a.rect.h / H * 100) + '%';
  });
}
export function abRectOp(index, rect, extra = {}){
  return { op: 'setArtboard', index, rect: { top: rect.y, left: rect.x, bottom: rect.y + rect.h, right: rect.x + rect.w }, ...extra };
}

function abShiftOthers(skipIndex, grow){
  if (!grow || (!grow.dx && !grow.dy)) return [];
  return docArtboards().filter(a => a.index !== skipIndex).map(a => abRectOp(a.index,
    { x: a.rect.x + grow.dx, y: a.rect.y + grow.dy, w: a.rect.w, h: a.rect.h },
    { presetName: a.presetName || undefined, color: a.color, backgroundType: a.bgType }));
}

export async function createArtboard(rect, bg = null){ return withViewHold(() => createArtboardRaw(rect, bg)); }
async function createArtboardRaw(rect, bg = null){
  const why = artboardWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  if (!await ensureLazy(EDIT, '新建画板')) return false;
  const n = docArtboards().length + 1;
  const name = `画板 ${n}`;
  const presetName = abPresetName(rect.w, rect.h);
  const bgType = bg ? bg.bgType : abOpts.bgType, color = bg ? bg.color : abOpts.color;
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    
    let wrapIds = null;
    if (!docArtboards().length) {
      if (isBackgroundLayer(0)) { const lk = docHistLock; set_docHistLock(true); try { unlockBackground(0); } finally { set_docHistLock(lk); } }
      const view = layerOrderView();
      wrapIds = view.visible.filter(k => view.nodes[k] && view.nodes[k].parent == null && !view.nodes[k].divider && !layerDeletes.has(k));
    }
    const others = docArtboards().map(a => a.rect);
    const grow = abAutoGrowCanvas([...others, rect]);
    const R = grow ? { ...rect, x: rect.x + grow.dx, y: rect.y + grow.dy } : rect;
    const wrapAt = wrapIds && wrapIds.length ? wrapIds.map(builtIndexOf).filter(i => i >= 0).sort((a, b) => a - b) : null;
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits() || grow) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    let r, header;
    if (wrapAt && wrapAt.length) {
      const r1 = applyEdits(base, [{ op: 'groupLayers', indices: wrapAt, name }]);
      header = (r1.results && r1.results[0] && r1.results[0].headerIndex) ?? wrapAt[wrapAt.length - 1] + 2;
      r = applyEdits(r1.buffer, [abRectOp(header, R, { presetName, color, backgroundType: bgType })]);
    } else {
      const at = doc.layers.length;                     
      header = at + 1;
      r = applyEdits(base, [
        ...abShiftOthers(-1, grow),
        { op: 'newGroup', at, name },
        abRectOp(at + 1, R, { presetName, color, backgroundType: bgType }),
      ]);
    }
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(Math.min(header, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, `新建画板「${name}」`);
    set_abSel(docArtboards().findIndex(a => a.index === selLayer));
    syncArtboardBar(); drawGizmo();
    shell.status(`新建画板「${name}」${R.w} × ${R.h} @${R.x},${R.y}` + (grow ? `（画布自动撑大到 ${docW} × ${docH}）` : ''));
    return true;
  } catch (e) {
    $('#err').textContent = '新建画板没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}

export async function writeArtboardRect(ab, rect, moved, bg = null){ return withViewHold(() => writeArtboardRectRaw(ab, rect, moved, bg)); }
async function writeArtboardRectRaw(ab, rect, moved, bg = null){
  const why = artboardWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  if (!await ensureLazy(EDIT, '调整画板')) return false;
  const sameRect = rect.x === ab.rect.x && rect.y === ab.rect.y && rect.w === ab.rect.w && rect.h === ab.rect.h;
  const sameBg = !bg || (bg.bgType === ab.bgType && (bg.bgType !== 4 || bg.color.every((v, k) => v === ab.color[k])));
  if (sameRect && sameBg) { drawGizmo(); return false; }
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    

    if (moved && (moved.dx || moved.dy)) {
      for (const i of artboardMembers(ab.index)) {
        if (!transformableLayers().includes(i)) continue;
        const t = ensureLayerTransform(i);
        t.x += moved.dx; t.y += moved.dy;
        transformChanged(i);
      }
    }
    const grow = sameRect ? null : abAutoGrowCanvas([...docArtboards().filter(a => a.index !== ab.index).map(a => a.rect), rect]);
    const R = grow ? { ...rect, x: rect.x + grow.dx, y: rect.y + grow.dy } : rect;
    const built = await buildPsdBuffer({ fast: true });
    const r = applyEdits(built.buf, [...abShiftOthers(ab.index, grow), abRectOp(ab.index, R, {
      presetName: sameRect ? (ab.presetName || undefined) : abPresetName(R.w, R.h),
      color: bg ? bg.color : ab.color, backgroundType: bg ? bg.bgType : ab.bgType })]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(Math.min(ab.index, doc.layers.length - 1));   
    refreshAll(false);
    const label = !sameBg && sameRect ? '画板背景颜色' : moved ? '移动画板' : '调整画板大小';
    structuralDone(prev, label);
    set_abSel(docArtboards().findIndex(a => a.index === ab.index));
    syncArtboardBar(); drawGizmo();
    shell.status(!sameBg && sameRect ? `画板「${ab.name}」背景改成${AB_BG.find(b => b[0] === bg.bgType)[1].replace('…', '')}`
      : moved ? `画板「${ab.name}」移到 ${R.x},${R.y}（组里的图层一起挪了）`
      : `画板「${ab.name}」改成 ${R.w} × ${R.h}` + (grow ? `（画布自动撑大到 ${docW} × ${docH}）` : ''));
    return true;
  } catch (e) {
    $('#err').textContent = '调整画板没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}



export async function abRelayoutByOrder(){ return withViewHold(() => abRelayoutByOrderRaw()); }
async function abRelayoutByOrderRaw(){
  const list = docArtboards(); if (list.length < 2 || artboardWriteWhy()) return false;
  if (!await ensureLazy(EDIT, '重排画板')) return false;
  const view = layerOrderView();
  
  const panel = list.slice().sort((a, b) => view.order.indexOf(a.index) - view.order.indexOf(b.index));
  
  const rects = list.map(a => a.rect).sort((p, q) => p.y - q.y), rows = [];
  for (const r of rects) {
    const row = rows.find(w => r.y < w.y1 && r.y + r.h > w.y0);
    if (row) { row.items.push(r); row.y1 = Math.max(row.y1, r.y + r.h); } else rows.push({ y0: r.y, y1: r.y + r.h, items: [r] });
  }
  const slots = rows.flatMap(w => w.items.sort((p, q) => p.x - q.x).map(r => ({ x: r.x, y: r.y })));
  const moves = panel.map((ab, k) => ({ ab, dx: slots[k].x - ab.rect.x, dy: slots[k].y - ab.rect.y })).filter(m => m.dx || m.dy);
  if (!moves.length) return false;
  try {
    const prev = structuralBegin();
    for (const m of moves) for (const i of artboardMembers(m.ab.index)) {
      if (!transformableLayers().includes(i)) continue;
      const t = ensureLayerTransform(i); t.x += m.dx; t.y += m.dy; transformChanged(i);
    }
    
    const mv = new Map(moves.map(m => [m.ab.index, m]));
    const nr = list.map(a => { const m = mv.get(a.index); return { ab: a, rect: m ? { ...a.rect, x: a.rect.x + m.dx, y: a.rect.y + m.dy } : { ...a.rect } }; });
    const grow = abAutoGrowCanvas(nr.map(q => q.rect));
    const ops = nr.filter(q => mv.has(q.ab.index) || grow).map(q => ({ q, at: builtIndexOf(q.ab.index) }));
    const built = await buildPsdBuffer({ fast: true });
    const r = applyEdits(built.buf, ops.map(({ q, at }) => abRectOp(at,
      grow ? { ...q.rect, x: q.rect.x + grow.dx, y: q.rect.y + grow.dy } : q.rect,
      { presetName: q.ab.presetName || undefined, color: q.ab.color, backgroundType: q.ab.bgType })));
    const selAfter = builtIndexOf(selLayer);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(Math.max(0, Math.min(selAfter, doc.layers.length - 1)));
    refreshAll(false);
    structuralDone(prev, '重排画板');
    set_abSel(docArtboards().findIndex(a => a.index === selLayer));
    syncArtboardBar(); drawGizmo();
    shell.status('画板按图层面板的次序重新排好了位置');
    return true;
  } catch (e) {
    $('#err').textContent = '重排画板没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}

export async function unmakeArtboardUI(){ return withViewHold(() => unmakeArtboardUIRaw()); }
async function unmakeArtboardUIRaw(){
  const ab = docArtboards()[abSel];
  if (!ab) { $('#notice').textContent = '先在画布上点一个画板。'; return false; }
  if (!await ensureLazy(EDIT, '取消画板')) return false;
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const r = applyEdits(base, [{ op: 'setArtboard', index: ab.index, remove: true }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    refreshAll(false);
    structuralDone(prev, '取消画板');
    set_abSel(-1);
    syncArtboardBar(); drawGizmo();
    shell.status(`「${ab.name}」不再是画板了（图层组还在）`);
    return true;
  } catch (e) {
    $('#err').textContent = '取消画板没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}

export async function makeArtboardFromGroupUI(){ return withViewHold(() => makeArtboardFromGroupUIRaw()); }
async function makeArtboardFromGroupUIRaw(){
  const L = layerTree && layerTree.flat && layerTree.flat.find(x => x.index === selLayer);
  if (!L || (L.groupType !== 1 && L.groupType !== 2)) { $('#notice').textContent = '先在图层面板里选中一个图层组。'; return false; }
  if (docArtboards().some(a => a.index === selLayer)) { $('#notice').textContent = '这个组已经是画板了。'; return false; }
  if (!await ensureLazy(EDIT, '来自图层组的画板')) return false;
  
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of artboardMembers(selLayer)) {
    let q = null;
    try { q = tfFrame(getTransformValues(i)).corners; } catch { q = null; }
    if (!q) continue;
    for (const p of q) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  }
  const rect = Number.isFinite(x0) && x1 > x0 && y1 > y0
    ? { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
    : { x: 0, y: 0, w: docW, h: docH };
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const r = applyEdits(base, [abRectOp(selLayer, rect, { presetName: abPresetName(rect.w, rect.h), color: abOpts.color, backgroundType: abOpts.bgType })]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    refreshAll(false);
    structuralDone(prev, '来自图层组的画板');
    set_abSel(docArtboards().findIndex(a => a.index === selLayer));
    syncArtboardBar(); drawGizmo();
    shell.status(`「${L.name}」变成画板了：${rect.w} × ${rect.h} @${rect.x},${rect.y}`);
    return true;
  } catch (e) {
    $('#err').textContent = '来自图层组的画板没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}




function topArtboardBlockOf(view, header){
  let h = header;
  while (view.nodes[h] && view.nodes[h].parent != null) h = view.nodes[h].parent;
  return h;
}
export function artboardAutoNest(indices){
  if (!abOpts.autoNest || li || !doc) return false;
  const list = docArtboards(); if (!list.length) return false;
  const heads = new Set(list.map(a => a.index));
  let changed = false;
  for (const i of indices) {
    if (i < 0 || heads.has(i) || layerDeletes.has(i)) continue;
    const view = layerOrderView(), node = view.nodes[i];
    if (!node || node.divider) continue;
    const b = layerSelBBox(i); if (!b || !(b.w > 0)) continue;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    
    let p = node.parent, cur = null;
    while (p != null) { if (heads.has(p)) { cur = p; break; } p = view.nodes[p] ? view.nodes[p].parent : null; }
    if (cur != null) {
      

      const a = list.find(q => q.index === cur);
      const hit = a && b.x < a.rect.x + a.rect.w && b.x + b.w > a.rect.x && b.y < a.rect.y + a.rect.h && b.y + b.h > a.rect.y;
      if (!hit) {
        
        const top = view.visible.find(k => view.nodes[k] && view.nodes[k].parent == null);
        const target = top != null && top !== i ? top : topArtboardBlockOf(view, cur);
        if (moveLayerTo(i, target, false, false)) changed = true;
      }
      continue;
    }
    
    const into = [...list].reverse().find(a => cx >= a.rect.x && cy >= a.rect.y && cx < a.rect.x + a.rect.w && cy < a.rect.y + a.rect.h);
    if (into && moveLayerTo(i, into.index, false, true)) changed = true;
  }
  if (changed) shell.status('自动嵌套：图层已随位置归入 / 移出画板');
  return changed;
}
export let abPending = null;            
export function set_abPending(v) { return (abPending = v); }   



export function abShownRect(ab){
  const g = viewHold && viewHold.grow && artboardCache.buf === viewHold.buf ? viewHold.grow : null;
  const off = r => (g && (g.dx || g.dy) ? { ...r, x: r.x + g.dx, y: r.y + g.dy } : r);
  if (abPending && abPending.buf === origBuffer && abPending.ab && abPending.ab.index === ab.index && abPending.kind !== 'dup')
    return off(abPending.to);
  return off(ab.rect);
}

export function abSnapshot(ab){
  try {
    ensureScratch();
    const src = scratchCanvas('#below'), r = ab.rect;
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(docW, Math.ceil(r.x + r.w)), y1 = Math.min(docH, Math.ceil(r.y + r.h));
    if (!(x1 > x0 && y1 > y0)) return null;
    const cv = document.createElement('canvas'); cv.width = x1 - x0; cv.height = y1 - y0;
    cv.getContext('2d').drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
    return { cv, x: x0, y: y0, bgType: ab.bgType, color: ab.color };
  } catch { return null; }
}

function drawArtboardLive(ctx){
  let pv = null;
  if (abState && abState.snap && abState.cur && (abState.kind === 'resize' || abState.moved))
    pv = { snap: abState.snap, kind: abState.alt ? 'dup' : abState.kind, from: abState.base, to: abState.cur };
  else if (abPending && abPending.buf === origBuffer) pv = abPending;   
  if (!pv) return;
  let { snap, from, to } = pv;
  
  const g = (viewHold && viewHold.grow) || null;
  if (g && (g.dx || g.dy) && abPending === pv) {
    from = { ...from, x: from.x + g.dx, y: from.y + g.dy }; to = { ...to, x: to.x + g.dx, y: to.y + g.dy };
    snap = { ...snap, x: snap.x + g.dx, y: snap.y + g.dy };
  }
  ctx.save();
  if (pv.kind !== 'dup') {                              
    let pb = '#262626'; try { pb = getComputedStyle($('#viewport')).backgroundColor || pb; } catch {}
    const e = dispPx(1.5);                                
    ctx.fillStyle = pb; ctx.fillRect(from.x - e, from.y - e, from.w + e * 2, from.h + e * 2);
  }
  ctx.beginPath(); ctx.rect(to.x, to.y, to.w, to.h); ctx.clip();
  if ((snap.bgType | 0) !== 3) {
    const c = snap.bgType === 2 ? [0, 0, 0] : snap.bgType === 4 && Array.isArray(snap.color) ? snap.color : [255, 255, 255];
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(to.x, to.y, to.w, to.h);
  }
  const dx = pv.kind === 'resize' ? 0 : to.x - from.x, dy = pv.kind === 'resize' ? 0 : to.y - from.y;
  try { ctx.drawImage(snap.cv, snap.x + dx, snap.y + dy); } catch {}
  ctx.restore();
}

export function drawArtboardGizmo(ctx){
  if (li || !doc) return;
  drawArtboardLive(ctx);                                  
  if (!abOpts.show) return;
  const list = docArtboards();
  if (!list.length && !abState) return;
  const abTool = abGizmoOn();
  ctx.save();
  ctx.lineWidth = dispPx(1);
  const fs = dispPx(12);
  ctx.font = `600 ${fs}px system-ui, -apple-system, "PingFang SC", sans-serif`;
  ctx.textBaseline = 'bottom';
  list.forEach((ab, i) => {
    const on = abSel === i && (abTool || selLayer === ab.index);
    let live = (abState && abSel === i && abState.cur) ? abState.cur : abShownRect(ab);
    if (abNudgeState && abNudgeState.ab.index === ab.index) live = { ...live, x: live.x + abNudgeState.dx, y: live.y + abNudgeState.dy };   
    ctx.setLineDash([]);
    ctx.strokeStyle = on ? 'rgba(49,140,255,1)' : 'rgba(120,120,120,.6)';
    ctx.lineWidth = dispPx(on ? 1.5 : 1);
    ctx.strokeRect(live.x, live.y, live.w, live.h);
    
    
    const ny = live.y - fs - dispPx(5) < -padT() ? live.y + fs + dispPx(4) : live.y - dispPx(5);
    const nx = live.x + (ny > live.y ? dispPx(4) : 0);
    ctx.fillStyle = on ? 'rgba(255,255,255,1)' : 'rgba(205,205,205,1)';
    try { ctx.fillText(ab.name, nx, ny); } catch {}
    ctx.lineWidth = dispPx(on ? 1.5 : 1);
    if (abState && abSel === i && abState.cur && (abState.kind === 'resize' || abState.moved)) abSizeBadge(ctx, live);
    if (abTool && abSel === i) {                         
      const t = dispThr(3);
      ctx.lineWidth = dispPx(1);
      for (const [hx, hy] of [[live.x, live.y], [live.x + live.w / 2, live.y], [live.x + live.w, live.y],
                              [live.x, live.y + live.h / 2], [live.x + live.w, live.y + live.h / 2],
                              [live.x, live.y + live.h], [live.x + live.w / 2, live.y + live.h], [live.x + live.w, live.y + live.h]]) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(49,140,255,1)';
        ctx.fillRect(hx - t, hy - t, t * 2, t * 2);
        ctx.strokeRect(hx - t, hy - t, t * 2, t * 2);
      }
    }
  });
  
  for (const s of abPlusSpots()) {
    const R = dispThr(11);
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
    if (s.solid) { ctx.fillStyle = 'rgba(40,40,40,.92)'; ctx.fill(); }
    ctx.lineWidth = dispPx(1.5); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();   
    ctx.lineWidth = dispPx(1.2); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - R * 0.5, s.y); ctx.lineTo(s.x + R * 0.5, s.y);
    ctx.moveTo(s.x, s.y - R * 0.5); ctx.lineTo(s.x, s.y + R * 0.5);
    ctx.lineWidth = dispPx(1.3); ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  if (abState && abState.kind === 'new' && abState.dragged) {
    const st = abState;
    const r = { x: Math.min(st.x0, st.x1), y: Math.min(st.y0, st.y1), w: Math.abs(st.x1 - st.x0), h: Math.abs(st.y1 - st.y0) };
    ctx.setLineDash([]);
    ctx.lineWidth = dispPx(1.5);
    ctx.strokeStyle = 'rgba(49,140,255,1)';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    abSizeBadge(ctx, r);
  }
  if (abSnap.length) {                            
    ctx.setLineDash([]); ctx.lineWidth = dispPx(1); ctx.strokeStyle = PREF.get('guides.smartColor') || 'rgba(255,0,170,.95)'; ctx.beginPath();
    const big = Math.max(docW, docH) * 4;
    for (const ln of abSnap) {
      if (ln.vertical) { ctx.moveTo(ln.px, -big); ctx.lineTo(ln.px, big); }
      else { ctx.moveTo(-big, ln.px); ctx.lineTo(big, ln.px); }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function abSizeBadge(ctx, r){
  const fs = dispPx(11), pad = dispPx(4);
  const txt = `宽：${Math.round(r.w)} 像素  高：${Math.round(r.h)} 像素`;
  let tw = txt.length * fs * 0.6;
  try { tw = ctx.measureText(txt).width; } catch {}
  const x = r.x + r.w / 2 - (tw + pad * 2) / 2, y = r.y + r.h + dispPx(8);   
  ctx.fillStyle = 'rgba(30,30,30,.9)';
  ctx.fillRect(x, y, tw + pad * 2, fs + pad * 2);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
  try { ctx.fillText(txt, x + pad, y + pad); } catch {}
  ctx.textBaseline = 'bottom';
}


export function abSelected(){
  const list = docArtboards();
  
  if (selLayer >= 0) { const k = list.findIndex(a => a.index === selLayer); if (k >= 0) set_abSel(k); }
  return abSel >= 0 ? list[abSel] : null;
}
export function abApplyToSelected(patch){
  const ab = abSelected(); if (!ab) { syncArtboardBar(); return false; }
  if (patch.w || patch.h) {
    const w = Math.max(1, Math.round(patch.w || ab.rect.w)), h = Math.max(1, Math.round(patch.h || ab.rect.h));
    return writeArtboardRect(ab, { x: ab.rect.x, y: ab.rect.y, w, h }, null);
  }
  if (patch.bgType) return writeArtboardRect(ab, { ...ab.rect }, null, { bgType: patch.bgType, color: patch.color || ab.color });
  return false;
}
export function syncArtboardBar(){
  const g = $('#grpArtboard'); if (!g) return;
  g.hidden = docTool !== 'artboard';
  if (g.hidden) return;
  if (!g.dataset.bound) bindArtboardBar(g);
  const why = artboardWriteWhy();
  const ab = why ? null : abSelected();
  
  let w, h, bgType, color, presetKey;
  const live = abState && abState.kind === 'new' && abState.dragged
    ? { w: Math.abs(abState.x1 - abState.x0), h: Math.abs(abState.y1 - abState.y0) }
    : abState && abState.cur ? abState.cur : null;
  if (ab) {
    w = Math.round((live || ab.rect).w); h = Math.round((live || ab.rect).h);
    bgType = ab.bgType; color = ab.color;
    const p = AB_PRESETS.find(q => q[2] === w && q[3] === h) || AB_PRESETS.find(q => q[2] === h && q[3] === w);
    presetKey = p ? p[0] : 'custom';
  } else {
    const s = live ? { w: Math.round(live.w), h: Math.round(live.h) } : abBarSize();
    w = s.w; h = s.h; bgType = abOpts.bgType; color = abOpts.color;
    presetKey = live ? 'custom' : abOpts.preset;
  }
  const sel = $('#abPreset'); if (sel && document.activeElement !== sel) sel.value = presetKey;
  const iw = $('#abW'), ih = $('#abH');
  if (iw && document.activeElement !== iw) iw.value = w;
  if (ih && document.activeElement !== ih) ih.value = h;
  const pt = $('#abPortrait'), ls = $('#abLandscape');
  if (pt) pt.classList.toggle('cur', h >= w);
  if (ls) ls.classList.toggle('cur', w > h);
  const bs = $('#abBg'); if (bs) bs.value = String(bgType);
  const bc = $('#abBgColor');
  if (bc) { bc.value = hexOf(bgType === 2 ? [0, 0, 0] : bgType === 4 ? color : [255, 255, 255]); bc.hidden = bgType !== 4; }
  for (const id of ['#abPreset', '#abW', '#abH', '#abSwap', '#abPortrait', '#abLandscape', '#abBg', '#abBgColor', '#abAdd'])
    { const el = $(id); if (el) el.disabled = id === '#abAdd' ? !!why : !!doc && !!why; }
  const info = $('#abInfo');
  if (info) {
    info.textContent = why ? why : ab ? `「${ab.name}」` : '';
    info.title = why || (ab ? `选中的画板：${ab.name}（改上面的值立即作用到它；点画布空白处取消选中）`
      : '没有选中画板：上面是下一块新画板的尺寸与背景。空白处拖 = 按框新建，单击 = 按这里的尺寸新建');
  }
}

export const AB_BAR_ICONS = {
  abAdd: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAABKElEQVR42u1Xy22DQBScQbtIkVKGS0gbOXGJC0gPlOBSfHENNBApDdAFSJFYdp8vYCGy8oefV5gpgDfMm5kHxA2IyA8AkPzAjBARAECEwLAR2giNBUMhEmzKVNsz/6RrekdEjgB2E8481XV90FrLUA/tJhYhUUql1loO8lBHwU8A5Qgi2TWlWg+pBx5YkizGmranFJxzhyiKJJTYJyRT5xxD6qGEZBpaMSbPIPR7Vw/N0LhHADDG7OM4lk6vfYvIm2dmNhuhqqrY9pbW+h1A0Svbv1vpm3RlXUVWc+3VRJ7xnZess46c5NdrKmSM2TcG7qfmcvusteVihBojF57UDLp961uZB/mja5qV0L1p2n6DXrKpM89n6FMUyhcQ5jKDS7z1ZupVEzoD37R0re2zHiMAAAAASUVORK5CYII=', 18, '添加新画板'],
  abLandscape: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAA3UlEQVR42u1XwQ3DIAy0a+fXMTJC1+iLVzdhhIzST2foAhmBLZIfltwPlaqqqUiUEFr5XnyA4/AdGFUVasIBKkN1hCahqr2q9qXXtSv7nxoyJOB7xSPiKbnhCgDtCnvcRKRrmkanXJdbQ+1Kh3bM7GOMmKXQt7xIwzMAjAuI3Oco9QRnLDwi4rAgAD8pBSLSMbPWYntHRF5EsKYcckTkawtGtwehsGQSb8VGRC7MfMxwXxlCyd5DhvvstTdCRqgoeOo/9JobWzaTc/5DYUMhAhisc7Uc2rEvM4V+itADIp9qMSxACvQAAAAASUVORK5CYII=', 18, '制作横版'],
  abPortrait: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAABAklEQVR42u1YwQ2DMAy0E/PrGIzAGn3x6iaMwCj9dAYWYAS2gKct90OlCFFI2tAGKfdDEHN27pI4qKqQEsh9QMTVj1S1n99Xn/xkb7xbFAOJIRPaA7rz905DRyNpDeHC9v3CddWcwR0AyoC4D2Zui6LQLdc5qEIrVAYmWhNRw8x4iIacjK4AMG3E65aVEpGWiNRXQxSYwISIo0/gV6WstSAirbVWU7F9bYxpRARTWodqY0yT2sJY/4PQEHW3/xbMfCOii4f7fkNoXghHD/fl3T4TyoQyoUzotIRo66y70ml2MVrvGGfqIULyXjFyXxZF1Krar8x7kGZ8x2fbn/v2IwU8AampeHU9z8e1AAAAAElFTkSuQmCC', 18, '制作纵版'],
  abGear: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAABZElEQVR42u2WzXHCMBBG33pyxAWQAtwALoDcQwMpgBRAHS6AFEADcA8FkAJCAVAAvm8u6xlZyLKFM7nE34zH+llp5fWTVjDp30tVK1U92VP9wnyoKtkA27yjPEpPzkpyYGPVSkRuPStPsvclzkQ7oLBqDeyBJTD3xlyBI7ACZtZ2FpG3oaH2HZ/GhE5EyhTH7j/+GOE3eax4q9kHQgtwtncR6LuKyCqF6hBcvtMa2IjIl9ksgMr5twBzVc2T4VLVpX3JM/Dq9b83Tp0FLoCtZ3cALgbZcRBcEag6SfV2QBJkIbj+VJkDjq/Cwkog1EVXlB45QHLg8wG4AF6GwnVHtYjcVPXgATYDtqoa206HVKJbjiMTx9r7+jpPxMwxWPdNEmFhnXiUllkk5dWWEAgkiTqSOvucl3dpTlV3TcI32HDaTrZ/G9vmgrBrbFMuAi24gNCBUftls92M3cd9+u4oT5o0qaUfewvTDPjtxxMAAAAASUVORK5CYII=', 15, '设置其它画板选项'],
};
function bindArtboardBar(g){
  g.dataset.bound = '1';
  for (const [id, [src, px, title]] of Object.entries(AB_BAR_ICONS)) {
    const b = $('#' + id); if (!b) continue;
    const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; img.alt = title;
    img.style.cssText = 'display:block;pointer-events:none';
    b.replaceChildren(img); b.title = title;
  }
  const sel = $('#abPreset');
  if (sel) {
    sel.innerHTML = '';
    sel.append(Object.assign(document.createElement('option'), { value: 'custom', textContent: '自定' }));
    const groups = new Map();
    for (const p of AB_PRESETS) {
      if (!p[2]) continue;
      let og = groups.get(p[4]);
      if (!og) { og = Object.assign(document.createElement('optgroup'), { label: p[4] }); groups.set(p[4], og); sel.append(og); }
      og.append(Object.assign(document.createElement('option'), { value: p[0], textContent: `${p[1]}（${p[2]} × ${p[3]}）` }));
    }
    sel.addEventListener('change', () => {
      const p = AB_PRESETS.find(q => q[0] === sel.value);
      abOpts.preset = sel.value;
      if (p && p[2]) { abOpts.w = p[2]; abOpts.h = p[3]; if (abSelected()) abApplyToSelected({ w: p[2], h: p[3] }); }
      syncArtboardBar(); sel.blur();
    });
  }
  const num = (id, key) => {
    const el = $(id); if (!el) return;
    el.addEventListener('change', () => {
      const v = Math.max(1, Math.min(30000, Math.round(+el.value || 0)));
      if (!v) { syncArtboardBar(); return; }
      abOpts.preset = 'custom';
      const cur = abSelected() ? { w: abSelected().rect.w, h: abSelected().rect.h } : abBarSize();
      abOpts.w = key === 'w' ? v : cur.w; abOpts.h = key === 'h' ? v : cur.h;
      if (abSelected()) abApplyToSelected({ w: abOpts.w, h: abOpts.h });
      syncArtboardBar();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } e.stopPropagation(); });
  };
  num('#abW', 'w'); num('#abH', 'h');
  const orient = want => {                       
    const ab = abSelected();
    const cur = ab ? { w: ab.rect.w, h: ab.rect.h } : abBarSize();
    const portrait = cur.h >= cur.w;
    if (want === 'portrait' && portrait) return;
    if (want === 'landscape' && !portrait) return;
    abOpts.w = cur.h; abOpts.h = cur.w;
    if (AB_PRESETS.some(q => q[0] === abOpts.preset && q[2])) abOpts.preset = 'custom';
    if (ab) abApplyToSelected({ w: cur.h, h: cur.w });
    syncArtboardBar();
  };
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('#abSwap', () => orient('swap'));
  on('#abPortrait', () => orient('portrait'));
  on('#abLandscape', () => orient('landscape'));
  const bs = $('#abBg');
  if (bs) {
    bs.innerHTML = '';
    for (const [v, label] of AB_BG) bs.append(Object.assign(document.createElement('option'), { value: String(v), textContent: label }));
    bs.addEventListener('change', () => {
      const t = +bs.value;
      abOpts.bgType = t;
      if (t === 4) { const bc = $('#abBgColor'); if (bc) { bc.hidden = false; try { bc.click(); } catch {} } }
      if (abSelected()) abApplyToSelected({ bgType: t, color: abOpts.color });
      syncArtboardBar(); bs.blur();
    });
  }
  const bc = $('#abBgColor');
  if (bc) bc.addEventListener('change', () => {
    const c = hexToRgbArr(bc.value);
    abOpts.color = c; abOpts.bgType = 4;
    if (abSelected()) abApplyToSelected({ bgType: 4, color: c });
    syncArtboardBar();
  });
  on('#abAdd', () => addArtboardBeside('right', abSelected() ? null : abBarSize()));
  on('#abGear', e => {
    const why = artboardWriteWhy();
    const L = layerTree && layerTree.flat && layerTree.flat.find(x => x.index === selLayer);
    const canFromGroup = !why && !!L && (L.groupType === 1 || L.groupType === 2) && !docArtboards().some(a => a.index === selLayer);
    const ab = why ? null : abSelected();
    const toggle = k => () => { abOpts[k] = !abOpts[k]; drawGizmo(); syncArtboardBar(); };
    panels.popup([
      { label: '自动嵌套图层', checked: abOpts.autoNest, run: toggle('autoNest') },
      { label: '启用对齐', checked: abOpts.snap, run: toggle('snap') },
      { label: '自动调整画布大小', checked: abOpts.autoSize, run: toggle('autoSize') },
      { label: '在重新排序时保持相对位置', checked: abOpts.keepRel, run: toggle('keepRel') },
      { label: '显示画板名称与边框', checked: abOpts.show, run: toggle('show') },
      { sep: true },
      { label: '来自图层组的画板', disabled: !canFromGroup, run: () => makeArtboardFromGroupUI() },
      { label: ab ? `取消画板「${ab.name}」` : '取消画板', disabled: !ab, run: () => unmakeArtboardUI() },
    ], e.currentTarget.getBoundingClientRect());
  });
}



let abLinkWH = false;
export function renderArtboardProps(ab, { mk }){
  const why = artboardWriteWhy();
  const box = $('#props');
  const wrap = mk('div', { className: 'ab-props' });
  wrap.dataset.primary = 'true'; wrap.dataset.propPane = 'layer';
  const field = (label, key) => {
    const f = mk('label', { className: 'ab-f' });
    const i = mk('input', { type: 'text', value: `${Math.round(ab.rect[key])} 像素`, disabled: !!why });
    i.onfocus = () => { i.value = String(Math.round(ab.rect[key])); i.select(); };
    i.onblur = () => { if (!i.dataset.done) i.value = `${Math.round(ab.rect[key])} 像素`; };
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); if (e.key === 'Escape') { i.value = String(Math.round(ab.rect[key])); i.blur(); } };
    i.onchange = () => {
      const v = Math.round(parseFloat(i.value)); if (!Number.isFinite(v)) return;
      if ((key === 'w' || key === 'h') && v < 1) return;
      const r = { ...ab.rect };
      if (v === Math.round(r[key])) return;
      r[key] = v;
      if (abLinkWH && key === 'w') r.h = Math.max(1, Math.round(ab.rect.h * v / ab.rect.w));
      if (abLinkWH && key === 'h') r.w = Math.max(1, Math.round(ab.rect.w * v / ab.rect.h));
      i.dataset.done = '1';
      const moved = key === 'x' || key === 'y' ? { dx: r.x - ab.rect.x, dy: r.y - ab.rect.y } : null;
      writeArtboardRect(ab, r, moved);
    };
    f.append(mk('span', { textContent: label + ':' }), i);
    return f;
  };
  const g = mk('div', { className: 'ab-grid' });
  const link = mk('button', { type: 'button', className: 'ab-link' + (abLinkWH ? ' on' : ''), title: '链接宽度和高度（等比）' });
  link.append(icon('link', 14));
  link.onclick = () => { abLinkWH = !abLinkWH; link.classList.toggle('on', abLinkWH); };
  g.append(field('W', 'w'), link, field('H', 'h'), field('X', 'x'), mk('span'), field('Y', 'y'));
  wrap.append(g, mk('hr', { className: 'ab-hr' }));
  
  wrap.append(mk('div', { className: 'ab-cap', textContent: '将画板设置为预设:' }));
  const presetSel = mk('select', { className: 'ab-sel', disabled: !!why });
  const fileName = ab.presetName && !/^自定/.test(ab.presetName) ? ab.presetName : '';
  const cur = AB_PRESETS.find(q => q[2] && ((q[2] === ab.rect.w && q[3] === ab.rect.h) || (q[3] === ab.rect.w && q[2] === ab.rect.h)));
  presetSel.append(mk('option', { value: 'custom', textContent: '自定' }));
  if (fileName && !cur) presetSel.append(mk('option', { value: 'file', textContent: fileName }));
  const groups = new Map();
  for (const p of AB_PRESETS) {
    if (!p[2]) continue;
    let og = groups.get(p[4]);
    if (!og) { og = mk('optgroup', { label: p[4] }); groups.set(p[4], og); presetSel.append(og); }
    og.append(mk('option', { value: p[0], textContent: `${p[1]}（${p[2]} × ${p[3]}）` }));
  }
  presetSel.value = cur ? cur[0] : fileName ? 'file' : 'custom';
  presetSel.onchange = () => {
    const p = AB_PRESETS.find(q => q[0] === presetSel.value); if (!p || !p[2]) return;
    writeArtboardRect(ab, { ...ab.rect, w: p[2], h: p[3] }, null);
  };
  wrap.append(presetSel);
  
  wrap.append(mk('div', { className: 'ab-cap', textContent: '画板背景颜色:' }));
  const bgRow = mk('div', { className: 'ab-bgrow' });
  const sw = mk('input', { type: 'color', className: 'ab-sw', value: hexOf(ab.bgType === 2 ? [0, 0, 0] : ab.bgType === 4 ? ab.color : [255, 255, 255]),
    disabled: !!why, title: '自定背景颜色（选了就是「其它」）' });
  if (ab.bgType === 3) sw.classList.add('transparent');
  const bg = mk('select', { className: 'ab-sel', disabled: !!why });
  for (const [v, label] of AB_BG) bg.append(mk('option', { value: String(v), textContent: label.replace('…', '') }));
  bg.value = String(ab.bgType);
  bg.onchange = () => { const t = +bg.value; writeArtboardRect(ab, { ...ab.rect }, null, { bgType: t, color: t === 4 ? hexToRgbArr(sw.value) : ab.color }); };
  sw.onchange = () => writeArtboardRect(ab, { ...ab.rect }, null, { bgType: 4, color: hexToRgbArr(sw.value) });
  bgRow.append(sw, bg);
  wrap.append(bgRow);
  box.append(wrap);
}
function hexToRgbArr(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}





export const frameOpts = { kind: 'rect' };
export let frameState = null;
export function set_frameState(v) { return (frameState = v); }
export function frameWhy(){
  if (!doc) return '先打开一个文档';
  if (li) return '正在编辑智能对象：先退回文档视图';
  if (doc.mode !== 3 || doc.depth !== 8) return '原生图框当前支持 RGB/8 文档';
  return '';
}
const frameMeta = i => doc?.layers[i]?.frame || layerTree?.flat[i]?.frame || null;
function frameParent(i){
  const view = layerOrderView();
  for (let p = view.nodes[i]?.parent; p != null; p = view.nodes[p]?.parent) if (frameMeta(p)) return p;
  return -1;
}

export function frameRectOfLayer(i){
  const p = frameMeta(i) ? i : frameParent(i);
  const f = p >= 0 ? frameMeta(p) : null;
  return f?.rect ? { ...f.rect, index: p } : null;
}
function selectedFrame(){
  return frameMeta(selLayer) ? selLayer : selLayer >= 0 ? frameParent(selLayer) : -1;
}
function fileIndexOfId(buffer, id){
  const full = parsePsdFull(buffer), bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return full.layers.findIndex(l => { const b = l.blocks.find(b => b.key === 'lyid');
    return b && new DataView(bytes.buffer, bytes.byteOffset + b.dataOffset, 4).getUint32(0) === id; });
}
function frameDivider(full, header){
  let depth = 0;
  for (let i = header; i >= 0; i--) {
    const type = full.layers[i].groupType;
    if (type === 1 || type === 2) depth++;
    else if (type === 3 && --depth === 0) return i;
  }
  throw new Error('图框组结构不完整');
}
async function frameStructural(label, work, initialPrev = null){
  const why = frameWhy();
  if (why) { $('#notice').textContent = why; return false; }
  if (!await ensureLazy(EDIT, label)) return false;
  if (textOverlay) closeInlineText(true);
  const prev = initialPrev || structuralBegin(), name = docName, nested = docStack.length > 0;
  $('#err').textContent = '';
  try {
    const mapping = doc.layers.map((_, i) => builtIndexOf(i));
    const built = hasAnyEdits() ? await buildPsdBuffer({ fast: true }) : null;
    let base = built ? built.buf : origBuffer;
    base = applyEdits(base, [{ op: 'ensureLayerIds' }]).buffer;
    const result = await work(base, i => mapping[i]);
    if (!result) return false;
    await initDocument(result.buffer, name, { nested });
    selLayers.clear(); set_selLayer(result.sel == null ? -1 : result.sel);
    refreshAll(false); structuralDone(prev, label); syncFrameBar();
    if (result.message) shell.status(result.message);
    return true;
  } catch (e) {
    structuralApply(prev); refreshAll(false);
    $('#err').textContent = label + '没能完成：' + humanEditError(e?.message || e);
    return false;
  }
}

export async function setFrameRectUI(idx, rect){
  if (!frameMeta(idx)) return false;
  return frameStructural('修改图框', async (base, map) => {
    const index = map(idx), result = applyEdits(base, [{ op: 'setFrameRect', index, rect }]);
    return { buffer: result.buffer, sel: index };
  });
}

export async function setFrameStrokeUI(idx, values){
  if (!frameMeta(idx)) return false;
  return frameStructural('修改图框描边', async (base, map) => {
    const index = map(idx);
    const result = applyEdits(base, [{ op: 'setVectorStroke', index, values }]);
    return { buffer: result.buffer, sel: index, message: '已修改图框描边' };
  });
}
async function ensureFrameContentSmart(base, index){
  const layer = parsePsdFull(base).layers[index];
  if (layer.placedBlocks?.length) return base;
  const raster = await parsePsdRaster(base), pixels = raster.layers[index];
  if (!pixels?.rgba || !(pixels.width > 0 && pixels.height > 0)) throw new Error('这个图层没有可置入图框的图像内容');
  return applyEdits(base, [{ op: 'convertToSmartObject', index,
    source: { data: pixels.rgba, width: pixels.width, height: pixels.height } }]).buffer;
}
function clearFrameContents(base, frameId, keepId = null){
  let header = fileIndexOfId(base, frameId), full = parsePsdFull(base), divider = frameDivider(full, header);
  for (let i = header - 1; i > divider;) {
    if (layerIdAt(base, i) === keepId) { i--; continue; }
    const count = full.layers.length;
    base = applyEdits(base, [{ op: 'deleteLayer', index: i }]).buffer;
    full = parsePsdFull(base); header = fileIndexOfId(base, frameId); divider = frameDivider(full, header);
    i -= count - full.layers.length;
  }
  return base;
}
function moveContent(base, childId, frameId, inside){
  const child = fileIndexOfId(base, childId), frame = fileIndexOfId(base, frameId);
  if (child < 0 || frame < 0) throw new Error('图框或内容图层已不存在');
  const order = parsePsdFull(base).layers.map((_, i) => i).filter(i => i !== child);
  order.splice(order.indexOf(frame) + (inside ? 0 : 1), 0, child);
  base = applyEdits(base, [{ op: 'setLayerProps', index: child, clipping: false }, { op: 'reorderLayers', order }]).buffer;
  return { buffer: base, sel: fileIndexOfId(base, childId) };
}
export function frameDown(ev, pt){
  const why = frameWhy(); if (why) { $('#notice').textContent = why; return; }
  frameState = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, shift: !!ev?.shiftKey, alt: !!ev?.altKey };
  drawGizmo();
}
export function frameMove(ev, pt){
  if (!frameState) return;
  Object.assign(frameState, { x1: pt.x, y1: pt.y, shift: !!ev?.shiftKey, alt: !!ev?.altKey }); drawGizmo();
}
function frameContentCandidate(idx, rect){
  const layer = doc?.layers[idx], metadata = layerTree?.flat[idx];
  if (!layer || isBackgroundLayer(idx) || metadata?.groupType != null || frameParent(idx) >= 0 || layer.frame) return false;
  const kind = rasterKindOf(idx); if (kind && kind !== 'smart') return false;
  const b = layerSelBBox(idx);
  return !!(b?.w > 0 && b.h > 0 && b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y);
}
export async function frameUp(){
  const state = frameState; frameState = null; drawGizmo(); if (!state) return false;
  const rect = shapeRect(state);
  if (!(rect.w >= 1 && rect.h >= 1)) return false;
  const selected = selLayer, content = frameContentCandidate(selected, rect) ? selected : -1;
  const shape = frameOpts.kind, name = shapeLayerName(shape === 'ellipse' ? '椭圆图框' : '图框');
  return frameStructural('新建图框', async (base, map) => {
    const source = content >= 0 ? map(content) : -1;
    const at = source >= 0 ? source : selected >= 0 && map(selected) >= 0 ? map(selected) + 1 : parsePsdFull(base).layers.length;
    const childId = source >= 0 ? layerIdAt(base, source) : null;
    const result = applyEdits(base, [{ op: 'addFrameLayer', at, name, rect, shape }]);
    base = result.buffer; const frameId = layerIdAt(base, result.results[0].headerIndex);
    if (childId != null) {
      base = await ensureFrameContentSmart(base, fileIndexOfId(base, childId));
      base = moveContent(base, childId, frameId, true).buffer;
    }
    return { buffer: base, sel: fileIndexOfId(base, frameId), message: childId == null ? `已新建${shape === 'ellipse' ? '椭圆' : '矩形'}图框` : '已新建图框并将图层转换为框内智能对象' };
  });
}

export async function createFrameFromLayerUI(idx = selLayer, name = null){
  if (frameWhy() || !doc?.layers[idx] || frameMeta(idx) || layerTree?.flat[idx]?.groupType === 3 || !await ensureLazy(EDIT, '来自图层的画框')) return false;
  const originalName = layerRenames[idx] || layerTree?.flat[idx]?.name || doc.layers[idx].name || '图层';
  const frameName = name || `${originalName} 画框`, prev = structuralBegin();
  const multiple = selLayers.size > 1 && selLayers.has(idx), group = layerTree?.flat[idx]?.groupType != null;
  if (multiple || group || (rasterKindOf(idx) && rasterKindOf(idx) !== 'smart')) {
    const converted = multiple || group
      ? await convertBlocksToSmartObjectUI(idx, { quiet: true, multi: multiple })
      : await convertToSmartObjectUI(idx, { quiet: true });
    if (!converted) { structuralApply(prev); refreshAll(false); return false; }
    idx = selLayer;
  }
  const rect = layerSelBBox(idx);
  if (!(rect?.w > 0 && rect.h > 0)) { structuralApply(prev); refreshAll(false); return false; }
  return frameStructural('来自图层的画框', async (base, map) => {
    const source = map(idx), childId = layerIdAt(base, source);
    const result = applyEdits(base, [{ op: 'addFrameLayer', at: source, name: frameName, rect, shape: 'rect' }]);
    base = result.buffer; const frameId = layerIdAt(base, result.results[0].headerIndex);
    base = await ensureFrameContentSmart(base, fileIndexOfId(base, childId));
    base = moveContent(base, childId, frameId, true).buffer;
    return { buffer: base, sel: fileIndexOfId(base, frameId), message: `已将内容放入「${frameName}」` };
  }, prev);
}
function frameVisible(i, view = layerOrderView()){
  for (let p = i; p != null; p = view.nodes[p]?.parent) {
    const visible = layerEdits[p]?.visible ?? !doc?.layers[p]?.hidden;
    if (!visible || layerDeletes.has(p)) return false;
  }
  return true;
}
export function frameAt(pt){
  if (!doc) return -1;
  const order = displayOrder(), view = layerOrderView();
  for (let k = order.length - 1; k >= 0; k--) {
    const index = order[k], frame = frameMeta(index), b = frame?.rect;
    if (!b || !frameVisible(index, view) || pt.x < b.x || pt.y < b.y || pt.x > b.x + b.w || pt.y > b.y + b.h) continue;
    if (frame.shape === 'ellipse' && ((pt.x - b.x - b.w / 2) / (b.w / 2)) ** 2 + ((pt.y - b.y - b.h / 2) / (b.h / 2)) ** 2 > 1) continue;
    return index;
  }
  return -1;
}

export async function placeImageInFrame(fi, file){
  const frame = frameMeta(fi); if (!frame) return false;
  let bitmap; try { bitmap = await decodeImageFile(file); } catch { bitmap = null; }
  if (frameMeta(fi) !== frame) return false;
  if (!bitmap?.width || !bitmap.height) { $('#notice').textContent = '这张图片解不开。'; return false; }
  const original = document.createElement('canvas'); original.width = bitmap.width; original.height = bitmap.height;
  original.getContext('2d').drawImage(bitmap, 0, 0);
  const source = { data: original.getContext('2d').getImageData(0, 0, original.width, original.height).data, width: original.width, height: original.height };
  const fb = frame.rect, scale = Math.max(fb.w / source.width, fb.h / source.height);
  const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
  const x = Math.round(fb.x + (fb.w - w) / 2), y = Math.round(fb.y + (fb.h - h) / 2);
  const cache = document.createElement('canvas'); cache.width = w; cache.height = h;
  const context = cache.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h).data, name = (file.name || '图像').replace(/\.[^.]+$/, '') || '图像';
  return frameStructural('置入图框', async (base, map) => {
    const id = layerIdAt(base, map(fi)); base = clearFrameContents(base, id);
    const at = fileIndexOfId(base, id), bounds = { left: x, top: y, right: x + w, bottom: y + h };
    const result = applyEdits(base, [
      { op: 'createLayer', at, name },
      { op: 'replaceLayerPixels', index: at, rgba: { data: pixels, width: w, height: h }, bounds },
      { op: 'convertToSmartObject', index: at, source, bounds },
      { op: 'setLayerProps', index: at, clipping: false },
    ]);
    return { buffer: result.buffer, sel: at, message: `已将「${name}」置入图框` };
  });
}
function placeIntoFrameUI(){
  const fi = selectedFrame(); if (fi < 0) { $('#notice').textContent = '先选中图框或框内内容'; return false; }
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => { const file = input.files?.[0]; if (file) placeImageInFrame(fi, file); }; input.click(); return true;
}
export function frameBelow(idx){
  if (!doc || idx == null || idx < 0) return -1;
  const parent = frameParent(idx); if (parent >= 0) return parent;
  for (let i = idx - 1; i >= 0; i--) if (frameMeta(i)) return i;
  return -1;
}
export async function putIntoFrameUI(){
  const child = selLayer, fi = frameBelow(child);
  if (child < 0 || fi < 0 || frameMeta(child) || frameParent(child) >= 0 || layerTree?.flat[child]?.groupType != null || isBackgroundLayer(child)) return false;
  const kind = rasterKindOf(child); if (kind && kind !== 'smart') { $('#notice').textContent = '请选中像素图层或智能对象'; return false; }
  return frameStructural('放进图框', async (base, map) => {
    const id = layerIdAt(base, map(child)), frameId = layerIdAt(base, map(fi));
    base = await ensureFrameContentSmart(base, fileIndexOfId(base, id));
    base = clearFrameContents(base, frameId, id);
    return { ...moveContent(base, id, frameId, true), message: '已放进图框' };
  });
}
export async function takeOutOfFrameUI(){
  const child = selLayer, parent = frameParent(child); if (child < 0 || parent < 0) return false;
  return frameStructural('从图框取出', async (base, map) => {
    const id = layerIdAt(base, map(child)), frameId = layerIdAt(base, map(parent));
    return { ...moveContent(base, id, frameId, false), message: '已从图框取出' };
  });
}
export function drawFrameGizmo(ctx){
  
  const view = layerOrderView();
  for (const [key, node] of Object.entries(view.nodes)) {
    const index = +key, frame = frameMeta(index);
    if (!frame || !frameVisible(index, view) || node.block?.ids?.length !== 2) continue;
    const r = frame.rect;
    ctx.save(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = index === selLayer ? '#85bfff' : '#969696';
    ctx.beginPath();
    if (frame.shape === 'ellipse') ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.stroke(); ctx.clip(); ctx.beginPath();
    ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke(); ctx.restore();
  }
  if (!frameState || docTool !== 'frame') return;
  const r = shapeRect(frameState); ctx.save(); ctx.lineWidth = dispPx(1);
  ctx.setLineDash([dispPx(4), dispPx(3)]); ctx.strokeStyle = 'rgba(255,255,255,.95)';
  if (frameOpts.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(.5, r.w / 2), Math.max(.5, r.h / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
  else ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.setLineDash([]); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath();
  ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke(); ctx.restore();
}
export function syncFrameBar(){
  const group = $('#grpFrame'); if (!group) return; group.hidden = docTool !== 'frame'; if (group.hidden) return;
  const why = frameWhy(), selected = selectedFrame(), parent = frameParent(selLayer), below = frameBelow(selLayer);
  for (const button of document.querySelectorAll('#frKinds button')) {
    button.classList.toggle('on', button.dataset.kind === frameOpts.kind);
    if (!button.dataset.nativeIcon) { button.replaceChildren(icon(button.dataset.kind === 'ellipse' ? 'opt-frame-ellipse' : 'opt-frame-rect', 16)); button.dataset.nativeIcon = '1'; }
  }
  const setDisabled = (selector, disabled, title) => { const button = $(selector); if (button) { button.disabled = disabled; if (title) button.title = title; } };
  setDisabled('#frPlace', !!why || selected < 0, '置入图像，替换所选图框的内容');
  setDisabled('#frPut', !!why || selLayer < 0 || below < 0 || parent >= 0 || !!frameMeta(selLayer) || isBackgroundLayer(selLayer) || layerTree?.flat[selLayer]?.groupType != null, '将所选像素图层或智能对象放进下方图框');
  setDisabled('#frTake', !!why || parent < 0, '将内容智能对象移到图框外');
  const info = $('#frInfo'); if (info) { info.textContent = why || (selected >= 0 ? parent >= 0 ? '图框内容' : '图框' : '拖动创建图框'); info.title = '图框与内容可分别调整'; }
  if (group.dataset.bound) return; group.dataset.bound = '1';
  const kind = $('#frKind'); if (kind) { kind.value = frameOpts.kind; kind.onchange = () => { frameOpts.kind = kind.value; syncFrameBar(); drawGizmo(); }; }
  for (const button of document.querySelectorAll('#frKinds button')) button.onclick = () => { frameOpts.kind = button.dataset.kind; if (kind) kind.value = frameOpts.kind; syncFrameBar(); drawGizmo(); button.blur(); };
  const place = $('#frPlace'); if (place) place.onclick = placeIntoFrameUI;
  const put = $('#frPut'); if (put) put.onclick = putIntoFrameUI;
  const take = $('#frTake'); if (take) take.onclick = takeOutOfFrameUI;
}
