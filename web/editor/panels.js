






























import { uiIcon, hasUiIcon } from './icons.js';
const $ = s => document.querySelector(s);

const chromeIcon = (name, size) => uiIcon(name, size);
const SIDE_WIDTH_KEY = 'psd_editor:right-panel-width', SIDE_WIDTH_DEFAULT = 320;



const PANEL_COL_MIN = 250;
const LAYOUT_KEY = 'psd_editor:panel-layout';
const DOCK_WIDTH_KEY = 'psd_editor:icon-dock-width', DOCK_WIDTH_MIN = 34, DOCK_WIDTH_MAX = 200, DOCK_WIDE_AT = 72;

const PANEL_TITLES = {
  color: '颜色', swatches: '色板', gradients: '渐变', patterns: '图案',
  properties: '属性', adjustments: '调整',
  layers: '图层', channels: '通道', paths: '路径',
  history: '历史记录', notes: '注释', character: '字符', paragraph: '段落', info: '信息', navigator: '导航器',
  actions: '动作', brushSettings: '画笔设置', brushes: '画笔', glyphs: '字形', characterStyles: '字符样式', paragraphStyles: '段落样式',
  layerComps: '图层复合', histogram: '直方图', timeline: '时间轴', measurementLog: '测量记录', toolPresets: '工具预设',
  styles: '样式', shapes: '形状',
  comments: '评论', contentCredentials: '内容凭证', modifierKeys: '修改键', plugins: '增效工具', '3d': '3D',
  cloneSource: '仿制源',   
};
export function titleOf(id) { return PANEL_TITLES[id] || id; }





const PANEL_ICONS = {
  character: 'panel-character', paragraph: 'panel-paragraph',
  characterStyles: 'panel-character-styles', paragraphStyles: 'panel-paragraph-styles',
  layers: 'panel-layers', channels: 'panel-channels', paths: 'panel-paths',
  color: 'panel-color', swatches: 'panel-swatches', gradients: 'panel-gradients', patterns: 'panel-patterns',
  shapes: 'panel-shapes', styles: 'panel-styles',
  properties: 'panel-properties', adjustments: 'panel-adjustments',
  histogram: 'panel-histogram', info: 'panel-info', navigator: 'panel-navigator',
  history: 'panel-history', actions: 'panel-actions',
  layerComps: 'panel-layer-comps', glyphs: 'panel-glyphs', '3d': 'panel-3d',
  

  timeline: 'panel-timeline', measurementLog: 'panel-measurement-log', toolPresets: 'panel-tool-presets',
  notes: 'notes', brushes: 'brush', brushSettings: 'brush',
};





const PANEL_ICON_PX = 16;

const PANEL_ICON_MAKERS = new Map();
export function setPanelIcon(id, make) { PANEL_ICON_MAKERS.set(id, make); }
function panelIconNode(id, size = PANEL_ICON_PX) {
  const mkr = PANEL_ICON_MAKERS.get(id);
  if (mkr) { try { const n = mkr(size); if (n) return n; } catch {} }
  const name = PANEL_ICONS[id];
  if (name && hasUiIcon(name)) return chromeIcon(name, size);
  const t = document.createElement('span'); t.className = 'fp-icon-text'; t.textContent = titleOf(id).slice(0, 1); return t;
}

let sideEl, colEl, dockEl, listeners = new Set();
const menuFns = new Map();     
export function onChange(fn) { listeners.add(fn); }
const emit = () => { for (const fn of listeners) fn(); };










const sideWidth = () => sideEl ? Math.round(sideEl.getBoundingClientRect().width) : 0;
const dockCols = () => (sideEl ? [...sideEl.querySelectorAll(':scope > .icon-dock')] : []);
const dockColOf = el => (el && el.closest ? el.closest('.icon-dock') : null);
const isDockIcon = el => { const b = el && el.closest && el.closest('button[data-panel]'); return !!b && (!!dockColOf(b) || (colIconsEl && colIconsEl.contains(b))); };
const dockBtnsOf = c => (c ? [...c.querySelectorAll(':scope > button[data-panel]')].filter(b => !b.hidden) : []);
const dockWidthOf = c => (c ? Math.round(c.getBoundingClientRect().width) : 0) || DOCK_WIDTH_MIN;
const dockTotalWidth = () => dockCols().reduce((n, c) => n + dockWidthOf(c), 0);
const panelColWidth = () => (colEl ? Math.round(colEl.getBoundingClientRect().width) : 0);


function relayoutSide(delta) {
  if (!delta || !sideEl || sideEl.classList.contains('hidden-all')) return;
  setSideWidth(sideWidth() + delta, { min: 0, persist: false });
  keepPanelMin();                                                           
}


export function init() {
  sideEl = $('#layerPanel'); colEl = $('#panelCol'); dockEl = $('#iconDock');
  if (!sideEl || !colEl) return;
  for (const g of colEl.querySelectorAll('.panel-group')) initGroup(g);
  for (const sp of colEl.querySelectorAll('.pg-splitter')) initSplitter(sp);
  snapshotHome();
  initSideResize();
  initDock();
  initColCollapse();
  restoreLayout();
  syncAll();
  





  if (!colCollapsed()) { const w = savedPanelWidth() || colPrevWidth; if (w) setPanelColWidth(w, { persist: false }); }
}




let homeSnap = null;
function snapshotHome() {
  homeSnap = {
    colKids: [...colEl.children].filter(el => el.classList.contains('panel-group') || el.classList.contains('pg-splitter')),
    groups: [...colEl.querySelectorAll(':scope > .panel-group')].map(g => ({
      g, tabs: [...g.querySelectorAll('.pg-tabs > button[data-panel]')],
      body: g.querySelector('.pg-body'),
    })),
    dock: dockEl ? [...dockEl.querySelectorAll(':scope > button[data-panel]')] : [],
  };
}
function initGroup(g) {
  const tabs = g.querySelector('.pg-tabs');
  tabs.addEventListener('click', e => {
    


    if (g.__fpTornAt && Date.now() - g.__fpTornAt < 350) { e.stopPropagation(); return; }
    const b = e.target.closest('button[data-panel]'); if (!b) return;
    if (g.classList.contains('collapsed') && b.classList.contains('on')) { g.classList.remove('collapsed'); saveLayout(); syncAll(); return; }
    g.classList.remove('collapsed');
    activate(g, b.dataset.panel); saveLayout();
  });
  tabs.addEventListener('dblclick', e => {
    if (e.target.closest('.pg-menu')) return;
    g.classList.toggle('collapsed'); saveLayout(); syncAll();
  });
  initTearOut(g, tabs);
  const menuBtn = tabs.querySelector('.pg-menu');
  if (menuBtn) menuBtn.addEventListener('click', e => { e.stopPropagation(); openPanelMenu(g, menuBtn); });
  if (!g.querySelector('.pg-tabs button.on')) { const first = g.querySelector('.pg-tabs button[data-panel]'); if (first) activate(g, first.dataset.panel); }
}
















function beginWinDrag(win, grab) {
  return {
    move(x, y) {
      win.classList.add('fp-dragging');                                     
      win.style.left = Math.max(0, Math.min(innerWidth - 80, x - grab.x)) + 'px';
      win.style.top = Math.max(0, Math.min(innerHeight - 40, y - grab.y)) + 'px';
      showDropHint(dropAt(x, y));
    },
    end(x, y) {
      showDropHint(null);
      win.classList.remove('fp-dragging');
      if (!win.isConnected) return;
      const at = dropAt(x, y);
      if (at) dockInto(at, win);
    },
  };
}


function initTearOut(g, tabs) {
  tabs.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.pg-menu, .pg-collapse, .pg-close')) return;      
    const btn = e.target.closest('button[data-panel]');
    const sx = e.clientX, sy = e.clientY;
    const win0 = g.closest('.float-panel');
    let win = win0, drag = win0 ? { x: sx - win0.offsetLeft, y: sy - win0.offsetTop } : null;
    let torn = !!win0, reordered = false, moved = false, ctl = null, ctlWin = null;
    const bar = tabs.getBoundingClientRect();

    const onMove = ev => {
      if (!torn) {
        if (!btn) return;                                                    
        if (!reordered && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;   
        

        if (ev.clientY >= bar.top - TEAR_Y && ev.clientY <= bar.bottom + TEAR_Y) {
          if (!reordered) { reordered = true; btn.classList.add('reordering'); tabs.classList.add('reordering'); }
          moveTabTo(tabs, btn, ev.clientX);
          return;
        }
        if (reordered) { btn.classList.remove('reordering'); tabs.classList.remove('reordering'); }
        torn = true;
        btn.__fpTornAt = Date.now();
        win = floatPanel(btn, ev.clientX, ev.clientY);
        drag = { x: 20, y: 12 };                                             
      }
      
      moved = true;
      if (ctlWin !== win) { ctlWin = win; ctl = beginWinDrag(win, drag); }
      ctl.move(ev.clientX, ev.clientY);
    };
    const onUp = ev => {
      off();
      if (win) win.classList.remove('fp-dragging');
      if (!torn && reordered) {                                             
        showDropHint(null);
        btn.classList.remove('reordering'); tabs.classList.remove('reordering');
        g.__fpTornAt = Date.now();                                          
        activate(g, btn.dataset.panel); saveLayout();
        return;
      }
      if (!torn || !win || !win.isConnected) { showDropHint(null); return; }
      

      if (win0 && !moved) { showDropHint(null); return; }
      if (!ctl) ctl = beginWinDrag(win, drag);
      ctl.end(ev.clientX, ev.clientY);
    };
    const off = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
    };
    const onCancel = () => { showDropHint(null); off(); if (win) win.classList.remove('fp-dragging'); if (btn) btn.classList.remove('reordering'); tabs.classList.remove('reordering'); };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
  });
  tabs.addEventListener('dblclick', () => {
    const win = g.closest('.float-panel'); if (!win) return;
    const last = lastDockTarget();
    dockInto(last ? { kind: 'group', g: last } : { kind: 'gap', ref: null }, win);
  });
}
const TEAR_Y = 14;

function moveTabTo(tabs, btn, x) {
  const others = [...tabs.querySelectorAll(':scope > button[data-panel]')].filter(b => b !== btn && !b.hidden);
  let ref = null;
  for (const b of others) { const r = b.getBoundingClientRect(); if (x < r.left + r.width / 2) { ref = b; break; } }
  if (!ref) ref = tabs.querySelector(':scope > .grow') || null;
  if (ref === btn.nextElementSibling && ref !== null) return;
  if (ref) tabs.insertBefore(btn, ref); else tabs.appendChild(btn);
}









const GAP_EDGE = 8;
function dropAt(x, y) {
  if (!colEl) return null;
  const dk = dockDropAt(x, y) || colIconsDropAt(x, y);
  if (dk) return dk;
  const c = colEl.getBoundingClientRect();
  if (colEl.classList.contains('col-empty')) {                              
    const sr = sideEl.getBoundingClientRect();
    if (x >= sr.right - 90 && x <= sr.right + 40 && y >= sr.top && y <= sr.bottom) return { kind: 'gap', ref: null, y: sr.top + 8 };
    return null;
  }
  if (colCollapsed()) {                                                     
    if (x < c.left || x > c.right || y < c.top || y > c.bottom) return null;
    const last = lastDockTarget();
    return last ? { kind: 'group', g: last, collapsedCol: true } : { kind: 'gap', ref: null, y: c.top };
  }
  if (x < c.left || x > c.right || y < c.top - GAP_EDGE || y > c.bottom + GAP_EDGE) return null;
  const gs = [...colEl.querySelectorAll(':scope > .panel-group')].filter(g => !g.hidden);
  if (!gs.length) return { kind: 'gap', ref: null, y: c.top };
  const rs = gs.map(g => g.getBoundingClientRect());
  if (y <= rs[0].top + GAP_EDGE) return { kind: 'gap', ref: gs[0], y: Math.max(c.top, rs[0].top) };
  for (let i = 0; i < gs.length - 1; i++) {
    if (y >= rs[i].bottom - GAP_EDGE && y <= rs[i + 1].top + GAP_EDGE) return { kind: 'gap', ref: gs[i + 1], y: (rs[i].bottom + rs[i + 1].top) / 2 };
  }
  const lastBottom = Math.min(rs[rs.length - 1].bottom, c.bottom);
  if (y >= lastBottom - GAP_EDGE) return { kind: 'gap', ref: null, y: lastBottom };
  for (let i = 0; i < gs.length; i++) if (y >= rs[i].top && y <= rs[i].bottom) return { kind: 'group', g: gs[i], x, y };
  return { kind: 'gap', ref: null, y: lastBottom };
}




const DOCK_EDGE_IN = 10, DOCK_EDGE_OUT = 30;                                






const NEWCOL_INSET = 3, NEWCOL_REACH = 30, NEWCOL_SEAM = 6;
function dockDropAt(x, y) {
  if (!sideEl) return null;
  const cols = dockCols().filter(c => c.getClientRects().length);
  
  
  for (let i = 0; i < cols.length; i++) {
    const r = cols[i].getBoundingClientRect();
    if (y < r.top - 8 || y > r.bottom + 8) continue;
    const out = i === 0 ? NEWCOL_REACH : NEWCOL_SEAM, ins = i === 0 ? NEWCOL_INSET : NEWCOL_SEAM;
    if (x >= r.left - out && x <= r.left + ins) return { kind: 'dock-new', ref: cols[i], y };
  }
  for (const c of cols) {
    const r = c.getBoundingClientRect();
    if (y < r.top - 8 || y > r.bottom + 8) continue;
    if (x >= r.left && x <= r.right + 2) {
      const btns = dockBtnsOf(c).filter(b => !b.classList.contains('dock-dragging'));
      
      const rectOf = b => (c.__expanded && b.__dockGroup && b.__dockGroup.isConnected ? b.__dockGroup : b).getBoundingClientRect();
      let ref = null, lineY = null;
      for (const b of btns) { const br = rectOf(b); if (y < br.top + br.height / 2) { ref = b; lineY = br.top - 1; break; } }
      if (lineY == null) { const lb = btns[btns.length - 1]; lineY = lb ? rectOf(lb).bottom + 1 : r.top + 16; }
      return { kind: 'dock', col: c, ref, y: lineY };
    }
  }
  if (!cols.length) {
    const c = colEl.getBoundingClientRect();
    if (y >= c.top && y <= c.bottom && x >= c.left - NEWCOL_REACH && x <= c.left + 16) return { kind: 'dock-new', ref: null, y };
  }
  return null;
}


function colIconsDropAt(x, y) {
  if (!colCollapsed() || !colIconsEl) return null;
  const col = colEl.getBoundingClientRect();
  if (x < col.left - 4 || x > col.right + 2 || y < col.top || y > col.bottom) return null;
  const r = colIconsEl.getBoundingClientRect();
  if (x <= r.left + 6 && x >= r.left - 30) return { kind: 'dock-new', ref: null, y };
  let tab = null;
  for (const b of dockBtnsOf(colIconsEl)) { const br = b.getBoundingClientRect(); if (y < br.top + br.height / 2) { tab = b; break; } }
  return { kind: 'col-icons', tab, y };
}


let dropHint = null;
function showDropHint(at) {
  if (!at) { if (dropHint) dropHint.hidden = true; return; }
  if (!dropHint || !dropHint.isConnected) {
    dropHint = document.createElement('div'); dropHint.className = 'dock-drop-hint';
    document.body.appendChild(dropHint);
  }
  const c = colEl.getBoundingClientRect();
  let r;
  if (at.kind === 'dock') { const d = at.col.getBoundingClientRect(), H = 6; r = { left: d.left + 2, top: at.y - H / 2, width: d.width - 4, height: H }; }
  else if (at.kind === 'col-icons') { const d = colIconsEl.getBoundingClientRect(), H = 6; r = { left: d.left + 2, top: at.y - H / 2, width: d.width - 4, height: H }; }
  else if (at.kind === 'dock-new') {
    const sr = sideEl.getBoundingClientRect();
    const x = at.ref ? at.ref.getBoundingClientRect().left : Math.max(sr.left, c.left - 20);
    r = { left: x - 2, top: sr.top + 2, width: 4, height: Math.max(40, sr.height - 4) };
  }
  else if (at.collapsedCol) { r = { left: c.left, top: c.top, width: c.width, height: c.height }; }
  else if (at.kind === 'group') { r = at.g.getBoundingClientRect(); r = { left: r.left, top: Math.max(r.top, c.top), width: r.width, height: Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) }; }
  else { const H = 12; r = { left: c.left, top: Math.max(c.top, Math.min(c.bottom - H, at.y - H / 2)), width: c.width, height: H }; }
  dropHint.hidden = false;
  dropHint.classList.toggle('gap', at.kind !== 'group');
  dropHint.classList.toggle('newcol', at.kind === 'dock-new');
  Object.assign(dropHint.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: Math.max(6, r.height) + 'px' });
}
function lastDockTarget() {
  const gs = [...colEl.querySelectorAll(':scope > .panel-group')].filter(x => !x.hidden);
  return gs[gs.length - 1] || null;
}






function syncFloatMenu(win) {
  const m = win.querySelector(':scope > .panel-group > .pg-tabs > .pg-menu');
  if (!m) return;
  const g = win.querySelector('.panel-group');
  const id = (g && g.dataset.active) || win.dataset.panel;
  const tabs = [...win.querySelectorAll('.pg-tabs > button[data-panel]')].filter(b => !b.hidden);
  m.hidden = tabs.length < 2 && !menuFns.has(id);
}


function floatPanel(btn, px, py) {
  const id = btn.dataset.panel;
  const srcGroup = btn.closest('.panel-group');
  const sec = sectionOf(id);
  const win = document.createElement('div'); win.className = 'float-panel panel-float';
  const g = document.createElement('div'); g.className = 'panel-group grow'; g.dataset.group = 'float-' + id;
  const tabs = document.createElement('div'); tabs.className = 'pg-tabs';
  const grow = document.createElement('span'); grow.className = 'grow';
  const menu = document.createElement('button'); menu.type = 'button'; menu.className = 'pg-menu'; menu.title = '面板菜单';
  menu.appendChild(chromeIcon('panel-menu', 13));
  const body = document.createElement('div'); body.className = 'pg-body';
  const fold = iconifyButton(win);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'pg-close'; close.title = '关闭';
  close.appendChild(chromeIcon('x', 10));
  close.addEventListener('pointerdown', e => e.stopPropagation());
  close.addEventListener('click', e => { e.stopPropagation(); const cur = g.dataset.active || id; closeFloat(cur, win); });
  g.append(tabs, body); tabs.append(btn, grow, fold, menu, close);
  win.dataset.panel = id;
  if (sec) { sec.hidden = false; body.appendChild(sec); }
  win.appendChild(g);
  const grip = document.createElement('div'); grip.className = 'fp-grip'; grip.title = '拖动改变大小';
  win.appendChild(grip);
  $('.app').appendChild(win);
  const w = Math.max(240, (srcGroup && srcGroup.getBoundingClientRect().width) || 280);
  win.style.width = w + 'px'; win.style.height = '260px';
  win.style.left = Math.max(0, Math.min(innerWidth - 80, px - 20)) + 'px';
  win.style.top = Math.max(0, Math.min(innerHeight - 40, py - 12)) + 'px';
  win.style.zIndex = ++floatZ;
  win.addEventListener('pointerdown', () => { win.style.zIndex = ++floatZ; });
  initGroup(g);
  menu.addEventListener('click', e => { e.stopPropagation(); openPanelMenu(g, menu); });
  activate(g, id);
  syncFloatMenu(win);                                     
  initGrip(win, grip);
  floats.set(id, win);
  for (const b of g.querySelectorAll('.pg-tabs button[data-panel]')) b.classList.toggle('on', b.dataset.panel === id);
  syncAll(); saveLayout();
  return win;
}






function dockInto(at, win) {
  const g = win.querySelector('.panel-group'); if (!g) { win.remove(); return; }
  const tabs = [...g.querySelectorAll('.pg-tabs button[data-panel]')];
  if (!tabs.length) { win.remove(); return; }
  const one = at && at.iconId ? tabs.find(b => b.dataset.panel === at.iconId) : null;
  const moving = one ? [one] : tabs;
  for (const b of moving) if (floats.get(b.dataset.panel) === win) floats.delete(b.dataset.panel);
  const rest = tabs.length - moving.length;

  if (at && (at.kind === 'dock' || at.kind === 'dock-new')) {                
    const col = at.kind === 'dock' ? at.col : newDockCol(at.ref);
    for (const b of moving) {
      const id = b.dataset.panel, sec = sectionOf(id);
      if (sec) { sec.hidden = true; $('#panelStore').appendChild(sec); }
      b.remove();
      if (col) addDockButton(id, at.kind === 'dock' ? at.ref : null, col);
    }
    finishPlace(win, rest);
    return;
  }
  

  if (at && at.kind === 'col-icons') {
    const t = at.tab && tabOf(at.tab.dataset.panel);
    const tg = (t && t.closest('.panel-group')) || lastDockTarget();
    const tTabs = tg && tg.querySelector('.pg-tabs');
    at = tg ? { kind: 'group', g: tg, before: t && t.parentElement === tTabs ? t : null } : null;
  }
  const target = at && at.kind === 'group' && colEl.contains(at.g) ? at.g : null;
  if (!target) {                                                            
    const ng = document.createElement('div'); ng.className = 'panel-group'; ng.dataset.group = 'float-' + moving[0].dataset.panel;
    const t = document.createElement('div'); t.className = 'pg-tabs';
    const grow = document.createElement('span'); grow.className = 'grow';
    const menu = document.createElement('button'); menu.type = 'button'; menu.className = 'pg-menu'; menu.title = '面板菜单';
    menu.appendChild(chromeIcon('panel-menu', 13));
    const b = document.createElement('div'); b.className = 'pg-body';
    ng.append(t, b); t.append(grow, menu);
    const sp = document.createElement('div'); sp.className = 'pg-splitter';
    const ref = at && at.kind === 'gap' && at.ref && at.ref.parentElement === colEl ? at.ref : null;
    if (ref) { colEl.insertBefore(ng, ref); colEl.insertBefore(sp, ref); }     
    else colEl.append(sp, ng);                                               
    initSplitter(sp);
    for (const btn of moving) {
      const sec = sectionOf(btn.dataset.panel);
      t.insertBefore(btn, grow);
      if (sec) { sec.hidden = false; b.appendChild(sec); }
      btn.__fpTornAt = Date.now();
    }
    initGroup(ng);
    menu.addEventListener('click', e => { e.stopPropagation(); openPanelMenu(ng, menu); });
    activate(ng, moving[moving.length - 1].dataset.panel);
    finishPlace(win, rest); return;
  }
  const tabsEl = target.querySelector('.pg-tabs');
  const body = target.querySelector('.pg-body');
  const grow = tabsEl.querySelector('.grow') || tabsEl;
  for (const btn of moving) {
    const at2 = at.before && at.before.parentElement === tabsEl ? at.before : grow;
    tabsEl.insertBefore(btn, at2);
    const sec = sectionOf(btn.dataset.panel);
    if (sec) { sec.hidden = false; body.appendChild(sec); }
    btn.__fpTornAt = Date.now();
  }
  const tr = tabsEl.getBoundingClientRect();
  if (!at.before && at.x != null && at.y >= tr.top - TEAR_Y && at.y <= tr.bottom + TEAR_Y) moveTabTo(tabsEl, moving[0], at.x);   
  const lastId = moving[moving.length - 1].dataset.panel;
  finishPlace(win, rest);
  activate(target, lastId);
}


function finishPlace(win, rest) {
  if (rest > 0) renderFloatIcons(win); else win.remove();
  pruneDockCols();
  syncAll(); saveLayout(); emit();
}




function iconifyButton(win) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pg-collapse fp-iconify'; b.title = '折叠为图标';
  b.appendChild(chromeIcon('chevron-right', 8));
  b.addEventListener('pointerdown', e => e.stopPropagation());               
  b.addEventListener('click', e => { e.stopPropagation(); iconify(win); });
  return b;
}
function panelIdsOf(win) {
  const ids = [...win.querySelectorAll('.pg-tabs button[data-panel]')].map(b => b.dataset.panel);
  return ids.length ? ids : (win.dataset.panel ? [win.dataset.panel] : []);
}

function renderFloatIcons(win) {
  const old = win.querySelector(':scope > .fp-icons'); if (old) old.remove();
  const strip = document.createElement('div'); strip.className = 'fp-icons';
  const g = win.querySelector('.panel-group');
  const active = (g && g.dataset.active) || win.dataset.panel;
  for (const id of panelIdsOf(win)) {
    const ib = document.createElement('button'); ib.type = 'button'; ib.dataset.fpIcon = id; ib.title = titleOf(id);
    ib.classList.toggle('on', id === active);
    ib.appendChild(panelIconNode(id));
    strip.appendChild(ib);
  }
  win.appendChild(strip);
  wireIconStrip(win, strip);
  return strip;
}
function wireIconStrip(win, strip) {
  let down = null;
  strip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const onIcon = e.target.closest && e.target.closest('button[data-fp-icon]');
    down = { x: e.clientX, y: e.clientY, l: win.offsetLeft, t: win.offsetTop, moved: false, id: onIcon ? onIcon.dataset.fpIcon : null };
    win.style.zIndex = ++floatZ;
    const mv = ev => {
      if (!down) return;
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < 4) return;
      down.moved = true;
      win.classList.add('fp-dragging');
      win.style.left = Math.max(0, Math.min(innerWidth - 40, down.l + dx)) + 'px';
      win.style.top = Math.max(0, Math.min(innerHeight - 40, down.t + dy)) + 'px';
      const at = dropAt(ev.clientX, ev.clientY);                             
      showDropHint(at && down.id ? { ...at, iconId: down.id } : at);
    };
    const up = ev => {
      document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true);
      const d = down; down = null;
      win.classList.remove('fp-dragging');
      showDropHint(null);
      if (!d) return;
      if (!d.moved) {                                                        
        const ib = ev.target.closest && ev.target.closest('button[data-fp-icon]');
        if (ib && strip.contains(ib)) expand(win, ib.dataset.fpIcon);
        return;
      }
      const at = dropAt(ev.clientX, ev.clientY);
      if (at) dockInto(d.id ? { ...at, iconId: d.id } : at, win);             
    };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true);
  });
}
function iconify(win) {
  if (win.classList.contains('iconified')) return;
  win.__fpSize = { w: win.style.width, h: win.style.height };
  renderFloatIcons(win);
  win.classList.add('iconified');
  win.style.width = ''; win.style.height = '';
  emit();
}
function expand(win, id) {
  const strip = win.querySelector(':scope > .fp-icons'); if (strip) strip.remove();
  win.classList.remove('iconified');
  if (win.__fpSize) { win.style.width = win.__fpSize.w; win.style.height = win.__fpSize.h; }
  const g = win.querySelector('.panel-group');
  if (g && id) activate(g, id);
  
  const r = win.getBoundingClientRect();
  if (r.right > innerWidth) win.style.left = Math.max(0, innerWidth - r.width - 4) + 'px';
  if (r.bottom > innerHeight) win.style.top = Math.max(0, innerHeight - r.height - 4) + 'px';
  emit();
}


function initGrip(win, grip) {
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const w0 = win.offsetWidth, h0 = win.offsetHeight, x = e.clientX, y = e.clientY;
    const mv = ev => {
      win.style.width = Math.max(200, Math.min(innerWidth - 40, w0 + ev.clientX - x)) + 'px';
      win.style.height = Math.max(panelMinHeight(win, 120), Math.min(innerHeight - 60, h0 + ev.clientY - y)) + 'px';
    };
    const up = () => { document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true);
  });
}
function activate(g, id) {
  for (const b of g.querySelectorAll('.pg-tabs button[data-panel]')) b.classList.toggle('on', b.dataset.panel === id);
  for (const s of g.querySelectorAll(':scope > .pg-body > .panel')) s.hidden = s.dataset.panel !== id;
  g.dataset.active = id;
  emit();
}
function syncAll() {
  if (!colEl) return;
  
  const groups = [...colEl.querySelectorAll('.panel-group')];
  for (const g of groups) {
    const vis = [...g.querySelectorAll('.pg-tabs button[data-panel]')].filter(b => !b.hidden);
    g.hidden = vis.length === 0;
    if (!g.hidden && !vis.some(b => b.classList.contains('on'))) activate(g, vis[0].dataset.panel);
  }
  
  const kids = [...colEl.children];
  let seenGroup = false, pendingSp = null;
  for (const el of kids) {
    if (el.classList.contains('pg-splitter')) {
      el.hidden = true;
      if (seenGroup && !pendingSp) pendingSp = el;
      continue;
    }
    if (el.classList.contains('panel-group') && !el.hidden) {
      if (pendingSp) { pendingSp.hidden = false; pendingSp = null; }
      seenGroup = true;
    }
  }
  
  let last = null; for (const g of groups) if (!g.hidden) last = g;
  for (const g of groups) g.classList.toggle('grow', g === last);
  

  const anyTab = [...colEl.querySelectorAll('.pg-tabs > button[data-panel]')].some(b => !b.hidden);
  const empty = !anyTab;
  if (empty !== !!colEl.classList.contains('col-empty')) {
    const w = panelColWidth();
    colEl.classList.toggle('col-empty', empty);
    if (empty) relayoutSide(-w);
    else if (colCollapsed()) setColWidthOf(colEl, COL_ICONS_W);
    else setPanelColWidth(colEl.__colW || SIDE_WIDTH_DEFAULT, { persist: false });   
  }
  if (!empty) colEl.__colW = panelColWidth() || colEl.__colW;
  if (colCollapsed()) renderColIcons();
  emit();
}


export function tabOf(id) { return colEl ? colEl.querySelector(`.pg-tabs button[data-panel="${id}"]`) : null; }
export function sectionOf(id) { return document.querySelector(`.panel[data-panel="${id}"]`); }
export function isVisible(id) {   
  const b = tabOf(id);
  if (b) {
    const g = b.closest('.panel-group');
    if (b.hidden || g.hidden || sideEl.classList.contains('hidden-all')) return false;
    if (colCollapsed()) return popShowing(id);
    return b.classList.contains('on') && !g.classList.contains('collapsed');
  }
  const d = dockBtn(id);
  if (d) return !d.hidden && (dockExpandedCol(dockColOf(d)) || popShowing(id));
  const f = floats.get(id);
  return !!f && !f.classList.contains('iconified');
}


export function isOpen(id) {
  const b = tabOf(id); if (b) return !b.hidden && !b.closest('.panel-group').hidden;
  const d = dockBtn(id); if (d) return !d.hidden;
  return floats.has(id);
}

const dockBtn = id => (sideEl ? sideEl.querySelector(`.icon-dock > button[data-panel="${id}"]`) : null);
const popShowing = id => !!(dockPop && dockPop.dataset.panel === id);
export function show(id) {
  const b = tabOf(id);
  if (b) {
    b.hidden = false; const g = b.closest('.panel-group'); g.hidden = false; g.classList.remove('collapsed'); activate(g, id);
    sideEl.classList.remove('hidden-all'); saveLayout(); syncAll();
    if (colCollapsed()) { const ib = colIconsEl && colIconsEl.querySelector(`button[data-panel="${id}"]`); if (ib) openDockPanel(ib); }
    return true;
  }
  const d = dockBtn(id);
  if (d) { d.hidden = false; const c = dockColOf(d); if (dockExpandedCol(c)) renderDockBody(c); else openDockPanel(d); saveLayout(); emit(); return true; }
  if (sectionOf(id)) { openFloat(id); return true; }
  return false;
}
export function hide(id) {
  const b = tabOf(id);
  if (b) { if (popShowing(id)) closeDockPanel(); b.hidden = true; b.classList.remove('on'); saveLayout(); syncAll(); return true; }
  const d = dockBtn(id);
  if (d) {
    if (popShowing(id)) closeDockPanel();
    d.hidden = true;
    const c = dockColOf(d);
    if (dockExpandedCol(c)) renderDockBody(c);
    pruneDockCols();                                                        
    saveLayout(); emit(); return true;
  }
  if (floats.has(id)) { closeFloat(id); return true; }
  return false;
}


export function toggle(id) { return !isOpen(id) || !isVisible(id) ? show(id) : hide(id); }
export function exists(id) { return !!(tabOf(id) || dockBtn(id) || sectionOf(id)); }


const floats = new Map();
let floatZ = 50;


function openFloat(id) {
  if (floats.has(id)) {
    const f = floats.get(id); f.style.zIndex = ++floatZ;
    if (f.classList.contains('iconified')) expand(f, id);
    else { const g = f.querySelector('.panel-group'); if (g) activate(g, id); }
    return;
  }
  if (!sectionOf(id)) return;
  const tab = document.createElement('button'); tab.type = 'button'; tab.dataset.panel = id; tab.textContent = titleOf(id);
  const n = floats.size;
  floatPanel(tab, Math.max(60, innerWidth * 0.35) + n * 24 + 20, 120 + n * 24 + 12);
  emit();
}
function closeFloat(id, winArg) {
  const win = winArg || floats.get(id); if (!win) return;
  for (const sec of win.querySelectorAll('.panel')) { sec.hidden = true; $('#panelStore').appendChild(sec); }
  for (const [k, v] of floats) if (v === win) floats.delete(k);
  win.remove(); emit();
}




const GROUP_MIN_H = 96;
function panelMinHeight(el, fallback) { return Math.max(fallback, parseFloat(getComputedStyle(el).minHeight) || 0); }
function initSplitter(sp) {
  let drag = null;
  sp.addEventListener('pointerdown', e => {
    const prev = prevGroup(sp); if (!prev) return;
    drag = { y: e.clientY, h: prev.getBoundingClientRect().height, prev };
    sp.classList.add('dragging'); try { sp.setPointerCapture(e.pointerId); } catch {}
  });
  sp.addEventListener('pointermove', e => {
    if (!drag) return;
    const total = colEl.getBoundingClientRect().height;
    const h = Math.max(panelMinHeight(drag.prev, GROUP_MIN_H), Math.min(total - 120, drag.h + (e.clientY - drag.y)));
    drag.prev.style.height = Math.round(h) + 'px'; drag.prev.style.flex = '0 0 auto';
  });
  const end = () => { if (drag) { drag = null; sp.classList.remove('dragging'); saveLayout(); } };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
}
function prevGroup(sp) { let p = sp.previousElementSibling; while (p && (p.hidden || !p.classList.contains('panel-group'))) p = p.previousElementSibling; return p; }




const maxSideWidth = () => Math.max(Math.floor(innerWidth * .75), dockTotalWidth() + 2 + PANEL_COL_MIN);
export function setSideWidth(width, opts = {}) {
  const min = opts.min != null ? opts.min : 240;
  




  const next = Math.max(min, Math.min(maxSideWidth(), Math.round(width)));
  $('.app').style.setProperty('--right-w', next + 'px');
  if (opts.persist !== false) try { localStorage.setItem(SIDE_WIDTH_KEY, String(next)); } catch {}
  if (dockPop) placeDockPop();
}






function setColWidthOf(el, want, opts = {}) {
  if (!el || !sideEl) return;
  const w = Math.max(0, Math.round(want));
  setSideWidth(sideWidth() + (w - Math.round(el.getBoundingClientRect().width)), { min: 0, persist: false });
  if (opts.persist !== false) try { localStorage.setItem(SIDE_WIDTH_KEY, String(w)); } catch {}
}





export function setPanelColWidth(w, opts = {}) {
  const want = Math.max(PANEL_COL_MIN, Math.round(w));
  if (colEl && !colEl.classList.contains('col-empty')) setColWidthOf(colEl, want, opts);
  else if (opts.persist !== false) try { localStorage.setItem(SIDE_WIDTH_KEY, String(want)); } catch {}
  if (colEl) colEl.__colW = want;                                           
}



function keepPanelMin() {
  if (!sideEl || !colEl || colCollapsed() || colEl.classList.contains('col-empty')) return;
  if (sideEl.classList.contains('hidden-all')) return;
  const w = panelColWidth();
  if (w && w < PANEL_COL_MIN) setColWidthOf(colEl, PANEL_COL_MIN, { persist: false });
}
function savedPanelWidth() { try { const v = +localStorage.getItem(SIDE_WIDTH_KEY); return Number.isFinite(v) && v >= PANEL_COL_MIN ? v : 0; } catch { return 0; } }




function initSideResize() {
  const el = $('#sideResize'); if (!el) return;
  let dragX = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (colCollapsed() || colEl.classList.contains('col-empty')) return;      
    e.preventDefault();
    dragX = e.clientX; el.classList.add('dragging');
    const mv = ev => {
      if (dragX == null) return;
      setPanelColWidth(panelColWidth() + dragX - ev.clientX);                 
      dragX = ev.clientX;
    };
    const up = () => {
      dragX = null; el.classList.remove('dragging');
      document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true);
      saveLayout();
    };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true);
  });
  el.addEventListener('dblclick', () => { if (!colCollapsed()) setPanelColWidth(SIDE_WIDTH_DEFAULT); });
}


let dockPop = null;


function setDockWidth(px, persist, col) {
  col = col || dockEl; if (!col) return;
  const exp = !!col.__expanded;
  
  const w = exp ? Math.max(PANEL_COL_MIN, Math.min(520, Math.round(px))) : Math.max(DOCK_WIDTH_MIN, Math.min(DOCK_WIDTH_MAX, Math.round(px)));
  col.style.width = w + 'px';
  col.classList.toggle('wide', !exp && w >= DOCK_WIDE_AT);                 
  if (exp) col.__expandedW = w;
  else if (persist && col === dockEl) try { localStorage.setItem(DOCK_WIDTH_KEY, String(w)); } catch {}
  if (dockPop && dockPop.__col === col) placeDockPop();
}

function ensureDockHead(col) {
  if (!col) return null;
  let dh = col.querySelector(':scope > .dock-head');
  if (dh) return dh;
  dh = document.createElement('div'); dh.className = 'dock-head';
  const tb = document.createElement('button'); tb.type = 'button'; tb.className = 'col-toggle';
  tb.addEventListener('click', e => { e.stopPropagation(); col.__expanded ? collapseDockCol(col) : expandDockCol(col); });
  dh.appendChild(tb); col.prepend(dh);
  return dh;
}


function newDockCol(ref, silent) {
  if (!sideEl) return null;
  const c = document.createElement('div'); c.className = 'icon-dock';
  ensureDockHead(c);
  const anchor = (ref && ref.parentElement === sideEl) ? ref
    : ($('#sideResize') && $('#sideResize').parentElement === sideEl ? $('#sideResize') : null);
  if (anchor) sideEl.insertBefore(c, anchor); else sideEl.appendChild(c);
  setDockWidth(DOCK_WIDTH_MIN, false, c);
  initDockResize(c);
  syncColHead();
  if (!silent) relayoutSide(dockWidthOf(c));
  return c;
}

function pruneDockCols() {
  let gone = 0;
  for (const c of dockCols()) {
    if (dockBtnsOf(c).length) continue;
    const w = dockWidthOf(c);
    clearDockBody(c);
    c.classList.remove('expanded'); c.__expanded = false;
    if (dockPop && dockPop.__col === c) closeDockPanel();
    c.remove(); gone += w;
  }
  if (gone) relayoutSide(-gone);
  return gone;
}


function initDockResize(col) {
  const h = document.createElement('div'); h.className = 'dock-resize'; h.title = '拖拽调整图标列宽度（双击复位）';
  col.appendChild(h);
  h.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = dockWidthOf(col);
    h.classList.add('dragging');
    const mv = ev => {
      const before = dockWidthOf(col);
      setDockWidth(w0 + (x0 - ev.clientX), false, col);
      relayoutSide(dockWidthOf(col) - before);
    };
    const up = () => {
      h.classList.remove('dragging');
      document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true);
      setDockWidth(dockWidthOf(col), true, col); saveLayout();
    };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true);
  });
  h.addEventListener('dblclick', () => {
    const before = dockWidthOf(col);
    setDockWidth(DOCK_WIDTH_MIN, true, col);
    relayoutSide(dockWidthOf(col) - before);
    saveLayout();
  });
}

function addDockButton(id, ref, col) {
  col = (col && col.isConnected) ? col : (dockColOf(ref) || dockCols()[0]);
  if (!col) return null;
  let b = col.querySelector(`:scope > button[data-panel="${id}"]`);
  if (!b) {
    b = document.createElement('button'); b.type = 'button'; b.dataset.panel = id; b.title = titleOf(id);
    b.appendChild(panelIconNode(id));
  }
  b.hidden = false;
  const tab = tabOf(id); if (tab) tab.remove();
  const sec = sectionOf(id);
  if (sec && !(dockPop && dockPop.contains(sec)) && sec.parentElement && sec.parentElement.id !== 'panelStore') { sec.hidden = true; $('#panelStore').appendChild(sec); }
  if (ref && ref.parentElement === col && ref !== b) col.insertBefore(b, ref);
  else if (!ref) col.insertBefore(b, col.querySelector(':scope > .dock-body, :scope > .dock-resize'));
  if (col.__expanded) renderDockBody(col);
  return b;
}


let startDockDrag = () => {};
function initDockDrag() {
  let swallowUntil = 0;
  sideEl.addEventListener('click', e => {                                   
    if (Date.now() >= swallowUntil) return;
    if (!e.target.closest('.icon-dock button[data-panel], .col-icons button[data-panel]')) return;
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);
  sideEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const b = e.target.closest('button[data-panel]'); if (!b) return;
    if (!dockColOf(b) && !(colIconsEl && colIconsEl.contains(b))) return;
    startDockDrag(e, b);
  });
  startDockDrag = (e, b) => {
    const id = b.dataset.panel, sx = e.clientX, sy = e.clientY;
    const col0 = dockColOf(b) || colIconsEl;                                  
    let mode = null, win = null, drop = null;
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!mode) {
        if (Math.hypot(dx, dy) < 5) return;
        mode = 'sort'; b.classList.add('dock-dragging');
        if (b.classList.contains('open')) closeDockPanel();
      }
      if (mode === 'sort') {
        const d = col0.getBoundingClientRect();
        


        const safe = ev.clientX >= d.left + DOCK_EDGE_IN && ev.clientX <= d.right + 24;
        if (safe) {
          if (col0 === colIconsEl) {                                          
            reorderInColIcons(id, ev.clientY);
            const nb = colIconsEl.querySelector(`button[data-panel="${id}"]`);
            if (nb && nb !== b) { b.classList.remove('dock-dragging'); b = nb; b.classList.add('dock-dragging'); }
            return;
          }
          const others = dockBtnsOf(col0).filter(x => x !== b);
          let ref = null;
          const rectOf = x => (col0.__expanded && x.__dockGroup && x.__dockGroup.isConnected ? x.__dockGroup : x).getBoundingClientRect();
          for (const o of others) { const r = rectOf(o); if (ev.clientY < r.top + r.height / 2) { ref = o; break; } }
          if (ref) { if (ref !== b.nextElementSibling) col0.insertBefore(b, ref); }
          else col0.insertBefore(b, col0.querySelector(':scope > .dock-body, :scope > .dock-resize'));
          if (col0.__expanded && col0.__body && b.__dockGroup) col0.__body.insertBefore(b.__dockGroup, (ref && ref.__dockGroup) || null);
          return;
        }
        mode = 'float';                                                       
        b.classList.remove('dock-dragging');
        const tab = document.createElement('button'); tab.type = 'button'; tab.dataset.panel = id; tab.textContent = titleOf(id);
        if (col0 === colIconsEl) { const real = tabOf(id); if (real) real.remove(); }   
        b.remove();
        win = floatPanel(tab, ev.clientX, ev.clientY);
        if (b.__dockGroup) { b.__dockGroup.remove(); b.__dockGroup = null; }
        if (col0 === colIconsEl) renderColIcons(); else pruneDockCols();       
      }
      if (mode === 'float' && win) {
        win.classList.add('fp-dragging');
        win.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - 20)) + 'px';
        win.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - 12)) + 'px';
        drop = dropAt(ev.clientX, ev.clientY); showDropHint(drop);
      }
    };
    const up = ev => {
      document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true);
      showDropHint(null);
      b.classList.remove('dock-dragging');
      if (mode) swallowUntil = Date.now() + 350;
      if (win) win.classList.remove('fp-dragging');
      if (mode === 'float' && win && win.isConnected) { const at = dropAt(ev.clientX, ev.clientY); if (at) dockInto(at, win); }
      if (mode) { saveLayout(); emit(); }
    };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  };
}


function reorderInColIcons(id, y) {
  const src = tabOf(id); if (!src) return;
  let refIcon = null;
  for (const o of colIconsEl.querySelectorAll('button[data-panel]')) {
    if (o.dataset.panel === id) continue;
    const r = o.getBoundingClientRect();
    if (y < r.top + r.height / 2) { refIcon = o; break; }
  }
  const dst = refIcon ? tabOf(refIcon.dataset.panel) : null;
  if (dst && dst.parentElement) dst.parentElement.insertBefore(src, dst);
  else { const last = lastDockTarget(); if (last) { const lt = last.querySelector('.pg-tabs'); lt.insertBefore(src, lt.querySelector(':scope > .grow')); } }
  renderColIcons();
}
function initDock() {
  if (!sideEl) return;
  if (dockEl) initDockResize(dockEl);
  initDockDrag();
  sideEl.addEventListener('click', e => {                                    
    const b = e.target.closest('button[data-panel]');
    if (!b || !(dockColOf(b) || (colIconsEl && colIconsEl.contains(b)))) return;
    if (b.classList.contains('open')) closeDockPanel(); else openDockPanel(b);
  });
  document.addEventListener('pointerdown', e => { if (dockPop && !dockPop.contains(e.target) && !e.target.closest('.icon-dock, .col-icons')) closeDockPanel(); }, true);
}





let colHeadEl = null, colIconsEl = null, colPrevWidth = 0;
const COL_ICONS_W = 36;
const colCollapsed = () => !!(sideEl && sideEl.classList.contains('col-collapsed'));




const COL_TOGGLE_PX = 10;
function colToggleGlyph(b) {
  b.textContent = '';
  b.appendChild(chromeIcon(b.classList.contains('expand') ? 'chevron-double-left' : 'chevron-double-right', COL_TOGGLE_PX));
}
function initColCollapse() {
  colHeadEl = document.createElement('div'); colHeadEl.className = 'col-head';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'col-toggle';
  btn.addEventListener('click', e => { e.stopPropagation(); colCollapsed() ? expandCol() : collapseCol(); });
  colHeadEl.appendChild(btn);
  colIconsEl = document.createElement('div'); colIconsEl.className = 'col-icons';
  colEl.prepend(colHeadEl, colIconsEl);
  for (const c of dockCols()) ensureDockHead(c);                              
  syncColHead();
}





let dockExpandedW = 260;
const dockExpandedCol = c => !!(c && c.__expanded);
export function expandDockCol(col) {
  if (!col || col.__expanded) return;
  closeDockPanel();
  const w0 = dockWidthOf(col);
  col.__collapsedW = w0;
  col.__expanded = true;
  col.classList.add('expanded');
  setDockWidth(col.__expandedW || dockExpandedW, false, col);
  relayoutSide(dockWidthOf(col) - w0);
  renderDockBody(col);
  syncColHead();
  saveLayout(); emit();
}
export function collapseDockCol(col) {
  if (!col || !col.__expanded) return;
  const wE = dockWidthOf(col);
  clearDockBody(col);
  col.__expanded = false;
  col.classList.remove('expanded');
  setDockWidth(col.__collapsedW || DOCK_WIDTH_MIN, true, col);
  relayoutSide(dockWidthOf(col) - wE);
  syncColHead();
  saveLayout(); emit();
}
export function expandDock(opts = {}) { expandDockCol(opts.col || dockEl); }
export function collapseDock(opts = {}) { collapseDockCol(opts.col || dockEl); }
function clearDockBody(col) {
  const body = col && col.__body; if (!body) return;
  for (const sec of body.querySelectorAll('.panel')) { sec.hidden = true; $('#panelStore').appendChild(sec); }
  body.remove(); col.__body = null;
}
function renderDockBody(col) {
  if (!col || !col.__expanded) return;
  clearDockBody(col);
  const wrap = document.createElement('div'); wrap.className = 'dock-body'; col.__body = wrap;
  for (const b of col.querySelectorAll(':scope > button[data-panel]')) {
    if (b.hidden) continue;
    const id = b.dataset.panel, sec = sectionOf(id); if (!sec) continue;
    const g = document.createElement('div'); g.className = 'dock-group'; g.dataset.panel = id;
    const head = document.createElement('div'); head.className = 'pg-tabs';
    const t = document.createElement('button'); t.type = 'button'; t.className = 'on dg-title'; t.textContent = titleOf(id); t.title = '按住拖动可移出 / 调整位置';
    const grow = document.createElement('span'); grow.className = 'grow';
    const m = document.createElement('button'); m.type = 'button'; m.className = 'pg-menu'; m.title = '面板菜单'; m.appendChild(chromeIcon('panel-menu', 13));
    m.addEventListener('click', e => { e.stopPropagation(); openPanelMenu(null, m, id); });
    head.append(t, grow, m);
    const body = document.createElement('div'); body.className = 'pg-body';
    sec.hidden = false; body.appendChild(sec);
    g.append(head, body);
    b.__dockGroup = g;
    


    head.addEventListener('dblclick', e => {
      if (e.target.closest('.pg-menu')) return;
      g.classList.toggle('collapsed'); saveLayout(); syncAll();
    });
    
    t.addEventListener('pointerdown', e => { if (e.button === 0) startDockDrag(e, b); });
    wrap.appendChild(g);
  }
  col.insertBefore(wrap, col.querySelector(':scope > .dock-resize'));
}
function syncColHead() {
  if (colHeadEl) {
    const b = colHeadEl.querySelector('.col-toggle');
    b.title = colCollapsed() ? '展开面板' : '折叠为图标';
    b.classList.toggle('expand', colCollapsed());
    colToggleGlyph(b);
  }
  for (const c of dockCols()) {                                              
    const db = c.querySelector(':scope > .dock-head > .col-toggle'); if (!db) continue;
    db.title = c.__expanded ? '折叠为图标' : '展开面板';
    db.classList.toggle('expand', !c.__expanded);
    colToggleGlyph(db);
  }
}
function renderColIcons() {
  if (!colIconsEl) return;
  const openId = dockPop && dockPop.__btn && colIconsEl.contains(dockPop.__btn) ? dockPop.dataset.panel : null;
  colIconsEl.textContent = '';
  let first = true;
  for (const g of colEl.querySelectorAll(':scope > .panel-group')) {
    if (g.hidden) continue;
    const tabs = [...g.querySelectorAll('.pg-tabs > button[data-panel]')].filter(b => !b.hidden);
    if (!tabs.length) continue;
    if (!first) { const sep = document.createElement('div'); sep.className = 'ci-sep'; colIconsEl.appendChild(sep); }
    first = false;
    for (const t of tabs) {
      const id = t.dataset.panel;
      const ib = document.createElement('button'); ib.type = 'button'; ib.dataset.panel = id; ib.title = titleOf(id);
      ib.appendChild(panelIconNode(id));
      if (id === openId) { ib.classList.add('open'); dockPop.__btn = ib; }
      colIconsEl.appendChild(ib);
    }
  }
}
export function collapseCol(opts = {}) {
  if (!sideEl || colCollapsed()) return;
  closeDockPanel();
  colPrevWidth = panelColWidth() || colPrevWidth;                           
  sideEl.classList.add('col-collapsed');
  renderColIcons();
  setColWidthOf(colEl, COL_ICONS_W);                                        
  syncColHead();
  if (opts.save !== false) saveLayout();
  emit();
}
export function expandCol(opts = {}) {
  if (!sideEl || !colCollapsed()) return;
  closeDockPanel();
  sideEl.classList.remove('col-collapsed');
  

  setPanelColWidth(colPrevWidth || savedPanelWidth() || SIDE_WIDTH_DEFAULT);
  colEl.classList.remove('col-empty');
  syncColHead();
  if (opts.save !== false) saveLayout();
  emit();
}
function openDockPanel(b) {
  closeDockPanel();
  const id = b.dataset.panel; const sec = sectionOf(id); if (!sec) return;
  b.classList.add('open');
  dockPop = document.createElement('div'); dockPop.className = 'dock-pop'; dockPop.dataset.panel = id;
  dockPop.__home = sec.parentElement; dockPop.__wasHidden = sec.hidden;     
  dockPop.__col = dockColOf(b) || (colIconsEl && colIconsEl.contains(b) ? colEl : dockEl);
  const head = document.createElement('div'); head.className = 'pg-tabs';
  const t = document.createElement('button'); t.type = 'button'; t.className = 'on'; t.textContent = titleOf(id); head.appendChild(t);
  

  const grow = document.createElement('span'); grow.className = 'grow'; head.appendChild(grow);
  const m = document.createElement('button'); m.type = 'button'; m.className = 'pg-menu'; m.title = '面板菜单'; m.appendChild(chromeIcon('panel-menu', 13)); head.appendChild(m);
  m.addEventListener('click', e => { e.stopPropagation(); openPanelMenu(null, m, id); });
  

  t.title = '按住拖出 = 变成浮动面板';
  t.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ctl = null;
    

    const mv = ev => {
      if (!ctl) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        const win = tearOutDockPop(ev.clientX, ev.clientY);
        if (!win) return;
        ctl = beginWinDrag(win, { x: 20, y: 12 });                           
      }
      ctl.move(ev.clientX, ev.clientY);
    };
    const up = ev => {
      document.removeEventListener('pointermove', mv, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', can, true);
      if (ctl) ctl.end(ev.clientX, ev.clientY); else showDropHint(null);
    };
    const can = () => {
      document.removeEventListener('pointermove', mv, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', can, true);
      showDropHint(null);
    };
    document.addEventListener('pointermove', mv, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', can, true);
  });
  dockPop.appendChild(head);
  const body = document.createElement('div'); body.className = 'pg-body'; dockPop.appendChild(body);
  sec.hidden = false; sec.dataset.home = sec.parentElement === body ? '' : 'hidden-store';
  body.appendChild(sec);
  
  const grip = document.createElement('div'); grip.className = 'dp-grip'; grip.title = '拖动改变大小';
  dockPop.appendChild(grip);
  if (dockPopSize) { dockPop.style.width = dockPopSize.w + 'px'; dockPop.style.height = dockPopSize.h + 'px'; dockPop.style.maxHeight = 'none'; }
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, w0 = dockPop.offsetWidth, h0 = dockPop.offsetHeight;
    const mv = ev => {
      const w = Math.max(200, Math.min(innerWidth - 80, w0 + (x0 - ev.clientX)));
      const hh = Math.max(panelMinHeight(dockPop, 120), Math.min(innerHeight - 60, h0 + (ev.clientY - y0)));
      dockPop.style.width = w + 'px'; dockPop.style.height = hh + 'px'; dockPop.style.maxHeight = 'none';
      dockPopSize = { w, h: hh };
    };
    const up = () => { document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true);
  });
  sideEl.appendChild(dockPop);
  dockPop.__btn = b;
  placeDockPop();
  emit();
}






function tearOutDockPop(px, py) {
  if (!dockPop) return null;
  const id = dockPop.dataset.panel;
  const btn = dockPop.__btn;
  const fromIcons = !!(btn && colIconsEl && colIconsEl.contains(btn));
  const real = tabOf(id);
  const tab = real || document.createElement('button');
  if (!real) { tab.type = 'button'; tab.dataset.panel = id; tab.textContent = titleOf(id); }
  const sec = dockPop.querySelector('.panel');
  dockPop.remove(); dockPop = null;
  if (btn) btn.classList.remove('open');
  

  if (!real && btn && btn.isConnected) {
    const g = btn.__dockGroup;
    btn.remove();
    if (g) { g.remove(); btn.__dockGroup = null; }
  }
  if (sec) { sec.hidden = true; $('#panelStore').appendChild(sec); }        
  const win = floatPanel(tab, px, py);                                     
  if (fromIcons) renderColIcons(); else pruneDockCols();                    
  saveLayout(); emit();
  return win;
}
let dockPopSize = null;
function placeDockPop() {
  const b = dockPop && dockPop.__btn; if (!b) return;
  const r = b.getBoundingClientRect(), sr = sideEl.getBoundingClientRect();
  const col = (dockPop.__col && dockPop.__col.isConnected) ? dockPop.__col : b;   
  const dr = col.getBoundingClientRect();
  
  const h = dockPop.offsetHeight || 0;
  dockPop.style.top = Math.max(0, Math.min(r.top - sr.top, sr.height - h)) + 'px';
  dockPop.style.right = (sr.right - dr.left + 2) + 'px';
}
function closeDockPanel() {
  if (!dockPop) return;
  const sec = dockPop.querySelector('.panel');
  const home = dockPop.__home;
  if (sec) {
    if (home && home.isConnected && home.classList.contains('pg-body') && colEl.contains(home)) { home.appendChild(sec); sec.hidden = !!dockPop.__wasHidden; }
    else { sec.hidden = true; $('#panelStore').appendChild(sec); }
  }
  dockPop.remove(); dockPop = null;
  for (const b of document.querySelectorAll('.icon-dock button.open, .col-icons button.open')) b.classList.remove('open');
  emit();
}




export function setPanelMenu(id, fn) { menuFns.set(id, fn); for (const w of floats.values()) syncFloatMenu(w); }

export function panelMenuItems(id) { const fn = menuFns.get(id); return fn ? fn() : null; }

let panelMenuFilter = null;
export function setPanelMenuFilter(fn) { panelMenuFilter = fn; }
function openPanelMenu(g, btn, forcedId) {
  const id = forcedId || (g && g.dataset.active);
  let items = (menuFns.get(id) || (() => []))();
  if (panelMenuFilter) { try { items = panelMenuFilter(id, items) || items; } catch {} }
  const base = [
    ...(items.length ? [...items, { sep: true }] : []),
    { label: '关闭', run: () => hide(id) },
    { label: '关闭选项卡组', run: () => { if (g) for (const b of g.querySelectorAll('.pg-tabs button[data-panel]')) hide(b.dataset.panel); else hide(id); } },
  ];
  showPopupMenu(base, btn.getBoundingClientRect());
}


function buildPopupRows(pop, items, level) {
  let openSub = null;
  for (const item of items) {
    if (item.sep) { const s = document.createElement('div'); s.className = 'menu-sep'; pop.appendChild(s); continue; }
    const row = document.createElement('div'); row.className = 'menu-item' + (item.disabled ? ' disabled' : '') + (item.checked ? ' checked checkable' : '');
    const mark = document.createElement('span'); mark.className = 'menu-mark';
    if (item.checked) mark.appendChild(uiIcon('check', 12));
    const label = document.createElement('span'); label.className = 'menu-label';
    const shortcut = document.createElement('span'); shortcut.className = 'menu-sc';
    row.append(mark, label, shortcut);
    label.textContent = item.label;
    if (item.sc) shortcut.textContent = item.sc;
    if (item.color) row.style.background = item.color;
    if (item.why) row.title = item.why;   
    if (item.sub) {
      const arr = document.createElement('span'); arr.className = 'menu-arrow'; arr.appendChild(uiIcon('chevron-right', 8)); row.appendChild(arr);
      row.addEventListener('pointerenter', () => {
        if (openSub) { openSub.remove(); openSub = null; }
        if (item.disabled) return;
        const sp = document.createElement('div'); sp.className = `menu-pop level-${level + 1} panel-menu-sub`;
        buildPopupRows(sp, item.sub, level + 1);
        pop.appendChild(sp); openSub = sp;
        const r = row.getBoundingClientRect();
        let l = r.right - 2; if (l + sp.offsetWidth > innerWidth - 4) l = Math.max(4, r.left - sp.offsetWidth + 2);
        let t = r.top - 4; if (t + sp.offsetHeight > innerHeight - 4) t = Math.max(4, innerHeight - 4 - sp.offsetHeight);
        sp.style.left = l + 'px'; sp.style.top = t + 'px';
      });
      row.addEventListener('click', e => e.stopPropagation());
    } else {
      row.addEventListener('pointerenter', () => { if (openSub) { openSub.remove(); openSub = null; } });
      row.addEventListener('click', e => { e.stopPropagation(); if (item.disabled) return; closePopup(); item.run && item.run(); });
    }
    pop.appendChild(row);
  }
}
export function showPopupMenu(items, anchor) {
  closePopup();
  const pop = document.createElement('div'); pop.className = 'menu-pop level-0 panel-menu';
  buildPopupRows(pop, items, 0);
  document.body.appendChild(pop);
  popupEl = pop;
  let left = anchor.right - pop.offsetWidth, top = anchor.bottom + 2;
  if (anchor.alignLeft) left = Math.min(anchor.left, innerWidth - pop.offsetWidth - 4);   
  if (left < 4) left = 4; if (top + pop.offsetHeight > innerHeight - 4) top = Math.max(4, anchor.top - pop.offsetHeight - 2);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  setTimeout(() => document.addEventListener('pointerdown', onDocDown, true), 0);
  return pop;
}
let popupEl = null;
function onDocDown(e) { if (popupEl && !popupEl.contains(e.target)) closePopup(); }
export function closePopup() { for (const p of document.querySelectorAll('.menu-pop.panel-menu')) p.remove(); popupEl = null; document.removeEventListener('pointerdown', onDocDown, true); }
export const popup = showPopupMenu;


function saveLayout() {
  try {
    const out = {};
    for (const g of colEl.querySelectorAll('.panel-group')) {
      out[g.dataset.group] = { collapsed: g.classList.contains('collapsed'), active: g.dataset.active, height: g.style.height || '',
        order: [...g.querySelectorAll('.pg-tabs button[data-panel]')].map(b => b.dataset.panel),
        hidden: [...g.querySelectorAll('.pg-tabs button[data-panel]')].filter(b => b.hidden).map(b => b.dataset.panel) };
    }
    

    const seenDockIds = new Set();            
    out.__docks = dockCols().map(c => {
      const btns = [...c.querySelectorAll(':scope > button[data-panel]')].filter(b => {
        if (seenDockIds.has(b.dataset.panel)) return false;
        seenDockIds.add(b.dataset.panel); return true;
      });
      return { w: dockWidthOf(c), expanded: !!c.__expanded, expandedW: c.__expandedW || 0,
        items: btns.map(b => b.dataset.panel), hidden: btns.filter(b => b.hidden).map(b => b.dataset.panel) };
    });
    out.__colCollapsed = colCollapsed();
    

    out.__floats = [...document.querySelectorAll('.float-panel')].flatMap(w => panelIdsOf(w));
    out.__dockExpandedW = dockExpandedW;
    if (colPrevWidth) out.__colPrevWidth = colPrevWidth;
    if (colEl.__colW) out.__colW = colEl.__colW;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
  } catch {}
}




function ensureTab(tabsEl, pid) {
  if (!PANEL_TITLES[pid] || !sectionOf(pid)) return null;
  let b = tabsEl.querySelector(`:scope > button[data-panel="${pid}"]`);
  if (b) { if (!b.textContent) b.textContent = titleOf(pid); return b; }
  const src = dockBtn(pid);
  if (src) { const gp = src.__dockGroup; src.remove(); if (gp) gp.remove(); src.__dockGroup = null; }
  b = document.createElement('button'); b.type = 'button'; b.dataset.panel = pid; b.textContent = titleOf(pid);
  return b;
}
function restoreLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY); if (!raw) return;
    const st = JSON.parse(raw);
    if (dockEl) {                                                            
      const saved = Array.isArray(st.__docks) ? st.__docks
        : (Array.isArray(st.__dock) ? [{ w: DOCK_WIDTH_MIN, expanded: !!st.__dockExpanded, items: st.__dock, hidden: st.__dockHidden || [] }] : null);
      if (saved) {
        const cols = dockCols();
        while (cols.length < saved.length) cols.push(newDockCol(null, true));
        



        const loose = new Map();
        for (const c of dockCols()) for (const b of [...c.querySelectorAll(':scope > button[data-panel]')]) {
          const gp = b.__dockGroup; if (gp) gp.remove(); b.__dockGroup = null;
          if (!loose.has(b.dataset.panel)) loose.set(b.dataset.panel, b);
          b.remove();
        }
        const placed = new Set();
        const put = (pid, c) => {
          if (!PANEL_TITLES[pid] || !sectionOf(pid) || placed.has(pid)) return;
          const b = loose.get(pid);
          if (b) { loose.delete(pid); b.hidden = false; c.insertBefore(b, c.querySelector(':scope > .dock-body, :scope > .dock-resize')); }
          else addDockButton(pid, null, c);
          placed.add(pid);
        };
        for (let i = 0; i < saved.length; i++) {
          const c = cols[i], s = saved[i] || {};
          if (s.w) setDockWidth(s.w, false, c);
          if (s.expandedW) c.__expandedW = +s.expandedW || 0;
          for (const pid of s.items || []) put(pid, c);
          for (const pid of s.hidden || []) { const b = c.querySelector(`:scope > button[data-panel="${pid}"]`); if (b) b.hidden = true; }
        }
        

        for (const pid of [...loose.keys()]) put(pid, cols[0] || dockCols()[0]);
        
        const anchor = $('#sideResize') && $('#sideResize').parentElement === sideEl ? $('#sideResize') : null;
        if (anchor) for (const c of cols) sideEl.insertBefore(c, anchor);
        for (const c of dockCols().slice(saved.length)) { clearDockBody(c); c.remove(); }   
        pruneDockCols();
      }
    }
    




    const inFloats = new Set(Array.isArray(st.__floats) ? st.__floats : []);
    let tookIcon = false;
    for (const id of inFloats) {
      const t = tabOf(id); if (t) t.remove();
      const d = dockBtn(id);
      if (d) { const gp = d.__dockGroup; d.remove(); if (gp) gp.remove(); d.__dockGroup = null; tookIcon = true; }
    }
    if (tookIcon) pruneDockCols();

    if (st.__colPrevWidth) colPrevWidth = +st.__colPrevWidth || 0;
    if (st.__colW) colEl.__colW = +st.__colW || 0;
    if (st.__dockExpandedW) dockExpandedW = +st.__dockExpandedW || dockExpandedW;
    const expand = (st.__docks || []).filter(d => d && d.expanded).length;
    if (st.__colCollapsed || expand || st.__dockExpanded) queueMicrotask(() => {
      syncAll();
      const saved = Array.isArray(st.__docks) ? st.__docks : null;
      const cols = dockCols();
      if (saved) { for (let i = 0; i < saved.length; i++) if (saved[i] && saved[i].expanded) expandDockCol(cols[i]); }
      else if (st.__dockExpanded) expandDock({ save: false });
      if (st.__colCollapsed) collapseCol({ save: false });
    });
    for (const g of colEl.querySelectorAll('.panel-group')) {
      const s = st[g.dataset.group]; if (!s) continue;
      g.classList.toggle('collapsed', !!s.collapsed);
      if (s.height) { g.style.height = s.height; g.style.flex = '0 0 auto'; }
      if (Array.isArray(s.order)) {                                          
        const t = g.querySelector('.pg-tabs'), body = g.querySelector('.pg-body'), ref = t.querySelector(':scope > .grow');
        for (const pid of s.order) {
          if (inFloats.has(pid)) continue;                                   
          const b = ensureTab(t, pid); if (!b) continue;
          t.insertBefore(b, ref);
          const sec = sectionOf(pid); if (sec && body && sec.parentElement !== body) { sec.hidden = false; body.appendChild(sec); }
        }
      }
      for (const b of g.querySelectorAll('.pg-tabs button[data-panel]')) b.hidden = (s.hidden || []).includes(b.dataset.panel);
      if (s.active && tabOf(s.active) && !tabOf(s.active).hidden) activate(g, s.active);
    }
    pruneDockCols();                                                          
    


    for (const id of inFloats) if (PANEL_TITLES[id] && sectionOf(id) && !floats.has(id)) openFloat(id);
  } catch {}
}
export function resetLayout() {
  try { localStorage.removeItem(LAYOUT_KEY); localStorage.removeItem(SIDE_WIDTH_KEY); localStorage.removeItem(DOCK_WIDTH_KEY); } catch {}
  closeDockPanel();
  for (const c of dockCols()) collapseDockCol(c);                            
  dockExpandedW = 260;
  for (const win of new Set(floats.values())) closeFloat(null, win);
  for (const win of document.querySelectorAll('.float-panel')) closeFloat(null, win);
  if (colCollapsed()) { sideEl.classList.remove('col-collapsed'); syncColHead(); }
  colPrevWidth = 0;
  colEl.__colW = 0; colEl.classList.remove('col-empty');
  for (const c of dockCols()) if (c !== dockEl) { clearDockBody(c); c.remove(); }   
  if (dockEl) { pruneDockCols(); if (!dockEl.isConnected) sideEl.insertBefore(dockEl, $('#sideResize')); }
  syncColHead();
  if (homeSnap) {
    const store = $('#panelStore');
    
    const keep = new Set(homeSnap.colKids);
    for (const el of [...colEl.children]) {
      if ((el.classList.contains('panel-group') || el.classList.contains('pg-splitter')) && !keep.has(el)) {
        for (const sec of el.querySelectorAll('.panel')) { sec.hidden = true; store.appendChild(sec); }
        el.remove();
      }
    }
    for (const el of homeSnap.colKids) colEl.appendChild(el);
    
    const homeBtns = new Set([...homeSnap.groups.flatMap(x => x.tabs), ...homeSnap.dock]);
    for (const b of document.querySelectorAll('.pg-tabs > button[data-panel], .icon-dock > button[data-panel]')) if (!homeBtns.has(b)) b.remove();
    for (const { g, tabs, body } of homeSnap.groups) {
      const t = g.querySelector('.pg-tabs'), grow = t.querySelector(':scope > .grow');
      for (const b of tabs) { t.insertBefore(b, grow); b.hidden = false; b.classList.remove('reordering'); const sec = sectionOf(b.dataset.panel); if (sec) body.appendChild(sec); }
      g.classList.remove('collapsed', 'drop-target'); g.style.height = ''; g.style.flex = '';
      g.hidden = false; activate(g, tabs[0].dataset.panel);
    }
    
    if (dockEl) {
      const ref = dockEl.querySelector(':scope > .dock-resize');
      for (const b of homeSnap.dock) { b.hidden = false; b.classList.remove('open', 'dock-dragging'); b.__dockGroup = null; dockEl.insertBefore(b, ref); const sec = sectionOf(b.dataset.panel); if (sec) { sec.hidden = true; store.appendChild(sec); } }
    }
  } else {
    for (const g of colEl.querySelectorAll('.panel-group')) { g.classList.remove('collapsed'); g.style.height = ''; g.style.flex = ''; for (const b of g.querySelectorAll('.pg-tabs button[data-panel]')) b.hidden = false; const f = g.querySelector('.pg-tabs button[data-panel]'); if (f) activate(g, f.dataset.panel); }
  }
  setDockWidth(DOCK_WIDTH_MIN, true, dockEl);
  dockPopSize = null;
  setSideWidth(SIDE_WIDTH_DEFAULT);
  try { localStorage.removeItem(SIDE_WIDTH_KEY); } catch {}                
  $('.app').style.removeProperty('--right-w');
  sideEl.classList.remove('hidden-all'); syncAll(); emit();
}
export function list() { return Object.keys(PANEL_TITLES).filter(exists); }





export function captureLayout() {
  saveLayout();
  let layout = null, side = null, dock = null;
  try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); side = localStorage.getItem(SIDE_WIDTH_KEY); dock = localStorage.getItem(DOCK_WIDTH_KEY); } catch {}
  return { layout, side: side ? +side : 0, dock: dock ? +dock : 0 };
}
export function applyLayout(ws) {
  resetLayout();
  if (!ws || !ws.layout) { emit(); return; }
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(ws.layout));
    if (ws.dock) localStorage.setItem(DOCK_WIDTH_KEY, String(ws.dock));
  } catch {}
  restoreLayout();
  syncAll();
  if (ws.side && !colCollapsed()) setPanelColWidth(ws.side);
  saveLayout();
  emit();
}

export function homeGroups() { return homeSnap ? homeSnap.groups.map(x => ({ group: x.g.dataset.group, tabs: x.tabs.map(b => b.dataset.panel) })) : []; }

let locked = false;
export function setLocked(v) { locked = !!v; document.documentElement.classList.toggle('ws-locked', locked); }
export function isLocked() { return locked; }
if (typeof document !== 'undefined') {
  const DRAG_SEL = '.pg-tabs > button[data-panel], .pg-tabs > .dg-title, .icon-dock > button[data-panel], .col-icons button[data-panel], .float-panel .pg-tabs, .fp-grip, .fp-icons, .pg-splitter, .dock-resize, #sideResize';
  document.addEventListener('pointerdown', e => {
    if (!locked || !e.target || !e.target.closest) return;
    const hit = e.target.closest(DRAG_SEL); if (!hit) return;
    
    const x0 = e.clientX, y0 = e.clientY;
    const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) { ev.stopImmediatePropagation(); ev.preventDefault(); } };
    const up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    if (hit.matches('.pg-splitter, .dock-resize, #sideResize')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

export const panels = { setPanelIcon, captureLayout, applyLayout, homeGroups, setLocked, isLocked, setPanelMenuFilter, init, show, hide, toggle, isOpen, isVisible, exists, titleOf, sectionOf, setPanelMenu, panelMenuItems, popup, resetLayout, setSideWidth, setPanelColWidth, collapseCol, expandCol, expandDock, collapseDock, expandDockCol, collapseDockCol, onChange, list, PANEL_TITLES };
export default panels;







export function showGrouped(id, mates = []) {
  const t0 = tabOf(id);
  if (t0 && t0.hidden && !isOpen(id)) {                                     
    const g = t0.closest('.panel-group');
    for (const m of mates) { const tm = tabOf(m); if (tm && tm.hidden && tm.closest('.panel-group') === g) tm.hidden = false; }
    return show(id);
  }
  if (!colEl || isOpen(id) || t0 || dockBtn(id) || !sectionOf(id)) return show(id);
  for (const m of mates) {
    const t = tabOf(m);
    if (t && !t.hidden && !t.closest('.panel-group').hidden) {
      const g = t.closest('.panel-group'), tabsEl = g.querySelector('.pg-tabs'), body = g.querySelector('.pg-body');
      const b = ensureTab(tabsEl, id); if (!b) return show(id);
      const order = [id, ...mates];
      const after = order.indexOf(m) < order.indexOf(id);
      tabsEl.insertBefore(b, after ? t.nextSibling : t);
      const sec = sectionOf(id); if (sec) { sec.hidden = false; body.appendChild(sec); }
      b.hidden = false;
      return show(id);
    }
  }
  const members = [id, ...mates.filter(m => !isOpen(m) && !tabOf(m) && !dockBtn(m) && sectionOf(m))];
  const order = [id, ...mates];
  members.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const ng = document.createElement('div'); ng.className = 'panel-group'; ng.dataset.group = 'float-' + members[0];
  const t = document.createElement('div'); t.className = 'pg-tabs';
  const grow = document.createElement('span'); grow.className = 'grow';
  const menu = document.createElement('button'); menu.type = 'button'; menu.className = 'pg-menu'; menu.title = '面板菜单';
  menu.appendChild(chromeIcon('panel-menu', 13));
  const body = document.createElement('div'); body.className = 'pg-body';
  ng.append(t, body); t.append(grow, menu);
  const sp = document.createElement('div'); sp.className = 'pg-splitter';
  const ref = lastDockTarget();
  if (ref) { colEl.insertBefore(ng, ref); colEl.insertBefore(sp, ref); } else colEl.append(sp, ng);
  initSplitter(sp);
  for (const pid of members) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.panel = pid; b.textContent = titleOf(pid);
    t.insertBefore(b, grow);
    const sec = sectionOf(pid); if (sec) { sec.hidden = false; body.appendChild(sec); }
  }
  ng.style.height = '330px'; ng.style.flex = '0 0 auto';
  initGroup(ng);
  menu.addEventListener('click', e => { e.stopPropagation(); openPanelMenu(ng, menu); });
  activate(ng, id);
  sideEl.classList.remove('hidden-all');
  syncAll(); saveLayout();
  if (colCollapsed()) { const ib = colIconsEl && colIconsEl.querySelector(`button[data-panel="${id}"]`); if (ib) openDockPanel(ib); }
  emit();
  return true;
}
panels.showGrouped = showGrouped;
