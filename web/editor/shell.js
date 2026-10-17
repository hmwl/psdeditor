





import { actions } from './actions.js';
import { shortcuts } from './shortcuts.js';
import { keylock } from './keylock.js';
import { menu } from './menu.js';
import { tools } from './tools.js';
import { panels } from './panels.js';

const $ = s => document.querySelector(s);
const state = { screenMode: 'standard', panelsHidden: false, sideHidden: false, status: '' };
let statusEl = null;

export function status(msg) { state.status = msg || ''; if (statusEl) statusEl.textContent = state.status; }


export function setDocTab(info) {
  const tab = $('#docTab'); if (!tab) return;
  if (!info || !info.name) { tab.hidden = true; $('.docarea').classList.remove('has-doc'); return; }
  tab.hidden = false; $('.docarea').classList.add('has-doc');
  const parts = [];
  if (info.layer) parts.push(info.layer);
  if (info.mode) parts.push(info.mode + (info.depth ? '/' + info.depth : ''));
  const title = `${info.name} @ ${info.zoom != null ? fmtZoom(info.zoom) : ''}${parts.length ? ` (${parts.join(', ')})` : ''}${info.dirty ? ' *' : ''}`;
  const t = tab.querySelector('.doctab-title'); if (t) t.textContent = title;
  tab.title = title;
}
const fmtZoom = z => { const p = z * 100; return (p >= 100 || Number.isInteger(p) ? Math.round(p) : +p.toFixed(2)) + '%'; };


const MODES = ['standard', 'fullMenu', 'full'];
export function setScreenMode(mode) {
  if (!MODES.includes(mode)) return;
  state.screenMode = mode;
  const app = $('.app');
  app.classList.toggle('screen-full-menu', mode === 'fullMenu');
  app.classList.toggle('screen-full', mode === 'full');
  tools.setScreenMode(mode);        
  
  
  if (mode === 'full') {
    keylock.enter().then(got => status(got
      ? '全屏模式：⌘/Ctrl 快捷键已交给编辑器（⌘T 自由变换可用；按住 Esc 退出全屏）'
      : '全屏模式：当前浏览器无法接管 ⌘T 等保留键，请用备用键 ' + shortcuts.labelFor('edit.freeTransform')));
  } else {
    keylock.leave();
  }
  dispatchResize();
}

function dispatchResize() { requestAnimationFrame(() => window.dispatchEvent(new window.Event('resize'))); }
export function togglePanels(all) {
  const app = $('.app');
  if (all) { state.panelsHidden = !state.panelsHidden; app.classList.toggle('hide-panels', state.panelsHidden); }
  else { state.sideHidden = !state.sideHidden; app.classList.toggle('hide-side', state.sideHidden); }
  dispatchResize();
}


const WINDOW_PANELS = {
  layers: 'layers', channels: 'channels', paths: 'paths', properties: 'properties', adjustments: 'adjustments',
  color: 'color', swatches: 'swatches', gradients: 'gradients', patterns: 'patterns', history: 'history', notes: 'notes',
  navigator: 'navigator', info: 'info', actions: 'actions', brushSettings: 'brushSettings', brushes: 'brushes', glyphs: 'glyphs',
  characterStyles: 'characterStyles', paragraphStyles: 'paragraphStyles', layerComps: 'layerComps', histogram: 'histogram',
  timeline: 'timeline', measurementLog: 'measurementLog', toolPresets: 'toolPresets', comments: 'comments', contentCredentials: 'contentCredentials',
  styles: 'styles', shapes: 'shapes',
  modifierKeys: 'modifierKeys', plugins: 'plugins', '3d': '3d',
};
function registerWindowActions() {
  for (const [key, pid] of Object.entries(WINDOW_PANELS)) {
    actions.register('window.' + key, { run: () => panels.toggle(pid), checked: () => panels.isOpen(pid), enabled: () => panels.exists(pid) });
  }
  
  for (const [id, mate] of [['character', 'paragraph'], ['paragraph', 'character']])
    actions.register('window.' + id, { run: () => (panels.isOpen(id) && panels.isVisible(id) ? panels.hide(id) : panels.showGrouped(id, [mate])),
      checked: () => panels.isOpen(id), enabled: () => panels.exists(id) });
  actions.register('window.options', { run: () => { const o = $('.optbar'); o.classList.toggle('hidden-by-user'); dispatchResize(); }, checked: () => !$('.optbar').classList.contains('hidden-by-user') });
  actions.register('window.tools', { run: () => { const o = $('#toolbar'); o.classList.toggle('hidden-by-user'); dispatchResize(); }, checked: () => !$('#toolbar').classList.contains('hidden-by-user') });
  actions.register('window.appFrame', { run: () => {}, checked: () => true });
  actions.register('window.togglePanels', { run: () => togglePanels(true) });
  actions.register('window.toggleSidePanels', { run: () => togglePanels(false) });
  actions.register('window.workspace.essentials', { run: () => panels.resetLayout(), checked: () => true });
  actions.register('window.workspace.reset', { run: () => { panels.resetLayout(); status('已复位「基本功能」工作区'); } });
  actions.register('window.document', { run: (id) => {  }, checked: () => true });
  actions.register('view.screenMode.standard', { run: () => setScreenMode('standard'), checked: () => state.screenMode === 'standard' });
  actions.register('view.screenMode.fullMenu', { run: () => setScreenMode('fullMenu'), checked: () => state.screenMode === 'fullMenu' });
  actions.register('view.screenMode.full', { run: () => setScreenMode('full'), checked: () => state.screenMode === 'full' });
  actions.register('view.screenModeCycle', { run: () => setScreenMode(MODES[(MODES.indexOf(state.screenMode) + 1) % MODES.length]) });
  actions.register('help.about', { run: () => {
    const d = $('#aboutDlg'); if (!d) return;
    
    const v = $('#aboutVer');
    const ed = typeof __PSD_EDITOR_VERSION__ === 'string' ? __PSD_EDITOR_VERSION__ : 'dev';
    if (v) {
      v.textContent = `编辑器 ${ed}`;
      fetch('/health', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(h => {
        if (h && h.version) v.textContent = `编辑器 ${ed} · 服务端 ${h.version}${h.node ? '（Node ' + h.node + '）' : ''}`;
      }).catch(() => {});
    }
    d.showModal();
  } });
  actions.register('edit.keyboardShortcuts', { run: () => openShortcutsDialog() });
}


function openShortcutsDialog() {
  const d = $('#shortcutsDlg'); if (!d) return;
  const body = d.querySelector('.sc-body'); body.innerHTML = '';
  
  const note = document.createElement('p');
  note.className = 'hint'; note.style.margin = '0 0 8px';
  note.textContent = keylock.captured()
    ? '已接管浏览器保留键：⌘T / ⌘N / ⌘W / ⌘1… 全部直接可用。'
    : `⌘T、⌘N、⌘W 这类组合被浏览器占着（新建标签 / 新建窗口 / 关闭标签），普通标签页里页面收不到。备用键：自由变换 ${shortcuts.labelFor('edit.freeTransform')}、再次变换 ${shortcuts.labelFor('edit.transformAgain')}；按 F 切到「全屏模式」可以把这些键整组抢回来。`;
  body.appendChild(note);
  const rows = shortcuts.table().sort((a, b) => a.action.localeCompare(b.action));
  const tbl = document.createElement('table');
  tbl.innerHTML = '<thead><tr><th>命令</th><th>菜单位置</th><th>快捷键</th><th>状态</th></tr></thead>';
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const p = menu.pathOf(r.action);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td class="muted"></td><td><kbd></kbd></td><td class="muted"></td>`;
    tr.children[0].textContent = p ? p[p.length - 1] : r.action;
    tr.children[1].textContent = p ? p.slice(0, -1).join(' › ') : (r.action.startsWith('tool.') ? '工具' : '');
    tr.children[2].firstChild.textContent = r.display;
    tr.children[3].textContent = actions.has(r.action) ? '' : '待实现';
    tb.appendChild(tr);
  }
  tbl.appendChild(tb); body.appendChild(tbl);
  d.showModal();
}


let inited = false;
export function init() {
  if (inited) return; inited = true;
  statusEl = $('#info');
  menu.renderMenuBar($('#menubar'));
  tools.render($('#toolbar'));
  tools.bindKeys();
  tools.onStatus(status);
  panels.init();
  registerWindowActions();
  shortcuts.install(window);
  
  keylock.install(() => { if (state.screenMode === 'full') setScreenMode('standard'); });
  
  const x = $('#docTab .doctab-close'); if (x) x.addEventListener('click', e => { e.stopPropagation(); actions.run('file.close'); });
  
  
  
  for (const b of document.querySelectorAll('.home-card[data-action], .home-link[data-action]')) b.addEventListener('click', e => { e.preventDefault(); actions.run(b.dataset.action); });
  showHomeTip();
  
  panels.onChange(() => {});
  setDocTab(null);
}

export const shell = { init, status, setDocTab, setScreenMode, togglePanels, state, menu, tools, panels, shortcuts, keylock, actions };
export default shell;


const HOME_TIPS = [
  '把 <b>.psd / .psb</b> 或图片直接<b>拖进窗口</b>就能打开；拖到已打开的文档上 = 作为图层置入。',
  '按住 <kbd>空格</kbd> 拖动平移画布，<kbd>⌘/Ctrl+0</kbd> 适合窗口，<kbd>⌘/Ctrl+1</kbd> 100%。',
  '<b>双击智能对象</b>进入内部编辑，改完按 <kbd>Esc</kbd> 或「返回上级」，改动自动回写。',
  '工具快捷键与 Photoshop 相同：<kbd>V</kbd> 移动、<kbd>M</kbd> 选框、<kbd>B</kbd> 画笔、<kbd>T</kbd> 文字……同组工具按 <kbd>⇧</kbd>+键 切换。',
  '<kbd>⌘/Ctrl+K</kbd> 打开首选项；「帮助 › 键盘快捷键速查」可以搜索任何命令的快捷键。',
  '编辑中的文档会定时存「恢复信息」：浏览器崩溃后再打开编辑器，会问要不要恢复（首选项 › 文件处理）。',
  '「文件 › 导出」可以存 PSD / PNG / JPG / WebP / TIFF；PSD 保留图层、文字、智能对象与变形，Photoshop 里可继续编辑。',
  '历史记录面板里点任意一步可以回到那一刻；右键「新建快照」能留住当前状态。',
];
export function showHomeTip() {
  const el = document.getElementById('homeTip'); if (!el) return;
  let i = 0;
  try { i = (+localStorage.getItem('psd_editor.homeTip') + 1) % HOME_TIPS.length; localStorage.setItem('psd_editor.homeTip', String(i)); } catch { i = Math.floor(Math.random() * HOME_TIPS.length); }
  el.innerHTML = '提示：' + HOME_TIPS[i];
}
