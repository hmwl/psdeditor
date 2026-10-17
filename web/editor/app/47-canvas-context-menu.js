




import './46-smart-filter-panel.js';   
import { setTextLayerMeta, parsePsdFull } from '../../../core/app.js';
import { patchPlacedTransform } from '../../../core/psd-edit-smart.js';
import { layoutRichText } from '../../../core/psd-text.js';
import { actions } from '../actions.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $ } from './01-boot.js';
import {
  doc, fontCache, guidesVisible, layerDeletes, layerRenames, layerTextEdits, layerTree, li, notesVisible,
  selection, set_textOverlay, sos, textCrops, textFontSubst, textOverlay, textRenders, textStyleEdits,
} from './02-doc-state.js';
import {
  docHistory, docSnapshot, histCap, histLog, histPush, restoreDocSnapshot, revealPropsPanel, set_propTab,
  structuralApply, syncHistoryPanel, syncPropTabs, updateUndoButtons,
} from './03-history.js';
import { fitStage, nextZoomStep, padL, padT, setZoom, set_zoom, set_zoomFitMode, zoom } from './04-view-chrome.js';
import { zoomAtClient } from './05-layer-lock-guides.js';
import { spaceDown } from './06-view-zoom-move.js';
import { syncThumbTargets } from './07-nav-histogram.js';
import { isTextLayer, syncTextBar } from './09-text-tool.js';
import {
  CROP_PRESETS, cancelCrop, commitCrop, cropApplyPreset, cropOpts, cropQuad, cropResetBox, cropState,
  cropSwapOrientation,
} from './10-crop.js';
import { bucketOpts, eyeOpts, saveEyeOpts } from './11-paint-common.js';
import { copyEyeHex, openGradPicker, syncBucketBar, syncEyeBar } from './15-gradient-bucket-eyedropper.js';
import { PATH_OP_LIST, SHAPE_KINDS, cancelPen, commitPen, penState, shapeOpts, syncShapeBar } from './17-shape-pen.js';
import { beginFreeTransform, cancelFreeTransform, commitFreeTransform, tfState } from './19-free-transform.js';
import { duplicateLayerUI, hitLayerAt, openInside, pointInQuadLocal } from './20-snap-smart-object.js';
import { matchLayer } from './22-deform-tools.js';
import {
  ctxItem, layerCanvasCache, layerCtx, renderLayerPanel, rowEls, selLayer, selLayers, set_selLayer,
  showLayerCtx, thumbCache,
} from './23-layers-panel.js';
import { renderProps } from './24-layer-ops-queue.js';
import { transformBase, transformChanged } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import { paintStates, renderStaticLayers } from './30-render.js';
import {
  NOTESP, PAINT_TOOLS, SEL_TOOLS, TEXT_TOOLS, brush, docTool, fillStage, moveOpts, noteAt, setDocTool,
  setViewAngle, syncMoveBar, viewAngle,
} from './31-selection-brush.js';
import { makeWorkPathFromSelectionUI, set_textBoxHover } from './32-cursors-select-options.js';
import { closeMagLasso, closePolyLasso, magLasso, osHover, polyLasso, set_osHover } from './33-lasso-quick-select.js';
import { sliceHit, sliceOptionsUI, sliceSel } from './34-perspective-crop-slice.js';
import { drawGizmo, gizmo, toDoc } from './46-smart-filter-panel.js';
import { bindTextEditGestures, dispTextOf, textBoxDrag, textEditShortcut, textIndexAt } from './48-info-export.js';
import {
  effTextInfo, fontPop, renderTextLayer, resolveFont, runCanvasFont, textLayoutApi, textModelOf,
} from './49-fonts-text-model.js';
import { textDescEdits } from './52-alpha-text-menu.js';
import {
  CPP, bindRichTextPointer, effTextPath, layoutInlinePathText, markInlineRich, otFamilySync,
} from './57-layer-style-text-path.js';






export function ctxSep(){
  const hr = document.createElement('div');
  hr.style.cssText = 'height:1px;margin:3px 6px;background:#4a4a4b';
  layerCtx.appendChild(hr);
}
function ctxTitle(text){
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText = 'padding:4px 10px 2px;font-size:11px;color:var(--muted)';
  layerCtx.appendChild(t);
}

export function layersUnder(pt){
  const out = [];
  if (!doc) return out;
  const st = paintStates();
  for (const i of displayOrder().slice().reverse()) {
    if (st.hidden.has(i) || layerDeletes.has(i)) continue;
    if (hitLayerAt(pt.x, pt.y, { only: i }) >= 0) out.push(i);   
    if (out.length >= 12) break;
  }
  return out;
}
export function openCanvasCtx(e, pt){
  if (!doc || li) return;
  e.preventDefault(); e.stopPropagation();
  
  if (docTool === 'gradient' && !tfState) { openGradPicker({ left: e.clientX, top: e.clientY, bottom: e.clientY }); return; }
  layerCtx.innerHTML = '';
  if (tfState) {                                 
    const items = [['自由变换', 'edit.freeTransform'], ['缩放', 'edit.transform.scale'], ['旋转', 'edit.transform.rotate'], ['斜切', 'edit.transform.skew'],
      ['扭曲', 'edit.transform.distort'], ['透视', 'edit.transform.perspective'], ['变形', 'edit.transform.warp'], null,
      ['旋转 180 度', 'edit.transform.rotate180'], ['顺时针旋转 90 度', 'edit.transform.rotate90cw'], ['逆时针旋转 90 度', 'edit.transform.rotate90ccw'], null,
      ['水平翻转', 'edit.transform.flipH'], ['垂直翻转', 'edit.transform.flipV']];
    for (const it of items) {
      if (!it) { ctxSep(); continue; }
      if (actions.has && !actions.has(it[1])) continue;
      if (actions.enabled && !actions.enabled(it[1])) continue;
      ctxItem(it[0], () => actions.run(it[1]));
    }
    ctxSep();
    ctxItem('提交（Enter）', () => commitFreeTransform());
    ctxItem('取消（Esc）', () => cancelFreeTransform(), true);
    showLayerCtx();
    const r = layerCtx.getBoundingClientRect();
    layerCtx.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
    layerCtx.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
    return;
  }
  
  const nameOf = i => layerRenames[i]
    || (layerTree && layerTree.flat[i] && layerTree.flat[i].name)
    || (doc.layers[i] && (doc.layers[i].unicodeName || doc.layers[i].name)) || ('图层 ' + i);

  if (docTool === 'move') {
    const unders = layersUnder(pt);
    if (unders.length) {
      ctxTitle('这一点下面的图层（由上到下）');
      for (const i of unders)
        ctxItem((i === selLayer ? '✓ ' : '　') + nameOf(i), () => { set_selLayer(i); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo(); });
      ctxSep();
    } else ctxTitle('这一点下面没有不透明的图层');
    if (selLayer >= 0) {
      ctxItem('复制图层（⌘J）', () => duplicateLayerUI(selLayer));
      ctxItem('自由变换（⌘T）', () => beginFreeTransform());
      ctxItem(moveOpts.showTf ? '隐藏变换控件' : '显示变换控件', () => {
        moveOpts.showTf = !moveOpts.showTf; syncMoveBar(); drawGizmo();
      });
    }
    ctxItem(moveOpts.auto ? '关闭自动选择' : '打开自动选择', () => { moveOpts.auto = !moveOpts.auto; syncMoveBar(); });
  } else if (SEL_TOOLS.has(docTool)) {
    


    const act = (label, id, fn) => {
      const ok = !actions.has || actions.has(id) ? (!actions.enabled || actions.enabled(id)) : false;
      ctxItem(label, fn || (() => actions.run(id)));
      const el = layerCtx.lastElementChild;
      if (!ok && el) { el.classList.add('disabled'); el.onclick = null; el.style.opacity = '.45'; el.style.pointerEvents = 'none'; }
    };
    if (selection) {
      act('取消选择', 'select.none');
      act('选择反向', 'select.inverse');
      ctxSep();
      act('羽化…', 'select.feather');
      act('选择并遮住…', 'select.selectAndMask');
      ctxSep();
      act('存储选区…', 'select.save');
      ctxItem('建立工作路径…', () => makeWorkPathFromSelectionUI());
      ctxSep();
      act('通过拷贝的图层', 'layer.viaCopy');
      act('通过剪切的图层', 'layer.viaCut');
      act('新建图层…', 'layer.new');
      ctxSep();
      act('自由变换', 'edit.freeTransform');
      act('变换选区', 'select.transform');
      ctxSep();
      act('填充…', 'edit.fill');
      act('描边…', 'edit.stroke');
      ctxSep();
      act('存储为图层蒙版', 'layer.mask.revealSelection');
    } else {
      act('全选', 'select.all');
      act('重新选择', 'select.reselect');
      act('选择主体', 'select.subject');
      act('色彩范围…', 'select.colorRange');
      ctxSep();
      act('新建图层…', 'layer.new');
      act('自由变换', 'edit.freeTransform');
      act('填充…', 'edit.fill');
    }
  } else if (PAINT_TOOLS.has(docTool)) {
    ctxTitle(`笔尖 ${Math.round(brush.size)} px · 硬度 ${Math.round(brush.hardness * 100)}%`);
    for (const n of [5, 13, 30, 60, 120, 250])
      ctxItem(`大小 ${n} px`, () => { const s = $('#brSize'); s.value = String(n); s.oninput(); drawGizmo(); });
    ctxSep();
    ctxItem('硬边（100%）', () => { const h = $('#brHard'); h.value = '100'; h.oninput(); drawGizmo(); });
    ctxItem('柔边（0%）', () => { const h = $('#brHard'); h.value = '0'; h.oninput(); drawGizmo(); });
  } else if (docTool === 'shape' || docTool === 'pen') {
    ctxTitle(docTool === 'pen' ? '钢笔（形状模式）' : (SHAPE_KINDS[shapeOpts.kind] || '形状') + '工具');
    if (penState) {
      ctxItem(`闭合路径（${penState.pts.length} 个锚点）`, () => commitPen());
      ctxItem('放弃这条路径（Esc）', () => cancelPen(), true);
      ctxSep();
    }
    for (const o of PATH_OP_LIST)
      ctxItem((shapeOpts.pathOp === o.value ? '✓ ' : '　') + o.label, () => { shapeOpts.pathOp = o.value; syncShapeBar(); });
  } else if (docTool === 'bucket') {
    ctxTitle(`容差 ${bucketOpts.tolerance}`);
    for (const n of [0, 8, 32, 64, 128, 255])
      ctxItem((bucketOpts.tolerance === n ? '✓ ' : '　') + `容差 ${n}`, () => { bucketOpts.tolerance = n; syncBucketBar(); });
    ctxSep();
    ctxItem((bucketOpts.contiguous ? '✓ ' : '　') + '连续的', () => { bucketOpts.contiguous = !bucketOpts.contiguous; syncBucketBar(); });
  } else if (docTool === 'eyedropper') {
    
    for (const n of [1, 3, 5, 11, 31, 51, 101])
      ctxItem((eyeOpts.size === n ? '✓ ' : '　') + (n === 1 ? '取样点' : `${n} × ${n} 平均`), () => { eyeOpts.size = n; saveEyeOpts(); syncEyeBar(); });
    ctxSep();
    ctxItem('拷贝颜色的 HTML 代码', () => copyEyeHex(true));
    ctxItem('拷贝颜色的十六进制代码', () => copyEyeHex(false));
  } else if (docTool === 'zoom' || docTool === 'hand' || docTool === 'rotateView') {
    
    ctxItem('100%（⌘1）', () => { set_zoomFitMode(false); set_zoom(1); fitStage(); });
    ctxItem('200%', () => setZoom(2));
    ctxItem('按屏幕大小缩放（⌘0）', () => fitStage(true, { fitCap: 32 }));
    ctxItem('填充屏幕', () => fillStage());
    ctxItem('打印尺寸', () => actions.run('view.printSize'));
    ctxSep();
    ctxItem('放大（⌘+）', () => zoomAtClient(e.clientX, e.clientY, nextZoomStep(1)));
    ctxItem('缩小（⌘−）', () => zoomAtClient(e.clientX, e.clientY, nextZoomStep(-1)));
    if (docTool === 'rotateView' && viewAngle) { ctxSep(); ctxItem('复位视图（Esc）', () => setViewAngle(0)); }
  } else if (docTool === 'crop' && cropState) {
    
    ctxItem('裁剪（Enter）', () => commitCrop(true));
    ctxItem('取消裁剪（Esc）', () => cancelCrop(true));
    ctxSep();
    for (const v of ['ratio', 'orig', '1:1', '4:5', '5:7', '2:3', '16:9', 'front']) {
      const p = CROP_PRESETS.find(q => q.value === v);
      ctxItem((cropOpts.preset === v ? '✓ ' : '　') + p.label, () => cropApplyPreset(v));
    }
    ctxSep();
    ctxItem('旋转裁剪框（X）', () => cropSwapOrientation());
    ctxItem('复位裁剪框', () => cropResetBox());
  } else if (docTool === 'text' || docTool === 'textVertical') {
    ctxItem('编辑文字内容', () => { if (isTextLayer(selLayer)) openInlineTextEditor(selLayer); });
  } else {
    ctxTitle('这个工具还没有右键菜单');
  }
  if (!layerCtx.children.length) return;
  showLayerCtx();
  const r = layerCtx.getBoundingClientRect();
  layerCtx.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  layerCtx.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
}
gizmo.addEventListener('contextmenu', e => openCanvasCtx(e, toDoc(e)));

gizmo.addEventListener('pointerleave', () => { if (osHover) { set_osHover(0); drawGizmo(); } });




gizmo.addEventListener('dblclick', ev=>{
  if (tfState) { commitFreeTransform(); return; }   
  if (cropState) { const p = toDoc(ev); if (pointInQuadLocal(cropQuad(), p.x, p.y)) commitCrop(true); return; }   
  if (!li && doc && docTool === 'sliceSelect' && sliceSel >= 0) { const h = sliceHit(toDoc(ev)); if (h && h.kind === 'user' && h.at === sliceSel) { sliceOptionsUI(); return; } }   
  if (magLasso) { ev.preventDefault(); closeMagLasso(); return; }   
  if (polyLasso) { ev.preventDefault(); closePolyLasso(); return; } 
  if (li || spaceDown || !doc) return;
  const pt = toDoc(ev);
  if (NOTESP && guidesVisible && notesVisible) { const na = noteAt(pt); if (na >= 0) { NOTESP.select(na, { focus: true }); return; } }   
  const hit = hitLayerAt(pt.x, pt.y);
  if (hit >= 0 && layerTree && layerTree.flat[hit] && layerTree.flat[hit].isSmartObject) {
    const soIdx = sos.findIndex(so => matchLayer(so) === hit);
    if (soIdx >= 0) openInside(soIdx);
    return;
  }
  if (hit >= 0 && hit !== selLayer) {                 
    const prev = selLayer;
    set_selLayer(hit);
    if (prev >= 0 && rowEls[prev]) rowEls[prev].classList.remove('sel');
    if (rowEls[hit]) rowEls[hit].classList.add('sel');
    syncThumbTargets();
    renderProps();
  }
  if (hit >= 0 && layerTree.flat[hit] && layerTree.flat[hit].text && layerTree.flat[hit].text.content != null) {
    openInlineTextEditor(hit);                        
    return;
  }
  if (hit >= 0) openTextEditor(hit);
});



export function openTextEditor(idx){
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!L || !L.text || L.text.content == null) return false;
  revealPropsPanel();
  set_propTab('character'); syncPropTabs();
  renderProps();
  const ta = $('#props textarea');
  if (ta) { const d = ta.closest('details'); if (d) d.open = true; ta.focus(); try { ta.select(); } catch {} }
  return true;
}









export const affMul = (M, N) => [M[0] * N[0] + M[2] * N[1], M[1] * N[0] + M[3] * N[1], M[0] * N[2] + M[2] * N[3], M[1] * N[2] + M[3] * N[3],
  M[0] * N[4] + M[2] * N[5] + M[4], M[1] * N[4] + M[3] * N[5] + M[5]];



export function writeTextTransform(buf, viewIdx, fileIdx, notes, srcIdx = viewIdx){
  const L = layerTree && layerTree.flat && layerTree.flat[srcIdx];
  if (!L || !L.text || !transformChanged(viewIdx)) return buf;
  try {
    const M = textDisplayMatrix(viewIdx, effTextInfo(srcIdx, L));
    if (!M.every(Number.isFinite) || Math.abs(M[0] * M[3] - M[1] * M[2]) < 1e-9) return buf;
    notes.textTransforms = (notes.textTransforms || 0) + 1;
    return setTextLayerMeta(buf, fileIdx, { transform: M });
  } catch (e) { notes.skipped.push(`文字层 ${fileIdx} 变换矩阵写回：${e.message}`); return buf; }
}

export function textDisplayMatrix(idx, info){
  const T = (info.transform || [1, 0, 0, 1, 0, 0]).slice(0, 6);
  const U = layerTransformAffine(idx);
  return U ? affMul(U, T) : T;
}

export function layerTransformAffine(idx){
  const t = transformChanged(idx);
  if (!t) return null;
  const b = transformBase(idx);
  if (!(b.w > 0 && b.h > 0)) return null;
  let U;
  if (t.quad) {                                                   
    const [q0, q1, , q3] = t.quad;
    const a = (q1[0] - q0[0]) / b.w, bb = (q1[1] - q0[1]) / b.w, c = (q3[0] - q0[0]) / b.h, d = (q3[1] - q0[1]) / b.h;
    U = [a, bb, c, d, q0[0] - a * b.x - c * b.y, q0[1] - bb * b.x - d * b.y];
  } else {
    const rad = (t.rot || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const sx = (t.w / b.w) * (t.flipX ? -1 : 1), sy = (t.h / b.h) * (t.flipY ? -1 : 1);
    const R = [cos, sin, -sin, cos, t.x + t.w / 2, t.y + t.h / 2];
    U = affMul(R, affMul([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -(b.x + b.w / 2), -(b.y + b.h / 2)]));
  }
  return U;
}


export function writeSoPlacement(buf, viewIdx, fileIdx, notes, srcIdx = viewIdx){
  const U = layerTransformAffine(viewIdx);
  if (!U) return buf;
  const so = sos.find(s2 => matchLayer(s2) === srcIdx);
  const q = so && so.info && so.info.layerInfo && so.info.layerInfo.placementQuad;
  if (!q || q.length !== 4) return buf;
  try {
    const quad = q.flatMap(p => [U[0] * p.x + U[2] * p.y + U[4], U[1] * p.x + U[3] * p.y + U[5]]);
    const lay = parsePsdFull(buf).layers[fileIdx];
    notes.soPlacements = (notes.soPlacements || 0) + 1;
    return patchPlacedTransform(buf, lay, quad);
  } catch (e) { notes.skipped.push(`智能对象 ${fileIdx} 放置四点写回：${e.message}`); return buf; }
}

export const textOwnRaster = i => { const dl = doc && doc.layers[i]; return !!(dl && dl.rgba && dl.width > 0 && dl.height > 0); };

const textRenderDroppable = i => textOwnRaster(i) && layerTextEdits[i] == null && !textStyleEdits[i] && !textDescEdits[i] && !textFontSubst[i];
function dropTextRender(i){ delete textRenders[i]; delete textCrops[i]; delete thumbCache[i]; delete layerCanvasCache[i]; }
export let textMeasureCtx = null;
export function set_textMeasureCtx(v) { return (textMeasureCtx = v); }   



export function layoutInlineText(){
  const o = textOverlay; if (!o) return;
  const { idx, ta, L } = o;
  if (effTextPath(idx)) { layoutInlinePathText(o); return; }   
  const info = effTextInfo(idx, L); if (!info) return;
  const model = textModelOf(idx, L); if (!model) return;
  model.text = ta.value.replace(/\n$/, '');
  if (model.runs.length) { model.runs[model.runs.length - 1].to = Math.max(model.runs[model.runs.length - 1].to, model.text.length); }
  const run0 = model.runs[0];
  const css = run0.css || o.css || (fontCache[run0.font] && fontCache[run0.font].ok ? fontCache[run0.font].css : null);
  const size = run0.fontSize || 12;
  const K = size < 16 ? 16 / size : 1;                  
  if (!textMeasureCtx) { try { textMeasureCtx = document.createElement('canvas').getContext('2d'); } catch {} }
  const mc = textMeasureCtx;
  const cssMap = new Map(model.runs.map(r => [r, otFamilySync(r, r.css || (fontCache[r.font] && fontCache[r.font].ok ? fontCache[r.font].css : css))]));
  const api = mc && typeof mc.measureText === 'function' ? textLayoutApi(mc, cssMap)
    : { measure: (t, r, sc) => String(t).length * r.fontSize * sc * 0.6, metrics: (r, sc) => ({ ascent: r.fontSize * sc * 0.88, descent: r.fontSize * sc * 0.12 }) };
  const lay = layoutRichText({ ...model, text: model.text || ' ' }, api);
  const l0 = lay.lines[0] || { y: 0, x: 0, w: 0, lead: size * 1.2, ascent: size * 0.88, descent: size * 0.12 };
  const lineH = (lay.lines[1] && lay.lines[1].lead) || l0.lead || size * 1.2;
  const fm = api.metrics(run0, 1);
  const half = (lineH - (fm.ascent + fm.descent)) / 2;
  const nLines = Math.max(1, ta.value.split('\n').length, lay.lines.length);
  let top = l0.y - fm.ascent - half;
  const J = model.paragraphs[0] ? model.paragraphs[0].justification : 0;
  let left, width, height;
  if (info.shape === 'box' && info.box) {
    const [bl, bt, br, bb] = info.box;
    left = bl; width = Math.max(1, br - bl);
    height = Math.max(lineH, bb - top);                 
    ta.style.whiteSpace = 'pre-wrap'; ta.style.overflowWrap = 'anywhere';
    ta.classList.add('box');
  } else {
    const [bx] = info.pointBase || [0, 0];
    const maxW = lay.lines.reduce((m, ln) => Math.max(m, ln.w), 0);
    width = Math.max(size, maxW) + size;                
    left = J === 2 ? bx - width / 2 : J === 1 ? bx - width + size / 2 : bx;
    height = nLines * lineH;
    ta.style.whiteSpace = 'pre';
    ta.classList.remove('box');
  }
  if (info.orientation === 'vertical') {
    top = info.shape === 'box' && info.box ? info.box[1] : (info.pointBase?.[1] || 0);
    left = info.shape === 'box' && info.box ? info.box[0] : (lay.bounds?.left ?? 0);
    width = info.shape === 'box' && info.box ? info.box[2]-info.box[0] : Math.max(size, (lay.bounds?.right ?? size)-left);
    height = info.shape === 'box' && info.box ? info.box[3]-info.box[1] : Math.max(size*2, (lay.bounds?.bottom ?? size) - (info.pointBase?.[1] || 0) + size);
  }
  const M = affMul(textDisplayMatrix(idx, info), [(run0.hScale || 1) / K, 0, 0, (run0.vScale || 1) / K, left, top]);
  const z = zoom || 1;
  Object.assign(ta.style, {
    writingMode: info.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb', textOrientation: 'upright',
    left: '0px', top: '0px', transformOrigin: '0 0',
    width: Math.ceil(width * K / (run0.hScale || 1)) + 'px', height: Math.ceil(height * K) + 'px',
    font: runCanvasFont(run0, css, 1, K),
    lineHeight: (lineH * K) + 'px',
    letterSpacing: ((run0.tracking || 0) / 1000 * size * K) + 'px',
    textIndent: ((model.paragraphs[0] && model.paragraphs[0].firstLineIndent) || 0) * K + 'px',
    textAlign: J === 2 || J === 5 ? 'center' : J === 1 || J === 4 ? 'right' : J >= 3 ? 'justify' : 'left',
    transform: `matrix(${M[0] * z},${M[1] * z},${M[2] * z},${M[3] * z},${(M[4] + padL()) * z},${(M[5] + padT()) * z})`,   
    caretColor: (() => { const [r, g, bl] = run0.color || [0, 0, 0, 1]; return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(bl * 255)})`; })(),
  });
  o.lastZoom = z;
  markInlineRich(o, model, info);                          
}
export async function openInlineTextEditor(idx, opts = {}){
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  const dl = doc.layers[idx];
  const info = L && L.text;
  if (!L || !info || info.content == null || !dl) return false;
  if (textOverlay) closeInlineText(true);
  if (!TEXT_TOOLS.has(docTool) && !li) setDocTool(info.orientation === 'vertical' ? 'textVertical' : 'text');        
  
  let css = null;
  const sub = textFontSubst[idx];
  if (sub) css = sub.css;
  else if (info.font && fontCache[info.font] && fontCache[info.font].ok) css = fontCache[info.font].css;
  else if (info.font) { const r = await resolveFont(info.font); if (r && r.ok) css = r.css; }
  

  if (!textRenders[idx] && !textOwnRaster(idx)) {
    const okd = await renderTextLayer(idx, L, { silent: true });
    if (okd !== false) renderStaticLayers();
  }
  const ta = document.createElement('textarea');
  ta.id = 'textOverlay';
  ta.spellcheck = false;
  ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocorrect', 'off'); ta.setAttribute('autocapitalize', 'off');
  ta.value = dispTextOf(idx, L);
  $('#stage').appendChild(ta);
  const orig = ta.value;
  if (opts.fresh) ta.value = '';                         
  set_textOverlay({ idx, ta, orig, snap: docSnapshot(), L, committed: false, css, fresh: opts.fresh || null });
  layoutInlineText();
  syncTextBar();
  try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
  
  if (opts.caret && !opts.fresh) { const k = textIndexAt(idx, opts.caret); try { ta.setSelectionRange(k, k); } catch {} }
  else { try { ta.select(); } catch {} }
  
  ta.addEventListener('beforeinput', e => {
    if (!PREF.get('type.smartQuotes') || e.inputType !== 'insertText' || (e.data !== '"' && e.data !== "'")) return;
    const prev = ta.value[(ta.selectionStart || 0) - 1] || '';
    const open = !prev || /[\s(\[{<（【《「『“‘]/.test(prev);
    const ch = e.data === '"' ? (open ? '\u201c' : '\u201d') : (open ? '\u2018' : '\u2019');
    e.preventDefault();
    if (!document.execCommand('insertText', false, ch)) { const a = ta.selectionStart, b = ta.selectionEnd; ta.setRangeText(ch, a, b, 'end'); ta.dispatchEvent(new Event('input')); }
  });
  bindTextEditGestures(ta, () => textOverlay && textOverlay.ta === ta ? textOverlay.idx : -1);
  bindRichTextPointer(ta, () => textOverlay && textOverlay.ta === ta ? textOverlay.idx : -1);   
  let seq = 0;
  ta.oninput = async () => {
    const my = ++seq;
    layoutInlineText();                                    
    const t = ta.value.replace(/\n$/, '');
    if (t && t !== info.content) layerTextEdits[idx] = t;
    else delete layerTextEdits[idx];
    if (textRenderDroppable(idx)) dropTextRender(idx);     
    else { const d0 = doc; await renderTextLayer(idx, L, { silent: true }); if (doc !== d0) return; }
    if (my !== seq || !textOverlay || textOverlay.ta !== ta) return;
    renderStaticLayers(); renderProps();
    layoutInlineText();                                    
  };
  ta.onkeydown = e => {
    e.stopPropagation();                                   
    
    if (e.key === 'Escape') { e.preventDefault(); closeInlineText(true); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.code === 'NumpadEnter')) { e.preventDefault(); closeInlineText(true); return; }
    if (CPP && CPP.isToggleKey(e)) { e.preventDefault(); CPP.toggle(); return; }   
    if (textEditShortcut(e, idx)) e.preventDefault();
  };
  
  ta.onblur = e => {
    const to = e && e.relatedTarget;
    const KEEP = '#grpText, .fontpop, #fontDlg, [data-prop-pane="character"], .tx-grid, .tx-toggles, .txs-panel, .txg-panel, .cp-panel';   
    if (to && to.closest && to.closest(KEEP)) return;
    setTimeout(() => {
      if (!textOverlay || textOverlay.ta !== ta) return;
      const ae = document.activeElement;
      if (ae === ta || fontPop || textOverlay.hold || textBoxDrag || document.querySelector('.menu-pop.panel-menu') || (ae && ae.closest && ae.closest(KEEP + ', .fp-dlg'))) return;
      closeInlineText(true);
    }, 0);
  };
  return true;
}
export function closeInlineText(commit){
  if (!textOverlay) return;
  const { idx, ta, orig, snap, L, fresh, dirty } = textOverlay;
  const t = ta.value.replace(/\n$/, '');
  set_textOverlay(null); ta.remove(); set_textBoxHover(null);
  drawGizmo();                                             
  try { syncTextBar(); } catch {}
  

  if (fresh && (!t.trim() || !commit)) {
    try {
      structuralApply(fresh);
      const top = docHistory.undo[docHistory.undo.length - 1];
      if (top && top.reload === fresh) docHistory.undo.pop();
      histLog.items = fresh.hist.items.slice(); histLog.cursor = fresh.hist.cursor;
      syncHistoryPanel(); updateUndoButtons();
      shell.status(commit ? '没有输入文字：不新建文字图层' : '已取消：不新建文字图层');
    } catch (e) { $('#err').textContent = '撤掉空文字图层没能完成：' + (e && e.message || e); }
    return;
  }
  if (fresh && t !== orig) {
    
    const curName0 = layerRenames[idx] != null ? layerRenames[idx] : (L.name || '');
    if (curName0 === '文字' || curName0 === '段落文字' || curName0 === orig) layerRenames[idx] = t.replace(/\s+/g, ' ').slice(0, 64);
    updateUndoButtons(); renderLayerPanel(); renderProps();
    return;
  }
  if (!commit && dirty) {                                   
    restoreDocSnapshot(snap);
    renderStaticLayers(); renderLayerPanel(); renderProps(); syncTextBar(); updateUndoButtons();
    return;
  }
  if (!commit || (t === orig && !dirty)) {                 
    if (t !== orig) {
      if (orig && orig !== L.text.content) layerTextEdits[idx] = orig;
      else delete layerTextEdits[idx];
      if (textRenderDroppable(idx)) { dropTextRender(idx); renderStaticLayers(); renderProps(); }
      else { const d0 = doc; renderTextLayer(idx, L, { silent: true }).then(() => { if (doc === d0 && doc) { renderStaticLayers(); renderProps(); } }); }
    }
    return;
  }
  docHistory.undo.push(snap);
  if (docHistory.undo.length > histCap()) docHistory.undo.shift();
  docHistory.redo.length = 0;
  

  histPush('文字', 'doc');
  

  const curName = layerRenames[idx] != null ? layerRenames[idx] : (L.name || '');
  if (t && curName === orig) layerRenames[idx] = t;
  updateUndoButtons(); renderLayerPanel(); renderProps();
}
