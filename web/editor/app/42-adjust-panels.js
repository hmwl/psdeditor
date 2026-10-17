




import './41-image-adjust.js';   
import { compositeAll } from '../../../core/app.js';
import { doc, docH, docW, layerDeletes, layerTree } from './02-doc-state.js';
import { beginLayerEdit, endLayerEdit, set_docHistLock } from './03-history.js';
import { selLayer } from './23-layers-panel.js';
import {
  effParam, layerParams, schedulePanelRebuild, setParamField, setParamFieldsBatch,
} from './24-layer-ops-queue.js';
import { scrubHitOf, startScrub } from './29-scrubby-live.js';
import { previewCompositeDoc } from './30-render.js';
import { LV_CH_KEYS, lvAutoGroups, lvBins, lvHistOf, lvMatchPreset, lvNeutralGroup } from './41-image-adjust.js';
import { curveEyePick, expEyePick } from './43-gradient-map-adjust-form.js';















const LV_REC = { rgb: 0, r: 1, g: 2, b: 3 };            
const LV_FIELD = { inputBlack: 'shadowInput', inputWhite: 'highlightInput', gamma: 'midtoneInput',
                   outputBlack: 'shadowOutput', outputWhite: 'highlightOutput' };


export const BC_BLOCKS = [['CgEd', { brightness: 'Brgh', contrast: 'Cntr' }], ['brit', { brightness: 'brightness', contrast: 'contrast' }]];
const BC_RANGE = { brightness: [-150, 150], contrast: [-50, 100] };   
const ADJ_HIST_MAX_PX = 9e6;                            







export const adjCtlState = { idx: -1, channel: 'rgb', drags: 0, sel: {}, selIdx: -1, curvePt: 0 };


const CURVE_VIEW_KEY = 'psd_editor.curveDisplay';
export const curveView = (() => {
  const d = { ink: false, fine: false, overlay: true, hist: true, baseline: true, cross: true };
  try { Object.assign(d, JSON.parse(localStorage.getItem(CURVE_VIEW_KEY) || '{}')); } catch { }
  return d;
})();
adjCtlState.curveFine = !!curveView.fine;
export function setCurveView(v){
  for (const k of ['ink', 'fine', 'overlay', 'hist', 'baseline', 'cross']) if (v[k] !== undefined) curveView[k] = !!v[k];
  adjCtlState.curveFine = curveView.fine;
  try { localStorage.setItem(CURVE_VIEW_KEY, JSON.stringify(curveView)); } catch { }
}



export function adjLayerTarget(idx = selLayer){
  if (!doc || !layerTree || idx < 0 || idx >= doc.layers.length || layerDeletes.has(idx)) return null;
  const p = layerParams(idx);
  if (!p || p.error || !p.adjustment || !(p.adjustment.targets || []).length) return null;
  const targets = p.adjustment.targets;
  const lv = targets.find(t => t.block === 'levl');
  if (lv) return { kind: 'levels', label: '色阶', main: lv, blocks: [lv] };
  const bc = targets.filter(t => BC_BLOCKS.some(([b]) => b === t.block));
  if (bc.length) return { kind: 'brightnessContrast', label: '亮度/对比度',
                          main: bc.find(t => t.block === 'CgEd') || bc[0], blocks: bc };
  
  for (const t of targets) {
    const key = t.block.trim();
    if (ADJ_FORM[key]) return { kind: key, label: ADJ_LABEL[key] || t.label || key, main: t, blocks: [t] };
  }
  return null;
}

const ADJ_LABEL = { expA: '曝光度', vibA: '自然饱和度', post: '色调分离', thrs: '阈值', nvrt: '反相',
  blwh: '黑白', blnc: '色彩平衡', mixr: '通道混合器', selc: '可选颜色', hue2: '色相/饱和度', curv: '曲线',
  phfl: '照片滤镜', clrL: '颜色查找', grdm: '渐变映射' };



export function dedicatedAdjBlocks(idx){
  const out = new Set();
  const t = adjLayerTarget(idx);
  if (t) for (const b of t.blocks) out.add(b.block);
  return out;
}


export const blockValue = (t, path) => { const f = t.fields.find(x => x.path === path); return f ? f.value : undefined; };





export function adjLayerHistogram(idx){
  const n = docW * docH;
  if (!n || n > ADJ_HIST_MAX_PX || idx <= 0) return null;
  try {
    const src = previewCompositeDoc(doc);                
    const surf = compositeAll({ ...src, layers: src.layers.slice(0, idx) }, docW, docH, new Map());
    return lvHistOf(surf.data, n);
  } catch { return null; }
}















export function bwAutoWeights(idx){
  const n = docW * docH;
  

  if (!n || n > ADJ_HIST_MAX_PX || idx <= 0) return null;
  let data;
  try {
    const src = previewCompositeDoc(doc);
    data = compositeAll({ ...src, layers: src.layers.slice(0, idx) }, docW, docH, new Map()).data;
  } catch { return null; }
  if (!data) return null;
  
  const step = Math.max(1, Math.ceil(Math.sqrt(n / 40000)));
  const A = new Float64Array(36), S = new Float64Array(6), L = new Float64Array(6);
  const c = new Float64Array(6);
  let cnt = 0;
  for (let y = 0; y < docH; y += step) {
    for (let x = 0; x < docW; x += step) {
      const q = (y * docW + x) * 4;
      if (data[q + 3] === 0) continue;
      const r = data[q], g = data[q + 1], b = data[q + 2];
      
      let mx, md, mn, pi, si;
      if (r >= g) {
        if (g >= b) { mx = r; md = g; mn = b; pi = 0; si = 1; }          
        else if (r >= b) { mx = r; md = b; mn = g; pi = 0; si = 5; }     
        else { mx = b; md = r; mn = g; pi = 4; si = 5; }                 
      } else {
        if (r >= b) { mx = g; md = r; mn = b; pi = 2; si = 1; }          
        else if (g >= b) { mx = g; md = b; mn = r; pi = 2; si = 3; }     
        else { mx = b; md = g; mn = r; pi = 4; si = 3; }                 
      }
      c.fill(0);
      c[pi] = (mx - md) / 255; c[si] = (md - mn) / 255;
      const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      for (let i = 0; i < 6; i++) {
        S[i] += c[i]; L[i] += luma * c[i];
        for (let j = 0; j < 6; j++) A[i * 6 + j] += c[i] * c[j];
      }
      cnt++;
    }
  }
  if (cnt < 32) return null;
  const C = new Float64Array(36);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) C[i * 6 + j] = A[i * 6 + j] / cnt - S[i] * S[j] / (cnt * cnt);
  
  let v = new Float64Array([40, 60, 40, 60, 20, 80]);
  const norm = a => { let s = 0; for (const t of a) s += t * t; s = Math.sqrt(s) || 1; for (let i = 0; i < 6; i++) a[i] /= s; };
  norm(v);
  for (let it = 0; it < 64; it++) {
    const w = new Float64Array(6);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) w[i] += C[i * 6 + j] * v[j];
    const m = Math.sqrt(w[0] ** 2 + w[1] ** 2 + w[2] ** 2 + w[3] ** 2 + w[4] ** 2 + w[5] ** 2);
    if (!(m > 1e-12)) break;                       
    for (let i = 0; i < 6; i++) v[i] = w[i] / m;
  }
  
  let corr = 0; for (let i = 0; i < 6; i++) corr += L[i] * v[i];
  if (corr < 0) for (let i = 0; i < 6; i++) v[i] = -v[i];
  if (!v.some(t => Math.abs(t) > 1e-9)) return null;
  
  const ts = [];
  for (let y = 0; y < docH; y += step) {
    for (let x = 0; x < docW; x += step) {
      const q = (y * docW + x) * 4;
      if (data[q + 3] === 0) continue;
      const r = data[q], g = data[q + 1], b = data[q + 2];
      let mx, md, mn, pi, si;
      if (r >= g) {
        if (g >= b) { mx = r; md = g; mn = b; pi = 0; si = 1; }
        else if (r >= b) { mx = r; md = b; mn = g; pi = 0; si = 5; }
        else { mx = b; md = r; mn = g; pi = 4; si = 5; }
      } else {
        if (r >= b) { mx = g; md = r; mn = b; pi = 2; si = 1; }
        else if (g >= b) { mx = g; md = b; mn = r; pi = 2; si = 3; }
        else { mx = b; md = g; mn = r; pi = 4; si = 3; }
      }
      ts.push((mx - md) / 255 * v[pi] + (md - mn) / 255 * v[si]);
    }
  }
  ts.sort((a, b) => a - b);
  const p2 = ts[Math.floor(ts.length * 0.02)], p98 = ts[Math.min(ts.length - 1, Math.floor(ts.length * 0.98))];
  const span = p98 - p2;
  const scale = span > 1e-6 ? 255 / span : 100;
  const KEYS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  const out = {};
  for (let i = 0; i < 6; i++) out[KEYS[i]] = Math.max(-200, Math.min(300, Math.round(v[i] * scale)));
  return out;
}


export function panelLevelsV(idx, t, hist){
  const target = t.main.target;
  const pathOf = (ch, field) => `records.${LV_REC[ch]}.${LV_FIELD[field]}`;
  

  const read = (ch, key) => {
    const p = pathOf(ch, key), b = blockValue(t.main, p);
    if (b === undefined) return key === 'inputWhite' || key === 'outputWhite' ? 255 : key === 'gamma' ? 1 : 0;
    const v = effParam(idx, target, 0, p, b);
    return key === 'gamma' ? (Number.isFinite(v) ? v / 100 : 1) : (Number.isFinite(v) ? v : 0);
  };
  const groupOf = ch => ({ inputBlack: read(ch, 'inputBlack'), inputWhite: read(ch, 'inputWhite'),
                           gamma: read(ch, 'gamma'), outputBlack: read(ch, 'outputBlack'),
                           outputWhite: read(ch, 'outputWhite') });
  const V = {
    

    channels: () => LV_CH_KEYS.filter(ch => blockValue(t.main, pathOf(ch, 'inputBlack')) !== undefined
      && (ch === 'rgb' || (doc && doc.mode === 3))),
    channel: () => adjCtlState.channel,
    setChannel: ch => { adjCtlState.channel = ch; },
    group: groupOf,
    set: (ch, patch) => {
      const entries = [];
      for (const [key, v] of Object.entries(patch)) {
        const p = pathOf(ch, key), b = blockValue(t.main, p);
        if (b === undefined) continue;                   
        entries.push([p, key === 'gamma' ? Math.round(v * 100) : Math.round(v), b]);
      }
      setParamFieldsBatch(idx, target, 0, entries);      
    },
    presetOf: ch => lvMatchPreset(groupOf(ch)),
    bins: ch => lvBins(hist, ch),
    auto: () => {                                       
      const want = {};
      for (const ch of V.channels()) want[ch] = groupOf(ch);
      const g = lvAutoGroups(hist, ch => (want[ch] ? want[ch].gamma : 1));
      if (!g) return;
      want.rgb = lvNeutralGroup();                      
      Object.assign(want, g);                           
      adjCtlState.channel = 'rgb';
      

      beginLayerEdit(); set_docHistLock(true);
      for (const ch of V.channels()) V.set(ch, want[ch]);
      set_docHistLock(false); endLayerEdit(); schedulePanelRebuild();
    },
    rebuild: () => schedulePanelRebuild(),              
    after: () => {},                                    
    





    pickPoint: (which, c) => {
      const chans = V.channels();
      const rgbCh = [['r', 0], ['g', 1], ['b', 2]].filter(([ch]) => chans.includes(ch));
      const targets = rgbCh.length ? rgbCh : [['rgb', null]];
      V.beginDrag();                                    
      let wrote = false;
      for (const [ch, ci] of targets) {
        const g0 = groupOf(ch);
        const v = ci === null ? Math.round(c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) : c[ci];
        if (which === 'black') {
          const nv = Math.max(0, Math.min(253, Math.min(v, g0.inputWhite - 1)));
          if (nv !== g0.inputBlack) { V.set(ch, { inputBlack: nv }); wrote = true; }
        } else if (which === 'white') {
          const nv = Math.max(2, Math.min(255, Math.max(v, g0.inputBlack + 1)));
          if (nv !== g0.inputWhite) { V.set(ch, { inputWhite: nv }); wrote = true; }
        } else {
          const span = g0.inputWhite - g0.inputBlack;
          if (span <= 0) continue;
          const u = Math.max(0.01, Math.min(0.99, (v - g0.inputBlack) / span));
          const nv = Math.round(Math.max(0.1, Math.min(9.99, Math.log(u) / Math.log(0.5))) * 100) / 100;
          if (Math.abs(nv - g0.gamma) > 1e-9) { V.set(ch, { gamma: nv }); wrote = true; }
        }
      }
      V.endDrag();
      return wrote;
    },
    

    beginDrag: () => { if (adjCtlState.drags++ === 0) { beginLayerEdit(); set_docHistLock(true); } },
    endDrag: () => {
      if (adjCtlState.drags > 0 && --adjCtlState.drags === 0) {
        set_docHistLock(false); endLayerEdit(); schedulePanelRebuild();   
      }
    },
  };
  return V;
}



export function buildBcControl(ctx, idx, t){
  const { body, mk } = ctx;
  const box = mk('div', { className: 'lvPanel bcPanel' });
  const mapOf = block => BC_BLOCKS.find(([b]) => b === block)[1];
  const readOne = field => {                            
    const b = blockValue(t.main, field);
    if (b === undefined) return 0;
    const v = effParam(idx, t.main.target, 0, field, b);
    return Number.isFinite(v) ? v : 0;
  };
  for (const [key, label] of [['brightness', '亮度'], ['contrast', '对比度']]) {
    const [lo, hi] = BC_RANGE[key];
    const cur = readOne(mapOf(t.main.block)[key]);
    const row = mk('div', { className: 'arow' });
    

    const lab = mk('label', { className: 'k scrub', textContent: label, title: '按住左右拖动可调整数值（Shift ×10、Alt ÷10）' });
    lab.dataset.scrubBound = '1';
    const hit = scrubHitOf(lab);
    row.append(lab);
    const sl = mk('input', { type: 'range', min: lo, max: hi, step: 1, value: cur });
    sl.dataset.attr = `adjp-bc-${key}`;
    sl.title = `${label} ${lo}…${hi}（PS 帮助页写死的范围）`;
    const nb = mk('input', { type: 'number', min: lo, max: hi, step: 1, value: cur });
    nb.dataset.attr = `adjp-bc-${key}-num`;
    nb.dataset.scrub = '1';                               
    nb.title = sl.title;
    const put = v => {
      const nv = Math.max(lo, Math.min(hi, Math.round(v) || 0));
      nb.value = sl.value = nv;
      for (const [block, map] of BC_BLOCKS) {
        const bt = t.blocks.find(x => x.block === block);
        if (!bt) continue;                               
        const base = blockValue(bt, map[key]);
        if (base === undefined) continue;
        setParamField(idx, bt.target, 0, map[key], nv, base);
      }
    };
    


    sl.addEventListener('pointerdown', () => beginLayerEdit());
    sl.oninput = () => { nb.value = sl.value; };
    sl.onchange = () => { endLayerEdit(); put(+sl.value); };
    nb.addEventListener('pointerdown', () => beginLayerEdit());
    nb.oninput = () => { sl.value = nb.value; };
    nb.onchange = () => { endLayerEdit(); put(+nb.value); };
    hit.addEventListener('pointerdown', e => startScrub(e, sl, hit));
    row.append(sl, nb);
    box.append(row);
  }
  



  const legT = t.blocks.find(x => x.block === 'CgEd');
  if (legT && blockValue(legT, 'useLegacy') !== undefined) {
    const base = blockValue(legT, 'useLegacy');
    const on = !!effParam(idx, legT.target, 0, 'useLegacy', base);
    const row = mk('label', { className: 'chk' });
    const cb = mk('input', { type: 'checkbox' });
    cb.checked = on;
    cb.dataset.attr = 'adjp-bc-uselegacy';
    cb.title = '勾上 → 画布按旧式算（线性加/压）；不勾 → 画布如实不动。';
    cb.onchange = () => {
      beginLayerEdit();
      setParamField(idx, legT.target, 0, 'useLegacy', cb.checked, base);
      endLayerEdit();
      schedulePanelRebuild();
    };
    row.append(cb, mk('span', { textContent: '使用旧版' }));
    box.append(row);
  }
  box.title = '';
  body.append(box);
  return box;
}



























export const ADJ_FORM = {
  
  expA: {
    note: '曝光度按 2^值 缩放（+1 约等于亮一倍）；位移是线性加减；灰度系数是幂次。'
        + '吸管按内核同一条公式反解：黑场/白场改「位移」，灰场改「灰度系数」（与 PS 的算法未公开，这里是本项目的口径）。',
    rows: [
      { k: 'slider', id: 'exposure', l: '曝光度', p: 'exposure', min: -20, max: 20, step: 0.01, dec: 2, def: 0 },
      { k: 'slider', id: 'offset', l: '位移', p: 'offset', min: -0.5, max: 0.5, step: 0.001, dec: 3, def: 0 },
      { k: 'slider', id: 'gamma', l: '灰度系数校正', p: 'gamma', min: 0.01, max: 9.99, step: 0.01, dec: 2, def: 1 },
      { k: 'eyeRow', id: 'eye', pick: expEyePick },
    ],
  },
  
  vibA: {
    note: '自然饱和度只提「还不够艳」的像素（已经饱和的不动）；饱和度是整体等比缩放。',
    rows: [
      { k: 'slider', id: 'vibrance', l: '自然饱和度', p: 'vibrance', min: -100, max: 100, step: 1, def: 0 },
      { k: 'slider', id: 'strt', l: '饱和度', p: 'Strt', min: -100, max: 100, step: 1, def: 0 },
    ],
  },
  post: { rows: [{ k: 'slider', id: 'levels', l: '色阶数', p: 'levels', min: 2, max: 255, step: 1, def: 4 }] },
  thrs: {
    note: '阈值没有中间调：亮于阈值的变纯白、其余变纯黑。',
    rows: [
      { k: 'slider', id: 'level', l: '阈值色阶', p: 'level', min: 1, max: 255, step: 1, def: 128 },
      { k: 'hist', id: 'hist', l: '这一层之下的亮度分布' },
    ],
  },
  nvrt: { rows: [], empty: '「反相」没有可调参数：每个通道按 255 − 值 反转。' },
  



  blwh: {
    note: '六个滑竿是各色系在灰度里的权重（−200…300，默认 红40/黄60/绿40/青60/蓝20/洋红80）。'
        + '「自动」按这一层之下的画面解一组让灰度铺满色调范围的权重 —— 这是本项目的近似，Adobe 没公开原算法。',
    rows: [
      { k: 'auto', id: 'auto', l: '自动' },
      { k: 'slider', id: 'rd', l: '红色', p: 'Rd  ', min: -200, max: 300, step: 1, def: 40 },
      { k: 'slider', id: 'yllw', l: '黄色', p: 'Yllw', min: -200, max: 300, step: 1, def: 60 },
      { k: 'slider', id: 'grn', l: '绿色', p: 'Grn ', min: -200, max: 300, step: 1, def: 40 },
      { k: 'slider', id: 'cyn', l: '青色', p: 'Cyn ', min: -200, max: 300, step: 1, def: 60 },
      { k: 'slider', id: 'bl', l: '蓝色', p: 'Bl  ', min: -200, max: 300, step: 1, def: 20 },
      { k: 'slider', id: 'mgnt', l: '洋红', p: 'Mgnt', min: -200, max: 300, step: 1, def: 80 },
      { k: 'presetName' },
      { k: 'bool', id: 'usetint', l: '色调', p: 'useTint', def: false },
      { k: 'color', id: 'tint', l: '色调颜色', p: 'tintColor', needs: 'useTint' },
    ],
  },
  
  blnc: {
    note: '色彩平衡是照 GIMP/GEGL 的 PS 兼容实现写的**近似算法，与 PS 不完全一致**（Adobe 的三段掩码没有公开）。',
    rows: [
      { k: 'radio', id: 'tone', l: '色调平衡', def: 'midtones',
        options: [['shadows', '阴影'], ['midtones', '中间调'], ['highlights', '高光']] },
      { k: 'slider', id: 'cr', l: '青色 ←→ 红色', min: -100, max: 100, step: 1, def: 0, p: (st) => `${st.tone || 'midtones'}.0` },
      { k: 'slider', id: 'mg', l: '洋红 ←→ 绿色', min: -100, max: 100, step: 1, def: 0, p: (st) => `${st.tone || 'midtones'}.1` },
      { k: 'slider', id: 'yb', l: '黄色 ←→ 蓝色', min: -100, max: 100, step: 1, def: 0, p: (st) => `${st.tone || 'midtones'}.2` },
      { k: 'bool', id: 'preserve', l: '保持明度', p: 'preserveLuminosity', def: true },
    ],
  },
  

  mixr: {
    note: '每个输出通道是「输入的红/绿/蓝各占多少 %」加一个常数；「单色」勾上后输出通道只剩灰色（用 channels.3）。',
    rows: [
      { k: 'enum', id: 'output', l: '输出通道', def: st => (st.mono ? '3' : '0'),
        options: (st) => (st.mono ? [['3', '灰色']] : [['0', '红'], ['1', '绿'], ['2', '蓝']]),
        onPick: (st, v) => { st.output = v; } },
      { k: 'slider', id: 'r', l: '红色', min: -200, max: 200, step: 1, def: 100, p: (st) => `channels.${st.output || '0'}.0` },
      { k: 'slider', id: 'g', l: '绿色', min: -200, max: 200, step: 1, def: 0, p: (st) => `channels.${st.output || '0'}.1` },
      { k: 'slider', id: 'b', l: '蓝色', min: -200, max: 200, step: 1, def: 0, p: (st) => `channels.${st.output || '0'}.2` },
      { k: 'slider', id: 'const', l: '常数', min: -200, max: 200, step: 1, def: 0, p: (st) => `channels.${st.output || '0'}.4` },
      { k: 'bool', id: 'mono', l: '单色', p: 'monochrome', def: false, after: (st, v) => { st.mono = !!v; st.output = v ? '3' : '0'; } },
    ],
  },
  

  selc: {
    note: '「相对」按当前油墨量的百分比调整（PS 默认），「绝对」按绝对值加。',
    rows: [
      { k: 'enum', id: 'color', l: '颜色', def: '1',
        options: () => [['1', '红色'], ['2', '黄色'], ['3', '绿色'], ['4', '青色'], ['5', '蓝色'],
                        ['6', '洋红'], ['7', '白色'], ['8', '中性色'], ['9', '黑色']] },
      { k: 'slider', id: 'c', l: '青色', min: -100, max: 100, step: 1, def: 0, p: (st) => `plates.${st.color || '1'}.0` },
      { k: 'slider', id: 'm', l: '洋红', min: -100, max: 100, step: 1, def: 0, p: (st) => `plates.${st.color || '1'}.1` },
      { k: 'slider', id: 'y', l: '黄色', min: -100, max: 100, step: 1, def: 0, p: (st) => `plates.${st.color || '1'}.2` },
      { k: 'slider', id: 'k', l: '黑色', min: -100, max: 100, step: 1, def: 0, p: (st) => `plates.${st.color || '1'}.3` },
      { k: 'radio', id: 'method', l: '方法', def: 0, options: [[0, '相对'], [1, '绝对']], p: 'method' },
    ],
  },
  
  hue2: {
    note: '六个色域是按色相划的（红 315/345/15/45…每档 +60°）。勾上「着色」后滑竿改的是着色值。',
    rows: [
      { k: 'enum', id: 'edit', l: '编辑', def: st => (st.colorize ? 'colorize' : 'master'),
        options: (st) => (st.colorize
          ? [['colorize', '着色']]
          : [['master', '全图'], ['0', '红色'], ['1', '黄色'], ['2', '绿色'], ['3', '青色'], ['4', '蓝色'], ['5', '洋红']]) },
      { k: 'slider', id: 'hue', l: '色相', min: -180, max: 180, step: 1, def: 0, p: (st) => huePath(st, 0) },
      { k: 'slider', id: 'sat', l: '饱和度', min: -100, max: 100, step: 1, def: 0, p: (st) => huePath(st, 1) },
      { k: 'slider', id: 'light', l: '明度', min: -100, max: 100, step: 1, def: 0, p: (st) => huePath(st, 2) },
      { k: 'bool', id: 'colorize', l: '着色', p: 'enable', def: false,
        after: (st, v) => { st.colorize = !!v; st.edit = v ? 'colorize' : 'master'; } },
      { k: 'rainbow', id: 'rainbow' },
    ],
  },
  


  curv: {
    note: '',
    rows: [
      { k: 'enum', id: 'channel', l: '通道', def: '0',
        options: (st, t) => curveChannelOptions(t) },
      { k: 'curve', id: 'grid', eye: { id: 'eye', pick: curveEyePick } },   
      { k: 'curveIO', id: 'io' },                           
    ],
  },
  




  phfl: {
    note: '文件里存的是 Lab 颜色 + 浓度（百分比 ×100）+ 保留明度。PS 的「滤镜」下拉是一张固定色值的预设表，'
        + 'Adobe 没有公开那张表，所以这里不摆预设 —— 颜色自己取。',
    rows: [
      { k: 'labColor', id: 'color', l: '颜色', p: 'color', cs: 'colorSpace', def: '#808080' },
      { k: 'slider', id: 'density', l: '浓度', p: 'density', min: 0, max: 100, step: 1, def: 0, mul: 100 },
      { k: 'bool', id: 'preserve', l: '保留明度', p: 'preserveLuminosity', def: true },
    ],
  },
  




  clrL: {
    note: '查找表数据（.cube / .3dl / .look / .csp / ICC）整份存在图层里，画布按它预览（四面体插值）。'
        + '换一个查找表：「图像 › 调整 › 颜色查找…」或「图层 › 新建调整图层 › 颜色查找…」里的「载入…」。',
    rows: [
      { k: 'enum', id: 'type', l: '类型', p: 'lookupType', def: '3DLUT',
        options: [['3DLUT', '3DLUT 文件'], ['abstractProfile', '摘要'], ['deviceLinkProfile', '设备链接']] },
      { k: 'text', id: 'lut', l: '3DLUT 文件', p: 'Nm  ', def: '',
        ph: '（未指定 —— 这一层不做任何事）', fmt: 'LUTFormat', afterWrite: lutFormatOf },
      { k: 'enum', id: 'order', l: '数据顺序', p: 'dataOrder', def: 'rgbOrder',
        options: [['rgbOrder', 'RGB'], ['bgrOrder', 'BGR']] },
      { k: 'bool', id: 'dither', l: '仿色', p: 'Dthr', def: true },
    ],
  },
  


  grdm: {
    note: '点渐变条打开「渐变编辑器」（与渐变工具共用同一个对话框）：加色标、改颜色与不透明度、拖中点，确定才写回。'
        + 'PS 的渐变映射面板上也只有渐变条、反向、仿色这三样。',
    rows: [
      { k: 'gradient', id: 'grad', l: '渐变' },
      { k: 'bool', id: 'reverse', l: '反向', p: 'reverse', def: false },
      { k: 'bool', id: 'dither', l: '仿色', p: 'dither', def: false },
    ],
  },
};

function lutFormatOf(name){
  const ext = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const m = { cube: 'LUTFormatCUBE', '3dl': 'LUTFormat3DL', look: 'LUTFormatLOOK',
              icc: 'LUTFormatICC', icm: 'LUTFormatICC', csp: 'LUTFormatCSP' };
  return ext ? (m[ext[1]] || null) : null;
}


export const ADJ_SCALAR_ROWS = new Set(['slider', 'bool', 'enum', 'text']);

function huePath(st, i){
  if (st.colorize || st.edit === 'colorize') return `colorization.${i}`;
  if (!st.edit || st.edit === 'master') return `master.${i}`;
  return `ranges.${st.edit}.settings.${i}`;
}

export function curveChannelOptions(t){
  const n = t.main.fields.filter(f => /^channels\.\d+\.points\.0\.input$/.test(f.path)).length || 1;
  const name = ['RGB', '红', '绿', '蓝'];
  return Array.from({ length: n }, (_, i) => [String(i), name[i] || `通道 ${i + 1}`]);
}


export function adjSelState(idx){
  if (adjCtlState.selIdx !== idx) { adjCtlState.selIdx = idx; adjCtlState.sel = {}; adjCtlState.curvePt = 0; }
  return adjCtlState.sel;
}





export function curveSampler(pts){
  const p = pts.slice().sort((a, b) => a.input - b.input);
  if (p.length < 2) return x => x;
  const n = p.length, xs = p.map(q => q.input), ys = p.map(q => q.output);
  const H = i => Math.max(1e-6, xs[i + 1] - xs[i]);
  const y2 = new Float64Array(n), u = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const sig = H(i - 1) / Math.max(1e-6, xs[i + 1] - xs[i - 1]);
    const q = sig * y2[i - 1] + 2;
    y2[i] = (sig - 1) / q;
    const dd = (ys[i + 1] - ys[i]) / H(i) - (ys[i] - ys[i - 1]) / H(i - 1);
    u[i] = (6 * dd / Math.max(1e-6, xs[i + 1] - xs[i - 1]) - sig * u[i - 1]) / q;
  }
  for (let k = n - 2; k >= 0; k--) y2[k] = y2[k] * y2[k + 1] + u[k];
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = H(i), t = (x - xs[i]) / h, a = 1 - t;
    return a * ys[i] + t * ys[i + 1] + ((a * a * a - a) * y2[i] + (t * t * t - t) * y2[i + 1]) * h * h / 6;
  };
}

export function curveLUT(pts){
  const out = new Uint8Array(256);
  const f = curveSampler(pts);
  for (let x = 0; x < 256; x++) out[x] = Math.max(0, Math.min(255, Math.round(f(x))));
  return out;
}


const _labF = t => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const _labFInv = t => (t * t * t > 216 / 24389 ? t * t * t : (108 / 841) * (t - 4 / 29));
export function srgbToLab(hex){
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin(parseInt(hex.slice(1, 3), 16)), g = lin(parseInt(hex.slice(3, 5), 16)), b = lin(parseInt(hex.slice(5, 7), 16));
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const Xd = 1.0478112 * X + 0.0228866 * Y - 0.0501270 * Z;
  const Yd = 0.0295424 * X + 0.9904844 * Y - 0.0170491 * Z;
  const Zd = -0.0092345 * X + 0.0150436 * Y + 0.7521316 * Z;
  const fx = _labF(Xd / 0.96422), fy = _labF(Yd), fz = _labF(Zd / 0.82521);
  return { L: Math.round(116 * fy - 16), a: Math.round(500 * (fx - fy)), b: Math.round(200 * (fy - fz)) };
}
export function labToSrgb(L, a, b){
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const Xd = 0.96422 * _labFInv(fx), Yd = _labFInv(fy), Zd = 0.82521 * _labFInv(fz);
  const X = 0.9555766 * Xd - 0.0230393 * Yd + 0.0631636 * Zd;
  const Y = -0.0282895 * Xd + 1.0099416 * Yd + 0.0210077 * Zd;
  const Z = 0.0122982 * Xd - 0.0204830 * Yd + 1.3299098 * Zd;
  const gam = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055);
  const hx = v => Math.max(0, Math.min(255, Math.round(gam(v)))).toString(16).padStart(2, '0');
  return '#' + hx(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z)
             + hx(-0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z)
             + hx(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z);
}
