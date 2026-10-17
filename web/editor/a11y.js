











import { openMenuBarByKeyboard } from './menu.js';

const q = (root, sel) => (root.matches && root.matches(sel) ? [root] : []).concat(root.querySelectorAll ? [...root.querySelectorAll(sel)] : []);
const labelOf = el => (el.getAttribute('title') || '').split(/[（(\n]/)[0].trim();

function patch(root) {
  for (const t of q(root, '.pg-tabs')) if (t.getAttribute('role') !== 'tablist') t.setAttribute('role', 'tablist');
  for (const b of q(root, '.pg-tabs > button[data-panel]')) { b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', b.classList.contains('on') ? 'true' : 'false'); b.tabIndex = b.classList.contains('on') ? 0 : -1; }
  for (const t of q(root, '.menu-title')) { t.setAttribute('aria-haspopup', 'menu'); t.setAttribute('aria-expanded', t.classList.contains('open') ? 'true' : 'false'); }
  for (const r of q(root, '.menu-item')) {
    r.tabIndex = -1;
    if (r.classList.contains('checkable')) { r.setAttribute('role', 'menuitemcheckbox'); r.setAttribute('aria-checked', r.classList.contains('checked') ? 'true' : 'false'); }
    else if (!r.getAttribute('role')) r.setAttribute('role', 'menuitem');
    if (r.classList.contains('disabled')) r.setAttribute('aria-disabled', 'true'); else r.removeAttribute('aria-disabled');
    if (r.querySelector('.menu-arrow')) r.setAttribute('aria-haspopup', 'menu');
  }
  for (const b of q(root, '.tool-btn')) b.setAttribute('aria-pressed', b.classList.contains('on') || b.classList.contains('active') ? 'true' : 'false');
  for (const b of q(root, 'button[title]:not([aria-label])')) if (!b.textContent.trim()) { const l = labelOf(b); if (l) b.setAttribute('aria-label', l); }
  for (const i of q(root, 'input[title]:not([aria-label]), select[title]:not([aria-label])')) if (!i.labels || !i.labels.length) { const l = labelOf(i); if (l) i.setAttribute('aria-label', l); }
}




function onMenuKey(e) {
  if (e.key === 'F10' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !document.querySelector('.menu-pop, dialog[open]')) {
    if (openMenuBarByKeyboard()) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
}


function onTabKey(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement) || t.getAttribute('role') !== 'tab') return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  const tabs = [...t.parentElement.querySelectorAll(':scope > button[data-panel]')].filter(b => !b.hidden);
  const i = tabs.indexOf(t); if (i < 0) return;
  const n = tabs.length;
  const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[n - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
  e.preventDefault(); e.stopPropagation();
  next.click(); next.focus();
}

export function installA11y() {
  patch(document.body);
  let pending = new Set(), raf = 0;
  const flush = () => { raf = 0; const list = [...pending]; pending = new Set(); for (const n of list) if (n.isConnected) patch(n); };
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') { for (const n of m.addedNodes) if (n.nodeType === 1) pending.add(n); }
      else if (m.type === 'attributes') {
        const el = m.target;
        if (el.matches('.pg-tabs > button[data-panel], .menu-title, .menu-item, .tool-btn')) pending.add(el);
      }
    }
    if (pending.size && !raf) raf = requestAnimationFrame(flush);
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('keydown', onMenuKey, true);
  document.addEventListener('keydown', onTabKey);
}

export default { installA11y };
