

















import { run as runAction, enabled as actionEnabled, has as hasAction } from './actions.js';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

const CODE_KEYS = {
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
  Slash: '/', Backslash: '\\', Backquote: '`', Space: 'Space',
};
const NAMED = new Set(['Escape', 'Enter', 'Tab', 'Backspace', 'Delete', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const KEY_CODES = Object.fromEntries(Object.entries(CODE_KEYS).map(([code, key]) => [key, code]));


export function codeFor(spec) {
  const key = parse(spec).split('+').pop();
  if (/^[A-Z]$/.test(key)) return 'Key' + key;
  if (/^[0-9]$/.test(key)) return 'Digit' + key;
  if (KEY_CODES[key]) return KEY_CODES[key];
  if (NAMED.has(key) || /^F([1-9]|1[0-2])$/.test(key)) return key;
  return '';
}


export function comboOf(e) {
  let key = '';
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) key = code.slice(6);
  else if (CODE_KEYS[code]) key = CODE_KEYS[code];
  else if (/^F([1-9]|1[0-2])$/.test(e.key)) key = e.key;
  else if (NAMED.has(e.key) || (e.key === ' ')) key = e.key === ' ' ? 'Space' : e.key;
  else if (e.key && e.key.length === 1) key = e.key.toUpperCase();
  if (!key) return null;
  
  return normalize(IS_MAC ? { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, key }
                          : { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, meta: false, key });
}


export function parse(spec) {
  const parts = String(spec).split('+').map(s => s.trim()).filter(Boolean);
  const m = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (const p of parts) {
    const u = p.toLowerCase();
    if (u === 'mod' || u === 'cmd' || u === 'command') { if (IS_MAC) m.meta = true; else m.ctrl = true; }
    else if (u === 'ctrl' || u === 'control') m.ctrl = true;
    else if (u === 'alt' || u === 'option' || u === 'opt') m.alt = true;
    else if (u === 'shift') m.shift = true;
    else if (u === 'meta' || u === 'win') m.meta = true;
    else if (u === 'plus') m.key = '=';        
    else m.key = p.length === 1 ? p.toUpperCase() : p;
  }
  return normalize(m);
}
function normalize(m) {
  return (m.ctrl ? 'Ctrl+' : '') + (m.alt ? 'Alt+' : '') + (m.shift ? 'Shift+' : '') + (m.meta ? 'Meta+' : '') + m.key;
}

const KEY_GLYPH_MAC = { Escape: '⎋', Enter: '↩', Tab: '⇥', Backspace: '⌫', Delete: '⌦', Space: '␣', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Home: '↖', End: '↘', PageUp: '⇞', PageDown: '⇟', '=': '+' };
const KEY_NAME_WIN = { Escape: 'Esc', Enter: 'Enter', Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace', Delete: 'Delete', '=': '+' };


export function format(spec) {
  if (!spec) return '';
  const m = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (const p of parse(spec).split('+')) {
    if (p === 'Ctrl') m.ctrl = true; else if (p === 'Alt') m.alt = true; else if (p === 'Shift') m.shift = true; else if (p === 'Meta') m.meta = true; else m.key = p;
  }
  if (IS_MAC) {
    return (m.ctrl ? '⌃' : '') + (m.alt ? '⌥' : '') + (m.shift ? '⇧' : '') + (m.meta ? '⌘' : '') + (KEY_GLYPH_MAC[m.key] || m.key);
  }
  const parts = [];
  if (m.alt) parts.push('Alt'); if (m.shift) parts.push('Shift'); if (m.ctrl) parts.push('Ctrl'); if (m.meta) parts.push('Win');
  parts.push(KEY_NAME_WIN[m.key] || m.key);
  return parts.join('+');
}


const BINDINGS = new Map();        
const BY_ACTION = new Map();       

export function bind(spec, action, opts = {}) {
  const key = parse(spec);
  
  const old = BINDINGS.get(key);
  if (old) { const arr = BY_ACTION.get(old.action); if (arr) { const i = arr.findIndex(s => parse(s) === key); if (i >= 0) arr.splice(i, 1); } }
  BINDINGS.set(key, { action, spec, opts });
  if (!BY_ACTION.has(action)) BY_ACTION.set(action, []);
  BY_ACTION.get(action).push(spec);
}
export function bindAll(list) { for (const [spec, action, opts] of list) bind(spec, action, opts); }
export function unbind(spec) {
  const key = parse(spec); const b = BINDINGS.get(key); if (!b) return;
  BINDINGS.delete(key);
  const arr = BY_ACTION.get(b.action); if (arr) { const i = arr.indexOf(spec); if (i >= 0) arr.splice(i, 1); }
}


let captured = false;
export function setCaptured(v) { captured = !!v; }
export function isCaptured() { return captured; }
function isReserved(spec) { const b = BINDINGS.get(parse(spec)); return !!(b && b.opts && b.opts.reserved); }

export function labelFor(action) {
  const a = BY_ACTION.get(action);
  if (!a || !a.length) return '';
  if (!captured && isReserved(a[0])) { const usable = a.find(s => !isReserved(s)); if (usable) return format(usable); }
  return format(a[0]);
}
export function bindingsOf(action) { return (BY_ACTION.get(action) || []).slice(); }


export function entries() { return [...BINDINGS.values()].map(b => [b.spec, b.action, b.opts]); }
export function restore(list) {
  BINDINGS.clear(); BY_ACTION.clear();
  for (const [spec, action, opts] of list || []) bind(spec, action, opts || {});
}

export function actionOf(spec) { const b = BINDINGS.get(parse(spec)); return b ? b.action : null; }
export function table() { return [...BINDINGS.entries()].map(([k, b]) => ({ combo: k, spec: b.spec, display: format(b.spec), action: b.action })); }


export function inEditable(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  if (tag === 'INPUT') { const ty = (t.type || 'text').toLowerCase(); return !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color'].includes(ty); }
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!(t.isContentEditable);
}

function inDialog(e) { const t = e.target; return !!(t && t.closest && t.closest('dialog')); }

let suspended = 0;

export function suspend() { suspended++; return () => { suspended = Math.max(0, suspended - 1); }; }

export function dispatch(e) {
  if (suspended) return false;
  if (e.defaultPrevented) return false;
  if (inEditable(e)) return false;
  if (inDialog(e)) return false;
  const combo = comboOf(e); if (!combo) return false;
  const b = BINDINGS.get(combo); if (!b) return false;
  if (!hasAction(b.action)) return false;                  
  if (!actionEnabled(b.action)) { if (b.opts.swallow !== false) { e.preventDefault(); } return true; }
  
  const r = runAction(b.action, { event: e, combo, spec: b.spec, ...b.opts });
  if (r === false) return false;
  e.preventDefault(); e.stopImmediatePropagation();
  return true;
}
let installed = false;
export function install(target = window) {
  if (installed) return; installed = true;
  target.addEventListener('keydown', dispatch);
}


export const DEFAULT_BINDINGS = [
  
  ['Mod+N', 'file.new', { reserved: true }], ['Mod+O', 'file.open'], ['Alt+Mod+O', 'file.browse'], ['Alt+Shift+Mod+O', 'file.openAs'],
  ['Mod+W', 'file.close'], ['Alt+Mod+W', 'file.closeAll'], ['Alt+Mod+P', 'file.closeOthers'],
  ['Mod+S', 'file.save'], ['Shift+Mod+S', 'file.saveAs'], ['Alt+Mod+S', 'file.saveCopy'], ['F12', 'file.revert'],
  ['Alt+Shift+Mod+W', 'file.exportAs'], ['Alt+Shift+Mod+S', 'file.saveForWeb'], ['Alt+Shift+Mod+I', 'file.info'],
  ['Mod+P', 'file.print'], ['Alt+Shift+Mod+P', 'file.printOne'],
  
  ['Mod+Z', 'edit.undo'], ['Shift+Mod+Z', 'edit.redo'], ['Alt+Mod+Z', 'edit.toggleLastState'], ['Shift+Mod+F', 'edit.fade'],
  ['Mod+X', 'edit.cut'], ['Mod+C', 'edit.copy'], ['Shift+Mod+C', 'edit.copyMerged'], ['Mod+V', 'edit.paste'],
  ['Shift+Mod+V', 'edit.pasteInPlace'], ['Alt+Shift+Mod+V', 'edit.pasteInto'], ['Mod+F', 'edit.search'],
  ['Shift+F5', 'edit.fill'], ['Alt+Shift+Mod+C', 'edit.contentAwareScale'],
  ['Mod+T', 'edit.freeTransform', { reserved: true }], ['Shift+Mod+T', 'edit.transformAgain', { reserved: true }],
  ['Shift+Mod+K', 'edit.colorSettings'], ['Alt+Shift+Mod+K', 'edit.keyboardShortcuts'], ['Alt+Shift+Mod+M', 'edit.menus'], ['Mod+K', 'edit.preferences'],
  
  ['Mod+L', 'image.adjust.levels'], ['Mod+M', 'image.adjust.curves'], ['Mod+U', 'image.adjust.hueSaturation'], ['Mod+B', 'image.adjust.colorBalance'],
  ['Alt+Shift+Mod+B', 'image.adjust.blackWhite'], ['Mod+I', 'image.adjust.invert'], ['Shift+Mod+U', 'image.adjust.desaturate'],
  ['Shift+Mod+L', 'image.autoTone'], ['Alt+Shift+Mod+L', 'image.autoContrast'], ['Shift+Mod+B', 'image.autoColor'],
  ['Alt+Mod+I', 'image.size'], ['Alt+Mod+C', 'image.canvasSize'],
  
  ['Shift+Mod+N', 'layer.new'], ['Mod+J', 'layer.viaCopy'], ['Shift+Mod+J', 'layer.viaCut'],
  ["Shift+Mod+'", 'layer.quickExportPng'], ["Alt+Shift+Mod+'", 'layer.exportAs'], ['Alt+Mod+G', 'layer.clippingMask'],
  ['Mod+G', 'layer.group'], ['Shift+Mod+G', 'layer.ungroup'], ['Mod+,', 'layer.hide'],
  ['Shift+Mod+]', 'layer.bringToFront'], ['Mod+]', 'layer.bringForward'], ['Mod+[', 'layer.sendBackward'], ['Shift+Mod+[', 'layer.sendToBack'],
  ['Mod+/', 'layer.lock'], ['Mod+E', 'layer.merge'], ['Shift+Mod+E', 'layer.mergeVisible'],
  
  ['Mod+A', 'select.all'], ['Mod+D', 'select.none'], ['Shift+Mod+D', 'select.reselect'], ['Shift+Mod+I', 'select.inverse'],
  ['Alt+Mod+A', 'select.allLayers'], ['Alt+Shift+Mod+F', 'select.findLayers'], ['Alt+Mod+R', 'select.selectAndMask'], ['Shift+F6', 'select.feather'],
  
  ['Ctrl+Mod+F', 'filter.last'], ['Alt+Ctrl+Mod+F', 'filter.lastDialog'], ['Alt+Shift+Mod+A', 'filter.adaptiveWideAngle'], ['Shift+Mod+A', 'filter.cameraRaw'],
  ['Shift+Mod+R', 'filter.lensCorrection'], ['Shift+Mod+X', 'filter.liquify'], ['Alt+Mod+V', 'filter.vanishingPoint'],
  
  ['Mod+Y', 'view.proofColors'], ['Shift+Mod+Y', 'view.gamutWarning'], ['Mod+=', 'view.zoomIn'], ['Mod+-', 'view.zoomOut'],
  ['Mod+2', 'channel.composite'], ['Mod+3', 'channel.0'], ['Mod+4', 'channel.1'], ['Mod+5', 'channel.2'], ['Mod+6', 'channel.3'],
  ['Mod+0', 'view.fitOnScreen'], ['Mod+1', 'view.actualPixels'], ['Mod+H', 'view.extras'], ['Shift+Mod+H', 'view.showTargetPath'],
  ["Mod+'", 'view.showGrid'], ['Mod+;', 'view.showGuides'], ['Mod+R', 'view.rulers'], ['Shift+Mod+;', 'view.snap'],
  ['Alt+Mod+;', 'view.lockGuides'], ['F', 'view.screenModeCycle'], ['Tab', 'window.togglePanels'], ['Shift+Tab', 'window.toggleSidePanels'],
  
  ['Alt+F9', 'window.actions'], ['F5', 'window.brushSettings'], ['F6', 'window.color'], ['F7', 'window.layers'], ['F8', 'window.info'],
  
  ['X', 'tool.swapColors'], ['D', 'tool.defaultColors'], ['Q', 'tool.quickMask'],
  ['Alt+]', 'layer.selectUp'], ['Alt+[', 'layer.selectDown'], ['Alt+.', 'layer.selectTop'], ['Alt+,', 'layer.selectBottom'],
  ['[', 'brush.smaller'], [']', 'brush.larger'], ['Shift+[', 'brush.softer'], ['Shift+]', 'brush.harder'],
  ['Alt+Shift+P', 'brush.airbrush'],   
  ['Mod+Backspace', 'edit.fillBackground'], ['Alt+Backspace', 'edit.fillForeground'], ['Alt+Delete', 'edit.fillForeground'],
];
bindAll(DEFAULT_BINDINGS);





if (IS_MAC) bindAll([
  ['Ctrl+A', 'select.all'], ['Ctrl+D', 'select.none'],
  ['Ctrl+X', 'edit.cut'], ['Ctrl+C', 'edit.copy'], ['Ctrl+V', 'edit.paste'],
  ['Ctrl+Z', 'edit.undo'], ['Shift+Ctrl+Z', 'edit.redo'],
]);








export const FALLBACK_BINDINGS = IS_MAC
  ? [['Ctrl+T', 'edit.freeTransform'], ['Shift+Ctrl+T', 'edit.transformAgain'], ['Ctrl+N', 'file.new']]
  : [['Alt+T', 'edit.freeTransform'], ['Alt+Shift+T', 'edit.transformAgain'], ['Alt+N', 'file.new']];
bindAll(FALLBACK_BINDINGS);

export const shortcuts = { IS_MAC, bind, bindAll, unbind, format, parse, comboOf, codeFor, labelFor, bindingsOf, table, entries, restore, actionOf, dispatch, install, inEditable, suspend, setCaptured, isCaptured };
export default shortcuts;
