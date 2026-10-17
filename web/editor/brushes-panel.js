















import * as store from './preset-store.js';
import { registerPresetFormat, presets as presetsApi } from './presets-panels.js';
import { readAbr, writeAbr, newSampleId } from '../../core/abr.js';
import { readTpl, writeTpl, BRUSH_CLASS_TOOLS } from '../../core/tpl.js';
import { registerSampledTip, hasSampledTip, tipThumb, BRUSH_PRESETS, normalizeDynamics, defaultDynamics } from '../../core/brush-engine.js';

let A = null;
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const baseName = n => String(n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o, (k, v) => (v instanceof Uint8Array || v instanceof Uint8ClampedArray) ? { __u8: Array.from(v) } : v), (k, v) => (v && v.__u8) ? Uint8Array.from(v.__u8) : v);


export const brushLib = {
  items: [], groups: [], tools: [], ready: false,
  
  ensureSample(s) {
    if (!s || !s.data) return 'round';
    const key = 'abr:' + s.id;
    if (!hasSampledTip(key)) registerSampledTip(key, s.w, s.h, s.data);
    return key;
  },
  find(id) { return this.items.find(i => i.id === id) || null; },
  
  pickerGroups(filter = '') {
    const f = String(filter || '').trim().toLowerCase(), ok = n => !f || String(n || '').toLowerCase().includes(f);
    const out = [];
    const bi = new Map();
    for (const p of BRUSH_PRESETS) { if (!ok(p.label)) continue; if (!bi.has(p.group)) bi.set(p.group, []); bi.get(p.group).push({ ...p, builtin: true }); }
    for (const [name, items] of bi) out.push({ name, key: 'builtin:' + name, builtin: true, items });
    const loose = this.items.filter(i => !i.group && ok(i.name));
    if (loose.length) out.push({ name: '我的画笔', key: 'loose', items: loose.map(toPicker) });
    for (const g of this.groups) {
      const items = this.items.filter(i => i.group === g.id && ok(i.name));
      if (items.length || !f) out.push({ name: g.name, key: g.id, gid: g.id, builtinPack: g.builtinPack, collapsed: g.collapsed, items: items.map(toPicker) });
    }
    return out;
  },
};

function toPicker(it) {
  const tip = it.sample ? brushLib.ensureSample(it.sample) : it.tip || 'round';
  return { id: it.id, label: it.name, tip, hardness: it.hardness == null ? 1 : it.hardness, size: it.size, angle: it.angle || 0, roundness: it.roundness || 1, rec: it };
}
async function reload() {
  brushLib.items = await store.listPresets('brushes');
  brushLib.groups = await store.listGroups('brushes');
  for (const it of brushLib.items) { if (it.sample) brushLib.ensureSample(it.sample); if (it.dyn && it.dyn.dual && it.dyn.dual.sample) brushLib.ensureSample(it.dyn.dual.sample); }
  brushLib.ready = true;
  render();
  try { A.onBrushLibChanged && A.onBrushLibChanged(); } catch {}
}
async function reloadTools() {
  brushLib.tools = await store.listPresets('toolPresets');
  for (const t of brushLib.tools) if (t.brush && t.brush.sample) brushLib.ensureSample(t.brush.sample);
  renderTools();
}



function storeItemOf(rec, extra = {}) {
  const it = clone({ ...rec });
  delete it.missing; delete it.approx;
  if (it.sample) it.tip = 'abr:' + it.sample.id;
  it.dyn = normalizeDynamics(it.dyn || defaultDynamics());
  return { ...it, ...extra };
}
export async function importAbrBytes(u8, fileName) {
  const r = readAbr(u8);
  const group = baseName(fileName) || '导入的画笔';
  if (r.patterns.length) await store.addPresets('patterns', r.patterns.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })), { groupName: group });
  const added = await store.addPresets('brushes', r.brushes.map(b => storeItemOf(b)), { groupName: group, replace: false });
  const msg = `${fileName}：${added.length} 个画笔（ABR ${r.version}）` + (r.patterns.length ? `、${r.patterns.length} 个纹理图案` : '') + (r.warnings.length ? `（${r.warnings.join('；')}）` : '');
  return { added, msg, warnings: r.warnings };
}
function patternsForExport(recs) {
  const ids = new Set(recs.map(r => r.dyn && r.dyn.texture && r.dyn.texture.on && r.dyn.texture.pattern).filter(Boolean));
  const lib = (presetsApi.lib && presetsApi.lib.patterns) || [];
  return lib.filter(p => ids.has(p.id)).concat(A.docPatternRGBA ? A.docPatternRGBA([...ids].filter(id => !lib.some(p => p.id === id))) : []);
}

function builtinRecord(p) {
  const d = defaultDynamics(); if (p.dyn) for (const k of Object.keys(p.dyn)) Object.assign(d[k], p.dyn[k]);
  return { name: p.label, tip: p.tip, size: p.size, hardness: p.hardness, angle: p.angle || 0, roundness: p.roundness || 1, spacing: p.spacing || .25, dyn: d };
}
export function exportAbr(recs, name) {
  if (!recs.length) return;
  const data = writeAbr(recs, patternsForExport(recs));
  download((name || (recs.length === 1 ? recs[0].name : '画笔')) + '.abr', data);
  A.status(`已导出 ${recs.length} 个画笔（.abr，PS 2026 可直接导入）`);
}
function download(name, data) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const a = mk('a', { href: URL.createObjectURL(blob), download: name.replace(/[\\/:*?"<>|]/g, '_') });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function pickFiles(accept, multiple = true) {
  return new Promise(res => {
    const inp = mk('input', { type: 'file', accept, multiple });
    inp.onchange = async () => { const out = []; for (const f of inp.files) out.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }); res(out); };
    inp.click();
  });
}
async function importAbrUI() {
  const files = await pickFiles('.abr');
  const msgs = [];
  for (const f of files) { try { msgs.push((await importAbrBytes(f.data, f.name)).msg); } catch (e) { msgs.push(`${f.name}：导入失败（${e.message || e}）`); } }
  if (msgs.length) A.status(msgs.join('；'));
  if (msgs.some(m => /失败/.test(m))) A.alertDialog(msgs.join('\n'), { title: '导入画笔' });
}



export async function defineBrush() {
  if (!A.hasDoc()) return null;
  const src = A.defineBrushSource();
  if (!src || src.error) { A.status((src && src.error) || '没有可用来定义画笔的像素'); return null; }
  let { w, h, gray } = src;
  
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (gray[y * w + x] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) { A.status('定义画笔预设：选区里全是白色（白 = 透明），没有可用的笔尖'); return null; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  let data = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) data.set(gray.subarray((y + y0) * w + x0, (y + y0) * w + x0 + cw), y * cw);
  let W = cw, H = ch;
  
  const MAX = 2500;
  if (Math.max(W, H) > MAX) {
    const k = MAX / Math.max(W, H), nw = Math.max(1, Math.round(W * k)), nh = Math.max(1, Math.round(H * k)), out = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const sx0 = Math.floor(x / k), sx1 = Math.min(W, Math.floor((x + 1) / k)), sy0 = Math.floor(y / k), sy1 = Math.min(H, Math.floor((y + 1) / k));
      let s = 0, n = 0; for (let yy = sy0; yy < Math.max(sy0 + 1, sy1); yy++) for (let xx = sx0; xx < Math.max(sx0 + 1, sx1); xx++) { s += data[yy * W + xx]; n++; }
      out[y * nw + x] = Math.round(s / n);
    }
    data = out; W = nw; H = nh;
  }
  const n = (brushLib.items.length + 1);
  const v = await A.promptDialog('名称：', `取样画笔 ${n}`, { title: '画笔名称', label: '名称' });
  if (v == null) return null;
  const id = newSampleId();
  const rec = { name: String(v).trim() || `取样画笔 ${n}`, tip: 'abr:' + id, sample: { id, w: W, h: H, data }, size: Math.max(W, H),
    hardness: 1, angle: 0, roundness: 1, spacing: .25, dyn: defaultDynamics() };
  const [it] = await store.addPresets('brushes', [storeItemOf(rec)], { group: curGroup() });
  await reload();
  A.applyBrushRecord(it, it.id);
  A.status(`已定义画笔预设「${it.name}」（${W}×${H} 像素，画笔面板与画笔预设选取器里可见）`);
  return it;
}


const VIEW_KEY = 'fp.brushPanelView', OPT_KEY = 'fp.brushPanelOpts', RECENT_KEY = 'fp.brushRecent';


const bopt = (() => {
  const d = { name: false, tip: true, stroke: false, extra: true, search: true, recent: true, thumb: 36 };
  try { const o = JSON.parse(localStorage.getItem(OPT_KEY) || 'null'); if (o) return { ...d, ...o };
    const v = localStorage.getItem(VIEW_KEY); if (v === 'stroke') d.stroke = true; else if (v === 'list') d.name = true; } catch {}
  return d;
})();
const saveOpt = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(bopt)); } catch {} };
let view = 'thumb';   
const syncView = () => { view = bopt.name || bopt.stroke ? 'row' : 'thumb'; };
syncView();
let recent = (() => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } })();
function noteRecent(id) {
  if (!id || recent[0] === id) return;
  recent = [id, ...recent.filter(x => x !== id)].slice(0, 10);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
}
let query = '', selId = null;
const collapsed = new Set((() => { try { return JSON.parse(localStorage.getItem('fp.brushPanelCollapsed') || '[]'); } catch { return []; } })());
const saveCollapsed = () => { try { localStorage.setItem('fp.brushPanelCollapsed', JSON.stringify([...collapsed])); } catch {} };
const hostEl = () => document.querySelector('section.panel[data-panel="brushes"]');
const DND = 'application/x-psd_editor-brush';
function curGroup() { const it = brushLib.find(selId); return it ? it.group || '' : ''; }

function tipCanvas(p, size) {
  const cv = mk('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'); if (!ctx) return cv;
  const N = Math.min(96, size * 2), t = tipThumb(p.tip, p.hardness == null ? 1 : p.hardness, N), id = ctx.createImageData(size, size);
  const a = -(p.angle || 0) * Math.PI / 180, rr = p.roundness || 1, cs = Math.cos(a), sn = Math.sin(a);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const u = (dx * cs + dy * sn) * 1.08, v = (-dx * sn + dy * cs) / rr * 1.08;
    let c = 0;
    if (u > -1 && u < 1 && v > -1 && v < 1) c = t[Math.min(N - 1, Math.floor((v + 1) / 2 * N)) * N + Math.min(N - 1, Math.floor((u + 1) / 2 * N))];
    const o = (y * size + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = 225; id.data[o + 3] = Math.round(c * 255);
  }
  ctx.putImageData(id, 0, 0);
  return cv;
}
function strokeCanvas(p, w = 150, h = 30) {
  const cv = mk('canvas'); cv.width = w; cv.height = h; cv.className = 'bp2-stroke';
  try { A.drawStrokePreview(cv, p.rec || builtinRecord(p)); } catch {}
  return cv;
}
export function render() {
  const host = hostEl(); if (!host || !A) return;
  host.classList.add('pp-panel', 'bp2-panel');
  const keepScroll = host.querySelector('.pp-body') ? host.querySelector('.pp-body').scrollTop : 0;
  host.replaceChildren();
  noteRecent(A.currentPresetId());
  const top = mk('div', { className: 'bp2-top' });
  if (bopt.recent) {
    
    const row = mk('div', { className: 'bp2-recent', title: '最近使用的画笔' });
    const all = new Map(); for (const g of brushLib.pickerGroups('')) for (const p of g.items) all.set(p.id, p);
    for (const id of recent) {
      const p = all.get(id); if (!p) continue;
      const t = mk('div', { className: 'bp2-rtile' + (id === A.currentPresetId() ? ' on' : ''), title: `${p.label}（${p.size} 像素）` });
      t.dataset.id = id;
      t.append(tipCanvas(p, 26), mk('span', { className: 'bp2-sz', textContent: String(p.size) }));
      t.onclick = () => { selId = p.id; if (p.rec) A.applyBrushRecord(p.rec, p.id); else A.applyBuiltin(p.id); };
      row.append(t);
    }
    if (row.childNodes.length) top.append(row);
  }
  if (bopt.search) {
    const search = mk('input', { type: 'search', className: 'bp2-search', placeholder: '搜索画笔', value: query });
    search.dataset.attr = 'brush-search';
    search.oninput = () => { query = search.value; renderBody(body); };
    search.addEventListener('keydown', e => e.stopPropagation());
    top.append(search);
  } else query = '';
  const size = mk('div', { className: 'bp2-size' });
  const sl = mk('input', { type: 'range', min: 1, max: 1000, value: Math.min(1000, A.brushSize()) });
  const sv = mk('span', { textContent: A.brushSize() + ' 像素' });
  sl.oninput = () => { A.setBrushSize(+sl.value); sv.textContent = sl.value + ' 像素'; };
  size.append(mk('span', { textContent: '大小' }), sl, sv);
  top.append(size);
  const body = mk('div', { className: 'pp-body bp2-body' });
  renderBody(body);
  host.append(top, body, footer());
  body.scrollTop = keepScroll;
}
function renderBody(body) {
  body.replaceChildren();
  const groups = brushLib.pickerGroups(query);
  const cur = A.currentPresetId();
  for (const g of groups) {
    const key = g.key, isC = (g.builtinPack ? g.collapsed : collapsed.has(key)) && !query;
    const head = mk('div', { className: 'pp-group bp2-group' + (isC ? '' : ' open') });
    const tri = A.uiIcon(isC ? 'chevron-right' : 'chevron-down', 9); tri.setAttribute('class', 'ps-icon pp-tri');
    head.append(tri, A.uiIcon('folder', 14), mk('span', { textContent: g.name + (g.builtin ? '' : ` (${g.items.length})`) }));
    head.dataset.group = key;
    head.onclick = () => {
      if (g.builtinPack) { store.updateGroup('brushes', g.gid, { collapsed: !isC }); return; }
      if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); saveCollapsed(); renderBody(body);
    };
    if (g.gid) {
      head.ondblclick = e => { e.stopPropagation(); renameGroup(g.gid, g.name); };
      head.oncontextmenu = e => { e.preventDefault(); A.panels.popup(groupMenu(g), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); };
      head.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DND)) { e.preventDefault(); head.classList.add('drop'); } });
      head.addEventListener('dragleave', () => head.classList.remove('drop'));
      head.addEventListener('drop', e => { head.classList.remove('drop'); dropOnto(e, null, g.gid); });
    }
    body.append(head);
    if (isC) continue;
    const grid = mk('div', { className: 'bp2-grid ' + view });
    for (const p of g.items) grid.append(tile(p, cur));
    body.append(grid);
  }
  if (!groups.length) body.append(mk('div', { className: 'panel-empty', textContent: query ? '没有匹配的画笔' : '还没有画笔：面板菜单 › 导入画笔…（.abr），或「编辑 › 定义画笔预设…」' }));
  body.ondragover = e => { if (e.dataTransfer.types.includes(DND)) e.preventDefault(); };
  body.ondrop = e => { if (!e.defaultPrevented) dropOnto(e, null, ''); };
}
function tile(p, cur) {
  const on = (p.rec ? p.id : p.id) === cur || selId === p.id;
  const t = mk('div', { className: 'bp2-tile ' + view + (on ? ' on' : ''), title: `${p.label}（${p.size} 像素）` + (p.rec?.approx ? ' · 特殊笔尖采用近似绘制' : '') });
  t.dataset.id = p.id;
  const sz = () => bopt.extra ? mk('span', { className: 'bp2-sz', textContent: String(p.size) }) : null;
  if (view === 'thumb') {
    t.style.width = t.style.height = (bopt.thumb + 8) + 'px';
    t.append(...[tipCanvas(p, bopt.thumb), sz()].filter(Boolean));
  } else {
    if (bopt.tip) t.append(tipCanvas(p, Math.min(bopt.thumb, 30)));
    const s2 = sz(); if (s2) t.append(s2);
    if (bopt.stroke) t.append(strokeCanvas(p, Math.max(90, bopt.thumb * 4), Math.max(20, Math.round(bopt.thumb * .8))));
    if (bopt.name) t.append(mk('span', { className: 'bp2-name', textContent: p.label + (p.rec?.approx ? '（近似）' : '') }));
  }
  t.onclick = () => { selId = p.id; if (p.rec) A.applyBrushRecord(p.rec, p.id); else A.applyBuiltin(p.id); markSel(); };
  if (p.rec) {
    t.ondblclick = () => renameItem(p.rec);
    t.draggable = true;
    t.addEventListener('dragstart', e => { e.dataTransfer.setData(DND, p.id); e.dataTransfer.effectAllowed = 'move'; });
    t.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DND)) { e.preventDefault(); t.classList.add('drop'); } });
    t.addEventListener('dragleave', () => t.classList.remove('drop'));
    t.addEventListener('drop', e => { t.classList.remove('drop'); dropOnto(e, p.id, p.rec.group || ''); });
  }
  t.oncontextmenu = e => { e.preventDefault(); selId = p.id; markSel(); A.panels.popup(itemMenu(p), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); };
  return t;
}
function markSel() {
  const host = hostEl(); if (!host) return;
  const cur = A.currentPresetId();
  for (const t of host.querySelectorAll('.bp2-tile')) t.classList.toggle('on', t.dataset.id === selId || t.dataset.id === cur);
}
async function dropOnto(e, beforeId, gid) {
  const id = e.dataTransfer.getData(DND); if (!id) return;
  e.preventDefault(); e.stopPropagation();
  if (id === beforeId) return;
  const ids = brushLib.items.map(i => i.id).filter(x => x !== id);
  const at = beforeId ? ids.indexOf(beforeId) : ids.length;
  ids.splice(at < 0 ? ids.length : at, 0, id);
  await store.reorderPresets('brushes', ids, { [id]: gid || '' });
}
function footer() {
  const f = mk('div', { className: 'pp-foot' });
  const btn = (icon, title, run) => { const b = mk('button', { type: 'button', className: 'lf-btn', title }); b.append(A.uiIcon(icon, 15)); b.onclick = run; f.append(b); return b; };
  btn('brush', '切换「画笔设置」面板（F5）', () => A.toggleBrushSettings());
  
  const ts = mk('input', { type: 'range', min: 20, max: 80, value: bopt.thumb, className: 'bp2-thumbsz', title: '缩览图大小' });
  ts.oninput = () => { bopt.thumb = +ts.value; saveOpt(); const b = hostEl() && hostEl().querySelector('.bp2-body'); if (b) renderBody(b); };
  f.append(mk('span', { className: 'grow' }), ts, mk('span', { className: 'grow' }));
  btn('new-group', '创建新组', () => newGroup());
  btn('add-style', '创建新画笔（用当前画笔设置）', () => newFromCurrent());
  btn('layer-delete', '删除画笔', () => deleteSelected());
  return f;
}
function itemMenu(p) {
  const items = [{ label: '选用这个画笔', run: () => { if (p.rec) A.applyBrushRecord(p.rec, p.id); else A.applyBuiltin(p.id); } }];
  if (p.rec) items.push({ sep: true }, { label: '重命名画笔…', run: () => renameItem(p.rec) }, { label: '删除画笔', run: () => removeItems([p.id]) },
    { label: '导出所选画笔…', run: () => exportAbr([p.rec]) });
  else items.push({ sep: true }, { label: '导出所选画笔…', run: () => exportAbr([builtinRecord(BRUSH_PRESETS.find(x => x.id === p.id))]) },
    { label: '（内置画笔不能删除 / 重命名）', disabled: true });
  return items;
}
function groupMenu(g) {
  return [
    { label: '重命名组…', run: () => renameGroup(g.gid, g.name) },
    { label: '删除组', run: () => deleteGroup(g.gid, g.name) },
    { label: '导出这一组…', run: () => exportAbr(brushLib.items.filter(i => i.group === g.gid), g.name) },
  ];
}
function panelMenu() {
  const sel = brushLib.find(selId);
  return [
    { label: '新建画笔预设…', run: () => newFromCurrent() },
    { label: '新建画笔组…', run: () => newGroup() },
    { label: '重命名画笔…', run: () => sel && renameItem(sel), disabled: !sel },
    { label: '删除画笔', run: () => deleteSelected(), disabled: !sel },
    { sep: true },
    { label: '画笔名称', checked: bopt.name, run: () => setOpt('name') },
    { label: '画笔笔尖', checked: bopt.tip, run: () => setOpt('tip') },
    { label: '画笔描边', checked: bopt.stroke, run: () => setOpt('stroke') },
    { sep: true },
    { label: '显示其他预设信息', checked: bopt.extra, run: () => setOpt('extra') },
    { label: '显示搜索栏', checked: bopt.search, run: () => setOpt('search') },
    { label: '显示最近使用的画笔', checked: bopt.recent, run: () => setOpt('recent') },
    { sep: true },
    { label: '预设管理器…', run: () => presetsApi.openPresetManager('brushes') },
    { label: 'PS 自带预设…', run: () => presetsApi.openPhotoshopPresets('brushes') },
    { label: '恢复默认画笔…', run: () => resetLib(), disabled: !brushLib.items.length, why: '库里只有内置画笔，已经是默认状态' },
    { label: '导入画笔…', run: () => importAbrUI() },
    { label: '导出选中的画笔…', run: () => sel && exportAbr([sel]), disabled: !sel },
    { label: '导出全部画笔…', run: () => exportAbr(brushLib.items), disabled: !brushLib.items.length },
    { label: '获取更多画笔…', disabled: true, why: '需要登录 Adobe 账号下载 Adobe 的画笔素材，本编辑器不接 Adobe 账号；可以把已有的 .abr 用「导入画笔…」载入' },
    { sep: true },
    { label: '转换后的旧版工具预设', disabled: true, why: 'PS 把旧版（CC 2018 以前）的画笔类工具预设转成画笔组；本编辑器没有随附 Adobe 的旧版工具预设，已有的 .tpl 可在「工具预设」面板里导入' },
    { label: '旧版画笔', disabled: true, why: 'PS 的「旧版画笔」是 Adobe 随附的素材库，本编辑器不内置 Adobe 素材；已有的 .abr 用「导入画笔…」载入' },
  ];
}
function setView(v) { bopt.name = v === 'list'; bopt.stroke = v === 'stroke'; bopt.tip = true; saveOpt(); syncView(); render(); }

function setOpt(k) {
  bopt[k] = !bopt[k];
  if (!bopt.name && !bopt.tip && !bopt.stroke) bopt.tip = true;
  saveOpt(); syncView(); render();
}
async function renameItem(it) {
  const v = await A.promptDialog('名称：', it.name || '', { title: '画笔名称', label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.renamePreset('brushes', it.id, String(v).trim());
}
async function removeItems(ids) { await store.removePreset('brushes', ids); if (ids.includes(selId)) selId = null; }
async function deleteSelected() {
  const it = brushLib.find(selId);
  if (!it) { A.status('先在画笔面板里点选一个画笔（内置画笔不能删）'); return; }
  await removeItems([it.id]);
}
async function newGroup() {
  const v = await A.promptDialog('组名称：', '画笔组 ' + (brushLib.groups.length + 1), { title: '组名称', label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.addGroup('brushes', String(v).trim());
}
async function renameGroup(gid, name) {
  const v = await A.promptDialog('组名称：', name, { title: '重命名组', label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.updateGroup('brushes', gid, { name: String(v).trim() });
}
async function deleteGroup(gid, name) {
  const n = brushLib.items.filter(i => i.group === gid).length;
  const r = n ? await A.choiceDialog(`删除组「${name}」？组里有 ${n} 个画笔。`, { title: '删除组', okText: '删除组和画笔', extraText: '仅删除组', danger: true }) : 'extra';
  if (r === 'cancel') return;
  await store.removeGroup('brushes', gid, r === 'ok');
}
async function resetLib() {
  if (!await A.confirmDialog('清空库里的全部画笔？这一步不能撤销（可以先「导出全部画笔」留个底）。内置画笔不受影响。', { title: '复位画笔', danger: true })) return;
  await store.clearPresets('brushes');
}

async function newFromCurrent() {
  const rec = A.currentBrushRecord();
  const r = await A.formDialog('新建画笔', [
    { key: 'name', label: '名称', type: 'text', value: rec.name || '画笔' },
    { key: 'size', label: '包含画笔大小', type: 'check', value: true },
    { key: 'tool', label: '包含工具设置', type: 'check', value: false },
  ], { msg: '「包含工具设置」= 同时记下选项栏的不透明度 / 流量 / 模式（PS 同）' }).catch(() => null);
  if (!r || r.name == null) return;
  rec.name = String(r.name).trim() || '画笔';
  if (r.size === false) rec.useSize = false;
  if (!r.tool) delete rec.toolOpts;
  const [it] = await store.addPresets('brushes', [storeItemOf(rec)], { group: curGroup() });
  selId = it.id;
  A.status(`已新建画笔预设「${it.name}」`);
}


let onlyCurrent = (() => { try { return localStorage.getItem('fp.toolPresetsOnlyCurrent') !== '0'; } catch { return true; } })();
let toolSel = null;

let toolView = (() => { try { return localStorage.getItem('fp.toolPresetsView') || 'small'; } catch { return 'small'; } })();
const setToolView = v => { toolView = v; try { localStorage.setItem('fp.toolPresetsView', v); } catch {} renderTools(); };
const setOnlyCurrent = v => { onlyCurrent = !!v; try { localStorage.setItem('fp.toolPresetsOnlyCurrent', onlyCurrent ? '1' : '0'); } catch {} renderTools(); };
const toolHost = () => document.querySelector('section.panel[data-panel="toolPresets"]');
function visibleTools() { const t = A.currentTool(); return brushLib.tools.filter(p => !onlyCurrent || p.tool === t); }
function toolRow(p, onPick, view = 'small') {
  const row = mk('div', { className: 'bp2-trow ' + view + (toolSel === p.id ? ' on' : ''), title: p.unsupported || p.name });
  row.dataset.id = p.id;
  if (view !== 'text') { const ic = A.toolIconEl(p.tool, view === 'large' ? 28 : 16); if (ic) row.append(ic); }
  row.append(mk('span', { className: 'bp2-name', textContent: p.name }));
  if (p.unsupported) row.style.opacity = '.5';
  row.onclick = () => { toolSel = p.id; onPick(p); };
  row.ondblclick = () => renameTool(p);
  row.oncontextmenu = e => { e.preventDefault(); toolSel = p.id; A.panels.popup([
    { label: '重命名工具预设…', run: () => renameTool(p) }, { label: '删除工具预设', run: () => store.removePreset('toolPresets', p.id) },
    { label: '导出所选工具预设…', run: () => exportTpl([p]) }], { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); };
  return row;
}
export async function applyToolPreset(p) {
  if (p.unsupported) { A.status(p.unsupported); return false; }
  if (p.brush && p.brush.sample) brushLib.ensureSample(p.brush.sample);
  const ok = await A.applyToolPreset(p);
  if (ok) A.status(`工具预设：${p.name}`);
  renderTools();
  return ok;
}
export function renderTools() {
  const host = toolHost(); if (!host || !A) return;
  host.classList.add('pp-panel', 'bp2-panel');
  host.replaceChildren();
  const body = mk('div', { className: 'pp-body bp2-tbody' });
  const list = visibleTools();
  for (const p of list) body.append(toolRow(p, applyToolPreset, toolView));
  if (!list.length) body.append(mk('div', { className: 'panel-empty', textContent: onlyCurrent ? `「${A.toolLabel(A.currentTool())}」还没有工具预设：点下面的「+」把当前选项存成预设` : '还没有工具预设' }));
  const foot = mk('div', { className: 'pp-foot' });
  const lab = mk('label', { className: 'bp2-only' }); const cb = mk('input', { type: 'checkbox', checked: onlyCurrent });
  cb.onchange = () => { onlyCurrent = cb.checked; try { localStorage.setItem('fp.toolPresetsOnlyCurrent', onlyCurrent ? '1' : '0'); } catch {} renderTools(); };
  lab.append(cb, document.createTextNode('仅限当前工具'));
  foot.append(lab, mk('span', { className: 'grow' }));
  const btn = (icon, title, run) => { const b = mk('button', { type: 'button', className: 'lf-btn', title }); b.append(A.uiIcon(icon, 15)); b.onclick = run; foot.append(b); };
  btn('add-style', '创建新的工具预设', () => newToolPreset());
  btn('layer-delete', '删除工具预设', () => { const p = brushLib.tools.find(x => x.id === toolSel); if (p) store.removePreset('toolPresets', p.id); else A.status('先点选一个工具预设'); });
  host.append(body, foot);
}
async function newToolPreset() {
  const t = A.currentTool();
  const snap = A.captureToolPreset(t);
  if (!snap) { A.status(`「${A.toolLabel(t)}」没有可以存的选项`); return; }
  const v = await A.promptDialog('名称：', snap.name || `${A.toolLabel(t)} 1`, { title: '新建工具预设', label: '名称' });
  if (v == null) return;
  const [it] = await store.addPresets('toolPresets', [{ ...snap, name: String(v).trim() || snap.name, tool: t }]);
  toolSel = it.id;
  A.status(`已新建工具预设「${it.name}」`);
}
async function renameTool(p) {
  const v = await A.promptDialog('名称：', p.name, { title: '重命名工具预设', label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.renamePreset('toolPresets', p.id, String(v).trim());
}
function exportTpl(list, name) {
  if (!list.length) return;
  const recs = list.map(p => p.brush).filter(Boolean);
  download((name || (list.length === 1 ? list[0].name : '工具预设')) + '.tpl', writeTpl(list, patternsForExport(recs)));
  A.status(`已导出 ${list.length} 个工具预设（.tpl）`);
}
export async function importTplBytes(u8, fileName) {
  const r = readTpl(u8);
  if (r.patterns.length) await store.addPresets('patterns', r.patterns.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })), { groupName: baseName(fileName) });
  const items = r.presets.map(p => ({ ...p, brush: p.brush ? storeItemOf(p.brush) : undefined }));
  const added = await store.addPresets('toolPresets', items, { replace: false });
  const bad = r.presets.filter(p => p.unsupported).length;
  return { added, msg: `${fileName}：${added.length} 个工具预设` + (bad ? `（${bad} 个是本编辑器没有的工具，列出但不能用）` : '') + (r.warnings.length ? `（${r.warnings.join('；')}）` : '') };
}
async function importTplUI() {
  const files = await pickFiles('.tpl');
  const msgs = [];
  for (const f of files) { try { msgs.push((await importTplBytes(f.data, f.name)).msg); } catch (e) { msgs.push(`${f.name}：导入失败（${e.message || e}）`); } }
  if (msgs.length) A.status(msgs.join('；'));
}

async function sortToolPresets() {
  const order = (A.toolOrder && A.toolOrder()) || [];
  const rank = t => { const i = order.indexOf(t); return i < 0 ? 1e6 : i; };
  const ids = brushLib.tools.map((p, i) => [p, i]).sort((a, b) => rank(a[0].tool) - rank(b[0].tool) || String(a[0].tool).localeCompare(String(b[0].tool)) || a[1] - b[1]).map(x => x[0].id);
  await store.reorderPresets('toolPresets', ids);
  A.status('已按工具排序工具预设');
}

async function resetToolPresets() {
  if (!brushLib.tools.length) { A.status('没有工具预设需要复位'); return; }
  const v = await A.confirmDialog('要用默认工具预设替换当前的工具预设吗？\n（Photoshop 自带的默认工具预设是 Adobe 的素材，本编辑器不内置，默认即为空。）', { title: '工具预设', okText: '确定', danger: true });
  if (!v) return;
  await store.clearPresets('toolPresets');
  toolSel = null;
  A.status('已复位工具预设');
}
async function replaceToolPresetsUI() {
  const files = await pickFiles('.tpl');
  if (!files.length) return;
  await store.clearPresets('toolPresets');
  const msgs = [];
  for (const f of files) { try { msgs.push((await importTplBytes(f.data, f.name)).msg); } catch (e) { msgs.push(`${f.name}：导入失败（${e.message || e}）`); } }
  A.status('已替换工具预设：' + msgs.join('；'));
}
function toolsMenu() {
  const sel = brushLib.tools.find(x => x.id === toolSel);
  const LIBS = ['艺术历史', '画笔', '裁剪和选框', 'DP 预设', '喷溅画笔', '文字'];
  return [
    { label: '新建工具预设…', run: () => newToolPreset() },
    { label: '重命名工具预设…', run: () => sel && renameTool(sel), disabled: !sel },
    { label: '删除工具预设', run: () => sel && store.removePreset('toolPresets', sel.id), disabled: !sel },
    { sep: true },
    { label: '按工具排序', run: () => sortToolPresets(), disabled: brushLib.tools.length < 2 },
    { label: '显示所有工具预设', checked: !onlyCurrent, run: () => setOnlyCurrent(false) },
    { label: '显示当前工具预设', checked: onlyCurrent, run: () => setOnlyCurrent(true) },
    { sep: true },
    { label: '纯文本', checked: toolView === 'text', run: () => setToolView('text') },
    { label: '小列表', checked: toolView === 'small', run: () => setToolView('small') },
    { label: '大列表', checked: toolView === 'large', run: () => setToolView('large') },
    { sep: true },
    { label: '复位工具', run: () => A.resetTool() },
    { label: '复位所有工具', run: () => A.resetAllTools() },
    { sep: true },
    { label: '预设管理器…', run: () => presetsApi.openPresetManager('toolPresets') },
    { label: 'PS 自带预设…', run: () => presetsApi.openPhotoshopPresets('toolPresets') },
    { sep: true },
    { label: '复位工具预设…', run: () => resetToolPresets() },
    { label: '载入工具预设…', run: () => importTplUI() },
    { label: '存储工具预设…', run: () => exportTpl(brushLib.tools), disabled: !brushLib.tools.length },
    { label: '替换工具预设…', run: () => replaceToolPresetsUI() },
    { label: '导出所选工具预设…', run: () => sel && exportTpl([sel]), disabled: !sel },
    { sep: true },
    ...LIBS.map(n => ({ label: n, disabled: true, why: `「${n}」是 Photoshop 自带的工具预设库（Adobe 的素材），本编辑器不内置；可在 Photoshop 里存储成 .tpl 后用「载入工具预设…」导入` })),
  ];
}

function openToolPicker(anchor) {
  document.querySelector('.bp2-tpop')?.remove();
  const pop = mk('div', { className: 'br-pop bp2-tpop' });
  pop.style.left = Math.max(4, Math.min(innerWidth - 270, anchor.left)) + 'px'; pop.style.top = (anchor.bottom + 3) + 'px';
  const head = mk('div', { className: 'bp2-thead' });
  head.append(mk('span', { className: 'grow', textContent: A.toolLabel(A.currentTool()) }));
  const nb = mk('button', { type: 'button', className: 'lf-btn', title: '创建新的工具预设' }); nb.append(A.uiIcon('add-style', 15));
  nb.onclick = () => { close(); newToolPreset(); };
  const gear = mk('button', { type: 'button', className: 'lf-btn', title: '工具预设选项' }); gear.append(A.gearIcon());
  gear.onclick = e => A.panels.popup(toolsMenu(), e.currentTarget.getBoundingClientRect());
  head.append(nb, gear);
  const list = mk('div', { className: 'bp2-tlist' });
  const fill = () => {
    list.replaceChildren();
    const items = visibleTools();
    for (const p of items) list.append(toolRow(p, p2 => { applyToolPreset(p2); close(); }, toolView));
    if (!items.length) list.append(mk('div', { className: 'panel-empty', textContent: '没有工具预设' }));
  };
  fill();
  const lab = mk('label', { className: 'bp2-only' }); const cb = mk('input', { type: 'checkbox', checked: onlyCurrent });
  cb.onchange = () => { onlyCurrent = cb.checked; try { localStorage.setItem('fp.toolPresetsOnlyCurrent', onlyCurrent ? '1' : '0'); } catch {} fill(); renderTools(); };
  lab.append(cb, document.createTextNode('仅限当前工具'));
  pop.append(head, list, lab);
  document.body.append(pop);
  const outside = e => { if (!pop.contains(e.target) && !e.target.closest('.menu-pop, .ps-popup, .popup-menu')) close(); };
  function close() { pop.remove(); removeEventListener('pointerdown', outside, true); }
  setTimeout(() => addEventListener('pointerdown', outside, true), 0);
}


const CSS = `
.bp2-panel { display: flex; flex-direction: column; min-height: 0; }
.bp2-top { padding: 5px 6px 3px; display: flex; flex-direction: column; gap: 4px; flex: none; }
.bp2-search { width: 100%; box-sizing: border-box; height: 22px; font-size: 12px; }
.bp2-size { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ps-text, #ddd); }
.bp2-size input { flex: 1; min-width: 40px; }
.bp2-size span:last-child { min-width: 52px; text-align: right; color: var(--ps-muted, #aaa); }
.bp2-grid { display: flex; flex-wrap: wrap; gap: 3px; padding: 2px 0 6px 14px; }
.bp2-grid.row { flex-direction: column; flex-wrap: nowrap; gap: 1px; }
.bp2-tile { position: relative; display: flex; align-items: center; gap: 6px; cursor: default; border-radius: 2px; border: 1px solid transparent; }
.bp2-tile.thumb { width: 44px; height: 44px; justify-content: center; background: #2a2a2a; }
.bp2-tile.thumb canvas { max-width: 100%; max-height: 100%; }
.bp2-tile.thumb .bp2-sz { position: absolute; right: 2px; bottom: 0; font-size: 9px; color: var(--ps-muted, #aaa); }
.bp2-tile.row { padding: 1px 4px; }
.bp2-recent { display: flex; gap: 2px; overflow: hidden; padding-bottom: 2px; border-bottom: 1px solid #1c1c1c; }
.bp2-rtile { position: relative; flex: none; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #2a2a2a; border: 1px solid transparent; border-radius: 2px; }
.bp2-rtile:hover { border-color: #777; }
.bp2-rtile.on { border-color: var(--ps-accent, #1473e6); }
.bp2-rtile .bp2-sz { position: absolute; right: 1px; bottom: -1px; font-size: 8px; color: var(--ps-muted, #aaa); }
.bp2-thumbsz { width: 70px; }
.bp2-tile .bp2-sz { font-size: 10px; color: var(--ps-muted, #aaa); min-width: 22px; }
.bp2-tile .bp2-name { font-size: 11px; color: var(--ps-text, #ddd); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bp2-tile:hover { border-color: #777; }
.bp2-tile.on { border-color: var(--ps-accent, #1473e6); background: var(--ps-sel, #3a4a5e); }
.bp2-tile.drop { box-shadow: 0 -2px 0 var(--ps-accent, #1473e6); }
.bp2-stroke { background: #fff; border-radius: 2px; }
.bp2-trow { display: flex; align-items: center; gap: 6px; padding: 3px 6px; font-size: 12px; cursor: default; }
.bp2-trow:hover { background: #3a3a3a; }
.bp2-trow.on { background: var(--ps-accent, #1473e6); color: #fff; }
.bp2-trow.large { padding: 4px 6px; min-height: 34px; }
.bp2-trow.text { padding: 2px 8px; }
.bp2-only { display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 4px 6px; }
.bp2-tpop { position: fixed; z-index: 1000; width: 260px; background: var(--ps-panel, #323232); border: 1px solid #111; box-shadow: 0 4px 16px rgba(0,0,0,.5); display: flex; flex-direction: column; }
.bp2-thead { display: flex; align-items: center; gap: 4px; padding: 4px 6px; border-bottom: 1px solid #1c1c1c; font-size: 12px; }
.bp2-thead .grow { flex: 1; }
.bp2-tlist { max-height: 260px; overflow: auto; min-height: 60px; }
`;
export async function installBrushLibrary(api) {
  A = api;
  if (!document.getElementById('bp2Css')) document.head.append(mk('style', { id: 'bp2Css', textContent: CSS }));
  api.panels.setPanelMenu('brushes', () => panelMenu());
  api.panels.setPanelMenu('toolPresets', () => toolsMenu());
  registerPresetFormat('brushes', {
    ext: 'abr', label: '画笔',
    read: (b, name) => { const r = readAbr(b); const items = r.brushes.map(x => storeItemOf(x)); items._patterns = r.patterns; items._warn = r.warnings; return items; },
    write: items => writeAbr(items, patternsForExport(items)),
    import: async (items, name) => {
      if (items._patterns && items._patterns.length) await store.addPresets('patterns', items._patterns.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })), { groupName: baseName(name) });
      await store.addPresets('brushes', items, { groupName: baseName(name), replace: false });
    },
  });
  registerPresetFormat('toolPresets', {
    ext: 'tpl', label: '工具预设',
    read: b => { const r = readTpl(b); const items = r.presets.map(p => ({ ...p, brush: p.brush ? storeItemOf(p.brush) : undefined })); items._patterns = r.patterns; return items; },
    write: items => writeTpl(items, patternsForExport(items.map(p => p.brush).filter(Boolean))),
    import: async (items, name) => {
      if (items._patterns && items._patterns.length) await store.addPresets('patterns', items._patterns.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })), { groupName: baseName(name) });
      await store.addPresets('toolPresets', items, { replace: false });
    },
  });
  if (api.tools && api.tools.onPresetPicker) api.tools.onPresetPicker(anchor => openToolPicker(anchor));
  store.onPresetsChange(ev => { if (ev.kind === 'brushes') reload(); else if (ev.kind === 'toolPresets') reloadTools(); });
  const bp = hostEl();
  if (bp) new MutationObserver(() => { if (!bp.hidden) render(); }).observe(bp, { attributes: true, attributeFilter: ['hidden'] });
  const tp = toolHost();
  if (tp) new MutationObserver(() => { if (!tp.hidden) renderTools(); }).observe(tp, { attributes: true, attributeFilter: ['hidden'] });
  await reload();
  await reloadTools();
  return brushLib;
}
export const brushPanel = { get opts() { return { ...bopt }; }, setOpt, get recent() { return [...recent]; }, panelMenu: () => panelMenu(), newFromCurrent, render, renderTools, defineBrush, importAbrBytes, importTplBytes, exportAbr, exportTpl, applyToolPreset, openToolPicker, brushLib };
if (typeof window !== 'undefined') window.__psd_editorBrushes = brushPanel;
