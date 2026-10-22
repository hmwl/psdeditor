




import './50-clipboard-merge-mask.js';   
import { compositeAll } from '../../../core/app.js';
import { brushSelection } from '../../../core/selection.js';
import { promptDialog } from '../dialog.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import {
  $, CREATABLE_FX, QUADM, QUADW, SELECT, SELM, createEffectTemplate, createSelection, isEmptySelection, runLazy,
  selectionArea, selectionBounds, selectionValueAt, smoothSelection, trimSelection,
} from './01-boot.js';
import {
  doc, docH, docW, globalLight, globalLightBase, guides, layerDeletes, layerOps, layerRenames, layerReorder,
  layerTree, li, pixelPaint, selection, set_globalLight, set_globalLightDirty, set_guides, set_guidesDirty,
  textCrops, textRenders,
} from './02-doc-state.js';
import { actRecord, pushDocHistory } from './03-history.js';
import { tfFrame } from './06-view-zoom-move.js';
import { applyDocSize, transformableLayers } from './08-doc-size.js';
import { cropExtGen, set_cropExtGen } from './10-crop.js';
import { set_tfState, tfState, tfSyncBar, tfWriteQuad } from './19-free-transform.js';
import { readLazyImageBand } from './21-load-document.js';
import { fxMasterBase, layerFxItems, renderLayerPanel, selLayer } from './23-layers-panel.js';
import {
  addedFxValue, commitLayerOps, dropLayerOp, effFxMaster, humanEditError, opField, opKeyOf, putLayerOp,
  renderProps, setParamField, setSingleOp,
} from './24-layer-ops-queue.js';
import { ensureLayerTransform, transformChanged } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import {
  PREVIEW_EFFECT_MULTI, chanCount, chanSupported, composeDocForOrder, previewCompositeDoc, renderStaticLayers,
} from './30-render.js';
import { fgRGB, mapAuxGeometry } from './31-selection-brush.js';
import {
  combineInto, layerAlphaOnCanvas, sampleRGBA, selReady, setSelection, syncToolOptions,
} from './32-cursors-select-options.js';
import { drawGizmo } from './46-smart-filter-panel.js';
import { compositeNowRGBA } from './50-clipboard-merge-mask.js';
import { docAlphaChannels, docAlphaGray } from './52-alpha-text-menu.js';
















const FX_COPY_COLOR_COMPS = { RGBC: ['Rd  ', 'Grn ', 'Bl  '], LABC: ['Lmnc', 'A   ', 'B   '] };

export let fxClipboard = null;   


function fxCanonOfKey(key){
  for (const canon of Object.keys(CREATABLE_FX)) if (CREATABLE_FX[canon].key === key) return canon;
  return null;
}

function fxDescOf(idx){
  const src = previewCompositeDoc(doc);
  const fx = src && src.layers[idx] && src.layers[idx].effects;
  return fx && typeof fx === 'object' ? fx : null;
}

function fxNodeAt(desc, key, at){
  if (!desc) return null;
  const multi = desc[PREVIEW_EFFECT_MULTI[key]];
  if (Array.isArray(multi)) return multi[at || 0] || null;
  return desc[key] || null;
}

export function fxItemsOf(idx){
  const l = layerTree && layerTree.flat && layerTree.flat[idx];
  return l ? layerFxItems(idx, l) : [];
}

export function fxFileSlotsOf(idx){
  const l = doc && doc.layers[idx];
  const tl = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!l || !tl || !Array.isArray(tl.effects)) return [];
  return tl.effects.map(e => ({ key: e.key, at: e.at || 0 }));
}






function fxValuesFrom(canon, node){
  const tpl = createEffectTemplate(canon);
  const values = {}, notes = [];
  if (!tpl || !node || typeof node !== 'object') return { values, notes, ok: !!tpl };
  const walk = (t, s, path) => {
    if (t === null || typeof t !== 'object') {                       
      if (s !== undefined && s !== null && typeof s !== 'object' && s !== t) values[path] = s;
      return;
    }
    if (Array.isArray(t)) {
      if (!Array.isArray(s)) return;
      if (s.length !== t.length) { notes.push(`${path}（${s.length} 项，模板 ${t.length} 项）`); return; }
      t.forEach((el, i) => walk(el, s[i], path ? `${path}.${i}` : String(i)));
      return;
    }
    if (!s || typeof s !== 'object') return;
    const comps = FX_COPY_COLOR_COMPS[t.__classID];
    if (comps) {                                                     
      if (comps.every(c => Number.isFinite(s[c])) && comps.some(c => s[c] !== t[c]))
        values[path] = Object.fromEntries(comps.map(c => [c, Math.max(-128, Math.min(255, Math.round(s[c])))]));
      return;
    }
    if (t.__unit !== undefined && !Array.isArray(t.values)) {        
      if (Number.isFinite(s.value) && s.value !== t.value) values[path] = s.value;
      return;
    }
    if (t.__enumType !== undefined) {                                
      if (typeof s.value === 'string' && s.value !== t.value) values[path] = s.value;
      return;
    }
    for (const k of Object.keys(t)) {
      if (k.startsWith('__')) continue;
      walk(t[k], s[k], path ? `${path}.${k}` : k);
    }
  };
  walk(tpl, node, '');
  return { values, notes, ok: true };
}


export function copyLayerStyleUI(idx){
  const desc = fxDescOf(idx), items = fxItemsOf(idx);
  if (!desc || !items.length) { $('#notice').textContent = '这个图层没有图层样式可以拷贝。'; return false; }
  const effects = [], skipped = [];
  for (const it of items) {
    const canon = it.canon || fxCanonOfKey(it.key);
    if (!canon) { skipped.push(`${it.label}（内核还不能新建这种效果）`); continue; }
    const node = it.isNew ? null : fxNodeAt(desc, it.key, it.at);
    

    const src = node || fxNodeAt(desc, it.key, 0);
    const { values, notes, ok } = fxValuesFrom(canon, src);
    if (!ok) { skipped.push(`${it.label}（没有默认模板）`); continue; }
    effects.push({ canon, key: it.key, label: it.label, values, notes, enabled: it.on });
  }
  if (!effects.length) { $('#notice').textContent = '这个图层的图层样式一条都拷不过来：' + skipped.join('、'); return false; }
  const scl = desc['Scl '];
  fxClipboard = {
    from: layerRenames[idx] || (layerTree.flat[idx] || {}).name || `图层 ${idx}`,
    master: desc.masterFXSwitch !== false,
    scale: scl && Number.isFinite(scl.value) ? scl.value : null,
    effects,
  };
  const note = skipped.length ? `（跳过 ${skipped.join('、')}）` : '';
  $('#notice').textContent = `已拷贝 ${effects.length} 条图层样式${note}：${effects.map(e => e.label).join('、')}`;
  shell.status($('#notice').textContent);
  renderLayerPanel();
  return true;
}


function dropAllFxOps(idx){
  
  for (const op of (layerOps[idx] || []).slice())
    if (op.op === 'addLayerEffect') dropLayerOp(idx, opKeyOf(op));
  

  const slots = fxFileSlotsOf(idx).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  for (const s of slots) putLayerOp(idx, { op: 'removeLayerEffect', index: idx, effect: s.key, at: s.at });
  
  dropLayerOp(idx, 'setLayerEffectsEnabled');
  dropLayerOp(idx, 'setLayerParams:effects:0');
  for (const s of slots) dropLayerOp(idx, `setLayerEffect:${s.key}:${s.at}`);
  for (const s of slots) dropLayerOp(idx, `setLayerParams:effect:${s.key}:${s.at}`);
}


export function clearLayerStyleUI(targets){
  const picks = targets.filter(i => fxItemsOf(i).length);
  if (!picks.length) { $('#notice').textContent = '选中的图层上没有图层样式。'; return false; }
  pushDocHistory('清除图层样式');
  let n = 0;
  for (const idx of picks) if (commitLayerOps(idx, () => dropAllFxOps(idx))) n++;
  renderLayerPanel(); renderProps();
  $('#notice').textContent = n ? `已清除 ${n} 个图层的图层样式。` : '没能清除（见上方提示）。';
  shell.status($('#notice').textContent);
  return n > 0;
}


export function clearDisabledLayerStyleUI(targets){
  const picks = targets.filter(i => fxItemsOf(i).some(e => !e.on));
  if (!picks.length) { $('#notice').textContent = '选中的图层上没有禁用的图层样式。'; return false; }
  pushDocHistory('清除禁用的图层样式');
  let n = 0;
  for (const idx of picks) {
    const disabled = new Set(fxItemsOf(idx).filter(e => !e.on && !e.isNew).map(e => `${e.key}:${e.at || 0}`));
    const slots = fxFileSlotsOf(idx).filter(s => disabled.has(`${s.key}:${s.at || 0}`)).sort((a, b) => (b.at || 0) - (a.at || 0));
    const ok = commitLayerOps(idx, () => {
      for (const s of slots) putLayerOp(idx, { op: 'removeLayerEffect', index: idx, effect: s.key, at: s.at });
      for (const op of (layerOps[idx] || []).slice()) if (op.op === 'addLayerEffect' && addedFxValue(op, 'enab') === false) dropLayerOp(idx, opKeyOf(op));
      for (const s of slots) { dropLayerOp(idx, `setLayerEffect:${s.key}:${s.at}`); dropLayerOp(idx, `setLayerParams:effect:${s.key}:${s.at}`); }
    });
    if (ok) n++;
  }
  renderLayerPanel(); renderProps();
  $('#notice').textContent = n ? `已清除 ${n} 个图层的禁用样式。` : '没能清除禁用样式（见上方提示）。';
  shell.status($('#notice').textContent); return n > 0;
}


export function pasteLayerStyleUI(targets){
  if (!fxClipboard) { $('#notice').textContent = '剪贴板里没有图层样式（先用「拷贝图层样式」）。'; return false; }
  const docPatIds = new Set((doc && Array.isArray(doc.patterns) ? doc.patterns : []).map(p => p && p.id).filter(Boolean));
  const picks = targets.filter(i => {
    const l = layerTree && layerTree.flat && layerTree.flat[i];
    return l && l.groupType !== 3;
  });
  if (!picks.length) { $('#notice').textContent = '先选中要粘贴到的图层。'; return false; }
  const warn = [];
  pushDocHistory('粘贴图层样式');
  let done = 0;
  for (const idx of picks) {
    const ok = commitLayerOps(idx, () => {
      dropAllFxOps(idx);
      let seq = 0;
      for (const e of fxClipboard.effects) {
        if (e.canon === 'patternOverlay') {
          const id = e.values['Ptrn.Idnt'];
          if (!id || !docPatIds.has(id)) { warn.push(`${e.label}：这份文档里没有它引用的图案，已跳过`); continue; }
        }
        for (const n of e.notes) warn.push(`${e.label} 的 ${n} 抄不过来（新建效果不能改数组长度）`);
        const op = { op: 'addLayerEffect', index: idx, effect: e.canon, seq: seq++ };
        const values = { ...e.values };
        if (e.enabled === false) values.enab = false;
        if (Object.keys(values).length) op.values = values;
        putLayerOp(idx, op);
      }
      

      const hadBlock = fxFileSlotsOf(idx).length > 0;
      if (hadBlock && fxClipboard.master === false)
        putLayerOp(idx, { op: 'setLayerEffectsEnabled', index: idx, enabled: false });
    });
    if (ok) done++;
  }
  renderLayerPanel(); renderProps(); renderStaticLayers();
  const uniq = [...new Set(warn)];
  $('#notice').textContent = `已把「${fxClipboard.from}」的 ${fxClipboard.effects.length} 条样式粘到 ${done} 个图层`
    + (uniq.length ? `；${uniq.join('；')}` : '。');
  shell.status($('#notice').textContent);
  return done > 0;
}


export function hideAllEffectsUI(targets){
  const picks = targets.filter(i => (doc.layers[i] || {}).effects && fxFileSlotsOf(i).length);
  if (!picks.length) { $('#notice').textContent = '选中的图层上没有（文件里的）图层样式可以隐藏。'; return false; }
  const anyOn = picks.some(i => effFxMaster(i, fxMasterBase(i)));
  pushDocHistory(anyOn ? '隐藏所有效果' : '显示所有效果');
  for (const idx of picks)
    setSingleOp(idx, { op: 'setLayerEffectsEnabled', index: idx, enabled: !anyOn }, !anyOn === fxMasterBase(idx));
  renderLayerPanel(); renderProps();
  shell.status(anyOn ? '已隐藏所有效果' : '已显示所有效果');
  return true;
}


export async function scaleEffectsUI(idx){
  const desc = fxDescOf(idx);
  const scl = desc && desc['Scl '];
  const base = scl && Number.isFinite(scl.value) ? scl.value : 100;
  const s = await promptDialog('按百分比缩放这一层的全部图层样式（PS 的「缩放效果」；1…1000%）。',
    String(base), { title: '缩放效果', label: '缩放' });
  if (s === null) return false;
  const v = Math.round(Number(s));
  if (!Number.isFinite(v) || v < 1 || v > 1000) { $('#notice').textContent = '缩放要是 1…1000 之间的百分数。'; return false; }
  if (v === base) return false;
  pushDocHistory('缩放效果');
  const ok = setParamField(idx, 'effects', 0, 'Scl ', v, base);
  renderLayerPanel(); renderProps(); renderStaticLayers();
  if (ok) shell.status(`缩放效果：${base}% → ${v}%`);
  return ok;
}


let globalLightDlgEl = null;
export async function globalLightDialog(){
  if (!doc) return false;
  if (!globalLightDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:300px">'
      + '<h3 class="fp-dlg-title">全局光</h3>'
      + '<div class="glDlg-body"></div>'
      + '<p class="glDlg-hint" style="opacity:.7;font-size:12px;margin:6px 0 0"></p>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    globalLightDlgEl = dlg;
  }
  const body = globalLightDlgEl.querySelector('.glDlg-body');
  body.innerHTML = '';
  const field = (label, value, min, max) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    const sp = document.createElement('span'); sp.textContent = label; sp.style.minWidth = '48px';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = '1'; inp.min = String(min); inp.max = String(max); inp.value = String(value);
    inp.style.flex = '1';
    row.append(sp, inp); body.append(row);
    return inp;
  };
  const angleEl = field('角度', globalLight.angle, -360, 360);
  const altEl = field('高度', globalLight.altitude, 0, 90);
  
  const followers = globalLightFollowers();
  globalLightDlgEl.querySelector('.glDlg-hint').textContent = followers.length
    ? `这份文档里有 ${followers.length} 条效果勾了「使用全局光」，确定后它们的角度会一起改。`
    : '这份文档里还没有勾「使用全局光」的效果：改动只写进文档的全局光设置（图像资源 1037 / 1049）。';
  return await new Promise(res => {
    const ok = globalLightDlgEl.querySelector('.fp-dlg-ok');
    const cancel = globalLightDlgEl.querySelector('.fp-dlg-cancel');
    const done = v => { try { globalLightDlgEl.close(); } catch { globalLightDlgEl.removeAttribute('open'); } res(v); };
    ok.onclick = () => {
      const a = Math.round(Number(angleEl.value)), h = Math.round(Number(altEl.value));
      if (!Number.isFinite(a) || a < -360 || a > 360 || !Number.isFinite(h) || h < 0 || h > 90) {
        $('#notice').textContent = '全局光：角度 -360…360，高度 0…90。'; done(false); return;
      }
      done(applyGlobalLight(a, h));
    };
    cancel.onclick = () => done(false);
    globalLightDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!globalLightDlgEl.open) { if (globalLightDlgEl.showModal) globalLightDlgEl.showModal(); else globalLightDlgEl.setAttribute('open', ''); } }
    catch { globalLightDlgEl.setAttribute('open', ''); }
  });
}

function globalLightFollowers(){
  const out = [];
  if (!doc) return out;
  const flat = (layerTree && layerTree.flat) || [];
  for (let i = 0; i < doc.layers.length; i++) {
    const desc = doc.layers[i] && doc.layers[i].effects;
    if (!desc || typeof desc !== 'object') continue;
    const tl = flat[i];
    for (const e of (tl && Array.isArray(tl.effects) ? tl.effects : [])) {
      const node = fxNodeAt(desc, e.key, e.at || 0);
      if (!node || node.uglg !== true) continue;
      out.push({ index: i, key: e.key, at: e.at || 0,
                 angle: node.lagl && Number.isFinite(node.lagl.value) ? node.lagl.value : null,
                 altitude: node.Lald && Number.isFinite(node.Lald.value) ? node.Lald.value : null });
    }
  }
  return out;
}

function applyGlobalLight(angle, altitude){
  if (angle === globalLight.angle && altitude === globalLight.altitude) return false;
  const followers = globalLightFollowers();
  pushDocHistory('全局光');
  set_globalLight({ angle, altitude });
  set_globalLightDirty(!(angle === globalLightBase.angle && altitude === globalLightBase.altitude));
  let n = 0;
  for (const f of followers) {
    const tgt = `effect:${f.key}`;
    if (f.angle !== null && f.angle !== angle) { setParamField(f.index, tgt, f.at, 'lagl', angle, f.angle); n++; }
    if (f.altitude !== null && f.altitude !== altitude) { setParamField(f.index, tgt, f.at, 'Lald', altitude, f.altitude); n++; }
  }
  renderLayerPanel(); renderProps(); renderStaticLayers();
  shell.status(`全局光：${angle}° / 高度 ${altitude}°` + (n ? `（刷新了 ${n} 项效果角度）` : ''));
  return true;
}












function contentBoundsAll(){
  if (!doc) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < doc.layers.length; i++) {
    if (layerDeletes.has(i)) continue;
    const l = doc.layers[i];
    if (!l || l.hidden) continue;
    const t = transformChanged(i);
    let pts;
    if (t) pts = tfFrame(t).corners;
    else {
      const b = l.bounds;
      if (!b || b.right <= b.left || b.bottom <= b.top) continue;
      pts = [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]];
    }
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
  }
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
}


export function mapCanvasGeometry(fn){
  for (const i of transformableLayers()) {
    const t = ensureLayerTransform(i);
    const q = tfFrame(t).corners.map(fn);
    if (QUADM) tfWriteQuad(i, q);
    else {                                   
      const p0 = fn([t.x, t.y]);
      t.x = Math.round(p0[0]); t.y = Math.round(p0[1]);
    }
  }
}


export function rotateCanvas(deg, label){
  if (!doc || li) return false;
  const d = ((deg % 360) + 360) % 360;
  if (!d) return false;
  const a = d * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  
  const w = Math.max(1, Math.min(30000, Math.round(Math.abs(docW * cos) + Math.abs(docH * sin))));
  const h = Math.max(1, Math.min(30000, Math.round(Math.abs(docW * sin) + Math.abs(docH * cos))));
  const cx = docW / 2, cy = docH / 2, ox = cx - w / 2, oy = cy - h / 2;
  const map = p => { const dx = p[0] - cx, dy = p[1] - cy; return [cx + dx * cos - dy * sin - ox, cy + dx * sin + dy * cos - oy]; };
  pushDocHistory(label || '旋转画布');
  mapCanvasGeometry(map);
  mapAuxGeometry(map);
  
  if (d % 90 === 0) {
    const swap = d % 180 !== 0;
    set_guides(guides.map(g => {
      const p = g.vertical ? map([g.px, cy]) : map([cx, g.px]);
      return { vertical: swap ? !g.vertical : g.vertical, px: Math.round((swap ? (g.vertical ? p[1] : p[0]) : (g.vertical ? p[0] : p[1]))) };
    }).filter(g => g.px >= 0 && g.px <= (g.vertical ? w : h)));
  } else if (guides.length) set_guides([]);
  set_guidesDirty(true);
  set_cropExtGen(cropExtGen + 1);
  applyDocSize(w, h);
  shell.status(`画布旋转 ${d}°：${w} × ${h} 像素`);
  return true;
}


export function flipCanvas(axis){
  if (!doc || li) return false;
  const horiz = axis === 'x';
  pushDocHistory(horiz ? '水平翻转画布' : '垂直翻转画布');
  for (const i of transformableLayers()) {
    const t = ensureLayerTransform(i);
    const c = tfFrame(t).corners.map(p => horiz ? [docW - p[0], p[1]] : [p[0], docH - p[1]]);
    


    const q = horiz ? [c[1], c[0], c[3], c[2]] : [c[3], c[2], c[1], c[0]];
    if (QUADM) tfWriteQuad(i, q);
    if (horiz) t.flipX = !t.flipX; else t.flipY = !t.flipY;
  }
  mapAuxGeometry(p=>horiz?[docW-p[0],p[1]]:[p[0],docH-p[1]]);
  set_guides(guides.map(g => ({ ...g, px: (g.vertical === horiz) ? Math.round((horiz ? docW : docH) - g.px) : g.px })));
  set_guidesDirty(true);
  set_cropExtGen(cropExtGen + 1);
  applyDocSize(docW, docH);                    
  shell.status(horiz ? '已水平翻转画布' : '已垂直翻转画布');
  return true;
}


export function revealAllCanvas(){
  if (!doc || li) return false;
  const b = contentBoundsAll();
  if (!b) { $('#notice').textContent = '没有可见内容。'; return false; }
  const x0 = Math.min(0, b.x), y0 = Math.min(0, b.y);
  const w = Math.max(docW, b.x + b.w) - x0, h = Math.max(docH, b.y + b.h) - y0;
  if (x0 === 0 && y0 === 0 && w === docW && h === docH) { $('#notice').textContent = '所有内容都已经在画布里了。'; return false; }
  pushDocHistory('显示全部');
  mapCanvasGeometry(p => [p[0] - x0, p[1] - y0]);
  mapAuxGeometry(p=>[p[0]-x0,p[1]-y0]);
  set_guides(guides.map(g => ({ ...g, px: g.px - (g.vertical ? x0 : y0) })));
  set_guidesDirty(true);
  set_cropExtGen(cropExtGen + 1);
  applyDocSize(Math.min(30000, w), Math.min(30000, h));
  shell.status(`显示全部：画布扩到 ${docW} × ${docH} 像素`);
  return true;
}



let trimDlgEl = null;
function trimBounds(basis, sides){
  const img = compositeNowRGBA();
  const at = (x, y) => { const o = (y * docW + x) * 4; return [img[o], img[o + 1], img[o + 2], img[o + 3]]; };
  const ref = basis === 'transparent' ? null : (basis === 'topLeft' ? at(0, 0) : at(docW - 1, docH - 1));
  const keep = (x, y) => {
    const p = at(x, y);
    if (!ref) return p[3] > 0;                                  
    if (!p[3] && !ref[3]) return false;
    return p[0] !== ref[0] || p[1] !== ref[1] || p[2] !== ref[2] || p[3] !== ref[3];
  };
  const rowHas = y => { for (let x = 0; x < docW; x++) if (keep(x, y)) return true; return false; };
  const colHas = x => { for (let y = 0; y < docH; y++) if (keep(x, y)) return true; return false; };
  let top = 0, bottom = docH - 1, left = 0, right = docW - 1;
  while (top <= bottom && !rowHas(top)) top++;
  if (top > bottom) return null;                                
  while (bottom > top && !rowHas(bottom)) bottom--;
  while (left <= right && !colHas(left)) left++;
  while (right > left && !colHas(right)) right--;
  return {
    x: sides.left ? left : 0,
    y: sides.top ? top : 0,
    w: (sides.right ? right + 1 : docW) - (sides.left ? left : 0),
    h: (sides.bottom ? bottom + 1 : docH) - (sides.top ? top : 0),
  };
}
export async function trimCanvasDialog(){
  if (!doc || li) return false;
  if (!trimDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:300px">'
      + '<h3 class="fp-dlg-title">裁切</h3>'
      + '<div class="trimDlg-body"></div>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    trimDlgEl = dlg;
  }
  const body = trimDlgEl.querySelector('.trimDlg-body');
  body.innerHTML = '';
  const group = (title) => { const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'margin:8px 0 4px;opacity:.75;font-size:12px'; body.append(h); };
  group('基于');
  const radios = [['transparent', '透明像素'], ['topLeft', '左上角像素颜色'], ['bottomRight', '右下角像素颜色']].map(([v, label], k) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 2px;cursor:pointer';
    const r = document.createElement('input'); r.type = 'radio'; r.name = 'trimBasis'; r.value = v; r.checked = k === 0;
    r.dataset.attr = 'trim-basis';
    row.append(r, Object.assign(document.createElement('span'), { textContent: label }));
    body.append(row);
    return r;
  });
  group('裁切掉');
  const sides = [['top', '顶'], ['bottom', '底'], ['left', '左'], ['right', '右']].map(([v, label]) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 2px;cursor:pointer';
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = true; c.dataset.attr = 'trim-side'; c.value = v;
    row.append(c, Object.assign(document.createElement('span'), { textContent: label }));
    body.append(row);
    return { v, c };
  });
  return await new Promise(res => {
    const ok = trimDlgEl.querySelector('.fp-dlg-ok');
    const cancel = trimDlgEl.querySelector('.fp-dlg-cancel');
    const done = v => { try { trimDlgEl.close(); } catch { trimDlgEl.removeAttribute('open'); } res(v); };
    ok.onclick = () => {
      const basis = (radios.find(r => r.checked) || radios[0]).value;
      const pick = Object.fromEntries(sides.map(s => [s.v, s.c.checked]));
      done(QUADM ? applyTrim(basis, pick) : runLazy(QUADW, '裁切', () => applyTrim(basis, pick)));
    };
    cancel.onclick = () => done(false);
    trimDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!trimDlgEl.open) { if (trimDlgEl.showModal) trimDlgEl.showModal(); else trimDlgEl.setAttribute('open', ''); } }
    catch { trimDlgEl.setAttribute('open', ''); }
  });
}
export function applyTrim(basis, sides){
  if (!sides.top && !sides.bottom && !sides.left && !sides.right) { $('#notice').textContent = '四条边一条都没勾：没有要裁掉的。'; return false; }
  const r = trimBounds(basis, sides);
  if (!r) { $('#notice').textContent = '按这个判据整幅画布都会被裁光，已放弃。'; return false; }
  if (r.x === 0 && r.y === 0 && r.w === docW && r.h === docH) { $('#notice').textContent = '没有可裁掉的边。'; return false; }
  pushDocHistory('裁切');
  actRecord('trim', { basis });
  mapCanvasGeometry(p => [p[0] - r.x, p[1] - r.y]);
  mapAuxGeometry(p=>[p[0]-r.x,p[1]-r.y]);
  set_guides(guides.map(g => ({ ...g, px: g.px - (g.vertical ? r.x : r.y) })).filter(g => g.px >= 0 && g.px <= (g.vertical ? r.w : r.h)));
  set_guidesDirty(true);
  set_cropExtGen(cropExtGen + 1);
  applyDocSize(r.w, r.h);
  shell.status(`裁切：${r.w} × ${r.h} 像素（裁掉 左${r.x} 上${r.y}）`);
  return true;
}









const RS_BITS = 6, RS_SIZE = 1 << RS_BITS, RS_STEP = 256 >> RS_BITS;
function rsDilateAxis(grid, r, axis) {
  const S = RS_SIZE, line = new Int32Array(S), tmp = new Uint8Array(S);
  const idx = (a, b, c) => axis === 0 ? (c * S + a) * S + b : axis === 1 ? (a * S + c) * S + b : (a * S + b) * S + c;
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
    for (let c = 0; c < S; c++) tmp[c] = grid[idx(a, b, c)];
    let last = -1e9;
    for (let c = 0; c < S; c++) { if (tmp[c]) last = c; line[c] = c - last; }
    last = 1e9;
    for (let c = S - 1; c >= 0; c--) { if (tmp[c]) last = c; if (last - c < line[c]) line[c] = last - c; }
    for (let c = 0; c < S; c++) if (line[c] <= r) grid[idx(a, b, c)] = 1;
  }
}
const rsFullSel = (sel) => !!(sel && sel.x === 0 && sel.y === 0 && sel.width === docW && sel.height === docH
  && sel.data?.__virtual && !sel.data.__tiles.size && !sel.data.__base && !sel.data.__neg && (sel.data.__fill | 0) === 255);
async function buildReselectGrid(sel, tol) {
  const grid = new Uint8Array(RS_SIZE * RS_SIZE * RS_SIZE);
  if (rsFullSel(sel)) { grid.fill(1); return grid; }
  const b = selectionBounds(sel); if (!b) return grid;
  const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(docW, b.x + b.width), y1 = Math.min(docH, b.y + b.height);
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const stride = Math.max(1, Math.floor(Math.sqrt(area / 4e6)));
  for (let yy = y0; yy < y1; yy += 256) {
    const h = Math.min(256, y1 - yy);
    const rgba = await sampleLazyBandRGBA(yy, h, true);
    for (let y = yy; y < yy + h; y++) {
      if ((y - y0) % stride) continue;
      for (let x = x0; x < x1; x += stride) {
        if (selectionValueAt(sel, x, y) <= 0) continue;
        const o = ((y - yy) * docW + x) * 4;
        grid[((rgba[o] >> 2) * RS_SIZE + (rgba[o + 1] >> 2)) * RS_SIZE + (rgba[o + 2] >> 2)] = 1;
      }
    }
    await new Promise(r => setTimeout(r, 0));
  }
  const r = Math.max(0, Math.round(tol / RS_STEP));
  if (r > 0) for (let axis = 0; axis < 3; axis++) rsDilateAxis(grid, r, axis);
  return grid;
}
const rsHit = (grid, r, g, b) => grid[((r >> 2) * RS_SIZE + (g >> 2)) * RS_SIZE + (b >> 2)];
async function reselectLazy(sel, tol, similar) {
  const grid = await buildReselectGrid(sel, tol);
  if (rsFullSel(sel)) return sel;
  const b = selectionBounds(sel); if (!b) return null;
  const sx0 = Math.max(0, b.x), sy0 = Math.max(0, b.y), sx1 = Math.min(docW, b.x + b.width), sy1 = Math.min(docH, b.y + b.height);
  if (similar) {
    const cols = Math.ceil(docW / 256), tiles = new Map();
    for (let yy = 0; yy < docH; yy += 256) {
      const h = Math.min(256, docH - yy);
      const rgba = await sampleLazyBandRGBA(yy, h, true);
      for (let y = yy; y < yy + h; y++) for (let x = 0; x < docW; x++) {
        const o = ((y - yy) * docW + x) * 4;
        let v = rsHit(grid, rgba[o], rgba[o + 1], rgba[o + 2]) ? 255 : 0;
        if (v !== 255 && x >= sx0 && x < sx1 && y >= sy0 && y < sy1) v = selectionValueAt(sel, x, y);
        else if (v === 255 && x >= sx0 && x < sx1 && y >= sy0 && y < sy1) {
          const c = selectionValueAt(sel, x, y); if (c > v) v = c;
        }
        if (!v) continue;
        const tx = (x / 256) | 0, ty = (y / 256) | 0, k = ty * cols + tx;
        let t = tiles.get(k); if (!t) { t = new Uint8Array(256 * 256); tiles.set(k, t); }
        t[(y % 256) * 256 + (x % 256)] = v;
      }
      await new Promise(r => setTimeout(r, 0));
    }
    return trimSelection(brushSelection(docW, docH, tiles, null));
  }
  return growLazy(sel, grid, { x0: sx0, y0: sy0, x1: sx1, y1: sy1 });
}

async function growLazy(sel, grid, box) {
  const cols = Math.ceil(docW / 256), tiles = new Map();
  const bands = new Map(), order = [];
  const bandKey = y => Math.floor(y / 256) * 256;
  const bandSync = y => bands.get(bandKey(y)) || null;
  const ensureBand = async y => {
    const sy = bandKey(y);
    if (bands.has(sy)) return bands.get(sy);
    const band = await sampleLazyBandRGBA(sy, Math.min(256, docH - sy), true);
    bands.set(sy, band); order.push(sy);
    while (order.length > 6) bands.delete(order.shift());
    return band;
  };
  const baseTile = (tx, ty) => {
    const k = ty * cols + tx;
    let t = tiles.get(k); if (t) return t;
    t = new Uint8Array(256 * 256);
    const gx0 = tx * 256, gy0 = ty * 256;
    const gx1 = Math.min(docW, gx0 + 256), gy1 = Math.min(docH, gy0 + 256);
    if (gx1 > box.x0 && gy1 > box.y0 && gx0 < box.x1 && gy0 < box.y1) {
      const d = sel.data, sparse = !!(d && d.__virtual);
      if (sparse && !d.__base && !d.__neg && !d.__brushBase && !d.__tiles.size) t.fill(d.__fill | 0);
      else for (let y = gy0; y < gy1; y++) for (let x = gx0; x < gx1; x++)
        t[(y - gy0) * 256 + x - gx0] = selectionValueAt(sel, x, y);
    }
    tiles.set(k, t);
    return t;
  };
  const filled = (x, y) => {
    const t = tiles.get(((y / 256) | 0) * cols + ((x / 256) | 0));
    return t ? t[(y % 256) * 256 + (x % 256)] > 0 : false;
  };
  const selected = (x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1 && selectionValueAt(sel, x, y) > 0;
  const hitBand = (band, x, y) => {
    const o = ((y - bandKey(y)) * docW + x) * 4;
    return rsHit(grid, band[o], band[o + 1], band[o + 2]);
  };
  const eligibleAt = (x, y) => {
    if (filled(x, y) || selected(x, y)) return false;
    const band = bandSync(y);
    return band ? hitBand(band, x, y) : false;
  };
  const fill = (x, y) => {
    const tx = (x / 256) | 0, ty = (y / 256) | 0;
    baseTile(tx, ty)[(y % 256) * 256 + (x % 256)] = 255;
  };
  const stack = [];
  for (const r of SELM.selectionBorderTiles(sel, 1)) {
    const x0 = Math.max(r.x, box.x0), x1 = Math.min(r.x + r.width, box.x1);
    const y0 = Math.max(r.y, box.y0), y1 = Math.min(r.y + r.height, box.y1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!selected(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
        await ensureBand(ny);
        if (eligibleAt(nx, ny)) stack.push(ny * docW + nx);
      }
    }
  }
  let guard = 0;
  while (stack.length) {
    const i = stack.pop(), y = (i / docW) | 0, x = i - y * docW;
    if (filled(x, y) || selected(x, y)) continue;
    if ((guard++ & 1023) === 0) await new Promise(r => setTimeout(r, 0));
    const band = await ensureBand(y);
    const hit = xx => hitBand(band, xx, y);
    if (!hit(x)) continue;
    let lx = x, rx = x;
    while (lx > 0 && !filled(lx - 1, y) && !selected(lx - 1, y) && hit(lx - 1)) lx--;
    while (rx < docW - 1 && !filled(rx + 1, y) && !selected(rx + 1, y) && hit(rx + 1)) rx++;
    for (let xx = lx; xx <= rx; xx++) if (!selected(xx, y)) fill(xx, y);
    for (const dy of [-1, 1]) {
      const ny = y + dy; if (ny < 0 || ny >= docH) continue;
      await ensureBand(ny);
      let inRun = false;
      for (let xx = lx; xx <= rx; xx++) {
        const ok = eligibleAt(xx, ny);
        if (ok && !inRun) { stack.push(ny * docW + xx); inRun = true; }
        else if (!ok) inRun = false;
      }
    }
  }
  return trimSelection(brushSelection(docW, docH, tiles, sel));
}

function reselectSampling(){
  const all = $('#wandAll').checked;
  if (!all && selLayer < 0) { $('#err').textContent = '按「当前图层」取样：先选中一个图层，或勾上魔棒选项里的「取样全部图层」。'; return null; }
  return { rgba: sampleRGBA(all), tolerance: Math.max(0, Math.min(255, +$('#wandTol').value || 0)) };
}
export function growSelUI(similar){
  if (!selection || !SELM) return false;
  const tol = Math.max(0, Math.min(255, +$('#wandTol').value || 0));
  const label = similar ? '选取相似' : '扩大选取';
  if (docW * docH > 64e6) {
    const before = selection;
    shell.status(`${label}：正在按行带扫描 ${docW}×${docH}…`);
    return reselectLazy(before, tol, similar).then(next => {
      if (selection !== before) return false;
      if (!next || isEmptySelection(next)) { setSelection(null); shell.status(`${label}：没有可扩展的像素`); return true; }
      setSelection(next, { label });
      $('#err').textContent = '';
      shell.status(`${label}：容差 ${tol}（颜色按 4 级量化，容差取 4 的倍数）`);
      return true;
    }).catch(e => { $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e); return false; });
  }
  const s = reselectSampling();
  if (!s) return false;
  try {
    const fn = similar ? SELM.similarSelection : SELM.growSelection;
    const next = fn(selection, s.rgba, docW, docH, { tolerance: s.tolerance });
    setSelection(next, { label });
    $('#err').textContent = '';
    shell.status(`${label}：容差 ${s.tolerance}（颜色按 4 级量化，容差取 4 的倍数）`);
    return true;
  } catch (e) { $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e); return false; }
}
export function borderSelUI(px){
  if (!selection || !SELM || !(px > 0)) return;
  try { setSelection(SELM.borderSelection(selection, px), { label: '边界' }); }
  catch (e) { $('#notice').textContent = e && e.message || String(e); }
}
export function smoothSelUI(px){
  if (!selection || !SELM || !(px > 0)) return;
  try { setSelection(smoothSelection(selection, px), { label: '平滑' }); }
  catch (e) { $('#notice').textContent = e && e.message || String(e); }
}






export function tfBeginSelectionOutline(kind){
  if (!selection) { shell.status('先建立一个选区'); return false; }
  const b = selectionBounds(selection);
  if (!(b && b.width > 0 && b.height > 0)) { shell.status('选区是空的'); return false; }
  const base = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
  if (b.width * b.height > 16e6) {

    pushDocHistory('变换选区');
    set_tfState({
      refShown: !!PREF.get('tools.showRefPoint'), idx: selLayer, kind, ref: 4, dragging: false, pushed: true, affine: true,
      base: base.map(p => p.slice()), orig: {},
      num: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 }, vector: null,
      selOnly: { huge: true, bbox: b, quad: base.map(p => p.slice()), before: selection },
    });
    QUADW.load().then(() => { tfSyncBar(); drawGizmo(); }).catch(() => {});
    document.querySelector('.app').classList.add('transforming');
    syncToolOptions(); tfSyncBar(); drawGizmo();
    return true;
  }
  
  const src = { data: new Uint8ClampedArray(b.width * b.height * 4), width: b.width, height: b.height };
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++)
    src.data[(y * b.width + x) * 4 + 3] = selectionValueAt(selection, b.x + x, b.y + y);
  pushDocHistory('变换选区');
  set_tfState({
    refShown: !!PREF.get('tools.showRefPoint'),   
    idx: selLayer, kind, ref: 4, dragging: false, pushed: true, affine: true,
    base: base.map(p => p.slice()), orig: {},
    num: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, skewX: 0, skewY: 0 }, vector: null,
    selOnly: { src, quad: base.map(p => p.slice()), before: selection },
  });
  QUADW.load().then(() => { tfSyncBar(); drawGizmo(); }).catch(() => {});
  document.querySelector('.app').classList.add('transforming');
  syncToolOptions(); tfSyncBar(); drawGizmo();
  return true;
}

function tfWarpSelectionHuge(S){
  const b = S.bbox, before = S.before;
  const [q0, q1, q2, q3] = S.quad;
  const e = 1e-6;
  const dx = q0[0] - b.x, dy = q0[1] - b.y;

  if (Math.abs(q1[1] - q0[1]) < e && Math.abs(q3[0] - q0[0]) < e
      && Math.abs((q1[0] - q0[0]) - b.width) < e && Math.abs((q3[1] - q0[1]) - b.height) < e
      && Math.abs(q2[0] - q1[0]) < e && Math.abs(q2[1] - q3[1]) < e) {
    const nx = Math.round(b.x + dx), ny = Math.round(b.y + dy);
    if (nx >= 0 && ny >= 0 && nx + b.width <= docW && ny + b.height <= docH)
      return { ...before, x: nx, y: ny };
  }
  const fwd = QUADM.quadMatrix(b.width, b.height, S.quad);
  if (!fwd) return null;
  const inv = QUADM.invert3(fwd); if (!inv) return null;
  const box = QUADM.quadBounds(S.quad, { x: 0, y: 0, width: docW, height: docH });
  if (!(box.width > 0 && box.height > 0)) return null;
  const TS = 256, cols = Math.ceil(box.width / TS), tiles = new Map();
  for (let ty = 0; ty < box.height; ty += TS) for (let tx = 0; tx < box.width; tx += TS) {
    const gx = box.x + tx, gy = box.y + ty;
    const tw = Math.min(TS, box.width - tx), th = Math.min(TS, box.height - ty);
    let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;

    for (const [px, py] of [[gx, gy], [gx + tw, gy], [gx, gy + th], [gx + tw, gy + th], [gx + tw / 2, gy], [gx + tw / 2, gy + th], [gx, gy + th / 2], [gx + tw, gy + th / 2]]) {
      const p = QUADM.applyMatrix(inv, px, py); if (!p) continue;
      sx0 = Math.min(sx0, p[0]); sy0 = Math.min(sy0, p[1]);
      sx1 = Math.max(sx1, p[0]); sy1 = Math.max(sy1, p[1]);
    }
    if (!Number.isFinite(sx0)) continue;
    sx0 = Math.max(0, Math.floor(sx0) - 2); sy0 = Math.max(0, Math.floor(sy0) - 2);
    sx1 = Math.min(b.width, Math.ceil(sx1) + 2); sy1 = Math.min(b.height, Math.ceil(sy1) + 2);
    const cw = sx1 - sx0, ch = sy1 - sy0;
    if (!(cw > 0 && ch > 0)) continue;
    const src = { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch };
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++)
      src.data[(y * cw + x) * 4 + 3] = selectionValueAt(before, b.x + sx0 + x, b.y + sy0 + y);
    const q = [[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1]]
      .map(([x, y]) => QUADM.applyMatrix(fwd, x, y));
    if (q.some(p => !p)) continue;
    const r = QUADM.warpQuad(src, q, { samples: 2, clip: { x: gx, y: gy, width: tw, height: th } });
    if (!r) continue;
    const t = new Uint8Array(TS * TS);
    let any = false;
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
      const v = r.data[(y * r.width + x) * 4 + 3];
      const X = r.x + x - gx, Y = r.y + y - gy;
      if (v && X >= 0 && Y >= 0 && X < tw && Y < th) { t[Y * TS + X] = v; any = true; }
    }
    if (any) tiles.set(((ty / TS) | 0) * cols + ((tx / TS) | 0), t);
  }
  return SELM.selectionFromTiles(box.x, box.y, box.width, box.height, tiles, 0, docW, docH);
}

export function tfSelOnlyApply(fast){
  const S = tfState && tfState.selOnly; if (!S || !QUADM) return;
  if (S.huge) {
    if (fast) return;
    const next = tfWarpSelectionHuge(S);
    setSelection(next && !isEmptySelection(next) ? next : null, { history: false, props: false });
    return;
  }
  const r = QUADM.warpQuad(S.src, S.quad, { samples: fast ? 1 : 2 });
  if (!r) return;

  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(docW, r.x + r.width), y1 = Math.min(docH, r.y + r.height);
  if (!(x1 > x0 && y1 > y0)) { setSelection(null, { history: false, props: false }); return; }
  const data = new Uint8Array((x1 - x0) * (y1 - y0));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
    data[(y - y0) * (x1 - x0) + (x - x0)] = r.data[((y - r.y) * r.width + (x - r.x)) * 4 + 3];
  const next = trimSelection({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, data, docW, docH });
  setSelection(isEmptySelection(next) ? null : next, { history: false, props: false });
}





async function sampleLazyBandRGBA(y0, h, all = true) {
  const out = new Uint8ClampedArray(docW * h * 4);
  const over = (r, g, b, a, q, op) => {
    const sa = a / 255 * op; if (!(sa > 0)) return;
    const da = out[q + 3] / 255, oa = sa + da * (1 - sa); if (!(oa > 0)) return;
    out[q] = Math.round((r * sa + out[q] * da * (1 - sa)) / oa);
    out[q + 1] = Math.round((g * sa + out[q + 1] * da * (1 - sa)) / oa);
    out[q + 2] = Math.round((b * sa + out[q + 2] * da * (1 - sa)) / oa);
    out[q + 3] = Math.round(oa * 255);
  };
  const ids = all ? displayOrder() : (selLayer >= 0 ? [selLayer] : []);
  for (const i of ids) {
    const l = doc.layers[i]; if (!l || l.hidden) continue;
    const op = all ? ((l.opacity ?? 255) / 255) * ((l.fillOpacity ?? 255) / 255) : 1;
    if (!(op > 0)) continue;
    const b = l.bounds || { left: 0, top: 0 }, L = b.left | 0, T = b.top | 0;
    const w = l.width | 0, lh = l.height | 0;
    const xa = Math.max(0, L), xb = Math.min(docW, L + w), ya = Math.max(y0, T), yb = Math.min(y0 + h, T + lh);
    const tc = textRenders[i] && textCrops[i];
    if (tc?.rgba) {
      const tb = tc.bounds, tw = tb.right - tb.left, th = tb.bottom - tb.top;
      const ta = Math.max(y0, tb.top), tz = Math.min(y0 + h, tb.bottom);
      for (let y = ta; y < tz; y++) for (let x = Math.max(0, tb.left); x < Math.min(docW, tb.right); x++) {
        const s = ((y - tb.top) * tw + (x - tb.left)) * 4;
        over(tc.rgba[s], tc.rgba[s + 1], tc.rgba[s + 2], tc.rgba[s + 3], ((y - y0) * docW + x) * 4, op);
      }
    } else if (l.rgba && w > 0 && lh > 0 && xb > xa && yb > ya) {
      for (let y = ya; y < yb; y++) {
        const so = (y - T) * w;
        for (let x = xa; x < xb; x++) {
          const s = (so + x - L) * 4;
          over(l.rgba[s], l.rgba[s + 1], l.rgba[s + 2], l.rgba[s + 3], ((y - y0) * docW + x) * 4, op);
        }
      }
    } else if ((l.lazyTileStore || l.lazyPixelOps?.length || l.lazyImage || l.lazyRasterFile || l.lazyChannels) && xb > xa && yb > ya) {
      const band = await readLazyImageBand(l, ya - T, yb - ya);
      if (band) {
        for (let yy = 0; yy < band.height; yy++) {
          const so = yy * band.width;
          for (let x = xa; x < xb; x++) {
            const s = (so + x - L) * 4;
            over(band.data[s], band.data[s + 1], band.data[s + 2], band.data[s + 3], ((ya + yy - y0) * docW + x) * 4, op);
          }
        }
      } else if (l.lazyPreview?.data?.length) {
        const pw = l.lazyPreview.width, ph = l.lazyPreview.height, p = l.lazyPreview.data;
        const kx = pw / Math.max(1, w), ky = ph / Math.max(1, lh);
        for (let y = ya; y < yb; y++) {
          const py = Math.min(ph - 1, Math.max(0, Math.floor((y - T) * ky)));
          for (let x = xa; x < xb; x++) {
            const px = Math.min(pw - 1, Math.max(0, Math.floor((x - L) * kx)));
            const s = (py * pw + px) * 4;
            over(p[s], p[s + 1], p[s + 2], p[s + 3], ((y - y0) * docW + x) * 4, op);
          }
        }
      }
    }

    const tiles = pixelPaint[i]?.sparse?.tiles;
    if (tiles?.size) {
      const left = pixelPaint[i].left | 0, top = pixelPaint[i].top | 0;
      for (const t of tiles.values()) {
        const ty0 = Math.max(y0, top + t.y), ty1 = Math.min(y0 + h, top + t.y + t.height);
        if (ty1 <= ty0) continue;
        const tx0 = Math.max(0, left + t.x), tx1 = Math.min(docW, left + t.x + t.width);
        for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
          const s = ((y - top - t.y) * t.width + (x - left - t.x)) * 4;
          over(t.data[s], t.data[s + 1], t.data[s + 2], t.data[s + 3], ((y - y0) * docW + x) * 4, op);
        }
      }
    }
  }
  return out;
}

async function colorRangeLazy(colors, fz, invert, state, job) {
  const hi = fz * 2 || 1, cols = Math.ceil(docW / 256), tiles = new Map();
  let any = false;
  for (let y0 = 0; y0 < docH; y0 += 256) {
    if (colorRangeState !== state || state.job !== job) return null;
    const h = Math.min(256, docH - y0);
    const rgba = await sampleLazyBandRGBA(y0, h, true);
    for (let yy = 0; yy < h; yy++) {
      const gy = y0 + yy;
      for (let x = 0; x < docW; x++) {
        const o = (yy * docW + x) * 4;
        let best = 255;
        for (const c of colors) {
          let d = Math.abs(rgba[o] - c[0]);
          const g = Math.abs(rgba[o + 1] - c[1]); if (g > d) d = g;
          const b = Math.abs(rgba[o + 2] - c[2]); if (b > d) d = b;
          if (d < best) best = d;
          if (!best) break;
        }
        let v = best <= fz ? 255 : (best >= hi ? 0 : Math.round(255 * (hi - best) / (hi - fz)));
        if (invert) v = 255 - v;
        if (!v) continue;
        const tx = (x / 256) | 0, ty = (gy / 256) | 0, k = ty * cols + tx;
        let t = tiles.get(k);
        if (!t) { t = new Uint8Array(256 * 256); tiles.set(k, t); }
        t[((gy % 256) * 256) + (x % 256)] = v; any = true;
      }
    }
    await new Promise(r => setTimeout(r, 0));
  }
  if (!any) return null;
  return trimSelection(brushSelection(docW, docH, tiles, null));
}


export let colorRangeDlgEl = null, colorRangeState = null;
export function openColorRangeDialog(opts = {}){
  if (!doc || li) return false;
  if (!colorRangeDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:330px">'
      + '<h3 class="fp-dlg-title">色彩范围</h3>'
      + '<div class="crDlg-body"></div>'
      + '<p class="crDlg-hint" style="opacity:.7;font-size:12px;margin:6px 0 0">'
      + '选择：取样颜色（PS 的红/黄/绿…与肤色是另一套判据，还没做，所以不列在这里）。'
      + '开着这个框时在画布上点一下 = 取样。</p>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    colorRangeDlgEl = dlg;
  }
  const body = colorRangeDlgEl.querySelector('.crDlg-body');
  body.innerHTML = '';
  const row = (label) => { const r = document.createElement('label');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    r.append(Object.assign(document.createElement('span'), { textContent: label, style: 'min-width:64px' }));
    body.append(r); return r; };
  const swatch = document.createElement('span');
  swatch.dataset.attr = 'cr-swatch';
  swatch.style.cssText = 'width:28px;height:18px;border:1px solid #000;display:inline-block';
  row('取样颜色').append(swatch);
  const fuzz = document.createElement('input');
  fuzz.type = 'range'; fuzz.min = '0'; fuzz.max = '200'; fuzz.step = '1'; fuzz.value = '40';
  fuzz.dataset.attr = 'cr-fuzziness'; fuzz.style.flex = '1';
  const fuzzNum = document.createElement('span'); fuzzNum.style.minWidth = '32px';
  row('颜色容差').append(fuzz, fuzzNum);
  const invRow = row('反相');
  const inv = document.createElement('input'); inv.type = 'checkbox'; inv.dataset.attr = 'cr-invert';
  invRow.append(inv);
  const info = document.createElement('div');
  info.dataset.attr = 'cr-info';
  info.style.cssText = 'opacity:.75;font-size:12px;margin-top:6px';
  body.append(info);

  colorRangeState = { color: fgRGB.slice(), fuzziness: 40, invert: false, before: selection, preview: null, job: 0 };

  const small = docW * docH <= 64e6;
  const rgba = small ? sampleRGBA(true) : null;
  const sync = () => {
    swatch.style.background = `rgb(${colorRangeState.color.join(',')})`;
    fuzzNum.textContent = String(colorRangeState.fuzziness);
    fuzz.value = String(colorRangeState.fuzziness);
    inv.checked = colorRangeState.invert;
    const st = colorRangeState, job = ++st.job;
    if (!small) {
      info.textContent = '正在扫描整幅文档…';
      colorRangeLazy([st.color], st.fuzziness, st.invert, st, job).then(next => {
        if (colorRangeState !== st || st.job !== job) return;
        st.preview = next && !isEmptySelection(next) ? next : null;
        setSelection(st.preview, { history: false, props: false });
        info.textContent = st.preview
          ? `选中约 ${Math.round(selectionArea(st.preview))} 像素`
          : '这个容差下一个像素都没选中';
      }).catch(e => {
        if (colorRangeState === st && st.job === job)
          info.textContent = '算不出来：' + humanEditError(e && e.message || e);
      });
      return;
    }
    try {
      const next = SELM.colorRangeSelection(rgba, docW, docH, {
        colors: [st.color], fuzziness: st.fuzziness, invert: st.invert });
      st.preview = isEmptySelection(next) ? null : next;
      setSelection(st.preview, { history: false, props: false });
      info.textContent = st.preview
        ? `选中约 ${Math.round(selectionArea(st.preview))} 像素`
        : '这个容差下一个像素都没选中';
    } catch (e) { info.textContent = '算不出来：' + humanEditError(e && e.message || e); }
  };
  fuzz.oninput = () => { colorRangeState.fuzziness = Math.max(0, Math.min(200, +fuzz.value || 0)); sync(); };
  inv.onchange = () => { colorRangeState.invert = inv.checked; sync(); };
  sync();
  const done = keep => {
    try { colorRangeDlgEl.close(); } catch { colorRangeDlgEl.removeAttribute('open'); }
    const st = colorRangeState; colorRangeState = null;
    if (keep) {
      setSelection(st.before, { history: false, props: false });       
      setSelection(st.preview, { label: '色彩范围' });
      shell.status(st.preview ? `色彩范围：容差 ${st.fuzziness}${st.invert ? '（反相）' : ''}` : '色彩范围：没有选中任何像素');
      if (opts.onDone && st.preview) opts.onDone();              
    } else setSelection(st.before, { history: false });
  };
  colorRangeDlgEl.querySelector('.fp-dlg-ok').onclick = () => done(true);
  colorRangeDlgEl.querySelector('.fp-dlg-cancel').onclick = () => done(false);
  colorRangeDlgEl.oncancel = e => { e.preventDefault(); done(false); };
  colorRangeDlgEl.__sync = sync;
  try { if (!colorRangeDlgEl.open) { if (colorRangeDlgEl.showModal) colorRangeDlgEl.showModal(); else colorRangeDlgEl.setAttribute('open', ''); } }
  catch { colorRangeDlgEl.setAttribute('open', ''); }
  return true;
}

export function colorRangePick(pt){
  if (!colorRangeState || !doc) return false;
  const x = Math.max(0, Math.min(docW - 1, Math.floor(pt.x))), y = Math.max(0, Math.min(docH - 1, Math.floor(pt.y)));
  if (docW * docH > 64e6) {
    const st = colorRangeState;
    sampleLazyBandRGBA(y, 1, true).then(band => {
      if (colorRangeState !== st) return;
      const o = x * 4;
      st.color = [band[o], band[o + 1], band[o + 2]];
      if (colorRangeDlgEl && colorRangeDlgEl.__sync) colorRangeDlgEl.__sync();
    }).catch(() => {});
    return true;
  }
  const rgba = sampleRGBA(true), o = (y * docW + x) * 4;
  colorRangeState.color = [rgba[o], rgba[o + 1], rgba[o + 2]];
  if (colorRangeDlgEl && colorRangeDlgEl.__sync) colorRangeDlgEl.__sync();
  return true;
}










let loadSelDlgEl = null;

function loadSelSources(){
  const out = [];
  const names = doc && doc.mode === 9 ? ['明度', 'a', 'b'] : ['红', '绿', '蓝'];
  if (chanSupported()) {
    out.push({ id: 'composite', label: chanCount() === 1 ? '灰色' : '合成（灰度）' });
    if (chanCount() > 1) for (let c = 0; c < Math.min(3, chanCount()); c++) out.push({ id: 'ch' + c, label: names[c] + '通道' });
  }
  for (const c of docAlphaChannels()) out.push({ id: 'doc-alpha:' + c.at, label: `${c.name}（Alpha 通道）` });
  const l = layerTree && layerTree.flat && layerTree.flat[selLayer];
  if (l && l.groupType !== 3) {
    out.push({ id: 'alpha', label: `「${layerRenames[selLayer] || l.name || '当前图层'}」透明度` });
    if (l.mask) out.push({ id: 'mask', label: `「${layerRenames[selLayer] || l.name || '当前图层'}」图层蒙版` });
  }
  return out;
}

export function loadSelData(id){
  if (typeof id === 'string' && id.startsWith('doc-alpha:')) {
    const g = docAlphaGray(+id.slice('doc-alpha:'.length) | 0);
    return g ? Uint8Array.from(g) : null;
  }
  if (id === 'alpha' || id === 'mask') {
    const src = id === 'alpha' ? layerAlphaOnCanvas(selLayer) : maskGrayOnCanvas(selLayer);
    if (!src) return null;
    return Uint8Array.from(src);
  }
  const effectiveOrder = (layerReorder || doc.layers.map((_, i) => i)).filter(i => !layerDeletes.has(i));
  const srcDoc = composeDocForOrder(previewCompositeDoc(doc), effectiveOrder);
  const px = compositeAll(srcDoc, docW, docH, new Map()).data;
  const ch = id === 'composite' ? null : Math.max(0, Math.min(2, +id.slice(2) | 0));
  const data = new Uint8Array(docW * docH);
  for (let i = 0, o = 0; i < data.length; i++, o += 4)
    data[i] = ch === null ? Math.round(px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114) : px[o + ch];
  return data;
}




export function maskGrayOnCanvas(idx){
  const l = doc && doc.layers[idx];
  const m = l && l.mask;
  if (!m || !m.gray || !(m.width > 0 && m.height > 0)) return null;
  const opI = opField(idx, 'setMaskProps', 'invert');
  const inv = opI !== undefined ? opI : !!m.invert;
  const def = m.defaultColor != null ? m.defaultColor : 255;
  const out = new Uint8Array(docW * docH);
  out.fill(inv ? 255 - def : def);
  const mL = m.relative ? l.bounds.left + m.left : m.left, mT = m.relative ? l.bounds.top + m.top : m.top;
  for (let y = 0; y < m.height; y++) {
    const dy = mT + y; if (dy < 0 || dy >= docH) continue;
    for (let x = 0; x < m.width; x++) {
      const dx = mL + x; if (dx < 0 || dx >= docW) continue;
      const v = m.gray[y * m.width + x];
      out[dy * docW + dx] = inv ? 255 - v : v;
    }
  }
  return out;
}

export function graySelectionUI(gray, mode, label){
  if (!gray || !docW) return false;
  return runLazy(SELECT, label || '载入选区', () => { combineInto(createSelection(docW, docH, 0, 0, docW, docH, Uint8Array.from(gray)), mode || 'replace'); return true; });
}
export async function loadSelectionDialog(){
  if (!doc || li) return false;
  if (!selReady('载入选区')) return false;
  const sources = loadSelSources();
  if (!sources.length) { $('#notice').textContent = '这份文档里没有可以载入成选区的通道。'; return false; }
  if (!loadSelDlgEl) {
    const dlg = document.createElement('dialog');
    dlg.className = 'fp-dlg';
    dlg.innerHTML = '<form method="dialog" class="fp-dlg-form" style="min-width:320px">'
      + '<h3 class="fp-dlg-title">载入选区</h3>'
      + '<div class="lsDlg-body"></div>'
      + '<p class="lsDlg-hint" style="opacity:.7;font-size:12px;margin:6px 0 0">'
      + '清单里是当前真能读到的源：颜色通道、文档的 Alpha 通道、当前图层的透明度与图层蒙版。</p>'
      + '<div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button>'
      + '<button type="button" class="fp-dlg-ok primary">确定</button></div></form>';
    document.body.appendChild(dlg);
    loadSelDlgEl = dlg;
  }
  const body = loadSelDlgEl.querySelector('.lsDlg-body');
  body.innerHTML = '';
  const line = label => { const r = document.createElement('label');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 2px';
    r.append(Object.assign(document.createElement('span'), { textContent: label, style: 'min-width:48px' }));
    body.append(r); return r; };
  const src = document.createElement('select');
  src.dataset.attr = 'ls-source'; src.style.flex = '1';
  for (const s of sources) src.append(Object.assign(document.createElement('option'), { value: s.id, textContent: s.label }));
  line('通道').append(src);
  const invRow = line('反相');
  const inv = document.createElement('input'); inv.type = 'checkbox'; inv.dataset.attr = 'ls-invert';
  invRow.append(inv);
  const op = document.createElement('select');
  op.dataset.attr = 'ls-op'; op.style.flex = '1';
  for (const [v, label] of [['replace', '新建选区'], ['add', '添加到选区'], ['subtract', '从选区中减去'], ['intersect', '与选区交叉']])
    op.append(Object.assign(document.createElement('option'), { value: v, textContent: label }));
  op.disabled = !selection;                       
  line('操作').append(op);
  return await new Promise(res => {
    const done = v => { try { loadSelDlgEl.close(); } catch { loadSelDlgEl.removeAttribute('open'); } res(v); };
    loadSelDlgEl.querySelector('.fp-dlg-ok').onclick = () => {
      const data = loadSelData(src.value);
      if (!data) { $('#notice').textContent = '这个源现在取不到像素（图层可能是空的）。'; done(false); return; }
      if (inv.checked) for (let i = 0; i < data.length; i++) data[i] = 255 - data[i];
      const next = createSelection(docW, docH, 0, 0, docW, docH, data);
      combineInto(next, selection ? op.value : 'replace');
      shell.status(`已载入「${sources.find(s => s.id === src.value).label}」为选区${inv.checked ? '（反相）' : ''}`);
      done(true);
    };
    loadSelDlgEl.querySelector('.fp-dlg-cancel').onclick = () => done(false);
    loadSelDlgEl.oncancel = e => { e.preventDefault(); done(false); };
    try { if (!loadSelDlgEl.open) { if (loadSelDlgEl.showModal) loadSelDlgEl.showModal(); else loadSelDlgEl.setAttribute('open', ''); } }
    catch { loadSelDlgEl.setAttribute('open', ''); }
  });
}
