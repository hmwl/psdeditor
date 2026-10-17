




import './50-clipboard-merge-mask.js';   
import { compositeAll } from '../../../core/app.js';
import { promptDialog } from '../dialog.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import {
  $, CREATABLE_FX, QUADM, QUADW, SELECT, SELM, createEffectTemplate, createSelection, isEmptySelection, runLazy,
  selectionArea, selectionBounds, selectionValueAt, smoothSelection, trimSelection,
} from './01-boot.js';
import {
  doc, docH, docW, globalLight, globalLightBase, guides, layerDeletes, layerOps, layerRenames, layerReorder,
  layerTree, li, selection, set_globalLight, set_globalLightDirty, set_guides, set_guidesDirty,
} from './02-doc-state.js';
import { actRecord, pushDocHistory } from './03-history.js';
import { tfFrame } from './06-view-zoom-move.js';
import { applyDocSize, transformableLayers } from './08-doc-size.js';
import { cropExtGen, set_cropExtGen } from './10-crop.js';
import { set_tfState, tfState, tfSyncBar, tfWriteQuad } from './19-free-transform.js';
import { fxMasterBase, layerFxItems, renderLayerPanel, selLayer } from './23-layers-panel.js';
import {
  addedFxValue, commitLayerOps, dropLayerOp, effFxMaster, humanEditError, opField, opKeyOf, putLayerOp,
  renderProps, setParamField, setSingleOp,
} from './24-layer-ops-queue.js';
import { ensureLayerTransform, transformChanged } from './28-layer-props-transform.js';
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









function reselectSampling(){
  const all = $('#wandAll').checked;
  if (!all && selLayer < 0) { $('#err').textContent = '按「当前图层」取样：先选中一个图层，或勾上魔棒选项里的「取样全部图层」。'; return null; }
  return { rgba: sampleRGBA(all), tolerance: Math.max(0, Math.min(255, +$('#wandTol').value || 0)) };
}
export function growSelUI(similar){
  if (!selection || !SELM) return false;
  const s = reselectSampling();
  if (!s) return false;
  try {
    const fn = similar ? SELM.similarSelection : SELM.growSelection;
    const next = fn(selection, s.rgba, docW, docH, { tolerance: s.tolerance });
    setSelection(next, { label: similar ? '选取相似' : '扩大选取' });
    $('#err').textContent = '';
    shell.status(`${similar ? '选取相似' : '扩大选取'}：容差 ${s.tolerance}（颜色按 4 级量化，容差取 4 的倍数）`);
    return true;
  } catch (e) { $('#err').textContent = (similar ? '选取相似' : '扩大选取') + '失败：' + humanEditError(e && e.message || e); return false; }
}
export function borderSelUI(px){ if (selection && SELM && px > 0) setSelection(SELM.borderSelection(selection, px), { label: '边界' }); }
export function smoothSelUI(px){ if (selection && SELM && px > 0) setSelection(smoothSelection(selection, px), { label: '平滑' }); }






export function tfBeginSelectionOutline(kind){
  if (!selection) { shell.status('先建立一个选区'); return false; }
  const b = selectionBounds(selection);
  if (!(b && b.width > 0 && b.height > 0)) { shell.status('选区是空的'); return false; }
  
  const src = { data: new Uint8ClampedArray(b.width * b.height * 4), width: b.width, height: b.height };
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++)
    src.data[(y * b.width + x) * 4 + 3] = selectionValueAt(selection, b.x + x, b.y + y);
  const base = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
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

export function tfSelOnlyApply(fast){
  const S = tfState && tfState.selOnly; if (!S || !QUADM) return;
  const r = QUADM.warpQuad(S.src, S.quad, { samples: fast ? 1 : 2 });
  if (!r) return;
  const data = new Uint8Array(docW * docH);
  for (let y = 0; y < r.height; y++) {
    const dy = r.y + y; if (dy < 0 || dy >= docH) continue;
    for (let x = 0; x < r.width; x++) {
      const dx = r.x + x; if (dx < 0 || dx >= docW) continue;
      data[dy * docW + dx] = r.data[(y * r.width + x) * 4 + 3];
    }
  }
  const next = trimSelection({ x: 0, y: 0, width: docW, height: docH, data, docW, docH });
  setSelection(isEmptySelection(next) ? null : next, { history: false, props: false });
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

  colorRangeState = { color: fgRGB.slice(), fuzziness: 40, invert: false, before: selection, preview: null };
  const rgba = sampleRGBA(true);
  const sync = () => {
    swatch.style.background = `rgb(${colorRangeState.color.join(',')})`;
    fuzzNum.textContent = String(colorRangeState.fuzziness);
    fuzz.value = String(colorRangeState.fuzziness);
    inv.checked = colorRangeState.invert;
    try {
      const next = SELM.colorRangeSelection(rgba, docW, docH, {
        colors: [colorRangeState.color], fuzziness: colorRangeState.fuzziness, invert: colorRangeState.invert });
      colorRangeState.preview = isEmptySelection(next) ? null : next;
      setSelection(colorRangeState.preview, { history: false, props: false });
      info.textContent = colorRangeState.preview
        ? `选中约 ${Math.round(selectionArea(colorRangeState.preview))} 像素`
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
