














import { serializeDescriptor, Writer, computeHomographyQuad, applyHomography, invert3x3, replacePlacedBlocks } from '../../core/index.js';
import { presetMesh } from '../../core/path-warp.js';
import { TRANSFORM_WARP_STYLES } from '../../core/transform-warp-presets.js';
import { decodeCurrent } from './smart-object.js';

const clone = o => JSON.parse(JSON.stringify(o));



function unitFloats(values, unit = '#Pxl') { return { __unit: unit, values }; }

function objArray(classID, key, values, unit = '#Pxl') {
  return { __objectArray: true, __itemsCount: values.length, __classID: classID, __name: '',
           [key]: unitFloats(values, unit) };
}

function floatRect(b) {
  return { __name: '', __classID: 'classFloatRect',
           'Top ': b.top, 'Left': b.left, 'Btom': b.bottom, 'Rght': b.right };
}


function defaultWarpDescriptor(bounds) {
  return {
    __name: '', __classID: 'warp',
    warpStyle: { __enumType: 'warpStyle', value: 'warpNone' },
    warpValue: 0, warpPerspective: 0, warpPerspectiveOther: 0,
    warpRotate: { __enumType: 'Ornt', value: 'Hrzn' },
    bounds: floatRect(bounds),
    uOrder: 4, vOrder: 4
  };
}









export function buildQuiltWarpDescriptor(tmpl, local, cols, rows, sliceX, sliceY, bounds) {
  const W = bounds.right - bounds.left, H = bounds.bottom - bounds.top;
  
  const sx = [bounds.left, ...sliceX.map(v => bounds.left + v * W), bounds.right];
  const sy = [bounds.top, ...sliceY.map(v => bounds.top + v * H), bounds.bottom];

  if (sx.length !== (cols - 1) / 3 + 1) throw new Error(`quiltSliceX 数量 ${sx.length} 与 ${cols} 列控制点不符`);
  if (sy.length !== (rows - 1) / 3 + 1) throw new Error(`quiltSliceY 数量 ${sy.length} 与 ${rows} 行控制点不符`);

  const q = {
    __name: '', __classID: 'quiltWarp',
    warpStyle: clone(tmpl.warpStyle) || { __enumType: 'warpStyle', value: 'warpCustom' },
    warpValue: tmpl.warpValue ?? 0,
    warpPerspective: tmpl.warpPerspective ?? 0,
    warpPerspectiveOther: tmpl.warpPerspectiveOther ?? 0,
    warpRotate: clone(tmpl.warpRotate) || { __enumType: 'Ornt', value: 'Hrzn' },
    bounds: floatRect(bounds),
    uOrder: 4, vOrder: 4,
    deformNumRows: rows, deformNumCols: cols,
    customEnvelopeWarp: {
      __name: '', __classID: 'customEnvelopeWarp',
      quiltSliceX: objArray('UntF', 'quiltSliceX', sx),
      quiltSliceY: objArray('UntF', 'quiltSliceY', sy),
      meshPoints: {
        __objectArray: true, __itemsCount: local.length, __classID: 'rationalPoint', __name: '',
        Hrzn: unitFloats(local.map(p => p.x)),
        Vrtc: unitFloats(local.map(p => p.y))
      }
    }
  };
  q.warpStyle.value = 'warpCustom';
  return q;
}



function buildSoLdBlock(placed, descriptor) {
  const w = new Writer();
  w.ascii(placed.id);          
  w.u32(placed.version);
  w.u32(placed.descVersion);
  const head = w.finish();
  const body = serializeDescriptor(descriptor);
  let len = head.length + body.length;
  const pad = (4 - (len % 4)) % 4;      
  const out = new Uint8Array(len + pad);
  out.set(head, 0); out.set(body, head.length);
  return out;
}



function buildPlLdBlock(placed, trnf, warpDescriptor) {
  const w = new Writer();
  w.ascii(placed.type);        
  w.u32(placed.version);
  w.u8(placed.uniqueId.length);        
  w.ascii(placed.uniqueId);
  w.u32(placed.pageNum); w.u32(placed.totalPages);
  w.u32(placed.antiAlias); w.u32(placed.placedType);
  for (let i = 0; i < 8; i++) w.f64(trnf[i]);
  w.u32(0);                           
  w.u32(placed.warpDescVersion || 16);
  const head = w.finish();
  const body = serializeDescriptor(warpDescriptor);
  let len = head.length + body.length;
  const pad = (4 - (len % 4)) % 4;
  const out = new Uint8Array(len + pad);
  out.set(head, 0); out.set(body, head.length);
  return out;
}










export function buildQuiltRewrites(so, docPoints, opts = {}) {
  if (!so.warp) throw new Error('该智能对象没有 warp 描述符');
  const cols = opts.cols, rows = opts.rows;
  if (!cols || !rows) throw new Error('quiltWarp 写回需要 cols / rows');
  if (docPoints.length !== cols * rows) throw new Error(`控制点数 ${docPoints.length} 与 ${cols}×${rows} 不符`);
  if ((cols - 1) % 3 || (rows - 1) % 3) throw new Error(`网格必须是 (3k+1)×(3l+1)，收到 ${cols}×${rows}`);

  const soldBlk = so.placedBlocks.find(b => b.key === 'SoLd' && b.placed) || null;
  const plldBlks = so.placedBlocks.filter(b => b.key === 'PlLd' && b.placed);
  if (!soldBlk && !plldBlks.length) throw new Error('该图层的 placed 块解析失败，无法写回');

  
  const tmpl = soldBlk
    ? (soldBlk.placed.descriptor.quiltWarp || soldBlk.placed.descriptor.warp)
    : (plldBlks[0].placed.warp?.warp || null);
  if (!tmpl) throw new Error('placed 块描述符里没有 warp/quiltWarp');

  
  const wb=so.warp.bounds||{left:0,top:0,right:so.originalSize.width,bottom:so.originalSize.height};
  const ml = so.warp.meshPoints||[{x:wb.left,y:wb.top},{x:wb.right,y:wb.bottom}];
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const p of ml) { if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y; if (p.x > mxx) mxx = p.x; if (p.y > mxy) mxy = p.y; }
  const H = computeHomographyQuad([mnx, mny, mxx, mny, mxx, mxy, mnx, mxy], so.transformQuad);
  const Hinv = invert3x3(H);
  if (!Hinv) throw new Error('变换矩阵不可逆，无法写回');
  const local = docPoints.map(p => applyHomography(Hinv, p.x, p.y));

  
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of local) { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; }
  const trnf = [];
  for (const [x, y] of [[a, b], [c, b], [c, d], [a, d]]) { const q = applyHomography(H, x, y); trnf.push(q.x, q.y); }

  const bounds = so.warp.bounds || { top: 0, left: 0, bottom: so.originalSize?.height || 1, right: so.originalSize?.width || 1 };
  const sliceX = opts.sliceX || [], sliceY = opts.sliceY || [];
  const quilt = buildQuiltWarpDescriptor(tmpl, local, cols, rows, sliceX, sliceY, bounds);

  
  const rewrites = [];
  if (soldBlk) {
    const desc = soldBlk.placed.descriptor;
    
    const nd = {};
    for (const k of Object.keys(desc)) {
      if (k === 'warp' || k === 'quiltWarp') {
        if (!nd.quiltWarp) { nd.quiltWarp = quilt; nd.warp = defaultWarpDescriptor(bounds); }
        continue;
      }
      nd[k] = desc[k];
      if (k === 'Trnf') nd[k] = trnf.slice();
      if (k === 'nonAffineTransform') nd[k] = trnf.slice();
    }
    if (!nd.quiltWarp) { nd.quiltWarp = quilt; nd.warp = defaultWarpDescriptor(bounds); }
    rewrites.push({ key: 'SoLd', data: buildSoLdBlock(soldBlk.placed, nd) });
  }
  for (const pb of plldBlks) rewrites.push({ key: 'PlLd', data: buildPlLdBlock(pb.placed, trnf, quilt) });
  return rewrites;
}


export function buildSoLdRewrite(so, mutate) {
  const soldBlk = so.placedBlocks.find(b => b.key === 'SoLd' && b.placed) || null;
  if (!soldBlk) throw new Error('该图层没有 SoLd 块（老格式 PlLd 不含滤镜信息）');
  const desc = mutate(soldBlk.placed.descriptor) || soldBlk.placed.descriptor;
  return [{ key: 'SoLd', data: buildSoLdBlock(soldBlk.placed, desc) }];
}








export function writeQuiltWarpBack(buffer, so, docPoints, opts = {}) {
  return replacePlacedBlocks(buffer, so, buildQuiltRewrites(decodeCurrent(buffer, so), docPoints, opts));
}

export function rewriteSoLdDescriptor(buffer, so, mutate) {
  return replacePlacedBlocks(buffer, so, buildSoLdRewrite(decodeCurrent(buffer, so), mutate));
}

export function needsQuiltRewrite(so, docPoints) {
  const n = so.meshPointCount != null ? so.meshPointCount : (so.warp && so.warp.meshPoints ? so.warp.meshPoints.length : 0);
  return !n || docPoints.length !== n;
}


