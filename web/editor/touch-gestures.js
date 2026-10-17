









import { get as getPreference } from './preferences.js';

let A = null;
const touches = new Map();        
let gesture = null;               
let penSeen = false, penDown = false, firstTouch = null, handPan = null;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const swallow = e => { e.preventDefault(); e.stopImmediatePropagation(); };
const clearGesture = () => { touches.clear(); gesture = null; handPan = null; firstTouch = null; };

function startGesture() {
  const [a, b] = [...touches.values()];
  gesture = { d0: Math.max(1, dist(a, b)), a0: angle(a, b), z0: A.zoom(), ang0: A.angle(), last: mid(a, b), moved: 0, zoomed: false, rotated: false, n: touches.size, t0: performance.now() };
}

function onDown(e) {
  if (e.pointerType === 'pen') { penSeen = true; penDown = true; return; }
  if (e.pointerType !== 'touch' || !A.hasDoc() || getPreference('tools.touchRotate') === false) return;
  if (penDown) { swallow(e); return; }                               
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  if (touches.size === 1) {
    if (penSeen) { swallow(e); handPan = { x: e.clientX, y: e.clientY }; return; }   
    firstTouch = { id: e.pointerId, t0: performance.now(), target: e.target };
    return;                                                          
  }
  swallow(e);
  if (firstTouch && touches.size === 2) {
    
    if (performance.now() - firstTouch.t0 < 250) {
      try {
        const ev = new PointerEvent('pointercancel', { pointerId: firstTouch.id, pointerType: 'touch', bubbles: true, cancelable: false });
        (firstTouch.target || window).dispatchEvent(ev); window.dispatchEvent(ev);
      } catch {  }
      A.cancelActive();
    }
    firstTouch = null;
  }
  handPan = null;
  startGesture();
}

function onMove(e) {
  if (e.pointerType !== 'touch') return;
  if (getPreference('tools.touchRotate') === false) { clearGesture(); return; }
  const t = touches.get(e.pointerId);
  if (!t) return;
  t.x = e.clientX; t.y = e.clientY;
  if (handPan) { swallow(e); A.pan(e.clientX - handPan.x, e.clientY - handPan.y); handPan = { x: e.clientX, y: e.clientY }; return; }
  if (!gesture) return;
  swallow(e);
  gesture.moved = Math.max(gesture.moved, Math.hypot(t.x - t.x0, t.y - t.y0));
  if (touches.size < 2 || gesture.n > 2) return;
  const [a, b] = [...touches.values()];
  const m = mid(a, b);
  
  const k = dist(a, b) / gesture.d0;
  if (Math.abs(k - 1) > 0.04 || gesture.zoomed) {
    gesture.zoomed = true;
    const nz = Math.max(0.01, Math.min(32, gesture.z0 * k));
    A.zoomAt(m.x, m.y, nz);
  }
  
  A.pan(m.x - gesture.last.x, m.y - gesture.last.y);
  gesture.last = m;
  
  if (A.rotateEnabled()) {
    let da = angle(a, b) - gesture.a0; da = ((da + 540) % 360) - 180;
    if (gesture.rotated || Math.abs(da) > 12) {
      gesture.rotated = true;
      let na = gesture.ang0 + da;
      if (Math.abs(((na + 540) % 360) - 180) < 3) na = 0;
      A.setAngle(na);
    }
  }
}

function onUp(e) {
  if (e.pointerType === 'pen') { penDown = false; return; }
  if (e.pointerType !== 'touch') return;
  if (getPreference('tools.touchRotate') === false) { clearGesture(); return; }
  const had = touches.has(e.pointerId);
  touches.delete(e.pointerId);
  if (firstTouch && firstTouch.id === e.pointerId) firstTouch = null;
  if (handPan) { swallow(e); if (!touches.size) handPan = null; return; }
  if (!gesture || !had) return;
  swallow(e);
  if (touches.size) return;
  
  const g = gesture; gesture = null;
  const quick = performance.now() - g.t0 < 320 && g.moved < 14 && !g.zoomed && !g.rotated;
  if (quick && g.n === 2) A.undo();
  else if (quick && g.n >= 3) A.redo();
}




export function installTouchGestures(ctx) {
  A = ctx;
  const el = ctx.el;
  if (!el) return;
  el.style.touchAction = 'none';                                    
  el.addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', e => { if (e.isTrusted) onUp(e); }, true);
  
  el.addEventListener('gesturestart', e => { if (getPreference('tools.touchRotate') !== false) e.preventDefault(); });
}

export default { installTouchGestures };
