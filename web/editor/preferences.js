















import { PS_TOOL_ICONS } from './ps-icons.js';

const KEY = 'psd_editor.prefs';



export const DEFAULTS = {
  general: {
    colorPicker: 'adobe', hudPicker: 'hueStrip', interp: 'bicubicAuto',
    autoUpdate: true, beep: false, exportClipboard: true, resizeOnPlace: true, placeSmart: true,
    skipTransformOnPlace: false, legacyNewDoc: false, legacyFreeTransform: false, homeScreen: false,
  },
  interface: {
    theme: 'dark',                 
    highlight: 'default',          
    uiScale: 'auto',               
    textSize: 'small',             
    scaleToFont: false, neutralColorMode: false,
    canvas: {
      standard: { color: 'default', custom: '#282828', border: 'shadow' },
      fullMenu: { color: 'default', custom: '#282828', border: 'shadow' },
      full: { color: 'black', custom: '#000000', border: 'none' },
      artboards: { color: 'default', custom: '#282828', border: 'line' },
    },
    channelsInColor: false, dynamicSliders: true, menuColors: true, showTransformValues: 'topRight',
  },
  workspace: {
    autoCollapseIcons: true, autoShowHidden: true, openAsTabs: true, floatDocDocking: true,
    largeTabs: false, narrowOptionsBar: false, restoreOnStart: true, customToolbar: true,
  },
  tools: {
    showTooltips: true, richTooltips: true, shiftToolSwitch: true, wheelZoom: false, animatedZoom: true,
    zoomResizeWindows: false, zoomClickCenter: false, flickPanning: true, dblClickMaskSelectAndMask: true,
    touchRotate: true, springLoaded: true, springTiming: 350,
    showRefPoint: false, overscroll: false, hudHardness: false, snapVectorToPixel: true,
    transformValues: 'topRight',   
    vectorHardness: true,
  },
  history: { states: 50, log: false, logTo: 'text', logItems: 'concise' },
  file: {
    imagePreviews: 'always', extCase: 'lower', saveToOriginal: true, backgroundSave: true, autoSave: true, autoSaveMin: 10,
    ignoreExifProfile: false, ignoreRotation: false, askTiffLayers: false, psdCompat: 'always', psbCompat: 'always',
    recentCount: 20, disableCompression: false,
  },
  export: { quickFormat: 'png', quickLocation: 'ask', quickMeta: 'none', quickSrgb: true, useLegacyExport: false },
  performance: { memoryPct: 70, cacheLevels: 4, cacheTile: '1024', gpu: true, legacyCompositing: false },
  cursors: {
    paint: 'normal',               
    crosshairInTip: false, crosshairWhilePainting: false,
    other: 'standard',             
    previewColor: '#ff0000',
  },
  transparency: {
    gridSize: 'medium',            
    gridColors: 'light',           
    color1: '#ffffff', color2: '#cccccc',
    gamutColor: '#808080', gamutOpacity: 100,
  },
  units: {
    rulers: 'px', type: 'pt', colWidth: 180, colWidthUnit: 'pt', gutter: 12, gutterUnit: 'pt',
    printRes: 300, screenRes: 72, pointSize: 'postscript',   
  },
  guides: {
    canvasColor: '#4affff', canvasStyle: 'lines',
    artboardColor: '#6fa8ff', artboardStyle: 'lines',
    smartColor: '#ff00aa',
    gridColor: '#8c8c8c', gridStyle: 'lines', gridEvery: 64, gridUnit: 'px', gridSub: 4,
    sliceColor: '#3c8cff', sliceNumbers: true,
    pathColor: '#1e90ff', pathWidth: 1,
  },
  plugins: { generator: false, remoteConnections: false, legacyPanels: false },
  type: {
    smartQuotes: true, missingGlyph: true, englishFontNames: false, fontPreview: 'medium',
    engine: 'worldReady',          
    enableMatchFont: false, languageOptions: 'eastAsian',
  },
  tech: { preserveDetails2: false, contentAwareTracing: false, preciseHDR: false, precise16Preview: false, openJpegWithoutBackground: false, modernUI: true },
  
  menus: { hidden: {}, colors: {} },
};

export const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(dst, src, path = '', out = []) {
  for (const k of Object.keys(src || {})) {
    const v = src[k], p = path ? path + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !(k === 'hidden' || k === 'colors')) deepMerge(dst[k], v, p, out);
    else if (JSON.stringify(dst[k]) !== JSON.stringify(v)) { dst[k] = (v && typeof v === 'object') ? clone(v) : v; out.push(p); }
  }
  return out;
}
let prefs = clone(DEFAULTS);
try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw === 'object') deepMerge(prefs, raw); } catch {}

const listeners = new Set();
export function all() { return prefs; }
export function get(path) { return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), prefs); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function save() {
  try {
    if (JSON.stringify(prefs) === JSON.stringify(DEFAULTS)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}

export function set(patch, { quiet = false } = {}) {
  const changed = deepMerge(prefs, patch);
  if (!changed.length) return changed;
  save();
  applyInterface();
  if (!quiet) for (const fn of listeners) { try { fn(prefs, changed); } catch (e) { console.error(e); } }
  return changed;
}

export function resetAll() {
  const before = prefs; prefs = clone(DEFAULTS);
  const changed = deepMerge(clone(DEFAULTS), before);
  save(); applyInterface();
  for (const fn of listeners) { try { fn(prefs, changed.length ? changed : ['*']); } catch {} }
}



export const THEMES = {
  darkest: { bg: '#1e1e1e', bg2: '#181818', bg3: '#141414', input: '#101010', canvas: '#1a1a1a', line: '#0e0e0e', line2: '#353535', text: '#e3e3e3', muted: '#9a9a9a', hover: '#2c2c2c', active: '#383838', sel: '#3c3c3c', btn: '#2c2c2c', btnHover: '#363636', panel2: '#262626' },
  dark:    { bg: '#323232', bg2: '#2b2b2b', bg3: '#262626', input: '#1e1e1e', canvas: '#282828', line: '#1c1c1c', line2: '#454545', text: '#e3e3e3', muted: '#a0a0a0', hover: '#3e3e3e', active: '#4a4a4a', sel: '#4f4f4f', btn: '#3d3d3d', btnHover: '#474747', panel2: '#3a3a3a' },
  medium:  { bg: '#535353', bg2: '#4a4a4a', bg3: '#424242', input: '#3a3a3a', canvas: '#474747', line: '#343434', line2: '#6a6a6a', text: '#f0f0f0', muted: '#c4c4c4', hover: '#5e5e5e', active: '#6a6a6a', sel: '#707070', btn: '#5c5c5c', btnHover: '#666666', panel2: '#5a5a5a' },
  light:   { bg: '#b8b8b8', bg2: '#adadad', bg3: '#a3a3a3', input: '#e8e8e8', canvas: '#a6a6a6', line: '#8e8e8e', line2: '#8a8a8a', text: '#1e1e1e', muted: '#3e3e3e', hover: '#c6c6c6', active: '#d2d2d2', sel: '#d6d6d6', btn: '#cdcdcd', btnHover: '#d8d8d8', panel2: '#c0c0c0' },
};
export const THEME_LABELS = [['darkest', '最暗'], ['dark', '暗'], ['medium', '中灰'], ['light', '浅']];
const CANVAS_PRESETS = { black: '#000000', darkGray: '#282828', mediumGray: '#535353', lightGray: '#b8b8b8' };
export const CHECKER_COLORS = {
  light: ['#ffffff', '#cccccc'], medium: ['#ffffff', '#999999'], dark: ['#666666', '#333333'],
  red: ['#ffffff', '#ffcccc'], orange: ['#ffffff', '#ffe5cc'], green: ['#ffffff', '#ccffcc'],
  blue: ['#ffffff', '#cce5ff'], purple: ['#ffffff', '#e5ccff'],
};
export const CHECKER_PX = { none: 0, small: 4, medium: 8, large: 16 };
export function checkerColors() {
  const t = prefs.transparency;
  return t.gridColors === 'custom' ? [t.color1, t.color2] : (CHECKER_COLORS[t.gridColors] || CHECKER_COLORS.light);
}
export function checkerSize() { return CHECKER_PX[prefs.transparency.gridSize] ?? 8; }

function canvasColorFor(mode) {
  const c = (prefs.interface.canvas || {})[mode] || {};
  if (c.color === 'custom') return c.custom || '#282828';
  if (c.color === 'default') return mode === 'full' ? '#000000' : (THEMES[prefs.interface.theme] || THEMES.dark).canvas;
  return CANVAS_PRESETS[c.color] || (THEMES[prefs.interface.theme] || THEMES.dark).canvas;
}
function borderCss(kind, dark) {
  if (kind === 'none') return 'none';
  if (kind === 'line') return `0 0 0 1px ${dark ? '#111' : '#555'}`;
  return `0 0 0 1px ${dark ? '#111' : '#555'}, 0 8px 30px rgba(0,0,0,.5)`;
}
let styleEl = null;
export function applyInterface() {
  if (typeof document === 'undefined') return;
  const I = prefs.interface, T = THEMES[I.theme] || THEMES.dark, root = document.documentElement;
  const light = I.theme === 'light';
  const vars = {
    '--ps-bg': T.bg, '--ps-bg-2': T.bg2, '--ps-bg-3': T.bg3, '--ps-input': T.input, '--ps-canvas': T.canvas,
    '--ps-line': T.line, '--ps-line-2': T.line2, '--ps-text': T.text, '--ps-muted': T.muted,
    '--ps-hover': T.hover, '--ps-active': T.active, '--ps-sel': !I.neutralColorMode && I.highlight === 'blue' ? (light ? '#9ec3f0' : '#2d5a8c') : T.sel,
    '--ps-accent': I.neutralColorMode ? (light ? '#616161' : '#777777') : '#1473e6',
    '--ps-accent-2': I.neutralColorMode ? (light ? '#707070' : '#888888') : '#2b7de9',
    '--panel2': T.panel2,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.psTheme = I.theme;
  const [c1, c2] = checkerColors(), cs = checkerSize();
  root.style.setProperty('--fp-checker', cs ? `repeating-conic-gradient(${c1} 0% 25%, ${c2} 0% 50%) 50% / ${cs * 2}px ${cs * 2}px, ${c2}` : c1);
  const fontPx = { tiny: 10, small: 12, medium: 13, large: 14 }[I.textSize] || 12;
  

  const scale = I.uiScale === '200' ? 2 : I.uiScale === '100' ? 1 : (I.scaleToFont ? fontPx / 12 : 1);
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'fpPrefsStyle'; document.head.appendChild(styleEl); }
  const cv = mode => canvasColorFor(mode);
  const bd = mode => borderCss(((I.canvas || {})[mode] || {}).border || 'shadow', !light);
  const W = prefs.workspace;
  styleEl.textContent = `
    body { font-size: ${fontPx}px; }
    ${scale !== 1 ? `.app.ps { zoom: ${scale}; }` : ''}
    button, label.btn { background: ${T.btn}; }
    button:hover, label.btn:hover { background: ${T.btnHover}; }
    .app.ps .viewport { background: ${cv('standard')}; }
    .app.ps .stage:not(.padded):not(.abdoc) { box-shadow: ${bd('standard')}; }
    .app.ps.screen-full-menu .viewport { background: ${cv('fullMenu')}; }
    .app.ps.screen-full-menu .stage:not(.padded):not(.abdoc) { box-shadow: ${bd('fullMenu')}; }
    .app.ps.screen-full .viewport { background: ${cv('full')}; }
    .app.ps.screen-full .stage:not(.padded):not(.abdoc) { box-shadow: ${bd('full')}; }
    .app.ps .viewport:has(.stage.abdoc) { background: ${cv('artboards')}; }
    .stage, .app.ps .stage, .stage > .ab-checker { background: var(--fp-checker); }
    .stage.padded, .app.ps .stage.padded, .stage.abdoc, .app.ps .stage.abdoc { background: transparent; }
    .lrow .thumb { background: var(--fp-checker); }
    ${W.narrowOptionsBar ? `.app.ps { grid-template-rows: 30px 28px 1fr; } .app.ps .optbar { font-size: 11px; } .app.ps .optbar .lbl, .app.ps .optbar label > span.optlabel { display: none; }` : ''}
    ${W.largeTabs ? `.doctabs { height: 32px; } .doctab { font-size: 13px; }` : ''}
    ${light ? `.menu-pop, .menubar, .menubar-row { color: ${T.text}; } .menu-pop { background: ${T.bg}; } .menu-item.disabled { color: #777; }
      input[type=number], input[type=text], input[type=search], input:not([type]), select, textarea { color: ${T.text} !important; background-color: ${T.input} !important; border-color: ${T.line2}; }` : ''}
    ${!I.menuColors ? `.menu-item[data-fp-color] { background: transparent !important; }` : ''}
  `;
}


export const PAGES = [
  ['general', '常规'], ['interface', '界面'], ['workspace', '工作区'], ['notifications', '通知'], ['tools', '工具'],
  ['history', '历史记录和 Content Credentials'], ['file', '文件处理'], ['export', '导出'], ['performance', '性能'],
  ['imageProcessing', '图像处理'], ['scratch', '暂存盘'], ['cursors', '光标'], ['transparency', '透明度与色域'],
  ['units', '单位与标尺'], ['guides', '参考线、网格和切片'], ['plugins', '增效工具'], ['type', '文字'], ['enhancedControls', '增强型控件'], ['tech', '技术预览'], ['productImprovement', '产品改进'],
];

export const PAGE_OF_ACTION = {
  'edit.preferences': 'general', 'edit.preferences.interface': 'interface', 'edit.preferences.workspace': 'workspace',
  'edit.preferences.tools': 'tools', 'edit.preferences.history': 'history', 'edit.preferences.fileHandling': 'file',
  'edit.preferences.notifications': 'notifications', 'edit.preferences.enhancedControls': 'enhancedControls', 'edit.preferences.productImprovement': 'productImprovement',
  'edit.preferences.export': 'export', 'edit.preferences.performance': 'performance', 'edit.preferences.imageProcessing': 'imageProcessing',
  'edit.preferences.scratch': 'scratch', 'edit.preferences.cursors': 'cursors', 'edit.preferences.transparency': 'transparency',
  'edit.preferences.units': 'units', 'edit.preferences.guides': 'guides', 'edit.preferences.plugins': 'plugins',
  'edit.preferences.type': 'type', 'edit.preferences.techPreview': 'tech',
};

export function openPreferences(page = 'general', ctx = {}) {
  return import('./preferences-dialog.js').then(m => m.openPreferencesDialog(page, ctx))
    .catch(e => { console.warn('[首选项] 对话框没能载入', e); try { alert('首选项对话框没能载入：' + (e && e.message || e)); } catch {} });
}




const STD_ICON = { brush: 'brush', pencil: 'pencil', eraser: 'eraser', cloneStamp: 'cloneStamp', patternStamp: 'patternStamp',
  backgroundEraser: 'backgroundEraser', colorReplace: 'colorReplace', blur: 'blur', sharpen: 'sharpen', smudge: 'smudge',
  dodge: 'dodge', burn: 'burn', sponge: 'sponge', mixerBrush: 'mixerBrush', historyBrush: 'historyBrush', historyArtBrush: 'historyArtBrush',
  adjBrush: 'adjBrush', spotHeal: 'spotHeal', healBrush: 'healBrush', quickSelect: 'quickSelect', selectionBrush: 'selectionBrush' };
const stdCache = new Map();
export function standardToolCursor(tool) {
  if (stdCache.has(tool)) return stdCache.get(tool);
  const t = PS_TOOL_ICONS[STD_ICON[tool] || tool];
  let css = 'crosshair';
  if (t && t.body) {
    const [vx, vy, vw] = t.vb.split(' ').map(Number), px = 22, k = px / vw;
    const body = t.body.replace(/ fill="currentColor"/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="translate(1,1) scale(${k.toFixed(4)}) translate(${-vx},${-vy})" fill="#fff" stroke="#1a1a1a" stroke-width="${(1.6 / k).toFixed(2)}" stroke-linejoin="round" paint-order="stroke">${body}</g></svg>`;
    css = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 2 22, crosshair`;
  }
  stdCache.set(tool, css);
  return css;
}

applyInterface();

export const preferences = { DEFAULTS, PAGES, PAGE_OF_ACTION, all, get, set, onChange, resetAll, applyInterface, openPreferences, checkerColors, checkerSize, THEME_LABELS, standardToolCursor };
export default preferences;
