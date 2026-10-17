












const MAX = 4;
let host = null;

function anchorTop() {
  const bar = document.querySelector('.menubar-row');
  if (!bar) return 8;
  const r = bar.getBoundingClientRect();
  return Math.max(4, Math.round(r.bottom - 14));        
}
function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.className = 'toast-stack';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}
function place() { if (host) host.style.top = anchorTop() + 'px'; }

export function toast(msg, kind = 'info') {
  const text = String(msg || '').trim();
  if (!text) return null;
  const h = ensureHost(); place();
  for (const t of h.children) {
    if (t.__text === text && t.__kind === kind && !t.classList.contains('leaving')) {
      t.__arm(); t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse');
      return t;
    }
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.__text = text; el.__kind = kind;
  const dot = document.createElement('i'); dot.className = 'toast-dot';
  const body = document.createElement('div'); body.className = 'toast-text'; body.textContent = text;
  const x = document.createElement('button'); x.type = 'button'; x.className = 'toast-close'; x.title = '关闭'; x.textContent = '×';
  el.append(dot, body, x);
  const life = kind === 'error' ? 8000 : Math.min(9000, 3600 + text.length * 40);
  let timer = 0;
  const leave = () => {
    if (el.classList.contains('leaving')) return;
    clearTimeout(timer);
    el.classList.remove('in'); el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  };
  el.__arm = () => { clearTimeout(timer); timer = setTimeout(leave, life); };
  el.__leave = leave;
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => el.__arm());
  x.addEventListener('click', leave);
  h.prepend(el);                                         
  const raf = (document.defaultView && document.defaultView.requestAnimationFrame) || (cb => setTimeout(cb, 16));
  raf(() => raf(() => el.classList.add('in')));
  el.__arm();
  const live = [...h.children].filter(t => !t.classList.contains('leaving'));
  for (const t of live.slice(MAX)) t.__leave();
  return el;
}


export function installToasts() {
  const pairs = [['#notice', 'info'], ['#err', 'error']];
  for (const [sel, kind] of pairs) {
    const src = document.querySelector(sel);
    if (!src || src.__toast) continue;
    src.__toast = true;
    src.classList.add('toast-source');
    const fire = () => { const t = src.textContent; if (t && t.trim()) toast(t, kind); };
    const MO = (src.ownerDocument.defaultView || globalThis).MutationObserver;   
    if (MO) new MO(fire).observe(src, { childList: true, characterData: true, subtree: true });
    fire();
  }
  try { (document.defaultView || globalThis).addEventListener('resize', place); } catch {}
}
export default { toast, installToasts };
