




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
import { applyLazyMaskToRGBA, decodeLayerJob, readLazyLayerRectChannels } from '../../../core/psd-raster.js';
import { invert3 as invertQuad, quadBounds as quadBoundingBox, quadMatrix } from '../../../core/quad-warp.js';
import { quantize as quantizeRGB } from '../../../core/doc-mode.js';
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
  set_selection, soBaked, soEdits, soRepl, sos, textCrops, textDrag, textFontSubst, textOverlay, textRenders,
  textStyleEdits, vpDirty, vpMod, vpPlanesDoc,
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
import {
  decodeImageFile, decodeLazyTile, readLazyImageBand, readLazyImageTile, set_reuseHints,
} from './21-load-document.js';
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
  composeDocForOrder, previewCompositeDoc, renderPreviewOnly, renderStaticLayers, renderWarpNow, topo,
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
export function canvasToBlob(cv, fmt, quality, signal = null){
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(signal.reason || new DOMException('导出已取消', 'AbortError'));
    const onAbort = () => rej(signal.reason || new DOMException('导出已取消', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    cv.toBlob(b => { signal?.removeEventListener('abort', onAbort); if (signal?.aborted) return rej(signal.reason || new DOMException('导出已取消', 'AbortError')); b ? res(b) : rej(new Error(fmt.toUpperCase() + ' 编码失败')); }, mime, quality / 100);
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



export function structuralWriteRefusal(){
  const px = Math.max(1, docW * docH);
  if (px <= 180e6) return '此超大文档的这项结构修改尚未接入分块写回，请保留当前编辑状态';
  const yi = (px / 1e8).toFixed(2), gb = (px * 4 / 1073741824).toFixed(1);
  return `这张图有 ${yi} 亿像素：像素绘制、选区、滤镜、调色、图层新建/删除/复制、合并、粘贴与原始尺寸导出都走分块路径；`
    + `当前这项修改（文字内容 / 智能对象内部 / 路径切片 / 未烘焙的变换等）仍需要整层重编码（约 ${gb}GB），尚未接入。`
    + `请先把相关图层烘焙或拼合后再试。`;
}
async function buildSparsePsdBuffer(opts){
  const original=origBuffer,width=docW,height=docH,metadata=previewCompositeDoc(doc).layers.map(l=>({mask:l.mask,vectorMask:l.vectorMask,effects:l.effects,fill:l.fill,adjustment:l.adjustment,group:l.group,blendIf:cloneOpValue(l.blendIf),channelsOff:l.channelsOff?.slice(),knockout:l.knockout,
    hidden:l.hidden,opacity:l.opacity,fillOpacity:l.fillOpacity,blendMode:l.blendMode,vectorStroke:l.vectorStroke}));
  if(vpDirty||toolData&&Object.values(toolData.dirty).some(Boolean)||DOC_EXT.some(x=>x.needsWrite?.())||Object.keys(layerTextEdits).length||Object.keys(textStyleEdits).length||Object.keys(textDescEdits).length||Object.keys(soFilterEdits).length||Object.values(soInside).some(s=>s.changed))throw new Error('此超大文档的附加编辑项目尚未接入分块写回，请保留当前编辑状态');
  if(layerDeletes.size||layerDupes.length||layerReorder||Object.keys(layerTransforms).some(i=>transformChanged(+i))||Object.keys(soEdits).length||Object.keys(soRepl).length||Object.keys(soBaked).length||workPathDirty||savedPathsDirty||slicesDirty||docSizeBase&&(width!==docSizeBase.w||height!==docSizeBase.h))throw new Error('此超大文档的结构、文字或变换修改尚未接入分块写回，请保留当前编辑状态');
  const ops=allLayerOps().filter(o=>o.op!=='sparsePixels').map(o=>{const c=cloneOpValue(o);if(c.rgba?.data)c.rgba={...c.rgba,data:c.rgba.data.slice()};return c;}),properties=Object.values(layerEdits).map(e=>({...e})),names=Object.entries(layerRenames);
  

  const inserts=ops.filter(o=>['addAdjustmentLayer','addShapeLayer','createLayer','addFillLayer'].includes(o.op)&&Number.isInteger(o.at)).map(o=>o.at).sort((a,b)=>a-b);
  const changes=Object.entries(pixelPaint).filter(([,p])=>p.sparse?.tiles.size).map(([index,p])=>({index:inserts.reduce((n,at)=>n+(at<=+index?1:0),+index),tiles:[...p.sparse.tiles.values()]}));

  const maskChanges=doc.layers.map((l,index)=>{
    const e=l?.lazyMaskEdits, m=l?.mask;
    if(!e||!m||!(m.width>0&&m.height>0))return null;
    const uniform=e.uniform!=null?e.uniform:null, tiles=[];
    for(const [key,data]of e.tiles){
      const [x,y]=key.split(':').map(Number);
      const w=Math.min(256,m.width-x),h=Math.min(256,m.height-y);
      if(!(w>0&&h>0))continue;
      let d=data;
      if(w!==256||h!==256){d=new Uint8Array(w*h);for(let row=0;row<h;row++)d.set(data.subarray(row*256,row*256+w),row*w);}
      tiles.push({key,x,y,width:w,height:h,data:d});
    }
    if(uniform==null&&!tiles.length)return null;
    return {index:inserts.reduce((n,at)=>n+(at<=index?1:0),index),uniform,tiles};
  }).filter(Boolean);
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
  const result=await patchPsdSparsePixels(buf,changes,{merged:!opts.fast,metadata,asBlob:!!opts.asBlob,maskChanges});
  const notes={warp:0,quilted:0,deformed:0,deformNew:0,composite:result.composite,skipped:[],srcNotes:[],tiled:true,
    sparseTiles:changes.reduce((n,c)=>n+c.tiles.length,0)+maskChanges.reduce((n,c)=>n+c.tiles.length,0)};
  return {buf:result.blob||result.buffer,composite:null,canvas:null,notes,fast:!!opts.fast};
}



async function buildLazyStructuralPsdBuffer(opts, lazyRaster){
  const { writeLazyRasterPsd } = await import('../../../core/psd-lazy-write.js');
  const idx = doc.layers.indexOf(lazyRaster), pp = idx >= 0 ? pixelPaint[idx] : null;
  let buf;
  

  try {
    const current = await ensureStructuralBase(origBuffer);
    if (parsePsdFull(current).layers.length > 1) buf = current;
  } catch {  }
  if (!buf) buf = await writeLazyRasterPsd({ width: docW, height: docH, name: lazyRaster.name || docName || '图层 0',
    readTile: async (x, y) => {
      const edit = pp?.sparse?.tiles?.get(`${x}:${y}`);



      const base = await readLazyImageTile(lazyRaster, x, y);
      return overlaySparseEdit(base, edit);
    }, psb: docW > 30000 || docH > 30000, abortSignal: opts.abortSignal || null, onProgress: opts.onProgress || null });
  const ops = allLayerOps().filter(o => o.op !== 'sparsePixels').map(o => cloneOpValue(o));
  if (ops.length) buf = applyEdits(buf, ops, { verify: false }).buffer;
  

  opts.onProgress?.(45, 100);
  const sparseOps = [];
  for (const [k, p] of Object.entries(pixelPaint)) {
    const i = +k; if (i === idx || !p?.sparse?.tiles?.size) continue;
    const u = sparseTilesRGBA([...p.sparse.tiles.values()], doc?.layers?.[i]?.name || `图层 ${i}`);
    if (!u) continue;
    sparseOps.push({ op: 'replaceLayerPixels', index: i,
      rgba: { data: u.rgba, width: u.bounds.right - u.bounds.left, height: u.bounds.bottom - u.bounds.top },
      bounds: u.bounds, opts: { premultiplied: true } });
  }
  opts.onProgress?.(70, 100);
  if (sparseOps.length) buf = applyEdits(buf, sparseOps, { verify: false }).buffer;
  const attrs = Object.entries(layerEdits).map(([i, e]) => ({ index: +i, ...e }));
  if (attrs.length) buf = writeLayerProperties(buf, attrs);
  for (const [i, name] of Object.entries(layerRenames)) buf = renameLayer(buf, +i, name);
  opts.onSnapshot?.();
  opts.onProgress?.(100, 100);
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
  const lazyRaster = doc?.layers?.find((l, i) => l?.lazyRasterSource && !layerDeletes.has(i));
  const lazyIdx = lazyRaster ? doc.layers.indexOf(lazyRaster) : -1;

  const canStreamExtra = l => !!(l && (l.lazyTileStore || l.lazyPixelOps?.length || l.lazyImage || l.lazyRasterFile));
  const dupSourceIndex = i => {
    const N = doc.layers.length - layerDupes.length;
    if (i < N || i >= doc.layers.length) return -1;
    const d = layerDupes[i - N];
    return d && Number.isInteger(d.src) ? d.src : -1;
  };
  const extraStreamTile = (sourceLayer, i) => {
    const b = sourceLayer.bounds || {}, left = b.left | 0, top = b.top | 0;
    const sidx = dupSourceIndex(i);
    const srcSparse = sourceLayer.dupSparseTiles || (sidx >= 0 ? pixelPaint[sidx]?.sparse?.tiles : null) || null;
    const own = pixelPaint[i]?.sparse;
    return async (x, y) => {
      const lx = x - left, ly = y - top;
      if (lx < 0 || ly < 0 || lx >= sourceLayer.width || ly >= sourceLayer.height) return null;
      let t = await readLazyImageTile(sourceLayer, lx, ly);
      t = overlaySparseEdit(t, srcSparse?.get(`${lx}:${ly}`));
      t = overlaySparseEdit(t, own?.tiles?.get(`${lx}:${ly}`));
      return t ? { ...t, x: t.x + left, y: t.y + top } : null;
    };
  };


  const dupTile = async (src, srcIdx, idx, x, y) => {
    const t = await readTranslatedTile(src, srcIdx, { ox: 0, oy: 0 }, x, y);
    const edit = pixelPaint[idx]?.sparse?.tiles?.get(`${x}:${y}`);
    return edit ? (t ? overlaySparseEdit(t, edit) : edit) : t;
  };



  const translationOf = i => {
    const t = transformChanged(+i), l = doc.layers[i];
    if (!t || !l || t.quad || t.rot || t.flipX || t.flipY) return null;
    const sw = l.width, sh = l.height;
    if (!(sw > 0 && sh > 0) || Math.abs((t.w ?? sw) - sw) > 1e-6 || Math.abs((t.h ?? sh) - sh) > 1e-6) return null;
    const ox = t.x, oy = t.y;
    if (!Number.isInteger(ox) || !Number.isInteger(oy)) return null;
    return { ox, oy };
  };
  const affineOf = i => {
    const t = transformChanged(+i), l = doc.layers[i];
    if (!t || !l) return null;
    const sw = l.width, sh = l.height;
    if (t.quad) return { x: t.x, y: t.y, w: t.w || sw, h: t.h || sh, quad: t.quad,
      flipX: !!t.flipX, flipY: !!t.flipY, sw, sh };
    if (!(sw > 0 && sh > 0) || !(t.w > 0) || !(t.h > 0)) return null;
    const tr = translationOf(i);
    if (tr) return { ...tr, plain: true };
    return { x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot || 0, flipX: !!t.flipX, flipY: !!t.flipY, sw, sh };
  };
  const allTransformsStreamable = () => Object.keys(layerTransforms).every(k => {
    const i = +k, tr = affineOf(i);
    return layerDeletes.has(i) || !transformChanged(i) || (!!tr && (!tr.quad || tr.quad.length === 4));
  });
  const translatedBounds = (l, tr) => {
    const left = Math.max(0, tr.ox), top = Math.max(0, tr.oy);
    const right = Math.min(docW, tr.ox + l.width), bottom = Math.min(docH, tr.oy + l.height);
    return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
  };
  const affineBounds = (l, tr) => {
    if (tr.plain) return translatedBounds(l, tr);
    if (tr.quad) {
      const b = quadBoundingBox(tr.quad, { x: 0, y: 0, width: docW, height: docH });
      return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
    }
    const rad = tr.rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const cx = tr.x + tr.w / 2, cy = tr.y + tr.h / 2;
    const pt = (u, v) => { const ux = tr.flipX ? -u : u, vy = tr.flipY ? -v : v;
      return [cx + ux * c - vy * s, cy + ux * s + vy * c]; };
    const pts = [pt(-tr.w / 2, -tr.h / 2), pt(tr.w / 2, -tr.h / 2), pt(tr.w / 2, tr.h / 2), pt(-tr.w / 2, tr.h / 2)];
    const left = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))));
    const top = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))));
    const right = Math.min(docW, Math.ceil(Math.max(...pts.map(p => p[0]))));
    const bottom = Math.min(docH, Math.ceil(Math.max(...pts.map(p => p[1]))));
    return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
  };


  const lazyChannelTile = async (layer, x, y, tileSize = 256) => {
    const w = Math.min(tileSize, layer.width - x), h = Math.min(tileSize, layer.height - y);
    if (!(w > 0 && h > 0)) return null;
    const chans = readLazyLayerRectChannels(layer, x, y, w, h);
    if (!chans) return null;
    const m = layer.mask || {}, psb = !!(Object.values(layer.lazyChannels)?.[0]?.psb);
    const work = { width: w, height: h, depth: doc.depth, mode: doc.mode, psb, previewMax: 0,
      maskInfo: { maskW: m.width || layer.width, maskH: m.height || layer.height, top: m.top || 0, left: m.left || 0,
        layerTop: layer.bounds.top, layerLeft: layer.bounds.left, defaultColor: m.defaultColor, maskFlags: m.flags || 0 },
      geo: { bounds: layer.bounds, width: layer.width, height: layer.height, maskDensity: m.density, maskFeather: m.feather },
      keepPlanes: false };
    const res = await decodeLayerJob({ ...work, chans: chans.map(c => ({ ...c, bytes: c.view })) });
    const tile = res?.tile || (res?.rgba ? { x, y, width: w, height: h, data: res.rgba } : null);
    if (tile) applyLazyMaskToRGBA(layer, tile.data, tile.x, tile.y, tile.width, tile.height);
    return tile;
  };
  const sourceLocalTile = async (layer, i, tx, ty) => {
    const tw = Math.min(256, layer.width - tx), th = Math.min(256, layer.height - ty);
    if (!(tw > 0 && th > 0)) return null;
    let base = null;
    if (layer.lazyTileStore || layer.lazyPixelOps?.length || layer.lazyImage || layer.lazyRasterFile) {
      try { base = await readLazyImageTile(layer, tx, ty); } catch { base = null; }
    } else if (layer.lazyChannels) {
      try { base = await lazyChannelTile(layer, tx, ty); } catch { base = null; }
    } else if (layer.rgba && layer.rgba.length >= layer.width * layer.height * 4) {
      const data = new Uint8ClampedArray(tw * th * 4);
      for (let y = 0; y < th; y++) data.set(layer.rgba.subarray(((ty + y) * layer.width + tx) * 4, ((ty + y) * layer.width + tx + tw) * 4), y * tw * 4);
      base = { x: tx, y: ty, width: tw, height: th, data };
    }
    const key = `${tx}:${ty}`;
    base = overlaySparseEdit(base, layer.dupSparseTiles?.get(key));
    base = overlaySparseEdit(base, pixelPaint[i]?.sparse?.tiles?.get(key));
    return base;
  };
  const readTranslatedTile = async (layer, i, tr, destX, destY) => {
    const w = Math.min(256, docW - destX), h = Math.min(256, docH - destY);
    const out = new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4);
    if (!(w > 0 && h > 0)) return { x: destX, y: destY, width: Math.max(0, w), height: Math.max(0, h), data: out };
    const sx0 = destX - tr.ox, sy0 = destY - tr.oy;
    const ix0 = Math.max(0, sx0), iy0 = Math.max(0, sy0);
    const ix1 = Math.min(layer.width, sx0 + w), iy1 = Math.min(layer.height, sy0 + h);
    if (ix1 > ix0 && iy1 > iy0) {
      for (let ty = Math.floor(iy0 / 256) * 256; ty < iy1; ty += 256)
        for (let tx = Math.floor(ix0 / 256) * 256; tx < ix1; tx += 256) {
          const t = await sourceLocalTile(layer, i, tx, ty);
          if (!t) continue;
          const ax0 = Math.max(ix0, t.x), ax1 = Math.min(ix1, t.x + t.width);
          const ay0 = Math.max(iy0, t.y), ay1 = Math.min(iy1, t.y + t.height);
          if (!(ax1 > ax0 && ay1 > ay0)) continue;
          for (let y = ay0; y < ay1; y++)
            out.set(t.data.subarray(((y - t.y) * t.width + ax0 - t.x) * 4, ((y - t.y) * t.width + ax1 - t.x) * 4),
              ((y - sy0) * w + ax0 - sx0) * 4);
        }
    }
    return { x: destX, y: destY, width: w, height: h, data: out };
  };



  const makeAffineReader = (layer, i, tr) => {
    const cache = new Map();
    const tileAt = async (tx, ty) => {
      const key = `${tx}:${ty}`;
      let t = cache.get(key);
      if (t) { cache.delete(key); cache.set(key, t); return t; }
      t = await sourceLocalTile(layer, i, tx, ty);
      if (t) { cache.set(key, t); if (cache.size > 64) cache.delete(cache.keys().next().value); }
      return t;
    };
    const rad = (tr.rot || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const cx = tr.x + tr.w / 2, cy = tr.y + tr.h / 2;
    const kx = tr.sw / tr.w, ky = tr.sh / tr.h;
    const qinv = tr.quad ? invertQuad(quadMatrix(tr.sw, tr.sh, tr.quad)) : null;
    if (tr.quad && !qinv) throw new Error('透视变换矩阵退化，无法导出');
    const srcOf = (dx, dy) => {
      if (qinv) {
        const w = qinv[6] * dx + qinv[7] * dy + qinv[8];
        if (Math.abs(w) < 1e-12) return null;
        let u = (qinv[0] * dx + qinv[1] * dy + qinv[2]) / w, v = (qinv[3] * dx + qinv[4] * dy + qinv[5]) / w;
        if (tr.flipX) u = tr.sw - u;
        if (tr.flipY) v = tr.sh - v;
        return [u, v];
      }
      let u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
      if (tr.flipX) u = -u;
      if (tr.flipY) v = -v;
      return [u * kx + tr.sw / 2, v * ky + tr.sh / 2];
    };
    const srcBox = (dx, dy, w, h) => {
      const q = [srcOf(dx - (qinv ? 0 : cx), dy - (qinv ? 0 : cy)), srcOf(dx + w - (qinv ? 0 : cx), dy - (qinv ? 0 : cy)),
        srcOf(dx + w - (qinv ? 0 : cx), dy + h - (qinv ? 0 : cy)), srcOf(dx - (qinv ? 0 : cx), dy + h - (qinv ? 0 : cy))].filter(Boolean);
      if (!q.length) return { x0: 0, x1: 0, y0: 0, y1: 0 };
      const x0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[0]))) - 1), x1 = Math.min(tr.sw, Math.ceil(Math.max(...q.map(p => p[0]))) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[1]))) - 1), y1 = Math.min(tr.sh, Math.ceil(Math.max(...q.map(p => p[1]))) + 1);
      return { x0, y0, x1, y1 };
    };
    const fillRect = async (out, destX, destY, w, rectX, rectY, rw, rh) => {
      const b = srcBox(rectX, rectY, rw, rh);
      if (!(b.x1 > b.x0 && b.y1 > b.y0)) return;
      const pw = b.x1 - b.x0, ph = b.y1 - b.y0;
      const patch = new Uint8ClampedArray(pw * ph * 4);
      for (let ty = Math.floor(b.y0 / 256) * 256; ty < b.y1; ty += 256) {
        for (let tx = Math.floor(b.x0 / 256) * 256; tx < b.x1; tx += 256) {
          const t = await tileAt(tx, ty);
          if (!t) continue;
          const ax0 = Math.max(b.x0, t.x), ax1 = Math.min(b.x1, t.x + t.width);
          const ay0 = Math.max(b.y0, t.y), ay1 = Math.min(b.y1, t.y + t.height);
          for (let y = ay0; y < ay1; y++)
            patch.set(t.data.subarray(((y - t.y) * t.width + ax0 - t.x) * 4, ((y - t.y) * t.width + ax1 - t.x) * 4),
              ((y - b.y0) * pw + ax0 - b.x0) * 4);
        }
      }
      for (let yy = 0; yy < rh; yy++) {
        const gy = rectY + yy;
        for (let xx = 0; xx < rw; xx++) {
          const gx = rectX + xx;
          const p = srcOf(gx + 0.5 - (qinv ? 0 : cx), gy + 0.5 - (qinv ? 0 : cy));
          if (!p) continue;
          const [sx, sy] = p;
          const fx = sx - b.x0 - 0.5, fy = sy - b.y0 - 0.5;
          if (fx <= -1 || fy <= -1 || fx >= pw || fy >= ph) continue;
          const ix = Math.max(0, Math.min(pw - 1, Math.floor(fx))), iy = Math.max(0, Math.min(ph - 1, Math.floor(fy)));
          const ix1 = Math.min(pw - 1, ix + 1), iy1 = Math.min(ph - 1, iy + 1);
          const ax = fx - Math.floor(fx), ay = fy - Math.floor(fy);
          const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
          const p00 = (iy * pw + ix) * 4, p10 = (iy * pw + ix1) * 4, p01 = (iy1 * pw + ix) * 4, p11 = (iy1 * pw + ix1) * 4;
          const a00 = patch[p00 + 3], a10 = patch[p10 + 3], a01 = patch[p01 + 3], a11 = patch[p11 + 3];
          const a = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
          if (a <= 0.5) continue;
          const o = ((gy - destY) * w + gx - destX) * 4;
          out[o] = (patch[p00] * a00 * w00 + patch[p10] * a10 * w10 + patch[p01] * a01 * w01 + patch[p11] * a11 * w11) / a;
          out[o + 1] = (patch[p00 + 1] * a00 * w00 + patch[p10 + 1] * a10 * w10 + patch[p01 + 1] * a01 * w01 + patch[p11 + 1] * a11 * w11) / a;
          out[o + 2] = (patch[p00 + 2] * a00 * w00 + patch[p10 + 2] * a10 * w10 + patch[p01 + 2] * a01 * w01 + patch[p11 + 2] * a11 * w11) / a;
          out[o + 3] = a;
        }
      }
    };
    return async (destX, destY) => {
      if (opts.abortSignal?.aborted) throw opts.abortSignal.reason;
      const w = Math.min(256, docW - destX), h = Math.min(256, docH - destY);
      if (!(w > 0 && h > 0)) return { x: destX, y: destY, width: Math.max(0, w), height: Math.max(0, h), data: new Uint8ClampedArray(0) };
      const out = new Uint8ClampedArray(w * h * 4);
      let step = 256;
      for (;;) {
        const b = srcBox(destX, destY, Math.min(step, w), Math.min(step, h));
        if ((b.x1 - b.x0) * (b.y1 - b.y0) <= 4e6 || step <= 1) break;
        step = step >> 1;
      }
      for (let sy = 0; sy < h; sy += step) {
        for (let sx = 0; sx < w; sx += step) {
          await fillRect(out, destX, destY, w, destX + sx, destY + sy, Math.min(step, w - sx), Math.min(step, h - sy));
        }
        if (opts.abortSignal?.aborted) throw opts.abortSignal.reason;
      }
      return { x: destX, y: destY, width: w, height: h, data: out };
    };
  };
  const exportOrder = (layerReorder ? layerReorder.slice() : doc.layers.map((_, i) => i))
    .filter(i => i >= 0 && i < doc.layers.length && doc.layers[i] && !layerDeletes.has(i));
  const simpleExtras = lazyRaster && exportOrder.every(i => {
    const l = doc.layers[i];
    return l === lazyRaster || (!l.group && l.groupType == null && !l.mask && !l.vectorMask && !l.adjustment && !l.fill &&
      !l.isSmartObject && !l.isText && !l.text && !textRenders[i] &&
      (canStreamExtra(l) || (!l.lazyChannels && !l.lazyCompressedChannels)));
  });
  const simpleDirect = !!simpleExtras && exportOrder[0] === lazyIdx && !layerDeletes.has(lazyIdx)
    && allTransformsStreamable()


    && !allLayerOps().some(o => o.op !== 'sparsePixels')
    && layerDupes.every((_, k) => {
      const i = doc.layers.length - layerDupes.length + k, l = doc.layers[i];
      return l && (l.bounds?.left | 0) === 0 && (l.bounds?.top | 0) === 0 && !transformChanged(i) && dupSourceIndex(i) >= 0;
    })
    && !Object.keys(layerTextEdits).length && !Object.keys(textStyleEdits).length && !Object.keys(textDescEdits).length;
  if (simpleDirect) {
    const { writeLazyRasterPsd } = await import('../../../core/psd-lazy-write.js');
    const pp = lazyIdx >= 0 ? pixelPaint[lazyIdx] : null;
    const baseTf = affineOf(lazyIdx);
    const previewLayers = previewCompositeDoc(doc).layers;
    const basePreview = previewLayers[lazyIdx] || lazyRaster;
    const extraLayers = [];
    for (const i of exportOrder) {
      const sourceLayer = doc.layers[i], previewLayer = previewLayers[i] || sourceLayer;
      if (!sourceLayer || sourceLayer === lazyRaster) continue;
      const name = layerRenames[i] || layerTree?.flat?.[i]?.name || sourceLayer.name || `图层 ${i}`;
      const props = { name, blendMode: previewLayer.blendMode,
        opacity: previewLayer.opacity, fillOpacity: previewLayer.fillOpacity, clipping: previewLayer.clipping,
        hidden: previewLayer.hidden, effects: previewLayer.effects }, sparse = pixelPaint[i]?.sparse;
      const tr = affineOf(i);
      if (tr) {
        const bounds = affineBounds(sourceLayer, tr);
        extraLayers.push({ ...props, bounds,
          readTile: tr.plain ? (x, y) => readTranslatedTile(sourceLayer, i, tr, x, y) : makeAffineReader(sourceLayer, i, tr) });
        continue;
      }
      const dupIdx = dupSourceIndex(i);
      if (dupIdx >= 0 && doc.layers[dupIdx]) {
        extraLayers.push({ ...props, bounds: { ...sourceLayer.bounds },
          readTile: (x, y) => dupTile(doc.layers[dupIdx], dupIdx, i, x, y) });
        continue;
      }
      const streamTile = canStreamExtra(sourceLayer) ? extraStreamTile(sourceLayer, i) : null;
      if (streamTile) {
        extraLayers.push({ ...props, bounds: { ...sourceLayer.bounds }, readTile: streamTile });
      } else if (sparse?.tiles?.size) {
        const u = sparseTilesRGBA([...sparse.tiles.values()], name);
        if (u) extraLayers.push({ ...props, rgba: u.rgba, bounds: u.bounds });
        else extraLayers.push(props);
      } else if (sourceLayer.rgba && sourceLayer.width > 0 && sourceLayer.height > 0) {
        extraLayers.push({ ...props, rgba: sourceLayer.rgba, bounds: { ...sourceLayer.bounds } });
      } else extraLayers.push(props);
    }
    const psb = docW > 30000 || docH > 30000;


    let band = null, bandY = -1;
    const sourceBand = async y => {
      const sy = Math.floor(y / 1024) * 1024;
      if (band && bandY === sy) return band;
      bandY = sy;
      const bh = Math.min(1024, docH - sy);
      band = await readLazyImageBand(lazyRaster, sy, bh);
      return band;
    };
    const baseReader = baseTf && !baseTf.plain ? makeAffineReader(lazyRaster, lazyIdx, baseTf) : null;
    const readTile = async (x, y) => {
      if (opts.abortSignal?.aborted) throw opts.abortSignal.reason;
      if (baseReader) return baseReader(x, y);
      if (baseTf) return readTranslatedTile(lazyRaster, lazyIdx, baseTf, x, y);
      const edit = pp?.sparse?.tiles?.get(`${x}:${y}`);
      const rb = await sourceBand(y);
      let base;
      if (!rb) base = await readLazyImageTile(lazyRaster, x, y);
      else {
      const w = Math.min(256, docW - x), h = Math.min(256, docH - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) {
        const srcY = y + yy - rb.y;
        data.set(rb.data.subarray((srcY * docW + x) * 4, (srcY * docW + x + w) * 4), yy * w * 4);
      }
        base = { x, y, width: w, height: h, data };
      }


      return overlaySparseEdit(base, edit);
    };
    const buf = await writeLazyRasterPsd({ width: docW, height: docH, name: layerRenames[lazyIdx] || lazyRaster.name || docName || '图层 0', readTile,
      psb, extraLayers, abortSignal: opts.abortSignal || null, onProgress: opts.onProgress || null, asBlob: !!opts.asBlob,
      blend: basePreview.blendMode, opacity: basePreview.opacity ?? 255, clipping: basePreview.clipping,
      hidden: basePreview.hidden, fillOpacity: basePreview.fillOpacity ?? 255, effects: basePreview.effects });
    opts.onSnapshot?.();
    return { buf, canvas: null, composite: null, notes: { warp: 0, quilted: 0, deformed: 0, deformNew: 0, composite: false, skipped: [], srcNotes: [], tiled: true }, fast: !!opts.fast };
  }




  const buildLazyPixelDocPsd = async (opts) => {
    if (!(docW * docH > 64e6) || doc.depth !== 8 || doc.mode !== 3) return null;
    if (layerDeletes.size || layerDupes.length || layerReorder) return null;
    if (Object.keys(layerTextEdits).length || Object.keys(textStyleEdits).length || Object.keys(textDescEdits).length
      || Object.keys(soEdits).length || Object.keys(soRepl).length || Object.keys(soBaked).length
      || Object.keys(soFilterEdits).length || allLayerOps().some(o => o.op !== 'sparsePixels') || layerDupes.length || layerReorder
      || workPathDirty || savedPathsDirty || slicesDirty
      || guidesDirty || globalLightDirty || vpDirty || (toolData && Object.values(toolData.dirty).some(Boolean))
      || Math.abs(docResolution - docResolutionBase) > 1e-6
      || (docSizeBase && (docW !== docSizeBase.w || docH !== docSizeBase.h))) return null;
    const keys = Object.keys(layerTransforms).filter(k => transformChanged(+k));
    if (!keys.length) return null;
    if (!keys.every(k => { const tr = affineOf(+k); return (tr && (!tr.quad || tr.quad.length === 4)) || layerDeletes.has(+k); })) return null;
    const simple = i => {
      const l = doc.layers[i];
      if (!l || l.group || l.groupType != null || l.mask || l.vectorMask || l.adjustment || l.fill
        || l.isSmartObject || l.isText || l.text || textRenders[i] || l.effects || l.lazyPixelOps?.length) return false;
      const bx = l.bounds || {};
      if ((bx.left | 0) < 0 || (bx.top | 0) < 0) return false;
      return !!(l.lazyChannels || l.lazyTileStore || l.lazyImage || l.lazyRasterFile);
    };
    if (!doc.layers.every((_, i) => simple(i))) return null;
    const { writeLazyRasterPsd } = await import('../../../core/psd-lazy-write.js');
    const previewLayers = previewCompositeDoc(doc).layers;
    const order = doc.layers.map((_, i) => i);
    const baseIdx = order[0], baseL = doc.layers[baseIdx], basePreview = previewLayers[baseIdx] || baseL;
    const baseTf = affineOf(baseIdx);
    const baseRead = baseTf
      ? (baseTf.plain ? (x, y) => readTranslatedTile(baseL, baseIdx, baseTf, x, y) : makeAffineReader(baseL, baseIdx, baseTf))
      : ((baseL.bounds.left | 0) === 0 && (baseL.bounds.top | 0) === 0
        ? (x, y) => sourceLocalTile(baseL, baseIdx, x, y)
        : (x, y) => readTranslatedTile(baseL, baseIdx, { ox: baseL.bounds.left | 0, oy: baseL.bounds.top | 0 }, x, y));
    const extraLayers = [];
    for (const i of order.slice(1)) {
      const l = doc.layers[i], pv = previewLayers[i] || l;
      const props = { name: layerRenames[i] || layerTree?.flat?.[i]?.name || l.name || `图层 ${i}`, blendMode: pv.blendMode,
        opacity: pv.opacity, fillOpacity: pv.fillOpacity, clipping: pv.clipping, hidden: pv.hidden, effects: pv.effects };
      const tr = affineOf(i);
      if (tr) {
        extraLayers.push({ ...props, bounds: affineBounds(l, tr),
          readTile: tr.plain ? (x, y) => readTranslatedTile(l, i, tr, x, y) : makeAffineReader(l, i, tr) });
      } else {
        extraLayers.push({ ...props, bounds: { ...l.bounds },
          readTile: (x, y) => readTranslatedTile(l, i, { ox: l.bounds.left | 0, oy: l.bounds.top | 0 }, x, y) });
      }
    }
    const buf = await writeLazyRasterPsd({ width: docW, height: docH,
      name: layerRenames[baseIdx] || baseL.name || docName || '图层 0', readTile: baseRead, psb: docW > 30000 || docH > 30000,
      extraLayers, blend: basePreview.blendMode, opacity: basePreview.opacity ?? 255, clipping: basePreview.clipping,
      hidden: basePreview.hidden, fillOpacity: basePreview.fillOpacity ?? 255, effects: basePreview.effects,
      abortSignal: opts.abortSignal || null, onProgress: opts.onProgress || null, asBlob: !!opts.asBlob });
    opts.onSnapshot?.();
    return { buf, canvas: null, composite: null,
      notes: { warp: 0, quilted: 0, deformed: 0, deformNew: 0, composite: false, skipped: [], srcNotes: [],
        tiled: true, sparseTiles: 0, affineLayers: keys.length }, fast: !!opts.fast };
  };
  if (!origBuffer) throw new Error('先打开一个 PSD');
  const lazyPixelDoc = await buildLazyPixelDocPsd(opts);
  if (lazyPixelDoc) return lazyPixelDoc;
  if (lazyRaster && hasAnyEdits()) {
    const unsupported = Object.keys(layerTextEdits).length || Object.keys(textStyleEdits).length || Object.keys(textDescEdits).length
      || Object.keys(soEdits).length || Object.keys(soRepl).length || Object.keys(soBaked).length
      || layerDeletes.size || layerDupes.length || layerReorder || Object.keys(layerTransforms).some(i => transformChanged(+i))
      || workPathDirty || savedPathsDirty || slicesDirty
      || (docSizeBase && (docW !== docSizeBase.w || docH !== docSizeBase.h));
    if (unsupported) throw new Error(structuralWriteRefusal());
    return buildLazyStructuralPsdBuffer({ ...opts, abortSignal: opts.abortSignal || null }, lazyRaster);
  }



  const bakedLayer = !lazyRaster && exportOrder.length ? doc.layers[exportOrder[0]] : null;
  const bakedFull = bakedLayer && (bakedLayer.bounds?.left | 0) === 0 && (bakedLayer.bounds?.top | 0) === 0
    && (bakedLayer.bounds?.right | 0) === docW && (bakedLayer.bounds?.bottom | 0) === docH;
  if (bakedLayer && bakedFull && (bakedLayer.lazyTileStore || bakedLayer.lazyPixelOps?.length)) {
    const bakedIdx = exportOrder[0];
    const blockedExtra = l => !!(l && (l.group || l.groupType != null || l.mask || l.vectorMask || l.adjustment ||
      l.fill || l.isSmartObject || l.isText || l.text ||
      ((l.lazyChannels || l.lazyCompressedChannels) && !canStreamExtra(l))));
    if (blockedExtra(bakedLayer) || exportOrder.slice(1).some(i => blockedExtra(doc.layers[i]))
        || Object.keys(layerTransforms).some(i => { const tr = affineOf(+i); return transformChanged(+i) && (!tr || (tr.quad && tr.quad.length !== 4)) && !layerDeletes.has(+i); })
        || workPathDirty || savedPathsDirty || slicesDirty)
      throw new Error('超大文档的已烘焙图层暂只支持「底层 + 可流式读取的像素图层」的 PSD 导出；请先拼合其它图层。');
    const { writeLazyRasterPsd } = await import('../../../core/psd-lazy-write.js');
    const psb = docW > 30000 || docH > 30000;
    const previewLayers = previewCompositeDoc(doc).layers;
    const basePreview = previewLayers[bakedIdx] || bakedLayer;
    const baseSparse = pixelPaint[bakedIdx]?.sparse;
    const baseTf = affineOf(bakedIdx);
    const extraLayers = [];
    for (const i of exportOrder.slice(1)) {
      const sourceLayer = doc.layers[i], previewLayer = previewLayers[i] || sourceLayer;
      if (!sourceLayer || sourceLayer === bakedLayer) continue;
      const name = layerRenames[i] || layerTree?.flat?.[i]?.name || sourceLayer.name || `图层 ${i}`;
      const props = { name, blendMode: previewLayer.blendMode, opacity: previewLayer.opacity,
        fillOpacity: previewLayer.fillOpacity, clipping: previewLayer.clipping, hidden: previewLayer.hidden,
        effects: previewLayer.effects }, sparse = pixelPaint[i]?.sparse;
      const tr = affineOf(i);
      if (tr) {
        extraLayers.push({ ...props, bounds: affineBounds(sourceLayer, tr),
          readTile: tr.plain ? (x, y) => readTranslatedTile(sourceLayer, i, tr, x, y) : makeAffineReader(sourceLayer, i, tr) });
        continue;
      }
      const streamTile = canStreamExtra(sourceLayer) ? extraStreamTile(sourceLayer, i) : null;
      if (streamTile) {
        extraLayers.push({ ...props, bounds: { ...sourceLayer.bounds }, readTile: streamTile });
      } else if (sparse?.tiles?.size) {
        const u = sparseTilesRGBA([...sparse.tiles.values()], name);
        if (u) extraLayers.push({ ...props, rgba: u.rgba, bounds: u.bounds });
        else extraLayers.push(props);
      } else if (sourceLayer.rgba && sourceLayer.width > 0 && sourceLayer.height > 0)
        extraLayers.push({ ...props, rgba: sourceLayer.rgba, bounds: { ...sourceLayer.bounds } });
      else extraLayers.push(props);
    }
    const buf = await writeLazyRasterPsd({ width: docW, height: docH, name: layerRenames[bakedIdx] || bakedLayer.name || docName || '图层 0',
      readTile: baseTf
        ? (baseTf.plain ? (x, y) => readTranslatedTile(bakedLayer, bakedIdx, baseTf, x, y) : makeAffineReader(bakedLayer, bakedIdx, baseTf))
        : async (x, y) => overlaySparseEdit(await readLazyImageTile(bakedLayer, x, y), baseSparse?.tiles?.get(`${x}:${y}`)),
      psb, extraLayers,
      blend: basePreview.blendMode, opacity: basePreview.opacity ?? 255, clipping: basePreview.clipping,
      hidden: basePreview.hidden, fillOpacity: basePreview.fillOpacity ?? 255, effects: basePreview.effects,
      abortSignal: opts.abortSignal || null, onProgress: opts.onProgress || null, asBlob: !!opts.asBlob });
    opts.onSnapshot?.();
    return { buf, canvas: null, composite: null, notes: { warp: 0, quilted: 0, deformed: 0, deformNew: 0, composite: false, skipped: [], srcNotes: [], tiled: true, sparseTiles: 0 }, fast: !!opts.fast };
  }
  while(sparsePaintBusy())await flushSparsePaint();
  if(docW*docH>64e6&&!hasAnyEdits()&&!guidesDirty&&!slicesDirty){opts.onSnapshot?.();return {buf:origBuffer,canvas:null,composite:null,notes:{warp:0,quilted:0,deformed:0,deformNew:0,composite:false,skipped:[],srcNotes:[],tiled:true},fast:!!opts.fast};}
  if(docW*docH>64e6&&(Object.values(pixelPaint).some(p=>p.sparse)
    ||doc.layers.some(l=>l?.lazyMaskEdits?.tiles?.size||l?.lazyMaskEdits?.uniform!=null)
    ||doc.layers.some(l=>l?.mask&&l.mask.lazyChannel==null&&l.mask.gray&&(l.lazyChannels||l.lazyImage||l.lazyRasterFile||l.lazyTileStore)))){
    try { return await buildSparsePsdBuffer(opts); }
    catch (e) {
      

      if (lazyRaster && /稀疏写回瓦片越界|稀疏图层不存在/.test(String(e && e.message || e)))
        return buildLazyStructuralPsdBuffer({ ...opts, abortSignal: opts.abortSignal || null }, lazyRaster);
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



    const surf = compositeAll(composeDocForOrder(previewCompositeDoc(doc), displayOrder()), docW, docH, new Map());
    merged = surf.data;
    mc = document.createElement('canvas'); mc.width = docW; mc.height = docH;
    try { mc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(surf.data), docW, docH), 0, 0); } catch {}
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
      buf = rebuildPsdReplacingLayerPixels(buf, b.layerIdx, rgba, bounds, null , { sourcePatch, filterEffectsPatch: fePatch }).buffer;
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
    if (layerDeletes.has(i) || !transformChanged(i)) continue;
    if (i >= N0) { cloneTransforms.push(i); continue; }
    const l = doc.layers[i];
    if (!l || l.hidden) continue;
    const c = rasterizeTransformed(i, { clip: cropClip });
    if (!c) {


      if (!l.rgba && (l.lazyChannels || l.lazyCompressedChannels || l.lazyImage || l.lazyRasterFile || l.lazyTileStore))
        throw new Error(`「${layerNameOf(i)}」的变换需要重采样整层像素；这一层是超大图层，且文档含组 / 蒙版 / 效果 / 文字等结构，暂不能流式烘焙变换。请先拼合其它图层，或取消这次变换。`);
      continue;
    }
    
    const mk = transformedMaskFor(i, cropClip);
    if (mk) {
      try {
        await EDIT.load();
        const b = mk.bounds;
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
let exportAbort = null, exportEsc = null;
const isAbort = e => e?.name === 'AbortError';
export function setExportProgress(value, label){
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const pEl = document.getElementById('docLoadingPercent');
  const text = document.getElementById('docLoadingText');
  const bar = document.getElementById('docLoadingBar');
  const fill = document.getElementById('docLoadingBarFill');
  if (pEl) { pEl.hidden = false; pEl.textContent = pct + '%'; }
  if (text && label) text.textContent = label;
  if (bar) bar.hidden = false;
  if (fill) fill.style.width = pct + '%';
}
function beginExportTask(label = '正在导出当前文档…'){
  exportAbort?.abort();
  const controller = new AbortController();
  exportAbort = controller;
  setWaitCursor(true, label);
  setExportProgress(0, label);
  const btn = document.getElementById('docLoadingCancel');
  if (btn) { btn.hidden = false; btn.onclick = () => cancelExportTask(); }
  exportEsc = e => { if (e.key === 'Escape' && exportAbort) { e.preventDefault(); e.stopImmediatePropagation(); cancelExportTask(); } };
  addEventListener('keydown', exportEsc, true);
  return controller.signal;
}
function cancelExportTask(){ exportAbort?.abort(new DOMException('导出已取消', 'AbortError')); }
function endExportTask(){
  const btn = document.getElementById('docLoadingCancel'); if (btn) { btn.hidden = true; btn.onclick = null; }
  if (exportEsc) removeEventListener('keydown', exportEsc, true);
  exportEsc = null; exportAbort = null;
  setWaitCursor(false);
}
export function setWaitCursor(on, label){
  if (!document.body) return;
  if (on && label) waitCursorLabel = label;
  waitCursorDepth = Math.max(0, waitCursorDepth + (on ? 1 : -1));
  const busy = waitCursorDepth > 0;
  document.body.classList.toggle('doc-loading', busy);
  if (busy && !waitCursorTimer) {
    const tick = () => {
      const name = 'typekitSpinner' + ((waitCursorFrame++ % 6) + 1);
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
    if (!busy) {
      const pct = document.getElementById('docLoadingPercent'); if (pct) pct.hidden = true;
      const bar = document.getElementById('docLoadingBar'); if (bar) bar.hidden = true;
      const btn = document.getElementById('docLoadingCancel'); if (btn) btn.hidden = true;
    }
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
let pngCrcTable = null;
function pngCrc(bytes){
  if(!pngCrcTable){pngCrcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;pngCrcTable[n]=c>>>0;}}
  let c=0xffffffff;for(const b of bytes)c=pngCrcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function pngChunk(type,data){
  const t=new TextEncoder().encode(type), body=new Uint8Array(t.length+data.length);body.set(t);body.set(data,t.length);
  const out=new Uint8Array(12+data.length),dv=new DataView(out.buffer);dv.setUint32(0,data.length);out.set(t,4);out.set(data,8);dv.setUint32(8+data.length,pngCrc(body));return out;
}


function makeLazyAffineTileReader(layer, index, tr, check = null){
  const cache = new Map(), sw = layer.width || docW, sh = layer.height || docH;
  const tileAt = async (tx, ty) => {
    if (check) check();
    const key = `${tx}:${ty}`;
    let t = cache.get(key);
    if (t) { cache.delete(key); cache.set(key, t); return t; }
    let base = null;
    try {
      if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) base = await readLazyImageTile(layer, tx, ty);
      else if (layer.lazyChannels) { await decodeLazyTile(index, tx, ty, 256); base = layer.lazyHighTiles?.get(key) || null; }
    } catch { base = null; }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    if (edit) base = base ? overlaySparseEdit(base, edit) : edit;
    if (base) { cache.set(key, base); if (cache.size > 64) cache.delete(cache.keys().next().value); }
    return base;
  };
  const rad = (tr.rot || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = tr.x + tr.w / 2, cy = tr.y + tr.h / 2, kx = sw / tr.w, ky = sh / tr.h;
  const qinv = tr.quad ? invertQuad(quadMatrix(sw, sh, tr.quad)) : null;
  if (tr.quad && !qinv) throw new Error('透视变换矩阵退化，无法导出');
  const srcOf = (dx, dy) => {
    if (qinv) {
      const w = qinv[6] * dx + qinv[7] * dy + qinv[8];
      if (Math.abs(w) < 1e-12) return null;
      let u = (qinv[0] * dx + qinv[1] * dy + qinv[2]) / w, v = (qinv[3] * dx + qinv[4] * dy + qinv[5]) / w;
      if (tr.flipX) u = sw - u;
      if (tr.flipY) v = sh - v;
      return [u, v];
    }
    let u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    if (tr.flipX) u = -u;
    if (tr.flipY) v = -v;
    return [u * kx + sw / 2, v * ky + sh / 2];
  };
  const srcBox = (dx, dy, w, h) => {
    const q = [srcOf(dx - (qinv ? 0 : cx), dy - (qinv ? 0 : cy)), srcOf(dx + w - (qinv ? 0 : cx), dy - (qinv ? 0 : cy)),
      srcOf(dx + w - (qinv ? 0 : cx), dy + h - (qinv ? 0 : cy)), srcOf(dx - (qinv ? 0 : cx), dy + h - (qinv ? 0 : cy))].filter(Boolean);
    if (!q.length) return { x0: 0, x1: 0, y0: 0, y1: 0 };
    return { x0: Math.max(0, Math.floor(Math.min(...q.map(p => p[0]))) - 1), x1: Math.min(sw, Math.ceil(Math.max(...q.map(p => p[0]))) + 1),
      y0: Math.max(0, Math.floor(Math.min(...q.map(p => p[1]))) - 1), y1: Math.min(sh, Math.ceil(Math.max(...q.map(p => p[1]))) + 1) };
  };
  const fillRect = async (out, destX, destY, w, rectX, rectY, rw, rh) => {
    const b = srcBox(rectX, rectY, rw, rh);
    if (!(b.x1 > b.x0 && b.y1 > b.y0)) return;
    const pw = b.x1 - b.x0, ph = b.y1 - b.y0, patch = new Uint8ClampedArray(pw * ph * 4);
    for (let ty = Math.floor(b.y0 / 256) * 256; ty < b.y1; ty += 256) for (let tx = Math.floor(b.x0 / 256) * 256; tx < b.x1; tx += 256) {
      const t = await tileAt(tx, ty); if (!t) continue;
      const ax0 = Math.max(b.x0, t.x), ax1 = Math.min(b.x1, t.x + t.width), ay0 = Math.max(b.y0, t.y), ay1 = Math.min(b.y1, t.y + t.height);
      for (let y = ay0; y < ay1; y++)
        patch.set(t.data.subarray(((y - t.y) * t.width + ax0 - t.x) * 4, ((y - t.y) * t.width + ax1 - t.x) * 4), ((y - b.y0) * pw + ax0 - b.x0) * 4);
    }
    for (let yy = 0; yy < rh; yy++) {
      const gy = rectY + yy;
      for (let xx = 0; xx < rw; xx++) {
        const gx = rectX + xx, p = srcOf(gx + 0.5 - (qinv ? 0 : cx), gy + 0.5 - (qinv ? 0 : cy));
        if (!p) continue;
        const [sx, sy] = p;
        const fx = sx - b.x0 - 0.5, fy = sy - b.y0 - 0.5;
        if (fx <= -1 || fy <= -1 || fx >= pw || fy >= ph) continue;
        const ix = Math.max(0, Math.min(pw - 1, Math.floor(fx))), iy = Math.max(0, Math.min(ph - 1, Math.floor(fy)));
        const ix1 = Math.min(pw - 1, ix + 1), iy1 = Math.min(ph - 1, iy + 1);
        const ax = fx - Math.floor(fx), ay = fy - Math.floor(fy);
        const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        const p00 = (iy * pw + ix) * 4, p10 = (iy * pw + ix1) * 4, p01 = (iy1 * pw + ix) * 4, p11 = (iy1 * pw + ix1) * 4;
        const a00 = patch[p00 + 3], a10 = patch[p10 + 3], a01 = patch[p01 + 3], a11 = patch[p11 + 3];
        const a = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
        if (a <= 0.5) continue;
        const o = ((gy - destY) * w + gx - destX) * 4;
        out[o] = (patch[p00] * a00 * w00 + patch[p10] * a10 * w10 + patch[p01] * a01 * w01 + patch[p11] * a11 * w11) / a;
        out[o + 1] = (patch[p00 + 1] * a00 * w00 + patch[p10 + 1] * a10 * w10 + patch[p01 + 1] * a01 * w01 + patch[p11 + 1] * a11 * w11) / a;
        out[o + 2] = (patch[p00 + 2] * a00 * w00 + patch[p10 + 2] * a10 * w10 + patch[p01 + 2] * a01 * w01 + patch[p11 + 2] * a11 * w11) / a;
        out[o + 3] = a;
      }
    }
  };
  return async (destX, destY) => {
    if (check) check();
    const w = Math.min(256, docW - destX), h = Math.min(256, docH - destY);
    if (!(w > 0 && h > 0)) return { x: destX, y: destY, width: Math.max(0, w), height: Math.max(0, h), data: new Uint8ClampedArray(0) };
    const out = new Uint8ClampedArray(w * h * 4);
    let step = 256;
    for (;;) {
      const b = srcBox(destX, destY, Math.min(step, w), Math.min(step, h));
      if ((b.x1 - b.x0) * (b.y1 - b.y0) <= 4e6 || step <= 1) break;
      step = step >> 1;
    }
    for (let sy = 0; sy < h; sy += step) {
      for (let sx = 0; sx < w; sx += step)
        await fillRect(out, destX, destY, w, destX + sx, destY + sy, Math.min(step, w - sx), Math.min(step, h - sy));
      if (check) check();
    }
    return { x: destX, y: destY, width: w, height: h, data: out };
  };
}




export async function writeLazyPng8(layer, index, overlay = null, onProgress = null, signal = null, tf = null, hiddenBase = false){
  const { quantizeRGBA } = await import('../../../core/web-formats.js');
  const W = docW, H = docH, tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  let bandY = -1, bandSrc = null;
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tiles.set(key, tile); return tile; }
    if (tfTile) { const tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tiles.set(key, applyOverlays(tile, overlay)); return tiles.get(key); }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(bandSrc.data.subarray((yy * bandSrc.width + x) * 4, (yy * bandSrc.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else if (layer.rgba && layer.rgba.length >= layer.width * layer.height * 4) {
      const w = Math.min(tileSize, layer.width - x), h = Math.min(tileSize, layer.height - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(layer.rgba.subarray(((y + yy) * layer.width + x) * 4, ((y + yy) * layer.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tiles.set(key, applyOverlays(tile, overlay));
    return tiles.get(key);
  };
  const proxy = layer.lazyPreview;
  let pal, transIndex = -1;
  if (proxy?.data?.length) {
    const q = quantizeRGBA(proxy.data, proxy.width, proxy.height, { colors: 255, transparency: true, palette: 'selective', dither: 'none' });
    pal = q.pal; transIndex = q.transIndex;
  } else {
    const S = 256, n = 4, MW = S * n, MH = S * n, rgba = new Uint8ClampedArray(MW * MH * 4);
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      const tx = Math.min(W - 1, Math.floor((gx + 0.5) * W / n / S) * S), ty = Math.min(H - 1, Math.floor((gy + 0.5) * H / n / S) * S);
      const t = await tileAt(tx, ty); if (!t) continue;
      for (let y = 0; y < Math.min(S, MH - gy * S, t.height); y++)
        rgba.set(t.data.subarray(y * t.width * 4, (y * t.width + Math.min(S, MW - gx * S, t.width)) * 4), ((gy * S + y) * MW + gx * S) * 4);
    }
    const q = quantizeRGBA(rgba, MW, MH, { colors: 255, transparency: true, palette: 'selective', dither: 'none' });
    pal = q.pal; transIndex = q.transIndex;
  }

  if (transIndex < 0) { transIndex = pal.length; pal = pal.concat([[255, 255, 255]]); }
  const opaquePal = pal.slice(0, transIndex);
  let depth = 8; if (pal.length <= 2) depth = 1; else if (pal.length <= 4) depth = 2; else if (pal.length <= 16) depth = 4;
  const ih = new Uint8Array(13), idv = new DataView(ih.buffer);
  idv.setUint32(0, W); idv.setUint32(4, H); ih[8] = depth; ih[9] = 3;
  const plte = new Uint8Array(pal.length * 3); pal.forEach((c, i) => plte.set(c.slice(0, 3), i * 3));
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ih), pngChunk('PLTE', plte)];
  if (transIndex >= 0) { const tr = new Uint8Array(transIndex + 1).fill(255); tr[transIndex] = 0; parts.push(pngChunk('tRNS', tr)); }
  const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter();
  const readDone = (async () => { const r = cs.readable.getReader(); for (;;) { const q = await r.read(); if (q.done) break; if (q.value?.length) parts.push(pngChunk('IDAT', q.value)); } })();
  const matte = [255, 255, 255], rowB = Math.ceil(W * depth / 8);
  try {
    for (let y0 = 0; y0 < H; y0 += tileSize) {
      check();
      const rows = Math.min(tileSize, H - y0), band = [];
      for (let x0 = 0; x0 < W; x0 += tileSize) band.push([x0, await tileAt(x0, y0)]);
      const raw = new Uint8ClampedArray(rows * W * 4);
      for (let y = 0; y < rows; y++) for (const [x0, t] of band) {
        const w = Math.min(tileSize, W - x0), sy = Math.min(t.height - 1, y), si = (sy * t.width) * 4, di = (y * W + x0) * 4;
        raw.set(t.data.subarray(si, si + w * 4), di);
      }
      tiles.clear();
      const rgb = new Uint8Array(rows * W * 3), clear = new Uint8Array(rows * W); let anyClear = false;
      for (let i = 0; i < rows * W; i++) {
        const a = raw[i * 4 + 3] / 255, o = i * 3;
        if (a < 0.5) { clear[i] = 1; anyClear = true; rgb[o] = matte[0]; rgb[o + 1] = matte[1]; rgb[o + 2] = matte[2]; }
        else for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(raw[i * 4 + c] * a + matte[c] * (1 - a));
      }
      const idx = quantizeRGB(rgb, W, rows, opaquePal.length ? opaquePal : [matte], { dither: 'none' });
      if (anyClear && transIndex >= 0) for (let i = 0; i < clear.length; i++) if (clear[i]) idx[i] = transIndex;
      const out = new Uint8Array(rows * (1 + rowB));
      for (let y = 0; y < rows; y++) {
        const o = y * (1 + rowB); out[o] = 0;
        for (let x = 0; x < W; x++) {
          const v = idx[y * W + x], bit = x * depth;
          out[o + 1 + (bit >> 3)] |= v << (8 - depth - (bit & 7));
        }
      }
      await writer.write(out);
      if (onProgress) { try { onProgress(y0 + rows, H); } catch {} }
    }
    check(); await writer.close(); await readDone; check();
    parts.push(pngChunk('IEND', new Uint8Array(0)));
    return { blob: new Blob(parts, { type: 'image/png' }) };
  } catch (e) { try { await writer.abort(e); await readDone; } catch {} throw e; }
}


export async function writeLazyGif(layer, index, overlay = null, onProgress = null, signal = null, tf = null, hiddenBase = false){
  if (docW > 65535 || docH > 65535) throw new Error(`GIF 不支持 ${docW}×${docH}（边长上限 65535）`);
  const { quantizeRGBA } = await import('../../../core/web-formats.js');
  const W = docW, H = docH, tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  let bandY = -1, bandSrc = null;
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tiles.set(key, tile); return tile; }
    if (tfTile) { const tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tiles.set(key, applyOverlays(tile, overlay)); return tiles.get(key); }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(bandSrc.data.subarray((yy * bandSrc.width + x) * 4, (yy * bandSrc.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else if (layer.rgba && layer.rgba.length >= layer.width * layer.height * 4) {
      const w = Math.min(tileSize, layer.width - x), h = Math.min(tileSize, layer.height - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(layer.rgba.subarray(((y + yy) * layer.width + x) * 4, ((y + yy) * layer.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tiles.set(key, applyOverlays(tile, overlay));
    return tiles.get(key);
  };
  const proxy = layer.lazyPreview;
  let pal, transIndex = -1;
  if (proxy?.data?.length) {
    const q = quantizeRGBA(proxy.data, proxy.width, proxy.height, { colors: 255, transparency: true, palette: 'selective', dither: 'none' });
    pal = q.pal; transIndex = q.transIndex;
  } else {
    const S = 256, n = 4, MW = S * n, MH = S * n, rgba = new Uint8ClampedArray(MW * MH * 4);
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      const tx = Math.min(W - 1, Math.floor((gx + 0.5) * W / n / S) * S), ty = Math.min(H - 1, Math.floor((gy + 0.5) * H / n / S) * S);
      const t = await tileAt(tx, ty); if (!t) continue;
      for (let y = 0; y < Math.min(S, MH - gy * S, t.height); y++)
        rgba.set(t.data.subarray(y * t.width * 4, (y * t.width + Math.min(S, MW - gx * S, t.width)) * 4), ((gy * S + y) * MW + gx * S) * 4);
    }
    const q = quantizeRGBA(rgba, MW, MH, { colors: 255, transparency: true, palette: 'selective', dither: 'none' });
    pal = q.pal; transIndex = q.transIndex;
  }
  if (transIndex < 0) { transIndex = pal.length; pal = pal.concat([[255, 255, 255]]); }
  const opaquePal = pal.slice(0, transIndex);
  let bitsPer = 1; while ((1 << bitsPer) < pal.length) bitsPer++;
  const parts = [], u8 = (...v) => parts.push(Uint8Array.from(v)), u16 = v => parts.push(Uint8Array.from([v & 255, (v >> 8) & 255]));
  const str = t => parts.push(Uint8Array.from(t, c => c.charCodeAt(0)));
  str('GIF89a'); u16(W); u16(H); u8(0x80 | ((bitsPer - 1) << 4) | (bitsPer - 1), 0, 0);
  for (let i = 0, n = 1 << bitsPer; i < n; i++) { const c = pal[i] || [0, 0, 0]; u8(c[0], c[1], c[2]); }
  u8(0x21, 0xf9, 4, 1); u16(0); u8(transIndex, 0);
  u8(0x2c); u16(0); u16(0); u16(W); u16(H); u8(0);
  const minCode = Math.max(2, bitsPer); u8(minCode);

  const out = [];
  const sub = b => out.push(Uint8Array.from([b.length, ...b]));
  let cur = 0, bits = 0, codeSize = minCode + 1, next = (1 << minCode) + 2;
  let dict = new Map(), prefix = -1;
  let part = [];
  const flushPart = () => { if (part.length) { sub(part); part = []; } };
  const putByte = v => { part.push(v & 255); if (part.length === 255) flushPart(); };
  const emit2 = code => {
    cur |= code << bits; bits += codeSize;
    while (bits >= 8) { putByte(cur); cur >>>= 8; bits -= 8; }
  };
  emit2(1 << minCode);
  const reset = () => { dict = new Map(); codeSize = minCode + 1; next = (1 << minCode) + 2; };
  const push = v => {
    if (prefix < 0) { prefix = v; return; }
    const key = prefix * 4096 + v, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; return; }
    emit2(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << codeSize) && codeSize < 12) codeSize++; }
    else { emit2(1 << minCode); reset(); }
    prefix = v;
  };
  const matte = [255, 255, 255];
  try {
    for (let y0 = 0; y0 < H; y0 += tileSize) {
      check();
      const rows = Math.min(tileSize, H - y0), band = [];
      for (let x0 = 0; x0 < W; x0 += tileSize) band.push([x0, await tileAt(x0, y0)]);
      const raw = new Uint8ClampedArray(rows * W * 4);
      for (let y = 0; y < rows; y++) for (const [x0, t] of band) {
        const w = Math.min(tileSize, W - x0), sy = Math.min(t.height - 1, y), si = (sy * t.width) * 4, di = (y * W + x0) * 4;
        raw.set(t.data.subarray(si, si + w * 4), di);
      }
      tiles.clear();
      const rgb = new Uint8Array(rows * W * 3), clear = new Uint8Array(rows * W); let anyClear = false;
      for (let i = 0; i < rows * W; i++) {
        const a = raw[i * 4 + 3] / 255, o = i * 3;
        if (a < 0.5) { clear[i] = 1; anyClear = true; rgb[o] = matte[0]; rgb[o + 1] = matte[1]; rgb[o + 2] = matte[2]; }
        else for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(raw[i * 4 + c] * a + matte[c] * (1 - a));
      }
      const idx = quantizeRGB(rgb, W, rows, opaquePal.length ? opaquePal : [matte], { dither: 'none' });
      if (anyClear) for (let i = 0; i < clear.length; i++) if (clear[i]) idx[i] = transIndex;
      for (let i = 0; i < idx.length; i++) push(idx[i]);
      if (onProgress) { try { onProgress(y0 + rows, H); } catch {} }
    }
    if (prefix >= 0) emit2(prefix);
    emit2((1 << minCode) + 1);
    if (bits > 0) { putByte(cur); cur = 0; bits = 0; }
    flushPart();
    for (const b of out) parts.push(b);
    u8(0, 0x3b);
    return { blob: new Blob(parts, { type: 'image/gif' }) };
  } finally {}
}


export async function writeLazyExr(layer, index, overlay = null, onProgress = null, signal = null, tf = null, hiddenBase = false){
  const W = docW, H = docH, tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  let bandY = -1, bandSrc = null;
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tiles.set(key, tile); return tile; }
    if (tfTile) { const tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tiles.set(key, applyOverlays(tile, overlay)); return tiles.get(key); }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(bandSrc.data.subarray((yy * bandSrc.width + x) * 4, (yy * bandSrc.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else if (layer.rgba && layer.rgba.length >= layer.width * layer.height * 4) {
      const w = Math.min(tileSize, layer.width - x), h = Math.min(tileSize, layer.height - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(layer.rgba.subarray(((y + yy) * layer.width + x) * 4, ((y + yy) * layer.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tiles.set(key, applyOverlays(tile, overlay));
    return tiles.get(key);
  };
  const LE = (n, k = 4) => { const b = new Uint8Array(k), d = new DataView(b.buffer); if (k === 4) d.setUint32(0, n >>> 0, true); else d.setUint16(0, n & 65535, true); return b; };
  const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0, true); return b; };
  const atoms = [];
  const attr = (name, type, payload) => { atoms.push(new TextEncoder().encode(name + '\0' + type + '\0'), LE(payload.length), payload); };
  const chlParts = [];
  for (const nm of ['A', 'B', 'G', 'R']) chlParts.push(new TextEncoder().encode(nm + '\0'), LE(1), new Uint8Array([0, 0, 0, 0]), LE(1), LE(1));
  chlParts.push(new Uint8Array([0]));
  const chl = new Uint8Array(chlParts.reduce((n, p) => n + p.length, 0)); { let o = 0; for (const p of chlParts) { chl.set(p, o); o += p.length; } }
  attr('channels', 'chlist', chl);
  attr('compression', 'compression', new Uint8Array([0]));
  const box = new Uint8Array(16), bdv = new DataView(box.buffer); bdv.setInt32(8, W - 1, true); bdv.setInt32(12, H - 1, true);
  attr('dataWindow', 'box2i', box); attr('displayWindow', 'box2i', box); attr('lineOrder', 'lineOrder', new Uint8Array([0]));
  attr('pixelAspectRatio', 'float', new Uint8Array(new Float32Array([1]).buffer));
  attr('screenWindowCenter', 'v2f', new Uint8Array(8));
  attr('screenWindowWidth', 'float', new Uint8Array(new Float32Array([1]).buffer));
  const headParts = [LE(20000630), LE(2), ...atoms, new Uint8Array([0])], header = new Uint8Array(headParts.reduce((n, p) => n + p.length, 0));
  { let o = 0; for (const p of headParts) { header.set(p, o); o += p.length; } }
  const table = new Uint8Array(H * 8), tdv = new DataView(table.buffer);
  let off = header.length + table.length;
  const blockLen = 8 + W * 8;
  for (let y = 0; y < H; y++) { tdv.setBigUint64(y * 8, BigInt(off), true); off += blockLen; }
  const linear = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; linear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const fbuf = new Float32Array(1), ibuf = new Int32Array(fbuf.buffer);
  const half = v => {
    fbuf[0] = v; const x = ibuf[0], sign = (x >>> 16) & 0x8000;
    let e = ((x >>> 23) & 0xff) - 127 + 15;
    if (e <= 0) return sign;
    if (e >= 31) return sign | 0x7c00;
    return (sign | (e << 10) | ((x >>> 13) & 0x3ff)) & 0xffff;
  };
  const parts = [header, table], hbuf = new Uint8Array(W * 8), hdv = new DataView(hbuf.buffer);
  for (let y = 0; y < H; y++) {
    check();
    const band = [];
    for (let x = 0; x < W; x += tileSize) band.push([x, await tileAt(x, y)]);

    for (let ch = 0; ch < 4; ch++) {
      const srcC = [3, 2, 1, 0][ch], dst = ch * W * 2;
      for (const [x0, t] of band) {
        const w = Math.min(tileSize, W - x0);
        for (let x = 0; x < w; x++) {
          const si = x * 4;
          const v = ch === 0 ? t.data[si + 3] / 255 : linear[t.data[si + srcC]];
          hdv.setUint16(dst + (x0 + x) * 2, half(v), true);
        }
      }
    }
    tiles.clear();
    parts.push(i32(y), LE(W * 8), hbuf);
    if (onProgress) { try { onProgress(y + 1, H); } catch {} }
  }
  return { blob: new Blob(parts, { type: 'image/x-exr' }) };
}
export async function writeLazyRawImage(layer, index, overlay = null, fmt = 'ppm', onProgress = null, signal = null, tf = null, hiddenBase = false){
  const W = docW, H = docH, tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tiles.set(key, tile); return tile; }
    if (tfTile) { const tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tiles.set(key, applyOverlays(tile, overlay)); return tiles.get(key); }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      let band = null;
      if (y !== bandAt.y) { bandAt.y = y; bandAt.src = await readLazyImageBand(layer, y, tileSize); }
      band = bandAt.src;
      if (!band) throw new Error('大图行带读取失败');
      if (band.preview) bandAt.preview = true;
      const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y), data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(band.data.subarray((yy * band.width + x) * 4, (yy * band.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else if (layer.rgba && layer.rgba.length >= layer.width * layer.height * 4) {
      const w = Math.min(tileSize, layer.width - x), h = Math.min(tileSize, layer.height - y);
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(layer.rgba.subarray(((y + yy) * layer.width + x) * 4, ((y + yy) * layer.width + x + w) * 4), yy * w * 4);
      tile = { x, y, width: w, height: h, data };
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tiles.set(key, applyOverlays(tile, overlay));
    return tiles.get(key);
  };
  const bandAt = { y: -1, src: null, preview: false };
  const enc = new TextEncoder(), parts = [];
  const hdr = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };
  const i32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0, true); return b; };
  if (fmt === 'ppm') parts.push(enc.encode(`P6\n${W} ${H}\n255\n`));
  else if (fmt === 'pam') parts.push(enc.encode(`P7\nWIDTH ${W}\nHEIGHT ${H}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`));
  else if (fmt === 'tga') {
    if (W > 65535 || H > 65535) throw new Error(`TGA 不支持 ${W}×${H}（边长上限 65535）`);
    const h = new Uint8Array(18); const dv = new DataView(h.buffer);
    h[2] = 2; dv.setUint16(12, W, true); dv.setUint16(14, H, true); h[16] = 32; h[17] = 0x28;
    parts.push(h);
  } else if (fmt === 'bmp') {
    const fileSize = 54 + W * H * 4;
    if (fileSize > 0xffffffff) throw new Error('BMP 文件超过 4GB，无法导出');
    const h = new Uint8Array(54); const dv = new DataView(h.buffer);
    h[0] = 0x42; h[1] = 0x4d; dv.setUint32(2, fileSize, true); dv.setUint32(10, 54, true);
    dv.setUint32(14, 40, true); dv.setInt32(18, W, true); dv.setInt32(22, -H, true);
    dv.setUint16(26, 1, true); dv.setUint16(28, 32, true); dv.setUint32(34, W * H * 4, true);
    dv.setUint32(38, 2835, true); dv.setUint32(42, 2835, true);
    parts.push(h);
  } else if (fmt === 'hdr') {
    parts.push(enc.encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`));
  } else throw new Error(`未知原始格式：${fmt}`);
  const linear = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; linear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const toRGBe = (r, g, b, out, o) => {
    if (r < 1e-32 && g < 1e-32 && b < 1e-32) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
    const m = Math.max(r, g, b), e = Math.ceil(Math.log2(m)) + 128;
    if (e < 1) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
    if (e > 255) { out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = 255; return; }
    const s = 256 / Math.pow(2, e - 128);
    out[o] = Math.min(255, Math.floor(r * s)); out[o + 1] = Math.min(255, Math.floor(g * s));
    out[o + 2] = Math.min(255, Math.floor(b * s)); out[o + 3] = e;
  };
  const rle = (src, out) => {
    let i = 0;
    while (i < W) {
      let run = 1; while (i + run < W && run < 127 && src[i + run] === src[i]) run++;
      if (run >= 4) { out.push(128 + run, src[i]); i += run; continue; }
      const start = i; i += run;
      while (i < W && i - start < 128) {
        let r2 = 1; while (i + r2 < W && r2 < 127 && src[i + r2] === src[i]) r2++;
        if (r2 >= 4) break;
        i += r2;
      }
      out.push(i - start); for (let j = start; j < i; j++) out.push(src[j]);
    }
  };
  try {
    for (let y0 = 0; y0 < H; y0 += tileSize) {
      check();
      const rows = Math.min(tileSize, H - y0), band = [];
      for (let x0 = 0; x0 < W; x0 += tileSize) band.push([x0, await tileAt(x0, y0)]);
      const raw = new Uint8ClampedArray(rows * W * 4);
      for (let y = 0; y < rows; y++) for (const [x0, t] of band) {
        const w = Math.min(tileSize, W - x0), sy = Math.min(t.height - 1, y), si = (sy * t.width) * 4, di = (y * W + x0) * 4;
        raw.set(t.data.subarray(si, si + w * 4), di);
      }
      tiles.clear();
      if (fmt === 'ppm') {
        const out = new Uint8Array(rows * W * 3);
        for (let i = 0, o = 0; i < raw.length; i += 4, o += 3) { out[o] = raw[i]; out[o + 1] = raw[i + 1]; out[o + 2] = raw[i + 2]; }
        parts.push(out);
      } else if (fmt === 'pam') parts.push(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
      else if (fmt === 'tga' || fmt === 'bmp') {
        const out = new Uint8Array(rows * W * 4);
        for (let i = 0; i < raw.length; i += 4) { out[i] = raw[i + 2]; out[i + 1] = raw[i + 1]; out[i + 2] = raw[i]; out[i + 3] = raw[i + 3]; }
        parts.push(out);
      } else {
        const row = new Uint8Array(W * 4), line = [];
        for (let y = 0; y < rows; y++) {
          for (let x = 0, o = 0; x < W; x++, o += 4) toRGBe(linear[raw[(y * W + x) * 4]] , linear[raw[(y * W + x) * 4 + 1]], linear[raw[(y * W + x) * 4 + 2]], row, o);
          line.length = 0;
          if (W < 8 || W > 32767) line.push(...row);
          else {
            line.push(2, 2, W >> 8, W & 255);
            for (let c = 0; c < 4; c++) { const ch = new Uint8Array(W); for (let x = 0; x < W; x++) ch[x] = row[x * 4 + c]; rle(ch, line); }
          }
          parts.push(Uint8Array.from(line));
        }
      }
      if (onProgress) { try { onProgress(y0 + rows, H); } catch {} }
    }
    check();
    const mime = fmt === 'ppm' ? 'image/x-portable-pixmap' : fmt === 'pam' ? 'image/x-portable-arbitrarymap'
      : fmt === 'tga' ? 'image/x-tga' : fmt === 'bmp' ? 'image/bmp' : 'image/vnd.radiance';
    return { blob: new Blob(parts, { type: mime }), preview: bandAt.preview };
  } catch (e) { throw e; }
}
async function writeLazyPng(layer, index, overlay = null, onProgress = null, signal = null, tf = null, hiddenBase = false){
  if(typeof CompressionStream!=='function')throw new Error('当前浏览器没有流式 PNG 压缩支持');
  const W=docW,H=docH,parts=[Uint8Array.from([137,80,78,71,13,10,26,10])],ih=new Uint8Array(13),idv=new DataView(ih.buffer);
  idv.setUint32(0,W);idv.setUint32(4,H);ih[8]=8;ih[9]=6;parts.push(pngChunk('IHDR',ih));
  const cs=new CompressionStream('deflate'),writer=cs.writable.getWriter();

  const readDone=(async()=>{const r=cs.readable.getReader();for(;;){const q=await r.read();if(q.done)break;if(q.value?.length)parts.push(pngChunk('IDAT',q.value));}})();
  const tiles=new Map(),tileSize=256;
  const check=()=>{if(signal?.aborted)throw signal.reason||new DOMException('导出已取消','AbortError');};
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;


  let bandY = -1, bandSrc = null, previewFallback = false;
  const tileFromBand = (band, x, y) => {
    const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(band.data.subarray((yy * band.width + x) * 4, (yy * band.width + x + w) * 4), yy * w * 4);
    return { x, y, width: w, height: h, data };
  };
  const tileAt=async(x,y)=>{check();const key=`${x}:${y}`,hit=tiles.get(key);if(hit)return hit;
    if(hiddenBase){const w=Math.min(tileSize,W-x),h=Math.min(tileSize,H-y);let tile={x,y,width:w,height:h,data:new Uint8ClampedArray(w*h*4)};tile=applyOverlays(tile,overlay);check();tiles.set(key,tile);return tile;}
    if(tfTile){let tile=await tfTile(x,y);if(!tile)throw new Error('大图瓦片读取失败');tile=applyOverlays(tile,overlay);check();tiles.set(key,tile);return tile;}
    const edit=pixelPaint[index]?.sparse?.tiles?.get(key);let tile=null;
    if(layer.lazyTileStore||layer.lazyImage||layer.lazyRasterFile){
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      if (bandSrc.preview) previewFallback = true;
      tile = tileFromBand(bandSrc, x, y);
    }
    else {await decodeLazyTile(index,x,y,tileSize);tile=layer.lazyHighTiles?.get(key)||null;}
    if(edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if(!tile)throw new Error('大图瓦片读取失败');
    tile=applyOverlays(tile,overlay);check();tiles.set(key,tile);return tile;
  };
  try{
    for(let y0=0;y0<H;y0+=tileSize){check();const rows=Math.min(tileSize,H-y0),raw=new Uint8Array(rows*(1+W*4)),band=[];
      for(let x0=0;x0<W;x0+=tileSize)band.push([x0,await tileAt(x0,y0)]);
      for(let y=0;y<rows;y++){const ro=y*(1+W*4);for(const [x0,t] of band){const w=Math.min(tileSize,W-x0),srcY=Math.min(t.height-1,y+y0-t.y);raw[ro+1+x0*4]=0;for(let x=0;x<w;x++){const si=(srcY*t.width+x)*4,di=ro+1+(x0+x)*4;raw[di]=t.data[si];raw[di+1]=t.data[si+1];raw[di+2]=t.data[si+2];raw[di+3]=t.data[si+3];}}}
      await writer.write(raw); tiles.clear();
      if (onProgress) { try { onProgress(y0 + rows, H); } catch {  } }
    }
    check();await writer.close();await readDone;check();
    parts.push(pngChunk('IEND',new Uint8Array(0)));check();return { blob: new Blob(parts,{type:'image/png'}), preview: previewFallback };
  }catch(e){try{await writer.abort(e);await readDone;}catch{}throw e;}
}

export async function writeLazyJpeg(layer, index, overlay = null, quality = 90, onProgress = null, signal = null, tf = null, hiddenBase = false){
  const { createJpegEncoder } = await import('../../../core/jpeg-encode.js');
  const W = docW, H = docH, encoder = createJpegEncoder({ width: W, height: H, quality });
  const tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  let bandY = -1, bandSrc = null, previewFallback = false;
  const tileFromBand = (band, x, y) => {
    const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(band.data.subarray((yy * band.width + x) * 4, (yy * band.width + x + w) * 4), yy * w * 4);
    return { x, y, width: w, height: h, data };
  };
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y); let tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tile = applyOverlays(tile, overlay); check(); tiles.set(key, tile); return tile; }
    if (tfTile) { let tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tile = applyOverlays(tile, overlay); check(); tiles.set(key, tile); return tile; }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      if (bandSrc.preview) previewFallback = true;
      tile = tileFromBand(bandSrc, x, y);
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tile = applyOverlays(tile, overlay);
    check(); tiles.set(key, tile); return tile;
  };
  try {
    for (let y0 = 0; y0 < H; y0 += tileSize) {
      check();
      const rows = Math.min(tileSize, H - y0), raw = new Uint8ClampedArray(rows * W * 4), band = [];
      for (let x0 = 0; x0 < W; x0 += tileSize) band.push([x0, await tileAt(x0, y0)]);
      for (let y = 0; y < rows; y++) for (const [x0, t] of band) {
        const w = Math.min(tileSize, W - x0), srcY = Math.min(t.height - 1, y);
        for (let x = 0; x < w; x++) {
          const si = (srcY * t.width + x) * 4, di = (y * W + x0 + x) * 4;
          raw[di] = t.data[si]; raw[di + 1] = t.data[si + 1]; raw[di + 2] = t.data[si + 2]; raw[di + 3] = t.data[si + 3];
        }
      }
      encoder.writeRows(raw, rows);
      tiles.clear();
      if (onProgress) { try { onProgress(y0 + rows, H); } catch {  } }
    }
    check();
    return { blob: encoder.finish(), preview: previewFallback };
  } catch (e) {
    try { encoder.finish(); } catch {}
    throw e;
  }
}

export async function writeLazyCanvas(layer, index, overlay = null, type = 'image/webp', quality = 90, onProgress = null, signal = null, tf = null, hiddenBase = false){
  const MAX_DIM = 32767, MAX_AREA = 268435456;
  if (docW > MAX_DIM || docH > MAX_DIM || docW * docH > MAX_AREA)
    throw new Error(`超大 WebP：浏览器画布上限约 ${MAX_DIM} 边长 / 2.68 亿像素；当前 ${docW}×${docH} 请改用 JPG / PNG / PDF`);
  const W = docW, H = docH, cv = new OffscreenCanvas(W, H), ctx = cv.getContext('2d');
  const tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  let bandY = -1, bandSrc = null, previewFallback = false;
  const tileFromBand = (band, x, y) => {
    const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(band.data.subarray((yy * band.width + x) * 4, (yy * band.width + x + w) * 4), yy * w * 4);
    return { x, y, width: w, height: h, data };
  };
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y); let tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tile = applyOverlays(tile, overlay); check(); tiles.set(key, tile); return tile; }
    if (tfTile) { let tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tile = applyOverlays(tile, overlay); check(); tiles.set(key, tile); return tile; }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      if (bandSrc.preview) previewFallback = true;
      tile = tileFromBand(bandSrc, x, y);
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tile = applyOverlays(tile, overlay);
    check(); tiles.set(key, tile); return tile;
  };
  for (let y0 = 0; y0 < H; y0 += tileSize) {
    check();
    const rows = Math.min(tileSize, H - y0), raw = new Uint8ClampedArray(rows * W * 4), band = [];
    for (let x0 = 0; x0 < W; x0 += tileSize) band.push([x0, await tileAt(x0, y0)]);
    for (let y = 0; y < rows; y++) for (const [x0, t] of band) {
      const w = Math.min(tileSize, W - x0), srcY = Math.min(t.height - 1, y);
      for (let x = 0; x < w; x++) {
        const si = (srcY * t.width + x) * 4, di = (y * W + x0 + x) * 4;
        raw[di] = t.data[si]; raw[di + 1] = t.data[si + 1]; raw[di + 2] = t.data[si + 2]; raw[di + 3] = t.data[si + 3];
      }
    }
    ctx.putImageData(new ImageData(raw, W, rows), 0, y0);
    tiles.clear();
    if (onProgress) { try { onProgress(y0 + rows, H); } catch {  } }
  }
  check();
  const blob = await cv.convertToBlob({ type, quality: Math.max(0.01, Math.min(1, quality / 100)) });
  return { blob, preview: previewFallback };
}

export async function writeLazyTiff(layer, index, overlay = null, onProgress = null, signal = null, tf = null, hiddenBase = false){
  const { encodeTiffStreaming } = await import('../../../core/tiff-encode.js');
  const W = docW, H = docH, tiles = new Map(), tileSize = 256;
  const check = () => { if (signal?.aborted) throw signal.reason || new DOMException('导出已取消', 'AbortError'); };
  const tfTile = tf ? makeLazyAffineTileReader(layer, index, tf, check) : null;
  let bandY = -1, bandSrc = null, previewFallback = false;
  const tileFromBand = (band, x, y) => {
    const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) data.set(band.data.subarray((yy * band.width + x) * 4, (yy * band.width + x + w) * 4), yy * w * 4);
    return { x, y, width: w, height: h, data };
  };
  const tileAt = async (x, y) => {
    check();
    const key = `${x}:${y}`, hit = tiles.get(key); if (hit) return hit;
    if (hiddenBase) { const w = Math.min(tileSize, W - x), h = Math.min(tileSize, H - y); let tile = { x, y, width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; tile = applyOverlays(tile, overlay); check(); tiles.set(key, tile); return tile; }
    if (tfTile) { let tile = await tfTile(x, y); if (!tile) throw new Error('大图瓦片读取失败'); tile = applyOverlays(tile, overlay); check(); tiles.set(key, tile); return tile; }
    const edit = pixelPaint[index]?.sparse?.tiles?.get(key);
    let tile = null;
    if (layer.lazyTileStore || layer.lazyImage || layer.lazyRasterFile) {
      if (bandY !== y) { bandY = y; bandSrc = await readLazyImageBand(layer, y, tileSize); }
      if (!bandSrc) throw new Error('大图行带读取失败');
      if (bandSrc.preview) previewFallback = true;
      tile = tileFromBand(bandSrc, x, y);
    } else {
      await decodeLazyTile(index, x, y, tileSize);
      tile = layer.lazyHighTiles?.get(key) || null;
    }
    if (edit) tile = tile ? overlaySparseEdit(tile, edit) : edit;
    if (!tile) throw new Error('大图瓦片读取失败');
    tile = applyOverlays(tile, overlay);
    check(); tiles.set(key, tile); return tile;
  };
  const readRows = async (y0, rows) => {
    const raw = new Uint8ClampedArray(rows * W * 4), band = [];
    for (let x0 = 0; x0 < W; x0 += tileSize) band.push([x0, await tileAt(x0, y0)]);
    for (let y = 0; y < rows; y++) for (const [x0, t] of band) {
      const w = Math.min(tileSize, W - x0), srcY = Math.min(t.height - 1, y);
      for (let x = 0; x < w; x++) {
        const si = (srcY * t.width + x) * 4, di = (y * W + x0 + x) * 4;
        raw[di] = t.data[si]; raw[di + 1] = t.data[si + 1]; raw[di + 2] = t.data[si + 2]; raw[di + 3] = t.data[si + 3];
      }
    }
    tiles.clear();
    return raw;
  };
  const blob = await encodeTiffStreaming({ width: W, height: H, rowsPerStrip: tileSize, readRows, onProgress, signal });
  return { blob, preview: previewFallback };
}

export async function writeLazyPdf(layer, index, overlay = null, quality = 90, onProgress = null, signal = null, tf = null, hiddenBase = false){
  const jpeg = await writeLazyJpeg(layer, index, overlay, quality, onProgress, signal, tf, hiddenBase);
  const bytes = new Uint8Array(await jpeg.blob.arrayBuffer());
  const ppi = docResolution || 72;
  let pw = docW / ppi * 72, ph = docH / ppi * 72;
  const k = Math.min(1, 14400 / Math.max(pw, ph));
  pw *= k; ph *= k;
  const { writePdf } = await import('../../../core/pdf-write.js');
  const pdf = writePdf([{ width: pw, height: ph,
    images: [{ jpeg: bytes, pw: docW, ph: docH, x: 0, y: 0, w: pw, h: ph }] }],
  { title: docName || '' });
  return { blob: new Blob([pdf], { type: 'application/pdf' }), preview: jpeg.preview, page: { w: pw, h: ph } };
}





function blendTileInto(out, src, sw, sh, dx, dy, opacity) {
  if (!src || !(sw > 0 && sh > 0)) return;
  const ox = out.x, oy = out.y, ow = out.width, oh = out.height;
  const x0 = Math.max(0, ox - dx), x1 = Math.min(sw, ox + ow - dx);
  const y0 = Math.max(0, oy - dy), y1 = Math.min(sh, oy + oh - dy);
  const dst = out.data;
  for (let y = y0; y < y1; y++) {
    const sr = y * sw, dr = (dy + y - oy) * ow;
    for (let x = x0; x < x1; x++) {
      const si = (sr + x) * 4, di = (dr + (dx + x - ox)) * 4;
      const sa = (src[si + 3] / 255) * opacity;
      if (sa <= 0) continue;
      const da = dst[di + 3] / 255, oa = sa + da * (1 - sa);
      if (oa <= 0) continue;
      dst[di] = (src[si] * sa + dst[di] * da * (1 - sa)) / oa;
      dst[di + 1] = (src[si + 1] * sa + dst[di + 1] * da * (1 - sa)) / oa;
      dst[di + 2] = (src[si + 2] * sa + dst[di + 2] * da * (1 - sa)) / oa;
      dst[di + 3] = oa * 255;
    }
  }
}



function visibleBelowLazy(lazyLayer) {
  const order = displayOrder(), at = order.indexOf(doc.layers.indexOf(lazyLayer)), hid = groupHiddenSet();
  for (let k = 0; k < at; k++) {
    const i = order[k], l = doc.layers[i];
    if (!l || l.hidden || hid.has(i)) continue;
    if (l.rgba || pixelPaint[i]?.sparse?.tiles?.size || textRenders[i] || l.fill || l.adjustment || l.vectorMask) return true;
  }
  return false;
}

function plainPassGroup(l) {
  const g = l && l.group; if (!g || g.type == null) return false;
  if (g.type === 3) return true;
  return (l.blendMode === 'pass' || g.blendKey === 'pass')
    && (l.opacity ?? 255) === 255 && (g.opacity ?? 255) === 255
    && !g.mask && !g.vectorMask && !g.effects && !g.artboard && !l.vectorStroke && !l.blendIf && !l.knockout;
}


function groupHiddenSet() {
  const out = new Set(), stack = [], order = displayOrder();
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k], l = doc.layers[i]; if (!l) continue;
    const g = l.group;
    if (g && g.type === 1) { const v = layerEdits[i]?.visible; stack.push(v == null ? !!l.hidden : !v); continue; }
    if (g && g.type === 3) { stack.pop(); continue; }
    if (stack.some(Boolean)) out.add(i);
  }
  return out;
}
function pngOverlayReason(lazyLayer) {
  let seenBase = false;
  const hid = groupHiddenSet();
  for (const i of displayOrder()) {
    const l = doc.layers[i];
    if (!l) continue;
    if (l === lazyLayer) { seenBase = true; continue; }
    if (!seenBase) {
      if (!l.hidden && !hid.has(i) && (l.rgba || pixelPaint[i]?.sparse?.tiles?.size || textRenders[i] || l.fill || l.adjustment))
        return '懒加载底图下方还有可见图层，流式导出会丢失它们';
      continue;
    }
    const nm = l.name || `图层 ${i}`;
    if (l.group && l.group.type != null) {
      if (plainPassGroup(l)) continue;
      return `图层「${nm}」在组里，且不是直通组；组蒙版/混合模式尚未接入流式合成`;
    }
    if (l.hidden || hid.has(i) || (l.opacity ?? 255) === 0) continue;
    if (l.adjustment || l.fill) return `调整/填充图层「${nm}」会改变下方像素，尚未接入流式合成`;
    if (l.mask || l.vectorMask || l.effects || l.clipping || (l.fillOpacity ?? 255) !== 255 || (l.blendMode || 'norm') !== 'norm')
      return `图层「${nm}」的蒙版/效果/混合模式尚未接入流式合成`;
    if (pixelPaint[i]?.sparse?.tiles?.size || (l.rgba && l.width > 0 && l.height > 0)) continue;
    if (textRenders[i] && textCrops[i]?.rgba) continue;
    if (l.isSmartObject || l.isText || l.text) return `图层「${nm}」没有可用的栅格结果，流式导出会把它丢掉`;

    if (!l.rgba && !l.fill && !l.adjustment && !l.vectorMask && !l.mask) continue;
    return `图层「${nm}」没有可用的栅格结果`;
  }
  return '';
}
const pngOverlayLayersOK = lazyLayer => !pngOverlayReason(lazyLayer);
function exportOverlays(lazyLayer) {
  const list = [], hid = groupHiddenSet();
  for (const i of displayOrder()) {
    const l = doc.layers[i];
    if (!l || l === lazyLayer || l.hidden || hid.has(i) || (l.group && l.group.type != null)) continue;
    const op = (l.opacity == null ? 255 : l.opacity) / 255;
    if (op <= 0) continue;
    const pp = pixelPaint[i];
    if (pp?.sparse?.tiles?.size) { list.push({ tiles: pp.sparse.tiles, op }); continue; }
    if (l.rgba && l.width > 0 && l.height > 0)
      list.push({ rgba: l.rgba, w: l.width, h: l.height, left: l.bounds?.left || 0, top: l.bounds?.top || 0, op });


    else if (textRenders[i] && textCrops[i]?.rgba) {
      const tc = textCrops[i], b = tc.bounds, w = b.right - b.left, h = b.bottom - b.top;
      if (w > 0 && h > 0 && tc.rgba.length === w * h * 4)
        list.push({ rgba: tc.rgba, w, h, left: b.left, top: b.top, op });
    }
  }
  return list;
}

function overlaySparseEdit(base, edit) {
  if (!base || !edit) return base || edit;
  if (!edit.original || edit.original.length !== edit.data.length
      || edit.x !== base.x || edit.y !== base.y || edit.width !== base.width || edit.height !== base.height)
    return edit;
  const data = new Uint8ClampedArray(base.data);
  if ((edit.data.length & 3) === 0 && !(edit.data.byteOffset & 3) && !(edit.original.byteOffset & 3)) {
    const a = new Uint32Array(edit.data.buffer, edit.data.byteOffset, edit.data.length >> 2);
    const b = new Uint32Array(edit.original.buffer, edit.original.byteOffset, edit.original.length >> 2);
    const o = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) o[i] = a[i];
  } else {
    for (let i = 0; i < edit.data.length; i++) if (edit.data[i] !== edit.original[i]) data[i] = edit.data[i];
  }
  return { ...base, data };
}
function applyOverlays(tile, list) {
  if (!tile || !list || !list.length) return tile;
  const out = { x: tile.x, y: tile.y, width: tile.width, height: tile.height, data: new Uint8ClampedArray(tile.data) };
  for (const o of list) {
    if (o.tiles) { const t = o.tiles.get(`${out.x}:${out.y}`); if (t) blendTileInto(out, t.data, t.width, t.height, t.x, t.y, o.op); }
    else blendTileInto(out, o.rgba, o.w, o.h, o.left, o.top, o.op);
  }
  return out;
}


function drawOverlaysOnCanvas(g, list) {
  for (const o of list || []) {
    if (o.tiles) {
      for (const t of o.tiles.values()) {
        const data = o.op >= .999 ? t.data : (() => {
          const d = new Uint8ClampedArray(t.data);
          for (let i = 3; i < d.length; i += 4) d[i] = Math.round(d[i] * o.op);
          return d;
        })();
        g.putImageData(new ImageData(data, t.width, t.height), t.x, t.y);
      }
    } else if (o.rgba && o.w > 0 && o.h > 0) {
      const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(o.rgba), o.w, o.h), 0, 0);
      g.globalAlpha = o.op; g.drawImage(c, o.left, o.top); g.globalAlpha = 1;
    }
  }
}



function sparseTilesRGBA(tiles, label) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    if (t.x < x0) x0 = t.x; if (t.y < y0) y0 = t.y;
    if (t.x + t.width > x1) x1 = t.x + t.width;
    if (t.y + t.height > y1) y1 = t.y + t.height;
  }
  if (!(x1 > x0 && y1 > y0)) return null;
  const w = x1 - x0, h = y1 - y0;
  if (w * h > 64e6)
    throw new Error(`PSD 导出：图层「${label}」的笔迹覆盖约 ${w}×${h} 像素，分布过散；请把笔迹集中到较小区域，或先拼合图层再导出。`);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (const t of tiles) for (let y = 0; y < t.height; y++)
    rgba.set(t.data.subarray(y * t.width * 4, (y + 1) * t.width * 4), ((t.y + y - y0) * w + t.x - x0) * 4);
  return { rgba, bounds: { top: y0, left: x0, bottom: y1, right: x1 } };
}
function overlayLayersForPsd(lazyLayer) {
  const out = [], hid = groupHiddenSet();
  for (const i of displayOrder()) {
    const l = doc.layers[i];
    if (!l || l === lazyLayer || l.hidden || hid.has(i)) continue;
    if (l.group && l.group.type != null) {
      if (plainPassGroup(l)) continue;
      throw new Error('PSD 导出：懒加载底图上方有非直通组；请先取消编组或拼合。');
    }
    const nm = l.name || `图层 ${i}`;
    if (l.mask || l.vectorMask) throw new Error(`PSD 导出：图层「${nm}」的蒙版/矢量蒙版尚未接入流式写回；请先应用蒙版或拼合。`);
    const pp = pixelPaint[i];
    if (pp?.sparse?.tiles?.size) {
      const props = { blendMode: l.blendMode, opacity: l.opacity, fillOpacity: l.fillOpacity, clipping: l.clipping, hidden: l.hidden, effects: l.effects };
      const u = sparseTilesRGBA([...pp.sparse.tiles.values()], nm);
      if (!u) out.push({ name: nm, ...props });
      else out.push({ ...props, name: nm, rgba: u.rgba, bounds: u.bounds });
      continue;
    }
    if (l.rgba && l.width > 0 && l.height > 0 && l.bounds)
      out.push({ name: nm, rgba: l.rgba, bounds: { top: l.bounds.top, left: l.bounds.left, bottom: l.bounds.bottom, right: l.bounds.right }, blendMode: l.blendMode, opacity: l.opacity, fillOpacity: l.fillOpacity, clipping: l.clipping, hidden: l.hidden, effects: l.effects });



    else if (textRenders[i] && textCrops[i] && textCrops[i].rgba) {
      const tc = textCrops[i], b = tc.bounds, cw = b.right - b.left, ch = b.bottom - b.top;
      if (cw > 0 && ch > 0 && tc.rgba.length === cw * ch * 4)
        out.push({ name: nm, rgba: new Uint8ClampedArray(tc.rgba), bounds: { ...b }, blendMode: l.blendMode, opacity: l.opacity, fillOpacity: l.fillOpacity, clipping: l.clipping, hidden: l.hidden, effects: l.effects });
      else out.push({ name: nm });
    }
    else {
      if (l.adjustment || l.fill || l.isSmartObject || l.isText || l.text)
        throw new Error(`PSD 导出：图层「${nm}」没有可写回的栅格结果（调整/形状/智能对象/未栅格化文字）；请先栅格化或拼合。`);
      out.push({ name: nm });
    }
  }
  return out;
}
async function runLazyRasterExport(fileName, opts, layer, signal){
  if (visibleBelowLazy(layer)) throw new Error('图层顺序：懒加载底图下方还有可见图层，流式导出会丢失它们；请把这些图层移到原图上方，或先拼合。');
  if (layer.mask || layer.vectorMask) throw new Error('懒加载底图的蒙版/矢量蒙版暂不支持流式导出；请先应用蒙版或拼合。');
  const fmt = opts.format || $('#exportFormat').value, source = doc?.lazyRasterFile, idx = doc?.layers?.indexOf(layer) ?? -1;


  if (!['psd', 'png', 'jpg', 'webp'].includes(fmt))
    throw new Error(`${fmt.toUpperCase()} 的超大图片导出尚未接入按行带编码；请改用 JPG / PNG / TIFF / PDF / WebP 或分层 PSD`);
  const tf = fmt !== 'psd' && idx >= 0 ? transformChanged(idx) : null;
  if (fmt !== 'psd') {
    if (tf?.quad) throw new Error('懒加载底图的透视 / 变形暂不支持流式导出；请先拼合或栅格化。');
    const otherTf = Object.keys(layerTransforms).some(k => {
      if (+k === idx || !transformChanged(+k) || layerDeletes.has(+k)) return false;
      const e = layerEdits[+k], l = doc.layers[+k];
      return !(e && e.visible != null ? !e.visible : l?.hidden);
    });
    if (otherTf) throw new Error('懒加载底图之外的图层带有未应用的旋转 / 缩放：请先拼合，或只对底图做变换后再导出。');
  }
  if (fmt !== 'psd') {
    const why = pngOverlayReason(layer);
    if (why) throw new Error(`${fmt.toUpperCase()} 导出：${why}；请先栅格化/拼合，或导出分层 PSD。`);
  }
  const pp = idx >= 0 ? pixelPaint[idx] : null, edited = !!pp?.sparse?.tiles?.size;
  const overlay = exportOverlays(layer);
  try {
    if (fmt === 'psd') {
      const psb = docW > 30000 || docH > 30000;


      const transformed = Object.keys(layerTransforms).some(i => transformChanged(+i) && !layerDeletes.has(+i));
      if (doc.layers.length > 1 || transformed) {
        let shown = -1;
        const built = await buildPsdBuffer({ asBlob: true, abortSignal: signal,
          onProgress: (done, total) => {
            const pct = Math.min(99, Math.floor(done * 100 / Math.max(1, total)));
            if (pct === shown) return; shown = pct;
            setExportProgress(pct, `正在导出当前文档… ${docW}×${docH} 分层 PSB`);
          } });
        if (signal.aborted) throw signal.reason;
        setExportProgress(99, '正在准备下载…');
        const blob = built.buf instanceof Blob ? built.buf : new Blob([built.buf], { type: 'image/vnd.adobe.photoshop' });
        const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fileName + (psb ? '.psb' : '.psd'); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        $('#info').textContent = `已导出原始尺寸 ${docW} × ${docH} 的分层 ${psb ? 'PSB' : 'PSD'}（分块写回，共 ${doc.layers.length} 个图层）`;
        return true;
      }
      const { writeLazyRasterPsd } = await import('../../../core/psd-lazy-write.js');
      const previewLayers = previewCompositeDoc(doc).layers;
      const extraLayers = overlayLayersForPsd(layer).map(extra => {
        const source = doc.layers.find(L => L.name === extra.name), current = source ? previewLayers[doc.layers.indexOf(source)] : null;
        return { ...extra, effects: current?.effects || extra.effects, blendMode: current?.blendMode || extra.blendMode,
          opacity: current?.opacity ?? extra.opacity, fillOpacity: current?.fillOpacity ?? extra.fillOpacity, clipping: current?.clipping ?? extra.clipping };
      });
      let shownPct = -1;
      const onProgress = (done, total) => {
        const pct = Math.min(99, Math.floor(done * 100 / Math.max(1, total)));
        if (pct === shownPct) return;
        shownPct = pct;
        setExportProgress(pct, `正在导出当前文档… ${docW}×${docH} ${psb ? 'PSB' : 'PSD'}`);
      };



      let bandY = -1, band = null, bandPreview = false;
      const readRowBand = async (y0) => {
        if (bandY === y0) return band;
        bandY = y0; band = null;
        const bandW = Math.min(256, docH - y0);
        if (bandW <= 0) return band;
        band = await readLazyImageBand(layer, y0, bandW);
        if (band?.preview) bandPreview = true;
        return band;
      };
      const buf = await writeLazyRasterPsd({ width: docW, height: docH, name: layer.name || docName || '图层 0', readTile: async (x, y) => {
        if (signal.aborted) throw signal.reason;
        const edit = pp?.sparse?.tiles?.get(`${x}:${y}`);
        const sourceBand = await readRowBand(y);
        if (!sourceBand) return overlaySparseEdit(await readLazyImageTile(layer, x, y), edit);
        const w = Math.min(256, docW - x), h = Math.min(256, docH - y);
        const data = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) data.set(sourceBand.data.subarray((yy * docW + x) * 4, (yy * docW + x + w) * 4), yy * w * 4);
        return overlaySparseEdit({ x, y, width: w, height: h, data }, edit);
      }, psb, extraLayers, onProgress, abortSignal: signal, asBlob: true });
      if (signal.aborted) throw signal.reason;
      setExportProgress(99, '正在准备下载…');
      const blob = buf instanceof Blob ? buf : new Blob([buf], { type: 'image/vnd.adobe.photoshop' });
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fileName + (psb ? '.psb' : '.psd'); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已导出原始尺寸 ${docW} × ${docH} 的 ${psb ? 'PSB' : 'PSD'}（分块写回，共 ${extraLayers.length + 1} 个图层）`
        + (bandPreview ? '；注意：原始像素区域解码失败，部分行带使用预览级像素' : ''); return true;
    }
    if (!edited && !overlay.length && !tf && !layer.lazyTileStore && !layer.lazyPixelOps?.length && fmt === 'jpg' && source) {
      if (signal.aborted) throw signal.reason;
      const url = URL.createObjectURL(source), a = document.createElement('a'); a.href = url; a.download = fileName + '.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = '已导出原始 JPEG（像素未改变）'; return true;
    }
    if (docW * docH > 180e6) throw new Error('这份图片超过当前浏览器的分块编码上限；已阻止导出以避免丢失原始像素');
    setExportProgress(15, '正在合成导出画面…');
    const cv = document.createElement('canvas'); cv.width = docW; cv.height = docH;
    const g = cv.getContext('2d', { willReadFrequently: false });

    const sw = layer.width || docW, sh = layer.height || docH;
    const beginTf = t => { g.save(); g.translate(t.x + t.w / 2, t.y + t.h / 2); if (t.rot) g.rotate(t.rot * Math.PI / 180); if (t.flipX || t.flipY) g.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; };
    const drawTileTf = (tile, t) => {
      const c = document.createElement('canvas'); c.width = tile.width; c.height = tile.height;
      c.getContext('2d').putImageData(new ImageData(tile.data, tile.width, tile.height), 0, 0);
      g.drawImage(c, -t.w / 2 + tile.x * t.w / sw, -t.h / 2 + tile.y * t.h / sh, tile.width * t.w / sw, tile.height * t.h / sh);
    };
    if (layer.lazyTileStore || layer.lazyPixelOps?.length) {

      const tiles = [];
      for (let ty = 0; ty < docH; ty += 256) for (let tx = 0; tx < docW; tx += 256) {
        if (signal.aborted) throw signal.reason;
        const tile = await readLazyImageTile(layer, tx, ty, 256);
        if (tile) tiles.push(tile);
      }
      if (tf) {
        beginTf(tf);
        for (const tile of tiles) drawTileTf(tile, tf);
        if (edited) for (const tile of pp.sparse.tiles.values()) drawTileTf(tile, tf);
        g.restore();
      } else {
        for (const tile of tiles) g.putImageData(new ImageData(tile.data, tile.width, tile.height), tile.x, tile.y);
        if (edited) for (const tile of pp.sparse.tiles.values()) g.putImageData(new ImageData(tile.data, tile.width, tile.height), tile.x, tile.y);
      }
    } else {
      let sourceImage = layer.lazyImage, ownedSourceImage = false;
      if (!sourceImage && layer.lazyRasterFile) { sourceImage = await decodeImageFile(layer.lazyRasterFile); ownedSourceImage = true; }
      if (!sourceImage) throw new Error('原始图片源已释放，无法导出');
      if (signal.aborted) throw signal.reason;
      if (tf) {
        beginTf(tf);
        g.drawImage(sourceImage, -tf.w / 2, -tf.h / 2, tf.w, tf.h);
        if (edited) for (const tile of pp.sparse.tiles.values()) drawTileTf(tile, tf);
        g.restore();
      } else {
        g.drawImage(sourceImage, 0, 0, docW, docH);
        if (edited) for (const tile of pp.sparse.tiles.values()) g.putImageData(new ImageData(tile.data, tile.width, tile.height), tile.x, tile.y);
      }
      if (ownedSourceImage) sourceImage.close?.();
    }
    drawOverlaysOnCanvas(g, overlay);
    if (fmt === 'jpg') { const bg = document.createElement('canvas'); bg.width = docW; bg.height = docH; const b = bg.getContext('2d'); b.fillStyle = '#fff'; b.fillRect(0, 0, docW, docH); b.drawImage(cv, 0, 0); cv.width = docW; cv.height = docH; g.drawImage(bg, 0, 0); }
    setExportProgress(55, '正在编码图片…');
    const blob = await canvasToBlob(cv, fmt === 'jpg' ? 'jpg' : fmt === 'webp' ? 'webp' : 'png', Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92)), signal);
    if (signal.aborted) throw signal.reason;
    setExportProgress(99, '正在准备下载…');
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fileName + '.' + (fmt === 'jpg' ? 'jpg' : fmt === 'webp' ? 'webp' : 'png'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#info').textContent = `已导出原始尺寸 ${docW} × ${docH} 的 ${fmt.toUpperCase()}${edited ? '（含局部修改）' : ''}`; return true;
  } finally {}
}
async function runExport(fileName, opts = {}){
  if(!origBuffer){ $('#err').textContent='先打开一个 PSD'; return false; }
  const fmt = opts.format || $('#exportFormat').value;
  const exportSignal = beginExportTask('正在导出当前文档…');
  try {
    const lazyPsd = doc?.layers?.find((l, i) => !layerDeletes.has(i) && (l?.lazyChannels || l?.lazyCompressedChannels
      || (l?.lazyRasterSource && (l?.lazyImage || l?.lazyRasterFile))));
    const lazyBaseIdx = lazyPsd ? doc.layers.indexOf(lazyPsd) : -1;
    const lazyTfKeys = Object.keys(layerTransforms).filter(i => transformChanged(+i) && !layerDeletes.has(+i));
    const lazyTf = lazyPsd && lazyTfKeys.length === 1 && +lazyTfKeys[0] === lazyBaseIdx ? transformChanged(lazyBaseIdx) : null;
    const baseHidden = lazyBaseIdx >= 0 && ((layerEdits[lazyBaseIdx]?.visible != null ? !layerEdits[lazyBaseIdx].visible : !!lazyPsd.hidden) || groupHiddenSet().has(lazyBaseIdx));
    const lazySimpleBase = lazyPsd && doc.depth === 8 && doc.mode === 3 && !lazyPsd.rgba && lazyPsd.bounds?.left === 0 && lazyPsd.bounds?.top === 0
      && lazyPsd.bounds?.right === docW && lazyPsd.bounds?.bottom === docH && (lazyPsd.opacity ?? 255) === 255
      && (lazyPsd.fillOpacity ?? 255) === 255 && !lazyPsd.clipping && lazyPsd.blendMode === 'norm'
      && !layerDeletes.size && !layerDupes.length && !layerReorder
      && (!docSizeBase || (docW === docSizeBase.w && docH === docSizeBase.h))
      && !lazyPsd.effects && !lazyPsd.fill && !lazyPsd.vectorMask
      && pngOverlayLayersOK(lazyPsd);

    const streamTf = lazyTf || null;
    const lazyStream = !!lazySimpleBase && (!lazyTfKeys.length || !!streamTf);
    if(fmt === 'png' && docW * docH > 64e6 && lazyStream){
      let pct = -1;
      const out=await writeLazyPng(lazyPsd,doc.layers.indexOf(lazyPsd),exportOverlays(lazyPsd),(done,total)=>{
        const p=Math.min(99,Math.floor(done*100/Math.max(1,total)));if(p===pct)return;pct=p;setExportProgress(p,`正在导出当前文档… ${docW}×${docH} PNG`);
      },exportSignal,streamTf,baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url=URL.createObjectURL(out.blob),a=document.createElement('a');a.href=url;a.download=fileName+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('#info').textContent=`已按瓦片导出原始尺寸 ${docW} × ${docH} 的 PNG` + (out.preview ? '；注意：原始像素区域解码失败，部分行带使用预览级像素' : '');return true;
    }
    if(fmt === 'jpg' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk'){
      const quality = Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92));
      let pct = -1;
      const out = await writeLazyJpeg(lazyPsd, doc.layers.indexOf(lazyPsd), exportOverlays(lazyPsd), quality, (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total))); if (p === pct) return; pct = p;
        setExportProgress(p, `正在按行带编码 JPEG… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出原始尺寸 ${docW} × ${docH} 的 JPEG` + (out.preview ? '；注意：原始像素区域解码失败，部分行带使用预览级像素' : '');
      return true;
    }
    if(fmt === 'webp' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk'){
      const quality = Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92));
      let pct = -1;
      const out = await writeLazyCanvas(lazyPsd, doc.layers.indexOf(lazyPsd), exportOverlays(lazyPsd), 'image/webp', quality, (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total))); if (p === pct) return; pct = p;
        setExportProgress(p, `正在按行带编码 WebP… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.webp'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出 ${docW} × ${docH} 的 WebP` + (out.preview ? '；部分行带使用预览级像素' : '');
      return true;
    }
    if(fmt === 'tiff' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk'){
      let pct = -1;
      const out = await writeLazyTiff(lazyPsd, doc.layers.indexOf(lazyPsd), exportOverlays(lazyPsd), (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total))); if (p === pct) return; pct = p;
        setExportProgress(p, `正在按行带编码 TIFF… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.tif'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出 ${docW} × ${docH} 的 TIFF（Deflate 条带）` + (out.preview ? '；部分行带使用预览级像素' : '');
      return true;
    }
    if(fmt === 'pdf' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk'){
      const quality = Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92));
      let pct = -1;
      const out = await writeLazyPdf(lazyPsd, doc.layers.indexOf(lazyPsd), exportOverlays(lazyPsd), quality, (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total))); if (p === pct) return; pct = p;
        setExportProgress(p, `正在按行带编码 PDF… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出原始尺寸 ${docW} × ${docH} 的图像 PDF（JPEG 压缩，页面 ${out.page.w.toFixed(0)}×${out.page.h.toFixed(0)} pt）`;
      return true;
    }
    if (fmt === 'gif' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk') {
      const out = await writeLazyGif(lazyPsd, lazyBaseIdx, exportOverlays(lazyPsd), (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total)));
        setExportProgress(p, `正在按行带量化并编码 GIF… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.gif'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出原始尺寸 ${docW} × ${docH} 的 GIF（256 色调板）`;
      return true;
    }
    if (fmt === 'png8' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk') {
      const out = await writeLazyPng8(lazyPsd, lazyBaseIdx, exportOverlays(lazyPsd), (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total)));
        setExportProgress(p, `正在按行带量化并编码 PNG-8… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出原始尺寸 ${docW} × ${docH} 的 PNG-8（256 色调板）`;
      return true;
    }
    if (fmt === 'exr' && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk') {
      const out = await writeLazyExr(lazyPsd, lazyBaseIdx, exportOverlays(lazyPsd), (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total)));
        setExportProgress(p, `正在按行带编码 EXR… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.exr'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出原始尺寸 ${docW} × ${docH} 的 EXR（HALF，不压缩）`;
      return true;
    }
    if (['ppm', 'pam', 'tga', 'bmp', 'hdr'].includes(fmt) && docW * docH > 64e6 && lazyStream && $('#modeSel').value !== 'cmyk') {
      const out = await writeLazyRawImage(lazyPsd, lazyBaseIdx, exportOverlays(lazyPsd), fmt, (done, total) => {
        const p = Math.min(99, Math.floor(done * 100 / Math.max(1, total)));
        setExportProgress(p, `正在按行带编码 ${fmt.toUpperCase()}… ${docW}×${docH}`);
      }, exportSignal, streamTf, baseHidden);
      if (exportSignal.aborted) throw exportSignal.reason;
      setExportProgress(99, '正在准备下载…');
      const url = URL.createObjectURL(out.blob), a = document.createElement('a');
      a.href = url; a.download = fileName + '.' + EXPORT_EXT[fmt]; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#info').textContent = `已按行带导出原始尺寸 ${docW} × ${docH} 的 ${fmt.toUpperCase()}` + (out.preview ? '；部分行带使用预览级像素' : '');
      return true;
    }
    const lazyRaster = doc?.layers?.find((l, i) => l?.lazyRasterSource && !layerDeletes.has(i));
    if (lazyRaster) return await runLazyRasterExport(fileName, opts, lazyRaster, exportSignal);

    let buf0 = null, mc = null, notes = { skipped: [], srcNotes: [], warp: 0 }, buildErr = null;
    setExportProgress(5, '正在整理图层…');
    const wantCmykNow = $('#modeSel').value === 'cmyk';
    try { ({ buf: buf0, canvas: mc, notes } = await buildPsdBuffer({ abortSignal: exportSignal, asBlob: fmt === 'psd' && !wantCmykNow, onProgress: (done,total)=>setExportProgress(5+Math.floor(55*done/Math.max(1,total)),'正在生成文档…') })); }
    catch (e) { buildErr = e; console.error(e); }
    if (exportSignal.aborted) throw exportSignal.reason;
    if(buildErr&&docW*docH>64e6)throw buildErr;
    try { LB && LB.afterSave(); } catch {}
    if (!mc&&!notes.tiled) mc = previewCompositeCanvas();
    let buf = buf0;
    const warns = [];
    if (buildErr) warns.push(`分层写回失败（${buildErr.message}），已按当前画面导出`);
    if (notes.skipped.length) warns.push('以下项目未能写回：\n· ' + notes.skipped.join('\n· '));
    let srcNote = notes.srcNotes.length ? '；' + notes.srcNotes.join('；') : '';
    const wantCmyk = $('#modeSel').value === 'cmyk';
    if(notes.tiled&&(fmt!=='psd'||wantCmyk))throw new Error('此超大文档目前支持分层 PSD/PSB 写回，该图像格式的流式导出仍待接入');
    let cmyk = wantCmyk && fmt !== 'png' && fmt !== 'webp';
    const quality = Math.max(1, Math.min(100, Math.round(+$('#exportQuality').value) || 92));
    const icc = !$('#exportIccRow').hidden ? ($('#exportIcc').value || '') : '';
    let outBlob, outType;
    setExportProgress(30, '正在写入文档…');
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
        if (exportSignal.aborted) throw exportSignal.reason;
        if (!outBlob) {
          buf = await convertDocCmykLocal(buf);
          const lint2 = lintPsd(buf);
          if (!lint2.ok) warns.push('生成的 PSD 结构校验有问题（仍已导出）：\n· ' + lint2.errors.join('\n· '));
          srcNote += `；服务端不可用（${serverErr ? serverErr.message : '未知原因'}），已用浏览器快速分色（无 ICC）`;
          outBlob = new Blob([buf], { type: outType });
        }
      } else {
        if (buf instanceof Blob) outBlob = buf;
        else {
          let lint = { ok: true };
          try { lint = lintPsd(buf); } catch (e) { lint = { ok: false, errors: [e.message] }; }
          if (!lint.ok) warns.push('生成的 PSD 结构校验有问题（仍已导出，如 PS 打不开请把这段反馈给开发者）：\n· ' + lint.errors.join('\n· '));
          outBlob = new Blob([buf], { type: outType });
        }
      }
    } else if (fmt !== 'psd' && (opts.perArtboard ?? (!$('#exportAbRow').hidden && $('#exportPerArtboard').checked))) {
      const abs = docArtboards(), files = [], used = new Set();
      for (let ai = 0; ai < abs.length; ai++) {
        if (exportSignal.aborted) throw exportSignal.reason;
        const ab = abs[ai], r = ab.rect;
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
        else blob = await canvasToBlob(c, fmt, quality, exportSignal);
        const base = String((ab.name || 'artboard').trim() || 'artboard').replace(/[\\/:*?"<>|]/g, '_');
        let nm = base, k = 2; while (used.has(nm)) nm = `${base} (${k++})`; used.add(nm);
        files.push({ name: nm + '.' + EXPORT_EXT[fmt], data: new Uint8Array(await blob.arrayBuffer()), blob });
        setExportProgress(30 + Math.round((ai + 1) * 55 / Math.max(1, abs.length)), '正在编码画板…');
      }
      if (cmyk) { warns.push('按画板导出时颜色为 RGB（CMYK 分色请整幅导出）'); cmyk = false; }
      if (!files.length) throw new Error('画板都在画布之外，没有可导出的内容');
      if (files.length === 1) { outBlob = files[0].blob; fileName = files[0].name.replace(/\.[^.]+$/, ''); outType = outBlob.type; }
      else { outBlob = makeZip(files.map(f => ({ name: f.name, data: f.data }))); outType = 'application/zip'; }
      notes.artboardFiles = files.length;
    } else if (EXTRA_EXPORT.has(fmt)) {
      if (cmyk) { warns.push('这个格式按 RGB 输出'); cmyk = false; }
      outBlob = await encodeExtraCanvas(fmt, mc, quality); outType = outBlob.type;
    } else if ((fmt === 'tiff' || cmyk) && buf0 && await (async () => {
      try { outBlob = await serverRender(buf, { format: fmt, colorMode: cmyk ? 'cmyk' : 'rgb', quality, icc: (cmyk && icc) ? icc : undefined }); return !!outBlob; }
      catch (e) { warns.push(`服务端编码不可用（${e.message}），已改用浏览器本地编码${cmyk ? '，颜色为 RGB（CMYK 分色需要服务端）' : ''}`); cmyk = false; return false; }
    })()) {
      outType = outBlob.type || 'application/octet-stream';
    } else if (fmt === 'tiff') {
      outBlob = encodeTiffRGBA(mc.getContext('2d').getImageData(0, 0, docW, docH).data, docW, docH); outType = 'image/tiff';
    } else {
      let src = mc;
      if (fmt === 'jpg') {
        src = document.createElement('canvas'); src.width = docW; src.height = docH;
        const c2 = src.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, docW, docH); c2.drawImage(mc, 0, 0);
      }
      outBlob = await canvasToBlob(src, fmt, quality, exportSignal);
      outType = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    }
    if (exportSignal.aborted) throw exportSignal.reason;
    setExportProgress(99, '正在准备下载…');
    if (warns.length) $('#err').textContent = warns.join('\n');
    const dlURL = URL.createObjectURL(outBlob);
    const psb=fmt==='psd'&&(buf instanceof Blob ? (docW>30000||docH>30000) : buf&&new DataView(buf).getUint16(4)===2);
    const a=document.createElement('a'); a.href=dlURL; a.download=fileName + '.' + (outType === 'application/zip' ? 'zip' : psb?'psb':EXPORT_EXT[fmt]); a.click();
    if (fmt === 'psd' && HXP) HXP.onSaved();
    fireScriptEvent(fmt === 'psd' ? 'save' : 'export');
    setTimeout(() => URL.revokeObjectURL(dlURL), 1000);
    const fmtLabel = psb?'PSB':{ psd: 'PSD', png: 'PNG', jpg: 'JPG', tiff: 'TIFF', webp: 'WebP', pdf: 'PDF', png8: 'PNG-8', gif: 'GIF', bmp: 'BMP', tga: 'TGA', ico: 'ICO', exr: 'EXR', hdr: 'HDR', ppm: 'PPM', pam: 'PAM' }[fmt];
    $('#info').textContent = `已导出 ${fmtLabel}${cmyk ? '（CMYK）' : ''}`;
    return true;
  } catch(e){
    if (isAbort(e)) { $('#err').textContent = ''; $('#info').textContent = '已取消导出'; return false; }
    $('#err').textContent='导出失败：'+e.message; console.error(e); return false;
  } finally { endExportTask(); }
}

export const dispTextOf = (i, l) => layerTextEdits[i] != null ? layerTextEdits[i] : l.text.content;
export let fontSeq = 0;
export function set_fontSeq(v) { return (fontSeq = v); }   
