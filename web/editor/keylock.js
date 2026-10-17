


















import { shortcuts } from './shortcuts.js';



export const BROWSER_RESERVED = [
  'KeyB', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyL', 'KeyM', 'KeyN', 'KeyO',
  'KeyP', 'KeyR', 'KeyS', 'KeyT', 'KeyU', 'KeyW', 'KeyY',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'Minus', 'Equal', 'Comma', 'BracketLeft', 'BracketRight',
];


export function lockCodes() {
  const used = new Set();
  for (const r of shortcuts.table()) {
    if (!(r.combo.startsWith('Ctrl+') || r.combo.includes('Meta+'))) continue;   
    const c = shortcuts.codeFor(r.spec);
    if (c) used.add(c);
  }
  const list = BROWSER_RESERVED.filter(c => used.has(c));
  list.push('Escape');
  return list;
}

const kb = () => (typeof navigator !== 'undefined' && navigator.keyboard) || null;

export function supported() { const k = kb(); return !!(k && typeof k.lock === 'function'); }

export function standalone() {
  try {
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return ['standalone', 'window-controls-overlay', 'fullscreen', 'minimal-ui']
      .some(m => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch { return false; }
}
export function isFullscreen() {
  if (typeof document === 'undefined') return false;
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

let locked = false;       
let wanted = false;       
let lastError = null;
const listeners = new Set();


export function captured() { return locked || standalone(); }
export function state() { return { locked, wanted, captured: captured(), supported: supported(), standalone: standalone(), fullscreen: isFullscreen(), error: lastError }; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function sync() {
  shortcuts.setCaptured(captured());
  for (const f of [...listeners]) { try { f(captured()); } catch {  } }
}

export async function lock() {
  if (locked || !supported() || !isFullscreen()) { sync(); return locked; }
  try { await kb().lock(lockCodes()); locked = true; lastError = null; }
  catch (e) { locked = false; lastError = e; }                 
  sync();
  return locked;
}
export function unlock() {
  if (locked && supported()) { try { kb().unlock(); } catch {  } }
  locked = false;
  sync();
}


export async function enter(el) {
  wanted = true;
  const target = el || (typeof document !== 'undefined' ? document.documentElement : null);
  try {
    if (target && !isFullscreen()) {
      if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: 'hide' });
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    }
  } catch (e) { lastError = e; }                                
  await lock();
  return captured();
}

export async function leave() {
  wanted = false;
  unlock();
  try { if (isFullscreen() && document.exitFullscreen) await document.exitFullscreen(); }
  catch (e) { lastError = e; }
}

let installed = false;

export function install(onExit) {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const onFsChange = () => {
    if (isFullscreen()) { lock(); return; }
    const byUser = wanted;
    unlock(); wanted = false;
    if (byUser && onExit) onExit();
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  sync();                                                       
}

export const keylock = { BROWSER_RESERVED, lockCodes, supported, standalone, isFullscreen, captured, state, onChange, lock, unlock, enter, leave, install };
export default keylock;
