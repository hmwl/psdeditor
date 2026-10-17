











import { createField, cloneField, applyDab, renderLiquify, reconstructAll, isIdentity } from '../../core/liquify.js';

const TOOLS = [
  ['forward', '向前变形', 'W', '↗'], ['reconstruct', '重建', 'R', '⟲'], ['smooth', '平滑', 'E', '≈'],
  ['twirlCW', '顺时针旋转扭曲（按住 Alt 逆时针）', 'C', '↻'], ['pucker', '褶皱（按住 Alt = 膨胀）', 'S', '⊙'], ['bloat', '膨胀（按住 Alt = 褶皱）', 'B', '◎'],
  ['pushLeft', '左推（按住 Alt 右推）', 'O', '⇤'], ['freeze', '冻结蒙版', 'F', '▦'], ['thaw', '解冻蒙版', 'D', '▢'], ['hand', '抓手', 'H', '✋'],
];

export function openLiquify({ rgba, w, h, title, field = null, withField = false }) {
  return new Promise(resolve => {
    const src = new Uint8ClampedArray(rgba), out = new Uint8ClampedArray(rgba);
    let F = field && field.w === w && field.h === h ? cloneField(field) : createField(w, h);
    const undo = [], redo = [];
    const opt = { tool: 'forward', size: Math.max(20, Math.round(Math.min(w, h) / 8)), density: 50, pressure: 50, rate: 80, showMask: true, showImage: true };

    const mk = (tag, props = {}, css = '') => { const e = Object.assign(document.createElement(tag), props); if (css) e.style.cssText = css; return e; };
    const dlg = mk('dialog', { className: 'fp-dlg lq-dlg' }, 'width:94vw;height:90vh;max-width:none;max-height:none;padding:0;display:flex;flex-direction:column;overflow:hidden');
    const head = mk('div', { textContent: '液化 ' + (title ? '— ' + title : '') }, 'padding:8px 12px;font-weight:600;border-bottom:1px solid rgba(128,128,128,.25)');
    const body = mk('div', {}, 'flex:1;display:flex;min-height:0');
    const left = mk('div', {}, 'width:44px;display:flex;flex-direction:column;gap:2px;padding:6px 4px;border-right:1px solid rgba(128,128,128,.25)');
    const mid = mk('div', {}, 'flex:1;position:relative;overflow:hidden;background:#282828;cursor:none');
    const right = mk('div', {}, 'width:250px;padding:10px 12px;overflow:auto;border-left:1px solid rgba(128,128,128,.25);display:flex;flex-direction:column;gap:8px;font-size:12px');
    body.append(left, mid, right); dlg.append(head, body);
    const view = mk('canvas', {}, 'position:absolute;left:0;top:0;width:100%;height:100%');
    mid.append(view);
    const off = mk('canvas', { width: w, height: h }), octx = off.getContext('2d');
    const img = new ImageData(out, w, h); octx.putImageData(img, 0, 0);
    const maskCv = mk('canvas', { width: F.fw, height: F.fh }), mctx = maskCv.getContext('2d');

    
    const toolBtns = {};
    for (const [id, label, key, glyph] of TOOLS) {
      const b = mk('button', { type: 'button', textContent: glyph, title: `${label}（${key}）` }, 'width:34px;height:30px;font-size:15px;padding:0');
      b.onclick = () => setTool(id); toolBtns[id] = b; left.append(b);
    }
    function setTool(id){ opt.tool = id; for (const k in toolBtns) toolBtns[k].classList.toggle('primary', k === id); mid.style.cursor = id === 'hand' ? 'grab' : 'none'; drawView(); }

    
    const sec = t => right.append(mk('div', { textContent: t }, 'font-weight:600;margin-top:4px;opacity:.9'));
    const slider = (key, label, min, max) => {
      const row = mk('label', {}, 'display:flex;align-items:center;gap:6px');
      row.append(mk('span', { textContent: label }, 'width:52px'));
      const r = mk('input', { type: 'range', min, max, value: opt[key] }, 'flex:1;min-width:0');
      const n = mk('input', { type: 'number', min, max, value: opt[key] }, 'width:56px');
      r.oninput = () => { opt[key] = +r.value; n.value = r.value; drawView(); };
      n.onchange = () => { opt[key] = Math.max(min, Math.min(max, +n.value || min)); r.value = n.value = opt[key]; drawView(); };
      row.append(r, n); right.append(row);
      return v => { opt[key] = v; r.value = n.value = v; };
    };
    sec('画笔工具选项');
    const setSize = slider('size', '大小', 1, 1500);
    slider('density', '浓度', 0, 100);
    slider('pressure', '压力', 1, 100);
    slider('rate', '速率', 1, 100);
    sec('重建选项');
    const rowBtns = (...bs) => { const r = mk('div', {}, 'display:flex;gap:6px;flex-wrap:wrap'); r.append(...bs); right.append(r); };
    const btn = (t, fn, tip) => { const b = mk('button', { type: 'button', textContent: t, title: tip || '' }); b.onclick = fn; return b; };
    rowBtns(btn('重建…', () => { pushUndo(); reconstructAll(F, 0.5); full(); }, '把没冻结的地方往原样拉回一半'), btn('恢复全部', () => { pushUndo(); reconstructAll(F, 1); full(); }));
    sec('蒙版选项');
    rowBtns(btn('全部蒙住', () => { pushUndo(); F.freeze.fill(1); drawMask(); drawView(); }), btn('全部反相', () => { pushUndo(); for (let i = 0; i < F.freeze.length; i++) F.freeze[i] = 1 - F.freeze[i]; drawMask(); drawView(); }), btn('无', () => { pushUndo(); F.freeze.fill(0); drawMask(); drawView(); }));
    sec('视图选项');
    const chk = (key, label) => { const l = mk('label', {}, 'display:flex;gap:6px;align-items:center'); const c = mk('input', { type: 'checkbox', checked: opt[key] }); c.onchange = () => { opt[key] = c.checked; drawView(); }; l.append(c, label); right.append(l); };
    chk('showImage', '显示图像'); chk('showMask', '显示蒙版');
    right.append(mk('div', { className: 'anote plain', textContent: '[ / ] 调大小；⌘Z 撤销笔画；⌘/Ctrl + 滚轮缩放；空格拖动。' }, 'opacity:.7;margin-top:6px'));
    const spacer = mk('div', {}, 'flex:1'); right.append(spacer);
    const okRow = mk('div', {}, 'display:flex;gap:8px;justify-content:flex-end');
    const cancel = btn('取消', () => finish(null)), ok = btn('确定', () => finish(withField ? { rgba: new Uint8ClampedArray(out), field: cloneField(F), identity: isIdentity(F) } : (isIdentity(F) ? null : new Uint8ClampedArray(out))));
    ok.className = 'primary'; okRow.append(cancel, ok); right.append(okRow);

    
    let scale = 1, tx = 0, ty = 0, cursor = null, dpr = window.devicePixelRatio || 1;
    function fit(){
      const r = mid.getBoundingClientRect();
      view.width = Math.max(1, Math.round(r.width * dpr)); view.height = Math.max(1, Math.round(r.height * dpr));
      scale = Math.min(r.width / w, r.height / h) * 0.94; tx = (r.width - w * scale) / 2; ty = (r.height - h * scale) / 2;
      drawView();
    }
    const toSrc = ev => { const r = mid.getBoundingClientRect(); return { x: (ev.clientX - r.left - tx) / scale, y: (ev.clientY - r.top - ty) / scale }; };
    function drawMask(){
      const id = mctx.createImageData(F.fw, F.fh);
      for (let i = 0; i < F.freeze.length; i++) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 40; id.data[i * 4 + 2] = 40; id.data[i * 4 + 3] = F.freeze[i] * 130; }
      mctx.putImageData(id, 0, 0);
    }
    function drawView(){
      const c = view.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, view.width, view.height);
      c.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
      
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.imageSmoothingEnabled = scale < 1;
      if (opt.showImage) c.drawImage(off, 0, 0);
      if (opt.showMask) { c.imageSmoothingEnabled = true; c.drawImage(maskCv, 0, 0, F.fw * F.g, F.fh * F.g); }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cursor && opt.tool !== 'hand') {
        const R = opt.size / 2 * scale, X = tx + cursor.x * scale, Y = ty + cursor.y * scale;
        c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.8)'; c.beginPath(); c.arc(X, Y, R, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(X, Y, R + 1, 0, Math.PI * 2); c.stroke();
        const inner = R * opt.density / 100 * 0.8; if (inner > 2) { c.setLineDash([3, 3]); c.beginPath(); c.arc(X, Y, inner, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
      }
    }
    function repaint(rect){
      if (!rect) return;
      if (!rect.maskOnly) {
        renderLiquify(src, F, out, rect);
        const x = Math.max(0, Math.floor(rect.x0)), y = Math.max(0, Math.floor(rect.y0));
        octx.putImageData(img, 0, 0, x, y, Math.min(w, Math.ceil(rect.x1)) - x, Math.min(h, Math.ceil(rect.y1)) - y);
      } else drawMask();
    }
    function full(){ renderLiquify(src, F, out, null); octx.putImageData(img, 0, 0); drawMask(); drawView(); }
    function pushUndo(){ undo.push(cloneField(F)); if (undo.length > 12) undo.shift(); redo.length = 0; }

    
    let drag = null, raf = 0, spaceDown = false, alt = false;
    const effTool = () => {
      const t = opt.tool;
      if (!alt) return t;
      return { twirlCW: 'twirlCCW', pucker: 'bloat', bloat: 'pucker', pushLeft: 'pushRight' }[t] || t;
    };
    const dab = (p, vx, vy) => {
      let tool = effTool(); let vxx = vx, vyy = vy;
      if (tool === 'pushRight') { tool = 'pushLeft'; vxx = -vx; vyy = -vy; }
      const r = applyDab(F, tool, { cx: p.x, cy: p.y, vx: vxx, vy: vyy, radius: opt.size / 2, pressure: opt.pressure / 100, density: opt.density / 100, rate: opt.rate / 100 });
      repaint(r);
    };
    const continuous = () => ['twirlCW', 'pucker', 'bloat', 'reconstruct', 'smooth', 'freeze', 'thaw'].includes(opt.tool);
    const loop = () => { if (!drag) return; if (continuous()) { dab(drag.last, 0, 0); drawView(); } raf = requestAnimationFrame(loop); };
    mid.addEventListener('pointerdown', ev => {
      mid.setPointerCapture(ev.pointerId);
      if (opt.tool === 'hand' || spaceDown || ev.button === 1) { drag = { pan: true, x: ev.clientX, y: ev.clientY }; mid.style.cursor = 'grabbing'; return; }
      alt = ev.altKey; pushUndo();
      const p = toSrc(ev); drag = { last: p };
      if (continuous()) { dab(p, 0, 0); raf = requestAnimationFrame(loop); }
      drawView();
    });
    mid.addEventListener('pointermove', ev => {
      cursor = toSrc(ev); alt = ev.altKey;
      if (drag && drag.pan) { tx += ev.clientX - drag.x; ty += ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; drawView(); return; }
      if (drag) {
        const p = cursor, dx = p.x - drag.last.x, dy = p.y - drag.last.y, dist = Math.hypot(dx, dy);
        const step = Math.max(1, opt.size * 0.08);
        if (!continuous()) {
          if (dist >= step) {
            const n = Math.ceil(dist / step);
            for (let k = 1; k <= n; k++) { const q = { x: drag.last.x + dx * k / n, y: drag.last.y + dy * k / n }; dab(q, dx / n, dy / n); }
            drag.last = p;
          }
        } else drag.last = p;
      }
      drawView();
    });
    const up = () => { if (drag && drag.pan) mid.style.cursor = opt.tool === 'hand' ? 'grab' : 'none'; drag = null; cancelAnimationFrame(raf); };
    mid.addEventListener('pointerup', up); mid.addEventListener('pointercancel', up);
    mid.addEventListener('pointerleave', () => { cursor = null; drawView(); });
    mid.addEventListener('wheel', ev => {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        const r = mid.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, k = Math.exp(-ev.deltaY * 0.0015);
        const ns = Math.max(0.05, Math.min(16, scale * k)); tx = mx - (mx - tx) * ns / scale; ty = my - (my - ty) * ns / scale; scale = ns;
      } else { tx -= ev.deltaX; ty -= ev.deltaY; }
      drawView();
    }, { passive: false });

    const keyMap = Object.fromEntries(TOOLS.map(t => [t[2].toLowerCase(), t[0]]));
    function onKey(ev){
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) && ev.key !== 'Escape') return;
      if (ev.key === ' ') { spaceDown = ev.type === 'keydown'; ev.preventDefault(); return; }
      if (ev.type !== 'keydown') return;
      const k = ev.key.toLowerCase();
      if ((ev.metaKey || ev.ctrlKey) && k === 'z') {
        ev.preventDefault();
        const from = ev.shiftKey ? redo : undo, to = ev.shiftKey ? undo : redo;
        if (from.length) { to.push(cloneField(F)); F = from.pop(); full(); }
        return;
      }
      if (ev.metaKey || ev.ctrlKey) return;
      if (k === '[') { setSize(Math.max(1, Math.round(opt.size * 0.85))); drawView(); ev.preventDefault(); return; }
      if (k === ']') { setSize(Math.min(1500, Math.round(opt.size * 1.18) + 1)); drawView(); ev.preventDefault(); return; }
      if (keyMap[k]) { setTool(keyMap[k]); ev.preventDefault(); }
      if (ev.key === 'Enter') { ev.preventDefault(); ok.onclick(); }
    }
    dlg.addEventListener('keydown', onKey); dlg.addEventListener('keyup', onKey);
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); finish(null); });
    const ro = new ResizeObserver(() => fit()); ro.observe(mid);
    let done = false;
    function finish(v){ if (done) return; done = true; ro.disconnect(); cancelAnimationFrame(raf); try { dlg.close(); } catch {} dlg.remove(); resolve(v); }

    document.body.append(dlg);
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    setTool('forward'); if (field) full(); else drawMask(); fit();
    dlg.tabIndex = -1; dlg.focus();
    
    dlg.__lq = { get F(){ return F; }, dab: (x, y, vx, vy) => { pushUndo(); dab({ x, y }, vx, vy); drawView(); }, ok: () => ok.onclick(), setTool };
  });
}
