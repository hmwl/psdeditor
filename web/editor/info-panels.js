













import { sRGBProfile, xyzToLab } from '../../core/icc.js';

let A = null;
const $ = s => document.querySelector(s);
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const anchorOf = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, alignLeft: true }; };


const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rgb2hsb([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [Math.round(h), Math.round(mx ? d / mx * 100 : 0), Math.round(mx * 100)];
}

const SRGB_TO_PCS = sRGBProfile().toPCS(1);
function rgb2lab([r, g, b]) {
  const xyz = [0, 0, 0];
  SRGB_TO_PCS([r / 255, g / 255, b / 255], xyz);
  return xyzToLab(xyz).map(v => Math.round(v));
}
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const naiveCMYK = c => { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, k = 1 - Math.max(r, g, b);
  return k >= 1 ? [0, 0, 0, 100] : [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map(v => Math.round(v * 100)); };
const cmykOf = (c,pt,native=true) => (native&&pt&&A?.nativeCmykAt&&A.nativeCmykAt(pt.x,pt.y)) || (A && A.cmyk && A.cmyk(c)) || naiveCMYK(c);
const hex2 = v => clamp(Math.round(v), 0, 255).toString(16).toUpperCase().padStart(2, '0');


const MODES = [
  ['actual', '实际颜色', 0xFFFF], ['proof', '校样颜色', 2], ['gray', '灰度', 8], ['rgb', 'RGB 颜色', 0], ['web', 'Web 颜色', 16],
  ['hsb', 'HSB 颜色', 1], ['cmyk', 'CMYK 颜色', 2], ['lab', 'Lab 颜色', 7], ['ink', '油墨总量', 12], ['opacity', '不透明度', 15],
];
const MODE_LABEL = Object.fromEntries(MODES.map(m => [m[0], m[1]]));
const csToMode = cs => cs === 0xFFFF || cs === -1 ? 'actual' : ({ 0: 'rgb', 1: 'hsb', 2: 'cmyk', 7: 'lab', 8: 'gray', 12: 'ink', 15: 'opacity', 16: 'web' })[cs] || 'rgb';

function actualMode() { const m = A.docInfo().mode; return m === 4 ? 'cmyk' : m === 9 ? 'lab' : (m === 1 || m === 8) ? 'gray' : 'rgb'; }

function readout(mode, c, pt) {
  if (mode === 'actual') mode = actualMode();
  const v = (f) => c ? f() : '';
  switch (mode) {
    case 'proof': case 'cmyk': { const k = c ? cmykOf(c,pt,mode!=='proof') : null; return [['C:', k ? Math.round(k[0]) + '%' : ''], ['M:', k ? Math.round(k[1]) + '%' : ''], ['Y:', k ? Math.round(k[2]) + '%' : ''], ['K:', k ? Math.round(k[3]) + '%' : '']]; }
    case 'gray': return [['K:', v(() => Math.round(100 - lum(c) / 255 * 100) + '%')]];
    case 'web': return [['R:', v(() => hex2(c[0]))], ['G:', v(() => hex2(c[1]))], ['B:', v(() => hex2(c[2]))]];
    case 'hsb': { const h = c ? rgb2hsb(c) : null; return [['H:', h ? h[0] + '°' : ''], ['S:', h ? h[1] + '%' : ''], ['B:', h ? h[2] + '%' : '']]; }
    case 'lab': { const l = c ? rgb2lab(c) : null; return [['L:', l ? l[0] : ''], ['a:', l ? l[1] : ''], ['b:', l ? l[2] : '']]; }
    case 'ink': { const k = c ? cmykOf(c,pt) : null; return [['总计:', k ? Math.round(k[0] + k[1] + k[2] + k[3]) + '%' : '']]; }
    case 'opacity': { const a = pt && A.layerAlphaAt ? A.layerAlphaAt(pt.x, pt.y) : null; return [['不透明度:', a == null ? '' : Math.round(a / 255 * 100) + '%']]; }
    default: return [['R:', v(() => c[0])], ['G:', v(() => c[1])], ['B:', v(() => c[2])]];
  }
}


const STATUS_ITEMS = [
  ['docSizes', '文档大小'], ['profile', '文档配置文件'], ['dims', '文档尺寸'], ['scale', '测量比例'], ['scratch', '暂存盘大小'],
  ['efficiency', '效率'], ['timing', '计时'], ['tool', '当前工具'], ['exposure', '32 位曝光'], ['saveProgress', '存储进度'],
  ['smartObjects', '智能对象'], ['layerCount', '图层计数'],
];
const INFO_KEY = 'fp.infoPanel';
const infoOpt = Object.assign({ first: 'actual', second: 'cmyk', unit: '', status: ['docSizes'], tips: true }, LS.get(INFO_KEY, {}));
const saveInfoOpt = () => LS.set(INFO_KEY, infoOpt);
let infoPt = null, infoRaf = 0, lastOp = { t0: 0, ms: null };
const UNITS = [['px', '像素'], ['in', '英寸'], ['cm', '厘米'], ['mm', '毫米'], ['pt', '点'], ['pc', '派卡'], ['pct', '百分比']];
const unitKey = () => infoOpt.unit || A.rulerUnit();
function fmtLen(v, axis) {
  if (v == null || !Number.isFinite(v)) return '';
  const u = unitKey();
  if (u === 'pct') { const { w, h } = A.docInfo(); return (v / (axis === 'y' ? h : w) * 100).toFixed(1); }
  const per = A.unitPer(u) || 1;
  return (v / per).toFixed(u === 'px' ? 0 : 2);
}

const TOOL_TIPS = {
  move: '点按并拖移以移动图层或选区。要用附加选项，使用 Shift 和 ⌥/Alt 键。',
  artboard: '点按并拖移以创建画板，或移动已有的画板。',
  selRect: '点按并拖移以创建矩形选区。要用附加选项，使用 Shift、⌥/Alt 和 ⌘/Ctrl 键。',
  selEllipse: '点按并拖移以创建椭圆选区。要用附加选项，使用 Shift、⌥/Alt 和 ⌘/Ctrl 键。',
  selRow: '点按以创建一个像素高的选区。', selCol: '点按以创建一个像素宽的选区。',
  lasso: '点按并拖移以绘制手绘选区。要用附加选项，使用 Shift、⌥/Alt 和 ⌘/Ctrl 键。',
  lassoPoly: '点按以绘制多边形选区的各个角点；双击或点起点闭合。',
  lassoMagnetic: '点按并沿着对象边缘移动以创建选区。',
  quickSelect: '点按并拖移以根据颜色和纹理相似性快速选择。', objectSelect: '在对象周围拖出一个框以选择对象。',
  wand: '点按以选择颜色相近的区域。要用附加选项，使用 Shift、⌥/Alt 和 ⌘/Ctrl 键。',
  crop: '拖移以创建裁剪框；拖控制柄调整，回车提交。', cropPerspective: '点按四个角点以创建透视裁剪框。',
  eyedropper: '点按图像以选取新的前景色。要用附加选项，使用 ⌥/Alt 键。',
  colorSampler: '点按以放置新的颜色取样点（最多 10 个）。拖移可移动取样点，⌥/Alt 点按可删除。',
  ruler: '点按并拖移以测量距离与角度。⌥/Alt 从端点拖可创建量角器。',
  note: '点按以放置注释。', count: '点按以添加计数标记。',
  spotHeal: '点按或拖移以修复污点。', healBrush: '⌥/Alt 点按以定义取样点，然后在要修复的区域涂抹。',
  patch: '拖移以选择要修补的区域，然后拖到源区域。', contentMove: '选择对象后拖到新位置。', redEye: '点按红眼以去除。',
  brush: '点按并拖移以使用前景色绘画。要用附加选项，使用 Shift、⌥/Alt 和 ⌘/Ctrl 键。',
  pencil: '点按并拖移以绘制硬边线条。', colorReplace: '拖移以用前景色替换颜色。', mixerBrush: '点按并拖移以混合颜色。',
  cloneStamp: '⌥/Alt 点按以定义取样点，然后在别处拖移以复制该区域。', patternStamp: '拖移以用图案绘画。',
  historyBrush: '拖移以恢复到历史记录源状态。', historyArtBrush: '拖移以用历史记录源的风格化描边绘画。',
  eraser: '点按并拖移以擦除为背景色或透明。', backgroundEraser: '拖移以将背景擦除为透明。', magicEraser: '点按以擦除颜色相近的区域。',
  gradient: '点按并拖移以创建渐变。要用附加选项，使用 Shift 键。', bucket: '点按以用前景色或图案填充相近颜色的区域。',
  blur: '拖移以模糊。', sharpen: '拖移以锐化。', smudge: '拖移以涂抹。', dodge: '拖移以减淡（加亮）。', burn: '拖移以加深（变暗）。', sponge: '拖移以改变饱和度。',
  pen: '点按以创建锚点，拖移以创建曲线。', penFree: '拖移以绘制路径。', penCurvature: '点按以创建平滑曲线的锚点。',
  addAnchor: '点按路径以添加锚点。', deleteAnchor: '点按锚点以删除。', convertPoint: '点按或拖移锚点以转换其类型。',
  text: '点按以放置插入点，或拖移以创建段落文字框。', textVertical: '点按以放置直排插入点，或拖移以创建段落文字框。',
  textMask: '点按以创建文字选区。', textMaskVertical: '点按以创建直排文字选区。',
  pathSelect: '点按以选择路径，拖移以移动。', path: '点按以选择锚点或路径段，拖移以调整。',
  shape: '点按并拖移以绘制形状。要用附加选项，使用 Shift 和 ⌥/Alt 键。',
  hand: '拖移以滚动画面。', rotateView: '拖移以旋转视图。', zoom: '点按以放大，⌥/Alt 点按以缩小，或拖移以框选放大。',
  slice: '拖移以创建切片。', sliceSelect: '点按以选择切片。', frame: '拖移以创建图框。',
};
function statusLine(key) {
  const d = A.docInfo();
  switch (key) {
    case 'docSizes': return `文档：${d.sizes || ''}`;
    case 'profile': return `文档配置文件：${A.profileName() || '未标记的 ' + (d.mode === 4 ? 'CMYK' : d.mode === 1 || d.mode === 8 ? '灰度' : 'RGB')}（${d.depth} 位/通道）`;
    case 'dims': { const u = unitKey() === 'pct' ? 'px' : unitKey(); const per = A.unitPer(u) || 1, nm = (UNITS.find(x => x[0] === u) || UNITS[0])[1];
      return `文档尺寸：${(d.w / per).toFixed(u === 'px' ? 0 : 2)} ${nm} × ${(d.h / per).toFixed(u === 'px' ? 0 : 2)} ${nm}（${Math.round(d.res)} ppi）`; }
    case 'scale': { const s = A.measureScale && A.measureScale(); return `测量比例：${s ? `${s.px} 像素 = ${s.len} ${s.unit}` : '1 像素 = 1.0000 像素'}`; }
    case 'scratch': { const m = performance && performance.memory; const f = n => (n / 1048576).toFixed(1) + 'M';
      return m ? `暂存盘：${f(m.usedJSHeapSize)}/${f(m.jsHeapSizeLimit)}` : '暂存盘：浏览器未提供内存用量'; }
    case 'efficiency': return '效率：100%';     
    case 'timing': return `计时：${lastOp.ms == null ? '—' : (lastOp.ms / 1000).toFixed(1) + ' 秒'}`;
    case 'tool': return `当前工具：${A.toolLabel(A.currentTool())}`;
    case 'exposure': return d.depth === 32 ? `32 位曝光：${(A.exposure ? A.exposure() : 0).toFixed(2)}` : '32 位曝光：（仅 32 位/通道文档）';
    case 'saveProgress': { const s = A.saveProgress && A.saveProgress(); return `存储进度：${s == null ? '空闲' : Math.round(s * 100) + '%'}`; }
    case 'smartObjects': { const n = A.smartObjectCount(); return `智能对象：${n ? n + ' 个' : '无'}`; }
    case 'layerCount': return `图层计数：${A.layerCount()}`;
  }
  return '';
}
function eyeBtn(kind, idx) {
  return `<button type="button" class="ip-pick" data-pick="${kind}"${idx != null ? ` data-i="${idx}"` : ''} title="点按以更改读数模式">${A.iconHtml('eyedropper', 11)}${idx != null ? `<b>${idx + 1}</b>` : ''}</button>`;
}
function readBlock(rows, extra = '') {
  return rows.map(([l, v]) => `<span class="ip-l">${esc(l)}</span><span class="ip-v">${esc(v)}</span>`).join('') + extra;
}
function syncInfo() {
  const host = $('#infoPanel'); if (!host || !A) return;
  try { if (!A.panels.isVisible('info')) return; } catch { return; }
  host.classList.add('ip-panel');
  if (!A.hasDoc()) { host.innerHTML = '<div class="panel-empty">没有打开的文档</div>'; return; }
  const d = A.docInfo();
  const inDoc = infoPt && infoPt.x >= 0 && infoPt.y >= 0 && infoPt.x < d.w && infoPt.y < d.h;
  const c = inDoc ? A.colorAt(infoPt.x, infoPt.y) : null;
  const bits = `<span class="ip-l"></span><span class="ip-v ip-bits">${d.depth} 位</span>`;
  let html = `<div class="ip-sec ip-two">`
    + `<div class="ip-cell">${eyeBtn('first')}<div class="ip-grid">${readBlock(readout(infoOpt.first, c, infoPt), bits)}</div></div>`
    + `<div class="ip-cell">${eyeBtn('second')}<div class="ip-grid">${readBlock(readout(infoOpt.second, c, infoPt), bits)}</div></div></div>`;
  
  const xy = [['X:', infoPt ? fmtLen(infoPt.x, 'x') : ''], ['Y:', infoPt ? fmtLen(infoPt.y, 'y') : '']];
  let wh = null, whIcon = 'info-wh', more = '';
  const tf = A.transform(), mv = A.moveDrag(), cr = A.crop(), sd = A.selDrag(), rm = A.rulerMetrics(), sb = A.selectionBounds();
  if (tf) {
    wh = [['W:', tf.sx != null ? (tf.sx * 100).toFixed(1) + '%' : ''], ['H:', tf.sy != null ? (tf.sy * 100).toFixed(1) + '%' : '']];
    more = `<div class="ip-sec ip-two"><div class="ip-cell"><span class="ip-ico">${A.iconHtml('rotate-ccw', 11)}</span><div class="ip-grid">${readBlock([['A:', (+tf.rot || 0).toFixed(1) + '°'], ['H:', (+tf.skewX || 0).toFixed(1) + '°'], ['V:', (+tf.skewY || 0).toFixed(1) + '°']])}</div></div>`
      + `<div class="ip-cell"><span class="ip-ico">${A.iconHtml('mouse-pointer', 11)}</span><div class="ip-grid">${readBlock([['ΔX:', fmtLen(tf.dx, 'x')], ['ΔY:', fmtLen(tf.dy, 'y')]])}</div></div></div>`;
  } else if (mv && infoPt) {
    const dx = infoPt.x - mv.x, dy = infoPt.y - mv.y;
    wh = [['ΔX:', fmtLen(dx, 'x')], ['ΔY:', fmtLen(dy, 'y')]];
    more = `<div class="ip-sec ip-two"><div class="ip-cell"><span class="ip-ico">${A.iconHtml('rotate-ccw', 11)}</span><div class="ip-grid">${readBlock([['A:', (Math.atan2(-dy, dx) * 180 / Math.PI).toFixed(1) + '°'], ['D:', fmtLen(Math.hypot(dx, dy), 'x')]])}</div></div><div class="ip-cell"></div></div>`;
  } else if (cr) {
    wh = [['W:', fmtLen(cr.w, 'x')], ['H:', fmtLen(cr.h, 'y')]];
    if (cr.angle) more = `<div class="ip-sec"><div class="ip-grid">${readBlock([['A:', (+cr.angle).toFixed(1) + '°']])}</div></div>`;
  } else if (rm) {
    wh = [['W:', fmtLen(rm.dx, 'x')], ['H:', fmtLen(-rm.dy, 'y')]];
    more = `<div class="ip-sec ip-two"><div class="ip-cell"><span class="ip-ico">${A.iconHtml('rotate-ccw', 11)}</span><div class="ip-grid">${readBlock([['A:', rm.displayAngle.toFixed(1) + '°'], ['L:', fmtLen(rm.length, 'x')]].concat(rm.length2 != null ? [['L2:', fmtLen(rm.length2, 'x')]] : []))}</div></div><div class="ip-cell"></div></div>`;
  } else if (sd && sd.x1 != null) {
    wh = [['W:', fmtLen(Math.abs(sd.x1 - sd.x0), 'x')], ['H:', fmtLen(Math.abs(sd.y1 - sd.y0), 'y')]];
  } else wh = [['W:', sb ? fmtLen(sb.width, 'x') : ''], ['H:', sb ? fmtLen(sb.height, 'y') : '']];
  html += `<div class="ip-sec ip-two"><div class="ip-cell"><button type="button" class="ip-pick" data-pick="unit" title="点按以更改鼠标坐标的单位">${A.iconHtml('info-xy', 11)}</button><div class="ip-grid">${readBlock(xy)}</div></div>`
    + `<div class="ip-cell"><span class="ip-ico">${A.iconHtml(whIcon, 11)}</span><div class="ip-grid">${readBlock(wh)}</div></div></div>` + more;
  
  const list = A.samplers();
  if (list.length) {
    const sp = A.samplerColors();
    let cells = '';
    list.forEach((p, i) => {
      const s = sp[i] || null, m = csToMode(p.colorSpace);
      cells += `<div class="ip-cell">${eyeBtn('sampler', i)}<div class="ip-grid">${readBlock(readout(m, s, { x: p.horizontal, y: p.vertical }))}</div></div>`;
    });
    if (list.length % 2) cells += '<div class="ip-cell"></div>';
    html += `<div class="ip-sec ip-two ip-samplers">${cells}</div>`;
  }
  const st = STATUS_ITEMS.filter(([k]) => infoOpt.status.includes(k)).map(([k]) => `<div>${esc(statusLine(k))}</div>`).join('');
  if (st) html += `<div class="ip-sec ip-status">${st}</div>`;
  if (infoOpt.tips) { const t = TOOL_TIPS[A.currentTool()]; if (t) html += `<div class="ip-sec ip-tip">${esc(t)}</div>`; }
  { const cn = A.cmykNote && A.cmykNote(); const usesCmyk = [infoOpt.first, infoOpt.second].some(m => m === 'cmyk' || m === 'proof' || m === 'ink' || (m === 'actual' && actualMode() === 'cmyk'));
    if (usesCmyk) html += `<div class="ip-note">${cn ? esc(cn) : 'CMYK 为未经色彩管理的换算值'}</div>`; }
  host.innerHTML = html;
}
function modeMenu(cur, set, withActual = true) {
  return MODES.filter(m => withActual || m[0] !== 'actual').map(([k, l], i) => ({ label: l, checked: cur === k, run: () => set(k) }));
}
function onInfoClick(e) {
  const b = e.target.closest && e.target.closest('.ip-pick'); if (!b) return;
  e.stopPropagation();
  const kind = b.dataset.pick;
  if (kind === 'first' || kind === 'second')
    A.panels.popup(modeMenu(infoOpt[kind], k => { infoOpt[kind] = k; saveInfoOpt(); syncInfo(); }), anchorOf(b));
  else if (kind === 'unit')
    A.panels.popup(UNITS.map(([k, l]) => ({ label: l, checked: unitKey() === k, run: () => { infoOpt.unit = k; saveInfoOpt(); syncInfo(); } })), anchorOf(b));
  else if (kind === 'sampler') {
    const i = +b.dataset.i, p = A.samplers()[i]; if (!p) return;
    A.panels.popup(modeMenu(csToMode(p.colorSpace), k => { A.setSamplerColorSpace(i, MODES.find(m => m[0] === k)[2]); syncInfo(); }), anchorOf(b));
  }
}

let infoDlg = null;
function openInfoOptions() {
  if (!infoDlg) {
    infoDlg = mk('dialog', { className: 'fp-dlg ip-dlg' });
    const opts = sel => MODES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    infoDlg.innerHTML = `<form method="dialog" class="fp-dlg-form"><h3 class="fp-dlg-title">信息面板选项</h3>
      <fieldset><legend>第一颜色信息</legend><label>模式：<select data-k="first">${opts()}</select></label></fieldset>
      <fieldset><legend>第二颜色信息</legend><label>模式：<select data-k="second">${opts()}</select></label></fieldset>
      <fieldset><legend>鼠标坐标</legend><label>标尺单位：<select data-k="unit">${UNITS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></fieldset>
      <fieldset><legend>状态信息</legend><div class="ip-dlg-st">${STATUS_ITEMS.map(([k, l]) => `<label><input type="checkbox" data-st="${k}"> ${l}</label>`).join('')}</div></fieldset>
      <label class="ip-dlg-tips"><input type="checkbox" data-k="tips"> 显示工具提示</label>
      <div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button><button type="button" class="fp-dlg-ok primary" value="ok">确定</button></div></form>`;
    document.body.append(infoDlg);
    const close = () => { try { infoDlg.close(); } catch { infoDlg.removeAttribute('open'); } };
    infoDlg.querySelector('.fp-dlg-cancel').onclick = close;
    infoDlg.querySelector('.fp-dlg-ok').onclick = () => {
      const q = s => infoDlg.querySelector(s);
      infoOpt.first = q('[data-k=first]').value; infoOpt.second = q('[data-k=second]').value; infoOpt.unit = q('[data-k=unit]').value;
      infoOpt.tips = q('[data-k=tips]').checked;
      infoOpt.status = [...infoDlg.querySelectorAll('[data-st]')].filter(x => x.checked).map(x => x.dataset.st);
      saveInfoOpt(); close(); syncInfo();
    };
    infoDlg.addEventListener('keydown', e => e.stopPropagation());
  }
  const q = s => infoDlg.querySelector(s);
  q('[data-k=first]').value = infoOpt.first; q('[data-k=second]').value = infoOpt.second; q('[data-k=unit]').value = unitKey();
  q('[data-k=tips]').checked = !!infoOpt.tips;
  for (const x of infoDlg.querySelectorAll('[data-st]')) x.checked = infoOpt.status.includes(x.dataset.st);
  try { infoDlg.showModal(); } catch { infoDlg.setAttribute('open', ''); }
}
function scheduleInfo() {
  if (infoRaf) return;
  infoRaf = requestAnimationFrame(() => { infoRaf = 0; syncInfo(); });
}

function onPointer(ev) {
  if (!A) return;
  let vis = false; try { vis = A.panels.isVisible('info'); } catch {}
  if (!vis) return;
  const vp = $('#viewport'); if (!vp) return;
  const inside = ev.target && ev.target.closest ? !!ev.target.closest('#viewport') : false;
  if (inside || ev.buttons) { if (A.hasDoc()) infoPt = A.toDoc(ev); }
  else if (infoPt) infoPt = null;
  else return;
  scheduleInfo();
}

function markStart(e) { if (e.isTrusted !== false) lastOp.t0 = performance.now(); }
function noteOp() { if (lastOp.t0) { lastOp.ms = performance.now() - lastOp.t0; lastOp.t0 = 0; } }


const NAV_COLORS = [['#ff3232', '浅红色'], ['#c80000', '红色'], ['#ff8c00', '橙色'], ['#ffe600', '黄色'], ['#00c800', '绿色'], ['#0064ff', '蓝色'], ['#b400ff', '紫色'], ['#808080', '灰色'], ['#000000', '黑色'], ['#ffffff', '白色']];
const NAV_KEY = 'fp.navigator';
const navOpt = Object.assign({ color: '#ff3232' }, LS.get(NAV_KEY, {}));
let navState = { gen: '', w: 0, t: 0, drag: null, sig: '' };
function buildNavigator() {
  const host = $('#navPanel'); if (!host) return;
  host.classList.add('nv-panel');
  host.innerHTML = '';
  const view = mk('div', { className: 'nav-view' });
  const cv = mk('canvas', { id: 'navCanvas', width: 220, height: 160 });
  const box = mk('div', { id: 'navBox' });
  const zoomRect = mk('div', { className: 'nv-zrect', hidden: true });
  view.append(cv, box, zoomRect);
  const row = mk('div', { className: 'nav-zoom' });
  const pct = mk('input', { id: 'navPct', type: 'text', className: 'nv-pct', value: '100%', title: '缩放比例（回车生效）' });
  const out = mk('button', { type: 'button', id: 'navOut', className: 'nv-btn', title: '缩小' }); out.append(A.uiIcon('zoom-out-mtn', 12));
  const sl = mk('input', { id: 'navZoom', type: 'range', min: 0, max: 1000, value: 500, title: '缩放' });
  const inn = mk('button', { type: 'button', id: 'navIn', className: 'nv-btn', title: '放大' }); inn.append(A.uiIcon('zoom-in-mtn', 12));
  row.append(pct, out, sl, inn);
  host.append(view, row);
  pct.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const v = parseFloat(String(pct.value).replace('%', '')); if (A.hasDoc() && Number.isFinite(v) && v > 0) A.setZoom(v / 100); pct.blur(); refreshNavigator(true); }
    if (e.key === 'Escape') { pct.blur(); refreshNavigator(true); }
  });
  pct.addEventListener('blur', () => refreshNavigator(true));
  sl.addEventListener('input', () => { if (!A.hasDoc()) return; A.setZoom(0.01 * Math.pow(3200, +sl.value / 1000)); refreshNavigator(true); });
  out.onclick = () => { if (A.hasDoc()) { A.setZoom(A.nextZoomStep(-1)); refreshNavigator(true); } };
  inn.onclick = () => { if (A.hasDoc()) { A.setZoom(A.nextZoomStep(1)); refreshNavigator(true); } };
  const docPt = e => { const rc = cv.getBoundingClientRect(), { w, h } = A.docInfo(); return { x: (e.clientX - rc.left) / rc.width * w, y: (e.clientY - rc.top) / rc.height * h }; };
  view.addEventListener('pointerdown', e => {
    if (!A.hasDoc() || e.button !== 0) return;
    e.preventDefault();
    try { view.setPointerCapture(e.pointerId); } catch {}
    const p = docPt(e), r = A.visibleDocRect();
    if (e.metaKey || e.ctrlKey) { navState.drag = { zoom: true, p0: p, c0: { x: e.clientX, y: e.clientY } }; return; }
    const inBox = r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (!inBox && r) A.centerOn(p.x, p.y);                  
    const r2 = A.visibleDocRect() || r;
    navState.drag = { off: r2 ? { x: p.x - (r2.x + r2.w / 2), y: p.y - (r2.y + r2.h / 2) } : { x: 0, y: 0 } };
    refreshNavigator(true);
  });
  view.addEventListener('pointermove', e => {
    const d = navState.drag; if (!d) return;
    if (d.zoom) {
      const vr = view.getBoundingClientRect();
      const x0 = Math.min(d.c0.x, e.clientX) - vr.left, y0 = Math.min(d.c0.y, e.clientY) - vr.top;
      Object.assign(zoomRect.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - d.c0.x) + 'px', height: Math.abs(e.clientY - d.c0.y) + 'px', borderColor: navOpt.color });
      zoomRect.hidden = false; return;
    }
    const p = docPt(e); A.centerOn(p.x - d.off.x, p.y - d.off.y); refreshNavigator(true);
  });
  const end = e => {
    const d = navState.drag; navState.drag = null; zoomRect.hidden = true;
    if (d && d.zoom) {
      const p = docPt(e), x = Math.min(p.x, d.p0.x), y = Math.min(p.y, d.p0.y), w = Math.abs(p.x - d.p0.x), h = Math.abs(p.y - d.p0.y);
      if (w > 2 && h > 2) A.zoomToDocRect({ x, y, w, h });
      else A.centerOn(p.x, p.y);
      refreshNavigator(true);
    }
  };
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  view.addEventListener('wheel', e => { if (!A.hasDoc()) return; e.preventDefault(); A.setZoom(A.nextZoomStep(e.deltaY < 0 ? 1 : -1)); refreshNavigator(true); }, { passive: false });
  navState.gen = ''; refreshNavigator(true);
}
function refreshNavigator(force) {
  const cv = $('#navCanvas'); if (!cv || !A) return;
  const g = cv.getContext('2d'); if (!g) return;
  const box = $('#navBox'), pct = $('#navPct'), sl = $('#navZoom');
  if (!A.hasDoc()) { g.clearRect(0, 0, cv.width, cv.height); if (box) box.style.display = 'none'; if (pct && document.activeElement !== pct) pct.value = ''; return; }
  const { w: dw, h: dh } = A.docInfo();
  const view = cv.parentElement, maxW = Math.max(120, (view.clientWidth || 220) - 4), maxH = Math.max(100, Math.min(260, Math.round(maxW * 0.75)));
  const gen = A.contentGen() + '|' + maxW + 'x' + maxH + '|' + dw + 'x' + dh;
  const now = performance.now();
  
  if (gen !== navState.gen && (force === 'thumb' || now - navState.t > 250 || !navState.gen)) {
    const src = A.snapshot(Math.max(maxW, maxH) * Math.min(2, window.devicePixelRatio || 1));
    if (src) {
      const k = Math.min(maxW / dw, maxH / dh), w = Math.max(1, Math.round(dw * k)), h = Math.max(1, Math.round(dh * k));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      g.clearRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
      navState.gen = gen; navState.t = now;
    }
  }
  const r = A.visibleDocRect();
  if (r && box) {
    const k = cv.width / dw, x0 = Math.max(0, r.x * k), y0 = Math.max(0, r.y * k), x1 = Math.min(cv.width, (r.x + r.w) * k), y1 = Math.min(cv.height, (r.y + r.h) * k);
    Object.assign(box.style, { display: '', left: (cv.offsetLeft + x0) + 'px', top: (cv.offsetTop + y0) + 'px', width: Math.max(4, x1 - x0) + 'px', height: Math.max(4, y1 - y0) + 'px', borderColor: navOpt.color });
  }
  const z = A.zoom();
  if (sl && document.activeElement !== sl) sl.value = String(Math.round((Math.log(z / 0.01) / Math.log(3200)) * 1000));
  if (pct && document.activeElement !== pct) pct.value = (z * 100 >= 10 ? Math.round(z * 100) : (z * 100).toFixed(2)) + '%';
}
let navDlg = null;
function openNavOptions() {
  if (!navDlg) {
    navDlg = mk('dialog', { className: 'fp-dlg ip-dlg' });
    navDlg.innerHTML = `<form method="dialog" class="fp-dlg-form"><h3 class="fp-dlg-title">导航器面板选项</h3>
      <fieldset><legend>代理视图区域</legend><label>颜色：<select data-k="color">${NAV_COLORS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}<option value="custom">自定…</option></select></label>
      <input type="color" data-k="custom" title="自定颜色"> <span class="nv-sw" style="display:inline-block;width:18px;height:14px;border:1px solid #888;vertical-align:middle"></span></fieldset>
      <div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button><button type="button" class="fp-dlg-ok primary" value="ok">确定</button></div></form>`;
    document.body.append(navDlg);
    const q = s => navDlg.querySelector(s);
    const close = () => { try { navDlg.close(); } catch { navDlg.removeAttribute('open'); } };
    const cur = () => q('[data-k=color]').value === 'custom' ? q('[data-k=custom]').value : q('[data-k=color]').value;
    const sync = () => { q('.nv-sw').style.background = cur(); q('[data-k=custom]').hidden = q('[data-k=color]').value !== 'custom'; };
    q('[data-k=color]').onchange = () => { if (q('[data-k=color]').value === 'custom') { try { q('[data-k=custom]').click(); } catch {} } sync(); };
    q('[data-k=custom]').oninput = sync;
    q('.fp-dlg-cancel').onclick = close;
    q('.fp-dlg-ok').onclick = () => { navOpt.color = cur(); LS.set(NAV_KEY, navOpt); close(); refreshNavigator(true); };
    navDlg._sync = sync;
  }
  const q = s => navDlg.querySelector(s);
  const known = NAV_COLORS.some(c => c[0] === navOpt.color);
  q('[data-k=color]').value = known ? navOpt.color : 'custom'; q('[data-k=custom]').value = navOpt.color;
  navDlg._sync();
  try { navDlg.showModal(); } catch { navDlg.setAttribute('open', ''); }
}


const HIST_KEY = 'fp.histogram';
const histOpt = Object.assign({ view: 'expanded', colorCh: false, stats: true, source: 'image', ch: '' }, LS.get(HIST_KEY, {}));
const saveHist = () => LS.set(HIST_KEY, histOpt);
let histData = null, histKey = '', histForceFull = false, histHover = null, histSel = null, histBuilt = '';
const CACHE_PIXELS = 1 << 20;          

function histChannels() {
  const m = A.docInfo().mode;
  

  const L = (r, g, b) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  if (m === 4) {
    



    const ink = (i) => (r, g, b) => { const k = cmykOf([r, g, b], null, false); return Math.round(255 - k[i] * 2.55); };
    return [['cmyk', 'CMYK', null, '#ccc'], ['c', '青色', ink(0), '#00aeef'], ['m', '洋红', ink(1), '#ec008c'], ['y', '黄色', ink(2), '#fff200'], ['k', '黑色', ink(3), '#bbb'], ['lum', '明度', L, '#ccc'], ['colors', '颜色', null, '#ccc']];
  }
  if (m === 9) {
    const lab = i => (r, g, b) => { const v = rgb2lab([r, g, b]); return i ? clamp(v[i] + 128, 0, 255) : Math.round(v[0] * 2.55); };
    return [['lab', 'Lab', null, '#ccc'], ['l', '明度', lab(0), '#ccc'], ['a', 'a', lab(1), '#e0508a'], ['b', 'b', lab(2), '#d8c040']];
  }
  if (m === 1 || m === 8) return [['gray', '灰色', L, '#ccc']];
  return [['rgb', 'RGB', null, '#ccc'], ['r', '红', (r) => r, '#ff3b3b'], ['g', '绿', (r, g) => g, '#3bdc3b'], ['b', '蓝', (r, g, b) => b, '#4a78ff'], ['lum', '明度', L, '#ccc'], ['colors', '颜色', null, '#ccc']];
}
function curChannel() { const list = histChannels(); return list.find(c => c[0] === histOpt.ch) || list[0]; }

function computeHist(full) {
  const src = A.histSource(histOpt.source, full ? Infinity : CACHE_PIXELS);
  if (!src) return null;
  const { data, w, h, level } = src, ds = A.docInfo();
  const sx = ds.w / w, sy = ds.h / h;
  const mask = A.selectionMask();                  
  const list = histChannels();
  const H = {}; for (const [k] of list) H[k] = new Uint32Array(256);
  const fns = list.filter(c => c[2]);
  let n = 0;
  const lut = new Map();
  for (let y = 0; y < h; y++) {
    const dy = Math.floor((y + 0.5) * sy);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (!data[o + 3]) continue;
      if (mask) {
        const dx = Math.floor((x + 0.5) * sx) - mask.x, my = dy - mask.y;
        if (dx < 0 || my < 0 || dx >= mask.w || my >= mask.h || mask.mask[my * mask.w + dx] < 128) continue;
      }
      const r = data[o], g = data[o + 1], b = data[o + 2];
      n++;
      if (list[0][0] === 'rgb') { H.r[r]++; H.g[g]++; H.b[b]++; H.lum[(0.299 * r + 0.587 * g + 0.114 * b + 0.5) | 0]++; continue; }
      const key = (r << 16) | (g << 8) | b;
      let vals = lut.get(key);
      if (!vals) { vals = fns.map(c => clamp(c[2](r, g, b) | 0, 0, 255)); if (lut.size < 200000) lut.set(key, vals); }
      for (let i = 0; i < fns.length; i++) H[fns[i][0]][vals[i]]++;
    }
  }
  if (H.rgb) for (let v = 0; v < 256; v++) H.rgb[v] = Math.round((H.r[v] + H.g[v] + H.b[v]) / 3);
  if (H.cmyk) for (let v = 0; v < 256; v++) H.cmyk[v] = Math.round((H.c[v] + H.m[v] + H.y[v] + H.k[v]) / 4);
  if (H.lab) H.lab.set(H.l);
  if (H.colors && H.r) H.colors.set(H.rgb);
  if (H.colors && H.c) H.colors.set(H.cmyk);
  return { hist: H, n, level: level || 1 };
}
function statsOf(h, a = 0, b = 255) {
  let tot = 0, sum = 0; for (let v = 0; v < 256; v++) { tot += h[v]; sum += v * h[v]; }
  const mean = tot ? sum / tot : 0; let varr = 0, acc = 0, med = 0, got = false;
  for (let v = 0; v < 256; v++) { varr += (v - mean) * (v - mean) * h[v]; acc += h[v]; if (!got && acc >= tot / 2) { med = v; got = true; } }
  let cnt = 0, below = 0; for (let v = 0; v <= b; v++) { if (v >= a) cnt += h[v]; below += h[v]; }
  return { mean, sd: Math.sqrt(tot ? varr / tot : 0), med, tot, cnt, pct: tot ? below / tot * 100 : 0 };
}
function plot(g, h, color, W, H, mode = 'source-over', y0 = 0) {
  let mx = 1; for (let v = 0; v < 256; v++) if (h[v] > mx) mx = h[v];
  g.globalCompositeOperation = mode; g.fillStyle = color;
  for (let v = 0; v < 256; v++) { const bh = Math.round(h[v] / mx * (H - 1)); if (bh) g.fillRect(v * W / 256, y0 + H - bh, Math.ceil(W / 256), bh); }
  g.globalCompositeOperation = 'source-over';
}
function drawHistInto(cv, key, hd, opts = {}) {
  const g = cv.getContext('2d'); if (!g) return;
  const W = cv.width, H = cv.height;
  g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, W, H);
  if (!hd) return;
  const list = histChannels(), ch = list.find(c => c[0] === key) || list[0];
  if (key === 'colors') {
    if (hd.hist.r) { plot(g, hd.hist.r, '#ff2020', W, H, 'lighter'); plot(g, hd.hist.g, '#20ff20', W, H, 'lighter'); plot(g, hd.hist.b, '#2020ff', W, H, 'lighter'); }
    else if (hd.hist.c) { plot(g, hd.hist.c, '#00aeef', W, H, 'lighter'); plot(g, hd.hist.m, '#ec008c', W, H, 'lighter'); plot(g, hd.hist.y, '#fff200', W, H, 'lighter'); plot(g, hd.hist.k, '#666', W, H, 'lighter'); }
  } else plot(g, hd.hist[key], opts.color ? ch[3] : '#c8c8c8', W, H);
  if (opts.sel) {
    const [a, b] = opts.sel; g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(a * W / 256, 0, Math.max(1, (b - a + 1) * W / 256), H);
  }
}
function buildHistogram() {
  const host = document.querySelector('.panel[data-panel="histogram"]'); if (!host || !A) return;
  const list = histChannels();
  const sig = histOpt.view + '|' + histOpt.stats + '|' + histOpt.colorCh + '|' + list.map(c => c[0]).join(',');
  if (histBuilt === sig && host.querySelector('.hg-panel')) return;
  histBuilt = sig;
  host.innerHTML = '';
  const p = mk('div', { className: 'hg-panel hist-panel view-' + histOpt.view });
  const top = mk('div', { className: 'hg-row hg-top' });
  if (histOpt.view !== 'compact') {
    const sel = mk('select', { id: 'histCh', title: '通道' });
    for (const [k, l] of list) sel.append(mk('option', { value: k, textContent: l }));
    sel.value = curChannel()[0];
    sel.onchange = () => { histOpt.ch = sel.value; saveHist(); drawHist(); };
    top.append(mk('span', { textContent: '通道:' }), sel);
  }
  top.append(mk('span', { className: 'grow' }));
  const warn = mk('span', { className: 'hg-warn', title: '直方图是用高速缓存（缩小的图像）算的：点右边的按钮做不使用高速缓存的刷新', hidden: true });
  warn.append(A.uiIcon('hist-warn', 12));
  const rf = mk('button', { type: 'button', className: 'hg-refresh', title: '不使用高速缓存的刷新' }); rf.append(A.uiIcon('hist-refresh', 12));
  rf.onclick = () => refreshUncached();
  top.append(warn, rf);
  p.append(top);
  const mkCanvas = (w, h, cls) => { const c = mk('canvas', { width: w, height: h, className: cls }); return c; };
  const main = mkCanvas(256, histOpt.view === 'compact' ? 100 : 110, 'hg-main'); main.id = 'histCanvas';
  p.append(main);
  if (histOpt.view === 'all') {
    const chs = list.filter(c => c[2] && c[0] !== 'lum' && c[0] !== 'l');
    for (const c of chs) { const cv = mkCanvas(256, 56, 'hg-sub'); cv.dataset.ch = c[0]; cv.title = c[1]; p.append(cv); }
  }
  if (histOpt.view !== 'compact') {
    const src = mk('div', { className: 'hg-row' });
    const ss = mk('select', { id: 'histSrc' });
    for (const [k, l] of [['image', '整个图像'], ['layer', '选中的图层'], ['adjust', '复合图像调整']]) ss.append(mk('option', { value: k, textContent: l }));
    ss.value = histOpt.source;
    ss.onchange = () => { histOpt.source = ss.value; saveHist(); histKey = ''; drawHist(); };
    src.append(mk('span', { textContent: '源:' }), ss);
    p.append(src);
  }
  if (histOpt.stats) {
    const st = mk('div', { className: 'hg-stats hist-stats', id: 'histStats' });
    p.append(st);
  }
  host.append(p);
  
  const lvl = e => { const r = main.getBoundingClientRect(); return clamp(Math.floor((e.clientX - r.left) / r.width * 256), 0, 255); };
  main.addEventListener('pointerdown', e => { histSel = { a: lvl(e), b: lvl(e), drag: true }; try { main.setPointerCapture(e.pointerId); } catch {} drawHist(true); });
  main.addEventListener('pointermove', e => { const v = lvl(e); if (histSel && histSel.drag) histSel.b = v; else histHover = v; drawHist(true); });
  main.addEventListener('pointerup', () => { if (histSel) { histSel.drag = false; if (histSel.a === histSel.b) histSel = null; } drawHist(true); });
  main.addEventListener('pointerleave', () => { histHover = null; if (!histSel || !histSel.drag) histSel = null; drawHist(true); });
}
function histSourceKey() {
  return [histOpt.source, A.contentKey(histOpt.source), A.selectionKey(), A.docInfo().w, A.docInfo().h, A.docInfo().mode].join('|');
}
function refreshUncached() { histForceFull = true; histKey = ''; drawHist(); }
function drawHist(onlyRedraw) {
  const host = document.querySelector('.panel[data-panel="histogram"]'); if (!host || !A) return;
  buildHistogram();
  const src = $('#histSrc');
  if (src) {
    const adjOk = A.selectedIsAdjustment(), layerOk = A.hasSelectedLayer();
    src.options[1].disabled = !layerOk; src.options[2].disabled = !adjOk;
    src.title = adjOk ? '' : '「复合图像调整」要先在图层面板选中一个调整图层';
  }
  if (!A.hasDoc()) { histData = null; histKey = ''; }
  else if (!onlyRedraw) {
    if (histOpt.source === 'layer' && !A.hasSelectedLayer()) histOpt.source = 'image';
    if (histOpt.source === 'adjust' && !A.selectedIsAdjustment()) histOpt.source = 'image';
    if (src) src.value = histOpt.source;
    const key = histSourceKey() + (histForceFull ? '|full' : '');
    if (key !== histKey) {
      const wasFull = histData && histData.level === 1 && histKey.replace('|full', '') === histSourceKey();
      if (!wasFull || histForceFull) { histData = computeHist(histForceFull); }
      histKey = key; histForceFull = false;
    }
  }
  const ch = curChannel()[0];
  const main = $('#histCanvas');
  const sel = histSel ? [Math.min(histSel.a, histSel.b), Math.max(histSel.a, histSel.b)] : null;
  if (main) drawHistInto(main, ch, histData, { color: histOpt.colorCh && ch !== 'rgb', sel });
  for (const cv of host.querySelectorAll('.hg-sub')) drawHistInto(cv, cv.dataset.ch, histData, { color: histOpt.colorCh });
  const warn = host.querySelector('.hg-warn'); if (warn) warn.hidden = !histData || histData.level === 1;
  const stEl = $('#histStats');
  if (stEl) {
    if (!histData) { stEl.innerHTML = ''; return; }
    const h = histData.hist[ch === 'colors' ? (histData.hist.rgb ? 'rgb' : 'cmyk') : ch];
    const r = sel || (histHover != null ? [histHover, histHover] : null);
    const s = statsOf(h, r ? r[0] : 0, r ? r[1] : 255);
    const cell = (l, v) => `<span>${l}</span><span>${v}</span>`;
    stEl.innerHTML = cell('平均值:', s.mean.toFixed(2)) + cell('色阶:', r ? (r[0] === r[1] ? r[0] : `${r[0]}..${r[1]}`) : '')
      + cell('标准偏差:', s.sd.toFixed(2)) + cell('数量:', r ? s.cnt : '')
      + cell('中间值:', s.med) + cell('百分位:', r ? s.pct.toFixed(2) : '')
      + cell('像素:', histData.n) + cell('高速缓存级别:', histData.level);
  }
}
function histMenu() {
  const set = (k, v) => () => { histOpt[k] = v; saveHist(); histBuilt = ''; drawHist(true); };
  return [
    { label: '紧凑视图', checked: histOpt.view === 'compact', run: set('view', 'compact') },
    { label: '扩展视图', checked: histOpt.view === 'expanded', run: set('view', 'expanded') },
    { label: '全部通道视图', checked: histOpt.view === 'all', run: set('view', 'all') },
    { sep: true },
    { label: '用原色显示通道', checked: histOpt.colorCh, run: set('colorCh', !histOpt.colorCh) },
    { label: '显示统计数据', checked: histOpt.stats, run: set('stats', !histOpt.stats) },
    { sep: true },
    { label: '不使用高速缓存的刷新', disabled: !A.hasDoc(), run: () => refreshUncached() },
  ];
}


const CSS = `
.ip-panel { font-size: 11px; user-select: none; }
.ip-panel .ip-sec { padding: 4px 6px; border-bottom: 1px solid var(--ps-line, #222); }
.ip-panel .ip-two { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
.ip-panel .ip-cell { display: flex; align-items: flex-start; gap: 3px; min-width: 0; }
.ip-panel .ip-grid { display: grid; grid-template-columns: auto 1fr; gap: 0 4px; line-height: 16px; min-width: 0; }
.ip-panel .ip-l { color: var(--ps-muted, #aaa); white-space: nowrap; }
.ip-panel .ip-v { font-variant-numeric: tabular-nums; white-space: nowrap; }
.ip-panel .ip-bits { color: var(--ps-muted, #999); }
.ip-panel .ip-pick, .ip-panel .ip-ico { flex: none; display: inline-flex; align-items: center; gap: 1px; padding: 1px; border: 0; background: none; color: inherit; height: 16px; }
.ip-panel .ip-pick { cursor: pointer; border-radius: 2px; }
.ip-panel .ip-pick:hover { background: rgba(255,255,255,.1); }
.ip-panel .ip-pick b { font-size: 9px; font-weight: normal; }
.ip-panel .ip-status { line-height: 16px; color: var(--ps-text, #ddd); }
.ip-panel .ip-tip { color: var(--ps-muted, #aaa); line-height: 15px; }
.ip-panel .ip-note { padding: 2px 6px 5px; font-size: 10px; opacity: .55; }
.ip-dlg fieldset { border: 1px solid var(--ps-line-2, #555); margin: 0 0 8px; padding: 4px 8px 6px; }
.ip-dlg legend { padding: 0 4px; }
.ip-dlg .ip-dlg-st { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
.ip-dlg .ip-dlg-tips { display: block; margin: 4px 0 10px; }
.nv-panel { display: flex; flex-direction: column; }
.nv-panel .nav-view { position: relative; display: flex; justify-content: center; align-items: center; min-height: 120px; padding: 4px; background: #262626; cursor: default; }
.nv-panel .nav-view canvas { display: block; max-width: 100%; }
.nv-panel #navBox { position: absolute; border: 2px solid #ff3232; box-sizing: border-box; pointer-events: none; }
.nv-panel .nv-zrect { position: absolute; border: 1px dashed #ff3232; pointer-events: none; }
.nv-panel .nav-zoom { display: flex; align-items: center; gap: 4px; padding: 4px 6px; }
.nv-panel .nav-zoom .nv-pct { flex: none; width: 56px !important; min-width: 0; height: 20px; font-size: 11px; box-sizing: border-box; text-align: right; }
.nv-panel .nav-zoom input[type=range] { flex: 1; min-width: 40px; }
.nv-panel .nv-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; background: none; border: 0; color: inherit; cursor: pointer; }
.hg-panel { display: flex; flex-direction: column; gap: 4px; padding: 4px 6px 6px; font-size: 11px; }
.hg-panel .hg-row { display: flex; align-items: center; gap: 6px; }
.hg-panel .hg-row .grow { flex: 1; }
.hg-panel canvas { width: 100%; image-rendering: auto; border: 1px solid var(--ps-line, #222); box-sizing: border-box; }
.hg-panel .hg-main { height: 110px; cursor: crosshair; }
.hg-panel.view-compact .hg-main { height: 100px; }
.hg-panel .hg-sub { height: 56px; }
.hg-panel .hg-warn { color: #f5c542; cursor: help; }
.hg-panel .hg-refresh { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; background: none; border: 0; color: inherit; cursor: pointer; }
.hg-panel .hg-stats { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 1px 6px; }
.hg-panel .hg-stats span:nth-child(odd) { color: var(--ps-muted, #aaa); }
`;











export function installInfoPanels(api) {
  A = api;
  if (!document.getElementById('ipCss')) document.head.append(mk('style', { id: 'ipCss', textContent: CSS }));
  const ih = $('#infoPanel'); if (ih) ih.addEventListener('click', onInfoClick);
  A.panels.setPanelMenu('info', () => [{ label: '面板选项…', run: () => openInfoOptions() }]);
  A.panels.setPanelMenu('navigator', () => [{ label: '面板选项…', run: () => openNavOptions() }]);
  A.panels.setPanelMenu('histogram', () => histMenu());
  buildNavigator();
  buildHistogram();
  addEventListener('pointermove', onPointer, true);
  
  addEventListener('pointerup', markStart, true); addEventListener('keydown', markStart, true); addEventListener('click', markStart, true);
  const nav = document.querySelector('.panel[data-panel="navigator"]');
  if (nav && typeof ResizeObserver === 'function') { try { new ResizeObserver(() => { navState.gen = ''; if (A.panels.isVisible('navigator')) refreshNavigator('thumb'); }).observe(nav); } catch {} }
  
  let tick = 0;
  setInterval(() => {
    tick++;
    try {
      if (A.panels.isVisible('navigator') && !navState.drag) refreshNavigator();
      if (tick % 4 === 0 && A.panels.isVisible('histogram')) drawHist();
      if (tick % 4 === 0 && A.panels.isVisible('info')) syncInfo();
    } catch {}
  }, 100);
  if (typeof window !== 'undefined') window.__psd_editorInfo = info;
  return info;
}
export const info = {
  syncInfo, scheduleInfo, onPointer, noteOp, openInfoOptions, refreshNavigator: f => refreshNavigator(f === undefined ? 'thumb' : f), openNavOptions,
  drawHist, refreshUncached, histMenu,
  get infoOpt() { return { ...infoOpt, status: [...infoOpt.status] }; }, setInfoOpt(o) { Object.assign(infoOpt, o); saveInfoOpt(); syncInfo(); },
  get navOpt() { return { ...navOpt }; }, setNavOpt(o) { Object.assign(navOpt, o); LS.set(NAV_KEY, navOpt); refreshNavigator(true); },
  get histOpt() { return { ...histOpt }; }, setHistOpt(o) { Object.assign(histOpt, o); saveHist(); histBuilt = ''; histKey = ''; drawHist(); },
  get histData() { return histData; }, setInfoPt(p) { infoPt = p; syncInfo(); },
  readout, rgb2lab, rgb2hsb,
  get api() { return A; },
};
export default info;
