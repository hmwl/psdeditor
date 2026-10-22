




import './14-edit-misc.js';   
import { gradientSpan } from '../../../core/paint-fill.js';
import { patternToRGBA } from '../../../core/app.js';
import { PAINT_MODES } from '../../../core/brush-engine.js';
import {
  ditherNoise, GRADIENT_METHODS, GRADIENT_METHOD_KEYS, GRADIENT_METHOD_LABELS,
} from '../../../core/paint-fill.js';
import { toolIcon } from '../icons.js';
import { presets, libGradientGroups } from '../presets-panels.js';
import { shell } from '../shell.js';
import {
  $, EDIT, EDITM, applyEdits, ensureLazy, isEmptySelection, kick, magicWandSelection, selectionBounds,
  selectionValueAt,
} from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, gradState, layerDeletes, layerRenames, li, origBuffer, selection,
  set_selection,
} from './02-doc-state.js';
import { pushDocHistory, structuralBegin, structuralDone } from './03-history.js';
import { rasterKindOf, rasterizeLayerUI } from './05-layer-lock-guides.js';
import {
  GRAD_PRESET_GROUPS, GRAD_PRESET_INDEX, GRAD_STYLES, bucketBarBound, bucketOpts, eyeBarBound, eyeOpts,
  gradBarBound, gradCurrentModel, gradDrag, gradModelLut, gradOpts, gradParam, gradPresetModel, paintPixelsWith,
  saveEyeOpts, set_bucketBarBound, set_eyeBarBound, set_gradBarBound, set_gradDrag,
} from './11-paint-common.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { renderLayerPanel, selLayer, set_selLayer } from './23-layers-panel.js';
import {
  commitLayerOps, dropLayerOp, effParam, findLayerOp, humanEditError, layerParams, paramEq, putLayerOp,
  renderProps, setParamField, withFastCommit,
} from './24-layer-ops-queue.js';
import { docPatterns } from './26-layer-create.js';
import {
  GRAD_MAX_STOPS, GRAD_STYLE_SVG, buildGradientEditor, commitGradient, gradClone, gradColorAt, gradModelFrom,
  gradModelStops, gradSig, gradientOf, parseHex6, rgbHex,
} from './27-gradient-editor.js';
import { displayOrder } from './29-scrubby-live.js';
import { bgRGB, docTool, fgRGB, hexOf, set_bgRGB, set_fgRGB } from './31-selection-brush.js';
import { dispPx, sampleRGBA, selReady, syncGizmoCursor } from './32-cursors-select-options.js';
import { syncBrushSwatches } from './38-brush-engine.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import { buildPsdBuffer, ensureStructuralBase } from './48-info-export.js';










export function beginGradDrag(ev, pt){
  if (!doc || li) return false;
  if (gradOpts.mode === 'gradient') {
    const hit = liveGradHit(pt);
    if (hit) return beginLiveGradEdit(ev, pt, hit);
  }
  set_gradDrag({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
  gizmo.classList.add('drag');
  if (ev && ev.pointerId != null) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} }
  drawGizmo();
  return true;
}
export function moveGradDrag(ev, pt){
  if (liveGradEdit) { moveLiveGradEdit(ev, pt); return; }
  if (!gradDrag) return;
  let x = pt.x, y = pt.y;
  if (ev && ev.shiftKey) {                          
    const a = Math.round(Math.atan2(y - gradDrag.y0, x - gradDrag.x0) / (Math.PI / 4)) * (Math.PI / 4);
    const L = Math.hypot(x - gradDrag.x0, y - gradDrag.y0);
    x = gradDrag.x0 + Math.cos(a) * L; y = gradDrag.y0 + Math.sin(a) * L;
  }
  gradDrag.x1 = x; gradDrag.y1 = y;
  syncGradBar(); drawGizmo();
}
export function endGradDrag(){
  if (liveGradEdit) return endLiveGradEdit();
  const d = gradDrag; set_gradDrag(null);
  gizmo.classList.remove('drag');
  drawGizmo();
  if (!d) return false;
  if (gradOpts.mode === 'gradient') {
    const lg = liveGradInfo();
    if (lg) return liveGradSetLine(lg, d.x0, d.y0, d.x1, d.y1, false, true);
    return createGradientFillLayer(d);
  }
  return applyGradient(d);
}

function applyGradient(d){
  if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 1) {
    $('#gdInfo').textContent = '渐变线太短（不足 1 像素），没有落笔。';
    return false;
  }
  
  if (selLayer >= 0 && rasterKindOf(selLayer)) {
    rasterizeLayerUI(selLayer).then(ok => { if (ok) applyGradient(d); });
    return false;
  }
  const lut = gradModelLut(gradCurrentModel(), { transparency: gradOpts.transparency });
  const style = gradOpts.style, op = gradOpts.opacity, dither = gradOpts.dither, rev = gradOpts.reverse, N = lut.length / 4 - 1;
  const ok = paintPixelsWith((x, y) => {
    let t = gradParam(style, d.x0, d.y0, d.x1, d.y1, x + 0.5, y + 0.5);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (rev) t = 1 - t;
    const k = ((t * N + 0.5) | 0) * 4;
    

    const n = dither ? ditherNoise(x, y) : 0;
    const a = lut[k + 3] * op;
    return a > 0 ? [lut[k] + n, lut[k + 1] + n, lut[k + 2] + n, a] : null;
  }, { blend: gradOpts.blend, label: '渐变' });
  const label = (GRAD_STYLES.find(s => s.value === style) || {}).label || style;
  $('#gdInfo').textContent = ok
    ? `已落下一次${label}（${gradModelName()} · ${GRADIENT_METHOD_LABELS[gradOpts.method]}）`
    : ($('#notice').textContent || '这一次渐变没有改变任何像素。');
  if (ok) shell.status(`${label}：已写入「${doc.layers[selLayer] && (layerRenames[selLayer] || doc.layers[selLayer].name)}」的像素`);
  return ok;
}
const gradModelName = () => gradOpts.model ? '自定义' : ((GRAD_PRESET_INDEX.get(gradOpts.preset) || {}).name || '渐变');






export function gradGeomFromLine(typeKey, x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0, L = Math.max(1e-6, Math.hypot(dx, dy));
  const cs = dx / L, sn = dy / L, ext = gradientSpan(typeKey, docW, docH, cs, sn);
  const lin = typeKey === 'Lnr ', inset = lin ? 0 : 1;
  const cx = lin ? (x0 + x1) / 2 : x0, cy = lin ? (y0 + y1) / 2 : y0;
  const r1 = v => Math.round(v * 100) / 100;
  return {
    Angl: r1(Math.atan2(-dy, dx) * 180 / Math.PI),
    'Scl ': r1(Math.max(1, Math.min(1000, (lin ? L : 2 * L) / ext * 100))),
    'Ofst.Hrzn': r1(Math.max(-100, Math.min(100, (cx - (docW - inset) / 2) / docW * 100))),
    'Ofst.Vrtc': r1(Math.max(-100, Math.min(100, (cy - (docH - inset) / 2) / docH * 100))),
  };
}
export function gradLineFromGeom(typeKey, ang, scl, ox, oy){
  const a = ang * Math.PI / 180, cs = Math.cos(a), sn = -Math.sin(a);
  const span = Math.max(1, gradientSpan(typeKey, docW, docH, cs, sn) * scl / 100);
  const inset = typeKey === 'Lnr ' ? 0 : 1;
  const cx = (docW - inset) / 2 + ox / 100 * docW, cy = (docH - inset) / 2 + oy / 100 * docH;
  if (typeKey === 'Lnr ') return { x0: cx - cs * span / 2, y0: cy - sn * span / 2, x1: cx + cs * span / 2, y1: cy + sn * span / 2 };
  return { x0: cx, y0: cy, x1: cx + cs * span / 2, y1: cy + sn * span / 2 };
}


async function createGradientFillLayer(d){
  if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 1) { $('#gdInfo').textContent = '渐变线太短（不足 1 像素），没有新建图层。'; return false; }
  if (!origBuffer) return false;
  if (!await ensureLazy(EDIT, '渐变')) return false;
  const st = GRAD_STYLES.find(s => s.value === gradOpts.style) || GRAD_STYLES[0];
  const g = gradGeomFromLine(st.key, d.x0, d.y0, d.x1, d.y1);
  const m = gradCurrentModel();
  

  const noise = m.noise ? { roughness: m.noise.roughness, model: m.noise.model, min: m.noise.min, max: m.noise.max,
    restrict: !!m.noise.restrict, transparency: !!m.noise.transparency, seed: m.noise.seed } : undefined;
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  let n = 1;
  const names = new Set(doc.layers.map((l, i) => layerRenames[i] || l.name));
  while (names.has(`渐变填充 ${n}`)) n++;
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const at = selLayer >= 0 ? selLayer + 1 : doc.layers.length;
    const ops = [{ op: 'addFillLayer', kind: 'gradient', at, name: `渐变填充 ${n}`, gradient: {
      type: st.value, angle: g.Angl, scale: g['Scl '], offset: { x: g['Ofst.Hrzn'], y: g['Ofst.Vrtc'] },
      reverse: gradOpts.reverse, dither: gradOpts.dither, method: gradOpts.method,
      smoothness: m.smooth == null ? 100 : m.smooth, ...gradModelStops(m), ...(noise ? { noise } : {}) } }];
    
    if (selection && !isEmptySelection(selection)) {
      const b = selectionBounds(selection);
      if (b && b.width > 0 && b.height > 0) {
        const gray = new Uint8Array(b.width * b.height);
        for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) gray[y * b.width + x] = selectionValueAt(selection, b.x + x, b.y + y);
        ops.push({ op: 'addLayerMask', index: at, gray, bounds: { top: b.y, left: b.x, bottom: b.y + b.height, right: b.x + b.width } });
      }
    }
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    if (ops.length > 1) set_selection(null);
    refreshAll(false);
    structuralDone(prev, '渐变');
    $('#gdInfo').textContent = `已新建「渐变填充 ${n}」：拖画布上的控件继续调`;
    shell.status(`渐变：新建了渐变填充图层（${st.label} · ${GRADIENT_METHOD_LABELS[gradOpts.method]}）`);
    drawGizmo();
    return true;
  } catch (e) {
    $('#err').textContent = '渐变没能新建填充图层：' + humanEditError(e && e.message || e);
    return false;
  }
}


export let liveGradEdit = null;        
export function set_liveGradEdit(v) { return (liveGradEdit = v); }   
export let liveGradSel = null;         
export function set_liveGradSel(v) { return (liveGradSel = v); }   
let liveGradLastClick = null;   

export function liveGradInfo(){
  if (!doc || li || docTool !== 'gradient' || gradOpts.mode !== 'gradient' || selLayer < 0) return null;
  const idx = selLayer, dl = doc.layers[idx];
  if (!dl || !dl.fill || dl.fill.key !== 'GdFl' || layerDeletes.has(idx)) return null;
  if (!EDITM) { kick(EDIT); return null; }
  const P = layerParams(idx);
  const tgt = P && P.adjustment && (P.adjustment.targets || []).find(t => t.target === 'adjustment:GdFl');
  if (!tgt) return null;
  const F = new Map(tgt.fields.map(f => [f.path, f]));
  const val = (p, d) => { const f = F.get(p); return f ? effParam(idx, tgt.target, 0, p, f.value) : d; };
  const typeKey = val('Type', 'Lnr ');
  const line = gradLineFromGeom(typeKey, +val('Angl', 90), +val('Scl ', 100), +val('Ofst.Hrzn', 0), +val('Ofst.Vrtc', 0));
  const gr = gradientOf(tgt);
  if (gr.none) return { idx, tgt, F, typeKey, line, rev: !!val('Rvrs', false), model: null, gr };
  const gkey = `${idx}|${tgt.target}|0`, sig = gradSig(idx, tgt);
  let m = gradState[gkey];
  if (!m || m.sig !== sig) { m = gradModelFrom(gr, findLayerOp(idx, `setLayerParams:${tgt.target}:0`)); m.sig = sig; gradState[gkey] = m; }
  return { idx, tgt, F, typeKey, line, rev: !!val('Rvrs', false), model: m, gr };
}

function liveGradStopPt(lg, loc){
  const f = lg.rev ? 1 - loc / 4096 : loc / 4096, L = lg.line;
  return { x: L.x0 + (L.x1 - L.x0) * f, y: L.y0 + (L.y1 - L.y0) * f };
}

function liveGradProject(lg, pt){
  const L = lg.line, dx = L.x1 - L.x0, dy = L.y1 - L.y0, L2 = dx * dx + dy * dy || 1;
  let f = ((pt.x - L.x0) * dx + (pt.y - L.y0) * dy) / L2;
  const off = Math.abs((pt.x - L.x0) * dy - (pt.y - L.y0) * dx) / Math.sqrt(L2);
  f = Math.max(0, Math.min(1, f));
  return { loc: Math.round((lg.rev ? 1 - f : f) * 4096), off, f };
}

function liveGradMidPt(lg, k){
  const a = lg.model.clrs[k], b = lg.model.clrs[k + 1];
  const loc = a.loc + (b.loc - a.loc) * (a.mid == null ? 50 : a.mid) / 100;
  const p = liveGradStopPt(lg, loc), L = lg.line, dx = L.x1 - L.x0, dy = L.y1 - L.y0, len = Math.hypot(dx, dy) || 1;
  const o = dispThr(10);
  return { x: p.x + dy / len * o, y: p.y - dx / len * o };
}

export function liveGradHit(pt){
  const lg = liveGradInfo(); if (!lg) return null;
  const R = dispThr(8), near = (p, r) => Math.hypot(pt.x - p.x, pt.y - p.y) <= r;
  if (lg.model) {
    const cl = lg.model.clrs;
    for (let i = cl.length - 1; i >= 0; i--) {
      if (cl[i].loc <= 0 || cl[i].loc >= 4096) continue;     
      if (near(liveGradStopPt(lg, cl[i].loc), R)) return { kind: 'stop', i };
    }
  }
  if (near({ x: lg.line.x1, y: lg.line.y1 }, R * 1.3)) return { kind: 'end' };
  if (near({ x: lg.line.x0, y: lg.line.y0 }, R * 1.3)) return { kind: 'start' };
  if (lg.model) for (let k = 0; k < lg.model.clrs.length - 1; k++) if (near(liveGradMidPt(lg, k), R)) return { kind: 'mid', i: k };
  const pr = liveGradProject(lg, pt);
  if (pr.off <= dispThr(6) && pr.f > 0 && pr.f < 1) return { kind: 'line' };
  return null;
}
function beginLiveGradEdit(ev, pt, hit){
  const lg = liveGradInfo(); if (!lg) return false;
  const stop = hit.kind === 'stop' && lg.model ? lg.model.clrs[hit.i] : null;
  
  liveGradEdit = { hit, lg, start: { x: pt.x, y: pt.y }, line0: { ...lg.line }, moved: false, off: false, pushed: false,
                   stop, loc0: stop ? stop.loc : 0 };
  if (stop) liveGradSel = { idx: lg.idx, stop };
  gizmo.classList.add('drag');
  if (ev && ev.pointerId != null) { try { gizmo.setPointerCapture(ev.pointerId); } catch {} }
  

  const now = Date.now();
  if (stop && liveGradLastClick && liveGradLastClick.stop === stop && now - liveGradLastClick.t < 400) {
    liveGradEdit = null; liveGradLastClick = null; gizmo.classList.remove('drag');
    liveGradPickColor(lg, lg.model.clrs.indexOf(stop));
  } else liveGradLastClick = stop ? { stop, t: now } : null;
  drawGizmo();
  return true;
}
function liveGradHistory(E){ if (!E.pushed) { E.pushed = true; pushDocHistory('编辑渐变'); } }
function moveLiveGradEdit(ev, pt){
  const E = liveGradEdit; if (!E) return;
  if (!E.moved && Math.hypot(pt.x - E.start.x, pt.y - E.start.y) < dispThr(3)) return;
  E.moved = true;
  const lg = liveGradInfo(); if (!lg) return;
  const L0 = E.line0, dx = pt.x - E.start.x, dy = pt.y - E.start.y;
  const k = E.hit.kind;
  if (k === 'start' || k === 'end' || k === 'line') {
    let { x0, y0, x1, y1 } = L0;
    if (k === 'line') { x0 += dx; y0 += dy; x1 += dx; y1 += dy; }
    else {
      const fx = k === 'end' ? x0 : x1, fy = k === 'end' ? y0 : y1;   
      let px = pt.x, py = pt.y;
      if (ev && ev.shiftKey) {                    
        const a = Math.round(Math.atan2(py - fy, px - fx) / (Math.PI / 12)) * (Math.PI / 12);
        const Ln = Math.hypot(px - fx, py - fy);
        px = fx + Math.cos(a) * Ln; py = fy + Math.sin(a) * Ln;
      }
      if (k === 'end') { x1 = px; y1 = py; } else { x0 = px; y0 = py; }
    }
    liveGradHistory(E);
    liveGradSetLine(lg, x0, y0, x1, y1, true);
  } else if (k === 'stop' && lg.model) {
    const pr = liveGradProject(lg, pt);
    const m = lg.model, st = E.stop; if (!st || m.clrs.indexOf(st) < 0) return;
    
    if (!E.copied && ev && ev.altKey && m.clrs.length < GRAD_MAX_STOPS) {
      m.clrs.splice(m.clrs.indexOf(st), 0, { ...st, loc: E.loc0 });
      E.copied = true; liveGradHistory(E);
      shell.status('渐变：复制了一个色标');
    }
    
    E.off = pr.off > dispThr(30) && m.clrs.length > 2;
    liveGradHistory(E);
    st.loc = E.off ? E.loc0 : Math.max(0, Math.min(4096, pr.loc));
    E.lastPt = { x: pt.x, y: pt.y };
    withFastCommit(() => liveGradCommitModel(lg));
  } else if (k === 'mid' && lg.model) {
    const pr = liveGradProject(lg, pt), m = lg.model, a = m.clrs[E.hit.i], b = m.clrs[E.hit.i + 1];
    if (!a || !b || b.loc === a.loc) return;
    a.mid = Math.max(5, Math.min(95, Math.round((pr.loc - a.loc) / (b.loc - a.loc) * 100)));
    liveGradHistory(E);
    withFastCommit(() => liveGradCommitModel(lg));
  }
  drawGizmo();
}
function endLiveGradEdit(){
  const E = liveGradEdit; liveGradEdit = null;
  gizmo.classList.remove('drag');
  if (!E) return false;
  const lg = liveGradInfo();
  if (!lg) { drawGizmo(); return false; }
  if (!E.moved) {
    
    if (E.hit.kind === 'line' && lg.model) {
      const pr = liveGradProject(lg, E.start);
      if (lg.model.clrs.length >= GRAD_MAX_STOPS) { shell.status(`色标最多 ${GRAD_MAX_STOPS} 个`); return false; }
      pushDocHistory('添加色标');
      const c = gradColorAt(lg.model, pr.loc), arr = lg.model.clrs;
      let k = arr.findIndex(s => s.loc > pr.loc); if (k < 0) k = arr.length;
      arr.splice(k, 0, { loc: pr.loc, r: c.r, g: c.g, b: c.b, mid: 50 });
      liveGradSel = { idx: lg.idx, stop: arr[k] };
      liveGradCommitModel(lg);
      shell.status('渐变：添加了一个色标（双击改颜色，拖离线删除）');
    }
    drawGizmo();
    return true;
  }
  if (E.hit.kind === 'stop' && E.off && lg.model && lg.model.clrs.length > 2 && lg.model.clrs.indexOf(E.stop) >= 0) {
    lg.model.clrs.splice(lg.model.clrs.indexOf(E.stop), 1);
    liveGradSel = null;
    shell.status('渐变：删掉了一个色标');
  }
  if (E.hit.kind === 'start' || E.hit.kind === 'end' || E.hit.kind === 'line') {
    const L = lg.line; liveGradSetLine(lg, L.x0, L.y0, L.x1, L.y1, false);   
  } else if (lg.model) liveGradCommitModel(lg);
  drawGizmo();
  return true;
}


function liveGradSetLine(lg, x0, y0, x1, y1, fast, history){
  if (Math.hypot(x1 - x0, y1 - y0) < 1) return false;
  if (history) pushDocHistory('渐变');
  const g = gradGeomFromLine(lg.typeKey, x0, y0, x1, y1);
  const key = `setLayerParams:${lg.tgt.target}:0`;
  const run = () => commitLayerOps(lg.idx, () => {
    const op = findLayerOp(lg.idx, key) || { op: 'setLayerParams', index: lg.idx, target: lg.tgt.target, at: 0, values: {} };
    for (const [p, v] of Object.entries(g)) {
      const f = lg.F.get(p); if (!f) continue;
      if (paramEq(v, f.value)) delete op.values[p]; else op.values[p] = v;
    }
    if (!Object.keys(op.values).length && !(op.arrayOps && op.arrayOps.length)) dropLayerOp(lg.idx, key); else putLayerOp(lg.idx, op);
  });
  const ok = fast ? withFastCommit(run) : run();
  if (!fast) { $('#gdInfo').textContent = `角度 ${g.Angl.toFixed(1)}° · 缩放 ${g['Scl '].toFixed(0)}%`; renderProps(); }
  return ok;
}
function liveGradCommitModel(lg){
  if (!lg.model || lg.gr.none) return false;
  return commitGradient(lg.idx, lg.tgt, lg.gr, lg.model);
}
function liveGradPickColor(lg, i){
  const st = lg.model && lg.model.clrs[i]; if (!st) return;
  const inp = document.createElement('input');
  inp.type = 'color'; inp.value = rgbHex(st); inp.dataset.pickerTitle = '色标颜色';
  inp.oncancel = () => inp.remove();
  inp.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(inp);
  let pushed = false;
  const apply = fast => {
    const c = parseHex6(inp.value); if (!c) return;
    const cur = liveGradInfo(); if (!cur || !cur.model || !cur.model.clrs[i]) return;
    if (!pushed) { pushed = true; pushDocHistory('色标颜色'); }
    Object.assign(cur.model.clrs[i], { r: c[0], g: c[1], b: c[2] });
    if (fast) withFastCommit(() => liveGradCommitModel(cur)); else liveGradCommitModel(cur);
    drawGizmo();
  };
  inp.oninput = () => apply(true);
  inp.onchange = () => { apply(false); inp.remove(); };
  inp.click();
}

export function liveGradDeleteSel(){
  const lg = liveGradInfo();
  if (!lg || !lg.model || !liveGradSel || liveGradSel.idx !== lg.idx) return false;
  const arr = lg.model.clrs, i = arr.indexOf(liveGradSel.stop);
  if (arr.length <= 2 || i < 0) return false;
  pushDocHistory('删除色标');
  arr.splice(i, 1);
  liveGradSel = null;
  liveGradCommitModel(lg);
  drawGizmo();
  return true;
}




export function bucketFill(pt){
  if (!doc || !docW || li) return false;
  if (selLayer >= 0 && rasterKindOf(selLayer)) {
    rasterizeLayerUI(selLayer).then(ok => { if (ok) bucketFill(pt); });
    return false;
  }
  if (!selReady('油漆桶')) return false;
  const sx = Math.max(0, Math.min(docW - 1, Math.floor(pt.x)));
  const sy = Math.max(0, Math.min(docH - 1, Math.floor(pt.y)));
  if (!bucketOpts.allLayers && selLayer < 0) {
    $('#err').textContent = '油漆桶按「当前图层」取样：请先选中一个图层，或勾上「所有图层」。';
    return false;
  }
  let pat = null;
  if (bucketOpts.source === 'pattern') {
    pat = bucketPatternImage();
    if (!pat) { $('#err').textContent = '油漆桶：这份文档里没有图案资源（Patt 块），「图案」填充源用不了 —— 编辑器不凭空造一个图案。'; return false; }
  }
  let region;
  try {
    

    region = magicWandSelection(sampleRGBA(bucketOpts.allLayers), docW, docH, sx, sy, {
      tolerance: Math.max(0, Math.min(255, bucketOpts.tolerance)),
      contiguous: bucketOpts.contiguous, antialias: false,
    });
  } catch (e) { $('#err').textContent = '油漆桶取样失败：' + humanEditError(e && e.message || e); return false; }
  if (bucketOpts.antialias && region && region.data) region = bucketAntialias(region);
  const color = fgRGB;
  const op = bucketOpts.opacity;
  const b = selectionBounds(region);
  if (!b || b.width <= 0 || b.height <= 0) { $('#bkInfo').textContent = '这一点周围没有可填的区域。'; return false; }
  const ok = paintPixelsWith((x, y) => {
    const v = selectionValueAt(region, x, y);
    if (v <= 0) return null;
    if (pat) {                                     
      const o = ((((y % pat.height) + pat.height) % pat.height) * pat.width + (((x % pat.width) + pat.width) % pat.width)) * 4;
      return [pat.data[o], pat.data[o + 1], pat.data[o + 2], v * op * pat.data[o + 3] / 255];
    }
    return [color[0], color[1], color[2], v * op];
  }, { bounds: b, blend: bucketOpts.blend, label: '油漆桶' });
  $('#bkInfo').textContent = ok
    ? `已填 ${b.width} × ${b.height} 的区域（容差 ${bucketOpts.tolerance}${bucketOpts.contiguous ? '，连续' : '，全图同色'}）`
    : ($('#notice').textContent || $('#err').textContent || '这一次填充没有改变任何像素。');
  $('#err').textContent = ok ? '' : $('#err').textContent;
  return ok;
}

function bucketAntialias(sel){
  const { x, y, width: w, height: h, data } = sel;
  const W = w + 2, H = h + 2, out = new Uint8Array(W * H);
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? 0 : data[j * w + i];
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    const c = at(i, j);
    if (c === 255) { out[(j + 1) * W + i + 1] = 255; continue; }
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += at(i + di, j + dj);
    out[(j + 1) * W + i + 1] = Math.max(c, Math.round(s / 9));
  }
  return { ...sel, x: x - 1, y: y - 1, width: W, height: H, data: out };
}

function bucketPatternImage(){
  const list = docPatterns(); if (!list.length) return null;
  const pick = list.find(p => p.id === bucketOpts.pattern) || list[0];
  const raw = ((doc && doc.patterns) || []).find(p => p.id === pick.id);
  try { const rgba = raw && patternToRGBA(raw); return rgba && rgba.width > 0 && rgba.data ? rgba : null; } catch { return null; }
}




function eyeSampleRGBA(mode = eyeOpts.sample){
  if (mode === 'cur') return sampleRGBA(false);
  const noAdj = mode === 'allNoAdj' || mode === 'curBelowNoAdj';
  const below = mode === 'curBelow' || mode === 'curBelowNoAdj';
  if (!noAdj && !(below && selLayer >= 0)) return sampleRGBA(true);
  const order = displayOrder(), at = order.indexOf(selLayer);
  return sampleRGBA(true, (i, l) => {
    if (l.group && l.group.type) return false;                 
    if (noAdj && l.adjustment && l.adjustment.kind !== 'fill') return true;
    return below && at >= 0 && order.indexOf(i) > at;
  });
}

function eyeAverage(rgba, pt, size = eyeOpts.size){
  const n = Math.max(1, size | 0), r = (n - 1) >> 1;
  const cx = Math.max(0, Math.min(docW - 1, Math.floor(pt.x)));
  const cy = Math.max(0, Math.min(docH - 1, Math.floor(pt.y)));
  let sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= docW || y >= docH) continue;
    const o = (y * docW + x) * 4, a = rgba[o + 3] == null ? 255 : rgba[o + 3];
    sr += rgba[o] * a; sg += rgba[o + 1] * a; sb += rgba[o + 2] * a; sa += a; cnt++;
  }
  if (!cnt) return null;
  if (!sa) return null;                                        
  return [Math.round(sr / sa), Math.round(sg / sa), Math.round(sb / sa)];
}
export function eyedropAt(pt, toBg, cached){
  if (!doc || !docW) return null;
  const n = Math.max(1, eyeOpts.size | 0);
  let rgba = cached;
  if (!rgba) { try { rgba = eyeSampleRGBA(); } catch { return null; } }
  const c = eyeAverage(rgba, pt);
  if (!c) return null;
  if (toBg) set_bgRGB(c); else set_fgRGB(c);
  syncBrushSwatches();
  syncGradBar(); syncBucketBar();
  $('#edInfo').textContent = `${toBg ? '背景色' : '前景色'} → ${hexOf(c)}（RGB ${c.join(', ')}${n > 1 ? `，${n}×${n} 平均` : ''}）`;
  shell.status(`吸管：${toBg ? '背景色' : '前景色'} 取为 ${hexOf(c)}`);
  drawGizmo();
  return c;
}


export let pickDrag = null;     
export function eyedropDown(ev, pt){
  let rgba = null;
  try { rgba = eyeSampleRGBA(); } catch { return; }
  const toBg = !!ev.altKey;
  pickDrag = { rgba, toBg, prev: (toBg ? bgRGB : fgRGB).slice(), cur: null, pt: { ...pt } };
  pickDrag.cur = eyedropAt(pt, toBg, rgba);
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  drawGizmo();
}
export function eyedropMove(ev, pt){
  const d = pickDrag; if (!d) return;
  d.pt = { ...pt };
  const c = eyedropAt(pt, d.toBg, d.rgba);
  if (c) d.cur = c;
  drawGizmo();
}
export function eyedropUp(){ if (!pickDrag) return false; pickDrag = null; drawGizmo(); return true; }
export function drawEyeRing(ctx){
  const d = pickDrag; if (!d || !eyeOpts.ring || docTool !== 'eyedropper') return;
  const R = dispPx(56), r = dispPx(38), { x, y } = d.pt;
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.save();
  ctx.lineWidth = R - r;
  const mid = (R + r) / 2;
  ctx.strokeStyle = rgb(d.cur || d.prev);          
  ctx.beginPath(); ctx.arc(x, y, mid, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = rgb(d.prev);                   
  ctx.beginPath(); ctx.arc(x, y, mid, 0, Math.PI); ctx.stroke();
  ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(128,128,128,.9)';   
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
export function copyEyeHex(html){
  const c = fgRGB, hex = hexOf(c).replace('#', '').toLowerCase();
  const text = html ? `color="#${hex}"` : hex;
  try { navigator.clipboard.writeText(text).then(() => shell.status(`已拷贝 ${text}`), () => shell.status(text)); } catch { shell.status(text); }
  return text;
}







export const adjEye = { active: null };   

function adjEyeStart(which, apply){
  if (!doc) return false;
  adjEye.active = { which, apply };
  const label = { black: '设置黑场', gray: '设置灰场', white: '设置白场' }[which] || which;
  $('#notice').textContent = `${label}：到画布上点一下，取那一处的颜色（Esc 取消）。`;
  shell.status(`吸管 · ${label}：点画布取样，Esc 取消`);
  syncGizmoCursor();
  return true;
}
export function adjEyeCancel(){
  if (!adjEye.active) return false;
  adjEye.active = null;
  $('#notice').textContent = '';
  syncGizmoCursor();
  return true;
}

export function adjEyeSampleAt(pt){
  const st = adjEye.active;
  if (!st) return false;
  const n = Math.max(1, eyeOpts.size | 0), r = (n - 1) >> 1;
  let rgba;
  try { rgba = sampleRGBA(true); } catch { rgba = null; }
  adjEye.active = null;
  syncGizmoCursor();
  if (!rgba || !docW) { $('#notice').textContent = '吸管取不到画面（合成还没准备好）。'; renderProps(); return true; }
  const cx = Math.max(0, Math.min(docW - 1, Math.floor(pt.x)));
  const cy = Math.max(0, Math.min(docH - 1, Math.floor(pt.y)));
  let sr = 0, sg = 0, sb = 0, cnt = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= docW || y >= docH) continue;
    const o = (y * docW + x) * 4;
    sr += rgba[o]; sg += rgba[o + 1]; sb += rgba[o + 2]; cnt++;
  }
  if (!cnt) { renderProps(); return true; }
  const c = [Math.round(sr / cnt), Math.round(sg / cnt), Math.round(sb / cnt)];
  const okd = !!st.apply(c);
  if (okd) {
    shell.status(`吸管：取到 RGB ${c.join(', ')}${n > 1 ? `（${n}×${n} 平均）` : ''}`);
    $('#notice').textContent = '';
  }
  renderLayerPanel();                       
  return true;
}


export function buildAdjEyeRow(mk, attrPrefix, onPick){
  const row = mk('div', { className: 'arow adj-eye' });
  row.append(mk('label', { className: 'k', textContent: '吸管' }));
  const opts = [['black', '设置黑场', '取画布上最暗的那一处当黑场（逐通道各取自己的分量 → 顺带中和偏色）'],
                ['gray', '设置灰场', '取画布上应当是中性灰的那一处当灰场（把中间调拉成 128）'],
                ['white', '设置白场', '取画布上最亮的那一处当白场（逐通道各取自己的分量）']];
  for (const [which, label, tip] of opts) {
    const b = mk('button', { type: 'button', className: 'adj-eye-btn' });
    b.dataset.attr = `${attrPrefix}-${which}`;
    b.title = `${label}：${tip}；点完到画布上点一下，Esc 取消`;
    b.setAttribute('aria-label', label);
    


    b.append(toolIcon('eyedropper', 14));
    b.onclick = () => { adjEyeStart(which, c => onPick(which, c)); };
    row.append(b);
  }
  return row;
}


function gradCssStops(){
  const lut = gradModelLut(gradCurrentModel(), { transparency: gradOpts.mode === 'classic' ? gradOpts.transparency : true, size: 33 });
  const parts = [];
  for (let k = 0; k < 33; k++) {
    const i = gradOpts.reverse ? 32 - k : k;
    parts.push(`rgba(${Math.round(lut[i * 4])},${Math.round(lut[i * 4 + 1])},${Math.round(lut[i * 4 + 2])},${(lut[i * 4 + 3] / 255).toFixed(3)}) ${(k / 32 * 100).toFixed(1)}%`);
  }
  return parts.join(', ');
}

export function gradModelCssBy(m, direction = 'to right'){
  const lut = gradModelLut(m, { size: 17 }), parts = [];
  for (let k = 0; k < 17; k++) parts.push(`rgba(${Math.round(lut[k * 4])},${Math.round(lut[k * 4 + 1])},${Math.round(lut[k * 4 + 2])},${(lut[k * 4 + 3] / 255).toFixed(3)}) ${(k / 16 * 100).toFixed(1)}%`);
  return `linear-gradient(${direction}, ${parts.join(', ')}), repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 8px 8px`;
}



const gradPickerOpen = { '基础': true };
let gradPickerEl = null;
export function closeGradPicker(){ if (gradPickerEl) { gradPickerEl.remove(); gradPickerEl = null; document.removeEventListener('pointerdown', gradPickerOutside, true); } }
function gradPickerOutside(e){ if (gradPickerEl && !gradPickerEl.contains(e.target) && e.target !== $('#gdPickBtn')) closeGradPicker(); }
export function openGradPicker(anchor, onPick){
  closeGradPicker();
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const pop = mk('div', { className: 'menu-pop gd-picker' });
  pop.dataset.attr = 'grad-picker';
  const render = () => {
    pop.innerHTML = '';
    for (const g of (presets.lib.ready ? [] : GRAD_PRESET_GROUPS)) {
      const head = mk('div', { className: 'gd-group' + (gradPickerOpen[g.name] ? ' open' : ''), textContent: g.name });
      head.dataset.group = g.name;
      head.addEventListener('click', () => { gradPickerOpen[g.name] = !gradPickerOpen[g.name]; render(); });
      pop.append(head);
      if (!gradPickerOpen[g.name]) continue;
      const grid = mk('div', { className: 'gd-grid' });
      for (const it of g.items) {
        const id = typeof it[1] === 'string' ? it[1] : (g.name === '基础' ? 'bw' : `${g.name}/${it[0]}`);
        const b = mk('button', { type: 'button', className: 'gd-tile' + (!gradOpts.model && gradOpts.preset === id ? ' on' : ''), title: it[0] });
        b.dataset.preset = id;
        b.style.background = gradModelCssBy(gradPresetModel(id), 'to bottom right');
        b.addEventListener('click', () => { closeGradPicker(); (onPick || gradPickPreset)(id); });
        grid.append(b);
      }
      pop.append(grid);
    }
    
    for (const g of libGradientGroups()) {
      const key = 'lib:' + g.name;
      const head = mk('div', { className: 'gd-group' + (gradPickerOpen[key] !== false ? ' open' : ''), textContent: g.name });
      head.dataset.group = key;
      head.addEventListener('click', () => { gradPickerOpen[key] = gradPickerOpen[key] === false; render(); });
      pop.append(head);
      if (gradPickerOpen[key] === false) continue;
      const grid = mk('div', { className: 'gd-grid' });
      for (const it of g.items) {
        const id = 'lib:' + it.id;
        const b = mk('button', { type: 'button', className: 'gd-tile' + (!gradOpts.model && gradOpts.preset === id ? ' on' : ''), title: it.name });
        b.dataset.preset = id;
        b.style.background = gradModelCssBy(gradPresetModel(id), 'to bottom right');
        b.addEventListener('click', () => { closeGradPicker(); (onPick || gradPickPreset)(id); });
        grid.append(b);
      }
      pop.append(grid);
    }
  };
  render();
  document.body.append(pop);
  gradPickerEl = pop;
  let left = anchor.alignLeft ? anchor.left : anchor.left, top = (anchor.bottom != null ? anchor.bottom : anchor.top) + 2;
  const w = pop.offsetWidth || 260, h = pop.offsetHeight || 300;
  if (left + w > innerWidth - 4) left = Math.max(4, innerWidth - w - 4);
  if (top + h > innerHeight - 4) top = Math.max(4, innerHeight - h - 4);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  setTimeout(() => document.addEventListener('pointerdown', gradPickerOutside, true), 0);
  return pop;
}

export function gradPickPreset(id){
  gradOpts.preset = id; gradOpts.model = null;
  const lg = liveGradInfo();
  if (lg && lg.model && !lg.gr.none) {
    const src = gradPresetModel(id);
    pushDocHistory('渐变预设');
    lg.model.clrs.splice(0, lg.model.clrs.length, ...src.clrs.map(s => ({ ...s, src: null })));
    if (lg.gr.hasTrns) lg.model.trns.splice(0, lg.model.trns.length, ...src.trns.map(s => ({ ...s, src: null })));
    liveGradCommitModel(lg);
  }
  syncGradBar(); drawGizmo();
  shell.status(`渐变：${(GRAD_PRESET_INDEX.get(id) || {}).name || (presets.lib.gradients.find(g => 'lib:' + g.id === id) || {}).name || id}`);
}




export let gradEditState = null;
export function openGradientEditor(onOk, startModel){
  gradEditState = { model: gradClone(startModel || gradCurrentModel()), onOk: onOk || null };
  $('#gradEditTitle').textContent = onOk ? '渐变编辑器' : '渐变编辑器（渐变工具）';
  renderGradEditBody();
  const dlg = $('#gradEditDlg');
  if (!dlg.open) { if (dlg.showModal) { try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', ''); }
  return gradEditState;
}
function renderGradEditBody(){
  const S = gradEditState; if (!S) return;
  const body = $('#gradEditBody'), m = S.model;
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  body.innerHTML = '';
  const row = (label, ...els) => { const r = mk('div', { className: 'arow' }); r.append(mk('label', { className: 'k', textContent: label }), ...els); body.append(r); return r; };
  if (!S.onOk) {
    
    const grid = mk('div', { className: 'gd-grid gd-edit-presets' });
    for (const g of (presets.lib.ready ? [] : GRAD_PRESET_GROUPS)) for (const it of g.items) {
      const id = typeof it[1] === 'string' ? it[1] : (g.name === '基础' ? 'bw' : `${g.name}/${it[0]}`);
      const b = mk('button', { type: 'button', className: 'gd-tile', title: `${g.name} › ${it[0]}` });
      b.dataset.preset = id; b.style.background = gradModelCssBy(gradPresetModel(id), 'to bottom right');
      b.onclick = () => { S.model = gradClone(gradPresetModel(id)); renderGradEditBody(); };
      grid.append(b);
    }
    for (const it of presets.lib.gradients) {              
      const id = 'lib:' + it.id;
      const b = mk('button', { type: 'button', className: 'gd-tile', title: it.name });
      b.dataset.preset = id; b.style.background = gradModelCssBy(gradPresetModel(id), 'to bottom right');
      b.onclick = () => { S.model = gradClone(gradPresetModel(id)); renderGradEditBody(); };
      grid.append(b);
    }
    row('预设', grid);
    
    const nb = mk('button', { type: 'button', textContent: '新建', title: '把当前渐变存为新的渐变预设' }); nb.dataset.attr = 'grad-edit-new';
    const nm = mk('input', { type: 'text', value: '自定', style: 'width:120px' });
    nb.onclick = async () => {
      const clean = JSON.parse(JSON.stringify({ clrs: m.clrs, trns: m.trns, ...(m.smooth != null ? { smooth: m.smooth } : {}), ...(m.noise ? { noise: m.noise } : {}) }));
      for (const s0 of clean.clrs) delete s0.src;
      await presets.store.addPresets('gradients', [{ name: nm.value.trim() || '自定', model: clean }]);
      renderGradEditBody();
    };
    row('名称', nm, nb);
    const ty = mk('select', { title: '渐变类型' }); ty.dataset.attr = 'grad-edit-type';
    for (const [v, t] of [['solid', '实底'], ['noise', '杂色']]) ty.append(mk('option', { value: v, textContent: t }));
    ty.value = m.noise ? 'noise' : 'solid';
    ty.onchange = () => {
      if (ty.value === 'noise') m.noise = m.noise || { roughness: 50, model: 'rgb', min: [0, 0, 0, 0], max: [100, 100, 100, 100], restrict: true, transparency: false, seed: (Math.random() * 4294967295) >>> 0 };
      else delete m.noise;
      renderGradEditBody();
    };
    row('渐变类型', ty);
  }
  if (m.noise) {
    const N = m.noise;
    const prev = mk('div', { className: 'gradbar' }); prev.style.background = gradModelCssBy(m); prev.style.height = '22px';
    const repaint = () => { prev.style.background = gradModelCssBy(m); };
    const num = (label, key, min, max, unit) => {
      const inp = mk('input', { type: 'number', min, max, step: 1, value: N[key] }); inp.dataset.attr = `grad-noise-${key}`;
      inp.onchange = () => { N[key] = Math.max(min, Math.min(max, +inp.value || 0)); inp.value = N[key]; repaint(); };
      row(label, inp, mk('span', { className: 'k', textContent: unit, style: 'width:auto;flex:none' }));
    };
    num('粗糙度', 'roughness', 0, 100, '%');
    const cm = mk('select'); cm.dataset.attr = 'grad-noise-model';
    for (const [v, t] of [['rgb', 'RGB'], ['hsb', 'HSB'], ['lab', 'LAB']]) cm.append(mk('option', { value: v, textContent: t }));
    cm.value = N.model; cm.onchange = () => { N.model = cm.value; renderGradEditBody(); };
    row('颜色模型', cm);
    const chNames = { rgb: ['R', 'G', 'B'], hsb: ['H', 'S', 'B'], lab: ['L', 'a', 'b'] }[N.model];
    chNames.forEach((nm, c) => {
      const lo = mk('input', { type: 'number', min: 0, max: 100, step: 1, value: N.min[c], style: 'width:52px' });
      const hi = mk('input', { type: 'number', min: 0, max: 100, step: 1, value: N.max[c], style: 'width:52px' });
      lo.onchange = () => { N.min[c] = Math.max(0, Math.min(100, +lo.value || 0)); repaint(); };
      hi.onchange = () => { N.max[c] = Math.max(0, Math.min(100, +hi.value || 0)); repaint(); };
      row(nm, lo, mk('span', { textContent: '–', style: 'color:var(--muted)' }), hi);
    });
    const rc = mk('input', { type: 'checkbox', checked: !!N.restrict }); rc.onchange = () => { N.restrict = rc.checked; repaint(); };
    const tr = mk('input', { type: 'checkbox', checked: !!N.transparency }); tr.onchange = () => { N.transparency = tr.checked; repaint(); };
    const rnd = mk('button', { type: 'button', textContent: '随机化' }); rnd.dataset.attr = 'grad-noise-random';
    rnd.onclick = () => { N.seed = (Math.random() * 4294967295) >>> 0; repaint(); };
    row('选项', rc, mk('span', { textContent: '限制颜色' }), tr, mk('span', { textContent: '增加透明度' }), rnd);
    body.append(prev);
    return;
  }
  const host = mk('div'); body.append(host);
  buildGradientEditor(host, m, () => {});
  if (!S.onOk) {
    
    const sm = mk('input', { type: 'number', min: 0, max: 100, step: 1, value: m.smooth == null ? 100 : m.smooth, style: 'width:56px' });
    sm.dataset.attr = 'grad-edit-smooth';
    sm.onchange = () => { m.smooth = Math.max(0, Math.min(100, Math.round(+sm.value || 0))); sm.value = m.smooth; };
    row('平滑度', sm, mk('span', { className: 'k', textContent: '%（古典方法下生效）', style: 'width:auto;flex:none' }));
  }
}
export function closeGradientEditor(commit){
  const S = gradEditState; gradEditState = null;
  const dlg = $('#gradEditDlg');
  if (dlg.close) { try { dlg.close(); } catch { dlg.removeAttribute('open'); } } else dlg.removeAttribute('open');
  if (!S || !commit) return false;
  if (S.onOk) S.onOk(S.model);
  else {
    gradOpts.model = S.model;
    
    const lg = liveGradInfo();
    if (lg && lg.model && !lg.gr.none && !S.model.noise) {
      pushDocHistory('编辑渐变');
      lg.model.clrs.splice(0, lg.model.clrs.length, ...S.model.clrs.map(s => ({ ...s, src: null })));
      if (lg.gr.hasTrns) lg.model.trns.splice(0, lg.model.trns.length, ...S.model.trns.map(s => ({ ...s, src: null })));
      liveGradCommitModel(lg);
    }
    syncGradBar(); drawGizmo();
    shell.status(S.model.noise ? '渐变：杂色渐变' : `渐变：${S.model.clrs.length} 个颜色色标 / ${S.model.trns.length} 个不透明度色标`);
  }
  return true;
}
$('#gradEditOk').onclick = () => closeGradientEditor(true);
$('#gradEditCancel').onclick = () => closeGradientEditor(false);
$('#gradEditDlg').addEventListener('cancel', ev => { ev.preventDefault(); closeGradientEditor(false); });
export function syncGradBar(){
  const g = $('#grpGrad'); if (!g) return;
  if (!gradBarBound) {
    set_gradBarBound(true);
    const mode = $('#gdMode');
    mode.onchange = () => { gradOpts.mode = mode.value; syncGradBar(); drawGizmo(); };
    const sw = $('#gdSwatch');
    sw.style.cursor = 'pointer';
    sw.title = '点按可编辑渐变（渐变编辑器）';
    sw.onclick = () => openGradientEditor();
    const pb = $('#gdPickBtn');
    pb.onclick = () => { if (gradPickerEl) { closeGradPicker(); return; } const r = sw.getBoundingClientRect(); openGradPicker({ left: r.left, bottom: r.bottom, alignLeft: true }); };
    const box = $('#gdStyles');
    for (const s of GRAD_STYLES) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.style = s.value; b.title = s.label;
      if (GRAD_STYLE_SVG[s.value]) { b.innerHTML = GRAD_STYLE_SVG[s.value]; b.classList.add('gd-style-ic'); } else b.textContent = s.label.replace('渐变', '');
      b.onclick = () => {
        gradOpts.style = s.value; syncGradBar();
        
        const lg = liveGradInfo();
        if (lg && lg.F.get('Type') && lg.typeKey !== s.key) {
          const L = lg.line;
          pushDocHistory('渐变样式');
          setParamField(lg.idx, lg.tgt.target, 0, 'Type', s.key, lg.F.get('Type').value);
          const lg2 = liveGradInfo(); if (lg2) liveGradSetLine(lg2, L.x0, L.y0, L.x1, L.y1, false);
        }
        drawGizmo();
      };
      box.appendChild(b);
    }
    const bl = $('#gdBlend');
    for (const it of PAINT_MODES) {
      if (!it) { const o = document.createElement('option'); o.disabled = true; o.textContent = '──────'; bl.appendChild(o); continue; }
      const o = document.createElement('option'); o.value = it[0]; o.textContent = it[1]; bl.appendChild(o);
    }
    bl.onchange = () => { gradOpts.blend = bl.value; };
    $('#gdOpacity').addEventListener('change', () => {
      gradOpts.opacity = Math.max(0, Math.min(100, +$('#gdOpacity').value || 0)) / 100; syncGradBar();
    });
    $('#gdReverse').addEventListener('change', () => {
      gradOpts.reverse = $('#gdReverse').checked; syncGradBar();
      const lg = liveGradInfo(), f = lg && lg.F.get('Rvrs');
      if (f) { pushDocHistory('反向'); setParamField(lg.idx, lg.tgt.target, 0, 'Rvrs', gradOpts.reverse, f.value); drawGizmo(); }
    });
    $('#gdDither').addEventListener('change', () => {
      gradOpts.dither = $('#gdDither').checked;
      const lg = liveGradInfo(), f = lg && lg.F.get('Dthr');
      if (f) { pushDocHistory('仿色'); setParamField(lg.idx, lg.tgt.target, 0, 'Dthr', gradOpts.dither, f.value); }
    });
    $('#gdTrans').addEventListener('change', () => { gradOpts.transparency = $('#gdTrans').checked; syncGradBar(); });
    const me = $('#gdMethod');
    for (const k of GRADIENT_METHODS) { const o = document.createElement('option'); o.value = k; o.textContent = GRADIENT_METHOD_LABELS[k]; me.appendChild(o); }
    me.onchange = () => {
      gradOpts.method = me.value; syncGradBar();
      const lg = liveGradInfo(), f = lg && lg.F.get('gradientsInterpolationMethod');
      if (f) { pushDocHistory('渐变方法'); setParamField(lg.idx, lg.tgt.target, 0, 'gradientsInterpolationMethod', GRADIENT_METHOD_KEYS[gradOpts.method], f.value); }
      else if (lg) shell.status('这个渐变填充图层是旧版本 PS 做的（没有「方法」字段），只能按古典显示');
    };
  }
  const classic = gradOpts.mode === 'classic';
  $('#gdMode').value = gradOpts.mode;
  for (const id of ['#gdBlendWrap', '#gdOpacityWrap', '#gdTransWrap']) { const el = $(id); if (el) el.hidden = !classic; }
  for (const b of $('#gdStyles').children) b.classList.toggle('on', b.dataset.style === gradOpts.style);
  $('#gdBlend').value = gradOpts.blend;
  const opEl = $('#gdOpacity'); if (document.activeElement !== opEl) opEl.value = Math.round(gradOpts.opacity * 100);
  $('#gdReverse').checked = gradOpts.reverse;
  $('#gdDither').checked = gradOpts.dither;
  $('#gdTrans').checked = gradOpts.transparency;
  $('#gdMethod').value = gradOpts.method;
  const sw = $('#gdSwatch');
  if (sw) {
    sw.style.background = `linear-gradient(to right, ${gradCssStops()}), repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 8px 8px`;
    sw.title = `${gradModelName()}：点按可编辑渐变（渐变编辑器）`;
  }
  if (gradDrag) {
    const L = Math.hypot(gradDrag.x1 - gradDrag.x0, gradDrag.y1 - gradDrag.y0);
    const deg = Math.atan2(gradDrag.y1 - gradDrag.y0, gradDrag.x1 - gradDrag.x0) * 180 / Math.PI;
    $('#gdInfo').textContent = `${Math.round(L)} 像素 · ${deg.toFixed(1)}°`;
  } else if (!classic && !liveGradInfo()) $('#gdInfo').textContent = '拖一下新建渐变填充图层';
}
export function syncBucketBar(){
  const g = $('#grpBucket'); if (!g) return;
  if (!bucketBarBound) {
    set_bucketBarBound(true);
    $('#bkSource').onchange = () => { bucketOpts.source = $('#bkSource').value; syncBucketBar(); };
    $('#bkPattern').onchange = () => { bucketOpts.pattern = $('#bkPattern').value; };
    const bl = $('#bkBlend');
    for (const it of PAINT_MODES) {
      if (!it) { const o = document.createElement('option'); o.disabled = true; o.textContent = '──────'; bl.appendChild(o); continue; }
      const o = document.createElement('option'); o.value = it[0]; o.textContent = it[1]; bl.appendChild(o);
    }
    bl.onchange = () => { bucketOpts.blend = bl.value; };
    $('#bkOpacity').addEventListener('change', () => {
      bucketOpts.opacity = Math.max(0, Math.min(100, +$('#bkOpacity').value || 0)) / 100; syncBucketBar();
    });
    $('#bkTol').addEventListener('change', () => {
      bucketOpts.tolerance = Math.max(0, Math.min(255, Math.round(+$('#bkTol').value || 0))); syncBucketBar();
    });
    $('#bkAA').addEventListener('change', () => { bucketOpts.antialias = $('#bkAA').checked; });
    $('#bkContig').addEventListener('change', () => { bucketOpts.contiguous = $('#bkContig').checked; });
    $('#bkAll').addEventListener('change', () => { bucketOpts.allLayers = $('#bkAll').checked; });
  }
  $('#bkSource').value = bucketOpts.source;
  $('#bkBlend').value = bucketOpts.blend;
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = String(v); };
  set('#bkOpacity', Math.round(bucketOpts.opacity * 100));
  set('#bkTol', bucketOpts.tolerance);
  $('#bkAA').checked = bucketOpts.antialias;
  $('#bkContig').checked = bucketOpts.contiguous;
  $('#bkAll').checked = bucketOpts.allLayers;
  
  const pw = $('#bkPatternWrap'), ps = $('#bkPattern');
  if (pw) pw.hidden = bucketOpts.source !== 'pattern';
  if (ps && bucketOpts.source === 'pattern') {
    const list = docPatterns(), names = list.map(p => p.id).join('\u0001');
    if (ps.dataset.names !== names) {
      ps.dataset.names = names; ps.innerHTML = '';
      for (const p of list) ps.append(Object.assign(document.createElement('option'), { value: p.id, textContent: p.name || '(无名图案)' }));
      if (!list.some(p => p.id === bucketOpts.pattern)) bucketOpts.pattern = list.length ? list[0].id : '';
    }
    ps.value = bucketOpts.pattern;
    ps.disabled = !list.length;
    ps.title = list.length ? '文档里的图案资源' : '这份文档里没有图案资源（Patt 块）';
  }
  const sw = $('#bkSwatch');
  if (sw) { sw.hidden = bucketOpts.source !== 'fg'; sw.style.background = hexOf(fgRGB); }
}
export function syncEyeBar(){
  const g = $('#grpEyedrop'); if (!g) return;
  if (!eyeBarBound) {
    set_eyeBarBound(true);
    $('#edSize').onchange = () => { eyeOpts.size = +$('#edSize').value || 1; saveEyeOpts(); $('#edSize').blur(); };
    $('#edAll').onchange = () => { const v = $('#edAll').value; eyeOpts.sample = v === '1' ? 'all' : v === '0' ? 'cur' : v; saveEyeOpts(); $('#edAll').blur(); };
    const ring = $('#edRing'); if (ring) ring.onchange = () => { eyeOpts.ring = ring.checked; saveEyeOpts(); ring.blur(); };
  }
  $('#edSize').value = String(eyeOpts.size);
  $('#edAll').value = eyeOpts.sample;
  const ring = $('#edRing'); if (ring) ring.checked = eyeOpts.ring;
}


function syncGradFromLive(lg){
  const st = GRAD_STYLES.find(s => s.key === lg.typeKey);
  const f = p => { const x = lg.F.get(p); return x ? effParam(lg.idx, lg.tgt.target, 0, p, x.value) : undefined; };
  const meth = f('gradientsInterpolationMethod'), dth = f('Dthr');
  const next = { style: st ? st.value : gradOpts.style, reverse: lg.rev, dither: dth === undefined ? gradOpts.dither : !!dth,
                 method: meth === undefined ? 'classic' : (Object.keys(GRADIENT_METHOD_KEYS).find(k => GRADIENT_METHOD_KEYS[k] === meth) || gradOpts.method) };
  if (Object.keys(next).some(k => gradOpts[k] !== next[k])) { Object.assign(gradOpts, next); syncGradBar(); }
}

export function drawGradGizmo(ctx){
  const d = gradDrag;
  if (d) {
    ctx.save();
    ctx.lineWidth = dispPx(1);
    ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1);
    ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.stroke();
    ctx.setLineDash([dispPx(5), dispPx(4)]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
    ctx.setLineDash([]);
    const s = dispThr(6);
    for (const [px, py] of [[d.x0, d.y0], [d.x1, d.y1]]) {
      ctx.beginPath(); ctx.arc(px, py, s / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const lg = liveGradInfo(); if (!lg) return;
  syncGradFromLive(lg);
  

  const L = lg.line, E = liveGradEdit;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1);
  ctx.lineWidth = dispPx(4); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
  ctx.lineWidth = dispPx(2); ctx.strokeStyle = '#fff'; ctx.stroke();
  const circle = (p, r, fill, on) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = dispPx(on ? 3 : 2); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath(); ctx.arc(p.x, p.y, r + dispPx(on ? 1.5 : 1), 0, Math.PI * 2); ctx.stroke();
  };
  const colAt = loc => { if (!lg.model) return '#808080'; const c = gradColorAt(lg.model, loc); return `rgb(${c.r},${c.g},${c.b})`; };
  const selStop = liveGradSel && liveGradSel.idx === lg.idx ? liveGradSel.stop : null;
  circle({ x: L.x0, y: L.y0 }, dispThr(7), colAt(lg.rev ? 4096 : 0), false);
  circle({ x: L.x1, y: L.y1 }, dispThr(7), colAt(lg.rev ? 0 : 4096), false);
  if (lg.model) {
    const cl = lg.model.clrs;
    
    for (let k = 0; k < cl.length - 1; k++) {
      const p = liveGradMidPt(lg, k), r = dispThr(4);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
    }
    for (const st of cl) {
      if (st.loc <= 0 || st.loc >= 4096) continue;
      const off = E && E.stop === st && E.off;              
      ctx.globalAlpha = off ? 0.35 : 1;
      const p = off && E.lastPt ? E.lastPt : liveGradStopPt(lg, st.loc);
      circle(p, dispThr(5), rgbHex(st), st === selStop);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
