




import './24-layer-ops-queue.js';   
import { patternToRGBA } from '../../../core/app.js';
import { BRUSH_PRESETS, defaultDynamics, normalizeDynamics } from '../../../core/brush-engine.js';
import { actions } from '../actions.js';
import { whenIdle } from '../lazy.js';
import { installBrushLibrary, brushLib } from '../brushes-panel.js';
import { confirmDialog, promptDialog, choiceDialog, formDialog, alertDialog } from '../dialog.js';
import { DOCS } from '../documents.js';
import { uiIcon } from '../icons.js';
import { panels } from '../panels.js';
import { installPresets } from '../presets-panels.js';
import { isShapeLayer } from '../property-panel.js';
import { shell } from '../shell.js';
import { tools } from '../tools.js';
import { $, EDIT, QUADW, SELECT, applyEdits, ellipseSelection, ensureLazy, rectSelection, runLazy } from './01-boot.js';
import {
  LP, doc, docH, docName, docStack, docW, layerEdits, layerOps, layerRenames, layerTree, li, origBuffer,
  pixelPaint, psdFromPixels, selection, set_curStroke,
} from './02-doc-state.js';
import {
  ACTP, LAST_RUN, pushDocHistory, set_ACTP, set_LAST_RUN, structuralBegin, structuralDone,
} from './03-history.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { zoomOpts } from './06-view-zoom-move.js';
import { resizeCanvas, resizeImage } from './08-doc-size.js';
import { applyTextStyle, isTextLayer, textToolOpts } from './09-text-tool.js';
import { commitCrop, cropOpts, set_cropState } from './10-crop.js';
import {
  GRAD_PRESET_GROUPS, bucketOpts, eyeOpts, gradCurrentModel, gradOpts, gradPresetModel, makeZip, safeName,
} from './11-paint-common.js';
import { downloadDataURL, layerNameOf, pixelsToCanvas } from './13-quickmask-apply-image.js';
import { fillWith } from './14-edit-misc.js';
import { gradModelCssBy, gradPickPreset, syncBucketBar, syncGradBar } from './15-gradient-bucket-eyedropper.js';
import { applyFilterLazy, openFilterLazy } from './16-filters-menu.js';
import {
  afterWorkPathChange, commitShapePath, docPathLabel, ensureDocPaths, isDocPathKey, pathTargetKey, penOpts,
  setDocPath, set_activePath, shapeOpts,
} from './17-shape-pen.js';
import { freePenOpts, setCustomShape } from './18-pen-extra.js';
import { actApplyTransform } from './19-free-transform.js';
import { duplicateLayerUI, hasAnyEdits, hitLayerAt, refreshAll } from './20-snap-smart-object.js';
import { decodeImageFile, initDocument, isImageFileName, loadPsd, openImageAsDocument } from './21-load-document.js';
import { layerOrderView, renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { cloneOpValue, humanEditError, renderProps, setSingleOp } from './24-layer-ops-queue.js';
import { createLayerUI, openNewFillDialog } from './26-layer-create.js';
import { gradModelStops, setLayerBlend, setLayerOpacity, setLayerVisible } from './27-gradient-editor.js';
import { batchTargets, getTransformValues, setLayerPos, syncLayerControls } from './28-layer-props-transform.js';
import { PREVIEW_EFFECT_MULTI, previewCompositeDoc, renderPreviewOnly, renderStaticLayers } from './30-render.js';
import {
  DOC_TOOLS, PAINT_TOOLS, TOOL_RESETTERS, artHistoryOpts, bgRGB, brush, docTool, eraserOpts, fgRGB, hexOf,
  mixerOpts, moveOpts, noteOpts, pencilOpts, resetToolOptions, samplerOpts, setDocTool, set_bgRGB, set_fgRGB,
  toolModes,
} from './31-selection-brush.js';
import { combineInto, mqOpts, sampleRGBA, sbOpts, syncToolOptions, wandOpts } from './32-cursors-select-options.js';
import { magOpts, osOpts, qsOpts } from './33-lasso-quick-select.js';
import { pcropOpts, sliceOpts } from './34-perspective-crop-slice.js';
import { AB_BAR_ICONS, frameOpts } from './36-clipboard-frame.js';
import {
  BRUSHOP_TOOLS, beginBrushOpStroke, bgeOpts, boOpts, crOpts, meOpts, syncBrushOpBar,
} from './37-local-pixel-tools.js';
import {
  beginStroke, emitDab, endStroke, selCovFn, strokeSetup, strokeTo, syncBrushSwatches,
} from './38-brush-engine.js';
import {
  adjBrushOpts, applyBrushPreset, applyBrushRecord, beginEraserStroke, bsPanelOpen, currentBrushRecord, effFlow,
  effOpacity, renderBrushSettings, renderPresetList, setBrushSize, syncBrushControls,
} from './39-brush-options.js';
import { adjDefaults, adjRender, adjState, openAdjustLazy, renderAdjustDialog } from './41-image-adjust.js';
import { panelPathSubs } from './44-vector-path.js';
import { pathOpts, setShapeContentType } from './45-path-tools.js';
import { drawGizmo, toDoc } from './46-smart-filter-panel.js';
import { buildPsdBuffer, canvasToBlob, ensureStructuralBase } from './48-info-export.js';
import { applyTrim, rotateCanvas } from './51-image-select-menu.js';
import { docAlphaChannels } from './52-alpha-text-menu.js';
import { retouchOpts, rtBuiltinPatterns } from './53-retouch-clone-pattern.js';
import { syncRetouchBar } from './54-gestures-hints.js';




async function runStructuralOps(ops, label, selectIndex){
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, label)) return false;
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    const keep = selLayer;
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const fillOps = LP?.opts.defaultMask ? ops.flatMap(op => op.op === 'addFillLayer' && Number.isInteger(op.at) && !ops.some(m => m.op === 'addLayerMask' && m.index === op.at)
      ? [op, { op: 'addLayerMask', index: op.at, fill: 'reveal', compact: docW * docH > 64e6, bounds: { top: 0, left: 0, bottom: docH, right: docW }, defaultColor: 255 }] : [op]) : ops;
    const r = applyEdits(base, fillOps);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(selectIndex ?? keep, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, label);
    shell.status(`已应用：${label}`);
    return true;
  } catch (e) {
    $('#err').textContent = `${label}没能完成：` + humanEditError(e && e.message || e);
    return false;
  }
}

function selectionRectForPattern(){
  const s = selection; if (!s || !s.data) return null;
  let x0 = s.width, y0 = s.height, x1 = -1, y1 = -1;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (s.data[y * s.width + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { x: 0, y: 0, w: 0, h: 0 };
  const L = Math.max(0, s.x + x0), T = Math.max(0, s.y + y0), R2 = Math.min(docW, s.x + x1 + 1), B = Math.min(docH, s.y + y1 + 1);
  return { x: L, y: T, w: Math.max(0, R2 - L), h: Math.max(0, B - T) };
}
function setFgBg(fg, bg){
  if (fg) set_fgRGB(fg.slice()); if (bg) set_bgRGB(bg.slice());
  syncBrushSwatches(); try { syncGradBar(); syncBucketBar(); } catch {}
}



export const waitIdle = async () => {
  
  for (let k = 0; k < 2; k++) await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  while ([...document.querySelectorAll('dialog')].some(d => d.open)) await new Promise(r => setTimeout(r, 120));
};
const needLayer = () => { if (!doc || li) throw new Error('没有可编辑的文档'); if (selLayer < 0) throw new Error('没有选中图层'); };
function actPathPoints(){
  const subs = panelPathSubs(); if (!subs || !subs.length) return null;
  return subs.map(sp => ({ closed: sp.closed !== false, points: sp.knots.map(k => ({ x: k.anchor[0], y: k.anchor[1], inX: k.in[0], inY: k.in[1], outX: k.out[0], outY: k.out[1], smooth: true })) }));
}
function actSetWorkPath(p){
  if (!doc) throw new Error('没有文档');
  ensureDocPaths();
  const subs = (p.subpaths || []).map(sp => ({ closed: sp.closed !== false, operation: 1,
    knots: (sp.points || []).map(pt => ({ anchor: [pt.x, pt.y], in: [pt.inX ?? pt.x, pt.inY ?? pt.y], out: [pt.outX ?? pt.x, pt.outY ?? pt.y] })) }));
  setDocPath('work', subs, '工作路径'); set_activePath('work'); afterWorkPathChange();
}
async function actAdjust(type, model, withDialog){
  needLayer();
  await openAdjustLazy(type);
  if (!adjState) throw new Error($('#err').textContent || '图像调整打不开');
  adjState.model = { ...adjDefaults(type), ...JSON.parse(JSON.stringify(model || {})) };
  renderAdjustDialog(); adjRender();
  if (withDialog) { await waitIdle(); return true; }
  $('#adjOk').onclick();
  return true;
}
async function actFilter(p, withDialog){
  needLayer();
  const kind = p.kind, params = p.params || {};
  if (withDialog) { await openFilterLazy(kind, params); await waitIdle(); return true; }
  const r = await applyFilterLazy(kind, params);
  if (r === false && $('#err').textContent) throw new Error($('#err').textContent);
  return r;
}

export async function actExportBytes(format, quality = 90){
  const built = await buildPsdBuffer();
  if (format === 'psd') return new Uint8Array(built.buf);
  let cv = built.canvas;
  if (!cv) { const c = built.composite; cv = pixelsToCanvas({ rgba: c.data, w: c.width, h: c.height }); }
  if (format === 'jpg') {            
    const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
    const g = t.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height); g.drawImage(cv, 0, 0); cv = t;
  }
  const blob = await canvasToBlob(cv, format === 'jpg' ? 'jpg' : 'png', quality);
  return new Uint8Array(await blob.arrayBuffer());
}
let actSaveHook = null;              
export const ACT_EXEC = {
  
  toolStroke: p => {
    if (!doc || li || !p || !Array.isArray(p.pts) || !p.pts.length) throw new Error('这一笔没有路径');
    const keep = { tool: docTool, size: brush.size, fg: fgRGB.slice(), bg: bgRGB.slice() };
    try {
      if (p.tool && p.tool !== docTool) setDocTool(p.tool);
      if (p.size) brush.size = p.size;
      if (p.fg) set_fgRGB(p.fg.slice()); if (p.bg) set_bgRGB(p.bg.slice());
      const ev = { pointerId: 1, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, clientX: 0, clientY: 0 };
      const pt0 = { x: p.pts[0][0], y: p.pts[0][1], p: p.pts[0][2] };
      const S = docTool === 'eraser' ? beginEraserStroke(pt0, ev) : BRUSHOP_TOOLS.has(docTool) ? beginBrushOpStroke(pt0, ev) : beginStroke(pt0, { tool: docTool });
      if (!S) throw new Error(($('#err').textContent || '这把工具现在用不了').replace(/^.*?用不了：/, ''));
      set_curStroke(S);
      for (let i = 1; i < p.pts.length; i++) strokeTo(S, { x: p.pts[i][0], y: p.pts[i][1], p: p.pts[i][2] });
      S.forced = true; endStroke();
      renderPreviewOnly();
    } finally {
      if (keep.tool !== docTool) setDocTool(keep.tool);
      brush.size = keep.size; set_fgRGB(keep.fg); set_bgRGB(keep.bg); syncBrushSwatches();
    }
  },
  newLayer: p => { if (!doc || li) throw new Error('没有可编辑的文档'); return createLayerUI(p); },
  fill: p => { needLayer(); return fillWith({ contents: p.using, color: p.color ? hexOf(p.color) : undefined, mode: p.mode, opacity: p.opacity, preserve: p.preserve }); },
  filter: (p, dlg) => actFilter(p, dlg),
  adjust: (p, dlg) => actAdjust(p.type, p.model, dlg),
  invert: (p, dlg) => actAdjust('invert', {}, dlg),
  desaturate: (p, dlg) => actAdjust('desaturate', {}, dlg),
  layerProps: p => {
    needLayer();
    pushDocHistory('图层属性');
    for (const i of batchTargets(selLayer)) {
      if (p.opacity != null) setLayerOpacity(i, Math.round(Math.max(0, Math.min(100, p.opacity)) * 2.55));
      if (p.mode) setLayerBlend(i, p.mode);
    }
    if (p.name != null) layerRenames[selLayer] = String(p.name);
    if (p.fillOpacity != null) { const L = layerTree && layerTree.flat[selLayer]; if (L) { const orig = L.fillOpacity != null ? L.fillOpacity : 255, v = Math.round(p.fillOpacity * 2.55); setSingleOp(selLayer, { op: 'setFillOpacity', index: selLayer, fillOpacity: v }, v === orig); } }
    syncLayerControls(); renderLayerPanel(); renderProps();
    return true;
  },
  visible: p => { needLayer(); pushDocHistory('显示/隐藏图层'); setLayerVisible(selLayer, !!p.visible); renderLayerPanel(); return true; },
  duplicateLayer: () => { needLayer(); return duplicateLayerUI(selLayer); },
  selectLayer: p => {
    if (!doc) throw new Error('没有文档');
    const v = layerOrderView(), order = v.visible.slice();          
    let t = -1;
    if (p.name != null) t = order.find(i => layerNameOf(i) === p.name) ?? -1;
    else { const k = order.indexOf(selLayer); t = p.dir === 'top' ? order[0] : p.dir === 'bottom' ? order[order.length - 1] : p.dir === 'up' ? order[Math.max(0, k - 1)] : order[Math.min(order.length - 1, k + 1)]; }
    if (t == null || t < 0) throw new Error(p.name != null ? `没有名为「${p.name}」的图层` : '没有可选的图层');
    set_selLayer(t); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo();
    return true;
  },
  selectShape: async p => {
    if (!doc) throw new Error('没有文档');
    await ensureLazy(SELECT, '选区');
    const x = p.left, y = p.top, w = p.right - p.left, h = p.bottom - p.top;
    const sel = (p.ellipse ? ellipseSelection : rectSelection)(docW, docH, x, y, w, h, { feather: p.feather || 0, antialias: p.antiAlias !== false });
    combineInto(sel, p.mode || 'replace');
    return true;
  },
  imageSize: p => {
    if (!doc) throw new Error('没有文档');
    let W = p.width, H = p.height;
    if (p.wUnit === '#Prc') W = docW * W / 100; if (p.hUnit === '#Prc') H = docH * H / 100;
    if (!Number.isFinite(W) && Number.isFinite(H)) W = docW * H / docH;           
    if (!Number.isFinite(H) && Number.isFinite(W)) H = docH * W / docW;
    return resizeImage(W, H);
  },
  canvasSize: p => {
    if (!doc) throw new Error('没有文档');
    let W = p.width, H = p.height;
    if (p.wUnit === '#Prc') W = docW * W / 100; if (p.hUnit === '#Prc') H = docH * H / 100;
    if (p.relative) { W = docW + (W || 0); H = docH + (H || 0); }
    if (!Number.isFinite(W)) W = docW; if (!Number.isFinite(H)) H = docH;
    const anchor = { left: 0, center: 1, right: 2 }[p.h || 'center'] + 3 * { top: 0, center: 1, bottom: 2 }[p.v || 'center'];
    return resizeCanvas(W, H, anchor, bgRGB);
  },
  rotateCanvas: p => runLazy(QUADW, '旋转画布', () => rotateCanvas(p.angle, '旋转画布')),
  trim: p => runLazy(QUADW, '裁切', () => applyTrim(p.basis || 'transparent', { top: true, bottom: true, left: true, right: true })),
  crop: p => {
    if (!doc) throw new Error('没有文档');
    if (p.toSelection) return actions.run('image.crop');
    let r = { x: p.left, y: p.top, w: p.right - p.left, h: p.bottom - p.top };
    if (p.unit === '#Prc') r = { x: docW * p.left / 100, y: docH * p.top / 100, w: docW * (p.right - p.left) / 100, h: docH * (p.bottom - p.top) / 100 };
    set_cropState({ rect: r, angle: p.angle || 0, off: { x: 0, y: 0 }, drag: null, ratio: 'free', del: p.deletePixels !== false, overlay: 'thirds', pushed: false });
    return commitCrop(false);
  },
  transform: p => actApplyTransform(p),
  move: p => { needLayer(); pushDocHistory('移动'); for (const i of batchTargets(selLayer)) { const v = getTransformValues(i); setLayerPos(i, v.x + (p.dx || 0), v.y + (p.dy || 0)); } renderStaticLayers(); drawGizmo(); return true; },
  save: async p => {
    if (actSaveHook) return actSaveHook(p);
    const bytes = await actExportBytes(p.format || 'psd', p.quality || 90);
    const ext = p.format === 'png' ? 'png' : p.format === 'jpg' ? 'jpg' : 'psd';
    const url = URL.createObjectURL(new Blob([bytes])); downloadDataURL(url, safeName((docName || '未标题').replace(/\.ps[db]$/i, '')) + '.' + ext); setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  },
  color: p => { setFgBg(p.which === 'bg' ? null : p.rgb, p.which === 'bg' ? p.rgb : null); return true; },
  workPath: p => actSetWorkPath(p),
};


const AUTOMATE_IDS = ['file.batch', 'file.contactSheet', 'file.cropAndStraighten', 'file.imageProcessor', 'file.pdfPresentation'];
let actionsPanelP = null;
export function installActionsPanel(){
  if (!actionsPanelP) {
    actions.registerLazy(AUTOMATE_IDS, () => installActionsPanel());
    actionsPanelP = new Promise(res => whenIdle(res, 2500)).then(installActionsPanelNow);
  }
  return actionsPanelP;
}
async function installActionsPanelNow(){
  let installActions, installAutomate;
  try { ({ installActions } = await import('../actions-panel.js')); ({ installAutomate } = await import('../automate.js')); }
  catch (e) { console.warn('[actions] 动作面板代码包没载入', e); actionsPanelP = null; return; }
  try {
    set_ACTP(await installActions({
      panels, uiIcon, exec: ACT_EXEC,
      status: t => shell.status(t),
      hasDoc: () => !!doc && !li,
      lastRun: () => LAST_RUN, clearLastRun: () => { set_LAST_RUN(null); },
      settle: waitIdle,
      currentPath: actPathPoints,
      
      condInfo: () => {
        const L = layerTree && layerTree.flat && layerTree.flat[selLayer], dl = doc && doc.layers[selLayer];
        const vis = selLayer >= 0 ? (layerEdits[selLayer] && layerEdits[selLayer].visible != null ? layerEdits[selLayer].visible : !(dl && dl.hidden)) : false;
        return { mode: doc ? doc.mode : 3, depth: doc ? doc.depth : 8, w: docW, h: docH, hasSel: !!selection, layers: doc ? doc.layers.length : 0,
          alpha: (() => { try { return docAlphaChannels().length > 0; } catch { return false; } })(),
          layer: selLayer < 0 || !L ? null : { bg: isBackgroundLayer(selLayer), visible: vis, text: !!L.text, shape: isShapeLayer(L), smart: !!L.isSmartObject,
            group: L.groupType === 1 || L.groupType === 2, adjust: !!L.adjustment, pixels: !!(dl && dl.rgba && dl.width > 0 && dl.height > 0), mask: !!(dl && dl.mask), vmask: !!(L.vectorMask),
            fx: !!(L.effects || L.lfx2 || L.lmfx || (layerOps[selLayer] || []).some(o => /Style|Effect/i.test(o.op))), clip: !!(dl && dl.clipping) } };
      },
    }));
  } catch (e) { console.warn('[actions] 动作面板没装上', e); }
  try {
    installAutomate({
      actions: ACTP, formDialog, alertDialog, confirmDialog, makeZip, status: t => shell.status(t),
      openFile: async f => { const ok = isImageFileName(f) ? await openImageAsDocument(f) : (await loadPsd(f), !$('#err').textContent); return ok !== false && !!doc; },
      closeDoc: () => DOCS.closeView(undefined, { discard: true }),
      exportBytes: actExportBytes, resizeImage: (w, h) => resizeImage(w, h),
      docSize: () => ({ w: docW, h: docH }), docName: () => docName || '',
      hasDoc: () => !!doc && !li,
      compositeRGBA: () => sampleRGBA(true),
      decodeImage: f => decodeImageFile(f),
      newDocFromRGBA: async (rgba, w, h, name) => {
        const buf = await psdFromPixels(rgba, w, h, name, 'white');
        if (!buf) return false;
        const dtk = await DOCS.beginOpen(); if (!dtk) return false;
        try { docStack.length = 0; await initDocument(buf, name + '.psd', { nested: false }); refreshAll(true); } catch (e) { DOCS.abortOpen(dtk); throw e; }
        DOCS.endOpen(dtk); return true;
      },
      setSaveHook: fn => { actSaveHook = fn; },
      clearErr: () => { $('#err').textContent = ''; }, lastErr: () => $('#err').textContent,
    });
  } catch (e) { console.warn('[automate] 自动命令没装上', e); }
}


const TOOL_PRESET_OPTS = () => ({
  eraser: { eraserOpts }, pencil: { pencilOpts }, mixerBrush: { mixerOpts }, historyArtBrush: { artHistoryOpts }, adjBrush: { adjBrushOpts },
  gradient: { gradOpts }, bucket: { bucketOpts }, eyedropper: { eyeOpts }, shape: { shapeOpts }, pen: { penOpts }, penFree: { freePenOpts },
  crop: { cropOpts }, cropPerspective: { pcropOpts }, move: { moveOpts }, zoom: { zoomOpts }, wand: { wandOpts }, quickSelect: { qsOpts }, objectSelect: { osOpts },
  selRect: { mqOpts }, selEllipse: { mqOpts }, lassoMagnetic: { magOpts }, selectionBrush: { sbOpts }, slice: { sliceOpts }, frame: { frameOpts },
  colorReplace: { crOpts }, backgroundEraser: { bgeOpts }, magicEraser: { meOpts }, text: { textToolOpts }, textVertical: { textToolOpts },
  colorSampler: { samplerOpts }, note: { noteOpts }, path: { pathOpts }, pathSelect: { pathOpts },
  ...Object.fromEntries(['cloneStamp', 'patternStamp', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge'].map(k => [k, { boOpts }])),
  ...Object.fromEntries(['spotHeal', 'healBrush', 'patch', 'contentMove', 'redEye'].map(k => [k, { retouchOpts }])),
});

const TOOL_PRESET_DOM = { wand: ['#wandTol', '#wandContig', '#wandAll', '#selAA'],
  ...Object.fromEntries(['selRect', 'selEllipse', 'lasso', 'lassoPoly', 'lassoMagnetic', 'selRow', 'selCol'].map(k => [k, ['#selFeather', '#selAA']])) };
const BRUSH_STATE_KEYS = ['size', 'hardness', 'spacing', 'tip', 'angle', 'roundness', 'preset', 'smoothing', 'smoothOpts', 'airbrush', 'pressureSize', 'pressureOpacity', 'dyn'];
export function captureToolPreset(t){
  const objs = TOOL_PRESET_OPTS()[t] || {};
  const opts = {};
  for (const [k, o] of Object.entries(objs)) opts[k] = JSON.parse(JSON.stringify(o));
  const paint = PAINT_TOOLS.has(t) || t === 'mixerBrush' || t === 'adjBrush';
  let rec = null;
  if (paint) {
    opts.brushState = JSON.parse(JSON.stringify(Object.fromEntries(BRUSH_STATE_KEYS.map(k => [k, brush[k]]))));
    opts.po = { opacity: brush.opacity, flow: brush.flow };
    if (toolModes[t] !== undefined) opts.mode = toolModes[t];
    rec = currentBrushRecord();
  }
  const dom = TOOL_PRESET_DOM[t];
  if (dom) opts.dom = Object.fromEntries(dom.map(id => { const el = $(id); return [id, el ? (el.type === 'checkbox' ? el.checked : el.value) : null]; }).filter(x => x[1] != null));
  if (!Object.keys(opts).length) return null;
  const label = toolLabelOf(t);
  const po = paint ? { opacity: effOpacity(t), flow: effFlow(t), mode: toolModes[t] || 'normal', airbrush: !!brush.airbrush, smoothing: brush.smoothing } : null;
  return { name: label + (paint ? ` ${brush.size}` : ''), tool: t, opts, ...(rec ? { brush: rec } : {}), ...(po ? { psOpts: po } : {}) };
}
export async function applyToolPresetRecord(p){
  const t = p.tool;
  if (!DOC_TOOLS.includes(t)) { shell.status(`工具预设「${p.name}」的工具在本编辑器里没有`); return false; }
  const btn = TOOL_BTN_OF(t);
  if (btn) tools.select(btn); else setDocTool(t);
  if (docTool !== t) setDocTool(t);
  const objs = TOOL_PRESET_OPTS()[t] || {};
  const o = p.opts || {};
  const deepAssign = (dst, src) => { for (const k of Object.keys(src)) { const v = src[k]; if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) deepAssign(dst[k], v); else dst[k] = v; } };
  for (const [k, obj] of Object.entries(objs)) if (o[k]) deepAssign(obj, o[k]);
  if (o.dom) for (const [id, v] of Object.entries(o.dom)) { const el = $(id); if (!el) continue; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
  if (p.brush) {
    applyBrushRecord(p.brush, null);
    if (o.brushState) { for (const k of ['smoothing', 'smoothOpts', 'airbrush', 'pressureSize', 'pressureOpacity']) if (o.brushState[k] !== undefined) brush[k] = cloneOpValue(o.brushState[k]); }
  }
  const po = o.po || (p.psOpts ? { opacity: p.psOpts.opacity, flow: p.psOpts.flow } : null);
  if (po) { if (po.opacity != null) brush.opacity = po.opacity; if (po.flow != null) brush.flow = po.flow; }
  const mode = o.mode || (p.psOpts && p.psOpts.mode);
  if (mode && toolModes[t] !== undefined) toolModes[t] = mode;
  if (!o.brushState && p.psOpts) { if (p.psOpts.airbrush != null) brush.airbrush = p.psOpts.airbrush; if (p.psOpts.smoothing != null) brush.smoothing = p.psOpts.smoothing; }
  try { syncToolOptions(); syncBrushControls(); } catch {}
  return true;
}
function TOOL_BTN_OF(t){ for (const g of tools.TOOL_GROUPS) for (const x of g.tools) if (x.impl === 'docTool:' + t) return x.id; return null; }
export function toolLabelOf(t){ for (const g of tools.TOOL_GROUPS) for (const x of g.tools) if (x.impl === 'docTool:' + t) return x.label; return t; }
function toolIconOf(t, size){ const id = TOOL_BTN_OF(t); return id ? tools.svgIcon(id, size) : null; }

export function defineBrushSource(){
  if (!doc || li) return { error: '先打开一份文档' };
  const rgba = sampleRGBA(true); if (!rgba) return { error: '取不到画面像素' };
  let x0 = 0, y0 = 0, w = docW, h = docH, sel = null;
  if (selection) { x0 = Math.max(0, selection.x); y0 = Math.max(0, selection.y); w = Math.min(docW, selection.x + selection.width) - x0; h = Math.min(docH, selection.y + selection.height) - y0; sel = selCovFn(); }
  if (w <= 0 || h <= 0) return { error: '选区在画布外' };
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((y + y0) * docW + x + x0) * 4, a = rgba[o + 3] / 255;
    const l = (rgba[o] * .299 + rgba[o + 1] * .587 + rgba[o + 2] * .114) * a + 255 * (1 - a);
    let c = 255 - l; if (sel) c *= sel(x + x0, y + y0) / 255;
    gray[y * w + x] = Math.round(c);
  }
  return { w, h, gray };
}

function drawStrokePreview(cv, rec){
  const w = cv.width, h = cv.height;
  const buf = new Uint8ClampedArray(w * h * 4);
  const S = { target: 'pixels', idx: -1, buf, base: new Uint8ClampedArray(w * h * 4), w, h, ox: 0, oy: 0, M: [1, 0, 0, 1, 0, 0], inv: [1, 0, 0, 1, 0, 0], px: 4, color: [0, 0, 0], erase: false, lockAlpha: false };
  const o = { noSel: true, tool: 'brush' };
  if (rec) {
    const tip = rec.sample ? brushLib.ensureSample(rec.sample) : rec.tip || 'round';
    const d = normalizeDynamics(cloneOpValue(rec.dyn || defaultDynamics()));
    if (d.dual && d.dual.sample) brushLib.ensureSample(d.dual.sample);
    Object.assign(o, { tip, hardness: rec.hardness == null ? 1 : rec.hardness, angle: rec.angle || 0, roundness: rec.roundness || 1, spacing: rec.spacing || .25, dyn: d,
      size: Math.min(rec.size || 20, h * .5), opacity: 1, flow: 1, pressureSize: false, pressureOpacity: false });
  } else o.size = Math.min(brush.size, h * .55);
  strokeSetup(S, { x: 10, y: h / 2 }, o);
  S.sym = null; S.fancy = S.shaped || !!S.dyn || S.dynBase.pressureSize || S.dynBase.pressureOpacity || !!S.tex || !!S.dual;
  emitDab(S, 10, h / 2, 1);
  for (let x = 12; x <= w - 10; x += 2) strokeTo(S, { x, y: h / 2 + Math.sin((x - 10) / (w - 20) * Math.PI * 2) * h * .22, p: .2 + .8 * Math.sin((x - 10) / (w - 20) * Math.PI) });
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(new ImageData(buf, w, h), 0, 0);
  ctx.drawImage(tmp, 0, 0);
}
export function installBrushLib(){
  installBrushLibrary({
    panels, tools, uiIcon, promptDialog, confirmDialog, alertDialog, choiceDialog, formDialog,
    status: t => shell.status(t),
    hasDoc: () => !!doc && !li,
    gearIcon: () => { const [src, px] = AB_BAR_ICONS.abGear; const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; return img; },
    brushSize: () => brush.size, setBrushSize: n => setBrushSize(n),
    currentPresetId: () => brush.preset,
    applyBrushRecord: (rec, id) => applyBrushRecord(rec, id),
    applyBuiltin: id => { const p = BRUSH_PRESETS.find(x => x.id === id); if (p) applyBrushPreset(p); },
    currentBrushRecord: () => currentBrushRecord(),
    drawStrokePreview: (cv, rec) => drawStrokePreview(cv, rec),
    toggleBrushSettings: () => { try { panels.toggle('brushSettings'); } catch {} setTimeout(() => renderBrushSettings(), 0); },
    defineBrushSource: () => defineBrushSource(),
    docPatternRGBA: ids => ((doc && doc.patterns) || []).filter(p => !p._lib && ids.includes(p.id)).map(p => {
      const r = patternToRGBA(p); return r ? { id: p.id, name: p.name, width: r.width, height: r.height, rgba: r.data } : null; }).filter(Boolean),
    onBrushLibChanged: () => { if (!$('#brPresetPop').hidden) renderPresetList(); if (bsPanelOpen()) renderBrushSettings(false); },
    
    currentTool: () => docTool, toolLabel: t => toolLabelOf(t), toolIconEl: (t, size) => toolIconOf(t, size),
    captureToolPreset: t => captureToolPreset(t), applyToolPreset: p => applyToolPresetRecord(p),
    resetTool: () => { const label = toolLabelOf(docTool); shell.status(resetToolOptions(docTool) ? `已复位「${label}」的选项` : `「${label}」还没有接入「复位工具」`); },
    resetAllTools: () => { let n = 0; for (const k of Object.keys(TOOL_RESETTERS)) if (resetToolOptions(k)) n++; syncToolOptions(); shell.status(`已复位 ${n} 个工具的选项`); },
  }).catch(e => console.warn('[brushes] 画笔库没装上', e));
}
export function installPresetLibrary(){
  installPresets({
    panels, uiIcon, promptDialog, confirmDialog, alertDialog, choiceDialog, formDialog, makeZip,
    status: t => shell.status(t),
    getDoc: () => doc, hasDoc: () => !!doc && !li, hasLayer: () => !!doc && !li && selLayer >= 0,
    docSize: () => ({ w: docW, h: docH }), docName: () => (docName || '').replace(/\.ps[db]$/i, ''),
    selectionRect: selectionRectForPattern,
    compositeRGBA: () => sampleRGBA(true),
    clientToDoc: (x, y) => toDoc({ clientX: x, clientY: y }),
    builtinPatterns: () => rtBuiltinPatterns(),
    
    setCurrentPattern: id => {
      bucketOpts.pattern = id; boOpts.pattern = id; retouchOpts.healPattern = id; retouchOpts.patchPattern = id;
      try { syncBucketBar(); syncBrushOpBar(); syncRetouchBar(); } catch {}
    },
    onPatternsChanged: () => { try { syncBucketBar(); syncBrushOpBar(); syncRetouchBar(); } catch {} },
    docPatternRGBA: ids => ((doc && doc.patterns) || []).filter(p => !p._lib && ids.includes(p.id)).map(p => {
      const r = patternToRGBA(p); return r ? { id: p.id, name: p.name, width: r.width, height: r.height, rgba: r.data } : null; }).filter(Boolean),
    newFillLayer: (kind, preset) => openNewFillDialog(kind, preset),
    
    gradGroups: () => GRAD_PRESET_GROUPS.map(g => ({ name: g.name, items: g.items.map(it => ({ name: it[0], id: typeof it[1] === 'string' ? it[1] : (g.name === '基础' ? 'bw' : `${g.name}/${it[0]}`) })) })),
    gradModelOf: id => gradPresetModel(id),
    gradCss: m => gradModelCssBy(m, 'to bottom right'),
    gradPick: id => gradPickPreset(id),
    gradCurrentModel: () => gradCurrentModel(),
    onGradientsChanged: () => { try { syncGradBar(); } catch {} },
    
    getColors: () => ({ fg: fgRGB.slice(), bg: bgRGB.slice() }),
    setFg: c => setFgBg(c, null), setBg: c => setFgBg(null, c),
    
    setCustomShape: id => setCustomShape(id),
    currentPathSubpaths: () => { const k = pathTargetKey(); const subs = panelPathSubs(); return subs && subs.length ? { subpaths: subs, name: isDocPathKey(k) ? docPathLabel(k) : layerNameOf(k) } : null; },
    commitShapePath: (subs, name, meta) => commitShapePath(subs, name, meta),
    
    selectedLayer: () => selLayer,
    selectedLayerEffects: async () => {
      if (!doc || selLayer < 0) return null;
      const fx = presetLayerEffects(selLayer);
      return fx ? { effects: fx, name: layerNameOf(selLayer) } : null;
    },
    runStructural: (ops, label, selectIndex) => runStructuralOps(ops, label, selectIndex),
    isEmptyRasterLayer: () => presetTargetIsEmpty(),
    
    hitLayer: (x, y) => { if (!doc || li) return -1; const p = toDoc({ clientX: x, clientY: y }); return hitLayerAt(p.x, p.y); },
    layerKind: i => (isTextLayer(i) ? 'text' : isShapeLayer(layerTree && layerTree.flat[i]) ? 'shape' : 'other'),
    selectLayer: i => { set_selLayer(i); selLayers.clear(); renderLayerPanel(); renderProps(); },
    setShapeFill: (i, type, spec) => setShapeContentType(i, 'fill', type, spec),
    setTextColor: (i, rgb) => applyTextStyle(i, { color: [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1] }),
    gradStops: m => gradModelStops(m),
    layerEffects: async i => presetLayerEffects(i),
    runAction: id => actions.run(id),
  }).catch(e => console.error('[presets] 预设库初始化失败', e));
}

function presetTargetIsEmpty() {
  if (!doc || li || selLayer < 0) return false;
  const layer = doc.layers[selLayer], meta = layerTree?.flat[selLayer];
  if (!layer || layer.fill || layer.adjustment || layer.text || layer.isGroup || layer.groupType || layer.isSmartObject || meta?.isSmartObject || layer.mask || layer.vectorMask || isTextLayer(selLayer) || isShapeLayer(meta)) return false;
  if (!(layer.width > 0 && layer.height > 0)) return true;
  
  const native = !pixelPaint[selLayer] && layer.nativePlanes?.[-1];
  const alpha = native?.data || native;
  if (ArrayBuffer.isView(alpha)) return !alpha.some(v => v !== 0);
  if (!layer.rgba) return false;
  for (let i = 3; i < layer.rgba.length; i += 4) if (layer.rgba[i]) return false;
  return true;
}

function presetLayerEffects(i){
  if (!doc || i < 0) return null;
  const src = previewCompositeDoc(doc), l = src && src.layers[i];
  if (!(l && l.effects && typeof l.effects === 'object')) return null;
  
  const e = cloneOpValue(l.effects);
  for (const op of (layerOps[i] || [])) if (op.op === 'removeLayerEffect') {
    const mk = PREVIEW_EFFECT_MULTI[op.effect];
    if (mk && Array.isArray(e[mk])) { e[mk].splice(op.at || 0, 1); if (!e[mk].length) delete e[mk]; } else delete e[op.effect];
  }
  return e;
}
