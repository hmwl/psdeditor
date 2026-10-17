














import { Reader, readDescriptor, parseSmartObjects as parseSmartObjectsLean, parsePsdFull,
         locatePlacedLayer, replacePlacedBlocks, computeHomographyQuad, applyHomography, invert3x3 } from '../../core/index.js';
import { elevateTransformWarpMesh } from '../../core/transform-warp-presets.js';
import { presetMesh } from '../../core/path-warp.js';
import { findDeformFilters } from './deform.js';




function readPlacedLayer(r, key) {
  if (key === 'SoLd') {
    const id = r.key4();          
    const version = r.u32();
    const descVersion = r.u32();
    const desc = readDescriptor(r);
    return { kind: 'SoLd', id, version, descVersion, descriptor: desc };
  } else {
    
    const type = r.key4();        
    const version = r.u32();
    const uniqueId = r.pascal();
    const pageNum = r.u32();
    const totalPages = r.u32();
    const antiAlias = r.u32();
    const placedType = r.u32();
    const transform = []; for (let i = 0; i < 8; i++) transform.push(r.f64());
    const warpVersion = r.u32();
    const warpDescVersion = r.u32();
    const warp = readDescriptor(r);
    return { kind: 'PlLd', type, version, uniqueId, pageNum, totalPages, antiAlias, placedType,
      warpDescVersion, transform, warp: { warp } };
  }
}



export function decodePlacedBlock(bytes, key, opts = {}) {
  const r = new Reader(bytes);
  if (opts.logFloats) r._log = [];
  const placed = readPlacedLayer(r, key);
  return opts.logFloats ? { placed, floatLog: r._log } : placed;
}



function num(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }

function numArray(v) {
  if (Array.isArray(v)) return v.map(num);
  if (v && Array.isArray(v.values)) return v.values.slice();
  
  if (v && v.__objectArray) {
    for (const k of Object.keys(v)) {
      if (k.startsWith('__')) continue;
      const inner = v[k];
      if (inner && Array.isArray(inner.values)) return inner.values.slice();
    }
  }
  return null;
}

function extractSmartObject(layer) {
  const p = layer.placed;
  if (!p) return null;

  let transformQuad = null;      
  let nonAffine = null;
  let warpDesc = null;
  let originalSize = null;       
  let quilt = null;
  let linkId = null;             
  let deformFilter = null;       
  let deformFilters = [];        

  if (p.kind === 'SoLd') {
    const d = p.descriptor;
    if (Array.isArray(d['Trnf'])) transformQuad = d['Trnf'].map(num);
    if (Array.isArray(d['nonAffineTransform'])) nonAffine = d['nonAffineTransform'].map(num);
    
    if (d['quiltWarp']) { warpDesc = d['quiltWarp']; quilt = true; }
    else if (d['warp']) { warpDesc = d['warp']; quilt = false; }
    const sz = d['Sz  '] || d['Sz'];
    if (sz) originalSize = { width: num(sz['Wdth']), height: num(sz['Hght']) };
    linkId = d['Idnt'] || null;  
    
    deformFilters = findDeformFilters(d);
    deformFilter = deformFilters[0] || null;
  } else {
    transformQuad = p.transform;
    warpDesc = p.warp && p.warp.warp;
    quilt = false;
    linkId = p.uniqueId || null;
  }

  
  let warpStyle = null, warpBounds = null;
  if (warpDesc) {
    warpStyle = warpDesc['warpStyle'] ? warpDesc['warpStyle'].value : null;
    const b = warpDesc['bounds'];
    if (b) warpBounds = { top: num(b['Top ']), left: num(b['Left']), bottom: num(b['Btom']), right: num(b['Rght']) };
  }

  return {
    layerName: layer.layerName,
    bounds: layer.bounds,
    kind: p.kind,
    linkId,                        
    transformQuad,                 
    nonAffineTransform: nonAffine,
    originalSize,
    deformFilter,                  
    deformFilters,                 
    warp: warpDesc ? {
      parameters: null,
      style: warpStyle, isQuilt: !!quilt, bounds: warpBounds,
      uOrder: null, vOrder: null,
      quiltSliceX: null, quiltSliceY: null,
      meshPoints: null, gridCols: null, gridRows: null, gridInferred: true,
      meshPointCount: 0
    } : null,
    placedBlocks: layer.placedBlocks,
    _raw: p
  };
}






export function decodeSmartObject(lean, buffer) {
  const u8 = buffer ? (buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)) : null;
  const blocks = (lean.placedBlocks || lean.blocks || []).map(b => {
    const bytes = b.data || (u8 && u8.subarray(b.dataOffset, b.dataOffset + b.dataLength));
    if (!bytes) throw new Error('放置块缺少字节');
    let placed = null;
    try { placed = decodePlacedBlock(bytes, b.key); } catch {  }
    return { ...b, placed, bytes };
  });
  const usable = blocks.filter(b => b.placed);
  const primary = usable.find(b => b.key === 'SoLd') || usable[usable.length - 1];
  if (!primary) return null;
  const so = extractSmartObject({ layerName: lean.layerName, bounds: lean.bounds, placed: primary.placed, placedBlocks: blocks });
  if (!so) return null;
  return { ...lean, ...so, placedBlocks: blocks, _doc: lean._doc || { psb: !!lean.psb } };
}


export function parseSmartObjects(buffer) {
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return parseSmartObjectsLean(ab).map(so => decodeSmartObject(so, ab)).filter(Boolean);
}



const PRO_WARP_NAMES = { warp: '自由变换 · 变形', quiltWarp: '自由变换 · 变形', perspectiveWarp: '透视变形', puppetWarp: '操控变形' };
export function proWarpKindsOf(so) {
  const out = [];
  if (so && so.warp && (so.warp.isQuilt || (so.warp.style && so.warp.style !== 'warpNone'))) out.push(so.warp.isQuilt ? 'quiltWarp' : 'warp');
  for (const df of (so && so.deformFilters) || []) if (df && df.kind) out.push(df.kind);
  return [...new Set(out)];
}
export const proWarpLabel = kind => PRO_WARP_NAMES[kind] || '变形';

function proWarpLayerInfo(so, kinds, opts = {}) {
  const scale = opts.scale || 1, ox = opts.offsetX || 0, oy = opts.offsetY || 0;
  const ow = so.originalSize ? so.originalSize.width : (so.bounds.right - so.bounds.left);
  const oh = so.originalSize ? so.originalSize.height : (so.bounds.bottom - so.bounds.top);
  const q = so.transformQuad;
  const b = so.bounds;
  return {
    layerName: so.layerName,
    layType: 'normalImg',
    originalSize: `${ow},${oh}`,
    width: ow, height: oh,
    rect: [b.left * scale + ox, b.top * scale + oy, (b.right - b.left) * scale, (b.bottom - b.top) * scale],
    BoundingRect: [b.left * scale + ox, b.top * scale + oy, b.right * scale + ox, b.bottom * scale + oy],
    placementQuad: q ? [0, 2, 4, 6].map(i => ({ x: q[i], y: q[i + 1] })) : null,
    points: null, pointsLocal: null, sourceUV: null, xn: null, yn: null,
    sliceX: [], sliceY: [], warpBounds: so.warp ? so.warp.bounds : null,
    warpOptions: null, warpStyle: so.warp ? so.warp.style : null,
    deform: null, deforms: null, baseWarp: null, deformName: null,
    Matrix3: null, unwarpedQuad: null,
    proWarp: kinds, proWarpKinds: kinds,
    sourceImage: so.sourceImage ? { filename: so.sourceImage.filename, mime: so.sourceImage.mime, byteLength: so.sourceImage.byteLength } : null
  };
}








export function toFoxpsdLayerInfo(so, opts = {}) {
  const scale = opts.scale || 1;
  const ox = opts.offsetX || 0;
  const oy = opts.offsetY || 0;
  const space = opts.space || 'document';        
  const xf = (x, y) => ({ x: x * scale + ox, y: y * scale + oy });

  const ow = so.originalSize ? so.originalSize.width : (so.bounds.right - so.bounds.left);
  const oh = so.originalSize ? so.originalSize.height : (so.bounds.bottom - so.bounds.top);

  const proWarp = proWarpKindsOf(so);
  if (proWarp.length) return proWarpLayerInfo(so, proWarp, opts);

  const meshLocal = so.warp && so.warp.meshPoints ? so.warp.meshPoints : null;

  const params=so.warp?.parameters,wb=so.warp?.bounds||{left:0,top:0,right:ow,bottom:oh};
  const semanticMesh=!meshLocal&&params&&!['warpNone','warpCustom'].includes(params.style)?presetMesh({x:wb.left,y:wb.top,w:wb.right-wb.left,h:wb.bottom-wb.top},{style:params.style,bend:params.bend/100,h:params.h/100,v:params.v/100,vertical:params.vertical,values:params.values}):null;
  const placementMesh=meshLocal||semanticMesh?.points;

  
  
  let srcQuad;
  if (placementMesh && placementMesh.length) {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const p of placementMesh) { if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y; if (p.x > mxx) mxx = p.x; if (p.y > mxy) mxy = p.y; }
    srcQuad = [mnx, mny, mxx, mny, mxx, mxy, mnx, mxy];
  } else {
    const wb = so.warp && so.warp.bounds;
    srcQuad = wb
      ? [wb.left, wb.top, wb.right, wb.top, wb.right, wb.bottom, wb.left, wb.bottom]
      : [0, 0, ow, 0, ow, oh, 0, oh];
  }
  const H = so.transformQuad ? computeHomographyQuad(srcQuad, so.transformQuad) : null;

  let points, sourceUV, synthGrid = false,synthCols=4,synthRows=4,synthSlices=null;
  if (meshLocal) {
    const cols = so.warp.gridCols, rows = so.warp.gridRows;
    points = meshLocal.map(p => {
      const d = space === 'local' ? p : (H ? applyHomography(H, p.x, p.y) : p);
      return xf(d.x, d.y);
    });
    
    if (cols && rows && cols * rows === meshLocal.length) {
      sourceUV = meshLocal.map((_, i) => ({ u: (i % cols) / (cols - 1), v: Math.floor(i / cols) / (rows - 1) }));
    }
  } else if (so.transformQuad) {
    
    
    const q = so.transformQuad;
    const tl = [q[0], q[1]], tr = [q[2], q[3]], br = [q[4], q[5]], bl = [q[6], q[7]];
    points = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const u = i / 3, v = j / 3;
      const x = (1 - v) * ((1 - u) * tl[0] + u * tr[0]) + v * ((1 - u) * bl[0] + u * br[0]);
      const y = (1 - v) * ((1 - u) * tl[1] + u * tr[1]) + v * ((1 - u) * bl[1] + u * br[1]);
      points.push(xf(x, y));
    }
    if(semanticMesh){
      synthCols=semanticMesh.cols;synthRows=semanticMesh.rows;synthSlices=semanticMesh;
      points=semanticMesh.points.map(p=>{const d=space==='local'?p:applyHomography(H,p.x,p.y);return xf(d.x,d.y);});
    }
    synthGrid = true;
  }

  if(meshLocal&&so.warp.gridCols<=4&&so.warp.gridRows<=4&&(so.warp.gridCols!==4||so.warp.gridRows!==4)){
    const m=elevateTransformWarpMesh(points.map(p=>[p.x,p.y]),so.warp.gridCols,so.warp.gridRows);
    points=m.points.map(([x,y])=>({x,y}));synthCols=m.cols;synthRows=m.rows;synthGrid=true;
    sourceUV=points.map((_,i)=>({u:(i%4)/3,v:Math.floor(i/4)/3}));
  }

  const deform = null;
  const deforms = [];

  
  const wb0 = so.warp && so.warp.bounds;
  const normSlice = (arr, lo, hi) => {
    if (!arr || !arr.length) return [];
    const span = (hi - lo) || 1;
    const inUnit = arr.every(v => v >= -0.001 && v <= 1.001);
    return arr.map(v => inUnit ? v : (v - lo) / span).filter(v => v > 1e-4 && v < 1 - 1e-4).sort((a, b) => a - b);
  };

  const b = so.bounds;
  return {
    layerName: so.layerName,
    layType: 'normalImg',
    
    sliceX: synthSlices?.sliceX || normSlice(so.warp && so.warp.quiltSliceX, wb0 ? wb0.left : 0, wb0 ? wb0.right : 1),
    sliceY: synthSlices?.sliceY || normSlice(so.warp && so.warp.quiltSliceY, wb0 ? wb0.top : 0, wb0 ? wb0.bottom : 1),
    warpBounds: wb0 || null,
    originalSize: `${ow},${oh}`,
    width: ow, height: oh,
    unwarpedQuad: H ? (()=>{const b=so.warp?.bounds||{left:0,top:0,right:ow,bottom:oh};return [[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,y])=>{const p=applyHomography(H,x,y);return xf(p.x,p.y);});})() : null,
    Matrix3: H,                                   
    
    
    placementQuad: so.transformQuad ? [0, 2, 4, 6].map(i => ({ x: so.transformQuad[i], y: so.transformQuad[i + 1] })) : null,
    rect: [b.left * scale + ox, b.top * scale + oy, (b.right - b.left) * scale, (b.bottom - b.top) * scale],
    BoundingRect: [b.left * scale + ox, b.top * scale + oy, b.right * scale + ox, b.bottom * scale + oy],
    points: deforms.length ? null : points,               
    pointsLocal: meshLocal ? meshLocal.map(p => ({ x: p.x, y: p.y })) : undefined,
    sourceUV,                                     
    xn: deforms.length ? null : (synthGrid ? synthCols : (so.warp ? so.warp.gridCols : undefined)),
    yn: deforms.length ? null : (synthGrid ? synthRows : (so.warp ? so.warp.gridRows : undefined)),
    warpOptions: so.warp?.parameters || null,
    warpStyle: so.warp ? so.warp.style : null,
    deform,                                       
    deforms: deforms.length ? deforms : null,     
    baseWarp: deforms.length ? toFoxpsdLayerInfo(so, { ...opts, ignoreDeform: true }) : null,
    deformName: deform ? (deform.name || null) : null,
    sourceImage: so.sourceImage ? { filename: so.sourceImage.filename, mime: so.sourceImage.mime, byteLength: so.sourceImage.byteLength } : null
  };
}







function locateWarpOffsetsInBlock(bytes, key, so) {
  
  const { floatLog: rawLog } = decodePlacedBlock(bytes, key, { logFloats: true });
  const floatLog = rawLog.map(e => ({ o: e.o - bytes.byteOffset, v: e.v }));
  const findAll = (vals) => {
    const res = [];
    if (!vals || !vals.length) return res;
    for (let i = 0; i + vals.length <= floatLog.length; i++) {
      let ok = true;
      for (let k = 0; k < vals.length; k++) { if (floatLog[i + k].v !== vals[k]) { ok = false; break; } }
      if (ok) { res.push(floatLog.slice(i, i + vals.length).map(e => e.o)); i += vals.length - 1; }
    }
    return res;
  };
  const trnf = so.transformQuad;
  
  const transformRuns = findAll(trnf);
  if (so.nonAffineTransform && so.nonAffineTransform.some((v, i) => v !== trnf[i])) {
    for (const r of findAll(so.nonAffineTransform)) transformRuns.push(r);
  }
  return { trnf: transformRuns, hrzn: findAll(so.warp.meshPoints.map(p => p.x)), vrtc: findAll(so.warp.meshPoints.map(p => p.y)) };
}







export function buildWarpRewrites(so, docPoints) {
  if (!so.warp || !so.warp.meshPoints) throw new Error('该智能对象无自定义 warp 网格，无法写回');
  if (docPoints.length !== so.warp.meshPoints.length)
    throw new Error(`控制点数 ${docPoints.length} 与原网格 ${so.warp.meshPoints.length} 不符；点数变化须走 quiltWarp 变长写回`);
  
  const ml = so.warp.meshPoints;
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const p of ml) { if (p.x < mnx) mnx = p.x; if (p.y < mny) mny = p.y; if (p.x > mxx) mxx = p.x; if (p.y > mxy) mxy = p.y; }
  const H = computeHomographyQuad([mnx, mny, mxx, mny, mxx, mxy, mnx, mxy], so.transformQuad);
  const Hinv = invert3x3(H);
  if (!Hinv) throw new Error('变换不可逆，无法写回');
  
  const local = docPoints.map(p => applyHomography(Hinv, p.x, p.y));
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of local) { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; }
  const trnfNew = [];
  for (const [x, y] of [[a, b], [c, b], [c, d], [a, d]]) { const q = applyHomography(H, x, y); trnfNew.push(q.x, q.y); }

  let any = false;
  const out = [];
  for (const blk of so.placedBlocks) {
    if (!blk.placed) continue;
    const off = locateWarpOffsetsInBlock(blk.bytes, blk.key, so);
    if (!off.trnf.length && !off.hrzn.length && !off.vrtc.length) continue;
    const bytes = blk.bytes.slice();
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (const run of off.trnf) for (let i = 0; i < 8; i++) dv.setFloat64(run[i], trnfNew[i]);
    for (const run of off.hrzn) for (let i = 0; i < local.length; i++) dv.setFloat64(run[i], local[i].x);
    for (const run of off.vrtc) for (let i = 0; i < local.length; i++) dv.setFloat64(run[i], local[i].y);
    if (off.trnf.length && off.hrzn.length && off.vrtc.length) any = true;
    out.push({ key: blk.key, data: bytes });
  }
  if (!any) throw new Error('未能在放置块中定位 warp 数值偏移');
  return out;
}


export function decodeCurrent(buffer, so) {
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const psd = parsePsdFull(ab);
  const layer = locatePlacedLayer(psd, so);
  const layerIndex = psd.layers.indexOf(layer);
  const lean = parseSmartObjectsLean(ab).find(s => s.layerIndex === layerIndex);
  if (!lean) throw new Error(`在文件里找不到智能对象「${so.layerName}」`);
  const full = decodeSmartObject(lean, ab);
  if (!full) throw new Error(`智能对象「${so.layerName}」的放置块无法解析`);
  return full;
}





export function writeWarpBack(buffer, so, docPoints) {
  const full = decodeCurrent(buffer, so);
  return replacePlacedBlocks(buffer, so, buildWarpRewrites(full, docPoints));
}
