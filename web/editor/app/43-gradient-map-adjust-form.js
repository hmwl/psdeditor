




import './42-adjust-panels.js';   
import { actions } from '../actions.js';
import { $, ADJM, ADJUST, ADJ_ALL, icon, kick } from './01-boot.js';
import { brushHistory, doc, layerEdits, layerTree, selection } from './02-doc-state.js';
import {
  PP, actRecord, beginLayerEdit, endLayerEdit, histCap, histPush, pushDocHistory, set_docHistLock,
} from './03-history.js';
import { buildAdjEyeRow, openGradientEditor } from './15-gradient-bucket-eyedropper.js';
import {
  layerCanvasCache, renderLayerPanel, selLayer, selLayers, set_selLayer, thumbCache,
} from './23-layers-panel.js';
import {
  cloneOpValue, commitLayerOps, dropLayerOp, effClipping, effParam, findLayerOp, humanEditError, putLayerOp,
  schedulePanelRebuild, setOpField, setParamField, setParamFieldsBatch, set_curveDragHold,
} from './24-layer-ops-queue.js';
import { gradClone, gradModelCss, gradNewModel, rgbHex, setLayerVisible } from './27-gradient-editor.js';
import { mkEl } from './28-layer-props-transform.js';
import { EV, beginDragAdjust, scrubHitOf, startScrub } from './29-scrubby-live.js';
import { applyPreviewArrayOps, renderPreviewOnly, renderStaticLayers, setPreviewPath } from './30-render.js';
import { commitPixelPaint, cutRect, diffBox } from './38-brush-engine.js';
import {
  adjCompute, adjDefaults, adjLabel, adjRAF, adjRender, adjState, adjTypes, adjustGuard, buildLevelsControl,
  lvBins, lvDrawHist, openAdjustLazy, renderAdjustDialog, set_adjRAF, set_adjState,
} from './41-image-adjust.js';
import {
  ADJ_FORM, ADJ_SCALAR_ROWS, BC_BLOCKS, adjCtlState, adjLayerHistogram, adjLayerTarget, adjSelState, blockValue,
  buildBcControl, bwAutoWeights, curveChannelOptions, curveSampler, curveView, labToSrgb, panelLevelsV,
  setCurveView, srgbToLab,
} from './42-adjust-panels.js';










function grdmArrayLen(t, path){
  const f = t.fields.find(x => x.path === path);
  if (!f) return 0;
  const n = f.length != null ? f.length : f.count;
  return Number.isFinite(n) ? n | 0 : 0;
}

function grdmRawSlots(t, readVal, path, withColor){
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const out = [];
  for (let k = 0, n = grdmArrayLen(t, path); k < n; k++) {
    const s = { location: num(readVal(`${path}.${k}.location`), 0), midpoint: num(readVal(`${path}.${k}.midpoint`), 50) };
    if (withColor) s.color = [0, 1, 2, 3].map(i => num(readVal(`${path}.${k}.color.${i}`), 0));
    else s.opacity = num(readVal(`${path}.${k}.opacity`), 255);
    out.push(s);
  }
  return out;
}

function grdmModelFromRaw(rawClrs, rawTrns){
  const clrs = rawClrs.map((s, k) => ({
    src: k, loc: Math.round(s.location), mid: Math.round(s.midpoint),
    r: Math.round(s.color[0] / 257), g: Math.round(s.color[1] / 257), b: Math.round(s.color[2] / 257),
  }));
  const trns = rawTrns.map((s, k) => ({
    src: k, loc: Math.round(s.location), mid: Math.round(s.midpoint), opct: s.opacity / 255 * 100,
  }));
  return { clrs, trns, sel: { kind: 'color', i: 0 } };
}


function grdmModels(idx, t, readVal){
  const fileC = grdmRawSlots(t, readVal, 'colorStops', true);
  const fileT = grdmRawSlots(t, readVal, 'transparencyStops', false);
  const orig = grdmModelFromRaw(fileC, fileT);
  const op = findLayerOp(idx, `setLayerParams:${t.target}:${t.at || 0}`);
  if (!op || (!op.arrayOps && !op.values)) return { orig, model: gradClone(orig) };
  const root = { colorStops: fileC.map(cloneOpValue), transparencyStops: fileT.map(cloneOpValue) };
  applyPreviewArrayOps(root, op.arrayOps);
  for (const [p, v] of Object.entries(op.values || {})) {
    if (/^(colorStops|transparencyStops)\./.test(p)) setPreviewPath(root, p, v);
  }
  return { orig, model: grdmModelFromRaw(root.colorStops, root.transparencyStops) };
}



function commitGrdmModel(idx, t, orig, m){
  const key = `setLayerParams:${t.target}:${t.at || 0}`;
  const same = (mArr, oArr, kind) => mArr.length === oArr.length
    && mArr.every((s, k) => s.src === k && s.loc === oArr[k].loc && s.mid === oArr[k].mid
      && (kind === 'color' ? (s.r === oArr[k].r && s.g === oArr[k].g && s.b === oArr[k].b)
                           : Math.abs(s.opct - oArr[k].opct) < 1e-9));
  const unchanged = same(m.clrs, orig.clrs, 'color') && same(m.trns, orig.trns, 'op');
  return commitLayerOps(idx, () => {
    const op = findLayerOp(idx, key) || { op: 'setLayerParams', index: idx, target: t.target, at: t.at || 0, values: {} };
    for (const p of Object.keys(op.values || {})) if (/^(colorStops|transparencyStops)\./.test(p)) delete op.values[p];
    delete op.arrayOps;
    if (!unchanged) {
      const values = {}, arrayOps = [];
      const seg = (path, arr, cur, kind) => {
        


        for (let k = cur; k > arr.length; k--) arrayOps.push({ path, removeAt: k - 1 });
        for (let k = cur; k < arr.length; k++) {
          arrayOps.push({ path, insertAt: k, copyFrom: Math.max(0, Math.min(k - 1, cur - 1)),
            value: kind === 'color'
              ? { location: arr[k].loc, midpoint: arr[k].mid,
                  'color.0': arr[k].r * 257, 'color.1': arr[k].g * 257, 'color.2': arr[k].b * 257 }
              : { location: arr[k].loc, midpoint: arr[k].mid, opacity: Math.round(arr[k].opct / 100 * 255) } });
        }
        for (let k = 0; k < arr.length; k++) {
          values[`${path}.${k}.location`] = arr[k].loc;
          values[`${path}.${k}.midpoint`] = arr[k].mid;
          if (kind === 'color') {
            values[`${path}.${k}.color.0`] = arr[k].r * 257;
            values[`${path}.${k}.color.1`] = arr[k].g * 257;
            values[`${path}.${k}.color.2`] = arr[k].b * 257;
          } else values[`${path}.${k}.opacity`] = Math.round(arr[k].opct / 100 * 255);
        }
      };
      seg('colorStops', m.clrs, orig.clrs.length, 'color');
      seg('transparencyStops', m.trns, orig.trns.length, 'op');
      Object.assign(op.values, values);
      if (arrayOps.length) op.arrayOps = arrayOps;
    }
    const dirty = Object.keys(op.values || {}).length || (op.arrayOps && op.arrayOps.length);
    if (!dirty) dropLayerOp(idx, key); else putLayerOp(idx, op);
    return true;
  });
}





function hueRangeDegs(readVal, st){
  if (!/^\d$/.test(String(st.edit))) return null;
  const raw = [0, 1, 2, 3].map(i => readVal(`ranges.${st.edit}.range.${i}`));
  if (raw.some(v => typeof v !== 'number' || !Number.isFinite(v))) return null;
  const out = [raw[0]];
  for (let i = 1; i < 4; i++) { let v = raw[i]; while (v < out[i - 1]) v += 360; out.push(v); }
  return out;
}
const wrap360 = d => ((Math.round(d) % 360) + 360) % 360;

function clampHueRange(i, v, o){
  const lo = [o[3] - 360, o[0], o[1], o[2]][i];
  const hi = [o[1], o[2], o[3], o[0] + 360][i];
  return Math.max(lo, Math.min(hi, v));
}





export function curveEyePick(which, c, ctx){
  const { t, st, idx, rebuild } = ctx;
  const pts = curvePtsOf(t, st).map(p => ({ input: Math.round(p.input), output: Math.round(p.output) }));
  if (pts.length < 2) return false;
  const v = Math.max(0, Math.min(255, Math.round(c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114)));
  let list;
  if (which === 'black') {
    if (v >= pts[pts.length - 1].input) return false;                 
    list = pts.map((p, k) => (k === 0 ? { input: v, output: p.output } : p));
  } else if (which === 'white') {
    if (v <= pts[0].input) return false;
    list = pts.map((p, k) => (k === pts.length - 1 ? { input: v, output: p.output } : p));
  } else {
    if (v <= pts[0].input || v >= pts[pts.length - 1].input) return false;
    const near = pts.findIndex(p => Math.abs(p.input - v) <= 2);
    if (near > 0) list = pts.map((p, k) => (k === near ? { input: v, output: 128 } : p));
    else if (pts.length >= 19) return false;
    else list = pts.concat([{ input: v, output: 128 }]).sort((a, b) => a.input - b.input);
  }
  const dedup = [];
  for (const p of list) {
    if (dedup.length && dedup[dedup.length - 1].input === p.input) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  if (dedup.length < 2) return false;
  commitCurveList(idx, t, st, dedup, rebuild);
  return true;
}






export function expEyePick(which, c, ctx){
  const { readVal, writeVal, beginDrag, finishDrag } = ctx;
  const num = (p, d) => { const v = readVal(p); return typeof v === 'number' && Number.isFinite(v) ? v : d; };
  const WG = 2.2;                                    
  const exposure = num('exposure', 0), offset = num('offset', 0), gamma = num('gamma', 1);
  const x = (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
  const base = Math.pow(Math.max(1e-6, x), WG) * Math.pow(2, exposure);
  beginDrag();
  let okd = false;
  if (which === 'gray') {
    const l = base + offset;
    if (l > 0.002 && l < 0.998) {
      const g = Math.max(0.01, Math.min(9.99, Math.log(l) / Math.log(Math.pow(0.5, WG))));
      const nv = Math.round(g * 100) / 100;
      if (Math.fround(nv) !== Math.fround(gamma)) { writeVal('gamma', nv); okd = true; }
    }
  } else {
    const want = which === 'black' ? -base : 1 - base;
    const nv = Math.max(-0.5, Math.min(0.5, Math.round(want * 1000) / 1000));
    
    if (Math.fround(nv) !== Math.fround(offset)) { writeVal('offset', nv); okd = true; }
  }
  finishDrag();
  return okd;
}


function buildAdjForm(ctx, idx, t, spec){
  const { body, mk } = ctx;
  const base = `${ctx.attr || 'adj'}-${t.main.block.trim().toLowerCase()}-`;
  const A = id => base + id;
  const st = adjSelState(idx);
  if (st.tone === undefined) st.tone = 'midtones';
  const panel = mk('div', { className: 'lvPanel adjForm' });
  const controls = [];                                    
  const hists = [];                                       
  const grids = [];                                       
  const main = t.main;
  
  const readVal = p => { const b = blockValue(main, p); return b === undefined ? undefined : effParam(idx, main.target, 0, p, b); };
  const writeVal = (p, v) => { const b = blockValue(main, p); if (b === undefined) return false; setParamField(idx, main.target, 0, p, v, b); return true; };
  const pathOf = row => (typeof row.p === 'function' ? row.p(st, 0) : row.p);
  const rebuild = () => schedulePanelRebuild();            
  const endDrag = () => { beginLayerEdit(); };             
  const startDrag = () => { beginLayerEdit(); };
  const finishDrag = () => { endLayerEdit(); };

  




  for (const row of (spec.rows || [])) {
    if (row.k === 'bool' && row.id) st[row.id] = !!readVal(row.p);
  }

  for (const row of (spec.rows || [])) {
    if (row.k === 'note') continue;
    

    if (row.needs && !readVal(row.needs)) continue;
    



    if (row.id && (row.k === 'enum' || row.k === 'radio') && st[row.id] === undefined && row.def !== undefined) {
      st[row.id] = String(typeof row.def === 'function' ? row.def(st) : row.def);
    }

    
    if (row.k === 'slider') {
      const box = mk('div', { className: 'arow' });
      



      const lab = mk('label', { className: 'k scrub', textContent: row.l, title: '按住左右拖动可调整数值（Shift ×10、Alt ÷10）' });
      lab.dataset.scrubBound = '1';
      const hit = scrubHitOf(lab);
      box.append(lab);
      

      const mul = row.mul || 1;
      const cur = readVal(pathOf(row));
      const v0 = cur === undefined || cur === null ? row.def : cur / mul;
      const dec = row.dec || 0;
      const sl = mk('input', { type: 'range', min: row.min, max: row.max, step: row.step || 1, value: v0 });
      sl.dataset.attr = A(row.id);
      const nb = mk('input', { type: 'number', min: row.min, max: row.max, step: row.step || 1, value: dec ? (+v0).toFixed(dec) : Math.round(v0) });
      nb.dataset.attr = A(row.id + '-num');
      nb.dataset.scrub = '1';                             
      const title = `${row.l} ${row.min}…${row.max}`;
      sl.title = nb.title = title;
      const put = v => {
        const nv = Math.max(row.min, Math.min(row.max, dec ? Math.round(v * 10 ** dec) / 10 ** dec : Math.round(v) || 0));
        nb.value = dec ? nv.toFixed(dec) : String(nv);
        sl.value = nv;
        if (row.clampPoint) writeCurvePoint(idx, t, st, row.clampPoint, nv, rebuild);
        else writeVal(pathOf(row), nv * mul);
      };
      

      sl.addEventListener('pointerdown', startDrag);
      sl.oninput = () => { nb.value = dec ? (+sl.value).toFixed(dec) : sl.value; };
      sl.onchange = () => { finishDrag(); put(+sl.value); };
      nb.addEventListener('pointerdown', startDrag);
      nb.oninput = () => { sl.value = nb.value; };
      nb.onchange = () => { finishDrag(); put(+nb.value); };
      

      hit.addEventListener('pointerdown', e => startScrub(e, sl, hit));
      box.append(sl, nb);
      controls.push({ sync(){
        


        const raw = row.clampPoint ? readCurvePoint(idx, t, st, row.clampPoint) : readVal(pathOf(row));
        const v = raw === undefined || raw === null ? row.def : raw / mul;
        sl.value = v;
        if (document.activeElement !== nb) nb.value = dec ? (+v).toFixed(dec) : String(Math.round(v));
      } });
      panel.append(box);
      continue;
    }

    
    if (row.k === 'enum') {
      


      const fileBacked = typeof row.p === 'string';
      const box = mk('div', { className: 'arow' });
      box.append(mk('label', { className: 'k', textContent: row.l }));
      const sel = mk('select');
      sel.dataset.attr = A(row.id);
      const opts = (typeof row.options === 'function' ? row.options(st, t) : row.options) || [];
      for (const [v, lab] of opts) sel.append(mk('option', { value: String(v), textContent: lab }));
      const cur = fileBacked ? readVal(row.p) : st[row.id];
      const want = cur === undefined || cur === null ? row.def : cur;
      if (!opts.some(([v]) => String(v) === String(want)) && opts.length) st[row.id] = String(opts[0][0]);
      else st[row.id] = String(want);
      sel.value = st[row.id];
      sel.onchange = () => {
        startDrag();
        if (fileBacked) writeVal(row.p, sel.value);
        else { st[row.id] = sel.value; if (row.onPick) row.onPick(st, sel.value); }
        finishDrag();
        rebuild();
      };
      box.append(sel);
      panel.append(box);
      continue;
    }

    
    if (row.k === 'bool') {
      const on = !!readVal(row.p);
      const lab = mk('label', { className: 'chk' });
      const cb = mk('input', { type: 'checkbox' });
      cb.checked = on;
      cb.dataset.attr = A(row.id);
      cb.title = row.l;
      cb.onchange = () => {
        startDrag(); writeVal(row.p, cb.checked); finishDrag();
        if (row.after) row.after(st, cb.checked);
        rebuild();                                          
      };
      lab.append(cb, mk('span', { textContent: row.l }));
      panel.append(lab);
      continue;
    }

    
    if (row.k === 'radio') {
      

      const fileBacked = typeof row.p === 'string';
      const box = mk('div', { className: 'arow' });
      box.append(mk('label', { className: 'k', textContent: row.l }));
      const wrap = mk('div', { className: 'radios' });
      const cur = fileBacked ? readVal(row.p) : st[row.id];
      for (const [v, lab] of row.options) {
        const b = mk('button', { type: 'button', textContent: lab, className: String(cur) === String(v) ? 'on' : '' });
        b.dataset.attr = A(row.id) + '-' + v;
        b.onclick = () => {
          startDrag();
          if (fileBacked) writeVal(row.p, v);
          else st[row.id] = String(v);
          finishDrag();
          rebuild();
        };
        wrap.append(b);
      }
      box.append(wrap);
      panel.append(box);
      continue;
    }

    
    if (row.k === 'auto') {
      const btn = mk('button', { type: 'button', className: 'adj-auto', textContent: row.l });
      btn.dataset.attr = A(row.id);
      btn.title = '按这一层之下的画面算一组让灰度铺满色调范围的权重（近似 PS 的「自动」，Adobe 未公开原算法）';
      btn.onclick = () => {
        const w = bwAutoWeights(idx);
        if (!w) {
          $('#notice').textContent = '「自动」算不出来：这一层之下没有可用的画面（空文档 / 全透明 / 全灰）。';
          return;
        }
        
        startDrag(); set_docHistLock(true);
        for (const [key, path] of [['red', 'Rd  '], ['yellow', 'Yllw'], ['green', 'Grn '],
                                   ['cyan', 'Cyn '], ['blue', 'Bl  '], ['magenta', 'Mgnt']]) writeVal(path, w[key]);
        set_docHistLock(false); finishDrag(); rebuild();
      };
      panel.append(btn);
      continue;
    }

    
    if (row.k === 'eyeRow') {
      const ctx2 = { idx, t, st, main, readVal, writeVal, rebuild, beginDrag: startDrag, finishDrag };
      panel.append(buildAdjEyeRow(mk, A(row.id), (which, c) => row.pick(which, c, ctx2)));
      continue;
    }

    
    if (row.k === 'color') {
      const box = mk('div', { className: 'arow' });
      box.append(mk('label', { className: 'k', textContent: row.l }));
      const L = readVal(`${row.p}.Lmnc`), Aa = readVal(`${row.p}.A   `), Bb = readVal(`${row.p}.B   `);
      const hex = labToSrgb(L === undefined ? 80 : L, Aa === undefined ? 5 : Aa, Bb === undefined ? 20 : Bb);
      const sw = mk('i', { className: 'swatch', style: `background:${hex}` });
      const inp = mk('input', { type: 'color', value: hex, title: `${row.l}（文件里存的是 LABC：L ${L} / a ${Aa} / b ${Bb}）` });
      inp.dataset.attr = A(row.id);
      inp.onchange = () => {
        const c = srgbToLab(inp.value);
        sw.style.background = inp.value;
        startDrag();
        writeVal(`${row.p}.Lmnc`, c.L); writeVal(`${row.p}.A   `, c.a); writeVal(`${row.p}.B   `, c.b);
        finishDrag();
      };
      box.append(sw, inp);
      panel.append(box);
      continue;
    }

    


    if (row.k === 'labColor') {
      const box = mk('div', { className: 'arow' });
      box.append(mk('label', { className: 'k', textContent: row.l }));
      const s16 = n => (n > 0x7fff ? n - 0x10000 : n);
      const cs = readVal(row.cs);
      const raw = [0, 1, 2].map(i => readVal(`${row.p}.${i}`));
      const known = raw.every(v => typeof v === 'number');
      let hex = row.def;
      if (known && cs === 7) hex = labToSrgb(s16(raw[0]) / 100, s16(raw[1]) / 100, s16(raw[2]) / 100);
      else if (known && cs === 0) hex = rgbHex({ r: Math.round(raw[0] / 257), g: Math.round(raw[1] / 257), b: Math.round(raw[2] / 257) });
      const sw = mk('i', { className: 'swatch', style: `background:${hex}` });
      const inp = mk('input', { type: 'color', value: hex });
      inp.dataset.attr = A(row.id);
      inp.title = known
        ? `${row.l}：文件里存的是 Lab ${(s16(raw[0]) / 100).toFixed(2)} / ${(s16(raw[1]) / 100).toFixed(2)} / ${(s16(raw[2]) / 100).toFixed(2)}`
        : `${row.l}：文件里的颜色不是 Lab / RGB 记录（colorSpace = ${cs}），改一次就会写成 Lab`;
      inp.onchange = () => {
        const c = srgbToLab(inp.value);
        sw.style.background = inp.value;
        startDrag();
        writeVal(row.cs, 7);
        writeVal(`${row.p}.0`, (c.L * 100) & 0xffff);
        writeVal(`${row.p}.1`, (c.a * 100) & 0xffff);
        writeVal(`${row.p}.2`, (c.b * 100) & 0xffff);
        finishDrag();
      };
      box.append(sw, inp);
      panel.append(box);
      continue;
    }

    
    if (row.k === 'text') {
      const box = mk('div', { className: 'arow' });
      box.append(mk('label', { className: 'k', textContent: row.l }));
      const cur = readVal(row.p);
      const inp = mk('input', { type: 'text', value: cur === undefined || cur === null ? row.def : String(cur) });
      inp.dataset.attr = A(row.id);
      inp.placeholder = row.ph || '';
      inp.title = row.l;
      inp.onchange = () => {
        const v = inp.value;
        startDrag();
        writeVal(row.p, v);
        
        for (const [p, val] of (row.afterWrite ? (row.afterWrite(v) || []) : [])) {
          const b2 = blockValue(main, p);
          if (b2 !== undefined) setParamField(idx, main.target, 0, p, val, b2);
        }
        finishDrag();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      box.append(inp);
      panel.append(box);
      continue;
    }

    
    if (row.k === 'gradient') {
      const box = mk('div', { className: 'arow' });
      box.append(mk('label', { className: 'k', textContent: row.l }));
      const strip = mk('button', { type: 'button', className: 'gradstrip' });
      const fill = mk('i');
      strip.append(fill);
      strip.dataset.attr = A(row.id);
      strip.title = '点一下打开「渐变编辑器」：加色标、改颜色与不透明度、拖中点；确定才写回';
      const paint = () => { fill.style.backgroundImage = gradModelCss(grdmModels(idx, main, readVal).model); };
      strip.onclick = () => {
        const { orig, model } = grdmModels(idx, main, readVal);
        openGradientEditor(m => commitGrdmModel(idx, main, orig, m), model);
      };
      controls.push({ sync: paint });
      paint();
      box.append(strip);
      panel.append(box);
      continue;
    }

    
    if (row.k === 'hist') {
      const cv = mk('canvas', { className: 'lvHist' });
      cv.dataset.attr = A(row.id);
      cv.title = row.l;
      hists.push({ cv, levelOf: () => readVal('level') });
      panel.append(cv);
      continue;
    }

    
    if (row.k === 'rainbow') {
      const wrap = mk('div', { className: 'rainbowWrap' });
      const st2 = mk('div', { className: 'rainbow' });
      st2.dataset.attr = A(row.id);
      st2.title = '色相环 0…360°：高亮的是「编辑」里选中的那一档色域';
      for (let i = 0; i < 36; i++) {
        const seg = mk('i', { style: `background:hsl(${i * 10} 100% 50%)` });
        st2.append(seg);
      }
      const hi = mk('span', { className: 'band' });
      wrap.append(st2, hi);
      


      const handles = [0, 1, 2, 3].map(i => {
        const h = mk('span', { className: 'rng-h' + (i === 0 || i === 3 ? ' soft' : '') });
        h.dataset.attr = `${A(row.id)}-${i}`;
        h.tabIndex = 0;
        h.title = ['外软边（左）', '内软边（左）', '内软边（右）', '外软边（右）'][i]
          + '：左右拖动改这一档色域的边界（0…360° 绕回，与 PS 同义）';
        h.addEventListener('pointerdown', ev => {
          if (ev.button != null && ev.button !== 0) return;
          const degs = hueRangeDegs(readVal, st);
          const rect = st2.getBoundingClientRect ? st2.getBoundingClientRect() : null;
          if (!degs || !rect || !rect.width || !st2.isConnected) return;
          ev.preventDefault();
          try { h.focus({ preventScroll: true }); } catch { }
          

          const sens = 360 / rect.width, start = degs[i], ch = st.edit;
          startDrag();
          beginDragAdjust(ev, acc => {
            writeVal(`ranges.${ch}.range.${i}`, wrap360(clampHueRange(i, Math.round(start + acc * sens), degs)));
          }, () => { finishDrag(); }, () => 1);
        });
        h.addEventListener('keydown', ev => {
          const d = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0;
          if (!d) return;
          const degs = hueRangeDegs(readVal, st);
          if (!degs) return;
          ev.preventDefault();
          const ch = st.edit;
          startDrag();
          writeVal(`ranges.${ch}.range.${i}`, wrap360(clampHueRange(i, degs[i] + d * (ev.shiftKey ? 10 : 1), degs)));
          finishDrag();
          rebuild();
        });
        wrap.append(h);
        return h;
      });
      controls.push({ sync(){
        const degs = hueRangeDegs(readVal, st);
        if (!degs) { hi.hidden = true; for (const h of handles) h.hidden = true; return; }
        const norm = d => ((d % 360) + 360) % 360;
        const a = norm(degs[0]), b2 = norm(degs[3]);
        const w = ((b2 - a) + 360) % 360 || 360;
        hi.hidden = false;
        hi.style.left = (a / 360 * 100) + '%';
        hi.style.width = (w / 360 * 100) + '%';
        handles.forEach((h, i) => { h.hidden = false; h.style.left = (norm(degs[i]) / 360 * 100) + '%'; });
      } });
      panel.append(wrap);
      continue;
    }

    
    if (row.k === 'curveIO') {
      const box = mk('div', { className: 'arow curveIO' });
      for (const [key, label, id] of [['input', '输入', 'in'], ['output', '输出', 'out']]) {
        const lab = mk('label', { className: 'k scrub', textContent: label + ':', title: '按住左右拖动可调整数值（Shift ×10、Alt ÷10）' });
        lab.dataset.scrubBound = '1';
        const hit = scrubHitOf(lab);
        const ink = !!curveView.ink;             
        const nb = mk('input', { type: 'number', min: 0, max: ink ? 100 : 255, step: 1, value: 0 });
        nb.dataset.attr = A(id + '-num');
        nb.dataset.scrub = '1';
        nb.title = ink ? `选中点的${label}（油墨 %）0…100` : `选中点的${label} 0…255`;
        nb.addEventListener('pointerdown', startDrag);
        nb.onchange = () => {
          finishDrag(); let v = +nb.value;
          if (!Number.isFinite(v)) return;
          if (ink) v = Math.round(255 - Math.max(0, Math.min(100, v)) * 2.55);
          writeCurvePoint(idx, t, st, key, v, rebuild);
          for (const g of grids) g.sync();        
        };
        nb.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nb.dispatchEvent(new (EV(nb))('change', { bubbles: true })); } });
        hit.addEventListener('pointerdown', e => startScrub(e, nb, hit));
        box.append(lab, nb);
        controls.push({ sync(){
          const v = readCurvePoint(idx, t, st, key);
          const shown = ink ? Math.round((255 - (v == null ? 0 : v)) / 2.55) : Math.round(v == null ? 0 : v);
          if (document.activeElement !== nb) nb.value = String(shown);
        } });
      }
      panel.append(box);
      continue;
    }

    
    if (row.k === 'curve') {
      const wrap = mk('div', { className: 'curveWrap' });
      const cv = mk('canvas', { className: 'curveGrid' });
      cv.dataset.attr = A(row.id);
      cv.__hist = adjLayerHistogram(idx);         
      cv.tabIndex = 0;                           
      cv.title = '按下即加点并可拖动；拖出框外删点（两端的点是黑场/白场，不能删）。方向键微调、Delete 删点、+/− 切换点；Alt 点击切换网格密度。';
      wrap.append(cv);
      if (adjCtlState.curveRefocus) {            
        adjCtlState.curveRefocus = false;
        setTimeout(() => { if (cv.isConnected) try { cv.focus({ preventScroll: true }); } catch { } }, 0);
      }
      let lockSize = null;                       
      const redraw = size => { drawCurveGrid(cv, t, st, size); for (const c of controls) c.sync(); syncTris(); };
      const rafFn = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16);
      

      rafFn(() => { if (cv.isConnected) redraw(); });
      






      cv.addEventListener('pointerdown', ev => {
        if (ev.button != null && ev.button !== 0) return;
        const rect = cv.getBoundingClientRect();
        if (!rect.width || !cv.isConnected) return;
        ev.preventDefault();
        try { cv.focus({ preventScroll: true }); } catch { }
        if (ev.altKey) { setCurveView({ fine: !adjCtlState.curveFine }); drawCurveGrid(cv, t, st); return; }   
        const size = lockSize || { w: cv.clientWidth || 240 };
        const { x0, iw, ih } = curveInnerOf(cv, size);
        const sx = rect.width / size.w || 1;     
        const toVal = e2 => {
          const x = (e2.clientX - rect.left) / sx - x0, y = (e2.clientY - rect.top) / sx;
          return { input: V(Math.max(0, Math.min(1, x / iw)) * 255), output: V(Math.max(0, Math.min(1, 1 - y / ih)) * 255) };
        };
        const at = q => ({ x: x0 + V(q.input) / 255 * iw, y: ih - V(q.output) / 255 * ih });
        const V = v => (curveView.ink ? 255 - v : v);
        const pts = curvePtsOf(t, st);
        if (pts.length < 2) return;
        const px = (ev.clientX - rect.left) / sx, py = (ev.clientY - rect.top) / sx;
        const HIT = 10;
        let best = -1, bd = Infinity;
        pts.forEach((q, i) => { const c = at(q); const d = (c.x - px) ** 2 + (c.y - py) ** 2; if (d < bd) { bd = d; best = i; } });
        let k, others, grab, last = null, adding = false;
        if (best >= 0 && bd <= HIT * HIT) {
          k = best;
          others = pts.filter((_, i) => i !== k).map(q => ({ input: q.input, output: q.output }));
          const v0 = toVal(ev);
          grab = { input: v0.input - pts[k].input, output: v0.output - pts[k].output };
          last = { input: pts[k].input, output: pts[k].output };
          adjCtlState.curvePt = k;
          redraw(size);
        } else {
          const v0 = toVal(ev);
          
          if (v0.input <= pts[0].input || v0.input >= pts[pts.length - 1].input) return;
          if (pts.length >= 19) { $('#notice').textContent = '曲线最多 19 个点（PS 的曲线也有上限）。'; return; }
          if (pts.some(q => Math.abs(q.input - v0.input) < 2)) return;   
          others = pts.map(q => ({ input: q.input, output: q.output }));
          k = others.findIndex(q => q.input > v0.input);
          grab = { input: 0, output: 0 };
          adding = true;
        }
        const isEnd = k === 0 || k === others.length;
        const lo = k === 0 ? 0 : others[k - 1].input + 1;
        const hi = k === others.length ? 255 : others[k].input - 1;
        const deletable = !isEnd && others.length >= 2;
        const outside = e2 => {
          const x = e2.clientX - rect.left, y = e2.clientY - rect.top;
          return x < -16 || y < -16 || x > rect.width + 16 || y > rect.height + 16;
        };
        try { cv.setPointerCapture(ev.pointerId); } catch { }
        let began = false, removed = false, pending = null, raf = 0;
        const commit = list => {
          if (!began) { began = true; set_docHistLock(false); beginLayerEdit(); }   
          set_docHistLock(true);
          commitCurveList(idx, t, st, list);
        };
        const frame = () => {
          raf = 0;
          const e2 = pending; pending = null;
          if (!e2) return;
          if (deletable && outside(e2)) {
            if (!removed) { removed = true; adjCtlState.curvePt = Math.max(0, k - 1); commit(others); }
          } else {
            const v = toVal(e2);
            const q = { input: Math.max(lo, Math.min(hi, Math.round(v.input - grab.input))),
                        output: Math.max(0, Math.min(255, Math.round(v.output - grab.output))) };
            if (!removed && last && last.input === q.input && last.output === q.output) return;
            removed = false; last = q;
            adjCtlState.curvePt = k;
            commit(others.slice(0, k).concat([q], others.slice(k)));
          }
          redraw(size);
        };
        const move = e2 => { pending = e2; if (!raf) raf = rafFn(frame); };
        const up = e2 => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          try { cv.releasePointerCapture(ev.pointerId); } catch { }
          if (e2 && e2.type === 'pointerup') pending = e2;
          frame();                               
          set_curveDragHold(false); set_docHistLock(false); lockSize = null;
          if (began) endLayerEdit();
          adjCtlState.curveRefocus = true;       
          rebuild();
          adjCtlState.curveRefocus = false;
        };
        lockSize = size; set_curveDragHold(true); set_docHistLock(true);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        if (adding) { pending = ev; frame(); }   
      });
      

      cv.addEventListener('keydown', ev => {
        if (ev.metaKey || ev.ctrlKey) return;    
        const pts = curvePtsOf(t, st);
        if (pts.length < 2) return;
        const n = pts.length;
        const k = Math.max(0, Math.min(n - 1, adjCtlState.curvePt || 0));
        const step = ev.shiftKey ? 10 : 1;
        const edit = fn => { beginLayerEdit(); adjCtlState.curveRefocus = true; fn(); adjCtlState.curveRefocus = false; endLayerEdit(); };
        const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
        if (dir) {
          const sgn = curveView.ink ? -1 : 1;       
          edit(() => moveCurvePoint(idx, t, st, k, pts[k].input + dir[0] * step * sgn, pts[k].output + dir[1] * step * sgn));
        } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
          if (!(n > 2 && k > 0 && k < n - 1)) { $('#notice').textContent = '两端的点是黑场/白场，不能删。'; }
          else {
            adjCtlState.curvePt = k - 1;
            edit(() => commitCurveList(idx, t, st, pts.filter((_, i) => i !== k), rebuild));
          }
        } else if (ev.key === '+' || ev.key === '=' || ev.key === '-' || ev.key === '_') {
          adjCtlState.curvePt = (k + ((ev.key === '-' || ev.key === '_') ? n - 1 : 1)) % n;
          redraw();
        } else return;
        ev.preventDefault(); ev.stopPropagation();
      });
      

      const bar = mk('div', { className: 'curveBar' });
      const trak = mk('div', { className: 'trak' });
      trak.append(mk('div', { className: 'grad' }));
      const pctOf = v => ((curveView.ink ? 255 - Math.max(0, Math.min(255, v)) : Math.max(0, Math.min(255, v))) / 255 * 100) + '%';
      if (curveView.ink) bar.classList.add('ink');
      const triOf = side => {
        const el = mk('span', { className: 'ctri' + (side === 'white' ? ' w' : '') });
        el.dataset.attr = A(side);
        el.tabIndex = 0;
        el.title = side === 'white' ? '白场：曲线最后一个点的输入（往里拖 = 高光更亮）'
                                    : '黑场：曲线第一个点的输入（往里拖 = 暗部更黑）';
        el.setAttribute('aria-label', el.title);
        el.addEventListener('pointerdown', ev => {
          if (ev.button != null && ev.button !== 0) return;
          const r = trak.getBoundingClientRect();
          if (!r.width) return;                  
          const size = lockSize || { w: cv.clientWidth || 240 };
          const list0 = curvePtsOf(t, st);
          const start = (side === 'white' ? list0[list0.length - 1] : list0[0]).input;
          const sens = (curveView.ink ? -255 : 255) / r.width;   
          lockSize = size;
          beginLayerEdit();                      
          beginDragAdjust(ev, acc => {
            setCurveEnd(idx, t, st, side, Math.round(start + acc * sens));
            drawCurveGrid(cv, t, st, size);
            for (const c of controls) c.sync();
            syncTris();
          }, () => { lockSize = null; endLayerEdit(); rebuild(); });
        });
        return el;
      };
      const triB = triOf('black'), triW = triOf('white');
      const syncTris = () => {
        const list = curvePtsOf(t, st);
        if (list.length < 2) return;
        triB.style.left = pctOf(list[0].input);
        triW.style.left = pctOf(list[list.length - 1].input);
      };
      trak.append(triB, triW);
      bar.append(trak);
      wrap.append(bar);
      syncTris();
      grids.push({ cv, sync: () => { drawCurveGrid(cv, t, st); syncTris(); } });
      if (row.eye) {                             
        const ctx2 = { idx, t, st, main, readVal, writeVal, rebuild, beginDrag: startDrag, finishDrag };
        const eyes = buildAdjEyeRow(mk, A(row.eye.id), (which, c) => row.eye.pick(which, c, ctx2));
        eyes.classList.add('adj-eye-col');
        const lab = eyes.querySelector('label.k'); if (lab) lab.remove();
        const box = mk('div', { className: 'curveBox' });
        box.append(eyes, wrap);
        panel.append(box);
      } else panel.append(wrap);
      continue;
    }
  }

  
  body.append(panel);
  const sync = () => {
    for (const c of controls) c.sync();
    for (const h of hists) drawAdjHist(h.cv, idx, h.levelOf);
    for (const g2 of grids) g2.sync();
  };
  sync();
  return panel;
}

function drawAdjHist(cv, idx, levelOf){
  const h = adjLayerHistogram(idx);
  lvDrawHist(cv, h ? lvBins(h, 'rgb') : null, null, h ? [{ level: levelOf(), color: '#e8a33d' }] : []);
}









export function commitCurveList(idx, t, st, list, done){
  if (list.length < 2 || list.length > 19) {
    $('#notice').textContent = `曲线至少要 2 个点、最多 19 个点（现在要写成 ${list.length} 个）。`;
    return false;
  }
  const ch = Math.max(0, +st.channel || 0);
  const key = `setLayerParams:${t.main.target}:${t.main.at || 0}`;
  const raw = curveFilePts(t, ch);
  const same = raw.length === list.length && raw.every((p, k) => p.input === list[k].input && p.output === list[k].output);
  const mirrors = curveMirrorPaths(t, ch);
  const fileInputs = raw.map(p => p.input);
  const sorted = fileInputs.every((v, k) => k === 0 || fileInputs[k - 1] <= v);
  return commitLayerOps(idx, () => {
    

    const mine = p => mirrors.some(m => p === m || p.startsWith(m + '.'));
    const op = findLayerOp(idx, key) || { op: 'setLayerParams', index: idx, target: t.main.target, at: t.main.at || 0, values: {} };
    op.values = op.values || {};
    for (const p of Object.keys(op.values)) if (mine(p)) delete op.values[p];
    const keepOps = (op.arrayOps || []).filter(a => !mine(a.path));
    if (keepOps.length) op.arrayOps = keepOps; else delete op.arrayOps;
    if (same) {                                                               
      if (!Object.keys(op.values).length && !op.arrayOps) dropLayerOp(idx, key); else putLayerOp(idx, op);
      if (done) done(); return true;
    }
    const arrayOps = [], values = {};
    for (const path of mirrors) {
      if (!sorted && raw.length > 1) arrayOps.push({ path, sortBy: 'input' });
      for (let k = raw.length; k > list.length; k--) arrayOps.push({ path, removeAt: k - 1 });
      for (let k = raw.length; k < list.length; k++) {
        arrayOps.push({ path, insertAt: k, copyFrom: Math.max(0, Math.min(k - 1, raw.length - 1)),
          value: { input: list[k].input, output: list[k].output } });
      }
    }
    for (let k = 0; k < list.length; k++) for (const path of mirrors) {
      values[`${path}.${k}.input`] = list[k].input;
      values[`${path}.${k}.output`] = list[k].output;
    }
    Object.assign(op.values, values);
    if (arrayOps.length) op.arrayOps = (op.arrayOps || []).concat(arrayOps);
    putLayerOp(idx, op);
    if (done) done();
    return true;
  });
}
const floatOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function curveFilePts(t, ch){
  const n = t.main.fields.filter(f => new RegExp(`^channels\\.${ch}\\.points\\.\\d+\\.input$`).test(f.path)).length;
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push({
      input: floatOr(blockValue(t.main, `channels.${ch}.points.${k}.input`), 0),
      output: floatOr(blockValue(t.main, `channels.${ch}.points.${k}.output`), 0),
    });
  }
  return out;
}

function curvePointCount(t, ch){
  let n = curveFilePts(t, ch).length;
  const op = findLayerOp(adjCtlState.idx, `setLayerParams:${t.main.target}:${t.main.at || 0}`);
  for (const a of ((op && op.arrayOps) || [])) {
    if (a.path !== `channels.${ch}.points`) continue;
    if (a.insertAt !== undefined) n++; else if (a.removeAt !== undefined) n--;
  }
  return n;
}

export function curvePtsOf(t, st){
  const ch = Math.max(0, +st.channel || 0);
  const n = curvePointCount(t, ch);
  const list = [];
  for (let k = 0; k < n; k++) {
    const pin = curvePath(ch, k, 'input'), pout = curvePath(ch, k, 'output');
    const rb = blockValue(t.main, pin), ro = blockValue(t.main, pout);
    list.push({
      idx: k,
      input: floatOr(effParam(adjCtlState.idx, t.main.target, 0, pin, rb === undefined ? 0 : rb), 0),
      output: 0,
    });
    

    const last = list[list.length - 1];
    last.output = floatOr(effParam(adjCtlState.idx, t.main.target, 0, pout, ro === undefined ? last.input : ro), last.input);
  }
  return list.sort((a, b) => a.input - b.input || a.idx - b.idx);
}
const curvePath = (ch, idx, field) => `channels.${ch}.points.${idx}.${field}`;

export function curveCtxNow(){
  const idx = adjCtlState.idx;
  const t = adjLayerTarget(idx);
  if (!t) return null;
  return { idx, t, st: { channel: (adjCtlState.sel && adjCtlState.sel.channel) || '0' } };
}

function curveSelPoint(t, st){
  const list = curvePtsOf(t, st);
  if (!list.length) return null;
  return list[Math.max(0, Math.min(list.length - 1, adjCtlState.curvePt || 0))];
}

export function readCurvePoint(idx, t, st, path){
  const p = curveSelPoint(t, st);
  return p ? p[path] : undefined;
}


function writeCurvePoint(idx, t, st, path, v, after){
  const list = curvePtsOf(t, st);
  if (!list.length) return;
  const k = Math.max(0, Math.min(list.length - 1, adjCtlState.curvePt || 0));
  let nv = Math.max(0, Math.min(255, Math.round(v)));
  if (path === 'input') {
    const lo = k === 0 ? 0 : list[k - 1].input + 1;
    const hi = k === list.length - 1 ? 255 : list[k + 1].input - 1;
    nv = Math.max(lo, Math.min(hi, nv));
  }
  if (list[k][path] === nv) return;
  const next = list.map((p, i) => i === k ? { ...p, [path]: nv } : { ...p });
  commitCurveList(idx, t, st, next, after);
}

function setCurvePoint(idx, t, st, k, input, output, after){
  const list = curvePtsOf(t, st);
  if (!list.length) return;
  k = Math.max(0, Math.min(list.length - 1, k));
  const next = list.map((p, i) => {
    if (i !== k) return { ...p };
    const q = { ...p };
    if (input != null) q.input = Math.max(0, Math.min(255, Math.round(input)));
    

    if (output != null) q.output = Math.max(0, Math.min(255, Math.round(output)));
    return q;
  });
  adjCtlState.curvePt = k;
  commitCurveList(idx, t, st, next, after);
}


export function moveCurvePoint(idx, t, st, k, input, output, after){
  const list = curvePtsOf(t, st);
  if (!list.length) return;
  k = Math.max(0, Math.min(list.length - 1, k));
  const n = list.length;
  const lo = k === 0 ? 0 : list[k - 1].input + 1;
  const hi = k === n - 1 ? 255 : list[k + 1].input - 1;
  setCurvePoint(idx, t, st, k, Math.max(lo, Math.min(hi, input)), output, after);
}


function curveMirrorPaths(t, ch){
  const paths = [`channels.${ch}.points`];
  const cnt = re => t.main.fields.filter(f => re.test(f.path)).length;
  const chN = cnt(/^channels\.\d+\.points\.0\.input$/), exN = cnt(/^extra\.\d+\.points\.0\.input$/);
  if (exN && exN === chN) paths.push(`extra.${ch}.points`);
  return paths;
}


const CURVE_PADL = 6;
function curveInnerOf(cv, size){
  





  if (!cv.__cw) {
    const raw = (size && size.w) || cv.clientWidth || 0;
    if (raw > 0) { cv.__cw = Math.round(raw); adjCtlState.curveW = cv.__cw; }
  }
  

  const w = Math.max(96, Math.round((size && size.w) || cv.__cw || adjCtlState.curveW || 240));
  const iw = Math.max(48, w - CURVE_PADL);
  return { w, h: iw, x0: CURVE_PADL, iw, ih: iw };
}



export function setCurveEnd(idx, t, st, side, input){
  const list = curvePtsOf(t, st);
  if (list.length < 2) return;
  const k = side === 'white' ? list.length - 1 : 0;
  const lo = k === 0 ? 0 : list[k - 1].input + 1;
  const hi = k === 0 ? list[k + 1].input - 1 : 255;
  setCurvePoint(idx, t, st, k, Math.max(lo, Math.min(hi, Math.round(input))), null);
}








function drawCurveGrid(cv, t, st, size){
  const { w, h, x0, iw, ih } = curveInnerOf(cv, size);
  const dpr = Math.min(3, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  }
  const g = cv.getContext && cv.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  



  const ch = Math.max(0, +(st && st.channel) || 0);
  const CH_CURVE = ['#f0f0f2', '#ff1a1a', '#16e016', '#2f6bff'];   
  
  const CH_BG_STOPS = [
    null,                                                            
    ['#5c0d10', '#474747', '#004a4a'],                               
    ['#0d5c10', '#474747', '#4a004a'],                               
    ['#0e1060', '#474747', '#4a4a00'],                               
  ];
  const stops = ch >= 1 && CH_BG_STOPS[ch];
  let bgFill = '#3f3f42';
  if (stops) {
    const bgGrad = g.createLinearGradient && g.createLinearGradient(x0, 0, x0 + iw, ih);   
    if (bgGrad && typeof bgGrad.addColorStop === 'function') {
      bgGrad.addColorStop(0, stops[0]);
      bgGrad.addColorStop(0.5, stops[1]);
      bgGrad.addColorStop(1, stops[2]);
      bgFill = bgGrad;
    } else bgFill = stops[1];
  }
  g.fillStyle = bgFill; g.fillRect(x0, 0, iw, ih);                     
  


  const ink = !!curveView.ink, V = v => (ink ? 255 - v : v);    
  g.fillStyle = '#000000'; g.fillRect(0, 0, CURVE_PADL, ih);
  const grad = g.createLinearGradient && g.createLinearGradient(0, 0, 0, ih);
  if (grad && typeof grad.addColorStop === 'function') {
    grad.addColorStop(0, ink ? '#000000' : '#ffffff'); grad.addColorStop(1, ink ? '#ffffff' : '#000000');
    g.fillStyle = grad; g.fillRect(0, 0, CURVE_PADL, ih);
  }
  

  const hist = curveView.hist ? cv.__hist : null;
  if (hist) {
    const bins = ch === 1 ? hist.r : ch === 2 ? hist.g : ch === 3 ? hist.b : lvBins(hist, 'rgb');
    let top = 0;
    for (let i = 1; i < 255; i++) if (bins[i] > top) top = bins[i];
    if (!top) for (let i = 0; i < 256; i++) if (bins[i] > top) top = bins[i];
    if (top > 0) {
      g.save(); g.beginPath(); g.rect(x0, 0, iw, ih); g.clip();
      g.fillStyle = stops ? 'rgba(20,20,22,.32)' : 'rgba(150,150,156,.42)';
      g.beginPath(); g.moveTo(x0, ih);
      for (let i = 0; i < 256; i++) {
        const hx = x0 + (V(i) + 0.5) / 256 * iw, hy = ih - Math.min(1, bins[i] / top) * ih * 0.96;
        g.lineTo(hx, hy);
      }
      g.lineTo(x0 + iw, ih); g.closePath(); g.fill();
      g.restore();
    }
  }
  g.strokeStyle = stops ? 'rgba(20,20,22,.55)' : '#323234'; g.lineWidth = 1;                    
  const cells = adjCtlState.curveFine ? 10 : 4;
  for (let i = 1; i < cells; i++) {
    const px = Math.round(x0 + iw * i / cells) + 0.5, py = Math.round(ih * i / cells) + 0.5;
    g.beginPath(); g.moveTo(px, 0); g.lineTo(px, ih); g.moveTo(x0, py); g.lineTo(x0 + iw, py); g.stroke();
  }
  if (curveView.baseline) {                                     
    g.strokeStyle = '#6d6d70';
    g.beginPath(); g.moveTo(x0 + 0.5, ih - 0.5); g.lineTo(x0 + iw - 0.5, 0.5); g.stroke();
  }
  const P = p => ({ x: x0 + V(p.input) / 255 * iw, y: ih - V(p.output) / 255 * ih });
  const pts = curvePtsOf(t, st);
  const sel = Math.max(0, Math.min(Math.max(0, pts.length - 1), adjCtlState.curvePt || 0));
  if (pts[sel] && curveView.cross) {                             
    const q = P(pts[sel]), gx = Math.round(q.x) + 0.5, gy = Math.round(q.y) + 0.5;
    g.strokeStyle = 'rgba(230,232,236,.34)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, ih); g.moveTo(x0, gy); g.lineTo(x0 + iw, gy); g.stroke();
  }
  
  const strokeCurve = (list, color, width) => {
    const f = curveSampler(list);
    g.save(); g.beginPath(); g.rect(x0, 0, iw, ih); g.clip();
    g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    const N = Math.max(256, Math.round(iw * 2));
    for (let j = 0; j <= N; j++) {
      const x = j / N * 255, y = Math.max(0, Math.min(255, f(x)));
      const px = x0 + V(x) / 255 * iw, py = ih - V(y) / 255 * ih;
      j ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke(); g.restore();
  };
  
  if (curveView.overlay && t && t.main && Math.max(0, +(st && st.channel) || 0) === 0) {
    const nCh = curveChannelOptions(t).length;
    const tint = ['', 'rgba(235,80,80,.85)', 'rgba(90,205,95,.85)', 'rgba(90,140,245,.9)'];
    for (let c = 1; c < Math.min(4, nCh); c++) {
      const cp = curvePtsOf(t, { channel: String(c) });
      const ident = cp.length === 2 && cp[0].input === 0 && cp[0].output === 0 && cp[1].input === 255 && cp[1].output === 255;
      if (cp.length >= 2 && !ident) strokeCurve(cp, tint[c], 1.3);
    }
  }
  if (pts.length >= 2) strokeCurve(pts, CH_CURVE[ch] || '#f0f0f2', 2);           
  pts.forEach((p, i) => {                                        
    const q = P(p), s = i === sel ? 9 : 7;
    const bx = Math.round(q.x - s / 2) + 0.5, by = Math.round(q.y - s / 2) + 0.5;
    if (i === sel) {
      g.fillStyle = '#f2f2f4'; g.fillRect(bx, by, s - 1, s - 1);
      g.strokeStyle = '#1c1c1e'; g.lineWidth = 1; g.strokeRect(bx, by, s - 1, s - 1);
    } else {
      g.strokeStyle = ch >= 1 ? (CH_CURVE[ch] || '#e9e9ec') : '#e9e9ec'; g.lineWidth = 1.6; g.strokeRect(bx, by, s - 1, s - 1);
    }
  });
}


export function buildAdjCtlFoot(box, idx, kind){
  const l = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!l) return;
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const foot = mk('div', { className: 'adj-foot' });
  const btn = (attr, name, title) => {
    const b = mk('button', { type: 'button', className: 'af-btn' });
    b.dataset.attr = attr; b.title = title; b.setAttribute('aria-label', title);
    b.append(icon(name, 14));
    return b;
  };
  

  const rst = btn('adjp-reset', 'adj-reset', '复位到调整默认值');
  if (kind) rst.onclick = () => resetAdjLayer(idx, kind); else { rst.disabled = true; rst.title = '这类调整没有可复位的参数控件'; }
  const clip = btn('adjp-clip', 'adj-clip', '此调整剪切到此图层（单击可影响下面的所有图层）');
  const on = effClipping(idx, l);
  clip.classList.toggle('on', on);
  clip.title = on ? '此调整影响下面的所有图层（单击可剪切到图层）' : '此调整剪切到此图层（单击可影响下面的所有图层）';
  clip.onclick = () => {
    const v = !effClipping(idx, l);
    setOpField(idx, { op: 'setLayerProps' }, 'clipping', v, !!l.clipping);
    if (doc && doc.layers[idx]) doc.layers[idx].clipping = v ? 1 : 0;   
    renderStaticLayers();
  };
  const eye = btn('adjp-eye', 'eye', '切换图层可见性');
  const vis = () => { const e = layerEdits[idx]; return e && e.visible != null ? e.visible : !(doc.layers[idx] || {}).hidden; };
  const syncEye = () => { const v = vis(); eye.classList.toggle('off', !v); eye.replaceChildren(icon(v ? 'eye' : 'eye-off', 14)); };
  eye.onclick = () => { pushDocHistory('显示/隐藏图层'); setLayerVisible(idx, !vis()); syncEye(); renderLayerPanel(); };
  syncEye();
  const prevBtn = btn('adjp-prev', PP ? PP.prevStateIcon : 'undo-2', '按此按钮可查看上一状态（\\）');
  if (PP) PP.bindPrevState(prevBtn, idx); else prevBtn.disabled = true;
  const del = btn('adjp-delete', 'trash-2', '删除此调整图层');
  del.onclick = () => { if (selLayer !== idx) { set_selLayer(idx); selLayers.clear(); } actions.run('layer.delete'); };
  foot.append(clip, prevBtn, rst, eye, del);
  box.append(foot);
}




export function resetAdjLayer(idx, kind){
  const t = adjLayerTarget(idx);
  if (!t || t.kind !== kind) return;
  
  beginLayerEdit(); set_docHistLock(true);
  if (kind === 'levels') {
    
    const entries = [];
    for (const f of t.main.fields) {
      const m = /^records\.\d+\.(shadowInput|highlightInput|shadowOutput|highlightOutput|midtoneInput)$/.exec(f.path);
      if (m) entries.push([f.path, { shadowInput: 0, highlightInput: 255, shadowOutput: 0, highlightOutput: 255, midtoneInput: 100 }[m[1]], f.value]);
    }
    setParamFieldsBatch(idx, t.main.target, 0, entries);
  } else if (kind === 'brightnessContrast') {
    for (const [block, map] of BC_BLOCKS) {
      const bt = t.blocks.find(x => x.block === block);
      if (!bt) continue;
      const entries = [];
      for (const key of ['brightness', 'contrast']) {
        const base = blockValue(bt, map[key]);
        if (base !== undefined) entries.push([map[key], 0, base]);
      }
      setParamFieldsBatch(idx, bt.target, 0, entries);
    }
  } else if (kind === 'curv') {
    

    const n = curveChannelOptions(t).length;
    for (let ch = 0; ch < n; ch++) commitCurveList(idx, t, { channel: String(ch) }, [{ input: 0, output: 0 }, { input: 255, output: 255 }]);
    adjCtlState.curvePt = 0;
  } else {
    const spec = ADJ_FORM[kind] || { rows: [] };
    const entries = [];
    for (const row of spec.rows) {
      


      if (row.def === undefined || !row.p || typeof row.p === 'function') continue;
      if (!ADJ_SCALAR_ROWS.has(row.k)) continue;
      const b = blockValue(t.main, row.p);
      const v = row.mul ? row.def * row.mul : row.def;
      if (b !== undefined) entries.push([row.p, v, b]);
    }
    for (const [path, value] of (ADJ_RESET[kind] || [])) {
      const b = blockValue(t.main, path);
      if (b !== undefined) entries.push([path, value, b]);
    }
    setParamFieldsBatch(idx, t.main.target, 0, entries);   
    

    if (kind === 'grdm') {
      const m = gradNewModel();
      m.clrs.forEach((s, k) => { s.src = k; });
      m.trns.forEach((s, k) => { s.src = k; });
      commitGrdmModel(idx, t.main, grdmModels(idx, t.main, p => blockValue(t.main, p)).orig, m);
    }
  }
  set_docHistLock(false); endLayerEdit();
  renderLayerPanel();
}

const ADJ_RESET = {
  
  hue2: [['enable', false],
    ['master.0', 0], ['master.1', 0], ['master.2', 0],
    ...[0, 1, 2, 3, 4, 5].flatMap(r => [[`ranges.${r}.settings.0`, 0], [`ranges.${r}.settings.1`, 0], [`ranges.${r}.settings.2`, 0]])],
  
  mixr: [['monochrome', false],
    ['channels.0.0', 100], ['channels.0.1', 0], ['channels.0.2', 0], ['channels.0.4', 0],
    ['channels.1.0', 0], ['channels.1.1', 100], ['channels.1.2', 0], ['channels.1.4', 0],
    ['channels.2.0', 0], ['channels.2.1', 0], ['channels.2.2', 100], ['channels.2.4', 0]],
  
  selc: [['method', 0],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(p => [[`plates.${p}.0`, 0], [`plates.${p}.1`, 0], [`plates.${p}.2`, 0], [`plates.${p}.3`, 0]])],
  
  blnc: [['preserveLuminosity', true],
    ...['shadows', 'midtones', 'highlights'].flatMap(k => [[`${k}.0`, 0], [`${k}.1`, 0], [`${k}.2`, 0]])],
};





export function renderAdjustCtl(box, idx = selLayer, t = adjLayerTarget(idx)){
  if (!box || !t) return;
  if (adjCtlState.idx !== idx) { adjCtlState.idx = idx; adjCtlState.channel = 'rgb'; }
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  box.innerHTML = '';
  if (t.kind === 'levels') {
    buildLevelsControl({ body: box, mk, mkEl: mk, attr: 'adjp' },
                       panelLevelsV(idx, t, adjLayerHistogram(idx)));
  } else if (t.kind === 'brightnessContrast') {
    buildBcControl({ body: box, mk }, idx, t);
  } else {
    buildAdjForm({ body: box, mk, attr: 'adjp' }, idx, t, ADJ_FORM[t.kind]);
  }
  buildAdjCtlFoot(box, idx, t.kind);
}

function applyAdjustNow(){
  const S = adjState; if (!S) return false;
  let out;
  try { out = adjCompute(true); }
  catch (e) { $('#err').textContent = '这次调整没能应用：' + humanEditError(e && e.message || e); return false; }
  


  const before = S.base;
  S.pp.rgba.set(out);
  const box = diffBox(before, S.pp.rgba, S.pp.w, S.pp.h, 4);
  if (box) {                                  
    histPush(adjLabel(S.type), 'brush');
    brushHistory.undo.push({ kind: 'pixels', idx: S.idx, rect: box, px: 4, adjust: adjLabel(S.type),
                             before: cutRect(before, S.pp.w, box, 4), after: cutRect(S.pp.rgba, S.pp.w, box, 4) });
    if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
    brushHistory.redo.length = 0;
  }
  const ok = commitPixelPaint(S.idx);
  if (ok && box) actRecord('adjust', { type: S.type, model: JSON.parse(JSON.stringify(S.model)) });
  if (ok) $('#notice').textContent = box
    ? `已应用「${adjLabel(S.type)}」${selection ? '（仅选区内）' : ''}：改动记在图层像素上，导出时写回。`
    : `「${adjLabel(S.type)}」的当前参数等价于不做任何事，没有留下改动。`;
  return ok;
}
export function closeAdjustDialog(silent){
  const S = adjState; if (!S) { if (!silent) $('#adjDlg').close && $('#adjDlg').close(); return; }
  set_adjState(null);
  if (adjRAF) { cancelAnimationFrame(adjRAF); set_adjRAF(0); }
  S.pp.rgba.set(S.base);                      
  delete layerCanvasCache[S.idx]; delete thumbCache[S.idx];
  renderPreviewOnly();
  if (!silent) { const d = $('#adjDlg'); if (d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } else d.removeAttribute('open'); }
}
$('#adjPreview').onchange = () => { if (adjState) { adjState.on = $('#adjPreview').checked; adjRender(); } };
$('#adjKind').onchange = () => { if (adjState) { const t = $('#adjKind').value; closeAdjustDialog(true); openAdjustLazy(t); } };
$('#adjReset').onclick = () => { if (adjState) { adjState.model = adjDefaults(adjState.type); renderAdjustDialog(); adjRender(); } };
$('#adjCancel').onclick = () => closeAdjustDialog(false);
$('#adjOk').onclick = () => {
  const S = adjState; if (!S) return;
  const okd = applyAdjustNow();
  set_adjState(null);                            
  if (adjRAF) { cancelAnimationFrame(adjRAF); set_adjRAF(0); }
  const d = $('#adjDlg'); if (d.close) { try { d.close(); } catch { d.removeAttribute('open'); } } else d.removeAttribute('open');
  if (!okd) { S.pp.rgba.set(S.base); delete layerCanvasCache[S.idx]; delete thumbCache[S.idx]; renderPreviewOnly(); }
};
$('#adjDlg').addEventListener('cancel', ev => { ev.preventDefault(); closeAdjustDialog(false); });


export function renderImageAdjust(box, idx, l, ui){
  const { row, hint, mk } = ui;
  


  const lazyWhy = adjustGuard(idx) ? '' : (!ADJM ? ADJUST.statusText() : '');
  if (lazyWhy) kick(ADJUST);
  const why = adjustGuard(idx) || lazyWhy;
  const sel = mk('select', { title: why || '选一种调整，打开对话框（实时预览 / 确定 / 取消）' });
  sel.dataset.attr = 'image-adjust';
  sel.append(mkEl('option', { value: '', textContent: '图像调整…' }));
  for (const t of adjTypes()) {
    const o = mkEl('option', { value: t, textContent: adjLabel(t) });
    o.title = ADJ_ALL[t].accepts; o.dataset.adj = t; sel.append(o);
  }
  sel.value = '';
  sel.disabled = !!why;
  sel.onchange = () => { const t = sel.value; sel.value = ''; if (t) openAdjustLazy(t); };
  row('图像调整', sel);
  if (why) hint(why, 'warn');
  else hint('PS「图像 › 调整」那一组，**直接改图层像素**（破坏性）'
    + (selection ? '；当前有选区，调整只作用于选区内' : '')
    + '。这个菜单不列可选颜色、自然饱和度、照片滤镜与新版亮度/对比度；自然饱和度和照片滤镜在非破坏性调整图层预览中有明确标注的近似实现。');
}
