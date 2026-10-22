




import './18-pen-extra.js';   
import { loadCas, casReady, casPreview, casFull } from '../content-aware-scale.js';
import { rotCursorSmooth } from '../icons.js';
import { preferences as PREF } from '../preferences.js';
import { isShapeLayer, pathBounds } from '../property-panel.js';
import { shell } from '../shell.js';
import { proWarpNotice } from '../pro.js';
import { $, QUADM, QUADW, createSelection, selectionBounds, selectionValueAt } from './01-boot.js';
import {
  brushHistory, doc, docH, docW, layerDeletes, layerRenames, layerTransforms, layerTree, li, selection,
  set_selPathCache, set_selection,
} from './02-doc-state.js';
import {
  ACTP, actRecord, docHistory, histCap, histLog, histPush, pushDocHistory, structuralBegin, syncHistoryPanel,
  updateUndoButtons,
} from './03-history.js';
import { isBackgroundLayer, rasterKindOf } from './05-layer-lock-guides.js';
import { quadBBox, tfFrame } from './06-view-zoom-move.js';
import { moveDrag, set_moveDrag } from './07-nav-histogram.js';
import { tfFreeRatio } from './08-doc-size.js';
import { pathTargetKey } from './17-shape-pen.js';
import {
  pointInQuadLocal, quadAxisAligned, quadBBoxExact, set_snapLines, snapHandlePointer, snapMoveDelta,
} from './20-snap-smart-object.js';
import { exitSO, suspendWarpForFreeTransform } from './22-deform-tools.js';
import { layerCanvasCache, renderLayerPanel, selLayer, selLayers, thumbCache } from './23-layers-panel.js';
import { cloneOpValue, dropLayerOp, effLock, findLayerOp, putLayerOp, renderProps } from './24-layer-ops-queue.js';
import { warpLayerUI, warpSession } from './26-layer-create.js';
import {
  ensureLayerTransform, getTransformValues, syncTransformInputs, transformBase, transformChanged,
} from './28-layer-props-transform.js';
import { renderPreviewOnly, renderStaticLayers } from './30-render.js';
import { bgRGB, docTool } from './31-selection-brush.js';
import { setGizmoCursorString, setSelection, syncAnts, syncToolOptions } from './32-cursors-select-options.js';
import { commitPixelPaint, diffBox, ensurePixelPaint, sparsePixelHistory } from './38-brush-engine.js';
import {
  clonePathSubpaths, effPathSubpaths, pathGuard, pathModel, pathSubpathsEq, pathWorking, readVectorPath,
  set_pathModel,
} from './44-vector-path.js';
import { PATH_EDIT_TOOLS, cloneKnot, commitPathEdit, pathSelAnchors, pathSelSubs } from './45-path-tools.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import { tfSelOnlyApply } from './51-image-select-menu.js';
import { docAlphaChannels, docAlphaGray } from './52-alpha-text-menu.js';
import { PW } from './57-layer-style-text-path.js';














export let tfState = null;      
export function set_tfState(v) { return (tfState = v); }   
export let tfLast = null;       
const TF_KINDS = { free: '自由变换', scale: '缩放', rotate: '旋转', skew: '斜切', distort: '扭曲', perspective: '透视', warp: '变形' };
const TF_HINT = {
  free: '',
  scale: '拖控制柄缩放：角柄等比，Shift 自由比例，Alt 从参考点',
  rotate: '拖动即绕参考点旋转，Shift 按 15° 吸附',
  skew: '拖边柄沿边方向错切（对边固定）',
  distort: '拖角柄自由移动该角',
  perspective: '拖角柄产生对称梯形（相邻角反向移动）',
};


export function tfEligible(){
  if (!doc) return '先打开一个 PSD';
  if (li) return '正在编辑智能对象的变形：先退出变形编辑（Esc）';
  if (selLayer < 0) return '先在图层面板选中一个图层';
  if (layerDeletes.has(selLayer)) return '这一层已标记删除';
  const shape = isShapeLayer(layerTree?.flat[selLayer]);
  const b = shape ? pathBounds(effPathSubpaths(selLayer)) : transformBase(selLayer);
  if (!b) return '正在载入形状路径，请稍后重试';
  if (!(b.w > 0 && b.h > 0)) return '这一层没有像素（组 / 空图层不能变换）';
  const lock = moveLockWhy(selLayer);            
  if (lock) return lock;
  return null;
}


export function tfRefPoint(st){
  const s = st || tfState; if (!s) return [0, 0];
  const q = s.base, u = (s.ref % 3) / 2, v = Math.floor(s.ref / 3) / 2;
  const tx = q[0][0] + (q[1][0] - q[0][0]) * u, ty = q[0][1] + (q[1][1] - q[0][1]) * u;
  const bx = q[3][0] + (q[2][0] - q[3][0]) * u, by = q[3][1] + (q[2][1] - q[3][1]) * u;
  return [tx + (bx - tx) * v, ty + (by - ty) * v];
}


export function tfWriteQuad(idx, q){
  

  if (tfState && tfState.selOnly) { tfState.selOnly.quad = q.map(p => [p[0], p[1]]); tfSelOnlyApply(!!tfState.dragging); return; }
  if (tfState && tfState.pathOnly) { tfState.pathOnly.quad = q.map(p => [p[0], p[1]]); tfPathApply(); return; }
  if (tfState && tfState.sel && tfState.idx === idx) { tfState.sel.quad = q.map(p => [p[0], p[1]]); return; }   
  const vector = tfState?.idx === idx ? tfState.vector : null;
  const t = vector ? vector.frame : ensureLayerTransform(idx);
  const r = QUADM && QUADM.quadToRect(q, 1e-4);
  if (r) {
    t.x = r.x; t.y = r.y; t.w = r.w; t.h = r.h; t.rot = r.rot;
    delete t.quad; delete t.rotQ;
  } else {
    t.quad = q.map(pt => [pt[0], pt[1]]);
    const b = quadBBox(q);
    t.x = b.x; t.y = b.y; t.w = b.w; t.h = b.h; t.rot = 0; t.rotQ = 0;
  }
  if (vector && QUADM) {
    const from = QUADM.squareToQuad(tfState.base), to = QUADM.squareToQuad(q);
    const inverse = from && QUADM.invert3(from);
    if (!inverse || !to) return;
    const matrix = QUADM.mul3(to, inverse), subpaths = clonePathSubpaths(vector.source);
    for (const sub of subpaths) for (const knot of sub.knots) for (const key of ['anchor', 'in', 'out']) {
      const p = QUADM.applyMatrix(matrix, knot[key][0], knot[key][1]);
      if (!p || !p.every(Number.isFinite)) return;
      knot[key] = p;
    }
    const original = readVectorPath(idx);
    if (original && pathSubpathsEq(subpaths, original.subpaths)) dropLayerOp(idx, 'setVectorMaskPath');
    else putLayerOp(idx, { op: 'setVectorMaskPath', index: idx, subpaths, units: 'pixel' });
    set_pathModel(null); delete thumbCache[idx];
  }
}
export function tfMark(){ if (tfState && !tfState.pushed) { pushDocHistory(); tfState.pushed = true; } }







export function tfCurValues(){
  const s = tfState;
  if (s && s.selOnly) { const q = s.selOnly.quad, bb = quadBBox(q); return { quad: q, x: bb.x, y: bb.y, w: bb.w, h: bb.h, rot: 0 }; }
  if (s && s.pathOnly) { const q = s.pathOnly.quad, bb = quadBBox(q); return { quad: q, x: bb.x, y: bb.y, w: bb.w, h: bb.h, rot: 0 }; }
  if (s && s.sel) { const q = s.sel.quad, bb = quadBBox(q); return { quad: q, x: bb.x, y: bb.y, w: bb.w, h: bb.h, rot: 0 }; }
  return getTransformValues(s ? s.idx : selLayer);
}
export function tfSelFrameValues(){ return tfCurValues(); }
export function tfSelEligible(idx){
  if (!selection || !doc) return false;
  const b = selectionBounds(selection);
  if (!b || !(b.width > 0 && b.height > 0)) return false;
  const dl = doc.layers[idx];
  if (!dl || !dl.rgba || !(dl.width > 0 && dl.height > 0)) return false;
  if (rasterKindOf(idx) || transformChanged(idx) || isShapeLayer(layerTree?.flat[idx])) return false;
  return true;
}
export function tfBeginSelection(idx, kind, opts = {}){
  const pp = ensurePixelPaint(idx);
  if (!pp) return false;
  const b = selectionBounds(selection);
  const x0 = Math.max(pp.left, b.x), y0 = Math.max(pp.top, b.y);
  const x1 = Math.min(pp.left + pp.w, b.x + b.width), y1 = Math.min(pp.top + pp.h, b.y + b.height);
  if (!(x1 > x0 && y1 > y0)) { shell.status('选区里没有这个图层的像素'); return false; }
  const w = x1 - x0, h = y1 - y0;
  const backup = Uint8ClampedArray.from(pp.rgba);
  const src = new Uint8ClampedArray(w * h * 4);
  const bgLayer = isBackgroundLayer(idx), bgc = bgRGB;   
  let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cov = selectionValueAt(selection, x0 + x, y0 + y);
    if (!cov) continue;
    const o = ((y0 - pp.top + y) * pp.w + (x0 - pp.left + x)) * 4, d = (y * w + x) * 4;
    const a = pp.rgba[o + 3];
    if (!a) continue;
    src[d] = pp.rgba[o]; src[d + 1] = pp.rgba[o + 1]; src[d + 2] = pp.rgba[o + 2];
    src[d + 3] = Math.round(a * cov / 255);
    any = true;
    if (opts.copy) continue;               
    if (bgLayer) { const k = cov / 255; for (let c = 0; c < 3; c++) pp.rgba[o + c] = Math.round(pp.rgba[o + c] * (1 - k) + bgc[c] * k); }
    else pp.rgba[o + 3] = Math.round(a * (255 - cov) / 255);
    any = true;
  }
  if (!any) { pp.rgba.set(backup); shell.status('选区里没有可变换的像素'); return false; }
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  const base = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  tfState = {
    refShown: !!PREF.get('tools.showRefPoint'),   
    idx, kind, ref: 4, dragging: false, pushed: true, affine: true,
    base: base.map(p => p.slice()), orig: {},
    num: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 }, vector: null,
    sel: { pp, backup, src: { data: src, width: w, height: h }, quad: base.map(p => p.slice()), cache: null, selBefore: selection },
  };
  QUADW.load().then(() => { tfSyncBar(); drawGizmo(); }).catch(() => {});
  document.querySelector('.app').classList.add('transforming');
  renderPreviewOnly(); syncToolOptions(); tfSyncBar(); drawGizmo();
  return true;
}

export function drawTfFloat(ctx){
  const S = tfState && tfState.sel; if (!S) return;
  const q = S.quad, cas = tfState.cas;
  const sig = q.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(';') + (cas ? `|${cas.amount}|${cas.protectKey}|${cas.skin}|${tfState.dragging ? 1 : 0}` : '');
  if (!S.cache || S.cache.sig !== sig) {
    let cv = null, x = 0, y = 0, w = 0, h = 0;
    if (cas) {                                       
      const r = casReady() ? casPreview(S, cas, q, tfState.dragging) : null;
      if (r) ({ cv, x, y, w, h } = r);
    } else if (QUADM) {
      const r = QUADM.warpQuad(S.src, q, { samples: tfState.dragging ? 1 : 2 });
      if (r) { cv = document.createElement('canvas'); cv.width = r.width; cv.height = r.height;
        const g = cv.getContext('2d'); if (g) g.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
        x = r.x; y = r.y; w = r.width; h = r.height; }
    }
    S.cache = cv ? { sig, cv, x, y, w, h } : null;
  }
  if (S.cache) { ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(S.cache.cv, S.cache.x, S.cache.y, S.cache.w, S.cache.h); ctx.restore(); }
}
function tfCommitSelection(){
  const s = tfState, S = s.sel, pp = S.pp, idx = s.idx;
  const moved = S.quad.some((p, k) => Math.abs(p[0] - s.base[k][0]) > 1e-6 || Math.abs(p[1] - s.base[k][1]) > 1e-6);
  

  if (!moved || !QUADM) { pp.rgba.set(S.backup); delete layerCanvasCache[idx]; delete thumbCache[idx]; return; }
  if (moved && QUADM) {
    const r = s.cas ? casFull(S, s.cas, S.quad)                 
      : QUADM.warpQuad(S.src, S.quad, { samples: 2, clip: { x: pp.left, y: pp.top, width: pp.w, height: pp.h } });
    if (r) {
      for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
        const d = (y * r.width + x) * 4, ca = r.data[d + 3] / 255;
        if (ca <= 0) continue;
        const bx = r.x + x - pp.left, by = r.y + y - pp.top;
        if (bx < 0 || by < 0 || bx >= pp.w || by >= pp.h) continue;
        const o = (by * pp.w + bx) * 4, ba = pp.rgba[o + 3] / 255, oa = ca + ba * (1 - ca);
        for (let k = 0; k < 3; k++) pp.rgba[o + k] = Math.round((r.data[d + k] * ca + pp.rgba[o + k] * ba * (1 - ca)) / oa);
        pp.rgba[o + 3] = Math.round(oa * 255);
      }
    }
    
    try {
      const sb = S.selBefore, n = sb.width * sb.height;
      if (n > 0) {
        const cov = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) { const v = sb.data[i]; cov[i * 4] = cov[i * 4 + 1] = cov[i * 4 + 2] = 255; cov[i * 4 + 3] = v; }
        const bq = s.base, sq = S.quad;
        
        const M = QUADM.mul3(QUADM.squareToQuad(sq), QUADM.invert3(QUADM.squareToQuad(bq)));
        const selQ = [[sb.x, sb.y], [sb.x + sb.width, sb.y], [sb.x + sb.width, sb.y + sb.height], [sb.x, sb.y + sb.height]]
          .map(([px, py]) => QUADM.applyMatrix(M, px, py));
        const r2 = selQ.every(Boolean) && QUADM.warpQuad({ data: cov, width: sb.width, height: sb.height }, selQ, { samples: 2, clip: { x: 0, y: 0, width: docW, height: docH } });
        if (r2) {
          const a = new Uint8Array(r2.width * r2.height);
          for (let i = 0; i < a.length; i++) a[i] = r2.data[i * 4 + 3];
          set_selection(createSelection(docW, docH, r2.x, r2.y, r2.width, r2.height, a));
          set_selPathCache(null); syncAnts();
        }
      }
    } catch { }
  }
  const box = diffBox(S.backup, pp.rgba, pp.w, pp.h, 4);
  if (box) {
    brushHistory.undo.push(sparsePixelHistory(idx, S.backup, pp.rgba, pp.w, pp.h, { selBefore: S.selBefore, selAfter: selection }));
    if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
    brushHistory.redo.length = 0;
    histPush(s.cas ? '内容识别缩放' : '自由变换', 'brush');
    commitPixelPaint(idx);
  }
  delete layerCanvasCache[idx]; delete thumbCache[idx];
}
function tfCancelSelection(){
  const s = tfState, S = s.sel;
  S.pp.rgba.set(S.backup);
  delete layerCanvasCache[s.idx]; delete thumbCache[s.idx];
}







export function casWhy(){
  if (!doc) return '先打开一个文档';
  if (li) return '正在编辑智能对象：先退出';
  if (selLayer < 0) return '先在图层面板选中一个图层';
  if (selLayers.size > 1) return '内容识别缩放一次只能处理一个图层';
  const L = layerTree && layerTree.flat[selLayer];
  if (!L || L.groupType != null) return '组不能做内容识别缩放';
  if (L.adjustment) return '调整 / 填充图层不能做内容识别缩放';
  const rk = rasterKindOf(selLayer);
  if (rk) return `${rk === 'text' ? '文字图层' : rk === 'smart' ? '智能对象' : rk === 'shape' ? '形状图层' : '填充图层'}不能做内容识别缩放：先栅格化`;
  if (isBackgroundLayer(selLayer) && !selection) return '要对背景图层做内容识别缩放，先全选（⌘A）或把它转换为普通图层';
  const dl = doc.layers[selLayer];
  if (!dl || !dl.rgba || !(dl.width > 0 && dl.height > 0)) return '这一层没有像素';
  if (transformChanged(selLayer)) return '这一层有未应用的变换：先提交';
  return '';
}
let casOpts = { amount: 100, protect: '', skin: false };
export async function beginContentAwareScale(){
  const why = casWhy(); if (why) { sayLocked(why) || shell.status(why); return false; }
  if (tfState) commitFreeTransform();
  await loadCas();
  const idx = selLayer, pp = ensurePixelPaint(idx);
  if (!pp) return false;
  let x0, y0, x1, y1;
  if (selection) {
    const b = selectionBounds(selection);
    x0 = Math.max(pp.left, b.x); y0 = Math.max(pp.top, b.y); x1 = Math.min(pp.left + pp.w, b.x + b.width); y1 = Math.min(pp.top + pp.h, b.y + b.height);
  } else {
    
    x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
    for (let y = 0; y < pp.h; y++) for (let x = 0; x < pp.w; x++) if (pp.rgba[(y * pp.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { shell.status('这一层没有像素'); return false; }
    x0 += pp.left; y0 += pp.top; x1 += pp.left + 1; y1 += pp.top + 1;
  }
  if (!(x1 > x0 && y1 > y0)) { shell.status('选区里没有这个图层的像素'); return false; }
  const w = x1 - x0, h = y1 - y0;
  const backup = Uint8ClampedArray.from(pp.rgba), src = new Uint8ClampedArray(w * h * 4);
  const bgLayer = isBackgroundLayer(idx), bgc = bgRGB;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cov = selection ? selectionValueAt(selection, x0 + x, y0 + y) : 255;
    if (!cov) continue;
    const o = ((y0 - pp.top + y) * pp.w + (x0 - pp.left + x)) * 4, d = (y * w + x) * 4, a = pp.rgba[o + 3];
    src[d] = pp.rgba[o]; src[d + 1] = pp.rgba[o + 1]; src[d + 2] = pp.rgba[o + 2]; src[d + 3] = Math.round(a * cov / 255);
    if (bgLayer) { const k = cov / 255; for (let c = 0; c < 3; c++) pp.rgba[o + c] = Math.round(pp.rgba[o + c] * (1 - k) + bgc[c] * k); }
    else pp.rgba[o + 3] = Math.round(a * (255 - cov) / 255);
  }
  delete layerCanvasCache[idx]; delete thumbCache[idx];
  const base = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  tfState = {
    idx, kind: 'scale', ref: 4, dragging: false, pushed: true, affine: true,
    base: base.map(p => p.slice()), orig: {},
    num: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 }, vector: null,
    sel: { pp, backup, src: { data: src, width: w, height: h }, quad: base.map(p => p.slice()), cache: null, selBefore: selection },
    cas: { amount: casOpts.amount, protect: null, protectKey: '', skin: casOpts.skin, rect: { x0, y0, w, h } },
  };
  casSetProtect(casOpts.protect);
  QUADW.load().then(() => { tfSyncBar(); drawGizmo(); }).catch(() => {});
  document.querySelector('.app').classList.add('transforming', 'cas-scaling');
  renderPreviewOnly(); syncToolOptions(); tfSyncBar(); drawGizmo();
  shell.status('内容识别缩放：拖动手柄缩放（Shift 自由比例、⌥ 以参考点为中心），Enter 提交，Esc 取消');
  return true;
}

function casSetProtect(key){
  const s = tfState; if (!s || !s.cas) return;
  casOpts.protect = key || '';
  s.cas.protectKey = casOpts.protect;
  s.cas.protect = null;
  const m = /^a(\d+)$/.exec(casOpts.protect);
  if (m) {
    const g = docAlphaGray(+m[1]), R = s.cas.rect;
    if (g) {
      const p = new Uint8Array(R.w * R.h);
      for (let y = 0; y < R.h; y++) { const Y = R.y0 + y; if (Y < 0 || Y >= docH) continue;
        for (let x = 0; x < R.w; x++) { const X = R.x0 + x; if (X < 0 || X >= docW) continue; p[y * R.w + x] = g[Y * docW + X]; } }
      s.cas.protect = p;
    }
  }
  if (s.sel) s.sel.cache = null;
}
let casBarBound = false;
function casSyncBar(){
  const s = tfState; if (!s || !s.cas) return;
  const amt = $('#casAmount'), prot = $('#casProtect'), skin = $('#casSkin');
  if (!amt) return;
  if (!casBarBound) {
    casBarBound = true;
    const setAmt = () => { if (!tfState || !tfState.cas) return; let v = Math.round(+amt.value); if (!Number.isFinite(v)) v = 100; v = Math.max(0, Math.min(100, v)); amt.value = v; tfState.cas.amount = casOpts.amount = v; drawGizmo(); };
    amt.addEventListener('change', setAmt);
    amt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setAmt(); } });
    prot.addEventListener('change', () => { casSetProtect(prot.value); drawGizmo(); });
    skin.addEventListener('click', () => { if (!tfState || !tfState.cas) return; tfState.cas.skin = casOpts.skin = !tfState.cas.skin; skin.classList.toggle('on', tfState.cas.skin); drawGizmo(); });
  }
  if (document.activeElement !== amt) amt.value = s.cas.amount;
  const list = docAlphaChannels();
  const want = [['', '无'], ...list.map((c, k) => ['a' + c.at, c.name || ('Alpha ' + (k + 1))])];
  if (prot.options.length !== want.length || want.some(([v, t], k) => prot.options[k].value !== v || prot.options[k].textContent !== t)) {
    prot.innerHTML = ''; for (const [v, t] of want) { const o = document.createElement('option'); o.value = v; o.textContent = t; prot.append(o); }
  }
  prot.value = s.cas.protectKey || '';
  skin.classList.toggle('on', !!s.cas.skin);
}







export function pathTfEligible(){
  if (!doc || li || !PATH_EDIT_TOOLS.has(docTool)) return false;
  if (!pathModel || pathGuard()) return false;
  const key = pathTargetKey();
  if (pathModel.idx !== key) return false;
  return (docTool === 'pathSelect' && pathSelSubs.size > 0) || (docTool !== 'pathSelect' && (pathSelAnchors.size > 0 || pathSelSubs.size > 0));
}
function beginPathTransform(kind, opts = {}){
  const key = opts.key !== undefined ? opts.key : pathTargetKey(), sp = pathWorking(key);
  if (!sp) return false;
  let anchors = null;
  const src = new Map();
  if (opts.all) {                                   
    sp.forEach((s0, si) => src.set(si, s0.knots.map(cloneKnot)));
  } else if (docTool !== 'pathSelect' && pathSelAnchors.size && !pathSelSubs.size) {
    anchors = new Set(pathSelAnchors);
    for (const id of anchors) { const [si, ki] = id.split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (kn) src.set(id, cloneKnot(kn)); }
  } else {
    for (const si of pathSelSubs) if (sp[si]) src.set(si, sp[si].knots.map(cloneKnot));
  }
  if (!src.size) return false;
  
  let b;
  if (anchors) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const kn of src.values()) { x0 = Math.min(x0, kn.anchor[0]); y0 = Math.min(y0, kn.anchor[1]); x1 = Math.max(x1, kn.anchor[0]); y1 = Math.max(y1, kn.anchor[1]); }
    b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } else b = pathBounds([...src.keys()].map(si => sp[si]));
  if (!b || !(b.w > 0 || b.h > 0)) { shell.status('选中的路径没有大小，变换不了'); return false; }
  if (!(b.w > 0)) b = { ...b, x: b.x - 0.5, w: 1 };
  if (!(b.h > 0)) b = { ...b, y: b.y - 0.5, h: 1 };
  const base = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  tfState = {
    refShown: !!PREF.get('tools.showRefPoint'),   
    idx: selLayer >= 0 ? selLayer : 0, kind, ref: 4, dragging: false, pushed: true, affine: true,
    base: base.map(p => p.slice()), orig: {},
    num: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 }, vector: null,
    pathOnly: { key, anchors, src, quad: base.map(p => p.slice()) },
  };
  QUADW.load().then(() => { tfSyncBar(); drawGizmo(); }).catch(() => {});
  document.querySelector('.app').classList.add('transforming');
  syncToolOptions(); tfSyncBar(); drawGizmo();
  shell.status(anchors ? `变换点：${src.size} 个锚点（Enter 提交，Esc 取消）` : `变换路径：${src.size} 条子路径（Enter 提交，Esc 取消）`);
  return true;
}
function tfPathApply(){
  const s = tfState, P = s && s.pathOnly; if (!P || !pathModel) return;
  if (s.pathWarp) { PW.apply(true); drawGizmo(); return; }       
  if (!QUADM) return;
  const from = QUADM.squareToQuad(s.base), to = QUADM.squareToQuad(P.quad);
  const inv = from && QUADM.invert3(from);
  if (!inv || !to) return;
  const M = QUADM.mul3(to, inv), sp = pathModel.subpaths;
  const map = kn => { const o = {}; for (const k of ['anchor', 'in', 'out']) { const p = QUADM.applyMatrix(M, kn[k][0], kn[k][1]); if (!p || !p.every(Number.isFinite)) return null; o[k] = p; } return o; };
  for (const [id, orig] of P.src) {
    if (P.anchors) {
      const [si, ki] = String(id).split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (!kn) continue;
      const o = map(orig); if (o) Object.assign(kn, o);
    } else {
      if (!sp[id]) continue;
      
      const K = orig.map(o0 => { const o = map(o0); return o ? { ...cloneKnot(o0), ...o } : cloneKnot(o0); });
      sp[id].knots = K;
    }
  }
  drawGizmo();
}




function pathWarpTargetLayer(){
  if (!doc || li || selLayer < 0 || layerDeletes.has(selLayer)) return false;
  if (!isShapeLayer(layerTree?.flat[selLayer])) return false;
  const p = readVectorPath(selLayer);
  return !!(p && !p.error && p.subpaths.length) && !moveLockWhy(selLayer);
}
export function pathWarpEligible(){
  if (tfState) return !!(tfState.pathOnly || tfState.vector);
  return pathTfEligible() || pathWarpTargetLayer();
}
function pathWarpSrc(P){
  const sp = pathModel.subpaths, src = new Map();
  if (P.anchors) { for (const id of P.anchors) { const [si, ki] = String(id).split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (kn) src.set(id, cloneKnot(kn)); } }
  else for (const si of P.src.keys()) if (sp[si]) src.set(si, sp[si].knots.map(cloneKnot));
  let b;
  if (P.anchors) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const kn of src.values()) { x0 = Math.min(x0, kn.anchor[0]); y0 = Math.min(y0, kn.anchor[1]); x1 = Math.max(x1, kn.anchor[0]); y1 = Math.max(y1, kn.anchor[1]); }
    b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } else b = pathBounds([...src.keys()].map(si => ({ ...sp[si], knots: src.get(si) })));
  return { src, b };
}
export function beginPathWarp(){
  if (tfState && tfState.pathWarp) return true;
  if (tfState && tfState.vector) {
    const idx = tfState.idx, cur = clonePathSubpaths(effPathSubpaths(idx));
    cancelFreeTransform();
    if (!beginPathTransform('warp', { key: idx, all: true })) return false;
    tfState.pathOnly.orig0 = tfState.pathOnly.src;
    pathModel.subpaths.forEach((sp, i) => { if (cur[i]) sp.knots = cur[i].knots; });   
  } else if (tfState && !tfState.pathOnly) return false;
  else if (!tfState) {
    if (pathTfEligible()) { if (!beginPathTransform('warp')) return false; }
    else if (pathWarpTargetLayer()) { if (!beginPathTransform('warp', { key: selLayer, all: true })) return false; }
    else return false;
  }
  const s = tfState, P = s && s.pathOnly; if (!P || !pathModel) return false;
  if (!P.orig0 && P.quad.some((p, k) => Math.abs(p[0] - s.base[k][0]) > 1e-9 || Math.abs(p[1] - s.base[k][1]) > 1e-9)) P.orig0 = P.src;
  const { src, b } = pathWarpSrc(P);
  if (!b || !(b.w > 0 || b.h > 0)) { shell.status('选中的路径没有大小，变形不了'); return false; }
  PW.start(s, { rect: { x: b.x, y: b.y, w: b.w, h: b.h }, src, anchors: P.anchors });
  tfSyncBar(); drawGizmo();
  shell.status('变形路径：拖网格的角点 / 手柄 / 格子，或在选项栏选变形预设；Enter 提交，Esc 取消');
  return true;
}

function pathWarpBake(){
  const s = tfState, P = s && s.pathOnly; if (!P || !s.pathWarp) return;
  PW.apply(true); PW.end(); delete s.pathWarp;
  P.orig0 = P.orig0 || P.src;
  const { src, b } = pathWarpSrc(P);
  let bb = b && (b.w > 0 || b.h > 0) ? b : { x: 0, y: 0, w: 1, h: 1 };
  if (!(bb.w > 0)) bb = { ...bb, x: bb.x - 0.5, w: 1 };
  if (!(bb.h > 0)) bb = { ...bb, y: bb.y - 0.5, h: 1 };
  const base = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
  P.src = P.anchors ? src : src; P.quad = base.map(p => p.slice());
  s.base = base.map(p => p.slice()); s.num = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 }; s.affine = true;
}
export function beginFreeTransform(kind = 'free'){
  if (tfState) { if (tfState.pathWarp) pathWarpBake(); tfState.kind = kind; tfSyncBar(); drawGizmo(); return true; }
  if (pathTfEligible()) return beginPathTransform(kind);
  const why = tfEligible();
  if (why) { shell.status(why); return false; }
  if (selLayer >= 0 && tfSelEligible(selLayer)) return tfBeginSelection(selLayer, kind);
  const idx = selLayer, shape = isShapeLayer(layerTree?.flat[idx]);
  const transaction = structuralBegin();
  transaction.extra.freeTransformLast = tfLast ? { ...tfLast, L: tfLast.L.slice() } : null;
  const t = shape ? { ...pathBounds(effPathSubpaths(idx)), rot: 0, flipX: false, flipY: false } : ensureLayerTransform(idx);
  tfState = {
    refShown: !!PREF.get('tools.showRefPoint'),   
    idx, kind, ref: 4, dragging: false, pushed: false, affine: true, transaction,
    base: tfFrame(t).corners.map(pt => pt.slice()),
    orig: { ...t, quad: t.quad ? t.quad.map(pt => pt.slice()) : null },
    num: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 },
    vector: shape ? { frame: t, source: clonePathSubpaths(effPathSubpaths(idx)),
      originalOp: cloneOpValue(findLayerOp(idx, 'setVectorMaskPath') || null) } : null,
  };
  QUADW.load().then(() => { tfSyncBar(); drawGizmo(); }).catch(() => {});
  document.querySelector('.app').classList.add('transforming');
  syncToolOptions(); tfSyncBar(); drawGizmo();
  return true;
}
export function commitFreeTransform(options = {}){
  const s = tfState; if (!s) return false;
  if (s.warpSession && !options.handoff) return transferFreeTransformToWarp().then(ok => ok ? exitSO(true) : false);
  if (s.pathOnly) {
    const P = s.pathOnly, warp = !!s.pathWarp;
    tfPathApply();
    if (warp) PW.end();
    tfState = null;
    document.querySelector('.app').classList.remove('transforming');
    const moved = warp || P.orig0 ? !!pathModel && !pathSubpathsEq(pathModel.subpaths, pathModel.src)
      : !P.quad.every((p, k) => Math.abs(p[0] - s.base[k][0]) < 1e-9 && Math.abs(p[1] - s.base[k][1]) < 1e-9);
    if (moved) commitPathEdit(P.key, warp ? '变形路径' : P.anchors ? '变换点' : '变换路径');
    if (moved && warp && !P.anchors) pathSelAnchors.clear();   
    syncToolOptions(); renderProps(); drawGizmo(); updateUndoButtons();
    shell.status(moved ? (warp ? '变形路径：已提交' : P.anchors ? '变换点：已提交' : '变换路径：已提交') : '变换路径：没有变化');
    return true;
  }
  if (s.selOnly) {
    tfSelOnlyApply(false);                        
    tfState = null;
    document.querySelector('.app').classList.remove('transforming');
    syncToolOptions(); syncAnts(); renderProps(); drawGizmo(); updateUndoButtons();
    shell.status('变换选区：已提交');
    return true;
  }
  if (s.sel) {
    tfCommitSelection();
    tfState = null;
    document.querySelector('.app').classList.remove('transforming', 'cas-scaling');
    syncToolOptions(); renderPreviewOnly(); renderLayerPanel(); renderProps(); drawGizmo(); updateUndoButtons();
    return true;
  }
  
  if (QUADM) {
    const cur = tfFrame(tfCurValues()).corners;
    const A = QUADM.squareToQuad(s.base), B = QUADM.squareToQuad(cur);
    const Ai = A && QUADM.invert3(A);
    if (Ai && B) tfLast = { L: QUADM.mul3(Ai, B), label: TF_KINDS[s.kind] || '变换' };
  }
  if (!s.vector && s.orig) actRecordTransform(s.orig, layerTransforms[s.idx]);
  tfState = null;
  document.querySelector('.app').classList.remove('transforming');
  syncToolOptions(); renderStaticLayers(); syncTransformInputs(); renderProps(); drawGizmo(); updateUndoButtons();
  return true;
}

export function actRecordTransform(o, t){
  if (!ACTP || !o || !t || o.quad || t.quad || !o.w || !o.h) return;
  const dx = (t.x + t.w / 2) - (o.x + o.w / 2), dy = (t.y + t.h / 2) - (o.y + o.h / 2);
  const sx = t.w / o.w * 100 * (!!t.flipX !== !!o.flipX ? -1 : 1), sy = t.h / o.h * 100 * (!!t.flipY !== !!o.flipY ? -1 : 1);
  const angle = (t.rot || 0) - (o.rot || 0);
  if (Math.abs(sx - 100) < 1e-6 && Math.abs(sy - 100) < 1e-6 && Math.abs(angle) < 1e-6) { if (dx || dy) actRecord('move', { dx: Math.round(dx), dy: Math.round(dy) }); return; }
  actRecord('transform', { dx, dy, sx, sy, angle });
}

export function actApplyTransform(p){
  const idx = selLayer; if (idx < 0 || !doc || li) throw new Error('没有选中图层');
  const why = moveLockWhy(idx); if (why) throw new Error(why);
  pushDocHistory('变换');
  const t = ensureLayerTransform(idx);
  const cx = t.x + t.w / 2 + (p.dx || 0), cy = t.y + t.h / 2 + (p.dy || 0);
  const sx = (p.sx ?? 100) / 100, sy = (p.sy ?? 100) / 100;
  t.w = Math.max(1e-3, t.w * Math.abs(sx)); t.h = Math.max(1e-3, t.h * Math.abs(sy));
  if (sx < 0) t.flipX = !t.flipX; if (sy < 0) t.flipY = !t.flipY;
  t.x = cx - t.w / 2; t.y = cy - t.h / 2;
  t.rot = (t.rot || 0) + (p.angle || 0);
  renderStaticLayers(); syncTransformInputs(); renderProps(); drawGizmo(); updateUndoButtons();
  return true;
}
export function cancelFreeTransform(){
  const s = tfState; if (!s) return false;
  if (s.warpSession) {
    tfState = null; document.querySelector('.app').classList.remove('transforming');
    return exitSO(false);
  }
  if (s.pathOnly) {
    const P = s.pathOnly;
    if (s.pathWarp) { PW.end(); delete s.pathWarp; }
    if (P.orig0) P.src = P.orig0;                   
    P.quad = s.base.map(p => p.slice()); tfPathApply();   
    tfState = null;
    document.querySelector('.app').classList.remove('transforming');
    syncToolOptions(); drawGizmo(); updateUndoButtons();
    return true;
  }
  if (s.selOnly) {
    setSelection(s.selOnly.before, { history: false });
    if (s.pushed) docHistory.undo.pop();          
    tfState = null;
    document.querySelector('.app').classList.remove('transforming');
    syncToolOptions(); syncAnts(); drawGizmo(); updateUndoButtons();
    return true;
  }
  if (s.sel) {
    tfCancelSelection();
    tfState = null;
    document.querySelector('.app').classList.remove('transforming', 'cas-scaling');
    syncToolOptions(); renderPreviewOnly(); drawGizmo(); updateUndoButtons();
    return true;
  }
  const t = s.vector ? s.vector.frame : ensureLayerTransform(s.idx);
  for (const k of Object.keys(t)) delete t[k];
  Object.assign(t, s.orig);
  if (!s.orig.quad) delete t.quad;
  if (s.vector) {
    if (s.vector.originalOp) putLayerOp(s.idx, s.vector.originalOp); else dropLayerOp(s.idx, 'setVectorMaskPath');
    set_pathModel(null); delete thumbCache[s.idx];
  }
  if (s.pushed) {                                
    docHistory.undo.pop();
    
    if (histLog.items.length > 1 && histLog.cursor === histLog.items.length - 1) { histLog.items.pop(); histLog.cursor = histLog.items.length - 1; syncHistoryPanel(); }
  }
  tfState = null;
  document.querySelector('.app').classList.remove('transforming');
  syncToolOptions(); renderStaticLayers(); syncTransformInputs(); renderProps(); drawGizmo(); updateUndoButtons();
  return true;
}

export function transformAgain(){
  if (!tfLast || !QUADM) { shell.status('还没有可重复的变换'); return false; }
  const why = tfEligible();
  if (why) { shell.status(why); return false; }
  const idx = selLayer;
  const shape = isShapeLayer(layerTree?.flat[idx]);
  if (shape && !beginFreeTransform('free')) return false;
  const C = QUADM.squareToQuad(tfFrame(getTransformValues(idx)).corners);
  if (!C) return false;
  const M = QUADM.mul3(C, tfLast.L);
  const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => QUADM.applyMatrix(M, u, v));
  if (q.some(pt => !pt)) return false;
  if (shape) tfMark(); else pushDocHistory();
  tfWriteQuad(idx, q);
  if (shape) commitFreeTransform();
  renderStaticLayers(); syncTransformInputs(); renderProps(); drawGizmo(); updateUndoButtons();
  shell.status(`再次应用「${tfLast.label}」`);
  return true;
}






function tfBaseFrame(){
  const q = tfState.base;
  const ex = [q[1][0] - q[0][0], q[1][1] - q[0][1]], ey = [q[3][0] - q[0][0], q[3][1] - q[0][1]];
  const lx = Math.hypot(ex[0], ex[1]) || 1, ly = Math.hypot(ey[0], ey[1]) || 1;
  return [ex[0] / lx, ey[0] / ly, 0, ex[1] / lx, ey[1] / ly, 0, 0, 0, 1];
}
const tfTranslate = (a, b) => [1, 0, a, 0, 1, b, 0, 0, 1];
function tfApplyNum(){
  const s = tfState; if (!s || !QUADM) return;
  const ref = tfRefPoint(), F = tfBaseFrame(), Fi = QUADM.invert3(F);
  if (!Fi) return;
  const RKS = QUADM.composeTransform({ sx: s.num.sx, sy: s.num.sy, rot: s.num.rot, skewX: s.num.skewX, skewY: s.num.skewY });
  const lin = QUADM.mul3(F, QUADM.mul3(RKS, Fi));
  const m = QUADM.mul3(tfTranslate(ref[0] + s.num.dx, ref[1] + s.num.dy), QUADM.mul3(lin, tfTranslate(-ref[0], -ref[1])));
  const q = QUADM.transformQuad(m, s.base);
  if (!q) return;
  tfMark(); tfWriteQuad(s.idx, q); s.affine = true;
  renderStaticLayers(); syncTransformInputs(); drawGizmo();
}
export function tfNumFromQuad(){
  const s = tfState; if (!s || !QUADM) return;
  const cur = tfFrame(tfCurValues()).corners;
  
  if (!QUADM.isParallelogram(s.base) || !QUADM.isParallelogram(cur)) { s.affine = false; return; }
  const M = QUADM.affineBetween(s.base, cur);
  const F = tfBaseFrame(), Fi = QUADM.invert3(F);
  if (!M || !Fi) { s.affine = false; return; }
  const lin = [M[0], M[1], 0, M[3], M[4], 0, 0, 0, 1];
  const d = QUADM.decomposeAffine(QUADM.mul3(Fi, QUADM.mul3(lin, F)));
  const ref = tfRefPoint(), rp = QUADM.applyMatrix(M, ref[0], ref[1]);
  s.affine = true;
  s.num = { dx: rp[0] - ref[0], dy: rp[1] - ref[1], sx: d.sx, sy: d.sy, rot: d.rot, skewX: d.skewX, skewY: 0 };
}




function tfComputeQuad(kind, d, pt, ev){
  const q0 = d.quad0;
  const L0 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
  const corner = d.handle >= 0 && d.handle % 2 === 0 ? d.handle >> 1 : -1;
  const edge = d.handle >= 0 && d.handle % 2 === 1 ? (d.handle - 1) >> 1 : -1;
  if (kind === 'move') {
    let mx = pt.x - d.start.x, my = pt.y - d.start.y;
    if (ev.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
    return q0.map(p => [p[0] + mx, p[1] + my]);
  }
  if (kind === 'rotate') {
    const r = tfRefPoint();
    let a = Math.atan2(pt.y - r[1], pt.x - r[0]) - d.a0;
    if (ev.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
    const cos = Math.cos(a), sin = Math.sin(a);
    return q0.map(p => [r[0] + (p[0] - r[0]) * cos - (p[1] - r[1]) * sin, r[1] + (p[0] - r[0]) * sin + (p[1] - r[1]) * cos]);
  }
  const ex = [q0[1][0] - q0[0][0], q0[1][1] - q0[0][1]];
  const ey = [q0[3][0] - q0[0][0], q0[3][1] - q0[0][1]];
  const den = ex[0] * ey[1] - ex[1] * ey[0];
  if (Math.abs(den) < 1e-9) return null;
  const toLocal = (px, py) => { const rx = px - q0[0][0], ry = py - q0[0][1];
    return [(rx * ey[1] - ry * ey[0]) / den, (ex[0] * ry - ex[1] * rx) / den]; };
  const fromLocal = l => [q0[0][0] + l[0] * ex[0] + l[1] * ey[0], q0[0][1] + l[0] * ex[1] + l[1] * ey[1]];
  const P = toLocal(pt.x, pt.y);
  if (kind === 'scale') {
    const H0 = corner >= 0 ? L0[corner] : MID[edge];
    const A = ev.altKey ? toLocal(...tfRefPoint()) : (corner >= 0 ? L0[(corner + 2) % 4] : MID[(edge + 2) % 4]);
    let su = Math.abs(H0[0] - A[0]) > 1e-9 ? (P[0] - A[0]) / (H0[0] - A[0]) : 1;
    let sv = Math.abs(H0[1] - A[1]) > 1e-9 ? (P[1] - A[1]) / (H0[1] - A[1]) : 1;
    if (edge >= 0) { if (edge % 2 === 0) su = 1; else sv = 1; }          
    else if (!tfFreeRatio(ev)) {                                        
      const k = Math.max(Math.abs(su), Math.abs(sv));
      su = (su < 0 ? -1 : 1) * k; sv = (sv < 0 ? -1 : 1) * k;
    }
    return L0.map(l => fromLocal([A[0] + (l[0] - A[0]) * su, A[1] + (l[1] - A[1]) * sv]));
  }
  if (kind === 'distort') {
    const out = L0.map(l => l.slice());
    if (corner >= 0) out[corner] = [P[0], P[1]];
    else if (edge >= 0) {                                                
      const dl = [P[0] - MID[edge][0], P[1] - MID[edge][1]];
      out[edge] = [out[edge][0] + dl[0], out[edge][1] + dl[1]];
      const n = (edge + 1) % 4;
      out[n] = [out[n][0] + dl[0], out[n][1] + dl[1]];
    } else return null;
    return out.map(fromLocal);
  }
  if (kind === 'skew') {
    const out = L0.map(l => l.slice());
    if (edge >= 0) {                                                     
      if (edge % 2 === 0) { const dA = P[0] - MID[edge][0], row = edge === 0 ? 0 : 1;
        for (const i of (row === 0 ? [0, 1] : [2, 3])) out[i][0] += dA; }
      else { const dB = P[1] - MID[edge][1], col = edge === 1 ? 1 : 0;
        for (const i of (col === 1 ? [1, 2] : [0, 3])) out[i][1] += dB; }
    } else if (corner >= 0) {                                            
      const dA = P[0] - L0[corner][0], dB = P[1] - L0[corner][1];
      if (Math.abs(dA) >= Math.abs(dB)) { const row = corner === 0 || corner === 1 ? [0, 1] : [2, 3]; for (const i of row) out[i][0] += dA; }
      else { const col = corner === 1 || corner === 2 ? [1, 2] : [0, 3]; for (const i of col) out[i][1] += dB; }
    } else return null;
    return out.map(fromLocal);
  }
  if (kind === 'perspective') {
    const out = L0.map(l => l.slice());
    if (corner >= 0) {
      const dA = P[0] - L0[corner][0], dB = P[1] - L0[corner][1];
      const rowMate = [1, 0, 3, 2][corner];        
      const colMate = [3, 2, 1, 0][corner];        
      out[corner][0] += dA; out[corner][1] += dB;
      out[rowMate][0] -= dA;
      out[colMate][1] -= dB;
    } else if (edge >= 0) {                        
      return tfComputeQuad('skew', d, pt, ev);
    } else return null;
    return out.map(fromLocal);
  }
  return null;
}


export function beginTfDrag(ev, pt){
  if (tfState.pathWarp) {                        
    if (PW.pointerDown(pt, ev) && tfState.pathWarp.drag) {
      set_moveDrag({ idx: tfState.idx, tf: true, mode: 'pw', handle: -1, start: pt, pushed: false });
      gizmo.classList.add('drag');
      try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    }
    drawGizmo(); return;
  }
  const s = tfState, t = tfCurValues(), f = tfFrame(t);
  const scale = gizmo.getBoundingClientRect().width ? dispThr(1) : 1;
  const tol = Math.max(7 * scale, 5);
  let handle = -1;
  for (let k = 0; k < f.handles.length; k++)
    if (Math.abs(pt.x - f.handles[k][0]) <= tol && Math.abs(pt.y - f.handles[k][1]) <= tol) { handle = k; break; }
  const ref = tfRefPoint();
  let mode;
  if (handle >= 0) mode = 'scale';
  else if (s.refShown && Math.hypot(pt.x - ref[0], pt.y - ref[1]) <= tol) mode = 'ref';   
  else if (!pointInQuadLocal(f.corners, pt.x, pt.y)) mode = 'rotate';   
  else mode = 'move';
  if (s.cas && mode === 'rotate') return;                              
  set_moveDrag({ idx: s.idx, tf: true, mode, handle, start: pt, pushed: false,
               a0: Math.atan2(pt.y - ref[1], pt.x - ref[0]), quad0: f.corners.map(p => p.slice()) });
  s.dragging = true;
  gizmo.classList.add('drag');
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  drawGizmo();
}
export function moveTfDrag(ev, pt){
  const s = tfState, d = moveDrag;
  if (d.mode === 'pw') { PW.pointerMove(pt, ev); return; }
  if (d.mode === 'ref') {                        
    let best = s.ref, bd = Infinity;
    for (let k = 0; k < 9; k++) {
      const p = tfRefPoint({ base: s.base, ref: k });
      const dd = Math.hypot(pt.x - p[0], pt.y - p[1]);
      if (dd < bd) { bd = dd; best = k; }
    }
    if (best !== s.ref) { s.ref = best; tfNumFromQuad(); tfSyncBar(); drawGizmo(); }
    return;
  }
  const mod = ev.metaKey || ev.ctrlKey;
  let kind = s.kind;
  if (d.mode === 'move') kind = 'move';
  else if (d.mode === 'rotate') kind = 'rotate';
  else if (kind === 'free') {
    
    if (mod && ev.altKey && ev.shiftKey) kind = 'perspective';
    else if (mod) kind = d.handle % 2 === 0 ? 'distort' : 'skew';
    else kind = 'scale';
  }
  

  set_snapLines([]);
  if (kind === 'move') {
    let mx = pt.x - d.start.x, my = pt.y - d.start.y;
    if (ev.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
    const sn = snapMoveDelta(s.idx, quadBBoxExact(d.quad0), mx, my, { skipX: ev.shiftKey && mx === 0, skipY: ev.shiftKey && my === 0 });
    pt = { x: d.start.x + sn.dx, y: d.start.y + sn.dy };
  } else if (kind !== 'rotate' && d.handle >= 0) {
    const q0 = d.quad0, c = d.handle % 2 === 0, k = d.handle >> 1;
    const h0 = c ? q0[k] : [(q0[k][0] + q0[(k + 1) % 4][0]) / 2, (q0[k][1] + q0[(k + 1) % 4][1]) / 2];
    const aligned = quadAxisAligned(q0);
    const vertEdge = !c && (d.handle === 1 || d.handle === 5);          
    pt = snapHandlePointer(s.idx, h0, d.start, pt, {
      off: !c && !aligned && kind === 'scale',                           
      noX: !c && aligned && kind === 'scale' && vertEdge,
      noY: !c && aligned && kind === 'scale' && !vertEdge,
      one: kind === 'scale' && c && !ev.shiftKey,
    });
  }
  const q = tfComputeQuad(kind, d, pt, ev);
  if (!q) return;
  if (kind === 'rotate') {                       
    const r = tfRefPoint();
    setGizmoCursorString(rotCursorSmooth(Math.atan2(pt.y - r[1], pt.x - r[0]) * 180 / Math.PI));
  }
  tfMark();
  tfWriteQuad(s.idx, q);
  tfNumFromQuad(); tfSyncBar();
  renderStaticLayers(); syncTransformInputs(); drawGizmo();
}
export function endTfDrag(){
  if (tfState && tfState.pathWarp) PW.pointerUp();
  if (tfState) tfState.dragging = false;
  set_moveDrag(null); set_snapLines([]); gizmo.classList.remove('drag');
  renderStaticLayers();                          
  tfSyncBar(); syncTransformInputs(); drawGizmo();
}


let tfBarBound = false, tfLinkWH = false;
function tfBuildBar(){
  if (tfBarBound) return;
  tfBarBound = true;
  const grid = $('#tfRef');
  for (let k = 0; k < 9; k++) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.ref = String(k);
    b.title = '参考点：' + ['左上', '上中', '右上', '左中', '中心', '右中', '左下', '下中', '右下'][k];
    b.addEventListener('click', () => { if (!tfState) return; tfState.ref = k; tfState.refShown = true; tfNumFromQuad(); tfSyncBar(); drawGizmo(); });
    grid.appendChild(b);
  }
  const num = (id, key, scale) => {
    const el = $(id);
    const commit = () => {
      if (!tfState) return;
      const v = parseFloat(el.value);
      if (!Number.isFinite(v)) { tfSyncBar(); return; }
      const ref0 = tfRefPoint();
      tfState.num[key] = key === 'sx' || key === 'sy' ? v / 100
                       : key === 'dx' ? v - ref0[0] : key === 'dy' ? v - ref0[1] : v;
      if (tfLinkWH && (key === 'sx' || key === 'sy')) tfState.num[key === 'sx' ? 'sy' : 'sx'] = v / 100;
      tfApplyNum(); tfSyncBar();
    };
    el.addEventListener('change', commit);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); } });
    void scale;
  };
  num('#tfX', 'dx'); num('#tfY', 'dy');   
  num('#tfW', 'sx'); num('#tfH', 'sy');   
  num('#tfRot', 'rot'); num('#tfSkewH', 'skewX'); num('#tfSkewV', 'skewY');
  $('#tfLink').addEventListener('click', () => { tfLinkWH = !tfLinkWH; $('#tfLink').classList.toggle('on', tfLinkWH); });
  $('#tfWarp').addEventListener('click', async () => {
    if (!tfState) return;
    await proWarpNotice('warp');
  });
  $('#tfOk').addEventListener('click', () => commitFreeTransform());
  $('#tfCancel').addEventListener('click', () => cancelFreeTransform());
}



export async function transferFreeTransformToWarp(){
  const s=tfState;if(!s || s.pathOnly || s.pathWarp || s.vector || s.sel || s.selOnly)return false;
  const transaction=s.transaction || structuralBegin();
  if(!Object.prototype.hasOwnProperty.call(transaction.extra,'freeTransformLast'))transaction.extra.freeTransformLast=tfLast?{...tfLast,L:tfLast.L.slice()}:null;
  const current=tfFrame(tfCurValues()).corners;
  const changedBeforeWarp=!!s.pushed && !current.every((p,i)=>Math.abs(p[0]-s.base[i][0])<1e-9&&Math.abs(p[1]-s.base[i][1])<1e-9);
  const idx=s.idx;commitFreeTransform({handoff:true});
  return await warpLayerUI(idx,{transaction,changedBeforeWarp,resumeSession:s.warpSession});
}
export async function returnWarpToFreeTransform(){
  const session=warpSession;if(!session)return false;
  if (!await suspendWarpForFreeTransform()) return false;
  if (!beginFreeTransform('free')) return false;
  tfState.transaction=session.transaction;tfState.warpSession=session;
  return true;
}
export function restoreFreeTransformHistory(transaction){
  if(transaction?.extra && Object.prototype.hasOwnProperty.call(transaction.extra,'freeTransformLast'))tfLast=transaction.extra.freeTransformLast;
}

export function tfSyncBar(){
  const s = tfState; if (!s) return;
  tfBuildBar();
  for (const b of $('#tfRef').children) b.classList.toggle('on', +b.dataset.ref === s.ref);
  const ref = tfRefPoint();
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  const r2 = v => Math.round(v * 100) / 100;
  set('#tfX', r2(ref[0] + s.num.dx)); set('#tfY', r2(ref[1] + s.num.dy));
  set('#tfW', r2(s.num.sx * 100)); set('#tfH', r2(s.num.sy * 100));
  set('#tfRot', r2(s.num.rot)); set('#tfSkewH', r2(s.num.skewX)); set('#tfSkewV', r2(s.num.skewY));
  $('#tfLink').classList.toggle('on', tfLinkWH);
  $('#tfMode').textContent = s.cas ? '内容识别缩放' : (TF_KINDS[s.kind] || '变换');
  document.querySelector('.app').classList.toggle('cas-scaling', !!s.cas);
  if (s.cas) casSyncBar();
  const warp = $('#tfWarp');
  if (warp) { warp.disabled = !!s.sel; warp.title = s.pathOnly || s.vector ? '在自由变换和变形模式之间切换' : '变形'; warp.classList.toggle('on', !!s.pathWarp); }
  if (s.pathWarp) PW.syncBar();
  $('#tfWhy').textContent = '';                        
}





export function moveLockWhy(idx){
  if (idx == null || idx < 0 || !doc || !doc.layers[idx]) return '';
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!L) return '';
  const nm = layerRenames[idx] || L.name || doc.layers[idx].name || ('图层 ' + idx);
  if (effLock(idx, L, 'lockAll', 'all')) return `「${nm}」已全部锁定：点图层面板「锁定」那一排最右边的 🔒 解开`;
  if (effLock(idx, L, 'lockPosition', 'position')) return `「${nm}」锁定了位置：点图层面板「锁定」那一排的 ✥ 解开`;
  

  if (isBackgroundLayer(idx)) return `「${nm}」是背景图层，请解锁后才能操作`;
  return '';
}
export function sayLocked(why){ if (!why) return false; shell.status(why); $('#notice').textContent = why; return true; }
