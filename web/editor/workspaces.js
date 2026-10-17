













import { actions } from './actions.js';
import { panels } from './panels.js';
import { tools } from './tools.js';
import { MENUS } from './menu.js';
import { preferences } from './preferences.js';
import { formDialog, choiceDialog } from './dialog.js';

const KEY = 'psd_editor.workspaces';
export const PRESETS = [
  ['essentials', '基本功能(默认)'], ['graphicWeb', '图形和 Web'], ['motion', '动感'], ['painting', '绘画'], ['photography', '摄影'],
];
const NAME = Object.fromEntries(PRESETS.map(([id, l]) => [id, l.replace('(默认)', '')]));


const LAYOUTS = {
  graphicWeb: { color: ['swatches', 'color'], props: ['properties', 'glyphs'], layers: ['layers', 'paths'], dock: ['history', 'characterStyles', 'paragraphStyles', 'info', 'layerComps'] },
  
  motion: { color: ['color', 'swatches'], props: ['properties', 'adjustments'], layers: ['layers', 'channels', 'paths'], dock: ['history', 'actions', 'info'], floats: ['timeline'] },
  painting: { color: ['color', 'swatches'], props: ['brushSettings', 'brushes'], layers: ['layers', 'channels', 'paths'], dock: ['navigator', 'history', 'toolPresets'] },
  photography: { color: ['histogram', 'navigator'], props: ['adjustments', 'properties'], layers: ['layers', 'channels', 'paths'], dock: ['history', 'info', 'actions'] },
};

let st = { current: 'essentials', locked: false, modified: {}, custom: {} };
try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') st = { current: j.current || 'essentials', locked: !!j.locked, modified: j.modified || {}, custom: j.custom || {} }; } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
const isPreset = id => PRESETS.some(p => p[0] === id);
const labelOf = id => NAME[id] || id;

let hooks = { status: () => {}, shortcutEditor: null };


function presetLayout(id) {
  const spec = LAYOUTS[id]; if (!spec) return null;
  const ok = pid => panels.exists(pid) || !!panels.sectionOf(pid);
  const home = panels.homeGroups();
  const homeTabs = new Set(home.flatMap(g => g.tabs));
  const out = {};
  for (const g of home) {
    const want = (spec[g.group] || []).filter(ok).filter(pid => g.tabs.includes(pid) || !homeTabs.has(pid));
    const order = [...want, ...g.tabs.filter(t => !want.includes(t))];
    out[g.group] = { collapsed: false, active: want[0] || g.tabs[0], height: '', order, hidden: g.tabs.filter(t => !want.includes(t)) };
  }
  const placed = new Set(Object.values(out).flatMap(g => g.order));
  const floats = (spec.floats || []).filter(ok).filter(p => !placed.has(p));
  const dock = (spec.dock || []).filter(ok).filter(p => !placed.has(p) && !floats.includes(p));
  const homeDock = ['history', 'notes'];
  out.__docks = [{ w: 34, expanded: false, items: [...dock, ...homeDock.filter(p => !dock.includes(p))], hidden: homeDock.filter(p => !dock.includes(p)) }];
  out.__floats = floats;
  out.__colCollapsed = false;
  return { layout: out, side: 0, dock: 34 };
}
function layoutFor(id) {
  if (st.modified[id]) return st.modified[id];
  if (st.custom[id]) return st.custom[id].layout;
  if (id === 'essentials') return null;
  return presetLayout(id);
}

export function switchTo(id) {
  if (!isPreset(id) && !st.custom[id]) return false;
  if (st.current && st.current !== id) st.modified[st.current] = panels.captureLayout();
  st.current = id; save();
  panels.applyLayout(layoutFor(id));
  placeFloats(id);
  const c = st.custom[id];
  if (c) {
    if (c.keys && hooks.shortcutEditor) hooks.shortcutEditor.importInto(c.keys.name || ('工作区：' + id), c.keys.data);
    if (c.menus) preferences.set({ menus: c.menus });
    if (c.toolbar) tools.setLayout(c.toolbar);
  }
  hooks.status(`工作区：${labelOf(id)}`);
  refreshMenu();
  return true;
}

function placeFloats(id) {
  const spec = LAYOUTS[id]; if (!spec || !spec.floats || st.modified[id]) return;
  for (const pid of spec.floats) {
    const sec = panels.sectionOf(pid), win = sec && sec.closest('.float-panel'); if (!win) continue;
    const area = document.querySelector('.docarea'); const r = area ? area.getBoundingClientRect() : { left: 0, width: innerWidth, bottom: innerHeight };
    const h = 190;
    win.style.left = Math.round(r.left + 4) + 'px'; win.style.top = Math.max(60, Math.round(r.bottom - h - 4)) + 'px';
    win.style.width = Math.max(320, Math.round(r.width - 8)) + 'px'; win.style.height = h + 'px';
  }
}
export function resetCurrent() {
  delete st.modified[st.current]; save();
  panels.applyLayout(layoutFor(st.current));
  placeFloats(st.current);
  hooks.status(`已复位工作区「${labelOf(st.current)}」`);
}
export async function newWorkspace(vals) {
  const v = vals || await formDialog('新建工作区', [
    { key: 'name', label: '名称', type: 'text', value: '工作区 ' + (Object.keys(st.custom).length + 1) },
    { key: 'note', type: 'note', label: '捕获：面板位置将存储在此工作区中。键盘快捷键、菜单和工具栏是可选的。' },
    { key: 'keys', label: '键盘快捷键', type: 'check', value: false },
    { key: 'menus', label: '菜单', type: 'check', value: false },
    { key: 'toolbar', label: '工具栏', type: 'check', value: false },
  ]);
  if (!v || !String(v.name || '').trim()) return false;
  const name = String(v.name).trim();
  if ((isPreset(name) || st.custom[name]) && !(await choiceDialog(`工作区「${name}」已存在。要替换吗？`, { okText: '替换' }))) return false;
  const entry = { layout: panels.captureLayout() };
  if (v.keys && hooks.shortcutEditor) entry.keys = hooks.shortcutEditor.exportActive();
  if (v.menus) entry.menus = JSON.parse(JSON.stringify(preferences.get('menus') || {}));
  if (v.toolbar) entry.toolbar = tools.getLayout();
  st.custom[name] = entry; delete st.modified[name];
  st.current = name; save(); refreshMenu();
  hooks.status(`已新建工作区「${name}」`);
  return true;
}
export async function deleteWorkspace(name) {
  const names = Object.keys(st.custom);
  if (!names.length) { hooks.status('没有可删除的工作区（预设工作区不能删除）'); return false; }
  let n = name;
  if (!n) {
    const v = await formDialog('删除工作区', [{ key: 'ws', label: '工作区', type: 'select', value: names[0], options: names.map(x => [x, x]) }]);
    if (!v) return false; n = v.ws;
  }
  if (!st.custom[n]) return false;
  if (n === st.current) { hooks.status('不能删除当前正在使用的工作区（PS 同）：先切到别的工作区'); return false; }
  delete st.custom[n]; delete st.modified[n]; save(); refreshMenu();
  hooks.status(`已删除工作区「${n}」`);
  return true;
}
export function setLocked(v) { st.locked = !!v; save(); panels.setLocked(st.locked); }


function wsMenu() {
  const win = MENUS.find(m => m.id === 'window'); if (!win) return null;
  return win.items.find(x => x.sub && x.sub.some(y => y.action === 'window.workspace.essentials')) || null;
}
function refreshMenu() {
  const m = wsMenu(); if (!m) return;
  m.sub = m.sub.filter(x => !(x.action && x.action.startsWith('window.workspace.u:')) && !x.wsSep);
  const at = m.sub.findIndex(x => x.action === 'window.workspace.photography');
  const extra = Object.keys(st.custom).map(n => {
    const id = 'window.workspace.u:' + n;
    if (!actions.has(id)) actions.register(id, { run: () => { switchTo(n); }, checked: () => st.current === n });
    return { label: n, action: id, check: 'radio' };
  });
  if (extra.length) m.sub.splice(at + 1, 0, { sep: true, wsSep: true }, ...extra);
  const r = m.sub.find(x => x.action === 'window.workspace.reset');
  if (r) r.label = `复位${labelOf(st.current)}`;
}

let installed = false;
export function installWorkspaces(h = {}) {
  if (installed) return; installed = true;
  hooks = { ...hooks, ...h };
  for (const [id] of PRESETS) actions.register('window.workspace.' + id, { run: () => { switchTo(id); }, checked: () => st.current === id });
  actions.register('window.workspace.3d', { run: () => false, enabled: () => false, why: () => '不做（永久）：PS 已移除旧版 3D 功能，本编辑器也不支持 3D' });
  actions.register('window.workspace.reset', { run: () => { resetCurrent(); } });
  actions.register('window.workspace.new', { run: () => { newWorkspace(); } });
  actions.register('window.workspace.delete', { run: () => { deleteWorkspace(); }, enabled: () => Object.keys(st.custom).length > 0, why: () => '还没有用户新建的工作区（预设工作区不能删除）' });
  actions.register('window.workspace.lock', { run: () => { setLocked(!st.locked); hooks.status(st.locked ? '工作区已锁定：面板不能拖动 / 停靠' : '工作区已解锁'); }, checked: () => st.locked });
  if (!isPreset(st.current) && !st.custom[st.current]) st.current = 'essentials';
  panels.setLocked(st.locked);
  refreshMenu();
}
export const workspaces = { PRESETS, installWorkspaces, switchTo, resetCurrent, newWorkspace, deleteWorkspace, setLocked, current: () => st.current, list: () => [...PRESETS.map(p => p[0]), ...Object.keys(st.custom)], presetLayout };
export default workspaces;
