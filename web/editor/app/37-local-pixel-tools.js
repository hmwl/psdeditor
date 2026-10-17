




import './36-clipboard-frame.js';   
import { ART_STYLES, regionMask, tolPct255 } from '../../../core/brush-engine.js';
import { blendPixelRGB } from '../../../core/compose.js';
import {
  blendHistoryPixel, mixPaint, sourcePixel, averageSample, consumeMixerLoad,
} from '../../../core/remaining-brush.js';
import { shell } from '../shell.js';
import { SAMPLE_BAR_ICONS } from '../toolfix-icons.js';
import {
  $, BRUSH, BRUSHM, SELECT, ellipseSelection, ensureLazy, isEmptySelection, kick, lassoSelection,
  magicWandSelection, rectSelection, selectionValueAt,
} from './01-boot.js';
import {
  curStroke, doc, docH, docW, layerTree, li, pixelPaint, selDrag, selection, set_curStroke, set_selDrag,
  set_selPathCache, set_selection,
} from './02-doc-state.js';
import { actRecord } from './03-history.js';
import { isBackgroundLayer, unlockBackground } from './05-layer-lock-guides.js';
import { spaceDown } from './06-view-zoom-move.js';
import { PAINT_WARP_WHY, paintMap, srcBoxOfDocRect } from './11-paint-common.js';
import { selLayer } from './23-layers-panel.js';
import { effLock, humanEditError } from './24-layer-ops-queue.js';
import {
  MIX_G, artHistoryOpts, bgRGB, docTool, fgRGB, historySourceFor, historySourceInfo, loadMixerBrush,
  mixerAmount, mixerCarry, mixerOpts, mixerReservoir, mixerTile, set_mixerTile, tileOfColor,
} from './31-selection-brush.js';
import {
  brushCursor, combineInto, deselect, dispPx, doWand, effSelMode, modKeys, mqOpts, mqSizePx, sampleRGBA,
  selDragRect, selOpts, selReady, setSelection, strokeAnts, syncAnts, updateSelInfo,
} from './32-cursors-select-options.js';
import { magEffWidth, magHover, magLasso, magOpts, polyLasso, set_polyLasso } from './33-lasso-quick-select.js';
import {
  artStamp, beginStroke, brushTarget, emitDab, ensurePixelPaint, paintGuard, scheduleStrokeRepaint, stampDab,
} from './38-brush-engine.js';
import { MY_PAINT_TOOLS, beginPencilStroke, effFlow, effOpacity } from './39-brush-options.js';
import { dispThr, drawGizmo, gizmo } from './46-smart-filter-panel.js';
import {
  cloneSrc, csBeginStroke, csCur, csMap, csSetSample, retouchSampleImage, rtFillPatternSelect, rtPatternImage,
  rtPatternList, set_csOverlayCache, toggleCloneSrcPanel,
} from './53-retouch-clone-pattern.js';
import { retouchApply, rtIconInto } from './54-gestures-hints.js';























export const BRUSHOP_TOOLS = new Set(['pencil', 'cloneStamp', 'patternStamp', 'backgroundEraser',
                               'colorReplace', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'mixerBrush', 'historyBrush', 'historyArtBrush']);
const BRUSHOP_LABEL = {
  pencil: '铅笔', cloneStamp: '仿制图章', patternStamp: '图案图章', backgroundEraser: '背景橡皮擦',
  magicEraser: '魔术橡皮擦', colorReplace: '颜色替换', blur: '模糊', sharpen: '锐化', smudge: '涂抹',
  dodge: '减淡', burn: '加深', sponge: '海绵', mixerBrush: '混合器画笔', historyBrush: '历史记录画笔', historyArtBrush: '历史记录艺术画笔',
};


export const BRUSHOP_SAMPLES = new Set(['cloneStamp']);
export const boOpts = {
  sample: 'layer',          
  align: true,              
  pattern: '',              
  tolerance: 30,            
  protect: false,           
  replaceMode: 'color',     
  spongeMode: 'desaturate', 
  strength: 0.5,            
  strengthBy: { blur: 0.5, sharpen: 0.5, smudge: 0.5, sponge: 0.5 },   
  retouchMode: 'normal',    
  allLayers: false,         
  protectDetail: true,      
  finger: false,            
  range: 'midtones',        
  exposure: 0.5,            
  protectTones: true,       
  airbrush: false,          
  vibrance: true,           
  
  csSample: 'layer',        
  csIgnoreAdj: false,       
  csMode: 'norm',           
  
  psMode: 'norm', impressionist: false, patAligned: true,
};

export const crOpts = { sampling: 'continuous', limit: 'contiguous', tolerance: 30, antialias: true };
export const bgeOpts = { sampling: 'continuous', limit: 'contiguous', tolerance: 50 };
export const meOpts = { tolerance: 32, antialias: true, contiguous: true, allLayers: false, opacity: 100 };
const boStrength = kind => (boOpts.strengthBy[kind] != null ? boOpts.strengthBy[kind] : boOpts.strength);
export let boSample = null;        
export let boOffset = null;        
export function set_boOffset(v) { return (boOffset = v); }   

export function brushOpWhy(){
  const g = paintGuard();
  if (g) return g;
  if (brushTarget() === 'mask') return `${BRUSHOP_LABEL[docTool] || '这把工具'}只作用在图层像素上（把「作用于」切回「图层像素」）`;
  if (docTool.startsWith('history')) {
    if (historySourceInfo && (historySourceInfo.width !== docW || historySourceInfo.height !== docH)) return '历史源的文档尺寸与当前不同，请重新设源';
    const src=historySourceFor(selLayer), pp=pixelPaint[selLayer], dl=doc.layers[selLayer];
    if (!src || src.w !== (pp?.w || dl.width) || src.h !== (pp?.h || dl.height) || src.left !== (pp?.left ?? dl.bounds.left) || src.top !== (pp?.top ?? dl.bounds.top)) return '历史源与当前图层尺寸或原点不同，请重新设源';
  }
  if (docTool === 'cloneStamp' && !csCur()) return '先按住 Alt 在画布上点一下取样（取要仿制的地方）';
  if (BRUSHOP_SAMPLES.has(docTool) && docTool !== 'cloneStamp' && !boSample)
    return `先按住 Alt 在画布上点一下取样（${docTool === 'cloneStamp' ? '取要仿制的地方' : '取要作用的颜色'}）`;
  return '';
}



export function boPatternImage(){
  const list = rtPatternList();
  const pick = list.find(p => p.id === boOpts.pattern) || list.find(p => p.name === boOpts.pattern) || list[0];
  return pick ? rtPatternImage(pick.id) : null;
}

function boMergedSnapshot(){
  try { return sampleRGBA(true); } catch { return null; }
}





export function brushOpFn(kind, S){
  const base = S.base, buf = S.buf, w = S.w, h = S.h;
  const put = (i, rgb, alpha) => {
    const o = i * 4;
    buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2];
    if (alpha !== undefined) buf[o + 3] = alpha;
  };
  const mix = (i, na, rgb) => {                    
    const o = i * 4;
    put(i, [0, 1, 2].map(c => Math.round(base[o + c] + (rgb[c] - base[o + c]) * na)));
  };
  if (kind === 'historyBrush') {
    const src = S.historySource;
    return (s, i, na) => { const o = i * 4; buf.set(blendHistoryPixel(Array.from(base.subarray(o, o + 4)), sourcePixel(src, i % w, Math.floor(i / w), 1), na), o); };
  }
  if (kind === 'historyArtBrush') {
    


    S.skipStamp = true;
    const src = S.historySource, style = (ART_STYLES.find(a => a[0] === artHistoryOpts.style) || ART_STYLES[0])[2];
    const lumAt = (x, y) => { const c = sourcePixel(src, x, y, 1); return c[0] * .299 + c[1] * .587 + c[2] * .114; };
    S.beforeDab = (cx, cy) => {
      const iv = S.inv, A = Math.max(1, artHistoryOpts.area), r = Math.max(.75, S.radius);
      const n = Math.max(1, Math.min(14, Math.round(A * A / (r * r * 12)) + 1));
      for (let k = 0; k < n; k++) {
        const ang = S.rand() * Math.PI * 2, dist = Math.sqrt(S.rand()) * A;
        let x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
        const sx = iv[0] * x + iv[2] * y + iv[4], sy = iv[1] * x + iv[3] * y + iv[5];
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const col = sourcePixel(src, sx, sy, 1);
        if (col[3] < 8) continue;
        if (artHistoryOpts.tolerance > 0) {
          const o = (Math.floor(sy) * w + Math.floor(sx)) * 4;
          const d = Math.max(Math.abs(buf[o] - col[0]), Math.abs(buf[o + 1] - col[1]), Math.abs(buf[o + 2] - col[2]));
          if (d < artHistoryOpts.tolerance * 2.55) continue;
        }
        const len = Math.max(r, style.len * r * 2), steps = Math.max(1, Math.round(len / Math.max(.75, r * .5)));
        let dir = S.rand() * Math.PI * 2, curl = (S.rand() < .5 ? -1 : 1) * style.curl * .35;
        for (let j = 0; j <= steps; j++) {
          artStamp(S, x, y, r, col, S.opacity * S.flow);
          const qx = iv[0] * x + iv[2] * y + iv[4], qy = iv[1] * x + iv[3] * y + iv[5];
          const gx = lumAt(qx + 1, qy) - lumAt(qx - 1, qy), gy = lumAt(qx, qy + 1) - lumAt(qx, qy - 1);
          if (style.tight > 0 && (gx || gy)) {
            let t = Math.atan2(gx, -gy);                           
            if (Math.cos(t - dir) < 0) t += Math.PI;
            dir = dir + (t - dir) * style.tight + (S.rand() - .5) * (1 - style.tight) * 1.2;
          } else dir += (S.rand() - .5) * 1.2;
          dir += curl;
          const st = len / steps; x += Math.cos(dir) * st; y += Math.sin(dir) * st;
        }
      }
    };
    return () => {};
  }
  if (kind === 'mixerBrush') {
    if (mixerOpts.autoLoad) loadMixerBrush();
    S.iterative = true; S.mixerAmount = mixerAmount;
    if (!mixerTile) set_mixerTile(tileOfColor(mixerReservoir || [...fgRGB, 255]));
    S.mixerTile = mixerTile;                                    
    S.mixerPickup = mixerOpts.autoClean ? null : (Array.isArray(mixerCarry) && mixerCarry.length === MIX_G * MIX_G ? mixerCarry.map(c => c && c.slice()) : null);
    S.mixerSource = mixerOpts.allLayers ? {data:sampleRGBA(true), w:docW,h:docH} : null;
    const G = MIX_G;
    S.beforeDab = (cx, cy, D) => {
      const r = D ? D.r : S.radius, cs = D ? D.cos : 1, sn = D ? D.sin : 0, iv = S.inv;
      const cell = Math.max(1, Math.min(3, Math.round(2 * r / G)));
      const pick = S.mixerPickup || (S.mixerPickup = new Array(G * G).fill(null));
      const loaded = S.loaded = S.loaded && S.loaded.length === G * G ? S.loaded : new Array(G * G);
      const amt = S.mixerAmount, wet = mixerOpts.wet, mix = mixerOpts.mix;
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        const u = (gx + .5) / G * 2 - 1, v = (gy + .5) / G * 2 - 1, k = gy * G + gx;
        if (u * u + v * v > 1.1) { loaded[k] = [0, 0, 0, 0]; continue; }
        const X = cx + (u * cs - v * sn) * r, Y = cy + (u * sn + v * cs) * r;
        const target = (S.mixerSource ? averageSample(S.mixerSource, X, Y, cell) : averageSample({ data: buf, w, h }, iv[0] * X + iv[2] * Y + iv[4], iv[1] * X + iv[3] * Y + iv[5], cell)) || [0, 0, 0, 0];
        if (wet > 0) pick[k] = pick[k] ? blendHistoryPixel(pick[k], target, wet) : target;
        const res = S.mixerTile[k];
        if (wet > 0 && target[3] > 0) S.mixerTile[k] = blendHistoryPixel(res, target, wet * mix * .04);   
        const load = res.slice(); load[3] *= amt;
        loaded[k] = mixPaint(load, pick[k] || [0, 0, 0, 0], wet, mix);
      }
      S.mixDab = { cx, cy, r, cs, sn };
      S.mixerAmount = consumeMixerLoad(S.mixerAmount, S.spacing, mixerOpts.load);
    };
    return (s, i, na, px, py) => {
      const m = s.mixDab; if (!m) return;
      const dx = px - m.cx, dy = py - m.cy, u = (dx * m.cs + dy * m.sn) / m.r, v = (-dx * m.sn + dy * m.cs) / m.r;
      const gx = Math.max(0, Math.min(G - 1, Math.floor((u + 1) / 2 * G))), gy = Math.max(0, Math.min(G - 1, Math.floor((v + 1) / 2 * G)));
      const paint = s.loaded[gy * G + gx]; if (!paint) return;
      const o = i * 4, ca = na * paint[3] / 255, ba = buf[o + 3] / 255, a = ca + ba * (1 - ca);
      for (let k = 0; k < 3; k++) buf[o + k] = a ? Math.round((paint[k] * ca + buf[o + k] * ba * (1 - ca)) / a) : 0;
      buf[o + 3] = Math.round(a * 255); };
  }
  

  const putSrc = (i, na, c, mode, px, py) => {
    const o = i * 4;
    let ca = na * (c[3] / 255);
    if (mode === 'diss') ca = ca > ((((Math.floor(px) * 73856093) ^ (Math.floor(py) * 19349663)) >>> 0) % 4096) / 4096 ? 1 : 0;
    const ba = base[o + 3] / 255, oa = ca + ba * (1 - ca);
    if (oa <= 0) { buf[o + 3] = 0; return; }
    let rgb = c;
    if (mode && mode !== 'norm' && mode !== 'diss' && ba > 0) {
      const bl = blendPixelRGB(mode, [base[o], base[o + 1], base[o + 2]], c);
      rgb = [0, 1, 2].map(k => c[k] * (1 - ba) + bl[k] * ba);
    }
    for (let k = 0; k < 3; k++) buf[o + k] = Math.round((rgb[k] * ca + base[o + k] * ba * (1 - ca)) / oa);
    buf[o + 3] = Math.round(oa * 255);
  };
  if (kind === 'cloneStamp') {
    const src = S.cloneSrc;                        
    const map = S.cloneMap;                        
    const mode = boOpts.csMode;
    return (S2, i, na, px, py) => {
      const u = map(px, py);
      let c = null;
      

      if (src) c = BRUSHM.cloneAt(src.data, src.w, src.h, u.x - 0.5, u.y - 0.5);
      else {
        

        const iv = S2.inv;
        c = BRUSHM.cloneAt(base, w, h, iv[0] * u.x + iv[2] * u.y + iv[4] - 0.5, iv[1] * u.x + iv[3] * u.y + iv[5] - 0.5);
      }
      if (!c) return;
      putSrc(i, na, c, mode, px, py);
    };
  }
  if (kind === 'patternStamp') {
    const pat = S.pattern, org = S.patOrigin || { x: 0, y: 0 }, mode = boOpts.psMode;
    return (S2, i, na, px, py) => {
      
      const c = S2.impColor || (pat && BRUSHM.patternAt(pat, px - org.x, py - org.y));
      if (!c) return;
      putSrc(i, na, c, mode, px, py);
    };
  }
  if (kind === 'backgroundEraser' || kind === 'colorReplace') {
    




    const o2 = kind === 'colorReplace' ? crOpts : bgeOpts;
    const tol = tolPct255(o2.tolerance), soft = kind === 'colorReplace' && !crOpts.antialias ? 0 : Math.max(1, tol / 2);
    const prot = kind === 'backgroundEraser' && boOpts.protect ? fgRGB.slice() : null;
    const tgt = fgRGB.slice(), mode = boOpts.replaceMode;
    const px3 = i => { const o = i * 4; return [base[o], base[o + 1], base[o + 2]]; };
    const weight = (i, smp) => {
      const o = i * 4;
      if (base[o + 3] === 0) return 0;
      const d = Math.max(Math.abs(base[o] - smp[0]), Math.abs(base[o + 1] - smp[1]), Math.abs(base[o + 2] - smp[2]));
      return d <= tol ? 1 : (soft && d < tol + soft) ? (tol + soft - d) / soft : 0;
    };
    const lumB = i => base[i * 4] * .299 + base[i * 4 + 1] * .587 + base[i * 4 + 2] * .114;
    const edgeAt = i => { const x = i % w, y = (i / w) | 0; if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
      return Math.abs(lumB(i + 1) - lumB(i - 1)) + Math.abs(lumB(i + w) - lumB(i - w)) > 60; };
    S.crSample = o2.sampling === 'swatch' ? bgRGB.slice() : null;
    S.region = null;
    S.beforeDab = (cx, cy, D) => {
      const iv = S.inv, sx = Math.floor(iv[0] * cx + iv[2] * cy + iv[4]), sy = Math.floor(iv[1] * cx + iv[3] * cy + iv[5]);
      const inside = sx >= 0 && sy >= 0 && sx < w && sy < h;
      if (o2.sampling === 'continuous' || (o2.sampling === 'once' && !S.crSample)) {
        if (inside && base[(sy * w + sx) * 4 + 3] > 0) S.crSample = px3(sy * w + sx);
        else if (o2.sampling === 'continuous') S.crSample = null;
      }
      S.region = null;
      if (o2.limit !== 'discontiguous' && S.crSample && inside) {
        const r = D ? D.r : S.radius;
        const b = srcBoxOfDocRect(iv, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
        const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(w - 1, b.x1), y1 = Math.min(h - 1, b.y1);
        const smp = S.crSample;
        const mask = regionMask(w, h, x0, y0, x1, y1, sx, sy, i => weight(i, smp) > 0, o2.limit === 'findEdges' ? edgeAt : null);
        S.region = { x0, y0, W: x1 - x0 + 1, H: y1 - y0 + 1, mask };
      }
    };
    const inRegion = i => { const R = S.region; if (!R) return o2.limit === 'discontiguous';
      const x = i % w - R.x0, y = ((i / w) | 0) - R.y0; return x >= 0 && y >= 0 && x < R.W && y < R.H && R.mask[y * R.W + x] === 1; };
    if (kind === 'backgroundEraser') return (S2, i, na) => {
      const smp = S.crSample; if (!smp || !inRegion(i)) return;
      let k = weight(i, smp); if (k <= 0) return;
      if (prot) { const o = i * 4; if (Math.max(Math.abs(base[o] - prot[0]), Math.abs(base[o + 1] - prot[1]), Math.abs(base[o + 2] - prot[2])) <= tol) return; }
      const o = i * 4; buf[o + 3] = Math.round(base[o + 3] * (1 - na * k));
    };
    return (S2, i, na) => {
      const smp = S.crSample; if (!smp || !inRegion(i)) return;
      const k = weight(i, smp); if (k <= 0) return;
      const c = BRUSHM.replaceColorPixel(px3(i), px3(i), tgt, 255, mode);
      if (c) mix(i, na * k, c);
    };
  }
  



  if (kind === 'blur' || kind === 'sharpen' || kind === 'smudge' || kind === 'dodge' || kind === 'burn' || kind === 'sponge') {
    S.iterative = true; S.flow = 1; S.opacity = 1;
  }
  const merged = (kind === 'blur' || kind === 'sharpen' || kind === 'smudge') && boOpts.allLayers ? S.merged : null;
  if (kind === 'blur' || kind === 'sharpen') {
    const st = boStrength(kind);
    const r = kind === 'blur' ? Math.max(1, Math.min(4, Math.round(S.radius / 20))) : 1;
    
    const k0 = kind === 'blur' ? st * st * 0.8 + st * 0.2 : (st * st * 0.6 + st * 0.3) * 0.5;
    const amt = kind === 'sharpen' ? (boOpts.protectDetail ? 0.9 : 0.6) : 0;
    const mode = boOpts.retouchMode;
    

    S.beforeDab = (cx, cy) => {
      const R = S.radius + r + 1;
      if (merged) {
        

        const x0 = Math.max(0, Math.floor(cx - R)), y0 = Math.max(0, Math.floor(cy - R));
        const x1 = Math.min(docW, Math.ceil(cx + R) + 1), y1 = Math.min(docH, Math.ceil(cy + R) + 1);
        if (x1 <= x0 || y1 <= y0) { S.msnap = null; return; }
        const sw = x1 - x0, sh = y1 - y0, snap = new Uint8ClampedArray(sw * sh * 4);
        for (let yy = 0; yy < sh; yy++) snap.set(merged.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x1) * 4), yy * sw * 4);
        S.msnap = { data: snap, x0, y0, w: sw, h: sh };
        return;
      }
      const bx = srcBoxOfDocRect(S.inv, { x: cx - R, y: cy - R, width: R * 2, height: R * 2 });
      const x0 = Math.max(0, bx.x0), y0 = Math.max(0, bx.y0), x1 = Math.min(w, bx.x1 + 1), y1 = Math.min(h, bx.y1 + 1);
      if (x1 <= x0 || y1 <= y0) { S.snap = null; return; }
      const sw = x1 - x0, sh = y1 - y0, snap = new Uint8ClampedArray(sw * sh * 4);
      for (let yy = 0; yy < sh; yy++) snap.set(buf.subarray(((y0 + yy) * w + x0) * 4, ((y0 + yy) * w + x1) * 4), yy * sw * 4);
      S.snap = { data: snap, x0, y0, w: sw, h: sh };
    };
    return (S2, i, na, px, py) => {
      const o = i * 4, x = i % w, y = (i / w) | 0;
      let c;
      let mo = -1;
      if (merged) {
        const mx = Math.max(0, Math.min(docW - 1, Math.floor(px))), my = Math.max(0, Math.min(docH - 1, Math.floor(py)));
        const sn = S2.msnap; if (!sn) return;
        const sx = mx - sn.x0, sy = my - sn.y0;
        if (sx < 0 || sy < 0 || sx >= sn.w || sy >= sn.h) return;
        c = kind === 'blur' ? BRUSHM.boxBlurAt(sn.data, sn.w, sn.h, sx, sy, r) : BRUSHM.sharpenAt(sn.data, sn.w, sn.h, sx, sy, r, amt, { protect: boOpts.protectDetail });
        mo = (my * docW + mx) * 4;
      } else {
        const sn = S2.snap; if (!sn) return;
        c = kind === 'blur' ? BRUSHM.boxBlurAt(sn.data, sn.w, sn.h, x - sn.x0, y - sn.y0, r)
                            : BRUSHM.sharpenAt(sn.data, sn.w, sn.h, x - sn.x0, y - sn.y0, r, amt, { protect: boOpts.protectDetail });
      }
      const cur = [buf[o], buf[o + 1], buf[o + 2]];
      const res = BRUSHM.retouchModeMix(mode, cur, c);
      const k = na * k0;
      put(i, [0, 1, 2].map(ch => Math.round(cur[ch] + (res[ch] - cur[ch]) * k)),
          kind === 'blur' && !merged ? Math.round(buf[o + 3] + (c[3] - buf[o + 3]) * k) : undefined);
      if (mo >= 0) for (let ch = 0; ch < 3; ch++) merged[mo + ch] = Math.round(merged[mo + ch] + (c[ch] - merged[mo + ch]) * k);   
    };
  }
  if (kind === 'smudge') {
    


    const st = boStrength('smudge');
    const finger = !!boOpts.finger !== !!S.altToggle;
    const mode = boOpts.retouchMode;
    const R = Math.ceil(S.radius) + 1, D = R * 2 + 1;
    

    S.spacing = Math.min(S.spacing, Math.max(0.01, 2 / (S.radius * 2)));
    S.beforeDab = (cx, cy) => {
      S.dabC = { x: cx, y: cy };
      if (S.nextPatch) { S.patch = S.nextPatch; S.nextPatch = S.patch.slice(); return; }
      const pt = new Float32Array(D * D * 4);
      for (let yy = 0; yy < D; yy++) for (let xx = 0; xx < D; xx++) {
        const q = (yy * D + xx) * 4;
        if (finger) { pt[q] = fgRGB[0]; pt[q + 1] = fgRGB[1]; pt[q + 2] = fgRGB[2]; pt[q + 3] = 255; continue; }
        const dx = cx + xx - R, dy = cy + yy - R;
        let c;
        if (merged) c = BRUSHM.cloneAt(merged, docW, docH, Math.max(0, Math.min(docW - 1, dx)), Math.max(0, Math.min(docH - 1, dy)));
        else { const iv = S.inv; c = BRUSHM.cloneAt(buf, w, h, iv[0] * dx + iv[2] * dy + iv[4] - 0.5, iv[1] * dx + iv[3] * dy + iv[5] - 0.5); }
        if (c) { pt[q] = c[0]; pt[q + 1] = c[1]; pt[q + 2] = c[2]; pt[q + 3] = c[3]; }
      }
      S.patch = pt; S.nextPatch = pt.slice();
    };
    return (S2, i, na, px, py) => {
      const P = S2.patch, C = S2.dabC; if (!P || !C) return;
      const ox = Math.round(px - C.x) + R, oy = Math.round(py - C.y) + R;
      if (ox < 0 || oy < 0 || ox >= D || oy >= D) return;
      const q = (oy * D + ox) * 4, o = i * 4;
      

      let mo = -1;
      if (merged) {
        const mx = Math.floor(px), my = Math.floor(py);
        if (mx >= 0 && my >= 0 && mx < docW && my < docH) mo = (my * docW + mx) * 4;
      }
      const d = mo >= 0 ? [merged[mo], merged[mo + 1], merged[mo + 2], merged[mo + 3]] : [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]];
      let r2 = BRUSHM.smudgeDab([P[q], P[q + 1], P[q + 2], P[q + 3]], d, st, na);
      if (mode !== 'normal') { const m2 = BRUSHM.retouchModeMix(mode, d, r2); r2 = [m2[0], m2[1], m2[2], r2[3]]; }
      buf[o] = r2[0]; buf[o + 1] = r2[1]; buf[o + 2] = r2[2]; buf[o + 3] = r2[3];
      if (mo >= 0) { merged[mo] = r2[0]; merged[mo + 1] = r2[1]; merged[mo + 2] = r2[2]; merged[mo + 3] = Math.max(merged[mo + 3], r2[3]); }
      const N = S2.nextPatch; N[q] = r2[0]; N[q + 1] = r2[1]; N[q + 2] = r2[2]; N[q + 3] = r2[3];
    };
  }
  


  const perDab = e => Math.pow(1 + Math.max(0, Math.min(1, e)), 1 / Math.max(1, 0.6 / Math.max(0.01, S.spacing))) - 1;
  if (kind === 'dodge' || kind === 'burn') {
    const mode = kind;                             
    const e = perDab(boOpts.exposure), prot = boOpts.protectTones;
    return (S2, i, na) => {
      const o = i * 4, cur = [buf[o], buf[o + 1], buf[o + 2]];
      const c = BRUSHM.dodgeBurnPixel(cur, e, mode, boOpts.range, prot);
      put(i, [0, 1, 2].map(ch => Math.round(cur[ch] + (c[ch] - cur[ch]) * na)));
    };
  }
  if (kind === 'sponge') {
    
    const n = Math.max(1, 0.6 / Math.max(0.01, S.spacing)), k = boStrength('sponge');
    const f = boOpts.spongeMode === 'desaturate' ? 1 - Math.pow(1 - Math.min(0.999, k), 1 / n) : perDab(k);
    return (S2, i, na) => {
      const o = i * 4, cur = [buf[o], buf[o + 1], buf[o + 2]];
      const c = BRUSHM.spongePixel(cur, f, boOpts.spongeMode, boOpts.vibrance);
      put(i, [0, 1, 2].map(ch => Math.round(cur[ch] + (c[ch] - cur[ch]) * na)));
    };
  }
  return null;
}


export function beginBrushOpStroke(pt, ev){
  const kind = docTool;
  const why = brushOpWhy();
  if (why) { $('#err').textContent = `${BRUSHOP_LABEL[kind] || '这把工具'}用不了：` + why; syncBrushOpBar(); return null; }
  

  if (kind === 'pencil') return beginPencilStroke(pt);          
  if (!BRUSHM && !['mixerBrush','historyBrush','historyArtBrush'].includes(kind)) { kick(BRUSH); shell.status(BRUSH.statusText()); return null; }
  
  if (kind === 'backgroundEraser' && isBackgroundLayer(selLayer)) unlockBackground(selLayer);
  const historySrc = kind.startsWith('history') ? historySourceFor(selLayer) : null;
  const S = beginStroke(pt, { op: kind, deferDab: true, opacity: effOpacity(kind), flow: effFlow(kind) });
  if (!S) return null;
  
  S.altToggle = !!(ev && ev.altKey);
  let opKind = kind;
  if (S.altToggle && kind === 'blur') opKind = 'sharpen';
  else if (S.altToggle && kind === 'sharpen') opKind = 'blur';
  else if (S.altToggle && kind === 'dodge') opKind = 'burn';
  else if (S.altToggle && kind === 'burn') opKind = 'dodge';
  if (boOpts.allLayers && (kind === 'blur' || kind === 'sharpen' || kind === 'smudge')) S.merged = boMergedSnapshot();
  if (kind === 'cloneStamp') {
    
    if (boOpts.csSample !== 'layer') {
      const m = retouchSampleImage(boOpts.csSample === 'merged' ? 'all' : boOpts.csSample, boOpts.csIgnoreAdj);
      if (m) S.cloneSrc = { data: m, w: docW, h: docH };
    }
    

    const cs = csBeginStroke(pt, boOpts.align), anchor = { ...cs.anchor };
    S.cloneMap = (px, py) => csMap(cs, anchor, px, py);
    boOffset = { x: anchor.x - cs.x, y: anchor.y - cs.y };
  }
  if (kind === 'patternStamp') {
    S.pattern = boPatternImage();
    S.patOrigin = boOpts.patAligned ? { x: 0, y: 0 } : { x: pt.x, y: pt.y };     
    if (boOpts.impressionist && S.pattern) {
      const pat = S.pattern, org = S.patOrigin;
      S.beforeDab = (cx, cy) => {
        const j = S.radius * 0.6;
        S.impColor = BRUSHM.patternAt(pat, cx + (Math.random() * 2 - 1) * j - org.x, cy + (Math.random() * 2 - 1) * j - org.y);
      };
    }
  }
  
  if ((kind === 'cloneStamp' || kind === 'patternStamp') && boOpts.airbrush) {
    S.airTimer = setInterval(() => {
      if (curStroke !== S) { clearInterval(S.airTimer); return; }
      stampDab(S, S.last.x, S.last.y); scheduleStrokeRepaint(S);
    }, 60);
  }
  if (BRUSHOP_SAMPLES.has(kind) && kind !== 'cloneStamp') S.sampleRGB = sampleColorAt(boSample) || fgRGB.slice();
  S.smudge = null; S.historySource = historySrc; S.label = BRUSHOP_LABEL[opKind];
  S.opFn = brushOpFn(opKind, S);
  

  if (boOpts.airbrush && (kind === 'dodge' || kind === 'burn' || kind === 'sponge')) {
    const tick = setInterval(() => {
      if (curStroke !== S) { clearInterval(tick); return; }
      stampDab(S, S.last.x, S.last.y); scheduleStrokeRepaint(S);
    }, 60);
  }
  if (!S.opFn && kind !== 'pencil') { set_curStroke(null); $('#err').textContent = `${BRUSHOP_LABEL[kind]}没有落笔算子（这是个 bug，请反馈）`; return null; }
  
  emitDab(S, pt.x, pt.y, S.lastP);
  return S;
}

function sampleColorAt(p){
  if (!p) return null;
  try {
    const px = sampleRGBA(boOpts.sample === 'merged' || docTool !== 'cloneStamp');
    const x = Math.max(0, Math.min(docW - 1, Math.round(p.x))), y = Math.max(0, Math.min(docH - 1, Math.round(p.y)));
    const o = (y * docW + x) * 4;
    return [px[o], px[o + 1], px[o + 2]];
  } catch { return null; }
}

export function brushOpSample(pt){
  if (docTool === 'cloneStamp') csSetSample(pt);   
  boSample = { x: pt.x, y: pt.y };
  boOffset = null;                                 
  syncBrushOpBar(); drawGizmo();
  shell.status(`${BRUSHOP_LABEL[docTool] || ''}取样点：${Math.round(pt.x)}, ${Math.round(pt.y)}`);
  return true;
}


export async function magicEraseAt(pt, ev){
  const g = paintGuard();
  if (g) { $('#err').textContent = '魔术橡皮擦用不了：' + g; return false; }
  if (brushTarget() === 'mask') { $('#notice').textContent = '魔术橡皮擦只作用在图层像素上。'; return false; }
  if (!await ensureLazy(SELECT, '魔术橡皮擦')) return false;
  
  if (isBackgroundLayer(selLayer)) unlockBackground(selLayer);
  const idx = selLayer;
  const pp = ensurePixelPaint(idx);
  if (!pp) { $('#err').textContent = '魔术橡皮擦用不了：这一层没有可改的像素'; return false; }
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) { $('#err').textContent = '魔术橡皮擦用不了：' + PAINT_WARP_WHY; return false; }
  const x = Math.max(0, Math.min(docW - 1, Math.round(pt.x))), y = Math.max(0, Math.min(docH - 1, Math.round(pt.y)));
  let px = null;
  try { px = sampleRGBA(meOpts.allLayers); } catch { px = null; }
  if (!px) { $('#err').textContent = '魔术橡皮擦用不了：读不到画面像素'; return false; }
  
  const contiguous = meOpts.contiguous !== !!(ev && ev.shiftKey);
  let sel = null;
  try {
    sel = magicWandSelection(px, docW, docH, x, y, { tolerance: meOpts.tolerance, contiguous, antialias: meOpts.antialias });
  } catch (e) { $('#err').textContent = '魔术橡皮擦没算出来：' + humanEditError(e && e.message || e); return false; }
  if (!sel || isEmptySelection(sel)) { shell.status('这一片算下来是空的（容差太小？）'); return false; }
  
  const L0 = layerTree && layerTree.flat && layerTree.flat[idx];
  const lockAlpha = !!(L0 && effLock(idx, L0, 'lockTransparency', 'transparency'));
  const op = Math.max(0, Math.min(100, meOpts.opacity)) / 100, bg = bgRGB.slice();
  const label = '魔术橡皮擦';
  let n = 0;
  const okDone = retouchApply(label, (rgba, w, h) => {
    const out = Uint8ClampedArray.from(rgba);
    for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
      const dx = map.M[0] * (sx + 0.5) + map.M[2] * (sy + 0.5) + map.M[4];
      const dy = map.M[1] * (sx + 0.5) + map.M[3] * (sy + 0.5) + map.M[5];
      const cov = selectionValueAt(sel, Math.floor(dx), Math.floor(dy));
      if (!cov) continue;
      const o = (sy * w + sx) * 4, k = cov / 255 * op;
      if (lockAlpha) { for (let c = 0; c < 3; c++) out[o + c] = Math.round(out[o + c] + (bg[c] - out[o + c]) * k); n++; continue; }
      const next = Math.round(out[o + 3] * (1 - k));
      if (next !== out[o + 3]) { out[o + 3] = next; n++; }
    }
    return out;
  });
  if (okDone) shell.status(`魔术橡皮擦：${lockAlpha ? '换成背景色' : '擦掉'} ${n} 个像素（容差 ${meOpts.tolerance}${contiguous ? '' : '，不连续'}）`);
  return okDone;
}

export function drawBrushOpGizmo(ctx){
  if (li || !doc) return;
  if (!BRUSHOP_SAMPLES.has(docTool) || (docTool !== 'cloneStamp' && !boSample)) return;
  let p = boSample;
  if (docTool === 'cloneStamp') {                  
    const cs = csCur(); if (!cs) return;
    const c = curStroke ? curStroke.last : brushCursor;
    p = cs.anchor && c ? csMap(cs, cs.anchor, c.x, c.y) : cs;
  }
  const r = dispThr(6);
  ctx.save();
  ctx.lineWidth = dispPx(1);
  ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
  ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
  ctx.restore();
}

const RETOUCH_MODE_OPTS = [['normal', '正常'], ['darken', '变暗'], ['lighten', '变亮'], ['hue', '色相'], ['saturation', '饱和度'], ['color', '颜色'], ['luminosity', '明度']];
const BO_MODE_OPTS = {
  colorReplace: [['hue', '色相'], ['saturation', '饱和度'], ['color', '颜色'], ['luminosity', '明度']],
  sponge: [['desaturate', '去色'], ['saturate', '加色']],
  blur: RETOUCH_MODE_OPTS, sharpen: RETOUCH_MODE_OPTS, smudge: RETOUCH_MODE_OPTS,   
};
const boModeKey = kind => kind === 'sponge' ? 'spongeMode' : (kind === 'blur' || kind === 'sharpen' || kind === 'smudge') ? 'retouchMode' : 'replaceMode';
export function syncBrushOpBar(){
  const g = $('#grpBrushOps'); if (!g) return;
  const kind = docTool;
  const on = BRUSHOP_TOOLS.has(kind) || kind === 'magicEraser';
  g.hidden = !on;
  if (!on) return;
  const show = (id, v) => { const el = $(id); if (el) el.hidden = !v; };
  show('#boSampleWrap', false);                 
  show('#boCloneSrcBtn', kind === 'cloneStamp');
  show('#boBlendWrap', kind === 'cloneStamp' || kind === 'patternStamp');
  show('#boAirbrush', kind === 'cloneStamp' || kind === 'patternStamp');
  show('#boAlignWrap', kind === 'cloneStamp' || kind === 'patternStamp');
  show('#boCsSampleWrap', kind === 'cloneStamp');
  show('#boPatternWrap', kind === 'patternStamp');
  show('#boImpWrap', kind === 'patternStamp');
  { const bl = $('#boBlend'); if (bl) bl.value = kind === 'patternStamp' ? boOpts.psMode : boOpts.csMode; }
  { const al = $('#boAlign'); if (al) al.checked = kind === 'patternStamp' ? boOpts.patAligned : boOpts.align; }
  { const cs = $('#boCsSample'); if (cs) cs.value = boOpts.csSample === 'merged' ? 'all' : boOpts.csSample; }
  { const ia = $('#boCsIgnoreAdj'); if (ia) { ia.classList.toggle('on', boOpts.csIgnoreAdj); ia.disabled = boOpts.csSample === 'layer'; } }
  { const ab = $('#boAirbrush'); if (ab) ab.classList.toggle('on', boOpts.airbrush); }
  { const im = $('#boImp'); if (im) im.checked = boOpts.impressionist; }
  show('#boTolWrap', kind === 'magicEraser');
  
  const crb = kind === 'colorReplace' || kind === 'backgroundEraser', o2 = kind === 'colorReplace' ? crOpts : bgeOpts;
  show('#boSampModeWrap', crb); show('#boLimitWrap', crb); show('#boTolPctWrap', crb);
  show('#boAAWrap', kind === 'colorReplace' || kind === 'magicEraser');
  show('#boContigWrap', kind === 'magicEraser'); show('#boAllWrap', kind === 'magicEraser'); show('#boOpWrap', kind === 'magicEraser');
  if (crb) {
    for (const b of $('#boSampMode').children) b.classList.toggle('on', b.dataset.v === o2.sampling);
    $('#boLimit').value = o2.limit;
    if (document.activeElement !== $('#boTolPct')) $('#boTolPct').value = o2.tolerance;
  }
  if (kind === 'colorReplace') $('#boAA').checked = crOpts.antialias;
  if (kind === 'magicEraser') {
    $('#boAA').checked = meOpts.antialias; $('#boContig').checked = meOpts.contiguous; $('#boAll').checked = meOpts.allLayers;
    if (document.activeElement !== $('#boOp')) $('#boOp').value = meOpts.opacity;
    if (document.activeElement !== $('#boTol')) $('#boTol').value = meOpts.tolerance;
  }
  show('#boProtectWrap', kind === 'backgroundEraser');
  show('#boModeWrap', !!BO_MODE_OPTS[kind]);
  const bss = kind === 'blur' || kind === 'sharpen' || kind === 'smudge', tone = kind === 'dodge' || kind === 'burn';
  show('#boStrengthWrap', bss || kind === 'sponge');
  show('#boAllLayersWrap', bss);
  show('#boProtectDetailWrap', kind === 'sharpen');
  show('#boFingerWrap', kind === 'smudge');
  show('#boRangeWrap', tone);
  show('#boExposureWrap', tone);
  show('#boAirbrush', tone || kind === 'sponge' || kind === 'cloneStamp' || kind === 'patternStamp');   
  show('#boProtectTonesWrap', tone);
  show('#boVibranceWrap', kind === 'sponge');
  
  if (bss || kind === 'sponge') {
    const v = Math.round(boStrength(kind) * 100), el = $('#boStrength');
    if (el && document.activeElement !== el) el.value = v;
    const lab = $('#boStrengthVal'); if (lab) lab.textContent = v + '%';
    const nm = $('#boStrengthLab'); if (nm) nm.textContent = kind === 'sponge' ? '流量:' : '强度:';
  }
  { const set = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
    set('#boAllLayers', boOpts.allLayers); set('#boProtectDetail', boOpts.protectDetail); set('#boFinger', boOpts.finger);
    set('#boProtectTones', boOpts.protectTones); set('#boVibrance', boOpts.vibrance);
    const ab = $('#boAirbrush'); if (ab) ab.classList.toggle('on', !!boOpts.airbrush);
    const ex = $('#boExposure'); if (ex && document.activeElement !== ex) { ex.value = Math.round(boOpts.exposure * 100); const l = $('#boExposureVal'); if (l) l.textContent = ex.value + '%'; }
    const rg = $('#boRange'); if (rg) rg.value = boOpts.range; }
  show('#boSampleBtn', BRUSHOP_SAMPLES.has(kind) && kind !== 'cloneStamp');   
  
  const mSel = $('#boMode');
  if (mSel && BO_MODE_OPTS[kind] && mSel.dataset.kind !== kind) {
    mSel.dataset.kind = kind; mSel.innerHTML = '';
    for (const [v, label] of BO_MODE_OPTS[kind]) mSel.append(Object.assign(document.createElement('option'), { value: v, textContent: label }));
  }
  if (mSel && BO_MODE_OPTS[kind]) mSel.value = boOpts[boModeKey(kind)];
  
  const pSel = $('#boPattern');
  if (pSel && kind === 'patternStamp') {
    const byName = rtPatternList().find(p => p.name === boOpts.pattern && p.id !== boOpts.pattern);
    if (byName) boOpts.pattern = byName.id;                 
    boOpts.pattern = rtFillPatternSelect(pSel, boOpts.pattern);
  }
  const why = kind === 'magicEraser' ? (paintGuard() || '') : brushOpWhy();
  const info = $('#boInfo');
  if (info) {
    info.textContent = why || (
      kind === 'cloneStamp' ? `源 ${cloneSrc.active + 1}：${Math.round(csCur().x)},${Math.round(csCur().y)} · Alt 点画布重新取样`
      : kind === 'magicEraser' ? ''
      : MY_PAINT_TOOLS.has(kind) ? ''                      
      : BRUSHOP_SAMPLES.has(kind) ? `取样 ${Math.round(boSample.x)},${Math.round(boSample.y)}`
      : `${BRUSHOP_LABEL[kind]}：按住拖`);
    info.title = ['blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge'].includes(kind)
      ? '与 PS 一样逐印迭代：在同一处来回涂会持续累积' + (kind === 'dodge' || kind === 'burn' ? '；按住 Alt = 临时换成' + (kind === 'dodge' ? '加深' : '减淡')
        : kind === 'blur' || kind === 'sharpen' ? '；按住 Alt = 临时换成' + (kind === 'blur' ? '锐化' : '模糊') : kind === 'smudge' ? '；按住 Alt = 临时手指绘画' : '')
      : 'PS 在同一笔里是反复叠加的；这里一笔之内读的是「落笔那一刻」的像素，'
      + '到不透明度就停 —— 松手再涂一笔可以继续加深。这样一笔的结果与手速无关、可重放。';
    info.classList.toggle('why', !!why);
  }
  if (g.dataset.bound) return;
  g.dataset.bound = '1';
  const bindSel = (id, set) => { const el = $(id); if (el) el.addEventListener('change', () => { set(el.value); syncBrushOpBar(); }); };
  const bindChk = (id, set) => { const el = $(id); if (el) el.addEventListener('change', () => { set(el.checked); syncBrushOpBar(); }); };
  const bindNum = (id, set, min, max) => { const el = $(id); if (el) el.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, +el.value || min)); el.value = v; set(v); syncBrushOpBar(); }); };
  const bindRange = (id, valId, set) => { const el = $(id), lab = $(valId); if (!el) return;
    el.addEventListener('input', () => { const v = +el.value; set(v / 100); if (lab) lab.textContent = v + '%'; }); };
  bindSel('#boSample', v => { boOpts.sample = v; });
  bindChk('#boAlign', v => { if (docTool === 'patternStamp') boOpts.patAligned = v; else { boOpts.align = v; if (!v) boOffset = null; } });
  bindSel('#boBlend', v => { if (docTool === 'patternStamp') boOpts.psMode = v; else boOpts.csMode = v; });
  bindSel('#boCsSample', v => { boOpts.csSample = v; set_csOverlayCache(null); drawGizmo(); });
  bindChk('#boImp', v => { boOpts.impressionist = v; });
  { const ia = $('#boCsIgnoreAdj'); if (ia) { rtIconInto(ia, 'IgnoreAdjustments', '忽略调整图层'); ia.addEventListener('click', () => { boOpts.csIgnoreAdj = !boOpts.csIgnoreAdj; set_csOverlayCache(null); syncBrushOpBar(); drawGizmo(); }); } }
  { const ab = $('#boAirbrush'); if (ab) { rtIconInto(ab, 'ToolAirbrush', '喷枪'); ab.addEventListener('click', () => { boOpts.airbrush = !boOpts.airbrush; syncBrushOpBar(); }); } }
  { const cb = $('#boCloneSrcBtn'); if (cb) { rtIconInto(cb, 'CloneSourcePanel', '切换仿制源面板'); cb.addEventListener('click', () => toggleCloneSrcPanel()); } }
  bindSel('#boPattern', v => { boOpts.pattern = v; });
  bindNum('#boTol', v => { boOpts.tolerance = v; meOpts.tolerance = v; }, 0, 255);
  const crbOpts = () => docTool === 'colorReplace' ? crOpts : bgeOpts;
  for (const b of $('#boSampMode').children) {
    b.addEventListener('click', () => { crbOpts().sampling = b.dataset.v; syncBrushOpBar(); });
    
    const ic = SAMPLE_BAR_ICONS[b.dataset.v];
    if (ic) { const img = document.createElement('img'); img.src = ic[0]; img.height = ic[1]; img.alt = b.textContent; img.style.cssText = 'display:block;pointer-events:none'; b.replaceChildren(img); }
  }
  bindSel('#boLimit', v => { crbOpts().limit = v; });
  bindNum('#boTolPct', v => { crbOpts().tolerance = v; }, 1, 100);
  bindChk('#boAA', v => { if (docTool === 'magicEraser') meOpts.antialias = v; else crOpts.antialias = v; });
  bindChk('#boContig', v => { meOpts.contiguous = v; });
  bindChk('#boAll', v => { meOpts.allLayers = v; });
  bindNum('#boOp', v => { meOpts.opacity = v; }, 1, 100);
  bindChk('#boProtect', v => { boOpts.protect = v; });
  bindSel('#boMode', v => { boOpts[boModeKey(docTool)] = v; });
  bindRange('#boStrength', '#boStrengthVal', v => { boOpts.strength = v; if (boOpts.strengthBy[docTool] != null) boOpts.strengthBy[docTool] = v; });
  bindSel('#boRange', v => { boOpts.range = v; });
  bindRange('#boExposure', '#boExposureVal', v => { boOpts.exposure = v; });
  bindChk('#boVibrance', v => { boOpts.vibrance = v; });
  bindChk('#boAllLayers', v => { boOpts.allLayers = v; });
  bindChk('#boProtectDetail', v => { boOpts.protectDetail = v; });
  bindChk('#boFinger', v => { boOpts.finger = v; });
  bindChk('#boProtectTones', v => { boOpts.protectTones = v; });
  
  const sb = $('#boSampleBtn');
  if (sb) sb.addEventListener('click', () => shell.status('按住 Alt 在画布上点一下就取样'));
}

export function syncMagBar(){
  const g = $('#magOpts'); if (!g) return;
  g.hidden = docTool !== 'lassoMagnetic';
  if (g.hidden) return;
  for (const [id, k] of [['#magWidth', 'width'], ['#magContrast', 'contrast'], ['#magFreq', 'frequency']]) {
    const e = $(id); if (e && document.activeElement !== e) e.value = String(magOpts[k]);
  }
  const mp0 = $('#magPen'); if (mp0) mp0.classList.toggle('on', !!magOpts.pen);
  if (g.dataset.bound) return;
  g.dataset.bound = '1';
  const bind = (id, key, min, max) => {
    const el = $(id); if (!el) return;
    el.value = magOpts[key];
    el.addEventListener('change', () => { magOpts[key] = Math.max(min, Math.min(max, +el.value || magOpts[key])); el.value = magOpts[key]; });
  };
  bind('#magWidth', 'width', 1, 256); bind('#magContrast', 'contrast', 1, 100); bind('#magFreq', 'frequency', 0, 100);
  const mp = $('#magPen'); if (mp) mp.classList.toggle('on', !!magOpts.pen);
}

export function drawLassoGizmo(ctx){
  if (polyLasso) {
    const st = polyLasso;
    strokeAnts(ctx, c => {
      c.beginPath();
      c.moveTo(st.pts[0].x, st.pts[0].y);
      for (let i = 1; i < st.pts.length; i++) c.lineTo(st.pts[i].x, st.pts[i].y);
      if (st.cur) c.lineTo(st.cur.x, st.cur.y);
      if (st.pts.length >= 3) c.lineTo(st.pts[0].x, st.pts[0].y);
    }, null);
    magDot(ctx, st.pts[0], true);                 
    return;
  }
  if (magLasso) {
    const st = magLasso;
    strokeAnts(ctx, c => {
      c.beginPath();
      c.moveTo(st.path[0].x, st.path[0].y);
      for (let i = 1; i < st.path.length; i++) c.lineTo(st.path[i].x, st.path[i].y);
      const pv = st.preview || [];
      for (let i = 0; i < pv.length; i++) c.lineTo(pv[i].x, pv[i].y);
    }, null);
    for (const a of st.anchors) magDot(ctx, a, false);   
    magDot(ctx, st.anchors[0], true);                    
  }
  
  if (docTool === 'lassoMagnetic' && magHover && magHover.caps) {
    ctx.save(); ctx.lineWidth = dispPx(1);
    for (const [c, o] of [['rgba(0,0,0,.85)', 0.5], ['rgba(255,255,255,.95)', 0]]) {
      ctx.beginPath(); ctx.arc(magHover.x, magHover.y, Math.max(0.5, magEffWidth() - o * dispPx(1)), 0, Math.PI * 2); ctx.strokeStyle = c; ctx.stroke();
    }
    ctx.restore();
  }
}
function magDot(ctx, p, big){
  if (!p) return;
  const r = dispThr(big ? 3.5 : 2.2);
  ctx.save();
  ctx.fillStyle = big ? '#fff' : '#ffd400';
  ctx.strokeStyle = '#000'; ctx.lineWidth = dispPx(1);
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
}



export function shiftSelection(sel, dx, dy){
  return sel ? { ...sel, x: sel.x + Math.round(dx), y: sel.y + Math.round(dy) } : sel;
}
export function beginSelDrag(ev, pt){
  
  if (!selReady('选区工具')) return;
  
  
  const fixedSize = (docTool === 'selRect' || docTool === 'selEllipse') && mqOpts.style === 'size';
  if (selection && ['selRect', 'selEllipse', 'selRow', 'selCol', 'lasso', 'wand'].includes(docTool) && !fixedSize && effSelMode(ev) === 'replace'
      && selectionValueAt(selection, Math.floor(pt.x), Math.floor(pt.y)) > 0) {
    set_selDrag({ moveSel: true, orig: selection, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, pts: [], wandAt: docTool === 'wand' ? { x: pt.x, y: pt.y } : null });
    gizmo.setPointerCapture && gizmo.setPointerCapture(ev.pointerId);
    return;
  }
  


  const MQ = docTool === 'selRect' || docTool === 'selEllipse';
  set_selDrag({ tool: docTool, mode: effSelMode(ev), x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y,
              square: false, shiftFreed: !ev.shiftKey, altFreed: !ev.altKey, pts: [{ x: pt.x, y: pt.y }],
              style: MQ ? mqOpts.style : 'normal', ratio: mqOpts.w > 0 ? mqOpts.h / mqOpts.w : 1, sizeW: mqSizePx().w, sizeH: mqSizePx().h });
  gizmo.setPointerCapture && gizmo.setPointerCapture(ev.pointerId);
  drawGizmo();
}
export function moveSelDrag(ev, pt){
  if (selDrag.moveSel) {
    let dx = pt.x - selDrag.x0, dy = pt.y - selDrag.y0;
    if (ev.shiftKey) {                               
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy);
      const c = Math.cos(a), s2 = Math.sin(a);
      if (Math.abs(c) < 1e-9) { dx = 0; dy = Math.sign(s2) * L; } else if (Math.abs(s2) < 1e-9) { dx = Math.sign(c) * L; dy = 0; }
      else { const m = L / Math.SQRT2; dx = Math.sign(c) * m; dy = Math.sign(s2) * m; }
    }
    selDrag.x1 = pt.x; selDrag.y1 = pt.y;
    set_selection(shiftSelection(selDrag.orig, dx, dy)); selDrag.dx = dx; selDrag.dy = dy;
    set_selPathCache(null); syncAnts(); drawGizmo(); updateSelInfo();
    return;
  }
  
  if (spaceDown) { selDrag.x0 += pt.x - selDrag.x1; selDrag.y0 += pt.y - selDrag.y1; }
  selDrag.x1 = pt.x; selDrag.y1 = pt.y;
  if (!ev.shiftKey) selDrag.shiftFreed = true;
  selDrag.square = !!ev.shiftKey && selDrag.shiftFreed;
  
  if (!ev.altKey) selDrag.altFreed = true;
  if (ev.altKey && selDrag.altFreed) selDrag.altFreedOnce = true;     
  selDrag.center = !!ev.altKey && !!selDrag.altFreed && selDrag.tool !== 'lasso';
  if (selDrag.tool === 'lasso') {
    const last = selDrag.pts[selDrag.pts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 1) selDrag.pts.push({ x: pt.x, y: pt.y });
  }
  drawGizmo();
}
export function endSelDrag(){
  const d = selDrag; set_selDrag(null);
  if (!d || !docW) { drawGizmo(); return; }
  if (d.moveSel) {
    const moved = Math.round(d.dx || 0) || Math.round(d.dy || 0);
    set_selection(d.orig); set_selPathCache(null);
    if (moved) setSelection(shiftSelection(d.orig, d.dx, d.dy), { label: '移动选区' });
    else if (d.wandAt) doWand(d.wandAt, 'replace');    
    else deselect();                                   
    return;
  }
  

  if (d.tool === 'lasso' && modKeys.alt && d.altFreedOnce && d.pts.length >= 2) {
    const last = d.pts[d.pts.length - 1];
    set_polyLasso({ tool: 'lasso', pts: d.pts.slice(), mode: d.mode, cur: { ...last }, free: false, fromLasso: true });
    shell.status('套索：按住 Alt 单击画直线段，按住拖动画自由线；松开 Alt 闭合');
    drawGizmo();
    return;
  }
  const o = selOpts();
  try {
    let sel = null;
    if (d.tool === 'lasso') {
      if (d.pts.length >= 3) sel = lassoSelection(docW, docH, d.pts, o);
    } else {
      const r = selDragRect(d);
      if (r.w >= 1 && r.h >= 1) sel = (d.tool === 'selEllipse' ? ellipseSelection : rectSelection)(docW, docH, r.x, r.y, r.w, r.h, o);
    }
    if (!sel) { if (d.mode === 'replace') deselect(); else drawGizmo(); return; }   
    combineInto(sel, d.mode);
    if (d.tool !== 'lasso') { const r = selDragRect(d); actRecord('selectShape', { mode: d.mode, ellipse: d.tool === 'selEllipse', top: r.y, left: r.x, bottom: r.y + r.h, right: r.x + r.w, feather: o.feather || 0, antiAlias: o.antialias !== false }); }
  } catch (e) { $('#err').textContent = '这个选区建不起来：' + humanEditError(e && e.message || e); drawGizmo(); }
}
