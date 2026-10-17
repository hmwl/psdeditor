












let A = null;
const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const LS_KEY = 'psd_editor.adjPanel';
const S = Object.assign({ showPresets: true, view: 'icon', addMask: true, clipOnAdd: false, group: 'portrait', presetsOpen: true, singleOpen: true },
  (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { return {}; } })());
const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} };


export const SINGLE_ADJ = [['brightnessContrast', '亮度/对比度'], ['levels', '色阶'], ['curves', '曲线'], ['exposure', '曝光度'],
  ['vibrance', '自然饱和度'], ['hueSaturation', '色相/饱和度'], ['colorBalance', '色彩平衡'], ['blackWhite', '黑白'],
  ['photoFilter', '照片滤镜'], ['channelMixer', '通道混合器'], ['colorLookup', '颜色查找'], ['invert', '反相'],
  ['posterize', '色调分离'], ['threshold', '阈值'], ['gradientMap', '渐变映射'], ['selectiveColor', '可选颜色']];



const P = (name, ...layers) => ({ name, layers });
const L = (kind, values, extra) => ({ kind, values, ...(extra || {}) });
export const PRESET_GROUPS = [
  { id: 'portrait', label: '人像', presets: [
    P('柔和肤色', L('curves', { points: [[0, 12], [128, 134], [255, 250]] }), L('colorBalance', { midtones: [6, 0, -6] }), L('hueSaturation', { saturation: -8 })),
    P('暖调人像', L('photoFilter', { color: [236, 138, 0], density: 18, preserveLuminosity: true }), L('vibrance', { vibrance: 12 })),
    P('明亮通透', L('exposure', { exposure: 0.3, gamma: 1.05 }), L('curves', { points: [[0, 0], [64, 70], [190, 205], [255, 255]] })),
    P('低饱和人像', L('vibrance', { vibrance: -25, saturation: -10 }), L('curves', { points: [[0, 10], [255, 245]] })),
  ] },
  { id: 'landscape', label: '风景', presets: [
    P('鲜艳风景', L('curves', { points: [[0, 0], [64, 54], [192, 204], [255, 255]] }), L('vibrance', { vibrance: 35, saturation: 8 })),
    P('日落暖调', L('photoFilter', { color: [250, 150, 40], density: 30, preserveLuminosity: true }), L('colorBalance', { highlights: [10, 0, -12] })),
    P('清冷山景', L('colorBalance', { midtones: [-10, 0, 12] }), L('hueSaturation', { saturation: -6 })),
    P('通透天空', L('levels', { shadowInput: 12, highlightInput: 245, gamma: 0.95 }), L('vibrance', { vibrance: 25 })),
  ] },
  { id: 'photo', label: '摄影', presets: [
    P('增加对比度', L('curves', { points: [[0, 0], [64, 48], [192, 210], [255, 255]] })),
    P('褪色胶片', L('curves', { points: [[0, 30], [128, 128], [255, 235]] }), L('hueSaturation', { saturation: -15 })),
    P('高调', L('exposure', { exposure: 0.5 }), L('levels', { shadowOutput: 20 })),
    P('低调', L('exposure', { exposure: -0.4 }), L('curves', { points: [[0, 0], [128, 110], [255, 240]] })),
  ] },
  { id: 'creative', label: '创意', presets: [
    P('青橙', L('colorBalance', { shadows: [-15, 0, 15], highlights: [15, 0, -15] }), L('vibrance', { vibrance: 15 })),
    P('复古', L('curves', { points: [[0, 24], [128, 132], [255, 236]] }), L('hueSaturation', { saturation: -20 }), L('photoFilter', { color: [180, 120, 60], density: 35, preserveLuminosity: true })),
    P('紫金双色调', L('gradientMap', { stops: [[0, 40, 20, 90], [4096, 255, 210, 120]] }, { opacity: 204 })),
    P('交叉冲印', L('curves', { points: [[0, 0], [70, 55], [180, 205], [255, 255]] }), L('colorBalance', { shadows: [0, -10, 20], highlights: [0, 8, -20] }), L('vibrance', { vibrance: 30 })),
  ] },
  { id: 'bw', label: '黑白', presets: [
    P('标准黑白', L('blackWhite', {})),
    P('高对比度黑白', L('blackWhite', {}), L('curves', { points: [[0, 0], [64, 40], [192, 220], [255, 255]] })),
    P('红色滤镜黑白', L('blackWhite', { red: 120, yellow: 110, green: -10, cyan: -50, blue: -50, magenta: 80 })),
    P('棕褐色调', L('blackWhite', {}), L('photoFilter', { color: [172, 122, 51], density: 60, preserveLuminosity: true })),
  ] },
  { id: 'cinema', label: '电影', presets: [
    P('电影青橙', L('curves', { points: [[0, 14], [128, 126], [255, 244]] }), L('colorBalance', { shadows: [-18, 0, 18], highlights: [14, 0, -16] }), L('vibrance', { vibrance: 10 })),
    P('冷峻夜色', L('exposure', { exposure: -0.3 }), L('colorBalance', { midtones: [-12, 0, 18] }), L('hueSaturation', { saturation: -15 })),
    P('暖色怀旧', L('photoFilter', { color: [255, 170, 60], density: 25, preserveLuminosity: true }), L('curves', { points: [[0, 22], [255, 238]] })),
    P('漂白效果', L('hueSaturation', { saturation: -45 }), L('curves', { points: [[0, 0], [64, 46], [192, 214], [255, 255]] })),
  ] },
];
export const PRESET_NOTE = '非 Adobe 原版参数：PS 自带的调整预设是 Adobe 素材，这里是本项目按同名效果自行设计的等价参数';


function previewParams(layer) {
  const v = layer.values || {};
  switch (layer.kind) {
    case 'levels': return { type: 'levels', inputBlack: v.shadowInput ?? 0, inputWhite: v.highlightInput ?? 255, gamma: v.gamma ?? 1, outputBlack: v.shadowOutput ?? 0, outputWhite: v.highlightOutput ?? 255 };
    case 'curves': return { type: 'curves', points: v.points || [[0, 0], [255, 255]] };
    case 'hueSaturation': return { type: 'hueSaturation', hue: v.hue || 0, saturation: v.saturation || 0, lightness: v.lightness || 0 };
    case 'colorBalance': return { type: 'colorBalance', shadows: v.shadows || [0, 0, 0], midtones: v.midtones || [0, 0, 0], highlights: v.highlights || [0, 0, 0], preserveLuminosity: v.preserveLuminosity !== false };
    case 'exposure': return { type: 'exposure', exposure: v.exposure || 0, offset: v.offset || 0, gamma: v.gamma || 1 };
    case 'vibrance': return { type: 'vibrance', vibrance: v.vibrance || 0, saturation: v.saturation || 0 };
    case 'blackWhite': return { type: 'blackWhite', red: v.red ?? 40, yellow: v.yellow ?? 60, green: v.green ?? 40, cyan: v.cyan ?? 60, blue: v.blue ?? 20, magenta: v.magenta ?? 80 };
    case 'photoFilter': return { type: 'photoFilter', color: v.color || [128, 128, 128], density: v.density || 0, preserveLuminosity: v.preserveLuminosity !== false };
    case 'brightnessContrast': return { type: 'brightnessContrast', brightness: v.brightness || 0, contrast: v.contrast || 0, useLegacy: true };
    case 'gradientMap': return { type: 'gradientMap', stops: (v.stops || [[0, 0, 0, 0], [4096, 255, 255, 255]]).map(([p, r, g, b]) => ({ position: p / 4096, color: [r, g, b] })) };
    case 'posterize': return { type: 'posterize', levels: v.levels || 4 };
    case 'threshold': return { type: 'threshold', level: v.level || 128 };
    case 'invert': return { type: 'invert' };
    default: return null;
  }
}
let ADJ = null;                                    
const adjReady = () => ADJ ? Promise.resolve(ADJ) : import('../../core/adjust.js').then(m => (ADJ = m));

function applyPreset(rgba, w, h, preset) {
  let cur = rgba;
  for (const layer of preset.layers) {
    const p = previewParams(layer); if (!p) continue;
    let next;
    try { next = ADJ.applyAdjustment(cur, w, h, p); } catch { continue; }
    const op = layer.opacity != null ? layer.opacity / 255 : 1;
    if (op < 1) for (let i = 0; i < next.length; i += 4) for (let c = 0; c < 3; c++) next[i + c] = Math.round(cur[i + c] + (next[i + c] - cur[i + c]) * op);
    cur = next;
  }
  return cur;
}


const TW = 72, TH = 48;

function sampleCanvas() {
  const c = mk('canvas', { width: TW, height: TH }), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, TH * 0.6); sky.addColorStop(0, '#3d7fd0'); sky.addColorStop(1, '#bcd9ef');
  g.fillStyle = sky; g.fillRect(0, 0, TW, TH);
  g.fillStyle = '#4f8a3a'; g.fillRect(0, TH * 0.62, TW, TH);
  g.fillStyle = '#e8b28f'; g.beginPath(); g.arc(TW * 0.62, TH * 0.48, TH * 0.22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8a3b2a'; g.fillRect(TW * 0.52, TH * 0.66, TW * 0.2, TH * 0.34);
  g.fillStyle = '#f6d36b'; g.beginPath(); g.arc(TW * 0.2, TH * 0.22, TH * 0.1, 0, Math.PI * 2); g.fill();
  return c;
}
let thumbKey = '', thumbJob = 0;
function sourceThumb() {
  const snap = A.hasDoc() ? A.snapshotCanvas(240) : null;
  const c = mk('canvas', { width: TW, height: TH }), g = c.getContext('2d');
  if (!snap) return sampleCanvas();
  g.fillStyle = '#fff'; g.fillRect(0, 0, TW, TH);
  const k = Math.max(TW / snap.width, TH / snap.height), w = snap.width * k, h = snap.height * k;
  g.imageSmoothingQuality = 'high'; g.drawImage(snap, (TW - w) / 2, (TH - h) / 2, w, h);
  return c;
}
async function refreshThumbs(host, force) {
  const key = A.hasDoc() ? A.docKey() : 'sample';
  if (!force && key === thumbKey) return;
  thumbKey = key;
  const job = ++thumbJob;
  await adjReady();
  if (job !== thumbJob) return;
  const src = sourceThumb().getContext('2d').getImageData(0, 0, TW, TH);
  for (const cv of host.querySelectorAll('canvas.ap-thumb')) {
    const preset = presetById(cv.dataset.preset); if (!preset) continue;
    const out = applyPreset(src.data, TW, TH, preset);
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out), TW, TH), 0, 0);
    await new Promise(r => setTimeout(r, 0));
    if (job !== thumbJob) return;
  }
}
const presetById = id => { const [g, i] = String(id).split(':'); const G = PRESET_GROUPS.find(x => x.id === g); return G ? G.presets[+i] : null; };


let hoverTimer = 0, previewEl = null;
function showPreview(preset) {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(async () => {
    if (!A.hasDoc()) return;
    await adjReady();
    const base = A.stageCanvas('#below'); if (!base || !base.width || !base.parentNode) return;
    const W = base.width, H = base.height;
    const tmp = mk('canvas', { width: W, height: H }), tg = tmp.getContext('2d');
    for (const id of ['#below', '#warp', '#above']) { const c = A.stageCanvas(id); if (c && c.width === W && c.height === H) tg.drawImage(c, 0, 0); }
    const img = tg.getImageData(0, 0, W, H);
    const out = applyPreset(img.data, W, H, preset);
    if (!previewEl) { previewEl = mk('canvas', { id: 'adjHoverPreview' }); previewEl.setAttribute('aria-hidden', 'true'); }
    const above = A.stageCanvas('#above') || base;
    if (previewEl.parentNode !== base.parentNode) above.after(previewEl); else if (previewEl.previousElementSibling !== above) above.after(previewEl);
    previewEl.style.cssText = base.style.cssText; previewEl.className = base.className;
    previewEl.style.pointerEvents = 'none';
    previewEl.width = W; previewEl.height = H;
    previewEl.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out.buffer ? out : Uint8ClampedArray.from(out)), W, H), 0, 0);
    previewEl.hidden = false;
    previewEl.dataset.preset = preset.name;
  }, 90);
}
function hidePreview() { clearTimeout(hoverTimer); if (previewEl) { previewEl.hidden = true; delete previewEl.dataset.preset; } }


const COLOR_LABELS = [[0, '无'], [1, '红色'], [2, '橙色'], [3, '黄色'], [4, '绿色'], [5, '蓝色'], [6, '紫色'], [7, '灰色']];
async function addSingle(kind, label, ev) {
  if (!A.hasDoc()) return;
  if (kind === 'colorLookup' && A.actions.has('layer.adjust.colorLookup')) {   
    if (!(ev && ev.altKey)) { A.actions.run('layer.adjust.colorLookup'); return; }
  }
  let opts = { clipping: S.clipOnAdd, mask: S.addMask };
  if (ev && ev.altKey) {
    const r = await A.formDialog('新建图层', [
      { key: 'name', label: '名称', type: 'text', value: label + ' 1' },
      { key: 'clip', label: '使用前一图层创建剪贴蒙版', type: 'check', value: S.clipOnAdd },
      { key: 'color', label: '颜色', type: 'select', value: '0', options: COLOR_LABELS.map(([v, t]) => [String(v), t]) },
      { key: 'mode', label: '模式', type: 'select', value: 'norm', options: A.BLEND_KEYS.map(k => [k, A.BLEND_LABELS[k] || k]) },
      { key: 'opacity', label: '不透明度', type: 'number', value: 100, min: 0, max: 100, unit: '%' },
    ], { okText: '确定' });
    if (!r) return;
    opts = { ...opts, name: String(r.name || '').trim() || label, clipping: !!r.clip, colorLabel: +r.color || 0, blendKey: r.mode, opacity: Math.round(Math.max(0, Math.min(100, +r.opacity)) * 2.55) };
  }
  await A.addAdjustment(kind, null, opts);
}


let hostEl = null, built = false;
function render(host) {
  hostEl = host;
  const has = A.hasDoc(), kinds = new Set(A.adjustKinds());
  if (!built || !host.querySelector('.ap-root')) {
    built = true;
    host.innerHTML = '';
    const root = mk('div', { className: 'ap-root' });
    
    const pre = mk('div', { className: 'ap-sec ap-presets' });
    const preHead = mk('button', { type: 'button', className: 'ap-head', title: '调整预设' });
    preHead.append(mk('span', { className: 'ap-caret' }), mk('span', { textContent: '调整预设' }));
    preHead.onclick = () => { S.presetsOpen = !S.presetsOpen; save(); sync(); };
    const tabs = mk('div', { className: 'ap-tabs', role: 'tablist' });
    for (const g of PRESET_GROUPS) {
      const t = mk('button', { type: 'button', className: 'ap-tab', textContent: g.label, role: 'tab' });
      t.dataset.group = g.id; t.onclick = () => { S.group = g.id; save(); sync(); };
      tabs.append(t);
    }
    const grid = mk('div', { className: 'ap-preset-grid' });
    for (const g of PRESET_GROUPS) g.presets.forEach((p, i) => {
      const b = mk('button', { type: 'button', className: 'ap-preset', title: `${g.label} › ${p.name}（${p.layers.length} 个调整图层）\n悬停 = 在画布上预览，单击 = 应用\n${PRESET_NOTE}` });
      b.dataset.group = g.id; b.dataset.preset = g.id + ':' + i;
      const cv = mk('canvas', { className: 'ap-thumb', width: TW, height: TH }); cv.dataset.preset = g.id + ':' + i;
      b.append(cv, mk('span', { className: 'ap-pname', textContent: p.name }));
      b.addEventListener('pointerenter', () => { if (!b.disabled) showPreview(p); });
      b.addEventListener('pointerleave', hidePreview);
      b.onclick = async () => { hidePreview(); if (!b.disabled) await A.addPreset(p, { mask: S.addMask }); };
      grid.append(b);
    });
    const note = mk('div', { className: 'ap-note', textContent: '预设为本项目自行设计的参数（非 Adobe 原版参数）' });
    pre.append(preHead, mk('div', { className: 'ap-body' }, tabs, grid, note));
    
    const single = mk('div', { className: 'ap-sec ap-single' });
    const sHead = mk('button', { type: 'button', className: 'ap-head', title: '单一调整' });
    sHead.append(mk('span', { className: 'ap-caret' }), mk('span', { textContent: '单一调整' }));
    sHead.onclick = () => { S.singleOpen = !S.singleOpen; save(); sync(); };
    const sg = mk('div', { className: 'adj-grid ap-single-grid', id: 'adjGrid' });
    for (const [id, label] of SINGLE_ADJ) {
      const b = mk('button', { type: 'button' });
      b.dataset.kind = id;
      b.append(A.icon('adj-' + id, 18), mk('span', { className: 'adj-name', textContent: label }));
      b.addEventListener('click', ev => addSingle(id, label, ev));
      sg.append(b);
    }
    single.append(sHead, mk('div', { className: 'ap-body' }, sg));
    root.append(pre, single);
    host.append(root);
  }
  
  for (const b of host.querySelectorAll('.ap-single-grid button')) {
    const id = b.dataset.kind, label = (SINGLE_ADJ.find(x => x[0] === id) || [])[1];
    const ok = kinds.has(id) || (id === 'colorLookup' && A.actions.has('layer.adjust.colorLookup'));
    b.disabled = !has || !ok;
    b.title = !has ? `新建「${label}」调整图层（先打开一个文档）` : !ok ? `「${label}」调整图层：编辑模块还没就绪` : `新建「${label}」调整图层\n⌥ 单击：先打开「新建图层」对话框`;
  }
  for (const b of host.querySelectorAll('.ap-preset')) b.disabled = !has;
  sync();
  if (A.panels.isVisible('adjustments') && S.showPresets && S.presetsOpen) refreshThumbs(host).catch(() => {});
}
function sync() {
  const h = hostEl; if (!h) return;
  const pre = h.querySelector('.ap-presets'), single = h.querySelector('.ap-single');
  if (pre) { pre.hidden = !S.showPresets; pre.classList.toggle('closed', !S.presetsOpen); }
  if (single) single.classList.toggle('closed', !S.singleOpen);
  for (const t of h.querySelectorAll('.ap-tab')) { const on = t.dataset.group === S.group; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); }
  for (const b of h.querySelectorAll('.ap-preset')) b.hidden = b.dataset.group !== S.group;
  const grid = h.querySelector('.ap-single-grid');
  if (grid) { grid.classList.toggle('icon-view', S.view === 'icon'); grid.classList.toggle('list-view', S.view !== 'icon'); }
  if (S.showPresets && S.presetsOpen && A.panels.isVisible('adjustments')) refreshThumbs(h).catch(() => {});
}

function menuItems() {
  return [
    { label: '默认情况下添加蒙版', checked: S.addMask, run: () => { S.addMask = !S.addMask; save(); } },
    { label: '添加时剪切到图层', checked: S.clipOnAdd, run: () => { S.clipOnAdd = !S.clipOnAdd; save(); } },
    { sep: true },
    { label: '显示调整预设', checked: S.showPresets, run: () => { S.showPresets = !S.showPresets; save(); sync(); } },
    { sep: true },
    { label: '图标视图', checked: S.view === 'icon', run: () => { S.view = 'icon'; save(); sync(); } },
    { label: '列表视图', checked: S.view !== 'icon', run: () => { S.view = 'list'; save(); sync(); } },
  ];
}

const CSS = `
#panelAdjustments .ap-root { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
#panelAdjustments .ap-sec { border-bottom: 1px solid var(--ps-line, #333); }
#panelAdjustments .ap-sec[hidden] { display: none; }
#panelAdjustments .ap-head { display: flex; align-items: center; gap: 6px; width: 100%; height: 26px; padding: 0 10px; border: none; background: transparent; color: #ddd; font-size: 11px; font-weight: 600; justify-content: flex-start; }
#panelAdjustments .ap-caret { width: 0; height: 0; border: 4px solid transparent; border-top-color: #c6c6c6; margin-top: 4px; }
#panelAdjustments .ap-sec.closed .ap-caret { border-top-color: transparent; border-left-color: #c6c6c6; margin: 0 0 0 3px; }
#panelAdjustments .ap-sec.closed .ap-body { display: none; }
#panelAdjustments .ap-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 0 8px 6px; }
#panelAdjustments .ap-tab { height: 20px; padding: 0 7px; font-size: 11px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--ps-muted, #aaa); }
#panelAdjustments .ap-tab.on { background: var(--ps-active, #4a4a4a); color: #fff; }
#panelAdjustments .ap-preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; padding: 0 8px 6px; }
#panelAdjustments .ap-preset { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 3px; height: auto; border: 1px solid transparent; border-radius: 3px; background: transparent; }
#panelAdjustments .ap-preset[hidden] { display: none; }
#panelAdjustments .ap-preset:hover:not(:disabled) { border-color: #6a6a6a; background: var(--ps-hover, #3a3a3a); }
#panelAdjustments .ap-preset:disabled { opacity: .5; }
#panelAdjustments .ap-thumb { width: 100%; aspect-ratio: 3 / 2; height: auto; border-radius: 2px; display: block; background: #222; }
#panelAdjustments .ap-pname { font-size: 10.5px; color: #ccc; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#panelAdjustments .ap-note { padding: 0 10px 6px; font-size: 10px; color: var(--ps-muted, #8a8a8a); }
#panelAdjustments .ap-single-grid.icon-view { grid-template-columns: repeat(auto-fill, 30px); gap: 2px; padding: 4px 8px 8px; }
#panelAdjustments .ap-single-grid.icon-view button { width: 30px; height: 30px; padding: 0; justify-content: center; }
#panelAdjustments .ap-single-grid.icon-view .adj-name { display: none; }
#adjHoverPreview { position: absolute; pointer-events: none; }
`;

export function installAdjustmentsPanel(api) {
  A = api;
  if (!document.getElementById('ap-style')) document.head.append(mk('style', { id: 'ap-style', textContent: CSS }));
  A.panels.setPanelMenu('adjustments', menuItems);
  A.psPanels.setAdjustmentsRenderer(render);
  A.panels.onChange(() => { if (hostEl) sync(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') hidePreview(); });
  return { render, menuItems, state: S, presets: PRESET_GROUPS, showPreview, hidePreview, refreshThumbs: () => hostEl && refreshThumbs(hostEl, true) };
}
