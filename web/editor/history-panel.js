


















import { uiIcon, hasUiIcon, toolIcon, hasToolIcon } from './icons.js';
import { formDialog, confirmDialog } from './dialog.js';

const OPT_KEY = 'psd_editor:history-opts';

export const HOPTS = { autoFirst: true, autoOnSave: false, nonLinear: false, showNewSnapDlg: false, visUndo: false };
try { Object.assign(HOPTS, JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch {}
const saveOpts = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(HOPTS)); } catch {} };

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const MAX_FROZEN = 8;
let A = null;                  
let seq = 0;                   
let S = fresh();
function fresh() { return { snaps: [], frozen: [], tip: null, snapN: 0 }; }
let rootEl = null, listEl = null, footEl = null;
let thumbTimer = 0;


export function stamp(it) { if (it && !it.seq) it.seq = ++seq; return it; }

function onPush(it) {
  stamp(it);
  const L = A && A.log();
  if (!L) return;
  if (!HOPTS.nonLinear) { S.frozen = []; S.tip = null; return; }
  if (L.cursor < L.items.length - 1 && S.tip) {
    S.frozen.push({ ctx: S.tip, log: { items: L.items.slice(), cursor: L.items.length - 1 } });
    capFrozen();
  }
  S.tip = null;
}

function leavingTip() { if (HOPTS.nonLinear && !S.tip && A) { try { S.tip = A.capture(); } catch (e) { console.warn('[history] 拍尖端失败', e); } } }
function capFrozen() { while (S.frozen.length > MAX_FROZEN) S.frozen.shift(); }
const onlyBase = L => L.items.length === 1 && L.items[0].kind === 'snapbase';
const atSnap = () => { const L = A.log(), c = L.items[L.cursor]; return c && c.kind === 'snapbase' ? S.snaps.find(s => s.id === c.snapId) || null : null; };


async function createSnapshot({ name, from = 'full', quiet = false, deferThumb = false } = {}) {
  if (!A.hasDoc()) return null;
  if (A.busy()) { A.status('先结束当前的编辑（变形 / 文字 / 笔画），再建快照'); return null; }
  let got;
  try {
    if (from === 'full') got = { ctx: A.capture(true), src: A.sourceMapNow(), thumb: deferThumb ? null : A.thumb() };
    else got = await A.derivedSnapshot(from);
  } catch (e) { A.status('新建快照没能完成：' + (e && e.message || e)); return null; }
  if (!got) return null;
  const snap = { id: ++S.snapN + '-' + Date.now(), name: name || nextSnapName(), from, ctx: got.ctx, src: got.src, thumb: got.thumb, w: A.docSize().w, h: A.docSize().h };
  S.snaps.push(snap);
  if (deferThumb) scheduleThumb(snap);
  if (!quiet) A.status(`已创建快照「${snap.name}」`);
  render();
  return snap;
}
function nextSnapName() { let n = 1; const has = new Set(S.snaps.map(s => s.name)); while (has.has('快照 ' + n)) n++; return '快照 ' + n; }
function cancelThumb(){clearTimeout(thumbTimer);thumbTimer=0;}
function scheduleThumb(snap) {
  cancelThumb();
  const L0 = A.log(), c0 = L0.items[L0.cursor];
  const snapshot=new WeakRef(snap),item=c0&&new WeakRef(c0);
  thumbTimer = setTimeout(() => {
    thumbTimer=0;
    const snap=snapshot.deref();if(!snap||!S.snaps.includes(snap)||!A.hasDoc())return;
    const L = A.log();
    if (!snap.thumb && L.items[L.cursor] === item?.deref()) { try { snap.thumb = A.thumb(); } catch {} render(); }
  }, 400);
}
function gotoSnapshot(snap) {
  if (!snap || A.busy()) { if (snap) A.status('先结束当前的编辑，再切换历史状态'); return false; }
  const L = A.log();
  if (atSnap() === snap && onlyBase(L)) return true;
  if (!onlyBase(L)) { S.frozen.push({ ctx: A.capture(), log: { items: L.items.slice(), cursor: L.cursor }, pending: true }); capFrozen(); }
  S.tip = null;
  A.applyCtx(snap.ctx, { label: snap.name, snapId: snap.id });
  render();
  return true;
}
async function newSnapshotUI(forceDialog) {
  if (!A.hasDoc()) return;
  const show = forceDialog == null ? HOPTS.showNewSnapDlg : forceDialog;
  if (!show) return createSnapshot({});
  const multi = A.layerCount() > 1;
  const v = await formDialog('新建快照', [
    { key: 'name', label: '名称', type: 'text', value: nextSnapName() },
    { key: 'from', label: '自', type: 'select', value: 'full', options: [['full', '全文档'], ['merged', '合并的图层'], ['layer', '当前图层']] },
    ...(multi ? [] : [{ type: 'note', label: '文档只有一个图层时，三种来源得到的内容相同。' }]),
  ], { okText: '确定' });
  if (!v) return;
  if (v.from === 'layer' && !A.hasLayer()) { A.status('当前没有选中的图层，改用「全文档」'); v.from = 'full'; }
  return createSnapshot({ name: String(v.name || '').trim() || nextSnapName(), from: v.from });
}
function deleteSnapshot(snap) {
  const i = S.snaps.indexOf(snap); if (i < 0) return;
  S.snaps.splice(i, 1);
  const L = A.log();
  for (const it of L.items) if (it.kind === 'snapbase' && it.snapId === snap.id) { it.kind = 'open'; it.label = snap.name; }   
  if (A.sourceItem() === snap) A.resetSource();
  A.status(`已删除快照「${snap.name}」`);
  render();
}
function renameSnapshot(snap, nameEl) {
  const inp = mk('input', { type: 'text', value: snap.name, className: 'hx-rename' });
  nameEl.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const fin = ok => { if (done) return; done = true; const v = inp.value.trim(); if (ok && v && v !== snap.name) { snap.name = v; const L = A.log(); for (const it of L.items) if (it.snapId === snap.id) it.label = v; } render(); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); };
  inp.onblur = () => fin(true);
  inp.onclick = e => e.stopPropagation();
  inp.ondblclick = e => e.stopPropagation();
}


function clickItem(it) {
  const L = A.log(), i = L.items.indexOf(it);
  if (i >= 0) { if (i !== L.cursor) A.jump(i); render(); return; }
  const b = S.frozen.find(f => f.log.items.includes(it)); if (!b) return;
  if (A.busy()) { A.status('先结束当前的编辑，再切换历史状态'); return; }
  S.frozen = S.frozen.filter(f => f !== b);
  if (!onlyBase(L)) { S.frozen.push({ ctx: A.capture(), log: { items: L.items.slice(), cursor: L.cursor }, pending: !HOPTS.nonLinear }); capFrozen(); }
  S.tip = null;
  A.applyCtx(b.ctx);
  const j = A.log().items.indexOf(it);
  if (j >= 0 && j !== A.log().cursor) A.jump(j);
  render();
}

function undoStateChange() {
  const L = A.log();
  if (!onlyBase(L)) return false;
  const b = [...S.frozen].reverse().find(f => f.pending || !HOPTS.nonLinear) || S.frozen[S.frozen.length - 1];
  if (!b) return false;
  clickItem(b.log.items[b.log.cursor]);
  return true;
}
const canUndoStateChange = () => !!A && onlyBase(A.log()) && S.frozen.length > 0;





async function deleteState(it, ask = true) {
  if (!it) return;
  if (it.__snap) { if (ask && !await confirmDialog(`删除快照「${it.__snap.name}」吗？`, { title: '历史记录', okText: '确定' })) return; deleteSnapshot(it.__snap); return; }
  const L = A.log();
  let i = L.items.indexOf(it);
  if (i >= 0 && HOPTS.nonLinear && i > 0 && i < L.items.length - 1) {
    if (ask && !await confirmDialog(`删除状态「${it.label}」吗？（非线性历史：后面的状态保留）`, { title: '历史记录', okText: '确定' })) return;
    if (L.cursor === i) {   
      A.jump(i - 1);
      if (A.log().cursor !== i - 1) { A.status('这一步的撤销数据已不在缓存里，没能删除'); return; }
    }
    const L2 = A.log(), next = L2.items[i + 1];
    next.absorbed = [...(it.absorbed || []), it.kind === 'brush' ? 'brush' : 'doc', ...(next.absorbed || [])];
    L2.items.splice(i, 1);
    if (L2.cursor > i) L2.cursor--;
    A.sync(); render();
    return;
  }
  if (i >= 0) {
    if (ask && !await confirmDialog(`删除状态「${it.label}」${i < L.items.length - 1 ? '及其后面的所有状态' : ''}吗？`, { title: '历史记录', okText: '确定' })) return;
    if (i === 0) { if (L.items.length === 1) { A.status('这是唯一的状态，不能删除'); return; } i = 1; }
    if (L.cursor >= i) A.jump(i - 1);
    const L2 = A.log();
    if (L2.cursor !== i - 1) { A.status('这一步的撤销数据已不在缓存里，没能删除'); return; }
    const gone = L2.items.slice(i);
    const kinds = gone.flatMap(g => [...(g.absorbed || []), g.kind]);
    A.dropRedo({ doc: kinds.filter(k => k === 'doc').length, brush: kinds.filter(k => k === 'brush').length });
    L2.items.length = i;
    S.tip = null;
  } else {
    if (ask && !await confirmDialog(`删除状态「${it.label}」及其后面的状态吗？`, { title: '历史记录', okText: '确定' })) return;
    S.frozen = S.frozen.filter(f => { const k = f.log.items.indexOf(it); if (k < 0) return true; if (f.log.cursor >= k) return false; f.log.items = f.log.items.slice(0, k); return true; });
  }
  A.sync(); render();
}
function deleteCurrent(ask = true) {
  const s = atSnap(), L = A.log();
  if (s && onlyBase(L)) return deleteState({ __snap: s }, ask);
  return deleteState(L.items[L.cursor], ask);
}

function clearHistory() {
  const L = A.log(); const cur = L.items[L.cursor]; if (!cur) return;
  A.resetStacks();
  A.setLog([cur], 0);
  S.frozen = []; S.tip = null;
  A.sync(); render();
  A.status('已清除历史记录');
}
async function newDocFromState(it) {
  if (!A.hasDoc()) return;
  const L = A.log();
  let name;
  if (it && it.__snap) { name = it.__snap.name; if (!gotoSnapshot(it.__snap)) return; }
  else if (it && it !== L.items[L.cursor]) { clickItem(it); name = it.label; }
  else { const s = atSnap(); name = s ? s.name : (L.items[L.cursor] || {}).label || '未标题'; }
  await A.newDocFromState(name);
}
async function snapshotFromItem(it, alt) {
  const L = A.log();
  if (it && it !== L.items[L.cursor]) {
    const i = L.items.indexOf(it); if (i < 0) { A.status('只能从当前这条历史线上的状态建快照'); return; }
    const back = L.cursor; A.jump(i);
    await createSnapshot({ name: nextSnapName() });
    A.jump(back); render(); return;
  }
  return newSnapshotUI(alt ? !HOPTS.showNewSnapDlg : undefined);
}


async function optionsUI() {
  const v = await formDialog('历史记录选项', [
    { key: 'autoFirst', label: '自动创建第一幅快照', type: 'check', value: HOPTS.autoFirst },
    { key: 'autoOnSave', label: '存储时自动创建新快照', type: 'check', value: HOPTS.autoOnSave },
    { key: 'nonLinear', label: '允许非线性历史记录', type: 'check', value: HOPTS.nonLinear },
    { key: 'showNewSnapDlg', label: '默认显示新快照对话框', type: 'check', value: HOPTS.showNewSnapDlg },
    { key: 'visUndo', label: '使图层可见性更改可还原', type: 'check', value: HOPTS.visUndo },
  ], { okText: '确定' });
  if (!v) return;
  const wasNL = HOPTS.nonLinear;
  for (const k of Object.keys(HOPTS)) HOPTS[k] = !!v[k];
  saveOpts();
  if (wasNL && !HOPTS.nonLinear) { S.tip = null; S.frozen = S.frozen.filter(f => f.pending); }   
  render();
}
function menuItems() {
  const has = !!(A && A.hasDoc()), L = has ? A.log() : { items: [], cursor: -1 };
  return [
    { label: '前进一步', sc: A.scOf('edit.redo'), run: () => A.step(false), disabled: !has || L.cursor >= L.items.length - 1 },
    { label: '后退一步', sc: A.scOf('edit.undo'), run: () => { if (!undoStateChange()) A.step(true); }, disabled: !has || (L.cursor <= 0 && !canUndoStateChange()) },
    { sep: true },
    { label: '新建快照…', run: () => newSnapshotUI(true), disabled: !has },
    { label: '删除', run: () => deleteCurrent(false), disabled: !has || (L.items.length <= 1 && !atSnap()) },
    { label: '清除历史记录', run: () => clearHistory(), disabled: !has || (L.items.length <= 1 && !S.frozen.length) },
    { sep: true },
    { label: '新建文档', run: () => newDocFromState(null), disabled: !has },
    { sep: true },
    { label: '历史记录选项…', run: () => optionsUI() },
  ];
}


const ICON_RULES = [
  [/^打开$/, 'ui:folder-open'], [/^新建$/, 'ui:new-file'], [/历史记录艺术画笔/, 'historyArtBrush'], [/历史记录画笔|抹到历史记录/, 'historyBrush'],
  [/混合器画笔/, 'mixerBrush'], [/颜色替换/, 'colorReplace'], [/铅笔/, 'pencil'], [/背景橡皮擦/, 'backgroundEraser'], [/魔术橡皮擦/, 'magicEraser'],
  [/橡皮擦/, 'eraser'], [/仿制图章/, 'cloneStamp'], [/图案图章/, 'patternStamp'], [/污点修复/, 'spotHeal'], [/修复画笔/, 'healBrush'], [/修补/, 'patch'],
  [/内容感知移动/, 'contentMove'], [/红眼/, 'redEye'], [/模糊/, 'blur'], [/锐化/, 'sharpen'], [/涂抹/, 'smudge'], [/减淡/, 'dodge'], [/加深/, 'burn'], [/海绵/, 'sponge'],
  [/渐变/, 'gradient'], [/油漆桶|填充/, 'paintBucket'], [/画笔|描边/, 'brush'], [/裁剪|裁切/, 'crop'], [/切片/, 'slice'], [/画板/, 'artboard'],
  [/文字|文本/, 'typeH'], [/路径|锚点/, 'pen'], [/形状|矩形|椭圆|多边形|直线/, 'rect'], [/注释/, 'note'], [/计数/, 'count'], [/取样点/, 'colorSampler'], [/标尺|拉直/, 'ruler'],
  [/移动|微移|对齐|分布/, 'move'], [/变换|旋转|缩放|翻转|斜切|扭曲|透视|变形/, 'move'], [/选区|选择|取消选择|全部|羽化|扩展|收缩|套索|选框|魔棒/, 'marqueeRect'],
  [/快速蒙版/, 'quickMask'], [/滤镜|液化/, 'ui:sliders-horizontal'], [/图层|复制|编组|合并|拼合|栅格化|蒙版|样式/, 'ui:new-layer'],
];
function stateIcon(it) {
  const lab = String(it.label || '');
  for (const [re, name] of ICON_RULES) if (re.test(lab)) {
    if (name.startsWith('ui:')) { const n = name.slice(3); if (hasUiIcon(n)) return uiIcon(n, 16); }
    else if (hasToolIcon(name)) return toolIcon(name, 16);
  }
  return hasUiIcon('history') ? uiIcon('history', 16) : mk('span');
}
function sourceBox(on, title, onClick, disabled) {
  const b = mk('button', { type: 'button', className: 'hx-src' + (on ? ' on' : ''), title });
  b.setAttribute('aria-label', title); b.setAttribute('aria-pressed', String(!!on));
  if (on && hasToolIcon('historyBrush')) b.append(toolIcon('historyBrush', 14));
  b.disabled = !!disabled;
  b.onclick = e => { e.stopPropagation(); onClick(); };
  return b;
}
function thumbEl(snap) {
  const box = mk('span', { className: 'hx-thumb' });
  const t = snap.thumb;
  if (t && t.width) {
    const cv = mk('canvas'); const k = Math.min(36 / t.width, 28 / t.height);
    cv.width = Math.max(1, Math.round(t.width * k)); cv.height = Math.max(1, Math.round(t.height * k));
    try { cv.getContext('2d').drawImage(t, 0, 0, cv.width, cv.height); } catch {}
    box.append(cv);
  }
  return box;
}
let dragItem = null;
function rowDrag(row, it) {
  row.draggable = true;
  row.addEventListener('dragstart', e => { dragItem = it; try { e.dataTransfer.setData('text/x-psd_editor-hist', '1'); e.dataTransfer.effectAllowed = 'copyMove'; } catch {} });
  row.addEventListener('dragend', () => { dragItem = null; });
}
function contextMenu(e) { e.preventDefault(); A.panels.popup(menuItems(), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); }

export function render() {
  const host = document.querySelector('section.panel[data-panel="history"]');
  if (!host || !A) return;
  if (!rootEl || !host.contains(rootEl)) {
    host.replaceChildren();
    listEl = mk('div', { className: 'hx-list hist-list', id: 'histList' });
    listEl.addEventListener('contextmenu', contextMenu);
    footEl = mk('div', { className: 'hx-foot' });
    rootEl = mk('div', { className: 'hx-panel' }, listEl, footEl);
    host.append(rootEl);
    buildFoot();
  }
  listEl.replaceChildren();
  if (!A.hasDoc()) { listEl.append(mk('div', { className: 'panel-empty', textContent: '打开文档后记录历史' })); syncFoot(); return; }
  const L = A.log(), cur = L.items[L.cursor], snapNow = atSnap(), src = A.sourceItem();
  
  for (const snap of S.snaps) {
    const row = mk('div', { className: 'hx-row hx-snap' + (snapNow === snap ? ' cur' : ''), title: `快照「${snap.name}」（${{ full: '全文档', merged: '合并的图层', layer: '当前图层' }[snap.from] || '全文档'}）· 单击恢复到这个状态 · 双击名称改名` });
    const name = mk('span', { className: 'hx-name', textContent: snap.name });
    row.append(sourceBox(src === snap, '设置历史记录画笔的源：' + snap.name, () => { A.setSource(snap, snap.src, snap.w, snap.h); render(); }), thumbEl(snap), name);
    row.addEventListener('click', () => gotoSnapshot(snap));
    name.addEventListener('dblclick', e => { e.stopPropagation(); renameSnapshot(snap, name); });
    rowDrag(row, { __snap: snap });
    listEl.append(row);
  }
  if (S.snaps.length) listEl.append(mk('div', { className: 'hx-sep' }));
  
  const inCur = new Map(L.items.map((it, i) => [it, i]));
  const all = new Set(L.items);
  for (const f of S.frozen) for (const it of f.log.items) all.add(it);
  const rows = [...all].filter(it => it.kind !== 'snapbase').sort((a, b) => (a.seq || 0) - (b.seq || 0));
  for (const it of rows) {
    const idx = inCur.has(it) ? inCur.get(it) : -1;
    const future = idx >= 0 ? idx > L.cursor : (!HOPTS.nonLinear || !!snapNow);
    const row = mk('div', { className: 'hx-row hist-row' + (it === cur ? ' cur' : future ? ' future' : '') + (idx < 0 ? ' branch' : '') });
    row.title = it.label + (idx < 0 ? '（另一条历史分支）' : '');
    row.append(sourceBox(src === it, '设置历史记录画笔的源：' + it.label, () => { if (idx >= 0) { A.setSourceFromState(idx); render(); } else A.status('先点到这个状态所在的分支，再把它设为源'); }, idx < 0),
      mk('span', { className: 'hx-ic' }, stateIcon(it)), mk('span', { className: 'hx-name', textContent: it.label }));
    row.addEventListener('click', () => clickItem(it));
    rowDrag(row, it);
    listEl.append(row);
  }
  const c = listEl.querySelector('.hx-row.cur'); if (c && c.scrollIntoView) { try { c.scrollIntoView({ block: 'nearest' }); } catch {} }
  syncFoot();
}
let footBtns = {};
function buildFoot() {
  const btn = (key, icon, fallback, title, run, drop) => {
    const b = mk('button', { type: 'button', className: 'hx-fb', title });
    b.append(hasUiIcon(icon) ? uiIcon(icon, 16) : uiIcon(fallback, 16));
    b.onclick = e => run(e);
    b.addEventListener('dragover', e => { if (dragItem) { e.preventDefault(); b.classList.add('hot'); } });
    b.addEventListener('dragleave', () => b.classList.remove('hot'));
    b.addEventListener('drop', e => { e.preventDefault(); b.classList.remove('hot'); const it = dragItem; dragItem = null; if (it) drop(it, e); });
    footBtns[key] = b; return b;
  };
  footEl.append(mk('span', { className: 'grow' }),
    btn('newdoc', 'history-new-doc', 'new-file', '从当前状态创建新文档', () => newDocFromState(null), it => newDocFromState(it)),
    btn('snap', 'history-snapshot', 'new-layer', '创建新快照（按住 Alt 单击：' + '切换是否显示「新建快照」对话框）', e => snapshotFromItem(null, e.altKey), it => it.__snap ? A.status('快照不能再拍成快照') : snapshotFromItem(it)),
    btn('del', 'trash-2', 'trash-2', '删除当前状态（按住 Alt 单击：不询问）', e => deleteCurrent(!e.altKey), it => deleteState(it, false)));
}
function syncFoot() {
  const has = A.hasDoc(), L = A.log();
  if (footBtns.newdoc) footBtns.newdoc.disabled = !has;
  if (footBtns.snap) footBtns.snap.disabled = !has;
  if (footBtns.del) footBtns.del.disabled = !has || (L.items.length <= 1 && !atSnap());
}

const CSS = `
.hx-panel { display: flex; flex-direction: column; height: 100%; min-height: 100px; }
.hx-list { flex: 1; overflow: auto; font-size: 12px; user-select: none; }
.hx-row { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 6px 0 4px; border-bottom: 1px solid var(--ps-line, #2a2a2a); cursor: default; white-space: nowrap; }
.hx-row.hx-snap { min-height: 34px; }
.hx-row.cur { background: var(--ps-sel, #4b4b4b); color: var(--ps-text-hi, #fff); }
.hx-row.future { opacity: .45; }
.hx-row.branch:not(.future) .hx-name { font-style: italic; }
.hx-row .hx-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.hx-src { flex: none; width: 18px; height: 18px; padding: 0; border: 1px solid var(--ps-line-2, #6a6a6a); border-radius: 2px; background: transparent; display: inline-flex; align-items: center; justify-content: center; }
.hx-src.on { background: var(--ps-bg-3, #3a3a3a); }
.hx-src:disabled { opacity: .35; }
.hx-ic { flex: none; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
.hx-thumb { flex: none; width: 38px; height: 30px; display: inline-flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#cfcfcf 0 25%, #fff 0 50%) 0 0/8px 8px; border: 1px solid var(--ps-line, #222); }
.hx-thumb canvas { display: block; }
.hx-sep { height: 0; border-top: 2px solid var(--ps-line, #1c1c1c); }
.hx-rename { flex: 1; min-width: 0; font: inherit; height: 20px; }
.hx-foot { display: flex; align-items: center; gap: 4px; padding: 3px 6px; border-top: 1px solid var(--ps-line, #1c1c1c); flex: none; }
.hx-foot .grow { flex: 1; }
.hx-fb { width: 24px; height: 22px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; border-radius: 3px; }
.hx-fb:hover:not(:disabled), .hx-fb.hot { border-color: var(--ps-line-2, #666); }
.hx-fb:disabled { opacity: .35; }
`;


export const HX = {
  stamp, onPush, leavingTip, render, undoStateChange, canUndoStateChange,
  
  capture: () => S,
  apply: v => { cancelThumb();S = v || fresh(); render(); },
  reset: () => { cancelThumb();S = fresh(); render(); },
  
  async opened() {
    if (!HOPTS.autoFirst || !A || !A.hasDoc()) { render(); return; }
    const snap = await createSnapshot({ name: A.docName(), quiet: true, deferThumb: true });
    if (snap) { A.setSource(snap, snap.src, snap.w, snap.h); render(); }
  },
  
  onSaved() { if (HOPTS.autoOnSave && A && A.hasDoc()) createSnapshot({ name: new Date().toLocaleTimeString('zh-CN', { hour12: false }), quiet: true }); },
  get opts() { return HOPTS; },
  get state() { return S; },
  createSnapshot, gotoSnapshot, deleteSnapshot, deleteState, deleteCurrent, clearHistory, newDocFromState, optionsUI, menuItems, clickItem, newSnapshotUI,
};
export function installHistoryPanel(api) {
  A = api;
  if (!document.getElementById('hxCss')) document.head.append(mk('style', { id: 'hxCss', textContent: CSS }));
  api.panels.setPanelMenu('history', menuItems);
  const host = document.querySelector('section.panel[data-panel="history"]');
  if (host) new MutationObserver(() => { if (!host.querySelector('.hx-panel')) { rootEl = null; render(); } }).observe(host, { childList: true });
  render();
  return HX;
}
