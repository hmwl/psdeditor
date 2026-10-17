











import { tessellateWarp } from './mesh.js';
import { computePlacement, IDENTITY_PLACEMENT } from './placement.js';
import { downscale } from './render/cpu.js';
import { buildDeformMesh, deformStackBounds } from './psd-deform.js';
import { buildPerspectiveFieldMesh } from './perspective-render.js';
import { invert3x3, applyHomography } from './homography.js';



function fitToPlacement(f, image, li) {
  const plainStretch = !f || !f.mode || f.mode === 'none' || (f.mode === 'stretch'
    && !f.rotate && !f.offsetX && !f.offsetY && (f.scale == null || f.scale === 1));
  if (plainStretch) return IDENTITY_PLACEMENT;
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  if (!(srcW > 0 && srcH > 0)) throw new Error(`覆盖模式 ${f.mode} 需要图像尺寸，但拿到 ${srcW}×${srcH}（图片可能还没加载完）`);
  return computePlacement({ srcW, srcH, dstW: li.width || srcW, dstH: li.height || srcH, ...f });
}

export function renderWarp(o) {
  const li = o.layerInfo;
  

  if (!li.points) {
    const all = li.deforms && li.deforms.length ? li.deforms : (li.deform ? [li.deform] : []);
    if (all.length) return renderDeformStack(o, all.filter(d => d && d.enabled !== false));
  }

  const cols = li.xn, rows = li.yn, points = li.points;
  if (!points || !cols || !rows || points.length !== cols * rows)
    throw new Error(`warp 需要规则网格：points=${points && points.length} xn=${cols} yn=${rows}`);

  let docW = o.docWidth, docH = o.docHeight;
  if (!docW || !docH) {
    let mx = 0, my = 0;
    for (const p of points) { mx = Math.max(mx, p.x); my = Math.max(my, p.y); }
    docW = Math.ceil(mx); docH = Math.ceil(my);
  }
  const ss = Math.max(1, Math.round(o.supersample != null ? o.supersample : 2));
  const gw = Math.round(docW * ss), gh = Math.round(docH * ss);

  
  const mesh = tessellateWarp(points, cols, rows, o.subdiv || 18, li.sliceX, li.sliceY,{adaptive:o.adaptiveMesh!==false,tolerance:o.meshTolerance??.2,scale:ss});
  if (ss !== 1) { const p = mesh.positions; for (let i = 0; i < p.length; i++) p[i] *= ss; }

  const place = fitToPlacement(o.fit, o.image, li);

  const raw = o.backend.render({
    mesh, image: o.image, imageKey: o.imageKey,
    width: gw, height: gh,
    placement: place.matrix, repeat: place.repeat,
    readback: o.readback !== false          
  });

  
  if (o.readback === false) return { data: null, width: gw, height: gh, docWidth: docW, docHeight: docH, placement: place };

  return ss === 1
    ? { data: raw, width: gw, height: gh, docWidth: docW, docHeight: docH, placement: place }
    : { ...downscale(raw, gw, gh, ss), docWidth: docW, docHeight: docH, placement: place };
}








function inputAlphaBounds(image, rect) {
  let left = image.width, top = image.height, right = 0, bottom = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (!image.data[(y * image.width + x) * 4 + 3]) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  if (right <= left || bottom <= top) return null;
  return { left: (rect.left || 0) + left * rect.width / image.width,
    top: (rect.top || 0) + top * rect.height / image.height,
    right: (rect.left || 0) + right * rect.width / image.width,
    bottom: (rect.top || 0) + bottom * rect.height / image.height };
}

function renderDeformStack(o, stack) {
  const li = o.layerInfo;
  let docW = o.docWidth, docH = o.docHeight;
  if (!docW || !docH) {
    const b = deformStackBounds(stack);
    if (!b) throw new Error('变形滤镜的网格为空，无法渲染');
    docW = Math.ceil(b.right); docH = Math.ceil(b.bottom);
  }
  const ss = Math.max(1, Math.round(o.supersample != null ? o.supersample : 2));
  const gw = Math.round(docW * ss), gh = Math.round(docH * ss);
  const subdiv = o.deformSubdiv != null ? o.deformSubdiv : 24;
  let image = o.image, key = o.imageKey, place = null, buf = null, rect = null;
  if (o.filterInput && o.filterInput.data) {
    image = o.filterInput; key = o.filterInput;
    rect = { left: image.left || 0, top: image.top || 0, width: image.width, height: image.height };
    place = IDENTITY_PLACEMENT;
  } else if (li.baseWarp && li.baseWarp.points) {
    const before = renderWarp({ ...o, layerInfo: li.baseWarp, filterInput: null, readback: true, docWidth: docW, docHeight: docH, supersample: 1 });
    image = { data: before.data, width: before.width, height: before.height }; key = null;
    rect = { left: 0, top: 0, width: docW, height: docH }; place = before.placement;
  }
  
  
  const active = stack.filter(d => d.kind !== 'perspectiveWarp' || (d.quadIdx ? d.quadIdx.length : d.quads?.length));
  if (!active.length && !rect) {
    const d = li.deform || li.deforms?.[0], H = d?.HplaceInv && invert3x3(d.HplaceInv);
    if (H) {
      const points = Array.from({ length: 16 }, (_, i) => applyHomography(H, (i % 4) / 3, Math.floor(i / 4) / 3));
      return renderWarp({ ...o, layerInfo: { ...li, deform: null, deforms: null, points, xn: 4, yn: 4 }, filterInput: null,
        docWidth: docW, docHeight: docH });
    }
  }
  if (!active.length && rect) {
    const left = rect.left, top = rect.top, right = left + rect.width, bottom = top + rect.height;
    const mesh = { positions: new Float32Array([left, top, right, top, left, bottom, right, bottom].map(v => v * ss)),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), indices: new Uint32Array([0, 1, 2, 1, 3, 2]) };
    buf = o.backend.render({mesh, image, imageKey: key, width: gw, height: gh, placement: IDENTITY_PLACEMENT.matrix, repeat: false, readback: o.readback !== false});
  }
  for (let i = 0; i < active.length; i++) {
    const first = i === 0, d = active[i];
    const opts = {};
    if (rect) { opts.docUV = rect; opts.sourceBounds = inputAlphaBounds(image, rect); }
    else if (d.HplaceInv) {
      const H = invert3x3(d.HplaceInv);
      if (H) opts.sourceQuad = [[0,0],[1,0],[1,1],[0,1]].map(([x,y]) => applyHomography(H,x,y));
    }
    const mesh = d.kind === 'perspectiveWarp' && opts.docUV && d.referenceRect
      ? buildPerspectiveFieldMesh(d, { ...opts, subdiv })
      : buildDeformMesh(d, subdiv, opts);
    if (ss !== 1) for (let k = 0; k < mesh.positions.length; k++) mesh.positions[k] *= ss;
    const pl = rect ? IDENTITY_PLACEMENT : fitToPlacement(o.fit, o.image, li);
    if (!place) place = pl;
    buf = o.backend.render({ mesh, image, imageKey: first ? key : null, width: gw, height: gh,
      placement: pl.matrix, repeat: pl.repeat, readback: i + 1 < active.length || o.readback !== false });
    image = { data: buf, width: gw, height: gh }; key = null;
    rect = { left: 0, top: 0, width: docW, height: docH };
  }
  if (o.readback === false) return { data: null, width: gw, height: gh, docWidth: docW, docHeight: docH, placement: place };
  if (!buf) throw new Error('变形滤镜缺少放置前输入，无法渲染');
  return ss === 1
    ? { data: buf, width: gw, height: gh, docWidth: docW, docHeight: docH, placement: place }
    : { ...downscale(buf, gw, gh, ss), docWidth: docW, docHeight: docH, placement: place };
}
