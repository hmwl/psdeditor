




import './43-gradient-map-adjust-form.js';   
import { actions } from '../actions.js';
import { promptDialog, formDialog } from '../dialog.js';
import { panels } from '../panels.js';
import { PATH_UI_ICONS } from '../path-icons.js';
import { decodePathName } from '../path-name-codec.js';
import { isShapeLayer } from '../property-panel.js';
import { shell } from '../shell.js';
import { $, EDIT, EDITM, SELECT, ensureLazy, getVectorMaskPath, getVectorStroke, kick } from './01-boot.js';
import {
  doc, docH, docW, layerDeletes, layerDupes, layerRenames, layerTree, li, origBuffer, selection,
} from './02-doc-state.js';
import { pushDocHistory } from './03-history.js';
import { docImageResources } from './08-doc-size.js';
import {
  activePath, afterWorkPathChange, clearWorkPath, cloneDocSubs, docPathLabel, ensureDocPaths,
  fillSubpathsPixels, getDocPath, isDocPathKey, pathTargetKey, savedPaths, set_activePath, set_savedPaths,
  set_savedPathsDirty, set_workPath, set_workPathDirty, workPath, workPathToSelection,
} from './17-shape-pen.js';
import { densifyPts, fitBezierClosed } from './18-pen-extra.js';
import { renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { findLayerOp, humanEditError, renderProps } from './24-layer-ops-queue.js';
import { parseHex6 } from './27-gradient-editor.js';
import { mkEl } from './28-layer-props-transform.js';
import { bgRGB, brush, docTool, fgRGB, hexOf } from './31-selection-brush.js';
import { selPath } from './32-cursors-select-options.js';
import { beginStroke, endStroke, repaintStrokeLayer, strokeTo } from './38-brush-engine.js';
import { pathSelAnchors, pathSelSubs, pathToSelection } from './45-path-tools.js';

















export const vpathCache = {};            
export const vstrokeCache = {};          
export let pathModel = null;             
export function set_pathModel(v) { return (pathModel = v); }   
export let pathSelNode = null;           
export function set_pathSelNode(v) { return (pathSelNode = v); }   
export let pathHoverNode = -1;           
export function set_pathHoverNode(v) { return (pathHoverNode = v); }   
export let pathDrag = null;              
export function set_pathDrag(v) { return (pathDrag = v); }   
export let pathNodes = [];               
export function set_pathNodes(v) { return (pathNodes = v); }   

export const PATH_OPS = [['combine', '合并形状'], ['subtract', '减去顶层形状'],
                  ['intersect', '与形状区域相交'], ['exclude', '排除重叠形状']];








const docPathsCache = new WeakMap();
export function docSavedPaths(){
  if (!origBuffer) return [];
  const cached = docPathsCache.get(origBuffer);
  if (cached && cached.width === docW && cached.height === docH) return cached.list;
  let list = [];
  try {
    const res = docImageResources(origBuffer);
    list = res.filter(r => (r.id >= 2000 && r.id <= 2997) || r.id === 1025).map(r => {
      const recs = (r.data && r.data.records) || [];
      const groups = [];
      let cur = null;
      for (const rec of recs) {
        if (rec.type === 'subpath') { cur = { closed: !rec.open, operation: rec.operation >= 0 && rec.operation <= 3 ? rec.operation : 1, knots: [] }; groups.push(cur); }
        else if (rec.type === 'knot' && cur) cur.knots.push({
          anchor: [rec.fixed[3] / 0x1000000 * docW, rec.fixed[2] / 0x1000000 * docH],
          in: [rec.fixed[1] / 0x1000000 * docW, rec.fixed[0] / 0x1000000 * docH],
          out: [rec.fixed[5] / 0x1000000 * docW, rec.fixed[4] / 0x1000000 * docH],
        });
      }
      return { id: r.id, name: (r.name && decodePathName(r.name)) || (r.id === 1025 ? '工作路径' : '路径 ' + (r.id - 1999)),
               working: r.id === 1025, subpaths: groups };
    }).filter(p => p.subpaths.length);
  } catch { list = []; }
  docPathsCache.set(origBuffer, { width: docW, height: docH, list });
  return list;
}

export function pathPanelRows(){
  if (!doc) return [];
  ensureDocPaths();
  const rows = [];
  const flat = (layerTree && layerTree.flat) || [];
  for (let i = 0; i < flat.length; i++) {
    const l = flat[i];
    if (!l || !(l.vectorMask || (l.mask && l.mask.vector) || l.hasVectorMask)) continue;
    const vp = readVectorPath(i);
    const subpaths = (i === selLayer && effPathSubpaths(i)) || (vp && !vp.error && Array.isArray(vp.subpaths) ? vp.subpaths : []);
    const shape = isShapeLayer(l);
    rows.push({ kind: 'layer', index: i, current: i === selLayer && !activePath, italic: true,
                name: `${layerRenames[i] || l.name || ('图层 ' + i)} ${shape ? '形状路径' : '矢量蒙版'}`,
                tag: '', subpaths, docW, docH,
                title: vp && vp.error ? '路径读不出来：' + vp.error : '点一下选中这个图层的路径（路径选择 / 直接选择工具 A 可以编辑它）' });
  }
  if (workPath)
    rows.push({ kind: 'work', key: 'work', name: '工作路径', italic: true, current: activePath === 'work',
                subpaths: workPath.subpaths, docW, docH,
                title: '工作路径（临时的：没选中它时再画路径会被替换掉）· 双击存储路径 · 导出时写成图像资源 1025' });
  savedPaths.forEach((p, i) => rows.push({ kind: 'saved', key: 'saved:' + i, name: p.name, current: activePath === 'saved:' + i,
    subpaths: p.subpaths, docW, docH, title: `已保存的路径「${p.name}」· 双击改名 · 导出时写成图像资源 ${2000 + i}` }));
  return rows;
}

export function onPathRowClick(r){
  if (!r) { if (activePath) { set_activePath(null); pathModel = null; pathSelSubs.clear(); afterWorkPathChange(); } return; }
  if (r.kind === 'layer') {
    set_activePath(null); pathModel = null; pathSelSubs.clear();
    if (selLayer !== r.index) { set_selLayer(r.index); selLayers.clear(); selLayers.add(r.index); renderLayerPanel(); renderProps(); }
    afterWorkPathChange(); return;
  }
  set_activePath(r.key); pathModel = null; pathSelSubs.clear(); pathSelAnchors.clear();
  afterWorkPathChange();
  shell.status(`已选中「${r.name}」：路径选择 / 直接选择工具（A）编辑它，⌘/Ctrl+Enter 载入为选区`);
}
async function onPathRowDblClick(r){
  if (!r) return;
  if (r.kind === 'work') return saveWorkPathUI();
  if (r.kind === 'saved') {
    const i = +r.key.slice(6), p = savedPaths[i]; if (!p) return;
    const v = await promptDialog('重命名路径', p.name, { label: '名称' });
    if (v == null || !String(v).trim() || String(v).trim() === p.name) return;
    pushDocHistory('重命名路径');
    set_savedPaths(savedPaths.map((q, j) => j === i ? { name: String(v).trim(), subpaths: q.subpaths } : q));
    set_savedPathsDirty(true); afterWorkPathChange();
  }
}
export const nextPathName = () => { let n = 1; const used = new Set(savedPaths.map(p => p.name)); while (used.has('路径 ' + n)) n++; return '路径 ' + n; };

export async function saveWorkPathUI(name){
  ensureDocPaths();
  if (!workPath) { $('#notice').textContent = '没有工作路径可以存储。'; return false; }
  const v = name != null ? name : await promptDialog('存储路径', nextPathName(), { label: '名称' });
  if (v == null || !String(v).trim()) return false;
  pushDocHistory('存储路径');
  set_savedPaths(savedPaths.concat({ name: String(v).trim(), subpaths: workPath.subpaths }));
  set_savedPathsDirty(true); set_workPath(null); set_workPathDirty(true);
  set_activePath('saved:' + (savedPaths.length - 1));
  afterWorkPathChange();
  return true;
}

export function newSavedPathUI(name){
  ensureDocPaths();
  pushDocHistory('新建路径');
  set_savedPaths(savedPaths.concat({ name: name || nextPathName(), subpaths: [] }));
  set_savedPathsDirty(true); set_activePath('saved:' + (savedPaths.length - 1));
  afterWorkPathChange();
  return activePath;
}

async function duplicatePathUI(){
  const key = activePath; const p = key && getDocPath(key);
  if (!p) { $('#notice').textContent = '先在路径面板里选中一条工作路径或已保存路径。'; return false; }
  const v = await promptDialog('复制路径', (key === 'work' ? '路径' : p.name) + ' 拷贝', { label: '名称' });
  if (v == null || !String(v).trim()) return false;
  pushDocHistory('复制路径');
  set_savedPaths(savedPaths.concat({ name: String(v).trim(), subpaths: cloneDocSubs(p.subpaths) }));
  set_savedPathsDirty(true); set_activePath('saved:' + (savedPaths.length - 1));
  afterWorkPathChange(); return true;
}

export function deleteActivePathUI(){
  ensureDocPaths();
  const key = activePath;
  if (key === 'work') return clearWorkPath();
  if (key && key.startsWith('saved:')) {
    const i = +key.slice(6); if (!savedPaths[i]) return false;
    pushDocHistory('删除路径');
    set_savedPaths(savedPaths.filter((_, j) => j !== i)); set_savedPathsDirty(true); set_activePath(null);
    afterWorkPathChange(); return true;
  }
  if (selLayer >= 0 && readVectorPath(selLayer) && !readVectorPath(selLayer).error) {
    try { return actions.run('layer.vectorMask.delete'); } catch { $('#notice').textContent = '删除图层的矢量蒙版：图层 › 矢量蒙版 › 删除。'; }
  }
  $('#notice').textContent = '先在路径面板里选中一条路径。';
  return false;
}

export function panelPathSubs(){
  const k = pathTargetKey();
  return isDocPathKey(k) ? (getDocPath(k) || {}).subpaths : (k >= 0 ? effPathSubpaths(k) : null);
}

export async function fillPathUI(opts){
  const subs = panelPathSubs();
  if (!subs || !subs.length) { $('#notice').textContent = '先选中一条路径（路径面板）。'; return false; }
  let o = opts;
  if (!o) {
    o = await formDialog('填充子路径', [
      { key: 'use', label: '内容', type: 'select', value: 'fg', options: [['fg', '前景色'], ['bg', '背景色'], ['color', '颜色…'], ['white', '白色'], ['black', '黑色'], ['gray', '50% 灰色']] },
      { key: 'color', label: '颜色', type: 'color', value: hexOf(fgRGB), showIf: v => v.use === 'color' },
      { key: 'opacity', label: '不透明度 (%)', value: 100, min: 1, max: 100 },
      { key: 'feather', label: '羽化半径 (像素)', value: 0, min: 0, max: 250, step: 0.1 },
      { key: 'anti', label: '消除锯齿', type: 'check', value: true },
    ]);
    if (!o) return false;
  }
  const col = o.use === 'bg' ? bgRGB : o.use === 'white' ? [255, 255, 255] : o.use === 'black' ? [0, 0, 0]
    : o.use === 'gray' ? [128, 128, 128] : o.use === 'color' ? parseHex6(o.color) || fgRGB : fgRGB;
  return fillSubpathsPixels(subs, '填充路径', { color: col, opacity: (+o.opacity || 100) / 100, feather: +o.feather || 0, anti: o.anti !== false });
}

export async function strokePathUI(opts){
  const subs = panelPathSubs();
  if (!subs || !subs.length) { $('#notice').textContent = '先选中一条路径（路径面板）。'; return false; }
  let o = opts;
  if (!o) {
    o = await formDialog('描边路径', [
      { key: 'tool', label: '工具', type: 'select', value: docTool === 'pencil' || docTool === 'eraser' ? docTool : 'brush', options: [['brush', '画笔'], ['pencil', '铅笔'], ['eraser', '橡皮擦']] },
      { key: 'sim', label: '模拟压力', type: 'check', value: false },
    ]);
    if (!o) return false;
  }
  const pts = [];
  for (const sp of subs) { const poly = flattenSub(sp, 1); if (poly.length) pts.push(poly); }
  let S = null, n = 0;
  for (const poly of pts) {
    const tool = o.tool || 'brush';
    const one = beginStroke({ x: poly[0][0], y: poly[0][1] }, { erase: tool === 'eraser', aliased: tool === 'pencil', ...(tool === 'pencil' ? { hardness: 1 } : {}) });
    if (!one) return false;
    const L = poly.length;
    for (let i = 1; i < L; i++) {
      if (o.sim) { const t = i / (L - 1); one.radius = Math.max(0.5, Math.max(1, brush.size) / 2 * Math.sin(Math.PI * t)); }
      strokeTo(one, { x: poly[i][0], y: poly[i][1] });
    }
    one.forced = true; endStroke(); S = one; n++;
  }
  if (S) repaintStrokeLayer(S);
  shell.status(`已沿 ${n} 条子路径描边（${({ brush: '画笔', pencil: '铅笔', eraser: '橡皮擦' })[o.tool || 'brush']}，用它当前的大小 / 硬度 / 不透明度）`);
  return true;
}

export function flattenSub(sp, step = 1){
  const K = sp.knots || []; if (!K.length) return [];
  const out = [K[0].anchor.slice()];
  const n = sp.closed !== false ? K.length : K.length - 1;
  for (let i = 0; i < n; i++) {
    const a = K[i], b = K[(i + 1) % K.length];
    const c1 = a.out || a.anchor, c2 = b.in || b.anchor;
    const len = Math.hypot(c1[0] - a.anchor[0], c1[1] - a.anchor[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(b.anchor[0] - c2[0], b.anchor[1] - c2[1]);
    const seg = Math.max(1, Math.ceil(len / step));
    for (let q = 1; q <= seg; q++) {
      const u = q / seg, v = 1 - u;
      out.push([v * v * v * a.anchor[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b.anchor[0],
                v * v * v * a.anchor[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b.anchor[1]]);
    }
  }
  return out;
}

export async function pathToSelectionUI(dialog, mode){
  if (!await ensureLazy(SELECT, '将路径作为选区载入')) return false;
  const k = pathTargetKey();
  let o = { feather: 0, anti: true, mode: mode || 'replace' };
  if (dialog) {
    const r = await formDialog('建立选区', [
      { key: 'feather', label: '羽化半径 (像素)', value: 0, min: 0, max: 250, step: 0.1 },
      { key: 'anti', label: '消除锯齿', type: 'check', value: true },
      { key: 'mode', label: '操作', type: 'select', value: selection ? 'replace' : 'replace', options: [['replace', '新建选区'], ['add', '添加到选区'], ['subtract', '从选区中减去'], ['intersect', '与选区交叉']] },
    ]);
    if (!r) return false; o = r;
  }
  if (isDocPathKey(k)) return workPathToSelection(o.mode, k, o);
  if (k >= 0 && !pathGuard(k)) { pathToSelection(k, o.mode, o); return true; }
  $('#notice').textContent = '先选中一条路径（路径面板）。'; return false;
}


export async function selectionToWorkPathUI(tol){
  if (!doc || !selection) { $('#notice').textContent = '先做一个选区。'; return false; }
  if (!await ensureLazy(SELECT, '从选区生成工作路径')) return false;
  let t = tol;
  if (t == null) {
    const r = await formDialog('建立工作路径', [{ key: 'tol', label: '容差 (像素)', value: 2, min: 0.5, max: 10, step: 0.1 }]);
    if (!r) return false; t = +r.tol || 2;
  }
  const polys = selPath().filter(p => p.length >= 6);
  if (!polys.length) { $('#notice').textContent = '这个选区描不出路径（太小或全透明）。'; return false; }
  const subs = polys.map(flat => {
    const pts = []; for (let k = 0; k + 1 < flat.length; k += 2) pts.push({ x: flat[k], y: flat[k + 1] });
    return { closed: true, operation: 1, knots: fitBezierClosed(densifyPts(pts, 1), Math.max(0.5, Math.min(10, t))) };
  }).filter(sp => sp.knots.length >= 2);
  pushDocHistory('建立工作路径');
  set_workPath({ subpaths: subs }); set_workPathDirty(true); set_activePath('work');
  afterWorkPathChange();
  shell.status(`已从选区建立工作路径：${subs.length} 条子路径，${subs.reduce((a, s) => a + s.knots.length, 0)} 个锚点（容差 ${t} 像素）`);
  return true;
}

function pathToMaskUI(){
  const subs = panelPathSubs();
  if (!subs || !subs.length || !isDocPathKey(pathTargetKey())) { try { return actions.run('layer.mask.revealAll'); } catch { return false; } }
  try { return actions.run('layer.vectorMask.currentPath'); } catch { return false; }
}

let pathFootBound = false;
export let pathsMenuBase = null;          
export function bindPathPanelChrome(){
  if (pathFootBound) return;
  const host = $('#panelPaths'); if (!host) return;
  pathFootBound = true;
  const foot = mkEl('div', { className: 'layer-foot path-foot' });
  const B = [
    ['fillPath', '用前景色填充路径（⌥ 点：填充路径…）', e => fillPathUI(e.altKey ? null : { use: 'fg', opacity: 100, feather: 0, anti: true })],
    ['strokePath', '用画笔描边路径（⌥ 点：描边路径…）', e => strokePathUI(e.altKey ? null : { tool: 'brush' })],
    ['loadPath', '将路径作为选区载入（⌥ 点：建立选区…）', e => pathToSelectionUI(e.altKey)],
    ['workPath', '从选区生成工作路径（⌥ 点：建立工作路径…）', e => selectionToWorkPathUI(e.altKey ? null : 2)],
    ['addMask', '添加蒙版（选中路径时 = 当前路径的矢量蒙版）', () => pathToMaskUI()],
    ['newPath', '创建新路径', () => newSavedPathUI()],
    ['trash', '删除当前路径', () => deleteActivePathUI()],
  ];
  for (const [ic, title, fn] of B) {
    const b = mkEl('button', { type: 'button', className: 'lf-btn', title });
    b.dataset.pathAction = ic;
    const img = mkEl('img', { src: PATH_UI_ICONS[ic], width: 20, height: 13, alt: title });
    if (ic === 'newPath') { img.width = 16; img.height = 16; }
    img.style.cssText = 'display:block;pointer-events:none';
    b.append(img); b.onclick = fn;
    foot.append(b);
  }
  host.append(foot);
  const list = $('#pathList');
  
  list.addEventListener('click', e => { if (e.target === list) onPathRowClick(null); });
  list.addEventListener('dblclick', e => {
    const row = e.target.closest('.path-row'); if (!row) return;
    const r = pathPanelRows()[[...list.children].indexOf(row)]; onPathRowDblClick(r);
  });
  
  list.addEventListener('click', e => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const row = e.target.closest('.path-row'); if (!row) return;
    const r = pathPanelRows()[[...list.children].indexOf(row)]; if (!r) return;
    const mode = e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';
    setTimeout(() => pathToSelectionUI(false, mode), 0);
  }, true);
  panels.setPanelMenu('paths', pathsMenuBase = () => {      
    const k = pathTargetKey(), hasDoc = !!doc, subs = hasDoc && panelPathSubs();
    const has = !!(subs && subs.length);
    return [
      { label: '新建路径…', disabled: !hasDoc, run: async () => { const v = await promptDialog('新建路径', nextPathName(), { label: '名称' }); if (v != null && String(v).trim()) newSavedPathUI(String(v).trim()); } },
      { label: '存储路径…', disabled: !(activePath === 'work' && workPath), run: () => saveWorkPathUI() },
      { label: '复制路径…', disabled: !(activePath && getDocPath(activePath)), run: () => duplicatePathUI() },
      { label: '删除路径', disabled: !activePath && !(k >= 0 && has), run: () => deleteActivePathUI() },
      { sep: true },
      { label: '建立工作路径…', disabled: !selection, run: () => selectionToWorkPathUI(null) },
      { label: '建立选区…', disabled: !has, run: () => pathToSelectionUI(true) },
      { label: '填充路径…', disabled: !has, run: () => fillPathUI(null) },
      { label: '描边路径…', disabled: !has, run: () => strokePathUI(null) },
    ];
  });
}








export function fileLayerIndex(i){
  const N = doc ? doc.layers.length - layerDupes.length : 0;
  const d = i >= N ? layerDupes[i - N] : null;
  return d ? d.src : i;
}
export function readVectorPath(idx){
  if (vpathCache[idx] !== undefined) return vpathCache[idx];
  if (!EDITM) { kick(EDIT); return { error: EDIT.statusText(), lazy: true }; }
  let p = null;
  if (origBuffer) { try { p = getVectorMaskPath(origBuffer, fileLayerIndex(idx)); } catch (e) { p = { error: humanEditError(e && e.message || e) }; } }
  return (vpathCache[idx] = p);
}
export function readVectorStroke(idx){
  if (vstrokeCache[idx] !== undefined) return vstrokeCache[idx];
  if (!EDITM) { kick(EDIT); return { error: EDIT.statusText(), lazy: true }; }
  let s = null;
  if (origBuffer) { try { s = getVectorStroke(origBuffer, fileLayerIndex(idx)); } catch (e) { s = { error: humanEditError(e && e.message || e) }; } }
  return (vstrokeCache[idx] = s);
}
export const clonePathSubpaths = sp => sp.map(s => ({
  closed: s.closed !== false, operation: s.operation == null ? null : s.operation,
  knots: s.knots.map(k => ({ anchor: k.anchor.slice(), in: (k.in || k.anchor).slice(), out: (k.out || k.anchor).slice(), linked: !!k.linked })),
}));
export const nearNum = (a, b) => Math.abs(a - b) <= 1e-6;
export function pathSubpathsEq(a, b){
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if ((x.closed !== false) !== (y.closed !== false)) return false;
    if ((x.operation || null) !== (y.operation || null)) return false;
    if (x.knots.length !== y.knots.length) return false;
    for (let j = 0; j < x.knots.length; j++) {
      const p = x.knots[j], q = y.knots[j];
      if (!!p.linked !== !!q.linked) return false;
      for (const w of ['anchor', 'in', 'out']) {
        const u = p[w] || p.anchor, v = q[w] || q.anchor;
        if (!nearNum(u[0], v[0]) || !nearNum(u[1], v[1])) return false;
      }
    }
  }
  return true;
}

export function effPathSubpaths(idx){
  if (isDocPathKey(idx)) { const p = getDocPath(idx); return p ? p.subpaths : null; }
  const op = findLayerOp(idx, 'setVectorMaskPath');
  if (op) return op.subpaths;
  const p = readVectorPath(idx);
  return p && !p.error ? p.subpaths : null;
}

export function pathWorking(idx){
  const src = effPathSubpaths(idx);
  if (!src) { if (pathModel && pathModel.idx === idx) pathModel = null; return null; }
  if (pathModel && pathModel.idx === idx && pathModel.src === src) return pathModel.subpaths;
  pathModel = { idx, src, subpaths: clonePathSubpaths(src) };
  pathSelNode = null;
  return pathModel.subpaths;
}
export function pathGuard(idx = pathTargetKey()){
  if (!doc) return '先打开一个 PSD';
  if (li) return '正在变形编辑中：先退出变形（Esc）再编辑路径';
  if (isDocPathKey(idx)) { const dp = getDocPath(idx); return dp && dp.subpaths.length ? '' : `「${docPathLabel(idx)}」里还没有子路径：先用钢笔或形状工具（路径模式）画一条`; }
  if (!(idx >= 0)) return '先在图层面板里选中一个图层';
  if (layerDeletes.has(idx)) return '这个图层已排队删除：先在图层面板恢复它';
  const p = readVectorPath(idx);
  if (p && p.error) return '这个图层的矢量蒙版读不出来：' + p.error;
  if (!p) return '没有选中的路径：在路径面板里选一条路径，或选中一个形状 / 带矢量蒙版的图层（用钢笔 / 形状工具先画一条）';
  if (!p.subpaths.length) return '这个矢量蒙版里没有子路径';
  return '';
}
