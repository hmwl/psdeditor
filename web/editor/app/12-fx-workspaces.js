




import './11-paint-common.js';   
import { parsePsdRaster, compositeAll, hasUnrenderedEffects, patternToRGBA } from '../../../core/app.js';
import { styleBlendKey } from '../../../core/compose.js';
import { GALLERY_GROUPS as GALLERY_MENU_GROUPS } from '../../../core/filter-gallery-spec.js';
import { computeHomographyQuad, applyHomography, invert3x3 } from '../../../core/homography.js';
import { formDialog } from '../dialog.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy, selectionBounds } from './01-boot.js';
import {
  SFX, doc, docH, docName, docStack, docW, layerDeletes, layerRenames, layerTree, li, maskPaint, origBuffer,
  selection, set_vpDirty, set_vpMod, set_vpPlanesDoc, textCrops, textRenders, vpMod, vpPlanesDoc, vpRaw,
} from './02-doc-state.js';
import { structuralBegin, structuralDone, updateUndoButtons } from './03-history.js';
import { cropRGBA, isBackgroundLayer, opaqueBBox, rasterKindOf } from './05-layer-lock-guides.js';
import { layerSelBBox, tfFrame } from './06-view-zoom-move.js';
import { layerNameOf } from './13-quickmask-apply-image.js';
import { layerPixelJob } from './14-edit-misc.js';
import { filterGuard, set_lastFilter } from './16-filters-menu.js';
import { hasAnyEdits, refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { layerOrderView, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { FX_LABELS, effLock, humanEditError, putLayerOp } from './24-layer-ops-queue.js';
import { transformChanged } from './28-layer-props-transform.js';
import { previewCompositeDoc } from './30-render.js';
import { bgRGB, fgRGB } from './31-selection-brush.js';
import { AB_PRESETS, abOpts, artboardWriteWhy, docArtboards } from './35-artboard.js';
import { createArtboard, lastClipKind, set_lastClipKind } from './36-clipboard-frame.js';
import { ensurePixelPaint, growPixelPaintToCanvas, isU8 } from './38-brush-engine.js';
import { panelPathSubs } from './44-vector-path.js';
import { buildPsdBuffer, ensureStructuralBase } from './48-info-export.js';
import {
  compositeNowRGBA, cropRGBABox, pasteClipboardUI, pixelClipboard, set_pixelClipboard, tightAlphaBox,
} from './50-clipboard-merge-mask.js';




export async function liquifyUI(){
  
  if (SFX && selLayer >= 0 && !li && SFX.canAdd(selLayer, 'liquify')) return SFX.addLiquify(selLayer);
  const idx = selLayer, why = filterGuard(idx);
  if (why) { $('#err').textContent = '液化用不了：' + why; return false; }
  const pp = ensurePixelPaint(idx);
  if (!pp) { $('#err').textContent = '液化用不了：这一层拿不到像素'; return false; }
  let LQ;
  try { LQ = await import('../liquify.js'); } catch (e) { $('#err').textContent = '液化模块加载失败：' + (e && e.message || e); return false; }
  const res = await LQ.openLiquify({ rgba: pp.rgba, w: pp.w, h: pp.h, title: layerNameOf(idx) });
  if (!res) return false;
  const prev = selLayer; set_selLayer(idx);
  const ok = layerPixelJob('液化', ({ base, w, h, cov }) => {
    if (!cov) return res;
    const out = new Uint8ClampedArray(base);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = cov(x, y); if (a <= 0) continue; const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = Math.round(base[o + c] + (res[o + c] - base[o + c]) * a);
    }
    return out;
  });
  set_selLayer(prev);
  return ok;
}







async function fxbPixelWorkspace(label, run, o = {}){
  const idx = selLayer, why = filterGuard(idx);
  if (why) { $('#err').textContent = label + '用不了：' + why; return false; }
  const pp = ensurePixelPaint(idx);
  if (!pp) { $('#err').textContent = label + '用不了：这一层拿不到像素'; return false; }
  if (o.grow) growPixelPaintToCanvas(idx, pp);
  let res;
  try { res = await run(pp, idx); } catch (e) { $('#err').textContent = label + '失败：' + (e && e.message || e); return false; }
  if (!res) return false;
  const prev = selLayer; set_selLayer(idx);
  const ok = layerPixelJob(label, ({ base, w, h, cov }) => {
    if (res.length !== base.length) return null;
    if (!cov) return res;
    const out = new Uint8ClampedArray(base);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = cov(x, y); if (a <= 0) continue; const k = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[k + c] = Math.round(base[k + c] + (res[k + c] - base[k + c]) * a);
    }
    return out;
  });
  set_selLayer(prev);
  return ok;
}
export async function vanishingPointUI(){
  let UI;
  try { let vm; [UI, vm] = await Promise.all([import('../vanishing-point-ui.js'), import('../../../core/vanishing-point.js')]); set_vpMod(vm); }
  catch (e) { $('#err').textContent = '消失点模块加载失败：' + (e && e.message || e); return false; }
  if (!vpPlanesDoc) set_vpPlanesDoc((vpRaw && vpMod.parseVP(vpRaw)) || []);
  let planesOut = null;
  const ok = await fxbPixelWorkspace('消失点', async (pp, idx) => {
    const off = { x: pp.left, y: pp.top };
    const planes = vpPlanesDoc.map(p => p.kind === 'root' ? { ...p, corners: p.corners.map(([x, y]) => [x - off.x, y - off.y]) } : { ...p });
    const c = pixelClipboard;
    const r = await UI.openVanishingPoint({ rgba: pp.rgba, w: pp.w, h: pp.h, planes, fg: fgRGB, title: layerNameOf(idx),
      clip: c && c.data ? { rgba: c.data, w: c.w, h: c.h } : null });
    if (!r) return null;
    if (r.planesTouched) planesOut = r.planes.map(p => p.kind === 'root' ? { ...p, corners: p.corners.map(([x, y]) => [x + off.x, y + off.y]) } : p);
    return r.rgba;
  }, { grow: true });
  if (planesOut) { set_vpPlanesDoc(planesOut); set_vpDirty(true); if (!ok) { shell.status('消失点：平面已更新（随文档存储）'); updateUndoButtons(); } }
  return ok || !!planesOut;
}
export async function adaptiveWideUI(){
  let UI; try { UI = await import('../adaptive-wide-ui.js'); } catch (e) { $('#err').textContent = '自适应广角模块加载失败：' + (e && e.message || e); return false; }
  return fxbPixelWorkspace('自适应广角', (pp, idx) => UI.openAdaptiveWide({ rgba: pp.rgba, w: pp.w, h: pp.h, title: layerNameOf(idx) }));
}
export async function blurGalleryUI(kind){
  let UI; try { UI = await import('../blur-gallery-ui.js'); } catch (e) { $('#err').textContent = '模糊画廊模块加载失败：' + (e && e.message || e); return false; }
  return fxbPixelWorkspace(({ field: '场景模糊', iris: '光圈模糊', tiltShift: '移轴模糊', path: '路径模糊', spin: '旋转模糊' })[kind] || '模糊画廊',
    (pp, idx) => UI.openBlurGallery({ rgba: pp.rgba, w: pp.w, h: pp.h, kind, title: layerNameOf(idx) }));
}

export async function renderGenUI(kind){
  if (!doc || li) return false;
  let UI; try { UI = await import('../render-gen-ui.js'); } catch (e) { $('#err').textContent = '渲染模块加载失败：' + (e && e.message || e); return false; }
  const subs = panelPathSubs();
  if (kind === 'flame' && !(subs && subs.length)) { $('#notice').textContent = '火焰要沿路径生成：先用钢笔画一条路径（路径面板里选中它）再执行。'; shell.status('火焰：没有路径'); return false; }
  const bgImg = compositeNowRGBA();
  const sb = selection ? selectionBounds(selection) : null;
  const res = await UI.openRenderGen({ kind, w: docW, h: docH, backdrop: bgImg, paths: subs || null, bounds: sb && sb.width ? { x: sb.x, y: sb.y, w: sb.width, h: sb.height } : null, fg: fgRGB, bg: bgRGB });
  if (!res) return false;
  const b = tightAlphaBox(res, docW, docH);
  if (!b) { $('#notice').textContent = '没有生成任何像素。'; return false; }
  const keep = pixelClipboard, keepKind = lastClipKind;
  set_pixelClipboard({ x: b.x, y: b.y, w: b.w, h: b.h, data: cropRGBABox(res, docW, b), ab: null });
  let ok = false;
  try { ok = await pasteClipboardUI('inPlace'); } finally { set_pixelClipboard(keep); set_lastClipKind(keepKind); }
  if (ok) { const t = { flame: '火焰', pictureFrame: '图片框', tree: '树' }[kind]; $('#notice').textContent = `已把「${t}」渲染到新图层`; shell.status(`渲染 › ${t}`); }
  return ok;
}









export let lastGalleryRun = null;          

const GALLERY_SHOWALL_KEY = 'fp.filterGallery.showAll';
export function galleryShowAllPref(){ try { return localStorage.getItem(GALLERY_SHOWALL_KEY) === '1'; } catch { return false; } }
export function setGalleryShowAllPref(v){ try { localStorage.setItem(GALLERY_SHOWALL_KEY, v ? '1' : '0'); } catch {} }


export function injectGalleryMenu(items){
  const out = items.slice();
  const fxItems = g => g.effects.map(e => ({ label: e.name + '…', action: 'filter.gallery.fx.' + e.id }));
  const grp = id => GALLERY_MENU_GROUPS.find(g => g.id === id);
  const at = label => out.findIndex(x => x && x.sub && x.label === label);
  for (const [label, gid] of [['风格化', 'stylize'], ['扭曲', 'distort']]) { const i = at(label); if (i >= 0) out[i] = { ...out[i], sub: [...out[i].sub, { sep: true }, ...fxItems(grp(gid))] }; }
  const insAfter = (label, gid) => { const i = at(label); const g = grp(gid); out.splice(i >= 0 ? i + 1 : out.length, 0, { label: g.name, sub: fxItems(g) }); };
  insAfter('风格化', 'brushStrokes');
  insAfter('视频', 'sketch'); insAfter('素描', 'texture');
  insAfter('渲染', 'artistic');
  return out;
}
export function galleryGuard(idx = selLayer){
  if (!doc) return '先打开一个 PSD';
  
  if (doc.depth && doc.depth !== 8) return `滤镜库只能用于 8 位/通道的图像（本文档 ${doc.depth} 位/通道，先 图像 › 模式 › 8 位/通道）`;
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  if (L && L.isSmartObject && !li) {
    if (layerDeletes.has(idx)) return '这个图层已排队删除：先在图层面板恢复它';
    if (effLock(idx, L, 'lockAll', 'all')) return '这个图层「全部锁定」：先解锁';
    return '';
  }
  return filterGuard(idx);
}
export function galleryPatterns(){
  const out = [];
  for (const p of ((doc && doc.patterns) || [])) {
    try { const r = patternToRGBA(p); if (r && r.width > 0 && r.data) out.push({ id: p.id, name: p.name || p.id, width: r.width, height: r.height, rgba: r.data }); } catch {}
  }
  return out;
}
export async function galleryDecodeFile(file){
  const ab = await file.arrayBuffer();
  const sdoc = await parsePsdRaster(ab, { strictChannels: true });
  const surf = compositeAll(sdoc, sdoc.width, sdoc.height, new Map());
  return { rgba: new Uint8ClampedArray(surf.data), w: surf.width, h: surf.height };
}
export async function filterGalleryUI(effect, o = {}){
  const idx = selLayer, why = galleryGuard(idx);
  if (why) { $('#err').textContent = '滤镜库用不了：' + why; return false; }
  let UI; try { UI = await import('../filter-gallery.js'); } catch (e) { $('#err').textContent = '滤镜库模块加载失败：' + (e && e.message || e); return false; }
  const L = layerTree.flat[idx];
  const common = { fg: fgRGB.slice(), bg: bgRGB.slice(), effect: effect || null, getPatterns: galleryPatterns, decodeFile: galleryDecodeFile,
    onShowAllChange: () => { try { shell.menu.closeAll && shell.menu.closeAll(); } catch {} } };
  const run = async (px, w, h) => {
    if (o.layers) {   
      shell.status('滤镜库：计算中…');
      const out = await UI.runGallery(px, w, h, o.layers, { fg: common.fg, bg: common.bg }, f => shell.status(`滤镜库：${Math.round(f * 100)}%`));
      return { rgba: out, layers: o.layers };
    }
    return UI.openFilterGallery({ ...common, rgba: px, w, h, title: layerNameOf(idx) });
  };
  if (L && L.isSmartObject) return gallerySmartFilter(idx, run, common);
  let got = null;
  const ok = await fxbPixelWorkspace('滤镜库', async pp => { const r = await run(pp.rgba, pp.w, pp.h); got = r; return r && r.rgba; });
  if (ok && got) { lastGalleryRun = { layers: got.layers }; set_lastFilter({ kind: 'filterGallery', params: {} }); shell.status('滤镜库：已应用'); }
  return ok;
}

async function gallerySmartFilter(idx, run, common){
  if (!origBuffer) return false;
  if (!await ensureLazy(EDIT, '滤镜库（智能滤镜）')) return false;
  let base = await ensureStructuralBase(origBuffer);
  try { if (hasAnyEdits()) base = (await buildPsdBuffer({ fast: true })).buf;
    base = await ensureStructuralBase(base); }
  catch (e) { $('#err').textContent = '滤镜库：当前改动落盘失败：' + humanEditError(e && e.message || e); return false; }
  const rd = await parsePsdRaster(base.slice ? base.slice(0) : base, {});
  const lay = rd && rd.layers && rd.layers[idx];
  const w = lay ? lay.bounds.right - lay.bounds.left : 0, h = lay ? lay.bounds.bottom - lay.bounds.top : 0;
  if (!lay || !lay.rgba || !(w > 0 && h > 0)) { $('#err').textContent = '滤镜库：这个智能对象没有像素'; return false; }
  let r;
  try { r = await run(new Uint8ClampedArray(lay.rgba), w, h); } catch (e) { $('#err').textContent = '滤镜库失败：' + (e && e.message || e); return false; }
  if (!r) return false;
  const { galleryFilterFXEntry } = await import('../../../core/filter-gallery-spec.js');
  try {
    const prev = structuralBegin();
    const entry = galleryFilterFXEntry(r.layers, { fg: common.fg, bg: common.bg });
    const res = applyEdits(base, [
      { op: 'addGallerySmartFilter', index: idx, entry },
      { op: 'replaceLayerPixels', index: idx, rgba: { data: new Uint8Array(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength), width: w, height: h }, bounds: lay.bounds },
    ]);
    await initDocument(res.buffer, docName, { nested: docStack.length > 0 });
    set_selLayer(Math.min(idx, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '滤镜库（智能滤镜）');
    lastGalleryRun = { layers: r.layers }; set_lastFilter({ kind: 'filterGallery', params: {} });
    shell.status('滤镜库：已作为智能滤镜添加（导出后在 PS 里可双击继续调整）');
    return true;
  } catch (e) {
    $('#err').textContent = '滤镜库（智能滤镜）没能写入：' + humanEditError(e && e.message || e);
    return false;
  }
}







const FX_SINGLE = ['DrSh', 'OrGl', 'IrSh', 'IrGl', 'ebbl', 'ChFX', 'SoFi', 'GrFl', 'patternFill', 'FrFX'];
const FX_MULTI = { dropShadowMulti: 'DrSh', innerShadowMulti: 'IrSh', solidFillMulti: 'SoFi', gradientFillMulti: 'GrFl', patternFillMulti: 'patternFill', frameFXMulti: 'FrFX' };
const FX_BELOW = new Set(['DrSh', 'OrGl']), FX_OVERLAY = new Set(['SoFi', 'GrFl', 'patternFill']);
function renderLayerWith(idx, patch){
  const src = previewCompositeDoc(doc);
  if (!src || !src.layers || !src.layers[idx]) return null;
  const one = { ...src, layers: [{ ...src.layers[idx], opacity: 255, blendMode: 'norm', clipping: 0, group: null, hidden: false, ...patch }] };
  try { return new Uint8ClampedArray(compositeAll(one, docW, docH, new Map()).data); } catch { return null; }
}

export function liveFxEntries(idx){
  const pl = previewCompositeDoc(doc).layers[idx], fx = pl && pl.effects;
  if (!fx || typeof fx !== 'object' || fx.masterFXSwitch === false) return [];
  const out = [];
  for (const [mk, sk] of Object.entries(FX_MULTI)) if (Array.isArray(fx[mk])) fx[mk].forEach((e, i) => { if (e && e.enab !== false) out.push({ key: sk, multi: mk, i, label: FX_LABELS[sk] }); });
  for (const k of FX_SINGLE) {
    if (Object.entries(FX_MULTI).some(([mk, sk]) => sk === k && Array.isArray(fx[mk]))) continue;
    const e = fx[k]; if (e && typeof e === 'object' && e.enab !== false) out.push({ key: k, multi: null, i: 0, label: FX_LABELS[k] });
  }
  return out;
}
function isolateFx(fx, pick){
  const c = structuredClone(fx); c.masterFXSwitch = true;
  for (const k of FX_SINGLE) if (c[k] && typeof c[k] === 'object') c[k].enab = !pick.multi && k === pick.key;
  for (const mk of Object.keys(FX_MULTI)) if (Array.isArray(c[mk])) c[mk].forEach((e, i) => { if (e) e.enab = pick.multi === mk && i === pick.i; });
  return c;
}
export async function bakeLayerStyleUI(idx, split){
  if (!doc || li || idx < 0) return false;
  const L = layerTree.flat[idx];
  if (!L || L.isGroup || L.groupType != null && L.groupType !== 0) { $('#notice').textContent = '图层组的图层样式暂时不能烘焙：先选中组里的某一层。'; return false; }
  const items = liveFxEntries(idx);
  if (!items.length) { $('#notice').textContent = '这一层没有启用着的图层样式。'; return false; }
  const pl = previewCompositeDoc(doc).layers[idx];
  const unr = hasUnrenderedEffects(pl.effects, doc.patterns);
  if (!await ensureLazy(EDIT, split ? '创建图层' : '栅格化图层样式')) return false;
  
  const crop = full => { const b = opaqueBBox(full, docW, docH); return b ? { data: cropRGBA(full, docW, b), width: b.right - b.left, height: b.bottom - b.top, bounds: b } : null; };
  let baked = null; const layers = [];
  if (!split) {
    const full = renderLayerWith(idx, { mask: null });      
    baked = full && crop(full);
  } else {
    for (const it of items) {
      const full = renderLayerWith(idx, { effects: isolateFx(pl.effects, it), fillOpacity: FX_OVERLAY.has(it.key) ? pl.fillOpacity ?? 255 : 0 });
      const c = full && crop(full); if (!c) continue;
      

      const fxd = it.multi ? (pl.effects[it.multi] || [])[it.i] : pl.effects[it.key];
      const mode = fxd && fxd['Md  '] && fxd['Md  '].value;
      layers.push({ ...c, below: FX_BELOW.has(it.key), name: `${layerNameOf(idx)} 的${it.label || it.key}`,
        blend: FX_OVERLAY.has(it.key) || !mode ? 'norm' : styleBlendKey(mode), clip: ['IrSh', 'IrGl', 'ChFX'].includes(it.key) });
    }
  }
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer);
    if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const effOrder = layerOrderView().order.filter(i => !layerDeletes.has(i));
    const p = effOrder.indexOf(idx);
    if (p < 0) throw new Error('找不到这一层在文件里的位置');
    const ops = []; let target = p;
    const px = c => ({ rgba: { data: c.data, width: c.width, height: c.height }, bounds: { ...c.bounds } });
    if (!split) {
      if (rasterKindOf(idx)) ops.push({ op: 'rasterizeLayer', index: p });
      if (baked) ops.push({ op: 'replaceLayerPixels', index: p, ...px(baked) });
      if ((pl.fillOpacity ?? 255) !== 255) ops.push({ op: 'setFillOpacity', index: p, fillOpacity: 255 });
      ops.push({ op: 'clearLayerEffects', index: p });
    } else {
      const below = layers.filter(l => l.below), above = layers.filter(l => !l.below).sort((a, b) => (b.clip ? 1 : 0) - (a.clip ? 1 : 0));
      const props = (at, l) => { const o = { op: 'setLayerProps', index: at }; if (l.blend && l.blend !== 'norm') o.blendKey = l.blend; if (l.clip) o.clipping = true; return Object.keys(o).length > 2 ? [o] : []; };
      below.forEach((l, k) => { ops.push({ op: 'createLayer', at: p + k, name: l.name }, { op: 'replaceLayerPixels', index: p + k, ...px(l) }, ...props(p + k, l)); });
      target = p + below.length;
      above.forEach((l, k) => { const at = target + 1 + k; ops.push({ op: 'createLayer', at, name: l.name }, { op: 'replaceLayerPixels', index: at, ...px(l) }, ...props(at, l)); });
      ops.push({ op: 'clearLayerEffects', index: target });
    }
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(Math.min(target, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, split ? '创建图层（图层样式）' : '栅格化图层样式');
    const msg = split ? `已把 ${layers.length} 条效果拆成独立图层` : '已把图层样式烘进像素';
    $('#notice').textContent = msg + (unr ? '（注意：有的效果合成器还画不了，那几条没能烘进去）' : '');
    shell.status(msg);
    return true;
  } catch (e) { $('#err').textContent = (split ? '创建图层' : '栅格化图层样式') + '没能完成：' + humanEditError(e && e.message || e); return false; }
}



export async function newArtboardDialog(){
  const v = await formDialog('新建画板', [
    { key: 'preset', label: '预设', type: 'select', value: 'custom', options: [['custom', '自定'], ...AB_PRESETS.filter(p => p[2] > 0).map(p => [p[0], p[1]])] },
    { key: 'w', label: '宽度', type: 'number', value: Math.min(docW, 1080), min: 1, max: 30000, unit: '像素', showIf: o => o.preset === 'custom' },
    { key: 'h', label: '高度', type: 'number', value: Math.min(docH, 1080), min: 1, max: 30000, unit: '像素', showIf: o => o.preset === 'custom' },
    { key: 'x', label: 'X', type: 'number', value: 0, unit: '像素' },
    { key: 'y', label: 'Y', type: 'number', value: 0, unit: '像素' },
  ]);
  if (!v) return false;
  let w = v.w, h = v.h;
  const pr = AB_PRESETS.find(p => p[0] === v.preset);
  if (pr && pr[2] > 0) { w = pr[2]; h = pr[3]; abOpts.preset = pr[0]; } else abOpts.preset = 'custom';
  return createArtboard({ x: Math.round(v.x), y: Math.round(v.y), w: Math.round(w), h: Math.round(h) });
}
export async function artboardFromLayersUI(){
  if (li || !doc || !origBuffer) return false;
  const why = artboardWriteWhy(); if (why) { $('#notice').textContent = why; return false; }
  const picks = [...selLayers].filter(i => i >= 0 && !layerDeletes.has(i)); if (!picks.length && selLayer >= 0) picks.push(selLayer);
  if (picks.some(i => { const n = layerTree.flat[i]; return !n || n.groupType === 3; })) { $('#notice').textContent = '分隔记录不能放进画板：请选图层或组头。'; return false; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of picks) { const b = layerSelBBox(i); if (!b || !(b.w > 0)) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  if (!(x1 > x0)) { $('#notice').textContent = '选中的图层没有可见内容，定不出画板范围。'; return false; }
  if (!await ensureLazy(EDIT, '来自图层的画板')) return false;
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer); if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const n = docArtboards().length + 1, name = `画板 ${n}`;
    const r1 = applyEdits(base, [{ op: 'groupLayers', indices: picks.sort((a, b) => a - b), name }]);
    const header = (r1.results && r1.results[0] && r1.results[0].headerIndex) ?? picks[picks.length - 1] + 2;
    const rect = { top: Math.floor(y0), left: Math.floor(x0), bottom: Math.ceil(y1), right: Math.ceil(x1) };
    const r2 = applyEdits(r1.buffer, [{ op: 'setArtboard', index: header, presetName: `自定 ${rect.right - rect.left}×${rect.bottom - rect.top}`, rect }]);
    await initDocument(r2.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(Math.min(header, doc.layers.length - 1));
    refreshAll(false); structuralDone(prev, '来自图层的画板');
    shell.status(`已把 ${picks.length} 个图层放进「${name}」（${rect.right - rect.left} × ${rect.bottom - rect.top}）`);
    return true;
  } catch (e) { $('#err').textContent = '来自图层的画板没能完成：' + humanEditError(e && e.message || e); return false; }
}
export async function backgroundFromLayerUI(){
  const idx = selLayer;
  if (li || !doc || idx < 0) return false;
  const flat = layerTree.flat;
  if (flat.some((l, i) => isBackgroundLayer(i))) { $('#notice').textContent = '文档里已经有背景图层了（PS 同样只允许一个）。'; return false; }
  const L = flat[idx]; if (!L || L.isGroup || L.groupType != null && L.groupType !== 0) { $('#notice').textContent = '只有普通图层能转成背景。'; return false; }
  const full = renderLayerWith(idx, {}); if (!full) { $('#err').textContent = '这一层渲染不出来。'; return false; }
  const bg = bgRGB, px = new Uint8ClampedArray(docW * docH * 4);
  for (let i = 0; i < docW * docH; i++) { const a = full[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(full[i * 4 + c] * a + bg[c] * (1 - a)); px[i * 4 + 3] = 255; }
  if (!await ensureLazy(EDIT, '背景图层')) return false;
  try {
    const prev = structuralBegin();
    let base = await ensureStructuralBase(origBuffer); if (hasAnyEdits()) { const built = await buildPsdBuffer({ fast: true }); base = built.buf; }
    base = await ensureStructuralBase(base);
    const effOrder = layerOrderView().order.filter(i => !layerDeletes.has(i)), p = effOrder.indexOf(idx);
    const ops = [];
    if (rasterKindOf(idx)) ops.push({ op: 'rasterizeLayer', index: p });
    ops.push({ op: 'replaceLayerPixels', index: p, rgba: { data: px, width: docW, height: docH }, bounds: { top: 0, left: 0, bottom: docH, right: docW } });
    ops.push({ op: 'clearLayerEffects', index: p });
    ops.push({ op: 'setLayerProps', index: p, opacity: 255, blendKey: 'norm', visible: true, clipping: 0 });
    if (p !== 0) ops.push({ op: 'reorderLayers', order: [p, ...effOrder.map((_, k) => k).filter(k => k !== p)] });
    const r = applyEdits(base, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(0);
    layerRenames[0] = '背景';
    putLayerOp(0, { op: 'setLayerFlags', index: 0, lockTransparency: true });
    refreshAll(false); structuralDone(prev, '背景图层');
    shell.status('已转成背景图层（移到最底、透明处用背景色填满、锁定透明像素）');
    return true;
  } catch (e) { $('#err').textContent = '转成背景图层没能完成：' + humanEditError(e && e.message || e); return false; }
}






export function transformedMaskFor(i, clip){
  const t = transformChanged(i); if (!t) return null;
  const dl = doc.layers[i]; if (!dl) return null;
  const m = dl.mask || null, mp = maskPaint[i];
  if (!m && !mp) return null;
  let gray, mw, mh, mx, my;
  if (mp) { gray = mp.gray; mw = mp.w; mh = mp.h; mx = mp.docLeft; my = mp.docTop; }
  else if (m && isU8(m.gray)) { gray = m.gray; mw = m.width; mh = m.height; mx = m.relative ? dl.bounds.left + m.left : m.left; my = m.relative ? dl.bounds.top + m.top : m.top; }
  else return null;
  if (!(mw > 0 && mh > 0)) return null;
  const tc = textRenders[i] && textCrops[i];
  const S = tc ? tc.bounds : dl.bounds;
  let c = tfFrame(t).corners.map(p => [p[0], p[1]]);
  if (t.flipX) c = [c[1], c[0], c[3], c[2]];
  if (t.flipY) c = [c[3], c[2], c[1], c[0]];
  const H = computeHomographyQuad([S.left, S.top, S.right, S.top, S.right, S.bottom, S.left, S.bottom], c.flat());
  if (!H) return null;
  const Hi = invert3x3(H);
  const pts = [[mx, my], [mx + mw, my], [mx + mw, my + mh], [mx, my + mh]].map(p => applyHomography(H, p[0], p[1]));
  let x0 = Math.floor(Math.min(...pts.map(p => p.x))), y0 = Math.floor(Math.min(...pts.map(p => p.y)));
  let x1 = Math.ceil(Math.max(...pts.map(p => p.x))), y1 = Math.ceil(Math.max(...pts.map(p => p.y)));
  if (clip) { x0 = Math.max(x0, clip.x); y0 = Math.max(y0, clip.y); x1 = Math.min(x1, clip.x + clip.width); y1 = Math.min(y1, clip.y + clip.height); }
  const W = x1 - x0, Hh = y1 - y0;
  if (!(W > 0 && Hh > 0) || W * Hh > 400e6) return null;
  const def = (m && m.defaultColor) ?? 255, out = new Uint8Array(W * Hh);
  const at = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? def : gray[y * mw + x];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const q = applyHomography(Hi, x0 + x + 0.5, y0 + y + 0.5);
    const sx = q.x - mx - 0.5, sy = q.y - my - 0.5, fx = Math.floor(sx), fy = Math.floor(sy), tx = sx - fx, ty = sy - fy;
    out[y * W + x] = Math.round(at(fx, fy) * (1 - tx) * (1 - ty) + at(fx + 1, fy) * tx * (1 - ty) + at(fx, fy + 1) * (1 - tx) * ty + at(fx + 1, fy + 1) * tx * ty);
  }
  return { gray: out, bounds: { top: y0, left: x0, bottom: y1, right: x1 }, relative: !mp && !!(m && m.relative), isNew: !!(mp && mp.mode === 'new') };
}
