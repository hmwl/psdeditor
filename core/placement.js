













export const FIT_MODES = ['cover', 'contain', 'tile', 'stretch'];
export const FIT_LABELS = { cover: '撑满（裁掉溢出）', contain: '适应（留白）', tile: '铺满（平铺重复）', stretch: '拉伸（非等比填满）' };















export function computePlacement(o) {
  const { srcW, srcH, dstW, dstH } = o;
  const mode = o.mode || 'cover';
  const alignX = o.alignX ?? 0.5, alignY = o.alignY ?? 0.5;
  const userScale = o.scale || 1, rot = o.rotate || 0;
  const offX = o.offsetX || 0, offY = o.offsetY || 0;

  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0))
    throw new Error(`computePlacement 需要正的尺寸：src ${srcW}×${srcH} dst ${dstW}×${dstH}`);

  
  let dx, dy;
  switch (mode) {
    case 'contain': dx = dy = Math.min(dstW / srcW, dstH / srcH); break;
    case 'cover':   dx = dy = Math.max(dstW / srcW, dstH / srcH); break;
    case 'stretch': dx = dstW / srcW; dy = dstH / srcH; break;
    case 'tile':    dx = dy = 1; break;
    default: throw new Error('未知覆盖模式：' + mode);
  }
  dx *= userScale; dy *= userScale;

  
  const cx = (alignX - 0.5) * (dstW - srcW * dx) + offX;
  const cy = (alignY - 0.5) * (dstH - srcH * dy) + offY;

  
  const cos = Math.cos(-rot), sin = Math.sin(-rot);

  
  const a11 = dstW, a13 = -0.5 * dstW - cx;
  const a22 = dstH, a23 = -0.5 * dstH - cy;
  
  
  const sx = 1 / (dx * srcW), sy = 1 / (dy * srcH);

  
  const m = [
    sx * (cos * a11), sx * (-sin * a22), sx * (cos * a13 - sin * a23) + 0.5,
    sy * (sin * a11), sy * (cos * a22),  sy * (sin * a13 + cos * a23) + 0.5,
    0, 0, 1
  ];

  return { matrix: m, repeat: mode === 'tile', mode, drawScaleX: dx, drawScaleY: dy };
}


export function applyPlacement(matrix, u, v) {
  return { u: matrix[0] * u + matrix[1] * v + matrix[2],
           v: matrix[3] * u + matrix[4] * v + matrix[5] };
}


export const IDENTITY_PLACEMENT = { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], repeat: false, mode: 'stretch', drawScaleX: 1, drawScaleY: 1 };
