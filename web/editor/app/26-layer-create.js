




import './25-presets-actions-wiring.js';   
import {
  parsePsdRaster, compositeAll, replacePsdCompositeImage, reorderLayers, setTextLayerMeta, parsePsdFull, removeImageResource,
  syncLayerCountResources, pruneOrphanLinkedFiles,
} from '../../../core/app.js';
import { currentPatternId } from '../presets-panels.js';
import { startRasterWarpToolbar, stopRasterWarpToolbar, preserveRasterWarpStyle } from '../transform-warp-raster.js';
import { prepareWarpCachedPreview, warpMeshSignature } from '../warp-cached-preview.js';
import { computeHomographyQuad, applyHomography } from '../../../core/homography.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy, getVectorMaskPath } from './01-boot.js';
import {
  LP, doc, docH, docName, docStack, docW, layerDeletes, layerRenames, layerTransforms, layerTree, li,
  origBuffer, soEdits, soRepl, sos,
} from './02-doc-state.js';
import { actRecord, structuralApply, structuralBegin, structuralDone } from './03-history.js';
import { rasterKindOf, rasterizeLayerUI } from './05-layer-lock-guides.js';
import { commit, tfFrame } from './06-view-zoom-move.js';
import { docResolution } from './08-doc-size.js';
import { gradPresetModel } from './11-paint-common.js';
import { commitFreeTransform, restoreFreeTransformHistory, tfState } from './19-free-transform.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { decodeImageFile, initDocument, isImageFileName, selectSO } from './21-load-document.js';
import { exitSO, matchLayer } from './22-deform-tools.js';
import { layerOrderView, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import {
  buildGradientEditor, gradClone, gradModelStops, gradNewModel, setLayerBlend, setLayerOpacity,
} from './27-gradient-editor.js';
import { transformBase, transformChanged } from './28-layer-props-transform.js';
import { renderWarpNow, viewScratch } from './30-render.js';
import { bgRGB, fgRGB, hexOf } from './31-selection-brush.js';
import { buildPsdBuffer, ensureStructuralBase, setWaitCursor } from './48-info-export.js';
import { composeSegmentRGBA, cropRGBABox, tightAlphaBox, topLevelBlockList } from './50-clipboard-merge-mask.js';







const FILL_LAYER_LABEL = { solid: '纯色', gradient: '渐变', pattern: '图案' };
export let fillDlgState = null;


export function docPatterns(){
  const list = (doc && doc.patterns) || [];
  return list.map(p => ({ id: p.id, name: p.name || p.id })).filter(p => p.id);
}
export async function openNewFillDialog(kind, preset){
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, '新建填充图层')) return false;
  const pats = docPatterns();
  if (kind === 'pattern' && !pats.length) {
    $('#notice').textContent = '图案库是空的：先用「编辑 › 定义图案…」定义一个图案，或在图案面板里导入 .pat。';
    return false;
  }
  fillDlgState = {
    kind,
    color: hexOf(fgRGB),
    grad: { type: 'linear', angle: 90, reverse: false, dither: true, model: gradNewModel(fgRGB.slice(), bgRGB.slice()) },
    pattern: (preset && kind === 'pattern' && pats.some(p => p.id === preset)) ? preset
      : pats.some(p => p.id === currentPatternId()) ? currentPatternId() : (pats[0] ? pats[0].id : ''),
    scale: 100,
  };
  if (preset && kind === 'gradient') fillDlgState.grad.model = gradClone(gradPresetModel(preset));
  renderNewFillDialog();
  const dlg = $('#fillDlg');
  if (!dlg.open) { if (dlg.showModal) { try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', ''); }
  return true;
}
export function renderNewFillDialog(){
  const S = fillDlgState; if (!S) return;
  $('#fillTitle').textContent = `新建${FILL_LAYER_LABEL[S.kind]}填充图层`;
  const body = $('#fillBody'); body.innerHTML = '';
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const row = (label, ...els) => { const r = mk('div', { className: 'arow' }); r.append(mk('label', { className: 'k', textContent: label }), ...els); body.append(r); return r; };
  if (S.kind === 'solid') {
    const c = mk('input', { type: 'color', value: S.color, id: 'fillColor' });
    c.oninput = () => { S.color = c.value; };
    row('颜色', c);
  } else if (S.kind === 'gradient') {
    const sel = mk('select', { id: 'fillGradType' });
    for (const [v, t] of [['linear', '线性'], ['radial', '径向'], ['angle', '角度'], ['reflected', '对称'], ['diamond', '菱形']])
      sel.append(mk('option', { value: v, textContent: t }));
    sel.value = S.grad.type;
    sel.onchange = () => { S.grad.type = sel.value; };
    row('样式', sel);
    const a = mk('input', { type: 'number', min: -360, max: 360, step: 1, value: S.grad.angle, id: 'fillGradAngle' });
    a.onchange = () => { S.grad.angle = Math.max(-360, Math.min(360, +a.value || 0)); };
    row('角度', a, mk('span', { className: 'k', textContent: '度', style: 'width:auto;flex:none' }));
    
    const host = mk('div');
    host.id = 'fillGradEditor';
    buildGradientEditor(host, S.grad.model, () => {});
    body.append(host);
    const rv = mk('input', { type: 'checkbox', checked: S.grad.reverse, id: 'fillGradRev' });
    rv.onchange = () => { S.grad.reverse = rv.checked; };
    row('反向', rv);
  } else {
    const sel = mk('select', { id: 'fillPattern' });
    for (const p of docPatterns()) sel.append(mk('option', { value: p.id, textContent: p.name }));
    sel.value = S.pattern;
    sel.onchange = () => { S.pattern = sel.value; };
    row('图案', sel);
    const sc = mk('input', { type: 'number', min: 1, max: 1000, step: 1, value: S.scale, id: 'fillScale' });
    sc.onchange = () => { S.scale = Math.max(1, Math.min(1000, +sc.value || 100)); };
    row('缩放', sc, mk('span', { className: 'k', textContent: '%', style: 'width:auto;flex:none' }));
  }
  $('#fillNotes').innerHTML = '';
  $('#fillNotes').append(mk('div', { className: 'anote plain',
    textContent: '填充图层铺满整个画布、没有自己的像素；要限定范围就在它上面加图层蒙版。这是结构性改动，确定后会写入文档并重新载入。' }));
}
export async function commitNewFillLayer(){
  const S = fillDlgState; if (!S || !doc || !origBuffer) return false;
  const dirty = hasAnyEdits();
  const d = $('#fillDlg'); if (d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } else d.removeAttribute('open');
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    let baseLayerCount = doc.layers.length;
    try { baseLayerCount = parsePsdFull(base).layers.length; } catch {}
    const at = Math.min(selLayer >= 0 ? selLayer + 1 : baseLayerCount, baseLayerCount);
    const op = { op: 'addFillLayer', kind: S.kind, at, name: FILL_LAYER_LABEL[S.kind] + '填充' };
    if (S.kind === 'solid') op.color = S.color;
    else if (S.kind === 'gradient') op.gradient = {
      type: S.grad.type, angle: S.grad.angle, reverse: S.grad.reverse, dither: S.grad.dither,
      ...gradModelStops(S.grad.model),
    };
    else op.pattern = { name: (docPatterns().find(p => p.id === S.pattern) || {}).name || S.pattern, id: S.pattern, scale: S.scale };
    const fops = [op];
    if (LP && LP.opts.defaultMask) fops.push({ op: 'addLayerMask', index: at, fill: 'reveal', compact: docW * docH > 64e6, bounds: { top: 0, left: 0, bottom: docH, right: docW }, defaultColor: 255 });   
    const r = applyEdits(base, fops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, `新建${FILL_LAYER_LABEL[S.kind]}填充图层`);
    const msg = `已新建${FILL_LAYER_LABEL[S.kind]}填充图层（第 ${at} 层）：结构性改动，已写入文档并重新载入。`;
    $('#notice').textContent = msg; shell.status(msg);
    fillDlgState = null;
    return true;
  } catch (e) {
    $('#err').textContent = `新建${FILL_LAYER_LABEL[S.kind]}填充图层没能完成：` + humanEditError(e && e.message || e);
    fillDlgState = null;
    return false;
  }
}
$('#fillOk').onclick = () => commitNewFillLayer();
$('#fillCancel').onclick = () => { fillDlgState = null; const d = $('#fillDlg'); if (d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } else d.removeAttribute('open'); };
$('#fillDlg').addEventListener('cancel', ev => { ev.preventDefault(); $('#fillCancel').onclick(); });












export async function newGroupUI(){
  if (li || !doc || !origBuffer) return;
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  try {
    if (!await ensureLazy(EDIT, '新建组')) return;
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const view = layerOrderView();
    let at = view.order.length;                       
    const node = selLayer >= 0 ? view.nodes[selLayer] : null;
    if (node && node.block) at = view.order.indexOf(node.block.ids[node.block.ids.length - 1]) + 1;
    const nGroups = layerTree.flat.filter(l => l.groupType === 1 || l.groupType === 2).length;
    const r = applyEdits(base, [{ op: 'newGroup', at, name: '组 ' + (nGroups + 1) }]);
    const headerIndex = (r.results && r.results[0] && r.results[0].headerIndex) ?? at + 1;
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.min(headerIndex, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '新建组');
    $('#notice').textContent = '已新建空组（要把图层编组请选中后按 ⌘/Ctrl+G）';
  } catch (e) {
    $('#err').textContent = '新建组没能完成：' + humanEditError(e && e.message || e);
  }
}
export async function groupSelectedUI(){
  if (li || !doc || !origBuffer) return;
  const picks = [...selLayers].filter(i => i >= 0 && i < doc.layers.length && !layerDeletes.has(i)).sort((a, b) => a - b);
  if (!picks.length && selLayer >= 0) picks.push(selLayer);
  if (!picks.length) return;
  const bad = picks.find(i => { const n = layerTree.flat[i]; return !n || n.groupType === 3; });
  if (bad != null) { $('#notice').textContent = '分隔记录不能编组：请选图层或组头（组头会带着整个组编进新组）。'; return; }
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  try {
    if (!await ensureLazy(EDIT, '图层编组')) return;
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const nGroups = layerTree.flat.filter(l => l.groupType === 1 || l.groupType === 2).length;
    const r = applyEdits(base, [{ op: 'groupLayers', indices: picks, name: '组 ' + (nGroups + 1) }]);
    const headerIndex = (r.results && r.results[0] && r.results[0].headerIndex) ?? picks[picks.length - 1] + 2;
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.min(headerIndex, doc.layers.length - 1));      
    refreshAll(false);
    structuralDone(prev, '图层编组');
    $('#notice').textContent = `已把 ${picks.length} 个图层编进新组`;
  } catch (e) {
    $('#err').textContent = '编组没能完成：' + humanEditError(e && e.message || e);
  }
}
export async function ungroupSelectedUI(){
  if (li || !doc || !origBuffer || selLayer < 0) return;
  const view = layerOrderView();
  const node = view.nodes[selLayer];
  let header = null, divider = null, keep = selLayer;
  if (node && node.group) { header = selLayer; divider = node.block.ids[0]; keep = node.block.ids[1] ?? selLayer; }
  else if (node && node.parent != null) { header = node.parent; divider = view.nodes[header] && view.nodes[header].block.ids[0]; }
  else { $('#notice').textContent = '这个图层不在任何组里。'; return; }
  if (divider == null || header == null) { $('#err').textContent = '这个组的分隔记录不完整，不敢拆（文件结构异常）。'; return; }
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  try {
    if (!await ensureLazy(EDIT, '取消编组')) return;
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const order = [];
    for (let k = 0; k < doc.layers.length; k++) if (k !== header && k !== divider) order.push(k);
    const r = applyEdits(base, [{ op: 'reorderLayers', order }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.max(0, keep - (keep > divider ? 1 : 0)));  
    refreshAll(false);
    structuralDone(prev, '取消图层编组');
    $('#notice').textContent = '已取消编组：组成员原地保留，结构性改动，已重新载入。';
  } catch (e) {
    $('#err').textContent = '取消编组没能完成：' + humanEditError(e && e.message || e);
  }
}


export function nextLayerName(prefix){
  let n = 0;
  const re = new RegExp('^' + prefix + ' (\\d+)$');
  for (let i = 0; i < (doc ? doc.layers.length : 0); i++) {
    const nm = layerRenames[i] || (layerTree && layerTree.flat && layerTree.flat[i] && layerTree.flat[i].name) || doc.layers[i].name || '';
    const m = re.exec(String(nm)); if (m) n = Math.max(n, +m[1]);
  }
  return prefix + ' ' + (n + 1);
}




export async function createLayerUI(opts = {}){
  if (opts && opts.type) opts = {};                 
  if (li || !doc || !origBuffer) return;
  if (!await ensureLazy(EDIT, '新建图层')) return;
  const dirty = hasAnyEdits();
  $('#err').textContent = '';
  setWaitCursor(true, '正在处理当前视图…');
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    let baseLayerCount = doc.layers.length;
    try { baseLayerCount = parsePsdFull(base).layers.length; } catch {}
    const at = Math.min(selLayer >= 0 ? selLayer + 1 : baseLayerCount, baseLayerCount);
    const name = opts.name || nextLayerName('图层');
    const r = applyEdits(base, [{ op: 'createLayer', at, name }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    
    if (opts.opacity != null) setLayerOpacity(selLayer, Math.round(Math.max(0, Math.min(100, opts.opacity)) * 2.55));
    if (opts.mode && opts.mode !== 'norm') setLayerBlend(selLayer, opts.mode);
    refreshAll(false);
    structuralDone(prev, '新建图层');
    actRecord('newLayer', { name, opacity: opts.opacity, mode: opts.mode });
    $('#notice').textContent = `已新建空图层「${name}」`;
  } catch (e) {
    $('#err').textContent = '新建图层没能完成：' + humanEditError(e && e.message || e);
  } finally {
    setWaitCursor(false);
  }
}


export async function placeEmbeddedUI(file){
  if (!file || li || !doc || !origBuffer) return false;
  const target = origBuffer;
  if (!await ensureLazy(EDIT, '置入嵌入对象')) return false;
  let image = null;
  try {
    let source, embedded = null;
    if (isImageFileName(file)) {
      image = await decodeImageFile(file);
      const cv = document.createElement('canvas'); cv.width = image.width; cv.height = image.height;
      cv.getContext('2d').drawImage(image, 0, 0);
      source = { data: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, width: cv.width, height: cv.height };
    } else {
      const bytes = await file.arrayBuffer();
      const parsed = await parsePsdRaster(bytes, { strictChannels: true });
      const surf = compositeAll(parsed, parsed.width, parsed.height, new Map());
      source = { data: surf.data, width: surf.width, height: surf.height };
      embedded = new Uint8Array(bytes);
    }
    
    if (origBuffer !== target || li) throw new Error('文档已切换，请重新置入');
    const scale = Math.min(1, docW / source.width, docH / source.height);
    const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
    const left = Math.floor((docW - w) / 2), top = Math.floor((docH - h) / 2);
    const bounds = { left, top, right: left + w, bottom: top + h };
    let pixels = source.data;
    if (w !== source.width || h !== source.height) {
      const cv = document.createElement('canvas'); cv.width = source.width; cv.height = source.height;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
      const small = document.createElement('canvas'); small.width = w; small.height = h;
      small.getContext('2d').drawImage(cv, 0, 0, w, h);
      pixels = small.getContext('2d').getImageData(0, 0, w, h).data;
    }
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) base = (await buildPsdBuffer({ fast: true })).buf;
    base = await ensureStructuralBase(base);
    const at = selLayer >= 0 ? selLayer + 1 : doc.layers.length;
    const name = file.name.replace(/\.[^.]+$/, '') || '置入对象';
    const r = applyEdits(base, [
      { op: 'createLayer', at, name },
      { op: 'replaceLayerPixels', index: at, rgba: { data: pixels, width: w, height: h }, bounds },
      { op: 'convertToSmartObject', index: at, source, bounds, resolution: docResolution || 72,
        name: embedded ? file.name : `${name}.psd`, ...(embedded ? { embedded } : {}) },
    ]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(at); selLayers.clear(); refreshAll(false);
    structuralDone(prev, '置入嵌入对象');
    $('#err').textContent = '';
    shell.status(`已置入「${name}」（源图 ${source.width}×${source.height}）`);
    return true;
  } catch (e) {
    if (e.message !== 'CANCELLED') $('#err').textContent = '置入没能完成：' + humanEditError(e.message || e);
    return false;
  } finally { if (image && image.close) image.close(); }
}





export let warpTempSO = null;       
export function set_warpTempSO(v) { return (warpTempSO = v); }   
export let warpSession = null;
export function set_warpSession(v) { warpSession = v; $('#warpSessionButtons').hidden = !v; if(!v)stopRasterWarpToolbar();return v; }
$('#warpSessionCancel').onclick = () => exitSO(false);
$('#warpSessionOk').onclick = () => exitSO(true);
let warpLayerPending = null;
export function warpLayerUI(idx = selLayer, options = {}) {
  if (warpLayerPending) return warpLayerPending;
  warpLayerPending = enterWarpLayer(idx, options).finally(() => { warpLayerPending = null; });
  return warpLayerPending;
}
async function enterWarpLayer(idx, options){
  if (li || !doc || idx < 0) return false;
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!L || L.groupType != null) { shell.status('组不能直接变形'); return false; }
  const transaction = options.transaction || structuralBegin();
  const rollback = message => { const reason=message || $('#err').textContent || shell.state.status; set_warpSession(null); warpTempSO = null; structuralApply(transaction); restoreFreeTransformHistory(transaction); shell.status(reason); return false; };
  if (tfState) commitFreeTransform();
  try {
  let k = sos.findIndex(so => matchLayer(so) === idx);
  const outer = k >= 0 ? transformChanged(idx) : null;
  let map = null;
  if (outer) {
    const b=transformBase(idx), source=[b.x,b.y,b.x+b.w,b.y,b.x+b.w,b.y+b.h,b.x,b.y+b.h];
    let target=tfFrame(outer).corners;
    if (outer.flipX) target=[target[1],target[0],target[3],target[2]];
    if (outer.flipY) target=[target[3],target[2],target[1],target[0]];
    map=computeHomographyQuad(source,target.flat());
    if (!map) return rollback('当前变换退化，不能进入变形');
  }
  if (k < 0) {
    const rk = rasterKindOf(idx);
    if (rk && rk !== 'smart') { if (!await rasterizeLayerUI(idx)) return rollback(); }
    if (!await convertToSmartObjectUI(idx, { quiet: true })) return rollback();
    k = sos.findIndex(so => matchLayer(so) === idx);
    if (k < 0) return rollback('转换后的智能对象未能匹配图层');
    warpTempSO = { layerIndex: idx };
  }
  await selectSO(k);
  if (!li || li.deform) return rollback($('#err').textContent || `无法读取用于变形的贝塞尔网格（${li ? li.deform?.kind : '未载入'}）`);
  const preview=prepareWarpCachedPreview(doc.layers[idx],li,viewScratch.get('#warp'),{matrix:map,recover:!options.resumeSession&&!soEdits[k]&&!soRepl[k]});
  set_warpSession(options.resumeSession || { transaction, k, layerIndex:idx, changedBeforeWarp: !!options.changedBeforeWarp,
    baseline: JSON.stringify({points:li.points,xn:li.xn,yn:li.yn,sliceX:li.sliceX,sliceY:li.sliceY}) });
  if (map) {
    li.points=li.points.map(p=>applyHomography(map,p.x,p.y));
    delete layerTransforms[idx];
    warpSession.changedBeforeWarp=true;
    preserveRasterWarpStyle(commit);
  }
  startRasterWarpToolbar(map);
  if(preview){preview.mesh=warpMeshSignature(li);warpSession.preview=preview;renderWarpNow();}
  return true;
  } catch (e) { rollback(); shell.status('无法进入变形：' + e.message); return false; }
}
export async function settleWarpTempSO(){
  const t = warpTempSO; warpTempSO = null;
  if (!t || li || !doc) return;
  const L = layerTree && layerTree.flat && layerTree.flat[t.layerIndex];
  if (L && L.isSmartObject) await rasterizeLayerUI(t.layerIndex, { silent: true });
}









function extractLayerDocBytes(buf, idx, rect, rgba){
  let b = reorderLayers(buf, [idx]);
  let f = parsePsdFull(b);
  const L = f.layers[0];
  if (!L || L.vectorMask || (L.placedBlocks && L.placedBlocks.length)) return null;
  const dx = rect.left, dy = rect.top, W = rect.right - rect.left, H = rect.bottom - rect.top;
  const dv = new DataView(b);
  const sh = (o, d) => dv.setInt32(o, dv.getInt32(o) - d);
  sh(L.recordStart, dy); sh(L.recordStart + 4, dx); sh(L.recordStart + 8, dy); sh(L.recordStart + 12, dx);
  const ml = dv.getUint32(L.extraLenOffset + 4), m0 = L.extraLenOffset + 8;
  if (ml >= 20) {
    sh(m0, dy); sh(m0 + 4, dx); sh(m0 + 8, dy); sh(m0 + 12, dx);
    const flags = dv.getUint8(m0 + 17);
    if (ml >= 36 && !(flags & 16)) { sh(m0 + 20, dy); sh(m0 + 24, dx); sh(m0 + 28, dy); sh(m0 + 32, dx); }
  }
  dv.setUint32(14, H); dv.setUint32(18, W);
  if (L.textTransform && L.textTransform.length >= 6) {
    const T = L.textTransform;
    b = setTextLayerMeta(b, 0, { transform: [T[0], T[1], T[2], T[3], T[4] - dx, T[5] - dy] });
  }
  
  if (L.effects) { try { b = applyEdits(b, [{ op: 'clearLayerEffects', index: 0 }]).buffer; } catch {} }
  b = replacePsdCompositeImage(b, rgba).buffer;
  for (const id of [1032, 1050]) { try { b = removeImageResource(b, id); } catch {} }   
  try { b = syncLayerCountResources(b); } catch {}
  try { b = pruneOrphanLinkedFiles(b); } catch {}
  return new Uint8Array(b);
}
export async function convertToSmartObjectUI(idx = selLayer, opts = {}){
  if (li || !doc || !origBuffer) return false;
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  const dl = doc.layers[idx];
  
  if (L && (L.isGroup || L.groupType != null || (opts.multi && selLayers.size > 1 && selLayers.has(idx)))) return convertBlocksToSmartObjectUI(idx, opts);
  if (!L || !dl) return false;
  if (L.isSmartObject) { shell.status('这一层已经是智能对象'); return false; }
  if (layerDeletes.has(idx)) return false;
  if (!await ensureLazy(EDIT, '转换为智能对象')) return false;
  const rk = rasterKindOf(idx);
  
  if (rk && rk !== 'smart' && rk !== 'text') { if (!await rasterizeLayerUI(idx, { silent: true })) return false; }
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const rd = await parsePsdRaster(base.slice ? base.slice(0) : base, {});
    const lay = rd && rd.layers && rd.layers[idx];
    const w = lay ? lay.bounds.right - lay.bounds.left : 0, h = lay ? lay.bounds.bottom - lay.bounds.top : 0;
    if (!lay || !lay.rgba || !(w > 0 && h > 0)) { $('#err').textContent = '这一层没有像素，不能转换为智能对象'; return false; }
    let embedded = null;
    if (rk === 'text') {
      try { embedded = extractLayerDocBytes(base, idx, lay.bounds, lay.rgba); }
      catch (e) { embedded = null; console.warn('文字层原样搬进智能对象失败，退回按像素：', e); }
    }
    const r = applyEdits(base, [{ op: 'convertToSmartObject', index: idx,
      source: { data: lay.rgba, width: w, height: h }, resolution: docResolution || 72, ...(embedded ? { embedded } : {}) }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(idx, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '转换为智能对象');
    if (!opts.quiet) shell.status(`已转换为智能对象（${w}×${h}）`);
    return true;
  } catch (e) {
    $('#err').textContent = '转换为智能对象没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}






export async function convertBlocksToSmartObjectUI(idx = selLayer, opts = {}){
  if (li || !doc || !origBuffer) return false;
  const view = layerOrderView();
  const blocks = topLevelBlockList(view);
  const want = selLayers.size > 1 ? new Set(selLayers) : new Set([idx]);
  const involved = blocks.filter(b => b.some(id => want.has(id)));
  if (!involved.length) { shell.status('先选中要打包的图层或组'); return false; }
  const ids = involved.flatMap(b => b);                               
  if (ids.some(i => layerDeletes.has(i))) return false;
  if (!await ensureLazy(EDIT, '转换为智能对象')) return false;
  const surf = composeSegmentRGBA(ids, []);
  const box = tightAlphaBox(surf.data, docW, docH);
  if (!box) { $('#err').textContent = '选中的图层合起来是空的，不能转换为智能对象'; return false; }
  const merged = cropRGBABox(surf.data, docW, box);
  const flat = layerTree && layerTree.flat;
  const topBlock = involved[involved.length - 1], topHead = topBlock[topBlock.length - 1];
  const soName = layerRenames[topHead] || (flat[topHead] || {}).unicodeName || (flat[topHead] || {}).name || '图层';
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const view2 = layerOrderView();
    const effOrder = view2.order.filter(i => !layerDeletes.has(i));
    const posOf = i => effOrder.indexOf(i);
    const pos = ids.map(posOf);
    if (pos.some(p => p < 0)) throw new Error('图层位置对不上（请先保存一下再试）');
    
    let emb = toArrayBuffer(reorderLayers(base, pos));
    const n = pos.length, all = Array.from({ length: n }, (_, k) => k);
    const { transformLayersLocal } = await import('../../../core/layer-geometry.js');   
    emb = transformLayersLocal(emb, [1, 0, 0, 1, -box.x, -box.y], all).buffer;
    const vec = [];
    for (const k of all) { try { const p = getVectorMaskPath(emb, k, { units: 'pixel' }); if (p && p.subpaths) vec.push({ k, p }); } catch {} }
    { const dv = new DataView(emb); dv.setUint32(14, box.h); dv.setUint32(18, box.w); }
    for (const { k, p } of vec) {
      try { emb = toArrayBuffer(applyEdits(emb, [{ op: 'setVectorMaskPath', index: k, subpaths: p.subpaths, units: 'pixel' }], { verify: false }).buffer); } catch (e) { console.warn('矢量路径重写失败', e); }
    }
    emb = toArrayBuffer(replacePsdCompositeImage(emb, merged).buffer);
    for (const id of [1032, 1050]) { try { emb = toArrayBuffer(removeImageResource(emb, id)); } catch {} }   
    try { emb = toArrayBuffer(syncLayerCountResources(emb)); } catch {}
    try { emb = toArrayBuffer(pruneOrphanLinkedFiles(emb)); } catch {}
    const embedded = new Uint8Array(emb);
    
    const at = posOf(topBlock[0]);
    const ops = [{ op: 'createLayer', at, name: soName },
      { op: 'replaceLayerPixels', index: at, rgba: { data: merged, width: box.w, height: box.h },
        bounds: { top: box.y, left: box.x, bottom: box.y + box.h, right: box.x + box.w } }];
    const del = new Set(ids);
    const order = [];
    effOrder.forEach((i, p) => {
      if (p === at) order.push(at);
      if (!del.has(i)) order.push(p >= at ? p + 1 : p);
    });
    ops.push({ op: 'reorderLayers', order });
    let r = applyEdits(base, ops);
    const newIdx = order.indexOf(at);
    r = applyEdits(r.buffer, [{ op: 'convertToSmartObject', index: newIdx, source: { data: merged, width: box.w, height: box.h },
      resolution: docResolution || 72, embedded, name: `${soName}.psb` }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.min(newIdx, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '转换为智能对象');
    const nL = ids.filter(i => (flat[i] || {}).groupType !== 3).length;
    if (!opts.quiet) shell.status(`已把 ${nL} 个图层打包成智能对象「${soName}」（${box.w}×${box.h}，双击缩略图进去仍可编辑）`);
    return true;
  } catch (e) {
    $('#err').textContent = '转换为智能对象没能完成：' + humanEditError(e && e.message || e);
    return false;
  }
}
const toArrayBuffer = b => (b instanceof ArrayBuffer ? b : b.buffer.byteLength === b.byteLength ? b.buffer : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));








export const PARAM_MAX_DEFAULT = 12;
export const ENUM_LABELS = {
  BlnM: { Nrml: '正常', Dslv: '溶解', Drkn: '变暗', Mltp: '正片叠底', CBrn: '颜色加深', linearBurn: '线性加深', darkerColor: '深色',
          Lghn: '变亮', Scrn: '滤色', CDdg: '颜色减淡', linearDodge: '线性减淡', lighterColor: '浅色', Ovrl: '叠加', SftL: '柔光',
          HrdL: '强光', vividLight: '亮光', linearLight: '线性光', pinLight: '点光', hardMix: '实色混合', Dfrn: '差值', Xclu: '排除',
          blendSubtraction: '减去', blendDivide: '划分', 'H   ': '色相', Strt: '饱和度', 'Clr ': '颜色', Lmns: '明度' },
  FStl: { InsF: '内部', OutF: '外部', CtrF: '居中' },
  
  gradientInterpolationMethodType: { Perc: '可感知', 'Lnr ': '线性', Gcls: '古典', Smoo: '平滑', Stri: '条纹' },
  FrFl: { SClr: '颜色', GrFl: '渐变', Ptrn: '图案' },
  BETE: { SfBL: '平滑', PrBL: '雕刻清晰', Slmt: '雕刻柔和' },
  BESl: { InrB: '内斜面', OtrB: '外斜面', Embs: '浮雕效果', PlEb: '枕状浮雕', strokeEmboss: '描边浮雕' },
  BESs: { 'In  ': '上', 'Out ': '下' },     
  IGSr: { SrcE: '边缘', SrcC: '居中' },
  Md: {},
};
