




import {
  smartObjectFragment, adjustmentRenderParams, hasRenderableEffects, hasRenderableFill, hasRenderableVectorMask,
  hasUnrenderedEffects, SUPPORTED_BLEND_MODES, vectorStrokeRenderParams,
} from '../../../core/app.js';
import { createApiClient } from '../api-client.js';
import { loadEngine } from '../engine-loader.js';
import { uiIcon, injectUiCursor } from '../icons.js';
import { lazyModule } from '../lazy.js';
import '../context-menu-policy.js';
import { shell } from '../shell.js';
import { doc, layerDeletes, layerTree } from './02-doc-state.js';
import { renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { renderProps, syncNewAdjMenu } from './24-layer-ops-queue.js';
import { syncToolOptions } from './32-cursors-select-options.js';
import { drawGizmo } from './46-smart-filter-panel.js';

shell.init();                         
injectUiCursor();                     





















export const EDIT   = lazyModule(() => import('../lazy-edit.js'),        '图层编辑');
export const ADJUST = lazyModule(() => import('../../../core/adjust.js'),     '图像调整');
export const SELECT = lazyModule(() => import('../../../core/selection.js'),  '选区工具');
export const QUADW  = lazyModule(() => import('../../../core/quad-warp.js'),  '自由变换');
export const NEWDOC = lazyModule(() => import('../../../core/psd-new.js'),    '新建文档');
export const FILTER = lazyModule(() => import('../../../core/filters.js'),    '滤镜');
export const RETOUCH = lazyModule(() => import('../../../core/retouch.js'),   '润饰工具');   
export const BRUSH   = lazyModule(() => import('../../../core/brush-ops.js'), '笔刷工具');
export const CAFILL  = lazyModule(() => import('../../../core/content-aware.js'), '内容识别填充');   


export let EDITM = null, ADJM = null, SELM = null, QUADM = null, FLTM = null, RETOUCHM = null, BRUSHM = null;





export const applyEdits        = (buf, ops, o = {}) => EDIT.get().applyEdits(buf, ops, { verify: 'fast', ...o });
export const planEdits         = (...a) => EDIT.get().planEdits(...a);
export const getLayerParams    = (...a) => EDIT.get().getLayerParams(...a);
export const createEffectTemplate = (...a) => EDIT.get().createEffectTemplate(...a);
export const getVectorMaskPath = (...a) => EDIT.get().getVectorMaskPath(...a);
export const getVectorStroke   = (...a) => EDIT.get().getVectorStroke(...a);



export const rectSelection      = (...a) => SELECT.get().rectSelection(...a);
export const ellipseSelection   = (...a) => SELECT.get().ellipseSelection(...a);
export const lassoSelection     = (...a) => SELECT.get().lassoSelection(...a);
export const magicWandSelection = (...a) => SELECT.get().magicWandSelection(...a);
export const combineSelection   = (...a) => SELECT.get().combineSelection(...a);
export const invertSelection    = (...a) => SELECT.get().invertSelection(...a);
export const featherSelection   = (...a) => SELECT.get().featherSelection(...a);
export const expandSelection    = (...a) => SELECT.get().expandSelection(...a);
export const contractSelection  = (...a) => SELECT.get().contractSelection(...a);
export const selectionToMaskGray = (...a) => SELECT.get().selectionToMaskGray(...a);
export const selectionToPath    = (...a) => SELECT.get().selectionToPath(...a);
export const selectionBounds    = (...a) => SELECT.get().selectionBounds(...a);
export const selectionArea      = (...a) => SELECT.get().selectionArea(...a);
export const isEmptySelection   = (...a) => SELECT.get().isEmptySelection(...a);
export const emptySelection     = (...a) => SELECT.get().emptySelection(...a);
export const createSelection    = (...a) => SELECT.get().createSelection(...a);
export const selectionValueAt   = (...a) => SELECT.get().selectionValueAt(...a);
export const smoothSelection    = (...a) => SELECT.get().smoothSelection(...a);
export const cloneSelection     = (...a) => SELECT.get().cloneSelection(...a);
export const trimSelection      = (...a) => SELECT.get().trimSelection(...a);

export const applyAdjustment    = (...a) => ADJUST.get().applyAdjustment(...a);


export let CREATABLE_FX = {};          
export let CREATABLE_FX_LABEL = {};
export let ADJ_KINDS_MENU = {};        
export let ADJ_ALL = {};               

export let booted = false;             
export function set_booted(v) { return (booted = v); }   
const afterBoot = fn => { if (booted) fn(); else queueMicrotask(() => { if (booted) fn(); else setTimeout(fn, 0); }); };
const lazyRefresh = () => afterBoot(() => {
  try { syncNewAdjMenu(); } catch {}
  try { renderProps(); } catch {}
  try { if (layerStyleDlg) layerStyleDlg.refresh(); } catch {}
  try { drawGizmo(); } catch {}
  try { syncToolOptions(); } catch {}
});

EDIT.onReady(m => {
  EDITM = m;
  CREATABLE_FX = m.listCreatableEffects();
  ADJ_KINDS_MENU = m.listAdjustmentKinds();
  CREATABLE_FX_LABEL = Object.fromEntries(Object.keys(CREATABLE_FX).map(k => [k, CREATABLE_FX[k].label]));
  lazyRefresh();
});
ADJUST.onReady(m => { ADJM = m; ADJ_ALL = m.listAdjustments(); lazyRefresh(); });
SELECT.onReady(m => { SELM = m; lazyRefresh(); });
QUADW.onReady(m => { QUADM = m; lazyRefresh(); });   
FILTER.onReady(m => { FLTM = m; lazyRefresh(); });   
RETOUCH.onReady(m => { RETOUCHM = m; lazyRefresh(); });
BRUSH.onReady(m => { BRUSHM = m; lazyRefresh(); });






export let layerStyleDlg = null;
export function set_layerStyleDlg(v) { return (layerStyleDlg = v); }   

let layerStyleLoader = null, layerStyleP = null;
export function set_layerStyleLoader(fn) { layerStyleLoader = fn; }

export function loadLayerStyleDlg(){
  if (layerStyleDlg) return Promise.resolve(layerStyleDlg);
  if (!layerStyleLoader) return Promise.resolve(null);
  return layerStyleP || (layerStyleP = layerStyleLoader().then(() => layerStyleDlg, e => { layerStyleP = null; $('#err').textContent = '图层样式对话框没能载入：' + (e && e.message || e); return null; }));
}
export function openLayerStyleDialog(idx, focus){
  if (!layerStyleDlg) {
    if (!doc || idx == null || idx < 0) return false;
    return loadLayerStyleDlg().then(d => (d ? openLayerStyleDialog(idx, focus) : false));
  }
  if (!doc || idx == null || idx < 0) return false;
  const l = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!l || l.groupType === 3 || layerDeletes.has(idx)) return false;   
  if (selLayer !== idx) { set_selLayer(idx); selLayers.clear(); renderLayerPanel(); renderProps(); }
  return layerStyleDlg.open(idx, focus);
}


export async function ensureLazy(api, what){
  if (api.peek()) return true;
  try { await api.load(); return true; }
  catch {
    try { $('#err').textContent = `${what}用不了：${api.statusText()} —— 再试一次，或刷新页面（其余功能不受影响）。`; } catch {}
    return false;
  }
}




export const kick = api => { if (!api.peek() && !api.loading && !api.error) api.load().catch(() => {}); };





export function runLazy(api, what, fn){
  if (api.peek()) return fn();
  return ensureLazy(api, what).then(okd => okd ? fn() : null);
}






export const api = createApiClient('api');
function engineUnavailable(){ throw new Error('渲染引擎未加载（服务未启动或未构建）：变形与换图不可用，图层/文字编辑不受影响'); }
export let engine = null, engineOK = false;
try { engine = await loadEngine(api); engineOK = true; }
catch (e) {
  document.body.insertAdjacentHTML('afterbegin',
    `<div id="engineWarn" style="padding:10px 16px;background:rgba(245,158,11,.15);border-bottom:1px solid rgba(245,158,11,.5);color:#ffd28a;font-size:12px">`
    + `渲染引擎加载失败：${(e && e.message) || e} —— 变形 / 换图暂不可用，图层 / 文字编辑不受影响。`
    + `<button onclick="this.parentNode.remove()" style="float:right;height:20px;padding:0 8px;margin-left:12px;font-size:11px">知道了</button></div>`);
  engine = new Proxy({}, { get: (t, k) =>
    k === 'FIT_MODES' ? [] :
    k === 'FIT_LABELS' ? {} :
    k === 'then' ? undefined :
    
    k === 'createBrowserGLBackend' ? (() => new Proxy({}, { get: () => () => {} })) :
    engineUnavailable });
}
export const { surfaceIsoCurves, surfacePoint, nearestSurfaceParam,
        splitMeshU, splitMeshV, unsplitMeshU, unsplitMeshV, spanEdges,
        patchCountX, patchCountY, meshTopology, moveControlPoint, dragSurfacePoint,
        renderWarp, FIT_MODES, FIT_LABELS, bakeSourceRaster, pngFilename,
        cloneDeform, applyPuppetPins, deformEquals, deformFromJSON, deformToJSON,
        createPerspectiveDeform, resizePerspectiveGrid, createPuppetDeform,
        addPuppetPin, removePuppetPin, nearestPuppetVertex,
        perspectiveQuadAt, addPerspectiveQuad, removePerspectiveQuad, deformStackBounds,
        createBrowserGLBackend, blitToCanvas } = engine;







export function applySoEdit(target, ed){
  if (!target || !ed) return target;
  const stack = ed.deforms && ed.deforms.length ? ed.deforms.map(e => cloneDeform(e.deform))
              : (ed.deform ? [cloneDeform(ed.deform)] : null);       
  if (stack) {
    target.deforms = stack;
    target.deform = stack[0];
    target.points = null; target.xn = null; target.yn = null; target.sliceX = []; target.sliceY = [];
  } else {
    target.deform = null; target.deforms = null;
    target.warpOptions=ed.warpOptions||null;target.points = ed.points; target.xn = ed.xn; target.yn = ed.yn; target.sliceX = ed.sliceX; target.sliceY = ed.sliceY;
  }
  return target;
}



export function freshLayerInfo(so, base = false){
  const src = so.info && (base ? so.info.layerInfoBase : so.info.layerInfo);
  if (!src) throw new Error(`智能对象「${so.layerName}」尚未解析${so.info && so.info.error ? '：' + so.info.error : ''}`);
  const li = JSON.parse(JSON.stringify({ ...src, deform: null, deforms: null }));
  li.deforms = Array.isArray(src.deforms) && src.deforms.length ? src.deforms.map(deformFromJSON)
             : (src.deform ? [deformFromJSON(src.deform)] : null);
  li.deform = li.deforms ? li.deforms[0] : null;
  if (!base) {
    const pre = so.info.layerInfoBase || (src.points ? src : null);
    if (pre) li.baseWarp = JSON.parse(JSON.stringify({ ...pre, deform: null, deforms: null }));
  }
  return li;
}
export const needsQuiltRewrite = (so, pts) => !so.info || !so.info.summary.meshPointCount || pts.length !== so.info.summary.meshPointCount;
export async function resolveSmartObjects(buf, list){
  if (!list.length) return;
  const items = await api.resolveAll(list.map(so => smartObjectFragment(buf, so)));
  list.forEach((so, i) => { so.info = items[i] || { error: '无返回' }; });
}

export const $ = s => document.querySelector(s);

export const EDITOR_VERSION = typeof __PSD_EDITOR_VERSION__ === 'string' ? __PSD_EDITOR_VERSION__ : 'dev';
console.info('[PSD Editor] editor ' + EDITOR_VERSION);





export const icon = uiIcon;


document.querySelectorAll('[data-icon]').forEach(el => el.prepend(icon(el.dataset.icon, +(el.dataset.iconSize || 14))));
const DOCK_ICONS = { layer:'layers-3', character:'braces', mask:'add-mask', style:'fx', path:'spline', smart:'image-plus', adjust:'sliders-horizontal' };
document.querySelectorAll('#propTabs [data-prop-tab]').forEach(b => {
  const key = b.dataset.propTab, label = b.title || key;
  b.textContent = ''; b.setAttribute('aria-label', label); b.append(icon(DOCK_ICONS[key] || 'grid-2x2', 16));
});






export const BLEND = { norm:'source-over', dark:'darken', 'mul ':'multiply', idiv:'color-burn',
  lite:'lighten', scrn:'screen', 'div ':'color-dodge', over:'overlay',
  hLit:'hard-light', diff:'difference', smud:'exclusion',
  'hue ':'hue', 'sat ':'saturation', colr:'color', 'lum ':'luminosity' };
export const BLEND_LABELS = { norm:'正常', diss:'溶解', dark:'变暗', 'mul ':'正片叠底', idiv:'颜色加深', lbrn:'线性加深', dkCl:'深色',
  lite:'变亮', scrn:'滤色', 'div ':'颜色减淡', lddg:'线性减淡（添加）', lgCl:'浅色',
  over:'叠加', sLit:'柔光', hLit:'强光', vLit:'亮光', lLit:'线性光', pLit:'点光', hMix:'实色混合',
  diff:'差值', smud:'排除', fsub:'减去', fdiv:'划分',
  'hue ':'色相', 'sat ':'饱和度', colr:'颜色', 'lum ':'明度', pass:'穿透' };

export const BLEND_KEYS = ['norm', 'diss', 'dark', 'mul ', 'idiv', 'lbrn', 'dkCl', 'lite', 'scrn', 'div ', 'lddg', 'lgCl',
  'over', 'sLit', 'hLit', 'vLit', 'lLit', 'pLit', 'hMix', 'diff', 'smud', 'fsub', 'fdiv', 'hue ', 'sat ', 'colr', 'lum '];
export const CORE_BLEND = new Set(SUPPORTED_BLEND_MODES);



export const PREVIEW_ADJUSTMENTS = new Set(['expA', 'nvrt', 'post', 'thrs', 'brit', 'levl', 'curv', 'hue2', 'mixr', 'blnc', 'blwh', 'vibA', 'phfl', 'selc', 'grdm', 'CgEd', 'clrL']);   


export const ADJ_KEY_ICON = {
  brit: 'brightnessContrast', CgEd: 'brightnessContrast', levl: 'levels', curv: 'curves',
  expA: 'exposure', vibA: 'vibrance', 'hue ': 'hueSaturation', hue2: 'hueSaturation',
  blnc: 'colorBalance', blwh: 'blackWhite', phfl: 'photoFilter', mixr: 'channelMixer',
  clrL: 'colorLookup', nvrt: 'invert', post: 'posterize', thrs: 'threshold',
  grdm: 'gradientMap', selc: 'selectiveColor',
};



export function previewCompatibilityWarnings(d){
  const out = (d.warnings || []).map(w => w.message || String(w));
  d.layers.forEach((l, i) => {
    if (l.hidden) return;
    const name = `图层 ${i}「${l.name || '(未命名)'}」`;
    if (l.adjustment && !adjustmentRenderParams(l.adjustment)) out.push(`${name} 含${l.adjustment.label}调整层，预览不会应用该调整。`);
    if (l.fill && !hasRenderableFill(l.fill, l.vectorMask, d.patterns)) out.push(`${name} 是${l.fill.label}，预览可能无法重现参数化填充。`);
    if (l.vectorStroke && !vectorStrokeRenderParams(l.vectorStroke, l.vectorMask)) out.push(`${name} 含当前未模拟的矢量描边（渐变/图案内容或非正常混合等），预览不会伪造它。`);
    if (l.vectorMask && !hasRenderableVectorMask(l.vectorMask)) out.push(`${name} 含无法解析的矢量蒙版路径，预览不能安全裁剪图层像素。`);
    if (l.effects && (!hasRenderableEffects(l.effects, d.patterns) || hasUnrenderedEffects(l.effects, d.patterns))) out.push(`${name} 含尚未重绘的图层样式。`);
    if (l.blendMode === 'diss') out.push(`${name} 使用「溶解」模式，预览暂按正常模式显示。`);
    else if (!BLEND[l.blendMode] && !CORE_BLEND.has(l.blendMode)) out.push(`${name} 使用未实现的混合模式「${l.blendMode}」，预览按正常模式显示。`);
  });
  return out;
}
export function showCompatibilityWarnings(warnings){
  const shown = warnings.slice(0, 4);
  $('#notice').textContent = shown.length
    ? `兼容性提醒（PSD 原结构会保留）：\n· ${shown.join('\n· ')}${warnings.length > shown.length ? `\n· 另有 ${warnings.length - shown.length} 项` : ''}`
    : '';
}
