

















import { actions } from './actions.js';
import { shortcuts } from './shortcuts.js';
import { toolIcon, uiIcon, psToolIcons, hasToolIcon } from './icons.js';
import { get as getPreference } from './preferences.js';



export const TOOL_ICONS = psToolIcons;

export const TOOL_GROUPS = [
  { id: 'move', key: 'V', tools: [
    { id: 'move', label: '移动工具', impl: 'docTool:move', btnId: 'toolMove' },
    { id: 'artboard', label: '画板工具', impl: 'docTool:artboard' },
  ] },
  { id: 'marquee', key: 'M', tools: [
    { id: 'marqueeRect', label: '矩形选框工具', impl: 'docTool:selRect', btnId: 'toolSelRect' },
    { id: 'marqueeEllipse', label: '椭圆选框工具', impl: 'docTool:selEllipse', btnId: 'toolSelEllipse' },
    { id: 'marqueeRow', label: '单行选框工具', impl: 'docTool:selRow' },
    { id: 'marqueeCol', label: '单列选框工具', impl: 'docTool:selCol' },
  ] },
  { id: 'lasso', key: 'L', tools: [
    { id: 'lasso', label: '套索工具', impl: 'docTool:lasso', btnId: 'toolLasso' },
    { id: 'lassoPoly', label: '多边形套索工具', impl: 'docTool:lassoPoly' },
    { id: 'lassoMagnetic', label: '磁性套索工具', impl: 'docTool:lassoMagnetic' },
    

    { id: 'selectionBrush', label: '选区画笔工具', impl: 'docTool:selectionBrush' },
  ] },
  { id: 'wand', key: 'W', tools: [
    { id: 'objectSelect', label: '对象选择工具', impl: 'docTool:objectSelect' },
    { id: 'quickSelect', label: '快速选择工具', impl: 'docTool:quickSelect' },
    { id: 'magicWand', label: '魔棒工具', impl: 'docTool:wand', btnId: 'toolWand' },
  ] },
  { id: 'crop', key: 'C', tools: [
    { id: 'crop', label: '裁剪工具', impl: 'docTool:crop', btnId: 'toolCrop' }, { id: 'cropPerspective', label: '透视裁剪工具', impl: 'docTool:cropPerspective' }, { id: 'slice', label: '切片工具', impl: 'docTool:slice' }, { id: 'sliceSelect', label: '切片选择工具', impl: 'docTool:sliceSelect' },
  ] },
  { id: 'frame', key: 'K', tools: [{ id: 'frame', label: '图框工具', impl: 'docTool:frame' }] },
  { id: 'eyedropper', key: 'I', tools: [
    { id: 'eyedropper', label: '吸管工具', impl: 'docTool:eyedropper' }, { id: 'colorSampler', label: '颜色取样器工具', impl: 'docTool:colorSampler' },
    { id: 'ruler', label: '标尺工具', impl: 'docTool:ruler' }, { id: 'note', label: '注释工具', impl: 'docTool:note' }, { id: 'count', label: '计数工具', impl: 'docTool:count' },
  ] },
  { id: 'heal', key: 'J', tools: [
    { id: 'spotHeal', label: '污点修复画笔工具', impl: 'docTool:spotHeal' },
    { id: 'remove', label: '移除工具', disabledReason: '不做（永久）：移除工具依赖 AI 模型，本编辑器不接 AI；可用污点修复、修补或内容识别填充。' },
    { id: 'healBrush', label: '修复画笔工具', impl: 'docTool:healBrush' },
    { id: 'patch', label: '修补工具', impl: 'docTool:patch' },
    { id: 'contentMove', label: '内容感知移动工具', impl: 'docTool:contentMove' },
    { id: 'redEye', label: '红眼工具', impl: 'docTool:redEye' },
  ] },
  { id: 'brush', key: 'B', tools: [
    { id: 'brush', label: '画笔工具', impl: 'docTool:brush', btnId: 'toolBrush' }, { id: 'pencil', label: '铅笔工具', impl: 'docTool:pencil' },
    { id: 'colorReplace', label: '颜色替换工具', impl: 'docTool:colorReplace' }, { id: 'mixerBrush', label: '混合器画笔工具', impl: 'docTool:mixerBrush' },
    
    { id: 'adjBrush', label: '调整画笔工具', impl: 'docTool:adjBrush' },
  ] },
  { id: 'stamp', key: 'S', tools: [{ id: 'cloneStamp', label: '仿制图章工具', impl: 'docTool:cloneStamp' }, { id: 'patternStamp', label: '图案图章工具', impl: 'docTool:patternStamp' }] },
  { id: 'history', key: 'Y', tools: [{ id: 'historyBrush', label: '历史记录画笔工具', impl: 'docTool:historyBrush' }, { id: 'historyArtBrush', label: '历史记录艺术画笔工具', impl: 'docTool:historyArtBrush' }] },
  { id: 'eraser', key: 'E', tools: [
    { id: 'eraser', label: '橡皮擦工具', impl: 'docTool:eraser', btnId: 'toolEraser' }, { id: 'backgroundEraser', label: '背景橡皮擦工具', impl: 'docTool:backgroundEraser' }, { id: 'magicEraser', label: '魔术橡皮擦工具', impl: 'docTool:magicEraser' },
  ] },
  { id: 'gradient', key: 'G', tools: [
    { id: 'gradient', label: '渐变工具', impl: 'docTool:gradient' },
    { id: 'paintBucket', label: '油漆桶工具', impl: 'docTool:bucket' },
  ] },
  { id: 'blur', tools: [{ id: 'blur', label: '模糊工具', impl: 'docTool:blur' }, { id: 'sharpen', label: '锐化工具', impl: 'docTool:sharpen' }, { id: 'smudge', label: '涂抹工具', impl: 'docTool:smudge' }] },
  { id: 'dodge', key: 'O', tools: [{ id: 'dodge', label: '减淡工具', impl: 'docTool:dodge' }, { id: 'burn', label: '加深工具', impl: 'docTool:burn' }, { id: 'sponge', label: '海绵工具', impl: 'docTool:sponge' }] },
  { id: 'pen', key: 'P', tools: [
    { id: 'pen', label: '钢笔工具', impl: 'docTool:pen' },
    { id: 'freeformPen', label: '自由钢笔工具', impl: 'docTool:penFree' },
    { id: 'curvaturePen', label: '弯度钢笔工具', impl: 'docTool:penCurvature' },
    { id: 'addAnchor', label: '添加锚点工具', impl: 'docTool:addAnchor', nokey: true },
    { id: 'deleteAnchor', label: '删除锚点工具', impl: 'docTool:deleteAnchor', nokey: true },
    { id: 'convertPoint', label: '转换点工具', impl: 'docTool:convertPoint', nokey: true },
  ] },
  { id: 'type', key: 'T', tools: [
    { id: 'typeH', label: '横排文字工具', impl: 'docTool:text', btnId: 'toolTextH' }, { id: 'typeV', label: '直排文字工具', impl: 'docTool:textVertical' }, { id: 'typeMaskV', label: '直排文字蒙版工具', impl: 'docTool:textMaskVertical' }, { id: 'typeMaskH', label: '横排文字蒙版工具', impl: 'docTool:textMask' },
  ] },
  { id: 'pathSelect', key: 'A', tools: [
    { id: 'pathSelect', label: '路径选择工具', impl: 'docTool:pathSelect' },
    { id: 'directSelect', label: '直接选择工具', impl: 'docTool:path', btnId: 'toolPath' },
  ] },
  { id: 'shape', key: 'U', tools: [
    { id: 'rect', label: '矩形工具', impl: 'docTool:shape' }, { id: 'ellipse', label: '椭圆工具', impl: 'docTool:shape' },
    { id: 'triangle', label: '三角形工具', impl: 'docTool:shape' }, { id: 'polygon', label: '多边形工具', impl: 'docTool:shape' },
    { id: 'line', label: '直线工具', impl: 'docTool:shape' },
    { id: 'customShape', label: '自定形状工具', impl: 'docTool:shape' },
  ] },
  { id: 'hand', key: 'H', tools: [{ id: 'hand', label: '抓手工具', impl: 'docTool:hand' }, { id: 'rotateView', label: '旋转视图工具', impl: 'docTool:rotateView', key: 'R' }] },
  { id: 'zoom', key: 'Z', tools: [{ id: 'zoom', label: '缩放工具', impl: 'docTool:zoom' }] },
];

export function svgIcon(name, size = 18) {
  

  const t = byId && byId.get(name);
  if (t && t.iconFallback && !hasToolIcon(name)) return toolIcon(t.iconFallback, size);
  return toolIcon(name, size);
}

const SCREEN_MODE_ICON = { standard: 'screenMode', fullMenu: 'screenModeMenu', full: 'screenModeFull' };
const SCREEN_MODES = ['standard', 'fullMenu', 'full'];
const SCREEN_MODE_LABEL = { standard: '标准屏幕模式', fullMenu: '带有菜单栏的全屏模式', full: '全屏模式' };
const SCREEN_MODE_TITLE = {
  standard: '标准屏幕模式（F 切换到下一档，⇧F 上一档；右键 / 长按选择）',
  fullMenu: '带有菜单栏的全屏模式（F 切换到下一档，⇧F 上一档；右键 / 长按选择）',
  full: '全屏模式（F 切换到下一档，⇧F 上一档；右键 / 长按选择）',
};
let screenModeBtn = null;

export function setScreenMode(mode) {
  state.screenMode = SCREEN_MODE_ICON[mode] ? mode : 'standard';
  if (!screenModeBtn) return;
  screenModeBtn.title = SCREEN_MODE_TITLE[state.screenMode];
  screenModeBtn.replaceChildren(svgIcon(SCREEN_MODE_ICON[state.screenMode]));
}


const state = { current: null, groupCurrent: new Map(), enabled: false, fg: '#000000', bg: '#ffffff', quickMask: false, quickMaskInverted: false, screenMode: 'standard' };
const byId = new Map();
for (const g of TOOL_GROUPS) for (const t of g.tools) { t.group = g; byId.set(t.id, t); }


let keyOverrides = {};
const keyOf = t => !t ? '' : (Object.prototype.hasOwnProperty.call(keyOverrides, t.id) ? keyOverrides[t.id]
  : (!t.nokey ? (t.key || (t.group && t.group.key) || '') : ''));

let shiftSwitch = true;
export function setShiftSwitch(on) { shiftSwitch = !!on; }
export function defaultKeyOf(id) { const t = byId.get(id); return t && !t.nokey ? (t.key || (t.group && t.group.key) || '') : ''; }
export function keyOfTool(id) { return keyOf(byId.get(id)); }






const LAYOUT_KEY = 'psd_editor.toolbarLayout';
const defaultLayout = () => ({ groups: TOOL_GROUPS.map(g => g.tools.map(t => t.id)), extras: [], hide: {} });
function normalizeLayout(raw) {
  const L = { groups: [], extras: [], hide: {} };
  if (!raw || !Array.isArray(raw.groups)) return defaultLayout();
  const seen = new Set();
  const take = id => { if (typeof id !== 'string' || !byId.has(id) || seen.has(id)) return false; seen.add(id); return true; };
  for (const g of raw.groups) { if (!Array.isArray(g)) continue; const ids = g.filter(take); if (ids.length) L.groups.push(ids); }
  if (Array.isArray(raw.extras)) L.extras = raw.extras.filter(take);
  if (raw.hide && typeof raw.hide === 'object') for (const k of ['more', 'swatches', 'quickMask', 'screenMode']) if (raw.hide[k]) L.hide[k] = true;
  for (const g of TOOL_GROUPS) for (const t of g.tools) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    
    const sib = g.tools.find(x => x.id !== t.id && L.groups.some(a => a.includes(x.id)));
    const host = sib && L.groups.find(a => a.includes(sib.id));
    if (host) host.push(t.id); else L.extras.push(t.id);
  }
  return L;
}
function loadLayout() {
  try { const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); if (v) return normalizeLayout(v); } catch {}
  return defaultLayout();
}
function saveLayout() {
  try {
    if (JSON.stringify(layout) === JSON.stringify(defaultLayout())) localStorage.removeItem(LAYOUT_KEY);
    else localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}
let layout = loadLayout();

let dgroups = [];
const dgroupOf = new Map();       
function buildDisplayGroups() {
  dgroups = layout.groups.map(ids => ({ id: ids[0], tools: ids.map(id => byId.get(id)) }));
  dgroupOf.clear();
  for (const dg of dgroups) {
    for (const t of dg.tools) dgroupOf.set(t.id, dg);
    const keep = state.groupCurrent.get(dg.id);
    if (!keep || !dg.tools.some(t => t.id === keep)) state.groupCurrent.set(dg.id, dg.tools[0].id);
  }
}
buildDisplayGroups();

const lastByKey = new Map();

let rootEl = null, onSelectFn = () => {}, statusFn = () => {}, colorsFn = null, beforeSelect = null;
let dblFn = null, qmOptionsFn = null, presetFn = null;

export function onDblSelect(fn) { dblFn = fn; }
export function onBeforeSelect(fn) { beforeSelect = fn; }

export function onQuickMaskOptions(fn) { qmOptionsFn = fn; }

export function onPresetPicker(fn) { presetFn = fn; }
const $ = s => document.querySelector(s);

export function tool(id) { return byId.get(id) || null; }
export function current() { return state.current; }
export function onSelect(fn) { onSelectFn = fn; }
export function onStatus(fn) { statusFn = fn; }

export function setColors(fg, bg) { state.fg = fg; state.bg = bg; syncSwatches(); }
export function onColorClick(fn) { colorsFn = fn; }
export function setEnabled(on) { state.enabled = !!on; sync(); }

export function setQuickMask(on, inverted) { state.quickMask = !!on; if (inverted != null) state.quickMaskInverted = !!inverted; sync(); }

function implOf(t) { return t && t.impl ? t.impl : null; }
export function isImplemented(id) { return !!implOf(byId.get(id)); }


export function select(id, { silent = false } = {}) {
  const t = byId.get(id); if (!t) return false;
  if (!implOf(t)) {
    statusFn(`「${t.label}」${t.disabledReason || '尚未实现'}`);
    flash(t);
    return false;
  }
  if (beforeSelect && beforeSelect(t) === false) return false;   
  state.current = id;
  const dg = dgroupOf.get(id); if (dg) state.groupCurrent.set(dg.id, id);
  const k = keyOf(t); if (k) lastByKey.set(k, id);
  sync();
  if (!silent) onSelectFn(t);
  return true;
}

export function syncFromDocTool(name) {
  
  const cur = state.current && byId.get(state.current);
  if (!cur || cur.impl !== 'docTool:' + name)
    for (const t of byId.values()) if (t.impl === 'docTool:' + name) {
      state.current = t.id;
      const dg = dgroupOf.get(t.id); if (dg) state.groupCurrent.set(dg.id, t.id);
      const k = keyOf(t); if (k) lastByKey.set(k, t.id);
      break;
    }
  sync();
}

function toolsForKey(k) {
  const order = [...layout.groups.flat(), ...layout.extras];
  return order.map(id => byId.get(id)).filter(t => t && keyOf(t) === k);
}

function pressKey(k, shift) {
  const list = toolsForKey(k); if (!list.length) return false;
  const curT = state.current && byId.get(state.current);
  const curIn = curT && keyOf(curT) === k;
  if (!shift && !shiftSwitch && curIn) shift = true;     
  if (!shift) {
    if (curIn) return select(curT.id);
    const last = lastByKey.get(k);
    const pick = (last && list.find(t => t.id === last && implOf(t))) || list.find(t => implOf(t));
    return pick ? select(pick.id) : select(list[0].id);
  }
  let i = list.findIndex(t => t.id === (curIn ? curT.id : lastByKey.get(k)));
  if (!curIn) i = Math.max(0, i) - 1;        
  for (let n = 0; n < list.length; n++) {
    i = (i + 1 + list.length) % list.length;
    const t = list[i];
    if (implOf(t)) return select(t.id);
    statusFn(`「${t.label}」${t.disabledReason || '尚未实现'}，已跳过`);
  }
  return false;
}

function cycleGroup(dgId) {
  const dg = dgroups.find(x => x.id === dgId); if (!dg) return false;
  const cur = state.groupCurrent.get(dg.id);
  let i = dg.tools.findIndex(t => t.id === cur);
  for (let n = 0; n < dg.tools.length; n++) {
    i = (i + 1) % dg.tools.length;
    if (implOf(dg.tools[i])) return select(dg.tools[i].id);
  }
  return false;
}
function flash(t) {
  const dg = dgroupOf.get(t.id);
  const b = rootEl && (dg ? rootEl.querySelector(`.tool-group[data-group="${dg.id}"] > .tool-btn`) : rootEl.querySelector('.tool-more'));
  if (!b) return;
  b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 350);
}


function flyRow(t) {
  const row = document.createElement('button'); row.type = 'button'; row.className = 'tool-item'; row.dataset.tool = t.id;
  if (t.btnId) row.id = t.btnId;
  row.classList.toggle('todo', !implOf(t));
  if (!implOf(t)) row.setAttribute('aria-disabled', 'true');
  row.appendChild(svgIcon(t.id, 16));
  const lab = document.createElement('span'); lab.className = 'tool-item-label'; lab.textContent = t.label; row.appendChild(lab);
  const k = document.createElement('span'); k.className = 'tool-item-key'; k.textContent = keyOf(t); row.appendChild(k);
  row.title = (t.disabledReason ? t.label + '：' + t.disabledReason : t.label) + (keyOf(t) ? `（${keyOf(t)}）` : '');
  row.addEventListener('click', e => { e.stopPropagation(); hideFlyouts(); select(t.id); });
  return row;
}

function pressable(btn, wrap, onClick) {
  let pressTimer = 0, pressed = false, longFired = false;
  btn.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    pressed = true; longFired = false;
    pressTimer = setTimeout(() => { if (pressed) { longFired = true; showFlyout(wrap); } }, 320);    
  });
  btn.addEventListener('pointerup', () => { pressed = false; clearTimeout(pressTimer); });
  btn.addEventListener('pointerleave', () => { pressed = false; clearTimeout(pressTimer); });
  btn.addEventListener('click', e => { if (longFired) { longFired = false; return; } onClick(e); });
  btn.addEventListener('contextmenu', e => { e.preventDefault(); showFlyout(wrap); });
}
export function render(el) {
  rootEl = el; el.innerHTML = '';
  el.classList.add('ps-toolbar');
  const col = document.createElement('div'); col.className = 'tool-col'; el.appendChild(col);
  buildDisplayGroups();
  for (const g of dgroups) {
    const wrap = document.createElement('div'); wrap.className = 'tool-group'; wrap.dataset.group = g.id;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tool-btn'; btn.dataset.group = g.id;
    const first = state.groupCurrent.get(g.id) || g.tools[0].id;
    const groupIcon = svgIcon(first);
    groupIcon.dataset.tool = first;
    btn.appendChild(groupIcon);
    if (g.tools.length > 1) { const tri = document.createElement('i'); tri.className = 'tool-tri'; btn.appendChild(tri); }
    wrap.appendChild(btn);
    
    const fly = document.createElement('div'); fly.className = 'tool-flyout'; fly.hidden = true;
    for (const t of g.tools) fly.appendChild(flyRow(t));
    wrap.appendChild(fly);
    pressable(btn, wrap, e => {
      if (!fly.hidden) return;
      
      if (e.altKey && g.tools.length > 1) { cycleGroup(g.id); return; }
      select(state.groupCurrent.get(g.id));
    });
    
    btn.addEventListener('dblclick', e => { e.preventDefault(); if (e.altKey) return; const t = byId.get(state.groupCurrent.get(g.id)); if (t && dblFn) dblFn(t); });
    col.appendChild(wrap);
  }
  
  const moreWrap = document.createElement('div'); moreWrap.className = 'tool-group tool-more-wrap'; moreWrap.dataset.group = '__more';
  const more = document.createElement('button'); more.type = 'button'; more.className = 'tool-btn tool-more'; more.title = '编辑工具栏…（附加工具）'; more.appendChild(svgIcon('more'));
  const moreFly = document.createElement('div'); moreFly.className = 'tool-flyout'; moreFly.hidden = true;
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'tool-item tool-item-edit';
  edit.innerHTML = '<span></span><span class="tool-item-label">编辑工具栏…</span><span class="tool-item-key"></span>';
  edit.addEventListener('click', e => { e.stopPropagation(); hideFlyouts(); openCustomize(); });
  moreFly.appendChild(edit);
  if (layout.extras.length) {
    const sep = document.createElement('div'); sep.className = 'tool-fly-sep'; moreFly.appendChild(sep);
    for (const id of layout.extras) moreFly.appendChild(flyRow(byId.get(id)));
  }
  moreWrap.append(more, moreFly);
  more.addEventListener('click', () => { if (moreFly.hidden) showFlyout(moreWrap); else hideFlyouts(); });
  more.addEventListener('contextmenu', e => { e.preventDefault(); showFlyout(moreWrap); });
  moreWrap.hidden = !!layout.hide.more;
  col.appendChild(moreWrap);
  
  const sw = document.createElement('div'); sw.className = 'tool-swatches'; sw.title = '前景色 / 背景色（X 切换，D 复位）';
  sw.innerHTML = `<button type="button" class="sw-default" title="默认前景色和背景色（D）"><span></span></button><button type="button" class="sw-swap" title="切换前景色和背景色（X）"></button><button type="button" class="sw-fg" title="设置前景色"></button><button type="button" class="sw-bg" title="设置背景色"></button>`;
  sw.querySelector('.sw-default').addEventListener('click', () => actions.run('tool.defaultColors'));
  
  sw.querySelector('.sw-swap').append(uiIcon('swap-colors', 11));
  sw.querySelector('.sw-swap').addEventListener('click', () => actions.run('tool.swapColors'));
  sw.querySelector('.sw-fg').addEventListener('click', () => colorsFn && colorsFn('fg'));
  sw.querySelector('.sw-bg').addEventListener('click', () => colorsFn && colorsFn('bg'));
  sw.hidden = !!layout.hide.swatches;
  col.appendChild(sw);
  

  const qm = document.createElement('button'); qm.type = 'button'; qm.className = 'tool-btn tool-quickmask'; qm.title = '以快速蒙版模式编辑（Q）· 双击：快速蒙版选项 · ⌥ 点：切换色彩指示'; qm.appendChild(svgIcon('quickMask'));
  let qmTimer = 0;
  qm.addEventListener('click', e => {
    if (e.altKey) { clearTimeout(qmTimer); qmTimer = 0; actions.run('tool.quickMaskInvert'); return; }
    if (e.detail > 1) return;
    clearTimeout(qmTimer);
    qmTimer = setTimeout(() => { qmTimer = 0; actions.run('tool.quickMask') || statusFn('「快速蒙版」当前不可用'); }, 230);
  });
  qm.addEventListener('dblclick', e => { e.preventDefault(); clearTimeout(qmTimer); qmTimer = 0; if (qmOptionsFn) qmOptionsFn(); else actions.run('tool.quickMaskOptions'); });
  qm.hidden = !!layout.hide.quickMask;
  col.appendChild(qm);
  


  const smWrap = document.createElement('div'); smWrap.className = 'tool-group tool-screenmode-wrap'; smWrap.dataset.group = '__screen';
  const sm = document.createElement('button'); sm.type = 'button'; sm.className = 'tool-btn tool-screenmode'; sm.title = SCREEN_MODE_TITLE.standard;
  sm.appendChild(svgIcon(SCREEN_MODE_ICON[state.screenMode] || SCREEN_MODE_ICON.standard));
  const smFly = document.createElement('div'); smFly.className = 'tool-flyout'; smFly.hidden = true;
  for (const m of SCREEN_MODES) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'tool-item'; row.dataset.screen = m;
    row.appendChild(svgIcon(SCREEN_MODE_ICON[m], 16));
    const lab = document.createElement('span'); lab.className = 'tool-item-label'; lab.textContent = SCREEN_MODE_LABEL[m]; row.appendChild(lab);
    const k = document.createElement('span'); k.className = 'tool-item-key'; k.textContent = 'F'; row.appendChild(k);
    row.addEventListener('click', e => { e.stopPropagation(); hideFlyouts(); actions.run('view.screenMode.' + m); });
    smFly.appendChild(row);
  }
  smWrap.append(sm, smFly);
  pressable(sm, smWrap, () => { if (smFly.hidden) actions.run('view.screenModeCycle'); });
  smWrap.hidden = !!layout.hide.screenMode;
  col.appendChild(smWrap);
  screenModeBtn = sm;
  setScreenMode(state.screenMode);
  if (!render.bound) {
    render.bound = true;
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.tool-flyout') && !e.target.closest('.tool-group')) hideFlyouts(); }, true);
    addEventListener('keydown', e => { if (e.key === 'Escape' && rootEl && rootEl.querySelector('.tool-flyout:not([hidden])')) { hideFlyouts(); e.stopImmediatePropagation(); } }, true);
    bindSpring();
    const tp = $('#toolPreset');
    if (tp) tp.addEventListener('click', e => { e.stopPropagation(); if (presetFn) presetFn(tp.getBoundingClientRect()); });
  }
  sync(); syncSwatches();
}




function showFlyout(wrap) {
  hideFlyouts();
  const fly = wrap.querySelector('.tool-flyout'); if (!fly) return;
  fly.hidden = false;
  const btn = wrap.querySelector('.tool-btn') || wrap;
  const r = btn.getBoundingClientRect();
  fly.style.position = 'fixed';
  fly.style.left = Math.round(r.right + 1) + 'px';
  fly.style.top = Math.round(r.top) + 'px';
  
  const h = fly.offsetHeight || 0, vh = (typeof innerHeight === 'number' ? innerHeight : 0) || 0;
  if (vh && r.top + h > vh - 8) fly.style.top = Math.max(8, vh - 8 - h) + 'px';
  const w = fly.offsetWidth || 0, vw = (typeof innerWidth === 'number' ? innerWidth : 0) || 0;
  if (vw && r.right + 1 + w > vw - 8) fly.style.left = Math.max(8, vw - 8 - w) + 'px';
}
function hideFlyouts() { if (rootEl) for (const f of rootEl.querySelectorAll('.tool-flyout')) f.hidden = true; }

export function sync() {
  if (!rootEl) return;
  for (const g of dgroups) {
    const wrap = rootEl.querySelector(`.tool-group[data-group="${g.id}"]`); if (!wrap) continue;
    const btn = wrap.querySelector(':scope > .tool-btn');
    const curId = state.groupCurrent.get(g.id); const t = byId.get(curId);
    
    
    const cur = btn.querySelector('.ps-icon');
    if (cur && cur.dataset.tool !== curId) { const n = svgIcon(curId); n.dataset.tool = curId; cur.replaceWith(n); }
    btn.title = `${t.label}${keyOf(t) ? `（${keyOf(t)}）` : ''}${g.tools.length > 1 ? ' · ⌥ 点切换同组工具' : ''}`;
    btn.classList.toggle('active', state.current === curId);
    btn.classList.toggle('todo', !implOf(t));
    btn.disabled = !state.enabled && !!implOf(t);
    for (const row of wrap.querySelectorAll('.tool-item')) {
      const tt = byId.get(row.dataset.tool);
      row.classList.toggle('active', state.current === tt.id);
      if (implOf(tt)) row.disabled = !state.enabled;
    }
  }
  
  const mw = rootEl.querySelector('.tool-more-wrap');
  if (mw) {
    mw.querySelector('.tool-more').classList.toggle('active', !!state.current && layout.extras.includes(state.current));
    for (const row of mw.querySelectorAll('.tool-item[data-tool]')) {
      const tt = byId.get(row.dataset.tool);
      row.classList.toggle('active', state.current === tt.id);
      if (implOf(tt)) row.disabled = !state.enabled;
    }
  }
  const qm = rootEl.querySelector('.tool-quickmask');
  if (qm) {
    qm.classList.toggle('active', state.quickMask);
    const want = state.quickMaskInverted ? 'quickMaskInverted' : 'quickMask';
    if (qm.dataset.icon !== want) {
      qm.dataset.icon = want;
      
      qm.replaceChildren(svgIcon(hasToolIcon(want) ? want : 'quickMask'));
    }
    qm.title = (state.quickMask ? '以标准模式编辑（Q）' : '以快速蒙版模式编辑（Q）')
      + ` · 色彩指示：${state.quickMaskInverted ? '所选区域' : '被蒙版区域'} · 双击：快速蒙版选项 · ⌥ 点：切换色彩指示`;
  }
}
function syncSwatches() {
  if (!rootEl) return;
  const fg = rootEl.querySelector('.sw-fg'), bg = rootEl.querySelector('.sw-bg');
  if (fg) fg.style.background = state.fg; if (bg) bg.style.background = state.bg;
}





let customDlg = null;
function openCustomize() {
  let work = JSON.parse(JSON.stringify(layout));
  if (!customDlg) {
    customDlg = document.createElement('dialog');
    customDlg.className = 'tb-custom';
    document.body.appendChild(customDlg);
    customDlg.addEventListener('cancel', e => { e.preventDefault(); customDlg.close(); });
  }
  const d = customDlg;
  d.innerHTML = `<h3>自定义工具栏</h3>
    <div class="tbc-hint">拖动工具或工具组以对它们进行组织。将多余的或不常用的工具拖到附加工具列表中。</div>
    <div class="tbc-cols"><div class="tbc-col"><div class="tbc-head">工具栏</div><div class="tbc-list tbc-main"></div></div>
    <div class="tbc-col"><div class="tbc-head">附加工具</div><div class="tbc-list tbc-extra"></div></div></div>
    <div class="tbc-foot"><div class="tbc-toggles"></div>
      <div class="tbc-btns"><button type="button" data-a="reset">恢复默认值</button><button type="button" data-a="clear">清除工具</button>
      <button type="button" data-a="cancel">取消</button><button type="button" class="primary" data-a="ok">完成</button></div></div>`;
  let dragId = null;
  const mkRow = id => {
    const t = byId.get(id);
    const r = document.createElement('div'); r.className = 'tbc-row'; r.draggable = true; r.dataset.tool = id;
    r.append(svgIcon(id, 16));
    const l = document.createElement('span'); l.textContent = t.label; r.append(l);
    const k = document.createElement('span'); k.className = 'tbc-key'; k.textContent = keyOf(t); r.append(k);
    r.addEventListener('dragstart', e => { dragId = id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch {} r.classList.add('dragging'); });
    r.addEventListener('dragend', () => { dragId = null; r.classList.remove('dragging'); for (const x of d.querySelectorAll('.over')) x.classList.remove('over'); });
    return r;
  };
  const removeId = id => {
    for (const a of work.groups) { const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); }
    const j = work.extras.indexOf(id); if (j >= 0) work.extras.splice(j, 1);
    work.groups = work.groups.filter(a => a.length);
  };
  const dropZone = (el, fn) => {
    el.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => { if (!dragId) return; e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); const id = dragId; dragId = null; fn(id); paint(); });
  };
  const paint = () => {
    const main = d.querySelector('.tbc-main'), extra = d.querySelector('.tbc-extra');
    main.innerHTML = ''; extra.innerHTML = '';
    const gap = gi => { const z = document.createElement('div'); z.className = 'tbc-gap'; dropZone(z, id => { removeId(id); work.groups.splice(Math.min(gi, work.groups.length), 0, [id]); }); return z; };
    work.groups.forEach((ids, gi) => {
      main.append(gap(gi));
      const box = document.createElement('div'); box.className = 'tbc-group';
      for (const id of ids) {
        const r = mkRow(id);
        dropZone(r, src => { if (src === id) return; removeId(src); const a = work.groups.find(x => x.includes(id)); if (a) a.splice(a.indexOf(id), 0, src); });
        box.append(r);
      }
      dropZone(box, src => { const tailOf = ids[ids.length - 1]; removeId(src); const a = work.groups.find(x => x.includes(tailOf)); if (a) a.push(src); else work.groups.push([src]); });
      main.append(box);
    });
    main.append(gap(work.groups.length));
    for (const id of work.extras) {
      const r = mkRow(id);
      dropZone(r, src => { if (src === id) return; removeId(src); work.extras.splice(work.extras.indexOf(id), 0, src); });
      extra.append(r);
    }
    dropZone(extra, src => { removeId(src); work.extras.push(src); });
    const tg = d.querySelector('.tbc-toggles'); tg.innerHTML = '';
    for (const [k, icon, label] of [['more', 'more', '编辑工具栏'], ['swatches', null, '前景色 / 背景色'], ['quickMask', 'quickMask', '快速蒙版'], ['screenMode', 'screenMode', '屏幕模式']]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tbc-tog' + (work.hide[k] ? '' : ' on');
      b.title = (work.hide[k] ? '显示' : '隐藏') + '工具栏底部的「' + label + '」';
      if (icon) b.append(svgIcon(icon, 16)); else { const s = document.createElement('i'); s.className = 'tbc-swatch'; b.append(s); }
      b.addEventListener('click', () => { if (work.hide[k]) delete work.hide[k]; else work.hide[k] = true; paint(); });
      tg.append(b);
    }
  };
  d.querySelector('[data-a="reset"]').onclick = () => { work = defaultLayout(); paint(); };
  d.querySelector('[data-a="clear"]').onclick = () => { work.extras = [...work.groups.flat(), ...work.extras]; work.groups = []; paint(); };
  d.querySelector('[data-a="cancel"]').onclick = () => d.close();
  d.querySelector('[data-a="ok"]').onclick = () => {
    layout = normalizeLayout(work); saveLayout();
    d.close();
    if (rootEl) render(rootEl);
    statusFn('工具栏布局已更新');
  };
  paint();
  try { d.showModal(); } catch { d.setAttribute('open', ''); }
}

export function getLayout() { return JSON.parse(JSON.stringify(layout)); }
export function setLayout(next) { layout = next ? normalizeLayout(next) : defaultLayout(); saveLayout(); if (rootEl) render(rootEl); }





let spring = null;
function springKeyDown(e, k, prev) {
  if (getPreference('tools.springLoaded') === false || e.repeat || spring) return;
  spring = { key: k, prev, t: (typeof performance !== 'undefined' ? performance.now() : Date.now()), used: false };
}
function bindSpring() {
  addEventListener('keyup', e => {
    if (!spring) return;
    const k = /^Key([A-Z])$/.test(e.code || '') ? e.code.slice(3) : '';
    if (k !== spring.key) return;
    const sp = spring; spring = null;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (getPreference('tools.springLoaded') === false || !sp.prev || sp.prev === state.current) return;
    const threshold = Math.max(200, Math.min(1000, +getPreference('tools.springTiming') || 350));
    if (sp.used || now - sp.t >= threshold) select(sp.prev);
  });
  addEventListener('pointerdown', e => { if (spring && e.target && e.target.closest && e.target.closest('#viewport')) spring.used = true; }, true);
  addEventListener('blur', () => { spring = null; });
}

export function springKey() { return spring ? spring.key : ''; }


let boundToolKeys = [];
export function bindKeys() {
  const keys = new Set();
  for (const s of boundToolKeys) shortcuts.unbind(s);
  boundToolKeys = [];
  for (const t of byId.values()) { const k = keyOf(t); if (k) keys.add(k); }
  for (const k of keys) {
    const aid = `tool.key.${k}`;
    actions.register(aid, { run: (ctx) => {
      const ev = ctx && ctx.event, shift = !!(ev && ev.shiftKey);
      const prev = state.current;
      const ok = pressKey(k, shift);
      if (ok && ev && !shift) springKeyDown(ev, k, prev);
      return ok;
    }, enabled: () => state.enabled });
    
    shortcuts.bind(k, aid); shortcuts.bind('Shift+' + k, aid);
    boundToolKeys.push(k, 'Shift+' + k);
  }
  
  actions.register('view.screenModeCyclePrev', { run: () => {
    const i = SCREEN_MODES.indexOf(state.screenMode);
    return actions.run('view.screenMode.' + SCREEN_MODES[(i - 1 + SCREEN_MODES.length) % SCREEN_MODES.length]);
  } });
  if (!shortcuts.bindingsOf('view.screenModeCyclePrev').length) shortcuts.bind('Shift+F', 'view.screenModeCyclePrev');
  actions.register('edit.toolbar', { run: () => { openCustomize(); } });
}

export function setKeyOverrides(map) {
  keyOverrides = {};
  for (const [id, k] of Object.entries(map || {})) if (byId.has(id) && (k === '' || /^[A-Z]$/.test(k))) keyOverrides[id] = k;
  lastByKey.clear();
  bindKeys();
  if (rootEl) render(rootEl);
}
export function getKeyOverrides() { return { ...keyOverrides }; }

export const tools = { TOOL_GROUPS, TOOL_ICONS, svgIcon, setScreenMode, render, select, sync, onBeforeSelect, onDblSelect, onQuickMaskOptions, onPresetPicker, syncFromDocTool, setEnabled, setColors, setQuickMask, onSelect, onStatus, onColorClick, current, tool, isImplemented, bindKeys, getLayout, setLayout, springKey, setShiftSwitch, setKeyOverrides, getKeyOverrides, keyOfTool, defaultKeyOf };
export default tools;
