




import './23-layers-panel.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import { adjustmentRenderParams } from '../../../core/app.js';
import { recomposeLayerRGBA } from '../../../core/psd-raster.js';
import { getTextRuns } from '../../../core/psd-text.js';
import { propertyContext, organizeProperties } from '../property-panel.js';
import { shell } from '../shell.js';
import {
  $, ADJ_KINDS_MENU, BLEND_KEYS, BLEND_LABELS, CREATABLE_FX_LABEL, EDIT, EDITM, api, applyEdits,
  createEffectTemplate, ensureLazy, getLayerParams, icon, kick, planEdits, selectionBounds, selectionToMaskGray,
} from './01-boot.js';
import {
  LP, TInputs, aspectLock, beginMeshEdit, cur, doc, docH, docName, docStack, docW, endMeshEdit, fontCache,
  layerDupes, layerEdits, layerOps, layerParamsCache, layerTextEdits, layerTree, li, maskPaint, origBuffer,
  pixelPaint, selection, set_TInputs, set_aspectLock, soBaked, sos, textCrops, textFontSubst, textRenders,
} from './02-doc-state.js';
import {
  PP, actRecord, beginLayerEdit, commitPanelTimer, docHistLock, endLayerEdit, propsContext, propsLayer,
  pushDocHistory, revealPropsPanel, set_commitPanelTimer, set_pendingReplSO, set_propTab, set_propsContext,
  set_propsLayer, structuralBegin, structuralDone, syncPropTabs, uiQuiet,
} from './03-history.js';
import { TEXT_ALIGNS_ALL, aaLabel, applyTextStyle, fontDisplayName, syncTextBar, textInfoOf } from './09-text-tool.js';
import { activePath, renderLiveShapeProps, set_activePath } from './17-shape-pen.js';
import { moveLockWhy } from './19-free-transform.js';
import { hasAnyEdits, openInside, refreshAll } from './20-snap-smart-object.js';
import { initDocument, lxStructural, selectSO, soRenderImage } from './21-load-document.js';
import { matchLayer } from './22-deform-tools.js';
import {
  LABEL_COLORS, layerCanvasCache, layerTypeIconKey, maskThumbCache, renderLayerPanel, selLayer, selLayers,
  set_selLayer, thumbCache,
} from './23-layers-panel.js';
import { createLayerUI } from './26-layer-create.js';
import { parseHex6, renderParamEditor, setLayerBlend, setLayerOpacity } from './27-gradient-editor.js';
import {
  ALIGN_BTNS, ALIGN_LABEL, DISTRIBUTE_ICONS, alignPropertyLayers, batchTargets, distributeLayers,
  distributeSpacing, flipLayer, getPropertyTransformValues, isMeshTransform, mkEl, setLayerPos, setLayerSize,
  setShapePropertyTransform, smartPropertyBaseRotation, syncLayerControls,
} from './28-layer-props-transform.js';
import { makeScrubLabel, rotateLayer } from './29-scrubby-live.js';
import { previewPathValue, renderStaticLayers, set_composeLiveIdx } from './30-render.js';
import { docTool, hexOf, setDocTool } from './31-selection-brush.js';
import { docArtboards } from './35-artboard.js';
import { renderArtboardProps, setFrameRectUI, setFrameStrokeUI, syncArtboardBar } from './36-clipboard-frame.js';
import { adjLayerTarget, dedicatedAdjBlocks } from './42-adjust-panels.js';
import { buildAdjCtlFoot, renderAdjustCtl, renderImageAdjust } from './43-gradient-map-adjust-form.js';
import { set_pathModel } from './44-vector-path.js';
import { pathSelAnchors, pathSelSubs, renderShapeFillType, renderVectorPath } from './45-path-tools.js';
import { renderSmartFilters } from './46-smart-filter-panel.js';
import { openInlineTextEditor } from './47-canvas-context-menu.js';
import { buildPsdBuffer, dispTextOf, ensureStructuralBase, setWaitCursor } from './48-info-export.js';
import {
  applyTextFont, layerFontPs, openFontPopover, renderTextLayer, selFontPs, textPtFactor,
} from './49-fonts-text-model.js';
import {
  ANTI_ALIAS_MODES, DYN_SHAPES, applyTextDesc, effTextDesc, effTextWarp, textDynamicOf, toggleDynamicText,
  warpLabelOf, warpStyleOf,
} from './52-alpha-text-menu.js';
import { CPP, TXP, opticalKernReady } from './57-layer-style-text-path.js';
















export const MASK_STRUCTURAL_OPS = new Set(['addLayerMask', 'deleteLayerMask', 'applyLayerMask']);
export let layerOpsVersion = 0;
export function opKeyOf(op){
  if (op.op === 'setLayerEffect') return `setLayerEffect:${op.effect}:${op.at || 0}`;
  if (op.op === 'setLayerParams') return `setLayerParams:${op.target}:${op.at || 0}`;
  

  if (op.op === 'addLayerEffect') return `addLayerEffect:${op.effect}:${op.seq || 0}`;
  if (op.op === 'removeLayerEffect') return `removeLayerEffect:${op.effect}:${op.at || 0}`;
  if (MASK_STRUCTURAL_OPS.has(op.op)) return 'maskStructural';
  return op.op;
}
export function findLayerOp(i, key){ const a = layerOps[i]; return (a && a.find(o => opKeyOf(o) === key)) || null; }
export function putLayerOp(i, op){
  const a = layerOps[i] || (layerOps[i] = []);
  const k = opKeyOf(op), at = a.findIndex(o => opKeyOf(o) === k);
  if (at >= 0) a[at] = op; else a.push(op);
  layerOpsVersion++;
  return op;
}
export function dropLayerOp(i, key){
  const a = layerOps[i]; if (!a) return;
  const at = a.findIndex(o => opKeyOf(o) === key);
  if (at >= 0) { a.splice(at, 1); layerOpsVersion++; }
  if (!a.length) delete layerOps[i];
}
export function countLayerOps(){ let n = 0; for (const k in layerOps) n += layerOps[k].length; return n; }




export function allLayerOps(){
  const out = [];
  for (const k of Object.keys(layerOps)) {
    const ops = layerOps[k];
    for (const o of ops) if (o.op !== 'addLayerEffect') out.push(o);
    for (const o of ops) if (o.op === 'addLayerEffect') out.push(o);
  }
  return out;
}





export function cloneOpValue(v){
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;   
  if (Array.isArray(v)) return v.map(cloneOpValue);
  const o = {}; for (const k in v) o[k] = cloneOpValue(v[k]); return o;
}
export const layerOpsSnapshot = () => { const s = {}; for (const k in layerOps) s[k] = layerOps[k].map(cloneOpValue); return s; };
export function restoreLayerOps(snap){
  for (const k in layerOps) delete layerOps[k];
  for (const k in snap) layerOps[k] = snap[k].map(cloneOpValue);
}



export function humanEditError(msg){
  return String(msg == null ? '' : msg).replace(/^ops\[\d+\]「[^」]*」：\s*/, '');
}



















function synthPlanesFromRGBA(l, mode){
  if (!l || !l.rgba || !(l.width > 0 && l.height > 0)) return null;
  if (mode !== 3 && mode !== 1 && mode !== 8) return null;
  const n = l.width * l.height, d = l.rgba;
  const A = new Uint8Array(n), R = new Uint8Array(n);
  if (mode === 3) {
    const G = new Uint8Array(n), B = new Uint8Array(n);
    for (let i = 0; i < n; i++) { R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2]; A[i] = d[i * 4 + 3]; }
    return { 0: R, 1: G, 2: B, [-1]: A };
  }
  for (let i = 0; i < n; i++) { R[i] = d[i * 4]; A[i] = d[i * 4 + 3]; }
  return { 0: R, [-1]: A };
}


function maskFillGray(l, fill){
  const v = fill === 'hide' ? 0 : typeof fill === 'number' ? Math.max(0, Math.min(255, Math.round(fill))) : 255;
  return new Uint8Array(l.width * l.height).fill(v);
}





export function recomposeLayer(i){
  const dl = doc && doc.layers[i];
  if (!dl || !(dl.width > 0 && dl.height > 0)) return false;
  
  if (textRenders[i]) return false;
  if (pixelPaint[i] && !pixelPaint[i].clean) return false;   
  for (const k in soBaked) if (soBaked[k] && soBaked[k].layerIdx === i) return false;
  const struct = maskStructOp(i);
  const override = {};
  const mp = maskPaint[i];

  if (struct && struct.op === 'addLayerMask') {
    
    if (dl.mask) return false;                     
    


    if (!dl.planes) {
      const p = synthPlanesFromRGBA(dl, doc.mode);
      if (!p) return false;
      dl.planes = p;
    }
    
    if (struct.gray && mp && mp.mode === 'new') {
      override.gray = mp.gray; override.width = mp.w; override.height = mp.h;
      override.top = mp.top; override.left = mp.left;
    } else {
      override.gray = maskFillGray(dl, struct.fill === 'hide' ? 'hide' : struct.fill === 'reveal' ? 'reveal' : struct.fill);
      override.width = dl.width; override.height = dl.height;
      override.top = dl.bounds.top; override.left = dl.bounds.left;
    }
    override.relative = false; override.disabled = false; override.invert = false;
  } else {
    if (!dl.planes) return false;                  
    
    if (mp && mp.mode === 'existing' && !(struct && struct.op === 'deleteLayerMask')) {
      override.gray = mp.gray; override.width = mp.w; override.height = mp.h;
      override.top = mp.top; override.left = mp.left;
    }
    if (struct && struct.op === 'deleteLayerMask') {
      

      const which = struct.which || 'user';
      const hasUser = dl.planes[-2] !== undefined, hasReal = dl.planes[-3] !== undefined;
      if (which === 'all') override.removed = true;
      else if (which === 'real') { if (!hasUser) override.removed = true; }
      else if (hasReal && hasUser) return false;   
      else override.removed = true;
    }
    
    if (!struct || struct.op !== 'addLayerMask') {
      const d = opField(i, 'setMaskProps', 'disabled'); if (d !== undefined) override.disabled = d;
      const v = opField(i, 'setMaskProps', 'invert');   if (v !== undefined) override.invert = v;
      const den = opField(i, 'setMaskProps', 'density'); if (den !== undefined) override.density = den;
      const fea = opField(i, 'setMaskProps', 'feather'); if (fea !== undefined) override.feather = fea;
    }
  }
  const rgba = recomposeLayerRGBA(dl, doc.mode, override);
  if (!rgba) return false;
  dl.rgba = rgba;
  delete layerCanvasCache[i];    
  delete thumbCache[i];          
  delete maskThumbCache[i];      
  return true;
}




function byteSig(a){
  let h = 2166136261 >>> 0;
  const step = Math.max(1, Math.floor(a.length / 4096));
  for (let i = 0; i < a.length; i += step) { h = (h ^ a[i]) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return `b${a.length}#${h.toString(36)}`;
}
const opSigReplacer = (k, v) => (v && ArrayBuffer.isView(v)) ? byteSig(v) : v;
const maskOpSig = i => JSON.stringify(
  [findLayerOp(i, 'setMaskProps'), findLayerOp(i, 'maskStructural'), findLayerOp(i, 'setLayerMaskPixels')], opSigReplacer);













export let curveDragHold = false;         
export function set_curveDragHold(v) { return (curveDragHold = v); }   






export let dragAdjustDepth = 0;
export function set_dragAdjustDepth(v) { return (dragAdjustDepth = v); }   




export let rangeDragHold = false;
export function set_rangeDragHold(v) { return (rangeDragHold = v); }   
export function schedulePanelRebuild(){
  clearTimeout(commitPanelTimer);
  

  if (docHistLock && curveDragHold) { set_commitPanelTimer(0); return; }
  



  if (dragAdjustDepth > 0 || rangeDragHold) { set_commitPanelTimer(0); return; }
  if (!docHistLock) { set_commitPanelTimer(0); renderLayerPanel(); return; }
  set_commitPanelTimer(setTimeout(() => { set_commitPanelTimer(0); renderLayerPanel(); }, 150));
}




let fastCommitDepth = 0;
export function withFastCommit(fn){ fastCommitDepth++; try { return fn(); } finally { fastCommitDepth--; } }
export function commitLayerOps(idx, mutate){
  const snap = layerOpsSnapshot();
  const sigBefore = maskOpSig(idx);
  try { mutate(); } catch (e) { restoreLayerOps(snap); $('#err').textContent = '这项改动没能记下：' + humanEditError(e.message); return false; }
  let err = null;
  


  if (!EDITM) kick(EDIT);
  else if (!fastCommitDepth) {
    



    const inFile = doc ? doc.layers.length - layerDupes.length : 0;
    try { const r = planEdits(origBuffer, allLayerOps().filter(o => o.op!=='sparsePixels'&&(o.index == null || o.index < inFile))); if (!r.ok) err = r.errors[0].message; }
    catch (e) { err = e.message; }
  }
  if (err) { restoreLayerOps(snap); $('#err').textContent = '这项改动不能写回：' + humanEditError(err); renderProps(); return false; }
  $('#err').textContent = '';
  delete maskThumbCache[idx];
  
  { const dl0 = doc && doc.layers[idx]; if (dl0 && !(dl0.rgba && dl0.width > 0)) delete thumbCache[idx]; }
  if (maskOpSig(idx) !== sigBefore) recomposeLayer(idx);   
  schedulePanelRebuild();                                  
  

  if (fastCommitDepth) set_composeLiveIdx(idx);
  try { renderStaticLayers(); } finally { set_composeLiveIdx(null); }
  return true;
}

export function setSingleOp(idx, op, isOriginal){
  return commitLayerOps(idx, () => { if (isOriginal) dropLayerOp(idx, opKeyOf(op)); else putLayerOp(idx, op); });
}

export function setOpField(idx, template, field, value, original){
  const key = opKeyOf(template);
  return commitLayerOps(idx, () => {
    const op = findLayerOp(idx, key) || { ...template, index: idx };
    if (value === original) delete op[field]; else op[field] = value;
    const dirty = Object.keys(op).filter(k => k !== 'op' && k !== 'index');
    if (!dirty.length) dropLayerOp(idx, key); else putLayerOp(idx, op);
  });
}

export function setParamField(idx, target, at, path, value, original){
  const key = `setLayerParams:${target}:${at || 0}`;
  return commitLayerOps(idx, () => {
    const op = findLayerOp(idx, key) || { op: 'setLayerParams', index: idx, target, at: at || 0, values: {} };
    if (paramEq(value, original)) delete op.values[path]; else op.values[path] = value;
    
    if (!Object.keys(op.values).length && !(op.arrayOps && op.arrayOps.length)) dropLayerOp(idx, key);
    else putLayerOp(idx, op);
  });
}
export const paramEq = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-9 : a === b;


export function setParamFieldsBatch(idx, target, at, entries){
  if (!entries.length) return true;
  const key = `setLayerParams:${target}:${at || 0}`;
  return commitLayerOps(idx, () => {
    const op = findLayerOp(idx, key) || { op: 'setLayerParams', index: idx, target, at: at || 0, values: {} };
    op.values = op.values || {};
    for (const [path, value, original] of entries) { if (paramEq(value, original)) delete op.values[path]; else op.values[path] = value; }
    if (!Object.keys(op.values).length && !(op.arrayOps && op.arrayOps.length)) dropLayerOp(idx, key);
    else putLayerOp(idx, op);
  });
}


export const opField = (i, key, f) => { const o = findLayerOp(i, key); return o && o[f] !== undefined ? o[f] : undefined; };
export const effMaskFlag = (i, l, f) => { const v = opField(i, 'setMaskProps', f); return v !== undefined ? v : !!(l.mask && l.mask[f]); };

export const baseMaskNum = (l, f, dflt) => {
  if (f === 'vectorDensity' || f === 'vectorFeather') {
    const x = l.vectorMaskParams && l.vectorMaskParams[f === 'vectorDensity' ? 'density' : 'feather'];
    return x != null ? x : dflt;
  }
  return l.mask && l.mask[f] != null ? l.mask[f] : dflt;
};
export const effMaskNum = (i, l, f, dflt) => { const v = opField(i, 'setMaskProps', f); return v !== undefined ? v : baseMaskNum(l, f, dflt); };
const LOCK_FIELD_KEY = { lockTransparency: 'transparency', lockComposite: 'composite', lockPosition: 'position', lockAll: 'all', lockNesting: 'nesting' };

export function setLayerLock(idx, opf, on){
  const l = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!l || !LOCK_FIELD_KEY[opf]) return false;
  setOpField(idx, { op: 'setLayerFlags' }, opf, !!on, !!(l.locks && l.locks[LOCK_FIELD_KEY[opf]]));
  renderLayerPanel(); renderProps();
  return true;
}
export const effLock = (i, l, opf, lf) => { const v = opField(i, 'setLayerFlags', opf); return v !== undefined ? v : !!(l.locks && l.locks[lf]); };
export const effColorLabel = (i, l) => { const o = findLayerOp(i, 'setLayerColorLabel'); return o ? o.color : (l.colorLabel || 0); };
export const effFillOpacity = (i, l) => { const o = findLayerOp(i, 'setFillOpacity'); return o ? o.fillOpacity : (l.fillOpacity != null ? l.fillOpacity : 255); };
export const effKnockout = (i, l) => { const v = opField(i, 'setLayerKnockout', 'knockout'); return v !== undefined ? v : (l.knockout || 0); };
export const effClipping = (i, l) => { const v = opField(i, 'setLayerProps', 'clipping'); return v !== undefined ? !!v : !!l.clipping; };
export const effFxEnabled = (i, key, at, base) => { const o = findLayerOp(i, `setLayerEffect:${key}:${at || 0}`); return o ? o.enabled : base; };
export const effFxMaster = (i, base) => { const o = findLayerOp(i, 'setLayerEffectsEnabled'); return o ? o.enabled : base; };
export const effParam = (i, target, at, path, base) => {
  const o = findLayerOp(i, `setLayerParams:${target}:${at || 0}`);
  return o && o.values[path] !== undefined ? o.values[path] : base;
};
export const maskStructOp = i => findLayerOp(i, 'maskStructural');


export function attrGuards(idx, l){
  const m = l.mask, dl = (doc && doc.layers[idx]) || null;
  const g = {};
  if (!m) {
    g.maskProps = '这个图层没有像素蒙版';
    g.params = '这个图层没有像素蒙版';
    g.del = '这个图层没有像素蒙版';
    g.apply = '这个图层没有像素蒙版';
  } else {
    const dens = effMaskNum(idx, l, 'density', 255), fea = effMaskNum(idx, l, 'feather', 0);
    if (m.hasParameters && ((dens != null && dens !== 255) || fea)) {
      g.apply = '这个蒙版带浓度/羽化（PS 没公开它们的合成规则，硬烘出来会和 PS 显示不一致）：先把浓度调回 100%、羽化调回 0，或者改用「删除蒙版」';
    }
    if (doc && doc.depth !== 8 && doc.depth !== 16 && doc.depth !== 32) g.apply = `本文档是 ${doc.depth} 位/通道，应用蒙版只支持 8 / 16 / 32 位`;
    if (dl && !(dl.width > 0 && dl.height > 0)) g.apply = '这是个空图层（包围盒 0×0），没有像素可以应用蒙版';
  }
  if (m || (dl && dl.mask)) g.add = '这个图层已经有用户蒙版了：要换一张请先删除蒙版';
  else if (!dl || !(dl.width > 0 && dl.height > 0)) g.add = '这是个空图层（包围盒 0×0），没法用它的包围盒当蒙版范围';
  if (l.groupType === 3) { for (const k of ['maskProps', 'params', 'del', 'apply', 'add', 'flags']) g[k] = '分组结束分隔记录（PS 面板上选不中它）不支持属性编辑'; }
  return g;
}




export function layerParams(idx){
  if (layerParamsCache[idx] !== undefined) return layerParamsCache[idx];
  if (!EDITM) { kick(EDIT); return { error: EDIT.statusText(), lazy: true }; }
  let p = null;
  try { p = getLayerParams(origBuffer, idx); } catch (e) { p = { error: e.message }; }
  return (layerParamsCache[idx] = p);
}


const COLOR_LABEL_NAMES = { 0: '无', 1: '红', 2: '橙', 3: '黄', 4: '绿', 5: '蓝', 6: '紫', 7: '灰' };
export function opLabel(op){
  if(op.op==='sparsePixels')return '像素';
  switch (op.op) {
    case 'setMaskProps': {
      const bits = [];
      if (op.disabled !== undefined) bits.push(op.disabled ? '停用蒙版' : '启用蒙版');
      if (op.invert !== undefined) bits.push(op.invert ? '蒙版反相' : '取消反相');
      if (op.density !== undefined) bits.push(`浓度 ${Math.round(op.density / 255 * 100)}%`);
      if (op.feather !== undefined) bits.push(`羽化 ${op.feather.toFixed(1)}px`);
      if (op.vectorDensity !== undefined) bits.push(`矢量蒙版浓度 ${Math.round(op.vectorDensity / 255 * 100)}%`);
      if (op.vectorFeather !== undefined) bits.push(`矢量蒙版羽化 ${op.vectorFeather.toFixed(1)}px`);
      return bits.join(' · ');
    }
    case 'setLayerFlags': {
      const N = { lockTransparency: '锁定透明像素', lockComposite: '锁定图像像素', lockPosition: '锁定位置', lockAll: '全部锁定' };
      return Object.keys(N).filter(k => op[k] !== undefined).map(k => (op[k] ? '' : '取消') + N[k]).join(' · ');
    }
    case 'setLayerColorLabel': return '颜色标签 → ' + (COLOR_LABEL_NAMES[op.color] || op.color);
    case 'setFillOpacity': return `填充不透明度 → ${Math.round(op.fillOpacity / 255 * 100)}%`;
    case 'setLayerProps': return op.clipping !== undefined ? (op.clipping ? '剪贴到下层' : '取消剪贴') : '图层属性';
    case 'setLayerEffectsEnabled': return '图层样式总开关 → ' + (op.enabled ? '启用' : '停用');
    case 'setLayerEffect': return `${(FX_LABELS[op.effect] || op.effect)}${op.at ? ' 第' + (op.at + 1) + '条' : ''} → ${op.enabled ? '启用' : '停用'}`;
    case 'deleteLayerMask': return '删除蒙版' + (op.which && op.which !== 'user' ? `（${op.which === 'real' ? '真实蒙版' : '全部'}）` : '');
    case 'applyLayerMask': return '应用蒙版（乘进像素后删除）';
    case 'addLayerMask': return '新建蒙版（' + (op.gray ? `${op.bounds ? (op.bounds.right - op.bounds.left) + '×' + (op.bounds.bottom - op.bounds.top) : ''} 灰度位图` : op.fill === 'hide' ? '隐藏全部' : '显示全部') + '）';
    case 'setLayerMaskPixels': return `涂蒙版（${op.w}×${op.h} 区域）`;
    case 'replaceLayerPixels': return `图层像素改写（${op.rgba ? op.rgba.width + '×' + op.rgba.height : ''}）`;
    case 'setLayerParams': {
      const n = Object.keys(op.values || {}).length, a = (op.arrayOps || []).length;
      const what = op.target.startsWith('adjustment') ? '调整层' : '样式';
      return a ? `${what}渐变色标增删（${a} 步）${n ? ` + 参数 ${n} 项` : ''}` : `${what}参数 ${n} 项`;
    }
    case 'addLayerEffect': return `新增「${CREATABLE_FX_LABEL[op.effect] || FX_LABELS[op.effect] || op.effect}」`;
    case 'removeLayerEffect': return `删除「${FX_LABELS[op.effect] || CREATABLE_FX_LABEL[op.effect] || op.effect}」${op.at ? ' 第' + (op.at + 1) + '条' : ''}`;
    case 'addAdjustmentLayer': return `新建「${(ADJ_KINDS_MENU[op.kind] || {}).label || op.kind}」调整图层`;
    case 'setVectorMaskPath': {
      const n = (op.subpaths || []).length, k = (op.subpaths || []).reduce((a, s) => a + s.knots.length, 0);
      return `矢量路径改写（${n} 条子路径 / ${k} 个锚点）`;
    }
    case 'setVectorStroke': return `矢量描边（${Object.keys(op.values || {}).length} 项）`;
    case 'setVectorMaskFlags': {
      const N = { invert: '矢量蒙版反相', notLink: '矢量蒙版不链接', disable: '停用矢量蒙版', fillStartsWithAllPixels: '初始填充全部像素' };
      return Object.keys(N).filter(k => op[k] !== undefined).map(k => (op[k] ? '' : '取消') + N[k]).join(' · ');
    }
    default: return op.op;
  }
}
export const FX_LABELS = { DrSh: '投影', IrSh: '内阴影', OrGl: '外发光', IrGl: '内发光', ebbl: '斜面和浮雕', SoFi: '颜色叠加',
  GrFl: '渐变叠加', patternFill: '图案叠加', FrFX: '描边', ChFX: '光泽', patternOverlay: '图案叠加' };






function lazyHint(box, api, extra){
  const d = document.createElement('div');
  d.className = 'hintline' + (api.error ? ' warn' : '');
  d.dataset.lazy = api.label;
  d.append(document.createTextNode(api.statusText() + (extra ? ' ' + extra : '')));
  if (api.error) {
    const b = document.createElement('button');
    b.textContent = '重试'; b.dataset.attr = 'lazy-retry';
    b.style.cssText = 'height:20px;padding:0 8px;margin-left:8px;font-size:11px';
    b.onclick = () => { api.load().catch(() => {}).then(() => renderProps()); };
    d.append(b);
  }
  box.appendChild(d);
  return d;
}

let smartPropertyModule = null, smartPropertyLoading = null;
let smartPropertyCache = { buffer: null, models: new Map() };
onDocumentCacheRelease(() => { smartPropertyCache = { buffer: null, models: new Map() }; });
function smartPropertyModel(idx) {
  if (!smartPropertyModule) {
    if (!smartPropertyLoading) smartPropertyLoading = import('../smart-object-properties.js').then(m => {
      smartPropertyModule = m; if (propsLayer?.isSmartObject) renderProps();
    }).catch(e => { console.warn('智能对象属性加载失败', e); smartPropertyLoading = null; });
    return null;
  }
  if (smartPropertyCache.buffer !== origBuffer) smartPropertyCache = { buffer: origBuffer, models: new Map() };
  if (!smartPropertyCache.models.has(idx)) {
    try { smartPropertyCache.models.set(idx, smartPropertyModule.smartObjectPropertyModel(origBuffer, idx)); }
    catch { smartPropertyCache.models.set(idx, null); }
  }
  return smartPropertyCache.models.get(idx);
}
function smartPropertyWhy(idx, model) {
  if (li) return '先结束智能对象变形编辑';
  const lock = moveLockWhy(idx); if (lock) return lock;
  if (!model?.source?.bytes) return '找不到智能对象的源内容，请重新链接';
  if (model.placed.desc.filterFX?.filterFXList?.some(f => f.enab !== false)) return '暂不支持带启用智能滤镜的对象';
  return '';
}
async function resetSmartProperty(idx) {
  const M = smartPropertyModule, k = sos.findIndex(so => matchLayer(so) === idx);
  if (!M || k < 0 || smartPropertyWhy(idx, smartPropertyModel(idx))) return false;
  return lxStructural('复位智能对象变换', async (base, { map }) => {
    const target = map(idx), model = M.smartObjectPropertyModel(base, target);
    let image;
    if (M.isPsdSource(model.source.bytes)) image = await M.sourceLayerCompImage(model.source.bytes, model.compId);
    else image = await createImageBitmap(new Blob([model.source.bytes], { type: model.source.mime || 'image/png' }));
    try {
      const reset = M.resetSmartObjectPlacement(base, target);
      const rendered = soRenderImage(k, image, { layerInfo: reset.layerInfo });
      return { buf: M.smartPropertyWithRaster(reset.buffer, target, rendered), sel: target };
    } finally { image?.close?.(); }
  });
}
async function setSmartPropertyComp(idx, compId) {
  const M = smartPropertyModule, k = sos.findIndex(so => matchLayer(so) === idx);
  if (!M || k < 0 || smartPropertyWhy(idx, smartPropertyModel(idx))) return false;
  return lxStructural('应用智能对象图层复合', async (base, { map }) => {
    const target = map(idx), model = M.smartObjectPropertyModel(base, target);
    const written = M.setSmartObjectComp(base, target, compId);
    const image = await M.sourceLayerCompImage(model.source.bytes, compId);
    const [resolved] = await api.resolveAll([M.smartPropertyFragment(written, target)]);
    if (!resolved?.layerInfo) throw new Error(resolved?.error || '智能对象放置无法解析');
    const rendered = soRenderImage(k, image, { layerInfo: resolved.layerInfo });
    return { buf: M.smartPropertyWithRaster(written, target, rendered), sel: target };
  });
}

export function renderProps(){
  if (uiQuiet) return;                 
  const box = $('#props'); box.innerHTML = '';
  set_TInputs(null);
  if (CPP) CPP.refresh(); if (TXP) TXP.refresh();              
  syncLayerControls();
  if (docTool === 'artboard') { try { syncArtboardBar(); } catch {  } }
  


  try { const gt = $('#grpText'); if (gt && !gt.hidden) syncTextBar(); } catch {}
  const l = layerTree && layerTree.flat && layerTree.flat[selLayer];
  if (l !== propsLayer) set_propTab('layer');
  
  if (l !== propsLayer && l && activePath && (l.vectorMask || l.hasVectorMask)) { set_activePath(null); set_pathModel(null); pathSelSubs.clear(); pathSelAnchors.clear(); }
  set_propsLayer(l || null);
  const propertySO = l?.isSmartObject ? sos.find(so => matchLayer(so) === l.index) : null;
  set_propsContext(propertyContext(l, { smartSource: propertySO?.sourceImage }));
  const propertyAlign = { align: (how, target) => alignPropertyLayers(how, target), spacing: distributeSpacing };
  const propAb = l && !li ? docArtboards().find(a => a.index === l.index) : null;   
  if (propAb) set_propsContext({ kind: 'artboard', label: '画板', icon: 'lock-artboard' });
  const contextButton = $('#propTabs [data-prop-tab="layer"]');
  contextButton.replaceChildren(icon(propAb ? 'lock-artboard' : l ? layerTypeIconKey(l) : 'layers-3', 16));
  contextButton.title = propsContext.label; contextButton.setAttribute('aria-label', propsContext.label);
  if (!l) {
    box.dataset.context = 'document';
    
    if (doc && PP) { PP.renderDocument(box); organizeProperties(box, propsContext); PP.decorate(box, propsContext, null); syncPropTabs(); return; }
    const info = document.createElement('div'); info.className = 'prop-document empty'; info.dataset.primary = 'true';
    info.textContent = '打开或新建文档以查看属性';
    box.append(info); syncPropTabs(); return;
  }
  
  if (PP && selLayers.size > 1 && selLayers.has(l.index)) {
    set_propsContext({ kind: 'multi', label: `${selLayers.size} 个图层`, icon: 'layers-3' });
    contextButton.replaceChildren(icon('layers-3', 16));
    PP.renderMulti(box, [...selLayers], propertyAlign); organizeProperties(box, propsContext); PP.decorate(box, propsContext, null); syncPropTabs(); return;
  }
  const idx = l.index;
  let pane = 'layer';
  let section = null;
  const row = (label, ...els) => { const r = document.createElement('div'); r.className = 'row'; r.dataset.propPane = pane; if (section?.pane === pane) r.dataset.propSection = section.key; const lb = document.createElement('label'); lb.textContent = label; r.append(lb, ...els); box.appendChild(r); return r; };
  

  const hint = (t, cls) => {
    const d = document.createElement('div'); d.className = 'hintline' + (cls ? ' ' + cls : ''); d.textContent = t;
    const last = box.lastElementChild;
    if (cls === 'warn' && last && !last.title) last.title = String(t).replace(/\*\*/g, '');
    return d;                                            
  };
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const markPane = (from, pane) => { for (let i = from; i < box.children.length; i++) box.children[i].dataset.propPane = pane; };
  

  const sec = (title, key = title) => { section = { pane, key }; const d = document.createElement('div'); d.className = 'psec'; d.dataset.propPane = pane; d.textContent = title; box.appendChild(d); return d; };
  if (propAb) { renderArtboardProps(propAb, { row, sec, mk }); box.dataset.context = 'artboard'; syncPropTabs(); return; }
  if (PP && propsContext.kind === 'frame') {
    PP.renderFrame(box, idx, l, { setRect: rect => setFrameRectUI(idx, rect),
      setStroke: values => setFrameStrokeUI(idx, values), why: moveLockWhy(idx) });
    organizeProperties(box, propsContext); PP.decorate(box, propsContext, l); syncPropTabs(); return;
  }

  
  if (!l.isGroup && l.groupType !== 3 && !['fill', 'adjust'].includes(propsContext.kind)) {
    sec('变换', 'transform');
    const v = getPropertyTransformValues(idx);
    const shape = propsContext.kind === 'shape';
    const pos = (x, y) => shape ? setShapePropertyTransform(idx, { ...(x == null ? {} : { x }), ...(y == null ? {} : { y }) }) : setLayerPos(idx, x, y);
    const size = (w, h) => {
      if (!shape) return setLayerSize(idx, w, h);
      const patch = { ...(w == null ? {} : { w }), ...(h == null ? {} : { h }) };
      if (aspectLock && v.w && v.h) { if (w != null) patch.h = v.h * w / v.w; else patch.w = v.w * h / v.h; }
      return setShapePropertyTransform(idx, patch);
    };
    const mesh = isMeshTransform(idx);
    const tIn = (key, cb) => {
      if (PP && propsContext.kind === 'smart' && (key === 'w' || key === 'h')) {
        const value = mk('output', { value: String(Math.round(v[key])), className: 'prop-smart-dimension', title: `${key === 'w' ? '宽度' : '高度'}（像素）` });
        value.dataset.transform = key;
        value.setAttribute('aria-label', key === 'w' ? '宽度（只读）' : '高度（只读）');
        (set_TInputs(TInputs || {}))[key] = value;
        return value;
      }
      const i2 = mk('input', { type: 'number', value: Math.round(v[key]) });
      i2.dataset.transform = key;
      i2.setAttribute('aria-label', ({ x: 'X 位置', y: 'Y 位置', w: '宽度', h: '高度' })[key]);
      i2.style.cssText = 'flex:1;min-width:0;width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px;font-variant-numeric:tabular-nums';
      i2.onchange = () => { const n = Math.round(+i2.value || 0); if (n === Math.round(v[key])) return; pushDocHistory(); cb(n); };
      (set_TInputs(TInputs || {}))[key] = i2;
      return i2;
    };
    const xIn = tIn('x', n => pos(n, null)), yIn = tIn('y', n => pos(null, n));
    const positionRow = row('', makeScrubLabel('X', idx, xIn, n => pos(n, null)), xIn,
             makeScrubLabel('Y', idx, yIn, n => pos(null, n)), yIn);
    positionRow.classList.add('prop-transform-row');
    const lock = mk('button', { title: '锁定宽高比（等比缩放）', className: aspectLock ? 'on' : '' });
    lock.style.cssText = 'width:26px;height:22px;padding:0;justify-content:center;flex:none';
    lock.append(icon('link', 12));
    lock.onclick = () => { set_aspectLock(!aspectLock); lock.classList.toggle('on', aspectLock); };
    const wIn = tIn('w', n => size(n, null)), hIn = tIn('h', n => size(null, n));
    const smartDimensions = !!PP && propsContext.kind === 'smart';
    const sizeRow = smartDimensions
      ? row('', mk('span', { textContent: 'W', className: 'pp-xy' }), wIn, mk('span', { textContent: 'H', className: 'pp-xy' }), hIn)
      : row('', makeScrubLabel('W', idx, wIn, n => size(n, null)), wIn,
        makeScrubLabel('H', idx, hIn, n => size(null, n)), hIn, lock);
    sizeRow.classList.add('prop-transform-row'); box.insertBefore(sizeRow, positionRow);
    const fh = mk('button', { title: '水平翻转（再次点击还原）', className: v.flipX ? 'on' : '' });
    fh.style.cssText = 'flex:1;height:24px;padding:0;justify-content:center';
    fh.append(icon('flip-horizontal', 13));
    fh.onclick = () => { if (!isMeshTransform(idx)) pushDocHistory(); if (shape) setShapePropertyTransform(idx, { flipX: !v.flipX }); else flipLayer(idx, 'x'); };
    const fv = mk('button', { title: '垂直翻转（再次点击还原）', className: v.flipY ? 'on' : '' });
    fv.style.cssText = 'flex:1;height:24px;padding:0;justify-content:center';
    fv.append(icon('flip-vertical', 13));
    fv.onclick = () => { if (!isMeshTransform(idx)) pushDocHistory(); if (shape) setShapePropertyTransform(idx, { flipY: !v.flipY }); else flipLayer(idx, 'y'); };
    (set_TInputs(TInputs || {})).fh = fh; TInputs.fv = fv;
    const rotSlider = mk('input', { type: 'number', min: -360, max: 360, step: 0.1, value: Math.round(v.rot), title: '旋转角度（顺时针，度）' });
    rotSlider.dataset.transform = 'rot'; rotSlider.setAttribute('aria-label', '旋转角度');
    rotSlider.style.cssText = 'flex:1;min-width:0;accent-color:var(--accent)';
    rotSlider.addEventListener('pointerdown', () => { if (mesh) beginMeshEdit(); else beginLayerEdit(); });
    rotSlider.addEventListener('change', () => { if (mesh) endMeshEdit(); else endLayerEdit(); });
    rotSlider.onchange = () => { if (!Number.isFinite(+rotSlider.value)) return;
      const currentRot = getPropertyTransformValues(idx).rot || 0;
      if (Math.abs((((+rotSlider.value - currentRot) % 360) + 540) % 360 - 180) < 1e-9) return;
      if (shape) { pushDocHistory('旋转形状'); setShapePropertyTransform(idx, { rot: +rotSlider.value }); return; }
      if (mesh) beginMeshEdit(); else beginLayerEdit();
      rotateLayer(idx, +rotSlider.value - (propsContext.kind === 'smart' ? smartPropertyBaseRotation(idx) : 0));
      if (mesh) endMeshEdit(); else endLayerEdit(); };
    const rotVal = mk('span', { className: 'val', textContent: '°' });
    (set_TInputs(TInputs || {})).rot = rotSlider; TInputs.rotVal = rotVal;
    row('旋转', rotSlider, rotVal, ...(smartDimensions ? [] : [fh, fv])).classList.add('prop-rotation-row');
    if (mesh) hint(li.deform ? '该智能对象正在变形编辑：变换直接作用到变形顶点/图钉，写回智能滤镜，PS 里仍可继续编辑' : '该智能对象正在变形编辑：变换直接作用到 warp 网格点，PS 里仍可继续编辑', 'ok');
    const lockWhy = moveLockWhy(idx);
    if (lockWhy) {
      for (const k of ['x', 'y', 'w', 'h', 'rot', 'fh', 'fv']) if (TInputs?.[k]) {
        TInputs[k].disabled = true; TInputs[k].title = lockWhy;
      }
      for (const scrub of [...positionRow.querySelectorAll('.scrub'), ...sizeRow.querySelectorAll('.scrub')]) {
        scrub.style.pointerEvents = 'none'; scrub.title = lockWhy;
      }
      lock.disabled = true; hint(lockWhy, 'warn');
    }

  }
  if (['pixel', 'shape', 'text'].includes(propsContext.kind) || (!PP && propsContext.kind === 'smart')) {
    sec('对齐和分布', 'align');
    const align = mk('div', { className: 'prop-align-buttons' });
    for (const [how, key] of ALIGN_BTNS) {
      const button = mk('button', { title: '对齐' + ALIGN_LABEL[how], disabled: !!moveLockWhy(idx) });
      button.dataset.propAlign = how; button.append(icon(key, 15)); button.onclick = () => alignPropertyLayers(how, PP?.alignTo); align.append(button);
    }
    row('', align).classList.add('prop-wide-row');
    const distribute = mk('div', { className: 'prop-align-buttons' });
    for (const [how, key] of Object.entries(DISTRIBUTE_ICONS)) {
      const button = mk('button', { title: '按' + ALIGN_LABEL[how] + '分布', disabled: selLayers.size < 3 });
      button.dataset.propDistribute = how; button.append(icon(key, 15)); button.onclick = () => distributeLayers(how); distribute.append(button);
    }
    row('', distribute).classList.add('prop-wide-row');
    if (PP) PP.renderAlignOptions(box, selLayers.size, propertyAlign);
  }
  section = null;
  if (PP && propsContext.kind === 'group') PP.renderGroup(box, idx, l, propertyAlign);

  
  pane = 'smart';
  if (l.isSmartObject) {
    const soIdx = sos.findIndex(so => matchLayer(so) === idx);
    const b = mk('button', { textContent: soIdx === cur ? '正在编辑智能对象' : '编辑智能对象', className: soIdx === cur ? '' : 'primary', title: '进入智能对象编辑（换设计图 / 调整放置）；双击图层行 = 进入内部' });
    b.disabled = soIdx < 0; b.onclick = () => selectSO(soIdx);
    const ib = mk('button', { textContent: '编辑内容', title: '编辑智能对象源文档' });
    ib.disabled = soIdx < 0; ib.onclick = () => openInside(soIdx);
    
    const rb = mk('label', { className: 'btn', title: '替换该智能对象的设计图（自动进入变形编辑）', for: 'repl' });
    rb.style.cssText = 'height:24px;padding:0 8px;font-size:12px';
    rb.append(icon('image-plus', 13), document.createTextNode('替换内容…'));
    rb.onclick = ev => { ev.preventDefault(); if (soIdx >= 0 && soIdx !== cur) set_pendingReplSO(soIdx); $('#repl').click(); };
    rb.classList.toggle('ghost', soIdx < 0);
    if (PP) {
      section = { pane, key: 'quick' }; row('', ib).classList.add('prop-wide-row');
      section = { pane, key: 'smart-extra' }; row('', rb, b).classList.add('prop-wide-row');
      section = { pane, key: 'smart' };
    } else {
      row('', ib, rb).classList.add('prop-wide-row');
      row('', b).classList.add('prop-wide-row');
    }
    if (soIdx >= 0) {
      const so = sos[soIdx], original = so.info?.summary?.originalSize;
      row('源文件', mk('span', { className: 'prop-source-name', textContent: so.sourceImage?.filename || '链接内容' }));
      if (original) row('原始尺寸', mk('span', { textContent: `${original.width} × ${original.height} px` }));
    }
    if (PP) {
      const model = smartPropertyModel(idx);
      PP.renderSmart(box, idx, l, soIdx >= 0 ? sos[soIdx] : null,
        model ? { model, reset: () => resetSmartProperty(idx), changeComp: id => setSmartPropertyComp(idx, id),
          why: smartPropertyWhy(idx, model) } : null);
    }
  }
  pane = 'layer'; section = null;
  
  const textPaneStart = box.children.length; pane = 'character';
  if (l.text && l.text.content != null) {
    
    const slim = !!PP;
    sec('字符', 'character');
    const ta = mk('textarea', { value: dispTextOf(idx, l) });
    ta.onchange = async () => {
      const t = ta.value.replace(/\n$/, '');
      const prev = layerTextEdits[idx];                    
      const willChange = !!(t && t !== l.text.content) || (!t && prev !== undefined);
      if (willChange) pushDocHistory();
      if (t && t !== l.text.content) layerTextEdits[idx] = t; else { delete layerTextEdits[idx]; delete textRenders[idx]; }
      if (layerTextEdits[idx] != null) {
        const ok = await renderTextLayer(idx, l);
        if (!ok) {                                         
          if (prev === undefined) delete layerTextEdits[idx]; else layerTextEdits[idx] = prev;
          delete textCrops[idx];
        }
      }
      renderStaticLayers(); renderProps();
    };
    row('文字', ta).dataset.propSection = 'content';   
    const sub = textFontSubst[idx], fc = l.text.font ? fontCache[l.text.font] : null;
    const fb = mk('button', { textContent: sub || (fc && !fc.ok) ? '替换字体…' : '更换字体…' });
    fb.onclick = async () => { const r = await openFontPopover(fb, selFontPs(idx)); if (r) await applyTextFont(idx, r); };
    const fInfo = mk('span', { textContent: `${fontDisplayName(selFontPs(idx)) || '?'} · ${Math.round((textInfoOf(idx) || l.text).fontSize * textPtFactor(idx) * 10) / 10} 点`, style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)' });
    row('字体', fInfo, fb);
    const ti = textInfoOf(idx);
    

    const kPt = textPtFactor(idx), r2 = v => Math.round(v * 100) / 100;
    const unit = t => mk('span', { textContent: t, style: 'color:var(--muted);margin:0 6px 0 2px;white-space:nowrap' });
    const num = (attr, label, val, onset, o = {}) => {
      const inp = mk('input', { type: 'number', step: o.step || 0.1, value: val, title: label });
      if (o.min != null) inp.min = o.min; if (o.max != null) inp.max = o.max;
      inp.dataset.attr = attr; inp.setAttribute('aria-label', label); inp.style.width = o.w || '58px';
      inp.onchange = () => { if (inp.value === '') { renderProps(); return; } const n = +inp.value; if (Number.isFinite(n)) onset(n); };
      return inp;
    };
    

    const grid = (...fields) => { const g = mk('div', { className: 'tx-grid' }); g.dataset.propPane = pane; if (section?.pane === pane) g.dataset.propSection = section.key; g.append(...fields); box.appendChild(g); return g; };
    const field = (iconName, label, ...els) => {
      const f = mk('label', { className: 'tx-field', title: label });
      const ic = icon(iconName, 18); ic.classList.add('tx-ic');
      f.append(ic, ...els);
      return f;
    };
    const size = num('text-font-size', '字号（点）', r2(ti.fontSize * kPt), n => { if (n > 0) applyTextStyle(idx, { fontSize: n / kPt }); }, { min: 0.01 });
    const lead = mk('input', { type: 'text', value: ti.leading == null ? '(自动)' : String(r2(ti.leading * kPt)), title: '行距（点；清空或填「自动」= 自动行距）' });
    lead.dataset.attr = 'text-leading';
    lead.onkeydown = e => { if (e.key === 'Enter') lead.blur(); e.stopPropagation(); };
    lead.onchange = () => { const v = lead.value.replace(/[()（）]/g, '').trim(); if (!v || /^(自动|auto)$/i.test(v)) applyTextStyle(idx, { leading: null }); else if (+v > 0) applyTextStyle(idx, { leading: +v / kPt }); else renderProps(); };
    const kern = mk('select', { title: '字距微调' });
    for (const [v, t] of [['metrics', '度量标准'], ['optical', '视觉'], ['none', '0']]) kern.append(new Option(t, v));
    

    kern.options[1].title = '视觉：按字形轮廓调整相邻两字的间距（需要字体文件；PS 把「视觉」存在 Txt2 里，经典 EngineData 写 AutoKerning 开）';
    kern.value = ti.autoKern === false ? 'none' : ti.kernMode === 'optical' ? 'optical' : 'metrics'; kern.dataset.attr = 'text-kerning';
    kern.onchange = async () => {
      if (kern.value === 'optical') {
        const ps = ti.font || layerFontPs(idx);
        const ok = ps ? await opticalKernReady(ps) : null;
        if (!ok) shell.status(`拿不到字体「${ps || '?'}」的字体文件，视觉字距按度量标准预览（上传字体或授权「读取全部本机字体」后生效）`);
      }
      applyTextStyle(idx, { autoKern: kern.value !== 'none', kernMode: kern.value === 'optical' ? 'optical' : 'metrics' });
    };
    const track = num('text-tracking', '字距（千分之一 em）', Math.round(ti.tracking || 0), n => applyTextStyle(idx, { tracking: Math.round(n) }), { step: 10 });
    const vs = num('text-vscale', '垂直缩放（%）', r2((ti.vScale || 1) * 100), n => { if (n > 0) applyTextStyle(idx, { vScale: n / 100 }); }, { step: 1, min: 1, max: 1000 });
    const hs = num('text-hscale', '水平缩放（%）', r2((ti.hScale || 1) * 100), n => { if (n > 0) applyTextStyle(idx, { hScale: n / 100 }); }, { step: 1, min: 1, max: 1000 });
    const bshift = num('text-baseline-shift', '基线偏移（点）', r2((ti.baselineShift || 0) * kPt), n => applyTextStyle(idx, { baselineShift: n / kPt }));
    const color = mk('input', { type: 'color', value: hexOf(ti.color.slice(0, 3).map(v => Math.round(v * 255))), title: '文字颜色' });
    color.dataset.attr = 'text-color';
    color.onchange = () => applyTextStyle(idx, { color: [...parseHex6(color.value).map(v => v / 255), 1] });
    for (const el of [size, lead, track, vs, hs, bshift]) el.style.width = '';
    
    const lang = mk('select', { title: '对所选字符设置语言，以确定连字和拼写规则' });
    lang.append(new Option('美国英语', 'en-US'), new Option('简体中文', 'zh-CN'));
    lang.disabled = true; lang.title = '还没做：语言写在 EngineData 的 Language 编号里，编号表未公开，写错会让 PS 断字 / 拼写规则错乱';
    const aaSel = mk('select', { title: '设置消除锯齿的方法' });
    for (const [, value, label] of ANTI_ALIAS_MODES) aaSel.append(new Option(aaLabel(value, label), value));
    aaSel.value = effTextDesc(idx, 'antiAlias') || 'antiAliasSharp'; aaSel.dataset.attr = 'text-antialias';
    aaSel.onchange = () => applyTextDesc(idx, { antiAlias: aaSel.value }, '消除锯齿');
    if (slim) grid(field('text-size', '设置字体大小（点）', size, unit('点')), field('text-leading', '设置行距（点）', lead, unit('点')),
         field('text-kerning', '设置两个字符间的字距微调', kern), field('text-tracking', '设置所选字符的字距调整', track),
         field('text-color', '颜色', color), field('text-antialias', '设置消除锯齿的方法', aaSel));
    else grid(field('text-size', '设置字体大小（点）', size, unit('点')), field('text-leading', '设置行距（点）', lead, unit('点')),
         field('text-kerning', '设置两个字符间的字距微调', kern), field('text-tracking', '设置所选字符的字距调整', track),
         field('text-vscale', '垂直缩放', vs, unit('%')), field('text-hscale', '水平缩放', hs, unit('%')),
         field('text-baseline', '设置基线偏移（点）', bshift, unit('点')), field('text-color', '颜色', color),
         (() => { const f = mk('label', { className: 'tx-field', title: lang.title }); f.append(mk('span', { textContent: '语言', style: 'white-space:nowrap;color:var(--muted);margin-right:4px' }), lang); return f; })(),
         field('text-antialias', '设置消除锯齿的方法', aaSel));
    const tg = (attr, iconName, label, on, patch) => {
      const b = mk('button', { type: 'button', title: label, className: 'tx-tog' + (on ? ' on' : '') });
      b.append(icon(iconName, 16)); b.dataset.attr = attr; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.onclick = () => applyTextStyle(idx, patch);
      return b;
    };
    const tbar = mk('div', { className: 'tx-toggles' });
    tbar.append(
      tg('text-bold', 'text-bold', '仿粗体', ti.bold, { bold: !ti.bold }),
      tg('text-italic', 'text-italic', '仿斜体', ti.italic, { italic: !ti.italic }),
      tg('text-allcaps', 'text-allcaps', '全部大写字母', ti.caps === 'all', { caps: ti.caps === 'all' ? 'none' : 'all' }),
      tg('text-smallcaps', 'text-smallcaps', '小型大写字母', ti.caps === 'small', { caps: ti.caps === 'small' ? 'none' : 'small' }),
      tg('text-super', 'text-super', '上标', ti.baseline === 'superscript', { baseline: ti.baseline === 'superscript' ? 'normal' : 'superscript' }),
      tg('text-sub', 'text-sub', '下标', ti.baseline === 'subscript', { baseline: ti.baseline === 'subscript' ? 'normal' : 'subscript' }),
      tg('text-underline', 'text-underline', '下划线', ti.underline, { underline: !ti.underline }),
      tg('text-strike', 'text-strike', '删除线', ti.strikethrough, { strikethrough: !ti.strikethrough }));
    tbar.dataset.propPane = pane; if (!slim) box.appendChild(tbar);
    
    if (TXP && !slim) for (const el of TXP.charExtras(idx, ti, patch => applyTextStyle(idx, patch))) { el.dataset.propPane = pane; el.dataset.propSection = 'character'; box.appendChild(el); }
    
    sec('段落', 'paragraph');
    const aligns = mk('div', { className: 'prop-align-buttons tx-aligns' });
    for (const [value, label, iconName] of TEXT_ALIGNS_ALL) {
      const button = mk('button', { type: 'button', title: label, className: ti.align === value ? 'on' : '' });
      button.dataset.textAlign = value; button.setAttribute('aria-label', label);
      button.append(icon(iconName, 18));
      button.onclick = () => applyTextStyle(idx, { align: value }); aligns.append(button);
    }
    row('', aligns).dataset.propSection = 'paragraph';
    const ind = (attr, label, key) => { const el = num(attr, label + '（点）', r2((ti[key] || 0) * kPt), n => applyTextStyle(idx, { [key]: n / kPt }), { step: 1 }); el.style.width = ''; return el; };
    if (!slim) grid(field('text-indent-left', '左缩进', ind('text-indent-left', '左缩进', 'startIndent'), unit('点')),
         field('text-indent-right', '右缩进', ind('text-indent-right', '右缩进', 'endIndent'), unit('点')),
         field('text-indent-first', '首行缩进', ind('text-indent-first', '首行缩进', 'firstLineIndent'), unit('点')), mk('span'),
         field('text-space-before', '段前添加空格', ind('text-space-before', '段前添加空格', 'spaceBefore'), unit('点')),
         field('text-space-after', '段后添加空格', ind('text-space-after', '段后添加空格', 'spaceAfter'), unit('点')));
    
    const hyph = mk('input', { type: 'checkbox', checked: !!ti.hyphenate, title: '连字（西文自动断字，写回 EngineData 的 AutoHyphenate；画布预览不断字）' });
    hyph.dataset.attr = 'text-hyphenate';
    hyph.onchange = () => applyTextStyle(idx, { hyphenate: hyph.checked });
    const pg = mk('div', { className: 'tx-grid' }); pg.dataset.propPane = pane; pg.dataset.propSection = 'paragraph';
    const lab = (t, el) => { const f = mk('label', { className: 'tx-field', title: el.title }); f.append(mk('span', { textContent: t, style: 'white-space:nowrap;color:var(--muted);margin-right:4px' }), el); return f; };
    if (TXP) pg.append(...TXP.paraExtras(idx, ti, patch => applyTextStyle(idx, patch)));
    pg.append(lab('连字', hyph));
    if (!slim) box.appendChild(pg);
    
    const dyn = textDynamicOf(idx);
    if (dyn) {
      sec('动态文本', 'paragraph');
      const shapeSel = mk('select', { title: '动态文本的形状' });
      for (const [v, t] of DYN_SHAPES) shapeSel.append(new Option(t, v));
      shapeSel.value = dyn.shape || 'stack'; shapeSel.dataset.attr = 'text-dyn-shape';
      shapeSel.onchange = () => toggleDynamicText(idx, shapeSel.value);
      const gap = num('text-dyn-gap', '行间距（%）', Math.round((dyn.lineGap != null ? dyn.lineGap : 0.1) * 100), n => applyTextDesc(idx, { dynamic: { ...dyn, lineGap: Math.max(-50, Math.min(200, n)) / 100 } }, '动态文本行间距'), { step: 1 });
      gap.style.width = '';
      const dg = mk('div', { className: 'tx-grid' }); dg.dataset.propPane = pane;
      dg.append(lab('形状', shapeSel), lab('行间距 %', gap));
      box.appendChild(dg);
      const back = mk('button', { type: 'button', textContent: '还原为普通文字' }); back.onclick = () => toggleDynamicText(idx);
      row('', back);
      hint('动态文本：拖文字框控制点，每行字号跟着框走（PS 2026 同）。导出时写入排好的像素 + 文字内容；PS 2026 的动态文本参数存在新式文字数据里，不写回', 'warn');
    }
    if (sub) hint(`已替换为 ${sub.psName}（导出时写入 PSD）`, 'ok');
    else if (fc && !fc.ok) hint('本机没有安装该字体：改字后预览会提示替换；不替换则导出后由 PS 用替代字体重排', 'warn');
    else if (fc && fc.ok) hint('字体可用 ✓', 'ok');
    if (effTextDesc(idx, 'orientation') === 'vertical')
      hint('直排预览按逐字成列、从右往左排列；标点使用字体普通字形，尚不支持 OpenType 竖排替代字形。', 'warn');
    const ws = warpStyleOf(effTextWarp(idx));
    if (ws && ws !== 'warpNone')
      hint(`该文字带变形（${warpLabelOf(ws)}）：写回 PSD 是精确的描述符；画布是按样式形状做的近似预览`
         + '（PS 的 15 条预设曲线没有公开，弧度细节会有出入）。改变形走选项栏「创建文字变形」或「文字 › 文字变形…」。', 'warn')
    
    let tr = null; try { tr = getTextRuns(l.text); } catch {}
    if (!slim && tr && (tr.runs.length > 1 || tr.paragraphs.length > 1)) {
      sec('多段文字样式', 'runs');
      row('样式表', mk('span', { textContent: `${tr.runs.length} 段字符样式 · ${tr.paragraphs.length} 个段落`, style: 'color:var(--text)' }));
      const clip = s => { const t = String(s).replace(/\n/g, '⏎'); return t.length > 14 ? t.slice(0, 14) + '…' : t; };
      const pill = 'display:flex;align-items:center;gap:5px;max-width:100%;background:rgba(255,255,255,.06);color:var(--muted);border-radius:9px;padding:1px 7px';
      if (tr.runs.length > 1) {
        const rl = mk('div', { className: 'fxlist runlist' });
        for (const r of tr.runs) {
          const it = mk('span', { style: pill });
          if (r.color) it.append(mk('i', { style: `width:9px;height:9px;flex:none;border-radius:2px;border:1px solid var(--line2);background:rgb(${r.color.r},${r.color.g},${r.color.b})` }));
          const bits = [r.font || '?', Math.round(r.fontSize) + 'pt'];
          if (r.bold) bits.push('粗'); if (r.italic) bits.push('斜');
          if (r.underline) bits.push('下划线'); if (r.strikethrough) bits.push('删除线');
          if (r.caps === 'all') bits.push('全大写'); else if (r.caps === 'small') bits.push('小型大写');
          if (r.baseline !== 'normal') bits.push(r.baseline === 'superscript' ? '上标' : '下标');
          if (r.tracking) bits.push('字距 ' + Math.round(r.tracking));
          if (r.baselineShift) bits.push('基线 ' + Math.round(r.baselineShift));
          it.append(mk('span', { textContent: `「${clip(r.text)}」 ${bits.join(' · ')}`, style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }));
          rl.append(it);
        }
        rl.dataset.propSection = 'runs'; box.appendChild(rl);
      }
      if (tr.paragraphs.length > 1) {
        const AL = { left: '左对齐', right: '右对齐', center: '居中', justify: '两端对齐' };
        const pl = mk('div', { className: 'fxlist runlist' });
        tr.paragraphs.forEach((p, i) => {
          const bits = [AL[p.align] || p.align];
          if (p.indent.firstLine) bits.push('首行缩进 ' + Math.round(p.indent.firstLine));
          if (p.indent.left || p.indent.right) bits.push(`缩进 ${Math.round(p.indent.left)}/${Math.round(p.indent.right)}`);
          if (p.spaceBefore || p.spaceAfter) bits.push(`段距 ${Math.round(p.spaceBefore)}/${Math.round(p.spaceAfter)}`);
          pl.append(mk('span', { style: pill, textContent: `段${i + 1}「${clip(p.text)}」 ${bits.join(' · ')}` }));
        });
        pl.dataset.propSection = 'runs'; box.appendChild(pl);
      }
      hint('改文字内容时各段样式跟着字走（与 PS 一致）；就地编辑时选中几个字再改字符面板 = 只改选中的字，段落属性作用于插入点所在的段', 'ok');
    }
  }
  markPane(textPaneStart, 'character');
  if (!l.text || l.text.content == null) {
    const empty = mk('div', { className: 'empty', textContent: '选中一个文字图层后，可在这里编辑字符与段落。' });
    empty.dataset.propPane = 'character'; box.appendChild(empty);
  }
  pane = 'layer';
  


  const G = attrGuards(idx, l);
  const tog = (text, on, reason, cb, title, attr) => {
    const b = mk('button', { textContent: text, className: on ? 'on' : '' });
    b.title = reason || title || '';
    if (attr) b.dataset.attr = attr;                 
    if (reason) b.disabled = true; else b.onclick = cb;
    return b;
  };
  const btns = (...els) => { const d = mk('div', { className: 'btns' }); d.append(...els); return d; };
  const editable = l.groupType !== 3;
  

  if (editable && !EDITM) {
    kick(EDIT);
    lazyHint(box, EDIT, EDIT.error
      ? '（参数编辑器 / 新建效果 / 矢量路径暂时用不了；图层查看、蒙版与锁定等改动、导出都不受影响）'
      : '（参数编辑器 / 新建效果 / 矢量路径稍后可用；这期间的改动照常入队，只是不做即时预判，导出时仍会整份校验）');
  }
  const structOp = maskStructOp(idx);
  const structBusy = structOp ? `已排队「${opLabel(structOp)}」：先点一次撤销它再改别的蒙版属性` : '';

  
  pane = 'adjust';
  if (l.adjustment) {
    

    if (!adjLayerTarget(idx) && !(PP && propsContext.kind === 'shape')) {   
      row(l.adjustment.kind === 'fill' ? '填充' : '调整', mk('span', { textContent: l.adjustment.label, style: 'color:var(--text)' }));
    }
    const previewLayer = doc && doc.layers[idx];
    const rendered = previewLayer && adjustmentRenderParams(previewLayer.adjustment);
    hint(rendered
      ? rendered.type === 'photoFilter'
        ? '画布会按此照片滤镜即时重合成。颜色空间、浓度和「保留明度」都已投影；Photoshop 未公开精确色彩管理/明度恢复曲线，当前结果明确是 Normal / HSL Color 的近似。'
        : rendered.type === 'vibrance'
          ? '画布会按此自然饱和度即时重合成。它采用低饱和优先的近似曲线；Adobe 的肤色保护曲线未公开，因此不宣称逐像素等价。'
          : rendered.type === 'blackWhite' && rendered.useTint
            ? '画布会按此黑白 + 色调即时重合成。六色权重按黑白算法处理，Lab 色调以保明暗 HSL 映射近似；Photoshop 的 Lab 曲线和色彩管理未公开，因此不宣称逐像素等价。'
          : rendered.type === 'selectiveColor'
            ? '画布会按此可选颜色即时重合成。九个色板、CMYK 校正值与相对/绝对模式都已投影；Adobe 未公开精确色域边界和色彩管理，当前结果是连续九色域的近似。'
          : '画布会按此调整层即时重合成；当前支持曝光度、反相、色调分离、阈值、旧式亮度/对比度、色阶、曲线、色相/饱和度、无着色黑白、通道混合器、色彩平衡与不透明渐变映射。'
      : '这类调整 / 填充块仍会原样写回 PSD，但当前预览器无法可靠重现它，避免用默认参数伪造画布效果。', previewLayer && adjustmentRenderParams(previewLayer.adjustment) ? 'plain' : 'warn');
  }
  
  pane = 'mask';
  if (PP && editable) { const from = box.children.length; PP.renderMask(box, idx, l, { G, structBusy, structOp, shape: propsContext.kind === 'shape' }); markPane(from, 'mask'); }
  pane = 'style';
  const stylePaneStart = box.children.length;
  
  


  const params = (l.effects && l.effects.length) || l.adjustment ? layerParams(idx) : null;
  markPane(stylePaneStart, 'style');
  
  
  
  pane = 'adjust'; const adjustPaneStart = box.children.length;
  if (editable && !PP && !['adjust', 'fill'].includes(propsContext.kind)) renderImageAdjust(box, idx, l, { row, hint, mk, tog, btns });   
  markPane(adjustPaneStart, 'adjust');
  pane = 'path'; const pathPaneStart = box.children.length;
  if (editable && (!PP || propsContext.kind === 'shape' || l.vectorMask)) renderVectorPath(box, idx, l, { row, hint, mk, tog, btns });
  markPane(pathPaneStart, PP && propsContext.kind !== 'shape' ? 'mask' : 'path');   
  if (PP && propsContext.kind !== 'shape') for (let i = pathPaneStart; i < box.children.length; i++) box.children[i].dataset.propSection = 'mask-path';
  pane = 'smart'; const smartPaneStart = box.children.length;
  if (editable && l.isSmartObject) renderSmartFilters(box, idx, l, { row, hint, mk, tog, btns });
  markPane(smartPaneStart, 'smart');
  for (let i = smartPaneStart; i < box.children.length; i++) box.children[i].dataset.propSection = 'filters';
  pane = 'layer'; section = null;

  
  
  if (editable && !PP) {
    pane = 'style'; sec('混合选项', 'layer');
    
    const bm = mk('select', { title: '混合模式' });
    const ed0 = layerEdits[idx] || {};
    const curBlend = ed0.blendKey != null ? ed0.blendKey : (l.blendKey || (l.isGroup ? 'pass' : 'norm'));
    for (const k of (l.isGroup ? ['pass', ...BLEND_KEYS] : BLEND_KEYS))
      bm.appendChild(mkEl('option', { value: k, textContent: BLEND_LABELS[k] || k }));
    if (![...bm.options].some(o => o.value === curBlend)) bm.appendChild(mkEl('option', { value: curBlend, textContent: '[' + String(curBlend).trim() + ']' }));
    bm.value = curBlend;
    bm.dataset.attr = 'blend-mode';
    bm.onchange = () => { pushDocHistory('混合模式'); for (const i of batchTargets(idx)) setLayerBlend(i, bm.value); syncLayerControls(); renderLayerPanel(); };
    row('混合模式', bm);
    const opBase = ed0.opacity != null ? ed0.opacity : (l.opacity ?? 255);
    const opS = mk('input', { type: 'range', min: 0, max: 100, value: Math.round(opBase / 2.55), title: '不透明度（图层内容 + 图层样式）' });
    const opV = mk('span', { className: 'val', textContent: Math.round(opBase / 2.55) + '%' });
    opS.dataset.attr = 'layer-opacity';
    opS.addEventListener('pointerdown', () => beginLayerEdit());
    opS.oninput = () => { opV.textContent = opS.value + '%'; for (const i of batchTargets(idx)) setLayerOpacity(i, Math.round(+opS.value * 2.55)); };
    opS.onchange = () => { endLayerEdit(); actRecord('layerProps', { opacity: +opS.value }); syncLayerControls(); schedulePanelRebuild(); };
    row('不透明度', opS, opV);
    const origFill = l.fillOpacity != null ? l.fillOpacity : 255;
    const fo = effFillOpacity(idx, l);
    const foS = mk('input', { type: 'range', min: 0, max: 100, value: Math.round(fo / 2.55), title: '填充不透明度（只影响像素，不影响图层样式）' });
    const foV = mk('span', { className: 'val', textContent: Math.round(fo / 2.55) + '%' });
    foS.dataset.attr = 'fill-opacity';
    foS.oninput = () => { foV.textContent = foS.value + '%'; };
    foS.onchange = () => {
      const pct = +foS.value, v = pct === Math.round(origFill / 2.55) ? origFill : Math.round(pct * 2.55);
      setSingleOp(idx, { op: 'setFillOpacity', index: idx, fillOpacity: v }, v === origFill);
      actRecord('layerProps', { fillOpacity: pct });
    };
    row('填充', foS, foV);
    
    const koSel = mk('select', { title: '挖空：把本层覆盖范围内的下方像素抠成透明（混合选项 › 高级混合）' });
    for (const [v, t] of [[0, '无'], [1, '浅'], [2, '深']]) {
      const o = mkEl('option', { value: String(v), textContent: t });
      koSel.append(o);
    }
    koSel.value = String(effKnockout(idx, l));
    koSel.onchange = () => {
      const v = +koSel.value;
      setSingleOp(idx, { op: 'setLayerKnockout', index: idx, knockout: v }, v === (l.knockout || 0));
    };
    row('挖空', koSel);
    const clip = effClipping(idx, l);
    row('剪贴', btns(tog(clip ? '剪贴到下层' : '不剪贴', clip, '', () => {
      const v = !clip;
      setOpField(idx, { op: 'setLayerProps' }, 'clipping', v, !!l.clipping);
      if (doc && doc.layers[idx]) doc.layers[idx].clipping = v ? 1 : 0;   
      renderStaticLayers();
    }, '剪贴蒙版：内容被下方图层裁剪', 'clipping')));
    sec('图层选项', 'flags');
    const LOCKS = [['lockTransparency', 'transparency', '透明像素'], ['lockComposite', 'composite', '图像像素'],
                   ['lockPosition', 'position', '位置'], ['lockAll', 'all', '全部']];
    row('锁定', btns(...LOCKS.map(([opf, lf, label]) => {
      const on = effLock(idx, l, opf, lf);
      return tog(label, on, G.flags || '', () => setOpField(idx, { op: 'setLayerFlags' }, opf, !on, !!(l.locks && l.locks[lf])), '锁定' + label, 'lock-' + lf);
    })));
    const curLabel = effColorLabel(idx, l);
    const sw = mk('div', { className: 'swatches' });
    for (let c = 0; c <= 7; c++) {
      const b = mk('button', { className: 'sw' + (c === curLabel ? ' on' : ''), title: '颜色标签：' + COLOR_LABEL_NAMES[c] });
      b.dataset.color = String(c); b.dataset.attr = 'color-label';
      b.style.background = c ? (LABEL_COLORS[c] || 'transparent') : 'transparent';
      if (!c) b.textContent = '∅';
      b.onclick = () => setSingleOp(idx, { op: 'setLayerColorLabel', index: idx, color: c }, c === (l.colorLabel || 0));
      sw.append(b);
    }
    row('颜色标签', sw);
    const bits = [];
    if (effKnockout(idx, l)) bits.push('挖空：' + (effKnockout(idx, l) === 2 ? '深' : '浅'));
    if (l.isGroup && l.passThrough) bits.push('组混合：直通');
    if (l.smartFilters) bits.push('带智能滤镜');
    if (bits.length) row('其它', mk('span', { textContent: bits.join(' · '), style: 'color:var(--muted);overflow:hidden;text-overflow:ellipsis' }));
  }

  
  let adjSectionTitle = '';                    
  if (editable && params && !params.error) {
    pane = 'adjust'; sec(propsContext.kind === 'shape' ? '外观' : propsContext.label, propsContext.kind === 'shape' ? 'appearance' : 'adjust');
    const fromAdjust = box.children.length;
    if (propsContext.kind === 'shape') { renderShapeFillType(idx, { row, mk }); renderLiveShapeProps(idx, { row, mk }); }
    



    const dedicated = dedicatedAdjBlocks(idx);
    const adjT = dedicated.size ? adjLayerTarget(idx) : null;
    if (adjT) {
      const host = mk('div', { className: 'adj-ctl', id: 'adjCtl' });
      renderAdjustCtl(host, idx, adjT);
      const r = row('', host);                          
      r.classList.add('prop-adj-row');
      adjSectionTitle = adjT.label;
    }
    if (dedicated.size) {
      const rest = ((params.adjustment || {}).targets || []).filter(t => !dedicated.has(t.block));
      if (rest.length) {
        renderParamEditor(box, idx, l, { ...params, effects: null, adjustment: { ...params.adjustment, targets: rest } },
                          { row, hint, mk, stateKey: 'adjustment', hideTargetLabel: true });
      }
    } else {
      renderParamEditor(box, idx, l, { ...params, effects: null }, { row, hint, mk, stateKey: 'adjustment', hideTargetLabel: true });
    }
    if (PP && propsContext.kind === 'adjust' && !adjT) {   
      const host = mk('div', { className: 'adj-ctl' }); buildAdjCtlFoot(host, idx, null);
      row('', host).classList.add('prop-adj-row');
    }
    markPane(fromAdjust, pane);
    for (let i = fromAdjust; i < box.children.length; i++) box.children[i].dataset.propSection = section.key;
  }
  if (PP) { section = null; pane = 'layer'; PP.quickActions(box, propsContext, idx, l); }
  else { pane = 'layer'; sec('快速操作', 'quick'); }
  if (PP) {  }
  else if (propsContext.kind === 'shape') {
    const b = mk('button', { textContent: '编辑路径' }); b.onclick = () => { setDocTool('path'); renderProps(); };
    row('', b).classList.add('prop-wide-row');
  } else if (propsContext.kind === 'text') {
    const b = mk('button', { textContent: '编辑文字' }); b.onclick = () => openInlineTextEditor(idx);
    row('', b).classList.add('prop-wide-row');
  } else if (propsContext.kind === 'pixel') {
    const b = mk('button', { textContent: '图像调整…' }); b.onclick = () => { set_propTab('adjust'); syncPropTabs(); };
    row('', b).classList.add('prop-wide-row');
  }

  
  const queued = layerOps[idx] || [];
  if (queued.length) hint(`已改 ${queued.length} 项，导出时写回：${queued.map(opLabel).join('；')}`, 'ok');
  for (const child of box.children) if (!child.dataset.propPane) child.dataset.propPane = 'layer';
  for (const [key, label] of [['mask', '这个图层没有可编辑的像素蒙版。'], ['style', '这个图层没有可编辑的混合选项。'], ['path', '这个图层没有矢量蒙版或形状路径。'], ['smart', '这个图层不是智能对象。'], ['adjust', '这个图层没有调整或填充参数。']]) {
    if (!box.querySelector(`[data-prop-pane="${key}"]`)) { const empty = mk('div', { className: 'empty', textContent: label }); empty.dataset.propPane = key; box.appendChild(empty); }
  }
  organizeProperties(box, propsContext);
  if (PP) PP.decorate(box, propsContext, l);
  

  if (adjSectionTitle) {
    const s = box.querySelector('.prop-section[data-section="adjust"] > summary');
    if (s) s.textContent = adjSectionTitle;
  }
  syncPropTabs();
}










export function addedFxTemplateValue(effect, path){
  const root = createEffectTemplate(effect), v = root && previewPathValue(root, path);
  if (v && typeof v === 'object' && ['Rd  ', 'Grn ', 'Bl  '].every(k => Object.prototype.hasOwnProperty.call(v, k)))
    return '#' + ['Rd  ', 'Grn ', 'Bl  '].map(k => Math.max(0, Math.min(255, Math.round(v[k]))).toString(16).padStart(2, '0')).join('');
  
  
  return v && typeof v === 'object' && (v.__unit !== undefined || v.__enumType !== undefined) ? v.value : v;
}
export function addedFxValue(op, path){
  return op.values && Object.prototype.hasOwnProperty.call(op.values, path) ? op.values[path] : addedFxTemplateValue(op.effect, path);
}
export function setAddedFxParam(idx, effect, path, value, original, seq = 0){
  return commitLayerOps(idx, () => {
    const key = `addLayerEffect:${effect}:${seq || 0}`, op = findLayerOp(idx, key);
    if (!op) return;
    const values = { ...(op.values || {}) };
    if (paramEq(value, original)) delete values[path]; else values[path] = value;
    if (Object.keys(values).length) op.values = values; else delete op.values;
    putLayerOp(idx, op);
  });
}












function adjustmentMenuOptions(){
  return Object.keys(ADJ_KINDS_MENU).map(k => ({ kind: k, label: ADJ_KINDS_MENU[k].label, accepts: ADJ_KINDS_MENU[k].accepts }));
}
export function syncNewAdjMenu(){
  const sel = $('#newAdjSel');
  
  
  if (sel.options.length <= 1) {
    sel.innerHTML = '';
    

    sel.append(mkEl('option', { value: '', hidden: true }));
    for (const o of adjustmentMenuOptions()) {
      const el = mkEl('option', { value: o.kind, textContent: o.label });
      el.dataset.kind = o.kind;
      sel.append(el);
    }
  }
  sel.value = '';
  const L = layerTree && layerTree.flat && layerTree.flat[selLayer];
  sel.disabled = !doc || !layerTree || !EDITM;
  sel.title = !doc ? '先打开一个 PSD'
    : !EDITM ? EDIT.statusText()
    : `新建调整图层`;
  if (doc && !EDITM) kick(EDIT);
  
  const nlb = $('#newLayerBtn');
  if (nlb) nlb.disabled = !doc;
}
$('#newAdjSel').onchange = () => { const k = $('#newAdjSel').value; $('#newAdjSel').value = ''; if (k) addAdjustmentLayer(k); };
$('#newLayerBtn').onclick = () => createLayerUI();

export async function addAdjustmentLayer(kind, presetValues, opts = {}){
  if (!doc || !origBuffer) return;
  if (!await ensureLazy(EDIT, '新建调整图层')) { syncNewAdjMenu(); return; }   
  const label = (ADJ_KINDS_MENU[kind] || {}).label || kind;
  
  const at = selLayer >= 0 ? selLayer + 1 : doc.layers.length;
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  setWaitCursor(true, '正在处理当前视图…');
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    



    const values = presetValues || (kind === 'brightnessContrast' ? { useLegacy: true } : null);
    

    
    const extra = {};
    if (opts.clipping) extra.clipping = true;
    if (opts.blendKey && opts.blendKey !== 'norm') extra.blendKey = opts.blendKey;
    if (opts.opacity != null && opts.opacity !== 255) extra.opacity = Math.max(0, Math.min(255, Math.round(opts.opacity)));
    const ops = [{ op: 'addAdjustmentLayer', kind, at, name: opts.name || label, ...extra, ...(values ? { values } : {}) }];
    let withMask = false;
    if (selection) {
      const b = selectionBounds(selection);
      if (b && b.width > 0 && b.height > 0) {
        const { gray, bounds } = selectionToMaskGray(selection, { x: b.x, y: b.y, width: b.width, height: b.height });
        ops.push({ op: 'addLayerMask', index: at, gray, bounds, defaultColor: 0 });   
        withMask = true;
      }
    }
    

    if (!withMask && opts.mask !== false && (opts.mask === true || !(LP && !LP.opts.defaultMask))) ops.push({ op: 'addLayerMask', index: at, fill: 'reveal', compact: docW * docH > 64e6, bounds: { top: 0, left: 0, bottom: docH, right: docW }, defaultColor: 255 });   
    if (opts.colorLabel) ops.push({ op: 'setLayerColorLabel', index: at, color: opts.colorLabel });
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, `新建${label}调整图层`);
    $('#err').textContent = '';
    
    


    revealPropsPanel();
  } catch (e) {
    $('#err').textContent = `新建「${label}」调整图层没能完成：` + humanEditError(e && e.message || e);
  } finally {
    setWaitCursor(false);
  }
  syncNewAdjMenu();
}



export async function addAdjustmentPreset(preset, opts = {}){
  if (!doc || !origBuffer || li) return false;
  if (!await ensureLazy(EDIT, '应用调整预设')) return false;
  const at = selLayer >= 0 ? selLayer + 1 : doc.layers.length;
  const ops = [];
  preset.layers.forEach((L, k) => {
    const label = (ADJ_KINDS_MENU[L.kind] || {}).label || L.kind;
    const values = L.kind === 'brightnessContrast' ? { useLegacy: true, ...(L.values || {}) } : L.values;
    ops.push({ op: 'addAdjustmentLayer', kind: L.kind, at: at + k, name: L.name || label,
      ...(L.opacity != null && L.opacity !== 255 ? { opacity: L.opacity } : {}), ...(L.blendKey ? { blendKey: L.blendKey } : {}),
      ...(values ? { values } : {}) });
    if (opts.mask !== false) ops.push({ op: 'addLayerMask', index: at + k, fill: 'reveal', compact: docW * docH > 64e6, bounds: { top: 0, left: 0, bottom: docH, right: docW }, defaultColor: 255 });
  });
  const n = preset.layers.length;
  if (n > 1) ops.push({ op: 'groupLayers', indices: Array.from({ length: n }, (_, k) => at + k), name: preset.name });
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(n > 1 ? at + n + 1 : at, doc.layers.length - 1));   
    refreshAll(false);
    structuralDone(prev, `调整预设：${preset.name}`);
    revealPropsPanel();
    return true;
  } catch (e) {
    $('#err').textContent = `调整预设「${preset.name}」没能应用：` + humanEditError(e && e.message || e);
    return false;
  }
}
