




import './08-doc-size.js';   
import {
  segApply, segStrip, segRemap, segsEmpty, paraExtent, isParaKey, PRIVATE_CHAR_KEYS, PRIVATE_PARA_KEYS,
} from '../../../core/text-styles.js';
import { CP_PARA_EXTRA_KEYS } from '../text-para-keys.js';
import { formDialog } from '../dialog.js';
import { hasUiIcon } from '../icons.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy, icon } from './01-boot.js';
import {
  doc, docName, docStack, fontCache, layerDeletes, layerTextEdits, layerTree, li, maskEdit, origBuffer,
  set_textDrag, textCrops, textDrag, textFontSubst, textOverlay, textRenders, textStyleEdits,
} from './02-doc-state.js';
import { pushDocHistory, structuralBegin, structuralDone, updateUndoButtons } from './03-history.js';
import { layerSelBBox } from './06-view-zoom-move.js';
import { docResolution } from './08-doc-size.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { layerCanvasCache, renderLayerPanel, selLayer, set_selLayer, thumbCache } from './23-layers-panel.js';
import { humanEditError, renderProps } from './24-layer-ops-queue.js';
import { displayOrder, startScrub } from './29-scrubby-live.js';
import { paintStates, renderStaticLayers } from './30-render.js';
import { closeMaskEdit, docTool, maskEditRelayout, setDocTool, startTextMask } from './31-selection-brush.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import { closeInlineText, layoutInlineText, openInlineTextEditor, textOwnRaster } from './47-canvas-context-menu.js';
import {
  buildPsdBuffer, ensureStructuralBase, setWaitCursor, textEditAbsorbs, textIndexAt, toggleCharParaPanels,
} from './48-info-export.js';
import {
  TEXT_TOOL_DEFAULT_FONT, applyTextFont, closeFontPopover, effTextInfo, ensureTextRaster, fontChoiceOf,
  fontFamilies, fontPop, loadSystemFonts, openFontPopover, renderTextLayer, selFontPs, set_textToolFont,
  sysFontByPs, textModelOf, textPtFactor, textToolFont, textToolFontPs,
} from './49-fonts-text-model.js';
import {
  ANTI_ALIAS_MODES, applyTextDesc, effTextDesc, openTextWarpDialog, queueTextDesc, textDescEdits, textDynamicOf,
  toggleDynamicText,
} from './52-alpha-text-menu.js';
import { CPP, TXP, pathTextToTextSpace } from './57-layer-style-text-path.js';













export const TEXT_ALIGNS = [['left', '左对齐'], ['center', '居中对齐'], ['right', '右对齐']];
export const TEXT_ALIGNS_ALL = [['left', '左对齐文本', 'text-align-left'], ['center', '居中对齐文本', 'text-align-center'], ['right', '右对齐文本', 'text-align-right'],
  ['justify', '最后一行左对齐', 'text-align-just-left'], ['justifyCenter', '最后一行居中对齐', 'text-align-just-center'],
  ['justifyRight', '最后一行右对齐', 'text-align-just-right'], ['justifyAll', '全部对齐', 'text-align-just-all']];
export const isTextLayer = i => !!(layerTree && layerTree.flat && layerTree.flat[i] && layerTree.flat[i].text
                            && layerTree.flat[i].text.content != null);

export function textInfoOf(i){
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  if (!L || !L.text) return null;
  const info = effTextInfo(i, L);
  

  let model = null; try { model = textModelOf(i, L); } catch { model = null; }
  if (!model || !model.runs.length) return info;
  let pos = 0;
  if (textOverlay && textOverlay.idx === i) { const a = textOverlay.ta.selectionStart || 0, b = textOverlay.ta.selectionEnd || 0; pos = a === b ? Math.max(0, a - 1) : a; }
  const r = model.runs.find(q => pos >= q.from && pos < q.to) || model.runs[model.runs.length - 1];
  const out = { ...info, font: r.font || info.font, fontSize: r.fontSize, color: r.color || info.color,
    bold: !!r.fauxBold || /bold|black|heavy/i.test(r.font || ''), italic: !!r.fauxItalic || /italic|oblique/i.test(r.font || ''),
    underline: !!r.underline, strikethrough: !!r.strikethrough, tracking: r.tracking || 0, leading: r.leading, hScale: r.hScale || 1, vScale: r.vScale || 1,
    baselineShift: r.baselineShift || 0, caps: r.caps || 'none', baseline: r.baseline || 'normal', autoKern: r.autoKern !== false,
    ligatures: r.ligatures !== false, dligatures: !!r.dligatures, runCss: r.css || null };
  for (const k of ['tsume', 'noBreak', 'charDirection', 'hindiNumbers', 'kerning', 'kashida', 'diacriticPos', ...PRIVATE_CHAR_KEYS]) if (r[k] !== undefined) out[k] = r[k];
  const pp = textOverlay && textOverlay.idx === i ? (textOverlay.ta.selectionStart || 0) : 0;
  const para = model.paragraphs.find(q => pp >= q.from && pp < q.to) || model.paragraphs[0];
  if (para) {
    const J = ['left', 'right', 'center', 'justify', 'justifyRight', 'justifyCenter', 'justifyAll'];
    out.align = J[para.justification] || 'left'; out.justification = para.justification;
    for (const k of ['startIndent', 'endIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter', 'hyphenate', 'burasagari', 'kinsokuOrder', 'hanging', 'everyLineComposer', ...CP_PARA_EXTRA_KEYS, ...PRIVATE_PARA_KEYS])
      if (para[k] !== undefined) out[k] = para[k];
  }
  return out;
}

export function textEditTargets(i){
  if (!textOverlay || textOverlay.idx !== i) return { char: null, para: null };
  const ta = textOverlay.ta, text = ta.value.replace(/\n$/, ''), len = text.length;
  const a = Math.min(ta.selectionStart || 0, len), b = Math.min(ta.selectionEnd || 0, len);
  const char = a < b && !(a === 0 && b >= len) ? [a, b] : null;
  const [pa, pb] = paraExtent(text, a, b);
  const para = pa === 0 && pb >= len ? null : [pa, pb];
  return { char, para, text };
}

export function textRangesOf(i, text){
  const e = textStyleEdits[i], r = e && e.__ranges;
  if (!r) return [];
  if (r.text !== text) { const segs = segRemap(r.segs, r.text, text); e.__ranges = { text, segs }; return segs; }
  return r.segs;
}
export function setTextRanges(i, text, segs){
  const e = { ...(textStyleEdits[i] || {}) };
  if (segsEmpty(segs)) delete e.__ranges; else e.__ranges = { text, segs };
  if (Object.keys(e).length) textStyleEdits[i] = e; else delete textStyleEdits[i];
}

export function stripTextRanges(i, keys){
  const e = textStyleEdits[i]; if (!e || !e.__ranges) return;
  setTextRanges(i, e.__ranges.text, segStrip(e.__ranges.segs, keys));
}

export function textEffSegs(i, L, text){
  let segs = [];
  const pv = L && L.text && L.text.priv;
  if (pv && Array.isArray(pv.segs) && pv.segs.length && typeof pv.text === 'string') { try { segs = segRemap(pv.segs, pv.text, text); } catch { segs = []; } }
  const e = textStyleEdits[i] || {};
  const lw = {};
  for (const k of [...PRIVATE_CHAR_KEYS, ...PRIVATE_PARA_KEYS]) if (e[k] !== undefined) lw[k] = e[k];
  if (Object.keys(lw).length) segs = segApply(segs, text.length, 0, text.length, lw);
  for (const sg of textRangesOf(i, text)) if (Object.keys(sg.patch).length) segs = segApply(segs, text.length, sg.from, sg.to, sg.patch);
  return segs;
}

function queueTextStyle(i, patch){
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  if (!L || !L.text) return false;
  const orig = L.text;
  const cur = { ...(textStyleEdits[i] || {}) };
  const same = (a, b) => Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 1e-6)
    : (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b);
  for (const [k, v] of Object.entries(patch)) {
    if (same(v, orig[k])) delete cur[k]; else cur[k] = v;
  }
  if (Object.keys(cur).length) textStyleEdits[i] = cur; else delete textStyleEdits[i];
  return true;
}
export async function applyTextStyle(i, patch){
  if (!isTextLayer(i)) return false;
  if (!textEditAbsorbs(i)) pushDocHistory();
  

  const tg = textEditTargets(i);
  const cp = {}, pp = {};
  for (const [k, v] of Object.entries(patch)) (isParaKey(k) ? pp : cp)[k] = v;
  const whole = {};
  for (const [part, rng] of [[cp, tg.char], [pp, tg.para]]) {
    if (!Object.keys(part).length) continue;
    if (rng) setTextRanges(i, tg.text, segApply(textRangesOf(i, tg.text), tg.text.length, rng[0], rng[1], part));
    else Object.assign(whole, part);
  }
  if (Object.keys(whole).length) { queueTextStyle(i, whole); stripTextRanges(i, Object.keys(whole)); }
  const L = layerTree.flat[i];
  
  if (textStyleEdits[i] || textRenders[i]) {
    if (layerTextEdits[i] == null && textStyleEdits[i]) layerTextEdits[i] = L.text.content;
    if (!textStyleEdits[i] && layerTextEdits[i] === L.text.content && textOwnRaster(i) && !textFontSubst[i]) { delete layerTextEdits[i]; delete textRenders[i]; delete textCrops[i]; delete thumbCache[i]; delete layerCanvasCache[i]; }
    else await renderTextLayer(i, L, { silent: true });
  }
  renderStaticLayers(); renderLayerPanel(); renderProps(); syncTextBar(); updateUndoButtons();
  if (textOverlay && textOverlay.idx === i) { layoutInlineText(); try { textOverlay.ta.focus({ preventScroll: true }); } catch {} }
  return true;
}

export function textLayerAt(x, y){
  const st = paintStates();
  for (const i of displayOrder().slice().reverse()) {
    if (!isTextLayer(i) || layerDeletes.has(i) || st.hidden.has(i)) continue;
    const b = layerSelBBox(i);
    if (b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return i;
  }
  return -1;
}






export async function createTextLayerAt(pt, opts = {}){
  if (li || !doc || !origBuffer) return false;
  if (!await ensureLazy(EDIT, '新建文字图层')) return false;
  const dirty = hasAnyEdits();
  const orientation = docTool === 'textVertical' ? 'vertical' : 'horizontal';
  
  const barAlign = ([...$('#txAligns').children].find(b => b.classList.contains('on')) || {}).dataset?.align || textToolOpts.align;
  const barAA = $('#txAA').value || textToolOpts.aa;
  $('#err').textContent = '';
  setWaitCursor(true, '正在处理当前视图…');
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (dirty) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const at = selLayer >= 0 ? selLayer + 1 : doc.layers.length;
    const sizePt = Math.max(0.1, +$('#txSize').value || 24);
    const size = Math.round(sizePt * (docResolution || 72) / 72 * 100) / 100;   
    const color = $('#txColor').value || '#000000';
    

    const text = ' ';
    const r = applyEdits(base, [{ op: 'addTextLayer', at, text, name: opts.box ? '段落文字' : '文字', orientation,
      x: Math.round(pt.x), y: Math.round(pt.y), fontSize: size, color,
      ...(opts.box ? { box: [Math.max(1, Math.round(opts.box[0])), Math.max(1, Math.round(opts.box[1]))] } : {}),
      font: textToolFontPs() }]);   
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '新建文字图层');
    

    queueTextStyle(selLayer, { align: barAlign, ...(CPP ? CPP.newTextPatch(textPtFactor(selLayer)) : {}) });   
    queueTextDesc(selLayer, { antiAlias: barAA });
    if (opts.pathText) queueTextDesc(selLayer, { pathText: pathTextToTextSpace(selLayer, opts.pathText) });   
    if ((textStyleEdits[selLayer] || textDescEdits[selLayer]) && layerTextEdits[selLayer] == null) layerTextEdits[selLayer] = layerTree.flat[selLayer].text.content;
    if (opts.dynamic) queueTextDesc(selLayer, { dynamic: { shape: 'stack', lineGap: 0, wordGap: 0 } });
    

    await ensureTextRaster(selLayer);
    const warn = (r.warnings || []).filter(t => /EngineData/.test(t));
    const msg = `已新建${opts.pathText ? (opts.pathText.type === 1 ? '区域' : '路径') : opts.box ? '段落' : '点'}文字图层`;
    $('#notice').textContent = msg; shell.status(msg);
    
    await openInlineTextEditor(selLayer, { fresh: prev });
    return true;
  } catch (e) {
    $('#err').textContent = '新建文字图层没能完成：' + humanEditError(e && e.message || e);
    return false;
  } finally {
    setWaitCursor(false);
  }
}



export async function textToolDown(ev, pt){
  
  if (textOverlay) {
    if (textOverlay.idx === textLayerAt(pt.x, pt.y) && !(ev && ev.shiftKey)) {   
      const k = textIndexAt(textOverlay.idx, pt); try { textOverlay.ta.focus({ preventScroll: true }); textOverlay.ta.setSelectionRange(k, k); } catch {}
      return true;
    }
    closeInlineText(true);
  }
  const hit = ev && ev.shiftKey ? -1 : textLayerAt(pt.x, pt.y);      
  if (hit >= 0) {
    if (hit !== selLayer) { set_selLayer(hit); renderLayerPanel(); renderProps(); }
    syncTextBar();
    await openInlineTextEditor(hit, { caret: pt });
    return true;
  }
  set_textDrag({ start: { x: pt.x, y: pt.y }, cur: { x: pt.x, y: pt.y }, alt: !!(ev && ev.altKey) });
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  return true;
}
export function moveTextDrag(ev, pt){
  if (!textDrag) return;
  let x = pt.x, y = pt.y;
  if (ev && ev.shiftKey) { const d = Math.max(Math.abs(x - textDrag.start.x), Math.abs(y - textDrag.start.y)); x = textDrag.start.x + Math.sign(x - textDrag.start.x || 1) * d; y = textDrag.start.y + Math.sign(y - textDrag.start.y || 1) * d; }
  textDrag.cur = { x, y };
  drawGizmo();
}
export const textDragRect = d => ({ x: Math.min(d.start.x, d.cur.x), y: Math.min(d.start.y, d.cur.y), w: Math.abs(d.cur.x - d.start.x), h: Math.abs(d.cur.y - d.start.y) });
export async function textToolUp(pt){
  const d = textDrag; if (!d) return false;
  if (pt) d.cur = { x: pt.x, y: pt.y };
  set_textDrag(null); drawGizmo();
  const r = textDragRect(d);
  const minPx = Math.max(dispThr(6), 2);
  const dragged = r.w > minPx && r.h > minPx;
  if (d.mask) {                                             
    const bx = dragged ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
    return await startTextMask(d.start, d.mask.vertical, d.mask.mode, bx);
  }
  
  if (d.alt) {
    const sz = await paragraphSizeDialog(dragged ? r.w : 200, dragged ? r.h : 100);
    if (!sz) return false;
    return await createTextLayerAt({ x: dragged ? r.x : d.start.x, y: dragged ? r.y : d.start.y }, { box: [sz.w, sz.h] });
  }
  if (dragged) return await createTextLayerAt({ x: r.x, y: r.y }, { box: [r.w, r.h] });
  return await createTextLayerAt(d.start);
}

async function paragraphSizeDialog(w, h){
  const r = await formDialog('段落文字大小', [
    { key: 'w', label: '宽度：', type: 'number', value: Math.round(w), min: 1, max: 30000, unit: '像素' },
    { key: 'h', label: '高度：', type: 'number', value: Math.round(h), min: 1, max: 30000, unit: '像素' }]);
  if (!r) return null;
  const W = +r.w, H2 = +r.h;
  return W > 0 && H2 > 0 ? { w: W, h: H2 } : null;
}


let textBarBound = false;



const LOCAL_FONT_NAMES = { 'PingFang SC': '苹方-简', 'PingFang TC': '苹方-繁', 'PingFang HK': '苹方-港', 'Hiragino Sans GB': '冬青黑体简体中文',
  'STHeiti': '华文黑体', 'STSong': '华文宋体', 'STKaiti': '华文楷体', 'STFangsong': '华文仿宋', 'Songti SC': '宋体-简', 'Songti TC': '宋体-繁',
  'Heiti SC': '黑体-简', 'Heiti TC': '黑体-繁', 'Kaiti SC': '楷体-简', 'Kaiti TC': '楷体-繁', 'Yuanti SC': '圆体-简', 'Lantinghei SC': '兰亭黑-简',
  'Microsoft YaHei': '微软雅黑', 'Microsoft YaHei UI': '微软雅黑 UI', 'Microsoft JhengHei': '微軟正黑體', 'SimSun': '宋体', 'NSimSun': '新宋体', 'SimHei': '黑体',
  'KaiTi': '楷体', 'FangSong': '仿宋', 'DengXian': '等线', 'YouYuan': '幼圆', 'LiSu': '隶书', 'Source Han Sans SC': '思源黑体', 'Source Han Serif SC': '思源宋体',
  'Noto Sans SC': '思源黑体（Noto）', 'Noto Serif SC': '思源宋体（Noto）' };
export function fontFamilyLabel(rec){
  if (!rec) return '';
  if (PREF.get('type.englishFontNames')) return rec.family;
  if (LOCAL_FONT_NAMES[rec.family]) return LOCAL_FONT_NAMES[rec.family];
  const loc = (rec.families || []).find(n => /[^\x00-\x7f]/.test(n));
  return loc || rec.family;
}
export function fontDisplayName(ps){
  if (!ps) return '';
  const rec = sysFontByPs(ps);
  if (rec) return fontFamilyLabel(rec);
  const sub = Object.values(textFontSubst).find(v => v && v.psName === ps && v.family);
  return sub ? sub.family : ps;
}

function syncTextFontStyle(ps){
  const sel = $('#txFontStyle'); if (!sel) return;
  const rec = sysFontByPs(ps);
  const fam = rec ? fontFamilies().find(f => f.family === rec.family) : null;
  const key = fam ? fam.family + '|' + fam.styles.length : 'none|' + (ps || '');
  if (sel.dataset.key !== key) {
    sel.textContent = '';
    if (fam) for (const s of fam.styles) { const o = document.createElement('option'); o.value = s.postscriptName; o.textContent = s.style; sel.appendChild(o); }
    else { const o = document.createElement('option'); o.value = ps || ''; o.textContent = ps ? (fontCache[ps] && fontCache[ps].ok === false ? '缺失' : '—') : '—'; sel.appendChild(o); }
    sel.dataset.key = key;
  }
  if (rec) sel.value = rec.postscriptName;
  sel.disabled = !fam || fam.styles.length < 2;
}


export const textToolOpts = { sizePt: 24, color: '#000000', align: 'left', aa: 'antiAliasSharp' };
const FONT_SIZE_PRESETS = [6, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72];
export const isMacUI = /Mac|iPhone|iPad/.test((typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || '');

export const aaLabel = (value, label) => value === 'antiAliasPlatformLCD' ? (isMacUI ? 'Mac LCD' : 'Windows LCD')
  : value === 'antiAliasPlatformGray' ? (isMacUI ? 'Mac' : 'Windows') : label;

const txBarTarget = () => (!docTool.startsWith('textMask') && isTextLayer(selLayer)) ? selLayer : -1;

function txBarVertical(){
  const t = txBarTarget();
  if (t >= 0) return effTextDesc(t, 'orientation') === 'vertical';
  return docTool === 'textVertical' || docTool === 'textMaskVertical';
}

function txBarIcon(name, svg, size = 18){
  if (hasUiIcon(name)) return icon(name, size);
  const s = document.createElement('span'); s.className = 'ps-ic'; s.innerHTML = svg; return s;
}
const TX_SVG = {
  orient: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 3h6M5 3v7"/><path d="M11 8h5M13.5 8v8"/><path d="M3 13c0 2 1.5 3 4 3M6 14.5 7.5 16 6 17.5"/></svg>',
  dynamic: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 3h9M6.5 3v12"/><path d="M13.5 7l-2.5 4h3l-2.5 4" stroke-linejoin="round"/></svg>',
};
export function syncTextBar(){
  const g = $('#grpText'); if (!g) return;
  if (!textBarBound) {
    textBarBound = true;
    
    const putIcon = (sel, name, size = 16, prepend = false) => { const el = $(sel); if (!el) return; const ic = icon(name, size); if (prepend) { ic.classList.add('tx-ic'); el.prepend(ic); } else { el.textContent = ''; el.append(ic); } };
    putIcon('#txSizeLab', 'text-size', 18, true);
    { 
      const lab = $('#txSizeLab'), inp = $('#txSize'), ic = lab && lab.querySelector('.tx-ic');
      if (lab && inp && ic) {
        lab.querySelectorAll('.scrub-grip').forEach(g => g.remove());
        ic.classList.add('scrub'); ic.dataset.scrubBound = '1'; ic.title = '设置字体大小（按住左右拖动调整）';
        ic.addEventListener('pointerdown', e => startScrub(e, inp, ic));
      }
    }
    putIcon('#txAALab', 'text-antialias', 18, true);
    putIcon('#txBold', 'text-bold'); putIcon('#txItalic', 'text-italic');
    putIcon('#txCancel', 'text-cancel', 18); putIcon('#txCommit', 'text-commit', 18);
    putIcon('#txWarp', 'text-warp', 18); putIcon('#txPanels', 'text-panels', 18);
    { const b = $('#txOrient'); if (b) { b.textContent = ''; b.append(txBarIcon('text-orient', TX_SVG.orient)); } }
    { const b = $('#txDynamic'); if (b) { b.textContent = ''; b.append(txBarIcon('text-dynamic', TX_SVG.dynamic)); } }
    { const c = $('#txColor'); if (c && c.parentNode) c.parentNode.prepend(icon('text-color', 18)); }
    for (const [v, label] of TEXT_ALIGNS) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.align = v; b.title = label; b.className = 'tx-ibtn';
      b.append(icon('text-align-' + v, 18));
      b.onpointerdown = e => { if (textOverlay || maskEdit) e.preventDefault(); };   
      b.onclick = () => { const t = txBarTarget(); if (t >= 0) applyTextStyle(t, { align: v }); else { textToolOpts.align = v; maskEditRelayout(); syncTextBar(); } };
      $('#txAligns').appendChild(b);
    }
    
    const aa = $('#txAA');
    for (const [, value, label] of ANTI_ALIAS_MODES) aa.append(new Option(aaLabel(value, label), value));
    aa.onchange = () => {
      const t = txBarTarget();
      if (t >= 0) applyTextDesc(t, { antiAlias: aa.value }, '消除锯齿'); else { textToolOpts.aa = aa.value; maskEditRelayout(); }
    };
    $('#txSize').addEventListener('change', () => {
      const v = +$('#txSize').value;                     
      if (!(v > 0)) { syncTextBar(); return; }
      const t = txBarTarget();
      if (t >= 0) applyTextStyle(t, { fontSize: v / textPtFactor(t) }); else { textToolOpts.sizePt = v; maskEditRelayout(); }
    });
    
    const sm = $('#txSizeMenu');
    if (sm) {
      sm.onpointerdown = e => e.preventDefault();
      sm.onclick = e => {
        const cur = +$('#txSize').value;
        panels.popup(FONT_SIZE_PRESETS.map(n => ({ label: n + ' 点', checked: Math.abs(cur - n) < 1e-6,
          run: () => { $('#txSize').value = n; $('#txSize').dispatchEvent(new Event('change')); } })), e.currentTarget.getBoundingClientRect());
      };
    }
    const cOk = $('#txCommit'), cNo = $('#txCancel');
    if (cOk) { cOk.onpointerdown = e => e.preventDefault(); cOk.onclick = () => { if (textOverlay) closeInlineText(true); if (maskEdit) closeMaskEdit(true); syncTextBar(); }; }
    if (cNo) { cNo.onpointerdown = e => e.preventDefault(); cNo.onclick = () => { if (textOverlay) closeInlineText(false); if (maskEdit) closeMaskEdit(false); syncTextBar(); }; }
    $('#txColor').addEventListener('change', () => {
      const h = $('#txColor').value.replace('#', ''), t = txBarTarget();
      if (t >= 0) applyTextStyle(t, { color: [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1] });
      else textToolOpts.color = '#' + h;
    });
    $('#txBold').onclick = () => { const inf = docTool.startsWith('textMask') ? null : textInfoOf(selLayer); if (inf) applyTextStyle(selLayer, { bold: !inf.bold }); };
    $('#txItalic').onclick = () => { const inf = docTool.startsWith('textMask') ? null : textInfoOf(selLayer); if (inf) applyTextStyle(selLayer, { italic: !inf.italic }); };
    
    $('#txOrient').onpointerdown = e => { if (textOverlay) e.preventDefault(); };
    $('#txOrient').onclick = async () => {
      const t = txBarTarget(), vert = txBarVertical();
      const nextTool = docTool.startsWith('textMask') ? (vert ? 'textMask' : 'textMaskVertical') : (vert ? 'text' : 'textVertical');
      if (t >= 0) await applyTextDesc(t, { orientation: vert ? 'horizontal' : 'vertical' }, '文字排列方向');
      if (docTool !== nextTool) setDocTool(nextTool);
      if (textOverlay) layoutInlineText();
      maskEditRelayout(); syncTextBar();
    };
    $('#txWarp').onpointerdown = e => { if (textOverlay) e.preventDefault(); };
    $('#txWarp').onclick = () => { const t = txBarTarget(); if (t >= 0) openTextWarpDialog(t); };
    $('#txPanels').onclick = () => toggleCharParaPanels();
    $('#txDynamic').onpointerdown = e => { if (textOverlay) e.preventDefault(); };
    $('#txDynamic').onclick = () => { const t = txBarTarget(); if (t >= 0) toggleDynamicText(t); };
    
    $('#txFont').onclick = async () => {
      if (fontPop && fontPop.anchor === $('#txFont')) { closeFontPopover(null); return; }
      const idx = txBarTarget();
      const r = await openFontPopover($('#txFont'), idx >= 0 ? selFontPs(idx) : textToolFontPs());
      if (!r) return;
      if (idx >= 0) await applyTextFont(idx, r); else { set_textToolFont(r); maskEditRelayout(); syncTextBar(); }
    };
    
    const stSel = $('#txFontStyle');
    if (stSel) {
      stSel.onpointerdown = () => { loadSystemFonts({ gesture: true }).then(() => syncTextBar()); };
      stSel.onchange = async () => {
        const rec = sysFontByPs(stSel.value); if (!rec) return;
        const r = await fontChoiceOf(rec);
        const t = txBarTarget();
        if (t >= 0) await applyTextFont(t, r); else { set_textToolFont(r); maskEditRelayout(); syncTextBar(); }
      };
    }
    $('#txEdit').onclick = () => { const t = txBarTarget(); if (t >= 0) openInlineTextEditor(t); };
  }
  const t = txBarTarget();
  const inf = t >= 0 ? textInfoOf(t) : null;
  const on = !!inf, vert = txBarVertical();
  for (const id of ['#txBold', '#txItalic', '#txEdit', '#txWarp']) { const el = $(id); if (el) el.disabled = !on; }
  for (const id of ['#txSize', '#txColor', '#txAA', '#txOrient', '#txSizeMenu']) { const el = $(id); if (el) el.disabled = false; }
  { const el = $('#txDynamic'); if (el) { el.disabled = !on || vert; el.classList.toggle('on', on && !!textDynamicOf(t)); } }
  for (const id of ['#txCommit', '#txCancel']) { const el = $(id); if (el) el.hidden = !textOverlay && !maskEdit; }
  const fontBtn = $('#txFont'); if (fontBtn) fontBtn.disabled = false;   
  syncTextFontStyle(on ? selFontPs(t) : textToolFontPs());
  
  const VLAB = { left: '顶对齐文本', center: '居中对齐文本', right: '底对齐文本' }, HLAB = { left: '左对齐文本', center: '居中对齐文本', right: '右对齐文本' };
  const curAlign = on ? inf.align : textToolOpts.align;
  for (const b of $('#txAligns').children) {
    const v = b.dataset.align;
    b.disabled = false; b.classList.toggle('on', curAlign === v);
    b.title = (vert ? VLAB : HLAB)[v];
    const want = vert ? 'v' : 'h';
    if (b.dataset.kind !== want) {
      b.dataset.kind = want; b.textContent = '';
      const vn = { left: 'text-align-vtop', center: 'text-align-vcenter', right: 'text-align-vbottom' }[v];
      if (vert && hasUiIcon(vn)) { b.append(icon(vn, 18)); b.dataset.vert = '0'; }
      else { b.append(icon('text-align-' + v, 18)); b.dataset.vert = vert ? '1' : '0'; }   
    }
  }
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  { const b = $('#txOrient'); if (b) b.title = '切换文本取向（当前：' + (vert ? '直排' : '横排') + '）'; }
  if (on) {
    set('#txSize', Math.round(inf.fontSize * textPtFactor(t) * 100) / 100);
    const hex = '#' + inf.color.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    set('#txColor', hex);
    set('#txAA', effTextDesc(t, 'antiAlias') || 'antiAliasSharp');
    $('#txBold').classList.toggle('on', !!inf.bold);
    $('#txItalic').classList.toggle('on', !!inf.italic);
    $('#txFontName').textContent = fontDisplayName(selFontPs(t)) || '（未知字体）';
    $("#txWhy").textContent = textDynamicOf(t) ? '动态文本：字号随文字框自动调整' : '';
  } else {
    set('#txSize', textToolOpts.sizePt); set('#txColor', textToolOpts.color); set('#txAA', textToolOpts.aa);
    
    $('#txFontName').textContent = textToolFont ? fontDisplayName(textToolFont.psName) : (sysFontByPs(TEXT_TOOL_DEFAULT_FONT.psName) || TEXT_TOOL_DEFAULT_FONT).family;
    $('#txWhy').textContent = '';
  }
  if (CPP) CPP.refresh(); if (TXP) TXP.refresh();              
}
