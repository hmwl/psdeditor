




import './10-crop.js';   
import { compositeAll } from '../../../core/app.js';
import { buildGradientLut, buildNoiseLut, paintBlend } from '../../../core/paint-fill.js';
import { formDialog } from '../dialog.js';
import { libGradientModel } from '../presets-panels.js';
import { shell } from '../shell.js';
import { $, selectionBounds, selectionValueAt } from './01-boot.js';
import {
  brushHistory, doc, docH, docName, docW, layerTree, li, rulersVisible, selection, sos,
} from './02-doc-state.js';
import { histCap, histPush, updateUndoButtons } from './03-history.js';
import { RULER_UNITS, rulerUnit, setRulerUnit, setRulersVisible } from './04-view-chrome.js';
import { cropRGBA, opaqueBBox, renderLayerAlone } from './05-layer-lock-guides.js';
import { downloadDataURL, layerNameOf, pixelsToCanvas } from './13-quickmask-apply-image.js';
import { matchLayer } from './22-deform-tools.js';
import { layerOrderView, selLayer } from './23-layers-panel.js';
import { parseHex6 } from './27-gradient-editor.js';
import { isMeshTransform, transformChanged } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import {
  composeDocForOrder, gpuBench, gpuStatus, paintStates, previewCompositeDoc, renderPreviewOnly,
} from './30-render.js';
import { bgRGB, fgRGB } from './31-selection-brush.js';
import { affInv } from './32-cursors-select-options.js';
import { docArtboards } from './35-artboard.js';
import {
  commitPixelPaint, cutRect, ensurePixelPaint, paintGuard, sameBytes, sparsePixelHistory,
} from './38-brush-engine.js';
import { affMul } from './47-canvas-context-menu.js';




















export const GRAD_PRESET_GROUPS = [
  { name: '基础', items: [['前景色到背景色', 'fgbg'], ['前景色到透明', 'fgtr'], ['黑，白渐变', [[0, '#000000'], [100, '#ffffff']]]] },
  { name: '蓝色', items: [
    ['蓝色_01', [[0, '#0d2b6b'], [100, '#4fa3ff']]], ['蓝色_02', [[0, '#1b4f9c'], [100, '#9fd9ff']]],
    ['蓝色_03', [[0, '#003366'], [50, '#1e7fd6'], [100, '#bfe6ff']]], ['蓝色_04', [[0, '#0a1a3a'], [100, '#2d6fd1']]],
    ['蓝色_05', [[0, '#36c2ff'], [100, '#0047b3']]], ['蓝色_06', [[0, '#5b86e5'], [100, '#36d1dc']]],
    ['蓝色_07', [[0, '#1c3f94'], [55, '#3fa0e0'], [100, '#e3f6ff']]], ['蓝色_08', [[0, '#082850'], [100, '#79b8ff']]]] },
  { name: '紫色', items: [
    ['紫色_01', [[0, '#3a0f6b'], [100, '#b36bff']]], ['紫色_02', [[0, '#5b2a86'], [100, '#e3b6ff']]],
    ['紫色_03', [[0, '#240046'], [50, '#7b2cbf'], [100, '#e0aaff']]], ['紫色_04', [[0, '#4a00e0'], [100, '#8e2de2']]],
    ['紫色_05', [[0, '#6a3093'], [100, '#a044ff']]], ['紫色_06', [[0, '#2b1055'], [100, '#7597de']]],
    ['紫色_07', [[0, '#41295a'], [100, '#2f0743']]], ['紫色_08', [[0, '#9d50bb'], [100, '#6e48aa']]]] },
  { name: '粉色', items: [
    ['粉色_01', [[0, '#ff5fa2'], [100, '#ffd1e6']]], ['粉色_02', [[0, '#c2185b'], [100, '#ff8fc0']]],
    ['粉色_03', [[0, '#ee9ca7'], [100, '#ffdde1']]], ['粉色_04', [[0, '#ff0084'], [100, '#ff9ad5']]],
    ['粉色_05', [[0, '#8e0e4b'], [50, '#ea4c89'], [100, '#ffc3dd']]], ['粉色_06', [[0, '#f857a6'], [100, '#ff5858']]],
    ['粉色_07', [[0, '#dd5e89'], [100, '#f7bb97']]], ['粉色_08', [[0, '#ffafbd'], [100, '#ffc3a0']]]] },
  { name: '红色', items: [
    ['红色_01', [[0, '#5c0000'], [100, '#ff3b30']]], ['红色_02', [[0, '#b31217'], [100, '#e52d27']]],
    ['红色_03', [[0, '#8b0000'], [50, '#e0282e'], [100, '#ff9a8b']]], ['红色_04', [[0, '#cb2d3e'], [100, '#ef473a']]],
    ['红色_05', [[0, '#3d0000'], [100, '#c31432']]], ['红色_06', [[0, '#ff416c'], [100, '#ff4b2b']]],
    ['红色_07', [[0, '#93291e'], [100, '#ed213a']]], ['红色_08', [[0, '#f00000'], [100, '#dc281e']]]] },
  { name: '橙色', items: [
    ['橙色_01', [[0, '#b33c00'], [100, '#ffb347']]], ['橙色_02', [[0, '#ff512f'], [100, '#f09819']]],
    ['橙色_03', [[0, '#f12711'], [100, '#f5af19']]], ['橙色_04', [[0, '#e65c00'], [100, '#f9d423']]],
    ['橙色_05', [[0, '#ff8008'], [100, '#ffc837']]], ['橙色_06', [[0, '#7a2e00'], [50, '#ff7b00'], [100, '#ffe0a3']]],
    ['橙色_07', [[0, '#fc4a1a'], [100, '#f7b733']]], ['橙色_08', [[0, '#ee0979'], [100, '#ff6a00']]]] },
  { name: '绿色', items: [
    ['绿色_01', [[0, '#0b3d0b'], [100, '#6bd66b']]], ['绿色_02', [[0, '#134e5e'], [100, '#71b280']]],
    ['绿色_03', [[0, '#11998e'], [100, '#38ef7d']]], ['绿色_04', [[0, '#005c2b'], [50, '#2fa84f'], [100, '#d4f7c5']]],
    ['绿色_05', [[0, '#56ab2f'], [100, '#a8e063']]], ['绿色_06', [[0, '#0f3443'], [100, '#34e89e']]],
    ['绿色_07', [[0, '#1d4d21'], [100, '#9bd770']]], ['绿色_08', [[0, '#a8ff78'], [100, '#78ffd6']]]] },
  { name: '灰色', items: [
    ['灰色_01', [[0, '#1a1a1a'], [100, '#8c8c8c']]], ['灰色_02', [[0, '#4d4d4d'], [100, '#e6e6e6']]],
    ['灰色_03', [[0, '#000000'], [50, '#808080'], [100, '#ffffff']]], ['灰色_04', [[0, '#2c3e50'], [100, '#bdc3c7']]],
    ['灰色_05', [[0, '#606c88'], [100, '#3f4c6b']]], ['灰色_06', [[0, '#232526'], [100, '#414345']]],
    ['灰色_07', [[0, '#757f9a'], [100, '#d7dde8']]], ['灰色_08', [[0, '#bdbdbd'], [100, '#f5f5f5']]]] },
];

export const GRAD_PRESET_INDEX = (() => {
  const m = new Map();
  for (const g of GRAD_PRESET_GROUPS) for (const [name, spec, trns] of g.items) {
    const id = typeof spec === 'string' ? spec : (g.name === '基础' ? 'bw' : `${g.name}/${name}`);
    m.set(id, { id, name, group: g.name, spec, trns });
  }
  return m;
})();
export const GRAD_STYLES = [
  { value: 'linear',    label: '线性渐变', key: 'Lnr ' },
  { value: 'radial',    label: '径向渐变', key: 'Rdl ' },
  { value: 'angle',     label: '角度渐变', key: 'Angl' },
  { value: 'reflected', label: '对称渐变', key: 'Rflc' },
  { value: 'diamond',   label: '菱形渐变', key: 'Dmnd' },
];




export const gradOpts = { mode: 'gradient', preset: 'fgbg', style: 'linear', blend: 'normal', opacity: 1, reverse: false, dither: true,
                   transparency: true, method: 'perceptual', model: null };



export const bucketOpts = { source: 'fg', pattern: '', blend: 'normal', opacity: 1, tolerance: 32, antialias: true, contiguous: true, allLayers: false };
export const eyeOpts = { size: 1, sample: 'all', ring: true,
  
  get all(){ return this.sample !== 'cur'; }, set all(v){ this.sample = v ? 'all' : 'cur'; } };
try { const o = JSON.parse(localStorage.getItem('psd_editor.eyeOpts') || '{}'); if (o.size) eyeOpts.size = o.size; if (o.sample) eyeOpts.sample = o.sample; if (o.ring != null) eyeOpts.ring = !!o.ring; } catch {}
export const saveEyeOpts = () => { try { localStorage.setItem('psd_editor.eyeOpts', JSON.stringify({ size: eyeOpts.size, sample: eyeOpts.sample, ring: eyeOpts.ring })); } catch {} };
export let gradDrag = null;             
export function set_gradDrag(v) { return (gradDrag = v); }   
export let gradBarBound = false, bucketBarBound = false, eyeBarBound = false;
export function set_gradBarBound(v) { return (gradBarBound = v); }   
export function set_bucketBarBound(v) { return (bucketBarBound = v); }   
export function set_eyeBarBound(v) { return (eyeBarBound = v); }   


export function gradPresetModel(preset){
  const fg = fgRGB, bg = bgRGB;
  const C = (loc, c) => ({ loc, r: c[0], g: c[1], b: c[2], mid: 50 });
  const T = (loc, o) => ({ loc, opct: o, mid: 50 });
  if (typeof preset === 'string' && preset.startsWith('lib:')) {       
    const m = libGradientModel(preset.slice(4), fg, bg);
    if (m) return m;
  }
  const P = GRAD_PRESET_INDEX.get(preset);
  const spec = P ? P.spec : 'fgbg';
  if (spec === 'fgtr') return { clrs: [C(0, fg), C(4096, fg)], trns: [T(0, 100), T(4096, 0)], sel: { kind: 'color', i: 0 } };
  if (spec === 'trfg') return { clrs: [C(0, fg), C(4096, fg)], trns: [T(0, 0), T(4096, 100)], sel: { kind: 'color', i: 0 } };
  if (Array.isArray(spec)) {
    const clrs = spec.map(([p, hex]) => C(Math.round(p * 40.96), parseHex6(hex) || [0, 0, 0]));
    const trns = (P.trns || [[0, 100], [100, 100]]).map(([p, o]) => T(Math.round(p * 40.96), o));
    return { clrs, trns, sel: { kind: 'color', i: 0 } };
  }
  return { clrs: [C(0, fg), C(4096, bg)], trns: [T(0, 100), T(4096, 100)], sel: { kind: 'color', i: 0 } };
}

export function gradCurrentModel(){ return gradOpts.model || gradPresetModel(gradOpts.preset); }


export function gradModelLut(m, o = {}){
  if (m.noise) return buildNoiseLut(m.noise, o.size || 1024);
  return buildGradientLut({
    colors: m.clrs.map(s => ({ pos: s.loc / 4096, color: [s.r, s.g, s.b], mid: (s.mid == null ? 50 : s.mid) / 100 })),
    alphas: m.trns.map(s => ({ pos: s.loc / 4096, a: s.opct / 100, mid: (s.mid == null ? 50 : s.mid) / 100 })),
    method: o.method || gradOpts.method, smoothness: (m.smooth == null ? 100 : m.smooth) / 100,
    transparency: o.transparency !== undefined ? o.transparency : true, size: o.size || 1024,
  });
}

export function gradStops(){
  const lut = gradModelLut(gradCurrentModel(), { transparency: gradOpts.transparency, size: 257 });
  let s = [];
  for (let k = 0; k < 257; k++) s.push({ t: k / 256, c: [lut[k * 4], lut[k * 4 + 1], lut[k * 4 + 2]], a: lut[k * 4 + 3] });
  if (gradOpts.reverse) s = s.map(k => ({ ...k, t: 1 - k.t })).reverse();
  return s;
}

export function gradSample(stops, t){
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1].t) i++;
  const a = stops[i], b = stops[i + 1] || a;
  const span = b.t - a.t;
  const u = span > 1e-9 ? (t - a.t) / span : 0;
  return [
    a.c[0] + (b.c[0] - a.c[0]) * u,
    a.c[1] + (b.c[1] - a.c[1]) * u,
    a.c[2] + (b.c[2] - a.c[2]) * u,
    a.a + (b.a - a.a) * u,
  ];
}

export function gradParam(style, x0, y0, x1, y1, x, y){
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return 1;
  const px = x - x0, py = y - y0;
  switch (style) {
    case 'radial':    return Math.hypot(px, py) / Math.sqrt(L2);
    case 'reflected': return Math.abs(px * dx + py * dy) / L2;
    case 'angle': {
      let t = (Math.atan2(py, px) - Math.atan2(dy, dx)) / (2 * Math.PI);
      return t - Math.floor(t);                        
    }
    case 'diamond': {
      const L = Math.sqrt(L2), ux = dx / L, uy = dy / L;
      return (Math.abs(px * ux + py * uy) + Math.abs(-px * uy + py * ux)) / L;
    }
    default:          return (px * dx + py * dy) / L2;  
  }
}







export function paintMap(idx, sw, sh, left, top){
  const t = isMeshTransform(idx) ? null : transformChanged(idx);
  if (!t) { const M = [1, 0, 0, 1, left, top]; return { M, inv: affInv(M) }; }
  if (t.quad || !(sw > 0 && sh > 0)) return null;
  const a = (t.rot || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const M = affMul([1, 0, 0, 1, t.x + t.w / 2, t.y + t.h / 2],
            affMul([cos, sin, -sin, cos, 0, 0],
            affMul([t.flipX ? -1 : 1, 0, 0, t.flipY ? -1 : 1, 0, 0],
                   [t.w / sw, 0, 0, t.h / sh, -t.w / 2, -t.h / 2])));
  const inv = affInv(M);
  return inv ? { M, inv } : null;
}
export const PAINT_WARP_WHY = '这个图层套着扭曲 / 透视变形：改的是变换前的源像素，落点换算不回去 —— 先还原变形（或提交后重新栅格化）再画。';


export function paintOrigin(idx, pp){
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) return null;
  const M = map.M, e = 1e-6;
  if (Math.abs(M[0] - 1) > e || Math.abs(M[3] - 1) > e || Math.abs(M[1]) > e || Math.abs(M[2]) > e) return null;
  return { left: Math.round(M[4]), top: Math.round(M[5]) };
}
export const PAINT_SCALED_WHY = '这个图层套着缩放 / 旋转 / 变形：选区限定的范围换算不回源像素 —— 先还原变形，或取消选区后整层应用。';

export function srcBoxOfDocRect(inv, r){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [cx, cy] of [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]]) {
    const sx = inv[0] * cx + inv[2] * cy + inv[4], sy = inv[1] * cx + inv[3] * cy + inv[5];
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}






export function paintPixelsWith(at, opts = {}){
  if (!doc || li) return false;
  
  const brt = $('#brTarget');
  const prevT = brt ? brt.value : null;
  if (brt) brt.value = 'pixels';
  const guard = paintGuard();
  if (brt) brt.value = prevT;
  if (guard) { $('#notice').textContent = guard; return false; }
  const idx = selLayer;
  const pp = ensurePixelPaint(idx);
  if (!pp) { $('#notice').textContent = '这个图层没有像素。'; return false; }
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) { $('#notice').textContent = PAINT_WARP_WHY; return false; }
  const M = map.M;
  const useSel = opts.useSelection !== false && !!selection;
  let x0 = 0, y0 = 0, x1 = pp.w, y1 = pp.h;             
  const clip = opts.bounds || (useSel ? selectionBounds(selection) : null);
  if (clip) {
    const s = srcBoxOfDocRect(map.inv, clip);
    x0 = Math.max(x0, s.x0); y0 = Math.max(y0, s.y0);
    x1 = Math.min(x1, s.x1); y1 = Math.min(y1, s.y1);
  }
  if (x1 <= x0 || y1 <= y0) return false;
  const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const before = cutRect(pp.rgba, pp.w, rect, 4);
  const blend = opts.blend;
  for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
    const sx = rect.x + x + 0.5, sy = rect.y + y + 0.5;
    
    const dx = Math.floor(M[0] * sx + M[2] * sy + M[4]), dy = Math.floor(M[1] * sx + M[3] * sy + M[5]);
    const c = at(dx, dy);
    if (!c) continue;
    let a = c[3] === undefined ? 255 : c[3];
    if (useSel) a = a * selectionValueAt(selection, dx, dy) / 255;
    if (a <= 0) continue;
    const o = ((rect.y + y) * pp.w + rect.x + x) * 4;
    

    if (blend && blend !== 'normal') {
      const r = paintBlend(blend, [pp.rgba[o], pp.rgba[o + 1], pp.rgba[o + 2], pp.rgba[o + 3]], c, a / 255);
      pp.rgba[o] = Math.round(r[0]); pp.rgba[o + 1] = Math.round(r[1]); pp.rgba[o + 2] = Math.round(r[2]); pp.rgba[o + 3] = Math.round(r[3]);
      continue;
    }
    const ca = a / 255, ba = pp.rgba[o + 3] / 255;
    const oa = ca + ba * (1 - ca);
    if (oa <= 0) { pp.rgba[o + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) pp.rgba[o + k] = Math.round((c[k] * ca + pp.rgba[o + k] * ba * (1 - ca)) / oa);
    pp.rgba[o + 3] = Math.round(oa * 255);
  }
  const after = cutRect(pp.rgba, pp.w, rect, 4);
  if (sameBytes(before, after)) return false;
  const base = Uint8ClampedArray.from(pp.rgba); for (let y = 0; y < rect.h; y++) base.set(before.subarray(y * rect.w * 4, (y + 1) * rect.w * 4), ((rect.y + y) * pp.w + rect.x) * 4);
  brushHistory.undo.push(sparsePixelHistory(idx, base, pp.rgba, pp.w, pp.h));
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  histPush(opts.label || '填充', 'brush');
  commitPixelPaint(idx);
  renderPreviewOnly(); updateUndoButtons();
  return true;
}








const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function makeZip(files){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
const canvasPNG = c => new Promise((res, rej) => c.toBlob(b => b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('PNG 编码失败')), 'image/png'));
export const safeName = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
export async function exportLayersToFiles(){
  if (!doc) return false;
  const v = await formDialog('将图层导出到文件', [
    { key: 'prefix', label: '文件名前缀', type: 'text', value: safeName((docName || 'doc').replace(/\.ps[db]$/i, '')) },
    { key: 'visibleOnly', label: '仅限可见图层', type: 'check', value: true },
    { key: 'trim', label: '按内容裁切', type: 'check', value: true },
    { type: 'note', label: 'PNG-24（带透明），打包成一个 zip 下载。' },
  ], { okText: '运行' });
  if (!v) return false;
  const view = layerOrderView(), st = paintStates(), files = [];
  shell.status('正在导出图层…'); await new Promise(r => setTimeout(r, 20));
  let k = 0;
  for (const i of view.visible.slice().reverse()) {
    const L = layerTree.flat[i]; if (!L || L.groupType === 3 || L.isGroup) continue;
    if (v.visibleOnly && st.hidden.has(i)) continue;
    const full = renderLayerAlone(i); if (!full) continue;
    let px;
    if (v.trim) { const b = opaqueBBox(full, docW, docH); if (!b) continue; px = { rgba: cropRGBA(full, docW, b), w: b.right - b.left, h: b.bottom - b.top }; }
    else px = { rgba: full, w: docW, h: docH };
    files.push({ name: `${v.prefix}_${String(++k).padStart(4, '0')}_${safeName(layerNameOf(i))}.png`, data: await canvasPNG(pixelsToCanvas(px)) });
  }
  if (!files.length) { $('#notice').textContent = '没有可导出的图层。'; return false; }
  const url = URL.createObjectURL(makeZip(files));
  downloadDataURL(url, v.prefix + '_图层.zip'); setTimeout(() => URL.revokeObjectURL(url), 5000);
  shell.status(`已导出 ${files.length} 个图层`);
  return true;
}
export async function exportArtboardsToFiles(){
  const abs = docArtboards(); if (!abs.length) { $('#notice').textContent = '这个文档里没有画板。'; return false; }
  const surf = compositeAll(composeDocForOrder(previewCompositeDoc(doc), displayOrder()), docW, docH, new Map());
  const files = [];
  for (const ab of abs) {
    const r = ab.rect, b = { left: Math.max(0, Math.round(r.x)), top: Math.max(0, Math.round(r.y)), right: Math.min(docW, Math.round(r.x + r.w)), bottom: Math.min(docH, Math.round(r.y + r.h)) };
    if (b.right <= b.left || b.bottom <= b.top) continue;
    files.push({ name: safeName(ab.name) + '.png', data: await canvasPNG(pixelsToCanvas({ rgba: cropRGBA(new Uint8ClampedArray(surf.data), docW, b), w: b.right - b.left, h: b.bottom - b.top })) });
  }
  const url = URL.createObjectURL(makeZip(files));
  downloadDataURL(url, safeName((docName || 'doc').replace(/\.ps[db]$/i, '')) + '_画板.zip'); setTimeout(() => URL.revokeObjectURL(url), 5000);
  shell.status(`已导出 ${files.length} 个画板`);
  return true;
}

export function exportSmartContents(){
  const so = sos.find(x => matchLayer(x) === selLayer), si = so && so.sourceImage;
  if (!si || !si.bytes) { $('#notice').textContent = '这个智能对象没有内嵌文件（可能是链接的）。'; return false; }
  const url = URL.createObjectURL(new Blob([si.bytes]));
  downloadDataURL(url, safeName(si.filename || (layerNameOf(selLayer) + '.psb'))); setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export let proofSim = null;
export function setProofSim(kind){
  proofSim = proofSim === kind ? null : kind;
  let svg = document.getElementById('fpProofSvg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'fpProofSvg'; svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
    svg.innerHTML = '<filter id="fpProtan"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0 0.115 0.786 0.099 0 0 -0.004 -0.048 1.052 0 0 0 0 0 1 0"/></filter>'
      + '<filter id="fpDeutan"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0 0.280 0.673 0.047 0 0 -0.012 0.043 0.969 0 0 0 0 0 1 0"/></filter>';
    document.body.append(svg);
  }
  const st = $('#stage'); if (st) st.style.filter = proofSim ? `url(#${proofSim === 'protan' ? 'fpProtan' : 'fpDeutan'})` : '';
  shell.status(proofSim ? `校样：${proofSim === 'protan' ? '色盲 - 红色盲型' : '色盲 - 绿色盲型'}（只改显示）` : '校样：关');
}
export function systemInfoDialog(){
  const n = navigator, gl = (() => { try { const c = document.createElement('canvas').getContext('webgl'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : (c ? 'WebGL 可用' : '不可用'); } catch { return '不可用'; } })();
  return formDialog('系统信息', [
    { key: 'ua', label: '浏览器', type: 'textarea', value: n.userAgent, readonly: true, rows: 3 },
    { key: 'plat', label: '平台', type: 'text', value: n.platform || '', readonly: true },
    { key: 'cpu', label: 'CPU 线程', type: 'text', value: String(n.hardwareConcurrency || '?'), readonly: true },
    { key: 'mem', label: '内存（估计）', type: 'text', value: n.deviceMemory ? n.deviceMemory + ' GB' : '浏览器不公开', readonly: true },
    { key: 'gpu', label: '显卡', type: 'text', value: gl, readonly: true },
    { key: 'wgpu', label: 'WebGPU 合成', type: 'text', value: (() => { const g = gpuStatus(); return g.on ? `在用（${g.name}）` : (g.name ? g.name + ' · ' : '') + (g.why || '未启用'); })(), readonly: true },
    { key: 'scr', label: '屏幕', type: 'text', value: `${screen.width}×${screen.height} @${devicePixelRatio}x`, readonly: true },
    { key: 'doc', label: '当前文档', type: 'text', value: doc ? `${docName} · ${docW}×${docH} · ${doc.layers.length} 层` : '（无）', readonly: true },
  ], { okOnly: true, okText: '关闭' });
}

export async function gpuCompatDialog(){
  const g = gpuStatus();
  let bench = '（没有打开文档，或当前走 CPU 合成：不测）';
  if (g.on) { shell.status('正在测 GPU 合成速度…'); try { const r = await gpuBench(30); bench = r ? `视口 ${r.W}×${r.H} · ${r.ops} 个绘制步骤 · 平均 ${r.avg.toFixed(2)} ms / 帧（最慢 ${r.max.toFixed(1)} ms）≈ ${Math.round(1000 / Math.max(0.1, r.avg))} fps` : '测不了'; } catch (e) { bench = '测试出错：' + (e && e.message || e); } shell.status(''); }
  return formDialog('GPU 兼容性', [
    { key: 'st', label: '状态', type: 'text', value: g.on ? '在用：画布预览由显卡按视口合成（WebGPU）' : '未在用：' + (g.why || '—'), readonly: true },
    { key: 'name', label: '图形处理器', type: 'text', value: g.name || '（未检测到 WebGPU 适配器）', readonly: true },
    { key: 'mem', label: '显存中的图层', type: 'text', value: g.bytes ? (g.bytes / 1048576).toFixed(0) + ' MB' : '—', readonly: true },
    { key: 'bench', label: '合成速度', type: 'textarea', value: bench, readonly: true, rows: 2 },
    { key: 'note', label: '说明', type: 'textarea', readonly: true, rows: 5, value: '底层 API：macOS 上是 Metal，Windows 上是 Direct3D 12，Linux / Android 上是 Vulkan（浏览器的 WebGPU 自动选）。\n首选项 › 性能 › 「使用图形处理器」可以关掉它（退回 CPU 合成）。\n智能对象网格变形编辑、视图旋转、只看蒙版 / Alpha 叠加时会临时用 CPU 合成；存盘 / 导出始终用 CPU（结果逐字节确定）。' },
  ], { okOnly: true, okText: '关闭' });
}
async function unitsPrefsDialog(){
  const v = await formDialog('首选项 · 单位与标尺', [
    { key: 'unit', label: '标尺单位', type: 'select', value: rulerUnit, options: Object.keys(RULER_UNITS).map(u => [u, RULER_UNITS[u].label || u]) },
    { key: 'rulers', label: '显示标尺', type: 'check', value: rulersVisible },
  ]);
  if (!v) return false;
  setRulerUnit(v.unit); setRulersVisible(v.rulers); return true;
}
