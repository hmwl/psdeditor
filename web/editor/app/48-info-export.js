




import './47-canvas-context-menu.js';   
import { compositeCMYK } from '../../../core/cmyk-compose.js';
import { puppetAngleDelta } from '../puppet-interaction.js';
import {
  parseSmartObjects, smartObjectFragment, replacePlacedBlocks, parsePsdRaster, rebuildPsdReplacingLayerPixels,
  rebuildPsdChannels, replacePsdCompositeImage, writeLayerProperties, renameLayer, reorderLayers, editLayerText,
  setEngineFont, setTextLayerMeta, parsePsdFull, setEngineText, compositeAll, flatten, lintPsd,
  buildFilterEffectsPatch, writeThumbnail, resourceHandler, writeImageResource, removeImageResource,
  syncLayerCountResources, pruneOrphanLinkedFiles,
  layerRasterSig,
} from '../../../core/app.js';
import { weldPerspectiveEdges } from '../../../core/deform-create.js';
import { translateWarpControls } from '../../../core/warp-control-selection.js';
import { warpUpdateMarquee, warpEndMarquee, warpSelected, warpClear } from '../warp-selection.js';
import { transformWarpToolbar } from '../transform-warp-toolbar.js';
import { readLinkGroups, writeLinkGroups } from '../../../core/psd-links.js';
import {
  setEngineStyle, layoutRichText, setEngineParagraphBox, setEnginePointText, buildDynamicTextDesc,
  buildPsdEditorTextDesc,
} from '../../../core/psd-text.js';
import { indexAtPoint } from '../../../core/text-caret.js';
import { buildTextOnPathDesc, setEnginePathFallback } from '../../../core/text-path.js';
import { segsEmpty, splitPrivate, applyRangeStyles, writeStyleSheets } from '../../../core/text-styles.js';
import { fragmentToJSON } from '../api-client.js';
import { toolCursor, rotCursorName } from '../icons.js';
import { DOC_EXT } from '../layerb.js';
import { encodePathName } from '../path-name-codec.js';
import { presets, injectLibPatterns } from '../presets-panels.js';
import { shell } from '../shell.js';
import {
  $, EDIT, EDITM, NEWDOC, addPerspectiveQuad, api, applyEdits, cloneDeform, deformToJSON, dragSurfacePoint,
  freshLayerInfo, moveControlPoint, needsQuiltRewrite, pngFilename, renderWarp,
} from './01-boot.js';
import {
  CM, brushHistory, cur, curStroke, doc, docH, docName, docStack, docW, dragState, fontCache, globalLight,
  globalLightDirty, guideDrag, guides, guidesDirty, guidesGrid, guidesVisible, history, hover, hoverPt,
  layerDeletes, layerDupes, layerEdits, layerOps, layerRenames, layerReorder, layerTextEdits, layerTransforms,
  layerTree, li, origBuffer, pixelPaint, pushHistory, restore, rulersVisible, selDrag, selPt, selection,
  set_dragState, set_guidesDirty, set_hover, set_hoverPt, set_proofOn, set_selDrag, set_selPathCache, set_selPt,
  set_selection, soBaked, soEdits, soOrigRaster, soRepl, sos, textCrops, textDrag, textFontSubst, textOverlay,
  textRenders, textStyleEdits, vpDirty, vpMod, vpPlanesDoc,
} from './02-doc-state.js';
import {
  HXP, actRecord, backend, endLayerEdit, histCap, histLog, panelPropsEl, propTab, pushDocHistory,
  revealPropsPanel, set_propTab, syncPropTabs, updateUndoButtons,
} from './03-history.js';
import { rulerPos, setTool, set_rulerPos, syncRulers } from './04-view-chrome.js';
import { commitGuideDrag, guideHit } from './05-layer-lock-guides.js';
import {
  birdEye, commit, deformHandles, panState, set_panState, set_spaceDown, spaceDown, tfFrame, tfHandleCursor,
  tfRotateCursor, updatePanCursor, zoomGest,
} from './06-view-zoom-move.js';
import { INFOP, cancelMoveDrag, endMoveDrag, moveDrag, moveMoveDrag, refreshMoveHover } from './07-nav-histogram.js';
import {
  docImageResources, docResolution, docResolutionBase, docSizeBase, pendingCropDelete, readResolution,
  resolutionInfoBytes,
} from './08-doc-size.js';
import {
  applyTextStyle, isTextLayer, moveTextDrag, textEffSegs, textInfoOf, textLayerAt, textToolUp,
} from './09-text-tool.js';
import {
  cancelCrop, clampCropRect, commitCrop, cropCycleOrient, cropCycleOverlay, cropGearPop, cropState,
  cropSwapOrientation, endCropDrag, moveCropDrag, set_cropGearPop, set_cropStraight, syncCropBar,
  syncCropCursor,
} from './10-crop.js';
import { gradDrag, makeZip, set_gradDrag } from './11-paint-common.js';
import { transformedMaskFor } from './12-fx-workspaces.js';
import { layerNameOf } from './13-quickmask-apply-image.js';
import {
  adjEye, adjEyeCancel, endGradDrag, eyedropMove, eyedropUp, liveGradDeleteSel, liveGradEdit, liveGradSel,
  moveGradDrag, pickDrag,
} from './15-gradient-bucket-eyedropper.js';
import {
  activePath, cancelPen, commitPen, endLiveRadius, endPenDrag, endShapeDrag, liveRadDrag, moveLiveRadius,
  movePen, moveShapeDrag, penOpts, penState, savePenOpts, savedPaths, savedPathsDirty, set_penPointer,
  set_shapeState, shapeState, workPath, workPathDirty,
} from './17-shape-pen.js';
import {
  PEN_TOOLS, cancelMagPen, curvatureDeleteSelected, curvatureMove, curvatureResmooth, endFreePen, finishMagPen,
  freePen, freePenMove, magPen, magPenMove, set_freePen, syncPenBar,
} from './18-pen-extra.js';
import {
  cancelFreeTransform, commitFreeTransform, tfBeginSelection, tfCurValues, tfMark, tfNumFromQuad, tfSelEligible,
  tfState, tfSyncBar, tfWriteQuad,
} from './19-free-transform.js';
import {
  bakeCurrentSO, bakeSO, bakeSeq, builtIndexOf, exitInside, hasAnyEdits, nudgeDuplicate, nudgeLayer,
  set_bakeSeq, set_snapLines, snapGuidePx, soInside,
} from './20-snap-smart-object.js';
import { decodeImageFile, set_reuseHints } from './21-load-document.js';
import {
  deformFinish, deformOpts, deformTool, exitSO, pquadDrag, pquadMove, pquadSnapRect, selectedPins,
  setPerspectiveMode, set_deformSel, set_pquadDrag, set_pquadMove, syncDeformBar,
} from './22-deform-tools.js';
import { renderLayerPanel, selLayer } from './23-layers-panel.js';
import {
  MASK_STRUCTURAL_OPS, allLayerOps, cloneOpValue, dropLayerOp, opLabel, putLayerOp, renderProps,
} from './24-layer-ops-queue.js';
import { warpSession } from './26-layer-create.js';
import { setLayerOpacity } from './27-gradient-editor.js';
import {
  batchTargets, deleteSelectedLayersUI, getTransformValues, setLayerPos, syncLayerControls, syncTransformInputs,
  transformChanged,
} from './28-layer-props-transform.js';
import { displayOrder, rasterizeTransformed } from './29-scrubby-live.js';
import {
  composeDocForOrder, paintLayersExport, previewCompositeDoc, renderPreviewOnly, renderStaticLayers,
  renderWarpNow, topo,
} from './30-render.js';
import {
  PAINT_TOOLS, SEL_TOOLS, auxDrag, auxMove, auxUp, bgRGB, brush, docTool, fgRGB, moveHover, moveHoverRaf,
  moveOpts, numKeyState, setViewAngle, set_moveHover, set_moveHoverPt, set_moveHoverRaf, set_numKeyState,
  toolData, toolDataAPI,
} from './31-selection-brush.js';
import {
  clearBrushCursor, clearSelectionPixels, cursorHover, cursorHoverKind, cursorHoverPt, dispPx, endSelBrush,
  fillSelectionPixels, sampleRGBA, sbState, selBrushMove, setBrushCursor, setGizmoCursor, setGizmoCursorString,
  setSelection, set_cursorHover, set_cursorHoverPt, set_textBoxHover, set_textHover, syncAnts, syncGizmoCursor,
  syncPointerModifiers, syncToolOptions, textBoxHover, textHover,
} from './32-cursors-select-options.js';
import {
  cancelMagLasso, cancelPolyLasso, closeMagLasso, closePolyLasso, endObjSel, endQuickSel, magFreeEnd,
  magFreeMove, magHover, magHoverAt, magLasso, magLassoMove, magUndoAnchor, objFinderHover, objFinderKick,
  objSelMove, osOpts, osState, polyLasso, polyLassoMove, polyLassoUp, qsState, quickSelMove, syncQuickSelBar,
} from './33-lasso-quick-select.js';
import {
  cancelPCrop, commitPCrop, deleteSliceUI, docSlices, nudgeSliceUI, pcropMove, pcropState, pcropUp,
  set_pcropHover, sliceDrag, sliceMove, sliceSel, sliceUp, slicesDirty, syncPCropBar,
} from './34-perspective-crop-slice.js';
import {
  abHandleAt, abHit, abHoverCur, abNudge, abPlusAt, abState, abTitleHit, artboardMove, artboardUp, docArtboards,
  set_abHoverCur,
} from './35-artboard.js';
import { abSelected, frameMove, frameState, frameUp } from './36-clipboard-frame.js';
import { boOpts, endSelDrag, moveSelDrag, shiftSelection } from './37-local-pixel-tools.js';
import {
  endStroke, flushSparsePaint, repaintStrokeLayer, scheduleStrokeRepaint, sparsePaintBusy,
} from './38-brush-engine.js';
import { adjBrushPending, endPaintGesture, paintMove, paintPressure } from './39-brush-options.js';
import { syncBrushPanel } from './40-options-bar-wiring.js';
import { adjState } from './41-image-adjust.js';
import { pathDrag, pathHoverNode, pathNodes, pathToSelectionUI, set_pathHoverNode } from './44-vector-path.js';
import {
  PATH_EDIT_TOOLS, arrangePathSubs, deleteSelectedAnchors, deleteSelectedSubpaths, endAnchorDrag, endPathDrag,
  endPathMarquee, endPathSubDrag, endSegDrag, moveAnchorDrag, movePathDrag, movePathMarquee, movePathSubDrag,
  moveSegDrag, nudgePathSelection, pathAnchorDrag, pathMarquee, pathPick, pathSegDrag, pathSelAnchors,
  pathSelSubs, pathSubDrag,
} from './45-path-tools.js';
import {
  b64ToU8, clearPerspectiveVertexSnap, deleteSelectedPuppetPins, deleteWarpSelection, dispThr, drawGizmo,
  filterEditsPayload, filterErrorText, filterPost, gizmo, guideHoverOn, moveDeformHandle,
  moveSelectedPuppetPins, pickHandle, rotateSelectedPuppetPins, set_guideHoverOn, set_tfHoverOn, soFilterEdits,
  tfHoverOn, toDoc, updateHover, updatePuppetRing,
} from './46-smart-filter-panel.js';
import {
  layoutInlineText, set_textMeasureCtx, textDisplayMatrix, textMeasureCtx, textOwnRaster, writeSoPlacement,
  writeTextTransform,
} from './47-canvas-context-menu.js';
import {
  TEXT_CHAR_KEYS, TEXT_PARA_KEYS, bakeReplacementPng, effTextInfo, renderTextLayer, textLayoutApi, textModelOf,
  textPtFactor,
} from './49-fonts-text-model.js';
import {
  alphaCacheFor, captureTextDynamicCarry, effTextDesc, effTextShape, queueTextDesc, set_alphaCarry,
  textDescEdits,
} from './52-alpha-text-menu.js';
import { isRetouchBrush, retouchState } from './53-retouch-clone-pattern.js';
import { retouchMove, retouchUp } from './54-gestures-hints.js';
import {
  CPP, LB, PW, effTextPath, layoutTextFor, otFamilySync, textSheetsForExport,
} from './57-layer-style-text-path.js';
import { fireScriptEvent } from './58-scripting.js';





export let infoCompCache = { key: '', px: null }, infoLayerCache = { key: '', px: null };
export function set_infoCompCache(v) { return (infoCompCache = v); }   
export const infoCompKey = () => `${docW}x${docH}|${histLog.items.length}|${histLog.cursor}|${brushHistory.undo.length}|${brushHistory.redo.length}`;
export function infoComposite(){
  if (!doc || !docW) return null;
  const key = infoCompKey();
  if (infoCompCache.key === key && infoCompCache.px) return infoCompCache.px;
  let px = null; try { px = sampleRGBA(true); } catch {}
  infoCompCache = { key, px };
  return px;
}

export function infoLayerPixels(){
  if (!doc || !docW || selLayer < 0) return null;
  const key = infoCompKey() + '|' + selLayer;
  if (infoLayerCache.key === key && infoLayerCache.px) return infoLayerCache.px;
  let px = null; try { px = sampleRGBA(false); } catch {}
  infoLayerCache = { key, px };
  return px;
}
export function syncInfoPanel(){ try { INFOP && INFOP.syncInfo(); } catch {} }
function scheduleInfoPanel(ev){ try { if (INFOP && ev) INFOP.onPointer(ev); } catch {} }


export function textEditAbsorbs(i){
  if (!textOverlay || textOverlay.idx !== i) return false;
  textOverlay.dirty = true;
  return true;
}

export function textLayoutOf(idx){
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  const info = L && effTextInfo(idx, L); if (!info) return null;
  const model = textModelOf(idx, L); if (!model) return null;
  if (!textMeasureCtx) { try { set_textMeasureCtx(document.createElement('canvas').getContext('2d')); } catch {} }
  const mc = textMeasureCtx;
  const css0 = textFontSubst[idx]?.css || (fontCache[info.font] && fontCache[info.font].ok ? fontCache[info.font].css : null);
  const cssMap = new Map(model.runs.map(r => [r, otFamilySync(r, r.css || (fontCache[r.font] && fontCache[r.font].ok ? fontCache[r.font].css : css0))]));
  const api = mc && typeof mc.measureText === 'function' ? textLayoutApi(mc, cssMap)
    : { measure: (t, r, sc) => String(t).length * r.fontSize * sc * 0.6, metrics: (r, sc) => ({ ascent: r.fontSize * sc * 0.88, descent: r.fontSize * sc * 0.12 }) };
  return { info, model, api, lay: effTextPath(idx) ? layoutTextFor(idx, model, api) : layoutRichText(model, api) };
}

export function textIndexAt(idx, pt){
  const T = textLayoutOf(idx); if (!T || !T.lay.lines.length) return 0;
  const M = textDisplayMatrix(idx, T.info);
  const det = M[0] * M[3] - M[1] * M[2]; if (Math.abs(det) < 1e-12) return 0;
  const dx = pt.x - M[4], dy = pt.y - M[5];
  const x = (M[3] * dx - M[2] * dy) / det, y = (-M[1] * dx + M[0] * dy) / det;   
  const { lay, api } = T;
  

  if (lay.pathText || lay.vertical || lay.areaText) return indexAtPoint(lay, T.model, api, x, y);
  let ln = lay.lines[0], bd = Infinity;
  for (const l of lay.lines) { const d = Math.abs(y - (l.y - (l.ascent - l.descent) / 2)); if (d < bd) { bd = d; ln = l; } }
  if (!ln.pieces.length) return ln.from || 0;
  let best = ln.pieces[0].from, bx = Math.abs(x - ln.pieces[0].x);
  for (const p of ln.pieces) {
    const chars = Array.from(p.text);
    const src = T.model.text.slice(p.from, p.to);
    const oneToOne = chars.length === Array.from(src).length;
    let off = p.from;
    for (let k = 1; k <= chars.length; k++) {
      const w = api.measure(chars.slice(0, k).join(''), p.run, p.scale);
      off += oneToOne ? Array.from(src)[k - 1].length : 0;
      const at = oneToOne ? off : (k === chars.length ? p.to : p.from);
      const d = Math.abs(x - (p.x + w));
      if (d < bx) { bx = d; best = at; }
    }
  }
  return best;
}


export function bindTextEditGestures(ta, idxOf){
  ta.addEventListener('click', e => {
    const idx = idxOf(); if (idx < 0 || e.detail < 3) return;
    const v = ta.value, at = ta.selectionStart;
    if (e.detail >= 5) { ta.setSelectionRange(0, v.length); return; }
    const pa = v.lastIndexOf('\n', at - 1) + 1, pbRaw = v.indexOf('\n', at), pb = pbRaw < 0 ? v.length : pbRaw;
    if (e.detail === 4) { ta.setSelectionRange(pa, pb); return; }
    
    const T = textLayoutOf(idx);
    const lines = T && !T.lay.vertical ? T.lay.lines.filter(l => l.pieces.length) : [];
    const ln = lines.find(l => at >= l.pieces[0].from && at <= l.pieces[l.pieces.length - 1].to);
    if (ln) ta.setSelectionRange(ln.pieces[0].from, Math.min(pb, ln.pieces[ln.pieces.length - 1].to));
    else ta.setSelectionRange(pa, pb);
  });
  const modOn = e => e.metaKey || e.ctrlKey;
  const syncCur = e => {
    const h = e.clientX != null && !modOn(e) ? textBoxHandleAt(toDoc(e)) : null;
    ta.style.cursor = modOn(e) ? 'move' : h ? ({ nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', e: 'ew-resize', w: 'ew-resize', n: 'ns-resize', s: 'ns-resize' }[h]) : '';
  };
  ta.addEventListener('keydown', syncCur); ta.addEventListener('keyup', syncCur); ta.addEventListener('pointermove', syncCur);
  ta.addEventListener('pointerdown', e => {
    const idx = idxOf(); if (idx < 0 || e.button !== 0) return;
    
    const hp = toDoc(e), hh = !modOn(e) && textBoxHandleAt(hp);
    if (hh) {
      e.stopPropagation(); beginTextBoxDrag(e, hp, hh);
      try { ta.setPointerCapture(e.pointerId); } catch {}
      const mv = ev => moveTextBoxDrag(toDoc(ev));
      const up = () => { ta.removeEventListener('pointermove', mv); ta.removeEventListener('pointerup', up); ta.removeEventListener('pointercancel', up); endTextBoxDrag(); };
      ta.addEventListener('pointermove', mv); ta.addEventListener('pointerup', up); ta.addEventListener('pointercancel', up);
      return;
    }
    if (!modOn(e)) return;
    e.preventDefault(); e.stopPropagation();
    const v0 = { ...getTransformValues(idx) }, d0 = toDoc(e);   
    try { ta.setPointerCapture(e.pointerId); } catch {}
    const mv = ev => {
      const d = toDoc(ev);
      setLayerPos(idx, v0.x + (d.x - d0.x), v0.y + (d.y - d0.y));
      if (textOverlay && textOverlay.idx === idx) { textOverlay.dirty = true; layoutInlineText(); }
      drawGizmo();
    };
    const up = () => { ta.removeEventListener('pointermove', mv); ta.removeEventListener('pointerup', up); ta.removeEventListener('pointercancel', up); renderLayerPanel(); };
    ta.addEventListener('pointermove', mv); ta.addEventListener('pointerup', up); ta.addEventListener('pointercancel', up);
  });
}


export function textEditShortcut(e, idx){
  const mod = e.metaKey || e.ctrlKey, inf = textInfoOf(idx); if (!inf) return false;
  const k = textPtFactor(idx), vert = effTextDesc(idx, 'orientation') === 'vertical';
  const S = patch => { applyTextStyle(idx, patch); return true; };
  
  if (mod && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) {
    const step = (e.altKey ? 10 : 2) * (e.code === 'Period' ? 1 : -1);
    const pt = Math.max(0.01, Math.min(1296, inf.fontSize * k + step));
    return S({ fontSize: pt / k });
  }
  const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (e.altKey && !e.shiftKey && arrows.includes(e.key)) {
    
    const horizKey = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    const trackKey = vert ? !horizKey : horizKey;
    if (trackKey) {
      const plus = vert ? e.key === 'ArrowDown' : e.key === 'ArrowRight';
      return S({ tracking: Math.round((inf.tracking || 0) + (mod ? 100 : 20) * (plus ? 1 : -1)) });
    }
    const plus = vert ? e.key === 'ArrowLeft' : e.key === 'ArrowDown';
    const cur = inf.leading != null ? inf.leading * k : inf.fontSize * k * 1.2;     
    return S({ leading: Math.max(0.01, cur + (mod ? 10 : 2) * (plus ? 1 : -1)) / k });
  }
  if (e.altKey && e.shiftKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {   
    return S({ baselineShift: ((inf.baselineShift || 0) * k + (e.key === 'ArrowUp' ? 2 : -2)) / k });
  }
  if (!mod || !e.shiftKey) return false;
  const key = e.code;
  
  const AL = { KeyL: 'left', KeyC: 'center', KeyR: 'right', KeyJ: 'justify', KeyF: 'justifyAll' };
  if (AL[key] && !e.altKey) return S({ align: AL[key] });
  if (e.altKey) {
    if (key === 'KeyA') return S({ leading: null });                        
    if (key === 'KeyX') return S({ vScale: 1 });                            
    if (key === 'Equal') return S({ baseline: inf.baseline === 'subscript' ? 'normal' : 'subscript' });   
    return false;
  }
  switch (key) {
    case 'KeyX': return S({ hScale: 1 });                                   
    case 'KeyQ': return S({ tracking: 0 });                                 
    case 'KeyB': return S({ bold: !inf.bold });                             
    case 'KeyI': return S({ italic: !inf.italic });                         
    case 'KeyU': return S({ underline: !inf.underline });                   
    case 'Slash': return S({ strikethrough: !inf.strikethrough });          
    case 'KeyK': return S({ caps: inf.caps === 'all' ? 'none' : 'all' });   
    case 'KeyH': return S({ caps: inf.caps === 'small' ? 'none' : 'small' });   
    case 'Equal': return S({ baseline: inf.baseline === 'superscript' ? 'normal' : 'superscript' });   
  }
  return false;
}

export function toggleCharParaPanels(){
  if (CPP) { CPP.toggle(); return; }   
  const shown = panelPropsEl && !panelPropsEl.classList.contains('collapsed') && propTab === 'character' && panelPropsEl.offsetParent;
  if (shown) { panelPropsEl.classList.add('collapsed'); return; }
  revealPropsPanel(); set_propTab('character'); syncPropTabs(); renderProps();
}



export let textBoxDrag = null;

export function textBoxRaw(idx){
  const q = textDescEdits[idx];
  if (q && q.shape === 'box' && Array.isArray(q.box)) return { x: q.box[2] || 0, y: q.box[3] || 0, w: q.box[0], h: q.box[1] };
  const L = layerTree.flat[idx];
  if (effTextShape(idx) !== 'box' || !L.text.box) return null;
  const [l, t, r, b] = L.text.box;
  return { x: l, y: t, w: r - l, h: b - t };
}

export function textBoxHandles(idx){
  if (idx < 0 || !isTextLayer(idx) || effTextShape(idx) !== 'box' || effTextPath(idx)) return null;   
  const L = layerTree.flat[idx], info = effTextInfo(idx, L);
  const b = info.box; if (!b) return null;
  const M = textDisplayMatrix(idx, info);
  const P = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const [l, t, r, bo] = b, mx = (l + r) / 2, my = (t + bo) / 2;
  const hs = { nw: P(l, t), n: P(mx, t), ne: P(r, t), e: P(r, my), se: P(r, bo), s: P(mx, bo), sw: P(l, bo), w: P(l, my) };
  return { quad: [hs.nw, hs.ne, hs.se, hs.sw], hs, M };
}
export function drawTextBoxGizmo(ctx){
  const idx = textOverlay ? textOverlay.idx : -1;
  const H = textBoxHandles(idx); if (!H) return;
  ctx.save();
  ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.beginPath(); H.quad.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
  const s = dispPx(3.5);
  ctx.fillStyle = '#fff';
  for (const p of Object.values(H.hs)) { ctx.fillRect(p[0] - s, p[1] - s, s * 2, s * 2); ctx.strokeRect(p[0] - s, p[1] - s, s * 2, s * 2); }
  ctx.restore();
}
export function textBoxHandleAt(pt){
  const idx = textOverlay ? textOverlay.idx : -1;
  const H = textBoxHandles(idx); if (!H) return null;
  const thr = Math.max(dispThr(7), 1);
  for (const [k, p] of Object.entries(H.hs)) if (Math.abs(pt.x - p[0]) <= thr && Math.abs(pt.y - p[1]) <= thr) return k;
  return null;
}
export function beginTextBoxDrag(ev, pt, handle){
  const idx = textOverlay.idx, raw = textBoxRaw(idx), H = textBoxHandles(idx);
  if (!raw || !H) return false;
  textBoxDrag = { idx, handle, raw, M: H.M, p0: { ...pt }, seq: 0 };
  textOverlay.dirty = true; textOverlay.hold = true;
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  ev.preventDefault();
  return true;
}
async function moveTextBoxDrag(pt){
  const d = textBoxDrag; if (!d) return;
  const [a, b, c, e] = d.M, det = a * e - b * c || 1;
  const dx = pt.x - d.p0.x, dy = pt.y - d.p0.y;
  const tx = (e * dx - c * dy) / det, ty = (-b * dx + a * dy) / det;          
  let { x, y, w, h } = d.raw;
  if (d.handle.includes('w')) { x += tx; w -= tx; }
  if (d.handle.includes('e')) w += tx;
  if (d.handle.includes('n')) { y += ty; h -= ty; }
  if (d.handle.includes('s')) h += ty;
  if (w < 4) { if (d.handle.includes('w')) x -= 4 - w; w = 4; }
  if (h < 4) { if (d.handle.includes('n')) y -= 4 - h; h = 4; }
  queueTextDesc(d.idx, { shape: 'box', box: [Math.round(w), Math.round(h), x, y] });
  if (layerTextEdits[d.idx] == null) layerTextEdits[d.idx] = layerTree.flat[d.idx].text.content;
  const my = ++d.seq;
  drawGizmo();
  await renderTextLayer(d.idx, layerTree.flat[d.idx], { silent: true });
  if (my !== d.seq && textBoxDrag) return;
  renderStaticLayers();
  if (textOverlay && textOverlay.idx === d.idx) layoutInlineText();
  drawGizmo();
}
function endTextBoxDrag(){
  const d = textBoxDrag; textBoxDrag = null;
  if (!d) return;
  if (textOverlay) { textOverlay.hold = false; try { textOverlay.ta.focus({ preventScroll: true }); } catch {} }
  renderLayerPanel(); renderProps(); drawGizmo();
}
let puppetHoverPoint = null;
gizmo.addEventListener('pointermove', ev=>{
  if (li?.deform?.kind === 'puppetWarp') puppetHoverPoint = toDoc(ev);
  syncPointerModifiers(ev);
  scheduleInfoPanel(ev);                       
  if (zoomGest || birdEye) return;              
  

  if (!li && doc && (docTool === 'text' || docTool === 'textVertical')) {
    const over = textLayerAt(toDoc(ev).x, toDoc(ev).y) >= 0;
    const bh = textOverlay ? textBoxHandleAt(toDoc(ev)) : null;
    if (over !== textHover || bh !== textBoxHover) { set_textHover(over); set_textBoxHover(bh); syncGizmoCursor(); }
  }
  if (rulersVisible) { set_rulerPos(toDoc(ev)); syncRulers(); }   
  if (!li && doc && (PAINT_TOOLS.has(docTool) || isRetouchBrush(docTool) || docTool === 'quickSelect' || docTool === 'selectionBrush')) setBrushCursor(toDoc(ev));   
  
  if (!li && doc && docTool === 'lassoMagnetic') magHoverAt(ev, toDoc(ev));
  
  if (!li && doc && docTool === 'objectSelect' && !osState && ev.buttons === 0) objFinderHover(toDoc(ev));
  
  if (!li && doc && ev.buttons === 0) {
    set_cursorHoverPt(toDoc(ev));
    const hk = cursorHoverKind(cursorHoverPt);
    if (hk !== cursorHover) { set_cursorHover(hk); syncGizmoCursor(); }
  }
  if (guideDrag && guideDrag.onCanvas) {          
    const p = toDoc(ev);
    guideDrag.px = snapGuidePx(guideDrag.axis === 'v', guideDrag.axis === 'v' ? p.x : p.y);
    guideDrag.moved = true; drawGizmo(); return;
  }
  if (!li && doc && guidesVisible && guides.length && (docTool === 'move' || ev.metaKey || ev.ctrlKey) && !moveDrag && !selDrag) {
    const gi = guideHit(toDoc(ev));               
    
    if (gi >= 0) { set_guideHoverOn(true); setGizmoCursor(guides[gi].vertical ? 'stretchH' : 'stretchV'); }
    else if (guideHoverOn) { set_guideHoverOn(false); setGizmoCursor(null); }   
  }
  if (auxDrag) { auxMove(ev, toDoc(ev)); return; }
  if (pickDrag) { eyedropMove(ev, toDoc(ev)); return; }
  if (frameState) { frameMove(ev, toDoc(ev)); return; }
  if (abState) { artboardMove(toDoc(ev), ev); return; }
  
  if (!li && doc && docTool === 'artboard') {
    const pt = toDoc(ev);
    const h = abHandleAt(pt);
    const want = h ? h : abPlusAt(pt) ? '' : (abTitleHit(pt) >= 0 || abHit(pt) >= 0) ? 'ab' : '';
    if (want !== abHoverCur) { set_abHoverCur(want); syncGizmoCursor(); }
  } else if (abHoverCur) { set_abHoverCur(''); }
  
  if (!li && doc && docTool === 'move' && !moveDrag && !tfState && moveOpts.hoverBounds && ev.buttons === 0) {
    set_moveHoverPt(toDoc(ev));
    if (!moveHoverRaf) set_moveHoverRaf(requestAnimationFrame(() => { set_moveHoverRaf(0); refreshMoveHover(); }));
  } else if (moveHover >= 0) { set_moveHover(-1); set_moveHoverPt(null); drawGizmo(); }
  if (sliceDrag) { sliceMove(toDoc(ev)); return; }
  if (pcropState && pcropState.drag != null) { pcropMove(toDoc(ev)); return; }
  if (pcropState && pcropState.clicks) { set_pcropHover(toDoc(ev)); drawGizmo(); }   
  if (qsState) { quickSelMove(toDoc(ev)); return; }
  if (sbState) { selBrushMove(ev, toDoc(ev)); return; }
  if (osState) { objSelMove(toDoc(ev)); return; }
  if (magLasso) { if (magLasso.freeSeg && ev.buttons) magFreeMove(toDoc(ev)); else magLassoMove(toDoc(ev), ev); return; }
  if (magPen) { magPenMove(toDoc(ev)); return; }
  if (polyLasso) { polyLassoMove(ev, toDoc(ev)); return; }        
  if (moveDrag) { moveMoveDrag(ev, toDoc(ev)); return; }
  if (selDrag) { moveSelDrag(ev, toDoc(ev)); return; }
  if (adjBrushPending && adjBrushPending.down) { adjBrushPending.pts.push({ ...toDoc(ev), p: paintPressure(ev) }); drawGizmo(); return; }
  if (curStroke) { paintMove(ev, toDoc(ev)); scheduleStrokeRepaint(curStroke); return; }
  if (liveRadDrag) { moveLiveRadius(ev, toDoc(ev)); return; }
  if (pathDrag) { movePathDrag(ev, toDoc(ev)); return; }
  if (pathSubDrag) { movePathSubDrag(ev, toDoc(ev)); return; }
  if (pathAnchorDrag) { moveAnchorDrag(ev, toDoc(ev)); return; }
  if (pathSegDrag) { moveSegDrag(ev, toDoc(ev)); return; }
  if (pathMarquee) { movePathMarquee(ev, toDoc(ev)); return; }
  if (freePen) { freePenMove(ev, toDoc(ev)); return; }
  if (retouchState) { retouchMove(ev, toDoc(ev)); return; }
  if (gradDrag || liveGradEdit) { moveGradDrag(ev, toDoc(ev)); return; }
  if (shapeState) { moveShapeDrag(ev, toDoc(ev)); return; }
  if (textBoxDrag) { moveTextBoxDrag(toDoc(ev)); return; }
  if (textDrag) { moveTextDrag(ev, toDoc(ev)); return; }
  if (!li && doc && docTool === 'penCurvature' && penState && penState.drag) { curvatureMove(ev, toDoc(ev)); return; }
  if (!li && doc && docTool === 'penCurvature') { set_penPointer(toDoc(ev)); if (penState) drawGizmo(); syncGizmoCursor(); }
  if (!li && doc && docTool === 'pen') { movePen(ev, toDoc(ev)); return; }
  


  if (cropState) {
    if (cropState.drag) { moveCropDrag(ev, toDoc(ev)); return; }
    if (!li) { syncCropCursor(toDoc(ev)); return; }
  }
  


  if (!li && doc && tfState && tfState.pathWarp && !moveDrag && !panState) { set_tfHoverOn(true); setGizmoCursorString(PW.cursorAt(toDoc(ev))); return; }
  if (!li && doc && (docTool === 'move' || !!tfState) && !moveDrag && !selDrag && !panState) {
    const hc = tfHandleCursor(toDoc(ev));
    if (hc) { set_tfHoverOn(true); setGizmoCursor(hc); return; }
    const rc = tfRotateCursor(toDoc(ev));
    if (rc) { set_tfHoverOn(true); setGizmoCursor(rc); return; }
    if (tfState) { set_tfHoverOn(true); setGizmoCursor('move'); return; }   
    if (tfHoverOn) { set_tfHoverOn(false); setGizmoCursor(null); }   
  }
  if (!li && doc && PATH_EDIT_TOOLS.has(docTool)) {       
    const hp = pathNodes.length ? pathPick(toDoc(ev)) : -1;
    if (hp !== pathHoverNode) { set_pathHoverNode(hp); drawGizmo(); }
    
    setGizmoCursor(docTool === 'path' ? (hp >= 0 ? 'move' : null) : null);
    return;
  }
  if(!li) return;
  const pt = toDoc(ev);
  if (pquadDrag) {
    pquadDrag.x1 = pt.x; pquadDrag.y1 = pt.y;
    pquadDrag.snap = pquadSnapRect(pquadDrag);       
    drawGizmo(); return;
  }
  if (pquadMove) {
    const d = li && li.deform;
    if (d) {
      const dx = pt.x - pquadMove.from.x, dy = pt.y - pquadMove.from.y;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) pquadMove.moved = true;
      const idx = d.quadIdx[pquadMove.qi] || [];
      idx.forEach((k, n) => {
        d.vertices[k] = { x: pquadMove.base[n].x + dx, y: pquadMove.base[n].y + dy };
        d.warped[k] = { x: pquadMove.baseW[n].x + dx, y: pquadMove.baseW[n].y + dy };
      });
      delete d.grid;                                  
      commit();
    }
    drawGizmo(); return;
  }
  if(!dragState){
    if(li.deform){
      const ring = updatePuppetRing(pt, ev.altKey), hp = pickHandle(pt);
      if(hp !== hoverPt){ set_hoverPt(hp); drawGizmo(); }
      if (li.deform.kind === 'puppetWarp') drawGizmo();
      const pin = ring && li.deform.shapes[ring.j]?.pins[ring.i];
      setGizmoCursor(pin ? rotCursorName(Math.atan2(pt.y - pin.pos.y, pt.x - pin.pos.x) * 180 / Math.PI) : hp >= 0 ? 'move' : null);
      return;
    }
    if($('#splitMode').checked){ updateHover(pt, ev.altKey); drawGizmo(); return; }
    
    
    const hp = pickHandle(pt);
    if(hp !== hoverPt){ set_hoverPt(hp); drawGizmo(); }
    const { roles } = topo();
    setGizmoCursor(hp >= 0 ? (roles[hp]==='corner' ? 'move' : 'moveSmall') : null);
    return;
  }
  if (dragState.mode === 'puppetRotate') {
    const angle = puppetAngleDelta(dragState.center, dragState.from, pt);
    if (Math.abs(angle) < .01 && !dragState.moved) return;
    rotateSelectedPuppetPins(dragState.base, dragState.puppetPins, ev.shiftKey ? Math.round(angle / 15) * 15 : angle);
    dragState.moved = true; commit(); syncDeformBar(); drawGizmo(); return;
  }
  if(dragState.mode==='deform'){
    if (dragState.puppetPins) { moveSelectedPuppetPins(dragState.base, dragState.puppetPins, dragState.puppetAnchor, pt); dragState.moved = true; commit(); return; }
    let to = pt;
    if(ev.shiftKey){                             
      const h0 = dragState.base.kind === 'perspectiveWarp' ? dragState.base.warped[dragState.idx]
               : (() => { const h = deformHandles()[dragState.idx]; return dragState.base.shapes[h.j].pins[h.i].pos; })();
      to = Math.abs(pt.x-h0.x) >= Math.abs(pt.y-h0.y) ? { x:pt.x, y:h0.y } : { x:h0.x, y:pt.y };
    }
    moveDeformHandle(dragState.idx, to, dragState.base);
    dragState.moved = true;
    commit();
    return;
  }
  if (dragState.mode === 'warp-select') { warpUpdateMarquee(li, pt); drawGizmo(); return; }
  if(dragState.mode==='point'){
    
    let to = pt;
    if(ev.shiftKey){ const a = dragState.before.points[dragState.idx]; to = Math.abs(pt.x-a.x) >= Math.abs(pt.y-a.y) ? { x:pt.x, y:a.y } : { x:a.x, y:pt.y }; }
    if (dragState.selected?.length > 1) {
      const a = dragState.before.points[dragState.idx];
      li.points = translateWarpControls(dragState.before.points,li.xn,li.yn,dragState.selected,{x:to.x-a.x,y:to.y-a.y});
    } else moveControlPoint(li.points, li.xn, li.yn, dragState.idx, to, { smooth: $('#smooth').checked });
  } else {                                     
    const { U, V, c0, base } = dragState;
    li.points = dragSurfacePoint(base, li.xn, li.yn, U, V, { x: pt.x-c0.x, y: pt.y-c0.y }, li.sliceX, li.sliceY, { smooth: $('#smooth').checked });
  }
  dragState.moved = true;
  commit();
});

export function endDrag(ev){
  if (ev?.type === 'pointercancel' && dragState && (dragState.mode === 'puppetRotate' || dragState.puppetPins)) { cancelDrag(); drawGizmo(); return; }
  if (zoomGest || birdEye) return;
  if (dragState?.mode === 'warp-select') { warpEndMarquee(); set_dragState(null); drawGizmo(); return; }
  if (pquadMove) {                               
    const m = pquadMove; set_pquadMove(null);
    gizmo.classList.remove('drag');
    if (m.moved && li) {
      
      const h = history[cur] || (history[cur] = { undo: [], redo: [] });
      h.undo.push(m.before); if (h.undo.length > histCap()) h.undo.shift(); h.redo.length = 0;
      updateUndoButtons();
      commit(); syncDeformBar();
      shell.status(`挪了第 ${m.qi + 1} 个面（与它共用顶点的面会跟着动）`);
    }
    drawGizmo();
    return;
  }
  if (pquadDrag) {                               
    const q = pquadDrag; set_pquadDrag(null);
    gizmo.classList.remove('drag');
    

    const snapped = (q.snap && q.snap.rect) ? q.snap.rect : pquadSnapRect(q).rect;
    const { x0, y0, x1, y1 } = snapped;
    const thr = Math.max(dispThr(8), 6);
    if (x1 - x0 > thr && y1 - y0 > thr && li && li.deform && li.deform.kind === 'perspectiveWarp') {
      pushHistory();
      
      const at = addPerspectiveQuad(li.deform, [{ x:x0, y:y0 }, { x:x1, y:y0 }, { x:x1, y:y1 }, { x:x0, y:y1 }], 0.5);
      if (at == null) shell.status('这个面太贴着已有的顶点了，四个角吸到了一起 —— 换个位置再拖一次');
      else {
        const shared = (q.snap && q.snap.hits) ? q.snap.hits.length : 0;
        commit(); syncDeformBar();
        shell.status(`加了一个面（共 ${li.deform.quadIdx.length} 个）`
          + (shared ? `，与已有的面共用了 ${shared} 个顶点 —— 拖其中一个两边一起动` : '：挨着已有的面拖，边会自动吸上去、共用顶点'));
      }
    }
    drawGizmo();
    return;
  }
  if (guideDrag && guideDrag.onCanvas) { commitGuideDrag(ev ? toDoc(ev) : { x: guideDrag.px, y: guideDrag.px }); set_guidesDirty(true); return; }
  if (cropState && cropState.drag) { endCropDrag(); return; }
  if (auxDrag) { auxUp(ev?.type === 'pointercancel'); return; }
  if (pickDrag) { eyedropUp(); return; }
  if (frameState) { frameUp(); return; }          
  if (abState) { artboardUp(); return; }          
  if (sliceDrag) { sliceUp(); return; }           
  if (pcropState && pcropState.drag != null) { pcropUp(); return; }   
  if (polyLasso && polyLasso.free) { polyLassoUp(ev); return; }   
  if (magLasso && magLasso.freeSeg) { magFreeEnd(); return; }    
  if (qsState) { endQuickSel(); return; }         
  if (sbState) { endSelBrush(); return; }         
  if (osState) { endObjSel(); return; }          
  if (moveDrag) { endMoveDrag(); return; }
  if (selDrag) { endSelDrag(); return; }
  if (adjBrushPending) { adjBrushPending.down = false; return; }   
  if (curStroke) { const S = curStroke; endPaintGesture(true); S.forced = true; endStroke(); repaintStrokeLayer(S); syncBrushPanel(); if (S.target === 'mask') renderLayerPanel(); return; }   
  if (liveRadDrag) { endLiveRadius(); return; }
  if (pathDrag) { endPathDrag(); return; }       
  if (pathSubDrag) { endPathSubDrag(); return; } 
  if (pathAnchorDrag) { endAnchorDrag(); return; } 
  if (pathSegDrag) { endSegDrag(); return; }       
  if (pathMarquee) { endPathMarquee(); return; }   
  if (freePen) { endFreePen(); return; }         
  if (retouchState) { retouchUp(); return; }     
  if (gradDrag || liveGradEdit) { endGradDrag(); return; }       
  if (shapeState) { endShapeDrag(); return; }    
  if (textBoxDrag) { endTextBoxDrag(); return; }
  if (textDrag) { textToolUp(ev ? toDoc(ev) : null); return; }   
  if (penState) { endPenDrag(ev); return; }     
  if (dragState && dragState.moved && dragState.mode === 'deform' && li?.deform?.kind === 'perspectiveWarp' && deformOpts.pMode === 'layout') {
    
    const joined = weldPerspectiveEdges(li.deform);
    if (joined) { commit(); syncDeformBar(); shell.status('相邻面的整条边已连接，两个端点现在共用'); }
  }
  clearPerspectiveVertexSnap();
  if(dragState && dragState.moved){            
    const h = history[cur] || (history[cur] = { undo: [], redo: [] });
    h.undo.push(dragState.before); if(h.undo.length > histCap()) h.undo.shift(); h.redo.length = 0;
    if (!(li?.points && warpSelected(li).size > 1)) set_selPt(-1);
    updateUndoButtons();
  }
  set_dragState(null); gizmo.classList.remove('drag');
  transformWarpToolbar.sync();
  
  set_hoverPt((ev && li) ? pickHandle(toDoc(ev)) : -1);
  drawGizmo();
}
function cancelDrag(){                         
  if(!dragState) return;
  if (dragState.mode === 'warp-select') { warpEndMarquee(); set_dragState(null); warpClear(li); drawGizmo(); return; }
  clearPerspectiveVertexSnap();
  const puppet = dragState.mode === 'puppetRotate' || !!dragState.puppetPins;
  const b = dragState.before; set_dragState(null); gizmo.classList.remove('drag');
  if (puppet) { restore(b); syncDeformBar(); drawGizmo(); return; }
  if (b.deform) li.deform = cloneDeform(b.deform); else li.points = b.points.map(p => ({ x:p.x, y:p.y }));
  commit();
}
gizmo.addEventListener('pointerup', endDrag);
gizmo.addEventListener('pointercancel', endDrag);
gizmo.addEventListener('pointerleave', ()=>{ clearBrushCursor(); set_cursorHoverPt(null); set_cursorHover('');
  set_moveHoverPt(null); if (moveHover >= 0) { set_moveHover(-1); drawGizmo(); }
  if (rulerPos) { set_rulerPos(null); syncRulers(); }
  if(!dragState){ let dirty=false; if(hover){ set_hover(null); dirty=true; } if(hoverPt>=0){ set_hoverPt(-1); dirty=true; } set_guideHoverOn(false); setGizmoCursor(null); if(dirty) drawGizmo(); } });

const inEditable = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };


addEventListener('keydown', e => {
  if (cropGearPop && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cropGearPop.remove(); set_cropGearPop(null); return; }
  if (!cropState || cropState.drag || li || e.metaKey || e.ctrlKey || e.altKey || inEditable(e)) return;
  if (e.target && e.target.closest && e.target.closest('dialog')) return;
  if (e.code === 'KeyO') { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) cropCycleOrient(); else cropCycleOverlay(); }
  else if (e.code === 'KeyX' && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); cropSwapOrientation(); }
}, true);
addEventListener('keydown', e=>{
  if (e.key === 'Alt' && puppetHoverPoint && li?.deform?.kind === 'puppetWarp') { updatePuppetRing(puppetHoverPoint, true); drawGizmo(); }
  if(e.key==='Alt' && $('#splitMode').checked) drawGizmo();
  if(e.code==='Space' && !inEditable(e) && !(e.target.closest && e.target.closest('dialog'))){
    e.preventDefault();                       
    if(!e.repeat && !spaceDown){ set_spaceDown(true); updatePanCursor(); }
    return;
  }
  if(inEditable(e)) return;
  
  
  if (adjState && $('#adjDlg').open) return;
  
  if (adjEye.active) { if (e.key === 'Escape') { e.preventDefault(); adjEyeCancel(); } return; }
  if ((docTool === 'slice' || docTool === 'sliceSelect') && sliceSel >= 0
      && (e.key === 'Backspace' || e.key === 'Delete')) {     
    e.preventDefault(); deleteSliceUI(); return;
  }
  if (docTool === 'sliceSelect' && sliceSel >= 0 && !li && /^Arrow(Up|Down|Left|Right)$/.test(e.key) && !(e.metaKey || e.ctrlKey || e.altKey)) {
    e.preventDefault();                                       
    const st = e.shiftKey ? 10 : 1;
    nudgeSliceUI(e.key === 'ArrowRight' ? st : e.key === 'ArrowLeft' ? -st : 0, e.key === 'ArrowDown' ? st : e.key === 'ArrowUp' ? -st : 0);
    return;
  }
  if (pcropState) {                              
    if (e.key === 'Enter') { e.preventDefault(); commitPCrop(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelPCrop(); return; }
    if (pcropState.clicks && (e.key === 'Backspace' || e.key === 'Delete')) {   
      e.preventDefault(); pcropState.clicks.pop(); if (!pcropState.clicks.length) cancelPCrop(); else { syncPCropBar(); drawGizmo(); } return;
    }
    if (pcropState.pts && pcropState.drag == null && /^Arrow(Up|Down|Left|Right)$/.test(e.key) && !(e.metaKey || e.ctrlKey || e.altKey)) {
      e.preventDefault();                                      
      const st = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowRight' ? st : e.key === 'ArrowLeft' ? -st : 0, dy = e.key === 'ArrowDown' ? st : e.key === 'ArrowUp' ? -st : 0;
      pcropState.pts = pcropState.pts.map(p => [p[0] + dx, p[1] + dy]); drawGizmo(); return;
    }
  }
  if (magLasso) {                                
    if (e.key === 'Enter') { e.preventDefault(); closeMagLasso(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelMagLasso(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); magUndoAnchor(); return; }
  }
  if (polyLasso) {                               
    if (e.key === 'Enter') { e.preventDefault(); closePolyLasso(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelPolyLasso(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault(); polyLasso.pts.pop();
      if (!polyLasso.pts.length) cancelPolyLasso(); else drawGizmo();
      return;
    }
  }
  if (magPen) {                                  
    if (e.key === 'Enter') { e.preventDefault(); finishMagPen(false); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelMagPen(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (magPen.anchors.length <= 1) { cancelMagPen(); return; }
      magPen.anchors.pop();
      const a = magPen.anchors[magPen.anchors.length - 1];
      const at = magPen.path.findIndex(p => p.x === a.x && p.y === a.y);
      if (at >= 0) magPen.path.length = at + 1;
      magPen.preview = []; magPen.wire = null; drawGizmo(); return;
    }
    if (e.key === '[' || e.key === ']') { e.preventDefault(); penOpts.magWidth = Math.max(1, Math.min(256, (+penOpts.magWidth || 10) + (e.key === ']' ? 1 : -1))); savePenOpts(); syncPenBar(); drawGizmo(); return; }
  }
  if (freePen && e.key === 'Escape') {           
    e.preventDefault(); set_freePen(null); gizmo.classList.remove('drag', 'pen-drawing'); drawGizmo(); return;
  }
  
  if (!li && doc && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !textOverlay
      && (PEN_TOOLS.has(docTool) || PATH_EDIT_TOOLS.has(docTool) || docTool === 'shape' || activePath)) {
    e.preventDefault();
    if (penState) { if (docTool === 'penCurvature') curvatureResmooth(false); if (!commitPen(false)) cancelPen(); }
    const mode = e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';
    setTimeout(() => pathToSelectionUI(false, mode), 0);
    return;
  }
  if (penState && !penState.drag) {              
    if ((e.key === 'Enter' || e.key === 'Escape') && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault(); if (docTool === 'penCurvature') curvatureResmooth(false);
      if (!commitPen(false)) cancelPen(); return;
    }
    
    if (docTool === 'penCurvature' && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault(); curvatureDeleteSelected(); return;
    }
  }
  

  if (!li && docTool === 'pathSelect' && pathSelSubs.size && (e.key === 'Delete' || e.key === 'Backspace') && !e.altKey && !(e.metaKey || e.ctrlKey)) {
    e.preventDefault(); deleteSelectedSubpaths(); return;
  }
  
  if (!li && docTool === 'path' && pathSelAnchors.size && (e.key === 'Delete' || e.key === 'Backspace') && !e.altKey && !(e.metaKey || e.ctrlKey)) {
    e.preventDefault(); deleteSelectedAnchors(); return;
  }
  
  if (!li && (docTool === 'pathSelect' && pathSelSubs.size || docTool === 'path' && pathSelAnchors.size)
      && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !(e.metaKey || e.ctrlKey || e.altKey)) {
    const st = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (nudgePathSelection(d[0], d[1])) { e.preventDefault(); return; }
  }
  
  if (!li && docTool === 'pathSelect' && pathSelSubs.size && (e.metaKey || e.ctrlKey) && !e.altKey && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
    e.preventDefault();
    arrangePathSubs(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward'));
    return;
  }
  if (auxDrag && e.key === 'Escape') { e.preventDefault(); auxUp(true); return; }
  
  if (!li && doc && docTool === 'rotateView' && e.key === 'Escape' && !(e.metaKey || e.ctrlKey || e.altKey)) { e.preventDefault(); setViewAngle(0); return; }
  if (gradDrag && e.key === 'Escape') { e.preventDefault(); set_gradDrag(null); gizmo.classList.remove('drag'); drawGizmo(); return; }
  
  if ((e.key === 'Delete' || e.key === 'Backspace') && docTool === 'gradient' && liveGradSel && !e.altKey && !(e.metaKey || e.ctrlKey) && liveGradDeleteSel()) { e.preventDefault(); return; }
  if (shapeState && e.key === 'Escape') { e.preventDefault(); set_shapeState(null); gizmo.classList.remove('drag'); drawGizmo(); return; }
  if (cropState) {                               
    if (e.key === 'Enter') { e.preventDefault(); commitCrop(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      const d = cropState.drag;
      if (d) {                                   
        cropState.rect = { ...d.rect0 }; cropState.angle = d.angle0; if (d.off0) cropState.off = { ...d.off0 };
        cropState.drag = null; set_cropStraight(null); set_snapLines([]); gizmo.classList.remove('drag'); syncCropBar(); drawGizmo();
      }
      
      else cancelCrop(true);
      return;
    }
    
    if (!cropState.drag && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      cropState.rect = clampCropRect({ ...cropState.rect,
        x: cropState.rect.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
        y: cropState.rect.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) });
      syncCropBar(); drawGizmo();
      return;
    }
  }
  if (tfState) {                                 
    if (e.key === 'Enter') { e.preventDefault(); commitFreeTransform(); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (moveDrag) cancelMoveDrag(); else cancelFreeTransform(); return; }
  }
  const mod = e.metaKey || e.ctrlKey;
  

  if(!li && doc && !mod){
    
    if ((e.key === 'n' || e.key === 'N') && docTool === 'objectSelect' && !e.altKey && !e.shiftKey && osOpts.finder) {
      e.preventDefault(); osOpts.showAll = !osOpts.showAll; objFinderKick(false); syncQuickSelBar(); drawGizmo(); return;
    }
    
    if (e.key === 'CapsLock' && docTool === 'lassoMagnetic' && magHover) { magHover.caps = !!(e.getModifierState && e.getModifierState('CapsLock')); drawGizmo(); }
    
    if(/^Arrow(Up|Down|Left|Right)$/.test(e.key)){
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0, dy = e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;
      

      if (tfState && tfState.pathWarp) { e.preventDefault(); PW.nudge(dx, dy); return; }
      if (tfState) {
        e.preventDefault();
        const q = tfFrame(tfCurValues()).corners.map(([x, y]) => [x + dx, y + dy]);
        tfMark(); tfWriteQuad(tfState.idx, q); tfNumFromQuad(); tfSyncBar();
        renderStaticLayers(); syncTransformInputs(); drawGizmo();
        return;
      }
      if (SEL_TOOLS.has(docTool)) {
        if (selection) { e.preventDefault(); setSelection(shiftSelection(selection, dx, dy), { label: '移动选区' }); }
        return;
      }
      
      if (docTool === 'artboard' || (docTool === 'move' && selLayer >= 0 && docArtboards().some(a => a.index === selLayer))) {
        if (abSelected()) { e.preventDefault(); abNudge(dx, dy); }
        return;
      }
      if (docTool !== 'move' || selLayer < 0) return;
      e.preventDefault();
      if (e.altKey && !selection) { if (e.repeat) nudgeLayer(dx, dy); else nudgeDuplicate(dx, dy); return; }   
      
      if (selection && tfSelEligible(selLayer) && tfBeginSelection(selLayer, 'free', { copy: e.altKey })) {
        const q = tfFrame(tfCurValues()).corners.map(([x, y]) => [x + dx, y + dy]);
        tfMark(); tfWriteQuad(tfState.idx, q); commitFreeTransform();
        return;
      }
      nudgeLayer(dx, dy);
      return;
    }
    

    if (/^Digit[0-9]$/.test(e.code) && !e.altKey && !/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) {
      e.preventDefault();
      const dgt = +e.code.slice(5), now = performance.now();
      let pct, second = false;
      if (numKeyState && now - numKeyState.t < 400 && numKeyState.shift === e.shiftKey) { pct = numKeyState.d * 10 + dgt; set_numKeyState(null); second = true; }
      else { pct = dgt === 0 ? 100 : dgt * 10; set_numKeyState({ d: dgt, t: now, shift: e.shiftKey }); }
      

      const boKey = { blur: '强度', sharpen: '强度', smudge: '强度', sponge: '流量', dodge: '曝光度', burn: '曝光度' }[docTool];
      if (boKey) {
        if (e.shiftKey) return;
        if (docTool === 'dodge' || docTool === 'burn') boOpts.exposure = pct / 100;
        else { boOpts.strength = pct / 100; boOpts.strengthBy[docTool] = pct / 100; }
        syncToolOptions(); shell.status(`${boKey}：${pct}%`);
      } else if (PAINT_TOOLS.has(docTool)) {
        if (e.shiftKey) brush.flow = pct / 100; else brush.opacity = pct / 100;
        syncToolOptions(); shell.status(`${e.shiftKey ? '流量' : '不透明度'}：${pct}%`);
      } else if (selLayer >= 0) {
        if (!second) pushDocHistory('不透明度');       
        for (const i of batchTargets(selLayer)) setLayerOpacity(i, Math.round(pct * 2.55));
        actRecord('layerProps', { opacity: pct });
        syncLayerControls(); shell.status(`图层不透明度：${pct}%`);
      }
      return;
    }
    
    
    
    
    if((e.key==='Delete' || e.key==='Backspace')){
      if (e.altKey) { if (selLayer >= 0) { e.preventDefault(); fillSelectionPixels(fgRGB); } return; }
      if (mod) { if (e.key === 'Backspace' && selLayer >= 0) { e.preventDefault(); fillSelectionPixels(bgRGB); } return; }
      if (selection) { e.preventDefault(); if (selLayer >= 0) clearSelectionPixels(); return; }
      e.preventDefault(); deleteSelectedLayersUI();
      return;
    }
  }
  if(e.key==='Escape' && !li){ if(moveDrag){ cancelMoveDrag(); return; } if(selDrag){ if (selDrag.moveSel) { set_selection(selDrag.orig); set_selPathCache(null); syncAnts(); } set_selDrag(null); drawGizmo(); return; } if(selection) return;  if(docStack.length) exitInside(); return; }
  if(!li) return;
  if (!mod && deformTool === 'perspectiveWarp' && /^(l|w)$/i.test(e.key)) {
    e.preventDefault(); setPerspectiveMode(e.key.toLowerCase() === 'l' ? 'layout' : 'warp'); return;
  }
  if(!mod && (e.key==='v' || e.key==='V')){ setTool(false); return; }
  if(!mod && (e.key==='s' || e.key==='S')){ setTool(true); return; }
  

  if (deformTool && (e.key === 'Escape' || e.key === 'Enter')) {
    if (e.key === 'Escape' && pquadDrag) { set_pquadDrag(null); gizmo.classList.remove('drag'); drawGizmo(); return; }
    if (e.key === 'Escape' && pquadMove) {            
      const m = pquadMove; set_pquadMove(null); gizmo.classList.remove('drag');
      if (li && m.before) { restore(m.before); commit(); }
      drawGizmo(); return;
    }
    if (e.key === 'Escape' && dragState) { cancelDrag(); return; }
    e.preventDefault();
    if (e.key === 'Enter' && deformTool === 'perspectiveWarp' && deformOpts.pMode === 'layout') { setPerspectiveMode('warp'); return; }
    deformFinish(e.key === 'Enter'); return;
  }
  if (warpSession && (e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault();
    if (e.key === 'Escape' && dragState) cancelDrag(); else exitSO(e.key === 'Enter');
    return;
  }
  if (li.points && !dragState && (e.key === 'Delete' || e.key === 'Backspace') && deleteWarpSelection()) { e.preventDefault(); return; }
  if (e.key === 'Escape' && !deformTool && !dragState && li?.deform?.kind === 'puppetWarp' && selectedPins().length) { e.preventDefault(); set_deformSel(null); set_selPt(-1); syncDeformBar(); drawGizmo(); return; }
  if(e.key==='Escape'){ if(dragState) cancelDrag(); else if(selPt>=0){ set_selPt(-1); drawGizmo(); } else if(cur>=0) exitSO(); else if(docStack.length) exitInside(); return; }
  
  if(li?.deform?.kind === 'puppetWarp' && !dragState && (e.key === 'Delete' || e.key === 'Backspace') && selectedPins().length){
    e.preventDefault(); deleteSelectedPuppetPins(); return;
  }
  if (li?.deform?.kind === 'puppetWarp' && selectedPins().length && !dragState && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
    e.preventDefault(); const step = e.shiftKey ? 10 : 1, refs = selectedPins(), anchor = refs[0];
    const to = { x: anchor.pin.pos.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
      y: anchor.pin.pos.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) };
    pushHistory(); moveSelectedPuppetPins(cloneDeform(li.deform), refs, anchor, to); commit(); syncDeformBar(); drawGizmo(); return;
  }
  
  if(li && selPt>=0 && !dragState && /^Arrow(Up|Down|Left|Right)$/.test(e.key)){
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const p = li.points ? li.points[selPt] : (deformHandles()[selPt] || {}).p;
    if (!p) return;
    const to = { x: p.x + (e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0), y: p.y + (e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0) };
    pushHistory();
    if (li.points && warpSelected(li).size > 1) li.points = translateWarpControls(li.points,li.xn,li.yn,warpSelected(li),{x:to.x-p.x,y:to.y-p.y});
    else if (li.points) moveControlPoint(li.points, li.xn, li.yn, selPt, to, { smooth: $('#smooth').checked });
    else moveDeformHandle(selPt, to, cloneDeform(li.deform));
    commit();
  }
});
addEventListener('keyup',   e=>{
  if(e.code==='Space'){ set_spaceDown(false); set_panState(null); updatePanCursor(); }
  
  if (e.key === 'Alt' && polyLasso && polyLasso.fromLasso && !polyLasso.free) closePolyLasso();
  if(/^Arrow(Up|Down|Left|Right)$/.test(e.key)) endLayerEdit();   
  if (e.key === 'Alt' && li?.deform?.kind === 'puppetWarp') { updatePuppetRing(puppetHoverPoint, false); drawGizmo(); }
  if(e.key==='Alt' && $('#splitMode').checked){ if(hover) hover.kill=null; gizmo.classList.remove('kill'); drawGizmo(); }
});


export let exportName = 'modified';
export function set_exportName(v) { return (exportName = v); }   
const EXPORT_EXT = { psd: 'psd', png: 'png', jpg: 'jpg', tiff: 'tif', webp: 'webp',
  pdf: 'pdf', png8: 'png', gif: 'gif', bmp: 'bmp', tga: 'tga', ico: 'ico', exr: 'exr', hdr: 'hdr', ppm: 'ppm', pam: 'pam' };

const EXTRA_EXPORT = new Set(['pdf', 'png8', 'gif', 'bmp', 'tga', 'ico', 'exr', 'hdr', 'ppm', 'pam']);
async function encodeExtraCanvas(fmt, c, quality){
  const m = await import('../format-save.js');
  return m.encodeCanvas(fmt, c, { quality, pdfCompression: $('#exportPdfComp') ? $('#exportPdfComp').value : 'zip', ppi: docResolution || 72, title: docName });
}
function syncExportDlg(){
  const fmt = $('#exportFormat').value;
  const cmyk = $('#modeSel').value === 'cmyk';
  $('#exportExt').textContent = '.' + EXPORT_EXT[fmt];
  $('#exportModeLabel').textContent = cmyk ? 'CMYK' : 'RGB';
  $('#exportQualityRow').hidden = !(fmt === 'jpg' || fmt === 'webp' || fmt === 'tiff' || (fmt === 'pdf' && $('#exportPdfComp').value === 'jpeg'));
  $('#exportPdfRow').hidden = fmt !== 'pdf';
  $('#exportIccRow').hidden = !(cmyk && (fmt === 'jpg' || fmt === 'tiff' || fmt === 'psd'));
  const notes = [];
  if (cmyk && (fmt === 'png' || fmt === 'webp')) notes.push('PNG / WebP 不支持 CMYK，将按 RGB 输出。');
  if (cmyk && fmt === 'psd') notes.push('CMYK PSD 优先由服务端按 ICC 分色；服务端不可用时回退为浏览器快速分色（无 ICC，仅预览级颜色）。');
  if (cmyk && (fmt === 'jpg' || fmt === 'tiff')) notes.push('CMYK 分色由服务端完成；未选 ICC 时走 libvips 内置公式，颜色不准。');
  if (fmt === 'tiff') notes.push('TIFF 由服务端编码（浏览器无法直接生成 TIFF）。');
  if (fmt === 'psd' && !cmyk) notes.push('保留图层结构、智能对象 warp 与文字可编辑（8bit）。');
  if (cmyk && EXTRA_EXPORT.has(fmt)) notes.push('这个格式按 RGB 输出。');
  if (fmt === 'pdf') notes.push('拼合成一页图像 PDF（页面尺寸按文档分辨率换算）；PS 打开是一张图像，不保留图层。');
  if (fmt === 'png8' || fmt === 'gif') notes.push('量化到 256 色（可选择性调板 + 扩散仿色），alpha < 50% 的像素透明。要细调颜色数 / 仿色用「存储为 Web 所用格式」。');
  if (fmt === 'ico') notes.push('一个文件里存 16 / 24 / 32 / 48 / 64 / 128 / 256 多个尺寸（PNG 压缩）；建议先把画布裁成正方形。');
  if (fmt === 'exr' || fmt === 'hdr') notes.push('按 sRGB 解码成线性光写成浮点（' + (fmt === 'exr' ? '16 位半浮点，ZIP 压缩' : 'RGBE，RLE') + '）。');
  

  const abN = (!docStack.length && docArtboards().length) || 0;
  $('#exportAbRow').hidden = !(abN && fmt !== 'psd');
  $('#exportAbCount').textContent = abN;
  if (fmt !== 'psd') notes.push(abN && $('#exportPerArtboard').checked ? '位图按画板裁切，每块画板一个文件。' : '位图输出为当前画布合成结果。');
  $('#exportNote').textContent = notes.join('\n');
}
async function fetchIccProfiles(){
  const sel = $('#exportIcc');
  const cur = sel.value;
  try {
    const j = await api.profiles();
    sel.innerHTML = '<option value="">（无）</option>';
    for (const p of (j.profiles || [])) {
      const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; sel.appendChild(o);
    }
  } catch { sel.innerHTML = '<option value="">（无 —— 未检测到服务端）</option>'; }
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}
$('#exportFormat').onchange = () => { syncExportDlg(); if ($('#modeSel').value === 'cmyk') fetchIccProfiles(); };
if ($('#exportPdfComp')) $('#exportPdfComp').onchange = () => syncExportDlg();
$('#modeSel').onchange = () => {
  
  
  set_proofOn(false);
  try { CM.setProof($('#modeSel').value === 'cmyk' && !(doc && doc.mode === 4)); } catch {}
  if (doc) { if (li) { renderStaticLayers(); renderWarpNow(); } else renderPreviewOnly(); }
  if ($('#exportDlg').open) { syncExportDlg(); if ($('#modeSel').value === 'cmyk') fetchIccProfiles(); }
};
export function showExportDlg(){
  if(!origBuffer){ $('#err').textContent='先打开一个 PSD'; return; }
  const lines = [];
  if (docStack.length) lines.push('· 当前在智能对象内部：导出的是这个智能对象里的文档（要导出整份文档，先「返回上级」）');
  const soKeys = Object.keys(soEdits);
  const deformN = soKeys.filter(k => soEdits[k].deforms || soEdits[k].deform).length;
  const quilt = soKeys.filter(k => { const so = sos[+k]; return so && !soEdits[k].deforms && !soEdits[k].deform && needsQuiltRewrite(so, soEdits[k].points); }).length;
  if (soKeys.length - deformN) lines.push(`· 智能对象 warp 变形 ${soKeys.length - deformN} 个${quilt ? `（${quilt} 个网格已拆分，写为 quiltWarp）` : ''}`);
  const deformNewN = soKeys.filter(k => soEdits[k].created).length;
  if (deformN - deformNewN) lines.push(`· 透视/操控变形顶点编辑 ${deformN - deformNewN} 个（写回智能滤镜，PS 里可继续编辑）`);
  if (deformNewN) lines.push(`· 新建变形滤镜 ${deformNewN} 条（整条滤镜从零写进 SoLd，PS 里可继续编辑）`);
  for (const k of Object.keys(soRepl)) lines.push(`· 「${(sos[+k] && sos[+k].layerName) || k}」替换图「${soRepl[k].file.name}」按覆盖模式烘焙进内嵌源图`);
  for (const k of Object.keys(soInside)) if (soInside[k].changed) lines.push(`· 「${(sos[+k] && sos[+k].layerName) || k}」内部编辑写回内嵌源图`);
  if (Object.keys(layerEdits).length) lines.push(`· ${Object.keys(layerEdits).length} 个图层的可见性/不透明度/混合模式`);
  if (Object.keys(layerTextEdits).length) lines.push(`· 文字编辑 ${Object.keys(layerTextEdits).length} 处${Object.keys(textFontSubst).length ? `（换字体 ${Object.keys(textFontSubst).length} 处）` : ''}`);
  if (Object.keys(layerRenames).length) lines.push(`· 重命名 ${Object.keys(layerRenames).length} 个图层`);
  for (const k of Object.keys(layerOps)) {
    const nm = (layerTree && layerTree.flat[+k] && (layerRenames[k] || layerTree.flat[+k].name)) || ('图层 ' + k);
    lines.push(`· 「${nm}」${layerOps[k].map(opLabel).join('；')}`);
  }
  const nT = Object.keys(layerTransforms).filter(k => transformChanged(+k)).length;
  if (nT) lines.push(`· ${nT} 个图层的位置/大小/翻转/旋转（烘焙为栅格）`);
  if (layerDeletes.size) lines.push(`· 删除 ${layerDeletes.size} 个图层`);
  if (layerReorder) lines.push('· 图层顺序已调整');
  if (layerDupes.length) lines.push(`· 复制图层 ${layerDupes.length} 个（字节级克隆 + 预览像素）`);
  if (!lines.length || (docStack.length && lines.length === 1)) lines.push('· 暂无修改：按原样导出（同步缓存栅格与合成图）');
  $('#exportSummary').textContent = '将写入：\n' + lines.join('\n');
  

  const stem = (docName || '').replace(/\.psd$/i, '');
  if (!exportName || exportName === 'modified') exportName = stem ? stem + ' 副本' : 'modified';
  try {
    const lastFmt = localStorage.getItem('psd_editor:export-format');
    if (lastFmt && [...$('#exportFormat').options].some(o => o.value === lastFmt)) $('#exportFormat').value = lastFmt;
  } catch {}
  $('#exportName').value = exportName;
  syncExportDlg();
  if ($('#modeSel').value === 'cmyk') fetchIccProfiles();
  const dlg = $('#exportDlg');
  dlg.returnValue = '';
  dlg.showModal();
}
$('#exportDlg').onclose = null;   
$('#exportPerArtboard').addEventListener('change', () => syncExportDlg());
$('#exportName').addEventListener('input', () => { $('#exportName').dataset.touched = '1'; });
function handleExportConfirm(){
  const dlg = $('#exportDlg');
  if (dlg.returnValue !== 'ok') return;
  const name = ($('#exportName').value.trim() || 'modified').replace(/\.psd$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  exportName = name;
  try {
    localStorage.setItem('psd_editor:export-name', name);
    localStorage.setItem('psd_editor:export-format', $('#exportFormat').value);
  } catch {}
  runExport(name);
  { const f = $('#exportFormat').value; actRecord('save', { format: f === 'png' ? 'png' : /jpe?g/.test(f) ? 'jpg' : 'psd', copy: true }); }
}
$('#exportOk').onclick = () => { $('#exportDlg').close('ok'); handleExportConfirm(); };
$('#exportCancel').onclick = () => $('#exportDlg').close('cancel');


async function serverRender(buf, out){
  return api.render(buf, { replacements: [], output: out });
}
export function canvasToBlob(cv, fmt, quality){
  return new Promise((res, rej) => {
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    cv.toBlob(b => b ? res(b) : rej(new Error(fmt.toUpperCase() + ' 编码失败')), mime, quality / 100);
  });
}

function rgbPlanesToCmyk(r, g, b, n){
  const C = new Uint8Array(n), M = new Uint8Array(n), Y = new Uint8Array(n), K = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const rr = r[i] / 255, gg = (g ? g[i] : r[i]) / 255, bb = (b ? b[i] : r[i]) / 255;
    const k = 1 - Math.max(rr, gg, bb), ik = 1 - k;
    C[i] = Math.round(255 - (ik > 1e-6 ? (1 - rr - k) / ik : 0) * 255);
    M[i] = Math.round(255 - (ik > 1e-6 ? (1 - gg - k) / ik : 0) * 255);
    Y[i] = Math.round(255 - (ik > 1e-6 ? (1 - bb - k) / ik : 0) * 255);
    K[i] = Math.round(255 - k * 255);
  }
  return [C, M, Y, K];
}

async function convertDocCmykLocal(buf){
  
  try { const out = await CM.bufferToWorkingCmyk(buf); if (out) return out; } catch (e) { console.warn('ICC 分色失败，退回快速分色', e); }
  const finalDoc = await parsePsdRaster(buf, { keepPlanes: true, strictChannels: true });
  if (finalDoc.depth !== 8) throw new Error('CMYK 导出仅支持 8 位/通道文档');
  if (finalDoc.mode === 4) return buf;
  if (finalDoc.mode !== 3 && finalDoc.mode !== 1) throw new Error(`CMYK 导出仅支持 RGB / 灰度文档（当前 mode=${finalDoc.mode}）`);
  const layerPlanes = new Map();
  for (let i = 0; i < finalDoc.layers.length; i++) {
    const l = finalDoc.layers[i], p = l.planes || {}, planes = [];
    if (l.width > 0 && l.height > 0 && p[0]) {
      const [c, m, y, k] = rgbPlanesToCmyk(p[0], p[1], p[2], l.width * l.height);
      planes.push({ id: 0, data: c }, { id: 1, data: m }, { id: 2, data: y }, { id: 3, data: k });
      planes.push({ id: -1, data: p[-1] || new Uint8Array(l.width * l.height).fill(255) });
    }
    layerPlanes.set(i, { bounds: l.bounds, planes });
  }
  
  const surf = compositeAll(finalDoc, finalDoc.width, finalDoc.height, new Map());
  flatten(surf, [255, 255, 255]);
  const n = finalDoc.width * finalDoc.height;
  const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n);
  for (let i = 0; i < n; i++) { R[i] = surf.data[i*4]; G[i] = surf.data[i*4+1]; B[i] = surf.data[i*4+2]; }
  const [c, m, y, k] = rgbPlanesToCmyk(R, G, B, n);
  const mplanes = [c, m, y, k];
  if (finalDoc.channels > 3) { const A = new Uint8Array(n); for (let i = 0; i < n; i++) A[i] = surf.data[i*4+3]; mplanes.push(A); }
  return rebuildPsdChannels(buf, layerPlanes, { planes: mplanes }, { colorMode: 'cmyk' }).buffer;
}









function psdHeaderSize(buf){
  try { const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0); return { w: dv.getUint32(18), h: dv.getUint32(14) }; } catch { return null; }
}




export async function ensureStructuralBase(base = origBuffer){
  try { if (base && parsePsdFull(base).layers.length) return base; } catch {}
  const source = doc?.layers?.find(l => l?.lazyRasterSource);
  if (!source || !docW || !docH) return base;
  const m = await NEWDOC.load();
  const out = m.createPsd({ width: 1, height: 1, background: 'transparent', name: source.name || '图层 0' });
  const dv = new DataView(out); dv.setUint32(14, docH); dv.setUint32(18, docW);
  return out;
}
async function buildSparsePsdBuffer(opts){
  const original=origBuffer,width=docW,height=docH,metadata=previewCompositeDoc(doc).layers.map(l=>({mask:l.mask,vectorMask:l.vectorMask,effects:l.effects,fill:l.fill,adjustment:l.adjustment,group:l.group,blendIf:cloneOpValue(l.blendIf),channelsOff:l.channelsOff?.slice(),knockout:l.knockout}));
  if(vpDirty||toolData&&Object.values(toolData.dirty).some(Boolean)||DOC_EXT.some(x=>x.needsWrite?.())||Object.keys(layerTextEdits).length||Object.keys(textStyleEdits).length||Object.keys(textDescEdits).length||Object.keys(soFilterEdits).length||Object.values(soInside).some(s=>s.changed))throw new Error('此超大文档的附加编辑项目尚未接入分块写回，请保留当前编辑状态');
  if(layerDeletes.size||layerDupes.length||layerReorder||Object.keys(layerTransforms).some(i=>transformChanged(+i))||Object.keys(soEdits).length||Object.keys(soRepl).length||Object.keys(soBaked).length||workPathDirty||savedPathsDirty||slicesDirty||docSizeBase&&(width!==docSizeBase.w||height!==docSizeBase.h))throw new Error('此超大文档的结构、文字或变换修改尚未接入分块写回，请保留当前编辑状态');
  const ops=allLayerOps().filter(o=>o.op!=='sparsePixels').map(o=>{const c=cloneOpValue(o);if(c.rgba?.data)c.rgba={...c.rgba,data:c.rgba.data.slice()};return c;}),properties=Object.values(layerEdits).map(e=>({...e})),names=Object.entries(layerRenames);
  

  const inserts=ops.filter(o=>['addAdjustmentLayer','addShapeLayer','createLayer','addFillLayer'].includes(o.op)&&Number.isInteger(o.at)).map(o=>o.at).sort((a,b)=>a-b);
  const changes=Object.entries(pixelPaint).filter(([,p])=>p.sparse?.tiles.size).map(([index,p])=>({index:inserts.reduce((n,at)=>n+(at<=+index?1:0),+index),tiles:[...p.sparse.tiles.values()]}));
  const resolution=docResolution!==docResolutionBase?resolutionInfoBytes(docResolution):null;
  const guideResource=guidesDirty?resourceHandler(1032)?.write({gridHorizontal:guidesGrid.h||0,gridVertical:guidesGrid.v||0,guides:guides.map(g=>({location:Math.round(g.px*32),vertical:!!g.vertical}))}):null;
  const lights=globalLightDirty?[globalLight.angle,globalLight.altitude]:null;
  opts.onSnapshot?.();
  let buf=original;
  if(properties.length)buf=writeLayerProperties(original.slice(0),properties);
  if(ops.length){if(!EDITM)await EDIT.load();buf=applyEdits(buf,ops,{verify:false}).buffer;}
  for(const [i,name]of names)buf=renameLayer(buf,+i,name);
  if(resolution)buf=writeImageResource(buf,1005,resolution);
  if(guideResource)buf=writeImageResource(buf,1032,guideResource);
  if(lights)for(const [id,v]of[[1037,lights[0]],[1049,lights[1]]]){const b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,Math.round(v));buf=writeImageResource(buf,id,b);}
  const {patchPsdSparsePixels}=await import('../../../core/psd-sparse-write.js');
  const result=await patchPsdSparsePixels(buf,changes,{merged:!opts.fast,metadata});
  const notes={warp:0,quilted:0,deformed:0,deformNew:0,composite:result.composite,skipped:[],srcNotes:[],tiled:true,sparseTiles:changes.reduce((n,c)=>n+c.tiles.length,0)};
  return {buf:result.buffer,composite:null,canvas:null,notes,fast:!!opts.fast};
}



async function buildLazyStructuralPsdBuffer(opts, lazyRaster){
  const [{ writeLazyRasterPsd }, { readLazyImageTile }] = await Promise.all([
    import('../../../core/psd-lazy-write.js'), import('./21-load-document.js'),
  ]);
  const idx = doc.layers.indexOf(lazyRaster), pp = idx >= 0 ? pixelPaint[idx] : null;
  let buf;
  

  try {
    const current = await ensureStructuralBase(origBuffer);
    if (parsePsdFull(current).layers.length > 1) buf = current;
  } catch {  }
  if (!buf) buf = await writeLazyRasterPsd({ width: docW, height: docH, name: lazyRaster.name || docName || '图层 0',
    readTile: async (x, y) => {
      const base = await readLazyImageTile(lazyRaster, x, y), edit = pp?.sparse?.tiles?.get(`${x}:${y}`);
      return edit ? { x, y, width: edit.width, height: edit.height, data: edit.data } : base;
    }, psb: docW > 30000 || docH > 30000 });
  const ops = allLayerOps().filter(o => o.op !== 'sparsePixels').map(o => cloneOpValue(o));
  if (ops.length) buf = applyEdits(buf, ops, { verify: false }).buffer;
  

  const sparseOps = [];
  for (const [k, p] of Object.entries(pixelPaint)) {
    const i = +k; if (i === idx || !p?.sparse?.tiles?.size) continue;
    const tiles = [...p.sparse.tiles.values()];
    const x0 = Math.min(...tiles.map(t => t.x)), y0 = Math.min(...tiles.map(t => t.y));
    const x1 = Math.max(...tiles.map(t => t.x + t.width)), y1 = Math.max(...tiles.map(t => t.y + t.height));
    if (!(x1 > x0 && y1 > y0)) continue;
    const rgba = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4);
    for (const t of tiles) for (let y = 0; y < t.height; y++)
      rgba.set(t.data.subarray(y * t.width * 4, (y + 1) * t.width * 4), ((t.y + y - y0) * (x1 - x0) + t.x - x0) * 4);
    sparseOps.push({ op: 'replaceLayerPixels', index: i, rgba: { data: rgba, width: x1 - x0, height: y1 - y0 },
      bounds: { top: y0, left: x0, bottom: y1, right: x1 }, opts: { premultiplied: true } });
  }
  if (sparseOps.length) buf = applyEdits(buf, sparseOps, { verify: false }).buffer;
  const attrs = Object.entries(layerEdits).map(([i, e]) => ({ index: +i, ...e }));
  if (attrs.length) buf = writeLayerProperties(buf, attrs);
  for (const [i, name] of Object.entries(layerRenames)) buf = renameLayer(buf, +i, name);
  opts.onSnapshot?.();
  return { buf, canvas: null, composite: null,
    notes: { warp: 0, quilted: 0, deformed: 0, deformNew: 0, composite: false, skipped: [], srcNotes: [], tiled: true,
      structuralTiled: true, sparseTiles: pp?.sparse?.tiles?.size || 0 }, fast: !!opts.fast };
}



async function materializeSmallSparsePaint(){
  if (docW * docH > 64e6) return;
  for (const [key, pp] of Object.entries(pixelPaint)) {
    if (!pp?.sparse?.tiles?.size) continue;
    const index = +key, layer = doc?.layers?.[index];
    if (!layer || !(pp.w > 0 && pp.h > 0)) continue;
    const data = await pp.sparse.readRect({ x: 0, y: 0, w: pp.w, h: pp.h });
    dropLayerOp(index, 'sparsePixels');
    putLayerOp(index, { op: 'replaceLayerPixels', index,
      rgba: { data, width: pp.w, height: pp.h },
      bounds: { top: pp.top, left: pp.left, bottom: pp.top + pp.h, right: pp.left + pp.w },
      opts: { premultiplied: true } });
    pp.rgba = data; layer.rgba = data; layer.width = pp.w; layer.height = pp.h;
    layer.bounds = { top: pp.top, left: pp.left, bottom: pp.top + pp.h, right: pp.left + pp.w };
  }
}
export async function buildPsdBuffer(opts = {}){
  const lazyRaster = doc?.layers?.find(l => l?.lazyRasterSource);
  const onlySparsePaint = lazyRaster && doc.layers.length === 1
    && allLayerOps().every(o => o.op === 'sparsePixels')
    && !Object.keys(layerEdits).length && !Object.keys(layerRenames).length
    && !Object.keys(layerTextEdits).length && !Object.keys(textStyleEdits).length
    && !Object.keys(textDescEdits).length && !layerDeletes.size && !layerReorder
    && !layerDupes.length && !Object.keys(layerTransforms).some(i => transformChanged(+i));
  if (lazyRaster && doc.layers.length === 1 && (!hasAnyEdits() || onlySparsePaint)) {
    const [{ writeLazyRasterPsd }, { readLazyImageTile }] = await Promise.all([import('../../../core/psd-lazy-write.js'), import('./21-load-document.js')]);
    const idx = doc.layers.indexOf(lazyRaster), pp = idx >= 0 ? pixelPaint[idx] : null;
    const buf = await writeLazyRasterPsd({ width: docW, height: docH, name: lazyRaster.name || docName || '图层 0', readTile: async (x, y) => {
      const base = await readLazyImageTile(lazyRaster, x, y), edit = pp?.sparse?.tiles?.get(`${x}:${y}`);
      return edit ? { x, y, width: edit.width, height: edit.height, data: edit.data } : base;
    }, psb: docW > 30000 || docH > 30000 });
    opts.onSnapshot?.(); return { buf, canvas: null, composite: null, notes: { warp: 0, quilted: 0, deformed: 0, deformNew: 0, composite: false, skipped: [], srcNotes: [], tiled: true }, fast: !!opts.fast };
  }
  if (!origBuffer) throw new Error('先打开一个 PSD');
  if (lazyRaster && doc.layers.length === 1 && hasAnyEdits()) {
    const unsupported = Object.keys(layerTextEdits).length || Object.keys(textStyleEdits).length || Object.keys(textDescEdits).length
      || Object.keys(soEdits).length || Object.keys(soRepl).length || Object.keys(soBaked).length
      || layerDeletes.size || layerDupes.length || layerReorder || Object.keys(layerTransforms).some(i => transformChanged(+i))
      || workPathDirty || savedPathsDirty || slicesDirty
      || (docSizeBase && (docW !== docSizeBase.w || docH !== docSizeBase.h));
    if (unsupported) throw new Error('此超大文档的结构、文字或变换修改尚未接入分块写回，请保留当前编辑状态');
    return buildLazyStructuralPsdBuffer(opts, lazyRaster);
  }
  while(sparsePaintBusy())await flushSparsePaint();
  if(docW*docH>64e6&&!hasAnyEdits()&&!guidesDirty&&!slicesDirty){opts.onSnapshot?.();return {buf:origBuffer,canvas:null,composite:null,notes:{warp:0,quilted:0,deformed:0,deformNew:0,composite:false,skipped:[],srcNotes:[],tiled:true},fast:!!opts.fast};}
  if(docW*docH>64e6&&Object.values(pixelPaint).some(p=>p.sparse)){
    try { return await buildSparsePsdBuffer(opts); }
    catch (e) {
      

      if (lazyRaster && /稀疏写回瓦片越界|稀疏图层不存在/.test(String(e && e.message || e)))
        return buildLazyStructuralPsdBuffer(opts, lazyRaster);
      throw e;
    }
  }
  await materializeSmallSparsePaint();
  captureTextDynamicCarry();
  const hs = opts.fast ? psdHeaderSize(origBuffer) : null;
  const fast = !!(hs && hs.w === docW && hs.h === docH && !li);
  const notes = { warp: 0, quilted: 0, deformed: 0, deformNew: 0, composite: false, skipped: [], srcNotes: [] };
  if (li && cur >= 0) await bakeCurrentSO();        
  
  
  
  
  const editedKeys = [...Object.keys(soEdits), ...Object.keys(soRepl),
    ...Object.keys(soInside).filter(k => soInside[k] && soInside[k].changed)].map(Number);
  for (const k of new Set(editedKeys)) {
    if (soBaked[k] || (li && cur === k)) continue;  
    const so = sos[k]; if (!so) continue;
    try { await bakeSO(k); }
    catch (e) { notes.skipped.push(`「${so.layerName || ('SO' + k)}」栅格烘焙失败：${e.message}（warp 描述符仍会写回，缓存像素保持旧内容）`); }
  }
  
  
  if(!fast&&opts.refreshWarpCaches!==false){
    for(let k=0;k<sos.length;k++){
      const info=sos[k].info?.layerInfo,style=soEdits[k]?.warpOptions?.style||info?.warpOptions?.style;
      if(!style||style==='warpNone'||style==='warpCustom'||info?.deforms?.length)continue;
      try{const result=await bakeSO(k);if(!result)throw new Error('缺少可渲染的内嵌源图');if(k===cur&&warpSession?.preview){warpSession.preview=null;renderWarpNow();}}
      catch(e){notes.skipped.push(`「${sos[k].layerName}」变形缓存刷新失败：${e.message}`);}
    }
  }
  

  let buf = origBuffer;
  const ownBuf = () => { if (buf === origBuffer) buf = origBuffer.slice(0); };
  
  for (const k in soEdits) {
    const e = soEdits[k], so = sos[+k];
    if (!so) continue;
    try {
      
      const edit = (e.deforms && e.deforms.length)
        ? { deforms: e.deforms.map(x => ({ deform: deformToJSON(x.deform), ...(x.at != null ? { at: x.at } : {}), ...(x.create ? { create: true } : {}) })) }
        : e.deform ? { deform: deformToJSON(e.deform), ...(e.created ? { create: true } : {}) }
        : { points: e.points, xn: e.xn, yn: e.yn, sliceX: e.sliceX, sliceY: e.sliceY, warpOptions:e.warpOptions };
      const r = await api.writeback(smartObjectFragment(buf, so), edit);
      buf = replacePlacedBlocks(buf, so, r.blocks).buffer;
      if (r.mode === 'deformCreate') notes.deformNew++;
      else if (r.mode === 'deform') notes.deformed++;
      else { notes.warp++; if (r.mode === 'quiltWarp') notes.quilted++; }
    } catch (err) { notes.skipped.push((so.layerName || ('SO' + k)) + '：' + err.message); }
  }
  




  notes.filters = 0;
  for (const k of Object.keys(soFilterEdits)) {
    const so0 = sos[+k]; if (!so0) continue;
    const payload = filterEditsPayload(+k); if (!payload) continue;
    try {
      const fresh = parseSmartObjects(buf);
      const so = fresh[+k] || fresh.find(s2 => (s2.layerName || '') === (so0.layerName || ''));
      if (!so) throw new Error('这一层的智能对象在当前文档里找不到了');
      const j = await filterPost('/so/filters/writeback', { fragment: fragmentToJSON(smartObjectFragment(buf, so)), edits: payload });
      buf = replacePlacedBlocks(buf, so, (j.blocks || []).map(b => ({ key: b.key, data: b64ToU8(b.data) }))).buffer;
      notes.filters++;
      if (j.warnings && j.warnings.length) notes.srcNotes.push(`「${so.layerName}」智能滤镜：${j.warnings.join('；')}`);
    } catch (e) { notes.skipped.push((so0.layerName || ('SO' + k)) + ' 智能滤镜：' + filterErrorText(e)); }
  }
  
  
  const N0 = doc.layers.length - layerDupes.length;
  const layerEditArr = Object.keys(layerEdits).map(i => ({ index: +i, ...layerEdits[i] }));
  const cloneEdits = layerEditArr.filter(e => e.index >= N0);
  if (layerEditArr.length !== cloneEdits.length) { ownBuf(); buf = writeLayerProperties(buf, layerEditArr.filter(e => e.index < N0)); }
  notes.layerEdits = layerEditArr.length;
  






  const allOps = allLayerOps();
  
  if (allOps.length && !EDITM) {
    try { await EDIT.load(); }
    catch (e) { throw new Error(`图层属性写回失败：「${EDIT.label}」模块没能加载（${(e && e.message) || e}）—— 检查网络后重试，或刷新页面重新打开文件。`); }
  }
  
  
  const attrOps = [], cloneOps = [];
  for (const o of allOps.filter(o => !MASK_STRUCTURAL_OPS.has(o.op))) (o.index >= N0 ? cloneOps : attrOps).push(o);
  const maskOps = allOps.filter(o => MASK_STRUCTURAL_OPS.has(o.op));
  const cloneMaskOps = maskOps.filter(o => o.index >= N0);
  for (const o of cloneMaskOps) notes.skipped.push(`「${(layerTree.flat[o.index] || {}).name || '克隆图层'}」：复制图层暂不支持新建/删除/应用蒙版，这条改动没有写入`);
  notes.attrWarn = [];
  
  const runAttrOps = (ops, ab) => {
    try { const r = applyEdits(ab, ops, { verify: false }); notes.attrWarn.push(...r.warnings); return r.buffer; }
    catch (e) {
      const bad = ops[e.opIndex] || null;
      throw new Error('图层属性写回失败' + (bad ? `（图层 ${bad.index}「${(layerTree.flat[bad.index] || {}).name || ''}」的「${opLabel(bad)}」）` : '') + '：' + e.message);
    }
  };
  if (attrOps.length) buf = runAttrOps(attrOps, buf);        
  notes.attrOps = allOps.length;
  


  const textKeys = [...new Set([...Object.keys(layerTextEdits), ...Object.keys(textStyleEdits), ...Object.keys(textDescEdits)])];
  

  if (textKeys.length) (layerTree.flat || []).forEach((L, k) => { if (L && L.text && L.text.pathTextFrom === 'txt2' && !layerDeletes.has(k) && !textKeys.includes(String(k))) textKeys.push(String(k)); });
  
  if (textSheetsForExport()) (layerTree.flat || []).forEach((L, k) => { if (L && L.text && L.text.engineData && !layerDeletes.has(k) && !textKeys.includes(String(k))) textKeys.push(String(k)); });
  for (const k of textKeys) {
    const L = layerTree.flat[+k], sub = textFontSubst[+k], style = textStyleEdits[+k];
    const desc = textDescEdits[+k] || (L && L.text && L.text.pathTextFrom === 'txt2' ? { pathText: L.text.pathText } : undefined);
    if (!L || !L.text) continue;
    const opts = {};
    

    if (desc) {
      if (desc.orientation) opts.orientation = desc.orientation;
      if (desc.antiAlias) opts.antiAlias = desc.antiAlias;
      if (desc.warp) opts.warp = desc.warp;        
      if (desc.pathText !== undefined) opts.textOnPath = desc.pathText && desc.pathText.sub ? buildTextOnPathDesc({ ...desc.pathText, orientation: (effTextInfo(+k, L) || {}).orientation }) : null;   
      if (desc.dynamic !== undefined) opts.dynamicText = desc.dynamic ? buildDynamicTextDesc(desc.dynamic) : null;   
    }
    
    const text0 = layerTextEdits[k] != null ? layerTextEdits[k] : L.text.content;
    const { pub: rangePub, priv: rangePriv } = splitPrivate(textEffSegs(+k, L, text0));
    if (!segsEmpty(rangePriv)) opts.psd_editorText = buildPsdEditorTextDesc({ v: 1, text: text0, segs: rangePriv.filter(sg => Object.keys(sg.patch).length) });
    else if (L.text.priv) opts.psd_editorText = null;
    const sheets = textSheetsForExport();
    const needEngine = sub || style || (desc && (desc.shape || desc.pathText)) || !segsEmpty(rangePub) || sheets;
    if (needEngine && L.text.engineData) {
      let ed = JSON.parse(JSON.stringify(L.text.engineData));
      if (sub) { opts.font = sub.psName; ed = setEngineFont(ed, sub.psName); }
      if (style) {                                         
        const pick = {};
        for (const k of [...TEXT_CHAR_KEYS, ...TEXT_PARA_KEYS]) if (style[k] !== undefined) pick[k] = style[k];
        ed = setEngineStyle(ed, pick);
      }
      if (desc && desc.shape === 'box' && Array.isArray(desc.box)) ed = setEngineParagraphBox(ed, desc.box[0], desc.box[1]);
      else if (desc && desc.shape === 'point') ed = setEnginePointText(ed, desc.pointBase || L.text.pointBase || [0, 0]);
      if (desc && desc.pathText && desc.pathText.sub) ed = setEnginePathFallback(ed, desc.pathText);   
      if (!segsEmpty(rangePub)) { setEngineText(ed, String(text0).replace(/\r?\n/g, '\r')); applyRangeStyles(ed, rangePub); }   
      if (sheets) writeStyleSheets(ed, sheets);            
      opts.engineData = ed;
    }
    const text = layerTextEdits[k] != null ? layerTextEdits[k] : L.text.content;
    buf = editLayerText(buf, +k, text, opts);
    
    if (desc && desc.shape === 'box' && Array.isArray(desc.box) && (desc.box[2] || desc.box[3]) && !transformChanged(+k)) {
      try { buf = setTextLayerMeta(buf, +k, { transform: effTextInfo(+k, L).transform }); }
      catch (e) { notes.skipped.push(`文字层 ${k} 段落框位置写回：${e.message}`); }
    }
  }
  notes.textEdits = Object.keys(layerTextEdits).length;
  notes.textStyles = Object.keys(textStyleEdits).length;
  notes.textDescs = Object.keys(textDescEdits).length;
  
  for (const k of Object.keys(layerRenames)) buf = renameLayer(buf, +k, layerRenames[k]);
  notes.renames = Object.keys(layerRenames).length;

  
  
  let mc = null, merged = null;
  if (!fast) {
    mc = document.createElement('canvas'); mc.width = docW; mc.height = docH;
    paintLayersExport(mc.getContext('2d'), displayOrder());   
    merged = mc.getContext('2d').getImageData(0, 0, docW, docH).data;
  }

  
  const soDone = new Set();
  for (const k of Object.keys(soBaked)) {
    const b = soBaked[k], so = sos[+k];
    if (!so || layerDeletes.has(b.layerIdx)) continue;
    try {
      const fresh = parseSmartObjects(buf);          
      const curSo = fresh[+k] || fresh.find(s2 => (s2.layerName || '') === (so.layerName || ''));
      const si = curSo && curSo.sourceImage;
      const rp = soRepl[k], ins = soInside[k];
      let sourcePatch = null, fePatch = null;
      if (si && si._off && si.embedded) {
        if (rp) {
          const li2 = freshLayerInfo(so);
          if (li2.width > 0 && li2.height > 0) {
            const bytes = await bakeReplacementPng(rp.img, li2.width, li2.height, rp.fit);
            sourcePatch = { off: si._off, bytes, filename: pngFilename(rp.file.name), oldFilename: si.filename, fileType: 'png ' };
            notes.srcNotes.push(`「${so.layerName}」内嵌源图已换成 ${rp.file.name}`);
          }
        } else if (ins && ins.changed && ins.bytes) {
          sourcePatch = { off: si._off, bytes: new Uint8Array(ins.bytes), filename: si.filename, oldFilename: si.filename,
                          fileType: ((si.fileTypeRaw || '8BPB') + '    ').slice(0, 4) };
          notes.srcNotes.push(`「${so.layerName}」内部编辑已写回内嵌源图`);
        }
      } else if (si && !si.embedded && (rp || (ins && ins.changed))) notes.srcNotes.push(`「${so.layerName}」是外部链接文件，未替换源图`);
      
      if (so.info && so.info.summary && so.info.summary.deformFilter && (rp || (ins && ins.changed && ins.composite))) {
        try {
          fePatch = buildFilterEffectsPatch({ so, buffer: buf, image: rp ? rp.img : ins.composite, fit: rp ? rp.fit : { mode: 'stretch' },
            docWidth: docW, docHeight: docH, backend, renderWarp, layerInfoBase: freshLayerInfo(so, true), imageKey: 'feid' + k + '#' + (set_bakeSeq(bakeSeq + 1)) });
        } catch (e) { notes.srcNotes.push(`「${so.layerName}」滤镜缓存更新失败：${e.message}`); }
      }
      
      
      
      
      const fileRgba = b.raw || b.rgba;
      const rgba = fileRgba.length ? fileRgba : new Uint8ClampedArray(4);
      const bounds = fileRgba.length ? b.bounds : { top: 0, left: 0, bottom: 1, right: 1 };
      const origB = soOrigRaster[b.layerIdx] && soOrigRaster[b.layerIdx].bounds;
      const mE = doc.layers[b.layerIdx] && doc.layers[b.layerIdx].mask;
      const maskOriginDelta = mE && mE.relative && origB && (origB.top !== b.bounds.top || origB.left !== b.bounds.left)
        ? { top: origB.top - b.bounds.top, left: origB.left - b.bounds.left } : undefined;
      buf = rebuildPsdReplacingLayerPixels(buf, b.layerIdx, rgba, bounds, null , { sourcePatch, filterEffectsPatch: fePatch, maskOriginDelta }).buffer;
      soDone.add(b.layerIdx);
    } catch (e) { notes.skipped.push((so.layerName || ('SO' + k)) + ' 栅格/源图：' + e.message); }
  }
  notes.soBaked = soDone.size;
  






  notes.textRaster = 0;
  for (const k of Object.keys(textRenders)) {
    if (transformChanged(+k)) continue;                                
    if (layerTextEdits[k] == null && textOwnRaster(+k)) continue;      
    const cp = textCrops[k]; if (!cp) continue;
    buf = rebuildPsdReplacingLayerPixels(buf, +k, cp.rgba, cp.bounds, null ).buffer;
    notes.textRaster++;
  }
  
  
  notes.transforms = 0;
  
  const cropClip = pendingCropDelete ? { x: 0, y: 0, width: docW, height: docH } : null;
  const cloneTransforms = [];
  for (const k of Object.keys(layerTransforms)) {
    const i = +k;
    if (layerDeletes.has(i)) continue;
    if (i >= N0) { cloneTransforms.push(i); continue; }
    const l = doc.layers[i];
    if (!l || l.hidden) continue;
    const c = rasterizeTransformed(i, { clip: cropClip });
    if (!c) continue;
    
    const mk = transformedMaskFor(i, cropClip);
    if (mk) {
      try {
        await EDIT.load();
        const b = mk.relative ? { top: mk.bounds.top - c.bounds.top, left: mk.bounds.left - c.bounds.left,
                                  bottom: mk.bounds.bottom - c.bounds.top, right: mk.bounds.right - c.bounds.left } : mk.bounds;
        if (mk.isNew) {
          
          const k = maskOps.findIndex(o => o.op === 'addLayerMask' && o.index === i);
          const base = k >= 0 ? maskOps[k] : { op: 'addLayerMask', index: i };
          if (k >= 0) maskOps.splice(k, 1);
          buf = applyEdits(buf, [{ ...base, gray: mk.gray, bounds: b }]).buffer;
        } else buf = applyEdits(buf, [{ op: 'replaceLayerMask', index: i, gray: mk.gray, bounds: b }]).buffer;
      } catch (e) { notes.skipped.push(`「${layerNameOf(i)}」的蒙版没能跟着变换：${e.message}`); }
    }
    
    buf = rebuildPsdReplacingLayerPixels(buf, i, c.rgba, c.bounds, null , { premultiplied: !textRenders[i] }).buffer;
    notes.transforms++;
    ownBuf();
    buf = writeTextTransform(buf, i, i, notes);
    buf = writeSoPlacement(buf, i, i, notes);
  }
  











  notes.maskOps = maskOps.length;
  if (maskOps.length) buf = runAttrOps(maskOps, buf);
  
  notes.reordered = false; notes.deleted = layerDeletes.size; notes.dupes = 0;
  const N0f = doc.layers.length - layerDupes.length;
  const baseOrder = layerReorder || layerTree.flat.map(l => l.index);
  const finalOrder = baseOrder.filter(i => !layerDeletes.has(i));
  const origOrder = layerTree.flat.map(l => l.index);
  const changed = layerDupes.length > 0 || finalOrder.length !== origOrder.length
    || (layerReorder && layerReorder.some((v, i) => v !== origOrder[i]));
  if (changed) {
    
    buf = reorderLayers(buf, finalOrder.map(i => i < N0f ? i : { dup: layerDupes[i - N0f].src }));
    notes.reordered = !!layerReorder;
    notes.dupes = layerDupes.length;
  }
  



  for (let p = 0; p < finalOrder.length; p++) {
    const s = finalOrder[p];
    if (s < N0f) continue;
    const d = layerDupes[s - N0f], cl = doc.layers[s];
    try {
      buf = renameLayer(buf, p, layerRenames[s] || d.name);
      
      
      const tr = transformChanged(s);
      if (tr) {
        const c = rasterizeTransformed(s, { clip: cropClip });
        if (c) buf = rebuildPsdReplacingLayerPixels(buf, p, c.rgba, c.bounds, null , { premultiplied: true }).buffer;
        buf = writeTextTransform(buf, s, p, notes, d.src);
        buf = writeSoPlacement(buf, s, p, notes, d.src);
      } else if (cl.rgba && cl.width > 0) {
        buf = rebuildPsdReplacingLayerPixels(buf, p, cl.rgba, cl.bounds, null , { premultiplied: true }).buffer;
      }
      const cops = cloneOps.filter(o => o.index === s);
      if (cops.length) buf = runAttrOps(cops.map(o => ({ ...o, index: p })), buf);
      const ce = cloneEdits.find(e => e.index === s);
      if (ce) { ownBuf(); buf = writeLayerProperties(buf, [{ ...ce, index: p }]); }
    } catch (e) { notes.skipped.push(`「${d.name}」克隆落地：${e.message}`); }
  }
  


  try {
    const tl = parsePsdFull(buf).layers.map((l, k) => ({ k, t: l.text })).filter(x => x.t);
    const seen = new Set();
    let next = Math.max(-1, ...tl.map(x => +x.t.TextIndex).filter(Number.isFinite)) + 1;
    for (const x of tl) {
      const n = +x.t.TextIndex;
      if (Number.isFinite(n) && !seen.has(n)) { seen.add(n); continue; }
      buf = setTextLayerMeta(buf, x.k, { textIndex: next });
      seen.add(next++); notes.textIndexFixed = (notes.textIndexFixed || 0) + 1;
    }
  } catch (e) { notes.skipped.push('文字层编号去重：' + e.message); }
  


  try {
    if (!(buf instanceof ArrayBuffer)) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    let dv = new DataView(buf);
    const ids = parsePsdFull(buf).layers.map(l => { const b = (l.blocks || []).find(x => x.key === 'lyid' && x.dataLength >= 4); return b ? { off: b.dataOffset, id: dv.getUint32(b.dataOffset) } : null; });
    let next = Math.max(0, ...ids.filter(Boolean).map(x => x.id)) + 1;
    const seen = new Set();
    for (const x of ids) {
      if (!x) continue;
      if (!seen.has(x.id)) { seen.add(x.id); continue; }
      if (buf === origBuffer) { ownBuf(); dv = new DataView(buf); }
      dv.setUint32(x.off, next); seen.add(next++); notes.layerIdFixed = (notes.layerIdFixed || 0) + 1;
    }
  } catch (e) { notes.skipped.push('图层 id 去重：' + e.message); }
  



  if (docSizeBase && (docW !== docSizeBase.w || docH !== docSizeBase.h)) {
    ownBuf();
    const dvh = new DataView(buf);
    dvh.setUint32(14, docH); dvh.setUint32(18, docW);
    notes.docSize = `${docSizeBase.w}×${docSizeBase.h} → ${docW}×${docH}`;
  }
  if (Math.abs(docResolution - docResolutionBase) > 1e-6) {
    
    try { buf = writeImageResource(buf, 1005, resolutionInfoBytes(docResolution)); notes.resolution = docResolution; }
    catch (e) { notes.skipped.push('分辨率资源 1005：' + e.message); }
  }
  



  if (globalLightDirty) {
    try {
      const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, Math.round(v)); return b; };
      buf = writeImageResource(buf, 1037, i32(globalLight.angle));
      buf = writeImageResource(buf, 1049, i32(globalLight.altitude));
      notes.globalLight = `${globalLight.angle}° / ${globalLight.altitude}°`;
    } catch (e) { notes.skipped.push('全局光资源 1037/1049：' + e.message); }
  }
  



  if (guidesDirty) {
    try {
      const h = resourceHandler(1032);
      if (!h || !h.write) throw new Error('没有 1032 的写入口径');
      if (guides.length || guidesGrid.h || guidesGrid.v) {
        buf = writeImageResource(buf, 1032, h.write({
          gridHorizontal: guidesGrid.h || 0, gridVertical: guidesGrid.v || 0,
          guides: guides.map(g => ({ location: Math.round(g.px * 32), vertical: !!g.vertical })),
        }));
        notes.guides = guides.length;
      } else {
        buf = removeImageResource(buf, 1032);
        notes.guides = 0;
      }
    } catch (e) { notes.skipped.push('参考线资源 1032：' + (e && e.message || e)); }
  }
  
  if (vpDirty && vpMod) {
    try {
      if (vpPlanesDoc && vpPlanesDoc.length) { buf = writeImageResource(buf, vpMod.VP_RESOURCE_ID, vpMod.serializeVP(vpPlanesDoc)); notes.vanishingPoint = vpPlanesDoc.length; }
      else buf = removeImageResource(buf, vpMod.VP_RESOURCE_ID);
    } catch (e) { notes.skipped.push('消失点资源 4090：' + (e && e.message || e)); }
  }
  
  if (slicesDirty && docSlices && !docSlices.readOnly) {
    try {
      const h = resourceHandler(1050);
      if (!h || !h.write) throw new Error('没有 1050 的写入口径');
      if (docSlices.slices.length) {
        buf = writeImageResource(buf, 1050, h.write({
          version: 6,
          bounds: { top: 0, left: 0, bottom: docH, right: docW },
          groupName: docSlices.groupName || '', __noNul: docSlices.__noNul || {},
          slices: docSlices.slices, _extra: docSlices._extra || null,
        }), { exact: true });
        notes.slices = docSlices.slices.length;
      } else {
        buf = removeImageResource(buf, 1050);
        notes.slices = 0;
      }
    } catch (e) { notes.skipped.push('切片资源 1050：' + (e && e.message || e)); }
  }
  



  if (workPathDirty) {
    try {
      if (!EDITM) await EDIT.load();
      const M = EDIT.get();
      if (workPath && workPath.subpaths.length) {
        const fail = msg => new Error(msg);
        const norm = M.normalizeSubpathInput(workPath.subpaths, 'pixel', fail);
        buf = writeImageResource(buf, 1025, M.writePathRecords(M.freshPathRecords(norm, docW, docH, fail)));
        notes.workPath = workPath.subpaths.length;
      } else {
        buf = removeImageResource(buf, 1025);
        notes.workPath = 0;
      }
    } catch (e) { notes.skipped.push('工作路径资源 1025：' + (e && e.message || e)); }
  }
  



  if (savedPathsDirty) {
    try {
      if (!EDITM) await EDIT.load();
      const M = EDIT.get();
      const fail = msg => new Error(msg);
      for (const r of docImageResources(buf)) if (r.id >= 2000 && r.id <= 2997) buf = removeImageResource(buf, r.id);
      savedPaths.slice(0, 998).forEach((p, i) => {
        const recs = p.subpaths.length ? M.writePathRecords(M.freshPathRecords(M.normalizeSubpathInput(p.subpaths, 'pixel', fail), docW, docH, fail)) : new Uint8Array(0);
        const name = encodePathName(p.name) || `Path ${i + 1}`;
        buf = writeImageResource(buf, 2000 + i, recs, { name });
      });
      notes.savedPaths = savedPaths.length;
    } catch (e) { notes.skipped.push('已保存路径资源 2000+：' + (e && e.message || e)); }
  }
  
  
  if (!fast) {
  try {
    let nativeComposite;
    if(doc.mode===4){
      const finalDoc=await parsePsdRaster(buf,{keepNativePlanes:true,strictChannels:true,codec:null});nativeComposite=compositeCMYK(finalDoc);
      if(!nativeComposite.supported)throw new Error('CMYK原生合成尚不支持这些状态，保留缓存避免改变黑版：'+nativeComposite.reasons.join('；'));
    }
    buf = replacePsdCompositeImage(buf, merged,{nativeComposite}).buffer; notes.composite = true;
  }
  catch (e) { notes.skipped.push('合成预览缓存：' + e.message); }
  
  try {
    const k = Math.min(1, 160 / Math.max(docW, docH)), tw = Math.max(1, Math.round(docW * k)), th = Math.max(1, Math.round(docH * k));
    const tc = document.createElement('canvas'); tc.width = tw; tc.height = th;
    const t2 = tc.getContext('2d'); t2.fillStyle = '#fff'; t2.fillRect(0, 0, tw, th); t2.imageSmoothingQuality = 'high'; t2.drawImage(mc, 0, 0, tw, th);
    const jb = await new Promise((res, rej) => tc.toBlob(b => b ? res(b) : rej(new Error('JPEG 编码失败')), 'image/jpeg', 0.8));
    buf = writeThumbnail(buf, new Uint8Array(await jb.arrayBuffer()), tw, th);
  } catch (e) { notes.skipped.push('缩略图：' + e.message); }
  }
  

  
  try { const L0 = readLinkGroups(origBuffer); if (L0.byId.size) buf = writeLinkGroups(buf, L0.byId); } catch (e) { notes.skipped.push('图层链接对齐失败：' + e.message); }
  

  for (const x of DOC_EXT) {
    if (!x.writeInto || !(x.needsWrite && x.needsWrite())) continue;
    try { if (!EDITM) await EDIT.load(); ownBuf(); buf = await x.writeInto(buf, { applyEdits, builtIndexOf }); }
    catch (e) { notes.skipped.push(`${x.label || x.key}：${e && e.message || e}`); }
  }
  try { buf = syncLayerCountResources(buf); } catch (e) { notes.skipped.push('图层资源对齐失败：' + e.message); }
  

  try { buf = pruneOrphanLinkedFiles(buf); } catch (e) { notes.skipped.push('清理孤儿内嵌文件失败：' + e.message); }
  if (toolData && Object.values(toolData.dirty).some(Boolean)) { ownBuf(); buf = toolDataAPI.writeToolMetadata(buf, toolData); }
  

  if (presets.lib.patterns.length && !fast) {   
    try { if (!EDITM) await EDIT.load(); buf = injectLibPatterns(buf, applyEdits, parsePsdFull); }
    catch (e) { notes.skipped.push('写入用到的库图案：' + (e && e.message || e)); }
  }
  if (fast) { try { alphaCacheFor(); } catch {} set_alphaCarry({ from: origBuffer, w: docW, h: docH }); }   
  



  set_reuseHints(null);
  if (fast) {
    const hints = new Map();
    for (const o of attrOps) {
      if (o.op !== 'replaceLayerPixels' || !o.rgba) continue;
      const i = o.index, dl = doc.layers[i];
      if (!dl || !dl.rgba || dl.rgba !== o.rgba.data || dl.mask || layerDeletes.has(i) || transformChanged(i) || textRenders[i]) continue;
      if (maskOps.some(m => m.index === i) || attrOps.some(m => m !== o && m.index === i && /Pixels|rasterize|Mask/.test(m.op))) continue;
      if (Object.keys(soBaked).some(k => soBaked[k] && soBaked[k].layerIdx === i)) continue;
      const p = builtIndexOf(i); if (p < 0) continue;
      try { const sig = layerRasterSig(buf, p, { exact: true }); if (sig) hints.set(sig, dl.rgba); } catch {  }
    }
    if (hints.size) set_reuseHints(hints);
  }
  return { buf, composite: merged ? { data: merged, width: docW, height: docH } : null, canvas: mc, notes, fast };
}




let waitCursorDepth = 0, waitCursorTimer = 0, waitCursorFrame = 0, waitCursorLabel = '正在打开文档…';
export function setWaitCursor(on, label){
  if (!document.body) return;
  if (on && label) waitCursorLabel = label;
  waitCursorDepth = Math.max(0, waitCursorDepth + (on ? 1 : -1));
  const busy = waitCursorDepth > 0;
  document.body.classList.toggle('doc-loading', busy);
  if (busy && !waitCursorTimer) {
    const tick = () => {
      const name = `typekitSpinner${(waitCursorFrame++ % 6) + 1}`;
      const cur = toolCursor(name) || toolCursor('wait') || 'wait';
      document.body.style.setProperty('--ps-loading-cursor', cur);
      document.body.style.cursor = cur;
    };
    tick(); waitCursorTimer = window.setInterval(tick, 120);
  } else if (!busy) {
    if (waitCursorTimer) { clearInterval(waitCursorTimer); waitCursorTimer = 0; }
    document.body.style.removeProperty('--ps-loading-cursor');
    document.body.style.cursor = '';
  }
  const overlay = document.getElementById('docLoadingOverlay');
  if (overlay) {
    overlay.hidden = !busy;
    const text = document.getElementById('docLoadingText');
    if (text && busy) text.textContent = waitCursorLabel;
  }
  if (!busy) waitCursorLabel = '正在打开文档…';
}






function previewCompositeCanvas(){
  const surf = compositeAll(composeDocForOrder(previewCompositeDoc(doc), displayOrder()), docW, docH, new Map());
  const c = document.createElement('canvas'); c.width = docW; c.height = docH;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(surf.data), docW, docH), 0, 0);
  return c;
}

function encodeTiffRGBA(rgba, w, h){
  const tags = [[256, 4, 1, w], [257, 4, 1, h], [258, 3, 4, 0], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 0],
    [277, 3, 1, 4], [278, 4, 1, h], [279, 4, 1, w * h * 4], [282, 5, 1, 0], [283, 5, 1, 0], [284, 3, 1, 1], [296, 3, 1, 2], [338, 3, 1, 2]];
  const ifdOff = 8, ifdLen = 2 + tags.length * 12 + 4, bpsOff = ifdOff + ifdLen, resOff = bpsOff + 8, dataOff = resOff + 16;
  const buf = new ArrayBuffer(dataOff + rgba.length), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true); dv.setUint16(ifdOff, tags.length, true);
  const dpi = origBuffer ? readResolution(origBuffer) : 72;
  tags.forEach(([tag, type, n, v], k) => {
    const o = ifdOff + 2 + k * 12; dv.setUint16(o, tag, true); dv.setUint16(o + 2, type, true); dv.setUint32(o + 4, n, true);
    const val = tag === 258 ? bpsOff : tag === 273 ? dataOff : tag === 282 ? resOff : tag === 283 ? resOff + 8 : v;
    if (type === 3 && n === 1) dv.setUint16(o + 8, val, true); else dv.setUint32(o + 8, val, true);
  });
  for (let k = 0; k < 4; k++) dv.setUint16(bpsOff + k * 2, 8, true);
  dv.setUint32(resOff, Math.round(dpi * 100), true); dv.setUint32(resOff + 4, 100, true); dv.setUint32(resOff + 8, Math.round(dpi * 100), true); dv.setUint32(resOff + 12, 100, true);
  u8.set(rgba, dataOff);
  return new Blob([buf], { type: 'image/tiff' });
}
export function quickExportPng(){
  const name = (docName || 'Untitled').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  return runExport(name, { format: 'png', perArtboard: false });
}
async function runLazyRasterExport(fileName, opts, layer){
  const fmt = opts.format || $('#exportFormat').value, source = doc?.lazyRasterFile, idx = doc?.layers?.indexOf(layer) ?? -1;
  const pp = idx >= 0 ? pixelPaint[idx] : null, edited = !!pp?.sparse?.tiles?.size;
  setWaitCursor(true, '正在导出当前文档…');
  try {
    if (fmt === 'psd') {
      const [{ writeLazyRasterPsd }, { readLazyImageTile }] = await Promise.all([import('../../../core/psd-lazy-write.js'), import('./21-load-document.js')]);
      const buf = await writeLazyRasterPsd({ width: docW, height: docH, name: layer.name || docName || '图层 0', readTile: async (x, y) => {
        const base = await readLazyImageTile(layer, x, y), edit = pp?.sparse?.tiles?.get(`${x}:${y}`);
        return edit ? { x, y, width: edit.width, height: edit.height, data: edit.data } : base;
      }, psb: docW > 30000 || docH > 30000 });
      const url = URL.createObjectURL(new Blob([buf], { type: 'image/vnd.adobe.photoshop' })), a = document.createElement('a'); a.href = url; a.download = fileName + (docW > 30000 || docH > 30000 ? '.psb' : '.psd'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已导出原始尺寸 ${docW} × ${docH} 的 ${docW > 30000 || docH > 30000 ? 'PSB' : 'PSD'}（分块写回）`; return true;
    }
    if (!edited && fmt === 'jpg' && source) {
      const url = URL.createObjectURL(source), a = document.createElement('a'); a.href = url; a.download = fileName + '.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = '已导出原始 JPEG（像素未改变）'; return true;
    }
    if (docW * docH > 180e6) throw new Error('这份图片超过当前浏览器的分块编码上限；已阻止导出以避免丢失原始像素');
    const cv = document.createElement('canvas'); cv.width = docW; cv.height = docH;
    const g = cv.getContext('2d', { willReadFrequently: false });
    let sourceImage = layer.lazyImage;
    let ownedSourceImage = false;
    if (!sourceImage && layer.lazyRasterFile) {
      sourceImage = await decodeImageFile(layer.lazyRasterFile);
      ownedSourceImage = true;
    }
    if (!sourceImage) throw new Error('原始图片源已释放，无法导出');
    g.drawImage(sourceImage, 0, 0, docW, docH);
    if (ownedSourceImage) sourceImage.close?.();
    if (edited) for (const tile of pp.sparse.tiles.values()) g.putImageData(new ImageData(tile.data, tile.width, tile.height), tile.x, tile.y);
    if (fmt === 'jpg') { const bg = document.createElement('canvas'); bg.width = docW; bg.height = docH; const b = bg.getContext('2d'); b.fillStyle = '#fff'; b.fillRect(0, 0, docW, docH); b.drawImage(cv, 0, 0); cv.width = docW; cv.height = docH; g.drawImage(bg, 0, 0); }
    const blob = await canvasToBlob(cv, fmt === 'jpg' ? 'jpg' : fmt === 'webp' ? 'webp' : 'png', Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92)));
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fileName + '.' + (fmt === 'jpg' ? 'jpg' : fmt === 'webp' ? 'webp' : 'png'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#info').textContent = `已导出原始尺寸 ${docW} × ${docH} 的 ${fmt.toUpperCase()}${edited ? '（含局部修改）' : ''}`; return true;
  } finally { setWaitCursor(false); }
}
async function runExport(fileName, opts = {}){
  if(!origBuffer){ $('#err').textContent='先打开一个 PSD'; return; }
  const lazyRaster = doc?.layers?.find(l => l?.lazyRasterSource);
  if (lazyRaster) { try { return await runLazyRasterExport(fileName, opts, lazyRaster); } catch (e) { $('#err').textContent = '导出失败：' + e.message; return false; } }
  setWaitCursor(true, '正在导出文档…');
  try {
    let buf0 = null, mc = null, notes = { skipped: [], srcNotes: [], warp: 0 }, buildErr = null;
    try { ({ buf: buf0, canvas: mc, notes } = await buildPsdBuffer()); }
    catch (e) { buildErr = e; console.error(e); }
    if(buildErr&&docW*docH>64e6)throw buildErr;
    try { LB && LB.afterSave(); } catch {}   
    if (!mc&&!notes.tiled) mc = previewCompositeCanvas();
    let buf = buf0;
    const warns = [];
    if (buildErr) warns.push(`分层写回失败（${buildErr.message}），已按当前画面导出`);
    if (notes.skipped.length) warns.push('以下项目未能写回：\n· ' + notes.skipped.join('\n· '));
    let srcNote = notes.srcNotes.length ? '；' + notes.srcNotes.join('；') : '';
    
    const fmt = opts.format || $('#exportFormat').value;
    const wantCmyk = $('#modeSel').value === 'cmyk';
    if(notes.tiled&&(fmt!=='psd'||wantCmyk))throw new Error('此超大文档目前支持分层 PSD/PSB 写回，该图像格式的流式导出仍待接入');
    let cmyk = wantCmyk && fmt !== 'png' && fmt !== 'webp';   
    const quality = Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92));
    const icc = !$('#exportIccRow').hidden ? ($('#exportIcc').value || '') : '';
    let outBlob, outType;
    if (fmt === 'psd') {
      outType = 'image/vnd.adobe.photoshop';
      if (!buf) {
        
        const rgba = mc.getContext('2d').getImageData(0, 0, docW, docH).data;
        try { buf = replacePsdCompositeImage(origBuffer.slice(0), rgba).buffer; } catch { buf = origBuffer.slice(0); }
        warns.push('PSD 里的图层是修改前的版本，只有合成图是当前画面');
      }
      if (cmyk && buf0 && doc && doc.mode !== 4) {   
        let serverErr = null;
        try { outBlob = await serverRender(buf, { format: 'psd', colorMode: 'cmyk', icc: icc || undefined }); }
        catch (e) { serverErr = e; }
        if (!outBlob) {
          buf = await convertDocCmykLocal(buf);       
          const lint2 = lintPsd(buf);
          if (!lint2.ok) warns.push('生成的 PSD 结构校验有问题（仍已导出）：\n· ' + lint2.errors.join('\n· '));
          srcNote += `；服务端不可用（${serverErr ? serverErr.message : '未知原因'}），已用浏览器快速分色（无 ICC）`;
          outBlob = new Blob([buf], { type: outType });
        }
      } else {
        let lint = { ok: true };
        try { lint = lintPsd(buf); } catch (e) { lint = { ok: false, errors: [e.message] }; }
        if (!lint.ok) warns.push('生成的 PSD 结构校验有问题（仍已导出，如 PS 打不开请把这段反馈给开发者）：\n· ' + lint.errors.join('\n· '));
        outBlob = new Blob([buf], { type: outType });
      }
    } else if (fmt !== 'psd' && (opts.perArtboard ?? (!$('#exportAbRow').hidden && $('#exportPerArtboard').checked))) {
      
      const abs = docArtboards();
      const files = [];
      const used = new Set();
      for (const ab of abs) {
        const r = ab.rect;
        const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
        const x1 = Math.min(docW, Math.round(r.x + r.w)), y1 = Math.min(docH, Math.round(r.y + r.h));
        if (x1 <= x0 || y1 <= y0) continue;
        const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0;
        const g = c.getContext('2d');
        if (fmt === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(mc, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
        let blob;
        if (fmt === 'tiff') blob = encodeTiffRGBA(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        else if (EXTRA_EXPORT.has(fmt)) blob = await encodeExtraCanvas(fmt, c, quality);
        else blob = await canvasToBlob(c, fmt, quality);
        let base = (ab.name || '画板').replace(/[\\/:*?"<>|]/g, '_'), nm = base, k = 2;
        while (used.has(nm)) nm = `${base} (${k++})`;
        used.add(nm);
        files.push({ name: nm + '.' + EXPORT_EXT[fmt], data: new Uint8Array(await blob.arrayBuffer()), blob });
      }
      if (cmyk) { warns.push('按画板导出时颜色为 RGB（CMYK 分色请整幅导出）'); cmyk = false; }
      if (!files.length) throw new Error('画板都在画布之外，没有可导出的内容');
      if (files.length === 1) { outBlob = files[0].blob; fileName = files[0].name.replace(/\.[^.]+$/, ''); outType = outBlob.type; }
      else { outBlob = makeZip(files.map(f => ({ name: f.name, data: f.data }))); outType = 'application/zip'; }
      notes.artboardFiles = files.length;
    } else if (EXTRA_EXPORT.has(fmt)) {
      if (cmyk) { warns.push('这个格式按 RGB 输出'); cmyk = false; }
      outBlob = await encodeExtraCanvas(fmt, mc, quality);
      outType = outBlob.type;
    } else if ((fmt === 'tiff' || cmyk) && buf0 && await (async () => {
      try { outBlob = await serverRender(buf, { format: fmt, colorMode: cmyk ? 'cmyk' : 'rgb', quality, icc: (cmyk && icc) ? icc : undefined }); return !!outBlob; }
      catch (e) { warns.push(`服务端编码不可用（${e.message}），已改用浏览器本地编码${cmyk ? '，颜色为 RGB（CMYK 分色需要服务端）' : ''}`); cmyk = false; return false; }
    })()) {
      outType = outBlob.type || 'application/octet-stream';
    } else if (fmt === 'tiff') {
      outBlob = encodeTiffRGBA(mc.getContext('2d').getImageData(0, 0, docW, docH).data, docW, docH);
      outType = 'image/tiff';
    } else {
      let src = mc;
      if (fmt === 'jpg') {
        src = document.createElement('canvas'); src.width = docW; src.height = docH;
        const c2 = src.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, docW, docH); c2.drawImage(mc, 0, 0);
      }
      outBlob = await canvasToBlob(src, fmt, quality);
      outType = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    }
    if (warns.length) $('#err').textContent = warns.join('\n');
    const dlURL = URL.createObjectURL(outBlob);
    const psb=fmt==='psd'&&buf&&new DataView(buf).getUint16(4)===2;
    const a=document.createElement('a'); a.href=dlURL; a.download=fileName + '.' + (outType === 'application/zip' ? 'zip' : psb?'psb':EXPORT_EXT[fmt]); a.click();
    if (fmt === 'psd' && HXP) HXP.onSaved();         
    fireScriptEvent(fmt === 'psd' ? 'save' : 'export');   
    setTimeout(() => URL.revokeObjectURL(dlURL), 1000);
    const fmtLabel = psb?'PSB':{ psd: 'PSD', png: 'PNG', jpg: 'JPG', tiff: 'TIFF', webp: 'WebP', pdf: 'PDF', png8: 'PNG-8', gif: 'GIF', bmp: 'BMP', tga: 'TGA', ico: 'ICO', exr: 'OpenEXR', hdr: 'HDR', ppm: 'PPM', pam: 'PAM' }[fmt];
    $('#info').textContent = `已导出 ${fmtLabel}${cmyk ? '（CMYK）' : ''}：${notes.warp} 个智能对象保留可编辑 warp`
      + (notes.quilted ? `（其中 ${notes.quilted} 个网格已拆分，写为 quiltWarp）` : '')
      + (notes.deformed ? `；${notes.deformed} 个透视/操控变形已写回滤镜` : '')
      + (notes.deformNew ? `；新建了 ${notes.deformNew} 条变形滤镜（PS 打开可继续编辑）` : '')
      + (notes.soBaked ? `；${notes.soBaked} 个智能对象缓存栅格已更新（打开即显示，无需 Ctrl+T）` : '')
      + (notes.layerEdits ? `；已写回 ${notes.layerEdits} 个图层的可见性/不透明度/混合模式` : '')
      + (notes.attrOps ? `；已写回 ${notes.attrOps} 项图层属性（蒙版/样式/锁定/颜色标签/填充/参数${notes.maskOps ? `，其中 ${notes.maskOps} 项在像素烘焙之后执行` : ''}）` : '')
      + ((notes.attrWarn && notes.attrWarn.length) ? `；图层属性写回提示：${notes.attrWarn.slice(0, 2).join('；')}${notes.attrWarn.length > 2 ? `（另有 ${notes.attrWarn.length - 2} 条）` : ''}` : '')
      + (notes.textEdits ? `；已编辑 ${notes.textEdits} 个文字图层（${notes.textRaster} 个已重绘栅格${Object.keys(textFontSubst).length ? '，' + Object.keys(textFontSubst).length + ' 个换了字体' : ''}）` : '')
      + (notes.renames ? `；已重命名 ${notes.renames} 个图层` : '')
      + (notes.transforms ? `；已变换 ${notes.transforms} 个图层` : '')
      + (notes.reordered ? `；已重排序图层` : '')
      + (notes.deleted ? `；已删除 ${notes.deleted} 个图层` : '')
      + (notes.artboardFiles ? `；按画板导出 ${notes.artboardFiles} 个文件` : '')
      + srcNote;
  } catch(e){ $('#err').textContent='导出失败：'+e.message; console.error(e); }
  finally { setWaitCursor(false); }
}


export const dispTextOf = (i, l) => layerTextEdits[i] != null ? layerTextEdits[i] : l.text.content;
export let fontSeq = 0;
export function set_fontSeq(v) { return (fontSeq = v); }   
