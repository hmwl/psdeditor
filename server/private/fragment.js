











import { decodeSmartObject, toFoxpsdLayerInfo, buildWarpRewrites } from './smart-object.js';
import { buildQuiltRewrites, needsQuiltRewrite } from './warp-write.js';

const MAX_BLOCK_BYTES = 16 * 1024 * 1024;
const MAX_FRAGMENT_BYTES = 24 * 1024 * 1024;

export function validateFragment(f) {
  if (!f || typeof f !== 'object') throw new Error('fragment 缺失');
  if (!Array.isArray(f.blocks) || !f.blocks.length) throw new Error('fragment.blocks 为空');
  if (f.blocks.length > 8) throw new Error('fragment.blocks 过多');
  let totalBytes = 0;
  for (const b of f.blocks) {
    if (b.key !== 'SoLd' && b.key !== 'PlLd') throw new Error('放置块 key 只能是 SoLd / PlLd');
    if (!(b.data instanceof Uint8Array)) throw new Error('放置块 data 须为字节');
    if (b.data.length > MAX_BLOCK_BYTES) throw new Error('放置块过大（上限 16 MiB）');
    totalBytes += b.data.length;
    if (totalBytes > MAX_FRAGMENT_BYTES) throw new Error('放置片段过大（上限 24 MiB）');
  }
  const bd = f.bounds;
  if (!bd || ![bd.top, bd.left, bd.bottom, bd.right].every(Number.isFinite)) throw new Error('bounds 无效');
  return f;
}

function decode(fragment) {
  validateFragment(fragment);
  const so = decodeSmartObject({ layerName: String(fragment.layerName || ''), bounds: fragment.bounds,
                                 kind: fragment.kind, psb: !!fragment.psb, blocks: fragment.blocks }, null);
  if (!so) throw new Error('放置块无法解析（不是有效的 SoLd/PlLd 数据）');
  return so;
}


function publicLayerInfo(li) {
  if (!li) return null;
  const { pointsLocal, sourceImage, deform, deforms, ...rest } = li;
  return { ...rest, deform: null, deforms: null };
}


export function resolveFragment(fragment) {
  const so = decode(fragment);
  const li = toFoxpsdLayerInfo(so);
  const proWarp = li.proWarp || [];
  return {
    layerInfo: publicLayerInfo(li),
    layerInfoBase: null,
    summary: {
      kind: so.kind,
      originalSize: so.originalSize || null,
      hasWarp: proWarp.includes('warp') || proWarp.includes('quiltWarp'),
      isQuilt: !!(so.warp && so.warp.isQuilt),
      meshPointCount: 0,
      proWarp,
      proWarpKinds: proWarp,
      placedId: so._raw && so._raw.descriptor && typeof so._raw.descriptor.placed === 'string' ? so._raw.descriptor.placed : null,
      linkId: so.linkId || null
    }
  };
}

const MAX_POINTS = 4096;
function checkPlacement(points, cols, rows) {
  const n = points.length;
  if (!cols || !rows || cols < 2 || rows < 2 || cols * rows !== n) throw new Error('控制点数量与 xn / yn 不符');
  const p00 = points[0], p10 = points[cols - 1], p01 = points[(rows - 1) * cols], p11 = points[n - 1];
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1), v = j / (rows - 1);
    const a = lerp(p00, p10, u), b = lerp(p01, p11, u);
    const e = lerp(a, b, v), p = points[j * cols + i];
    if (Math.abs(p.x - e.x) > 0.6 || Math.abs(p.y - e.y) > 0.6) throw new Error('不支持自由变换变形写回');
  }
}
function checkPoints(pts, what) {
  if (!Array.isArray(pts) || !pts.length || pts.length > MAX_POINTS) throw new Error(`${what} 数量无效`);
  for (const p of pts) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`${what} 含非法坐标`);
  return pts.map(p => ({ x: +p.x, y: +p.y }));
}





export function writebackFragment(fragment, edit) {
  const so = decode(fragment);
  if (!edit || typeof edit !== 'object') throw new Error('edit 缺失');
  let blocks, mode;
  const points = checkPoints(edit.points, '控制点');
  checkPlacement(points, edit.xn | 0, edit.yn | 0);
  if (needsQuiltRewrite(so, points)) {
    blocks = buildQuiltRewrites(so, points, { cols: edit.xn | 0, rows: edit.yn | 0,
      sliceX: (edit.sliceX || []).map(Number), sliceY: (edit.sliceY || []).map(Number) });
    mode = 'quiltWarp';
  } else { blocks = buildWarpRewrites(so, points); mode = 'warp'; }
  return { mode, blocks };
}
