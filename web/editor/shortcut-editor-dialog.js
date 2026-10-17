





import { actions } from './actions.js';
import { shortcuts, IS_MAC } from './shortcuts.js';
import { tools, TOOL_GROUPS } from './tools.js';
import { MENUS } from './menu.js';
import { panels } from './panels.js';
import { preferences } from './preferences.js';
import { store, defaults, defaultOpts, snapDefaults, DEFAULT_NAME, clone, emptySet, saveStore, defaultSpecs, same, panelActionId, ensurePanelAction, menuStyle, COLOR_OPTS, COLOR_CSS, optsOf, applyOne, revert,
  applySet, activeSet, activeName, setNames, useSet, exportActive, importInto, specFromEvent } from './shortcut-editor.js';


function appRows() {
  const rows = [];
  const walk = (items, trail, depth) => {
    for (const x of items) {
      if (x.sep || x.disabled) continue;
      if (x.sub) { rows.push({ head: true, label: x.label, depth, path: [...trail, x.label] }); walk(x.sub, [...trail, x.label], depth + 1); continue; }
      if (!x.action) continue;
      rows.push({ kind: 'app', id: x.action, label: x.label, depth, path: [...trail, x.label] });
    }
  };
  for (const m of MENUS) { rows.push({ head: true, top: true, label: m.label, depth: 0, path: [m.label] }); walk(m.items, [m.label], 1); }
  
  const inMenu = new Set(rows.filter(r => r.id).map(r => r.id));
  const extra = [...(defaults ? defaults.keys() : [])].filter(a => !inMenu.has(a) && !/^tool\.key\./.test(a) && !/^panelMenu:/.test(a));
  if (extra.length) {
    rows.push({ head: true, top: true, label: '其它命令（不在菜单中）', depth: 0, path: ['其它'] });
    for (const a of extra) rows.push({ kind: 'app', id: a, label: EXTRA_LABELS[a] || a, depth: 1, path: ['其它', EXTRA_LABELS[a] || a] });
  }
  return rows;
}
const EXTRA_LABELS = {
  'tool.swapColors': '切换前景色和背景色', 'tool.defaultColors': '默认前景色和背景色', 'tool.quickMask': '切换标准 / 快速蒙版模式',
  'brush.smaller': '减小画笔大小', 'brush.larger': '增大画笔大小', 'brush.softer': '减小画笔硬度', 'brush.harder': '增大画笔硬度',
  'brush.airbrush': '切换画笔喷枪模式', 'layer.selectUp': '选择上一个图层', 'layer.selectDown': '选择下一个图层',
  'layer.selectTop': '选择顶部图层', 'layer.selectBottom': '选择底部图层', 'edit.fillBackground': '用背景色填充', 'edit.fillForeground': '用前景色填充',
  'view.screenModeCycle': '切换屏幕模式', 'view.screenModeCyclePrev': '反向切换屏幕模式', 'window.togglePanels': '显示 / 隐藏全部面板', 'window.toggleSidePanels': '显示 / 隐藏面板（保留工具栏）',
  'channel.composite': '复合通道', 'channel.0': '红 / 第 1 通道', 'channel.1': '绿 / 第 2 通道', 'channel.2': '蓝 / 第 3 通道', 'channel.3': '第 4 通道',
};
function panelRows() {
  const rows = [];
  for (const pid of panels.list()) {
    const items = (() => { try { return panels.panelMenuItems(pid) || []; } catch { return []; } })().filter(x => x && !x.sep && x.label);
    if (!items.length) continue;
    rows.push({ head: true, top: true, label: panels.titleOf(pid), depth: 0, path: [panels.titleOf(pid)] });
    for (const it of items) rows.push({ kind: 'panel', id: pid + '|' + it.label, label: it.label, depth: 1, path: [panels.titleOf(pid), it.label] });
  }
  return rows;
}
function toolRows() {
  const rows = [];
  for (const g of TOOL_GROUPS) for (const t of g.tools) rows.push({ kind: 'tool', id: t.id, label: t.label, depth: 0, path: ['工具', t.label] });
  return rows;
}


let dlgStyle = false;
function ensureStyle() {
  if (dlgStyle) return; dlgStyle = true;
  const s = document.createElement('style');
  s.textContent = `
  dialog.fp-dlg.fp-kbd { width: min(940px, 96vw); max-width: none; height: min(640px, 90vh); padding: 0; }
  .fp-kbd .kb-wrap { display: grid; grid-template-rows: auto auto 1fr auto; height: 100%; }
  .fp-kbd .kb-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--ps-line); padding: 8px 12px 0; }
  .fp-kbd .kb-tabs button { border-radius: 3px 3px 0 0; border-bottom: 0; }
  .fp-kbd .kb-tabs button.on { background: var(--ps-active, #4a4a4a); }
  .fp-kbd .kb-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 12px; }
  .fp-kbd .kb-main { display: grid; grid-template-columns: 1fr 150px; min-height: 0; }
  .fp-kbd .kb-list { overflow: auto; border: 1px solid var(--ps-line-2); margin: 0 0 0 12px; background: var(--ps-input, #1e1e1e); }
  .fp-kbd .kb-side { display: flex; flex-direction: column; gap: 6px; padding: 0 12px; }
  .fp-kbd .kb-row { display: grid; grid-template-columns: minmax(200px, 1fr) 260px; align-items: center; min-height: 22px; padding: 0 6px; }
  .fp-kbd .kb-row.m { grid-template-columns: minmax(200px, 1fr) 60px 110px; }
  .fp-kbd .kb-row.head { font-weight: 600; color: var(--ps-muted); }
  .fp-kbd .kb-row.sel { background: var(--ps-sel, #4f4f4f); }
  .fp-kbd .kb-row.conflict .kb-sc { color: #ff7a6a; }
  .fp-kbd .kb-sc { display: flex; gap: 6px; flex-wrap: wrap; }
  .fp-kbd .kb-sc button.kbc { min-width: 60px; height: 20px; padding: 0 6px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: inherit; text-align: left; cursor: text; }
  .fp-kbd .kb-sc button.edit { border-color: var(--ps-accent, #2d8ceb); background: #000; }
  .fp-kbd .kb-sc button.mod { color: #ffd76a; }
  .fp-kbd .kb-msg { padding: 6px 12px; min-height: 34px; font-size: 12px; color: var(--ps-muted); }
  .fp-kbd .kb-msg.warn { color: #ffb36a; }
  .fp-kbd .kb-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px 12px; }
  `;
  document.head.appendChild(s);
}
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = mk('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let host = null;



export function openShortcutEditorDialog(page = 'keys') {
  if (!defaults) snapDefaults();
  ensureStyle();
  if (host) { try { host.close(); } catch {} host.remove(); }
  const W = clone(activeSet());                                  
  let workName = store.active && store.sets[store.active] ? store.active : null;
  const M = clone(preferences.get('menus') || { hidden: {}, colors: {} }); M.hidden = M.hidden || {}; M.colors = M.colors || {};
  let tab = page === 'menus' ? 'menus' : 'keys', kind = 'app', menuKind = 'app', filter = '', selId = null, editing = null, pending = null, dirty = false;
  const d = mk('dialog', { className: 'fp-dlg fp-kbd' }); host = d;
  const wrap = mk('div', { className: 'kb-wrap' }); d.append(wrap);
  const tabs = mk('div', { className: 'kb-tabs' }), top = mk('div', { className: 'kb-top' });
  const main = mk('div', { className: 'kb-main' }), list = mk('div', { className: 'kb-list' }), side = mk('div', { className: 'kb-side' });
  const msg = mk('div', { className: 'kb-msg' }), foot = mk('div', { className: 'kb-foot' });
  main.append(list, side);
  const below = mk('div'); below.append(msg, foot);
  wrap.append(tabs, top, main, below);

  
  const specsOf = r => {
    if (r.kind === 'tool') { const k = Object.prototype.hasOwnProperty.call(W.tools, r.id) ? W.tools[r.id] : tools.defaultKeyOf(r.id); return k ? [k] : []; }
    const bag = r.kind === 'panel' ? W.panel : W.app;
    if (Object.prototype.hasOwnProperty.call(bag, r.id)) return bag[r.id].slice();
    return r.kind === 'panel' ? [] : defaultSpecs(r.id);
  };
  const setSpecs = (r, arr) => {
    if (r.kind === 'tool') { const k = arr[0] || ''; if (k === tools.defaultKeyOf(r.id)) delete W.tools[r.id]; else W.tools[r.id] = k; }
    else {
      const bag = r.kind === 'panel' ? W.panel : W.app;
      const def = r.kind === 'panel' ? [] : defaultSpecs(r.id);
      if (arr.length === def.length && arr.every((s, i) => same(s, def[i]))) delete bag[r.id]; else bag[r.id] = arr;
    }
    dirty = true;
  };
  const isModified = r => r.kind === 'tool' ? Object.prototype.hasOwnProperty.call(W.tools, r.id) : Object.prototype.hasOwnProperty.call(r.kind === 'panel' ? W.panel : W.app, r.id);
  const allRows = () => [...appRows(), ...panelRows(), ...toolRows()].filter(r => !r.head);
  const labelOf = r => r.path.join(' › ');
  
  function owner(spec, self) {
    if (self.kind === 'tool') {
      
      for (const r of appRows()) if (!r.head && specsOf(r).some(s => same(s, spec))) return r;
      for (const [id, specs] of Object.entries(defaults ? Object.fromEntries(defaults) : {})) {
        if (/^tool\.key\./.test(id) || Object.prototype.hasOwnProperty.call(W.app, id)) continue;
        if (specs.some(s => same(s, spec))) return { kind: 'app', id, label: EXTRA_LABELS[id] || id, path: [EXTRA_LABELS[id] || id] };
      }
      return null;
    }
    for (const r of allRows()) {
      if (r.kind === self.kind && r.id === self.id) continue;
      if (r.kind === 'tool') { if (/^[A-Z]$/.test(spec) || /^Shift\+[A-Z]$/.test(spec)) { const L = spec.slice(-1); if (specsOf(r)[0] === L) return r; } continue; }
      if (specsOf(r).some(s => same(s, spec))) return r;
    }
    return null;
  }

  function renderTabs() {
    tabs.replaceChildren();
    for (const [id, l] of [['keys', '键盘快捷键'], ['menus', '菜单']]) {
      const b = mk('button', { type: 'button', textContent: l, className: tab === id ? 'on' : '' }); b.dataset.tab = id;
      b.onclick = () => { tab = id; editing = null; pending = null; render(); }; tabs.append(b);
    }
  }
  function renderTop() {
    top.replaceChildren();
    if (tab === 'keys') {
      const set = mk('select', { className: 'kb-set' });
      set.append(mk('option', { value: '', textContent: DEFAULT_NAME + (dirty && !workName ? '（已修改）' : '') }));
      for (const n of Object.keys(store.sets)) set.append(mk('option', { value: n, textContent: n + (dirty && workName === n ? '（已修改）' : '') }));
      set.value = workName || '';
      set.onchange = () => {
        if (dirty && !confirm('当前组的修改还没存储，放弃这些修改并切换吗？')) { set.value = workName || ''; return; }
        workName = set.value || null; const src = workName ? store.sets[workName] : emptySet();
        for (const k of ['app', 'panel', 'tools']) W[k] = clone(src[k] || {});
        dirty = false; render();
      };
      const save = mk('button', { type: 'button', textContent: '存储组', title: '把修改存进当前组' });
      save.onclick = () => { if (!workName) { saveAs(); return; } store.sets[workName] = clone(W); saveStore(); dirty = false; render(); say('已存储组「' + workName + '」'); };
      const saveAs = () => { const n = prompt('存储为新组，组名：', workName ? workName + ' 副本' : '我的快捷键'); if (!n) return; store.sets[n] = clone(W); workName = n; saveStore(); dirty = false; render(); say('已存储为新组「' + n + '」'); };
      const sa = mk('button', { type: 'button', textContent: '存储为新组…' }); sa.onclick = saveAs;
      const del = mk('button', { type: 'button', textContent: '删除组', disabled: !workName });
      del.onclick = () => { if (!workName || !confirm('删除组「' + workName + '」？')) return; delete store.sets[workName]; if (store.active === workName) store.active = null; workName = null; for (const k of ['app', 'panel', 'tools']) W[k] = {}; saveStore(); dirty = true; render(); };
      const kindSel = mk('select', { className: 'kb-kind' });
      for (const [v, l] of [['app', '应用程序菜单'], ['panel', '面板菜单'], ['tool', '工具']]) kindSel.append(mk('option', { value: v, textContent: l }));
      kindSel.value = kind; kindSel.onchange = () => { kind = kindSel.value; selId = null; editing = null; pending = null; render(); };
      top.append(mk('span', { textContent: '组：' }), set, save, sa, del, mk('span', { textContent: '　快捷键用于：' }), kindSel);
    } else {
      const kindSel = mk('select', { className: 'kb-kind' });
      for (const [v, l] of [['app', '应用程序菜单'], ['panel', '面板菜单']]) kindSel.append(mk('option', { value: v, textContent: l }));
      kindSel.value = menuKind; kindSel.onchange = () => { menuKind = kindSel.value; render(); };
      top.append(mk('span', { textContent: '菜单类型：' }), kindSel);
    }
    const q = mk('input', { type: 'search', placeholder: '搜索命令或快捷键', value: filter, className: 'kb-search', style: 'margin-left:auto;width:200px' });
    q.oninput = () => { filter = q.value.trim(); renderList(); };
    top.append(q);
  }
  const match = r => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return labelOf(r).toLowerCase().includes(f) || specsOf(r).some(s => shortcuts.format(s).toLowerCase().includes(f) || s.toLowerCase().includes(f));
  };
  function rowsForView() {
    const src = tab === 'keys' ? (kind === 'app' ? appRows() : kind === 'panel' ? panelRows() : toolRows()) : (menuKind === 'app' ? appRows() : panelRows());
    if (!filter) return src;
    const keep = new Set(); const out = [];
    src.forEach((r, i) => { if (!r.head && match(r)) { keep.add(i); for (let j = i - 1; j >= 0; j--) if (src[j].head && src[j].depth < r.depth) { keep.add(j); if (src[j].top) break; } } });
    src.forEach((r, i) => { if (keep.has(i)) out.push(r); });
    return out;
  }
  function renderList() {
    const st = list.scrollTop;
    list.replaceChildren();
    for (const r of rowsForView()) {
      const row = mk('div', { className: 'kb-row' + (tab === 'menus' ? ' m' : '') + (r.head ? ' head' : '') });
      const lab = mk('div', { textContent: r.label, style: `padding-left:${r.depth * 14}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis` });
      row.append(lab);
      if (r.head) { list.append(row); continue; }
      row.dataset.id = r.id; row.dataset.kind = r.kind;
      if (tab === 'keys') {
        if (selId === r.id) row.classList.add('sel');
        if (pending && pending.row.id === r.id && pending.conflict) row.classList.add('conflict');
        const sc = mk('div', { className: 'kb-sc' });
        const specs = specsOf(r);
        const cells = editing && editing.id === r.id && editing.index >= specs.length ? [...specs, ''] : specs;
        if (!cells.length) cells.push('');
        cells.forEach((s, i) => {
          const isEd = editing && editing.id === r.id && editing.index === i;
          const txt = isEd ? (pending ? fmt(r, pending.spec) : '按下新快捷键…') : (s ? fmt(r, s) : '');
          
          const c = mk('button', { type: 'button', textContent: txt || '\u00a0', className: 'kbc ' + (isEd ? 'edit' : '') + (isModified(r) ? ' mod' : '') });
          c.onclick = e => { e.stopPropagation(); selId = r.id; editing = { id: r.id, index: i, row: r }; pending = null; say(''); renderList(); };
          sc.append(c);
        });
        row.append(sc);
        row.onclick = () => { selId = r.id; editing = null; pending = null; renderList(); renderSide(); };
      } else {
        const hiddenKey = r.kind === 'panel' ? 'panel:' + r.id : r.id;
        const eye = mk('input', { type: 'checkbox', checked: !M.hidden[hiddenKey], title: '可见性' });
        eye.onchange = () => { if (eye.checked) delete M.hidden[hiddenKey]; else M.hidden[hiddenKey] = true; };
        const col = mk('select');
        for (const [v, l] of COLOR_OPTS) col.append(mk('option', { value: v, textContent: l }));
        col.value = M.colors[hiddenKey] || '';
        col.onchange = () => { if (col.value) M.colors[hiddenKey] = col.value; else delete M.colors[hiddenKey]; row.style.background = COLOR_CSS[col.value] || ''; };
        row.style.background = COLOR_CSS[M.colors[hiddenKey]] || '';
        row.append(eye, col);
      }
      list.append(row);
    }
    list.scrollTop = st;
    const ed = list.querySelector('.kb-sc button.edit'); if (ed) ed.focus();
  }
  const fmt = (r, s) => r.kind === 'tool' ? s : shortcuts.format(s);
  const say = (t, warn) => { msg.textContent = t || ''; msg.classList.toggle('warn', !!warn); msg.replaceChildren(document.createTextNode(t || '')); };
  function renderSide() {
    side.replaceChildren();
    if (tab !== 'keys') {
      const all = mk('button', { type: 'button', textContent: '全部显示' }); all.onclick = () => { M.hidden = {}; renderList(); };
      const nc = mk('button', { type: 'button', textContent: '清除全部颜色' }); nc.onclick = () => { M.colors = {}; renderList(); };
      side.append(all, nc, mk('div', { className: 'pf-note', style: 'font-size:11px;color:var(--ps-muted);line-height:1.6', textContent: '隐藏的菜单项不会出现在菜单里；菜单底部会多一条「显示全部菜单项目」。颜色需要首选项 › 界面「显示菜单颜色」开着。' }));
      return;
    }
    const sel = selId && [...(kind === 'app' ? appRows() : kind === 'panel' ? panelRows() : toolRows())].find(r => !r.head && r.id === selId);
    const b = (t, fn, dis) => { const x = mk('button', { type: 'button', textContent: t, disabled: !!dis }); x.onclick = fn; side.append(x); return x; };
    b('接受', () => accept(), !pending);
    b('还原', () => { pending = null; editing = null; say(''); renderList(); }, !pending && !editing);
    b('使用默认值', () => { if (!sel) return; setSpecs(sel, sel.kind === 'tool' ? [tools.defaultKeyOf(sel.id)] : sel.kind === 'panel' ? [] : defaultSpecs(sel.id)); editing = null; pending = null; renderTop(); renderList(); }, !sel);
    b('添加快捷键', () => { if (!sel) return; if (sel.kind === 'tool' && specsOf(sel).length) { say('工具只有一个字母快捷键：直接点它改'); return; } editing = { id: sel.id, index: specsOf(sel).length, row: sel }; pending = null; renderList(); }, !sel);
    b('删除快捷键', () => { if (!sel) return; const sp = specsOf(sel); const i = editing && editing.id === sel.id ? editing.index : sp.length - 1; if (i < 0 || i >= sp.length) return; sp.splice(i, 1); setSpecs(sel, sp); editing = null; pending = null; renderTop(); renderList(); }, !sel);
    side.append(mk('hr', { style: 'width:100%;border:0;border-top:1px solid var(--ps-line-2)' }));
    b('摘要…', () => summary());
    b('导出 .kys…', () => exportKys());
    const imp = b('导入 .kys…', () => { const f = mk('input', { type: 'file', accept: '.kys,.xml' }); f.onchange = async () => { const file = f.files[0]; if (!file) return; importKys(await file.text(), file.name); }; f.click(); });
    imp.title = 'PS 的快捷键组文件（XML）。对不上本编辑器命令的条目会被跳过并报数';
  }
  
  function onKey(e) {
    if (tab !== 'keys' || !editing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editing = null; pending = null; say(''); renderList(); renderSide(); return; }
    if (e.key === 'Enter' && pending) { e.preventDefault(); e.stopPropagation(); accept(); return; }
    if (e.key === 'Tab') return;
    const r = editing.row;
    let spec = specFromEvent(e); if (!spec) return;
    e.preventDefault(); e.stopPropagation();
    if (r.kind === 'tool') {
      if (!/^[A-Z]$/.test(spec)) { say('工具快捷键只能是单个字母 A–Z（不带修饰键；PS 同）', true); return; }
    } else if (r.kind === 'app' && /^(Shift\+)?[A-Z0-9]$/.test(spec) && !/^F\d/.test(spec)) {
      say('应用程序菜单的快捷键要带 ⌘ / Ctrl 或功能键（单个字母留给工具；PS 同）。仍可接受，但会盖掉同字母的工具键。', true);
    }
    const own = owner(spec, r);
    pending = { spec, row: r, conflict: own };
    if (own) say(`${fmt(r, spec)} 已经在使用，由「${labelOf(own)}」使用。如果接受，它将从该命令中删除。`, true);
    else say(`按「接受」（或 Enter）确认 ${fmt(r, spec)}`);
    renderList(); renderSide();
  }
  function accept() {
    if (!pending) return;
    const { spec, row: r, conflict } = pending;
    if (conflict) {
      if (conflict.kind === 'tool') setSpecs(conflict, ['']);
      else setSpecs(conflict, specsOf(conflict).filter(s => !same(s, spec)));
    }
    const sp = specsOf(r);
    if (r.kind === 'tool') sp.splice(0, sp.length, spec);
    else if (editing.index < sp.length) sp[editing.index] = spec; else sp.push(spec);
    setSpecs(r, sp);
    say(conflict ? `已把 ${fmt(r, spec)} 改给「${labelOf(r)}」，并从「${labelOf(conflict)}」上移除` : `已设置 ${fmt(r, spec)}`);
    pending = null; editing = null; renderTop(); renderList(); renderSide();
  }
  d.addEventListener('keydown', onKey, true);

  
  function summary() {
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const sect = (title, rows) => {
      let h = `<h2>${esc(title)}</h2><table><tr><th>命令</th><th>快捷键</th></tr>`;
      for (const r of rows) {
        if (r.head) { h += `<tr class="h"><td colspan="2">${esc(r.label)}</td></tr>`; continue; }
        const sp = specsOf(r); h += `<tr><td style="padding-left:${r.depth * 16 + 6}px">${esc(r.label)}</td><td class="sc">${sp.map(s => esc(fmt(r, s))).join('<br>') || '&nbsp;'}</td></tr>`;
      }
      return h + '</table>';
    };
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(workName || DEFAULT_NAME)} · 键盘快捷键</title>
<style>body{font:13px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%;max-width:820px;margin-bottom:24px}td,th{border:1px solid #ccc;padding:3px 6px;text-align:left}tr.h td{background:#e8e8e8;font-weight:600}td.sc{width:220px;font-family:ui-monospace,monospace}</style></head><body>
<h1>${esc(workName || DEFAULT_NAME)}</h1>${sect('应用程序菜单', appRows())}${sect('面板菜单', panelRows())}${sect('工具', toolRows())}</body></html>`;
    download((workName || DEFAULT_NAME) + '.htm', html, 'text/html');
    say('已导出摘要 HTML');
  }
  function exportKys() {
    const xml = buildKys(W, workName || DEFAULT_NAME, specsOf);
    download((workName || 'PSD Editor') + '.kys', xml, 'application/xml');
    say(`已导出 .kys（${KYS_COMMANDS.length} 条对照表内的命令 + 工具字母）`);
  }
  function importKys(text, fname) {
    const r = parseKys(text);
    if (!r) { say('读不出这个 .kys：不是 <photoshop-keyboard-shortcuts> XML', true); return; }
    for (const [a, specs] of Object.entries(r.app)) setSpecs({ kind: 'app', id: a }, specs);
    for (const [t, k] of Object.entries(r.tools)) setSpecs({ kind: 'tool', id: t }, [k]);
    say(`已从 ${fname} 读入 ${r.okCmd} 条命令、${r.okTool} 个工具；跳过 ${r.skipped} 条（本编辑器没有对应命令）。按「确定」生效，或「存储为新组」。`);
    renderTop(); renderList();
  }

  function render() { renderTabs(); renderTop(); renderList(); renderSide(); say(''); }
  const btn = (t, fn, cls = '') => { const b = mk('button', { type: 'button', textContent: t, className: cls }); b.onclick = fn; foot.append(b); return b; };
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; try { d.close(); } catch {} d.remove(); if (host === d) host = null; resolve(v); };
    btn('取消', () => finish(false));
    btn('确定', () => {
      
      const has = Object.keys(W.app).length || Object.keys(W.panel).length || Object.keys(W.tools).length;
      if (dirty || workName !== store.active) {
        if (!workName && has) { workName = DEFAULT_NAME + '（已修改）'; }
        if (workName) store.sets[workName] = clone(W);
        store.active = workName; saveStore(); applySet(activeSet());
      }
      preferences.set({ menus: { hidden: M.hidden, colors: M.colors } });
      finish(true);
    }, 'primary');
    d.addEventListener('cancel', e => { e.preventDefault(); if (editing) { editing = null; pending = null; renderList(); return; } finish(false); });
    document.body.appendChild(d);
    render();
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
  });
}



const KYS_COMMANDS = [
  [10, 'New...', 'file.new'], [20, 'Open...', 'file.open'], [21, 'Open As...', 'file.openAs'], [30, 'Save', 'file.save'], [31, 'Close', 'file.close'],
  [32, 'Save As...', 'file.saveAs'], [33, 'Save a Copy...', 'file.saveCopy'], [34, 'Revert', 'file.revert'], [37, 'Close All', 'file.closeAll'], [46, 'Close Others', 'file.closeOthers'],
  [101, 'Undo', 'edit.undo'], [103, 'Cut', 'edit.cut'], [104, 'Copy', 'edit.copy'], [105, 'Paste', 'edit.paste'], [132, 'Redo', 'edit.redo'], [133, 'Toggle Last State', 'edit.toggleLastState'],
  [177, 'Print One Copy', 'file.printOne'], [1002, 'Rulers', 'view.rulers'], [1004, 'Zoom In', 'view.zoomIn'], [1005, 'Zoom Out', 'view.zoomOut'],
  [1016, 'Deselect', 'select.none'], [1017, 'All', 'select.all'], [1018, 'Inverse', 'select.inverse'], [1019, 'Last Filter', 'filter.last'],
  [1025, 'Brush Settings', 'window.brushSettings'], [1030, 'Image Size...', 'image.size'], [1031, 'Canvas Size...', 'image.canvasSize'], [1036, 'Feather...', 'select.feather'],
  [1040, 'Paste Into', 'edit.pasteInto'], [1042, 'Fill...', 'edit.fill'], [1046, 'Color', 'window.color'], [1055, 'Info', 'window.info'], [1098, 'Layers', 'window.layers'],
  [1099, 'Layer...', 'layer.new'], [1105, 'Proof Colors', 'view.proofColors'], [1106, 'Gamut Warning', 'view.gamutWarning'], [1107, 'Copy Merged', 'edit.copyMerged'],
  [1114, 'Hide Layers', 'layer.hide'], [1115, 'Select and Mask...', 'select.selectAndMask'], [1137, 'File Info...', 'file.info'], [1139, 'Merge Visible', 'layer.mergeVisible'],
  [1154, 'Fade...', 'edit.fade'], [1166, 'Merge Down', 'layer.merge'], [1170, 'Actions', 'window.actions'], [1190, '100%', 'view.actualPixels'], [1192, 'Fit on Screen', 'view.fitOnScreen'],
  [1297, 'Paste in Place', 'edit.pasteInPlace'], [1520, 'Browse in Bridge...', 'file.browse'], [1695, 'Save for Web (Legacy)...', 'file.saveForWeb'], [1701, 'Invert', 'image.adjust.invert'],
  [1801, 'Levels...', 'image.adjust.levels'], [1802, 'Curves...', 'image.adjust.curves'], [1804, 'Color Balance...', 'image.adjust.colorBalance'], [1805, 'Hue/Saturation...', 'image.adjust.hueSaturation'],
  [1808, 'Auto Tone', 'image.autoTone'], [1809, 'Desaturate', 'image.adjust.desaturate'], [1810, 'Auto Contrast', 'image.autoContrast'], [1817, 'Auto Color', 'image.autoColor'],
  [1824, 'Black & White...', 'image.adjust.blackWhite'], [1943, 'Reselect', 'select.reselect'], [2101, 'Print...', 'file.print'], [2207, 'Free Transform', 'edit.freeTransform'],
  [2217, 'Again', 'edit.transformAgain'], [2220, 'Content-Aware Scale', 'edit.contentAwareScale'], [2311, 'General...', 'edit.preferences'], [2344, 'Color Settings...', 'edit.colorSettings'],
  [2711, 'Bring to Front', 'layer.bringToFront'], [2712, 'Bring Forward', 'layer.bringForward'], [2713, 'Send Backward', 'layer.sendBackward'], [2714, 'Send to Back', 'layer.sendToBack'],
  [2940, 'Lock Guides', 'view.lockGuides'], [2957, 'Lock Layers...', 'layer.lock'], [2958, 'Group Layers', 'layer.group'], [2959, 'Ungroup Layers', 'layer.ungroup'],
  [2962, 'All Layers', 'select.allLayers'], [2970, 'Layer Via Copy', 'layer.viaCopy'], [2971, 'Layer Via Cut', 'layer.viaCut'], [2972, 'Create Clipping Mask', 'layer.clippingMask'],
  [2982, 'Find Layers', 'select.findLayers'], [3443, 'Export As...', 'file.exportAs'], [3446, 'Quick Export as PNG', 'layer.quickExportPng'], [3447, 'Export As...', 'layer.exportAs'],
  [3500, 'Extras', 'view.extras'], [3502, 'Target Path', 'view.showTargetPath'], [3503, 'Guides', 'view.showGuides'], [3504, 'Grid', 'view.showGrid'], [3520, 'Snap', 'view.snap'],
  [5957, 'Search', 'edit.search'], [5980, 'Keyboard Shortcuts...', 'edit.keyboardShortcuts'], [5982, 'Menus...', 'edit.menus'],
  ['dynamic', 'Vanishing Point', 'filter.vanishingPoint'], ['dynamic', 'Liquify', 'filter.liquify'], ['dynamic', 'Lens Correction', 'filter.lensCorrection'],
  ['dynamic', 'Camera Raw Filter', 'filter.cameraRaw'], ['dynamic', 'Wide Angle Correction', 'filter.adaptiveWideAngle'],
];

const KYS_TOOLS = {
  move: ['Move Tool', 1819113074], artboard: ['Artboard Tool', 1098019924], marqueeRect: ['Rectangular Marquee Tool', 1919380852], marqueeEllipse: ['Elliptical Marquee Tool', 1701604724],
  marqueeRow: ['Single Row Marquee Tool', 1936878964], marqueeCol: ['Single Column Marquee Tool', 1935895924], selectionBrush: ['Selection Brush Tool', 1936482930], lasso: ['Lasso Tool', 1818325871],
  lassoPoly: ['Polygonal Lasso Tool', 1885826926], lassoMagnetic: ['Magnetic Lasso Tool', 1835819379], objectSelect: ['Object Selection Tool', 1835494497], quickSelect: ['Quick Selection Tool', 1902867308],
  magicWand: ['Magic Wand Tool', 2002873956], crop: ['Crop Tool', 1668444016], cropPerspective: ['Perspective Crop Tool', 1885565552], slice: ['Slice Tool', 1399612244], sliceSelect: ['Slice Select Tool', 1399608148],
  frame: ['Frame Tool', 1181773652], eyedropper: ['Eyedropper Tool', 1702454628], colorSampler: ['Color Sampler Tool', 1668246643], ruler: ['Ruler Tool', 1835360596], note: ['Note Tool', 1417180225],
  count: ['Count Tool', 1668248942], spotHeal: ['Spot Healing Brush Tool', 1936746562], remove: ['Remove Tool', 1667327604], healBrush: ['Healing Brush Tool', 1937010029], patch: ['Patch Tool', 1886675816],
  contentMove: ['Content-Aware Move Tool', 1919118704], redEye: ['Red Eye Tool', 1919182201], brush: ['Brush Tool', 1886286946], pencil: ['Pencil Tool', 1885695587], colorReplace: ['Color Replacement Tool', 1668440692],
  mixerBrush: ['Mixer Brush Tool', 2003137634], cloneStamp: ['Clone Stamp Tool', 1937006957], patternStamp: ['Pattern Stamp Tool', 1937010032], historyBrush: ['History Brush Tool', 1752396866],
  historyArtBrush: ['Art History Brush Tool', 1634230900], eraser: ['Eraser Tool', 1701994867], backgroundEraser: ['Background Eraser Tool', 1936028257], magicEraser: ['Magic Eraser Tool', 1835364961],
  gradient: ['Gradient Tool', 1651401812], paintBucket: ['Paint Bucket Tool', 1651860331], blur: ['Blur Tool', 1651275122], sharpen: ['Sharpen Tool', 1936220530], smudge: ['Smudge Tool', 1936553316],
  adjBrush: ['Adjustment Brush Tool', 1633970786], dodge: ['Dodge Tool', 1685021799], burn: ['Burn Tool', 1651864174], sponge: ['Sponge Tool', 1685283188], pen: ['Pen Tool', 1885695572],
  freeformPen: ['Freeform Pen Tool', 1836082542], curvaturePen: ['Curvature Pen Tool', 1668310382], addAnchor: ['Add Anchor Point Tool', 1634430580], deleteAnchor: ['Delete Anchor Point Tool', 1684762228],
  convertPoint: ['Convert Point Tool', 1667985012], typeH: ['Horizontal Type Tool', 1954038392], typeV: ['Vertical Type Tool', 1954038358], typeMaskV: ['Vertical Type Mask Tool', 1987344723],
  typeMaskH: ['Horizontal Type Mask Tool', 1954115667], pathSelect: ['Path Selection Tool', 1885565780], directSelect: ['Direct Selection Tool', 1886677089], rect: ['Rectangle Tool', 1382376308],
  ellipse: ['Ellipse Tool', 1164734579], triangle: ['Triangle Tool', 1416778600], polygon: ['Polygon Tool', 1349479545], line: ['Line Tool', 1818848852], customShape: ['Custom Shape Tool', 1131762536],
  hand: ['Hand Tool', 1751215716], rotateView: ['Rotate View Tool', 1919906932], zoom: ['Zoom Tool', 2054123373],
};

function kysKeyText(spec) {
  const ps = String(spec).split('+'), key = ps.pop();
  const out = [];
  if (ps.includes('Ctrl')) out.push(IS_MAC ? 'Ctrl' : 'Ctrl');
  if (ps.includes('Alt')) out.push(IS_MAC ? 'Opt' : 'Alt');
  if (ps.includes('Shift')) out.push('Shift');
  if (ps.includes('Mod')) out.push(IS_MAC ? 'Cmd' : 'Ctrl');
  const k = { '=': '+', Backspace: 'Backspace', Delete: 'Delete' }[key] || key;
  return [...out, k].join('+');
}
function kysParseKey(t) {
  const ps = String(t).trim().split('+').map(s => s.trim()).filter(Boolean);
  if (!ps.length) return null;
  let key = ps.pop(); if (key === '' && t.endsWith('+')) key = '=';
  const mods = new Set();
  for (const p of ps) {
    const u = p.toLowerCase();
    if (u === 'cmd' || u === 'command' || u === '⌘') mods.add('Mod');
    else if (u === 'ctrl' || u === 'control') mods.add(IS_MAC ? 'Ctrl' : 'Mod');
    else if (u === 'alt' || u === 'opt' || u === 'option') mods.add('Alt');
    else if (u === 'shift') mods.add('Shift');
  }
  if (key === '+') key = '=';
  key = key.length === 1 ? key.toUpperCase() : key;
  return [...['Ctrl', 'Alt', 'Shift', 'Mod'].filter(m => mods.has(m)), key].join('+');
}
export function buildKys(W, name, specsOf) {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const safe = String(name).replace(/\s+/g, '');
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n<photoshop-keyboard-shortcuts version="4" filename="$$$/FileName/Presets/KeyboardCustomization/${esc(safe)}=${esc(name)}" modified="0" multi-undo="1">\n`;
  for (const [id, en, action] of KYS_COMMANDS) {
    const specs = specsOf({ kind: 'app', id: action }); if (!specs.length) continue;
    const kindAttr = id === 'dynamic' ? 'dynamic' : 'static', idAttr = id === 'dynamic' ? '' : ` id="${id}"`;
    x += `\t<command kind="${kindAttr}"${idAttr} name="${esc(en)}">\n`;
    for (const s of specs) x += `\t\t<shortcut>${esc(kysKeyText(s))}</shortcut>\n`;
    x += '\t</command>\n';
  }
  for (const [tid, [en, key]] of Object.entries(KYS_TOOLS)) {
    const k = specsOf({ kind: 'tool', id: tid })[0]; if (!k) continue;
    x += `\t<tool name="${esc(en)}" type="1" key="${key}">${esc(k)}</tool>\n`;
  }
  return x + '</photoshop-keyboard-shortcuts>\n';
}
export function parseKys(text) {
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch { return null; }
  const root = doc && doc.documentElement;
  if (!root || root.nodeName !== 'photoshop-keyboard-shortcuts') return null;
  const byId = new Map(KYS_COMMANDS.filter(c => c[0] !== 'dynamic').map(c => [String(c[0]), c[2]]));
  const byName = new Map(KYS_COMMANDS.map(c => [c[1], c[2]]));
  const toolByKey = new Map(Object.entries(KYS_TOOLS).map(([id, [, k]]) => [String(k), id]));
  const toolByName = new Map(Object.entries(KYS_TOOLS).map(([id, [n]]) => [n, id]));
  const out = { app: {}, tools: {}, okCmd: 0, okTool: 0, skipped: 0 };
  for (const c of root.getElementsByTagName('command')) {
    const a = byId.get(c.getAttribute('id') || '') || byName.get(c.getAttribute('name') || '');
    if (!a) { out.skipped++; continue; }
    const specs = [...c.getElementsByTagName('shortcut')].map(s => kysParseKey(s.textContent)).filter(Boolean);
    out.app[a] = specs; out.okCmd++;
  }
  for (const t of root.getElementsByTagName('tool')) {
    const id = toolByKey.get(t.getAttribute('key') || '') || toolByName.get(t.getAttribute('name') || '');
    const k = (t.textContent || '').trim().toUpperCase();
    if (!id || !/^[A-Z]?$/.test(k)) { out.skipped++; continue; }
    out.tools[id] = k; out.okTool++;
  }
  out.skipped += root.getElementsByTagName('taskspace').length;
  return out;
}


