




import './40-options-bar-wiring.js';   
import { $, ADJM, ADJUST, ADJ_ALL, applyAdjustment, icon, kick, runLazy } from './01-boot.js';
import {
  doc, docH, docW, layerDeletes, layerTree, li, pixelPaint, selection, soBaked, textRenders,
} from './02-doc-state.js';
import { PP } from './03-history.js';
import { PAINT_SCALED_WHY, paintOrigin } from './11-paint-common.js';
import { bakeLayerTiles, layerPixelJob, selectionCoversAll } from './14-edit-misc.js';
import { buildAdjEyeRow } from './15-gradient-bucket-eyedropper.js';
import { layerCanvasCache, selLayer, thumbCache } from './23-layers-panel.js';
import { effLock, humanEditError } from './24-layer-ops-queue.js';
import { parseHex6 } from './27-gradient-editor.js';
import { mkEl } from './28-layer-props-transform.js';
import { beginDragAdjust } from './29-scrubby-live.js';
import { renderPreviewOnly } from './30-render.js';
import { hexOf } from './31-selection-brush.js';
import { ensurePixelPaint, selCovFn } from './38-brush-engine.js';
import { closeAdjustDialog } from './43-gradient-map-adjust-form.js';
















const ADJ_CHANNELS = [['rgb', 'RGB 复合'], ['r', '红'], ['g', '绿'], ['b', '蓝']];
const ADJ_HS_RANGES = [['reds', '红色'], ['yellows', '黄色'], ['greens', '绿色'],
                       ['cyans', '青色'], ['blues', '蓝色'], ['magentas', '洋红']];
const ADJ_MIX_OUT = [['red', '红'], ['green', '绿'], ['blue', '蓝'], ['gray', '灰（单色）']];
const ADJ_CB_BANDS = [['shadows', '阴影'], ['midtones', '中间调'], ['highlights', '高光']];

export const adjLabel = t => String((ADJ_ALL[t] && ADJ_ALL[t].label) || t).replace(/（[^）]*）$/, '');
const PHOTO_FILTERS = [
  ['warm85', '加温滤镜 (85)', [236, 138, 0]], ['warmLBA', '加温滤镜 (LBA)', [250, 150, 0]], ['warm81', '加温滤镜 (81)', [235, 177, 19]],
  ['cool80', '冷却滤镜 (80)', [0, 109, 255]], ['coolLBB', '冷却滤镜 (LBB)', [0, 93, 255]], ['cool82', '冷却滤镜 (82)', [0, 181, 255]],
  ['red', '红', [234, 26, 26]], ['orange', '橙', [243, 132, 23]], ['yellow', '黄', [249, 227, 28]], ['green', '绿', [25, 201, 25]],
  ['cyan', '青', [29, 203, 234]], ['blue', '蓝', [29, 53, 234]], ['violet', '紫', [155, 29, 234]], ['magenta', '洋红', [227, 24, 227]],
  ['sepia', '深褐', [172, 122, 51]], ['deepRed', '深红', [255, 0, 0]], ['deepBlue', '深蓝', [0, 34, 205]], ['deepEmerald', '深祖母绿', [0, 140, 0]],
  ['deepYellow', '深黄', [255, 213, 0]], ['underwater', '水下', [0, 194, 177]], ['custom', '自定颜色…', null],
];
const SELC_PLATES = ['红色', '黄色', '绿色', '青色', '蓝色', '洋红', '白色', '中性色', '黑色'];
const ADJ_SPEC = {
  exposure: { fields: [
    { p: 'exposure', l: '曝光度', min: -20, max: 20, step: 0.01, def: 0 },
    { p: 'offset', l: '位移', min: -0.5, max: 0.5, step: 0.001, def: 0 },
    { p: 'gamma', l: '灰度系数', min: 0.01, max: 9.99, step: 0.01, def: 1 },
  ] },
  



  levels: { levelsPanel: true, fields: [] },
  curves: { curve: true, fields: [
    { p: 'channel', l: '通道', kind: 'enum', opts: ADJ_CHANNELS, def: 'rgb' },
    { p: 'interpolation', l: '插值', kind: 'enum', def: 'spline',
      opts: [['spline', '平滑（PS 默认，可过冲）'], ['monotone', '单调（不过冲）'], ['linear', '折线']] },
  ] },
  hueSaturation: { hsRanges: true, fields: [
    { p: 'hue', l: '色相', min: -180, max: 180, step: 1, def: 0, int: true },
    { p: 'saturation', l: '饱和度', min: -100, max: 100, step: 1, def: 0, int: true },
    { p: 'lightness', l: '明度', min: -100, max: 100, step: 1, def: 0, int: true },
    { p: 'colorize', l: '着色', kind: 'bool', def: false },
    { p: 'colorizeHue', l: '着色色相', min: 0, max: 360, step: 1, def: 0, int: true, needs: 'colorize' },
    { p: 'colorizeSaturation', l: '着色饱和度', min: 0, max: 100, step: 1, def: 25, int: true, needs: 'colorize' },
  ], notes: [['plain', '「明度」不是 HSL 的 L：是逐通道往白/黑线性混（+100 出纯白、−100 出纯黑）。灰像素（R=G=B）不受色相/饱和度与六色域影响。']] },
  



  brightnessContrast: { legacyOnly: true, fields: [
    { p: 'brightness', l: '亮度', min: -150, max: 150, step: 1, def: 0, int: true },
    { p: 'contrast', l: '对比度', min: -50, max: 100, step: 1, def: 0, int: true },
  ] },
  invert: { fields: [] },
  posterize: { fields: [{ p: 'levels', l: '色阶数', min: 2, max: 255, step: 1, def: 4, int: true }] },
  threshold: { fields: [{ p: 'level', l: '阈值色阶', min: 1, max: 255, step: 1, def: 128, int: true }] },
  desaturate: { fields: [] },
  blackWhite: { tintLock: true, fields: [
    { p: 'red', l: '红色', min: -200, max: 300, step: 1, def: 40, int: true },
    { p: 'yellow', l: '黄色', min: -200, max: 300, step: 1, def: 60, int: true },
    { p: 'green', l: '绿色', min: -200, max: 300, step: 1, def: 40, int: true },
    { p: 'cyan', l: '青色', min: -200, max: 300, step: 1, def: 60, int: true },
    { p: 'blue', l: '蓝色', min: -200, max: 300, step: 1, def: 20, int: true },
    { p: 'magenta', l: '洋红', min: -200, max: 300, step: 1, def: 80, int: true },
  ] },
  channelMixer: { mixer: true, fields: [{ p: 'monochrome', l: '单色', kind: 'bool', def: false }] },
  colorBalance: { balance: true, fields: [{ p: 'preserveLuminosity', l: '保持明度', kind: 'bool', def: true }],
    notes: [['warn', '色彩平衡是照 GIMP/GEGL 的 PS 兼容实现写的**近似算法，与 PS 不完全一致**（Adobe 的三段掩码没有公开）。']] },
  gradientMap: { gradient: true, fields: [{ p: 'reverse', l: '反向', kind: 'bool', def: false }] },
  vibrance: { fields: [
    { p: 'vibrance', l: '自然饱和度', min: -100, max: 100, step: 1, def: 0, int: true },
    { p: 'saturation', l: '饱和度', min: -100, max: 100, step: 1, def: 0, int: true },
  ] },
  
  photoFilter: { photo: true, fields: [
    { p: 'filter', l: '滤镜', kind: 'enum', local: true, rerender: true, def: 'warm85', opts: PHOTO_FILTERS.map(([v, t]) => [v, t]) },
    { p: 'density', l: '浓度', min: 0, max: 100, step: 1, def: 25, int: true },
    { p: 'preserveLuminosity', l: '保留明度', kind: 'bool', def: true },
  ] },
  
  selectiveColor: { selc: true, fields: [
    { p: 'plate', l: '颜色', kind: 'enum', local: true, rerender: true, def: '0', opts: SELC_PLATES.map((t, i) => [String(i), t]) },
    { p: 'method', l: '方法', kind: 'enum', num: true, def: '0', opts: [['0', '相对'], ['1', '绝对']] },
  ] },
};
const ADJ_ORDER = ['brightnessContrast', 'levels', 'curves', 'exposure', 'vibrance', 'hueSaturation', 'colorBalance', 'blackWhite', 'photoFilter',
                   'channelMixer', 'invert', 'posterize', 'threshold', 'gradientMap', 'selectiveColor', 'desaturate'];   

export const adjTypes = () => ADJ_ORDER.filter(t => ADJ_ALL[t] && ADJ_SPEC[t]);


export function adjustGuard(idx = selLayer, { sparse = false } = {}){
  if (!doc) return '先打开一个 PSD';
  if (li) return '正在变形编辑中：先退出变形（Esc）再用图像调整';
  if (!(idx >= 0)) return '先在图层面板里选中一个图层';
  const L = layerTree && layerTree.flat && layerTree.flat[idx], dl = doc.layers[idx];
  if (!L || !dl) return '选中的图层读不到';
  if (L.groupType === 3) return '分组结束分隔记录没有像素';
  if (L.isGroup) return '图层组本身没有像素，请选中组里的某一层';
  if (layerDeletes.has(idx)) return '这个图层已排队删除：先在图层面板恢复它';
  if (L.isSmartObject) return 'Photoshop 里「图像 › 调整」也不能直接作用于智能对象：双击进入内部编辑，或先栅格化该图层';
  if (L.text && L.text.content != null) return 'Photoshop 里文字图层要先栅格化才能直接改像素（栅格化会失去可编辑文字）';
  if (L.adjustment) return '调整 / 填充图层没有自己的像素；要改它的参数请用下面的参数编辑器';
  if (effLock(idx, L, 'lockAll', 'all')) return '这个图层「全部锁定」：先解锁';
  if (effLock(idx, L, 'lockComposite', 'composite')) return '这个图层「锁定图像像素」：先解锁';
  if (doc.depth !== 8 && doc.depth !== 16 && doc.depth !== 32) return `本文档是 ${doc.depth} 位/通道，改图层像素只支持 8 / 16 / 32 位`;
  

  const emptyNew = !dl.rgba && !dl.mask && !dl.vectorMask && dl.width === 0 && dl.height === 0 && dl.bounds
    && !dl.bounds.top && !dl.bounds.left && !dl.bounds.bottom && !dl.bounds.right;
  const sparsePixels = sparse && doc.depth === 8 && doc.mode === 3
    && (dl.lazyChannels || dl.lazyCompressedChannels || dl.lazyRasterFile || dl.lazyImage || pixelPaint[idx]?.sparse);



  if (!dl.rgba && !sparsePixels && (dl.lazyRasterFile || dl.lazyImage || dl.lazyChannels || dl.lazyCompressedChannels))
    return '这一层是超大图（像素在源文件里），「图像 › 调整」面板要把它整层读进内存（约 '
      + Math.round((dl.width || 0) * (dl.height || 0) * 4 / 1048576) + 'MB）。请改用「滤镜」菜单里的同名调整（按选区瓦片处理），或新建图层后再调';
  if ((!(dl.width > 0 && dl.height > 0) || (!dl.rgba && !sparsePixels)) && !emptyNew) return '这是个空图层（包围盒 0×0），没有像素可以调整';


  if (sparsePixels && !dl.rgba && dl.lazyCompressedChannels) {
    const px = (dl.width || 0) * (dl.height || 0);
    if (px > 64e6 && !selection && !pixelPaint[idx]?.sparse?.tiles?.size)
      return `这一层有 ${(px / 1e6).toFixed(0)} 百万像素，只能按区域处理：先用选框框一块（或先在上面画点东西）`;
  }
  if (textRenders[idx]) return '这一层的像素已经被文字重绘接管：撤销文字修改后再调整';
  for (const k in soBaked) if (soBaked[k] && soBaked[k].layerIdx === idx) return '这一层的像素来自智能对象烘焙：请在智能对象内部编辑';
  

  if (selection && !paintOrigin(idx, { w: dl.width, h: dl.height, left: dl.bounds.left, top: dl.bounds.top }))
    return PAINT_SCALED_WHY;
  return '';
}






























export const LV_CH_KEYS = ['rgb', 'r', 'g', 'b'];
export const lvNeutralGroup = () => ({ inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 });
const lvGroupNeutral = g => !!g && g.inputBlack === 0 && g.inputWhite === 255 && g.gamma === 1
  && g.outputBlack === 0 && g.outputWhite === 255;
const LV_PRESETS = [
  { id: 'default', label: '默认值', v: [0, 1.00, 255, 0, 255] },
  { id: 'darker', label: '变暗', v: [0, 1.00, 255, 0, 200] },
  { id: 'lighter', label: '变亮', v: [0, 1.00, 255, 55, 255] },
  { id: 'inc1', label: '增加对比度 1', v: [15, 1.00, 240, 0, 255] },
  { id: 'inc2', label: '增加对比度 2', v: [30, 1.00, 225, 0, 255] },
  { id: 'inc3', label: '增加对比度 3', v: [45, 1.00, 210, 0, 255] },
  { id: 'dec1', label: '减小对比度 1', v: [0, 1.00, 255, 20, 235] },
  { id: 'dec2', label: '减小对比度 2', v: [0, 1.00, 255, 40, 215] },
  { id: 'mid_light', label: '中间调较亮', v: [0, 1.20, 255, 0, 255] },
  { id: 'mid_dark', label: '中间调较暗', v: [0, 0.85, 255, 0, 255] },
];
const lvPresetById = id => LV_PRESETS.find(p => p.id === id) || null;
const lvGroupFromPreset = v => ({ inputBlack: v[0], gamma: v[1], inputWhite: v[2], outputBlack: v[3], outputWhite: v[4] });

export function lvMatchPreset(g){
  for (const p of LV_PRESETS) {
    const q = lvGroupFromPreset(p.v);
    if (q.inputBlack === g.inputBlack && q.inputWhite === g.inputWhite && q.outputBlack === g.outputBlack
        && q.outputWhite === g.outputWhite && Math.abs(q.gamma - g.gamma) < 1e-9) return p.id;
  }
  return 'custom';
}

const lvGammaPos = g => {
  const frac = Math.pow(0.5, Math.min(9.99, Math.max(0.1, g.gamma)));
  return g.inputBlack + (g.inputWhite - g.inputBlack) * frac;
};



export function lvHistOf(px, n){
  const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    if (!px[o + 3]) continue;
    h.r[px[o]]++; h.g[px[o + 1]]++; h.b[px[o + 2]]++;
  }
  return h;
}

function lvHistograms(S){
  if (S.lvHist) return S.lvHist;
  S.lvHist = lvHistOf(S.base, S.pp.w * S.pp.h);
  return S.lvHist;
}

export function lvBins(h, ch){
  if (!h) return null;                                  
  if (ch === 'r' || ch === 'g' || ch === 'b') return h[ch];
  const out = new Uint32Array(256);
  for (let i = 0; i < 256; i++) out[i] = h.r[i] + h.g[i] + h.b[i];
  return out;
}


export function adjDefaults(type){
  const sp = ADJ_SPEC[type], m = {};
  for (const f of sp.fields) m[f.p] = f.def;
  if (sp.levelsPanel) {
    m.channel = 'rgb';
    m.groups = { rgb: lvNeutralGroup(), r: lvNeutralGroup(), g: lvNeutralGroup(), b: lvNeutralGroup() };
  }
  if (sp.hsRanges) for (const [k] of ADJ_HS_RANGES) m[k] = { hue: 0, saturation: 0, lightness: 0 };
  if (sp.mixer) m.mix = { red: { red: 100, green: 0, blue: 0, constant: 0 }, green: { red: 0, green: 100, blue: 0, constant: 0 },
                          blue: { red: 0, green: 0, blue: 100, constant: 0 }, gray: { red: 40, green: 40, blue: 20, constant: 0 } };
  if (sp.balance) m.bands = { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] };
  if (sp.curve) m.points = [[0, 0], [255, 255]];
  if (sp.gradient) m.stops = [{ position: 0, color: [0, 0, 0] }, { position: 1, color: [255, 255, 255] }];
  if (sp.photo) m.color = [236, 138, 0];
  if (sp.selc) m.plates = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  return m;
}

export function adjParams(type, m){
  const sp = ADJ_SPEC[type], out = { type };
  if (sp.levelsPanel) {                                        
    const chans = {};
    for (const k of LV_CH_KEYS) {
      const g = (m.groups || {})[k];
      if (!g || lvGroupNeutral(g)) continue;                   
      chans[k] = { inputBlack: Math.round(g.inputBlack), inputWhite: Math.round(g.inputWhite),
                   gamma: +g.gamma, outputBlack: Math.round(g.outputBlack), outputWhite: Math.round(g.outputWhite) };
    }
    if (Object.keys(chans).length) out.channels = chans;       
    return out;
  }
  for (const f of sp.fields) {
    if (f.local) continue;                                     
    if (f.needs && !m[f.needs]) continue;                      
    out[f.p] = f.kind === 'bool' ? !!m[f.p] : f.kind === 'enum' ? (f.num ? +m[f.p] : m[f.p]) : (f.int ? Math.round(m[f.p]) : +m[f.p]);
  }
  if (sp.photo) { const pr = PHOTO_FILTERS.find(x => x[0] === m.filter); out.color = (pr && pr[2] ? pr[2] : m.color).slice(); }
  if (sp.selc) out.plates = [[0, 0, 0, 0], ...m.plates.map(r => r.map(v => Math.round(v)))];
  if (sp.legacyOnly) out.useLegacy = true;                     
  if (sp.tintLock) out.useTint = false;
  if (sp.hsRanges && !m.colorize) {                            
    for (const [k] of ADJ_HS_RANGES) { const g = m[k]; if (g.hue || g.saturation || g.lightness) out[k] = { ...g }; }
  }
  if (sp.mixer) {
    if (m.monochrome) out.gray = { ...m.mix.gray };
    else for (const k of ['red', 'green', 'blue']) out[k] = { ...m.mix[k] };
  }
  if (sp.balance) for (const [k] of ADJ_CB_BANDS) out[k] = m.bands[k].slice();
  if (sp.curve) out.points = m.points.map(p => [Math.round(p[0]), Math.round(p[1])]);
  if (sp.gradient) out.stops = m.stops.map(s => ({ position: +s.position, color: s.color.slice() }));
  return out;
}

function adjIsNeutral(type, m){
  const n = ADJ_ALL[type] && ADJ_ALL[type].neutral;
  if (!n) return false;                                        
  const cur = adjParams(type, m), def = adjParams(type, adjDefaults(type));
  return JSON.stringify(cur) === JSON.stringify(def) && Object.keys(n).length >= 0;
}











const ADJ_PROXY_MAX = 1 << 20;
export let adjState = null, adjRAF = 0;
export function set_adjState(v) { return (adjState = v); }   
export function set_adjRAF(v) { return (adjRAF = v); }   

function adjBuildProxy(pp){
  const n = pp.w * pp.h;
  if (n <= ADJ_PROXY_MAX) return null;
  const k = Math.max(2, Math.ceil(Math.sqrt(n / ADJ_PROXY_MAX)));
  const pw = Math.max(1, Math.ceil(pp.w / k)), ph = Math.max(1, Math.ceil(pp.h / k));
  const rgba = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(pp.h - 1, y * k), sRow = sy * pp.w * 4, dRow = y * pw * 4;
    for (let x = 0; x < pw; x++) {
      const so = sRow + Math.min(pp.w - 1, x * k) * 4, dof = dRow + x * 4;
      rgba[dof] = pp.rgba[so]; rgba[dof + 1] = pp.rgba[so + 1]; rgba[dof + 2] = pp.rgba[so + 2]; rgba[dof + 3] = pp.rgba[so + 3];
    }
  }
  return { k, pw, ph, rgba };
}

export function adjProxySelection(pp, px, idx){
  const cov = selCovFn(); if (!cov) return null;
  
  const og = (idx !== undefined && paintOrigin(idx, pp)) || { left: pp.left, top: pp.top };
  const data = new Uint8Array(px.pw * px.ph);
  for (let y = 0; y < px.ph; y++) {
    const dy = og.top + Math.min(pp.h - 1, y * px.k), row = y * px.pw;
    for (let x = 0; x < px.pw; x++) data[row + x] = cov(og.left + Math.min(pp.w - 1, x * px.k), dy);
  }
  return { x: 0, y: 0, width: px.pw, height: px.ph, data, docW: px.pw, docH: px.ph };
}

export function adjExpandProxy(px, small, dst, w, h){
  const rowBuf = new Uint8ClampedArray(w * 4);
  for (let y = 0; y < px.ph; y++) {
    const sRow = y * px.pw * 4;
    for (let x = 0; x < w; x++) {
      const so = sRow + Math.min(px.pw - 1, (x / px.k) | 0) * 4, dof = x * 4;
      rowBuf[dof] = small[so]; rowBuf[dof + 1] = small[so + 1]; rowBuf[dof + 2] = small[so + 2]; rowBuf[dof + 3] = small[so + 3];
    }
    const y0 = y * px.k, y1 = Math.min(h, y0 + px.k);
    for (let yy = y0; yy < y1; yy++) dst.set(rowBuf, yy * w * 4);
  }
}
export function adjCompute(full){
  const S = adjState, pp = S.pp;
  const params = adjParams(S.type, S.model);
  if (full || !S.proxy) {
    const og = paintOrigin(S.idx, pp) || { left: pp.left, top: pp.top };
    return applyAdjustment(S.base, pp.w, pp.h, params,
      { selection: selection || undefined, layerBounds: { left: og.left, top: og.top } });
  }
  const small = applyAdjustment(S.proxy.rgba, S.proxy.pw, S.proxy.ph, params,
    { selection: S.proxySel || undefined, layerBounds: { left: 0, top: 0 } });
  const out = new Uint8ClampedArray(pp.rgba.length);
  adjExpandProxy(S.proxy, small, out, pp.w, pp.h);
  return out;
}
export function adjRender(){                       
  const S = adjState; if (!S) return;
  let out = null, err = '';
  if (S.sparse) { const okBtn = $('#adjOk'); if (okBtn) okBtn.disabled = false; return; }
  if (S.on) { try { out = adjCompute(false); } catch (e) { err = humanEditError(e && e.message || e); } }
  S.pp.rgba.set(out || S.base);
  delete layerCanvasCache[S.idx]; delete thumbCache[S.idx];
  renderPreviewOnly();
  const box = $('#adjErr'); if (box) { box.textContent = err ? '参数不合法：' + err : ''; box.hidden = !err; }
  S.badParams = !!err;
  const okBtn = $('#adjOk'); if (okBtn) okBtn.disabled = !!err;
}
function adjSchedule(){                     
  if (adjRAF) return;
  adjRAF = requestAnimationFrame(() => { adjRAF = 0; adjRender(); });
}



const ADJ_IMMEDIATE = new Set(['invert', 'desaturate']);
export const openAdjustLazy = type => runLazy(ADJUST, '图像调整', async () => {
  const lazy = doc?.layers?.[selLayer];
  if (ADJ_IMMEDIATE.has(type) && lazy && (lazy.lazyTileStore || lazy.lazyChannels || lazy.lazyCompressedChannels || lazy.lazyImage || lazy.lazyRasterFile || pixelPaint[selLayer]?.sparse)) {
    const label = `图像调整 · ${adjLabel(type)}`;
    const params = adjParams(type, adjDefaults(type));
    const layerLeft = lazy.bounds?.left | 0, layerTop = lazy.bounds?.top | 0;
    const fullCover = !selection || selectionCoversAll(selection, layerLeft, layerTop, lazy.width || docW, lazy.height || docH);
    if (docW * docH > 64e6 && fullCover) {
      try {
        const applyPoint = (base, w, h, x = 0, y = 0) => applyAdjustment(base, w, h, params, { layerBounds: { left: layerLeft + x, top: layerTop + y } });
        const ok = await bakeLayerTiles(label, ({ base, w, h, x, y }) => applyPoint(base, w, h, x, y), { index: selLayer, apply: applyPoint });
        return ok;
      } catch (e) {
        $('#err').textContent = label + '失败：' + humanEditError(e && e.message || e);
        return false;
      }
    }
    const ok = await layerPixelJob(label, ({ base, w, h, cov }) => {
      const out = new Uint8ClampedArray(base);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, a = cov ? cov(x, y) : 1;
        if (a <= 0) continue;
        let r = base[o], g = base[o + 1], b = base[o + 2];
        if (type === 'invert') { r = 255 - r; g = 255 - g; b = 255 - b; }
        else { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = (mx + mn + 1) >> 1; r = g = b = v; }
        out[o] = Math.round(base[o] + (r - base[o]) * a); out[o + 1] = Math.round(base[o + 1] + (g - base[o + 1]) * a); out[o + 2] = Math.round(base[o + 2] + (b - base[o + 2]) * a);
      }
      return out;
    }, { tile: true });
    return ok;
  }
  const st = openAdjustDialog(type);
  if (st && ADJ_IMMEDIATE.has(type)) await $('#adjOk').onclick();
  return st;
});
export function openAdjustDialog(type){
  const idx = selLayer;
  const why = adjustGuard(idx, { sparse: true });
  if (why) { $('#err').textContent = '图像调整用不了：' + why; return null; }
  
  if (!ADJM) { kick(ADJUST); $('#err').textContent = '图像调整用不了：' + ADJUST.statusText(); return null; }
  if (!ADJ_SPEC[type] || !ADJ_ALL[type]) { $('#err').textContent = `没有「${type}」这个调整`; return null; }
  const pp = ensurePixelPaint(idx, { sparse: true });
  if (!pp) { $('#err').textContent = '图像调整用不了：这一层拿不到像素'; return null; }
  if (pp.sparse) {
    adjState = { idx, type, pp, base: null, sparse: true, proxy: null, proxySel: null,
                 model: adjDefaults(type), on: true, badParams: false };
    $('#adjPreview').checked = true;
    const sel = $('#adjKind'); sel.innerHTML = '';
    for (const t of adjTypes()) sel.append(mkEl('option', { value: t, textContent: adjLabel(t), title: ADJ_ALL[t].accepts }));
    sel.value = type; renderAdjustDialog();
    const dlg = $('#adjDlg');
    if (!dlg.open) { if (dlg.showModal) { try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', ''); }
    return adjState;
  }
  closeAdjustDialog(true);                  
  const base = Uint8ClampedArray.from(pp.rgba);
  const proxy = adjBuildProxy(pp);
  adjState = { idx, type, pp, base, proxy, proxySel: proxy ? adjProxySelection(pp, proxy, idx) : null,
               model: adjDefaults(type), on: true, badParams: false };
  $('#adjPreview').checked = true;
  const sel = $('#adjKind');
  sel.innerHTML = '';
  for (const t of adjTypes()) sel.append(mkEl('option', { value: t, textContent: adjLabel(t), title: ADJ_ALL[t].accepts }));
  sel.value = type;
  renderAdjustDialog();
  const dlg = $('#adjDlg');
  if (!dlg.open) { if (dlg.showModal) { try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', ''); }
  adjRender();
  return adjState;
}
export function renderAdjustDialog(){
  const S = adjState; if (!S) return;
  const sp = ADJ_SPEC[S.type], m = S.model;
  $("#adjTitle").textContent = `${adjLabel(S.type)}` + (selection ? '（仅选区内）' : '');
  const body = $('#adjBody'); body.innerHTML = '';
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const arow = (label, ...els) => {
    const r = mk('div', { className: 'arow' });
    if (label != null) r.append(mk('label', { className: 'k', textContent: label }));
    r.append(...els); body.append(r); return r;
  };
  
  const num = (label, get, set, f, host) => {
    const r = mk('div', { className: 'arow' });
    r.append(mk('label', { className: 'k', textContent: label }));
    const sl = mk('input', { type: 'range', min: f.min, max: f.max, step: f.step, value: get() });
    const nb = mk('input', { type: 'number', min: f.min, max: f.max, step: f.step, value: get() });
    if (f.attr) { sl.dataset.attr = f.attr; nb.dataset.attr = f.attr + '-num'; }
    const norm = v => { let n2 = f.int ? Math.round(+v) : +v; if (!isFinite(n2)) n2 = f.def; return Math.max(f.min, Math.min(f.max, n2)); };
    sl.oninput = () => { const v = norm(sl.value); nb.value = v; set(v); adjSchedule(); };
    nb.oninput = () => { const v = norm(nb.value); sl.value = v; set(v); adjSchedule(); };
    if (f.disabled) { sl.disabled = nb.disabled = true; r.title = f.disabled; }
    r.append(sl, nb); (host || body).append(r); return r;
  };
  const group = (title, off) => {
    const g = mk('div', { className: 'agroup' + (off ? ' off' : '') });
    g.append(mk('h4', { textContent: title }));
    if (off) g.title = off;
    body.append(g); return g;
  };
  
  if (sp.levelsPanel) buildLevelsControl({ body, mk, mkEl, attr: 'adj' }, dialogLevelsV());
  
  for (const f of sp.fields) {
    if (f.kind === 'bool') {
      const cb = mk('input', { type: 'checkbox', checked: !!m[f.p] });
      cb.dataset.attr = 'adj-' + f.p;
      cb.onchange = () => { m[f.p] = cb.checked; renderAdjustDialog(); adjSchedule(); };
      arow(null, mk('label', { className: 'seg' })).firstChild.append(cb, document.createTextNode(' ' + f.l));
      continue;
    }
    if (f.kind === 'enum') {
      const s = mk('select'); s.dataset.attr = 'adj-' + f.p;
      for (const [v, t] of f.opts) s.append(mkEl('option', { value: v, textContent: t }));
      s.value = m[f.p];
      s.onchange = () => { m[f.p] = s.value; if (f.rerender) renderAdjustDialog(); adjSchedule(); };
      arow(f.l, s);
      if (f.p === 'filter' && sp.photo) {                    
        const pr = PHOTO_FILTERS.find(x => x[0] === m.filter);
        const col = mk('input', { type: 'color', value: hexOf(pr && pr[2] ? pr[2] : m.color) });
        col.dataset.attr = 'adj-photo-color';
        col.oninput = () => { const c = parseHex6(col.value); if (c) { m.color = c; m.filter = 'custom'; s.value = 'custom'; adjSchedule(); } };
        arow('颜色', col);
      }
      if (f.p === 'plate' && sp.selc) {                      
        const k = +m.plate || 0;
        [['青色', 0], ['洋红', 1], ['黄色', 2], ['黑色', 3]].forEach(([pl, ci]) =>
          num(pl, () => m.plates[k][ci], v => { m.plates[k][ci] = v; }, { min: -100, max: 100, step: 1, def: 0, int: true, attr: `adj-selc-${k}-${ci}` }));
      }
      continue;
    }
    const disabled = f.needs && !m[f.needs] ? '先勾上「着色」' : '';
    num(f.l, () => m[f.p], v => { m[f.p] = v; }, { ...f, disabled, attr: 'adj-' + f.p });
  }
  
  if (sp.tintLock) {
    const r = mk('div', { className: 'arow' });
    const cb = mk('input', { type: 'checkbox', checked: false, disabled: true });
    cb.dataset.attr = 'adj-use-tint';
    const lb = mk('label', { className: 'seg' }); lb.append(cb, document.createTextNode(' 色调（着色）'));
    lb.title = '这个破坏性图像调整对话框不提供色调；PSD 黑白调整层会以明确标注的近似方式参与画布合成（原因见下方说明）';
    r.append(lb); body.append(r);
  }
  
  if (sp.hsRanges) {
    const off = m.colorize ? '「着色」打开时六色域不可用（PS 面板同样如此）' : '';
    const g = group('六色域（在主项之上叠加）', off);
    for (const [k, label] of ADJ_HS_RANGES) {
      const sub = mk('div'); g.append(mk('h4', { textContent: label, style: 'margin-top:6px' }), sub);
      for (const [pk, pl, mn, mx] of [['hue', '色相', -180, 180], ['saturation', '饱和度', -100, 100], ['lightness', '明度', -100, 100]])
        num(pl, () => m[k][pk], v => { m[k][pk] = v; }, { min: mn, max: mx, step: 1, def: 0, int: true, disabled: off, attr: `adj-hs-${k}-${pk}` }, sub);
    }
  }
  
  if (sp.mixer) {
    for (const [k, label] of ADJ_MIX_OUT) {
      const off = (k === 'gray') !== !!m.monochrome ? (m.monochrome ? '「单色」打开时只用灰通道' : '「单色」关着时不用灰通道') : '';
      const g = group('输出通道：' + label, off);
      for (const [pk, pl] of [['red', '红'], ['green', '绿'], ['blue', '蓝'], ['constant', '常数']])
        num(pl, () => m.mix[k][pk], v => { m.mix[k][pk] = v; }, { min: -200, max: 200, step: 1, def: 0, int: true, disabled: off, attr: `adj-mix-${k}-${pk}` }, g);
    }
  }
  
  if (sp.balance) {
    for (const [k, label] of ADJ_CB_BANDS) {
      const g = group(label, '');
      [['青 → 红', 0], ['洋红 → 绿', 1], ['黄 → 蓝', 2]].forEach(([pl, ci]) =>
        num(pl, () => m.bands[k][ci], v => { m.bands[k][ci] = v; }, { min: -100, max: 100, step: 1, def: 0, int: true, attr: `adj-cb-${k}-${ci}` }, g));
    }
  }
  
  if (sp.curve) {
    const g = group('曲线控制点（输入 → 输出，0…255）', '');
    m.points.forEach((pt, i) => {
      const r = mk('div', { className: 'arow' });
      r.append(mk('label', { className: 'k', textContent: '点 ' + (i + 1) }));
      const mkNum = ci => {
        const nb = mk('input', { type: 'number', min: 0, max: 255, step: 1, value: pt[ci] });
        nb.dataset.attr = `adj-curve-${i}-${ci}`;
        nb.oninput = () => { pt[ci] = Math.max(0, Math.min(255, Math.round(+nb.value) || 0)); adjSchedule(); };
        return nb;
      };
      r.append(mkNum(0), mk('span', { textContent: '→', style: 'color:var(--muted)' }), mkNum(1));
      if (m.points.length > 2) {
        const del = mk('button', { type: 'button', title: '删除这个点' });
        del.append(icon('x', 11)); del.setAttribute('aria-label', '删除这个点');
        del.style.cssText = 'height:22px;padding:0 7px';
        del.onclick = () => { m.points.splice(i, 1); renderAdjustDialog(); adjSchedule(); };
        r.append(del);
      }
      g.append(r);
    });
    if (m.points.length < 19) {
      const add = mk('button', { type: 'button' });
      add.append(icon('plus', 11), document.createTextNode(' 加一个点'));
      add.dataset.attr = 'adj-curve-add';
      add.style.cssText = 'height:22px;padding:0 8px;margin-top:4px';
      add.onclick = () => {
        const a = m.points[m.points.length - 2], b = m.points[m.points.length - 1];
        const x = Math.round((a[0] + b[0]) / 2), y = Math.round((a[1] + b[1]) / 2);
        if (x <= a[0] || x >= b[0]) return;
        m.points.splice(m.points.length - 1, 0, [x, y]); renderAdjustDialog(); adjSchedule();
      };
      g.append(add);
    }
  }
  
  if (sp.gradient) {
    const g = group('渐变色标（至少 2 个，位置 0…1 不降序）', '');
    m.stops.forEach((st, i) => {
      const r = mk('div', { className: 'arow' });
      r.append(mk('label', { className: 'k', textContent: '色标 ' + (i + 1) }));
      const pos = mk('input', { type: 'number', min: 0, max: 1, step: 0.01, value: st.position });
      pos.dataset.attr = `adj-grad-${i}-pos`;
      pos.oninput = () => { st.position = Math.max(0, Math.min(1, +pos.value || 0)); adjSchedule(); };
      const col = mk('input', { type: 'color', value: hexOf(st.color) });
      col.dataset.attr = `adj-grad-${i}-color`;
      col.oninput = () => { const c = parseHex6(col.value); if (c) { st.color = c; adjSchedule(); } };
      r.append(pos, col);
      if (m.stops.length > 2) {
        const del = mk('button', { type: 'button', title: '删除这个色标' });
        del.append(icon('x', 11)); del.setAttribute('aria-label', '删除这个色标');
        del.style.cssText = 'height:22px;padding:0 7px';
        del.onclick = () => { m.stops.splice(i, 1); renderAdjustDialog(); adjSchedule(); };
        r.append(del);
      }
      g.append(r);
    });
    const add = mk('button', { type: 'button' });
    add.append(icon('plus', 11), document.createTextNode(' 加一个色标'));
    add.dataset.attr = 'adj-grad-add';
    add.style.cssText = 'height:22px;padding:0 8px;margin-top:4px';
    add.onclick = () => {
      const last = m.stops[m.stops.length - 1];
      m.stops.splice(m.stops.length - 1, 0, { position: Math.max(0, last.position - 0.001), color: [128, 128, 128] });
      renderAdjustDialog(); adjSchedule();
    };
    g.append(add);
  }
  if (!sp.fields.length && !sp.curve && !sp.gradient && !sp.mixer && !sp.balance && !sp.hsRanges && !sp.levelsPanel)
    arow(null, mk('span', { textContent: '（这个调整没有参数）', style: 'color:var(--muted)' }));

  
  const notes = $('#adjNotes'); notes.innerHTML = '';
  function note(cls, text){
    const d = document.createElement('div');
    d.className = 'anote' + (cls === 'plain' ? ' plain' : '');
    d.textContent = text.replace(/\*\*/g, '');
    notes.append(d); return d;
  }
  const err = document.createElement('div');
  err.className = 'anote'; err.id = 'adjErr'; err.hidden = true; notes.append(err);
  for (const [cls, t] of (sp.notes || [])) note(cls, t);
  if (sp.legacyOnly) note('warn', '这里的两个滑块按 PS 的取值（亮度 −150…+150、对比度 −50…+100），算法是**旧式**（亮度＝整体平移、对比度＝绕中点缩放）：'
    + 'CS3 之后那条默认的非线性曲线 Adobe 没有公开，我们不拿拟合结果冒充它。要那种「不削高光」的效果，请改用曲线。');
  if (sp.levelsPanel) note('plain', '参数**逐通道分存**（切到红通道调完再切回 RGB，红的设置还在，与 PS 一致）；RGB 只会叠在 R/G/B 之上。'
    + '直方图统计的是选中图层的像素（忽略完全透明的像素），有选区也仍是整个图层。');
  if (sp.tintLock) note('warn', '此破坏性图像调整对话框不提供黑白「色调」：PS 的灰度→Lab 色调映射曲线没有公开资料，不能把近似结果伪装成精确实现。导入的 PSD 黑白调整层含色调时，画布会以保明暗 HSL 映射的明确近似合成；若要在此菜单中着色，请在黑白之后再叠一层「色相/饱和度」并勾上「着色」。');
  if (selection) note('plain', '当前有选区：调整**只作用于选区内**（out = 原值×(1−覆盖率) + 调整后×覆盖率，羽化边缘按覆盖率过渡，覆盖率 0 的像素逐字节不变）。');
  if (adjState.sparse) note('plain', '将只处理选区包围盒；没有选区时处理已经编辑过的区域。应用结果会直接写回图层像素。');
  note('plain', '这是**破坏性**调整：直接改图层像素（PS 的「图像 › 调整」也是如此）。要非破坏性请用图层面板底部的「+ 新建调整图层」。'
    + '本模块按公开算法/公开逆向结论实现，未与 Photoshop 逐像素比对。');
  const rst = $('#adjReset');
  rst.disabled = !ADJ_ALL[S.type].neutral;
  rst.title = rst.disabled ? `「${adjLabel(S.type)}」没有恒等状态（复位没有意义）` : '把参数复位成中性值';
}






const LV_CHANNEL_OPTS = [['rgb', 'RGB'], ['r', '红'], ['g', '绿'], ['b', '蓝']];
const LV_GAMMA_MIN = 0.10, LV_GAMMA_MAX = 9.99;         
const lvGammaFrac = g => Math.pow(0.5, Math.min(LV_GAMMA_MAX, Math.max(LV_GAMMA_MIN, g)));
const lvFracToGamma = f => Math.log(Math.min(1 - 1e-6, Math.max(1e-6, f))) / Math.log(0.5);


export function lvDrawHist(cv, bins, q, marks){
  const w = Math.max(64, Math.round(cv.clientWidth || 460)), h = 92;
  const dpr = Math.min(3, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  }
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;                                     
  
  let top = 0;
  if (bins) {
    
    
    for (let i = 1; i < 255; i++) if (bins[i] > top) top = bins[i];
    if (!top) for (let i = 0; i < 256; i++) if (bins[i] > top) top = bins[i];
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#101011'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#9aa0a6';
  const bw = w / 256;
  for (let i = 0; bins && i < 256; i++) {
    if (!bins[i] || !top) continue;
    const bh = Math.max(1, Math.round(Math.min(1, bins[i] / top) * (h - 2)));
    ctx.fillRect(i * bw, h - bh, Math.max(1, bw), bh);
  }
  const line = (level, color) => {
    const x = Math.round(Math.max(0, Math.min(255, level)) / 255 * w) + 0.5;
    ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  };
  const marks2 = marks || (q ? [{ level: q.inputBlack, color: '#d8d8db' },
                                { level: lvGammaPos(q), color: '#74797f' },
                                { level: q.inputWhite, color: '#d8d8db' }] : []);
  for (const m of marks2) line(m.level, m.color);
}





export function lvAutoGroups(h, gammaOf){
  if (PP) return PP.autoLevels(h, gammaOf);             
  const clip = 0.001;                                   
  if (!h) return null;
  const out = {};
  for (const ch of ['r', 'g', 'b']) {
    const bins = h[ch];
    let total = 0;
    for (let i = 0; i < 256; i++) total += bins[i];
    if (!total) continue;                               
    const need = total * clip;
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += bins[i]; if (acc > need) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += bins[i]; if (acc > need) { hi = i; break; } }
    if (hi <= lo) continue;                             
    out[ch] = { inputBlack: lo, inputWhite: hi, gamma: gammaOf ? gammaOf(ch) : 1,
                outputBlack: 0, outputWhite: 255 };
  }
  return Object.keys(out).length ? out : null;
}















export function buildLevelsControl(ctx, V){
  const { body, mk, mkEl } = ctx;
  const A = s => (ctx.attr || 'adj') + '-lv-' + s;
  const q = () => V.group(V.channel());                 
  const bins = V.bins(V.channel());                     
  const panel = mk('div', { className: 'lvPanel' });
  const boxes = [];                                     
  const tris = [];                                      

  
  const row1 = mk('div', { className: 'arow' });
  row1.append(mk('label', { className: 'k', textContent: '预设' }));
  const psel = mk('select');
  psel.dataset.attr = A('preset');
  psel.title = '预设名照 PS，数值是按名字语义复现的（Adobe 没公开 PS 的原表）；把鼠标停在某项上能看到它的具体数值';
  psel.append(mkEl('option', { value: 'custom', textContent: '自定' }));
  for (const p of LV_PRESETS) {
    const o = mkEl('option', { value: p.id, textContent: p.label });
    o.title = `输入色阶 ${p.v[0]} / ${p.v[1].toFixed(2)} / ${p.v[2]}　输出色阶 ${p.v[3]} / ${p.v[4]}`;
    psel.append(o);
  }
  psel.onchange = () => {
    const p = lvPresetById(psel.value);
    if (!p) return;                                     
    V.endDrag && V.endDrag();                           
    V.set(V.channel(), lvGroupFromPreset(p.v));
    V.after(); V.rebuild();
  };
  row1.append(psel);
  panel.append(row1);

  
  const row2 = mk('div', { className: 'arow' });
  row2.append(mk('label', { className: 'k', textContent: '通道' }));
  const csel = mk('select');
  csel.dataset.attr = A('channel');
  csel.title = 'PS 的色阶是**逐通道分存**的：在红通道调完切回 RGB，红的设置还在，RGB 只是叠在它上面';
  const chans = V.channels();
  for (const [v, t] of LV_CHANNEL_OPTS) {
    if (!chans.includes(v)) continue;                   
    csel.append(mkEl('option', { value: v, textContent: t }));
  }
  csel.value = V.channel();
  csel.onchange = () => { V.endDrag && V.endDrag(); V.setChannel(csel.value); V.after(); V.rebuild(); };
  const auto = mk('button', { type: 'button', textContent: '自动' });
  auto.dataset.attr = A('auto');
  auto.style.cssText = 'flex:none;width:auto';
  auto.title = '给红/绿/蓝各自拉伸黑场白场（两端各裁掉 0.10% 的像素）——PS 自动校正的默认裁剪量';
  auto.onclick = () => { V.endDrag && V.endDrag(); V.auto(); V.after(); V.rebuild(); };
  row2.append(csel, auto);
  panel.append(row2);

  


  if (V.pickPoint) panel.append(buildAdjEyeRow(mk, A('eye'), (which, c) => {
    V.endDrag && V.endDrag();
    const okd = V.pickPoint(which, c);
    V.after();
    return okd;
  }));

  
  const cv = mk('canvas', { className: 'lvHist' });
  cv.dataset.attr = A('hist');
  cv.title = '当前通道的像素分布（忽略完全透明的像素）；竖线是黑场 / 中间调 / 白场的位置';
  panel.append(cv);

  
  const inTrack = mk('div', { className: 'lvTrack' });
  panel.append(inTrack);

  
  const outBar = mk('div', { className: 'lvOutBar' });
  const outTrack = mk('div', { className: 'lvTrack' });
  panel.append(outBar, outTrack);

  const rowIn = mk('div', { className: 'arow lvNums' });
  rowIn.append(mk('label', { className: 'k', textContent: '输入色阶' }));
  const rowOut = mk('div', { className: 'arow lvNums' });
  rowOut.append(mk('label', { className: 'k', textContent: '输出色阶' }));
  panel.append(rowIn, rowOut);

  
  const numBox = (host, attr, get, set, opt) => {
    const el = mk('input', { type: 'number', min: opt.min, max: opt.max, step: opt.step });
    el.dataset.attr = attr;
    el.title = opt.title;
    el.oninput = () => { const v = parseFloat(el.value); if (!isFinite(v)) return; set(v); sync(); V.after(); };
    
    el.onblur = () => { sync(); V.flush && V.flush(); };
    el.onchange = () => { sync(); V.flush && V.flush(); };
    boxes.push({ el, get, dec: opt.dec });
    host.append(el);
    return el;
  };
  


  const triangle = (host, attr, title, at, apply, stepKey) => {
    const el = mk('span', { className: 'lvTri', tabIndex: 0 });
    el.dataset.attr = attr; el.title = title;
    el.setAttribute('aria-label', title);
    el.addEventListener('pointerdown', ev => {
      if (ev.button != null && ev.button !== 0) return;
      const rect = host.getBoundingClientRect();
      


      if (!rect.width || !host.isConnected) return;        
      const sens = 255 / rect.width;
      const startLevel = Math.round(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * 255);
      V.beginDrag && V.beginDrag();                        
      const put = lv => { apply(lv); sync(); V.after(); };
      


      beginDragAdjust(ev, acc => {
        put(Math.max(0, Math.min(255, Math.round(startLevel + acc * sens))));
      }, () => { V.endDrag && V.endDrag(); }, () => 1);
      put(startLevel);                                     
    });
    el.addEventListener('keydown', ev => {
      const d = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0;
      const big = ev.key === 'Home' ? -1 : ev.key === 'End' ? 1 : 0;
      if (!d && !big) return;
      ev.preventDefault();
      V.beginDrag && V.beginDrag();
      apply(Math.max(0, Math.min(255, Math.round(at()) + d * stepKey + big * 255)));
      sync(); V.after();
      V.flush && V.flush();
    });
    tris.push({ el, at });
    host.append(el);
    return el;
  };

  

  triangle(inTrack, A('in-black'), '输入黑场：把这一级（含以下）映射成输出黑场', () => q().inputBlack,
    v => { V.set(V.channel(), { inputBlack: Math.max(0, Math.min(253, Math.min(v, q().inputWhite - 1))) }); }, 1);
  triangle(inTrack, A('in-gamma'), '中间调（灰度系数 0.10…9.99）：往左提亮、往右压暗',
    () => lvGammaPos(q()),
    v => {
      const g0 = q(), span = g0.inputWhite - g0.inputBlack;
      const frac = Math.max(lvGammaFrac(LV_GAMMA_MAX), Math.min(lvGammaFrac(LV_GAMMA_MIN), (v - g0.inputBlack) / span));
      
      V.set(V.channel(), { gamma: Math.round(lvFracToGamma(frac) * 100) / 100 });
    }, 2);
  triangle(inTrack, A('in-white'), '输入白场：把这一级（含以上）映射成输出白场', () => q().inputWhite,
    v => { V.set(V.channel(), { inputWhite: Math.min(255, Math.max(2, Math.max(v, q().inputBlack + 1))) }); }, 1);
  triangle(outTrack, A('out-black'), '输出黑场：最暗像素的色阶（可以越过白场做反相）', () => q().outputBlack,
    v => { V.set(V.channel(), { outputBlack: Math.max(0, Math.min(255, v)) }); }, 1);
  triangle(outTrack, A('out-white'), '输出白场：最亮像素的色阶（可以越过黑场做反相）', () => q().outputWhite,
    v => { V.set(V.channel(), { outputWhite: Math.max(0, Math.min(255, v)) }); }, 1);

  numBox(rowIn, A('in-black-num'), () => q().inputBlack,
    v => { V.set(V.channel(), { inputBlack: Math.max(0, Math.min(253, Math.round(Math.min(v, q().inputWhite - 1)))) }); },
    { min: 0, max: 253, step: 1, dec: 0, title: '输入黑场 0…253（PS 的上限就是 253）' });
  numBox(rowIn, A('in-gamma-num'), () => q().gamma,
    v => { V.set(V.channel(), { gamma: Math.max(LV_GAMMA_MIN, Math.min(LV_GAMMA_MAX, Math.round(v * 100) / 100 || 1)) }); },
    { min: LV_GAMMA_MIN, max: LV_GAMMA_MAX, step: 0.01, dec: 2, title: '中间调灰度系数 0.10…9.99' });
  numBox(rowIn, A('in-white-num'), () => q().inputWhite,
    v => { V.set(V.channel(), { inputWhite: Math.min(255, Math.max(2, Math.round(Math.max(v, q().inputBlack + 1)))) }); },
    { min: 2, max: 255, step: 1, dec: 0, title: '输入白场 2…255（PS 的下限就是 2）' });
  numBox(rowOut, A('out-black-num'), () => q().outputBlack,
    v => { V.set(V.channel(), { outputBlack: Math.max(0, Math.min(255, Math.round(v))) }); },
    { min: 0, max: 255, step: 1, dec: 0, title: '输出黑场 0…255' });
  numBox(rowOut, A('out-white-num'), () => q().outputWhite,
    v => { V.set(V.channel(), { outputWhite: Math.max(0, Math.min(255, Math.round(v))) }); },
    { min: 0, max: 255, step: 1, dec: 0, title: '输出白场 0…255' });

  

  function sync(){
    const g0 = q();
    for (const t of tris) t.el.style.left = (Math.max(0, Math.min(255, t.at())) / 255 * 100) + '%';
    for (const b of boxes) {
      if (document.activeElement === b.el) continue;
      const v = b.get();
      b.el.value = b.dec ? v.toFixed(b.dec) : String(Math.round(v));
    }
    psel.value = V.presetOf(V.channel());               
    lvDrawHist(cv, bins, g0);
  }

  body.append(panel);
  sync();
  return panel;
}




function dialogLevelsV(){
  const S = adjState, m = S.model;
  const grp = ch => m.groups[ch] || (m.groups[ch] = lvNeutralGroup());
  return {
    channels: () => ['rgb', 'r', 'g', 'b'],             
    channel: () => m.channel || 'rgb',
    setChannel: ch => { m.channel = ch; },
    group: ch => ({ ...grp(ch) }),
    set: (ch, patch) => { m.groups[ch] = { ...grp(ch), ...patch }; },
    presetOf: ch => lvMatchPreset(grp(ch)),
    bins: ch => lvBins(lvHistograms(S), ch),
    auto: () => {
      const g = lvAutoGroups(lvHistograms(S), ch => grp(ch).gamma);
      if (!g) return;
      Object.assign(m.groups, g);                       
      m.groups.rgb = lvNeutralGroup();                  
      m.channel = 'rgb';
    },
    rebuild: () => renderAdjustDialog(),
    after: () => adjSchedule(),
  };
}
