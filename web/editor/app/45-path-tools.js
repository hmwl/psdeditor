




import './44-vector-path.js';   
import { panels } from '../panels.js';
import { PATH_UI_ICONS } from '../path-icons.js';
import { isShapeLayer } from '../property-panel.js';
import { psPanels } from '../ps-panels.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, createSelection, ensureLazy, icon } from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, layerDeletes, layerTree, li, origBuffer, selection,
} from './02-doc-state.js';
import { pushDocHistory, structuralBegin, structuralDone } from './03-history.js';
import {
  PATH_OP_LABEL, PATH_OP_LIST, clearWorkPath, cloneDocSubs, docPathLabel, featherAlpha, getDocPath,
  isDocPathKey, lerpPt, opCode, opCompositeOf, pathTargetKey, penOpts, popEsc, savePenOpts, setDocPath,
  set_activePath, shapeOpts, shapePop, subpathsBBox, syncShapeBar,
} from './17-shape-pen.js';
import { V2, densifyPts, fitBezierClosed, freePenOpts, syncPenBar } from './18-pen-extra.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import {
  commitLayerOps, dropLayerOp, findLayerOp, humanEditError, opField, putLayerOp, renderProps, setOpField,
} from './24-layer-ops-queue.js';
import { docPatterns } from './26-layer-create.js';
import { gradModelStops, gradNewModel, parseHex6 } from './27-gradient-editor.js';
import { ALIGN_BTNS, ALIGN_LABEL, mkEl } from './28-layer-props-transform.js';
import { renderStaticLayers } from './30-render.js';
import { TOOL_RESETTERS, bgRGB, docTool, fgRGB, hexOf, setDocTool } from './31-selection-brush.js';
import { combineInto, selPath, syncGizmoCursor } from './32-cursors-select-options.js';
import { AB_BAR_ICONS } from './36-clipboard-frame.js';
import {
  PATH_OPS, clonePathSubpaths, effPathSubpaths, flattenSub, nearNum, pathDrag, pathGuard, pathHoverNode,
  pathModel, pathNodes, pathSelNode, pathSubpathsEq, pathWorking, readVectorPath, readVectorStroke,
  set_pathDrag, set_pathModel, set_pathNodes, set_pathSelNode,
} from './44-vector-path.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import { buildPsdBuffer, ensureStructuralBase } from './48-info-export.js';











export const PATH_EDIT_TOOLS = new Set(['path', 'addAnchor', 'deleteAnchor', 'convertPoint', 'pathSelect']);
export let pathSelSubs = new Set();      
export function set_pathSelSubs(v) { return (pathSelSubs = v); }   
export let pathSelAnchors = new Set();   
export let pathSubDrag = null;           
export function set_pathSubDrag(v) { return (pathSubDrag = v); }   
export let pathAnchorDrag = null;        
export function set_pathAnchorDrag(v) { return (pathAnchorDrag = v); }   
export let pathSegDrag = null;           
export function set_pathSegDrag(v) { return (pathSegDrag = v); }   
export let pathMarquee = null;           
export function set_pathMarquee(v) { return (pathMarquee = v); }   
export const pak = (s, k) => s + ':' + k;







export const pathOpts = { scope: 'layer', constrain: false, alignTo: 'selection', snapEdges: false };
export const pathLook = { width: 1, color: '#0096ff' };
try { Object.assign(pathOpts, JSON.parse(localStorage.getItem('psd_editor.pathOpts') || '{}')); } catch {}
try { Object.assign(pathLook, JSON.parse(localStorage.getItem('psd_editor.pathLook') || '{}')); } catch {}
export const savePathOpts = () => { try { localStorage.setItem('psd_editor.pathOpts', JSON.stringify(pathOpts)); localStorage.setItem('psd_editor.pathLook', JSON.stringify(pathLook)); } catch {} };




export function pathHitTol(px){
  const t = dispThr(px);
  return Number.isFinite(t) ? Math.max(3, Math.min(t, 24)) : Math.max(3, px);
}

export function pathNearestSegment(sp, pt){
  if (!sp || !pt) return null;
  const tol = pathHitTol(9);
  let best = null;
  for (let s = 0; s < sp.length; s++) {
    const K = sp[s].knots;
    if (K.length < 2) continue;
    const n = sp[s].closed !== false ? K.length : K.length - 1;
    for (let i = 0; i < n; i++) {
      const a = K[i], b = K[(i + 1) % K.length];
      const c1 = a.out || a.anchor, c2 = b.in || b.anchor;
      for (let q = 0; q <= 32; q++) {
        const u = q / 32, v = 1 - u;
        const x = v * v * v * a.anchor[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b.anchor[0];
        const y = v * v * v * a.anchor[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b.anchor[1];
        const d = Math.hypot(pt.x - x, pt.y - y);
        if (!best || d < best.d) best = { s, i, t: u, x, y, d };
      }
    }
  }
  return best && best.d <= tol ? best : null;
}

function pathSubpathAt(sp, pt){
  const seg = pathNearestSegment(sp, pt);
  if (seg) return seg.s;
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const c = cv.getContext('2d');
  if (!c) return -1;
  for (let s = sp.length - 1; s >= 0; s--) {              
    if (sp[s].closed === false || sp[s].knots.length < 2) continue;
    tracePathSub(c, sp[s]);
    if (c.isPointInPath(pt.x, pt.y)) return s;
  }
  return -1;
}

function pathLayerAt(pt){
  const flat = (layerTree && layerTree.flat) || [];
  for (let i = flat.length - 1; i >= 0; i--) {
    const l = flat[i];
    if (!l || l.hidden || layerDeletes.has(i) || !(l.vectorMask || l.hasVectorMask)) continue;
    const sp = effPathSubpaths(i);
    if (sp && sp.length && pathSubpathAt(sp, pt) >= 0) return i;
  }
  return -1;
}




function pathKnotIsSmooth(kn){
  for (const w of ['in', 'out']) {
    const h = kn[w];
    if (h && !(nearNum(h[0], kn.anchor[0]) && nearNum(h[1], kn.anchor[1]))) return true;
  }
  return false;
}
const handleCollapsed = (kn, w) => { const h = kn[w] || kn.anchor; return nearNum(h[0], kn.anchor[0]) && nearNum(h[1], kn.anchor[1]); };

function knotHandlesCollinear(kn){
  if (handleCollapsed(kn, 'in') || handleCollapsed(kn, 'out')) return false;
  const a = V2.norm(V2.sub(kn.in, kn.anchor)), b = V2.norm(V2.sub(kn.out, kn.anchor));
  return V2.dot(a, b) < -0.995;
}

function pathMakeSmooth(sub, k){
  const K = sub.knots, n = K.length, kn = K[k];
  if (n < 2) return;
  const closed = sub.closed !== false;
  const prev = K[(k - 1 + n) % n].anchor, next = K[(k + 1) % n].anchor;
  let tx, ty;
  if (!closed && (k === 0 || k === n - 1)) {
    const o = k === 0 ? K[1].anchor : K[n - 2].anchor;
    tx = (o[0] - kn.anchor[0]) / 3; ty = (o[1] - kn.anchor[1]) / 3;
    if (k === n - 1) { tx = -tx; ty = -ty; }
  } else { tx = (next[0] - prev[0]) / 6; ty = (next[1] - prev[1]) / 6; }
  kn.in = [kn.anchor[0] - tx, kn.anchor[1] - ty];
  kn.out = [kn.anchor[0] + tx, kn.anchor[1] + ty];
}




function pathConvertKnot(sub, k){
  const kn = sub.knots[k];
  if (pathKnotIsSmooth(kn)) { kn.in = kn.anchor.slice(); kn.out = kn.anchor.slice(); }
  else pathMakeSmooth(sub, k);
}

export function pathInsertAnchor(sp, hit){
  const K = sp[hit.s].knots;
  const a = K[hit.i], b = K[(hit.i + 1) % K.length];
  const c1 = (a.out || a.anchor).slice(), c2 = (b.in || b.anchor).slice(), t = hit.t;
  const q0 = lerpPt(a.anchor, c1, t), q1 = lerpPt(c1, c2, t), q2 = lerpPt(c2, b.anchor, t);
  const r0 = lerpPt(q0, q1, t), r1 = lerpPt(q1, q2, t), p = lerpPt(r0, r1, t);
  a.out = q0; b.in = q2;
  K.splice(hit.i + 1, 0, { anchor: p, in: r0, out: r1, linked: true });
  return hit.i + 1;
}


export function pathRemoveAnchor(sp, s, k, key){
  const K = sp[s].knots;
  if (K.length > 2) { K.splice(k, 1); return 'knot'; }
  if (sp.length <= 1 && !isDocPathKey(key)) { $('#notice').textContent = '这是最后一条子路径了：再删就空了 —— 要去掉整个矢量蒙版请用「图层 › 矢量蒙版 › 删除」。'; return ''; }
  sp.splice(s, 1);
  return 'sub';
}


export function pathToolDown(ev, pt){
  let key = pathTargetKey();
  let why = pathGuard(key);
  
  if ((docTool === 'pathSelect' || docTool === 'path') && pathOpts.scope === 'all') {
    const own = !why ? pathWorking(key) : null;
    const hitOwn = own && (pathSubpathAt(own, pt) >= 0 || pathPick(pt) >= 0);
    if (!hitOwn) {
      const other = pathLayerAt(pt);
      if (other >= 0 && other !== key) {
        set_activePath(null); set_selLayer(other); selLayers.clear(); selLayers.add(other);
        set_pathModel(null); pathSelSubs.clear(); pathSelAnchors.clear(); set_pathSelNode(null);
        renderLayerPanel(); renderProps(); try { psPanels.refreshPaths(layerTree); } catch {}
        key = other; why = pathGuard(key);
      }
    }
  }
  if (why) { $('#err').textContent = '路径编辑用不了：' + why; return false; }
  $('#err').textContent = '';
  const sp = pathWorking(key);
  if (!sp) return false;
  set_pathNodes(pathBuildNodes(sp));
  if (docTool === 'path') return directSelectDown(ev, pt, key, sp);

  if (docTool === 'addAnchor') {
    const hit = pathNearestSegment(sp, pt);
    if (!hit) { $('#notice').textContent = '添加锚点：点在路径线上才会加点。'; return false; }
    const k = pathInsertAnchor(sp, hit);
    set_pathSelNode({ s: hit.s, k, which: 'anchor' });
    pathSelAnchors.clear(); pathSelAnchors.add(pak(hit.s, k));
    commitPathEdit(key, '添加锚点');
    
    const kn = sp[hit.s].knots[k];
    pathAnchorDrag = { key, start: { x: pt.x, y: pt.y }, moved: false, orig: new Map([[pak(hit.s, k), cloneKnot(kn)]]) };
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    drawGizmo();
    return true;
  }
  if (docTool === 'deleteAnchor') {
    const hp = pathPickAnchor(pt);
    const nd = hp >= 0 ? pathNodes[hp] : null;
    if (!nd) { $('#notice').textContent = '删除锚点：点在锚点（方块）上才会删。'; return false; }
    const what = pathRemoveAnchor(sp, nd.s, nd.k, key);
    if (!what) return false;
    set_pathSelNode(null); pathSelSubs.clear(); pathSelAnchors.clear();
    commitPathEdit(key, '删除锚点');
    drawGizmo();
    shell.status(what === 'sub' ? '删除锚点：这条子路径只剩两个点，整条一起删掉了（PS 同）' : '已删除一个锚点');
    return true;
  }
  if (docTool === 'convertPoint') {
    
    const hh = pathPick(pt);
    const hn = hh >= 0 ? pathNodes[hh] : null;
    if (hn && hn.which !== 'anchor') {
      set_pathSelNode({ s: hn.s, k: hn.k, which: hn.which });
      const kn = sp[hn.s].knots[hn.k];
      set_pathDrag({ key, node: pathSelNode, start: { x: pt.x, y: pt.y }, moved: false, independent: true, orig: cloneKnot(kn) });
      try { gizmo.setPointerCapture(ev.pointerId); } catch {}
      return true;
    }
    const hp = pathPickAnchor(pt);
    const nd = hp >= 0 ? pathNodes[hp] : null;
    if (!nd) { $('#notice').textContent = '转换点：点在锚点（方块）上才会切换平滑 / 角点。'; return false; }
    const kn = sp[nd.s].knots[nd.k];
    const wasSmooth = pathKnotIsSmooth(kn);
    const orig = cloneKnot(kn);
    set_pathSelNode({ s: nd.s, k: nd.k, which: 'anchor' });
    
    if (wasSmooth) { pathConvertKnot(sp[nd.s], nd.k); }
    set_pathDrag({ key, node: { s: nd.s, k: nd.k, which: 'out' }, start: { x: pt.x, y: pt.y }, moved: false, convert: true, wasSmooth,
                 orig: { anchor: kn.anchor.slice(), in: kn.anchor.slice(), out: kn.anchor.slice(), linked: !!orig.linked } });
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    if (wasSmooth) commitPathEdit(key, '转换点');
    drawGizmo();
    shell.status(wasSmooth ? '锚点 → 角点（按住拖可以重新拉出手柄）' : '点一下 = 变平滑点；按住拖 = 按拖动方向拉出一对手柄');
    return true;
  }
  
  const s = pathSubpathAt(sp, pt);
  if (s < 0) {
    if (!ev.shiftKey) pathSelSubs.clear();
    pathMarquee = { key, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, base: new Set(pathSelSubs), subs: true };
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    syncPathPanel(); drawGizmo();
    return true;
  }
  return subpathPress(ev, pt, key, sp, s, !!ev.altKey);
}
export const cloneKnot = k => ({ anchor: k.anchor.slice(), in: (k.in || k.anchor).slice(), out: (k.out || k.anchor).slice(), linked: !!k.linked });

function subpathPress(ev, pt, key, sp, s, dup){
  if (ev.shiftKey && docTool === 'pathSelect') { if (pathSelSubs.has(s)) pathSelSubs.delete(s); else pathSelSubs.add(s); }
  else if (!pathSelSubs.has(s)) { pathSelSubs.clear(); pathSelSubs.add(s); }
  set_pathSelNode(null);
  if (docTool === 'path') { pathSelAnchors.clear(); for (const si of pathSelSubs) sp[si].knots.forEach((_, k) => pathSelAnchors.add(pak(si, k))); }
  if (pathSelSubs.size) {
    const orig = new Map();
    for (const si of pathSelSubs) orig.set(si, sp[si].knots.map(cloneKnot));
    pathSubDrag = { key, start: { x: pt.x, y: pt.y }, moved: false, orig, dup };
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  }
  syncPathPanel();                    
  drawGizmo(); syncGizmoCursor();
  return true;
}


function directSelectDown(ev, pt, key, sp){
  const hit = pathPick(pt);
  if (hit >= 0) {
    const nd = pathNodes[hit];
    if (ev.altKey && nd.which === 'anchor') return subpathPress(ev, pt, key, sp, nd.s, true);
    if (nd.which !== 'anchor') return beginPathDrag(ev, pt, hit);
    const id = pak(nd.s, nd.k);
    if (ev.shiftKey) { if (pathSelAnchors.has(id)) pathSelAnchors.delete(id); else pathSelAnchors.add(id); }
    else if (!pathSelAnchors.has(id)) { pathSelAnchors.clear(); pathSelAnchors.add(id); }
    pathSelSubs.clear();
    set_pathSelNode({ s: nd.s, k: nd.k, which: 'anchor' });
    const orig = new Map();
    for (const a of pathSelAnchors) { const [si, ki] = a.split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (kn) orig.set(a, cloneKnot(kn)); }
    pathAnchorDrag = { key, start: { x: pt.x, y: pt.y }, moved: false, orig, clickId: ev.shiftKey ? null : id };
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    syncPathPanel(); drawGizmo();
    return true;
  }
  const seg = pathNearestSegment(sp, pt);
  if (seg) {
    if (ev.altKey) return subpathPress(ev, pt, key, sp, seg.s, true);
    const K = sp[seg.s].knots, j = (seg.i + 1) % K.length, a = K[seg.i], b = K[j];
    if (!ev.shiftKey) pathSelAnchors.clear();
    pathSelSubs.clear(); set_pathSelNode(null);
    if (handleCollapsed(a, 'out') && handleCollapsed(b, 'in')) {
      
      pathSelAnchors.add(pak(seg.s, seg.i)); pathSelAnchors.add(pak(seg.s, j));
      const orig = new Map();
      for (const id of pathSelAnchors) { const [si, ki] = id.split(':').map(Number); orig.set(id, cloneKnot(sp[si].knots[ki])); }
      pathAnchorDrag = { key, start: { x: pt.x, y: pt.y }, moved: false, orig };
    } else {
      pathSegDrag = { key, s: seg.s, i: seg.i, j, t: Math.max(0.02, Math.min(0.98, seg.t)), start: { x: pt.x, y: pt.y }, moved: false,
                      a: cloneKnot(a), b: cloneKnot(b), aSmooth: knotHandlesCollinear(a), bSmooth: knotHandlesCollinear(b) };
    }
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    syncPathPanel(); drawGizmo();
    return true;
  }
  if (!ev.shiftKey) { pathSelAnchors.clear(); set_pathSelNode(null); }
  pathMarquee = { key, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, base: new Set(pathSelAnchors), subs: false };
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  syncPathPanel(); drawGizmo();
  return true;
}

function constrainDelta(ev, dx, dy){
  if (ev && ev.shiftKey) {
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy);
    dx = Math.cos(a) * L; dy = Math.sin(a) * L;
    if (Math.abs(dx) < 1e-9) dx = 0; if (Math.abs(dy) < 1e-9) dy = 0;
  }
  if (pathOpts.snapEdges) { dx = Math.round(dx); dy = Math.round(dy); }
  return [dx, dy];
}
export function movePathSubDrag(ev, pt){
  const D = pathSubDrag; if (!D || !pathModel) return;
  let [dx, dy] = constrainDelta(ev, pt.x - D.start.x, pt.y - D.start.y);
  const sp = pathModel.subpaths;
  if (Math.hypot(dx, dy) > 1e-6 && !D.moved) {
    D.moved = true;
    
    if (D.dup) {
      const next = new Map(), sel = new Set();
      for (const [si, snap] of D.orig) {
        const src = sp[si];
        sp.push({ closed: src.closed, operation: src.operation, knots: snap.map(cloneKnot) });
        next.set(sp.length - 1, snap); sel.add(sp.length - 1);
      }
      D.orig = next; pathSelSubs = sel;
      if (docTool === 'path') { pathSelAnchors.clear(); for (const si of sel) sp[si].knots.forEach((_, k) => pathSelAnchors.add(pak(si, k))); }
    }
  }
  for (const [si, snap] of D.orig) {
    const K = sp[si] && sp[si].knots; if (!K) continue;
    snap.forEach((o, k) => {
      const kn = K[k]; if (!kn) return;
      kn.anchor = [o.anchor[0] + dx, o.anchor[1] + dy];
      kn.in = [o.in[0] + dx, o.in[1] + dy];
      kn.out = [o.out[0] + dx, o.out[1] + dy];
    });
  }
  drawGizmo();
}
export function endPathSubDrag(){
  const D = pathSubDrag; pathSubDrag = null;
  if (!D) return;
  if (!D.moved) { drawGizmo(); return; }
  commitPathEdit(D.key, D.dup ? '复制路径' : '拖移路径');
}
export function moveAnchorDrag(ev, pt){
  const D = pathAnchorDrag; if (!D || !pathModel) return;
  const [dx, dy] = constrainDelta(ev, pt.x - D.start.x, pt.y - D.start.y);
  const sp = pathModel.subpaths;
  for (const [id, o] of D.orig) {
    const [si, ki] = id.split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (!kn) continue;
    kn.anchor = [o.anchor[0] + dx, o.anchor[1] + dy];
    kn.in = [o.in[0] + dx, o.in[1] + dy];
    kn.out = [o.out[0] + dx, o.out[1] + dy];
  }
  if (Math.hypot(dx, dy) > 1e-6) D.moved = true;
  drawGizmo();
}
export function endAnchorDrag(){
  const D = pathAnchorDrag; pathAnchorDrag = null;
  if (!D) return;
  
  if (!D.moved) { if (D.clickId && pathSelAnchors.size > 1) { pathSelAnchors = new Set([D.clickId]); syncPathPanel(); } drawGizmo(); return; }
  commitPathEdit(D.key, '移动锚点');
}



export function moveSegDrag(ev, pt){
  const D = pathSegDrag; if (!D || !pathModel) return;
  const K = pathModel.subpaths[D.s] && pathModel.subpaths[D.s].knots; if (!K) return;
  const a = K[D.i], b = K[D.j], t = D.t;
  const dx = pt.x - D.start.x, dy = pt.y - D.start.y;
  let w;
  if (t <= 1 / 6) w = 0;
  else if (t <= 0.5) w = Math.pow((6 * t - 1) / 2, 3) / 2;
  else if (t <= 5 / 6) w = (1 - Math.pow((6 * (1 - t) - 1) / 2, 3)) / 2 + 0.5;
  else w = 1;
  const k0 = (1 - w) / (3 * t * (1 - t) * (1 - t)), k1 = w / (3 * t * t * (1 - t));
  a.out = [D.a.out[0] + dx * k0, D.a.out[1] + dy * k0];
  b.in = [D.b.in[0] + dx * k1, D.b.in[1] + dy * k1];
  const keepSmooth = (kn, orig, moved, other) => {
    if (pathOpts.constrain || !orig) return;
    const L = Math.hypot(orig[other][0] - orig.anchor[0], orig[other][1] - orig.anchor[1]);
    const v = V2.norm(V2.sub(kn[moved], kn.anchor));
    kn[other] = [kn.anchor[0] - v[0] * L, kn.anchor[1] - v[1] * L];
  };
  if (D.aSmooth) keepSmooth(a, D.a, 'out', 'in'); else if (!pathOpts.constrain) a.in = D.a.in.slice();
  if (D.bSmooth) keepSmooth(b, D.b, 'in', 'out'); else if (!pathOpts.constrain) b.out = D.b.out.slice();
  if (Math.hypot(dx, dy) > 1e-6) D.moved = true;
  drawGizmo();
}
export function endSegDrag(){
  const D = pathSegDrag; pathSegDrag = null;
  if (!D) return;
  if (!D.moved) { drawGizmo(); return; }
  commitPathEdit(D.key, '调整路径段');
}
export function movePathMarquee(ev, pt){
  const M = pathMarquee; if (!M) return;
  M.x1 = pt.x; M.y1 = pt.y;
  const x0 = Math.min(M.x0, M.x1), x1 = Math.max(M.x0, M.x1), y0 = Math.min(M.y0, M.y1), y1 = Math.max(M.y0, M.y1);
  const sp = pathWorking(M.key) || [];
  const inR = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  if (M.subs) {
    
    const set = new Set(M.base);
    sp.forEach((sub, si) => {
      const bb = subpathsBBox([sub]); if (!bb) return;
      if (x1 - x0 > 0 && y1 - y0 > 0 && bb.x <= x1 && bb.x + bb.width >= x0 && bb.y <= y1 && bb.y + bb.height >= y0) set.add(si);
    });
    pathSelSubs = set;
  } else {
    const set = new Set(M.base);
    sp.forEach((sub, si) => sub.knots.forEach((k, ki) => { if (inR(k.anchor)) set.add(pak(si, ki)); }));
    pathSelAnchors = set;
  }
  drawGizmo();
}
export function endPathMarquee(){
  const M = pathMarquee; pathMarquee = null;
  if (!M) return;
  syncPathPanel(); drawGizmo();
}

export function nudgePathSelection(dx, dy){
  const key = pathTargetKey();
  if (pathGuard(key)) return false;
  const sp = pathWorking(key); if (!sp) return false;
  let n = 0;
  const mv = kn => { kn.anchor = [kn.anchor[0] + dx, kn.anchor[1] + dy]; kn.in = [(kn.in || kn.anchor)[0] + dx, (kn.in || kn.anchor)[1] + dy]; kn.out = [(kn.out || kn.anchor)[0] + dx, (kn.out || kn.anchor)[1] + dy]; n++; };
  if (docTool === 'pathSelect') { for (const si of pathSelSubs) if (sp[si]) { sp[si].knots.forEach(kn => { const a0 = kn.anchor; mv(kn); }); } }
  else for (const id of pathSelAnchors) { const [si, ki] = id.split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (kn) mv(kn); }
  if (!n) return false;
  commitPathEdit(key, '微移路径');
  drawGizmo();
  return true;
}

export function deleteSelectedSubpaths(){
  if (docTool !== 'pathSelect' || !pathSelSubs.size) return false;
  const idx = pathTargetKey(), sp = pathWorking(idx);
  if (!sp) return false;
  if (pathSelSubs.size >= sp.length) {
    if (isDocPathKey(idx)) { pathSelSubs.clear(); set_pathModel(null); if (idx === 'work') return clearWorkPath(); setDocPath(idx, [], '删除路径'); return true; }
    $('#notice').textContent = '这会把矢量蒙版里的子路径删光 —— 要去掉整个蒙版请用「图层 › 矢量蒙版 › 删除」。';
    return false;
  }
  const kill = [...pathSelSubs].sort((a, b) => b - a);
  for (const s of kill) sp.splice(s, 1);
  pathSelSubs.clear(); set_pathSelNode(null);
  commitPathEdit(idx, '删除路径');
  drawGizmo();
  shell.status(`已删除 ${kill.length} 条子路径`);
  return true;
}


export function deleteSelectedAnchors(){
  if (docTool !== 'path' || !pathSelAnchors.size) return false;
  const key = pathTargetKey(), sp = pathWorking(key);
  if (!sp) return false;
  const out = [];
  sp.forEach((sub, si) => {
    const K = sub.knots, n = K.length;
    const dead = K.map((_, k) => pathSelAnchors.has(pak(si, k)));
    if (!dead.some(Boolean)) { out.push(sub); return; }
    const runs = [];
    if (sub.closed !== false) {
      const start = dead.indexOf(true);
      let cur = [];
      for (let q = 1; q <= n; q++) {
        const k = (start + q) % n;
        if (dead[k]) { if (cur.length) runs.push(cur); cur = []; } else cur.push(K[k]);
      }
      if (cur.length) runs.push(cur);
    } else {
      let cur = [];
      K.forEach((kn, k) => { if (dead[k]) { if (cur.length) runs.push(cur); cur = []; } else cur.push(kn); });
      if (cur.length) runs.push(cur);
    }
    for (const r of runs) if (r.length >= 2) out.push({ closed: false, operation: sub.operation, knots: r });
  });
  if (!out.length && !isDocPathKey(key)) { $('#notice').textContent = '这会把矢量蒙版里的路径删光 —— 要去掉整个蒙版请用「图层 › 矢量蒙版 › 删除」。'; return false; }
  const removed = pathSelAnchors.size;
  sp.length = 0; sp.push(...out);
  pathSelAnchors.clear(); set_pathSelNode(null); pathSelSubs.clear();
  if (!out.length && key === 'work') { set_pathModel(null); return clearWorkPath(); }
  commitPathEdit(key, '删除锚点');
  drawGizmo();
  shell.status(`已删除 ${removed} 个锚点（连同两侧的线段，路径在那儿断开）`);
  return true;
}



function pathArrangeTargets(sp){
  const sel = [...pathSelSubs].filter(i => sp[i]).sort((a, b) => a - b);
  return sel.length ? sel : sp.map((_, i) => i);
}

export function setSelectedPathOp(opName){
  const key = pathTargetKey();
  if (pathGuard(key)) return false;
  const sp = pathWorking(key); if (!sp) return false;
  const tg = pathSelSubs.size ? [...pathSelSubs] : [];
  if (!tg.length) return false;
  for (const i of tg) if (sp[i]) sp[i].operation = isDocPathKey(key) ? opCode(opName) : opName;
  commitPathEdit(key, PATH_OP_LABEL[opName] || '路径操作');
  drawGizmo();
  return true;
}


export function mergePathComponents(){
  const key = pathTargetKey();
  if (pathGuard(key)) { $('#notice').textContent = pathGuard(key); return false; }
  const sp = pathWorking(key); if (!sp || !sp.length) return false;
  const tg = pathArrangeTargets(sp);
  const part = tg.map(i => sp[i]);
  const bb = subpathsBBox(part); if (!bb) return false;
  const SS = 4, pad = 2;
  const W = Math.max(1, Math.ceil((bb.width + pad * 2) * SS)), Hh = Math.max(1, Math.ceil((bb.height + pad * 2) * SS));
  if (W * Hh > 36e6) { $('#notice').textContent = '路径太大，合并形状组件算不动（超过 3600 万采样点）。'; return false; }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.setTransform(SS, 0, 0, SS, (pad - bb.x) * SS, (pad - bb.y) * SS);
  part.forEach((sub, si) => {
    c.save(); tracePathSub(c, sub);
    if (si > 0) c.globalCompositeOperation = opCompositeOf(sub.operation);
    c.fillStyle = '#fff'; c.fill(); c.restore();
  });
  const d = c.getImageData(0, 0, W, Hh).data;
  const mask = new Uint8Array(W * Hh);
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] >= 128 ? 255 : 0;
  const polys = traceMaskContours(mask, W, Hh);
  const merged = polys.map(poly => {
    const pts = poly.map(p => [p[0] / SS + bb.x - pad, p[1] / SS + bb.y - pad]);
    return { closed: true, operation: isDocPathKey(key) ? 1 : 'combine', knots: fitBezierClosed(densifyPts(pts, 0.5), 0.5) };
  }).filter(s => s.knots.length >= 2);
  if (!merged.length) { $('#notice').textContent = '合并之后什么都不剩（选中的组件互相减光了）。'; return false; }
  
  for (let i = 0; i < merged.length; i++) {
    const p = merged[i].knots[0].anchor;
    let depth = 0;
    const cv1 = document.createElement('canvas'); cv1.width = cv1.height = 1; const c1 = cv1.getContext('2d');
    merged.forEach((o, j) => { if (j !== i) { tracePathSub(c1, o); if (c1.isPointInPath(p[0], p[1])) depth++; } });
    if (depth % 2) merged[i].operation = isDocPathKey(key) ? 2 : 'subtract';
  }
  merged.sort((a, b) => opCode(a.operation) === 2 ? 1 : opCode(b.operation) === 2 ? -1 : 0);
  const keep = sp.filter((_, i) => !tg.includes(i));
  const at = Math.min(...tg);
  keep.splice(Math.min(at, keep.length), 0, ...merged);
  sp.length = 0; sp.push(...keep);
  pathSelSubs.clear(); pathSelAnchors.clear(); set_pathSelNode(null);
  commitPathEdit(key, '合并形状组件');
  drawGizmo();
  shell.status(`合并形状组件：${tg.length} 条 → ${merged.length} 条`);
  return true;
}

function traceMaskContours(mask, W, H){
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  
  const next = new Map();
  const key = (x, y) => y * (W + 1) + x;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) next.set(key(x, y) * 4 + 0, [x + 1, y]);          
    if (!at(x + 1, y)) next.set(key(x + 1, y) * 4 + 1, [x + 1, y + 1]);  
    if (!at(x, y + 1)) next.set(key(x + 1, y + 1) * 4 + 2, [x, y + 1]);  
    if (!at(x - 1, y)) next.set(key(x, y + 1) * 4 + 3, [x, y]);          
  }
  const polys = [];
  const take = (x, y) => { for (let d = 0; d < 4; d++) { const k = key(x, y) * 4 + d; if (next.has(k)) { const v = next.get(k); next.delete(k); return v; } } return null; };
  for (const [k0, v0] of next) {
    if (!next.has(k0)) continue;
    next.delete(k0);
    const pk = Math.floor(k0 / 4), sx = pk % (W + 1), sy = Math.floor(pk / (W + 1));
    const pts = [[sx, sy]];
    let cur = v0, guard = 0;
    while (cur && !(cur[0] === sx && cur[1] === sy) && guard++ < 4e6) { pts.push(cur); cur = take(cur[0], cur[1]); }
    
    const out = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]); });
    if (out.length >= 3) polys.push(out);
  }
  return polys;
}

export function arrangePathSubs(how){
  const key = pathTargetKey();
  if (pathGuard(key)) return false;
  const sp = pathWorking(key); if (!sp || !pathSelSubs.size) { $('#notice').textContent = '路径排列：先用路径选择工具选中要挪的子路径。'; return false; }
  const sel = [...pathSelSubs].sort((a, b) => a - b);
  const items = sp.map((sub, i) => ({ sub, on: pathSelSubs.has(i) }));
  let order;
  if (how === 'front') order = items.filter(x => !x.on).concat(items.filter(x => x.on));
  else if (how === 'back') order = items.filter(x => x.on).concat(items.filter(x => !x.on));
  else {
    order = items.slice();
    if (how === 'forward') { for (let i = order.length - 2; i >= 0; i--) if (order[i].on && !order[i + 1].on) [order[i], order[i + 1]] = [order[i + 1], order[i]]; }
    else for (let i = 1; i < order.length; i++) if (order[i].on && !order[i - 1].on) [order[i], order[i - 1]] = [order[i - 1], order[i]];
  }
  if (order.every((x, i) => x === items[i])) return false;
  sp.length = 0; sp.push(...order.map(x => x.sub));
  pathSelSubs = new Set(order.map((x, i) => x.on ? i : -1).filter(i => i >= 0));
  commitPathEdit(key, ({ front: '将形状置为顶层', forward: '将形状前移一层', backward: '将形状后移一层', back: '将形状置为底层' })[how]);
  drawGizmo();
  return sel.length > 0;
}

export function alignPathSubs(how){
  const key = pathTargetKey();
  if (pathGuard(key)) return false;
  const sp = pathWorking(key); if (!sp) return false;
  const tg = [...pathSelSubs].filter(i => sp[i]);
  if (!tg.length) { $('#notice').textContent = '路径对齐：先用路径选择工具选中子路径。'; return false; }
  const toCanvas = pathOpts.alignTo === 'canvas' || tg.length < 2;
  const boxes = tg.map(i => ({ i, b: subpathsBBoxTight([sp[i]]) })).filter(x => x.b);
  const T = toCanvas ? { x: 0, y: 0, width: docW, height: docH } : subpathsBBoxTight(tg.map(i => sp[i]));
  const shift = (i, dx, dy) => sp[i].knots.forEach(kn => { kn.anchor = [kn.anchor[0] + dx, kn.anchor[1] + dy]; kn.in = [kn.in[0] + dx, kn.in[1] + dy]; kn.out = [kn.out[0] + dx, kn.out[1] + dy]; });
  if (how.startsWith('dist-')) {
    const ax = how === 'dist-h';
    if (boxes.length < 3) { $('#notice').textContent = '分布至少要选中三条子路径。'; return false; }
    const c = x => ax ? x.b.x + x.b.width / 2 : x.b.y + x.b.height / 2;
    boxes.sort((p, q) => c(p) - c(q));
    const a0 = c(boxes[0]), a1 = c(boxes[boxes.length - 1]);
    boxes.forEach((x, k) => { const want = a0 + (a1 - a0) * k / (boxes.length - 1), d = want - c(x); shift(x.i, ax ? d : 0, ax ? 0 : d); });
  } else {
    for (const x of boxes) {
      const b = x.b; let dx = 0, dy = 0;
      if (how === 'left') dx = T.x - b.x; else if (how === 'right') dx = T.x + T.width - b.x - b.width;
      else if (how === 'hcenter') dx = T.x + T.width / 2 - b.x - b.width / 2;
      else if (how === 'top') dy = T.y - b.y; else if (how === 'bottom') dy = T.y + T.height - b.y - b.height;
      else if (how === 'vcenter') dy = T.y + T.height / 2 - b.y - b.height / 2;
      if (dx || dy) shift(x.i, dx, dy);
    }
  }
  commitPathEdit(key, '对齐路径');
  drawGizmo();
  return true;
}

export function subpathsBBoxTight(subs){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sub of subs) for (const p of flattenSub(sub, 2)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}


export const PATH_OP_SVG = (() => {
  const A = 'M2 2h9v9H2z', B = 'M7 7h9v9H7z';
  const wrap = body => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="display:block">${body}</svg>`;
  const st = 'fill="none" stroke="currentColor" stroke-width="1"';
  return {
    new: wrap(`<path d="M4 4h10v10H4z" fill="currentColor" opacity=".85"/>`),
    combine: wrap(`<path d="M2 2h9v5h5v9H7v-5H2z" fill="currentColor" opacity=".85"/>`),
    subtract: wrap(`<path d="M2 2h9v5H7v4H2z" fill="currentColor" opacity=".85"/><path d="${B}" ${st}/>`),
    intersect: wrap(`<path d="${A}" ${st}/><path d="${B}" ${st}/><path d="M7 7h4v4H7z" fill="currentColor"/>`),
    exclude: wrap(`<path d="M2 2h9v5H7v4H2z M11 7h5v9H7v-5h4z" fill="currentColor" opacity=".85"/><path d="M7 7h4v4H7z" ${st}/>`),
  };
})();
const ARRANGE_SVG = (() => {
  const w = b => `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="display:block">${b}</svg>`;
  return { arrange: w('<path d="M2 6h9v9H2z" fill="none" stroke="currentColor"/><path d="M6 2h10v10H6z" fill="currentColor" opacity=".85"/>') };
})();

function iconPopup(items, rect){
  const pop = panels.popup(items, rect);
  if (!pop) return pop;
  const rows = [...pop.children].filter(el => el.classList.contains('menu-item'));
  let r = 0;
  for (const it of items) {
    if (it.sep) continue;
    const row = rows[r++]; if (!row) break;
    if (it.icon && !it.checked) {
      const m = row.querySelector('.menu-mark');
      if (typeof it.icon === 'string' && it.icon.startsWith('<svg')) m.innerHTML = it.icon;
      else if (typeof it.icon === 'string' && /^(data:|\/assets\/)/.test(it.icon)) { const img = mkEl('img', { src: it.icon, width: 16, height: 16 }); img.style.display = 'block'; m.replaceChildren(img); }
      else if (it.icon) m.replaceChildren(icon(it.icon, 14));
      m.style.cssText = 'width:20px;display:flex;align-items:center;justify-content:center;opacity:' + (it.disabled ? '.4' : '.9');
    }
    if (it.sc) row.querySelector('.menu-sc').textContent = it.sc;
    if (it.on) row.style.background = 'var(--ps-sel, rgba(80,140,255,.25))';
  }
  return pop;
}


export function mountPathButtons(host, ctx = {}){
  if (!host || host.dataset.bound) return;
  host.dataset.bound = '1';
  const mk = (id, title, svg) => { const b = mkEl('button', { type: 'button', className: 'pathbtn', title }); b.dataset.pathBtn = id; b.innerHTML = svg + '<span class="caret" style="margin-left:1px;font-size:8px;opacity:.7">▾</span>'; b.style.cssText = 'display:inline-flex;align-items:center;gap:0;padding:0 3px;height:22px;background:transparent;border:1px solid transparent;color:var(--text)'; host.append(b); return b; };
  const opB = mk('op', '路径操作', PATH_OP_SVG[ctx.draw ? shapeOpts.pathOp : 'combine'] || PATH_OP_SVG.combine);
  const alB = mk('align', '路径对齐方式', '');
  alB.insertBefore(icon('align-left', 15), alB.firstChild);
  const arB = mk('arrange', '路径排列方式', ARRANGE_SVG.arrange);
  opB.onclick = e => {
    const cur = ctx.draw ? shapeOpts.pathOp : null;
    const selOp = !ctx.draw && pathSelSubs.size ? (() => { const sp = pathWorking(pathTargetKey()) || []; const o = sp[[...pathSelSubs][0]]; return o ? PATH_OP_LIST[1 + [1, 2, 3, 0].indexOf(opCode(o.operation))]?.value : null; })() : null;
    const list = ctx.draw ? PATH_OP_LIST : PATH_OP_LIST.slice(1);
    const items = list.map(o => ({ label: o.label, icon: PATH_OP_SVG[o.value], on: (cur || selOp) === o.value,
      disabled: !ctx.draw && !pathSelSubs.size,
      run: () => { if (ctx.draw) { shapeOpts.pathOp = o.value; syncShapeBar(); syncPenBar(); if (pathSelSubs.size) setSelectedPathOp(o.value === 'new' ? 'combine' : o.value); } else setSelectedPathOp(o.value); } }));
    items.push({ sep: true }, { label: '合并形状组件', icon: PATH_UI_ICONS.mergeShapes, disabled: !!pathGuard(), run: () => mergePathComponents() });
    iconPopup(items, e.currentTarget.getBoundingClientRect());
  };
  alB.onclick = e => {
    const n = pathSelSubs.size, dis = !!pathGuard() || !n;
    iconPopup([
      ...ALIGN_BTNS.map(([how, ic]) => ({ label: ALIGN_LABEL[how], icon: ic, disabled: dis, run: () => alignPathSubs(how) })),
      { sep: true },
      { label: '按宽度均匀分布', icon: 'distribute-hcenter', disabled: dis || n < 3, run: () => alignPathSubs('dist-h') },
      { label: '按高度均匀分布', icon: 'distribute-vcenter', disabled: dis || n < 3, run: () => alignPathSubs('dist-v') },
      { sep: true },
      { label: '对齐到选区', checked: pathOpts.alignTo !== 'canvas', run: () => { pathOpts.alignTo = 'selection'; savePathOpts(); } },
      { label: '对齐到画布', checked: pathOpts.alignTo === 'canvas', run: () => { pathOpts.alignTo = 'canvas'; savePathOpts(); } },
    ], e.currentTarget.getBoundingClientRect());
  };
  arB.onclick = e => {
    const dis = !!pathGuard() || !pathSelSubs.size;
    iconPopup([
      { label: '将形状置为顶层', icon: PATH_UI_ICONS.toFront, sc: '⇧⌘]', disabled: dis, run: () => arrangePathSubs('front') },
      { label: '将形状前移一层', icon: PATH_UI_ICONS.forward, sc: '⌘]', disabled: dis, run: () => arrangePathSubs('forward') },
      { label: '将形状后移一层', icon: PATH_UI_ICONS.backward, sc: '⌘[', disabled: dis, run: () => arrangePathSubs('backward') },
      { label: '将形状置为底层', icon: PATH_UI_ICONS.toBack, sc: '⇧⌘[', disabled: dis, run: () => arrangePathSubs('back') },
    ], e.currentTarget.getBoundingClientRect());
  };
  if (ctx.gear !== false) {
    const g = mkEl('button', { type: 'button', className: 'pathbtn', title: ctx.gearTitle || '设置其它路径选项' });
    g.dataset.pathBtn = 'gear';
    const [src, px] = AB_BAR_ICONS.abGear;
    const img = mkEl('img', { src, width: px, height: px, alt: '设置' }); img.style.cssText = 'display:block;pointer-events:none';
    g.append(img); g.style.cssText = 'display:inline-flex;align-items:center;padding:0 3px;height:22px;background:transparent;border:1px solid transparent';
    g.onclick = e => (ctx.onGear || openPathLookPopover)(e.currentTarget);
    host.append(g);
  }
}

export function openPathLookPopover(anchor, extra){
  closeBarPopover();
  const pop = mkEl('div', { className: 'bar-pop' });
  pop.style.cssText = 'position:fixed;z-index:9999;background:var(--ps-panel,#323232);border:1px solid var(--ps-line-2,#555);border-radius:4px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.45);font-size:12px;color:var(--text);min-width:220px;display:flex;flex-direction:column;gap:7px';
  const h = mkEl('div', { textContent: '路径选项' }); h.style.fontWeight = '600'; pop.append(h);
  const row = (label, ...els) => { const r = mkEl('label'); r.style.cssText = 'display:flex;align-items:center;gap:8px'; const l = mkEl('span', { textContent: label }); l.style.cssText = 'width:64px;opacity:.85'; r.append(l, ...els); pop.append(r); return r; };
  const w = mkEl('select'); for (const v of [0.5, 1, 2, 3, 4, 5, 6, 8, 10]) w.append(new Option(v + ' 像素', v)); w.value = String(pathLook.width);
  w.onchange = () => { pathLook.width = +w.value; savePathOpts(); drawGizmo(); };
  row('粗细:', w);
  const cs = mkEl('select');
  for (const [v, t] of [['#0096ff', '默认'], ['#ff3b30', '红色'], ['#34c759', '绿色'], ['#ffcc00', '黄色'], ['#af52de', '紫色'], ['#00c7be', '青色'], ['#ff2d92', '洋红'], ['#000000', '黑色'], ['#ffffff', '白色'], ['custom', '自定…']]) cs.append(new Option(t, v));
  const ci = mkEl('input', { type: 'color', value: pathLook.color }); ci.style.cssText = 'width:34px;height:20px;padding:0';
  cs.value = [...cs.options].some(o => o.value === pathLook.color) ? pathLook.color : 'custom';
  cs.onchange = () => { if (cs.value === 'custom') { ci.click(); return; } pathLook.color = cs.value; ci.value = cs.value; savePathOpts(); drawGizmo(); };
  ci.oninput = () => { pathLook.color = ci.value; cs.value = [...cs.options].some(o => o.value === ci.value) ? ci.value : 'custom'; savePathOpts(); drawGizmo(); };
  row('颜色:', cs, ci);
  if (extra) extra(pop, row);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(innerWidth - pop.offsetWidth - 4, r.left)) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  barPop = pop;
  addEventListener('keydown', popEsc, true);
  setTimeout(() => addEventListener('pointerdown', barPopDown, true), 0);
  return pop;
}
export let barPop = null;
function barPopDown(e){ if (barPop && !barPop.contains(e.target) && !(e.target.closest && e.target.closest('.menu-pop'))) closeBarPopover(); }
export function closeBarPopover(){ if (barPop) barPop.remove(); barPop = null; removeEventListener('pointerdown', barPopDown, true); if (!shapePop) removeEventListener('keydown', popEsc, true); }



Object.assign(TOOL_RESETTERS, {
  shape: () => {
    Object.assign(shapeOpts, { mode: 'shape', fillFromFg: true, fillType: 'solid', strokeType: 'none', strokeW: 0, stroke: '#000000', strokeAlign: 'center',
      dash: 'solid', dashArr: null, strokeCap: 'butt', strokeJoin: 'miter', radius: 0, radii: null, sides: 5, weight: 2, pathOp: 'new', triRadius: 0,
      polyRadius: 0, starRatio: 100, smoothIndent: false, arrowStart: false, arrowEnd: false, arrowW: 500, arrowL: 1000, arrowC: 0,
      constrain: 'none', fromCenter: false, fillGrad: null, strokeGrad: null });
    pathOpts.snapEdges = false; savePathOpts(); syncShapeBar(); drawGizmo();
  },
  pen: () => { Object.assign(penOpts, { autoAddDelete: true, rubberBand: false }); shapeOpts.mode = 'shape'; shapeOpts.pathOp = 'new'; savePenOpts(); syncPenBar(); },
  penFree: () => { freePenOpts.tolerance = 2; Object.assign(penOpts, { magnetic: false, magWidth: 10, magContrast: 10, magFreq: 57 }); savePenOpts(); syncPenBar(); },
  penCurvature: () => { shapeOpts.mode = 'shape'; syncPenBar(); },
  path: () => { Object.assign(pathOpts, { scope: 'layer', constrain: false }); savePathOpts(); syncPathPanel(); },
  pathSelect: () => { Object.assign(pathOpts, { scope: 'layer', alignTo: 'selection' }); savePathOpts(); syncPathPanel(); },
});

let pathBarBound = false;
export function syncPathPanel(){
  const info = $('#pathInfo'), w = $('#pathWhy');
  if (!info) return;
  if (!pathBarBound) {
    pathBarBound = true;
    const sc = $('#pathScope');
    if (sc) sc.onchange = () => { pathOpts.scope = sc.value; savePathOpts(); };
    const cb = $('#pathConstrain');
    if (cb) cb.onchange = () => { pathOpts.constrain = cb.checked; savePathOpts(); };
    const sn = $('#pathSnap');
    if (sn) sn.onchange = () => { pathOpts.snapEdges = sn.checked; savePathOpts(); syncShapeBar(); syncPenBar(); };
    mountPathButtons($('#pathBtns'), {});
  }
  const sc = $('#pathScope'); if (sc) sc.value = pathOpts.scope;
  const cb = $('#pathConstrain'); if (cb) cb.checked = !!pathOpts.constrain;
  const cw = $('#pathConstrainWrap'); if (cw) cw.hidden = docTool !== 'path';
  const sw = $('#pathScopeWrap'); if (sw) sw.hidden = !(docTool === 'path' || docTool === 'pathSelect');
  const bw = $('#pathBtns'); if (bw) bw.hidden = !(docTool === 'path' || docTool === 'pathSelect');
  const sn = $('#pathSnap'); if (sn) sn.checked = !!pathOpts.snapEdges;
  const key = pathTargetKey();
  const why = pathGuard(key);
  if (why) { info.textContent = ''; w.textContent = why; return; }
  w.textContent = '';
  const sp = pathWorking(key) || [];
  const knots = sp.reduce((a, s) => a + s.knots.length, 0);
  const TOOL_HINT = {
    path: '点锚点选中（Shift 加减）· 拖框选锚点 · 拖曲线段就地掰弯 · Alt 拖 = 复制 · 方向键微调 · Delete 删锚点',
    addAnchor: '点在路径线上 = 在那儿插一个锚点（曲线形状逐点不变），按住可以直接拖走',
    deleteAnchor: '点锚点 = 删掉它，两侧并成一段；子路径只剩两个点时整条一起删（PS 同）',
    convertPoint: '点锚点 = 平滑 ↔ 角点；从锚点拖 = 拉出对称手柄；拖手柄 = 只动这一侧',
    pathSelect: '点子路径选中（Shift 加选）· 拖框选 · Alt 拖 = 复制 · 方向键微调 · Delete 删除',
  };
  const who = isDocPathKey(key) ? docPathLabel(key) : '图层路径';
  const nSel = docTool === 'pathSelect' ? pathSelSubs.size : docTool === 'path' ? pathSelAnchors.size : 0;
  info.textContent = `${who}：${sp.length} 条子路径 · ${knots} 个锚点`
    + (nSel ? (docTool === 'pathSelect' ? ` · 已选 ${nSel} 条` : ` · 已选 ${nSel} 个锚点`) : '');
  info.title = TOOL_HINT[docTool] || TOOL_HINT.path;
  const bar = $('#pathOps');
  if (bar) {
    $('#pathToSel').disabled = !sp.length;
    $('#selToPath').disabled = !selection;
  }
}



export function tracePathSub(c, sub){
  c.beginPath();
  const k = sub.knots;
  if (!k.length) return;
  c.moveTo(k[0].anchor[0], k[0].anchor[1]);
  for (let i = 1; i < k.length; i++) {
    const prev = k[i - 1], cur = k[i];
    const c1 = prev.out || prev.anchor, c2 = cur.in || cur.anchor;
    if ((c1[0] === prev.anchor[0] && c1[1] === prev.anchor[1]) && (c2[0] === cur.anchor[0] && c2[1] === cur.anchor[1])) c.lineTo(cur.anchor[0], cur.anchor[1]);
    else c.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], cur.anchor[0], cur.anchor[1]);
  }
  if (sub.closed && k.length > 1) {
    const last = k[k.length - 1], first = k[0];
    const c1 = last.out || last.anchor, c2 = first.in || first.anchor;
    if ((c1[0] === last.anchor[0] && c1[1] === last.anchor[1]) && (c2[0] === first.anchor[0] && c2[1] === first.anchor[1])) c.lineTo(first.anchor[0], first.anchor[1]);
    else c.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], first.anchor[0], first.anchor[1]);
    c.closePath();
  }
}
export function pathToSelection(idx, mode, o = {}){
  if (!doc || !docW) return;
  const subs = pathWorking(idx);
  if (!subs || !subs.length) { $('#notice').textContent = '这条路径没有子路径，载入不了选区。'; return; }
  const meta = readVectorPath(idx);
  const scale = meta && meta.units === 'percent' ? { x: docW / 100, y: docH / 100 } : { x: 1, y: 1 };
  const cv = document.createElement('canvas'); cv.width = docW; cv.height = docH;
  const c = cv.getContext('2d', { willReadFrequently: true });
  subs.forEach((sub, si) => {
    c.save();
    if (scale.x !== 1 || scale.y !== 1) c.scale(scale.x, scale.y);
    tracePathSub(c, sub);
    if (si === 0) { c.fillStyle = '#fff'; c.fill(); }
    else {
      c.globalCompositeOperation = opCompositeOf(sub.operation);
      c.fillStyle = '#fff'; c.fill();
    }
    c.restore();
  });
  const img = c.getImageData(0, 0, docW, docH).data;
  let data = new Uint8Array(docW * docH);
  for (let i = 0; i < data.length; i++) data[i] = o.anti === false ? (img[i * 4 + 3] >= 128 ? 255 : 0) : img[i * 4 + 3];
  if (o.feather > 0) data = featherAlpha(data, docW, docH, +o.feather);
  combineInto(createSelection(docW, docH, 0, 0, docW, docH, data), mode || 'replace');
}


export function selectionToLayerPath(idx){
  if (!doc || !selection) { $('#notice').textContent = '先做一个选区。'; return; }
  const sp = readVectorPath(idx);
  if (!sp || sp.error) { $('#notice').textContent = sp && sp.error ? sp.error : '这条图层读不出矢量路径。'; return; }
  const polys = selPath();
  const usable = polys.filter(p => p.length >= 6);                       
  if (!usable.length) { $('#notice').textContent = '这个选区描不出路径（太小或全透明）。'; return; }
  const subpaths = usable.map(pts => {
    const knots = [];
    for (let k = 0; k + 1 < pts.length; k += 2) {
      knots.push({ anchor: [pts[k], pts[k + 1]], in: [pts[k], pts[k + 1]], out: [pts[k], pts[k + 1]], linked: true });
    }
    return { closed: true, operation: null, knots };
  });
  const ok = commitLayerOps(idx, () => putLayerOp(idx, { op: 'setVectorMaskPath', index: idx, subpaths, units: 'pixel' }));
  if (ok) { renderStaticLayers(); drawGizmo(); syncPathPanel(); }
  return ok;
}





function pathBuildNodes(sp){
  const out = [];
  const direct = docTool === 'path', black = docTool === 'pathSelect';
  const showH = (si, ki, w) => {
    if (black) return false;
    if (!direct) return true;
    if (pathSelAnchors.has(pak(si, ki))) return true;
    if (pathSelNode && pathSelNode.s === si && pathSelNode.k === ki) return true;
    const K = sp[si].knots, n = K.length, closed = sp[si].closed !== false;
    
    if (w === 'out' && (ki + 1 < n || closed) && pathSelAnchors.has(pak(si, (ki + 1) % n))) return true;
    if (w === 'in' && (ki > 0 || closed) && pathSelAnchors.has(pak(si, (ki - 1 + n) % n))) return true;
    return false;
  };
  sp.forEach((s, si) => s.knots.forEach((k, ki) => {
    out.push({ s: si, k: ki, which: 'anchor', x: k.anchor[0], y: k.anchor[1] });
    for (const w of ['in', 'out']) {
      const h = k[w] || k.anchor;
      if (nearNum(h[0], k.anchor[0]) && nearNum(h[1], k.anchor[1])) continue;
      if (!showH(si, ki, w)) continue;
      out.push({ s: si, k: ki, which: w, x: h[0], y: h[1] });
    }
  }));
  return out;
}
export function drawPathGizmo(ctx){
  set_pathNodes([]);
  if (li || !doc || !PATH_EDIT_TOOLS.has(docTool)) return;
  const idx = pathTargetKey();
  if (pathGuard(idx)) return;
  const sp = pathWorking(idx);
  if (!sp) return;
  set_pathNodes(pathBuildNodes(sp));
  
  const lw = k => dispThr(k);
  const S = dispThr(3.5);
  const col = pathLook.color || '#0096ff';
  ctx.save();
  
  ctx.lineWidth = lw(Math.max(0.5, +pathLook.width || 1));
  ctx.strokeStyle = col;
  for (const s of sp) {
    const K = s.knots; if (!K.length) continue;
    ctx.beginPath();
    ctx.moveTo(K[0].anchor[0], K[0].anchor[1]);
    const n = s.closed !== false ? K.length : K.length - 1;
    for (let i = 0; i < n; i++) {
      const a = K[i], b = K[(i + 1) % K.length];
      const ao = a.out || a.anchor, bi = b.in || b.anchor;
      ctx.bezierCurveTo(ao[0], ao[1], bi[0], bi[1], b.anchor[0], b.anchor[1]);
    }
    if (s.closed !== false) ctx.closePath();
    ctx.stroke();
  }
  
  ctx.lineWidth = lw(1);
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.75;
  for (const nd of pathNodes) {
    if (nd.which === 'anchor') continue;
    const a = sp[nd.s].knots[nd.k].anchor;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(nd.x, nd.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  
  pathNodes.forEach((nd, i) => {
    const subOn = docTool === 'pathSelect' && pathSelSubs.has(nd.s);
    const on = subOn || pathSelAnchors.has(pak(nd.s, nd.k)) && nd.which === 'anchor'
      || (docTool !== 'path' && pathSelNode && pathSelNode.s === nd.s && pathSelNode.k === nd.k && pathSelNode.which === nd.which);
    const hot = i === pathHoverNode;
    ctx.lineWidth = lw(1);
    if (nd.which === 'anchor') {
      if (docTool === 'pathSelect' && !subOn) return;           
      const s2 = hot ? S * 1.3 : S;
      ctx.fillStyle = on ? col : '#fff'; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.rect(nd.x - s2, nd.y - s2, s2 * 2, s2 * 2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = hot ? '#fff' : col; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(nd.x, nd.y, hot ? S : S * 0.8, 0, 7); ctx.fill(); ctx.stroke();
    }
  });
  
  if (pathMarquee) {
    const M = pathMarquee;
    ctx.setLineDash([lw(4), lw(3)]); ctx.lineWidth = lw(1); ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeRect(Math.min(M.x0, M.x1), Math.min(M.y0, M.y1), Math.abs(M.x1 - M.x0), Math.abs(M.y1 - M.y0));
    ctx.setLineDash([]);
  }
  ctx.restore();
}


function pathPickAnchor(pt){
  let best = -1, bd = pathHitTol(12);
  pathNodes.forEach((nd, i) => {
    if (nd.which !== 'anchor') return;
    if (docTool === 'pathSelect' && !pathSelSubs.has(nd.s)) return;
    const d = Math.hypot(nd.x - pt.x, nd.y - pt.y);
    if (d <= bd) { bd = d; best = i; }
  });
  return best;
}
export function pathPick(pt){
  let best = -1, bd = 1e9;
  const thr = pathHitTol(8);
  
  for (const pass of ['handle', 'anchor']) {
    pathNodes.forEach((nd, i) => {
      if ((nd.which === 'anchor') === (pass === 'handle')) return;
      if (docTool === 'pathSelect') return;                     
      const d = Math.hypot(nd.x - pt.x, nd.y - pt.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0 && bd <= thr) return best;
    best = -1; bd = 1e9;
  }
  return -1;
}
export function beginPathDrag(ev, pt, forcedNode){
  const key = pathTargetKey();
  const why = pathGuard(key);
  if (why) { $('#err').textContent = '路径编辑用不了：' + why; return false; }
  if (!pathWorking(key)) return false;
  if (forcedNode === undefined) set_pathNodes(pathBuildNodes(pathModel.subpaths));
  const hit = forcedNode !== undefined ? forcedNode : pathPick(pt);
  if (hit < 0 || !pathNodes[hit]) { set_pathSelNode(null); drawGizmo(); return false; }
  const nd = pathNodes[hit];
  set_pathSelNode({ s: nd.s, k: nd.k, which: nd.which });
  const kn = pathModel.subpaths[nd.s].knots[nd.k];
  

  set_pathDrag({ key, node: pathSelNode, start: { x: pt.x, y: pt.y }, moved: false,
               smooth: nd.which !== 'anchor' && knotHandlesCollinear(kn), orig: cloneKnot(kn) });
  drawGizmo();
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  return true;
}
export function movePathDrag(ev, pt){
  const D = pathDrag; if (!D || !pathModel) return;
  const kn = pathModel.subpaths[D.node.s] && pathModel.subpaths[D.node.s].knots[D.node.k]; if (!kn) return;
  let [dx, dy] = constrainDelta(ev, pt.x - D.start.x, pt.y - D.start.y);
  if (D.convert) {
    
    const a = D.orig.anchor;
    let hx = pt.x - a[0], hy = pt.y - a[1];
    if (ev.shiftKey) { const ang = Math.round(Math.atan2(hy, hx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(hx, hy); hx = Math.cos(ang) * L; hy = Math.sin(ang) * L; }
    if (Math.hypot(pt.x - D.start.x, pt.y - D.start.y) > pathHitTol(2) || D.moved) {
      kn.out = [a[0] + hx, a[1] + hy]; kn.in = [a[0] - hx, a[1] - hy]; D.moved = true;
    }
    drawGizmo(); return;
  }
  if (D.node.which === 'anchor') {
    
    kn.anchor = [D.orig.anchor[0] + dx, D.orig.anchor[1] + dy];
    kn.in = [D.orig.in[0] + dx, D.orig.in[1] + dy];
    kn.out = [D.orig.out[0] + dx, D.orig.out[1] + dy];
  } else {
    const other = D.node.which === 'in' ? 'out' : 'in';
    
    let nx = D.orig[D.node.which][0] + (pt.x - D.start.x), ny = D.orig[D.node.which][1] + (pt.y - D.start.y);
    if (ev.shiftKey) {
      const vx = nx - kn.anchor[0], vy = ny - kn.anchor[1], L = Math.hypot(vx, vy);
      const ang = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
      nx = kn.anchor[0] + Math.cos(ang) * L; ny = kn.anchor[1] + Math.sin(ang) * L;
    }
    kn[D.node.which] = [nx, ny];
    if (ev.altKey || D.independent || !D.smooth) { if (ev.altKey) kn.linked = false; kn[other] = D.orig[other].slice(); }   
    else {
      
      const ax = kn.anchor[0], ay = kn.anchor[1];
      const vx = nx - ax, vy = ny - ay, len = Math.hypot(vx, vy);
      const ol = Math.hypot(D.orig[other][0] - D.orig.anchor[0], D.orig[other][1] - D.orig.anchor[1]);
      kn[other] = len > 1e-9 ? [ax - vx / len * ol, ay - vy / len * ol] : [ax, ay];
    }
  }
  D.moved = true;
  drawGizmo();                                     
}
export function endPathDrag(){
  const D = pathDrag; set_pathDrag(null);
  if (!D) return;
  if (D.convert && !D.moved && !D.wasSmooth && pathModel) {
    
    const sub = pathModel.subpaths[D.node.s];
    if (sub) { pathMakeSmooth(sub, D.node.k); commitPathEdit(D.key || pathModel.idx, '转换点'); }
    drawGizmo(); return;
  }
  if (!D.moved) { drawGizmo(); return; }
  commitPathEdit(D.key !== undefined ? D.key : (pathModel ? pathModel.idx : selLayer), D.convert ? '转换点' : '修改锚点');
}


export function commitPathEdit(idx, label){
  if (!pathModel || pathModel.idx !== idx) return false;
  const sp = pathModel.subpaths;
  if (isDocPathKey(idx)) {
    const saved = cloneDocSubs(sp).map((s, i) => ({ ...s, operation: sp[i].operation == null ? 1 : opCode(sp[i].operation) }));
    const selN = pathSelNode;
    setDocPath(idx, saved, label || '编辑路径');
    const dp = getDocPath(idx);
    if (dp) { set_pathModel({ idx, src: dp.subpaths, subpaths: sp }); set_pathSelNode(selN); }
    syncPathPanel(); drawGizmo();
    return true;
  }
  const base = readVectorPath(idx);
  const same = !!(base && !base.error && pathSubpathsEq(sp, base.subpaths));
  

  const prevOp = findLayerOp(idx, 'setVectorMaskPath');
  const unchanged = prevOp ? pathSubpathsEq(sp, prevOp.subpaths) : same;
  if (!unchanged) pushDocHistory(label || '编辑路径');
  

  const saved = same ? null : clonePathSubpaths(sp);
  pathModel.src = same ? base.subpaths : saved;    
  const ok = commitLayerOps(idx, () => {
    if (same) dropLayerOp(idx, 'setVectorMaskPath');
    else putLayerOp(idx, { op: 'setVectorMaskPath', index: idx, subpaths: saved, units: 'pixel' });
  });
  if (!ok) { set_pathModel(null); return false; }
  syncPathPanel();
  drawGizmo();
  try { psPanels.refreshPaths(layerTree); } catch {}
  return true;
}

export function setSubpathOperation(idx, si, opName){
  const sp = pathWorking(idx); if (!sp || !sp[si]) return false;
  sp[si].operation = isDocPathKey(idx) ? opCode(opName) : opName;
  return commitPathEdit(idx, '路径操作');
}

const strokeValEq = (a, b) => Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && a.every((v, i) => nearNum(+v, +b[i]))
  : (typeof a === 'number' && typeof b === 'number' ? nearNum(a, b) : a === b);
export function effStroke(idx){
  const base = readVectorStroke(idx);
  if (!base || base.error) return base;
  const op = findLayerOp(idx, 'setVectorStroke');
  return op ? { ...base, ...op.values } : base;
}
export function setStrokeField(idx, field, value, original){
  return commitLayerOps(idx, () => {
    const op = findLayerOp(idx, 'setVectorStroke') || { op: 'setVectorStroke', index: idx, values: {} };
    if (strokeValEq(value, original)) delete op.values[field]; else op.values[field] = value;
    if (!Object.keys(op.values).length) dropLayerOp(idx, 'setVectorStroke'); else putLayerOp(idx, op);
  });
}




const SHAPE_CONTENT_OPTS = [['none', '无'], ['solid', '纯色'], ['gradient', '渐变'], ['pattern', '图案']];
const FILL_KEY_TYPE = { SoCo: 'solid', GdFl: 'gradient', PtFl: 'pattern' };
const STROKE_CLASS_TYPE = { solidColorLayer: 'solid', gradientLayer: 'gradient', patternLayer: 'pattern' };
export function shapeContentState(idx){
  const dl = doc && doc.layers[idx];
  const vs = dl && dl.vectorStroke && dl.vectorStroke.desc;
  const so = findLayerOp(idx, 'setVectorStroke');
  const val = (k, d) => (so && so.values && so.values[k] !== undefined ? so.values[k] : d);
  const fillOn = val('fillEnabled', !vs || vs.fillEnabled !== false);
  const strokeOn = !!vs && val('enabled', vs.strokeEnabled !== false);
  return {
    fill: fillOn ? (FILL_KEY_TYPE[dl && dl.fill && dl.fill.key] || 'none') : 'none',
    stroke: strokeOn ? (STROKE_CLASS_TYPE[vs.strokeStyleContent && vs.strokeStyleContent.__classID] || 'solid') : 'none',
  };
}
function shapeTypeSelect(idx, which, attr){
  const cur = shapeContentState(idx)[which];
  const sel = mkEl('select', { title: which === 'fill' ? '填充类型（无 / 纯色 / 渐变 / 图案）' : '描边类型（无 / 纯色 / 渐变 / 图案）' });
  sel.dataset.attr = attr;
  const pats = docPatterns();
  for (const [v, t] of SHAPE_CONTENT_OPTS) {
    const o = mkEl('option', { value: v, textContent: t });
    if (v === 'pattern' && !pats.length) { o.disabled = true; o.textContent = '图案（文档无图案资源）'; }
    sel.append(o);
  }
  sel.value = cur;
  sel.onchange = () => { const v = sel.value; if (v !== cur) setShapeContentType(idx, which, v); };
  return sel;
}
export function renderShapeFillType(idx, ui){
  ui.row('填充类型', shapeTypeSelect(idx, 'fill', 'shape-fill-type'));
}
export async function setShapeContentType(idx, which, type, override){
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, '修改形状外观')) return false;
  const dl = doc.layers[idx];
  const spec = { type };
  if (type === 'solid') {
    
    if (which === 'fill') {
      const c = dl && dl.fill && dl.fill.key === 'SoCo' && dl.fill.params && dl.fill.params.desc && dl.fill.params.desc['Clr '];
      spec.color = c && Number.isFinite(c['Rd  ']) ? [c['Rd  '], c['Grn '], c['Bl  ']].map(v => Math.max(0, Math.min(255, Math.round(v)))) : fgRGB.slice();
    } else {
      const c = dl && dl.vectorStroke && dl.vectorStroke.desc && dl.vectorStroke.desc.strokeStyleContent && dl.vectorStroke.desc.strokeStyleContent['Clr '];
      spec.color = c && Number.isFinite(c['Rd  ']) ? [c['Rd  '], c['Grn '], c['Bl  ']].map(v => Math.max(0, Math.min(255, Math.round(v)))) : [0, 0, 0];
    }
  } else if (type === 'gradient') {
    spec.gradient = { type: 'linear', angle: 90, ...gradModelStops(gradNewModel(fgRGB.slice(), bgRGB.slice())) };
  } else if (type === 'pattern') {
    const pats = docPatterns();
    if (!pats.length) { $('#notice').textContent = '这个文档里没有图案资源（Patt 块），图案类型只能引用已有的图案。'; renderProps(); return false; }
    spec.pattern = { name: pats[0].name, id: pats[0].id, scale: 100 };
  }
  if (override) Object.assign(spec, override);   
  if (which === 'stroke' && type !== 'none') {
    const vs = dl && dl.vectorStroke && dl.vectorStroke.desc;
    const w = vs && vs.strokeStyleLineWidth && vs.strokeStyleLineWidth.value;
    if (!(w > 0) && spec.width === undefined) spec.width = 1;
  }
  const label = which === 'fill' ? '填充类型' : '描边类型';
  const typeLabel = (SHAPE_CONTENT_OPTS.find(o => o[0] === type) || [])[1] || type;
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const r = applyEdits(base, [{ op: 'setShapeContent', index: idx, [which]: spec }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(idx, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, `${label}：${typeLabel}`);
    const msg = `已把${label}改为「${typeLabel}」：结构性改动，已写入文档并重新载入。`
      + (which === 'stroke' && (type === 'gradient' || type === 'pattern') ? '（渐变 / 图案描边画布暂不预览，导出的 PSD 里是对的）' : '');
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    $('#err').textContent = `修改${label}没能完成：` + humanEditError(e && e.message || e);
    renderProps();
    return false;
  }
}


export function renderVectorPath(box, idx, l, ui){
  const { row, hint, mk, tog, btns } = ui;
  const p = readVectorPath(idx);
  if (!p) return;                                  
  if (p.error) { row('矢量路径', mk('span', { textContent: '读不出来', style: 'color:#ffd28a' })); hint(p.error, 'warn'); return; }
  const sp = pathWorking(idx) || p.subpaths;
  const knots = sp.reduce((a, s) => a + s.knots.length, 0);
  const editBtn = mk('button', { textContent: docTool === 'path' ? '正在编辑路径' : '路径编辑',
    className: docTool === 'path' ? 'on' : '', title: '在画布上拖锚点 / 手柄（左侧工具栏的路径工具，快捷键 A）' });
  editBtn.dataset.attr = 'path-edit';
  editBtn.onclick = () => { setDocTool(docTool === 'path' ? 'move' : 'path'); renderProps(); };
  row('矢量路径', mk('span', { textContent: `${sp.length} 条子路径 · ${knots} 个锚点`, style: 'color:var(--text);flex:1' }), editBtn);
  
  const list = mk('div', { className: 'pathops' });
  sp.forEach((s, si) => {
    const r = mk('div', { className: 'sp' });
    r.append(mk('b', { textContent: `子路径 ${si + 1}` }), mk('span', { textContent: `${s.knots.length} 点 ·` }));
    const sel = mk('select', { title: '这条子路径与其它子路径的布尔运算（PS 的「路径操作」）' });
    sel.dataset.attr = 'subpath-op'; sel.dataset.sub = String(si);
    for (const [v, t] of PATH_OPS) sel.append(mkEl('option', { value: v, textContent: t }));
    sel.value = s.operation || 'combine';
    sel.onchange = () => setSubpathOperation(idx, si, sel.value);
    r.append(sel); list.append(r);
  });
  box.append(list);
  
  const inv = (() => { const v = opField(idx, 'setVectorMaskFlags', 'invert'); return v !== undefined ? v : !!p.invert; })();
  const dis = (() => { const v = opField(idx, 'setVectorMaskFlags', 'disable'); return v !== undefined ? v : !!p.disable; })();
  row('矢量蒙版', btns(
    tog('反相', inv, '', () => setOpField(idx, { op: 'setVectorMaskFlags' }, 'invert', !inv, !!p.invert), '矢量蒙版反相', 'vmask-invert'),
    tog('停用', dis, '', () => setOpField(idx, { op: 'setVectorMaskFlags' }, 'disable', !dis, !!p.disable), '停用矢量蒙版', 'vmask-disable')));
  
  const st = effStroke(idx), base = readVectorStroke(idx);
  if (st && st.error) { hint('描边样式读不出来：' + st.error, 'warn'); }
  else if (st) {
    const num = (label, field, min, max, step, attr, title) => {
      const i2 = mk('input', { type: 'number', min, max, step, value: st[field], title });
      i2.style.cssText = 'flex:1;min-width:0;width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
      i2.dataset.attr = attr;
      i2.onchange = () => setStrokeField(idx, field, Math.max(min, Math.min(max, +i2.value || 0)), base[field]);
      row(label, i2);
    };
    if (isShapeLayer(l)) row('描边类型', shapeTypeSelect(idx, 'stroke', 'stroke-type'));
    num('描边宽度', 'width', 0, 1000, 0.1, 'stroke-width', '描边宽度（单位沿用原文件，通常是 px）');
    const col = mk('input', { type: 'color', value: hexOf(st.color || [0, 0, 0]) });
    col.style.cssText = 'flex:none;width:38px;height:22px;padding:0;background:#1b1b1c;border:1px solid var(--line2);border-radius:5px';
    col.dataset.attr = 'stroke-color';
    col.onchange = () => { const c = parseHex6(col.value); if (c) setStrokeField(idx, 'color', c, base.color); };
    const en = !!st.enabled;
    const stKind = shapeContentState(idx).stroke;
    const enTog = tog(en ? '描边：开' : '描边：关', en, '', () => setStrokeField(idx, 'enabled', !en, !!base.enabled), '描边总开关', 'stroke-enabled');
    
    if (stKind === 'gradient' || stKind === 'pattern') row('描边内容', mk('span', { textContent: stKind === 'gradient' ? '渐变' : '图案', style: 'color:var(--muted);flex:1' }), enTog);
    else row('描边颜色', col, enTog);
    const dash = mk('input', { type: 'text', value: (st.dashes || []).join(','), placeholder: '留空 = 实线，例如 3,2' });
    dash.style.cssText = 'flex:1;min-width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 6px;user-select:text';
    dash.dataset.attr = 'stroke-dashes';
    dash.onchange = () => {
      const arr = dash.value.split(/[,\s]+/).map(v => +v).filter(v => isFinite(v) && v >= 0);
      setStrokeField(idx, 'dashes', arr, base.dashes || []);
    };
    row('虚线', dash);
    const pick = (label, field, opts, attr, title) => {
      const s2 = mk('select', { title });
      s2.dataset.attr = attr;
      for (const [v, t] of opts) s2.append(mkEl('option', { value: v, textContent: t }));
      s2.value = st[field];
      s2.onchange = () => setStrokeField(idx, field, s2.value, base[field]);
      row(label, s2);
    };
    pick('端点', 'cap', [['butt', '平头'], ['round', '圆头'], ['square', '方头']], 'stroke-cap', '线端点样式');
    pick('连接', 'join', [['miter', '斜接'], ['round', '圆角'], ['bevel', '斜面']], 'stroke-join', '拐角连接样式');
    pick('对齐', 'align', [['inside', '内部'], ['center', '居中'], ['outside', '外部']], 'stroke-align', '描边相对路径的对齐方式');
    hint('描边只有纯色（solidColorLayer + RGBC）能改颜色；渐变 / 图案描边会在写回时报错并说明实际是什么类。');
  } else if (isShapeLayer(l)) {
    row('描边', shapeTypeSelect(idx, 'stroke', 'stroke-type')).dataset.propSection = 'appearance';
  }
  hint('路径坐标是**相对文档画布的绝对像素**；内部保留原始 8.24 定点整数，只有真的动过的坐标才重新量化 —— '
     + '所以「改一个锚点再改回原值」导出的文件与原文件逐字节相同。可解析的矢量蒙版会立即裁剪画布；遇到不支持的路径构造会在兼容性提示中说明，导出仍保留原始 PSD 数据。');
}
