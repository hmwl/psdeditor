









import { actions } from './actions.js';
import { MENUS } from './menu.js';
import { panels } from './panels.js';
import { workspaces, PRESETS } from './workspaces.js';
import { uiIcon, hasUiIcon } from './icons.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const S = { sep: true };
const it = (label, action, extra) => ({ label, action, ...(extra || {}) });
let C = null;

const WHY = {
  libraries: '不做：「库」是 Adobe Creative Cloud 的云端素材库，要 Adobe 账号与云同步；浏览器版本本地运行，素材请用色板 / 图案 / 渐变 / 形状 / 样式面板的预设库',
  versionHistory: '不做：「版本历史」只对 Adobe 云文档（.psdc）有效，要 Adobe 账号与云存储；本编辑器的文件都在本机',
  exchange: '不做：Adobe Exchange 是 CEP 旧版扩展的商店，要 Creative Cloud 桌面程序安装；浏览器版本没有扩展宿主',
  legacy: '没有已安装的旧版（CEP）扩展：浏览器版本没有 CEP 扩展宿主',
  appFrame: '「应用程序框架」是 macOS 版 PS 的选项（关掉后面板 / 文档窗口各自浮在桌面上）；浏览器里整个页面就是应用程序框架，所以永远勾着',
};


function winMenu() { return MENUS.find(m => m.id === 'window'); }
function findIdx(items, action) { return items.findIndex(x => x && x.action === action); }
function insertAfter(items, afterAction, ...add) {
  for (const a of add) { const j = findIdx(items, a.action); if (j >= 0) items.splice(j, 1); }
  const i = findIdx(items, afterAction);
  if (i < 0) return false;
  items.splice(i + 1, 0, ...add);
  return true;
}
function insertBefore(items, beforeAction, ...add) {
  for (const a of add) { const j = findIdx(items, a.action); if (j >= 0) items.splice(j, 1); }
  const i = findIdx(items, beforeAction);
  if (i < 0) return false;
  items.splice(i, 0, ...add);
  return true;
}
function patchWindowMenu() {
  const W = winMenu(); if (!W) return;
  const items = W.items;
  
  for (let j = items.length - 1; j >= 0; j--) if (items[j] && items[j].action === 'window.3d') items.splice(j, 1);
  const ws = items.find(x => x.sub && x.sub.some(y => y.action === 'window.workspace.essentials'));
  if (ws) ws.sub = ws.sub.filter(y => y.action !== 'window.workspace.3d');
  
  const ex = items.find(x => x.action === 'window.exchange'); if (ex) ex.label = '在 Exchange 上查找扩展(旧版)…';
  const leg = items.find(x => x.sub && x.sub.some(y => y.action === 'window.legacyExtensions'));
  if (leg) { leg.label = '扩展(旧版)'; leg.sub = [it('（无）', 'window.legacyExtensions', { disabled: true })]; }
  if (findIdx(items, 'window.plugins') < 0) {
    const at = leg ? items.indexOf(leg) + 1 : (ex ? items.indexOf(ex) + 1 : 2);
    items.splice(at, 0, it('增效工具', 'window.plugins', { check: 'check' }));
  }
  
  if (findIdx(items, 'window.versionHistory') < 0) insertBefore(items, 'window.measurementLog', it('版本历史', 'window.versionHistory', { check: 'check' }));
  if (findIdx(items, 'window.cloneSource') < 0) insertAfter(items, 'window.paragraphStyles', it('仿制源', 'window.cloneSource', { check: 'check' }));
  if (findIdx(items, 'window.libraries') < 0) insertAfter(items, 'window.gradients', it('库', 'window.libraries', { check: 'check' }));
  if (findIdx(items, 'window.contextTaskBar') < 0) insertAfter(items, 'window.swatches', it('上下文任务栏', 'window.contextTaskBar', { check: 'check' }));
  
  const pi = findIdx(items, 'window.plugins');
  if (pi >= 0 && items[pi + 1] && !items[pi + 1].sep) items.splice(pi + 1, 0, S);
  for (let j = items.length - 1; j > 0; j--) if (items[j].sep && items[j - 1].sep) items.splice(j, 1);
}


function registerActions(h) {
  const R = (id, def) => actions.register(id, def);
  
  if (!actions.has('window.cloneSource')) R('window.cloneSource', {
    run: () => { if (panels.exists('cloneSource')) return panels.toggle('cloneSource'); if (h.toggleCloneSource) h.toggleCloneSource(); return true; },
    checked: () => panels.exists('cloneSource') ? panels.isOpen('cloneSource') : !!(document.getElementById('cloneSrcPanel') && !document.getElementById('cloneSrcPanel').hidden),
  });
  R('window.libraries', { run: () => false, enabled: () => false, checked: () => false, why: () => WHY.libraries });
  R('window.versionHistory', { run: () => false, enabled: () => false, checked: () => false, why: () => WHY.versionHistory });
  R('window.exchange', { run: () => false, enabled: () => false, why: () => WHY.exchange });
  R('window.legacyExtensions', { run: () => false, enabled: () => false, why: () => WHY.legacy });
  R('window.appFrame', { run: () => false, enabled: () => false, checked: () => true, why: () => WHY.appFrame });
  R('window.contextTaskBar', { run: () => { ctxBar.set(!ctxBar.on()); }, checked: () => ctxBar.on() });
  R('window.workspace.3d', { run: () => false, enabled: () => false, why: () => 'PS 2026 已没有 3D 工作区（旧版 3D 功能已移除）' });
  R('window.3d', { run: () => false, enabled: () => false, why: () => 'PS 2026 已没有 3D 面板（旧版 3D 功能已移除）' });
  
  const sec = panels.sectionOf('plugins');
  if (sec) sec.innerHTML = '<div class="panel-empty" style="line-height:1.7;padding:10px;opacity:.8"><b>增效工具</b><br>没有已安装的增效工具。<br>'
    + 'PS 的增效工具是 UXP / CEP 程序，要 Creative Cloud 桌面程序安装并在本机运行；浏览器版本没有这类宿主，所以这里是空的。'
    + '<br><br><button type="button" disabled title="' + WHY.exchange + '">浏览增效工具…</button></div>';
}


const WS_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#d6d6d6" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M14 4v16M3 10h11"/></svg>');
function wsLabel(id) { const p = PRESETS.find(x => x[0] === id); return p ? p[1].replace('(默认)', '') : id; }
function wsItems() {
  const cur = workspaces.current();
  const presets = PRESETS.map(([id, label]) => ({ label, checked: cur === id, run: () => workspaces.switchTo(id) }));
  const custom = workspaces.list().filter(id => !PRESETS.some(p => p[0] === id)).map(id => ({ label: id, checked: cur === id, run: () => workspaces.switchTo(id) }));
  return [
    ...presets, ...(custom.length ? [S, ...custom] : []), S,
    { label: `复位${wsLabel(cur)}`, run: () => workspaces.resetCurrent() },
    { label: '新建工作区…', run: () => workspaces.newWorkspace() },
    { label: '删除工作区…', run: () => workspaces.deleteWorkspace(), disabled: !custom.length, why: '还没有用户新建的工作区（预设工作区不能删除）' },
    S,
    { label: '键盘快捷键和菜单…', run: () => actions.run('edit.keyboardShortcuts') },
    { label: '锁定工作区', checked: actions.checked('window.workspace.lock'), run: () => actions.run('window.workspace.lock') },
  ];
}
function installSwitcher() {
  const host = document.querySelector('.appbar-right'); if (!host || document.getElementById('workspaceSwitch')) return;
  const b = mk('button', { type: 'button', className: 'appbar-btn', id: 'workspaceSwitch' });
  b.dataset.attr = 'workspace-switch';
  if (hasUiIcon('workspace-switcher')) { const ic = uiIcon('workspace-switcher', 16); ic.style.pointerEvents = 'none'; b.append(ic); }   
  else b.append(mk('img', { src: WS_SVG, width: 15, height: 15, alt: '', draggable: false, style: 'display:block;pointer-events:none' }));
  const sync = () => { b.title = '选择工作区：' + wsLabel(workspaces.current()); };
  sync();
  b.onclick = () => { const r = b.getBoundingClientRect(); panels.popup(wsItems(), { left: r.left, right: r.right, top: r.top, bottom: r.bottom }); };
  b.addEventListener('pointerenter', sync);
  const ref = document.getElementById('exportPsd');
  if (ref && ref.parentElement === host) host.insertBefore(b, ref.nextSibling); else host.append(b);
}


const CTX_KEY = 'psd_editor.contextTaskBar';
const ctxGet = () => { try { return { on: false, pinned: false, pos: null, ...JSON.parse(localStorage.getItem(CTX_KEY) || '{}') }; } catch { return { on: false, pinned: false, pos: null }; } };
const ctxSet = o => { try { localStorage.setItem(CTX_KEY, JSON.stringify({ ...ctxGet(), ...o })); } catch {} };
const ctxBar = (() => {
  let el = null, timer = 0, mode = '';
  const style = `
#ctxTaskBar{position:fixed;z-index:60;display:flex;align-items:center;gap:2px;padding:4px 6px;background:var(--panel,#323232);border:1px solid var(--line,#1f1f1f);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.45);font-size:12px;color:var(--text,#ddd);user-select:none}
#ctxTaskBar[hidden]{display:none}
#ctxTaskBar .ctb-grip{width:8px;align-self:stretch;cursor:move;background:radial-gradient(#777 1px,transparent 1.5px) 0 0/4px 4px;opacity:.7;margin-right:2px}
#ctxTaskBar button{background:transparent;border:0;color:inherit;padding:4px 8px;border-radius:5px;font-size:12px;white-space:nowrap}
#ctxTaskBar button:hover:not(:disabled){background:#4a4a4a}
#ctxTaskBar button:disabled{opacity:.4}
#ctxTaskBar .ctb-sep{width:1px;align-self:stretch;background:#4a4a4a;margin:2px 3px}`;
  const BTN = {
    selection: [['选择并遮住…', 'select.selectAndMask'], ['反选', 'select.inverse'], ['羽化…', 'select.feather'], ['|'], ['从选区创建蒙版', 'layer.mask.revealSelection'], ['填充选区…', 'edit.fill'], ['变换选区', 'select.transform'], ['|'], ['取消选择', 'select.none']],
    layer: [['选择主体', 'select.subject'], ['|'], ['添加蒙版', 'layer.mask.revealAll'], ['自由变换', 'edit.freeTransform'], ['复制图层', 'layer.duplicate']],
  };
  function build() {
    if (!document.getElementById('ctb-style')) document.head.append(mk('style', { id: 'ctb-style', textContent: style }));
    el = mk('div', { id: 'ctxTaskBar', hidden: true }); el.dataset.attr = 'context-task-bar';
    document.body.append(el);
  }
  function place() {
    if (!el || el.hidden) return;
    const st = ctxGet();
    if (st.pinned && st.pos) { el.style.left = st.pos.x + 'px'; el.style.top = st.pos.y + 'px'; return; }
    const area = document.querySelector('.docarea'); const r = area ? area.getBoundingClientRect() : { left: 0, width: innerWidth, bottom: innerHeight };
    el.style.left = Math.max(4, Math.round(r.left + r.width / 2 - el.offsetWidth / 2)) + 'px';
    el.style.top = Math.round(r.bottom - el.offsetHeight - 36) + 'px';
  }
  function fill(m) {
    mode = m; el.textContent = '';
    const grip = mk('span', { className: 'ctb-grip', title: '拖动以移动上下文任务栏' }); el.append(grip);
    grip.onpointerdown = e => {
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; grip.setPointerCapture(e.pointerId);
      grip.onpointermove = ev => { el.style.left = (ev.clientX - dx) + 'px'; el.style.top = (ev.clientY - dy) + 'px'; };
      grip.onpointerup = () => { grip.onpointermove = null; const b = el.getBoundingClientRect(); ctxSet({ pinned: true, pos: { x: Math.round(b.left), y: Math.round(b.top) } }); };
    };
    for (const [label, action] of BTN[m] || []) {
      if (label === '|') { el.append(mk('span', { className: 'ctb-sep' })); continue; }
      const b = mk('button', { type: 'button', textContent: label, disabled: !actions.enabled(action) });
      b.dataset.action = action; const w = actions.why(action); if (w && b.disabled) b.title = w;
      b.onclick = () => { actions.run(action); later(); };
      el.append(b);
    }
    const more = mk('button', { type: 'button', textContent: '⋯', title: '更多选项' });
    more.onclick = () => { const r = more.getBoundingClientRect(); const st = ctxGet(); panels.popup([
      { label: '隐藏栏', run: () => set(false) },
      { label: '重置栏位置', run: () => { ctxSet({ pinned: false, pos: null }); place(); } },
      { label: '固定栏位置', checked: !!st.pinned, run: () => { const b = el.getBoundingClientRect(); ctxSet({ pinned: !st.pinned, pos: { x: Math.round(b.left), y: Math.round(b.top) } }); } },
    ], { left: r.left, right: r.right, top: r.top, bottom: r.bottom }); };
    el.append(more);
  }
  function update() {
    if (!el) return;
    const on = ctxGet().on && C && C.hasDoc && C.hasDoc();
    if (!on) { el.hidden = true; return; }
    const sel = C.st && C.st().selection;
    const m = sel ? 'selection' : (C.selected && C.selected().length ? 'layer' : '');
    if (!m) { el.hidden = true; return; }
    fill(m); el.hidden = false; place();
  }
  let timer2 = 0;
  function later() { clearTimeout(timer); clearTimeout(timer2); timer = setTimeout(update, 120); timer2 = setTimeout(update, 700); }   
  function set(v) { ctxSet({ on: !!v }); update(); }
  return {
    install() { build(); actions.onRun(() => later()); addEventListener('pointerup', later, true); addEventListener('keyup', later, true); addEventListener('resize', () => place()); update(); },
    on: () => ctxGet().on, set, update, mode: () => mode,
  };
})();


let installed = false;
export function installWindowMenu(h = {}) {
  if (installed) return; installed = true;
  C = h.ctx || null;
  patchWindowMenu();
  registerActions(h);
  installSwitcher();
  ctxBar.install();
}
export const windowMenu = { installWindowMenu, patchWindowMenu, ctxBar, wsItems };
export default windowMenu;
