




import './52-alpha-text-menu.js';   
import { compositeAll, patternToRGBA } from '../../../core/app.js';
import { uiIcon } from '../icons.js';
import { panels } from '../panels.js';
import { $ } from './01-boot.js';
import {
  brushHistory, curStroke, doc, docH, docName, docW, layerRenames, layerTree, li, pixelPaint, textCrops,
  textRenders,
} from './02-doc-state.js';
import { paintMap } from './11-paint-common.js';
import { selLayer } from './23-layers-panel.js';
import { docPatterns } from './26-layer-create.js';
import { isMeshTransform, transformChanged } from './28-layer-props-transform.js';
import { displayOrder, rasterizeTransformed } from './29-scrubby-live.js';
import { composeDocForOrder, ensureScratch, previewCompositeDoc, viewScratch } from './30-render.js';
import { brush, docTool } from './31-selection-brush.js';
import { brushCursor } from './32-cursors-select-options.js';
import { boOpts, syncBrushOpBar } from './37-local-pixel-tools.js';
import { brushTarget, ensurePixelPaint, paintGuard } from './38-brush-engine.js';
import { drawGizmo } from './46-smart-filter-panel.js';
import { RT_BAR_ICONS, rtHover, syncRetouchBar } from './54-gestures-hints.js';














export const RETOUCH_TOOLS = new Set(['spotHeal', 'healBrush', 'patch', 'contentMove', 'redEye']);
export const RETOUCH_LABEL = { spotHeal: '污点修复画笔', healBrush: '修复画笔', patch: '修补', contentMove: '内容感知移动', redEye: '红眼' };

export function isRetouchBrush(t){ return t === 'spotHeal' || t === 'healBrush'; }
export const retouchOpts = {
  
  size: 24, hardness: 1, spacing: 0.25, pressure: false,
  
  spotMode: 'normal', spotType: 'content', spotAll: false,
  
  healMode: 'normal', healSource: 'sample', healPattern: '', aligned: true, legacy: false,
  sample: 'layer', ignoreAdj: false, diffusion: 5,
  
  selMode: 'replace', patchKind: 'normal', patchMode: 'source', transparent: false, patchPattern: '', patchDiffusion: 5,
  patchStructure: 4, patchColor: 0, patchAll: false,
  
  moveMode: 'move', structure: 4, color: 0, moveAll: false, transformOnDrop: true,
  
  pupilSize: 50, amount: 50,
};
export let retouchState = null;        
export function set_retouchState(v) { return (retouchState = v); }   
export let rtPending = null;           
export function set_rtPending(v) { return (rtPending = v); }   



export function retouchGuard(){
  if (!doc || li) return '先打开一个 PSD';
  if (selLayer < 0) return '先在图层面板里选中一个图层';
  const g = paintGuard();
  if (g) return g;
  if (brushTarget() === 'mask' && docTool !== 'redEye') return `${RETOUCH_LABEL[docTool] || '修复'}只作用在图层像素上（把「作用于」切回「图层像素」）`;
  if (!ensurePixelPaint(selLayer)) return '这个图层没有可编辑的像素';
  return '';
}

export function retouchLayerMapOK(idx, pp){
  const map = paintMap(idx, pp.w, pp.h, pp.left, pp.top);
  if (!map) return false;
  const M = map.M;
  return Math.abs(M[0] - 1) < 1e-9 && Math.abs(M[3] - 1) < 1e-9 && Math.abs(M[1]) < 1e-9 && Math.abs(M[2]) < 1e-9
    && Math.abs(M[4] - pp.left) < 1e-6 && Math.abs(M[5] - pp.top) < 1e-6;
}





export function retouchSampleImage(scope, ignoreAdj){
  if (scope === 'layer') return null;
  const source = previewCompositeDoc(doc);
  const order = displayOrder();
  const pos = order.indexOf(selLayer);
  const above = new Set(scope === 'below' && pos >= 0 ? order.slice(pos + 1) : []);
  const layers = source.layers.map((layer, i) => {
    const gt = layer.group && layer.group.type;
    if (gt !== 1 && gt !== 2 && gt !== 3) {
      if (above.has(i)) return { ...layer, hidden: true };
      if (ignoreAdj && layer.adjustment && layer.adjustment.kind !== 'fill' && !layer.fill) return { ...layer, hidden: true };
    }
    if (transformChanged(i) && !isMeshTransform(i)) {
      const r = rasterizeTransformed(i);
      if (r?.rgba) return { ...layer, rgba: r.rgba, bounds: { ...r.bounds }, width: r.bounds.right - r.bounds.left, height: r.bounds.bottom - r.bounds.top };
    }
    const cp = textRenders[i] && textCrops[i];
    if (cp?.rgba) return { ...layer, rgba: cp.rgba, bounds: { ...cp.bounds }, width: cp.bounds.right - cp.bounds.left, height: cp.bounds.bottom - cp.bounds.top };
    return layer;
  });
  return new Uint8ClampedArray(compositeAll(composeDocForOrder({ ...source, layers }, order), docW, docH, new Map()).data);
}

function rtSampler(scope, ignoreAdj, pp){
  if (scope === 'layer' || !scope) return { data: pp.rgba, w: pp.w, h: pp.h, ox: pp.left, oy: pp.top };
  const d = retouchSampleImage(scope, ignoreAdj);
  return { data: d, w: docW, h: docH, ox: 0, oy: 0 };
}
export function rtBilinear(S, x, y, out){
  const fx = x - S.ox - 0.5, fy = y - S.oy - 0.5;
  if (fx < -1 || fy < -1 || fx > S.w || fy > S.h) return false;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
  const cx0 = Math.max(0, Math.min(S.w - 1, x0)), cx1 = Math.max(0, Math.min(S.w - 1, x0 + 1));
  const cy0 = Math.max(0, Math.min(S.h - 1, y0)), cy1 = Math.max(0, Math.min(S.h - 1, y0 + 1));
  const d = S.data, a = (cy0 * S.w + cx0) * 4, b = (cy0 * S.w + cx1) * 4, c = (cy1 * S.w + cx0) * 4, e = (cy1 * S.w + cx1) * 4;
  for (let k = 0; k < 4; k++) out[k] = (d[a + k] * (1 - ax) + d[b + k] * ax) * (1 - ay) + (d[c + k] * (1 - ax) + d[e + k] * ax) * ay;
  return true;
}






export const cloneSrc = {
  slots: [null, null, null, null, null], active: 0,
  overlay: true, opacity: 100, clipped: true, autoHide: false, invert: false,
  ovMode: 'normal',        
};
export const csCur = () => cloneSrc.slots[cloneSrc.active];
export function csSetSample(pt){
  const old = csCur();
  
  cloneSrc.slots[cloneSrc.active] = { x: Math.floor(pt.x) + 0.5, y: Math.floor(pt.y) + 0.5, anchor: null,
    sw: old ? old.sw : 100, sh: old ? old.sh : 100, angle: old ? old.angle : 0, flipH: old ? old.flipH : false, flipV: old ? old.flipV : false };
  csOverlayCache = null;
  syncCloneSrcPanel();
}

function csMat(s){
  const th = (s.angle || 0) * Math.PI / 180, c = Math.cos(-th), n = Math.sin(-th);
  const kx = (s.flipH ? -1 : 1) * 100 / (s.sw || 100), ky = (s.flipV ? -1 : 1) * 100 / (s.sh || 100);
  return [kx * c, ky * n, -kx * n, ky * c];         
}
export function csMap(s, anchor, px, py){
  const m = csMat(s), tx = px - anchor.x, ty = py - anchor.y;
  return { x: s.x + m[0] * tx + m[2] * ty, y: s.y + m[1] * tx + m[3] * ty };
}

export function csBeginStroke(pt, aligned){
  const s = csCur(); if (!s) return null;
  if (!aligned || !s.anchor) s.anchor = { x: Math.floor(pt.x) + 0.5, y: Math.floor(pt.y) + 0.5 };
  syncCloneSrcPanel();
  return s;
}
const csIdentity = s => !s || ((s.sw || 100) === 100 && (s.sh || 100) === 100 && !s.angle && !s.flipH && !s.flipV);


export let csOverlayCache = null;
export function set_csOverlayCache(v) { return (csOverlayCache = v); }   
function csOverlayCanvas(){
  const tool = docTool;
  const scope = tool === 'healBrush' ? retouchOpts.sample : boOpts.csSample;
  const ign = tool === 'healBrush' ? retouchOpts.ignoreAdj : boOpts.csIgnoreAdj;
  const key = [selLayer, scope, ign, brushHistory.undo.length, brushHistory.redo.length, docW, docH].join('|');
  if (csOverlayCache && csOverlayCache.key === key) return csOverlayCache.cv;
  let cv = null;
  try {
    const pp = pixelPaint[selLayer] || (selLayer >= 0 ? ensurePixelPaint(selLayer) : null);
    if (scope === 'layer' || !scope) {
      if (pp) {
        cv = document.createElement('canvas'); cv.width = pp.w; cv.height = pp.h;
        cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pp.rgba), pp.w, pp.h), 0, 0);
        cv._ox = pp.left; cv._oy = pp.top;
      }
    } else {
      const d = retouchSampleImage(scope, ign);
      cv = document.createElement('canvas'); cv.width = docW; cv.height = docH;
      cv.getContext('2d').putImageData(new ImageData(d, docW, docH), 0, 0);
      cv._ox = 0; cv._oy = 0;
    }
  } catch { cv = null; }
  csOverlayCache = { key, cv };
  return cv;
}
export function drawCloneOverlay(ctx){
  if (li || !doc || !cloneSrc.overlay) return;
  if (docTool !== 'cloneStamp' && !(docTool === 'healBrush' && retouchOpts.healSource === 'sample')) return;
  const s = csCur(), c = brushCursor || rtHover; if (!s || !c) return;
  const painting = (docTool === 'cloneStamp' && curStroke) || (retouchState && retouchState.kind === 'stroke');
  if (painting && cloneSrc.autoHide) return;
  const cv = csOverlayCanvas(); if (!cv) return;
  const anchor = s.anchor || c;                          
  const size = docTool === 'healBrush' ? retouchOpts.size : brush.size;
  
  const m = csMat(s), det = m[0] * m[3] - m[2] * m[1];
  if (!det) return;
  const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
  ctx.save();
  if (cloneSrc.clipped) { ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0.5, size / 2), 0, Math.PI * 2); ctx.clip(); }
  


  const OVM = { darken: 'darken', lighten: 'lighten', difference: 'difference' }[cloneSrc.ovMode];
  if (OVM) {
    ctx.beginPath(); ctx.rect(0, 0, docW, docH); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ensureScratch();
    for (const id of ['#below', '#warp', '#above']) { const sc = viewScratch.get(id); if (sc && sc.width === docW && sc.height === docH) ctx.drawImage(sc, 0, 0); }
    ctx.globalCompositeOperation = OVM;
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, cloneSrc.opacity / 100));
  if (cloneSrc.invert) ctx.filter = 'invert(1)';
  const ox = cv._ox - s.x, oy = cv._oy - s.y;
  ctx.transform(ia, ib, ic, id, anchor.x + ia * ox + ic * oy, anchor.y + ib * ox + id * oy);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cv, 0, 0);
  ctx.restore();
}




let csPanelEl = null;
const csSection = () => document.querySelector('.panel[data-panel="cloneSource"]');
export function toggleCloneSrcPanel(force){
  if (!csPanelEl) buildCloneSrcPanel();
  const open = panels.isOpen('cloneSource') && panels.isVisible('cloneSource');
  const show = force !== undefined ? !!force : !open;
  try { if (show) panels.show('cloneSource'); else panels.hide('cloneSource'); } catch {}
  syncCloneSrcButtons();
  if (show) syncCloneSrcPanel();
}
function syncCloneSrcButtons(){
  let on = false; try { on = panels.isOpen('cloneSource'); } catch {}
  for (const id of ['#rtCloneSrcBtn', '#boCloneSrcBtn']) { const b = $(id); if (b) b.classList.toggle('on', on); }
}
export function buildCloneSrcPanel(){
  const host = csSection(); if (!host) return;
  const el = document.createElement('div');
  el.id = 'cloneSrcPanel'; el.className = 'cs-panel';
  el.innerHTML = `
    <div class="cs-slots"></div>
    <div class="cs-src"></div>
    <div class="cs-grid">
      <span class="cs-l">位移</span><span></span><span class="cs-l cs-wl">W:</span><span class="cs-f"><input class="cs-sw" type="number" step="0.1" min="1" max="1000">%</span><button class="cs-link" title="保持长宽比"></button>
      <span class="cs-l">X:</span><span class="cs-f"><input class="cs-ox" type="number" step="1"> 像素</span><span class="cs-l cs-wl">H:</span><span class="cs-f"><input class="cs-sh" type="number" step="0.1" min="1" max="1000">%</span><span></span>
      <span class="cs-l">Y:</span><span class="cs-f"><input class="cs-oy" type="number" step="1"> 像素</span><span class="cs-l cs-wl" title="旋转仿制源">⟲</span><span class="cs-f"><input class="cs-an" type="number" step="0.1" min="-180" max="180">°</span><button class="cs-rs" title="复位变换"></button>
      <span></span><span></span><span></span><span class="cs-f"><button class="cs-fh" title="水平翻转"></button><button class="cs-fv" title="垂直翻转"></button></span><span></span>
    </div>
    <div class="cs-row cs-frame" title="帧位移 / 锁定帧只对带视频时间轴的文档起作用；本编辑器的文档没有视频帧（时间轴面板不做视频图层）">
      <span class="cs-l">帧位移:</span><input class="cs-fo" type="number" step="1" value="0" disabled>
      <label><input class="cs-lf" type="checkbox" disabled> 锁定帧</label>
    </div>
    <div class="cs-ovl">
      <label><input class="cs-ov" type="checkbox"> 显示叠加</label><label title="只在笔尖圆里显示叠加"><input class="cs-cl" type="checkbox"> 已剪切</label>
      <span class="cs-f"><span class="cs-l">不透明度:</span><input class="cs-op" type="number" min="1" max="100" step="1">%</span><label title="落笔涂抹时隐藏叠加"><input class="cs-ah" type="checkbox"> 自动隐藏</label>
      <select class="cs-ovm" title="叠加与图像的混合方式"><option value="normal">正常</option><option value="darken">变暗</option><option value="lighten">变亮</option><option value="difference">差值</option></select><label title="叠加以反相显示，便于对齐"><input class="cs-iv" type="checkbox"> 反相</label>
    </div>
    <div class="cs-info"></div>`;
  host.replaceChildren(el);
  csPanelEl = el;
  const q = s => el.querySelector(s);
  for (const [cls, key] of [['.cs-fh', 'FlipHorz'], ['.cs-fv', 'FlipVert']]) {
    const [src, px] = RT_BAR_ICONS[key]; const img = document.createElement('img'); img.src = src; img.height = px; img.style.cssText = 'display:block;pointer-events:none'; q(cls).replaceChildren(img);
  }
  q('.cs-link').append(uiIcon('link', 13)); q('.cs-rs').append(uiIcon('rotate-ccw', 13));
  let linkWH = true;
  q('.cs-link').classList.add('on');
  q('.cs-link').onclick = () => { linkWH = !linkWH; q('.cs-link').classList.toggle('on', linkWH); };
  const cur = () => csCur();
  const num = (cls, fn) => { const i = q(cls); i.addEventListener('change', () => { const s = cur(); if (!s) { syncCloneSrcPanel(); return; } fn(s, +i.value || 0); csOverlayCache = null; syncCloneSrcPanel(); drawGizmo(); }); i.addEventListener('keydown', e => e.stopPropagation()); };
  num('.cs-ox', (s, v) => { s.anchor = { x: s.x + v, y: (s.anchor ? s.anchor.y : s.y) }; });
  num('.cs-oy', (s, v) => { s.anchor = { x: (s.anchor ? s.anchor.x : s.x), y: s.y + v }; });
  num('.cs-sw', (s, v) => { v = Math.max(1, Math.min(1000, v)); if (linkWH) s.sh = Math.max(1, Math.min(1000, (s.sh || 100) * v / (s.sw || 100))); s.sw = v; });
  num('.cs-sh', (s, v) => { v = Math.max(1, Math.min(1000, v)); if (linkWH) s.sw = Math.max(1, Math.min(1000, (s.sw || 100) * v / (s.sh || 100))); s.sh = v; });
  num('.cs-an', (s, v) => { s.angle = Math.max(-180, Math.min(180, v)); });
  q('.cs-fh').onclick = () => { const s = cur(); if (s) { s.flipH = !s.flipH; syncCloneSrcPanel(); drawGizmo(); } };
  q('.cs-fv').onclick = () => { const s = cur(); if (s) { s.flipV = !s.flipV; syncCloneSrcPanel(); drawGizmo(); } };
  q('.cs-rs').onclick = () => { const s = cur(); if (s) { Object.assign(s, { sw: 100, sh: 100, angle: 0, flipH: false, flipV: false }); syncCloneSrcPanel(); drawGizmo(); } };
  const chk = (cls, key) => { const i = q(cls); i.addEventListener('change', () => { cloneSrc[key] = i.checked; syncCloneSrcPanel(); drawGizmo(); }); };
  chk('.cs-ov', 'overlay'); chk('.cs-cl', 'clipped'); chk('.cs-ah', 'autoHide'); chk('.cs-iv', 'invert');
  q('.cs-ovm').addEventListener('change', () => { cloneSrc.ovMode = q('.cs-ovm').value; drawGizmo(); });
  const op = q('.cs-op'); op.addEventListener('change', () => { cloneSrc.opacity = Math.max(1, Math.min(100, Math.round(+op.value || 100))); op.value = cloneSrc.opacity; drawGizmo(); });
  op.addEventListener('keydown', e => e.stopPropagation());
  if (!document.getElementById('csPanelCss')) {
    const st = document.createElement('style'); st.id = 'csPanelCss';
    st.textContent = `.cs-panel{padding:6px 8px;display:grid;gap:6px;font-size:11px;user-select:none}
.cs-panel .cs-slots{display:flex;gap:3px}
.cs-panel .cs-slots button{flex:1;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--ps-line-2,#555);background:none;cursor:pointer;padding:0}
.cs-panel .cs-slots button.on{border-color:var(--ps-accent,#1473e6);background:rgba(47,128,230,.18)}
.cs-panel .cs-slots button.empty{opacity:.45}
.cs-panel .cs-src{color:var(--ps-muted,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cs-panel .cs-grid{display:grid;grid-template-columns:auto 1fr auto 1fr auto;gap:3px 4px;align-items:center}
.cs-panel .cs-l{color:var(--ps-muted,#aaa)}
.cs-panel .cs-f{display:flex;align-items:center;gap:2px}
.cs-panel input[type=number]{width:52px;height:20px;box-sizing:border-box;font-size:11px}
.cs-panel .cs-grid button,.cs-panel .cs-f button{width:22px;height:20px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:none;border:1px solid transparent;color:inherit;cursor:pointer}
.cs-panel button.on{border-color:var(--ps-accent,#1473e6)!important;background:rgba(47,128,230,.18)!important}
.cs-panel .cs-row{display:flex;align-items:center;gap:6px}
.cs-panel .cs-frame{opacity:.5}
.cs-panel .cs-ovl{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;border-top:1px solid var(--ps-line,#222);padding-top:6px}
.cs-panel .cs-info{color:var(--ps-muted,#aaa);line-height:1.5}`;
    document.head.append(st);
  }
  try { panels.onChange(() => { syncCloneSrcButtons(); if (panels.isOpen('cloneSource')) syncCloneSrcPanel(); }); } catch {}
}
export function syncCloneSrcPanel(){
  if (!csPanelEl) return;
  try { if (!panels.isOpen('cloneSource')) return; } catch { return; }
  const q = s => csPanelEl.querySelector(s);
  const slots = q('.cs-slots');
  slots.replaceChildren();
  const [src, px] = RT_BAR_ICONS.CloneSourcePanel;
  cloneSrc.slots.forEach((s, i) => {
    const b = document.createElement('button');
    b.title = s ? `仿制源 ${i + 1}：取样点 ${Math.round(s.x)}, ${Math.round(s.y)}` : `仿制源 ${i + 1}（未取样：选中后按住 Alt/⌥ 在画布上点）`;
    b.className = (i === cloneSrc.active ? 'on' : '') + (s ? '' : ' empty');
    const img = document.createElement('img'); img.src = src; img.height = px; img.style.pointerEvents = 'none'; b.append(img);
    b.onclick = () => { cloneSrc.active = i; syncCloneSrcPanel(); syncRetouchBar(); syncBrushOpBar(); drawGizmo(); };
    slots.append(b);
  });
  const s = csCur();
  const L = layerTree && layerTree.flat && layerTree.flat[selLayer];
  const scope = docTool === 'healBrush' ? retouchOpts.sample : boOpts.csSample;
  q('.cs-src').textContent = s ? `源：${docName || '未命名'}${scope === 'layer' || !scope ? (L ? '：' + (layerRenames[selLayer] || L.name || '') : '') : (scope === 'all' || scope === 'merged') ? '：所有图层' : '：当前和下方图层'}` : '源：（未取样）';
  const off = s ? { x: Math.round((s.anchor ? s.anchor.x : s.x) - s.x), y: Math.round((s.anchor ? s.anchor.y : s.y) - s.y) } : { x: 0, y: 0 };
  const set = (cls, v) => { const i = q(cls); if (document.activeElement !== i) i.value = v; i.disabled = !s; };
  set('.cs-ox', off.x); set('.cs-oy', off.y);
  set('.cs-sw', s ? +(+s.sw).toFixed(1) : 100); set('.cs-sh', s ? +(+s.sh).toFixed(1) : 100); set('.cs-an', s ? +(+s.angle).toFixed(1) : 0);
  q('.cs-fh').classList.toggle('on', !!(s && s.flipH)); q('.cs-fv').classList.toggle('on', !!(s && s.flipV));
  for (const c of ['.cs-fh', '.cs-fv', '.cs-rs']) q(c).disabled = !s;
  q('.cs-ov').checked = cloneSrc.overlay; q('.cs-cl').checked = cloneSrc.clipped; q('.cs-ah').checked = cloneSrc.autoHide; q('.cs-iv').checked = cloneSrc.invert;
  for (const c of ['.cs-cl', '.cs-ah', '.cs-iv', '.cs-op', '.cs-ovm']) q(c).disabled = !cloneSrc.overlay;
  q('.cs-op').value = cloneSrc.opacity; q('.cs-ovm').value = cloneSrc.ovMode;
  q('.cs-info').textContent = s ? `取样点 ${Math.round(s.x)}, ${Math.round(s.y)}${s.anchor ? '' : '（下一笔定锚点）'} · ⌥⇧ 方向键微移、⌥⇧ < > 旋转、⌥⇧ [ ] 缩放` : '按住 Alt/⌥ 在画布上点一下取样';
}




let rtBuiltinPats = null;
export function rtBuiltinPatterns(){
  if (rtBuiltinPats) return rtBuiltinPats;
  const mk = (id, name, w, h, fn) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); const o = (y * w + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; }
    return { id: 'builtin:' + id, name, width: w, height: h, data };
  };
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  const N = 64, noise = Array.from({ length: N * N }, rnd);
  
  const vnoise = (x, y, f) => {
    const gx = x * f / N, gy = y * f / N, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const g = (i, j) => noise[((((j % f) + f) % f) * 31 + (((i % f) + f) % f) * 17) % (N * N)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx) * (1 - sy) + (g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx) * sy;
  };
  rtBuiltinPats = [
    mk('noise', '灰色杂色', 64, 64, (x, y) => { const v = 128 + (noise[y * N + x] - 0.5) * 70; return [v, v, v]; }),
    mk('clouds', '云彩', 128, 128, (x, y) => { let v = 0, a = 0.5; for (const f of [4, 8, 16, 32]) { v += vnoise(x * 0.5, y * 0.5, f) * a; a /= 2; } v = 70 + v * 170; return [v * 0.85, v * 0.92, v]; }),
    mk('canvas', '帆布', 32, 32, (x, y) => { const w = (Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2)); const v = 190 + w * 18 + (noise[(y % 64) * N + (x % 64)] - 0.5) * 20; return [v, v * 0.96, v * 0.88]; }),
    mk('bricks', '砖墙', 64, 32, (x, y) => { const off = y < 16 ? 0 : 32; const m = (y % 16) < 2 || ((x + off) % 64) < 2; const n = (noise[(y * 2 % 64) * N + x] - 0.5) * 40; return m ? [196, 190, 180] : [150 + n, 70 + n * 0.5, 55 + n * 0.4]; }),
    mk('checker', '棋盘格', 32, 32, (x, y) => (((x >> 4) + (y >> 4)) & 1) ? [204, 204, 204] : [255, 255, 255]),
    mk('grid', '网格', 32, 32, (x, y) => (x % 32 === 0 || y % 32 === 0) ? [120, 120, 120] : [240, 240, 240]),
  ];
  return rtBuiltinPats;
}

export function rtPatternList(){
  
  const dp = docPatterns(), names = new Set(dp.map(p => p.name));
  return [...rtBuiltinPatterns().filter(p => !names.has(p.name)).map(p => ({ id: p.id, name: p.name })), ...dp.map(p => ({ id: p.id, name: p.name || '(无名图案)' }))];
}

export function rtPatternImage(id){
  const b = rtBuiltinPatterns().find(p => p.id === id);
  if (b) return b;
  const raw = ((doc && doc.patterns) || []).find(p => p.id === id);
  try { const r = raw && patternToRGBA(raw); if (r && r.width > 0 && r.data) return r; } catch {}
  return rtBuiltinPatterns()[0];
}
export function rtPatternAt(pat, x, y, out){
  const px = ((Math.floor(x) % pat.width) + pat.width) % pat.width, py = ((Math.floor(y) % pat.height) + pat.height) % pat.height;
  const o = (py * pat.width + px) * 4;
  out[0] = pat.data[o]; out[1] = pat.data[o + 1]; out[2] = pat.data[o + 2]; out[3] = pat.data[o + 3];
  return true;
}

export function rtFillPatternSelect(sel, cur){
  if (!sel) return cur;
  const list = rtPatternList();
  const sig = list.map(p => p.id).join('\u0001');
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig; sel.innerHTML = '';
    for (const p of list) sel.append(Object.assign(document.createElement('option'), { value: p.id, textContent: p.name }));
  }
  if (!list.some(p => p.id === cur)) cur = list[0] ? list[0].id : '';
  sel.value = cur;
  return cur;
}
