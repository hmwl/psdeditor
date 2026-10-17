













import { createWorkspace, mk, section, slider, select, check, button, row, okCancel, drawChecker } from './fx-workspace.js';
import { buildModel, renderAdaptive, MODELS } from '../../core/adaptive-wide.js';

const TOOLS = [
  { id: 'constraint', label: '约束工具', key: 'C', glyph: '⟋' }, { id: 'polygon', label: '多边形约束工具', key: 'Y', glyph: '⬠' },
  { id: 'move', label: '移动工具', key: 'M', glyph: '✥' },
];

export function openAdaptiveWide({ rgba, w, h, title }) {
  const ws = createWorkspace({ title: '自适应广角' + (title ? ' — ' + title : ''), tools: TOOLS, width: w, height: h });
  
  const k = Math.min(1, 720 / Math.max(w, h)), pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
  const small = k < 1 ? downscale(rgba, w, h, pw, ph) : rgba;
  const P = { model: 'fisheye', focal: 12, crop: 1, scale: 100, asShot: false, constraints: [] };
  const view = { preview: true, showCons: true, grid: false, dx: 0, dy: 0 };
  let M = null, prevCv = mk('canvas', { width: pw, height: ph }), selCons = -1, drag = null, poly = null, cursor = null, dirty = true, timer = 0;
  const undo = [], redo = [];
  const snap = () => JSON.stringify(P.constraints);
  const pushUndo = () => { undo.push(snap()); if (undo.length > 50) undo.shift(); redo.length = 0; };

  function rebuild(full = false) {
    M = buildModel(w, h, P);
    if (!view.preview) { dirty = false; const c = prevCv.getContext('2d'); c.putImageData(new ImageData(new Uint8ClampedArray(small), pw, ph), 0, 0); ws.draw(); return; }
    const out = renderAdaptive(small, w, h, M, { step: full ? 2 : 6, srcW: pw, srcH: ph, outW: pw, outH: ph, srcScale: k, outScale: k });
    prevCv.getContext('2d').putImageData(new ImageData(out, pw, ph), 0, 0);
    dirty = false; ws.draw();
  }
  const schedule = () => { dirty = true; clearTimeout(timer); timer = setTimeout(() => rebuild(true), 60); };

  
  section(ws.right, '校正');
  select(ws.right, '校正：', P.model, MODELS, v => { P.model = v; if (v === 'perspective' && P.focal < 14) { P.focal = 18; focalCtl.set(18); } schedule(); });
  slider(ws.right, '缩放：', P.scale, 50, 150, 1, v => { P.scale = v; schedule(); }, { unit: '%' });
  const focalCtl = slider(ws.right, '焦距：', P.focal, 1, 200, 0.1, v => { P.focal = v; schedule(); }, { unit: '毫米' });
  slider(ws.right, '裁剪因子：', P.crop, 0.1, 10, 0.01, v => { P.crop = v; schedule(); });
  const asShot = check(ws.right, '原照设置', false, () => { asShot.set(false); ws.setStatus('原照设置要读相机 / 镜头 EXIF 与 Adobe 镜头配置文件，本编辑器没有这套数据：请手动填焦距与裁剪因子'); });
  asShot.el.title = '需要镜头配置文件（Adobe 的素材库），本编辑器不内置';
  asShot.el.style.opacity = '.55';
  section(ws.right, '约束');
  const consBox = mk('div', {}, 'display:flex;flex-direction:column;gap:3px;max-height:200px;overflow:auto'); ws.right.append(consBox);
  const TYPES = [['free', '未固定'], ['h', '水平'], ['v', '垂直']];
  function renderCons() {
    consBox.textContent = '';
    if (!P.constraints.length) consBox.append(mk('div', { textContent: '用约束工具（C）沿图上的一条「本该是直的」线拖一下。' }, 'opacity:.7'));
    P.constraints.forEach((c, i) => {
      const r = row(consBox); r.style.flexWrap = 'nowrap';
      const b = mk('button', { type: 'button', textContent: `约束 ${i + 1}` }, 'flex:1'); if (i === selCons) b.className = 'primary';
      b.onclick = () => { selCons = i; renderCons(); ws.draw(); };
      const s = mk('select'); for (const [v, t] of TYPES) s.append(mk('option', { value: v, textContent: t })); s.value = c.type;
      s.onchange = () => { pushUndo(); c.type = s.value; schedule(); };
      const x = mk('button', { type: 'button', textContent: '✕', title: '删除（Alt 单击约束 / Delete）' }); x.onclick = () => { pushUndo(); P.constraints.splice(i, 1); selCons = -1; renderCons(); schedule(); };
      r.append(b, s, x);
    });
  }
  const rr = row(ws.right);
  button(rr, '删除全部约束', () => { if (!P.constraints.length) return; pushUndo(); P.constraints = []; selCons = -1; renderCons(); schedule(); });
  section(ws.right, '视图');
  check(ws.right, '预览', view.preview, v => { view.preview = v; rebuild(true); });
  check(ws.right, '显示约束', view.showCons, v => { view.showCons = v; ws.draw(); });
  check(ws.right, '显示网格', view.grid, v => { view.grid = v; ws.draw(); });
  ws.right.append(mk('div', { className: 'anote plain', textContent: 'Shift 拖 = 水平 / 垂直约束；Alt 单击约束 = 删除；⌘Z 撤销。镜头配置文件（自动识别镜头）属于 Adobe 素材库，这里按你填的焦距 / 裁剪因子反解投影。' }, 'opacity:.7;line-height:1.5'));
  okCancel(ws, () => {
    ws.setStatus('正在按原尺寸计算…');
    setTimeout(() => {
      const Mf = buildModel(w, h, P);
      const out = renderAdaptive(rgba, w, h, Mf, { step: 3 });
      if (view.dx || view.dy) { const moved = new Uint8ClampedArray(out.length); const dx = Math.round(view.dx), dy = Math.round(view.dy);
        for (let y = 0; y < h; y++) { const sy = y - dy; if (sy < 0 || sy >= h) continue; for (let x = 0; x < w; x++) { const sx = x - dx; if (sx < 0 || sx >= w) continue; const a = (y * w + x) * 4, b = (sy * w + sx) * 4; moved[a] = out[b]; moved[a + 1] = out[b + 1]; moved[a + 2] = out[b + 2]; moved[a + 3] = out[b + 3]; } }
        ws.finish(moved); } else ws.finish(out);
    }, 20);
  });

  
  const outPt = p => [p.x - view.dx, p.y - view.dy];
  const toSrc = p => { const [x, y] = outPt(p); return M.outToSrc(x, y); };
  const consHit = p => {
    const tol = 6 / ws.scale;
    for (let i = P.constraints.length - 1; i >= 0; i--) {
      const pts = M.arcOut(P.constraints[i], 24);
      for (let j = 1; j < pts.length; j++) if (segDist(outPt(p), pts[j - 1], pts[j]) <= tol) return i;
    }
    return -1;
  };
  ws.onDown = (ev, p) => {
    if (!M) return;
    if (ws.tool === 'move') { drag = { kind: 'move', x: p.x, y: p.y, dx: view.dx, dy: view.dy }; return; }
    const hit = consHit(p);
    if (ev.altKey && hit >= 0) { pushUndo(); P.constraints.splice(hit, 1); selCons = -1; renderCons(); schedule(); return; }
    if (ws.tool === 'constraint') {
      if (hit >= 0 && !ev.shiftKey) { selCons = hit; renderCons(); ws.draw(); }
      const s = toSrc(p); if (!s) return;
      drag = { kind: 'cons', a: s, b: s, p0: p, shift: ev.shiftKey };
      return;
    }
    if (ws.tool === 'polygon') {
      const s = toSrc(p); if (!s) return;
      if (!poly) { poly = [s]; ws.draw(); return; }
      const first = M.srcToOut(poly[0][0], poly[0][1]);
      if (poly.length >= 3 && first && Math.hypot((first[0] + view.dx - p.x) * ws.scale, (first[1] + view.dy - p.y) * ws.scale) < 8) { closePoly(); return; }
      poly.push(s); ws.draw();
    }
  };
  ws.onDbl = () => { if (ws.tool === 'polygon' && poly && poly.length >= 3) { poly.pop(); closePoly(); } };
  function closePoly() {
    pushUndo();
    for (let i = 0; i < poly.length; i++) P.constraints.push({ a: poly[i], b: poly[(i + 1) % poly.length], type: 'free', poly: true });
    poly = null; renderCons(); schedule();
  }
  ws.onMove = (ev, p) => {
    cursor = p;
    if (drag && drag.kind === 'move') { view.dx = drag.dx + p.x - drag.x; view.dy = drag.dy + p.y - drag.y; }
    else if (drag && drag.kind === 'cons') { const s = toSrc(p); if (s) drag.b = s; }
    ws.draw();
  };
  ws.onUp = (ev, p) => {
    if (drag && drag.kind === 'cons') {
      const len = Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) * ws.scale;
      if (len > 6) {
        pushUndo();
        let type = 'free';
        if (drag.shift) { const dx = Math.abs(p.x - drag.p0.x), dy = Math.abs(p.y - drag.p0.y); type = dx >= dy ? 'h' : 'v'; }
        P.constraints.push({ a: drag.a, b: drag.b, type }); selCons = P.constraints.length - 1; renderCons(); schedule();
      }
    }
    drag = null; ws.draw();
  };
  ws.onKey = null;
  ws.dlg.addEventListener('keydown', ev => {
    if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key.toLowerCase() === 'z') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const from = ev.shiftKey ? redo : undo, to = ev.shiftKey ? undo : redo;
      if (from.length) { to.push(snap()); P.constraints = JSON.parse(from.pop()); selCons = -1; renderCons(); schedule(); }
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && selCons >= 0) {
      ev.preventDefault(); ev.stopImmediatePropagation(); pushUndo(); P.constraints.splice(selCons, 1); selCons = -1; renderCons(); schedule();
    } else if (ev.key === 'Escape' && poly) { ev.preventDefault(); ev.stopImmediatePropagation(); poly = null; ws.draw(); }
  }, true);

  ws.redraw = c => {
    const { scale, tx, ty } = ws;
    c.save(); c.translate(tx, ty); c.scale(scale, scale);
    drawChecker(c, 0, 0, w, h);
    c.beginPath(); c.rect(0, 0, w, h); c.clip();
    c.imageSmoothingEnabled = true; c.drawImage(prevCv, view.dx, view.dy, w, h);
    if (view.grid) {
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1 / scale; c.beginPath();
      const g = Math.max(w, h) / 16; for (let x = 0; x <= w; x += g) { c.moveTo(x, 0); c.lineTo(x, h); } for (let y = 0; y <= h; y += g) { c.moveTo(0, y); c.lineTo(w, y); } c.stroke();
    }
    c.restore();
    if (!M) return;
    const S = q => [tx + (q[0] + view.dx) * scale, ty + (q[1] + view.dy) * scale];
    const line = (pts, color, wd) => { if (pts.length < 2) return; c.beginPath(); pts.forEach((q, i) => { const [X, Y] = S(q); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = wd + 2; c.stroke(); c.strokeStyle = color; c.lineWidth = wd; c.stroke(); };
    const COL = { free: '#20c3ff', h: '#ffd400', v: '#ff4dd2' };
    if (view.showCons) P.constraints.forEach((cs, i) => {
      const pts = M.arcOut(cs, 32); line(pts, COL[cs.type] || '#20c3ff', i === selCons ? 2.5 : 1.5);
      for (const e of [pts[0], pts[pts.length - 1]]) if (e) { const [X, Y] = S(e); c.fillStyle = '#fff'; c.beginPath(); c.arc(X, Y, 3.5, 0, 7); c.fill(); }
    });
    if (drag && drag.kind === 'cons') line(M.arcOut({ a: drag.a, b: drag.b }, 32), '#20c3ff', 1.5);
    if (poly) { const pts = poly.map(s => M.srcToOut(s[0], s[1])).filter(Boolean); if (cursor) pts.push([cursor.x - view.dx, cursor.y - view.dy]); line(pts, '#7cff6b', 1.5); }
  };

  ws.open();
  renderCons();
  rebuild(true);
  ws.dlg.__aw = { get params() { return JSON.parse(JSON.stringify(P)); }, set(o) { Object.assign(P, o); renderCons(); rebuild(true); }, toScreen: (x, y) => { const r = ws.mid.getBoundingClientRect(), s = ws.toScreen(x + view.dx, y + view.dy); return { x: r.left + s.x, y: r.top + s.y }; }, get M() { return M; } };
  return ws.done;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
function downscale(rgba, w, h, W, H) {
  const c = mk('canvas', { width: w, height: h }); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  const d = mk('canvas', { width: W, height: H }), g = d.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, W, H);
  return g.getImageData(0, 0, W, H).data;
}
