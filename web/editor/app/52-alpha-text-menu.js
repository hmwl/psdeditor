




import './51-image-select-menu.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import {
  listAlphaChannels, readAlphaChannel, addAlphaChannel, removeAlphaChannel, renameAlphaChannel, setAlphaChannel,
} from '../../../core/psd-channels.js';
import { WARP_STYLES } from '../../../core/text-warp.js';
import { confirmDialog, promptDialog } from '../dialog.js';
import { DOC_EXT } from '../layerb.js';
import { shell } from '../shell.js';
import { $, EDIT, createSelection, ensureLazy } from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, layerDeletes, layerRenames, layerTextEdits, layerTree, li, origBuffer,
  selection, textCrops, textFontSubst, textOverlay,
} from './02-doc-state.js';
import { pushDocHistory, structuralBegin, structuralDone, updateUndoButtons } from './03-history.js';
import { isTextLayer, syncTextBar } from './09-text-tool.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { renderLayerPanel } from './23-layers-panel.js';
import { cloneOpValue, humanEditError, renderProps } from './24-layer-ops-queue.js';
import { renderStaticLayers, syncChannelPanel } from './30-render.js';
import { combineInto, selReady } from './32-cursors-select-options.js';
import { layoutInlineText } from './47-canvas-context-menu.js';
import { buildPsdBuffer, dispTextOf, ensureStructuralBase, textEditAbsorbs, textLayoutOf } from './48-info-export.js';
import { effTextInfo, fontPop, pickFont, renderTextLayer, resolveFont } from './49-fonts-text-model.js';











let alphaCache = { buf: null, list: null, grays: null, thumbs: null };
export let alphaCarry = null;           
onDocumentCacheRelease(() => { alphaCache = { buf: null, list: null, grays: null, thumbs: null }; alphaCarry = null; });
export function set_alphaCarry(v) { return (alphaCarry = v); }   
export function alphaCacheFor(){
  if (!origBuffer) return { buf: null, list: [], grays: [], thumbs: [] };
  if (alphaCache.buf === origBuffer) return alphaCache;
  let list = [];
  try { list = listAlphaChannels(origBuffer); } catch { list = []; }
  

  const carry = alphaCarry && alphaCache.buf === alphaCarry.from && alphaCarry.w === docW && alphaCarry.h === docH
    && alphaCache.list && alphaCache.list.length === list.length && list.every((c, k) => c.name === alphaCache.list[k].name);
  alphaCarry = null;
  alphaCache = carry ? { buf: origBuffer, list, grays: alphaCache.grays, thumbs: alphaCache.thumbs }
    : { buf: origBuffer, list, grays: list.map(() => undefined), thumbs: list.map(() => undefined) };
  return alphaCache;
}

export function docAlphaChannels(){ return alphaCacheFor().list.filter(c => !c.transparency); }   

export function docAlphaGray(at){
  const c = alphaCacheFor();
  if (!(at >= 0 && at < c.list.length)) return null;
  if (c.grays[at] === undefined) {
    let g = null;
    try { const rd = readAlphaChannel(origBuffer, at); g = rd ? rd.gray : null; } catch { g = null; }
    c.grays[at] = g;
  }
  return c.grays[at];
}

export function docAlphaThumb(at, w = 26, h = 20){
  const c = alphaCacheFor();
  if (!(at >= 0 && at < c.list.length)) return null;
  if (c.thumbs[at] === undefined) {
    const g = docAlphaGray(at);
    let cv = null;
    if (g && docW > 0 && docH > 0) {
      const full = document.createElement('canvas'); full.width = docW; full.height = docH;
      const fg = full.getContext('2d');
      const im = fg.createImageData(docW, docH);
      for (let i = 0, o = 0; i < g.length; i++, o += 4) { im.data[o] = im.data[o + 1] = im.data[o + 2] = g[i]; im.data[o + 3] = 255; }
      fg.putImageData(im, 0, 0);
      cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const k = Math.min(w / docW, h / docH);
      const dw = Math.max(1, Math.round(docW * k)), dh = Math.max(1, Math.round(docH * k));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(full, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    }
    c.thumbs[at] = cv;
  }
  return c.thumbs[at];
}




export const alphaPaintDirty = new Set();
export function alphaPaintBuffer(at){
  const g = docAlphaGray(at);
  return g && g.length === docW * docH ? g : null;
}
export function markAlphaPainted(at, live = false){
  alphaPaintDirty.add(at);
  const c = alphaCacheFor();
  if (c.thumbs && at < c.thumbs.length) c.thumbs[at] = undefined;
  if (!live) try { syncChannelPanel(); } catch {}
}
const alphaPaintCapture = () => {
  if (!alphaPaintDirty.size) return null;
  const grays = {};
  for (const at of alphaPaintDirty) { const g = alphaPaintBuffer(at); if (g) grays[at] = Uint8Array.from(g); }
  return { grays };
};
const alphaPaintApply = v => {
  alphaPaintDirty.clear();
  if (!v || !v.grays) return;
  const c = alphaCacheFor();
  for (const [at, g] of Object.entries(v.grays)) { if (+at < c.list.length) { c.grays[+at] = Uint8Array.from(g); c.thumbs[+at] = undefined; alphaPaintDirty.add(+at); } }
};
DOC_EXT.push({
  key: 'alphaPaint', label: 'Alpha 通道（画笔）',
  capture: alphaPaintCapture, apply: alphaPaintApply, snap: alphaPaintCapture, restore: alphaPaintApply,
  load: () => { alphaPaintDirty.clear(); },
  needsWrite: () => alphaPaintDirty.size > 0, dirty: () => alphaPaintDirty.size > 0,
  writeInto: buf => {
    let out = buf;
    for (const at of alphaPaintDirty) { const g = alphaPaintBuffer(at); if (g) out = setAlphaChannel(out, at, g); }
    return out instanceof ArrayBuffer ? out : out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  },
});

export function alphaWriteWhy(){
  if (!doc) return '先打开一个文档';
  if (li) return '正在编辑智能对象：先退回文档视图';
  if (doc.mode === 7) return '多通道模式下每条通道都是油墨，没有「Alpha 通道」这回事（PS 同）';
  if (doc.depth !== 8 && doc.depth !== 16 && doc.depth !== 32)
    return `还没做：${doc.depth} 位/通道的文档还不能增删 Alpha 通道（合成数据段只实现了 8 / 16 / 32 位的样本写法）`;
  return '';
}

export function selectionGrayFull(sel){
  const out = new Uint8Array(docW * docH);
  if (!sel || !sel.data) return out;
  for (let y = 0; y < sel.height; y++) {
    const dy = sel.y + y; if (dy < 0 || dy >= docH) continue;
    const row = y * sel.width, drow = dy * docW;
    for (let x = 0; x < sel.width; x++) {
      const dx = sel.x + x; if (dx < 0 || dx >= docW) continue;
      out[drow + dx] = sel.data[row + x];
    }
  }
  return out;
}

function combineGray(base, add, mode){
  const out = Uint8Array.from(base);
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = add[i];
    out[i] = mode === 'add' ? Math.max(a, b)
      : mode === 'subtract' ? Math.max(0, a - b)
      : mode === 'intersect' ? Math.min(a, b) : b;
  }
  return out;
}




export async function applyAlphaEdit(label, fn){
  const why = alphaWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  if (!await ensureLazy(EDIT, label)) return false;     
  $('#err').textContent = '';
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const next = fn(base);
    await initDocument(next, docName, { nested: docStack.length > 0 });
    refreshAll(false);
    structuralDone(prev, label);
    syncChannelPanel();
    return true;
  } catch (e) {
    $('#err').textContent = `${label}没能完成：` + humanEditError(e && e.message || e);
    return false;
  }
}


let saveSelDlgEl = null;
export async function saveSelectionDialog(){
  if (!doc || li) return false;
  if (!selection) { $('#notice').textContent = '先做一个选区，再存储它。'; return false; }
  const why = alphaWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  const existing = docAlphaChannels();
  if (!saveSelDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:320px">'
      + '<h3 class="fp-dlg-title">存储选区</h3>'
      + '<div class="ssDlg-body"></div>'
      + '<p class="ssDlg-hint" style="opacity:.7;font-size:12px;margin:6px 0 0">'
      + '存成文档的 Alpha 通道：会改写文件头通道数与整段合成数据，算一步结构性改动（可撤销）。</p>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    saveSelDlgEl = dlg;
  }
  const body = saveSelDlgEl.querySelector('.ssDlg-body');
  body.innerHTML = '';
  const line = label => { const r = document.createElement('label');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    r.append(Object.assign(document.createElement('span'), { textContent: label, style: 'min-width:48px' }));
    body.append(r); return r; };
  const tgt = document.createElement('select');
  tgt.dataset.attr = 'ss-target'; tgt.style.flex = '1';
  tgt.append(Object.assign(document.createElement('option'), { value: 'new', textContent: '新建通道' }));
  for (const c of existing)
    tgt.append(Object.assign(document.createElement('option'), { value: String(c.at), textContent: c.name }));
  line('通道').append(tgt);
  const nameRow = line('名称');
  const name = document.createElement('input');
  name.type = 'text'; name.dataset.attr = 'ss-name'; name.style.flex = '1';
  name.value = `Alpha ${existing.length + 1}`;
  nameRow.append(name);
  const opRow = line('操作');
  const op = document.createElement('select');
  op.dataset.attr = 'ss-op'; op.style.flex = '1';
  for (const [v, label] of [['replace', '替换通道'], ['add', '添加到通道'], ['subtract', '从通道中减去'], ['intersect', '与通道交叉']])
    op.append(Object.assign(document.createElement('option'), { value: v, textContent: label }));
  opRow.append(op);
  const syncRows = () => {
    const isNew = tgt.value === 'new';
    nameRow.style.display = isNew ? '' : 'none';
    opRow.style.display = isNew ? 'none' : '';          
  };
  tgt.onchange = syncRows; syncRows();

  return await new Promise(res => {
    const done = v => { try { saveSelDlgEl.close(); } catch { saveSelDlgEl.removeAttribute('open'); } res(v); };
    saveSelDlgEl.querySelector('.fp-dlg-ok').onclick = async () => {
      const gray = selectionGrayFull(selection);
      const isNew = tgt.value === 'new';
      const at = isNew ? -1 : (+tgt.value | 0);
      const nm = (name.value || '').trim() || `Alpha ${existing.length + 1}`;
      done(true);
      if (isNew) {
        const okDone = await applyAlphaEdit(`存储选区到「${nm}」`, buf => addAlphaChannel(buf, { name: nm, gray }));
        if (okDone) shell.status(`选区已存成新通道「${nm}」`);
      } else {
        const label = existing[at] ? existing[at].name : `Alpha ${at + 1}`;
        const cur = docAlphaGray(at) || new Uint8Array(docW * docH);
        const next = combineGray(cur, gray, op.value);
        const okDone = await applyAlphaEdit(`存储选区到「${label}」`, buf => setAlphaChannel(buf, at, next));
        if (okDone) shell.status(`选区已${op.selectedOptions[0].textContent}「${label}」`);
      }
    };
    saveSelDlgEl.querySelector('.fp-dlg-cancel').onclick = () => done(false);
    saveSelDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!saveSelDlgEl.open) { if (saveSelDlgEl.showModal) saveSelDlgEl.showModal(); else saveSelDlgEl.setAttribute('open', ''); } }
    catch { saveSelDlgEl.setAttribute('open', ''); }
  });
}


export async function newAlphaChannelUI(){
  const why = alphaWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  const nm = `Alpha ${docAlphaChannels().length + 1}`;
  return await applyAlphaEdit(`新建通道「${nm}」`,
    buf => addAlphaChannel(buf, { name: nm, gray: new Uint8Array(docW * docH) }));   
}
export async function duplicateAlphaChannelUI(at){
  const src = docAlphaChannels().find(c => c.at === at);
  if (!src) return false;
  const gray = docAlphaGray(at);
  if (!gray) { $('#notice').textContent = '这条通道的像素现在读不出来。'; return false; }
  const nm = `${src.name} 拷贝`;
  return await applyAlphaEdit(`复制通道「${src.name}」`, buf => addAlphaChannel(buf, { name: nm, gray }));
}
export async function deleteAlphaChannelUI(at, noAsk){
  const src = docAlphaChannels().find(c => c.at === at);
  if (!src) return false;
  if (!noAsk && !await confirmDialog(`删除通道「${src.name}」？`, { okText: '删除' })) return false;
  return await applyAlphaEdit(`删除通道「${src.name}」`, buf => removeAlphaChannel(buf, at));
}
export async function renameAlphaChannelUI(at){
  const src = docAlphaChannels().find(c => c.at === at);
  if (!src) return false;
  const nm = await promptDialog('通道名称', src.name, { label: '名称' });
  if (nm == null || !String(nm).trim() || String(nm).trim() === src.name) return false;
  return await applyAlphaEdit(`重命名通道「${src.name}」`, buf => renameAlphaChannel(buf, at, String(nm).trim()));
}

export function loadAlphaSelection(at){
  const gray = docAlphaGray(at);
  if (!gray) { $('#notice').textContent = '这条通道的像素现在读不出来。'; return false; }
  if (!selReady('载入通道选区')) return false;
  const next = createSelection(docW, docH, 0, 0, docW, docH, gray);
  combineInto(next, 'replace');
  shell.status(`已把通道「${(docAlphaChannels().find(c => c.at === at) || {}).name || 'Alpha'}」载入为选区`);
  return true;
}











export const textDescEdits = {};      
export const ANTI_ALIAS_MODES = [
  ['none', 'antiAliasNone', '无'], ['sharp', 'antiAliasSharp', '锐利'], ['crisp', 'antiAliasCrisp', '犀利'],
  ['strong', 'antiAliasStrong', '浑厚'], ['smooth', 'antiAliasSmooth', '平滑'],
  ['macLcd', 'antiAliasPlatformLCD', 'Mac LCD'], ['mac', 'antiAliasPlatformGray', 'Mac'],
];

export function effTextDesc(i, field){
  const q = textDescEdits[i];
  if (q && q[field] !== undefined) return q[field];
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  return L && L.text ? L.text[field] : undefined;
}

export function queueTextDesc(i, patch){
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  if (!L || !L.text) return false;
  const cur = { ...(textDescEdits[i] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    
    const attached = k === 'shape' && (patch.box || patch.pointBase);   
    const sameDyn = k === 'dynamic' && dynSame(v, L.text.dynamic);   
    if (sameDyn || (k !== 'box' && k !== 'pointBase' && !attached && v === L.text[k])) delete cur[k]; else cur[k] = v;
  }
  if (cur.shape === undefined) { delete cur.box; delete cur.pointBase; }
  if (cur.dynamic == null && !L.text.dynamic) delete cur.dynamic;
  if (Object.keys(cur).length) textDescEdits[i] = cur; else delete textDescEdits[i];
  return true;
}


function dynSame(a, b){ if (!a || !b) return !a && !b; return (a.shape || 'stack') === (b.shape || 'stack') && Math.abs((a.lineGap ?? 0.1) - (b.lineGap ?? 0.1)) < 1e-6 && Math.abs((a.wordGap || 0) - (b.wordGap || 0)) < 1e-6; }

export const textDynamicOf = i => { const q = textDescEdits[i]; if (q && q.dynamic !== undefined) return q.dynamic || null; const L = layerTree && layerTree.flat && layerTree.flat[i]; return (L && L.text && L.text.dynamic) || null; };
export const DYN_SHAPES = [['stack', '块状'], ['circle', '圆形'], ['arch', '拱形'], ['bow', '弓形']];



export let textDynamicCarry = null;
export function set_textDynamicCarry(v) { return (textDynamicCarry = v); }   
export function captureTextDynamicCarry(){
  const out = [];
  const flat = (layerTree && layerTree.flat) || [];
  for (let i = 0; i < flat.length; i++) {
    const d = textDynamicOf(i); if (!d || layerDeletes.has(i) || !flat[i].text) continue;
    out.push({ name: layerRenames[i] != null ? layerRenames[i] : flat[i].name, text: dispTextOf(i, flat[i]), dyn: { ...d } });
  }
  textDynamicCarry = out.length ? out : null;
}
export function applyTextDynamicCarry(){
  const carry = textDynamicCarry; textDynamicCarry = null;
  if (!carry || !layerTree || !layerTree.flat) return;
  const used = new Set();
  layerTree.flat.forEach((L, i) => {
    if (!L || !L.text || L.text.content == null || L.text.shape !== 'box') return;
    const k = carry.findIndex((c, n) => !used.has(n) && c.name === L.name && c.text === L.text.content);
    if (k < 0) return;
    used.add(k);
    if (dynSame(L.text.dynamic, carry[k].dyn)) return;   
    textDescEdits[i] = { ...(textDescEdits[i] || {}), dynamic: carry[k].dyn };
    if (layerTextEdits[i] == null) layerTextEdits[i] = L.text.content;
    renderTextLayer(i, L, { silent: true }).then(() => { if (layerTree && layerTree.flat[i] === L) { renderStaticLayers(); renderLayerPanel(); } });
  });
}

export async function toggleDynamicText(i, shape){
  if (!isTextLayer(i)) return false;
  const cur = textDynamicOf(i);
  if (cur && !shape) { await applyTextDesc(i, { dynamic: null }, '还原为普通文字'); shell.status('已还原为普通文字'); return true; }
  if (effTextDesc(i, 'orientation') === 'vertical') { shell.status('动态文本只支持横排文字（PS 同）'); return false; }
  const dyn = { shape: shape || (cur && cur.shape) || 'stack', lineGap: cur && cur.lineGap != null ? cur.lineGap : 0.1 };
  if (effTextShape(i) !== 'box') {
    const L = layerTree.flat[i];
    if (!textCrops[i]) await renderTextLayer(i, L, { silent: true });
    const dl = doc && doc.layers[i];
    const b = (textCrops[i] && textCrops[i].bounds) || (dl && dl.bounds && dl.bounds.right > dl.bounds.left ? dl.bounds : null);
    if (!b) { shell.status('这一层量不出文字范围，转不了动态文本'); return false; }
    const bx = textBoxForConvert(i, b);
    await applyTextDesc(i, { shape: 'box', box: [Math.max(1, Math.round(bx.w)), Math.max(1, Math.round(bx.h)), bx.x, bx.y], dynamic: dyn }, '转换为动态文本');
  } else await applyTextDesc(i, { dynamic: dyn }, cur ? '动态文本形状' : '转换为动态文本');
  shell.status(`动态文本：${(DYN_SHAPES.find(x => x[0] === dyn.shape) || [, dyn.shape])[1]}（拖文字框的控制点，字号 / 换行跟着框走）`);
  return true;
}


function textBoxForConvert(i, inkDoc){
  const T = textLayoutOf(i), lb = T && T.lay && T.lay.bounds;
  if (lb && !T.lay.vertical && lb.right > lb.left) {
    const sz = (T.model.runs[0] && T.model.runs[0].fontSize) || 12;
    return { x: lb.left, y: lb.top, w: Math.ceil(lb.right - lb.left + sz * 0.05) + 1, h: Math.ceil(lb.bottom - lb.top) + 1 };
  }
  return textSpaceBoxOf(i, inkDoc);
}

function textSpaceBoxOf(i, b){
  const L = layerTree.flat[i], T = (L.text.transform || [1, 0, 0, 1, 0, 0]);
  const det = T[0] * T[3] - T[1] * T[2] || 1;
  const inv = (x, y) => { const dx = x - T[4], dy = y - T[5]; return [(T[3] * dx - T[2] * dy) / det, (-T[1] * dx + T[0] * dy) / det]; };
  const pts = [inv(b.left, b.top), inv(b.right, b.top), inv(b.right, b.bottom), inv(b.left, b.bottom)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export async function applyTextDesc(i, patch, label){
  if (!isTextLayer(i)) return false;
  if (!textEditAbsorbs(i)) pushDocHistory(label || '文字属性');
  queueTextDesc(i, patch);
  const L = layerTree.flat[i];
  if (layerTextEdits[i] == null) layerTextEdits[i] = L.text.content;   
  await renderTextLayer(i, L, { silent: true });
  renderStaticLayers(); renderLayerPanel(); renderProps(); syncTextBar(); updateUndoButtons();
  if (textOverlay && textOverlay.idx === i) { layoutInlineText(); try { textOverlay.ta.focus({ preventScroll: true }); } catch {} }
  return true;
}



export const effTextShape = i => {
  const q = textDescEdits[i];
  if (q && q.shape) return q.shape;
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  return (L && L.text && L.text.shape) || 'point';
};
export async function convertTextShapeUI(i){
  if (!isTextLayer(i)) return false;
  const L = layerTree.flat[i];
  const to = effTextShape(i) === 'box' ? 'point' : 'box';
  if (to === 'box') {
    

    if (!textCrops[i]) await renderTextLayer(i, L, { silent: true });
    

    const dl = doc && doc.layers[i];
    const b = (textCrops[i] && textCrops[i].bounds)
      || (dl && dl.bounds && dl.bounds.right > dl.bounds.left
          ? { left: dl.bounds.left, top: dl.bounds.top, right: dl.bounds.right, bottom: dl.bounds.bottom } : null);
    if (!b) { $('#notice').textContent = '这一层量不出文字范围，转不了段落文本。'; return false; }
    const bx = textBoxForConvert(i, b);
    const w = Math.max(1, Math.round(bx.w)), h = Math.max(1, Math.round(bx.h));
    await applyTextDesc(i, { shape: 'box', box: [w, h, bx.x, bx.y] }, '转换为段落文本');
    shell.status(`已转换为段落文本（文字框 ${w} × ${h}）`);
  } else {
    
    const T0 = textLayoutOf(i), inf0 = effTextInfo(i, L), ln0 = T0 && T0.lay.lines[0];
    const bx0 = inf0.box || [0, 0, 0, 0];
    const Tb = inf0.transform || [1, 0, 0, 1, 0, 0], T = L.text.transform || [1, 0, 0, 1, 0, 0];
    
    const det = T[0] * T[3] - T[1] * T[2] || 1, ddx = Tb[4] - T[4], ddy = Tb[5] - T[5];
    const sh = [(T[3] * ddx - T[2] * ddy) / det, (-T[1] * ddx + T[0] * ddy) / det];
    const pb = [bx0[0] + sh[0], (ln0 ? ln0.y : bx0[1]) + sh[1]];
    await applyTextDesc(i, { shape: 'point', box: null, pointBase: pb }, '转换为点文本');
    shell.status('已转换为点文本');
  }
  return true;
}


const LOREM_IPSUM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, '
  + 'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '
  + 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
export async function pasteLoremIpsum(i){
  if (!isTextLayer(i)) return false;
  const L = layerTree.flat[i];
  pushDocHistory('粘贴 Lorem Ipsum');
  layerTextEdits[i] = LOREM_IPSUM;
  await renderTextLayer(i, L, { silent: true });
  renderStaticLayers(); renderLayerPanel(); renderProps(); syncTextBar(); updateUndoButtons();
  shell.status(`已粘贴 Lorem Ipsum（${LOREM_IPSUM.length} 个字符）`);
  return true;
}



async function missingFontLayers(){
  const out = [];
  const flat = (layerTree && layerTree.flat) || [];
  for (let i = 0; i < flat.length; i++) {
    const L = flat[i];
    if (!L || !L.text || !L.text.font) continue;
    if (textFontSubst[i]) continue;                       
    const r = await resolveFont(L.text.font);
    if (!r.ok) out.push({ index: i, name: layerRenames[i] || L.name || `图层 ${i}`, font: L.text.font });
  }
  return out;
}
export async function resolveMissingFontsUI(all){
  if (!doc || li) return false;
  const missing = await missingFontLayers();
  if (!missing.length) { $('#notice').textContent = '这份文档里没有本机缺失的字体。'; shell.status('没有欠缺字体'); return false; }
  if (!all) {
    
    let done = 0;
    for (const m of missing) {
      const picked = await pickFont(m.font, m.index);
      if (!picked) break;                                  
      textFontSubst[m.index] = picked;
      await renderTextLayer(m.index, layerTree.flat[m.index], { silent: true });
      done++;
    }
    renderStaticLayers(); renderLayerPanel(); renderProps();
    shell.status(`欠缺字体：${done} / ${missing.length} 层已替换`);
    return done > 0;
  }
  
  const picked = new Map();
  for (const m of missing) {
    if (!picked.has(m.font)) {
      const p = await pickFont(m.font, m.index);
      if (!p) return false;
      picked.set(m.font, p);
    }
    textFontSubst[m.index] = picked.get(m.font);
    await renderTextLayer(m.index, layerTree.flat[m.index], { silent: true });
  }
  renderStaticLayers(); renderLayerPanel(); renderProps();
  shell.status(`已替换 ${missing.length} 个文字层的欠缺字体（${picked.size} 种字体）`);
  return true;
}

export async function updateAllTextLayers(){
  if (!doc || li) return false;
  const flat = (layerTree && layerTree.flat) || [];
  let n = 0;
  for (let i = 0; i < flat.length; i++) {
    if (!flat[i] || !flat[i].text) continue;
    try { await renderTextLayer(i, flat[i], { silent: true }); n++; } catch {  }
  }
  renderStaticLayers(); renderLayerPanel(); renderProps();
  shell.status(n ? `已重排 ${n} 个文字图层` : '这份文档里没有文字图层');
  return n > 0;
}




export const FONT_PREVIEW_SIZES = [['none', '无', 0], ['small', '小', 12], ['medium', '中', 14],
                            ['large', '大', 18], ['xl', '特大', 24], ['xxl', '超大', 32]];
export let fontPreviewSize = 'medium';
try { const v = localStorage.getItem('psd_editor.fontPreviewSize'); if (v && FONT_PREVIEW_SIZES.some(s => s[0] === v)) fontPreviewSize = v; } catch {}
export function fontPreviewPx(){
  const spec = FONT_PREVIEW_SIZES.find(s => s[0] === fontPreviewSize);
  return spec ? spec[2] : 14;
}
export function setFontPreviewSize(k){
  if (!FONT_PREVIEW_SIZES.some(s => s[0] === k)) return false;
  fontPreviewSize = k;
  try { localStorage.setItem('psd_editor.fontPreviewSize', k); } catch {  }
  if (fontPop && fontPop.ui) fontPop.ui.render();          
  shell.status('字体预览大小：' + ((FONT_PREVIEW_SIZES.find(s => s[0] === k) || [])[1] || k));
  return true;
}










const TEXT_WARP_STYLES = WARP_STYLES;   
export const warpEnum = (v, t) => ({ __enumType: t, value: v });

export function effTextWarp(i){
  const q = textDescEdits[i];
  if (q && q.warp) return q.warp;
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  return (L && L.text && L.text.warp) || null;
}
export const warpStyleOf = w => (w && w.warpStyle && w.warpStyle.value) || 'warpNone';
export const warpNumOf = (w, k) => (w && Number.isFinite(w[k]) ? w[k] : 0);

export const warpLabelOf = style => (TEXT_WARP_STYLES.find(s => s[0] === style) || [style, style])[1];

let textWarpDlgEl = null;
export async function openTextWarpDialog(i){
  if (!isTextLayer(i)) return false;
  const L = layerTree.flat[i];
  const cur = effTextWarp(i);
  if (!textWarpDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:340px">'
      + '<h3 class="fp-dlg-title">变形文字</h3>'
      + '<div class="twDlg-body"></div>'
      + '<p class="twDlg-hint" style="opacity:.7;font-size:12px;margin:8px 0 0">'
      + '写进 PSD 的是 PS 认的那份变形描述符（样式 + 弯曲 + 扭曲，打开后 PS 按它自己的网格重画）。'
      + '画布预览与 PS 同构：按样式生成 4×4 贝塞尔网格再变形（与「编辑 › 变换 › 变形」的同名预设共用一套公式）。</p>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    textWarpDlgEl = dlg;
  }
  const body = textWarpDlgEl.querySelector('.twDlg-body');
  body.innerHTML = '';
  const line = label => { const r = document.createElement('label');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    r.append(Object.assign(document.createElement('span'), { textContent: label, style: 'min-width:64px' }));
    body.append(r); return r; };
  const styleSel = document.createElement('select');
  styleSel.dataset.attr = 'twarp-style'; styleSel.style.flex = '1';
  for (const [v, label] of TEXT_WARP_STYLES)
    styleSel.append(Object.assign(document.createElement('option'), { value: v, textContent: label }));
  styleSel.value = warpStyleOf(cur);
  line('样式').append(styleSel);
  const dirRow = line('方向');
  const dirs = [['Hrzn', '水平'], ['Vrtc', '垂直']].map(([v, label]) => {
    const w = document.createElement('label');
    w.style.cssText = 'display:inline-flex;align-items:center;gap:5px;margin-right:12px;cursor:pointer';
    const r = document.createElement('input');
    r.type = 'radio'; r.name = 'twarpDir'; r.value = v; r.dataset.attr = 'twarp-dir';
    r.checked = ((cur && cur.warpRotate && cur.warpRotate.value) || 'Hrzn') === v;
    w.append(r, Object.assign(document.createElement('span'), { textContent: label }));
    dirRow.append(w);
    return r;
  });
  const num = (label, attr, value) => {
    const row = line(label);
    const el = document.createElement('input');
    el.type = 'range'; el.min = '-100'; el.max = '100'; el.step = '1'; el.value = String(Math.round(value));
    el.dataset.attr = attr; el.style.flex = '1';
    const out = document.createElement('span'); out.style.minWidth = '42px'; out.textContent = el.value + '%';
    el.oninput = () => { out.textContent = el.value + '%'; };
    row.append(el, out);
    return el;
  };
  const bend = num('弯曲', 'twarp-bend', warpNumOf(cur, 'warpValue'));
  const ph = num('水平扭曲', 'twarp-h', warpNumOf(cur, 'warpPerspective'));
  const pv = num('垂直扭曲', 'twarp-v', warpNumOf(cur, 'warpPerspectiveOther'));
  const syncEnable = () => {
    const off = styleSel.value === 'warpNone';
    for (const el of [...dirs, bend, ph, pv]) el.disabled = off;
  };
  
  const origDesc = textDescEdits[i] ? cloneOpValue(textDescEdits[i]) : null;
  const buildWarp = () => {
    const style = styleSel.value, base = (L.text && L.text.warp) || {};
    const next = { ...base, __classID: base.__classID || 'warp', __name: base.__name || '' };
    next.warpStyle = warpEnum(style, 'warpStyle');
    if (style === 'warpNone') { next.warpValue = 0; next.warpPerspective = 0; next.warpPerspectiveOther = 0; }
    else { next.warpValue = Math.round(+bend.value) || 0; next.warpPerspective = Math.round(+ph.value) || 0; next.warpPerspectiveOther = Math.round(+pv.value) || 0;
      next.warpRotate = warpEnum((dirs.find(r => r.checked) || dirs[0]).value, 'Ornt'); }
    return next;
  };
  let pvSeq = 0, previewed = false;
  const preview = async () => {
    const my = ++pvSeq; previewed = true;
    queueTextDesc(i, { warp: buildWarp() });
    if (layerTextEdits[i] == null) layerTextEdits[i] = L.text.content;
    await renderTextLayer(i, L, { silent: true });
    if (my === pvSeq) renderStaticLayers();
  };
  const restoreDesc = () => { if (origDesc) textDescEdits[i] = origDesc; else delete textDescEdits[i]; };
  styleSel.onchange = () => { syncEnable(); preview(); };
  for (const el of [bend, ph, pv]) el.addEventListener('input', preview);
  for (const r of dirs) r.addEventListener('change', preview);
  syncEnable();
  return await new Promise(res => {
    const done = v => { try { textWarpDlgEl.close(); } catch { textWarpDlgEl.removeAttribute('open'); } res(v); };
    const cancel = async () => {
      if (previewed) { pvSeq++; restoreDesc(); await renderTextLayer(i, L, { silent: true }); renderStaticLayers(); }
      done(false);
    };
    textWarpDlgEl.querySelector('.fp-dlg-ok').onclick = async () => {
      pvSeq++; restoreDesc();
      const style = styleSel.value;
      

      const base = (L.text && L.text.warp) || {};
      const next = { ...base, __classID: base.__classID || 'warp', __name: base.__name || '' };
      next.warpStyle = warpEnum(style, 'warpStyle');
      if (style === 'warpNone') { next.warpValue = 0; next.warpPerspective = 0; next.warpPerspectiveOther = 0; }
      else {
        next.warpValue = Math.round(+bend.value) || 0;
        next.warpPerspective = Math.round(+ph.value) || 0;
        next.warpPerspectiveOther = Math.round(+pv.value) || 0;
        next.warpRotate = warpEnum((dirs.find(r => r.checked) || dirs[0]).value, 'Ornt');
      }
      await applyTextDesc(i, { warp: next }, '文字变形');
      shell.status(style === 'warpNone'
        ? '已去掉文字变形'
        : `文字变形：${warpLabelOf(style)} ${next.warpValue}%（写进 PSD；画布为近似预览）`);
      done(true);
    };
    textWarpDlgEl.querySelector('.fp-dlg-cancel').onclick = () => cancel();
    textWarpDlgEl.oncancel = e => { e.preventDefault(); cancel(); };
    try { if (!textWarpDlgEl.open) { if (textWarpDlgEl.showModal) textWarpDlgEl.showModal(); else textWarpDlgEl.setAttribute('open', ''); } }
    catch { textWarpDlgEl.setAttribute('open', ''); }
  });
}
