




import './05-layer-lock-guides.js';   
import { toolCursor, rotCursorName } from '../icons.js';
import { preferences as PREF } from '../preferences.js';
import { tools } from '../tools.js';
import { rasterWarpGeometryChanged, rasterWarpExportOptions } from '../transform-warp-raster.js';
import { promoteWarpCachedTopology, warpMeshSignature } from '../warp-cached-preview.js';
import {
  $, cloneDeform, deformEquals, freshLayerInfo, patchCountX, patchCountY, unsplitMeshU, unsplitMeshV,
} from './01-boot.js';
import { cur, doc, docW, layerDeletes, li, pushHistory, soEdits, sos, textCrops, viewFlip } from './02-doc-state.js';
import { updateUndoButtons } from './03-history.js';
import {
  applyPan, fitStage, nextZoomStep, padL, padT, panX, panY, set_panX, set_panY, set_zoom, set_zoomFitMode,
  viewH, viewW, zoom,
} from './04-view-chrome.js';
import { viewport, zoomAtClient } from './05-layer-lock-guides.js';
import { beginLayerMarquee } from './07-nav-histogram.js';
import { tfSelFrameValues, tfState } from './19-free-transform.js';
import { pointInQuadLocal } from './20-snap-smart-object.js';
import { deformOpts, deformTool } from './22-deform-tools.js';
import { selLayer } from './23-layers-panel.js';
import { warpSession } from './26-layer-create.js';
import { getTransformValues, transformChanged } from './28-layer-props-transform.js';
import { renderWarpNow } from './30-render.js';
import { docTool, handActive, moveAutoOn, moveOpts, viewAngle } from './31-selection-brush.js';
import { modKeys, panCursorName, setGizmoCursorString, syncGizmoCursor } from './32-cursors-select-options.js';
import { dispThr, gizmo, syncDocTab, toDoc } from './46-smart-filter-panel.js';








export const zoomOpts = { scrubby: true };
try { const v = JSON.parse(localStorage.getItem('psd_editor.zoomOpts') || 'null'); if (v && typeof v.scrubby === 'boolean') zoomOpts.scrubby = v.scrubby; } catch {}
export function saveZoomOpts(){ try { localStorage.setItem('psd_editor.zoomOpts', JSON.stringify(zoomOpts)); } catch {} }
export let zoomGest = null;
let zoomBoxEl = null;
export function zoomBox(show, x0, y0, x1, y1){
  if (!zoomBoxEl) {
    zoomBoxEl = document.createElement('div');
    zoomBoxEl.className = 'zoom-marquee';
    zoomBoxEl.style.cssText = 'position:fixed;z-index:50;pointer-events:none;border:1px dashed #fff;outline:1px dashed #000;outline-offset:-2px;display:none';
    document.body.appendChild(zoomBoxEl);
  }
  if (!show) { zoomBoxEl.style.display = 'none'; return; }
  Object.assign(zoomBoxEl.style, { display: 'block', left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px',
    width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
}

export function centerDocPoint(x, y){
  const st = $('#stage'), vp = $('#viewport');
  const r = st.getBoundingClientRect(), v = vp.getBoundingClientRect();
  if (!(r.width > 0) || !(v.width > 0)) return;
  const a = viewAngle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  let lx = (padL() + x) * zoom - viewW() * zoom / 2; const ly = (padT() + y) * zoom - viewH() * zoom / 2;
  if (viewFlip) lx = -lx;
  const px = r.left + r.width / 2 + cos * lx - sin * ly, py = r.top + r.height / 2 + sin * lx + cos * ly;
  set_panX(panX + ((v.left + vp.clientWidth / 2) - px)); set_panY(panY + ((v.top + vp.clientHeight / 2) - py));
  applyPan();
}

function zoomToClientRect(x0, y0, x1, y1){
  const a = toDoc({ clientX: Math.min(x0, x1), clientY: Math.min(y0, y1) }), b = toDoc({ clientX: Math.max(x0, x1), clientY: Math.max(y0, y1) });
  const w = Math.max(1, Math.abs(b.x - a.x)), h = Math.max(1, Math.abs(b.y - a.y));
  const vp = $('#viewport');
  const nz = Math.min(32, Math.max(0.01, Math.min((vp.clientWidth - 48) / w, (vp.clientHeight - 48) / h)));
  set_zoomFitMode(false); set_zoom(nz); fitStage(false);
  centerDocPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
}
export function beginZoomGesture(ev, out){
  if (!docW || zoomGest) return;
  const g = zoomGest = { x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, z0: zoom, moved: false, out: !!out,
                         scrubby: zoomOpts.scrubby, holdTimer: 0, raf: 0, held: false };
  
  if (g.scrubby && PREF.get('tools.animatedZoom') !== false) g.holdTimer = setTimeout(() => {   
    if (zoomGest !== g || g.moved) return;
    g.held = true;
    let last = performance.now();
    const tick = now => {
      if (zoomGest !== g || g.moved) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const nz = Math.min(32, Math.max(0.01, zoom * Math.exp((g.out ? -1.4 : 1.4) * dt)));
      if (nz !== zoom) zoomAtClient(g.x0, g.y0, nz);
      g.raf = requestAnimationFrame(tick);
    };
    g.raf = requestAnimationFrame(tick);
  }, 260);
  
  try { ev.target.setPointerCapture(ev.pointerId); } catch {}
  const move = e => {
    if (zoomGest !== g) return;
    g.x = e.clientX; g.y = e.clientY;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < 3) return;
    if (!g.moved) { g.moved = true; clearTimeout(g.holdTimer); if (g.raf) cancelAnimationFrame(g.raf); if (g.held) { g.z0 = zoom; } }
    if (g.scrubby) zoomAtClient(g.x0, g.y0, Math.min(32, Math.max(0.01, g.z0 * Math.exp(dx / 160))));
    else zoomBox(true, g.x0, g.y0, e.clientX, e.clientY);
  };
  const up = e => {
    if (zoomGest !== g) return;
    zoomGest = null;
    clearTimeout(g.holdTimer); if (g.raf) cancelAnimationFrame(g.raf);
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
    zoomBox(false);
    if (g.held && !g.moved) { syncZoomUI(); return; }
    if (!g.moved) {
      const dp = PREF.get('tools.zoomClickCenter') ? toDoc({ clientX: g.x0, clientY: g.y0 }) : null;
      zoomAtClient(g.x0, g.y0, nextZoomStep(g.out ? -1 : 1));
      if (dp) centerDocPoint(dp.x, dp.y);          
    }
    else if (!g.scrubby) {
      if (Math.abs(g.x - g.x0) > 4 && Math.abs(g.y - g.y0) > 4) zoomToClientRect(g.x0, g.y0, g.x, g.y);
      else zoomAtClient(g.x0, g.y0, nextZoomStep(g.out ? -1 : 1));
    }
    syncZoomUI();
  };
  const cancel = () => { if (zoomGest !== g) return; zoomGest = null; clearTimeout(g.holdTimer); if (g.raf) cancelAnimationFrame(g.raf); zoomBox(false);
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
}
function syncZoomUI(){ try { syncDocTab(); } catch {} }

export function tempZoomMode(){ return (spaceDown || handActive()) ? (modKeys.alt ? 'out' : modKeys.ctrl ? 'in' : '') : ''; }   




export let birdEye = null, birdEl = null;
function birdEyeBox(show, cx, cy, w, h){
  if (!birdEl) {
    birdEl = document.createElement('div'); birdEl.className = 'bird-eye';
    birdEl.style.cssText = 'position:fixed;z-index:50;pointer-events:none;border:1px solid #1473e6;box-shadow:0 0 0 1px rgba(255,255,255,.6);display:none';
    document.body.appendChild(birdEl);
  }
  if (!show) { birdEl.style.display = 'none'; return; }
  Object.assign(birdEl.style, { display: 'block', left: (cx - w / 2) + 'px', top: (cy - h / 2) + 'px', width: w + 'px', height: h + 'px' });
}
function hKeyHeld(){ try { return tools.springKey() === 'H'; } catch { return false; } }
function beginBirdEye(ev){
  if (!docW) return false;
  const vp = $('#viewport');
  const z0 = zoom, vw = vp.clientWidth, vh = vp.clientHeight;
  fitStage(true);
  if (zoom >= z0 * 0.999) { set_zoom(z0); set_zoomFitMode(false); fitStage(false); return false; }   
  const k = zoom / z0;
  birdEye = { z0, w: vw * k, h: vh * k, pid: ev.pointerId };
  birdEyeBox(true, ev.clientX, ev.clientY, birdEye.w, birdEye.h);
  try { ev.target.setPointerCapture(ev.pointerId); } catch {}
  const move = e => { if (birdEye) birdEyeBox(true, e.clientX, e.clientY, birdEye.w, birdEye.h); };
  const up = e => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const b = birdEye; birdEye = null; birdEyeBox(false);
    if (!b) return;
    const p = toDoc(e);
    set_zoomFitMode(false); set_zoom(b.z0); fitStage(false);
    centerDocPoint(p.x, p.y);
    updatePanCursor(); syncZoomUI();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return true;
}


export let spaceDown = false, panState = null;
export function set_spaceDown(v) { return (spaceDown = v); }   
export function set_panState(v) { return (panState = v); }   
export function updatePanCursor(){
  const hand = spaceDown || handActive();
  const tz = tempZoomMode();                     
  const name = tz ? (tz === 'out' ? 'zoomOut' : 'zoomIn') : panCursorName();
  viewport.style.cursor = (hand || (panState && panState.middle)) ? toolCursor(name) : '';
  


  if (hand) setGizmoCursorString(toolCursor(name));
  else syncGizmoCursor();
}
viewport.addEventListener('pointerdown', e => {
  if (e.target && e.target.closest && e.target.closest('.view-sb')) return;     
  
  if (e.button === 0 && (spaceDown || handActive()) && (e.metaKey || e.ctrlKey || e.altKey)) { e.preventDefault(); beginZoomGesture(e, e.altKey); return; }
  
  if (e.button === 0 && !spaceDown && !handActive() && doc && !li && docTool === 'move' && !tfState && e.target === viewport && moveAutoOn(e)) {
    e.preventDefault(); beginLayerMarquee(e, toDoc(e)); return;
  }
  
  if (e.button === 0 && handActive() && hKeyHeld() && !birdEye) { e.preventDefault(); if (beginBirdEye(e)) return; }
  
  const middle = e.button === 1;
  if (!middle && (!(spaceDown || handActive()) || e.button !== 0)) return;
  if (middle) e.preventDefault();
  panState = { x: e.clientX, y: e.clientY, px: panX, py: panY, middle };
  try { viewport.setPointerCapture(e.pointerId); } catch {  }
  updatePanCursor();
});
viewport.addEventListener('pointermove', e => {
  if (!panState) return;
  set_panX(panState.px + (e.clientX - panState.x));
  set_panY(panState.py + (e.clientY - panState.y));
  applyPan();
});
const endPan = () => { panState = null; updatePanCursor(); };

viewport.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
viewport.addEventListener('pointerup', endPan);
viewport.addEventListener('pointercancel', endPan);
$('#unsplitAll').onclick = () => {
  if(!li || li.deform) return;
  pushHistory();
  while(patchCountX(li.xn) > 1) applyMesh(unsplitMeshU(li.points, li.xn, li.yn, 1, li.sliceX));
  while(patchCountY(li.yn) > 1) applyMesh(unsplitMeshV(li.points, li.xn, li.yn, 1, li.sliceY));
  commit();
};


export function applyMesh(m, { preserveAppearance = false } = {}){
  const before=preserveAppearance&&warpSession?.preview ? warpMeshSignature(li) : null;
  li.points = m.points; li.xn = m.cols; li.yn = m.rows;
  if(m.sliceX !== undefined) li.sliceX = m.sliceX;
  if(m.sliceY !== undefined) li.sliceY = m.sliceY;
  if(before)promoteWarpCachedTopology(warpSession,before,li);
}
export function commit(){
  if (li.deforms && li.deforms.length) {
    
    const entries = li.deforms.map(d => ({ deform: cloneDeform(d), ...(d.at != null ? { at: d.at } : { create: true }) }));
    const anyNew = entries.some(e => e.create);
    
    const orig = anyNew ? null : (freshLayerInfo(sos[cur]).deforms || []);
    const same = !anyNew && orig.length === li.deforms.length && orig.every((o, i) => deformEquals(o, li.deforms[i]));
    if (same) delete soEdits[cur]; else soEdits[cur] = { deforms: entries, created: anyNew };
  } else soEdits[cur] = { points: li.points, xn: li.xn, yn: li.yn, sliceX: li.sliceX, sliceY: li.sliceY };
  rasterWarpGeometryChanged();
  if(soEdits[cur]&&!li.deforms){li.warpOptions=rasterWarpExportOptions();soEdits[cur].warpOptions=li.warpOptions;}
  renderWarpNow();
  updateUndoButtons();
}





export function deformHandles(){
  if (!li || !li.deform) return [];
  
  if (li.deform.kind === 'perspectiveWarp') {
    const layout = deformTool === 'perspectiveWarp' && deformOpts.pMode === 'layout';
    return (layout ? li.deform.vertices : li.deform.warped).map((p, i) => ({ p, kind: 'vertex', i, layout }));
  }
  const out = [];
  li.deform.shapes.forEach((s, j) => s.pins.forEach((pin, i) => out.push({ p: pin.pos, kind: 'pin', j, i })));
  return out;
}

export function editablePoints(){
  if (!li) return [];
  if (li.points) return li.points;
  if (li.deform.kind === 'perspectiveWarp') return li.deform.warped;
  const out = [];
  for (const s of li.deform.shapes) { out.push(...s.def); for (const pin of s.pins) out.push(pin.pos); }
  return out;
}
export function mapEditable(fn){                      
  if (li.points) { li.points = li.points.map(fn); return; }
  for (const p of editablePoints()) { const q = fn(p); p.x = q.x; p.y = q.y; }
}



export function layerSelBBox(i){
  let b;
  if (textCrops[i]) { const c = textCrops[i].bounds; b = { x: c.left, y: c.top, w: c.right - c.left, h: c.bottom - c.top }; }
  else if (doc && doc.layers[i] && doc.layers[i].width > 0) { const lb = doc.layers[i].bounds; b = { x: lb.left, y: lb.top, w: lb.right - lb.left, h: lb.bottom - lb.top }; }
  else return null;
  const t = transformChanged(i);
  if (!t) return b;
  if (t.quad) return quadBBox(t.quad);
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2, a = t.rot * Math.PI / 180;
  const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
  const hw = (t.w * cos + t.h * sin) / 2, hh = (t.w * sin + t.h * cos) / 2;   
  return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
}


export function tfFrame(t){
  const a = t.quad ? 0 : (t.rot || 0) * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  let c, cx, cy;
  if (t.quad) {                                  
    c = t.quad.map(q => [q[0], q[1]]);
    cx = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4;
    cy = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
  } else {
    cx = t.x + t.w / 2; cy = t.y + t.h / 2;
    const P = (lx, ly) => [cx + (lx - t.w / 2) * cos - (ly - t.h / 2) * sin, cy + (lx - t.w / 2) * sin + (ly - t.h / 2) * cos];
    c = [P(0, 0), P(t.w, 0), P(t.w, t.h), P(0, t.h)];
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return { cx, cy, a, cos, sin, corners: c,
           handles: [c[0], mid(c[0], c[1]), c[1], mid(c[1], c[2]), c[2], mid(c[2], c[3]), c[3], mid(c[3], c[0])] };
}

const TF_CURSORS = ['resizeNWSE', 'stretchV', 'resizeNESW', 'stretchH', 'resizeNWSE', 'stretchV', 'resizeNESW', 'stretchH'];

export function tfHandleCursor(pt){
  const idx = tfState ? tfState.idx : selLayer;
  if ((!tfState && !moveOpts.showTf) || idx < 0 || layerDeletes.has(idx)) return '';
  const t = tfState && (tfState.sel || tfState.selOnly || tfState.pathOnly) ? tfSelFrameValues() : getTransformValues(idx);
  if (!(t && t.w > 0 && t.h > 0)) return '';
  const scale = gizmo.getBoundingClientRect().width ? dispThr(1) : 1;
  const tol = Math.max(8 * scale, 6);
  const f = tfFrame(t);
  for (let k = 0; k < 8; k++)
    if (Math.abs(pt.x - f.handles[k][0]) <= tol && Math.abs(pt.y - f.handles[k][1]) <= tol) return TF_CURSORS[k];
  return '';
}



export function tfRotateCursor(pt){
  const idx = tfState ? tfState.idx : selLayer;
  if ((!tfState && !moveOpts.showTf) || idx < 0 || layerDeletes.has(idx)) return '';
  const t = tfState && (tfState.sel || tfState.selOnly || tfState.pathOnly) ? tfSelFrameValues() : getTransformValues(idx);
  if (!(t && t.w > 0 && t.h > 0)) return '';
  const scale = gizmo.getBoundingClientRect().width ? dispThr(1) : 1;
  const f = tfFrame(t);
  const rz = Math.max(24 * scale, 14);
  

  if (tfState) { if (pointInQuadLocal(f.corners, pt.x, pt.y)) return ''; }
  else if (!f.corners.some(c => Math.hypot(pt.x - c[0], pt.y - c[1]) <= rz)) return '';
  return rotCursorName(Math.atan2(pt.y - f.cy, pt.x - f.cx) * 180 / Math.PI);
}

export function quadBBox(q){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of q) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
}


addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  const dlg = e.target && e.target.closest ? e.target.closest('dialog[open]') : null;
  const d = dlg || [...document.querySelectorAll('dialog[open]')].pop();
  if (!d) return;
  const t = e.target, tag = (t && t.tagName) || '';
  if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (t && t.isContentEditable)) return;
  const ok = [...d.querySelectorAll('button.primary, button[value="ok"]')].filter(b => !b.disabled && b.offsetParent !== null).pop();
  if (!ok) return;
  e.preventDefault(); e.stopPropagation();
  if (tag === 'INPUT') t.dispatchEvent(new Event('change', { bubbles: true }));   
  ok.click();
}, true);
