





import { shortcuts } from './shortcuts.js';
import { MENUS } from './menu.js';
import { TOOL_GROUPS, keyOfTool } from './tools.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };

const CSS = `
#scSheet { width: min(880px, 94vw); max-height: 86vh; padding: 0; }
#scSheet form { display: flex; flex-direction: column; max-height: 86vh; }
#scSheet .sc-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px 8px; }
#scSheet .sc-head h3 { margin: 0; font-size: 14px; flex: 1; }
#scSheet .sc-head input { width: 220px; }
#scSheet .sc-body { overflow: auto; padding: 4px 16px 12px; columns: 2 360px; column-gap: 28px; }
#scSheet .sc-grp { break-inside: avoid; margin: 0 0 12px; }
#scSheet .sc-grp h4 { margin: 6px 0 4px; font-size: 12px; color: var(--ps-muted, #9a9a9a); font-weight: 600; border-bottom: 1px solid var(--ps-line, #3a3a3a); padding-bottom: 3px; }
#scSheet .sc-row { display: flex; gap: 10px; font-size: 12px; line-height: 20px; }
#scSheet .sc-row .l { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#scSheet .sc-row kbd { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; background: #3a3a3c; border: 1px solid #4a4a4c; border-radius: 3px; padding: 0 5px; color: #e6e6e6; white-space: nowrap; }
#scSheet .sc-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 16px 12px; border-top: 1px solid var(--ps-line, #3a3a3a); font-size: 11px; color: var(--ps-muted, #9a9a9a); }
#scSheet .sc-empty { color: var(--ps-muted, #9a9a9a); font-size: 12px; padding: 12px 0; }
`;


export function shortcutGroups() {
  const tbl = shortcuts.table();
  const byAction = new Map();
  for (const t of tbl) { if (!byAction.has(t.action)) byAction.set(t.action, []); byAction.get(t.action).push(t.display); }
  const used = new Set();
  const groups = [];
  const toolRows = [];
  for (const g of TOOL_GROUPS) for (const t of g.tools || []) {
    const k = keyOfTool(t.id);
    if (k) toolRows.push({ label: t.label || t.id, keys: [k] });
  }
  if (toolRows.length) groups.push({ title: '工具（同组的工具按 ⇧ + 同一个键轮换）', rows: toolRows });
  for (const m of MENUS) {
    const rows = [];
    const walk = (items, trail) => {
      for (const x of items || []) {
        if (!x || x.sep) continue;
        if (x.sub) { walk(x.sub, [...trail, x.label]); continue; }
        if (!x.action || !byAction.has(x.action)) continue;
        used.add(x.action);
        rows.push({ label: [...trail, x.label].join(' › ').replace(/…$/, ''), keys: byAction.get(x.action) });
      }
    };
    walk(m.items, []);
    if (rows.length) groups.push({ title: m.label, rows });
  }
  const rest = [...byAction].filter(([a]) => !used.has(a));
  if (rest.length) groups.push({ title: '其它', rows: rest.map(([a, keys]) => ({ label: a, keys })) });
  return groups;
}

let dlg = null;
export function openShortcutSheet({ onEdit } = {}) {
  if (!document.getElementById('scSheetCss')) document.head.append(mk('style', { id: 'scSheetCss', textContent: CSS }));
  if (dlg) dlg.remove();
  dlg = mk('dialog', { id: 'scSheet' });
  const form = mk('form', { method: 'dialog' });
  const q = mk('input', { type: 'search', placeholder: '搜索命令或按键…', title: '按名称或按键筛选' });
  q.dataset.attr = 'sc-search';
  const body = mk('div', { className: 'sc-body' });
  const groups = shortcutGroups();
  const render = () => {
    const s = q.value.trim().toLowerCase();
    body.replaceChildren();
    let n = 0;
    for (const g of groups) {
      const rows = g.rows.filter(r => !s || r.label.toLowerCase().includes(s) || r.keys.some(k => k.toLowerCase().includes(s)));
      if (!rows.length) continue;
      const box = mk('div', { className: 'sc-grp' }, mk('h4', { textContent: g.title }));
      for (const r of rows) { box.append(mk('div', { className: 'sc-row' }, mk('span', { className: 'l', textContent: r.label, title: r.label }), ...r.keys.map(k => mk('kbd', { textContent: k })))); n++; }
      body.append(box);
    }
    if (!n) body.append(mk('div', { className: 'sc-empty', textContent: '没有匹配的快捷键' }));
  };
  q.addEventListener('input', render);
  q.addEventListener('keydown', e => e.stopPropagation());
  const edit = mk('button', { type: 'button', textContent: '自定义快捷键…' });
  edit.onclick = () => { dlg.close(); if (onEdit) onEdit(); };
  const ok = mk('button', { value: 'ok', className: 'primary', textContent: '关闭' });
  form.append(
    mk('div', { className: 'sc-head' }, mk('h3', { textContent: '键盘快捷键速查' }), q),
    body,
    mk('div', { className: 'sc-foot' }, mk('span', { textContent: '列表按当前生效的快捷键生成（含你自定义过的）。按住 ⌥ / Alt、⇧ / Shift 的变体见各工具的说明。' }), mk('span', {}, edit, ' ', ok)),
  );
  dlg.append(form);
  document.body.append(dlg);
  render();
  dlg.addEventListener('close', () => { dlg.remove(); dlg = null; });
  dlg.showModal();
  q.focus();
  return true;
}

export default { openShortcutSheet, shortcutGroups };
