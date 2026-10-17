









import './57-layer-style-text-path.js';   
import { actions } from '../actions.js';
import { alertDialog, confirmDialog, promptDialog, choiceDialog, formDialog } from '../dialog.js';
import { whenIdle } from '../lazy.js';
import { DOCS } from '../documents.js';
import { shell } from '../shell.js';
import { $, SELECT, ensureLazy, lassoSelection } from './01-boot.js';
import { doc, docH, docName, docW, layerRenames, layerTextEdits, layerTree, li, selection } from './02-doc-state.js';
import { ACTP, docHistory, pushDocHistory } from './03-history.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { layerSelBBox } from './06-view-zoom-move.js';
import { docResolution, newDocument, set_docResolution, set_docResolutionBase } from './08-doc-size.js';
import { applyTextStyle, textInfoOf } from './09-text-tool.js';
import { safeName } from './11-paint-common.js';
import { downloadDataURL, layerNameOf, pixelsToCanvas } from './13-quickmask-apply-image.js';
import { duplicateLayerUI, hasAnyEdits } from './20-snap-smart-object.js';
import { loadPsd, openImageAsDocument } from './21-load-document.js';
import { layerOrderView, renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { renderProps, setLayerLock, setSingleOp } from './24-layer-ops-queue.js';
import { ACT_EXEC, actExportBytes, installActionsPanel, waitIdle } from './25-presets-actions-wiring.js';
import { createLayerUI, newGroupUI } from './26-layer-create.js';
import { setLayerBlend, setLayerOpacity, setLayerVisible } from './27-gradient-editor.js';
import { moveLayerTo } from './28-layer-props-transform.js';
import { renderStaticLayers } from './30-render.js';
import { bgRGB, fgRGB } from './31-selection-brush.js';
import { combineInto } from './32-cursors-select-options.js';
import { drawGizmo } from './46-smart-filter-panel.js';
import { buildPsdBuffer, dispTextOf } from './48-info-export.js';
import { applyTextFont, renderTextLayer, resolveFont, textPtFactor } from './49-fonts-text-model.js';





const LAYER_IDS = new Map();      
let nextLayerId = 2;              
function alignIds(uid, names, bg) {
  const prev = LAYER_IDS.get(uid) || [];
  const pool = new Map();
  for (const p of prev) { if (!pool.has(p.name)) pool.set(p.name, []); pool.get(p.name).push(p.id); }
  const out = names.map((name, i) => {
    const q = pool.get(name);
    const id = q && q.length ? q.shift() : (i === 0 && bg && !prev.length ? 1 : nextLayerId++);
    return { name, id };
  });
  LAYER_IDS.set(uid, out);
  return out.map(x => x.id);
}
function renameId(uid, i, name) { const t = LAYER_IDS.get(uid); if (t && t[i]) t[i].name = name; }


const r1 = v => Math.round(v * 10) / 10;
function layerKindOf(i, L, dl) {
  if (L.text && L.text.content != null) return 'text';
  if (L.isSmartObject) return 'smartObject';
  const adj = L.adjustment;
  if (adj && adj.kind === 'fill') return (dl && dl.vectorMask) || L.vectorMask ? 'shape' : ({ SoCo: 'solidFill', GdFl: 'gradientFill', PtFl: 'patternFill' }[adj.key] || 'solidFill');
  if (adj && adj.kind) return adj.kind;
  if (L.vectorMask && (L.additionalKeys || []).includes('vstk')) return 'shape';
  return 'pixel';
}
function selBounds() {
  const s = selection; if (!s || !s.data) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < s.height; y++) for (let x = 0, o = y * s.width; x < s.width; x++) if (s.data[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  return x1 < 0 ? null : [s.x + x0, s.y + y0, s.x + x1 + 1, s.y + y1 + 1];
}
function docList() {
  const seen = new Set(), out = [];
  for (const v of DOCS.list()) { if (seen.has(v.uid)) continue; seen.add(v.uid); out.push({ uid: v.uid, name: v.name || docName, active: v.uid === DOCS.activeUid(), view: v.view }); }
  return out;
}
function scriptInfo() {
  const docs = docList().map(({ uid, name, active }) => ({ uid, name, active }));
  if (!doc || li || !layerTree || !layerTree.flat) return { docs, doc: null, fg: fgRGB.slice(), bg: bgRGB.slice() };
  const uid = DOCS.activeUid(), flat = layerTree.flat, n = Math.min(flat.length, doc.layers.length);
  const names = [], layers = [];
  for (let i = 0; i < n; i++) names.push(flat[i].groupType === 3 ? '</' + layerNameOf(i) + '>' : layerNameOf(i));
  const bg = n > 0 && isBackgroundLayer(0);
  const ids = alignIds(uid, names, bg);
  const stack = [];
  for (let i = n - 1; i >= 0; i--) {
    const L = flat[i], dl = doc.layers[i] || {};
    const head = L.isGroup && L.groupType !== 3, end = L.groupType === 3;
    if (end) { stack.pop(); layers[i] = { i, id: ids[i], name: names[i], group: 'end', parent: stack.length ? stack[stack.length - 1] : null, kind: 'group', visible: true, opacity: 100, fillOpacity: 100, blend: 'norm', bounds: [0, 0, 0, 0] }; continue; }
    const b = !head && layerSelBBox(i);
    const lk = L.locks || {};
    const o = {
      i, id: ids[i], name: names[i], group: head ? 'head' : null, parent: stack.length ? stack[stack.length - 1] : null,
      kind: head ? 'group' : layerKindOf(i, L, dl), visible: !dl.hidden, opacity: r1((dl.opacity != null ? dl.opacity : 255) / 2.55),
      fillOpacity: r1((dl.fillOpacity != null ? dl.fillOpacity : L.fillOpacity != null ? L.fillOpacity : 255) / 2.55),
      blend: head ? (dl.blendMode || L.groupBlendKey || 'pass') : (dl.blendMode || L.blendKey || 'norm'),
      bounds: b ? [Math.round(b.x), Math.round(b.y), Math.round(b.x + b.w), Math.round(b.y + b.h)] : [0, 0, 0, 0],
      clip: !!dl.clipping, isBackground: i === 0 && bg, mask: !!(L.mask || dl.mask), vectorMask: !!(L.vectorMask || dl.vectorMask),
      locked: !!lk.all, lockPixels: !!lk.composite, lockPosition: !!lk.position, lockTransparency: !!lk.transparency,
    };
    if (o.kind === 'text') {
      const ti = textInfoOf(i) || L.text, k = textPtFactor(i), T = (ti.transform || [1, 0, 0, 1, 0, 0]);
      const c = ti.color || [0, 0, 0, 1];
      o.text = { contents: dispTextOf(i, L), size: r1((ti.fontSize || 12) * k), font: ti.font || '', color: c.slice(0, 3).map(v => Math.round((v <= 1 ? v * 255 : v))),
        position: [Math.round(T[4]), Math.round(T[5])], justification: ti.align || 'left', box: ti.box && ti.shape === 'box' ? ti.box : null, tracking: ti.tracking || 0,
        leading: ti.autoLeading === false && ti.leading ? r1(ti.leading * k) : 0, fauxBold: !!ti.bold, fauxItalic: !!ti.italic, vertical: ti.orientation === 1 };
    }
    layers[i] = o;
    if (head) stack.push(i);
  }
  
  for (let i = n - 1; i >= 0; i--) { const o = layers[i]; if (o.group !== 'head') continue;
    let b = null; for (const c of layers) if (c && c.parent === i && c.group !== 'end' && (c.bounds[2] > c.bounds[0])) b = b ? [Math.min(b[0], c.bounds[0]), Math.min(b[1], c.bounds[1]), Math.max(b[2], c.bounds[2]), Math.max(b[3], c.bounds[3])] : c.bounds.slice();
    if (b) o.bounds = b; }
  const docs2 = docs.findIndex(d => d.uid === uid);
  return { docs, fg: fgRGB.slice(), bg: bgRGB.slice(), doc: {
    uid, id: uid, index: docs2, name: docName || '未标题', width: docW, height: docH, resolution: docResolution || 72, mode: doc.mode != null ? doc.mode : 3, depth: doc.depth || 8,
    dirty: hasAnyEdits(), hasBackground: bg, selection: selBounds(), active: selLayer, selected: selLayers.size ? [...selLayers] : selLayer >= 0 ? [selLayer] : [],
    layers, historyCount: docHistory.undo.length + 1 } };
}


const PICKED = new Map();          
let pickSeq = 1;
const TEXT_EXT = /\.(txt|csv|tsv|json|jsx|jsxinc|js|psjs|xml|html?|md|svg|ini|cfg|log|yaml|yml)$/i;
async function remember(file) {
  const id = pickSeq++;
  let text = null;
  if (TEXT_EXT.test(file.name) && file.size < 32 * 1048576) { try { text = await file.text(); } catch { text = null; } }
  PICKED.set(id, { file, name: file.name, text, path: file.webkitRelativePath || file.name });
  return { id, name: file.name, size: file.size };
}

function pickFilesUI(o = {}) {
  return new Promise(res => {
    const back = document.createElement('div');
    back.className = 'dlg-back'; back.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:99999;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--ps-panel,#323232);color:var(--ps-text,#ddd);border:1px solid var(--ps-line,#555);border-radius:6px;padding:16px 18px;min-width:320px;font:13px system-ui';
    const t = document.createElement('div'); t.textContent = o.title || (o.folder ? '脚本要你选一个文件夹' : '脚本要你选文件'); t.style.marginBottom = '12px';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const pick = document.createElement('button'); pick.textContent = o.folder ? '选择文件夹…' : '选择文件…';
    const cancel = document.createElement('button'); cancel.textContent = '取消';
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = !!o.multi || !!o.folder; if (o.folder) inp.webkitdirectory = true;
    const acc = String(o.filter || '').match(/\*\.\w+/g); if (acc && !o.folder) inp.accept = acc.map(x => x.slice(1)).join(',');
    const done = async files => { back.remove(); const list = []; for (const f of files || []) list.push(await remember(f));
      const folder = o.folder && files && files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : undefined; res({ files: list, folder }); };
    pick.onclick = () => inp.click();
    inp.onchange = () => done([...inp.files]);
    cancel.onclick = () => done([]);
    row.append(cancel, pick); box.append(t, row); back.append(box); document.body.append(back);
    pick.focus();
  });
}
function download(bytes, name, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  downloadDataURL(url, name); setTimeout(() => URL.revokeObjectURL(url), 10000);
}



async function ui(fn) {
  const err = $('#err'); if (err) err.textContent = '';
  const r = await fn();
  await waitIdle();
  if (err && err.textContent) throw new Error(err.textContent);
  return r;
}
async function actp() { await installActionsPanel(); if (!ACTP) throw new Error('动作模块没有载入'); return ACTP; }
function need(i) { if (!doc || li) throw new Error('没有可编辑的文档'); if (!(i >= 0 && i < doc.layers.length)) throw new Error('图层下标越界：' + i); }
function select(i) { need(i); if (selLayer !== i || selLayers.size > 1) { set_selLayer(i); selLayers.clear(); renderLayerPanel(); renderProps(); drawGizmo(); } }
const SAVE_MIME = { psd: 'image/vnd.adobe.photoshop', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tga: 'image/x-tga', pdf: 'application/pdf', webp: 'image/webp' };

const DO = {
  async setLayer(a) {
    need(a.i); const i = a.i, L = layerTree.flat[i];
    if (a.name != null || a.visible != null || a.opacity != null || a.fillOpacity != null || a.blend != null) pushDocHistory('脚本：图层属性');
    if (a.name != null) { layerRenames[i] = String(a.name); renameId(DOCS.activeUid(), i, String(a.name)); }
    if (a.visible != null) setLayerVisible(i, !!a.visible);
    if (a.opacity != null) setLayerOpacity(i, Math.round(Math.max(0, Math.min(100, +a.opacity)) * 2.55));
    if (a.blend != null) setLayerBlend(i, a.blend);
    if (a.fillOpacity != null) { const orig = L.fillOpacity != null ? L.fillOpacity : 255, v = Math.round(Math.max(0, Math.min(100, +a.fillOpacity)) * 2.55); setSingleOp(i, { op: 'setFillOpacity', index: i, fillOpacity: v }, v === orig); }
    if (a.locked != null) setLayerLock(i, 'all', !!a.locked);
    if (a.lockPixels != null) setLayerLock(i, 'composite', !!a.lockPixels);
    if (a.lockPosition != null) setLayerLock(i, 'position', !!a.lockPosition);
    if (a.lockTransparency != null) setLayerLock(i, 'transparency', !!a.lockTransparency);
    if (a.clip != null) { select(i); if (!!doc.layers[i].clipping !== !!a.clip) await (await actp()).runCommand('layer.clippingMask', []); }
    if (a.background === false && isBackgroundLayer(i)) { select(i); await (await actp()).runCommand('layer.backgroundFromLayer', []); }
    if (a.text) {
      if (!L.text) throw new Error('这不是文字图层');
      const t = a.text;
      if (t.contents != null) {
        pushDocHistory('脚本：文字');
        const s = String(t.contents).replace(/\r\n?/g, '\r');
        if (s !== L.text.content) layerTextEdits[i] = s; else delete layerTextEdits[i];
        if (layerTextEdits[i] != null) await renderTextLayer(i, L, { silent: true });   
      }
      const patch = {};
      if (t.size != null) patch.fontSize = +t.size / textPtFactor(i);
      if (t.color) patch.color = [t.color[0] / 255, t.color[1] / 255, t.color[2] / 255, 1];
      if (t.justification) patch.align = String(t.justification).replace(/justified$/, '');
      if (t.tracking != null) patch.tracking = Math.round(+t.tracking);
      if (t.leading != null) patch.leading = +t.leading / textPtFactor(i);
      if (t.fauxBold != null) patch.bold = !!t.fauxBold;
      if (t.fauxItalic != null) patch.italic = !!t.fauxItalic;
      if (Object.keys(patch).length) await applyTextStyle(i, patch);
      if (t.font) {
        const f = await resolveFont(String(t.font));
        if (!f || !f.ok) throw new Error(`找不到字体「${t.font}」（本机没装、也没上传到字体库）`);
        await applyTextFont(i, { psName: String(t.font), css: f.css, family: f.family || String(t.font) });
      }
    }
    renderStaticLayers(); renderLayerPanel(); renderProps();
    return {};
  },
  selectLayer(a) { select(a.i); return {}; },
  async translate(a) { select(a.i); await ui(() => ACT_EXEC.move({ dx: +a.dx || 0, dy: +a.dy || 0 })); return {}; },
  async transform(a) { select(a.i); await ui(() => ACT_EXEC.transform({ dx: 0, dy: 0, sx: a.sx != null ? +a.sx : 100, sy: a.sy != null ? +a.sy : 100, angle: +a.angle || 0 })); return {}; },
  async deleteLayer(a) { select(a.i); await ui(async () => (await actp()).runCommand('layer.delete', [])); return {}; },
  async duplicateLayer(a) { select(a.i); await ui(() => duplicateLayerUI(a.i)); return { index: selLayer }; },
  async newLayer(a) {
    if (a.inside != null) select(a.inside);
    await ui(() => createLayerUI({ name: a.name, opacity: a.opacity, mode: a.blend }));
    const at = selLayer;
    if (a.inside != null) { const head = findHeadAbove(at); if (head >= 0 && layerTree.flat[at] && !isInside(at, head)) { pushDocHistory('移动图层'); moveLayerTo(at, head, false, true); await waitIdle(); } }
    return { index: selLayer };
  },
  async newGroup(a) {
    if (a.inside != null) select(a.inside);
    await ui(() => newGroupUI());
    if (a.name) { layerRenames[selLayer] = String(a.name); renderLayerPanel(); }
    return { index: selLayer };
  },
  async moveLayer(a) {
    need(a.i);
    const v = layerOrderView(), top = v.visible[0], bottom = v.visible[v.visible.length - 1];
    const p = a.placement || 'PLACEBEFORE';
    let ok;
    pushDocHistory('移动图层');
    if (a.to < 0) ok = p === 'PLACEATEND' ? moveLayerTo(a.i, bottom, true) : moveLayerTo(a.i, top, false);
    else if (p === 'INSIDE' || p === 'PLACEATBEGINNING') ok = moveLayerTo(a.i, a.to, false, true);
    else if (p === 'PLACEATEND') { const kids = layerTree.flat.map((_, k) => k).filter(k => isInside(k, a.to) && layerTree.flat[k].groupType !== 3); ok = kids.length ? moveLayerTo(a.i, Math.min(...kids), true) : moveLayerTo(a.i, a.to, false, true); }
    else ok = moveLayerTo(a.i, a.to, p === 'PLACEAFTER');
    if (ok === false) throw new Error('这样移不了（目标在被移动的组里面，或位置无效）');
    await waitIdle();
    return {};
  },
  async exec(a) {
    const r = a.desc && a.desc.null && a.desc.null.__reference && a.desc.null.__reference[0];
    if (a.event === 'slct' && r && r.type === '__idx') { select(r.index); return {}; }
    if (a.event === 'slct' && r && r.cls && r.cls.cid === 'Dcmn') {
      const docs = docList(), d = r.type === 'indx' ? docs[r.index - 1] : r.type === 'name' ? docs.find(x => x.name === r.name) : r.type === 'Idnt' ? docs.find(x => x.uid === r.id) : null;
      if (!d) throw new Error('找不到要切换到的文档'); await DOCS.activate(d.view); return {};
    }
    await ui(async () => (await actp()).exec({ event: a.event, desc: a.desc }, !!a.dialog));
    return {};
  },
  async command(a) {
    if (a.psMenu) throw new Error('performMenuCommand（按 PS 菜单编号执行）本编辑器不支持');
    if (!actions.has(a.id)) throw new Error('没有这条命令：' + a.id);
    await ui(async () => (await actp()).runCommand(a.id, []));
    return {};
  },
  async filter(a) { if (selLayer < 0) throw new Error('没有选中图层'); await ui(() => ACT_EXEC.filter({ kind: a.kind, params: a.params || {} }, false)); return {}; },
  async adjust(a) { if (selLayer < 0) throw new Error('没有选中图层'); await ui(() => ACT_EXEC.adjust({ type: a.type, model: a.model || {} }, false)); return {}; },
  async fill(a) { await ui(() => ACT_EXEC.fill({ using: a.using, color: a.color, mode: a.mode, opacity: a.opacity, preserve: a.preserve })); return {}; },
  color(a) { ACT_EXEC.color({ which: a.which, rgb: a.rgb }); return {}; },
  async selectPolygon(a) {
    await ensureLazy(SELECT, '选区');
    const sel = lassoSelection(docW, docH, (a.points || []).map(p => ({ x: p[0], y: p[1] })), { feather: a.feather || 0, antialias: a.antiAlias !== false });
    combineInto(sel, a.mode || 'replace');
    return {};
  },
  imageSize(a) { if (a.resolution) { set_docResolution(+a.resolution); set_docResolutionBase(+a.resolution); } return {}; },
  async alert(a) { await alertDialog(a.message, { title: a.title || '脚本警告' }); return {}; },
  async confirm(a) { return { value: !!await confirmDialog(a.message, { title: a.title || '脚本' }) }; },
  async prompt(a) { const v = await promptDialog(a.message, a.value || '', { title: a.title || '脚本' }); return { value: v == null ? null : v }; },
  async promptName(a) { const v = await promptDialog('文件名', a.value || '', { title: a.title || '存储为' }); return { value: v || null }; },
  async sleep(a) { await new Promise(r => setTimeout(r, Math.max(0, Math.min(5000, +a.ms || 0)))); return {}; },
  async pickFiles(a) { return pickFilesUI(a); },
  readText(a) { const f = PICKED.get(a.id); if (!f) throw new Error('文件不存在'); if (f.text == null) throw new Error(`「${f.name}」不是文本文件（或超过 32 MB），脚本读不了它的内容；要打开图片 / 文档请用 app.open`); return { text: f.text }; },
  async writeText(a) { download(new TextEncoder().encode(String(a.text)), safeName(a.name || 'output.txt'), 'text/plain;charset=utf-8'); return {}; },
  async openFile(a) {
    const f = PICKED.get(a.id); if (!f) throw new Error('文件不存在');
    const before = DOCS.activeUid();
    eventDepth++;   
    try { await ui(() => /\.(psd|psb)$/i.test(f.name) ? loadPsd(f.file) : openImageAsDocument(f.file)); } finally { eventDepth--; }
    if (DOCS.activeUid() === before) throw new Error(`打不开「${f.name}」`);
    return { uid: DOCS.activeUid() };
  },
  async newDocument(a) {
    const bgk = a.fill === 'transparent' ? 'transparent' : a.fill === 'backgroundcolor' ? 'color' : 'white';
    eventDepth++;
    const ok = await newDocument({ width: Math.max(1, Math.round(a.width)), height: Math.max(1, Math.round(a.height)), resolution: a.resolution || 72, name: a.name || '未标题-1', background: bgk,
      backgroundColor: bgk === 'color' ? bgRGB.slice() : undefined, mode: { grayscale: 'gray', gray: 'gray', cmyk: 'cmyk' }[a.mode] || 'rgb' }).finally(() => { eventDepth--; });
    if (ok === false) throw new Error(($('#err') && $('#err').textContent) || '新建文档失败');
    await waitIdle();
    return { uid: DOCS.activeUid() };
  },
  async activateDoc(a) { const d = docList().find(x => x.uid === a.uid); if (!d) throw new Error('文档已经关闭'); if (!d.active) await DOCS.activate(d.view); await waitIdle(); return {}; },
  async closeDoc(a) { const d = docList().find(x => x.uid === a.uid); if (!d) return {}; await DOCS.closeView(d.view, { discard: !!a.discard }); await waitIdle(); return {}; },
  async duplicateDoc(a) {
    const before = DOCS.activeUid(), base = (docName || '未标题').replace(/\.[^.]+$/, '');
    await ui(async () => (await actp()).runCommand('image.duplicate', [{ name: a.name || base + ' 拷贝', merged: !!a.merged }]));
    if (DOCS.activeUid() === before) throw new Error('复制文档没能完成');
    return { uid: DOCS.activeUid() };
  },
  async save(a) {
    if (!doc) throw new Error('没有文档');
    const fmt = a.format || 'psd', base = safeName(String(a.name || (docName || '未标题')).replace(/\.\w+$/, ''));
    let bytes;
    if (fmt === 'psd' || fmt === 'png' || fmt === 'jpg') bytes = await actExportBytes(fmt, a.quality || 90);
    else {
      const m = await import('../format-save.js');
      if (!m.EXTRA_FORMATS[fmt]) throw new Error(`脚本存储不支持 ${fmt} 格式（可用：psd / png / jpg / ${Object.keys(m.EXTRA_FORMATS).join(' / ')}）`);
      const built = await buildPsdBuffer();
      const cv = built.canvas || pixelsToCanvas({ rgba: built.composite.data, w: built.composite.width, h: built.composite.height });
      bytes = new Uint8Array(await (await m.encodeCanvas(fmt, cv, { quality: a.quality, title: docName })).arrayBuffer());
    }
    download(bytes, base + '.' + (fmt === 'png8' ? 'png' : fmt), SAVE_MIME[fmt]);
    return {};
  },
  async playAction(a) {
    const P = await actp(), t = P.find(a.set, a.action);
    if (!t || t.a == null) throw new Error(`动作「${a.set} › ${a.action}」不存在`);
    const r = await P.play(t, { quiet: true, strict: true, noDialogs: true, onError: () => 'stop' });
    if (!r.ok) throw new Error((r.errors && r.errors[0]) || '动作没有播放完');
    return {};
  },
  customOptions(a) { try { if (a.value == null) localStorage.removeItem('psd_editor.scriptOpts.' + a.key); else localStorage.setItem('psd_editor.scriptOpts.' + a.key, a.value); } catch {  } return {}; },
  historyGroup() { return {}; },
  changeMode(a) { const id = { GRAYSCALE: 'image.mode.grayscale', RGB: 'image.mode.rgb', CMYK: 'image.mode.cmyk', LAB: 'image.mode.lab' }[String(a.mode).replace(/^\w+\./, '')]; if (!id) throw new Error('不支持转换到 ' + a.mode); return DO.command({ id }); },
};
function findHeadAbove(i) { const f = layerTree.flat; for (let k = i + 1; k < f.length; k++) if (f[k].isGroup && f[k].groupType !== 3) return k; return -1; }
function isInside(i, head) {
  const f = layerTree.flat; let depth = 0;
  for (let k = head - 1; k >= 0; k--) { const g = f[k]; if (g.groupType === 3) { if (depth === 0) return false; depth--; } else if (g.isGroup) depth++; if (k === i) return true; }
  return false;
}

export const SCRIPT_HOST = {
  get(name, a = {}) {
    switch (name) {
      case 'info': return scriptInfo();
      case 'readText': return DO.readText(a);
      case 'fileExists': { const nm = String(a.path || '').split('/').pop(); for (const [id, f] of PICKED) if (f.name === nm || f.path === a.path) return { exists: true, id }; return { exists: false }; }
      case 'fileInfo': { const f = PICKED.get(a.id); return { size: f ? f.file.size : 0 }; }
      case 'customOptions': { let v = null; try { v = localStorage.getItem('psd_editor.scriptOpts.' + a.key); } catch { v = null; } return { value: v }; }
      default: throw new Error('宿主没有「' + name + '」');
    }
  },
  async do(name, a = {}) {
    const f = DO[name]; if (!f) throw new Error('本编辑器的脚本环境还不支持「' + name + '」');
    return await f(a);
  },
};


let running = null;




export async function runScriptSource(source, name, o = {}) {
  if (running) { shell.status('已经有一个脚本在运行'); return { ok: false }; }
  await installActionsPanel();
  const m = await import('../ps-script.js');
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99998;background:var(--ps-panel,#323232);color:var(--ps-text,#ddd);border:1px solid var(--ps-line,#555);border-radius:6px;padding:6px 10px;font:12px system-ui;display:flex;gap:10px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.4)';
  const label = document.createElement('span'); label.textContent = `正在运行脚本「${name}」…`;
  const stop = document.createElement('button'); stop.textContent = '停止'; stop.title = 'Esc';
  bar.append(label, stop);
  running = { name };
  let ctl = null;
  const onKey = e => { if (e.key === 'Escape' && ctl && !document.querySelector('dialog[open], .dlg-back')) { ctl.cancel(); e.preventDefault(); } };
  stop.onclick = () => ctl && ctl.cancel();
  const showBar = setTimeout(() => document.body.append(bar), 400);
  addEventListener('keydown', onKey, true);
  let r;
  try {
    r = await m.runPsScript(source, { fileName: name, host: SCRIPT_HOST, includes: o.includes, onStart: c => { ctl = c; }, timeoutMs: o.timeoutMs });
  } finally {
    clearTimeout(showBar); bar.remove(); removeEventListener('keydown', onKey, true); running = null;
    try { renderLayerPanel(); renderProps(); } catch {  }
  }
  if (!o.quiet) {
    const logText = r.log && r.log.trim() ? r.log.replace(/\s+$/, '') : '';
    if (!r.ok) await alertDialog(`脚本「${name}」没能运行完：\n${r.error.message}${r.error.line ? `\n（第 ${r.error.line} 行）` : ''}${logText ? '\n\n输出：\n' + logText.slice(-4000) : ''}`, { title: '脚本' });
    else if (logText) await alertDialog(logText.slice(-6000), { title: `脚本「${name}」的输出` });
    else shell.status(`脚本「${name}」已运行（${(r.ms / 1000).toFixed(1)} 秒）`);
  }
  return r;
}
const SCRIPT_ACCEPT = '.jsx,.js,.jsxinc,.psjs';
async function browseScripts() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = SCRIPT_ACCEPT; inp.multiple = true;
  const files = await new Promise(res => { inp.onchange = () => res([...inp.files]); inp.click(); });
  if (!files.length) return false;
  if (files.some(f => /\.jsxbin$/i.test(f.name))) { await alertDialog('.jsxbin 是加密编译过的 ExtendScript，只有 Photoshop 自己能运行。请用脚本的源码（.jsx）。', { title: '脚本' }); return false; }
  const texts = await Promise.all(files.map(f => f.text()));
  const includes = Object.fromEntries(files.map((f, k) => [f.name, texts[k]]));
  
  const included = new Set();
  for (const t of texts) for (const mm of t.matchAll(/^[ \t]*(?:#|\/\/@|@)include\s+["']?([^"'\r\n]+)/gm)) included.add(mm[1].split(/[\\/]/).pop().toLowerCase());
  let mains = files.filter(f => !included.has(f.name.toLowerCase()) && !/\.jsxinc$/i.test(f.name));
  if (!mains.length) mains = files;
  let main = mains[0];
  if (mains.length > 1) {
    const ch = await choiceDialog(`选了 ${mains.length} 个脚本，先运行哪个？\n（其余的按顺序接着运行）`, { title: '浏览脚本', okText: mains[0].name, extraText: '全部按顺序运行', cancelText: '取消' });
    if (ch === 'cancel') return false;
    if (ch === 'extra') { for (const f of mains) { const r = await runScriptSource(includes[f.name], f.name, { includes }); if (!r.ok) break; } return true; }
    main = mains[0];
  }
  rememberScript(main.name, includes[main.name]);
  await runScriptSource(includes[main.name], main.name, { includes });
  return true;
}


const RECENT_KEY = 'psd_editor.recentScripts', EVENTS_KEY = 'psd_editor.scriptEvents';
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
function rememberScript(name, source) {
  if (!source || source.length > 512 * 1024) return;
  const l = load(RECENT_KEY, []).filter(x => x.name !== name);
  l.unshift({ name, source, at: Date.now() });
  while (l.length > 8 || JSON.stringify(l).length > 2 * 1048576) l.pop();
  save(RECENT_KEY, l);
}
export const SCRIPT_EVENTS = [
  ['start', '启动应用程序'], ['new', '新建文档'], ['open', '打开文档'], ['save', '存储文档'], ['export', '导出文档'], ['close', '关闭文档'],
];
let eventDepth = 0;

export function fireScriptEvent(ev) {
  const cfg = load(EVENTS_KEY, null);
  if (!cfg || !cfg.enabled || eventDepth || running) return;
  const list = (cfg.items || []).filter(x => x.event === ev);
  if (!list.length) return;
  eventDepth++;
  (async () => {
    try {
      for (const it of list) {
        if (it.kind === 'action') { const P = await actp(); const t = P.find(it.set, it.action); if (t && t.a != null) await P.play(t, { quiet: true }); }
        else if (it.source) { const r = await runScriptSource(it.source, it.name, { quiet: false }); if (!r.ok) break; }
      }
    } catch (e) { shell.status('脚本事件没能运行：' + (e && e.message || e)); }
    finally { eventDepth--; }
  })();
}
async function scriptEventsUI() {
  const cfg = load(EVENTS_KEY, { enabled: false, items: [] });
  for (;;) {
    const lines = cfg.items.map((x, k) => `${k + 1}. ${(SCRIPT_EVENTS.find(e => e[0] === x.event) || [, x.event])[1]} → ${x.kind === 'action' ? `动作「${x.set} › ${x.action}」` : `脚本「${x.name}」`}`);
    const ch = await choiceDialog(`${cfg.enabled ? '☑' : '☐'} 启用要运行脚本 / 动作的事件\n\n${lines.length ? lines.join('\n') : '（还没有设置任何事件）'}`,
      { title: '脚本事件管理器', okText: '添加…', extraText: cfg.enabled ? '停用' : '启用', cancelText: '完成' });
    if (ch === 'cancel' || ch == null) break;
    if (ch === 'extra') { cfg.enabled = !cfg.enabled; save(EVENTS_KEY, cfg); continue; }
    const recent = load(RECENT_KEY, []);
    const P = await actp();
    const acts = []; for (const set of P.sets || []) for (const a of set.actions || []) acts.push([set.name, a.name]);
    const v = await formDialog('添加事件', [
      { key: 'event', label: 'Photoshop 事件', type: 'select', value: 'open', options: SCRIPT_EVENTS.map(([k, l]) => [k, l]) },
      { key: 'kind', label: '运行', type: 'select', value: 'script', options: [['script', '脚本'], ['action', '动作']] },
      { key: 'script', label: '脚本', type: 'select', value: '__pick', options: [['__pick', '选择脚本文件…'], ...recent.map(x => [x.name, x.name])], showIf: vals => vals.kind !== 'action' },
      { key: 'action', label: '动作', type: 'select', value: acts.length ? '0' : '', options: acts.length ? acts.map(([s, a], k) => [String(k), `${s} › ${a}`]) : [['', '（动作面板里还没有动作）']], showIf: vals => vals.kind === 'action' },
    ]);
    if (!v) continue;
    if (v.kind === 'action') { const a = acts[+v.action]; if (!a) { await alertDialog('还没有动作：先在动作面板里录一个或载入 .atn', { title: '脚本事件管理器' }); continue; } cfg.items.push({ event: v.event, kind: 'action', set: a[0], action: a[1] }); }
    else {
      let name, source;
      if (v.script === '__pick') {
        const r = await pickFilesUI({ title: '选择要在这个事件上运行的脚本（.jsx / .js / .psjs）', filter: '*.jsx;*.js;*.psjs' });
        const f = r.files[0] && PICKED.get(r.files[0].id); if (!f || f.text == null) continue;
        name = f.name; source = f.text; rememberScript(name, source);
      } else { const x = recent.find(q => q.name === v.script); if (!x) continue; name = x.name; source = x.source; }
      cfg.items.push({ event: v.event, kind: 'script', name, source });
    }
    if (!cfg.enabled) cfg.enabled = true;
    if (!save(EVENTS_KEY, cfg)) await alertDialog('设置没能存下来（浏览器存储已满或被禁用）', { title: '脚本事件管理器' });
  }
  if (cfg.items.length) {
    const del = await promptDialog('要删掉哪几条？输入序号（逗号分隔），留空 = 都保留', '', { title: '脚本事件管理器' });
    if (del) { const k = new Set(String(del).split(/[,，\s]+/).map(Number)); cfg.items = cfg.items.filter((_, n) => !k.has(n + 1)); save(EVENTS_KEY, cfg); }
  }
  return true;
}

actions.register('file.browseScripts', { run: () => { browseScripts(); }, enabled: () => !running });
actions.register('file.scriptEvents', { run: () => { scriptEventsUI(); }, enabled: () => !running });



export function scriptDebugAPI(){
  return { run: runScriptSource, get host(){ return SCRIPT_HOST; }, info: scriptInfo, fire: fireScriptEvent, get running(){ return !!running; } };
}
if (typeof window !== 'undefined') {
  
  whenIdle(() => fireScriptEvent('start'), 4000);
}
