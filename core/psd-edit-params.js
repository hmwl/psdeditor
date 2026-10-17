





























































import { parsePsdDocument } from './psd-document.js';
import { contourDescFrom } from './contour.js';
import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';




const FX_BLOCK_KEYS = ['lmfx', 'lfx2', 'lfxs'];

const LEGACY_FX_KEY = 'lrFX';





const FX = {
  'DrSh':        { name: 'dropShadow',      multi: 'dropShadowMulti',   label: '投影' },
  'IrSh':        { name: 'innerShadow',     multi: 'innerShadowMulti',  label: '内阴影' },
  'OrGl':        { name: 'outerGlow',       multi: null,                label: '外发光' },
  'IrGl':        { name: 'innerGlow',       multi: null,                label: '内发光' },
  'ebbl':        { name: 'bevelEmboss',     multi: null,                label: '斜面和浮雕' },
  'SoFi':        { name: 'colorOverlay',    multi: 'solidFillMulti',    label: '颜色叠加' },
  'GrFl':        { name: 'gradientOverlay', multi: 'gradientFillMulti', label: '渐变叠加' },
  'patternFill': { name: 'patternOverlay',  multi: null,                label: '图案叠加' },
  'FrFX':        { name: 'stroke',          multi: 'frameFXMulti',      label: '描边' },
  'ChFX':        { name: 'satin',           multi: null,                label: '光泽' },
};


const FX_ALIAS = (() => {
  const m = new Map();
  const add = (k, v) => m.set(String(k).toLowerCase().trim(), v);
  for (const key of Object.keys(FX)) {
    add(key, key); add(FX[key].name, key);
    if (FX[key].multi) add(FX[key].multi, key);
    
    add(FX[key].name.replace(/([A-Z])/g, '-$1'), key);
    add(FX[key].name.replace(/([A-Z])/g, '_$1'), key);
  }
  add('bevel', 'ebbl'); add('emboss', 'ebbl'); add('gloss', 'ChFX');
  add('shadow', 'DrSh'); add('glow', 'OrGl'); add('frame', 'FrFX');
  return m;
})();







const ADJ = {
  'SoCo': { kind: 'descriptor', label: '纯色填充', priority: 5 },
  'GdFl': { kind: 'descriptor', label: '渐变填充', priority: 5 },
  'PtFl': { kind: 'descriptor', label: '图案填充', priority: 5 },
  'CgEd': { kind: 'descriptor', label: '亮度/对比度（新式描述符）', priority: 9, legacyOf: 'brit' },
  'blwh': { kind: 'descriptor', label: '黑白',                    priority: 5 },
  'vibA': { kind: 'descriptor', label: '自然饱和度',               priority: 5 },
  'clrL': { kind: 'descriptor', label: '颜色查找',                 priority: 5 },
  'brit': { kind: 'binary',     label: '亮度/对比度（旧式二进制）', priority: 1 },
  'levl': { kind: 'binary',     label: '色阶',                    priority: 5 },
  'curv': { kind: 'binary',     label: '曲线',                    priority: 5 },
  'hue ': { kind: 'binary',     label: '色相/饱和度（旧式）',      priority: 4 },
  'hue2': { kind: 'binary',     label: '色相/饱和度',             priority: 5 },
  'blnc': { kind: 'binary',     label: '色彩平衡',                priority: 5 },
  'phfl': { kind: 'binary',     label: '照片滤镜',                priority: 5 },
  'mixr': { kind: 'binary',     label: '通道混合器',              priority: 5 },
  'selc': { kind: 'binary',     label: '可选颜色',                priority: 5 },
  'expA': { kind: 'binary',     label: '曝光度',                  priority: 5 },
  'post': { kind: 'binary',     label: '色调分离',                priority: 5 },
  'thrs': { kind: 'binary',     label: '阈值',                    priority: 5 },
  'nvrt': { kind: 'binary',     label: '反相（无参数）',           priority: 5 },
  'grdm': { kind: 'binary',     label: '渐变映射',                priority: 5 },
};
const ADJ_KEYS = Object.keys(ADJ);






const COLOR_SPACES = {
  RGBC: { label: 'RGB', comps: { 'Rd  ': { label: '红', min: 0, max: 255 }, 'Grn ': { label: '绿', min: 0, max: 255 }, 'Bl  ': { label: '蓝', min: 0, max: 255 } } },
  HSBC: { label: 'HSB', comps: { 'H   ': { label: '色相', min: 0, max: 360 }, 'Strt': { label: '饱和度', min: 0, max: 100 }, 'Brgh': { label: '明度', min: 0, max: 100 } } },
  CMYC: { label: 'CMYK', comps: { 'Cyn ': { label: '青', min: 0, max: 100 }, 'Mgnt': { label: '洋红', min: 0, max: 100 }, 'Ylw ': { label: '黄', min: 0, max: 100 }, 'Blck': { label: '黑', min: 0, max: 100 } } },
  LABC: { label: 'Lab', comps: { 'Lmnc': { label: '明度', min: 0, max: 100 }, 'A   ': { label: 'a', min: -128, max: 127 }, 'B   ': { label: 'b', min: -128, max: 127 } } },
  GRYC: { label: '灰度', comps: { 'Gry ': { label: '灰', min: 0, max: 100 } } },
};
const isColorClass = c => Object.prototype.hasOwnProperty.call(COLOR_SPACES, c || '');






const STOP_FIELD = {
  Clrt: {
    'Lctn': { label: '色标位置（0–4096）', min: 0, max: 4096 },
    'Mdpn': { label: '色标中点（%）', min: 0, max: 100 },
  },
  TrnS: {
    'Lctn': { label: '不透明度标位置（0–4096）', min: 0, max: 4096 },
    'Mdpn': { label: '不透明度标中点（%）', min: 0, max: 100 },
  },
};










const STOP_ARRAYS = {
  Clrt: { label: '渐变色标', sortKey: 'Lctn', min: 2, max: 255 },
  TrnS: { label: '渐变不透明度色标', sortKey: 'Lctn', min: 2, max: 255 },
};

const DESC_ARRAY_KEYS = { 'Clrs': 'Clrt', 'Trns': 'TrnS' };


const BIN_ARRAYS = {
  grdm: {
    'colorStops': { label: '渐变映射色标', sortKey: 'location', min: 2, max: 255 },
    'transparencyStops': { label: '渐变映射不透明度标', sortKey: 'location', min: 2, max: 255 },
  },
};










const CURV_POINT_ARRAY = /^(channels|extra)\.\d+\.points$/;
const CURV_POINTS_SPEC = { label: '曲线控制点', sortKey: 'input', min: 2, max: 19 };








function arraySpecOf(kind, blockKey, path, value) {
  if (!Array.isArray(value) || !value.length) return null;
  const isPlainObj = e => e !== null && typeof e === 'object' && !Array.isArray(e) && !(e instanceof Uint8Array);
  if (!value.every(isPlainObj)) return null;      
  if (kind === 'descriptor') {
    const cls = DESC_ARRAY_KEYS[path.split('.').pop()];
    if (!cls || !STOP_ARRAYS[cls]) return null;
    if (!value.every(e => e.__classID === cls)) return null;
    return { ...STOP_ARRAYS[cls], itemClass: cls };
  }
  const t = BIN_ARRAYS[blockKey];
  if (t && t[path]) return { ...t[path], itemClass: null };
  if (blockKey === 'curv' && CURV_POINT_ARRAY.test(path)) return { ...CURV_POINTS_SPEC, itemClass: null };
  return null;
}


const BLEND_FIELDS = new Set(['Md  ', 'hglM', 'sdwM']);







const BLNM_VALUES = new Set([
  'Nrml', 'Dslv', 'Drkn', 'Mltp', 'CBrn', 'linearBurn', 'darkerColor',
  'Lghn', 'Scrn', 'CDdg', 'linearDodge', 'lighterColor', 'Ovrl', 'SftL', 'HrdL',
  'vividLight', 'linearLight', 'pinLight', 'hardMix', 'Dfrn', 'Xclu',
  'blendSubtraction', 'blendDivide', 'H   ', 'Strt', 'Clr ', 'Lmns',
  'linearHeight', 'Hght', 'Sbtr',
]);









const DESC_FIELD = {
  'Opct': { label: '不透明度', min: 0, max: 100 },
  'hglO': { label: '高光不透明度', min: 0, max: 100 },
  'sdwO': { label: '阴影不透明度', min: 0, max: 100 },
  'Nose': { label: '杂色', min: 0, max: 100 },
  'Inpr': { label: '范围', min: 0, max: 100 },
  'ShdN': { label: '抖动', min: 0, max: 100 },
  'lagl': { label: '角度', min: -360, max: 360 },
  'Angl': { label: '角度', min: -360, max: 360 },
  'Lald': { label: '高度', min: 0, max: 90 },
  'Dstn': { label: '距离（px）', min: 0, max: 30000 },
  'Ckmt': { label: '扩展/阻塞', min: 0, max: 250 },
  'blur': { label: '大小', min: 0, max: 250 },
  'Sz  ': { label: '大小', min: 0, max: 250 },
  'Sftn': { label: '软化', min: 0, max: 16 },
  'srgR': { label: '深度', min: 1, max: 1000 },
  'Scl ': { label: '缩放', min: 1, max: 1000 },
  'enab': { label: '启用' },
  'uglg': { label: '使用全局光' },
  'AntA': { label: '消除锯齿' },
  'Algn': { label: '与图层对齐' },
  'Dthr': { label: '仿色' },
  'Rvrs': { label: '反向' },
  'gradientsInterpolationMethod': { label: '方法' },
  'Invr': { label: '反转' },
  'present': { label: '已呈现（PS 内部）' },
  'showInDialog': { label: '对话框可见（PS 内部）' },
  'layerConceals': { label: '图层挖空投影' },
  'overprint': { label: '叠印' },
  'masterFXSwitch': { label: '图层样式总开关' },
  'numModifyingFX': { label: '生效的效果数（PS 内部）', min: 0, max: 1000 },
};





const BLOCK_FIELD = {
  
  GdFl: {
    'Ofst.Hrzn': { label: '水平偏移', min: -100, max: 100 }, 'Ofst.Vrtc': { label: '垂直偏移', min: -100, max: 100 },
  },
  
  blwh: {
    'Rd  ': { label: '红', min: -200, max: 300 }, 'Yllw': { label: '黄', min: -200, max: 300 },
    'Grn ': { label: '绿', min: -200, max: 300 }, 'Cyn ': { label: '青', min: -200, max: 300 },
    'Bl  ': { label: '蓝', min: -200, max: 300 }, 'Mgnt': { label: '洋红', min: -200, max: 300 },
    'useTint': { label: '色调' },
    'bwPresetKind': { label: '预设种类（PS 内部）', min: 0, max: 10 },
    'blackAndWhitePresetFileName': { label: '预设文件名' },
  },
  vibA: {
    'vibrance': { label: '自然饱和度', min: -100, max: 100 },
    'Strt': { label: '饱和度', min: -100, max: 100 },
  },
  CgEd: {
    'Vrsn': { label: '版本（PS 内部）', editable: false },
    'Brgh': { label: '亮度', min: -150, max: 150 },
    'Cntr': { label: '对比度', min: -50, max: 100 },
    'means': { label: '平均值（PS 内部）', min: 0, max: 255 },
    'Lab ': { label: '仅 Lab 明度' },
    'useLegacy': { label: '使用旧版算法' },
    'Auto': { label: '自动' },
  },
  clrL: { 'Nm  ': { label: '名称' } },
};





const BIN_FIELD = {
  brit: {
    'brightness': { label: '亮度', type: 'int16', min: -150, max: 150 },
    'contrast': { label: '对比度', type: 'int16', min: -100, max: 100 },
    'meanValue': { label: '平均值（PS 内部）', type: 'int16', min: 0, max: 255 },
    'labColorOnly': { label: '仅 Lab 明度', type: 'bool' },
  },
  thrs: { 'level': { label: '阈值色阶', type: 'uint16', min: 1, max: 255 } },
  post: { 'levels': { label: '色阶数', type: 'uint16', min: 2, max: 255 } },
  nvrt: {},
  blnc: {
    'shadows.*': { label: '阴影（青红/洋绿/黄蓝）', type: 'int16', min: -100, max: 100 },
    'midtones.*': { label: '中间调（青红/洋绿/黄蓝）', type: 'int16', min: -100, max: 100 },
    'highlights.*': { label: '高光（青红/洋绿/黄蓝）', type: 'int16', min: -100, max: 100 },
    'preserveLuminosity': { label: '保持明度', type: 'bool' },
  },
  expA: {
    'exposure': { label: '曝光度', type: 'float32', min: -20, max: 20 },
    'offset': { label: '位移', type: 'float32', min: -0.5, max: 0.5 },
    'gamma': { label: '灰度系数校正', type: 'float32', min: 0.01, max: 9.99 },
  },
  selc: {
    'method': { label: '方法（0 相对 / 1 绝对）', type: 'uint16', min: 0, max: 1 },
    
    
    
    'plates.0.*': { label: '占位（PS 内部，恒 0）', type: 'int16', editable: false },
    'plates.*.*': { label: '校正值（青/洋红/黄/黑）', type: 'int16', min: -100, max: 100 },
  },
  mixr: {
    'monochrome': { label: '单色', type: 'bool' },
    
    'channels.*.3': { label: '占位（PS 内部，恒 0）', type: 'int16', editable: false },
    'channels.*.*': { label: '通道系数（红/绿/蓝/-/常数）', type: 'int16', min: -200, max: 200 },
  },
  'hue ': null,   
  hue2: null,
  levl: {
    'records.*.shadowInput': { label: '输入黑场', type: 'uint16', min: 0, max: 253 },
    'records.*.highlightInput': { label: '输入白场', type: 'uint16', min: 2, max: 255 },
    'records.*.shadowOutput': { label: '输出黑场', type: 'uint16', min: 0, max: 255 },
    'records.*.highlightOutput': { label: '输出白场', type: 'uint16', min: 0, max: 255 },
    'records.*.midtoneInput': { label: '灰度系数 ×100', type: 'uint16', min: 10, max: 999 },
  },
  curv: {
    'channels.*.points.*.input': { label: '曲线点输入', type: 'uint16', min: 0, max: 255 },
    'channels.*.points.*.output': { label: '曲线点输出', type: 'uint16', min: 0, max: 255 },
    'channels.*.map.*': { label: '曲线映射表', type: 'uint8', min: 0, max: 255 },
    'extra.*.points.*.input': { label: '曲线点输入（扩展段）', type: 'uint16', min: 0, max: 255 },
    'extra.*.points.*.output': { label: '曲线点输出（扩展段）', type: 'uint16', min: 0, max: 255 },
    'extra.*.map.*': { label: '曲线映射表（扩展段）', type: 'uint8', min: 0, max: 255 },
  },
  phfl: {
    'density': { label: '浓度（百分比 ×100）', type: 'uint32', min: 0, max: 10000 },
    'preserveLuminosity': { label: '保留明度', type: 'bool' },
    'color.*': { label: '滤镜颜色分量（16 位）', type: 'uint16', min: 0, max: 65535 },
    'colorSpace': { label: '颜色空间（PS 内部）', type: 'uint16', min: 0, max: 10 },
    'xyz.*': { label: 'Lab 分量 ×100', type: 'uint32', min: 0, max: 0xffffffff },
  },
  grdm: {
    'reverse': { label: '反向', type: 'bool' },
    'dither': { label: '仿色', type: 'bool' },
    'colorStops.*.location': { label: '色标位置（0–4096）', type: 'uint32', min: 0, max: 4096 },
    'colorStops.*.midpoint': { label: '色标中点（%）', type: 'uint32', min: 0, max: 100 },
    'colorStops.*.color.*': { label: '色标颜色分量（16 位）', type: 'uint16', min: 0, max: 65535 },
    'transparencyStops.*.location': { label: '透明标位置（0–4096）', type: 'uint32', min: 0, max: 4096 },
    'transparencyStops.*.midpoint': { label: '透明标中点（%）', type: 'uint32', min: 0, max: 100 },
    'transparencyStops.*.opacity': { label: '透明标不透明度（0–255）', type: 'uint16', min: 0, max: 255 },
  },
};


const HUE_FIELDS = {
  'enable': { label: '着色开关', type: 'bool' },
  'colorization.0': { label: '着色-色相', type: 'int16', min: -180, max: 180 },
  'colorization.1': { label: '着色-饱和度', type: 'int16', min: -100, max: 100 },
  'colorization.2': { label: '着色-明度', type: 'int16', min: -100, max: 100 },
  'master.0': { label: '全图-色相', type: 'int16', min: -180, max: 180 },
  'master.1': { label: '全图-饱和度', type: 'int16', min: -100, max: 100 },
  'master.2': { label: '全图-明度', type: 'int16', min: -100, max: 100 },
  'ranges.*.range.*': { label: '色域边界（度）', type: 'int16', min: -360, max: 720 },
  'ranges.*.settings.0': { label: '色相', type: 'int16', min: -180, max: 180 },
  'ranges.*.settings.1': { label: '饱和度', type: 'int16', min: -100, max: 100 },
  'ranges.*.settings.2': { label: '明度', type: 'int16', min: -100, max: 100 },
};
BIN_FIELD['hue '] = HUE_FIELDS;
BIN_FIELD.hue2 = HUE_FIELDS;


const BIN_READONLY = new Set(['version', 'extraSig', 'extraVersion', 'extraCount', 'countMap', 'isMap',
  '_key', '_kind', '_tail', '_error', '_raw', '_nameUnits', '_dummy', '_pad', 'name']);


function matchPattern(pattern, segs) {
  const p = pattern.split('.');
  if (p.length !== segs.length) return false;
  for (let i = 0; i < p.length; i++) if (p[i] !== '*' && p[i] !== segs[i]) return false;
  return true;
}
function lookupBin(blockKey, path) {
  const table = BIN_FIELD[blockKey];
  if (!table) return null;
  if (table[path]) return table[path];
  const segs = path.split('.');
  for (const pat of Object.keys(table)) if (pat.includes('*') && matchPattern(pat, segs)) return table[pat];
  return null;
}



function toAB(b) {
  if (b instanceof ArrayBuffer) return b;
  if (ArrayBuffer.isView(b)) return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  throw new TypeError('getLayerParams：不是字节缓冲区');
}
const hex = n => '0x' + (n & 0xff).toString(16).padStart(2, '0');
function checksum(u8) { let s = 0; for (let i = 0; i < u8.length; i++) s = (s * 31 + u8[i]) >>> 0; return s; }
const numStr = v => (Object.is(v, -0) ? '-0' : String(v));


function rawBlockOf(doc, ab, index, key) {
  const layer = doc.layers[index];
  if (!layer) return null;
  const blk = (layer.additionalBlocks || []).find(b => b.key === key);
  if (!blk || !blk._off) return null;
  return new Uint8Array(ab, blk._off.dataOffset, blk._off.dataEnd - blk._off.dataOffset);
}



const isMeta = k => k.startsWith('__');
const dataKeys = o => Object.keys(o).filter(k => !isMeta(k));


function shapeOf(v, host, key) {
  if (v === null || v === undefined) return { type: 'null', leaf: true, editable: false };
  if (v instanceof Uint8Array) return { type: 'tdta', leaf: true, editable: false, length: v.length };
  if (Array.isArray(v)) return { type: 'list', leaf: false, editable: false, count: v.length };
  if (typeof v === 'boolean') return { type: 'bool', leaf: true, editable: true };
  if (typeof v === 'string') return { type: 'TEXT', leaf: true, editable: true };
  if (typeof v === 'number') {
    const t = host && host.__comp && host.__comp[key] ? 'comp'
      : host && host.__long && host.__long[key] ? 'long'
        : host && host.__doub && host.__doub[key] ? 'doub' : 'number';
    return { type: t, leaf: true, editable: true, integer: t === 'long' || t === 'comp' };
  }
  if (typeof v === 'object') {
    if (v.__objectArray) return { type: 'ObAr', leaf: false, editable: false, classID: v.__classID || null };
    if (v.__unit && Array.isArray(v.values)) return { type: 'UnFl', leaf: true, editable: false, unit: v.__unit, count: v.values.length };
    if (v.__unit !== undefined) return { type: 'UntF', leaf: true, editable: true, unit: v.__unit };
    if (v.__enumType !== undefined) return { type: 'enum', leaf: true, editable: true, enumType: v.__enumType };
    if (v.__class !== undefined) return { type: 'type', leaf: true, editable: false, classID: v.__class };
    if (v.__reference !== undefined) return { type: 'reference', leaf: true, editable: false };
    if (v.__classID !== undefined) {
      return isColorClass(v.__classID)
        ? { type: 'color', leaf: false, editable: true, colorSpace: v.__classID }
        : { type: 'object', leaf: false, editable: false, classID: v.__classID };
    }
    return { type: 'object', leaf: false, editable: false, classID: null };
  }
  return { type: 'unknown', leaf: true, editable: false };
}


function binShapeOf(v, blockKey, path) {
  const spec = lookupBin(blockKey, path);
  if (v instanceof Uint8Array) return { type: 'bytes', leaf: true, editable: false, length: v.length };
  if (Array.isArray(v)) return { type: 'list', leaf: false, editable: false, count: v.length };
  if (v !== null && typeof v === 'object') return { type: 'object', leaf: false, editable: false };
  const readonly = !spec || BIN_READONLY.has(path.split('.').pop()) || spec.editable === false;
  if (typeof v === 'boolean') return { type: 'bool', leaf: true, editable: !readonly };
  if (typeof v === 'string') return { type: 'string', leaf: true, editable: false };
  if (typeof v === 'number') {
    const t = (spec && spec.type) || 'number';
    return { type: t, leaf: true, editable: !readonly, integer: t !== 'float32' && t !== 'number' };
  }
  return { type: 'unknown', leaf: true, editable: false };
}








function flatten(node, prefix, out, host, key) {
  out = out || {};
  if (node instanceof Uint8Array) { out[prefix] = `bytes:${node.length}:${checksum(node)}`; return out; }
  if (Array.isArray(node)) {
    out[prefix + '#len'] = 'n:' + node.length;
    for (let i = 0; i < node.length; i++) flatten(node[i], prefix ? `${prefix}.${i}` : String(i), out, node, i);
    return out;
  }
  if (node !== null && typeof node === 'object') {
    if (node.__unit && Array.isArray(node.values)) { out[prefix] = `UnFl ${node.__unit}:${node.values.map(numStr).join(',')}`; return out; }
    if (node.__unit !== undefined) { out[prefix] = `UntF ${node.__unit}:${numStr(node.value)}`; return out; }
    if (node.__enumType !== undefined) { out[prefix] = `enum ${node.__enumType}.${node.value}`; return out; }
    if (node.__class !== undefined) { out[prefix] = `type:${node.__class}|${node.__name || ''}`; return out; }
    if (node.__reference !== undefined) { out[prefix] = 'ref:' + JSON.stringify(node.__reference); return out; }
    const keys = dataKeys(node);
    out[prefix + '#cls'] = `cls:${node.__classID || ''}|${node.__name || ''}|${node.__objectArray ? 'ObAr' + (node.__itemsCount || 0) : ''}`;
    out[prefix + '#keys'] = keys.join(',');
    for (const k of keys) flatten(node[k], prefix ? `${prefix}.${k}` : k, out, node, k);
    return out;
  }
  if (typeof node === 'boolean') { out[prefix] = 'bool:' + node; return out; }
  if (typeof node === 'string') { out[prefix] = 'TEXT:' + node; return out; }
  if (typeof node === 'number') {
    const t = host && host.__comp && host.__comp[key] ? 'comp'
      : host && host.__long && host.__long[key] ? 'long'
        : host && host.__doub && host.__doub[key] ? 'doub' : 'num';
    out[prefix] = `${t}:${numStr(node)}`;
    return out;
  }
  out[prefix] = 'other:' + String(node);
  return out;
}

function snapshotDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) if (a[k] !== b[k]) out.push({ path: k, before: a[k], after: b[k] });
  out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  return out;
}



const MAX_DEPTH = 8;





function enumFields(root, blockKey, kind) {
  const out = [];
  
  const emit = (host, k, path, depth) => {
    const v = host[k];
    const shape = kind === 'descriptor' ? shapeOf(v, host, k) : binShapeOf(v, blockKey, path);
    const spec = kind === 'descriptor' ? descSpec(blockKey, path, k, host) : lookupBin(blockKey, path);
    const entry = { path, type: shape.type, editable: !!shape.editable };
    if (shape.unit) entry.unit = shape.unit;
    if (shape.enumType) entry.enumType = shape.enumType;
    if (shape.colorSpace) entry.colorSpace = shape.colorSpace;
    if (shape.classID) entry.classID = shape.classID;
    if (shape.count !== undefined) entry.count = shape.count;
    if (shape.length !== undefined) entry.byteLength = shape.length;
    if (shape.leaf) entry.value = shape.type === 'UntF' ? v.value
      : shape.type === 'enum' ? v.value
        : shape.type === 'UnFl' ? v.values.slice()
          : shape.type === 'tdta' || shape.type === 'bytes' ? null
            : shape.type === 'type' ? (v.__name || '') : v;
    if (spec) {
      if (spec.label) entry.label = spec.label;
      if (spec.min !== undefined) entry.min = spec.min;
      if (spec.max !== undefined) entry.max = spec.max;
      if (spec.editable === false) entry.editable = false;
    }
    if (kind === 'descriptor' && BLEND_FIELDS.has(k)) entry.blendMode = true;
    if (shape.type === 'color') entry.components = Object.keys(COLOR_SPACES[shape.colorSpace].comps).map(c => `${path}.${c}`);
    

    if (shape.type === 'list') {
      entry.length = shape.count;
      const as = arraySpecOf(kind, blockKey, path, v);
      entry.arrayEditable = !!as;
      if (as) {
        if (!entry.label) entry.label = as.label;
        entry.minLength = as.min;
        entry.maxLength = as.max;
        entry.sortKey = as.sortKey;
        entry.itemClass = as.itemClass;
      }
    }
    out.push(entry);
    if (!shape.leaf) walk(v, path, depth + 1);
  };
  
  const walk = (node, prefix, depth) => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) emit(node, i, prefix ? `${prefix}.${i}` : String(i), depth);
      return;
    }
    if (node === null || typeof node !== 'object' || node instanceof Uint8Array) return;
    
    
    const keys = kind === 'descriptor' ? dataKeys(node) : Object.keys(node).filter(k => !k.startsWith('_'));
    for (const k of keys) emit(node, k, prefix ? `${prefix}.${k}` : k, depth);
  };
  walk(root, '', 0);
  return out;
}


function descSpec(blockKey, path, key, host) {
  if (host && isColorClass(host.__classID)) {
    const c = COLOR_SPACES[host.__classID].comps[key];
    if (c) return c;
  }
  if (host && STOP_FIELD[host.__classID] && STOP_FIELD[host.__classID][key]) {
    return STOP_FIELD[host.__classID][key];
  }
  const bk = BLOCK_FIELD[blockKey];
  if (bk && (bk[path] || bk[key])) return bk[path] || bk[key];
  return DESC_FIELD[key] || null;
}









function probeBlock(raw, key, psb) {
  if (!raw) return { ok: false, key, reason: `图层上没有 ${key} 块` };
  const kind = ADJ[key] ? ADJ[key].kind : 'descriptor';
  const ctx = { psb: !!psb, verify: false };
  let model;
  try { model = parseAdditionalBlock(key, raw, ctx); } catch (e) {
    return { ok: false, key, reason: `${key} 块解析抛错（${e && e.message}）` };
  }
  if (model && model._raw !== undefined) {
    return { ok: false, key, reason: `${key} 块没有语义解析结果（${model._error || '未注册的块类型'}），只能原样保留` };
  }
  let ser;
  try { ser = writeAdditionalBlock(key, model, ctx); } catch (e) {
    return { ok: false, key, reason: `${key} 块无法重新序列化（${e && e.message}）` };
  }
  if (ser.length !== raw.length) {
    return { ok: false, key, reason: `${key} 块原样重序列化长度对不上（原 ${raw.length} 字节 → 重建 ${ser.length} 字节）` };
  }
  for (let i = 0; i < ser.length; i++) {
    if (ser[i] !== raw[i]) {
      return { ok: false, key, reason: `${key} 块原样重序列化在块内偏移 ${i} 处就对不上（原 ${hex(raw[i])} → 重建 ${hex(ser[i])}）`, offset: i };
    }
  }
  
  const root = kind === 'descriptor' ? model.desc : model;
  if (kind === 'descriptor' && (!root || typeof root !== 'object')) {
    return { ok: false, key, reason: `${key} 块里没有解析出描述符` };
  }
  return { ok: true, key, raw, model, root, kind };
}




function blocksOf(doc, index) {
  const layer = doc.layers[index];
  const keys = layer ? (layer.additionalBlocks || []).map(b => b.key) : [];
  return {
    fx: FX_BLOCK_KEYS.filter(k => keys.includes(k)),
    legacyFx: keys.includes(LEGACY_FX_KEY) ? [LEGACY_FX_KEY] : [],
    adjustment: ADJ_KEYS.filter(k => keys.includes(k)),
  };
}


function pickAdjustment(list) {
  let best = null;
  for (const k of list) if (!best || ADJ[k].priority > ADJ[best].priority) best = k;
  return best;
}


function effectSlot(desc, fxKey, at) {
  const spec = FX[fxKey];
  for (const k of [spec && spec.multi, fxKey]) {
    if (!k) continue;
    const v = desc[k];
    if (Array.isArray(v)) {
      if (at >= v.length) return { error: `at=${at} 越界：这一层的「${spec.label}」一共只有 ${v.length} 条（合法范围 0…${v.length - 1}）`, count: v.length };
      const node = v[at];
      if (!node || typeof node !== 'object' || Array.isArray(node)) return { error: `「${spec.label}」的第 ${at} 条不是效果描述符` };
      return { node, slotKey: k, at, count: v.length, multi: true, prefix: `${k}.${at}` };
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && v.__classID !== undefined) {
      if (at > 0) return { error: `at=${at} 越界：这一层的「${spec.label}」只有 1 条（非多重效果，只能用 at=0）`, count: 1 };
      return { node: v, slotKey: k, at: 0, count: 1, multi: false, prefix: k };
    }
  }
  return null;
}


function presentEffects(desc) {
  const out = [];
  for (const key of Object.keys(FX)) {
    const s = effectSlot(desc, key, 0);
    if (s && s.node) out.push(`effect:${key}(${FX[key].name}/${FX[key].label}${s.multi ? `，${s.count} 条` : ''})`);
  }
  return out;
}







function parseTarget(target) {
  const s = String(target || '').trim();
  if (!s) return { error: 'target 不能为空' };
  const [head, ...rest] = s.split(':');
  const arg = rest.join(':').trim();
  const h = head.toLowerCase();
  if (h === 'effects' || h === 'fx' && !arg) return { kind: 'effects' };
  if (h === 'effect' || h === 'fx') {
    const key = FX_ALIAS.get(arg.toLowerCase());
    if (!key) return { error: `不认识的效果名「${arg}」；可用：${Object.keys(FX).map(k => `effect:${k}(${FX[k].name})`).join(' ')}` };
    return { kind: 'effect', fxKey: key };
  }
  if (h === 'adjustment' || h === 'adj') {
    if (!arg) return { kind: 'adjustment', adjKey: null };
    if (!ADJ[arg]) return { error: `不认识的调整层块「${arg}」；可用：${ADJ_KEYS.join(' ')}` };
    return { kind: 'adjustment', adjKey: arg };
  }
  
  const key = FX_ALIAS.get(s.toLowerCase());
  if (key) return { kind: 'effect', fxKey: key };
  return { error: `不认识的 target「${s}」；可用：'effects'、'effect:<效果名>'（${Object.keys(FX).join('/')}）、'adjustment'、'adjustment:<块 key>'（${ADJ_KEYS.join('/')}）` };
}




function resolvePath(root, path) {
  const segs = String(path).split('.');
  let node = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (node === null || typeof node !== 'object') return null;
    node = Array.isArray(node) ? node[Number(s)] : node[s];
  }
  if (node === null || typeof node !== 'object') return null;
  const last = segs[segs.length - 1];
  if (Array.isArray(node)) {
    const i = Number(last);
    if (!Number.isInteger(i) || i < 0 || i >= node.length) return null;
    return { parent: node, key: i, value: node[i] };
  }
  if (!Object.prototype.hasOwnProperty.call(node, last)) return null;
  return { parent: node, key: last, value: node[last] };
}


function parseHexColor(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const t = m[1];
  return t.length === 3
    ? [parseInt(t[0] + t[0], 16), parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16)]
    : [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
}











export function getLayerParams(buffer, index) {
  const ab = toAB(buffer);
  const doc = parsePsdDocument(ab);
  const layer = doc.layers[index];
  if (!layer) throw new RangeError(`getLayerParams：图层 ${index} 不存在（本文档 ${doc.layers.length} 个图层）`);
  const psb = !!doc.header.psb;
  const found = blocksOf(doc, index);
  const warnings = [];

  
  const effects = { present: !!(found.fx.length || found.legacyFx.length), blocks: [], legacy: found.legacy || found.legacyFx, targets: [] };
  for (const key of found.fx) {
    const probe = probeBlock(rawBlockOf(doc, ab, index, key), key, psb);
    if (!probe.ok) { effects.blocks.push({ key, ok: false, reason: probe.reason }); continue; }
    effects.blocks.push({ key, ok: true, byteLength: probe.raw.length });
    if (!effects.block) {
      effects.block = key;
      
      const top = enumFields(probe.root, key, 'descriptor')
        .filter(f => !f.path.includes('.') && !FX[f.path] && !Object.values(FX).some(s => s.multi === f.path));
      effects.targets.push({ target: 'effects', block: key, label: '图层样式（顶层）', fields: top });
      for (const fxKey of Object.keys(FX)) {
        const slot = effectSlot(probe.root, fxKey, 0);
        if (!slot || !slot.node) continue;
        for (let at = 0; at < slot.count; at++) {
          const s = effectSlot(probe.root, fxKey, at);
          if (!s || !s.node) continue;
          effects.targets.push({
            target: `effect:${fxKey}`, block: key, key: fxKey, name: FX[fxKey].name, label: FX[fxKey].label,
            at, count: s.count, multi: !!s.multi, slotKey: s.slotKey,
            fields: enumFields(s.node, key, 'descriptor'),
          });
        }
      }
    }
  }
  if (found.legacyFx.length) {
    effects.legacy = found.legacyFx.slice();
    warnings.push(`图层 ${index} 上还挂着一份老式 ${LEGACY_FX_KEY} 图层样式块（不是描述符结构）：` +
      `本模块只读写描述符型（${FX_BLOCK_KEYS.join('/')}），PS 与 ag-psd 也都优先读描述符型`);
  } else {
    effects.legacy = [];
  }

  
  const adjustment = { present: !!found.adjustment.length, blocks: [], targets: [] };
  const primary = pickAdjustment(found.adjustment);
  for (const key of found.adjustment) {
    const probe = probeBlock(rawBlockOf(doc, ab, index, key), key, psb);
    const meta = { key, kind: ADJ[key].kind, label: ADJ[key].label, primary: key === primary, ok: probe.ok };
    if (!probe.ok) { meta.reason = probe.reason; adjustment.blocks.push(meta); continue; }
    meta.byteLength = probe.raw.length;
    adjustment.blocks.push(meta);
    adjustment.targets.push({
      target: `adjustment:${key}`, block: key, kind: probe.kind, label: ADJ[key].label, primary: key === primary,
      fields: enumFields(probe.root, key, probe.kind),
    });
  }
  if (primary) adjustment.target = `adjustment:${primary}`;
  if (found.adjustment.length > 1) {
    warnings.push(`图层 ${index} 上有 ${found.adjustment.length} 个调整层块（${found.adjustment.join('/')}）：` +
      `'adjustment' 默认指向 ${primary}（PS 与 ag-psd 都以它为准），改另一个请写 'adjustment:<key>'`);
  }

  const out = {
    index,
    name: layer.unicodeName || layer.name || '',
    psb,
    effects,
    adjustment,
    warnings,
  };
  return out;
}





export function probeLayerParams(buffer, index) {
  const ab = toAB(buffer);
  const doc = parsePsdDocument(ab);
  if (!doc.layers[index]) throw new RangeError(`probeLayerParams：图层 ${index} 不存在`);
  const psb = !!doc.header.psb;
  const found = blocksOf(doc, index);
  const blocks = [];
  for (const key of [...found.fx, ...found.adjustment]) {
    const p = probeBlock(rawBlockOf(doc, ab, index, key), key, psb);
    blocks.push(p.ok ? { key, ok: true, byteLength: p.raw.length } : { key, ok: false, reason: p.reason });
  }
  return { index, blocks, legacy: found.legacyFx };
}



export function createParamOps(h) {

  

  




  function planWrite(root, blockKey, kind, path, raw, fieldList) {
    const hit = resolvePath(root, path);
    if (!hit) {
      return { error: `没有字段「${path}」`, unknown: true };
    }
    const shape = kind === 'descriptor' ? shapeOf(hit.value, hit.parent, hit.key) : binShapeOf(hit.value, blockKey, path);
    const spec = kind === 'descriptor' ? descSpec(blockKey, path, hit.key, hit.parent) : lookupBin(blockKey, path);

    
    if (shape.type === 'color') {
      const comps = COLOR_SPACES[shape.colorSpace].comps;
      const names = Object.keys(comps);
      let assign = null;
      const hexv = typeof raw === 'string' ? parseHexColor(raw) : null;
      if (hexv) {
        if (shape.colorSpace !== 'RGBC') return { error: `字段「${path}」是 ${shape.colorSpace} 颜色，不能用 '#rrggbb' 赋值，请用 { ${names.map(n => JSON.stringify(n)).join(', ')} }` };
        assign = { 'Rd  ': hexv[0], 'Grn ': hexv[1], 'Bl  ': hexv[2] };
      } else if (Array.isArray(raw)) {
        if (raw.length !== names.length) return { error: `字段「${path}」是 ${shape.colorSpace} 颜色，需要 ${names.length} 个分量（${names.join('/')}），收到 ${raw.length} 个` };
        assign = {}; names.forEach((n, i) => { assign[n] = raw[i]; });
      } else if (raw && typeof raw === 'object') {
        const short = { r: 'Rd  ', g: 'Grn ', b: 'Bl  ', red: 'Rd  ', green: 'Grn ', blue: 'Bl  ' };
        assign = {};
        for (const k of Object.keys(raw)) {
          const n = names.includes(k) ? k : (shape.colorSpace === 'RGBC' ? short[k] : null);
          if (!n) return { error: `字段「${path}」（${shape.colorSpace}）没有分量「${k}」；可用分量：${names.map(x => JSON.stringify(x)).join(' ')}` };
          assign[n] = raw[k];
        }
      } else {
        return { error: `字段「${path}」是 ${shape.colorSpace} 颜色，值必须是 '#rrggbb' / 数组 / 对象，收到 ${JSON.stringify(raw)}` };
      }
      const writes = [];
      for (const n of Object.keys(assign)) {
        const sub = planWrite(root, blockKey, kind, `${path}.${n}`, assign[n], fieldList);
        if (sub.error) return sub;
        writes.push(...sub.writes);
      }
      return { writes };
    }

    



    if (kind === 'descriptor' && (hit.key === 'TrnS' || hit.key === 'MpgS') && hit.value && typeof hit.value === 'object' && hit.value.__classID === 'ShpC') {
      const r = contourDescFrom(raw, hit.value);
      if (r.error) return { error: `字段「${path}」（等高线）：${r.error}` };
      return { writes: [{ path, parent: hit.parent, key: hit.key, shape: { type: 'replace' }, spec, value: r.desc }] };
    }
    if (!shape.leaf) return { error: `字段「${path}」是 ${shape.type}（不是一个可以直接赋值的标量），请写它下面某个具体字段的路径` };
    if (!shape.editable) return { error: `字段「${path}」是 ${shape.type} 类型，本模块不支持改写（只读）` };

    
    if (shape.type === 'bool') {
      if (typeof raw !== 'boolean') return { error: `字段「${path}」要布尔值，收到 ${JSON.stringify(raw)}` };
      return { writes: [{ path, parent: hit.parent, key: hit.key, shape, spec, value: raw }] };
    }
    if (shape.type === 'enum') {
      if (typeof raw !== 'string' || !raw.length) return { error: `字段「${path}」要枚举字符串（如 'Nrml'），收到 ${JSON.stringify(raw)}` };
      if (BLEND_FIELDS.has(hit.key) && !BLNM_VALUES.has(raw)) {
        return { error: `字段「${path}」是混合模式，「${raw}」不是 PS 认识的 BlnM 枚举值` +
          `（注意描述符里写的是 'Nrml'/'Mltp'，不是图层记录的 'norm'/'mul '）；可用：${[...BLNM_VALUES].join(' ')}` };
      }
      return { writes: [{ path, parent: hit.parent, key: hit.key, shape, spec, value: raw }] };
    }
    if (shape.type === 'TEXT') {
      if (typeof raw !== 'string') return { error: `字段「${path}」要字符串，收到 ${JSON.stringify(raw)}` };
      if (raw.length > 4096) return { error: `字段「${path}」的字符串太长（${raw.length} > 4096）` };
      return { writes: [{ path, parent: hit.parent, key: hit.key, shape, spec, value: raw }] };
    }
    
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { error: `字段「${path}」要有限数值，收到 ${JSON.stringify(raw)}` };
    }
    if (shape.integer && !Number.isInteger(raw)) {
      return { error: `字段「${path}」是整数类型（${shape.type}），收到 ${raw}` };
    }
    const lo = spec && spec.min !== undefined ? spec.min : defaultMin(shape);
    const hi = spec && spec.max !== undefined ? spec.max : defaultMax(shape);
    if (lo !== null && raw < lo || hi !== null && raw > hi) {
      return { error: `字段「${path}」${spec && spec.label ? `（${spec.label}）` : ''}的值 ${raw} 超出范围 ${lo}…${hi}` };
    }
    return { writes: [{ path, parent: hit.parent, key: hit.key, shape, spec, value: raw }] };
  }

  
  function defaultMin(shape) {
    switch (shape.type) {
      case 'UntF': return shape.unit === '#Prc' ? 0 : shape.unit === '#Ang' ? -360 : -1e9;
      case 'long': return -2147483648;
      case 'comp': return 0;
      case 'uint8': case 'uint16': case 'uint32': return 0;
      case 'int16': return -32768;
      default: return -1e9;
    }
  }
  function defaultMax(shape) {
    switch (shape.type) {
      case 'UntF': return shape.unit === '#Prc' ? 100 : shape.unit === '#Ang' ? 360 : 1e9;
      case 'long': return 2147483647;
      case 'comp': return Number.MAX_SAFE_INTEGER;
      case 'uint8': return 255;
      case 'uint16': return 65535;
      case 'uint32': return 4294967295;
      case 'int16': return 32767;
      default: return 1e9;
    }
  }

  
  function writeLeaf(w) {
    if (w.shape.type === 'UntF') { w.parent[w.key].value = w.value; return; }
    if (w.shape.type === 'enum') { w.parent[w.key].value = w.value; return; }
    w.parent[w.key] = w.value;
  }

  

  



  function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Uint8Array) return v.slice();
    if (Array.isArray(v)) {
      const out = v.map(deepClone);
      for (const k of Object.keys(v)) if (isMeta(k)) out[k] = deepClone(v[k]);
      return out;
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
    return out;
  }

  









  function rebuildArray(arr, track, plan) {
    const olds = arr.slice();
    const oldTrack = track.slice();
    const metaKeys = ['__long', '__doub', '__comp', '__explicit'].filter(m => arr[m]);
    const oldMeta = {};
    for (const m of metaKeys) oldMeta[m] = arr[m];

    const items = [], nextTrack = [];
    for (const p of plan) {
      if (p.kind === 'new') { items.push(p.elem); nextTrack.push({ kind: 'new', elem: p.elem }); }
      else { items.push(olds[p.from]); nextTrack.push(oldTrack[p.from]); }
    }
    arr.length = 0;
    for (const it of items) arr.push(it);
    for (const m of metaKeys) {
      const next = {};
      plan.forEach((p, j) => {
        const src = p.kind === 'new' ? p.tplFrom : p.from;
        if (oldMeta[m][src]) next[j] = true;
      });
      if (Object.keys(next).length) arr[m] = next; else delete arr[m];
    }
    return nextTrack;
  }

  
  function sortKeyValue(elem, key) {
    const v = elem && elem[key];
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.value === 'number') return v.value;
    return null;
  }

  
  function stopBrief(elem, spec) {
    const loc = sortKeyValue(elem, spec.sortKey);
    return loc === null ? '?' : String(loc);
  }

  






  function runArrayOps(loc, op, i) {
    const { blockKey, kind, node } = loc;
    const prefix = loc.prefix ? loc.prefix + '.' : '';
    const touched = new Map();      
    const inserted = [], removed = [], sorted = [], notes = [], warns = [];

    for (let n = 0; n < op.arrayOps.length; n++) {
      const a = op.arrayOps[n];
      const tag = `arrayOps[${n}]`;
      const hit = resolvePath(node, a.path);
      if (!hit) {
        throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 里没有数组「${a.path}」；` +
          `这个目标可增删的数组有：${listArrays(node, blockKey, kind)}`,
        { index: op.index, block: blockKey, field: a.path, arrays: arrayPaths(node, blockKey, kind) });
      }
      const spec = arraySpecOf(kind, blockKey, a.path, hit.value);
      if (!spec) {
        throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 的「${a.path}」不是可增删的数组` +
          `（改长度会让 PS 读出错误结构，只有渐变色标这类白名单数组能增删）；` +
          `这个目标可增删的数组有：${listArrays(node, blockKey, kind)}`,
        { index: op.index, block: blockKey, field: a.path, arrays: arrayPaths(node, blockKey, kind) });
      }
      const arr = hit.value;
      let rec = touched.get(a.path);
      if (!rec) {
        rec = { path: a.path, full: prefix + a.path, arr, spec, before: arr.length,
          track: arr.map((_, k) => ({ kind: 'old', from: k })) };
        touched.set(a.path, rec);
      }
      const len = arr.length;

      
      if (a.insertAt !== undefined) {
        const k = a.insertAt;
        if (!Number.isInteger(k) || k < 0 || k > len) {
          throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 的 insertAt=${JSON.stringify(a.insertAt)} 越界，` +
            `「${a.path}」（${spec.label}）现在有 ${len} 个元素，insertAt 的合法范围是 0…${len}（${len} = 追加到末尾）`,
          { index: op.index, field: a.path, length: len, range: [0, len] });
        }
        if (len + 1 > spec.max) {
          throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 插入之后「${a.path}」会有 ${len + 1} 个${spec.label}，` +
            `超过本模块允许的上限 ${spec.max} 个`, { index: op.index, field: a.path, max: spec.max });
        }
        const tpl = a.copyFrom === undefined ? Math.min(k, len - 1) : a.copyFrom;
        if (!Number.isInteger(tpl) || tpl < 0 || tpl >= len) {
          throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 的 copyFrom=${JSON.stringify(a.copyFrom)} 越界，` +
            `「${a.path}」现在有 ${len} 个元素，copyFrom 的合法范围是 0…${len - 1}`,
          { index: op.index, field: a.path, length: len, range: [0, len - 1] });
        }
        const vals = a.value === undefined ? {} : a.value;
        if (vals === null || typeof vals !== 'object' || Array.isArray(vals)) {
          throw h.opFail(i, op, `${tag} 的 value 必须是对象 { 元素内字段: 新值 }，收到 ${JSON.stringify(a.value)}`, { index: op.index });
        }
        
        const elem = deepClone(arr[tpl]);
        const plan = [];
        for (let j = 0; j < len; j++) { if (j === k) plan.push({ kind: 'new', elem, tplFrom: tpl }); plan.push({ kind: 'old', from: j }); }
        if (k === len) plan.push({ kind: 'new', elem, tplFrom: tpl });
        rec.track = rebuildArray(arr, rec.track, plan);
        for (const key of Object.keys(vals)) {
          const r = planWrite(node, blockKey, kind, `${a.path}.${k}.${key}`, vals[key]);
          if (r.error) {
            throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 新元素的 ${r.error.replace(`${a.path}.${k}.`, '')}`,
              { index: op.index, block: blockKey, field: `${a.path}.${k}.${key}` });
          }
          for (const w of r.writes) writeLeaf(w);
        }
        inserted.push({ path: a.path, at: k, copyFrom: tpl });
        notes.push(`${a.path} 第 ${k} 位插入 1 个${spec.label}（拷贝第 ${tpl} 个为模板，${spec.sortKey}=${stopBrief(elem, spec)}）`);
        if (a.value === undefined || vals[spec.sortKey] === undefined) {
          warns.push(`图层 ${op.index} 的 ${a.path} 新插入的${spec.label}没有指定 ${spec.sortKey}，` +
            `与模板（第 ${tpl} 个）位置相同（${stopBrief(elem, spec)}）；两个位置一样的色标 PS 里会重叠`);
        }
        continue;
      }

      
      if (a.removeAt !== undefined) {
        const k = a.removeAt;
        if (!Number.isInteger(k) || k < 0 || k >= len) {
          throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 的 removeAt=${JSON.stringify(a.removeAt)} 越界，` +
            `「${a.path}」（${spec.label}）现在有 ${len} 个元素，removeAt 的合法范围是 0…${len - 1}`,
          { index: op.index, field: a.path, length: len, range: [0, len - 1] });
        }
        if (len - 1 < spec.min) {
          throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 删不得 ——「${a.path}」只剩 ${len} 个${spec.label}，` +
            `删掉就只有 ${len - 1} 个了，渐变至少要有 ${spec.min} 个${spec.label}（PS 打开会报错或自己补一个）`,
          { index: op.index, field: a.path, length: len, min: spec.min });
        }
        const gone = arr[k];
        const plan = [];
        for (let j = 0; j < len; j++) if (j !== k) plan.push({ kind: 'old', from: j });
        rec.track = rebuildArray(arr, rec.track, plan);
        removed.push({ path: a.path, at: k });
        notes.push(`${a.path} 删掉第 ${k} 个${spec.label}（${spec.sortKey}=${stopBrief(gone, spec)}）`);
        continue;
      }

      
      const sortBy = a.sortBy === true ? spec.sortKey : a.sortBy;
      if (sortBy !== undefined) {
        if (typeof sortBy !== 'string' || !sortBy.length) {
          throw h.opFail(i, op, `${tag} 的 sortBy 必须是元素里的字段名（如 '${spec.sortKey}'）或 true`, { index: op.index });
        }
        const idx = arr.map((_, j) => j);
        for (const j of idx) {
          if (sortKeyValue(arr[j], sortBy) === null) {
            throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${tag} 按「${sortBy}」排序不了 —— ` +
              `「${a.path}」第 ${j} 个元素里没有数值字段「${sortBy}」（这类元素能排序的字段一般是 '${spec.sortKey}'）`,
            { index: op.index, field: a.path, sortBy });
          }
        }
        idx.sort((x, y) => sortKeyValue(arr[x], sortBy) - sortKeyValue(arr[y], sortBy) || x - y);
        rec.track = rebuildArray(arr, rec.track, idx.map(j => ({ kind: 'old', from: j })));
        sorted.push({ path: a.path, sortBy, order: idx.slice() });
        notes.push(`${a.path} 按 ${sortBy} 升序重排（新顺序 = 原下标 [${idx.join(',')}]）`);
        continue;
      }

      throw h.opFail(i, op, `${tag} 没有给出要做什么：insertAt / removeAt / sortBy 三选一（收到 ${JSON.stringify(Object.keys(a))}）`,
        { index: op.index });
    }

    
    for (const t of touched.values()) {
      if (t.arr.length < t.spec.min) {
        throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：这一串 arrayOps 做完之后「${t.path}」只剩 ${t.arr.length} 个${t.spec.label}，` +
          `至少要有 ${t.spec.min} 个`, { index: op.index, field: t.path, min: t.spec.min });
      }
      if (t.arr.length > t.spec.max) {
        throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：这一串 arrayOps 做完之后「${t.path}」有 ${t.arr.length} 个${t.spec.label}，` +
          `超过上限 ${t.spec.max}`, { index: op.index, field: t.path, max: t.spec.max });
      }
    }
    return { touched: [...touched.values()], inserted, removed, sorted, notes, warns };
  }

  










  function realignTail(model, blockKey, psb) {
    const old = model && model._tail;
    if (!(old instanceof Uint8Array) || !old.every(b => b === 0)) return null;
    const round = psb || h.PAD4_BLOCK_KEYS.has(blockKey) ? 4 : 2;
    try {
      model._tail = new Uint8Array(0);
      const len = writeAdditionalBlock(blockKey, model, { psb }).length;
      model._tail = new Uint8Array((round - (len % round)) % round);
    } catch {
      model._tail = old;                         
      return null;
    }
    return { before: old.length, after: model._tail.length };
  }

  
  function arrayPaths(node, blockKey, kind) {
    return enumFields(node, blockKey, kind).filter(f => f.arrayEditable).map(f => f.path);
  }
  function listArrays(node, blockKey, kind) {
    const list = arrayPaths(node, blockKey, kind);
    return list.length ? list.map(p => JSON.stringify(p)).join(' ') : '一个都没有（这个目标里没有可增删的数组）';
  }

  
  const inArrayPath = (k, full) => k === `${full}#len` || k.startsWith(`${full}.`);

  







  function buildExpectedSnapshot(snapBefore, touched, overlay) {
    const out = {};
    for (const k of Object.keys(snapBefore)) {
      if (!touched.some(t => inArrayPath(k, t.full))) out[k] = snapBefore[k];
    }
    for (const t of touched) {
      out[`${t.full}#len`] = 'n:' + t.track.length;
      t.track.forEach((s, j) => {
        const to = `${t.full}.${j}`;
        if (s.kind === 'new') { flatten(s.elem, to, out); return; }
        const from = `${t.full}.${s.from}`;
        for (const k of Object.keys(snapBefore)) {
          if (k === from || (k.startsWith(from) && (k[from.length] === '.' || k[from.length] === '#'))) {
            out[to + k.slice(from.length)] = snapBefore[k];
          }
        }
      });
    }
    for (const k of Object.keys(overlay)) out[k] = overlay[k];
    return out;
  }

  
  function expectedNumber(w) {
    return w.shape.type === 'float32' ? Math.fround(w.value) : w.value;
  }

  
  function expectedSnapValue(w, kind) {
    const v = expectedNumber(w);
    switch (w.shape.type) {
      case 'UntF': return `UntF ${w.shape.unit}:${numStr(v)}`;
      case 'enum': return `enum ${w.shape.enumType}.${w.value}`;
      case 'bool': return 'bool:' + w.value;
      case 'TEXT': return 'TEXT:' + w.value;
      case 'long': return 'long:' + numStr(v);
      case 'comp': return 'comp:' + numStr(v);
      case 'doub': return 'doub:' + numStr(v);
      default: return (kind === 'descriptor' ? 'num:' : 'num:') + numStr(v);
    }
  }

  

  



  function locate(ab, op, i, tgt, at) {
    const doc = parsePsdDocument(ab);
    if (!doc.layers[op.index]) throw h.opFail(i, op, `图层 ${op.index} 不存在`);
    const psb = !!doc.header.psb;
    const found = blocksOf(doc, op.index);

    if (tgt.kind === 'effects' || tgt.kind === 'effect') {
      if (!found.fx.length) {
        if (found.legacyFx.length) {
          throw h.opFail(i, op, `图层 ${op.index} 只有老式的 ${LEGACY_FX_KEY} 图层样式块（不是描述符结构），` +
            `本 op 只支持描述符型（${FX_BLOCK_KEYS.join('/')}），拒绝改写`, { index: op.index, blocks: found.legacyFx });
        }
        throw h.opFail(i, op, `图层 ${op.index} 没有图层样式块（找不到 ${FX_BLOCK_KEYS.join('/')}），没有可以改的图层样式参数`, { index: op.index });
      }
      const blockKey = found.fx[0];
      const probe = probeBlock(rawBlockOf(doc, ab, op.index, blockKey), blockKey, psb);
      if (!probe.ok) {
        throw h.opFail(i, op, `图层 ${op.index} 的参数块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${probe.reason}`,
          { index: op.index, block: blockKey, reason: probe.reason, offset: probe.offset });
      }
      if (tgt.kind === 'effects') {
        return { blockKey, kind: 'descriptor', probe, root: probe.root, node: probe.root, prefix: '', label: '图层样式（顶层）', legacy: found.legacyFx, siblings: found.fx.slice(1) };
      }
      const slot = effectSlot(probe.root, tgt.fxKey, at);
      if (!slot || slot.error || !slot.node) {
        const have = presentEffects(probe.root);
        throw h.opFail(i, op,
          (slot && slot.error) ||
          `图层样式里没有「${FX[tgt.fxKey].label}」(effect:${tgt.fxKey}/${FX[tgt.fxKey].name})；这一层实际有的效果：${have.length ? have.join('、') : '一个都没有'}`,
          { index: op.index, block: blockKey, available: have });
      }
      return {
        blockKey, kind: 'descriptor', probe, root: probe.root, node: slot.node, prefix: slot.prefix,
        label: `${FX[tgt.fxKey].label}${slot.multi ? `（第 ${at + 1} 条）` : ''}`,
        legacy: found.legacyFx, siblings: found.fx.slice(1),
      };
    }

    
    if (!found.adjustment.length) {
      throw h.opFail(i, op, `图层 ${op.index} 不是调整图层（找不到任何调整层块：${ADJ_KEYS.join('/')}）`, { index: op.index });
    }
    let blockKey = tgt.adjKey;
    if (blockKey && !found.adjustment.includes(blockKey)) {
      throw h.opFail(i, op, `图层 ${op.index} 上没有 ${blockKey} 块；这一层实际有的调整层块：${found.adjustment.map(k => `adjustment:${k}(${ADJ[k].label})`).join('、')}`,
        { index: op.index, available: found.adjustment });
    }
    if (!blockKey) blockKey = pickAdjustment(found.adjustment);
    const probe = probeBlock(rawBlockOf(doc, ab, op.index, blockKey), blockKey, psb);
    if (!probe.ok) {
      throw h.opFail(i, op, `图层 ${op.index} 的参数块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${probe.reason}`,
        { index: op.index, block: blockKey, reason: probe.reason, offset: probe.offset });
    }
    return {
      blockKey, kind: probe.kind, probe, root: probe.root, node: probe.root, prefix: '',
      label: ADJ[blockKey].label, legacy: [],
      siblings: found.adjustment.filter(k => k !== blockKey),
    };
  }

  

  function applyParams(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const tgt = plan.tgt;
    const at = plan.at;
    const loc = locate(ab, op, i, tgt, at);
    const { blockKey, kind, probe } = loc;

    
    const snapBefore = flatten(probe.root, '', {});
    const prefix = loc.prefix ? loc.prefix + '.' : '';

    
    const arrRes = op.arrayOps && op.arrayOps.length
      ? runArrayOps(loc, op, i)
      : { touched: [], inserted: [], removed: [], sorted: [], notes: [], warns: [] };

    
    const fieldList = enumFields(loc.node, blockKey, kind);
    const editable = fieldList.filter(f => f.editable).map(f => f.path);
    const writes = [];
    const seen = new Set();
    for (const key of Object.keys(op.values || {})) {
      const r = planWrite(loc.node, blockKey, kind, key, op.values[key], fieldList);
      if (r.error) {
        throw h.opFail(i, op,
          `图层 ${op.index} 的「${loc.label}」：${r.error}` +
          (r.unknown ? `；这个目标实际可改的字段有 ${editable.length} 个：${listFields(editable)}` : ''),
          { index: op.index, block: blockKey, target: op.target, field: key, available: editable });
      }
      for (const w of r.writes) {
        if (seen.has(w.path)) throw h.opFail(i, op, `字段「${w.path}」在这一次 values 里被赋值了不止一次`, { index: op.index, field: w.path });
        seen.add(w.path);
        writes.push(w);
      }
    }
    if (!writes.length && !arrRes.touched.length) throw h.opFail(i, op, 'values 里没有任何要改的字段', { index: op.index });

    const before = {};
    const expect = {};
    for (const w of writes) {
      const full = prefix + w.path;
      if (w.shape.type === 'replace') {          
        const fresh = flatten(w.value, full, {});
        for (const k of Object.keys(snapBefore)) if (k === full || k.startsWith(full + '.') || k.startsWith(full + '#')) { before[k] = snapBefore[k]; if (!(k in fresh)) expect[k] = undefined; }
        for (const k of Object.keys(fresh)) { before[k] = snapBefore[k]; expect[k] = fresh[k]; }
        continue;
      }
      before[full] = snapBefore[full];
      expect[full] = expectedSnapValue(w, kind);
    }

    
    for (const w of writes) writeLeaf(w);
    if (arrRes.touched.length) {
      const tail = realignTail(probe.model, blockKey, !!state.psb);
      
      
      if (tail && probe.root === probe.model) expect[prefix + '_tail'] = `bytes:${tail.after}:0`;
    }
    let data;
    try {
      data = writeAdditionalBlock(blockKey, probe.model, { psb: !!state.psb });
    } catch (e) {
      throw h.opFail(i, op, `改完之后 ${blockKey} 块无法重新序列化（${e && e.message}），拒绝写回`, { index: op.index, block: blockKey });
    }
    const lenChanged = data.length !== probe.raw.length;
    const out = h.upsertLayerBlock(ab, op.index, blockKey, data);

    
    const doc2 = parsePsdDocument(out);
    const raw2 = rawBlockOf(doc2, out, op.index, blockKey);
    if (!raw2) throw h.opFail(i, op, `写回之后在图层 ${op.index} 上找不到 ${blockKey} 块了，拒绝返回文件`, { index: op.index, block: blockKey });
    const probe2 = probeBlock(raw2, blockKey, !!state.psb);
    if (!probe2.ok) throw h.opFail(i, op, `写回 ${blockKey} 之后重新探测不过（${probe2.reason}），拒绝返回文件`, { index: op.index, block: blockKey });

    const snapAfter = flatten(probe2.root, '', {});
    let wantPaths;

    


    if (arrRes.touched.length) {
      for (const t of arrRes.touched) {
        const now = resolvePath(probe2.root, t.full);
        if (!now || !Array.isArray(now.value)) {
          throw h.opFail(i, op, `写回 ${blockKey} 之后「${t.full}」不再是数组了，拒绝返回文件`,
            { index: op.index, block: blockKey, field: t.full });
        }
        if (now.value.length !== t.track.length) {
          throw h.opFail(i, op,
            `写回 ${blockKey} 之后「${t.full}」有 ${now.value.length} 个${t.spec.label}，` +
            `不是预期的 ${t.track.length} 个（原来 ${t.before} 个），拒绝返回文件`,
            { index: op.index, block: blockKey, field: t.full, expected: t.track.length, actual: now.value.length });
        }
        t.track.forEach((s, j) => {
          if (s.kind === 'new') return;                    
          const from = `${t.full}.${s.from}`, to = `${t.full}.${j}`;
          for (const k of Object.keys(snapBefore)) {
            if (k !== from && !(k.startsWith(from) && (k[from.length] === '.' || k[from.length] === '#'))) continue;
            const nk = to + k.slice(from.length);
            if (expect[nk] !== undefined) continue;        
            if (snapAfter[nk] !== snapBefore[k]) {
              throw h.opFail(i, op,
                `写回 ${blockKey} 之后没被点名的${t.spec.label}变了：原第 ${s.from} 个（现在第 ${j} 个）的「${nk}」` +
                `从 ${snapBefore[k]} 变成了 ${snapAfter[nk]}，拒绝返回文件`,
                { index: op.index, block: blockKey, field: nk });
            }
          }
        });
      }
      const expectSnap = buildExpectedSnapshot(snapBefore, arrRes.touched, expect);
      const bad = snapshotDiff(expectSnap, snapAfter);
      if (bad.length) {
        throw h.opFail(i, op,
          `写回 ${blockKey} 之后参数树与预期不符（${bad.length} 处），拒绝返回文件：` +
          bad.slice(0, 8).map(d => `${d.path} 预期 ${d.before === undefined ? '（不该有这一项）' : d.before}` +
            ` 实际 ${d.after === undefined ? '（这一项没了）' : d.after}`).join('；'),
          { index: op.index, block: blockKey, mismatch: bad.slice(0, 32) });
      }
      wantPaths = snapshotDiff(snapBefore, snapAfter).map(d => d.path);
      return finish();
    }

    const diffs = snapshotDiff(snapBefore, snapAfter);
    wantPaths = Object.keys(expect).filter(p => expect[p] !== before[p]).sort();
    const gotPaths = diffs.map(d => d.path).sort();
    if (wantPaths.join('\u0000') !== gotPaths.join('\u0000')) {
      const extra = gotPaths.filter(p => !wantPaths.includes(p));
      const missing = wantPaths.filter(p => !gotPaths.includes(p));
      throw h.opFail(i, op,
        `写回 ${blockKey} 之后参数树的变化与预期不符，拒绝返回文件：` +
        (extra.length ? `多变了 ${extra.length} 个字段（${extra.slice(0, 8).map(p => `${p}: ${snapBefore[p]} → ${snapAfter[p]}`).join('；')}）` : '') +
        (extra.length && missing.length ? '；' : '') +
        (missing.length ? `该变却没变 ${missing.length} 个字段（${missing.slice(0, 8).join('、')}）` : ''),
        { index: op.index, block: blockKey, extra, missing });
    }
    for (const p of wantPaths) {
      if (snapAfter[p] !== expect[p]) {
        throw h.opFail(i, op,
          `写回 ${blockKey} 之后字段「${p}」是 ${snapAfter[p]}，不是预期的 ${expect[p]}（类型标记或数值没有按原样保持），拒绝返回文件`,
          { index: op.index, block: blockKey, field: p });
      }
    }
    
    if (!lenChanged) {
      if (raw2.length !== probe.raw.length) {
        throw h.opFail(i, op, `写回 ${blockKey} 之后块长度从 ${probe.raw.length} 变成了 ${raw2.length}（等长改写不该变），拒绝返回文件`, { index: op.index, block: blockKey });
      }
      let runs = 0, inRun = false;
      for (let k = 0; k < raw2.length; k++) {
        const d = raw2[k] !== probe.raw[k];
        if (d && !inRun) runs++;
        inRun = d;
      }
      if (runs > writes.length * 2 + 2) {
        throw h.opFail(i, op,
          `写回 ${blockKey} 之后块内有 ${runs} 段字节变化，远多于本次要改的 ${writes.length} 个字段，说明重建改动了别的东西，拒绝返回文件`,
          { index: op.index, block: blockKey, runs });
      }
    }

    return finish();

    
    function finish() {
      
      if (loc.legacy.length) {
        warnings.push(`图层 ${op.index} 旁边还挂着一份老式 ${loc.legacy.join('/')} 块，本次没有同步改写` +
          `（PS 与 ag-psd 都优先读 ${blockKey}，只有很老的读取器才会看它）`);
      }
      if (loc.siblings.length) {
        warnings.push(`图层 ${op.index} 上还有 ${loc.siblings.join('/')} 块没有跟着改` +
          `（PS 与 ag-psd 以 ${blockKey} 为准；要一起改请再下一条 op，target 写 'adjustment:${loc.siblings[0]}'）`);
      }
      
      
      if (blockKey === 'curv' && probe.model.extraSig && writes.some(w => w.path.startsWith('channels.') !== w.path.startsWith('extra.'))) {
        const onlyOne = writes.every(w => w.path.startsWith('channels.')) || writes.every(w => w.path.startsWith('extra.'));
        if (onlyOne) {
          warnings.push(`图层 ${op.index} 的 curv 块里 channels 与 'Crv ' 扩展段（extra）是同一批曲线的两份副本，` +
            `本次只改了其中一份；不同读取器读到的曲线会不一致，建议同一条 op 里把 channels.* 与 extra.* 一起改`);
        }
      }
      if (lenChanged) {
        warnings.push(`图层 ${op.index} 的 ${blockKey} 块长度从 ${probe.raw.length} 变成了 ${data.length} 字节` +
          `（改了变长字段${arrRes.touched.length ? ' / 数组增删' : ''}），已通过 upsertLayerBlock 同步三级长度字段`);
      }
      for (const w of arrRes.warns) warnings.push(w);

      

      const arrays = arrRes.touched.map(t => ({
        path: t.full, label: t.spec.label, before: t.before, after: t.track.length,
        inserted: arrRes.inserted.filter(x => x.path === t.path).map(x => x.at),
        removed: arrRes.removed.filter(x => x.path === t.path).map(x => x.at),
        sorted: arrRes.sorted.some(x => x.path === t.path),
      }));
      const valuePaths = Object.keys(expect).filter(p => expect[p] !== before[p]).sort();
      const one = p => `${p}: ${before[p] === undefined ? '（新元素）' : before[p]} → ${snapAfter[p]}`;
      const changes = [
        ...arrays.map(a => `${a.path}#len: n:${a.before} → n:${a.after}`),
        ...valuePaths.map(one),
      ];
      const fields = [...arrays.map(a => `${a.path}#len`), ...valuePaths];
      const head = arrRes.notes.join('；');
      const tail = valuePaths.length ? `${blockKey}·${valuePaths.map(one).join('；')}` : '';
      return {
        buffer: out,
        result: {
          changed: !!(wantPaths.length || arrRes.touched.length),
          note: (head || tail)
            ? `${plan.note}（${[head, tail].filter(Boolean).join(' | ')}）`
            : `${plan.note} —— 给的值与原值相同，文件字节未变`,
          block: blockKey,
          fields,
          changes,
          ...(arrays.length ? { arrays } : {}),
        },
      };
    }
  }

  
  function listFields(list) {
    if (list.length <= 40) return list.map(p => JSON.stringify(p)).join(' ');
    return list.slice(0, 40).map(p => JSON.stringify(p)).join(' ') + ` …（共 ${list.length} 个）`;
  }

  

  function validateParams(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    const tgt = parseTarget(op.target);
    if (tgt.error) throw h.opFail(i, op, tgt.error, { target: op.target });
    const at = op.at === undefined ? 0 : op.at;
    if (!Number.isInteger(at) || at < 0)
      throw h.opFail(i, op, `at 必须是 ≥0 的整数（多重效果里改第几条，默认 0），收到 ${JSON.stringify(op.at)}`);
    
    const hasArrayOps = op.arrayOps !== undefined && op.arrayOps !== null;
    if (hasArrayOps) {
      if (!Array.isArray(op.arrayOps))
        throw h.opFail(i, op, `arrayOps 必须是数组 [{ path, insertAt|removeAt|sortBy, … }]，收到 ${JSON.stringify(op.arrayOps)}`);
      if (!op.arrayOps.length) throw h.opFail(i, op, 'arrayOps 是空数组：没有给出任何要做的数组增删');
      if (op.arrayOps.length > 64) throw h.opFail(i, op, `一次最多 64 条 arrayOps，收到 ${op.arrayOps.length} 条`);
      op.arrayOps.forEach((a, n) => {
        if (!a || typeof a !== 'object' || Array.isArray(a))
          throw h.opFail(i, op, `arrayOps[${n}] 必须是对象 { path, insertAt|removeAt|sortBy, … }，收到 ${JSON.stringify(a)}`);
        if (typeof a.path !== 'string' || !a.path.length)
          throw h.opFail(i, op, `arrayOps[${n}].path 必须是数组字段的路径（如 'Grad.Clrs'），收到 ${JSON.stringify(a.path)}`);
        const kinds = ['insertAt', 'removeAt', 'sortBy'].filter(k => a[k] !== undefined);
        if (kinds.length !== 1)
          throw h.opFail(i, op, `arrayOps[${n}] 要且只要 insertAt / removeAt / sortBy 三者之一，` +
            `收到 ${kinds.length ? kinds.join(' + ') : '一个都没有'}（这一条是 ${JSON.stringify(a)}）`);
        if (a.value !== undefined && (a.value === null || typeof a.value !== 'object' || Array.isArray(a.value)))
          throw h.opFail(i, op, `arrayOps[${n}].value 必须是对象 { 元素内字段: 新值 }，收到 ${JSON.stringify(a.value)}`);
        if (a.value !== undefined && a.insertAt === undefined)
          throw h.opFail(i, op, `arrayOps[${n}].value 只在 insertAt（插入新元素）时有意义；要改已有元素的字段请写在 values 里`);
        if (a.copyFrom !== undefined && a.insertAt === undefined)
          throw h.opFail(i, op, `arrayOps[${n}].copyFrom 只在 insertAt（插入新元素）时有意义`);
      });
    }
    const values = op.values === undefined && hasArrayOps ? {} : op.values;
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw h.opFail(i, op, `values 必须是对象 { 字段路径: 新值 }，收到 ${JSON.stringify(op.values)}`);
    const keys = Object.keys(values);
    if (!keys.length && !hasArrayOps) throw h.opFail(i, op, 'values 是空对象：没有给出任何要改的字段');
    if (keys.length > 256) throw h.opFail(i, op, `一次最多改 256 个字段，收到 ${keys.length} 个`);
    
    
    const ab = state && (state.__ab || state.buffer);
    if (ab instanceof ArrayBuffer) {
      const loc = locate(ab, op, i, tgt, at);
      if (hasArrayOps) runArrayOps(loc, op, i);
      const fieldList = enumFields(loc.node, loc.blockKey, loc.kind);
      const editable = fieldList.filter(f => f.editable).map(f => f.path);
      for (const k of keys) {
        const r = planWrite(loc.node, loc.blockKey, loc.kind, k, values[k], fieldList);
        if (r.error) throw h.opFail(i, op, `图层 ${op.index} 的「${loc.label}」：${r.error}` +
          (r.unknown ? `；这个目标实际可改的字段有 ${editable.length} 个：${listFields(editable)}` : ''),
        { index: op.index, target: op.target, field: k, available: editable });
      }
    }
    const label = tgt.kind === 'effect' ? `「${FX[tgt.fxKey].label}」` : tgt.kind === 'effects' ? '图层样式顶层' : '调整图层参数';
    const arrayNote = hasArrayOps
      ? op.arrayOps.map(a => a.insertAt !== undefined ? `${a.path} 第 ${a.insertAt} 位插入`
        : a.removeAt !== undefined ? `${a.path} 删掉第 ${a.removeAt} 个`
          : `${a.path} 按 ${a.sortBy === true ? '默认键' : a.sortBy} 重排`).join('、')
      : '';
    const what = [hasArrayOps ? arrayNote : '', keys.length ? `改 ${keys.length} 个字段` : ''].filter(Boolean).join('，');
    return {
      affected: [op.index],
      changed: [
        ...(hasArrayOps ? op.arrayOps.map(a => `${op.target}.${a.path}#len`) : []),
        ...keys.map(k => `${op.target}.${k}`),
      ],
      opIndex: i, tgt, at,
      note: `图层 ${op.index}「${layer.name}」${label}${tgt.kind === 'effect' && at ? `第 ${at + 1} 条` : ''} → ${what}`,
    };
  }

  return {
    setLayerParams: { validate: validateParams, apply: applyParams, structural: true },
  };
}




export const PARAM_EFFECTS = FX;

export const PARAM_ADJUSTMENTS = ADJ;

export const PARAM_COLOR_SPACES = COLOR_SPACES;

export default { createParamOps, getLayerParams, probeLayerParams, PARAM_EFFECTS, PARAM_ADJUSTMENTS };
