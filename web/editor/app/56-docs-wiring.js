import './55-commands.js';





import {
  parseSmartObjects, parsePsdRaster, parseLayerTree, parsePsdFull, compositeAll, lintPsd, parseFilterEffects,
  decodeFilterEffectsEntry, filterEffectsIdOf, parseImageResources,
} from '../../../core/app.js';
import { BRUSH_PRESETS } from '../../../core/brush-engine.js';
import { actions } from '../actions.js';
import { installDocumentFiles, saveDocumentFile } from '../document-file.js';
import { DOCS } from '../documents.js';
import { installAutosave } from '../autosave.js';
import { installTouchGestures } from '../touch-gestures.js';
import { installA11y } from '../a11y.js';
import { choiceDialog } from '../dialog.js';
import { toolCursor, cursorNames } from '../icons.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { pathBounds } from '../property-panel.js';
import { psPanels } from '../ps-panels.js';
import { CUSTOM_SHAPES, customShapeSubpaths } from '../shapes.js';
import { shell } from '../shell.js';
import { installToasts } from '../toast.js';
import { tools } from '../tools.js';
import {
  $, ADJUST, BRUSH, EDIT, FILTER, QUADW, RETOUCH, RETOUCHM, SELECT, SELM, api, applyEdits, cloneDeform,
  deformEquals, ellipseSelection, ensureLazy, freshLayerInfo, lassoSelection, layerStyleDlg,
  openLayerStyleDialog, rectSelection, selectionArea, selectionBounds, selectionValueAt,
} from './01-boot.js';
import {
  CHP, CM, LP, LX, SFX, applyDocFull, applyState, artboardGuidesOn, brushHistory, brushPreviewOn,
  captureDocFull, captureState, countVisible, cur, curStroke, doc, docH, docName, docSnapshotCanvas, docStack,
  docStructural, docViewState, docW, editPinsOn, emptyState, globalLight, globalLightDirty, gradState, gridOpts,
  guideDrag, guides, guidesVisible, layerDupes, layerEdits, layerOps, layerRenames, layerTextEdits,
  layerTransforms, layerTree, li, maskEdit, maskPaint, notesVisible, origBuffer, pixelGridOn, pixelPaint,
  psdFromPixels, pushHistory, redo, resetForNewDoc, rulersVisible, selDrag, selection, setDocViewState,
  set_docLabel, set_docName, set_guides, set_guidesDirty, settleForDocSwitch, soBaked, soEdits, soLayerIndex,
  soRepl, sos, textCrops, textDrag, textOverlay, textRenders, textStyleEdits, undo, viewPar, viewParCorrect,
} from './02-doc-state.js';
import {
  ACTP, ADJP, HXP, LAST_RUN, PP, docHistLock, docHistory, endLayerEdit, histCap, histLog, histMemBudget,
  histMemUsage, histReset, historyEntries, historyJump, historyStep, hxApplyCtx, hxCapture, pushDocHistory,
  redoAny, redoDoc, syncHistoryPanel, undoAny, undoDoc, updateUndoButtons,
} from './03-history.js';
import {
  RULER_UNITS, applyPan, centerStage, cropPad, fitStage, nextZoomStep, niceStep, padL, padT, panX, panY,
  rulerFrame, rulerPos, rulerUnit, setRulerUnit, setRulersVisible, setZoom, set_panX, set_panY, set_rulerPos,
  set_zoom, set_zoomFitMode, syncRulers, viewH, viewW, zoom, zoomFitMode,
} from './04-view-chrome.js';
import {
  opaqueBBox, rasterKindOf, rasterizeLayerUI, renderLayerAlone, viewport, zoomAtClient,
} from './05-layer-lock-guides.js';
import { commit, layerSelBBox, set_spaceDown, spaceDown, tfFrame, updatePanCursor } from './06-view-zoom-move.js';
import {
  beginMoveDrag, cancelMoveDrag, endMoveDrag, groupHeadOf, isVectorOnlyLayer, moveDrag, moveMoveDrag,
} from './07-nav-histogram.js';
import {
  docImageResources, docResolution, docResolutionBase, docSizeBase, newDocument, openCanvasSizeDialog,
  openImageSizeDialog, openNewDialog, resizeCanvas, resizeImage, scaleLayerGeometry, set_csAnchorSel,
  transformableLayers,
} from './08-doc-size.js';
import {
  applyTextStyle, createTextLayerAt, isTextLayer, textInfoOf, textToolDown, textToolUp,
} from './09-text-tool.js';
import {
  beginCrop, beginCropDrag, cancelCrop, commitCrop, cropApplyPreset, cropCycleOverlay, cropOpts, cropQuad,
  cropResetBox, cropState, cropSwapOrientation, cropTargetPx, endCropDrag, mid, moveCropDrag, saveCropOpts,
  syncCropBar,
} from './10-crop.js';
import {
  GRAD_PRESET_INDEX, bucketOpts, eyeOpts, gradCurrentModel, gradDrag, gradModelLut, gradOpts, gradParam,
  gradPresetModel, gradSample, gradStops, paintMap,
} from './11-paint-common.js';
import {
  beginGradDrag, bucketFill, closeGradPicker, closeGradientEditor, endGradDrag, eyedropAt, gradEditState,
  gradGeomFromLine, gradLineFromGeom, gradPickPreset, liveGradEdit, liveGradHit, liveGradInfo, moveGradDrag,
  openGradPicker, openGradientEditor, syncBucketBar, syncGradBar,
} from './15-gradient-bucket-eyedropper.js';
import {
  applyFilterLazy, applyFilterNow, closeFilterDialog, commitFilter, filterGuard, fltKinds, fltRender, fltState,
  lastFilter, openFilterDialog, openFilterLazy, renderFilterDialog, repeatLastFilter,
} from './16-filters-menu.js';
import {
  SHAPE_KINDS, activePath, afterWorkPathChange, applyLiveShape, beginShapeDrag, cancelPen, clearWorkPath,
  commitDrawnPath, commitPen, commitShapePath, endPenDrag, endShapeDrag, ensureDocPaths, liveRadiusWidgets,
  liveShapeOf, movePen, moveShapeDrag, pathTargetKey, penDown, penOpts, penState, rasterizeSubpaths, savedPaths,
  savedPathsDirty, setShapeMode, set_activePath, set_shapeState, shapeKindLabel, shapeLayerName, shapeOpts,
  shapeOriginFor, shapeRect, shapeState, shapeStrokeOpt, shapeSubpaths, subpathsBBox, syncShapeBar, workPath,
  workPathDirty, workPathSet, workPathToSelection,
} from './17-shape-pen.js';
import {
  curvatureDeleteSelected, curvatureDown, curvatureMove, endFreePen, finishMagPen, fitBezierPoints, freePen,
  freePenDown, freePenMove, freePenOpts, hideCustomPop, magPen, magPenDown, magPenMove, rdpSimplify,
  setCustomShape, showCustomPop, syncPenBar,
} from './18-pen-extra.js';
import {
  beginFreeTransform, beginTfDrag, cancelFreeTransform, commitFreeTransform, endTfDrag, moveLockWhy, moveTfDrag,
  tfCurValues, tfEligible, tfLast, tfNumFromQuad, tfState, tfSyncBar, transformAgain,
} from './19-free-transform.js';
import {
  bakeCurrentSO, builtIndexOf, dupAuto, dupPending, dupTask, dupTimer, duplicateLayerBlockUI, duplicateLayerUI,
  effectiveLayerMaskForBake, exitInside, hasAnyEdits, hitLayerAt, insideDirty, multiplyBakeMask, nudgeLayer,
  openInside, refreshAll, saveInside, scheduleDupMaterialize, set_dupAuto, set_dupPending, set_snapOn,
  snapLines, snapOn, snapTo, soInside,
} from './20-snap-smart-object.js';
import {
  decodeCacheStatus, decodeImageFile, decodeLazyTile, decodeLazyTiles, doSelectSO, docLoading, initDocument,
  isImageFileName, loadPsd, openImageAsDocument, selectSO,
} from './21-load-document.js';
import { deformTool, exitSO, pquadDrag, pquadMove, pquadSnapRect } from './22-deform-tools.js';
import {
  hideLayerCtx, layerCanvasCache, layerCtx, layerOrderView, liveMods, openLayerCtx, renderLayerPanel, rowEls,
  selLayer, selLayers, set_selLayer, syncThumbSelCursor, thumbCache, thumbSelHover,
} from './23-layers-panel.js';
import {
  addAdjustmentLayer, allLayerOps, attrGuards, countLayerOps, findLayerOp, layerParams, recomposeLayer,
  renderProps, setLayerLock,
} from './24-layer-ops-queue.js';
import { applyToolPresetRecord, captureToolPreset, defineBrushSource } from './25-presets-actions-wiring.js';
import {
  commitNewFillLayer, createLayerUI, docPatterns, fillDlgState, groupSelectedUI, openNewFillDialog,
  renderNewFillDialog, ungroupSelectedUI,
} from './26-layer-create.js';
import { gradClone, rgbHex, setLayerVisible } from './27-gradient-editor.js';
import {
  LAYER_DROP_CLASS, alignLayers, clearLayerDropHl, deleteLayerForReal, deleteLayersReal, deleteSelectedLayersUI,
  distributeLayers, dragRowIndex, ensureLayerTransform, getTransformValues, groupPicksUI, moveLayer,
  moveLayerTo, setLayerBox, setLayerPos, setLayerSize, set_dragRowIndex, toggleLayerDelete, transformChanged,
} from './28-layer-props-transform.js';
import { installScrubbers, rotateLayer } from './29-scrubby-live.js';
import {
  GPUV, chanCount, chanSupported, chanView, channelViewPixels, gpuActive, gpuFlush, gpuFrame, gpuSnapshotCanvas,
  gpuStatus, loadChannelSelection, paintStates, previewCompositeDoc, renderPreviewOnly, replaceImg,
  setChannelView, syncChannelPanel, viewScratch,
} from './30-render.js';
import {
  NOTESP, artHistoryOpts, auxDown, auxDrag, auxMove, auxUp, bgRGB, brush, captureHistorySource, cleanMixerBrush,
  copyToolData, docTool, editCountGroup, eraserOpts, fgRGB, fillStage, historySource, loadMixerBrush,
  measureLine, mixerOpts, mixerTile, moveOpts, pencilOpts, rulerMetrics, samplerOpts, selMode,
  selectHistorySource, setDocToolFromHarness, setViewAngle, set_bgRGB, set_fgRGB, set_measureLine,
  set_symmetryOn, startTextMask, straightenFromRuler, syncAuxBar, toolModes, viewAngle, zoomOutMode,
} from './31-selection-brush.js';
import {
  antsRAF, brushCursor, clearBrushCursor, clearSelectionPixels, combineInto, contractSel, currentCursorName,
  deselect, doWand, endSelBrush, expandSel, featherSel, fillSelectionPixels, invertSel, layerAlphaOnCanvas,
  layerOnCanvas, loadLayerAlphaAsSelection, makeWorkPathFromSelectionUI, mqOpts, sampleRGBA, sbOpts,
  selBrushDown, selBrushMove, selOpts, selPath, selectAll, setBrushCursor, setSelMode, setSelection,
  set_selOverlay, syncAnts, syncGizmoCursor, syncSelBar, syncSelBrushBar, syncToolButtons, syncToolOptions,
  wandOpts,
} from './32-cursors-select-options.js';
import {
  cancelMagLasso, cancelPolyLasso, closeMagLasso, closePolyLasso, endObjSel, endQuickSel, magLasso,
  magLassoDown, magLassoMove, magOpts, magUndoAnchor, objFinderReset, objSelDown, objSelMove, osFound, osHover,
  osOpts, osState, polyLasso, polyLassoDown, qsOpts, qsSample, qsState, quickSelDown, quickSelMove, set_osFound,
  set_qsEdgeCache, syncQuickSelBar,
} from './33-lasso-quick-select.js';
import {
  allSlices, autoSlices, cancelPCrop, commitPCrop, deleteSliceUI, divideSliceUI, docSlices, pcropConvex,
  pcropDown, pcropMove, pcropOpts, pcropState, pcropSyncOut, pcropUp, promoteSliceUI, set_sliceDrag, sliceDown,
  sliceMove, sliceOptionsUI, sliceRect, sliceSel, sliceSelectDown, sliceUp, sliceWriteWhy, slicesDirty,
  slicesFromGuidesUI, syncPCropBar, userSlices,
} from './34-perspective-crop-slice.js';
import {
  AB_PRESETS, abOpts, abPlusSpots, abSel, addArtboardBeside, artboardDown, artboardMembers, artboardMove,
  artboardUp, artboardWriteWhy, docArtboards, set_abState,
} from './35-artboard.js';
import {
  abApplyToSelected, artboardAutoNest, copyLayersUI, createArtboard, frameAt, frameBelow, frameDown, frameMove,
  frameOpts, frameUp, frameWhy, indexOfLayerId, lastClipKind, layerClip, makeArtboardFromGroupUI,
  placeImageInFrame, putIntoFrameUI, set_lastClipKind, set_layerClip, syncArtboardBar, syncFrameBar,
  takeOutOfFrameUI, unmakeArtboardUI,
} from './36-clipboard-frame.js';
import {
  BRUSHOP_TOOLS, beginBrushOpStroke, beginSelDrag, bgeOpts, boOffset, boOpts, boPatternImage, boSample,
  brushOpSample, brushOpWhy, crOpts, endSelDrag, magicEraseAt, meOpts, moveSelDrag, set_boOffset,
  syncBrushOpBar, syncMagBar,
} from './37-local-pixel-tools.js';
import {
  beginStroke, brushRedo, brushUndo, brushUndoable, endStroke, ensurePixelPaint, flushSparsePaint, lastPaintPt,
  maskFromSelection, paintGuard, repaintStrokeLayer, scheduleStrokeRepaint, sparsePaintBusy, strokeLineTo,
  strokeTo, syncBrushSwatches,
} from './38-brush-engine.js';
import {
  adjBrushOpts, applyBrushPreset, applyBrushRecord, beginPencilStroke, currentBrushRecord, endSymEdit,
  layerPixelAt, renderBrushSettings, startSymEdit, symEdit, syncBrushControls,
} from './39-brush-options.js';
import { openSelectAndMask, resetColors, swapColors, syncBrushPanel } from './40-options-bar-wiring.js';
import {
  adjLabel, adjRender, adjState, adjTypes, adjustGuard, openAdjustDialog, openAdjustLazy, renderAdjustDialog,
} from './41-image-adjust.js';
import { adjCtlState, adjLayerTarget, curveLUT, dedicatedAdjBlocks } from './42-adjust-panels.js';
import {
  commitCurveList, curveCtxNow, curvePtsOf, moveCurvePoint, readCurvePoint, renderAdjustCtl, setCurveEnd,
} from './43-gradient-map-adjust-form.js';
import {
  deleteActivePathUI, docSavedPaths, effPathSubpaths, fillPathUI, newSavedPathUI, pathGuard, pathNodes,
  pathPanelRows, pathToSelectionUI, pathWorking, readVectorPath, readVectorStroke, saveWorkPathUI,
  selectionToWorkPathUI, set_pathModel, strokePathUI,
} from './44-vector-path.js';
import {
  alignPathSubs, arrangePathSubs, beginPathDrag, commitPathEdit, deleteSelectedAnchors, deleteSelectedSubpaths,
  effStroke, endPathDrag, endPathSubDrag, mergePathComponents, movePathDrag, movePathSubDrag,
  nudgePathSelection, pathLook, pathNearestSegment, pathOpts, pathSelAnchors, pathSelSubs, pathToSelection,
  pathToolDown, selectionToLayerPath, setSelectedPathOp, setSubpathOperation, set_pathSelSubs, syncPathPanel,
} from './45-path-tools.js';
import {
  canvasPointerDown, drawGizmo, editFilter, filterEditsPayload, filterPending, filterSoIndexOf, gizmo,
  loadFilterList, soFilterEdits, soFilterOrig, soFilters, syncDocTab, toDoc,
} from './46-smart-filter-panel.js';
import {
  closeInlineText, layersUnder, openCanvasCtx, openInlineTextEditor, openTextEditor,
} from './47-canvas-context-menu.js';
import {
  buildPsdBuffer, endDrag, setExportProgress, setWaitCursor, textBoxHandles, textBoxRaw, textIndexAt,
} from './48-info-export.js';
import {
  addUserFontFile, effTextStyle, ensureTextRaster, removeUserFont, renderTextLayer, resolveFont, textRenderPad,
  userFonts, userFontsReady,
} from './49-fonts-text-model.js';
import {
  compositeNowRGBA, copyPixelsUI, pasteClipboardUI, pixelClipboard, set_pixelClipboard,
} from './50-clipboard-merge-mask.js';
import {
  alphaWriteWhy, applyTextDesc, deleteAlphaChannelUI, docAlphaChannels, docAlphaGray, duplicateAlphaChannelUI,
  effTextDesc, effTextShape, fontPreviewSize, loadAlphaSelection, newAlphaChannelUI, renameAlphaChannelUI,
  saveSelectionDialog, textDescEdits, textDynamicOf, toggleDynamicText, warpEnum,
} from './52-alpha-text-menu.js';
import {
  cloneSrc, csCur, csSetSample, retouchGuard, retouchOpts, retouchState, rtPatternList, rtPending,
  syncCloneSrcPanel, toggleCloneSrcPanel,
} from './53-retouch-clone-pattern.js';
import {
  retouchDown, retouchMove, retouchStrokeMask, retouchUp, rtPatchWithPattern, rtPendingCancel, rtPendingCommit,
  syncRetouchBar,
} from './54-gestures-hints.js';
import { LB } from './57-layer-style-text-path.js';
import { scriptDebugAPI } from './58-scripting.js';



const fileObjectIds = new WeakMap(); let fileObjectSeq = 0;
const fileObjectId = value => { if (!fileObjectIds.has(value)) fileObjectIds.set(value, ++fileObjectSeq); return fileObjectIds.get(value); };
function documentEditSignature() {
  const st = captureState({cloneSparse:false});
  const maps = {};
  for (const key of ['soEdits','soRepl','soInside','layerEdits','layerRenames','layerTextEdits','textStyleEdits','textDescEdits','textCrops','layerTransforms','layerOps','gradState','meshRotState','meshFlipState','maskPaint','pixelPaint','soFilters','soFilterEdits','layerDupes']) maps[key] = st.maps[key];
  const paths = st.docPaths;
  const full = captureDocFull({cloneSparse:false}).full;
  const state = { source: st.origBuffer, width: st.docW, height: st.docH, resolution: st.docResolution,
    history: fileObjectId(histLog.items[histLog.cursor] || histLog), maps, deletes: st.deletes, order: st.layerReorder,
    lazyMask: st.doc?.layers?.map(l => l?.lazyMaskEdits ? l.lazyMaskEdits.version : 0) || null,
    paths: paths && { work: paths.workDirty ? paths.work : null, saved: paths.savedDirty ? paths.saved : null },
    toolData: st.toolData, light: full.globalLightDirty ? full.globalLight : null,
    guides: full.guidesDirty ? full.guides : null, slices: full.slicesDirty ? full.docSlices : null,
  };
  const seen = new WeakSet();
  return JSON.stringify(state, (_key, value) => {
    if (!value || typeof value !== 'object') return value;
    if(value.sparse?.tiles instanceof Map)return {sparsePixels:true,w:value.w,h:value.h,left:value.left,top:value.top,clean:value.clean};
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob || value instanceof HTMLCanvasElement || value instanceof OffscreenCanvas || value instanceof ImageBitmap) return { bufferIdentity: fileObjectId(value) };
    if (value instanceof Map) return [...value.entries()];
    if (value instanceof Set) return [...value];
    if (seen.has(value)) return '[shared]'; seen.add(value); return value;
  });
}
export function saveDocumentWithProgress(){
  const controller=new AbortController();
  setWaitCursor(true,'正在生成保存文件…');
  setExportProgress(0,'正在生成保存文件…');
  const btn=document.getElementById('docLoadingCancel');
  if(btn){btn.hidden=false;btn.textContent='取消保存';btn.onclick=()=>controller.abort(new DOMException('保存已取消','AbortError'));}
  const task={signal:controller.signal,set(value,label){setExportProgress(value,label);},end(){setWaitCursor(false);if(btn){btn.hidden=true;btn.textContent='取消导出';btn.onclick=null;}}};
  return task;
}
installDocumentFiles({
  uid: () => DOCS.activeUid(), name: () => docName, inside: () => docStack.length > 0,
  saveInside, settle: settleForDocSwitch, build: buildPsdBuffer, signature: documentEditSignature, progress:()=>saveDocumentWithProgress(),
  markClean: (uid, signature) => DOCS.markClean(uid, signature),
  rename: (name, uid) => { DOCS.renameDocument(uid, name); if (DOCS.activeUid() === uid) { set_docName(name); set_docLabel(name); syncDocTab(); } },
  original: () => origBuffer,
  reload: async (buf, name) => {
    const previous = captureDocFull();


    try { await initDocument(buf, name, { nested: false, freshDoc: true }); refreshAll(true); }
    catch (e) { applyDocFull(previous); refreshAll(false); throw e; }
  },
  input: () => $('#file'),
  open: async file => { return isImageFileName(file) ? await openImageAsDocument(file) : await loadPsd(file); },
  error: message => { $('#err').textContent = message; shell.status(message); }, status: message => shell.status(message),
});


installAutosave({
  hasDoc: () => !!doc && !docStack.length,
  dirty: () => DOCS.isDirty(),
  busy: () => !!(li || docStack.length || curStroke || auxDrag || deformTool || tfState || textOverlay || cropState),
  uid: () => DOCS.activeUid(), openUids: () => DOCS.buffers().map(b => b.uid),
  editSig: () => { const it = histLog.items[histLog.cursor]; return `${histLog.items.length}:${histLog.cursor}:${it && it.seq}:${countLayerOps()}`; },
  buildBytes: async () => { while (sparsePaintBusy()) await flushSparsePaint(); return (await buildPsdBuffer({ fast: true })).buf; },
  docName: () => docName, docW: () => docW, docH: () => docH,
  openBuffer: (buf, name, msg) => DOCS.openBuffer(buf, name, msg),
  choiceDialog, status: t => shell.status(t), pref: k => PREF.get(k),
});


installTouchGestures({
  el: viewport, hasDoc: () => !!doc,
  zoom: () => zoom, zoomAt: (x, y, z) => zoomAtClient(x, y, z),
  pan: (dx, dy) => { if (!dx && !dy) return; set_panX(panX + dx); set_panY(panY + dy); applyPan(); },
  angle: () => viewAngle, setAngle: a => setViewAngle(a),
  rotateEnabled: () => PREF.get('tools.touchRotate') !== false,
  undo: () => actions.run('edit.undo'), redo: () => actions.run('edit.redo'),
  cancelActive: () => {},
});


actions.setGate(id => (docLoading > 0 && !/^(window|help)\.|^edit\.preferences/.test(id) ? '文档正在载入，请稍候' : ''),
  () => { shell.status('文档正在载入，请稍候再操作'); });


installA11y();


DOCS.init({
  hasDoc: () => !!doc, docName: () => docName, docSize: () => ({ w: docW, h: docH }), inside: () => docStack.length > 0,
  setDocumentUid: uid => { if (doc) doc.editorDocUID = uid; },
  
  dirty: () => !!doc && (docStack.length ? insideDirty() : (hasAnyEdits() || docHistory.undo.length > 0 || brushHistory.undo.length > 0)),
  editSignature: documentEditSignature,
  capture: captureDocFull, apply: st => { applyDocFull(st); }, settle: settleForDocSwitch, resetForNewDoc,
  getView: docViewState, setView: setDocViewState, snapshot: docSnapshotCanvas,
  refresh: () => { refreshAll(false); syncToolButtons(); syncAnts(); syncRulers(); renderProps(); syncHistoryPanel(); updateUndoButtons(); syncDocTab(); try { syncToolOptions(); } catch {} },
  closeEmpty: () => { applyState(emptyState()); resetForNewDoc(); refreshAll(false); syncToolButtons(); syncDocTab(); },
  syncTab: () => syncDocTab(),
  save: () => saveDocumentFile(),
  open: async file => isImageFileName(file) ? openImageAsDocument(file) : loadPsd(file),
  closeEmbedded: options => exitInside(options.discard ? { save: false } : {}),
  loadBuffer: async (buf, name) => { await initDocument(buf, name, { nested: false, freshDoc: true }); refreshAll(true); },
  buildBytes: async (fast = true) => (await buildPsdBuffer({ fast })).buf,
  composite: () => compositeNowRGBA(),
  resolution: () => docResolution,
  psdFromPixels, structural: docStructural,
  decodeImage: decodeImageFile, isImageFile: isImageFileName,
  psdComposite: async ab => { const sd = await parsePsdRaster(ab, { strictChannels: true }); const sf = compositeAll(sd, sd.width, sd.height, new Map()); return { data: sf.data, width: sf.width, height: sf.height }; },
  applyEdits: (...a) => applyEdits(...a), ensureEdit: what => ensureLazy(EDIT, what),
  layerCount: () => doc ? doc.layers.length : 0,
  selectLayers: ids => { selLayers.clear(); const ok = ids.filter(i => i >= 0 && doc && i < doc.layers.length); set_selLayer(ok.length ? ok[ok.length - 1] : selLayer); for (const i of ok) if (i !== selLayer) selLayers.add(i); },
  shiftLayers: (ids, dx, dy) => { if (!dx && !dy) return; const T = transformableLayers(); for (const i of ids) { if (!T.includes(i)) continue; const t = ensureLayerTransform(i); t.x += dx; t.y += dy; transformChanged(i); } },
  layersBBox: ids => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const i of ids) { let b = null; try { b = layerSelBBox(i); } catch {} if (!b || !(b.w > 0)) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); } return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; },
  viewCenterDoc: () => { const vp = $('#viewport'), v = vp.getBoundingClientRect(); try { return toDoc({ clientX: v.left + vp.clientWidth / 2, clientY: v.top + vp.clientHeight / 2 }); } catch { return { x: docW / 2, y: docH / 2 }; } },
  clientToDoc: (x, y) => toDoc({ clientX: x, clientY: y }),
  layerClip: () => layerClip, setLayerClip: (c, kind) => { set_layerClip(c); set_lastClipKind(kind); }, lastClipKind: () => lastClipKind,
  copyLayers: () => copyLayersUI({ quiet: true }),
  copyPixels: () => copyPixelsUI(false), pixelClip: () => pixelClipboard, setPixelClip: c => { set_pixelClipboard(c); },
  pastePixels: mode => pasteClipboardUI(mode),
  selectedLayer: () => selLayer, layerName: i => (layerRenames[i] || (layerTree && layerTree.flat[i] || {}).name || '图层'),
  hasLayer: () => !!doc && !li && selLayer >= 0,
  duplicateHere: name => { const i = duplicateLayerUI(selLayer, { defer: true }); if (i < 0) return false;
    const N = doc.layers.length - layerDupes.length;
    if (name && layerDupes[i - N]) { layerDupes[i - N].name = name; if (layerTree.flat[i]) layerTree.flat[i].name = name; renderLayerPanel(); }
    scheduleDupMaterialize(); return true; },
  renameLayer: (i, name) => { if (i >= 0 && name) { layerRenames[i] = name; renderLayerPanel(); } },
  
  freezeClip: async c => {
    const src = c.ids.map((i, k) => c.buf === origBuffer ? i : indexOfLayerId(c.lyids[k]));
    if (src.some(i => i < 0)) { c.frozen = true; return; }
    if (!hasAnyEdits()) { c.buf = origBuffer; c.ids = src; c.frozen = true; return; }
    const map = src.map(builtIndexOf);
    const b = await buildPsdBuffer({ fast: true });
    c.buf = b.buf; c.ids = map; c.frozen = true;
  },
  moveDragging: () => !!(moveDrag && !moveDrag.tf && docTool === 'move'), cancelMoveDrag: () => cancelMoveDrag(),
  tool: () => docTool, selectTool: id => tools.select(id), spaceDown: () => spaceDown,
  zoomStep: dir => nextZoomStep(dir),
  status: m => shell.status(m), notice: m => { $('#notice').textContent = m; }, err: m => { $('#err').textContent = m; },
});


window.__psd_editor = {
  scripts: scriptDebugAPI(),
  
  gpu: { status: () => gpuStatus(), active: () => gpuActive(), frame: () => gpuFrame(), flush: gpuFlush, snapshot: gpuSnapshotCanvas, get G(){ return GPUV; } },
  decode: { status: decodeCacheStatus, tile: decodeLazyTile, tiles: decodeLazyTiles },
  get propsPS(){ return PP; }, get adjPanel(){ return ADJP; },   
  
  get sfx(){ return SFX; }, get lx(){ return LX; },
  
  prefs: {
    get P(){ return PREF; },
    get hist(){ return { log: histLog.items.length, cursor: histLog.cursor, doc: docHistory.undo.length, brush: brushHistory.undo.length, cap: histCap() }; },
    get view(){ return { artboardGuidesOn, countVisible, notesVisible, editPinsOn, brushPreviewOn, viewPar, viewParCorrect, gridOpts: { ...gridOpts }, rulerUnit, guides: guides.map(g => ({ ...g })) }; },
    run: (id, ...a) => actions.run(id, ...a),
  },
  docs: DOCS, selectTool: id => tools.select(id),
  get hx(){ return HXP; }, get notes(){ return NOTESP; }, hxCapture, hxApplyCtx,   
  get actionsPanel(){ return ACTP; }, compositeRGBA: () => sampleRGBA(true), historyEntries: () => ({ items: historyEntries(), cursor: histLog.cursor }),
  colorMgmt: CM, actions, get lastAction(){return LAST_RUN;},
  get LX(){ return LX; },                          
  get LP(){ return LP; }, get CHP(){ return CHP; },   
  get LB(){ return LB; },                          
  getMeasureLine: () => measureLine, setMeasureLine: m => { set_measureLine(m); drawGizmo(); syncAuxBar(); },
  selectLayers(list){ set_selLayer(list[list.length - 1]); selLayers.clear(); if (list.length > 1) for (const i of list) selLayers.add(i); renderLayerPanel(); renderProps(); drawGizmo(); },
  loadPsd, buildPsdBuffer, openInside, exitInside, selectSO, doSelectSO, exitSO, replaceImg, bakeCurrentSO, hasAnyEdits, initDocument, refreshAll, renderLayerPanel, renderPreviewOnly, fitStage, viewScratch,
  get state(){ return { doc, sos, cur, docW, docH, li, soLayerIndex, origBuffer, soEdits, soRepl, soBaked, soInside, layerTree, layerTextEdits, layerEdits, layerOps, docStack, selLayer, docUndo: docHistory.undo.length, docRedo: docHistory.redo.length,
    brushUndo: brushHistory.undo.length, brushRedo: brushHistory.redo.length, selection,
    globalLight: { ...globalLight }, globalLightDirty }; },
  get layerOps(){ return layerOps; },
  
  fonts: { list: () => userFonts.map(f => ({ ...f })), addFile: addUserFontFile, remove: removeUserFont, resolve: resolveFont, ready: () => userFontsReady },
  get layerCanvasCache(){ return layerCanvasCache; },
  get thumbCache(){ return thumbCache; },
  get gradState(){ return gradState; },
  
  brushOps: {
    get tools(){ return [...BRUSHOP_TOOLS]; },
    get opts(){ return { ...boOpts }; },
    setOpts(o){ Object.assign(boOpts, o); if (o.align === false) set_boOffset(null); syncBrushOpBar(); return { ...boOpts }; },
    why: brushOpWhy,
    get sample(){ return boSample && { ...boSample }; },
    setSample(x, y){ return brushOpSample({ x, y }); },
    get offset(){ return boOffset && { ...boOffset }; },
    patterns: () => rtPatternList(),
    patternImage(){ const p = boPatternImage(); return p && { width: p.width, height: p.height }; },
    
    stroke(pts, o = {}){
      if (!pts || !pts.length) return false;
      const ev = { pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt, clientX: pts[0][0], clientY: pts[0][1] };
      const S = docTool === 'pencil' ? beginPencilStroke({ x: pts[0][0], y: pts[0][1] }) : BRUSHOP_TOOLS.has(docTool) ? beginBrushOpStroke({ x: pts[0][0], y: pts[0][1] }, ev) : beginStroke({ x: pts[0][0], y: pts[0][1] });
      if (!S) return false;
      for (let i = 1; i < pts.length; i++) strokeTo(S, { x: pts[i][0], y: pts[i][1] });
      S.forced = true;
      const done = endStroke();

      return done && typeof done.then === 'function' ? done.then(() => true) : true;
    },
    magicErase: (x, y, o = {}) => magicEraseAt({ x, y }, { shiftKey: !!o.shift }),
    get bar(){ const id = i => { const el = $(i); return el ? { hidden: !!el.hidden, value: el.value, checked: el.checked } : null; };
      return { group: !$('#grpBrushOps').hidden, sample: id('#boSampleWrap'), align: id('#boAlignWrap'), pattern: id('#boPatternWrap'),
        tol: id('#boTolWrap'), protect: id('#boProtectWrap'), mode: id('#boModeWrap'), strength: id('#boStrengthWrap'),
        range: id('#boRangeWrap'), exposure: id('#boExposureWrap'), vibrance: id('#boVibranceWrap'),
        info: $('#boInfo') ? $('#boInfo').textContent : null, infoTitle: $('#boInfo') ? $('#boInfo').title : null,
        modeOpts: $('#boMode') ? [...$('#boMode').options].map(o2 => o2.value) : null }; },
  },
  
  brushEngine: {
    get brush(){ return brush; }, get toolModes(){ return toolModes; }, get eraserOpts(){ return eraserOpts; }, get pencilOpts(){ return pencilOpts; },
    get crOpts(){ return crOpts; }, get bgeOpts(){ return bgeOpts; }, get meOpts(){ return meOpts; }, get adjBrushOpts(){ return adjBrushOpts; },
    get mixerOpts(){ return mixerOpts; }, get artHistoryOpts(){ return artHistoryOpts; },
    setSymmetry(sym){ brush.symmetry = sym ? { cx: docW / 2, cy: docH / 2, angle: 0, segments: 5, gap: Math.round(docW / 4), radius: Math.round(Math.min(docW, docH) / 4), ...sym } : null; set_symmetryOn(!!sym); syncBrushControls(); drawGizmo(); },
    preset(id){ const p = BRUSH_PRESETS.find(x => x.id === id); if (p) applyBrushPreset(p); return !!p; },
    sync(){ syncToolOptions(); },
    pixel(x, y){ return layerPixelAt({ x, y }); },
    get layers(){ return (layerTree && layerTree.flat || []).map((l, i) => ({ i, name: layerRenames[i] || l.unicodeName || l.name, adj: l.adjustment ? String(l.adjustment.key).trim() : null, mask: !!(doc.layers[i] && doc.layers[i].mask) })); },
    get selLayer(){ return selLayer; },
    maskAt(x, y){ const mp = maskPaint[selLayer] || null; if (!mp) return null; const X = Math.floor(x - mp.docLeft), Y = Math.floor(y - mp.docTop); return mp.gray[Y * mp.w + X]; },
    bsRender(){ renderBrushSettings(); },
    
    applyRecord(rec, id){ applyBrushRecord(rec, id); }, currentRecord(){ return currentBrushRecord(); },
    captureToolPreset(t){ return captureToolPreset(t || docTool); }, applyToolPreset(p){ return applyToolPresetRecord(p); },
    get mixerTile(){ return mixerTile; }, loadMixer(x, y){ return loadMixerBrush(x == null ? null : { x, y }); },
    get symEdit(){ return !!symEdit; }, startSymEdit(){ startSymEdit(); }, endSymEdit(c){ endSymEdit(c !== false); },
    defineBrushSource(){ return defineBrushSource(); },
  },
  
  frame: {
    get opts(){ return { ...frameOpts }; },
    setOpts(o){ Object.assign(frameOpts, o); syncFrameBar(); return true; },
    why: frameWhy,
    down: (x, y, o = {}) => frameDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    move: (x, y, o = {}) => frameMove({ shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    up: () => frameUp(),
    below: i => frameBelow(i == null ? selLayer : i),
    at: (x, y) => frameAt({ x, y }),
    placeImage: (fi, file) => placeImageInFrame(fi, file),
    put: () => putIntoFrameUI(),
    take: () => takeOutOfFrameUI(),
    get info(){ const el = $('#frInfo'); return el ? el.textContent : null; },
    get infoTitle(){ const el = $('#frInfo'); return el ? el.title : null; },
    sync(){ syncFrameBar(); return true; },
    get buttons(){ const o = {}; for (const id of ['frPut', 'frTake']) { const el = $('#' + id); o[id] = el ? { disabled: !!el.disabled, title: el.title } : null; } return o; },
  },
  
  artboards: {
    get list(){ return docArtboards().map(a => ({ index: a.index, key: a.key, name: a.name, presetName: a.presetName,
      rect: { ...a.rect }, color: a.color.slice(), bgType: a.bgType })); },
    get sel(){ return abSel; },
    why: artboardWriteWhy,
    members: i => artboardMembers(i),
    down: (x, y) => artboardDown({ pointerId: 1 }, { x, y }),
    move: (x, y, mods) => artboardMove({ x, y }, mods),      
    up: () => artboardUp(),
    grabHandle(h, x, y){ const a = docArtboards()[abSel]; if (!a) return false;
      set_abState({ kind: 'resize', handle: h, base: { ...a.rect }, from: { x, y }, cur: { ...a.rect } }); return true; },
    create: rect => createArtboard(rect),
    fromGroup: () => makeArtboardFromGroupUI(),
    unmake: () => unmakeArtboardUI(),
    setPreset(k){ abOpts.preset = k; const p = AB_PRESETS.find(q => q[0] === k); if (p && p[2]) { abOpts.w = p[2]; abOpts.h = p[3]; } syncArtboardBar(); return abOpts.preset; },
    get presets(){ return AB_PRESETS.map(p => p[0]); },
    get opts(){ return { ...abOpts, color: abOpts.color.slice() }; },
    setOpt(k, v){ if (k in abOpts) abOpts[k] = v; syncArtboardBar(); drawGizmo(); return abOpts[k]; },
    addBeside: side => addArtboardBeside(side),
    plusSpots: () => abPlusSpots().map(s => ({ ...s })),
    setBackground: (bgType, color) => abApplyToSelected({ bgType, color: color || abOpts.color }),
    resizeSelected: (w, h) => abApplyToSelected({ w, h }),
    autoNest: ids => artboardAutoNest(ids),
    get info(){ const el = $('#abInfo'); return el ? el.textContent : null; },
    get buttons(){ const o = {}; for (const id of ['abPreset', 'abW', 'abH', 'abBg', 'abAdd', 'abGear']) { const el = $('#' + id); o[id] = el ? { disabled: !!el.disabled, value: el.value } : null; } return o; },
  },
  
  slices: {
    get model(){ return docSlices && { version: docSlices.version, readOnly: !!docSlices.readOnly, count: docSlices.slices.length }; },
    get user(){ return userSlices().map(s => ({ id: s.id, name: s.name, url: s.url, target: s.target, message: s.message, altTag: s.altTag,
      rect: sliceRect(s), origin: s.origin, type: s.type })); },
    get auto(){ return autoSlices(); },
    get all(){ return allSlices(); },
    get sel(){ return sliceSel; },
    get dirty(){ return slicesDirty; },
    why: sliceWriteWhy,
    down: (x, y) => sliceDown({ pointerId: 1 }, { x, y }),
    selectDown: (x, y) => sliceSelectDown({ pointerId: 1 }, { x, y }),
    move: (x, y) => sliceMove({ x, y }),
    up: () => sliceUp(),
    grabHandle(h, x, y){ if (sliceSel < 0) return false; set_sliceDrag({ kind: 'resize', handle: h, base: sliceRect(userSlices()[sliceSel]), from: { x, y } }); return true; },
    del: () => deleteSliceUI(),
    promote: () => promoteSliceUI(),
    fromGuides: () => slicesFromGuidesUI(),
    divide: () => divideSliceUI(),
    options: () => sliceOptionsUI(),
    get info(){ const el = $('#slInfo'); return el ? el.textContent : null; },
    get buttons(){ const o = {}; for (const id of ['slFromGuides', 'slPromote', 'slDivide', 'slOptions', 'slDelete']) {
      const el = $('#' + id); o[id] = el ? { disabled: !!el.disabled, title: el.title } : null; } return o; },
  },
  
  pcrop: {
    down: (x, y) => pcropDown({ pointerId: 1 }, { x, y }),
    move: (x, y) => pcropMove({ x, y }),
    up: () => pcropUp(),
    corner: (i, x, y) => { if (!pcropState || !pcropState.pts) return false; pcropState.drag = i; pcropMove({ x, y }); pcropState.drag = null; return true; },
    get opts(){ return { ...pcropOpts }; }, setOpts(o){ Object.assign(pcropOpts, o); if (pcropState && pcropState.pts) { pcropState.sizeLocked = false; pcropSyncOut(); } syncPCropBar(); return { ...pcropOpts }; },
    commit: () => commitPCrop(),
    cancel: () => cancelPCrop(),
    setSize: (w, h) => { if (!pcropState || !pcropState.pts) return false; pcropState.out = { w, h }; pcropState.sizeLocked = true; syncPCropBar(); return true; },
    get state(){ return pcropState && { pts: pcropState.pts && pcropState.pts.map(p => p.slice()), out: { ...pcropState.out }, drag: pcropState.drag, sizeLocked: !!pcropState.sizeLocked }; },
    get info(){ const el = $('#pcInfo'); return el ? el.textContent : null; },
    convex: () => !!(pcropState && pcropState.pts && pcropConvex(pcropState.pts)),
  },
  auxiliary: { get data(){return copyToolData();}, get measure(){return measureLine;}, get angle(){return viewAngle;}, clientToDoc:toDoc, setAngle:setViewAngle, down:auxDown, move:auxMove, up:auxUp, captureSource:captureHistorySource, selectSource:selectHistorySource, rulerMetrics, straighten:straightenFromRuler, editCountGroup, get samplerOpts(){return samplerOpts;}, get mixerOpts(){return mixerOpts;}, loadMixer:loadMixerBrush, cleanMixer:cleanMixerBrush, get source(){return historySource;}, startTextMask, sync:syncAuxBar },
  renderProps, layerParams, attrGuards, findLayerOp, countLayerOps, allLayerOps, previewCompositeDoc: () => previewCompositeDoc(doc),
  effectiveLayerMaskForBake, multiplyBakeMask,
  recomposeLayer, addAdjustmentLayer, paintStates,
  
  adjLayerTarget, dedicatedAdjBlocks, renderAdjustCtl, get adjCtlState(){ return adjCtlState; },
  

  curve: {
    ctx(){ return curveCtxNow(); },
    pts(){ const c = curveCtxNow(); return c ? curvePtsOf(c.t, c.st) : []; },
    sel(){ return Math.max(0, adjCtlState.curvePt || 0); },
    select(k){ if (!curveCtxNow()) return -1; adjCtlState.curvePt = Math.max(0, k | 0); renderAdjustCtl($('#adjCtl'), adjCtlState.idx); return adjCtlState.curvePt; },
    read(){ const c = curveCtxNow(); return c ? { input: readCurvePoint(c.idx, c.t, c.st, 'input'), output: readCurvePoint(c.idx, c.t, c.st, 'output') } : null; },
    lut(){ const c = curveCtxNow(); return c ? Array.from(curveLUT(curvePtsOf(c.t, c.st))) : []; },
    lutOf(pts){ return Array.from(curveLUT(pts)); },
    addPoint(input, output){
      const c = curveCtxNow(); if (!c) return false;
      const list = curvePtsOf(c.t, c.st);
      if (list.length >= 19) return false;
      const at = { input: Math.max(0, Math.min(255, Math.round(input))), output: Math.max(0, Math.min(255, Math.round(output))) };
      const next = list.concat([at]).sort((a, b) => a.input - b.input);
      adjCtlState.curvePt = next.findIndex(p => p.input === at.input);
      return commitCurveList(c.idx, c.t, c.st, next, () => { renderAdjustCtl($('#adjCtl'), c.idx); renderPreviewOnly(); });
    },
    removePoint(k){
      const c = curveCtxNow(); if (!c) return false;
      const list = curvePtsOf(c.t, c.st);
      if (list.length <= 2) return false;
      if (!(k > 0 && k < list.length - 1)) return false;     
      const next = list.filter((_, i) => i !== k);
      adjCtlState.curvePt = Math.max(0, Math.min(next.length - 1, k - 1));
      return commitCurveList(c.idx, c.t, c.st, next, () => { renderAdjustCtl($('#adjCtl'), c.idx); renderPreviewOnly(); });
    },
    end(side, input){
      const c = curveCtxNow(); if (!c) return false;
      setCurveEnd(c.idx, c.t, c.st, side === 'white' ? 'white' : 'black', input);
      renderAdjustCtl($('#adjCtl'), c.idx);
      return true;
    },
    move(k, input, output){
      const c = curveCtxNow(); if (!c) return false;
      moveCurvePoint(c.idx, c.t, c.st, k | 0, input, output);
      renderAdjustCtl($('#adjCtl'), c.idx);
      return this.readPoint(k | 0);
    },
    readPoint(i){ const p = (curveCtxNow() ? this.pts() : [])[i]; return p ? { input: p.input, output: p.output } : null; },
  },
  get docHistLock(){ return docHistLock; },   
  openImageAsDocument,                        
  
  sel: {
    get current(){ return selection; },
    set(s){ return setSelection(s); },
    rect(x, y, w, h, mode = 'replace', o){ return combineInto(rectSelection(docW, docH, x, y, w, h, o || selOpts()), mode); },
    ellipse(x, y, w, h, mode = 'replace', o){ return combineInto(ellipseSelection(docW, docH, x, y, w, h, o || selOpts()), mode); },
    lasso(pts, mode = 'replace', o){ return combineInto(lassoSelection(docW, docH, pts, o || selOpts()), mode); },
    wand(x, y, mode = 'replace'){ return doWand({ x, y }, mode); },
    all: selectAll, none: deselect, invert: invertSel, feather: featherSel, expand: expandSel, contract: contractSel,
    path: selPath, bounds: () => selection ? selectionBounds(selection) : null,
    valueAt: (x, y) => selection ? selectionValueAt(selection, x, y) : 0,
    area: () => selection ? selectionArea(selection) : 0,
    get mode(){ return selMode; }, setMode: setSelMode,
    
    beginDrag: (x, y, o = {}) => beginSelDrag({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    moveDrag: (x, y, o = {}) => moveSelDrag({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    endDrag: () => endSelDrag(),
    get drag(){ return selDrag && { ...selDrag }; },
    get antsRunning(){ return antsRAF !== 0; }, syncAnts,
    toMask: maskFromSelection,
    
    polyDown: (x, y, o = {}) => polyLassoDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    polyClose: () => closePolyLasso(), polyCancel: () => cancelPolyLasso(),
    get poly(){ return polyLasso && { pts: polyLasso.pts.map(p => ({ ...p })), mode: polyLasso.mode }; },
    magDown: (x, y, o = {}) => magLassoDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    magMove: (x, y) => magLassoMove({ x, y }),
    magClose: () => closeMagLasso(), magCancel: () => cancelMagLasso(), magBack: () => magUndoAnchor(),
    magEnd: () => closeMagLasso(),                       
    get mag(){ return magLasso && { path: magLasso.path.map(p => ({ ...p })), anchors: magLasso.anchors.map(p => ({ ...p })), preview: (magLasso.preview || []).map(p => ({ ...p })), mode: magLasso.mode, edges: !!magLasso.cost }; },
    get magOpts(){ return { ...magOpts }; },
    
    get qsOpts(){ return { ...qsOpts }; },
    setQsOpts(o){ Object.assign(qsOpts, o); set_qsEdgeCache(null); syncQuickSelBar(); return true; },
    get osOpts(){ return { ...osOpts }; },
    setOsOpts(o){ Object.assign(osOpts, o); syncQuickSelBar(); return true; },
    quickDown: (x, y, o = {}) => quickSelDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    quickMove: (x, y) => quickSelMove({ x, y }),
    quickUp: () => endQuickSel(),
    get quick(){ return qsState && { seeds: qsState.mask.reduce((a, v) => a + (v ? 1 : 0), 0), mode: qsState.mode, edges: !!qsState.edges }; },
    objDown: (x, y, o = {}) => objSelDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    objMove: (x, y) => objSelMove({ x, y }),
    objUp: () => endObjSel(),
    get obj(){ return osState && { start: { ...osState.start }, cur: { ...osState.cur }, pts: osState.pts.length, mode: osState.mode }; },
    setMagOpts(o){ Object.assign(magOpts, o); syncMagBar(); },
    
    sbDown: (x, y, o = {}) => selBrushDown({ pointerId: 1, altKey: !!o.alt, shiftKey: !!o.shift }, { x, y }),
    sbMove: (x, y) => selBrushMove({}, { x, y }), sbUp: () => endSelBrush(),
    get sbOpts(){ return { ...sbOpts }; }, setSbOpts(o){ Object.assign(sbOpts, o); set_selOverlay(null); syncSelBrushBar(); drawGizmo(); },
    get mqOpts(){ return { ...mqOpts }; }, setMqOpts(o){ Object.assign(mqOpts, o); syncSelBar(); },
    get wandOpts(){ return { ...wandOpts }; }, setWandOpts(o){ Object.assign(wandOpts, o); syncSelBar(); },
    get finder(){ return osFound && { objects: osFound.objects.map(o => ({ ...o })), hover: osHover }; },
    findObjectsNow(){ objFinderReset(); const s = qsSample(osOpts.sampleAll); if (!s) return null; set_osFound(SELM.findObjects(s.px, docW, docH, { method: osOpts.method }));
      osFound.doc = doc; osFound.w = docW; osFound.h = docH; return osFound.objects.length; },
    makeWorkPath: makeWorkPathFromSelectionUI,
    get snap(){ return { on: snapOn, to: { ...snapTo }, lines: snapLines.map(l => ({ ...l })) }; },
    setSnap(on){ set_snapOn(!!on); },
  },
  
  paint: {
    flush:flushSparsePaint,
    begin: beginStroke, to: (x, y) => curStroke && strokeTo(curStroke, { x, y }), end: endStroke,
    stroke(points, opts = {}){                       
      if (!points || !points.length) return null;
      const S = beginStroke(points[0], opts);
      if (!S) return null;
      for (let i = 1; i < points.length; i++) strokeTo(S, points[i]);
      const r = endStroke();
      if(r?.then)return r.then(rect=>{repaintStrokeLayer(S);return rect;});
      repaintStrokeLayer(S);return r;
    },
    undo: brushUndo, redo: brushRedo, guard: paintGuard,
    get history(){ return brushHistory; },
    get maskPaint(){ return maskPaint; },
    get pixelPaint(){ return pixelPaint; },
    get options(){ return brush; },
    setTarget(t){ $('#brTarget').value = t; syncBrushPanel(); },
    get cursor(){ return brushCursor && { ...brushCursor }; },
    setCursor: (x, y) => setBrushCursor({ x, y }),
    clearCursor: clearBrushCursor,
    setColors(fg, bg){ if (fg) set_fgRGB(fg.slice()); if (bg) set_bgRGB(bg.slice()); syncBrushSwatches(); syncGradBar(); syncBucketBar(); },
    getColors: () => ({ fg: (fgRGB || [0, 0, 0]).slice(), bg: (bgRGB || [255, 255, 255]).slice() }),
    swapColors, resetColors,
  },
  
  adjust: {
    types: adjTypes,
    labels: () => Object.fromEntries(adjTypes().map(t => [t, adjLabel(t)])),
    guard: adjustGuard,
    open: openAdjustDialog,          
    openLazy: openAdjustLazy,        
    get state(){ return adjState && { idx: adjState.idx, type: adjState.type, model: adjState.model, on: adjState.on,
                                      proxy: adjState.proxy && { pw: adjState.proxy.pw, ph: adjState.proxy.ph, k: adjState.proxy.k } }; },
    set(path, v){ if (adjState) { adjState.model[path] = v; renderAdjustDialog(); } },
    render: adjRender,
    ok(){ return $('#adjOk').onclick(); },
    cancel(){ return $('#adjCancel').onclick(); },
    
    apply(type, model){
      if (!openAdjustDialog(type)) return false;
      if (model) Object.assign(adjState.model, model);
      renderAdjustDialog();
      $('#adjOk').onclick();
      return true;
    },
  },
    
  path: {
    guard: pathGuard,
    read: readVectorPath, stroke: readVectorStroke, effStroke,
    get nodes(){ return pathNodes; },
    anchors: () => pathNodes.filter(n => n.which === 'anchor'),
    working: () => pathWorking(selLayer),
    
    drag(nodeIndex, to, opts = {}){
      const nd = pathNodes[nodeIndex]; if (!nd) return false;
      const evd = { pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt };
      if (!beginPathDrag(evd, { x: nd.x, y: nd.y }, nodeIndex)) return false;
      movePathDrag(evd, to);
      endPathDrag();
      return true;
    },
    setSubpathOperation, commit: commitPathEdit,
    
    toolDown: (x, y, o = {}) => pathToolDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt }, { x, y }),
    get selSubs(){ return [...pathSelSubs]; },
    dragSub(from, to, o = {}){
      const evd = { pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt };
      if (!pathToolDown(evd, from)) return false;
      movePathSubDrag(evd, to);
      endPathSubDrag();
      return true;
    },
    deleteSubs: deleteSelectedSubpaths,
    nearestSegment: pt => pathNearestSegment(pathWorking(selLayer), pt),
  },
  
  filters: {
    soIndexOf: filterSoIndexOf,
    load: loadFilterList,
    get cache(){ return soFilters; },
    get edits(){ return soFilterEdits; },
    payload: filterEditsPayload,
    set(soIdx, fIndex, mut){ return editFilter(soIdx, fIndex, mut); },
    settle: () => filterPending,             
    orig: soIdx => soFilterOrig[soIdx],
  },
  
  layers: {
    view: () => layerOrderView(),
    render: () => renderLayerPanel(),
    row: (index) => rowEls[index] || null,
    move: (from, to, after = false) => moveLayerTo(from, to, after),
    step: (index, dir) => moveLayer(index, dir),
    tf: i => getTransformValues(i),
    nudge: (dx, dy) => { nudgeLayer(dx, dy); endLayerEdit(); },
  },
  
  transform: {
    begin: beginFreeTransform, commit: commitFreeTransform, cancel: cancelFreeTransform, again: transformAgain,
    eligible: tfEligible,
    get state(){ return tfState && { idx: tfState.idx, kind: tfState.kind, ref: tfState.ref, affine: tfState.affine,
                                     num: { ...tfState.num }, base: tfState.base.map(p => p.slice()), pushed: tfState.pushed }; },
    get last(){ return tfLast; },
    get bar(){ const g = id => { const el = $(id); return el ? el.value : null; };
               return { x: g('#tfX'), y: g('#tfY'), w: g('#tfW'), h: g('#tfH'), rot: g('#tfRot'), skewH: g('#tfSkewH'), skewV: g('#tfSkewV'),
                        mode: $('#tfMode').textContent, why: $('#tfWhy').textContent, hidden: $('#grpTransform').hidden }; },
    setRef(k){ if (!tfState) return false; tfState.ref = k; tfNumFromQuad(); tfSyncBar(); drawGizmo(); return true; },
    
    setField(id, v){ const el = $(id); if (!el) return false; el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    quad: idx => tfFrame(getTransformValues(idx == null ? selLayer : idx)).corners,
    raw: idx => layerTransforms[idx == null ? selLayer : idx],
    
    drag(handle, to, opts = {}){
      if (!tfState) return false;
      const f = tfFrame(tfCurValues());
      const from = handle === 'rotate' ? { x: f.corners[0][0] - 10, y: f.corners[0][1] - 10 }
                 : handle >= 0 ? { x: f.handles[handle][0], y: f.handles[handle][1] } : { x: f.cx, y: f.cy };
      const ev = { pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt, metaKey: !!opts.mod, ctrlKey: !!opts.mod };
      beginTfDrag(ev, from);
      if (!moveDrag) return false;
      const mode = moveDrag.mode;
      moveTfDrag(ev, to);
      endTfDrag();
      return mode;
    },
  },
  
  docSize: {
    newDocument, resizeCanvas, resizeImage,
    openNew: openNewDialog, openImageSize: openImageSizeDialog, openCanvasSize: openCanvasSizeDialog,
    get info(){ return { w: docW, h: docH, base: docSizeBase, resolution: docResolution, resolutionBase: docResolutionBase }; },
    setAnchor(k){ set_csAnchorSel(k); },
  },
  
  crop: {
    begin: beginCrop, commit: commitCrop, cancel: cancelCrop,
    

    get state(){ return cropState && { rect: { ...cropState.rect }, off: { ...cropState.off }, angle: cropState.angle, ratio: cropState.ratio, del: cropState.del, overlay: cropState.overlay }; },
    quad: () => cropState && cropQuad(),
    get opts(){ return { ...cropOpts }; },
    setOpts(o){ Object.assign(cropOpts, o); saveCropOpts(); syncCropBar(); drawGizmo(); return { ...cropOpts }; },
    preset: v => { cropApplyPreset(v); return { ...cropOpts }; },
    swap: () => cropSwapOrientation(), reset: () => cropResetBox(),
    cycleOverlay: () => { cropCycleOverlay(); return cropOpts.overlay; },
    target: () => cropTargetPx(),
    

    get pad(){ return cropPad && { ...cropPad }; },
    get view(){ return { w: viewW(), h: viewH(), padL: padL(), padT: padT() }; },
    setRect(r){ if (!cropState) return false; Object.assign(cropState.rect, r); syncCropBar(); drawGizmo(); return true; },
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    get bar(){ const g = id => { const el = $(id); return el && (el.type === 'checkbox' ? el.checked : el.value); };
               return { w: g('#cropW'), h: g('#cropH'), angle: g('#cropAngle'), ratio: g('#cropRatio'), del: g('#cropDelete'),
                        info: $('#cropInfo').textContent, hidden: $('#grpCrop').hidden }; },
    drag(handle, to, opts = {}){
      if (!cropState) return false;
      const q = cropQuad();
      const hs = [q[0], mid(q[0], q[1]), q[1], mid(q[1], q[2]), q[2], mid(q[2], q[3]), q[3], mid(q[3], q[0])];
      const from = handle === 'rotate' ? { x: q[0][0] - 12, y: q[0][1] - 12 }
                 : handle >= 0 ? { x: hs[handle][0], y: hs[handle][1] }
                 : { x: (q[0][0] + q[2][0]) / 2, y: (q[0][1] + q[2][1]) / 2 };
      const ev = { pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt, ctrlKey: !!opts.mod, metaKey: false };
      beginCropDrag(ev, opts.from || from);
      const mode = cropState.drag && cropState.drag.mode;
      moveCropDrag(ev, to);
      endCropDrag();
      return mode;
    },
  },
  get lastPaintPt(){ return lastPaintPt && { ...lastPaintPt }; },
  strokeLineTo: (x, y) => strokeLineTo({ x, y }),
  

  down(x, y, o = {}){ canvasPointerDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt,
    metaKey: !!o.mod, ctrlKey: !!o.mod, clientX: x, clientY: y }, { x, y }); return true; },
  moveTo(x, y, o = {}){ const ev = { pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt, clientX: x, clientY: y };
    if (pquadDrag) { pquadDrag.x1 = x; pquadDrag.y1 = y; pquadDrag.snap = pquadSnapRect(pquadDrag); drawGizmo(); }
    else if (pquadMove) {                            
      const d = li && li.deform;
      if (d) {
        const dx = x - pquadMove.from.x, dy = y - pquadMove.from.y;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) pquadMove.moved = true;
        (d.quadIdx[pquadMove.qi] || []).forEach((k, n) => {
          d.vertices[k] = { x: pquadMove.base[n].x + dx, y: pquadMove.base[n].y + dy };
          d.warped[k] = { x: pquadMove.baseW[n].x + dx, y: pquadMove.baseW[n].y + dy };
        });
        delete d.grid; commit();
      }
      drawGizmo();
    }
    else if (auxDrag) auxMove(ev, {x,y});
    else if (moveDrag) moveMoveDrag(ev, { x, y });
    else if (selDrag) moveSelDrag(ev, { x, y });
    else if (curStroke) { strokeTo(curStroke, { x, y }); scheduleStrokeRepaint(curStroke); }
    else if (gradDrag || liveGradEdit) moveGradDrag(ev, { x, y });
    else if (shapeState) moveShapeDrag(ev, { x, y });
    else if (penState) movePen(ev, { x, y });
    else if (cropState && cropState.drag) moveCropDrag(ev, { x, y });
    return true; },
  up(){ endDrag(); return true; },
  
  paths: {
    rows: pathPanelRows,
    saved: docSavedPaths,
    get panelRows(){ const el = $('#pathList'); return el ? [...el.children].map(r => ({
      name: r.querySelector('.cname') ? r.querySelector('.cname').textContent : r.textContent,
      tag: r.querySelector('.ckey') ? r.querySelector('.ckey').textContent : '',
      thumb: !!r.querySelector('.cthumb canvas'),
      cur: r.classList.contains('cur'),
    })) : null; },
    clickRow(i){ const el = $('#pathList'); if (!el || !el.children[i]) return false; el.children[i].click(); return true; },
    sync(){ try { psPanels.refreshPaths(layerTree); } catch {} return true; },
  },
  
  fillLayer: {
    open: openNewFillDialog, commit: commitNewFillLayer,
    cancel: () => $('#fillCancel').onclick(),
    patterns: docPatterns,
    get state(){ return fillDlgState && JSON.parse(JSON.stringify(fillDlgState)); },
    set(patch){ if (!fillDlgState) return false; Object.assign(fillDlgState, patch); renderNewFillDialog(); return true; },
    setGrad(patch){ if (!fillDlgState) return false; Object.assign(fillDlgState.grad, patch); renderNewFillDialog(); return true; },
    get dlg(){ return { open: !!$('#fillDlg').open, title: $('#fillTitle').textContent, rows: $('#fillBody').children.length }; },
  },
  
  channels: {
    get view(){ return { single: chanView.single, off: [...chanView.off], supported: chanSupported(), count: chanCount() }; },
    
    filterPixels(arr){ const d = Uint8ClampedArray.from(arr); const changed = channelViewPixels(d); return { changed, data: [...d] }; },
    set: setChannelView,
    loadSelection: loadChannelSelection,
    sync: syncChannelPanel,
    
    get alphas(){ return docAlphaChannels().map(c => ({ at: c.at, index: c.index, name: c.name })); },
    gray: at => { const g = docAlphaGray(at); return g ? [...g] : null; },
    why: alphaWriteWhy,
    saveSel: saveSelectionDialog,
    newAlpha: newAlphaChannelUI,
    dupAlpha: duplicateAlphaChannelUI,
    delAlpha: deleteAlphaChannelUI,
    renameAlpha: renameAlphaChannelUI,
    loadAlpha: loadAlphaSelection,
    get alphaRows(){ const el = $('#chanList'); return el ? [...el.children].filter(r => r.classList.contains('chan-alpha'))
      .map(r => ({ name: r.querySelector('.cname').textContent, thumb: !!r.querySelector('.cthumb canvas') })) : null; },
    menu(){ try { return (panels.panelMenuItems('channels') || []).map(x => ({ label: x.label, disabled: !!x.disabled, sep: !!x.sep })); } catch { return null; } },
    get rows(){ const el = $('#chanList'); return el ? [...el.children].map(r => ({
      name: r.querySelector('.cname') ? r.querySelector('.cname').textContent : r.textContent,
      key: r.querySelector('.ckey') ? r.querySelector('.ckey').textContent : '',
      eyeOff: !!(r.querySelector('.eye') && r.querySelector('.eye').classList.contains('off')),
      cur: r.classList.contains('cur'),
      thumb: !!r.querySelector('.cthumb canvas'),
    })) : null; },
    clickRow(i){ const el = $('#chanList'); if (!el || !el.children[i]) return false; el.children[i].click(); return true; },
    clickEye(i){ const el = $('#chanList'); const e = el && el.children[i] && el.children[i].querySelector('.eye');
      if (!e) return false; e.click(); return true; },
  },
  
  history: {
    get entries(){ return historyEntries(); },
    get cursor(){ return histLog.cursor; },
    get items(){ return histLog.items.map(i => ({ ...i })); },
    jump: historyJump, step: historyStep, reset: histReset,
    get rows(){ const el = $('#histList'); return el ? [...el.children].map(r => r.textContent) : null; },
    get curRow(){ const el = $('#histList'); if (!el) return -1; return [...el.children].findIndex(r => r.classList.contains('cur')); },
    clickRow(i){ const el = $('#histList'); if (!el || !el.children[i]) return false; el.children[i].click(); return true; },
  },
  
  
  histMem: () => ({ used: histMemUsage(), budget: histMemBudget() }),
  filter: {
    kinds: () => fltKinds(),
    guard: filterGuard,
    open: openFilterDialog, openLazy: openFilterLazy,
    apply: applyFilterNow, applyLazy: applyFilterLazy,
    commit: commitFilter, cancel: () => closeFilterDialog(false),
    repeat: withDialog => repeatLastFilter(!!withDialog),
    get last(){ return lastFilter && { kind: lastFilter.kind, params: { ...lastFilter.params } }; },
    get state(){ return fltState && { idx: fltState.idx, kind: fltState.kind, model: { ...fltState.model },
                                      on: fltState.on, bad: fltState.bad,
                                      proxy: fltState.proxy && { k: fltState.proxy.k, pw: fltState.proxy.pw, ph: fltState.proxy.ph } }; },
    set(key, v){ if (!fltState) return false; fltState.model[key] = v; renderFilterDialog(); fltRender(); return true; },
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    get dlg(){ return { open: !!$('#fltDlg').open, title: $('#fltTitle').textContent,
                        kind: $('#fltKind').value, rows: $('#fltBody').children.length,
                        err: $('#fltErr').textContent, okDisabled: $('#fltOk').disabled }; },
  },
  
  grad: {
    get opts(){ return { ...gradOpts }; },
    stops: gradStops, sample: gradSample, param: gradParam,
    get model(){ return gradCurrentModel(); },
    presetModel: gradPresetModel,
    editor: {
      open: (onOk, m) => openGradientEditor(onOk, m),
      close: commit => closeGradientEditor(!!commit),
      get state(){ return gradEditState && gradClone(gradEditState.model); },
      get dlgOpen(){ return !!$('#gradEditDlg').open; },
      get stops(){ const el = $('#gradEditBody');
        return el ? { color: el.querySelectorAll('[data-attr="grad-edit-color-stop"]').length,
                      op: el.querySelectorAll('[data-attr="grad-edit-op-stop"]').length,
                      mid: el.querySelectorAll('[data-attr="grad-edit-mid"]').length } : null; },
      clickBar(){ const b = $('#gradEditBody [data-attr="grad-edit-bar"]'); if (!b) return false; b.click(); return true; },
      clickStop(kind, i){ const el = $(`#gradEditBody [data-attr="grad-edit-${kind}-stop"][data-stop="${i}"]`);
        if (!el) return false; el.dispatchEvent(new (el.ownerDocument.defaultView).Event('pointerdown', { bubbles: true })); return true; },
      setField(attr, v){ const el = $(`#gradEditBody [data-attr="${attr}"]`); if (!el) return false;
        el.value = String(v);
        const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
        el.dispatchEvent(new V.Event(attr === 'grad-edit-color' ? 'input' : 'change')); return true; },
      del(){ const b = $('#gradEditBody [data-attr="grad-edit-del"]'); if (!b || b.disabled) return false; b.click(); return true; },
    },
    get drag(){ return gradDrag && { ...gradDrag }; },
    
    get live(){ const lg = liveGradInfo(); return lg && { idx: lg.idx, type: lg.typeKey, line: { ...lg.line }, rev: lg.rev,
      stops: lg.model ? lg.model.clrs.map(s => ({ loc: s.loc, hex: rgbHex(s), mid: s.mid })) : null }; },
    liveHit: (x, y) => liveGradHit({ x, y }),
    geomFromLine: (t, x0, y0, x1, y1) => gradGeomFromLine(t, x0, y0, x1, y1),
    lineFromGeom: (t, a, s, ox, oy) => gradLineFromGeom(t, a, s, ox, oy),
    pick: id => gradPickPreset(id),
    presets: () => [...GRAD_PRESET_INDEX.keys()],
    openPicker(){ const r = $('#gdSwatch').getBoundingClientRect(); return !!openGradPicker({ left: r.left, bottom: r.bottom }); },
    closePicker: () => closeGradPicker(),
    lut: (o = {}) => Array.from(gradModelLut(gradCurrentModel(), { size: o.size || 5, method: o.method, transparency: o.transparency })),
    begin: (x, y) => beginGradDrag({ pointerId: 1 }, { x, y }),
    move: (x, y, o = {}) => moveGradDrag({ pointerId: 1, shiftKey: !!o.shift }, { x, y }),
    end: () => endGradDrag(),
    draw(x0, y0, x1, y1, o = {}){
      beginGradDrag({ pointerId: 1 }, { x: x0, y: y0 });
      moveGradDrag({ pointerId: 1, shiftKey: !!o.shift }, { x: x1, y: y1 });
      return endGradDrag();
    },
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    click(id){ const el = $(id); if (!el) return false; el.click(); return true; },
    get bar(){ const g = id => { const el = $(id); return el && (el.type === 'checkbox' ? el.checked : el.value); };
               return { preset: gradOpts.preset, mode: g('#gdMode'), method: g('#gdMethod'), blend: g('#gdBlend'), trans: g('#gdTrans'),
                        opacity: g('#gdOpacity'), reverse: g('#gdReverse'), dither: g('#gdDither'),
                        style: [...$('#gdStyles').children].find(b => b.classList.contains('on'))?.dataset.style || null,
                        info: $('#gdInfo').textContent, hidden: $('#grpGrad').hidden }; },
  },
  bucket: {
    get opts(){ return { ...bucketOpts }; },
    fill: (x, y) => bucketFill({ x, y }),
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    get bar(){ const g = id => { const el = $(id); return el && (el.type === 'checkbox' ? el.checked : el.value); };
               return { source: g('#bkSource'), opacity: g('#bkOpacity'), tol: g('#bkTol'), contig: g('#bkContig'),
                        all: g('#bkAll'), info: $('#bkInfo').textContent, hidden: $('#grpBucket').hidden }; },
  },
  eyedrop: {
    get opts(){ return { ...eyeOpts }; },
    pick: (x, y, toBg) => eyedropAt({ x, y }, !!toBg),
    setField(id, v){ const el = $(id); if (!el) return false;
      el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    get bar(){ return { size: $('#edSize').value, all: $('#edAll').value,
                        info: $('#edInfo').textContent, hidden: $('#grpEyedrop').hidden }; },
  },
  
  move: {
    get opts(){ return { ...moveOpts }; },
    
    byOffset(idx, dx, dy){ if (!doc || !doc.layers[idx]) return null;
      scaleLayerGeometry(idx, 1, 1, dx, dy); renderPreviewOnly(); renderLayerPanel();
      return layerSelBBox(idx); },
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    groupHeadOf,
    get bar(){ return { auto: $('#mvAuto').checked, kind: $('#mvAutoKind').value, kindDisabled: $('#mvAutoKind').disabled,
                        showTf: $('#mvShowTf').checked, why: $('#mvWhy').textContent, hidden: $('#grpMove').hidden }; },
  },
  zoomTool: {
    get out(){ return zoomOutMode; },
    click(id){ const el = $(id); if (!el) return false; el.click(); return true; },
    fill: fillStage,
    get bar(){ return { inOn: $('#zmIn').classList.contains('on'), outOn: $('#zmOut').classList.contains('on'),
                        hidden: $('#grpZoom').hidden }; },
  },
  
  shape: {
    get opts(){ return { ...shapeOpts }; },
    setKind(k){ if (!SHAPE_KINDS[k]) return false; shapeOpts.kind = k; syncShapeBar(); drawGizmo(); return true; },
    
    customList: () => CUSTOM_SHAPES.map(s => ({ id: s.id, name: s.name, subpaths: s.subpaths.length,
                                                knots: s.subpaths.reduce((a, x) => a + x.knots.length, 0) })),
    get custom(){ return shapeOpts.custom; },
    setCustom: id => setCustomShape(id),
    customSubpaths: (id, rect) => customShapeSubpaths(id, rect),
    pop: {
      open(){ showCustomPop(); return !$('#shpCustomPop').hidden; },
      close: () => { hideCustomPop(); return true; },
      get open_(){ return !$('#shpCustomPop').hidden; },
      get cells(){ return [...$('#shpCustomPop').children].map(b => ({ id: b.dataset.id,
        name: b.querySelector('.pn').textContent, cur: b.classList.contains('cur'), thumb: !!b.querySelector('canvas') })); },
      click(id){ const b = [...$('#shpCustomPop').children].find(x => x.dataset.id === id);
        if (!b) return false; b.click(); return true; },
    },
    subpaths: (kind, st) => shapeSubpaths(kind, st),
    strokeOpt: shapeStrokeOpt,
    get state(){ return shapeState && { ...shapeState }; },
    get rect(){ return shapeState && shapeRect(shapeState); },
    begin: (x, y, opts = {}) => beginShapeDrag({ pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt }, { x, y }),
    move: (x, y, opts = {}) => moveShapeDrag({ pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt }, { x, y }),
    end: () => endShapeDrag(),
    async draw(x0, y0, x1, y1, opts = {}){
      const ev = { pointerId: 1, shiftKey: !!opts.shift, altKey: !!opts.alt };
      beginShapeDrag(ev, { x: x0, y: y0 });
      moveShapeDrag(ev, { x: x1, y: y1 });
      const st = shapeState; set_shapeState(null); gizmo.classList.remove('drag'); drawGizmo();
      const subs = st && shapeSubpaths(shapeOpts.kind, st);
      if (!subs) return false;
      return await commitDrawnPath(subs, shapeKindLabel(), { origin: shapeOriginFor(shapeOpts.kind, shapeOpts.kind === 'line' ? null : shapeRect(st)) });
    },
    commit: (subs, label) => commitShapePath(subs, label || '形状'),
    commitAny: (subs, label) => commitDrawnPath(subs, label || '形状'),
    get mode(){ return shapeOpts.mode; },
    setMode: m => setShapeMode(m),
    name: shapeLayerName,
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    get bar(){ const g = id => { const el = $(id); return el && el.value; };
               return { kind: $('#shpKindName').textContent, mode: g('#shpMode'), fill: g('#shpFill'), radius: g('#shpRadius'),
                        fillHidden: $('#shpFillWrap').hidden, strokeHidden: $('#shpStrokeWrap').hidden,
                        workHidden: $('#shpWorkWrap').hidden, workSelDisabled: $('#shpWorkSel').disabled,
                        sides: g('#shpSides'), weight: g('#shpWeight'), pathOp: g('#shpPathOp'),
                        stroke: g('#shpStroke'), strokeW: g('#shpStrokeW'), strokeAlign: g('#shpStrokeAlign'),
                        dash: g('#shpDash'), strokeDisabled: $('#shpStrokeAlign').disabled,
                        radiusHidden: $('#shpRadiusWrap').hidden, sidesHidden: $('#shpSidesWrap').hidden,
                        weightHidden: $('#shpWeightWrap').hidden,
                        info: $('#shpInfo').textContent, why: $('#shpWhy').textContent, hidden: $('#grpShape').hidden }; },
  },
  pen: {
    get pts(){ return penState ? penState.pts.map(k => ({ anchor: k.anchor.slice(), in: k.in.slice(), out: k.out.slice() })) : null; },
    down: (x, y, o = {}) => penDown({ pointerId: 1, altKey: !!o.alt }, { x, y }),
    move: (x, y, o = {}) => movePen({ pointerId: 1, altKey: !!o.alt }, { x, y }),
    up: () => endPenDrag(),
    click(x, y){ penDown({ pointerId: 1 }, { x, y }); endPenDrag(); return penState ? penState.pts.length : 0; },
    close: () => commitPen(true),
    finish: () => commitPen(false),
    cancel: () => cancelPen(),
    
    get corners(){ return penState ? penState.pts.map(k => !!k.corner) : null; },
    get free(){ return freePen && { pts: freePen.pts.map(p => ({ ...p })) }; },
    get freeOpts(){ return { ...freePenOpts }; },
    setFreeOpts(o){ Object.assign(freePenOpts, o); },
    curvatureDown: (x, y, o = {}) => { const r = curvatureDown({ pointerId: 1, shiftKey: !!o.shift, altKey: !!o.alt, detail: o.dbl ? 2 : 1 }, { x, y }); if (penState) penState.drag = null; return r; },
    curvatureDrag(x0, y0, x1, y1){ curvatureDown({ pointerId: 1, detail: 1 }, { x: x0, y: y0 }); curvatureMove({}, { x: x1, y: y1 }); return endPenDrag({ type: 'pointerup' }); },
    get sel(){ return penState ? penState.sel : null; },
    deleteSel: () => curvatureDeleteSelected(),
    freeDown: (x, y) => freePenDown({ pointerId: 1 }, { x, y }),
    freeMove: (x, y) => freePenMove({ pointerId: 1 }, { x, y }),
    freeUp: () => endFreePen(),
    rdp: (pts, eps) => rdpSimplify(pts, eps),
    get bar(){ return { info: $('#penInfo').textContent, fill: $('#penFill').value, mode: $('#penMode').value,
                        why: $('#penWhy').textContent, fillHidden: $('#penFillWrap').hidden,
                        finishHidden: $('#penFinish').hidden, finishDisabled: $('#penFinish').disabled,
                        closeDisabled: $('#penClose').disabled, hidden: $('#grpPen').hidden }; },
  },
  
  docPaths: {
    get active(){ return activePath; }, setActive: k => { set_activePath(k); set_pathModel(null); afterWorkPathChange(); return activePath; },
    get saved(){ ensureDocPaths(); return savedPaths.map(p => ({ name: p.name, subpaths: p.subpaths.length })); },
    get dirty(){ return { work: workPathDirty, saved: savedPathsDirty }; },
    target: () => pathTargetKey(),
    rows: () => pathPanelRows().map(r => ({ kind: r.kind, name: r.name, current: !!r.current })),
    save: name => saveWorkPathUI(name || '路径 1'), newPath: name => newSavedPathUI(name), del: () => deleteActivePathUI(),
    fill: o => fillPathUI(o || { use: 'fg', opacity: 100, feather: 0, anti: true }), stroke: o => strokePathUI(o || { tool: 'brush' }),
    toSel: (mode, dlg) => pathToSelectionUI(!!dlg, mode), fromSel: tol => selectionToWorkPathUI(tol == null ? 2 : tol),
    selSubs: subs => { set_pathSelSubs(new Set(subs)); drawGizmo(); return [...pathSelSubs]; }, get selAnchors(){ return [...pathSelAnchors]; },
    setOp: op => setSelectedPathOp(op), merge: () => mergePathComponents(), align: how => alignPathSubs(how), arrange: how => arrangePathSubs(how),
    nudge: (dx, dy) => nudgePathSelection(dx, dy), deleteAnchors: () => deleteSelectedAnchors(),
    get opts(){ return { ...pathOpts }; }, setOpts: o => { Object.assign(pathOpts, o); syncPathPanel(); return { ...pathOpts }; },
    get look(){ return { ...pathLook }; },
    fit: (pts, err, closed) => fitBezierPoints(pts, err, closed),
  },
  penOpts: { get value(){ return { ...penOpts }; }, set: o => { Object.assign(penOpts, o); syncPenBar(); return { ...penOpts }; } },
  liveShape: { select: i => { set_selLayer(i); selLayers.clear(); if (i >= 0) selLayers.add(i); renderLayerPanel(); renderProps(); syncShapeBar(); return selLayer; }, of: i => liveShapeOf(i), apply: (i, patch) => applyLiveShape(i, patch), widgets: () => { const W = liveRadiusWidgets(); return W && W.pts.map(p => ({ k: p.k, x: p.x, y: p.y })); } },
  magPen: { get state(){ return magPen && { anchors: magPen.anchors.length, path: magPen.path.length }; }, finish: c => finishMagPen(!!c), move: (x, y) => magPenMove({ x, y }), down: (x, y, o = {}) => magPenDown({ pointerId: 1, detail: o.dbl ? 2 : 1 }, { x, y }) },
  
  workPath: {
    get value(){ return workPath && { subpaths: workPath.subpaths.map(s => ({ closed: s.closed, operation: s.operation,
                   knots: s.knots.map(k => ({ anchor: k.anchor.slice(), in: k.in.slice(), out: k.out.slice() })) })) }; },
    get dirty(){ return workPathDirty; },
    set: (subs, how) => workPathSet(subs, how || 'new'),
    clear: () => clearWorkPath(),
    toSelection: mode => workPathToSelection(mode),
    bbox: subs => subpathsBBox(subs),
    rasterize: subs => rasterizeSubpaths(subs),
  },
  
  text: {
    isTextLayer, info: textInfoOf, style: applyTextStyle,
    render: (i) => renderTextLayer(i, layerTree.flat[i], { silent: true }),
    ensureRaster: i => ensureTextRaster(i),
    get rendered(){ return Object.keys(textRenders).map(Number); },
    
    pad: (b, m) => textRenderPad(b, m),
    

    rasterInk(i){ const cv = textRenders[i]; if (!cv) return null;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let ink = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 10) ink++;
      return { size: [cv.width, cv.height], ink, crop: textCrops[i] ? { ...textCrops[i].bounds } : null }; },
    createAt: (x, y) => createTextLayerAt({ x, y }),
    
    get editing(){ return textOverlay ? { idx: textOverlay.idx, value: textOverlay.ta.value, sel: [textOverlay.ta.selectionStart, textOverlay.ta.selectionEnd], dirty: !!textOverlay.dirty } : null; },
    boxHandles: i => { const h = textBoxHandles(i); return h && h.hs; },
    boxRaw: i => textBoxRaw(i),
    get maskEditing(){ return maskEdit ? { value: maskEdit.ta.value, box: maskEdit.box, pt: maskEdit.pt } : null; },
    dynamic: i => textDynamicOf(i),
    toggleDynamic: (i, shape) => toggleDynamicText(i, shape),
    indexAt: (i, x, y) => textIndexAt(i, { x, y }),
    warp: (i, style, bend = 50, h = 0, v = 0, vertical = false) => applyTextDesc(i, { warp: { __classID: 'warp', __name: '', warpStyle: warpEnum(style, 'warpStyle'),
      warpValue: bend, warpPerspective: h, warpPerspectiveOther: v, warpRotate: warpEnum(vertical ? 'Vrtc' : 'Hrzn', 'Ornt') } }, '文字变形'),
    get edits(){ return textStyleEdits; },
    
    get descEdits(){ return textDescEdits; },
    desc: (i, f) => effTextDesc(i, f),
    shape: i => effTextShape(i),
    styleOf: (i, k) => effTextStyle(i, k),
    get fontPreview(){ return fontPreviewSize; },
    down: async (x, y, x2, y2) => { const r = await textToolDown({ pointerId: 1 }, { x, y }); return textDrag ? await textToolUp(x2 != null ? { x: x2, y: y2 } : { x, y }) : r; },
    setField(id, v){ const el = $(id); if (!el) return false;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const V = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new V.Event('change')); return true; },
    click(id){ const el = $(id); if (!el) return false; el.click(); return true; },
    get bar(){ const g = id => { const el = $(id); return el && el.value; };
               return { size: g('#txSize'), color: g('#txColor'), font: $('#txFontName').textContent,
                        align: [...$('#txAligns').children].find(b => b.classList.contains('on'))?.dataset.align || null,
                        bold: $('#txBold').classList.contains('on'), italic: $('#txItalic').classList.contains('on'),
                        why: $('#txWhy').textContent, hidden: $('#grpText').hidden, disabled: $('#txSize').disabled,
                        aa: g('#txAA'), orient: $('#txOrient').title, dynamic: $('#txDynamic').classList.contains('on'),
                        alignTitles: [...$('#txAligns').children].map(b => b.title), editing: !$('#txCommit').hidden }; },
  },
  setDocTool: setDocToolFromHarness, get docTool(){ return docTool; },
  
  cursor: {
    name: currentCursorName,
    url: toolCursor,
    kinds: cursorNames,
    get gizmo(){ return $('#gizmo').style.getPropertyValue('--gizmo-cursor'); },
    get viewport(){ return $('#viewport').style.cursor; },
    sync(){ syncGizmoCursor(); updatePanCursor(); return true; },
  },
  
  ctx: {
    open(x, y){ openCanvasCtx({ clientX: 0, clientY: 0, preventDefault(){}, stopPropagation(){} }, { x, y }); return true; },
    close: () => hideLayerCtx(),
    get open_(){ return !layerCtx.hidden; },
    get items(){ return [...layerCtx.children].map(el => el.textContent); },
    click(label){ const b = [...layerCtx.children].find(el => el.tagName === 'BUTTON' && el.textContent === label);
      if (!b) return false; b.click(); return true; },
    layersUnder: (x, y) => layersUnder({ x, y }),
  },
  
  
  raster: {
    kindOf: i => rasterKindOf(i),
    run: (i, silent = true) => rasterizeLayerUI(i, { silent }),
    renderAlone: i => renderLayerAlone(i),
    bbox: (rgba, w, h) => opaqueBBox(rgba, w, h),
  },
  rulers: {
    get on(){ return rulersVisible; }, set: on => setRulersVisible(on),
    get unit(){ return rulerUnit; }, setUnit: u => setRulerUnit(u),
    units: () => Object.keys(RULER_UNITS),
    sync: () => { syncRulers(); return true; },
    step: (perScreenPx, minPx) => niceStep(perScreenPx, minPx),
    frame: () => rulerFrame(),
    get pos(){ return rulerPos && { ...rulerPos }; },
    setPos(x, y){ set_rulerPos((x == null ? null : { x, y })); syncRulers(); return true; },
    get boxes(){ const b = id => { const e = $(id); if (!e) return null; const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(e).display !== 'none' }; };
      return { h: b('#rulerH'), v: b('#rulerV'), corner: b('#rulerCorner'),
               cls: $('#viewport').className, unit: $('#rulerCorner').textContent }; },
  },
  view: {
    get zoom(){ return zoom; }, get fitMode(){ return zoomFitMode; },
    get pan(){ return { x: panX, y: panY }; },
    get panX(){ return panX; }, get panY(){ return panY; },
    get pixelGrid(){ return pixelGridOn; }, get rulers(){ return rulersVisible; },
    center: centerStage,
    setZoom, fit: () => fitStage(true), fill: fillStage, actual: () => { set_zoomFitMode(false); set_zoom(1); fitStage(); },
    wheel(deltaY, o = {}){
      const V = (viewport.ownerDocument && viewport.ownerDocument.defaultView) || window;
      const ev = new V.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaX: o.deltaX || 0,
        shiftKey: !!o.shift, altKey: !!o.alt, metaKey: !!o.mod, ctrlKey: !!o.mod, clientX: o.clientX || 0, clientY: o.clientY || 0 });
      viewport.dispatchEvent(ev); return true;
    },
  },
  
  setSpaceDown(v){ set_spaceDown(!!v); updatePanCursor(); },
  get spaceDown(){ return spaceDown; },
  
  closeDocument(){ applyState(emptyState()); resetForNewDoc(); refreshAll(false); syncToolButtons(); },
  get selLayer(){ return selLayer; },      
  set selLayer(v){ set_selLayer(v); renderLayerPanel(); },
  
  hitLayerAt, layerSelBBox, tfFrame, beginMoveDrag, moveMoveDrag, endMoveDrag, cancelMoveDrag, nudgeLayer, getTransformValues,
  isVectorOnlyLayer, effPathSubpaths, pathBounds,     
  

  layerOnCanvas, layerAlphaOnCanvas,
  sample: { rgba: all => sampleRGBA(!!all), map: (i, w0, h0, l0, t0) => paintMap(i, w0, h0, l0, t0) },
  get moveDrag(){ return moveDrag; },
  duplicateLayer: duplicateLayerUI, groupSelected: groupSelectedUI,
  dupes: { get auto(){ return dupAuto; }, set auto(v){ set_dupAuto(!!v); if (!v) { set_dupPending(null); clearTimeout(dupTimer); } },
           settle: () => dupTask, get pending(){ return !!dupPending; } }, ungroupSelected: ungroupSelectedUI, createLayer: createLayerUI,
  deleteLayerForReal, deleteLayersReal, deleteSelectedLayersUI, duplicateLayerBlockUI, groupPicksUI,
  


  layerDrag: {
    begin(idx){ set_dragRowIndex(idx); },
    end(){ set_dragRowIndex(-1); clearLayerDropHl(); },
    get index(){ return dragRowIndex; },
    get hl(){ return [...document.querySelectorAll('.' + LAYER_DROP_CLASS)].map(el => el.title || el.dataset.action || el.id); },
  },
  
  thumbSel: {
    get mods(){ return { ...liveMods }; },
    

    setMods(m){ const n = m || {}; liveMods.ctrl = !!n.ctrl; liveMods.shift = !!n.shift; liveMods.alt = !!n.alt; syncThumbSelCursor(); return { ...liveMods }; },
    hover(idx){ const th = rowEls[idx] && rowEls[idx].querySelector('.thumb'); thumbSelHover.el = th || null; syncThumbSelCursor(); return th ? th.style.cursor : ''; },
    get cursor(){ return thumbSelHover.el ? thumbSelHover.el.style.cursor : ''; },
    get on(){ return !!thumbSelHover.el; },
  },
  setLayerLock, setLayerBox, openLayerCtx, moveLockWhy, installScrubbers, alignLayers, distributeLayers,
  
  guides: {
    get list(){ return guides.map(g => ({ ...g })); },
    add(vertical, px){ guides.push({ vertical: !!vertical, px: Math.round(px) }); set_guidesDirty(true); drawGizmo(); return guides.length; },
    clear(){ set_guides([]); set_guidesDirty(true); drawGizmo(); },
    get visible(){ return guidesVisible; },
    get drag(){ return guideDrag && { ...guideDrag }; },
  },
 openLayerStyleDialog,
  get layerStyleOpen(){ return !!(layerStyleDlg && layerStyleDlg.isOpen()); },
 ensurePixelPaint, openTextEditor, openInlineTextEditor, closeInlineText, loadLayerAlphaAsSelection, toggleLayerDelete, clearSelectionPixels, fillSelectionPixels, openSelectAndMask, pathToSelection, selectionToLayerPath,
  setSelLayers(list){ selLayers.clear(); for (const i of list) selLayers.add(i); },
  commit, pushHistory, undo, redo, undoAny, redoAny, undoDoc, redoDoc, pushDocHistory, brushUndo, brushUndoable, renderTextLayer, setLayerVisible, setLayerPos, setLayerSize, rotateLayer,
  


  lazy: {
    edit: () => EDIT.load(), adjust: () => ADJUST.load(), selection: () => SELECT.load(), quad: () => QUADW.load(),
    filters: () => FILTER.load(), retouch: () => RETOUCH.load(), brushOps: () => BRUSH.load(),
    all: () => Promise.all([EDIT.load(), ADJUST.load(), SELECT.load(), QUADW.load(), FILTER.load(), RETOUCH.load(), BRUSH.load()]),
    prefetch(){ EDIT.prefetch(); ADJUST.prefetch(); SELECT.prefetch(); },
    get status(){
      const s = a => ({ ready: a.ready, loading: a.loading, tries: a.tries, error: a.error ? (a.error.message || String(a.error)) : null });
      return { edit: s(EDIT), adjust: s(ADJUST), selection: s(SELECT), quad: s(QUADW), filters: s(FILTER), retouch: s(RETOUCH), brushOps: s(BRUSH) };
    },
  },
  core: { parseSmartObjects, parsePsdRaster, parseLayerTree, freshLayerInfo, lintPsd, compositeAll, deformEquals, cloneDeform, parseFilterEffects, decodeFilterEffectsEntry, filterEffectsIdOf, parseImageResources, parsePsdFull }, api,
  
  retouch: {
    get opts(){ return { ...retouchOpts }; },
    setOpts(o){ Object.assign(retouchOpts, o); syncRetouchBar(); },
    get source(){ const c = csCur(); return c && { x: c.x, y: c.y, anchor: c.anchor && { ...c.anchor } }; },
    setSource(x, y){ csSetSample({ x, y }); syncRetouchBar(); drawGizmo(); },
    cloneSource: { get(){ return JSON.parse(JSON.stringify(cloneSrc)); }, set(o){ const c = csCur(); if (c) Object.assign(c, o); syncCloneSrcPanel(); drawGizmo(); },
                   setOpts(o){ Object.assign(cloneSrc, o); syncCloneSrcPanel(); drawGizmo(); }, panel: v => toggleCloneSrcPanel(v) },
    guard: () => retouchGuard(),
    get state(){ const S = retouchState; return S && { kind: S.kind, tool: S.tool, pts: S.pts && S.pts.length, box: S.box && { ...S.box } }; },
    get pending(){ return rtPending && { ...rtPending.t }; },
    setPending(t){ if (rtPending) { Object.assign(rtPending.t, t); drawGizmo(); } },
    commitPending: () => rtPendingCommit(), cancelPending: () => rtPendingCancel(),
    down: (x, y, o = {}) => retouchDown({ pointerId: 1, altKey: !!o.alt, shiftKey: !!o.shift, pressure: o.pressure ?? 0.5, pointerType: o.pen ? 'pen' : 'mouse' }, { x, y }),
    move: (x, y, o = {}) => retouchMove({ pointerId: 1, pressure: o.pressure ?? 0.5 }, { x, y }),
    up: () => retouchUp(),
    
    gesture(pts, o = {}){
      if (!retouchDown({ pointerId: 1, altKey: !!o.alt, shiftKey: !!o.shift, pressure: 0.5 }, pts[0])) return false;
      for (const p of pts.slice(1)) retouchMove({ pointerId: 1, pressure: 0.5 }, p);
      return retouchUp();
    },
    usePattern: () => rtPatchWithPattern(),
    get kernel(){ return RETOUCHM; },
    patterns: () => rtPatternList(),
    strokeMask: (pts, r) => retouchStrokeMask(pts, r),
    get bar(){ const vis = id => { const el = $(id); return !!el && !el.hidden; };
      return { info: $('#rtInfo').textContent, why: $('#rtWhy').textContent, hidden: $('#grpRetouch').hidden, size: $('#rtBrushSize').textContent,
               visible: [...$('#grpRetouch').querySelectorAll('[id]')].filter(e => e.id.startsWith('rt') && !e.hidden && e.offsetParent !== null).map(e => e.id),
               patchHidden: !vis('#rtPatchKindWrap'), moveHidden: !vis('#rtMoveModeWrap'), redHidden: !vis('#rtRedWrap') }; },
  },
  res: docImageResources,      
  shell,            
};


installScrubbers(document);
try { installToasts(); } catch (e) { console.warn('[toast]', e); }   
try {
  let pend = 0;
  

  void pend;
  new MutationObserver(() => { installScrubbers(document); })
    .observe(document.body, { childList: true, subtree: true });
} catch {  }
