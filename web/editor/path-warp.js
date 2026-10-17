












import { TRANSFORM_WARP_DEFAULTS } from '../../core/transform-warp-presets.js';
import { identityMesh, presetMesh, cloneMesh, splitMesh, unsplitAll, regridMesh, meshIsIdentity, meshMapper, warpKnots, mapKnot } from '../../core/path-warp.js';
import { surfaceIsoCurves, meshTopology, moveControlPoint, dragSurfacePoint, nearestSurfaceParam, surfacePoint } from '../../core/mesh.js';
import { translateWarpControls, warpAnchorsInRect, warpSelectionBounds } from '../../core/warp-control-selection.js';
import { transformWarpToolbar } from './transform-warp-toolbar.js';
import { presetWarpHandles, hitPresetWarpHandle, dragPresetWarpHandle, drawPresetWarpHandles } from './preset-warp-controls.js';












export function installPathWarp(api) {
  const $ = s => document.querySelector(s);
  const app = () => document.querySelector('.app');
  const customStyle = w => w.style==='warpCustom'||w.style==='warpNone';
  const W = () => { const t = api.tf(); return t && t.pathWarp || null; };

  
  function start(tf, { rect, src, anchors }) {
    if (!(rect.w > 0)) rect = { ...rect, x: rect.x - 0.5, w: 1 };
    if (!(rect.h > 0)) rect = { ...rect, y: rect.y - 0.5, h: 1 };
    tf.pathWarp = {
      rect, src, anchors, mesh: identityMesh(rect), style: 'warpCustom', bend: 50, h: 0, v: 0, vertical: false,
      grid: 'default', gridN: [3, 3], split: null, drag: null, hot: null, dragging: false, selected: new Set(),
    };
    tf.kind = 'warp';
    app().classList.add('path-warping');
    apply(true); syncBar(); api.redraw();
  }
  function end() { app().classList.remove('path-warping');transformWarpToolbar.hide('path'); }
  const changed = w => !!w && !meshIsIdentity(w.mesh);

  
  function apply(final) {
    const w = W(), pm = api.pathModel(); if (!w || !pm) return;
    const F = meshMapper(w.mesh), tol = final ? 0.25 : 0.75, sp = pm.subpaths;
    for (const [id, orig] of w.src) {
      if (w.anchors) {
        const [si, ki] = String(id).split(':').map(Number); const kn = sp[si] && sp[si].knots[ki]; if (!kn) continue;
        Object.assign(kn, mapKnot(orig, F));
      } else if (sp[id]) {
        const out = warpKnots({ knots: orig, closed: sp[id].closed !== false }, F, { tol });
        if (out.length && out.every(k => k.anchor.every(Number.isFinite) && k.in.every(Number.isFinite) && k.out.every(Number.isFinite))) sp[id].knots = out;
      }
    }
  }

  
  function setMesh(m, { custom = true } = {}) {
    const w = W(); if (!w) return;
    if (m.cols !== w.mesh.cols || m.rows !== w.mesh.rows) w.selected.clear();
    w.mesh = m; if (custom) w.style = 'warpCustom';
    apply(!w.dragging); syncBar(); api.redraw();
  }
  function applyPreset() {
    const w = W(); if (!w) return;
    if (customStyle(w)) {
      if (w.style === 'warpNone') { w.mesh = identityMesh(w.rect); w.grid='default'; }
    } else {
      w.mesh = presetMesh(w.rect, { style: w.style, bend: w.bend / 100, h: w.h / 100, v: w.v / 100, vertical: w.vertical,values:w.values });
      w.grid = 'default';
    }
    apply(true); syncBar(); api.redraw();
  }
  function setStyle(style, o = {}) {
    const w = W(); if (!w) return false;
    w.selected.clear(); w.hot=null;
    w.style = style;
    if(style==='warpCylinder')w.values=[0,w.rect.h,w.rect.w,0,.5,.5,.9];
    if(TRANSFORM_WARP_DEFAULTS[style])w.bend=TRANSFORM_WARP_DEFAULTS[style].bend;
    for (const k of ['bend', 'h', 'v']) if (o[k] != null) w[k] = Math.max(-100, Math.min(100, +o[k]));
    if (o.vertical != null) w.vertical = !!o.vertical;
    applyPreset();
    return true;
  }
  function setGrid(g, n = null) {
    const w = W(); if (!w) return false;
    let nx = 1, ny = 1;
    if (g === 'custom') { const c = n || w.gridN; nx = Math.max(1, Math.min(50, Math.round(c[0]))); ny = Math.max(1, Math.min(50, Math.round(c[1]))); w.gridN = [nx, ny]; }
    else if (g !== 'default') nx = ny = +g;
    w.grid = g; if(g!=='default')w.gridN=[nx,ny];
    setMesh(nx === 1 && ny === 1 ? unsplitAll(w.mesh) : regridMesh(w.mesh, nx, ny));
    return true;
  }
  function removeSplits() { const w = W(); if (!w) return false; w.grid = 'default'; setMesh(unsplitAll(w.mesh)); return true; }
  function setSplitMode(dir) { const w = W(); if (!w) return false; w.split = w.split === dir ? null : dir; syncBar(); api.status(w.split ? '在网格上点一下落拆分线' : ''); return true; }
  function nudge(dx, dy) { const w = W(); if (!w) return; const m = cloneMesh(w.mesh);
    if (w.selected.size) m.points = translateWarpControls(m.points,m.cols,m.rows,w.selected,{x:dx,y:dy});
    else for (const p of m.points) { p.x += dx; p.y += dy; }
    setMesh(m, { custom: customStyle(w) }); }

  
  const topoCache = new Map();
  const topo = (c, r) => { const k = c + 'x' + r; if (!topoCache.has(k)) topoCache.set(k, meshTopology(c, r)); return topoCache.get(k); };
  const presetHandles=w=>presetWarpHandles(w,{width:w.rect.w,height:w.rect.h},p=>({x:p.x+w.rect.x,y:p.y+w.rect.y}));
  function draw(ctx) {
    const w = W(), pm = api.pathModel(); if (!w) return;
    const px = api.px, m = w.mesh;
    ctx.save();
    
    if (pm) {
      ctx.beginPath();
      const ids = w.anchors ? new Set([...w.src.keys()].map(id => +String(id).split(':')[0])) : new Set(w.src.keys());
      for (const si of ids) {
        const sp = pm.subpaths[si]; if (!sp || !sp.knots.length) continue;
        const K = sp.knots, n = K.length, segs = sp.closed !== false ? n : n - 1;
        ctx.moveTo(K[0].anchor[0], K[0].anchor[1]);
        for (let s = 0; s < segs; s++) { const a = K[s], b = K[(s + 1) % n]; ctx.bezierCurveTo(a.out[0], a.out[1], b.in[0], b.in[1], b.anchor[0], b.anchor[1]); }
        if (sp.closed !== false) ctx.closePath();
      }
      ctx.lineWidth = px(1); ctx.strokeStyle = '#1473e6'; ctx.stroke();
    }
    
    const guides=transformWarpToolbar.guides(),per=guides.density+1;
    const iso = surfaceIsoCurves(m.points, m.cols, m.rows, per, 8, m.sliceX, m.sliceY);
    const line = pts => { ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); };
    ctx.lineWidth = px(1);
    for (const L of [...iso.u, ...iso.v]) {
      const border = L.param <= 1e-9 || L.param >= 1 - 1e-9;
      if(!guides.visible)continue;
      ctx.globalAlpha=guides.opacity/100;ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = px(border || (L.isSplit && per === 1) ? 1.5 : 1.5); line(L);
      ctx.strokeStyle = guides.color; ctx.lineWidth = px(border || L.isSplit ? 1 : 0.75); line(L);
    }
    ctx.globalAlpha=1;
    const hs = px(4);
    if (!customStyle(w)) {                           
      ctx.lineWidth=px(1);drawPresetWarpHandles(ctx,presetHandles(w),hs,w.hot?.id);
    } else {
      const T = topo(m.cols, m.rows);
      ctx.strokeStyle = 'rgba(20,115,230,.95)'; ctx.lineWidth = px(1);
      ctx.beginPath(); for (const [a, h] of T.arms) { ctx.moveTo(m.points[a].x, m.points[a].y); ctx.lineTo(m.points[h].x, m.points[h].y); } ctx.stroke();
      for (let i = 0; i < m.points.length; i++) {
        const role = T.roles[i]; if (role === 'grid') continue;
        const p = m.points[i], hot = w.hot && w.hot.i === i;
        ctx.fillStyle = hot || w.selected.has(i) ? '#1473e6' : '#fff'; ctx.strokeStyle = role === 'corner' ? '#000' : '#1473e6';
        if (role === 'corner') { ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2); ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, hs * 0.8, 0, 7); ctx.fill(); ctx.stroke(); }
      }
    }
    if (w.drag?.kind === 'marquee') {
      const r=w.drag.rect;ctx.setLineDash([px(4),px(3)]);ctx.strokeStyle='#1473e6';ctx.lineWidth=px(1);
      ctx.strokeRect(Math.min(r.x0,r.x1),Math.min(r.y0,r.y1),Math.abs(r.x1-r.x0),Math.abs(r.y1-r.y0));
    } else if (w.selected.size>1) {
      const b=warpSelectionBounds(m.points,w.selected);ctx.setLineDash([px(3),px(3)]);ctx.strokeStyle='#1473e6';ctx.lineWidth=px(1);ctx.strokeRect(b.left,b.top,b.right-b.left,b.bottom-b.top);
    }
    ctx.restore();
  }
  function hit(pt) {
    const w = W(); if (!w) return null;
    const m = w.mesh, tol = api.px(7);
    if (w.split) {
      const s = nearestSurfaceParam(m.points, m.cols, m.rows, pt, 30, m.sliceX, m.sliceY);
      return s.dist <= tol * 2 || insideMesh(pt) ? { kind: 'split', U: s.U, V: s.V } : null;
    }
    if (!customStyle(w)) {
      const h=hitPresetWarpHandle(presetHandles(w),pt,tol);
      if(h)return {kind:'preset',id:h.id};
      return insideMesh(pt) ? { kind: 'surface' } : null;
    }
    const T = topo(m.cols, m.rows);
    let best = null, bd = Infinity;
    for (let i = 0; i < m.points.length; i++) {
      if (T.roles[i] === 'grid') continue;
      const p = m.points[i], d = Math.hypot(pt.x - p.x, pt.y - p.y);
      
      if (d <= tol && (d < bd - 1e-6 || (Math.abs(d - bd) < 1e-6 && T.roles[i] === 'handle'))) { bd = d; best = { kind: T.roles[i], i }; }
    }
    if (best) return best;
    return insideMesh(pt) ? { kind: 'surface' } : null;
  }
  function insideMesh(pt) {
    const w = W(); if (!w) return false;
    const m = w.mesh, s = nearestSurfaceParam(m.points, m.cols, m.rows, pt, 24, m.sliceX, m.sliceY);
    return s.dist <= api.px(3);
  }
  function cursorAt(pt) { const h = hit(pt); return h ? (h.kind === 'surface' ? 'move' : h.kind === 'split' ? 'crosshair' : 'pointer') : 'default'; }

  function pointerDown(pt, ev) {
    const w = W(); if (!w) return false;
    const h = hit(pt);
    if (ev?.shiftKey && customStyle(w) && !w.split && (!h || h.kind === 'corner' || h.kind === 'surface')) {
      if (h?.kind === 'corner') {
        if(w.selected.has(h.i))w.selected.delete(h.i);else w.selected.add(h.i);
        w.hot=null;api.redraw();api.status(`已选中 ${w.selected.size} 个变形锚点`);return true;
      }
      w.drag={kind:'marquee',start:{...pt},rect:{x0:pt.x,y0:pt.y,x1:pt.x,y1:pt.y},selected:[...w.selected]};w.dragging=true;api.redraw();return true;
    }
    if (!h) { w.selected.clear();api.redraw();return true; }                                       
    const m = w.mesh;
    if (h.kind === 'split') {
      const dir = w.split; w.split = null; w.grid = 'custom-split';
      setMesh(splitMesh(m, h.U, h.V, dir), { custom: true });
      return true;
    }
    if(h.kind==='corner'){if(!w.selected.has(h.i)){w.selected.clear();w.selected.add(h.i);}}else w.selected.clear();
    let U = 0, V = 0;
    if (h.kind === 'surface') { const s = nearestSurfaceParam(m.points, m.cols, m.rows, pt, 40, m.sliceX, m.sliceY); U = s.U; V = s.V; }
    w.drag = { ...h, selected:[...w.selected], start: { x: pt.x, y: pt.y }, base: m.points.map(p => ({ x: p.x, y: p.y })), options:{style:w.style,bend:w.bend,h:w.h,v:w.v,vertical:w.vertical,values:w.values?.slice()}, mesh0:cloneMesh(m), bend0: w.bend, U, V };
    w.hot = h; w.dragging = true;
    return true;
  }
  function pointerMove(pt, ev) {
    const w = W(); if (!w || !w.drag) return false;
    const d = w.drag, m = w.mesh;
    if(d.kind==='preset'){
      const next=dragPresetWarpHandle(d.options,d.id,{x:d.start.x-w.rect.x,y:d.start.y-w.rect.y},{x:pt.x-w.rect.x,y:pt.y-w.rect.y},{width:w.rect.w,height:w.rect.h});
      Object.assign(w,next);w.mesh=presetMesh(w.rect,{style:w.style,bend:w.bend/100,h:w.h/100,v:w.v/100,vertical:w.vertical,values:w.values});
      apply(false);syncBar();api.redraw();return true;
    }
    if(d.kind==='marquee'){
      d.rect={x0:d.start.x,y0:d.start.y,x1:pt.x,y1:pt.y};w.selected=new Set([...d.selected,...warpAnchorsInRect(m.points,m.cols,m.rows,d.rect)]);api.redraw();return true;
    }
    let dx = pt.x - d.start.x, dy = pt.y - d.start.y;
    if (ev && ev.shiftKey && d.kind !== 'bend') { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if(w.style==='warpNone')w.style='warpCustom';
    let pts;
    if (d.kind === 'surface') {
      if (!customStyle(w)) { w.style = 'warpCustom'; }  
      pts = dragSurfacePoint(d.base, m.cols, m.rows, d.U, d.V, { x: dx, y: dy }, m.sliceX, m.sliceY, { smooth: !(ev && ev.altKey) });
    } else if(d.kind==='corner') {
      pts=translateWarpControls(d.base,m.cols,m.rows,d.selected,{x:dx,y:dy});
    } else {
      pts = d.base.map(p => ({ x: p.x, y: p.y }));
      moveControlPoint(pts, m.cols, m.rows, d.i, { x: d.base[d.i].x + dx, y: d.base[d.i].y + dy }, { smooth: !(ev && ev.altKey) });
    }
    w.mesh = { ...m, points: pts };
    apply(false); syncBar(); api.redraw();
    return true;
  }
  function pointerUp() {
    const w = W(); if (!w) return false;
    const was = !!w.drag, selectionOnly=w.drag?.kind==='marquee';
    w.drag = null; w.dragging = false; w.hot = null;
    if (was) { if(!selectionOnly)apply(true); api.redraw(); }
    syncBar();
    return was;
  }

  addEventListener('pointercancel',()=>{
    const w=W(),d=w?.drag;if(d?.kind!=='preset')return;
    Object.assign(w,d.options);w.mesh=cloneMesh(d.mesh0);w.drag=null;w.dragging=false;w.hot=null;apply(true);syncBar();api.redraw();
  },true);

  
  transformWarpToolbar.register('path',{
    state:()=>{const w=W();return w&&{style:w.style,bend:w.bend,h:w.h,v:w.v,vertical:w.vertical,grid:w.grid,gridN:w.gridN,split:w.split,busy:w.dragging,values:w.values};},
    setStyle, setGrid, setSplit:setSplitMode,
    reset:()=>{const w=W();if(!w)return;delete w.beforePreset;Object.assign(w,{style:'warpNone',bend:0,h:0,v:0,vertical:false,grid:'default',split:null,hot:null});w.selected.clear();w.mesh=identityMesh(w.rect);apply(true);syncBar();api.redraw();},
    setParams:o=>{const w=W();if(w&&!customStyle(w)){Object.assign(w,o);applyPreset();}},
    setCylinderParams:o=>{const w=W();if(w?.style==='warpCylinder'){w.values=[...w.values.slice(0,4),o.top,o.bottom,o.strength];applyPreset();}},
    toggleDirection:()=>{const w=W();if(w&&!customStyle(w)){w.vertical=!w.vertical;applyPreset();}},
    toFree:()=>api.toggleFree?api.toggleFree():$('#tfWarp').click(),
    cancel:()=>api.cancel?api.cancel():$('#tfCancel').click(),commit:()=>api.commit?api.commit():$('#tfOk').click(),
    guidesChanged:()=>api.redraw(),
  });
  function syncBar(){if(W())transformWarpToolbar.show('path');else transformWarpToolbar.hide('path');}

  return {
    start, end, apply, changed, draw, hit, cursorAt, pointerDown, pointerMove, pointerUp, syncBar, nudge,
    setStyle, setGrid, setSplitMode, removeSplits, active: () => !!W(),
    state: () => { const w = W(); return w && { style: w.style, bend: w.bend, h: w.h, v: w.v, vertical: w.vertical, grid: w.grid, cols: w.mesh.cols, rows: w.mesh.rows,
      values:w.values?.slice(), rect: { ...w.rect }, points: w.mesh.points.map(p => [p.x, p.y]), sliceX: w.mesh.sliceX.slice(), sliceY: w.mesh.sliceY.slice(), selected:[...w.selected], split: w.split }; },
    setPoints: pts => { const w = W(); if (!w || pts.length !== w.mesh.points.length) return false; setMesh({ ...w.mesh, points: pts.map(p => ({ x: p[0], y: p[1] })) }); return true; },
  };
}
