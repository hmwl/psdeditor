




import './16-filters-menu.js';   
import { parsePsdFull } from '../../../core/psd-parse.js';
import { actions } from '../actions.js';
import { formDialog } from '../dialog.js';
import { PATH_UI_ICONS } from '../path-icons.js';
import { isShapeLayer } from '../property-panel.js';
import { psPanels } from '../ps-panels.js';
import { CUSTOM_SHAPES, CUSTOM_SHAPE_BY_ID, DEFAULT_CUSTOM_SHAPE, customShapeSubpaths } from '../shapes.js';
import { shell } from '../shell.js';
import {
  $, EDIT, SELM, applyEdits, createSelection, ensureLazy, featherSelection, getVectorMaskPath, icon,
} from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, layerDeletes, layerRenames, layerTree, li, origBuffer,
} from './02-doc-state.js';
import { pushDocHistory, structuralBegin, structuralDone, updateUndoButtons } from './03-history.js';
import { spaceDown } from './06-view-zoom-move.js';
import { paintPixelsWith } from './11-paint-common.js';
import {
  PEN_TOOLS, V2, customPopBound, customShapeThumb, hideCustomPop, set_customPopBound, showCustomPop, syncPenBar,
} from './18-pen-extra.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { selLayer, set_selLayer } from './23-layers-panel.js';
import { effParam, humanEditError, layerParams, renderProps, setParamField } from './24-layer-ops-queue.js';
import { docPatterns } from './26-layer-create.js';
import { gradModelStops, gradNewModel, parseHex6 } from './27-gradient-editor.js';
import { getPropertyTransformValues, mkEl, setShapePropertyTransform } from './28-layer-props-transform.js';
import { bgRGB, docTool, fgRGB, hexOf, set_docTool } from './31-selection-brush.js';
import { combineInto, dispPx, syncGizmoCursor } from './32-cursors-select-options.js';
import {
  docSavedPaths, effPathSubpaths, pathGuard, pathModel, pathToSelectionUI, pathWorking, readVectorStroke,
  set_pathModel,
} from './44-vector-path.js';
import {
  PATH_EDIT_TOOLS, PATH_OP_SVG, barPop, cloneKnot, closeBarPopover, commitPathEdit, effStroke, mountPathButtons,
  openPathLookPopover, pak, pathHitTol, pathInsertAnchor, pathLook, pathNearestSegment, pathOpts,
  pathRemoveAnchor, pathSelAnchors, pathToolDown, savePathOpts, setShapeContentType, setStrokeField,
  set_pathAnchorDrag, shapeContentState, subpathsBBoxTight, syncPathPanel, tracePathSub,
} from './45-path-tools.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import { buildPsdBuffer, ensureStructuralBase, setWaitCursor } from './48-info-export.js';
import { showTargetPath } from './57-layer-style-text-path.js';




















export const SHAPE_KINDS = { rect: '矩形', ellipse: '椭圆', triangle: '三角形', polygon: '多边形', line: '直线',
                      customShape: '自定形状' };
export const PATH_OP_LIST = [
  { value: 'new', label: '新建图层' },
  { value: 'combine', label: '合并形状' },
  { value: 'subtract', label: '减去顶层形状' },
  { value: 'intersect', label: '与形状区域相交' },
  { value: 'exclude', label: '排除重叠形状' },
];
export const PATH_OP_LABEL = Object.fromEntries(PATH_OP_LIST.map(o => [o.value, o.label]));
const KAPPA = 0.5522847498307936;               


export const shapeOpts = { kind: 'rect', mode: 'shape', fill: '#000000', fillFromFg: true, radius: 0, sides: 5, weight: 2, pathOp: 'new',
                    stroke: '#000000', strokeW: 0, strokeAlign: 'center', dash: 'solid',
                    custom: DEFAULT_CUSTOM_SHAPE,
                    







                    fillType: 'solid', strokeType: 'none', fillGrad: null, strokeGrad: null, fillPat: null, strokePat: null,
                    strokeCap: 'butt', strokeJoin: 'miter', dashArr: null,
                    radii: null, triRadius: 0, polyRadius: 0, starRatio: 100, smoothIndent: false,
                    arrowStart: false, arrowEnd: false, arrowW: 500, arrowL: 1000, arrowC: 0,
                    constrain: 'none', fixW: 100, fixH: 100, propW: 1, propH: 1, fromCenter: false };

const DASH_PRESETS = { solid: null, dash: [3, 2], dot: [1, 2] };
export let shapeState = null;      
export function set_shapeState(v) { return (shapeState = v); }   
export let penState = null;        
export function set_penState(v) { return (penState = v); }   
export let penPointer = null;      
export function set_penPointer(v) { return (penPointer = v); }   
export let shapeBarBound = false, penBarBound = false;
export function set_penBarBound(v) { return (penBarBound = v); }   








export const SHAPE_MODES = [
  { value: 'shape', label: '形状' },
  { value: 'path',  label: '路径' },
  { value: 'pixel', label: '像素' },
];
const SHAPE_MODE_LABEL = Object.fromEntries(SHAPE_MODES.map(m => [m.value, m.label]));



const PATH_OP_INDEX = { new: 1, combine: 1, subtract: 2, intersect: 3, exclude: 0 };
export let workPath = null;          
export function set_workPath(v) { return (workPath = v); }   
export let workPathDirty = false;    
export function set_workPathDirty(v) { return (workPathDirty = v); }   


export let savedPaths = [];          
export function set_savedPaths(v) { return (savedPaths = v); }   
export let savedPathsDirty = false;
export function set_savedPathsDirty(v) { return (savedPathsDirty = v); }   


export let activePath = null;
export function set_activePath(v) { return (activePath = v); }   
export let docPathsKey = null;       
export function set_docPathsKey(v) { return (docPathsKey = v); }   
export const cloneDocSubs = subs => (subs || []).map(sp => ({
  closed: sp.closed !== false, operation: sp.operation == null ? 1 : sp.operation,
  knots: sp.knots.map(k => ({ anchor: k.anchor.slice(), in: (k.in || k.anchor).slice(), out: (k.out || k.anchor).slice(), ...(k.linked !== undefined ? { linked: !!k.linked } : {}) })),
}));

export function ensureDocPaths(){
  if (!origBuffer || !docW || docPathsKey === origBuffer) return;
  docPathsKey = origBuffer;
  let list = [];
  try { list = docSavedPaths(); } catch { list = []; }
  const w = list.find(p => p.working);
  if (!workPathDirty) workPath = w ? { subpaths: cloneDocSubs(w.subpaths) } : null;
  if (!savedPathsDirty) savedPaths = list.filter(p => !p.working).map(p => ({ name: p.name, subpaths: cloneDocSubs(p.subpaths) }));
}

export function activeDocSubs(){
  ensureDocPaths();
  const p = (activePath && getDocPath(activePath)) || workPath;
  return p && p.subpaths.length ? p.subpaths : null;
}

export function getDocPath(key){
  ensureDocPaths();
  if (key === 'work') return workPath;
  if (typeof key === 'string' && key.startsWith('saved:')) return savedPaths[+key.slice(6)] || null;
  return null;
}
export const isDocPathKey = k => typeof k === 'string' && (k === 'work' || k.startsWith('saved:'));
export function docPathLabel(key){
  if (key === 'work') return '工作路径';
  const p = getDocPath(key); return p ? p.name : '路径';
}

export function setDocPath(key, subs, label){
  pushDocHistory(label || '编辑路径');
  if (key === 'work') { workPath = subs && subs.length ? { subpaths: subs } : null; workPathDirty = true; if (!workPath && activePath === 'work') activePath = null; }
  else {
    const i = +key.slice(6);
    savedPaths = savedPaths.map((p, j) => j === i ? { name: p.name, subpaths: subs || [] } : p);
    savedPathsDirty = true;
  }
  afterWorkPathChange();
}

export function pathTargetKey(){
  ensureDocPaths();
  if (activePath === 'work' && workPath) return 'work';
  if (typeof activePath === 'string' && activePath.startsWith('saved:') && savedPaths[+activePath.slice(6)]) return activePath;
  return selLayer;
}

function targetSubpaths(key){ return isDocPathKey(key) ? (getDocPath(key) || {}).subpaths || null : effPathSubpaths(key); }





export function workPathSet(subs, how){
  ensureDocPaths();
  const op = PATH_OP_INDEX[how] === undefined ? 1 : PATH_OP_INDEX[how];
  const add = subs.map(sp => ({
    closed: sp.closed !== false, operation: op,
    knots: sp.knots.map(k => ({ anchor: k.anchor.slice(), in: (k.in || k.anchor).slice(), out: (k.out || k.anchor).slice() })),
  }));
  const key = activePath && getDocPath(activePath) ? activePath : null;
  const base = key ? getDocPath(key) : null;
  if (!key || !base.subpaths.length) {
    const fresh = add.map(sp => ({ ...sp, operation: 1 }));    
    if (key && key !== 'work') setDocPath(key, fresh, '新建路径');
    else { pushDocHistory(workPath ? '新建工作路径' : '工作路径'); workPath = { subpaths: fresh }; workPathDirty = true; activePath = 'work'; afterWorkPathChange(); }
  } else setDocPath(key, base.subpaths.concat(add), key === 'work' ? '添加到工作路径' : '添加到路径');
  return workPath;
}
export function clearWorkPath(){
  ensureDocPaths();
  if (!workPath) return false;
  pushDocHistory('删除工作路径');
  workPath = null; workPathDirty = true;
  if (activePath === 'work') activePath = null;
  afterWorkPathChange();
  $('#notice').textContent = '已删除工作路径。';
  return true;
}
export function afterWorkPathChange(){
  set_pathModel(pathModel && isDocPathKey(pathModel.idx) ? null : pathModel);
  try { psPanels.refreshPaths(layerTree); } catch {}
  try { syncShapeBar(); syncPenBar(); syncPathPanel(); } catch {}
  drawGizmo(); updateUndoButtons();
}


export function rasterizeSubpathsSelection(subs, o = {}) {
  const bb = subpathsBBox(subs); if (!bb) return null;
  const pad = Math.ceil((o.feather || 0) * 2) + 2;
  const bx = Math.max(0, Math.floor(bb.x) - pad), by = Math.max(0, Math.floor(bb.y) - pad);
  const bx1 = Math.min(docW, Math.ceil(bb.x + bb.width) + pad), by1 = Math.min(docH, Math.ceil(bb.y + bb.height) + pad);
  const W = bx1 - bx, H = by1 - by, TS = 256, cols = Math.ceil(W / TS), tiles = new Map();
  if (!(W > 0 && H > 0)) return null;
  for (let ty = 0; ty * TS < H; ty++) for (let tx = 0; tx * TS < W; tx++) {
    const gx = bx + tx * TS, gy = by + ty * TS;
    const tw = Math.min(TS, bx1 - gx), th = Math.min(TS, by1 - gy);
    const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.translate(-gx, -gy);
    subs.forEach((sub, si) => {
      if (!sub.knots || !sub.knots.length) return;
      c.save();
      tracePathSub(c, sub);
      if (si > 0) c.globalCompositeOperation = opCompositeOf(sub.operation);
      c.fillStyle = '#fff'; c.fill();
      c.restore();
    });
    const d = c.getImageData(0, 0, tw, th).data, t = new Uint8Array(TS * TS);
    let any = false;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      let a = d[(y * tw + x) * 4 + 3];
      if (o.anti === false) a = a >= 128 ? 255 : 0;
      if (a) { t[y * TS + x] = a; any = true; }
    }
    if (any) tiles.set(ty * cols + tx, t);
  }
  if (!tiles.size) return null;
  let sel = SELM.selectionFromTiles(bx, by, W, H, tiles, 0, docW, docH);
  if (o.feather > 0) sel = featherSelection(sel, +o.feather);
  return sel;
}
export function workPathToSelection(mode, key, o = {}){
  ensureDocPaths();
  const p = getDocPath(key || (activePath && getDocPath(activePath) ? activePath : 'work'));
  if (!p || !p.subpaths.length) { $('#notice').textContent = '还没有工作路径。'; return false; }
  if (!doc || !docW) return false;
  if (docW * docH > 128e6) {
    const sel = rasterizeSubpathsSelection(p.subpaths, o);
    if (!sel) { $('#notice').textContent = '这条路径在画布上没有覆盖到像素。'; return false; }
    combineInto(sel, mode || 'replace');
    $('#notice').textContent = `已把${docPathLabel(key || 'work')}（${p.subpaths.length} 条子路径）按分块栅格载入为选区。`;
    return true;
  }
  const img = rasterizeSubpaths(p.subpaths, { anti: o.anti !== false });
  let data = new Uint8Array(docW * docH);
  for (let i = 0; i < data.length; i++) data[i] = img[i * 4 + 3];
  if (o.feather > 0) data = featherAlpha(data, docW, docH, +o.feather);
  combineInto(createSelection(docW, docH, 0, 0, docW, docH, data), mode || 'replace');
  $('#notice').textContent = `已把${docPathLabel(key || 'work')}（${p.subpaths.length} 条子路径）载入为选区。`;
  return true;
}

export function featherAlpha(a, w, h, r){
  const rad = Math.max(1, Math.round(r / 1.7));
  let cur = Float32Array.from(a), tmp = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {                       
      let acc = 0; const row = y * w;
      for (let x = -rad; x <= rad; x++) acc += cur[row + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / (2 * rad + 1);
        acc += cur[row + Math.min(w - 1, x + rad + 1)] - cur[row + Math.max(0, x - rad)];
      }
    }
    for (let x = 0; x < w; x++) {                       
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        cur[y * w + x] = acc / (2 * rad + 1);
        acc += tmp[Math.min(h - 1, y + rad + 1) * w + x] - tmp[Math.max(0, y - rad) * w + x];
      }
    }
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(cur[i]);
  return out;
}

export function opCode(o){
  if (typeof o === 'number') return o;
  const i = ['exclude', 'combine', 'subtract', 'intersect'].indexOf(o);
  return i < 0 ? 1 : i;
}
export const opCompositeOf = op => { const c = opCode(op); return c === 0 ? 'xor' : c === 2 ? 'destination-out' : c === 3 ? 'destination-in' : 'source-over'; };


export function subpathsBBox(subs){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of subs || []) for (const k of s.knots || []) {
    for (const p of [k.anchor, k.in || k.anchor, k.out || k.anchor]) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function rasterizeSubpaths(subs, o = {}){
  const cv = document.createElement('canvas'); cv.width = docW; cv.height = docH;
  const c = cv.getContext('2d', { willReadFrequently: true });
  subs.forEach((sub, si) => {
    if (!sub.knots || !sub.knots.length) return;
    c.save();
    tracePathSub(c, sub);
    if (si > 0) c.globalCompositeOperation = opCompositeOf(sub.operation);
    c.fillStyle = '#fff'; c.fill();
    c.restore();
  });
  const d = c.getImageData(0, 0, docW, docH).data;
  
  if (o.anti === false) for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  return d;
}

export function fillSubpathsPixels(subs, label, o = {}){
  if (!doc || li || !docW) return false;
  const bb = subpathsBBox(subs);
  if (!bb) return false;
  const img = rasterizeSubpaths(subs, { anti: o.anti !== false });
  let cov = null;
  if (o.feather > 0) {                                   
    cov = new Uint8Array(docW * docH);
    for (let i = 0; i < cov.length; i++) cov[i] = img[i * 4 + 3];
    cov = featherAlpha(cov, docW, docH, o.feather);
  }
  const [r, g, b] = o.color || fgRGB;
  const k = o.opacity == null ? 1 : Math.max(0, Math.min(1, o.opacity));
  const pad = Math.ceil((o.feather || 0) * 2) + 1;
  const okd = paintPixelsWith((x, y) => {
    if (x < 0 || y < 0 || x >= docW || y >= docH) return null;   
    const a = Math.round((cov ? cov[y * docW + x] : img[(y * docW + x) * 4 + 3]) * k);
    return a ? [r, g, b, a] : null;
  }, { bounds: { x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2 }, label: label || '像素形状' });
  if (!okd) $('#notice').textContent = '没有画上任何像素：路径落在图层之外，或这一层画不了（锁定 / 没有像素）。';
  return okd;
}

export async function commitDrawnPath(subs, kindLabel, meta = {}){
  if (shapeOpts.mode === 'path') {
    workPathSet(subs, meta.pathOp || shapeOpts.pathOp);
    shell.status(`工作路径：${workPath ? workPath.subpaths.length : 0} 条子路径（路径模式不新建图层，导出时写成图像资源 1025）`);
    return true;
  }
  if (shapeOpts.mode === 'pixel') {
    const okd = fillSubpathsPixels(subs, kindLabel);
    if (okd) {
      const msg = `已把${kindLabel}按前景色 ${hexOf(fgRGB)} 画进当前图层的像素（PS 的「像素」模式：不产生矢量图层）。`;
      $('#notice').textContent = msg; shell.status(msg);
    }
    syncShapeBar(); syncPenBar();
    return okd;
  }
  return await commitShapePath(subs, kindLabel, meta);
}



export function drawWorkPath(ctx){
  ensureDocPaths();
  if (!showTargetPath) return;                  
  if (PATH_EDIT_TOOLS.has(docTool) || li) return;
  if (!(docTool === 'shape' || PEN_TOOLS.has(docTool))) return;
  
  const key = pathTargetKey();
  const subs = isDocPathKey(key) ? (getDocPath(key) || {}).subpaths : (key >= 0 && !pathGuard(key) ? effPathSubpaths(key) : null);
  if (!subs || !subs.length) return;
  ctx.save();
  const visible = subs.filter(sub => !penState?.sourceSubs?.includes(sub));
  ctx.lineWidth = dispPx(Math.max(0.5, +pathLook.width || 1)); ctx.strokeStyle = pathLook.color || '#0096ff';
  for (const sub of visible) { tracePathSub(ctx, sub); ctx.stroke(); }
  const s = dispThr(5);
  ctx.lineWidth = dispPx(1);
  for (const sub of visible) for (const k of sub.knots) {
    ctx.beginPath(); ctx.rect(k.anchor[0] - s / 2, k.anchor[1] - s / 2, s, s);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}



const corner = (x, y) => ({ anchor: [x, y], in: [x, y], out: [x, y] });
export const knotOf = (a, i, o) => ({ anchor: a, in: i, out: o });



export function shapeRect(st){
  let dx = st.x1 - st.x0, dy = st.y1 - st.y0;
  const C = shapeOpts.constrain || 'none';
  const center = st.alt || shapeOpts.fromCenter;
  if (C === 'fixed') {
    const w = Math.max(1, +shapeOpts.fixW || 100), h = Math.max(1, +shapeOpts.fixH || 100);
    const r = center ? { x: st.x1 - w / 2, y: st.y1 - h / 2, w, h } : { x: st.x1, y: st.y1, w, h };
    return snapRect(r);
  }
  if (C === 'prop' && !st.shift) {
    const k = Math.max(0.001, +shapeOpts.propW || 1) / Math.max(0.001, +shapeOpts.propH || 1);
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax / k >= ay) dy = (dy < 0 ? -1 : 1) * ax / k; else dx = (dx < 0 ? -1 : 1) * ay * k;
  }
  if (st.shift || C === 'square') { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * m; dy = (dy < 0 ? -1 : 1) * m; }
  if (center) return snapRect({ x: st.x0 - Math.abs(dx), y: st.y0 - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 });
  return snapRect({ x: Math.min(st.x0, st.x0 + dx), y: Math.min(st.y0, st.y0 + dy), w: Math.abs(dx), h: Math.abs(dy) });
}
function snapRect(r){
  if (!pathOpts.snapEdges) return r;
  const x0 = Math.round(r.x), y0 = Math.round(r.y), x1 = Math.round(r.x + r.w), y1 = Math.round(r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function shapeRadii(){
  const r = Array.isArray(shapeOpts.radii) && shapeOpts.radii.length === 4 ? shapeOpts.radii : null;
  return r ? r.map(v => Math.max(0, +v || 0)) : [0, 0, 0, 0].map(() => Math.max(0, +shapeOpts.radius || 0));
}

export function roundRectSubpath(x, y, w, h, radii){
  let [tl, tr, br, bl] = radii.map(v => Math.max(0, +v || 0));
  const f = Math.min(1, w / Math.max(1e-9, tl + tr), w / Math.max(1e-9, bl + br), h / Math.max(1e-9, tl + bl), h / Math.max(1e-9, tr + br));
  tl *= f; tr *= f; br *= f; bl *= f;
  const x2 = x + w, y2 = y + h, K = KAPPA;
  if (tl < 0.01 && tr < 0.01 && br < 0.01 && bl < 0.01)
    return { closed: true, knots: [corner(x, y), corner(x2, y), corner(x2, y2), corner(x, y2)] };
  const ks = [];
  const arc = (ax, ay, bx, by, r, sa, sb) => { 
    if (r < 0.01) { ks.push(corner(ax, ay)); return; }
    ks.push(knotOf([ax, ay], [ax, ay], [ax + sa[0] * r * K, ay + sa[1] * r * K]));
    ks.push(knotOf([bx, by], [bx - sb[0] * r * K, by - sb[1] * r * K], [bx, by]));
  };
  arc(x, y + tl, x + tl, y, tl, [0, -1], [1, 0]);             
  arc(x2 - tr, y, x2, y + tr, tr, [1, 0], [0, 1]);            
  arc(x2, y2 - br, x2 - br, y2, br, [0, 1], [-1, 0]);         
  arc(x + bl, y2, x, y2 - bl, bl, [-1, 0], [0, -1]);          
  
  const out = [];
  for (const k of ks) { const p = out[out.length - 1]; if (p && Math.hypot(p.anchor[0] - k.anchor[0], p.anchor[1] - k.anchor[1]) < 1e-6) { p.out = k.out; continue; } out.push(k); }
  if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.hypot(a.anchor[0] - b.anchor[0], a.anchor[1] - b.anchor[1]) < 1e-6) { a.in = b.in; out.pop(); } }
  return { closed: true, knots: out };
}


function roundedPolygon(P, radius, smooth){
  const n = P.length, ks = [];
  for (let i = 0; i < n; i++) {
    const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const r = Array.isArray(radius) ? radius[i] : radius;
    const va = V2.norm(V2.sub(a, p)), vb = V2.norm(V2.sub(b, p));
    if (smooth && smooth[i]) {                          
      const t = V2.norm(V2.sub(b, a)), L = Math.min(V2.len(V2.sub(a, p)), V2.len(V2.sub(b, p))) / 3;
      ks.push(knotOf(p.slice(), [p[0] - t[0] * L, p[1] - t[1] * L], [p[0] + t[0] * L, p[1] + t[1] * L]));
      continue;
    }
    const cos = Math.max(-1, Math.min(1, V2.dot(va, vb))), th = Math.acos(cos);
    if (!(r > 0.01) || th < 1e-3 || Math.PI - th < 1e-3) { ks.push(corner(p[0], p[1])); continue; }
    let d = r / Math.tan(th / 2);
    const maxD = Math.min(V2.len(V2.sub(a, p)), V2.len(V2.sub(b, p))) / 2;
    let rr = r;
    if (d > maxD) { d = maxD; rr = d * Math.tan(th / 2); }
    const phi = Math.PI - th, hl = 4 / 3 * Math.tan(phi / 4) * rr;
    const A = [p[0] + va[0] * d, p[1] + va[1] * d], B = [p[0] + vb[0] * d, p[1] + vb[1] * d];
    ks.push(knotOf(A, A.slice(), [A[0] - va[0] * hl, A[1] - va[1] * hl]));
    ks.push(knotOf(B, [B[0] - vb[0] * hl, B[1] - vb[1] * hl], B.slice()));
  }
  return { closed: true, knots: ks };
}

function polygonPoints(r, sides, starRatio){
  const n = Math.max(3, Math.min(100, Math.round(+sides || 5)));
  const star = starRatio != null && +starRatio < 100;
  const k = star ? Math.max(0.01, +starRatio / 100) : 1;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, P = [];
  const m = star ? n * 2 : n;
  for (let i = 0; i < m; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / m, f = star && i % 2 ? k : 1;
    P.push([cx + r.w / 2 * f * Math.cos(a), cy + r.h / 2 * f * Math.sin(a)]);
  }
  return P;
}


function lineSubpaths(x0, y0, x1, y1, o = shapeOpts){
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 1) return null;
  const wgt = Math.max(0.1, +o.weight || 1), t = wgt / 2;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  const P = (u, v) => [x0 + ux * u + nx * v, y0 + uy * u + ny * v];
  const aw = Math.max(t, wgt * (+o.arrowW || 500) / 100 / 2);
  const al = Math.min(L * 0.95, wgt * (+o.arrowL || 1000) / 100);
  const cc = Math.max(-0.5, Math.min(0.5, (+o.arrowC || 0) / 100));
  const s = !!o.arrowStart, e = !!o.arrowEnd;
  const head = (tipU, dir) => {                
    const base = tipU - dir * al, notchU = base + dir * cc * al;
    const f = aw > 1e-9 ? (aw - t) / aw : 0;
    return { joinU: base + dir * f * cc * al, baseU: base, tipU, notchU };
  };
  const pts = [];
  const E = e ? head(L, 1) : null, S = s ? head(0, -1) : null;
  pts.push(P(S ? S.joinU : 0, t));
  if (E) { pts.push(P(E.joinU, t), P(E.baseU, aw), P(L, 0), P(E.baseU, -aw), P(E.joinU, -t)); }
  else pts.push(P(L, t), P(L, -t));
  if (S) { pts.push(P(S.joinU, -t), P(S.baseU, -aw), P(0, 0), P(S.baseU, aw)); }
  else pts.push(P(0, -t));
  return [{ closed: true, knots: pts.map(p => corner(p[0], p[1])) }];
}


export function shapeSubpaths(kind, st){
  


  if (kind === 'customShape') return customShapeSubpaths(shapeOpts.custom, shapeRect(st));
  if (kind === 'line') {
    let { x0, y0, x1, y1 } = st;
    if (st.shift) {                                  
      const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4);
      const L0 = Math.hypot(x1 - x0, y1 - y0);
      x1 = x0 + Math.cos(a) * L0; y1 = y0 + Math.sin(a) * L0;
    }
    if (pathOpts.snapEdges) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); }
    
    return lineSubpaths(x0, y0, x1, y1);
  }
  const r = shapeRect(st);
  if (r.w < 1 || r.h < 1) return null;
  return shapeSubpathsInRect(kind, r);
}

function shapeSubpathsInRect(kind, r, o = {}){
  const x = r.x, y = r.y, w = r.w, h = r.h, x2 = x + w, y2 = y + h, cx = x + w / 2, cy = y + h / 2;
  if (kind === 'customShape') return customShapeSubpaths(o.custom || shapeOpts.custom, r);
  if (kind === 'ellipse') {
    const kx = w / 2 * KAPPA, ky = h / 2 * KAPPA;
    return [{ closed: true, knots: [
      knotOf([cx, y], [cx - kx, y], [cx + kx, y]),
      knotOf([x2, cy], [x2, cy - ky], [x2, cy + ky]),
      knotOf([cx, y2], [cx + kx, y2], [cx - kx, y2]),
      knotOf([x, cy], [x, cy + ky], [x, cy - ky]),
    ] }];
  }
  if (kind === 'triangle') {
    const rad = Math.max(0, +(o.triRadius ?? shapeOpts.triRadius) || 0);
    return [roundedPolygon([[cx, y], [x2, y2], [x, y2]], rad)];
  }
  if (kind === 'polygon') {
    const ratio = +(o.starRatio ?? shapeOpts.starRatio ?? 100);
    const P = polygonPoints(r, o.sides ?? shapeOpts.sides, ratio);
    const star = ratio < 100;
    const rad = Math.max(0, +(o.polyRadius ?? shapeOpts.polyRadius) || 0);
    const smoothIn = star && !!(o.smoothIndent ?? shapeOpts.smoothIndent);
    return [roundedPolygon(P, P.map((_, i) => star && i % 2 ? 0 : rad), smoothIn ? P.map((_, i) => i % 2 === 1) : null)];
  }
  
  return [roundRectSubpath(x, y, w, h, o.radii || shapeRadii())];
}


export function tracePath(ctx, subs){
  for (const sp of subs) {
    const k = sp.knots; if (!k || !k.length) continue;
    ctx.moveTo(k[0].anchor[0], k[0].anchor[1]);
    const n = k.length, segs = sp.closed === false ? n - 1 : n;
    for (let i = 0; i < segs; i++) {
      const a = k[i], b = k[(i + 1) % n];
      ctx.bezierCurveTo(a.out[0], a.out[1], b.in[0], b.in[1], b.anchor[0], b.anchor[1]);
    }
    if (sp.closed !== false) ctx.closePath();
  }
}


export function beginShapeDrag(ev, pt){
  if (!doc || li) return false;
  shapeState = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, shift: !!(ev && ev.shiftKey), alt: !!(ev && ev.altKey) };
  

  const target = shapeOpts.mode === 'path' ? !!(activePath && getDocPath(activePath)) : barShapeIdx() >= 0;
  if (target && ev && (ev.shiftKey || ev.altKey)) {
    shapeState.op = ev.shiftKey && ev.altKey ? 'intersect' : ev.shiftKey ? 'combine' : 'subtract';
    shapeState.holdShift = !!ev.shiftKey; shapeState.holdAlt = !!ev.altKey;
    shapeState.shift = false; shapeState.alt = false;
  }
  gizmo.classList.add('drag');
  if (ev && ev.pointerId != null) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} }
  drawGizmo();
  return true;
}
export function moveShapeDrag(ev, pt){
  if (!shapeState) return;
  
  if (spaceDown) { shapeState.x0 += pt.x - shapeState.x1; shapeState.y0 += pt.y - shapeState.y1; }
  shapeState.x1 = pt.x; shapeState.y1 = pt.y;
  if (shapeState.holdShift && !(ev && ev.shiftKey)) shapeState.holdShift = false;
  if (shapeState.holdAlt && !(ev && ev.altKey)) shapeState.holdAlt = false;
  shapeState.shift = !!(ev && ev.shiftKey) && !shapeState.holdShift; shapeState.alt = !!(ev && ev.altKey) && !shapeState.holdAlt;
  syncShapeBar(); drawGizmo();
}
export function endShapeDrag(){
  const st = shapeState; shapeState = null;
  gizmo.classList.remove('drag');
  drawGizmo();
  if (!st) return false;
  
  const moved = Math.hypot(st.x1 - st.x0, st.y1 - st.y0);
  const clickTol = Number.isFinite(dispThr(3)) ? dispThr(3) : 2;
  if (moved <= clickTol && shapeOpts.constrain !== 'fixed' && !st.noDialog) { openCreateShapeDialog(st.x0, st.y0); return false; }
  const subs = shapeSubpaths(shapeOpts.kind, st);
  if (!subs) { $('#shpWhy').textContent = '拖得太小了（不足 1 像素），没有生成形状。'; syncShapeBar(); return false; }
  commitDrawnPath(subs, shapeKindLabel(), { origin: st.op ? null : shapeOriginFor(shapeOpts.kind, shapeOpts.kind === 'line' ? null : shapeRect(st)), pathOp: st.op });
  return true;
}

export function shapeOriginFor(kind, r, radii){
  if (!r || !(r.w > 0 && r.h > 0)) return null;
  if (kind !== 'rect' && kind !== 'ellipse') return null;
  const R = kind === 'rect' ? (radii || shapeRadii()) : [0, 0, 0, 0];
  return { type: kind === 'ellipse' ? 'ellipse' : (R.some(v => v > 0) ? 'roundRect' : 'rect'),
           left: r.x, top: r.y, right: r.x + r.w, bottom: r.y + r.h, radii: R };
}

async function openCreateShapeDialog(x, y){
  const kind = shapeOpts.kind;
  const TITLE = { rect: '创建矩形', ellipse: '创建椭圆', triangle: '创建三角形', polygon: '创建多边形', line: '创建直线', customShape: '创建自定形状' };
  const R = shapeRadii();
  const F = [
    { key: 'w', label: kind === 'line' ? '长度' : '宽度 (像素)', value: kind === 'line' ? 100 : (shapeOpts.lastW || 100), min: 1, max: 30000 },
  ];
  if (kind !== 'line') F.push({ key: 'h', label: '高度 (像素)', value: shapeOpts.lastH || 100, min: 1, max: 30000 });
  if (kind === 'rect') F.push(
    { key: 'r0', label: '半径：左上', value: R[0], min: 0, max: 10000, step: 0.5 },
    { key: 'r1', label: '　　　右上', value: R[1], min: 0, max: 10000, step: 0.5 },
    { key: 'r3', label: '　　　左下', value: R[3], min: 0, max: 10000, step: 0.5 },
    { key: 'r2', label: '　　　右下', value: R[2], min: 0, max: 10000, step: 0.5 });
  if (kind === 'triangle') F.push({ key: 'eq', label: '等边', type: 'check', value: false }, { key: 'rad', label: '圆角半径', value: shapeOpts.triRadius || 0, min: 0, max: 10000, step: 0.5 });
  if (kind === 'polygon') F.push(
    { key: 'sym', label: '对称', type: 'check', value: true },
    { key: 'sides', label: '边数', value: shapeOpts.sides || 5, min: 3, max: 100 },
    { key: 'rad', label: '圆角半径', value: shapeOpts.polyRadius || 0, min: 0, max: 10000, step: 0.5 },
    { key: 'star', label: '星形比例 (%)', value: shapeOpts.starRatio ?? 100, min: 1, max: 100 },
    { key: 'smooth', label: '平滑星形缩进', type: 'check', value: !!shapeOpts.smoothIndent });
  if (kind === 'line') F.push({ key: 'ang', label: '角度 (度)', value: 0, min: -360, max: 360, step: 0.1 }, { key: 'wt', label: '粗细 (像素)', value: shapeOpts.weight || 2, min: 0.1, max: 1000, step: 0.5 });
  if (kind === 'customShape') F.push({ key: 'keep', label: '保留比例', type: 'check', value: true });
  if (kind !== 'line') F.push({ key: 'center', label: '从中心', type: 'check', value: !!shapeOpts.fromCenter });
  const v = await formDialog(TITLE[kind] || '创建形状', F);
  if (!v) return false;
  let w = +v.w || 100, h = +v.h || 100;
  if (kind === 'line') {
    const a = (+v.ang || 0) * Math.PI / 180, L = w;
    shapeOpts.weight = +v.wt || shapeOpts.weight;
    const subs = lineSubpaths(x, y, x + Math.cos(a) * L, y - Math.sin(a) * L);
    if (!subs) return false;
    return commitDrawnPath(subs, shapeKindLabel());
  }
  if (kind === 'triangle' && v.eq) h = w * Math.sqrt(3) / 2;
  if (kind === 'polygon' && v.sym) h = w;
  if (kind === 'customShape' && v.keep) h = w;
  shapeOpts.lastW = w; shapeOpts.lastH = h;
  const r = snapRect(v.center ? { x: x - w / 2, y: y - h / 2, w, h } : { x, y, w, h });
  const o = {};
  if (kind === 'rect') o.radii = [+v.r0 || 0, +v.r1 || 0, +v.r2 || 0, +v.r3 || 0];
  if (kind === 'triangle') { o.triRadius = +v.rad || 0; shapeOpts.triRadius = o.triRadius; }
  if (kind === 'polygon') { Object.assign(o, { sides: +v.sides || 5, polyRadius: +v.rad || 0, starRatio: +v.star || 100, smoothIndent: !!v.smooth });
    Object.assign(shapeOpts, { sides: o.sides, polyRadius: o.polyRadius, starRatio: o.starRatio, smoothIndent: o.smoothIndent }); }
  const subs = shapeSubpathsInRect(kind, r, o);
  if (!subs) return false;
  syncShapeBar();
  return commitDrawnPath(subs, shapeKindLabel(), { origin: shapeOriginFor(kind, r, o.radii) });
}


export function shapeKindLabel(){
  if (shapeOpts.kind === 'customShape') {
    const s = CUSTOM_SHAPE_BY_ID[shapeOpts.custom];
    return s ? s.name : '自定形状';
  }
  return SHAPE_KINDS[shapeOpts.kind] || '形状';
}




function penCloseTol(){
  const t0 = dispThr(9);
  return Number.isFinite(t0) ? Math.max(4, Math.min(t0, 24)) : 6;
}

export function penNearStart(pt){
  if (!pt || !penState || penState.pts.length < 2) return false;
  const a = penState.pts[0].anchor;
  return Math.hypot(pt.x - a[0], pt.y - a[1]) <= penCloseTol();
}

export function penNearAnchor(pt){
  if (!penState || !pt) return -1;
  const tol = penCloseTol();
  for (let i = 0; i < penState.pts.length; i++) {
    const a = penState.pts[i].anchor;
    if (Math.hypot(pt.x - a[0], pt.y - a[1]) <= tol) return i;
  }
  return -1;
}

export function penNearestSegment(pt){
  if (!penState || !pt) return null;
  const P = penState.pts, tol = penCloseTol();
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i].anchor, b = P[i + 1].anchor;
    const c1 = P[i].out && P[i].out.length === 2 ? P[i].out : a;
    const c2 = P[i + 1].in && P[i + 1].in.length === 2 ? P[i + 1].in : b;
    let best = null;
    for (let t = 0; t <= 32; t++) {
      const u = t / 32, v = 1 - u;
      const x = v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b[0];
      const y = v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b[1];
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (!best || d < best.d) best = { i, t: t / 32, x, y, d };
    }
    if (best && best.d <= tol) return best;
  }
  return null;
}
export function penNearSegment(pt){ return !!penNearestSegment(pt); }
function penNearHandle(pt){
  if (!penState || !pt) return null;
  const tol = penCloseTol();
  for (let i = 0; i < penState.pts.length; i++) {
    const k = penState.pts[i];
    for (const which of ['in', 'out']) {
      const h = k[which]; if (!h || Math.hypot(pt.x - h[0], pt.y - h[1]) > tol) continue;
      if (Math.hypot(h[0] - k.anchor[0], h[1] - k.anchor[1]) > 0.5) return { i, which };
    }
  }
  return null;
}
export function lerpPt(a, b, t){ return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function penInsertOnSegment(hit){
  if (!hit || !penState) return false;
  const a = penState.pts[hit.i], b = penState.pts[hit.i + 1];
  const c1 = a.out || a.anchor, c2 = b.in || b.anchor, t = hit.t;
  const q0 = lerpPt(a.anchor, c1, t), q1 = lerpPt(c1, c2, t), q2 = lerpPt(c2, b.anchor, t);
  const r0 = lerpPt(q0, q1, t), r1 = lerpPt(q1, q2, t), p = lerpPt(r0, r1, t);
  a.out = q0; b.in = q2;
  penState.pts.splice(hit.i + 1, 0, knotOf(p, r0, r1));
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}
export function penDeleteAnchor(i){
  if (!penState || i < 0 || i >= penState.pts.length) return false;
  penState.pts.splice(i, 1);
  if (!penState.pts.length) { penState = null; gizmo.classList.remove('pen-drawing'); }
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}




export const penOpts = { autoAddDelete: true, rubberBand: false, magnetic: false, magWidth: 10, magContrast: 10, magFreq: 57 };
try { Object.assign(penOpts, JSON.parse(localStorage.getItem('psd_editor.penOpts') || '{}')); } catch {}
export const savePenOpts = () => { try { localStorage.setItem('psd_editor.penOpts', JSON.stringify(penOpts)); } catch {} };



function penJoinTarget(pt){
  if (!pt || shapeOpts.mode !== 'path') return null;
  ensureDocPaths();
  const key = activePath && getDocPath(activePath) ? activePath : null;
  const dp = key && getDocPath(key); if (!dp) return null;
  for (const sub of dp.subpaths) {
    if (sub.closed || !sub.knots.length || penState?.sourceSubs?.includes(sub)) continue;
    for (const i of [0, sub.knots.length - 1]) {
      const a = sub.knots[i].anchor;
      if (Math.hypot(pt.x - a[0], pt.y - a[1]) <= penCloseTol()) return { sub, i, key };
    }
  }
  return null;
}
function penConnect(hit){
  const continuing = !!penState?.pts.length;
  const reverse = continuing ? hit.i !== 0 : hit.i === 0;
  const knots = (reverse ? hit.sub.knots.slice().reverse() : hit.sub.knots).map(k =>
    knotOf(k.anchor.slice(), (reverse ? k.out : k.in).slice(), (reverse ? k.in : k.out).slice()));
  if (!penState) penState = { pts: [], drag: null, closeHover: false };
  penState.sourceKey = hit.key;
  (penState.sourceSubs ||= []).push(hit.sub);
  penState.pts.push(...knots);
  penPointer = null;
  if (continuing) return commitPen(false);
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}

function penAutoTarget(pt){
  if (!pt || penState || !penOpts.autoAddDelete) return null;
  const key = pathTargetKey();
  if (pathGuard(key)) return null;
  const sp = pathWorking(key); if (!sp) return null;
  const tol = penCloseTol();
  for (let s = 0; s < sp.length; s++) for (let k = 0; k < sp[s].knots.length; k++) {
    const a = sp[s].knots[k].anchor;
    if (Math.hypot(pt.x - a[0], pt.y - a[1]) <= tol) return { key, sp, kind: 'del', s, k };
  }
  const seg = pathNearestSegment(sp, pt);
  return seg ? { key, sp, kind: 'add', seg } : null;
}

export function penHoverCursor(pt){
  if (!pt || penState?.drag) return null;
  if (penNearStart(pt)) return 'penClose';
  if (penState && penNearAnchor(pt) >= 0) return penOpts.autoAddDelete ? 'penDel' : 'penAnchor';
  if (penJoinTarget(pt)) return 'penJoin';
  if (penState && penOpts.autoAddDelete && penNearSegment(pt)) return 'penAdd';
  const au = penAutoTarget(pt);
  if (au) return au.kind === 'add' ? 'penAdd' : 'penDel';
  return null;
}

export function penConstrain(pt, from){
  const dx = pt.x - from[0], dy = pt.y - from[1];
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy);
  return { x: from[0] + Math.cos(ang) * L, y: from[1] + Math.sin(ang) * L };
}
export function penDown(ev, pt){
  if (!doc || li) return false;
  if (pathOpts.snapEdges) pt = { x: Math.round(pt.x), y: Math.round(pt.y) };
  penPointer = { ...pt };
  const alt = !!(ev && ev.altKey), cmd = !!(ev && (ev.ctrlKey || ev.metaKey));
  


  if (cmd) {
    if (penState) {
      const hh = penNearHandle(pt), ah = penNearAnchor(pt);
      if (hh) { penState.drag = { mode: 'handle', i: hh.i, which: hh.which, moved: false, start: { ...pt }, smooth: penState.pts[hh.i].linked !== false && !penKnotCorner(penState.pts[hh.i]) }; }
      else if (ah >= 0) { const k = penState.pts[ah]; penState.drag = { mode: 'anchor', i: ah, moved: false, start: { ...pt }, orig: { anchor: k.anchor.slice(), in: k.in.slice(), out: k.out.slice() } }; }
      else { if (!commitPen(false)) cancelPen(); return true; }
      gizmo.classList.add('drag', 'pen-drawing');
      try { gizmo.setPointerCapture(ev.pointerId); } catch {}
      syncGizmoCursor(); return true;
    }
    const was = docTool; set_docTool('path');
    try { return pathToolDown(ev, pt); } finally { set_docTool(was); }
  }
  const join = !alt && !penNearStart(pt) && penNearAnchor(pt) < 0 ? penJoinTarget(pt) : null;
  if (join) return penConnect(join);
  
  if (!penState && !alt) {
    const au = penAutoTarget(pt);
    if (au) {
      if (au.kind === 'add') {
        const k = pathInsertAnchor(au.sp, au.seg);
        pathSelAnchors.clear(); pathSelAnchors.add(pak(au.seg.s, k));
        commitPathEdit(au.key, '添加锚点');
        
        const kn = au.sp[au.seg.s].knots[k];
        set_pathAnchorDrag({ key: au.key, start: { x: pt.x, y: pt.y }, moved: false, orig: new Map([[pak(au.seg.s, k), cloneKnot(kn)]]) });
        try { gizmo.setPointerCapture(ev.pointerId); } catch {}
      } else {
        if (pathRemoveAnchor(au.sp, au.s, au.k, au.key)) { pathSelAnchors.clear(); commitPathEdit(au.key, '删除锚点'); }
      }
      drawGizmo(); syncGizmoCursor();
      return true;
    }
  }
  if (!penState) penState = { pts: [], drag: null, closeHover: false };
  const P = penState.pts;
  
  if (penNearStart(pt)) {
    penState.drag = { mode: 'close', i: 0, moved: false, start: { ...pt }, alt, orig: { in: P[0].in.slice(), out: P[0].out.slice() } };
    gizmo.classList.add('drag', 'pen-drawing');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    syncGizmoCursor(); return true;
  }
  const ah = penNearAnchor(pt);
  if (ah >= 0) {
    if (alt) {
      
      penState.drag = { mode: 'handle', i: ah, which: 'out', moved: false, start: { ...pt }, fromAnchor: true };
    } else if (penOpts.autoAddDelete) {
      
      penState.drag = { i: ah, moved: false, deleteOnClick: true, start: { ...pt } };
    } else {
      penState.drag = { mode: 'anchor', i: ah, moved: false, start: { ...pt }, orig: { anchor: P[ah].anchor.slice(), in: P[ah].in.slice(), out: P[ah].out.slice() } };
    }
    gizmo.classList.add('drag', 'pen-drawing');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    syncGizmoCursor(); return true;
  }
  if (!alt && penOpts.autoAddDelete) {
    const seg = penNearestSegment(pt);
    if (seg) return penInsertOnSegment(seg);
  }
  const hh = alt ? penNearHandle(pt) : null;
  if (hh) {
    penState.drag = { mode: 'handle', i: hh.i, which: hh.which, moved: false, start: { ...pt } };
    gizmo.classList.add('drag', 'pen-drawing');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    syncGizmoCursor(); return true;
  }
  
  if (P.length && ev && ev.shiftKey) pt = penConstrain(pt, P[P.length - 1].anchor);
  P.push(knotOf([pt.x, pt.y], [pt.x, pt.y], [pt.x, pt.y]));
  penState.drag = { i: P.length - 1, moved: false, start: { ...pt }, last: { ...pt } };
  gizmo.classList.add('drag');
  gizmo.classList.add('pen-drawing');
  if (ev && ev.pointerId != null) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} }
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}
const penKnotCorner = k => { const a = V2.sub(k.in, k.anchor), b = V2.sub(k.out, k.anchor); return !(V2.len(a) > 1e-6 && V2.len(b) > 1e-6 && V2.dot(V2.norm(a), V2.norm(b)) < -0.995); };
export function movePen(ev, pt){
  if (pathOpts.snapEdges && penState?.drag && !penState.drag.mode) pt = { x: Math.round(pt.x), y: Math.round(pt.y) };
  penPointer = { ...pt };
  if (!penState) { syncGizmoCursor(); drawGizmo(); return; }
  const d = penState.drag;
  if (d) {
    const k = penState.pts[d.i], a = k.anchor;
    const threshold = dispThr(1), origin = d.start || { x: a[0], y: a[1] };
    const far = Math.hypot(pt.x - origin.x, pt.y - origin.y) > (Number.isFinite(threshold) ? Math.max(0.5, threshold) : 1);
    if (d.mode === 'anchor') {                              
      const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
      k.anchor = [d.orig.anchor[0] + dx, d.orig.anchor[1] + dy]; k.in = [d.orig.in[0] + dx, d.orig.in[1] + dy]; k.out = [d.orig.out[0] + dx, d.orig.out[1] + dy];
      d.moved = d.moved || far; syncGizmoCursor(); drawGizmo(); return;
    }
    if (d.mode === 'handle') {
      if (!far && !d.moved) return;
      let h = [pt.x, pt.y];
      if (ev && ev.shiftKey) { const c = penConstrain(pt, a); h = [c.x, c.y]; }
      k[d.which] = h; d.moved = true;
      if (d.smooth && !(ev && ev.altKey)) {                 
        const o = d.which === 'in' ? 'out' : 'in', L = V2.len(V2.sub(k[o], a)), v = V2.norm(V2.sub(h, a));
        if (L > 1e-6) k[o] = [a[0] - v[0] * L, a[1] - v[1] * L];
      }
      if (ev && ev.altKey) k.linked = false;
      syncGizmoCursor(); drawGizmo(); return;
    }
    if (d.mode === 'close') {                               
      if (far) d.moved = true;
      if (d.moved && !d.alt) { k.in = [2 * a[0] - pt.x, 2 * a[1] - pt.y]; k.out = [pt.x, pt.y]; }
      drawGizmo(); return;
    }
    
    if (spaceDown && d.last) {
      const dx = pt.x - d.last.x, dy = pt.y - d.last.y;
      k.anchor = [a[0] + dx, a[1] + dy]; k.in = [k.in[0] + dx, k.in[1] + dy]; k.out = [k.out[0] + dx, k.out[1] + dy];
      if (d.start) { d.start.x += dx; d.start.y += dy; }
      d.last = { ...pt }; drawGizmo(); return;
    }
    d.last = { ...pt };
    if (far && !d.moved) { d.moved = true; syncGizmoCursor(); }
    if (!d.deleteOnClick || d.moved) {
      let h = [pt.x, pt.y];
      if (ev && ev.shiftKey) { const c = penConstrain(pt, a); h = [c.x, c.y]; }   
      k.out = h;
      
      if (ev && ev.altKey) { if (!d.frozenIn) d.frozenIn = k.in.slice(); k.in = d.frozenIn; k.linked = false; }
      else if (!d.frozenIn) k.in = [2 * a[0] - h[0], 2 * a[1] - h[1]];
    }
  }
  
  penState.closeHover = !d && penNearStart(pt);
  syncGizmoCursor();
  drawGizmo();
}
export function endPenDrag(ev){
  if (!penState) return false;
  const d = penState.drag;
  penPointer = null;
  penState.drag = null;
  gizmo.classList.remove('drag');
  gizmo.classList.remove('pen-drawing');
  if (d?.mode === 'curv') { gizmo.classList.add('pen-drawing'); syncPenBar(); drawGizmo(); syncGizmoCursor(); return true; }
  if (d?.deleteOnClick && !d.moved && ev?.type !== 'pointercancel') return penDeleteAnchor(d.i);
  if (d?.fromAnchor && !d.moved) { const k = penState.pts[d.i]; if (k) { k.out = k.anchor.slice(); k.linked = false; } }
  if (d?.mode === 'close') {
    const k = penState.pts[0];
    if (d.alt && k) { k.in = k.anchor.slice(); }            
    return commitPen(true);
  }
  if (penState.pts.length) gizmo.classList.add('pen-drawing');
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}
export function cancelPen(){
  if (!penState) return false;
  penPointer = null;
  penState = null;
  gizmo.classList.remove('drag');
  gizmo.classList.remove('pen-drawing');
  syncPenBar(); drawGizmo(); syncGizmoCursor();
  return true;
}






export function commitPen(closed = true){
  if (!penState) return false;
  const pts = penState.pts;
  const min = closed ? 3 : 2;
  if (pts.length < min) {
    $('#penInfo').textContent = `只有 ${pts.length} 个锚点，至少要 ${min} 个才能${closed ? '闭合' : '成一条路径'}。`;
    return false;
  }
  const pathMode = shapeOpts.mode === 'path';
  const subs = [{ closed: !!closed,
                  knots: pts.map(k => ({ anchor: k.anchor.slice(), in: k.in.slice(), out: k.out.slice() })) }];
  const sourceSubs = penState.sourceSubs, sourceKey = penState.sourceKey;
  penState = null;
  penPointer = null;
  gizmo.classList.remove('drag');
  gizmo.classList.remove('pen-drawing');
  syncPenBar(); drawGizmo(); syncGizmoCursor();   
  const dp = sourceKey && getDocPath(sourceKey);
  if (pathMode && sourceSubs?.length && dp) {
    const remaining = dp.subpaths.filter(sub => !sourceSubs.includes(sub));
    setDocPath(sourceKey, remaining.concat({ ...subs[0], operation: sourceSubs[0].operation }), '钢笔');
    activePath = sourceKey;
  } else commitDrawnPath(subs, pathMode ? '路径' : (shapeOpts.mode === 'pixel' ? '像素形状' : '形状'));
  return true;
}



export function shapeStrokeOpt(){
  const w = +shapeOpts.strokeW;
  if (!(w > 0) || shapeOpts.strokeType === 'none') return null;
  const dash = shapeDashArr();
  return {
    color: shapeOpts.stroke, width: w, align: shapeOpts.strokeAlign,
    cap: shapeOpts.strokeCap || (shapeOpts.dash === 'dot' ? 'round' : 'butt'),
    join: shapeOpts.strokeJoin || 'miter',
    ...(dash ? { dash: dash.map(v => Math.max(0.01, v * w)) } : {}),
  };
}

export function shapeDashArr(){
  if (Array.isArray(shapeOpts.dashArr) && shapeOpts.dashArr.length && shapeOpts.dash === 'custom') return shapeOpts.dashArr.map(v => Math.max(0.01, +v || 0.01));
  return DASH_PRESETS[shapeOpts.dash] || null;
}

function shapeContentSpecs(){
  const out = {};
  const grad = g => { const G = g || { type: 'linear', angle: 90, c0: hexOf(fgRGB), c1: hexOf(bgRGB) };
    return { type: G.type || 'linear', angle: +G.angle || 0, ...gradModelStops(gradNewModel(parseHex6(G.c0) || fgRGB.slice(), parseHex6(G.c1) || bgRGB.slice())) }; };
  const pat = id => { const pats = docPatterns(); const p = pats.find(q => q.id === id) || pats[0]; return p ? { name: p.name, id: p.id, scale: 100 } : null; };
  const ft = shapeOpts.fillType || 'solid', st = shapeOpts.strokeType || 'none';
  if (ft === 'none') out.fill = { type: 'none' };
  else if (ft === 'gradient') out.fill = { type: 'gradient', gradient: grad(shapeOpts.fillGrad) };
  else if (ft === 'pattern') { const pp = pat(shapeOpts.fillPat); if (pp) out.fill = { type: 'pattern', pattern: pp }; }
  if (+shapeOpts.strokeW > 0) {
    if (st === 'gradient') out.stroke = { type: 'gradient', gradient: grad(shapeOpts.strokeGrad), width: +shapeOpts.strokeW };
    else if (st === 'pattern') { const pp = pat(shapeOpts.strokePat); if (pp) out.stroke = { type: 'pattern', pattern: pp, width: +shapeOpts.strokeW }; }
  }
  return Object.keys(out).length ? out : null;
}

export function shapeLayerName(kindLabel){
  const used = new Set((doc && doc.layers || []).map((l, i) => layerRenames[i] || l.unicodeName || l.name || ''));
  let n = 1;
  while (used.has(`${kindLabel} ${n}`)) n++;
  return `${kindLabel} ${n}`;
}





export async function commitShapePath(subpaths, kindLabel, meta = {}){
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, '新建形状图层')) return false;
  const pathOp = meta.pathOp || shapeOpts.pathOp;
  const wantMerge = pathOp !== 'new' && selLayer >= 0;
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  setWaitCursor(true, '正在处理当前视图…');
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    let old = null;
    if (wantMerge) { try { old = getVectorMaskPath(base, selLayer); } catch { old = null; } }
    let r, at, msg;
    if (old) {
      const subs = old.subpaths
        .map(sp => ({ closed: sp.closed, operation: sp.operation, knots: sp.knots }))
        .concat(subpaths.map(sp => ({ ...sp, operation: pathOp })));
      r = applyEdits(base, [{ op: 'setVectorMaskPath', index: selLayer, subpaths: subs }]);
      at = selLayer;
      const nm = (doc.layers[selLayer] && (layerRenames[selLayer] || doc.layers[selLayer].unicodeName || doc.layers[selLayer].name)) || ('图层 ' + selLayer);
      msg = `已把${kindLabel}并进「${nm}」的矢量蒙版（${PATH_OP_LABEL[pathOp]}，现在 ${subs.length} 条子路径）。`;
    } else {
      let baseLayerCount = doc.layers.length;
      try { baseLayerCount = parsePsdFull(base).layers.length; } catch {}
      at = Math.min(selLayer >= 0 ? selLayer + 1 : baseLayerCount, baseLayerCount);
      const name = shapeLayerName(kindLabel);
      const stroke = shapeStrokeOpt();
      const ops = [{ op: 'addShapeLayer', at, name, color: shapeOpts.fill, subpaths, ...(stroke ? { stroke } : {}), ...(meta.origin ? { origin: meta.origin } : {}) }];
      
      const content = shapeContentSpecs();
      if (content) ops.push({ op: 'setShapeContent', index: at, ...content });
      r = applyEdits(base, ops);
      msg = `已新建形状图层「${name}」`;
    }
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, old ? '合并形状路径' : '新建形状图层');
    $('#err').textContent = '';
    $('#notice').textContent = msg;
    shell.status(msg);
    syncShapeBar(); syncPenBar();
    return true;
  } catch (e) {
    $('#err').textContent = '生成形状没能完成：' + humanEditError(e && e.message || e);
    return false;
  } finally {
    setWaitCursor(false);
  }
}






function barShapeIdx(){
  if (!doc || li || selLayer < 0) return -1;
  const l = layerTree && layerTree.flat && layerTree.flat[selLayer];
  return l && isShapeLayer(l) && !layerDeletes.has(selLayer) ? selLayer : -1;
}

function shapeFillHex(idx){
  const p = layerParams(idx);
  const tgt = p && !p.error && p.adjustment && (p.adjustment.targets || []).find(t => t.block === 'SoCo');
  if (!tgt) return null;
  const whole = effParam(idx, tgt.target, tgt.at || 0, 'Clr ', undefined);
  if (typeof whole === 'string' && /^#[0-9a-f]{6}$/i.test(whole)) return whole.toLowerCase();
  const f = tgt.fields.find(x => x.path === 'Clr ');
  const comps = (f && f.components) || [];
  return '#' + comps.slice(0, 3).map(pth => { const c = tgt.fields.find(x => x.path === pth); const v = c ? effParam(idx, tgt.target, tgt.at || 0, pth, c.value) : 0;
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join('');
}
function setShapeFillHex(idx, hex){
  const p = layerParams(idx);
  const tgt = p && !p.error && p.adjustment && (p.adjustment.targets || []).find(t => t.block === 'SoCo');
  if (!tgt) return false;
  const f = tgt.fields.find(x => x.path === 'Clr ');
  const orig = '#' + ((f && f.components) || []).slice(0, 3).map(pth => { const c = tgt.fields.find(x => x.path === pth); return Math.max(0, Math.min(255, Math.round(c ? c.value : 0))).toString(16).padStart(2, '0'); }).join('');
  return setParamField(idx, tgt.target, tgt.at || 0, 'Clr ', hex.toLowerCase(), orig.toLowerCase());
}

export function paintSwatch(btn, type, color, grad, isStroke){
  if (!btn) return;
  btn.classList.toggle('none', type === 'none');
  btn.classList.toggle('stroke-sw', !!isStroke && type !== 'none');
  let bg = '#fff';
  if (type === 'solid') bg = color || '#000';
  else if (type === 'gradient') { const g = grad || {}; bg = `linear-gradient(90deg, ${g.c0 || hexOf(fgRGB)}, ${g.c1 || hexOf(bgRGB)})`; }
  else if (type === 'pattern') bg = 'repeating-conic-gradient(#999 0 25%, #ddd 0 50%) 0 0/8px 8px';
  if (isStroke && type !== 'none') { btn.style.setProperty('--sw', type === 'solid' ? (color || '#000') : '#888'); btn.style.background = type === 'solid' ? 'var(--ps-panel,#323232)' : bg; }
  else { btn.style.removeProperty('--sw'); btn.style.background = bg; }
}

function strokeOptSvg(dash, cap){
  const d = dash === 'dash' ? '6 3' : dash === 'dot' ? '0.5 3' : dash === 'custom' ? '4 2 1 2' : '';
  return `<svg width="40" height="10" viewBox="0 0 40 10"><line x1="3" y1="5" x2="37" y2="5" stroke="currentColor" stroke-width="2.5" ${d ? `stroke-dasharray="${d}"` : ''} stroke-linecap="${dash === 'dot' ? 'round' : (cap || 'butt')}"/></svg><span style="font-size:8px;opacity:.7">▾</span>`;
}
export let shapePop = null;
function closeShapePop(){ if (shapePop) shapePop.remove(); shapePop = null; removeEventListener('pointerdown', shapePopDown, true); removeEventListener('keydown', popEsc, true); }

export function popEsc(e){ if (e.key === 'Escape' && (shapePop || barPop)) { e.preventDefault(); e.stopPropagation(); closeShapePop(); closeBarPopover(); } }
function shapePopDown(e){ if (shapePop && !shapePop.contains(e.target) && !(e.target.closest && (e.target.closest('.swbtn') || e.target.closest('.strokeoptbtn')))) closeShapePop(); }
function showShapePop(anchor, build){
  closeShapePop();
  const pop = mkEl('div', { className: 'shape-pop' });
  build(pop);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(innerWidth - pop.offsetWidth - 4, r.left)) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  shapePop = pop;
  addEventListener('keydown', popEsc, true);
  setTimeout(() => addEventListener('pointerdown', shapePopDown, true), 0);
  return pop;
}
const SHAPE_SWATCHES = ['#000000', '#ffffff', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#808080', '#c0c0c0',
                        '#f26c4f', '#fbaf5c', '#fff467', '#7cc576', '#3cb878', '#1cbbb4', '#448ccb', '#5574b9', '#855fa8', '#f06eaa'];

export function openContentPopover(anchor, which){
  const idx = barShapeIdx();
  const cur = idx >= 0 ? shapeContentState(idx)[which] : (which === 'fill' ? shapeOpts.fillType : (+shapeOpts.strokeW > 0 ? shapeOpts.strokeType : 'none')) || 'solid';
  const color = which === 'fill' ? (idx >= 0 ? shapeFillHex(idx) : null) || shapeOpts.fill
    : (idx >= 0 && effStroke(idx) && !effStroke(idx).error && effStroke(idx).color ? hexOf(effStroke(idx).color) : shapeOpts.stroke);
  const gKey = which === 'fill' ? 'fillGrad' : 'strokeGrad', pKey = which === 'fill' ? 'fillPat' : 'strokePat';
  const G = shapeOpts[gKey] || { type: 'linear', angle: 90, c0: hexOf(fgRGB), c1: hexOf(bgRGB) };
  let type = cur;
  showShapePop(anchor, pop => {
    const tabs = mkEl('div', { className: 'tabs' });
    const TAB = [['none', '无颜色', '<svg width="18" height="18"><rect x="1" y="1" width="16" height="16" fill="#fff" stroke="#888"/><line x1="2" y1="16" x2="16" y2="2" stroke="#e33" stroke-width="2"/></svg>'],
                 ['solid', '纯色', '<svg width="18" height="18"><rect x="1" y="1" width="16" height="16" fill="currentColor"/></svg>'],
                 ['gradient', '渐变', '<svg width="18" height="18"><defs><linearGradient id="spg"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="1" y="1" width="16" height="16" fill="url(#spg)" stroke="#888"/></svg>'],
                 ['pattern', '图案', '<svg width="18" height="18"><rect x="1" y="1" width="16" height="16" fill="#ddd" stroke="#888"/><path d="M1 1h4v4H1zM9 1h4v4H9zM5 5h4v4H5zM13 5h4v4h-4zM1 9h4v4H1zM9 9h4v4H9zM5 13h4v4H5zM13 13h4v4h-4z" fill="#888"/></svg>']];
    const body = mkEl('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:7px';
    const pats = docPatterns();
    const apply = (t, extra = {}) => {
      if (t === 'pattern' && !pats.length) { $('#notice').textContent = '这个文档里没有图案资源（Patt 块），图案类型只能引用已有的图案。'; return; }
      type = t;
      if (idx >= 0) {
        const spec = t === 'gradient' ? { gradient: { type: G.type, angle: +G.angle || 0, ...gradModelStops(gradNewModel(parseHex6(G.c0) || fgRGB.slice(), parseHex6(G.c1) || bgRGB.slice())) } }
          : t === 'pattern' ? { pattern: (() => { const p = pats.find(q => q.id === shapeOpts[pKey]) || pats[0]; return { name: p.name, id: p.id, scale: 100 }; })() }
          : t === 'solid' && extra.color ? { color: parseHex6(extra.color) } : {};
        closeShapePop();
        setShapeContentType(idx, which, t, spec).then(() => syncShapeBar());
        return;
      }
      if (which === 'fill') shapeOpts.fillType = t;
      else { shapeOpts.strokeType = t; if (t !== 'none' && !(+shapeOpts.strokeW > 0)) shapeOpts.strokeW = 1; }
      syncShapeBar(); syncPenBar(); render();
    };
    const setColor = hex => {
      if (idx >= 0) {
        if (type !== 'solid') { apply('solid', { color: hex }); return; }
        if (which === 'fill') setShapeFillHex(idx, hex);
        else { const b = readVectorStroke(idx); if (b && !b.error) setStrokeField(idx, 'color', parseHex6(hex), b.color); }
        renderProps(); syncShapeBar(); return;
      }
      if (which === 'fill') { shapeOpts.fill = hex; shapeOpts.fillFromFg = false; shapeOpts.fillType = 'solid'; $('#shpFill').value = hex; $('#penFill').value = hex; }
      else { shapeOpts.stroke = hex; shapeOpts.strokeType = 'solid'; if (!(+shapeOpts.strokeW > 0)) shapeOpts.strokeW = 1; $('#shpStroke').value = hex; }
      syncShapeBar(); syncPenBar(); drawGizmo();
    };
    const render = () => {
      tabs.replaceChildren(); body.replaceChildren();
      for (const [t, title, svg] of TAB) {
        const b = mkEl('button', { type: 'button', title, className: t === type ? 'on' : '' }); b.innerHTML = svg; b.dataset.contentType = t;
        if (t === 'pattern' && !pats.length) { b.disabled = true; b.title = '图案（文档里没有图案资源）'; }
        b.onclick = () => { if (t === 'solid' && idx < 0) { type = 'solid'; apply('solid'); } else if (t !== type) apply(t); };
        tabs.append(b);
      }
      if (type === 'solid') {
        const row = mkEl('div', { className: 'row' });
        const ci = mkEl('input', { type: 'color', value: color || '#000000' }); ci.style.cssText = 'width:44px;height:22px;padding:0';
        ci.onchange = () => setColor(ci.value);
        const recent = mkEl('button', { type: 'button', textContent: '前景色', title: '用当前前景色' }); recent.onclick = () => setColor(hexOf(fgRGB));
        row.append(mkEl('span', { textContent: '颜色' }), ci, recent); body.append(row);
        const sw = mkEl('div', { className: 'swatches' });
        for (const c of SHAPE_SWATCHES) { const i = mkEl('i', { title: c }); i.style.background = c; i.onclick = () => setColor(c); sw.append(i); }
        body.append(sw);
      } else if (type === 'gradient') {
        const row1 = mkEl('div', { className: 'row' }), ts = mkEl('select');
        for (const [v, t] of [['linear', '线性'], ['radial', '径向'], ['angle', '角度'], ['reflected', '对称'], ['diamond', '菱形']]) ts.append(new Option(t, v));
        ts.value = G.type || 'linear';
        const an = mkEl('input', { type: 'number', value: +G.angle || 0, min: -180, max: 180, step: 1 }); an.style.width = '52px';
        row1.append(mkEl('span', { textContent: '样式' }), ts, mkEl('span', { textContent: '角度' }), an, mkEl('span', { textContent: '°' }));
        const row2 = mkEl('div', { className: 'row' });
        const c0 = mkEl('input', { type: 'color', value: G.c0 || hexOf(fgRGB) }), c1 = mkEl('input', { type: 'color', value: G.c1 || hexOf(bgRGB) });
        const rev = mkEl('button', { type: 'button', textContent: '⇄', title: '反向' });
        row2.append(mkEl('span', { textContent: '色标' }), c0, rev, c1);
        const pv = mkEl('div'); pv.style.cssText = 'height:14px;border:1px solid #111';
        const upd = () => { G.type = ts.value; G.angle = +an.value || 0; G.c0 = c0.value; G.c1 = c1.value; shapeOpts[gKey] = { ...G };
          pv.style.background = `linear-gradient(90deg, ${G.c0}, ${G.c1})`; };
        upd();
        const commit = () => { upd(); if (idx >= 0) apply('gradient'); else { syncShapeBar(); syncPenBar(); } };
        for (const el of [ts, an, c0, c1]) el.onchange = commit;
        rev.onclick = () => { const t = c0.value; c0.value = c1.value; c1.value = t; commit(); };
        body.append(row1, row2, pv);
        if (type !== cur && idx < 0) {  }
      } else if (type === 'pattern') {
        const row = mkEl('div', { className: 'row' }), ps = mkEl('select');
        for (const p of pats) ps.append(new Option(p.name || p.id, p.id));
        ps.value = shapeOpts[pKey] || (pats[0] && pats[0].id) || '';
        ps.onchange = () => { shapeOpts[pKey] = ps.value; if (idx >= 0) apply('pattern'); };
        row.append(mkEl('span', { textContent: '图案' }), ps); body.append(row);
      } else body.append(mkEl('div', { textContent: which === 'fill' ? '无填充（只留描边 / 路径）' : '无描边', style: 'opacity:.7' }));
    };
    render();
    pop.append(tabs, body);
  });
}

function openStrokeOptPopover(anchor){
  const idx = barShapeIdx();
  const st = idx >= 0 ? effStroke(idx) : null;
  const base = idx >= 0 ? readVectorStroke(idx) : null;
  const curAlign = st && !st.error ? st.align : shapeOpts.strokeAlign;
  const curCap = st && !st.error ? st.cap : shapeOpts.strokeCap;
  const curJoin = st && !st.error ? st.join : shapeOpts.strokeJoin;
  const setF = (field, v, optKey) => {
    if (idx >= 0 && st && !st.error) { setStrokeField(idx, field, v, base[field]); renderProps(); }
    else if (optKey) shapeOpts[optKey] = v;
    syncShapeBar(); drawGizmo();
  };
  showShapePop(anchor, pop => {
    pop.append(mkEl('div', { textContent: '描边选项', style: 'font-weight:600' }));
    const pre = mkEl('div', { className: 'presets' });
    for (const [v, t] of [['solid', '实线'], ['dash', '虚线'], ['dot', '点线']]) {
      const b = mkEl('button', { type: 'button', title: t, className: shapeOpts.dash === v ? 'on' : '' });
      b.innerHTML = strokeOptSvg(v, v === 'dot' ? 'round' : 'butt').replace(/<span.*$/, '') + `<span style="margin-left:6px">${t}</span>`;
      b.onclick = () => {
        shapeOpts.dash = v;
        if (v === 'dot') shapeOpts.strokeCap = 'round'; else if (shapeOpts.strokeCap === 'round' && v !== 'custom') shapeOpts.strokeCap = 'butt';
        if (idx >= 0 && st && !st.error) {
          const w = +st.width || 1, arr = DASH_PRESETS[v];
          setStrokeField(idx, 'dashes', arr ? arr.map(x => x * w) : [], base.dashes || []);
          if (v === 'dot') setStrokeField(idx, 'cap', 'round', base.cap);
          renderProps();
        }
        closeShapePop(); syncShapeBar(); drawGizmo();
      };
      pre.append(b);
    }
    pop.append(pre);
    const seg = (label, list, cur, on) => {
      const r = mkEl('div', { className: 'row' }), g = mkEl('span', { className: 'segbtns' });
      for (const [v, t, ic] of list) {
        const b = mkEl('button', { type: 'button', title: t, className: cur === v ? 'on' : '' });
        if (ic && /^(data:|\/assets\/)/.test(ic)) { const img = mkEl('img', { src: ic, width: 16, height: 16 }); img.style.display = 'block'; b.append(img); }
        else if (ic) b.innerHTML = ic; else b.textContent = t;
        b.onclick = () => { for (const x of g.children) x.classList.remove('on'); b.classList.add('on'); on(v); };
        g.append(b);
      }
      r.append(mkEl('span', { textContent: label }), g); pop.append(r);
    };
    const capSvg = c => `<svg width="18" height="12"><line x1="3" y1="6" x2="15" y2="6" stroke="currentColor" stroke-width="6" stroke-linecap="${c}" opacity=".85"/><line x1="3" y1="6" x2="15" y2="6" stroke="#0af" stroke-width="1"/></svg>`;
    const joinSvg = j => `<svg width="18" height="14"><polyline points="3,12 9,3 15,12" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="${j}"/></svg>`;
    seg('对齐:', [['inside', '内部', PATH_UI_ICONS.strokeInside], ['center', '居中', PATH_UI_ICONS.strokeCenter], ['outside', '外部', PATH_UI_ICONS.strokeOutside]], curAlign, v => setF('align', v, 'strokeAlign'));
    seg('端点:', [['butt', '平头', capSvg('butt')], ['round', '圆头', capSvg('round')], ['square', '方头', capSvg('square')]], curCap, v => setF('cap', v, 'strokeCap'));
    seg('角点:', [['miter', '斜接', joinSvg('miter')], ['round', '圆角', joinSvg('round')], ['bevel', '斜面', joinSvg('bevel')]], curJoin, v => setF('join', v, 'strokeJoin'));
    
    const dr = mkEl('div', { className: 'row' });
    const dcb = mkEl('input', { type: 'checkbox', checked: shapeOpts.dash === 'custom' });
    dr.append(mkEl('span', { textContent: '' }), mkEl('label', {}), dcb, document.createTextNode(' 虚线'));
    pop.append(dr);
    const vals = (Array.isArray(shapeOpts.dashArr) && shapeOpts.dashArr.length ? shapeOpts.dashArr : [4, 2]).slice(0, 6);
    const dg = mkEl('div', { className: 'row' }), ins = [];
    for (let k = 0; k < 6; k++) {
      const inp = mkEl('input', { type: 'number', min: 0, step: 0.5, value: vals[k] ?? '', title: k % 2 ? '间隙（线宽倍数）' : '虚线（线宽倍数）' });
      inp.style.width = '34px'; ins.push(inp); dg.append(inp);
    }
    const lab = mkEl('div', { textContent: '虚线　间隙　虚线　间隙　虚线　间隙', style: 'font-size:10px;opacity:.6;padding-left:2px' });
    pop.append(dg, lab);
    const commitDash = () => {
      const arr = ins.map(i => +i.value).filter((v, k) => Number.isFinite(v) && v > 0 && ins[k].value !== '');
      shapeOpts.dashArr = arr.length ? arr : null;
      shapeOpts.dash = dcb.checked && arr.length ? 'custom' : (shapeOpts.dash === 'custom' ? 'solid' : shapeOpts.dash);
      if (idx >= 0 && st && !st.error) { const w = +st.width || 1; setStrokeField(idx, 'dashes', dcb.checked && arr.length ? arr.map(x => x * w) : [], base.dashes || []); renderProps(); }
      syncShapeBar(); drawGizmo();
    };
    dcb.onchange = commitDash; for (const i of ins) i.onchange = () => { dcb.checked = true; commitDash(); };
  });
}

function openShapeGear(anchor){
  const kind = shapeOpts.kind;
  openPathLookPopover(anchor, (pop, row) => {
    const redraw = () => { syncShapeBar(); drawGizmo(); };
    if (kind === 'line') {
      pop.append(mkEl('div', { textContent: '箭头', style: 'font-weight:600;margin-top:4px' }));
      const r0 = mkEl('div'); r0.style.cssText = 'display:flex;gap:14px';
      for (const [k, t] of [['arrowStart', '起点'], ['arrowEnd', '终点']]) {
        const l = mkEl('label'); const c = mkEl('input', { type: 'checkbox', checked: !!shapeOpts[k] });
        c.onchange = () => { shapeOpts[k] = c.checked; redraw(); }; l.append(c, document.createTextNode(' ' + t)); r0.append(l);
      }
      pop.append(r0);
      for (const [k, t, lo, hi] of [['arrowW', '宽度:', 10, 1000], ['arrowL', '长度:', 10, 5000], ['arrowC', '凹度:', -50, 50]]) {
        const i = mkEl('input', { type: 'number', value: shapeOpts[k], min: lo, max: hi, step: 1 }); i.style.width = '64px';
        i.onchange = () => { shapeOpts[k] = Math.max(lo, Math.min(hi, +i.value || 0)); i.value = shapeOpts[k]; redraw(); };
        row(t, i, mkEl('span', { textContent: '%' }));
      }
      return;
    }
    if (kind === 'polygon') {
      const sr = mkEl('input', { type: 'number', value: shapeOpts.starRatio ?? 100, min: 1, max: 100, step: 1 }); sr.style.width = '64px';
      sr.onchange = () => { shapeOpts.starRatio = Math.max(1, Math.min(100, +sr.value || 100)); sr.value = shapeOpts.starRatio; redraw(); };
      row('星形比例:', sr, mkEl('span', { textContent: '%' }));
      const sl = mkEl('label'); const sc = mkEl('input', { type: 'checkbox', checked: !!shapeOpts.smoothIndent });
      sc.onchange = () => { shapeOpts.smoothIndent = sc.checked; redraw(); }; sl.append(sc, document.createTextNode(' 平滑星形缩进'));
      pop.append(sl);
    }
    
    const sqName = kind === 'ellipse' ? '圆（绘制直径或半径）' : kind === 'customShape' ? '定义的比例' : '方形';
    const grp = mkEl('div'); grp.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-top:4px';
    const radio = (v, t, extra) => {
      const l = mkEl('label'); l.style.cssText = 'display:flex;align-items:center;gap:6px';
      const r = mkEl('input', { type: 'radio', name: 'shpCons', checked: (shapeOpts.constrain || 'none') === v });
      r.onchange = () => { if (r.checked) { shapeOpts.constrain = v; redraw(); } };
      l.append(r, document.createTextNode(t)); if (extra) l.append(...extra); grp.append(l);
    };
    const num = (k) => { const i = mkEl('input', { type: 'number', value: shapeOpts[k], min: 0.001, step: 1 }); i.style.width = '52px'; i.onchange = () => { shapeOpts[k] = Math.max(0.001, +i.value || 1); }; return i; };
    radio('none', '不受约束');
    radio('square', sqName);
    radio('fixed', '固定大小', [mkEl('span', { textContent: 'W:' }), num('fixW'), mkEl('span', { textContent: 'H:' }), num('fixH')]);
    radio('prop', '比例', [mkEl('span', { textContent: 'W:' }), num('propW'), mkEl('span', { textContent: 'H:' }), num('propH')]);
    const cl = mkEl('label'); const cc = mkEl('input', { type: 'checkbox', checked: !!shapeOpts.fromCenter });
    cc.onchange = () => { shapeOpts.fromCenter = cc.checked; }; cl.append(cc, document.createTextNode(' 从中心'));
    grp.append(cl);
    pop.append(grp);
  });
}

export async function makeFromPath(what){
  const subs = activeDocSubs();
  if (!subs) { $('#notice').textContent = '还没有路径：先用钢笔 / 形状工具（路径模式）画一条。'; return false; }
  if (what === 'sel') return pathToSelectionUI(true);
  if (what === 'mask') { try { return actions.run('layer.vectorMask.currentPath'); } catch { return false; } }
  if (what === 'shape') return commitShapePath(cloneDocSubs(subs), '形状');
  return false;
}
export function syncShapeBar(){
  const g = $('#grpShape'); if (!g) return;
  if (!shapeBarBound) {
    shapeBarBound = true;
    const sel = $('#shpPathOp');
    for (const o of PATH_OP_LIST) { const el = document.createElement('option'); el.value = o.value; el.textContent = o.label; sel.appendChild(el); }
    sel.onchange = () => { shapeOpts.pathOp = sel.value; syncShapeBar(); };
    const msel = $('#shpMode');
    for (const m of SHAPE_MODES) { const el = document.createElement('option'); el.value = m.value; el.textContent = m.label; msel.appendChild(el); }
    msel.onchange = () => { setShapeMode(msel.value); };
    $('#shpWorkSel').onclick = () => pathToSelectionUI(false, 'replace');
    $('#shpWorkDel').onclick = () => clearWorkPath();
    $('#shpMkSel').onclick = () => makeFromPath('sel');
    $('#shpMkMask').onclick = () => makeFromPath('mask');
    $('#shpMkShape').onclick = () => makeFromPath('shape');
    const num = (id, key, lo, hi, after) => $(id).addEventListener('change', () => {
      const v = +$(id).value;
      shapeOpts[key] = Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
      if (after) after(shapeOpts[key]);
      syncShapeBar(); drawGizmo();
    });
    num('#shpRadius', 'radius', 0, 10000, v => { shapeOpts.radii = null; const i = barShapeIdx(); if (i >= 0 && liveShapeOf(i)?.kind === 'rect') applyLiveShape(i, { radii: [v, v, v, v] }); });
    num('#shpTriRadius', 'triRadius', 0, 10000); num('#shpPolyRadius', 'polyRadius', 0, 10000);
    num('#shpSides', 'sides', 3, 100); num('#shpWeight', 'weight', 0.1, 1000);
    num('#shpStrokeW', 'strokeW', 0, 1000, v => {
      const i = barShapeIdx();
      if (i >= 0) { const st = effStroke(i), b = readVectorStroke(i);
        if (st && !st.error) { setStrokeField(i, 'width', v, b.width); if (v > 0 && !st.enabled) setStrokeField(i, 'enabled', true, !!b.enabled); renderProps(); }
        else if (v > 0) setShapeContentType(i, 'stroke', 'solid', { color: parseHex6(shapeOpts.stroke) || [0, 0, 0], width: v }).then(() => syncShapeBar());
        return; }
      if (v > 0 && shapeOpts.strokeType === 'none') shapeOpts.strokeType = 'solid';   
    });
    const strokeColor = () => { shapeOpts.stroke = $('#shpStroke').value; if (shapeOpts.strokeType === 'none' && +shapeOpts.strokeW > 0) shapeOpts.strokeType = 'solid'; drawGizmo(); };
    $('#shpStroke').addEventListener('change', strokeColor);
    $('#shpStroke').addEventListener('input', strokeColor);
    $('#shpStrokeAlign').onchange = () => { shapeOpts.strokeAlign = $('#shpStrokeAlign').value; syncShapeBar(); };
    $('#shpDash').onchange = () => { shapeOpts.dash = $('#shpDash').value; syncShapeBar(); drawGizmo(); };
    const fill = () => { shapeOpts.fill = $('#shpFill').value; shapeOpts.fillFromFg = false; shapeOpts.fillType = 'solid';
      const p = $('#penFill'); if (p) p.value = shapeOpts.fill; syncShapeBar(); drawGizmo(); };
    $('#shpFill').addEventListener('change', fill);
    $('#shpFill').addEventListener('input', fill);
    $('#shpFillBtn').onclick = e => openContentPopover(e.currentTarget, 'fill');
    $('#shpStrokeBtn').onclick = e => openContentPopover(e.currentTarget, 'stroke');
    $('#shpStrokeOpt').onclick = e => openStrokeOptPopover(e.currentTarget);
    $('#shpSnap').onchange = () => { pathOpts.snapEdges = $('#shpSnap').checked; savePathOpts(); syncPenBar(); };
    
    const wh = (key) => $(key === 'w' ? '#shpW' : '#shpH').addEventListener('change', () => {
      const i = barShapeIdx(); if (i < 0) { syncShapeBar(); return; }
      const v = Math.max(1, +$(key === 'w' ? '#shpW' : '#shpH').value || 1), cur = getPropertyTransformValues(i);
      const patch = { [key]: v };
      if (shapeOpts.linkWH && cur.w && cur.h) { if (key === 'w') patch.h = cur.h * v / cur.w; else patch.w = cur.w * v / cur.h; }
      pushDocHistory('修改形状尺寸'); setShapePropertyTransform(i, patch); renderProps(); syncShapeBar(); drawGizmo();
    });
    wh('w'); wh('h');
    $('#shpLink').onclick = () => { shapeOpts.linkWH = !shapeOpts.linkWH; syncShapeBar(); };
    mountPathButtons($('#shpBtns'), { draw: true, onGear: openShapeGear, gearTitle: '设置其它形状和路径选项' });
    if (!customPopBound) {
      set_customPopBound(true);
      $('#shpCustomBtn').addEventListener('click', e => {
        e.stopPropagation();
        if ($('#shpCustomPop').hidden) showCustomPop(); else hideCustomPop();
      });
      document.addEventListener('pointerdown', e => {
        const p = $('#shpCustomPop');
        if (!p || p.hidden) return;
        if (p.contains(e.target) || $('#shpCustomBtn').contains(e.target)) return;
        hideCustomPop();
      }, true);
    }
  }
  if (shapeOpts.fillFromFg) shapeOpts.fill = hexOf(fgRGB);   
  const kind = shapeOpts.kind;
  const mode = shapeOpts.mode;
  $('#shpKindName').textContent = (SHAPE_KINDS[kind] || '形状') + '工具';
  $('#shpMode').value = mode;
  
  const vec = mode === 'shape';
  for (const id of ['#shpFillWrap', '#shpStrokeWrap', '#shpStrokeWWrap', '#shpStrokeOptWrap', '#shpWHWrap'])
    { const el = $(id); if (el) el.hidden = !vec; }
  $('#shpMakeWrap').hidden = mode !== 'path';
  const ww = $('#shpWorkWrap');
  if (ww) {
    $('#shpWorkSel').disabled = !(workPath && workPath.subpaths.length);
    $('#shpWorkDel').disabled = !workPath;
  }
  $('#shpRadiusWrap').hidden = kind !== 'rect';
  $('#shpTriRadiusWrap').hidden = kind !== 'triangle';
  $('#shpSidesWrap').hidden = kind !== 'polygon';
  $('#shpWeightWrap').hidden = kind !== 'line';
  const cw = $('#shpCustomWrap');
  if (cw) {
    cw.hidden = kind !== 'customShape';
    if (kind !== 'customShape') hideCustomPop();
    else {
      const s = CUSTOM_SHAPE_BY_ID[shapeOpts.custom] || CUSTOM_SHAPES[0];
      const pv = $('#shpCustomBtn').querySelector('.pv');
      pv.innerHTML = ''; pv.appendChild(customShapeThumb(s.id, 22, 22));
      $('#shpCustomBtn').querySelector('.pn').textContent = s.name;
    }
  }
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = String(v); };
  
  const si = barShapeIdx();
  let fType = shapeOpts.fillType || 'solid', fHex = shapeOpts.fill, sType = +shapeOpts.strokeW > 0 ? (shapeOpts.strokeType === 'none' ? 'solid' : shapeOpts.strokeType) : 'none';
  let sHex = shapeOpts.stroke, sW = shapeOpts.strokeW, dashKey = shapeOpts.dash, cap = shapeOpts.strokeCap;
  if (si >= 0) {
    const cs = shapeContentState(si);
    fType = cs.fill; fHex = shapeFillHex(si) || fHex; sType = cs.stroke;
    const st = effStroke(si);
    if (st && !st.error) { sHex = hexOf(st.color || [0, 0, 0]); sW = st.enabled ? st.width : 0; cap = st.cap;
      dashKey = (st.dashes || []).length ? (st.cap === 'round' ? 'dot' : 'dash') : 'solid'; }
    const v = getPropertyTransformValues(si);
    set('#shpW', Math.round(v.w)); set('#shpH', Math.round(v.h));
    const ls = liveShapeOf(si);
    if (ls && ls.kind === 'rect') set('#shpRadius', +(Math.max(...ls.radii)).toFixed(2));
  } else { set('#shpW', ''); set('#shpH', ''); set('#shpRadius', shapeOpts.radius); }
  $('#shpW').disabled = $('#shpH').disabled = si < 0;
  $('#shpLink').classList.toggle('on', !!shapeOpts.linkWH);
  paintSwatch($('#shpFillBtn'), fType, fHex, shapeOpts.fillGrad, false);
  paintSwatch($('#shpStrokeBtn'), sType, sHex, shapeOpts.strokeGrad, true);
  $('#shpStrokeOpt').innerHTML = strokeOptSvg(dashKey, cap);
  set('#shpFill', fHex); set('#shpTriRadius', shapeOpts.triRadius || 0); set('#shpPolyRadius', shapeOpts.polyRadius || 0);
  set('#shpSides', shapeOpts.sides); set('#shpWeight', shapeOpts.weight);
  set('#shpStroke', sHex); set('#shpStrokeW', sW);
  $('#shpStrokeAlign').value = shapeOpts.strokeAlign;
  $('#shpDash').value = shapeOpts.dash;
  const noStroke = sType === 'none';
  $('#shpStrokeAlign').disabled = noStroke;
  $('#shpDash').disabled = noStroke;
  $('#shpStroke').disabled = noStroke;
  $('#shpStrokeOpt').disabled = noStroke;
  $('#shpSnap').checked = !!pathOpts.snapEdges;
  $('#shpPathOp').value = shapeOpts.pathOp;
  const ob = $('#shpBtns') && $('#shpBtns').querySelector('[data-path-btn="op"]');
  if (ob) { const cur = ob.querySelector('svg'); const html = PATH_OP_SVG[shapeOpts.pathOp] || PATH_OP_SVG.new; if (cur && cur.outerHTML !== html) cur.outerHTML = html; }
  if (shapeState) {
    const r = shapeRect(shapeState);
    $('#shpInfo').textContent = kind === 'line'
      ? `长度 ${Math.round(Math.hypot(shapeState.x1 - shapeState.x0, shapeState.y1 - shapeState.y0))} 像素`
      : `${Math.round(r.w)} × ${Math.round(r.h)} 像素`;
  } else if (!$('#shpInfo').textContent.startsWith('拖')) {
    $('#shpInfo').textContent = '';
  }
  $('#shpInfo').title = '在画布上拖出形状（Shift 正方 / 正圆 · Alt 从中心 · 拖动中按住空格挪位置）；单击 = 输入尺寸';
  $('#shpWhy').textContent =
      mode === 'path'  ? (workPath ? `工作路径：${workPath.subpaths.length} 条子路径` : '')
    : mode === 'pixel' ? `像素模式：用前景色 ${hexOf(fgRGB)} 画进当前图层`
    : shapeOpts.pathOp === 'new' ? ''
    : `并进选中图层：${PATH_OP_LABEL[shapeOpts.pathOp]}`;
}

export function setShapeMode(m){
  if (!SHAPE_MODE_LABEL[m]) return false;
  shapeOpts.mode = m;
  syncShapeBar(); syncPenBar(); drawGizmo();
  return true;
}




export function liveShapeOf(idx){
  if (!doc || idx < 0) return null;
  const sp = effPathSubpaths(idx);
  if (!sp || sp.length !== 1 || sp[0].closed === false) return null;
  const bb = subpathsBBoxTight(sp); if (!bb || !(bb.width > 0 && bb.height > 0)) return null;
  const r = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
  const dl = doc.layers[idx], it = dl && dl.vectorOrigin && Array.isArray(dl.vectorOrigin.keyDescriptorList) ? dl.vectorOrigin.keyDescriptorList[0] : null;
  const val = v => v && typeof v === 'object' ? +v.value : +v;
  const cands = [];
  if (it && !it.keyShapeInvalidated) {
    const t = +it.keyOriginType;
    if (t === 5) cands.push({ kind: 'ellipse', radii: [0, 0, 0, 0] });
    if (t === 1 || t === 2) { const R = it.keyOriginRRectRadii; cands.push({ kind: 'rect', radii: R ? [val(R.topLeft), val(R.topRight), val(R.bottomRight), val(R.bottomLeft)].map(v => v || 0) : [0, 0, 0, 0] }); }
  }
  const K = sp[0].knots;
  if (K.length === 4) { cands.push({ kind: 'rect', radii: [0, 0, 0, 0] }); cands.push({ kind: 'ellipse', radii: [0, 0, 0, 0] }); }
  if (K.length >= 5 && K.length <= 8) {   
    const near = (a, b) => Math.abs(a - b) < 1e-3 * Math.max(1, r.w, r.h);
    const left = K.filter(k => near(k.anchor[0], r.x)).map(k => k.anchor[1]), right = K.filter(k => near(k.anchor[0], r.x + r.w)).map(k => k.anchor[1]);
    const top = K.filter(k => near(k.anchor[1], r.y)).map(k => k.anchor[0]), bot = K.filter(k => near(k.anchor[1], r.y + r.h)).map(k => k.anchor[0]);
    if (left.length && right.length && top.length && bot.length) {
      const tl = Math.min(...left) - r.y, bl = r.y + r.h - Math.max(...left), tr = Math.min(...right) - r.y, br = r.y + r.h - Math.max(...right);
      cands.push({ kind: 'rect', radii: [tl, tr, br, bl].map(v => Math.max(0, v)) });
    }
  }
  for (const c of cands) {
    const gen = shapeSubpathsInRect(c.kind, r, { radii: c.radii });
    if (gen && pathShapeClose(gen, sp)) return { kind: c.kind, x: r.x, y: r.y, w: r.w, h: r.h, radii: c.radii, fromFile: !!it };
  }
  return liveGeomShapeOf(sp, r);
}







const liveCorner = k => Math.hypot(k.in[0] - k.anchor[0], k.in[1] - k.anchor[1]) < 1e-3 && Math.hypot(k.out[0] - k.anchor[0], k.out[1] - k.anchor[1]) < 1e-3;
function liveGeomShapeOf(sp, bb){
  const K = sp[0].knots, n = K.length;
  if (n < 3 || !K.every(liveCorner)) return null;
  const A = K.map(k => k.anchor);
  const ok = gen => gen && pathShapeClose(gen, sp);
  
  if (n === 3 && ok(shapeSubpathsInRect('triangle', bb, { triRadius: 0 }))) return { kind: 'triangle', x: bb.x, y: bb.y, w: bb.w, h: bb.h };
  
  const fitPoly = (m, idxs) => {
    const ang = i => -Math.PI / 2 + i * 2 * Math.PI / m;
    const cx = A[0][0], y0 = A[0][1];
    let bi = -1, bv = 0; for (const i of idxs) { const v = 1 + Math.sin(ang(i)); if (v > bv) { bv = v; bi = i; } }
    if (bi < 0 || bv < 0.2) return null;
    const ry = (A[bi][1] - y0) / bv, cy = y0 + ry;
    let ci = -1, cvv = 0; for (const i of idxs) { const v = Math.abs(Math.cos(ang(i))); if (v > cvv) { cvv = v; ci = i; } }
    if (ci < 0 || cvv < 0.2) return null;
    const rx = (A[ci][0] - cx) / Math.cos(ang(ci));
    if (!(rx > 0 && ry > 0)) return null;
    return { cx, cy, rx, ry, ang };
  };
  if (n <= 100) {
    const f = fitPoly(n, K.map((_, i) => i));
    if (f) {
      const r = { x: f.cx - f.rx, y: f.cy - f.ry, w: f.rx * 2, h: f.ry * 2 };
      if (ok(shapeSubpathsInRect('polygon', r, { sides: n, starRatio: 100, polyRadius: 0 }))) return { kind: 'polygon', sides: n, starRatio: 100, ...r };
    }
  }
  if (n % 2 === 0 && n >= 6 && n <= 200) {
    const f = fitPoly(n, K.map((_, i) => i).filter(i => i % 2 === 0));
    if (f) {
      let bi = -1, bv = 0; for (let i = 1; i < n; i += 2) { const v = Math.abs(Math.cos(f.ang(i))); if (v > bv) { bv = v; bi = i; } }
      const k = bi >= 0 && bv > 0.2 ? (A[bi][0] - f.cx) / (f.rx * Math.cos(f.ang(bi))) : (A[1][1] - f.cy) / (f.ry * Math.sin(f.ang(1)));
      const ratio = Math.round(k * 10000) / 100;
      const r = { x: f.cx - f.rx, y: f.cy - f.ry, w: f.rx * 2, h: f.ry * 2 };
      if (ratio > 0 && ratio < 100 && ok(shapeSubpathsInRect('polygon', r, { sides: n / 2, starRatio: ratio, polyRadius: 0, smoothIndent: false })))
        return { kind: 'polygon', sides: n / 2, starRatio: ratio, ...r };
    }
  }
  
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const tryLine = (p0, p1, o) => {
    const L = dist(p0, p1); if (!(L >= 1) || !(o.weight > 0)) return null;
    const gen = lineSubpaths(p0[0], p0[1], p1[0], p1[1], o);
    return ok(gen) ? { kind: 'line', x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], weight: o.weight, arrowStart: !!o.arrowStart, arrowEnd: !!o.arrowEnd,
      arrowW: o.arrowW, arrowL: o.arrowL, arrowC: o.arrowC, x: bb.x, y: bb.y, w: bb.w, h: bb.h } : null;
  };
  const along = (p0, p1, q) => { const L = dist(p0, p1); return ((q[0] - p0[0]) * (p1[0] - p0[0]) + (q[1] - p0[1]) * (p1[1] - p0[1])) / L; };
  const arrowParams = (p0, p1, wgt, w1, w2, join, dir) => {
    const aw = dist(w1, w2) / 2, base = along(p0, p1, mid(w1, w2)), tip = dir > 0 ? dist(p0, p1) : 0;
    const al = Math.abs(tip - base), t = wgt / 2, f = aw > 1e-9 ? (aw - t) / aw : 0;
    const cc = f > 1e-6 && al > 1e-6 ? (along(p0, p1, join) - base) / (dir * f * al) : 0;
    const tidy = v => Math.abs(v - Math.round(v)) < 0.06 ? Math.round(v) : Math.round(v * 100) / 100;   
    return { arrowW: tidy(aw * 2 / wgt * 100), arrowL: tidy(al / wgt * 100), arrowC: tidy(cc * 100) };
  };
  const base0 = { arrowW: 500, arrowL: 1000, arrowC: 0 };
  if (n === 4) {
    const p0 = mid(A[3], A[0]), p1 = mid(A[1], A[2]);
    return tryLine(p0, p1, { weight: dist(A[1], A[2]), arrowStart: false, arrowEnd: false, ...base0 });
  }
  if (n === 7) {
    { const p1 = A[3], p0 = mid(A[0], A[6]), w = dist(A[0], A[6]);
      const r1 = tryLine(p0, p1, { weight: w, arrowStart: false, arrowEnd: true, ...arrowParams(p0, p1, w, A[2], A[4], A[1], 1) }); if (r1) return r1; }
    { const p0 = A[5], p1 = mid(A[1], A[2]), w = dist(A[1], A[2]);
      const r2 = tryLine(p0, p1, { weight: w, arrowStart: true, arrowEnd: false, ...arrowParams(p0, p1, w, A[4], A[6], A[3], -1) }); if (r2) return r2; }
  }
  if (n === 10) {
    const p0 = A[8], p1 = A[3], w = dist(A[0], A[6]);
    return tryLine(p0, p1, { weight: w, arrowStart: true, arrowEnd: true, ...arrowParams(p0, p1, w, A[2], A[4], A[1], 1) });
  }
  return null;
}

function liveShapeSubpaths(n){
  const r = { x: n.x, y: n.y, w: n.w, h: n.h };
  if (n.kind === 'line') return lineSubpaths(n.x0, n.y0, n.x1, n.y1, n);
  if (n.kind === 'triangle') return shapeSubpathsInRect('triangle', r, { triRadius: 0 });
  if (n.kind === 'polygon') return shapeSubpathsInRect('polygon', r, { sides: n.sides, starRatio: n.starRatio, polyRadius: 0, smoothIndent: false });
  return shapeSubpathsInRect(n.kind, r, { radii: n.radii });
}

function pathShapeClose(a, b){
  if (a.length !== b.length) return false;
  for (let s = 0; s < a.length; s++) {
    const A = a[s].knots, B = b[s].knots;
    if (A.length !== B.length) return false;
    const n = A.length;
    let ok = false;
    for (let off = 0; off < n && !ok; off++) {
      ok = true;
      for (let k = 0; k < n && ok; k++) {
        const p = A[k], q = B[(k + off) % n];
        for (const f of ['anchor', 'in', 'out']) { const u = p[f] || p.anchor, v = q[f] || q.anchor; if (Math.abs(u[0] - v[0]) > 0.05 || Math.abs(u[1] - v[1]) > 0.05) { ok = false; break; } }
      }
    }
    if (!ok) return false;
  }
  return true;
}

export async function applyLiveShape(idx, patch){
  const ls = liveShapeOf(idx);
  if (!ls) { $('#notice').textContent = '这不是实时形状（矩形 / 椭圆 / 三角形 / 多边形 / 直线），或者它的路径已经被直接改过形。'; return false; }
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, '修改实时形状属性')) return false;
  const n = { ...ls, ...patch };
  n.w = Math.max(1, +n.w || 1); n.h = Math.max(1, +n.h || 1);
  if (patch.radii) n.radii = patch.radii.map(v => Math.max(0, +v || 0));
  if (n.kind === 'polygon') { n.sides = Math.max(3, Math.min(100, Math.round(+n.sides || 5))); n.starRatio = Math.max(1, Math.min(100, +n.starRatio || 100)); }
  if (n.kind === 'line') { n.weight = Math.max(0.1, +n.weight || 1); }
  
  const r = { x: n.x, y: n.y, w: n.w, h: n.h };
  const gen = liveShapeSubpaths(n);
  if (!gen) { $('#notice').textContent = '这组参数画不出形状（直线太短？）'; return false; }
  const subpaths = gen.map(s => ({ ...s, operation: 'combine' }));
  const origin = shapeOriginFor(n.kind, r, n.radii);
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const res = applyEdits(base, [{ op: 'setVectorMaskPath', index: idx, subpaths, units: 'pixel', keepOrigin: true },
                                  { op: 'setShapeOrigin', index: idx, origin }]);
    await initDocument(res.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(idx, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '修改实时形状属性');
    syncShapeBar(); drawGizmo();
    return true;
  } catch (e) {
    $('#err').textContent = '改实时形状属性没能完成：' + humanEditError(e && e.message || e);
    renderProps();
    return false;
  }
}

let liveRadiiLinked = true;
export function renderLiveShapeProps(idx, ui){
  const ls = liveShapeOf(idx);
  if (!ls) return;
  const { row, mk } = ui;
  const numIn = (val, attr, title, min, max, step, onSet) => {
    const i = mk('input', { type: 'number', min, max, step, value: +(+val).toFixed(2), title });
    i.dataset.attr = attr;
    i.style.cssText = 'flex:1;min-width:0;width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
    i.onchange = () => { const v = +i.value; if (Number.isFinite(v)) onSet(Math.max(min, Math.min(max, v))); };
    return i;
  };
  
  if (ls.kind === 'polygon') {
    row('边数', numIn(ls.sides, 'live-sides', '多边形的边数（3–100）', 3, 100, 1, v => applyLiveShape(idx, { sides: Math.round(v) }))).dataset.propSection = 'appearance';
    row('星形比例', numIn(ls.starRatio, 'live-star', '星形比例（%）：100 = 普通多边形，越小尖角越深', 1, 100, 1, v => applyLiveShape(idx, { starRatio: v })),
      mk('span', { textContent: '%', style: 'flex:none;color:var(--muted)' })).dataset.propSection = 'appearance';
    return;
  }
  if (ls.kind === 'line') {
    row('粗细', numIn(ls.weight, 'live-weight', '直线粗细（像素）', 0.1, 1000, 1, v => applyLiveShape(idx, { weight: v })),
      mk('span', { textContent: '像素', style: 'flex:none;color:var(--muted)' })).dataset.propSection = 'appearance';
    const cb = (label, key, attr) => { const l = mk('label', { style: 'display:flex;align-items:center;gap:4px;flex:1' }); const c = mk('input', { type: 'checkbox' });
      c.checked = !!ls[key]; c.dataset.attr = attr; c.onchange = () => applyLiveShape(idx, { [key]: c.checked }); l.append(c, label); return l; };
    row('箭头', cb('起点', 'arrowStart', 'live-arrow-start'), cb('终点', 'arrowEnd', 'live-arrow-end')).dataset.propSection = 'appearance';
    if (ls.arrowStart || ls.arrowEnd) {
      row('宽度 / 长度', numIn(ls.arrowW, 'live-arrow-w', '箭头宽度（粗细的百分比）', 10, 5000, 10, v => applyLiveShape(idx, { arrowW: v })),
        numIn(ls.arrowL, 'live-arrow-l', '箭头长度（粗细的百分比）', 10, 5000, 10, v => applyLiveShape(idx, { arrowL: v }))).dataset.propSection = 'appearance';
      row('凹度', numIn(ls.arrowC, 'live-arrow-c', '箭头凹度（-50…50%）', -50, 50, 1, v => applyLiveShape(idx, { arrowC: v })),
        mk('span', { textContent: '%', style: 'flex:none;color:var(--muted)' })).dataset.propSection = 'appearance';
    }
    return;
  }
  if (ls.kind !== 'rect') return;
  const ins = ls.radii.map((v, k) => {
    const i = mk('input', { type: 'number', min: 0, step: 1, value: +v.toFixed(2), title: ['左上角半径', '右上角半径', '右下角半径', '左下角半径'][k] });
    i.dataset.attr = 'live-radius-' + k;
    i.style.cssText = 'flex:1;min-width:0;width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
    i.onchange = () => {
      const v2 = Math.max(0, +i.value || 0);
      const radii = liveRadiiLinked ? [v2, v2, v2, v2] : ls.radii.map((x, j) => j === k ? v2 : x);
      applyLiveShape(idx, { radii });
    };
    return i;
  });
  const link = mk('button', { title: '将角半径值链接到一起', className: liveRadiiLinked ? 'on' : '' });
  link.style.cssText = 'width:26px;height:22px;padding:0;justify-content:center;flex:none';
  link.append(icon('link', 12)); link.onclick = () => { liveRadiiLinked = !liveRadiiLinked; link.classList.toggle('on', liveRadiiLinked); };
  row('圆角', ins[0], ins[1], link).dataset.propSection = 'appearance';
  row('', ins[3], ins[2]).dataset.propSection = 'appearance';
}

export let liveRadDrag = null;
export function liveRadiusWidgets(){
  if (li || !doc || !(docTool === 'shape' || docTool === 'pathSelect' || docTool === 'move')) return null;
  const idx = barShapeIdx(); if (idx < 0) return null;
  const ls = liveShapeOf(idx); if (!ls || ls.kind !== 'rect') return null;
  const off = dispThr(12), max = Math.min(ls.w, ls.h) / 2;
  const C = [[ls.x, ls.y, 1, 1], [ls.x + ls.w, ls.y, -1, 1], [ls.x + ls.w, ls.y + ls.h, -1, -1], [ls.x, ls.y + ls.h, 1, -1]];
  return { idx, ls, pts: C.map(([cx, cy, sx, sy], k) => { const d = Math.min(max, Math.max(ls.radii[k], Number.isFinite(off) ? off : 8));
    return { k, x: cx + sx * d, y: cy + sy * d, cx, cy, sx, sy }; }) };
}
function liveRadiusHit(pt){
  const W = liveRadiusWidgets(); if (!W) return null;
  const tol = pathHitTol(6);
  const p = W.pts.find(q => Math.hypot(q.x - pt.x, q.y - pt.y) <= tol);
  return p ? { ...W, p } : null;
}
export function beginLiveRadius(ev, pt){
  const h = liveRadiusHit(pt); if (!h) return false;
  liveRadDrag = { idx: h.idx, ls: h.ls, k: h.p.k, one: !!(ev && ev.altKey), radii: h.ls.radii.slice(), moved: false };
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  return true;
}
export function moveLiveRadius(ev, pt){
  const D = liveRadDrag; if (!D) return;
  const ls = D.ls, C = [[ls.x, ls.y, 1, 1], [ls.x + ls.w, ls.y, -1, 1], [ls.x + ls.w, ls.y + ls.h, -1, -1], [ls.x, ls.y + ls.h, 1, -1]][D.k];
  const v = Math.max(0, Math.min(Math.min(ls.w, ls.h) / 2, ((pt.x - C[0]) * C[2] + (pt.y - C[1]) * C[3]) / 2));
  D.radii = D.one ? ls.radii.map((x, j) => j === D.k ? v : x) : [v, v, v, v];
  D.moved = true;
  $('#shpInfo').textContent = `圆角半径 ${v.toFixed(1)} 像素`;
  drawGizmo();
}
export function endLiveRadius(){
  const D = liveRadDrag; liveRadDrag = null;
  if (!D || !D.moved) { drawGizmo(); return; }
  applyLiveShape(D.idx, { radii: D.radii });
}
export function drawLiveRadiusGizmo(ctx){
  const W = liveRadiusWidgets(); if (!W) return;
  ctx.save();
  if (liveRadDrag) {           
    const subs = shapeSubpathsInRect('rect', { x: W.ls.x, y: W.ls.y, w: W.ls.w, h: W.ls.h }, { radii: liveRadDrag.radii });
    ctx.beginPath(); tracePath(ctx, subs); ctx.lineWidth = dispPx(1); ctx.strokeStyle = pathLook.color || '#0096ff'; ctx.stroke();
  }
  const s = dispThr(3.5);
  for (const p of W.pts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = pathLook.color || '#0096ff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.45, 0, Math.PI * 2); ctx.fillStyle = pathLook.color || '#0096ff'; ctx.fill();
  }
  ctx.restore();
}
