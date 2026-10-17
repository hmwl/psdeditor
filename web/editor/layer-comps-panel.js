












import { lbIcon } from './lb-icons.js';
import { writePdf } from '../../core/pdf-write.js';
import { compsFromDescriptor, compsToDescriptor, cmlsFromShmd, buildCmlsDesc, serializeLbResource, parseLbResource, LB_RESOURCE_ID } from '../../core/layer-comps.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const clone = o => JSON.parse(JSON.stringify(o));
const safe = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';

let C = null;                     
let S = fresh();                  
function fresh() { return { list: [], lastApplied: null, sel: null, lastDoc: null, dirty: false, filter: { vis: true, pos: true, app: true, sel: true } }; }
let rootEl = null;


export const LC = {
  capture: () => clone(S),
  apply: v => { S = v ? clone(v) : fresh(); render(); },
  snap: () => clone({ list: S.list, lastApplied: S.lastApplied, sel: S.sel, dirty: S.dirty }),
  restore: v => { if (!v) return; Object.assign(S, clone(v)); render(); },
  reset: () => { S = fresh(); render(); },
  list: () => S.list,
  state: () => S,
  
  load(buf, info) { S = fresh(); try { loadFrom(buf, info); } catch (e) { console.warn('[layer-comps] 读取失败', e); } render(); },
  
  writeInto: (buf, h) => writeInto(buf, h),
  needsWrite: () => S.dirty || S.list.length > 0,
  dirty: () => !!S.dirty,   
  render: () => render(),
};


function loadFrom(buf, info) {
  const { resources, layers } = info;            
  const r1065 = resources.find(r => r.id === 1065);
  const desc = r1065 && r1065.data && r1065.data.descriptor;
  if (!desc) return;
  const m = compsFromDescriptor(desc);
  const byComp = new Map(m.list.map(c => [c.id, c]));
  for (const L of layers) {
    if (!L.shmd) continue;
    for (const [id, st] of cmlsFromShmd(L.shmd)) { const c = byComp.get(id); if (c) c.states[L.key] = { ...st }; }
  }
  const r4092 = resources.find(r => r.id === LB_RESOURCE_ID);
  const ext = r4092 && r4092._raw ? parseLbResource(r4092._raw) : null;
  if (ext && Array.isArray(ext.comps)) for (const e of ext.comps) {
    const c = byComp.get(e.id); if (!c) continue;
    if (e.app) { c.cap.app = true; for (const k in e.app) c.states[k] = { ...(c.states[k] || {}), ...e.app[k] }; }
    if (e.sel) { c.cap.sel = true; c.sel = e.sel.slice(); }
  }
  S.list = m.list; S.lastApplied = m.lastApplied; S.sel = m.lastApplied ?? (m.list[0] && m.list[0].id) ?? null;
}


async function writeInto(buf, h) {
  
  let r = h.applyEdits(buf, [{ op: 'ensureLayerIds' }]); buf = r.buffer;
  const ids = h.layerIdsOf(buf);                               
  
  const toBuilt = key => { const i = C.indexOfKey(key); if (i < 0) return -1; return h.builtIndexOf(i); };
  const newKey = key => { const b = toBuilt(key); if (b >= 0 && ids[b] != null) return 'id:' + ids[b]; return key.startsWith('id:') ? key : null; };
  
  const perLayer = new Map();                                  
  for (const c of S.list) for (const key in c.states) {
    const st = c.states[key], b = toBuilt(key); if (b < 0) continue;
    const e = { compId: c.id };
    if (c.cap.vis && st.v !== undefined) e.v = !!st.v;
    if (c.cap.pos && st.dx != null) { const i = C.indexOfKey(key), base = C.base(i), cur = C.pos(i); e.dx = base.x + st.dx - cur.x; e.dy = base.y + st.dy - cur.y; }
    if (e.v === undefined && e.dx == null) continue;
    if (!perLayer.has(b)) perLayer.set(b, []);
    perLayer.get(b).push(e);
  }
  const entries = [];
  const had = h.layersWithCmls(buf);                           
  const all = new Set([...perLayer.keys(), ...had]);
  for (const b of all) entries.push({ index: b, cmls: perLayer.has(b) ? buildCmlsDesc(ids[b] >>> 0, perLayer.get(b)) : null });
  if (entries.length) { r = h.applyEdits(buf, [{ op: 'setLayerCompsMeta', entries }]); buf = r.buffer; }
  
  if (S.list.length) {
    buf = h.writeImageResource(buf, 1065, h.resourceHandler(1065).write({ descriptorVersion: 16, descriptor: compsToDescriptor(S.list, S.lastApplied) }));
    const ext = { comps: S.list.map(c => {
      const o = { id: c.id };
      if (c.cap.app) { o.app = {}; for (const k in c.states) { const st = c.states[k], nk = newKey(k); if (!nk || st.op == null) continue; o.app[nk] = { op: st.op, bm: st.bm, fo: st.fo }; } }
      if (c.cap.sel) o.sel = c.sel.map(newKey).filter(Boolean);
      return o;
    }) };
    buf = h.writeImageResource(buf, LB_RESOURCE_ID, serializeLbResource(ext));
  } else {
    buf = h.removeImageResource(buf, 1065); buf = h.removeImageResource(buf, LB_RESOURCE_ID);
  }
  return buf;
}


function captureInto(c, cap = c.cap) {
  c.cap = { ...cap };
  c.states = {};
  for (const L of C.layers()) {
    const st = {}, cur = C.layerState(L.i);
    if (cap.vis) st.v = cur.v;
    if (cap.pos && !L.isGroup && !L.isBg) { const b = C.base(L.i); st.dx = cur.x - b.x; st.dy = cur.y - b.y; }
    if (cap.app) { st.op = cur.op; st.bm = cur.bm; st.fo = cur.fo; }
    c.states[L.key] = st;
  }
  c.sel = cap.sel ? C.selected().map(i => C.keyOf(i)) : [];
}

function fullState() { const c = { id: 0, name: '', cap: { vis: true, pos: true, app: true, sel: true } }; captureInto(c); return c; }
function applyStates(c, filter = S.filter) {
  const live = C.layers();
  for (const L of live) {
    const st = c.states[L.key]; if (!st) continue;
    const cur = C.layerState(L.i);
    if (c.cap.vis && filter.vis && st.v !== undefined && st.v !== cur.v) C.setVisible(L.i, st.v);
    if (c.cap.pos && filter.pos && st.dx != null && !L.isGroup && !L.isBg) {
      const b = C.base(L.i), x = b.x + st.dx, y = b.y + st.dy;
      if (Math.abs(x - cur.x) > 1e-6 || Math.abs(y - cur.y) > 1e-6) C.setPos(L.i, x, y);
    }
    if (c.cap.app && filter.app && st.op != null) {
      if (st.op !== cur.op) C.setOpacity(L.i, st.op);
      if (st.bm && st.bm !== cur.bm) C.setBlend(L.i, st.bm);
      if (st.fo != null && st.fo !== cur.fo) C.setFill(L.i, st.fo);
    }
  }
  if (c.cap.sel && filter.sel && c.sel && c.sel.length) { const idx = c.sel.map(k => C.indexOfKey(k)).filter(i => i >= 0); if (idx.length) C.select(idx); }
}
function missingKeys(c) { const live = new Set(C.layers().map(L => L.key)); return Object.keys(c.states).filter(k => !live.has(k)); }

function byId(id) { return S.list.find(c => c.id === id) || null; }
function nextId() { let m = 0; for (const c of S.list) m = Math.max(m, c.id); return m + 1; }
function changed(label, fn) { C.history(label); fn(); S.dirty = true; render(); }


async function compOptions(c, isNew) {
  const v = await C.formDialog(isNew ? '新建图层复合' : '图层复合选项', [
    { key: 'name', label: '名称', type: 'text', value: c.name },
    { type: 'note', label: '应用于图层：' },
    { key: 'vis', label: '可见性', type: 'check', value: c.cap.vis },
    { key: 'pos', label: '位置', type: 'check', value: c.cap.pos },
    { key: 'app', label: '外观（图层样式）', type: 'check', value: c.cap.app },
    { key: 'sel', label: '选中的图层', type: 'check', value: c.cap.sel },
    { key: 'comment', label: '注释', type: 'textarea', value: c.comment || '', rows: 3 },
  ]);
  if (!v) return null;
  return { name: String(v.name || '').trim() || c.name, cap: { vis: !!v.vis, pos: !!v.pos, app: !!v.app, sel: !!v.sel }, comment: v.comment || '' };
}
async function newComp(opts = {}) {
  if (!C.hasDoc()) return false;
  const base = { id: nextId(), name: `图层复合 ${S.list.length + 1}`, comment: '', cap: { vis: true, pos: false, app: false, sel: false } };
  
  const last = S.list[S.list.length - 1]; if (last) base.cap = { ...last.cap };
  let o = opts.silent ? { name: opts.name || base.name, cap: opts.cap || base.cap, comment: opts.comment || '' } : await compOptions(base, true);
  if (!o) return false;
  const c = { ...base, ...o };
  changed('新建图层复合', () => { captureInto(c, c.cap); const k = S.list.findIndex(x => x.id === S.sel); S.list.splice(k >= 0 ? k + 1 : S.list.length, 0, c); S.sel = c.id; S.lastApplied = c.id; });
  C.status(`已新建图层复合「${c.name}」`);
  return c.id;
}
function updateComp(id = S.sel, only = null) {
  const c = byId(id); if (!c) return false;
  const cap = only ? { vis: false, pos: false, app: false, sel: false, [only]: true } : c.cap;
  changed('更新图层复合', () => {
    if (only) {                                       
      const tmp = { cap }; captureInto(tmp, cap);
      c.cap[only] = true;
      for (const k in tmp.states) c.states[k] = { ...(c.states[k] || {}), ...tmp.states[k] };
      if (only === 'sel') c.sel = tmp.sel;
    } else captureInto(c, c.cap);
    S.lastApplied = c.id;
  });
  return true;
}
function applyComp(id = S.sel, opts = {}) {
  const c = byId(id); if (!c) return false;
  if (!S.lastDoc) S.lastDoc = fullState();             
  C.history('应用图层复合');
  applyStates(c);
  S.lastApplied = c.id; S.sel = c.id; S.dirty = true;
  C.refresh(); render();
  if (!opts.quiet) { const miss = missingKeys(c).length; C.status(`已应用图层复合「${c.name}」${miss ? `（${miss} 个图层已不存在，无法完全恢复）` : ''}`); }
  return true;
}
function restoreLastDoc() {
  if (!S.lastDoc) return false;
  C.history('最后的文档状态');
  applyStates(S.lastDoc, { vis: true, pos: true, app: true, sel: true });
  S.lastApplied = null; S.sel = null; S.lastDoc = null;
  C.refresh(); render();
  return true;
}
function step(dir) {
  if (!S.list.length) return false;
  const k = S.list.findIndex(c => c.id === (S.lastApplied ?? S.sel));
  const n = k < 0 ? (dir > 0 ? 0 : S.list.length - 1) : (k + dir + S.list.length) % S.list.length;
  return applyComp(S.list[n].id);
}
async function deleteComp(id = S.sel) {
  const c = byId(id); if (!c) return false;
  changed('删除图层复合', () => {
    const k = S.list.indexOf(c); S.list.splice(k, 1);
    if (S.lastApplied === c.id) S.lastApplied = null;
    S.sel = S.list[Math.min(k, S.list.length - 1)]?.id ?? null;
  });
  return true;
}
function duplicateComp(id = S.sel) {
  const c = byId(id); if (!c) return false;
  const d = clone(c); d.id = nextId(); d.name = c.name + ' 拷贝';
  changed('复制图层复合', () => { S.list.splice(S.list.indexOf(c) + 1, 0, d); S.sel = d.id; });
  return d.id;
}
async function optionsUI(id = S.sel) {
  const c = byId(id); if (!c) return false;
  const o = await compOptions(c, false); if (!o) return false;
  changed('图层复合选项', () => {
    
    for (const k of ['vis', 'pos', 'app', 'sel']) if (o.cap[k] && !c.cap[k]) { const tmp = {}; captureInto(tmp, { vis: false, pos: false, app: false, sel: false, [k]: true }); for (const q in tmp.states) c.states[q] = { ...(c.states[q] || {}), ...tmp.states[q] }; if (k === 'sel') c.sel = tmp.sel; }
    c.name = o.name; c.cap = o.cap; c.comment = o.comment;
  });
  return true;
}
function clearWarning(id = S.sel, all = false) {
  const list = all ? S.list : [byId(id)].filter(Boolean);
  if (!list.some(c => missingKeys(c).length)) return false;
  changed(all ? '清除所有图层复合警告' : '清除图层复合警告', () => { for (const c of list) for (const k of missingKeys(c)) delete c.states[k]; });
  return true;
}


const STYLE = `
.lc-panel{display:flex;flex-direction:column;height:100%;min-height:120px;font-size:12px}
.lc-top{display:flex;align-items:center;gap:2px;padding:3px 6px;border-bottom:1px solid var(--ps-border,#1d1d1d)}
.lc-top .lc-lab{opacity:.7;margin-right:4px}
.lc-tg{width:22px;height:20px;display:grid;place-items:center;border:1px solid transparent;border-radius:3px;background:transparent;opacity:.45;padding:0}
.lc-tg.on{opacity:1;background:var(--ps-hover,#3a3a3a)}
.lc-list{flex:1;overflow:auto;outline:none}
.lc-row{display:flex;align-items:center;gap:6px;padding:0 6px;height:26px;border-bottom:1px solid rgba(0,0,0,.25);cursor:default;user-select:none}
.lc-row.on{background:var(--ps-sel,#2f4d77)}
.lc-row .lc-box{width:18px;height:18px;display:grid;place-items:center;flex:none}
.lc-row .lc-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lc-row .lc-caps{display:flex;gap:1px;opacity:.75}
.lc-row .lc-tri{width:10px;opacity:.7;flex:none;cursor:pointer}
.lc-cmt{padding:2px 8px 4px 40px;opacity:.75;white-space:pre-wrap;font-size:11px;border-bottom:1px solid rgba(0,0,0,.25)}
.lc-last{font-style:italic}
.lc-empty{padding:10px;opacity:.6;line-height:1.5}
.lc-foot{display:flex;align-items:center;gap:2px;padding:3px 6px;border-top:1px solid var(--ps-border,#1d1d1d)}
.lc-foot .grow{flex:1}
`;
const openCmt = new Set();
let dragId = null;
function renameInline(c, nameEl) {
  const inp = mk('input', { type: 'text', value: c.name }); inp.style.cssText = 'flex:1;min-width:0;font:inherit;height:18px';
  nameEl.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const fin = ok => { if (done) return; done = true; const v = inp.value.trim(); if (ok && v && v !== c.name) changed('图层复合改名', () => { c.name = v; }); else render(); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); };
  inp.onblur = () => fin(true); inp.onclick = e => e.stopPropagation(); inp.ondblclick = e => e.stopPropagation();
}
function render() {
  const sec = C && C.panels.sectionOf('layerComps'); if (!sec) return;
  if (!rootEl || !sec.contains(rootEl)) {
    sec.textContent = '';
    if (!document.getElementById('lcStyle')) document.head.append(mk('style', { id: 'lcStyle', textContent: STYLE }));
    rootEl = mk('div', { className: 'lc-panel' });
    sec.append(rootEl);
  }
  rootEl.textContent = '';
  
  const top = mk('div', { className: 'lc-top' }, mk('span', { className: 'lc-lab', textContent: '应用：' }));
  for (const [k, ic, tip] of [['vis', 'CompVisibility', '可见性'], ['pos', 'CompPosition', '位置'], ['app', 'CompAppearance', '外观（图层样式）'], ['sel', 'CompActivate', '选择的图层']]) {
    const b = mk('button', { type: 'button', className: 'lc-tg' + (S.filter[k] ? ' on' : ''), title: `应用图层复合时${S.filter[k] ? '' : '不'}套用「${tip}」（单击切换）` });
    b.dataset.lcFilter = k; b.append(lbIcon(ic, 14));
    b.onclick = () => { S.filter[k] = !S.filter[k]; render(); };
    top.append(b);
  }
  rootEl.append(top);
  const list = mk('div', { className: 'lc-list', tabIndex: 0 });
  list.onkeydown = e => { if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel != null) { e.preventDefault(); e.stopPropagation(); deleteComp(); } };
  if (!C.hasDoc()) list.append(mk('div', { className: 'lc-empty', textContent: '打开文档后可以新建图层复合。' }));
  else {
    const last = mk('div', { className: 'lc-row lc-last' + (S.lastApplied == null ? ' on' : '') });
    last.append(mk('span', { className: 'lc-tri' }), mk('span', { className: 'lc-box' }, S.lastApplied == null ? lbIcon('CompActivate', 14) : null), mk('span', { className: 'lc-name', textContent: '最后的文档状态' }));
    last.title = S.lastDoc ? '单击：恢复到第一次应用图层复合之前的状态' : '当前就是文档状态';
    last.onclick = () => { if (S.lastDoc) restoreLastDoc(); };
    list.append(last);
    if (!S.list.length) list.append(mk('div', { className: 'lc-empty', textContent: '还没有图层复合。点底部的「创建新的图层复合」把当前图层的可见性 / 位置 / 外观记下来；之后单击左侧方框即可在几个版本之间切换。' }));
    for (const c of S.list) {
      const miss = missingKeys(c).length;
      const row = mk('div', { className: 'lc-row' + (S.sel === c.id ? ' on' : '') });
      row.dataset.compId = c.id;
      const tri = mk('span', { className: 'lc-tri', textContent: c.comment ? (openCmt.has(c.id) ? '▾' : '▸') : '' });
      tri.onclick = e => { e.stopPropagation(); if (openCmt.has(c.id)) openCmt.delete(c.id); else openCmt.add(c.id); render(); };
      const box = mk('span', { className: 'lc-box', title: '应用此图层复合' }, S.lastApplied === c.id ? lbIcon('CompActivate', 14) : mk('span', { style: 'width:12px;height:12px;border:1px solid #888;display:block' }));
      box.onclick = e => { e.stopPropagation(); applyComp(c.id); };
      const name = mk('span', { className: 'lc-name', textContent: c.name });
      const caps = mk('span', { className: 'lc-caps' });
      for (const [k, ic] of [['vis', 'CompVisibility'], ['pos', 'CompPosition'], ['app', 'CompAppearance'], ['sel', 'CompActivate']]) if (c.cap[k]) caps.append(lbIcon(ic, 12));
      row.append(tri, box, name, caps);
      if (miss) { const w = lbIcon('WarningSmall', 14); w.style.pointerEvents = 'auto'; w.title = `有 ${miss} 个图层已被删除，无法完全恢复这个复合（单击清除警告）`; w.onclick = e => { e.stopPropagation(); clearWarning(c.id); }; row.append(w); }
      row.onclick = () => { S.sel = c.id; render(); };
      
      row.ondblclick = e => { if (e.target === name) renameInline(c, name); else if (e.target === row || e.target === caps) optionsUI(c.id); };
      
      row.draggable = true;
      row.ondragstart = e => { dragId = c.id; try { e.dataTransfer.setData('text/x-psd_editor-comp', String(c.id)); e.dataTransfer.effectAllowed = 'copyMove'; } catch {} };
      row.ondragend = () => { dragId = null; };
      row.ondragover = e => { if (dragId != null && dragId !== c.id) { e.preventDefault(); row.style.boxShadow = 'inset 0 2px 0 #2d8ceb'; } };
      row.ondragleave = () => { row.style.boxShadow = ''; };
      row.ondrop = e => { e.preventDefault(); row.style.boxShadow = ''; const from = byId(dragId); dragId = null; if (!from || from === c) return;
        changed('移动图层复合', () => { S.list.splice(S.list.indexOf(from), 1); S.list.splice(S.list.indexOf(c), 0, from); S.sel = from.id; }); };
      row.oncontextmenu = e => { e.preventDefault(); S.sel = c.id; render(); showMenu(e); };
      list.append(row);
      if (c.comment && openCmt.has(c.id)) list.append(mk('div', { className: 'lc-cmt', textContent: c.comment }));
    }
  }
  rootEl.append(list);
  const foot = mk('div', { className: 'lc-foot' });
  const B = (ic, tip, run, dis, attr) => { const b = mk('button', { type: 'button', className: 'lf-btn', title: tip, disabled: !!dis }); b.dataset.attr = attr; b.append(lbIcon(ic, 16)); b.onclick = run; foot.append(b); return b; };
  const has = C.hasDoc(), sel = byId(S.sel);
  B('CompPrev', '应用选中的上一图层复合', () => step(-1), !has || !S.list.length, 'lc-prev');
  B('CompNext', '应用选中的下一图层复合', () => step(1), !has || !S.list.length, 'lc-next');
  foot.append(mk('span', { className: 'grow' }));
  B('CompRecaptureVisibility', '更新图层复合：可见性', () => updateComp(S.sel, 'vis'), !sel, 'lc-up-vis');
  B('CompRecapturePosition', '更新图层复合：位置', () => updateComp(S.sel, 'pos'), !sel, 'lc-up-pos');
  B('CompRecaptureAppearance', '更新图层复合：外观', () => updateComp(S.sel, 'app'), !sel, 'lc-up-app');
  B('CompRecaptureLayers', '更新图层复合（按它勾选的全部项目）', () => updateComp(), !sel, 'lc-update');
  const nb = B('CompNew', '创建新的图层复合（按住 Alt 跳过对话框）', e => newComp(e.altKey ? { silent: true } : {}), !has, 'lc-new');
  const db = B('Trashcan', '删除图层复合', () => deleteComp(), !sel, 'lc-delete');
  for (const [b, fn] of [[nb, id => duplicateComp(id)], [db, id => deleteComp(id)]]) {
    b.ondragover = e => { if (dragId != null) e.preventDefault(); };
    b.ondrop = e => { e.preventDefault(); const id = dragId; dragId = null; if (id != null) fn(id); };
  }
  rootEl.append(foot);
}
function menuItems() {
  const has = C && C.hasDoc(), sel = byId(S.sel);
  return [
    { label: '新建图层复合…', run: () => newComp(), disabled: !has },
    { label: '复制图层复合', run: () => duplicateComp(), disabled: !sel },
    { label: '删除图层复合', run: () => deleteComp(), disabled: !sel },
    { label: '更新图层复合', run: () => updateComp(), disabled: !sel },
    { label: '应用图层复合', run: () => applyComp(), disabled: !sel },
    { label: '下一个图层复合', run: () => step(1), disabled: !S.list.length },
    { label: '上一个图层复合', run: () => step(-1), disabled: !S.list.length },
    { label: '恢复最后的文档状态', run: () => restoreLastDoc(), disabled: !S.lastDoc },
    { sep: true },
    { label: '图层复合选项…', run: () => optionsUI(), disabled: !sel },
    { label: '清除图层复合警告', run: () => clearWarning(), disabled: !sel || !missingKeys(sel).length },
    { label: '清除所有图层复合警告', run: () => clearWarning(null, true), disabled: !S.list.some(c => missingKeys(c).length) },
    { sep: true },
    { label: '图层复合导出到文件…', run: () => C.actions.run('file.layerCompsToFiles'), disabled: !S.list.length },
    { label: '图层复合导出到 PDF…', run: () => C.actions.run('file.layerCompsToPdf'), disabled: !S.list.length },
  ];
}
function showMenu(e) { try { C.panels.popup(menuItems(), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); } catch {  } }



async function renderComps(comps, each) {
  const snap = C.snapshot(), compsSnap = LC.snap(), lastDoc = S.lastDoc;
  C.histLock(true);
  try {
    for (let k = 0; k < comps.length; k++) {
      applyStates(comps[k], { vis: true, pos: true, app: true, sel: false });
      await C.settle();
      await each(comps[k], C.compositeCanvas(), k);
    }
  } finally {
    C.restore(snap); C.histLock(false); LC.restore(compsSnap); S.lastDoc = lastDoc; C.refresh();
  }
}
function crop(cv, r) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
  c.getContext('2d').drawImage(cv, -Math.round(r.x), -Math.round(r.y)); return c;
}
function flatten(cv, bg = '#fff') {
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(cv, 0, 0); return c;
}
const jpegBytes = async (cv, q) => new Uint8Array(await (await C.canvasToBlob(flatten(cv), 'jpg', q)).arrayBuffer());
const pngBytes = async cv => new Uint8Array(await (await C.canvasToBlob(cv, 'png')).arrayBuffer());

function pdfPage(cv, jpeg, res, extra = {}) {
  const k = 72 / (res || 72), W = cv.width * k, H = cv.height * k;
  return { width: W, height: H, images: [{ jpeg, pw: cv.width, ph: cv.height, x: 0, y: 0, w: W, h: H }], ...extra };
}
const pickComps = only => only ? S.list.filter(c => c.id === S.sel) : S.list.slice();

async function exportCompsToFiles() {
  if (!S.list.length) { await C.alertDialog('这个文档里没有图层复合。先在「图层复合」面板里新建。', { title: '图层复合导出到文件' }); return false; }
  const abs = C.artboards();
  const v = await C.formDialog('将图层复合导出到文件', [
    { key: 'prefix', label: '文件名前缀', type: 'text', value: safe(C.docName().replace(/\.ps[db]$/i, '')) },
    { key: 'only', label: '仅限选中的图层复合', type: 'check', value: false },
    { key: 'fmt', label: '文件类型', type: 'select', value: 'png', options: [['psd', 'PSD'], ['png', 'PNG-24'], ['jpg', 'JPEG'], ['pdf', 'PDF']] },
    { key: 'q', label: '品质', type: 'number', value: 10, min: 0, max: 12, showIf: o => o.fmt === 'jpg' || o.fmt === 'pdf' },
    { key: 'trans', label: '透明区域', type: 'check', value: true, showIf: o => o.fmt === 'png' },
    { key: 'ab', label: '按画板裁切（每个画板单独一个文件）', type: 'check', value: false, showIf: () => abs.length > 0 },
    { key: 'comment', label: '包含注释（写成同名 .txt）', type: 'check', value: false },
  ], { okText: '运行' });
  if (!v) return false;
  const comps = pickComps(v.only); if (!comps.length) return false;
  const q = Math.round(v.q / 12 * 100), files = [];
  const add = (name, data) => { let n = name, k = 1; while (files.some(f => f.name === n)) n = name.replace(/(\.[^.]+)$/, `_${++k}$1`); files.push({ name: n, data }); };
  await renderComps(comps, async (c, cv, k) => {
    const base = `${safe(v.prefix)}_${String(k + 1).padStart(4, '0')}_${safe(c.name)}`;
    const parts = v.ab && abs.length ? abs.map(a => [base + '_' + safe(a.name), crop(cv, a.rect)]) : [[base, cv]];
    for (const [n, pc] of parts) {
      if (v.fmt === 'psd') add(n + '.psd', await C.exportPsdBytes());     
      else if (v.fmt === 'jpg') add(n + '.jpg', await jpegBytes(pc, q));
      else if (v.fmt === 'pdf') add(n + '.pdf', writePdf([pdfPage(pc, await jpegBytes(pc, q), C.resolution())], { title: c.name }));
      else add(n + '.png', await pngBytes(v.trans ? pc : flatten(pc)));
    }
    if (v.comment && c.comment) add(base + '.txt', new TextEncoder().encode(c.comment));
  });
  C.download(safe(v.prefix) + '_图层复合.zip', new Blob([C.makeZip(files)], { type: 'application/zip' }));
  C.status(`图层复合导出到文件：${comps.length} 个复合，${files.length} 个文件`);
  return files.length;
}
async function exportCompsToPdf() {
  if (!S.list.length) { await C.alertDialog('这个文档里没有图层复合。先在「图层复合」面板里新建。', { title: '图层复合导出到 PDF' }); return false; }
  const abs = C.artboards();
  const v = await C.formDialog('将图层复合导出到 PDF', [
    { key: 'name', label: '文件名', type: 'text', value: safe(C.docName().replace(/\.ps[db]$/i, '')) },
    { key: 'only', label: '仅限选中的图层复合', type: 'check', value: false },
    { key: 'ab', label: '按画板裁切（每个画板一页）', type: 'check', value: false, showIf: () => abs.length > 0 },
    { key: 'q', label: 'JPEG 品质', type: 'number', value: 10, min: 0, max: 12 },
    { type: 'note', label: '幻灯片放映选项' },
    { key: 'adv', label: '前进间隔', type: 'check', value: false },
    { key: 'sec', label: '秒', type: 'number', value: 5, min: 1, max: 600, showIf: o => o.adv },
    { key: 'loop', label: '全屏打开（在最后一页之后循环由阅读器决定）', type: 'check', value: false },
    { key: 'tr', label: '过渡效果', type: 'select', value: 'none', options: [['none', '无'], ['Dissolve', '溶解'], ['Wipe', '擦除'], ['Box', '盒状'], ['Blinds', '百叶窗'], ['Glitter', '闪光'], ['Split', '分割']] },
  ], { okText: '运行' });
  if (!v) return false;
  const comps = pickComps(v.only); if (!comps.length) return false;
  const q = Math.round(v.q / 12 * 100), pages = [];
  const extra = { ...(v.adv ? { duration: v.sec } : {}), ...(v.tr !== 'none' ? { transition: v.tr } : {}) };
  await renderComps(comps, async (c, cv) => {
    const parts = v.ab && abs.length ? abs.map(a => crop(cv, a.rect)) : [cv];
    for (const pc of parts) pages.push(pdfPage(pc, await jpegBytes(pc, q), C.resolution(), extra));
  });
  const bytes = writePdf(pages, { title: safe(v.name), fullScreen: !!v.loop });
  C.download(safe(v.name) + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
  C.status(`图层复合导出到 PDF：${pages.length} 页`);
  LC._lastPdf = bytes;                                           
  return pages.length;
}
async function exportArtboardsToPdf() {
  const abs = C.artboards();
  if (!abs.length) { await C.alertDialog('这个文档里没有画板。', { title: '画板至 PDF' }); return false; }
  const v = await C.formDialog('画板至 PDF', [
    { key: 'name', label: '文件名前缀', type: 'text', value: safe(C.docName().replace(/\.ps[db]$/i, '')) },
    { key: 'only', label: '仅限选中的画板', type: 'check', value: false },
    { key: 'overlap', label: '包含重叠区域', type: 'check', value: false },
    { key: 'doc', label: '文档', type: 'select', value: 'multi', options: [['multi', '多页文档'], ['each', '每个画板一份文档']] },
    { key: 'q', label: 'JPEG 品质', type: 'number', value: 10, min: 0, max: 12 },
    { key: 'label', label: '包含画板名称', type: 'check', value: false },
  ], { okText: '运行' });
  if (!v) return false;
  const list = v.only ? abs.filter(a => C.selected().includes(a.index)) : abs;
  if (!list.length) { await C.alertDialog('没有选中的画板：在图层面板里选中画板，或取消勾选「仅限选中的画板」。', { title: '画板至 PDF' }); return false; }
  const q = Math.round(v.q / 12 * 100), pages = [];
  const full = v.overlap ? C.compositeCanvas() : null;
  for (const a of list) {
    
    let src = full;
    if (!src) {
      const snap = C.snapshot(); C.histLock(true);
      try { for (const o of abs) if (o.index !== a.index && C.layerState(o.index).v) C.setVisible(o.index, false); await C.settle(); src = C.compositeCanvas(); }
      finally { C.restore(snap); C.histLock(false); C.refresh(); }
    }
    const cv = crop(src, a.rect);
    if (v.label) { const g = cv.getContext('2d'); g.font = `${Math.max(12, Math.round(cv.width / 40))}px sans-serif`; g.fillStyle = '#000'; g.textBaseline = 'bottom'; g.fillText(a.name, 8, cv.height - 6); }
    pages.push({ name: a.name, page: pdfPage(cv, await jpegBytes(cv, q), C.resolution()) });
  }
  if (v.doc === 'each') {
    const files = pages.map(p => ({ name: `${safe(v.name)}_${safe(p.name)}.pdf`, data: writePdf([p.page], { title: p.name }) }));
    C.download(safe(v.name) + '_画板.zip', new Blob([C.makeZip(files)], { type: 'application/zip' }));
  } else {
    const bytes = writePdf(pages.map(p => p.page), { title: safe(v.name) });
    LC._lastPdf = bytes;
    C.download(safe(v.name) + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
  }
  C.status(`画板至 PDF：${pages.length} 个画板`);
  return pages.length;
}


export function installLayerComps(ctx) {
  C = ctx;
  const { R } = ctx;
  R('file.layerCompsToFiles', () => exportCompsToFiles(), () => C.hasDoc() && S.list.length > 0, { why: () => C.hasDoc() ? '这个文档里没有图层复合（窗口 › 图层复合 → 新建）' : '先打开一个文档' });
  R('file.layerCompsToPdf', () => exportCompsToPdf(), () => C.hasDoc() && S.list.length > 0, { why: () => C.hasDoc() ? '这个文档里没有图层复合（窗口 › 图层复合 → 新建）' : '先打开一个文档' });
  R('file.artboardsToPdf', () => exportArtboardsToPdf(), () => C.hasDoc() && C.artboards().length > 0, { why: () => '这个文档里没有画板' });
  C.panels.setPanelMenu('layerComps', menuItems);
  try { C.panels.onChange(() => render()); } catch {}
  render();
  return { LC, newComp, updateComp, applyComp, step, deleteComp, duplicateComp, restoreLastDoc, exportCompsToPdf, exportCompsToFiles, exportArtboardsToPdf, render };
}
