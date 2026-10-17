




import './12-fx-workspaces.js';   
import { addAlphaChannel } from '../../../core/psd-channels.js';
import { formDialog } from '../dialog.js';
import { isShapeLayer } from '../property-panel.js';
import { shell } from '../shell.js';
import { tools } from '../tools.js';
import {
  $, BLEND, EDIT, SELECT, SELM, createSelection, ensureLazy, getVectorMaskPath, isEmptySelection, runLazy,
} from './01-boot.js';
import {
  brushHistory, doc, docH, docW, layerRenames, layerTree, li, origBuffer, selection, set_selPathCache,
  set_selection,
} from './02-doc-state.js';
import { histLog, pushDocHistory, syncHistoryPanel, updateUndoButtons } from './03-history.js';
import { cropRGBA, opaqueBBox, renderLayerAlone } from './05-layer-lock-guides.js';
import { layerSelBBox } from './06-view-zoom-move.js';
import { fontDisplayName, textInfoOf } from './09-text-tool.js';
import { layerPixelJob } from './14-edit-misc.js';
import { duplicateLayerUI } from './20-snap-smart-object.js';
import { layerOrderView, renderLayerPanel, selLayer, smartFilterInfo } from './23-layers-panel.js';
import { humanEditError, renderProps } from './24-layer-ops-queue.js';
import { transformChanged } from './28-layer-props-transform.js';
import { hexOf } from './31-selection-brush.js';
import { combineInto, sampleRGBA, selectAll, setSelection, syncAnts } from './32-cursors-select-options.js';
import { osOpts, osSegment } from './33-lasso-quick-select.js';
import {
  clampSliceRect, makeSlice, set_sliceSel, set_slicesDirty, sliceModel, sliceWriteWhy, userSlices,
} from './34-perspective-crop-slice.js';
import { docArtboards, duplicateArtboardUI } from './35-artboard.js';
import { fileLayerIndex } from './44-vector-path.js';
import { drawGizmo, origStyleEnabled, pushFilterEdits, soFilterEdits } from './46-smart-filter-panel.js';
import { layerFontPs } from './49-fonts-text-model.js';
import {
  copyPixelsUI, cutPixelsUI, pasteClipboardUI, pixelClipboard, set_pixelClipboard,
} from './50-clipboard-merge-mask.js';
import {
  alphaWriteWhy, applyAlphaEdit, docAlphaChannels, docAlphaGray, selectionGrayFull,
} from './52-alpha-text-menu.js';






export let qmask = null;





export const qmaskOpts = { inverted: false, color: [255, 0, 0], opacity: 50 };
try {
  const v = JSON.parse(localStorage.getItem('psd_editor.qmaskOpts') || 'null');
  if (v) {
    if (typeof v.inverted === 'boolean') qmaskOpts.inverted = v.inverted;
    if (Array.isArray(v.color) && v.color.length === 3 && v.color.every(n => Number.isFinite(n))) qmaskOpts.color = v.color.map(n => Math.max(0, Math.min(255, Math.round(n))));
    if (Number.isFinite(v.opacity)) qmaskOpts.opacity = Math.max(0, Math.min(100, Math.round(v.opacity)));
  }
} catch {}
function saveQmaskOpts(){ try { localStorage.setItem('psd_editor.qmaskOpts', JSON.stringify(qmaskOpts)); } catch {} }
export function qmaskRefresh(){
  if (!qmask) return;
  if (!qmask.cv) { qmask.cv = document.createElement('canvas'); qmask.cv.width = docW; qmask.cv.height = docH; qmask.img = qmask.cv.getContext('2d').createImageData(docW, docH); }
  const d = qmask.img.data, g = qmask.gray;
  const [cr, cg, cb] = qmaskOpts.color, k = qmaskOpts.opacity / 100;
  for (let i = 0, o = 0; i < g.length; i++, o += 4) { d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = Math.round((255 - g[i]) * k); }
  qmask.cv.getContext('2d').putImageData(qmask.img, 0, 0);
}

export function setQmaskInverted(on){
  on = !!on;
  if (on === qmaskOpts.inverted) return;
  qmaskOpts.inverted = on; saveQmaskOpts();
  if (qmask) { const g = qmask.gray; for (let i = 0; i < g.length; i++) g[i] = 255 - g[i]; qmaskRefresh(); drawGizmo(); }
  try { tools.setQuickMask(!!qmask, on); } catch {}
  shell.status('快速蒙版色彩指示：' + (on ? '所选区域' : '被蒙版区域'));
}
let qmaskDlg = null;
export function openQuickMaskOptions(){
  if (!qmaskDlg) {
    qmaskDlg = document.createElement('dialog');
    qmaskDlg.className = 'qm-opts';
    document.body.appendChild(qmaskDlg);
  }
  const d = qmaskDlg, before = { ...qmaskOpts, color: qmaskOpts.color.slice() };
  const hex = hexOf(qmaskOpts.color);
  d.innerHTML = `<h3>快速蒙版选项</h3>
    <fieldset style="border:1px solid var(--ps-line-2);padding:6px 10px;margin:0 0 10px"><legend>色彩指示：</legend>
      <label class="row"><input type="radio" name="qmInd" value="masked"${qmaskOpts.inverted ? '' : ' checked'}> 被蒙版区域(M)</label>
      <label class="row"><input type="radio" name="qmInd" value="selected"${qmaskOpts.inverted ? ' checked' : ''}> 所选区域(S)</label></fieldset>
    <fieldset style="border:1px solid var(--ps-line-2);padding:6px 10px;margin:0"><legend>颜色</legend>
      <div class="row"><input type="color" class="qm-color" value="${hex}" style="width:40px;height:24px;padding:0" title="覆盖颜色">
      不透明度(O): <input type="number" class="qm-op" min="0" max="100" step="1" value="${qmaskOpts.opacity}" style="width:56px"> %</div></fieldset>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" class="qm-cancel">取消</button><button type="button" class="qm-ok primary">确定</button></div>`;
  
  const live = () => {
    const c = d.querySelector('.qm-color').value;
    qmaskOpts.color = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const op = +d.querySelector('.qm-op').value; if (Number.isFinite(op)) qmaskOpts.opacity = Math.max(0, Math.min(100, Math.round(op)));
    if (qmask) { qmaskRefresh(); drawGizmo(); }
  };
  d.querySelector('.qm-color').addEventListener('input', live);
  d.querySelector('.qm-op').addEventListener('input', live);
  const close = ok => {
    if (!ok) { Object.assign(qmaskOpts, before); if (qmask) { qmaskRefresh(); drawGizmo(); } }
    else {
      live();
      const inv = d.querySelector('input[name="qmInd"]:checked').value === 'selected';
      qmaskOpts.inverted = before.inverted;       
      setQmaskInverted(inv);
      saveQmaskOpts();
    }
    d.close();
  };
  d.querySelector('.qm-ok').onclick = () => close(true);
  d.querySelector('.qm-cancel').onclick = () => close(false);
  d.oncancel = e => { e.preventDefault(); close(false); };
  d.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); close(true); } };
  try { d.showModal(); } catch { d.setAttribute('open', ''); }
}
export function toggleQuickMask(){
  if (!doc || li) return;
  if (!qmask) {
    if (selection && !SELM) return;
    const gray = selection ? Uint8Array.from(selectionGrayFull(selection)) : new Uint8Array(docW * docH).fill(255);
    if (qmaskOpts.inverted) for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];   
    qmask = { gray, cv: null, img: null, histFrom: histLog.items.length };
    set_selection(null); set_selPathCache(null); syncAnts();
    qmaskRefresh();
    try { tools.setQuickMask(true, qmaskOpts.inverted); } catch {}
    shell.status(qmaskOpts.inverted ? '快速蒙版（所选区域）：用画笔涂黑 = 加进选区、涂白 = 去掉选区；再按 Q 退出'
                                    : '快速蒙版：用画笔涂黑 = 去掉选区、涂白 = 加进选区；再按 Q 退出');
  } else {
    if (qmaskOpts.inverted) { const q = qmask.gray; for (let i = 0; i < q.length; i++) q[i] = 255 - q[i]; }   
    const g = qmask.gray; let any = false, all = true;
    for (let i = 0; i < g.length; i++) { if (g[i]) any = true; if (g[i] !== 255) all = false; }
    
    brushHistory.undo = brushHistory.undo.filter(e => e.kind !== 'qmask');
    brushHistory.redo = brushHistory.redo.filter(e => e.kind !== 'qmask');
    const before = histLog.items.length;
    histLog.items = histLog.items.filter((it, k) => !(k >= qmask.histFrom && it.label === '快速蒙版'));
    histLog.cursor = Math.max(0, Math.min(histLog.items.length - 1, histLog.cursor - (before - histLog.items.length)));
    const gray = g;
    qmask = null;
    try { tools.setQuickMask(false, qmaskOpts.inverted); } catch {}
    if (all) { runLazy(SELECT, '快速蒙版', () => { selectAll(); }); }
    else if (any) runLazy(SELECT, '快速蒙版', () => { const sel = createSelection(docW, docH, 0, 0, docW, docH, gray); setSelection(sel, { label: '快速蒙版' }); });
    else setSelection(null);
    updateUndoButtons(); syncHistoryPanel();
  }
  drawGizmo();
}






const CHAN_BLEND = {
  norm: (b, s) => s, 'mul ': (b, s) => b * s, scrn: (b, s) => b + s - b * s,
  over: (b, s) => b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s), sLit: (b, s) => s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b),
  hLit: (b, s) => s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s), dark: Math.min, lite: Math.max,
  diff: (b, s) => Math.abs(b - s), smud: (b, s) => b + s - 2 * b * s, lddg: (b, s) => Math.min(1, b + s), fsub: (b, s) => Math.max(0, b - s),
  idiv: (b, s) => s <= 0 ? 0 : b >= 1 ? 1 : 1 - Math.min(1, (1 - b) / s), 'div ': (b, s) => s >= 1 ? 1 : b <= 0 ? 0 : Math.min(1, b / (1 - s)),
  lbrn: (b, s) => Math.max(0, b + s - 1),
};
const CHAN_BLEND_OPTS = [['norm', '正常'], ['mul ', '正片叠底'], ['scrn', '滤色'], ['over', '叠加'], ['sLit', '柔光'], ['hLit', '强光'], ['dark', '变暗'], ['lite', '变亮'],
  ['idiv', '颜色加深'], ['div ', '颜色减淡'], ['lbrn', '线性加深'], ['lddg', '相加'], ['fsub', '减去'], ['diff', '差值'], ['smud', '排除']];
function chanLayerOpts(){
  const v = layerOrderView(), out = [['merged', '合并图层']];
  for (const i of v.visible.slice().reverse()) { const L = layerTree.flat[i]; if (!L || L.groupType === 3 || L.isGroup) continue; out.push(['L' + i, layerNameOf(i)]); }
  return out;
}
function chanOpts(withRGB){
  const o = withRGB ? [['rgb', 'RGB']] : [];
  o.push(['r', '红'], ['g', '绿'], ['b', '蓝'], ['gray', '灰色'], ['alpha', '透明']);
  docAlphaChannels().forEach(c => o.push(['a' + c.at, c.name]));
  if (selection) o.push(['sel', '选区']);
  return o;
}

function chanSourceRGBA(layerKey){ return layerKey === 'merged' ? sampleRGBA(true) : renderLayerAlone(+layerKey.slice(1)); }
function chanPlane(layerKey, ch, invert){
  const n = docW * docH, out = new Float32Array(n);
  if (ch === 'sel') { const g = selectionGrayFull(selection); for (let i = 0; i < n; i++) out[i] = g[i] / 255; }
  else if (ch[0] === 'a' && ch !== 'alpha') { const g = docAlphaGray(+ch.slice(1)); if (!g) throw new Error('读不出这条 Alpha 通道'); for (let i = 0; i < n; i++) out[i] = g[i] / 255; }
  else {
    const px = chanSourceRGBA(layerKey); if (!px) throw new Error('这个图层渲染不出来');
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      out[i] = ch === 'r' ? px[o] / 255 : ch === 'g' ? px[o + 1] / 255 : ch === 'b' ? px[o + 2] / 255 : ch === 'alpha' ? px[o + 3] / 255
        : (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255 * (layerKey === 'merged' ? 1 : px[o + 3] / 255);
    }
  }
  if (invert) for (let i = 0; i < n; i++) out[i] = 1 - out[i];
  return out;
}
export async function applyImageDialog(){
  if (!doc || li || selLayer < 0) return false;
  const v = await formDialog('应用图像', [
    { key: 'src', label: '源 图层', type: 'select', value: 'merged', options: chanLayerOpts() },
    { key: 'ch', label: '源 通道', type: 'select', value: 'rgb', options: chanOpts(true) },
    { key: 'inv', label: '反相', type: 'check', value: false },
    { key: 'mode', label: '混合', type: 'select', value: 'mul ', options: CHAN_BLEND_OPTS },
    { key: 'opacity', label: '不透明度', type: 'number', value: 100, min: 0, max: 100, unit: '%' },
    { key: 'preserve', label: '保留透明区域', type: 'check', value: false },
    { key: 'mask', label: '蒙版', type: 'select', value: 'none', options: [['none', '（无）'], ...chanOpts(false).map(([k, l]) => [k, '合并图层 · ' + l])] },
    { key: 'maskInv', label: '蒙版反相', type: 'check', value: false, showIf: o => o.mask !== 'none' },
  ]);
  if (!v) return false;
  let rgb = null, plane = null, mask = null;
  try {
    if (v.ch === 'rgb') { rgb = chanSourceRGBA(v.src); if (!rgb) throw new Error('这个图层渲染不出来'); }
    else plane = chanPlane(v.src, v.ch, false);
    if (v.mask !== 'none') mask = chanPlane('merged', v.mask, v.maskInv);
  } catch (e) { $('#err').textContent = '应用图像：' + (e.message || e); return false; }
  const f = CHAN_BLEND[v.mode] || CHAN_BLEND.norm, op = v.opacity / 100;
  return layerPixelJob('应用图像', ({ base, w, h, docXY, cov }) => {
    const out = new Uint8ClampedArray(base);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [dx, dy] = docXY(x, y); if (dx < 0 || dy < 0 || dx >= docW || dy >= docH) continue;
      const di = dy * docW + dx, o = (y * w + x) * 4;
      let a = op * (mask ? mask[di] : 1) * (cov ? cov(x, y) : 1); if (a <= 0) continue;
      for (let c = 0; c < 3; c++) {
        let sv = rgb ? rgb[di * 4 + c] / 255 : plane[di];
        if (v.inv) sv = 1 - sv;
        const bv = base[o + c] / 255, r = f(bv, sv);
        out[o + c] = Math.round((bv + (r - bv) * a) * 255);
      }
      if (!v.preserve && !base[o + 3]) out[o + 3] = Math.round(a * 255);
    }
    return out;
  });
}
export async function calculationsDialog(){
  if (!doc || li) return false;
  const lo = chanLayerOpts(), co = chanOpts(false);
  const v = await formDialog('计算', [
    { key: 's1', label: '源 1 图层', type: 'select', value: 'merged', options: lo },
    { key: 'c1', label: '源 1 通道', type: 'select', value: 'gray', options: co },
    { key: 'i1', label: '源 1 反相', type: 'check', value: false },
    { key: 's2', label: '源 2 图层', type: 'select', value: 'merged', options: lo },
    { key: 'c2', label: '源 2 通道', type: 'select', value: 'gray', options: co },
    { key: 'i2', label: '源 2 反相', type: 'check', value: false },
    { key: 'mode', label: '混合', type: 'select', value: 'mul ', options: CHAN_BLEND_OPTS },
    { key: 'opacity', label: '不透明度', type: 'number', value: 100, min: 0, max: 100, unit: '%' },
    { key: 'out', label: '结果', type: 'select', value: 'selection', options: [['selection', '选区'], ['channel', '新建通道']] },
    { key: 'name', label: '通道名称', type: 'text', value: `Alpha ${docAlphaChannels().length + 1}`, showIf: o => o.out === 'channel' },
  ]);
  if (!v) return false;
  let A, B;
  try { A = chanPlane(v.s1, v.c1, v.i1); B = chanPlane(v.s2, v.c2, v.i2); }
  catch (e) { $('#err').textContent = '计算：' + (e.message || e); return false; }
  const f = CHAN_BLEND[v.mode] || CHAN_BLEND.norm, op = v.opacity / 100, n = docW * docH, g = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const b = B[i], r = f(b, A[i]); g[i] = Math.round(Math.max(0, Math.min(1, b + (r - b) * op)) * 255); }   
  if (v.out === 'channel') {
    const why = alphaWriteWhy(); if (why) { $('#notice').textContent = why; return false; }
    const nm = (v.name || '').trim() || `Alpha ${docAlphaChannels().length + 1}`;
    const ok = await applyAlphaEdit(`计算 → 「${nm}」`, buf => addAlphaChannel(buf, { name: nm, gray: g }));
    if (ok) shell.status(`计算结果存成新通道「${nm}」`);
    return ok;
  }
  const sel = createSelection(docW, docH, 0, 0, docW, docH, g);
  combineInto(sel, 'replace');
  shell.status('计算结果已载入为选区');
  return true;
}



export async function layerViaSelection(cut){
  if (!selection) { if (cut) { $('#notice').textContent = '通过剪切的图层：先做一个选区。'; return false; }
    const ab = !li && docArtboards().find(q => q.index === selLayer); if (ab) return duplicateArtboardUI(ab);   
    return duplicateLayerUI(selLayer) >= 0; }
  const keep = pixelClipboard;
  try {
    const ok = cut ? cutPixelsUI() : copyPixelsUI(false);
    if (ok === false || !pixelClipboard || pixelClipboard === keep) return false;
    await pasteClipboardUI('inPlace');
    return true;
  } finally { set_pixelClipboard(keep); }
}

export function layerVisiblePixels(idx){
  const full = renderLayerAlone(idx); if (!full) return null;
  const b = opaqueBBox(full, docW, docH); if (!b) return null;
  return { rgba: cropRGBA(full, docW, b), b, w: b.right - b.left, h: b.bottom - b.top };
}
export function layerNameOf(idx){ return layerRenames[idx] || (layerTree && layerTree.flat && layerTree.flat[idx] && layerTree.flat[idx].name) || ('图层 ' + idx); }
export function downloadDataURL(url, name){ const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); }
export function pixelsToCanvas(px, scale = 1){
  const c = document.createElement('canvas'); c.width = px.w; c.height = px.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.rgba), px.w, px.h), 0, 0);
  if (scale === 1) return c;
  const d = document.createElement('canvas'); d.width = Math.max(1, Math.round(px.w * scale)); d.height = Math.max(1, Math.round(px.h * scale));
  const g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, d.width, d.height); return d;
}
export async function exportLayerUI(quick){
  const idx = selLayer, px = layerVisiblePixels(idx);
  if (!px) { $('#notice').textContent = '这个图层没有可见像素，导出不了。'; return false; }
  let fmt = 'png', scale = 1, q = 0.92;
  if (!quick) {
    const v = await formDialog('导出为（' + layerNameOf(idx) + '）', [
      { key: 'fmt', label: '格式', type: 'select', value: 'png', options: [['png', 'PNG'], ['jpeg', 'JPG'], ['webp', 'WebP']] },
      { key: 'scale', label: '缩放', type: 'number', value: 100, min: 1, max: 800, unit: '%' },
      { key: 'q', label: '品质', type: 'number', value: 92, min: 1, max: 100, unit: '%', showIf: o => o.fmt !== 'png' },
      { type: 'note', label: `图层可见范围 ${px.w} × ${px.h} 像素（按内容裁切，含图层样式）` },
    ], { okText: '导出' });
    if (!v) return false;
    fmt = v.fmt; scale = v.scale / 100; q = v.q / 100;
  }
  let c = pixelsToCanvas(px, scale);
  if (fmt === 'jpeg') { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; const g = d.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, d.width, d.height); g.drawImage(c, 0, 0); c = d; }
  downloadDataURL(c.toDataURL('image/' + fmt, q), layerNameOf(idx).replace(/[\\/:*?"<>|]/g, '_') + '.' + (fmt === 'jpeg' ? 'jpg' : fmt));
  shell.status(`已导出「${layerNameOf(idx)}」`);
  return true;
}
export async function copyToClipboard(text, what){
  try { await navigator.clipboard.writeText(text); shell.status(`已复制 ${what} 到剪贴板`); $('#notice').textContent = `已复制 ${what}（${text.length} 字符）。`; }
  catch { await formDialog('复制 ' + what, [{ key: 't', label: '', type: 'textarea', value: text, rows: 12 }], { okOnly: true, okText: '关闭', msg: '浏览器不让直接写剪贴板，请手动复制：' }); }
}
function avgOpaqueColor(px){
  let r = 0, g = 0, b = 0, n = 0;
  for (let o = 0; o < px.rgba.length; o += 4) if (px.rgba[o + 3] > 200) { r += px.rgba[o]; g += px.rgba[o + 1]; b += px.rgba[o + 2]; n++; }
  return n ? [r / n, g / n, b / n].map(Math.round) : null;
}
export function layerCssText(idx){
  const px = layerVisiblePixels(idx); if (!px) return null;
  const L = layerTree.flat[idx] || {}, dl = doc.layers[idx] || {};
  const cls = '.' + (layerNameOf(idx).replace(/[^\w一-龥-]+/g, '-').replace(/^-+|-+$/g, '') || 'layer');
  const lines = [`position: absolute;`, `left: ${px.b.left}px;`, `top: ${px.b.top}px;`, `width: ${px.w}px;`, `height: ${px.h}px;`];
  const op = (dl.opacity ?? 255) / 255; if (op < 1) lines.push(`opacity: ${Math.round(op * 100) / 100};`);
  const bm = dl.blendMode && BLEND[dl.blendMode]; if (bm && bm !== 'source-over') lines.push(`mix-blend-mode: ${bm};`);
  const ti = textInfoOf(idx);
  if (ti) {
    const c = ti.color || (L.text && L.text.color);
    lines.push(`font-family: "${fontDisplayName(layerFontPs(idx)) || layerFontPs(idx) || 'sans-serif'}";`);
    lines.push(`font-size: ${Math.round((ti.fontSize || (L.text && L.text.fontSize) || 12) * 10) / 10}px;`);
    if (Array.isArray(c)) lines.push(`color: rgb(${c.slice(0, 3).map(v => Math.round(v)).join(', ')});`);
  } else if (isShapeLayer(L) || (L.adjustment && L.adjustment.kind === 'fill')) {
    const c = avgOpaqueColor(px); if (c) lines.push(`background-color: rgb(${c.join(', ')});`);
  }
  return `${cls} {\n  ${lines.join('\n  ')}\n}`;
}
export async function layerSvgText(idx){
  const px = layerVisiblePixels(idx); if (!px) return null;
  const L = layerTree.flat[idx] || {};
  let body = '';
  if (isShapeLayer(L) && !transformChanged(idx) && origBuffer && await ensureLazy(EDIT, '复制 SVG')) {
    try {
      const vp = getVectorMaskPath(origBuffer, fileLayerIndex(idx), { units: 'pixel' });
      if (vp && vp.subpaths && vp.subpaths.length) {
        const f = v => Math.round(v * 100) / 100, pt = p => `${f(p[0])} ${f(p[1])}`;
        const d = vp.subpaths.map(sp => {
          const k = sp.knots; let s = `M${pt(k[0].anchor)}`;
          const n = sp.closed ? k.length : k.length - 1;
          for (let i = 0; i < n; i++) { const a = k[i], b = k[(i + 1) % k.length]; s += ` C${pt(a.out)} ${pt(b.in)} ${pt(b.anchor)}`; }
          return s + (sp.closed ? ' Z' : '');
        }).join(' ');
        const c = avgOpaqueColor(px);
        body = `  <path d="${d}" fill="${c ? `rgb(${c.join(',')})` : '#000'}" fill-rule="nonzero"/>`;
      }
    } catch { body = ''; }
  }
  if (!body) body = `  <image x="${px.b.left}" y="${px.b.top}" width="${px.w}" height="${px.h}" href="${pixelsToCanvas(px).toDataURL('image/png')}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${docW}" height="${docH}" viewBox="0 0 ${docW} ${docH}">\n  <title>${layerNameOf(idx).replace(/[<&]/g, '')}</title>\n${body}\n</svg>`;
}

export async function mattingUI(kind){
  let width = 1;
  if (kind === 'defringe') { const v = await formDialog('去边', [{ key: 'w', label: '宽度', type: 'number', value: 1, min: 1, max: 200, unit: '像素' }]); if (!v) return false; width = v.w; }
  if (kind === 'decontaminate') { const v = await formDialog('颜色净化', [{ key: 'amt', label: '数量', type: 'number', value: 50, min: 0, max: 100, unit: '%' }]); if (!v) return false; width = v.amt / 100; }
  const label = { removeBlack: '移去黑色杂边', removeWhite: '移去白色杂边', defringe: '去边', decontaminate: '颜色净化' }[kind];
  return layerPixelJob(label, ({ base, w, h, cov }) => {
    const out = new Uint8ClampedArray(base);
    const inSel = (x, y) => !cov || cov(x, y) > 0;
    if (kind === 'removeBlack' || kind === 'removeWhite') {
      const m = kind === 'removeWhite' ? 255 : 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, a = base[o + 3] / 255; if (a <= 0 || a >= 1 || !inSel(x, y)) continue;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round((base[o + c] - m * (1 - a)) / a);
      }
      return out;
    }
    
    const R = kind === 'defringe' ? Math.round(width) : 4, amt = kind === 'defringe' ? 1 : width;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, a = base[o + 3]; if (!a || a >= 250 || !inSel(x, y)) continue;
      let best = -1, bd = 1e9;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = (Y * w + X) * 4; if (base[k + 3] < 250) continue;
        const d = i * i + j * j; if (d < bd) { bd = d; best = k; }
      }
      if (best < 0) continue;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(base[o + c] + (base[best + c] - base[o + c]) * amt);
    }
    return out;
  });
}
export function newSliceFromLayerUI(){
  const why = sliceWriteWhy(); if (why) { $('#notice').textContent = why; return false; }
  const b = layerSelBBox(selLayer);
  if (!b || !(b.w > 0 && b.h > 0)) { $('#notice').textContent = '这个图层没有可见内容。'; return false; }
  pushDocHistory('新建基于图层的切片');
  sliceModel().slices.push(makeSlice(clampSliceRect({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })));
  set_sliceSel(userSlices().length - 1); set_slicesDirty(true); drawGizmo();
  shell.status(`新建切片 ${Math.round(b.w)}×${Math.round(b.h)}（导出时写回）`);
  return true;
}
export function toggleSmartFilterMaster(){
  const info = smartFilterInfo(selLayer); if (!info || !info.filters.length) return false;
  const k = info.soIdx;
  const prev = soFilterEdits[k] ? JSON.parse(JSON.stringify(soFilterEdits[k])) : undefined;
  const e = soFilterEdits[k] || (soFilterEdits[k] = { style: {}, filters: {} });
  const want = !info.master;
  if (want === origStyleEnabled(k)) delete e.style.enabled; else e.style.enabled = want;
  if (!Object.keys(e.style).length && !Object.keys(e.filters).length) delete soFilterEdits[k];
  pushFilterEdits(k, prev);
  renderLayerPanel(); renderProps();
  return true;
}

export function selectSubjectUI(){
  if (!SELM || !docW) return false;
  let sel;
  try {
    sel = osSegment(sampleRGBA(true), { x: 1, y: 1, width: docW - 2, height: docH - 2 },
      { tolerance: Math.min(osOpts.tolerance, 14), edgeThreshold: osOpts.edge / 100 * 0.8, fillHoles: true, bgSides: 'tlr' });
    if (sel && osOpts.hard && !isEmptySelection(sel)) sel = SELM.hardenSelection(sel);
  } catch (e) { $('#err').textContent = '选择主体没算出来：' + humanEditError(e && e.message || e); return false; }
  if (!sel || isEmptySelection(sel)) { shell.status('没找到明显的主体 —— 背景太花或主体贴边时会这样，可以用对象选择工具框一下'); return false; }
  combineInto(sel, 'replace');
  shell.status('选择主体：用的是传统的「边框当背景 + 颜色聚类」扣图（不是 AI 模型），复杂背景可能需要手工修');
  return true;
}
