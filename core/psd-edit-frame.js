


import { createCreateOps } from './psd-edit-create.js';
import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';
import { normalizeSubpathInput, freshPathRecords } from './psd-edit-path.js';
import { frameInfoOf, frameDescriptor, frameSubpaths, FRAME_TYPES } from './psd-frame.js';

const point = (x, y) => ({ __name: '', __classID: 'Pnt ', Hrzn: x, Vrtc: y, __doub: { Hrzn: true, Vrtc: true } });
function originModel(rect, shape) {
  const { x, y, w, h } = rect, u = value => ({ __unit: '#Pxl', value });
  const item = { __name: '', __classID: 'null', keyOriginType: shape === 'ellipse' ? 5 : 1,
    __long: { keyOriginType: true, keyOriginIndex: true }, keyOriginResolution: 72, __doub: { keyOriginResolution: true },
    keyOriginShapeBBox: { __name: '', __classID: 'unitRect', unitValueQuadVersion: 1, __long: { unitValueQuadVersion: true },
      'Top ': u(y), Left: u(x), Btom: u(y + h), Rght: u(x + w) },
    Trnf: { __name: '', __classID: 'Trnf', xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0,
      __doub: { xx: true, xy: true, yx: true, yy: true, tx: true, ty: true } }, keyOriginIndex: 0 };
  if (shape === 'rect') item.keyOriginBoxCorners = { __name: '', __classID: 'null',
    rectangleCornerA: point(x, y), rectangleCornerB: point(x + w, y),
    rectangleCornerC: point(x + w, y + h), rectangleCornerD: point(x, y + h) };
  return { version: 1, descVersion: 16, desc: { __name: '', __classID: 'null', keyDescriptorList: [item] } };
}
function strokeModel() {
  const enm = (type, value) => ({ __enumType: type, value });
  return { descVersion: 16, desc: { __name: '', __classID: 'strokeStyle', strokeStyleVersion: 2,
    __long: { strokeStyleVersion: true }, strokeEnabled: false, fillEnabled: true,
    strokeStyleLineWidth: { __unit: '#Pxl', value: 1 }, strokeStyleLineDashOffset: { __unit: '#Pnt', value: 0 },
    strokeStyleMiterLimit: 100, __doub: { strokeStyleMiterLimit: true, strokeStyleResolution: true },
    strokeStyleLineCapType: enm('strokeStyleLineCapType', 'strokeStyleButtCap'),
    strokeStyleLineJoinType: enm('strokeStyleLineJoinType', 'strokeStyleMiterJoin'),
    strokeStyleLineAlignment: enm('strokeStyleLineAlignment', 'strokeStyleAlignCenter'),
    strokeStyleScaleLock: false, strokeStyleStrokeAdjust: false, strokeStyleLineDashSet: [],
    strokeStyleBlendMode: enm('BlnM', 'normal'), strokeStyleOpacity: { __unit: '#Prc', value: 100 },
    strokeStyleContent: { __name: '', __classID: 'solidColorLayer', 'Clr ': { __name: '', __classID: 'RGBC',
      'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0, __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true } } },
    strokeStyleResolution: 72 } };
}

export function createFrameOps(h) {
  const newGroup = createCreateOps(h).newGroup;
  function rectOf(op, i) {
    const r = op.rect;
    if (!r || !['x', 'y', 'w', 'h'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k])) || !(r.w > 0 && r.h > 0))
      throw h.opFail(i, op, 'rect 必须是有限的 {x,y,w,h}，宽高必须大于0');
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }
  function pathModel(rect, shape, state, fail) {
    const norm = normalizeSubpathInput(frameSubpaths(rect, shape), 'pixel', fail);
    return { version: 3, flags: 0, path: { records: freshPathRecords(norm, state.width, state.height, fail) } };
  }
  function writeBlock(ab, index, key, model) {
    const psb = !!h.parsePsdFull(ab).sections.psb;
    return h.upsertLayerBlock(ab, index, key, writeAdditionalBlock(key, model, { psb }));
  }
  function dropDerivedMask(layer) {
    if (layer.mask?.present && (layer.mask.flags & 8) && !layer.mask.real) {
      layer.mask = { present: false };
      layer.channels = layer.channels.filter(c => c.id !== -2 && c.id !== -3);
      return true;
    }
    return false;
  }
  function validateAdd(state, op, i) {
    if (state.mode !== 3 || state.depth !== 8) throw h.opFail(i, op, '原生图框新建当前仅验证了 RGB/8 文档');
    const rect = rectOf(op, i), shape = op.shape || 'rect';
    if (!Object.hasOwn(FRAME_TYPES, shape)) throw h.opFail(i, op, 'shape 只能是 rect / ellipse');
    const fail = (msg, info) => h.opFail(i, op, msg, info);
    pathModel(rect, shape, state, fail); 
    const groupOp = { op: 'newGroup', at: op.at, name: op.name || `图框 ${state.layers.filter(l => l.frame).length + 1}` };
    const groupPlan = newGroup.validate(state, groupOp, i);
    return { ...groupPlan, rect, shape, groupOp, groupPlan, opIndex: i, note: `新建原生${shape === 'ellipse' ? '椭圆' : '矩形'}图框` };
  }
  function applyAdd(ab, state, op, plan, warnings) {
    const group = newGroup.apply(ab, state, plan.groupOp, plan.groupPlan, warnings);
    let out = group.buffer;
    const index = group.result.headerIndex, fail = (msg, info) => h.opFail(plan.opIndex, op, msg, info);
    out = writeBlock(out, index, 'vsms', pathModel(plan.rect, plan.shape, state, fail));
    out = writeBlock(out, index, 'vogk', originModel(plan.rect, plan.shape));
    out = writeBlock(out, index, 'vstk', strokeModel());
    out = writeBlock(out, index, 'frgb', { descVersion: 16, desc: frameDescriptor(plan.rect, plan.shape) });
    out = writeBlock(out, index, 'lnsr', { nameSource: 'fram' });
    out = writeBlock(out, index - 1, 'lnsr', { nameSource: 'lset' });
    out = writeBlock(out, index, 'vowv', { value: 2 });
    const doc = h.parsePsdDocument(out);
    
    doc.layers[index].blend.key = 'norm';
    const nextId = doc.layers.reduce((max, l) => Math.max(max, l.additional.lyid?.id || 0), 0) + 1;
    out = h.asAB(h.serializePsdDocument(doc));
    out = writeBlock(out, index - 1, 'lyid', { id: nextId });
    out = writeBlock(out, index, 'lyid', { id: nextId + 1 });
    return { buffer: out, result: { changed: true, index, headerIndex: index, dividerIndex: index - 1,
      name: plan.groupOp.name, frame: frameInfoOf(frameDescriptor(plan.rect, plan.shape)), note: plan.note } };
  }
  function validateSet(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (!layer.frame) throw h.opFail(i, op, '选中的图层不是原生图框（没有有效 frgb）');
    const rect = rectOf(op, i);
    return { affected: [op.index], changed: ['layers'], rect, opIndex: i, note: '修改原生图框边界' };
  }
  function applySet(ab, state, op, plan) {
    let out = ab;
    const doc = h.parsePsdDocument(ab), layer = doc.layers[op.index], old = layer.frame;
    if (['x', 'y', 'w', 'h'].every(k => old.rect[k] === plan.rect[k])) return { buffer: ab, result: { changed: false, index: op.index } };
    const block = layer.additionalBlocks.find(b => b.key === 'vsms' || b.key === 'vmsk');
    if (!block?.model?.path) throw h.opFail(plan.opIndex, op, '图框矢量路径不可读，拒绝只改边界描述符');
    const model = parseAdditionalBlock(block.key, block._raw, { psb: state.psb });
    const map = (v, axis) => {
      const dim = axis ? state.width : state.height, pos = axis ? 'x' : 'y', size = axis ? 'w' : 'h';
      const pixel = v / 0x1000000 * dim;
      const n = Math.round(((pixel - old.rect[pos]) * plan.rect[size] / old.rect[size] + plan.rect[pos]) / dim * 0x1000000);
      if (!Number.isFinite(n) || n < -0x80000000 || n > 0x7fffffff) throw h.opFail(plan.opIndex, op, '图框路径变换超出 PSD 8.24 定点范围');
      return n;
    };
    for (const record of model.path.records) if (record.type === 'knot') record.fixed = record.fixed.map((v, n) => map(v, n % 2));
    out = writeBlock(out, op.index, block.key, model);
    out = writeBlock(out, op.index, 'frgb', { ...layer.additional.frgb, desc: frameDescriptor(plan.rect, old.shape, layer.additional.frgb) });
    
    if (old.shape === 'rect' || old.shape === 'ellipse') out = writeBlock(out, op.index, 'vogk', originModel(plan.rect, old.shape));
    else out = h.upsertLayerBlock(out, op.index, 'vogk', null);
    const changed = h.parsePsdDocument(out);
    if (dropDerivedMask(changed.layers[op.index])) out = h.asAB(h.serializePsdDocument(changed));
    return { buffer: out, result: { changed: true, index: op.index, frame: frameInfoOf(frameDescriptor(plan.rect, old.shape, layer.additional.frgb)), note: plan.note } };
  }
  return {
    addFrameLayer: { validate: validateAdd, apply: applyAdd, structural: true, pure: true },
    setFrameRect: { validate: validateSet, apply: applySet, structural: true },
  };
}
