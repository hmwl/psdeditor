




import './53-retouch-clone-pattern.js';   
import { bracketStep } from '../../../core/brush-engine.js';
import { shell } from '../shell.js';
import {
  $, RETOUCH, RETOUCHM, createSelection, ensureLazy, icon, kick, lassoSelection, selectionBounds,
  selectionValueAt,
} from './01-boot.js';
import { brushHistory, doc, docH, docW, li, pixelPaint, selection } from './02-doc-state.js';
import { histCap, histPush, updateUndoButtons } from './03-history.js';
import { readLazyImageTile } from './21-load-document.js';
import { layerCanvasCache, renderLayerPanel, selLayer, thumbCache } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import { transformChanged } from './28-layer-props-transform.js';
import { compositeRegionRGBA, renderPreviewOnly } from './30-render.js';
import { docTool } from './31-selection-brush.js';
import { combineInto, dispPx, selOpts, selReady, setSelection } from './32-cursors-select-options.js';
import {
  brushTarget, commitPixelPaint, diffBox, ensurePixelPaint, growPixelPaintToCanvas, paintGuard, selCovFn,
  sparsePixelHistory, strokeRegionRepaint,
} from './38-brush-engine.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import {
  RETOUCH_LABEL, RETOUCH_TOOLS, cloneSrc, csBeginStroke, csCur, csMap, csSetSample, isRetouchBrush,
  retouchGuard, retouchLayerMapOK, retouchOpts, retouchSampleImage, retouchState, rtBilinear,
  rtFillPatternSelect, rtPatternAt, rtPatternImage, rtPatternList, rtPending, set_csOverlayCache,
  set_retouchState, set_rtPending, syncCloneSrcPanel, toggleCloneSrcPanel,
} from './53-retouch-clone-pattern.js';



export function retouchSelectionMask(sel = selection){
  if (!sel) return null;
  const b = selectionBounds(sel);
  if (!b || !(b.width > 0 && b.height > 0)) return null;
  const mask = new Uint8Array(b.width * b.height);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++)
    mask[y * b.width + x] = selectionValueAt(sel, b.x + x, b.y + y);
  return { x: b.x, y: b.y, w: b.width, h: b.height, mask };
}

export function retouchStrokeMask(pts, radius){
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const r = Math.max(1, radius);
  const bx = Math.floor(x0 - r - 1), by = Math.floor(y0 - r - 1);
  const bw = Math.ceil(x1 + r + 1) - bx, bh = Math.ceil(y1 + r + 1) - by;
  if (!(bw > 0 && bh > 0)) return null;
  const mask = new Uint8Array(bw * bh);
  for (const p of pts) {
    const cx = p.x - bx, cy = p.y - by;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(bh - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(bw - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d > r) continue;
        const v = d <= r - 1 ? 255 : Math.round(255 * (r - d)); const i = y * bw + x; if (v > mask[i]) mask[i] = v;
      }
  }
  return { x: bx, y: by, w: bw, h: bh, mask };
}







export function retouchApply(label, compute, opts = {}){
  const idx = selLayer;
  const pp = ensurePixelPaint(idx);
  if (!pp) return false;
  const scope = opts.scope || 'layer';
  if (scope !== 'layer') growPixelPaintToCanvas(idx, pp);
  const before = Uint8ClampedArray.from(pp.rgba);
  try {
    if (scope === 'layer') {
      const out = compute(before, pp.w, pp.h, { ox: pp.left, oy: pp.top });
      pp.rgba.set(out);
    } else {
      const comp = opts.composite || retouchSampleImage(scope, opts.ignoreAdj);
      const res = compute(comp, docW, docH, { ox: 0, oy: 0 });
      
      for (let y = 0; y < docH; y++) {
        const ly = y - pp.top; if (ly < 0 || ly >= pp.h) continue;
        for (let x = 0; x < docW; x++) {
          const o = (y * docW + x) * 4;
          if (res[o] === comp[o] && res[o + 1] === comp[o + 1] && res[o + 2] === comp[o + 2] && res[o + 3] === comp[o + 3]) continue;
          const lx = x - pp.left; if (lx < 0 || lx >= pp.w) continue;
          const q = (ly * pp.w + lx) * 4;
          pp.rgba[q] = res[o]; pp.rgba[q + 1] = res[o + 1]; pp.rgba[q + 2] = res[o + 2]; pp.rgba[q + 3] = res[o + 3];
        }
      }
    }
  } catch (e) { pp.rgba.set(before); $('#err').textContent = `${label}失败：` + humanEditError(e && e.message || e); return false; }
  const box = diffBox(before, pp.rgba, pp.w, pp.h, 4);
  if (!box) { $('#notice').textContent = `${label}：这一下没有改到任何像素。`; return false; }
  histPush(label, 'brush');
  brushHistory.undo.push(sparsePixelHistory(idx, before, pp.rgba, pp.w, pp.h, { adjust: label }));
  if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
  brushHistory.redo.length = 0;
  const ok = commitPixelPaint(idx);
  if (ok) { delete layerCanvasCache[idx]; delete thumbCache[idx]; renderPreviewOnly(); renderLayerPanel(); }
  set_csOverlayCache(null);
  return ok;
}

const rtToWork = (region, o) => ({ ...region, x: region.x - o.ox, y: region.y - o.oy });


function rtDab(S, cx, cy, pressure){
  const pen = S.pen && retouchOpts.pressure;
  const r = Math.max(0.5, retouchOpts.size / 2 * (pen ? Math.max(0.05, pressure || 0) : 1));
  const span = Math.max(1, r * (1 - retouchOpts.hardness)), inner = Math.max(0, r - span);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(docW - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(docH - 1, Math.ceil(cy + r));
  if (x1 < x0 || y1 < y0) return;
  const tmp = [0, 0, 0, 0];
  let hit = false;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d >= r) continue;
    let c = d <= inner ? 1 : (r - d) / span;
    c = c * c * (3 - 2 * c);
    if (S.selCov) c *= S.selCov(x, y) / 255;
    const v = Math.round(c * 255), i = y * docW + x;
    if (v <= S.cov[i]) continue;
    S.cov[i] = v; hit = true;
    if (x < S.box.x0) S.box.x0 = x; if (x > S.box.x1) S.box.x1 = x; if (y < S.box.y0) S.box.y0 = y; if (y > S.box.y1) S.box.y1 = y;
    if (S.preview) {                       
      const lx = x - S.pp.left, ly = y - S.pp.top;
      if (lx < 0 || ly < 0 || lx >= S.pp.w || ly >= S.pp.h) continue;
      if (!S.srcPixel(x + 0.5, y + 0.5, tmp)) continue;
      const q = (ly * S.pp.w + lx) * 4, k = v / 255, b = S.base;
      const ca = k * tmp[3] / 255, ba = b[q + 3] / 255, oa = ca + ba * (1 - ca);
      if (oa <= 0) continue;
      for (let ch = 0; ch < 3; ch++) S.pp.rgba[q + ch] = Math.round((tmp[ch] * ca + b[q + ch] * ba * (1 - ca)) / oa);
      S.pp.rgba[q + 3] = Math.round(oa * 255);
    }
  }
  if (hit) { S.dirtyDoc = S.dirtyDoc || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const d = S.dirtyDoc; d.x0 = Math.min(d.x0, x0); d.y0 = Math.min(d.y0, y0); d.x1 = Math.max(d.x1, x1 + 1); d.y1 = Math.max(d.y1, y1 + 1); }
}
function rtStrokeTo(S, pt, pressure){
  const step = Math.max(0.5, retouchOpts.size * retouchOpts.spacing);
  const dx = pt.x - S.last.x, dy = pt.y - S.last.y, dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return;
  let t = S.carry > 0 ? S.carry : step;
  while (t <= dist) { rtDab(S, S.last.x + dx * t / dist, S.last.y + dy * t / dist, pressure); t += step; }
  S.carry = t - dist;
  S.last = { x: pt.x, y: pt.y };
  S.pts.push({ x: pt.x, y: pt.y, r: retouchOpts.size / 2 * (S.pen && retouchOpts.pressure ? Math.max(0.05, pressure || 0) : 1) });
}
let rtRAF = 0;
function rtScheduleRepaint(S){
  if (rtRAF) return;
  rtRAF = requestAnimationFrame(() => {
    rtRAF = 0;
    if (retouchState !== S) return;
    if (S.preview) {
      delete layerCanvasCache[S.idx]; delete thumbCache[S.idx];
      let done = false;
      try { done = strokeRegionRepaint({ idx: S.idx, dirtyDoc: S.dirtyDoc, target: 'pixels' }); } catch { done = false; }
      S.dirtyDoc = null;
      if (!done) renderPreviewOnly();
    }
    drawGizmo();
  });
}



async function rtHugeReadCrop(layer, idx, x0, y0, w, h, pp){
  const out = new Uint8ClampedArray(w * h * 4);
  if (layer.rgba && layer.rgba.length >= layer.width * layer.height * 4) {
    for (let y = 0; y < h; y++) out.set(layer.rgba.subarray(((y0 + y) * layer.width + x0) * 4, ((y0 + y) * layer.width + x0 + w) * 4), y * w * 4);
    return out;
  }

  if (!layer.lazyTileStore && !layer.lazyImage && !layer.lazyRasterFile) {
    try { return await pp.sparse.readRect({ x: x0, y: y0, w, h }); } catch { return null; }
  }
  let failed = false;
  for (let ty = Math.floor(y0 / 256) * 256; ty < y0 + h && !failed; ty += 256)
    for (let tx = Math.floor(x0 / 256) * 256; tx < x0 + w; tx += 256) {
      let t = pp?.sparse?.tiles?.get(`${tx}:${ty}`) || null;
      if (!t) try { t = await readLazyImageTile(layer, tx, ty); } catch { failed = true; break; }
      if (!t) continue;
      const ax0 = Math.max(x0, t.x), ax1 = Math.min(x0 + w, t.x + t.width);
      const ay0 = Math.max(y0, t.y), ay1 = Math.min(y0 + h, t.y + t.height);
      if (!(ax1 > ax0 && ay1 > ay0)) continue;
      for (let y = ay0; y < ay1; y++)
        out.set(t.data.subarray(((y - t.y) * t.width + ax0 - t.x) * 4, ((y - t.y) * t.width + ax1 - t.x) * 4),
          ((y - y0) * w + ax0 - x0) * 4);
    }
  if (!failed) return out;
  try { return await pp.sparse.readRect({ x: x0, y: y0, w, h }); } catch { return null; }
}
let rtHugeBusy = false;
async function rtHugeStroke(S, label, compute, pad){
  if (rtHugeBusy) { $('#notice').textContent = '上一次分块润饰还在写盘，完成后再落笔。'; return false; }
  rtHugeBusy = true;
  try { return await rtHugeStrokeNow(S, label, compute, pad); } finally { rtHugeBusy = false; }
}

function rtHugeClipRect(r){
  const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
  const x1 = Math.min(docW, Math.round(r.x + r.w)), y1 = Math.min(docH, Math.round(r.y + r.h));
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}
function rtHugeClipMask(m){
  if (!m) return null;
  const x = Math.max(0, m.x), y = Math.max(0, m.y);
  const x1 = Math.min(docW, m.x + m.w), y1 = Math.min(docH, m.y + m.h);
  const w = x1 - x, h = y1 - y;
  if (!(w > 0 && h > 0)) return null;
  if (x === m.x && y === m.y && w === m.w && h === m.h) return { ...m, x, y, w, h };
  const mask = new Uint8Array(w * h);
  for (let yy = 0; yy < h; yy++)
    mask.set(m.mask.subarray((y + yy - m.y) * m.w + x - m.x, (y + yy - m.y) * m.w + x - m.x + w), yy * w);
  return { x, y, w, h, mask };
}

async function rtHugeApplyMask(idx, box, mask, label, compute, opts = {}){
  if (!await ensureLazy(RETOUCH, label)) return false;
  if (!RETOUCHM) { $('#err').textContent = `${label}：修复模块还没就绪，请再试一次。`; return false; }
  const dl = doc?.layers[idx], pp = ensurePixelPaint(idx, { sparse: true });
  if (!dl || !pp?.sparse) { $('#err').textContent = `${label}：这一层没有可分块编辑的像素。`; return false; }
  if ((dl.bounds?.left | 0) !== 0 || (dl.bounds?.top | 0) !== 0 || transformChanged(idx)) {
    $('#notice').textContent = `${label}：超大文档目前要求图层位于画布原点且没有未应用的变换。`;
    return false;
  }
  const bx = box.x, by = box.y, bw = box.w, bh = box.h;
  const pad = Math.max(0, Math.round(opts.pad ?? 32));
  let cx0, cy0, cx1, cy1;
  if (opts.crop) {
    cx0 = Math.max(0, Math.floor(opts.crop.x)); cy0 = Math.max(0, Math.floor(opts.crop.y));
    cx1 = Math.min(docW, Math.ceil(opts.crop.x + opts.crop.w)); cy1 = Math.min(docH, Math.ceil(opts.crop.y + opts.crop.h));
  } else {
    cx0 = Math.max(0, bx - pad); cy0 = Math.max(0, by - pad);
    cx1 = Math.min(docW, bx + bw + pad); cy1 = Math.min(docH, by + bh + pad);
  }
  const cw = cx1 - cx0, ch = cy1 - cy0;
  if (!(cw > 0 && ch > 0)) return false;


  const work = opts.work && opts.work.length === cw * ch * 4 ? opts.work : await rtHugeReadCrop(dl, idx, cx0, cy0, cw, ch, pp);
  if (!work) { $('#err').textContent = `${label}：局部像素读取失败。`; return false; }
  const reg = { x: bx - cx0, y: by - cy0, w: bw, h: bh, mask };
  const t0 = performance.now();
  let out;
  try { out = await compute(work, cw, ch, cx0, cy0, reg, { dl, idx, pp }); }
  catch (e) { $('#err').textContent = `${label}失败：` + humanEditError(e && e.message || e); return false; }
  if (!out || out.length !== cw * ch * 4) { $('#notice').textContent = `${label}：这一笔没有算出结果。`; return false; }
  const tx = pp.sparse.begin();
  try {
    await tx.prepare({ x: bx, y: by, w: bw, h: bh });
    const ctxs = tx.contexts({ x: bx, y: by, w: bw, h: bh });
    for (const t of ctxs) {
      let changed = false;
      const x0 = Math.max(bx, t.x), x1 = Math.min(bx + bw, t.x + t.width);
      const y0 = Math.max(by, t.y), y1 = Math.min(by + bh, t.y + t.height);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const mv = mask[(y - by) * bw + (x - bx)] / 255;
        if (!(mv > 0)) continue;
        const si = ((y - cy0) * cw + (x - cx0)) * 4, di = ((y - t.y) * t.width + (x - t.x)) * 4;
        if (opts.direct) {
          let diff = false;
          for (let c = 0; c < 4; c++) if (work[si + c] !== out[si + c]) { diff = true; break; }
          if (!diff) continue;
          for (let c = 0; c < 4; c++) t.rgba[di + c] = out[si + c];
        } else {
          for (let c = 0; c < 4; c++) t.rgba[di + c] = Math.round(t.rgba[di + c] * (1 - mv) + out[si + c] * mv);
        }
        changed = true;
      }
      if (changed) tx.dirty(t.key, { x0: 0, y0: 0, x1: t.width - 1, y1: t.height - 1 });
    }
    const patches = tx.finish();
    if (!patches.length) { $('#notice').textContent = `${label}：这一下没有改到像素。`; return false; }
    brushHistory.undo.push({ kind: 'sparsePixels', idx, patches });
    if (brushHistory.undo.length > histCap('brush')) brushHistory.undo.shift();
    brushHistory.redo.length = 0;
    histPush(label, 'brush');
    commitPixelPaint(idx);
    delete layerCanvasCache[idx]; delete thumbCache[idx];
    renderLayerPanel(); renderPreviewOnly(); updateUndoButtons();
    shell.status(`${label}（分块）：${bw}×${bh}，${Math.round(performance.now() - t0)} ms`);
    return true;
  } catch (e) {
    try { tx.rollback(); } catch {}
    $('#err').textContent = `${label}失败：` + humanEditError(e && e.message || e);
    return false;
  }
}
function rtHugeStrokeMask(S, label){
  const m = rtHugeClipMask(retouchStrokeMask(S.pts, retouchOpts.size / 2));
  if (!m) return null;
  const mask = new Uint8Array(m.w * m.h);
  let any = false;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    let v = m.mask[y * m.w + x];
    if (selection) v = Math.round(v * selectionValueAt(selection, m.x + x, m.y + y) / 255);
    if (v) { mask[y * m.w + x] = v; any = true; }
  }
  if (!any) { $('#notice').textContent = `${label}：选区内没有笔迹。`; return null; }
  return { m, mask };
}
async function rtHugeStrokeNow(S, label, compute, padPx){
  const hit = rtHugeStrokeMask(S, label);
  if (!hit) return false;
  return rtHugeApplyMask(S.idx ?? selLayer, { x: hit.m.x, y: hit.m.y, w: hit.m.w, h: hit.m.h }, hit.mask, label, compute, { pad: padPx });
}
function rtHugeSpotNow(S){
  return rtHugeStroke(S, '污点修复画笔', (work, cw, ch, cx0, cy0, reg) =>
    RETOUCHM.spotHeal(work, cw, ch, reg, { type: retouchOpts.spotType, blend: retouchOpts.spotMode }),
  Math.max(32, Math.round(retouchOpts.size)));
}

async function rtHugeHealComposite(S){
  const hit = rtHugeStrokeMask(S, '修复画笔');
  if (!hit) return false;
  const { m, mask } = hit;
  const pad = Math.max(32, Math.round(retouchOpts.size));
  let cx0 = Math.max(0, m.x - pad), cy0 = Math.max(0, m.y - pad);
  let cx1 = Math.min(docW, m.x + m.w + pad), cy1 = Math.min(docH, m.y + m.h + pad);
  if (S.cloneMap) {
    const xs = [], ys = [];
    for (const [x, y] of [[m.x - 3, m.y - 3], [m.x + m.w + 3, m.y - 3], [m.x - 3, m.y + m.h + 3], [m.x + m.w + 3, m.y + m.h + 3]]) {
      const q = S.cloneMap(x, y); xs.push(q.x); ys.push(q.y);
    }
    cx0 = Math.max(0, Math.min(cx0, Math.floor(Math.min(...xs)) - 3));
    cy0 = Math.max(0, Math.min(cy0, Math.floor(Math.min(...ys)) - 3));
    cx1 = Math.min(docW, Math.max(cx1, Math.ceil(Math.max(...xs)) + 3));
    cy1 = Math.min(docH, Math.max(cy1, Math.ceil(Math.max(...ys)) + 3));
  }
  const crop = { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
  if (!(crop.w > 0 && crop.h > 0)) return false;
  const comp = await compositeRegionRGBA(cx0, cy0, cx1, cy1, {
    belowIdx: S.sampleScope === 'below' ? S.idx : null, ignoreAdj: S.ignoreAdj,
  });
  if (!comp) { $('#err').textContent = '修复画笔：局部合成失败（图层组蒙版 / 变换暂不支持）。'; return false; }
  return rtHugeApplyMask(S.idx ?? selLayer, { x: m.x, y: m.y, w: m.w, h: m.h }, mask, '修复画笔',
    (work, cw, ch, wx0, wy0, reg) => {
      const p = 3, px0 = reg.x - p, py0 = reg.y - p, pw = reg.w + p * 2, ph = reg.h + p * 2;
      const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0];
      if (S.healPattern) {
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++)
          if (rtPatternAt(S.healPattern, px0 + x + wx0 - S.patOrigin.x, py0 + y + wy0 - S.patOrigin.y, tmp)) data.set(tmp, (y * pw + x) * 4);
      } else if (S.cloneMap) {
        const smp = { data: work, w: cw, h: ch, ox: wx0, oy: wy0 };
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
          const q = S.cloneMap(px0 + x + wx0 + 0.5, py0 + y + wy0 + 0.5);
          if (rtBilinear(smp, q.x, q.y, tmp)) data.set(tmp, (y * pw + x) * 4);
        }
      }
      return RETOUCHM.healRegion(work, cw, ch, reg, { image: { data, width: pw, height: ph, x: px0, y: py0 } },
        { diffusion: retouchOpts.legacy ? 7 : retouchOpts.diffusion, blend: retouchOpts.healMode });
    }, { crop, work: comp.data, direct: true });
}

async function rtHugeHealNow(S){
  if (S.sampleScope && S.sampleScope !== 'layer') return rtHugeHealComposite(S);
  return rtHugeStroke(S, '修复画笔', async (work, cw, ch, cx0, cy0, reg, ctx) => {
    const pad = 3, px0 = reg.x - pad, py0 = reg.y - pad, pw = reg.w + pad * 2, ph = reg.h + pad * 2;
    const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0];
    if (S.healPattern) {
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++)
        if (rtPatternAt(S.healPattern, px0 + x + cx0 - S.patOrigin.x, py0 + y + cy0 - S.patOrigin.y, tmp)) data.set(tmp, (y * pw + x) * 4);
    } else if (S.cloneMap) {

      const map = S.cloneMap, xs = [], ys = [];
      for (const [ux, uy] of [[px0 + cx0, py0 + cy0], [px0 + pw + cx0, py0 + cy0],
        [px0 + cx0, py0 + ph + cy0], [px0 + pw + cx0, py0 + ph + cy0]]) {
        const q = map(ux, uy); xs.push(q.x); ys.push(q.y);
      }
      const sx0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), sy0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
      const sx1 = Math.min(docW, Math.ceil(Math.max(...xs)) + 2), sy1 = Math.min(docH, Math.ceil(Math.max(...ys)) + 2);
      const sw = sx1 - sx0, sh = sy1 - sy0;
      let src = null;
      if (sw > 0 && sh > 0) src = await rtHugeReadCrop(ctx.dl, ctx.idx, sx0, sy0, sw, sh, ctx.pp);
      if (src) {
        const smp = { data: src, w: sw, h: sh, ox: sx0, oy: sy0 };
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
          const q = map(px0 + x + cx0 + 0.5, py0 + y + cy0 + 0.5);
          if (rtBilinear(smp, q.x, q.y, tmp)) data.set(tmp, (y * pw + x) * 4);
        }
      }
    }
    return RETOUCHM.healRegion(work, cw, ch, reg, { image: { data, width: pw, height: ph, x: px0, y: py0 } },
      { diffusion: retouchOpts.legacy ? 7 : retouchOpts.diffusion, blend: retouchOpts.healMode });
  }, Math.max(8, Math.round(retouchOpts.size)));
}
async function rtHugePatch(dx, dy){
  if (rtHugeBusy) { $('#notice').textContent = '上一次分块润饰还在写盘，完成后再落笔。'; return false; }
  rtHugeBusy = true;
  try { return await rtHugePatchNow(dx, dy); } finally { rtHugeBusy = false; }
}
async function rtHugePatchNow(dx, dy){
  const allLayers = !!retouchOpts.patchAll;
  const region = retouchSelectionMask();
  if (!region) { $('#notice').textContent = '修补：没有选区。'; return false; }
  const fromSource = retouchOpts.patchMode === 'source';
  const dst = fromSource ? region : { ...region, x: region.x + dx, y: region.y + dy };
  const off = fromSource ? { dx, dy } : { dx: -dx, dy: -dy };
  const clip = rtHugeClipMask(dst);
  if (!clip) { $('#notice').textContent = '修补：落点不在画布内。'; return false; }
  const pad = Math.max(32, Math.round(retouchOpts.size));
  const ux0 = Math.min(clip.x, clip.x + off.dx) - pad, uy0 = Math.min(clip.y, clip.y + off.dy) - pad;
  const ux1 = Math.max(clip.x + clip.w, clip.x + clip.w + off.dx) + pad;
  const uy1 = Math.max(clip.y + clip.h, clip.y + clip.h + off.dy) + pad;
  const crop = { x: ux0, y: uy0, w: ux1 - ux0, h: uy1 - uy0 };
  let work = null;
  if (allLayers) {
    const comp = await compositeRegionRGBA(Math.max(0, ux0), Math.max(0, uy0), Math.min(docW, ux1), Math.min(docH, uy1));
    if (!comp) { $('#err').textContent = '修补：局部合成失败（图层组蒙版 / 变换暂不支持）。'; return false; }
    work = comp.data;
  }
  return rtHugeApplyMask(selLayer, { x: clip.x, y: clip.y, w: clip.w, h: clip.h }, clip.mask, '修补',
    (w2, cw, ch, cx0, cy0, reg) => retouchOpts.patchKind === 'content'
      ? RETOUCHM.contentAwarePlace(w2, cw, ch, reg, off, { structure: retouchOpts.patchStructure, color: retouchOpts.patchColor })
      : RETOUCHM.healRegion(w2, cw, ch, reg, off, { diffusion: retouchOpts.patchDiffusion, transparent: retouchOpts.transparent }),
    { crop, work, direct: allLayers });
}
async function rtHugeRedEye(S){
  if (rtHugeBusy) { $('#notice').textContent = '上一次分块润饰还在写盘，完成后再落笔。'; return false; }
  rtHugeBusy = true;
  try { return await rtHugeRedEyeNow(S); } finally { rtHugeBusy = false; }
}
async function rtHugeRedEyeNow(S){
  if (!await ensureLazy(RETOUCH, '红眼')) return false;
  if (!RETOUCHM) { $('#err').textContent = '红眼：修复模块还没就绪，请再试一次。'; return false; }
  const idx = S.idx ?? selLayer, dl = doc?.layers[idx], pp = ensurePixelPaint(idx, { sparse: true });
  if (!dl || !pp?.sparse) { $('#err').textContent = '红眼：这一层没有可分块编辑的像素。'; return false; }
  const w = Math.abs(S.x1 - S.x0), h = Math.abs(S.y1 - S.y0), single = w < 3 || h < 3;
  const o = { pupilSize: retouchOpts.pupilSize, amount: retouchOpts.amount, single };
  const read = async r => rtHugeReadCrop(dl, idx, r.x, r.y, r.w, r.h, pp);
  let box = null, n = 0;
  if (single) {
    let r = Math.max(12, Math.min(150, Math.round(Math.min(docW, docH) * 0.04)));
    for (let k = 0; k < 3 && !n; k++, r *= 2) {
      const clip = rtHugeClipRect({ x: S.x0 - r, y: S.y0 - r, w: r * 2, h: r * 2 });
      if (!clip) continue;
      const work = await read(clip);
      if (!work) continue;
      n = RETOUCHM.countRedEye(work, clip.w, clip.h, { x: 0, y: 0, w: clip.w, h: clip.h }, o);
      if (n) box = clip;
    }
  } else {
    const clip = rtHugeClipRect({ x: Math.min(S.x0, S.x1), y: Math.min(S.y0, S.y1), w, h });
    if (!clip) { $('#notice').textContent = '红眼：框不在画布内。'; return false; }
    const work = await read(clip);
    if (work) n = RETOUCHM.countRedEye(work, clip.w, clip.h, { x: 0, y: 0, w: clip.w, h: clip.h }, o);
    if (n) box = clip;
  }
  if (!n || !box) {
    $('#notice').textContent = '红眼：这里没找到红色的瞳孔（点在瞳孔上，或拖框把眼睛框住；也可以调大「瞳孔大小」）。';
    return false;
  }
  const mask = new Uint8Array(box.w * box.h); mask.fill(255);
  const ok = await rtHugeApplyMask(idx, box, mask, '红眼',
    (work, cw, ch, cx0, cy0, reg) => RETOUCHM.removeRedEye(work, cw, ch, reg, o), { pad: 8 });
  if (ok) shell.status(`红眼（分块）：处理了 ${n} 个像素（瞳孔大小 ${retouchOpts.pupilSize}%、变暗量 ${retouchOpts.amount}%）`);
  return ok;
}
function rtHugeDown(ev, pt){
  if (rtHugeBusy) { $('#notice').textContent = '上一次分块润饰还在写盘，完成后再落笔。'; return false; }
  if (docTool !== 'spotHeal' && docTool !== 'healBrush' && docTool !== 'patch' && docTool !== 'contentMove' && docTool !== 'redEye') {
    $('#notice').textContent = `超大文档暂不支持${RETOUCH_LABEL[docTool] || '这个润饰工具'}。`;
    return false;
  }

  const why = paintGuard();
  if (why) { $('#err').textContent = `${RETOUCH_LABEL[docTool]}用不了：${why}`; syncRetouchBar(); return false; }
  if (brushTarget() === 'mask' && docTool !== 'redEye') {
    $('#err').textContent = `${RETOUCH_LABEL[docTool]}只作用在图层像素上（把「作用于」切回「图层像素」）。`;
    return false;
  }
  if (docTool === 'healBrush' && (ev.altKey || ev.metaKey || ev.ctrlKey)) {
    if (retouchOpts.healSource === 'pattern') { $('#notice').textContent = '修复画笔：源是「图案」时不用取样。'; return false; }
    csSetSample(pt);
    shell.status(`修复画笔取样点：${Math.round(pt.x)}, ${Math.round(pt.y)}（仿制源 ${cloneSrc.active + 1}）`);
    syncRetouchBar(); drawGizmo();
    return true;
  }
  if (docTool === 'healBrush') {
    if (retouchOpts.healSource === 'sample' && !csCur()) {
      $('#notice').textContent = '修复画笔：先按住 Alt/⌥ 在干净的地方点一下取样，再涂要修的地方（PS 同）。';
      return false;
    }
  }
  const pp = ensurePixelPaint(selLayer, { sparse: true });
  if (!pp?.sparse) { $('#err').textContent = `${RETOUCH_LABEL[docTool]}用不了：这一层没有可分块编辑的像素。`; return false; }
  if (docTool === 'redEye') {
    set_retouchState({ kind: 'redEye', idx: selLayer, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    $('#err').textContent = '';
    gizmo.classList.add('drag');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    drawGizmo();
    return true;
  }
  if (docTool === 'patch' || docTool === 'contentMove') {
    const inSel = selection && selectionValueAt(selection, Math.floor(pt.x), Math.floor(pt.y)) > 0;
    const mod = ev.shiftKey || ev.altKey;
    if (!inSel || mod) {
      if (!selReady(RETOUCH_LABEL[docTool])) return false;
      const mode = ev.shiftKey && ev.altKey ? 'intersect' : ev.shiftKey ? 'add' : ev.altKey ? 'subtract' : retouchOpts.selMode;
      set_retouchState({ kind: 'lasso', pts: [{ x: pt.x, y: pt.y }], mode });
    } else {
      set_retouchState({ kind: 'drag', start: { x: pt.x, y: pt.y }, cur: { x: pt.x, y: pt.y }, prev: null });
    }
    $('#err').textContent = '';
    gizmo.classList.add('drag');
    try { gizmo.setPointerCapture(ev.pointerId); } catch {}
    drawGizmo();
    return true;
  }
  const S = { kind: 'hugeSpot', tool: docTool, idx: selLayer, pts: [{ x: pt.x, y: pt.y, r: retouchOpts.size / 2 }],
    last: { x: pt.x, y: pt.y }, carry: 0, pen: ev.pointerType === 'pen', selCov: selCovFn() };
  if (docTool === 'healBrush') {
    S.sampleScope = retouchOpts.sample;
    S.ignoreAdj = retouchOpts.ignoreAdj;
    if (retouchOpts.healSource === 'pattern') {
      S.healPattern = rtPatternImage(retouchOpts.healPattern);
      S.patOrigin = retouchOpts.aligned ? { x: 0, y: 0 } : { x: pt.x, y: pt.y };
    } else {
      const cs = csBeginStroke(pt, retouchOpts.aligned), anchor = { ...cs.anchor };
      S.cloneMap = (x, y) => csMap(cs, anchor, x, y);
    }
  }
  set_retouchState(S);
  gizmo.classList.add('drag');
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  $('#err').textContent = '';
  drawGizmo();
  return true;
}
function rtHugeMove(ev, pt){
  const S = retouchState; if (!S) return;
  const step = Math.max(1, retouchOpts.size * retouchOpts.spacing);
  const dx = pt.x - S.last.x, dy = pt.y - S.last.y, dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return;
  let t = S.carry > 0 ? S.carry : step;
  while (t <= dist) { S.pts.push({ x: S.last.x + dx * t / dist, y: S.last.y + dy * t / dist, r: retouchOpts.size / 2 }); t += step; }
  S.carry = t - dist;
  S.last = { x: pt.x, y: pt.y };
  drawGizmo();
}


export function retouchDown(ev, pt){
  if (rtPending) return rtPendingDown(ev, pt);
  if (docW * docH > 128e6) return rtHugeDown(ev, pt);
  const why = retouchGuard();
  if (why) { $('#err').textContent = `${RETOUCH_LABEL[docTool]}用不了：${why}`; syncRetouchBar(); return false; }
  $('#err').textContent = '';
  const pp = ensurePixelPaint(selLayer);
  if (docTool !== 'redEye' && !retouchLayerMapOK(selLayer, pp)) {
    $('#err').textContent = `${RETOUCH_LABEL[docTool]}用不了：这个图层套着还没应用的变换（移动以外的缩放 / 旋转 / 变形）—— 先按 Enter 应用变换或栅格化`;
    return false;
  }
  if (docTool === 'healBrush' && (ev.altKey || ev.metaKey || ev.ctrlKey)) {
    if (retouchOpts.healSource === 'pattern') { $('#notice').textContent = '修复画笔：源是「图案」时不用取样。'; return false; }
    csSetSample(pt);                                          
    shell.status(`修复画笔取样点：${Math.round(pt.x)}, ${Math.round(pt.y)}（仿制源 ${cloneSrc.active + 1}）`);
    syncRetouchBar(); drawGizmo();
    return true;
  }
  if (docTool === 'healBrush' && retouchOpts.healSource === 'sample' && !csCur()) {
    $('#notice').textContent = '修复画笔：先按住 Alt/⌥ 在干净的地方点一下取样，再涂要修的地方（PS 同）。';
    return false;
  }
  if (docTool === 'redEye') { set_retouchState({ kind: 'redEye', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }); }
  else if (docTool === 'patch' || docTool === 'contentMove') {
    const inSel = selection && selectionValueAt(selection, Math.floor(pt.x), Math.floor(pt.y)) > 0;
    const mod = ev.shiftKey || ev.altKey;
    if (!inSel || mod) {
      
      if (!selReady(RETOUCH_LABEL[docTool])) return false;
      const mode = ev.shiftKey && ev.altKey ? 'intersect' : ev.shiftKey ? 'add' : ev.altKey ? 'subtract' : retouchOpts.selMode;
      set_retouchState({ kind: 'lasso', pts: [{ x: pt.x, y: pt.y }], mode });
    } else {
      set_retouchState({ kind: 'drag', start: { x: pt.x, y: pt.y }, cur: { x: pt.x, y: pt.y }, prev: rtDragPreview() });
    }
  } else {
    
    growPixelPaintToCanvas(selLayer, pp);
    const S = { kind: 'stroke', tool: docTool, idx: selLayer, pp, cov: new Uint8Array(docW * docH),
                box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, pts: [{ x: pt.x, y: pt.y, r: retouchOpts.size / 2 }],
                last: { x: pt.x, y: pt.y }, carry: 0, pen: ev.pointerType === 'pen', selCov: selCovFn() };
    if (docTool === 'healBrush') {
      S.base = Uint8ClampedArray.from(pp.rgba);
      S.scope = retouchOpts.sample;
      S.comp = S.scope === 'layer' ? null : retouchSampleImage(S.scope, retouchOpts.ignoreAdj);
      const smp = S.comp ? { data: S.comp, w: docW, h: docH, ox: 0, oy: 0 } : { data: S.base, w: pp.w, h: pp.h, ox: pp.left, oy: pp.top };
      if (retouchOpts.healSource === 'pattern') {
        const pat = rtPatternImage(retouchOpts.healPattern);
        const org = retouchOpts.aligned ? { x: 0, y: 0 } : { x: pt.x, y: pt.y };
        S.srcPixel = (x, y, out) => rtPatternAt(pat, x - org.x, y - org.y, out);
      } else {
        const cs = csBeginStroke(pt, retouchOpts.aligned);
        const anchor = { ...cs.anchor };
        S.srcPixel = (x, y, out) => { const u = csMap(cs, anchor, x, y); return rtBilinear(smp, u.x, u.y, out); };
      }
      S.preview = true;
    } else {
      S.scope = retouchOpts.spotAll ? 'all' : 'layer';
    }
    set_retouchState(S);
    const from = ev.shiftKey && rtLastPt && rtLastPt.idx === selLayer ? rtLastPt : null;
    if (from) { S.last = { x: from.x, y: from.y }; rtDab(S, from.x, from.y, ev.pressure); rtStrokeTo(S, pt, ev.pressure); }
    else rtDab(S, pt.x, pt.y, ev.pressure);
    rtScheduleRepaint(S);
  }
  gizmo.classList.add('drag');
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  drawGizmo();
  return true;
}
let rtLastPt = null;
export function retouchMove(ev, pt){
  if (rtPending && rtPending.drag) { rtPendingMove(ev, pt); return; }
  const S = retouchState; if (!S) return;
  if (S.kind === 'hugeSpot') { rtHugeMove(ev, pt); return; }
  if (S.kind === 'redEye') { S.x1 = pt.x; S.y1 = pt.y; }
  else if (S.kind === 'drag') { S.cur = { x: pt.x, y: pt.y }; }
  else if (S.kind === 'stroke') { rtStrokeTo(S, pt, ev.pressure); rtScheduleRepaint(S); return; }
  else {
    const last = S.pts[S.pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 1) return;
    S.pts.push({ x: pt.x, y: pt.y });
  }
  drawGizmo();
}


function rtDragPreview(){
  const R = retouchSelectionMask(); if (!R) return null;
  const pp = pixelPaint[selLayer] || ensurePixelPaint(selLayer); if (!pp) return null;
  try {
    const layer = document.createElement('canvas'); layer.width = pp.w; layer.height = pp.h;
    layer.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pp.rgba), pp.w, pp.h), 0, 0);
    const mask = document.createElement('canvas'); mask.width = R.w; mask.height = R.h;
    const md = new Uint8ClampedArray(R.w * R.h * 4);
    for (let i = 0; i < R.w * R.h; i++) { md[i * 4 + 3] = R.mask[i]; }
    mask.getContext('2d').putImageData(new ImageData(md, R.w, R.h), 0, 0);
    return { layer, mask, R, ox: pp.left, oy: pp.top, tmp: Object.assign(document.createElement('canvas'), { width: R.w, height: R.h }) };
  } catch { return null; }
}
function rtDrawDragPreview(ctx, P, srcDx, srcDy, atDx, atDy){
  if (!P) return;
  const g = P.tmp.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, P.R.w, P.R.h);
  g.drawImage(P.layer, P.ox - (P.R.x + srcDx), P.oy - (P.R.y + srcDy));
  g.globalCompositeOperation = 'destination-in'; g.drawImage(P.mask, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(P.tmp, P.R.x + atDx, P.R.y + atDy); ctx.restore();
}


export async function retouchUp(){
  if (rtPending && rtPending.drag) { rtPending.drag = null; drawGizmo(); return true; }
  const S = retouchState; set_retouchState(null);
  gizmo.classList.remove('drag');
  if (!S) return false;
  const idx = selLayer, pp = pixelPaint[idx];
  let ok = false;
  if (S.kind === 'hugeSpot') ok = S.tool === 'healBrush' ? await rtHugeHealNow(S) : await rtHugeSpotNow(S);
  else if (S.kind === 'redEye') ok = pp?.sparse ? await rtHugeRedEye(S) : rtRedEye(S, pp);
  else if (S.kind === 'lasso') {
    if (S.pts.length < 3) { drawGizmo(); return false; }
    try { combineInto(lassoSelection(docW, docH, S.pts, selOpts()), S.mode || 'replace'); }
    catch (e) { $('#err').textContent = '这一圈围不出选区：' + humanEditError(e && e.message || e); }
    $('#notice').textContent = `${RETOUCH_LABEL[docTool]}：选区画好了 —— 现在从选区里往外拖` + (docTool === 'patch' ? '，指一块源过来。' : '，拖到新位置。');
    ok = true;
  } else if (S.kind === 'drag') {
    const dx = Math.round(S.cur.x - S.start.x), dy = Math.round(S.cur.y - S.start.y);
    if (!dx && !dy) { $('#notice').textContent = '没有拖动：源和目标是同一块。'; drawGizmo(); return false; }
    if (docTool === 'patch') ok = await rtPatch(dx, dy);
    else if (retouchOpts.transformOnDrop) { rtBeginPending(dx, dy); ok = true; }
    else ok = await rtContentMove({ dx, dy, s: 1, th: 0 });
  } else if (S.kind === 'stroke') {
    rtLastPt = { x: S.last.x, y: S.last.y, idx: S.idx };
    ok = rtFinishStroke(S);
  }
  syncRetouchBar(); drawGizmo();
  return ok;
}
function rtFinishStroke(S){
  const pp = S.pp, b = S.box;
  if (!(b.x1 >= b.x0)) { if (S.preview) pp.rgba.set(S.base); return false; }
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) mask.set(S.cov.subarray((b.y0 + y) * docW + b.x0, (b.y0 + y) * docW + b.x0 + w), y * w);
  const region = { x: b.x0, y: b.y0, w, h, mask };
  if (S.preview) { pp.rgba.set(S.base); delete layerCanvasCache[S.idx]; }        
  if (!RETOUCHM) { kick(RETOUCH); shell.status(RETOUCH.statusText()); renderPreviewOnly(); return false; }
  const t0 = performance.now();
  let ok;
  if (S.tool === 'spotHeal') {
    const TYPE = { content: '内容识别', texture: '创建纹理', proximity: '近似匹配' };
    ok = retouchApply('污点修复画笔', (work, W, H, o) =>
      RETOUCHM.spotHeal(work, W, H, rtToWork(region, o), { type: retouchOpts.spotType, blend: retouchOpts.spotMode }),
      { scope: S.scope });
    if (ok) shell.status(`污点修复画笔（${TYPE[retouchOpts.spotType]}）：${w}×${h}，${Math.round(performance.now() - t0)} ms`);
  } else {
    ok = retouchApply('修复画笔', (work, W, H, o) => {
      const reg = rtToWork(region, o), pad = 3;
      
      const px0 = reg.x - pad, py0 = reg.y - pad, pw = reg.w + pad * 2, ph = reg.h + pad * 2;
      const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0];
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        if (!S.srcPixel(px0 + x + o.ox + 0.5, py0 + y + o.oy + 0.5, tmp)) continue;
        const q = (y * pw + x) * 4; data[q] = tmp[0]; data[q + 1] = tmp[1]; data[q + 2] = tmp[2]; data[q + 3] = tmp[3];
      }
      return RETOUCHM.healRegion(work, W, H, reg, { image: { data, width: pw, height: ph, x: px0, y: py0 } },
        { diffusion: retouchOpts.legacy ? 7 : retouchOpts.diffusion, blend: retouchOpts.healMode });
    }, { scope: S.scope, composite: S.comp });
    if (ok) shell.status(`修复画笔：${retouchOpts.healSource === 'pattern' ? '图案' : '取样'}纹理 + 泊松融合（扩散 ${retouchOpts.legacy ? '旧版' : retouchOpts.diffusion}），${Math.round(performance.now() - t0)} ms`);
  }
  if (!ok) renderPreviewOnly();
  return ok;
}


function rtPatch(dx, dy){
  if (docW * docH > 128e6) return rtHugePatch(dx, dy);
  const region = retouchSelectionMask();
  if (!region) { $('#notice').textContent = '没有选区。'; return false; }
  if (!RETOUCHM) { kick(RETOUCH); shell.status(RETOUCH.statusText()); return false; }
  const src = retouchOpts.patchMode === 'source';
  

  const dst = src ? region : { ...region, x: region.x + dx, y: region.y + dy };
  const off = src ? { dx, dy } : { dx: -dx, dy: -dy };
  const t0 = performance.now();
  let ok;
  if (retouchOpts.patchKind === 'content') {
    ok = retouchApply('修补', (work, W, H, o) => RETOUCHM.contentAwarePlace(work, W, H, rtToWork(dst, o), off,
      { structure: retouchOpts.patchStructure, color: retouchOpts.patchColor }), { scope: retouchOpts.patchAll ? 'all' : 'layer' });
  } else {
    ok = retouchApply('修补', (work, W, H, o) => RETOUCHM.healRegion(work, W, H, rtToWork(dst, o), off,
      { diffusion: retouchOpts.patchDiffusion, transparent: retouchOpts.transparent }));
  }
  if (ok) shell.status(`修补（${retouchOpts.patchKind === 'content' ? '内容识别' : '正常'} · ${src ? '源' : '目标'}${retouchOpts.transparent && retouchOpts.patchKind !== 'content' ? ' · 透明' : ''}）：偏移 ${dx}, ${dy}，${Math.round(performance.now() - t0)} ms`);
  return ok;
}
async function rtHugePatchPattern(){
  if (rtHugeBusy) { $('#notice').textContent = '上一次分块润饰还在写盘，完成后再落笔。'; return false; }
  rtHugeBusy = true;
  try { return await rtHugePatchPatternNow(); } finally { rtHugeBusy = false; }
}
async function rtHugePatchPatternNow(){
  const clip = rtHugeClipMask(retouchSelectionMask());
  if (!clip) { $('#notice').textContent = '使用图案：先圈一个选区。'; return false; }
  const pat = rtPatternImage(retouchOpts.patchPattern), pad = Math.max(32, Math.round(retouchOpts.size));
  return rtHugeApplyMask(selLayer, { x: clip.x, y: clip.y, w: clip.w, h: clip.h }, clip.mask, '修补',
    (work, cw, ch, cx0, cy0, reg) => {
      const p = 3, px0 = reg.x - p, py0 = reg.y - p, pw = reg.w + p * 2, ph = reg.h + p * 2;
      const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0];
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++)
        if (rtPatternAt(pat, px0 + x + cx0, py0 + y + cy0, tmp)) data.set(tmp, (y * pw + x) * 4);
      return RETOUCHM.healRegion(work, cw, ch, reg, { image: { data, width: pw, height: ph, x: px0, y: py0 } },
        { diffusion: retouchOpts.patchDiffusion, transparent: retouchOpts.transparent });
    }, { crop: { x: clip.x - pad, y: clip.y - pad, w: clip.w + pad * 2, h: clip.h + pad * 2 } });
}

export function rtPatchWithPattern(){
  if (docW * docH > 128e6) return rtHugePatchPattern();
  const why = retouchGuard(); if (why) { $('#err').textContent = '使用图案：' + why; return false; }
  const region = retouchSelectionMask();
  if (!region) { $('#notice').textContent = '使用图案：先圈一个选区。'; return false; }
  if (!RETOUCHM) { kick(RETOUCH); shell.status(RETOUCH.statusText()); return false; }
  const pat = rtPatternImage(retouchOpts.patchPattern);
  const ok = retouchApply('修补', (work, W, H, o) => {
    const reg = rtToWork(region, o), pad = 3, px0 = reg.x - pad, py0 = reg.y - pad, pw = reg.w + pad * 2, ph = reg.h + pad * 2;
    const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0];
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      rtPatternAt(pat, px0 + x + o.ox, py0 + y + o.oy, tmp); data.set(tmp, (y * pw + x) * 4);
    }
    return RETOUCHM.healRegion(work, W, H, reg, { image: { data, width: pw, height: ph, x: px0, y: py0 } },
      { diffusion: retouchOpts.patchDiffusion, transparent: retouchOpts.transparent });
  });
  if (ok) shell.status(`修补：用图案「${(rtPatternList().find(p => p.id === retouchOpts.patchPattern) || {}).name || ''}」修复选区`);
  return ok;
}



function rtMoveGeometry(sel, t){
  const R = retouchSelectionMask(sel); if (!R) return null;
  const C = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
  const c = Math.cos(t.th), s = Math.sin(t.th), k = t.s || 1;
  const fwd = (x, y) => ({ x: C.x + t.dx + k * (c * (x - C.x) - s * (y - C.y)), y: C.y + t.dy + k * (s * (x - C.x) + c * (y - C.y)) });
  const inv = (x, y) => { const ux = (x - C.x - t.dx) / k, uy = (y - C.y - t.dy) / k; return { x: C.x + c * ux + s * uy, y: C.y - s * ux + c * uy }; };
  const pts = [fwd(R.x, R.y), fwd(R.x + R.w, R.y), fwd(R.x, R.y + R.h), fwd(R.x + R.w, R.y + R.h)];
  const x0 = Math.floor(Math.min(...pts.map(p => p.x))), y0 = Math.floor(Math.min(...pts.map(p => p.y)));
  const x1 = Math.ceil(Math.max(...pts.map(p => p.x))), y1 = Math.ceil(Math.max(...pts.map(p => p.y)));
  const w = x1 - x0, h = y1 - y0; if (!(w > 0 && h > 0)) return null;
  const mask = new Uint8Array(w * h);
  const identity = !t.th && k === 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = inv(x0 + x + 0.5, y0 + y + 0.5);
    mask[y * w + x] = identity ? selectionValueAt(sel, Math.floor(p.x), Math.floor(p.y)) : rtSelBilinear(sel, p.x - 0.5, p.y - 0.5);
  }
  return { src: R, dst: { x: x0, y: y0, w, h, mask }, inv, identity };
}
function rtSelBilinear(sel, x, y){
  const x0 = Math.floor(x), y0 = Math.floor(y), ax = x - x0, ay = y - y0;
  const v = (i, j) => selectionValueAt(sel, i, j);
  return Math.round((v(x0, y0) * (1 - ax) + v(x0 + 1, y0) * ax) * (1 - ay) + (v(x0, y0 + 1) * (1 - ax) + v(x0 + 1, y0 + 1) * ax) * ay);
}

async function rtHugeContentMove(t, sel = selection){
  if (rtHugeBusy) { $('#notice').textContent = '上一次分块润饰还在写盘，完成后再落笔。'; return false; }
  rtHugeBusy = true;
  try { return await rtHugeContentMoveNow(t, sel); } finally { rtHugeBusy = false; }
}
async function rtHugeContentMoveNow(t, sel){
  const allLayers = !!retouchOpts.moveAll;
  const G = rtMoveGeometry(sel, t);
  if (!G) { $('#notice').textContent = '没有选区。'; return false; }
  const src = rtHugeClipMask(G.src), dst = rtHugeClipMask(G.dst);
  if (!src || !dst) { $('#notice').textContent = '内容感知移动：落点不在画布内。'; return false; }
  const move = retouchOpts.moveMode === 'move';
  let hole = null;
  if (move) {

    const hx = src.x - 2, hy = src.y - 2, hw = src.w + 4, hh = src.h + 4;
    const mask = new Uint8Array(hw * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      let v = 0;
      for (let j = -2; j <= 2 && !v; j++) for (let i = -2; i <= 2; i++) {
        const X = x - 2 + i, Y = y - 2 + j;
        if (X < 0 || Y < 0 || X >= src.w || Y >= src.h) continue;
        if (src.mask[Y * src.w + X]) { v = 255; break; }
      }
      mask[y * hw + x] = v;
    }
    hole = rtHugeClipMask({ x: hx, y: hy, w: hw, h: hh, mask });
    if (!hole) { $('#notice').textContent = '内容感知移动：源选区不在画布内。'; return false; }
  }
  const pad = Math.max(32, Math.min(240, Math.round(Math.max(src.w, src.h) * 1.2) + 8));
  const boxes = hole ? [hole, dst] : [dst];
  const ux0 = Math.min(...boxes.map(b => b.x)) - pad, uy0 = Math.min(...boxes.map(b => b.y)) - pad;
  const ux1 = Math.max(...boxes.map(b => b.x + b.w)) + pad, uy1 = Math.max(...boxes.map(b => b.y + b.h)) + pad;
  const crop = { x: ux0, y: uy0, w: ux1 - ux0, h: uy1 - uy0 };

  const wx0 = Math.max(0, ux0), wy0 = Math.max(0, uy0), wx1 = Math.min(docW, ux1), wy1 = Math.min(docH, uy1);
  if (!(wx1 > wx0 && wy1 > wy0)) return false;
  const wb = { x: wx0, y: wy0, w: wx1 - wx0, h: wy1 - wy0, mask: new Uint8Array((wx1 - wx0) * (wy1 - wy0)) };
  for (const b of boxes) {
    const ox = b.x - wb.x, oy = b.y - wb.y;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const X = ox + x, Y = oy + y;
      if (X < 0 || Y < 0 || X >= wb.w || Y >= wb.h) continue;
      const i = Y * wb.w + X, v = b.mask[y * b.w + x];
      if (v > wb.mask[i]) wb.mask[i] = v;
    }
  }
  let work = null;
  if (allLayers) {
    const comp = await compositeRegionRGBA(wx0, wy0, wx1, wy1);
    if (!comp) { $('#err').textContent = '内容感知移动：局部合成失败（图层组蒙版 / 变换暂不支持）。'; return false; }
    work = comp.data;
  }
  const t0 = performance.now();
  const ok = await rtHugeApplyMask(selLayer, { x: wb.x, y: wb.y, w: wb.w, h: wb.h }, wb.mask, '内容感知移动',
    (work, cw, ch, cx0, cy0) => {
      const orig = work;
      let cur = work;
      if (hole) {
        const hreg = { x: hole.x - cx0, y: hole.y - cy0, w: hole.w, h: hole.h, mask: hole.mask };
        cur = RETOUCHM.spotHeal(orig, cw, ch, hreg, { type: 'content' });
      }
      const dreg = { x: dst.x - cx0, y: dst.y - cy0, w: dst.w, h: dst.h, mask: dst.mask };
      const p = 3, px0 = dreg.x - p, py0 = dreg.y - p, pw = dreg.w + p * 2, ph = dreg.h + p * 2;
      const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0], smp = { data: orig, w: cw, h: ch, ox: cx0, oy: cy0 };
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const q = G.inv(px0 + x + cx0 + 0.5, py0 + y + cy0 + 0.5);
        if (rtBilinear(smp, q.x, q.y, tmp)) data.set(tmp, (y * pw + x) * 4);
      }
      return RETOUCHM.contentAwarePlace(cur, cw, ch, dreg,
        { image: { data, width: pw, height: ph, x: px0, y: py0 } },
        { structure: retouchOpts.structure, color: retouchOpts.color });
    }, { crop, work, direct: allLayers });
  if (ok) {
    try { setSelection(createSelection(docW, docH, G.dst.x, G.dst.y, G.dst.w, G.dst.h, G.dst.mask), { history: false }); } catch {}
    shell.status(`内容感知移动（分块 · ${move ? '移动' : '扩展'} · 结构 ${retouchOpts.structure} · 颜色 ${retouchOpts.color}）：${Math.round(performance.now() - t0)} ms`);
  }
  return ok;
}
function rtContentMove(t, sel = selection){
  if (docW * docH > 128e6) return rtHugeContentMove(t, sel);
  const G = rtMoveGeometry(sel, t);
  if (!G) { $('#notice').textContent = '没有选区。'; return false; }
  if (!RETOUCHM) { kick(RETOUCH); shell.status(RETOUCH.statusText()); return false; }
  const t0 = performance.now();
  const ok = retouchApply('内容感知移动', (work, W, H, o) => {
    const orig = work;
    let cur = work;
    if (retouchOpts.moveMode === 'move') {
      
      const hole = rtToWork(G.src, o);
      const m2 = { ...hole, x: hole.x - 2, y: hole.y - 2, w: hole.w + 4, h: hole.h + 4, mask: new Uint8Array((hole.w + 4) * (hole.h + 4)) };
      for (let y = 0; y < m2.h; y++) for (let x = 0; x < m2.w; x++) {
        let v = 0;
        for (let j = -2; j <= 2 && v < 255; j++) for (let i = -2; i <= 2; i++) {
          const X = x - 2 + i, Y = y - 2 + j; if (X < 0 || Y < 0 || X >= hole.w || Y >= hole.h) continue;
          v = Math.max(v, hole.mask[Y * hole.w + X]);
        }
        m2.mask[y * m2.w + x] = v ? 255 : 0;
      }
      cur = RETOUCHM.spotHeal(orig, W, H, m2, { type: 'content' });
    }
    
    const dst = rtToWork(G.dst, o), pad = 3;
    const px0 = dst.x - pad, py0 = dst.y - pad, pw = dst.w + pad * 2, ph = dst.h + pad * 2;
    const data = new Uint8ClampedArray(pw * ph * 4), tmp = [0, 0, 0, 0], smp = { data: orig, w: W, h: H, ox: 0, oy: 0 };
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const p = G.inv(px0 + x + o.ox + 0.5, py0 + y + o.oy + 0.5);
      if (!rtBilinear(smp, p.x - o.ox, p.y - o.oy, tmp)) continue;
      data.set(tmp, (y * pw + x) * 4);
    }
    return RETOUCHM.contentAwarePlace(cur, W, H, dst, { image: { data, width: pw, height: ph, x: px0, y: py0 } },
      { structure: retouchOpts.structure, color: retouchOpts.color });
  }, { scope: retouchOpts.moveAll ? 'all' : 'layer' });
  if (ok) {
    
    try { setSelection(createSelection(docW, docH, G.dst.x, G.dst.y, G.dst.w, G.dst.h, G.dst.mask), { history: false }); } catch {}
    shell.status(`内容感知移动（${retouchOpts.moveMode === 'move' ? '移动' : '扩展'} · 结构 ${retouchOpts.structure} · 颜色 ${retouchOpts.color}）：${Math.round(performance.now() - t0)} ms`);
  }
  return ok;
}
function rtBeginPending(dx, dy){
  const sel = selection; if (!sel) return;
  const P = rtDragPreview();
  set_rtPending({ sel, t: { dx, dy, s: 1, th: 0 }, prev: P, drag: null });
  $('#notice').textContent = '投影时变换：拖角点缩放、框外拖旋转、框内拖移动；Enter / ✓ 提交，Esc / ✕ 取消。';
  syncRetouchBar(); drawGizmo();
}
function rtPendingQuad(){
  const P = rtPending, R = P.prev ? P.prev.R : retouchSelectionMask(P.sel); if (!R) return null;
  const C = { x: R.x + R.w / 2, y: R.y + R.h / 2 }, t = P.t, c = Math.cos(t.th), s = Math.sin(t.th);
  const f = (x, y) => ({ x: C.x + t.dx + t.s * (c * (x - C.x) - s * (y - C.y)), y: C.y + t.dy + t.s * (s * (x - C.x) + c * (y - C.y)) });
  return { C: { x: C.x + t.dx, y: C.y + t.dy }, pts: [f(R.x, R.y), f(R.x + R.w, R.y), f(R.x + R.w, R.y + R.h), f(R.x, R.y + R.h)], R };
}
function rtPendingDown(ev, pt){
  const Q = rtPendingQuad(); if (!Q) return false;
  const hr = dispThr(7);
  const P = rtPending, t = P.t;
  const inside = (() => { let c = false; const p = Q.pts; for (let i = 0, j = 3; i < 4; j = i++) { if (((p[i].y > pt.y) !== (p[j].y > pt.y)) && pt.x < (p[j].x - p[i].x) * (pt.y - p[i].y) / (p[j].y - p[i].y) + p[i].x) c = !c; } return c; })();
  if (Q.pts.some(q => Math.hypot(q.x - pt.x, q.y - pt.y) <= hr)) P.drag = { mode: 'scale', s0: t.s, d0: Math.max(1, Math.hypot(pt.x - Q.C.x, pt.y - Q.C.y)) };
  else if (inside) P.drag = { mode: 'move', p0: pt, dx0: t.dx, dy0: t.dy };
  else P.drag = { mode: 'rotate', th0: t.th, a0: Math.atan2(pt.y - Q.C.y, pt.x - Q.C.x) };
  try { gizmo.setPointerCapture(ev.pointerId); } catch {}
  return true;
}
function rtPendingMove(ev, pt){
  const P = rtPending, D = P.drag, t = P.t, Q = rtPendingQuad(); if (!D || !Q) return;
  if (D.mode === 'move') { t.dx = D.dx0 + pt.x - D.p0.x; t.dy = D.dy0 + pt.y - D.p0.y; }
  else if (D.mode === 'scale') t.s = Math.max(0.05, Math.min(20, D.s0 * Math.hypot(pt.x - Q.C.x, pt.y - Q.C.y) / D.d0));
  else { let th = D.th0 + Math.atan2(pt.y - Q.C.y, pt.x - Q.C.x) - D.a0; if (ev.shiftKey) th = Math.round(th / (Math.PI / 12)) * (Math.PI / 12); t.th = th; }
  drawGizmo();
}
export async function rtPendingCommit(){
  const P = rtPending; if (!P) return false;
  set_rtPending(null);
  const t = { ...P.t, dx: Math.round(P.t.dx), dy: Math.round(P.t.dy) };
  const ok = await rtContentMove(t, P.sel);
  syncRetouchBar(); drawGizmo();
  return ok;
}
export function rtPendingCancel(){ if (!rtPending) return false; set_rtPending(null); shell.status('内容感知移动：已取消'); syncRetouchBar(); drawGizmo(); return true; }


function rtRedEye(S, pp){
  if (!RETOUCHM) { kick(RETOUCH); shell.status(RETOUCH.statusText()); return false; }
  const w = Math.abs(S.x1 - S.x0), h = Math.abs(S.y1 - S.y0), single = w < 3 || h < 3;
  const o = { pupilSize: retouchOpts.pupilSize, amount: retouchOpts.amount, single };
  const toLocal = rect => ({ x: Math.round(rect.x - pp.left), y: Math.round(rect.y - pp.top), w: Math.round(rect.w), h: Math.round(rect.h) });
  let local, n = 0;
  if (single) {
    
    let r = Math.max(12, Math.min(150, Math.round(Math.min(docW, docH) * 0.04)));
    for (let k = 0; k < 3 && !n; k++, r *= 2) { local = toLocal({ x: S.x0 - r, y: S.y0 - r, w: r * 2, h: r * 2 }); n = RETOUCHM.countRedEye(pp.rgba, pp.w, pp.h, local, o); }
  } else {
    local = toLocal({ x: Math.min(S.x0, S.x1), y: Math.min(S.y0, S.y1), w, h });
    n = RETOUCHM.countRedEye(pp.rgba, pp.w, pp.h, local, o);
  }
  if (!n) { $('#notice').textContent = '红眼：这里没找到红色的瞳孔（点在瞳孔上，或拖框把眼睛框住；也可以调大「瞳孔大小」）。'; return false; }
  const ok = retouchApply('红眼', (rgba, w2, h2) => RETOUCHM.removeRedEye(rgba, w2, h2, local, o));
  if (ok) shell.status(`红眼：处理了 ${n} 个像素（瞳孔大小 ${retouchOpts.pupilSize}%、变暗量 ${retouchOpts.amount}%）`);
  return ok;
}


export let rtHover = null;              
export function drawRetouchGizmo(ctx){
  if (li || !doc) return;
  if (!RETOUCH_TOOLS.has(docTool)) return;
  ctx.save();
  ctx.lineWidth = dispPx(1);
  const dash = (a, b) => { ctx.setLineDash([dispPx(a), dispPx(b)]); };
  const s = csCur();
  if (s && docTool === 'healBrush' && retouchOpts.healSource === 'sample') {       
    let p = s;
    const S = retouchState;
    if (S && S.kind === 'stroke' && s.anchor) p = csMap(s, s.anchor, S.last.x, S.last.y);
    else if (rtHover && s.anchor) p = csMap(s, s.anchor, rtHover.x, rtHover.y);
    const r = dispThr(6);
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
  }
  const S = retouchState;
  if (S) {
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    if (S.kind === 'redEye') {
      const x = Math.min(S.x0, S.x1), y = Math.min(S.y0, S.y1);
      ctx.strokeRect(x, y, Math.abs(S.x1 - S.x0), Math.abs(S.y1 - S.y0));
      dash(4, 3); ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeRect(x, y, Math.abs(S.x1 - S.x0), Math.abs(S.y1 - S.y0));
    } else if (S.kind === 'lasso' && S.pts.length > 1) {
      ctx.beginPath(); ctx.moveTo(S.pts[0].x, S.pts[0].y);
      for (const p of S.pts) ctx.lineTo(p.x, p.y);
      ctx.stroke(); dash(4, 3); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
    } else if (S.kind === 'drag') {
      const dx = S.cur.x - S.start.x, dy = S.cur.y - S.start.y;
      if (docTool === 'patch' && retouchOpts.patchMode === 'source') rtDrawDragPreview(ctx, S.prev, dx, dy, 0, 0);
      else rtDrawDragPreview(ctx, S.prev, 0, 0, dx, dy);
      if (S.prev) {                                           
        const R = S.prev.R;
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.strokeRect(R.x + dx, R.y + dy, R.w, R.h);
        dash(4, 3); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeRect(R.x + dx, R.y + dy, R.w, R.h);
      }
    } else if (S.kind === 'hugeSpot' || (S.kind === 'stroke' && S.tool === 'spotHeal')) {
      
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      for (const p of S.pts) { ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2); }
      ctx.fill();
      const step = Math.max(1, retouchOpts.size * retouchOpts.spacing);
      for (let i = 1; i < S.pts.length; i++) {
        const a = S.pts[i - 1], b = S.pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > step) { ctx.lineCap = 'round'; ctx.lineWidth = (a.r + b.r); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
    }
  }
  if (rtPending) {
    const Q = rtPendingQuad();
    if (Q) {
      const P = rtPending, t = P.t;
      if (P.prev) {                                           
        const g = P.prev.tmp.getContext('2d'), R = P.prev.R;
        g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, R.w, R.h);
        g.drawImage(P.prev.layer, P.prev.ox - R.x, P.prev.oy - R.y);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(P.prev.mask, 0, 0);
        ctx.save(); ctx.translate(Q.C.x, Q.C.y); ctx.rotate(t.th); ctx.scale(t.s, t.s);
        ctx.globalAlpha = 0.9; ctx.drawImage(P.prev.tmp, -R.w / 2, -R.h / 2); ctx.restore();
      }
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = dispPx(1);
      ctx.beginPath(); Q.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      const hs = dispThr(4);
      for (const p of Q.pts) { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2); ctx.strokeStyle = '#000'; ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2); }
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}



export const RT_BAR_ICONS = {
  CloneSourcePanel: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAABcklEQVR42mL8//8/w2ACLFB6BRCrkGnGnT9//kSysrJS7DNQ4DBB2SoUmKPCwsLCQ60QYmIYZGDQOYgRmqjPDAK33AHiiMEUQiqjaWhIOoiFCmZsAuLVQPwEiMWBOBCIw0AZZiAcNImRkXEREv8zEHcDc+5NIF1H7yi7C6wyFmMtSxgZQaF2lt4OOkag/jpKbwf9plCe6g4ypFCe+g4CJl4nHM0IIyDlOBDlUBvQ8iQgZoM6hBmII4HMieRme0odBCo2soBYBsrnA+JiIOYc6JL6Ixo9oFXHL2C58xZa/vwDUp8G2kE30Pj36F2XPYM26K5BLUd3ACgNyQOxMhBrAzEox8nRosW4DohXAqPlLhm9CZADI4A4lIBSE1Ic5Ah0zGeyi/XfvxmBvZPThBxEt/YQsf02UhwkT2EnUJ7aiXoBPbrdpOYyXyD+QqZd+2nhoC/kJmxiQ5dUB+2ndbSNdoOIddCdQdK3h1cdo1GGCwAEGACvI3OnN1CXPQAAAABJRU5ErkJggg==', 18],
  IgnoreAdjustments: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACaklEQVR42uSXu0oDQRSGd4MRFIlgoXjHJzBEbEQRLEJMKwg2Zu0sFG3EzsIXsBFLUUER7MRCI4hiI6igj+AlCgreCq8r8T9wBsZkZ2dHNCkc+JjNZHbOPzNnzpy1s9msVcwSsopcii7Aoi0Q24C6DyQLalc8gFJwxDgFF8CNqUKJEHZL5EbbthfRaONxhKAOaFuQXqpB1QuioIV9yAVn4ARsof+1iRBbzB4vyuocFkFlFqyDcZCQHPcNPIAIKBOvgg0wh/FudSugFOAh4hmUgwxYA7uu62bC4XCW+9ah6gH9gJ7vwATGPNUJ+OYDHp0cySfmyVE1syJHHub+B6DdyAlzOkRAKEeEE9DBZrj/Dqj2E+AXiCbBNFhiP7DYMR2N8VFUXfyT/GPMOBLynsbZ220+CVoRbDyV0xxHe6NpKCbj5JUrMP7JTuorQmHc4nHipgKiXO/lxAlPET7GRWlT/VGiaG8CrzCYyZsORLDTimDVgTqm8csG0xWoAo/K6PV9JWIBDkbEVMA9qNQMKp8OXXky3QKK7Y1Y3gbM9lLh7XQvTAl/0Ai4NBVAIbQTdINljbcHEXFsugWbfLH0y+HXw3jCI1jlLRhIGwngK5VeqgdDmqOmE7GN8S6MrmM2SDF8lT14Xwqvls+q0XYMStvxAvow9o3qNgz5HLUbvg/cAMZVK0F5QvLHWTFEHKIa5mNp/VCE7wWmTcshglKtAc50dF8x9P8HqAh6gSl9QHHb1fIsW0EzH2MyeM45YRrjXPlkVrMixwyUEf1iBiwnNalAGdEfiyj1TMv/svAtSierDM/veVnxv/04/RJgAGH6vrvy9vrUAAAAAElFTkSuQmCC', 16],
  ToolPenPressure: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAADOklEQVR42sxYPWhTURR+CQVR88TFIVmEogkIOpgOgkPjFks66aKTi+mSKRZ1MtFJpHGQLu3k9AKlLnV0sJVMkgjilAiO6SpEM4gYv1O+B9fbe1/uCzXNhY+bnnvuOd+75+fdV280Gnkhpj3g8wowrwuPhRD83QQ+AnvApVCe9I5vXKP/08ArkLogwoR6MolEYhonU8Q0BFrAM6DIpe/A/blphwnTU+AP8BB4wiUhdRY4H/uEoJ/HVABywEXA59IA+Aq0YWczgkyYJr9JqkX5Z+zbdiYEvWU5UiAD9IEeoY4skIedG9reW5geGXL2gBT0P4SCOYcTESd1Onsrv2HgU4ww3cb02LIs/s/pgihjEpoasA+U4xBxICPjOWy+UQXJMWTWgM5/JLOtC405xDBtCBnIVieopnFkXsDulmnBRiigSE7mh8GhJPYdSWDJLegsxCCzDv3XXkRS6c5KTGAbmQck47HKdpW1e5gqk5KxJXVZqsmUMzy5LEk0oLN/lGQOJTWbXoblrZOpksym5JVG5vJRkDFV2aI0Pf10mDN35WT0Loy1M5B9EaeuZLBnByi7hCxn6L4eO7SMhmFtFca/iVMWSMXhZHosiLGEJCRNg94BUTVMfNITmOQ1sSRkNFJRYeophRFJyLcYyKrVpIzrwEn+riikOgxj1PBdcijuKCq/fwLzIOM7kHEu+0HEEWe0cJ3CJA3xHdECkV8xfA9cCPUYHn10gWWpNjjtK/IS/h5aXh/yADtAAJ2XhhTouYSsayEUlnpVec0MbWQ03aYlJ7suhCRxM2yQ6jtOqku6dMHWP7TTKfNWGRgqM2y+u7bN/3wGsWnVLLoB0AbWGJJDYeJaW3lB6zo18RH1NDqhEg3mLfpVrrdJsEEEirxqu49zvWTjY7t+bLBPrEA2MBhOs7EtKDnXZxiaepi4x+cda4D1FecTCh0C722hm/ATqEab6XGKxk9puTWGpPh0kxLxFTJZlw3Wb3uFVOBkzLw/cCbj8s8GyFNK5dRdDJNIXanIlOtDxPlQvMo7UYEJvMf2HyZwmoWwqPSZIO7XyiSf0ineZXKGO02HHbhjuo/HJjQLI+nN2Jg5Qn8FGADRjGaaR57lQQAAAABJRU5ErkJggg==', 18],
  ToolAirbrush: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAkCAYAAADy19hsAAADpElEQVR42uyYXUhUQRTH9253a7VMrTAFLerB6AMyKyiLfOjjLQp7twerh5I+6KFPiKDISiiyko0MesgHI7Ay6IOCPqGwoiCCwhKsDCFsl8TV3Xb7nzhXhmHu7ty9a7SwA3/O3jtnz/3dmbkzZ8aIx+OeTCpeT4aVLHAWONOBPTRLWPpPeC5CnVArZIp8JNNBoHEw06ESaDxkQIPQT6jLMIxgCnA+mGpoEvQyFot9gq3g6nKoCPom/sfUCOqHWQjNpUuGDLOl4ucXeesQthDmLDRrZHx6vdcFlx8sjzYwglJrroUKJEi5jHEISy0XgMqkqnXQG2gXPQu9FpGHqjcJbB1UrMHQ5xD2ggLWKvOhJQSrqjQTdFcdd/ewwqUb6oGCCBxOAbY0ietK6K42MEoNw8qFxtQdQA6k8IHpwlLJs6swFYEXwMxQ+H6BOgA7PMqwVJ47WTiqFPeGXMDSWG1h2C5+8UTlBXRFC5jHbonC774L2ADHfAdthrYkgCaf3XhWVLeFZ9v4fXQBW8Qg2wASgvpsoGnR2I76QSe5hGoK60aQIRewndBWxPhl1QvQ1urYC9XrrJbyR1eYhlxAht1pM/UthfKhfn4hrbk8rdmaBPvYDhZ+9GEfgAZ4qPToPkMn+Sl2MHU1M+wjaI9qtYIfxTvOjbUPPh/c5MP9Ch8/HjJNc54lmHt2sDx+v8O08WUtJ1cpA3+28VuWJM5RnmdvU1fbtGyeAN0EcxlaBJ1B3YRUgd/b+JUh6JwEcQrYXgJMTAG7AuYm7GIJmlq6EjqnC+2Vuos+kFc2vqsQtFwBU8lLeZCTIrl+OcwJiIBOi9DRaPQkzDXOtQl6YiqzxAPOfVWlGkFnSrCNfBmwWhf3K2gIMJz1gREY7TAacX8e+fl8vjigGwToHY6B8VDa8txK8J8qPHAstAa/z0PUKu34X1skEjFwfxN/gFepRRnyEOqPkYVyuDVHoIVkJycZsCFm9AgqZ20bOB8OCzsO0kNOUHJp3KKVmk3TpC4/DNF4/crbKdqr7UfcJ0Lc9TAHoRCvdlP4xeh6I3x75U2y1jyMP75m59VSFb3Ab4al0gFYmiGaeKa4ATWwz2R5BcN1O+2G8XMvLzJ+zgbrZVhHLSy8YT7vAEp5K/SUVibcb+HtTIi7nbqzFa19irs52UJTw7sa6rkj1EB2xxBpOZegxYLPDugM4RlUS2N4NM9N/jK6OUjhj2wqlPsvDnpIRvZ8OAuc4cB/BBgAIE/i5BD5D+4AAAAASUVORK5CYII=', 18],
  FlipHorz: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABoElEQVR42tSXv0vDQBTHm0voIoKIq4M/yODkIk46uOriKg4igg4i7uIkuDiagoiogwhOxamg0D/AqujiUNwEByenIhISPwcnBCvhask9PPhwSXt573sv7+5evDRNS5ItyPnvHEJLO03P8xY6cfw9cZUzJuzAXvjXCKiScAuKMEp4IzO5Q17Ng0QELmEEjhCzCYFTAcz6mm7eCFmEfUSUneYAIlqww+UeTMCWSBIi4oLuAGaJwpTUKjiGR9hIksRzLoAoJHQVGOJ6UmQfwPE93SvM2ApodmDfduwdjLftyb9R0Aa1CjdZv663Yj0zheMe6xxg8K2hN+/eUsAAJIxvOU/COI718tMr4FkplTrPAWxOm2itZP0WIoDn16E/c1+GKtShLysgyDHSTUW0BHPY2Ob3BtdrMAj6/t22Hui2ItIJV0FETZ8DUMV5zfVZoIxz/U4bJhFFDiPteNf3/RMiMipZE47BsJSAF1gmD64KL0p/tE840zUBzj+cVMWZfV9nfYTjN6dlOe0U6jh+EvkuwHH0b76MXFdE7dGS/jz/EmAA9/nyEVkwGZoAAAAASUVORK5CYII=', 16],
  FlipVert: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABeUlEQVR42uyXP0jDQBSHczEU7OCkgw7iYgRdBLOIOKiDOLg6dHBRcNGC4KS7fxZXJzdxFN3b1UHq4hhnR0F0zBC/kwuE9mJyaTEId/Dlhdx7736599KjIo5jp8rhyYsQopAzYucxqyDtFNQhgldowx25vlL+k5hpnrUz8jni55IjAJ8A04RZeIdneJNTMAaLMAofcE6+loq7wizALs9edAKc30rAnAtH0IEbWIqiSGj8hmANHpTvMSyre8k91I0EqMUvVIKmXKRAiWpwqGKeUgIk+6YCDlTgjmljEXPStbjkEca7BbgZCWYw29CidteGi89hNjVTNejZBTcjzx7Ibj41XHwEc5Z8XZqxrgTmChiGS97+03D3t2Aix2ejtxEqGpk98JfDCvBULW4xfsGYkOZsqLiOOkuCMnmgkeyAbyDaLzmn9fX63MGVgZSg7EgfvZU0YfI7//+/AtsDtgf6KEEwqBKEBjFhyTmtr6j6j4k9jq0AK+BbgAEAsNUCH8hj72wAAAAASUVORK5CYII=', 16],
  ToolPenPressureOpacity: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAADiklEQVR42sxYO2hUQRR9m13dGF0QoisGPxA0skIsEgsrE7sosdLCT6FN3CZaGPADoqsoiKSSgCiKVhEkFoKVFiZxK+EpYmMWtbCIGg1INm5CzGY9V87I+HyfGSNxBw533rx5c8/e38xsrFKpONXUapxqa2Kh/2Ul6N0CNFYFIejcCTwDhoDN1eCybdS/FLgKUhtkMKasE4vFFsoyHRAlIA9cADr46ivQlVhoN0GcB+aAE8BZvhJSy4H1VhbC3FaIdmATsBFI+UwrAlmsVwggo8JklqTyHH+JbwaMCGHObjEn0AB8BEYIhzFQBlYAQvga1nqIbzLoj6M/hv4e9E/6xOxPUpgzrAYSERZpgsgBIp8At4HXQgaLzHFORvskp8Y1MnvRPxWgQvSv9A4EkRHXnAM+AEeAKZt4MSAj7TLm3f/tOz+XkUwv4ALXSeYNXeMwhlTzjo9bkBnwM5mfm8Qyg8At7VVZc5MTMP4F/c8GZK74kQkqjDm6KWeb1oZk+jDvnhMSVLp1OhnAl4C1XndolvGOj0HJOOQhPB+NIHPHZreX4B1mJv1yh5Y5js+4InPYhAzmNbCehRPiJKkzTy3dJGSa0e02tMxx1qtIl7UBo8ADbSzMTSLfArVQ9grPfQGklGXq0Z9kSKRMCEnKFnT3hGSTiGk8z6B/BnhHpY6HlE4mzT3MpSciCQnzuxbemoCiJOQOYJeQ8ZDS3ZSmXMQMbjchlPLZCgKzrFwuz8bjcSGzhGPdGimXblSW0ddxTF3m1wKLYSKRqPBso9o3oBFjKQ+ZsHVCCRUtzzZ1EFuBx0ReYkqbkg75vGhCqMA4ummQZXHKTpAoaSTlwJ4McfcodRRMCqOcb5pUwYsohouB75LyUKSvkQyYr9oUCY2YEJLNNLSKam0dIIfyVRZengaamfKDkS7DL3kOMmLSg5ClqCz7i/HVwAFxm+gy3ctuANuBjMVeZjJeywRoow6zzVXOwhAvxEpA3b+6bEg5oHVc6nBs6pBcTfoBOdiX5ukmeVgD7AfqI04D/gc0/AIp7Vmat0uzlK2bYrwqHWMYZLm2/b8fvFMJqRbgNLPKps2QxEWu8cc9LfA4E3Yvw7tlED103xDwCHivu8lzOqhhndknRROQeOnFnEnj85XhRbGFQSm79Cfe0Sa4cztM6RTdrOpMf1h6z4uQx2KtPDt5C6jLCuzaWCSQULW0HwIMAPapAWT5wu/jAAAAAElFTkSuQmCC', 18],
};
export function rtIconInto(btn, key, alt){
  if (!btn || btn.dataset.icon === key) return;
  const [src, px] = RT_BAR_ICONS[key];
  const img = document.createElement('img'); img.src = src; img.height = px; img.alt = alt || ''; img.style.cssText = 'display:block;pointer-events:none';
  btn.replaceChildren(img); btn.dataset.icon = key;
}

function rtBrushPopToggle(){
  let pop = $('#rtBrushPop');
  if (pop && !pop.hidden) { pop.hidden = true; return; }
  if (!pop) {
    pop = document.createElement('div'); pop.id = 'rtBrushPop'; pop.className = 'presetpop'; pop.hidden = true;
    pop.style.cssText = 'display:block;width:230px;padding:8px 10px;font-size:12px';
    pop.innerHTML = `
      <div style="display:grid;grid-template-columns:48px 1fr 54px;gap:6px 6px;align-items:center">
        <span>大小:</span><input id="rtbSize" type="range" min="1" max="1000" step="1"><span><input id="rtbSizeN" type="number" min="1" max="5000" step="1" style="width:48px"></span>
        <span>硬度:</span><input id="rtbHard" type="range" min="0" max="100" step="1"><span id="rtbHardV"></span>
        <span>间距:</span><input id="rtbSpace" type="range" min="1" max="1000" step="1"><span id="rtbSpaceV"></span>
      </div>
      <div style="color:var(--muted);margin-top:6px">[ ] 改大小，Shift+[ ] 改硬度</div>`;
    document.body.appendChild(pop);
    const upd = () => { syncRetouchBar(); rtBrushPopSync(); drawGizmo(); };
    $('#rtbSize').oninput = () => { retouchOpts.size = +$('#rtbSize').value; upd(); };
    $('#rtbSizeN').onchange = () => { retouchOpts.size = Math.max(1, Math.min(5000, Math.round(+$('#rtbSizeN').value || 24))); upd(); };
    $('#rtbSizeN').addEventListener('keydown', e => e.stopPropagation());
    $('#rtbHard').oninput = () => { retouchOpts.hardness = +$('#rtbHard').value / 100; upd(); };
    $('#rtbSpace').oninput = () => { retouchOpts.spacing = +$('#rtbSpace').value / 100; upd(); };
    document.addEventListener('pointerdown', e => {
      const p = $('#rtBrushPop'); if (!p || p.hidden) return;
      if (p.contains(e.target) || $('#rtBrushBtn').contains(e.target)) return;
      p.hidden = true;
    }, true);
  }
  pop.hidden = false;
  rtBrushPopSync();
  const r = $('#rtBrushBtn').getBoundingClientRect();
  pop.style.left = Math.round(Math.min(r.left, innerWidth - 250)) + 'px'; pop.style.top = Math.round(r.bottom + 2) + 'px';
}
function rtBrushPopSync(){
  const pop = $('#rtBrushPop'); if (!pop || pop.hidden) return;
  $('#rtbSize').value = String(Math.min(1000, retouchOpts.size));
  if (document.activeElement !== $('#rtbSizeN')) $('#rtbSizeN').value = String(retouchOpts.size);
  $('#rtbHard').value = String(Math.round(retouchOpts.hardness * 100)); $('#rtbHardV').textContent = Math.round(retouchOpts.hardness * 100) + '%';
  $('#rtbSpace').value = String(Math.round(retouchOpts.spacing * 100)); $('#rtbSpaceV').textContent = Math.round(retouchOpts.spacing * 100) + '%';
}

export function rtBrushKey(kind){
  if (!isRetouchBrush(docTool)) return false;
  
  if (kind === 'smaller') retouchOpts.size = bracketStep(retouchOpts.size, -1);
  else if (kind === 'larger') retouchOpts.size = bracketStep(retouchOpts.size, 1);
  else if (kind === 'softer') retouchOpts.hardness = Math.max(0, Math.round(retouchOpts.hardness * 4 - 1) / 4);
  else if (kind === 'harder') retouchOpts.hardness = Math.min(1, Math.round(retouchOpts.hardness * 4 + 1) / 4);
  syncRetouchBar(); rtBrushPopSync(); drawGizmo();
  shell.status(`${RETOUCH_LABEL[docTool]}：笔尖 ${retouchOpts.size} px · 硬度 ${Math.round(retouchOpts.hardness * 100)}%`);
  return true;
}


let retouchBarBound = false;
export function syncRetouchBar(){
  const g = $('#grpRetouch'); if (!g) return;
  const t = docTool;
  if (!retouchBarBound) {
    retouchBarBound = true;
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    const num = (id, key, lo, hi, dflt) => on(id, 'change', () => { const el = $(id); retouchOpts[key] = Math.max(lo, Math.min(hi, Math.round(+el.value))); if (!Number.isFinite(retouchOpts[key])) retouchOpts[key] = dflt; syncRetouchBar(); });
    const chk = (id, key) => on(id, 'change', () => { retouchOpts[key] = $(id).checked; syncRetouchBar(); drawGizmo(); });
    on('#rtBrushBtn', 'click', e => { e.stopPropagation(); rtBrushPopToggle(); });
    on('#rtMode', 'change', () => { retouchOpts[docTool === 'spotHeal' ? 'spotMode' : 'healMode'] = $('#rtMode').value; });
    for (const r of g.querySelectorAll('input[name="rtType"]')) r.addEventListener('change', () => { if (r.checked) retouchOpts.spotType = r.value; syncRetouchBar(); });
    for (const r of g.querySelectorAll('input[name="rtSrc"]')) r.addEventListener('change', () => { if (r.checked) retouchOpts.healSource = r.value; syncRetouchBar(); drawGizmo(); });
    for (const r of g.querySelectorAll('input[name="rtPatchMode"]')) r.addEventListener('change', () => { if (r.checked) retouchOpts.patchMode = r.value; syncRetouchBar(); });
    on('#rtHealPattern', 'change', () => { retouchOpts.healPattern = $('#rtHealPattern').value; });
    on('#rtPatchPattern', 'change', () => { retouchOpts.patchPattern = $('#rtPatchPattern').value; });
    chk('#rtAlign', 'aligned'); chk('#rtLegacy', 'legacy'); chk('#rtTransparent', 'transparent'); chk('#rtTod', 'transformOnDrop');
    on('#rtAll', 'change', () => { const k = docTool === 'spotHeal' ? 'spotAll' : docTool === 'patch' ? 'patchAll' : 'moveAll'; retouchOpts[k] = $('#rtAll').checked; });
    on('#rtSample', 'change', () => { retouchOpts.sample = $('#rtSample').value; set_csOverlayCache(null); syncRetouchBar(); drawGizmo(); });
    on('#rtIgnoreAdj', 'click', () => { retouchOpts.ignoreAdj = !retouchOpts.ignoreAdj; set_csOverlayCache(null); syncRetouchBar(); drawGizmo(); });
    on('#rtPressure', 'click', () => { retouchOpts.pressure = !retouchOpts.pressure; syncRetouchBar(); });
    on('#rtCloneSrcBtn', 'click', () => toggleCloneSrcPanel());
    on('#rtPatchKind', 'change', () => { retouchOpts.patchKind = $('#rtPatchKind').value; syncRetouchBar(); });
    on('#rtMoveMode', 'change', () => { retouchOpts.moveMode = $('#rtMoveMode').value; });
    on('#rtStructure', 'change', () => { const v = Math.max(1, Math.min(7, Math.round(+$('#rtStructure').value || 4))); retouchOpts[docTool === 'patch' ? 'patchStructure' : 'structure'] = v; syncRetouchBar(); });
    on('#rtColor', 'change', () => { const v = Math.max(0, Math.min(10, Math.round(+$('#rtColor').value || 0))); retouchOpts[docTool === 'patch' ? 'patchColor' : 'color'] = v; syncRetouchBar(); });
    on('#rtDiffusion', 'change', () => { const v = Math.max(1, Math.min(7, Math.round(+$('#rtDiffusion').value || 5))); retouchOpts[docTool === 'patch' ? 'patchDiffusion' : 'diffusion'] = v; syncRetouchBar(); });
    num('#rtPupil', 'pupilSize', 1, 100, 50); num('#rtAmount', 'amount', 1, 100, 50);
    on('#rtUsePattern', 'click', () => rtPatchWithPattern());
    on('#rtCommit', 'click', () => rtPendingCommit());
    on('#rtCancel', 'click', () => rtPendingCancel());
    for (const b of g.querySelectorAll('#rtSelOps button')) {
      b.textContent = ''; b.append(icon(b.dataset.icon, 15));
      b.addEventListener('click', () => { retouchOpts.selMode = b.dataset.m; syncRetouchBar(); });
    }
    for (const el of g.querySelectorAll('input[type="number"]')) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } e.stopPropagation(); });
    rtIconInto($('#rtCloneSrcBtn'), 'CloneSourcePanel', '切换仿制源面板');
    rtIconInto($('#rtIgnoreAdj'), 'IgnoreAdjustments', '忽略调整图层');
    rtIconInto($('#rtPressure'), 'ToolPenPressure', '压力控制大小');
  }
  const show = (id, v) => { const el = $(id); if (el) el.hidden = !v; };
  const brushT = isRetouchBrush(t), selT = t === 'patch' || t === 'contentMove';
  const content = t === 'patch' && retouchOpts.patchKind === 'content';
  const pend = !!rtPending && t === 'contentMove';
  show('#rtBrushWrap', brushT);
  show('#rtSelOps', selT);
  show('#rtCloneSrcBtn', t === 'healBrush');
  show('#rtModeWrap', brushT);
  show('#rtTypeWrap', t === 'spotHeal');
  show('#rtSourceWrap', t === 'healBrush');
  show('#rtAlignWrap', t === 'healBrush');
  show('#rtLegacyWrap', t === 'healBrush');
  show('#rtSampleWrap', t === 'healBrush');
  show('#rtPatchKindWrap', t === 'patch');
  show('#rtPatchModeWrap', t === 'patch' && !content);
  show('#rtTransparentWrap', t === 'patch' && !content);
  show('#rtUsePatternWrap', t === 'patch' && !content);
  show('#rtMoveModeWrap', t === 'contentMove');
  show('#rtStructWrap', content || t === 'contentMove');
  show('#rtColorWrap', content || t === 'contentMove');
  show('#rtAllWrap', t === 'spotHeal' || content || t === 'contentMove');
  show('#rtTodWrap', t === 'contentMove');
  show('#rtPressure', brushT);
  show('#rtDiffWrap', t === 'healBrush' || (t === 'patch' && !content));
  show('#rtRedWrap', t === 'redEye'); show('#rtDarkWrap', t === 'redEye');
  show('#rtCommit', pend); show('#rtCancel', pend);
  $('#rtBrushSize').textContent = String(retouchOpts.size);
  { const pv = $('#rtBrushPv');                  
    if (pv && pv.dataset.h !== String(retouchOpts.hardness)) {
      pv.dataset.h = String(retouchOpts.hardness);
      const c = document.createElement('canvas'); c.width = c.height = 20; const x = c.getContext('2d');
      const gr = x.createRadialGradient(10, 10, 0, 10, 10, 9); gr.addColorStop(0, '#ddd'); gr.addColorStop(Math.max(0, Math.min(0.99, retouchOpts.hardness)), '#ddd'); gr.addColorStop(1, 'rgba(221,221,221,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(10, 10, 9, 0, 7); x.fill(); pv.replaceChildren(c);
    } }
  $('#rtMode').value = t === 'spotHeal' ? retouchOpts.spotMode : retouchOpts.healMode;
  for (const r of g.querySelectorAll('input[name="rtType"]')) r.checked = r.value === retouchOpts.spotType;
  for (const r of g.querySelectorAll('input[name="rtSrc"]')) r.checked = r.value === retouchOpts.healSource;
  for (const r of g.querySelectorAll('input[name="rtPatchMode"]')) r.checked = r.value === retouchOpts.patchMode;
  show('#rtHealPattern', retouchOpts.healSource === 'pattern');
  if (t === 'healBrush') retouchOpts.healPattern = rtFillPatternSelect($('#rtHealPattern'), retouchOpts.healPattern);
  if (t === 'patch') retouchOpts.patchPattern = rtFillPatternSelect($('#rtPatchPattern'), retouchOpts.patchPattern);
  $('#rtAlign').checked = retouchOpts.aligned; $('#rtLegacy').checked = retouchOpts.legacy;
  $('#rtSample').value = retouchOpts.sample;
  $('#rtIgnoreAdj').classList.toggle('on', retouchOpts.ignoreAdj);
  $('#rtIgnoreAdj').disabled = retouchOpts.sample === 'layer';
  $('#rtPressure').classList.toggle('on', retouchOpts.pressure);
  $('#rtTransparent').checked = retouchOpts.transparent; $('#rtTod').checked = retouchOpts.transformOnDrop;
  $('#rtPatchKind').value = retouchOpts.patchKind; $('#rtMoveMode').value = retouchOpts.moveMode;
  $('#rtStructure').value = String(t === 'patch' ? retouchOpts.patchStructure : retouchOpts.structure);
  $('#rtColor').value = String(t === 'patch' ? retouchOpts.patchColor : retouchOpts.color);
  $('#rtDiffusion').value = String(t === 'patch' ? retouchOpts.patchDiffusion : retouchOpts.diffusion);
  $('#rtDiffusion').disabled = t === 'healBrush' && retouchOpts.legacy;
  $('#rtAll').checked = t === 'spotHeal' ? retouchOpts.spotAll : t === 'patch' ? retouchOpts.patchAll : retouchOpts.moveAll;
  for (const b of g.querySelectorAll('#rtSelOps button')) b.classList.toggle('on', b.dataset.m === retouchOpts.selMode);
  $('#rtPupil').value = String(retouchOpts.pupilSize);
  $('#rtAmount').value = String(retouchOpts.amount);
  const why = retouchGuard();
  $('#rtWhy').textContent = why ? `用不了：${why}` : (RETOUCHM ? '' : RETOUCH.statusText());
  const cs = csCur();
  $('#rtInfo').textContent = why ? '' :
      t === 'spotHeal' ? ''
    : t === 'healBrush' ? (retouchOpts.healSource === 'pattern' ? '' : cs ? `源 ${cloneSrc.active + 1}：${Math.round(cs.x)}, ${Math.round(cs.y)}` : '按住 Alt/⌥ 点一下取样')
    : t === 'patch' ? (selection ? '' : '先圈一块（直接用这把工具拖）')
    : t === 'contentMove' ? (pend ? '拖角点缩放 · 框外拖旋转 · Enter 提交' : selection ? '' : '先圈一块（直接用这把工具拖）')
    : '';
  if (!RETOUCHM) kick(RETOUCH);
}


addEventListener('keydown', e => {
  if (!doc || li || e.isComposing) return;
  const tg = e.target, tag = (tg && tg.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  if (rtPending && docTool === 'contentMove') {
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); rtPendingCommit(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); rtPendingCancel(); return; }
  }
  if ((docTool === 'cloneStamp' || docTool === 'healBrush') && e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) {
    const s = csCur(); if (!s) return;
    const k = e.key, c = e.code;
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    let did = true;
    if (nudge) { const a = s.anchor || { x: s.x, y: s.y }; s.anchor = { x: a.x + nudge[0], y: a.y + nudge[1] }; }
    else if (c === 'Comma') s.angle = Math.max(-180, (s.angle || 0) - 1);
    else if (c === 'Period') s.angle = Math.min(180, (s.angle || 0) + 1);
    else if (c === 'BracketLeft') { s.sw = Math.max(1, (s.sw || 100) - 1); s.sh = Math.max(1, (s.sh || 100) - 1); }
    else if (c === 'BracketRight') { s.sw = Math.min(1000, (s.sw || 100) + 1); s.sh = Math.min(1000, (s.sh || 100) + 1); }
    else did = false;
    if (did) {
      e.preventDefault(); e.stopImmediatePropagation();
      syncCloneSrcPanel(); drawGizmo();
      const off = s.anchor ? `${Math.round(s.anchor.x - s.x)}, ${Math.round(s.anchor.y - s.y)}` : '0, 0';
      shell.status(`仿制源：偏移 ${off} · W/H ${Math.round(s.sw)}% / ${Math.round(s.sh)}% · 角度 ${(+s.angle).toFixed(1)}°`);
    }
  }
}, true);
