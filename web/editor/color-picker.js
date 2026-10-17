
import { colorPanel, rgbHex, noteRecentColor } from './color-panel.js';
import { uiIcon } from './icons.js';
import { addPresets } from './preset-store.js';
import { colorSafety } from './color-safety.js';
import { rgbSwatch } from '../../core/swatches.js';

const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fromHex = s => /^[0-9a-f]{6}$/i.test(s.replace('#', '')) ? [0, 2, 4].map(i => parseInt(s.replace('#', '').slice(i, i + 2), 16)) : null;
function hsv(rgb) {
  const [r, g, b] = rgb.map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = !d ? 0 : max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, max ? d / max * 100 : 0, max * 100];
}
function rgb([h, s, v]) {
  h = (h % 360 + 360) % 360 / 60; s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
  return (h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]).map(n => Math.round((n + m) * 255));
}
const CHANNELS = { H: [0, 360, '°'], S: [0, 100, '%'], B: [0, 100, '%'], R: [0, 255, ''], G: [0, 255, ''], blue: [0, 255, ''], L: [0, 100, ''], a: [-128, 127, ''], b: [-128, 127, ''], C: [0, 100, '%'], M: [0, 100, '%'], Y: [0, 100, '%'], K: [0, 100, '%'] };
let active = null;
export function openColorPicker({ value = '#000000', title = '拾色器' } = {}) {
  if (active) return Promise.resolve(null);
  const original = fromHex(value) || [0, 0, 0];
  let current = original.slice(), hsb = hsv(current), axis = 'H', webOnly = false;
  const opener = document.activeElement;
  const d = mk('dialog', { className: 'ps-color-picker' });
  d.setAttribute('aria-labelledby', 'psColorPickerTitle');
  const head = mk('header', { id: 'psColorPickerTitle', textContent: title });
  let moving = null;
  head.onpointerdown = e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = d.getBoundingClientRect();
    moving = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    Object.assign(d.style, { position: 'fixed', margin: '0', left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto' });
    head.setPointerCapture(e.pointerId);
  };
  head.onpointermove = e => {
    if (!moving) return;
    const r = d.getBoundingClientRect();
    d.style.left = clamp(moving.left + e.clientX - moving.x, 0, Math.max(0, innerWidth - r.width)) + 'px';
    d.style.top = clamp(moving.top + e.clientY - moving.y, 0, Math.max(0, innerHeight - r.height)) + 'px';
  };
  const stopMoving = e => { moving = null; if (head.hasPointerCapture(e.pointerId)) head.releasePointerCapture(e.pointerId); };
  head.onpointerup = head.onpointercancel = head.onlostpointercapture = stopMoving;

  const body = mk('div', { className: 'pcp-body' });
  const area = mk('div', { className: 'pcp-area' });
  const field = mk('canvas', { width: 256, height: 256, className: 'pcp-field', tabIndex: 0 });
  field.setAttribute('aria-label', '颜色选择区域（方向键微调）');
  const barWrap = mk('div', { className: 'pcp-bar-wrap' });
  const bar = mk('canvas', { width: 20, height: 256, className: 'pcp-bar', tabIndex: 0 });
  bar.setAttribute('aria-label', '颜色分量（方向键微调）');
  const pointer = uiIcon('color-slider-pointer', 9); pointer.classList.add('pcp-pointer');
  barWrap.append(bar, pointer);
  const only = mk('label', { className: 'pcp-web' }), checkbox = mk('input', { type: 'checkbox' });
  only.append(checkbox, document.createTextNode('只有 Web 颜色'));
  area.append(field, only);
  const details = mk('div', { className: 'pcp-details' });
  const preview = mk('div', { className: 'pcp-preview' });
  const next = mk('div', { className: 'pcp-new' }), old = mk('button', { type: 'button', className: 'pcp-old', title: '恢复当前颜色' });
  old.style.background = rgbHex(original);
  const safety = colorSafety(() => current, c => update(c));
  preview.append(mk('span', { textContent: '新的' }), next, old, mk('span', { textContent: '当前' }), safety.root);
  const commands = mk('div', { className: 'pcp-commands' });
  const button = label => mk('button', { type: 'button', textContent: label });
  const ok = button('确定'), cancel = button('取消'), add = button('添加到色板'), library = button('颜色库');
  commands.append(ok, cancel, add, library);
  const left = mk('div', { className: 'pcp-values' }), right = mk('div', { className: 'pcp-values' });
  const inputs = {};
  for (const [key, [min, max, unit]] of Object.entries(CHANNELS)) {
    const row = mk('label', { className: 'pcp-value' });
    if (['H', 'S', 'B', 'R', 'G', 'blue', 'L', 'a', 'b'].includes(key)) {
      const radio = mk('input', { type: 'radio', name: 'pcp-axis', value: key, checked: key === axis });
      radio.setAttribute('aria-label', '按 ' + (key === 'blue' ? '蓝色' : key) + ' 选择');
      radio.onchange = () => { axis = key; draw(); }; row.append(radio);
    } else row.append(mk('span'));
    const input = mk('input', { type: 'number', min, max, step: 1 });
    input.dataset.channel = key; input.setAttribute('aria-label', key === 'blue' ? '蓝色 B' : key);
    row.append(mk('span', { textContent: (key === 'blue' ? 'B' : key) + ':' }), input, mk('span', { textContent: unit }));
    inputs[key] = input;
    input.oninput = () => {
      if (!Number.isFinite(input.valueAsNumber)) return;
      const v = clamp(input.valueAsNumber, min, max);
      if (['H', 'S', 'B'].includes(key)) { hsb[['H', 'S', 'B'].indexOf(key)] = v; update(rgb(hsb), true); }
      else if (['R', 'G', 'blue'].includes(key)) { const c = current.slice(); c[['R', 'G', 'blue'].indexOf(key)] = v; update(c); }
      else if (['L', 'a', 'b'].includes(key)) { const c = colorPanel._conv.rgb2lab(current); c[['L', 'a', 'b'].indexOf(key)] = v; update(colorPanel._conv.lab2rgb(c)); }
      else { const c = colorPanel._conv.rgb2cmyk(current); c[['C', 'M', 'Y', 'K'].indexOf(key)] = v; update(colorPanel._conv.cmyk2rgb(c)); }
    };
    input.onblur = () => sync();
    (['H', 'S', 'B', 'R', 'G', 'blue'].includes(key) ? left : right).append(row);
  }
  const hexRow = mk('label', { className: 'pcp-hex-row' }), hex = mk('input', { type: 'text', maxLength: 7, spellcheck: false });
  hex.setAttribute('aria-label', '十六进制颜色'); hexRow.append(document.createTextNode('#'), hex); left.append(hexRow);
  hex.oninput = () => { const c = fromHex(hex.value); if (c) update(c); };
  hex.onblur = () => sync();
  const message = mk('div', { className: 'pcp-message' }); message.setAttribute('role', 'status');
  details.append(preview, commands, left, right);
  body.append(area, barWrap, details); d.append(head, body, message); document.body.append(d);
  const selected = () => axis === 'H' ? hsb[0] / 360 : axis === 'S' ? hsb[1] / 100 : axis === 'B' ? hsb[2] / 100 : ['R', 'G', 'blue'].includes(axis) ? current[['R', 'G', 'blue'].indexOf(axis)] / 255 : (colorPanel._conv.rgb2lab(current)[['L', 'a', 'b'].indexOf(axis)] - CHANNELS[axis][0]) / (CHANNELS[axis][1] - CHANNELS[axis][0]);
  function sample(x, y, z) {
    if (axis === 'H') return rgb([z * 360, x * 100, (1 - y) * 100]);
    if (axis === 'S') return rgb([x * 360, z * 100, (1 - y) * 100]);
    if (axis === 'B') return rgb([x * 360, (1 - y) * 100, z * 100]);
    const keys = ['R', 'G', 'blue'].includes(axis) ? ['R', 'G', 'blue'] : ['L', 'a', 'b'];
    const others = keys.filter(k => k !== axis), values = { [axis]: z, [others[0]]: x, [others[1]]: 1 - y };
    const c = keys.map(k => CHANNELS[k][0] + values[k] * (CHANNELS[k][1] - CHANNELS[k][0]));
    return keys[0] === 'R' ? c : colorPanel._conv.lab2rgb(c);
  }
  function position() {
    if (axis === 'H') return [hsb[1] / 100, 1 - hsb[2] / 100];
    if (axis === 'S') return [hsb[0] / 360, 1 - hsb[2] / 100];
    if (axis === 'B') return [hsb[0] / 360, 1 - hsb[1] / 100];
    const keys = ['R', 'G', 'blue'].includes(axis) ? ['R', 'G', 'blue'] : ['L', 'a', 'b'];
    const c = keys[0] === 'R' ? current : colorPanel._conv.rgb2lab(current);
    const values = keys.filter(k => k !== axis).map(k => (c[keys.indexOf(k)] - CHANNELS[k][0]) / (CHANNELS[k][1] - CHANNELS[k][0]));
    return [values[0], 1 - values[1]];
  }
  function draw() {
    const z = selected(), [px, py] = position(), fc = field.getContext('2d'), bc = bar.getContext('2d');
    const im = fc.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const c = sample(x / 255, y / 255, z), i = (y * 256 + x) * 4;
      im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255;
    }
    fc.putImageData(im, 0, 0);
    fc.beginPath(); fc.arc(clamp(px, 0, 1) * 255, clamp(py, 0, 1) * 255, 4, 0, Math.PI * 2); fc.strokeStyle = '#000'; fc.lineWidth = 2; fc.stroke(); fc.strokeStyle = '#fff'; fc.lineWidth = 1; fc.stroke();
    for (let y = 0; y < 256; y++) {
      const c = axis === 'H' ? rgb([(1 - y / 255) * 360, 100, 100]) : sample(px, py, 1 - y / 255);
      bc.fillStyle = rgbHex(c); bc.fillRect(0, y, 20, 1);
    }
    pointer.style.top = (1 - z) * 256 + 'px';
  }
  function sync() {
    next.style.background = rgbHex(current); safety.render();
    const lab = colorPanel._conv.rgb2lab(current), cmyk = colorPanel._conv.rgb2cmyk(current);
    const values = [...hsb, ...current, ...lab, ...cmyk];
    Object.keys(CHANNELS).forEach((k, i) => { if (document.activeElement !== inputs[k]) inputs[k].value = Math.round(values[i]); });
    if (document.activeElement !== hex) hex.value = rgbHex(current).slice(1);
  }
  function update(c, keepHSB = false) {
    current = c.map(v => clamp(Math.round(v), 0, 255));
    if (webOnly) { current = current.map(v => Math.round(v / 51) * 51); keepHSB = false; }
    if (!keepHSB) { const nextHSB = hsv(current); if (nextHSB[1] === 0 || nextHSB[2] === 0) nextHSB[0] = hsb[0]; hsb = nextHSB; }
    sync(); draw();
  }
  function drag(canvas, isBar) {
    const choose = e => {
      const r = canvas.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
      const [px, py] = position();
      if (isBar && axis === 'H') { hsb[0] = (1 - y) * 360; update(rgb(hsb), true); }
      else update(isBar ? sample(px, py, 1 - y) : sample(x, y, selected()));
    };
    canvas.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); canvas.focus(); canvas.setPointerCapture(e.pointerId); choose(e); };
    canvas.onpointermove = e => { if (canvas.hasPointerCapture(e.pointerId)) choose(e); };
    canvas.onkeydown = e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); const delta = (e.shiftKey ? 10 : 1) / 255, [x, y] = position();
      if (isBar) { const z = clamp(selected() + (e.key === 'ArrowUp' || e.key === 'ArrowRight' ? delta : -delta), 0, 1); if (axis === 'H') { hsb[0] = z * 360; update(rgb(hsb), true); } else update(sample(x, y, z)); }
      else update(sample(clamp(x + (e.key === 'ArrowRight' ? delta : e.key === 'ArrowLeft' ? -delta : 0), 0, 1), clamp(y + (e.key === 'ArrowDown' ? delta : e.key === 'ArrowUp' ? -delta : 0), 0, 1), selected()));
    };
  }
  drag(field, false); drag(bar, true);
  checkbox.onchange = () => { webOnly = checkbox.checked; update(current); };
  old.onclick = () => update(original);
  add.onclick = async () => {
    add.disabled = true;
    try { await addPresets('swatches', [rgbSwatch(current, rgbHex(current))], { groupName: '自定义色板' }); message.textContent = '已添加到色板'; }
    catch { message.textContent = '色板保存失败，请重试'; } finally { add.disabled = false; }
  };
  let bookView = null;
  library.onclick = async () => {
    library.disabled = true;
    try {
      const { showColorBooks } = await import('./color-book-picker.js');
      if (!d.isConnected) return;
      body.hidden = true; message.hidden = true; head.textContent = '颜色库'; d.classList.add('pcp-book-mode');
      if (d.style.left) d.style.left = clamp(parseFloat(d.style.left), 0, Math.max(0, innerWidth - d.offsetWidth)) + 'px';
      bookView = showColorBooks({ dialog: d, original, current,
        onPicker: c => { bookView = null; body.hidden = false; message.hidden = false; head.textContent = title; d.classList.remove('pcp-book-mode'); update(c); hex.focus(); },
        onConfirm: c => { update(c); ok.click(); }, onCancel: () => cancel.click() });
    } catch (e) { message.textContent = e.message || '颜色库读取失败'; }
    finally { library.disabled = false; }
  };
  return new Promise(resolve => {
    const finish = value => { if (active !== d) return; active = null; d.close(); d.remove(); if (opener?.isConnected) opener.focus(); if (value) noteRecentColor(current); resolve(value); };
    active = d; ok.onclick = () => finish(rgbHex(current)); cancel.onclick = () => finish(null);
    d.oncancel = e => { e.preventDefault(); finish(null); };
    d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ok.click(); } });
    sync(); draw(); d.showModal(); hex.focus(); hex.select();
    colorPanel.reloadProfiles().then(() => { if (active === d) { sync(); draw(); bookView?.refresh(); } }).catch(() => {});
  });
}

const TITLES = { txColor: '文字颜色', ndBgColor: '背景色', abBgColor: '画板背景色', shpFill: '填充颜色', penFill: '填充颜色', shpStroke: '描边颜色', sbColor: '叠加颜色', twGuideColor: '参考线颜色' };
function inputTitle(input) {
  const label = input.dataset.pickerTitle || TITLES[input.id] || input.title || input.labels?.[0]?.textContent?.trim() || input.closest('.row,.arow,.fxrow')?.querySelector('label')?.textContent?.trim();
  return label ? `拾色器（${label.replace(/[:：]\s*#?[0-9a-f]{6}$/i, '').replace(/[：:]$/, '')}）` : '拾色器';
}

document.addEventListener('click', e => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'color' || input.disabled) return;
  e.preventDefault(); e.stopImmediatePropagation();
  openColorPicker({ value: input.value, title: inputTitle(input) }).then(value => {
    if (value == null) { input.dispatchEvent(new Event('cancel')); return; }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, true);

const style = mk('style', { textContent: `
.ps-color-picker { box-sizing:border-box; width:520px; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); padding:0; border:1px solid #777; border-radius:13px; color:#ddd; background:#323232; font:12px system-ui,sans-serif; overflow:auto; }
.ps-color-picker::backdrop { background:rgba(0,0,0,.15); }
.ps-color-picker header { height:28px; display:flex; align-items:center; justify-content:center; background:#ccc9c7; color:#333; font-weight:600; cursor:move; user-select:none; touch-action:none; }
.pcp-body { display:grid; grid-template-columns:256px 20px 1fr; gap:12px; padding:12px 10px 8px; }
.pcp-area,.pcp-bar-wrap { margin-top:18px; }
.pcp-field { display:block; width:256px; height:256px; cursor:crosshair; }
.pcp-bar-wrap { position:relative; height:256px; }
.pcp-bar { display:block; width:20px; height:256px; cursor:ns-resize; }
.pcp-pointer { position:absolute; left:-8px; transform:translateY(-50%) rotate(90deg); pointer-events:none; }
.pcp-web { display:flex; align-items:center; gap:6px; margin-top:12px; white-space:nowrap; }
.pcp-details { display:grid; grid-template-columns:96px 92px; gap:12px 6px; align-content:start; }
.pcp-preview { position:relative; display:flex; flex-direction:column; align-items:flex-start; padding-top:22px; }
.pcp-preview span { width:60px; text-align:center; }
.pcp-new,.ps-color-picker .pcp-old { width:60px; height:34px; min-height:0; border:1px solid #111; padding:0; border-radius:0; }
.pcp-new { border-bottom:0; }
.ps-color-picker .pcp-old { border-top:0; }
.pcp-commands { display:flex; flex-direction:column; gap:8px; }
.ps-color-picker button { font:inherit; color:#eee; background:transparent; border:1px solid #888; border-radius:15px; min-height:26px; cursor:pointer; padding:3px 7px; }
.pcp-commands button:first-child { border-color:#eee; }
.pcp-commands button:nth-child(3) { margin-top:8px; }
.pcp-values { display:flex; flex-direction:column; gap:3px; }
.pcp-value { display:grid; grid-template-columns:13px 18px 35px 10px; align-items:center; gap:3px; height:21px; }
.pcp-value input[type=radio] { width:12px; height:12px; margin:0; accent-color:#ddd; }
.ps-color-picker input[type=number],.ps-color-picker input[type=text] { box-sizing:border-box; width:100%; min-width:0; height:20px; padding:0 3px; background:#292929; border:1px solid #484848; color:#eee; border-radius:0; font:12px system-ui,sans-serif; appearance:textfield; }
.pcp-value input::-webkit-inner-spin-button { appearance:none; }
.pcp-hex-row { display:flex; gap:6px; align-items:center; margin-top:4px; }
.pcp-hex-row input { max-width:76px; }
.pcp-message { padding:0 10px; min-height:8px; }
.pcp-message:not(:empty) { padding-bottom:8px; }
.pcp-body[hidden], .pcp-message[hidden] { display:none; }
.color-safety { display:flex; flex-direction:column; gap:5px; }
.ps-color-picker .color-safety button { display:flex; flex-direction:column; align-items:center; gap:2px; min-height:0; width:14px; border:0; padding:0; border-radius:0; }
.ps-color-picker .color-safety button[hidden] { display:none; }
.color-safety i { display:block; width:10px; height:10px; border:1px solid #ddd; }
.pcp-preview > .color-safety { position:absolute; left:65px; top:37px; }
.ps-color-picker.pcp-book-mode { width:602px; }
.pcb { display:grid; grid-template-columns:minmax(200px,296px) 24px 108px 84px; grid-template-rows:24px 254px; gap:10px 20px; padding:10px; }
.pcb-select { grid-column:1/4; display:flex; align-items:center; gap:5px; }
.pcb-select select { min-width:170px; color:#ddd; background:#323232; font:inherit; }
.pcb-list { grid-column:1; grid-row:2; height:254px; display:grid; grid-template-rows:repeat(var(--book-page-size,6),minmax(0,1fr)); outline:none; }
.ps-color-picker .pcb-color { display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; box-sizing:border-box; height:100%; gap:1px; width:100%; min-height:0; padding:1px 0; border:2px solid transparent; border-radius:0; text-align:left; overflow:hidden; }
.ps-color-picker .pcb-color[aria-selected=true] { border-color:#2997ff; }
.pcb-color i { display:block; width:100%; flex:1; min-height:0; }
.pcb-color span { font-size:10px; line-height:12px; white-space:nowrap; padding-left:2px; }
.pcb-nav { grid-column:2; grid-row:2; position:relative; display:flex; flex-direction:column; align-items:center; border:1px solid #777; }
.ps-color-picker .pcb-nav button { height:11px; min-height:11px; line-height:9px; padding:0; width:20px; border:0; border-radius:0; }
.pcb-nav canvas { width:20px; height:232px; cursor:ns-resize; }
.pcb-marker { position:absolute; height:0; left:-8px; right:-8px; pointer-events:none; }
.pcb-marker::before,.pcb-marker::after { content:''; position:absolute; top:-3px; border-top:3px solid transparent; border-bottom:3px solid transparent; }
.pcb-marker::before { left:0; border-left:5px solid #ddd; } .pcb-marker::after { right:0; border-right:5px solid #ddd; }
.pcb-detail { grid-column:3; grid-row:2; }
.pcb-preview { position:relative; width:60px; margin-bottom:14px; border:1px solid #222; }
.pcb-preview > div:not(.color-safety) { height:34px; }
.pcb-preview .color-safety { position:absolute; left:67px; top:4px; }
.pcb-values { display:grid; gap:4px; margin-bottom:42px; }
.pcb-detail p { margin:6px 0; font-size:11px; }
.pcb-status { color:#ddd; }
.pcb-commands { grid-column:4; grid-row:1/3; display:flex; flex-direction:column; gap:8px; }
.pcb-commands button:last-child { margin-top:36px; }
@media(max-width:610px) { .pcb { grid-template-columns:minmax(140px,1fr) 24px 90px; gap:10px; } .pcb-select { grid-column:1/4; } .pcb-commands { grid-column:1/4; grid-row:3; flex-direction:row; } .pcb-commands button:last-child { margin-top:0; } }

@media(max-width:540px) { .pcp-body { grid-template-columns:minmax(0,1fr) 20px; } .pcp-field { width:100%; } .pcp-details { grid-column:1/-1; justify-content:center; } }
` });
document.head.append(style);
