





















import {
  adjustmentRenderParams, applyVectorMaskToSource, baseAlphaMask, clipToBase, computeLayerFx, createSurface,
  dirtyRect, drawContent, drawLayer, groupHasMask, groupMaskAlpha, hasRenderableFill, hasRenderableVectorMask,
  multiplyLayerMask, shapeSource, frameStrokeSource, vectorMaskSig, vectorStrokeRenderParams,
  setGlobalLightAngle, globalLightAngleOf, clippingAdjustmentEnd, drawWithLockedAlpha, opaqueSource, mixSurfaceByMask,
} from '../compose.js';
import { applyAdjustment } from '../adjust.js';
import { applyLutRGBA } from '../lut.js';

let objSeq = 0;
const objIds = new WeakMap();
const idOf = o => { if (!o || typeof o !== 'object') return '-'; let v = objIds.get(o); if (!v) { v = ++objSeq; objIds.set(o, v); } return v; };


export function createDrawListState() {
  return { ver: new WeakMap(), shapes: new WeakMap(), frames: new WeakMap(), vmask: new WeakMap(), fx: new WeakMap(), masks: new WeakMap() };
}

export function markDirty(state, data) {
  if (!state || !data) return;
  state.ver.set(data, (state.ver.get(data) || 0) + 1);
}
const verOf = (state, data) => (state && data ? state.ver.get(data) || 0 : 0);


export function layerMaskPlane(state, mask, docW, docH, origTop, origLeft) {
  const sig = `${docW}x${docH}|${origTop},${origLeft}|${idOf(mask.gray)}|${mask.left},${mask.top},${mask.width},${mask.height}|${mask.defaultColor}|${mask.invert ? 1 : 0}|${mask.density}|${mask.feather}|${mask.relative ? 1 : 0}|${verOf(state, mask.gray)}`;
  const hit = state && state.masks.get(mask);
  if (hit && hit.sig === sig) return hit.plane;
  let plane;
  if (mask.feather > 0.2) {
    const tmp = new Uint8ClampedArray(docW * docH * 4);
    for (let q = 3; q < tmp.length; q += 4) tmp[q] = 255;
    multiplyLayerMask(tmp, docW, docH, 0, 0, mask, origTop, origLeft);
    plane = new Uint8Array(docW * docH);
    for (let q = 0; q < plane.length; q++) plane[q] = tmp[q * 4 + 3];
  } else {
    
    const g = mask.gray, den = mask.density != null ? mask.density : 255;
    let gray = g;
    if (den < 255) { const k = den / 255; gray = new Uint8Array(g.length); for (let i = 0; i < g.length; i++) gray[i] = 255 - Math.round((255 - g[i]) * k); }
    const def = mask.defaultColor != null ? mask.defaultColor : 255;
    plane = new Uint8Array(docW * docH);
    plane.fill(mask.invert ? 255 - def : def);
    const ox = (mask.relative ? origLeft : 0) + mask.left, oy = (mask.relative ? origTop : 0) + mask.top;
    const x0 = Math.max(0, ox), y0 = Math.max(0, oy), x1 = Math.min(docW, ox + mask.width), y1 = Math.min(docH, oy + mask.height);
    for (let y = y0; y < y1; y++) {
      const row = (y - oy) * mask.width - ox;
      for (let x = x0, q = y * docW + x0; x < x1; x++, q++) { const v = gray[row + x]; plane[q] = mask.invert ? 255 - v : v; }
    }
  }
  if (state) state.masks.set(mask, { sig, plane });
  return plane;
}


function shapeItem(state, l, docW, docH, patterns) {
  const key = l.vectorMask && typeof l.vectorMask === 'object' ? l.vectorMask : (l.fill && typeof l.fill === 'object' ? l.fill : l);
  let sig;
  try {
    sig = (l.vectorMask ? vectorMaskSig(l.vectorMask, docW, docH) : `${docW}x${docH}`) + '|' + JSON.stringify(l.fill && l.fill.params)
      + '|' + (l.fill && l.fill.key) + '|' + JSON.stringify(l.vectorStroke && l.vectorStroke.desc) + '|' + (Array.isArray(patterns) ? patterns.map(p => p && p.id).join(',') : '')
      + '|f' + (l.fillOpacity == null ? 255 : l.fillOpacity) + '|m' + (l.mask && l.mask.gray && !l.mask.disabled ? idOf(l.mask) + ':' + idOf(l.mask.gray) + ':' + verOf(state, l.mask.gray) : '-')
      + '|b' + ((l.bounds && l.bounds.top) || 0) + ',' + ((l.bounds && l.bounds.left) || 0);
  } catch { sig = null; }
  const hit = sig && state && state.shapes.get(key);
  if (hit && hit.sig === sig) return hit.item;
  const it = shapeSource(l, docW, docH, patterns);
  if (it && l.mask && l.mask.gray && !l.mask.disabled)
    multiplyLayerMask(it.src.data, it.src.width, it.src.height, it.left, it.top, l.mask, (l.bounds && l.bounds.top) || 0, (l.bounds && l.bounds.left) || 0);
  if (sig && state) state.shapes.set(key, { sig, item: it });
  return it;
}
function frameStrokeItem(state, group, docW, docH, patterns) {
  if (!(group.frame || group.frameInfo || group.isFrame)) return null;
  if (!state || !group.vectorMask || group._frameStrokeSource !== undefined) return frameStrokeSource(group, docW, docH, patterns);
  const key = group.vectorMask;
  const sig = vectorMaskSig(key, docW, docH) + '|' + JSON.stringify(group.vectorStroke?.desc) + '|' + JSON.stringify(group.frame || group.frameInfo);
  const hit = state.frames?.get(key);
  if (hit?.sig === sig) return hit.item;
  const item = frameStrokeSource(group, docW, docH, patterns);
  state.frames?.set(key, { sig, item });
  return item;
}
function sourceOf(state, l, docW, docH, patterns, warped, i) {
  if (warped && warped.has(i)) {
    const raw = warped.get(i), data = new Uint8ClampedArray(raw.data);
    if (l.mask) multiplyLayerMask(data, raw.width, raw.height, 0, 0, l.mask, l.bounds.top, l.bounds.left);
    return { src: applyVectorMaskToSource({ ...raw, data }, l.vectorMask, 0, 0, docW, docH), left: 0, top: 0 };
  }
  if (hasRenderableFill(l.fill, l.vectorMask, patterns) || vectorStrokeRenderParams(l.vectorStroke, l.vectorMask)) return shapeItem(state, l, docW, docH, patterns);
  if (l.rgba && l.width > 0 && l.height > 0) {
    const src = { data: l.rgba, width: l.width, height: l.height, ...(l.gpuDetailTiles ? { detail: l.gpuDetailTiles } : {}) };
    

    if (l.gpuXform) return { src, left: l.bounds.left, top: l.bounds.top, xf: l.gpuXform };
    if (!hasRenderableVectorMask(l.vectorMask)) return { src, left: l.bounds.left, top: l.bounds.top };
    const sig = `${vectorMaskSig(l.vectorMask, docW, docH)}|${l.bounds.left},${l.bounds.top}|${l.width}x${l.height}|${verOf(state, l.rgba)}`;
    const hit = state && state.vmask.get(l.rgba);
    if (hit && hit.sig === sig) return hit.item;
    const item = { src: applyVectorMaskToSource(src, l.vectorMask, l.bounds.left, l.bounds.top, docW, docH), left: l.bounds.left, top: l.bounds.top };
    if (state) state.vmask.set(l.rgba, { sig, item });
    return item;
  }
  return null;
}
const NO_FX = item => ({ src: item.src, shadows: [], glow: null, overlay: null, modeOverlays: [], innerShadows: [], innerGlow: null, innerStrokes: [], outerStrokes: [], satin: null, bevel: null });
function fxOf(state, item, l, patterns) {
  if (!l.effects) return NO_FX(item);
  const fillLow = !item.fillApplied && (l.fillOpacity ?? 255) < 255;
  const ver = verOf(state, item.src.data);
  const hit = state && state.fx.get(item.src.data);
  if (hit && hit.effects === l.effects && hit.fillLow === fillLow && hit.w === item.src.width && hit.h === item.src.height && hit.ver === ver && hit.patterns === patterns) return hit;
  const FX = computeLayerFx(item, l, patterns);
  FX.ver = ver; FX.patterns = patterns;
  if (state) state.fx.set(item.src.data, FX);
  return FX;
}







export function buildDrawList(doc, docW, docH, state = null, warped = null) {
  setGlobalLightAngle(globalLightAngleOf(doc));   
  const layers = doc.layers, pairs = new Map(), stack = [], patterns = doc.patterns || null;
  let opaqueGroupMask = null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const type = layers[i].group && layers[i].group.type;
    if (type === 1 || type === 2) stack.push(i);
    else if (type === 3 && stack.length) pairs.set(i, stack.pop());
  }


  const koPrefix = new Uint32Array(layers.length + 1);
  for (let i = 0; i < layers.length; i++) koPrefix[i + 1] = koPrefix[i] + (layers[i].knockout ? 1 : 0);
  const anyKnockout = (a, b) => b > a && koPrefix[b] - koPrefix[a] > 0;
  const renderRange = (out, from, to, initialClip = null, lockAlpha = false) => {
    let clipBase = initialClip;
    for (let i = from; i < to; i++) {
      const l = layers[i], type = l.group && l.group.type;
      if (type === 3 && pairs.has(i)) {
        const header = pairs.get(i), group = layers[header];
        if (group.hidden) { clipBase = null; i = header; continue; }          
        const pass = group.blendMode === 'pass';
        const isolated = !pass || (group.opacity ?? 255) !== 255;
        const masked = groupHasMask(group);
        const stroke = frameStrokeItem(state, group, docW, docH, patterns);
        const strokeOp = stroke ? { k: 'src', src: stroke.src, left: stroke.left, top: stroke.top, opacity: 1, blend: 'norm', clip: null, content: false } : null;
        const opacity = (group.opacity ?? 255) / 255;
        if (masked && pass) {
          const g = { k: 'group', mode: 'passMask', opacity, blend: 'norm', mask: groupMaskAlpha(group, docW, docH), artboard: null, ops: [] };
          renderRange(g.ops, i + 1, header);
          if (strokeOp) {
            g.opacity = 1;
            
            
            opaqueGroupMask ||= new Uint8Array(docW * docH).fill(255);
            out.push({ k: 'group', mode: 'passMask', opacity, blend: 'norm', mask: opaqueGroupMask, artboard: null, ops: [g, strokeOp] });
          } else out.push(g);
        } else {
          const abd = group.artboard && group.artboard.rect ? group.artboard : null;
          if (!(isolated || masked || abd || stroke)) {
            if (anyKnockout(i + 1, header)) {
              const g = { k: 'group', mode: 'pass', ops: [] }; renderRange(g.ops, i + 1, header); out.push(g);
            } else renderRange(out, i + 1, header);
          }
          else {
            let artboard = null;
            if (abd) {
              const r = abd.rect, bt = abd.bgType | 0;
              artboard = { l: Math.max(0, Math.round(r.x)), t: Math.max(0, Math.round(r.y)), r: Math.min(docW, Math.round(r.x + r.w)), b: Math.min(docH, Math.round(r.y + r.h)),
                color: bt === 3 ? null : bt === 2 ? [0, 0, 0] : bt === 4 && Array.isArray(abd.color) ? abd.color : [255, 255, 255], clip: !abd.noClip };
            }
            const g = { k: 'group', mode: 'iso', opacity, blend: pass ? 'norm' : group.blendMode, mask: masked ? groupMaskAlpha(group, docW, docH) : null, artboard, ops: [] };
            renderRange(g.ops, i + 1, header);
            if (strokeOp) {
              g.opacity = 1; g.blend = 'norm';
              out.push({ k: 'group', mode: 'iso', opacity, blend: pass ? 'norm' : group.blendMode, mask: null, artboard: null, ops: [g, strokeOp] });
            } else out.push(g);
          }
        }
        clipBase = null; i = header; continue;
      }
      if (type === 1 || type === 2 || type === 3 || l.hidden) { if (!l.clipping) clipBase = null; continue; }
      if (l.clipping && !clipBase) continue;
      const adjustment = adjustmentRenderParams(l.adjustment);
      if (adjustment) {
        const clip = l.clipping && clipBase ? clipBase : null;
        if (clip && !lockAlpha) clip.used = true;
        const hasMask = !!(l.mask && l.mask.gray && !l.mask.disabled);
        out.push({ k: 'adj', adjustment, mask: hasMask ? l.mask : null, maskOrig: [(l.bounds && l.bounds.top) || 0, (l.bounds && l.bounds.left) || 0],
          plane: hasMask ? layerMaskPlane(state, l.mask, docW, docH, (l.bounds && l.bounds.top) || 0, (l.bounds && l.bounds.left) || 0) : null,
          opacity: (l.opacity ?? 255) / 255, blend: l.blendMode, clip: lockAlpha ? null : clip, keepAlpha: lockAlpha, key: l.adjustment });
        if (!l.clipping) clipBase = null;
        continue;
      }
      const item = sourceOf(state, l, docW, docH, patterns, warped, i);
      if (!item) { if (!l.clipping) clipBase = null; continue; }
      const FX = fxOf(state, item, l, patterns);
      const op = (l.opacity ?? 255) / 255;
      const part = (p, x, y, blend, clip = null) => out.push({ k: 'src', src: p, left: x, top: y, opacity: op, blend, clip: lockAlpha ? null : clip, keepAlpha: lockAlpha });
      for (const s of FX.shadows) part(s.src, item.left + s.left, item.top + s.top, s.blendMode);
      if (FX.glow) part(FX.glow.src, item.left + FX.glow.left, item.top + FX.glow.top, FX.glow.blendMode);
      const src = FX.src, X = item.left, Y = item.top;
      const contentOpacity = op * (item.fillApplied ? 1 : ((l.fillOpacity ?? 255) / 255));
      const xf = item.xf || null;
      const content = (clip) => ({ k: 'src', src, left: X, top: Y, xf, opacity: contentOpacity, blend: l.blendMode, clip: lockAlpha ? null : clip, keepAlpha: lockAlpha, content: true,
        isBackground: !!l.isBackground, blendIf: l.blendIf || null, channelsOff: l.channelsOff && l.channelsOff.length ? l.channelsOff.filter(c => c >= 0 && c < 3) : null });
      const stackEnd = lockAlpha ? i + 1 : clippingAdjustmentEnd(layers, i, to);
      if (!l.clipping) {
        clipBase = { k: 'base', src, left: X, top: Y, xf, used: false };
        out.push(clipBase);
        if (l.knockout) out.push({ k: 'src', src, left: X, top: Y, xf, opacity: op, blend: 'norm', clip: null, knockout: l.knockout });
        if (stackEnd > i + 1) {
          const c = content(null), pass = l.blendClipped === false;
          const ops = [pass ? { ...c, opaque: true, opacity: item.fillApplied ? 1 : (l.fillOpacity ?? 255) / 255 }
            : { ...c, opacity: 1, blend: 'norm', blendIf: null, channelsOff: null }];
          renderRange(ops, i + 1, stackEnd, clipBase, true);
          out.push({ ...c, k: 'clipStack', pass, opacity: pass ? op : c.opacity, ops });
        } else out.push(content(null));
        if (FX.overlay) part(FX.overlay, X, Y, l.blendMode);
        for (const mo of FX.modeOverlays || []) part(mo.src, X, Y, mo.blendMode);
        if (FX.satin) part(FX.satin.src, X, Y, FX.satin.blendMode);
        if (FX.innerGlow) part(FX.innerGlow.src, X, Y, FX.innerGlow.blendMode);
        for (const s of FX.innerShadows) part(s.src, X, Y, s.blendMode);
        for (const s of FX.outerStrokes) part(s.src, X + s.left, Y + s.top, s.blendMode);
        for (const s of FX.innerStrokes) part(s.src, X, Y, s.blendMode);
        if (FX.bevel) for (const b of [FX.bevel.shadow, FX.bevel.highlight]) part(b.src, X + (b.left || 0), Y + (b.top || 0), b.blendMode);
      } else if (clipBase) {
        const cb = clipBase; if (!lockAlpha) cb.used = true;
        out.push(content(cb));
        if (FX.overlay) part(FX.overlay, X, Y, l.blendMode, cb);
        for (const mo of FX.modeOverlays || []) part(mo.src, X, Y, mo.blendMode, cb);
        if (FX.satin) part(FX.satin.src, X, Y, FX.satin.blendMode, cb);
        if (FX.innerGlow) part(FX.innerGlow.src, X, Y, FX.innerGlow.blendMode, cb);
        for (const s of FX.innerShadows) part(s.src, X, Y, s.blendMode, cb);
        if (FX.bevel) for (const b of [FX.bevel.shadow, FX.bevel.highlight]) part(b.src, X + (b.left || 0), Y + (b.top || 0), b.blendMode, cb);
        for (const s of FX.innerStrokes) part(s.src, X, Y, s.blendMode, cb);
        for (const s of FX.outerStrokes) part(s.src, X + s.left, Y + s.top, s.blendMode, cb);
      }
      i = stackEnd - 1;
    }
  };
  const ops = [];
  renderRange(ops, 0, layers.length);
  return { ops, docW, docH };
}


export function countOps(ops) { let n = 0; for (const o of ops) n += 1 + (o.ops ? countOps(o.ops) : 0); return n; }


export function needsDocPlanes(ops) {
  for (const o of ops) {
    if (o.k === 'adj' && o.plane) return true;
    if (o.mask || (o.ops && needsDocPlanes(o.ops))) return true;
  }
  return false;
}


export function executeDrawListCPU(list) {
  const { docW, docH } = list;
  const hasKnockout = ops => ops.some(o => o.knockout || (o.ops && hasKnockout(o.ops)));
  const run = (dst, ops, deepBackdrop = null) => {
    const shallow = hasKnockout(ops) ? { ...dst, data: dst.data.slice() } : null;
    let deep = deepBackdrop || shallow;
    const bases = new Map();
    const baseOf = b => { let m = bases.get(b); if (!m) { m = baseAlphaMask(b.src, b.left, b.top, docW, docH); bases.set(b, m); } return m; };
    for (const op of ops) {
      if (op.k === 'base') continue;
      if (op.k === 'clipStack') {
        const colors = createSurface(docW, docH);
        if (op.pass) colors.data.set(dst.data);
        run(colors, op.ops);
        if (op.pass) mixSurfaceByMask(dst, colors, baseOf(op), op.opacity);
        else drawContent(dst, colors, 0, 0, { opacity: op.opacity, blendMode: op.blend }, op);
        continue;
      }
      if (op.k === 'src') {
        if (op.knockout != null) { mixSurfaceByMask(dst, op.knockout === 2 ? deep : shallow, baseOf(op), op.opacity); continue; }
        const s = op.opaque ? opaqueSource(op.src) : op.clip ? clipToBase(op.src, op.left, op.top, baseOf(op.clip), docW, docH) : op.src;
        if (op.keepAlpha) drawWithLockedAlpha(dst, s, op.left, op.top, { opacity: op.opacity, blendMode: op.blend }, op.content ? op : null);
        else if (op.content) drawContent(dst, s, op.left, op.top, { opacity: op.opacity, blendMode: op.blend }, { blendIf: op.blendIf, channelsOff: op.channelsOff });
        else drawLayer(dst, s, op.left, op.top, { opacity: op.opacity, blendMode: op.blend });
        if (op.isBackground && shallow) { deep = { ...dst, data: dst.data.slice() }; shallow.data.set(dst.data); }
        continue;
      }
      if (op.k === 'adj') {
        const a = op.adjustment, adjusted = createSurface(docW, docH);
        adjusted.data.set(a.type === 'colorLookup' ? applyLutRGBA(dst.data, a.lut, a.opts) : applyAdjustment(dst.data, docW, docH, a));
        if (op.keepAlpha) for (let p = 3; p < adjusted.data.length; p += 4) adjusted.data[p] = 255;
        if (op.mask) multiplyLayerMask(adjusted.data, docW, docH, 0, 0, op.mask, op.maskOrig[0], op.maskOrig[1]);
        const c = op.clip ? clipToBase(adjusted, 0, 0, baseOf(op.clip), docW, docH) : adjusted;
        (op.keepAlpha ? drawWithLockedAlpha : drawLayer)(dst, c, 0, 0, { opacity: op.opacity, blendMode: op.blend });
        continue;
      }
      if (op.k === 'group') {
        if (op.mode === 'pass') { run(dst, op.ops, deep); continue; }
        if (op.mode === 'passMask') {
          const target = createSurface(docW, docH);
          target.data.set(dst.data);
          run(target, op.ops, deep);
          const m = op.mask, k = op.opacity, D = dst.data, T = target.data, rc = dirtyRect(target);
          for (let yy = rc.top; yy < rc.bottom; yy++) for (let xx = rc.left, q = yy * docW + rc.left, p4 = q * 4; xx < rc.right; xx++, q++, p4 += 4) {
            const al = (m[q] / 255) * k;
            if (al <= 0) continue;
            if (al >= 1) { D[p4] = T[p4]; D[p4 + 1] = T[p4 + 1]; D[p4 + 2] = T[p4 + 2]; D[p4 + 3] = T[p4 + 3]; continue; }
            for (let c = 0; c < 4; c++) D[p4 + c] = Math.round(D[p4 + c] + (T[p4 + c] - D[p4 + c]) * al);
          }
          if (dst.dirty) { const d = dst.dirty; d.left = Math.min(d.left, rc.left); d.top = Math.min(d.top, rc.top); d.right = Math.max(d.right, rc.right); d.bottom = Math.max(d.bottom, rc.bottom); }
          continue;
        }
        const target = createSurface(docW, docH), ab = op.artboard;
        if (ab && ab.color && ab.r > ab.l && ab.b > ab.t) {
          const T = target.data, c = ab.color;
          for (let yy = ab.t; yy < ab.b; yy++) for (let xx = ab.l, p4 = (yy * docW + ab.l) * 4; xx < ab.r; xx++, p4 += 4) { T[p4] = c[0]; T[p4 + 1] = c[1]; T[p4 + 2] = c[2]; T[p4 + 3] = 255; }
          const d = target.dirty; d.left = Math.min(d.left, ab.l); d.top = Math.min(d.top, ab.t); d.right = Math.max(d.right, ab.r); d.bottom = Math.max(d.bottom, ab.b);
        }
        run(target, op.ops);
        if (ab && ab.clip) {
          const T = target.data, rc = dirtyRect(target);
          for (let yy = rc.top; yy < rc.bottom; yy++) {
            const inY = yy >= ab.t && yy < ab.b;
            for (let xx = rc.left, p4 = (yy * docW + rc.left) * 4; xx < rc.right; xx++, p4 += 4) if (!inY || xx < ab.l || xx >= ab.r) T[p4 + 3] = 0;
          }
        }
        if (op.mask) {
          const m = op.mask, T = target.data, rc = dirtyRect(target);
          for (let yy = rc.top; yy < rc.bottom; yy++) for (let xx = rc.left, q = yy * docW + rc.left; xx < rc.right; xx++, q++)
            if (m[q] !== 255) T[q * 4 + 3] = Math.round(T[q * 4 + 3] * m[q] / 255);
        }
        drawLayer(dst, target, 0, 0, { opacity: op.opacity, blendMode: op.blend, region: dirtyRect(target) });
      }
    }
  };
  const surf = createSurface(docW, docH);
  run(surf, list.ops);
  return surf;
}

export default { createDrawListState, markDirty, buildDrawList, executeDrawListCPU, countOps, needsDocPlanes, layerMaskPlane };
