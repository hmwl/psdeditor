
































































import { FILTER_IDS } from '../../core/index.js';
import { decodeSmartObject } from './smart-object.js';
import { buildSoLdRewrite } from './warp-write.js';
import { validateFragment } from './fragment.js';
import { findDeformFilter } from './deform.js';




const META = new Set(['__name', '__classID', '__objectArray', '__itemsCount', '__unit',
                      '__enumType', '__class', '__reference', '__error', '__explicit',
                      '__long', '__doub', '__comp']);
const dataKeys = obj => Object.keys(obj).filter(k => !META.has(k));


const MAX_FIELDS = 400;

const MAX_EDITS = 64;

const numStr = n => (Number.isFinite(n) ? (Object.is(n, -0) ? '0' : String(n)) : String(n));
function checksum(u8) { let s = 0; for (let i = 0; i < u8.length; i++) s = (s * 31 + u8[i]) >>> 0; return s; }


























export const SMART_FILTER_NAMES = {
  
  perspectiveWarpTransform: { label: '透视变形', verified: true },
  rigidTransform:           { label: '操控变形', verified: true },
  
  
  'Blr ':      { label: '模糊', verified: true },
  'BlrM':      { label: '进一步模糊', verified: true },
  GsnB:        { label: '高斯模糊', verified: true },
  MtnB:        { label: '动感模糊', verified: true },
  RdlB:        { label: '径向模糊', verified: true },
  SmrB:        { label: '特殊模糊', verified: true },
  surfaceBlur: { label: '表面模糊' },
  boxBlur:     { label: '方框模糊' },
  shapeBlur:   { label: '形状模糊' },
  lensBlur:    { label: '镜头模糊' },
  'Avrg':      { label: '平均', verified: true },
  
  Shrp:         { label: '锐化', verified: true },
  ShrM:         { label: '进一步锐化', verified: true },
  ShrE:         { label: '锐化边缘', verified: true },
  UnsM:         { label: 'USM 锐化', verified: true },
  smartSharpen: { label: '智能锐化' },
  
  AdNs: { label: '添加杂色', verified: true },
  Dspc: { label: '去斑', verified: true },
  DstS: { label: '蒙尘与划痕', verified: true },
  RdcN: { label: '减少杂色' },
  'Mdn ': { label: '中间值', verified: true },
  
  HghP:               { label: '高反差保留', verified: true },
  'Mxm ':             { label: '最大值', verified: true },
  'Mnm ':             { label: '最小值', verified: true },
  Ofst:               { label: '位移', verified: true },
  Twrl:               { label: '旋转扭曲', verified: true },
  ZgZg:               { label: '水波', verified: true },
  Rple:               { label: '波纹', verified: true },
  Sphr:               { label: '球面化', verified: true },
  Pnch:               { label: '挤压', verified: true },
  OcnR:               { label: '海洋波纹', verified: true },
  DfsG:               { label: '扩散亮光', verified: true },
  Clds:               { label: '云彩', verified: true },
  DfrC:               { label: '分层云彩', verified: true },
  
  'Msc ':             { label: '马赛克', verified: true, source: 'amEvent' },
  'Fct ':             { label: '彩块化', verified: true, source: 'amEvent' },
  FndE:               { label: '查找边缘', verified: true, source: 'amEvent' },
  Frgm:               { label: '碎片', verified: true, source: 'amEvent' },
  Embs:               { label: '浮雕效果', verified: true, source: 'amEvent' },
  Eqlz:               { label: '色调均化', verified: true, source: 'amEvent' },
  Smoo:               { label: '平滑', verified: true, source: 'amEvent' },
  'Dfs ':             { label: '扩散', verified: true, source: 'amEvent' },
  TrcC:               { label: '等高线', verified: true, source: 'amEvent' },
  Dfrg:               { label: '去边', verified: true, source: 'amEvent' },
  liquify:            { label: '液化' },
  adaptiveWideAngle:  { label: '自适应广角' },
};














export function classIdFromFilterId(id) {
  if (!Number.isInteger(id) || id < 0) return null;
  const b = [(id >>> 24) & 255, (id >>> 16) & 255, (id >>> 8) & 255, id & 255];
  if (b.some(c => c < 32 || c > 126)) return null;
  return b.map(c => String.fromCharCode(c)).join('');
}




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
    if (v.__unit && Array.isArray(v.values)) return { type: 'UnFl', leaf: true, editable: true, unit: v.__unit, count: v.values.length };
    if (v.__unit !== undefined) return { type: 'UntF', leaf: true, editable: true, unit: v.__unit };
    if (v.__enumType !== undefined) return { type: 'enum', leaf: true, editable: true, enumType: v.__enumType };
    if (v.__class !== undefined) return { type: 'type', leaf: true, editable: false, classID: v.__class };
    if (v.__reference !== undefined) return { type: 'reference', leaf: true, editable: false };
    if (v.__classID !== undefined) return { type: 'object', leaf: false, editable: false, classID: v.__classID };
    return { type: 'object', leaf: false, editable: false, classID: null };
  }
  return { type: 'unknown', leaf: true, editable: false };
}






function flatten(node, prefix, out, host, key) {
  out = out || {};
  if (node === null || node === undefined) { out[prefix] = 'null'; return out; }
  if (node instanceof Uint8Array) { out[prefix] = `bytes:${node.length}:${checksum(node)}`; return out; }
  if (Array.isArray(node)) {
    out[prefix + '#len'] = 'n:' + node.length;
    for (let i = 0; i < node.length; i++) flatten(node[i], prefix ? `${prefix}.${i}` : String(i), out, node, i);
    return out;
  }
  if (typeof node === 'object') {
    if (node.__unit && Array.isArray(node.values)) { out[prefix] = `UnFl ${node.__unit}:${node.values.map(numStr).join(',')}`; return out; }
    if (node.__unit !== undefined) { out[prefix] = `UntF ${node.__unit}:${numStr(node.value)}`; return out; }
    if (node.__enumType !== undefined) { out[prefix] = `enum ${node.__enumType}.${node.value}`; return out; }
    if (node.__class !== undefined) { out[prefix] = `type:${node.__class}|${node.__name || ''}`; return out; }
    if (node.__reference !== undefined) { out[prefix] = 'ref:' + JSON.stringify(node.__reference); return out; }
    const keys = dataKeys(node);
    out[prefix + '#cls'] = `cls:${node.__classID || ''}|${node.__name || ''}|${node.__objectArray ? 'ObAr' + (node.__itemsCount || 0) : ''}`;
    out[prefix + '#keys'] = keys.join(',');
    out[prefix + '#tag'] = `L:${Object.keys(node.__long || {}).sort().join(',')}|D:${Object.keys(node.__doub || {}).sort().join(',')}` +
                           `|C:${Object.keys(node.__comp || {}).sort().join(',')}|E:${Object.keys(node.__explicit || {}).sort().join(',')}`;
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
  for (const k of keys) if (a[k] !== b[k]) out.push({ path: k, before: a[k] === undefined ? '(缺)' : a[k], after: b[k] === undefined ? '(缺)' : b[k] });
  out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  return out;
}



const MAX_DEPTH = 8;





function enumFields(root) {
  const out = [];
  let truncated = false;
  const emit = (host, k, path, depth) => {
    if (out.length >= MAX_FIELDS) { truncated = true; return; }
    const v = host[k];
    const shape = shapeOf(v, host, k);
    const entry = { path, type: shape.type, editable: !!shape.editable };
    if (shape.unit) entry.unit = shape.unit;
    if (shape.enumType) entry.enumType = shape.enumType;
    if (shape.classID) entry.classID = shape.classID;
    if (shape.count !== undefined) entry.count = shape.count;
    if (shape.length !== undefined) entry.byteLength = shape.length;
    if (shape.integer) entry.integer = true;
    if (shape.leaf) {
      entry.value = shape.type === 'UntF' ? v.value
        : shape.type === 'enum' ? v.value
          : shape.type === 'UnFl' ? v.values.slice()
            : shape.type === 'tdta' ? null
              : shape.type === 'reference' ? null
                : shape.type === 'type' ? (v.__name || '')
                  : shape.type === 'null' ? null : v;
    }
    out.push(entry);
    if (shape.leaf || depth >= MAX_DEPTH) return;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) emit(v, i, `${path}.${i}`, depth + 1); return; }
    if (v && typeof v === 'object') { for (const kk of dataKeys(v)) emit(v, kk, `${path}.${kk}`, depth + 1); }
  };
  for (const k of dataKeys(root)) emit(root, k, k, 0);
  return { fields: out, truncated };
}



function openFragment(fragment) {
  validateFragment(fragment);
  const so = decodeSmartObject({ layerName: String(fragment.layerName || ''), bounds: fragment.bounds,
                                 kind: fragment.kind, psb: !!fragment.psb, blocks: fragment.blocks }, null);
  if (!so) throw new Error('放置块无法解析（不是有效的 SoLd/PlLd 数据）');
  const soldBlk = so.placedBlocks.find(b => b.key === 'SoLd' && b.placed) || null;
  return { so, soldBlk };
}





function probeRebuild(so, soldBlk) {
  if (!soldBlk) return { ok: false, byteLength: 0, firstDiff: null, reason: '该图层没有 SoLd 块（老格式 PlLd 不含智能滤镜信息）' };
  const orig = soldBlk.bytes;
  let rebuilt;
  try { rebuilt = buildSoLdRewrite(so, d => d)[0].data; }
  catch (e) { return { ok: false, byteLength: orig.length, firstDiff: null, reason: 'SoLd 块重序列化失败：' + e.message }; }
  const n = Math.min(orig.length, rebuilt.length);
  for (let i = 0; i < n; i++) {
    if (orig[i] !== rebuilt[i]) {
      return { ok: false, byteLength: orig.length,
               firstDiff: { offset: i, before: orig[i], after: rebuilt[i] },
               reason: `SoLd 块原样重序列化对不上：块内偏移 ${i}（0x${i.toString(16)}）原值 0x${orig[i].toString(16).padStart(2, '0')} → 重建值 0x${rebuilt[i].toString(16).padStart(2, '0')}` };
    }
  }
  if (orig.length !== rebuilt.length) {
    return { ok: false, byteLength: orig.length,
             firstDiff: { offset: n, before: orig.length, after: rebuilt.length },
             reason: `SoLd 块原样重序列化长度不符：原 ${orig.length} 字节 → 重建 ${rebuilt.length} 字节（前 ${n} 字节相同）` };
  }
  return { ok: true, byteLength: orig.length, firstDiff: null };
}




function deformKindOf(f) {
  const id = f && f.filterID, Fltr = f && f.Fltr;
  if (!Fltr) return null;
  if (id === FILTER_IDS.perspectiveWarp || Fltr.__classID === 'perspectiveWarpTransform') return 'perspectiveWarp';
  if (id === FILTER_IDS.puppetWarp || Fltr.__classID === 'rigidTransform') return 'puppetWarp';
  return null;
}

const DEFORM_NOTE = '这条的顶点 / 图钉由变形编辑器负责（server/private/deform.js + /api/so/writeback 的 deform 分支），本接口只原样保留；只有启用位（enab，PS 图层面板上那只眼睛）放行';



function rgbc(v) {
  if (!v || typeof v !== 'object' || v.__classID !== 'RGBC') return null;
  const n = k => (typeof v[k] === 'number' ? v[k] : null);
  return { r: n('Rd  '), g: n('Grn '), b: n('Bl  ') };
}

function describeStyle(fx) {
  const b = k => (typeof fx[k] === 'boolean' ? fx[k] : null);
  return {
    classID: fx.__classID || null,
    enabled: b('enab'),
    validAtPosition: b('validAtPosition'),
    filterMaskEnable: b('filterMaskEnable'),
    filterMaskLinked: b('filterMaskLinked'),
    filterMaskExtendWithWhite: b('filterMaskExtendWithWhite'),
  };
}


function describeFilter(f, i, styleEnabled, deformTargetFltr, warnings) {
  const Fltr = f && f.Fltr;
  const rawClassID = Fltr ? (Fltr.__classID || null) : null;
  const filterID = typeof f.filterID === 'number' ? f.filterID : null;
  
  const classID = rawClassID || (filterID != null ? classIdFromFilterId(filterID) : null);
  const classIDFrom = rawClassID ? 'Fltr.__classID' : (classID ? 'filterID' : null);
  const known = classID != null && Object.prototype.hasOwnProperty.call(SMART_FILTER_NAMES, classID);
  const fileName = typeof f['Nm  '] === 'string' ? f['Nm  '] : null;
  const dk = deformKindOf(f);
  const enab = typeof f.enab === 'boolean' ? f.enab : null;

  const out = {
    index: i,
    classID,
    classIDFrom,
    
    
    filterID,
    name: fileName,                                   
    displayName: known ? SMART_FILTER_NAMES[classID].label : (fileName || classID || '未知滤镜'),
    nameSource: known ? (SMART_FILTER_NAMES[classID].verified ? 'table-verified' : 'table') : (fileName ? 'file' : (classID ? 'filterID' : 'none')),
    known,
    enabled: enab,
    enabledEditable: typeof f.enab === 'boolean',     
    effectiveEnabled: enab === null ? null : (enab && styleEnabled !== false),
    hasOptions: typeof f.hasoptions === 'boolean' ? f.hasoptions : null,
    blendOptions: null,
    foreground: rgbc(f.FrgC),
    background: rgbc(f.BckC),
    owner: dk ? 'deform' : 'smartFilter',
    deformKind: dk,
    editable: !dk,                                    
    
    enabledOnly: !!dk,
    note: dk ? DEFORM_NOTE : null,
    params: null,
    paramFieldsTruncated: false,
    keys: f && typeof f === 'object' ? dataKeys(f) : [],
  };

  if (dk && Fltr && deformTargetFltr === Fltr) out.deformPrimary = true;
  else if (dk) { out.deformPrimary = false; warnings.push(`第 ${i} 条是变形滤镜（${dk}），但不是 deform.js 会挑中的那条（它只取列表里第一条变形滤镜）`); }

  const bo = f && f.blendOptions;
  if (bo && typeof bo === 'object') {
    out.blendOptions = {
      opacity: bo.Opct && typeof bo.Opct === 'object' ? bo.Opct.value : (typeof bo.Opct === 'number' ? bo.Opct : null),
      opacityUnit: bo.Opct && typeof bo.Opct === 'object' ? (bo.Opct.__unit || null) : null,
      mode: bo['Md  '] && typeof bo['Md  '] === 'object' ? bo['Md  '].value : null,
      modeEnumType: bo['Md  '] && typeof bo['Md  '] === 'object' ? (bo['Md  '].__enumType || null) : null,
    };
  }

  if (!Fltr) { warnings.push(`第 ${i} 条滤镜没有 Fltr 子描述符，无法解析参数`); return out; }
  if (dk) {
    
    
    out.paramsOmitted = '变形滤镜的参数请走 /api/so/resolve 的 layerInfo.deform';
    return out;
  }
  const { fields, truncated } = enumFields(Fltr);
  out.params = fields;
  out.paramFieldsTruncated = truncated;
  if (truncated) warnings.push(`第 ${i} 条滤镜的参数字段超过 ${MAX_FIELDS} 个，已截断`);
  return out;
}







export function resolveSmartFilters(fragment) {
  const { so, soldBlk } = openFragment(fragment);
  const warnings = [];
  const probe = probeRebuild(so, soldBlk);
  const desc = soldBlk ? soldBlk.placed.descriptor : null;
  const fx = desc ? desc['filterFX'] : null;

  if (!soldBlk) warnings.push(probe.reason);
  if (soldBlk && !probe.ok) warnings.push(probe.reason + '；本片段**不允许**改写滤镜');

  if (!fx || typeof fx !== 'object') {
    return {
      present: false, style: null, count: 0, filters: [],
      rebuildIdentical: probe.ok, firstDiff: probe.firstDiff,
      writable: false,
      blockByteLength: probe.byteLength,
      warnings: warnings.concat(soldBlk ? ['该智能对象没有智能滤镜（SoLd 描述符里没有 filterFX）'] : []),
    };
  }

  const list = fx['filterFXList'];
  if (!Array.isArray(list)) {
    warnings.push('filterFX 里的 filterFXList 不是数组，无法列出滤镜');
    return { present: true, style: describeStyle(fx), count: 0, filters: [],
             rebuildIdentical: probe.ok, firstDiff: probe.firstDiff, writable: false,
             blockByteLength: probe.byteLength, warnings };
  }

  const style = describeStyle(fx);
  const deformTarget = findDeformFilter(desc);
  const deformTargetFltr = deformTarget ? deformTarget.Fltr : null;
  const filters = list.map((f, i) => describeFilter(f, i, style.enabled, deformTargetFltr, warnings));

  return {
    present: true,
    style,
    count: filters.length,
    filters,
    rebuildIdentical: probe.ok,
    firstDiff: probe.firstDiff,
    writable: probe.ok,
    blockByteLength: probe.byteLength,
    warnings,
  };
}




function resolvePath(root, path) {
  const segs = String(path).split('.');
  let node = root;
  for (let i = 0; i < segs.length - 1; i++) {
    if (node === null || typeof node !== 'object') return null;
    node = Array.isArray(node) ? node[Number(segs[i])] : node[segs[i]];
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

const I32_MIN = -2147483648, I32_MAX = 2147483647;





function setLeaf(hit, value, where) {
  const { parent, key, value: old } = hit;
  const shape = shapeOf(old, parent, key);
  if (!shape.editable) throw new Error(`${where}：${shape.type} 类型的字段不可改（只允许改标量叶子：long/doub/bool/TEXT/UntF/enum/UnFl）`);

  switch (shape.type) {
    case 'UntF': {
      if (!Number.isFinite(Number(value))) throw new Error(`${where}：UntF ${shape.unit} 字段要数字，收到 ${JSON.stringify(value)}`);
      old.value = Number(value);                       
      return `UntF ${shape.unit}:${numStr(old.value)}`;
    }
    case 'enum': {
      if (typeof value !== 'string' || !value) throw new Error(`${where}：enum ${shape.enumType} 字段要非空字符串（枚举值 key），收到 ${JSON.stringify(value)}`);
      old.value = value;                               
      return `enum ${shape.enumType}.${value}`;
    }
    case 'UnFl': {
      if (!Array.isArray(value) || value.length !== old.values.length)
        throw new Error(`${where}：UnFl ${shape.unit} 要长度 ${old.values.length} 的数字数组（不支持改长度）`);
      if (!value.every(v => Number.isFinite(Number(v)))) throw new Error(`${where}：UnFl 数组里有非数字`);
      old.values = value.map(Number);
      return `UnFl ${shape.unit}:${old.values.map(numStr).join(',')}`;
    }
    case 'bool': {
      if (typeof value !== 'boolean') throw new Error(`${where}：bool 字段要 true/false，收到 ${JSON.stringify(value)}`);
      parent[key] = value;
      return 'bool:' + value;
    }
    case 'TEXT': {
      if (typeof value !== 'string') throw new Error(`${where}：TEXT 字段要字符串，收到 ${JSON.stringify(value)}`);
      if (value.length > 1024) throw new Error(`${where}：TEXT 字段过长（${value.length} 字符，上限 1024）`);
      parent[key] = value;
      return 'TEXT:' + value;
    }
    case 'long': case 'comp': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${where}：${shape.type} 字段要数字，收到 ${JSON.stringify(value)}`);
      if (!Number.isInteger(n)) throw new Error(`${where}：${shape.type} 字段是整数类型，收到 ${n}`);
      if (shape.type === 'long' && (n < I32_MIN || n > I32_MAX)) throw new Error(`${where}：long 超出 32 位范围（${n}）`);
      parent[key] = n;
      return `${shape.type}:${numStr(n)}`;
    }
    case 'doub': case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`${where}：数值字段要有限数字，收到 ${JSON.stringify(value)}`);
      parent[key] = n;
      return `${shape.type === 'doub' ? 'doub' : 'num'}:${numStr(n)}`;
    }
    default:
      throw new Error(`${where}：不支持改 ${shape.type} 类型的字段`);
  }
}



function normalizeEdits(edits) {
  if (Array.isArray(edits)) edits = { filters: edits };
  if (!edits || typeof edits !== 'object') throw new Error('edits 缺失（要 { filters:[…], style?:{…}, order?:[…] }）');
  const filters = edits.filters === undefined ? [] : edits.filters;
  if (!Array.isArray(filters)) throw new Error('edits.filters 必须是数组');
  if (filters.length > MAX_EDITS) throw new Error(`一次最多 ${MAX_EDITS} 条滤镜编辑`);
  const style = edits.style === undefined ? null : edits.style;
  if (style !== null && (typeof style !== 'object' || Array.isArray(style))) throw new Error('edits.style 必须是对象');
  let order = edits.order === undefined ? null : edits.order;
  if (order !== null && !Array.isArray(order)) throw new Error('edits.order 必须是原下标数组');
  const allowEmpty = !!edits.allowEmpty;
  if (!filters.length && !style && !order) throw new Error('edits 里没有任何改动（filters / style / order 至少给一个）');
  return { filters, style, order, allowEmpty };
}

const STYLE_KEYS = { enabled: 'enab', validAtPosition: 'validAtPosition', filterMaskEnable: 'filterMaskEnable',
                     filterMaskLinked: 'filterMaskLinked', filterMaskExtendWithWhite: 'filterMaskExtendWithWhite' };














export function writebackSmartFilters(fragment, edits) {
  const { so, soldBlk } = openFragment(fragment);
  const probe = probeRebuild(so, soldBlk);
  if (!probe.ok) throw new Error('拒绝改写：' + probe.reason);

  const desc = soldBlk.placed.descriptor;
  const fx = desc['filterFX'];
  if (!fx || typeof fx !== 'object') throw new Error('该智能对象没有智能滤镜（SoLd 描述符里没有 filterFX），本接口不负责从零新建');
  const list = fx['filterFXList'];
  if (!Array.isArray(list)) throw new Error('filterFX.filterFXList 不是数组，拒绝改写');

  const { filters: fEdits, style, order, allowEmpty } = normalizeEdits(edits);
  const warnings = [];

  
  const beforeAll = flatten(desc, '');
  const beforeFilter = list.map(f => flatten(f, ''));
  const beforeStyleOnly = {};
  for (const [k, v] of Object.entries(flatten(fx, ''))) if (!k.startsWith('filterFXList')) beforeStyleOnly[k] = v;

  
  const expectStyle = {};
  if (style) {
    for (const k of Object.keys(style)) {
      const key = STYLE_KEYS[k];
      if (!key) throw new Error(`edits.style 里不认识的字段「${k}」；可用：${Object.keys(STYLE_KEYS).join(' / ')}`);
      const hit = resolvePath(fx, key);
      if (!hit) throw new Error(`filterFX 里没有 ${key} 字段，改不了 style.${k}`);
      expectStyle[key] = setLeaf(hit, style[k], `style.${k}`);
    }
  }

  
  const expectPerFilter = new Map();      
  const removeSet = new Set();
  const seen = new Set();

  const bumpExpect = (idx, path, val) => {
    if (!expectPerFilter.has(idx)) expectPerFilter.set(idx, {});
    expectPerFilter.get(idx)[path] = val;
  };

  for (const e of fEdits) {
    if (!e || typeof e !== 'object') throw new Error('filters 里的每一项必须是对象');
    const i = e.index;
    if (!Number.isInteger(i) || i < 0 || i >= list.length)
      throw new Error(`滤镜下标 ${JSON.stringify(e.index)} 越界（本智能对象共 ${list.length} 条滤镜）`);
    if (seen.has(i)) throw new Error(`滤镜下标 ${i} 在 edits 里出现了多次`);
    seen.add(i);

    const f = list[i];
    const dk = deformKindOf(f);
    const label = `第 ${i} 条滤镜`;
    


    

    if (dk && edits && edits.clearAll === true && e.remove === true) { removeSet.add(i); continue; }
    if (dk) {
      const other = ['remove', 'values', 'name', 'blendOptions'].filter(kk => e[kk] !== undefined);
      if (other.length)
        throw new Error(`${label}是变形滤镜（${dk}，filterID ${f.filterID}）：${other.join(' / ')} 改不了 —— ${DEFORM_NOTE}`);
      if (e.enabled === undefined)
        throw new Error(`${label}是变形滤镜（${dk}，filterID ${f.filterID}）：${DEFORM_NOTE}`);
    }

    if (e.remove === true) {
      if (e.enabled !== undefined || e.values !== undefined || e.name !== undefined || e.blendOptions !== undefined)
        throw new Error(`${label}：remove 不能和其它改动写在同一条 edit 上`);
      removeSet.add(i);
      continue;
    }

    let touched = false;
    if (e.enabled !== undefined) {
      if (typeof e.enabled !== 'boolean') throw new Error(`${label}：enabled 要 true/false`);
      const hit = resolvePath(f, 'enab');
      if (!hit) throw new Error(`${label}：条目里没有 enab 字段，改不了启用位（不猜着插一个新键）`);
      bumpExpect(i, 'enab', setLeaf(hit, e.enabled, `${label}.enabled`));
      touched = true;
    }
    if (e.name !== undefined) {
      const hit = resolvePath(f, 'Nm  ');
      if (!hit) throw new Error(`${label}：条目里没有 'Nm  ' 字段，改不了名字`);
      bumpExpect(i, 'Nm  ', setLeaf(hit, e.name, `${label}.name`));
      touched = true;
    }
    if (e.blendOptions !== undefined) {
      const bo = e.blendOptions;
      if (!bo || typeof bo !== 'object' || Array.isArray(bo)) throw new Error(`${label}：blendOptions 必须是对象`);
      const host = f.blendOptions;
      if (!host || typeof host !== 'object') throw new Error(`${label}：条目里没有 blendOptions 子描述符`);
      for (const k of Object.keys(bo)) {
        const key = k === 'opacity' ? 'Opct' : k === 'mode' ? 'Md  ' : null;
        if (!key) throw new Error(`${label}：blendOptions 里不认识的字段「${k}」（只支持 opacity / mode）`);
        const hit = resolvePath(host, key);
        if (!hit) throw new Error(`${label}：blendOptions 里没有 ${key} 字段`);
        bumpExpect(i, `blendOptions.${key}`, setLeaf(hit, bo[k], `${label}.blendOptions.${k}`));
        touched = true;
      }
    }
    if (e.values !== undefined) {
      const vals = e.values;
      if (!vals || typeof vals !== 'object' || Array.isArray(vals)) throw new Error(`${label}：values 必须是 { 路径: 新值 } 对象`);
      const Fltr = f.Fltr;
      if (!Fltr || typeof Fltr !== 'object') throw new Error(`${label}：条目里没有 Fltr 子描述符，没有参数可改`);
      for (const path of Object.keys(vals)) {
        if (path === 'null' || path.startsWith('null.')) throw new Error(`${label}：Fltr 里的 'null' 是 Action Manager 的目标引用，不是参数，不允许改`);
        const hit = resolvePath(Fltr, path);
        if (!hit) throw new Error(`${label}：Fltr 里没有路径「${path}」（可用路径见 resolve 响应的 params[].path）`);
        bumpExpect(i, `Fltr.${path}`, setLeaf(hit, vals[path], `${label}.values['${path}']`));
        touched = true;
      }
    }
    if (!touched) throw new Error(`${label}：这条 edit 什么都没改（enabled / name / blendOptions / values / remove 至少给一个）`);
  }

  
  const survivors = [];                    
  for (let i = 0; i < list.length; i++) if (!removeSet.has(i)) survivors.push(i);

  if (removeSet.size && !survivors.length && !allowEmpty)
    throw new Error('这样会把滤镜删光；确实要删光请带 allowEmpty:true（那样整个 filterFX 键会被删掉）');

  let newOrder = survivors;
  if (order) {
    if (order.length !== survivors.length)
      throw new Error(`order 的长度 ${order.length} 与删除后剩下的 ${survivors.length} 条不符（order 写的是**原下标**）`);
    const want = new Set(survivors), got = new Set();
    for (const v of order) {
      if (!Number.isInteger(v)) throw new Error(`order 里有非整数 ${JSON.stringify(v)}`);
      if (!want.has(v)) throw new Error(`order 里的原下标 ${v} 不在「删除后剩下的下标」里（剩下的是 ${survivors.join(',')}）`);
      if (got.has(v)) throw new Error(`order 里的原下标 ${v} 重复了`);
      got.add(v);
    }
    newOrder = order.slice();
    const movedDeform = newOrder.some((src, j) => src !== survivors[j] && deformKindOf(list[src]));
    if (movedDeform) warnings.push('换序把变形滤镜挪了位置：条目本身原样搬运、一个字节没改，但滤镜的叠加顺序变了，渲染结果会不一样');
  }

  const structural = removeSet.size > 0 || newOrder.some((src, j) => src !== j) || newOrder.length !== list.length;
  const emptied = newOrder.length === 0;

  if (structural) {
    const reordered = newOrder.map(i => list[i]);
    list.length = 0;
    for (const f of reordered) list.push(f);
  }
  if (emptied) delete desc['filterFX'];

  
  const blocks = buildSoLdRewrite(so, () => desc);

  
  verify({ desc, blocks, beforeAll, beforeStyleOnly, beforeFilter, newOrder, expectStyle, expectPerFilter, emptied, so, soldBlk });

  return {
    blocks,
    count: newOrder.length,
    changed: [
      ...Object.keys(expectStyle).map(k => 'filterFX.' + k),
      ...[...expectPerFilter.entries()].flatMap(([i, m]) => Object.keys(m).map(p => `filterFX.filterFXList.${i}.${p}`)),
      ...(removeSet.size ? [`removed:${[...removeSet].sort((a, b) => a - b).join(',')}`] : []),
      ...(order ? [`order:${newOrder.join(',')}`] : []),
    ],
    warnings,
  };
}





function verify(ctx) {
  const { desc, blocks, beforeAll, beforeStyleOnly, beforeFilter, newOrder, expectStyle, expectPerFilter, emptied } = ctx;

  
  let readBack;
  try {
    const so2 = decodeSmartObject({ layerName: '', bounds: ctx.so.bounds, kind: ctx.so.kind, psb: !!ctx.so._doc?.psb,
                                    blocks: [{ key: 'SoLd', data: blocks[0].data }] }, null);
    readBack = so2 && so2.placedBlocks[0].placed.descriptor;
  } catch (e) { throw new Error('复核失败：新 SoLd 块读不回来（' + e.message + '）'); }
  if (!readBack) throw new Error('复核失败：新 SoLd 块读不回来');

  const afterAll = flatten(readBack, '');

  
  const outside = k => !(k === 'filterFX' || k.startsWith('filterFX.') || k.startsWith('filterFX#'));
  const a = {}, b = {};
  for (const [k, v] of Object.entries(beforeAll)) if (outside(k)) a[k] = v;
  for (const [k, v] of Object.entries(afterAll)) if (outside(k)) b[k] = v;
  
  if (emptied) { delete a['#keys']; delete b['#keys']; }
  const outsideDiff = snapshotDiff(a, b);
  if (outsideDiff.length)
    throw new Error(`复核失败：filterFX 之外的字段被改动了 ${outsideDiff.length} 处，第一处 ${outsideDiff[0].path}：${outsideDiff[0].before} → ${outsideDiff[0].after}`);

  if (emptied) {
    if (Object.prototype.hasOwnProperty.call(readBack, 'filterFX')) throw new Error('复核失败：filterFX 应该被删掉，但新块里还在');
    return;
  }

  const fx2 = readBack['filterFX'];
  if (!fx2) throw new Error('复核失败：新块里没有 filterFX');
  const list2 = fx2['filterFXList'];
  if (!Array.isArray(list2)) throw new Error('复核失败：新块的 filterFXList 不是数组');

  
  const afterStyleOnly = {};
  for (const [k, v] of Object.entries(flatten(fx2, ''))) if (!k.startsWith('filterFXList')) afterStyleOnly[k] = v;
  const styleDiff = snapshotDiff(beforeStyleOnly, afterStyleOnly);
  const wantStyle = new Set(Object.keys(expectStyle));
  for (const d of styleDiff) {
    if (!wantStyle.has(d.path)) throw new Error(`复核失败：filterFX.${d.path} 不在预期改动里（${d.before} → ${d.after}）`);
    if (d.after !== expectStyle[d.path]) throw new Error(`复核失败：filterFX.${d.path} 写出来是 ${d.after}，预期 ${expectStyle[d.path]}`);
    wantStyle.delete(d.path);
  }
  if (wantStyle.size) throw new Error(`复核失败：预期改动的 filterFX.${[...wantStyle][0]} 在新块里没有生效`);

  
  if (list2.length !== newOrder.length)
    throw new Error(`复核失败：滤镜条数 ${list2.length} 与预期 ${newOrder.length} 不符`);

  
  for (let j = 0; j < newOrder.length; j++) {
    const src = newOrder[j];
    const want = expectPerFilter.get(src) || {};
    const wantKeys = new Set(Object.keys(want));
    const diff = snapshotDiff(beforeFilter[src], flatten(list2[j], ''));
    for (const d of diff) {
      if (!wantKeys.has(d.path))
        throw new Error(`复核失败：滤镜（原下标 ${src} → 新位置 ${j}）的 ${d.path} 不在预期改动里（${d.before} → ${d.after}）`);
      if (d.after !== want[d.path])
        throw new Error(`复核失败：滤镜（原下标 ${src}）的 ${d.path} 写出来是 ${d.after}，预期 ${want[d.path]}`);
      wantKeys.delete(d.path);
    }
    if (wantKeys.size) throw new Error(`复核失败：滤镜（原下标 ${src}）预期改动的 ${[...wantKeys][0]} 在新块里没有生效`);
  }
}

export default { resolveSmartFilters, writebackSmartFilters, SMART_FILTER_NAMES };
