





import { uiIcon } from './icons.js';
const $ = s => document.querySelector(s);
let api = { getColors: () => ({ fg: [0, 0, 0], bg: [255, 255, 255] }), setColors: () => {}, addAdjustment: () => {}, adjustKinds: () => [],
            onHistoryJump: () => {}, onHistorySource: () => {}, channelView: () => null, setChannelView: () => {}, loadChannelSelection: () => {}, compositeCanvas: () => null,
            pathRows: () => [], onPathClick: () => {} };
let active = 'fg';       
let hsv = { h: 0, s: 0, v: 0 };

const hexOf = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function rgb2hsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: max ? d / max : 0, v: max };
}
function hsv2rgb({ h, s, v }) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}









function fitCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const w = Math.round(r.width), h = Math.round(r.height);
  if (!(w > 0 && h > 0)) return null;                 
  const dpr = Math.max(1, Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  return { w, h, dpr };
}
function drawSquare() {
  const cv = $('#cpSquare'); if (!cv) return;
  const ctx = cv.getContext('2d'); if (!ctx || !ctx.fillRect) return;
  const fit = fitCanvas(cv);
  try {
    if (fit && ctx.setTransform) ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
    drawSquareOn(ctx, fit ? fit.w : cv.width, fit ? fit.h : cv.height);
    if (fit && ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  } catch {  }
}
function drawSquareOn(ctx, W, H) {
  const base = hsv2rgb({ h: hsv.h, s: 1, v: 1 });
  ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, W, H);
  let g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  
  const x = hsv.s * W, y = (1 - hsv.v) * H;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.strokeStyle = hsv.v > .5 ? '#000' : '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
}
function drawHue() {
  const cv = $('#cpHue'); if (!cv) return;
  const ctx = cv.getContext('2d'); if (!ctx || !ctx.fillRect) return;
  const fit = fitCanvas(cv);
  try {
    if (fit && ctx.setTransform) ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
    drawHueOn(ctx, fit ? fit.w : cv.width, fit ? fit.h : cv.height);
    if (fit && ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  } catch {  }
}
function drawHueOn(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (let i = 0; i <= 6; i++) { const c = hsv2rgb({ h: (i * 60) % 360, s: 1, v: 1 }); g.addColorStop(i / 6, `rgb(${c.join(',')})`); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const y = hsv.h / 360 * H;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, y - 1, W, 2); ctx.fillStyle = '#000'; ctx.fillRect(0, y - 2, W, 1); ctx.fillRect(0, y + 1, W, 1);
}
function syncFields() {
  const c = hsv2rgb(hsv);
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = v; };
  set('#cpR', c[0]); set('#cpG', c[1]); set('#cpB', c[2]); set('#cpHex', hexOf(c).slice(1).toUpperCase());
}
export function refreshColors() {
  const { fg, bg } = api.getColors();
  const f = $('#cpFg'), b = $('#cpBg');
  if (f) { f.style.background = hexOf(fg); f.classList.toggle('on', active === 'fg'); }
  if (b) { b.style.background = hexOf(bg); b.classList.toggle('on', active === 'bg'); }
  hsv = rgb2hsv(active === 'fg' ? fg : bg);
  drawSquare(); drawHue(); syncFields();
}
function commit() {
  const c = hsv2rgb(hsv);
  const { fg, bg } = api.getColors();
  api.setColors(active === 'fg' ? c : fg, active === 'bg' ? c : bg);
  refreshColors();
}
function initColorPanel() {
  const sq = $('#cpSquare'), hu = $('#cpHue'); if (!sq || !hu) return;
  const pick = (e) => { const r = sq.getBoundingClientRect(); hsv.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); hsv.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); commit(); };
  let drag = false;
  sq.addEventListener('pointerdown', e => { drag = true; try { sq.setPointerCapture(e.pointerId); } catch {} pick(e); });
  sq.addEventListener('pointermove', e => { if (drag) pick(e); });
  sq.addEventListener('pointerup', () => { drag = false; }); sq.addEventListener('pointercancel', () => { drag = false; });
  const pickH = (e) => { const r = hu.getBoundingClientRect(); hsv.h = Math.max(0, Math.min(359.99, (e.clientY - r.top) / r.height * 360)); commit(); };
  let dragH = false;
  hu.addEventListener('pointerdown', e => { dragH = true; try { hu.setPointerCapture(e.pointerId); } catch {} pickH(e); });
  hu.addEventListener('pointermove', e => { if (dragH) pickH(e); });
  hu.addEventListener('pointerup', () => { dragH = false; }); hu.addEventListener('pointercancel', () => { dragH = false; });
  $('#cpFg').addEventListener('click', () => { active = 'fg'; refreshColors(); });
  $('#cpBg').addEventListener('click', () => { active = 'bg'; refreshColors(); });
  


  const rgbEls = ['#cpR', '#cpG', '#cpB'].map($);
  if (rgbEls.every(Boolean)) {
    const onRGB = () => { const c = rgbEls.map(el => Math.max(0, Math.min(255, +el.value || 0))); hsv = rgb2hsv(c); commit(); };
    for (const el of rgbEls) el.addEventListener('change', onRGB);
  }
  const hex = $('#cpHex');
  if (hex) hex.addEventListener('change', () => {
    const h = hex.value.replace('#', '').trim(); if (!/^[0-9a-f]{6}$/i.test(h)) { syncFields(); return; }
    hsv = rgb2hsv([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]); commit();
  });
  
  if (typeof ResizeObserver === 'function') {
    try { new ResizeObserver(() => { drawSquare(); drawHue(); }).observe(sq); } catch {}
  }
  refreshColors();
}


const SWATCH_GROUPS = [
  ['RGB', ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']],
  ['CMYK', ['#00aeef', '#ec008c', '#fff200', '#231f20', '#ed1c24', '#00a651', '#2e3192', '#f7941d', '#8dc63f', '#662d91', '#0072bc', '#ed145b']],
  ['灰度', ['#ffffff', '#e6e6e6', '#cccccc', '#b3b3b3', '#999999', '#808080', '#666666', '#4d4d4d', '#333333', '#1a1a1a', '#000000']],
  ['粉彩', ['#f9c5c5', '#fbe3c5', '#fdf7c5', '#d9f5c5', '#c5f1e6', '#c5e0fb', '#d9cbf7', '#f7cbe8']],
  ['浅色', ['#f26d6d', '#f6a86d', '#f5e06d', '#a9e06d', '#6dd9c8', '#6db2f5', '#a58df3', '#f38bd0']],
  ['深色', ['#b71c1c', '#e65100', '#f9a825', '#33691e', '#00695c', '#0d47a1', '#4527a0', '#880e4f']],
  ['更暗', ['#5d0d0d', '#7a2b00', '#7f5410', '#1b3a0f', '#003a33', '#062a5f', '#221450', '#4a0729']],
];


const SW_COLLAPSE_KEY = 'fp.swatchCollapsed';
function loadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(SW_COLLAPSE_KEY) || '[]')); } catch { return new Set(); }
}
function saveCollapsed(set) {
  try { localStorage.setItem(SW_COLLAPSE_KEY, JSON.stringify([...set])); } catch {}
}
let swCollapsed = loadCollapsed();

function initSwatches() {
  const g = $('#swatchGrid'); if (!g) return;
  g.innerHTML = '';
  for (const [name, list] of SWATCH_GROUPS) {
    



    const h = document.createElement('button');
    h.type = 'button'; h.className = 'sw-group';
    const collapsed = swCollapsed.has(name);
    h.setAttribute('aria-expanded', String(!collapsed));
    h.title = '点击折叠 / 展开「' + name + '」';
    

    let tri = uiIcon(collapsed ? 'chevron-right' : 'chevron-down', 9);
    tri.setAttribute('class', 'ps-icon sw-tri');
    const txt = document.createElement('span'); txt.textContent = name;
    h.append(tri, txt);
    const items = document.createElement('div');
    items.className = 'sw-items' + (collapsed ? ' collapsed' : '');
    h.addEventListener('click', () => {
      const now = items.classList.toggle('collapsed');
      if (now) swCollapsed.add(name); else swCollapsed.delete(name);
      saveCollapsed(swCollapsed);
      h.setAttribute('aria-expanded', String(!now));
      const next = uiIcon(now ? 'chevron-right' : 'chevron-down', 9);
      next.setAttribute('class', 'ps-icon sw-tri');
      tri.replaceWith(next);
      tri = next;
    });
    g.appendChild(h); g.appendChild(items);
    for (const hex of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = hex; b.title = hex;
      b.addEventListener('click', e => {
        const c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        const { fg, bg } = api.getColors();
        if (e.altKey) api.setColors(fg, c); else api.setColors(c, bg);
        refreshColors();
      });
      items.appendChild(b);
    }
  }
}
function initPresets() {
  const gg = $('#gradientGrid');
  if (gg) {
    gg.innerHTML = '';
    const grads = ['linear-gradient(90deg,#000,#fff)', 'linear-gradient(90deg,#000,transparent)', 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)', 'linear-gradient(90deg,#0a2a6b,#1d8bd8,#b8e2ff)', 'linear-gradient(90deg,#6d1b7b,#ff7f50)', 'linear-gradient(90deg,#134e5e,#71b280)', 'linear-gradient(90deg,#f7971e,#ffd200)', 'linear-gradient(90deg,#c31432,#240b36)'];
    for (const s of grads) { const d = document.createElement('div'); d.className = 'pr'; d.style.background = s; d.title = '渐变预设（渐变工具尚未实现）'; gg.appendChild(d); }
  }
  const pg = $('#patternGrid');
  if (pg) {
    pg.innerHTML = '';
    const pats = ['repeating-linear-gradient(45deg,#777 0 4px,#333 4px 8px)', 'radial-gradient(#999 2px,#333 2px) 0 0/10px 10px', 'repeating-linear-gradient(0deg,#666 0 2px,#2a2a2a 2px 8px)', 'repeating-conic-gradient(#666 0 25%,#333 0 50%) 0 0/12px 12px', 'repeating-linear-gradient(-45deg,#8a6 0 3px,#464 3px 9px)', 'radial-gradient(circle,#ccc 30%,#555 32%) 0 0/14px 14px'];
    for (const s of pats) { const d = document.createElement('div'); d.className = 'pr'; d.style.background = s; d.title = '图案预设（图案填充尚未实现）'; pg.appendChild(d); }
  }
}












const ADJ_ORDER = [['brightnessContrast', '亮度/对比度'], ['levels', '色阶'], ['curves', '曲线'], ['exposure', '曝光度'], ['vibrance', '自然饱和度'], ['hueSaturation', '色相/饱和度'], ['colorBalance', '色彩平衡'], ['blackWhite', '黑白'], ['photoFilter', '照片滤镜'], ['channelMixer', '通道混合器'], ['colorLookup', '颜色查找'], ['invert', '反相'], ['posterize', '色调分离'], ['threshold', '阈值'], ['gradientMap', '渐变映射'], ['selectiveColor', '可选颜色']];

let adjRenderer = null;
export function setAdjustmentsRenderer(fn) { adjRenderer = fn; refreshAdjustments(); }
export function refreshAdjustments() {
  const host = $('#panelAdjustments'); if (!host) return;
  if (adjRenderer) { adjRenderer(host); return; }
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  host.innerHTML = '';
  const head = mk('div', { className: 'adj-head', textContent: '添加调整' });
  const g = mk('div', { className: 'adj-grid', id: 'adjGrid' });
  const kinds = api.adjustKinds();   
  const byLabel = new Map(kinds.map(k => [k.label, k.kind]));
  for (const [id, label] of ADJ_ORDER) {
    const b = mk('button', { type: 'button' });
    b.append(uiIcon('adj-' + id, 18), Object.assign(document.createElement('span'), { className: 'adj-name', textContent: label }));
    const kind = byLabel.get(label) || kinds.find(k => k.kind === id)?.kind;
    b.title = kind ? `新建「${label}」调整图层` : `「${label}」调整图层：内核尚不支持从零新建`;
    b.disabled = !kind || !api.hasDoc();
    b.addEventListener('click', () => kind && api.addAdjustment(kind));
    g.appendChild(b);
  }
  host.append(head, g);
}










const CHAN_NAMES = {
  3: ['RGB', '红', '绿', '蓝'], 9: ['Lab', '明度', 'a', 'b'],
  1: ['灰色'], 8: ['灰色'], 0: ['位图'],
  4: ['CMYK', '青色', '洋红', '黄色', '黑色'], 7: ['多通道'],
};

function channelThumb(src, c, w = 26, h = 20) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  if (!src || !src.width || !src.height) return cv;
  const k = Math.min(w / src.width, h / src.height);
  const dw = Math.max(1, Math.round(src.width * k)), dh = Math.max(1, Math.round(src.height * k));
  const dx = Math.round((w - dw) / 2), dy = Math.round((h - dh) / 2);
  g.drawImage(src, dx, dy, dw, dh);
  if (c != null) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let o = 0; o < d.length; o += 4) { const v = d[o + c]; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  return cv;
}
export function refreshChannels(doc) {
  const el = $('#chanList'); if (!el) return;
  el.innerHTML = '';
  if (!doc) { el.innerHTML = ''; return; }
  const mode = doc.mode;
  const names = CHAN_NAMES[mode] || ['合成'];
  const view = api.channelView() || { single: null, off: new Set(), supported: true };
  const src = api.compositeCanvas();
  names.forEach((n, i) => {
    const isComposite = names.length > 1 && i === 0;
    const c = isComposite ? null : (names.length > 1 ? i - 1 : 0);
    const row = document.createElement('div');
    const on = isComposite ? (view.single === null && !view.off.size) : !view.off.has(c);
    const cur = isComposite ? view.single === null : view.single === c;
    row.className = 'chan-row' + (cur ? ' cur' : '');
    const eye = document.createElement('span');
    eye.className = 'eye' + (on ? '' : ' off'); eye.append(uiIcon(on ? 'eye' : 'eye-off', 12));
    eye.title = isComposite ? '显示 / 隐藏全部颜色通道' : `显示 / 隐藏「${n}」通道`;
    const th = document.createElement('span'); th.className = 'cthumb';
    const thumb = channelThumb(src, view.supported ? c : null);
    thumb.style.cssText = 'display:block;width:26px;height:20px;image-rendering:auto';
    th.appendChild(thumb);
    th.title = '⌘/Ctrl+点击 = 把这个通道当作选区载入';
    const nm = document.createElement('span'); nm.className = 'cname'; nm.textContent = n;
    const key = document.createElement('span'); key.className = 'ckey'; key.textContent = '⌘' + (2 + i);
    row.append(eye, th, nm, key);
    if (!view.supported) {
      row.style.opacity = '.65';
      row.title = 'CMYK / 多通道文档的预览是合成后的 RGB，没法在这里单独看某一个通道';
    } else {
      eye.addEventListener('click', e => { e.stopPropagation(); api.setChannelView({ toggle: isComposite ? 'all' : c }); });
      th.addEventListener('click', e => {
        if (!(e.metaKey || e.ctrlKey)) return;
        e.stopPropagation(); api.loadChannelSelection(c);
      });
      row.addEventListener('click', () => api.setChannelView({ single: isComposite ? null : c }));
    }
    el.appendChild(row);
  });
  


  const alphas = (api.alphaChannels && api.alphaChannels()) || [];
  alphas.forEach(a => {
    const row = document.createElement('div');
    row.className = 'chan-row chan-alpha';
    const eye = document.createElement('span');
    eye.className = 'eye off'; eye.append(uiIcon('eye-off', 12));
    eye.title = 'Alpha 通道只在通道面板里单独看；画布上的合成不显示它（与 PS 一致：默认不可见）';
    const th = document.createElement('span'); th.className = 'cthumb';
    const thumb = a.thumb;
    if (thumb) { thumb.style.cssText = 'display:block;width:26px;height:20px;image-rendering:auto'; th.appendChild(thumb); }
    th.title = '⌘/Ctrl+点击 = 把这条通道当作选区载入';
    th.addEventListener('click', e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.stopPropagation(); api.loadAlphaSelection(a.at);
    });
    const nm = document.createElement('span'); nm.className = 'cname'; nm.textContent = a.name;
    nm.title = '双击重命名';
    nm.addEventListener('dblclick', e => { e.stopPropagation(); api.renameAlpha(a.at); });
    row.append(eye, th, nm);
    el.appendChild(row);
  });
}





function pathThumb(subpaths, docW, docH, w = 30, h = 24) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  if (!subpaths || !subpaths.length || !docW || !docH) return cv;
  const k = Math.min((w - 2) / docW, (h - 2) / docH);
  const ox = (w - docW * k) / 2, oy = (h - docH * k) / 2;
  const X = x => ox + x * k, Y = y => oy + y * k;
  g.beginPath();
  for (const sp of subpaths) {
    const kn = sp.knots || []; if (!kn.length) continue;
    g.moveTo(X(kn[0].anchor[0]), Y(kn[0].anchor[1]));
    const n = kn.length, segs = sp.closed === false ? n - 1 : n;
    for (let i = 0; i < segs; i++) {
      const a = kn[i], b = kn[(i + 1) % n];
      g.bezierCurveTo(X(a.out[0]), Y(a.out[1]), X(b.in[0]), Y(b.in[1]), X(b.anchor[0]), Y(b.anchor[1]));
    }
    if (sp.closed !== false) g.closePath();
  }
  g.fillStyle = '#9a9a9a'; g.fill('evenodd');
  g.strokeStyle = '#333'; g.lineWidth = 1; g.stroke();
  return cv;
}
export function refreshPaths(layerTree) {
  const el = $('#pathList'); if (!el) return;
  el.innerHTML = '';
  const rows = api.pathRows ? api.pathRows() : [];
  if (!rows.length) {
    el.innerHTML = '';   
    return;
  }
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'path-row' + (r.current ? ' cur' : '');
    if (r.index != null) row.dataset.index = r.index;
    const th = document.createElement('span'); th.className = 'cthumb';
    const cv = pathThumb(r.subpaths, r.docW, r.docH);
    cv.style.cssText = 'display:block;width:30px;height:24px';
    th.appendChild(cv);
    const nm = document.createElement('span'); nm.className = 'cname'; nm.textContent = r.name;
    if (r.italic) nm.style.fontStyle = 'italic';   
    const tag = document.createElement('span'); tag.className = 'ckey'; tag.textContent = r.tag || '';
    row.title = r.title || r.name;
    row.append(th, nm, tag);
    row.addEventListener('click', e => { if (!(e.metaKey || e.ctrlKey)) api.onPathClick(r); });
    el.appendChild(row);
  }
}
export function refreshHistory(entries, cursor, source = -1) {
  const el = $('#histList'); if (!el) return;
  el.innerHTML = '';
  if (!entries || !entries.length) { el.innerHTML = ''; return; }
  entries.forEach((label, i) => {
    const row = document.createElement('div'); row.className = 'hist-row' + (i === cursor ? ' cur' : i > cursor ? ' future' : '');
    const pick=document.createElement('button');pick.type='button';pick.className='hist-source';
    pick.title='设为历史画笔源：'+label;pick.setAttribute('aria-label',pick.title);pick.setAttribute('aria-pressed',String(i===source));
    pick.style.cssText='flex:none;width:18px;height:18px;padding:0;border:1px solid #888;border-radius:50%;background:'+(i===source?'#b9d7ff':'transparent');
    pick.onclick=e=>{e.stopPropagation();api.onHistorySource(i);};
    row.append(pick,document.createTextNode(label));
    row.addEventListener('click', () => api.onHistoryJump(i));
    el.appendChild(row);
  });
}

export function init(a) {
  api = { ...api, ...a };
  initColorPanel(); initSwatches(); initPresets(); refreshAdjustments(); refreshChannels(null); refreshPaths(null); refreshHistory([], -1);
}
export const psPanels = { init, refreshColors, refreshAdjustments, setAdjustmentsRenderer, refreshChannels, refreshPaths, refreshHistory };
export default psPanels;
