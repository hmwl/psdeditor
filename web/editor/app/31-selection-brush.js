




import './30-render.js';   
import { defaultDynamics } from '../../../core/brush-engine.js';
import { layoutRichText } from '../../../core/psd-text.js';
import { averageSample } from '../../../core/remaining-brush.js';
import { newCountGroup } from '../../../core/tool-metadata.js';
import { confirmDialog } from '../dialog.js';
import { DOCS } from '../documents.js';
import { panels } from '../panels.js';
import { shell } from '../shell.js';
import { tools } from '../tools.js';
import { $, QUADW, RETOUCH, SELECT, SELM, ensureLazy, icon, kick, runLazy } from './01-boot.js';
import {
  brushHistory, countVisible, curStroke, doc, docH, docW, guidesVisible, layerDeletes, li, maskEdit,
  notesVisible, pixelPaint, selection, set_maskEdit, set_notesVisible, textOverlay, viewFlip, viewPar,
  viewParCorrect,
} from './02-doc-state.js';
import {
  docHistory, docSnapshot, histLog, histPush, historyJump, pushDocHistory, syncHistoryPanel, updateUndoButtons,
} from './03-history.js';
import {
  RULER_UNITS, applyPan, fitStage, padL, padT, rulerUnit, setTool, set_panX, set_panY, set_zoom,
  set_zoomFitMode, viewH, viewW, zoom,
} from './04-view-chrome.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { centerDocPoint, saveZoomOpts, tfFrame, updatePanCursor, zoomOpts } from './06-view-zoom-move.js';
import { refreshMoveHover } from './07-nav-histogram.js';
import { docResolution, transformableLayers } from './08-doc-size.js';
import { syncTextBar, textToolOpts } from './09-text-tool.js';
import { beginCrop, commitCrop, cropState } from './10-crop.js';
import { bucketOpts, gradDrag, gradOpts, set_gradDrag } from './11-paint-common.js';
import {
  closeGradPicker, set_liveGradEdit, set_liveGradSel, syncBucketBar, syncGradBar,
} from './15-gradient-bucket-eyedropper.js';
import {
  SHAPE_KINDS, cancelPen, commitPen, penState, set_shapeState, shapeOpts, shapeState, syncShapeBar,
} from './17-shape-pen.js';
import { PEN_TOOLS, freePen, magPen, set_freePen, set_magPen } from './18-pen-extra.js';
import { commitFreeTransform, tfState, tfWriteQuad } from './19-free-transform.js';
import { bytesEqual } from './21-load-document.js';
import { renderLayerPanel, selLayer, selLayers } from './23-layers-panel.js';
import { cloneOpValue } from './24-layer-ops-queue.js';
import {
  ALIGN_BTNS, ALIGN_LABEL, DISTRIBUTE_ICONS, alignLayers, distributeLayers, distributeSpacing,
  ensureLayerTransform, mkEl,
} from './28-layer-props-transform.js';
import { renderPreviewOnly, renderStaticLayers } from './30-render.js';
import {
  combineInto, dispPx, endSelBrush, modKeys, sampleRGBA, sbState, syncGizmoCursor, syncToolOptions,
} from './32-cursors-select-options.js';
import {
  cancelMagLasso, cancelPolyLasso, magLasso, objFinderReset, osState, polyLasso, qsState, set_osState,
  set_qsEdgeCache, set_qsState,
} from './33-lasso-quick-select.js';
import { cancelPCrop, pcropState, set_sliceDrag, sliceDrag } from './34-perspective-crop-slice.js';
import { abState, set_abState } from './35-artboard.js';
import { AB_BAR_ICONS, frameState, set_frameState } from './36-clipboard-frame.js';
import { boOpts, syncBrushOpBar } from './37-local-pixel-tools.js';
import { endStroke } from './38-brush-engine.js';
import { paintToolSwitch } from './39-brush-options.js';
import { PATH_EDIT_TOOLS, pathSelAnchors, pathSelSubs, pathSubDrag, set_pathSubDrag } from './45-path-tools.js';
import { drawGizmo, gizmo, toDoc } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import { syncInfoPanel } from './48-info-export.js';
import {
  JUSTIFY_CODE, applyTextAntiAlias, cropCanvasAlpha, drawRichText, fontPop, resolveFont, runCanvasFont,
  textLayoutApi, textToolFontPs,
} from './49-fonts-text-model.js';
import { rotateCanvas } from './51-image-select-menu.js';
import { RETOUCH_TOOLS, retouchState, rtPending, set_retouchState } from './53-retouch-clone-pattern.js';
import { rtPendingCancel } from './54-gestures-hints.js';
import { LB } from './57-layer-style-text-path.js';








































export const TEXT_TOOLS = new Set(['text', 'textVertical', 'textMask', 'textMaskVertical']);
export const AUX_TOOLS = new Set(['colorSampler', 'ruler', 'note', 'count', 'rotateView']);
export let toolData = null, toolDataAPI = null, auxDrag = null, measureLine = null, countGroup = 0;
export function set_toolData(v) { return (toolData = v); }   
export function set_toolDataAPI(v) { return (toolDataAPI = v); }   
export function set_auxDrag(v) { return (auxDrag = v); }   
export function set_measureLine(v) { return (measureLine = v); }   
export function set_countGroup(v) { return (countGroup = v); }   
export let viewAngle = 0, historySource = new Map(), maskTextSession = null;
export function set_viewAngle(v) { return (viewAngle = v); }   
export function set_historySource(v) { return (historySource = v); }   
export const mixerOpts = { wet: .5, load: .5, mix: .5, autoLoad: true, autoClean: true, allLayers: false, solidOnly: false };   
export let mixerReservoir = null, mixerCarry = null, mixerAmount = 0;
export function set_mixerReservoir(v) { return (mixerReservoir = v); }   
export function set_mixerCarry(v) { return (mixerCarry = v); }   
export function set_mixerAmount(v) { return (mixerAmount = v); }   



export const MIX_G = 24;
export let mixerTile = null, mixerLoaded = null;          
export function set_mixerTile(v) { return (mixerTile = v); }   
export const tileOfColor = c => Array.from({ length: MIX_G * MIX_G }, () => c.slice());
export const tileMean = t => { const m = [0, 0, 0, 0]; let aw = 0; for (const c of t) { for (let k = 0; k < 3; k++) m[k] += c[k] * c[3]; m[3] += c[3]; aw += c[3]; } return aw ? [m[0] / aw, m[1] / aw, m[2] / aw, m[3] / t.length].map(Math.round) : [0, 0, 0, 0]; };
export let historySourceInfo = null;
export function set_historySourceInfo(v) { return (historySourceInfo = v); }   
export const samplerOpts = { size: 1, allLayers: true };
export const noteOpts = { author: '', color: '#ffdc00' };

const countDefaults = newCountGroup();
const freshCountGroup = name => ({ ...newCountGroup(name), ...Object.fromEntries(['Rd  ', 'Grn ', 'Bl  ', 'Rds ', 'fontSize'].map(k => [k, countDefaults[k]])) });
try { noteOpts.author = localStorage.getItem('psd_editor.noteAuthor') || ''; } catch {}
export const artHistoryOpts = { style: 'tightShort', area: 50, tolerance: 0 };   
export const copyToolData = () => toolData ? cloneOpValue(toolData) : null;
export const countGroups = () => !doc || toolData?.countReadOnly ? [] : (toolData?.counts?.descriptor?.countGroupList || []);
export function toolDataChanged(kind, label, change) {
  if (!doc || !toolData) return false;
  pushDocHistory(label); change(); toolData.dirty[kind] = true;
  syncAuxBar(); drawGizmo(); updateUndoButtons();
}
export function stageLocal(clientX, clientY) {
  const r = $('#stage').getBoundingClientRect(), a = viewAngle * Math.PI / 180;
  const dx = clientX - r.left - r.width / 2, dy = clientY - r.top - r.height / 2;
  const lx = Math.cos(a) * dx + Math.sin(a) * dy;
  const parK = viewParCorrect && viewPar !== 1 ? viewPar : 1;
  return { x: (viewFlip ? -lx : lx) / parK + viewW() * zoom / 2,
    y: -Math.sin(a) * dx + Math.cos(a) * dy + viewH() * zoom / 2 };
}

export function setViewAngle(value) {
  if (!Number.isFinite(+value)) return;
  const vp = $('#viewport'), v = vp && vp.getBoundingClientRect();
  const keep = docW && v && v.width > 0 ? toDoc({ clientX: v.left + vp.clientWidth / 2, clientY: v.top + vp.clientHeight / 2 }) : null;
  viewAngle = ((+value + 180) % 360 + 360) % 360 - 180;
  applyPan();
  if (keep) centerDocPoint(keep.x, keep.y);
  syncAuxBar();
}
export function historySourceKey(i) { return doc.layers[i]; }


export function captureHistorySource(quiet = false, reuse = null) {
  if (!doc) return false;
  const next = new Map();
  const pool = reuse && reuse.size ? [...reuse.values()] : [];
  doc.layers.forEach((layer, i) => {
    const pp = pixelPaint[i];
    if (!(layer.rgba && layer.width && layer.height && !layerDeletes.has(i))) return;
    const src = pp ? pp.rgba : layer.rgba, w = pp?.w || layer.width, h = pp?.h || layer.height;
    const left = pp?.left ?? layer.bounds.left, top = pp?.top ?? layer.bounds.top;
    

    const k = pp ? pool.findIndex(e => e && e.w === w && e.h === h && e.left === left && e.top === top && bytesEqual(e.data, src)) : -1;
    const data = !pp ? src : k >= 0 ? pool.splice(k, 1)[0].data : Uint8ClampedArray.from(src);
    next.set(historySourceKey(i), { data, w, h, left, top });
  });
  historySource = next;
  historySourceInfo = { item: histLog.items[histLog.cursor], width: docW, height: docH };
  if (!quiet) shell.status('已将当前状态设为历史画笔源');
  syncAuxBar(); syncHistoryPanel(); return true;
}
export function selectHistorySource(index) {
  if (curStroke || textOverlay || auxDrag || li || !Number.isInteger(index) || !histLog.items[index]) return false;
  const cursor = histLog.cursor, oldSource = historySource, oldInfo = historySourceInfo;
  let next = null, info = null;
  try {
    if (historyJump(index) !== index) throw new Error('这条历史的像素已不在撤销缓存中');
    captureHistorySource(true); next = historySource; info = historySourceInfo;
  } catch (e) { shell.status(e.message); }
  finally { historyJump(cursor); historySource = next || oldSource; historySourceInfo = info || oldInfo; syncHistoryPanel(); syncAuxBar(); }
  return !!next;
}
export function historySourceFor(i) {
  const pp = pixelPaint[i], layer = doc?.layers[i];
  if (historySourceInfo) return historySource.get(historySourceKey(i)) || historySource.get('*') || null;   
  return pp ? { data: pp.orig, w: pp.w, h: pp.h, left: pp.left, top: pp.top }
    : layer?.rgba ? { data: layer.rgba, w: layer.width, h: layer.height, left: layer.bounds.left, top: layer.bounds.top } : null;
}
export function loadMixerBrush(pt) {
  let tile;
  if (pt) {
    const src = { data: sampleRGBA(mixerOpts.allLayers), w: docW, h: docH }, r = Math.max(1, brush.size / 2);
    if (mixerOpts.solidOnly) { const c = averageSample(src, pt.x, pt.y, Math.max(3, Math.min(15, Math.round(r / 4)))); if (!c) return false; tile = tileOfColor(c); }
    else {
      
      const cell = Math.max(1, Math.min(5, Math.round(2 * r / MIX_G)));
      tile = [];
      for (let gy = 0; gy < MIX_G; gy++) for (let gx = 0; gx < MIX_G; gx++) {
        const u = (gx + .5) / MIX_G * 2 - 1, v = (gy + .5) / MIX_G * 2 - 1;
        tile.push(averageSample(src, pt.x + u * r, pt.y + v * r, cell) || [0, 0, 0, 0]);
      }
    }
    mixerLoaded = { tile, fg: null };
  } else {
    
    if (mixerLoaded && !mixerLoaded.fg) tile = mixerLoaded.tile;
    else { tile = tileOfColor([...fgRGB, 255]); mixerLoaded = { tile, fg: fgRGB.slice() }; }
  }
  mixerTile = tile.map(c => c.slice());
  mixerReservoir = tileMean(mixerTile); mixerAmount = mixerOpts.load > 0 ? 1 : 0;
  syncAuxBar(); return true;
}
export function cleanMixerBrush() { mixerAmount = 0; mixerCarry = null; mixerTile = null; mixerLoaded = null; syncAuxBar(); }
export function mapAuxGeometry(map) {
  if (toolData && toolDataAPI) {
    const r = toolDataAPI.mapToolMetadata(toolData, map); toolData = r.state;
    if (r.skipped.length) $('#notice').textContent = '部分未识别标记无法同步坐标，已保留原始数据：' + r.skipped.join('、');
  }
  if (measureLine) { measureLine = cloneOpValue(measureLine); for (const key of ['a','b','c']) if (measureLine[key]) {
    const [x,y] = map([measureLine[key].x,measureLine[key].y]); measureLine[key] = {x,y};
  } }
}
export function editCountGroup(patch) {
  const g=countGroups()[countGroup]; if (!g) return false;
  const changed=Object.entries(patch).some(([k,v])=>g[k]!==v); if (!changed) return false;
  toolDataChanged('counts','计数组设置',()=>Object.assign(g,patch)); return true;
}
export function rulerMetrics() {
  if (!measureLine) return null;
  const {a,b,c}=measureLine, dx=b.x-a.x, dy=b.y-a.y;
  const m={ x:a.x, y:a.y, dx, dy, length:Math.hypot(dx,dy), angle:Math.atan2(dy,dx)*180/Math.PI };
  m.displayAngle = -m.angle;                    
  if (c) { const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y]; m.length2=Math.hypot(...v);
    m.angle=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*m.length2 || 1))))*180/Math.PI;
    m.displayAngle = m.angle; }                 
  return m;
}
export function straightenFromRuler() {
  if (!measureLine || Math.hypot(measureLine.b.x-measureLine.a.x,measureLine.b.y-measureLine.a.y)<1e-6) return false;
  let angle=Math.atan2(measureLine.b.y-measureLine.a.y,measureLine.b.x-measureLine.a.x)*180/Math.PI;
  angle=((angle+45)%90+90)%90-45;
  return runLazy(QUADW, '拉直', () => rotateCanvas(-angle,'按标尺拉直图像'));
}
export function syncAuxBar() {
  syncNotePanel();
  
  const historyTool = ['historyBrush', 'historyArtBrush'].includes(docTool);
  let historySource = $('#brHistorySource');
  if (!historySource && $('#brPresetPop')) {
    historySource = document.createElement('button'); historySource.id = 'brHistorySource';
    historySource.textContent = '设当前状态为历史源';
    historySource.onclick = () => { captureHistorySource(); syncAuxBar(); };
    $('#brPresetPop').append(historySource);
  }
  if (historySource) {
    historySource.hidden = !historyTool;
    historySource.disabled = !doc;
    historySource.title = '历史源：' + (historySourceInfo?.item?.name || historySourceInfo?.item?.label || '开始绘制前');
  }
  let bar = $('#grpAuxTools');
  if (!bar) { bar = document.createElement('div'); bar.id = 'grpAuxTools'; bar.className = 'group'; $('#grpBrush').parentNode.insertBefore(bar, $('#grpBrush')); }
  const kind = docTool;
  bar.hidden = !!li || !!tfState || !!cropState || !AUX_TOOLS.has(kind);
  if (bar.hidden) return;
  bar.replaceChildren();
  const text = value => { const el = document.createElement('span'); el.textContent = value; bar.append(el); return el; };
  const button = (label, fn) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.onclick = fn; bar.append(el); return el; };
  const number = (label, value, min, max, fn) => {
    const lab = document.createElement('label'); lab.textContent = label;
    const el = document.createElement('input'); el.type = 'number'; el.min = min; el.max = max; el.value = value; el.style.width = '64px';
    el.onchange = () => { const n = +el.value; if (Number.isFinite(n)) fn(Math.max(min, Math.min(max, n))); };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); el.onchange(); } }; lab.append(el); bar.append(lab);
  };
  const select = (label, value, choices, fn) => {
    const lab=document.createElement('label'); lab.textContent=label;
    const el=document.createElement('select'); el.setAttribute('aria-label',label);
    choices.forEach(([v,t])=>el.append(Object.assign(document.createElement('option'),{value:v,textContent:t})));
    el.value=value; el.onchange=()=>fn(el.value); lab.append(el); bar.append(lab); return el;
  };
  const check = (label,value,fn) => {
    const lab=document.createElement('label'),el=document.createElement('input'); el.type='checkbox';el.checked=value;
    el.onchange=()=>fn(el.checked);lab.append(el,document.createTextNode(label));bar.append(lab);
  };
  const field = (label,value,fn,type='text') => {
    const lab=document.createElement('label');lab.textContent=label;
    const el=document.createElement('input');el.type=type;el.value=value;el.setAttribute('aria-label',label);
    el.style.width=type==='color'?'30px':'90px';el.onchange=()=>fn(el.value);lab.append(el);bar.append(lab);return el;
  };
  if (kind === 'rotateView') {
    
    number('旋转角度：', Math.round(viewAngle * 10) / 10, -180, 180, setViewAngle);
    bar.lastChild.append('°');
    const NS = 'http://www.w3.org/2000/svg';
    const dial = document.createElementNS(NS, 'svg'); dial.setAttribute('width', '22'); dial.setAttribute('height', '22'); dial.setAttribute('viewBox', '0 0 22 22');
    dial.style.cssText = 'cursor:default;flex:none;margin:0 2px';
    const a = viewAngle * Math.PI / 180;
    dial.innerHTML = `<circle cx="11" cy="11" r="9.5" fill="#1e1e1e" stroke="#8a8a8a"/><line x1="11" y1="11" x2="${11 + Math.sin(a) * 8}" y2="${11 - Math.cos(a) * 8}" stroke="#e3e3e3" stroke-width="1.5"/><circle cx="11" cy="11" r="1.5" fill="#e3e3e3"/>`;
    dial.setAttribute('aria-label', '设置旋转角度（拖动；Shift = 15° 一档）');
    dial.onpointerdown = e => {
      e.preventDefault();
      const r = dial.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const at = ev => { let deg = Math.atan2(ev.clientX - cx, -(ev.clientY - cy)) * 180 / Math.PI; if (ev.shiftKey) deg = Math.round(deg / 15) * 15; setViewAngle(Math.round(deg)); };
      at(e);
      const mv = ev => at(ev), end = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', end); };
      addEventListener('pointermove', mv); addEventListener('pointerup', end);
    };
    const tip = document.createElementNS(NS, 'title'); tip.textContent = '设置旋转角度（拖动；Shift = 15° 一档）'; dial.append(tip);
    bar.append(dial);
    button('复位视图', () => setViewAngle(0)).title = '把视图转回 0°（Esc 同）';
    const lab = document.createElement('label');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = DOCS.opts.rotateAll; cb.onchange = () => { DOCS.opts.rotateAll = cb.checked; };
    lab.title = '旋转所有窗口：旋转视图时，其它打开的文档窗口一起转同样的角度';
    lab.append(cb, document.createTextNode(' 旋转所有窗口')); bar.append(lab);
    text('拖动画布旋转 · Shift 吸附 15° · Esc 复位').style.opacity = '.7';
    return;
  }
  if (kind === 'mixerBrush') {
    for (const [key, label] of [['wet', '潮湿 '], ['load', '载入 '], ['mix', '混合 ']]) number(label, mixerOpts[key] * 100, 0, 100, v => { mixerOpts[key] = v / 100; });
    button('载入画笔', () => loadMixerBrush()); button('清洁画笔', cleanMixerBrush);
    check('每笔载入',mixerOpts.autoLoad,v=>{mixerOpts.autoLoad=v;});
    check('每笔清洁',mixerOpts.autoClean,v=>{mixerOpts.autoClean=v;});
    check('所有图层',mixerOpts.allLayers,v=>{mixerOpts.allLayers=v;});
    text('Alt 取样 · 单色载色（近似）'); return;
  }
  if (kind.startsWith('history')) {
    button('设当前状态为源',()=>captureHistorySource());
    text('源：'+(historySourceInfo?.item?.name || historySourceInfo?.item?.label || '开始绘制前'));
    return;
  }
  if (doc && !toolData) { text('工具数据未载入'); return; }
  if (kind === 'ruler') {
    


    const m = rulerMetrics();
    const per = RULER_UNITS[rulerUnit]?.per() || 1, unit = RULER_UNITS[rulerUnit]?.short || 'px';
    const msc = LB && LB.measure && LB.measure.useScale() ? LB.measure.scale() : null;   
    const f = v => msc ? (Math.round(v * msc.len / msc.px * 100) / 100) + ' ' + msc.unit : (v / per).toFixed(unit === 'px' ? 0 : 2);
    const cell = (lab, v) => { const el = text(`${lab}: ${v}`); el.style.minWidth = '64px'; el.className = 'seg'; return el; };
    if (m) {
      cell('X', f(m.x)); cell('Y', f(m.y)); cell('W', f(m.dx)); cell('H', f(-m.dy));
      cell('A', `${m.displayAngle.toFixed(1)}°`); cell('L1', f(m.length)); cell('L2', m.length2 != null ? f(m.length2) : '');
    } else for (const k of ['X', 'Y', 'W', 'H', 'A', 'L1', 'L2']) cell(k, '');
    const scale = document.createElement('label');
    const M = LB && LB.measure, sc = M ? M.scale() : null;
    scale.title = sc ? `使用测量比例：按「图像 › 分析 › 设置测量比例」换算（当前 ${sc.px} 像素 = ${sc.len} ${sc.unit}）` : '使用测量比例';
    const scb = document.createElement('input'); scb.type = 'checkbox'; scb.checked = !!(M && M.useScale()); scb.disabled = !M;
    scb.onchange = () => { M.setUseScale(scb.checked); syncAuxBar(); };
    scale.append(scb, document.createTextNode(' 使用测量比例')); bar.append(scale);
    const sb = button('拉直图层', ev => straightenLayerFromRuler(!!(ev && ev.altKey)));
    sb.disabled = !m || m.length < 1e-6;
    sb.title = '拉直图层：把当前图层转到标尺线水平（或竖直，取近的那边）；当前是背景图层 / 没选图层时转整幅画布';
    button('清除', () => { measureLine = null; drawGizmo(); syncAuxBar(); syncInfoPanel(); }).title = '清除标尺线';
    return;
  }
  const key = kind === 'colorSampler' ? 'samplers' : kind === 'note' ? 'annotations' : 'counts';
  const readOnly = doc && toolData?.[kind === 'colorSampler' ? 'samplerReadOnly' : kind === 'note' ? 'noteReadOnly' : 'countReadOnly'];
  if (readOnly) { text('原有数据无法可靠解析，保留原样，禁止覆盖'); return; }
  if (kind === 'colorSampler') {
    
    const list = doc ? toolData.samplers.samplers : [];
    select('取样大小：', String(samplerOpts.size), [1, 3, 5, 11, 31, 51, 101].map(n => [String(n), n === 1 ? '取样点' : `${n} × ${n} 平均`]), v => { samplerOpts.size = +v; syncAuxBar(); syncInfoPanel(); });
    select('样本：', samplerOpts.allLayers ? 'all' : 'current', [['all', '所有图层'], ['current', '当前图层']], v => { samplerOpts.allLayers = v === 'all'; syncAuxBar(); syncInfoPanel(); });
    button('清除全部', () => { if (list.length) toolDataChanged(key, '清除颜色取样点', () => { list.length = 0; }); syncInfoPanel(); }).disabled = !list.length;
    const px = samplerPixels();
    const info = text(list.length ? list.map((p, i) => { const c = px && averageSample({ data: px, w: docW, h: docH }, p.horizontal, p.vertical, samplerOpts.size); return `#${i + 1} ${c ? c.slice(0, 3).join(',') : '—'}`; }).join('  ')
      : '单击放取样点（最多 10 个）· 拖动移动 · Alt 单击 / 拖出画布删除');
    info.style.opacity = '.75';
    if (list.length) { const b = button('信息面板', () => panels.show('info')); b.title = '在「信息」面板里查看每个取样点的读数'; }
  } else if (kind === 'count') {
    
    const groups = countGroups(), group = groups[Math.min(countGroup, Math.max(0, groups.length - 1))];
    countGroup = Math.min(countGroup, Math.max(0, groups.length - 1));
    text(`计数：${group ? group.countObjectList.length : 0}`).style.minWidth = '56px';
    const sel = document.createElement('select'); sel.title = '计数组';
    groups.forEach((g, i) => sel.append(Object.assign(document.createElement('option'), { value: i, textContent: g['Nm  '] })));
    if (!groups.length) sel.append(Object.assign(document.createElement('option'), { value: 0, textContent: '计数组 1' }));
    sel.value = countGroup;
    sel.onchange = () => { countGroup = +sel.value; syncAuxBar(); drawGizmo(); }; bar.append(sel);
    const vis = button(group && group.Vsbl === false ? '◌' : '👁', () => group && editCountGroup({ Vsbl: group.Vsbl === false }));
    vis.title = '切换计数组的可见性'; vis.disabled = !group;
    const add = button('新建', () => toolDataChanged(key, '新建计数组', () => { groups.push(freshCountGroup(`计数组 ${groups.length + 1}`)); countGroup = groups.length - 1; }));
    add.title = '创建新的计数组'; add.disabled = !doc;
    const del = button('删除', () => toolDataChanged(key, '删除计数组', () => { groups.splice(countGroup, 1); countGroup = Math.max(0, countGroup - 1); }));
    del.title = '删除当前计数组'; del.disabled = !group;
    const clr = button('清除', () => { if (groups[countGroup]?.countObjectList.length) toolDataChanged(key, '清除计数', () => { groups[countGroup].countObjectList = []; }); });
    clr.title = '清除当前计数组里的所有计数'; clr.disabled = !group || !group.countObjectList.length;
    if (group) {
      const nm = field('组名', group['Nm  '], v => { if (v.trim()) editCountGroup({ 'Nm  ': v.trim() }); }); nm.style.width = '80px';
    }
    const look = group || countDefaults;
    const updateLook = patch => { Object.assign(countDefaults, patch); if (group) editCountGroup(patch); else syncAuxBar(); };
    field('计数组颜色', hexOf([look['Rd  '], look['Grn '], look['Bl  ']].map(v => Math.round(v || 0))), v => updateLook({ 'Rd  ': parseInt(v.slice(1, 3), 16), 'Grn ': parseInt(v.slice(3, 5), 16), 'Bl  ': parseInt(v.slice(5, 7), 16) }), 'color');
    number('标记大小：', look['Rds '] || 3, 1, 10, v => updateLook({ 'Rds ': Math.round(v) }));
    number('标签大小：', look.fontSize || 13, 8, 72, v => updateLook({ fontSize: Math.round(v) }));
    text('单击计数 · 拖动移动 · Alt 单击删除 · Shift 拖动水平 / 垂直').style.opacity = '.7';
  } else {
    
    field('作者：', noteOpts.author, v => { noteOpts.author = v; try { localStorage.setItem('psd_editor.noteAuthor', v); } catch {} });
    field('颜色：', noteOpts.color, v => { noteOpts.color = v; }, 'color');
    const list = doc ? toolData.annotations.annotations : [];
    button('清除全部', async () => {
      if (!list.length) return;
      if (!await confirmDialog(`删除全部 ${list.length} 条注释？`, { title: '清除全部注释', danger: true })) return;
      toolDataChanged('annotations', '清除全部注释', () => { list.length = 0; });
    }).disabled = !list.length;
    const pb = button('注释面板', () => panels.toggle('notes')); pb.title = '显示或隐藏注释面板';
    text('单击添加注释 · 双击 / 单击已有注释编辑 · 拖动移动 · Alt 单击删除').style.opacity = '.7';
  }
}

export let samplerPxCache = { key: '', px: null };
export function set_samplerPxCache(v) { return (samplerPxCache = v); }   
export function samplerPixels(){
  if (!doc || !docW) return null;
  const key = `${docW}x${docH}|${histLog.items.length}|${histLog.cursor}|${samplerOpts.allLayers ? 1 : 0}|${selLayer}|${brushHistory.undo.length}`;
  if (samplerPxCache.key === key && samplerPxCache.px) return samplerPxCache.px;
  let px = null; try { px = sampleRGBA(samplerOpts.allLayers); } catch {}
  samplerPxCache = { key, px };
  return px;
}

export function addColorSampler(pt){
  if (!toolData || toolData.samplerReadOnly) return false;
  if (pt.x < 0 || pt.y < 0 || pt.x >= docW || pt.y >= docH) return false;
  const list = toolData.samplers.samplers;
  if (list.length >= 10) { shell.status('最多放置 10 个颜色取样点'); return false; }
  toolDataChanged('samplers', '颜色取样点', () => list.push({ samplerVersion: 1, horizontal: Math.round(pt.x * 10) / 10, vertical: Math.round(pt.y * 10) / 10, colorSpace: 0, depth: 8 }));
  if (!panels.isVisible('info')) { try { panels.show('info'); } catch {} }   
  syncInfoPanel();
  return true;
}

function straightenLayerFromRuler(){
  if (!measureLine || !doc) return false;
  let angle = Math.atan2(measureLine.b.y - measureLine.a.y, measureLine.b.x - measureLine.a.x) * 180 / Math.PI;
  angle = ((angle + 45) % 90 + 90) % 90 - 45;
  if (Math.abs(angle) < 1e-6) { shell.status('标尺线已经是水平 / 竖直的'); return false; }
  const idx = selLayer;
  if (idx < 0 || isBackgroundLayer(idx) || !transformableLayers().includes(idx)) return straightenFromRuler();
  return runLazy(QUADW, '拉直图层', () => {
    pushDocHistory('拉直图层');
    const t = ensureLayerTransform(idx), c = tfFrame(t).corners;
    const cx = c.reduce((s, p) => s + p[0], 0) / 4, cy = c.reduce((s, p) => s + p[1], 0) / 4;
    const a = -angle * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    tfWriteQuad(idx, c.map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]));
    measureLine = null;                               
    renderStaticLayers(); renderPreviewOnly(); renderLayerPanel(); drawGizmo(); syncAuxBar(); updateUndoButtons();
    shell.status(`拉直图层：转了 ${(-angle).toFixed(2)}°`);
    return true;
  });
}
export function auxDown(ev, pt) {
  if (docTool === 'rotateView') {
    const vp = $('#viewport'), r = vp.getBoundingClientRect(), cx = r.left+vp.clientWidth/2, cy = r.top+vp.clientHeight/2;   
    auxDrag = { kind: 'rotateView', angle: viewAngle, cx, cy, start: Math.atan2(ev.clientY-cy, ev.clientX-cx) };
  } else if (docTool === 'ruler') {
    const before=measureLine && cloneOpValue(measureLine), hit=measureLine && ['a','b','c'].find(k=>measureLine[k] && Math.hypot(pt.x-measureLine[k].x,pt.y-measureLine[k].y)<dispPx(9));
    let mode=hit;
    if (hit && ev.altKey) {
      if (hit==='a') [measureLine.a,measureLine.b]=[measureLine.b,measureLine.a];
      measureLine.c={...pt};mode='c';
    } else if (!mode && measureLine) {
      const {a,b}=measureLine, dx=b.x-a.x,dy=b.y-a.y, t=((pt.x-a.x)*dx+(pt.y-a.y)*dy)/(dx*dx+dy*dy || 1);
      if(t>=0 && t<=1 && Math.hypot(pt.x-a.x-t*dx,pt.y-a.y-t*dy)<dispPx(6)) mode='move';
    }
    if(!mode) {measureLine={a:{...pt},b:{...pt}};mode='b';}
    auxDrag = { kind: 'ruler', before, mode, start:{...pt} }; drawGizmo();
  } else {
    if (!toolData) return;
    const kind = docTool, key = kind === 'colorSampler' ? 'samplers' : kind === 'count' ? 'counts' : 'annotations';
    if (toolData[kind === 'colorSampler' ? 'samplerReadOnly' : kind === 'count' ? 'countReadOnly' : 'noteReadOnly']) return;
    if (pt.x < 0 || pt.y < 0 || pt.x >= docW || pt.y >= docH) return;
    const groups = countGroups();
    const list = kind === 'colorSampler' ? toolData.samplers.samplers : kind === 'note' ? toolData.annotations.annotations : groups[countGroup]?.countObjectList || [];
    const position = p => kind === 'colorSampler' ? { x: p.horizontal, y: p.vertical } : kind === 'note' ? { x: p.iconLocation?.left, y: p.iconLocation?.top } : { x: p['X   '], y: p['Y   '] };
    const at = list.findIndex(p => Math.hypot(position(p).x-pt.x, position(p).y-pt.y) < dispPx(12));
    if (at >= 0 && ev.altKey) { toolDataChanged(key, '删除标记', () => list.splice(at, 1)); return; }
    
    if (kind === 'note' && at < 0) {
      
      let author = noteOpts.author || '';
      if (author.length > 255 || /[^\u0000-\u00ff]/.test(author)) { author = ''; shell.status('注释作者按 PSD 的单字节字段存储，暂不支持中文作者名：这条注释的作者留空'); }
      toolDataChanged('annotations', '新建注释', () => {
        const n = toolDataAPI.newNote(Math.round(pt.x), Math.round(pt.y), '');
        n.author = { s: author, pad: 0 };
        const hex = noteOpts.color || '#ffdc00'; n.color = { space: 0, components: [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16) * 257).concat(0) };
        list.push(n);
      });
      const at2 = list.length - 1;
      if (!notesVisible) { set_notesVisible(true); drawGizmo(); }   
      if (NOTESP) addEventListener('pointerup', () => setTimeout(() => NOTESP.select(at2, { focus: true }), 0), { once: true, capture: true });
      else addEventListener('pointerup', () => setTimeout(() => editNote(at2, pt), 0), { once: true, capture: true });
      return;
    }
    if (kind === 'count' && groups[countGroup]?.Vsbl === false) { shell.status('先显示当前计数组再添加或移动标记'); return; }
    if (at >= 0) { auxDrag = { kind, key, at, group:countGroup, start:{...pt}, before: copyToolData(), snap: docSnapshot(), moved: false }; }
    else if (kind === 'colorSampler') { addColorSampler(pt); return; }
    else toolDataChanged(key, '计数', () => {
      if (!groups.length) groups.push(freshCountGroup());
      groups[countGroup].countObjectList.push(toolDataAPI.newCountPoint(pt.x, pt.y));
    });
  }
  if (auxDrag) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} }
  syncAuxBar();
}
export function auxMove(ev, pt) {
  const d = auxDrag; if (!d) return;
  if (d.kind === 'rotateView') { let angle = d.angle + (Math.atan2(ev.clientY-d.cy, ev.clientX-d.cx)-d.start)*180/Math.PI; if (ev.shiftKey) angle = Math.round(angle/15)*15; setViewAngle(angle); return; }
  if (d.kind === 'ruler') {
    if(d.mode==='move') { for(const k of ['a','b','c']) if(d.before[k]) measureLine[k]={x:d.before[k].x+pt.x-d.start.x,y:d.before[k].y+pt.y-d.start.y}; }
    else {
      let x=pt.x,y=pt.y; const anchor=d.mode==='a'?measureLine.b:d.mode==='c'?measureLine.b:measureLine.a;
      if(ev.shiftKey) {const len=Math.hypot(x-anchor.x,y-anchor.y),angle=Math.round(Math.atan2(y-anchor.y,x-anchor.x)/(Math.PI/4))*Math.PI/4;x=anchor.x+Math.cos(angle)*len;y=anchor.y+Math.sin(angle)*len;}
      measureLine[d.mode]={x,y};
    }
  } else {
    if (!d.moved && Math.hypot(pt.x-d.start.x,pt.y-d.start.y)<dispPx(2)) return;
    let tx=pt.x,ty=pt.y;
    if(d.kind==='count' && ev.shiftKey) { if(Math.abs(tx-d.start.x)>Math.abs(ty-d.start.y))ty=d.start.y;else tx=d.start.x; }
    const x = Math.max(0,Math.min(docW-1,tx)), y = Math.max(0,Math.min(docH-1,ty));
    d.outside=pt.x<0 || pt.y<0 || pt.x>=docW || pt.y>=docH;
    if (d.kind === 'colorSampler') Object.assign(toolData.samplers.samplers[d.at], { horizontal: x, vertical: y });
    else if (d.kind === 'note') {
      const note=toolData.annotations.annotations[d.at], orig=d.before.annotations.annotations[d.at];
      for(const k of ['iconLocation','popupLocation']) if(orig[k]) { const dx=pt.x-d.start.x,dy=pt.y-d.start.y;note[k]={left:Math.round(orig[k].left+dx),top:Math.round(orig[k].top+dy),right:Math.round(orig[k].right+dx),bottom:Math.round(orig[k].bottom+dy)}; }
    } else Object.assign(countGroups()[d.group].countObjectList[d.at], { 'X   ': x, 'Y   ': y });
    d.moved = true;
  }
  drawGizmo(); syncAuxBar();
}
export function auxUp(cancel = false) {
  const d = auxDrag; if (!d) return; auxDrag = null;
  if (cancel) {
    if (d.before && d.kind !== 'ruler') toolData = d.before;
    if (d.kind === 'ruler') measureLine = d.before;
    if (d.kind === 'rotateView') setViewAngle(d.angle);
  } else if (d.key && d.moved) {
    if (d.kind==='colorSampler' && d.outside) toolData.samplers.samplers.splice(d.at,1);
    docHistory.undo.push(d.snap); docHistory.redo.length = 0; histPush('移动标记', 'doc'); toolData.dirty[d.key] = true; updateUndoButtons();
  }
  if (!cancel && d.kind==='note' && !d.moved) setTimeout(() => (NOTESP ? NOTESP.select(d.at, { focus: true }) : editNote(d.at,d.start)), 0);   
  else if (!cancel && d.kind==='note' && NOTESP) NOTESP.select(d.at);
  syncAuxBar(); drawGizmo();
}
export function drawAuxTools(ctx) {
  if (li || !doc) return;
  ctx.save(); ctx.lineWidth = dispPx(1); ctx.font = `${dispPx(12)}px sans-serif`; ctx.fillStyle = '#ffcc33'; ctx.strokeStyle = '#111';
  const mark = (x,y,label) => { ctx.beginPath(); ctx.arc(x,y,dispPx(5),0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillText(label,x+dispPx(8),y-dispPx(5)); };
  
  const dual = draw => { ctx.lineWidth = dispPx(3); ctx.strokeStyle = 'rgba(0,0,0,.85)'; draw(); ctx.stroke(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = '#fff'; draw(); ctx.stroke(); };
  
  if (guidesVisible && (docTool === 'colorSampler' || docTool === 'eyedropper')) (toolData?.samplers?.samplers || []).forEach((p,i) => {
    const x = p.horizontal, y = p.vertical, r = dispPx(5), L = dispPx(9);
    dual(() => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - L, y); ctx.lineTo(x - r, y); ctx.moveTo(x + r, y); ctx.lineTo(x + L, y);
      ctx.moveTo(x, y - L); ctx.lineTo(x, y - r); ctx.moveTo(x, y + r); ctx.lineTo(x, y + L); });
    ctx.font = `bold ${dispPx(11)}px sans-serif`; ctx.lineWidth = dispPx(3); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#fff';
    ctx.strokeText(String(i + 1), x + dispPx(7), y + dispPx(15)); ctx.fillText(String(i + 1), x + dispPx(7), y + dispPx(15));
  });
  
  const noteSelAt = NOTESP && panels.isOpen && panels.isOpen('notes') ? NOTESP.selected() : -1;   
  if (guidesVisible && notesVisible) (toolData?.annotations?.annotations || []).forEach((p, pi) => { if (p.iconLocation) {
    const c = p.color?.components, col = c && p.color?.space === 0 ? hexOf(c.slice(0, 3).map(v => Math.round(v / 257))) : '#ffcc33';
    const x = p.iconLocation.left, y = p.iconLocation.top, w = dispPx(14), h = dispPx(16), f = dispPx(5);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - f, y); ctx.lineTo(x + w, y + f); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - f, y); ctx.lineTo(x + w - f, y + f); ctx.lineTo(x + w, y + f); ctx.stroke();
    ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x + dispPx(3), y + dispPx(7 + k * 3)); ctx.lineTo(x + w - dispPx(3), y + dispPx(7 + k * 3)); } ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
    if (pi === noteSelAt) { ctx.lineWidth = dispPx(2); ctx.strokeStyle = '#2d8ceb'; ctx.strokeRect(x - dispPx(3), y - dispPx(3), w + dispPx(6), h + dispPx(6)); }
  } });
  if (guidesVisible && countVisible) countGroups().forEach(g => { if (g.Vsbl !== false) {ctx.fillStyle=hexOf([g['Rd  '],g['Grn '],g['Bl  ']].map(v=>Math.round(v || 0)));ctx.font=`${dispPx(g.fontSize || 13)}px sans-serif`;g.countObjectList.forEach((p,i)=>{ctx.beginPath();ctx.arc(p['X   '],p['Y   '],dispPx(g['Rds '] || 3),0,Math.PI*2);ctx.fill();ctx.fillText(String(i+1),p['X   ']+dispPx(8),p['Y   ']-dispPx(5));});} });
  
  if (docTool === 'ruler' && measureLine) {
    const {a,b,c}=measureLine, X = dispPx(5);
    dual(() => { ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); if (c) ctx.lineTo(c.x,c.y);
      for (const p of [a, b, c]) if (p) { ctx.moveTo(p.x - X, p.y); ctx.lineTo(p.x + X, p.y); ctx.moveTo(p.x, p.y - X); ctx.lineTo(p.x, p.y + X); } });
    if (c) {
      const a1 = Math.atan2(a.y - b.y, a.x - b.x), a2 = Math.atan2(c.y - b.y, c.x - b.x);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const R = Math.min(dispPx(28), Math.hypot(a.x - b.x, a.y - b.y) * .5, Math.hypot(c.x - b.x, c.y - b.y) * .5);
      dual(() => { ctx.beginPath(); ctx.arc(b.x, b.y, R, a1, a1 + d, d < 0); });
    }
  }
  if (maskTextSession?.canvas) { ctx.globalAlpha=.65; ctx.drawImage(maskTextSession.canvas,0,0); }
  if (maskEdit?.overlay) { ctx.globalAlpha=1; ctx.drawImage(maskEdit.overlay,0,0); }   
  ctx.restore();
}
function toolTextDialog(title, initial, onInput, onCommit) {
  const d = document.createElement('dialog'); d.className = 'fp-dlg';
  const form = document.createElement('form'); form.method='dialog'; form.className='fp-dlg-form';
  const h = document.createElement('h3'); h.textContent=title;
  const ta = document.createElement('textarea'); ta.value=initial; ta.rows=6; ta.style.cssText='width:320px;max-width:70vw'; ta.setAttribute('aria-label',title);
  const buttons = document.createElement('div'); buttons.className='fp-dlg-btns';
  const cancel=document.createElement('button'); cancel.type='button'; cancel.textContent='取消';
  const ok=document.createElement('button'); ok.type='submit'; ok.textContent='确定'; ok.className='primary';
  const finish=() => { d.close(); d.remove(); maskTextSession=null; drawGizmo(); };
  cancel.onclick=finish; d.oncancel=e=>{e.preventDefault();finish();};
  form.onsubmit=e=>{e.preventDefault(); if(onCommit(ta.value)!==false) finish();};
  ta.onkeydown=e=>{ if(e.key==='Enter' && (e.ctrlKey || e.metaKey)) {e.preventDefault();form.requestSubmit();} };
  ta.oninput=()=>onInput?.(ta.value); buttons.append(cancel,ok); form.append(h,ta,buttons); d.append(form); document.body.append(d); d.showModal(); ta.focus(); ta.select(); onInput?.(ta.value);
  return d;
}
export let NOTESP = null;                
export function set_NOTESP(v) { return (NOTESP = v); }   
export function notesApi() {
  return {
    panels, hasDoc: () => !!doc && !li, list: () => (toolData && toolData.annotations && toolData.annotations.annotations) || null,
    readOnly: () => !toolData || !!toolData.noteReadOnly,
    change: (label, fn) => toolDataChanged('annotations', label, fn),
    redraw: () => drawGizmo(),
  };
}

export function noteAt(pt) {
  const list = (toolData && toolData.annotations && toolData.annotations.annotations) || [];
  return list.findIndex(p => p.iconLocation && Math.hypot(p.iconLocation.left - pt.x, p.iconLocation.top - pt.y) < dispPx(12));
}
function syncNotePanel() {
  if (NOTESP) { NOTESP.render(); return; }
  const panel=document.querySelector('.panel[data-panel="notes"]'); if(!panel)return;
  panel.replaceChildren();const list=toolData?.annotations?.annotations || [];
  if(!list.length) {const empty=document.createElement('div');empty.className='panel-empty';empty.textContent=toolData?.noteReadOnly?'原有注释无法可靠解析，已保留原样':'没有注释。使用注释工具在画布上添加。';panel.append(empty);return;}
  
  list.forEach((n,i)=>{
    const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:flex-start;gap:4px;border-bottom:1px solid var(--ps-line)';
    const c=n.color?.components, col=c && n.color?.space===0?hexOf(c.slice(0,3).map(v=>Math.round(v/257))):'#ffcc33';
    const row=document.createElement('button');row.type='button';row.className='hist-row';row.style.cssText='flex:1;height:auto;min-height:30px;text-align:left;white-space:pre-wrap';
    const author=typeof n.author==='string'?n.author:(n.author?.s || '');
    row.innerHTML=`<span style="display:inline-block;width:9px;height:9px;margin-right:6px;background:${col};border:1px solid rgba(0,0,0,.6)"></span><b>${i+1}</b>${author?` · <span style="opacity:.7"></span>`:''}<br>`;
    if(author) row.querySelector('span[style*="opacity"]').textContent=author;
    row.append(document.createTextNode(n.text ?? '语音或未知编码注释'));
    row.title='作者：'+(author || '未填写');row.onclick=()=>editNote(i,{x:n.iconLocation?.left || 0,y:n.iconLocation?.top || 0});
    const del=document.createElement('button');del.type='button';del.textContent='✕';del.title='删除这条注释';del.style.cssText='flex:none;margin:4px';
    del.disabled=!!toolData?.noteReadOnly;
    del.onclick=()=>toolDataChanged('annotations','删除注释',()=>list.splice(i,1));
    wrap.append(row,del);panel.append(wrap);
  });
}
function editNote(at, pt) {
  if(!toolData || toolData.noteReadOnly)return;
  const owner=doc, list=toolData.annotations.annotations, old=list[at];
  if(old && (old.type!=='txtA' || old.text===undefined)) { shell.status('此注释为语音或未识别编码，保留原样'); return; }
  let authorField, colorField;
  const dialog=toolTextDialog('注释',old?.text || '',null,value=>{
    if(doc!==owner || !value.trim()) return;
    if(authorField.value.length>255 || /[^\u0000-\u00ff]/.test(authorField.value)) {
      authorField.setCustomValidity('作者暂支持 255 个西文字符；注释正文支持中文。');authorField.reportValidity();return false;
    }
    authorField.setCustomValidity('');
    const originalAuthor=typeof old?.author==='string'?old.author:(old?.author?.s || '');
    const originalColor=old?.color?.space===0?hexOf(old.color.components.slice(0,3).map(v=>Math.round(v/257))):noteOpts.color;
    if(old && old.text.replace(/\r\n?/g,'\n')===value && authorField.value===originalAuthor && colorField.value===originalColor)return;
    toolDataChanged('annotations',at<0?'添加注释':'编辑注释',()=>{
      const n=old || toolDataAPI.newNote(Math.round(pt.x),Math.round(pt.y),value);
      n.text=value;n._textEnc ||= {bom:true,le:false};if(!old || authorField.value!==originalAuthor)n.author={s:authorField.value,pad:0};
      const hex=colorField.value;if(!old || hex!==originalColor)n.color={space:0,components:[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)*257).concat(0)};
      if(!old)list.push(n);
    });
  });
  const add=(label,value,type)=>{const lab=document.createElement('label');lab.textContent=label;const input=document.createElement('input');input.type=type;input.value=value;lab.append(input);dialog.querySelector('form').insertBefore(lab,dialog.querySelector('textarea'));return input;};
  authorField=add('作者',old?(typeof old.author==='string'?old.author:old.author?.s || ''):noteOpts.author,'text');
  authorField.maxLength=255;authorField.oninput=()=>authorField.setCustomValidity('');
  colorField=add('颜色',old?.color?.space===0?hexOf(old.color.components.slice(0,3).map(v=>Math.round(v/257))):noteOpts.color,'color');
}




function maskEditModel(){
  const m = maskEdit; if (!m) return null;
  const text = m.ta.value.replace(/\n$/, '');
  const size = Math.max(0.01, textToolOpts.sizePt) * (docResolution || 72) / 72;
  const run = { from: 0, to: Math.max(1, text.length), fontSize: size, color: [0, 0, 0, 1], font: textToolFontPs(), tracking: 0, hScale: 1, vScale: 1, autoKern: true };
  const J = JUSTIFY_CODE[textToolOpts.align] || 0;
  const paragraphs = [{ from: 0, to: text.length + 1, justification: J, autoLeading: 1.2 }];
  return { text, runs: [run], paragraphs, orientation: m.vertical ? 'vertical' : 'horizontal',
    shape: m.box ? 'box' : 'point', box: m.box ? [m.box.x, m.box.y, m.box.x + m.box.w, m.box.y + m.box.h] : null,
    pointBase: [m.pt.x, m.pt.y] };
}
async function maskEditRender(){
  const m = maskEdit; if (!m || !doc) return;
  const my = ++m.seq;
  const font = textToolFontPs();
  const res = font ? await resolveFont(font) : null;
  if (!maskEdit || maskEdit !== m || my !== m.seq) return;
  const css = res && res.ok ? res.css : null;
  const model = maskEditModel();
  const cv = document.createElement('canvas'); cv.width = docW; cv.height = docH;
  const ctx = cv.getContext('2d');
  const cssMap = new Map([[model.runs[0], css]]);
  const lay = layoutRichText({ ...model, text: model.text || ' ' }, textLayoutApi(ctx, cssMap));
  if (model.text) {
    drawRichText(ctx, layoutRichText(model, textLayoutApi(ctx, cssMap)), cssMap);
    const cp = cropCanvasAlpha(cv);
    if (cp) applyTextAntiAlias(cv, cp, textToolOpts.aa);
  }
  m.canvas = cv; m.lay = lay; m.css = css;
  
  const ov = m.overlay || (m.overlay = document.createElement('canvas'));
  ov.width = docW; ov.height = docH;
  const o = ov.getContext('2d');
  o.fillStyle = 'rgba(255,0,0,0.5)'; o.fillRect(0, 0, docW, docH);
  o.globalCompositeOperation = 'destination-out'; o.drawImage(cv, 0, 0); o.globalCompositeOperation = 'source-over';
  maskEditPlace(); drawGizmo();
}

function maskEditPlace(){
  const m = maskEdit; if (!m || !m.lay) return;
  const model = maskEditModel(), run = model.runs[0], size = run.fontSize;
  const K = size < 16 ? 16 / size : 1, z = zoom || 1;
  const lineH = size * 1.2, ta = m.ta;
  const l0 = m.lay.lines[0];
  const asc = l0 ? l0.ascent : size * 0.88, desc = l0 ? l0.descent : size * 0.12;
  const nLines = Math.max(1, ta.value.split('\n').length, m.lay.vertical ? 1 : m.lay.lines.length);
  let left, top, width, height;
  if (m.vertical) {
    const b = m.lay.bounds || { left: m.pt.x - size, top: m.pt.y, right: m.pt.x, bottom: m.pt.y + size };
    left = m.box ? m.box.x : b.left; top = m.box ? m.box.y : m.pt.y;
    width = m.box ? m.box.w : Math.max(size, b.right - b.left); height = m.box ? m.box.h : Math.max(size * 2, b.bottom - top + size);
  } else if (m.box) {
    left = m.box.x; width = m.box.w; height = m.box.h;
    top = (l0 ? l0.y : m.box.y + asc) - asc - (lineH - asc - desc) / 2;
  } else {
    const maxW = m.lay.lines.reduce((a, ln) => Math.max(a, ln.w), 0);
    width = Math.max(size, maxW) + size;
    const J = textToolOpts.align;
    left = J === 'center' ? m.pt.x - width / 2 : J === 'right' ? m.pt.x - width + size / 2 : m.pt.x;
    top = m.pt.y - asc - (lineH - asc - desc) / 2; height = nLines * lineH;
  }
  Object.assign(ta.style, {
    writingMode: m.vertical ? 'vertical-rl' : 'horizontal-tb', textOrientation: 'upright',
    left: '0px', top: '0px', transformOrigin: '0 0',
    width: Math.ceil(width * K) + 'px', height: Math.ceil(height * K) + 'px',
    font: runCanvasFont(run, m.css, 1, K), lineHeight: (lineH * K) + 'px',
    whiteSpace: m.box ? 'pre-wrap' : 'pre',
    textAlign: textToolOpts.align,
    transform: `matrix(${z / K},0,0,${z / K},${(left + padL()) * z},${(top + padT()) * z})`,
    caretColor: '#000',
  });
  ta.classList.toggle('box', !!m.box);
}

export function maskEditRelayout(){ if (maskEdit) maskEditRender(); }
export async function startTextMask(pt, vertical, mode, box = null) {
  const owner = doc; if (!await ensureLazy(SELECT, '文字蒙版') || doc !== owner) return false;
  if (maskEdit) closeMaskEdit(true);
  const ta = document.createElement('textarea');
  ta.id = 'textMaskOverlay'; ta.spellcheck = false;
  ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocorrect', 'off'); ta.setAttribute('autocapitalize', 'off');
  $('#stage').appendChild(ta);
  set_maskEdit({ pt: { x: pt.x, y: pt.y }, box, vertical: !!vertical, mode, ta, owner, seq: 0, canvas: null, overlay: null });
  syncTextBar();
  ta.oninput = () => maskEditRender();
  ta.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.code === 'NumpadEnter'))) { e.preventDefault(); closeMaskEdit(true); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && (e.code === 'Period' || e.code === 'Comma')) {         
      e.preventDefault();
      textToolOpts.sizePt = Math.max(0.01, textToolOpts.sizePt + (e.altKey ? 10 : 2) * (e.code === 'Period' ? 1 : -1));
      syncTextBar(); maskEditRender(); return;
    }
    const AL = { KeyL: 'left', KeyC: 'center', KeyR: 'right' };
    if (mod && e.shiftKey && AL[e.code]) { e.preventDefault(); textToolOpts.align = AL[e.code]; syncTextBar(); maskEditRender(); }
  };
  ta.onblur = e => {
    const to = e && e.relatedTarget;
    if (to && to.closest && to.closest('#grpText, .fontpop, #fontDlg, .menu-pop')) return;
    setTimeout(() => {
      if (!maskEdit || maskEdit.ta !== ta) return;
      const ae = document.activeElement;
      if (ae === ta || fontPop || document.querySelector('.menu-pop.panel-menu') || (ae && ae.closest && ae.closest('#grpText, .fontpop, #fontDlg'))) return;
      closeMaskEdit(true);
    }, 0);
  };
  
  ta.addEventListener('pointerdown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.button !== 0 || !maskEdit) return;
    e.preventDefault(); e.stopPropagation();
    const m = maskEdit, p0 = { ...m.pt }, b0 = m.box && { ...m.box }, d0 = toDoc(e);
    try { ta.setPointerCapture(e.pointerId); } catch {}
    const mv = ev => { const d = toDoc(ev), dx = d.x - d0.x, dy = d.y - d0.y;
      m.pt = { x: p0.x + dx, y: p0.y + dy }; if (b0) m.box = { ...b0, x: b0.x + dx, y: b0.y + dy }; maskEditRender(); };
    const up = () => { ta.removeEventListener('pointermove', mv); ta.removeEventListener('pointerup', up); };
    ta.addEventListener('pointermove', mv); ta.addEventListener('pointerup', up);
  });
  { const syncCur = e => { ta.style.cursor = (e.metaKey || e.ctrlKey) ? 'move' : ''; };
    ta.addEventListener('keydown', syncCur); ta.addEventListener('keyup', syncCur); ta.addEventListener('pointermove', syncCur); }
  await maskEditRender();
  try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
  shell.status((vertical ? '直排' : '横排') + '文字蒙版：输入文字，提交（✓ / ⌘↩ / Esc）后变成选区');
  return true;
}

export function closeMaskEdit(commit){
  const m = maskEdit; if (!m) return;
  set_maskEdit(null); m.ta.remove();
  drawGizmo(); try { syncTextBar(); } catch {}
  if (!commit || doc !== m.owner || !m.canvas) return;
  const text = m.ta.value.replace(/\n$/, '');
  if (!text.trim()) return;
  const rgba = m.canvas.getContext('2d').getImageData(0, 0, docW, docH).data;
  const alpha = new Uint8Array(docW * docH); let any = 0;
  for (let i = 0; i < alpha.length; i++) { alpha[i] = rgba[i * 4 + 3]; any |= alpha[i]; }
  if (!any) return;
  combineInto(SELM.createSelection(docW, docH, 0, 0, docW, docH, alpha), m.mode);
  shell.status('文字蒙版：已生成选区');
}

export const SEL_TOOLS = new Set(['selRect', 'selEllipse', 'selRow', 'selCol', 'lasso', 'lassoPoly', 'lassoMagnetic', 'selectionBrush', 'wand', 'quickSelect', 'objectSelect']);


export const PAINT_TOOLS = new Set(['brush', 'eraser', 'pencil', 'cloneStamp', 'patternStamp',
  'backgroundEraser', 'colorReplace', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'mixerBrush', 'historyBrush', 'historyArtBrush', 'adjBrush']);
export const DOC_TOOLS = ['adjBrush', 'colorSampler', 'ruler', 'note', 'count', 'rotateView', 'mixerBrush', 'historyBrush', 'historyArtBrush', 'textVertical', 'textMask', 'textMaskVertical', 'move', 'selRect', 'selEllipse', 'selRow', 'selCol', 'lasso', 'lassoPoly', 'lassoMagnetic', 'selectionBrush', 'wand', 'quickSelect', 'objectSelect', 'cropPerspective', 'slice', 'sliceSelect', 'artboard', 'frame',
  'pencil', 'cloneStamp', 'patternStamp', 'backgroundEraser', 'magicEraser',
  'colorReplace', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'brush', 'eraser', 'path', 'hand', 'zoom', 'crop', 'text', 'shape', 'pen', 'gradient', 'bucket', 'eyedropper',
  
  'penFree', 'penCurvature', 'addAnchor', 'deleteAnchor', 'convertPoint', 'pathSelect',
  
  'spotHeal', 'healBrush', 'patch', 'contentMove', 'redEye'];
export const handActive = () => !!doc && !li && docTool === 'hand';
export const TOOL_BTN = { move: 'toolMove', selRect: 'toolSelRect', selEllipse: 'toolSelEllipse', lasso: 'toolLasso', path: 'toolPath', crop: 'toolCrop', text: 'toolTextH',
                   wand: 'toolWand', brush: 'toolBrush', eraser: 'toolEraser' };
export let docTool = 'move';             
export function set_docTool(v) { return (docTool = v); }   





export const moveOpts = { auto: false, kind: 'layer', showTf: false,
  



  hoverBounds: true, expandGroups: false, panelHover: true,
  
  alignTo: 'selection' };
const MOVE_PREF_KEYS = ['hoverBounds', 'expandGroups', 'panelHover'];
try {
  const v = JSON.parse(localStorage.getItem('psd_editor.moveOpts') || 'null');
  if (v) for (const k of MOVE_PREF_KEYS) if (typeof v[k] === 'boolean') moveOpts[k] = v[k];
  if (v && (v.alignTo === 'canvas' || v.alignTo === 'selection')) moveOpts.alignTo = v.alignTo;
} catch {}
function saveMovePrefs(){
  try { localStorage.setItem('psd_editor.moveOpts', JSON.stringify({ ...Object.fromEntries(MOVE_PREF_KEYS.map(k => [k, moveOpts[k]])), alignTo: moveOpts.alignTo })); } catch {}
}

export function moveAutoOn(ev){
  const ctrl = ev ? !!(ev.metaKey || ev.ctrlKey) : !!modKeys.ctrl;
  return !!moveOpts.auto !== ctrl;
}
export let moveHover = -1, panelHover = -1;   
export function set_moveHover(v) { return (moveHover = v); }   
export function set_panelHover(v) { return (panelHover = v); }   
export let moveHoverPt = null, moveHoverRaf = 0, lastMoveCtrl = false;
export function set_moveHoverPt(v) { return (moveHoverPt = v); }   
export function set_moveHoverRaf(v) { return (moveHoverRaf = v); }   
export function set_lastMoveCtrl(v) { return (lastMoveCtrl = v); }   
export let zoomOutMode = false;          
let moveBarBound = false, zoomBarBound = false;
export let selMode = 'replace';          
export function set_selMode(v) { return (selMode = v); }   
export const brush = { size: 60, hardness: .6, opacity: 1, flow: 1, spacing: .25,
  


  tip: 'round', angle: 0, roundness: 1, preset: 'softRound', smoothing: .1,
  smoothOpts: { pulled: false, catchUp: true, catchUpEnd: true, zoomAdjust: true },
  airbrush: false, pressureSize: false, pressureOpacity: false, dyn: defaultDynamics(), symmetry: null };

export const toolModes = { brush: 'normal', pencil: 'normal', historyBrush: 'normal', adjBrush: 'normal' };
export const eraserOpts = { mode: 'brush', toHistory: false };
export const pencilOpts = { autoErase: false };
export let symmetryOn = false;                 
export function set_symmetryOn(v) { return (symmetryOn = v); }   
export let numKeyState = null;            
export function set_numKeyState(v) { return (numKeyState = v); }   
export let fgRGB = [0, 0, 0], bgRGB = [255, 255, 255];   
export function set_fgRGB(v) { return (fgRGB = v); }   
export function set_bgRGB(v) { return (bgRGB = v); }   
export const grayOf = c => Math.round(c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114);
export const hexOf = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');


export function setDocTool(name){
  if (!DOC_TOOLS.includes(name)) return;
  

  if (name === 'zoom' && docTool !== 'zoom') zoomOutMode = false;
  if (tfState && name !== docTool) commitFreeTransform();   
  
  if (textOverlay && !TEXT_TOOLS.has(name)) closeInlineText(true);
  if (maskEdit && !TEXT_TOOLS.has(name)) closeMaskEdit(true);
  if (curStroke) endStroke();
  
  
  if (SEL_TOOLS.has(name)) kick(SELECT);
  if (cropState && name !== 'crop') commitCrop();            
  if (name === 'bucket') kick(SELECT);                       
  if (gradDrag && name !== 'gradient') { set_gradDrag(null); }
  if (name !== 'gradient') { set_liveGradEdit(null); set_liveGradSel(null); closeGradPicker(); }
  if (polyLasso && name !== polyLasso.tool) cancelPolyLasso();
  if (sbState && name !== 'selectionBrush') endSelBrush();
  if (magLasso && name !== 'lassoMagnetic') cancelMagLasso();
  if (qsState && name !== 'quickSelect') { set_qsState(null); }        
  if (osState && name !== 'objectSelect') { set_osState(null); drawGizmo(); }
  if (pcropState && name !== 'cropPerspective') cancelPCrop();
  if (sliceDrag && name !== 'slice' && name !== 'sliceSelect') { set_sliceDrag(null); drawGizmo(); }
  if (abState && name !== 'artboard') { set_abState(null); drawGizmo(); }
  if (frameState && name !== 'frame') { set_frameState(null); drawGizmo(); }
  set_qsEdgeCache(null);                                               
  if (name === 'objectSelect' && docTool !== 'objectSelect') objFinderReset();   
  if (penState && !PEN_TOOLS.has(name)) { penState.drag = null; if (!commitPen(false)) cancelPen(); }   
  if (freePen && name !== 'penFree') { set_freePen(null); gizmo.classList.remove('drag', 'pen-drawing'); }
  if (magPen && name !== 'penFree') { set_magPen(null); gizmo.classList.remove('pen-drawing'); }
  if (pathSubDrag && name !== 'pathSelect') set_pathSubDrag(null);
  if (!PATH_EDIT_TOOLS.has(name)) { pathSelSubs.clear(); pathSelAnchors.clear(); }
  if (retouchState && !RETOUCH_TOOLS.has(name)) { set_retouchState(null); gizmo.classList.remove('drag'); }
  if (rtPending && name !== 'contentMove') rtPendingCancel();
  if (RETOUCH_TOOLS.has(name)) { kick(RETOUCH); if (SEL_TOOLS.has(name) || name === 'patch' || name === 'contentMove') kick(SELECT); }
  if (shapeState && name !== 'shape') set_shapeState(null);
  paintToolSwitch(docTool, name);                            
  docTool = name;
  for (const k of DOC_TOOLS) { const b = $('#' + TOOL_BTN[k]); if (b) b.classList.toggle('active', k === name); }
  if (name === 'crop' && doc) beginCrop();
  tools.syncFromDocTool(name);
  syncToolOptions();
  syncGizmoCursor();
  updatePanCursor();
  syncToolPreset();
  drawGizmo();
}



export function setDocToolFromHarness(name){
  modKeys.shift = modKeys.alt = modKeys.ctrl = false;
  setDocTool(name);
}



export function syncMoveBar(){
  const g = $('#grpMove'); if (!g) return;
  if (!moveBarBound) {
    moveBarBound = true;
    
    const mkAlign = (host, prefix, title, fn) => {
      for (const [how, ic] of ALIGN_BTNS) {
        const b = mkEl('button', { type: 'button', title: title(how) });
        b.dataset.align = prefix + how;
        b.append(icon(prefix === 'd-' ? DISTRIBUTE_ICONS[how] : ic, 13));
        b.onclick = () => fn(how);
        host.appendChild(b);
      }
    };
    mkAlign($('#mvAlign'), '', how => `对齐${ALIGN_LABEL[how]}`, how => alignLayers(how));
    
    mkAlign($('#mvAlign2'), '', how => `对齐${ALIGN_LABEL[how]}`, how => alignLayers(how));
    mkAlign($('#mvDistribute'), 'd-', how => `按${ALIGN_LABEL[how]}分布（至少选中三层）`, how => distributeLayers(how));
    for (const [axis, key, title] of [['v', 'spaceV', '垂直分布（上下间距相等）'], ['h', 'spaceH', '水平分布（左右间距相等）']]) {
      const b = mkEl('button', { type: 'button', title: title + '（至少选中三层）' });
      b.dataset.spacing = axis; b.append(barIcon(key, 13, title)); b.onclick = () => distributeSpacing(axis);
      $('#mvSpacing').appendChild(b);
    }
    $('#mvAlignTo').addEventListener('change', () => { moveOpts.alignTo = $('#mvAlignTo').value === 'canvas' ? 'canvas' : 'selection'; saveMovePrefs(); });
    const more = $('#mvMore'), pop = $('#mvAlignPop');
    
    more.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true" style="display:block"><circle cx="9" cy="9" r="1.9"/><circle cx="15" cy="9" r="1.9"/><circle cx="3" cy="9" r="1.9"/></svg>';
    const closePop = e => { if (e && (pop.contains(e.target) || more.contains(e.target))) return; pop.hidden = true; removeEventListener('pointerdown', closePop, true); };
    more.addEventListener('click', () => {
      if (!pop.hidden) { closePop(); return; }
      pop.hidden = false;
      const r = more.getBoundingClientRect();
      pop.style.left = Math.max(4, Math.min(innerWidth - pop.offsetWidth - 4, r.left)) + 'px'; pop.style.top = (r.bottom + 4) + 'px';
      syncMoveBar();
      setTimeout(() => addEventListener('pointerdown', closePop, true), 0);
    });
    
    $('#mvAuto').addEventListener('change', () => { moveOpts.auto = $('#mvAuto').checked !== !!modKeys.ctrl; syncMoveBar(); refreshMoveHover(); });
    
    const gear = $('#mvGear');
    if (gear) {
      const [src, px] = AB_BAR_ICONS.abGear;
      const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; img.alt = '设置其它移动工具选项';
      img.style.cssText = 'display:block;pointer-events:none';
      gear.replaceChildren(img);
      const toggle = (key, after) => () => { moveOpts[key] = !moveOpts[key]; saveMovePrefs(); if (after) after(); };
      gear.addEventListener('click', e => {
        panels.popup([
          { label: '悬停时显示图层边界', checked: moveOpts.hoverBounds,
            run: toggle('hoverBounds', () => { if (!moveOpts.hoverBounds && moveHover >= 0) { moveHover = -1; drawGizmo(); } }) },
          { label: '单击时展开图层组', checked: moveOpts.expandGroups, run: toggle('expandGroups') },
          { label: '显示图层的悬停边界', checked: moveOpts.panelHover,
            run: toggle('panelHover', () => { if (!moveOpts.panelHover && panelHover >= 0) { panelHover = -1; drawGizmo(); } }) },
        ], e.currentTarget.getBoundingClientRect());
      });
    }
    $('#mvAutoKind').addEventListener('change', () => { moveOpts.kind = $('#mvAutoKind').value; syncMoveBar(); });
    $('#mvShowTf').addEventListener('change', () => { moveOpts.showTf = $('#mvShowTf').checked; syncMoveBar(); drawGizmo(); });
  }
  
  for (const b of $('#mvDistribute').children) b.disabled = selLayers.size < 3;
  for (const b of $('#mvSpacing').children) b.disabled = selLayers.size < 3;
  for (const b of $('#mvAlign').children) b.disabled = selLayer < 0;
  for (const b of $('#mvAlign2').children) b.disabled = selLayer < 0;
  $('#mvAlignTo').value = moveOpts.alignTo === 'canvas' ? 'canvas' : 'selection';
  $('#mvAlignTo').disabled = selLayers.size < 2 || !!selection;   
  const effAuto = moveAutoOn();                 
  lastMoveCtrl = !!modKeys.ctrl;
  $('#mvAuto').checked = effAuto;
  $('#mvAutoKind').value = moveOpts.kind;
  $('#mvAutoKind').disabled = !effAuto;
  $('#mvShowTf').checked = moveOpts.showTf;
  const tmp = modKeys.ctrl ? '（按住 ⌘/Ctrl：临时' + (effAuto ? '打开' : '关闭') + '）' : '';
  $('#mvWhy').textContent = (effAuto
    ? (moveOpts.kind === 'group' ? '点哪层选哪层，并连同它所在的组一起选' : '点哪层选哪层')
    : '只移动当前选中的图层') + (tmp || (moveOpts.auto ? '（按住 ⌘/Ctrl 临时关闭）' : '（按住 ⌘/Ctrl 临时自动选择）'));
}

const VIEW_BAR_ICONS = {
  zoomIn: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACYElEQVR42u2Yu2sUURTGfxPiY1cQJE1iYZFCg8RmsRM7WbFKIXEh2BoEG8FCbCxESKEuWJo/QBAfaJMisUliETDYaBFSRIsYgxhBxKxZlz02n3AZ70x27qy7EXLgcudx75mP8/rOncjM2EnSww6TXUD/HaDegD0RMAgMAX16tgEsASuAdQpQAagA54GBhDWfgKfAI6AWAihqMe1LwC2gX/d14B2wrvt+YBjYq/t14CbwJjMiM9tulM1swcwWzWzKzEbMrOhZV9S7Ka1d0F6yjO0WlBww1QQgPmBVB1QpC6A0lxWAx3LHS+BGhoCNgAngjNw32mpMpaV9RWDWFD8+MA81/ooE7VmTjkreOhQpmwAmgc2EdUc1fLKpvUhXlAfQoFK7BkznKCvT0jEgncGAhjS/VYqHSl06XJ1BhbHPKXTxmPG5aNG5XgbGYsXS1dl1LvvzjWYeC21ojlPEWIJlTqZ847DmL3kstKT5hEMHIbIfOB7TGQRoRb4vAOUcgMrSsQp8yAPIxNoA40AxYd2yhk+KwGVdP2kH2+ehjj3AXeAU8FHUUc+bZTW1EA1x0r0US7lyELgvMAAHUqp5UD9UFi/1Ap+BB8CMh072AWeBS57s/AFcUQ/1zxu0hlJ7WFlFCrddA163A1CrLewq8Ax4pRg6Enu/BVxNAxUFnFzjTX4T+Ko6894J/ENAVbXMlV/AdWCuXYCyFsYJ4HTseUOgZjvNZT8VNy88lHUHONdpC7kyruFKU4Dnu3FynQRux1i/B7jQzaP0c1lky9MvddxlrhwDLgLfVGi/dxvQ7u+YYPkN9NR4wr6F2vkAAAAASUVORK5CYII=',
  zoomOut: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACVElEQVR42u3Yu2tUQRTH8c+G+MgKggQkSWGRQoPEJq3YyYqVhWgg2BoEG8FCbCxESKEGLM0fIMQX2qSINj6KgGKjRbCIFjEGMYKIiYkhY3OEy7JJdu+umyA5cJk7986c/TIz5/zO3UJKyWayFpvMtoDWs9YccwroRg/a49kcJjGF1CygNvTjJDpXGfMZDzCKhTxAhSqjrA9X0RH9JbzDbPQ70Ivt0Z/FFbypmSiltN5VSilNpJRep5TGUkonUkrFCuOK8W4sxk7EXLVc6w3oy8AMrwJSCWw4A9VXC9BaW9aGe7EdT3G5hgNbwBCOxvadqvZMrRX2/QEzE+enluhJMWcmfPTXm4cKEU0wgvkcATMfc4WvQj1A3RHaCxivI62Mh4/O8JkbqCfatxHieW0pfGR95kqM7ZlEl7U72L+Oz/cYKEuWWZ8brmV/f2OlnhWai7ZcIgZyAHVF+7WeFZqM9lBGDvLYThws85kLaCr2vg2lOoBK4WMaH+sBSqHaMIhiDpgizsX9/UYUaKOR9rtCuQs1wGwL6diLT7jbCKCFAFkOTbpZ5Urtxi0cjv6uKlJFTfVQKXSpFV9wG08qyMkOHMPZCtH5E+ejhvrnBdpybGtvRNVa2nYRrxoBVG0JO42HeIkb2Ff2fhEX1oIq5PhQLC/yV/At8syHTJmyB8ORy7L2G5fwvFFAtSbGIRwpe74cUM+arWW/4tw8riBZ13G82SuUtcG4srYSwC824st1BNfKVL8FpzfyU/pRrMhihXqp6VuWtQM4g++RaH9sNNDW3zH/D9Afe9lvCRnGoh8AAAAASUVORK5CYII=',
  spaceH: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAf0lEQVR42u2YQQ6AIAwEt4aX8Che6IlH9SemXryqjRaCuJtwImkndDcBxMwwkhYMJg9QBbAG9KrHulRyFMoBMOKt02tkNrWH/g2UXqbmzKgKoPQ+odwimfQQgQhEIAIRiEAEItBEQPpwr9mdunBkBPrqQ1EBbAG9XMkT/qDdaAf9LBE+Y88SSwAAAABJRU5ErkJggg==',
  spaceV: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAb0lEQVR42u2WQQqAMAwEt+JL+igf6aN8iCDxpIjQXhpJkJlTjsPSTVrMTJmYlAyEEELoa+bHvEqqQR6bpOWd0BEYzH4NhU2NkGPLWni2727TSEKeq6DyhhBCqFFVzyPahVuG0K9/jCmgZQghhFA0JwEPFjb3xPtIAAAAAElFTkSuQmCC',
};
function barIcon(key, px = 18, alt = ''){
  const img = document.createElement('img'); img.src = VIEW_BAR_ICONS[key]; img.width = px; img.height = px; img.alt = alt;
  img.style.cssText = 'display:block;pointer-events:none';
  return img;
}
export function syncZoomBar(){
  const g = $('#grpZoom'); if (!g) return;
  if (!zoomBarBound) {
    zoomBarBound = true;
    $('#zmIn').replaceChildren(barIcon('zoomIn', 18, '放大'));
    $('#zmOut').replaceChildren(barIcon('zoomOut', 18, '缩小'));
    $('#zmIn').onclick = () => { zoomOutMode = false; syncZoomBar(); syncGizmoCursor(); };
    $('#zmOut').onclick = () => { zoomOutMode = true; syncZoomBar(); syncGizmoCursor(); };
    $('#zmFit').onclick = () => fitStage(true, { fitCap: 32 });
    $('#zm100').onclick = () => { set_zoomFitMode(false); set_zoom(1); fitStage(); };
    $('#zmFill').onclick = () => fillStage();
    $('#zmScrubby').onchange = () => { zoomOpts.scrubby = $('#zmScrubby').checked; saveZoomOpts(); };
  }
  const isZoom = docTool === 'zoom';
  for (const id of ['#zmDirWrap', '#zmResizeWrap', '#zmAllWrap', '#zmScrubWrap']) $(id).hidden = !isZoom;
  $('#hdAllWrap').hidden = docTool !== 'hand';
  $('#zmScrubby').checked = zoomOpts.scrubby;
  $('#zmIn').classList.toggle('on', !zoomOutMode);
  $('#zmOut').classList.toggle('on', zoomOutMode);
  for (const id of ['#zmFit', '#zm100', '#zmFill']) $(id).disabled = !doc;
}

export function fillStage(){
  if (!docW) return;
  const vp = $('#viewport');
  const z = Math.min(32, Math.max(0.01, Math.max((vp.clientWidth - 48) / docW, (vp.clientHeight - 48) / docH)));
  set_zoomFitMode(false); set_zoom(z); set_panX(0); set_panY(0); fitStage();
}

export function syncToolPreset(){
  const tp = $('#toolPreset .tp-icon'); if (!tp) return;
  const t = tools.current() ? tools.tool(tools.current()) : null;
  tp.innerHTML = ''; tp.appendChild(tools.svgIcon(t ? t.id : 'move', 16));
}
tools.onSelect(t => {
  const m = /^docTool:(.+)$/.exec(t.impl || ''); if (!m) return;
  if (m[1] === 'shape' && SHAPE_KINDS[t.id]) shapeOpts.kind = t.id;   
  setDocTool(m[1]);
  if (m[1] === 'shape') syncShapeBar();
});

tools.onBeforeSelect(t => { if (!li) return true; if (t.impl === 'docTool:move') setTool(false); return false; });



export const TOOL_RESETTERS = {
  move: () => { moveOpts.auto = false; moveOpts.kind = 'layer'; moveOpts.showTf = false; moveOpts.alignTo = 'selection'; syncMoveBar(); drawGizmo(); },
  zoom: () => { zoomOutMode = false; zoomOpts.scrubby = true; saveZoomOpts(); syncZoomBar(); syncGizmoCursor(); },
  hand: () => {},
  rotateView: () => {},
  gradient: () => { Object.assign(gradOpts, { mode: 'gradient', preset: 'fgbg', style: 'linear', blend: 'normal', opacity: 1, reverse: false, dither: true, transparency: true, method: 'perceptual', model: null }); syncGradBar(); drawGizmo(); },
  ...Object.fromEntries(['blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge'].map(k => [k, () => {
    
    if (boOpts.strengthBy[k] != null) boOpts.strengthBy[k] = 0.5;
    if (k === 'blur' || k === 'sharpen' || k === 'smudge') Object.assign(boOpts, { retouchMode: 'normal', allLayers: false, protectDetail: true, finger: false });
    if (k === 'dodge' || k === 'burn') Object.assign(boOpts, { range: 'midtones', exposure: 0.5, protectTones: true, airbrush: false });
    if (k === 'sponge') Object.assign(boOpts, { spongeMode: 'desaturate', vibrance: true, airbrush: false });
    syncBrushOpBar();
  }])),
  bucket: () => { Object.assign(bucketOpts, { source: 'fg', blend: 'normal', opacity: 1, tolerance: 32, antialias: true, contiguous: true, allLayers: false }); syncBucketBar(); },
};
export function resetToolOptions(name){
  const fn = TOOL_RESETTERS[name];
  if (!fn) return false;
  try { fn(); } catch {}
  return true;
}
tools.onPresetPicker(anchor => {
  const t = tools.current() ? tools.tool(tools.current()) : null;
  const label = t ? t.label : '当前工具';
  panels.popup([
    { label: `${label}：没有存储的工具预设`, disabled: true },
    { sep: true },
    { label: '复位工具', run: () => { shell.status(resetToolOptions(docTool) ? `已复位「${label}」的选项` : `「${label}」还没有接入「复位工具」`); } },
    { label: '复位所有工具', run: () => { let n = 0; for (const k of Object.keys(TOOL_RESETTERS)) if (resetToolOptions(k)) n++; syncToolOptions(); shell.status(`已复位 ${n} 个工具的选项（其余工具还没有接入）`); } },
  ], { left: anchor.left, right: anchor.right, top: anchor.top, bottom: anchor.bottom, alignLeft: true });
});

tools.onDblSelect(t => {
  if (!doc) return;
  if (t.impl === 'docTool:hand') { fitStage(true, { fitCap: 32 }); shell.status('按屏幕大小缩放'); }
  else if (t.impl === 'docTool:rotateView') { setViewAngle(0); }
  else if (t.impl === 'docTool:zoom') { set_zoomFitMode(false); set_zoom(1); fitStage(); shell.status('100%（实际像素）'); }
});
