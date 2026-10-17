



























import { vconcat, flatten } from './byte-chunks.js';
import { hasHighDepthBlockLayers, normalizeHighDepthLayers } from './psd-highdepth.js';
import {
  parsePsdDocument, serializePsdDocument, summarizeDocument,
} from './psd-document.js';
import {
  parsePsdFull, writeLayerProperties, editLayerText,
  reorderLayers as rawReorderLayers,
} from './psd-parse.js';
import {
  rebuildPsdReplacingLayerPixels, writeImageResource, removeImageResource,
} from './psd-write.js';
import { lintPsd } from './psd-lint.js';
import { parseEngineData } from './engine-data.js';
import { setEngineFont } from './psd-text.js';
import { createFlagOps } from './psd-edit-flags.js';
import { createFxOps } from './psd-edit-fx.js';
import { createMaskOps } from './psd-edit-mask.js';
import { createParamOps } from './psd-edit-params.js';
import { createCreateOps } from './psd-edit-create.js';
import { createPathOps } from './psd-edit-path.js';
import { createRasterOps } from './psd-edit-raster.js';
import { createPresetOps } from './psd-edit-presets.js';   
import { createSmartOps } from './psd-edit-smart.js';
import { createLayerLinkOps } from './psd-edit-layers.js';
import { createFrameOps } from './psd-edit-frame.js';
import { createCompOps } from './layer-comps.js';          
import { createAnimOps } from './frame-anim.js';           
import { createGalleryOps } from './psd-edit-gallery.js';   
import { createSfxOps } from './psd-edit-sfx.js';           
import { readLinkGroups, writeLinkGroups } from './psd-links.js';
import { syncLayerCountResources, pruneOrphanLinkedFiles } from './psd-layer-resources.js';







export const BLEND_KEYS = new Set([
  'pass', 'norm', 'diss', 'dark', 'mul ', 'idiv', 'lbrn', 'dkCl',
  'lite', 'scrn', 'div ', 'lddg', 'lgCl', 'over', 'sLit', 'hLit',
  'vLit', 'lLit', 'pLit', 'hMix', 'diff', 'smud', 'fsub', 'fdiv',
  'hue ', 'sat ', 'colr', 'lum ',
]);



const PAD4_BLOCK_KEYS = new Set(['Txt2', 'luni', 'vmsk', 'artb', 'artd', 'frgb', 'vogk', 'SoLd', 'lnk2', 'lnk3', 'lnkD', 'lnkE',
  'vscg', 'vsms', 'GdFl', 'lmfx', 'lrFX', 'cinf', 'PlLd', 'Anno', 'CAI ', 'OCIO', 'GenI', 'FEid', 'curv', 'CgEd', 'vibA', 'blwh', 'grdm']);


const GT_OPEN = 1, GT_CLOSED = 2, GT_DIVIDER = 3;
const isGroupHeader = gt => gt === GT_OPEN || gt === GT_CLOSED;







export class EditError extends Error {
  constructor(message, info = {}) {
    super(message);
    this.name = 'EditError';
    for (const k of Object.keys(info)) if (info[k] !== undefined) this[k] = info[k];
  }
}

function opFail(i, op, msg, info) {
  const name = (op && op.op) || '?';
  return new EditError(`ops[${i}]「${name}」：${msg}`, { opIndex: i, opName: name, ...info });
}



function toU8(b) {
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  throw new EditError('不是字节缓冲区');
}

function copyAB(b) {
  const u8 = toU8(b);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}
function asAB(b) { return b instanceof ArrayBuffer ? b : copyAB(b); }

function freshAB(u8) { return u8 instanceof ArrayBuffer ? u8 : (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : copyAB(u8)); }

function concat(parts) { return flatten(vconcat(parts)); }
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function encodeUnicode(s) {
  const codes = [];
  for (let i = 0; i < s.length; i++) codes.push(s.charCodeAt(i));
  const buf = new Uint8Array(4 + codes.length * 2);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, codes.length);
  for (let i = 0; i < codes.length; i++) dv.setUint16(4 + i * 2, codes[i]);
  return buf;
}

function buildBlock(key, data, psb = false) {
  const round = psb ? 4 : (PAD4_BLOCK_KEYS.has(key) ? 4 : 2);
  const pad = (round - (data.length % round)) % round;
  const block = new Uint8Array(12 + data.length + pad);
  block[0] = 0x38; block[1] = 0x42; block[2] = 0x49; block[3] = 0x4D;   
  for (let i = 0; i < 4; i++) block[4 + i] = key.charCodeAt(i) & 0xff;
  new DataView(block.buffer).setUint32(8, data.length + pad);
  block.set(data, 12);
  return block;
}



export function encodePascalName(name) {
  let lossy = false;
  const chars = [];
  for (let i = 0; i < name.length && chars.length < 255; i++) {
    const c = name.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) chars.push(c);
    else { chars.push(0x3f); lossy = true; }
  }
  const total = 1 + chars.length;
  const pad = (4 - (total % 4)) % 4;
  const out = new Uint8Array(total + pad);
  out[0] = chars.length;
  for (let i = 0; i < chars.length; i++) out[1 + i] = chars[i];
  return { bytes: out, lossy };
}















function layerInfoContentEnd(psd) {
  const s = psd.sections;
  if (!psd.layers.length) return Math.min(s.layerInfoStart + 2, s.layerInfoEndAbs);
  let end = psd.layers[psd.layers.length - 1].recordEnd;
  for (const l of psd.layers) for (const n of (l.channelLengths || [])) end += n;
  
  return (end >= s.layerInfoStart && end <= s.layerInfoEndAbs) ? end : s.layerInfoEndAbs;
}

function spliceLayerExtra(ab, index, from, to, newBytes) {
  const psd = parsePsdFull(ab);
  const layer = psd.layers[index];
  if (!layer) throw new EditError('图层不存在: index=' + index);
  const s = psd.sections;
  if (from < layer.extraLenOffset + 4 || to > s.layerInfoEndAbs || to < from)
    throw new EditError(`spliceLayerExtra 区间非法：[${from}, ${to}) 不在图层 ${index} 的 extra 区里`, { offset: from });
  const orig = new Uint8Array(ab);
  const delta = newBytes.length - (to - from);
  const liLenOld = s.layerInfoEndAbs - s.layerInfoStart;
  







  const contentEndOld = layerInfoContentEnd(psd);
  const newContentLen = (contentEndOld - s.layerInfoStart) + delta;
  const padNew = (4 - (newContentLen % 4)) % 4;
  const liLenNew = newContentLen + padNew;
  const out = concat([
    orig.subarray(0, from), newBytes, orig.subarray(to, contentEndOld),
    new Uint8Array(padNew), orig.subarray(s.layerInfoEndAbs),
  ]);
  const totalDelta = liLenNew - liLenOld;
  const dv = new DataView(out.buffer);
  const setLen = (off, add, is64) => {
    if (!is64) { dv.setUint32(off, dv.getUint32(off) + add); return; }
    const n = dv.getUint32(off) * 0x100000000 + dv.getUint32(off + 4) + add;
    dv.setUint32(off, Math.floor(n / 0x100000000));
    dv.setUint32(off + 4, n >>> 0);
  };
  setLen(layer.extraLenOffset, delta, false);     
  setLen(s.layerInfoLenOffset, totalDelta, !!s.psb);
  setLen(s.lmiLenOffset, totalDelta, !!s.psb);
  return out.buffer;
}












function findLayerBlockRange(ab, index, key) {
  const doc = parsePsdDocument(ab);
  const layer = doc.layers[index];
  if (!layer) throw new EditError('图层不存在: index=' + index);
  const blk = (layer.additionalBlocks || []).find(b => b.key === key);
  if (!blk || !blk._off) return null;
  return { from: blk._off.blockStart, to: blk._off.blockEnd, length: blk.length, isBig: blk.isBig };
}

function layerExtraRange(ab, index) {
  const psd = parsePsdFull(ab);
  const layer = psd.layers[index];
  if (!layer) throw new EditError('图层不存在: index=' + index);
  const dv = new DataView(ab);
  const extraLenOffset = layer.extraLenOffset;
  const extraLen = dv.getUint32(extraLenOffset);
  const extraStart = extraLenOffset + 4;
  const extraEnd = extraStart + extraLen;
  const maskLen = dv.getUint32(extraStart);
  const brOff = extraStart + 4 + maskLen;
  if (brOff + 4 > extraEnd) throw new EditError(`图层 ${index} 的 extra 区结构异常（蒙版长度 ${maskLen} 越界 @${extraStart}）`);
  const brLen = dv.getUint32(brOff);
  const nameOff = brOff + 4 + brLen;
  if (nameOff + 1 > extraEnd) throw new EditError(`图层 ${index} 的 extra 区结构异常（混合范围长度 ${brLen} 越界 @${brOff}）`);
  const nameLen = dv.getUint8(nameOff);
  const total = 1 + nameLen;
  const nameEnd = nameOff + total + ((4 - (total % 4)) % 4);
  if (nameEnd > extraEnd) throw new EditError(`图层 ${index} 的 Pascal 名越界（长度 ${nameLen} @${nameOff}）`);
  return { layer, psb: !!psd.sections.psb, extraStart, extraEnd, nameOff, nameEnd, blocks: layer.blocks || [] };
}











export function groupPairs(layers) {
  const stack = [], pairs = [], orphanDividers = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const gt = layers[i] ? layers[i].groupType : null;
    if (isGroupHeader(gt)) stack.push(i);
    else if (gt === GT_DIVIDER) {
      if (stack.length) pairs.push({ header: stack.pop(), divider: i });
      else orphanDividers.push(i);
    }
  }
  const orphanHeaders = stack.slice();
  return { pairs, orphanHeaders, orphanDividers, balanced: !orphanHeaders.length && !orphanDividers.length };
}





export function groupSpan(layers, index) {
  const { pairs } = groupPairs(layers);
  for (const p of pairs) if (p.header === index || p.divider === index) return { from: p.divider, to: p.header, ...p };
  return null;
}





export function deletionSet(layers, index, opts = {}) {
  const span = groupSpan(layers, index);
  if (!span) return { indices: [index], group: null };
  if (opts.keepChildren) {
    
    return { indices: [span.divider, span.header], group: span, keepChildren: true };
  }
  const indices = [];
  for (let i = span.from; i <= span.to; i++) indices.push(i);
  return { indices, group: span };
}






export function checkReorder(layers, order) {
  const before = groupPairs(layers);
  const present = new Set(order);
  const nameOf = i => (layers[i] && (layers[i].name || '')) || `#${i}`;
  for (const p of before.pairs) {
    const h = present.has(p.header), d = present.has(p.divider);
    if (h !== d) {
      return { ok: false, reason: h
        ? `分组「${nameOf(p.header)}」(index ${p.header}) 保留了组头却丢掉了结束分隔记录 (index ${p.divider})：PS 打开时这个组会把下面的图层全吞进去`
        : `分组「${nameOf(p.header)}」丢掉了组头 (index ${p.header}) 却保留了结束分隔记录 (index ${p.divider})：多出来的分隔记录会去闭合别人的组` };
    }
  }
  const newLayers = order.map(i => layers[i]);
  const after = groupPairs(newLayers);
  if (before.balanced && !after.balanced) {
    return { ok: false, reason: `新顺序里有落单的分组记录（组头 ${after.orphanHeaders.map(i => order[i]).join(',') || '无'}／分隔记录 ${after.orphanDividers.map(i => order[i]).join(',') || '无'}）` };
  }
  const want = new Set(before.pairs.map(p => `${p.header}:${p.divider}`));
  for (const p of after.pairs) {
    const k = `${order[p.header]}:${order[p.divider]}`;
    if (!want.has(k)) {
      return { ok: false, reason: `重排把分组拆散了：新顺序里组头「${nameOf(order[p.header])}」(原 index ${order[p.header]}) 被配到了「${nameOf(order[p.divider])}」(原 index ${order[p.divider]}) 的结束分隔记录上` };
    }
  }
  return { ok: true };
}








function docState(doc) {
  return {
    psb: !!doc.header.psb,
    depth: doc.header.depth,
    mode: doc.header.mode,
    width: doc.header.width,
    height: doc.header.height,
    layers: doc.layers.map((l, i) => ({
      index: i,
      name: l.unicodeName || l.name || '',
      groupType: l.groupType == null ? null : l.groupType,
      isText: !!l.text,
      hasLuni: !!(l.additional && l.additional.luni),
      
      artboardKeys: l.additional ? ['artb', 'artd', 'abdd'].filter(k => l.additional[k]) : [],
      section: l._section || 'layerInfo',
      extraRaw: !!l._extraRaw,
      bounds: { ...l.bounds },
      isSmartObject: !!l.smartObject,
      frame: l.frame || null,
    })),
    resourceIds: doc.imageResources.map(r => r.id),
    globalKeys: doc.globalAdditional.map(b => b.key),
  };
}

function stateOf(ab) { return docState(parsePsdDocument(ab)); }

function needLayer(state, i, op, idx) {
  if (!Number.isInteger(idx)) throw opFail(i, op, `index 必须是整数，收到 ${JSON.stringify(idx)}`);
  if (idx < 0 || idx >= state.layers.length)
    throw opFail(i, op, `index=${idx} 越界（本文档 ${state.layers.length} 个图层，合法范围 0…${state.layers.length - 1}）`, { layers: state.layers.length });
  const layer = state.layers[idx];
  
  
  if (layer.section && layer.section !== 'layerInfo')
    throw opFail(i, op, `图层 ${idx} 的记录在全局块 ${layer.section} 里（16/32 位文档），本模块暂不支持编辑`, { section: layer.section });
  return layer;
}


function requireLayerInfoSection(state, i, op) {
  const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
  if (bad) throw opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持结构性增删改（重命名/属性/文字仍可用）`, { section: bad.section });
}



const OPS = {};







export function registerOp(name, handler) {
  if (!handler || typeof handler.validate !== 'function') throw new EditError('registerOp 需要 { validate, apply }');
  OPS[name] = handler;
}

export function listOps() { return Object.keys(OPS).sort(); }

const isBytes = v => v instanceof Uint8Array || v instanceof ArrayBuffer || ArrayBuffer.isView(v) || Array.isArray(v);
const asBytes = v => (v instanceof Uint8Array ? v
  : v instanceof ArrayBuffer ? new Uint8Array(v)
  : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  : Uint8Array.from(v));



function validateProps(state, op, i) {
  const layer = needLayer(state, i, op, op.index);
  const changed = [];
  if (op.name !== undefined) {
    if (typeof op.name !== 'string' || !op.name.length) throw opFail(i, op, 'name 必须是非空字符串');
    if (op.name.length > 255) throw opFail(i, op, `name 太长（${op.name.length} 字符 > 255）`);
    if (layer.extraRaw) throw opFail(i, op, `图层 ${op.index} 的附加区是原样字节（解析已降级），改名会被静默丢掉，拒绝执行`);
    changed.push('name');
  }
  if (op.unicodeName !== undefined) {
    if (typeof op.unicodeName !== 'string' || !op.unicodeName.length) throw opFail(i, op, 'unicodeName 必须是非空字符串');
    if (layer.extraRaw) throw opFail(i, op, `图层 ${op.index} 的附加区是原样字节（解析已降级），改名会被静默丢掉，拒绝执行`);
    changed.push('unicodeName');
  }
  if (op.visible !== undefined) {
    if (typeof op.visible !== 'boolean') throw opFail(i, op, 'visible 必须是布尔值');
    changed.push('visible');
  }
  if (op.opacity !== undefined) {
    if (!Number.isInteger(op.opacity) || op.opacity < 0 || op.opacity > 255)
      throw opFail(i, op, `opacity 必须是 0…255 的整数（255 = 不透明），收到 ${JSON.stringify(op.opacity)}`);
    changed.push('opacity');
  }
  if (op.clipping !== undefined) {
    if (typeof op.clipping !== 'boolean' && op.clipping !== 0 && op.clipping !== 1)
      throw opFail(i, op, 'clipping 必须是布尔值或 0/1');
    changed.push('clipping');
  }
  if (op.blendKey !== undefined) {
    if (typeof op.blendKey !== 'string' || op.blendKey.length !== 4)
      throw opFail(i, op, `blendKey 必须是 4 个字符（不足补空格，如 'mul '），收到 ${JSON.stringify(op.blendKey)}`);
    if (!BLEND_KEYS.has(op.blendKey))
      throw opFail(i, op, `blendKey "${op.blendKey}" 不是 PS 认识的混合模式；可用：${[...BLEND_KEYS].join(' ')}`);
    changed.push('blendKey');
  }
  if (!changed.length) throw opFail(i, op, '没有给出任何要改的字段（name/unicodeName/visible/opacity/clipping/blendKey）');
  return { affected: [op.index], changed, note: `图层 ${op.index}「${layer.name}」→ ${changed.join('/')}` };
}



function validateText(state, op, i) {
  const layer = needLayer(state, i, op, op.index);
  if (typeof op.text !== 'string') throw opFail(i, op, `text 必须是字符串，收到 ${JSON.stringify(op.text)}`);
  if (!layer.isText) throw opFail(i, op, `图层 ${op.index}「${layer.name}」不是文字图层（没有 TySh 块）`);
  return { affected: [op.index], changed: ['text'], note: `图层 ${op.index}「${layer.name}」文字 → ${op.text.length} 字符` };
}



function validateDelete(state, op, i) {
  const layer = needLayer(state, i, op, op.index);
  requireLayerInfoSection(state, i, op);
  const del = deletionSet(state.layers, op.index, { keepChildren: !!op.keepChildren });
  if (del.indices.length >= state.layers.length)
    throw opFail(i, op, `这一步会删光全部 ${state.layers.length} 个图层（${del.group ? `分组「${layer.name}」覆盖整份文档` : '文档只有这一个图层'}），拒绝执行`);
  const order = [];
  const drop = new Set(del.indices);
  for (let k = 0; k < state.layers.length; k++) if (!drop.has(k)) order.push(k);
  const chk = checkReorder(state.layers, order);
  if (!chk.ok) throw opFail(i, op, chk.reason, { indices: del.indices });
  return {
    affected: del.indices, changed: ['layers'], order,
    note: del.group
      ? `删除分组「${layer.name}」整段 index ${del.group.from}…${del.group.to}（共 ${del.indices.length} 条记录${del.keepChildren ? '，仅拆外壳' : ''}）`
      : `删除图层 ${op.index}「${layer.name}」`,
  };
}



function validateReorder(state, op, i) {
  requireLayerInfoSection(state, i, op);
  const order = op.order;
  if (!Array.isArray(order)) throw opFail(i, op, 'order 必须是数组（元素是原始图层 index，底=0；省略某个 index 表示删除它）');
  if (order.length > state.layers.length) throw opFail(i, op, `order 长度 ${order.length} 超过图层数 ${state.layers.length}`);
  const seen = new Set();
  for (const v of order) {
    if (!Number.isInteger(v) || v < 0 || v >= state.layers.length)
      throw opFail(i, op, `order 里的 ${JSON.stringify(v)} 越界（合法范围 0…${state.layers.length - 1}）`);
    if (seen.has(v)) throw opFail(i, op, `order 里 index ${v} 出现了不止一次`);
    seen.add(v);
  }
  if (!order.length) throw opFail(i, op, 'order 是空数组：不能把图层全删光');
  const chk = checkReorder(state.layers, order);
  if (!chk.ok) throw opFail(i, op, chk.reason, { order: order.slice() });
  const removed = [];
  for (let k = 0; k < state.layers.length; k++) if (!seen.has(k)) removed.push(k);
  return {
    affected: order.slice(), changed: ['layers'], order: order.slice(), removed,
    note: `重排为 [${order.join(',')}]${removed.length ? `，顺带删除 ${removed.join(',')}` : ''}`,
  };
}



function validatePixels(state, op, i) {
  const layer = needLayer(state, i, op, op.index);
  const rgba = op.rgba;
  if (!rgba || !isBytes(rgba.data)) throw opFail(i, op, 'rgba 必须是 { data:Uint8Array, width, height }');
  const w = rgba.width | 0, h = rgba.height | 0;
  if (w <= 0 || h <= 0) throw opFail(i, op, `rgba 尺寸非法：${rgba.width}×${rgba.height}`);
  const data = asBytes(rgba.data);
  if (data.length !== w * h * 4) throw opFail(i, op, `rgba.data 长度 ${data.length} ≠ ${w}×${h}×4 = ${w * h * 4}`);
  if (state.depth !== 8 && state.depth !== 16 && state.depth !== 32)
    throw opFail(i, op, `本文档是 ${state.depth} 位/通道，rebuildPsdReplacingLayerPixels 只支持 8/16/32 位`);
  let bounds = op.bounds;
  if (bounds) {
    for (const k of ['top', 'left', 'bottom', 'right']) {
      if (!Number.isInteger(bounds[k])) throw opFail(i, op, `bounds.${k} 必须是整数`);
    }
    if (bounds.right - bounds.left !== w || bounds.bottom - bounds.top !== h)
      throw opFail(i, op, `bounds 尺寸 ${bounds.right - bounds.left}×${bounds.bottom - bounds.top} 与 rgba ${w}×${h} 不符`);
  } else {
    bounds = { top: layer.bounds.top, left: layer.bounds.left, bottom: layer.bounds.top + h, right: layer.bounds.left + w };
  }
  if (op.merged) {
    const m = op.merged;
    if (!isBytes(m.data)) throw opFail(i, op, 'merged 必须是 { data:Uint8Array }（整幅合成图 RGBA）');
    if (asBytes(m.data).length !== state.width * state.height * 4)
      throw opFail(i, op, `merged.data 长度 ${asBytes(m.data).length} ≠ 画布 ${state.width}×${state.height}×4`);
  }
  return { affected: [op.index], changed: ['pixels'], bounds, note: `图层 ${op.index}「${layer.name}」像素 → ${w}×${h}${op.merged ? '（含新合成图）' : '（保留原合成图）'}` };
}



function validateSetResource(state, op, i) {
  if (!Number.isInteger(op.id) || op.id < 0 || op.id > 0xffff)
    throw opFail(i, op, `id 必须是 0…65535 的整数，收到 ${JSON.stringify(op.id)}`);
  if (!isBytes(op.data)) throw opFail(i, op, 'data 必须是字节数组（Uint8Array / ArrayBuffer / number[]）');
  const exists = state.resourceIds.includes(op.id);
  return { affected: [], changed: ['imageResources'], note: `${exists ? '替换' : '新增'}图像资源 ${op.id}（${asBytes(op.data).length} 字节）` };
}
function validateRemoveResource(state, op, i) {
  if (!Number.isInteger(op.id) || op.id < 0 || op.id > 0xffff)
    throw opFail(i, op, `id 必须是 0…65535 的整数，收到 ${JSON.stringify(op.id)}`);
  const exists = state.resourceIds.includes(op.id);
  return { affected: [], changed: exists ? ['imageResources'] : [], note: exists ? `删除图像资源 ${op.id}` : `图像资源 ${op.id} 不存在，不做改动` };
}



function applyProps(ab, state, op, plan, warnings) {
  const idx = op.index;
  
  const fixed = {};
  if (op.visible !== undefined) fixed.visible = op.visible;
  if (op.opacity !== undefined) fixed.opacity = op.opacity;
  if (op.blendKey !== undefined) fixed.blendKey = op.blendKey;
  if (Object.keys(fixed).length) ab = writeLayerProperties(ab, [{ index: idx, ...fixed }]);
  
  if (op.clipping !== undefined) {
    const psd = parsePsdFull(ab);
    const layer = psd.layers[idx];
    const out = ab.slice(0);
    new DataView(out).setUint8(layer.offOpacity + 1, op.clipping ? 1 : 0);
    ab = out;
  }
  
  const uni = op.unicodeName !== undefined ? op.unicodeName : op.name;
  if (uni !== undefined) {
    const range = layerExtraRange(ab, idx);
    const luni = findLayerBlockRange(ab, idx, 'luni');
    const blk = buildBlock('luni', encodeUnicode(uni), range.psb);
    
    ab = luni ? spliceLayerExtra(ab, idx, luni.from, luni.to, blk)
              : spliceLayerExtra(ab, idx, range.extraEnd, range.extraEnd, blk);
  }
  if (op.name !== undefined) {
    const range = layerExtraRange(ab, idx);
    const { bytes, lossy } = encodePascalName(op.name);
    if (lossy) warnings.push(`图层 ${idx} 的 Pascal 名含非 ASCII 字符，已按 '?' 落地（真名在 luni 块里，PS 显示的是 luni）`);
    ab = spliceLayerExtra(ab, idx, range.nameOff, range.nameEnd, bytes);
  }
  return { buffer: ab, result: { changed: true, changedFields: plan.changed, note: plan.note } };
}

function applyText(ab, state, op, plan, warnings) {
  const idx = op.index;
  const psd = parsePsdFull(ab);
  const layer = psd.layers[idx];
  const before = typeof (layer.text && layer.text['Txt ']) === 'string' ? layer.text['Txt '] : null;
  const textOpts = { ...(op.opts || {}) };
  
  
  if (textOpts.font && layer.text && layer.text['EngineData'] && layer.text['EngineData'].length) {
    const ed = parseEngineData(layer.text['EngineData']);
    setEngineFont(ed, textOpts.font);
    textOpts.engineData = ed;
  }
  const hadTxt2 = state.globalKeys.includes('Txt2');
  ab = editLayerText(ab, idx, op.text, textOpts);
  
  const after = parsePsdDocument(ab);
  const stillTxt2 = after.globalAdditional.some(b => b.key === 'Txt2');
  if (!textOpts.keepTxt2 && stillTxt2)
    throw new EditError(`setText 之后全局 Txt2 仍然存在：PS 会优先读 Txt2 显示旧文字`, { opName: 'setText', index: idx });
  if (textOpts.keepTxt2 && stillTxt2)
    warnings.push(`图层 ${idx}：opts.keepTxt2 保留了全局 Txt2，PS 打开可能仍显示旧文字`);
  
  const l2 = after.layers[idx];
  const fontWarn = checkFontSets(l2, idx);
  if (fontWarn) warnings.push(fontWarn);
  const now = l2 && l2.text && typeof l2.text.descriptor['Txt '] === 'string' ? l2.text.descriptor['Txt '] : null;
  return {
    buffer: ab,
    result: {
      changed: true, note: plan.note,
      textChanged: now !== before, txt2Removed: hadTxt2 && !stillTxt2,
      textBefore: before, textAfter: now,
    },
  };
}


function checkFontSets(layer, idx) {
  try {
    const raw = layer && layer.text && layer.text.descriptor && layer.text.descriptor['EngineData'];
    if (!raw || !raw.length) return null;
    const ed = parseEngineData(raw);
    const a = ed.ResourceDict && ed.ResourceDict.FontSet;
    const b = ed.DocumentResources && ed.DocumentResources.FontSet;
    if (!Array.isArray(a) || !Array.isArray(b)) return null;
    if (a.length !== b.length) return `图层 ${idx}：EngineData 两份 FontSet 条目数不同（${a.length} vs ${b.length}），PS 双击内嵌文档可能崩溃`;
    for (let i = 0; i < a.length; i++) {
      if ((a[i] && a[i].Name) !== (b[i] && b[i].Name))
        return `图层 ${idx}：EngineData 两份 FontSet 第 ${i} 条字体名不同（${a[i] && a[i].Name} vs ${b[i] && b[i].Name}）`;
    }
    return null;
  } catch { return null; }
}

function applyReorder(ab, state, op, plan, warnings) {
  const keep = new Set(plan.order);
  const removed = state.layers.filter(l => !keep.has(l.index));
  
  
  if (removed.some(l => l.isText) && state.globalKeys.includes('Txt2')) {
    warnings.push(`删掉了文字图层（${removed.filter(l => l.isText).map(l => `${l.index}「${l.name}」`).join('、')}），` +
      `但全局 Txt2 仍在：PS 会优先读 Txt2 里的旧文字引擎文档，建议同一批编辑里再跑一次 setText 或让调用方清掉 Txt2`);
  }
  const out = rawReorderLayers(ab, plan.order);
  return { buffer: out, result: { changed: true, note: plan.note, order: plan.order, removed: removed.map(l => l.index) } };
}

function applyPixels(ab, state, op, plan) {
  const rgba = asBytes(op.rgba.data);
  const merged = op.merged ? asBytes(op.merged.data) : null;
  if (merged) {
    return { buffer: freshAB(rebuildPsdReplacingLayerPixels(ab, op.index, rgba, plan.bounds, merged, op.opts || {})),
             result: { changed: true, note: plan.note, bounds: plan.bounds, compositeUpdated: true } };
  }
  
  
  const out = freshAB(rebuildPsdReplacingLayerPixels(ab, op.index, rgba, plan.bounds, null, op.opts || {}));
  return { buffer: out, result: { changed: true, note: plan.note, bounds: plan.bounds, compositeUpdated: false } };
}


function compositeStart(ab) {
  const u8 = new Uint8Array(ab), dv = new DataView(ab);
  const psb = dv.getUint16(4) === 2;
  let o = 26;
  o += 4 + dv.getUint32(o);                    
  o += 4 + dv.getUint32(o);                    
  const lenSize = psb ? 8 : 4;
  const lmiLen = psb ? dv.getUint32(o) * 0x100000000 + dv.getUint32(o + 4) : dv.getUint32(o);
  const start = o + lenSize + lmiLen;
  if (start > u8.length) throw new EditError(`合成图起点 ${start} 超过文件长度 ${u8.length}`, { offset: start });
  return start;
}

function restoreComposite(outAb, srcAb) {
  const a = new Uint8Array(outAb), b = new Uint8Array(srcAb);
  const oa = compositeStart(outAb), ob = compositeStart(srcAb);
  return concat([a.subarray(0, oa), b.subarray(ob)]).buffer;
}



registerOp('setLayerProps', { validate: validateProps, apply: applyProps });
registerOp('setText', { validate: validateText, apply: applyText });
registerOp('deleteLayer', { validate: validateDelete, apply: applyReorder, structural: true, pure: true });
registerOp('reorderLayers', { validate: validateReorder, apply: applyReorder, structural: true, pure: true });
registerOp('replaceLayerPixels', { validate: validatePixels, apply: applyPixels, structural: true, pure: true });
registerOp('setImageResource', {
  validate: validateSetResource,
  apply: (ab, state, op, plan) => ({ buffer: asAB(writeImageResource(ab, op.id, asBytes(op.data))), result: { changed: true, note: plan.note } }),
  structural: true,
});
registerOp('removeImageResource', {
  validate: validateRemoveResource,
  apply: (ab, state, op, plan) => {
    if (!plan.changed.length) return { buffer: ab, result: { changed: false, note: plan.note } };
    return { buffer: asAB(removeImageResource(ab, op.id)), result: { changed: true, note: plan.note } };
  },
  structural: true,
});















const HELPERS = {
  EditError, opFail, needLayer,
  
  toU8, asAB, copyAB, concat, vconcat,
  spliceLayerExtra, findLayerBlockRange, layerExtraRange,
  
  parsePsdFull, parsePsdDocument, serializePsdDocument,
  buildBlock, encodeUnicode,
  BLEND_KEYS, PAD4_BLOCK_KEYS,
  




  upsertLayerBlock(ab, index, key, bytes) {
    const range = layerExtraRange(ab, index);
    const hit = findLayerBlockRange(ab, index, key);
    if (bytes == null) {
      if (!hit) return ab;                       
      return spliceLayerExtra(ab, index, hit.from, hit.to, new Uint8Array(0));
    }
    const blk = buildBlock(key, toU8(bytes), range.psb);
    return hit ? spliceLayerExtra(ab, index, hit.from, hit.to, blk)
               : spliceLayerExtra(ab, index, range.extraEnd, range.extraEnd, blk);
  },
  
  readLayerBlock(ab, index, key) {
    const hit = findLayerBlockRange(ab, index, key);
    if (!hit) return null;
    const doc = parsePsdDocument(ab);
    const blk = (doc.layers[index].additionalBlocks || []).find(b => b.key === key);
    if (!blk || !blk._off) return null;
    return new Uint8Array(ab, blk._off.dataOffset, blk._off.dataEnd - blk._off.dataOffset);
  },
  




  patchBytes(ab, writes) {
    const out = copyAB(ab);
    const dv = new DataView(out);
    for (const w of writes) {
      if (w.offset < 0 || w.offset >= out.byteLength)
        throw new EditError(`patchBytes 偏移越界：${w.offset} / ${out.byteLength}`, { offset: w.offset });
      dv.setUint8(w.offset, w.value & 0xff);
    }
    return out;
  },
  



  maskRange(ab, index) {
    const psd = parsePsdFull(ab);
    const layer = psd.layers[index];
    if (!layer) throw new EditError('图层不存在: index=' + index);
    const dv = new DataView(ab);
    const maskLenOffset = layer.extraLenOffset + 4;
    const maskLen = dv.getUint32(maskLenOffset);
    if (!maskLen) return null;
    const start = maskLenOffset + 4;
    return {
      maskLenOffset, maskLen, start, end: start + maskLen,
      
      defaultColorOffset: maskLen >= 17 ? start + 16 : null,
      flagsOffset: maskLen >= 18 ? start + 17 : null,
      mask: layer.mask || null,
      psb: !!psd.sections.psb,
    };
  },
};


for (const create of [createFlagOps, createFxOps, createMaskOps, createParamOps, createCreateOps, createPathOps, createRasterOps, createSmartOps, createPresetOps, createLayerLinkOps, createFrameOps, createCompOps, createGalleryOps, createSfxOps, createAnimOps]) {
  const group = create(HELPERS) || {};
  for (const name of Object.keys(group)) registerOp(name, group[name]);
}



const ALIASES = {
  renameLayer: op => ({ op: 'setLayerProps', index: op.index, name: op.name }),
  setVisible: op => ({ op: 'setLayerProps', index: op.index, visible: op.visible }),
  setOpacity: op => ({ op: 'setLayerProps', index: op.index, opacity: op.opacity }),
  setBlendMode: op => ({ op: 'setLayerProps', index: op.index, blendKey: op.blendKey }),
  setClipping: op => ({ op: 'setLayerProps', index: op.index, clipping: op.clipping }),
};


function normalizeOp(op, i) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) throw opFail(i, op, '不是对象');
  const name = op.op;
  if (typeof name !== 'string' || !name) throw opFail(i, op, `缺少 op 字段（可用：${[...listOps(), ...Object.keys(ALIASES)].sort().join(' ')}）`);
  if (ALIASES[name]) return { ...ALIASES[name](op), _alias: name };
  if (!OPS[name]) throw opFail(i, op, `未知 op「${name}」（可用：${[...listOps(), ...Object.keys(ALIASES)].sort().join(' ')}）`);
  return op;
}












export function planEdits(docOrBuffer, ops) {
  const doc = (docOrBuffer && docOrBuffer.header && Array.isArray(docOrBuffer.layers))
    ? docOrBuffer : parsePsdDocument(asAB(docOrBuffer));
  let state = docState(doc);
  
  if (state.layers.length && state.layers.every(l => l.section === 'Lr16' || l.section === 'Lr32')) {
    state = { ...state, layers: state.layers.map(l => ({ ...l, section: 'layerInfo' })) };
  }
  const results = [], errors = [];
  if (!Array.isArray(ops)) {
    return { ok: false, results, errors: [{ opIndex: -1, message: 'ops 必须是数组' }], layerCount: state.layers.length };
  }
  for (let i = 0; i < ops.length; i++) {
    let norm = null;
    try {
      norm = normalizeOp(ops[i], i);
      const h = OPS[norm.op];
      const plan = h.validate(state, norm, i);
      results.push({
        i, op: norm.op, alias: norm._alias || null, ok: true,
        affected: plan.affected || [], changed: plan.changed || [], note: plan.note || '',
      });
      state = simulate(state, norm, plan);
    } catch (e) {
      const rec = {
        i, op: (norm && norm.op) || (ops[i] && ops[i].op) || null, alias: (norm && norm._alias) || null,
        ok: false, affected: e.affected || [], changed: [], note: e.message,
      };
      results.push(rec);
      errors.push({ opIndex: i, op: rec.op, message: e.message });
      break;   
    }
  }
  return { ok: !errors.length, results, errors, layerCount: state.layers.length };
}


function simulate(state, op, plan) {
  const next = { ...state, layers: state.layers.map(l => ({ ...l, bounds: { ...l.bounds } })), resourceIds: state.resourceIds.slice(), globalKeys: state.globalKeys.slice() };
  switch (op.op) {
    case 'addFrameLayer': {
      const zero = { top: 0, left: 0, bottom: 0, right: 0 };
      const base = { isText: false, hasLuni: true, artboardKeys: [], section: 'layerInfo', extraRaw: false, bounds: zero, isSmartObject: false };
      const frame = { rect: { ...plan.rect }, type: plan.shape === 'ellipse' ? 3 : 1, shape: plan.shape };
      next.layers.splice(plan.at, 0, { ...base, name: '</Layer group>', groupType: 3, frame: null },
        { ...base, name: plan.groupOp.name, groupType: 1, frame });
      next.layers = next.layers.map((l, index) => ({ ...l, index }));
      break;
    }
    case 'setFrameRect':
      next.layers[op.index].frame = { ...next.layers[op.index].frame, rect: { ...plan.rect } };
      break;
    case 'setLayerProps': {
      const l = next.layers[op.index];
      const uni = op.unicodeName !== undefined ? op.unicodeName : op.name;
      if (uni !== undefined) { l.name = uni; l.hasLuni = true; }
      break;
    }
    case 'setText':
      next.globalKeys = next.globalKeys.filter(k => k !== 'Txt2');
      break;
    case 'deleteLayer':
    case 'reorderLayers':
      next.layers = plan.order.map((orig, k) => ({ ...next.layers[orig], index: k }));
      break;
    case 'replaceLayerPixels':
      next.layers[op.index].bounds = { ...plan.bounds };
      break;
    case 'setImageResource':
      if (!next.resourceIds.includes(op.id)) next.resourceIds.push(op.id);
      break;
    case 'removeImageResource':
      next.resourceIds = next.resourceIds.filter(id => id !== op.id);
      break;
    default: break;
  }
  return next;
}






const normErr = s => String(s).replace(/「[^」]*」/g, '「」').replace(/"[^"]*"/g, '""').replace(/-?\d+/g, '#');





function gate(newAb, origAb, results, warnings, fast = false) {
  const newU8 = new Uint8Array(newAb);

  
  const L = lintPsd(newU8);
  if (!L.ok) {
    const base = lintPsd(new Uint8Array(origAb));
    const had = new Set(base.errors.map(normErr));
    const fresh = L.errors.filter(e => !had.has(normErr(e)));
    if (fresh.length) {
      throw new EditError(
        `写回后体检未通过（lintPsd），已应用的 op：${results.map(r => `[${r.i}]${r.op}`).join(' ') || '无'}\n` +
        fresh.map(e => '  · ' + e).join('\n'),
        { stage: 'lint', errors: fresh, applied: results.map(r => ({ i: r.i, op: r.op })) });
    }
    warnings.push(`输入文件本身 lintPsd 就不过（${base.errors.length} 条），编辑没有新增错误：${base.errors[0]}`);
  }
  for (const w of L.warnings) warnings.push('lint: ' + w);

  
  let doc;
  try {
    doc = parsePsdDocument(newAb);
  } catch (e) {
    throw new EditError(
      `写回后 parsePsdDocument 解析失败：${e && e.message}；已应用的 op：${results.map(r => `[${r.i}]${r.op}`).join(' ')}`,
      { stage: 'parse', applied: results.map(r => ({ i: r.i, op: r.op })) });
  }

  
  
  if (fast) { for (const w of doc.warnings) warnings.push('doc: ' + w); return doc; }
  let round;
  try {
    round = new Uint8Array(serializePsdDocument(doc));
  } catch (e) {
    throw new EditError(
      `写回后 serializePsdDocument 抛错：${e && e.message}；已应用的 op：${results.map(r => `[${r.i}]${r.op}`).join(' ')}`,
      { stage: 'roundtrip', applied: results.map(r => ({ i: r.i, op: r.op })) });
  }
  if (!sameBytes(round, newU8)) {
    const off = firstDiff(round, newU8);
    
    let baseOk = true;
    try {
      const bd = parsePsdDocument(origAb);
      baseOk = sameBytes(new Uint8Array(serializePsdDocument(bd)), new Uint8Array(origAb));
    } catch { baseOk = false; }
    if (baseOk) {
      throw new EditError(
        `写回后的文件自身不再字节级往返（parse→serialize 首个不一致偏移 @${off}，` +
        `长度 ${newU8.length} → ${round.length}）；已应用的 op：${results.map(r => `[${r.i}]${r.op}`).join(' ')}`,
        { stage: 'roundtrip', offset: off, applied: results.map(r => ({ i: r.i, op: r.op })) });
    }
    warnings.push(`输入文件本身就不自洽（parse→serialize 不一致），新文件同样不自洽（@${off}）`);
  }
  for (const w of doc.warnings) warnings.push('doc: ' + w);
  return doc;
}
















export function applyEdits(buffer, ops, opts = {}) {
  const origAb = asAB(buffer);
  if (!Array.isArray(ops)) throw new EditError('ops 必须是数组');
  const maxOps = opts.maxOps == null ? 512 : opts.maxOps;
  if (ops.length > maxOps) throw new EditError(`一次最多 ${maxOps} 个 op，收到 ${ops.length}`);

  const warnings = [];
  const results = [];

  
  if (!ops.length) {
    return { buffer: copyAB(origAb), results, warnings, summary: { ops: 0, changed: 0, verified: false } };
  }

  if (opts.dryRun) {
    const plan = planEdits(origAb, ops);
    if (!plan.ok) throw new EditError(plan.errors[0].message, { opIndex: plan.errors[0].opIndex, stage: 'plan' });
    return { buffer: null, results: plan.results, warnings, summary: { ops: ops.length, changed: 0, dryRun: true } };
  }

  

  let ab = origAb, owned = false;
  const own = () => { if (!owned) { ab = copyAB(ab); owned = true; } };
  

  if (hasHighDepthBlockLayers(ab)) {
    own();
    ab = asAB(normalizeHighDepthLayers(ab));
    warnings.push('16/32 位文档：图层记录已从全局 Lr16/Lr32 块搬到主层信息段（像素字节不变，PS 照常读取）');
  }
  let state = stateOf(ab);
  let changedCount = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = normalizeOp(ops[i], i);
    const h = OPS[op.op];
    const plan = h.validate(state, op, i);
    let out;
    if (!h.pure) own();
    try {
      out = h.apply(ab, state, op, plan, warnings);
    } catch (e) {
      if (e instanceof EditError && e.opIndex !== undefined) throw e;
      throw opFail(i, op, `执行失败：${e && e.message}`, { cause: e && e.message, applied: results.map(r => ({ i: r.i, op: r.op })) });
    }
    if (out.buffer !== ab) owned = true;          
    ab = out.buffer;
    const rec = {
      i, op: op.op, alias: op._alias || null, ok: true,
      affected: plan.affected || [], changedFields: plan.changed || [],
      changed: !!out.result.changed, note: out.result.note || plan.note || '',
      ...out.result,
    };
    delete rec.buffer;
    results.push(rec);
    if (rec.changed) changedCount++;
    
    state = h.structural ? stateOf(ab) : simulate(state, op, plan);
  }

  

  if (results.some(r => OPS[r.op] && OPS[r.op].structural && r.changed)) {
    own();                                  
    

    if (!results.some(r => r.op === 'setLinkGroups')) {
      try { const L0 = readLinkGroups(origAb); if (L0.byId.size) ab = writeLinkGroups(ab, L0.byId); } catch {  }
    }
    ab = syncLayerCountResources(ab);
    ab = pruneOrphanLinkedFiles(ab);        
  }

  own();                                    
  let doc = null;
  if (opts.verify !== false) doc = gate(ab, origAb, results, warnings, opts.verify === 'fast');

  return {
    buffer: ab,
    results,
    warnings,
    summary: {
      ops: ops.length, changed: changedCount, verified: opts.verify !== false,
      bytesBefore: origAb.byteLength, bytesAfter: ab.byteLength,
      layerCount: doc ? doc.layers.length : state.layers.length,
    },
  };
}





export function applyEditsWithSummary(buffer, ops, opts = {}) {
  const r = applyEdits(buffer, ops, opts);
  return {
    buffer: r.buffer, results: r.results, warnings: r.warnings, meta: r.summary,
    document: r.buffer ? summarizeDocument(parsePsdDocument(r.buffer)) : null,
  };
}

export default { applyEdits, planEdits, groupPairs, groupSpan, deletionSet, checkReorder, registerOp, listOps, EditError, BLEND_KEYS };
