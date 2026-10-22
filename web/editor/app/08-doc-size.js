




import './07-nav-histogram.js';   
import { parseImageResources } from '../../../core/app.js';
import { DOCS } from '../documents.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, NEWDOC } from './01-boot.js';
import {
  doc, docH, docW, guides, layerDeletes, layerTree, pixelPaint, selection, set_docH, set_docW, set_guides,
  set_guidesDirty, textCrops,
} from './02-doc-state.js';
import { actRecord, pushDocHistory, set_hxOpenLabel } from './03-history.js';
import { fitStage } from './04-view-chrome.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { quadBBox } from './06-view-zoom-move.js';
import { refreshAll } from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { layerCanvasCache, renderLayerPanel, thumbCache } from './23-layers-panel.js';
import { renderProps } from './24-layer-ops-queue.js';
import { ensureLayerTransform, transformChanged } from './28-layer-props-transform.js';
import { gpuFlush, renderPreviewOnly } from './30-render.js';
import { bgRGB, fgRGB, mapAuxGeometry } from './31-selection-brush.js';
import { deselect } from './32-cursors-select-options.js';
import { commitPixelPaint } from './38-brush-engine.js';
import { drawGizmo, syncDocStats } from './46-smart-filter-panel.js';
import { fireScriptEvent } from './58-scripting.js';













export let docSizeBase = null;     
export function set_docSizeBase(v) { return (docSizeBase = v); }   
export let pendingCropDelete = false;   
export function set_pendingCropDelete(v) { return (pendingCropDelete = v); }   
export let docResolution = 72;     
export function set_docResolution(v) { return (docResolution = v); }   
export let docResolutionBase = 72;
export function set_docResolutionBase(v) { return (docResolutionBase = v); }   










export function docImageResources(buffer){
  try {
    const u8 = new Uint8Array(buffer);
    if (u8.length < 30) return [];
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 26;
    o += 4 + dv.getUint32(o);                 
    const len = dv.getUint32(o);
    if (o + 4 + len > u8.length) return [];
    return parseImageResources(u8.subarray(o + 4, o + 4 + len)) || [];
  } catch { return []; }
}
export function readResolution(buf){
  try {
    const list = docImageResources(buf);
    const r = list.find(x => x.id === 1005);
    if (r && r.data && r.data.horizontalResolution) return Math.round(r.data.horizontalResolution * 100) / 100;
    if (r && r.raw && r.raw.length >= 4) {
      const dv = new DataView(r.raw.buffer, r.raw.byteOffset, r.raw.byteLength);
      return Math.round(dv.getUint32(0) / 65536 * 100) / 100;
    }
  } catch {  }
  return 72;
}

export function resolutionInfoBytes(res){
  const out = new Uint8Array(16), dv = new DataView(out.buffer);
  dv.setUint32(0, Math.round(res * 65536)); dv.setUint16(4, 1); dv.setUint16(6, 1);
  dv.setUint32(8, Math.round(res * 65536)); dv.setUint16(12, 1); dv.setUint16(14, 1);
  return out;
}


export function scaleLayerGeometry(idx, sx, sy, dx, dy){
  const t = ensureLayerTransform(idx);
  if (t.quad) {
    t.quad = t.quad.map(pt => [pt[0] * sx + dx, pt[1] * sy + dy]);
    const b = quadBBox(t.quad); t.x = b.x; t.y = b.y; t.w = b.w; t.h = b.h;
    return;
  }
  const cx = (t.x + t.w / 2) * sx + dx, cy = (t.y + t.h / 2) * sy + dy;
  t.w = Math.max(1, Math.round(t.w * sx)); t.h = Math.max(1, Math.round(t.h * sy));
  t.x = Math.round(cx - t.w / 2); t.y = Math.round(cy - t.h / 2);
}

export function transformableLayers(){
  const out = [];
  if (!doc) return out;
  for (let i = 0; i < doc.layers.length; i++) {
    if (layerDeletes.has(i)) continue;
    const l = doc.layers[i];
    if ((l && l.rgba && l.width > 0 && l.height > 0) || textCrops[i]) out.push(i);
  }
  return out;
}

export function applyDocSize(w, h){
  set_docW(w); set_docH(h);
  if (doc) { doc.width = w; doc.height = h; }
  if (selection) deselect();                       
  for (const k of Object.keys(layerCanvasCache)) delete layerCanvasCache[k];
  renderPreviewOnly(); fitStage(true); syncDocStats(); renderLayerPanel(); renderProps(); drawGizmo();
}


export function resizeCanvas(w, h, anchor = 4, extColor = null, shift = null){
  if (!doc) return false;
  w = Math.max(1, Math.min(30000, Math.round(w))); h = Math.max(1, Math.min(30000, Math.round(h)));
  if (w === docW && h === docH && !(shift && (shift.dx || shift.dy))) return false;
  const ax = (anchor % 3) / 2, ay = Math.floor(anchor / 3) / 2;
  
  const dx = shift ? Math.round(shift.dx) : Math.round((w - docW) * ax), dy = shift ? Math.round(shift.dy) : Math.round((h - docH) * ay);
  pushDocHistory('画布大小');
  

  let bgIdx = -1;
  if (layerTree && layerTree.flat.some((l, i) => isBackgroundLayer(i))) bgIdx = layerTree.flat.findIndex((l, i) => isBackgroundLayer(i));
  const dlb = bgIdx >= 0 ? doc.layers[bgIdx] : null;
  if (dlb && !transformChanged(bgIdx) && dlb.rgba && dlb.width > 0) {
    const col = extColor || bgRGB, src = (pixelPaint[bgIdx] && pixelPaint[bgIdx].rgba) || dlb.rgba;
    const sw = dlb.width, sh = dlb.height, sl = dlb.bounds.left + dx, st = dlb.bounds.top + dy;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { out[i * 4] = col[0]; out[i * 4 + 1] = col[1]; out[i * 4 + 2] = col[2]; out[i * 4 + 3] = 255; }
    for (let y = 0; y < sh; y++) { const Y = st + y; if (Y < 0 || Y >= h) continue;
      for (let x = 0; x < sw; x++) { const X = sl + x; if (X < 0 || X >= w) continue; const so = (y * sw + x) * 4, a = src[so + 3] / 255, o = (Y * w + X) * 4;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(src[so + c] * a + col[c] * (1 - a)); } }
    delete pixelPaint[bgIdx];
    dlb.rgba = out; dlb.bounds = { top: 0, left: 0, bottom: h, right: w }; dlb.width = w; dlb.height = h;
    pixelPaint[bgIdx] = { rgba: out, orig: new Uint8ClampedArray(out.length), w, h, left: 0, top: 0 };
    delete layerCanvasCache[bgIdx]; delete thumbCache[bgIdx];
    commitPixelPaint(bgIdx);
  } else bgIdx = -1;
  if (dx || dy) for (const i of transformableLayers()) if (i !== bgIdx) scaleLayerGeometry(i, 1, 1, dx, dy);
  if (dx || dy) { set_guides(guides.map(g => ({ ...g, px: g.px + (g.vertical ? dx : dy) }))); set_guidesDirty(true); }
  if (dx || dy) mapAuxGeometry(p=>[p[0]+dx,p[1]+dy]);
  applyDocSize(w, h);
  shell.status(`画布大小：${w} × ${h} 像素（图层整体偏移 ${dx},${dy}）`);
  return true;
}


export function tfFreeRatio(ev){ return !!(ev && ev.shiftKey) !== !!PREF.get('general.legacyFreeTransform'); }

export function resizeImage(w, h, opts = {}){
  if (!doc) return false;
  w = Math.max(1, Math.min(30000, Math.round(w))); h = Math.max(1, Math.min(30000, Math.round(h)));
  const resChanged = opts.resolution != null && Math.abs(opts.resolution - docResolution) > 1e-6;
  if (w === docW && h === docH && !resChanged) return false;
  pushDocHistory('图像大小');
  if (resChanged) docResolution = opts.resolution;
  if (w !== docW || h !== docH) {
    const sx = w / docW, sy = h / docH;
    for (const i of transformableLayers()) scaleLayerGeometry(i, sx, sy, 0, 0);
    mapAuxGeometry(p=>[p[0]*sx,p[1]*sy]);
    set_guides(guides.map(g => ({ ...g, px: Math.round(g.px * (g.vertical ? sx : sy)) }))); set_guidesDirty(true);
    applyDocSize(w, h);
  }
  shell.status(`图像大小：${w} × ${h} 像素 · ${docResolution} 像素/英寸`);
  return true;
}

export async function newDocument(o){
  const m = await NEWDOC.load();
  
  
  const ab = m.createPsd({ ...o, name: o.layerName });
  const dtk = await DOCS.beginOpen(); if (!dtk) return false;
  set_hxOpenLabel('新建');                          
  try { await initDocument(ab, (o.name || '未标题-1') + '.psd', { nested: false, freshDoc: true }); }
  catch (e) { DOCS.abortOpen(dtk); $('#err').textContent = '新建文档失败：' + (e && e.message || e); return false; }
  refreshAll(true);
  await gpuFlush();
  DOCS.endOpen(dtk);
  docResolution = docResolutionBase = o.resolution || 72;
  fireScriptEvent('new');                     
  shell.status(`已新建 ${o.width} × ${o.height} 像素文档`);
  return true;
}



export let ndPresetSel = '默认 Photoshop 大小', ndGroup = 0, csAnchorSel = 4;
export function set_csAnchorSel(v) { return (csAnchorSel = v); }   


const ND_UNIT_PER_INCH = { px: null, cm: 2.54, mm: 25.4, in: 1, pt: 72, pc: 6 };
function ndPxPerUnit(){
  const u = ($('#ndUnit') && $('#ndUnit').value) || 'px';
  if (u === 'px') return 1;
  return ndResolutionPpi() / ND_UNIT_PER_INCH[u];
}
function ndResolutionPpi(){
  const v = Math.max(1, +$('#ndRes').value || 72);
  return ($('#ndResUnit') && $('#ndResUnit').value === 'ppcm') ? v * 2.54 : v;
}
const ndSizePx = () => ({
  width: Math.max(1, Math.round((+$('#ndW').value || 0) * ndPxPerUnit())),
  height: Math.max(1, Math.round((+$('#ndH').value || 0) * ndPxPerUnit())),
});

function ndSwitchUnit(prevPerPx){
  const per = ndPxPerUnit();
  const conv = v => { const px = v * prevPerPx; const out = px / per; return per === 1 ? Math.round(out) : Math.round(out * 1000) / 1000; };
  $('#ndW').value = conv(+$('#ndW').value || 0);
  $('#ndH').value = conv(+$('#ndH').value || 0);
  const stp = per === 1 ? '1' : '0.01';
  $('#ndW').step = stp; $('#ndH').step = stp;
  
  
  $('#ndW').min = stp; $('#ndH').min = stp;
}
export async function openNewDialog(){
  const m = await NEWDOC.load().catch(() => null);
  if (!m) { shell.status('新建文档内核加载失败，请重试'); return false; }
  const dlg = $('#newDlg');
  const tabs = $('#ndTabs'), grid = $('#ndPresets');
  if (!tabs.children.length) {
    m.NEW_DOC_PRESETS.forEach((g, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = g.group;
      b.onclick = () => { ndGroup = i; renderNdPresets(m); ndTabIntoView(b); };
      tabs.appendChild(b);
    });
    installTabDragScroll(tabs);
    const sel = $('#ndMode');
    for (const mo of m.NEW_DOC_MODES) { const op = document.createElement('option'); op.value = mo.value; op.textContent = mo.label; sel.appendChild(op); }
    sel.value = 'rgb';
    $('#ndBg').onchange = () => {
      const v = $('#ndBg').value;
      if (v === 'white') $('#ndBgColor').value = '#ffffff';
      else if (v === 'black') $('#ndBgColor').value = '#000000';
      
      $('#ndBgColor').disabled = v === 'transparent';
      
      
      if (v === 'color') { try { $('#ndBgColor').click(); } catch {} }
      ndInfo();
    };
    for (const id of ['#ndW', '#ndH', '#ndRes', '#ndMode', '#ndDepth']) $(id).addEventListener('input', () => { ndPresetSel = null; renderNdPresets(m); ndInfo(); });
    { 
      let prevPer = ndPxPerUnit();
      $('#ndUnit').addEventListener('change', () => { ndSwitchUnit(prevPer); prevPer = ndPxPerUnit(); ndPresetSel = null; renderNdPresets(m); ndInfo(); });
      $('#ndResUnit').addEventListener('change', () => {
        
        const ppi = ndResolutionPpi();
        $('#ndRes').value = $('#ndResUnit').value === 'ppcm' ? Math.round(ppi / 2.54 * 1000) / 1000 : Math.round(ppi);
        prevPer = ndPxPerUnit(); ndInfo();
      });
    }
    
    $('#ndBgColor').addEventListener('input', () => { $('#ndBg').value = 'color'; ndInfo(); });
    
    
    
    const createDoc = async () => {
      dlg.close();
      const size = ndSizePx();
      await newDocument({
        name: $('#ndName').value || '未标题-1',
        width: size.width, height: size.height,
        resolution: Math.round(ndResolutionPpi()), mode: $('#ndMode').value,
        depth: +$('#ndDepth').value || 8,
        background: $('#ndBg').value, backgroundColor: $('#ndBgColor').value,
      });
    };
    const ndForm = $('#newDlg form');
    ndForm.addEventListener('submit', e => { e.preventDefault(); createDoc(); });
    ndForm.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      if (!e.target || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      if (!ndForm.checkValidity()) { ndForm.reportValidity(); return; }
      createDoc();
    });
    $('#ndCancel').onclick = () => dlg.close();
  }
  renderNdPresets(m); ndInfo();
  dlg.showModal();
  ndTabIntoView(tabs.children[ndGroup], false);      
  
  
  
  
  const name = $('#ndName');
  name.focus({ preventScroll: true });
  name.select();
  return true;
}
function renderNdPresets(m){
  const tabs = $('#ndTabs'), grid = $('#ndPresets');
  [...tabs.children].forEach((b, i) => b.classList.toggle('on', i === ndGroup));
  grid.innerHTML = '';
  for (const p of m.NEW_DOC_PRESETS[ndGroup].items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'nd-card';
    b.classList.toggle('on', ndPresetSel === p.name);
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = p.name;
    b.querySelector('span').textContent = `${p.width} × ${p.height} 像素 · ${p.resolution}`;
    b.onclick = () => {
      ndPresetSel = p.name;
      $('#ndResUnit').value = 'ppi'; $('#ndRes').value = p.resolution;
      $('#ndUnit').value = 'px'; $('#ndW').step = '1'; $('#ndH').step = '1'; $('#ndW').min = '1'; $('#ndH').min = '1';
      $('#ndW').value = p.width; $('#ndH').value = p.height;
      renderNdPresets(m); ndInfo();
    };
    grid.appendChild(b);
  }
}






function ndTabIntoView(b, smooth){
  const strip = b && b.parentElement;
  if (!strip) return;
  const sr = strip.getBoundingClientRect(), br = b.getBoundingClientRect();
  const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const left = Math.max(0, Math.min(max, strip.scrollLeft + (br.left - sr.left) - (strip.clientWidth - br.width) / 2));
  if (Math.abs(left - strip.scrollLeft) < 1) return;
  try { strip.scrollTo({ left, behavior: smooth === false ? 'auto' : 'smooth' }); } catch { strip.scrollLeft = left; }
}
function installTabDragScroll(strip){
  if (strip.__dragScroll) return;
  strip.__dragScroll = true;
  let down = null, swallowUntil = 0;
  const move = e => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!down.moved) {
      if (Math.abs(dx) < 4) return;                 
      down.moved = true; strip.classList.add('dragging');
    }
    strip.scrollLeft = down.left - dx;
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    if (down && down.moved) swallowUntil = Date.now() + 350;
    strip.classList.remove('dragging');
    down = null;
  };
  strip.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    if (e.pointerType === 'touch') return;          
    down = { x: e.clientX, left: strip.scrollLeft, moved: false };
    
    
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });
  
  strip.addEventListener('click', e => {
    if (Date.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  
  
  
  strip.addEventListener('wheel', e => {
    if (e.deltaX || !e.deltaY) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    e.preventDefault();
    strip.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  }, { passive: false });
}
function ndInfo(){
  const { width: w, height: h } = ndSizePx();
  const res = ndResolutionPpi();
  const mode = $('#ndMode').value, ch = mode === 'gray' ? 1 : mode === 'cmyk' ? 4 : 3;
  const depth = +($('#ndDepth') && $('#ndDepth').value) || 8;
  const bytes = w * h * (ch + 1) * (depth / 8);
  $('#ndInfo').textContent = `${w} × ${h} 像素 · ${depth} 位/通道 · 约 `
    + (bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB');
}

export function openImageSizeDialog(){
  if (!doc) return false;
  const dlg = $('#imgSizeDlg');
  const w0 = docW, h0 = docH;
  let link = true, unit = 'px';
  const sync = (from) => {
    const pct = unit === 'pct';
    if (link && from) {
      if (from === 'w') $('#isH').value = pct ? $('#isW').value : Math.max(1, Math.round(+$('#isW').value * h0 / w0));
      else $('#isW').value = pct ? $('#isH').value : Math.max(1, Math.round(+$('#isH').value * w0 / h0));
    }
    const W = pct ? Math.max(1, Math.round(w0 * (+$('#isW').value || 100) / 100)) : Math.max(1, Math.round(+$('#isW').value || w0));
    const H = pct ? Math.max(1, Math.round(h0 * (+$('#isH').value || 100) / 100)) : Math.max(1, Math.round(+$('#isH').value || h0));
    const ch = doc.mode === 4 ? 5 : doc.mode === 1 ? 2 : 4;
    $('#isSummary').textContent = `原图 ${w0} × ${h0} 像素 · 新图 ${W} × ${H} 像素（约 ${(W * H * ch / 1048576).toFixed(1)} MB）`;
    const texts = transformableLayers().filter(i => layerTree && layerTree.flat[i] && (layerTree.flat[i].text || layerTree.flat[i].isSmartObject)).length;
    $('#isWhy').textContent = !$('#isResample').checked
      ? '未勾选「重新采样」：像素不变，只改分辨率（打印尺寸随之变化）'
      : texts ? `${texts} 个文字 / 智能对象图层会按像素重采样（它们内部的可编辑数据不随之缩放）` : '';
    return { W, H };
  };
  if (!dlg._bound) {
    dlg._bound = true;
    $('#isLink').onclick = () => { link = !link; $('#isLink').classList.toggle('on', link); };
    $('#isUnit').onchange = () => {
      unit = $('#isUnit').value; $('#isUnit2').textContent = unit === 'pct' ? '百分比' : '像素';
      $('#isW').value = unit === 'pct' ? 100 : docW; $('#isH').value = unit === 'pct' ? 100 : docH; sync();
    };
    for (const id of ['#isW', '#isH']) $(id).addEventListener('input', () => sync(id === '#isW' ? 'w' : 'h'));
    $('#isResample').onchange = () => sync();
    $('#isCancel').onclick = () => dlg.close();
    $('#isOk').onclick = () => {
      const { W, H } = sync();
      dlg.close();
      if ($('#isResample').checked) { if (resizeImage(W, H, { resolution: +$('#isRes').value || docResolution })) actRecord('imageSize', { width: W, height: H }); }
      else { docResolution = +$('#isRes').value || docResolution; shell.status(`分辨率改为 ${docResolution} 像素/英寸（像素未变）`); }
    };
  }
  unit = 'px'; link = true;
  $('#isUnit').value = 'px'; $('#isUnit2').textContent = '像素'; $('#isLink').classList.add('on');
  $('#isW').value = w0; $('#isH').value = h0; $('#isRes').value = docResolution;
  sync();
  dlg.showModal();
  return true;
}

export function openCanvasSizeDialog(){
  if (!doc) return false;
  const dlg = $('#canvasSizeDlg');
  const w0 = docW, h0 = docH;
  const grid = $('#csAnchor');
  if (!grid.children.length) {
    const ARROW = ['↖', '↑', '↗', '←', '·', '→', '↙', '↓', '↘'];
    for (let k = 0; k < 9; k++) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.anchor = String(k); b.textContent = ARROW[k];
      b.onclick = () => { csAnchorSel = k; [...grid.children].forEach(x => x.classList.toggle('on', +x.dataset.anchor === csAnchorSel)); };
      grid.appendChild(b);
    }
  }
  const sync = () => {
    const rel = $('#csRelative').checked, pct = $('#csUnit').value === 'pct';
    let W, H;
    const vw = +$('#csW').value || 0, vh = +$('#csH').value || 0;
    if (rel) { W = w0 + (pct ? Math.round(w0 * vw / 100) : Math.round(vw)); H = h0 + (pct ? Math.round(h0 * vh / 100) : Math.round(vh)); }
    else { W = pct ? Math.round(w0 * vw / 100) : Math.round(vw); H = pct ? Math.round(h0 * vh / 100) : Math.round(vh); }
    W = Math.max(1, W); H = Math.max(1, H);
    $('#csCurrent').textContent = `当前大小：${w0} × ${h0} 像素 → 新建大小：${W} × ${H} 像素`;
    $('#csWhy').textContent = (W < w0 || H < h0) ? '画布变小：超出画布的图层像素会保留在文件里（与 Photoshop 一致，不会被裁掉）' : '';
    return { W, H };
  };
  if (!dlg._bound) {
    dlg._bound = true;
    for (const id of ['#csW', '#csH']) $(id).addEventListener('input', sync);
    $('#csRelative').onchange = () => {
      const rel = $('#csRelative').checked, pct = $('#csUnit').value === 'pct';
      $('#csW').value = rel ? 0 : (pct ? 100 : docW); $('#csH').value = rel ? 0 : (pct ? 100 : docH); sync();
    };
    $('#csUnit').onchange = () => {
      const rel = $('#csRelative').checked, pct = $('#csUnit').value === 'pct';
      $('#csUnit2').textContent = pct ? '百分比' : '像素';
      $('#csW').value = rel ? 0 : (pct ? 100 : docW); $('#csH').value = rel ? 0 : (pct ? 100 : docH); sync();
    };
    $('#csCancel').onclick = () => dlg.close();
    $('#csOk').onclick = () => { const { W, H } = sync(); dlg.close(); const e = ($('#csExt') || {}).value || 'bg';
      if (resizeCanvas(W, H, csAnchorSel, { bg: bgRGB, fg: fgRGB, white: [255, 255, 255], black: [0, 0, 0], gray: [128, 128, 128] }[e]))
        actRecord('canvasSize', { width: W, height: H, h: ['left', 'center', 'right'][csAnchorSel % 3], v: ['top', 'center', 'bottom'][Math.floor(csAnchorSel / 3)] }); };
  }
  $('#csRelative').checked = false; $('#csUnit').value = 'px'; $('#csUnit2').textContent = '像素';
  $('#csW').value = w0; $('#csH').value = h0;
  [...grid.children].forEach(x => x.classList.toggle('on', +x.dataset.anchor === csAnchorSel));
  sync();
  dlg.showModal();
  return true;
}
