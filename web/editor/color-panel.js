



























import { buildTransform, compileTransform, gamutChecker } from '../../core/color-convert.js';
import { uiIcon, hasUiIcon } from './icons.js';
import { sRGBProfile, loadGenericCmykProfile, xyzToLab, labToXyz } from '../../core/icc.js';

let A = null;
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hex2 = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
export const rgbHex = c => '#' + c.slice(0, 3).map(hex2).join('');
const sameRgb = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];


const KEY = 'fp.colorPanel.v1';
const MODES = [
  ['hueCube', '色相立方体'], ['brightCube', '亮度立方体'], ['wheel', '色轮'],
  null,
  ['gray', '灰度滑块'], ['rgb', 'RGB 滑块'], ['hsb', 'HSB 滑块'], ['cmyk', 'CMYK 滑块'], ['lab', 'Lab 滑块'], ['web', 'Web 颜色滑块'],
];
const RAMPS = [['rgb', 'RGB 色谱'], ['cmyk', 'CMYK 色谱'], ['gray', '灰度色谱'], ['current', '当前颜色']];
const S = { mode: 'hueCube', ramp: 'rgb', webRamp: false };
function loadSettings() { try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {} if (!MODES.some(m => m && m[0] === S.mode)) S.mode = 'hueCube'; }
function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }


function rgb2hsb([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, max ? d / max * 100 : 0, max * 100];
}
function hsb2rgb([h, s, v]) {
  s /= 100; v /= 100; h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const CMS = { key: '', src: null, cmyk: null, toC: null, fromC: null, fastFrom: null, fastTo: null, gamut: null, toPCS: null, fromPCS: null, ready: false };
async function ensureProfiles() {
  

  let src = null, cmyk = null, bpc = true;
  let intent = 1;
  try { const p = A.profiles ? await A.profiles() : null; if (p) { src = p.src; cmyk = p.cmyk; if (p.bpc != null) bpc = !!p.bpc; if (p.intent != null) intent = +p.intent; } } catch {}
  if (!src) src = sRGBProfile();
  if (!cmyk) { try { cmyk = await loadGenericCmykProfile(); } catch { cmyk = null; } }
  const key = (src && src.name) + '|' + (cmyk && cmyk.name) + '|' + intent + bpc;
  if (key === CMS.key) return;
  CMS.key = key; CMS.src = src; CMS.cmyk = cmyk;
  CMS.toPCS = src.toPCS(1); CMS.fromPCS = src.fromPCS(1);
  if (cmyk) {
    try {
      CMS.toC = buildTransform(src, cmyk, { intent, bpc }); CMS.fromC = buildTransform(cmyk, src, { intent, bpc });
      CMS.fastTo = compileTransform(CMS.toC, { grid: 17 }); CMS.fastFrom = compileTransform(CMS.fromC, { grid: 17, gridK: 9 });
      CMS.gamut = gamutChecker(src, cmyk, { intent });
    } catch (e) { console.warn('[color] CMYK 换算建不起来', e); CMS.toC = CMS.fromC = CMS.fastTo = CMS.fastFrom = CMS.gamut = null; }
  }
  CMS.ready = true;
  cache.clear();
  render();
}
const cache = new Map();
function rgb2cmyk(rgb) {
  const k = 'c' + rgb.join(','); if (cache.has(k)) return cache.get(k);
  let out;
  if (CMS.toC) { const o = new Float64Array(4); CMS.toC.eval([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], o); out = [...o].map(v => clamp(v * 100, 0, 100)); }
  else { const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, K = 1 - Math.max(r, g, b); out = K >= 1 ? [0, 0, 0, 100] : [(1 - r - K) / (1 - K) * 100, (1 - g - K) / (1 - K) * 100, (1 - b - K) / (1 - K) * 100, K * 100]; }
  if (cache.size > 4000) cache.clear();
  cache.set(k, out); return out;
}
const o3 = new Float64Array(3);
function cmyk2rgb(c, fast) {
  if (CMS.fromC) { const inp = [c[0] / 100, c[1] / 100, c[2] / 100, c[3] / 100]; if (fast && CMS.fastFrom) CMS.fastFrom.apply(inp, o3); else CMS.fromC.eval(inp, o3); return [0, 1, 2].map(i => Math.round(clamp(o3[i], 0, 1) * 255)); }
  const K = c[3] / 100; return [0, 1, 2].map(i => Math.round(255 * (1 - c[i] / 100) * (1 - K)));
}
function rgb2lab(rgb) {
  const xyz = [0, 0, 0];
  if (CMS.toPCS) CMS.toPCS([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], xyz);
  else { const P = sRGBProfile(); P.toPCS(1)([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], xyz); }
  return xyzToLab(xyz);
}
function lab2rgb(lab) {
  const xyz = labToXyz(lab), o = [0, 0, 0];
  (CMS.fromPCS || sRGBProfile().fromPCS(1))(xyz, o);
  return [0, 1, 2].map(i => Math.round(clamp(o[i], 0, 1) * 255));
}
const webSnap = v => Math.round(v / 51) * 51;
const isWebSafe = rgb => rgb.every(v => v % 51 === 0);
function outOfGamut(rgb) { return CMS.gamut ? CMS.gamut(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255) > 5 : false; }

function nearestPrintable(rgb) { return cmyk2rgb(rgb2cmyk(rgb)); }



const MODE_DEF = {
  gray: { ch: [{ k: 'K', min: 0, max: 100, unit: '%' }],
    toVals: rgb => [clamp(100 - rgb2lab(rgb)[0], 0, 100)],
    fromVals: v => lab2rgb([100 - v[0], 0, 0]) },
  rgb: { ch: [{ k: 'R', min: 0, max: 255 }, { k: 'G', min: 0, max: 255 }, { k: 'B', min: 0, max: 255 }],
    toVals: rgb => rgb.slice(0, 3), fromVals: v => v.map(x => Math.round(clamp(x, 0, 255))) },
  web: { ch: [{ k: 'R', min: 0, max: 255, hex: true }, { k: 'G', min: 0, max: 255, hex: true }, { k: 'B', min: 0, max: 255, hex: true }],
    toVals: rgb => rgb.slice(0, 3), fromVals: v => v.map(x => Math.round(clamp(x, 0, 255))) },
  hsb: { ch: [{ k: 'H', min: 0, max: 360, unit: '°', wrap: true }, { k: 'S', min: 0, max: 100, unit: '%' }, { k: 'B', min: 0, max: 100, unit: '%' }],
    toVals: rgb => rgb2hsb(rgb), fromVals: v => hsb2rgb(v) },
  cmyk: { ch: [{ k: 'C', min: 0, max: 100, unit: '%' }, { k: 'M', min: 0, max: 100, unit: '%' }, { k: 'Y', min: 0, max: 100, unit: '%' }, { k: 'K', min: 0, max: 100, unit: '%' }],
    toVals: rgb => rgb2cmyk(rgb), fromVals: (v, fast) => cmyk2rgb(v, fast) },
  lab: { ch: [{ k: 'L', min: 0, max: 100 }, { k: 'a', min: -128, max: 127 }, { k: 'b', min: -128, max: 127 }],
    toVals: rgb => rgb2lab(rgb), fromVals: v => lab2rgb(v) },
};


let active = 'fg';


const held = { rgb: null, mode: null, vals: null, hsb: null };
const curRGB = () => { const c = A.getColors(); return (active === 'fg' ? c.fg : c.bg).slice(0, 3); };
function valsFor(mode, rgb) {
  if (mode === 'hsb') return hsbFor(rgb);
  if (held.mode === mode && sameRgb(held.rgb, rgb) && held.vals) return held.vals.slice();
  return MODE_DEF[mode].toVals(rgb);
}
function hsbFor(rgb) {
  if (held.hsb && sameRgb(held.rgb, rgb)) return held.hsb.slice();
  const h = rgb2hsb(rgb);
  
  if (held.hsb && (h[1] === 0 || h[2] === 0)) h[0] = held.hsb[0];
  return h;
}
let dragging = false;
function setActiveColor(rgb, extra = {}) {
  rgb = rgb.map(v => clamp(Math.round(v), 0, 255));
  held.rgb = rgb.slice(); held.mode = extra.mode || null; held.vals = extra.vals ? extra.vals.slice() : null;
  held.hsb = extra.hsb ? extra.hsb.slice() : (extra.keepHue && held.hsb ? (() => { const h = rgb2hsb(rgb); if (h[1] === 0 || h[2] === 0) h[0] = held.hsb[0]; return h; })() : rgb2hsb(rgb));
  const c = A.getColors();
  if (active === 'fg') A.setColors(rgb, c.bg); else A.setColors(c.fg, rgb);
  render();
}
function setOther(rgb) {
  const c = A.getColors();
  if (active === 'fg') A.setColors(c.fg, rgb); else A.setColors(rgb, c.bg);
  render();
}


let root = null, els = {};
const WARN_GAMUT = '<svg viewBox="0 0 14 13" width="14" height="13"><path d="M7 .8 13.4 12.2H.6z" fill="#e8e8e8" stroke="#1d1d1d" stroke-width=".8"/><rect x="6.3" y="4.2" width="1.4" height="4.6" fill="#1d1d1d"/><rect x="6.3" y="9.6" width="1.4" height="1.4" fill="#1d1d1d"/></svg>';
const WARN_WEB = '<svg viewBox="0 0 14 14" width="14" height="14"><path d="M7 1 12.5 4v6L7 13 1.5 10V4z" fill="#d8d8d8" stroke="#1d1d1d" stroke-width=".8"/><path d="M1.5 4 7 7l5.5-3M7 7v6" fill="none" stroke="#1d1d1d" stroke-width=".8"/></svg>';

function build() {
  const sec = document.getElementById('panelColor'); if (!sec) return false;
  sec.innerHTML = '';
  root = mk('div', { className: 'cp2' });
  const left = mk('div', { className: 'cp2-left' });
  const chips = mk('div', { className: 'cp2-chips' });
  const fg = mk('button', { type: 'button', className: 'cp2-fg', title: '设置前景色（单击选中后在面板里编辑；再单击或双击打开拾色器）' });
  const bg = mk('button', { type: 'button', className: 'cp2-bg', title: '设置背景色（单击选中后在面板里编辑；再单击或双击打开拾色器）' });
  fg.dataset.attr = 'color-fg'; bg.dataset.attr = 'color-bg';
  chips.append(bg, fg);
  
  let pickTimer = 0;
  const chipClick = which => e => {
    if (e.detail > 1) return;                         
    if (active === which) { clearTimeout(pickTimer); pickTimer = setTimeout(() => A.openPicker && A.openPicker(which), 260); return; }
    active = which; held.rgb = null; render();
  };
  const chipDbl = which => () => { clearTimeout(pickTimer); active = which; render(); A.openPicker && A.openPicker(which); };
  fg.addEventListener('click', chipClick('fg')); bg.addEventListener('click', chipClick('bg'));
  fg.addEventListener('dblclick', chipDbl('fg')); bg.addEventListener('dblclick', chipDbl('bg'));
  const warn = mk('div', { className: 'cp2-warn' });
  const gw = mk('button', { type: 'button', className: 'cp2-gamut', title: '警告：打印时颜色超出色域（单击换成最接近的可打印颜色）' });
  if (hasUiIcon('gamut-warn')) gw.append(uiIcon('gamut-warn', 14)); else gw.innerHTML = WARN_GAMUT;   
  gw.append(mk('i')); gw.dataset.attr = 'color-gamut-warning';
  gw.addEventListener('click', () => { const rgb = nearestPrintable(curRGB()); setActiveColor(rgb); A.status && A.status(`已换成最接近的可打印颜色 ${rgbHex(rgb)}`); });
  const ww = mk('button', { type: 'button', className: 'cp2-websafe', title: '警告：不是 Web 安全颜色（单击换成最接近的 Web 安全颜色）' });
  if (hasUiIcon('web-warn')) ww.append(uiIcon('web-warn', 14)); else ww.innerHTML = WARN_WEB;       
  ww.append(mk('i')); ww.dataset.attr = 'color-web-warning';
  ww.addEventListener('click', () => { const rgb = curRGB().map(webSnap); setActiveColor(rgb); A.status && A.status(`已换成最接近的 Web 安全颜色 ${rgbHex(rgb)}`); });
  warn.append(gw, ww);
  left.append(chips, warn);
  const main = mk('div', { className: 'cp2-main' });
  const ramp = mk('canvas', { className: 'cp2-ramp', title: '色谱：单击取色（按住 Alt/⌥ 单击取到另一个色块）' });
  ramp.dataset.attr = 'color-ramp';
  root.append(left, main, ramp);
  sec.append(root);
  els = { fg, bg, gw, ww, main, ramp, left };
  bindRamp(ramp);
  if (typeof ResizeObserver === 'function') { try { new ResizeObserver(() => { if (!dragging) render(); }).observe(root); } catch {} }
  return true;
}


function fit(cv) {
  const r = cv.getBoundingClientRect();
  const w = Math.round(r.width), h = Math.round(r.height);
  if (!(w > 0 && h > 0)) return null;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function dragOn(el, onPick, onEnd) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch {}
    const r = () => el.getBoundingClientRect();
    onPick(e, r());
    const mv = ev => onPick(ev, r());
    const up = () => { dragging = false; el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onEnd && onEnd(); render(); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}


let cubeMode = null;
function buildCube() {
  const m = els.main; m.innerHTML = '';
  m.className = 'cp2-main cube';
  const field = mk('canvas', { className: 'cp2-field' });
  const bar = mk('canvas', { className: 'cp2-vbar' });
  const barWrap = mk('div', { className: 'cp2-vbar-wrap' });
  const pointer = uiIcon('color-slider-pointer', 9);
  pointer.classList.add('cp2-vbar-pointer');
  barWrap.append(bar, pointer);
  field.dataset.attr = 'color-field'; bar.dataset.attr = 'color-vbar';
  if (S.mode === 'wheel') { m.classList.add('wheel'); m.append(field); field.title = '色轮：外圈 = 色相，中间方块 = 饱和度 / 亮度'; }
  else { m.append(field, barWrap); field.title = S.mode === 'hueCube' ? '饱和度（横）/ 亮度（竖）' : '色相（横）/ 饱和度（竖）'; bar.title = S.mode === 'hueCube' ? '色相' : '亮度'; }
  els.field = field; els.bar = bar; els.pointer = pointer;
  let wheelPart = null;
  dragOn(field, (e, r) => {
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const h = hsbFor(curRGB());
    if (S.mode === 'hueCube') { h[1] = x * 100; h[2] = (1 - y) * 100; }
    else if (S.mode === 'brightCube') { h[0] = x * 360; h[1] = (1 - y) * 100; }
    else {
      const g = wheelGeom(r.width, r.height), px = e.clientX - r.left - g.cx, py = e.clientY - r.top - g.cy;
      if (e.type === 'pointerdown') wheelPart = Math.hypot(px, py) >= g.ri ? 'ring' : 'sq';
      if (wheelPart === 'ring') { h[0] = (Math.atan2(-py, px) * 180 / Math.PI + 360) % 360; }
      else { h[1] = clamp((px + g.sq / 2) / g.sq, 0, 1) * 100; h[2] = clamp(1 - (py + g.sq / 2) / g.sq, 0, 1) * 100; }
    }
    setActiveColor(hsb2rgb(h), { hsb: h });
  });
  dragOn(bar, (e, r) => {
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const h = hsbFor(curRGB());
    if (S.mode === 'hueCube') h[0] = Math.min(359.999, (1 - y) * 360); else h[2] = (1 - y) * 100;
    setActiveColor(hsb2rgb(h), { hsb: h });
  });
  cubeMode = S.mode;
}
function wheelGeom(W, H) {
  const R = Math.min(W, H) / 2 - 2, ring = Math.max(10, Math.round(R * 0.16)), ri = R - ring;
  return { cx: W / 2, cy: H / 2, R, ri, sq: Math.floor(ri * Math.SQRT2 * 0.92) };
}
function drawCube() {
  const rgb = curRGB(), h = hsbFor(rgb);
  const f = fit(els.field); if (!f) return;
  const { ctx, w: W, h: H } = f;
  ctx.clearRect(0, 0, W, H);
  if (S.mode === 'hueCube') {
    ctx.fillStyle = `rgb(${hsb2rgb([h[0], 100, 100])})`; ctx.fillRect(0, 0, W, H);
    let g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ring(ctx, h[1] / 100 * W, (1 - h[2] / 100) * H, h[2] > 55 && h[1] < 60);
  } else if (S.mode === 'brightCube') {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `rgb(${hsb2rgb([i * 30, 100, 100])})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, '#fff'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(0,0,0,${1 - h[2] / 100})`; ctx.fillRect(0, 0, W, H);
    ring(ctx, h[0] / 360 * W, (1 - h[1] / 100) * H, h[2] > 55 && h[1] < 50);
  } else {
    const G = wheelGeom(W, H);
    
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(0, G.cx, G.cy);
      for (let i = 0; i <= 12; i++) cg.addColorStop(i / 12, `rgb(${hsb2rgb([(360 - i * 30) % 360, 100, 100])})`);
      ctx.fillStyle = cg;
    } else ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, Math.PI * 2); ctx.arc(G.cx, G.cy, G.ri, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(G.cx, G.cy, G.ri, 0, Math.PI * 2); ctx.stroke();
    const a = h[0] * Math.PI / 180, rm = (G.R + G.ri) / 2;
    ring(ctx, G.cx + Math.cos(a) * rm, G.cy - Math.sin(a) * rm, false, (G.R - G.ri) / 2 - 1);
    const x0 = G.cx - G.sq / 2, y0 = G.cy - G.sq / 2;
    ctx.fillStyle = `rgb(${hsb2rgb([h[0], 100, 100])})`; ctx.fillRect(x0, y0, G.sq, G.sq);
    let g = ctx.createLinearGradient(x0, 0, x0 + G.sq, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x0, y0, G.sq, G.sq);
    g = ctx.createLinearGradient(0, y0, 0, y0 + G.sq); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(x0, y0, G.sq, G.sq);
    ctx.strokeRect(x0 - .5, y0 - .5, G.sq + 1, G.sq + 1);
    ring(ctx, x0 + h[1] / 100 * G.sq, y0 + (1 - h[2] / 100) * G.sq, h[2] > 55 && h[1] < 60);
  }
  if (S.mode === 'wheel') return;
  const b = fit(els.bar); if (!b) return;
  const c2 = b.ctx, bw = b.w, bh = b.h;
  const g = c2.createLinearGradient(0, 0, 0, bh);
  if (S.mode === 'hueCube') for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `rgb(${hsb2rgb([360 - i * 30, 100, 100])})`);
  else { g.addColorStop(0, `rgb(${hsb2rgb([h[0], h[1], 100])})`); g.addColorStop(1, '#000'); }
  c2.fillStyle = g; c2.fillRect(0, 0, bw, bh);
  const y = S.mode === 'hueCube' ? (1 - h[0] / 360) * bh : (1 - h[2] / 100) * bh;
  els.pointer.style.top = y + 'px';
}
function ring(ctx, x, y, dark, r = 5) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = dark ? '#000' : '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.lineWidth = .8; ctx.strokeStyle = dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)'; ctx.stroke();
}


let sliderMode = null;
function fmtVal(ch, v) { return ch.hex ? hex2(v).toUpperCase() : String(Math.round(v)); }
function parseVal(ch, s) {
  s = String(s).trim();
  if (ch.hex) { const n = parseInt(s.replace(/^#/, ''), 16); return Number.isFinite(n) ? n : null; }
  const n = parseFloat(s); return Number.isFinite(n) ? n : null;
}
function buildSliders() {
  const m = els.main; m.innerHTML = '';
  m.className = 'cp2-main sliders';
  const def = MODE_DEF[S.mode];
  els.rows = def.ch.map((ch, i) => {
    const row = mk('div', { className: 'cp2-row' });
    const lab = mk('span', { className: 'cp2-lab', textContent: ch.k, title: `${ch.k}：在字母上左右拖动可擦洗数值（⇧ ×10，⌥ 微调）` });
    const bar = mk('canvas', { className: 'cp2-bar' });
    const inp = mk('input', { type: 'text', className: 'cp2-num', spellcheck: false });
    inp.dataset.attr = 'color-' + S.mode + '-' + ch.k;
    bar.dataset.attr = 'color-bar-' + ch.k;
    row.append(lab, bar, inp);
    if (ch.unit) row.append(mk('span', { className: 'cp2-unit', textContent: ch.unit })); else row.append(mk('span', { className: 'cp2-unit' }));
    const setComp = (v, opts = {}) => {
      const rgb = curRGB(), vals = valsFor(S.mode, rgb);
      if (ch.wrap) v = ((v % 360) + 360) % 360; else v = clamp(v, ch.min, ch.max);
      if (S.mode === 'web' && opts.snap) v = webSnap(v);
      vals[i] = v;
      const out = def.fromVals(vals, false);
      setActiveColor(out, { mode: S.mode, vals, hsb: S.mode === 'hsb' ? vals : null, keepHue: true });
    };
    dragOn(bar, (e, r) => { const x = clamp((e.clientX - r.left - 3) / (r.width - 6), 0, 1); setComp(ch.min + x * (ch.max - ch.min), { snap: !e.altKey }); });
    
    const commitInp = () => { const v = parseVal(ch, inp.value); if (v != null) setComp(v); inp.value = fmtVal(ch, valsFor(S.mode, curRGB())[i]); };
    inp.addEventListener('change', commitInp);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitInp(); inp.select(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = parseVal(ch, inp.value) ?? 0, step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        setComp(cur + step); inp.value = fmtVal(ch, valsFor(S.mode, curRGB())[i]); inp.select();
      } else if (e.key === 'Escape') { render(); inp.blur(); }
      e.stopPropagation();
    });
    inp.addEventListener('focus', () => inp.select());
    
    lab.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; e.preventDefault();
      const x0 = e.clientX, v0 = valsFor(S.mode, curRGB())[i];
      dragging = true; try { lab.setPointerCapture(e.pointerId); } catch {}
      const range = ch.max - ch.min, unit = range > 200 ? 1 : range / 255 * 1.2;
      const mv = ev => { const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1; setComp(v0 + (ev.clientX - x0) * unit * k, { snap: S.mode === 'web' && !ev.altKey }); };
      const up = () => { dragging = false; lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); lab.removeEventListener('pointercancel', up); render(); };
      lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); lab.addEventListener('pointercancel', up);
    });
    m.append(row);
    return { row, lab, bar, inp, ch };
  });
  if (S.mode === 'web') {
    const row = mk('div', { className: 'cp2-row cp2-hexrow' });
    const inp = mk('input', { type: 'text', className: 'cp2-num cp2-hex', maxLength: 7, spellcheck: false, title: '十六进制颜色值' });
    inp.dataset.attr = 'color-web-hex';
    inp.addEventListener('change', () => { const h = inp.value.replace('#', '').trim(); if (!/^[0-9a-f]{6}$/i.test(h) && !/^[0-9a-f]{3}$/i.test(h)) { render(); return; }
      const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
      setActiveColor([0, 2, 4].map(k => parseInt(full.slice(k, k + 2), 16))); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.dispatchEvent(new Event('change')); inp.select(); } e.stopPropagation(); });
    row.append(mk('span', { className: 'cp2-lab', textContent: '#' }), inp);
    m.append(row);
    els.hexInp = inp;
  } else els.hexInp = null;
  sliderMode = S.mode;
}
function drawSliders() {
  const def = MODE_DEF[S.mode], rgb = curRGB(), vals = valsFor(S.mode, rgb);
  const N = S.mode === 'cmyk' || S.mode === 'lab' || S.mode === 'gray' ? 24 : 12;
  els.rows.forEach(({ bar, inp, ch }, i) => {
    if (document.activeElement !== inp) inp.value = fmtVal(ch, vals[i]);
    const f = fit(bar); if (!f) return;
    const { ctx, w: W, h: H } = f, th = H - 6, pad = 3;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(pad, 0, W - pad, 0);
    for (let k = 0; k <= N; k++) {
      const v = vals.slice(); v[i] = ch.min + (ch.max - ch.min) * k / N;
      g.addColorStop(k / N, `rgb(${def.fromVals(v, true)})`);
    }
    ctx.fillStyle = g; ctx.fillRect(pad, 0, W - pad * 2, th);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1; ctx.strokeRect(pad - .5, -.5 + 0.5, W - pad * 2 + 1, th);
    
    const x = pad + (clamp(vals[i], ch.min, ch.max) - ch.min) / (ch.max - ch.min) * (W - pad * 2);
    ctx.beginPath(); ctx.moveTo(x, th); ctx.lineTo(x + 4, H); ctx.lineTo(x - 4, H); ctx.closePath();
    ctx.fillStyle = '#e8e8e8'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.stroke();
  });
  if (els.hexInp && document.activeElement !== els.hexInp) els.hexInp.value = rgbHex(rgb).slice(1).toUpperCase();
}


let rampImg = null, rampKey = '';
function rampPixel(kind, x, y) {
  
  if (kind === 'gray') return [Math.round(x * 255), Math.round(x * 255), Math.round(x * 255)];
  const c = hsb2rgb([x * 360, 100, 100]);
  if (y < 0.5) { const t = y / 0.5; return c.map(v => Math.round(255 + (v - 255) * t)); }
  const t = (y - 0.5) / 0.5; return c.map(v => Math.round(v * (1 - t)));
}
function drawRamp() {
  const cv = els.ramp; const f = fit(cv); if (!f) return;
  const { ctx, w: W, h: H } = f;
  const c = A.getColors();
  const key = [S.ramp, S.webRamp, W, H, CMS.key, S.ramp === 'current' ? rgbHex(c.fg) + rgbHex(c.bg) : ''].join('|');
  if (key !== rampKey || !rampImg) {
    const dpr = cv.width / W, PW = cv.width, PH = cv.height;
    const im = ctx.createImageData(PW, PH), d = im.data;
    const endW = S.ramp === 'current' || S.ramp === 'gray' ? 0 : Math.round(10 * dpr);
    for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
      let rgb;
      if (px >= PW - endW) rgb = py < PH / 2 ? [255, 255, 255] : [0, 0, 0];
      else {
        const x = px / Math.max(1, PW - endW - 1), y = py / Math.max(1, PH - 1);
        if (S.ramp === 'current') rgb = [0, 1, 2].map(k => Math.round(c.fg[k] + (c.bg[k] - c.fg[k]) * x));
        else rgb = rampPixel(S.ramp === 'gray' ? 'gray' : 'rgb', x, y);
        if (S.ramp === 'cmyk') rgb = cmyk2rgb(rgb2cmykFast(rgb), true);
      }
      if (S.webRamp) rgb = rgb.map(webSnap);
      const o = (py * PW + px) * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
    }
    rampImg = im; rampKey = key;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(rampImg, 0, 0);
}
const o4 = new Float64Array(4);
function rgb2cmykFast(rgb) {
  if (CMS.fastTo) { CMS.fastTo.apply([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], o4); return [...o4].map(v => clamp(v * 100, 0, 100)); }
  return rgb2cmyk(rgb);
}
function bindRamp(cv) {
  let alt = false;
  dragOn(cv, (e, r) => {
    if (e.type === 'pointerdown') alt = e.altKey;
    const px = Math.round(clamp(e.clientX - r.left, 0, r.width - 1) * (cv.width / r.width)), py = Math.round(clamp(e.clientY - r.top, 0, r.height - 1) * (cv.height / r.height));
    if (!rampImg) return;
    const o = (py * rampImg.width + px) * 4, d = rampImg.data, rgb = [d[o], d[o + 1], d[o + 2]];
    if (alt) setOther(rgb); else setActiveColor(rgb);
  });
}


let rafPending = false;
let lastEnsure = 0;
export function render() {
  if (!root || !A) return;
  if (Date.now() - lastEnsure > 3000) { lastEnsure = Date.now(); ensureProfiles().catch(() => {}); }
  if (!root.isConnected) { if (!build()) return; cubeMode = sliderMode = null; }
  const c = A.getColors();
  els.fg.style.background = rgbHex(c.fg); els.bg.style.background = rgbHex(c.bg);
  els.fg.classList.toggle('on', active === 'fg'); els.bg.classList.toggle('on', active === 'bg');
  const isSlider = !['hueCube', 'brightCube', 'wheel'].includes(S.mode);
  root.dataset.mode = S.mode;
  root.classList.toggle('with-ramp', isSlider);
  if (isSlider) { if (sliderMode !== S.mode) { buildSliders(); cubeMode = null; } }
  else if (cubeMode !== S.mode) { buildCube(); sliderMode = null; }
  if (root.offsetParent === null) return;          
  if (isSlider) { drawSliders(); drawRamp(); } else drawCube();
  const rgb = curRGB();
  const oog = outOfGamut(rgb);
  els.gw.hidden = !oog;
  if (oog) els.gw.querySelector('i').style.background = rgbHex(nearestPrintable(rgb));
  const nw = !isWebSafe(rgb);
  els.ww.hidden = !nw;
  if (nw) els.ww.querySelector('i').style.background = rgbHex(rgb.map(webSnap));
}

export function refresh() {
  noteFgChange();
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => { rafPending = false; render(); });
}


async function copyText(s) {
  try { await navigator.clipboard.writeText(s); }
  catch { const t = mk('textarea', { value: s }); t.style.cssText = 'position:fixed;left:-9999px'; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); }
  A.status && A.status('已拷贝：' + s);
}
function menu() {
  const isSlider = !['hueCube', 'brightCube', 'wheel'].includes(S.mode);
  const set = (k, v) => () => { S[k] = v; saveSettings(); rampKey = ''; render(); };
  const items = [];
  for (const m of MODES) items.push(m ? { label: m[1], checked: S.mode === m[0], run: set('mode', m[0]) } : { sep: true });
  const hex = rgbHex(curRGB()).slice(1).toUpperCase();
  items.push({ sep: true },
    { label: '拷贝颜色的十六进制代码', run: () => copyText(hex) },
    { label: '拷贝颜色的 HTML 代码', run: () => copyText(`color="#${hex}"`) },
    { sep: true },
    { label: '建立 Web 安全曲线', checked: S.webRamp, run: () => { S.webRamp = !S.webRamp; saveSettings(); rampKey = ''; render(); },
      disabled: !isSlider, why: isSlider ? '' : '色谱只在滑块显示方式下出现' },
    { sep: true });
  for (const [k, l] of RAMPS) items.push({ label: l, checked: S.ramp === k, run: set('ramp', k), disabled: !isSlider, why: isSlider ? '' : '色谱只在滑块显示方式下出现（先切到某种滑块）' });
  return items;
}


const RECENT_KEY = 'fp.recentColors.v1';
const RECENT_MAX = 24;
const recentSubs = new Set();
let lastFg = null, recentTimer = 0;
export function recentColors() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(c => Array.isArray(c) && c.length >= 3) : []; } catch { return []; } }
export function noteRecentColor(rgb) {
  rgb = rgb.slice(0, 3).map(v => clamp(Math.round(v), 0, 255));
  const list = recentColors().filter(c => !sameRgb(c, rgb));
  list.unshift(rgb);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch {}
  for (const f of recentSubs) { try { f(); } catch {} }
}
export function clearRecentColors() { try { localStorage.removeItem(RECENT_KEY); } catch {} for (const f of recentSubs) { try { f(); } catch {} } }
export function onRecentColors(fn) { recentSubs.add(fn); return () => recentSubs.delete(fn); }

function noteFgChange() {
  if (!A) return;
  const fg = A.getColors().fg.slice(0, 3);
  if (lastFg === null) { lastFg = fg; return; }
  if (sameRgb(fg, lastFg)) return;
  lastFg = fg;
  clearTimeout(recentTimer);
  const settle = () => { if (dragging) { recentTimer = setTimeout(settle, 400); return; } noteRecentColor(A.getColors().fg); };
  recentTimer = setTimeout(settle, 1200);
}


const CSS = `
.cp2 { flex: 1 1 auto; min-height: 112px; display: grid; grid-template-columns: 38px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 8px; padding: 8px 8px 8px 6px; box-sizing: border-box; height: 180px; }
.cp2.with-ramp { min-height: 154px; grid-template-rows: minmax(96px, 1fr) 34px; }
.cp2-left { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.cp2-chips { position: relative; width: 36px; height: 36px; flex: none; }
.cp2-chips button { position: absolute; width: 23px; height: 23px; padding: 0; border: 1px solid #111; box-shadow: 0 0 0 1px #6a6a6a; border-radius: 1px; min-width: 0; min-height: 0; cursor: default; }
.cp2-chips .cp2-fg { left: 0; top: 0; z-index: 2; }
.cp2-chips .cp2-bg { right: 0; bottom: 0; z-index: 1; }
.cp2-chips button.on { box-shadow: 0 0 0 1px #111, 0 0 0 2px #e8e8e8; z-index: 3; }
.cp2-warn { display: flex; flex-direction: column; gap: 4px; }
.cp2-warn button { display: flex; flex-direction: row; align-items: center; gap: 3px; padding: 0; border: none; background: none; min-width: 0; min-height: 0; height: auto; cursor: default; }
.cp2-warn button[hidden] { display: none; }
.cp2-warn button i { display: block; width: 10px; height: 10px; border: 1px solid #ddd; }
.cp2-main { min-width: 0; min-height: 0; }
.cp2-main.cube { display: grid; grid-template-rows: minmax(0, 1fr); grid-template-columns: minmax(0, 1fr) 14px; gap: 12px; min-height: 90px; }
.cp2-main.cube.wheel { grid-template-columns: minmax(0, 1fr); }
.cp2-field, .cp2-vbar { contain: size; min-width: 0; width: 100%; height: 100%; min-height: 90px; display: block; border: 1px solid #111; box-sizing: border-box; }
.cp2-main.wheel .cp2-field { border: none; cursor: crosshair; }
.cp2-field { cursor: crosshair; }
.cp2-vbar-wrap { position: relative; min-height: 90px; min-width: 0; }
.cp2-vbar { cursor: ns-resize; }
.cp2-vbar-pointer { position: absolute; left: -8px; transform: translateY(-50%) rotate(90deg); pointer-events: none; }
.cp2-main.sliders { display: flex; flex-direction: column; justify-content: center; gap: 5px; align-self: start; }
.cp2-row { display: grid; grid-template-columns: 14px minmax(0, 1fr) 40px 12px; align-items: center; gap: 5px; font-size: 11px; color: var(--ps-text, #d6d6d6); }
.cp2-lab { cursor: ew-resize; user-select: none; text-align: center; }
.cp2-bar { width: 100%; height: 16px; display: block; }
.cp2-num { width: 40px; height: 20px; box-sizing: border-box; font-size: 11px; padding: 0 3px; text-align: right; }
.cp2-unit { font-size: 10px; color: var(--ps-muted, #a0a0a0); }
.cp2-hexrow { grid-template-columns: 14px 70px; }
.cp2-hexrow .cp2-lab { cursor: default; }
.cp2-hex { width: 70px; text-align: left; font-family: ui-monospace, Menlo, monospace; }
.cp2-ramp { grid-column: 1 / -1; width: 100%; height: 34px; display: none; border: 1px solid #111; box-sizing: border-box; cursor: crosshair; }
.cp2.with-ramp .cp2-ramp { display: block; }
`;


export function installColorPanel(api) {
  A = api;
  loadSettings();
  if (!document.getElementById('cp2Css')) document.head.append(mk('style', { id: 'cp2Css', textContent: CSS }));
  if (!build()) return null;
  if (api.panels && api.panels.setPanelMenu) api.panels.setPanelMenu('color', menu);
  if (api.panels && api.panels.onChange) { try { api.panels.onChange(() => requestAnimationFrame(render)); } catch {} }
  lastFg = api.getColors().fg.slice(0, 3);
  render();
  ensureProfiles().catch(e => console.warn('[color] 配置文件', e));
  return colorPanel;
}
export const colorPanel = {
  render, refresh, menu, settings: S, recentColors, noteRecentColor, clearRecentColors, onRecentColors,
  reloadProfiles: () => { CMS.key = ''; return ensureProfiles(); },
  get active() { return active; }, setActive(w) { active = w === 'bg' ? 'bg' : 'fg'; held.rgb = null; render(); },
  setMode(m) { if (MODE_DEF[m] || ['hueCube', 'brightCube', 'wheel'].includes(m)) { S.mode = m; saveSettings(); render(); } },
  _conv: { rgb2cmyk, cmyk2rgb, rgb2lab, lab2rgb, outOfGamut, nearestPrintable, isWebSafe },
};
if (typeof window !== 'undefined') window.__psd_editorColorPanel = colorPanel;
