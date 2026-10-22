




import './15-gradient-bucket-eyedropper.js';   
import { shell } from '../shell.js';
import { $, EDIT, FILTER, FLTM, kick, runLazy } from './01-boot.js';
import { brushHistory, doc, docH, docW, layerRenames, pixelPaint, selection } from './02-doc-state.js';
import { actRecord, histCap, histPush, updateUndoButtons } from './03-history.js';
import { paintOrigin } from './11-paint-common.js';
import { filterGalleryUI, lastGalleryRun } from './12-fx-workspaces.js';
import { bakeLayerTiles, layerPixelJob, selectionCoversAll } from './14-edit-misc.js';
import { bytesEqual } from './21-load-document.js';
import { layerCanvasCache, selLayer, set_selLayer, thumbCache } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import { renderPreviewOnly } from './30-render.js';
import { bgRGB, fgRGB } from './31-selection-brush.js';
import {
  commitPixelPaint, cutRect, ensurePixelPaint, sameBytes, selCovFn, sparsePixelHistory,
} from './38-brush-engine.js';
import { adjExpandProxy, adjProxySelection, adjustGuard } from './41-image-adjust.js';
import { setWaitCursor } from './48-info-export.js';










export let fltState = null, fltRAF = 0;
export let lastFilter = null;                    
export function set_lastFilter(v) { return (lastFilter = v); }   
const FLT_PROXY_MAX = 1 << 19;            
const TILE_FILTERS = new Set(['solarize', 'replaceColor', 'hsbHsl']);


const LAZY_FILTER_ALLOW = new Set([
  'gaussianBlur', 'boxBlur', 'motionBlur', 'blur', 'blurMore',
  'unsharpMask', 'sharpen', 'sharpenMore',
  'addNoise', 'median', 'despeckle', 'mosaic',
  'findEdges', 'emboss', 'solarize',
  'highPass', 'maximum', 'minimum', 'offset', 'replaceColor', 'hsbHsl',
]);
function filterHalo(kind, model) {
  const spec = fltSpec(kind); let h = 0;
  for (const pm of spec?.params || []) if (pm.spatial) { const v = Math.abs(Number(model[pm.key]) || 0); if (v > h) h = v; }
  if (kind === 'offset') h = Math.max(h, Math.abs(+model.dx || 0), Math.abs(+model.dy || 0));
  if (TILE_FILTERS.has(kind) || kind === 'addNoise') h = 0;
  else if (!h) h = 8;
  return Math.min(1024, Math.ceil(h));
}


export const fltKinds = () => (FLTM ? FLTM.FILTER_TYPES : []);
export const fltSpec = k => (FLTM && FLTM.FILTERS[k]) || null;
const fltLabel = k => (fltSpec(k) ? fltSpec(k).label : k);


export function filterGuard(idx = selLayer, options){



  const why = adjustGuard(idx, { ...(options || {}), sparse: true });
  if (why) return why.replace('图像 › 调整', '滤镜');
  return '';
}


function fltBuildProxy(pp){
  const n = pp.w * pp.h;
  if (n <= FLT_PROXY_MAX) return null;
  const k = Math.max(2, Math.ceil(Math.sqrt(n / FLT_PROXY_MAX)));
  const pw = Math.max(1, Math.ceil(pp.w / k)), ph = Math.max(1, Math.ceil(pp.h / k));
  const rgba = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(pp.h - 1, y * k), sRow = sy * pp.w * 4, dRow = y * pw * 4;
    for (let x = 0; x < pw; x++) {
      const so = sRow + Math.min(pp.w - 1, x * k) * 4, dof = dRow + x * 4;
      rgba[dof] = pp.rgba[so]; rgba[dof + 1] = pp.rgba[so + 1]; rgba[dof + 2] = pp.rgba[so + 2]; rgba[dof + 3] = pp.rgba[so + 3];
    }
  }
  return { k, pw, ph, rgba };
}

function fltProxyParams(kind, model, k){
  const spec = fltSpec(kind); if (!spec) return model;
  const out = { ...model };
  for (const pm of spec.params) {
    if (!pm.spatial) continue;
    const v = +out[pm.key];
    if (!Number.isFinite(v)) continue;
    out[pm.key] = Math.max(pm.min, Math.min(pm.max, v / k));
  }
  return out;
}

function fltBlend(base, filtered, w, h, cov, ox, oy){
  if (!cov) return filtered;
  const out = new Uint8ClampedArray(base.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, a = cov(ox + x, oy + y) / 255;
    if (a <= 0) { out[o] = base[o]; out[o + 1] = base[o + 1]; out[o + 2] = base[o + 2]; out[o + 3] = base[o + 3]; continue; }
    if (a >= 1) { out[o] = filtered[o]; out[o + 1] = filtered[o + 1]; out[o + 2] = filtered[o + 2]; out[o + 3] = filtered[o + 3]; continue; }
    for (let c = 0; c < 4; c++) out[o + c] = Math.round(base[o + c] + (filtered[o + c] - base[o + c]) * a);
  }
  return out;
}

function fltParams(kind, model){
  const sp = fltSpec(kind);
  return (sp && sp.colors) ? { ...model, _fg: fgRGB.slice(0, 3), _bg: bgRGB.slice(0, 3) } : model;
}
function fltCompute(full){
  const S = fltState, pp = S.pp;
  if (full || !S.proxy) {
    const outRaw = FLTM.applyFilter(S.kind, S.base, pp.w, pp.h, fltParams(S.kind, S.model));
    const og = paintOrigin(S.idx, pp) || { left: pp.left, top: pp.top };
    return fltBlend(S.base, outRaw, pp.w, pp.h, selCovFn(), og.left, og.top);
  }
  const px = S.proxy;
  const small = FLTM.applyFilter(S.kind, px.rgba, px.pw, px.ph, fltParams(S.kind, fltProxyParams(S.kind, S.model, px.k)));
  const mixed = fltBlend(px.rgba, small, px.pw, px.ph,
    S.proxySel ? (x, y) => S.proxySel.data[y * px.pw + x] : null, 0, 0);
  const out = new Uint8ClampedArray(pp.rgba.length);
  adjExpandProxy(px, mixed, out, pp.w, pp.h);
  return out;
}
export function fltRender(){
  const S = fltState; if (!S) return;
  let out = null, err = '';
  if (S.on) { try { out = fltCompute(false); } catch (e) { err = humanEditError(e && e.message || e); } }
  S.pp.rgba.set(out || S.base);
  if (S.lazy) {
    S.lazy.layer.lazyPreview = { data: S.pp.rgba, width: S.pp.w, height: S.pp.h };
    S.lazy.layer.lazyPreviewCanvas = null;
  }
  delete layerCanvasCache[S.idx]; delete thumbCache[S.idx];
  renderPreviewOnly();
  const box = $('#fltErr'); if (box) { box.textContent = err ? '参数不合法：' + err : ''; box.hidden = !err; }
  S.bad = !!err;
  const okBtn = $('#fltOk'); if (okBtn) okBtn.disabled = !!err;
}
function fltSchedule(){
  if (fltRAF) return;
  fltRAF = requestAnimationFrame(() => { fltRAF = 0; fltRender(); });
}

export function renderFilterDialog(){
  const S = fltState; if (!S) return;
  const spec = fltSpec(S.kind);
  $('#fltTitle').textContent = `滤镜 · ${spec.label}` + (selection ? '（仅选区内）' : '') + (S.proxy ? `（预览按 1/${S.proxy.k} 缩略计算）` : '');
  const body = $('#fltBody'); body.innerHTML = '';
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  for (const pm of spec.params) {
    const row = mk('div', { className: 'arow' });
    row.append(mk('label', { className: 'k', textContent: pm.label }));
    if (pm.type === 'bool') {
      const cb = mk('input', { type: 'checkbox', checked: !!S.model[pm.key] });
      cb.onchange = () => { S.model[pm.key] = cb.checked; fltSchedule(); };
      row.append(cb);
    } else if (pm.type === 'enum') {
      const sel = mk('select');
      for (const [v, lab] of pm.options) sel.append(mk('option', { value: v, textContent: lab }));
      sel.value = S.model[pm.key];
      sel.onchange = () => { S.model[pm.key] = sel.value; fltSchedule(); };
      row.append(sel);
    } else if (pm.type === 'color') {
      const hex = c => '#' + c.map(v => (v | 0).toString(16).padStart(2, '0')).join('');
      const inp = mk('input', { type: 'color', value: hex(S.model[pm.key] || pm.def) });
      inp.oninput = () => { const v = inp.value; S.model[pm.key] = [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)); fltSchedule(); };
      const fg = mk('button', { type: 'button', textContent: '用前景色' });
      fg.onclick = () => { S.model[pm.key] = fgRGB.slice(0, 3); inp.value = hex(S.model[pm.key]); fltSchedule(); };
      row.append(inp, fg);
    } else if (pm.type === 'matrix') {
      const n = pm.size || 5;
      const grid = mk('div', { style: `display:grid;grid-template-columns:repeat(${n},46px);gap:3px` });
      const cur = Array.isArray(S.model[pm.key]) ? S.model[pm.key].slice() : pm.def.slice();
      S.model[pm.key] = cur;
      cur.forEach((v, i) => {
        const nb = mk('input', { type: 'number', step: 1, min: -999, max: 999, value: v, style: 'width:46px' });
        if (i === (n * n >> 1)) nb.style.fontWeight = '700';
        nb.onchange = () => { cur[i] = Math.max(-999, Math.min(999, Math.round(+nb.value || 0))); nb.value = cur[i]; fltSchedule(); };
        grid.append(nb);
      });
      row.append(grid);
    } else {
      const sl = mk('input', { type: 'range', min: pm.min, max: pm.max, step: pm.step, value: S.model[pm.key] });
      const nb = mk('input', { type: 'number', min: pm.min, max: pm.max, step: pm.step, value: S.model[pm.key] });
      const set = v => {
        const n = Math.max(pm.min, Math.min(pm.max, +v));
        S.model[pm.key] = n;
        if (document.activeElement !== sl) sl.value = String(n);
        if (document.activeElement !== nb) nb.value = String(n);
        fltSchedule();
      };
      sl.oninput = () => set(sl.value);
      nb.onchange = () => set(nb.value);
      row.append(sl, nb);
      if (pm.unit) row.append(mk('span', { className: 'k', textContent: pm.unit, style: 'width:auto;flex:none' }));
    }
    body.append(row);
  }
  if (!spec.params.length) body.append(mk('div', { className: 'anote plain', textContent: '这个滤镜没有参数，点「确定」直接应用。' }));
  const notes = $('#fltNotes'); notes.innerHTML = '';
  notes.append(mk('div', { className: 'anote plain',
    textContent: `作用于「${layerRenames[S.idx] || (doc.layers[S.idx] && doc.layers[S.idx].name) || ('图层 ' + S.idx)}」的像素`
      + (selection ? '，只改选区内（羽化边按覆盖率过渡）' : '，整层') }));
}


export function openFilterDialog(kind, params){
  const idx = selLayer;
  const why = filterGuard(idx);
  if (why) { $('#err').textContent = '滤镜用不了：' + why; return null; }
  if (!FLTM) { kick(FILTER); $('#err').textContent = '滤镜用不了：' + FILTER.statusText(); return null; }
  if (!fltSpec(kind)) { $('#err').textContent = `没有「${kind}」这个滤镜`; return null; }
  let pp = ensurePixelPaint(idx), lazy = null;
  if (!pp) {
    const L = doc?.layers?.[idx], pv = L?.lazyPreview;
    const lazySource = L && (L.lazyTileStore || L.lazyImage || L.lazyRasterFile || L.lazyChannels || L.lazyCompressedChannels);
    if (!lazySource || !pv?.data || !(pv.width > 0 && pv.height > 0)) {
      $('#err').textContent = '滤镜用不了：这一层拿不到可预览的像素';
      return null;
    }
    if (!LAZY_FILTER_ALLOW.has(kind)) {
      $('#err').textContent = `滤镜用不了：「${fltLabel(kind)}」在超大图层上会产生接缝（依赖整幅坐标/程序化噪声），请先降低分辨率或拼合后再用。`;
      return null;
    }
    const left = L.bounds?.left | 0, top = L.bounds?.top | 0;
    if (selection && !selectionCoversAll(selection, left, top, L.width, L.height)) {
      $('#err').textContent = '滤镜用不了：超大图层的参数滤镜需要取消选择或全选；局部选区请先用无参数滤镜或缩小文档。';
      return null;
    }

    pp = { rgba: pv.data, w: pv.width, h: pv.height, left: 0, top: 0, sparse: false, lazy: true };
    lazy = { layer: L, origPreview: pv };
  }
  closeFilterDialog(true);
  const base = Uint8ClampedArray.from(pp.rgba);
  const proxy = fltBuildProxy(pp);
  fltState = { idx, kind, pp, base, proxy,
               proxySel: !lazy && proxy ? adjProxySelection(pp, proxy, idx) : null,
               lazy, model: { ...FLTM.filterDefaults(kind), ...(params || {}) }, on: true, bad: false };
  for (const pm of fltSpec(kind).params) if (pm.type === 'color' && !(params && params[pm.key])) fltState.model[pm.key] = fgRGB.slice(0, 3);
  $('#fltPreview').checked = true;
  const sel = $('#fltKind');
  sel.innerHTML = '';
  let group = null;
  for (const k of fltKinds()) {
    const sp = fltSpec(k);
    if (sp.group !== group) { group = sp.group; sel.append(Object.assign(document.createElement('optgroup'), { label: group })); }
    sel.lastChild.append(Object.assign(document.createElement('option'), { value: k, textContent: sp.label }));
  }
  sel.value = kind;
  renderFilterDialog();
  const dlg = $('#fltDlg');
  if (!dlg.open) { if (dlg.showModal) { try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', ''); }
  fltRender();
  return fltState;
}

export function closeFilterDialog(silent){
  const S = fltState;
  if (!S) { if (!silent) { const d = $('#fltDlg'); if (d && d.open && d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } } return; }
  S.pp.rgba.set(S.base);                       
  if (S.lazy) {
    S.lazy.layer.lazyPreview = { data: S.pp.rgba, width: S.pp.w, height: S.pp.h };
    S.lazy.layer.lazyPreviewCanvas = null;
  }
  delete layerCanvasCache[S.idx]; delete thumbCache[S.idx];
  fltState = null;
  renderPreviewOnly();
  if (!silent) { const d = $('#fltDlg'); if (d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } else d.removeAttribute('open'); }
}

const FLT_WORKER_PX = 1_000_000;          
let fltWorkerUrlP = null, fltWorker = null, fltWorkerBroken = false, fltJob = 0;
function fltRawOffThread(kind, rgba, w, h, params){
  if (!fltWorkerUrlP) fltWorkerUrlP = import('../../../core/filters-worker.js').then(m => m.WORKER_URL).catch(() => null);
  return fltWorkerUrlP.then(url => new Promise((resolve, reject) => {
    const main = () => { try { resolve(FLTM.applyFilter(kind, rgba, w, h, params)); } catch (e) { reject(e); } };
    if (!url || fltWorkerBroken || typeof Worker === 'undefined') { main(); return; }
    if (!fltWorker) {
      try { fltWorker = new Worker(url, { type: 'module' }); }
      catch { fltWorkerBroken = true; fltWorker = null; main(); return; }
    }
    const w0 = fltWorker, job = ++fltJob;
    let alive = false;
    w0.onmessage = ev => {
      const m = ev.data || {}; if (m.ready) { alive = true; return; }
      if (m.job !== job) return;
      if (m.error) reject(new Error(m.error)); else resolve(new Uint8ClampedArray(m.rgba.buffer || m.rgba));
    };
    
    w0.onerror = ev => { ev.preventDefault && ev.preventDefault(); if (alive) { reject(new Error('滤镜后台计算出错')); return; } fltWorkerBroken = true; try { w0.terminate(); } catch {} fltWorker = null; main(); };
    const copy = new Uint8ClampedArray(rgba);
    try { w0.postMessage({ job, kind, rgba: copy, w, h, params }, [copy.buffer]); } catch { main(); }
  }));
}

function commitLazyFilter(S) {
  const label = `滤镜 · ${fltLabel(S.kind)}`;
  const layer = S.lazy.layer;
  S.pp.rgba.set(S.base);
  layer.lazyPreview = S.lazy.origPreview;
  layer.lazyPreviewCanvas = null;
  const halo = filterHalo(S.kind, S.model);
  const apply = (base, w, h) => FLTM.applyFilter(S.kind, base, w, h, fltParams(S.kind, S.model));
  fltState = null;
  const d = $('#fltDlg'); if (d?.close) { try { d.close(); } catch {} } else d?.removeAttribute('open');
  setWaitCursor(true, '正在分块计算滤镜…');
  shell.status(`${label}：正在按 256 瓦片分块计算…`);
  return bakeLayerTiles(label, ({ base, w, h }) => apply(base, w, h), { index: S.idx, halo, apply: halo ? undefined : apply })
    .then(ok => {
      if (ok) {
        lastFilter = { kind: S.kind, params: { ...S.model } };
        actRecord('filter', { kind: S.kind, params: { ...S.model } });
        shell.status(`滤镜：${fltLabel(S.kind)}`);
      }
      return ok;
    })
    .catch(e => {
      $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e);
      return false;
    })
    .finally(() => setWaitCursor(false));
}



export function commitFilter(){
  const S = fltState; if (!S || S.bad || S.busy) return false;
  if (S.lazy) return commitLazyFilter(S);
  const pp = S.pp;
  if (pp.w * pp.h < FLT_WORKER_PX) {
    let out;
    try { out = fltCompute(true); } catch (e) { $('#err').textContent = '滤镜失败：' + humanEditError(e && e.message || e); return false; }
    return fltFinish(S, out);
  }
  S.busy = true;
  const okBtn = $('#fltOk'); if (okBtn) okBtn.disabled = true;
  const og = paintOrigin(S.idx, pp) || { left: pp.left, top: pp.top };
  const cov = selCovFn();                      
  setWaitCursor(true, '正在计算当前视图…');
  shell.status(`正在应用「${fltLabel(S.kind)}」…（后台计算，界面不会卡住）`);
  return fltRawOffThread(S.kind, S.base, pp.w, pp.h, fltParams(S.kind, S.model))
    .then(raw => {
      if (fltState !== S || pixelPaint[S.idx] !== pp) { $('#notice').textContent = `「${fltLabel(S.kind)}」已取消。`; return false; }   
      
      if (S.noDialog && !bytesEqual(pp.rgba, S.base)) { fltState = null; $('#err').textContent = `「${fltLabel(S.kind)}」算完时这一层已经被改过了，没有应用（可以再按一次 ⌘F）`; return false; }
      return fltFinish(S, fltBlend(S.base, raw, pp.w, pp.h, cov, og.left, og.top));
    })
    .catch(e => { if (S.noDialog && fltState === S) fltState = null; $('#err').textContent = '滤镜失败：' + humanEditError(e && e.message || e); return false; })
    .finally(() => { S.busy = false; setWaitCursor(false); const b = $('#fltOk'); if (b && fltState === S) b.disabled = !!S.bad; });
}
function fltFinish(S, out){
  const pp = S.pp;
  pp.rgba.set(S.base);                         
  const rect = { x: 0, y: 0, w: pp.w, h: pp.h };
  const before = cutRect(pp.rgba, pp.w, rect, 4);
  pp.rgba.set(out);
  const after = cutRect(pp.rgba, pp.w, rect, 4);
  fltState = null;
  const d = $('#fltDlg'); if (d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } else d.removeAttribute('open');
  actRecord('filter', { kind: S.kind, params: { ...S.model } });   
  if (sameBytes(before, after)) {
    delete layerCanvasCache[S.idx]; delete thumbCache[S.idx];
    renderPreviewOnly();
    $('#notice').textContent = `「${fltLabel(S.kind)}」没有改变任何像素。`;
    return false;
  }
  brushHistory.undo.push(sparsePixelHistory(S.idx, before, after, S.pp.w, S.pp.h, { filter: true }));
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  histPush(fltLabel(S.kind), 'brush');
  commitPixelPaint(S.idx);
  renderPreviewOnly(); updateUndoButtons();
  lastFilter = { kind: S.kind, params: { ...S.model } };
  shell.menu.refresh && shell.menu.refresh();
  $('#notice').textContent = `已应用「${fltLabel(S.kind)}」${selection ? '（仅选区内）' : ''}。⌘F 可以再来一次。`;
  shell.status(`滤镜：${fltLabel(S.kind)}`);
  return true;
}

export async function applyFilterNow(kind, params){
  const why = filterGuard(selLayer, { sparse: TILE_FILTERS.has(kind) });
  if (why) { $('#err').textContent = '滤镜用不了：' + why; return false; }
  if (!FLTM) { kick(FILTER); $('#err').textContent = '滤镜用不了：' + FILTER.statusText(); return false; }
  if (!fltSpec(kind)) { $('#err').textContent = `没有「${kind}」这个滤镜`; return false; }
  const lazyLayer = doc?.layers?.[selLayer];
  const lazyCapable = pixelPaint[selLayer]?.sparse || (lazyLayer
    && (lazyLayer.lazyTileStore || lazyLayer.lazyChannels || lazyLayer.lazyCompressedChannels || lazyLayer.lazyImage || lazyLayer.lazyRasterFile));
  if ((TILE_FILTERS.has(kind) || LAZY_FILTER_ALLOW.has(kind)) && lazyCapable) {
    const model = { ...FLTM.filterDefaults(kind), ...(params || {}) };
    const label = `滤镜 · ${fltLabel(kind)}`;
    const halo = filterHalo(kind, model);
    const applyPoint = (base, w, h) => FLTM.applyFilter(kind, base, w, h, fltParams(kind, model));
    const compute = ({ base, w, h }) => applyPoint(base, w, h);
    const layerLeft = lazyLayer?.bounds?.left | 0, layerTop = lazyLayer?.bounds?.top | 0;
    const fullCover = !selection || selectionCoversAll(selection, layerLeft, layerTop, lazyLayer?.width || docW, lazyLayer?.height || docH);
    if (docW * docH > 64e6 && fullCover) {
      try {
        const ok = await bakeLayerTiles(label, compute, { index: selLayer, halo, apply: halo ? undefined : applyPoint });
        if (ok) { lastFilter = { kind, params: { ...model } }; actRecord('filter', { kind, params: { ...model } }); }
        return ok;
      } catch (e) {
        $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e);
        return false;
      }
    }
    if (!halo) {
      const out = await layerPixelJob(label, ({ base, w, h }) => compute({ base, w, h }), { tile: true, paintedOnly: false });
      if (out !== false) { lastFilter = { kind, params: { ...model } }; actRecord('filter', { kind, params: { ...model } }); }
      return out;
    }
  }
  const pp = ensurePixelPaint(selLayer);
  if (!pp) {
    const L = doc?.layers?.[selLayer];
    $('#err').textContent = (pixelPaint[selLayer]?.sparse || L?.lazyTileStore || L?.lazyRasterSource || L?.lazyChannels || L?.lazyCompressedChannels)
      ? '滤镜用不了：这个滤镜在超大图层上需要整层分块（取消选择或全选后再试），局部选区请用点式滤镜。'
      : '滤镜用不了：这一层拿不到像素';
    return false;
  }
  fltState = { idx: selLayer, kind, pp, base: Uint8ClampedArray.from(pp.rgba), proxy: null, proxySel: null,
               model: { ...FLTM.filterDefaults(kind), ...(params || {}) }, on: true, bad: false, noDialog: true };
  const r = commitFilter();
  if (r === false && fltState && fltState.noDialog) fltState = null;   
  return r;
}
export const openFilterLazy = (kind, params) => runLazy(FILTER, '滤镜', () => openFilterDialog(kind, params));

export function pickDisplaceMap(){
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.psd,.psb,image/png,image/jpeg,image/webp,image/gif,image/bmp' });
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      let map = null;
      if (/\.ps[db]$/i.test(f.name)) {
        const ED = await EDIT.load();
        const c = ED.decodeCompositeImage(new Uint8Array(await f.arrayBuffer()), null, null, { keepRaw: false });
        const rgba = c.toRGBA();
        map = { rgba: rgba.data || rgba, w: c.width, h: c.height };
      }
      if (!map) {
        const bmp = await createImageBitmap(f);
        const cv = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
        const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
        map = { rgba: g.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
      }
      openFilterLazy('displace', { _map: map });
      shell.status(`置换图：${f.name}（${map.w}×${map.h}）`);
    } catch (e) { $('#err').textContent = '置换图读不出来：' + (e && e.message || e) + '（可以先存成 PNG 再试）'; }
  };
  inp.click();
}
export const applyFilterLazy = (kind, params) => runLazy(FILTER, '滤镜', () => applyFilterNow(kind, params));

export function repeatLastFilter(withDialog){
  if (!lastFilter) { $('#notice').textContent = '还没有用过滤镜：先从「滤镜」菜单里挑一个。'; return false; }
  if (lastFilter.kind === 'filterGallery') return withDialog ? filterGalleryUI() : filterGalleryUI(null, lastGalleryRun ? { layers: lastGalleryRun.layers } : {});
  return withDialog ? openFilterLazy(lastFilter.kind, lastFilter.params)
                    : applyFilterLazy(lastFilter.kind, lastFilter.params);
}

$('#fltOk').onclick = () => commitFilter();
$('#fltCancel').onclick = () => closeFilterDialog(false);
$('#fltDlg').addEventListener('cancel', ev => { ev.preventDefault(); closeFilterDialog(false); });
$('#fltPreview').onchange = () => { if (fltState) { fltState.on = $('#fltPreview').checked; fltRender(); } };
$('#fltReset').onclick = () => { if (fltState && FLTM) { fltState.model = FLTM.filterDefaults(fltState.kind); renderFilterDialog(); fltRender(); } };
$('#fltKind').onchange = () => {
  const k = $('#fltKind').value;
  if (!fltState || !fltSpec(k)) return;
  const idx = fltState.idx;
  closeFilterDialog(true);
  set_selLayer(idx);
  openFilterDialog(k);
};
