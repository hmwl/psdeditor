





















import * as store from './preset-store.js';
import { registerPresetFormat, openPhotoshopPresets } from './presets-panels.js';
import { photoshopPresetName } from './photoshop-presets.js';
import { actions } from './actions.js';
import { formDialog, confirmDialog, alertDialog, promptDialog } from './dialog.js';
import { parseAtn, writeAtn, cloneDeep, ATN_COLORS } from '../../core/atn.js';
import { encodeOp, decodeStep, stepTitle, descLines, commandToOp, opToCommand, supportedEvents, mk as mkDesc } from '../../core/action-events.js';
import { ACT_ICONS } from './actions-icons.js';

let A = null;                                   
const $ = s => document.querySelector(s);
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);


const S = {
  sets: [],                  
  sel: null,                 
  buttonMode: false,
  rec: null,                 
  playing: null,             
  playOpts: { mode: 'accelerated', pause: 1 },   
  toolRec: false,            
  ready: false,
};
try { const o = JSON.parse(localStorage.getItem('psd_editor:actions-ui') || '{}'); if (o.buttonMode) S.buttonMode = true; if (o.playOpts) Object.assign(S.playOpts, o.playOpts); if (o.toolRec) S.toolRec = true; } catch {}
const saveUi = () => { try { localStorage.setItem('psd_editor:actions-ui', JSON.stringify({ buttonMode: S.buttonMode, playOpts: S.playOpts, toolRec: S.toolRec })); } catch {} };




const PRIV = { psd_editorToolStroke: 'toolStroke', psd_editorConditional: 'conditional' };
const privStep = (event, name, p) => ({ idType: 'TEXT', event, name, desc: mkDesc('null', { json: JSON.stringify(p) }) });
function privDecode(step) {
  const op = PRIV[String(step && step.event || '')]; if (!op) return null;
  try { return { op, p: JSON.parse(step.desc && step.desc.json || '{}') }; } catch { return null; }
}
const COND = [
  ['modeRGB', '文档模式为 RGB', i => i.mode === 3], ['modeCMYK', '文档模式为 CMYK', i => i.mode === 4], ['modeGray', '文档模式为灰度', i => i.mode === 1],
  ['modeLab', '文档模式为 Lab', i => i.mode === 9], ['modeBitmap', '文档模式为位图', i => i.mode === 0], ['modeIndexed', '文档模式为索引颜色', i => i.mode === 2],
  ['depth8', '文档深度为 8 位', i => i.depth === 8], ['depth16', '文档深度为 16 位', i => i.depth === 16], ['depth32', '文档深度为 32 位', i => i.depth === 32],
  ['landscape', '文档是横向的', i => i.w > i.h], ['portrait', '文档是纵向的', i => i.h > i.w], ['square', '文档是正方形的', i => i.w === i.h],
  ['hasSel', '文档有选区', i => i.hasSel], ['hasLayers', '文档有多个图层', i => i.layers > 1], ['hasAlpha', '文档有 Alpha 通道', i => i.alpha],
  ['lyBg', '图层是背景', i => !!(i.layer && i.layer.bg)], ['lyVisible', '图层是可见的', i => !!(i.layer && i.layer.visible)],
  ['lyPixels', '图层有像素', i => !!(i.layer && i.layer.pixels)], ['lyMask', '图层有像素蒙版', i => !!(i.layer && i.layer.mask)],
  ['lyVMask', '图层有矢量蒙版', i => !!(i.layer && i.layer.vmask)], ['lyFx', '图层有效果', i => !!(i.layer && i.layer.fx)],
  ['lyClip', '图层是剪贴蒙版', i => !!(i.layer && i.layer.clip)], ['lyText', '图层是文字图层', i => !!(i.layer && i.layer.text)],
  ['lyShape', '图层是形状图层', i => !!(i.layer && i.layer.shape)], ['lySmart', '图层是智能对象', i => !!(i.layer && i.layer.smart)],
  ['lyGroup', '图层是组', i => !!(i.layer && i.layer.group)], ['lyAdjust', '图层是调整图层', i => !!(i.layer && i.layer.adjust)],
];
const condLabel = k => (COND.find(c => c[0] === k) || [0, k])[1];

const setAt = i => S.sets[i] && S.sets[i].set;
const actAt = (s, a) => { const st = setAt(s); return st && st.actions[a]; };
const cmdLabels = new Map();                    
function labelOf(id) { return cmdLabels.get(id) || id; }


let selfWrite = 0;
const saveTimers = new Map();
function persist(i) {
  const e = S.sets[i]; if (!e) return;
  clearTimeout(saveTimers.get(e.id));
  saveTimers.set(e.id, setTimeout(async () => {
    saveTimers.delete(e.id);
    selfWrite++;
    try { await store.addPresets('actions', [{ id: e.id, name: e.set.name, atn: writeAtn(e.set) }]); }
    catch (err) { console.warn('[actions] 存储动作组失败', err); }
    finally { selfWrite--; }
  }, 120));
}
async function persistOrder() {
  selfWrite++;
  try { await store.reorderPresets('actions', S.sets.map(e => e.id)); } catch {} finally { selfWrite--; }
}
async function reload() {
  let items = [];
  try { items = await store.listPresets('actions'); } catch {}
  const next = [];
  for (const it of items) {
    try { next.push({ id: it.id, set: parseAtn(it.atn) }); }
    catch (e) { console.warn('[actions] 动作组读不出来：', it.name, e); }
  }
  S.sets = next;
  if (S.sel && !setAt(S.sel.s)) S.sel = null;
  render();
}
async function addSet(set, opt = {}) {
  selfWrite++;
  let out;
  try { out = await store.addPresets('actions', [{ name: set.name, atn: writeAtn(set) }]); } finally { selfWrite--; }
  S.sets.push({ id: out[0].id, set });
  if (!opt.keepSel) S.sel = { s: S.sets.length - 1 };
  render();
  return S.sets.length - 1;
}
async function removeSet(i) {
  const e = S.sets[i]; if (!e) return;
  S.sets.splice(i, 1);
  selfWrite++;
  try { await store.removePreset('actions', e.id); } finally { selfWrite--; }
}


const decodeCache = new WeakMap();
function decoded(step) {
  if (decodeCache.has(step)) return decodeCache.get(step);
  let d = privDecode(step); if (!d) { try { d = decodeStep(step); } catch { d = null; } }
  decodeCache.set(step, d);
  return d;
}
const NO_DIALOG_OPS = new Set(['selectAll', 'deselect', 'invertSel', 'deleteLayer', 'mergeDown', 'mergeVisible', 'flatten', 'visible', 'selectLayer',
  'rotateCanvas', 'flipCanvas', 'revealAll', 'invert', 'desaturate', 'equalize', 'workPath', 'color', 'stop', 'move', 'selectShape', 'toolStroke', 'conditional']);

function stepHasDialog(step) {
  const d = decoded(step);
  if (!d) return !!step.desc;                                   
  if (d.op === 'command') return (d.p.dialogs || []).length > 0 || !!d.p.menu;
  if (d.op === 'filter') return !!(d.p.params && Object.keys(d.p.params).length);
  if (d.op === 'adjust') return !['invert', 'desaturate'].includes(d.p.type);
  return !NO_DIALOG_OPS.has(d.op);
}
const TOOL_ZH = { brush: '画笔工具', pencil: '铅笔工具', eraser: '橡皮擦工具', mixerBrush: '混合器画笔工具', cloneStamp: '仿制图章工具', patternStamp: '图案图章工具',
  historyBrush: '历史记录画笔工具', historyArtBrush: '历史记录艺术画笔工具', blur: '模糊工具', sharpen: '锐化工具', smudge: '涂抹工具', dodge: '减淡工具', burn: '加深工具', sponge: '海绵工具',
  colorReplace: '颜色替换工具', backgroundEraser: '背景橡皮擦工具', spotHeal: '污点修复画笔工具', healBrush: '修复画笔工具', adjBrush: '调整画笔工具' };
const title = step => {
  const d = privDecode(step);
  if (d && d.op === 'toolStroke') return (TOOL_ZH[d.p.tool] || '工具') + `（${(d.p.pts || []).length} 个点）`;
  if (d && d.op === 'conditional') return `条件：如果「${condLabel(d.p.cond)}」则播放「${d.p.then || '无'}」，否则播放「${d.p.else || '无'}」`;
  try { return stepTitle(step); } catch { return step.name || String(step.event); }
};


const expanded = new Set();          
function img(src, cls = '') { const i = mk('img', { src, className: 'act-ic ' + cls, draggable: false }); return i; }
function checkCell(state, onClick, titleText) {
  const c = mk('span', { className: 'act-col act-chk' + (state === 'partial' ? ' partial' : ''), title: titleText || '切换项目开 / 关（回放时是否执行）' });
  if (state) c.append(A.uiIcon('check', 12));
  c.addEventListener('click', e => { e.stopPropagation(); onClick(e); });
  return c;
}
function dialogCell(state, onClick, can = true) {
  const c = mk('span', { className: 'act-col act-dlg' + (can ? '' : ' none'), title: can ? '切换对话框开 / 关（回放到这一步时是否弹出对话框）' : '' });
  if (can && state) c.append(img(state === 'partial' ? ACT_ICONS.dialogPartial : ACT_ICONS.dialog));
  if (can) c.addEventListener('click', e => { e.stopPropagation(); onClick(e); });
  return c;
}
const tri = (open, onClick) => {
  const t = mk('span', { className: 'act-tri' });
  t.append(A.uiIcon(open ? 'chevron-down' : 'chevron-right', 9));
  t.addEventListener('click', e => { e.stopPropagation(); onClick(e); });
  return t;
};
const isSel = (s, a, st) => S.sel && S.sel.s === s && (S.sel.a ?? -1) === (a ?? -1) && (S.sel.st ?? -1) === (st ?? -1);
function aggr(list, f) { if (!list.length) return true; const on = list.filter(f).length; return on === list.length ? true : on === 0 ? false : 'partial'; }

function render() {
  const host = $('.panel[data-panel="actions"]'); if (!host || !A) return;
  let root = host.querySelector('.act-panel');
  if (!root) {
    host.innerHTML = '';
    root = mk('div', { className: 'act-panel' });
    root.append(mk('div', { className: 'act-list', tabIndex: 0 }), mk('div', { className: 'act-foot' }));
    host.append(root);
    buildFoot(root.querySelector('.act-foot'));
    root.querySelector('.act-list').addEventListener('keydown', onListKey);
  }
  const list = root.querySelector('.act-list');
  const scroll = list.scrollTop;
  list.innerHTML = '';
  list.classList.toggle('buttons', S.buttonMode);
  root.querySelector('.act-foot').hidden = S.buttonMode;
  if (S.buttonMode) { renderButtons(list); return; }
  if (!S.sets.length) list.append(mk('div', { className: 'act-empty', textContent: '还没有动作。点底部的「创建新组」「创建新动作」开始记录，或从面板菜单「载入动作…」载入 Photoshop 导出的 .atn。' }));
  const playingAt = S.playing && S.playing.cur;
  S.sets.forEach(({ set }, s) => {
    const allSteps = set.actions.flatMap(a => a.steps);
    const row = mk('div', { className: 'act-row act-set' + (isSel(s) ? ' on' : '') });
    row.dataset.attr = 'act-set';
    row.append(checkCell(aggr(allSteps, x => x.enabled !== false), () => { const v = aggr(allSteps, x => x.enabled !== false) !== true; allSteps.forEach(x => { x.enabled = v; }); persist(s); render(); }),
      dialogCell(aggr(allSteps.filter(stepHasDialog), x => x.dialog) , () => { const L = allSteps.filter(stepHasDialog); const v = aggr(L, x => x.dialog) !== true; L.forEach(x => { x.dialog = v; }); persist(s); render(); }, allSteps.some(stepHasDialog)),
      tri(set.expanded, () => { set.expanded = !set.expanded; persist(s); render(); }),
      img(ACT_ICONS.newSet, 'folder'), mk('span', { className: 'act-name', textContent: photoshopPresetName(set.name) }));
    row.addEventListener('click', () => { S.sel = { s }; render(); });
    row.addEventListener('dblclick', () => renameSet(s));
    dnd(row, { s });
    list.append(row);
    if (!set.expanded) return;
    set.actions.forEach((act, a) => {
      const r = mk('div', { className: 'act-row act-action' + (isSel(s, a) ? ' on' : '') + (S.rec && S.rec.s === s && S.rec.a === a ? ' recording' : '') });
      r.dataset.attr = 'act-action';
      const col = ATN_COLORS[act.color] && ATN_COLORS[act.color][2];
      if (col) r.style.setProperty('--act-color', col);
      r.append(checkCell(aggr(act.steps, x => x.enabled !== false), () => { const v = aggr(act.steps, x => x.enabled !== false) !== true; act.steps.forEach(x => { x.enabled = v; }); persist(s); render(); }),
        dialogCell(aggr(act.steps.filter(stepHasDialog), x => x.dialog), () => { const L = act.steps.filter(stepHasDialog); const v = aggr(L, x => x.dialog) !== true; L.forEach(x => { x.dialog = v; }); persist(s); render(); }, act.steps.some(stepHasDialog)),
        mk('span', { className: 'act-ind' }), tri(act.expanded, () => { act.expanded = !act.expanded; persist(s); render(); }),
        mk('span', { className: 'act-name', textContent: photoshopPresetName(act.name) }));
      if (act.fkey) r.append(mk('span', { className: 'act-key', textContent: fkeyText(act) }));
      r.addEventListener('click', () => { S.sel = { s, a }; render(); });
      r.addEventListener('dblclick', () => actionOptions(s, a));
      dnd(r, { s, a });
      list.append(r);
      if (!act.expanded) return;
      act.steps.forEach((step, st) => {
        const ok = !!decoded(step), key = `${s}:${a}:${st}`, open = expanded.has(key);
        const lines = step.desc ? descLines(step.desc) : [];
        const sr = mk('div', { className: 'act-row act-step' + (isSel(s, a, st) ? ' on' : '') + (ok ? '' : ' unsupported')
          + (playingAt && playingAt.s === s && playingAt.a === a && playingAt.st === st ? ' playing' : '') });
        sr.dataset.attr = 'act-step';
        if (!ok) sr.title = `本编辑器回放不了这一步（事件「${String(step.event).trim()}」），回放时会跳过；存储动作时原样保留`;
        sr.append(checkCell(step.enabled !== false, e => {
          if (e.altKey) { act.steps.forEach((x, k) => { x.enabled = k === st; }); }    
          else step.enabled = step.enabled === false;
          persist(s); render();
        }), dialogCell(!!step.dialog, () => { step.dialog = !step.dialog; persist(s); render(); }, stepHasDialog(step)),
        mk('span', { className: 'act-ind' }), mk('span', { className: 'act-ind' }));
        if (lines.length) sr.append(tri(open, () => { if (open) expanded.delete(key); else expanded.add(key); render(); }));
        else sr.append(mk('span', { className: 'act-tri' }));
        sr.append(mk('span', { className: 'act-name', textContent: title(step) }));
        sr.addEventListener('click', () => { S.sel = { s, a, st }; render(); });
        sr.addEventListener('dblclick', () => { S.sel = { s, a, st }; reRecordStep(); });
        dnd(sr, { s, a, st });
        list.append(sr);
        if (open) for (const ln of lines.slice(0, 80)) {
          const lr = mk('div', { className: 'act-row act-param' + (ok ? '' : ' unsupported'), textContent: ln.text });
          lr.style.paddingLeft = (92 + ln.depth * 12) + 'px';
          list.append(lr);
        }
      });
    });
  });
  list.scrollTop = scroll;
  syncFoot();
}

let dragSel = null;
function dnd(row, at) {
  row.draggable = !S.playing && !S.rec;
  row.addEventListener('dragstart', e => { dragSel = at; try { e.dataTransfer.setData('text/x-psd_editor-action', '1'); e.dataTransfer.effectAllowed = 'copyMove'; } catch {} });
  row.addEventListener('dragend', () => { dragSel = null; for (const x of document.querySelectorAll('.act-row.drop-at')) x.classList.remove('drop-at'); });
  row.addEventListener('dragover', e => { if (dragSel && canDrop(dragSel, at)) { e.preventDefault(); row.classList.add('drop-at'); } });
  row.addEventListener('dragleave', () => row.classList.remove('drop-at'));
  row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('drop-at'); const from = dragSel; dragSel = null; if (from) dropMove(from, at, e.altKey); });
}
const level = x => x.st != null ? 2 : x.a != null ? 1 : 0;
function canDrop(from, to) { const lf = level(from), lt = level(to); return lf === 0 ? lt === 0 : lf === 1 ? lt <= 1 : lt >= 1; }
function dropMove(from, to, copy) {
  if (!canDrop(from, to)) return;
  const lf = level(from), lt = level(to);
  if (lf === 0) {
    if (from.s === to.s) return;
    if (copy) { const c = cloneDeep(setAt(from.s)); c.name += ' 拷贝'; addSet(c); return; }
    const [e] = S.sets.splice(from.s, 1); S.sets.splice(to.s, 0, e); S.sel = { s: to.s }; persistOrder(); render(); return;
  }
  if (lf === 1) {
    const src = setAt(from.s), dst = setAt(to.s); if (!src || !dst) return;
    let item = src.actions[from.a]; if (!item) return;
    if (copy) { item = cloneDeep(item); item.name += ' 拷贝'; item.fkey = 0; } else src.actions.splice(from.a, 1);
    let at = lt === 0 ? dst.actions.length : to.a;
    if (!copy && src === dst && from.a < at) at--;
    dst.actions.splice(Math.max(0, at), 0, item); dst.expanded = true;
    S.sel = { s: to.s, a: Math.max(0, at) };
    persist(from.s); if (to.s !== from.s) persist(to.s); render(); return;
  }
  const srcAct = actAt(from.s, from.a), dstAct = actAt(to.s, to.a); if (!srcAct || !dstAct) return;
  let step = srcAct.steps[from.st]; if (!step) return;
  if (copy) step = cloneDeep(step); else srcAct.steps.splice(from.st, 1);
  let at = lt === 1 ? dstAct.steps.length : to.st;
  if (!copy && srcAct === dstAct && from.st < at) at--;
  dstAct.steps.splice(Math.max(0, at), 0, step); dstAct.expanded = true;
  S.sel = { s: to.s, a: to.a, st: Math.max(0, at) };
  persist(from.s); if (to.s !== from.s) persist(to.s); render();
}
function renderButtons(list) {
  if (!S.sets.some(e => e.set.actions.length)) list.append(mk('div', { className: 'act-empty', textContent: '按钮模式：没有动作。关掉面板菜单里的「按钮模式」来新建或载入动作。' }));
  S.sets.forEach(({ set }, s) => set.actions.forEach((act, a) => {
    const b = mk('button', { type: 'button', className: 'act-btn', textContent: photoshopPresetName(act.name) + (act.fkey ? '  ' + fkeyText(act) : '') });
    b.dataset.attr = 'act-button';
    const col = ATN_COLORS[act.color] && ATN_COLORS[act.color][2];
    if (col) b.style.background = col;
    b.addEventListener('click', () => { if (!S.playing) play({ s, a }); });
    list.append(b);
  }));
}
function fkeyText(act) { return (act.shift ? '⇧' : '') + (act.cmd ? '⌘' : '') + 'F' + act.fkey; }
let footBtns = null;
function buildFoot(f) {
  const B = (icon, tip, run, attr) => { const b = mk('button', { type: 'button', className: 'lf-btn act-fb', title: tip }); b.dataset.attr = attr; b.append(img(icon)); b.addEventListener('click', run); f.append(b); return b; };
  footBtns = {
    stop: B(ACT_ICONS.stop, '停止播放 / 记录', () => stopAll(), 'act-stop'),
    rec: B(ACT_ICONS.record, '开始记录', () => startRecording(), 'act-record'),
    play: B(ACT_ICONS.play, '播放选定的动作（按住 Ctrl / ⌘ 单击：只播放选中的这一步）', e => playFoot(e), 'act-play'),
  };
  f.append(mk('span', { className: 'grow' }));
  footBtns.newSet = B(ACT_ICONS.newSet, '创建新组', () => newSetUI(), 'act-new-set');
  footBtns.newAct = B(ACT_ICONS.newAction, '创建新动作', () => newActionUI(), 'act-new-action');
  footBtns.del = B(ACT_ICONS.trash, '删除（按住 Alt 单击：不询问）', e => deleteSelected(!e.altKey), 'act-delete');
  
  const dropOn = (b, fn) => { b.addEventListener('dragover', e => { if (dragSel) { e.preventDefault(); b.classList.add('hot'); } }); b.addEventListener('dragleave', () => b.classList.remove('hot'));
    b.addEventListener('drop', e => { e.preventDefault(); b.classList.remove('hot'); const d = dragSel; dragSel = null; if (d) fn(d); }); };
  dropOn(footBtns.del, d => { S.sel = d; deleteSelected(false); });
  dropOn(footBtns.newAct, d => { S.sel = d; duplicateSelected(); });
  dropOn(footBtns.newSet, d => { if (d.a == null) { S.sel = d; duplicateSelected(); } });
}
function syncFoot() {
  if (!footBtns) return;
  footBtns.stop.disabled = !S.rec && !S.playing;
  footBtns.rec.disabled = !!S.rec || !!S.playing || !(S.sel && S.sel.a != null);
  footBtns.rec.querySelector('img').src = S.rec ? ACT_ICONS.recordOn : ACT_ICONS.record;
  footBtns.rec.classList.toggle('on', !!S.rec);
  footBtns.play.disabled = !!S.playing || !!S.rec || !S.sel || !A.hasDoc();
  footBtns.del.disabled = !S.sel || !!S.playing;
  footBtns.newAct.disabled = !!S.playing || !!S.rec;
}
function onListKey(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); e.stopPropagation(); deleteSelected(); }
}


async function newSetUI() {
  const name = await promptDialog('名称：', '组 ' + (S.sets.length + 1), { title: '新建组', label: '名称' });
  if (name == null) return;
  await addSet({ version: 16, name: name || ('组 ' + (S.sets.length + 1)), expanded: true, actions: [] });
}
async function ensureSetIndex() {
  if (S.sel && setAt(S.sel.s)) return S.sel.s;
  if (S.sets.length) return 0;
  return addSet({ version: 16, name: '组 1', expanded: true, actions: [] }, { keepSel: true });
}

async function newActionUI() {
  const s0 = await ensureSetIndex();
  const n = S.sets.reduce((m, e) => m + e.set.actions.length, 0) + 1;
  const v = await formDialog('新建动作', [
    { key: 'name', label: '名称', type: 'text', value: '动作 ' + n },
    { key: 'set', label: '组', type: 'select', value: String(s0), options: S.sets.map((e, i) => [String(i), e.set.name]) },
    ...fkeyFields({ fkey: 0, shift: false, cmd: false, color: 0 }),
  ], { okText: '记录' });
  if (!v) return;
  const s = +v.set, set = setAt(s); if (!set) return;
  set.actions.push({ fkey: +v.fkey || 0, shift: !!v.shift, cmd: !!v.cmd, color: +v.color || 0, name: v.name || ('动作 ' + n), expanded: true, steps: [] });
  set.expanded = true;
  S.sel = { s, a: set.actions.length - 1 };
  persist(s);
  startRecording();
}
const FKEYS = [['0', '无'], ...Array.from({ length: 11 }, (_, i) => [String(i + 2), 'F' + (i + 2)])];
function fkeyFields(act) {
  return [
    { key: 'fkey', label: '功能键', type: 'select', value: String(act.fkey || 0), options: FKEYS },
    { key: 'shift', label: 'Shift', type: 'check', value: !!act.shift, showIf: o => o.fkey !== '0' },
    { key: 'cmd', label: 'Command / Ctrl', type: 'check', value: !!act.cmd, showIf: o => o.fkey !== '0' },
    { key: 'color', label: '颜色', type: 'select', value: String(act.color || 0), options: ATN_COLORS.map((c, i) => [String(i), c[1]]) },
  ];
}
function fkeyTaken(fkey, shift, cmd, except) {
  for (const [s, e] of S.sets.entries()) for (const [a, act] of e.set.actions.entries()) {
    if (except && except.s === s && except.a === a) continue;
    if (act.fkey === fkey && !!act.shift === !!shift && !!act.cmd === !!cmd) return act.name;
  }
  return null;
}
async function actionOptions(s = S.sel && S.sel.s, a = S.sel && S.sel.a) {
  const act = actAt(s, a); if (!act) return;
  const v = await formDialog('动作选项', [{ key: 'name', label: '名称', type: 'text', value: act.name }, ...fkeyFields(act),
    { type: 'note', label: 'PS 不许用 F1；功能键组合已被别的动作占用时，原来那个动作的功能键会被清掉（PS 同）。' }]);
  if (!v) return;
  const fk = +v.fkey || 0;
  if (fk) {
    const other = fkeyTaken(fk, v.shift, v.cmd, { s, a });
    if (other) for (const e of S.sets) for (const x of e.set.actions) if (x !== act && x.fkey === fk && !!x.shift === !!v.shift && !!x.cmd === !!v.cmd) x.fkey = 0;
  }
  Object.assign(act, { name: v.name || act.name, fkey: fk, shift: fk ? !!v.shift : false, cmd: fk ? !!v.cmd : false, color: +v.color || 0 });
  S.sets.forEach((_, i) => persist(i));
  render();
}
async function renameSet(s) {
  const set = setAt(s); if (!set) return;
  const v = await promptDialog('名称：', set.name, { title: '组选项', label: '名称' });
  if (v == null || !v) return;
  set.name = v; persist(s); render();
}

function playFoot(e) {
  const sel = S.sel;
  if ((e.metaKey || e.ctrlKey) && sel && sel.st != null) return playOne(sel);
  return play();
}
async function playOne(sel) {
  const act = actAt(sel.s, sel.a), step = act && act.steps[sel.st]; if (!step || S.playing) return;
  const d = decoded(step); if (!d) { A.status('本编辑器回放不了这一步'); return; }
  S.playing = { stop: false, cur: sel, log: [] }; render();
  try { await runStep(step, d, !!step.dialog, sel); A.status(`已播放「${title(step)}」`); }
  catch (err) { if (!(err && err.userStop)) await alertDialog(`「${title(step)}」没能完成：${err && err.message || err}`, { title: '动作' }); }
  finally { S.playing = null; render(); }
}
async function deleteSelected(ask = true) {
  const sel = S.sel; if (!sel || S.playing) return;
  const set = setAt(sel.s); if (!set) return;
  if (sel.st != null) {
    const act = set.actions[sel.a];
    if (ask && !await confirmDialog(`要删除步骤「${title(act.steps[sel.st])}」吗？`, { title: '删除', okText: '确定', danger: true })) return;
    act.steps.splice(sel.st, 1);
    S.sel = act.steps.length ? { s: sel.s, a: sel.a, st: Math.min(sel.st, act.steps.length - 1) } : { s: sel.s, a: sel.a };
    persist(sel.s);
  } else if (sel.a != null) {
    if (ask && !await confirmDialog(`要删除动作「${set.actions[sel.a].name}」吗？`, { title: '删除', okText: '确定', danger: true })) return;
    if (S.rec && S.rec.s === sel.s && S.rec.a === sel.a) stopRecording();
    set.actions.splice(sel.a, 1);
    S.sel = { s: sel.s };
    persist(sel.s);
  } else {
    if (ask && !await confirmDialog(`要删除组「${set.name}」及其中的全部动作吗？`, { title: '删除', okText: '确定', danger: true })) return;
    if (S.rec && S.rec.s === sel.s) stopRecording();
    await removeSet(sel.s);
    S.sel = S.sets.length ? { s: Math.min(sel.s, S.sets.length - 1) } : null;
  }
  render();
}
function duplicateSelected() {
  const sel = S.sel; if (!sel) return;
  const set = setAt(sel.s); if (!set) return;
  if (sel.st != null) { const act = set.actions[sel.a]; act.steps.splice(sel.st + 1, 0, cloneDeep(act.steps[sel.st])); S.sel = { ...sel, st: sel.st + 1 }; persist(sel.s); }
  else if (sel.a != null) { const c = cloneDeep(set.actions[sel.a]); c.name += ' 拷贝'; c.fkey = 0; set.actions.splice(sel.a + 1, 0, c); S.sel = { s: sel.s, a: sel.a + 1 }; persist(sel.s); }
  else { const c = cloneDeep(set); c.name += ' 拷贝'; for (const x of c.actions) x.fkey = 0; addSet(c); return; }
  render();
}
function moveSelected(dir) {
  const sel = S.sel; if (!sel) return;
  const set = setAt(sel.s); if (!set) return;
  const arr = sel.st != null ? set.actions[sel.a].steps : sel.a != null ? set.actions : null;
  const k = sel.st != null ? sel.st : sel.a;
  if (!arr) { const j = sel.s + dir; if (j < 0 || j >= S.sets.length) return; [S.sets[sel.s], S.sets[j]] = [S.sets[j], S.sets[sel.s]]; S.sel = { s: j }; persistOrder(); render(); return; }
  const j = k + dir; if (j < 0 || j >= arr.length) return;
  [arr[k], arr[j]] = [arr[j], arr[k]];
  S.sel = sel.st != null ? { ...sel, st: j } : { ...sel, a: j };
  persist(sel.s); render();
}


function startRecording() {
  const sel = S.sel; if (!sel || sel.a == null || S.playing) return false;
  const act = actAt(sel.s, sel.a); if (!act) return false;
  
  S.rec = { s: sel.s, a: sel.a, at: sel.st != null ? sel.st + 1 : act.steps.length, pending: null };
  act.expanded = true; setAt(sel.s).expanded = true;
  A.status(`正在记录「${act.name}」：之后的编辑操作都会录成步骤；点「停止」结束`);
  render();
  return true;
}
function stopRecording() {
  if (!S.rec) return;
  flushPending(false);
  const act = actAt(S.rec.s, S.rec.a);
  S.rec = null;
  A.status(act ? `已停止记录「${act.name}」（${act.steps.length} 步）` : '已停止记录');
  render();
}
function stopAll() { if (S.playing) S.playing.stop = true; stopRecording(); }
function recordingOn() { return !!(S.rec && !S.playing && !S.rec.replace); }
function pushStep(step, coalesce) {
  const R = S.rec; const act = actAt(R.s, R.a); if (!act) { S.rec = null; return; }
  const full = { expanded: false, enabled: true, dialog: false, dialogOptions: 0, ...step };
  const prev = R.at > 0 ? act.steps[R.at - 1] : null;
  if (coalesce && prev && prev.__recAt && Date.now() - prev.__recAt < 4000) {
    const merged = coalesce(prev);
    if (merged) { act.steps[R.at - 1] = { ...full, ...merged, __recAt: Date.now() }; decodeCache.delete(prev); persist(R.s); render(); return; }
  }
  full.__recAt = Date.now();
  act.steps.splice(R.at, 0, full);
  R.at++;
  S.sel = { s: R.s, a: R.a, st: R.at - 1 };
  persist(R.s);
  render();
}

export function record(op, p = {}) {
  if (S.rec && S.rec.replace) { replaceRecorded(op, p); return; }
  if (!recordingOn()) return;
  const R = S.rec;
  if (R.pending) R.pending.covered = true;
  let step;
  if (op === 'toolStroke') { if (!S.toolRec) return; step = privStep('psd_editorToolStroke', 'PSD Editor Tool Stroke', p); pushStep(step); return; }
  try { step = encodeOp(op, p); } catch (e) { console.warn('[actions] 录不下这一步', op, e); return; }
  if (!step) return;
  let coalesce = null;
  if (op === 'layerProps') coalesce = prev => { const d = decoded(prev); return d && d.op === 'layerProps' && Object.keys(d.p).join() === Object.keys(p).join() ? step : null; };
  if (op === 'move') coalesce = prev => { const d = decoded(prev); return d && d.op === 'move' ? encodeOp('move', { dx: d.p.dx + (p.dx || 0), dy: d.p.dy + (p.dy || 0) }) : null; };
  pushStep(step, coalesce);
}

const NOT_RECORDED = /^(window\.|view\.|help\.|tool\.|edit\.(undo|redo|stepBackward|stepForward|toggleLastState|preferences|keyboardShortcuts|search|purge\.)|file\.(open|openAs|new|close|closeAll|closeOthers|save|saveAs|saveCopy|exportAs|quickExportPng|batch|imageProcessor|pdfPresentation|contactSheet|cropAndStraighten|print|printOne|info)$|actions\.|filter\.last|select\.deselectLayers)/;
function onRun(id) {
  if (!recordingOn() || NOT_RECORDED.test(id)) return;
  flushPending(false);
  S.rec.pending = { id, dialogs: [], covered: false };
}
function onDialog(o, v) {
  const P = S.rec && S.rec.pending; if (!P || !recordingOn()) return;
  if (o && o.alertOnly) return;                                    
  P.dialogs.push(v == null ? null : (o && o.form ? JSON.parse(JSON.stringify(v)) : v));
}

export function onHist() {
  const P = S.rec && S.rec.pending; if (!P || !recordingOn()) return;
  setTimeout(() => { if (S.rec && S.rec.pending === P) flushPending(true); }, 0);   
}
function flushPending(commit) {
  const R = S.rec; const P = R && R.pending; if (!P) return;
  R.pending = null;
  if (!commit || P.covered) return;               
  const known = commandToOp(P.id, P.dialogs);
  if (known && known.cancelled) return;
  const step = known ? encodeOp(known.op, known.p) : encodeOp('command', { cmd: P.id, label: labelOf(P.id), dialogs: P.dialogs });
  if (step) pushStep(step);
}


async function reRecordStep() {
  const sel = S.sel; if (!sel || sel.st == null || S.playing || S.rec) return;
  const act = actAt(sel.s, sel.a), step = act && act.steps[sel.st];
  if (!step || !stepHasDialog(step)) { A.status('这一步没有对话框，不用再次记录'); return; }
  const d = decoded(step); if (!d) { A.status('这一步本编辑器回放不了，也就不能再次记录'); return; }
  if (!A.hasDoc()) { A.status('先打开一份文档：再次记录要在文档上把这一步重做一遍'); return; }
  S.rec = { s: sel.s, a: sel.a, at: sel.st + 1, pending: null, replace: { st: sel.st, got: false } };
  S.playing = { stop: false, cur: { ...sel }, log: [] };
  try { await runStep(step, d, true); }
  catch (e) { A.status('再次记录没做成：' + (e && e.message || e)); }
  finally { S.playing = null; S.rec = null; render(); }
}
function replaceRecorded(op, p) {
  const R = S.rec; const act = actAt(R.s, R.a); if (!act) return;
  const old = act.steps[R.replace.st]; const step = encodeOp(op, p); if (!step) return;
  act.steps[R.replace.st] = { ...old, idType: step.idType, event: step.event, name: step.name, desc: step.desc };
  R.replace.got = true; persist(R.s);
}


const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runCommand(id, answers) {
  if (!actions.has(id)) throw new Error(`没有「${labelOf(id)}」这条命令`);
  if (!actions.enabled(id)) { const w = actions.why(id); throw new Error(`命令「${labelOf(id)}」当前不可用` + (w ? `（${w}）` : '')); }
  const prev = window.__fpDialog;
  if (answers) {
    const q = answers.slice();
    window.__fpDialog = o => {
      if (q.length) { const v = q.shift(); return v === undefined ? null : v; }
      
      if (o.form) return Object.fromEntries((o.fields || []).filter(f => f.key).map(f => [f.key, f.value]));
      if (o.input) return o.input.value;
      return o.choice ? 'ok' : true;
    };
  }
  try {
    A.clearLastRun();
    actions.run(id);
    const pr = A.lastRun();
    if (pr) await pr;
    await A.settle();
  } finally { if (answers) window.__fpDialog = prev; }
}

async function runConditional(p, ctx = {}) {
  const c = COND.find(x => x[0] === p.cond);
  if (!c) throw new Error('不认识的条件：' + p.cond);
  const info = A.condInfo ? A.condInfo() : {};
  const name = c[2](info) ? p.then : p.else;
  if (!name) return;
  const s = ctx.s != null ? ctx.s : (S.playing && S.playing.cur ? S.playing.cur.s : 0);
  const set = setAt(s); const a = set ? set.actions.findIndex(x => x.name === name) : -1;
  if (a < 0) throw new Error(`条件动作要播放的「${name}」不在这个组里`);
  if ((ctx.depth || 0) > 8) throw new Error('条件动作嵌套太深（可能互相调用）');
  for (const [k, st] of set.actions[a].steps.entries()) {
    if (st.enabled === false) continue;
    if (S.playing && S.playing.stop) throw Object.assign(new Error('stop'), { userStop: true });
    const d = decoded(st);
    if (!d) {
      const where = `「${set.actions[a].name}」第 ${k + 1} 步「${title(st)}」`;
      if (ctx.skipped) ctx.skipped.push(where);
      if (ctx.strict) throw new Error('本编辑器不支持：' + where);
      continue;
    }
    await runStep(st, d, !ctx.noDialogs && !!st.dialog, { ...ctx, s, a, st: k, depth: (ctx.depth || 0) + 1 });
  }
}
async function runStep(step, d, withDialog, ctx) {
  const { op, p } = d;
  if (op === 'stop') {
    const msg = p.message || '（停止）';
    if (p.allowContinue) { if (!await confirmDialog(msg, { title: '信息', okText: '继续', cancelText: '停止' })) throw Object.assign(new Error('stop'), { userStop: true }); }
    else { await alertDialog(msg, { title: '信息', okText: '停止' }); throw Object.assign(new Error('stop'), { userStop: true }); }
    return;
  }
  if (op === 'command') { await runCommand(p.cmd, withDialog || p.menu ? null : (p.dialogs || [])); return; }
  if (op === 'conditional') { await runConditional(p, ctx); return; }
  if (A.exec[op]) { await A.exec[op](p, withDialog); await A.settle(); return; }
  const c = opToCommand(op, p);
  if (c) { await runCommand(c.id, withDialog ? null : c.answers); return; }
  throw new Error('本编辑器不支持这一步');
}

export async function play(target = S.sel, opt = {}) {
  if (!target || S.playing) return { ok: false, status: 'failed', skipped: [], errors: [S.playing ? '动作正在播放' : '没有选中动作'] };
  if (!A.hasDoc()) { A.status('先打开一份文档再播放动作'); return { ok: false, status: 'failed', skipped: [], errors: ['没有打开的文档'] }; }
  const set = setAt(target.s); if (!set) return { ok: false, status: 'failed', skipped: [], errors: ['动作组不存在'] };
  const runs = [];
  if (target.a == null) set.actions.forEach((act, a) => act.steps.forEach((st, k) => runs.push({ s: target.s, a, st: k })));
  else { const act = set.actions[target.a]; if (!act) return { ok: false, status: 'failed', skipped: [], errors: ['动作不存在'] }; for (let k = target.st ?? 0; k < act.steps.length; k++) runs.push({ s: target.s, a: target.a, st: k }); }
  
  if (opt.strict) {
    const unsupported = [], visited = new Set();
    const inspect = r => {
      const key = `${r.s}:${r.a}:${r.st}`; if (visited.has(key)) return; visited.add(key);
      const act = actAt(r.s, r.a), st = act?.steps[r.st]; if (!st || st.enabled === false) return;
      const d = decoded(st), where = `「${act.name}」第 ${r.st + 1} 步「${title(st)}」`;
      if (!d) { unsupported.push(where); return; }
      if (d.op === 'conditional') {
        if (!COND.some(c => c[0] === d.p.cond)) { unsupported.push(where); return; }
        for (const name of [d.p.then, d.p.else].filter(Boolean)) {
          const a = set.actions.findIndex(x => x.name === name);
          if (a < 0) unsupported.push(`${where}引用不存在的动作「${name}」`);
          else set.actions[a].steps.forEach((_, k) => inspect({ s: r.s, a, st: k }));
        }
      } else if (d.op !== 'stop' && !A.exec[d.op]) {
        const cmd = d.op === 'command' ? d.p.cmd : opToCommand(d.op, d.p)?.id;
        if (!cmd || !actions.has(cmd)) unsupported.push(where);
      }
    };
    runs.forEach(inspect);
    if (unsupported.length) return { ok: false, status: 'failed', skipped: unsupported, errors: ['动作含不支持的步骤，未执行：' + unsupported.join('；')] };
  }
  S.playing = { stop: false, cur: null, log: [] };
  const skipped = [], errors = [];
  render();
  let ok = true;
  try {
    for (const r of runs) {
      if (S.playing.stop) { ok = false; break; }
      const act = actAt(r.s, r.a), step = act.steps[r.st];
      if (step.enabled === false) continue;
      S.playing.cur = r;
      const d = decoded(step);
      const where = `「${act.name}」第 ${r.st + 1} 步「${title(step)}」`;
      if (!d) { skipped.push(where); continue; }
      if (S.playOpts.mode !== 'accelerated' || !opt.quiet) render();
      try { await runStep(step, d, !opt.noDialogs && !!step.dialog, { ...r, strict: !!opt.strict, noDialogs: !!opt.noDialogs, skipped }); }
      catch (e) {
        if (e && e.userStop) { ok = false; S.sel = { s: r.s, a: r.a, st: Math.min(r.st + 1, act.steps.length - 1) }; break; }
        const msg = `${where}没能完成：${e && e.message || e}`;
        errors.push(msg);
        if (opt.strict || (opt.onError && opt.onError(msg) === 'stop')) { ok = false; break; }
        if (opt.onError) continue;
        
        if (!await confirmDialog(msg + '\n\n继续播放后面的步骤吗？', { title: '动作', okText: '继续', cancelText: '停止' })) { ok = false; break; }
      }
      if (S.playOpts.mode === 'step') { render(); await sleep(350); }
      else if (S.playOpts.mode === 'pause') { render(); await sleep(Math.max(0, +S.playOpts.pause || 0) * 1000); }
    }
  } finally {
    S.playing = null;
    render();
  }
  const status = !ok ? 'failed' : skipped.length || errors.length ? 'partial' : 'complete';
  ok = status === 'complete';
  if (!opt.quiet) {
    if (skipped.length) await alertDialog(`下列步骤本编辑器回放不了，已跳过：\n` + skipped.join('\n'), { title: '动作' });
    A.status(status === 'complete' ? '动作播放完成' : status === 'partial' ? `动作部分完成（跳过 ${skipped.length} 步，${errors.length} 条错误）` : '动作已停止');
  }
  return { ok, status, skipped, errors };
}


function recTargetForInsert() {
  
  if (S.rec) return { s: S.rec.s, a: S.rec.a, at: S.rec.at, rec: true };
  const sel = S.sel; if (!sel || sel.a == null) return null;
  const act = actAt(sel.s, sel.a); if (!act) return null;
  return { s: sel.s, a: sel.a, at: sel.st != null ? sel.st + 1 : act.steps.length };
}
function insertStep(step) {
  const t = recTargetForInsert(); if (!t) { A.status('先选中一个动作（或其中一步），再插入'); return false; }
  const act = actAt(t.s, t.a);
  act.steps.splice(t.at, 0, { expanded: false, enabled: true, dialog: false, dialogOptions: 0, ...step });
  if (t.rec) S.rec.at++;
  act.expanded = true;
  S.sel = { s: t.s, a: t.a, st: t.at };
  persist(t.s); render();
  return true;
}
async function insertMenuItem() {
  if (!recTargetForInsert()) { A.status('先选中一个动作，再插入菜单项目'); return; }
  const opts = [...cmdLabels.entries()].filter(([id]) => actions.has(id) && !NOT_RECORDED.test(id) && !/^file\.(batch|droplet)/.test(id)).map(([id, l]) => [id, l]);
  const v = await formDialog('插入菜单项目', [
    { key: 'cmd', label: '菜单项', type: 'select', value: opts[0] && opts[0][0], options: opts },
    { type: 'note', label: 'PS 里这一步是「回放时执行这条菜单命令」：带对话框的命令回放时会弹出对话框，由你当场填写。' },
  ]);
  if (!v || !v.cmd) return;
  insertStep(encodeOp('command', { cmd: v.cmd, label: labelOf(v.cmd), menu: true }));
}
async function insertStop() {
  if (!recTargetForInsert()) { A.status('先选中一个动作，再插入停止'); return; }
  const v = await formDialog('记录停止', [
    { key: 'message', label: '信息', type: 'textarea', value: '' },
    { key: 'allowContinue', label: '允许继续', type: 'check', value: false },
  ]);
  if (!v) return;
  insertStep(encodeOp('stop', { message: v.message || '', allowContinue: !!v.allowContinue }));
}

async function insertConditional() {
  const t = recTargetForInsert(); if (!t) { A.status('先选中一个动作，再插入条件'); return; }
  const set = setAt(t.s); const names = set.actions.filter((x, i) => i !== t.a).map(x => [x.name, x.name]);
  const v = await formDialog('条件动作', [
    { key: 'cond', label: '如果当前', type: 'select', value: 'modeRGB', options: COND.map(c => [c[0], c[1]]) },
    { key: 'then', label: '则播放动作', type: 'select', value: names[0] ? names[0][0] : '', options: [['', '无'], ...names] },
    { key: 'else', label: '否则播放动作', type: 'select', value: '', options: [['', '无'], ...names] },
    { type: 'note', label: names.length ? '只能选同一组里的动作（PS 同）。' : '这个组里还没有别的动作可以播放：先在同一组里建好要调用的动作。' },
  ], { okText: '确定' });
  if (!v) return;
  insertStep(privStep('psd_editorConditional', 'PSD Editor Conditional', { cond: v.cond, then: v.then || '', else: v.else || '' }));
}
function insertPath() {
  const subs = A.currentPath && A.currentPath();
  if (!subs || !subs.length) { A.status('插入路径：先在路径面板里选中一条路径（工作路径或存储的路径）'); return; }
  insertStep(encodeOp('workPath', { subpaths: subs }));
}


function pickFiles(accept, multiple = true) {
  return new Promise(res => {
    const inp = mk('input', { type: 'file', accept, multiple });
    inp.onchange = () => res([...(inp.files || [])]);
    inp.click();
  });
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const a = mk('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function loadAtnBytes(u8, name = '') {
  const set = parseAtn(u8);
  if (!set.name) set.name = String(name).replace(/\.atn$/i, '') || '组';
  return set;
}
async function loadActions(replace = false) {
  const files = await pickFiles('.atn', true);
  if (!files.length) return;
  const report = [];
  const loaded = [];
  for (const f of files) {
    try { loaded.push(loadAtnBytes(new Uint8Array(await f.arrayBuffer()), f.name)); }
    catch (e) { report.push(`${f.name}：读不出来（${e && e.message || e}）`); }
  }
  if (replace && loaded.length) { while (S.sets.length) await removeSet(S.sets.length - 1); }
  for (const set of loaded) {
    await addSet(set);
    const all = set.actions.flatMap(a => a.steps), bad = all.filter(st => !decoded(st)).length;
    report.push(`${set.name}：${set.actions.length} 个动作、${all.length} 步` + (bad ? `（${bad} 步本编辑器回放不了，已灰显）` : ''));
  }
  A.status(report.join('；'));
  if (report.some(r => /读不出来/.test(r))) await alertDialog(report.join('\n'), { title: '载入动作' });
}
function saveActions() {
  const s = S.sel ? S.sel.s : (S.sets.length === 1 ? 0 : -1);
  const set = setAt(s);
  if (!set) { A.status('存储动作：先选中一个动作组（PS 也是按组存储）'); return; }
  const clean = cloneDeep(set);
  for (const a of clean.actions) for (const st of a.steps) delete st.__recAt;
  download((set.name || '动作').replace(/[\\/:*?"<>|]/g, '_') + '.atn', writeAtn(clean));
  A.status(`已存储动作组「${set.name}」（.atn，Photoshop 可直接载入）`);
}
async function clearAll() {
  if (!S.sets.length) return;
  if (!await confirmDialog('删除全部动作吗？', { title: '清除全部动作', okText: '确定', danger: true })) return;
  stopRecording();
  while (S.sets.length) await removeSet(S.sets.length - 1);
  S.sel = null; render();
}
async function resetActions() {
  
  if (!await confirmDialog('用一个空的「默认动作」组替换当前全部动作吗？\n（Photoshop 自带的默认动作是 Adobe 的素材，本编辑器不内置；可以从 Photoshop 里存储成 .atn 再载入）', { title: '复位动作', okText: '确定', danger: true })) return;
  stopRecording();
  while (S.sets.length) await removeSet(S.sets.length - 1);
  await addSet({ version: 16, name: '默认动作', expanded: true, actions: [] });
}
async function playbackOptions() {
  const v = await formDialog('回放选项', [
    { key: 'mode', label: '性能', type: 'select', value: S.playOpts.mode, options: [['accelerated', '加速'], ['step', '逐步'], ['pause', '暂停']] },
    { key: 'pause', label: '暂停', type: 'number', value: S.playOpts.pause, min: 0, max: 60, unit: '秒', showIf: o => o.mode === 'pause' },
  ]);
  if (!v) return;
  S.playOpts = { mode: v.mode, pause: Math.max(0, Math.min(60, +v.pause || 0)) };
  saveUi();
}
async function showSupported() {
  const rows = supportedEvents();
  await alertDialog(rows.map(([ev, t]) => `${String(ev).trim().padEnd(14)} ${t}`).join('\n'), { title: '本编辑器能回放的动作事件' });
}

function panelMenu() {
  const sel = S.sel, hasSel = !!sel, hasAct = !!(sel && sel.a != null), hasStep = !!(sel && sel.st != null);
  const step = hasStep ? actAt(sel.s, sel.a).steps[sel.st] : null;
  return [
    { label: '按钮模式', checked: S.buttonMode, run: () => { S.buttonMode = !S.buttonMode; saveUi(); render(); } },
    { sep: true },
    { label: '新建动作…', run: () => newActionUI(), disabled: !!S.rec || !!S.playing },
    { label: '新建组…', run: () => newSetUI() },
    { label: '复制', run: () => duplicateSelected(), disabled: !hasSel || !!S.playing },
    { label: '删除', run: () => deleteSelected(), disabled: !hasSel || !!S.playing },
    { label: '播放', run: () => play(), disabled: !hasSel || !!S.playing || !!S.rec || !A.hasDoc() },
    { sep: true },
    { label: '开始记录', run: () => startRecording(), disabled: !hasAct || !!S.rec || !!S.playing },
    { label: '再次记录…', run: () => reRecordStep(), disabled: !step || !stepHasDialog(step) || !!S.rec || !!S.playing },
    { label: '插入菜单项目…', run: () => insertMenuItem(), disabled: !hasAct && !S.rec },
    { label: '插入停止…', run: () => insertStop(), disabled: !hasAct && !S.rec },
    { label: '插入条件…', run: () => insertConditional(), disabled: !hasAct && !S.rec },
    { label: '插入路径', run: () => insertPath(), disabled: (!hasAct && !S.rec) || !(A.currentPath && A.currentPath()) },
    { label: '允许工具记录', checked: S.toolRec, run: () => { S.toolRec = !S.toolRec; saveUi(); A.status(S.toolRec ? '允许工具记录：记录时画笔 / 橡皮擦 / 图章等工具的每一笔也会录成步骤' : '已关闭工具记录'); } },
    { sep: true },
    { label: '动作选项…', run: () => (hasAct ? actionOptions() : sel && renameSet(sel.s)), disabled: !hasSel },
    { label: '回放选项…', run: () => playbackOptions() },
    { sep: true },
    { label: '清除全部动作', run: () => clearAll(), disabled: !S.sets.length || !!S.playing },
    { label: '复位动作', run: () => resetActions(), disabled: !!S.playing },
    { label: '载入动作…', run: () => loadActions(false) },
    { label: 'PS 自带预设…', run: () => openPhotoshopPresets('actions'), disabled: !!S.playing },
    { label: '替换动作…', run: () => loadActions(true), disabled: !!S.playing },
    { label: '存储动作…', run: () => saveActions(), disabled: !S.sets.length },
    { sep: true },
    ...['命令', '画框', '图像效果', 'LAB - 黑白技术', '制作', '流星', '文字效果', '纹理', '视频动作'].map(n => ({ label: n, disabled: true,
      why: `「${n}」是 Photoshop 自带的动作库（Adobe 的素材），本编辑器不内置；可在 Photoshop 里载入后「存储动作…」成 .atn，再用「载入动作…」导入` })),
    { sep: true },
    { label: '本编辑器支持的动作事件…', run: () => showSupported() },
  ];
}


function onKey(e) {
  const m = /^F(\d{1,2})$/.exec(e.key || ''); if (!m) return;
  const fk = +m[1]; if (fk < 2 || fk > 12) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') || document.querySelector('dialog[open]')) return;
  const cmd = e.metaKey || e.ctrlKey;
  for (const [s, en] of S.sets.entries()) for (const [a, act] of en.set.actions.entries()) {
    if (act.fkey === fk && !!act.shift === e.shiftKey && !!act.cmd === cmd && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      if (!S.playing && !S.rec) play({ s, a });
      return;
    }
  }
}


const CSS = `
.act-panel { display: flex; flex-direction: column; height: 100%; min-height: 120px; }
.act-list { flex: 1; overflow: auto; outline: none; font-size: 12px; user-select: none; }
.act-list.buttons { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 3px; padding: 4px; }
.act-btn { flex: 1 1 46%; min-width: 90px; height: 22px; font-size: 12px; text-align: left; padding: 0 8px; border: 1px solid var(--ps-line, #1c1c1c); border-radius: 3px; background: var(--ps-bg-3, #3a3a3a); color: var(--ps-text, #ddd); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.act-empty { padding: 12px; color: var(--ps-muted, #9a9a9a); line-height: 1.6; }
.act-row { display: flex; align-items: center; height: 22px; border-bottom: 1px solid var(--ps-line, #262626); white-space: nowrap; cursor: default; }
.act-row.on { background: var(--ps-sel, #4b4b4b); }
.act-action { background: linear-gradient(90deg, transparent 40px, color-mix(in srgb, var(--act-color, transparent) 28%, transparent) 40px); }
.act-action.on { background: var(--ps-sel, #4b4b4b); }
.act-action.recording .act-name::after { content: ' ●'; color: #e03b2f; }
.act-step.playing { box-shadow: inset 3px 0 0 #2d8ceb; }
.act-step.unsupported .act-name, .act-param.unsupported { color: var(--ps-muted, #8a8a8a); opacity: .6; font-style: italic; }
.act-param { height: 18px; font-size: 11px; color: var(--ps-muted, #b0b0b0); border-bottom: none; }
.act-col { flex: none; width: 20px; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--ps-line, #262626); }
.act-chk.partial svg { color: #e0443a; }
.act-dlg.none { cursor: default; }
.act-ic { width: 16px; height: 16px; flex: none; }
.act-dlg .act-ic { width: 13px; height: 13px; }
.act-ind { width: 12px; flex: none; }
.act-tri { width: 14px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.act-row .act-ic.folder { margin-right: 4px; }
.act-name { flex: 1; overflow: hidden; text-overflow: ellipsis; padding-left: 2px; }
.act-key { flex: none; padding: 0 6px; color: var(--ps-muted, #a0a0a0); font-size: 11px; }
.act-foot { display: flex; align-items: center; gap: 2px; padding: 3px 6px; border-top: 1px solid var(--ps-line, #1c1c1c); flex: none; }
.act-foot .grow { flex: 1; }
.act-foot .act-fb:disabled { opacity: .35; }
.act-foot .act-fb img { width: 16px; height: 16px; display: block; }
.act-foot .act-fb.hot { outline: 1px solid var(--ps-line-2, #777); }
.act-row.drop-at { box-shadow: inset 0 2px 0 #2d8ceb; }
`;


export async function installActions(api) {
  A = api;
  if (!document.getElementById('actCss')) document.head.append(mk('style', { id: 'actCss', textContent: CSS }));
  api.panels.setPanelMenu('actions', panelMenu);
  
  try {
    const { MENUS } = await import('./menu.js');
    const walk = (list, path) => { for (const it of list) { if (it.sep) continue; if (it.sub) walk(it.sub, path.concat(it.label)); else if (it.action && !cmdLabels.has(it.action)) cmdLabels.set(it.action, path.concat(String(it.label).replace(/…$/, '')).join(' › ')); } };
    for (const m of MENUS) walk(m.items, [m.label]);
  } catch {}
  
  actions.onRun(onRun);
  window.__fpDialogTap = onDialog;
  addEventListener('keydown', onKey, true);
  
  registerPresetFormat('actions', {
    ext: 'atn', label: '动作组',
    read: (u8, name) => [loadAtnBytes(u8, name)],
    write: items => writeAtn(items[0] && items[0].atn ? parseAtn(items[0].atn) : (items[0] || { name: '组 1', actions: [] })),
    import: async sets => { for (const set of sets) await addSet(set); },
  });
  store.onPresetsChange(ev => { if (ev.kind === 'actions' && !selfWrite) reload(); });
  await reload();
  S.ready = true;
  
  const host = $('.panel[data-panel="actions"]');
  if (host) new MutationObserver(() => { if (!host.querySelector('.act-panel')) render(); }).observe(host, { childList: true });
  return actionsApi;
}

export const actionsApi = {
  S, record, onHist, play, playOne, render, insertConditional, toolRecording: () => !!S.toolRec && recordingOn(), reload, startRecording, stopRecording, stopAll, insertStep, loadAtnBytes,
  addSet, removeSet, saveActions, loadActions, playbackOptions, panelMenu, runCommand,
  get sets() { return S.sets.map(e => e.set); },
  
  select(sel) { S.sel = sel; render(); },
  find(setName, actName) {
    const s = S.sets.findIndex(e => e.set.name === setName); if (s < 0) return null;
    if (actName == null) return { s };
    const a = S.sets[s].set.actions.findIndex(x => x.name === actName);
    return a < 0 ? null : { s, a };
  },
  atnOf(s) { const set = setAt(s); return set ? writeAtn(set) : null; },
  isDecodable: step => !!decoded(step),
  
  async exec(step, withDialog = false) {
    const d = decoded(step);
    if (!d) throw new Error(`本编辑器不支持这个动作事件：${title(step)}（${step.event}）`);
    await runStep(step, d, withDialog, {});
  },
};
if (typeof window !== 'undefined') window.__psd_editorActions = actionsApi;
