




import './56-docs-wiring.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import { parsePsdFull } from '../../../core/app.js';
import { readFontNames, splitFonts, fontKind } from '../../../core/font-sfnt.js';
import { openFont, outlineToCubics } from '../../../core/glyph-outline.js';
import { layoutRichText, layoutDynamicText } from '../../../core/psd-text.js';
import { caretSegment, selectionQuads } from '../../../core/text-caret.js';
import {
  layoutPathText, layoutAreaText, subSegments, arcTable, nearestOnSegs, flattenSegs, segsBounds,
  pathTextMarkers,
} from '../../../core/text-path.js';
import { readStyleSheets, otFeatureCss, opticalKerner } from '../../../core/text-styles.js';
import { layoutPathTextV, layoutAreaTextV } from '../../../core/text-vpath.js';
import { warpMap, warpMesh, WARP_STYLES } from '../../../core/text-warp.js';
import { actions } from '../actions.js';
import { installPathWarp } from '../path-warp.js';
import { shell } from '../shell.js';
import {
  $, BLEND_KEYS, BLEND_LABELS, CREATABLE_FX, EDIT, EDITM, applyEdits, createEffectTemplate, ensureLazy, kick,
  set_booted, set_layerStyleDlg, set_layerStyleLoader,
} from './01-boot.js';
import {
  doc, docName, docStack, layerDeletes, layerEdits, layerOps, layerRenames, layerTextEdits, layerTree, li,
  origBuffer, pushHistory, textFontSubst, textOverlay, textStyleEdits,
} from './02-doc-state.js';
import {
  docHistory, docSnapshot, histLog, pushDocHistory, restoreDocSnapshot, set_docHistLock, structuralBegin,
  structuralDone, syncHistoryPanel, updateUndoButtons,
} from './03-history.js';
import { padL, padT, viewH, viewW, zoom } from './04-view-chrome.js';
import { birdEye, commit, zoomGest } from './06-view-zoom-move.js';
import {
  applyTextStyle, createTextLayerAt, isTextLayer, syncTextBar, textInfoOf, textLayerAt,
} from './09-text-tool.js';
import {
  activePath, afterWorkPathChange, ensureDocPaths, getDocPath, set_activePath, set_workPath, set_workPathDirty,
} from './17-shape-pen.js';
import {
  beginFreeTransform, beginPathWarp, cancelFreeTransform, commitFreeTransform, pathWarpEligible, tfState,
} from './19-free-transform.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { renderLayerPanel, selLayer, set_selLayer } from './23-layers-panel.js';
import {
  addedFxTemplateValue, addedFxValue, cloneOpValue, effFillOpacity, effFxEnabled, effKnockout, effParam,
  findLayerOp, humanEditError, layerParams, renderProps, setAddedFxParam, setOpField, setParamField,
  setSingleOp, withFastCommit,
} from './24-layer-ops-queue.js';
import { ENUM_LABELS } from './26-layer-create.js';
import { paramRow, renderGradientEditor, setLayerBlend, setLayerOpacity } from './27-gradient-editor.js';
import { mkEl, syncLayerControls } from './28-layer-props-transform.js';
import { PREVIEW_EFFECT_MULTI, previewCompositeDoc, renderStaticLayers } from './30-render.js';
import { TEXT_TOOLS, docTool, hexOf } from './31-selection-brush.js';
import { currentCursorName, dispPx, syncGizmoCursor, textHover } from './32-cursors-select-options.js';
import { effPathSubpaths, pathModel } from './44-vector-path.js';
import { PATH_EDIT_TOOLS, pathLook, tracePathSub } from './45-path-tools.js';
import { dispThr, drawGizmo, gizmo, toDoc } from './46-smart-filter-panel.js';
import {
  closeInlineText, layerTransformAffine, layoutInlineText, openInlineTextEditor, textDisplayMatrix,
} from './47-canvas-context-menu.js';
import {
  buildPsdBuffer, ensureStructuralBase, textBoxDrag, textEditAbsorbs, textIndexAt, textLayoutOf,
} from './48-info-export.js';
import {
  applyTextFont, effTextInfo, hasLocalFontApi, idbReq, idbTx, localFontPermission, renderTextLayer, resolveFont,
  textModelOf, userFontByPs, userFontsReady,
} from './49-fonts-text-model.js';
import {
  effTextWarp, queueTextDesc, textDescEdits, textDynamicOf, warpNumOf, warpStyleOf,
} from './52-alpha-text-menu.js';


const BLEND_BOOL_KEYS = { blendInterior: ['infx', false], blendClipped: ['clbl', true], transparencyShapes: ['tsly', true],
  layerMaskHidesEffects: ['lmgm', false], vectorMaskHidesEffects: ['vmgm', false] };
let blendAdvCache = null;
onDocumentCacheRelease(() => { blendAdvCache = null; });
const DEF_RANGE = [0, 0, 255, 255];
function blendAdvancedBase(i){
  if (!blendAdvCache || blendAdvCache.buf !== origBuffer) blendAdvCache = { buf: origBuffer, map: new Map() };
  if (blendAdvCache.map.has(i)) return blendAdvCache.map.get(i);
  const out = { channels: { r: true, g: true, b: true },
    blendIf: { gray: { this: DEF_RANGE.slice(), under: DEF_RANGE.slice() }, red: { this: DEF_RANGE.slice(), under: DEF_RANGE.slice() },
      green: { this: DEF_RANGE.slice(), under: DEF_RANGE.slice() }, blue: { this: DEF_RANGE.slice(), under: DEF_RANGE.slice() } } };
  for (const [f, [, def]] of Object.entries(BLEND_BOOL_KEYS)) out[f] = def;
  try {
    const L = parsePsdFull(origBuffer).layers[i], u8 = new Uint8Array(origBuffer);
    for (const [f, [key]] of Object.entries(BLEND_BOOL_KEYS)) {
      const b = L && (L.blocks || []).find(x => x.key === key && x.dataLength >= 1);
      if (b) out[f] = u8[b.dataOffset] !== 0;
    }
    const br = L && (L.blocks || []).find(x => x.key === 'brst');
    if (br) { const dv = new DataView(origBuffer, br.dataOffset, br.dataLength); for (let k = 0; k + 4 <= br.dataLength; k += 4) { const c = dv.getInt32(k); if (c === 0) out.channels.r = false; if (c === 1) out.channels.g = false; if (c === 2) out.channels.b = false; } }
    const bi = doc && doc.layers[i] && doc.layers[i].blendIf;
    if (bi) {
      if (bi.gray) out.blendIf.gray = { this: bi.gray.src.slice(), under: bi.gray.dst.slice() };
      ['red', 'green', 'blue'].forEach((n, k) => { const c = bi.channels && bi.channels[k]; if (c) out.blendIf[n] = { this: c.src.slice(), under: c.dst.slice() }; });
    }
  } catch (e) { console.warn('[混合选项] 读原值失败', e); }
  blendAdvCache.map.set(i, out);
  return out;
}
export function blendAdvanced(i){
  const base = blendAdvancedBase(i), op = findLayerOp(i, 'setBlendOptions') || {};
  const out = { ...base, channels: { ...base.channels, ...(op.channels || {}) }, blendIf: JSON.parse(JSON.stringify(base.blendIf)) };
  for (const f of Object.keys(BLEND_BOOL_KEYS)) if (op[f] !== undefined) out[f] = op[f];
  if (op.blendIf) for (const [k, v] of Object.entries(op.blendIf)) out.blendIf[k] = { ...out.blendIf[k], ...v };
  return out;
}





const LS_CTX = {
  $, mk: mkEl,
  get ENUM_LABELS(){ return ENUM_LABELS; },
  get BLEND_KEYS(){ return BLEND_KEYS; },
  get BLEND_LABELS(){ return BLEND_LABELS; },
  getLayerNode: i => (layerTree && layerTree.flat && layerTree.flat[i]) || null,
  layerName: i => layerRenames[i] || ((layerTree && layerTree.flat && layerTree.flat[i] || {}).name) || '',
  layerParams: i => layerParams(i),
  creatableFx: () => CREATABLE_FX,
  
  createEffectTemplate: canon => createEffectTemplate(canon),
  editStatus: () => ({ ready: !!EDITM, text: EDIT.statusText() }),
  kickEdit: () => kick(EDIT),
  
  patterns: () => (doc && Array.isArray(doc.patterns) ? doc.patterns : [])
    .filter(p => p && typeof p.id === 'string' && p.id && typeof p.name === 'string'),
  
  effectDescriptor: (i, key, at) => {
    const src = previewCompositeDoc(doc);
    const fx = src && src.layers[i] && src.layers[i].effects;
    if (!fx || typeof fx !== 'object') return null;
    const multi = fx[PREVIEW_EFFECT_MULTI[key]];
    if (Array.isArray(multi)) return multi[at || 0] || null;
    return fx[key] || null;
  },
  effParam: (i, target, at, path, base) => effParam(i, target, at, path, base),
  setParamField: (i, target, at, path, v, base) => setParamField(i, target, at, path, v, base),
  effFxEnabled: (i, key, at, base) => effFxEnabled(i, key, at, base),
  setSingleOp: (i, op, isOriginal) => setSingleOp(i, op, isOriginal),
  findLayerOp: (i, key) => findLayerOp(i, key),
  addedFxValue: (op, path) => addedFxValue(op, path),
  addedFxTemplateValue: (effect, path) => addedFxTemplateValue(effect, path),
  setAddedFxParam: (i, effect, path, v, base, seq) => setAddedFxParam(i, effect, path, v, base, seq),
  
  queuedAdds: (i, canon) => (layerOps[i] || []).filter(o => o.op === 'addLayerEffect' && o.effect === canon),
  
  nextAddSeq: (i, canon) => (layerOps[i] || []).reduce((m, o) =>
    (o.op === 'addLayerEffect' && o.effect === canon ? Math.max(m, (o.seq || 0) + 1) : m), 0),
  renderGradientEditor: (box, i, tgt, ui) => renderGradientEditor(box, i, tgt, ui),
  paramRow: (box, i, tgt, f, ui) => paramRow(box, i, tgt, f, ui),
  

  blend: {
    get(i){
      const l = (layerTree && layerTree.flat && layerTree.flat[i]) || {}, ed = layerEdits[i] || {};
      return { blendKey: ed.blendKey != null ? ed.blendKey : (l.blendKey || (l.isGroup ? 'pass' : 'norm')),
               opacity: ed.opacity != null ? ed.opacity : (l.opacity != null ? l.opacity : 255) };
    },
    setMode(i, k){ setLayerBlend(i, k); syncLayerControls(); },
    setOpacity(i, v){ setLayerOpacity(i, v); syncLayerControls(); },
    fillOpacity: i => effFillOpacity(i, (layerTree && layerTree.flat && layerTree.flat[i]) || {}),
    setFillOpacity(i, v){
      const l = (layerTree && layerTree.flat && layerTree.flat[i]) || {};
      const orig = l.fillOpacity != null ? l.fillOpacity : 255;
      return setSingleOp(i, { op: 'setFillOpacity', index: i, fillOpacity: v }, v === orig);
    },
    knockout: i => effKnockout(i, (layerTree && layerTree.flat && layerTree.flat[i]) || {}),
    setKnockout(i, v){
      const l = (layerTree && layerTree.flat && layerTree.flat[i]) || {};
      return setSingleOp(i, { op: 'setLayerKnockout', index: i, knockout: v }, v === (l.knockout || 0));
    },
    
    advanced: i => blendAdvanced(i),
    advancedBase: i => blendAdvancedBase(i),
    setAdvanced(i, field, value){
      const base = blendAdvancedBase(i)[field];
      const same = JSON.stringify(value) === JSON.stringify(base);
      return setOpField(i, { op: 'setBlendOptions' }, field, same ? base : value, base);
    },
  },
  

  snapshot: () => docSnapshot(),
  restore: snap => restoreDocSnapshot(snap),
  history: {
    push: label => pushDocHistory(label),
    lock: on => { set_docHistLock(!!on); },
    
    rollback(){
      docHistory.undo.pop();                 
      docHistory.redo.length = 0;
      if (histLog.items.length > 1) { histLog.items.pop(); histLog.cursor = histLog.items.length - 1; }
      syncHistoryPanel(); updateUndoButtons();
    },
  },
  
  fast: fn => withFastCommit(fn),
  lastError: () => { try { return $('#err').textContent || ''; } catch { return ''; } },
  
  shout: msg => { try { $('#err').textContent = msg || ''; } catch {} },
  afterEdit: () => { try { renderStaticLayers(); } catch {} },
  refresh: () => { try { renderLayerPanel(); renderProps(); renderStaticLayers(); } catch {} },
};
set_layerStyleLoader(() => import('../layer-style.js').then(m => set_layerStyleDlg(m.createLayerStyleDialog(LS_CTX))));

set_booted(true);    




(function psIconButtons(){
  const bar = document.querySelector('.optbar'); if (!bar) return;
  const TOGGLES = new Set(['selModeReplace', 'selModeAdd', 'selModeSubtract', 'selModeIntersect', 'zmIn', 'zmOut',
    'txBold', 'txItalic', 'tfLink', 'cropStraight', 'toolWarp', 'toolSplit']);
  const TOGGLE_GROUPS = ['#txAligns', '#tfRef', '#gdStyles'];
  const isIcon = b => {
    if (b.classList.contains('primary')) return false;
    const t = (b.textContent || '').trim();
    if (!t) return !!b.querySelector('svg,img,canvas,i');
    return t.length <= 2 && /^[^\w\u3400-\u9fff%＋－]+$/.test(t);   
  };
  const mark = () => {
    for (const b of bar.querySelectorAll('button')) {
      const ib = isIcon(b);
      if (ib !== b.classList.contains('ib')) b.classList.toggle('ib', ib);
      if (ib && !b.classList.contains('tg') && (TOGGLES.has(b.id) || TOGGLE_GROUPS.some(g => b.parentElement && b.parentElement.matches(g))
        || b.classList.contains('on') || b.classList.contains('active'))) b.classList.add('tg');
    }
  };
  mark();
  let q = 0;
  new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; mark(); }); })
    .observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})();




try { const m = document.getElementById('bootMask'); if (m) m.remove(); } catch {}













var textPathHover = null;        
var textPathDrag = null;         
export var showTargetPath = true;       
var glyphFontMemo = new Map();   
var glyphFontKnown = new Map();  


export function effTextPath(i){
  const q = textDescEdits[i];
  if (q && q.pathText !== undefined) return q.pathText;
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  return (L && L.text && L.text.pathText) || null;
}

export function layoutTextFor(i, model, api){
  const tp = effTextPath(i);
  if (tp && tp.sub) {
    if (model.orientation === 'vertical') return tp.type === 1 ? layoutAreaTextV(model, api, tp) : layoutPathTextV(model, api, tp);   
    return tp.type === 1 ? layoutAreaText(model, api, tp) : layoutPathText(model, api, tp);
  }
  const dyn = textDynamicOf(i);
  return dyn && model.box ? layoutDynamicText(model, api, dyn) : layoutRichText(model, api);
}

function textPathMatrix(i){
  const L = layerTree.flat[i];
  return textDisplayMatrix(i, effTextInfo(i, L));
}
const tpApply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
function tpInvert(M){
  const det = M[0] * M[3] - M[1] * M[2] || 1;
  return [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det, (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det];
}
const tpMapSub = (M, sub) => ({ closed: sub.closed !== false, knots: sub.knots.map(k => ({ anchor: tpApply(M, k.anchor), in: tpApply(M, k.in || k.anchor), out: tpApply(M, k.out || k.anchor) })) });



function textPathCandidates(){
  ensureDocPaths();
  const out = [];
  const act = activePath && getDocPath(activePath);
  if (act && act.subpaths && act.subpaths.length) out.push(...act.subpaths);
  if (selLayer >= 0 && !isTextLayer(selLayer) && !layerDeletes.has(selLayer)) {
    let s = null; try { s = effPathSubpaths(selLayer); } catch { s = null; }
    if (s && s.length) out.push(...s);
  }
  return out.filter(s => s && s.knots && s.knots.length > 1);
}
function tpPointInPoly(poly, x, y){
  let inside = false;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    const a = poly[k], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}

function textPathHit(pt){
  const subs = textPathCandidates(); if (!subs.length) return null;
  const thr = Math.max(dispThr(5), 0.5);
  let best = null;
  for (const sub of subs) {
    const segs = subSegments(sub); if (!segs.length) continue;
    const n = nearestOnSegs(segs, pt.x, pt.y);
    if (n.d <= thr && (!best || n.d < best.d)) best = { kind: 'path', sub, t: n.t, d: n.d };
  }
  if (best) return best;
  for (const sub of subs) {
    if (sub.closed === false) continue;
    if (tpPointInPoly(flattenSegs(subSegments(sub), 1), pt.x, pt.y)) return { kind: 'area', sub };
  }
  return null;
}

export function textPathCursor(){
  if (TEXT_TOOLS.has(docTool) && (docTool === 'text' || docTool === 'textVertical') && textPathHover && !textHover) {
    const v = docTool === 'textVertical';
    return textPathHover.kind === 'area' ? (v ? 'textAreaV' : 'textArea') : (v ? 'textPathV' : 'textPath');
  }
  if ((PATH_EDIT_TOOLS.has(docTool) || TEXT_TOOLS.has(docTool)) && textPathDrag) return textPathDrag.kind === 'start' || textPathDrag.kind === 'body' ? 'text' : 'moveSmall';
  return null;
}

function textPathTargetAt(i, pt, tool){
  const tp = effTextPath(i); if (!tp || !tp.sub) return null;
  const M = textPathMatrix(i), Mi = tpInvert(M);
  const q = tpApply(Mi, [pt.x, pt.y]);
  const scl = Math.hypot(M[0], M[1]) || 1, thr = Math.max(dispThr(7), 0.5) / scl;
  const segs = subSegments(tp.sub);
  if (tool === 'path') {                                   
    let hit = null, bd = thr;
    tp.sub.knots.forEach((k, ki) => {
      for (const part of ['anchor', 'in', 'out']) {
        const p = k[part] || k.anchor, d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d <= bd && (part === 'anchor' || d < bd * 0.99)) { bd = d; hit = { kind: 'knot', ki, part }; }
      }
    });
    if (hit) return hit;
  }
  if (tp.type === 2) {
    const mk = pathTextMarkers(tp);
    if (mk) {
      if (Math.hypot(mk.start.x - q[0], mk.start.y - q[1]) <= thr) return { kind: 'start' };
      if (Math.hypot(mk.end.x - q[0], mk.end.y - q[1]) <= thr) return { kind: 'end' };
    }
  }
  const n = nearestOnSegs(segs, q[0], q[1]);
  const size = (textModelOf(i, layerTree.flat[i]).runs[0] || {}).fontSize || 12;
  if (tp.type === 2 && n.d <= Math.max(thr, size)) return { kind: tool === 'pathSelect' && n.d <= thr ? 'move' : 'body', t: n.t };
  if (n.d <= thr) return { kind: 'move' };
  if (tp.type === 1 && tpPointInPoly(flattenSegs(segs, 1), q[0], q[1]) && tool === 'pathSelect') return { kind: 'move' };
  return null;
}


async function createPathTextAt(hit){
  const segs = subSegments(hit.sub);
  let at, spec;
  if (hit.kind === 'path') {
    const A = arcTable(segs), p = A.at(hit.t);
    at = { x: p.x, y: p.y };
    const n = segs.length, closed = hit.sub.closed !== false;
    
    spec = { type: 2, subDoc: hit.sub, range: [hit.t, closed ? hit.t : n], flip: false };
  } else {
    const b = segsBounds(segs);
    at = { x: b.left, y: b.top };
    spec = { type: 1, subDoc: hit.sub, range: null, flip: false };
  }
  return createTextLayerAt(at, { pathText: spec });
}

export function pathTextToTextSpace(i, spec){
  const Mi = tpInvert(textPathMatrix(i));
  return { type: spec.type, sub: tpMapSub(Mi, spec.subDoc), range: spec.range ? spec.range.slice() : null, flip: !!spec.flip };
}


function beginTextPathDrag(ev, pt, i, hit){
  if (!textEditAbsorbs(i)) pushDocHistory('路径文字');
  const tp = effTextPath(i);
  textPathDrag = { i, kind: hit.kind, ki: hit.ki, part: hit.part, p0: { ...pt }, orig: cloneOpValue(tp), seq: 0 };
  if (textOverlay && textOverlay.idx === i) { textOverlay.dirty = true; textOverlay.hold = true; }
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  syncGizmoCursor();
}
async function moveTextPathDrag(pt){
  const d = textPathDrag; if (!d) return;
  const i = d.i, M = textPathMatrix(i), Mi = tpInvert(M);
  const q = tpApply(Mi, [pt.x, pt.y]), q0 = tpApply(Mi, [d.p0.x, d.p0.y]);
  const next = cloneOpValue(d.orig);
  const segs = subSegments(next.sub), n = segs.length, closed = next.sub.closed !== false;
  if (d.kind === 'start' || d.kind === 'body' || d.kind === 'end') {
    const hit = nearestOnSegs(segs, q[0], q[1]);
    const r = next.range || [0, n];
    if (d.kind === 'end') r[1] = closed ? hit.t : Math.max(r[0] + 1e-3, hit.t);
    else {
      r[0] = closed ? hit.t : Math.min(hit.t, r[1] - 1e-3);
      
      const A = arcTable(segs), p = A.at(hit.t);
      const up = [Math.sin(p.ang), -Math.cos(p.ang)];
      const side = (q[0] - p.x) * up[0] + (q[1] - p.y) * up[1];
      const scl = Math.hypot(M[0], M[1]) || 1;
      const flipNow = d.orig.flip ? side > dispThr(10) / scl : side < -dispThr(10) / scl;
      next.flip = flipNow ? !d.orig.flip : d.orig.flip;
    }
    next.range = r;
  } else if (d.kind === 'knot') {
    const k = next.sub.knots[d.ki], ko = d.orig.sub.knots[d.ki];
    const dx = q[0] - q0[0], dy = q[1] - q0[1];
    if (d.part === 'anchor') {
      for (const part of ['anchor', 'in', 'out']) { const s = ko[part] || ko.anchor; k[part] = [s[0] + dx, s[1] + dy]; }
    } else {
      const s = ko[d.part]; k[d.part] = [s[0] + dx, s[1] + dy];
      
      const other = d.part === 'in' ? 'out' : 'in', o = ko[other];
      const a = ko.anchor, la = Math.hypot(o[0] - a[0], o[1] - a[1]), v = [a[0] - k[d.part][0], a[1] - k[d.part][1]], lv = Math.hypot(v[0], v[1]);
      const was = Math.hypot(s[0] - a[0], s[1] - a[1]);
      const colinear = la > 1e-6 && was > 1e-6 && Math.abs(((s[0] - a[0]) * (o[1] - a[1]) - (s[1] - a[1]) * (o[0] - a[0])) / (la * was)) < 0.02;
      if (colinear && lv > 1e-6) k[other] = [a[0] + v[0] / lv * la, a[1] + v[1] / lv * la];
    }
  } else if (d.kind === 'move') {
    const dx = q[0] - q0[0], dy = q[1] - q0[1];
    next.sub.knots = d.orig.sub.knots.map(k => ({ anchor: [k.anchor[0] + dx, k.anchor[1] + dy], in: [(k.in || k.anchor)[0] + dx, (k.in || k.anchor)[1] + dy], out: [(k.out || k.anchor)[0] + dx, (k.out || k.anchor)[1] + dy] }));
  }
  queueTextDesc(i, { pathText: next });
  if (layerTextEdits[i] == null) layerTextEdits[i] = layerTree.flat[i].text.content;
  const my = ++d.seq;
  drawGizmo();
  await renderTextLayer(i, layerTree.flat[i], { silent: true });
  if (my !== d.seq && textPathDrag) return;
  renderStaticLayers();
  if (textOverlay && textOverlay.idx === i) layoutInlineText();
  drawGizmo();
}
function endTextPathDrag(){
  const d = textPathDrag; textPathDrag = null;
  if (!d) return;
  if (textOverlay) { textOverlay.hold = false; try { textOverlay.ta.focus({ preventScroll: true }); } catch {} }
  renderLayerPanel(); renderProps(); updateUndoButtons(); drawGizmo(); syncGizmoCursor();
}

gizmo.addEventListener('pointerdown', ev => {
  if (ev.button !== 0 || li || !doc || zoomGest || birdEye) return;
  const pt = toDoc(ev);
  const pathTool = PATH_EDIT_TOOLS.has(docTool) && (docTool === 'pathSelect' || docTool === 'path');
  const textTool = docTool === 'text' || docTool === 'textVertical';
  const stop = () => { ev.stopImmediatePropagation(); ev.preventDefault(); };
  
  const i = textOverlay ? textOverlay.idx : selLayer;
  if (i >= 0 && isTextLayer(i) && effTextPath(i) && (pathTool || (textTool && (ev.metaKey || ev.ctrlKey)))) {
    const hit = textPathTargetAt(i, pt, pathTool ? docTool : 'pathSelect');
    if (hit) { stop(); beginTextPathDrag(ev, pt, i, hit); return; }
  }
  
  if (textTool && !ev.shiftKey) {
    if (textLayerAt(pt.x, pt.y) >= 0) return;
    const hit = textPathHit(pt);
    if (!hit) return;
    stop();
    if (textOverlay) closeInlineText(true);
    createPathTextAt(hit).then(() => { textPathHover = null; syncGizmoCursor(); drawGizmo(); });
  }
}, true);
gizmo.addEventListener('pointermove', ev => {
  if (textPathDrag) { ev.stopImmediatePropagation(); moveTextPathDrag(toDoc(ev)); return; }
  if (li || !doc || ev.buttons) return;
  if (docTool === 'text' || docTool === 'textVertical') {
    const pt = toDoc(ev);
    const h = textLayerAt(pt.x, pt.y) >= 0 ? null : textPathHit(pt);
    const k = h ? h.kind : null, was = textPathHover ? textPathHover.kind : null;
    textPathHover = h;
    if (k !== was) syncGizmoCursor();
  } else if (textPathHover) { textPathHover = null; }
}, true);
const tpUp = ev => { if (textPathDrag) { ev.stopImmediatePropagation(); endTextPathDrag(); } };
gizmo.addEventListener('pointerup', tpUp, true);
gizmo.addEventListener('pointercancel', tpUp, true);


export function drawTextPathGizmo(ctx){
  if (!doc || li) return;
  const i = textOverlay ? textOverlay.idx : selLayer;
  if (!(i >= 0) || !isTextLayer(i)) return;
  const tp = effTextPath(i); if (!tp || !tp.sub) return;
  const toolOn = TEXT_TOOLS.has(docTool) || PATH_EDIT_TOOLS.has(docTool) || (textOverlay && textOverlay.idx === i);
  if (!toolOn) return;
  const M = textPathMatrix(i);
  ctx.save();
  if (showTargetPath) {
    const sub = tpMapSub(M, tp.sub);
    ctx.lineWidth = dispPx(Math.max(0.5, +pathLook.width || 1)); ctx.strokeStyle = pathLook.color || '#0096ff';
    tracePathSub(ctx, sub); ctx.stroke();
    if (docTool === 'path') {                                
      const s = dispThr(5);
      ctx.lineWidth = dispPx(1);
      for (const k of sub.knots) {
        for (const h of [k.in, k.out]) if (Math.hypot(h[0] - k.anchor[0], h[1] - k.anchor[1]) > 1e-6) {
          ctx.beginPath(); ctx.moveTo(k.anchor[0], k.anchor[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
          ctx.beginPath(); ctx.arc(h[0], h[1], s / 2, 0, Math.PI * 2); ctx.fillStyle = pathLook.color || '#0096ff'; ctx.fill();
        }
        ctx.beginPath(); ctx.rect(k.anchor[0] - s / 2, k.anchor[1] - s / 2, s, s); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      }
    }
    if (tp.type === 2) {                                    
      const mk = pathTextMarkers(tp);
      if (mk) {
        const r = dispPx(4.5);
        for (const [m, isStart] of [[mk.start, true], [mk.end, false]]) {
          const [x, y] = tpApply(M, [m.x, m.y]);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
          ctx.lineWidth = dispPx(1); ctx.strokeStyle = '#000'; ctx.stroke();
          const a = Math.atan2(M[1] * Math.cos(m.ang) + M[3] * Math.sin(m.ang), M[0] * Math.cos(m.ang) + M[2] * Math.sin(m.ang));
          ctx.beginPath();
          if (isStart) { const ux = -Math.sin(a) * r * 1.9, uy = Math.cos(a) * r * 1.9; ctx.moveTo(x - ux, y - uy); ctx.lineTo(x + ux, y + uy); }
          else { ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); }
          ctx.stroke();
        }
      }
    }
  }
  if (textOverlay && textOverlay.idx === i && !textPathDrag && !textOverlay.rich) drawTextPathCaret(ctx, i, M);   
  ctx.restore();
}

function drawTextPathCaret(ctx, i, M){
  const T = textLayoutOf(i); if (!T || !T.lay) return;
  const k = textOverlay.ta.selectionStart || 0;
  const { lay, api } = T;
  let base = null, ang = 0, asc = 12, desc = 3;
  for (const ln of lay.lines) {
    asc = ln.ascent || asc; desc = ln.descent || desc;
    for (const p of ln.pieces) {
      if (k < p.from || k > p.to) continue;
      const src = T.model.text.slice(p.from, k);
      const w = src ? api.measure(src, p.run, p.scale) : 0;
      if (p.at) { base = [p.at[0] + Math.cos(p.rot || 0) * w, p.at[1] + Math.sin(p.rot || 0) * w]; ang = p.rot || 0; }
      else { base = [p.x + w, ln.y]; ang = 0; }
      if (k < p.to) break;
    }
    if (base && k <= (ln.pieces.length ? ln.pieces[ln.pieces.length - 1].to : 0)) break;
  }
  if (!base) {
    const tp = effTextPath(i), mk = tp && tp.type === 2 ? pathTextMarkers(tp) : null;
    if (mk) { base = [mk.start.x, mk.start.y]; ang = mk.start.ang; }
    else if (lay.lines[0]) base = [lay.lines[0].x, lay.lines[0].y];
    else return;
  }
  const up = [Math.sin(ang), -Math.cos(ang)];
  const a = tpApply(M, [base[0] + up[0] * asc, base[1] + up[1] * asc]), b = tpApply(M, [base[0] - up[0] * desc, base[1] - up[1] * desc]);
  const run0 = T.model.runs[0] || {}, c = run0.color || [0, 0, 0, 1];
  ctx.lineWidth = dispPx(1.2); ctx.strokeStyle = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}

export function layoutInlinePathText(o){
  const T = textLayoutOf(o.idx); if (!T) return;
  const b = T.lay.bounds || { left: 0, top: 0, right: 20, bottom: 20 };
  const M = textPathMatrix(o.idx), z = zoom || 1;
  const run0 = T.model.runs[0] || { fontSize: 12 };
  Object.assign(o.ta.style, {
    writingMode: 'horizontal-tb', left: '0px', top: '0px', transformOrigin: '0 0',
    width: Math.ceil(Math.max(20, b.right - b.left)) + 'px', height: Math.ceil(Math.max(20, b.bottom - b.top)) + 'px',
    font: `${Math.max(1, Math.min(64, run0.fontSize || 12))}px sans-serif`, lineHeight: 'normal', letterSpacing: '0px', textIndent: '0px',
    whiteSpace: 'pre-wrap', caretColor: 'transparent', color: 'transparent',
    transform: `matrix(${M[0] * z},${M[1] * z},${M[2] * z},${M[3] * z},${(M[4] + M[0] * b.left + M[2] * b.top + padL()) * z},${(M[5] + M[1] * b.left + M[3] * b.top + padT()) * z})`,
  });
  o.lastZoom = z;
  markInlineRich(o, null, null, true);                     
  drawGizmo();
}


function glyphFontFor(ps){
  if (!ps) return Promise.resolve(null);
  const key = String(ps).toLowerCase();
  if (glyphFontMemo.has(key)) return glyphFontMemo.get(key);
  const p = (async () => {
    const pick = u8 => {
      let faces = [u8];
      try { if (fontKind(u8) === 'ttc') faces = splitFonts(u8); } catch {}
      const hit = faces.find(f => { try { return (readFontNames(f)[0] || {}).ps?.toLowerCase() === key; } catch { return false; } }) || faces[0];
      return openFont(hit);
    };
    try {
      await userFontsReady;
      const uf = userFontByPs(ps);
      if (uf) {
        const bytes = await idbTx(['bytes'], 'readonly', tx => idbReq(tx.objectStore('bytes').get(uf.id)));
        if (bytes) { const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes); if (fontKind(u8) === 'sfnt' || fontKind(u8) === 'ttc') return pick(u8); }
      }
    } catch {  }
    try {
      if (hasLocalFontApi() && await localFontPermission() === 'granted') {
        const list = await window.queryLocalFonts({ postscriptNames: [ps] });
        const fd = list.find(f => String(f.postscriptName).toLowerCase() === key) || list[0];
        if (fd) { const u8 = new Uint8Array(await (await fd.blob()).arrayBuffer()); return pick(u8); }
      }
    } catch {  }
    return null;
  })().then(f => { glyphFontKnown.set(key, !!f); return f; }, () => { glyphFontKnown.set(key, false); return null; });
  glyphFontMemo.set(key, p);
  return p;
}

function textLayerFontNames(i){
  const L = layerTree.flat[i], model = textModelOf(i, L); if (!model) return [];
  const sub = textFontSubst[i];
  return [...new Set(model.runs.map(r => (sub && (!r.font || r.font === L.text.font)) ? sub.psName : r.font).filter(Boolean))];
}

export function glyphOutlineWhy(i){
  if (!(i >= 0) || !isTextLayer(i)) return '先选中一个文字图层';
  const names = textLayerFontNames(i);
  if (!names.length) return '这一层没有记录字体';
  const missing = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (!glyphFontKnown.has(k)) { glyphFontFor(n); return `正在读取字体「${n}」的轮廓…（稍候再打开菜单）`; }
    if (!glyphFontKnown.get(k)) missing.push(n);
  }
  if (missing.length) return `拿不到字体「${missing.join('、')}」的字体文件：浏览器不给网页读系统字体的文件（「本地字体访问」没有授权 / 浏览器不支持）。`
    + '可以在字体下拉里「读取全部本机字体」授权，或把这款字体文件（TTF / OTF / TTC）上传进本编辑器（缺字体对话框 / 字符面板的上传字体），再来转换';
  return '';
}





async function textToOutlineSubpaths(i){
  const L = layerTree.flat[i], info = effTextInfo(i, L);
  const T = textLayoutOf(i); if (!T) throw new Error('这一层排不出版');
  const { lay, model } = T;
  const sub = textFontSubst[i];
  const fontOf = run => glyphFontFor((sub && (!run.font || run.font === L.text.font)) ? sub.psName : run.font);
  const Tx = (info.transform || [1, 0, 0, 1, 0, 0]).slice(0, 6);
  const glyphs = [];                                     
  let missing = 0;
  for (const ln of lay.lines) for (const p of ln.pieces) {
    if (!p.text || !p.body && !/\S/.test(p.text)) continue;
    const run = p.run, font = await fontOf(run);
    if (!font) { missing++; continue; }
    const size = run.fontSize * (p.scale || 1), k = size / font.unitsPerEm;
    const hs = (run.hScale || 1) * (p.sx || 1), vs = run.vScale || 1, trk = (run.tracking || 0) / 1000 * size;   
    const cps = Array.from(p.text);
    const gids = cps.map(ch => font.glyphIndex(ch.codePointAt(0)));
    let adv = gids.map((g, n) => font.advance(g) * k * hs + trk + (n + 1 < gids.length && run.autoKern !== false ? font.kern(g, gids[n + 1]) * k * hs : 0));
    const sum = adv.reduce((a, b) => a + b, 0);
    if (sum > 0 && p.w > 0 && p.w / sum > 0.8 && p.w / sum < 1.25) adv = adv.map(a => a * p.w / sum);   
    const skew = run.fauxItalic ? Math.tan(12 * Math.PI / 180) : 0;
    const c = p.at ? Math.cos(p.rot || 0) : 1, s = p.at ? Math.sin(p.rot || 0) : 0;
    const ox = p.at ? p.at[0] : p.x, oy = p.at ? p.at[1] : ln.y;
    let pen = 0;
    gids.forEach((g, n) => {
      const cubics = outlineToCubics(font.outline(g));
      const map = ([gx, gy]) => {
        const lx = pen + gx * k * hs + gy * k * vs * skew, ly = -gy * k * vs - (p.rise || 0);
        return [ox + lx * c - ly * s, oy + lx * s + ly * c];
      };
      if (cubics.length) glyphs.push(cubics.map(kn => kn.map(q => ({ anchor: map(q.anchor), in: map(q.in), out: map(q.out) }))));
      pen += adv[n];
    });
  }
  if (!glyphs.length) throw new Error(missing ? '拿不到这一层字体的字体文件，取不出字形轮廓' : '这一层没有可见的字');
  
  let all = glyphs.map(g => g.map(kn => kn.map(q => ({ anchor: tpApply(Tx, q.anchor), in: tpApply(Tx, q.in), out: tpApply(Tx, q.out) }))));
  
  const wp = effTextWarp(i);
  if (wp && warpStyleOf(wp) !== 'warpNone') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of all) for (const kn of g) for (const q of kn) { x0 = Math.min(x0, q.anchor[0]); x1 = Math.max(x1, q.anchor[0]); y0 = Math.min(y0, q.anchor[1]); y1 = Math.max(y1, q.anchor[1]); }
    const bw = x1 - x0, bh = y1 - y0;
    if (bw > 1 && bh > 1) {
      const f = warpMap({ style: warpStyleOf(wp), bend: warpNumOf(wp, 'warpValue') / 100, h: warpNumOf(wp, 'warpPerspective') / 100,
        v: warpNumOf(wp, 'warpPerspectiveOther') / 100, vertical: (wp.warpRotate && wp.warpRotate.value) === 'Vrtc', aspect: bw / bh });
      const W = p => { const [u, v] = f((p[0] - x0) / bw, (p[1] - y0) / bh); return [x0 + u * bw, y0 + v * bh]; };
      all = all.map(g => g.map(kn => kn.map(q => ({ anchor: W(q.anchor), in: W(q.in), out: W(q.out) }))));
    }
  }
  const U = layerTransformAffine(i);
  if (U) all = all.map(g => g.map(kn => kn.map(q => ({ anchor: tpApply(U, q.anchor), in: tpApply(U, q.in), out: tpApply(U, q.out) }))));
  


  const subs = [];
  const areaOf = poly => { let a = 0; for (let k = 0, n = poly.length; k < n; k++) { const p = poly[k], q = poly[(k + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  for (const g of all) {
    const areas = g.map(kn => areaOf(flattenSegs(subSegments({ closed: true, knots: kn }), 1)));
    let big = 0; areas.forEach((a, k) => { if (Math.abs(a) > Math.abs(areas[big])) big = k; });
    const sg = Math.sign(areas[big]) || 1;
    const fills = [], holes = [];
    g.forEach((kn, k) => (Math.sign(areas[k]) === sg ? fills : holes).push(kn));
    for (const kn of fills) subs.push({ closed: true, operation: 1, knots: kn });
    for (const kn of holes) subs.push({ closed: true, operation: 2, knots: kn });
  }
  return { subs, missing };
}
export async function createWorkPathFromText(i = selLayer){
  const why = glyphOutlineWhy(i);
  if (why && !why.startsWith('正在读取')) { $('#notice').textContent = why; shell.status(why); return false; }
  for (const n of textLayerFontNames(i)) await glyphFontFor(n);
  let r;
  try { r = await textToOutlineSubpaths(i); } catch (e) { $('#err').textContent = '创建工作路径没能完成：' + (e.message || e); return false; }
  ensureDocPaths();
  pushDocHistory('创建工作路径');
  set_workPath({ subpaths: r.subs }); set_workPathDirty(true); set_activePath('work');
  afterWorkPathChange();
  const msg = `已从文字创建工作路径（${r.subs.length} 条子路径）` + (r.missing ? `；${r.missing} 段缺字体文件，已跳过` : '');
  $('#notice').textContent = msg; shell.status(msg);
  return true;
}
export async function convertTextToShape(i = selLayer){
  if (li || !doc || !origBuffer) return false;
  const why = glyphOutlineWhy(i);
  if (why && !why.startsWith('正在读取')) { $('#notice').textContent = why; shell.status(why); return false; }
  for (const n of textLayerFontNames(i)) await glyphFontFor(n);
  let r;
  try { r = await textToOutlineSubpaths(i); } catch (e) { $('#err').textContent = '转换为形状没能完成：' + (e.message || e); return false; }
  if (!await ensureLazy(EDIT, '转换为形状')) return false;
  const L = layerTree.flat[i], model = textModelOf(i, L);
  const c = (model.runs[0] && model.runs[0].color) || [0, 0, 0, 1];
  const color = hexOf(c.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v * 255)))));
  const name = layerRenames[i] != null ? layerRenames[i] : (L.name || '形状');
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    
    const res = applyEdits(base, [
      { op: 'addShapeLayer', at: i + 1, name, color, subpaths: r.subs.map(s => ({ closed: true, operation: s.operation === 2 ? 'subtract' : 'combine', knots: s.knots })) },
      { op: 'deleteLayer', index: i },
    ]);
    await initDocument(res.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(i, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '转换为形状');
    const msg = `已把文字转换为形状图层「${name}」（${r.subs.length} 条子路径）` + (r.missing ? `；${r.missing} 段缺字体文件，已跳过` : '');
    $('#notice').textContent = msg; shell.status(msg);
    return true;
  } catch (e) {
    $('#err').textContent = '转换为形状没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}


actions.register('view.showTargetPath', { run: () => { showTargetPath = !showTargetPath; drawGizmo(); shell.status(showTargetPath ? '显示目标路径' : '隐藏目标路径（⇧⌘H 再显示）'); },
  enabled: () => !!doc, checked: () => showTargetPath });




(function warpPresetBar(){
  const host = $('#grpMesh'); if (!host || $('#wpStyle')) return;
  const wrap = document.createElement('span'); wrap.className = 'seg'; wrap.id = 'wpPresetWrap';
  wrap.title = '变形预设：与「文字变形」同一套网格公式（选中后可继续拖控制点 = 自定）';
  const sel = document.createElement('select'); sel.id = 'wpStyle'; sel.style.width = '82px';
  sel.append(Object.assign(document.createElement('option'), { value: 'warpCustom', textContent: '自定' }));
  for (const [v, t] of WARP_STYLES) if (v !== 'warpNone') sel.append(Object.assign(document.createElement('option'), { value: v, textContent: t }));
  const num = (id, label, val) => { const s = document.createElement('span'); s.className = 'seg'; s.textContent = label + ' ';
    const n = document.createElement('input'); n.type = 'number'; n.id = id; n.min = '-100'; n.max = '100'; n.step = '1'; n.value = String(val); n.style.width = '52px';
    s.append(n, document.createTextNode('%')); return [s, n]; };
  const [sb, nb] = num('wpBend', '弯曲', 50), [sh, nh] = num('wpH', 'H', 0), [sv, nv] = num('wpV', 'V', 0);
  const rot = document.createElement('button'); rot.id = 'wpRotate'; rot.type = 'button'; rot.textContent = '⇄'; rot.title = '更改变形方向（水平 / 垂直）';
  let vertical = false, base = null;
  wrap.append('变形 ', sel);
  host.insertBefore(rot, host.firstChild); host.insertBefore(sv, host.firstChild); host.insertBefore(sh, host.firstChild); host.insertBefore(sb, host.firstChild); host.insertBefore(wrap, host.firstChild);
  const apply = () => {
    if (!li || li.deform || !li.points) return;
    const style = sel.value;
    if (style === 'warpCustom') { base = null; return; }
    if (!base) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of li.points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      base = { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    }
    pushHistory();
    const P = warpMesh({ style, bend: (+nb.value || 0) / 100, h: (+nh.value || 0) / 100, v: (+nv.value || 0) / 100, vertical }, base.w, base.h);
    li.points = P.map(p => ({ x: base.x0 + p[0], y: base.y0 + p[1] })); li.xn = 4; li.yn = 4; li.sliceX = []; li.sliceY = [];
    commit(); drawGizmo();
  };
  sel.onchange = () => { base = null; apply(); };
  for (const n of [nb, nh, nv]) n.onchange = apply;
  rot.onclick = () => { vertical = !vertical; apply(); };
  const sync = () => { const on = !!li && !li.deform; for (const el of [wrap, sb, sh, sv, rot]) el.hidden = !on; const dis = sel.value === 'warpCustom'; for (const n of [nb, nh, nv]) n.disabled = dis; rot.disabled = dis; };
  sel.addEventListener('change', sync);
  new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  setInterval(() => { const on = !!li && !li.deform; if (wrap.hidden === on) sync(); if (!li) { sel.value = 'warpCustom'; base = null; } }, 500);
  sync();
})();

if (typeof window !== 'undefined' && window.__psd_editor) window.__psd_editor.textPath = {
  eff: i => effTextPath(i), hit: (x, y) => { const h = textPathHit({ x, y }); return h && { kind: h.kind, t: h.t }; },
  createAt: (x, y) => { const h = textPathHit({ x, y }); return h ? createPathTextAt(h) : false; },
  target: (i, x, y, tool) => textPathTargetAt(i, { x, y }, tool),
  markers: i => { const tp = effTextPath(i); if (!tp) return null; const m = pathTextMarkers(tp); if (!m) return null; const M = textPathMatrix(i);
    return { start: tpApply(M, [m.start.x, m.start.y]), end: tpApply(M, [m.end.x, m.end.y]), range: tp.range, flip: tp.flip }; },
  layout: i => { const T = textLayoutOf(i); return T && { n: T.lay.lines.length, overflow: T.lay.overflow, pieces: T.lay.lines.reduce((a, l) => a + l.pieces.length, 0), bounds: T.lay.bounds,
    lines: T.lay.lines.map(l => ({ y: l.y, x: l.x, w: l.w, text: l.pieces.map(p => p.text).join('') })) }; },
  outline: async i => { for (const n of textLayerFontNames(i)) await glyphFontFor(n); const r = await textToOutlineSubpaths(i); return { n: r.subs.length, missing: r.missing, knots: r.subs.reduce((a, s) => a + s.knots.length, 0), subtract: r.subs.filter(s => s.operation === 2).length }; },
  why: i => glyphOutlineWhy(i),
  createWorkPath: i => createWorkPathFromText(i), convertToShape: i => convertTextToShape(i),
  get showTarget(){ return showTargetPath; },
  get cursor(){ return currentCursorName(); },
  warpMesh: (o, w, h) => warpMesh(o, w, h),
  setFont: async (i, ps) => { const r = await resolveFont(ps); return r.ok ? applyTextFont(i, { css: r.css, psName: ps, family: r.family, style: r.style }) : false; },
  drag: async (i, kind, x, y) => { textPathDrag = null; const hit = typeof kind === 'string' ? { kind } : kind; beginTextPathDrag({ pointerId: 1 }, { x, y }, i, hit); return true; },
  dragTo: (x, y) => moveTextPathDrag({ x, y }), dragEnd: () => endTextPathDrag(),
  
  build: async () => new Uint8Array((await buildPsdBuffer()).buf),
  setWork: subs => { ensureDocPaths(); set_workPath({ subpaths: cloneOpValue(subs) }); set_workPathDirty(true); set_activePath('work'); afterWorkPathChange(); drawGizmo(); return true; },
  caret: () => { const o = textOverlay; if (!o) return null; const T = textLayoutOf(o.idx); if (!T) return null; const M = textDisplayMatrix(o.idx, T.info);
    const P = q => [M[0] * q[0] + M[2] * q[1] + M[4], M[1] * q[0] + M[3] * q[1] + M[5]];
    const a = o.ta.selectionStart, b = o.ta.selectionEnd, c = caretSegment(T.lay, T.model, T.api, a);
    return { rich: !!o.rich, a, b, seg: c && [P(c.a), P(c.b)], quads: selectionQuads(T.lay, T.model, T.api, a, b).map(q => q.map(P)) }; },
  vlayout: i => { const T = textLayoutOf(i); return T && { vertical: !!T.lay.vertical, pathText: !!T.lay.pathText, areaText: !!T.lay.areaText, overflow: T.lay.overflow, bounds: T.lay.bounds,
    pieces: T.lay.lines.flatMap(l => l.pieces.map(p => ({ t: p.text, from: p.from, to: p.to, at: p.at, rot: p.rot, x: p.x, y: l.y, fr: p.fr && { o: p.fr.o, d: p.fr.d, len: p.fr.len } }))) }; },
};








export var LB;                              
export function set_LB(v) { return (LB = v); }   
export var CPP;                             
export function set_CPP(v) { return (CPP = v); }   
export var TXP;                             
export function set_TXP(v) { return (TXP = v); }   
var otFaceMemo = new Map();          
var optKernMemo = new Map();         
var sheetsByDoc = new WeakMap();     


export function otFamilySync(run, css){
  const fs = otFeatureCss(run); if (!fs || !css) return css;
  const m = otFaceMemo.get((run.font || '') + '|' + css + '|' + fs);
  if (m) return m.ready ? m.fam : css;
  otFamilyAsync(run, css).then(f => { if (f !== css) { const i = textOverlay ? textOverlay.idx : -1; if (i >= 0) { layoutInlineText(); drawGizmo(); } } });
  return css;
}
export async function otFamilyAsync(run, css){
  const fs = otFeatureCss(run); if (!fs || !css) return css;
  const key = (run.font || '') + '|' + css + '|' + fs;
  let m = otFaceMemo.get(key);
  if (!m) {
    m = { fam: 'fpot' + (otFaceMemo.size + 1), ready: false };
    m.p = (async () => {
      let src = null;
      try {                                                   
        await userFontsReady;
        const uf = run.font && userFontByPs(run.font);
        if (uf) { const b = await idbTx(['bytes'], 'readonly', tx => idbReq(tx.objectStore('bytes').get(uf.id))); if (b) src = b instanceof ArrayBuffer ? b : (b.buffer ? b.buffer.slice(b.byteOffset || 0, (b.byteOffset || 0) + b.byteLength) : b); }
      } catch { src = null; }
      const q = v => '"' + String(v).replace(/"/g, '') + '"';
      const face = new FontFace(m.fam, src || [run.font && `local(${q(run.font)})`, `local(${q(css)})`].filter(Boolean).join(', '), { featureSettings: fs });
      await face.load(); document.fonts.add(face); m.ready = true;
    })().catch(() => { m.failed = true; });
    otFaceMemo.set(key, m);
  }
  await m.p;
  return m.ready ? m.fam : css;
}


export function opticalKernOf(ps){ const m = ps && optKernMemo.get(String(ps).toLowerCase()); return (m && m.fn) || null; }
export async function opticalKernReady(ps){
  const k = String(ps).toLowerCase();
  let m = optKernMemo.get(k);
  if (!m) { m = { fn: null }; m.p = glyphFontFor(ps).then(f => { m.fn = f ? opticalKerner(f) : null; }, () => {}); optKernMemo.set(k, m); }
  await m.p; return m.fn;
}
export function opticalKernSum(ok, t){
  const cps = Array.from(String(t), c => c.codePointAt(0));
  let s = 0; for (let k = 0; k + 1 < cps.length; k++) s += ok(cps[k], cps[k + 1]);
  return s;
}

export function drawTextGlyphwise(ctx, text, run, fs, ok){
  const cps = Array.from(String(text));
  const rot = (+run.charRotate || 0) * Math.PI / 180;
  let x = 0;
  cps.forEach((ch, k) => {
    const w = ctx.measureText(ch).width;
    if (rot) { ctx.save(); ctx.translate(x + w / 2, -fs * 0.35); ctx.rotate(rot); ctx.fillText(ch, -w / 2, fs * 0.35); ctx.restore(); }
    else ctx.fillText(ch, x, 0);
    if (run.emphasis && /\S/.test(ch)) {                     
      const cx = x + w / 2 - (run.tracking || 0) / 2000 * fs, cy = -fs * 1.02, r = Math.max(0.6, fs * 0.075);
      ctx.beginPath();
      if (run.emphasis === 'sesame') { ctx.ellipse(cx, cy, r * 0.7, r * 1.3, 0.5, 0, Math.PI * 2); ctx.fill(); }
      else if (run.emphasis === 'circle') { ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2); ctx.save(); ctx.lineWidth = Math.max(0.5, fs * 0.03); ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); ctx.restore(); }
      else { ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    }
    x += w + (ok && k + 1 < cps.length ? ok(ch.codePointAt(0), cps[k + 1].codePointAt(0)) * fs : 0);
  });
}


export async function fontBytesFor(ps){
  if (!ps) return null;
  const key = String(ps).toLowerCase();
  const pick = u8 => {
    let faces = [u8];
    try { if (fontKind(u8) === 'ttc') faces = splitFonts(u8); } catch {}
    return faces.find(f => { try { return (readFontNames(f)[0] || {}).ps?.toLowerCase() === key; } catch { return false; } }) || faces[0];
  };
  try {
    await userFontsReady;
    const uf = userFontByPs(ps);
    if (uf) {
      const bytes = await idbTx(['bytes'], 'readonly', tx => idbReq(tx.objectStore('bytes').get(uf.id)));
      if (bytes) { const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes); if (fontKind(u8) === 'sfnt' || fontKind(u8) === 'ttc') return pick(u8); }
    }
  } catch {}
  try {
    if (hasLocalFontApi() && await localFontPermission() === 'granted') {
      const list = await window.queryLocalFonts({ postscriptNames: [ps] });
      const fd = list.find(f => String(f.postscriptName).toLowerCase() === key) || list[0];
      if (fd) return pick(new Uint8Array(await (await fd.blob()).arrayBuffer()));
    }
  } catch {}
  return null;
}

export async function textInsertAtCaret(str){
  if (!textOverlay) {
    if (!(selLayer >= 0 && isTextLayer(selLayer))) return false;
    await openInlineTextEditor(selLayer);
    if (!textOverlay) return false;
    const n = textOverlay.ta.value.length; textOverlay.ta.setSelectionRange(n, n);
  }
  const ta = textOverlay.ta;
  try { ta.focus({ preventScroll: true }); } catch {}
  ta.setRangeText(str, ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}


const richSig = r => [r.font, r.css, r.fontSize, r.tracking, r.hScale, r.vScale, r.baselineShift, r.caps, r.baseline, r.fauxBold, r.fauxItalic, r.kernMode, r.charRotate, r.tcy].join('|');
export function markInlineRich(o, model, info, force){
  

  const rich = !!force || !!(model && info && (info.orientation === 'vertical' || (model.runs.length > 1 && new Set(model.runs.map(richSig)).size > 1)));
  if (rich !== !!o.rich) { o.rich = rich; o.ta.classList.toggle('rich', rich); }
  if (rich) drawGizmo();
}

function textCaretAt(T, k){
  const { lay, api, model } = T;
  let hit = null;
  for (const ln of lay.lines) {
    if (!ln.pieces.length) { if (k === ln.from) hit = { x: ln.x, y: ln.y, asc: ln.ascent, desc: ln.descent }; continue; }
    const first = ln.pieces[0].from, last = ln.pieces[ln.pieces.length - 1].to;
    if (k < first || k > last) continue;
    for (const p of ln.pieces) {
      if (k < p.from || k > p.to) continue;
      const w = k > p.from ? api.measure(model.text.slice(p.from, k), p.run, p.scale) : 0;
      hit = { x: p.x + w, y: ln.y, asc: ln.ascent, desc: ln.descent };
      if (k < p.to) break;
    }
    if (hit && k < last) break;
  }
  if (!hit && lay.lines.length) { const ln = lay.lines[lay.lines.length - 1]; hit = { x: ln.x + ln.w, y: ln.y, asc: ln.ascent, desc: ln.descent }; }
  return hit;
}
export function drawTextRichCaret(ctx){
  const o = textOverlay; if (!o || !o.rich || textBoxDrag) return;
  const T = textLayoutOf(o.idx); if (!T || !T.lay) return;
  const M = textDisplayMatrix(o.idx, T.info);
  const P = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const len = T.model.text.length;
  const a = Math.min(o.ta.selectionStart || 0, len), b = Math.min(o.ta.selectionEnd || 0, len);
  if (T.lay.vertical || T.lay.pathText || T.lay.areaText) { drawTextFrameCaret(ctx, o, T, P, a, b); return; }
  ctx.save();
  if (a < b) {
    ctx.fillStyle = 'rgba(0,120,255,.35)';
    for (const ln of T.lay.lines) for (const p of ln.pieces) {
      const s0 = Math.max(a, p.from), s1 = Math.min(b, p.to); if (s1 <= s0) continue;
      const x0 = p.x + (s0 > p.from ? T.api.measure(T.model.text.slice(p.from, s0), p.run, p.scale) : 0);
      const x1 = p.x + T.api.measure(T.model.text.slice(p.from, s1), p.run, p.scale);
      const q = [P(x0, ln.y - ln.ascent), P(x1, ln.y - ln.ascent), P(x1, ln.y + ln.descent), P(x0, ln.y + ln.descent)];
      ctx.beginPath(); q.forEach((pt, n) => n ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.closePath(); ctx.fill();
    }
  } else if (document.activeElement === o.ta) {
    const c = textCaretAt(T, a); if (c) {
      const r = (T.model.runs.find(q => a > q.from && a <= q.to) || T.model.runs[0] || {}).color || [0, 0, 0, 1];
      const p0 = P(c.x, c.y - c.asc), p1 = P(c.x, c.y + c.desc);
      ctx.lineWidth = dispPx(1.2); ctx.strokeStyle = `rgb(${Math.round(r[0] * 255)},${Math.round(r[1] * 255)},${Math.round(r[2] * 255)})`;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
  }
  ctx.restore();
}


function drawTextFrameCaret(ctx, o, T, P, a, b){
  ctx.save();
  if (a < b) {
    ctx.fillStyle = 'rgba(0,120,255,.35)';
    for (const q of selectionQuads(T.lay, T.model, T.api, a, b)) {
      ctx.beginPath(); q.forEach((pt, n) => { const d = P(pt[0], pt[1]); n ? ctx.lineTo(d[0], d[1]) : ctx.moveTo(d[0], d[1]); }); ctx.closePath(); ctx.fill();
    }
  } else if (document.activeElement === o.ta || effTextPath(o.idx)) {
    const c = caretSegment(T.lay, T.model, T.api, a);
    if (c) {
      const r = (T.model.runs.find(q => a > q.from && a <= q.to) || T.model.runs[0] || {}).color || [0, 0, 0, 1];
      const p0 = P(c.a[0], c.a[1]), p1 = P(c.b[0], c.b[1]);
      ctx.lineWidth = dispPx(1.2); ctx.strokeStyle = `rgb(${Math.round(r[0] * 255)},${Math.round(r[1] * 255)},${Math.round(r[2] * 255)})`;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
  }
  ctx.restore();
}

export function bindRichTextPointer(ta, idxOf){
  let anchor = -1;
  const idxAt = e => { const i = idxOf(); return i >= 0 ? textIndexAt(i, toDoc(e)) : 0; };
  ta.addEventListener('pointerdown', e => {
    if (!textOverlay || !textOverlay.rich || e.button !== 0 || e.metaKey || e.ctrlKey || e.defaultPrevented || textBoxDrag) return;
    e.preventDefault();
    const k = idxAt(e), len = ta.value.length;
    if (e.detail === 2) {                                   
      let a = k, b = k;
      try {
        const seg = new Intl.Segmenter('zh', { granularity: 'word' });
        for (const s2 of seg.segment(ta.value)) if (k >= s2.index && k <= s2.index + s2.segment.length) { a = s2.index; b = s2.index + s2.segment.length; if (s2.isWordLike) break; }
      } catch { }
      ta.setSelectionRange(a, Math.min(len, b)); anchor = -1; drawGizmo(); return;
    }
    if (e.detail >= 3) return;                              
    if (e.shiftKey) { const s0 = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart; anchor = s0; }
    else anchor = k;
    ta.setSelectionRange(Math.min(anchor, k), Math.max(anchor, k), k < anchor ? 'backward' : 'forward');
    try { ta.setPointerCapture(e.pointerId); } catch {}
    drawGizmo();
  });
  ta.addEventListener('pointermove', e => {
    if (anchor < 0 || !(e.buttons & 1)) return;
    const k = idxAt(e);
    ta.setSelectionRange(Math.min(anchor, k), Math.max(anchor, k), k < anchor ? 'backward' : 'forward');
    drawGizmo();
  });
  const up = () => { anchor = -1; if (textOverlay && textOverlay.rich) { drawGizmo(); try { syncTextBar(); } catch {} } };
  ta.addEventListener('pointerup', up); ta.addEventListener('pointercancel', up);
  for (const ev of ['keyup', 'select', 'focus', 'blur']) ta.addEventListener(ev, () => { if (textOverlay && textOverlay.rich) drawGizmo(); });
  
  let q = 0;
  const follow = () => { if (q) return; q = requestAnimationFrame(() => { q = 0; if (!textOverlay || textOverlay.ta !== ta) return; try { syncTextBar(); renderProps(); } catch {} if (TXP) TXP.refresh(); }); };
  ta.addEventListener('keyup', e => { if (/^(Arrow|Home|End|Page)/.test(e.key) || e.shiftKey) follow(); });
  ta.addEventListener('pointerup', follow);
  
  ta.addEventListener('compositionstart', () => { if (textOverlay) textOverlay.composing = true; });
  ta.addEventListener('compositionend', () => { if (textOverlay) { textOverlay.composing = false; drawGizmo(); } });
}
document.addEventListener('selectionchange', () => { if (textOverlay && textOverlay.rich && document.activeElement === textOverlay.ta) drawGizmo(); });


export function textSheets(){
  if (!doc || !sheetsByDoc) return { char: [], para: [] };
  let st = sheetsByDoc.get(doc);
  if (!st) {
    st = { char: [], para: [], kinsoku: [], dirty: false };
    const L = ((layerTree && layerTree.flat) || []).find(f => f && f.text && f.text.engineData);
    if (L) { try { const r = readStyleSheets(L.text.engineData); st.char = r.char; st.para = r.para; st.kinsoku = r.kinsoku || []; } catch {} }
    sheetsByDoc.set(doc, st);
  }
  return st;
}
export function textSheetsSnap(){ if (!doc || !sheetsByDoc) return null; const st = sheetsByDoc.get(doc); return st ? cloneOpValue(st) : null; }
export function textSheetsRestore(v){ if (!doc || !sheetsByDoc) return; if (v) sheetsByDoc.set(doc, cloneOpValue(v)); else sheetsByDoc.delete(doc); if (TXP) TXP.refresh(); }
export function textSheetsForExport(){
  if (!doc || !sheetsByDoc) return null;
  const st = sheetsByDoc.get(doc);
  return st && st.dirty ? { char: st.char, para: st.para, kinsoku: st.kinsoku || [] } : null;
}
export function setTextSheets(next, label){
  pushDocHistory(label || '文字样式');
  sheetsByDoc.set(doc, { char: (next.char || []).map(x => ({ name: x.name, attrs: { ...x.attrs } })), para: (next.para || []).map(x => ({ name: x.name, attrs: { ...x.attrs } })),
    kinsoku: (next.kinsoku || (sheetsByDoc.get(doc) || {}).kinsoku || []).map(x => ({ ...x })), dirty: true });   
  updateUndoButtons();
  if (TXP) TXP.refresh();
  if (CPP) CPP.refresh();
}
window.__psd_editor.textStyles = {
  ranges: i => { const e = textStyleEdits[i]; return e && e.__ranges ? cloneOpValue(e.__ranges) : null; },
  model: i => { const L = layerTree.flat[i]; const m = textModelOf(i, L); return m && { text: m.text, runs: m.runs.map(r => ({ from: r.from, to: r.to, font: r.font, fontSize: r.fontSize, color: r.color, fauxBold: r.fauxBold, otSwash: r.otSwash, kernMode: r.kernMode })), paragraphs: m.paragraphs.map(p => ({ from: p.from, to: p.to, justification: p.justification, kinsokuSet: p.kinsokuSet })) }; },
  info: i => textInfoOf(i), sheets: () => cloneOpValue(textSheets()), rich: () => !!(textOverlay && textOverlay.rich),
  select: (a, b) => { if (!textOverlay) return false; textOverlay.ta.setSelectionRange(a, b); return true; },
  apply: (i, patch) => applyTextStyle(i, patch), insert: s2 => textInsertAtCaret(s2),
};



export var PW = installPathWarp({
  tf: () => tfState,
  pathModel: () => pathModel,
  redraw: () => drawGizmo(),
  px: n => dispPx(n),
  status: m => shell.status(m),
});
if (typeof window !== 'undefined' && window.__psd_editor) window.__psd_editor.pathWarp = {
  eligible: () => pathWarpEligible(),
  begin: () => beginPathWarp(),
  state: () => PW.state(),
  setStyle: (style, o) => PW.setStyle(style, o || {}),
  setGrid: (g, n) => PW.setGrid(g, n),
  setPoints: pts => PW.setPoints(pts),
  split: dir => PW.setSplitMode(dir),
  removeSplits: () => PW.removeSplits(),
  toFree: () => beginFreeTransform('free'),
  toWarp: () => beginPathWarp(),
  commit: () => commitFreeTransform(),
  cancel: () => cancelFreeTransform(),
  subpaths: key => { const sp = key === undefined ? (pathModel && pathModel.subpaths) : effPathSubpaths(key); return sp && JSON.parse(JSON.stringify(sp)); },
  working: () => pathModel && JSON.parse(JSON.stringify(pathModel.subpaths)),
  
  toClient: (x, y) => { const r = gizmo.getBoundingClientRect(); return { x: r.left + (x + padL()) / viewW() * r.width, y: r.top + (y + padT()) / viewH() * r.height }; },
};
