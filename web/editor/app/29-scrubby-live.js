




import './28-layer-props-transform.js';   
import { toolCursor } from '../icons.js';
import { QUADM, icon } from './01-boot.js';
import {
  beginMeshEdit, doc, docH, docW, endMeshEdit, layerDeletes, layerEdits, layerReorder, meshEditInProgress,
  meshRotState, pushHistory, textCrops, textRenders,
} from './02-doc-state.js';
import {
  beginLayerEdit, commitPanelTimer, docHistLock, endLayerEdit, pushDocHistory, set_commitPanelTimer,
  set_docHistLock,
} from './03-history.js';
import { commit, mapEditable, quadBBox, tfFrame } from './06-view-zoom-move.js';
import { layerOrderView } from './23-layers-panel.js';
import {
  dragAdjustDepth, rangeDragHold, schedulePanelRebuild, set_dragAdjustDepth, set_rangeDragHold,
} from './24-layer-ops-queue.js';
import { setLayerVisible } from './27-gradient-editor.js';
import {
  ensureLayerTransform, isMeshTransform, meshBBox, mkEl, syncTransformInputs, transformChanged,
} from './28-layer-props-transform.js';
import { layerPixelSource, renderStaticLayers, textCropCanvas } from './30-render.js';
import { cropCanvasAlpha, cropRGBABuf } from './49-fonts-text-model.js';











export const EV = el => ((el.ownerDocument && el.ownerDocument.defaultView) || window).Event;
function scrubHandleFor(inp){
  const prev = inp.previousElementSibling;
  
  if (prev && prev.classList && prev.classList.contains('tx-ic')) return prev;
  if (prev && /^(SPAN|LABEL|I|B)$/.test(prev.tagName) && prev.textContent.trim() && !prev.querySelector('input')) return prev;
  const host = inp.parentElement;
  if (host && /^(LABEL|SPAN)$/.test(host.tagName)) {
    const first = host.firstElementChild;
    if (first && first !== inp && /^(SPAN|I|B)$/.test(first.tagName) && first.textContent.trim()) return first;
  }
  if (!inp.parentElement) return null;
  const grip = mkEl('i', { className: 'scrub scrub-grip', title: '按住拖动可调整数值' });
  grip.append(icon('chevrons-left-right', 12));
  inp.parentElement.insertBefore(grip, inp);
  return grip;
}



















export function beginDragAdjust(e, onDelta, onEnd, mulOf){
  e.preventDefault();
  const src = (e.currentTarget && e.currentTarget.setPointerCapture) ? e.currentTarget : e.target;
  try { src && src.setPointerCapture && src.setPointerCapture(e.pointerId); } catch { }
  







  const hadLock = docHistLock;
  if (!hadLock) set_docHistLock(true);
  set_dragAdjustDepth(dragAdjustDepth + 1);
  
  if (commitPanelTimer) { clearTimeout(commitPanelTimer); set_commitPanelTimer(0); }
  try { if (document.body) document.body.classList.add('drag-adjust'); } catch { }
  const vw = () => (typeof window !== 'undefined' && window.innerWidth) || 1920;
  const mul = mulOf || (ev => (ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1));
  let lastX = e.clientX, acc = 0;
  





  const lockEl = document.body || document.documentElement;
  const canLock = !!(lockEl && lockEl.requestPointerLock);
  let locked = false, lockPending = false, lockAt = 0, relock = false, vx = e.clientX, vy = e.clientY, ghost = null;
  const placeGhost = () => {
    if (!ghost) return;
    ghost.style.transform = `translate(${Math.round(vx - ghost.__hx)}px, ${Math.round(vy - ghost.__hy)}px)`;
  };
  const showGhost = () => {
    if (ghost) return;
    ghost = document.createElement('div');
    const css = String(toolCursor('scrubH') || '');
    const m = css.match(/url\("?([^")]+)"?\)\s*(\d+)?\s*(\d+)?/);
    ghost.__hx = m && m[2] ? +m[2] : 9; ghost.__hy = m && m[3] ? +m[3] : 4;
    ghost.className = 'drag-adjust-ghost';
    ghost.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:32px;pointer-events:none;z-index:2147483647;'
      + 'background-repeat:no-repeat;background-position:0 0;'
      + (m ? `background-image:url("${m[1]}");` : 'background:none;');
    if (!m) ghost.textContent = '↔';
    document.body.append(ghost);
    placeGhost();
  };
  const hideGhost = () => { if (ghost) { ghost.remove(); ghost = null; } };
  const onLockChange = () => {
    lockPending = false;
    const now = document.pointerLockElement === lockEl;
    if (now && !locked) { locked = true; showGhost(); }
    else if (!now && locked) { locked = false; relock = true; hideGhost(); }
  };
  const onLockError = () => { lockPending = false; lockAt = Date.now(); };
  if (canLock) {
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
  }
  const tryLock = ev => {
    if (!canLock || locked || lockPending || closedRef.v) return;
    if (Date.now() - lockAt < 400) return;               
    lockPending = true; lockAt = Date.now();
    vx = ev.clientX; vy = ev.clientY;
    try {
      const r = lockEl.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(onLockError);
    } catch { onLockError(); }
  };
  const nearEdge = ev => {
    const EDGE = 3;
    const W = vw();
    if (ev.clientX <= EDGE || ev.clientX >= W - 1 - EDGE) return true;
    const sc = typeof screen !== 'undefined' ? screen : null;
    if (sc && Number.isFinite(ev.screenX) && sc.width > 0) {
      const L = Number.isFinite(sc.availLeft) ? sc.availLeft : 0;
      const Wd = sc.availWidth || sc.width;
      if (ev.screenX <= L + EDGE || ev.screenX >= L + Wd - 1 - EDGE) return true;
    }
    return false;
  };
  const closedRef = { v: false };
  const move = ev => {
    let dx;
    if (locked) {
      
      dx = +ev.movementX || 0;
      const W = vw(), H = (typeof window !== 'undefined' && window.innerHeight) || 1080;
      vx += dx; vy = Math.max(0, Math.min(H - 1, vy + (+ev.movementY || 0)));
      while (vx >= W) vx -= W;
      while (vx < 0) vx += W;
      placeGhost();
    } else {
      if (relock) { relock = false; lastX = ev.clientX; }  
      dx = ev.clientX - lastX;
      

      if (dx <= -vw() * 0.75) dx += vw();
      else if (dx >= vw() * 0.75) dx -= vw();
      lastX = ev.clientX;
      if (nearEdge(ev)) tryLock(ev);
    }
    dx *= mul(ev);
    acc += dx;
    onDelta(acc, ev);
  };
  let closed = false;
  const up = () => {
    if (closed) return;                                  
    closed = true;
    closedRef.v = true;
    if (canLock) {
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      try { if (document.pointerLockElement === lockEl && document.exitPointerLock) document.exitPointerLock(); } catch { }
    }
    locked = false; hideGhost();
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    try { src && src.releasePointerCapture && src.releasePointerCapture(e.pointerId); } catch { }
    try { if (document.body) document.body.classList.remove('drag-adjust'); } catch { }
    try {
      if (onEnd) onEnd();                                
    } finally {
      


      if (!hadLock) set_docHistLock(false);                 
      endDragAdjust();                                   
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return { up, get dx(){ return acc; } };
}



function endDragAdjust(){
  if (dragAdjustDepth > 0) set_dragAdjustDepth(dragAdjustDepth - 1);
  if (dragAdjustDepth === 0) schedulePanelRebuild();
}
export function startScrub(e, inp, handle){
  if (e.button != null && e.button !== 0) return;
  if (inp.disabled || inp.readOnly) return;
  e.preventDefault();
  

  const inDlg = !!(inp.closest && inp.closest('dialog'));
  if (!inDlg) beginLayerEdit();
  const step = +inp.step > 0 ? +inp.step : 1;
  const min = inp.min === '' ? -Infinity : +inp.min;
  const max = inp.max === '' ? Infinity : +inp.max;
  const dec = (String(step).split('.')[1] || '').length;
  const startV = +inp.value || 0;
  let last = startV;
  handle.classList.add('scrubbing');
  beginDragAdjust(e, (acc, ev) => {
    let v = startV + acc * step;
    v = Math.min(max, Math.max(min, v));
    v = +v.toFixed(Math.min(4, Math.max(dec, ev.altKey ? dec + 1 : dec)));
    if (v === last) return;
    last = v; inp.value = String(v);
    const EvI = EV(inp); inp.dispatchEvent(new EvI('input', { bubbles: true }));
    liveChange(inp);                                   
  }, () => {
    handle.classList.remove('scrubbing');
    if (!inDlg) endLayerEdit();
    if (last !== startV) endLiveChange(inp, true);
  });
}











const liveStates = new WeakMap();
const cancelRAF = id => { try { (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)(id); } catch { clearTimeout(id); } };
function liveChange(inp){
  if (!inp || (inp.closest && inp.closest('dialog'))) return;
  let st = liveStates.get(inp);
  if (!st) { st = { raf: 0, locked: false, dead: false }; liveStates.set(inp, st); }
  if (st.raf) return;
  st.raf = requestAnimationFrame(() => {
    st.raf = 0;
    

    if (st.dead) return;
    if (!st.locked && !docHistLock) { st.locked = true; set_docHistLock(true); }
    const EvC = EV(inp); inp.dispatchEvent(new EvC('change', { bubbles: true }));
  });
}
function endLiveChange(inp, fire){
  const st = inp && liveStates.get(inp);
  if (st && st.raf) { cancelRAF(st.raf); st.raf = 0; }
  if (fire) { const EvC = EV(inp); inp.dispatchEvent(new EvC('change', { bubbles: true })); }
  if (st) { if (st.locked) set_docHistLock(false); st.dead = true; liveStates.delete(inp); }
}

document.addEventListener('input', e => { const t = e.target; if (t && t.type === 'range' && e.isTrusted) liveChange(t); }, true);
document.addEventListener('change', e => {
  const t = e.target, st = t && t.type === 'range' && e.isTrusted && liveStates.get(t);
  if (st) { if (st.raf) { cancelRAF(st.raf); st.raf = 0; } setTimeout(() => endLiveChange(t, false), 0); }
}, true);




document.addEventListener('pointerdown', e => {
  const t = e.target;
  if (t && t.type === 'range' && !t.disabled && !(t.closest && t.closest('dialog'))) set_rangeDragHold(true);
}, true);
const endRangeDrag = () => {
  if (!rangeDragHold) return;
  set_rangeDragHold(false);
  setTimeout(schedulePanelRebuild, 0);
};
window.addEventListener('pointerup', endRangeDrag, true);
window.addEventListener('pointercancel', endRangeDrag, true);
export function installScrubbers(root){
  const scope = root && root.querySelectorAll ? root : document;
  let n = 0;
  for (const inp of scope.querySelectorAll('input[type=number]:not([data-scrub])')) {
    inp.dataset.scrub = '1';
    const h = scrubHandleFor(inp);
    if (!h) continue;
    if (h.dataset.scrubBound) continue;                 
    h.dataset.scrubBound = '1';
    h.classList.add('scrub');
    const hit = scrubHitOf(h);
    if (!hit.title) hit.title = '按住左右拖动可调整数值';
    hit.addEventListener('pointerdown', e => startScrub(e, inp, hit));
    n++;
  }
  return n;
}




export function scrubHitOf(h){
  if (h.classList.contains('scrub-grip') || h.classList.contains('scrub-hit') || h.classList.contains('tx-ic')) return h;
  const had = h.querySelector(':scope > .scrub-hit');
  if (had) return had;
  const hit = h.ownerDocument.createElement('span');
  hit.className = 'scrub-hit';
  while (h.firstChild) hit.appendChild(h.firstChild);
  h.appendChild(hit);
  if (h.title) { hit.title = h.title; h.removeAttribute('title'); }
  return hit;
}
export function makeScrubLabel(text, idx, input, apply){
  const host = mkEl('span', { className: 'scrub', textContent: text, title: '按住左右拖拽调整数值；Shift 精细（×0.1）、Alt 粗调（×10）' });
  host.dataset.scrubBound = '1';
  const s = scrubHitOf(host);
  s.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    if (isMeshTransform(idx)) beginMeshEdit(); else beginLayerEdit();
    const startV = Math.round(+input.value || 0);
    let last = startV;
    


    beginDragAdjust(e, (acc, ev) => {
      const v = Math.round(startV + acc * (ev.shiftKey ? 0.1 : ev.altKey ? 10 : 1));
      if (v !== last) { last = v; input.value = v; apply(v); }   
    }, () => { endMeshEdit(); endLayerEdit(); },
    ev => (ev.shiftKey ? 0.1 : ev.altKey ? 10 : 1));
  });
  return host;
}

export function rotateLayer(idx, absDeg){
  const deg = ((Math.round(absDeg) % 360) + 360) % 360;
  if (isMeshTransform(idx)) {
    const cur = meshRotState[idx] || 0;
    const delta = deg - cur;
    if (!delta) return;
    const b = meshBBox(); const cx = b.x + b.w/2, cy = b.y + b.h/2;
    const a = delta * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    if (!meshEditInProgress) pushHistory();
    mapEditable(p => { const dx = p.x - cx, dy = p.y - cy; return { x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos }; });
    meshRotState[idx] = deg;
    commit();
  } else {
    const t = ensureLayerTransform(idx);
    if (t.quad) {                                
      const b = quadBBox(t.quad), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const a = (deg - (t.rotQ || 0)) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      t.quad = t.quad.map(p => [cx + (p[0] - cx) * cos - (p[1] - cy) * sin, cy + (p[0] - cx) * sin + (p[1] - cy) * cos]);
      t.rotQ = deg;
      const nb = quadBBox(t.quad); t.x = nb.x; t.y = nb.y; t.w = nb.w; t.h = nb.h;
    } else t.rot = deg;
    renderStaticLayers();
  }
  syncTransformInputs();
}







export function rasterizeTransformed(idx, opts = {}){
  const t = transformChanged(idx); if (!t) return null;
  const clip = opts.clip || null;
  if (t.quad) {                                  
    const px = layerPixelSource(idx);
    if (!px || !QUADM) return null;
    const r = QUADM.warpQuad(px, t.quad, { samples: 2, flipX: !!t.flipX, flipY: !!t.flipY, clip });
    if (!r) return null;
    return cropRGBABuf(r.data, r.width, r.height, r.x, r.y);
  }
  const l = doc.layers[idx];
  let src, base;
  if (textRenders[idx] && textCrops[idx]) {
    src = textCropCanvas(idx); const b = textCrops[idx].bounds;
    base = { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top };
  } else if (l && l.rgba && l.width > 0 && l.height > 0) {
    const off = new OffscreenCanvas(l.width, l.height);
    off.getContext('2d').putImageData(new ImageData(l.rgba instanceof Uint8ClampedArray && l.rgba.length === l.width * l.height * 4 ? l.rgba : new Uint8ClampedArray(l.rgba), l.width, l.height), 0, 0);   
    src = off; base = { x: l.bounds.left, y: l.bounds.top, w: l.width, h: l.height };
  } else return null;
  
  let box = quadBBox(tfFrame(t).corners);
  box = { x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 };
  if (clip) {
    const x0 = Math.max(box.x, clip.x), y0 = Math.max(box.y, clip.y);
    const x1 = Math.min(box.x + box.w, clip.x + clip.width), y1 = Math.min(box.y + box.h, clip.y + clip.height);
    box = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }
  if (!(box.w > 0 && box.h > 0)) return null;
  const cv = document.createElement('canvas'); cv.width = box.w; cv.height = box.h;
  const c2 = cv.getContext('2d');
  c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';   
  c2.save();
  c2.translate(t.x + t.w/2 - box.x, t.y + t.h/2 - box.y);
  c2.rotate(t.rot * Math.PI / 180);
  c2.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
  c2.drawImage(src, -t.w/2, -t.h/2, t.w, t.h);
  c2.restore();
  const cp = cropCanvasAlpha(cv);
  if (!cp) return null;
  return { rgba: cp.rgba, bounds: { left: cp.bounds.left + box.x, top: cp.bounds.top + box.y,
                                    right: cp.bounds.right + box.x, bottom: cp.bounds.bottom + box.y } };
}


export let soloSnapshot = null;         
export function set_soloSnapshot(v) { return (soloSnapshot = v); }   
export function setLayerSolo(idx){
  const vis = i => { const e2 = layerEdits[i]; return e2 && e2.visible != null ? e2.visible : !(doc.layers[i].hidden); };
  if (soloSnapshot && soloSnapshot.idx === idx) {
    pushDocHistory();
    for (const [i, v] of soloSnapshot.map.entries()) setLayerVisible(i, v);
    soloSnapshot = null;
    return;
  }
  pushDocHistory();
  soloSnapshot = { idx, map: doc.layers.map((_, i) => vis(i)) };
  

  const v = layerOrderView(), keep = new Set([idx]), inner = new Set();
  for (let p = v.nodes[idx] && v.nodes[idx].parent; p != null; p = v.nodes[p] && v.nodes[p].parent) keep.add(p);
  const own = v.nodes[idx] && v.nodes[idx].group && v.nodes[idx].block ? v.nodes[idx].block.ids : [];
  for (const k of own) if (k !== idx) inner.add(k);
  doc.layers.forEach((_, i) => { if (!inner.has(i)) setLayerVisible(i, keep.has(i)); });
}



export function displayOrder(){
  if (!doc) return [];                 
  const base = layerReorder || doc.layers.map((_, i) => i);
  return base.filter(i => !layerDeletes.has(i));
}



function ensureCanvas(cv){
  if (cv.width !== docW || cv.height !== docH) { cv.width = docW; cv.height = docH; return true; }
  return false;
}




export let gizmoTx = { sx: 1, sy: 1, tx: 0, ty: 0 };
export function set_gizmoTx(v) { return (gizmoTx = v); }   
