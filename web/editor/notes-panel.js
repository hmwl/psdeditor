









import { uiIcon, hasUiIcon } from './icons.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
let A = null;
let sel = 0;                    
let rootEl = null, els = {};
let editing = null;             

const hexOf = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const authorOf = n => (typeof n.author === 'string' ? n.author : (n.author && n.author.s) || '');
const colorOf = n => { const c = n.color && n.color.components; return c && n.color.space === 0 ? hexOf(c.slice(0, 3).map(v => v / 257)) : '#ffdc00'; };
const editable = n => !!n && n.type === 'txtA' && n.text !== undefined && !n._body;

function list() { return (A && A.list()) || []; }
function clampSel() { const n = list().length; sel = n ? Math.max(0, Math.min(n - 1, sel)) : 0; }


function commitEdit() {
  const e = editing; editing = null;
  if (!e || !els.text) return;
  const v = els.text.value.replace(/\r\n?/g, '\n');
  const L = list(), n = L[e.at];
  if (!n || n !== e.note || !editable(n)) return;
  if ((n.text || '').replace(/\r\n?/g, '\n') === v) return;
  A.change('编辑注释', () => { n.text = v; n._textEnc = n._textEnc || { bom: true, le: false }; n.modDate = { s: stamp(), pad: 0 }; });
}
function stamp() { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

function go(d) { commitEdit(); const n = list().length; if (!n) return; sel = (sel + d + n) % n; render(); A.redraw(); }
function del() {
  commitEdit();
  const L = list(); if (!L.length || A.readOnly()) return;
  const at = sel;
  A.change('删除注释', () => { L.splice(at, 1); });
  clampSel(); render(); A.redraw();
}

export function render() {
  const host = document.querySelector('section.panel[data-panel="notes"]');
  if (!host || !A) return;
  if (!rootEl || !host.contains(rootEl)) {
    host.replaceChildren();
    els.sw = mk('span', { className: 'nt-sw' });
    els.author = mk('span', { className: 'nt-author' });
    els.date = mk('span', { className: 'nt-date' });
    els.text = mk('textarea', { className: 'nt-text', spellcheck: false });
    els.text.setAttribute('aria-label', '注释内容');
    els.text.addEventListener('focus', () => { const n = list()[sel]; editing = n ? { at: sel, note: n } : null; });
    els.text.addEventListener('blur', () => commitEdit());
    els.text.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { const n = list()[sel]; els.text.value = n ? n.text || '' : ''; editing = null; els.text.blur(); } });
    const ib = (name, fb, title, run) => { const b = mk('button', { type: 'button', className: 'nt-fb', title }); b.append(hasUiIcon(name) ? uiIcon(name, 12) : document.createTextNode(fb)); b.onclick = run; return b; };
    els.prev = ib('chevron-left', '◀', '上一个注释', () => go(-1));
    els.next = ib('chevron-right', '▶', '下一个注释', () => go(1));
    els.count = mk('span', { className: 'nt-count' });
    els.del = mk('button', { type: 'button', className: 'nt-fb', title: '删除注释' }); els.del.append(uiIcon('trash-2', 16)); els.del.onclick = () => del();
    const head = mk('div', { className: 'nt-head' }, els.sw, els.author, mk('span', { className: 'grow' }), els.date);
    const foot = mk('div', { className: 'nt-foot' }, els.prev, els.next, els.count, mk('span', { className: 'grow' }), els.del);
    els.empty = mk('div', { className: 'nt-empty' });
    rootEl = mk('div', { className: 'nt-panel' }, head, els.empty, els.text, foot);
    host.append(rootEl);
  }
  clampSel();
  const L = list(), n = L[sel], has = !!(A.hasDoc() && L.length), ro = A.readOnly();
  const focused = document.activeElement === els.text;
  els.empty.hidden = has;
  els.empty.textContent = !A.hasDoc() ? '没有打开的文档。' : ro ? '原有注释无法可靠解析，已原样保留（只读）。' : '没有注释。用注释工具在画布上单击添加。';
  els.text.hidden = !has;
  if (has) {
    els.sw.style.background = colorOf(n); els.sw.hidden = false;
    els.author.textContent = authorOf(n) || '（未填写作者）';
    els.date.textContent = (n.modDate && n.modDate.s) || '';
    const ok = editable(n) && !ro;
    els.text.readOnly = !ok;
    els.text.placeholder = ok ? '在这里输入注释内容' : '语音注释或无法识别的编码，保留原样';
    if (!focused || !editing || editing.note !== n) els.text.value = n.text != null ? n.text : '';
  } else { els.sw.hidden = true; els.author.textContent = ''; els.date.textContent = ''; }
  els.count.textContent = has ? `${sel + 1} / 共 ${L.length}` : '0 / 共 0';
  els.prev.disabled = els.next.disabled = !has || L.length < 2;
  els.del.disabled = !has || ro;
}

const CSS = `
.nt-panel { display: flex; flex-direction: column; height: 100%; min-height: 120px; font-size: 12px; }
.nt-head { display: flex; align-items: center; gap: 6px; padding: 4px 6px; flex: none; border-bottom: 1px solid var(--ps-line, #2a2a2a); min-height: 22px; }
.nt-head .grow, .nt-foot .grow { flex: 1; }
.nt-sw { width: 10px; height: 10px; border: 1px solid rgba(0,0,0,.6); flex: none; }
.nt-author { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-date { color: var(--ps-muted, #9a9a9a); font-size: 11px; white-space: nowrap; }
.nt-text { flex: 1; min-height: 96px; margin: 4px 6px; resize: none; font: inherit; line-height: 1.5; padding: 4px 6px; }
.nt-empty { flex: 1; padding: 12px; color: var(--ps-muted, #9a9a9a); line-height: 1.6; }
.nt-foot { display: flex; align-items: center; gap: 4px; padding: 3px 6px; border-top: 1px solid var(--ps-line, #1c1c1c); flex: none; }
.nt-fb { width: 22px; height: 20px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; border-radius: 3px; }
.nt-fb:hover:not(:disabled) { border-color: var(--ps-line-2, #666); }
.nt-fb:disabled { opacity: .35; }
.nt-count { min-width: 60px; text-align: center; color: var(--ps-muted, #b0b0b0); }
`;

export const NOTES = {
  render,
  
  selected: () => (list().length ? sel : -1),
  
  select(i, { focus = false } = {}) {
    commitEdit();
    sel = i | 0; clampSel();
    try { A.panels.show('notes'); } catch {}
    render(); A.redraw();
    if (focus && els.text && !els.text.hidden && !els.text.readOnly) setTimeout(() => { try { els.text.focus(); const n = els.text.value.length; els.text.setSelectionRange(n, n); } catch {} }, 0);
  },
  next: () => go(1), prev: () => go(-1), del,
  commit: commitEdit,
};
export function installNotesPanel(api) {
  A = api;
  if (!document.getElementById('ntCss')) document.head.append(mk('style', { id: 'ntCss', textContent: CSS }));
  const host = document.querySelector('section.panel[data-panel="notes"]');
  if (host) new MutationObserver(() => { if (!host.querySelector('.nt-panel')) { rootEl = null; render(); } }).observe(host, { childList: true });
  render();
  return NOTES;
}
