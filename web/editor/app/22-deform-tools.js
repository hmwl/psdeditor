




import './21-load-document.js';   
import { puppetSelect, puppetPinMode, puppetModeFromRigidity, puppetRigidityFromMode } from '../puppet-interaction.js';
import { choiceDialog } from '../dialog.js';
import { proWarpNotice } from '../pro.js';
import { shell } from '../shell.js';
import { stopRasterWarpToolbar } from '../transform-warp-raster.js';
import {
  $, cloneDeform, createPerspectiveDeform, createPuppetDeform, deformEquals, deformStackBounds, engineOK,
  freshLayerInfo,
} from './01-boot.js';
import {
  cur, deformIdx, deformMeshMeta, doc, dragState, history, img, layerDeletes, layerTree, li, pushHistory,
  restore, set_cur, set_deformIdx, set_deformMeshMeta, set_dragState, set_hoverPt, set_img, set_li,
  set_replFile, set_replImg, set_selPt, set_soImgURL, snapshot, soEdits, soImgURL, sos,
} from './02-doc-state.js';
import {
  docHistory, histCap, restoreDocSnapshot, set_soEnterSnap, soEnterSnap, structuralApply, structuralBegin,
  structuralDone, updateUndoButtons,
} from './03-history.js';
import { RASTER_KIND, rasterKindOf } from './05-layer-lock-guides.js';
import { commit } from './06-view-zoom-move.js';
import { restoreFreeTransformHistory } from './19-free-transform.js';
import { bakeCurrentSO } from './20-snap-smart-object.js';
import { buildTabs, selectSO } from './21-load-document.js';
import { renderLayerPanel, selLayer } from './23-layers-panel.js';
import { renderProps } from './24-layer-ops-queue.js';
import {
  convertToSmartObjectUI, set_warpSession, set_warpTempSO, settleWarpTempSO, warpSession, warpTempSO,
} from './26-layer-create.js';
import { renderPreviewOnly, renderWarpNow } from './30-render.js';
import { syncToolOptions } from './32-cursors-select-options.js';
import { dispThr, drawGizmo, filterSoIndexOf } from './46-smart-filter-panel.js';










export const DEFORM_LABEL = { perspectiveWarp: '透视变形', puppetWarp: '操控变形' };

export let deformTool = null;      
export let deformEnter = null;     
export let deformSel = null;       
export let deformPins = [];
export let puppetRing = null;
export function set_puppetRing(v) { puppetRing = v; }
export function set_deformSel(v) { deformPins = v ? [{ ...v }] : []; puppetRing = null; return (deformSel = v); }
export function selectDeformPin(ref, shift = false, preserve = false) {
  deformPins = puppetSelect(deformPins, ref, shift, preserve);
  deformSel = deformPins.some(p => p.j === ref.j && p.i === ref.i) ? { ...ref } : deformPins.at(-1) || null;
  return deformSel;
}
export function selectedPins() {
  if (!li || li.deform?.kind !== 'puppetWarp') return [];
  return deformPins.map(ref => ({ ...ref, pin: li.deform.shapes[ref.j]?.pins[ref.i] })).filter(p => p.pin);
}   
export let pquadDrag = null;       
export function set_pquadDrag(v) { return (pquadDrag = v); }   
export let pquadMove = null;       
export function set_pquadMove(v) { return (pquadMove = v); }   












export function pquadSnapRect(raw){
  const d = li && li.deform;
  const x0r = Math.min(raw.x0, raw.x1), x1r = Math.max(raw.x0, raw.x1);
  const y0r = Math.min(raw.y0, raw.y1), y1r = Math.max(raw.y0, raw.y1);
  const rect = { x0: x0r, y0: y0r, x1: x1r, y1: y1r };
  if (!d || d.kind !== 'perspectiveWarp' || !d.vertices.length) return { rect, hits: [] };
  



  const R = Math.max(dispThr(28), 18);
  const pull = (v, coords) => {
    let best = v, bd = R;
    for (const c of coords) { const dd = Math.abs(c - v); if (dd < bd) { bd = dd; best = c; } }
    return best;
  };
  const xs = d.vertices.map(p => p.x), ys = d.vertices.map(p => p.y);
  rect.x0 = pull(rect.x0, xs); rect.x1 = pull(rect.x1, xs);
  rect.y0 = pull(rect.y0, ys); rect.y1 = pull(rect.y1, ys);
  if (rect.x1 - rect.x0 < 1 || rect.y1 - rect.y0 < 1) return { rect: { x0: x0r, y0: y0r, x1: x1r, y1: y1r }, hits: [] };
  
  const corners = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]];
  const hits = [];
  d.vertices.forEach((v, i) => {
    if (corners.some(c => Math.abs(v.x - c[0]) < 1e-6 && Math.abs(v.y - c[1]) < 1e-6)) hits.push(i);
  });
  return { rect, hits };
}


export const deformOpts = { mode: 'similarity', density: 'normal', expandPx: 2, showMesh: true, pMode: 'warp' };
const DENSITY_K = { less: 2, normal: 1, more: 0.62 };


export function applyDeformClass(){
  const on = !!(li && li.deform);
  const tool = !!deformTool && on;
  $('.optbar').classList.toggle('deform', on);
  document.querySelector('.app').classList.toggle('deform', on);
  $('.optbar').classList.toggle('deformtool', tool);
  document.querySelector('.app').classList.toggle('deformtool', tool);
  const g = $('#grpDeform'); if (g) g.hidden = !tool;
  if (tool) syncDeformBar();
}


export function selectedPin(){
  if (!li || !li.deform || li.deform.kind !== 'puppetWarp' || !deformSel) return null;
  const sh = li.deform.shapes[deformSel.j];
  const pin = sh && sh.pins[deformSel.i];
  return pin ? { j: deformSel.j, i: deformSel.i, pin } : null;
}


export function syncDeformBar(){
  const g = $('#grpDeform'); if (!g || !li || !li.deform || !deformTool) return;
  const d = li.deform, persp = d.kind === 'perspectiveWarp';
  const n = (li.deforms || []).length;
  $('#dfTitle').textContent = DEFORM_LABEL[d.kind]
    + (d.at == null ? '（新建）' : '')
    + (n > 1 ? `　第 ${deformIdx + 1}/${n} 条` : '');
  $('#dfPersp').hidden = !persp;
  $('#dfPuppet').hidden = persp;
  $('#dfOk').disabled = persp && !d.quadIdx.length;
  if (persp) {
    $('#dfLayout').classList.toggle('on', deformOpts.pMode === 'layout');
    $('#dfWarpMode').classList.toggle('on', deformOpts.pMode === 'warp');
    $('#dfWarpMode').disabled = !d.quadIdx.length;
    const grid = d.grid;
    $('#dfGridWrap').hidden = deformOpts.pMode !== 'layout' || !grid;
    $('#dfCols').disabled = $('#dfRows').disabled = !grid;
    $('#dfCols').value = grid ? grid.cols : '';
    $('#dfRows').value = grid ? grid.rows : '';
    $('#dfGridWhy').textContent = grid ? ''
      : `（${d.quadIdx.length} 个面，不是规则行列 —— 手工加过面或来自 PSD，直接在画布上拖着改）`;
    for (const id of ['#dfStrV', '#dfStrH', '#dfStrB']) $(id).disabled = true;
    $('#dfStrWhy').textContent = '自动拉直：还没实现（要先从画面里认出近似垂直/水平的线）';
  } else {
    const n = d.shapes.reduce((a, sh) => a + sh.pins.length, 0);
    const sel = selectedPin();
    $('#dfMode').value = deformOpts.mode;
    $('#dfDensity').value = deformOpts.density;
    $('#dfDensity').disabled = $('#dfExpand').disabled = !(deformMeshMeta && deformMeshMeta.alpha);
    $('#dfExpand').value = String(deformOpts.expandPx);
    $('#dfShowMesh').checked = deformOpts.showMesh;
    $('#dfRemovePins').disabled = !n;
    $('#dfDepthUp').disabled = $('#dfDepthDown').disabled = !sel;
    $('#dfRotMode').disabled = !sel;
    $('#dfRotMode').value = puppetPinMode(sel?.pin);
    $('#dfRotAngle').disabled = !sel || $('#dfRotMode').value !== 'fixed';
    $('#dfRotAngle').value = String(sel ? Math.round(sel.pin.rot || 0) : 0);
    $('#dfPinInfo').textContent = sel
      ? `已选 ${selectedPins().length} 枚 · 图钉 ${sel.i + 1}/${d.shapes[sel.j].pins.length}（第 ${sel.j + 1} 片）· 深度 ${(+sel.pin.depth || 0).toFixed(2)}`
      : (n ? `共 ${n} 枚图钉 · 点中一枚才能改它的深度 / 旋转` : '在网格上点击落下第一枚图钉');
  }
}


export function setPerspectiveMode(mode){
  if (deformTool !== 'perspectiveWarp' || !li || !li.deform || li.deform.kind !== 'perspectiveWarp') return false;
  if (mode !== 'layout' && mode !== 'warp') return false;
  if (pquadDrag || pquadMove || dragState) { shell.status('请先结束当前拖动'); return false; }
  if (mode === 'warp' && !li.deform.quadIdx.length) { shell.status('先在版面模式里拖出一个面'); return false; }
  deformOpts.pMode = mode; set_selPt(-1); set_hoverPt(-1); syncDeformBar(); renderWarpNow(); drawGizmo();
  shell.status(mode === 'layout'
    ? '版面：拖出面、调整角点或移动面；W / Enter 进入变形'
    : '变形：拖顶点做透视；L 返回版面，Enter 提交，Esc 取消');
  return true;
}


export function deformTargetSO(){
  if (li && cur >= 0) return cur;
  if (selLayer < 0 || !layerTree) return -1;
  return filterSoIndexOf(selLayer);
}

export function deformKindsOf(i){
  if (i < 0) return [];
  if (li && cur === i && li.deforms) return li.deforms.map(d => d.kind);
  const e = soEdits[i];
  if (e && e.deforms) return e.deforms.map(x => x.deform.kind);
  if (e && e.deform) return [e.deform.kind];
  const inf = sos[i] && sos[i].info && sos[i].info.layerInfo;
  if (inf && Array.isArray(inf.deforms) && inf.deforms.length) return inf.deforms.map(d => d.kind);
  return inf && inf.deform ? [inf.deform.kind] : [];
}

export function deformKindOf(i){ return deformKindsOf(i)[0] || null; }
export function deformWhy(kind){
  if (!doc) return '先打开一个 PSD';                 
  if (warpSession) return '先确定或取消当前的自由变换 / 变形';
  if (deformTool && deformTool !== kind) return `正在${DEFORM_LABEL[deformTool]}里 —— 先按 ✓ 确定或 ✕ 取消`;
  if (selLayer < 0 && !(li && cur >= 0)) return '先在图层面板里选中一个图层';
  if (!engineOK) return '渲染引擎未加载，变形编辑暂不可用';
  const i = deformTargetSO();
  if (i < 0) {
    

    const L = layerTree && layerTree.flat && layerTree.flat[selLayer];
    if (!L) return '先在图层面板里选中一个图层';
    if (L.isGroup || L.groupType != null) return '组不能直接变形：先选组里的某一层，或把这个组合并成一层';
    if (layerDeletes.has(selLayer)) return '这一层已经标记删除了';
    return '';
  }
  return '';                                        
}






async function ensureDeformSO(kind){
  const have = deformTargetSO();
  if (have >= 0) {
    if (cur !== have || !li) { await selectSO(have); if (cur !== have || !li) return -1; }
    return have;
  }
  const idx = selLayer;
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!L || L.groupType != null) { shell.status('组不能直接变形'); return -1; }
  const rk = rasterKindOf(idx);
  const what = rk && rk !== 'smart' ? RASTER_KIND[rk] : null;
  const name = DEFORM_LABEL[kind] || '变形';
  


  const pick = what ? await choiceDialog(
    what
      ? `此${what}图层必须栅格化或转换为智能对象才能继续。\n`
        + `转换为智能对象：${name}写成智能滤镜，导出后在 Photoshop 里还能继续调（${what}内容会先栅格化进这个智能对象）。\n`
        + `栅格化：与 PS 对普通图层的做法一样，退出时把结果并回像素，之后不可再编辑。`
      : `这一层不是智能对象。${name}在 PSD 里是挂在智能对象上的智能滤镜。\n`
        + `转换为智能对象：变形写成智能滤镜，导出后在 Photoshop 里还能继续调。\n`
        + `直接变形：与 PS 对普通图层的做法一样，退出时把结果并回像素，之后不可再编辑。`,
    { title: what ? `栅格化${what}图层` : name,
      okText: '转换为智能对象', extraText: what ? '栅格化' : '直接变形', cancelText: '取消' }) : 'extra';
  if (pick !== 'ok' && pick !== 'extra') return -1;
  if (!await convertToSmartObjectUI(idx, { quiet: true })) return -1;   
  const k = sos.findIndex(so => matchLayer(so) === idx);
  if (k < 0) { shell.status('转换为智能对象之后找不到这一层，变形没能开始'); return -1; }
  if (pick === 'extra') set_warpTempSO({ layerIndex: idx });     
  await selectSO(k);
  if (cur !== k || !li) return -1;
  shell.status(pick === 'extra'
    ? '已临时转成智能对象做变形：✓ 确定后会并回普通图层的像素（与 PS 对普通图层一样）'
    : '已转换为智能对象：变形会写成智能滤镜，导出后在 PS 里还能继续调');
  return k;
}


function solidAlphaImage(n = 64){
  const data = new Uint8ClampedArray(n * n * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width: n, height: n, solid: true };
}

function sourceAlphaImage(image, cap = 512){
  if (!image) return null;
  const w0 = image.naturalWidth || image.width, h0 = image.naturalHeight || image.height;
  if (!w0 || !h0) return null;
  const k = Math.min(1, cap / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.clearRect(0, 0, w, h); cx.drawImage(image, 0, 0, w, h);
  const im = cx.getImageData(0, 0, w, h);
  return { data: im.data, width: w, height: h };
}


export function rebuildPuppetMesh(){
  const meta = deformMeshMeta;
  if (!li || !li.deform || li.deform.kind !== 'puppetWarp' || !meta || !meta.alpha) return false;
  const cell = Math.max(3, Math.round(meta.baseCell * (DENSITY_K[deformOpts.density] || 1)));
  const expand = Math.max(0, Math.min(8, Math.round(deformOpts.expandPx / cell)));
  setCurrentDeform(createPuppetDeform({ image: meta.alpha, quad: meta.quad || li.placementQuad, cell, expand }));
  meta.cell = cell; meta.expand = expand;
  set_deformSel(null);
  return true;
}



export function setCurrentDeform(next){
  if (!li || !next) return null;
  const cur0 = li.deform;
  if (cur0) { next.at = cur0.at; next.enabled = cur0.enabled; next.name = cur0.name; }
  if (li.deforms && deformIdx >= 0) li.deforms[deformIdx] = next;
  else { li.deforms = [next]; set_deformIdx(0); }
  li.deform = next;
  if (next.kind === 'puppetWarp') for (const sh of next.shapes) sh.meshRigidity ??= puppetRigidityFromMode(deformOpts.mode);
  return next;
}


export function setDeformIdx(i){
  if (!li || !li.deforms || !li.deforms.length) { set_deformIdx(-1); li.deform = null; return -1; }
  set_deformIdx(Math.max(0, Math.min(li.deforms.length - 1, i | 0)));
  li.deform = li.deforms[deformIdx];
  if (li.deform.kind === 'puppetWarp') {
    const mode = puppetModeFromRigidity(li.deform.shapes[0]?.meshRigidity);
    if (mode) deformOpts.mode = mode;
  }
  return deformIdx;
}


export let deformPending = Promise.resolve();          
let deformStarting = false, deformFinishPending = null;
export function deformRun(kind, at){
  return proWarpNotice(kind);
}


function deformBaseQuad(){
  const stack = (li.deforms || []).filter(d => d.enabled !== false);
  if (!stack.length) return li.placementQuad;
  const b = deformStackBounds(stack);
  if (!b || !(b.right > b.left && b.bottom > b.top)) return li.placementQuad;
  return [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];
}

function rollbackDeformEntry(transaction, message){
  set_warpTempSO(null); set_soEnterSnap(null);
  structuralApply(transaction);
  if (message) { $('#err').textContent = message; shell.status(message); }
  return false;
}

async function deformCommand(kind, at){
  
  if (deformTool) return deformTool === kind && (at == null || li?.deform?.at === at);
  const why = deformWhy(kind);
  if (why) { shell.status(why); return false; }
  const transaction = structuralBegin();
  transaction.editor = li ? snapshot() : null;
  transaction.options = { ...deformOpts };
  transaction.deformKind = kind;
  const i = await ensureDeformSO(kind);
  if (i < 0 || !li) {
    return rollbackDeformEntry(transaction, $('#err').textContent);
  }
  if (!li.deforms) li.deforms = [];
  
  let idx = at != null ? li.deforms.findIndex(d => d.at === at) : li.deforms.findIndex(d => d.kind === kind);
  const had = idx >= 0;
  let meta = null;
  if (!had) {
    const quad = deformBaseQuad();
    if (!quad || quad.length !== 4) return rollbackDeformEntry(transaction, '这个智能对象读不到放置四点（Trnf），没法铺变形网格');
    let d;
    try {
      if (kind === 'perspectiveWarp') {
        d = createPerspectiveDeform(quad, 1, 1);
        
        d.vertices = []; d.warped = []; d.quadIdx = []; d.quads = [];
        delete d.grid;
      }
      else {
        
        const alpha = sourceAlphaImage(img) || solidAlphaImage();
        meta = { quad, alpha, solid: !!alpha.solid };
        meta.baseCell = Math.max(4, Math.round(Math.max(alpha.width, alpha.height) / 24));
        meta.cell = Math.max(3, Math.round(meta.baseCell * (DENSITY_K[deformOpts.density] || 1)));
        meta.expand = Math.max(0, Math.min(8, Math.round(deformOpts.expandPx / meta.cell)));
        d = createPuppetDeform({ image: alpha, quad, cell: meta.cell, expand: meta.expand });
        for (const sh of d.shapes) sh.meshRigidity = puppetRigidityFromMode(deformOpts.mode);
      }
    } catch (e) { return rollbackDeformEntry(transaction, '新建' + DEFORM_LABEL[kind] + '失败：' + e.message); }
    pushHistory();
    d.enabled = true;                               
    li.deforms.push(d); idx = li.deforms.length - 1;
    li.points = null; li.xn = null; li.yn = null;
  }
  setDeformIdx(idx);
  
  deformTool = li.deform.kind;
  




  deformOpts.pMode = (li.deform.kind === 'perspectiveWarp' && !had) ? 'layout' : 'warp';
  set_deformSel(null); set_selPt(-1); set_hoverPt(-1);
  set_deformMeshMeta(meta);
  deformEnter = { k: i, idx, deform: cloneDeform(li.deform), wasNew: !had,
                  stack: li.deforms.map(cloneDeform),
                  edits: soEdits[i] ? JSON.stringify(soEdits[i]) : null, transaction };
  const cachedLayer = doc.layers[matchLayer(sos[i])];
  if (had && cachedLayer?.rgba) deformEnter.raster = {
    data: cachedLayer.rgba, width: cachedLayer.width, height: cachedLayer.height, bounds: { ...cachedLayer.bounds },
  };
  applyDeformClass(); syncToolOptions();
  if (!had) commit(); else { renderWarpNow(); drawGizmo(); }
  renderProps(); renderLayerPanel();
  const n = li.deforms.length;
  const where = n > 1 ? `（这一层第 ${idx + 1}/${n} 条变形）` : '';
  shell.status(had
    ? `${DEFORM_LABEL[deformTool]}${where}：${deformTool === 'puppetWarp' ? '点击落钉，Shift 点钉多选并同步拖动；Option/Alt 在钉旁旋转，Delete 删除所选' : '拖顶点调形'}；✓ 确定 / ✕ 取消`
    : deformTool === 'perspectiveWarp'
      ? `已新建透视变形${where}，在「版面」模式里：空白处拖出新的面（拖到已有面旁边会自动吸附、共用那条边的两个顶点），Alt 点面删掉它；摆好之后点「变形」拖顶点做透视；✓ 确定 / ✕ 取消`
      : `已新建操控变形${where}，${li.deform.shapes.length} 片网格`
        + ((meta && meta.solid) ? '（读不到源图像素，按整块矩形铺的）'
           : li.deform.fromAlpha === false ? '（这一层没有不透明像素，按整块矩形铺的）' : '（贴着不透明像素铺）')
        + `${n > 1 ? '，铺在前面几条变形的结果上' : ''}：在网格上点击落图钉；✓ 确定 / ✕ 取消`);
  return true;
}


export function deformFinish(ok){
  if (deformFinishPending) return deformFinishPending;
  deformFinishPending = finishDeform(ok).finally(() => { deformFinishPending = null; });
  return deformFinishPending;
}
async function finishDeform(ok){
  if (!deformTool) return false;
  if (ok && li?.deform?.kind === 'perspectiveWarp' && !li.deform.quadIdx.length) {
    shell.status('先在版面模式拖出一个透视面');
    return false;
  }
  const transaction = deformEnter && deformEnter.transaction;
  const unchanged = ok && deformEnter && !deformEnter.wasNew && li && deformEquals(li.deform, deformEnter.deform);
  if ((!ok || unchanged) && transaction) {
    
    if (soImgURL && soImgURL !== transaction.state.soImgURL) URL.revokeObjectURL(soImgURL);
    deformTool = null; deformEnter = null; set_deformSel(null);
    set_pquadDrag(null); set_pquadMove(null); set_dragState(null);
    set_warpTempSO(null); set_soEnterSnap(null); set_deformMeshMeta(null);
    structuralApply(transaction);
    if (transaction.editor && li) { restore(transaction.editor); restoreDocSnapshot(transaction.snap); }
    Object.assign(deformOpts, transaction.options);
    set_selPt(-1); set_hoverPt(-1);
    applyDeformClass(); syncToolOptions(); drawGizmo(); updateUndoButtons();
    shell.status(ok ? '变形未作更改' : '已取消这次变形');
    return true;
  }
  if (ok) commit();
  const k = deformEnter ? deformEnter.k : cur;
  if (!ok && deformEnter && li && cur === k) {
    if (deformEnter.wasNew) {                       
      li.deforms.splice(deformEnter.idx, 1);
      if (!li.deforms.length) { const fresh = freshLayerInfo(sos[k]); li.deforms = null; li.deform = null;
        li.points = fresh.points; li.xn = fresh.xn; li.yn = fresh.yn; li.sliceX = fresh.sliceX || []; li.sliceY = fresh.sliceY || []; }
      else setDeformIdx(Math.min(deformEnter.idx, li.deforms.length - 1));
    } else {                                        
      li.deforms[deformEnter.idx] = cloneDeform(deformEnter.deform);
      setDeformIdx(deformEnter.idx);
    }
    if (deformEnter.edits) soEdits[k] = JSON.parse(deformEnter.edits); else delete soEdits[k];
  }
  deformTool = null; deformEnter = null; set_deformSel(null); set_deformMeshMeta(null); set_selPt(-1); set_hoverPt(-1);
  applyDeformClass(); syncToolOptions();
  renderWarpNow(); renderProps(); renderLayerPanel(); updateUndoButtons();
  await exitSO();                                   
  if (ok && transaction) {
    
    docHistory.undo.length = 0;
    docHistory.undo.push(...transaction.state.docHist.undo);
    structuralDone(transaction, DEFORM_LABEL[transaction.deformKind] || '变形');
  }
  shell.status(ok ? '变形已提交（导出时写回智能滤镜，PS 打开可继续编辑）' : '已取消这次变形');
  return true;
}


export function deformDrop(){
  if (!li || !li.deforms || !li.deform || li.deform.at != null) return false;
  pushHistory();
  li.deforms.splice(deformIdx, 1);
  if (!li.deforms.length) {
    const fresh = freshLayerInfo(sos[cur]);
    li.deforms = null; li.deform = null; set_deformIdx(-1);
    li.points = fresh.points; li.xn = fresh.xn; li.yn = fresh.yn; li.sliceX = fresh.sliceX || []; li.sliceY = fresh.sliceY || [];
    delete soEdits[cur];
  } else { setDeformIdx(Math.min(deformIdx, li.deforms.length - 1)); commit(); }
  deformTool = null; deformEnter = null; set_deformSel(null); set_deformMeshMeta(null); set_selPt(-1); set_hoverPt(-1);
  applyDeformClass(); syncToolOptions();
  renderWarpNow(); renderProps(); renderLayerPanel(); drawGizmo(); updateUndoButtons();
  shell.status('已移除新建的变形滤镜');
  return true;
}



export function settleSoEnter(){
  if (soEnterSnap && li && soEnterSnap.k === cur) {
    const nowEdits = soEdits[cur] ? JSON.stringify(soEdits[cur]) : null;
    if (nowEdits !== soEnterSnap.edits) {
      docHistory.undo.push(soEnterSnap.snap);
      if (docHistory.undo.length > histCap()) docHistory.undo.shift();
      docHistory.redo.length = 0;
    }
    delete history[cur];
  }
  set_soEnterSnap(null);
}



export async function suspendWarpForFreeTransform(){
  if (!warpSession || !li?.points || deformTool) return false;
  commit(); await bakeCurrentSO();
  set_soEnterSnap(null); set_dragState(null); set_selPt(-1); set_hoverPt(-1);
  set_cur(-1); set_li(null); stopRasterWarpToolbar();
  buildTabs(); renderLayerPanel(); renderPreviewOnly(); syncToolOptions(); updateUndoButtons();
  return true;
}
export async function exitSO(ok = true){
  const session = !deformTool && warpSession;
  if (session && (!ok || (!session.changedBeforeWarp && li && session.baseline === JSON.stringify({points:li.points,xn:li.xn,yn:li.yn,sliceX:li.sliceX,sliceY:li.sliceY})))) {
    if (soImgURL && soImgURL !== session.transaction.state.soImgURL) URL.revokeObjectURL(soImgURL);
    set_warpSession(null); set_warpTempSO(null); set_soEnterSnap(null);
    structuralApply(session.transaction);
    restoreFreeTransformHistory(session.transaction);
    applyDeformClass(); syncToolOptions(); drawGizmo(); updateUndoButtons();
    shell.status(ok ? '变形未作更改' : '已取消这次变形');
    return true;
  }
  if (li && cur >= 0) {
    try { await bakeCurrentSO(); } catch (e) { console.warn('烘焙失败', e); }
    settleSoEnter();                                          
  }
  set_dragState(null); set_selPt(-1); set_hoverPt(-1);
  set_cur(-1); set_li(null);
  deformTool = null; deformEnter = null; set_deformSel(null);      
  set_replImg(null); set_replFile(null); set_img(null);
  if (soImgURL) { URL.revokeObjectURL(soImgURL); set_soImgURL(null); }
  applyDeformClass();
  buildTabs(); renderLayerPanel(); renderPreviewOnly();
  updateUndoButtons();
  if (warpTempSO) await settleWarpTempSO();          
  if (session) {
    set_warpSession(null);
    docHistory.undo.length = 0; docHistory.redo.length = 0;
    docHistory.undo.push(...session.transaction.state.docHist.undo);
    structuralDone(session.transaction, '变形');
  }
  return true;
}
export function setFitControls(f){
  $('#fitMode').value = f.mode || 'stretch';
  $('#alignX').value = String(f.alignX != null ? f.alignX : .5);
  $('#alignY').value = String(f.alignY != null ? f.alignY : .5);
  $('#fitScale').value = f.scale != null ? f.scale : 1;
  $('#fitScaleVal').textContent = (+$('#fitScale').value).toFixed(2);
}

export function matchLayer(so){
  let best=-1, bestScore=1e18;
  doc.layers.forEach((l,idx)=>{
    if(!l.isSmartObject) return;
    const db = Math.abs(l.bounds.left-so.bounds.left)+Math.abs(l.bounds.top-so.bounds.top)+Math.abs(l.bounds.right-so.bounds.right)+Math.abs(l.bounds.bottom-so.bounds.bottom);
    const score = (l.name===so.layerName?0:1000) + db;
    if(score<bestScore){ bestScore=score; best=idx; }
  });
  return best;
}
