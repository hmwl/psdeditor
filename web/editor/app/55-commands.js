




import './54-gestures-hints.js';   
import { openDocumentFile, revertDocumentFile, saveDocumentFile } from '../document-file.js';
import { parsePsdRaster, parseLayerTree, compositeAll, rebuildPsdChannels } from '../../../core/app.js';
import { decodeCompositeImage } from '../../../core/psd-image.js';
import { buildFlatPsd } from '../../../core/psd-channels.js';
import { setEmbeddedProfile } from '../../../core/doc-mode.js';
import { bracketStep, hardnessStep } from '../../../core/brush-engine.js';
import { GALLERY_EFFECTS as GALLERY_MENU } from '../../../core/filter-gallery-spec.js';
import { readStyleSheets } from '../../../core/text-styles.js';
import { actions } from '../actions.js';
import { whenIdle } from '../lazy.js';
import { openShortcutSheet } from '../shortcut-sheet.js';
import { installAdjustmentsPanel } from '../adjustments-panel.js';
import { fragmentToJSON } from '../api-client.js';
import { brushPanel } from '../brushes-panel.js';
import { installChanPathPanels } from '../chan-path-panels.js';
import { installColorPanel } from '../color-panel.js';
import { confirmDialog, promptDialog, choiceDialog, formDialog, alertDialog } from '../dialog.js';
import { proWarpNotice } from '../pro.js';
import { DOCS } from '../documents.js';
import { installHistoryPanel } from '../history-panel.js';
import { hasUiIcon } from '../icons.js';
import { installLayerB, DOC_EXT } from '../layerb.js';
import { installLayersMore } from '../layers-more.js';
import { installLayersPanel } from '../layers-panel.js';
import { menu } from '../menu.js';
import { installModifierKeys } from '../modifier-keys.js';
import { installNotesPanel } from '../notes-panel.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { presets } from '../presets-panels.js';
import { isShapeLayer } from '../property-panel.js';
import { installPropsPS } from '../props-ps.js';
import { psPanels } from '../ps-panels.js';
import { recentFiles as RECENT } from '../recent-files.js';
import { shell } from '../shell.js';
import { installShortcutEditor, shortcutEditor as SCE } from '../shortcut-editor.js';
import { shortcuts } from '../shortcuts.js';
import { installSmartFilterEdit } from '../smart-filter-edit.js';
import { tools } from '../tools.js';
import { installWindowMenu } from '../window-menu.js';
import { installWorkspaces } from '../workspaces.js';
import {
  $, ADJM, ADJ_ALL, ADJ_KINDS_MENU, BLEND_KEYS, BLEND_LABELS, EDIT, NEWDOC, QUADW, SELECT, SELM, applyEdits,
  createSelection, engineOK, ensureLazy, icon, openLayerStyleDialog, runLazy, selectionBounds,
} from './01-boot.js';
import {
  CHP, CM, LP, LX, PIXEL_GRID_MIN_ZOOM, SFX, artboardGuidesOn, brushHistory, brushPreviewOn, countVisible,
  curStroke, doc, docH, docName, docSnapshotCanvas, docStack, docW, editPinsOn, gridOpts, guides, guidesLocked,
  guidesVisible, lastSelection, layerDeletes, layerEdgesOn, layerEdits, layerRenames, layerReorder,
  layerTextEdits, layerTree, li, maskPaint, notesVisible, origBuffer, pixelGridOn, pixelPaint, proofOn,
  psdFromPixels, rulersVisible, selEdgesOn, selection, set_CHP, set_LP, set_LX, set_SFX, set_artboardGuidesOn,
  set_brushPreviewOn, set_countVisible, set_editPinsOn, set_guides, set_guidesDirty, set_guidesLocked,
  set_guidesVisible, set_hexAlpha, set_layerEdgesOn, set_notesVisible, set_pixelGridOn, set_selEdgesOn,
  set_slicesLocked, set_smartGuidesOn, set_viewFlip, set_viewPar, set_viewParCorrect, slicesLocked,
  smartGuidesOn, sos, textCrops, textOverlay, viewFlip, viewPar, viewParCorrect,
} from './02-doc-state.js';
import {
  HXP, actRecord, docHistLock, docHistory, docSnapshot, histLog, histSessionLog, histTrim, historyJump,
  historySourceMapNow, historyStep, hxApplyCtx, hxCapture, hxDerivedSnapshot, hxNewDocFromState, pushDocHistory,
  redoAny, redoBtn, restoreDocSnapshot, revealPropsPanel, rgbaThumbCanvas, saveHistoryLogText, set_ADJP,
  set_HXP, set_LAST_RUN, set_PP, set_docHistLock, set_layerEditInProgress, set_pendingReplSO, set_propTab,
  set_uiQuiet, syncHistoryPanel, syncPropTabs, uiQuiet, undoAny, undoBtn, updateUndoButtons,
} from './03-history.js';
import {
  RULER_UNITS, applyPan, fitStage, nextZoomStep, rulerUnit, setRulerUnit, setRulersVisible, setZoom,
  set_rulerUnit, set_zoom, set_zoomFitMode, syncRulers,
} from './04-view-chrome.js';
import {
  LOCK_BTN_FIELD, gridOptionsDialog, guidesFromLayer, isBackgroundLayer, newGuideDialog, newGuideLayoutDialog,
  rasterKindOf, rasterizeLayerUI, syncLockRow, toggleLayerLock, unlockBackground,
} from './05-layer-lock-guides.js';
import { centerDocPoint, layerSelBBox, tfFrame } from './06-view-zoom-move.js';
import { installInfoPanelsWiring, isVectorOnlyLayer } from './07-nav-histogram.js';
import {
  docResolution, openCanvasSizeDialog, openImageSizeDialog, openNewDialog, readResolution, resizeCanvas,
  set_docResolution,
} from './08-doc-size.js';
import {
  TEXT_ALIGNS, aaLabel, applyTextStyle, fontDisplayName, isMacUI, isTextLayer, syncTextBar, textInfoOf,
  textToolOpts,
} from './09-text-tool.js';
import { beginCrop, commitCrop, cropState, set_cropChecker, set_cropState } from './10-crop.js';
import {
  exportArtboardsToFiles, exportLayersToFiles, exportSmartContents, gpuCompatDialog, makeZip, paintOrigin,
  proofSim, setProofSim, systemInfoDialog,
} from './11-paint-common.js';
import {
  adaptiveWideUI, artboardFromLayersUI, backgroundFromLayerUI, bakeLayerStyleUI, blurGalleryUI, filterGalleryUI,
  galleryDecodeFile, galleryGuard, galleryPatterns, galleryShowAllPref, injectGalleryMenu, liquifyUI,
  liveFxEntries, newArtboardDialog, renderGenUI, setGalleryShowAllPref, vanishingPointUI,
} from './12-fx-workspaces.js';
import {
  applyImageDialog, calculationsDialog, copyToClipboard, downloadDataURL, exportLayerUI, layerCssText,
  layerNameOf, layerSvgText, layerViaSelection, layerVisiblePixels, mattingUI, newSliceFromLayerUI,
  openQuickMaskOptions, pixelsToCanvas, qmask, qmaskOpts, selectSubjectUI, setQmaskInverted, toggleQuickMask,
  toggleSmartFilterMaster,
} from './13-quickmask-apply-image.js';
import {
  commandSearch, contentAwareFillNow, deleteEmptyLayersUI, editFadeDialog, editFillDialog, editStrokeDialog,
  fadeTarget, fileInfoDialog, findReplaceText, layerPixelJob, printDocument, purgeHistory, toggleLastState,
  toggledBack,
} from './14-edit-misc.js';
import { syncBucketBar, syncGradBar } from './15-gradient-bucket-eyedropper.js';
import {
  applyFilterLazy, filterGuard, fltSpec, lastFilter, openFilterLazy, pickDisplaceMap, repeatLastFilter,
} from './16-filters-menu.js';
import {
  activeDocSubs, activePath, docPathLabel, ensureDocPaths, rasterizeSubpaths, roundRectSubpath, savedPaths,
  workPath,
} from './17-shape-pen.js';
import {
  beginContentAwareScale, beginFreeTransform, casWhy, moveLockWhy, pathTfEligible, tfCurValues, tfEligible,
  tfLast, tfMark, tfNumFromQuad, tfRefPoint, tfState, tfSyncBar, tfWriteQuad, transformAgain,
} from './19-free-transform.js';
import {
  bakeSO, builtIndexOf, duplicateLayerBlockUI, duplicateLayerUI, hasAnyEdits, openInside, refreshAll,
  set_snapOn, snapOn, snapTo, soInside,
} from './20-snap-smart-object.js';
import {
  addDocGate, decodeImageFile, initDocument, isImageFileName, loadPsd, lxSetLayerRaster, lxStructural,
  openImageAsDocument, soRenderImage,
} from './21-load-document.js';
import { matchLayer } from './22-deform-tools.js';
import {
  THUMB_BOX, canLoadLayerSelection, collapsedGroups, fxMasterBase, layerFxItems, layerOrderView, maskThumbCache,
  openFxMenu, panelLayerIndices, renderLayerPanel, revealLayerRow, selLayer, selLayers, set_THUMB_BOX,
  set___syncPsPanels, set_selLayer, smartFilterInfo, thumbCache,
} from './23-layers-panel.js';
import {
  addAdjustmentLayer, addAdjustmentPreset, baseMaskNum, commitLayerOps, dropLayerOp, effClipping, effColorLabel,
  effFillOpacity, effFxMaster, effKnockout, effLock, effMaskFlag, effMaskNum, effParam, layerOpsSnapshot,
  layerParams, maskStructOp, opField, renderProps, restoreLayerOps, setOpField, setParamFieldsBatch,
  setSingleOp, withFastCommit,
} from './24-layer-ops-queue.js';
import {
  actExportBytes, installActionsPanel, installBrushLib, installPresetLibrary, waitIdle,
} from './25-presets-actions-wiring.js';
import {
  convertToSmartObjectUI, createLayerUI, docPatterns, groupSelectedUI, newGroupUI, nextLayerName,
  openNewFillDialog, placeEmbeddedUI, ungroupSelectedUI,
} from './26-layer-create.js';
import { setLayerBlend, setLayerOpacity, setLayerVisible } from './27-gradient-editor.js';
import {
  ALIGN_BTNS, ALIGN_LABEL, DISTRIBUTE_ICONS, alignLayers, alignPropertyLayers, batchTargets, deleteLayerForReal,
  deleteLayersReal, distributeLayers, dragRowIndex, flipLayer, getPropertyTransformValues, getTransformValues,
  moveLayer, moveLayerTo, setLayerPos, setShapePropertyTransform, syncLayerControls, syncTransformInputs,
  transformBase, wireLayerFootDrops,
} from './28-layer-props-transform.js';
import { displayOrder, gizmoTx, rotateLayer, startScrub } from './29-scrubby-live.js';
import {
  GPUV, chanCount, chanSupported, chanThumb, chanView, cmDisplay, composeDocForOrder, gizmoCanvas, gpuApplyPref,
  gpuSnapshotCanvas, gpuStatus, loadChannelSelection, paintLayersExport, previewCompositeDoc, renderPreviewOnly,
  renderStaticLayers, setChannelView, viewScratch,
} from './30-render.js';
import {
  PAINT_TOOLS, TEXT_TOOLS, auxDrag, bgRGB, brush, captureHistorySource, countGroups, docTool, fgRGB,
  historySourceInfo, maskEditRelayout, measureLine, notesApi, rulerMetrics, selectHistorySource, setDocTool,
  set_NOTESP, set_bgRGB, set_fgRGB, set_historySource, set_historySourceInfo, syncAuxBar, toolDataAPI,
} from './31-selection-brush.js';
import {
  askFeather, askPixels, clearSelectionPixels, combineInto, contractSel, deselect, expandSel, featherSel,
  fillSelectionPixels, invertSel, invertSelLazy, loadLayerAlphaAsSelectionLazy, sampleRGBA, selBracket,
  selReady, selectAllLazy, setSelection, syncGizmoCursor,
} from './32-cursors-select-options.js';
import {
  docSlices, set_sliceSel, set_slicesDirty, sliceModel, sliceOpts, sliceWriteWhy,
} from './34-perspective-crop-slice.js';
import {
  abSel, artboardClip, artboardMembers, artboardOfLayer, artboardWriteWhy, docArtboards, duplicateArtboardUI,
  newSmartViaCopyUI, set_artboardClip,
} from './35-artboard.js';
import {
  copyLayersUI, createFrameFromLayerUI, frameBelow, frameRectOfLayer, frameWhy, lastClipKind, layerClip,
  lbAddNotes, lbFontList, lbIndexOfKey, lbKeyOf, lbPixelBackup, lbReplacePixels, pasteLayersUI, putIntoFrameUI,
  set_lastClipKind, takeOutOfFrameUI,
} from './36-clipboard-frame.js';
import {
  brushRedo, brushRedoable, brushUndo, brushUndoable, commitMaskPaint, ensureMaskPaint, ensurePixelPaint,
  flushSparsePaint, maskAdded, maskFromSelection, sameBytes, selCovFn, sparsePaintBusy, syncBrushSwatches,
} from './38-brush-engine.js';
import { adjBrushOpts, setBrushHardness, setBrushSize, syncBrushControls } from './39-brush-options.js';
import {
  maskSelectAndMask, openSelectAndMask, pickColor, resetColors, swapColors, syncBrushPanel,
} from './40-options-bar-wiring.js';
import { adjustGuard, openAdjustLazy } from './41-image-adjust.js';
import {
  adjCtlState, adjLayerHistogram, adjLayerTarget, blockValue, curveChannelOptions, curveView, setCurveView,
} from './42-adjust-panels.js';
import { commitCurveList, curvePtsOf, resetAdjLayer } from './43-gradient-map-adjust-form.js';
import {
  bindPathPanelChrome, deleteActivePathUI, effPathSubpaths, newSavedPathUI, nextPathName, onPathRowClick,
  panelPathSubs, pathPanelRows, pathsMenuBase,
} from './44-vector-path.js';
import { mergePathComponents, pathLook, pathToSelection } from './45-path-tools.js';
import { b64ToU8, drawGizmo, filterPost, gizmo, soFilterEdits, soFilters, toDoc } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import {
  buildPsdBuffer, canvasToBlob, dispTextOf, ensureStructuralBase, quickExportPng, showExportDlg,
} from './48-info-export.js';
import {
  applyTextFont, fontChoiceOf, fontFamilies, loadSystemFonts, openFontPopover, renderTextLayer, resolveFont,
  selFontPs, set_textToolFont, sysFontByPs, textPtFactor, textToolFont, textToolFontPs,
} from './49-fonts-text-model.js';
import {
  addVectorMaskUI, canMergeDown, compositeNowRGBA, copyPixelsUI, cutPixelsUI, deleteHiddenLayersUI,
  deleteVectorMaskUI, lockLayersDialog, maskFromTransparencyUI, mergeLayersUI, pasteClipboardUI,
  reverseLayersUI, setVectorMaskPathsUI, toggleClippingMaskUI,
} from './50-clipboard-merge-mask.js';
import {
  borderSelUI, clearDisabledLayerStyleUI, clearLayerStyleUI, copyLayerStyleUI, flipCanvas, fxClipboard,
  fxFileSlotsOf, fxItemsOf, globalLightDialog, graySelectionUI, growSelUI, hideAllEffectsUI,
  loadSelectionDialog, maskGrayOnCanvas, openColorRangeDialog, pasteLayerStyleUI, revealAllCanvas, rotateCanvas,
  scaleEffectsUI, smoothSelUI, tfBeginSelectionOutline, trimCanvasDialog,
} from './51-image-select-menu.js';
import {
  ANTI_ALIAS_MODES, FONT_PREVIEW_SIZES, alphaWriteWhy, applyTextDesc, convertTextShapeUI, deleteAlphaChannelUI,
  docAlphaChannels, docAlphaGray, docAlphaThumb, duplicateAlphaChannelUI, effTextDesc, effTextShape,
  fontPreviewSize, loadAlphaSelection, newAlphaChannelUI, openTextWarpDialog, pasteLoremIpsum,
  renameAlphaChannelUI, resolveMissingFontsUI, saveSelectionDialog, selectionGrayFull, setFontPreviewSize,
  textDynamicOf, toggleDynamicText, updateAllTextLayers,
} from './52-alpha-text-menu.js';
import { isRetouchBrush, toggleCloneSrcPanel } from './53-retouch-clone-pattern.js';
import { rtBrushKey } from './54-gestures-hints.js';
import {
  CPP, LB, convertTextToShape, createWorkPathFromText, effTextPath, fontBytesFor, glyphOutlineWhy,
  opticalKernReady, setTextSheets, set_CPP, set_LB, set_TXP, textInsertAtCaret, textSheets,
} from './57-layer-style-text-path.js';
import { fireScriptEvent } from './58-scripting.js';




{
  const hasDoc = () => !!doc;
  const inPreview = () => !!doc && !li;
  const hasLayer = () => inPreview() && selLayer >= 0;
  const brushOn = () => inPreview() && (PAINT_TOOLS.has(docTool) || isRetouchBrush(docTool));
  




  const R = (id, run, enabled, extra) => actions.register(id, {
    
    run: (extra && extra.passThrough) ? run : ((...a) => { const r = run(...a); if (r && typeof r.then === 'function') set_LAST_RUN(r); }),
    enabled, ...(extra || {}),
  });
  
  R('file.new', () => openNewDialog());
  R('file.open', openDocumentFile);
  R('file.openAs', openDocumentFile);
  const placeInput = document.createElement('input');
  placeInput.type = 'file'; placeInput.id = 'placeEmbeddedFile'; placeInput.hidden = true;
  document.body.append(placeInput);
  placeInput.onchange = async e => { const file = e.target.files[0]; e.target.value = ''; if (file) await placeEmbeddedUI(file); };
  R('file.placeEmbedded', () => placeInput.click(), inPreview);
  
  R('file.close', async () => { if (!docStack.length) fireScriptEvent('close'); return await DOCS.close(); }, hasDoc);
  R('file.closeAll', () => DOCS.closeAll(), hasDoc);
  R('file.save', () => saveDocumentFile('save'), hasDoc);   
  R('file.saveAs', () => saveDocumentFile('as'), hasDoc);
  R('file.saveCopy', () => saveDocumentFile('copy'), hasDoc);
  R('file.exportAs', showExportDlg, hasDoc);
  R('file.quickExportPng', quickExportPng, hasDoc);
  R('file.revert', async () => { if (await confirmDialog('恢复到当前文件最近存储的状态？未保存的改动会丢失。', { title: '恢复', okText: '恢复', danger: true })) return revertDocumentFile(); }, () => hasDoc() && !docStack.length);
  const unsupportedFile = (id, why) => R(id, () => false, () => false, { why: () => why });
  unsupportedFile('file.newFromTemplate', '模板库需要 Photoshop/Creative Cloud 模板服务');
  unsupportedFile('file.newOcio', 'OpenColorIO 新建文档需要原生 OCIO 宿主');
  unsupportedFile('file.openAsOcio', 'OpenColorIO 打开需要原生 OCIO 宿主');
  unsupportedFile('file.exportQueue', '导出队列需要 Photoshop 的原生导出调度器');
  unsupportedFile('file.generativeRecompose', '生成式重构图依赖 Photoshop 生成式 AI');
  unsupportedFile('file.expressTemplates', 'Adobe Express 模板需要 Creative Cloud 服务');
  unsupportedFile('file.fireflyBoard', 'Firefly 灵感板需要 Creative Cloud 服务');
  unsupportedFile('file.placeFreeStock', 'Adobe Stock 需要 Creative Cloud 账号服务');
  unsupportedFile('file.convertOcio', 'OpenColorIO 转换需要原生 OCIO 宿主');
  unsupportedFile('file.ocioSettings', 'OpenColorIO 设置需要原生 OCIO 宿主');
  unsupportedFile('file.continuity', 'iPhone/iPad 导入需要 macOS 设备接口');
  unsupportedFile('file.quit', '浏览器页面没有应用级退出命令');
  
  




  const undoEditor=()=>{if(sparsePaintBusy())return flushSparsePaint().then(undoEditor);if(li){undoAny();return;}if(HXP&&HXP.undoStateChange())return;if(historyStep(true))return;if(brushUndoable()&&brushUndo())return;undoAny();};
  R('edit.undo',undoEditor,()=>!undoBtn.disabled);
  R('edit.redo', () => { if (li) { redoAny(); return; } if (historyStep(false)) return; if (brushRedoable() && brushRedo()) return; redoAny(); }, () => !redoBtn.disabled);
  const stepBackwardEditor = () => {
    if (li) { undoAny(); return; }
    if (HXP && HXP.undoStateChange()) { updateUndoButtons(); return; }
    historyStep(true); updateUndoButtons();
  };
  const stepForwardEditor = () => {
    if (li) { redoAny(); return; }
    historyStep(false); updateUndoButtons();
  };
  R('edit.stepBackward', stepBackwardEditor, () => !!doc && (!li ? (histLog.cursor > 0 || (HXP && HXP.canUndoStateChange && HXP.canUndoStateChange())) : !undoBtn.disabled));
  R('edit.stepForward', stepForwardEditor, () => !!doc && (!li ? histLog.cursor < histLog.items.length - 1 : !redoBtn.disabled));
  R('edit.clear', () => clearSelectionPixels(), hasLayer);
  R('edit.fillForeground', () => fillSelectionPixels(fgRGB), hasLayer);
  R('edit.fillBackground', () => fillSelectionPixels(bgRGB), hasLayer);
  
  const tfQuadOp = f => {
    const cur = tfFrame(tfCurValues()).corners, c = tfRefPoint({ base: cur, ref: tfState.ref });   
    const q = cur.map(([x, y]) => f(x - c[0], y - c[1]).map((v, k) => v + c[k]));
    tfMark(); tfWriteQuad(tfState.idx, q); tfNumFromQuad(); tfSyncBar(); renderStaticLayers(); syncTransformInputs(); drawGizmo();
  };
  const tfRot = deg => { const a = deg * Math.PI / 180, co = Math.round(Math.cos(a)), si = Math.round(Math.sin(a)); tfQuadOp((x, y) => [x * co - y * si, x * si + y * co]); };
  R('edit.transform.flipH', () => tfState ? tfQuadOp((x, y) => [-x, y]) : flipLayer(selLayer, 'x'), () => !!tfState || hasLayer());
  R('edit.transform.flipV', () => tfState ? tfQuadOp((x, y) => [x, -y]) : flipLayer(selLayer, 'y'), () => !!tfState || hasLayer());
  R('edit.transform.rotate180', () => tfState ? tfRot(180) : rotateLayer(selLayer, (getTransformValues(selLayer).rot || 0) + 180), () => !!tfState || hasLayer());
  R('edit.transform.rotate90cw', () => tfState ? tfRot(90) : rotateLayer(selLayer, (getTransformValues(selLayer).rot || 0) + 90), () => !!tfState || hasLayer());
  R('edit.transform.rotate90ccw', () => tfState ? tfRot(-90) : rotateLayer(selLayer, (getTransformValues(selLayer).rot || 0) - 90), () => !!tfState || hasLayer());
  
  R('edit.freeTransform', o => { if (o && o.event && !tfState && TEXT_TOOLS.has(docTool) && CPP) { CPP.toggle(); return; } return beginFreeTransform('free'); },
    () => !!tfState || !tfEligible() || pathTfEligible() || (TEXT_TOOLS.has(docTool) && !!CPP));
  R('edit.contentAwareScale', () => { beginContentAwareScale(); }, () => !casWhy() || !!(tfState && tfState.cas), { why: () => casWhy() });
  for (const [id, kind] of [['scale', 'scale'], ['rotate', 'rotate'], ['skew', 'skew'], ['distort', 'distort'], ['perspective', 'perspective']])
    R('edit.transform.' + id, () => beginFreeTransform(kind), () => !!tfState || !tfEligible() || pathTfEligible());
  R('edit.transformAgain', () => transformAgain(), () => !!tfLast && !tfEligible());
  R('edit.transform.warp', () => proWarpNotice('warp'), () => !!doc);
  R('edit.transform.warpSplit.cross', () => proWarpNotice('warp'), () => !!doc);
  R('edit.transform.warpSplit.vertical', () => proWarpNotice('warp'), () => !!doc);
  R('edit.transform.warpSplit.horizontal', () => proWarpNotice('warp'), () => !!doc);
  R('edit.transform.warpSplit.remove', () => proWarpNotice('warp'), () => !!doc);
  for (const [id, kind] of [['edit.puppetWarp', 'puppetWarp'], ['edit.perspectiveWarp', 'perspectiveWarp']])
    R(id, () => proWarpNotice(kind), () => !!doc);

  
  let relightOpening = false;
  R('ai.relight', async () => {
    if (relightOpening || adjustGuard()) return false;
    relightOpening = true;
    try {
      const sourceDoc = doc, idx = selLayer, pp = ensurePixelPaint(idx);
      if (!pp) throw new Error('选中的图层没有可处理的像素');
      const base = new Uint8ClampedArray(pp.rgba), sc = selCovFn();
      let coverage = null;
      if (sc) {
        const og = paintOrigin(idx, pp);
        if (!og) throw new Error('请先应用图层变换，再对选区重新打光');
        coverage = new Uint8Array(pp.w * pp.h);
        for (let y = 0; y < pp.h; y++) for (let x = 0; x < pp.w; x++) coverage[y * pp.w + x] = sc(og.left + x, og.top + y);
      }
      const isCurrent = () => doc === sourceDoc && selLayer === idx && pixelPaint[idx] === pp && !adjustGuard(idx);
      const { openRelight } = await import('../relight.js');
      if (!isCurrent()) return false;
      const out = await openRelight({ rgba: base, w: pp.w, h: pp.h, title: layerTree.flat[idx].name, coverage, isCurrent });
      if (!out || !isCurrent()) return false;
      if (!sameBytes(pp.rgba, base)) throw new Error('图层像素已发生变化，请重新打开打光面板');
      return layerPixelJob('重新打光', () => out);
    } catch (e) { $('#err').textContent = '重新打光失败：' + (e?.message || e); return false; }
    finally { relightOpening = false; }
  }, () => !relightOpening && !adjustGuard(), { why: () => relightOpening ? '重新打光面板已打开' : adjustGuard() });
  const rasterizable = () => hasLayer() && !!rasterKindOf(selLayer);
  R('type.rasterize', () => rasterizeLayerUI(selLayer), rasterizable);
  R('layer.rasterize.layer', () => rasterizeLayerUI(selLayer), rasterizable);
  R('layer.rasterize.type', () => rasterizeLayerUI(selLayer), () => hasLayer() && rasterKindOf(selLayer) === 'text');
  R('layer.rasterize.shape', () => rasterizeLayerUI(selLayer), () => hasLayer() && rasterKindOf(selLayer) === 'shape');
  R('layer.rasterize.fill', () => rasterizeLayerUI(selLayer), () => hasLayer() && rasterKindOf(selLayer) === 'fill');
  R('layer.rasterize.smartObject', () => rasterizeLayerUI(selLayer), () => hasLayer() && rasterKindOf(selLayer) === 'smart');
  R('layer.smart.rasterize', () => rasterizeLayerUI(selLayer), () => hasLayer() && rasterKindOf(selLayer) === 'smart');
  R('layer.rasterize.all', async () => {
    const n = (layerTree && layerTree.flat || []).length;
    const todo = []; for (let i = 0; i < n; i++) if (rasterKindOf(i)) todo.push(i);
    if (!todo.length) { shell.status('没有需要栅格化的图层'); return; }
    if (!await confirmDialog(`要把 ${todo.length} 个图层全部栅格化吗？文字 / 路径 / 填充参数都将不再可编辑。`, { title: '栅格化所有图层', okText: '栅格化', danger: true })) return;
    for (const i of todo) await rasterizeLayerUI(i, { silent: true });
    shell.status(`已栅格化 ${todo.length} 个图层`);
  }, () => hasDoc() && (layerTree && layerTree.flat || []).some((_, i) => !!rasterKindOf(i)));
  R('type.warp', () => { openTextWarpDialog(selLayer); }, () => inPreview() && isTextLayer(selLayer));
  
  const isTx = () => inPreview() && isTextLayer(selLayer);
  
  for (const [id, value, label] of [
    ['none', 'antiAliasNone', '无'], ['sharp', 'antiAliasSharp', '锐利'], ['crisp', 'antiAliasCrisp', '犀利'],
    ['strong', 'antiAliasStrong', '浑厚'], ['smooth', 'antiAliasSmooth', '平滑'],
    ['macLcd', 'antiAliasPlatformLCD', 'Mac LCD'], ['mac', 'antiAliasPlatformGray', 'Mac'],
  ])
    R('type.aa.' + id, () => {
      applyTextDesc(selLayer, { antiAlias: value }, '消除锯齿');
      shell.status(`消除锯齿：${aaLabel(value, label)}（写进 PSD；画布按对应的边缘曲线预览）`);
    }, isTx, { checked: () => isTx() && effTextDesc(selLayer, 'antiAlias') === value });
  
  for (const [id, value, label] of [['horizontal', 'horizontal', '横排'], ['vertical', 'vertical', '直排']])
    R('type.orientation.' + id, () => {
      applyTextDesc(selLayer, { orientation: value }, '文字排列方向');
      shell.status(value === 'vertical'
        ? '文字排列方向：直排（逐字成列、从右往左）'
        : '文字排列方向：横排');
      void label;
    }, isTx, { checked: () => isTx() && effTextDesc(selLayer, 'orientation') === value });
  
  
  R('type.convertToParagraph', () => { convertTextShapeUI(selLayer); }, () => isTx() && !effTextPath(selLayer), { why: () => isTx() && effTextPath(selLayer) ? '路径文字 / 区域文字不能转换为点文本 / 段落文本（PS 同）' : '' });
  R('type.dynamic', () => { toggleDynamicText(selLayer); }, () => isTx() && effTextDesc(selLayer, 'orientation') !== 'vertical');
  
  R('type.loremIpsum', () => { pasteLoremIpsum(selLayer); }, isTx);
  R('type.updateAll', () => { updateAllTextLayers(); },
    () => inPreview() && ((layerTree && layerTree.flat) || []).some(L => L && L.text));
  R('type.resolveMissing', () => { resolveMissingFontsUI(false); }, () => inPreview() && ((layerTree && layerTree.flat) || []).some(L => L && L.text));
  R('type.replaceMissing', () => { resolveMissingFontsUI(true); }, () => inPreview() && ((layerTree && layerTree.flat) || []).some(L => L && L.text));
  
  for (const [id] of FONT_PREVIEW_SIZES)
    R('type.preview.' + id, () => { setFontPreviewSize(id); }, () => true, { checked: () => fontPreviewSize === id });
  
  
  R('type.createWorkPath', () => { createWorkPathFromText(selLayer); }, () => isTx() && !glyphOutlineWhy(selLayer), { why: () => glyphOutlineWhy(selLayer) });
  R('type.convertToShape', () => { convertTextToShape(selLayer); }, () => isTx() && !glyphOutlineWhy(selLayer), { why: () => glyphOutlineWhy(selLayer) });
  R('type.matchFont', () => {}, () => false,
    { why: () => '不做：「匹配字体」是 Adobe 的图像识别服务（要把图上传到 Adobe），与本项目「本地优先、不上传」的定位冲突' });
  R('type.adobeFonts', () => {}, () => false,
    { why: () => '不做：Adobe Fonts 是 Adobe 账号生态里的字体库，浏览器里没有对应形态' });
  for (const [v] of TEXT_ALIGNS) R('type.align.' + v, () => applyTextStyle(selLayer, { align: v }), () => isTextLayer(selLayer));
R('image.crop', () => {
  if (!selection) { shell.status('「图像 › 裁剪」需要先建立一个选区'); return false; }
  const b = selectionBounds(selection);
  if (!(b.width > 1 && b.height > 1)) { shell.status('选区太小，无法按它裁剪'); return false; }
  
  const had = !!cropState;
  if (had) cropState.rect = { x: b.x, y: b.y, w: b.width, h: b.height };
  
  else set_cropState({ rect: { x: b.x, y: b.y, w: b.width, h: b.height }, angle: 0, off: { x: 0, y: 0 }, drag: null, ratio: 'free', del: false, overlay: 'thirds', pushed: false });
  commitCrop(true);
  if (had && docTool === 'crop') beginCrop();   
  return true;
}, () => hasDoc() && !!selection);
  R('image.size', () => openImageSizeDialog(), hasDoc);
  R('image.canvasSize', () => openCanvasSizeDialog(), hasDoc);
  R('image.generativeUpscale', () => false, () => false, { why: () => '生成式放大依赖 Photoshop 的生成式 AI 模型；当前本地版本没有对应模型' });
  

  
  R('image.rotate90cw', () => { runLazy(QUADW, '旋转画布', () => rotateCanvas(90, '顺时针旋转 90 度')); }, inPreview);
  R('image.rotate90ccw', () => { runLazy(QUADW, '旋转画布', () => rotateCanvas(-90, '逆时针旋转 90 度')); }, inPreview);
  R('image.rotate180', () => { runLazy(QUADW, '旋转画布', () => rotateCanvas(180, '旋转 180 度')); }, inPreview);
  R('image.rotateArbitrary', async () => {
    const s0 = await promptDialog('把整幅画布旋转任意角度（正数 = 顺时针；画布会扩到外接矩形，露出的四角为空）。',
      '0', { title: '旋转画布', label: '角度（度）' });
    if (s0 === null) return false;
    const v = Number(s0);
    if (!Number.isFinite(v)) { $('#notice').textContent = '角度要是一个数。'; return false; }
    return runLazy(QUADW, '旋转画布', () => rotateCanvas(v, '旋转画布'));
  }, inPreview);
  R('image.flipH', () => { flipCanvas('x'); }, inPreview);
  R('image.flipV', () => { flipCanvas('y'); }, inPreview);
  R('image.trim', () => { trimCanvasDialog(); }, inPreview);
  R('image.revealAll', () => { runLazy(QUADW, '显示全部', () => revealAllCanvas()); }, inPreview);
  R('image.duplicate', () => { DOCS.duplicateImage(); }, () => inPreview() && !docStack.length, { why: () => '先回到顶层文档（智能对象内部不能复制成新文档）' });
  


  R('image.applyImage', () => { applyImageDialog(); }, () => hasLayer() && !filterGuard(), { why: () => filterGuard() || '先选一个像素图层' });

  
  R('file.layersToFiles', () => { exportLayersToFiles(); }, hasDoc);
  R('file.artboardsToFiles', () => { exportArtboardsToFiles(); }, () => hasDoc() && docArtboards().length > 0, { why: () => '这个文档里没有画板' });
  R('layer.smart.exportContents', () => exportSmartContents(), () => hasLayer() && sos.some(so => matchLayer(so) === selLayer && so.sourceImage && so.sourceImage.bytes));
  R('help.shortcuts', () => openShortcutSheet({ onEdit: () => actions.run('edit.keyboardShortcuts') }));
  R('help.systemInfo', () => { systemInfoDialog(); });
  R('help.gpuCompat', () => { gpuCompatDialog(); });
  R('view.proof.protanopia', () => setProofSim('protan'), hasDoc, { checked: () => proofSim === 'protan' });
  R('view.proof.deuteranopia', () => setProofSim('deutan'), hasDoc, { checked: () => proofSim === 'deutan' });
  R('view.show.selectionEdges', () => { set_selEdgesOn(!selEdgesOn); drawGizmo(); }, hasDoc, { checked: () => selEdgesOn });
  R('layer.newArtboard', () => { newArtboardDialog(); }, () => hasDoc() && !li && !artboardWriteWhy(), { why: () => artboardWriteWhy() });
  R('layer.artboardFromLayers', () => { artboardFromLayersUI(); }, () => hasLayer() && !artboardWriteWhy(), { why: () => artboardWriteWhy() });
  R('layer.frameFromLayers', () => { createFrameFromLayerUI(selLayer); }, () => hasLayer() && !frameWhy(), { why: () => frameWhy() });
  R('layer.artboardFromGroup', () => { artboardFromLayersUI(); }, () => hasLayer() && !artboardWriteWhy()
    && [1, 2].includes(layerTree?.flat?.[selLayer]?.groupType), { why: () => '先选中一个图层组' });
  R('layer.frameFromGroup', () => { createFrameFromLayerUI(selLayer); }, () => hasLayer() && !frameWhy()
    && [1, 2].includes(layerTree?.flat?.[selLayer]?.groupType), { why: () => '先选中一个图层组' });
  

  R('layer.backgroundFromLayer', () => { if (isBackgroundLayer(selLayer)) unlockBackground(selLayer); else backgroundFromLayerUI(); },
    () => hasLayer() && (isBackgroundLayer(selLayer) || !layerTree.flat.some((l, i) => isBackgroundLayer(i))), { why: () => '文档里已经有背景图层了（选中背景层可以把它转成普通图层）' });
  R('view.flipH', () => { set_viewFlip(!viewFlip); applyPan(); drawGizmo(); shell.status(viewFlip ? '视图已水平翻转（只翻显示，不改像素）' : '视图翻转已还原'); }, hasDoc, { checked: () => viewFlip });
  R('layer.rasterize.style', () => { bakeLayerStyleUI(selLayer, false); }, () => hasLayer() && !li && liveFxEntries(selLayer).length > 0, { why: () => '这一层没有启用着的图层样式' });
  
  for (const [id, run, en, extra] of CM.commands) R(id, run, en, extra || {});
  
  

  const txpCtx = {
    R, shell, panels, formDialog, inPreview, hasDoc,
    selLayer: () => (textOverlay ? textOverlay.idx : selLayer), isTextLayer, textInfoOf, applyTextStyle, renderProps,
    
    icon, hasUiIcon, pickFont: (anchor, ps) => openFontPopover(anchor, ps),
    fontStyles: ps => { const rec = sysFontByPs(ps); const fam = rec ? fontFamilies().find(f => f.family === rec.family) : null; return fam ? fam.styles.map(x => ({ ps: x.postscriptName, style: x.style })) : []; },
    caret: () => (textOverlay ? [textOverlay.ta.selectionStart || 0, textOverlay.ta.selectionEnd || 0] : null),
    select: (a, b) => { if (textOverlay) try { textOverlay.ta.setSelectionRange(a, b); } catch {} },
    readSheetsFromFile: async f => { const t = parseLayerTree(await f.arrayBuffer()); const L = (t.flat || []).find(x => x && x.text && x.text.engineData); return L ? readStyleSheets(L.text.engineData) : null; },
    setFont: async (i, ps) => { const r = await resolveFont(ps); if (!r || !r.ok) { shell.status(`本机没有字体「${ps}」，样式里的字体没套上`); return false; } return applyTextFont(i, { css: r.css, psName: ps, family: r.family, style: r.style }); },
    sheets: () => textSheets(), setSheets: (v, label) => setTextSheets(v, label),
    ptFactor: () => (selLayer >= 0 && isTextLayer(selLayer) ? textPtFactor(selLayer) : (docResolution || 72) / 72),
    toolFontPs: () => (textToolFont && textToolFont.psName) || null,
    cssFor: async ps => { const r = await resolveFont(ps); return r && r.ok ? r.css : null; },
    fontBytes: ps => fontBytesFor(ps), fontName: ps => fontDisplayName(ps),
    insertText: s2 => textInsertAtCaret(s2),
    toolDefaults: () => ({ ...textToolOpts, font: textToolFont ? { ...textToolFont } : null }),
    setToolDefaults: d => { for (const k of ['sizePt', 'color', 'align', 'aa']) if (d[k] != null) textToolOpts[k] = d[k]; if (d.font && d.font.psName) set_textToolFont(d.font); syncTextBar(); },
  };
  
  const cppCtx = {
    R, shell, panels, actions, formDialog, alertDialog, confirmDialog, promptDialog, icon, hasUiIcon, startScrub, inPreview, hasDoc,
    target: () => { const i = textOverlay ? textOverlay.idx : selLayer; return !docTool.startsWith('textMask') && isTextLayer(i) ? i : -1; },
    editing: () => !!textOverlay, textInfoOf,
    caret: () => (textOverlay ? [textOverlay.ta.selectionStart || 0, textOverlay.ta.selectionEnd || 0] : null),
    select: (a, b) => { if (textOverlay) try { textOverlay.ta.setSelectionRange(a, b); } catch {} }, applyTextStyle, applyTextDesc, effTextDesc, ptFactor: i => textPtFactor(i),
    toolOpts: () => textToolOpts, setToolOpts: patch => { Object.assign(textToolOpts, patch); maskEditRelayout(); syncTextBar(); },
    toolFont: () => textToolFontPs(), setToolFont: r => { set_textToolFont(r); maskEditRelayout(); syncTextBar(); },
    fontOf: i => selFontPs(i), fontName: ps => fontDisplayName(ps), openFontPopover, applyTextFont,
    fontStyles: ps => { const rec = sysFontByPs(ps); const fam = rec ? fontFamilies().find(f => f.family === rec.family) : null; return fam ? fam.styles.map(x => ({ ps: x.postscriptName, style: x.style })) : []; },
    fontChoice: async ps => { const rec = sysFontByPs(ps); return rec ? fontChoiceOf(rec) : null; },
    loadFonts: () => loadSystemFonts({ gesture: true }),
    opticalKernReady: ps => opticalKernReady(ps), antiAliasModes: () => ANTI_ALIAS_MODES.map(([, v, l]) => [v, aaLabel(v, l)]),
    orientation: i => effTextDesc(i, 'orientation') || 'horizontal',
    sheets: () => textSheets(), setSheets: (v, label) => setTextSheets(v, label),
    runAction: (id, ...a) => actions.run(id, ...a), isMac: () => isMacUI,
  };
  let textPanelsP = null;
  const loadTextPanels = () => textPanelsP || (textPanelsP = Promise.all([import('../text-panels.js'), import('../char-para-panels.js')])
    .then(([tp, cp]) => { set_TXP(tp.installTextPanels(txpCtx)); set_CPP(cp.installCharParaPanels(cppCtx)); try { renderProps(); } catch {} })
    .catch(e => { textPanelsP = null; console.warn('[字符 / 段落面板] 代码包没载入', e); }));
  addDocGate(loadTextPanels);
  whenIdle(loadTextPanels, 2000);
  
  let lxErase = false;
  set_LX(installLayersMore({
    R, shell, $, actions, gizmo, inPreview,
    st: () => ({ doc, layerTree, selLayer, selLayers, origBuffer, sos, li, docW, docH, docName, docStack, layerDeletes, soInside, soFilters, docTool }),
    setSel(i, multi){ set_selLayer(i); selLayers.clear(); if (multi && multi.length > 1) for (const k of multi) selLayers.add(k); renderLayerPanel(); renderProps(); drawGizmo(); },
    structural: lxStructural,
    pushDocHistory: label => pushDocHistory(label),
    engineOK: () => engineOK,
    decodeImageFile, isBackgroundLayer, rasterKindOf, frameWhy, toDoc, createFrameFromLayer: createFrameFromLayerUI,
    isShapeLayer: i => !!(doc && doc.layers[i] && isShapeLayer(doc.layers[i])),
    layerName: i => layerRenames[i] || (layerTree.flat[i] && layerTree.flat[i].name) || ('图层 ' + i),
    layerBlend: i => (layerEdits[i] && layerEdits[i].blendKey) || (doc.layers[i] && doc.layers[i].blendMode) || 'norm',
    layerBBox: i => layerSelBBox(i),
    rectSubpath: (x, y, w, h) => roundRectSubpath(x, y, w, h, [0, 0, 0, 0]),
    brush: () => ({ size: brush.size, hardness: brush.hardness, opacity: brush.opacity, flow: brush.flow }),
    paintGray: () => { const c = lxErase ? bgRGB : fgRGB; return Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]); },
    setEraseColor: on => { lxErase = !!on; },
    dialogs: { promptDialog, choiceDialog, confirmDialog, formDialog, alertDialog },
    ui: { renderLayerPanel, renderProps, drawGizmo, renderPreviewOnly,
      refresh: () => { renderPreviewOnly(); renderLayerPanel(); renderProps(); updateUndoButtons(); },
      showProps: (i, tab) => { set_selLayer(i); set_propTab(tab === 'character' ? 'character' : 'layer'); syncPropTabs(); revealPropsPanel(); renderProps(); } },
    so: { matchLayer, soRenderImage, bakeSO, openInside, setLayerRaster: lxSetLayerRaster },
    sf: { smartFilterInfo, soFilterEdits, filterPost, fragmentToJSON, b64ToU8 },
    sfx: { rerenderOp: (...a) => (SFX ? SFX.rerenderOp(...a) : null) },
  }));
  
  set_SFX(installSmartFilterEdit({
    st: () => ({ doc, layerTree, selLayer, origBuffer, sos, docW, docH, li }),
    structural: lxStructural,
    baseBuffer: async () => {
      if (li || !doc || !origBuffer) return null;
      if (!await ensureLazy(EDIT, '智能滤镜')) return null;
      if (textOverlay) closeInlineText(true);
      let base = await ensureStructuralBase(origBuffer);
      if (hasAnyEdits()) base = (await buildPsdBuffer({ fast: true })).buf;
    base = await ensureStructuralBase(base);
      return { base, map: i => builtIndexOf(i) };
    },
    so: { matchLayer, soRenderImage, setLayerRaster: lxSetLayerRaster },
    sourceImage: k => LX.soSourceImage(k),
    engineOK: () => engineOK,
    layerName: i => layerNameOf(i),
    fg: () => fgRGB.slice(0, 3), bg: () => bgRGB.slice(0, 3),
    gallery: { getPatterns: galleryPatterns, decodeFile: galleryDecodeFile },
    err: t => { $('#err').textContent = t; }, note: t => { $('#notice').textContent = t; }, status: t => shell.status(t),
    ui: { refresh: () => { renderPreviewOnly(); renderLayerPanel(); renderProps(); } },
  }));
  
  set_LB(installLayerB({
    R, shell, panels, actions, formDialog, alertDialog, confirmDialog, promptDialog, choiceDialog,
    makeZip, canvasToBlob, decodeImageFile, toolDataAPI: () => toolDataAPI,
    hasDoc: () => inPreview(),
    st: () => ({ doc, docW, docH, docName, origBuffer, selection, measureLine, layerTree, li }),
    docName: () => docName || '未标题', resolution: () => docResolution || readResolution(origBuffer) || 72,
    download: (name, blob) => { const url = URL.createObjectURL(blob); downloadDataURL(url, name); setTimeout(() => URL.revokeObjectURL(url), 8000); },
    status: t => shell.status(t),
    
    layers: () => { if (!doc) return []; const v = layerOrderView(); return v.visible.filter(i => doc.layers[i] && !layerDeletes.has(i)).map(i => ({ i, key: lbKeyOf(i), name: layerNameOf(i), isGroup: !!v.nodes[i]?.group, isBg: isBackgroundLayer(i), isText: isTextLayer(i) })); },
    keyOf: i => lbKeyOf(i), indexOfKey: k => lbIndexOfKey(k),
    layerState: i => { const l = doc.layers[i] || {}, t = getTransformValues(i), n = (layerTree && layerTree.flat && layerTree.flat[i]) || {}, ed = layerEdits[i] || {};
      return { v: !l.hidden, x: t.x, y: t.y, w: t.w, h: t.h, op: ed.opacity != null ? ed.opacity : (l.opacity != null ? l.opacity : 255), bm: ed.blendKey || l.blendMode || 'norm', fo: effFillOpacity(i, n) }; },
    base: i => transformBase(i), pos: i => { const t = getTransformValues(i); return { x: t.x, y: t.y }; },
    setVisible: (i, v) => setLayerVisible(i, v), setPos: (i, x, y) => setLayerPos(i, x, y),
    setOpacity: (i, v) => setLayerOpacity(i, v), setBlend: (i, k) => setLayerBlend(i, k),
    setFill: (i, v) => { const n = (layerTree && layerTree.flat && layerTree.flat[i]) || {}; return setSingleOp(i, { op: 'setFillOpacity', index: i, fillOpacity: v }, v === (n.fillOpacity != null ? n.fillOpacity : 255)); },
    selected: () => selLayers.size ? [...selLayers] : selLayer >= 0 ? [selLayer] : [],
    select: idx => { set_selLayer(idx[0]); selLayers.clear(); if (idx.length > 1) for (const i of idx) selLayers.add(i); },
    history: label => pushDocHistory(label), histLock: on => { set_docHistLock(!!on); },
    dropHistory: () => { docHistory.undo.pop(); docHistory.redo.length = 0; if (histLog.items.length > 1) { histLog.items.pop(); histLog.cursor = histLog.items.length - 1; } syncHistoryPanel(); updateUndoButtons(); },
    snapshot: () => docSnapshot(), restore: sn => restoreDocSnapshot(sn),
    refresh: () => { try { renderStaticLayers(); syncLayerControls(); renderLayerPanel(); renderProps(); drawGizmo(); updateUndoButtons(); } catch {} },
    settle: () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))),
    
    compositeCanvas: () => { const c = document.createElement('canvas'); c.width = docW; c.height = docH;
      paintLayersExport(c.getContext('2d'), displayOrder()); return c; },
    exportPsdBytes: () => actExportBytes('psd'), exportBytes: (f, q) => actExportBytes(f, q),
    artboards: () => docArtboards(),
    
    textOf: i => { const L = layerTree && layerTree.flat && layerTree.flat[i]; return L && L.text ? dispTextOf(i, L) : null; },
    setText: async (i, t) => { const L = layerTree.flat[i]; if (!L || !L.text) return false; if (t && t !== L.text.content) layerTextEdits[i] = t; else if (!t) return false; else delete layerTextEdits[i]; return renderTextLayer(i, L, { silent: true }); },   
    replacePixels: (i, drawFn, o) => lbReplacePixels(i, drawFn, o), pixelBackup: i => lbPixelBackup(i),
    isPixelLayer: i => { const l = doc.layers[i], n = layerTree && layerTree.flat && layerTree.flat[i]; return !!l && !isTextLayer(i) && !(n && (n.adjustment || n.isGroup || n.isSmartObject)) && !isShapeLayer(l) && !!l.rgba; },
    layerPixels: i => layerVisiblePixels(i), pixelsToCanvas,
    
    addNotes: notes => lbAddNotes(notes),
    rulerMetrics: () => (measureLine ? rulerMetrics() : null),
    countGroups: () => { try { return countGroups(); } catch { return []; } },
    composite: () => { try { return sampleRGBA(true); } catch { return null; } },
    drawGizmo: () => drawGizmo(), syncAuxBar: () => syncAuxBar(),
    fonts: () => lbFontList(),
    openFile: async f => { const ok = isImageFileName(f) ? await openImageAsDocument(f) : (await loadPsd(f), !$('#err').textContent); return ok !== false && !!doc; },
    tool: () => docTool, newLayer: name => createLayerUI({ name }), selectTool: id => tools.select(id),
    groupBlock: i => { const n = layerOrderView().nodes[i]; return n && n.block ? n.block.ids.slice() : [i]; },
  }));
  
  addDocGate(() => LB.loadExtras());
  whenIdle(() => { LB.loadExtras().catch(e => console.warn('[图层复合 / 变量] 代码包没载入', e)); }, 3000);
  
  const lpTargets = () => (selLayers.size > 1 ? [...selLayers] : selLayer >= 0 ? [selLayer] : []);
  set_LP(installLayersPanel({
    R, status: t => shell.status(t), inPreview, dialogs: { promptDialog, choiceDialog, confirmDialog, formDialog, alertDialog },
    st: () => ({ doc, layerTree, selLayer, selLayers, li, docW, docH, layerEdits, layerDeletes, selection }),
    view: () => layerOrderView(), collapsedGroups: () => collapsedGroups,
    isPreviewCanvas: cv => { try { return cv === viewScratch.get('#below'); } catch { return false; } },
    layerName: i => layerNameOf(i), nextLayerName: () => nextLayerName('图层'),
    setThumbBox: n => { if (THUMB_BOX === n) return; set_THUMB_BOX(n); for (const k in thumbCache) delete thumbCache[k]; for (const k in maskThumbCache) delete maskThumbCache[k]; },
    ui: { renderLayerPanel, renderProps, renderPreviewOnly: () => renderPreviewOnly(),
      refresh: () => { renderStaticLayers(); syncLayerControls(); renderLayerPanel(); renderProps(); updateUndoButtons(); },
      showProps: i => { set_selLayer(i); set_propTab('layer'); syncPropTabs(); revealPropsPanel(); renderProps(); } },
    blendKeys: BLEND_KEYS, blendLabels: BLEND_LABELS,
    effClipping, effLock, effColorLabel, effKnockout, isShapeLayer: i => !!(doc && doc.layers[i] && isShapeLayer(doc.layers[i])), isTextLayer,
    fxItems: (i, l) => layerFxItems(i, l), fxMaster: i => effFxMaster(i, fxMasterBase(i)),
    setFxMaster: (i, on) => setSingleOp(i, { op: 'setLayerEffectsEnabled', index: i, enabled: on }, on === fxMasterBase(i)),
    fxHideLabel: () => { const L0 = doc && selLayer >= 0 && layerTree.flat[selLayer]; return L0 && !effFxMaster(selLayer, fxMasterBase(selLayer)) ? '显示所有效果' : '隐藏所有效果'; },
    openStyle: (i, focus) => openLayerStyleDialog(i, focus),
    dynLabel: k => (LX ? LX.dynLabel(k) : undefined), LX: () => LX, linkedOf: i => (LX ? LX.linkedOf(i) : []), isolated: () => !!(LX && LX.isolated),
    artboards: () => docArtboards(), hasPendingMask: i => !!(maskPaint[i] || maskStructOp(i)),
    textShapeLabel: i => (effTextShape(i) === 'box' ? '转换为点文本' : '转换为段落文本'),
    maskOffLabel: i => { const L0 = layerTree && layerTree.flat[i]; return L0 && L0.mask && effMaskFlag(i, L0, 'disabled') ? '启用图层蒙版' : '停用图层蒙版'; },
    vmaskOffLabel: i => { const p = doc && doc.layers[i] && doc.layers[i].vectorMask, d = opField(i, 'setVectorMaskFlags', 'disable'); return (d !== undefined ? d : !!(p && p.disable)) ? '启用矢量蒙版' : '停用矢量蒙版'; },
    canLoadLayerSelection, loadLayerSel: (i, mode) => loadLayerAlphaAsSelectionLazy(i, mode),
    maskGray: i => {                               
      const mp = maskPaint[i]; if (!mp) return maskGrayOnCanvas(i);
      const dl = doc && doc.layers[i], m = dl && dl.mask; if (!dl) return null;
      const opI = opField(i, 'setMaskProps', 'invert'), inv = opI !== undefined ? opI : !!(m && m.invert);
      const def = m && m.defaultColor != null ? m.defaultColor : (mp.orig && mp.orig.length ? mp.orig[0] : 255);
      const out = new Uint8Array(docW * docH).fill(inv ? 255 - def : def);
      for (let y = 0; y < mp.h; y++) { const dy = mp.docTop + y; if (dy < 0 || dy >= docH) continue;
        for (let x = 0; x < mp.w; x++) { const dx = mp.docLeft + x; if (dx < 0 || dx >= docW) continue; const v = mp.gray[y * mp.w + x]; out[dy * docW + dx] = inv ? 255 - v : v; } }
      return out;
    },
    graySelection: (gray, mode, label) => graySelectionUI(gray, mode, label),
    loadVectorSel: (i, mode) => { const subs = effPathSubpaths(i); if (!subs || !subs.length) { $('#notice').textContent = '这一层的矢量蒙版里没有路径。'; return false; }
      const img = rasterizeSubpaths(subs, { anti: true }), g = new Uint8Array(docW * docH); for (let k = 0; k < g.length; k++) g[k] = img[k * 4 + 3];
      return runLazy(SELECT, '载入矢量蒙版选区', () => combineInto(createSelection(docW, docH, 0, 0, docW, docH, g), selection ? (mode || 'replace') : 'replace')); },
    maskSelectAndMask: i => maskSelectAndMask(i),
    selectOnly: i => { set_selLayer(i); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo(); },
    pushDocHistory: label => pushDocHistory(label),
    createLayer: o => createLayerUI(o),
    newGroup: () => newGroupUI(), groupFromLayers: () => groupSelectedUI(),
    setClipping: (i, on) => { const L0 = layerTree.flat[i]; setOpField(i, { op: 'setLayerProps' }, 'clipping', on, !!L0.clipping); if (doc.layers[i]) doc.layers[i].clipping = on ? 1 : 0; renderStaticLayers(); },
    setColorLabel: (i, c, hist) => { const L0 = layerTree && layerTree.flat[i]; if (!L0) return false; if (hist) pushDocHistory('图层颜色'); return setSingleOp(i, { op: 'setLayerColorLabel', index: i, color: c }, c === (L0.colorLabel || 0)); },
    rename: (i, nm) => { layerRenames[i] = nm; }, setBlend: (i, k) => setLayerBlend(i, k), setOpacity: (i, v) => setLayerOpacity(i, v),
    duplicateDialog: () => DOCS.duplicateLayerDialog(),
    dragRow: () => dragRowIndex, duplicate: i => duplicateLayerUI(i), moveLayerTo: (a, b, after, into) => moveLayerTo(a, b, after, into),
    liveValue: (kind, pct) => {
      if (kind === 'opacity') { for (const i of lpTargets()) setLayerOpacity(i, Math.round(pct * 2.55)); return; }
      withFastCommit(() => { for (const i of lpTargets()) { const L0 = layerTree.flat[i]; if (!L0) continue; const o = L0.fillOpacity != null ? L0.fillOpacity : 255, v = pct === Math.round(o / 2.55) ? o : Math.round(pct * 2.55); setSingleOp(i, { op: 'setFillOpacity', index: i, fillOpacity: v }, v === o); } });
    },
    endLiveValue: kind => { if (kind === 'fill') { const f = $('#hdrFill'); if (f) f.dispatchEvent(new Event('change')); } syncLayerControls(); renderProps(); },
  }));
  

  const tlCtx = { ...LB.ctx,
    hasFx: i => !!(doc && doc.layers[i] && doc.layers[i].effects),
    fxOn: i => effFxMaster(i, fxMasterBase(i)),
    setFxOn: (i, v) => setSingleOp(i, { op: 'setLayerEffectsEnabled', index: i, enabled: !!v }, !!v === fxMasterBase(i)),
    

    fxParams: i => {
      const p = layerParams(i);
      const tg = p && !p.error && p.effects && p.effects.targets;
      if (!tg || !tg.length) return null;
      const out = {};
      for (const t of tg) {
        if (!t.target.startsWith('effect:')) continue;
        for (const f of t.fields || []) {
          if (!f.editable || f.value === undefined || f.value === null) continue;
          if (typeof f.value !== 'number' && typeof f.value !== 'boolean' && typeof f.value !== 'string') continue;
          out[`${t.target}@${t.at || 0}@${f.path}`] = effParam(i, t.target, t.at || 0, f.path, f.value);
        }
      }
      return Object.keys(out).length ? out : null;
    },
    setFxParams: (i, map) => {
      const p = layerParams(i);
      const tg = p && !p.error && p.effects && p.effects.targets;
      if (!tg || !map) return;
      const groups = new Map();
      for (const t of tg) {
        if (!t.target.startsWith('effect:')) continue;
        for (const f of t.fields || []) {
          const k = `${t.target}@${t.at || 0}@${f.path}`;
          if (!(k in map)) continue;
          const gk = `${t.target}@${t.at || 0}`;
          if (!groups.has(gk)) groups.set(gk, { target: t.target, at: t.at || 0, entries: [] });
          groups.get(gk).entries.push([f.path, map[k], f.value]);
        }
      }
      for (const g of groups.values()) setParamFieldsBatch(i, g.target, g.at, g.entries);
    },
    quiet: on => { set_uiQuiet(Math.max(0, uiQuiet + (on ? 1 : -1))); },
    repaint: () => { try { renderStaticLayers(); renderLayerPanel(); drawGizmo(); } catch {} },
  };
  let timelineP = null;
  const loadTimeline = () => timelineP || (timelineP = import('../timeline-panel.js').then(m => { m.installTimeline(tlCtx); }).catch(e => { timelineP = null; console.warn('[时间轴] 代码包没载入', e); }));
  actions.registerLazy(['timeline.createFrameAnimation', 'timeline.play', 'timeline.nextFrame', 'timeline.prevFrame', 'timeline.firstFrame',
    'timeline.newFrame', 'timeline.deleteFrames', 'timeline.tween', 'file.exportAnimation', 'file.renderVideo', 'file.videoFrames'],
    loadTimeline, { enabled: () => false, why: () => '先打开一个文档' });
  addDocGate(loadTimeline);
  whenIdle(loadTimeline, 3000);
  

  const stitchCtx = {
    status: t => shell.status(t), formDialog, alertDialog, makeZip, decodeImage: f => decodeImageFile(f),
    resolution: () => docResolution || 72,
    st: () => ({ doc, layerTree, selLayer, selLayers, docW, docH, li }),
    rasterWhy: i => { const k = rasterKindOf(i); const L = layerTree && layerTree.flat[i];
      return k === 'text' ? '文字图层' : k === 'smart' ? '智能对象' : k === 'shape' ? '形状图层' : k === 'fill' ? '填充图层' : (L && L.adjustment) ? '调整图层' : ''; },
    layerName: i => layerRenames[i] || (layerTree.flat[i] && layerTree.flat[i].name) || ('图层 ' + i),
    isBackground: i => isBackgroundLayer(i),
    lockedPosition: i => { const L = layerTree && layerTree.flat[i]; return !!(L && (effLock(i, L, 'lockAll', 'all') || effLock(i, L, 'lockPosition', 'position'))); },
    structural: lxStructural,
    openPsdBuffer: async (buf, name) => {
      const dtk = await DOCS.beginOpen(); if (!dtk) return false;
      try { docStack.length = 0; await initDocument(buf, name + '.psd', { nested: false }); refreshAll(true); } catch (e) { DOCS.abortOpen(dtk); throw e; }
      DOCS.endOpen(dtk); return true;
    },
    selectLayer: i => { set_selLayer(i); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo(); },
    settle: waitIdle,
    download: (name, blob) => { const url = URL.createObjectURL(blob); downloadDataURL(url, name); setTimeout(() => URL.revokeObjectURL(url), 8000); },
  };
  let stitchP = null;
  const loadStitch = () => stitchP || (stitchP = import('../stitch.js').then(m => { m.installStitch(stitchCtx); }).catch(e => { stitchP = null; shell.status('拼接类命令没能载入：' + (e && e.message || e)); }));
  actions.registerLazy(['edit.autoAlign', 'edit.autoBlend', 'file.photomerge', 'file.mergeHdr', 'file.loadStack', 'file.statistics', 'file.lensCorrectionBatch'],
    loadStitch, { enabled: () => true });

  


  const prefCtx = {
    saveHistoryLog: () => { if (!histSessionLog.length) { shell.status('历史记录日志是空的（先勾上「历史记录日志」再做几步编辑）'); return; } saveHistoryLogText(); },
    gpuName: () => { const g = gpuStatus(); if (g.name) return g.name + (g.on ? '（WebGPU 合成中）' : g.why ? '（' + g.why + '）' : ''); try { const c = document.createElement('canvas'), gl = c.getContext('webgl'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : (gl ? 'WebGL（型号不公开）' : '无 WebGL')) + (g.why ? '（WebGPU：' + g.why + '）' : ''); } catch { return '（未知）'; } },
    storageQuota: async () => { try { const e = await navigator.storage.estimate(); return `已用 ${(e.usage / 1048576).toFixed(0)} MB / 配额 ${(e.quota / 1073741824).toFixed(1)} GB`; } catch { return '浏览器不公开'; } },
  };
  for (const [id, page] of Object.entries(PREF.PAGE_OF_ACTION)) R(id, () => { PREF.openPreferences(page, prefCtx); });
  const unitPx = (v, u) => u === 'pct' ? docW * v / 100 : (RULER_UNITS[u] ? v * RULER_UNITS[u].per() : v);
  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(120,120,120,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  set_hexAlpha(hexA);
  let tipsOff = false;
  
  function applyPrefs(changed){
    const P = PREF.all(), has = k => !changed || changed.some(c => c === '*' || c === k || c.startsWith(k + '.'));
    if (has('tools.shiftToolSwitch')) tools.setShiftSwitch(P.tools.shiftToolSwitch !== false);
    if (changed && has('performance.gpu')) gpuApplyPref();
    if (has('guides')) {
      gridOpts.every = Math.max(1, unitPx(+P.guides.gridEvery || 64, P.guides.gridUnit || 'px'));
      gridOpts.sub = Math.max(1, +P.guides.gridSub || 4);
      gridOpts.color = hexA(P.guides.gridColor, .75);
      pathLook.color = P.guides.pathColor || pathLook.color; pathLook.width = +P.guides.pathWidth || pathLook.width;
    }
    if (has('units.rulers') && RULER_UNITS[P.units.rulers] && rulerUnit !== P.units.rulers) { set_rulerUnit(P.units.rulers); syncRulers(); }
    if (has('transparency')) {
      const m = /^#?([0-9a-f]{6})$/i.exec(P.transparency.gamutColor || '');
      if (m) { const n = parseInt(m[1], 16); try { CM.setGamutWarning([n >> 16, (n >> 8) & 255, n & 255], P.transparency.gamutOpacity); } catch {} }
      set_cropChecker(null);
    }
    if (has('history.states')) { histTrim(); updateUndoButtons(); syncHistoryPanel(); }
    if (has('type.fontPreview') && P.type.fontPreview !== fontPreviewSize) setFontPreviewSize(P.type.fontPreview);
    if (has('file.recentCount')) RECENT.setLimit(() => +PREF.get('file.recentCount') || 0);
    if (has('tools.showTooltips')) {
      
      tipsOff = P.tools.showTooltips === false;
      if (!tipsOff) for (const el of document.querySelectorAll('[data-fp-tip]')) { el.title = el.dataset.fpTip; delete el.dataset.fpTip; }
    }
    try { syncGizmoCursor(); } catch {}
    if (doc) { try { drawGizmo(); } catch {} }
  }
  document.addEventListener('mouseover', e => {
    if (!tipsOff) return;
    for (let el = e.target; el && el.nodeType === 1; el = el.parentElement) if (el.title) { el.dataset.fpTip = el.title; el.removeAttribute('title'); }
  }, true);
  PREF.onChange((p, changed) => applyPrefs(changed));
  applyPrefs(null);
  
  for (const [id] of FONT_PREVIEW_SIZES) R('type.preview.' + id, () => { setFontPreviewSize(id); PREF.set({ type: { fontPreview: id } }, { quiet: true }); }, () => true, { checked: () => fontPreviewSize === id });

  
  RECENT.load().then(() => {});
  menu.setRecentProvider(() => RECENT.items().map(x => ({ id: x.id, label: x.name + (x.stored ? '' : '（未留副本）') })));
  R('file.openRecent', async id => {
    const f = await RECENT.get(id);
    if (!f) { shell.status('这个文件太大（或存储被清掉了），没有留副本：请用「打开…」重新选一次'); return; }
    isImageFileName(f) ? await openImageAsDocument(f) : await loadPsd(f);
  });
  R('file.clearRecent', () => { RECENT.clear(); shell.status('已清除最近的文件列表'); }, () => RECENT.items().length > 0);

  
  const tg2 = (id, get, set, label, en = hasDoc) => R(id, () => { set(!get()); drawGizmo(); shell.status(`${label}：${get() ? '开' : '关'}`); }, en, { checked: get });
  tg2('view.show.artboardGuides', () => artboardGuidesOn, v => { set_artboardGuidesOn(v); }, '画板参考线');
  R('view.clearArtboardGuides', () => {
    const a = docArtboards()[abSel]; if (!a) return;
    const n = guides.length; set_guides(guides.filter(g => g.ab !== a.index));
    if (guides.length !== n) { set_guidesDirty(true); drawGizmo(); shell.status(`已清除画板「${a.name}」的 ${n - guides.length} 条参考线`); }
  }, () => hasDoc() && abSel >= 0 && !!docArtboards()[abSel] && guides.some(g => g.ab === docArtboards()[abSel].index), { why: () => '先用画板工具选中一块画板（它上面要有画板参考线）' });
  tg2('view.show.count', () => countVisible, v => { set_countVisible(v); }, '计数');
  tg2('view.show.notes', () => notesVisible, v => { set_notesVisible(v); }, '注释');
  tg2('view.show.editPins', () => editPinsOn, v => { set_editPinsOn(v); }, '编辑图钉');
  tg2('view.show.brushPreview', () => brushPreviewOn, v => { set_brushPreviewOn(v); }, '画笔预览', () => true);
  
  R('view.show.all', () => { gridOpts.on = true; set_layerEdgesOn(true); set_selEdgesOn(true); set_pixelGridOn(true); set_smartGuidesOn(true); set_guidesVisible(true); sliceOpts.show = true; set_artboardGuidesOn(set_countVisible(set_notesVisible(set_editPinsOn(set_brushPreviewOn(true))))); drawGizmo(); }, hasDoc);
  R('view.show.none', () => { gridOpts.on = false; set_layerEdgesOn(false); set_selEdgesOn(false); set_pixelGridOn(false); set_smartGuidesOn(false); set_guidesVisible(false); sliceOpts.show = false; set_artboardGuidesOn(set_countVisible(set_notesVisible(set_editPinsOn(set_brushPreviewOn(false))))); drawGizmo(); }, hasDoc);
  
  snapTo.slices = true;
  R('view.snapTo.slices', () => { snapTo.slices = !snapTo.slices; shell.status('对齐到切片：' + (snapTo.slices ? '开' : '关')); }, () => hasDoc() && sliceOpts.show, { checked: () => snapTo.slices && sliceOpts.show, why: () => '先显示切片（视图 › 显示 › 切片）' });

  
  const PAR_PRESETS = [['square', '方形', 1], ['ntsc', 'D1/DV NTSC (0.91)', 0.91], ['pal', 'D1/DV PAL (1.09)', 1.09], ['ntscWide', 'D1/DV NTSC 宽银幕 (1.21)', 1.21],
    ['hdv', 'HDV 1080/DVCPRO HD 720 (1.33)', 1.33], ['palWide', 'D1/DV PAL 宽银幕 (1.46)', 1.46], ['anamorphic', '变形 2:1 (2)', 2], ['dvcpro', 'DVCPRO HD 1080 (1.5)', 1.5]];
  let parCustom = []; try { parCustom = JSON.parse(localStorage.getItem('psd_editor.parCustom') || '[]') || []; } catch {}
  const saveParCustom = () => { try { localStorage.setItem('psd_editor.parCustom', JSON.stringify(parCustom)); } catch {} syncParMenu(); };
  const setPar = (v, label) => { set_viewPar(v); if (v !== 1 && !viewParCorrect) set_viewParCorrect(true); applyPan(); drawGizmo(); shell.status(`像素长宽比：${label}${v !== 1 ? '（已打开像素长宽比校正显示）' : ''}`); };
  for (const [id, label, v] of PAR_PRESETS) R('view.par.' + id, () => setPar(v, label), hasDoc, { checked: () => Math.abs(viewPar - v) < 1e-6 });
  R('view.parCorrection', () => { set_viewParCorrect(!viewParCorrect); applyPan(); drawGizmo(); shell.status('像素长宽比校正：' + (viewParCorrect ? '开' : '关')); }, () => hasDoc() && viewPar !== 1, { checked: () => viewParCorrect && viewPar !== 1, why: () => '当前是方形像素，没有要校正的' });
  R('view.par.custom', async () => {
    const v = await formDialog('存储像素长宽比', [{ key: 'name', label: '名称', type: 'text', value: '自定' }, { key: 'k', label: '因子', type: 'number', value: viewPar, min: 0.1, max: 10, step: 0.01 }]);
    if (!v || !(+v.k > 0)) return;
    parCustom = parCustom.filter(x => x.name !== v.name).concat([{ name: String(v.name || '自定'), k: +v.k }]); saveParCustom(); setPar(+v.k, v.name);
  }, hasDoc);
  R('view.par.delete', async () => {
    if (!parCustom.length) return;
    const v = await formDialog('删除像素长宽比', [{ key: 'n', label: '像素长宽比', type: 'select', value: parCustom[0].name, options: parCustom.map(x => [x.name, `${x.name} (${x.k})`]) }]);
    if (!v) return; parCustom = parCustom.filter(x => x.name !== v.n); saveParCustom();
  }, () => parCustom.length > 0, { why: () => '没有自定的像素长宽比（预设的删不掉）' });
  R('view.par.reset', async () => { if (!await confirmDialog('要把像素长宽比复位成默认列表吗？自定的会被删除。', { title: '复位像素长宽比' })) return; parCustom = []; saveParCustom(); setPar(1, '方形'); }, () => true);
  function syncParMenu(){
    const v = menu.MENUS.find(m => m.id === 'view'); const par = v && v.items.find(x => x.sub && x.sub.some(y => y.action === 'view.par.square')); if (!par) return;
    par.sub = par.sub.filter(x => !(x.action && x.action.startsWith('view.par.u:')));
    parCustom.forEach((c, i) => {
      const id = 'view.par.u:' + i; R(id, () => setPar(c.k, c.name), hasDoc, { checked: () => Math.abs(viewPar - c.k) < 1e-6 });
      par.sub.push({ label: `${c.name} (${c.k})`, action: id, check: 'radio' });
    });
  }
  syncParMenu();

  for (const id of ['help.account', 'help.signIn', 'help.updates', 'help.aboutPlugins'])
    R(id, () => false, () => false, { why: () => id === 'help.aboutPlugins' ? '没有装载任何增效工具（浏览器版本没有原生插件宿主）' : '不做：Adobe 账号 / 更新服务，浏览器版本本地运行、随页面更新' });

  
  try { installModifierKeys(); } catch (e) { console.warn('[修改键]', e); }
  try { installInfoPanelsWiring(); } catch (e) { console.warn('[信息 / 导航器 / 直方图]', e); }
  {
    const sec = document.querySelector('.panel[data-panel="contentCredentials"]');
    if (sec) sec.innerHTML = '<div class="panel-empty" style="line-height:1.7;padding:10px;opacity:.75">'
      + '<b>内容凭证（C2PA）</b><br>要给导出的文件附加内容凭证，需要：① Adobe（或其它 CA）签发的签名证书与私钥；② 把清单登记到 Adobe 内容凭证云。'
      + '浏览器版本两样都没有，所以这里所有选项置灰。<br><br><label style="opacity:.6"><input type="checkbox" disabled> 启用内容凭证</label><br>'
      + '<label style="opacity:.6"><input type="checkbox" disabled> 导出时附加</label></div>';
  }

  
  installWorkspaces({ status: m => shell.status(m), shortcutEditor: SCE });
  installWindowMenu({ ctx: LB.ctx, toggleCloneSource: () => toggleCloneSrcPanel() });   
  queueMicrotask(() => { try { installShortcutEditor(); } catch (e) { console.warn('[快捷键编辑器]', e); } });
  {
    


    const WHY = [
      [/^file\.(browse|closeToBridge|stock|invite|share|versionHistory)$/, '依赖 Adobe Bridge / Creative Cloud 账号服务，浏览器里没有对应形态'],
      [/^file\.wia$/, 'WIA（Windows 图像采集）要调本机扫描仪 / 相机驱动，浏览器没有这个接口：请先用系统自带的扫描程序存成图片再打开'],   
      [/^file\.(renderVideo|videoFrames)$|^layer\.video\.|^layer\.rasterize\.video$/, '不做（永久）：本编辑器不支持视频图层（时间轴 / 帧）'],
      [/^layer\.rasterize\.3d$/, '不做（永久）：PS 已移除旧版 3D 功能，本编辑器也不支持 3D 图层'],
      
      [/^edit\.(generativeFill|skyReplacement)$|^select\.(sky|focusArea)$|^filter\.neural$/, '不做（永久）：依赖 AI 模型，本编辑器不接 AI（「选择主体」「内容识别填充」有非 AI 的本地算法版）'],
      [/^edit\.pdfPresets$/, 'PDF 预设还没做：本编辑器不导出 PDF'],
      [/^edit\.presetsMigrate$/, '迁移预设要读本机旧版 Photoshop 的预设目录（…/Adobe Photoshop 20xx/Presets），浏览器拿不到本机路径；请在旧版 PS 里导出 .pat / .grd / .csh / .asl / .aco，再用「导出/导入预设…」导入'],
      [/^view\.(par\.|parCorrection)/, '像素长宽比校正是视频工作流用的，本编辑器按方形像素显示'],
      [/^edit\.spellCheck$/, '拼写检查要一套按语言的词典（PS 用 Hunspell，每种语言几百 KB 到几 MB）：浏览器不给网页调用系统拼写词典的接口，内置一份小英文词表只会把专有名词、行业词全标成错词，中文又不需要拼写检查 —— 所以不做。英文文案请在别处校对后粘贴，或用「查找和替换文本…」批量改'],
      [/^edit\.(menus|toolbar|remoteConnections)$|^edit\.preferences\.|^plugins\.|^window\.(exchange|legacyExtensions)$|^help\.(aboutPlugins|account|signIn|updates)$/, '还没做：这是 PS 的应用级设置 / 增效工具 / 账号功能，浏览器版本没有对应项'],
      [/^window\.workspace\./, '面板布局固定，没有工作区切换'],
      [/^edit\.(remoteConnections|spellCheck|contentAwareScale)$|^plugins\.|^window\.(exchange|legacyExtensions)$/, '还没做：这是 PS 的增效工具 / 应用级功能，浏览器版本没有对应项'],
      [/^image\.analysis\.|^tool\.(ruler|count)$/, '测量比例 / 数据点记录还没做（标尺、计数工具在工具栏里）'],
      [/^layer\.(backgroundFromLayer|newArtboard|artboardFromLayers)$|^layer\.rasterize\.style$/, '还没做：这条要改图层记录的结构（背景层身份 / 画板组 / 把效果烤进像素），用对应工具（画板工具、栅格化图层）可以做到'],
      [/^filter\.liquify$/, '还没做：液化是一整套笔刷式的网格变形工作区（向前变形 / 重建 / 褶皱 / 膨胀…），可先用「操控变形」或「变形」'],
    ];
    import('../menu.js').then(({ MENUS }) => {
      const walk = list => { for (const it of list) { if (it.sep) continue; if (it.sub) walk(it.sub); else if (it.action && !actions.has(it.action) && !/^(layer|image)\.adjust\./.test(it.action)) {
        const hit = WHY.find(([re]) => re.test(it.action));
        R(it.action, () => false, () => false, { why: () => hit ? hit[1] : '还没做' });
      } } };
      for (const m of MENUS) walk(m.items);
    }).catch(() => {});
  }
  R('tool.quickMask', () => { toggleQuickMask(); }, () => !!doc && !li, { checked: () => !!qmask });
  R('tool.frame', () => tools.select('frame'), inPreview, { why: () => '没有打开文档' });
  R('tool.quickMaskOptions', () => { openQuickMaskOptions(); });
  R('tool.quickMaskInvert', () => { setQmaskInverted(!qmaskOpts.inverted); });
  try { tools.setQuickMask(!!qmask, qmaskOpts.inverted); } catch {}
  R('image.calculations', () => { runLazy(SELECT, '计算', () => calculationsDialog()); }, inPreview);
  const ADJ_MENU_MAP = { brightnessContrast: 'brightnessContrast', levels: 'levels', curves: 'curves', exposure: 'exposure', vibrance: 'vibrance', hueSaturation: 'hueSaturation', colorBalance: 'colorBalance', blackWhite: 'blackWhite', photoFilter: 'photoFilter', channelMixer: 'channelMixer', colorLookup: 'colorLookup', invert: 'invert', posterize: 'posterize', threshold: 'threshold', gradientMap: 'gradientMap', selectiveColor: 'selectiveColor', desaturate: 'desaturate', equalize: 'equalize' };
  for (const [k, t] of Object.entries(ADJ_MENU_MAP)) {
    if (k === 'equalize' || k === 'colorLookup') continue;
    R('image.adjust.' + k, () => openAdjustLazy(t), () => hasLayer() && !adjustGuard() && (!ADJM || !!(ADJ_ALL && ADJ_ALL[t])));
  }
  

  R('image.adjust.equalize', () => layerPixelJob('色调均化', ({ base, w, h, cov }) => {
    const hist = new Float64Array(256); let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; if (!base[o + 3]) continue;
      const k = cov ? cov(x, y) : 1; if (k <= 0) continue;
      hist[base[o]] += k; hist[base[o + 1]] += k; hist[base[o + 2]] += k; n += 3 * k;
    }
    if (!n) return null;
    const lut = new Uint8ClampedArray(256); let acc = 0, first = -1;
    for (let v = 0; v < 256; v++) { if (first < 0 && hist[v] > 0) first = acc + hist[v]; acc += hist[v]; lut[v] = Math.round(Math.max(0, acc - first) / Math.max(1e-9, n - first) * 255); }
    const out = Uint8ClampedArray.from(base);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; if (!base[o + 3]) continue;
      const k = cov ? cov(x, y) : 1; if (k <= 0) continue;
      for (let c = 0; c < 3; c++) out[o + c] = base[o + c] + (lut[base[o + c]] - base[o + c]) * k;
    }
    return out;
  }), () => hasLayer() && !adjustGuard());
  
  R('layer.new', createLayerUI, inPreview);
  R('layer.viaCopy', () => { layerViaSelection(false); }, hasLayer);
  R('layer.viaCut', () => { layerViaSelection(true); }, () => hasLayer() && !!selection, { why: () => '先做一个选区' });
  R('layer.quickExportPng', () => { exportLayerUI(true); }, hasLayer);
  R('layer.exportAs', () => { exportLayerUI(false); }, hasLayer);
  R('layer.copyCss', () => { const t = layerCssText(selLayer); if (t) copyToClipboard(t, 'CSS'); else $('#notice').textContent = '这个图层没有可见像素。'; }, hasLayer);
  R('layer.copySvg', async () => { const t = await layerSvgText(selLayer); if (t) copyToClipboard(t, 'SVG'); else $('#notice').textContent = '这个图层没有可见像素。'; }, hasLayer);
  for (const k of ['removeBlack', 'removeWhite', 'defringe', 'decontaminate'])
    R('layer.matting.' + k, () => { mattingUI(k); }, () => hasLayer() && !filterGuard());
  R('layer.newSliceFromLayer', () => newSliceFromLayerUI(), () => hasLayer() && !sliceWriteWhy(), { why: () => sliceWriteWhy() });
  R('layer.smartFilter.disable', () => toggleSmartFilterMaster(), () => { const i = hasLayer() && smartFilterInfo(selLayer); return !!(i && i.filters.length && i.writable && !i.busy); },
    { checked: () => { const i = doc && selLayer >= 0 && smartFilterInfo(selLayer); return !!(i && !i.master); }, why: () => '这一层没有可改的智能滤镜' });
  R('select.allLayers', () => { const v = layerOrderView(); selLayers.clear(); for (const i of v.visible) if (doc.layers[i] && !isBackgroundLayer(i)) selLayers.add(i); if (selLayers.size) set_selLayer([...selLayers][0]); renderLayerPanel(); renderProps(); }, inPreview);
  R('select.findLayers', () => { const f = [...document.querySelectorAll('input')].find(e => /筛选图层/.test(e.placeholder || '')); if (f) { f.focus(); f.select(); } }, inPreview);
  R('select.subject', () => { runLazy(SELECT, '选择主体', () => selectSubjectUI()); }, inPreview);
  R('layer.duplicate', () => { const a = !li && docArtboards().find(q => q.index === selLayer); if (a) return duplicateArtboardUI(a);
    const fr = !li && frameRectOfLayer(selLayer); if (fr && fr.index === selLayer) return duplicateLayerBlockUI(selLayer);
    if (DOCS.count() > 1) return DOCS.duplicateLayerDialog();   
    return duplicateLayerUI(selLayer); }, hasLayer);
  R('layer.duplicateArtboard', () => { const a = docArtboards().find(q => q.index === selLayer); return a ? duplicateArtboardUI(a) : false; },
    () => hasLayer() && !li && !!docArtboards().find(q => q.index === selLayer), { why: () => '先选中画板' });
  R('layer.duplicateFrame', () => frameRectOfLayer(selLayer)?.index === selLayer ? duplicateLayerBlockUI(selLayer) : false,
    () => hasLayer() && !li && frameRectOfLayer(selLayer)?.index === selLayer, { why: () => '先选中图框' });
  
  const pickRow = f => {
    const rows = panelLayerIndices().filter(i => !layerDeletes.has(i));
    if (!rows.length) return;
    const k = rows.indexOf(selLayer), to = rows[Math.max(0, Math.min(rows.length - 1, f(k, rows.length)))];
    if (to == null || to === selLayer) return;
    set_selLayer(to); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo();
    revealLayerRow(to)?.scrollIntoView({ block: 'nearest' });
  };
  R('layer.selectUp', () => pickRow(k => k < 0 ? 0 : k - 1), inPreview);
  R('layer.selectDown', () => pickRow((k, n) => k < 0 ? n - 1 : k + 1), inPreview);
  R('layer.selectTop', () => pickRow(() => 0), inPreview);
  R('layer.selectBottom', () => pickRow((k, n) => n - 1), inPreview);
  for (const how of ['top', 'vcenter', 'bottom', 'left', 'hcenter', 'right']) {
    R('layer.align.' + how, () => alignLayers(how, 'selection'),
      () => hasDoc() && selLayer >= 0 && !!selection,
      { why: () => '将图层与选区对齐需要先建立选区' });
    R('layer.align.canvas.' + how, () => alignLayers(how, 'canvas'), () => hasDoc() && selLayer >= 0);
    R('layer.align.artboard.' + how, () => alignLayers(how, 'artboard'),
      () => hasDoc() && selLayer >= 0 && !!artboardOfLayer(selLayer),
      { why: () => '先选中画板中的图层' });
    R('layer.align.frame.' + how, () => alignLayers(how, 'frame'),
      () => hasDoc() && selLayer >= 0 && !!frameRectOfLayer(selLayer),
      { why: () => '先选中图框或图框中的图层' });
    R('layer.distribute.' + how, () => distributeLayers(how), () => hasDoc() && selLayers.size >= 3);
  }
  R('layer.frame.put', () => putIntoFrameUI(), () => hasLayer() && frameBelow(selLayer) >= 0
    && !frameRectOfLayer(selLayer), { why: () => '先选中图框下方的像素图层或智能对象' });
  R('layer.frame.take', () => takeOutOfFrameUI(), () => {
    const f = hasLayer() && frameRectOfLayer(selLayer); return !!f && f.index !== selLayer;
  }, { why: () => '先选中图框中的内容' });
  R('layer.delete', () => { deleteLayersReal(batchTargets(selLayer)); }, hasLayer);
  R('layer.deleteArtboard', () => { deleteLayersReal(batchTargets(selLayer)); },
    () => hasLayer() && !li && !!docArtboards().find(q => q.index === selLayer), { why: () => '先选中画板' });
  R('layer.deleteFrame', () => { deleteLayersReal(batchTargets(selLayer)); },
    () => hasLayer() && !li && frameRectOfLayer(selLayer)?.index === selLayer, { why: () => '先选中图框' });
  R('layer.deleteNow', () => deleteLayerForReal(selLayer), hasLayer);
  R('layer.rename', () => { const row = revealLayerRow(selLayer); const nm = row && row.querySelector('.lname'); if (nm) { nm.contentEditable = 'true'; nm.focus(); try { document.getSelection().selectAllChildren(nm); } catch {} } }, hasLayer);
  R('layer.renameArtboard', () => actions.run('layer.rename'),
    () => hasLayer() && !!docArtboards().find(q => q.index === selLayer), { why: () => '先选中画板' });
  R('layer.renameGroup', () => actions.run('layer.rename'),
    () => hasLayer() && !!layerTree?.flat?.[selLayer]?.isGroup, { why: () => '先选中图层组' });
  R('layer.renameFrame', () => actions.run('layer.rename'),
    () => hasLayer() && frameRectOfLayer(selLayer)?.index === selLayer, { why: () => '先选中图框' });
  
  R('layer.style.menu', () => openFxMenu(),
    () => hasLayer() && !!layerTree?.flat[selLayer] && layerTree.flat[selLayer].groupType !== 3);
  for (const [id, focus] of [['blendingOptions', 'blend'], ['bevel', 'bevelEmboss'], ['stroke', 'stroke'],
                             ['innerShadow', 'innerShadow'], ['innerGlow', 'innerGlow'], ['satin', 'satin'],
                             ['colorOverlay', 'colorOverlay'], ['gradientOverlay', 'gradientOverlay'],
                             ['patternOverlay', 'patternOverlay'], ['outerGlow', 'outerGlow'], ['dropShadow', 'dropShadow']])
    R('layer.style.' + id, () => openLayerStyleDialog(selLayer, focus),
      () => hasLayer() && !!layerTree?.flat[selLayer] && layerTree.flat[selLayer].groupType !== 3);
  

  const fxTargets = () => (selLayers.size ? [...selLayers] : selLayer >= 0 ? [selLayer] : []).filter(i => {
    const l = layerTree && layerTree.flat && layerTree.flat[i];
    return l && l.groupType !== 3;
  });
  R('layer.style.copy', () => copyLayerStyleUI(selLayer),
    () => hasLayer() && fxItemsOf(selLayer).length > 0, { why: () => '这个图层没有图层样式' });
  R('layer.style.paste', () => pasteLayerStyleUI(fxTargets()),
    () => hasLayer() && !!fxClipboard, { why: () => '剪贴板里还没有图层样式（先「拷贝图层样式」）' });
  R('layer.style.clear', () => clearLayerStyleUI(fxTargets()),
    () => fxTargets().some(i => fxItemsOf(i).length > 0), { why: () => '选中的图层上没有图层样式' });
  R('layer.style.clearDisabled', () => clearDisabledLayerStyleUI(fxTargets()),
    () => fxTargets().some(i => fxItemsOf(i).some(e => !e.on)), { why: () => '选中的图层上没有禁用的图层样式' });
  R('layer.style.hideAll', () => hideAllEffectsUI(fxTargets()),
    () => fxTargets().some(i => fxFileSlotsOf(i).length > 0),
    { checked: () => { const t = fxTargets().filter(i => fxFileSlotsOf(i).length); return t.length ? t.every(i => !effFxMaster(i, fxMasterBase(i))) : null; },
      why: () => '选中的图层上没有（文件里的）图层样式' });
  R('layer.style.scale', () => { scaleEffectsUI(selLayer); },
    () => hasLayer() && fxFileSlotsOf(selLayer).length > 0,
    { why: () => '「缩放效果」写的是样式块顶层的 Scl，只有原文件里就带样式的图层才有这一块' });
  R('layer.style.globalLight', () => { globalLightDialog(); }, hasDoc);
  



  R('layer.style.createLayers', () => { bakeLayerStyleUI(selLayer, true); }, () => hasLayer() && !li && liveFxEntries(selLayer).length > 0, { why: () => '这一层没有启用着的图层样式' });
  R('layer.group', groupSelectedUI, hasLayer);
  R('layer.newGroup', newGroupUI, hasLayer);          
  R('layer.groupFromLayers', groupSelectedUI, hasLayer);
  R('layer.ungroup', ungroupSelectedUI, () => hasLayer() && layerTree && layerTree.flat[selLayer] && layerTree.flat[selLayer].isGroup);
  R('layer.mergeShapes', () => mergePathComponents(), inPreview, { why: () => '需要在路径面板中选择可合并的形状组件' });
  R('layer.collapseAllGroups', () => { const v = layerOrderView(); for (const n of Object.values(v.nodes)) if (n.group) collapsedGroups.add(n.index); renderLayerPanel(); }, inPreview);
  R('layer.panelOptions', () => LP && LP.panelOptionsDialog && LP.panelOptionsDialog(), () => !!LP, { why: () => '图层面板尚未安装' });
  R('layer.hide', () => setLayerVisible(selLayer, !!(doc.layers[selLayer] && doc.layers[selLayer].hidden)), hasLayer);
  R('layer.show', () => setLayerVisible(selLayer, true), () => hasLayer() && !!doc.layers[selLayer]?.hidden, { why: () => '当前图层已经显示' });
  R('layer.hideExplicit', () => setLayerVisible(selLayer, false), () => hasLayer() && !doc.layers[selLayer]?.hidden, { why: () => '当前图层已经隐藏' });
  R('layer.bringForward', () => moveLayer(selLayer, -1), hasLayer);
  R('layer.sendBackward', () => moveLayer(selLayer, 1), hasLayer);
  R('layer.bringToFront', () => { const v = layerOrderView(); moveLayerTo(selLayer, v.order[0], false); }, hasLayer);
  R('layer.sendToBack', () => { const v = layerOrderView(); moveLayerTo(selLayer, v.order[v.order.length - 1], true); }, hasLayer);
  R('layer.smart.newViaCopy', () => newSmartViaCopyUI(selLayer), () => hasLayer() && !li && sos.some(so => matchLayer(so) === selLayer && so.sourceImage && so.sourceImage.embedded));
  R('layer.smart.convert', () => convertToSmartObjectUI(selLayer, { multi: true }), () => hasLayer() && !li && !!layerTree?.flat[selLayer] && layerTree.flat[selLayer].groupType !== 3 && (selLayers.size > 1 || layerTree.flat[selLayer].groupType != null || !layerTree.flat[selLayer].isSmartObject));
  R('layer.smart.editContents', () => { const k = sos.findIndex(so => matchLayer(so) === selLayer); if (k >= 0) openInside(k); }, () => hasLayer() && sos.some(so => matchLayer(so) === selLayer));
  R('layer.smart.replaceContents', () => { const k = sos.findIndex(so => matchLayer(so) === selLayer); if (k >= 0) { set_pendingReplSO(k); $('#repl').click(); } }, () => hasLayer() && sos.some(so => matchLayer(so) === selLayer));
  
  R('layer.mask.revealAll', () => { if (selection && !doc.layers[selLayer]?.mask && !maskPaint[selLayer]) { maskFromSelection(selLayer); maskAdded(selLayer); return; }
    delete maskPaint[selLayer]; ensureMaskPaint(selLayer, { create: true, fill: 255 }); commitMaskPaint(selLayer); maskAdded(selLayer); }, () => hasLayer() && !!ensurePixelPaint);
  R('layer.mask.hideAll', () => { delete maskPaint[selLayer]; ensureMaskPaint(selLayer, { create: true, fill: 0 }); commitMaskPaint(selLayer); maskAdded(selLayer); }, hasLayer);
  R('layer.mask.revealSelection', () => { if (maskFromSelection(selLayer) !== false) maskAdded(selLayer); }, () => hasLayer() && !!selection);
  R('layer.mask.hideSelection', () => { invertSel(); maskFromSelection(selLayer); invertSel(); }, () => hasLayer() && !!selection);
  R('layer.mask.fromTransparency', () => maskFromTransparencyUI(), () => hasLayer() && !!(layerTree?.flat[selLayer]) && layerTree.flat[selLayer].groupType == null);
  
  const fileMask = () => hasLayer() && !!(layerTree?.flat[selLayer] && layerTree.flat[selLayer].mask);
  const maskReady = () => hasLayer() && !!(layerTree?.flat[selLayer] && (layerTree.flat[selLayer].mask || maskStructOp(selLayer)));
  R('layer.mask.delete', () => {
    if (!fileMask() && maskStructOp(selLayer)) {
      
      
      return commitLayerOps(selLayer, () => {
        dropLayerOp(selLayer, 'maskStructural');
        dropLayerOp(selLayer, 'setMaskProps');
        dropLayerOp(selLayer, 'setLayerMaskPixels');
        delete maskPaint[selLayer];
      });
    }
    return setSingleOp(selLayer, { op: 'deleteLayerMask', index: selLayer, which: 'user' }, false);
  }, maskReady);
  R('layer.mask.apply', async () => {
    if (!await confirmDialog('应用蒙版会把蒙版灰度乘进图层像素后删除蒙版 —— 不可逆（导出的文件里蒙版就没了）。继续？',
      { title: '应用蒙版', okText: '应用', danger: true })) return;
    setSingleOp(selLayer, { op: 'applyLayerMask', index: selLayer }, false);
  }, fileMask);          
  R('layer.mask.toggle', () => {
    const l = layerTree.flat[selLayer], dis = effMaskFlag(selLayer, l, 'disabled');
    setOpField(selLayer, { op: 'setMaskProps' }, 'disabled', !dis, !!(l.mask && l.mask.disabled));
    renderProps();
  }, maskReady,
    { checked: () => maskReady() && effMaskFlag(selLayer, layerTree.flat[selLayer], 'disabled') });
  R('layer.mask.unlink', () => {
    const l = layerTree.flat[selLayer], rel = !!(l.mask && l.mask.relative);
    setOpField(selLayer, { op: 'setMaskProps' }, 'relative', !rel, rel);
    renderProps();
  }, maskReady,
    { checked: () => maskReady() && !!(layerTree.flat[selLayer].mask && layerTree.flat[selLayer].mask.relative) });
  

  const hasVMask = () => hasLayer() && !!(layerTree?.flat[selLayer] && layerTree.flat[selLayer].vectorMask);
  const vmaskWhy = () => hasLayer() && layerTree?.flat[selLayer] && !layerTree.flat[selLayer].vectorMask
    ? '这一层还没有矢量蒙版：先用「显示全部 / 隐藏全部 / 当前路径」新建一条' : '';
  
  const canAddVMask = () => hasLayer() && !li && !!layerTree?.flat[selLayer] && !layerTree.flat[selLayer].vectorMask
    && layerTree.flat[selLayer].groupType !== 3 && !layerTree.flat[selLayer].isGroup;
  R('layer.vectorMask.revealAll', () => { if (hasVMask()) setVectorMaskPathsUI(
    [{ closed: true, operation: 1, knots: [[0, 0], [docW, 0], [docW, docH], [0, docH]].map(p => ({ anchor: p, in: p, out: p })) }]); else addVectorMaskUI('reveal'); },
    () => hasVMask() || canAddVMask());
  R('layer.vectorMask.hideAll', () => { if (hasVMask()) setVectorMaskPathsUI([]); else addVectorMaskUI('hide'); }, () => hasVMask() || canAddVMask());
  R('layer.vectorMask.currentPath', () => { if (hasVMask()) setVectorMaskPathsUI(activeDocSubs()); else addVectorMaskUI('path'); },
    () => (hasVMask() || canAddVMask()) && !!activeDocSubs(), { why: () => activeDocSubs() ? '' : '先用钢笔画一条路径（工作路径），或在路径面板里选中一条路径' });
  R('layer.vectorMask.delete', () => deleteVectorMaskUI(), hasVMask, { why: vmaskWhy });
  R('layer.vectorMask.toggle', () => {
    const idx = selLayer, p = doc.layers[idx] && doc.layers[idx].vectorMask;
    const dis = opField(idx, 'setVectorMaskFlags', 'disable');
    setOpField(idx, { op: 'setVectorMaskFlags' }, 'disable', !(dis !== undefined ? dis : !!(p && p.disable)), !!(p && p.disable));
    renderProps();
  }, hasVMask, { why: vmaskWhy, checked: () => {
    if (!hasVMask()) return null;
    const p = doc.layers[selLayer] && doc.layers[selLayer].vectorMask;
    const dis = opField(selLayer, 'setVectorMaskFlags', 'disable');
    return dis !== undefined ? !!dis : !!(p && p.disable);
  } });
  R('layer.vectorMask.unlink', () => {
    const idx = selLayer, p = doc.layers[idx] && doc.layers[idx].vectorMask;
    const nl = opField(idx, 'setVectorMaskFlags', 'notLink');
    setOpField(idx, { op: 'setVectorMaskFlags' }, 'notLink', !(nl !== undefined ? nl : !!(p && p.notLink)), !!(p && p.notLink));
    renderProps();
  }, hasVMask, { why: vmaskWhy, checked: () => {
    if (!hasVMask()) return null;
    const p = doc.layers[selLayer] && doc.layers[selLayer].vectorMask;
    const nl = opField(selLayer, 'setVectorMaskFlags', 'notLink');
    return nl !== undefined ? !!nl : !!(p && p.notLink);
  } });
  
  R('layer.clippingMask', () => toggleClippingMaskUI(),
    () => hasLayer() && !!(layerTree?.flat[selLayer]) && layerTree.flat[selLayer].groupType == null
      && selLayer >= 1 && !!(layerTree.flat[selLayer - 1]) && layerTree.flat[selLayer - 1].groupType !== 3,
    { checked: () => hasLayer() && !!(layerTree?.flat[selLayer]) && effClipping(selLayer, layerTree.flat[selLayer]) });
  R('layer.releaseClippingMask', () => toggleClippingMaskUI(),
    () => hasLayer() && !!(layerTree?.flat[selLayer]) && effClipping(selLayer, layerTree.flat[selLayer]),
    { why: () => '当前图层没有剪贴蒙版' });
  
  R('layer.merge', () => mergeLayersUI('merge'), () => hasLayer() && !li);
  R('layer.mergeDown', () => mergeLayersUI('merge'), () => canMergeDown(),
    { why: () => '选中图层下方没有可见图层' });
  R('layer.mergeVisible', () => mergeLayersUI('mergeVisible'), inPreview);
  R('layer.flatten', () => mergeLayersUI('flatten'), inPreview);
  
  R('layer.reverse', () => reverseLayersUI(), inPreview);
  R('layer.lock', () => lockLayersDialog(), () => hasLayer() && !li);
  const containerIndices = root => {
    const view = layerOrderView(), nodes = view.nodes || {};
    return Object.values(nodes).filter(n => {
      if (n.groupType === 3) return false;
      if (n.index === root) return true;
      for (let p = n.parent; p != null; p = nodes[p] && nodes[p].parent) if (p === root) return true;
      return false;
    }).map(n => n.index).filter(i => i >= 0 && doc.layers[i]);
  };
  const lockAllIndices = (indices, label) => {
    const flat = layerTree && layerTree.flat, list = [...new Set(indices)].filter(i => flat?.[i] && !isBackgroundLayer(i));
    if (!list.length) return false;
    pushDocHistory(label);
    for (const i of list) if (!effLock(i, flat[i], 'lockAll', 'all')) toggleLayerLock(i, 'lockAll', 'all');
    shell.status(`${label}：${list.length} 个图层`); return true;
  };
  R('layer.lockGroup', () => lockAllIndices([selLayer], '锁定组'),
    () => hasLayer() && !!layerTree?.flat?.[selLayer]?.isGroup, { why: () => '先选中图层组' });
  R('layer.lockGroupChildren', () => lockAllIndices(containerIndices(selLayer), '锁定组内的所有图层'),
    () => hasLayer() && !!layerTree?.flat?.[selLayer]?.isGroup, { why: () => '先选中图层组' });
  R('layer.lockArtboardChildren', () => lockAllIndices(containerIndices(selLayer), '锁定画板中的所有图层'),
    () => hasLayer() && !!docArtboards().find(a => a.index === selLayer), { why: () => '先选中画板' });
  R('layer.lockFrameChildren', () => lockAllIndices(containerIndices(selLayer), '锁定画框中的图层'),
    () => hasLayer() && frameRectOfLayer(selLayer)?.index === selLayer, { why: () => '先选中图框' });
  R('layer.deleteHidden', () => deleteHiddenLayersUI(), inPreview);
  
  
  R('edit.copy', () => {
    const a = !li && !selection && docArtboards().find(q => q.index === selLayer);
    if (a) { set_artboardClip({ index: a.index, name: a.name, w: a.rect.w, h: a.rect.h }); set_lastClipKind('artboard'); shell.status(`已拷贝画板「${a.name}」（⌘V 粘贴 = 连内容复制一块画板到旁边）`); return true; }
    if (!selection) { const px = copyPixelsUI(false); if (copyLayersUI()) return true; return px; }   
    return copyPixelsUI(false);
  }, hasLayer);
  R('edit.copyMerged', () => copyPixelsUI(true), inPreview);
  R('edit.cut', () => cutPixelsUI(), hasLayer);
  R('edit.paste', () => {
    if (lastClipKind === 'artboard' && artboardClip) {
      
      const L = docArtboards(), c = artboardClip;
      const a = L.find(q => q.name === c.name && q.rect.w === c.w && q.rect.h === c.h) || L.find(q => q.index === c.index);
      if (a) return duplicateArtboardUI(a);
    }
    if (lastClipKind === 'layers' && layerClip) return DOCS.isForeignClip(layerClip) ? DOCS.pasteForeignLayers(layerClip, 'paste') : pasteLayersUI('paste');
    return pasteClipboardUI('paste');
  }, inPreview);
  R('edit.pastePlain', () => pasteClipboardUI('paste'), inPreview);
  R('edit.pasteInPlace', () => lastClipKind === 'layers' && layerClip ? (DOCS.isForeignClip(layerClip) ? DOCS.pasteForeignLayers(layerClip, 'inPlace') : pasteLayersUI('inPlace')) : pasteClipboardUI('inPlace'), inPreview);
  R('edit.pasteInto', () => pasteClipboardUI('into'), () => inPreview() && !!selection);
  R('edit.pasteOutside', () => pasteClipboardUI('outside'), () => inPreview() && !!selection, { why: () => '先做一个选区：外部粘贴 = 贴成新图层，蒙版遮住选区内的部分' });
  for (const k of Object.keys(ADJ_KINDS_MENU || {})) if (k !== 'colorLookup') R('layer.adjust.' + k, () => addAdjustmentLayer(k), inPreview);   
  actions.onRegister(() => {});
  const bindAdjKinds = () => { for (const k of Object.keys(ADJ_KINDS_MENU || {})) if (!actions.has('layer.adjust.' + k)) R('layer.adjust.' + k, () => addAdjustmentLayer(k), inPreview); psPanels.refreshAdjustments(); };
  EDIT.onReady(bindAdjKinds);            
  
  R('select.all', selectAllLazy, inPreview);
  R('select.none', deselect, () => !!doc && !!selection);
  R('select.inverse', invertSelLazy, inPreview);
  R('select.feather', async () => { const r = await askFeather($('#selFeather').value || 0); if (r > 0) featherSel(r); }, () => !!selection);
  R('select.modify.expand', async () => { const r = await askPixels('扩展量', 1); if (r > 0) expandSel(r); }, () => !!selection);
  R('select.modify.contract', async () => { const r = await askPixels('收缩量', 1); if (r > 0) contractSel(r); }, () => !!selection);
  R('select.selectAndMask', () => openSelectAndMask(), () => !!selection);
  R('select.refineMask', () => openSelectAndMask(), () => !!selection, { why: () => '先建立一个选区' });
  R('select.refineEdge', () => openSelectAndMask(), () => !!selection, { why: () => '先建立一个选区' });
  R('select.peopleDistractions', () => false, () => false, { why: () => '背景中的人物依赖 Photoshop 的生成式/AI 识别服务' });
  

  R('select.reselect', () => { setSelection(lastSelection, { label: '重新选择' }); },
    () => inPreview() && !!lastSelection && !selection, { why: () => '还没有可以重新选回来的选区' });
  R('select.grow', () => growSelUI(false), () => !!selection && !!SELM);
  R('select.similar', () => growSelUI(true), () => !!selection && !!SELM);
  R('select.modify.border', async () => { const r = await askPixels('边界宽度', 10); if (r > 0) borderSelUI(Math.round(r)); }, () => !!selection);
  R('select.modify.smooth', async () => { const r = await askPixels('取样半径', 3); if (r > 0) smoothSelUI(Math.round(r)); }, () => !!selection);
  R('select.transform', () => tfBeginSelectionOutline('free'), () => !!selection && !tfState);
  
  R('select.colorRange', () => { runLazy(SELECT, '色彩范围', () => openColorRangeDialog()); }, inPreview);
  


  R('select.load', () => { loadSelectionDialog(); }, inPreview);
  R('select.save', () => { saveSelectionDialog(); },
    () => inPreview() && !!selection && !alphaWriteWhy(),
    { why: () => alphaWriteWhy() || (selection ? '' : '先做一个选区，再存储它') });
  R('select.deselectLayers', () => { set_selLayer(-1); selLayers.clear(); renderLayerPanel(); }, hasLayer);
  


  {
    const canFilter = () => hasLayer() && !filterGuard();
    const KNOWN_FILTER_ACTIONS = [
      ['filter.blur.gaussian', 'gaussianBlur'], ['filter.blur.box', 'boxBlur'], ['filter.blur.blur', 'blur'],
      ['filter.blur.more', 'blurMore'], ['filter.blur.motion', 'motionBlur'], ['filter.blur.radial', 'radialBlur'],
      ['filter.blur.average', 'average'],
      ['filter.sharpen.unsharp', 'unsharpMask'], ['filter.sharpen.sharpen', 'sharpen'], ['filter.sharpen.more', 'sharpenMore'],
      ['filter.noise.add', 'addNoise'], ['filter.noise.median', 'median'], ['filter.noise.despeckle', 'despeckle'],
      ['filter.pixelate.mosaic', 'mosaic'],
      ['filter.stylize.findEdges', 'findEdges'], ['filter.stylize.emboss', 'emboss'], ['filter.stylize.solarize', 'solarize'],
      ['filter.other.highPass', 'highPass'], ['filter.other.offset', 'offset'],
      ['filter.other.maximum', 'maximum'], ['filter.other.minimum', 'minimum'],
      ['filter.render.clouds', 'clouds'],
      
      ['filter.distort.wave', 'wave'], ['filter.distort.ripple', 'ripple'], ['filter.distort.polar', 'polar'],
      ['filter.distort.pinch', 'pinch'], ['filter.distort.shear', 'shear'], ['filter.distort.spherize', 'spherize'],
      ['filter.distort.zigzag', 'zigzag'], ['filter.distort.twirl', 'twirl'],
      ['filter.stylize.traceContour', 'traceContour'], ['filter.stylize.wind', 'wind'], ['filter.stylize.diffuse', 'diffuse'],
      ['filter.stylize.tiles', 'tiles'], ['filter.stylize.extrude', 'extrude'], ['filter.stylize.oilPaint', 'oilPaint'],
      ['filter.blur.surface', 'surfaceBlur'], ['filter.blur.lens', 'lensBlur'], ['filter.blur.smart', 'smartBlur'], ['filter.blur.shape', 'shapeBlur'],
      
      ['filter.sharpen.smart', 'smartSharpen'], ['filter.sharpen.edges', 'sharpenEdges'], ['filter.sharpen.shake', 'shake'],
      ['filter.video.ntsc', 'ntsc'], ['filter.video.deinterlace', 'deinterlace'],
      ['filter.pixelate.facet', 'facet'], ['filter.pixelate.halftone', 'colorHalftone'], ['filter.pixelate.pointillize', 'pointillize'],
      ['filter.pixelate.crystallize', 'crystallize'], ['filter.pixelate.fragment', 'fragment'], ['filter.pixelate.mezzotint', 'mezzotint'],
      ['filter.render.differenceClouds', 'differenceClouds'], ['filter.render.fibers', 'fibers'], ['filter.render.lensFlare', 'lensFlare'],
      ['filter.render.lighting', 'lighting'],
      ['filter.noise.reduce', 'reduceNoise'], ['filter.noise.dustScratches', 'dustScratches'],
      ['filter.3d.bump', 'bumpMap'], ['filter.3d.normal', 'normalMap'],
      ['filter.other.hsb', 'hsbHsl'], ['filter.other.custom', 'custom'],
      ['filter.cameraRaw', 'cameraRaw'], ['filter.lensCorrection', 'lensCorrection'],
      
      ['image.autoTone', 'autoTone'], ['image.autoContrast', 'autoContrast'], ['image.autoColor', 'autoColor'],
      ['image.adjust.shadowsHighlights', 'shadowsHighlights'], ['image.adjust.hdrToning', 'hdrToning'],
      ['image.adjust.matchColor', 'matchColor'], ['image.adjust.replaceColor', 'replaceColor'],
    ];
    R('filter.distort.displace', () => pickDisplaceMap(), canFilter);
    R('filter.liquify', () => { liquifyUI(); }, () => canFilter() || !!(SFX && hasLayer() && !li && SFX.canAdd(selLayer, 'liquify')));
    R('filter.vanishingPoint', () => { vanishingPointUI(); }, canFilter);
    R('filter.adaptiveWideAngle', () => { adaptiveWideUI(); }, canFilter);
    
    const canGallery = () => hasLayer() && !galleryGuard();
    const galleryWhy = { why: () => galleryGuard() };
    R('filter.gallery', () => { filterGalleryUI(); }, canGallery, galleryWhy);
    for (const e of GALLERY_MENU) R('filter.gallery.fx.' + e.id, () => { filterGalleryUI(e.id); }, canGallery, galleryWhy);
    R('filter.gallery.showAll', () => { setGalleryShowAllPref(!galleryShowAllPref()); shell.status('显示滤镜库的所有组和名称：' + (galleryShowAllPref() ? '开' : '关')); }, () => true, { checked: () => galleryShowAllPref() });
    for (const [k, a] of [['field', 'field'], ['iris', 'iris'], ['tiltShift', 'tiltShift'], ['path', 'path'], ['spin', 'spin']])
      R('filter.blurGallery.' + a, () => { blurGalleryUI(k); }, canFilter);
    for (const k of ['flame', 'pictureFrame', 'tree']) R('filter.render.' + k, () => { renderGenUI(k); }, () => hasDoc() && !li);
    
    R('filter.convertToSmart', () => actions.run('layer.smart.convert'), () => actions.enabled('layer.smart.convert'));
    for (const [act, kind] of KNOWN_FILTER_ACTIONS) {
      R(act, () => {
        
        if (SFX && hasLayer() && SFX.canAdd(selLayer, kind)) return SFX.addFilter(selLayer, kind);
        const sp = fltSpec(kind);
        return (sp && !sp.params.length) ? applyFilterLazy(kind) : openFilterLazy(kind);
      }, () => canFilter() || !!(SFX && hasLayer() && !li && SFX.canAdd(selLayer, kind)));
    }
    

    const NOT_YET = {
      'filter.neural': '不做（永久）：Neural Filters 依赖 AI 模型，本编辑器不接 AI',
    };
    for (const [id, why] of Object.entries(NOT_YET)) if (!actions.has(id)) R(id, () => false, () => false, { why: () => why });
    R('filter.last', () => repeatLastFilter(false), () => canFilter() && !!lastFilter);
    
    const pixOK = () => hasLayer() && !filterGuard();
    R('edit.fill', () => { editFillDialog(); }, pixOK);
    R('edit.stroke', () => { editStrokeDialog(); }, () => pixOK() && !!selection, { why: () => selection ? '' : '先做一个选区：描边沿选区边缘画线' });
    R('edit.fade', () => { editFadeDialog(); }, () => !!fadeTarget(), { why: () => '只有紧接着一步像素操作（画笔 / 填充 / 滤镜 / 调整）之后才能渐隐' });
    R('edit.contentAwareFill', () => { contentAwareFillNow(); }, () => pixOK() && !!selection, { why: () => selection ? '' : '先用选区圈出要去掉的东西' });
    R('edit.search', () => { commandSearch(); });
    R('edit.findReplace', () => { findReplaceText(); }, () => inPreview() && !!(layerTree && layerTree.flat && layerTree.flat.some(l => l && l.text)));
    R('edit.toggleLastState', () => toggleLastState(), () => inPreview() && (toggledBack || histLog.cursor > 0));
    for (const k of ['undo', 'clipboard', 'histories', 'all']) R('edit.purge.' + k, () => { purgeHistory(k); }, () => !!doc);
    R('edit.purge.video', () => false, () => false, { why: () => '本编辑器没有视频图层，也就没有视频高速缓存' });
    R('file.deleteEmptyLayers', () => { deleteEmptyLayersUI(); }, inPreview);
    R('file.print', () => printDocument(), hasDoc);
    R('file.printOne', () => printDocument(), hasDoc);
    R('file.info', () => { fileInfoDialog(); }, hasDoc);
    R('file.closeOthers', () => { DOCS.closeOthers(); }, () => DOCS.count() > 1, { why: () => '只打开了一份文档，没有「其它」可关' });
    R('filter.lastDialog', () => repeatLastFilter(true), () => canFilter() && !!lastFilter);
  }
  
  R('edit.definePattern', () => presets.definePattern(), inPreview);
  R('edit.defineBrush', () => brushPanel.defineBrush(), inPreview);
  R('edit.defineShape', () => presets.defineShape(), () => inPreview() && !!(panelPathSubs() || []).length,
    { why: () => '先用钢笔 / 形状工具画一条路径，或选中一个形状图层（路径面板里选中的那条会被定义成形状）' });
  R('edit.presetManager', () => presets.openPresetManager());
  R('edit.presetsExportImport', () => presets.openExportImport());
  
  for (const k of ['solid', 'gradient', 'pattern'])
    R('layer.fill.' + k, () => openNewFillDialog(k),
      () => hasDoc() && !li && (k !== 'pattern' || docPatterns().length > 0),
      { why: () => k === 'pattern' && hasDoc() ? '图案库是空的：先「编辑 › 定义图案…」或在图案面板里导入 .pat' : '' });
  
  R('channel.composite', () => setChannelView({ single: null }), () => hasDoc() && chanSupported(),
    { checked: () => chanView.single === null && !chanView.off.size });
  for (let c = 0; c < 4; c++)
    R('channel.' + c, () => setChannelView({ single: c }), () => hasDoc() && chanSupported() && c < chanCount(),
      { checked: () => chanView.single === c });
  R('image.mergeSpotChannels', () => CHP && CHP.mergeSpotChannel && CHP.mergeSpotChannel(),
    () => hasDoc() && !!CHP && CHP.view.activeKind === 2,
    { why: () => '先在通道面板中选中一条专色通道' });
  
  R('view.zoomIn', () => setZoom(nextZoomStep(1)), hasDoc);
  R('view.zoomOut', () => setZoom(nextZoomStep(-1)), hasDoc);
  R('view.fitOnScreen', () => fitStage(true, { fitCap: 32 }), hasDoc);
  R('view.fitLayer', () => {
    const b = layerSelBBox(selLayer); if (!b || !(b.w > 0) || !(b.h > 0)) return false;
    const vp = $('#viewport'), availW = Math.max(1, (vp?.clientWidth || 1) - 48), availH = Math.max(1, (vp?.clientHeight || 1) - 48);
    const nz = Math.min(32, Math.max(0.01, Math.min(availW / b.w, availH / b.h)));
    set_zoomFitMode(false); set_zoom(nz); fitStage(false); centerDocPoint(b.x + b.w / 2, b.y + b.h / 2); return true;
  }, () => hasDoc() && selLayer >= 0 && !!layerSelBBox(selLayer), { why: () => '先选中有可见内容的图层' });
  R('view.actualPixels', () => setZoom(1), hasDoc);
  R('view.zoom200', () => setZoom(2), hasDoc);
  R('view.actualSize', () => setZoom(1), hasDoc);
  R('view.show.pixelGrid', () => { set_pixelGridOn(!pixelGridOn); drawGizmo(); shell.status(`像素网格：${pixelGridOn ? '开' : '关'}（放大到 ${PIXEL_GRID_MIN_ZOOM * 100}% 以上才显示）`); },
    () => true, { checked: () => pixelGridOn });
  R('view.showGuides', () => { set_guidesVisible(!guidesVisible); drawGizmo(); }, hasDoc, { checked: () => guidesVisible });
  R('view.guides.show', () => { set_guidesVisible(true); drawGizmo(); }, hasDoc, { checked: () => guidesVisible });
  R('view.guides.hide', () => { set_guidesVisible(false); drawGizmo(); }, hasDoc, { checked: () => !guidesVisible });
  R('view.artboardGuides.show', () => { set_artboardGuidesOn(true); drawGizmo(); }, hasDoc, { checked: () => artboardGuidesOn });
  R('view.artboardGuides.hide', () => { set_artboardGuidesOn(false); drawGizmo(); }, hasDoc, { checked: () => !artboardGuidesOn });
  const extrasOn = () => layerEdgesOn || selEdgesOn || smartGuidesOn || guidesVisible || artboardGuidesOn || sliceOpts.show
    || countVisible || notesVisible || editPinsOn || brushPreviewOn;
  const setExtras = on => {
    set_layerEdgesOn(on); set_selEdgesOn(on); set_smartGuidesOn(on); set_guidesVisible(on); set_artboardGuidesOn(on);
    sliceOpts.show = !!on; set_countVisible(on); set_notesVisible(on); set_editPinsOn(on); set_brushPreviewOn(on);
  };
  R('view.extras', () => { const on = !extrasOn(); setExtras(on); const cage = $('#showCage'); if (cage) cage.checked = on; drawGizmo(); shell.status(`额外内容：${on ? '开' : '关'}`); }, hasDoc, { checked: extrasOn });
  R('view.extras.show', () => { setExtras(true); const cage = $('#showCage'); if (cage) cage.checked = true; drawGizmo(); }, hasDoc, { checked: extrasOn });
  R('view.extras.hide', () => { setExtras(false); const cage = $('#showCage'); if (cage) cage.checked = false; drawGizmo(); }, hasDoc, { checked: () => !extrasOn() });
  R('view.layerStyles', () => actions.run('layer.style.menu'), () => hasLayer() && actions.enabled('layer.style.menu'), { why: () => '先选中一个可编辑图层' });
  R('view.overlay', () => false, () => false, { why: () => 'Photoshop 的视图叠加工作区尚未接入' });
  R('view.patternPreview', () => false, () => false, { why: () => '图案预览依赖 Photoshop 的无缝图案工作区' });
  R('view.quickCompare', () => false, () => false, { why: () => '前后分割比较工作区尚未接入' });
  R('view.addStock', () => false, () => false, { why: () => 'Adobe Stock 需要 Creative Cloud 账号服务' });
  R('view.addDevice', () => false, () => false, { why: () => '设备导入需要本机相机/扫描仪接口' });
  R('view.addFreeStock', () => false, () => false, { why: () => 'Adobe Stock 需要 Creative Cloud 账号服务' });
  R('view.generateImage', () => false, () => false, { why: () => '生成图像依赖 Photoshop 的生成式 AI 模型' });
  R('edit.generativeWorkspace', () => false, () => false, { why: () => '生成式工作区依赖 Photoshop 的生成式 AI 服务' });
  R('edit.removeReflections', () => false, () => false, { why: () => '去除反射依赖 Photoshop 的 AI 干扰物识别服务' });
  R('edit.objectEditor', () => false, () => false, { why: () => '对象编辑器依赖 Photoshop 的生成式对象工作区' });
  R('edit.promptEdit', () => false, () => false, { why: () => '用提示编辑依赖 Photoshop 的生成式 AI 服务' });
  R('edit.customFileFormats', () => false, () => false, { why: () => '自定义文件格式需要 Photoshop 的原生文件对话框宿主' });
  R('view.snap', () => { set_snapOn(!snapOn); shell.status(snapOn ? '对齐：开' : '对齐：关'); }, hasDoc, { checked: () => snapOn });
  R('view.snap.enable', () => { set_snapOn(true); shell.status('对齐：开'); }, hasDoc, { checked: () => snapOn });
  R('view.snap.disable', () => { set_snapOn(false); shell.status('对齐：关'); }, hasDoc, { checked: () => !snapOn });
  for (const [k, label] of [['guides', '参考线'], ['layers', '图层'], ['documentBounds', '文档边界']])
    R('view.snapTo.' + k, () => { snapTo[k] = !snapTo[k]; shell.status(`对齐到${label}：` + (snapTo[k] ? '开' : '关')); }, hasDoc, { checked: () => snapTo[k] });
  R('view.snapTo.all', () => { for (const k in snapTo) snapTo[k] = true; set_snapOn(true); }, hasDoc);
  R('view.snapTo.none', () => { for (const k in snapTo) snapTo[k] = false; }, hasDoc);
  R('view.clearGuides', () => { set_guides([]); set_guidesDirty(true); drawGizmo(); }, () => hasDoc() && guides.length > 0);
  
  const tog = (id, get, set, label) => R(id, () => { set(!get()); drawGizmo(); shell.status(`${label}：${get() ? '开' : '关'}`); }, hasDoc, { checked: get });
  tog('view.showGrid', () => gridOpts.on, v => { gridOpts.on = v; }, '网格');
  R('view.grid.show', () => { gridOpts.on = true; drawGizmo(); shell.status('网格：开'); }, hasDoc, { checked: () => gridOpts.on });
  R('view.grid.hide', () => { gridOpts.on = false; drawGizmo(); shell.status('网格：关'); }, hasDoc, { checked: () => !gridOpts.on });
  tog('view.show.layerEdges', () => layerEdgesOn, v => { set_layerEdgesOn(v); }, '图层边缘');
  tog('view.show.smartGuides', () => smartGuidesOn, v => { set_smartGuidesOn(v); }, '智能参考线');
  tog('view.show.canvasGuides', () => guidesVisible, v => { set_guidesVisible(v); }, '画布参考线');
  tog('view.show.slices', () => sliceOpts.show, v => { sliceOpts.show = v; const sh = $('#sliceShow'); if (sh) sh.checked = v; }, '切片');
  tog('view.lockGuides', () => guidesLocked, v => { set_guidesLocked(v); }, '锁定参考线');
  tog('view.lockSlices', () => slicesLocked, v => { set_slicesLocked(v); }, '锁定切片');
  R('view.toggleAutoSlices', () => {
    sliceOpts.hideAuto = !sliceOpts.hideAuto;
    const b = $('#slHideAuto');
    if (b) { b.textContent = sliceOpts.hideAuto ? '显示自动切片' : '隐藏自动切片'; b.classList.toggle('on', sliceOpts.hideAuto); }
    drawGizmo(); shell.status(sliceOpts.hideAuto ? '自动切片：隐藏' : '自动切片：显示');
  }, () => hasDoc() && !!sliceOpts.show, { checked: () => !sliceOpts.hideAuto, why: () => '先显示切片' });
  R('view.show.options', () => { gridOptionsDialog(); }, hasDoc);
  R('view.snapTo.grid', () => { snapTo.grid = !snapTo.grid; shell.status('对齐到网格：' + (snapTo.grid ? '开' : '关')); }, () => hasDoc() && gridOpts.on, { checked: () => snapTo.grid && gridOpts.on, why: () => '先打开网格（视图 › 显示 › 网格）' });
  R('view.clearCanvasGuides', () => { set_guides([]); set_guidesDirty(true); drawGizmo(); }, () => hasDoc() && guides.length > 0);
  R('view.newGuide', () => { newGuideDialog(); }, hasDoc);
  R('view.newGuideLayout', () => { newGuideLayoutDialog(); }, hasDoc);
  R('view.guidesFromShape', () => guidesFromLayer(), () => hasDoc() && !li && selLayer >= 0);
  R('view.clearSlices', () => { if (!docSlices || !docSlices.slices.length) return; sliceModel().slices = []; set_sliceSel(-1); set_slicesDirty(true); drawGizmo(); shell.status('已清除所有用户切片（导出时写回）'); },
    () => hasDoc() && !sliceWriteWhy() && !!(docSlices && docSlices.slices.length), { why: () => sliceWriteWhy() || '没有用户切片' });
  R('view.printSize', () => { setZoom(96 / (origBuffer ? readResolution(origBuffer) : 72)); }, hasDoc);
  R('view.fitArtboard', () => { fitStage(true); }, hasDoc);
  

  

  R('view.rulers', () => { setRulersVisible(!rulersVisible); }, hasDoc, { checked: () => rulersVisible });
  for (const u of Object.keys(RULER_UNITS))
    R('view.rulerUnit.' + u, () => { setRulerUnit(u); }, hasDoc, { checked: () => rulerUnit === u });
  
  
  R('tool.swapColors', () => { if (doc && !li && docTool === 'adjBrush') { adjBrushOpts.subtract = !adjBrushOpts.subtract; syncBrushPanel(); shell.status('调整画笔：' + (adjBrushOpts.subtract ? '减去' : '添加')); return; } swapColors(); });
  R('tool.defaultColors', resetColors);
  

  const selKeysOn = () => inPreview() && (docTool === 'quickSelect' || docTool === 'selectionBrush' || docTool === 'lassoMagnetic');
  R('brush.smaller', () => { if (selBracket(-1)) return; if (rtBrushKey('smaller')) return; setBrushSize(bracketStep(brush.size, -1)); }, () => brushOn() || selKeysOn());
  R('brush.larger', () => { if (selBracket(1)) return; if (rtBrushKey('larger')) return; setBrushSize(bracketStep(brush.size, 1)); }, () => brushOn() || selKeysOn());
  R('brush.softer', () => { if (selBracket(-1, true)) return; if (rtBrushKey('softer')) return; setBrushHardness(hardnessStep(brush.hardness, -1)); }, () => brushOn() || selKeysOn());
  R('brush.harder', () => { if (selBracket(1, true)) return; if (rtBrushKey('harder')) return; setBrushHardness(hardnessStep(brush.hardness, 1)); }, () => brushOn() || selKeysOn());
  R('brush.airbrush', () => { brush.airbrush = !brush.airbrush; syncBrushControls(); shell.status('喷枪：' + (brush.airbrush ? '开' : '关')); }, brushOn);
  
  shell.menu.setDynamicLabels(k => {
    if (LX) { const v = LX.dynLabel(k); if (v !== undefined) return v; }
    if (k === 'bgLayer') return doc && selLayer >= 0 && isBackgroundLayer(selLayer) ? '背景图层中的图层…' : '背景图层';
    if (k === 'undo') return undoBtn.disabled ? '还原' : null;
    if (k === 'redo') return redoBtn.disabled ? '重做' : null;
    if (k === 'merge') return doc && selLayers.size >= 2 ? '合并图层' : '向下合并';
    const L = doc && layerTree && layerTree.flat && selLayer >= 0 ? layerTree.flat[selLayer] : null;
    if (k === 'hideLayer') return doc && selLayer >= 0 && doc.layers[selLayer]?.hidden ? '显示图层' : '隐藏图层';
    if (k === 'clip') return L && effClipping(selLayer, L) ? '释放剪贴蒙版' : '创建剪贴蒙版';
    if (k === 'isolate') return LX && LX.isolated ? '从隔离图层释放' : '隔离图层';
    if (k === 'maskToggle') return L && L.mask && effMaskFlag(selLayer, L, 'disabled') ? '启用图层蒙版' : null;
    if (k === 'maskLink') return L && L.mask ? (L.mask.relative ? '链接图层蒙版' : '取消链接图层蒙版') : null;
    
    if (k === 'fxHideAll') return L && !effFxMaster(selLayer, fxMasterBase(selLayer)) ? '显示所有效果' : '隐藏所有效果';
    
    if (k === 'aaLCD') return aaLabel('antiAliasPlatformLCD');            
    if (k === 'aaPlat') return aaLabel('antiAliasPlatformGray');
    if (k === 'typeKind') return doc && isTextLayer(selLayer) && effTextShape(selLayer) === 'box' ? '转换为点文本' : '转换为段落文本';
    if (k === 'typeDynamic') return doc && isTextLayer(selLayer) && textDynamicOf(selLayer) ? '还原为普通文字' : '转换为动态文本';
    if (k === 'newWindow') return doc ? `为「${docName}」新建窗口` : null;
    return null;
  });
  shell.menu.setDocumentsProvider(() => DOCS.menuDocs());
  if (shell.menu.setItemsHook) shell.menu.setItemsHook((id, items) => (id === 'filter' && galleryShowAllPref() ? injectGalleryMenu(items) : items));
  
  tools.onColorClick(which => pickColor(which));
  psPanels.init({
    getColors: () => ({ fg: fgRGB.slice(), bg: bgRGB.slice() }),
    setColors: (fg, bg) => { set_fgRGB(fg.slice()); set_bgRGB(bg.slice()); syncBrushSwatches(); },
    hasDoc: inPreview,
    adjustKinds: () => Object.keys(ADJ_KINDS_MENU || {}).map(k => ({ kind: k, label: ADJ_KINDS_MENU[k].label })),
    addAdjustment: k => addAdjustmentLayer(k),
    selectLayer: i => { set_selLayer(i); renderLayerPanel(); },
    onHistoryJump: i => historyJump(i), onHistorySource: i => selectHistorySource(i),
    channelView: () => ({ single: chanView.single, off: new Set(chanView.off), supported: chanSupported() }),
    setChannelView,
    loadChannelSelection,
    compositeCanvas: () => (doc && docW ? chanThumb : null),
    
    alphaChannels: () => docAlphaChannels().map(c => ({ at: c.at, name: c.name, thumb: docAlphaThumb(c.at) })),
    loadAlphaSelection,
    renameAlpha: at => renameAlphaChannelUI(at),
    pathRows: pathPanelRows,
    onPathClick: onPathRowClick,
  });
  
  {
    const flatOf = i => (layerTree && layerTree.flat && layerTree.flat[i]) || null;
    const adjApi = {
      target: i => adjLayerTarget(i),
      
      get curveView(){ return { ...curveView }; },
      setCurveView(v){ setCurveView(v); renderProps(); },
      
      get: (i, t, path) => { const b = blockValue(t.main, path); return b === undefined ? undefined : effParam(i, t.main.target, 0, path, b); },
      paths: t => t.main.fields.map(f => f.path),
      
      setMany(i, t, map, label){
        pushDocHistory(label || '编辑'); const lock = docHistLock; set_docHistLock(true);
        const entries = [];
        for (const [path, v] of Object.entries(map)) { const b = blockValue(t.main, path); if (b !== undefined) entries.push([path, v, b]); }
        try { setParamFieldsBatch(i, t.main.target, 0, entries); }
        finally { set_docHistLock(lock); }
        const n = entries.length;
        renderLayerPanel(); renderProps();
        return n;
      },
      curves(i, t){ const keep = adjCtlState.idx; adjCtlState.idx = i;
        try { return curveChannelOptions(t).map(([ch]) => curvePtsOf(t, { channel: ch }).map(p => ({ input: p.input, output: p.output }))); } finally { adjCtlState.idx = keep; } },
      setCurves(i, t, lists, label){
        pushDocHistory(label || '编辑'); set_layerEditInProgress(true); const lock = docHistLock; set_docHistLock(true);
        try { const n = curveChannelOptions(t).length; lists.slice(0, n).forEach((list, ch) => { if (list && list.length >= 2) commitCurveList(i, t, { channel: String(ch) }, list); }); }
        finally { set_docHistLock(lock); set_layerEditInProgress(false); }
        renderLayerPanel(); renderProps();
      },
      reset: (i, t) => resetAdjLayer(i, t.kind),
      histogram: i => adjLayerHistogram(i),
    };
    set_PP(installPropsPS({
      actions, panels, shell, icon, hasIcon: hasUiIcon, formDialog, alertDialog, confirmDialog, PREF,
      doc: () => doc, docW: () => docW, docH: () => docH, resolution: () => docResolution,
      setResolution(v){ v = +v; if (!(v > 0) || Math.abs(v - docResolution) < 1e-6) return; pushDocHistory('分辨率'); set_docResolution(v); shell.status(`分辨率改为 ${v} 像素/英寸（像素未变）`); renderProps(); },
      resizeCanvas: (w, h) => { if (resizeCanvas(w, h, 4, bgRGB)) { actRecord('canvasSize', { width: w, height: h }); refreshAll(false); } },
      openImageSize: openImageSizeDialog, openCanvasSize: openCanvasSizeDialog,
      setTool: n => setDocTool(n), grid: () => ({ ...gridOpts }), guidesCount: () => guides.length,
      selLayer: () => selLayer, selLayers: () => [...selLayers], layer: flatOf, docLayer: i => (doc && doc.layers[i]) || null,
      layerName: i => layerRenames[i] || (flatOf(i) || {}).name || '',
      renderProps: () => renderProps(), renderLayerPanel: () => renderLayerPanel(), renderStatic: () => renderStaticLayers(),
      transformOf: i => getPropertyTransformValues(i), moveLockWhy: i => moveLockWhy(i),
      hasPixels: i => { const l = doc && doc.layers[i]; return !!(l && ((l.rgba && l.width > 0 && l.height > 0) || textCrops[i] || isVectorOnlyLayer(i))); },
      groupMembers: i => artboardMembers(i),
      moveLayersBy(list, dx, dy){
        const free = list.filter(i => doc.layers[i] && !layerDeletes.has(i) && !moveLockWhy(i));
        if (!free.length || (!dx && !dy)) return false;
        pushDocHistory('移动'); const lock = docHistLock; set_docHistLock(true);
        try {
          for (const i of free) {
            if (isVectorOnlyLayer(i)) { const v2 = getPropertyTransformValues(i); setShapePropertyTransform(i, { x: v2.x + dx, y: v2.y + dy }); continue; }
            const l = doc.layers[i];
            if (!((l.rgba && l.width > 0 && l.height > 0) || textCrops[i])) continue;
            const v = getTransformValues(i); setLayerPos(i, v.x + dx, v.y + dy);
          }
        } finally { set_docHistLock(lock); }
        drawGizmo(); renderProps(); return true;
      },
      align: how => alignPropertyLayers(how), distribute: how => distributeLayers(how),
      ALIGN_BTNS, ALIGN_LABEL, DISTRIBUTE_ICONS,
      
      mask: {
        num: (i, f, d) => effMaskNum(i, flatOf(i), f, d), flag: (i, f) => effMaskFlag(i, flatOf(i), f),
        setFlag(i, f, v){ const l = flatOf(i); setOpField(i, { op: 'setMaskProps' }, f, v, !!(l.mask && l.mask[f])); renderProps(); },
        setNum(i, f, v, dflt){ setOpField(i, { op: 'setMaskProps' }, f, v, baseMaskNum(flatOf(i), f, dflt)); },
        base: (i, f, d) => baseMaskNum(flatOf(i), f, d),
        vflag(i, f){ const p = doc.layers[i] && doc.layers[i].vectorMask; const v = opField(i, 'setVectorMaskFlags', f); return v !== undefined ? !!v : !!(p && p[f]); },
        pending: i => maskStructOp(i),
        loadSelection(i, mode){ if (!selReady('从蒙版载入选区')) return false; const g = maskGrayOnCanvas(i); if (!g) { shell.status('这个图层没有像素蒙版'); return false; }
          combineInto(createSelection(docW, docH, 0, 0, docW, docH, Uint8Array.from(g)), mode || 'replace'); return true; },
        vectorToSelection(i, mode){ try { return pathToSelection(i, mode || 'replace'); } catch (e) { shell.status('矢量蒙版转选区没能完成：' + (e && e.message || e)); return false; } },
        grayOnCanvas: i => maskGrayOnCanvas(i),
        fromSelection: i => maskFromSelection(i),
        selectAndMask: i => maskSelectAndMask(i),
        colorRange: i => runLazy(SELECT, '色彩范围', () => openColorRangeDialog({ onDone: () => { if (selLayer === i) { maskFromSelection(i); setSelection(null, { history: false }); renderProps(); } } })),
      },
      hasSelection: () => !!selection,
      adj: adjApi,
      layerOpsSnapshot: () => layerOpsSnapshot(), restoreLayerOps: s => { restoreLayerOps(s); renderStaticLayers(); },
      gizmo: () => ({ el: gizmoCanvas(), tx: { ...gizmoTx } }),
      stageCanvas: id => $(id),
      snapshotCanvas: max => docSnapshotCanvas(max),
      openCharacter: () => actions.run('window.character'), openParagraph: () => actions.run('window.paragraph'),
      soInfo: so => so ? { name: so.sourceImage?.filename || '', linked: !!(so.sourceImage && so.sourceImage.linked) || so.sourceImage?.embedded === false, embedded: !!(so.sourceImage && so.sourceImage.embedded) } : null,
    }));
    set_ADJP(installAdjustmentsPanel({
      actions, panels, shell, icon, hasIcon: hasUiIcon, formDialog, psPanels,
      hasDoc: () => !!doc && !li, adjustKinds: () => Object.keys(ADJ_KINDS_MENU || {}),
      label: k => (ADJ_KINDS_MENU[k] || {}).label || k,
      addAdjustment: (k, values, opts) => addAdjustmentLayer(k, values, opts),
      addPreset: (preset, opts) => addAdjustmentPreset(preset, opts),
      stageCanvas: id => $(id), snapshotCanvas: max => docSnapshotCanvas(max),
      docW: () => docW, docH: () => docH, docKey: () => (doc ? docName + ':' + histLog.cursor + ':' + docW + 'x' + docH : ''),
      BLEND_KEYS, BLEND_LABELS,
    }));
  }
  bindPathPanelChrome();
  installPresetLibrary();
  installActionsPanel();
  
  set_HXP(installHistoryPanel({
    panels, status: m => shell.status(m), scOf: a => { try { return shortcuts.labelFor(a); } catch { return ''; } },
    hasDoc: () => !!doc, hasLayer: () => !!doc && selLayer >= 0, layerCount: () => doc ? doc.layers.length : 0,
    busy: () => !!(li || curStroke || auxDrag), docName: () => docName, docSize: () => ({ w: docW, h: docH }),
    log: () => histLog, setLog: (items, cursor) => { histLog.items = items; histLog.cursor = cursor; },
    jump: i => historyJump(i), step: back => { const r = historyStep(back); updateUndoButtons(); return r; },
    capture: noStacks => hxCapture(noStacks), applyCtx: (ctx, fresh) => hxApplyCtx(ctx, fresh),
    

    thumb: () => { try { if (gpuSnapshotCanvas() || (!GPUV.stale && !proofOn && !cmDisplay() && chanView.single === null && !chanView.off.size)) { const c = docSnapshotCanvas(96); if (c) return c; } return rgbaThumbCanvas(compositeNowRGBA(), docW, docH); } catch { return docSnapshotCanvas(96); } }, sourceMapNow: historySourceMapNow, derivedSnapshot: hxDerivedSnapshot, newDocFromState: hxNewDocFromState,
    sourceItem: () => historySourceInfo && historySourceInfo.item,
    setSource: (item, map, w, h) => { set_historySource(map); set_historySourceInfo({ item, width: w, height: h }); syncAuxBar(); shell.status('已将「' + (item.name || item.label) + '」设为历史记录画笔的源'); },
    setSourceFromState: i => selectHistorySource(i),
    resetSource: () => captureHistorySource(true),
    resetStacks: () => { docHistory.undo.length = 0; docHistory.redo.length = 0; brushHistory.undo.length = 0; brushHistory.redo.length = 0; },
    dropRedo: n => { if (n.doc) docHistory.redo.splice(0, n.doc); if (n.brush) brushHistory.redo.splice(0, n.brush); },
    sync: () => updateUndoButtons(),
  }));
  DOC_EXT.push({ key: 'history', label: '历史记录', capture: () => HXP.capture(), apply: v => HXP.apply(v) });   
  for (const it of histLog.items) HXP.stamp(it);
  set_NOTESP(installNotesPanel(notesApi()));
  installBrushLib();
  
  panels.setPanelMenu('channels', () => {
    const why = alphaWriteWhy();
    const alphas = docAlphaChannels();
    const last = alphas.length - 1;
    const item = (label, run, ok) => ({ label, disabled: !!why || !ok, run });
    return [
      item('新建通道', () => newAlphaChannelUI(), true),
      item('复制通道', () => duplicateAlphaChannelUI(last), last >= 0),
      item('删除通道', () => deleteAlphaChannelUI(last), last >= 0),
      { sep: true },
      item('重命名通道…', () => renameAlphaChannelUI(last), last >= 0),
      ...(why ? [{ sep: true }, { label: why, disabled: true }] : []),
    ];
  });
  
  set_CHP(installChanPathPanels({
    st: () => ({ doc, docW, docH, docName, origBuffer, selection, li, selLayer }),
    status: t => shell.status(t), dialogs: { promptDialog, choiceDialog, confirmDialog, formDialog, alertDialog },
    isMac: shortcuts.IS_MAC, bindKey: (spec, id) => shortcuts.bind(spec, id),
    alphaList: () => docAlphaChannels(), alphaGray: at => docAlphaGray(at), alphaThumb: (at, w, h) => docAlphaThumb(at, w, h), alphaWhy: () => alphaWriteWhy(),
    structural: (label, fn) => lxStructural(label, fn),
    chanView: () => ({ single: chanView.single, off: new Set(chanView.off), supported: chanSupported() }),
    setChannelView: o => setChannelView(o), compositeThumb: () => (doc && docW ? chanThumb : null),
    isPreviewCanvas: cv => { try { return cv === viewScratch.get('#below'); } catch { return false; } },
    renderPreview: () => renderPreviewOnly(),
    colorChannelGray: c => {
      const order = (layerReorder || doc.layers.map((_, i) => i)).filter(i => !layerDeletes.has(i));
      const src = compositeAll(composeDocForOrder(previewCompositeDoc(doc), order), docW, docH, new Map()).data;
      const g = new Uint8Array(docW * docH), ch = c == null ? null : Math.max(0, Math.min(2, c | 0));
      for (let i = 0, o = 0; i < g.length; i++, o += 4) g[i] = ch === null ? Math.round(src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114) : src[o + ch];
      return g;
    },
    graySelection: (gray, mode, label) => graySelectionUI(gray, mode, label),
    selectionGray: () => (selection ? selectionGrayFull(selection) : null),
    compositeRGBA: () => { try { return sampleRGBA(true); } catch { return null; } },
    layerCount: () => (doc ? doc.layers.length : 0), isSingleBackground: () => !!doc && doc.layers.length === 1 && isBackgroundLayer(0),
    flatten: () => mergeLayersUI('flatten'),
    grayDoc: async (gray, w, h) => {
      if (!await ensureLazy(EDIT, '新建文档')) return null;
      const m = await NEWDOC.load(), blank = m.createPsd({ width: w, height: h, mode: 'gray', background: 'white', name: '背景' });
      const rgba = new Uint8Array(w * h * 4); for (let i = 0, o = 0; i < gray.length; i++, o += 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = gray[i]; rgba[o + 3] = 255; }
      return applyEdits(blank, [{ op: 'replaceLayerPixels', index: 0, rgba: { data: rgba, width: w, height: h }, bounds: { top: 0, left: 0, bottom: h, right: w } }]).buffer;
    },
    rgbDoc: (px, w, h) => psdFromPixels(px, w, h, '背景', 'white'),
    
    modePlanes: async () => {
      if (!doc || !origBuffer) return null;
      let buf = origBuffer;
      if (hasAnyEdits()) { if (!await ensureLazy(EDIT, '分离通道')) return null; buf = (await buildPsdBuffer({ fast: true })).buf; }
      const img = decodeCompositeImage(buf);
      const nColor = { 1: 1, 8: 1, 3: 3, 4: 4, 9: 3 }[doc.mode] ?? (img.channels.length - docAlphaChannels().length);
      const names = { 4: ['青色', '洋红', '黄色', '黑色'], 9: ['明度', 'a', 'b'], 3: ['红', '绿', '蓝'], 1: ['灰色'], 8: ['灰色'] }[doc.mode]
        || Array.from({ length: nColor }, (_, k) => `通道 ${k + 1}`);
      const to8 = p => { if (p instanceof Uint8Array && p.length === docW * docH) return p; const o = new Uint8Array(docW * docH); for (let i = 0; i < o.length; i++) o[i] = p.length === o.length * 2 ? p[i * 2] : (p[i] >> 8); return o; };
      return { mode: doc.mode, names: names.slice(0, nColor), planes: img.channels.slice(0, nColor).map(to8) };
    },
    flatDoc: async (planes, w, h, mode) => {
      
      if (mode === 4) {
        try {
          const rgb = await psdFromPixels(new Uint8Array(w * h * 4).fill(255), w, h, '背景', 'white');
          const bounds = { top: 0, left: 0, bottom: h, right: w };
          let out = rebuildPsdChannels(rgb, new Map([[0, { bounds, planes: planes.map((data, id) => ({ id, data })) }]]), { planes }, { colorMode: 'cmyk' });
          
          try { const Pf = CM && await CM.getProfile(CM.settings.cmyk); if (Pf && Pf.bytes) out = setEmbeddedProfile(out, Pf.bytes); } catch {}
          return out;
        } catch (e) { console.warn('CMYK 分层文档没造出来，退回拼合文档', e); }
      }
      return buildFlatPsd({ width: w, height: h, mode, planes });
    },
    openBuffer: (buf, name, msg) => DOCS.openBuffer(buf, name, msg),
    grayDocs: async () => {
      const out = [];
      for (const d of DOCS.buffers()) {
        const buf = d.active ? origBuffer : d.buf; if (!buf) continue;
        try {
          const u = new Uint8Array(buf); if (((u[24] << 8) | u[25]) !== 1) continue;      
          const sd = await parsePsdRaster(buf, { strictChannels: true }), sf = compositeAll(sd, sd.width, sd.height, new Map());
          const g = new Uint8Array(sd.width * sd.height); for (let i = 0; i < g.length; i++) g[i] = sf.data[i * 4];
          out.push({ name: d.name, w: sd.width, h: sd.height, gray: g });
        } catch {}
      }
      return out;
    },
    pushDocHistory: label => pushDocHistory(label),
    savedPaths: () => { ensureDocPaths(); return savedPaths; }, pathRows: () => pathPanelRows(), refreshPaths: () => psPanels.refreshPaths(layerTree),
    pathMenuFn: () => pathsMenuBase, workPathActive: () => activePath === 'work' && !!workPath,
    nextPathName: () => nextPathName(), newPath: nm => newSavedPathUI(nm), deletePath: () => deleteActivePathUI(),
    activePathName: () => (activePath ? docPathLabel(activePath) : null),
  }));
  
  installColorPanel({ panels, getColors: () => ({ fg: fgRGB.slice(), bg: bgRGB.slice() }),
    setColors: (fg, bg) => { set_fgRGB(fg.slice(0, 3)); set_bgRGB(bg.slice(0, 3)); syncBrushSwatches(); try { syncGradBar(); syncBucketBar(); } catch {} },
    openPicker: which => pickColor(which), profiles: () => CM.colorPanelProfiles(), status: t => shell.status(t) });
  syncBrushSwatches();
  
  for (const b of document.querySelectorAll('.layer-foot .lf-btn[data-action]')) b.addEventListener('click', () => { if (b.dataset.action) { if (!actions.run(b.dataset.action)) shell.status('该命令当前不可用'); } });
  wireLayerFootDrops();      
  for (const b of document.querySelectorAll('.lock-row .lock-btn')) {
    b.setAttribute('data-title-base', b.title);
    b.addEventListener('click', () => {
      const map = LOCK_BTN_FIELD[b.dataset.lock]; if (!map) return;
      if (b.dataset.lock === 'transparent' && isBackgroundLayer(selLayer)) { unlockBackground(selLayer); return; }
      toggleLayerLock(selLayer, map[0], map[1]);
    });
  }
  const syncFootBtns = () => { const on = inPreview(); for (const b of document.querySelectorAll('.layer-foot .lf-btn[data-action]')) b.disabled = !on;
    syncLockRow(); const f = $('#hdrFill'); if (f) f.disabled = !hasLayer(); };
  panels.onChange(syncFootBtns);
  const _renderLayerPanel = renderLayerPanel;
  set___syncPsPanels(() => { syncFootBtns(); psPanels.refreshChannels(doc); psPanels.refreshPaths(layerTree); psPanels.refreshAdjustments(); });
}
