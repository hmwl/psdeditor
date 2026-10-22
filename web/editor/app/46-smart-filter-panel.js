




import './45-path-tools.js';   
import { DOCS } from '../documents.js';
import { puppetPinKey, puppetPinMode, movePuppetSelection, rotatePuppetSelection } from '../puppet-interaction.js';
import { parseSmartObjects, smartObjectFragment, replacePlacedBlocks } from '../../../core/app.js';
import { solvePerspectivePoints } from '../../../core/perspective-solve.js';
import { fragmentToJSON } from '../api-client.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { transformWarpToolbar } from '../transform-warp-toolbar.js';
import { rasterPresetHandles, beginRasterPresetHandle, moveRasterPresetHandle, cancelRasterPresetHandle } from '../transform-warp-raster.js';
import { drawPresetWarpHandles } from '../preset-warp-controls.js';
import { drawWarpSelection, warpSelected, warpSelect, warpClear, warpBeginMarquee } from '../warp-selection.js';
import {
  $, addPuppetPin, api, applyPuppetPins, cloneDeform, nearestSurfaceParam, patchCountX, patchCountY,
  perspectiveQuadAt, removePerspectiveQuad, removePuppetPin, splitMeshU, splitMeshV, surfaceIsoCurves,
  surfacePoint, unsplitMeshU, unsplitMeshV,
} from './01-boot.js';
import {
  DOC_MODE_NAMES, PIXEL_GRID_MIN_ZOOM, artboardGuidesOn, doc, docH, docName, docStack, docW, editPinsOn,
  gridOpts, guideDrag, guides, guidesVisible, hexAlpha, hover, hoverPt, layerDeletes, layerEdgesOn,
  layerRenames, layerTree, li, maskEdit, maskPaint, origBuffer, pixelGridOn, pushHistory, selPt, set_dragState,
  set_guideDrag, set_hover, set_hoverPt, set_selPt, set_textDrag, smartGuidesOn, snapshot, sos, textDrag,
  textOverlay, viewFlip, viewPar, viewParCorrect,
} from './02-doc-state.js';
import { ACTP } from './03-history.js';
import {
  padL, padT, setTool, set_splitOneShot, set_splitPicked, splitOneShot, splitPicked, viewH, viewHold, viewW,
  zoom,
} from './04-view-chrome.js';
import { guideHit, rasterKindOf, rasterizeLayerUI, viewport } from './05-layer-lock-guides.js';
import {
  applyMesh, beginZoomGesture, commit, deformHandles, layerSelBBox, spaceDown, tfFrame,
} from './06-view-zoom-move.js';
import { beginMoveDrag, drawHoverBounds } from './07-nav-histogram.js';
import { textDragRect, textToolDown } from './09-text-tool.js';
import { beginCrop, beginCropDrag, cropState, drawCropGizmo, drawTransformHandles } from './10-crop.js';
import { gradOpts } from './11-paint-common.js';
import { qmask } from './13-quickmask-apply-image.js';
import {
  adjEye, adjEyeSampleAt, beginGradDrag, bucketFill, drawEyeRing, drawGradGizmo, eyedropAt, eyedropDown,
  liveGradHit,
} from './15-gradient-bucket-eyedropper.js';
import { beginLiveRadius, beginShapeDrag, drawLiveRadiusGizmo, drawWorkPath, penDown } from './17-shape-pen.js';
import {
  curvatureDown, drawFreePenGizmo, drawMagPenGizmo, drawPenGizmo, drawShapeGizmo, freePenDown,
} from './18-pen-extra.js';
import { drawTfFloat, tfCurValues, tfRefPoint, tfState } from './19-free-transform.js';
import { insideDirty, snapLines } from './20-snap-smart-object.js';
import { selectSO } from './21-load-document.js';
import {
  deformOpts, deformPins, deformRun, deformSel, deformTool, matchLayer, pquadDrag, pquadMove, pquadSnapRect,
  puppetRing, selectDeformPin, selectedPins, set_deformSel, set_pquadDrag, set_pquadMove, set_puppetRing,
  syncDeformBar,
} from './22-deform-tools.js';
import { renderLayerPanel, selLayer } from './23-layers-panel.js';
import { humanEditError, renderProps } from './24-layer-ops-queue.js';
import { warpSession } from './26-layer-create.js';
import { getTransformValues } from './28-layer-props-transform.js';
import { gizmoTx } from './29-scrubby-live.js';
import { ensureGizmoCanvas, gizmoCanvas, isoU, isoV, polyDist, stroke, topo } from './30-render.js';
import {
  AUX_TOOLS, PAINT_TOOLS, SEL_TOOLS, TEXT_TOOLS, addColorSampler, auxDown, closeMaskEdit, docTool, drawAuxTools,
  handActive, loadMixerBrush, moveOpts, setDocTool, stageLocal, viewAngle, zoomOutMode,
} from './31-selection-brush.js';
import {
  cursorKickEl, dispPx, doWand, drawAnts, drawBrushCursor, drawQuickMaskOverlay, drawSelBrushOverlay,
  drawSelDragPreview, effSelMode, selBrushDown, syncGizmoCursor, syncPointerModifiers,
} from './32-cursors-select-options.js';
import {
  closeMagLasso, drawObjFinder, drawObjSelGizmo, magLasso, magLassoDown, objSelDown, polyLasso, polyLassoDown,
  quickSelDown,
} from './33-lasso-quick-select.js';
import { drawPCropGizmo, drawSliceGizmo, pcropDown, sliceDown, sliceSelectDown } from './34-perspective-crop-slice.js';
import {
  abGizmoOn, abHandleAt, abHoverCur, abPlusAt, abSel, abState, abTitleHit, artboardDown, docArtboards,
  set_abHoverCur, set_abSel,
} from './35-artboard.js';
import { drawArtboardGizmo, drawFrameGizmo, frameDown } from './36-clipboard-frame.js';
import {
  BRUSHOP_SAMPLES, BRUSHOP_TOOLS, beginBrushOpStroke, beginSelDrag, brushOpSample, drawBrushOpGizmo,
  drawLassoGizmo, magicEraseAt, syncBrushOpBar,
} from './37-local-pixel-tools.js';
import {
  ALT_EYEDROP, beginStroke, brushTarget, lastPaintPt, scheduleStrokeRepaint, strokeLineTo,
} from './38-brush-engine.js';
import {
  adjBrushDown, beginEraserStroke, beginPencilStroke, drawPaintExtras, installBrushGestures, paintPressure,
  startPaintGesture,
} from './39-brush-options.js';
import { drawSmView, syncBrushBarFor, syncBrushPanel } from './40-options-bar-wiring.js';
import { PATH_EDIT_TOOLS, drawPathGizmo, pathToolDown } from './45-path-tools.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import { beginTextBoxDrag, drawTextBoxGizmo, textBoxHandleAt } from './48-info-export.js';
import { colorRangePick, colorRangeState } from './51-image-select-menu.js';
import { RETOUCH_TOOLS, drawCloneOverlay } from './53-retouch-clone-pattern.js';
import { drawRetouchGizmo, retouchDown } from './54-gestures-hints.js';
import { PW, drawTextPathGizmo, drawTextRichCaret } from './57-layer-style-text-path.js';


















export const soFilters = {};             
export const soFilterEdits = {};         
export const soFilterShadow = {};        



export const soFilterOrig = {};
export const b64ToU8 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
export const filterSoIndexOf = layerIdx => sos.findIndex(so => matchLayer(so) === layerIdx);

export function filterErrorText(e){
  const st = e && e.status, msg = (e && e.message) || '';
  if (st === 400) return '服务端看不懂这次改动：' + humanEditError(msg);
  if (st === 401) return '编辑器会话失效了：刷新页面后重试。';
  if (st === 429) return '请求太频繁了，稍等几秒再点「重试」。';
  if (st >= 500) return '服务端处理智能滤镜时出错了，稍后重试；其它编辑功能不受影响。';
  return '连不上本地服务：智能滤镜要靠服务端解析智能对象描述符。启动服务后点「重试」即可；图层 / 文字 / 像素 / 路径编辑都不依赖它。';
}
export async function filterPost(path, body){
  const r = await api.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error || ''; } catch {} const e = new Error(m || ('HTTP ' + r.status)); e.status = r.status; throw e; }
  return r.json();
}
export function filterEditsPayload(soIdx){
  const e = soFilterEdits[soIdx];
  if (!e) return null;
  const filters = Object.keys(e.filters || {}).map(k => {
    const q = e.filters[k], one = { index: +k };
    if (q.enabled !== undefined) one.enabled = q.enabled;
    if (q.values && Object.keys(q.values).length) one.values = { ...q.values };
    return one;
  }).filter(o => o.enabled !== undefined || o.values);
  const style = { ...(e.style || {}) };
  if (!filters.length && !Object.keys(style).length) return null;
  const out = {};
  if (Object.keys(style).length) out.style = style;
  if (filters.length) out.filters = filters;
  return out;
}

export async function loadFilterList(soIdx, buffer){
  const base = buffer || soFilterShadow[soIdx] || origBuffer;
  if (!base) return;
  const so0 = sos[soIdx]; if (!so0) return;
  let so = so0;
  if (base !== origBuffer) {                       
    const fresh = parseSmartObjects(base);
    so = fresh[soIdx] || fresh.find(s => (s.layerName || '') === (so0.layerName || '')) || so0;
  }
  soFilters[soIdx] = { ...(soFilters[soIdx] || {}), state: 'loading' };
  try {
    const data = await filterPost('/so/filters', fragmentToJSON(smartObjectFragment(base, so)));
    soFilters[soIdx] = { state: 'ok', data };
    if (base === origBuffer) soFilterOrig[soIdx] = data;      
  } catch (e) { soFilters[soIdx] = { state: 'error', error: filterErrorText(e) }; }
  if (selLayer >= 0 && filterSoIndexOf(selLayer) === soIdx) renderProps();
  renderLayerPanel();                              
}
export const origFilterOf = (soIdx, index) => {
  const o = soFilterOrig[soIdx];
  return (o && o.filters && o.filters.find(f => f.index === index)) || null;
};
export const origStyleEnabled = soIdx => { const o = soFilterOrig[soIdx]; return o && o.style ? o.style.enabled !== false : true; };
const origParamOf = (soIdx, index, path) => {
  const f = origFilterOf(soIdx, index), p = f && f.params && f.params.find(x => x.path === path);
  return p ? p.value : undefined;
};

export let filterPending = Promise.resolve();      
export const pushFilterEdits = (soIdx, prevEdits) => (filterPending = doPushFilterEdits(soIdx, prevEdits));
async function doPushFilterEdits(soIdx, prevEdits){
  const so = sos[soIdx];
  if (!so || !origBuffer) return;
  const payload = filterEditsPayload(soIdx);
  soFilters[soIdx] = { ...(soFilters[soIdx] || {}), busy: true };
  renderProps();
  if (!payload) { delete soFilterShadow[soIdx]; await loadFilterList(soIdx, origBuffer); return; }
  try {
    const j = await filterPost('/so/filters/writeback',
      { fragment: fragmentToJSON(smartObjectFragment(origBuffer, so)), edits: payload });
    const blocks = (j.blocks || []).map(b => ({ key: b.key, data: b64ToU8(b.data) }));
    soFilterShadow[soIdx] = replacePlacedBlocks(origBuffer, so, blocks).buffer;   
    await loadFilterList(soIdx, soFilterShadow[soIdx]);
    $('#err').textContent = '';
    if (j.warnings && j.warnings.length) $('#notice').textContent = '智能滤镜：' + j.warnings.join('；');
  } catch (e) {
    if (prevEdits === undefined) delete soFilterEdits[soIdx]; else soFilterEdits[soIdx] = prevEdits;
    soFilters[soIdx] = { ...(soFilters[soIdx] || {}), busy: false };
    $('#err').textContent = '智能滤镜改动没能生效（已撤回）：' + filterErrorText(e);
    renderProps();
  }
}
export function editFilter(soIdx, fIndex, mut){
  const prev = soFilterEdits[soIdx] ? JSON.parse(JSON.stringify(soFilterEdits[soIdx])) : undefined;
  const e = soFilterEdits[soIdx] || (soFilterEdits[soIdx] = { style: {}, filters: {} });
  const q = e.filters[fIndex] || (e.filters[fIndex] = { values: {} });
  mut(q);
  if (q.values && !Object.keys(q.values).length) delete q.values;
  if (q.enabled === undefined && !q.values) delete e.filters[fIndex];
  if (!Object.keys(e.filters).length && !Object.keys(e.style || {}).length) delete soFilterEdits[soIdx];
  return pushFilterEdits(soIdx, prev);          
}
export const effFilterEnabled = (soIdx, f) => {
  const q = soFilterEdits[soIdx] && soFilterEdits[soIdx].filters[f.index];
  return q && q.enabled !== undefined ? q.enabled : f.enabled;
};
const effFilterParam = (soIdx, f, prm) => {
  const q = soFilterEdits[soIdx] && soFilterEdits[soIdx].filters[f.index];
  return q && q.values && q.values[prm.path] !== undefined ? q.values[prm.path] : prm.value;
};

export function renderSmartFilters(box, idx, l, ui){
  const { row, hint, mk, tog, btns } = ui;
  const soIdx = filterSoIndexOf(idx);
  if (soIdx < 0) { row('智能滤镜', mk('span', { textContent: '这一层的智能对象还没解析出来', style: 'color:var(--muted)' })); return; }
  const S = soFilters[soIdx];
  const retry = mk('button', { textContent: S && S.state === 'error' ? '重试' : '刷新', title: '重新向服务端读取这一层的智能滤镜列表' });
  retry.dataset.attr = 'sf-reload';
  retry.onclick = () => loadFilterList(soIdx);
  if (!S) { row('智能滤镜', mk('span', { textContent: '读取中…', style: 'color:var(--muted)' })); loadFilterList(soIdx); return; }
  if (S.state === 'loading') { row('智能滤镜', mk('span', { textContent: '读取中…', style: 'color:var(--muted)' })); return; }
  if (S.state === 'error') { row('智能滤镜', mk('span', { textContent: '读不到', style: 'color:#ffd28a;flex:1' }), retry); hint(S.error, 'warn'); return; }
  const d = S.data || {};
  if (!d.present) { row('智能滤镜', mk('span', { textContent: '这个智能对象没有智能滤镜', style: 'color:var(--muted)', className: '' }), retry); return; }
  const lockAll = d.writable === false ? '这个智能对象的描述符块我们还原不了（前置探针没过），不敢改它的滤镜' : '';
  const styleOn = d.style ? d.style.enabled !== false : true;
  row('智能滤镜', mk('span', { textContent: `${d.count} 条${styleOn ? '' : '（整组已停用）'}`, style: 'color:var(--text);flex:1' }),
      S.busy ? mk('span', { textContent: '写回中…', style: 'color:var(--muted)' }) : retry);
  
  row('总开关', btns(tog(styleOn ? '整组：开' : '整组：关', styleOn, lockAll || (S.busy ? '写回中…' : ''), () => {
    const prev = soFilterEdits[soIdx] ? JSON.parse(JSON.stringify(soFilterEdits[soIdx])) : undefined;
    const e = soFilterEdits[soIdx] || (soFilterEdits[soIdx] = { style: {}, filters: {} });
    const want = !styleOn;
    if (want === origStyleEnabled(soIdx)) delete e.style.enabled; else e.style.enabled = want;   
    if (!Object.keys(e.style).length && !Object.keys(e.filters).length) delete soFilterEdits[soIdx];
    pushFilterEdits(soIdx, prev);
  }, '这一层全部智能滤镜的总开关（filterFX.enabled）', 'sf-style-enabled')));
  const listEl = mk('div', { className: 'sflist' });
  for (const f of (d.filters || [])) {
    const deform = f.owner === 'deform';
    const why = lockAll || (deform ? (f.note || '这条由变形编辑器负责') : '');
    const it = mk('div', { className: 'sfitem' + (why ? ' locked' : '') });
    it.dataset.attr = 'sf-item'; it.dataset.index = String(f.index);
    if (deform) it.dataset.deform = '1';
    const head = mk('div', { className: 'sfhead' });
    const cb = mk('input', { type: 'checkbox', checked: effFilterEnabled(soIdx, f) });
    cb.dataset.attr = 'sf-enabled'; cb.dataset.index = String(f.index);
    

    cb.disabled = !!lockAll || !f.enabledEditable || !!S.busy;
    if (cb.disabled) cb.title = lockAll || '这条滤镜的记录里没有启用位，改不了';
    
    cb.onchange = () => editFilter(soIdx, f.index, q => {
      const of0 = origFilterOf(soIdx, f.index);
      if (of0 && cb.checked === of0.enabled) delete q.enabled; else q.enabled = cb.checked;
    });
    
    const shown = f.nameSource === 'classID' ? f.classID : (f.displayName || f.name || f.classID);
    head.append(cb, mk('span', { className: 'nm', textContent: shown, title: `${f.name || ''}（classID ${f.classID} · filterID ${f.filterID} · 名称来源 ${f.nameSource}）` }),
                mk('span', { className: 'cid', textContent: f.classID }));
    if (deform) {
      const dk = f.kind || (f.classID === 'rigidTransform' ? 'puppetWarp' : f.classID === 'perspectiveWarpTransform' ? 'perspectiveWarp' : null);
      const b = mk('button', { className: 'mini', textContent: '用变形编辑器打开', type: 'button',
        title: '这条滤镜的顶点 / 图钉由变形编辑器负责，点这里进入对应的变形工具（与「编辑 › 操控变形 / 透视变形」同一条路）' });
      b.dataset.attr = 'sf-open-deform';
      b.disabled = false;
      b.onclick = () => { if (dk) deformRun(dk); else selectSO(soIdx); };
      head.append(b);
    }
    it.append(head);
    if (why) {
      


      head.title = why;
      it.append(mk('div', { className: 'note', textContent: why }));
      if (f.paramsOmitted) it.append(mk('div', { className: 'note', textContent: f.paramsOmitted }));
    } else if (f.params) {
      const editable = f.params.filter(p => p.editable);
      const readonly = f.params.length - editable.length;
      for (const prm of editable) {
        const r = mk('div', { className: 'prm' });
        r.append(mk('span', { className: 'k', textContent: prm.path.trim(), title: `${prm.path}（${prm.type}）` }));
        const val = effFilterParam(soIdx, f, prm);
        const o0 = origParamOf(soIdx, f.index, prm.path);     
        const commit = v => editFilter(soIdx, f.index, q => {
          q.values = q.values || {};
          if (v === o0 || (typeof v === 'number' && typeof o0 === 'number' && Math.abs(v - o0) < 1e-9)) delete q.values[prm.path];
          else q.values[prm.path] = v;
        });
        let el;
        if (prm.type === 'bool') {
          el = mk('input', { type: 'checkbox', checked: !!val });
          el.style.flex = 'none';
          el.onchange = () => commit(el.checked);
        } else if (prm.type === 'UntF' || prm.type === 'doub' || prm.type === 'number' || prm.type === 'long' || prm.type === 'comp') {
          const isInt = prm.type === 'long' || prm.type === 'comp';
          el = mk('input', { type: 'number', value: val, step: isInt ? 1 : 0.01 });
          el.onchange = () => { const n = isInt ? Math.round(+el.value) : +el.value; if (isFinite(n)) commit(n); };   
        } else {                                     
          el = mk('input', { type: 'text', value: String(val == null ? '' : val) });
          el.title = prm.type === 'enum' ? `枚举（${prm.enumType || '?'}）—— 我们没有这个滤镜的取值表，请填原始枚举 key` : '文本';
          el.onchange = () => commit(el.value);
        }
        el.dataset.attr = 'sf-param'; el.dataset.index = String(f.index); el.dataset.path = prm.path;
        el.disabled = !!S.busy;
        r.append(el);
        if (prm.unit) r.append(mk('span', { className: 'u', textContent: prm.unit }));
        it.append(r);
      }
    }
    listEl.append(it);
  }
  box.append(listEl);
  if (lockAll) hint(lockAll + (d.firstDiff ? `（第一处差异：块内偏移 ${d.firstDiff.offset}，${d.firstDiff.before} → ${d.firstDiff.after}）` : ''), 'warn');
  if (d.warnings && d.warnings.length) hint(d.warnings.join('；'), 'warn');
  if (soFilterEdits[soIdx]) hint('智能滤镜的改动已经记下（走放置块字节整块替换，与图层属性队列是两条路），导出时按同一份语义重新写回一次。', 'ok');
  hint('在这里启停 / 改参数时画布上仍是图层的缓存栅格（改动写进导出的 PSD，PS 打开即可看到）；'
     + '滤镜蒙版的编辑 / 停用 / 删除、清除智能滤镜会在浏览器里按滤镜输入缓存（FEid）重算画面（认得的滤镜：模糊 / 锐化 / 杂色 / 扭曲等，变形滤镜除外）。');
}




let docTabKey = null;
export function syncDocTab(){
  if (!doc || !docW) {
    if (docTabKey === '') return;
    docTabKey = ''; shell.setDocTab(null); return;
  }
  const L = layerTree && layerTree.flat && layerTree.flat[selLayer];
  const modeName = DOC_MODE_NAMES[doc.mode] || ('mode ' + doc.mode);
  const name = docName;
  const layerName = L ? (layerRenames[selLayer] || L.name) : '';
  const dirty = docStack.length ? insideDirty() : DOCS.isDirty();
  const key = [DOCS.activeUid(), name, zoom, layerName, modeName, doc.depth, dirty ? 1 : 0].join('\u0001');
  if (key === docTabKey) return;
  docTabKey = key;
  shell.setDocTab({ name: name || '未命名', zoom, layer: layerName, mode: modeName, depth: doc.depth, dirty });
  DOCS.refreshTabs();
}
export function syncDocStats(){
  syncDocTab();
  const el = $('#docStats'); if (!el) return;
  if (!doc || !docW) { if (el.textContent !== '') el.textContent = ''; return; }
  const modeName = DOC_MODE_NAMES[doc.mode] || ('mode ' + doc.mode);
  let s = `${docW} × ${docH} 像素 · ${modeName}/${doc.depth}位`;
  const L = layerTree && layerTree.flat && layerTree.flat[selLayer];
  if (L && !layerDeletes.has(selLayer)) {
    const t = doc.layers[selLayer]?.frame?.rect || getTransformValues(selLayer);
    const nm = layerRenames[selLayer] || L.name || ('图层 ' + selLayer);
    s += ` ｜ 「${nm}」 ${Math.round(t.w)} × ${Math.round(t.h)} @ ${Math.round(t.x)},${Math.round(t.y)}`;
  }


  if (el.textContent !== s) el.textContent = s;
  const ds = $('#docSize');
  if (ds) {
    const sizeText = `文档:${fmtBytes(docW * docH * (doc.mode === 4 ? 4 : 3) * (doc.depth / 8))}/${fmtBytes(origBuffer ? origBuffer.byteLength : 0)}`;
    if (ds.textContent !== sizeText) ds.textContent = sizeText;
  }
}
export const fmtBytes = n => n >= 1048576 ? (n / 1048576).toFixed(2) + 'M' : n >= 1024 ? (n / 1024).toFixed(1) + 'K' : n + 'B';

export function drawGizmo(){
  if (viewHold && viewHold.freeze) return;
  const g = gizmoCanvas(); ensureGizmoCanvas(g); 
  const ctx = g.getContext('2d');
  
  if (ctx.setTransform) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, g.width, g.height); ctx.setTransform(gizmoTx.sx, 0, 0, gizmoTx.sy, gizmoTx.tx, gizmoTx.ty); }
  else ctx.clearRect(-padL(), -padT(), viewW(), viewH());
  syncDocStats();                              
  if (!doc || !docW) return;
  
  if (guidesVisible) {
    
    const G = PREF.get('guides') || {};
    const dash = st => st === 'dashed' ? [dispPx(5), dispPx(4)] : [];
    const abRect = new Map(docArtboards().map(a => [a.index, a.rect]));
    ctx.save();
    ctx.lineWidth = dispPx(1);
    for (const ab of [false, true]) {
      if (ab && !artboardGuidesOn) continue;
      ctx.strokeStyle = ab ? (G.artboardColor || '#6fa8ff') : (G.canvasColor || '#4affff');
      ctx.setLineDash(dash(ab ? G.artboardStyle : G.canvasStyle));
      ctx.beginPath();
      for (const gd of guides) {
        if ((gd.ab != null) !== ab) continue;
        const r = ab ? abRect.get(gd.ab) : null;
        if (ab && !r) continue;
        const x0 = r ? r.x : 0, y0 = r ? r.y : 0, x1 = r ? r.x + r.w : docW, y1 = r ? r.y + r.h : docH;
        if (gd.vertical) { ctx.moveTo(gd.px, y0); ctx.lineTo(gd.px, y1); }
        else { ctx.moveTo(x0, gd.px); ctx.lineTo(x1, gd.px); }
      }
      if (guideDrag && !ab) {
        if (guideDrag.axis === 'v') { ctx.moveTo(guideDrag.px, 0); ctx.lineTo(guideDrag.px, docH); }
        else { ctx.moveTo(0, guideDrag.px); ctx.lineTo(docW, guideDrag.px); }
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (pixelGridOn && zoom >= PIXEL_GRID_MIN_ZOOM && docW && docH) {
    
    const vp = $('#viewport'), st = $('#stage');
    let x0 = 0, y0 = 0, x1 = docW, y1 = docH;
    if (vp && st) {
      const v = vp.getBoundingClientRect(), r = st.getBoundingClientRect();
      if (r.width > 0) {
        x0 = Math.max(0, Math.floor((v.left - r.left) / r.width * viewW() - padL()) - 1);
        x1 = Math.min(docW, Math.ceil((v.right - r.left) / r.width * viewW() - padL()) + 1);
        y0 = Math.max(0, Math.floor((v.top - r.top) / r.height * viewH() - padT()) - 1);
        y1 = Math.min(docH, Math.ceil((v.bottom - r.top) / r.height * viewH() - padT()) + 1);
      }
    }
    


    ctx.save();
    if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(128,128,128,.45)';
    ctx.beginPath();
    const { sx: gs, tx: gtx, ty: gty } = gizmoTx;
    const Y0 = gty + y0 * gs, Y1 = gty + y1 * gs, X0 = gtx + x0 * gs, X1 = gtx + x1 * gs;
    for (let x = x0; x <= x1; x++) { const X = Math.ceil(gtx + x * gs - 0.5) + 0.5; ctx.moveTo(X, Y0); ctx.lineTo(X, Y1); }
    for (let y = y0; y <= y1; y++) { const Y = Math.ceil(gty + y * gs - 0.5) + 0.5; ctx.moveTo(X0, Y); ctx.lineTo(X1, Y); }
    ctx.stroke();
    ctx.restore();
  }
  if (qmask && qmask.cv) { ctx.save(); ctx.drawImage(qmask.cv, 0, 0); ctx.restore(); }   
  if (gridOpts.on && docW && docH) {             
    const st = gridOpts.every / Math.max(1, gridOpts.sub);
    ctx.save(); ctx.lineWidth = dispPx(1);
    
    const gs = PREF.get('guides.gridStyle') || 'lines';
    if (gs === 'dashed') ctx.setLineDash([dispPx(4), dispPx(4)]);
    if (gs === 'dots') { ctx.setLineDash([dispPx(1), dispPx(3)]); }
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? gridOpts.color : hexAlpha(PREF.get('guides.gridColor'), 0.35);
      ctx.beginPath();
      for (let k = 0, x = 0; x <= docW; k++, x = k * st) { if ((k % gridOpts.sub === 0) !== major) continue; ctx.moveTo(x, 0); ctx.lineTo(x, docH); }
      for (let k = 0, y = 0; y <= docH; k++, y = k * st) { if ((k % gridOpts.sub === 0) !== major) continue; ctx.moveTo(0, y); ctx.lineTo(docW, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (layerEdgesOn && doc && !li && selLayer >= 0) {   
    const b = layerSelBBox(selLayer);
    if (b && b.w > 0 && b.h > 0) { ctx.save(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = '#1e90ff'; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore(); }
  }
  drawHoverBounds(ctx);                          
  if (snapLines.length && smartGuidesOn) {        
    ctx.save();
    ctx.lineWidth = dispPx(1);
    ctx.strokeStyle = PREF.get('guides.smartColor') || 'rgba(255,0,170,.95)';
    ctx.beginPath();
    for (const ln of snapLines) {
      if (ln.vertical) { ctx.moveTo(ln.px, 0); ctx.lineTo(ln.px, docH); }
      else { ctx.moveTo(0, ln.px); ctx.lineTo(docW, ln.px); }
    }
    ctx.stroke();
    ctx.restore();
  }
  drawSmView(ctx);                              
  drawSelBrushOverlay(ctx);                     
  drawQuickMaskOverlay(ctx);
  drawObjFinder(ctx);                           
  if (!qmask) drawAnts(ctx);
  drawSelDragPreview(ctx);
  if (textOverlay) drawTextBoxGizmo(ctx);       
  if (textOverlay) drawTextRichCaret(ctx);      
  if (textDrag) {                               
    const r = textDragRect(textDrag);
    ctx.save(); ctx.lineWidth = dispPx(1); ctx.setLineDash([dispPx(4), dispPx(3)]); ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.lineDashOffset = dispPx(4); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
  }
  if (!li){                                     
    if (cropState) { drawCropGizmo(ctx); return; }
    drawAuxTools(ctx);
    drawPathGizmo(ctx);                         
    drawCloneOverlay(ctx);                      
    drawPaintExtras(ctx);                       
    drawBrushCursor(ctx);                       
    drawGradGizmo(ctx);                         
    drawShapeGizmo(ctx);                        
    drawLiveRadiusGizmo(ctx);                   
    drawPenGizmo(ctx);                          
    drawFreePenGizmo(ctx);                      
    drawMagPenGizmo(ctx);                       
    drawRetouchGizmo(ctx);                      
    drawWorkPath(ctx);                          
    drawTextPathGizmo(ctx);                     
  drawLassoGizmo(ctx);                        
  drawObjSelGizmo(ctx);                       
  drawPCropGizmo(ctx);                        
  drawSliceGizmo(ctx);                        
  drawArtboardGizmo(ctx);                     
  drawFrameGizmo(ctx);                        
  drawEyeRing(ctx);                           
  drawBrushOpGizmo(ctx);                      
    if (tfState && tfState.sel) drawTfFloat(ctx);   
    if (tfState && tfState.pathWarp) { PW.draw(ctx); return; }   
    if (selLayer >= 0 && doc.layers[selLayer] && !layerDeletes.has(selLayer) && ((docTool === 'move' && moveOpts.showTf) || tfState)) {
      const t = tfState ? tfCurValues() : getTransformValues(selLayer);
      if (t.w > 0 && t.h > 0) {
        


        const f = tfFrame(t);
        ctx.save();
        ctx.beginPath(); f.corners.forEach((c, k) => k ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])); ctx.closePath();
        ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
        drawTransformHandles(ctx, f.corners);
        if (tfState && tfState.refShown) {           
          const r = tfRefPoint(), rs = dispThr(5);
          ctx.beginPath(); ctx.arc(r[0], r[1], rs, 0, 7);
          ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = dispPx(1.2);
          ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(r[0] - rs, r[1]); ctx.lineTo(r[0] + rs, r[1]);
          ctx.moveTo(r[0], r[1] - rs); ctx.lineTo(r[0], r[1] + rs);
          ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.stroke();
        }
        ctx.restore();
      }
    }
    return;
  }
  if(!li || !li.points){
    if (li && li.deform){
      const hs = deformHandles();
      const layout = deformTool === 'perspectiveWarp' && deformOpts.pMode === 'layout';
      $('#meshInfo').textContent = li.deform.kind === 'perspectiveWarp'
        ? (layout ? `透视变形 · 版面：${li.deform.quadIdx.length} 个面 / ${hs.length} 个顶点 —— 空白处拖出新面，Alt 点面删掉它`
                  : `透视变形：${hs.length} 个顶点，拖动顶点调整（相邻面共用顶点）；写回智能滤镜`)
        : `操控变形：${hs.length} 个图钉，拖动图钉（${{'rigid':'刚性','similarity':'正常','affine':'扭曲'}[deformOpts.mode] || ''}）；写回智能滤镜`;
      

      const tool = deformTool === li.deform.kind;
      const showMesh = tool ? deformOpts.showMesh : $('#showCage').checked;
      const showPts = tool ? editPinsOn : $('#showCage').checked;
      if (!showMesh && !showPts) return;
      const gx = ctx;
      const S = 6;
      if (li.deform.kind === 'perspectiveWarp'){
        if (showMesh) for (const q of li.deform.quads){
          
          gx.setLineDash(layout ? [] : [6,4]); gx.lineWidth = layout ? 2.5 : 1.5;
          gx.strokeStyle = layout ? 'rgba(0,145,255,.95)' : 'rgba(0,170,255,.4)';
          stroke(gx, [...q.src, q.src[0]]);
          gx.setLineDash(layout ? [6,4] : []); gx.lineWidth = layout ? 1.5 : 2.5;
          gx.strokeStyle = layout ? 'rgba(0,170,255,.4)' : 'rgba(0,145,255,.95)';
          stroke(gx, [...q.dst, q.dst[0]]);
        }
        gx.setLineDash([]);
        if (showPts) hs.forEach((h, i) => {
          const hot = i === selPt || i === hoverPt, s2 = hot ? S * 1.25 : S;
          gx.lineWidth = 2.5; gx.fillStyle = layout && perspectiveVertexSnap && (h.i === perspectiveVertexSnap.from || h.i === perspectiveVertexSnap.to) ? '#f59e0b' : i === selPt ? '#0091ff' : '#fff'; gx.strokeStyle = hot ? '#f59e0b' : '#0091ff';
          gx.beginPath(); gx.rect(h.p.x - s2, h.p.y - s2, s2 * 2, s2 * 2); gx.fill(); gx.stroke();
        });
        if (layout && pquadDrag) {                 
          const sn = pquadDrag.snap || pquadSnapRect(pquadDrag);
          const r = sn.rect;
          gx.setLineDash([5, 4]); gx.lineWidth = 2; gx.strokeStyle = '#f59e0b';
          gx.fillStyle = 'rgba(245,158,11,.12)';
          gx.beginPath(); gx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); gx.fill(); gx.stroke();
          gx.setLineDash([]);
          

          for (const vi of sn.hits) {
            const v = li.deform.vertices[vi]; if (!v) continue;
            const s3 = S * 1.1;
            gx.lineWidth = 2.5; gx.fillStyle = '#f59e0b'; gx.strokeStyle = '#fff';
            gx.beginPath(); gx.rect(v.x - s3, v.y - s3, s3 * 2, s3 * 2); gx.fill(); gx.stroke();
          }
        }
        if (layout && pquadMove) {                 
          const q2 = li.deform.quadIdx[pquadMove.qi];
          if (q2) {
            gx.setLineDash([]); gx.lineWidth = 2.5; gx.strokeStyle = '#f59e0b';
            stroke(gx, [...q2.map(k => li.deform.vertices[k]), li.deform.vertices[q2[0]]]);
          }
        }
      } else if (li.deform.kind === 'puppetWarp'){
        if (showMesh) {
          gx.lineWidth = 1; gx.strokeStyle = 'rgba(0,170,255,.45)';
          gx.beginPath();
          for (const s of li.deform.shapes){
            for (let k = 0; k + 2 < s.indices.length; k += 3){
              const a = s.def[s.indices[k]], b = s.def[s.indices[k + 1]], c = s.def[s.indices[k + 2]];
              gx.moveTo(a.x, a.y); gx.lineTo(b.x, b.y); gx.lineTo(c.x, c.y); gx.closePath();
            }
          }
          gx.stroke();
        }
        if (showPts) hs.forEach((h, i) => {          
          const picked = deformPins.some(p => p.j === h.j && p.i === h.i);
          const hot = i === selPt || i === hoverPt || picked, r = hot ? S * 1.4 : S * 1.1;
          gx.lineWidth = 2; gx.fillStyle = hot ? '#f59e0b' : '#ffd23f'; gx.strokeStyle = '#fff';
          gx.beginPath(); gx.arc(h.p.x, h.p.y, r, 0, 7); gx.fill(); gx.stroke();
          gx.fillStyle = '#1b1b1c'; gx.beginPath(); gx.arc(h.p.x, h.p.y, 2, 0, 7); gx.fill();
          
          const pin = li.deform.shapes[h.j] && li.deform.shapes[h.j].pins[h.i];
          if (pin && puppetPinMode(pin) === 'fixed') {
            const th = pin.rot * Math.PI / 180, L = dispThr(16);
            gx.lineWidth = 2; gx.strokeStyle = '#f59e0b';
            gx.beginPath(); gx.moveTo(h.p.x, h.p.y); gx.lineTo(h.p.x + L * Math.cos(th), h.p.y + L * Math.sin(th)); gx.stroke();
          }
          if (picked) {                              
            gx.lineWidth = 1.5; gx.strokeStyle = '#f59e0b';
            gx.beginPath(); gx.arc(h.p.x, h.p.y, r + dispThr(4), 0, 7); gx.stroke();
          }
        });
        if (puppetRing) {
          const pin = li.deform.shapes[puppetRing.j]?.pins[puppetRing.i];
          if (pin) { gx.lineWidth = 1.5; gx.strokeStyle = '#f59e0b'; gx.setLineDash([4, 3]); gx.beginPath();
            gx.arc(pin.pos.x, pin.pos.y, dispThr(28), 0, Math.PI * 2); gx.stroke(); gx.setLineDash([]); }
        }
      }
    }
    return;
  }
  $('#meshInfo').textContent = `控制点 ${li.xn}×${li.yn} · patch ${patchCountX(li.xn)}×${patchCountY(li.yn)} · 经线 ${li.sliceX.length} 条 / 纬线 ${li.sliceY.length} 条`;
  const guide=warpSession && transformWarpToolbar.active==='raster' ? transformWarpToolbar.guides() : null;
  if(guide ? !guide.visible : !$('#showCage').checked) { const preset=rasterPresetHandles();if(preset.length)drawPresetWarpHandles(ctx,preset,dispThr(4));return; }
  const P=li.points, cols=li.xn, rows=li.yn;
  const per = guide ? guide.density+1 : +$('#density').value;

  
  const iso = surfaceIsoCurves(P, cols, rows, per, 10, li.sliceX, li.sliceY);
  const all = [...iso.u, ...iso.v];
  ctx.save();
  if(guide)ctx.globalAlpha=guide.opacity/100;
  ctx.lineWidth = 1; ctx.strokeStyle = guide ? guide.color : 'rgba(0,170,255,.40)';
  for(const line of all) if(!line.isSplit) stroke(ctx, line);
  ctx.lineWidth = 2; ctx.strokeStyle = guide ? guide.color : 'rgba(0,145,255,.95)';
  for(const line of all) if(line.isSplit) stroke(ctx, line);
  ctx.restore();

  const presetHandles=rasterPresetHandles();
  if(presetHandles.length){ctx.lineWidth=dispThr(1);drawPresetWarpHandles(ctx,presetHandles,dispThr(4));return;}
  const { roles, arms } = topo();

  
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,120,255,.75)';
  for(const [ci, hi] of arms){ const a=P[ci], b=P[hi]; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }

  
  const S = Math.max(6, Math.round(8 * Math.min(1, 4/Math.max(patchCountX(cols),patchCountY(rows)) + .5)));
  P.forEach((p,i)=>{
    const picked = warpSelected(li).has(i);
    const hot = i===selPt || i===hoverPt || picked;
    if(roles[i]==='corner'){
      ctx.lineWidth=2.5; ctx.fillStyle= i===selPt || picked ? '#0091ff' : '#fff'; ctx.strokeStyle= hot ? '#f59e0b' : '#0091ff';
      const s2 = hot ? S*1.25 : S;
      ctx.beginPath(); ctx.rect(p.x-s2,p.y-s2,s2*2,s2*2); ctx.fill(); ctx.stroke();
    } else if(roles[i]==='handle'){
      ctx.lineWidth=2; ctx.fillStyle= hot ? '#f59e0b' : '#0091ff'; ctx.strokeStyle='#fff';
      ctx.beginPath(); ctx.arc(p.x,p.y,(hot?S:S*0.75),0,7); ctx.fill(); ctx.stroke();
    }
  });

  drawWarpSelection(ctx, li);
  
  if (splitPicked && !$('#splitMode').checked) {
    const ok = splitPicked.axis === 'u' ? li.sliceX.includes(splitPicked.s) : li.sliceY.includes(splitPicked.s);
    if (ok) { ctx.save(); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,145,255,.95)'; stroke(ctx, splitPicked.axis === 'u' ? isoU(splitPicked.s) : isoV(splitPicked.s)); ctx.restore(); }
    else set_splitPicked(null);
  }
  if($('#splitMode').checked && hover){
    const dir = $('#splitDir').value;
    if(hover.kill){
      ctx.save(); ctx.lineWidth=4; ctx.strokeStyle='rgba(239,68,68,.95)';
      stroke(ctx, hover.kill.axis==='u' ? isoU(li.sliceX[hover.kill.k-1]) : isoV(li.sliceY[hover.kill.k-1]));
      ctx.restore();
    } else {
      ctx.save(); ctx.lineWidth=2.5; ctx.setLineDash([10,7]); ctx.strokeStyle='rgba(245,158,11,.95)';
      if(dir!=='v') stroke(ctx, isoU(hover.U));
      if(dir!=='u') stroke(ctx, isoV(hover.V));
      ctx.restore();
    }
  }
}


export const gizmo = $('#gizmo');
installBrushGestures();                      
export function toDoc(ev){
  if (viewAngle || viewFlip || (viewParCorrect && viewPar !== 1)) { const p=stageLocal(ev.clientX,ev.clientY); return {x:p.x/zoom-padL(),y:p.y/zoom-padT()}; }
  const r = gizmo.getBoundingClientRect();
  
  return { x:(ev.clientX-r.left)/r.width*viewW() - padL(), y:(ev.clientY-r.top)/r.height*viewH() - padT() };
}
export const dispThr = dispPx;   
export let guideHoverOn = false; 
export function set_guideHoverOn(v) { return (guideHoverOn = v); }   
export let tfHoverOn = false;    
export function set_tfHoverOn(v) { return (tfHoverOn = v); }   


export function pickHandle(pt){
  let best=-1, bd=1e9; const thr = Math.max(dispThr(14), 10);
  if (li.deform) {
    deformHandles().forEach((h, i) => { const d = Math.hypot(h.p.x - pt.x, h.p.y - pt.y); if (d < bd) { bd = d; best = i; } });
    return bd <= thr ? best : -1;
  }
  const { roles } = topo();
  li.points.forEach((p,i)=>{ if(roles[i]!=='corner'&&roles[i]!=='handle') return; const d=Math.hypot(p.x-pt.x,p.y-pt.y); if(d<bd){bd=d;best=i;} });
  return bd<=thr?best:-1;
}
export let perspectiveVertexSnap = null;
export function clearPerspectiveVertexSnap(){ perspectiveVertexSnap = null; }


export function moveDeformHandle(hi, to, base){
  const h = deformHandles()[hi]; if (!h) return;
  if (h.kind === 'vertex') {
    if (!h.layout) {
      const groups = (base.constrainedSides || []).map(([a, b]) => {
        const p = base.warped[a], q = base.warped[b];
        const axis = Math.abs(p.x - q.x) <= Math.abs(p.y - q.y) ? 0 : 1;
        return [a * 2 + axis, b * 2 + axis];
      });
      const result = solvePerspectivePoints({ original: base.vertices, rest: base.warped, quads: base.quadIdx,
        vertexIndex: h.i, target: to, initial: li.deform.warped, coordinateGroups: groups });
      result.points.forEach((p, i) => { li.deform.warped[i].x = p.x; li.deform.warped[i].y = p.y; });
      return;
    }
    perspectiveVertexSnap = null;
    if (h.layout) {
      const d = li.deform;
      const samePlane = new Set(d.quadIdx.filter(q => q.includes(h.i)).flat());
      let nearest = -1, distance = Math.max(dispThr(14), 6);
      d.vertices.forEach((p, i) => {
        if (samePlane.has(i)) return;
        const delta = Math.hypot(to.x - p.x, to.y - p.y);
        if (delta < distance) { distance = delta; nearest = i; }
      });
      if (nearest >= 0) {
        to = { ...d.vertices[nearest] };
        perspectiveVertexSnap = { from: h.i, to: nearest };
      }
    }
    const dx = to.x - h.p.x, dy = to.y - h.p.y;
    h.p.x = to.x; h.p.y = to.y;
    
    if (h.layout) { const w = li.deform.warped[h.i]; if (w) { w.x += dx; w.y += dy; } rebuildPerspectiveQuadsLocal(); }
    return;
  }
  const shape = li.deform.shapes[h.j];
  shape.pins[h.i].pos = { x: to.x, y: to.y };
  applyPuppetPins(shape, base.shapes[h.j], { mode: deformOpts.mode });
}


function rebuildPerspectiveQuadsLocal(){  }


export function updatePuppetRing(pt, alt) {
  if (!alt || li?.deform?.kind !== 'puppetWarp') { set_puppetRing(null); return null; }
  let best = null, distance = Infinity;
  for (const h of deformHandles()) {
    const d = Math.hypot(pt.x - h.p.x, pt.y - h.p.y);
    if (h.kind === 'pin' && d >= dispThr(10) && d <= dispThr(40) && d < distance) { best = { j: h.j, i: h.i }; distance = d; }
  }
  set_puppetRing(best); return best;
}
export function moveSelectedPuppetPins(base, refs, anchor, to) {
  for (const j of movePuppetSelection(li.deform, base, refs, anchor, to)) applyPuppetPins(li.deform.shapes[j], base.shapes[j], { mode: deformOpts.mode });
}
export function rotateSelectedPuppetPins(base, refs, angle) {
  for (const j of rotatePuppetSelection(li.deform, base, refs, angle)) applyPuppetPins(li.deform.shapes[j], base.shapes[j], { mode: deformOpts.mode });
}
export function deleteSelectedPuppetPins() {
  const refs = selectedPins().sort((a, b) => b.j - a.j || b.i - a.i);
  if (!refs.length) return false;
  pushHistory(); for (const p of refs) removePuppetPin(li.deform, p.j, p.i);
  reapplyAllPins(); set_deformSel(null); set_selPt(-1); set_hoverPt(-1); commit(); syncDeformBar(); drawGizmo(); return true;
}
function puppetDragBase() {
  const base = cloneDeform(li.deform);
  for (let j = 0; j < base.shapes.length; j++) for (let i = 0; i < base.shapes[j].pins.length; i++)
    base.shapes[j].pins[i].rotationMode = puppetPinMode(li.deform.shapes[j].pins[i]);
  return base;
}


export function reapplyAllPins(){
  if (!li || !li.deform || li.deform.kind !== 'puppetWarp') return;
  for (const sh of li.deform.shapes) {
    if (!sh.pins.length) { sh.def = sh.orig.map(p => ({ x: p.x, y: p.y })); continue; }
    applyPuppetPins(sh, { def: sh.orig, pins: sh.pins.map(p => ({ pos: p.orig, rot: 0 })) }, { mode: deformOpts.mode });
  }
}




function pickSplitLine(pt){
  if (!li || li.deform) return null;
  const thr = Math.max(dispThr(10), 8);
  let bd = thr, k = null;
  li.sliceX.forEach((s, i) => { const d = polyDist(isoU(s), pt); if (d < bd) { bd = d; k = { axis: 'u', k: i + 1, s }; } });
  li.sliceY.forEach((s, i) => { const d = polyDist(isoV(s), pt); if (d < bd) { bd = d; k = { axis: 'v', k: i + 1, s }; } });
  return k;
}
export function removeWarpSplit(){
  if (!li || li.deform) return;
  const p = splitPicked;
  const k = p && (p.axis === 'u' ? li.sliceX.indexOf(p.s) : li.sliceY.indexOf(p.s));
  if (p && k >= 0) {
    pushHistory();
    applyMesh(p.axis === 'u' ? unsplitMeshU(li.points, li.xn, li.yn, k + 1, li.sliceX) : unsplitMeshV(li.points, li.xn, li.yn, k + 1, li.sliceY));
    set_splitPicked(null); commit(); drawGizmo();
    return;
  }
  set_splitPicked(null);
  $('#unsplitAll').onclick();
}
export function deleteWarpSelection(){
  if (!li?.points) return false;
  const selected = [...warpSelected(li)];
  if (!selected.length && selPt >= 0 && topo().roles[selPt] === 'corner') selected.push(selPt);
  const cols = li.xn, rows = li.yn;
  const xs = [...new Set(selected.map(i => i % cols).filter(c => c > 0 && c < cols - 1 && c % 3 === 0))].sort((a,b)=>b-a);
  const ys = [...new Set(selected.map(i => Math.floor(i/cols)).filter(r => r > 0 && r < rows - 1 && r % 3 === 0))].sort((a,b)=>b-a);
  if (!xs.length && !ys.length) {
    if (!splitPicked) return false;
    removeWarpSplit(); return true;
  }
  pushHistory();
  for (const c of xs) applyMesh(unsplitMeshU(li.points,li.xn,li.yn,c/3,li.sliceX));
  for (const r of ys) applyMesh(unsplitMeshV(li.points,li.xn,li.yn,r/3,li.sliceY));
  warpClear(li); set_selPt(-1); set_splitPicked(null); commit(); drawGizmo(); return true;
}
export function updateHover(pt, altKey){
  const near = nearestSurfaceParam(li.points, li.xn, li.yn, pt, 40, li.sliceX, li.sliceY);
  if(near.dist > Math.max(dispThr(30), 20)){ set_hover(null); gizmo.classList.remove('kill'); return; }
  let kill = null;
  if(altKey){                              
    const thr = Math.max(dispThr(14), 10);
    let bd = thr;
    li.sliceX.forEach((s,k)=>{ const d=polyDist(isoU(s), pt); if(d<bd){ bd=d; kill={axis:'u', k:k+1}; } });
    li.sliceY.forEach((s,k)=>{ const d=polyDist(isoV(s), pt); if(d<bd){ bd=d; kill={axis:'v', k:k+1}; } });
  }
  set_hover({ U:near.U, V:near.V, kill });
  gizmo.classList.toggle('kill', !!kill);
}




const TEMP_MOVE_TOOLS = t => (SEL_TOOLS.has(t) && t !== 'objectSelect' && t !== 'quickSelect') || PAINT_TOOLS.has(t)
  || ['gradient', 'bucket', 'eyedropper', 'colorSampler', 'text', 'textVertical', 'spotHeal', 'healBrush', 'patch', 'redEye', 'magicEraser', 'sponge'].includes(t);
export function canvasPointerDown(ev, pt){
  

  if (colorRangeState) { colorRangePick(pt); return; }
  

  if (textOverlay) {
    const hh = TEXT_TOOLS.has(docTool) && textBoxHandleAt(pt);   
    if (hh) { beginTextBoxDrag(ev, pt, hh); return; }
    closeInlineText(true); return;
  }
  

  if (!li && doc && guidesVisible && guides.length && (docTool === 'move' || ev.metaKey || ev.ctrlKey)) {
    const gi = guideHit(pt);
    if (gi >= 0) {
      set_guideDrag({ axis: guides[gi].vertical ? 'v' : 'h', px: guides[gi].px, index: gi, moved: false, onCanvas: true });
      try { gizmo.setPointerCapture(ev.pointerId); } catch {}
      drawGizmo();
      return;
    }
  }
  if (tfState) { beginMoveDrag(ev, pt); return; }   
  if (!cropState && !li && doc && docTool === 'crop' && !spaceDown) beginCrop();   
  if (cropState) { beginCropDrag(ev, pt); return; }
  
  if (adjEye.active && !li && doc) { adjEyeSampleAt(pt); return; }
  

  
  if (!li && doc && polyLasso) { polyLassoDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
  if (!li && doc && magLasso && (ev.metaKey || ev.ctrlKey)) { closeMagLasso(); return; }
  if (!li && doc && (ev.metaKey || ev.ctrlKey) && TEMP_MOVE_TOOLS(docTool)) {
    const ev2 = new Proxy(ev, { get: (t, k) => (k === 'metaKey' || k === 'ctrlKey') ? false : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
    beginMoveDrag(ev2, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    return;
  }
  if(!li && doc){                              
    
    if ((docTool === 'shape' || docTool === 'pathSelect' || docTool === 'move') && !ev.shiftKey && beginLiveRadius(ev, pt)) return;
    

    
    const altOnStop = docTool === 'gradient' && gradOpts.mode === 'gradient' && (liveGradHit(pt) || {}).kind === 'stop';
    if (ev.altKey && ALT_EYEDROP.has(docTool) && !altOnStop) { eyedropAt(pt, false); return; }
    if (docTool === 'zoom') {
      
      beginZoomGesture(ev, zoomOutMode !== !!ev.altKey);
      return;
    }
    if (docTool === 'lassoPoly') { polyLassoDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (docTool === 'lassoMagnetic') { magLassoDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (docTool === 'frame') { frameDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (docTool === 'artboard' || (docTool === 'move' && !ev.altKey && (abTitleHit(pt) >= 0 || (abGizmoOn() && (abPlusAt(pt) || abHandleAt(pt)))))) {
      
      if (docTool !== 'artboard') { const keep = abGizmoOn() ? abSel : -1; try { setDocTool('artboard'); } catch {} if (keep >= 0 && abSel < 0) set_abSel(keep); }
      artboardDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} try { syncGizmoCursor(); } catch {} return;
    }
    if (docTool === 'slice' || docTool === 'sliceSelect') {
      
      const selT = (docTool === 'sliceSelect') !== !!(ev.metaKey || ev.ctrlKey);
      if (selT) sliceSelectDown(ev, pt); else sliceDown(ev, pt);
      try { gizmo.setPointerCapture(ev.pointerId); } catch {} return;
    }
    if (docTool === 'cropPerspective') { pcropDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (docTool === 'quickSelect') { quickSelDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (docTool === 'selectionBrush') { selBrushDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (docTool === 'objectSelect') { objSelDown(ev, pt); try { gizmo.setPointerCapture(ev.pointerId); } catch {} return; }
    if (SEL_TOOLS.has(docTool)) {
      if (docTool === 'wand') { doWand(pt, effSelMode(ev)); return; }
      beginSelDrag(ev, pt); return;
    }
    if (docTool === 'mixerBrush' && ev.altKey) { loadMixerBrush(pt); syncBrushBarFor(docTool); return; }
    if (docTool === 'adjBrush') { adjBrushDown(ev, pt); return; }   
    if (PAINT_TOOLS.has(docTool)) {
      
      if (BRUSHOP_SAMPLES.has(docTool) && (ev.altKey || ev.metaKey || ev.ctrlKey)) { brushOpSample(pt); return; }
      


      const paintingRealMask = brushTarget() === 'mask'
        && !!(doc.layers[selLayer] && (doc.layers[selLayer].mask || maskPaint[selLayer]));
      if (!paintingRealMask && rasterKindOf(selLayer)) {
        rasterizeLayerUI(selLayer).then(okd => { if (okd) syncBrushPanel(); });
        return;
      }
      

      if (BRUSHOP_SAMPLES.has(docTool) && (ev.altKey || ev.metaKey || ev.ctrlKey)) { brushOpSample(pt); return; }
      
      pt.p = paintPressure(ev);
      if (ev.shiftKey && lastPaintPt && lastPaintPt.idx === selLayer && lastPaintPt.target === brushTarget() && lastPaintPt.tool === docTool) {
        
        const S = strokeLineTo(pt, true);
        if (S) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} startPaintGesture(S, ev, pt); }
        return;
      }
      const S = docTool === 'eraser' ? beginEraserStroke(pt, ev) : docTool === 'pencil' ? beginPencilStroke(pt) : BRUSHOP_TOOLS.has(docTool) ? beginBrushOpStroke(pt, ev) : beginStroke(pt, { tool: docTool });
      if (S && ACTP && ACTP.toolRecording && ACTP.toolRecording()) { S.recPts = [[Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10, pt.p !== undefined ? pt.p : 1]]; S.recTool = docTool; }   
      if (S) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} startPaintGesture(S, ev, pt); scheduleStrokeRepaint(S); }
      else { syncBrushPanel(); syncBrushOpBar(); }
      return;
    }
    
    if (docTool === 'magicEraser') { magicEraseAt(pt, ev); return; }
    if (PATH_EDIT_TOOLS.has(docTool)) { pathToolDown(ev, pt); return; }
    if (docTool === 'gradient') { beginGradDrag(ev, pt); return; }
    if (docTool === 'bucket') { bucketFill(pt); return; }
    if (docTool === 'eyedropper') {
      
      if (ev.shiftKey && !ev.altKey) { addColorSampler(pt); return; }
      eyedropDown(ev, pt); return;
    }
    if (docTool === 'shape') { beginShapeDrag(ev, pt); return; }
    if (docTool === 'pen') { penDown(ev, pt); return; }
    if (RETOUCH_TOOLS.has(docTool)) { retouchDown(ev, pt); return; }
    if (docTool === 'penFree') { freePenDown(ev, pt); return; }
    if (docTool === 'penCurvature') { curvatureDown(ev, pt); return; }
    if (AUX_TOOLS.has(docTool)) { auxDown(ev, pt); return; }
    if (docTool === 'textMask' || docTool === 'textMaskVertical') {
      
      if (maskEdit) { closeMaskEdit(true); return; }
      set_textDrag({ start: { x: pt.x, y: pt.y }, cur: { x: pt.x, y: pt.y }, alt: !!ev.altKey, mask: { vertical: docTool === 'textMaskVertical', mode: effSelMode(ev) } });
      try { gizmo.setPointerCapture(ev.pointerId); } catch {}
      return;
    }
    if (TEXT_TOOLS.has(docTool)) { textToolDown(ev, pt); return; }
  }
  if(!li){                                     
    beginMoveDrag(ev, pt);
    return;
  }
  if(li.deform){                                 
    const hi = pickHandle(pt);
    if (li.deform.kind === 'puppetWarp') {
      const ring = updatePuppetRing(pt, ev.altKey);
      if (ring) {
        selectDeformPin(ring, false, true); syncDeformBar();
        const pin = li.deform.shapes[ring.j].pins[ring.i];
        set_dragState({ mode: 'puppetRotate', center: { ...pin.pos }, from: { ...pt }, before: snapshot(), base: puppetDragBase(),
          puppetPins: selectedPins().map(({ j, i }) => ({ j, i })), moved: false });
        drawGizmo(); gizmo.classList.add('drag'); gizmo.setPointerCapture(ev.pointerId); return;
      }
      if (ev.altKey && hi >= 0) {
        const h = deformHandles()[hi];
        if (Math.hypot(pt.x-h.p.x,pt.y-h.p.y) <= dispThr(6)) {
          pushHistory(); removePuppetPin(li.deform,h.j,h.i); reapplyAllPins();
          set_deformSel(null); set_selPt(-1); commit(); syncDeformBar(); drawGizmo(); return;
        }
      }
      if (hi < 0) {
        pushHistory();
        const r = addPuppetPin(li.deform, pt, Math.max(dispThr(28), 18));
        if (r) {
          li.deform.shapes[r.j].pins[r.i].rotationMode = 'auto';
          selectDeformPin({ j: r.j, i: r.i }, !!ev.shiftKey); commit(); syncDeformBar();
          set_selPt(deformHandles().findIndex(h => h.kind === 'pin' && h.j === r.j && h.i === r.i));
        } else { set_deformSel(null); syncDeformBar(); shell.status('这里没有网格：图钉只能落在不透明区域铺出来的网格上'); }
        drawGizmo(); return;
      }
      const h = deformHandles()[hi], ref = { j: h.j, i: h.i };
      selectDeformPin(ref, !!ev.shiftKey, true); syncDeformBar();
      if (!deformPins.some(p => puppetPinKey(p) === puppetPinKey(ref))) { set_selPt(-1); drawGizmo(); return; }
      set_selPt(hi);
      set_dragState({ mode: 'deform', idx: hi, before: snapshot(), base: puppetDragBase(),
        puppetPins: selectedPins().map(({ j, i }) => ({ j, i })), puppetAnchor: ref, moved: false });
      drawGizmo(); gizmo.classList.add('drag'); gizmo.setPointerCapture(ev.pointerId); return;
    }
    if (li.deform.kind === 'perspectiveWarp' && deformTool === 'perspectiveWarp' && deformOpts.pMode === 'layout' && hi < 0) {
      const qi = perspectiveQuadAt(li.deform, pt, true);
      if (qi >= 0 && (ev.altKey || ev.metaKey || ev.ctrlKey)) {      
        pushHistory(); removePerspectiveQuad(li.deform, qi);
        set_selPt(-1); set_hoverPt(-1); commit(); syncDeformBar(); drawGizmo();
        return;
      }
      

      if (qi >= 0) {
        set_pquadMove({ qi, from: { x: pt.x, y: pt.y },
                      base: li.deform.quadIdx[qi].map(k => ({ ...li.deform.vertices[k] })),
                      baseW: li.deform.quadIdx[qi].map(k => ({ ...li.deform.warped[k] })),
                      before: snapshot(), moved: false });
        set_selPt(-1); gizmo.classList.add('drag'); gizmo.setPointerCapture(ev.pointerId);
        drawGizmo();
        return;
      }
      
      set_pquadDrag({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, snap: null });
      set_selPt(-1); gizmo.classList.add('drag'); gizmo.setPointerCapture(ev.pointerId);
      drawGizmo();
      return;
    }
    if(hi < 0){ set_selPt(-1); if (deformSel) { set_deformSel(null); syncDeformBar(); } drawGizmo(); return; }
    set_selPt(hi);
    {
      const h = deformHandles()[hi];
      set_deformSel(h && h.kind === 'pin' ? { j: h.j, i: h.i } : null);
      syncDeformBar();
    }
    clearPerspectiveVertexSnap();
    set_dragState({ mode:'deform', idx:hi, before: snapshot(), base: cloneDeform(li.deform), moved:false });
    drawGizmo(); gizmo.classList.add('drag'); gizmo.setPointerCapture(ev.pointerId);
    return;
  }

  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && !li.deform && !$('#splitMode').checked && pickHandle(pt) < 0) {
    const near = nearestSurfaceParam(li.points,li.xn,li.yn,pt,44,li.sliceX,li.sliceY);
    if (near.dist <= Math.max(dispThr(30),20)) {
      pushHistory(); const line=pickSplitLine(pt);
      if (!line || line.axis === 'v') applyMesh(splitMeshU(li.points,li.xn,li.yn,near.U,li.sliceX),{preserveAppearance:true});
      if (!line || line.axis === 'u') applyMesh(splitMeshV(li.points,li.xn,li.yn,near.V,li.sliceY),{preserveAppearance:true});
      warpClear(li); set_selPt(-1); commit(); drawGizmo(); return;
    }
  }
  if($('#splitMode').checked){                 
    updateHover(pt, ev.altKey);
    if(!hover) return;
    pushHistory();
    if(hover.kill){
      applyMesh(hover.kill.axis==='u'
        ? unsplitMeshU(li.points, li.xn, li.yn, hover.kill.k, li.sliceX)
        : unsplitMeshV(li.points, li.xn, li.yn, hover.kill.k, li.sliceY));
    } else {
      const dir = $('#splitDir').value;
      const { U, V } = hover;
      if(dir!=='v') applyMesh(splitMeshU(li.points, li.xn, li.yn, U, li.sliceX),{preserveAppearance:true});
      if(dir!=='u') applyMesh(splitMeshV(li.points, li.xn, li.yn, V, li.sliceY),{preserveAppearance:true});
    }
    set_hover(null);
    commit();
    
    if (splitOneShot) { set_splitOneShot(false); setTool(false); }
    return;
  }
  if(beginRasterPresetHandle(pt,dispThr(7))){gizmo.classList.add('drag');gizmo.setPointerCapture(ev.pointerId);drawGizmo();return;}
  set_splitPicked(pickSplitLine(pt));             

  const hi = pickHandle(pt);
  const before = snapshot();                   
  const roles = topo().roles;
  if (ev.shiftKey && (hi < 0 || roles[hi] === 'corner')) {
    if (hi >= 0) { warpSelect(li, hi, true); set_selPt(hi); drawGizmo(); return; }
    warpBeginMarquee(li, pt); set_dragState({mode:'warp-select',before,moved:false});
    gizmo.setPointerCapture(ev.pointerId); drawGizmo(); return;
  }
  if(hi>=0){                                   
    if (roles[hi] === 'corner') warpSelect(li, hi); else warpClear(li);
    set_selPt(hi);
    set_dragState({ mode:'point', idx:hi, last:pt, before, selected:[...warpSelected(li)], moved:false });
  } else {                                     
    warpClear(li);
    const near = nearestSurfaceParam(li.points, li.xn, li.yn, pt, 44, li.sliceX, li.sliceY);
    if(near.dist <= Math.max(dispThr(40), 24)){ 
      const c0 = surfacePoint(li.points, li.xn, li.yn, near.U, near.V, li.sliceX, li.sliceY);
      set_selPt(-1);
      set_dragState({ mode:'surface', U:near.U, V:near.V, c0, base: before.points, before, moved:false });
    } else { set_selPt(-1); drawGizmo(); return; }
  }
  drawGizmo();
  gizmo.classList.add('drag'); gizmo.setPointerCapture(ev.pointerId);
}


viewport.addEventListener('pointerdown', ev => {
  if(!li&&tfState?.pathWarp&&ev.button===0&&!spaceDown&&!handActive()&&(ev.target===viewport||ev.target===$('#stage'))){
    const point=toDoc(ev);if(PW.hit(point)?.kind==='preset'){beginMoveDrag(ev,point);return;}
  }
  if(li&&warpSession&&ev.button===0&&!spaceDown&&!handActive()&&(ev.target===viewport||ev.target===$('#stage'))){
    if(beginRasterPresetHandle(toDoc(ev),dispThr(7))){gizmo.classList.add('drag');gizmo.setPointerCapture(ev.pointerId);drawGizmo();return;}
  }
  if (ev.button !== 0 || li || !doc || docTool !== 'artboard' || spaceDown || handActive()) return;
  if (ev.target !== viewport && ev.target !== $('#stage')) return;
  syncPointerModifiers(ev);
  canvasPointerDown(ev, toDoc(ev));
});
gizmo.addEventListener('pointerenter', ev => { syncPointerModifiers(ev); });
gizmo.addEventListener('pointermove',ev=>{if(moveRasterPresetHandle(toDoc(ev))){ev.preventDefault();ev.stopImmediatePropagation();}},true);
gizmo.addEventListener('pointercancel',ev=>{if(cancelRasterPresetHandle()){gizmo.classList.remove('drag');ev.preventDefault();ev.stopImmediatePropagation();}},true);
addEventListener('keydown',ev=>{if(ev.key==='Escape'&&cancelRasterPresetHandle()){gizmo.classList.remove('drag');ev.preventDefault();ev.stopImmediatePropagation();}},true);


gizmo.addEventListener('pointerleave', e => { if (cursorKickEl && e.relatedTarget === cursorKickEl) e.stopImmediatePropagation(); }, true);
gizmo.addEventListener('pointerleave', () => { if (abHoverCur && !abState) { set_abHoverCur(''); syncGizmoCursor(); } });
gizmo.addEventListener('pointerdown', ev=>{
  syncPointerModifiers(ev);
  if(spaceDown || handActive()) return;
  
  if (ev.button === 2 && !li && (SEL_TOOLS.has(docTool) || polyLasso || magLasso)) return;
  canvasPointerDown(ev, toDoc(ev));
});




gizmo.addEventListener('mousedown', ev => {
  if (!(textOverlay || (!li && doc && (docTool === 'text' || docTool === 'textVertical')))) return;
  
  const ae = document.activeElement;
  if (ae && ae !== (textOverlay && textOverlay.ta) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) ae.blur();
  ev.preventDefault();
});
