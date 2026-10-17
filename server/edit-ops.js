




















import {
  parseSmartObjects, toFoxpsdLayerInfo,
  smartObjectFragment, replacePlacedBlocks,
  resolveFragment, writebackFragment,
  deformToJSON, deformFromJSON,
  decodeSmartObject, buildSoLdRewrite,
  lintPsd,
} from './private/index.js';
import { parsePsdDocument, serializePsdDocument } from '../core/psd-document.js';
import {
  parseTyShData, buildTyShFromText, buildBlock, encodeUnicode,
  normalizeIncrementalOp, incrementalFragmentSpecs, fragmentChecksum,
} from '../core/psd-parse.js';
import { BLEND_KEYS, encodePascalName } from '../core/psd-edit.js';
import { parseEngineData } from '../core/engine-data.js';
import { setEngineFont } from '../core/psd-text.js';
import { preparePsdRender, writePsdOutput } from './pipeline.js';



const toAB = b => b instanceof ArrayBuffer ? b
  : ArrayBuffer.isView(b) ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  : (() => { throw new Error('需要 Buffer / Uint8Array / ArrayBuffer'); })();

const toU8 = b => b instanceof ArrayBuffer ? new Uint8Array(b)
  : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  : (() => { throw new Error('需要 Buffer / Uint8Array / ArrayBuffer'); })();

const asBuffer = u8 => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);


export class EditOpError extends Error {
  constructor(message, code = 'edit-op') { super(message); this.name = 'EditOpError'; this.code = code; }
}
const bad = (m, code) => { throw new EditOpError(m, code); };

const boundsDist = (a, b) => Math.abs(a.left - b.left) + Math.abs(a.top - b.top)
                           + Math.abs(a.right - b.right) + Math.abs(a.bottom - b.bottom);

const layerLabel = l => l.unicodeName || l.name || '(未命名)';



















export function resolveTarget(buffer, target, opts = {}) {
  const ab = toAB(buffer);
  let doc;
  try { doc = parsePsdDocument(ab); }
  catch (e) { bad('PSD 解析失败，无法寻址：' + (e && e.message || e), 'parse'); }
  let sos = [];
  try { sos = parseSmartObjects(ab); } catch { sos = []; }

  const layers = doc.layers || [];
  const names = () => layers.map((l, i) => `${i}:${layerLabel(l)}`).join(' / ');
  const soNames = () => sos.length ? sos.map((s, i) => `${i}:${s.layerName}`).join(' / ') : '(无)';

  
  const layerOfSO = si => {
    const so = sos[si];
    let best = -1, bestScore = Infinity;
    layers.forEach((l, idx) => {
      if (!l.smartObject) return;
      const score = (layerLabel(l) === so.layerName ? 0 : 1000) + boundsDist(l.bounds, so.bounds);
      if (score < bestScore) { bestScore = score; best = idx; }
    });
    return best;
  };
  const soOfLayer = idx => {
    const l = layers[idx];
    if (!l) return -1;
    let best = -1, bestScore = Infinity;
    sos.forEach((s, si) => {
      const score = (layerLabel(l) === s.layerName ? 0 : 1000) + boundsDist(l.bounds, s.bounds);
      if (score < bestScore) { bestScore = score; best = si; }
    });
    return bestScore < 1000 ? best : -1;      
  };

  const bySO = si => {
    if (!Number.isInteger(si) || si < 0 || si >= sos.length)
      bad(`智能对象序号 ${si} 越界（共 ${sos.length} 个）。可用：${soNames()}`, 'target');
    const li = layerOfSO(si);
    if (li < 0) bad(`智能对象「${sos[si].layerName}」在图层树里找不到对应图层`, 'target');
    return pack(li, si);
  };
  const byLayer = li => {
    if (!Number.isInteger(li) || li < 0 || li >= layers.length)
      bad(`图层下标 ${li} 越界（共 ${layers.length} 层）。可用：${names()}`, 'target');
    return pack(li, soOfLayer(li));
  };
  const pack = (li, si) => {
    const l = layers[li];
    return {
      layerIndex: li, layerName: layerLabel(l), bounds: { ...l.bounds },
      isSmartObject: !!l.smartObject,
      smartObjectIndex: si, smartObjectName: si >= 0 ? sos[si].layerName : null,
      kind: si >= 0 ? sos[si].kind : null,
    };
  };

  if (target == null) {
    if (!sos.length) bad('该 PSD 里没有智能对象（SoLd/PlLd），target 不能省略', 'target');
    return bySO(0);
  }
  if (typeof target === 'object' && !Array.isArray(target)) {
    const si = target.smartObjectIndex ?? target.smartObject ?? target.soIndex;
    if (si != null) return bySO(+si);
    if (target.layerIndex != null) return byLayer(+target.layerIndex);
    if (target.name != null) return byName(String(target.name));
    bad('target 对象须含 layerIndex / smartObjectIndex / name 之一', 'target');
  }
  if (typeof target === 'number' || (typeof target === 'string' && /^-?\d+$/.test(target.trim()))) {
    const n = +target;
    return (opts.numberMeans === 'layerIndex') ? byLayer(n) : bySO(n);
  }
  if (typeof target === 'string') return byName(target);
  bad(`无法识别的 target：${JSON.stringify(target)}`, 'target');

  function byName(name) {
    const hits = [];
    layers.forEach((l, i) => { if (layerLabel(l) === name) hits.push(i); });
    if (!hits.length) {
      
      const si = sos.findIndex(s => s.layerName === name);
      if (si >= 0) return bySO(si);
      bad(`找不到名为「${name}」的图层。可用图层：${names()}；可用智能对象：${soNames()}`, 'target');
    }
    if (hits.length > 1) bad(`图层名「${name}」不唯一（第 ${hits.join(' / ')} 层重名），请改用 { layerIndex } 精确定位`, 'target');
    return byLayer(hits[0]);
  }
}














export async function applySmartObjectReplace(buffer, op, ctx = {}) {
  if (!op || typeof op !== 'object') bad('op 缺失', 'op');
  if (op.image == null) bad('op.image 缺失（要换的新图）', 'op');
  const ab = toAB(buffer);

  
  
  const t = resolveTarget(ab, op.target);
  if (t.smartObjectIndex < 0)
    bad(`图层 ${t.layerIndex}「${t.layerName}」不是智能对象，无法换源图`, 'target');

  const replacement = {
    target: t.smartObjectIndex,
    image: op.image,
    fit: op.fit || { mode: 'cover' },
    ...(op.sourceName || op.filename ? { sourceName: op.sourceName || op.filename } : {}),
  };

  const render = await preparePsdRender({
    psd: ab,
    replacements: [replacement],
    output: { ...(ctx.output || {}), format: 'psd' },
    render: ctx.render || {},
  });
  const r = await writePsdOutput(render);

  const a = render.applied[0] || {};
  return {
    buffer: r.buffer,
    meta: {
      ...r.meta,
      op: 'smartObjectReplace',
      target: t,
      sourceReplaced: a.sourceReplaced ?? null,
      
    },
  };
}







function normalizeEdit(src) {
  if (!src || typeof src !== 'object') bad('edit 缺失（须提供 points 或 deform）', 'edit');
  const e = src.edit && typeof src.edit === 'object' ? src.edit : src;
  if (e.deform || (Array.isArray(e.deforms) && e.deforms.length)) {
    
    const raw = Array.isArray(e.deforms) && e.deforms.length
      ? e.deforms.map(x => (x && x.deform ? x : { deform: x }))
      : [{ deform: e.deform, at: e.at, create: !!e.create }];
    const out = raw.map((x, i) => {
      let d;
      
      try { d = deformToJSON(deformFromJSON(x.deform)); }
      catch (err) { bad(`第 ${i + 1} 条 deform 结构非法：` + (err && err.message || err), 'edit'); }
      if (!d || !d.kind) bad(`第 ${i + 1} 条 deform 缺少 kind（perspectiveWarp / puppetWarp）`, 'edit');
      return { deform: d, ...(x.at != null ? { at: x.at } : {}), create: !!x.create };
    });
    return { deforms: out, deform: out[0].deform, at: out[0].at, create: out.some(x => x.create) };
  }
  if (Array.isArray(e.points)) {
    if (!e.points.length) bad('edit.points 为空', 'edit');
    const xn = e.xn | 0, yn = e.yn | 0;
    if (xn > 0 && yn > 0 && xn * yn !== e.points.length)
      bad(`控制点数 ${e.points.length} 与 ${xn}×${yn} 不符`, 'edit');
    return { points: e.points.map(p => ({ x: +p.x, y: +p.y })), xn, yn,
             sliceX: (e.sliceX || []).map(Number), sliceY: (e.sliceY || []).map(Number) };
  }
  bad('edit 须包含 points（网格）或 deform（变形滤镜）', 'edit');
}


function assertEditFits(fragment, edit) {
  let info;
  try { info = resolveFragment(fragment); }
  catch (e) { bad('放置块无法解析：' + (e && e.message || e), 'fragment'); }
  const df = info.summary.deformFilter;
  const name = fragment.layerName || '(未命名)';
  if (df && edit.points)
    bad(`智能对象「${name}」是${df.name || df.kind}滤镜变形，没有 Bezier 网格，不能用 points/mesh 写回（请传 deform）`, 'edit');
  const dEdits = edit.deforms || (edit.deform ? [{ deform: edit.deform, at: edit.at, create: edit.create }] : []);
  if (!df && dEdits.some(x => !x.create))
    bad(`智能对象「${name}」上没有变形滤镜，不能用 deform 写回（改用 points，或带 create 新建一条）`, 'edit');
  const have = (info.summary.deformFilters || []).length;
  if (dEdits.filter(x => !x.create).length > have)
    bad(`智能对象「${name}」上只有 ${have} 条变形滤镜，改不了 ${dEdits.filter(x => !x.create).length} 条`, 'edit');
  if (edit.points) {
    const li = info.layerInfo || {};
    const regular = li.points && li.xn && li.yn && li.points.length === li.xn * li.yn;
    if (!regular && !(edit.xn > 0 && edit.yn > 0))
      bad(`智能对象「${name}」当前不是规则网格（${li.xn}×${li.yn}），改点数时必须同时给出 xn / yn`, 'edit');
  }
  return info;
}







export function applyDeformFragment(fragment, edit) {
  const e = normalizeEdit(edit);
  assertEditFits(fragment, e);
  try { return writebackFragment(fragment, e); }
  catch (err) { bad('变形写回失败：' + (err && err.message || err), 'writeback'); }
}










export function applyDeform(buffer, op) {
  if (!op || typeof op !== 'object') bad('op 缺失', 'op');
  const ab = toAB(buffer);
  const t = resolveTarget(ab, op.target);
  if (t.smartObjectIndex < 0)
    bad(`图层 ${t.layerIndex}「${t.layerName}」不是智能对象，没有可写回的放置块`, 'target');

  const sos = parseSmartObjects(ab);
  const so = sos[t.smartObjectIndex];
  const fragment = smartObjectFragment(ab, so);
  const { mode, blocks } = applyDeformFragment(fragment, op);

  let out;
  try { out = replacePlacedBlocks(ab, so, blocks); }
  catch (e) { bad('放置块拼回失败：' + (e && e.message || e), 'writeback'); }

  return {
    buffer: asBuffer(toU8(out)),
    meta: {
      op: 'deform', mode, target: t,
      blocks: blocks.map(b => ({ key: b.key, bytes: b.data.length })),
      bytesDelta: toU8(out).length - new Uint8Array(ab).length,
    },
  };
}


export function inspectTarget(buffer, target) {
  const ab = toAB(buffer);
  const t = resolveTarget(ab, target);
  if (t.smartObjectIndex < 0) return { target: t, layerInfo: null, summary: null };
  const so = parseSmartObjects(ab)[t.smartObjectIndex];
  const li = toFoxpsdLayerInfo(so);
  const { layerInfo, layerInfoBase, summary } = resolveFragment(smartObjectFragment(ab, so));
  return { target: t, layerInfo, layerInfoBase, summary,
           deformName: li.deform ? li.deformName : null };
}










function normalizeDescriptorEdit(src) {
  if (!src || typeof src !== 'object') bad('edit 缺失', 'edit');
  const e = src.edit && typeof src.edit === 'object' ? src.edit : src;
  const out = {};
  for (const k of ['linkId', 'placedId']) {
    if (e[k] === undefined) continue;
    if (typeof e[k] !== 'string' || !e[k].length || e[k].length > 128) bad(`${k} 必须是 1…128 字符的字符串`, 'edit');
    out[k] = e[k];
  }
  if (e.originalSize !== undefined) {
    const s = e.originalSize;
    if (!s || !Number.isFinite(+s.width) || !Number.isFinite(+s.height) || +s.width <= 0 || +s.height <= 0)
      bad('originalSize 必须是 { width>0, height>0 }', 'edit');
    out.originalSize = { width: +s.width, height: +s.height };
  }
  if (!Object.keys(out).length)
    bad('setSmartObjectDescriptor 没有给出任何要改的字段（linkId / placedId / originalSize）', 'edit');
  return out;
}


const setDescNum = (obj, k, v) => {
  const cur = obj[k];
  obj[k] = (cur && typeof cur === 'object' && 'value' in cur) ? { ...cur, value: v } : v;
};


export function applySmartObjectDescriptorFragment(fragment, edit) {
  const e = normalizeDescriptorEdit(edit);
  let so;
  try { so = decodeSmartObject({ layerName: String(fragment.layerName || ''), bounds: fragment.bounds,
                                 kind: fragment.kind, psb: !!fragment.psb, blocks: fragment.blocks }, null); }
  catch (err) { bad('放置块无法解析：' + (err && err.message || err), 'fragment'); }
  if (!so) bad('放置块无法解析（不是有效的 SoLd/PlLd 数据）', 'fragment');
  try {
    const blocks = buildSoLdRewrite(so, desc => {
      if (e.linkId !== undefined) desc['Idnt'] = e.linkId;
      if (e.placedId !== undefined) desc['placed'] = e.placedId;
      if (e.originalSize) {
        const sz = desc['Sz  '] || desc['Sz'];
        if (!sz || typeof sz !== 'object') bad('该智能对象的 SoLd 描述符里没有 Sz（原始尺寸），不能改 originalSize', 'edit');
        setDescNum(sz, 'Wdth', e.originalSize.width);
        setDescNum(sz, 'Hght', e.originalSize.height);
      }
      return desc;
    });
    return { mode: 'descriptor', blocks };
  } catch (err) {
    if (err instanceof EditOpError) throw err;
    bad('放置描述符写回失败：' + (err && err.message || err), 'writeback');
  }
}


export function applySmartObjectDescriptor(buffer, op) {
  if (!op || typeof op !== 'object') bad('op 缺失', 'op');
  const ab = toAB(buffer);
  const t = resolveTarget(ab, op.target);
  if (t.smartObjectIndex < 0)
    bad(`图层 ${t.layerIndex}「${t.layerName}」不是智能对象，没有可改的放置描述符`, 'target');
  const so = parseSmartObjects(ab)[t.smartObjectIndex];
  const { blocks } = applySmartObjectDescriptorFragment(smartObjectFragment(ab, so), op);
  let out;
  try { out = replacePlacedBlocks(ab, so, blocks); }
  catch (e) { bad('放置块拼回失败：' + (e && e.message || e), 'writeback'); }
  return {
    buffer: asBuffer(toU8(out)),
    meta: { op: 'setSmartObjectDescriptor', mode: 'descriptor', target: t,
            blocks: blocks.map(b => ({ key: b.key, bytes: b.data.length })),
            bytesDelta: toU8(out).length - new Uint8Array(ab).length },
  };
}
















const MAX_INCREMENTAL_FRAGMENTS = 64;
const MAX_FRAGMENT_BYTES = 8 * 1024 * 1024;


function splitBlock(bytes, where) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) bad(`${where}：附加块片段太短（至少 12 字节）`, 'fragment');
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (sig !== '8BIM' && sig !== '8B64') bad(`${where}：附加块片段不以 8BIM/8B64 开头（切错区间了？）`, 'fragment');
  const key = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = dv.getUint32(8);
  if (12 + len > bytes.length) bad(`${where}：${key} 块长度 ${len} 超出片段本身（${bytes.length - 12}）`, 'fragment');
  return { sig, key, len, data: bytes.subarray(12, 12 + len) };
}


function editBlendBytes(src, op) {
  if (src.length !== 8) bad('layerBlend 片段必须正好 8 字节（blendKey/opacity/clipping/flags/filler）', 'fragment');
  const out = src.slice();
  if (op.blendKey !== undefined) {
    if (typeof op.blendKey !== 'string' || op.blendKey.length !== 4)
      bad(`blendKey 必须是 4 个字符（不足补空格，如 'mul '），收到 ${JSON.stringify(op.blendKey)}`, 'edit');
    if (!BLEND_KEYS.has(op.blendKey))
      bad(`blendKey "${op.blendKey}" 不是 PS 认识的混合模式；可用：${[...BLEND_KEYS].join(' ')}`, 'edit');
    for (let i = 0; i < 4; i++) out[i] = op.blendKey.charCodeAt(i) & 0xff;
  }
  if (op.opacity !== undefined) {
    if (!Number.isInteger(op.opacity) || op.opacity < 0 || op.opacity > 255)
      bad(`opacity 必须是 0…255 的整数（255 = 不透明），收到 ${JSON.stringify(op.opacity)}`, 'edit');
    out[4] = op.opacity & 0xff;
  }
  if (op.clipping !== undefined) {
    if (typeof op.clipping !== 'boolean' && op.clipping !== 0 && op.clipping !== 1)
      bad('clipping 必须是布尔值或 0/1', 'edit');
    out[5] = op.clipping ? 1 : 0;
  }
  if (op.visible !== undefined) {
    if (typeof op.visible !== 'boolean') bad('visible 必须是布尔值', 'edit');
    out[6] = op.visible ? (out[6] & ~0x02) : (out[6] | 0x02);   
  }
  return out;
}


function fragmentGuard(kind, out, ctx) {
  if (kind === 'layerBlend') {
    const k = String.fromCharCode(out[0], out[1], out[2], out[3]);
    if (!BLEND_KEYS.has(k)) throw new EditOpError(`产出的混合模式键「${k}」不合法`, 'writeback');
    return;
  }
  if (kind === 'layerBlock') {
    const b = splitBlock(out, '产出的附加块');
    if (b.key !== ctx.key) throw new EditOpError(`产出的附加块 key 是 ${b.key}，期望 ${ctx.key}`, 'writeback');
    if (b.key === 'TySh') {
      let t;
      try { t = parseTyShData(b.data); }
      catch (e) { throw new EditOpError('产出的 TySh 块无法重新解析：' + (e && e.message || e), 'writeback'); }
      if (ctx.text !== undefined && t.text && t.text['Txt '] !== ctx.text)
        throw new EditOpError('产出的 TySh 块里读回的文字与请求不一致', 'writeback');
    }
    return;
  }
  if (kind === 'placedBlocks') {
    try { resolveFragment({ layerName: ctx.layerName, bounds: ctx.bounds, kind: ctx.soKind, psb: ctx.psb, blocks: ctx.merged }); }
    catch (e) { throw new EditOpError('产出的放置块无法重新解析：' + (e && e.message || e), 'writeback'); }
  }
}








export function runIncrementalOps(req) {
  const { doc = {}, fragments = [], ops = [] } = req || {};
  if (!Array.isArray(fragments)) bad('fragments 必须是数组', 'fragment');
  if (fragments.length > MAX_INCREMENTAL_FRAGMENTS)
    bad(`一次最多 ${MAX_INCREMENTAL_FRAGMENTS} 个片段，收到 ${fragments.length}`, 'fragment');
  const psb = !!doc.psb;
  const byId = new Map();
  for (const f of fragments) {
    if (!f || typeof f.id !== 'string' || !f.id) bad('片段缺少 id', 'fragment');
    if (byId.has(f.id)) bad(`片段 id「${f.id}」重复`, 'fragment');
    byId.set(f.id, f);
  }

  const results = [], warnings = [];
  const patched = new Map();        
  const sideEffects = [];
  const pick = (op, i, kind, key) => {
    const want = key ? `${kind}:${op.index}:${key}:0` : `${kind}:${op.index}`;
    const f = byId.get(want)
      || fragments.find(x => x.kind === kind && x.layerIndex === op.index && (!key || (x.meta && x.meta.key === key)));
    if (!f) {
      const e = new EditOpError(`ops[${i}]「${op.op}」缺少片段 ${want}`, 'fragment');
      e.need = [{ kind, layerIndex: op.index, ...(key ? { key } : {}) }];
      throw e;
    }
    return f;
  };

  ops.forEach((raw, i) => {
    let op;
    try { op = normalizeIncrementalOp(raw); }
    catch (e) { bad(`ops[${i}]：${e.message}`, 'op'); }
    
    try { incrementalFragmentSpecs(raw); } catch (e) { bad(`ops[${i}]：${e.message}`, 'op'); }
    const rec = { i, op: op.op, alias: op._alias || null, ok: true, fragments: [] };

    if (op.op === 'setLayerProps') {
      const uni = op.unicodeName !== undefined ? op.unicodeName : op.name;
      if (uni !== undefined) {
        if (typeof uni !== 'string' || !uni.length) bad(`ops[${i}]：图层名必须是非空字符串`, 'edit');
        if (uni.length > 255) bad(`ops[${i}]：图层名太长（${uni.length} 字符 > 255）`, 'edit');
      }
      if (['visible', 'opacity', 'clipping', 'blendKey'].some(k => op[k] !== undefined)) {
        const f = pick(op, i, 'layerBlend');
        const cur = patched.get(f.id)?.data || f.data;
        const out = editBlendBytes(cur, op);
        fragmentGuard('layerBlend', out);
        patched.set(f.id, { data: out });
        rec.fragments.push(f.id);
      }
      if (uni !== undefined) {
        const f = pick(op, i, 'layerBlock', 'luni');
        const out = buildBlock('luni', encodeUnicode(uni), psb);
        fragmentGuard('layerBlock', out, { key: 'luni' });
        patched.set(f.id, { data: out });
        rec.fragments.push(f.id);
      }
      if (op.name !== undefined) {
        const f = pick(op, i, 'layerName');
        const { bytes, lossy } = encodePascalName(op.name);
        if (lossy) warnings.push(`ops[${i}]：Pascal 名含非 ASCII 字符，已按 '?' 落地（真名在 luni 块里，PS 显示的是 luni）`);
        patched.set(f.id, { data: bytes });
        rec.fragments.push(f.id);
      }
      rec.changedFields = ['name', 'unicodeName', 'visible', 'opacity', 'clipping', 'blendKey'].filter(k => op[k] !== undefined);
      rec.note = `图层 ${op.index} → ${rec.changedFields.join('/')}`;
      results.push(rec);
      return;
    }

    if (op.op === 'setText') {
      if (typeof op.text !== 'string') bad(`ops[${i}]：text 必须是字符串`, 'edit');
      const f = pick(op, i, 'layerBlock', 'TySh');
      const blk = splitBlock(patched.get(f.id)?.data || f.data, `ops[${i}] 的 TySh 片段`);
      if (blk.key !== 'TySh') bad(`ops[${i}]：片段 ${f.id} 是 ${blk.key} 块，不是 TySh`, 'fragment');
      let layerLike;
      try { layerLike = parseTyShData(blk.data); }
      catch (e) { bad(`ops[${i}]：TySh 块解析失败（${e && e.message || e}）`, 'fragment'); }
      const opts = { ...(op.opts || {}) };
      if (opts.font && layerLike.text && layerLike.text['EngineData'] && layerLike.text['EngineData'].length) {
        
        const ed = parseEngineData(layerLike.text['EngineData']);
        setEngineFont(ed, opts.font);
        opts.engineData = ed;
      }
      let data;
      try { data = buildTyShFromText(layerLike, op.text, opts); }
      catch (e) { bad(`ops[${i}]：改文字失败（${e && e.message || e}）`, 'edit'); }
      const out = buildBlock('TySh', data, psb);
      const wanted = String(op.text).replace(/\r?\n/g, '\r');
      fragmentGuard('layerBlock', out, { key: 'TySh', text: wanted });
      patched.set(f.id, { data: out });
      rec.fragments.push(f.id);
      
      
      if (!opts.keepTxt2) sideEffects.push({ type: 'removeGlobalBlocks', keys: ['Txt2'] });
      else warnings.push(`ops[${i}]：keepTxt2 保留了全局 Txt2，PS 打开可能仍显示旧文字`);
      rec.changed = true;
      rec.note = `图层 ${op.index} 文字 → ${op.text.length} 字符`;
      results.push(rec);
      return;
    }

    
    const f = pick(op, i, 'placedBlocks');
    if (!Array.isArray(f.blocks) || !f.blocks.length) bad(`ops[${i}]：placedBlocks 片段里没有块`, 'fragment');
    const cur = patched.get(f.id)?.blocks || f.blocks;
    const soKind = (cur.find(b => b.key === 'SoLd') || cur[cur.length - 1]).key;
    const frag = { layerName: f.layerName || '', bounds: f.bounds, kind: soKind, psb,
                   blocks: cur.map(b => ({ key: b.key, data: b.data })) };
    const { mode, blocks } = applySmartObjectDescriptorFragment(frag, op);
    
    const seen = {};
    const merged = cur.map(b => ({ ...b }));
    for (const nb of blocks) {
      const n = seen[nb.key] = (seen[nb.key] || 0) + 1;
      const hit = merged.filter(b => b.key === nb.key)[n - 1];
      if (!hit) bad(`ops[${i}]：片段里没有第 ${n} 个 ${nb.key} 块`, 'fragment');
      hit.data = nb.data;
    }
    fragmentGuard('placedBlocks', null,
      { layerName: frag.layerName, bounds: frag.bounds, soKind, psb, merged: merged.map(b => ({ key: b.key, data: b.data })) });
    patched.set(f.id, { blocks: merged });
    rec.fragments.push(f.id);
    rec.mode = mode;
    rec.changed = true;
    rec.note = `图层 ${op.index} 放置块写回（${mode}）`;
    results.push(rec);
  });

  const outFragments = [];
  for (const [id, v] of patched) {
    const f = byId.get(id);
    if (v.blocks) {
      outFragments.push({
        id, kind: f.kind, layerIndex: f.layerIndex, offset: f.offset, length: f.length, checksum: f.checksum,
        
        blocks: v.blocks.map(b => ({ key: b.key, occurrence: b.occurrence | 0,
                                     offset: b.offset, length: b.length, data: b.data })),
        newLength: v.blocks.reduce((a, b) => a + b.data.length, 0),
      });
    } else {
      if (v.data.length > MAX_FRAGMENT_BYTES) bad(`片段 ${id} 产出 ${v.data.length} 字节，超过上限`, 'fragment');
      outFragments.push({
        id, kind: f.kind, layerIndex: f.layerIndex, offset: f.offset, length: f.length, checksum: f.checksum,
        data: v.data, newLength: v.data.length, newChecksum: fragmentChecksum(v.data),
      });
    }
  }
  
  const seenSe = new Set();
  const dedupSe = sideEffects.filter(s => { const k = JSON.stringify(s); if (seenSe.has(k)) return false; seenSe.add(k); return true; });
  return { fragments: outFragments, sideEffects: dedupSe, results, warnings };
}



function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}









export function guard(buffer) {
  const u8 = toU8(buffer);
  const lint = lintPsd(u8);
  const warnings = [...(lint.warnings || [])];

  let doc = null, parseError = null;
  try { doc = parsePsdDocument(u8); }
  catch (e) { parseError = String(e && e.message || e); }
  if (doc && doc.warnings) for (const w of doc.warnings) warnings.push('解析：' + w);

  let roundTripIdentical = false, firstDiffOffset = -1, roundTripError = null;
  if (doc) {
    try {
      const re = toU8(serializePsdDocument(doc));
      firstDiffOffset = firstDiff(u8, re);
      roundTripIdentical = firstDiffOffset === -1;
    } catch (e) { roundTripError = String(e && e.message || e); firstDiffOffset = -2; }
  }

  return {
    ok: !!lint.ok && !parseError && roundTripIdentical,
    lint: { ok: !!lint.ok, errors: lint.errors || [], warnings: lint.warnings || [], summary: lint.summary },
    warnings,
    parseOk: !parseError, parseError,
    roundTripIdentical, firstDiffOffset,
    ...(roundTripError ? { roundTripError } : {}),
    bytes: u8.length,
  };
}

export default {
  applySmartObjectReplace, applyDeform, applyDeformFragment,
  applySmartObjectDescriptor, applySmartObjectDescriptorFragment,
  runIncrementalOps, resolveTarget, inspectTarget, guard, EditOpError,
};
