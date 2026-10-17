























import { actions } from './actions.js';
import { shortcuts, IS_MAC } from './shortcuts.js';
import { tools, TOOL_GROUPS } from './tools.js';
import { MENUS, setItemStyle } from './menu.js';
import { panels } from './panels.js';
import { preferences } from './preferences.js';

const KEY = 'psd_editor.kbSets';
const DEFAULT_NAME = 'Photoshop 默认值';
const clone = o => JSON.parse(JSON.stringify(o || {}));
const emptySet = () => ({ app: {}, panel: {}, tools: {} });

let store = { active: null, sets: {} };
try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object' && j.sets) store = { active: j.active || null, sets: j.sets }; } catch {}
function saveStore() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} }


let defaults = null;               
let defaultOpts = new Map();       
function snapDefaults() {
  defaults = new Map();
  for (const [spec, action, opts] of shortcuts.entries()) {
    if (!defaults.has(action)) defaults.set(action, []);
    defaults.get(action).push(spec);
    defaultOpts.set(shortcuts.parse(spec), opts || {});
  }
}
function defaultSpecs(action) { return defaults && defaults.has(action) ? defaults.get(action).slice() : shortcuts.bindingsOf(action); }


let applied = { added: [], removed: [] };
function optsOf(spec) { const k = shortcuts.parse(spec); const e = shortcuts.entries().find(x => shortcuts.parse(x[0]) === k); return e ? e[2] || {} : (defaultOpts.get(k) || {}); }
function revert() {
  for (const s of applied.added.slice().reverse()) shortcuts.unbind(s);
  for (const [spec, action, opts] of applied.removed.slice().reverse()) if (!shortcuts.actionOf(spec)) shortcuts.bind(spec, action, opts);
  applied = { added: [], removed: [] };
}
const panelActionId = key => 'panelMenu:' + key;
function ensurePanelAction(key) {
  const id = panelActionId(key);
  if (actions.has(id)) return id;
  const [pid, label] = key.split('|');
  actions.register(id, { run: () => {
    const it = (panels.panelMenuItems(pid) || []).find(x => x && !x.sep && x.label === label);
    if (!it || it.disabled || !it.run) return false;
    it.run(); return true;
  } });
  return id;
}
function applyOne(action, specs) {
  for (const s of shortcuts.bindingsOf(action)) { applied.removed.push([s, action, optsOf(s)]); shortcuts.unbind(s); }
  for (const s of specs || []) {
    const prev = shortcuts.actionOf(s);
    if (prev) { applied.removed.push([s, prev, optsOf(s)]); shortcuts.unbind(s); }
    shortcuts.bind(s, action); applied.added.push(s);
  }
}
export function applySet(data) {
  revert();
  const d = data || emptySet();
  try { tools.setKeyOverrides(d.tools || {}); } catch {}
  for (const [a, specs] of Object.entries(d.app || {})) applyOne(a, specs);
  for (const [k, specs] of Object.entries(d.panel || {})) applyOne(ensurePanelAction(k), specs);
}
export function activeSet() { return store.active && store.sets[store.active] ? store.sets[store.active] : emptySet(); }
export function activeName() { return store.active && store.sets[store.active] ? store.active : DEFAULT_NAME; }
export function setNames() { return Object.keys(store.sets); }

export function useSet(name) { store.active = name && store.sets[name] ? name : null; saveStore(); applySet(activeSet()); }

export function exportActive() { return { name: store.active, data: clone(activeSet()) }; }
export function importInto(name, data) { store.sets[name] = clone(data); store.active = name; saveStore(); applySet(data); }



export function specFromEvent(e) {
  const combo = shortcuts.comboOf(e); if (!combo) return null;
  const parts = combo.split('+'), key = parts.pop();
  if (/^(Shift|Alt|Control|Meta|CapsLock)$/.test(key)) return null;
  const out = [];
  for (const p of parts) {
    if (p === 'Meta') out.push(IS_MAC ? 'Mod' : 'Meta');
    else if (p === 'Ctrl') out.push(IS_MAC ? 'Ctrl' : 'Mod');
    else out.push(p);
  }
  out.push(key);
  
  const order = ['Ctrl', 'Alt', 'Shift', 'Mod', 'Meta'];
  const mods = out.slice(0, -1).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, key].join('+');
}
const same = (a, b) => shortcuts.parse(a) === shortcuts.parse(b);


function menuStyle(action) {
  const m = preferences.get('menus') || {}; const h = m.hidden || {}, c = m.colors || {};
  if (!h[action] && !c[action]) return null;
  return { hidden: !!h[action], color: (preferences.get('interface.menuColors') !== false) ? c[action] : '' };
}
const COLOR_OPTS = [['', '无'], ['red', '红色'], ['orange', '橙色'], ['yellow', '黄色'], ['green', '绿色'], ['blue', '蓝色'], ['violet', '紫色'], ['gray', '灰色']];
const COLOR_CSS = { red: '#b33a3a66', orange: '#b8672a66', yellow: '#a8952b66', green: '#3d8a3d66', blue: '#3a67b366', violet: '#7a4bb366', gray: '#66666666' };


export function openShortcutEditor(page = 'keys') {
  return import('./shortcut-editor-dialog.js').then(m => m.openShortcutEditorDialog(page))
    .catch(e => { console.warn('[快捷键编辑器] 对话框没能载入', e); });
}

export const buildKys = (...a) => import('./shortcut-editor-dialog.js').then(m => m.buildKys(...a));
export const parseKys = (...a) => import('./shortcut-editor-dialog.js').then(m => m.parseKys(...a));

let installed = false;

export function installShortcutEditor() {
  if (installed) return; installed = true;
  snapDefaults();
  applySet(activeSet());
  setItemStyle(menuStyle);
  panels.setPanelMenuFilter((pid, items) => items.filter(it => {
    if (!it || it.sep || !it.label) return true;
    const k = 'panel:' + pid + '|' + it.label;
    const m = preferences.get('menus') || {};
    return !(m.hidden && m.hidden[k]);
  }).map(it => {
    if (!it || it.sep || !it.label) return it;
    const k = pid + '|' + it.label, m = preferences.get('menus') || {};
    const sp = (activeSet().panel || {})[k];
    const col = m.colors && m.colors['panel:' + k];
    return { ...it, sc: sp && sp[0] ? shortcuts.format(sp[0]) : it.sc, color: col && preferences.get('interface.menuColors') !== false ? COLOR_CSS[col] : it.color };
  }).filter((x, i, a) => !(x && x.sep && (i === 0 || (a[i - 1] && a[i - 1].sep)))));
  actions.register('edit.keyboardShortcuts', { run: () => { openShortcutEditor('keys'); } });
  actions.register('edit.menus', { run: () => { openShortcutEditor('menus'); } });
}

export const shortcutEditor = { installShortcutEditor, openShortcutEditor, applySet, useSet, exportActive, importInto, activeName, setNames, specFromEvent, buildKys, parseKys };

export { store, defaults, defaultOpts, snapDefaults, DEFAULT_NAME, clone, emptySet, saveStore, defaultSpecs, same, panelActionId, ensurePanelAction, menuStyle, COLOR_OPTS, COLOR_CSS, optsOf, applyOne, revert };
export default shortcutEditor;
