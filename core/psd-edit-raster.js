






















export const RASTER_BLOCK_KEYS = [
  'TySh',                       
  'vmsk', 'vsms', 'vogk',       
  'vstk', 'vscg',               
  'SoCo', 'GdFl', 'PtFl',       
  'SoLd', 'PlLd',               
];


const KIND_OF = {
  TySh: '文字', vmsk: '矢量蒙版', vsms: '矢量蒙版', vogk: '矢量原点',
  vstk: '矢量描边', vscg: '描边内容', SoCo: '纯色填充', GdFl: '渐变填充',
  PtFl: '图案填充', SoLd: '智能对象', PlLd: '智能对象',
};

export function createRasterOps(h) {

  
  function presentKeys(ab, index, keys = RASTER_BLOCK_KEYS) {
    const out = [];
    for (const k of keys) if (h.findLayerBlockRange(ab, index, k)) out.push(k);
    return out;
  }

  function validateRasterize(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);   
    if (op.keys !== undefined) {
      if (!Array.isArray(op.keys) || !op.keys.length)
        throw h.opFail(i, op, 'keys 要么不给（默认摘掉全部矢量 / 文字 / 填充块），要么是一个非空数组');
      for (const k of op.keys)
        if (!RASTER_BLOCK_KEYS.includes(k))
          throw h.opFail(i, op, `keys 里的「${k}」不是可栅格化的块；可用：${RASTER_BLOCK_KEYS.join(' ')}`,
            { available: RASTER_BLOCK_KEYS });
    }
    return {
      affected: [op.index], _i: i, _op: op,
      note: `图层 ${op.index}「${layer.name}」栅格化：摘掉决定图层类型的附加块`,
    };
  }

  function applyRasterize(ab, state, op, plan) {
    const want = op.keys ? op.keys.slice() : RASTER_BLOCK_KEYS;
    const had = presentKeys(ab, op.index).filter(k => want.includes(k));
    if (!had.length)
      return { buffer: ab, result: { changed: false, note: `图层 ${op.index} 上没有要摘的块（已经是普通像素层）` } };
    let out = ab;
    for (const k of had) out = h.upsertLayerBlock(out, op.index, k, null);
    
    const left = presentKeys(out, op.index).filter(k => want.includes(k));
    if (left.length)
      throw h.opFail(plan._i, op, `栅格化没摘干净，还剩 ${left.join(' / ')}（内部错误，已放弃这次改动）`);
    return {
      buffer: out,
      result: {
        changed: true, removed: had,
        note: `图层 ${op.index} 栅格化：摘掉 ${had.map(k => `${k}(${KIND_OF[k] || k})`).join('、')}`,
      },
    };
  }

  


  const FX_KEYS = ['lfx2', 'lmfx', 'lrFX'];
  function validateClearFx(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    return { affected: [op.index], _i: i, _op: op, note: `图层 ${op.index}「${layer.name}」摘掉图层样式块` };
  }
  function applyClearFx(ab, state, op, plan) {
    const had = presentKeys(ab, op.index, FX_KEYS);
    if (!had.length) return { buffer: ab, result: { changed: false, note: `图层 ${op.index} 上没有图层样式块` } };
    let out = ab;
    for (const k of had) out = h.upsertLayerBlock(out, op.index, k, null);
    if (presentKeys(out, op.index, FX_KEYS).length)
      throw h.opFail(plan._i, op, '图层样式块没摘干净（内部错误，已放弃这次改动）');
    return { buffer: out, result: { changed: true, removed: had, note: `图层 ${op.index} 摘掉 ${had.join(' / ')}` } };
  }

  return {
    
    rasterizeLayer: { validate: validateRasterize, apply: applyRasterize, structural: true },
    clearLayerEffects: { validate: validateClearFx, apply: applyClearFx, structural: true },
  };
}

export default { createRasterOps, RASTER_BLOCK_KEYS };
