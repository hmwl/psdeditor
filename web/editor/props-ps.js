



















import { PRESET_FORMATS, PRESET_UNSUPPORTED, flattenModel } from './adj-preset-files.js';
import { propertyPixelField } from './property-panel.js';

let A = null;
const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};



function row(box, pane, section, label, ...els) {
  const r = mk('div', { className: 'row' });
  r.dataset.propPane = pane; if (section) r.dataset.propSection = section;
  r.append(mk('label', { textContent: label || '' }), ...els.filter(Boolean));
  box.append(r); return r;
}
function wideRow(box, pane, section, ...els) { const r = row(box, pane, section, '', ...els); r.classList.add('prop-wide-row'); return r; }
function actBtn(label, id, opts = {}) {
  const b = mk('button', { type: 'button', textContent: label });
  const ok = A.actions.has(id) && A.actions.enabled(id);
  b.disabled = !ok;
  b.title = opts.title || (!ok ? (A.actions.why(id) || (A.actions.has(id) ? '当前不可用' : '还没实现')) : '');
  b.onclick = e => { if (opts.run) opts.run(e); else A.actions.run(id); };
  if (opts.attr) b.dataset.attr = opts.attr;
  return b;
}
function iconBtn(name, title, onClick, attr) {
  const b = mk('button', { type: 'button', className: 'pp-ibtn', title });
  b.setAttribute('aria-label', title);
  b.append(A.icon(A.hasIcon(name) ? name : 'grid-2x2', 16));
  if (attr) b.dataset.attr = attr;
  if (onClick) b.onclick = onClick;
  return b;
}
const numInput = (value, opts = {}) => {
  const i = mk('input', { type: 'number', value, step: opts.step ?? 1 });
  if (opts.min != null) i.min = opts.min; if (opts.max != null) i.max = opts.max;
  if (opts.attr) i.dataset.attr = opts.attr;
  if (opts.title) i.title = opts.title;
  if (opts.disabled) i.disabled = true;
  i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
  if (opts.onchange) i.onchange = () => { const v = +i.value; if (Number.isFinite(v)) opts.onchange(v); else i.value = value; };
  return i;
};
const unit = t => mk('span', { className: 'pp-unit', textContent: t });
const scrubLabel = t => mk('span', { className: 'pp-xy', textContent: t });
function selectEl(options, value, onchange, attr) {
  const s = mk('select');
  for (const [v, t, dis] of options) { const o = new Option(t, v); if (dis) o.disabled = true; s.append(o); }
  s.value = value; if (attr) s.dataset.attr = attr;
  s.onchange = () => onchange(s.value);
  return s;
}
function checkEl(label, checked, onchange, attr) {
  const w = mk('label', { className: 'pp-check' });
  const c = mk('input', { type: 'checkbox', checked: !!checked });
  if (attr) c.dataset.attr = attr;
  c.onchange = () => onchange(c.checked);
  w.append(c, document.createTextNode(label));
  return w;
}
function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = mk('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function pickFile(accept) {
  return new Promise(resolve => {
    const i = mk('input', { type: 'file', accept }); i.style.display = 'none';
    i.onchange = () => { resolve(i.files && i.files[0] || null); i.remove(); };
    document.body.append(i); i.click();
    setTimeout(() => { if (!i.files || !i.files.length) {} }, 0);
  });
}


let cur = { tab: 'layer', ctx: { kind: 'document', label: '文档' }, layer: null };
function syncHeader(tab, ctx, layer) {
  cur = { tab, ctx, layer };
  document.getElementById('propTabs').hidden = ctx.kind === 'group' && !layer?.mask && !layer?.vectorMask;
  const title = document.getElementById('propHeadTitle');
  if (title) title.textContent = tab === 'mask' ? maskTitle(layer) : ctx.kind === 'group' ? '' : ctx.label;
  if (ctx.kind === 'group' && !layer?.mask && !layer?.vectorMask) {
    const layerTab = document.querySelector('#propTabs [data-prop-tab="layer"]');
    if (layerTab) layerTab.hidden = true;
  }
  const mb = document.querySelector('#propTabs [data-prop-tab="mask"]');
  if (mb) { mb.title = maskTitle(layer); mb.setAttribute('aria-label', mb.title); }
}
function maskTitle(l) {
  if (!l) return '蒙版';
  const k = maskKindOf(l.index, l);
  return k === 'vector' ? '矢量蒙版' : k === 'pixel' ? '像素蒙版' : '蒙版';
}


const DOC_MODES = [['rgb', 'RGB 颜色'], ['grayscale', '灰度'], ['cmyk', 'CMYK 颜色'], ['lab', 'Lab 颜色'],
  ['bitmap', '位图'], ['indexed', '索引颜色'], ['duotone', '双色调'], ['multichannel', '多通道']];
const RULER_UNITS = [['px', '像素'], ['in', '英寸'], ['cm', '厘米'], ['mm', '毫米'], ['pt', '点'], ['pc', '派卡']];
let canvasAspectLock = false;
function renderDocument(box) {
  const P = 'layer';
  
  const w = numInput(A.docW(), { min: 1, max: 30000, attr: 'doc-width', title: '画布宽度（像素）', onchange: v => A.resizeCanvas(Math.round(v), canvasAspectLock ? Math.max(1, Math.round(v * A.docH() / A.docW())) : A.docH()) });
  const h = numInput(A.docH(), { min: 1, max: 30000, attr: 'doc-height', title: '画布高度（像素）', onchange: v => A.resizeCanvas(canvasAspectLock ? Math.max(1, Math.round(v * A.docW() / A.docH())) : A.docW(), Math.round(v)) });
  const link = iconBtn('link', '保持画布长宽比', () => { canvasAspectLock = !canvasAspectLock; link.classList.toggle('on', canvasAspectLock); link.setAttribute('aria-pressed', String(canvasAspectLock)); }, 'doc-proportions');
  link.classList.add('prop-aspect-lock'); link.classList.toggle('on', canvasAspectLock); link.setAttribute('aria-pressed', String(canvasAspectLock));
  row(box, P, 'canvas', '', link, scrubLabel('W'), propertyPixelField(w), scrubLabel('X'), propertyPixelField(numInput(0, { disabled: true, title: '画布 X 位置' })),
    scrubLabel('H'), propertyPixelField(h), scrubLabel('Y'), propertyPixelField(numInput(0, { disabled: true, title: '画布 Y 位置' }))).classList.add('prop-transform-grid');
  const portrait = A.docH() >= A.docW();
  const orient = mk('span', { className: 'pp-seg' });
  const ob = (isPortrait, title) => {
    const b = mk('button', { type: 'button', className: 'pp-orient' + (portrait === isPortrait ? ' on' : ''), title });
    b.append(A.icon(isPortrait ? 'canvas-portrait' : 'canvas-landscape', 22));
    b.onclick = () => { if (portrait !== isPortrait && A.docW() !== A.docH()) A.resizeCanvas(A.docH(), A.docW()); };
    b.dataset.attr = isPortrait ? 'doc-portrait' : 'doc-landscape';
    return b;
  };
  orient.append(ob(true, '纵向'), ob(false, '横向'));
  row(box, P, 'canvas', '方向', orient);
  const res = mk('output', { value: String(Math.round(A.resolution() * 1000) / 1000) }); res.dataset.attr = 'doc-resolution';
  row(box, P, 'canvas', '分辨率', res, unit('像素/英寸'));
  const modeNow = (DOC_MODES.find(([k]) => A.actions.checked('image.mode.' + k)) || ['rgb'])[0];
  const modeSel = selectEl(DOC_MODES.map(([k, t]) => [k, t, !(A.actions.has('image.mode.' + k) && (A.actions.enabled('image.mode.' + k) || k === modeNow))]),
    modeNow, v => { if (v !== modeNow) A.actions.run('image.mode.' + v); A.renderProps(); }, 'doc-mode');
  row(box, P, 'canvas', '模式', modeSel);
  const depths = [8, 16, 32];
  const depthNow = depths.find(d => A.actions.checked('image.depth.' + d)) || A.doc()?.header?.depth || A.doc()?.depth || 8;
  row(box, P, 'canvas', '位深度', selectEl(depths.map(d => [String(d), `${d} 位/通道`,
    !(A.actions.has('image.depth.' + d) && (d === depthNow || A.actions.enabled('image.depth.' + d)))]),
  String(depthNow), v => { if (+v !== depthNow) A.actions.run('image.depth.' + v); A.renderProps(); }, 'doc-depth'));
  
  const unitNow = (RULER_UNITS.find(([k]) => A.actions.checked('view.rulerUnit.' + k)) || ['px'])[0];
  row(box, P, 'rulers', '单位', selectEl(RULER_UNITS, unitNow, v => { A.actions.run('view.rulerUnit.' + v); A.renderProps(); }, 'doc-ruler-unit'),
    checkEl('标尺', A.actions.checked('view.rulers'), () => { A.actions.run('view.rulers'); }, 'doc-rulers'));
  const G = A.PREF.get('guides') || {};
  const gridColor = mk('input', { type: 'color', value: G.gridColor || '#8c8c8c', title: '网格颜色' });
  gridColor.dataset.attr = 'doc-grid-color';
  gridColor.onchange = () => A.PREF.set({ guides: { gridColor: gridColor.value } });
  row(box, P, 'rulers', '网格', checkEl('显示', A.actions.checked('view.showGrid'), () => A.actions.run('view.showGrid'), 'doc-grid'), gridColor);
  const every = numInput(+G.gridEvery || 64, { min: 1, max: 9999, attr: 'doc-grid-every', title: '网格线间隔（像素）', onchange: v => A.PREF.set({ guides: { gridEvery: Math.max(1, v), gridUnit: 'px' } }) });
  const sub = numInput(+G.gridSub || 4, { min: 1, max: 100, attr: 'doc-grid-sub', title: '子网格', onchange: v => A.PREF.set({ guides: { gridSub: Math.max(1, Math.round(v)) } }) });
  row(box, P, 'rulers', '', mk('span', { className: 'pp-cap', textContent: '间隔' }), every, unit('像素'), mk('span', { className: 'pp-cap', textContent: '子网格' }), sub);
  
  const guideColor = mk('input', { type: 'color', value: G.canvasColor || '#4affff', title: '参考线颜色' });
  guideColor.dataset.attr = 'doc-guide-color';
  guideColor.onchange = () => A.PREF.set({ guides: { canvasColor: guideColor.value } });
  row(box, P, 'guides', '', checkEl('显示', A.actions.checked('view.showGuides'), () => A.actions.run('view.showGuides'), 'doc-guides'),
    checkEl('锁定', A.actions.checked('view.lockGuides'), () => A.actions.run('view.lockGuides'), 'doc-guides-lock'), guideColor);
  wideRow(box, P, 'guides', actBtn('新建参考线版面…', 'view.newGuideLayout'), actBtn('清除参考线', 'view.clearGuides', { attr: 'doc-guides-clear' }));
  
  const crop = mk('button', { type: 'button', textContent: '裁剪', title: '裁剪工具（C）' });
  crop.onclick = () => A.setTool('crop'); crop.dataset.attr = 'doc-quick-crop';
  const rot = mk('button', { type: 'button', textContent: '旋转画布', title: '图像 › 图像旋转' });
  rot.dataset.attr = 'doc-quick-rotate';
  rot.onclick = () => A.panels.popup([
    ['180 度', 'image.rotate180'], ['顺时针 90 度', 'image.rotate90cw'], ['逆时针 90 度', 'image.rotate90ccw'], { sep: true },
    ['任意角度…', 'image.rotateArbitrary'], { sep: true }, ['水平翻转画布', 'image.flipH'], ['垂直翻转画布', 'image.flipV'],
  ].map(x => x.sep ? x : { label: x[0], disabled: !A.actions.enabled(x[1]), run: () => A.actions.run(x[1]) }), { ...rot.getBoundingClientRect().toJSON(), alignLeft: true });
  wideRow(box, P, 'quick', crop, actBtn('裁切…', 'image.trim', { attr: 'doc-quick-trim', title: '图像 › 裁切（去掉透明像素或边缘颜色）' }));
  wideRow(box, P, 'quick', actBtn('图像大小…', 'image.size', { attr: 'doc-quick-size' }), rot);
  wideRow(box, P, 'quick', actBtn('画布大小…', 'image.canvasSize'), actBtn('显示全部', 'image.revealAll'));
}


function unionBounds(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of list) {
    const l = A.layer(i);
    if (!l || l.groupType === 3) continue;
    if (l.isGroup || l.groupType === 1 || l.groupType === 2) { const b = unionBounds(A.groupMembers(i)); if (b) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); } continue; }
    if (!A.hasPixels(i)) continue;
    let v; try { v = A.transformOf(i); } catch { continue; }
    if (!v || !(v.w > 0) || !(v.h > 0)) continue;
    x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x + v.w); y1 = Math.max(y1, v.y + v.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function expandMembers(list) {
  const out = new Set();
  for (const i of list) { const l = A.layer(i); if (l && (l.isGroup || l.groupType === 1 || l.groupType === 2)) for (const m of A.groupMembers(i)) out.add(m); else out.add(i); }
  return [...out];
}
function transformBox(box, list, section = 'transform') {
  const b = unionBounds(list);
  const P = 'layer';
  if (!b) { row(box, P, section, '', mk('span', { className: 'pp-muted', textContent: '所选图层没有像素' })); return; }
  const move = (dx, dy) => A.moveLayersBy(expandMembers(list), Math.round(dx), Math.round(dy));
  const locked = list.map(i => A.moveLockWhy(i)).find(Boolean) || '';
  const W = numInput(Math.round(b.w), { attr: 'multi-w', disabled: true, title: '合并包围盒宽度（多个图层时只读；缩放请用自由变换 ⌘T）' });
  const H = numInput(Math.round(b.h), { attr: 'multi-h', disabled: true, title: '合并包围盒高度（多个图层时只读；缩放请用自由变换 ⌘T）' });
  const X = numInput(Math.round(b.x), { attr: 'multi-x', disabled: !!locked, title: locked || 'X 位置', onchange: v => move(v - b.x, 0) });
  const Y = numInput(Math.round(b.y), { attr: 'multi-y', disabled: !!locked, title: locked || 'Y 位置', onchange: v => move(0, v - b.y) });
  row(box, P, section, '', mk('span', { className: 'prop-aspect-spacer' }), scrubLabel('W'), propertyPixelField(W), scrubLabel('X'), propertyPixelField(X),
    scrubLabel('H'), propertyPixelField(H), scrubLabel('Y'), propertyPixelField(Y)).classList.add('prop-transform-grid');
}
let propertyAlignTo = LS.get('psd_editor.props.alignTo', 'selection') === 'canvas' ? 'canvas' : 'selection';
function alignBox(box, count, options = {}) {
  const P = 'layer';
  const align = mk('div', { className: 'prop-align-buttons' });
  for (const [how, key] of A.ALIGN_BTNS) {
    const b = mk('button', { type: 'button', title: '对齐' + A.ALIGN_LABEL[how] });
    b.dataset.propAlign = how; b.append(A.icon(key, 15)); b.onclick = () => options.align ? options.align(how, propertyAlignTo) : A.align(how); align.append(b);
  }
  wideRow(box, P, 'align', align);
  const dist = mk('div', { className: 'prop-align-buttons' });
  for (const [how, key] of Object.entries(A.DISTRIBUTE_ICONS)) {
    const b = mk('button', { type: 'button', title: '按' + A.ALIGN_LABEL[how] + '分布', disabled: count < 3 });
    b.dataset.propDistribute = how; b.append(A.icon(key, 15)); b.onclick = () => A.distribute(how); dist.append(b);
  }
  wideRow(box, P, 'align', dist);
  renderAlignOptions(box, count, options);
}
function renderAlignOptions(box, count, options = {}) {
  const spacing = mk('span', { className: 'prop-align-buttons' });
  for (const [axis, key, label] of [['v', 'distribute-spacing-v', '垂直均匀分布间距'], ['h', 'distribute-spacing-h', '水平均匀分布间距']]) {
    const b = iconBtn(key, label, () => options.spacing?.(axis), 'prop-spacing-' + axis);
    b.disabled = count < 3 || !options.spacing; spacing.append(b);
  }
  const target = selectEl([['selection', '选区'], ['canvas', '画布']], propertyAlignTo, v => {
    propertyAlignTo = v; LS.set('psd_editor.props.alignTo', v);
  }, 'prop-align-to');
  target.title = '对齐目标（无选区时，选区选项使用所选图层的边界）';
  row(box, 'layer', 'align', '间距', spacing, mk('span', { className: 'pp-cap', textContent: '对齐到' }), target);
}
function renderMulti(box, list, options) { transformBox(box, list); alignBox(box, list.length, options); }
function renderGroup(box, idx, l, options) {
  const empty = mk('div', { className: 'prop-no-properties', textContent: '无属性' });
  empty.dataset.propPane = 'layer'; box.append(empty);
}

let frameAspectLock = false;
function renderFrame(box, idx, l, options = {}) {
  const rect = l.frame?.rect;
  if (!rect) return;
  const update = (key, value) => {
    const next = { ...rect, [key]: value };
    if (frameAspectLock && key === 'w') next.h = rect.h * value / rect.w;
    if (frameAspectLock && key === 'h') next.w = rect.w * value / rect.h;
    options.setRect?.(next);
  };
  const field = key => numInput(Math.round(rect[key] * 100) / 100,
    { attr: 'frame-' + key, step: 0.1, min: ['w', 'h'].includes(key) ? 1 : undefined,
      disabled: !!options.why, title: options.why || ({ w: '图框宽度', h: '图框高度', x: 'X 位置', y: 'Y 位置' })[key],
      onchange: v => { if (!['w', 'h'].includes(key) || v > 0) update(key, v); } });
  const link = iconBtn('link', '保持长宽比', () => { frameAspectLock = !frameAspectLock; link.classList.toggle('on', frameAspectLock); }, 'frame-proportions');
  link.classList.toggle('on', frameAspectLock); link.disabled = !!options.why;
  link.classList.add('prop-aspect-lock');
  row(box, 'layer', 'frame-bounds', '', link, scrubLabel('W'), propertyPixelField(field('w')), scrubLabel('X'), propertyPixelField(field('x')),
    scrubLabel('H'), propertyPixelField(field('h')), scrubLabel('Y'), propertyPixelField(field('y'))).classList.add('prop-transform-grid');
  const stroke = A.doc()?.layers[idx]?.vectorStroke?.desc;
  const strokeWhy = options.why || (!stroke || !options.setStroke ? '图框描边数据不可用' : '');
  const fieldset = mk('fieldset', { className: 'pp-frame-stroke', disabled: !!strokeWhy, title: strokeWhy });
  const commitStroke = async values => {
    fieldset.disabled = true;
    try { await options.setStroke?.(values); }
    finally { if (fieldset.isConnected) A.renderProps(); }
  };
  const on = !!stroke && stroke.strokeEnabled !== false;
  const enabled = checkEl('启用', on, value => commitStroke({ enabled: value }), 'frame-stroke-enabled');
  row(fieldset, 'layer', 'frame-stroke', '', enabled);
  const width = numInput(+(stroke?.strokeStyleLineWidth?.value ?? 1), { min: 0, step: 0.1,
    attr: 'frame-stroke-width', disabled: !on, title: '设置图框描边宽度', onchange: value => { if (value >= 0) commitStroke({ width: value }); } });
  row(fieldset, 'layer', 'frame-stroke', '宽度', width, unit('像素'));
  const rgb = stroke?.strokeStyleContent?.['Clr '];
  const color = mk('input', { type: 'color', title: '设置图框描边颜色',
    value: '#' + ['Rd  ', 'Grn ', 'Bl  '].map(k => Math.max(0, Math.min(255, Math.round(+(rgb?.[k]?.value ?? rgb?.[k] ?? 0)))).toString(16).padStart(2, '0')).join(''),
    disabled: !on || !rgb || rgb.__classID !== 'RGBC' });
  color.dataset.attr = 'frame-stroke-color'; color.onchange = () => commitStroke({ color: color.value });
  if (!rgb || rgb.__classID !== 'RGBC') color.title = '当前描边颜色空间无法在此处编辑';
  row(fieldset, 'layer', 'frame-stroke', '颜色', color);
  const alignNames = { strokeStyleAlignInside: 'inside', strokeStyleAlignCenter: 'center', strokeStyleAlignOutside: 'outside' };
  const align = selectEl([['inside', '内部'], ['center', '居中'], ['outside', '外部']],
    alignNames[stroke?.strokeStyleLineAlignment?.value] || 'center', value => commitStroke({ align: value }), 'frame-stroke-align');
  align.disabled = !on; align.title = '设置描边对齐类型';
  row(fieldset, 'layer', 'frame-stroke', '对齐', align);
  wideRow(box, 'layer', 'frame-stroke', fieldset);
}


function renderSmart(box, idx, l, so, properties = null) {
  const info = A.soInfo(so);
  const P = 'smart';
  if (properties?.reset) {
    const reset = iconBtn('rotate-ccw', '复位变换', async e => {
      e.preventDefault(); e.stopPropagation(); reset.disabled = true;
      try { await properties.reset(); } finally { if (reset.isConnected) reset.disabled = !!properties.why; }
    }, 'so-reset-transform');
    reset.disabled = !!properties.why; if (properties.why) reset.title = properties.why;
    wideRow(box, 'layer', 'transform', reset);
  }
  if (properties?.model) {
    const model = properties.model, list = model.comps.list;
    const opts = [['-1', '不应用图层复合'], ...list.map(c => [String(c.id), c.name])];
    if (model.compId !== -1 && !list.some(c => c.id === model.compId)) opts.push([String(model.compId), `缺失的图层复合（${model.compId}）`, true]);
    const comp = selectEl(opts, String(model.compId), async value => {
      comp.disabled = true;
      try { await properties.changeComp?.(+value); }
      finally { if (comp.isConnected) { comp.value = String(model.compId); comp.disabled = !!properties.why || !list.length; } }
    }, 'so-layer-comp');
    comp.disabled = !!properties.why || !list.length;
    comp.title = properties.why || (list.length ? '选择图层复合' : '源文档没有图层复合');
    row(box, P, 'smart', '', comp);
  }
  wideRow(box, P, 'quick', info && info.linked ? actBtn('嵌入', 'layer.smart.embed', { attr: 'so-embed' }) : actBtn('转换为链接对象…', 'layer.smart.convertToLinked', { attr: 'so-to-linked' }));
  wideRow(box, P, 'quick', actBtn('转换为图层', 'layer.smart.convertToLayers', { attr: 'so-to-layers' }));
  if (info && info.linked) wideRow(box, P, 'smart-extra', actBtn('重新链接到文件…', 'layer.smart.relinkFile'), actBtn('更新修改的内容', 'layer.smart.updateModified'));
}


const AI_WHY = 'AI 功能（Adobe Firefly / Sensei 云端模型），本编辑器不提供';
function aiBtn(label) { const b = mk('button', { type: 'button', textContent: label, disabled: true, title: AI_WHY }); b.dataset.ai = '1'; return b; }
function quickActions(box, ctx, idx, l) {
  const P = 'layer', S = 'quick';
  if (ctx.kind === 'pixel') {
    wideRow(box, P, S, aiBtn('移除背景'), actBtn('选择主体', 'select.subject', { attr: 'quick-subject' }));
  } else if (ctx.kind === 'text') {
    wideRow(box, P, S, actBtn('转换为段落文本', 'type.convertToParagraph', { attr: 'quick-text-para' }), actBtn('转换为形状', 'type.convertToShape', { attr: 'quick-text-shape' }));
    wideRow(box, P, S, actBtn('创建文字变形…', 'type.warp'), actBtn('栅格化文字', 'type.rasterize'));
  } else if (ctx.kind === 'shape') {
    const b = mk('button', { type: 'button', textContent: '编辑路径', title: '路径选择工具（A）' }); b.onclick = () => { A.setTool('path'); A.renderProps(); };
    wideRow(box, P, S, b, actBtn('栅格化形状', 'layer.rasterize.shape'));
  }
}


const maskPick = new Map();                     







function hasPixelMask(idx, l) {
  return !!(l && (l.mask || A.mask.pending(idx) || maskPick.get(Number(idx)) === 'pixel'));
}
function hasVectorMask(l, shape = false) {
  

  const shapeLike = !!(l && !l.isSmartObject && !l.text && l.vectorMask
    && (l.adjustment?.kind === 'fill' || l.fill || l.vectorStroke));
  return !!(l && l.vectorMask) && !(shape || shapeLike);
}
function maskKindOf(idx, l, shape = !!(cur.ctx && cur.ctx.kind === 'shape')) {
  const hasPix = hasPixelMask(idx, l), hasVec = hasVectorMask(l, shape);
  const want = maskPick.get(idx);
  if (want === 'vector' && hasVec) return 'vector';
  if (want === 'pixel' && hasPix) return 'pixel';
  return hasPix ? 'pixel' : hasVec ? 'vector' : null;
}






function selectMask(idx, kind) {
  if (idx == null || (kind !== 'pixel' && kind !== 'vector')) return null;
  maskPick.set(Number(idx), kind);
  return kind;
}
function renderMask(box, idx, l, g) {
  const P = 'mask', M = 'mask-main';
  const kind = maskKindOf(idx, l, !!g.shape);
  const hasPix = hasPixelMask(idx, l), hasVec = hasVectorMask(l, !!g.shape);   
  if (!hasPix && !hasVec) return;                 
  
  const pix = iconBtn('add-mask', hasPix ? '选择像素蒙版' : '添加像素蒙版', () => {
    if (hasPix) { selectMask(idx, 'pixel'); A.renderProps(); } else A.actions.run('layer.mask.revealAll');
  }, 'mask-pick-pixel');
  pix.classList.toggle('on', kind === 'pixel');
  const vec = iconBtn('layer-vector', hasVec ? '选择矢量蒙版' : '添加矢量蒙版', () => {
    if (hasVec) { selectMask(idx, 'vector'); A.renderProps(); } else A.actions.run('layer.vectorMask.revealAll');
  }, 'mask-pick-vector');
  vec.classList.toggle('on', kind === 'vector');
  if (!hasVec && !A.actions.enabled('layer.vectorMask.revealAll')) { vec.disabled = true; vec.title = A.actions.why('layer.vectorMask.revealAll') || '这一层不能添加矢量蒙版'; }
  row(box, P, M, '', pix, vec, mk('span', { className: 'pp-mask-kind', textContent: kind === 'vector' ? '矢量蒙版' : kind === 'pixel' ? '像素蒙版' : '' }))
    .classList.add('pp-mask-head');
  if (!kind) return;
  const pending = !l.mask && A.mask.pending(idx);
  
  const paramWhy = kind === 'vector' ? (g.structBusy || '')
    : pending ? '新建的蒙版还没落进文件：先导出一次（或撤销新建）再调浓度 / 羽化'
    : (g.G.params || g.structBusy || '');
  
  const fDen = kind === 'vector' ? 'vectorDensity' : 'density', fFea = kind === 'vector' ? 'vectorFeather' : 'feather';
  const numOk = kind === 'vector' || !!l.mask;
  const den = numOk ? A.mask.num(idx, fDen, 255) : 255;
  const fea = numOk ? A.mask.num(idx, fFea, 0) : 0;
  const denPct = Math.round(den / 255 * 100);
  const denR = mk('input', { type: 'range', min: 0, max: 100, value: denPct, disabled: !!paramWhy, title: paramWhy || '浓度：蒙版的不透明度（0% = 蒙版完全不起作用）' });
  const denN = numInput(denPct, { min: 0, max: 100, attr: 'mask-density-num', disabled: !!paramWhy, title: paramWhy || '浓度（%）' });
  denR.dataset.attr = 'mask-density';
  const setDen = pct => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    const orig = A.mask.base(idx, fDen, 255);      
    A.mask.setNum(idx, fDen, pct === Math.round(orig / 255 * 100) ? orig : Math.round(pct * 2.55), 255);
  };
  denR.oninput = () => { denN.value = denR.value; };
  denR.onchange = () => setDen(+denR.value);
  denN.onchange = () => setDen(+denN.value);
  row(box, P, M, '浓度', denR, denN, unit('%'));
  const feaR = mk('input', { type: 'range', min: 0, max: 1000, step: 0.1, value: fea, disabled: !!paramWhy, title: paramWhy || '羽化（像素）' });
  const feaN = numInput(Math.round(fea * 10) / 10, { min: 0, max: 1000, step: 0.1, attr: 'mask-feather-num', disabled: !!paramWhy, title: paramWhy || '羽化（像素）' });
  feaR.dataset.attr = 'mask-feather';
  feaR.oninput = () => { feaN.value = (+feaR.value).toFixed(1); };
  feaR.onchange = () => A.mask.setNum(idx, fFea, Math.round(+feaR.value * 10) / 10, 0);
  feaN.onchange = () => A.mask.setNum(idx, fFea, Math.max(0, Math.min(1000, Math.round(+feaN.value * 10) / 10)), 0);
  row(box, P, M, '羽化', feaR, feaN, unit('像素'));
  
  const R = 'mask-refine';
  const vecWhy = kind === 'vector' ? '矢量蒙版没有「调整」这一组（PS 同）' : '';
  const pendWhy = pending ? '新建的蒙版还没有像素：先在蒙版上涂一笔或导出一次' : '';
  const sm = mk('button', { type: 'button', textContent: '选择并遮住…', disabled: !!(vecWhy || pendWhy), title: vecWhy || pendWhy || '在「选择并遮住」里细调这张蒙版的边缘' });
  sm.dataset.attr = 'mask-select-and-mask'; sm.onclick = () => A.mask.selectAndMask(idx);
  const cr = mk('button', { type: 'button', textContent: '颜色范围…', disabled: !!vecWhy, title: vecWhy || '用「色彩范围」重新生成这张蒙版' });
  cr.dataset.attr = 'mask-color-range'; cr.onclick = () => A.mask.colorRange(idx);
  const invOn = kind === 'pixel' && l.mask ? A.mask.flag(idx, 'invert') : false;
  const inv = mk('button', { type: 'button', textContent: '反相', className: invOn ? 'on' : '', disabled: !!(vecWhy || pendWhy || g.G.maskProps || g.structBusy),
    title: vecWhy || pendWhy || g.G.maskProps || g.structBusy || '蒙版反相（⌘I）' });
  inv.dataset.attr = 'mask-invert'; inv.onclick = () => A.mask.setFlag(idx, 'invert', !invOn);
  wideRow(box, P, R, sm, cr);
  wideRow(box, P, R, inv);
  
  const foot = mk('div', { className: 'adj-foot pp-mask-foot' });
  const fb = (attr, name, title, fn, why) => {
    const b = mk('button', { type: 'button', className: 'af-btn', title: why || title, disabled: !!why });
    b.dataset.attr = attr; b.setAttribute('aria-label', title); b.append(A.icon(A.hasIcon(name) ? name : 'grid-2x2', 14));
    b.onclick = fn; return b;
  };
  const disabledNow = kind === 'pixel' ? (l.mask ? A.mask.flag(idx, 'disabled') : false) : A.mask.vflag(idx, 'disable');
  foot.append(
    fb('mask-load-selection', 'mask-load-selection', '从蒙版中载入选区',
      () => kind === 'pixel' ? A.mask.loadSelection(idx, 'replace') : A.mask.vectorToSelection(idx, 'replace'),
      kind === 'pixel' && pending ? pendWhy : ''),
    fb('mask-apply', 'mask-apply', '应用蒙版', () => A.actions.run('layer.mask.apply'),
      kind === 'vector' ? '矢量蒙版不能直接应用：先栅格化（图层 › 栅格化 › 矢量蒙版）' : (A.actions.enabled('layer.mask.apply') ? '' : '新建的蒙版还没落进文件：先导出一次再应用')),
    fb('mask-toggle', disabledNow ? 'eye-off' : 'eye', disabledNow ? '启用蒙版' : '停用蒙版', () => A.actions.run(kind === 'pixel' ? 'layer.mask.toggle' : 'layer.vectorMask.toggle'),
      kind === 'pixel' ? (A.actions.enabled('layer.mask.toggle') ? '' : '这张蒙版现在改不了开关') : ''),
    fb('mask-delete', 'trash-2', '删除蒙版', () => A.actions.run(kind === 'pixel' ? 'layer.mask.delete' : 'layer.vectorMask.delete'),
      A.actions.enabled(kind === 'pixel' ? 'layer.mask.delete' : 'layer.vectorMask.delete') ? '' : '这张蒙版现在删不了'));
  const fr = row(box, P, M, '', foot); fr.classList.add('pp-foot-row');
}


function decorate(box, ctx) {
  const actionsFor = section => {
    const details = box.querySelector(`.prop-section[data-section="${section}"]`);
    if (!details) return null;
    let shell = details.parentElement;
    if (!shell.classList.contains('pp-section-shell')) {
      shell = mk('div', { className: 'pp-section-shell' });
      Object.assign(shell.dataset, details.dataset);
      details.replaceWith(shell); shell.append(details);
    }
    let header = shell.querySelector(':scope > .pp-section-actions');
    if (!header) {
      header = mk('header', { className: 'pp-section-actions' });
      header.setAttribute('role', 'toolbar');
      header.setAttribute('aria-label', `${details.querySelector('summary')?.textContent || section}操作`);
      header.addEventListener('keydown', e => {
        if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === ' ' || e.key === 'Enter')) e.stopPropagation();
      });
      shell.append(header); details.classList.add('has-section-actions');
    }
    return header;
  };
  if (ctx.kind === 'smart') {
    const reset = box.querySelector('[data-attr="so-reset-transform"]');
    const header = reset && actionsFor('transform');
    if (reset && header) {
      const host = reset.closest('.row');
      header.append(reset); host?.remove();
    }
  }
  const more = (section, title, fn, attr) => {
    const header = actionsFor(section);
    if (!header || header.querySelector('.pp-more')) return;
    const b = mk('button', { type: 'button', className: 'pp-more', title, textContent: '⋯' });
    b.dataset.attr = attr; b.setAttribute('aria-label', title);
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); fn(); };
    header.append(b);
  };
  if (ctx.kind === 'text') {
    more('character', '更多选项（字符面板）', () => A.openCharacter(), 'text-more-character');
    more('paragraph', '更多选项（段落面板）', () => A.openParagraph(), 'text-more-paragraph');
  }
  box.dataset.ppKind = ctx.kind;
}




let prevSnap = { idx: -1, snap: null };
function notePropsLayer(idx) { if (prevSnap.idx !== idx) prevSnap = { idx, snap: idx >= 0 ? A.layerOpsSnapshot() : null }; }
let holding = null;
function holdPrev(on) {
  if (on) {
    if (holding || prevSnap.idx !== A.selLayer() || !prevSnap.snap) return;
    holding = A.layerOpsSnapshot();
    const mix = { ...holding }; const k = String(prevSnap.idx);
    if (prevSnap.snap[k]) mix[k] = prevSnap.snap[k]; else delete mix[k];
    A.restoreLayerOps(mix);
    document.querySelectorAll('[data-attr="adjp-prev"]').forEach(b => b.classList.add('on'));
  } else if (holding) {
    const h = holding; holding = null;
    A.restoreLayerOps(h);
    document.querySelectorAll('[data-attr="adjp-prev"]').forEach(b => b.classList.remove('on'));
  }
}
function bindPrevState(btn, idx) {
  notePropsLayer(idx);
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); holdPrev(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => holdPrev(false));
}


const maskOpts = Object.assign({ color: [255, 0, 0], opacity: 50 }, LS.get('psd_editor.layerMaskDisplay', {}));
let overlayOn = false, overlayRaf = 0, overlayKey = '';
async function openMaskOptions() {
  const hex = '#' + maskOpts.color.map(v => v.toString(16).padStart(2, '0')).join('');
  const before = { ...maskOpts, color: maskOpts.color.slice() };
  const r = await A.formDialog('图层蒙版显示选项', [
    { key: 'color', label: '颜色', type: 'color', value: hex },
    { key: 'opacity', label: '不透明度', type: 'number', value: maskOpts.opacity, min: 0, max: 100, unit: '%' },
    { type: 'note', label: '按 \\ 键在画布上以这种颜色叠加显示当前图层的蒙版（蒙版黑色的部分被着色）。' },
  ], { onChange: v => { maskOpts.color = [1, 3, 5].map(i => parseInt(String(v.color).slice(i, i + 2), 16) || 0); maskOpts.opacity = +v.opacity; overlayKey = ''; } });
  if (!r) { Object.assign(maskOpts, before); overlayKey = ''; return; }
  maskOpts.color = [1, 3, 5].map(i => parseInt(String(r.color).slice(i, i + 2), 16) || 0);
  maskOpts.opacity = Math.max(0, Math.min(100, Math.round(+r.opacity || 0)));
  LS.set('psd_editor.layerMaskDisplay', maskOpts); overlayKey = '';
}
function overlayCanvas() {
  let c = document.getElementById('ppMaskOverlay');
  if (!c) {
    const g = A.gizmo().el; if (!g || !g.parentNode) return null;
    c = mk('canvas', { id: 'ppMaskOverlay' }); c.setAttribute('aria-hidden', 'true');
    g.parentNode.insertBefore(c, g);
  }
  return c;
}
function drawOverlay() {
  overlayRaf = 0;
  const c = overlayCanvas(); if (!c) return;
  const idx = A.selLayer(), gray = overlayOn && idx >= 0 ? A.mask.grayOnCanvas(idx) : null;
  if (!overlayOn || !gray) { c.hidden = true; if (overlayOn && !gray) overlayOn = false; return; }
  const { el, tx } = A.gizmo();
  const key = [idx, el.width, el.height, el.style.cssText, tx.sx, tx.sy, tx.tx, tx.ty, maskOpts.color.join(), maskOpts.opacity, gray.length, A.docW()].join('|');
  if (key !== overlayKey) {
    overlayKey = key;
    c.hidden = false; c.style.cssText = el.style.cssText; c.style.pointerEvents = 'none';
    c.className = 'pp-mask-overlay';
    if (c.width !== el.width) c.width = el.width; if (c.height !== el.height) c.height = el.height;
    const W = A.docW(), H = A.docH();
    const src = mk('canvas', { width: W, height: H }), sg = src.getContext('2d');
    const img = sg.createImageData(W, H), d = img.data, [r, gg, b] = maskOpts.color, a = maskOpts.opacity / 100;
    for (let i = 0, o = 0; i < gray.length; i++, o += 4) { d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = Math.round((255 - gray[i]) * a); }
    sg.putImageData(img, 0, 0);
    const ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(tx.sx, 0, 0, tx.sy, tx.tx, tx.ty); ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0);
  }
  overlayRaf = requestAnimationFrame(drawOverlay);
}
function toggleOverlay(force) {
  overlayOn = force == null ? !overlayOn : !!force;
  overlayKey = '';
  if (overlayOn && !overlayRaf) overlayRaf = requestAnimationFrame(drawOverlay);
  if (!overlayOn) { const c = document.getElementById('ppMaskOverlay'); if (c) c.hidden = true; }
  return overlayOn;
}


function adjTargetNow() {
  const idx = A.selLayer(); const l = idx >= 0 ? A.layer(idx) : null;
  if (!l || !l.adjustment) return null;
  const t = A.adj.target(idx); return t ? { idx, t } : null;
}
function adjModel(idx, t) {
  const map = {};
  for (const p of A.adj.paths(t)) { const v = A.adj.get(idx, t, p); if (v !== undefined) map[p] = v; }
  return unflatten(map);
}
function unflatten(map) {
  const root = {};
  for (const [path, value] of Object.entries(map)) {
    const keys = path.split('.'); let o = root;
    keys.forEach((k, i) => { if (i === keys.length - 1) o[k] = value; else { if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[k]; } });
  }
  return root;
}
async function savePreset() {
  const at = adjTargetNow(); if (!at) return;
  const F = PRESET_FORMATS[at.t.kind]; if (!F) return;
  const bytes = F.curves ? F.encode(A.adj.curves(at.idx, at.t)) : F.encode(adjModel(at.idx, at.t));
  const name = (A.layerName(at.idx) || F.label).replace(/[\\/:*?"<>|]/g, '_') + F.ext;
  download(bytes, name);
  A.shell.status(`已存储${F.label}预设：${name}`);
}
async function loadPreset() {
  const at = adjTargetNow(); if (!at) return;
  const F = PRESET_FORMATS[at.t.kind]; if (!F) return;
  const file = await pickFile(F.ext);
  if (!file) return;
  let model;
  try { model = F.decode(new Uint8Array(await file.arrayBuffer())); }
  catch (e) { await A.alertDialog(`无法载入「${file.name}」：${e.message || e}`, { title: `载入${F.label}预设` }); return; }
  const label = `载入${F.label}预设`;
  if (F.curves) A.adj.setCurves(at.idx, at.t, model.curves.map(list => list.map(p => ({ input: p.input, output: p.output }))), label);
  else A.adj.setMany(at.idx, at.t, flattenModel(model), label);
  A.shell.status(`已载入${F.label}预设：${file.name}`);
}


async function openCurveDisplay() {
  const v = A.adj.curveView;
  const r = await A.formDialog('曲线显示选项', [
    { key: 'amount', label: '显示数量', type: 'select', value: v.ink ? 'ink' : 'light', options: [['light', '光 (0-255)'], ['ink', '颜料/油墨 %']] },
    { key: 'grid', label: '网格大小', type: 'select', value: v.fine ? 'fine' : 'simple', options: [['simple', '简单（4×4）'], ['fine', '详细（10×10）']] },
    { type: 'note', label: '显示：' },
    { key: 'overlay', label: '通道叠加', type: 'check', value: v.overlay },
    { key: 'hist', label: '直方图', type: 'check', value: v.hist },
    { key: 'baseline', label: '基线', type: 'check', value: v.baseline },
    { key: 'cross', label: '交叉线', type: 'check', value: v.cross },
    { type: 'note', label: '按住 Alt 单击曲线网格也能在简单 / 详细网格之间切换。' },
  ]);
  if (!r) return;
  A.adj.setCurveView({ ink: r.amount === 'ink', fine: r.grid === 'fine', overlay: !!r.overlay, hist: !!r.hist, baseline: !!r.baseline, cross: !!r.cross });
}


const AUTO_DEFAULT = { algo: 'perChannel', neutral: false, shadowClip: 0.1, highlightClip: 0.1 };
const autoOpts = Object.assign({}, AUTO_DEFAULT, LS.get('psd_editor.autoColorOpts', {}));
async function openAutoOptions() {
  const r = await A.formDialog('自动颜色校正选项', [
    { key: 'algo', label: '算法', type: 'select', value: autoOpts.algo, options: [
      ['mono', '增强单色对比度'], ['perChannel', '增强每通道的对比度'], ['darkLight', '查找深色与浅色'], ['brightness', '增强亮度和对比度']] },
    { key: 'neutral', label: '对齐中性中间调', type: 'check', value: autoOpts.neutral },
    { key: 'shadowClip', label: '阴影 修剪', type: 'number', value: autoOpts.shadowClip, min: 0, max: 9.99, step: 0.01, unit: '%' },
    { key: 'highlightClip', label: '高光 修剪', type: 'number', value: autoOpts.highlightClip, min: 0, max: 9.99, step: 0.01, unit: '%' },
    { key: 'asDefault', label: '存储为默认值', type: 'check', value: true },
    { type: 'note', label: '「增强亮度和对比度」「查找深色与浅色」是 Adobe 未公开的算法，这里按名字语义实现（整体拉伸 / 每通道取深浅端点并保持中性），不是逐像素等价。' },
  ]);
  if (!r) return;
  Object.assign(autoOpts, { algo: r.algo, neutral: !!r.neutral, shadowClip: +r.shadowClip, highlightClip: +r.highlightClip });
  if (r.asDefault) LS.set('psd_editor.autoColorOpts', { algo: autoOpts.algo, neutral: autoOpts.neutral, shadowClip: autoOpts.shadowClip, highlightClip: autoOpts.highlightClip });
}

export function autoLevels(h, gammaOf) {
  if (!h) return null;
  const lo = autoOpts.shadowClip / 100, hi = autoOpts.highlightClip / 100;
  const ends = (bins, cl, ch) => {
    let total = 0; for (let i = 0; i < 256; i++) total += bins[i];
    if (!total) return null;
    let acc = 0, a = 0, b = 255;
    for (let i = 0; i < 256; i++) { acc += bins[i]; if (acc > total * cl) { a = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += bins[i]; if (acc > total * ch) { b = i; break; } }
    return b > a ? [a, b] : null;
  };
  const mean = (bins, a, b) => { let s = 0, n = 0; for (let i = 0; i < 256; i++) { s += bins[i] * Math.max(0, Math.min(1, (i - a) / (b - a))); n += bins[i]; } return n ? s / n : 0.5; };
  const out = {};
  if (autoOpts.algo === 'mono' || autoOpts.algo === 'brightness') {
    const sum = new Float64Array(256); for (const c of ['r', 'g', 'b']) for (let i = 0; i < 256; i++) sum[i] += h[c][i];
    const e = ends(sum, lo, hi); if (!e) return null;
    for (const c of ['r', 'g', 'b']) out[c] = { inputBlack: e[0], inputWhite: e[1], gamma: gammaOf ? gammaOf(c) : 1, outputBlack: 0, outputWhite: 255 };
    if (autoOpts.algo === 'brightness') {             
      const m = mean(sum, e[0], e[1]); const gam = m > 0.01 && m < 0.99 ? Math.max(0.5, Math.min(2, Math.log(m) / Math.log(0.5))) : 1;
      for (const c of ['r', 'g', 'b']) out[c].gamma = Math.round(gam * 100) / 100;
    }
  } else {
    for (const c of ['r', 'g', 'b']) {
      const e = ends(h[c], lo, hi); if (!e) continue;
      out[c] = { inputBlack: e[0], inputWhite: e[1], gamma: gammaOf ? gammaOf(c) : 1, outputBlack: 0, outputWhite: 255 };
    }
  }
  if (autoOpts.neutral || autoOpts.algo === 'darkLight') {   
    const ms = {}; for (const c of Object.keys(out)) ms[c] = mean(h[c], out[c].inputBlack, out[c].inputWhite);
    const vals = Object.values(ms); const target = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    if (target > 0.02 && target < 0.98) for (const c of Object.keys(out)) {
      const m = ms[c]; if (m > 0.01 && m < 0.99) out[c].gamma = Math.round(Math.max(0.1, Math.min(9.99, Math.log(m) / Math.log(target))) * 100) / 100;
    }
  }
  return Object.keys(out).length ? out : null;
}

const ADJ_NAMES = { levels: '色阶', brightnessContrast: '亮度/对比度', curv: '曲线', expA: '曝光度', vibA: '自然饱和度', hue2: '色相/饱和度',
  blnc: '色彩平衡', blwh: '黑白', phfl: '照片滤镜', mixr: '通道混合器', clrL: '颜色查找', nvrt: '反相', post: '色调分离', thrs: '阈值',
  grdm: '渐变映射', selc: '可选颜色' };
function menuItems() {
  const idx = A.selLayer(), l = idx >= 0 ? A.layer(idx) : null;
  if (!l) return [];
  if (cur.tab === 'mask') {
    const kind = maskKindOf(idx, l), pix = kind === 'pixel' && hasPixelMask(idx, l), sel = A.hasSelection();
    const vec = kind === 'vector' && !!l.vectorMask;
    const canLoad = pix || vec, name = vec ? '矢量蒙版' : '蒙版';
    const loadWhy = canLoad ? '' : '当前没有可载入的蒙版';
    const load = mode => vec ? A.mask.vectorToSelection(idx, mode) : A.mask.loadSelection(idx, mode);
    return [
      { label: '蒙版选项…', disabled: !pix, why: pix ? '' : '像素蒙版显示选项', run: openMaskOptions },
      { sep: true },
      { label: `添加${name}到选区`, disabled: !canLoad, why: loadWhy, run: () => load('add') },
      { label: `从选区中减去${name}`, disabled: !canLoad || !sel, why: loadWhy || (sel ? '' : '先要有选区'), run: () => load('subtract') },
      { label: `${name}与选区交叉`, disabled: !canLoad || !sel, why: loadWhy || (sel ? '' : '先要有选区'), run: () => load('intersect') },
      { sep: true },
      { label: '显示蒙版叠加（\\）', checked: overlayOn, disabled: !pix, run: () => toggleOverlay() },
    ];
  }
  if (l.adjustment && l.adjustment.kind !== 'fill') {
    const at = adjTargetNow(); const kind = at ? at.t.kind : null;
    const name = ADJ_NAMES[kind] || (l.adjustment.label || '调整');
    const items = [];
    if (kind === 'levels' || kind === 'curv') items.push({ label: '自动选项…', run: openAutoOptions });
    if (kind === 'curv') items.push({ label: '曲线显示选项…', run: openCurveDisplay });
    if (kind === 'levels' || kind === 'curv') items.push({ sep: true });
    const F = PRESET_FORMATS[kind], U = PRESET_UNSUPPORTED[kind];
    if (F) items.push({ label: `存储${F.label}预设…`, run: savePreset }, { label: `载入${F.label}预设…`, run: loadPreset }, { sep: true });
    else if (U) {
      const why = `${U.label}预设文件（${U.ext}）的格式 Adobe 没有公开，读写都做不到逐字节兼容`;
      items.push({ label: `存储${U.label}预设…`, disabled: true, why }, { label: `载入${U.label}预设…`, disabled: true, why }, { sep: true });
    }
    items.push({ label: `复位${name}`, disabled: !at, why: at ? '' : '这类调整没有可复位的参数控件', run: () => at && A.adj.reset(at.idx, at.t) });
    return items;
  }
  return [];
}


function onKey(e, down) {
  if (e.key !== '\\' || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const idx = A.selLayer(), l = idx >= 0 ? A.layer(idx) : null;
  if (!l) return;
  if (l.adjustment && cur.tab !== 'mask' && A.panels.isVisible('properties')) {     
    e.preventDefault(); holdPrev(down); return;
  }
  if (down && !e.repeat && hasPixelMask(idx, l)) { e.preventDefault(); toggleOverlay(); }   
}


const CSS = `
.app.ps #panelProps > .panel-head { display: none; }
.app.ps #propTabs .prop-head-title { margin-left: 4px; font-size: 12px; font-weight: 600; color: #e6e6e6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app.ps .pp-section-shell { position: relative; }
.app.ps .prop-section.has-section-actions > summary { padding-right: 42px; }
.app.ps .pp-section-actions { position: absolute; top: 5px; right: 8px; display: flex; align-items: center; gap: 4px; }
.app.ps .pp-section-actions .pp-more { min-height: 18px; height: 18px; width: 22px; padding: 0; border: none; background: transparent; color: #cfcfcf; font-size: 14px; line-height: 1; display: grid; place-items: center; }
.app.ps .pp-section-actions .pp-more:hover { background: var(--ps-hover, #3a3a3a); }
.app.ps .pp-section-actions .pp-ibtn { width: 28px; min-height: 24px; padding: 0; display: grid; place-items: center; border: 1px solid transparent; background: transparent; }
.app.ps .pp-section-actions button:focus-visible { outline: 2px solid var(--ps-accent, #2a9fff); outline-offset: 1px; }
.app.ps .prop-section .pp-unit { color: var(--ps-muted, #9a9a9a); font-size: 11px; white-space: nowrap; }
.app.ps .prop-section .pp-cap { color: var(--ps-muted, #9a9a9a); font-size: 11px; white-space: nowrap; }
.app.ps .prop-section .pp-xy { color: var(--ps-muted, #9a9a9a); font-size: 11px; width: 12px; flex: none; }
.app.ps .prop-section .pp-muted { color: var(--ps-muted, #9a9a9a); font-size: 11px; }
.app.ps .prop-section .pp-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #ddd; white-space: nowrap; min-width: 0 !important; }
.app.ps .prop-section .pp-check input { margin: 0; }
.app.ps .prop-section .pp-seg { display: inline-flex; gap: 2px; }
.app.ps .prop-section .pp-orient { width: 26px; min-height: 23px; padding: 0; display: grid; place-items: center; background: #252525; border: 1px solid #454545; }
.app.ps .prop-section .pp-orient.on { background: var(--ps-active, #4a4a4a); border-color: #6a6a6a; }
.app.ps .prop-section .pp-orient i { display: block; border: 1.5px solid #d6d6d6; border-radius: 1px; }
.app.ps .prop-section .pp-o-p { width: 8px; height: 12px; } .app.ps .prop-section .pp-o-l { width: 12px; height: 8px; }
.app.ps .prop-section .pp-ibtn { width: 28px; min-height: 26px; padding: 0; display: grid; place-items: center; background: transparent; border: 1px solid transparent; }
.app.ps .prop-section .pp-ibtn.on { background: var(--ps-active, #4a4a4a); border-color: #6a6a6a; }
.app.ps .prop-section .pp-ibtn:hover:not(:disabled) { background: var(--ps-hover, #3a3a3a); }
.app.ps .prop-section .pp-mask-kind { font-size: 11px; color: #ddd; margin-left: 4px; }
.app.ps .prop-section input[type=range] { flex: 1; min-width: 40px; accent-color: #bbb; }
.app.ps .prop-section .pp-foot-row { justify-content: flex-end; border-top: 1px solid var(--ps-line, #333); margin-top: 6px; padding-top: 4px; }
.app.ps .prop-section .pp-mask-foot { margin: 0; padding: 0; justify-content: flex-end; width: 100%; }
.app.ps .prop-section .prop-smart-dimension { flex: 1; min-width: 0; font-variant-numeric: tabular-nums; color: #ddd; }
.app.ps .prop-no-properties { display: flex; align-items: center; min-height: 34px; padding: 0 10px; border-bottom: 1px solid var(--ps-line); color: var(--ps-muted, #9a9a9a); font-size: 12px; }
.app.ps .pp-frame-stroke { border: 0; padding: 0; margin: 0; min-width: 0; width: 100%; }
.app.ps .adj-foot { justify-content: flex-end; border-top: 1px solid var(--ps-line, #333); padding-top: 5px; }
.app.ps .adj-foot .af-btn:disabled { opacity: .4; }
.pp-mask-overlay { position: absolute; pointer-events: none; }
`;


export const PP = {
  syncHeader, renderDocument, renderMulti, renderGroup, renderFrame, renderMask, renderSmart, renderAlignOptions, quickActions, decorate,
  get alignTo() { return propertyAlignTo; },
  prevStateIcon: 'prev-state', bindPrevState, autoLevels, openMaskOptions, openAutoOptions, toggleOverlay,
  menuItems, get autoOptions() { return { ...autoOpts }; }, get maskDisplay() { return { ...maskOpts, overlay: overlayOn }; },
  savePreset, loadPreset, holdPrev,
  
  selectMask, maskKind: (idx, l) => maskKindOf(idx, l),
};
export function installPropsPS(api) {
  A = api;
  if (!document.getElementById('pp-style')) document.head.append(mk('style', { id: 'pp-style', textContent: CSS }));
  A.panels.setPanelMenu('properties', menuItems);
  addEventListener('keydown', e => onKey(e, true), true);
  addEventListener('keyup', e => onKey(e, false), true);
  addEventListener('blur', () => holdPrev(false));
  return PP;
}
