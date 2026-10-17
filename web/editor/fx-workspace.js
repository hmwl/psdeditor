
















export const mk = (tag, props = {}, css = '') => { const e = Object.assign(document.createElement(tag), props); if (css) e.style.cssText = css; return e; };

export function createWorkspace({ title, tools = [], width, height, onKey, rightWidth = 260, hand = true, zoom = true }) {
  let resolveFn; const done = new Promise(r => { resolveFn = r; });
  const dlg = mk('dialog', { className: 'fp-dlg fxw-dlg' }, 'width:96vw;height:92vh;max-width:none;max-height:none;padding:0;display:flex;flex-direction:column;overflow:hidden');
  const head = mk('div', { textContent: title }, 'padding:7px 12px;font-weight:600;border-bottom:1px solid rgba(128,128,128,.25);display:flex;align-items:center;gap:8px');
  const bar = mk('div', { className: 'fxw-bar' }, 'min-height:34px;padding:4px 10px;border-bottom:1px solid rgba(128,128,128,.25);display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px');
  const body = mk('div', {}, 'flex:1;display:flex;min-height:0');
  const left = mk('div', {}, 'width:44px;display:flex;flex-direction:column;gap:2px;padding:6px 4px;border-right:1px solid rgba(128,128,128,.25)');
  const mid = mk('div', {}, 'flex:1;position:relative;overflow:hidden;background:#262626');
  const right = mk('div', {}, `width:${rightWidth}px;padding:10px 12px;overflow:auto;border-left:1px solid rgba(128,128,128,.25);display:flex;flex-direction:column;gap:7px;font-size:12px`);
  const status = mk('div', {}, 'position:absolute;left:8px;bottom:6px;font-size:11px;color:#ddd;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:3px;pointer-events:none');
  body.append(left, mid, right); dlg.append(head, bar, body);
  const view = mk('canvas', {}, 'position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none');
  mid.append(view, status);
  const allTools = [...tools];
  if (zoom && !allTools.some(t => t.id === 'zoom')) allTools.push({ id: 'zoom', label: '缩放工具', key: 'Z', glyph: '🔍' });
  if (hand && !allTools.some(t => t.id === 'hand')) allTools.push({ id: 'hand', label: '抓手工具', key: 'H', glyph: '✋' });
  if (!allTools.length) left.style.display = 'none';

  const ws = {
    dlg, head, bar, left, mid, right, view, status, done, tool: allTools[0] && allTools[0].id,
    scale: 1, tx: 0, ty: 0, dpr: window.devicePixelRatio || 1, width, height, space: false, redraw: null, onTool: null,
    toImg(ev) { const r = mid.getBoundingClientRect(); return { x: (ev.clientX - r.left - ws.tx) / ws.scale, y: (ev.clientY - r.top - ws.ty) / ws.scale }; },
    toScreen(x, y) { return { x: ws.tx + x * ws.scale, y: ws.ty + y * ws.scale }; },
    fit() {
      const r = mid.getBoundingClientRect();
      view.width = Math.max(1, Math.round(r.width * ws.dpr)); view.height = Math.max(1, Math.round(r.height * ws.dpr));
      ws.scale = Math.min(r.width / ws.width, r.height / ws.height) * 0.94;
      ws.tx = (r.width - ws.width * ws.scale) / 2; ws.ty = (r.height - ws.height * ws.scale) / 2;
      ws.draw();
    },
    zoomAt(k, mx, my) {
      const r = mid.getBoundingClientRect(); if (mx == null) { mx = r.width / 2; my = r.height / 2; }
      const ns = Math.max(0.03, Math.min(32, ws.scale * k));
      ws.tx = mx - (mx - ws.tx) * ns / ws.scale; ws.ty = my - (my - ws.ty) * ns / ws.scale; ws.scale = ns; ws.draw();
    },
    draw() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; paint(); });
    },
    drawNow() { if (raf) { cancelAnimationFrame(raf); raf = 0; } paint(); },
    setTool(id) {
      if (!allTools.some(t => t.id === id)) return;
      ws.tool = id; for (const k in toolBtns) toolBtns[k].classList.toggle('primary', k === id);
      mid.style.cursor = id === 'hand' ? 'grab' : id === 'zoom' ? 'zoom-in' : 'crosshair';
      if (ws.onTool) ws.onTool(id);
      ws.draw();
    },
    finish(v) { if (closed) return; closed = true; ro.disconnect(); try { dlg.close(); } catch {} dlg.remove(); resolveFn(v); },
    setStatus(t) { status.textContent = t || ''; status.style.display = t ? '' : 'none'; },
  };
  let raf = 0, closed = false;
  function paint() {
    const c = view.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, view.width, view.height);
    c.setTransform(ws.dpr, 0, 0, ws.dpr, 0, 0);
    if (ws.redraw) ws.redraw(c, ws);
  }
  const toolBtns = {};
  for (const t of allTools) {
    const b = mk('button', { type: 'button', textContent: t.glyph || t.label[0], title: `${t.label}（${t.key}）` }, 'width:34px;height:30px;font-size:14px;padding:0');
    b.onclick = () => ws.setTool(t.id); toolBtns[t.id] = b; left.append(b);
  }
  ws.toolBtns = toolBtns;
  const keyMap = Object.fromEntries(allTools.filter(t => t.key).map(t => [t.key.toLowerCase(), t.id]));

  
  let pan = null;
  view.addEventListener('pointerdown', ev => {
    view.setPointerCapture(ev.pointerId);
    if (ws.tool === 'hand' || ws.space || ev.button === 1) { pan = { x: ev.clientX, y: ev.clientY }; mid.style.cursor = 'grabbing'; return; }
    if (ws.tool === 'zoom') { const r = mid.getBoundingClientRect(); ws.zoomAt(ev.altKey ? 1 / 1.6 : 1.6, ev.clientX - r.left, ev.clientY - r.top); return; }
    if (ws.onDown) ws.onDown(ev, ws.toImg(ev));
  });
  view.addEventListener('pointermove', ev => {
    if (pan) { ws.tx += ev.clientX - pan.x; ws.ty += ev.clientY - pan.y; pan.x = ev.clientX; pan.y = ev.clientY; ws.draw(); return; }
    if (ws.onMove) ws.onMove(ev, ws.toImg(ev));
  });
  const up = ev => {
    if (pan) { pan = null; mid.style.cursor = ws.tool === 'hand' ? 'grab' : ws.tool === 'zoom' ? 'zoom-in' : 'crosshair'; return; }
    if (ws.onUp) ws.onUp(ev, ws.toImg(ev));
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('dblclick', ev => { if (ws.onDbl) ws.onDbl(ev, ws.toImg(ev)); });
  view.addEventListener('contextmenu', ev => { if (ws.onContext) { ev.preventDefault(); ws.onContext(ev, ws.toImg(ev)); } });
  view.addEventListener('pointerleave', ev => { if (ws.onLeave) ws.onLeave(ev); });
  mid.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = mid.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey || ev.altKey) ws.zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    else { ws.tx -= ev.deltaX; ws.ty -= ev.deltaY; ws.draw(); }
  }, { passive: false });

  function key(ev) {
    const inField = ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
    if (inField && ev.key !== 'Escape' && ev.key !== 'Enter') return;
    if (ev.key === ' ' && !inField) { ws.space = ev.type === 'keydown'; mid.style.cursor = ws.space ? 'grab' : (ws.tool === 'hand' ? 'grab' : 'crosshair'); ev.preventDefault(); return; }
    if (onKey && onKey(ev) === true) { ev.preventDefault(); ev.stopPropagation(); return; }
    if (ev.type !== 'keydown') return;
    const k = ev.key.toLowerCase(), mod = ev.metaKey || ev.ctrlKey;
    if (mod && (k === '=' || k === '+')) { ev.preventDefault(); ws.zoomAt(1.25); return; }
    if (mod && k === '-') { ev.preventDefault(); ws.zoomAt(0.8); return; }
    if (mod && k === '0') { ev.preventDefault(); ws.fit(); return; }
    if (mod && k === '1') { ev.preventDefault(); const r = mid.getBoundingClientRect(); ws.zoomAt(1 / ws.scale, r.width / 2, r.height / 2); return; }
    if (mod) return;
    if (ev.key === 'Enter') { ev.preventDefault(); if (ws.onEnter) ws.onEnter(); return; }
    if (!inField && keyMap[k]) { ws.setTool(keyMap[k]); ev.preventDefault(); }
  }
  dlg.addEventListener('keydown', key); dlg.addEventListener('keyup', key);
  dlg.addEventListener('cancel', ev => { ev.preventDefault(); if (ws.onCancel) ws.onCancel(); else ws.finish(null); });
  const ro = new ResizeObserver(() => ws.fit());
  ws.open = () => {
    document.body.append(dlg);
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    ro.observe(mid);
    if (ws.tool) ws.setTool(ws.tool);
    dlg.tabIndex = -1; dlg.focus();
    ws.setStatus('');
  };
  return ws;
}



export function section(parent, text) { const s = mk('div', { textContent: text }, 'font-weight:600;margin-top:6px;opacity:.9'); parent.append(s); return s; }
export function slider(parent, label, v, min, max, step, onChange, o = {}) {
  const row = mk('label', {}, `display:flex;align-items:center;gap:6px;${o.inline ? '' : 'width:100%'}`);
  row.append(mk('span', { textContent: label }, `min-width:${o.labelW || 62}px;white-space:nowrap`));
  const r = mk('input', { type: 'range', min, max, step: step || 1, value: v }, `flex:1;min-width:${o.inline ? 80 : 0}px`);
  const n = mk('input', { type: 'number', min, max, step: step || 1, value: v }, 'width:58px');
  const unit = o.unit ? mk('span', { textContent: o.unit }, 'opacity:.7') : null;
  const set = x => { r.value = n.value = x; };
  r.oninput = () => { n.value = r.value; onChange && onChange(+r.value, false); };
  r.onchange = () => { onChange && onChange(+r.value, true); };
  n.onchange = () => { const x = Math.max(min, Math.min(max, +n.value || 0)); set(x); onChange && onChange(x, true); };
  row.append(r, n); if (unit) row.append(unit);
  parent.append(row);
  return { el: row, get: () => +n.value, set };
}
export function select(parent, label, v, options, onChange, o = {}) {
  const row = mk('label', {}, 'display:flex;align-items:center;gap:6px');
  if (label) row.append(mk('span', { textContent: label }, `min-width:${o.labelW || 62}px;white-space:nowrap`));
  const s = mk('select', {}, o.css || 'flex:1;min-width:0');
  for (const [k, t] of options) s.append(mk('option', { value: k, textContent: t }));
  s.value = v; s.onchange = () => onChange && onChange(s.value);
  row.append(s); parent.append(row);
  return { el: row, sel: s, get: () => s.value, set: x => { s.value = x; } };
}
export function check(parent, label, v, onChange) {
  const l = mk('label', {}, 'display:flex;gap:6px;align-items:center;white-space:nowrap');
  const c = mk('input', { type: 'checkbox', checked: !!v }); c.onchange = () => onChange && onChange(c.checked);
  l.append(c, label); parent.append(l);
  return { el: l, get: () => c.checked, set: x => { c.checked = !!x; } };
}
export function color(parent, label, v, onChange) {
  const l = mk('label', {}, 'display:flex;gap:6px;align-items:center');
  l.append(mk('span', { textContent: label }, 'min-width:62px'));
  const c = mk('input', { type: 'color', value: v }, 'width:44px;height:22px;padding:0;border:none;background:none');
  c.oninput = () => onChange && onChange(c.value, false); c.onchange = () => onChange && onChange(c.value, true);
  l.append(c); parent.append(l);
  return { el: l, get: () => c.value, set: x => { c.value = x; } };
}
export function button(parent, text, fn, o = {}) { const b = mk('button', { type: 'button', textContent: text, title: o.title || '' }); if (o.primary) b.className = 'primary'; b.onclick = fn; parent.append(b); return b; }
export function row(parent, css = '') { const r = mk('div', {}, 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;' + css); parent.append(r); return r; }
export function okCancel(ws, onOk, onCancel) {
  ws.right.append(mk('div', {}, 'flex:1'));
  const r = row(ws.right, 'justify-content:flex-end');
  button(r, '取消', () => (onCancel ? onCancel() : ws.finish(null)));
  const ok = button(r, '确定', onOk, { primary: true });
  ws.onEnter = onOk;
  return ok;
}
export const hexToRgb = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

export function rgbaCanvas(rgba, w, h) {
  const c = mk('canvas', { width: w, height: h });
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer ? rgba : rgba), w, h), 0, 0);
  return c;
}
export function drawChecker(ctx, x, y, w, h) {
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = '#ccc';
  const s = 8; for (let yy = 0; yy < h / s + 1; yy++) for (let xx = (yy & 1); xx < w / s + 1; xx += 2) ctx.fillRect(x + xx * s, y + yy * s, s, s);
  ctx.restore();
}
