




import './34-perspective-crop-slice.js';   
import { onDocumentCacheRelease } from '../document-cache.js';
import { parsePsdFull } from '../../../core/app.js';
import { parseAdditionalBlock } from '../../../core/psd-additional.js';
import { shell } from '../shell.js';
import { $, EDIT, applyEdits, ensureLazy } from './01-boot.js';
import {
  doc, docH, docName, docStack, docW, layerDeletes, layerDupes, layerRenames, layerTree, li, origBuffer, sos,
  textOverlay,
} from './02-doc-state.js';
import {
  docHistLock, set_docHistLock, set_uiQuiet, structuralApply, structuralBegin, structuralDone, uiQuiet,
} from './03-history.js';
import { padB, padL, padR, padT, withViewHold } from './04-view-chrome.js';
import { transformableLayers } from './08-doc-size.js';
import {
  builtIndexOf, dupTimer, duplicateLayerBlockUI, duplicateLayerUI, refreshAll, set_dupPending,
} from './20-snap-smart-object.js';
import { initDocument } from './21-load-document.js';
import { matchLayer } from './22-deform-tools.js';
import { layerOrderView, renderLayerPanel, selLayer, selLayers, set_selLayer } from './23-layers-panel.js';
import { humanEditError } from './24-layer-ops-queue.js';
import { ensureLayerTransform, transformChanged } from './28-layer-props-transform.js';
import { docTool, setDocTool } from './31-selection-brush.js';
import { modKeys, syncGizmoCursor } from './32-cursors-select-options.js';
import {
  abAutoGrowCanvas, abPending, abRectOp, abSelected, abShownRect, abSnapshot, createArtboard, set_abPending,
  syncArtboardBar, writeArtboardRect,
} from './36-clipboard-frame.js';
import { dispThr, drawGizmo } from './46-smart-filter-panel.js';
import { closeInlineText } from './47-canvas-context-menu.js';
import { buildPsdBuffer } from './48-info-export.js';



















export let artboardCache = { buf: null, list: [] };
onDocumentCacheRelease(() => { artboardCache = { buf: null, list: [] }; });
export function set_artboardCache(v) { return (artboardCache = v); }   
export let abState = null;        
export function set_abState(v) { return (abState = v); }   
export let abSel = -1;            
export function set_abSel(v) { return (abSel = v); }   
export let abHoverCur = '';        
export function set_abHoverCur(v) { return (abHoverCur = v); }   
export let abSnap = [];           

export const AB_PRESETS = [
  ['custom', '自定', 0, 0, ''],
  ['iphone16promax', 'iPhone 16 Pro Max', 1320, 2868, '手机'],
  ['iphone16pro', 'iPhone 16 Pro', 1206, 2622, '手机'],
  ['iphone16plus', 'iPhone 16 Plus', 1290, 2796, '手机'],
  ['iphone15', 'iPhone 16 / 15', 1179, 2556, '手机'],
  ['iphonex', 'iPhone X / XS / 11 Pro', 1125, 2436, '手机'],
  ['iphonese', 'iPhone SE', 750, 1334, '手机'],
  ['android1080', 'Android 1080p', 1080, 1920, '手机'],
  ['android1440', 'Android 1440p', 1440, 3200, '手机'],
  ['ipadpro13', 'iPad Pro 13"', 2064, 2752, '平板'],
  ['ipad', 'iPad Pro 11"', 1668, 2420, '平板'],
  ['ipadair', 'iPad Air 11"', 1640, 2360, '平板'],
  ['ipadmini', 'iPad mini', 1488, 2266, '平板'],
  ['surface', 'Surface Pro', 2880, 1920, '平板'],
  ['webmin', '网页 - 最小', 1024, 768, '网页'],
  ['webmed', '网页 - 中等', 1280, 800, '网页'],
  ['web1366', '网页 - 常用', 1366, 768, '网页'],
  ['web1440', '网页 - MacBook', 1440, 900, '网页'],
  ['weblarge', '网页 - 大', 1920, 1080, '网页'],
  ['watch45', 'Apple Watch 45mm', 396, 484, '手表'],
  ['watch41', 'Apple Watch 41mm', 352, 430, '手表'],
  ['square', '社交 - 正方形', 1080, 1080, '社交'],
  ['portrait45', '社交 - 竖版 4:5', 1080, 1350, '社交'],
  ['story', '社交 - 快拍 9:16', 1080, 1920, '社交'],
  ['icon1024', '图标 1024', 1024, 1024, '图标'],
  ['icon512', '图标 512', 512, 512, '图标'],
  ['icon180', 'iOS 图标 180', 180, 180, '图标'],
  ['icon192', 'Android 图标 192', 192, 192, '图标'],
  ['icon32', 'Favicon 32', 32, 32, '图标'],
  ['a4', 'A4 300ppi', 2480, 3508, '印刷'],
];

export const AB_BG = [[1, '白色'], [2, '黑色'], [3, '透明'], [4, '其它…']];
export const abOpts = {
  preset: 'custom', w: 1080, h: 1920,           
  bgType: 1, color: [255, 255, 255],
  show: true,                                   
  autoNest: true,                               
  snap: true,                                   
  autoSize: true,                               
  keepRel: true,                                
};
const AB_GAP = 100;                             



export function docArtboards(){
  if (!origBuffer || !doc) return [];
  if (artboardCache.buf === origBuffer) return artboardCache.list;
  const list = [];
  try {
    const full = parsePsdFull(origBuffer);
    const u8 = origBuffer instanceof Uint8Array ? origBuffer : new Uint8Array(origBuffer);
    full.layers.forEach((L, index) => {
      const blk = (L.blocks || []).find(x => x.key === 'artb') || (L.blocks || []).find(x => x.key === 'abdd')
               || (L.blocks || []).find(x => x.key === 'artd');
      if (!blk) return;
      let m = null;
      try { m = parseAdditionalBlock(blk.key, u8.subarray(blk.dataOffset, blk.dataOffset + blk.dataLength)); } catch { m = null; }
      const d = m && m.desc;
      const rc = d && d.artboardRect;
      if (!rc) return;
      const c = d['Clr '] || {};
      const fileName = L.unicodeName || L.name || '画板';
      list.push({
        index, key: blk.key,
        get name(){ return layerRenames[index] || fileName; },   
        presetName: typeof d.artboardPresetName === 'string' ? d.artboardPresetName : '',
        rect: { x: +rc.Left || 0, y: +rc['Top '] || 0, w: (+rc.Rght || 0) - (+rc.Left || 0), h: (+rc.Btom || 0) - (+rc['Top '] || 0) },
        color: [Math.round(+c['Rd  '] || 0), Math.round(+c['Grn '] || 0), Math.round(+c['Bl  '] || 0)],
        bgType: Number.isFinite(+d.artboardBackgroundType) ? +d.artboardBackgroundType : 1,
      });
    });
  } catch {  }
  artboardCache = { buf: origBuffer, list };
  if (doc && doc.layers) {
    for (const L of doc.layers) if (L && L.artboard) delete L.artboard;
    for (const ab of list) { const L = doc.layers[ab.index]; if (L) L.artboard = { rect: { ...ab.rect }, bgType: ab.bgType, color: ab.color.slice() }; }
  }
  return list;
}

export function artboardMembers(headerIndex){
  try {
    const node = layerOrderView().nodes[headerIndex];
    if (node && node.group && node.block && node.block.ids.length >= 2)
      return node.block.ids.filter(i => i !== headerIndex && !layerDeletes.has(i));
  } catch {  }
  const flat = layerTree && layerTree.flat;
  if (!flat) return [];
  const out = [];
  let depth = 0;
  for (let i = headerIndex - 1; i >= 0; i--) {
    const gt = flat.find(x => x.index === i);
    const type = gt ? gt.groupType : null;
    if (type === 1 || type === 2) { depth++; out.push(i); continue; }
    if (type === 3) { if (depth === 0) break; depth--; out.push(i); continue; }
    out.push(i);
  }
  return out;
}
export function artboardWriteWhy(){
  if (!doc) return '先打开一个文档';
  if (li) return '正在编辑智能对象：先退回文档视图';
  if (!origBuffer) return '还没载入文档字节';
  return '';
}




const AB_HANDLE_CURSOR = { n: 'stretchV', s: 'stretchV', e: 'stretchH', w: 'stretchH', nw: 'resizeNWSE', se: 'resizeNWSE', ne: 'resizeNESW', sw: 'resizeNESW' };
export function abCursorName(){
  const st = abState;
  if (st) {
    if (st.kind === 'move') return st.alt ? 'abCopy' : 'abDrag';
    if (st.kind === 'resize') return AB_HANDLE_CURSOR[st.handle] || '';
    return '';
  }
  if (abPending) return abPending.kind === 'dup' ? 'abCopy' : abPending.kind === 'move' ? 'abDrag' : '';                 
  if (abHoverCur === 'ab') return modKeys.alt ? 'abCopy' : 'moveArrow';
  return AB_HANDLE_CURSOR[abHoverCur] || '';
}
export function abHit(pt){
  const list = docArtboards();
  
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i].rect;
    if (pt.x >= r.x && pt.x < r.x + Math.max(dispThr(60), r.w * 0.6) && pt.y >= r.y - dispThr(16) && pt.y < r.y) return i;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i].rect;
    if (pt.x >= r.x && pt.y >= r.y && pt.x < r.x + r.w && pt.y < r.y + r.h) return i;
  }
  return -1;
}

export function abGizmoOn(){
  if (li || !doc) return false;
  if (docTool === 'artboard') return true;
  if (docTool !== 'move') return false;
  const k = docArtboards().findIndex(a => a.index === selLayer);
  if (k < 0) return false;
  abSel = k; return true;
}

export function abTitleHit(pt){
  const list = docArtboards();
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i].rect;
    if (pt.x >= r.x && pt.x < r.x + Math.max(dispThr(60), r.w * 0.6) && pt.y >= r.y - dispThr(18) && pt.y < r.y) return i;
  }
  return -1;
}
export function abHandleAt(pt){
  if (abSel < 0 || !abGizmoOn()) return null;
  const ab = docArtboards()[abSel]; if (!ab) return null;
  const r = ab.rect, t = Math.max(dispThr(5), 3);
  const X = [r.x, r.x + r.w / 2, r.x + r.w], Y = [r.y, r.y + r.h / 2, r.y + r.h];
  const NAMES = [['nw', 'n', 'ne'], ['w', '', 'e'], ['sw', 's', 'se']];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (!NAMES[j][i]) continue;
    if (Math.abs(pt.x - X[i]) <= t && Math.abs(pt.y - Y[j]) <= t) return NAMES[j][i];
  }
  return null;
}

export function abPlusSpots(){
  
  if (!abGizmoOn() || abSel < 0 || abState) return [];
  const list = docArtboards(), ab = list[abSel]; if (!ab) return [];
  const r = abShownRect(ab), off = dispThr(46), m = dispThr(14), R = dispThr(12), gapPad = dispThr(4);
  
  const cx = v => Math.max(m - padL(), Math.min(docW + padR() - m, v)), cy = v => Math.max(m - padT(), Math.min(docH + padB() - m, v));
  

  const others = list.filter((a, k) => k !== abSel).map(a => a.rect);
  const gapTo = side => {
    let best = Infinity;
    for (const o of others) {
      const ovX = o.x < r.x + r.w && o.x + o.w > r.x, ovY = o.y < r.y + r.h && o.y + o.h > r.y;
      const d = side === 'right' && ovY ? o.x - (r.x + r.w) : side === 'left' && ovY ? r.x - (o.x + o.w)
              : side === 'bottom' && ovX ? o.y - (r.y + r.h) : side === 'top' && ovX ? r.y - (o.y + o.h) : Infinity;
      if (d >= -1 && d < best) best = Math.max(0, d);
    }
    return best;
  };
  
  const dist = (side, want, lead = 0) => {
    const g = gapTo(side);
    if (g === Infinity || g >= want + R + gapPad) return want;
    if (g < lead + 2 * R + 2 * gapPad) return null;
    return lead + (g - lead) / 2;
  };
  const name = dispThr(18);
  const spots = [];
  const put = (side, d, f) => { if (d != null) spots.push({ side, ...f(d) }); };
  put('top', dist('top', off + name, name), d => ({ x: cx(r.x + r.w / 2), y: cy(r.y - d) }));
  put('right', dist('right', off), d => ({ x: cx(r.x + r.w + d), y: cy(r.y + r.h / 2) }));
  put('bottom', dist('bottom', off), d => ({ x: cx(r.x + r.w / 2), y: cy(r.y + r.h + d) }));
  put('left', dist('left', off), d => ({ x: cx(r.x - d), y: cy(r.y + r.h / 2) }));
  return spots;
}
export function abPlusAt(pt){
  const R = dispThr(12);
  return abPlusSpots().find(s => Math.hypot(pt.x - s.x, pt.y - s.y) <= R) || null;
}

function abSnapRect(r, skipIndex, edges){
  abSnap = [];
  if (!abOpts.snap) return r;
  const th = dispThr(6);
  const xs = [0, docW], ys = [0, docH];
  for (const a of docArtboards()) {
    if (a.index === skipIndex) continue;
    xs.push(a.rect.x, a.rect.x + a.rect.w); ys.push(a.rect.y, a.rect.y + a.rect.h);
  }
  const best = (vals, targets) => {
    let hit = null;
    for (const v of vals) for (const t of targets) {
      const d = t - v.v;
      if (Math.abs(d) <= th && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, px: t, which: v.which };
    }
    return hit;
  };
  const out = { ...r };
  const X = [], Y = [];
  if (edges.includes('l')) X.push({ v: r.x, which: 'l' });
  if (edges.includes('r')) X.push({ v: r.x + r.w, which: 'r' });
  if (edges.includes('t')) Y.push({ v: r.y, which: 't' });
  if (edges.includes('b')) Y.push({ v: r.y + r.h, which: 'b' });
  const bx = best(X, xs), by = best(Y, ys);
  const whole = edges.endsWith('*');           
  if (bx) {
    if (whole) out.x += bx.d;
    else if (bx.which === 'l') { out.x += bx.d; out.w -= bx.d; }
    else out.w += bx.d;
    abSnap.push({ vertical: true, px: bx.px });
  }
  if (by) {
    if (whole) out.y += by.d;
    else if (by.which === 't') { out.y += by.d; out.h -= by.d; }
    else out.h += by.d;
    abSnap.push({ vertical: false, px: by.px });
  }
  return out;
}

export function abBarSize(){
  const p = AB_PRESETS.find(q => q[0] === abOpts.preset);
  if (p && p[2] > 0) return { w: p[2], h: p[3] };
  return { w: Math.max(1, Math.round(abOpts.w) || 1), h: Math.max(1, Math.round(abOpts.h) || 1) };
}
export function abPresetName(w, h){
  const p = AB_PRESETS.find(q => q[2] === w && q[3] === h) || AB_PRESETS.find(q => q[2] === h && q[3] === w);
  return p ? p[1] : '自定';
}
export function artboardDown(ev, pt){
  const why = artboardWriteWhy();
  if (why) { $('#notice').textContent = why; return; }
  abSnap = [];
  const plus = abPlusAt(pt);
  if (plus) { abState = { kind: 'plus', side: plus.side, from: { ...pt }, alt: !!(ev && ev.altKey) }; return; }
  const handle = abHandleAt(pt);
  if (handle) { const a0 = docArtboards()[abSel]; abState = { kind: 'resize', handle, base: { ...a0.rect }, from: { ...pt }, cur: { ...a0.rect }, snap: abSnapshot(a0) }; return; }
  const hit = abHit(pt);
  if (hit >= 0) {
    abSel = hit;
    const ab = docArtboards()[hit];
    set_selLayer(ab.index); selLayers.clear(); renderLayerPanel();
    abState = { kind: 'move', base: { ...ab.rect }, from: { ...pt }, cur: { ...ab.rect }, moved: false, alt: !!(ev && ev.altKey),   
      snap: abSnapshot(ab) };
    syncArtboardBar(); drawGizmo();
    return;
  }
  
  abSel = -1;
  if (docArtboards().some(a => a.index === selLayer)) { set_selLayer(-1); selLayers.clear(); renderLayerPanel(); }
  abState = { kind: 'new', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, dragged: false, shift: !!(ev && ev.shiftKey) };
  syncArtboardBar(); drawGizmo();
}
export function artboardMove(pt, ev){
  const st = abState; if (!st) return;
  if (st.kind === 'plus') return;
  if (st.kind === 'new') {
    if (!st.dragged && Math.hypot(pt.x - st.x0, pt.y - st.y0) < dispThr(4)) return;
    st.dragged = true;
    let x1 = pt.x, y1 = pt.y;
    
    if (st.c == null) st.c = { x: st.x0, y: st.y0 };
    st.x0 = st.c.x; st.y0 = st.c.y;
    if (ev && ev.shiftKey) {                   
      const s = Math.max(Math.abs(x1 - st.x0), Math.abs(y1 - st.y0));
      x1 = st.x0 + Math.sign(x1 - st.x0 || 1) * s; y1 = st.y0 + Math.sign(y1 - st.y0 || 1) * s;
    }
    if (ev && ev.altKey) { st.x0 = 2 * st.c.x - x1; st.y0 = 2 * st.c.y - y1; }
    const r = { x: Math.min(st.x0, x1), y: Math.min(st.y0, y1), w: Math.abs(x1 - st.x0), h: Math.abs(y1 - st.y0) };
    const edges = (x1 < st.x0 ? 'l' : 'r') + (y1 < st.y0 ? 't' : 'b');
    const s = abSnapRect(r, -1, edges);
    const lx = x1 < st.x0, ty = y1 < st.y0;
    st.x0 = lx ? s.x + s.w : s.x; st.x1 = lx ? s.x : s.x + s.w;
    st.y0 = ty ? s.y + s.h : s.y; st.y1 = ty ? s.y : s.y + s.h;
    syncArtboardBar(); drawGizmo(); return;
  }
  const dx = pt.x - st.from.x, dy = pt.y - st.from.y;
  const ab = docArtboards()[abSel];
  if (st.kind === 'move') {
    if (!st.moved && Math.hypot(dx, dy) < dispThr(3)) return;
    st.moved = true;
    
    const sh = !!(ev && ev.shiftKey), hz = Math.abs(dx) >= Math.abs(dy);
    const mdx = sh && !hz ? 0 : dx, mdy = sh && hz ? 0 : dy;
    st.cur = abSnapRect({ ...st.base, x: st.base.x + mdx, y: st.base.y + mdy }, ab ? ab.index : -1, sh ? (hz ? 'lr*' : 'tb*') : 'lrtb*');
    syncArtboardBar(); drawGizmo(); return;
  }
  const b = st.base;
  let x = b.x, y = b.y, w = b.w, h = b.h;
  if (st.handle.includes('w')) { x = b.x + dx; w = b.w - dx; }
  if (st.handle.includes('e')) w = b.w + dx;
  if (st.handle.includes('n')) { y = b.y + dy; h = b.h - dy; }
  if (st.handle.includes('s')) h = b.h + dy;
  
  if (ev && ev.shiftKey && st.handle.length === 2 && b.w > 0 && b.h > 0) {
    const k = Math.max(w / b.w, h / b.h);
    const nw = b.w * k, nh = b.h * k;
    if (st.handle.includes('w')) x = b.x + b.w - nw;
    if (st.handle.includes('n')) y = b.y + b.h - nh;
    w = nw; h = nh;
  }
  if (ev && ev.altKey) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (/[we]/.test(st.handle)) { const hw = Math.max(Math.abs(x - cx), Math.abs(x + w - cx)); x = cx - hw; w = hw * 2; }
    if (/[ns]/.test(st.handle)) { const hh = Math.max(Math.abs(y - cy), Math.abs(y + h - cy)); y = cy - hh; h = hh * 2; }
  }
  let r = { x, y, w, h };
  r = abSnapRect(r, ab ? ab.index : -1,
    (st.handle.includes('w') ? 'l' : '') + (st.handle.includes('e') ? 'r' : '') + (st.handle.includes('n') ? 't' : '') + (st.handle.includes('s') ? 'b' : ''));
  if (r.w < 1) { r.x += r.w - 1; r.w = 1; }
  if (r.h < 1) { r.y += r.h - 1; r.h = 1; }
  st.cur = r;
  syncArtboardBar(); drawGizmo();
}
export async function artboardUp(){
  const st = abState; abState = null; abSnap = [];
  if (!st) return false;
  try { syncGizmoCursor(); } catch {}
  if (st.kind === 'plus') {                        
    if (st.alt) { const a = docArtboards()[abSel]; return a ? await duplicateArtboardUI(a, abFreeSpot(a.rect, st.side, { w: a.rect.w, h: a.rect.h })) : false; }
    return await addArtboardBeside(st.side);
  }
  if (st.kind === 'new') {
    let r;
    if (!st.dragged) {
      

      abSel = -1;
      try { setDocTool('move'); } catch {}
      drawGizmo();
      return false;
    } else {
      r = { x: Math.round(Math.min(st.x0, st.x1)), y: Math.round(Math.min(st.y0, st.y1)),
            w: Math.round(Math.abs(st.x1 - st.x0)), h: Math.round(Math.abs(st.y1 - st.y0)) };
      if (r.w < 4 || r.h < 4) { drawGizmo(); shell.status('画板太小了（至少 4×4 像素）'); return false; }
      abOpts.preset = 'custom'; abOpts.w = r.w; abOpts.h = r.h;   
    }
    return await createArtboard(r);
  }
  if (st.kind === 'move' && !st.moved) { drawGizmo(); return false; }   
  const r = { x: Math.round(st.cur.x), y: Math.round(st.cur.y), w: Math.round(st.cur.w), h: Math.round(st.cur.h) };
  const ab = docArtboards()[abSel];
  if (!ab) { drawGizmo(); return false; }
  

  set_abPending(st.snap ? { snap: st.snap, kind: st.alt ? 'dup' : st.kind, from: { ...st.base }, to: { ...r }, ab, buf: origBuffer } : null);
  try { syncGizmoCursor(); } catch {}
  drawGizmo();
  try {
    if (st.kind === 'move' && st.alt) return await duplicateArtboardUI(ab, r);   
    const moved = st.kind === 'move' ? { dx: r.x - ab.rect.x, dy: r.y - ab.rect.y } : null;
    return await writeArtboardRect(ab, r, moved);
  } finally { set_abPending(null); drawGizmo(); try { syncGizmoCursor(); } catch {} }
}


export let abNudgeState = null;   
export function abNudge(dx, dy){
  const ab = abSelected(); if (!ab) return;
  const why = artboardWriteWhy(); if (why) { shell.status(why); return; }
  const st = abNudgeState && abNudgeState.ab.index === ab.index ? abNudgeState : (abNudgeState = { ab, dx: 0, dy: 0, timer: 0 });
  st.dx += dx; st.dy += dy;
  clearTimeout(st.timer);
  shell.status(`移动画板：${st.dx >= 0 ? '+' : ''}${st.dx}, ${st.dy >= 0 ? '+' : ''}${st.dy} 像素`);
  drawGizmo();
  st.timer = setTimeout(async () => {
    if (abNudgeState !== st) return;
    const r = { x: st.ab.rect.x + st.dx, y: st.ab.rect.y + st.dy, w: st.ab.rect.w, h: st.ab.rect.h };
    try { if (st.dx || st.dy) await writeArtboardRect(st.ab, r, { dx: st.dx, dy: st.dy }); }
    finally { if (abNudgeState === st) abNudgeState = null; drawGizmo(); }
  }, 180);
}

export async function addArtboardBeside(side, sizeOverride){
  const list = docArtboards();
  let src = list[abSel];
  if (!src && list.length) src = list.reduce((a, b) => (b.rect.x + b.rect.w > a.rect.x + a.rect.w ? b : a));
  const size = sizeOverride || (src ? { w: src.rect.w, h: src.rect.h } : abBarSize());
  if (!src) return await createArtboard({ x: 0, y: 0, w: size.w, h: size.h });
  return await createArtboard(abFreeSpot(src.rect, side, size), { bgType: src.bgType, color: src.color });
}

function abFreeSpot(s, side, size){
  const list = docArtboards();
  const step = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side || 'right'];
  let x = step[0] > 0 ? s.x + s.w + AB_GAP : step[0] < 0 ? s.x - AB_GAP - size.w : s.x;
  let y = step[1] > 0 ? s.y + s.h + AB_GAP : step[1] < 0 ? s.y - AB_GAP - size.h : s.y;
  const overlaps = (ax, ay) => list.some(a => ax < a.rect.x + a.rect.w && ax + size.w > a.rect.x && ay < a.rect.y + a.rect.h && ay + size.h > a.rect.y);
  for (let k = 0; k < 50 && overlaps(x, y); k++) { x += step[0] * (size.w + AB_GAP); y += step[1] * (size.h + AB_GAP); }
  return { x: Math.round(x), y: Math.round(y), w: size.w, h: size.h };
}





export async function duplicateArtboardUI(ab, rect){ return withViewHold(() => duplicateArtboardUIRaw(ab, rect)); }
async function duplicateArtboardUIRaw(ab, rect){
  const why = artboardWriteWhy();
  if (why) { $('#notice').textContent = why; return false; }
  if (!ab) return false;
  if (!await ensureLazy(EDIT, '复制画板')) return false;
  if (textOverlay) closeInlineText(true);
  rect = rect || abFreeSpot(ab.rect, 'right', { w: ab.rect.w, h: ab.rect.h });
  $('#err').textContent = '';
  const prev = structuralBegin();
  const lock = docHistLock;
  try {
    set_docHistLock(true);                                  
    set_dupPending({ prev });                               
    set_uiQuiet(uiQuiet + 1);
    const copy = duplicateLayerBlockUI(ab.index);
    clearTimeout(dupTimer); set_dupPending(null);           
    if (copy < 0) throw new Error('这块画板复制不出来（组结构不完整）');
    { 
      const names = new Set(docArtboards().map(a => a.name));
      const base = ab.name + ' 拷贝';
      let nm = base; for (let k = 2; names.has(nm); k++) nm = `${base} ${k}`;
      const di = copy - (doc.layers.length - layerDupes.length);
      if (layerDupes[di]) layerDupes[di].name = nm;
      if (layerTree.flat[copy]) layerTree.flat[copy].name = nm;
    }
    const dx = rect.x - ab.rect.x, dy = rect.y - ab.rect.y;
    const node = layerOrderView().nodes[copy];
    const members = node && node.block ? node.block.ids.filter(i => i !== copy) : [];
    if (dx || dy) for (const i of members) {
      if (!transformableLayers().includes(i)) continue;
      const t = ensureLayerTransform(i); t.x += dx; t.y += dy; transformChanged(i);
    }
    const others = docArtboards();
    const grow = abAutoGrowCanvas([...others.map(a => a.rect), rect]);
    const g = grow || { dx: 0, dy: 0 };
    const mapped = others.map(a => ({ a, at: builtIndexOf(a.index) }));
    const copyAt = builtIndexOf(copy);
    const built = await buildPsdBuffer({ fast: true });
    set_uiQuiet(Math.max(0, uiQuiet - 1));
    const ops = [];
    if (grow) for (const { a, at } of mapped) if (at >= 0) ops.push(abRectOp(at, { x: a.rect.x + g.dx, y: a.rect.y + g.dy, w: a.rect.w, h: a.rect.h },
      { presetName: a.presetName || undefined, color: a.color, backgroundType: a.bgType }));
    const R = { ...rect, x: rect.x + g.dx, y: rect.y + g.dy };
    ops.push(abRectOp(copyAt, R, { presetName: ab.presetName || undefined, color: ab.color, backgroundType: ab.bgType }));
    const r = applyEdits(built.buf, ops);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear();
    set_selLayer(Math.min(copyAt, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '复制画板');
    abSel = docArtboards().findIndex(a => a.index === selLayer);
    syncArtboardBar(); drawGizmo();
    const nm = (docArtboards()[abSel] || {}).name || '画板拷贝';
    shell.status(`已复制画板「${ab.name}」→「${nm}」${R.w} × ${R.h} @${R.x},${R.y}`);
    return true;
  } catch (e) {
    set_uiQuiet(0);
    try { structuralApply(prev); } catch {}
    $('#err').textContent = '复制画板没能完成：' + humanEditError(e && e.message || e);
    return false;
  } finally { set_docHistLock(lock); }
}


export async function newSmartViaCopyUI(idx){
  if (li || !doc || idx < 0) return false;
  if (!sos.some(so => matchLayer(so) === idx)) { $('#notice').textContent = '先选中一个智能对象。'; return false; }
  if (!await ensureLazy(EDIT, '通过拷贝新建智能对象')) return false;
  if (textOverlay) closeInlineText(true);
  $('#err').textContent = '';
  const prev = structuralBegin();
  const lock = docHistLock;
  try {
    set_docHistLock(true); set_dupPending({ prev }); set_uiQuiet(uiQuiet + 1);
    const cp = duplicateLayerUI(idx, { defer: true });
    clearTimeout(dupTimer); set_dupPending(null);
    if (cp < 0) throw new Error('复制不出来');
    const at = builtIndexOf(cp);
    const built = await buildPsdBuffer({ fast: true });
    set_uiQuiet(Math.max(0, uiQuiet - 1));
    const r = applyEdits(built.buf, [{ op: 'detachSmartObject', index: at }]);
    await initDocument(r.buffer, docName, { nested: docStack.length > 0 });
    selLayers.clear(); set_selLayer(Math.min(at, doc.layers.length - 1));
    refreshAll(false);
    structuralDone(prev, '通过拷贝新建智能对象');
    shell.status('已通过拷贝新建智能对象：它有自己的一份内嵌文件，改它不影响原件');
    return true;
  } catch (e) {
    set_uiQuiet(0); clearTimeout(dupTimer); set_dupPending(null);
    try { structuralApply(prev); } catch {}
    $('#err').textContent = '通过拷贝新建智能对象没能完成：' + humanEditError(e && e.message || e);
    return false;
  } finally { set_docHistLock(lock); }
}

export function artboardOfLayer(i){
  if (li || i < 0) return null;
  const list = docArtboards(); if (!list.length) return null;
  const view = layerOrderView();
  let p = i;
  while (p != null) {
    const a = list.find(q => q.index === p); if (a) return a;
    p = view.nodes[p] ? view.nodes[p].parent : null;
  }
  return null;
}
export let artboardClip = null;         
export function set_artboardClip(v) { return (artboardClip = v); }   
