


























import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePsdDocument, serializePsdDocument } from '../core/psd-document.js';
import { listAdditionalKeys, patternToRGBA, decodePatternChannel } from '../core/psd-additional.js';
import { resourceName, resourceRawReason, resourceHandler, COLOR_MODE } from '../core/psd-resources.js';
import { PATH_SELECTOR } from '../core/psd-path.js';
import { decodeChannel } from '../core/psd-image.js';
import { parseEngineData, serializeEngineData, detectEngineDataFormat } from '../core/engine-data.js';
import { Reader, readDescriptor } from '../core/psd-parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');




const SPEC_RESOURCE_IDS = [
  1000, 1001, 1002, 1003, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015,
  1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030,
  1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046,
  1047, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062,
  1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078,
  1080, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 2999, 10000,
];


const SPEC_ADDITIONAL_KEYS = [
  'Alph', 'Anno', 'CAI ', 'CgEd', 'FEid', 'FMsk', 'FXid', 'GdFl', 'GenI', 'LMsk', 'Layr',
  'Lr16', 'Lr32', 'Mt16', 'Mt32', 'Mtrn', 'OCIO', 'Patt', 'Pat2', 'Pat3', 'PlLd', 'PxSD',
  'PxSc', 'SoCo', 'SoLE', 'SoLd', 'TySh', 'Txt2', 'abdd', 'artb', 'artd', 'blnc', 'blwh',
  'brit', 'brst', 'cinf', 'clbl', 'clrL', 'curv', 'expA', 'extn', 'fxrp', 'grdm', 'hue ',
  'hue2', 'iOpa', 'infx', 'knko', 'lclr', 'levl', 'lfx2', 'lfxs', 'lmfx', 'lmgm', 'lnk2',
  'lnk3', 'lnkD', 'lnkE', 'lnsr', 'lrFX', 'lsct', 'lsdk', 'lspf', 'luni', 'lyid', 'lyvr',
  'mixr', 'nvrt', 'phfl', 'post', 'pths', 'selc', 'shmd', 'sn2P', 'thrs', 'tsly', 'vibA',
  'vmgm', 'vmsk', 'vogk', 'vowv', 'vscg', 'vsms', 'vstk',
];


const SPEC_BLEND_MODES = [
  'pass', 'norm', 'diss', 'dark', 'mul ', 'idiv', 'lbrn', 'dkCl', 'lite', 'scrn', 'div ',
  'lddg', 'lgCl', 'over', 'sLit', 'hLit', 'vLit', 'lLit', 'pLit', 'hMix', 'diff', 'smud',
  'fsub', 'fdiv', 'hue ', 'sat ', 'colr', 'lum ',
];


const SPEC_DESC_TYPES = ['Objc', 'GlbO', 'VlLs', 'doub', 'UntF', 'UnFl', 'ObAr', 'TEXT',
                         'enum', 'long', 'comp', 'bool', 'type', 'GlbC', 'obj ', 'alis', 'tdta'];

const COMPRESSION_NAMES = { 0: 'RAW', 1: 'RLE', 2: 'ZIP', 3: 'ZIP+prediction' };


const DESC_TYPE_WHY = {
  comp: '**已支持**：readDescriptor（core/psd-parse.js）会记 `__comp` 标记，'
      + 'writeDescriptor（core/psd-descriptor.js）据此发 `comp` + u64 —— 本仓库用「造一个 comp 描述符再往返」'
      + '验证过逐字节一致。语料里没出现纯属**缺语料**，不是写不回去。'
      + '唯一的真限制：u64 读成 JS number，超过 2^53 会丢精度；那时写回自校验会发现对不上、整块退回 _raw'
      + '（宁可不解也不写坏往返）。',
  GlbC: '与 `type` 解析后形状完全相同（都是 `{__class, __name}`），写回统一发 `type`；'
      + '造 GlbC 语料只会写回成 type、字节对不上',
};


const WHY_SPEC = '规范未公开';
const WHY_CORPUS = '缺语料';
const WHY_TODO = '待实现';



function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(psd|psb)$/i.test(e.name)) out.push(p);
  }
  return out;
}
function collectFiles(extra) {
  
  
  
  const files = walk(path.join(ROOT, 'corpus'));
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (e.isFile() && /\.(psd|psb)$/i.test(e.name)) files.push(path.join(ROOT, e.name));
  }
  for (const x of extra) {
    const p = path.resolve(x);
    if (!fs.existsSync(p)) { console.warn(`跳过不存在的路径：${x}`); continue; }
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(psd|psb)$/i.test(p)) files.push(p);
  }
  return [...new Set(files)].sort();
}
















function tallyDescriptorTypes(v, key, parent, tally) {
  const bump = t => tally.set(t, (tally.get(t) || 0) + 1);
  if (v === null || v === undefined) return;
  if (v instanceof Uint8Array) return bump('tdta/alis');
  if (typeof v === 'string') return bump('TEXT');
  if (typeof v === 'boolean') return bump('bool');
  if (typeof v === 'number') {
    if (parent && parent.__long && parent.__long[key]) return bump('long');
    if (parent && parent.__doub && parent.__doub[key]) return bump('doub');
    return bump('comp');
  }
  if (Array.isArray(v)) {
    bump('VlLs');
    for (let i = 0; i < v.length; i++) tallyDescriptorTypes(v[i], String(i), v, tally);
    return;
  }
  if (typeof v !== 'object') return;
  if (v.__objectArray) bump('ObAr');
  else if (v.__unit !== undefined && Array.isArray(v.values)) return bump('UnFl');
  else if (v.__unit !== undefined) return bump('UntF');
  else if (v.__enumType !== undefined) return bump('enum');
  else if (v.__class !== undefined) return bump('type/GlbC');
  else if (v.__reference !== undefined) return bump('obj ');
  else bump('Objc/GlbO');
  for (const k of Object.keys(v)) {
    if (k.startsWith('__')) continue;
    tallyDescriptorTypes(v[k], k, v, tally);
  }
}



function collectSelectors(model, acc) {
  if (!model || typeof model !== 'object') return;
  const eat = recs => { for (const r of recs || []) bumpCount(acc.pathSelectors, r.selector); };
  if (Array.isArray(model.records)) eat(model.records);
  if (model.path && Array.isArray(model.path.records)) eat(model.path.records);
  if (Array.isArray(model.paths)) for (const p of model.paths) eat(p && p.records);
}


function descriptorsOf(model) {
  const out = [];
  if (!model || typeof model !== 'object') return out;
  if (model.desc) out.push(model.desc);
  if (model.descriptor) out.push(model.descriptor);
  if (Array.isArray(model.items)) for (const it of model.items) if (it && it.desc) out.push(it.desc);
  return out;
}



function scanFile(file, acc) {
  const rel = path.relative(ROOT, file);
  const bytes = new Uint8Array(fs.readFileSync(file));
  let doc;
  try { doc = parsePsdDocument(bytes); }
  catch (e) { acc.failures.push({ file: rel, stage: 'parse', message: String(e && e.message || e) }); return; }
  acc.files++;

  
  try {
    const back = serializePsdDocument(doc);
    let same = back.length === bytes.length;
    if (!same) {
      acc.failures.push({ file: rel, stage: 'round-trip', message: `长度 ${bytes.length} → ${back.length}` });
    } else {
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== back[i]) {
          same = false;
          acc.failures.push({ file: rel, stage: 'round-trip', message: `第 ${i} 字节不同` });
          break;
        }
      }
    }
    if (same) acc.roundTripOk++;
  } catch (e) { acc.failures.push({ file: rel, stage: 'round-trip', message: String(e && e.message || e) }); }

  for (const w of doc.warnings || []) acc.warnings.push({ file: rel, message: w });

  
  for (const res of doc.imageResources || []) {
    const e = bump(acc.resources, res.id, () => ({ id: res.id, name: resourceName(res.id), count: 0, semantic: 0, raw: 0, files: new Set() }));
    e.count++;
    e.files.add(rel);
    if (res._writeMode === 'semantic') e.semantic++; else e.raw++;
    if (res._semanticMismatch) e.mismatch = (e.mismatch || 0) + 1;
    if (res._parseError) e.parseError = res._parseError;
    
    if (!resourceHandler(res.id) && res._raw) probeUnknownResource(acc, res, rel);
    
    collectSelectors(res.data, acc);
    if (res.data) tallyDescriptorTypes(res.data.descriptor, 'descriptor', res.data, acc.descTypes);
  }

  
  const eatBlocks = (blocks, scope) => {
    for (const b of blocks || []) {
      const e = bump(acc.additional, b.key, () => ({ key: b.key, count: 0, semantic: 0, raw: 0, scopes: new Set(), files: new Set() }));
      e.count++;
      e.scopes.add(scope);
      e.files.add(rel);
      const kind = b.model && b.model._kind;
      if (kind === 'semantic' || kind === 'partial') e.semantic++; else e.raw++;
      if (b.model && b.model._error) e.error = b.model._error;
      for (const d of descriptorsOf(b.model)) tallyDescriptorTypes(d, null, null, acc.descTypes);
      collectSelectors(b.model, acc);
      if (b.key === 'Patt' || b.key === 'Pat2' || b.key === 'Pat3') scanPatterns(acc, b.model, rel);
      if (b.key === 'Txt2') scanEngineData(acc, b._raw, rel, 'Txt2');
      if (b.key === 'lsct' || b.key === 'lsdk') { if (b.model && b.model.blendKey) bumpCount(acc.blendModes, b.model.blendKey); }
    }
  };
  eatBlocks(doc.globalAdditional, 'global');
  for (const l of doc.layers || []) {
    eatBlocks(l.additionalBlocks, 'layer');
    if (l.blend && l.blend.key) bumpCount(acc.blendModes, l.blend.key);
    if (l.mask && l.mask.present) acc.stats.masks++;
    const tysh = (l.additionalBlocks || []).find(b => b.key === 'TySh');
    if (tysh) scanTyShEngineData(acc, tysh._raw, rel);
    collectSelectors(l.vectorMask, acc);
  }

  
  const H = doc.header;
  const modeName = COLOR_MODE[H.mode] || `未知(${H.mode})`;
  const seen = new Set();
  const note = (comp, ok, err) => {
    const key = `${modeName}|${H.depth}|${comp == null ? '—' : (COMPRESSION_NAMES[comp] || comp)}`;
    const e = bump(acc.pixels, key, () => ({ mode: modeName, depth: H.depth, comp: comp == null ? '—' : (COMPRESSION_NAMES[comp] || String(comp)), count: 0, ok: 0, fail: 0, files: new Set() }));
    e.count++;
    e.files.add(rel);
    if (ok) e.ok++; else { e.fail++; if (err && !e.error) e.error = err; }
    seen.add(key);
  };
  
  for (const l of doc.layers || []) {
    const w = l.bounds.right - l.bounds.left, h = l.bounds.bottom - l.bounds.top;
    for (const ch of l.channels || []) {
      if (ch.compression == null) continue;
      let ok = true, err = null;
      try {
        
        const mrect = ch.id === -3 ? (l.mask && l.mask.real) : ch.id === -2 ? l.mask : null;
        const cw = mrect ? mrect.right - mrect.left : w;
        const chh = mrect ? mrect.bottom - mrect.top : h;
        
        if (cw > 0 && chh > 0 && ch._raw && ch._raw.length >= 2) {
          decodeChannel({ bytes: ch._raw, width: cw, height: chh, depth: H.depth, psb: H.psb, strict: true });
        }
      } catch (e) { ok = false; err = String(e && e.message || e); }
      note(ch.compression, ok, err);
    }
  }
  
  if (doc.imageData && doc.imageData.compression != null) note(doc.imageData.compression, true, null);

  
  const cm = doc.colorModeData;
  if (cm) {
    const e = bump(acc.colorModeData, cm.kind || 'empty', () => ({ kind: cm.kind, count: 0, files: new Set() }));
    e.count++; e.files.add(rel);
    if (cm.kind === 'duotone') acc.duotone.push({ file: rel, length: cm.duotone.length, probe: cm.duotone._probe });
  }
}

function bump(map, key, make) {
  let e = map.get(key);
  if (!e) { e = make(); map.set(key, e); }
  return e;
}
function bumpCount(map, key) { if (key == null) return; map.set(key, (map.get(key) || 0) + 1); }



function scanPatterns(acc, model, rel) {
  for (const p of (model && model.patterns) || []) {
    const rec = { file: rel, name: p.name, colorMode: p.colorMode, id: p.id,
                  vmal: !!p.vmal, error: p._vmalError || p._error || null,
                  size: p.vmal ? `${p.vmal.width}×${p.vmal.height}` : null,
                  channels: p.vmal ? p.vmal.channels.filter(c => c.written).length : 0,
                  channelCount: p.vmal ? p.vmal.channelCount : null };
    if (p.vmal) {
      try {
        
        for (const ch of p.vmal.channels) if (ch.written) decodePatternChannel(ch);
        rec.pixels = !!patternToRGBA(p);
      } catch (e) { rec.pixels = false; rec.error = String(e && e.message || e); }
    }
    acc.patterns.push(rec);
  }
}

function checkEngineRoundTrip(acc, raw, rel, tag) {
  const entry = { file: rel, tag, length: raw ? raw.length : 0, ok: false, error: null };
  try {
    const fmt = detectEngineDataFormat(raw);
    entry.format = fmt;
    const back = serializeEngineData(parseEngineData(raw), { format: fmt });
    entry.ok = back.length === raw.length && back.every((b, i) => b === raw[i]);
    if (!entry.ok) entry.error = `写回 ${back.length} 字节 / 原文 ${raw.length} 字节`;
  } catch (e) { entry.error = String(e && e.message || e); }
  acc.engineData.push(entry);
}

function scanEngineData(acc, raw, rel, tag) {
  let end = raw.length;
  while (end > 0 && raw[end - 1] === 0) end--;
  checkEngineRoundTrip(acc, raw.subarray(0, end), rel, tag);
}


function scanTyShEngineData(acc, raw, rel) {
  try {
    const r = new Reader(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
    r.u16();
    for (let i = 0; i < 6; i++) r.f64();
    r.u16(); r.u32();
    const desc = readDescriptor(r);
    const ed = desc && desc['EngineData'];
    if (ed && ed.length) checkEngineRoundTrip(acc, ed, rel, 'TySh');
  } catch (e) {
    acc.engineData.push({ file: rel, tag: 'TySh', length: 0, ok: false, error: 'TySh 解析失败：' + (e && e.message) });
  }
}


function probeUnknownResource(acc, res, rel) {
  const b = res._raw;
  const e = bump(acc.unknownResources, res.id, () => ({ id: res.id, name: resourceName(res.id), samples: [] }));
  if (e.samples.length >= 4) return;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const shape = [];
  if (b.length === 0) shape.push('空');
  else if (b.length % 4 === 0 && b.length <= 64) {
    const words = [];
    for (let o = 0; o + 4 <= b.length; o += 4) words.push(dv.getUint32(o));
    shape.push(`${b.length / 4} × uint32 = [${words.join(', ')}]`);
    if (words.every(w => w === 0)) shape.push('全 0');
  } else if (b.length === 1 || b.length === 2) {
    shape.push(`${b.length} 字节 = ${[...b].join(' ')}`);
  } else {
    let printable = 0;
    for (const x of b) if (x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127)) printable++;
    shape.push(printable / b.length > 0.9 ? '疑似文本/XML' : '二进制');
    shape.push('前 16 字节 ' + [...b.subarray(0, 16)].map(x => x.toString(16).padStart(2, '0')).join(' '));
  }
  e.samples.push({ file: rel, length: b.length, shape: shape.join('；') });
}



function fmtTable(head, rows) {
  const lines = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
  for (const r of rows) lines.push('| ' + r.map(x => (x === null || x === undefined ? '' : String(x))).join(' | ') + ' |');
  return lines.join('\n');
}

function buildReport(acc, files) {
  const L = [];
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  L.push('# PSD 解析覆盖率报告');
  L.push('');
  L.push('> 由 `node tools/coverage.js` 生成，请勿手改。');
  L.push('> 把真实 Photoshop 导出的文件丢进 `corpus/real/` 后重跑，新出现的未覆盖项会自动进表。');
  L.push('');
  L.push(`生成时间：${now}　·　扫描文件：**${acc.files}**　·　字节级 round-trip：**${acc.roundTripOk}/${acc.files}**`);
  L.push('');
  L.push('未覆盖原因分三类：**规范未公开**（Adobe 没有公开格式，只能原样保留）、'
       + '**缺语料**（已实现或已知格式，但语料里没出现过，未经验证）、**待实现**（能做、还没做）。');
  L.push('');

  
  const resRows = [...acc.resources.values()].sort((a, b) => a.id - b.id).map(e => [
    e.id, e.name, e.count, e.files.size,
    e.semantic && !e.raw ? '语义' : e.semantic ? `语义 ${e.semantic} / raw ${e.raw}` : '仅 _raw',
    e.raw ? (resourceRawReason(e.id) || (e.mismatch ? '语义写回不一致，自动降级' : (resourceHandler(e.id) ? '解析失败' : '无处理器'))) : '',
  ]);
  const resSemantic = [...acc.resources.values()].filter(e => e.semantic > 0).length;
  L.push('## 1. 图像资源 ID');
  L.push('');
  L.push(`语料里出现 **${acc.resources.size}** 个不同资源 ID，其中 **${resSemantic}** 个走语义解析（其余原样往返）。`);
  L.push('');
  L.push(fmtTable(['ID', '名称', '出现次数', '文件数', '解析', '仅 _raw 的原因'], resRows));
  L.push('');
  const missingRes = SPEC_RESOURCE_IDS.filter(id => !acc.resources.has(id));
  L.push('### 未覆盖：规范列了但语料里没出现的资源 ID');
  L.push('');
  L.push(missingRes.length
    ? missingRes.map(id => `- \`${id}\` ${resourceName(id)} —— ${resourceHandler(id) ? WHY_CORPUS + '（已实现，未验证）' : (resourceRawReason(id) ? WHY_SPEC : WHY_TODO)}`).join('\n')
    : '（无）');
  L.push('');

  
  const regKinds = new Map(listAdditionalKeys().map(k => [k.key, k]));
  const addRows = [...acc.additional.values()].sort((a, b) => a.key.localeCompare(b.key)).map(e => {
    const h = regKinds.get(e.key);
    return [
      '`' + e.key + '`', h ? h.note.split('——')[0].trim() : '（未注册）', [...e.scopes].join('+'), e.count, e.files.size,
      e.semantic && !e.raw ? '语义' : e.semantic ? `语义 ${e.semantic} / raw ${e.raw}` : '仅 _raw',
      e.raw ? (h ? (h.kind === 'raw' ? h.note : (e.error || '写回不一致，自动降级')) : '未注册 key') : '',
    ];
  });
  const addSemantic = [...acc.additional.values()].filter(e => e.semantic > 0).length;
  L.push('## 2. 附加图层信息 key');
  L.push('');
  L.push(`注册表共 **${regKinds.size}** 个 key；语料里出现 **${acc.additional.size}** 个，其中 **${addSemantic}** 个走语义解析。`);
  L.push('');
  L.push(fmtTable(['key', '含义', '出现位置', '出现次数', '文件数', '解析', '仅 _raw 的原因'], addRows));
  L.push('');
  const missingKeys = [...new Set([...SPEC_ADDITIONAL_KEYS, ...regKinds.keys()])]
    .filter(k => !acc.additional.has(k)).sort();
  L.push('### 未覆盖：注册表/规范里有、语料里没出现的 key');
  L.push('');
  L.push(missingKeys.length
    ? missingKeys.map(k => {
        const h = regKinds.get(k);
        return `- \`${k}\` ${h ? h.note : '（规范里有，注册表未实现）'} —— ${h ? WHY_CORPUS : WHY_TODO}`;
      }).join('\n')
    : '（无）');
  L.push('');

  
  const pxRows = [...acc.pixels.values()]
    .sort((a, b) => a.mode.localeCompare(b.mode) || a.depth - b.depth || String(a.comp).localeCompare(String(b.comp)))
    .map(e => [e.mode, e.depth + ' 位', e.comp, e.count, e.files.size, e.fail ? `❌ ${e.fail} 失败` : '✅ 全部解码通过', e.error || '']);
  L.push('## 3. 色彩模式 × 位深 × 压缩');
  L.push('');
  L.push('「解码」= 用 `core/psd-image.js` 的 `decodeChannel` 真跑一遍该通道（合成图段只统计压缩标记，整段解码在 `server/test-image-data.js` 里做）。');
  L.push('');
  L.push(fmtTable(['色彩模式', '位深', '压缩', '通道数', '文件数', '解码', '备注'], pxRows));
  L.push('');
  const modesSeen = new Set([...acc.pixels.values()].map(e => e.mode));
  const modesMissing = Object.values(COLOR_MODE).filter(m => !modesSeen.has(m));
  const compsSeen = new Set([...acc.pixels.values()].map(e => e.comp));
  const compsMissing = Object.values(COMPRESSION_NAMES).filter(c => !compsSeen.has(c));
  L.push('### 未覆盖');
  L.push('');
  L.push(modesMissing.length ? `- 色彩模式：${modesMissing.map(m => '`' + m + '`').join('、')} —— ${WHY_CORPUS}` : '- 色彩模式：全部覆盖');
  L.push(compsMissing.length ? `- 压缩方式：${compsMissing.map(c => '`' + c + '`').join('、')} —— ${WHY_CORPUS}` : '- 压缩方式：全部覆盖');
  L.push('');

  
  L.push('## 4. 描述符类型 · 路径 selector · 混合模式');
  L.push('');
  const dtRows = SPEC_DESC_TYPES.map(t => {
    const hit = [...acc.descTypes.entries()].filter(([k]) => k === t || k.split('/').includes(t) || k.startsWith(t));
    const n = hit.reduce((s, [, v]) => s + v, 0);
    return ['`' + t + '`', n || 0, n ? '✅' : '—'];
  });
  L.push('### 描述符 OSType');
  L.push('');
  L.push('计数按 `core/psd-parse.js` 里 `readItem` 的输出形状反推；`tdta`/`alis`、`Objc`/`GlbO`、`type`/`GlbC` 解析后形状相同，合并统计。');
  L.push('');
  L.push(fmtTable(['OSType', '出现次数', '覆盖'], dtRows));
  L.push('');
  const dtMissing = SPEC_DESC_TYPES.filter(t => !dtRows.find(r => r[0] === '`' + t + '`' && r[1] > 0));
  L.push(dtMissing.length
    ? '未覆盖：' + dtMissing.map(t => `\`${t}\` —— ${DESC_TYPE_WHY[t] || WHY_CORPUS + '（解析器已实现，语料里没出现）'}`).join('；')
    : '未覆盖：无');
  L.push('');
  const selNames = Object.fromEntries(Object.entries(PATH_SELECTOR).map(([k, v]) => [v, k]));
  const selRows = Object.values(PATH_SELECTOR).sort((a, b) => a - b)
    .map(v => [v, selNames[v], acc.pathSelectors.get(v) || 0, acc.pathSelectors.get(v) ? '✅' : '—']);
  for (const [v, n] of acc.pathSelectors) if (selNames[v] === undefined) selRows.push([v, '（规范外）', n, '⚠️ 原样保留']);
  L.push('### 路径 selector');
  L.push('');
  L.push(fmtTable(['selector', '含义', '记录数', '覆盖'], selRows));
  L.push('');
  const selMissing = Object.entries(PATH_SELECTOR).filter(([, v]) => !acc.pathSelectors.get(v)).map(([k]) => k);
  L.push(selMissing.length ? `未覆盖：${selMissing.join('、')} —— ${WHY_CORPUS}（解析器已实现）` : '未覆盖：无');
  L.push('');
  const bmRows = SPEC_BLEND_MODES.map(m => ['`' + m + '`', acc.blendModes.get(m) || 0, acc.blendModes.get(m) ? '✅' : '—']);
  for (const [m, n] of acc.blendModes) if (!SPEC_BLEND_MODES.includes(m)) bmRows.push(['`' + m + '`（规范外）', n, '⚠️']);
  L.push('### 混合模式');
  L.push('');
  L.push(fmtTable(['blend key', '出现次数', '覆盖'], bmRows));
  L.push('');
  const bmMissing = SPEC_BLEND_MODES.filter(m => !acc.blendModes.get(m));
  L.push(bmMissing.length ? `未覆盖：${bmMissing.map(m => '`' + m + '`').join('、')} —— ${WHY_CORPUS}（混合模式只是 4 字符键，解析上无差别）` : '未覆盖：无');
  L.push('');

  
  L.push('## 5. 专项');
  L.push('');
  L.push('### 5.1 图案（Patt / Pat2 / Pat3）虚拟内存数组列表');
  L.push('');
  if (acc.patterns.length) {
    L.push(fmtTable(['文件', '图案名', '色彩模式', '尺寸', '通道槽', '已写入通道', 'VMAL', '像素解码'],
      acc.patterns.map(p => [p.file, p.name, p.colorMode, p.size || '', p.channelCount ?? '', p.channels,
                             p.vmal ? '✅' : '❌ ' + (p.error || ''), p.pixels ? '✅' : (p.vmal ? '❌ ' + (p.error || '') : '—')])));
  } else L.push(`（语料里没有图案块）—— ${WHY_CORPUS}`);
  L.push('');
  L.push('### 5.2 EngineData 字节级往返');
  L.push('');
  if (acc.engineData.length) {
    const okN = acc.engineData.filter(e => e.ok).length;
    L.push(`**${okN}/${acc.engineData.length}** 段 EngineData 做到 \`serialize(parse(b)) === b\`。`);
    L.push('');
    L.push(fmtTable(['文件', '来源', '排版', '字节数', '往返', '备注'],
      acc.engineData.map(e => [e.file, e.tag, e.format || '', e.length, e.ok ? '✅' : '❌', e.error || ''])));
  } else L.push(`（语料里没有文字图层）—— ${WHY_CORPUS}`);
  L.push('');
  L.push('### 5.3 色彩模式数据（Color Mode Data）');
  L.push('');
  L.push(fmtTable(['类型', '文件数'], [...acc.colorModeData.values()].map(e => [e.kind, e.count])));
  L.push('');
  if (acc.duotone.length) {
    L.push('双色调设定块（`mode=8`）：');
    L.push('');
    for (const d of acc.duotone) {
      L.push(`- \`${d.file}\`：${d.length} 字节，探针置信度 \`${d.probe.confidence}\``
        + (d.probe.unrecognized ? `，${d.probe.unrecognized}` : '')
        + (d.probe.layoutCandidates && d.probe.layoutCandidates.length ? `，候选布局 ${d.probe.layoutCandidates.map(c => c.layout).join(' / ')}` : '')
        + (d.probe.curveCandidates ? `，找到 ${d.probe.curveCandidates.length} 段疑似传递曲线` : ''));
    }
  } else {
    L.push(`双色调设定块：语料里**没有任何真实 Photoshop 导出的双色调文件** —— ${WHY_SPEC} + ${WHY_CORPUS}。`);
  }
  L.push('');
  L.push('> Adobe 规范对双色调设定块只写了「格式不公开，请原样保留」。本项目的做法是：'
       + '`_raw` 保证无损往返，`colorModeData.duotone._probe` 给出可证伪的结构探针（版本、油墨数、'
       + '候选布局是否长度自洽、疑似传递曲线的位置），**不编造字段名**。'
       + '要变成真语义，需要往 `corpus/real/` 放几份 Photoshop 存的单色调/双色调/三色调文件。');
  L.push('');
  L.push('### 5.4 无语义处理器的资源 ID —— 结构探针');
  L.push('');
  if (acc.unknownResources.size) {
    const rows = [];
    for (const e of [...acc.unknownResources.values()].sort((a, b) => a.id - b.id)) {
      for (const s of e.samples) rows.push([e.id, e.name, s.file, s.length, s.shape]);
    }
    L.push(fmtTable(['ID', '名称', '样本文件', '字节数', '观察到的形状'], rows));
    L.push('');
    L.push('以上一律 `_raw` 原样往返。其中 1028（IPTC-NAA）、1058（EXIF）、1060（XMP）这类是**另有独立规范的外部数据流**，'
         + `不属于 PSD 语义范围；1089–1093 / 1096 / 1097 这段是 ${WHY_SPEC}（Photoshop CC 之后新增、规范未收录）。`);
    L.push('这里只记录**可复核的观察**（长度、按 uint32 切开的字、是否全 0、前若干字节），**不做语义猜测**；'
         + '想推进就往 `corpus/real/` 多放几份不同设置的真实文件，对比这几个块随什么设置变化。');
  } else L.push('（本次扫描没有遇到未注册的资源 ID）');
  L.push('');

  
  if (acc.failures.length) {
    L.push('## 附录 A：解析 / round-trip 失败');
    L.push('');
    L.push(fmtTable(['文件', '阶段', '信息'], acc.failures.map(f => [f.file, f.stage, f.message])));
    L.push('');
  }
  if (acc.warnings.length) {
    const byMsg = new Map();
    for (const w of acc.warnings) bump(byMsg, w.message, () => ({ message: w.message, files: new Set() })).files.add(w.file);
    L.push('## 附录 B：解析告警（不影响往返，但说明有东西没读懂）');
    L.push('');
    L.push(fmtTable(['告警', '文件数', '例子'], [...byMsg.values()].map(e => [e.message, e.files.size, [...e.files][0]])));
    L.push('');
  }
  L.push('## 附录 C：扫描到的文件');
  L.push('');
  L.push(`共 ${files.length} 个：`);
  L.push('');
  L.push('```');
  L.push(files.map(f => path.relative(ROOT, f)).join('\n'));
  L.push('```');
  L.push('');
  return L.join('\n');
}



function main(argv) {
  const extra = [];
  let out = path.join(ROOT, 'docs', 'psd-coverage.md');
  let write = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = path.resolve(argv[++i]);
    else if (argv[i] === '--no-write') write = false;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('用法：node tools/coverage.js [文件或目录…] [--out docs/psd-coverage.md] [--no-write]');
      return 0;
    } else extra.push(argv[i]);
  }

  const files = collectFiles(extra);
  if (!files.length) {
    console.error('没有找到任何 .psd/.psb —— 先跑 `node tools/build-corpus.js` 生成语料，或在命令行给出路径。');
    return 1;
  }

  const acc = {
    files: 0, roundTripOk: 0,
    resources: new Map(), additional: new Map(), pixels: new Map(), colorModeData: new Map(),
    descTypes: new Map(), pathSelectors: new Map(), blendModes: new Map(),
    unknownResources: new Map(),
    patterns: [], engineData: [], duotone: [],
    failures: [], warnings: [], stats: { masks: 0 },
  };
  for (const f of files) scanFile(f, acc);

  const md = buildReport(acc, files);
  if (write) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md);
  }

  
  const resSemantic = [...acc.resources.values()].filter(e => e.semantic > 0).length;
  const addSemantic = [...acc.additional.values()].filter(e => e.semantic > 0).length;
  const regCount = listAdditionalKeys().length;
  const edOk = acc.engineData.filter(e => e.ok).length;
  const patOk = acc.patterns.filter(p => p.vmal).length;
  const pxFail = [...acc.pixels.values()].reduce((s, e) => s + e.fail, 0);
  console.log('');
  console.log('PSD 解析覆盖率摘要');
  console.log('─'.repeat(58));
  console.log(`  扫描文件            ${acc.files}`);
  console.log(`  字节级 round-trip   ${acc.roundTripOk}/${acc.files}${acc.roundTripOk === acc.files ? '  ✅' : '  ❌'}`);
  console.log(`  图像资源 ID         语义 ${resSemantic}/${acc.resources.size}（语料中出现的不同 ID）`);
  console.log(`  附加信息 key        语义 ${addSemantic}/${acc.additional.size}（注册表共 ${regCount} 个）`);
  console.log(`  色彩模式×位深×压缩  ${acc.pixels.size} 种组合，解码失败 ${pxFail}`);
  console.log(`  描述符 OSType       ${SPEC_DESC_TYPES.filter(t => [...acc.descTypes.keys()].some(k => k === t || k.split('/').includes(t))).length}/${SPEC_DESC_TYPES.length}`);
  console.log(`  路径 selector       ${[...acc.pathSelectors.keys()].length}/${Object.keys(PATH_SELECTOR).length}`);
  console.log(`  混合模式            ${SPEC_BLEND_MODES.filter(m => acc.blendModes.get(m)).length}/${SPEC_BLEND_MODES.length}`);
  console.log(`  图案 VMAL           ${patOk}/${acc.patterns.length}`);
  console.log(`  EngineData 往返     ${edOk}/${acc.engineData.length}`);
  console.log(`  双色调样本          ${acc.duotone.length}${acc.duotone.length ? '' : '（无 —— 双色调语义仍是结构探针）'}`);
  console.log(`  未注册资源 ID       ${acc.unknownResources.size}`);
  if (acc.failures.length) {
    console.log('');
    console.log(`  ❌ ${acc.failures.length} 处失败：`);
    for (const f of acc.failures.slice(0, 10)) console.log(`     ${f.file} [${f.stage}] ${f.message}`);
    if (acc.failures.length > 10) console.log(`     …还有 ${acc.failures.length - 10} 条`);
  }
  console.log('─'.repeat(58));
  if (write) console.log(`报告已写入 ${path.relative(process.cwd(), out)}`);
  console.log('');
  return acc.failures.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
