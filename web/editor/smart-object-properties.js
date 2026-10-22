

import { parsePsdFull, parseSmartObjects, replaceLayerBlock, smartObjectFragment } from '../../core/psd-parse.js';
import { parsePsdDocument } from '../../core/psd-document.js';
import { readLayerSoLd, writeSoLdBytes } from '../../core/psd-edit-sfx.js';
import { compsFromDescriptor, cmlsFromShmd } from '../../core/layer-comps.js';
import { applyEdits } from '../../core/psd-edit.js';
import { transformLayersLocal } from '../../core/layer-geometry.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { compositeAll } from '../../core/compose.js';
import { parseAdditionalBlock, writeAdditionalBlock } from '../../core/psd-additional.js';
import { rebuildPsdReplacingLayerPixels } from '../../core/psd-write.js';

const toAB = value => value instanceof ArrayBuffer ? value
  : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
export const isPsdSource = bytes => !!(bytes && bytes.length >= 26
  && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53);


export function sourceLayerComps(bytes) {
  if (!isPsdSource(bytes)) return { list: [], lastApplied: null };
  const doc = parsePsdDocument(toAB(bytes));
  return compsFromDescriptor(doc.imageResources.find(r => r.id === 1065)?.data?.descriptor);
}

export function smartObjectPropertyModel(buffer, index) {
  const ab = toAB(buffer), layer = parsePsdFull(ab).layers[index];
  const placed = readLayerSoLd(ab, layer);
  if (!placed) throw new Error('这个智能对象没有 SoLd 放置描述符');
  const so = parseSmartObjects(ab).find(s => s.layerIndex === index);
  const source = so?.sourceImage;
  const comps = sourceLayerComps(source?.bytes);
  const d = placed.desc;
  return { index, source, placed, comps, compId: Number.isInteger(d.comp) ? d.comp : -1,
    width: +(d['Sz  ']?.Wdth?.value ?? d['Sz  ']?.Wdth),
    height: +(d['Sz  ']?.Hght?.value ?? d['Sz  ']?.Hght) };
}

export function smartPropertyFragment(buffer, index) {
  const ab = toAB(buffer), so = parseSmartObjects(ab).find(s => s.layerIndex === index);
  if (!so) throw new Error('选中的不是智能对象');
  return smartObjectFragment(ab, so);
}



export async function sourceLayerCompImage(bytes, compId = -1) {
  if (!isPsdSource(bytes)) throw new Error('图层复合需要 PSD 或 PSB 源文档');
  let buffer = toAB(bytes);
  const unsupportedAppearance = [];
  if (compId !== -1) {
    const doc = parsePsdDocument(buffer);
    const comp = compsFromDescriptor(doc.imageResources.find(r => r.id === 1065)?.data?.descriptor)
      .list.find(c => c.id === compId);
    if (!comp) throw new Error('源文档中没有这个图层复合');
    const ops = [], positions = [];
    for (let index = 0; index < doc.layers.length; index++) {
      const l = doc.layers[index], block = l.additionalBlocks.find(b => b.key === 'shmd');
      const state = block && cmlsFromShmd(block._raw).get(compId);
      if (!state) continue;
      if (comp.cap.vis && state.v !== undefined) ops.push({ op: 'setLayerProps', index, visible: state.v });
      if (comp.cap.pos && (state.dx || state.dy)) positions.push({ index, dx: state.dx || 0, dy: state.dy || 0 });
      if (comp.cap.app && state.app) {
        const p = { op: 'setLayerProps', index };
        if (state.app.opacity != null) p.opacity = Math.max(0, Math.min(255, Math.round(state.app.opacity * 2.55)));
        if (state.app.mode) p.blendKey = state.app.mode;
        if (p.opacity != null || p.blendKey) ops.push(p);
        if (state.app.effects) unsupportedAppearance.push({ index, kind: 'layer-effects' });
      }
    }
    if (ops.length) buffer = applyEdits(buffer, ops).buffer;
    for (const p of positions) buffer = transformLayersLocal(buffer, [1, 0, 0, 1, p.dx, p.dy], [p.index]).buffer;
  }
  const doc = await parsePsdRaster(buffer);
  const surface = compositeAll(doc, doc.width, doc.height, new Map());
  return { data: new Uint8ClampedArray(surface.data), width: doc.width, height: doc.height,
    unsupportedAppearance: unsupportedAppearance.length ? unsupportedAppearance : undefined };
}



export function rewriteSmartObjectProperty(buffer, index, mutate) {
  const ab = toAB(buffer), l = parsePsdFull(ab).layers[index], placed = readLayerSoLd(ab, l);
  if (!placed) throw new Error('这个智能对象没有 SoLd 放置描述符');
  mutate(placed.desc);
  return replaceLayerBlock(ab, index, 'SoLd', writeSoLdBytes(placed));
}



export function setSmartObjectComp(buffer, index, compId) {
  const model = smartObjectPropertyModel(buffer, index);
  if (!Number.isInteger(compId) || (compId !== -1 && !model.comps.list.some(c => c.id === compId)))
    throw new Error('源文档中没有这个图层复合');
  return rewriteSmartObjectProperty(buffer, index, desc => {
    desc.comp = compId; desc.__long = { ...desc.__long, comp: true };
    if (desc.compInfo && typeof desc.compInfo === 'object') {
      
      
      
      const previous = desc.compInfo.originalCompID;
      const original = compId === -1 ? (Number.isFinite(previous) ? previous : -1) : compId;
      const list = model.comps.list.map(c => ({ __name: '', __classID: 'null', 'Nm  ': c.name,
        Idnt: c.id | 0, __long: { Idnt: true }, comment: c.comment || '' }));
      desc.compInfo = { ...desc.compInfo, compID: -1, originalCompID: original, compList: list,
        __long: { ...desc.compInfo.__long, compID: true, originalCompID: true } };
    }
  });
}


export function smartPropertyWithRaster(buffer, index, rendered) {
  const ab = toAB(buffer);
  if (!rendered || !rendered.rgba || !rendered.bounds) throw new Error('智能对象内容未能重新渲染');
  const bounds = rendered.rgba.length ? rendered.bounds : { left: 0, top: 0, right: 1, bottom: 1 };
  const rgba = rendered.rgba.length ? rendered.rgba : new Uint8Array(4);
  return rebuildPsdReplacingLayerPixels(ab, index, rgba, bounds, null).buffer;
}

const pnt = (x, y) => ({ x, y });


export function resetSmartObjectPlacement(buffer, index, rect = null) {
  const model = smartObjectPropertyModel(buffer, index);
  if (!rect) {
    const q = model.placed.desc.Trnf;
    if (!Array.isArray(q) || q.length !== 8 || q.some(v => !Number.isFinite(v))) throw new Error('智能对象放置四点无效');
    const cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4;
    rect = { x: cx - model.width / 2, y: cy - model.height / 2, w: model.width, h: model.height };
  }
  if (!rect || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(rect[k])) || rect.w <= 0 || rect.h <= 0)
    throw new Error('复位后的边界必须是有效的矩形');
  if (!(model.width > 0 && model.height > 0)) throw new Error('智能对象缺少源文档尺寸');
  const warp = { __explicit: { __classID: true }, __name: '', __classID: 'warp',
    warpStyle: { __enumType: 'warpStyle', value: 'warpNone' }, warpValue: 0,
    warpPerspective: 0, warpPerspectiveOther: 0, warpRotate: { __enumType: 'Ornt', value: 'Hrzn' },
    bounds: { __name: '', __classID: 'classFloatRect', 'Top ': rect.y, Left: rect.x, Btom: rect.y + rect.h, Rght: rect.x + rect.w,
      __doub: { 'Top ': true, Left: true, Btom: true, Rght: true } }, uOrder: 4, vOrder: 4,
    __doub: { warpValue: true, warpPerspective: true, warpPerspectiveOther: true },
    __long: { uOrder: true, vOrder: true } };
  const q = [rect.x, rect.y, rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h];
  let out = rewriteSmartObjectProperty(buffer, index, desc => {
    desc.Trnf = q; desc.nonAffineTransform = q.slice(); desc.warp = warp; delete desc.quiltWarp;
  });
  for (const key of ['PlLd', 'plLd']) {
    const block = parsePsdFull(out).layers[index].blocks.find(b => b.key === key);
    if (!block) continue;
    const placed = parseAdditionalBlock(key, new Uint8Array(out, block.dataOffset, block.dataLength), { verify: false });
    placed.transform = q.slice(); placed.desc = structuredClone(warp);
    out = replaceLayerBlock(out, index, key, writeAdditionalBlock(key, placed));
  }
  const points = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) points.push(pnt(rect.x + rect.w * c / 3, rect.y + rect.h * r / 3));
  return { buffer: out, rect, layerInfo: { width: model.width, height: model.height, originalSize: `${model.width},${model.height}`,
    points, xn: 4, yn: 4, sliceX: [], sliceY: [], deforms: null, deform: null, baseWarp: null,
    placementQuad: [0, 2, 4, 6].map(i => pnt(q[i], q[i + 1])),
    unwarpedQuad: [0, 2, 4, 6].map(i => pnt(q[i], q[i + 1])),
    rect: [rect.x, rect.y, rect.w, rect.h], BoundingRect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h] } };
}
