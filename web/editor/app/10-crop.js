




import './09-text-tool.js';   
import { promptDialog, formDialog } from '../dialog.js';
import { rotCursorName, rotCursorSmooth } from '../icons.js';
import { panels } from '../panels.js';
import { preferences as PREF } from '../preferences.js';
import { shell } from '../shell.js';
import { $, BLEND, CAFILL, QUADM, QUADW, selectionBounds } from './01-boot.js';
import {
  doc, docH, docW, guides, layerTransforms, pixelPaint, selection, set_guides, set_guidesDirty, textCrops,
  textRenders,
} from './02-doc-state.js';
import { actRecord, pushDocHistory } from './03-history.js';
import {
  cropPad, fitStage, padB, padL, padR, padT, set_cropPad, syncStagePad, viewH, viewW,
} from './04-view-chrome.js';
import { isBackgroundLayer } from './05-layer-lock-guides.js';
import { centerDocPoint, tfFrame } from './06-view-zoom-move.js';
import {
  applyDocSize, docResolution, docSizeBase, set_docResolution, set_pendingCropDelete, transformableLayers,
} from './08-doc-size.js';
import { tfWriteQuad } from './19-free-transform.js';
import { pointInQuadLocal, set_snapLines, snapLines, snapOn, snapTargets } from './20-snap-smart-object.js';
import { layerCanvasCache, renderLayerPanel, thumbCache } from './23-layers-panel.js';
import { ensureLayerTransform, isMeshTransform, transformChanged } from './28-layer-props-transform.js';
import { displayOrder } from './29-scrubby-live.js';
import {
  drawLayerContent, ensureScratch, layerOffscreen, paintStates, textCropCanvas, viewEmpty, viewScratch,
} from './30-render.js';
import { bgRGB, docTool, mapAuxGeometry, setDocTool } from './31-selection-brush.js';
import {
  dispPx, layerOnCanvas, sampleRGBA, setGizmoCursor, setGizmoCursorString, syncGizmoCursor, syncToolOptions,
} from './32-cursors-select-options.js';
import { AB_BAR_ICONS } from './36-clipboard-frame.js';
import { commitPixelPaint } from './38-brush-engine.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';









export let cropState = null;    
export function set_cropState(v) { return (cropState = v); }   




export const CROP_PRESETS = [
  { value: 'ratio', label: '比例', mode: 'ratio' },
  { value: 'whr', label: '宽 x 高 x 分辨率', mode: 'whr' },
  { value: 'orig', label: '原始比例', mode: 'orig' },
  { sep: true },
  { value: '1:1', label: '1 : 1（方形）', mode: 'ratio', w: 1, h: 1 },
  { value: '4:5', label: '4 : 5（8 : 10）', mode: 'ratio', w: 4, h: 5 },
  { value: '5:7', label: '5 : 7', mode: 'ratio', w: 5, h: 7 },
  { value: '2:3', label: '2 : 3（4 : 6）', mode: 'ratio', w: 2, h: 3 },
  { value: '16:9', label: '16 : 9', mode: 'ratio', w: 16, h: 9 },
  { sep: true },
  { value: 'front', label: '前面的图像', mode: 'whr' },
  { sep: true },
  { value: '4x5in', label: '4 x 5 英寸 300 ppi', mode: 'whr', w: 4, h: 5, unit: 'in', res: 300, resUnit: 'in' },
  { value: '8.5x11in', label: '8.5 x 11 英寸 300 ppi', mode: 'whr', w: 8.5, h: 11, unit: 'in', res: 300, resUnit: 'in' },
  { value: '1024x768', label: '1024 x 768 像素 92 ppi', mode: 'whr', w: 1024, h: 768, unit: 'px', res: 92, resUnit: 'in' },
  { value: '1280x800', label: '1280 x 800 像素 113 ppi', mode: 'whr', w: 1280, h: 800, unit: 'px', res: 113, resUnit: 'in' },
  { value: '1366x768', label: '1366 x 768 像素 135 ppi', mode: 'whr', w: 1366, h: 768, unit: 'px', res: 135, resUnit: 'in' },
];

const CROP_RATIOS = CROP_PRESETS.filter(p => !p.sep).map(p => ({ value: p.value, label: p.label, r: p.w && p.h ? p.w / p.h : p.value === 'orig' ? -1 : 0 }));

const CROP_OPTS_DEFAULT = {
  preset: 'ratio', mode: 'ratio', w: '', h: '', unit: 'px', res: '', resUnit: 'in',
  overlay: 'thirds', overlayShow: 'auto', orient: 0,
  classic: false, showCropped: true, autoCenter: true,
  shield: true, shieldColor: 'canvas', shieldCustom: '#000000', shieldOpacity: 75, autoOpacity: true,
  del: false, aware: false,
};
export const cropOpts = { ...CROP_OPTS_DEFAULT };
let cropUserPresets = [];
try { Object.assign(cropOpts, JSON.parse(localStorage.getItem('psd_editor.cropOpts') || '{}')); } catch {}
try { cropUserPresets = JSON.parse(localStorage.getItem('psd_editor.cropPresets') || '[]') || []; } catch { cropUserPresets = []; }
if (!['thirds', 'grid', 'diag', 'triangle', 'golden', 'spiral'].includes(cropOpts.overlay)) cropOpts.overlay = 'thirds';
export function saveCropOpts(){ try { localStorage.setItem('psd_editor.cropOpts', JSON.stringify(cropOpts)); } catch {} }
const cropActive = () => !!cropState;
const cropNum = v => { const x = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(x) && x > 0 ? x : 0; };

export function cropTargetPx(){
  if (cropOpts.mode !== 'whr') return null;
  const w = cropNum(cropOpts.w), h = cropNum(cropOpts.h);
  if (!w || !h) return null;
  const resIn = cropNum(cropOpts.res) ? cropNum(cropOpts.res) * (cropOpts.resUnit === 'cm' ? 2.54 : 1) : docResolution;
  const k = cropOpts.unit === 'in' ? resIn : cropOpts.unit === 'cm' ? resIn / 2.54 : cropOpts.unit === 'mm' ? resIn / 25.4 : 1;
  return { w: Math.max(1, Math.min(30000, Math.round(w * k))), h: Math.max(1, Math.min(30000, Math.round(h * k))),
           res: cropNum(cropOpts.res) ? Math.round(resIn * 100) / 100 : null };
}


const cropClassic = (st = cropState) => !!(st && cropOpts.classic);

export function cropQuad(st = cropState){
  const r = st.rect;
  const q = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  if (!cropClassic(st) || !st.angle) return q;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, a = -st.angle * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  return q.map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]);
}
export function beginCrop(){
  if (!doc) return false;
  if (cropState) return true;
  const b = selection ? selectionBounds(selection) : null;
  cropState = {
    rect: b && b.width > 1 && b.height > 1 ? { x: b.x, y: b.y, w: b.width, h: b.height } : { x: 0, y: 0, w: docW, h: docH },
    angle: 0, off: { x: 0, y: 0 }, drag: null, pushed: false,
    get ratio(){ return cropOpts.preset; }, get del(){ return cropOpts.del; }, get overlay(){ return cropOpts.overlay; },
    get aware(){ return cropOpts.aware; }, get flip(){ return !!(cropOpts.orient & 1); },
  };
  if (cropRatioOf() > 0 && !(b && b.width > 1)) applyCropRatio();     
  cropExtGen++;                                        
  setCropPad(cropPadFor(cropRegionRect()));           
  QUADW.load().catch(() => {});
  syncToolOptions(); syncCropBar(); drawGizmo();
  return true;
}



export let cropExt = null, cropExtGen = 0;
export function set_cropExtGen(v) { return (cropExtGen = v); }   
function cropExtSnapshot(snap){
  if (!snap || !doc) return null;
  if (cropExt && cropExt.snap === snap && cropExt.gen === cropExtGen) return cropExt;
  const plain = { cv: snap, x: 0, y: 0, w: docW, h: docH, snap, gen: cropExtGen };
  let x0 = 0, y0 = 0, x1 = docW, y1 = docH;
  const items = [];
  try {
    const st = paintStates();
    for (const i of displayOrder()) {
      const l = doc.layers[i];
      if (!l || st.hidden.has(i) || isMeshTransform(i) || (l.group && l.group.type)) continue;
      const text = textRenders[i], tc = textCrops[i];
      const src = text ? (tc ? textCropCanvas(i) : text) : (l.rgba && l.width > 0 && l.height > 0 ? layerOffscreen(i) : null);
      if (!src) continue;
      const base = text ? (tc ? tc.bounds : { left: 0, top: 0, right: docW, bottom: docH })
        : { left: l.bounds.left, top: l.bounds.top, right: l.bounds.right, bottom: l.bounds.bottom };
      const t = transformChanged(i);
      const cs = t ? tfFrame(t).corners : [[base.left, base.top], [base.left + src.width, base.top + src.height]];
      for (const c of cs) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); }
      items.push({ i, l, src, base, op: st.opac[i] ?? 1 });
    }
  } catch { return (cropExt = plain); }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const W = x1 - x0, H = y1 - y0;
  if ((x0 >= 0 && y0 >= 0 && x1 <= docW && y1 <= docH) || W * H > 64e6) return (cropExt = plain);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext && cv.getContext('2d');
  if (!g) return (cropExt = plain);
  g.drawImage(snap, -x0, -y0);                          
  g.save();
  g.translate(-x0, -y0);
  g.beginPath(); g.rect(x0, y0, W, H); g.rect(0, 0, docW, docH); g.clip('evenodd');   
  for (const it of items) {
    try { drawLayerContent(g, it.src, it.base, it.i, it.op, BLEND[it.l.blendMode] || 'source-over'); } catch { }
  }
  g.restore();
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return (cropExt = { cv, x: x0, y: y0, w: W, h: H, snap, gen: cropExtGen });
}

function cropXform(st, x, y){
  const cx = st.rect.x + st.rect.w / 2, cy = st.rect.y + st.rect.h / 2;
  const a = st.angle * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const dx = x - cx, dy = y - cy;
  return [cx + st.off.x + dx * cs - dy * sn, cy + st.off.y + dx * sn + dy * cs];
}


function cropRegionRect(st = cropState){
  if (!st) return { x: 0, y: 0, w: docW, h: docH };
  const r = st.rect;
  let x0 = Math.min(0, r.x), y0 = Math.min(0, r.y), x1 = Math.max(docW, r.x + r.w), y1 = Math.max(docH, r.y + r.h);
  const e = cropExt && cropExt.gen === cropExtGen ? cropExt : { x: 0, y: 0, w: docW, h: docH };
  if (cropClassic(st)) {                                
    for (const [px, py] of [[e.x, e.y], [e.x + e.w, e.y + e.h], ...cropQuad(st)]) {
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  for (const [px, py] of [[e.x, e.y], [e.x + e.w, e.y], [e.x + e.w, e.y + e.h], [e.x, e.y + e.h]]) {
    const q = cropXform(st, px, py);
    x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}


function cropPadFor(rect){
  const base = Math.max(120, Math.round(Math.max(docW, docH) * 0.5));
  const grow = v => Math.min(15000, Math.max(base, Math.ceil(v + base / 2)));
  return {
    l: grow(Math.max(0, -Math.min(rect.x, rect.x + rect.w))),
    t: grow(Math.max(0, -Math.min(rect.y, rect.y + rect.h))),
    r: grow(Math.max(0, Math.max(rect.x, rect.x + rect.w) - docW)),
    b: grow(Math.max(0, Math.max(rect.y, rect.y + rect.h) - docH)),
  };
}

function setCropPad(pad){
  const same = cropPad && pad && cropPad.l === pad.l && cropPad.t === pad.t && cropPad.r === pad.r && cropPad.b === pad.b;
  if (same) return false;
  set_cropPad(pad);
  if (doc && docW) fitStage(false, { center: !pad });
  else syncStagePad();
  return true;
}



export function cancelCrop(resume){
  if (!cropState) return false;
  cropState = null;
  setCropPad(null);
  syncToolOptions();
  if (resume && docTool === 'crop') beginCrop(); else drawGizmo();
  return true;
}

function exitCrop(){
  if (!cropState) return false;
  cropState = null;
  setCropPad(null);
  setDocTool('move');
  return true;
}
export function commitCrop(resume){
  const st = cropState; if (!st || !doc) return false;
  const aware = !!cropOpts.aware;                   
  const r = st.rect;
  
  const w = Math.max(1, Math.min(30000, Math.round(r.w))), h = Math.max(1, Math.min(30000, Math.round(r.h)));
  
  const tgt = cropTargetPx();
  const W = tgt ? tgt.w : w, H = tgt ? tgt.h : h, sx = W / w, sy = H / h;
  const resNew = tgt && tgt.res ? tgt.res : null;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const a = st.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const ox = r.x - st.off.x, oy = r.y - st.off.y;       
  const nothing = W === docW && H === docH && Math.abs(st.angle) < 1e-6
               && Math.abs(st.off.x) < 0.5 && Math.abs(st.off.y) < 0.5
               && Math.abs(r.x) < 0.5 && Math.abs(r.y) < 0.5 && !(resNew && Math.abs(resNew - docResolution) > 1e-6);
  if (nothing) {                                        
    cropState = null; setCropPad(null); syncToolOptions();
    if (resume && docTool === 'crop') beginCrop(); else drawGizmo();
    return true;
  }
  pushDocHistory('裁剪');
  if (!tgt) actRecord('crop', { top: r.y, left: r.x, bottom: r.y + r.h, right: r.x + r.w, angle: st.angle || 0, deletePixels: !!st.del });
  const map = p => {
    const dx = p[0] - cx, dy = p[1] - cy;
    return [(cx + dx * cos - dy * sin - ox) * sx, (cy + dx * sin + dy * cos - oy) * sy];
  };
  
  
  for (const i of transformableLayers()) {
    const t = ensureLayerTransform(i);
    const q = tfFrame(t).corners.map(map);
    if (QUADM) tfWriteQuad(i, q);
    else { t.x -= ox; t.y -= oy; }                       
  }
  mapAuxGeometry(map);
  set_guides(Math.abs(st.angle) > 1e-6 ? []                
    : guides.map(g => ({ ...g, px: (g.px - (g.vertical ? ox : oy)) * (g.vertical ? sx : sy) })).filter(g => g.px >= 0 && g.px <= (g.vertical ? W : H)));
  set_guidesDirty(true);
  if (cropOpts.del) set_pendingCropDelete(true);
  if (resNew) set_docResolution(resNew);
  const grew = w > docW || h > docH || r.x < -0.5 || r.y < -0.5 || r.x + r.w > docW + 0.5 || r.y + r.h > docH + 0.5;
  cropState = null;
  set_cropPad(null);                    
  applyDocSize(W, H);
  


  if (aware) cropAwareCommitFill(W, H);
  else cropFillBackgroundLayer(W, H);
  syncToolOptions();
  cropExtGen++;
  shell.status(`已裁剪为 ${W} × ${H} 像素${tgt ? `（框 ${w} × ${h} 重采样${resNew ? ` · ${resNew} 像素/英寸` : ''}）` : ''}${grew ? '（画布扩大）' : ''}`
             + `${st.angle ? ` · 画面旋转 ${st.angle.toFixed(2)}°` : ''}${cropOpts.del ? ' · 导出时删除画布外的像素' : ''}`);
  
  if (resume && docTool === 'crop') beginCrop(); else drawGizmo();
  return true;
}


function cropFillBackgroundLayer(w, h){
  try {
    if (!doc || !isBackgroundLayer(0) || !doc.layers[0] || !transformChanged(0)) return;
    const px = layerOnCanvas(0, { rgb: true }); if (!px) return;
    const col = bgRGB, out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, n = w * h; i < n; i++) {
      const o = i * 4, al = px[o + 3] / 255;
      out[o] = Math.round(px[o] * al + col[0] * (1 - al)); out[o + 1] = Math.round(px[o + 1] * al + col[1] * (1 - al));
      out[o + 2] = Math.round(px[o + 2] * al + col[2] * (1 - al)); out[o + 3] = 255;
    }
    const l = doc.layers[0];
    delete layerTransforms[0]; delete pixelPaint[0];
    l.rgba = out; l.bounds = { top: 0, left: 0, bottom: h, right: w }; l.width = w; l.height = h;
    pixelPaint[0] = { rgba: out, orig: new Uint8ClampedArray(out.length), w, h, left: 0, top: 0 };
    delete layerCanvasCache[0]; delete thumbCache[0];
    commitPixelPaint(0);
    renderLayerPanel();
  } catch (e) {  }
}





function cropAwareFillHoles(bd, d, w, h){
  


  const out = new Uint8ClampedArray(bd);
  const n = w * h, near = new Int32Array(n).fill(-1), dist = new Float32Array(n).fill(Infinity);
  let any = false;
  
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] >= 250) { near[i] = i; dist[i] = 0; any = true; }
  if (!any) return out;                                    
  const relax = (i, j, c) => { if (near[j] >= 0 && dist[j] + c < dist[i]) { dist[i] = dist[j] + c; near[i] = near[j]; } };
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!dist[i]) continue;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) { relax(i, i - w, 1); if (x > 0) relax(i, i - w - 1, D); if (x < w - 1) relax(i, i - w + 1, D); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!dist[i]) continue;
    if (x < w - 1) relax(i, i + 1, 1);
    if (y < h - 1) { relax(i, i + w, 1); if (x < w - 1) relax(i, i + w + 1, D); if (x > 0) relax(i, i + w - 1, D); }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    if (!dist[i]) continue;                                
    const q = near[i]; if (q < 0) continue;
    const qx = q % w, qy = (q - qx) / w;
    const rx = 2 * qx - x, ry = 2 * qy - y;
    let so = q * 4;
    if (rx >= 0 && ry >= 0 && rx < w && ry < h && d[(ry * w + rx) * 4 + 3] >= 250) so = (ry * w + rx) * 4;
    const a = bd[o + 3] / 255;                             
    out[o] = Math.round(bd[o] * a + d[so] * (1 - a)); out[o + 1] = Math.round(bd[o + 1] * a + d[so + 1] * (1 - a));
    out[o + 2] = Math.round(bd[o + 2] * a + d[so + 2] * (1 - a)); out[o + 3] = 255;
  }
  return out;
}
function cropAwareCommitFill(w, h){
  try {
    if (!QUADM || !doc) return;
    if (w * h > 120000000) return;                 
    const order = displayOrder();
    let bi = -1;                                           
    for (const i of order) { const l = doc.layers[i]; if (l && l.rgba && l.width > 0 && l.height > 0) { bi = i; break; } }
    if (bi < 0) return;
    

    const d = sampleRGBA(true), bdRaw = layerOnCanvas(bi, { rgb: true });
    if (!d || !bdRaw || d.length !== w * h * 4) return;
    const bd = new Uint8ClampedArray(bdRaw.buffer, bdRaw.byteOffset, bdRaw.length);
    let hasHole = false; for (let i = 3; i < d.length; i += 4) if (d[i] <= 4 && bd[i] <= 4) { hasHole = true; break; }
    if (!hasHole) return;
    let out = cropAwareFillHoles(bd, d, w, h);
    

    const CA = CAFILL.peek && CAFILL.peek();
    if (CA && CA.contentAwareFill) {
      const mask = new Uint8Array(w * h); let n = 0;
      for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] <= 4 && bd[i * 4 + 3] <= 4) { mask[i] = 255; n++; }
      if (n && n <= 20000) {
        const comp = new Uint8ClampedArray(d); for (let i = 0; i < w * h; i++) if (mask[i]) comp[i * 4 + 3] = 0;
        try { const f = CA.contentAwareFill(comp, w, h, mask, { seed: 7 });
          for (let i = 0; i < w * h; i++) if (mask[i]) { const o = i * 4; out[o] = f[o]; out[o + 1] = f[o + 1]; out[o + 2] = f[o + 2]; out[o + 3] = 255; } } catch {}
      }
    }
    const l = doc.layers[bi];
    delete layerTransforms[bi];                             
    delete layerCanvasCache[bi]; delete thumbCache[bi]; delete pixelPaint[bi];
    l.rgba = out; l.width = w; l.height = h; l.bounds = { top: 0, left: 0, bottom: h, right: w };
    pixelPaint[bi] = { rgba: out, orig: new Uint8ClampedArray(out.length), w, h, left: 0, top: 0 };
    commitPixelPaint(bi);
    renderLayerPanel();
  } catch (e) {  }
}

function cropRatioOf(){
  if (cropOpts.mode === 'orig') return docSizeBase ? docSizeBase.w / docSizeBase.h : docW / docH;
  const w = cropNum(cropOpts.w), h = cropNum(cropOpts.h);
  return w && h ? w / h : 0;
}

export let cropArmed = false;              
export function set_cropArmed(v) { return (cropArmed = v); }   
export let cropStraight = null;            
export function set_cropStraight(v) { return (cropStraight = v); }   
export function beginCropDrag(ev, pt){
  const st = cropState, q = cropQuad();
  
  if (cropArmed || ev.metaKey || ev.ctrlKey) {
    cropStraight = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    st.drag = { mode: 'straight', rect0: { ...st.rect }, angle0: st.angle, off0: { ...st.off } };
    gizmo.classList.add('drag');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    drawGizmo();
    return true;
  }
  const f = { corners: q, handles: [q[0], mid(q[0], q[1]), q[1], mid(q[1], q[2]), q[2], mid(q[2], q[3]), q[3], mid(q[3], q[0])] };
  const scale = gizmo.getBoundingClientRect().width ? dispThr(1) : 1;
  const tol = Math.max(8 * scale, 6);
  let handle = -1;
  for (let k = 0; k < 8; k++) if (Math.abs(pt.x - f.handles[k][0]) <= tol && Math.abs(pt.y - f.handles[k][1]) <= tol) { handle = k; break; }
  let mode = 'move';
  
  const pristine = Math.abs(st.angle) < 1e-9 && !st.off.x && !st.off.y && st.rect.x === 0 && st.rect.y === 0 && st.rect.w === docW && st.rect.h === docH;
  if (handle >= 0) mode = 'size';
  else if (pristine && pt.x >= 0 && pt.y >= 0 && pt.x <= docW && pt.y <= docH) mode = 'new';
  else if (!pointInQuadLocal(q, pt.x, pt.y)) mode = 'rotate';   
  const cx = st.rect.x + st.rect.w / 2, cy = st.rect.y + st.rect.h / 2;
  st.drag = { mode, handle, start: pt, rect0: { ...st.rect }, angle0: st.angle, off0: { ...st.off },
              a0: Math.atan2(pt.y - cy, pt.x - cx), inside0: cropRectInsideImage(st) };
  gizmo.classList.add('drag');
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  drawGizmo();
  return true;
}
export const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

function cropImageQuad(st){
  return [[0, 0], [docW, 0], [docW, docH], [0, docH]].map(([x, y]) => cropXform(st, x, y));
}
function cropRectInsideImage(st, rect = st.rect){
  if (cropClassic(st)) return false;
  const q = cropImageQuad(st), e = 0.5;
  return [[rect.x + e, rect.y + e], [rect.x + rect.w - e, rect.y + e], [rect.x + rect.w - e, rect.y + rect.h - e], [rect.x + e, rect.y + rect.h - e]]
    .every(([x, y]) => pointInQuadLocal(q, x, y));
}


function cropFitAfterRotate(st, rect0){
  if (cropOpts.aware || cropClassic(st)) { st.rect = { ...rect0 }; return; }
  const cx = rect0.x + rect0.w / 2, cy = rect0.y + rect0.h / 2;
  const at = s => ({ x: cx - rect0.w * s / 2, y: cy - rect0.h * s / 2, w: rect0.w * s, h: rect0.h * s });
  if (cropRectInsideImage(st, rect0)) { st.rect = { ...rect0 }; return; }
  let lo = 0.02, hi = 1;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (cropRectInsideImage(st, at(m))) lo = m; else hi = m; }
  st.rect = at(lo);
}
export function moveCropDrag(ev, pt){
  const st = cropState, d = st.drag; if (!d) return;
  if (d.mode === 'straight') { cropStraight.x1 = pt.x; cropStraight.y1 = pt.y; drawGizmo(); return; }
  const r0 = d.rect0;
  const classic = cropClassic(st);
  if (d.mode === 'new') {
    let w = pt.x - d.start.x, h = pt.y - d.start.y;
    if (Math.hypot(w, h) < 3) return;
    const ratio = cropRatioOf() || (ev.shiftKey ? 1 : 0);     
    if (ratio > 0) { if (Math.abs(w) / Math.max(1e-6, Math.abs(h)) > ratio) w = Math.sign(w || 1) * Math.abs(h) * ratio; else h = Math.sign(h || 1) * Math.abs(w) / ratio; }
    let x = w < 0 ? d.start.x + w : d.start.x, y = h < 0 ? d.start.y + h : d.start.y;
    if (ev.altKey) { x = d.start.x - Math.abs(w); y = d.start.y - Math.abs(h); w *= 2; h *= 2; }
    st.rect = clampCropRect({ x, y, w: Math.max(1, Math.abs(w)), h: Math.max(1, Math.abs(h)) });
    syncCropBar(); drawGizmo(); return;
  }
  if (d.mode === 'rotate') {
    const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
    const delta = (Math.atan2(pt.y - cy, pt.x - cx) - d.a0) * 180 / Math.PI;
    
    let deg = classic ? d.angle0 - delta : d.angle0 + delta;
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    st.angle = Math.round(deg * 100) / 100;
    if (d.inside0) cropFitAfterRotate(st, r0);
    
    setGizmoCursorString(rotCursorSmooth(Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI));
    syncCropBar(); drawGizmo(); return;
  }
  if (d.mode === 'move') {
    if (classic) {                                   
      st.rect = clampCropRect({ ...r0, x: r0.x + pt.x - d.start.x, y: r0.y + pt.y - d.start.y });
      syncCropBar(); drawGizmo(); return;
    }
    
    let ox = d.off0.x + (pt.x - d.start.x), oy = d.off0.y + (pt.y - d.start.y);
    set_snapLines([]);
    

    if (snapOn && !ev.ctrlKey && Math.abs(st.angle) < 1e-6) {
      const thr = Math.max(dispThr(8), 0.5), r = st.rect;
      const { xs, ys } = cropSnapSources();
      const pick = (srcs, tgts, off) => {
        let best = null;
        for (const e of srcs) for (const c of tgts) { const dd = c - (e + off); if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.dd))) best = { dd, px: c }; }
        return best;
      };
      const bx = pick(xs, [r.x, r.x + r.w / 2, r.x + r.w], ox);
      if (bx) { ox += bx.dd; snapLines.push({ vertical: true, px: bx.px }); }
      const by = pick(ys, [r.y, r.y + r.h / 2, r.y + r.h], oy);
      if (by) { oy += by.dd; snapLines.push({ vertical: false, px: by.px }); }
    }
    st.off = { x: ox, y: oy };
    syncCropBar(); drawGizmo(); return;
  }
  
  
  const rot = classic && Math.abs(st.angle) > 1e-9;
  const c0x = r0.x + r0.w / 2, c0y = r0.y + r0.h / 2;
  const ar = st.angle * Math.PI / 180, acs = Math.cos(ar), asn = Math.sin(ar);
  if (rot) { const dx = pt.x - c0x, dy = pt.y - c0y; pt = { x: c0x + dx * acs - dy * asn, y: c0y + dx * asn + dy * acs }; }
  let { x, y, w, h } = r0;
  const corner = d.handle % 2 === 0 ? d.handle >> 1 : -1;
  const edge = d.handle % 2 === 1 ? (d.handle - 1) >> 1 : -1;
  const fromCenter = !!ev.altKey;                    
  const keepRatio = !!ev.shiftKey && r0.h > 0;       
  const L1 = x, T1 = y, R1 = x + w, B1 = y + h;
  let l = L1, t = T1, rr = R1, b = B1;
  if (corner === 0 || corner === 3 || edge === 3) l = Math.min(pt.x, rr - 8);
  if (corner === 1 || corner === 2 || edge === 1) rr = Math.max(pt.x, l + 8);
  if (corner === 0 || corner === 1 || edge === 0) t = Math.min(pt.y, b - 8);
  if (corner === 2 || corner === 3 || edge === 2) b = Math.max(pt.y, t + 8);
  

  set_snapLines([]);
  if (snapOn && !ev.ctrlKey && !rot) {
    const thr = Math.max(dispThr(8), 0.5);
    const { xs, ys } = cropSnapSources(st);
    const sn = (v, cands, vertical) => {
      let best = null;
      for (const c of cands) { const dd = c - v; if (Math.abs(dd) <= thr && (best == null || Math.abs(dd) < Math.abs(best - v))) best = c; }
      if (best == null) return v;
      snapLines.push({ vertical, px: best });
      return best;
    };
    if (corner === 0 || corner === 3 || edge === 3) l = Math.min(sn(l, xs, true), rr - 8);
    if (corner === 1 || corner === 2 || edge === 1) rr = Math.max(sn(rr, xs, true), l + 8);
    if (corner === 0 || corner === 1 || edge === 0) t = Math.min(sn(t, ys, false), b - 8);
    if (corner === 2 || corner === 3 || edge === 2) b = Math.max(sn(b, ys, false), t + 8);
  }
  const ratio = keepRatio ? r0.w / r0.h : cropRatioOf();
  if (ratio > 0) {                                   
    const wantW = rr - l, wantH = b - t;
    if (edge === 0 || edge === 2) { const nw = wantH * ratio; const c = (l + rr) / 2; l = c - nw / 2; rr = c + nw / 2; }
    else if (edge === 1 || edge === 3) { const nh = wantW / ratio; const c = (t + b) / 2; t = c - nh / 2; b = c + nh / 2; }
    else if (wantW / wantH > ratio) { const nw = wantH * ratio; if (corner === 0 || corner === 3) l = rr - nw; else rr = l + nw; }
    else { const nh = wantW / ratio; if (corner === 0 || corner === 1) t = b - nh; else b = t + nh; }
  }
  if (fromCenter) {                                  
    
    const dragL = corner === 0 || corner === 3 || edge === 3, dragR = corner === 1 || corner === 2 || edge === 1;
    const dragT = corner === 0 || corner === 1 || edge === 0, dragB = corner === 2 || corner === 3 || edge === 2;
    const hw = Math.max(4, dragL ? c0x - l : dragR ? rr - c0x : (ratio > 0 ? (rr - l) / 2 : r0.w / 2));
    const hh = Math.max(4, dragT ? c0y - t : dragB ? b - c0y : (ratio > 0 ? (b - t) / 2 : r0.h / 2));
    l = c0x - hw; rr = c0x + hw; t = c0y - hh; b = c0y + hh;
  }
  let nr = { x: l, y: t, w: rr - l, h: b - t };
  if (rot) {                                         
    const ncx = l + nr.w / 2 - c0x, ncy = t + nr.h / 2 - c0y;
    const gx = c0x + ncx * acs + ncy * asn, gy = c0y - ncx * asn + ncy * acs;
    nr = { x: gx - nr.w / 2, y: gy - nr.h / 2, w: nr.w, h: nr.h };
  }
  st.rect = clampCropRect(nr);
  syncCropBar(); drawGizmo();
}

export function clampCropRect(r){
  const x0 = -padL(), y0 = -padT(), x1 = docW + padR(), y1 = docH + padB();
  const w = Math.min(r.w, x1 - x0), h = Math.min(r.h, y1 - y0);
  return { x: Math.max(x0, Math.min(x1 - w, r.x)), y: Math.max(y0, Math.min(y1 - h, r.y)), w, h };
}


const CROP_CURSORS = ['resizeNWSE', 'stretchV', 'resizeNESW', 'stretchH', 'resizeNWSE', 'stretchV', 'resizeNESW', 'stretchH'];

export function syncCropCursor(pt){
  const st = cropState; if (!st) return;
  const q = cropQuad();
  const hs = [q[0], mid(q[0], q[1]), q[1], mid(q[1], q[2]), q[2], mid(q[2], q[3]), q[3], mid(q[3], q[0])];
  const scale = gizmo.getBoundingClientRect().width ? dispThr(1) : 1;
  const tol = Math.max(8 * scale, 6);
  let cur = '';
  for (let k = 0; k < 8; k++) if (Math.abs(pt.x - hs[k][0]) <= tol && Math.abs(pt.y - hs[k][1]) <= tol) { cur = CROP_CURSORS[k]; break; }
  if (!cur) {
    if (pointInQuadLocal(q, pt.x, pt.y)) cur = 'move';
    else {                                                       
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      cur = rotCursorName(Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI);
    }
  }
  setGizmoCursor(cur);   
}

function cropSnapSources(st){
  

  if (!st) return snapTargets(-1);
  if (Math.abs(st.angle) > 1e-6) return snapTargets(-1, { noContent: true });
  return snapTargets(-1, { dx: st.off.x, dy: st.off.y });
}
export function endCropDrag(){
  set_snapLines([]);
  if (cropState && cropState.drag && cropState.drag.mode === 'straight') {
    const L = cropStraight, d = cropState.drag;
    if (L && Math.hypot(L.x1 - L.x0, L.y1 - L.y0) > 4) {
      let deg = Math.atan2(L.y1 - L.y0, L.x1 - L.x0) * 180 / Math.PI;
      while (deg > 45) deg -= 90; while (deg < -45) deg += 90;      
      
      const inside = cropRectInsideImage(cropState);
      cropState.angle = Math.round((cropClassic() ? -deg : d.angle0 - deg) * 100) / 100;   
      if (inside) cropFitAfterRotate(cropState, d.rect0);          
    }
    cropStraight = null; cropArmed = false; cropState.drag = null;
    const b = $('#cropStraight'); if (b) b.classList.remove('on');
    gizmo.classList.remove('drag'); syncCropBar(); syncGizmoCursor(); drawGizmo();
    return;
  }
  if (cropState) {
    const d = cropState.drag;
    cropState.drag = null;
    setCropPad(cropPadFor(cropRegionRect()));   
    
    
    if (d && (d.mode === 'size' || d.mode === 'new') && cropOpts.autoCenter) {
      const r = cropState.rect;
      try { centerDocPoint(r.x + r.w / 2, r.y + r.h / 2); } catch {}
    }
  }
  gizmo.classList.remove('drag');
  syncCropBar(); drawGizmo();
}


let cropBarBound = false;

function cropFillPresetSelect(sel){
  sel.replaceChildren();
  const add = (value, label, disabled) => { const op = document.createElement('option'); op.value = value; op.textContent = label; if (disabled) op.disabled = true; sel.appendChild(op); };
  const SEP = '──────────';
  for (const p of CROP_PRESETS) if (p.sep) add('', SEP, true); else add(p.value, p.label);
  if (cropUserPresets.length) { add('', SEP, true); cropUserPresets.forEach((p, i) => add('user:' + i, p.name)); }
  add('', SEP, true);
  add('newPreset', '新建裁剪预设…');
  add('delPreset', '删除裁剪预设…', !cropUserPresets.length);
}

export function cropApplyPreset(value){
  let p = CROP_PRESETS.find(q => q.value === value);
  if (value.startsWith('user:')) p = cropUserPresets[+value.slice(5)];
  if (!p) return;
  cropOpts.preset = value;
  cropOpts.mode = p.mode || 'ratio';
  if (value === 'ratio' || value === 'whr') { cropOpts.w = ''; cropOpts.h = ''; cropOpts.res = ''; }
  else if (value === 'orig') { cropOpts.w = ''; cropOpts.h = ''; }
  else if (value === 'front') {                     
    cropOpts.w = String(docW); cropOpts.h = String(docH); cropOpts.unit = 'px';
    cropOpts.res = String(Math.round(docResolution * 100) / 100); cropOpts.resUnit = 'in';
  } else {
    cropOpts.w = p.w != null ? String(p.w) : ''; cropOpts.h = p.h != null ? String(p.h) : '';
    if (p.mode === 'whr') { cropOpts.unit = p.unit || 'px'; cropOpts.res = p.res != null ? String(p.res) : ''; cropOpts.resUnit = p.resUnit || 'in'; }
  }
  saveCropOpts();
  if (cropState && cropRatioOf() > 0) applyCropRatio();
  syncCropBar(); drawGizmo();
}
async function cropNewPreset(){
  const def = cropOpts.mode === 'whr'
    ? `${cropOpts.w || '?'} x ${cropOpts.h || '?'} ${({ px: '像素', in: '英寸', cm: '厘米', mm: '毫米' })[cropOpts.unit]}${cropOpts.res ? ` ${cropOpts.res} ppi` : ''}`
    : cropOpts.mode === 'orig' ? '原始比例' : `${cropOpts.w || '?'} : ${cropOpts.h || '?'}`;
  const name = await promptDialog('名称：', def, { title: '新建裁剪预设' });
  if (name == null || !String(name).trim()) { syncCropBar(); return false; }
  cropUserPresets.push({ name: String(name).trim(), mode: cropOpts.mode, w: cropOpts.w, h: cropOpts.h, unit: cropOpts.unit, res: cropOpts.res, resUnit: cropOpts.resUnit });
  try { localStorage.setItem('psd_editor.cropPresets', JSON.stringify(cropUserPresets)); } catch {}
  cropOpts.preset = 'user:' + (cropUserPresets.length - 1); saveCropOpts();
  const sel = $('#cropRatio'); if (sel) cropFillPresetSelect(sel);
  syncCropBar(); shell.status(`已新建裁剪预设「${String(name).trim()}」`);
  return true;
}
async function cropDeletePreset(){
  if (!cropUserPresets.length) { syncCropBar(); return false; }
  const v = await formDialog('删除裁剪预设', [{ key: 'i', label: '预设', type: 'select', value: '0', options: cropUserPresets.map((p, i) => [String(i), p.name]) }], { okText: '删除' });
  if (!v) { syncCropBar(); return false; }
  const i = +v.i, nm = cropUserPresets[i] && cropUserPresets[i].name;
  cropUserPresets.splice(i, 1);
  try { localStorage.setItem('psd_editor.cropPresets', JSON.stringify(cropUserPresets)); } catch {}
  if (cropOpts.preset.startsWith('user:')) cropOpts.preset = cropOpts.mode;
  saveCropOpts();
  const sel = $('#cropRatio'); if (sel) cropFillPresetSelect(sel);
  syncCropBar(); shell.status(`已删除裁剪预设「${nm}」`);
  return true;
}

export function cropSwapOrientation(){
  if (cropOpts.w || cropOpts.h) { [cropOpts.w, cropOpts.h] = [cropOpts.h, cropOpts.w]; saveCropOpts(); }
  const st = cropState;
  if (st) {
    const r = st.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let w = r.h, h = r.w;
    
    const R = { w: Math.max(docW, r.w), h: Math.max(docH, r.h) };
    const k = Math.min(1, R.w / w, R.h / h); w *= k; h *= k;
    st.rect = clampCropRect({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  syncCropBar(); drawGizmo();
}

export function cropResetBox(){
  if (!cropState) return;
  cropState.rect = { x: 0, y: 0, w: docW, h: docH }; cropState.angle = 0; cropState.off = { x: 0, y: 0 };
  if (cropRatioOf() > 0) applyCropRatio();
  setCropPad(cropPadFor(cropRegionRect()));
  syncCropBar(); drawGizmo();
}
const CROP_OVERLAYS = [['thirds', '三等分'], ['grid', '网格'], ['diag', '对角'], ['triangle', '三角形'], ['golden', '黄金比例'], ['spiral', '金色螺线']];
export function cropCycleOverlay(){
  const i = CROP_OVERLAYS.findIndex(o => o[0] === cropOpts.overlay);
  cropOpts.overlay = CROP_OVERLAYS[(i + 1) % CROP_OVERLAYS.length][0];
  if (cropOpts.overlayShow === 'never') cropOpts.overlayShow = 'always';   
  saveCropOpts(); drawGizmo();
  shell.status('裁剪叠加：' + CROP_OVERLAYS.find(o => o[0] === cropOpts.overlay)[1]);
}

export function cropCycleOrient(){
  cropOpts.orient = (cropOpts.orient + 1) % 4; saveCropOpts(); drawGizmo();
}

export let cropGearPop = null;
export function set_cropGearPop(v) { return (cropGearPop = v); }   
function openCropGear(anchor){
  if (cropGearPop) { cropGearPop.remove(); cropGearPop = null; return; }
  const pop = document.createElement('div');
  pop.className = 'menu-pop level-0 crop-gear-pop';
  pop.style.cssText = 'position:fixed;z-index:1000;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-width:220px';
  const row = (label, el) => { const l = document.createElement('label'); l.style.cssText = 'display:flex;align-items:center;gap:6px;white-space:nowrap'; if (el.type === 'checkbox') l.append(el, label); else l.append(label, el); pop.append(l); return l; };
  const cb = (key, label, after) => { const el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!cropOpts[key];
    el.onchange = () => { cropOpts[key] = el.checked; saveCropOpts(); if (after) after(); sync(); drawGizmo(); }; el.dataset.opt = key; return row(label, el); };
  const sync = () => {
    for (const el of pop.querySelectorAll('[data-opt]')) {
      const k = el.dataset.opt;
      el.disabled = ['shieldColor', 'shieldCustom', 'shieldOpacity', 'autoOpacity'].includes(k) ? !cropOpts.shield
        : false;
    }
  };
  
  cb('classic', '使用经典模式', () => { if (cropState) {
    
    const o = cropState.off, a = cropState.angle * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const dx = o.x * cs + o.y * sn, dy = -o.x * sn + o.y * cs;
    cropState.rect = { ...cropState.rect, x: cropState.rect.x - dx, y: cropState.rect.y - dy }; cropState.off = { x: 0, y: 0 };
    setCropPad(cropPadFor(cropRegionRect())); } });
  const sep = () => { const d = document.createElement('div'); d.className = 'menu-sep'; pop.append(d); };
  sep();
  cb('showCropped', '显示裁剪区域');
  cb('autoCenter', '自动居中预览');
  sep();
  cb('shield', '启用裁剪屏蔽');
  const color = document.createElement('select'); color.dataset.opt = 'shieldColor';
  for (const [v, t] of [['canvas', '匹配画布'], ['custom', '自定']]) color.append(Object.assign(document.createElement('option'), { value: v, textContent: t }));
  color.value = cropOpts.shieldColor;
  const sw = document.createElement('input'); sw.type = 'color'; sw.value = cropOpts.shieldCustom || '#000000'; sw.dataset.opt = 'shieldCustom';
  sw.style.cssText = 'width:26px;height:18px;padding:0;border:1px solid var(--ps-line-2)';
  color.onchange = () => { cropOpts.shieldColor = color.value; saveCropOpts(); drawGizmo(); };
  sw.oninput = () => { cropOpts.shieldCustom = sw.value; cropOpts.shieldColor = 'custom'; color.value = 'custom'; saveCropOpts(); drawGizmo(); };
  const cr = row('颜色：', color); cr.append(sw); cr.style.paddingLeft = '18px';
  const op = document.createElement('input'); op.type = 'number'; op.min = '0'; op.max = '100'; op.value = String(cropOpts.shieldOpacity); op.style.width = '52px'; op.dataset.opt = 'shieldOpacity';
  op.onchange = () => { cropOpts.shieldOpacity = Math.max(0, Math.min(100, Math.round(+op.value || 0))); op.value = cropOpts.shieldOpacity; saveCropOpts(); drawGizmo(); };
  const or = row('不透明度：', op); or.append('%'); or.style.paddingLeft = '18px';
  const ar = cb('autoOpacity', '自动调整不透明度'); ar.style.paddingLeft = '18px';
  sync();
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(4, Math.min(innerWidth - pop.offsetWidth - 4, r.left)) + 'px'; pop.style.top = (r.bottom + 4) + 'px';
  cropGearPop = pop;
  const close = e => { if (cropGearPop && !cropGearPop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { cropGearPop.remove(); cropGearPop = null; removeEventListener('pointerdown', close, true); } };
  setTimeout(() => addEventListener('pointerdown', close, true), 0);
}
export function syncCropBar(){
  const g = $('#grpCrop'); if (!g) return;
  if (!cropBarBound) {
    cropBarBound = true;
    const sel = $('#cropRatio');
    cropFillPresetSelect(sel);
    sel.onchange = () => {
      const v = sel.value;
      if (v === 'newPreset') { cropNewPreset(); return; }
      if (v === 'delPreset') { cropDeletePreset(); return; }
      cropApplyPreset(v);
    };
    
    const num = (id, key) => $(id).addEventListener('change', () => {
      const raw = String($(id).value || '').trim();
      cropOpts[key] = raw && cropNum(raw) ? String(cropNum(raw)) : '';
      if (cropOpts.mode === 'orig') cropOpts.mode = 'ratio';
      cropOpts.preset = cropOpts.mode;
      saveCropOpts();
      if (cropState && cropRatioOf() > 0) applyCropRatio();
      syncCropBar(); drawGizmo();
    });
    num('#cropW', 'w'); num('#cropH', 'h'); num('#cropRes', 'res');
    $('#cropUnit').onchange = () => { cropOpts.unit = $('#cropUnit').value; cropOpts.preset = cropOpts.mode; saveCropOpts(); syncCropBar(); };
    $('#cropResUnit').onchange = () => { cropOpts.resUnit = $('#cropResUnit').value; cropOpts.preset = cropOpts.mode; saveCropOpts(); syncCropBar(); };
    $('#cropSwap').onclick = () => { if (cropOpts.w || cropOpts.h) { [cropOpts.w, cropOpts.h] = [cropOpts.h, cropOpts.w]; cropOpts.preset = cropOpts.mode === 'orig' ? 'ratio' : cropOpts.mode; if (cropOpts.mode === 'orig') cropOpts.mode = 'ratio'; saveCropOpts(); if (cropState && cropRatioOf() > 0) applyCropRatio(); } else cropSwapOrientation(); syncCropBar(); drawGizmo(); };
    $('#cropAngle').addEventListener('change', () => {
      if (!cropState) return;
      const r0 = { ...cropState.rect }, inside = cropRectInsideImage(cropState);
      cropState.angle = Math.max(-180, Math.min(180, +$('#cropAngle').value || 0));   
      if (inside) cropFitAfterRotate(cropState, r0);
      syncCropBar(); drawGizmo();
    });
    $('#cropClear').onclick = () => { cropOpts.w = ''; cropOpts.h = ''; cropOpts.res = ''; if (cropOpts.mode === 'orig') cropOpts.mode = 'ratio'; cropOpts.preset = cropOpts.mode; saveCropOpts(); syncCropBar(); drawGizmo(); };
    $('#cropReset').onclick = () => cropResetBox();
    $('#cropOverlayBtn').onclick = e => {
      panels.popup([
        ...CROP_OVERLAYS.map(([v, t]) => ({ label: t, checked: cropOpts.overlay === v, run: () => { cropOpts.overlay = v; saveCropOpts(); drawGizmo(); } })),
        { sep: true },
        ...[['auto', '自动显示叠加'], ['always', '总是显示叠加'], ['never', '从不显示叠加']].map(([v, t]) => ({ label: t, checked: cropOpts.overlayShow === v, run: () => { cropOpts.overlayShow = v; saveCropOpts(); drawGizmo(); } })),
        { sep: true },
        { label: '循环切换叠加　O', run: () => cropCycleOverlay() },
        { label: '循环切换取向　Shift+O', disabled: !['triangle', 'spiral'].includes(cropOpts.overlay), run: () => cropCycleOrient() },
      ], e.currentTarget.getBoundingClientRect());
    };
    { 
      const gear = $('#cropGear'), [src, px] = AB_BAR_ICONS.abGear;
      const img = document.createElement('img'); img.src = src; img.width = px; img.height = px; img.alt = '设置其它裁切选项';
      img.style.cssText = 'display:block;pointer-events:none';
      gear.replaceChildren(img);
      gear.onclick = e => openCropGear(e.currentTarget);
    }
    $('#cropDelete').onchange = () => { cropOpts.del = $('#cropDelete').checked; saveCropOpts(); $('#cropDelete').blur(); };
    
    for (const id of ['#cropAware', '#cropRatio', '#cropUnit', '#cropResUnit']) $(id).addEventListener('change', () => setTimeout(() => { try { $(id).blur(); } catch {} }, 0));
    $('#cropAware').onchange = () => {
      cropOpts.aware = $('#cropAware').checked; saveCropOpts();
      if (cropOpts.aware) CAFILL.load().catch(() => {});                
      else if (cropState && Math.abs(cropState.angle) > 1e-6) cropFitAfterRotate(cropState, { ...cropState.rect });   
      syncCropBar(); drawGizmo();
    };
    $('#cropOk').onclick = () => commitCrop(true);
    $('#cropCancel').onclick = () => cancelCrop(true);
    const stb = $('#cropStraight');
    if (stb) stb.onclick = () => {
      cropArmed = !cropArmed;
      stb.classList.toggle('on', cropArmed);
      shell.status(cropArmed ? '拉直：在画面上沿着「本该是水平的那条线」拖一下' : '已取消拉直');
      syncGizmoCursor();
    };
  }
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  { const stb = $('#cropStraight'); if (stb) stb.classList.toggle('on', cropArmed); }
  const whr = cropOpts.mode === 'whr';
  const origR = cropOpts.mode === 'orig';
  set('#cropW', origR ? String(docSizeBase ? docSizeBase.w : docW) : cropOpts.w);
  set('#cropH', origR ? String(docSizeBase ? docSizeBase.h : docH) : cropOpts.h);
  $('#cropW').placeholder = whr ? '宽度' : ''; $('#cropH').placeholder = whr ? '高度' : '';
  $('#cropUnitWrap').hidden = !whr; $('#cropResWrap').hidden = !whr;
  set('#cropUnit', cropOpts.unit); set('#cropRes', cropOpts.res); set('#cropResUnit', cropOpts.resUnit);
  const sel = $('#cropRatio'); if (sel && document.activeElement !== sel) sel.value = cropOpts.preset;
  if (sel && sel.value !== cropOpts.preset) sel.value = cropOpts.mode;
  $('#cropDelete').checked = cropOpts.del;
  const awEl = $('#cropAware'); if (awEl) awEl.checked = cropOpts.aware;
  const st = cropState;
  for (const id of ['#cropOk', '#cropCancel', '#cropReset', '#cropAngle']) $(id).disabled = !st;
  $('#cropStraight').disabled = !doc;
  if (!st) { $('#cropInfo').textContent = ''; return; }
  set('#cropAngle', Math.round(st.angle * 100) / 100);
  const tgt = cropTargetPx();
  $('#cropInfo').textContent = `${Math.round(st.rect.w)} × ${Math.round(st.rect.h)} 像素`
    + (tgt ? ` → ${tgt.w} × ${tgt.h}` : '') + (st.angle ? ` · ${st.angle.toFixed(2)}°` : '');
}
function applyCropRatio(){
  const st = cropState, ratio = cropRatioOf();
  if (!(ratio > 0)) return;
  const c = { x: st.rect.x + st.rect.w / 2, y: st.rect.y + st.rect.h / 2 };
  let w = st.rect.w, h = w / ratio;
  if (h > st.rect.h) { h = st.rect.h; w = h * ratio; }
  st.rect = { x: c.x - w / 2, y: c.y - h / 2, w, h };
  syncCropBar();
}

export let cropChecker = null, cropCheckerCell = 0;
export function set_cropChecker(v) { return (cropChecker = v); }   
function cropCheckerPattern(ctx){
  
  const [c1, c2] = PREF.checkerColors(), cs = PREF.checkerSize();
  const cell = cs ? Math.max(2, Math.round(dispPx(cs))) : 0;
  const key = cell + c1 + c2;
  if (cropChecker && cropCheckerCell === key) return cropChecker;
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(2, cell * 2);
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = c1; g.fillRect(0, 0, c.width, c.height);
    if (cell) { g.fillStyle = c2; g.fillRect(0, 0, cell, cell); g.fillRect(cell, cell, cell, cell); }
  }
  cropChecker = ctx.createPattern(c, 'repeat'); cropCheckerCell = key;
  return cropChecker;
}






export let cropAwareCache = { snap: null, w: 0, h: 0, pad: 0, cv: null };
export function set_cropAwareCache(v) { return (cropAwareCache = v); }   
function cropAwareSnapshot(snap, W, H, padIn){
  const pad = Math.min(1024, Math.max(64, padIn | 0 || 1024));
  if (cropAwareCache.snap === snap && cropAwareCache.w === W && cropAwareCache.h === H
      && cropAwareCache.pad === pad && cropAwareCache.cv) return cropAwareCache.cv;
  const cv = document.createElement('canvas');
  cv.width = W + pad * 2; cv.height = H + pad * 2;
  const g = cv.getContext ? cv.getContext('2d') : null;
  if (!g) return snap;                                 
  g.drawImage(snap, pad, pad);                         
  g.globalCompositeOperation = 'destination-over';     
  const m = (tx, ty, fx, fy) => { g.save(); g.translate(tx, ty); g.scale(fx, fy); g.drawImage(snap, 0, 0, W, H); g.restore(); };
  m(pad, pad, -1, 1);            m(pad + 2 * W, pad, -1, 1);     
  m(pad, pad, 1, -1);            m(pad, pad + 2 * H, 1, -1);     
  m(pad, pad, -1, -1);           m(pad + 2 * W, pad, -1, -1);    
  m(pad, pad + 2 * H, -1, -1);   m(pad + 2 * W, pad + 2 * H, -1, -1); 
  g.globalCompositeOperation = 'source-over';
  cropAwareCache = { snap, w: W, h: H, pad, cv };
  return cv;
}










function drawGoldenSpiral(ctx, x, y, w, h, orient){
  const PHI = 1.6180339887;
  ctx.save();
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(cx, cy); ctx.scale(orient & 1 ? -1 : 1, orient & 2 ? -1 : 1); ctx.translate(-cx, -cy);
  let rx = x, ry = y, rw = w, rh = h;
  ctx.beginPath();
  for (let k = 0; k < 10 && rw > 0.5 && rh > 0.5; k++) {
    const dir = k % 4;                     
    if (dir === 0) { const s = rw / PHI; ctx.moveTo(rx + s, ry); ctx.lineTo(rx + s, ry + rh);
      ctx.moveTo(rx, ry + rh); ctx.ellipse(rx + s, ry + rh, s, rh, 0, Math.PI, Math.PI * 1.5); rx += s; rw -= s; }
    else if (dir === 1) { const s = rh / PHI; ctx.moveTo(rx, ry + s); ctx.lineTo(rx + rw, ry + s);
      ctx.moveTo(rx, ry); ctx.ellipse(rx, ry + s, rw, s, 0, Math.PI * 1.5, Math.PI * 2); ry += s; rh -= s; }
    else if (dir === 2) { const s = rw / PHI; ctx.moveTo(rx + rw - s, ry); ctx.lineTo(rx + rw - s, ry + rh);
      ctx.moveTo(rx + rw, ry); ctx.ellipse(rx + rw - s, ry, s, rh, 0, 0, Math.PI * 0.5); rw -= s; }
    else { const s = rh / PHI; ctx.moveTo(rx, ry + rh - s); ctx.lineTo(rx + rw, ry + rh - s);
      ctx.moveTo(rx + rw, ry + rh); ctx.ellipse(rx + rw, ry + rh - s, rw, s, 0, Math.PI * 0.5, Math.PI); rh -= s; }
  }
  ctx.stroke();
  ctx.restore();
}

function drawCropOverlay(ctx, x0, y0, w, h){
  const x1 = x0 + w, y1 = y0 + h, ov = cropOpts.overlay, orient = cropOpts.orient | 0;
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = dispPx(1);
  ctx.beginPath();
  if (ov === 'diag') {                       
    const m = Math.min(w, h);
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + m, y0 + m);
    ctx.moveTo(x1, y0); ctx.lineTo(x1 - m, y0 + m);
    ctx.moveTo(x0, y1); ctx.lineTo(x0 + m, y1 - m);
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - m, y1 - m);
  } else if (ov === 'triangle') {            
    const flip = orient & 1;
    const A = flip ? [x1, y0] : [x0, y0], B = flip ? [x0, y1] : [x1, y1];
    const C = flip ? [x0, y0] : [x1, y0], D = flip ? [x1, y1] : [x0, y1];
    const foot = P => { const dx = B[0] - A[0], dy = B[1] - A[1], t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy); return [A[0] + t * dx, A[1] + t * dy]; };
    ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
    const fc = foot(C), fd = foot(D);
    ctx.moveTo(C[0], C[1]); ctx.lineTo(fc[0], fc[1]);
    ctx.moveTo(D[0], D[1]); ctx.lineTo(fd[0], fd[1]);
  } else if (ov === 'spiral') {
    ctx.stroke(); drawGoldenSpiral(ctx, x0, y0, w, h, orient); return;
  } else if (ov === 'grid') {                
    const want = dispPx(24), p10 = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, want))));
    const step = [1, 2, 5, 10].map(k => k * p10).find(v => v >= want) || want;
    for (let gx = x0 + step; gx < x1 - 1e-6; gx += step) { ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); }
    for (let gy = y0 + step; gy < y1 - 1e-6; gy += step) { ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); }
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
  } else {                                   
    const us = ov === 'golden' ? [0.382, 0.618] : [1 / 3, 2 / 3];
    for (const u of us) {
      ctx.moveTo(x0 + w * u, y0); ctx.lineTo(x0 + w * u, y1);
      ctx.moveTo(x0, y0 + h * u); ctx.lineTo(x1, y0 + h * u);
    }
  }
  ctx.stroke();
}

export function cropShieldRGB(){
  if (cropOpts.shieldColor === 'custom') return cropOpts.shieldCustom || '#000000';
  try { const c = getComputedStyle($('#viewport')).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') return c; } catch {}
  return '#282828';
}
export function drawCropGizmo(ctx){
  const st = cropState; if (!st) return;
  const q = cropQuad();
  const classic = cropClassic(st);
  const cx = st.rect.x + st.rect.w / 2, cy = st.rect.y + st.rect.h / 2;
  ensureScratch();                                   
  const snap = viewScratch.get('#below');
  
  const extraLayers = ['#warp', '#above'].map(id => !viewEmpty.has(id) && viewScratch.get(id)).filter(Boolean);
  ctx.save();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const rad = classic ? 0 : st.angle * Math.PI / 180;      
  const ox = classic ? 0 : st.off.x, oy = classic ? 0 : st.off.y;
  



  const ext = !cropOpts.aware && snap ? cropExtSnapshot(snap) : null;
  const R = cropRegionRect(st);
  const regionPath = () => { ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); };
  regionPath();
  ctx.fillStyle = '#c0c0c0'; ctx.fill('nonzero');
  const pat = cropCheckerPattern(ctx);              
  if (pat) { ctx.fillStyle = pat; ctx.fill('nonzero'); }
  regionPath(); ctx.clip('nonzero');
  if (snap) {
    ctx.save();
    ctx.translate(cx + ox, cy + oy);
    ctx.rotate(rad);
    ctx.translate(-cx, -cy);
    if (cropOpts.aware) {
      
      const ext = cropAwareSnapshot(snap, docW, docH, Math.max(docW, docH));
      if (ext && ext !== snap) ctx.drawImage(ext, -cropAwareCache.pad, -cropAwareCache.pad);
      else ctx.drawImage(snap, 0, 0, docW, docH);
    } else if (ext && ext.cv !== snap) {
      ctx.drawImage(ext.cv, ext.x, ext.y, ext.w, ext.h);   
    } else {
      ctx.drawImage(snap, 0, 0, docW, docH);          
    }
    for (const cv of extraLayers) ctx.drawImage(cv, 0, 0, docW, docH);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = dispPx(1);
    ctx.setLineDash([dispPx(6), dispPx(4)]);
    ctx.strokeRect(0, 0, docW, docH);               
    ctx.restore();
  }
  


  const shieldPath = () => {
    ctx.beginPath();
    ctx.rect(-padL(), -padT(), viewW(), viewH());
    ctx.moveTo(q[0][0], q[0][1]); for (let k = 3; k >= 1; k--) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath();
  };
  if (!cropOpts.showCropped) {
    shieldPath(); ctx.fillStyle = cropShieldRGB(); ctx.globalAlpha = 1; ctx.fill('evenodd');
  } else if (cropOpts.shield) {
    let a = Math.max(0, Math.min(100, cropOpts.shieldOpacity)) / 100;
    if (cropOpts.autoOpacity && st.drag && st.drag.mode !== 'straight') a *= 0.55;
    shieldPath(); ctx.fillStyle = cropShieldRGB(); ctx.globalAlpha = a; ctx.fill('evenodd');
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.save();
  
  ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = dispPx(1); ctx.stroke();
  
  const showOv = cropOpts.overlayShow === 'always' || (cropOpts.overlayShow === 'auto' && st.drag && st.drag.mode !== 'straight');
  if (showOv) {
    ctx.save();
    if (classic && st.angle) { ctx.translate(cx, cy); ctx.rotate(-st.angle * Math.PI / 180); ctx.translate(-cx, -cy); }
    
    const saveOv = cropOpts.overlay;
    if (!classic && st.drag && st.drag.mode === 'rotate') cropOpts.overlay = 'grid';
    try { drawCropOverlay(ctx, st.rect.x, st.rect.y, st.rect.w, st.rect.h); } finally { cropOpts.overlay = saveOv; }
    ctx.restore();
  }
  
  if (cropStraight) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,0,.95)'; ctx.lineWidth = dispPx(1.5); ctx.setLineDash([dispPx(5), dispPx(4)]);
    ctx.beginPath(); ctx.moveTo(cropStraight.x0, cropStraight.y0); ctx.lineTo(cropStraight.x1, cropStraight.y1); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  if (snapLines.length) {                         
    const R2 = cropRegionRect(st);
    ctx.save(); ctx.lineWidth = dispPx(1); ctx.strokeStyle = PREF.get('guides.smartColor') || 'rgba(255,0,170,.95)'; ctx.beginPath();
    for (const ln of snapLines) {
      if (ln.vertical) { ctx.moveTo(ln.px, R2.y); ctx.lineTo(ln.px, R2.y + R2.h); }
      else { ctx.moveTo(R2.x, ln.px); ctx.lineTo(R2.x + R2.w, ln.px); }
    }
    ctx.stroke(); ctx.restore();
  }
  drawCropHandles(ctx, q);
  drawCropBadge(ctx, st, q);
}

function drawCropBadge(ctx, st, q){
  if (!st.drag || (st.drag.mode !== 'size' && st.drag.mode !== 'rotate')) return;
  const txt = st.drag.mode === 'rotate'
    ? `${Math.round(st.angle * 100) / 100}°`
    : `${Math.round(st.rect.w)} × ${Math.round(st.rect.h)} px`;
  const lo = Math.max(q[0][1], q[1][1], q[2][1], q[3][1]);
  const bx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  ctx.save();
  ctx.font = `${dispPx(12)}px system-ui, sans-serif`;
  const bw = ctx.measureText(txt).width + dispPx(12), bh = dispPx(18);
  let x = bx - bw / 2, y = lo + dispPx(10);
  x = Math.max(-padL() + dispPx(2), Math.min(docW + padR() - bw - dispPx(2), x));   
  y = Math.max(-padT() + dispPx(2), Math.min(docH + padB() - bh - dispPx(2), y));
  ctx.fillStyle = 'rgba(0,0,0,.78)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, dispPx(3)); else ctx.rect(x, y, bw, bh);
  ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x + dispPx(6), y + bh / 2 + dispPx(0.5));
  ctx.restore();
}

export function drawCropHandles(ctx, q){
  ctx.save();
  
  const hs = [q[0], mid(q[0], q[1]), q[1], mid(q[1], q[2]), q[2], mid(q[2], q[3]), q[3], mid(q[3], q[0])];
  const sz = dispThr(7);                       
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = dispPx(1);
  for (let k = 0; k < hs.length; k++) {
    let [px, py] = hs[k];
    


    const half = sz / 2 + dispPx(1);
    px = Math.max(-padL() + half, Math.min(docW + padR() - half, px));
    py = Math.max(-padT() + half, Math.min(docH + padB() - half, py));
    const long = k % 2 ? sz * 2.2 : sz;
    ctx.beginPath();
    if (k % 2 === 0) ctx.rect(px - sz / 2, py - sz / 2, sz, sz);
    else {
      const [p0, p1] = [q[(k - 1) / 2], q[((k - 1) / 2 + 1) % 4]];
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.rect(-long / 2, -sz / 2.6, long, sz / 1.3); ctx.restore();
    }
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}



export function drawTransformHandles(ctx, q){
  ctx.save();
  const hs=[q[0],mid(q[0],q[1]),q[1],mid(q[1],q[2]),q[2],mid(q[2],q[3]),q[3],mid(q[3],q[0])];
  const sz=dispThr(7), half=sz/2+dispPx(1);
  ctx.fillStyle='#fff';ctx.strokeStyle='rgba(0,0,0,.72)';ctx.lineWidth=dispPx(1);
  for(const [x0,y0] of hs){
    const x=Math.max(-padL()+half,Math.min(docW+padR()-half,x0));
    const y=Math.max(-padT()+half,Math.min(docH+padB()-half,y0));
    ctx.beginPath();ctx.rect(x-sz/2,y-sz/2,sz,sz);ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
