



















import * as store from './preset-store.js';
import { readPat, writePat, writePatternBlock, cropPattern, newPatternId } from '../../core/pat.js';
import { readGrd, writeGrd } from '../../core/grd.js';
import { readCsh, writeCsh, normalizeSubpaths } from '../../core/csh.js';
import { readAsl, writeAsl, effectsToBytes, effectsFromBytes, effectPatternIds } from '../../core/asl.js';
import { readSwatchFile, writeAco, writeAse, writeAct, rgbSwatch } from '../../core/swatches.js';
import { parseAdditionalBlock } from '../../core/psd-additional.js';
import { compositeAll } from '../../core/compose.js';
import { inflateRaw } from '../../core/inflate.js';
import { CUSTOM_SHAPES, CUSTOM_SHAPE_BY_ID, setLibraryShapes } from './shapes.js';
import { gradientToDesc } from '../../core/grd.js';
import { colorPanel, recentColors, onRecentColors, clearRecentColors } from './color-panel.js';
import { seedPhotoshopPresets, openPhotoshopPresetLibrary } from './photoshop-presets.js';

let A = null;                       
const $ = s => document.querySelector(s);
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const KINDS5 = ['patterns', 'gradients', 'shapes', 'styles', 'swatches'];


export const lib = { patterns: [], gradients: [], shapes: [], styles: [], swatches: [], groups: {}, ready: false };
const selected = { patterns: null, gradients: null, shapes: null, styles: null, swatches: null };

const multi = { patterns: new Set(), gradients: new Set(), shapes: new Set(), styles: new Set(), swatches: new Set() };
const selectedGroup = { swatches: null, gradients: null, patterns: null };
const search = { patterns: '', gradients: '', shapes: '', styles: '', swatches: '' };



const FORMATS = {
  patterns: { ext: 'pat', label: '图案', read: b => readPat(b), write: items => writePat(items) },
  gradients: { ext: 'grd', label: '渐变', read: b => readGrd(b), write: items => writeGrd(items) },
  shapes: { ext: 'csh', label: '形状', read: b => readCsh(b), write: items => writeCsh(items) },
  styles: { ext: 'asl', label: '样式', read: null, write: null },          
  swatches: { ext: 'aco', label: '色板', read: (b, n) => readSwatchFile(b, n), write: items => writeAco(items) },
};
export function registerPresetFormat(kind, fmt) { FORMATS[kind] = { ...(FORMATS[kind] || {}), ...fmt }; }
if (typeof window !== 'undefined') window.__psd_editorPresetFormats = { register: registerPresetFormat, FORMATS };


const parsedCache = new Map();      
function parsedRecord(p) {
  let r = parsedCache.get(p.id);
  if (r && r._name === p.name) return r;
  try {
    const m = parseAdditionalBlock('Patt', writePatternBlock([p]), { psb: false });
    r = m && m.patterns && m.patterns[0];
    if (!r) return null;
    r._lib = true; r._name = p.name;
    parsedCache.set(p.id, r);
    return r;
  } catch { return null; }
}

export function libMaterialize(doc) {
  if (!doc) return;
  const own = (doc.patterns || []).filter(p => !p._lib);
  const have = new Set(own.map(p => p.id));
  const add = [];
  for (const p of lib.patterns) if (!have.has(p.id)) { const r = parsedRecord(p); if (r) add.push(r); }
  doc.patterns = own.concat(add);
  if (!doc.patterns.length) delete doc.patterns;
}

function scanIdnt(u8, ranges = [[0, u8.length]]) {
  const out = new Set();
  for (const [r0, r1] of ranges) scanIdntRange(u8, r0, Math.min(u8.length, r1), out);
  return out;
}
function scanIdntRange(u8, from, to, out) {
  const n = to - 12;
  for (let i = from; i < n; i++) {
    if (u8[i] !== 0x49 || u8[i + 1] !== 0x64 || u8[i + 2] !== 0x6e || u8[i + 3] !== 0x74) continue;   
    if (u8[i + 4] !== 0x54 || u8[i + 5] !== 0x45 || u8[i + 6] !== 0x58 || u8[i + 7] !== 0x54) continue; 
    const len = (u8[i + 8] << 24 | u8[i + 9] << 16 | u8[i + 10] << 8 | u8[i + 11]) >>> 0;
    if (len > 200 || i + 12 + len * 2 > u8.length) continue;
    let s = '';
    for (let k = 0; k < len; k++) { const c = (u8[i + 12 + k * 2] << 8) | u8[i + 13 + k * 2]; if (c) s += String.fromCharCode(c); }
    out.add(s);
  }
}

export function injectLibPatterns(buf, applyEdits, parsePsdFull) {
  if (!lib.patterns.length || !applyEdits) return buf;
  const u8 = new Uint8Array(buf);
  
  let ranges;
  try {
    const p = parsePsdFull && parsePsdFull(buf), s = p && p.sections, ls = p && p.layers.filter(l => l.chDataEnd > l.chDataStart);
    if (s && ls && ls.length) ranges = [[0, Math.min(...ls.map(l => l.chDataStart))], [Math.max(...ls.map(l => l.chDataEnd)), s.lmiEndAbs]];
    else if (s) ranges = [[0, s.lmiEndAbs]];
  } catch { ranges = undefined; }
  const ids = scanIdnt(u8, ranges);
  const want = lib.patterns.filter(p => ids.has(p.id));
  if (!want.length) return buf;
  const r = applyEdits(buf, [{ op: 'addPatterns', patterns: want.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })) }], { verify: false });
  return r.buffer;
}

export function libGradientModel(id, fg, bg) {
  const g = lib.gradients.find(x => x.id === id);
  if (!g) return null;
  const m = JSON.parse(JSON.stringify(g.model));
  for (const s of m.clrs) { const c = s.type === 'fg' ? fg : s.type === 'bg' ? bg : null; if (c) { s.r = c[0]; s.g = c[1]; s.b = c[2]; } }
  m.sel = { kind: 'color', i: 0 };
  return m;
}
export function libGradientGroups() {
  const groups = lib.groups.gradients || [];
  const out = [];
  const loose = lib.gradients.filter(g => !g.group);
  if (loose.length) out.push({ name: '我的渐变', items: loose });
  for (const g of groups) { const items = lib.gradients.filter(x => x.group === g.id); out.push({ name: g.name, items }); }
  return out;
}
export const currentPatternId = () => selected.patterns;



const SEED_KEY = 'fp.presetsSeeded.v1';
function seeded() { try { return JSON.parse(localStorage.getItem(SEED_KEY) || '{}'); } catch { return {}; } }
function markSeeded(kind) { try { const s = seeded(); s[kind] = 1; localStorage.setItem(SEED_KEY, JSON.stringify(s)); } catch {} }
const SEED_SWATCHES = [
  ['RGB', ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']],
  ['灰度', ['#ffffff', '#e6e6e6', '#cccccc', '#b3b3b3', '#999999', '#808080', '#666666', '#4d4d4d', '#333333', '#1a1a1a', '#000000']],
  ['粉彩', ['#f9c5c5', '#fbe3c5', '#fdf7c5', '#d9f5c5', '#c5f1e6', '#c5e0fb', '#d9cbf7', '#f7cbe8']],
  ['浅色', ['#f26d6d', '#f6a86d', '#f5e06d', '#a9e06d', '#6dd9c8', '#6db2f5', '#a58df3', '#f38bd0']],
  ['深色', ['#b71c1c', '#e65100', '#f9a825', '#33691e', '#00695c', '#0d47a1', '#4527a0', '#880e4f']],
  ['更暗', ['#5d0d0d', '#7a2b00', '#7f5410', '#1b3a0f', '#003a33', '#062a5f', '#221450', '#4a0729']],
];
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const swatchRGB = it => it.model === 'cmyk' && it.values ? colorPanel._conv.cmyk2rgb(it.values) : it.model === 'lab' && it.values ? colorPanel._conv.lab2rgb(it.values) : it.color.slice(0, 3);
const rgb2hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const P = (u, v) => ({ __unit: u, value: v });
const RGBC = (r, g, b) => ({ __name: '', __classID: 'RGBC', 'Rd  ': r, 'Grn ': g, 'Bl  ': b, __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true } });
const E = (t, v) => ({ __enumType: t, value: v });
function seedStyles() {
  const base = extra => ({ __name: '', __classID: 'null', 'Scl ': P('#Prc', 100), masterFXSwitch: true, ...extra });
  const common = { enab: true, present: true, showInDialog: true };
  return [
    { name: '投影', effects: base({ DrSh: { __name: '', __classID: 'DrSh', ...common, 'Md  ': E('BlnM', 'Mltp'), 'Clr ': RGBC(0, 0, 0), Opct: P('#Prc', 75), uglg: true, lagl: P('#Ang', 120), Dstn: P('#Pxl', 8), Ckmt: P('#Pxl', 0), blur: P('#Pxl', 10), Nose: P('#Prc', 0), AntA: false, layerConceals: true } }) },
    { name: '白色描边', effects: base({ FrFX: { __name: '', __classID: 'FrFX', ...common, Styl: E('FStl', 'OutF'), PntT: E('FrFl', 'SClr'), 'Md  ': E('BlnM', 'Nrml'), Opct: P('#Prc', 100), 'Sz  ': P('#Pxl', 4), 'Clr ': RGBC(255, 255, 255) } }) },
    { name: '红色叠加', effects: base({ SoFi: { __name: '', __classID: 'SoFi', ...common, 'Md  ': E('BlnM', 'Nrml'), 'Clr ': RGBC(220, 40, 40), Opct: P('#Prc', 100) } }) },
    { name: '外发光', effects: base({ OrGl: { __name: '', __classID: 'OrGl', ...common, 'Md  ': E('BlnM', 'Scrn'), 'Clr ': RGBC(255, 255, 190), Opct: P('#Prc', 75), GlwT: E('BETE', 'SfBL'), Ckmt: P('#Pxl', 0), blur: P('#Pxl', 16), Nose: P('#Prc', 0), ShdN: P('#Prc', 0), AntA: false, Inpr: P('#Prc', 50) } }) },
  ].map(s => ({ name: s.name, effectsBytes: effectsToBytes(s.effects), patternIds: [] }));
}
async function seedIfNeeded() {
  const s = seeded();
  if (!s.styles && !(await store.listPresets('styles')).length) await store.addPresets('styles', seedStyles(), { groupName: '基础' });
  markSeeded('styles');
}

async function retireApproximateDefaults() {
  const swatches = await store.listPresets('swatches');
  if (seeded().swatches && swatches.some(it => it.sourcePack === 'default-swatches')) {
    for (const group of await store.listGroups('swatches')) {
      const seed = SEED_SWATCHES.find(([name]) => name === group.name);
      if (!seed || group.builtinPack) continue;
      const rows = swatches.filter(it => it.group === group.id);
      if (rows.length === seed[1].length && rows.every((it, i) => !it.sourcePack && it.name === seed[1][i] && it.model === 'rgb' && rgb2hex(it.color) === seed[1][i])) await store.removeGroup('swatches', group.id, true);
    }
  }
  const patterns = await store.listPresets('patterns');
  if (seeded().patterns && patterns.some(it => it.sourcePack === 'default-patterns') && A.builtinPatterns) {
    const seeds = A.builtinPatterns();
    for (const group of await store.listGroups('patterns')) {
      if (group.builtinPack || group.name !== '默认') continue;
      const rows = patterns.filter(it => it.group === group.id);
      if (rows.length === seeds.length && rows.every((it, i) => !it.sourcePack && it.name === seeds[i].name && it.width === seeds[i].width && it.height === seeds[i].height && it.rgba?.length === seeds[i].data.length && it.rgba.every((v, j) => v === seeds[i].data[j]))) await store.removeGroup('patterns', group.id, true);
    }
  }
}


function patternThumb(p, size = 32) {
  const cv = mk('canvas'); cv.width = size; cv.height = size;
  const c = cv.getContext('2d'); if (!c || !p || !p.width) return cv;
  const src = mk('canvas'); src.width = p.width; src.height = p.height;
  try { src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height), 0, 0); } catch { return cv; }
  
  if (p.width <= size && p.height <= size) { c.fillStyle = c.createPattern(src, 'repeat'); c.fillRect(0, 0, size, size); }
  else { const k = size / Math.max(p.width, p.height); c.imageSmoothingQuality = 'high'; c.drawImage(src, 0, 0, p.width * k, p.height * k); }
  return cv;
}
function tracePathSub(c, sp, map) {
  const ks = sp.knots; if (!ks.length) return;
  c.moveTo(...map(ks[0].anchor));
  const n = ks.length, segs = sp.closed === false ? n - 1 : n;
  for (let i = 0; i < segs; i++) { const a = ks[i], b = ks[(i + 1) % n]; c.bezierCurveTo(...map(a.out || a.anchor), ...map(b.in || b.anchor), ...map(b.anchor)); }
  if (sp.closed !== false) c.closePath();
}
function shapeThumb(s, size = 32, color = '#d6d6d6') {
  const cv = mk('canvas'); cv.width = size; cv.height = size;
  const c = cv.getContext('2d'); if (!c || !s) return cv;
  const a = s.aspect || 1, pad = Math.max(2, Math.round(size * 0.1)), box = size - pad * 2;
  const w = a >= 1 ? box : box * a, h = a >= 1 ? box / a : box, x0 = (size - w) / 2, y0 = (size - h) / 2;
  const map = p => [x0 + p[0] * w, y0 + p[1] * h];
  const OPS = ['xor', 'source-over', 'destination-out', 'destination-in'];
  (s.subpaths || []).forEach((sp, i) => {
    c.save(); c.beginPath(); tracePathSub(c, sp, map);
    if (i > 0) c.globalCompositeOperation = OPS[sp.operation] || 'source-over';
    c.fillStyle = color; c.fill(); c.restore();
  });
  return cv;
}
const styleThumbCache = new Map();
const dirtyPresetPanels = new Set();
let presetVisibilityWired = false;
function styleThumb(st, size = 32) {
  const key = st.id + ':' + size;
  const cached = styleThumbCache.get(key);
  const cv = mk('canvas'); cv.width = size; cv.height = size;
  const c = cv.getContext('2d'); if (!c) return cv;
  if (cached) { c.drawImage(cached, 0, 0); return cv; }
  
  const S = 64, inset = 14, rgba = new Uint8ClampedArray(S * S * 4);
  for (let y = inset; y < S - inset; y++) for (let x = inset; x < S - inset; x++) {
    const o = (y * S + x) * 4; rgba[o] = 180; rgba[o + 1] = 180; rgba[o + 2] = 180; rgba[o + 3] = 255;
  }
  let data = rgba;
  try {
    const effects = effectsFromBytes(st.effectsBytes);
    const patterns = lib.patterns.map(parsedRecord).filter(Boolean);
    const layer = { name: '', rgba, bounds: { top: 0, left: 0, bottom: S, right: S }, width: S, height: S, top: 0, left: 0,
      opacity: 255, fillOpacity: 255, blendMode: 'normal', hidden: false, visible: true, clipping: 0, group: null, effects };
    const surf = compositeAll({ layers: [layer], patterns }, S, S, new Map());
    if (surf && surf.data) data = new Uint8ClampedArray(surf.data);
  } catch {  }
  const tmp = mk('canvas'); tmp.width = S; tmp.height = S;
  const tc = tmp.getContext('2d');
  tc.fillStyle = '#e4e4e4'; tc.fillRect(0, 0, S, S);
  const layerCv = mk('canvas'); layerCv.width = S; layerCv.height = S;
  layerCv.getContext('2d').putImageData(new ImageData(data, S, S), 0, 0);
  tc.drawImage(layerCv, 0, 0);
  c.imageSmoothingQuality = 'high'; c.drawImage(tmp, 0, 0, size, size);
  
  
  styleThumbCache.set(key, cv);
  return cv;
}


const VIEW_KEY = 'fp.presetView';


const VIEWS = [['text', '仅文本'], ['small', '小缩览图'], ['large', '大缩览图'], ['smallList', '小列表'], ['largeList', '大列表']];
function viewOf(kind) {
  let v; try { v = (JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'))[kind]; } catch {}
  if (v === 'list') v = 'smallList';
  return VIEWS.some(x => x[0] === v) ? v : (kind === 'swatches' ? 'small' : 'large');
}
const isListView = v => v === 'text' || v === 'smallList' || v === 'largeList';
const SHOW_RECENT_KEY = 'fp.presetShowRecent';
function showRecent(kind) { try { const o = JSON.parse(localStorage.getItem(SHOW_RECENT_KEY) || '{}'); return o[kind] != null ? !!o[kind] : kind === 'swatches'; } catch { return kind === 'swatches'; } }
function setShowRecent(kind, on) { try { const o = JSON.parse(localStorage.getItem(SHOW_RECENT_KEY) || '{}'); o[kind] = !!on; localStorage.setItem(SHOW_RECENT_KEY, JSON.stringify(o)); } catch {} render(kind); }
function setView(kind, v) { try { const o = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); o[kind] = v; localStorage.setItem(VIEW_KEY, JSON.stringify(o)); } catch {} render(kind); }
const COLLAPSE_KEY = 'fp.presetCollapsed';
function collapsedSet() { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { return new Set(); } }
function toggleCollapsed(key) { const s = collapsedSet(); if (s.has(key)) s.delete(key); else s.add(key); try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); } catch {} }

const DND = 'application/x-psd_editor-preset';
const PANEL_HOST = {
  patterns: () => $('#patternGrid'), gradients: () => $('#gradientGrid'), swatches: () => $('#swatchGrid'),
  shapes: () => document.querySelector('section.panel[data-panel="shapes"]'),
  styles: () => document.querySelector('section.panel[data-panel="styles"]'),
};
const TILE = {
  patterns: (p, size) => patternThumb(p, size),
  shapes: (s, size) => shapeThumb(s, size),
  styles: (s, size) => styleThumb(s, size),
  gradients: (g, size) => { const d = mk('div', { className: 'pp-grad' }); d.style.width = d.style.height = size + 'px'; d.style.background = A.gradCss(A.gradModelOf('lib:' + g.id)); return d; },
  swatches: (s, size) => { const d = mk('div', { className: 'pp-swc' }); d.style.width = d.style.height = size + 'px'; d.style.background = rgb2hex(swatchRGB(s)); return d; },
};


function builtinGroups(kind) {

  if (kind === 'shapes') return [{ name: '默认', key: 'builtin:默认', items: CUSTOM_SHAPES.filter(s => !s._lib).map(s => ({ id: s.id, name: s.name, builtin: true, subpaths: s.subpaths, aspect: s.aspect || 1 })) }];
  return [];
}
function builtinTile(kind, it, size) {
  if (kind === 'gradients') { const d = mk('div', { className: 'pp-grad' }); d.style.width = d.style.height = size + 'px'; d.style.background = A.gradCss(A.gradModelOf(it.id)); return d; }
  if (kind === 'shapes') return shapeThumb(it, size);
  return mk('div');
}
const libId = (kind, it) => (it.builtin ? it.id : (kind === 'shapes' ? 'lib:' + it.id : kind === 'gradients' ? 'lib:' + it.id : it.id));

const SEARCH_PH = { patterns: '搜索图案', gradients: '搜索渐变', shapes: '搜索形状', styles: '搜索样式', swatches: '搜索色板' };
function render(kind) {
  const host = PANEL_HOST[kind] && PANEL_HOST[kind](); if (!host || host.querySelector('.pp-rename')) return;
  if (typeof A?.panels?.isVisible === 'function') {
    if (!A.panels.isVisible(kind)) { dirtyPresetPanels.add(kind); return; }
    dirtyPresetPanels.delete(kind);
  }
  if (kind === 'shapes' || kind === 'styles') host.classList.add('pp-host');
  
  const oldBody = host.querySelector(':scope > .pp-body'), scroll = oldBody ? oldBody.scrollTop : 0;
  const hadFocus = document.activeElement && document.activeElement.classList.contains('pp-search') && host.contains(document.activeElement);
  const hostFocused = document.activeElement === host;
  host.innerHTML = '';
  host.classList.add('pp-panel');
  host.dataset.presetKind = kind;
  host.tabIndex = 0;
  const view = viewOf(kind), list = isListView(view);
  const size = kind === 'swatches' ? (view === 'large' ? 42 : 28) : (view === 'small' ? 24 : 40);
  const rowThumb = view === 'largeList' ? (kind === 'swatches' ? 24 : 32) : (kind === 'swatches' ? 14 : 20);
  const q = (search[kind] || '').trim().toLowerCase();
  const match = it => !q || String(it.name || '').toLowerCase().includes(q) || (kind === 'swatches' && it.color && rgb2hex(it.color).includes(q.replace(/^#/, '')));
  
  const sbar = mk('div', { className: 'pp-searchbar' });
  const si = mk('input', { type: 'search', className: 'pp-search', placeholder: SEARCH_PH[kind], value: search[kind] || '' });
  si.dataset.attr = 'preset-search-' + kind;
  si.addEventListener('input', () => { search[kind] = si.value; render(kind); });
  si.addEventListener('keydown', e => { if (e.key === 'Escape') { search[kind] = ''; render(kind); host.focus(); } e.stopPropagation(); });
  if (['swatches', 'gradients', 'patterns'].includes(kind)) sbar.append(A.uiIcon('search', 12));
  sbar.append(si);
  const body = mk('div', { className: 'pp-body' });
  const collapsed = collapsedSet();
  const items = lib[kind] || [];
  const groups = (lib.groups[kind] || []).filter(g => !(kind === 'patterns' && g.builtinPack && g.builtinGroup?.endsWith(' · 纹理')));
  const addTile = (grid, it, builtin) => {
    const id = libId(kind, it);
    const on = selected[kind] === id || multi[kind].has(id);
    const t = mk('button', { type: 'button', className: 'pp-tile' + (list ? ' list ' + view : '') + (on ? ' on' : ''),
      title: tipOf(kind, it, builtin) });
    t.tabIndex = -1;
    t.dataset.id = id;
    if (view !== 'text') t.append(builtin ? builtinTile(kind, it, list ? rowThumb : size) : TILE[kind](it, list ? rowThumb : size));
    if (list) t.append(mk('span', { className: 'pp-name', textContent: it.name || (kind === 'swatches' && it.color ? rgb2hex(it.color) : '') }));
    t.draggable = true;
    t.addEventListener('dragstart', e => { e.dataTransfer.setData(DND, JSON.stringify({ kind, id: it.id, builtin: !!builtin })); e.dataTransfer.effectAllowed = 'copyMove'; });
    if (!builtin) {
      t.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DND)) { e.preventDefault(); t.classList.add('drop'); } });
      t.addEventListener('dragleave', () => t.classList.remove('drop'));
      t.addEventListener('drop', e => { t.classList.remove('drop'); dropOnto(kind, e, it.id, it.group || ''); });
      t.addEventListener('dblclick', e => { if (e.altKey || e.metaKey || e.ctrlKey) return; renameItem(kind, it, t); });
    }
    t.addEventListener('click', e => clickItem(kind, it, e, builtin));
    t.addEventListener('contextmenu', e => { e.preventDefault(); if (!multi[kind].has(id)) { multi[kind].clear(); selected[kind] = id; markSel(kind); } A.panels.popup(itemMenu(kind, it, builtin), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); });
    grid.append(t);
  };
  const addGroup = (name, key, arr, builtin, gid) => {
    if (['swatches', 'gradients', 'patterns'].includes(kind)) name = name.replace(/^PS\s*·\s*/, '');
    const shown = arr.filter(match);
    if (q && !shown.length) return;
    const storedGroup = gid && (lib.groups[kind] || []).find(g => g.id === gid);
    const isCol = !q && (storedGroup?.builtinPack ? storedGroup.collapsed : collapsed.has(kind + ':' + key));
    const head = mk('div', { className: 'pp-group' + (isCol ? '' : ' open'), title: builtin ? `${name}（内置，只读）` : `${name}：单击展开 / 折叠，双击改名，可把${store.PRESET_KIND_LABEL[kind]}拖进来` });
    const tri = A.uiIcon(isCol ? 'chevron-right' : 'chevron-down', 9); tri.setAttribute('class', 'ps-icon pp-tri');
    const fold = A.uiIcon('folder', 12); fold.setAttribute('class', 'ps-icon pp-fold');
    const label = mk('span', { className: 'pp-group-name', textContent: name });
    head.append(tri, fold, label);
    head.classList.toggle('selected', selectedGroup[kind] ? selectedGroup[kind] === gid : groups[0]?.id === gid);
    head.dataset.group = key;
    head.addEventListener('click', e => {
      if (['swatches', 'gradients', 'patterns'].includes(kind) && !e.target.closest('.pp-tri')) { selectedGroup[kind] = gid; host.querySelectorAll('.pp-group').forEach(el => el.classList.toggle('selected', el === head)); return; }
      if (q) return;
      if (storedGroup?.builtinPack) { store.updateGroup(kind, gid, { collapsed: !isCol }); return; }
      toggleCollapsed(kind + ':' + key); render(kind);
    });
    if (!builtin) {
      head.addEventListener('dblclick', e => { e.stopPropagation(); if (!e.target.closest('.pp-tri')) renameGroup(kind, gid, name, head); });
      head.addEventListener('contextmenu', e => { e.preventDefault(); A.panels.popup(groupMenu(kind, gid, name), { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); });
      head.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DND)) { e.preventDefault(); head.classList.add('drop'); } });
      head.addEventListener('dragleave', () => head.classList.remove('drop'));
      head.addEventListener('drop', e => { head.classList.remove('drop'); dropOnto(kind, e, null, gid); });
    }
    body.append(head);
    if (isCol) return;
    const grid = mk('div', { className: 'pp-grid' + (list ? ' list' : '') });
    for (const it of shown) addTile(grid, it, builtin);
    body.append(grid);
  };
  
  if (kind === 'swatches' && showRecent(kind) && !q) {
    const rc = recentColors();
    const row = mk('div', { className: 'pp-recent', title: '最近使用的颜色' });
    row.dataset.attr = 'swatch-recent';
    for (const c of rc) {
      const hex = rgb2hex(c);
      const b = mk('button', { type: 'button', className: 'pp-rc', title: `${hex}（单击设为前景色，⌘/Ctrl 单击设为背景色）` });
      b.tabIndex = -1;
      b.style.background = hex; b.style.width = b.style.height = (view === 'large' ? 24 : 16) + 'px';
      b.draggable = true;
      b.addEventListener('dragstart', e => { e.dataTransfer.setData(DND, JSON.stringify({ kind: 'swatches', color: c.slice(0, 3), recent: true })); e.dataTransfer.effectAllowed = 'copy'; });
      b.addEventListener('click', e => { if (e.metaKey || e.ctrlKey) A.setBg(c.slice(0, 3)); else A.setFg(c.slice(0, 3)); A.status(`${e.metaKey || e.ctrlKey ? '背景色' : '前景色'}：${hex}`); });
      b.addEventListener('contextmenu', e => { e.preventDefault(); A.panels.popup([
        { label: '设为前景色', run: () => A.setFg(c.slice(0, 3)) }, { label: '设为背景色', run: () => A.setBg(c.slice(0, 3)) },
        { label: '添加到色板', run: () => store.addPresets('swatches', [{ ...rgbSwatch(c.slice(0, 3), hex), group: curGroup('swatches') }]) },
        { sep: true }, { label: '清除最近使用的颜色', run: () => clearRecentColors() }], { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); });
      row.append(b);
    }
    if (!rc.length) row.append(mk('span', { className: 'pp-rc-empty', textContent: '最近使用的颜色会出现在这里' }));
    host.append(row);
  }
  
  const loose = items.filter(i => !i.group && match(i));
  if (loose.length) { const grid = mk('div', { className: 'pp-grid' + (list ? ' list' : '') }); for (const it of loose) addTile(grid, it, false); body.append(grid); }
  for (const g of groups) addGroup(g.name, g.id, items.filter(i => i.group === g.id), false, g.id);
  for (const b of builtinGroups(kind)) addGroup(b.name, b.key, b.items, true);
  if (!body.querySelector('.pp-tile, .pp-group'))
    body.append(mk('div', { className: 'panel-empty', textContent: q ? `没有名称包含「${search[kind]}」的${store.PRESET_KIND_LABEL[kind]}` : EMPTY_TEXT[kind] }));
  
  body.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DND)) e.preventDefault(); });
  body.addEventListener('drop', e => { if (e.defaultPrevented) return; dropOnto(kind, e, null, ''); });
  
  body.addEventListener('click', e => { if (e.target === body) { selected[kind] = null; multi[kind].clear(); markSel(kind); } });
  host.prepend(sbar); host.append(body, footer(kind));
  body.scrollTop = scroll;
  if (hadFocus) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
  else if (hostFocused) host.focus();
  if (!host.__ppKeys) { host.__ppKeys = true; host.addEventListener('keydown', e => onPanelKey(kind, e)); }
}
let gradientRefreshPending = false;

function refreshGradientThumbnails() {
  if (!A || gradientRefreshPending) return;
  gradientRefreshPending = true;
  requestAnimationFrame(() => {
    gradientRefreshPending = false;
    const host = PANEL_HOST.gradients();
    for (const tile of host?.querySelectorAll('.pp-tile') || []) {
      const thumb = tile.querySelector('.pp-grad');
      if (thumb) thumb.style.background = A.gradCss(A.gradModelOf(tile.dataset.id));
    }
    for (const tile of document.querySelectorAll('.gd-tile[data-preset]')) tile.style.background = A.gradCss(A.gradModelOf(tile.dataset.preset));
  });
}

let presetFillPending = false;
async function fillEmptyLayer(kind, it, id) {
  if (presetFillPending || !A.isEmptyRasterLayer?.()) return;
  presetFillPending = true;
  try {
    const at = fillAt();
    let ops;
    if (kind === 'gradients') {
      const model = A.gradModelOf(id); if (!model) return;
      ops = [{ op: 'addFillLayer', kind: 'gradient', at, name: '渐变填充 1',
        gradient: { type: 'linear', angle: 90, reverse: false, dither: true, ...A.gradStops(model), smoothness: model.smooth ?? 100, ...(model.noise ? { noise: model.noise } : {}) } }];
    } else ops = [...patOps([it.id]), { op: 'addFillLayer', kind: 'pattern', at, name: '图案填充 1', pattern: { id: it.id, name: it.name, scale: 100 } }];
    await A.runStructural(ops, `新建${kind === 'gradients' ? '渐变' : '图案'}填充图层「${it.name}」`, at);
  } catch (e) { A.status('创建填充图层失败：' + e.message); }
  finally { presetFillPending = false; }
}


function tipOf(kind, it, builtin) {
  const n = it.name || '';
  if (kind === 'swatches') return `${n || rgb2hex(it.color)}${n && it.color ? '  ' + rgb2hex(it.color) : ''}\n单击 = 前景色，⌘/Ctrl 单击 = 背景色，⌥/Alt 单击 = 删除`;
  if (kind === 'styles') return `${n}\n单击 = 应用到选中图层（⇧ 单击 = 叠加到现有样式）`;
  return n + (builtin ? '（内置）' : '');
}


function onPanelKey(kind, e) {
  if (e.target?.matches('input,textarea')) return;
  const host = PANEL_HOST[kind](); if (!host) return;
  const tiles = [...host.querySelectorAll('.pp-body .pp-tile')];
  if (!tiles.length) return;
  let i = tiles.findIndex(t => t.dataset.id === selected[kind]);
  const k = e.key;
  if (k === 'Enter' && i >= 0) { e.preventDefault(); tiles[i].click(); return; }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(k)) return;
  e.preventDefault(); e.stopPropagation();
  let j = i;
  if (i < 0) j = 0;
  else if (k === 'ArrowLeft') j = Math.max(0, i - 1);
  else if (k === 'ArrowRight') j = Math.min(tiles.length - 1, i + 1);
  else if (k === 'Home') j = 0;
  else if (k === 'End') j = tiles.length - 1;
  else {
    const r0 = tiles[i].getBoundingClientRect(), cx = r0.left + r0.width / 2, dir = k === 'ArrowDown' ? 1 : -1;
    let best = -1, bestD = Infinity;
    tiles.forEach((t, n) => {
      const r = t.getBoundingClientRect();
      if (dir > 0 ? r.top <= r0.top + 2 : r.top >= r0.top - 2) return;
      const dy = Math.abs(r.top - r0.top), dx = Math.abs(r.left + r.width / 2 - cx), d = dy * 1000 + dx;
      if (d < bestD) { bestD = d; best = n; }
    });
    if (best >= 0) j = best;
  }
  const t = tiles[j], id = t.dataset.id;
  const it = findItem(kind, id);
  multi[kind].clear();
  if (!it) return;
  if (kind === 'styles') { selected[kind] = id; markSel(kind); }
  else clickItem(kind, it.it, {}, it.builtin);
  t.scrollIntoView({ block: 'nearest' });
}
function findItem(kind, id) {
  const own = lib[kind].find(i => libId(kind, i) === id);
  if (own) return { it: own, builtin: false };
  for (const g of builtinGroups(kind)) { const b = g.items.find(x => x.id === id); if (b) return { it: b, builtin: true }; }
  return null;
}
const EMPTY_TEXT = {
  patterns: '还没有图案。用「编辑 › 定义图案…」从画面上定义，或从面板菜单导入 .pat。',
  gradients: '还没有渐变。', shapes: '还没有自定形状。', styles: '还没有样式。', swatches: '还没有色板。',
};
function markSel(kind) {
  const host = PANEL_HOST[kind](); if (!host) return;
  for (const t of host.querySelectorAll('.pp-tile')) t.classList.toggle('on', t.dataset.id === selected[kind] || multi[kind].has(t.dataset.id));
}

function selectedItems(kind) {
  const ids = new Set(multi[kind]); if (selected[kind]) ids.add(selected[kind]);
  return lib[kind].filter(i => ids.has(libId(kind, i)));
}
function footer(kind) {
  const f = mk('div', { className: 'pp-foot' });
  const btn = (icon, title, run, attr, sz = 15) => { const b = mk('button', { type: 'button', className: 'lf-btn', title }); b.append(A.uiIcon(icon, sz)); b.addEventListener('click', run); if (attr) b.dataset.attr = attr; f.append(b); return b; };
  
  if (kind === 'styles') btn('style-clear', '清除样式', () => { if (!A.hasLayer()) { A.status('先选中一个图层'); return; } A.runAction && A.runAction('layer.style.clear'); }, 'styles-clear', 12);
  f.append(mk('span', { className: 'grow' }));
  btn('new-group', '创建新组', () => newGroup(kind), kind + '-new-group');
  btn('add-style', NEW_LABEL[kind], () => newItem(kind), kind + '-new');
  const del = btn('layer-delete', '删除' + store.PRESET_KIND_LABEL[kind], () => deleteSelected(kind), kind + '-delete');
  
  del.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(DND)) { e.preventDefault(); del.classList.add('drop'); } });
  del.addEventListener('dragleave', () => del.classList.remove('drop'));
  del.addEventListener('drop', e => {
    del.classList.remove('drop');
    let d; try { d = JSON.parse(e.dataTransfer.getData(DND) || 'null'); } catch { d = null; }
    e.preventDefault(); e.stopPropagation();
    if (!d || d.kind !== kind || d.recent) return;
    if (d.builtin) { A.status('内置组里的' + store.PRESET_KIND_LABEL[kind] + '不能删除'); return; }
    removeItems(kind, [d.id]);
  });
  return f;
}
const NEW_LABEL = { patterns: '创建新图案（从画面 / 选区定义）', gradients: '创建新渐变（当前渐变）', shapes: '创建新形状（从当前路径）', styles: '创建新样式（从选中图层）', swatches: '创建新色板（前景色）' };

async function dropOnto(kind, e, beforeId, gid) {
  let d; try { d = JSON.parse(e.dataTransfer.getData(DND) || 'null'); } catch { d = null; }
  if (!d || d.kind !== kind || d.builtin) return;
  e.preventDefault(); e.stopPropagation();
  if (d.id === beforeId) return;
  const ids = lib[kind].map(i => i.id).filter(id => id !== d.id);
  const at = beforeId ? ids.indexOf(beforeId) : ids.length;
  ids.splice(at < 0 ? ids.length : at, 0, d.id);
  await store.reorderPresets(kind, ids, { [d.id]: gid || '' });
}


function clickItem(kind, it, e, builtin) {
  const id = libId(kind, it);
  
  if (kind !== 'swatches' && (e.metaKey || e.ctrlKey)) {
    if (multi[kind].has(id) || selected[kind] === id) { multi[kind].delete(id); if (selected[kind] === id) selected[kind] = [...multi[kind]].pop() || null; }
    else { if (selected[kind]) multi[kind].add(selected[kind]); multi[kind].add(id); selected[kind] = id; }
    markSel(kind); return;
  }
  if (e.shiftKey && selected[kind] && kind !== 'styles') {
    const host = PANEL_HOST[kind](); const ids = [...host.querySelectorAll('.pp-body .pp-tile')].map(t => t.dataset.id);
    const a = ids.indexOf(selected[kind]), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) { multi[kind].clear(); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) multi[kind].add(ids[i]); markSel(kind); return; }
  }
  multi[kind].clear();
  selected[kind] = id; markSel(kind);
  if (kind === 'swatches') {
    
    if (e.altKey) { removeItems(kind, [it.id]); A.status(`已删除色板「${it.name || rgb2hex(it.color)}」`); return; }
    if (e.metaKey || e.ctrlKey) A.setBg(swatchRGB(it)); else A.setFg(swatchRGB(it));
    A.status(`${e.metaKey || e.ctrlKey ? '背景色' : '前景色'}：${it.name || rgb2hex(it.color)}`);
  } else if (kind === 'patterns') {
    A.setCurrentPattern(it.id);
    fillEmptyLayer(kind, it, id);
    A.status(`当前图案：${it.name}（油漆桶 / 图案图章 / 修复画笔等的图案都会切到它）`);
  } else if (kind === 'gradients') {
    A.gradPick(id);
    fillEmptyLayer(kind, it, id);
  } else if (kind === 'shapes') {
    A.setCustomShape(id);
  } else if (kind === 'styles') {
    applyStyle(it, { add: !!e.shiftKey });
  }
}


function itemMenu(kind, it, builtin) {
  const items = [];
  if (kind === 'patterns') items.push({ label: '新建图案填充图层…', run: () => A.newFillLayer('pattern', it.id), disabled: !A.hasDoc() });
  if (kind === 'gradients') items.push({ label: '新建渐变填充图层…', run: () => A.newFillLayer('gradient', libId(kind, it)), disabled: !A.hasDoc() });
  if (kind === 'shapes') items.push({ label: '选为自定形状工具的形状', run: () => A.setCustomShape(libId(kind, it)) });
  if (kind === 'styles') items.push({ label: '应用到选中图层', run: () => applyStyle(it), disabled: !A.hasLayer() });
  if (kind === 'swatches') items.push({ label: '设为前景色', run: () => A.setFg(swatchRGB(it)) }, { label: '设为背景色', run: () => A.setBg(swatchRGB(it)) });
  if (!builtin) {
    const group = multi[kind].has(libId(kind, it)) ? selectedItems(kind) : [it];
    items.push({ sep: true }, { label: '重命名' + store.PRESET_KIND_LABEL[kind] + '…', run: () => renameItem(kind, it), disabled: group.length > 1 },
      { label: '删除' + store.PRESET_KIND_LABEL[kind] + (group.length > 1 ? `（${group.length} 个）` : ''), run: () => { multi[kind].clear(); removeItems(kind, group.map(i => i.id)); } },
      { label: '导出所选' + store.PRESET_KIND_LABEL[kind] + '…', run: () => exportKind(kind, group) });
  }
  return items;
}
function groupMenu(kind, gid, name) {
  return [
    { label: '重命名组…', run: () => renameGroup(kind, gid, name) },
    { label: '删除组', run: () => deleteGroup(kind, gid, name) },
    { label: '导出这一组…', run: () => exportKind(kind, lib[kind].filter(i => i.group === gid), name) },
  ];
}
const NEW_MENU = { patterns: '新建图案…', gradients: '新建渐变预设…', shapes: '新建形状…', styles: '新建样式…', swatches: '新建色板预设…' };
const LEGACY = { patterns: '旧版图案及其他', gradients: '旧版渐变', shapes: '旧版形状及其他', styles: '旧版样式及其他', swatches: '旧版色板' };
function panelMenu(kind) {
  const v = viewOf(kind);
  const L = store.PRESET_KIND_LABEL[kind];
  const sels = selectedItems(kind), sel = sels[0];
  const menu = [
    { label: NEW_MENU[kind], run: () => newItem(kind) },
    { label: '新建' + L + '组…', run: () => newGroup(kind) },
    { label: '重命名' + L + '…', run: () => sel && renameItem(kind, sel), disabled: sels.length !== 1, why: '先在面板里选中一个（内置组里的不能改名）' },
    { label: '删除' + L, run: () => deleteSelected(kind), disabled: !sels.length, why: '先在面板里选中（内置组里的不能删）' },
    { sep: true },
    ...VIEWS.map(([k, l]) => ({ label: l, checked: v === k, run: () => setView(kind, k) })),
    { sep: true },
  ];
  if (kind === 'swatches') menu.push({ label: '显示最近颜色', checked: showRecent(kind), run: () => setShowRecent(kind, !showRecent(kind)) }, { sep: true });
  menu.push({ label: LEGACY[kind] + '…', run: () => openPhotoshopPresets(kind) },
    { label: 'PS 自带预设…', run: () => openPhotoshopPresets(kind) },
    { sep: true },
    { label: '导入' + L + '…', run: () => importFiles(kind) },
    { label: '导出所选' + L + '…', run: () => exportKind(kind, sels), disabled: !sels.length, why: '先在面板里选中（⌘/Ctrl 点多选、⇧ 点连选）' });
  if (kind === 'swatches') menu.push({ label: '导出色板以供交换…', run: () => exportKind(kind, sels.length ? sels : lib[kind], null, 'ase'), disabled: !lib[kind].length },
    { label: '导出为颜色表（.act）…', run: () => exportKind(kind, sels.length ? sels : lib[kind], null, 'act'), disabled: !lib[kind].length });
  menu.push({ sep: true }, { label: '获取更多' + L + '…', disabled: true, why: '需要 Adobe 账号 / Adobe Exchange，浏览器里的编辑器连不上' },
    { sep: true }, { label: '导出全部' + L + '…', run: () => exportKind(kind, lib[kind]), disabled: !lib[kind].length },
    { label: '预设管理器…', run: () => openPresetManager(kind) },
    { label: '复位' + L + '（清空库）…', run: () => resetKind(kind), disabled: !lib[kind].length });
  return menu;
}


function inlineRename(kind, host, label, value, save) {
  if (PANEL_HOST[kind]().querySelector('.pp-rename')) return;
  const input = mk('input', { type: 'text', className: 'pp-rename', value });
  input.setAttribute('aria-label', '名称'); input.draggable = false;
  if (label) label.hidden = true;
  host.append(input); host.draggable = false; host.classList.add('renaming');
  let done = false;
  const finish = async commit => {
    if (done) return; done = true;
    const name = input.value.trim(); input.disabled = true;
    try { if (commit && name && name !== value) await save(name); }
    catch (e) { A.status('重命名失败：' + e.message); }
    finally { input.remove(); render(kind); }
  };
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(e.key === 'Enter'); } });
  for (const event of ['click', 'dblclick', 'pointerdown']) input.addEventListener(event, e => e.stopPropagation());
  input.addEventListener('blur', () => finish(true)); input.focus(); input.select();
}
async function renameItem(kind, it, tile) {
  if (['swatches', 'gradients', 'patterns'].includes(kind)) {
    const host = PANEL_HOST[kind]();
    tile ||= [...host.querySelectorAll('.pp-tile')].find(el => el.dataset.id === libId(kind, it));
    if (tile) return inlineRename(kind, tile, tile.querySelector('.pp-name'), it.name || '', name => store.renamePreset(kind, it.id, name));
  }

  const v = await A.promptDialog(store.PRESET_KIND_LABEL[kind] + '名称', it.name || '', { title: '重命名' + store.PRESET_KIND_LABEL[kind], label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.renamePreset(kind, it.id, String(v).trim());
}
async function removeItems(kind, ids) {
  if (!ids.length) return;
  await store.removePreset(kind, ids);
  if (ids.map(id => (kind === 'shapes' || kind === 'gradients') ? 'lib:' + id : id).includes(selected[kind])) selected[kind] = null;
}
async function deleteSelected(kind) {
  const arr = selectedItems(kind);
  if (!arr.length) { A.status('先在面板里点选一个' + store.PRESET_KIND_LABEL[kind] + '（内置组里的不能删）'); return; }
  multi[kind].clear();
  await removeItems(kind, arr.map(i => i.id));
  A.status(`已删除 ${arr.length} 个${store.PRESET_KIND_LABEL[kind]}`);
}
async function newGroup(kind) {
  const v = await A.promptDialog('组名称', '组 ' + ((lib.groups[kind] || []).length + 1), { title: '新建组', label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.addGroup(kind, String(v).trim());
}
async function renameGroup(kind, gid, name, head) {
  if (['swatches', 'gradients', 'patterns'].includes(kind)) {
    head ||= [...PANEL_HOST[kind]().querySelectorAll('.pp-group')].find(el => el.dataset.group === gid);
    if (head) return inlineRename(kind, head, head.querySelector('.pp-group-name'), name.replace(/^PS\s*·\s*/, ''), value => store.updateGroup(kind, gid, { name: value }));
    return;
  }

  const v = await A.promptDialog('组名称', name, { title: '重命名组', label: '名称' });
  if (v == null || !String(v).trim()) return;
  await store.updateGroup(kind, gid, { name: String(v).trim() });
}
async function deleteGroup(kind, gid, name) {
  const n = lib[kind].filter(i => i.group === gid).length;
  
  const r = n ? await A.choiceDialog(`删除组「${name}」？组里有 ${n} 个${store.PRESET_KIND_LABEL[kind]}。`, { title: '删除组', okText: '删除组和预设', extraText: '仅删除组', danger: true }) : 'extra';
  if (r === 'cancel') return;
  await store.removeGroup(kind, gid, r === 'ok');
}
async function resetKind(kind) {
  if (!await A.confirmDialog(`清空库里全部${store.PRESET_KIND_LABEL[kind]}？这一步不能撤销（可以先「导出全部」留个底）。`, { title: '复位' + store.PRESET_KIND_LABEL[kind], danger: true })) return;
  await store.clearPresets(kind);
}

function curGroup(kind) { const it = lib[kind].find(i => libId(kind, i) === selected[kind]); return it ? it.group || '' : ''; }

async function newItem(kind) {
  if (kind === 'patterns') return definePattern();
  if (kind === 'shapes') return defineShape();
  if (kind === 'styles') return newStyleFromLayer();
  if (kind === 'gradients') {
    const model = A.gradCurrentModel();
    const v = await A.promptDialog('渐变名称', '自定渐变', { title: '新建渐变预设', label: '名称' });
    if (v == null) return;
    const clean = JSON.parse(JSON.stringify({ clrs: model.clrs, trns: model.trns, ...(model.smooth != null ? { smooth: model.smooth } : {}), ...(model.noise ? { noise: model.noise } : {}) }));
    for (const s of clean.clrs) delete s.src;
    const [it] = await store.addPresets('gradients', [{ name: String(v).trim() || '自定渐变', model: clean, group: curGroup(kind) }]);
    selected.gradients = 'lib:' + it.id;
    return it;
  }
  if (kind === 'swatches') {
    const fg = A.getColors().fg;
    const v = await A.promptDialog('色板名称', rgb2hex(fg), { title: '色板名称', label: '名称' });
    if (v == null) return;
    const [it] = await store.addPresets('swatches', [{ ...rgbSwatch(fg, String(v).trim()), group: curGroup(kind) }]);
    return it;
  }
}



export async function definePattern(opts = {}) {
  if (!A.hasDoc()) return null;
  const { w: W, h: H } = A.docSize();
  const rect = A.selectionRect() || { x: 0, y: 0, w: W, h: H };
  if (rect.w < 1 || rect.h < 1) { A.status('选区是空的'); return null; }
  if (rect.w * rect.h > 4096 * 4096) { await A.alertDialog('图案太大：定义图案最大 4096×4096 像素，请先框一个小一点的矩形选区。'); return null; }
  const comp = A.compositeRGBA();
  const px = cropPattern(comp, W, H, rect);
  const n = lib.patterns.length + 1;
  const name = opts.name != null ? opts.name : await A.promptDialog('名称', A.docName ? `${A.docName()} ${n}` : `图案 ${n}`, { title: '图案名称', label: '名称' });
  if (name == null) return null;
  const [it] = await store.addPresets('patterns', [{ id: newPatternId(), name: String(name).trim() || `图案 ${n}`, ...px, group: curGroup('patterns') }]);
  selected.patterns = it.id;
  A.setCurrentPattern(it.id);
  A.status(`已定义图案「${it.name}」（${px.width}×${px.height}）`);
  return it;
}

export async function defineShape(opts = {}) {
  const src = A.currentPathSubpaths();
  if (!src || !src.subpaths || !src.subpaths.length) { await A.alertDialog('没有可用的路径：先用钢笔 / 形状工具画一条路径，或选中一个形状图层，再定义自定形状。'); return null; }
  const norm = normalizeSubpaths(src.subpaths);
  const name = opts.name != null ? opts.name : await A.promptDialog('名称', src.name || `形状 ${lib.shapes.length + 1}`, { title: '形状名称', label: '名称' });
  if (name == null) return null;
  const [it] = await store.addPresets('shapes', [{ id: newPatternId(), name: String(name).trim() || '形状', subpaths: norm.subpaths,
    width: Math.max(1, Math.round(norm.width)), height: Math.max(1, Math.round(norm.height)), aspect: norm.width / norm.height, group: curGroup('shapes') }]);
  selected.shapes = 'lib:' + it.id;
  A.status(`已定义自定形状「${it.name}」`);
  return it;
}

export async function newStyleFromLayer(opts = {}) {
  const cur = await A.selectedLayerEffects();
  if (!cur || !cur.effects) { await A.alertDialog('选中的图层没有图层样式：先给它加上投影 / 描边之类的效果，再新建样式。'); return null; }
  const name = opts.name != null ? opts.name : await A.promptDialog('名称', cur.name ? `${cur.name} 样式` : `样式 ${lib.styles.length + 1}`, { title: '新建样式', label: '名称' });
  if (name == null) return null;
  const effects = { ...cur.effects, __classID: 'null', __name: '' };
  const [it] = await store.addPresets('styles', [{ id: newPatternId(), name: String(name).trim() || '样式', effectsBytes: effectsToBytes(effects), patternIds: effectPatternIds(effects), group: curGroup('styles') }]);
  
  const docPats = A.docPatternRGBA ? A.docPatternRGBA(it.patternIds) : [];
  const missing = docPats.filter(p => !lib.patterns.some(q => q.id === p.id));
  if (missing.length) await store.addPresets('patterns', missing);
  A.status(`已新建样式「${it.name}」`);
  return it;
}

export async function applyStyle(st, opts = {}) {
  if (!A.hasLayer()) { A.status('先选中一个图层再点样式'); return false; }
  const idx = opts.index != null ? opts.index : A.selectedLayer();
  let effects = effectsFromBytes(st.effectsBytes);
  if (opts.add) {
    const cur = A.layerEffects ? await A.layerEffects(idx) : null;
    if (cur) {
      const merged = { ...cur };
      for (const [k, v] of Object.entries(effects)) if (!k.startsWith('__') && k !== 'Scl ' && k !== 'masterFXSwitch') {
        merged[k] = v;
        const multiKey = { DrSh: 'dropShadowMulti', IrSh: 'innerShadowMulti', SoFi: 'solidFillMulti', GrFl: 'gradientFillMulti', FrFX: 'frameFXMulti' }[k];
        if (multiKey) delete merged[multiKey];
      }
      merged.masterFXSwitch = true;
      effects = merged;
    }
  }
  const pids = effectPatternIds(effects);
  const ops = [];
  const pats = lib.patterns.filter(p => pids.includes(p.id));
  if (pats.length) ops.push({ op: 'addPatterns', patterns: pats.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })) });
  ops.push(opts.add ? { op: 'setLayerStyle', index: idx, effectsBytes: effectsToBytes(effects) } : { op: 'setLayerStyle', index: idx, effectsBytes: st.effectsBytes });
  return A.runStructural(ops, opts.add ? `添加样式「${st.name}」` : `样式「${st.name}」`);
}


function pickFiles(accept, multiple = true) {
  return new Promise(res => {
    const inp = mk('input', { type: 'file', accept, multiple });
    inp.style.display = 'none';
    inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}
const ACCEPT = { patterns: '.pat', gradients: '.grd', shapes: '.csh', styles: '.asl', swatches: '.aco,.ase,.act' };
async function importFiles(kind) {
  const files = await pickFiles(kind ? ACCEPT[kind] + ',.zip' : Object.values(ACCEPT).join(',') + ',.zip,.abr,.tpl,.atn');
  if (!files.length) return;
  const report = [];
  for (const f of files) report.push(...await importFile(f.name, new Uint8Array(await f.arrayBuffer())));
  A.status(report.join('；') || '没有导入任何预设');
  if (report.some(r => /失败|不支持/.test(r))) await A.alertDialog(report.join('\n'), { title: '导入预设' });
}
const baseName = n => String(n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

export async function importFile(name, u8) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const group = baseName(name);
  try {
    if (ext === 'zip') { const out = []; for (const e of readZip(u8)) out.push(...await importFile(e.name, e.data)); return out; }
    if (ext === 'pat') {
      const list = readPat(u8);
      await store.addPresets('patterns', list.map(p => ({ id: p.id || newPatternId(), name: p.name, width: p.width, height: p.height, rgba: p.rgba })), { groupName: group });
      return [`${name}：${list.length} 个图案` + (list.warnings.length ? `（${list.warnings.join('，')}）` : '')];
    }
    if (ext === 'grd') {
      const list = readGrd(u8);
      await store.addPresets('gradients', list.map(g => ({ name: g.name, model: g.model })), { groupName: group });
      return [`${name}：${list.length} 个渐变`];
    }
    if (ext === 'csh') {
      const list = readCsh(u8);
      await store.addPresets('shapes', list.map(s => ({ id: s.id && /^[\x20-\x7e]+$/.test(s.id) ? s.id : newPatternId(), name: s.name, subpaths: s.subpaths, width: s.width, height: s.height, aspect: s.aspect })), { groupName: group });
      return [`${name}：${list.length} 个形状` + (list.warnings.length ? `（${list.warnings.join('，')}）` : '')];
    }
    if (ext === 'asl') {
      const r = readAsl(u8);
      if (r.patterns.length) await store.addPresets('patterns', r.patterns.map(p => ({ id: p.id || newPatternId(), name: p.name, width: p.width, height: p.height, rgba: p.rgba })), { groupName: group });
      await store.addPresets('styles', r.styles.map(s => ({ id: s.id || undefined, name: s.name, effectsBytes: effectsToBytes(s.effects), patternIds: effectPatternIds(s.effects) })), { groupName: group });
      return [`${name}：${r.styles.length} 个样式` + (r.patterns.length ? `、${r.patterns.length} 个图案` : '') + (r.warnings.length ? `（${r.warnings.join('，')}）` : '')];
    }
    if (ext === 'aco' || ext === 'ase' || ext === 'act') {
      const list = readSwatchFile(u8, name);
      if (ext === 'ase' && list.groups && list.groups.length) {
        const inGroup = new Set(list.groups.flatMap(g => g.swatches));
        const loose = list.filter(s => !inGroup.has(s));
        if (loose.length) await store.addPresets('swatches', loose, { groupName: group });
        for (const g of list.groups) await store.addPresets('swatches', g.swatches, { groupName: g.name || group });
      } else await store.addPresets('swatches', list.map(s => ({ ...s, name: s.name || rgb2hex(s.color) })), { groupName: group });
      return [`${name}：${list.length} 个色板`];
    }
    if (ext === 'json' && /^psd_editor-/.test(baseName(name))) {
      const j = JSON.parse(new TextDecoder().decode(u8));
      if (j && store.PRESET_KINDS.includes(j.kind) && Array.isArray(j.items)) { await store.addPresets(j.kind, j.items); return [`${name}：${j.items.length} 个${store.PRESET_KIND_LABEL[j.kind]}`]; }
    }
    
    for (const [kind, f] of Object.entries(FORMATS)) {
      if (f.ext === ext && f.read && !KINDS5.includes(kind)) {
        const items = await f.read(u8, name);
        if (f.import) await f.import(items, name); else await store.addPresets(kind, items, { groupName: group });
        return [`${name}：${items.length} 个${f.label || kind}`];
      }
    }
    return [`${name}：不支持的预设格式 .${ext}`];
  } catch (e) {
    return [`${name}：导入失败（${e && e.message || e}）`];
  }
}
function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = mk('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function encodeKind(kind, items, fmt) {
  const f = FORMATS[kind];
  if (kind === 'styles') {
    const ids = new Set(items.flatMap(s => s.patternIds || effectPatternIds(effectsFromBytes(s.effectsBytes))));
    return { ext: 'asl', data: writeAsl(items, lib.patterns.filter(p => ids.has(p.id))) };
  }
  if (kind === 'swatches' && fmt === 'ase') {
    const gname = new Map((lib.groups.swatches || []).map(g => [g.id, g.name]));
    return { ext: 'ase', data: writeAse(items.map(s => ({ ...s, group: gname.get(s.group) || null }))) };
  }
  if (kind === 'swatches' && fmt === 'act') return { ext: 'act', data: writeAct(items) };
  if (f && f.write) return { ext: f.ext, data: f.write(items) };
  return { ext: 'json', data: new TextEncoder().encode(JSON.stringify({ kind, items }, (k, v) => (v instanceof Uint8Array || v instanceof Uint8ClampedArray) ? Array.from(v) : v)) };
}
async function exportKind(kind, items, name, fmt) {
  if (!items.length) return;
  const { ext, data } = encodeKind(kind, items, fmt);
  const file = (name || (items.length === 1 ? items[0].name : store.PRESET_KIND_LABEL[kind])) + '.' + (ext === 'json' ? 'json' : ext);
  download(ext === 'json' ? 'psd_editor-' + file : file, data);
  A.status(`已导出 ${items.length} 个${store.PRESET_KIND_LABEL[kind]}（.${ext}）`);
}


export function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eo = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error('不是 zip 文件');
  const n = dv.getUint16(eo + 10, true); let o = dv.getUint32(eo + 16, true);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(o, true) !== 0x02014b50) break;
    const method = dv.getUint16(o + 10, true), csize = dv.getUint32(o + 20, true), usize = dv.getUint32(o + 24, true);
    const nl = dv.getUint16(o + 28, true), xl = dv.getUint16(o + 30, true), cl = dv.getUint16(o + 32, true), lo = dv.getUint32(o + 42, true);
    const name = new TextDecoder().decode(u8.subarray(o + 46, o + 46 + nl));
    o += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const raw = u8.subarray(ds, ds + csize);
    const data = method === 0 ? raw : method === 8 ? inflateRaw(raw, { expectedSize: usize }) : null;
    if (data) out.push({ name: name.replace(/^.*\//, ''), data });
  }
  return out;
}


const ALL_KINDS = () => store.PRESET_KINDS.slice();
async function allItems(kind) { return KINDS5.includes(kind) ? lib[kind] : await store.listPresets(kind); }

export function openPhotoshopPresets(kind = '') {
  return openPhotoshopPresetLibrary(kind, { status: text => A?.status(text), onLoaded: async () => {
    await retireApproximateDefaults();
    for (const k of KINDS5) await reload(k);
  } });
}


export async function openPresetManager(startKind = 'patterns') {
  document.querySelector('dialog.pp-mgr')?.remove();
  const d = mk('dialog', { className: 'fp-dlg pp-mgr' });
  let kind = startKind, sel = new Set();
  const head = mk('div', { className: 'pp-mgr-head' });
  const kindSel = mk('select'); kindSel.dataset.attr = 'preset-kind';
  for (const k of ALL_KINDS()) kindSel.append(mk('option', { value: k, textContent: store.PRESET_KIND_LABEL[k] }));
  kindSel.value = kind;
  head.append(mk('span', { textContent: '预设类型：' }), kindSel);
  const list = mk('div', { className: 'pp-mgr-list' });
  const side = mk('div', { className: 'pp-mgr-side' });
  const B = (label, run) => { const b = mk('button', { type: 'button', textContent: label }); b.addEventListener('click', run); side.append(b); return b; };
  const items = async () => allItems(kind);
  const draw = async () => {
    list.innerHTML = '';
    const arr = await items();
    const gname = new Map((await store.listGroups(kind)).map(g => [g.id, g.name]));
    for (const it of arr) {
      const row = mk('div', { className: 'pp-mgr-row' + (sel.has(it.id) ? ' on' : '') });
      row.dataset.id = it.id;
      const th = TILE[kind] ? TILE[kind](it, 28) : mk('span');
      row.append(th, mk('span', { className: 'pp-name', textContent: it.name || '(未命名)' }), mk('span', { className: 'pp-grp', textContent: gname.get(it.group) || '' }));
      row.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey) { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); }
        else if (e.shiftKey && sel.size) { const ids = arr.map(x => x.id); const a = ids.findIndex(x => sel.has(x)), b = ids.indexOf(it.id); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) sel.add(ids[i]); }
        else sel = new Set([it.id]);
        draw();
      });
      row.addEventListener('dblclick', async () => { const v = await A.promptDialog('名称', it.name || '', { title: '重命名', label: '名称' }); if (v != null && String(v).trim()) { await store.renamePreset(kind, it.id, String(v).trim()); draw(); } });
      list.append(row);
    }
    if (!arr.length) list.append(mk('div', { className: 'panel-empty', textContent: '（空）' }));
  };
  B('载入…', async () => { await importFiles(KINDS5.includes(kind) ? kind : null); draw(); });
  B('PS 自带预设…', () => openPhotoshopPresets(kind).then(dlg => dlg.addEventListener('close', draw)));
  B('存储设置…', async () => { const arr = (await items()).filter(i => sel.has(i.id)); if (arr.length) exportKind(kind, arr); else A.status('先选中要存储的预设'); });
  B('重命名…', async () => { const it = (await items()).find(i => sel.has(i.id)); if (!it) return; const v = await A.promptDialog('名称', it.name || '', { title: '重命名', label: '名称' }); if (v != null && String(v).trim()) { await store.renamePreset(kind, it.id, String(v).trim()); draw(); } });
  B('删除', async () => { if (!sel.size) return; await store.removePreset(kind, [...sel]); sel.clear(); draw(); });
  B('上移', async () => { const ids = (await items()).map(i => i.id); for (let i = 1; i < ids.length; i++) if (sel.has(ids[i]) && !sel.has(ids[i - 1])) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; await store.reorderPresets(kind, ids); draw(); });
  B('下移', async () => { const ids = (await items()).map(i => i.id); for (let i = ids.length - 2; i >= 0; i--) if (sel.has(ids[i]) && !sel.has(ids[i + 1])) [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; await store.reorderPresets(kind, ids); draw(); });
  kindSel.onchange = () => { kind = kindSel.value; sel.clear(); draw(); };
  const note = mk('div', { className: 'anote plain', textContent: '预设保存在这台电脑的浏览器里（跨文档、跨会话）。⌘/Ctrl 点多选、Shift 点连选，双击改名。' });
  const btns = mk('div', { className: 'fp-dlg-btns' });
  const done = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '完成' });
  done.addEventListener('click', () => { try { d.close(); } catch {} d.remove(); });
  btns.append(done);
  const form = mk('div', { className: 'fp-dlg-form' });
  const main = mk('div', { className: 'pp-mgr-main' }); main.append(list, side);
  form.append(mk('h3', { className: 'fp-dlg-title', textContent: '预设管理器' }), head, main, note, btns);
  d.append(form);
  d.addEventListener('cancel', e => { e.preventDefault(); done.click(); });
  document.body.append(d);
  try { d.showModal(); } catch { d.setAttribute('open', ''); }
  await draw();
  return d;
}


export async function openExportImport() {
  const kinds = ALL_KINDS();
  const counts = {};
  for (const k of kinds) counts[k] = (await allItems(k)).length;
  const fields = [
    { key: 'mode', label: '操作', type: 'select', value: 'export', options: [['export', '导出预设'], ['import', '导入预设']] },
    ...kinds.map(k => ({ key: 'k_' + k, label: `${store.PRESET_KIND_LABEL[k]}（${counts[k]}）`, type: 'check', value: counts[k] > 0, showIf: v => v.mode === 'export' })),
    { key: 'pack', label: '打包方式', type: 'select', value: 'zip', options: [['zip', '打成一个 zip'], ['separate', '按类型分别下载']], showIf: v => v.mode === 'export' },
    { type: 'note', label: '导出的是 PS 通用格式：图案 .pat · 渐变 .grd · 形状 .csh · 样式 .asl（含用到的图案）· 色板 .aco（另有面板菜单可导出 .ase / .act）。导入支持以上格式与 zip 包。' },
  ];
  const v = await A.formDialog('导出/导入预设', fields, { okText: '继续' });
  if (!v) return false;
  if (v.mode === 'import') { await importFiles(null); return true; }
  const files = [];
  for (const k of kinds) {
    if (!v['k_' + k]) continue;
    const arr = await allItems(k); if (!arr.length) continue;
    const { ext, data } = encodeKind(k, arr);
    files.push({ name: (ext === 'json' ? 'psd_editor-' : '') + `${store.PRESET_KIND_LABEL[k]}.${ext}`, data });
  }
  if (!files.length) { A.status('没有可导出的预设'); return false; }
  if (v.pack === 'zip' && A.makeZip) download('预设.zip', A.makeZip(files));
  else for (const f of files) download(f.name, f.data);
  A.status(`已导出 ${files.length} 类预设`);
  return true;
}


function installCanvasDrop() {
  const vp = $('#viewport'); if (!vp || vp.__ppDrop) return;
  vp.__ppDrop = true;
  vp.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes(DND) && A.hasDoc()) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  vp.addEventListener('drop', async e => {
    let d; try { d = JSON.parse(e.dataTransfer.getData(DND) || 'null'); } catch { d = null; }
    if (!d || !A.hasDoc()) return;
    e.preventDefault(); e.stopPropagation();
    try { await dropOnCanvas(d, e.clientX, e.clientY); } catch (err) { A.status('拖放没能完成：' + (err && err.message || err)); }
  });
}









export async function dropOnCanvas(d, cx, cy) {
  const kind = d.kind;
  const hit = A.hitLayer ? A.hitLayer(cx, cy) : -1;
  const lk = hit >= 0 && A.layerKind ? A.layerKind(hit) : null;
  if (kind === 'swatches') {
    const s = d.color ? { color: d.color, name: rgb2hex(d.color) } : lib.swatches.find(x => x.id === d.id);
    if (!s) return false;
    const c = s.color.slice(0, 3);
    if (lk === 'shape') return A.setShapeFill(hit, 'solid', { color: c });
    if (lk === 'text') return A.setTextColor(hit, c);
    return A.runStructural([{ op: 'addFillLayer', kind: 'solid', at: fillAt(), name: '颜色填充 1', color: rgb2hex(c) }], '新建颜色填充图层');
  }
  if (kind === 'gradients') {
    const gid = d.builtin ? d.id : 'lib:' + d.id;
    const model = A.gradModelOf(gid); if (!model) return false;
    const name = (d.builtin ? (findItem('gradients', gid) || {}).it : lib.gradients.find(g => g.id === d.id))?.name || '渐变';
    if (lk === 'shape') return A.setShapeFill(hit, 'gradient', { gradient: { type: 'linear', angle: 90, ...A.gradStops(model) } });
    if (lk === 'text') return addOverlay(hit, 'GrFl', {
      'Md  ': E('BlnM', 'Nrml'), Opct: P('#Prc', 100), Grad: gradientToDesc({ name, model }), Angl: P('#Ang', 90), Type: E('GrdT', 'Lnr '),
      Rvrs: false, Dthr: false, Algn: true, 'Scl ': P('#Prc', 100), Ofst: { __name: '', __classID: 'Pnt ', Hrzn: P('#Prc', 0), Vrtc: P('#Prc', 0) } }, `渐变叠加「${name}」`);
    return A.runStructural([{ op: 'addFillLayer', kind: 'gradient', at: fillAt(), name: '渐变填充 1',
      gradient: { type: 'linear', angle: 90, reverse: false, dither: true, ...A.gradStops(model) } }], `新建渐变填充图层「${name}」`);
  }
  if (kind === 'patterns') {
    const p = lib.patterns.find(x => x.id === d.id); if (!p) return false;
    const pre = patOps([p.id]);
    
    if (lk === 'shape') return A.setShapeFill(hit, 'pattern', { pattern: { name: p.name, id: p.id, scale: 100 } });
    if (lk === 'text') return addOverlay(hit, 'patternFill', {
      'Md  ': E('BlnM', 'Nrml'), Opct: P('#Prc', 100), Ptrn: { __name: '', __classID: 'Ptrn', 'Nm  ': p.name, Idnt: p.id }, 'Scl ': P('#Prc', 100), Algn: true,
      phase: { __name: '', __classID: 'Pnt ', Hrzn: 0, Vrtc: 0 } }, `图案叠加「${p.name}」`, pre);
    return A.runStructural([...pre, { op: 'addFillLayer', kind: 'pattern', at: fillAt(), name: '图案填充 1', pattern: { name: p.name, id: p.id, scale: 100 } }], `新建图案填充图层「${p.name}」`);
  }
  if (kind === 'styles') {
    const st = lib.styles.find(s => s.id === d.id); if (!st) return false;
    if (hit >= 0) A.selectLayer(hit);
    return applyStyle(st, { index: hit >= 0 ? hit : undefined });
  }
  if (kind === 'shapes') {
    const id = d.builtin ? d.id : 'lib:' + d.id;
    const s = CUSTOM_SHAPE_BY_ID[id]; if (!s) return false;
    const p = A.clientToDoc(cx, cy), { w: W, h: H } = A.docSize();
    
    let w = s.width || Math.min(W, H) / 4, h = s.height || w / (s.aspect || 1);
    const k = Math.min(1, W / 2 / w, H / 2 / h); w *= k; h *= k;
    const rect = { x: p.x - w / 2, y: p.y - h / 2, w, h };
    const map = q => [rect.x + q[0] * rect.w, rect.y + q[1] * rect.h];
    const subs = s.subpaths.map(sp => ({ closed: sp.closed !== false, operation: sp.operation == null ? 1 : sp.operation, knots: sp.knots.map(k2 => ({ anchor: map(k2.anchor), in: map(k2.in), out: map(k2.out) })) }));
    return A.commitShapePath(subs, s.name, { pathOp: 'new' });
  }
  return false;
}

function fillAt() { const i = A.selectedLayer(); const n = A.getDoc() ? A.getDoc().layers.length : 0; return i >= 0 ? i + 1 : n; }

function patOps(ids) {
  const own = new Set(((A.getDoc() && A.getDoc().patterns) || []).filter(p => !p._lib).map(p => p.id));
  const want = lib.patterns.filter(p => ids.includes(p.id) && !own.has(p.id));
  return want.length ? [{ op: 'addPatterns', patterns: want.map(p => ({ id: p.id, name: p.name, width: p.width, height: p.height, rgba: p.rgba })) }] : [];
}

async function addOverlay(idx, key, fields, label, pre = []) {
  const cur = (A.layerEffects ? await A.layerEffects(idx) : null) || { __name: '', __classID: 'null', 'Scl ': P('#Prc', 100) };
  const fx = { ...cur, masterFXSwitch: true, [key]: { __name: '', __classID: key, enab: true, present: true, showInDialog: true, ...fields } };
  if (key === 'GrFl') delete fx.gradientFillMulti;
  return A.runStructural([...pre, { op: 'setLayerStyle', index: idx, effectsBytes: effectsToBytes(fx) }], label);
}


async function reload(kind) {
  lib[kind] = await store.listPresets(kind);
  lib.groups[kind] = await store.listGroups(kind);
  if (kind === 'patterns') {
    const live = new Set(lib.patterns.map(p => p.id));
    for (const id of [...parsedCache.keys()]) if (!live.has(id)) parsedCache.delete(id);
    libMaterialize(A.getDoc());
    A.onPatternsChanged && A.onPatternsChanged();
  }
  if (kind === 'styles' || kind === 'patterns') styleThumbCache.clear();
  if (kind === 'shapes') {
    const gname = new Map((lib.groups.shapes || []).map(g => [g.id, g.name]));
    setLibraryShapes(lib.shapes.map(s => ({ id: 'lib:' + s.id, name: s.name, subpaths: s.subpaths, aspect: s.aspect || 1, width: s.width, height: s.height, group: gname.get(s.group) || '我的形状' })));
  }
  if (kind === 'gradients') A.onGradientsChanged && A.onGradientsChanged();
  render(kind);
  if (kind === 'patterns') render('styles');
}

const CSS = `
.pp-panel { display: flex; flex-direction: column; min-height: 0; width: 100%; box-sizing: border-box; align-self: stretch; }
.pp-host { display: flex; flex-direction: column; }
.pp-panel.swatch-grid, .pp-panel.preset-grid { display: flex; flex-wrap: nowrap; padding: 0; gap: 0; }
.pp-body { flex: 1; overflow: auto; padding: 4px 6px 6px; min-height: 40px; }
.pp-grid { display: flex; flex-wrap: wrap; gap: 3px; padding: 3px 0 6px 12px; }
.pp-body > .pp-grid:first-child { padding-left: 0; }
.pp-grid.list { flex-direction: column; flex-wrap: nowrap; gap: 1px; }
.pp-tile { height: auto; min-height: 0; min-width: 0; padding: 0; border: 1px solid #111; background: #222; border-radius: 2px; line-height: 0; cursor: default; display: flex; align-items: center; gap: 6px; }
.pp-tile:hover { outline: 1px solid #fff; }
.pp-tile.on { outline: 2px solid var(--ps-accent, #1473e6); outline-offset: 0; }
.pp-tile.drop { box-shadow: -3px 0 0 var(--ps-accent, #1473e6); }
.pp-tile.list { width: 100%; justify-content: flex-start; border: none; background: transparent; line-height: normal; padding: 2px 4px; text-align: left; }
.pp-tile.list.text { padding: 3px 6px; }
.pp-tile.list.largeList { padding: 3px 4px; gap: 8px; }
.pp-tile.list:hover { outline: none; background: rgba(255,255,255,.06); }
.pp-tile.list.on { background: var(--ps-sel, #4f4f4f); outline: none; }
.pp-tile .pp-name { font-size: 11px; color: var(--ps-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-swc, .pp-grad { display: block; }
.pp-group { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ps-text); padding: 3px 0; cursor: default; user-select: none; }
.pp-group:hover { color: #fff; }
.pp-group.drop { background: var(--ps-accent, #1473e6); }
.pp-group .ps-icon { flex: none; }
.pp-foot { display: flex; align-items: center; gap: 2px; padding: 3px 6px; border-top: 1px solid var(--ps-line, #1c1c1c); flex: none; }
.pp-foot .grow { flex: 1; }
.pp-panel:focus { outline: none; }
.pp-panel:focus-visible .pp-tile.on { outline-color: #fff; }
.pp-searchbar { flex: none; padding: 5px 6px 2px; }
.pp-search { width: 100%; box-sizing: border-box; height: 22px; font-size: 11px; padding: 0 6px; }
.pp-group .pp-fold { opacity: .8; }
.pp-recent { display: flex; flex-wrap: nowrap; gap: 3px; overflow: hidden; padding: 2px 0 6px; border-bottom: 1px solid var(--ps-line, #1c1c1c); margin-bottom: 4px; min-height: 16px; }
.pp-rc { flex: none; padding: 0; min-width: 0; min-height: 0; border: 1px solid #111; border-radius: 2px; cursor: default; }
.pp-rc:hover { outline: 1px solid #fff; }
.pp-rc-empty { font-size: 11px; color: var(--ps-muted, #8a8a8a); line-height: 16px; }
.pp-foot .lf-btn.drop { background: var(--ps-accent, #1473e6); }
/* 色板 / 渐变 / 图案：固定搜索与页脚，只让文件夹树滚动。 */
.pp-panel[data-preset-kind=swatches], .pp-panel[data-preset-kind=gradients], .pp-panel[data-preset-kind=patterns] { flex:1 1 auto; height:100%; overflow:hidden; }
.pp-panel[data-preset-kind] .pp-searchbar { display:flex; align-items:center; gap:4px; padding:8px 8px 5px; }
.pp-searchbar > .ps-icon { flex:none; }
.pp-searchbar .pp-search { flex:1; min-width:0; height:19px; border:1px solid #4c4c4c; border-radius:0; background:#252525; color:var(--ps-text); appearance:none; font:11px system-ui; }
.pp-panel > .pp-recent { flex:none; gap:1px; margin:0 8px 6px; padding:3px 0; min-height:16px; border:0; }
.pp-recent .pp-rc { border:0; border-radius:0; }
.pp-panel[data-preset-kind=swatches] .pp-body, .pp-panel[data-preset-kind=gradients] .pp-body, .pp-panel[data-preset-kind=patterns] .pp-body { padding:0 4px; }
.pp-panel[data-preset-kind] .pp-group { min-height:28px; box-sizing:border-box; padding:4px 5px; border-bottom:2px solid #303030; font-size:12px; background:#262626; }
.pp-panel[data-preset-kind] .pp-group.selected { background:#494949; }
.pp-group-name { min-width:0; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pp-panel[data-preset-kind=swatches] .pp-grid:not(.list) { gap:1px; padding:2px 0 3px 20px; }
.pp-panel[data-preset-kind=swatches] .pp-tile:not(.list) { border:0; border-radius:0; }
.pp-panel[data-preset-kind=gradients] .pp-grid:not(.list), .pp-panel[data-preset-kind=patterns] .pp-grid:not(.list) { gap:3px; padding:4px 0 5px 20px; }
.pp-group.renaming { overflow:visible; }
.pp-tile.renaming { position:relative; overflow:visible; }
.pp-panel input.pp-rename { min-width:0; width:100%; flex:1; height:20px; box-sizing:border-box; font:12px system-ui; padding:0 3px; border:1px solid #3498ff; border-radius:0; color:#eee; background:#222; }
.pp-tile:not(.list) input.pp-rename { position:absolute; left:0; top:100%; width:120px; z-index:5; }
.pp-group [hidden] { display:none; }
dialog.pp-mgr { width: min(560px, 92vw); }
.pp-mgr-head { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.pp-mgr-main { display: flex; gap: 10px; }
.pp-mgr-list { flex: 1; height: 300px; overflow: auto; border: 1px solid var(--ps-line-2, #454545); background: var(--ps-input, #1e1e1e); }
.pp-mgr-row { display: flex; align-items: center; gap: 8px; padding: 2px 6px; font-size: 12px; cursor: default; }
.pp-mgr-row.on { background: var(--ps-accent, #1473e6); color: #fff; }
.pp-mgr-row .pp-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-mgr-row .pp-grp { color: var(--ps-muted, #a0a0a0); font-size: 11px; }
.pp-mgr-side { display: flex; flex-direction: column; gap: 6px; width: 96px; }
.pp-mgr-side button { height: 24px; font-size: 12px; }
`;





export async function installPresets(api) {
  A = api;
  if (!presetVisibilityWired && typeof api.panels.onChange === 'function') {
    presetVisibilityWired = true;
    api.panels.onChange(() => { for (const kind of [...dirtyPresetPanels]) if (A.panels.isVisible(kind)) render(kind); });
  }
  if (!document.getElementById('ppCss')) document.head.append(mk('style', { id: 'ppCss', textContent: CSS }));
  for (const k of KINDS5) api.panels.setPanelMenu(k, () => panelMenu(k));
  installCanvasDrop();
  
  const cancel = document.getElementById('fxDlgCancel');
  if (cancel && !document.getElementById('fxDlgNewStyle')) {
    const b = mk('button', { type: 'button', id: 'fxDlgNewStyle', textContent: '新建样式…', title: '把这一层当前的图层样式存为样式预设（样式面板里可见）' });
    b.dataset.attr = 'fxdlg-new-style';
    b.addEventListener('click', () => newStyleFromLayer());
    cancel.parentNode.insertBefore(b, cancel);
  }
  try { await seedIfNeeded(); } catch (e) { console.warn('[presets] 默认预设没能种进库里', e); }
  try { const errors = await seedPhotoshopPresets(); if (errors.length) console.warn('[presets] PS 默认包：', errors); } catch (e) { console.warn('[presets] PS 默认包：', e.message); }
  await retireApproximateDefaults();
  for (const k of KINDS5) await reload(k);
  lib.ready = true;
  store.onPresetsChange(ev => { if (KINDS5.includes(ev.kind)) reload(ev.kind); });
  onRecentColors(() => { const h = PANEL_HOST.swatches(); if (h && h.isConnected) render('swatches'); });
  return lib;
}

export const presets = {
  lib, selected, render, reload, refreshGradientThumbnails, definePattern, defineShape, newStyleFromLayer, applyStyle, openPresetManager, openExportImport, openPhotoshopPresets,
  importFile, encodeKind, readZip, dropOnCanvas, libMaterialize, injectLibPatterns, libGradientModel, store,
  multi, search, panelMenu,
  
  _api: () => A,
  _hit: (x, y) => { const i = A.hitLayer ? A.hitLayer(x, y) : -1; return { index: i, kind: i >= 0 && A.layerKind ? A.layerKind(i) : null, doc: A.clientToDoc(x, y) }; },
};
if (typeof window !== 'undefined') window.__psd_editorPresets = presets;
