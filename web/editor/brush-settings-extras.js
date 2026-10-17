







let A = null;
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const LOCK_KEY = 'fp.brushLocks';
const locks = new Set((() => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '[]'); } catch { return []; } })());
const saveLocks = () => { try { localStorage.setItem(LOCK_KEY, JSON.stringify([...locks])); } catch {} };
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

const FIELDS = {
  shape: b => ['dyn', 'shape'], scatter: () => ['dyn', 'scatter'], texture: () => ['dyn', 'texture'], dual: () => ['dyn', 'dual'],
  color: () => ['dyn', 'color'], transfer: () => ['dyn', 'transfer'], pose: () => ['dyn', 'pose'], noise: () => ['dyn', 'noise'],
  wetEdges: () => ['dyn', 'wetEdges'], protectTexture: () => ['dyn', 'protectTexture'], air: () => ['airbrush'], smooth: () => ['smoothing'],
};
const getAt = (b, path) => path.reduce((o, k) => o == null ? o : o[k], b);
function setAt(b, path, v) { let o = b; for (let i = 0; i < path.length - 1; i++) { if (o[path[i]] == null) o[path[i]] = {}; o = o[path[i]]; } o[path[path.length - 1]] = v; }

export function captureLocked(brush) {
  if (!locks.size || !brush) return null;
  const keep = {};
  for (const k of locks) if (FIELDS[k]) { const v = getAt(brush, FIELDS[k](brush)); if (v !== undefined) keep[k] = clone(v); }
  return keep;
}

export function restoreLocked(brush, keep) {
  if (!keep || !brush) return;
  for (const k of Object.keys(keep)) setAt(brush, FIELDS[k](brush), clone(keep[k]));
}
function clearControls() {
  const b = A.brush(), d = b.dyn || {};
  for (const k of ['shape', 'scatter', 'texture', 'dual', 'color', 'transfer', 'pose']) if (d[k]) d[k].on = false;
  d.noise = false; d.wetEdges = false; d.protectTexture = false;
  b.airbrush = false; b.smoothing = 0;
  A.changed();
}
export function menu() {
  return [
    { label: '清除画笔控制', run: () => clearControls() },
    { label: '复位所有锁定设置', disabled: !locks.size, run: () => { locks.clear(); saveLocks(); A.render(); } },
    { label: '将纹理拷贝到其它工具', disabled: true, why: '本编辑器所有绘画类工具共用同一套画笔设置（纹理也在其中），切换工具时纹理本来就跟着走' },
  ];
}

export function decorate(host, nav, pages) {
  if (!A || !host) return;
  const rows = nav ? [...nav.children] : [];
  rows.forEach((row, i) => {
    const key = pages[i] && pages[i][2];
    if (!key || !FIELDS[key]) return;
    const on = locks.has(key);
    const lk = mk('span', { className: 'bs-lock' + (on ? ' on' : ''), title: on ? '已锁定：切换画笔预设时保持这一组设置（点按解锁）' : '锁定这一组设置（切换画笔预设时保持不变）' });
    lk.append(A.uiIcon('brush-lock', 10));
    lk.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (locks.has(key)) locks.delete(key); else locks.add(key); saveLocks(); A.render(); });
    row.append(lk);
  });
  const top = mk('div', { className: 'bs-top' });
  const bb = mk('button', { type: 'button', className: 'bs-brushes', textContent: '画笔', title: '打开「画笔」面板' });
  bb.onclick = () => A.showBrushes();
  top.append(bb);
  const foot = mk('div', { className: 'bs-foot' });
  const live = mk('button', { type: 'button', className: 'lf-btn', disabled: true, title: '切换实时笔尖画笔预览：只对毛刷 / 侵蚀 / 喷枪笔尖起作用（需要 GPU 三维笔尖预览）；本编辑器没有这几类笔尖' });
  live.append(A.uiIcon('brush-live-preview', 15));
  const nb = mk('button', { type: 'button', className: 'lf-btn', title: '创建新画笔' });
  nb.append(A.uiIcon('add-style', 15));
  nb.onclick = () => A.newBrush();
  foot.append(live, mk('span', { className: 'grow' }), nb);
  host.prepend(top);
  host.append(foot);
}
const CSS = `
section.panel[data-panel="brushSettings"] { display: flex; flex-direction: column; }
section.panel[data-panel="brushSettings"][hidden] { display: none; }
.bs-top { display: flex; padding: 4px 6px; border-bottom: 1px solid var(--line, #222); flex: none; }
.bs-top .bs-brushes { height: 22px; padding: 0 12px; font-size: 12px; }
.bs-panel .bs-nav label { position: relative; padding-right: 18px; }
.bs-lock { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: inline-flex; opacity: .25; cursor: pointer; }
.bs-lock:hover { opacity: .6; }
.bs-lock.on { opacity: 1; }
.bs-foot { display: flex; align-items: center; gap: 2px; padding: 3px 6px; border-top: 1px solid var(--line, #222); flex: none; }
.bs-foot .grow { flex: 1; }
.bs-foot .lf-btn[disabled] { opacity: .35; }
`;

export function installBrushSettingsExtras(api) {
  A = api;
  if (!document.getElementById('bsxCss')) document.head.append(mk('style', { id: 'bsxCss', textContent: CSS }));
  api.panels.setPanelMenu('brushSettings', () => menu());
  return bsx;
}
export const bsx = { installBrushSettingsExtras, decorate, captureLocked, restoreLocked, menu, get locks() { return [...locks]; } };
export default bsx;
