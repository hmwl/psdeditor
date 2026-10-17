

















import { decodeGalleryDescriptor } from './filter-gallery-spec.js';

const P = (key, ps, type, extra) => ({ key, ps, type, ...(extra || {}) });
export const SMART_FILTERS = {
  gaussianBlur:  { cls: 'GsnB', label: '高斯模糊...', params: [P('radius', 'Rds ', 'px')] },
  boxBlur:       { cls: 'boxblur', label: '方框模糊...', params: [P('radius', 'Rds ', 'px')] },
  blur:          { cls: 'Blr ', label: '模糊', params: [] },
  blurMore:      { cls: 'BlrM', label: '进一步模糊', params: [] },
  motionBlur:    { cls: 'MtnB', label: '动感模糊...', params: [P('angle', 'Angl', 'long'), P('distance', 'Dstn', 'px')] },
  radialBlur:    { cls: 'RdlB', label: '径向模糊...', params: [P('amount', 'Amnt', 'long'), P('method', 'BlrM', 'enum', { enumType: 'BlrM', map: { spin: 'Spn ', zoom: 'Zm  ' } })],
                   fixed: { BlrQ: { __enumType: 'BlrQ', value: 'Gd  ' } } },
  unsharpMask:   { cls: 'UnsM', label: 'USM 锐化...', params: [P('amount', 'Amnt', 'prc'), P('radius', 'Rds ', 'px'), P('threshold', 'Thsh', 'long')] },
  sharpen:       { cls: 'Shrp', label: '锐化', params: [] },
  sharpenMore:   { cls: 'ShrM', label: '进一步锐化', params: [] },
  sharpenEdges:  { cls: 'ShrE', label: '锐化边缘', params: [] },
  addNoise:      { cls: 'AdNs', label: '添加杂色...', params: [P('distribution', 'Dstr', 'enum', { enumType: 'Dstr', map: { uniform: 'Unfr', gaussian: 'Gsn ' } }),
                   P('amount', 'Nose', 'prc'), P('monochromatic', 'Mnch', 'bool'), P('seed', 'FlRs', 'long')] },
  median:        { cls: 'Mdn ', label: '中间值...', params: [P('radius', 'Rds ', 'px')] },
  despeckle:     { cls: 'Dspc', label: '去斑', params: [] },
  dustScratches: { cls: 'DstS', label: '蒙尘与划痕...', params: [P('radius', 'Rds ', 'long'), P('threshold', 'Thsh', 'long')] },
  highPass:      { cls: 'HghP', label: '高反差保留...', params: [P('radius', 'Rds ', 'px')] },
  mosaic:        { cls: 'Msc ', label: '马赛克...', params: [P('cell', 'ClSz', 'px')] },
  findEdges:     { cls: 'FndE', label: '查找边缘', params: [] },
  solarize:      { cls: 'Slrz', label: '曝光过度', params: [] },
  emboss:        { cls: 'Embs', label: '浮雕效果...', params: [P('angle', 'Angl', 'long'), P('height', 'Hght', 'long'), P('amount', 'Amnt', 'long')] },
  maximum:       { cls: 'Mxm ', label: '最大值...', params: [P('radius', 'Rds ', 'px')] },
  minimum:       { cls: 'Mnm ', label: '最小值...', params: [P('radius', 'Rds ', 'px')] },
  twirl:         { cls: 'Twrl', label: '旋转扭曲...', params: [P('angle', 'Angl', 'long')] },
  pinch:         { cls: 'Pnch', label: '挤压...', params: [P('amount', 'Amnt', 'long')] },
  spherize:      { cls: 'Sphr', label: '球面化...', params: [P('amount', 'Amnt', 'long'), P('mode', 'SphM', 'enum', { enumType: 'SphM', map: { normal: 'Nrml', horizontal: 'HrzO', vertical: 'VrtO' } })] },
  


  cameraRaw:     { cls: 'psd_editorCameraRaw', label: 'Camera Raw 滤镜...', psd_editorOnly: true,
                   params: ['temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'texture', 'clarity', 'dehaze', 'vibrance', 'saturation'].map(k => P(k, k, 'dbl')) },
  lensCorrection: { cls: 'psd_editorLensCorrection', label: '镜头校正...', psd_editorOnly: true,
                   params: [...['distortion', 'caRed', 'caBlue', 'vignette', 'midpoint', 'vertical', 'horizontal', 'angle', 'scale'].map(k => P(k, k, 'dbl')), P('edge', 'edge', 'text')] },
  liquify:       { cls: 'psd_editorLiquify', label: '液化...', psd_editorOnly: true, params: [P('mesh', 'mesh', 'data')] },
};
export const SMART_FILTER_BY_CLS = Object.fromEntries(Object.entries(SMART_FILTERS).map(([k, v]) => [v.cls, k]));
const DEFORM_CLS = new Set(['perspectiveWarpTransform', 'rigidTransform']);



export const BLEND_MODES = [
  { key: 'norm', ps: 'Nrml', ids: ['Nrml', 'normal'], label: '正常' },
  { key: 'diss', ps: 'Dslv', ids: ['Dslv', 'dissolve'], label: '溶解' },
  { key: 'dark', ps: 'Drkn', ids: ['Drkn', 'darken'], label: '变暗' },
  { key: 'mul ', ps: 'Mltp', ids: ['Mltp', 'multiply'], label: '正片叠底' },
  { key: 'idiv', ps: 'CBrn', ids: ['CBrn', 'colorBurn'], label: '颜色加深' },
  { key: 'lbrn', ps: 'linearBurn', ids: ['linearBurn'], label: '线性加深' },
  { key: 'dkCl', ps: 'darkerColor', ids: ['darkerColor'], label: '深色' },
  { key: 'lite', ps: 'Lghn', ids: ['Lghn', 'lighten'], label: '变亮' },
  { key: 'scrn', ps: 'Scrn', ids: ['Scrn', 'screen'], label: '滤色' },
  { key: 'div ', ps: 'CDdg', ids: ['CDdg', 'colorDodge'], label: '颜色减淡' },
  { key: 'lddg', ps: 'linearDodge', ids: ['linearDodge'], label: '线性减淡（添加）' },
  { key: 'lgCl', ps: 'lighterColor', ids: ['lighterColor'], label: '浅色' },
  { key: 'over', ps: 'Ovrl', ids: ['Ovrl', 'overlay'], label: '叠加' },
  { key: 'sLit', ps: 'SftL', ids: ['SftL', 'softLight'], label: '柔光' },
  { key: 'hLit', ps: 'HrdL', ids: ['HrdL', 'hardLight'], label: '强光' },
  { key: 'vLit', ps: 'vividLight', ids: ['vividLight'], label: '亮光' },
  { key: 'lLit', ps: 'linearLight', ids: ['linearLight'], label: '线性光' },
  { key: 'pLit', ps: 'pinLight', ids: ['pinLight'], label: '点光' },
  { key: 'hMix', ps: 'hardMix', ids: ['hardMix'], label: '实色混合' },
  { key: 'diff', ps: 'Dfrn', ids: ['Dfrn', 'difference'], label: '差值' },
  { key: 'smud', ps: 'Xclu', ids: ['Xclu', 'exclusion'], label: '排除' },
  { key: 'fsub', ps: 'blendSubtraction', ids: ['blendSubtraction', 'subtract'], label: '减去' },
  { key: 'fdiv', ps: 'blendDivide', ids: ['blendDivide', 'divide'], label: '划分' },
  { key: 'hue ', ps: 'H   ', ids: ['H   ', 'hue'], label: '色相' },
  { key: 'sat ', ps: 'Strt', ids: ['Strt', 'saturation'], label: '饱和度' },
  { key: 'colr', ps: 'Clr ', ids: ['Clr ', 'color'], label: '颜色' },
  { key: 'lum ', ps: 'Lmns', ids: ['Lmns', 'luminosity'], label: '明度' },
];
const MODE_BY_ID = new Map(); for (const m of BLEND_MODES) for (const id of m.ids) MODE_BY_ID.set(id, m);

export const blendKeyOfPs = v => (MODE_BY_ID.get(v) || BLEND_MODES[0]).key;
export const psOfBlendKey = k => (BLEND_MODES.find(m => m.key === k) || BLEND_MODES[0]).ps;

const num = v => +(v && typeof v === 'object' ? v.value : v);
function rgbc(v) { return { __name: '', __classID: 'RGBC', __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true }, 'Rd  ': v[0], 'Grn ': v[1], 'Bl  ': v[2] }; }
const targetRef = () => ({ __reference: [{ type: 'Enmr', cls: { name: '', cid: 'Lyr ' }, enumType: 'Ordn', value: 'Trgt' }] });


export function blendOptionsOf(entry) {
  const bo = entry && entry.blendOptions;
  const op = bo && bo.Opct != null ? num(bo.Opct) : 100;
  const md = bo && bo['Md  '] ? (bo['Md  '].value ?? bo['Md  ']) : 'Nrml';
  return { opacity: Number.isFinite(op) ? Math.max(0, Math.min(100, op)) : 100, mode: blendKeyOfPs(md) };
}

export function setBlendOptions(entry, { opacity, mode } = {}) {
  const bo = entry.blendOptions && typeof entry.blendOptions === 'object' ? entry.blendOptions
    : (entry.blendOptions = { __name: '', __classID: 'blendOptions', Opct: { __unit: '#Prc', value: 100 }, 'Md  ': { __enumType: 'BlnM', value: 'Nrml' } });
  if (opacity != null) bo.Opct = { __unit: '#Prc', value: Math.max(0, Math.min(100, Math.round(+opacity))) };
  if (mode != null) bo['Md  '] = { __enumType: 'BlnM', value: psOfBlendKey(mode) };
  return entry;
}


export function buildSmartFilterEntry(kind, params, o = {}) {
  const spec = SMART_FILTERS[kind];
  if (!spec) throw new Error(`「${kind}」还不能作为智能滤镜；可用：${Object.keys(SMART_FILTERS).join(' ')}`);
  const Fltr = fltrWithParams({ __name: spec.label.replace(/\.\.\.$/, ''), __classID: spec.cls, 'null': targetRef() }, kind, params);
  Object.assign(Fltr, spec.fixed || {});
  const mode = o.mode == null ? 'norm' : (BLEND_MODES.some(m => m.key === o.mode) ? o.mode : (MODE_BY_ID.get(o.mode) || {}).key);
  if (!mode) throw new Error(`mode 只能是 ${BLEND_MODES.map(m => m.ids[m.ids.length - 1]).join(' / ')}`);
  const opacity = o.opacity == null ? 100 : Math.max(0, Math.min(100, +o.opacity));
  const fg = o.fg || [0, 0, 0], bg = o.bg || [255, 255, 255];
  return {
    __name: '', __classID: 'filterFX',
    'Nm  ': spec.label,
    blendOptions: { __name: '', __classID: 'blendOptions', Opct: { __unit: '#Prc', value: opacity },
      'Md  ': { __enumType: 'BlnM', value: o.modeValue || (mode === 'norm' ? 'normal' : psOfBlendKey(mode)) } },
    enab: o.enabled !== false, hasoptions: spec.params.length > 0,
    FrgC: rgbc(fg), BckC: rgbc(bg),
    Fltr,
  };
}


export function fltrWithParams(Fltr, kind, params) {
  const spec = SMART_FILTERS[kind];
  const out = { ...Fltr };
  const longs = { ...(Fltr.__long || {}) }, doubs = { ...(Fltr.__doub || {}) };
  for (const p of spec.params) {
    const v = params[p.key];
    if (v === undefined) continue;
    if (p.type === 'px') out[p.ps] = { __unit: '#Pxl', value: +v };
    else if (p.type === 'prc') out[p.ps] = { __unit: '#Prc', value: +v };
    else if (p.type === 'long') { out[p.ps] = Math.round(+v); longs[p.ps] = true; }
    else if (p.type === 'bool') out[p.ps] = !!v;
    else if (p.type === 'enum') out[p.ps] = { __enumType: p.enumType, value: p.map[v] ?? Object.values(p.map)[0] };
    else if (p.type === 'dbl') { out[p.ps] = +v; doubs[p.ps] = true; delete longs[p.ps]; }
    else if (p.type === 'text') out[p.ps] = String(v);
    else if (p.type === 'data') out[p.ps] = v instanceof Uint8Array ? v : new Uint8Array(v);
  }
  if (Object.keys(longs).length) out.__long = longs;
  if (Object.keys(doubs).length) out.__doub = doubs;
  return out;
}


export function decodeFltr(Fltr) {
  if (Fltr && Fltr.__classID === 'GEfc') { const layers = decodeGalleryDescriptor(Fltr); return layers ? { kind: 'filterGallery', params: { layers } } : null; }
  const kind = Fltr && SMART_FILTER_BY_CLS[Fltr.__classID];
  if (!kind) return null;
  const spec = SMART_FILTERS[kind], params = {};
  for (const p of spec.params) {
    const raw = Fltr[p.ps];
    if (raw === undefined) continue;
    if (p.type === 'px' || p.type === 'prc' || p.type === 'long') params[p.key] = num(raw);
    else if (p.type === 'bool') params[p.key] = !!raw;
    else if (p.type === 'enum') { const v = raw && raw.value; const hit = Object.entries(p.map).find(([, ps]) => ps === v); if (hit) params[p.key] = hit[0]; }
    else if (p.type === 'dbl') params[p.key] = num(raw);
    else if (p.type === 'text') params[p.key] = String(raw);
    else if (p.type === 'data') params[p.key] = raw instanceof Uint8Array ? raw : null;
  }
  return { kind, params };
}

const colOf = o => (o && o['Rd  '] != null ? [num(o['Rd  ']), num(o['Grn ']), num(o['Bl  '])] : null);
export const isDeformEntry = e => !!(e && ((e.Fltr && DEFORM_CLS.has(e.Fltr.__classID)) || e.filterID === 714 || e.filterID === 687));


export function stepOfEntry(entry) {
  if (isDeformEntry(entry)) return { deform: true };
  const d = decodeFltr(entry && entry.Fltr);
  if (!d) return null;
  if (d.kind === 'filterGallery') { d.params.fg = colOf(entry.FrgC) || [0, 0, 0]; d.params.bg = colOf(entry.BckC) || [255, 255, 255]; }
  const bo = blendOptionsOf(entry);
  return { kind: d.kind, params: d.params, opacity: bo.opacity, mode: bo.mode };
}

export const entryLabel = e => String((e && e['Nm  ']) || (e && e.Fltr && e.Fltr.__classID) || '滤镜').replace(/\.\.\.$|…$/, '');


export const isPsdEditorOnlyKind = kind => !!(SMART_FILTERS[kind] && SMART_FILTERS[kind].psd_editorOnly);

export default { SMART_FILTERS, isPsdEditorOnlyKind, SMART_FILTER_BY_CLS, BLEND_MODES, buildSmartFilterEntry, fltrWithParams, decodeFltr, stepOfEntry, blendOptionsOf, setBlendOptions, blendKeyOfPs, psOfBlendKey, isDeformEntry, entryLabel };
