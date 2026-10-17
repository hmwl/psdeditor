
















import { createWorkspace, mk, section, slider, select, check, button, row, okCancel, drawChecker } from './fx-workspace.js';
import { renderGallery, densePath } from '../../core/path-blur.js';

const KINDS = [['field', '场景模糊'], ['iris', '光圈模糊'], ['tilt', '移轴模糊'], ['path', '路径模糊'], ['spin', '旋转模糊']];

export function openBlurGallery({ rgba, w, h, kind = 'field', title }) {
  if (kind === 'tiltShift') kind = 'tilt';
  const ws = createWorkspace({ title: '模糊画廊' + (title ? ' — ' + title : ''), tools: [], width: w, height: h, hand: false, zoom: false, rightWidth: 270 });
  const k = Math.min(1, 640 / Math.max(w, h)), pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
  const small = k < 1 ? downscale(rgba, w, h, pw, ph) : new Uint8ClampedArray(rgba);
  const m = Math.min(w, h);
  const S = {
    field: { enabled: false, pins: [] }, iris: { enabled: false, pins: [] }, tilt: { enabled: false, pins: [] },
    path: { enabled: false, paths: [], speed: 50, taper: 0, centered: true, mode: 'basic', strobeStrength: 0, strobeCount: 2, editShape: false },
    spin: { enabled: false, pins: [] },
    effects: { bokeh: 0, bokehColor: 0, rangeLo: 191, rangeHi: 255 }, noise: { amount: 0, type: 'uniform', mono: false, seed: 7 },
  };
  const newPin = (t, x, y) => ({
    field: { x, y, blur: 15 }, iris: { x, y, rx: m * 0.25, ry: m * 0.2, rot: 0, feather: 0.5, roundness: 1, blur: 15 },
    tilt: { x, y, angle: 0, focus: h * 0.08, trans: h * 0.15, blur: 15 }, spin: { x, y, rx: m * 0.2, ry: m * 0.2, rot: 0, angle: 15 },
  })[t];
  let active = kind, sel = null, drag = null, hideOverlay = false, preview = true, drawing = null, cursor = null;
  
  S[active].enabled = true;
  if (active === 'path') S.path.paths.push({ pts: [[w * 0.3, h * 0.55], [w * 0.5, h * 0.45], [w * 0.7, h * 0.55]], speed0: 40, speed1: 40 });
  else S[active].pins.push(newPin(active, w / 2, h / 2));
  sel = active === 'path' ? { t: 'path', i: 0 } : { t: active, i: 0 };

  const prevCv = mk('canvas', { width: pw, height: ph });
  let timer = 0, busy = false;
  function render() {
    if (!preview) { prevCv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(small), pw, ph), 0, 0); ws.draw(); return; }
    busy = true;
    const out = renderGallery(small, pw, ph, S, k);
    prevCv.getContext('2d').putImageData(new ImageData(out, pw, ph), 0, 0);
    busy = false; ws.draw();
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 40); ws.draw(); };

  
  check(ws.bar, '预览', true, v => { preview = v; render(); });
  button(ws.bar, '移去所有图钉', () => { for (const [t] of KINDS) { if (t === 'path') S.path.paths = []; else S[t].pins = []; } sel = null; syncPanel(); schedule(); });
  ws.bar.append(mk('span', { textContent: '单击画布放置当前模糊的图钉；Delete 删除选中；按住 H 隐藏图钉；空格拖动' }, 'opacity:.7'));

  
  const panel = mk('div', {}, 'display:flex;flex-direction:column;gap:6px'); ws.right.append(panel);
  function syncPanel() {
    panel.textContent = '';
    for (const [t, label] of KINDS) {
      const head = row(panel, 'margin-top:4px');
      const cb = mk('input', { type: 'checkbox', checked: S[t].enabled });
      cb.onchange = () => { S[t].enabled = cb.checked; if (cb.checked) active = t; syncPanel(); schedule(); };
      const hb = mk('button', { type: 'button', textContent: (active === t ? '▾ ' : '▸ ') + label }, 'flex:1;text-align:left;font-weight:600');
      hb.onclick = () => { active = t; S[t].enabled = true; syncPanel(); schedule(); };
      head.append(cb, hb);
      if (active !== t) continue;
      const box = mk('div', {}, 'display:flex;flex-direction:column;gap:5px;padding-left:18px'); panel.append(box);
      const pin = sel && sel.t === t && (t === 'path' ? S.path.paths[sel.i] : S[t].pins[sel.i]);
      if (t === 'field' || t === 'iris' || t === 'tilt') {
        if (pin) slider(box, '模糊：', Math.round(pin.blur), 0, 500, 1, v => { pin.blur = v; schedule(); }, { unit: '像素' });
        if (pin && t === 'iris') { slider(box, '圆度：', Math.round(pin.roundness * 100), 0, 100, 1, v => { pin.roundness = v / 100; schedule(); }, { unit: '%' }); slider(box, '过渡：', Math.round(pin.feather * 100), 0, 99, 1, v => { pin.feather = v / 100; schedule(); }, { unit: '%' }); }
        if (pin && t === 'tilt') { slider(box, '角度：', Math.round(pin.angle), -90, 90, 1, v => { pin.angle = v; schedule(); }, { unit: '°' }); }
      } else if (t === 'spin') {
        if (pin) slider(box, '模糊角度：', pin.angle, 0, 360, 1, v => { pin.angle = v; schedule(); }, { unit: '°' });
      } else {
        const P = S.path;
        select(box, '', P.mode, [['basic', '基本模糊'], ['rear', '后帘同步闪光']], v => { P.mode = v; schedule(); });
        slider(box, '速度：', P.speed, 0, 500, 1, v => { P.speed = v; schedule(); }, { unit: '%' });
        slider(box, '锥度：', P.taper, 0, 100, 1, v => { P.taper = v; schedule(); }, { unit: '%' });
        check(box, '居中模糊', P.centered, v => { P.centered = v; schedule(); });
        if (pin) {
          const which = sel.end;
          slider(box, which === 1 ? '终点速度：' : which === 0 ? '起点速度：' : '终点速度：', Math.round(which === 1 ? pin.speed1 : pin.speed0), 0, 1000, 1, v => { if (which === 0) pin.speed0 = v; else if (which === 1) pin.speed1 = v; else pin.speed0 = pin.speed1 = v; schedule(); }, { unit: '像素' });
        }
        check(box, '编辑模糊形状', P.editShape, v => { P.editShape = v; if (v) for (const q of P.paths) seedShapes(q); syncPanel(); schedule(); });
        slider(box, '闪光灯强度：', P.strobeStrength, 0, 100, 1, v => { P.strobeStrength = v; schedule(); }, { unit: '%' });
        slider(box, '闪光灯闪光：', P.strobeCount, 1, 100, 1, v => { P.strobeCount = v; schedule(); });
        box.append(mk('div', { textContent: '单击空白处开始画新路径，逐点单击，双击或回车结束；拖端点可调速度对应的那一端。' }, 'opacity:.65'));
      }
      if ((t !== 'path' && !S[t].pins.length) || (t === 'path' && !S.path.paths.length)) box.append(mk('div', { textContent: '在画布上单击放一个图钉。' }, 'opacity:.65'));
    }
    section(panel, '效果');
    slider(panel, '光源散景：', S.effects.bokeh, 0, 100, 1, v => { S.effects.bokeh = v; schedule(); }, { unit: '%' });
    slider(panel, '散景颜色：', S.effects.bokehColor, 0, 100, 1, v => { S.effects.bokehColor = v; schedule(); }, { unit: '%' });
    slider(panel, '光照范围 低：', S.effects.rangeLo, 0, 254, 1, v => { S.effects.rangeLo = v; schedule(); }, { labelW: 80 });
    slider(panel, '光照范围 高：', S.effects.rangeHi, 1, 255, 1, v => { S.effects.rangeHi = v; schedule(); }, { labelW: 80 });
    section(panel, '杂色');
    select(panel, '', S.noise.type, [['uniform', '均匀'], ['gauss', '高斯分布']], v => { S.noise.type = v; schedule(); });
    slider(panel, '数量：', S.noise.amount, 0, 100, 1, v => { S.noise.amount = v; schedule(); }, { unit: '%' });
    check(panel, '单色', S.noise.mono, v => { S.noise.mono = v; schedule(); });
  }
  function seedShapes(q) {
    const D = densePath(q.pts); if (D.length < 2) return;
    const a = D[0], b = D[1], y = D[D.length - 2], z = D[D.length - 1];
    const n0 = Math.hypot(b.x - a.x, b.y - a.y) || 1, n1 = Math.hypot(z.x - y.x, z.y - y.y) || 1;
    if (!q.shape0) q.shape0 = [(b.x - a.x) / n0 * q.speed0, (b.y - a.y) / n0 * q.speed0];
    if (!q.shape1) q.shape1 = [(z.x - y.x) / n1 * q.speed1, (z.y - y.y) / n1 * q.speed1];
  }
  okCancel(ws, () => {
    ws.setStatus('正在按原尺寸渲染…');
    setTimeout(() => ws.finish(renderGallery(rgba, w, h, S, 1)), 20);
  });

  
  const sc = () => ws.scale, near = (x, y, px, py, tol = 8) => Math.hypot((x - px) * sc(), (y - py) * sc()) <= tol;
  const rotP = (p, u, v) => { const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0); return [p.x + u * c - v * s, p.y + u * s + v * c]; };
  function handlesOf(t, p) {
    if (t === 'iris' || t === 'spin') {
      const H = [{ id: 'rx', at: rotP(p, p.rx, 0) }, { id: 'ry', at: rotP(p, 0, p.ry) }];
      if (t === 'iris') H.push({ id: 'feather', at: rotP(p, p.rx * p.feather * Math.SQRT1_2, -p.ry * p.feather * Math.SQRT1_2) });
      return H;
    }
    if (t === 'tilt') {
      const a = p.angle * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, L = Math.max(w, h) * 0.18;
      return [{ id: 'focus', at: [p.x + nx * p.focus, p.y + ny * p.focus] }, { id: 'trans', at: [p.x + nx * (p.focus + p.trans), p.y + ny * (p.focus + p.trans)] },
        { id: 'rotate', at: [p.x + dx * L, p.y + dy * L] }];
    }
    return [];
  }
  function hit(x, y) {
    if (S.path.enabled) S.path.paths.forEach((q, i) => {});
    for (const [t] of KINDS) {
      if (!S[t].enabled) continue;
      if (t === 'path') {
        for (let i = S.path.paths.length - 1; i >= 0; i--) {
          const q = S.path.paths[i];
          if (S.path.editShape) { seedShapes(q); const e0 = q.pts[0], e1 = q.pts[q.pts.length - 1];
            if (near(x, y, e0[0] + q.shape0[0], e0[1] + q.shape0[1])) return { t, i, shape: 0 };
            if (near(x, y, e1[0] + q.shape1[0], e1[1] + q.shape1[1])) return { t, i, shape: 1 }; }
          for (let j = 0; j < q.pts.length; j++) if (near(x, y, q.pts[j][0], q.pts[j][1])) return { t, i, pt: j, end: j === 0 ? 0 : j === q.pts.length - 1 ? 1 : null };
        }
        continue;
      }
      for (let i = S[t].pins.length - 1; i >= 0; i--) {
        const p = S[t].pins[i];
        for (const hd of handlesOf(t, p)) if (near(x, y, hd.at[0], hd.at[1])) return { t, i, handle: hd.id };
        if (near(x, y, p.x, p.y, 12)) return { t, i, center: true };
      }
    }
    return null;
  }
  ws.onDown = (ev, p) => {
    if (drawing) {                                        
      if (drawing.pts.length >= 2 && near(p.x, p.y, drawing.pts[drawing.pts.length - 1][0], drawing.pts[drawing.pts.length - 1][1], 5)) return;
      drawing.pts.push([p.x, p.y]); schedule(); return;
    }
    const H = hit(p.x, p.y);
    if (H) {
      sel = { t: H.t, i: H.i, end: H.end }; active = H.t; syncPanel();
      if (H.t === 'path') {
        const q = S.path.paths[H.i];
        drag = H.shape != null ? { kind: 'shape', q, which: H.shape } : { kind: 'pathPt', q, j: H.pt, alt: ev.altKey };
      } else {
        const pin = S[H.t].pins[H.i];
        drag = H.center ? { kind: 'move', pin, ox: p.x - pin.x, oy: p.y - pin.y } : { kind: 'handle', t: H.t, pin, id: H.handle };
      }
      ws.draw(); return;
    }
    if (!S[active].enabled) S[active].enabled = true;
    if (active === 'path') {
      drawing = { pts: [[p.x, p.y]], speed0: 40, speed1: 40 };
      S.path.paths.push(drawing); sel = { t: 'path', i: S.path.paths.length - 1 }; syncPanel(); ws.draw(); return;
    }
    const pin = newPin(active, p.x, p.y); S[active].pins.push(pin); sel = { t: active, i: S[active].pins.length - 1 };
    drag = { kind: 'move', pin, ox: 0, oy: 0 }; syncPanel(); schedule();
  };
  ws.onMove = (ev, p) => {
    cursor = p;
    if (!drag) { if (drawing) ws.draw(); return; }
    if (drag.kind === 'move') { drag.pin.x = p.x - drag.ox; drag.pin.y = p.y - drag.oy; }
    else if (drag.kind === 'handle') {
      const P = drag.pin, dx = p.x - P.x, dy = p.y - P.y;
      if (drag.t === 'iris' || drag.t === 'spin') {
        if (drag.id === 'rx') { P.rx = Math.max(4, Math.hypot(dx, dy)); P.rot = Math.atan2(dy, dx); }
        else if (drag.id === 'ry') { const c = Math.cos(P.rot), s = Math.sin(P.rot); P.ry = Math.max(4, Math.abs(-dx * s + dy * c)); }
        else if (drag.id === 'feather') { const c = Math.cos(P.rot), s = Math.sin(P.rot); const u = (dx * c + dy * s) / P.rx, v = (-dx * s + dy * c) / P.ry; P.feather = Math.max(0.02, Math.min(0.98, Math.hypot(u, v))); }
      } else if (drag.t === 'tilt') {
        const a = P.angle * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a), d = Math.abs(dx * nx + dy * ny);
        if (drag.id === 'focus') P.focus = Math.max(0, d);
        else if (drag.id === 'trans') P.trans = Math.max(2, d - P.focus);
        else { let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180; if (ev.shiftKey) ang = Math.round(ang / 15) * 15; P.angle = ang; }
      }
    } else if (drag.kind === 'pathPt') { drag.q.pts[drag.j] = [p.x, p.y]; }
    else if (drag.kind === 'shape') { const e = drag.which ? drag.q.pts[drag.q.pts.length - 1] : drag.q.pts[0]; const v = [p.x - e[0], p.y - e[1]]; if (drag.which) drag.q.shape1 = v; else drag.q.shape0 = v; }
    schedule();
  };
  ws.onUp = () => { if (drag) { drag = null; syncPanel(); } };
  ws.onDbl = () => { if (drawing) endPath(); };
  function endPath() {
    
    const P = drawing.pts; while (P.length > 2 && Math.hypot(P[P.length - 1][0] - P[P.length - 2][0], P[P.length - 1][1] - P[P.length - 2][1]) < 3) P.pop();
    if (P.length < 2) S.path.paths.splice(S.path.paths.indexOf(drawing), 1);
    drawing = null; syncPanel(); schedule();
  }
  ws.onEnter = () => { if (drawing) endPath(); else ws.right.querySelector('button.primary:last-of-type'); };
  const okBtn = [...ws.right.querySelectorAll('button')].pop();
  ws.dlg.addEventListener('keydown', ev => {
    if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); if (drawing) endPath(); else okBtn.click(); return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (sel.t === 'path') S.path.paths.splice(sel.i, 1); else S[sel.t].pins.splice(sel.i, 1);
      sel = null; drawing = null; syncPanel(); schedule(); return;
    }
    if (ev.key.toLowerCase() === 'h' && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); ev.stopImmediatePropagation(); hideOverlay = true; ws.draw(); }
    if (ev.key === 'Escape' && drawing) { ev.preventDefault(); ev.stopImmediatePropagation(); endPath(); }
  }, true);
  ws.dlg.addEventListener('keyup', ev => { if (ev.key.toLowerCase() === 'h') { hideOverlay = false; ws.draw(); } });

  ws.redraw = c => {
    const { scale, tx, ty } = ws;
    c.save(); c.translate(tx, ty); c.scale(scale, scale);
    drawChecker(c, 0, 0, w, h); c.imageSmoothingEnabled = true; c.drawImage(prevCv, 0, 0, w, h);
    c.restore();
    if (hideOverlay) return;
    const X = (x, y) => [tx + x * scale, ty + y * scale];
    const ring = (x, y, r, col = '#fff') => { const [a, b] = X(x, y); c.beginPath(); c.arc(a, b, r, 0, 7); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.stroke(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); };
    const dot = (x, y, col = '#fff') => { const [a, b] = X(x, y); c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1; c.beginPath(); c.arc(a, b, 4, 0, 7); c.fill(); c.stroke(); };
    const lineW = (pts, col, dash) => { c.beginPath(); pts.forEach((q, i) => { const [a, b] = X(q[0], q[1]); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.setLineDash(dash || []); c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 3; c.stroke(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); };
    const isSel = (t, i) => sel && sel.t === t && sel.i === i;
    for (const [t] of KINDS) {
      if (!S[t].enabled) continue;
      if (t === 'path') {
        S.path.paths.forEach((q, i) => {
          const D = densePath(q.pts);
          lineW(D.map(d => [d.x, d.y]), isSel('path', i) ? '#4da3ff' : '#9cc9ff');
          
          if (D.length > 1) { const a = D[D.length - 2], b = D[D.length - 1], an = Math.atan2(b.y - a.y, b.x - a.x), L = 12 / scale;
            lineW([[b.x - Math.cos(an - 0.5) * L, b.y - Math.sin(an - 0.5) * L], [b.x, b.y], [b.x - Math.cos(an + 0.5) * L, b.y - Math.sin(an + 0.5) * L]], '#4da3ff'); }
          q.pts.forEach((pt, j) => dot(pt[0], pt[1], j === 0 || j === q.pts.length - 1 ? '#fff' : '#bbb'));
          if (S.path.editShape && q.shape0) {
            for (const [e, v] of [[q.pts[0], q.shape0], [q.pts[q.pts.length - 1], q.shape1]]) { lineW([e, [e[0] + v[0], e[1] + v[1]]], '#ff3b30'); dot(e[0] + v[0], e[1] + v[1], '#ff3b30'); }
          }
        });
        if (drawing && cursor) lineW([drawing.pts[drawing.pts.length - 1], [cursor.x, cursor.y]], '#9cc9ff', [4, 4]);
        continue;
      }
      S[t].pins.forEach((p, i) => {
        const col = isSel(t, i) ? '#4da3ff' : '#fff';
        if (t === 'iris' || t === 'spin') {
          const pts = []; for (let q = 0; q <= 48; q++) { const a = q / 48 * Math.PI * 2; pts.push(rotP(p, Math.cos(a) * p.rx, Math.sin(a) * p.ry)); }
          lineW(pts, col);
          if (t === 'iris') { const f = p.feather; const ip = []; for (let q = 0; q <= 48; q++) { const a = q / 48 * Math.PI * 2; ip.push(rotP(p, Math.cos(a) * p.rx * f, Math.sin(a) * p.ry * f)); } lineW(ip, 'rgba(255,255,255,.55)', [3, 4]); }
          for (const hd of handlesOf(t, p)) dot(hd.at[0], hd.at[1], hd.id === 'feather' ? '#ffd400' : '#fff');
        } else if (t === 'tilt') {
          const a = p.angle * Math.PI / 180, dx = Math.cos(a) * w * 2, dy = Math.sin(a) * w * 2, nx = -Math.sin(a), ny = Math.cos(a);
          for (const s of [-1, 1]) {
            const f = [p.x + nx * p.focus * s, p.y + ny * p.focus * s], g = [p.x + nx * (p.focus + p.trans) * s, p.y + ny * (p.focus + p.trans) * s];
            lineW([[f[0] - dx, f[1] - dy], [f[0] + dx, f[1] + dy]], col); lineW([[g[0] - dx, g[1] - dy], [g[0] + dx, g[1] + dy]], col, [6, 5]);
          }
          for (const hd of handlesOf(t, p)) dot(hd.at[0], hd.at[1]);
        }
        ring(p.x, p.y, 10, col); ring(p.x, p.y, 3, col);
        if (t === 'field') { const [a, b] = X(p.x, p.y); c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.fillText(Math.round(p.blur) + ' 像素', a + 14, b + 4); }
      });
    }
    if (busy) ws.setStatus('渲染中…');
  };

  ws.open();
  syncPanel(); render();
  ws.dlg.__bg = { state: S, toScreen: (x, y) => { const r = ws.mid.getBoundingClientRect(), s = ws.toScreen(x, y); return { x: r.left + s.x, y: r.top + s.y }; }, render, get active() { return active; } };
  return ws.done;
}
function downscale(rgba, w, h, W, H) {
  const c = mk('canvas', { width: w, height: h }); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const d = mk('canvas', { width: W, height: H }), g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, W, H);
  return g.getImageData(0, 0, W, H).data;
}
