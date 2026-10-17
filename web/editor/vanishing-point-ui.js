


















import { createWorkspace, mk, section, slider, select, check, color, button, row, okCancel, hexToRgb, rgbToHex, rgbaCanvas, drawChecker } from './fx-workspace.js';
import { solvePlanes, toPlane, planeAt, gridLines, planeScale, apply3, stampPlane, paintPlane, warpRegion, regionQuad, renderGridInto, quadConvex } from '../../core/vanishing-point.js';

const TOOLS = [
  { id: 'edit', label: '编辑平面工具', key: 'V', glyph: '⬚' }, { id: 'create', label: '创建平面工具', key: 'C', glyph: '⊞' },
  { id: 'marquee', label: '选框工具', key: 'M', glyph: '▭' }, { id: 'stamp', label: '图章工具', key: 'S', glyph: '⎘' },
  { id: 'brush', label: '画笔工具', key: 'B', glyph: '✎' }, { id: 'transform', label: '变换工具', key: 'T', glyph: '⤡' },
  { id: 'eyedropper', label: '吸管工具', key: 'I', glyph: '⌖' }, { id: 'measure', label: '测量工具', key: 'R', glyph: '📏' },
];
const HEAL = [['off', '关'], ['luminance', '明亮度'], ['on', '开']];

export function openVanishingPoint({ rgba, w, h, planes: planes0, clip, fg, title }) {
  const ws = createWorkspace({ title: '消失点' + (title ? ' — ' + title : ''), tools: TOOLS, width: w, height: h, rightWidth: 250 });
  const orig = new Uint8ClampedArray(rgba);
  let img = new Uint8ClampedArray(rgba);
  let planes = (planes0 || []).map(p => JSON.parse(JSON.stringify(p)));
  let nextId = planes.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;
  let solved = solvePlanes(planes, w, h);
  let selPlane = planes.length ? planes[planes.length - 1].id : null;
  let pixelsTouched = false, planesTouched = false;
  const opt = {
    grid: 100, angle: 90, showEdges: true, renderGrid: false,
    feather: 1, opacity: 100, heal: 'off', moveMode: 'target',
    diameter: 60, hardness: 50, sOpacity: 100, sHeal: 'off', aligned: true,
    bDiameter: 30, bHardness: 50, bOpacity: 100, bHeal: 'off', brushColor: rgbToHex(fg || [0, 0, 0]),
  };
  
  let marq = null, createPts = [], drag = null, cursor = null, stampSrc = null, stampOffset = null, measure = null;
  const imgCv = rgbaCanvas(img, w, h), imgCtx = imgCv.getContext('2d');
  const refreshImg = r => {
    if (!r) { imgCtx.putImageData(new ImageData(img, w, h), 0, 0); return; }
    const x = Math.max(0, r.x0 | 0), y = Math.max(0, r.y0 | 0), x1 = Math.min(w, Math.ceil(r.x1)), y1 = Math.min(h, Math.ceil(r.y1));
    if (x1 > x && y1 > y) imgCtx.putImageData(new ImageData(img, w, h), 0, 0, x, y, x1 - x, y1 - y);
  };
  const resolve = () => { solved = solvePlanes(planes, w, h); };
  const planeById = id => planes.find(p => p.id === id);
  const T = id => { const p = planeById(id), S = p && solved.get(id); return p && S && S.valid ? { plane: p, S } : null; };

  
  const undo = [], redo = [];
  const snap = () => ({ img: new Uint8ClampedArray(img), planes: JSON.stringify(planes), marq: marq && { ...marq, r: { ...marq.r }, float: marq.float && { ...marq.float } }, selPlane });
  const restore = s => { img = s.img; planes = JSON.parse(s.planes); marq = s.marq; selPlane = s.selPlane; resolve(); refreshImg(); syncBar(); ws.draw(); };
  const pushUndo = () => { undo.push(snap()); if (undo.length > 24) undo.shift(); redo.length = 0; };

  
  function syncBar() {
    const B = ws.bar; B.textContent = '';
    const t = ws.tool, sp = planeById(selPlane);
    const o2 = { inline: true, labelW: 0 };
    if (t === 'edit' || t === 'create') {
      if (sp) {
        const l = mk('label', {}, 'display:flex;gap:6px;align-items:center'); l.append('名称：');
        const n = mk('input', { value: sp.name || '' }, 'width:120px'); n.onchange = () => { pushUndo(); sp.name = n.value; planesTouched = true; }; l.append(n); B.append(l);
      }
      slider(B, '网格大小：', sp ? sp.grid || opt.grid : opt.grid, 5, 1000, 1, (v, fin) => { if (sp) { if (fin) pushUndo(); sp.grid = v; planesTouched = true; } else opt.grid = v; ws.draw(); }, o2);
      if (sp && sp.kind === 'child') slider(B, '角度：', sp.angle, -180, 180, 1, (v, fin) => { if (fin) pushUndo(); sp.angle = v; planesTouched = true; resolve(); ws.draw(); }, { ...o2, unit: '°' });
      if (t === 'create') B.append(mk('span', { textContent: createPts.length ? `已点 ${createPts.length}/4 个角（Backspace 撤回一个点）` : '单击 4 个角点建立透视平面；拖边中点拉出垂直平面' }, 'opacity:.75'));
      else B.append(mk('span', { textContent: '拖角点改平面，拖边中点延伸，⌘ 拖边中点拉出垂直平面，Alt 拖子平面边中点改角度' }, 'opacity:.75'));
    } else if (t === 'marquee') {
      slider(B, '羽化：', opt.feather, 0, 250, 1, v => { opt.feather = v; rerenderFloat(); }, o2);
      slider(B, '不透明度：', opt.opacity, 1, 100, 1, v => { opt.opacity = v; rerenderFloat(); }, { ...o2, unit: '%' });
      select(B, '修复：', opt.heal, HEAL, v => { opt.heal = v; rerenderFloat(); }, { labelW: 0, css: '' });
      select(B, '移动模式：', opt.moveMode, [['target', '目标'], ['source', '源']], v => { opt.moveMode = v; }, { labelW: 0, css: '' });
    } else if (t === 'stamp') {
      slider(B, '直径：', opt.diameter, 1, 2000, 1, v => { opt.diameter = v; ws.draw(); }, o2);
      slider(B, '硬度：', opt.hardness, 0, 100, 1, v => { opt.hardness = v; }, { ...o2, unit: '%' });
      slider(B, '不透明度：', opt.sOpacity, 1, 100, 1, v => { opt.sOpacity = v; }, { ...o2, unit: '%' });
      select(B, '修复：', opt.sHeal, HEAL, v => { opt.sHeal = v; }, { labelW: 0, css: '' });
      check(B, '对齐', opt.aligned, v => { opt.aligned = v; if (!v) stampOffset = null; });
      B.append(mk('span', { textContent: stampSrc ? '' : '按住 Alt 单击设置取样点' }, 'opacity:.75'));
    } else if (t === 'brush') {
      slider(B, '直径：', opt.bDiameter, 1, 2000, 1, v => { opt.bDiameter = v; ws.draw(); }, o2);
      slider(B, '硬度：', opt.bHardness, 0, 100, 1, v => { opt.bHardness = v; }, { ...o2, unit: '%' });
      slider(B, '不透明度：', opt.bOpacity, 1, 100, 1, v => { opt.bOpacity = v; }, { ...o2, unit: '%' });
      select(B, '修复：', opt.bHeal, HEAL, v => { opt.bHeal = v; }, { labelW: 0, css: '' });
      brushColorCtl = color(B, '画笔颜色：', opt.brushColor, v => { opt.brushColor = v; });
    } else if (t === 'transform') {
      check(B, '水平翻转', marq && marq.flipH, v => { if (marq && marq.float) { marq.flipH = v; rerenderFloat(); } });
      check(B, '垂直翻转', marq && marq.flipV, v => { if (marq && marq.float) { marq.flipV = v; rerenderFloat(); } });
      B.append(mk('span', { textContent: marq && marq.float ? '拖角点缩放（Shift 等比），框外拖动旋转，框内拖动移动' : '先用选框工具 Alt 拖出一份浮动内容（或 ⌘V 粘贴）再变换' }, 'opacity:.75'));
    } else if (t === 'measure') {
      B.append(mk('span', { textContent: measure ? measureText() : '在平面内拖动测量距离（按平面透视换算）' }, 'opacity:.8'));
    } else if (t === 'eyedropper') {
      B.append(mk('span', { textContent: '单击图像取画笔颜色' }, 'opacity:.75'));
    }
  }
  let brushColorCtl = null;
  ws.onTool = id => { if (id !== 'create') createPts = []; if (id !== 'marquee' && id !== 'transform' && marq && marq.float) dropFloat(); syncBar(); };

  
  section(ws.right, '平面');
  const planeList = mk('div', {}, 'display:flex;flex-direction:column;gap:2px;max-height:180px;overflow:auto');
  ws.right.append(planeList);
  const renderPlaneList = () => {
    planeList.textContent = '';
    if (!planes.length) planeList.append(mk('div', { textContent: '还没有平面：用创建平面工具（C）点 4 个角。' }, 'opacity:.7'));
    planes.forEach((p, i) => {
      const S = solved.get(p.id);
      const b = mk('button', { type: 'button', textContent: `${p.name || '平面 ' + (i + 1)}${p.kind === 'child' ? `（${p.angle}°）` : ''}${S && S.valid ? '' : ' ⚠'}` }, 'text-align:left');
      if (p.id === selPlane) b.className = 'primary';
      b.onclick = () => { selPlane = p.id; syncBar(); renderPlaneList(); ws.draw(); };
      planeList.append(b);
    });
  };
  const r1 = row(ws.right);
  button(r1, '删除平面', () => deletePlane(), { title: 'Backspace / Delete' });
  check(ws.right, '显示边缘', opt.showEdges, v => { opt.showEdges = v; ws.draw(); });
  check(ws.right, '渲染网格至 Photoshop（确定时把网格画进图像）', opt.renderGrid, v => { opt.renderGrid = v; });
  section(ws.right, '提示');
  ws.right.append(mk('div', { className: 'anote plain', textContent: '⌘C 拷贝的像素可在这里 ⌘V 贴成浮动内容，拖进平面即按透视贴上。⌘Z 撤销。平面会随文档一起存储，下次打开消失点还在。' }, 'opacity:.72;line-height:1.5'));
  okCancel(ws, () => {
    if (marq && marq.float) dropFloat();
    let out = pixelsTouched ? new Uint8ClampedArray(img) : null;
    if (opt.renderGrid && planes.length) { if (!out) out = new Uint8ClampedArray(img); renderGridInto(out, w, h, planes, solved, [0, 0, 0], 1); }
    ws.finish({ rgba: out, planes: JSON.parse(JSON.stringify(planes)), planesTouched });
  });

  function deletePlane() {
    if (selPlane == null) return;
    pushUndo();
    const kill = new Set([selPlane]); let grew = true;
    while (grew) { grew = false; for (const p of planes) if (p.kind === 'child' && kill.has(p.parent) && !kill.has(p.id)) { kill.add(p.id); grew = true; } }
    planes = planes.filter(p => !kill.has(p.id)); planesTouched = true;
    if (marq && kill.has(marq.pid)) { if (marq.float) dropFloat(); marq = null; }
    selPlane = planes.length ? planes[planes.length - 1].id : null; resolve(); syncBar(); renderPlaneList(); ws.draw();
  }

  
  const scr = (x, y) => ws.toScreen(x, y);
  const near = (a, x, y, tol = 7) => { const s = scr(a[0], a[1]); const t = scr(x, y); return Math.hypot(s.x - t.x, s.y - t.y) <= tol; };
  const EDGES = [['v0', 0, 1], ['u1', 1, 2], ['v1', 2, 3], ['u0', 3, 0]];
  function hitNode(x, y) {
    const order = selPlane != null ? [planeById(selPlane), ...planes.filter(p => p.id !== selPlane)] : planes;
    for (const p of order) {
      if (!p) continue; const S = solved.get(p.id); if (!S || !S.quad) continue;
      if (p.kind === 'root') for (let i = 0; i < 4; i++) if (near(S.quad[i], x, y)) return { p, S, corner: i };
      for (const [edge, a, b] of EDGES) {
        const m = midOfEdge(p, S, edge);
        if (m && near(m, x, y)) return { p, S, edge, a, b };
      }
    }
    return null;
  }
  function midOfEdge(p, S, edge) {
    const [u0, v0, u1, v1] = p.ext; const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    const uv = { v0: [um, v0], u1: [u1, vm], v1: [um, v1], u0: [u0, vm] }[edge];
    const q = apply3(S.H, uv[0], uv[1]); return q[2] > 0 ? [q[0], q[1]] : null;
  }

  
  function rerenderFloat() {
    if (!marq || !marq.float) { ws.draw(); return; }
    const F = marq.float, TT = T(marq.pid); if (!TT) return;
    img = new Uint8ClampedArray(F.base);
    let source = F.source;
    if (source.kind === 'plane') { const ST = T(source.pid); if (!ST) return; source = { kind: 'plane', T: ST, r: source.r }; }
    warpRegion(img, F.base, w, h, TT, marq.r, source, { feather: opt.feather, opacity: opt.opacity / 100, heal: opt.heal, rot: marq.rot || 0, flipH: marq.flipH, flipV: marq.flipV });
    pixelsTouched = true; refreshImg(); ws.draw();
  }
  function dropFloat() { if (marq && marq.float) { marq.float = null; ws.draw(); } }
  function fillFromSource(dUV) {
    
    const TT = T(marq.pid); if (!TT) return;
    if (!drag.base) drag.base = new Uint8ClampedArray(img);
    img = new Uint8ClampedArray(drag.base);
    const r = marq.r, sr = { u0: r.u0 + dUV[0], v0: r.v0 + dUV[1], u1: r.u1 + dUV[0], v1: r.v1 + dUV[1] };
    warpRegion(img, drag.base, w, h, TT, r, { kind: 'plane', T: { plane: { ...TT.plane, ext: [-1e9, -1e9, 1e9, 1e9] }, S: TT.S }, r: sr }, { feather: opt.feather, opacity: opt.opacity / 100, heal: opt.heal });
    drag.srcQuad = regionQuad(TT.S, sr);
    pixelsTouched = true; refreshImg(); ws.draw();
  }
  function inMarq(x, y) {
    if (!marq) return false; const TT = T(marq.pid); if (!TT) return false;
    const q = regionQuad(TT.S, marq.r, marq.rot || 0);
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) inside = !inside;
    return inside;
  }
  function pasteClip() {
    if (!clip) { ws.setStatus('剪贴板里没有像素：先在文档里 ⌘C 拷贝一块。'); return; }
    let pid = selPlane != null && T(selPlane) ? selPlane : (planes.find(p => T(p.id)) || {}).id;
    if (pid == null) { ws.setStatus('先建一个平面，再把图像贴进去。'); return; }
    pushUndo();
    const TT = T(pid), { su, sv } = planeScale(TT.S, TT.plane), [u0, v0, u1, v1] = TT.plane.ext;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    let hu = clip.w / 2 / su, hv = clip.h / 2 / sv;
    const fitK = Math.min(1, (u1 - u0) / 2 / hu, (v1 - v0) / 2 / hv); hu *= fitK; hv *= fitK;
    marq = { pid, r: { u0: cu - hu, v0: cv - hv, u1: cu + hu, v1: cv + hv }, rot: 0, flipH: false, flipV: false,
      float: { base: new Uint8ClampedArray(img), source: { kind: 'image', rgba: clip.rgba, w: clip.w, h: clip.h } } };
    ws.setTool('marquee'); rerenderFloat();
    ws.setStatus('已贴入：拖进平面里放好位置；用变换工具（T）缩放旋转；⌘D 落下。');
  }

  
  const effStampSrc = (TT, u, v) => {
    
    const SP = T(stampSrc.pid); if (!SP) return null;
    const a = planeScale(TT.S, TT.plane), b = planeScale(SP.S, SP.plane);
    const su = a.su / b.su, sv = a.sv / b.sv;
    return (uu, vv) => { const q = apply3(SP.S.H, stampSrc.u + (uu - stampOffset.u) * su, stampSrc.v + (vv - stampOffset.v) * sv); return q[2] > 0 ? [q[0], q[1]] : null; };
  };
  function dab(x, y) {
    const hit = planeAt(planes, solved, x, y); if (!hit) return;
    const TT = { plane: hit.plane, S: hit.S };
    let r = null;
    if (ws.tool === 'stamp') {
      if (!stampSrc) return;
      if (!stampOffset) stampOffset = { u: hit.u, v: hit.v, pid: hit.plane.id };
      if (stampOffset.pid !== hit.plane.id) return;            
      const f = effStampSrc(TT, hit.u, hit.v); if (!f) return;
      r = stampPlane(img, drag.src, w, h, TT, hit.u, hit.v, opt.diameter / 2, opt.hardness / 100, opt.sOpacity / 100, f, opt.sHeal);
    } else {
      r = paintPlane(img, w, h, TT, hit.u, hit.v, opt.bDiameter / 2, opt.bHardness / 100, opt.bOpacity / 100, hexToRgb(opt.brushColor), opt.bHeal);
    }
    if (r) { pixelsTouched = true; refreshImg(r); }
  }
  ws.onDown = (ev, p) => {
    const t = ws.tool, mod = ev.metaKey || ev.ctrlKey;
    if (t === 'edit' || t === 'create') {
      const n = hitNode(p.x, p.y);
      if (n && n.edge && (mod || t === 'create')) {                 
        pushUndo();
        const id = nextId++;
        const np = { id, name: '', grid: n.p.grid || opt.grid, kind: 'child', parent: n.p.id, edge: n.edge, angle: 90, len: 0.05, ext: [0, 0, 1, 1] };
        planes.push(np); selPlane = id; resolve(); planesTouched = true;
        drag = { kind: 'child', np, start: p }; createPts = []; syncBar(); renderPlaneList(); ws.draw(); return;
      }
      if (n && t === 'edit') {
        pushUndo(); selPlane = n.p.id;
        if (n.corner != null) drag = { kind: 'corner', p: n.p, i: n.corner, quad: n.S.quad.map(q => q.slice()) };
        else if (n.p.kind === 'child' && ev.altKey) drag = { kind: 'angle', p: n.p, a0: n.p.angle, y0: ev.clientY, x0: ev.clientX };
        else drag = { kind: 'edge', p: n.p, edge: n.edge };
        syncBar(); renderPlaneList(); return;
      }
      if (t === 'create') {
        createPts.push([p.x, p.y]);
        if (createPts.length === 4) {
          const q = createPts.slice(); createPts = [];
          
          const area = q.reduce((s, a, i) => { const b = q[(i + 1) % 4]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
          if (area < 0) q.reverse();
          pushUndo();
          const id = nextId++;
          planes.push({ id, name: '', grid: opt.grid, kind: 'root', corners: q, ext: [0, 0, 1, 1] });
          selPlane = id; planesTouched = true; resolve();
          const S = solved.get(id);
          ws.setStatus(S && S.valid ? '已建立平面（蓝色 = 有效）。拖边中点可延伸，⌘ 拖边中点拉出垂直平面。' : '平面无效（红色）：调整角点，让四边形成为合理的透视矩形。');
          ws.setTool('edit'); renderPlaneList();
        }
        syncBar(); ws.draw(); return;
      }
      
      const hit = planeAt(planes, solved, p.x, p.y);
      if (hit) {
        selPlane = hit.plane.id; syncBar(); renderPlaneList();
        let root = hit.plane; while (root.kind === 'child') root = planeById(root.parent);
        pushUndo(); drag = { kind: 'movePlane', root, start: p, corners: root.corners.map(c => c.slice()) };
      } else { selPlane = null; syncBar(); renderPlaneList(); }
      ws.draw(); return;
    }
    if (t === 'marquee' || t === 'transform') {
      if (marq && inMarq(p.x, p.y)) {
        const TT = T(marq.pid), uv = toPlane(TT.S, TT.plane, p.x, p.y);
        pushUndo();
        if (t === 'marquee' && ev.altKey && !marq.float) {
          marq.float = { base: new Uint8ClampedArray(img), source: { kind: 'plane', pid: marq.pid, r: { ...marq.r } } };
        }
        if (t === 'marquee' && mod && !marq.float) { drag = { kind: 'fillSrc', uv0: uv }; return; }
        drag = { kind: 'moveMarq', uv0: uv, r0: { ...marq.r }, src0: marq.float && marq.float.source.r ? { ...marq.float.source.r } : null, moveSrc: opt.moveMode === 'source' && marq.float && marq.float.source.kind === 'plane' };
        return;
      }
      if (t === 'transform' && marq && marq.float) {
        const TT = T(marq.pid), q = regionQuad(TT.S, marq.r, marq.rot || 0);
        const ci = q.findIndex(c => near(c, p.x, p.y, 9));
        pushUndo();
        if (ci >= 0) { drag = { kind: 'scale', ci, r0: { ...marq.r } }; return; }
        const uv = toPlane(TT.S, TT.plane, p.x, p.y), cu = (marq.r.u0 + marq.r.u1) / 2, cv = (marq.r.v0 + marq.r.v1) / 2;
        drag = { kind: 'rotate', a0: Math.atan2(uv.v - cv, uv.u - cu), rot0: marq.rot || 0 }; return;
      }
      if (t === 'marquee') {
        if (marq && marq.float) dropFloat();
        const hit = planeAt(planes, solved, p.x, p.y);
        if (!hit) { if (marq) { pushUndo(); marq = null; ws.draw(); } return; }
        pushUndo();
        marq = { pid: hit.plane.id, r: { u0: hit.u, v0: hit.v, u1: hit.u, v1: hit.v }, rot: 0, float: null };
        drag = { kind: 'newMarq', uv0: { u: hit.u, v: hit.v } }; ws.draw();
      }
      return;
    }
    if (t === 'stamp' || t === 'brush') {
      if (t === 'stamp' && ev.altKey) {
        const hit = planeAt(planes, solved, p.x, p.y);
        if (hit) { stampSrc = { pid: hit.plane.id, u: hit.u, v: hit.v, x: p.x, y: p.y }; stampOffset = null; syncBar(); ws.setStatus('已设置取样点'); }
        else ws.setStatus('取样点要在平面里面');
        ws.draw(); return;
      }
      if (t === 'stamp' && !stampSrc) { ws.setStatus('先按住 Alt 单击设置取样点'); return; }
      if (!planeAt(planes, solved, p.x, p.y)) { ws.setStatus('只能在平面里面绘画'); return; }
      pushUndo();
      if (t === 'stamp' && !opt.aligned) stampOffset = null;
      drag = { kind: 'paint', last: p, src: new Uint8ClampedArray(img) };
      dab(p.x, p.y); ws.draw(); return;
    }
    if (t === 'eyedropper') {
      const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= w || y >= h) return;
      const o = (y * w + x) * 4; opt.brushColor = rgbToHex([img[o], img[o + 1], img[o + 2]]);
      ws.setStatus('画笔颜色：' + opt.brushColor); return;
    }
    if (t === 'measure') {
      const hit = planeAt(planes, solved, p.x, p.y);
      if (!hit) { measure = null; ws.draw(); return; }
      measure = { pid: hit.plane.id, a: { u: hit.u, v: hit.v }, b: { u: hit.u, v: hit.v } }; drag = { kind: 'measure' }; syncBar(); ws.draw();
    }
  };
  ws.onMove = (ev, p) => {
    cursor = p;
    if (!drag) { ws.draw(); return; }
    if (drag.kind === 'corner') {
      const q = drag.quad.map(c => c.slice()); q[drag.i] = [p.x, p.y];
      drag.p.corners = q; drag.p.ext = [0, 0, 1, 1]; planesTouched = true; resolve();
    } else if (drag.kind === 'edge') {
      const S = solved.get(drag.p.id); const uv = S && toPlane(S, drag.p, p.x, p.y);
      if (uv) {
        const e = drag.p.ext.slice(), m = 0.02;
        if (drag.edge === 'u1') e[2] = Math.max(e[0] + m, uv.u); else if (drag.edge === 'u0') e[0] = Math.min(e[2] - m, uv.u);
        else if (drag.edge === 'v1') e[3] = Math.max(e[1] + m, uv.v); else e[1] = Math.min(e[3] - m, uv.v);
        const old = drag.p.ext; drag.p.ext = e; resolve();
        const S2 = solved.get(drag.p.id); if (!S2 || !S2.valid) { drag.p.ext = old; resolve(); }
        planesTouched = true;
      }
    } else if (drag.kind === 'angle') {
      drag.p.angle = Math.max(-180, Math.min(180, Math.round(drag.a0 + (ev.clientX - drag.x0) * 0.5))); planesTouched = true; resolve(); syncBar();
    } else if (drag.kind === 'child') {
      
      const np = drag.np; let best = null;
      for (const sign of [1, -1]) {
        np.angle = 90 * sign;
        for (const len of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 4]) {
          np.len = len; resolve(); const S = solved.get(np.id); if (!S || !S.valid) continue;
          const far = [(S.quad[2][0] + S.quad[3][0]) / 2, (S.quad[2][1] + S.quad[3][1]) / 2];
          const d = Math.hypot(far[0] - p.x, far[1] - p.y);
          if (!best || d < best.d) best = { d, sign, len };
        }
      }
      if (best) {
        
        np.angle = 90 * best.sign; let lo = best.len / 1.6, hi = best.len * 1.6;
        for (let k = 0; k < 18; k++) {
          const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
          const dist = len => { np.len = len; resolve(); const S = solved.get(np.id); if (!S || !S.valid) return 1e12; const far = [(S.quad[2][0] + S.quad[3][0]) / 2, (S.quad[2][1] + S.quad[3][1]) / 2]; return Math.hypot(far[0] - p.x, far[1] - p.y); };
          if (dist(m1) < dist(m2)) hi = m2; else lo = m1;
        }
        np.len = (lo + hi) / 2; resolve();
      }
    } else if (drag.kind === 'movePlane') {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      drag.root.corners = drag.corners.map(([x, y]) => [x + dx, y + dy]); planesTouched = true; resolve();
    } else if (drag.kind === 'newMarq') {
      const TT = T(marq.pid), uv = TT && toPlane(TT.S, TT.plane, p.x, p.y);
      if (uv) {
        const [eu0, ev0, eu1, ev1] = TT.plane.ext, cl = (v, a, b) => Math.max(a, Math.min(b, v));
        let u = cl(uv.u, eu0, eu1), v = cl(uv.v, ev0, ev1);
        if (ev.shiftKey) { const { su, sv } = planeScale(TT.S, TT.plane); const du = (u - drag.uv0.u) * su, dv = (v - drag.uv0.v) * sv, m = Math.max(Math.abs(du), Math.abs(dv)); u = drag.uv0.u + Math.sign(du || 1) * m / su; v = drag.uv0.v + Math.sign(dv || 1) * m / sv; }
        marq.r = { u0: Math.min(drag.uv0.u, u), v0: Math.min(drag.uv0.v, v), u1: Math.max(drag.uv0.u, u), v1: Math.max(drag.uv0.v, v) };
      }
    } else if (drag.kind === 'moveMarq') {
      
      let TT = T(marq.pid), uv = TT && toPlane(TT.S, TT.plane, p.x, p.y);
      const other = planeAt(planes, solved, p.x, p.y);
      if (marq.float && other && other.plane.id !== marq.pid && !drag.moveSrc) {
        const { su, sv } = planeScale(TT.S, TT.plane), b = planeScale(other.S, other.plane);
        const hu = (marq.r.u1 - marq.r.u0) / 2 * su / b.su, hv = (marq.r.v1 - marq.r.v0) / 2 * sv / b.sv;
        marq.pid = other.plane.id; marq.r = { u0: other.u - hu, v0: other.v - hv, u1: other.u + hu, v1: other.v + hv };
        drag.uv0 = { u: other.u, v: other.v }; drag.r0 = { ...marq.r }; rerenderFloat(); return;
      }
      if (uv) {
        let du = uv.u - drag.uv0.u, dv = uv.v - drag.uv0.v;
        if (ev.shiftKey) { if (Math.abs(du) > Math.abs(dv)) dv = 0; else du = 0; }
        if (drag.moveSrc) { const s = drag.src0; marq.float.source.r = { u0: s.u0 + du, v0: s.v0 + dv, u1: s.u1 + du, v1: s.v1 + dv }; }
        else marq.r = { u0: drag.r0.u0 + du, v0: drag.r0.v0 + dv, u1: drag.r0.u1 + du, v1: drag.r0.v1 + dv };
        if (marq.float) { rerenderFloat(); return; }
      }
    } else if (drag.kind === 'fillSrc') {
      const TT = T(marq.pid), uv = TT && toPlane(TT.S, TT.plane, p.x, p.y);
      if (uv) { fillFromSource([uv.u - drag.uv0.u, uv.v - drag.uv0.v]); return; }
    } else if (drag.kind === 'scale') {
      const TT = T(marq.pid), uv = toPlane(TT.S, TT.plane, p.x, p.y); if (!uv) return;
      const r0 = drag.r0, cu = (r0.u0 + r0.u1) / 2, cv = (r0.v0 + r0.v1) / 2, rot = marq.rot || 0;
      const du = uv.u - cu, dv = uv.v - cv, a = du * Math.cos(rot) + dv * Math.sin(rot), b = -du * Math.sin(rot) + dv * Math.cos(rot);
      let hu = Math.max(1e-3, Math.abs(a)), hv = Math.max(1e-3, Math.abs(b));
      if (ev.shiftKey) { const k = Math.max(hu / ((r0.u1 - r0.u0) / 2), hv / ((r0.v1 - r0.v0) / 2)); hu = (r0.u1 - r0.u0) / 2 * k; hv = (r0.v1 - r0.v0) / 2 * k; }
      marq.r = { u0: cu - hu, v0: cv - hv, u1: cu + hu, v1: cv + hv }; rerenderFloat(); return;
    } else if (drag.kind === 'rotate') {
      const TT = T(marq.pid), uv = toPlane(TT.S, TT.plane, p.x, p.y); if (!uv) return;
      const cu = (marq.r.u0 + marq.r.u1) / 2, cv = (marq.r.v0 + marq.r.v1) / 2;
      let r = drag.rot0 + Math.atan2(uv.v - cv, uv.u - cu) - drag.a0; if (ev.shiftKey) r = Math.round(r / (Math.PI / 12)) * Math.PI / 12;
      marq.rot = r; rerenderFloat(); return;
    } else if (drag.kind === 'paint') {
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y, dist = Math.hypot(dx, dy);
      const hit = planeAt(planes, solved, p.x, p.y);
      let step = 3;
      if (hit) { const { su } = planeScale(hit.S, hit.plane); const d = (ws.tool === 'stamp' ? opt.diameter : opt.bDiameter); const loc = planeScale({ H: hit.S.H }, { ext: [hit.u - 0.01, hit.v - 0.01, hit.u + 0.01, hit.v + 0.01] }); step = Math.max(1, d * 0.2 * loc.su / Math.max(su, 1e-6)); }
      if (dist >= step) { const n = Math.ceil(dist / step); for (let k = 1; k <= n; k++) dab(drag.last.x + dx * k / n, drag.last.y + dy * k / n); drag.last = p; }
    } else if (drag.kind === 'measure') {
      const TT = T(measure.pid), uv = TT && toPlane(TT.S, TT.plane, p.x, p.y); if (uv) measure.b = { u: uv.u, v: uv.v }; syncBar();
    }
    ws.draw();
  };
  ws.onUp = () => {
    if (drag && drag.kind === 'newMarq' && marq && (Math.abs(marq.r.u1 - marq.r.u0) < 1e-4 || Math.abs(marq.r.v1 - marq.r.v0) < 1e-4)) marq = null;
    if (drag && drag.kind === 'child') { planesTouched = true; renderPlaneList(); syncBar(); }
    if (drag && (drag.kind === 'corner' || drag.kind === 'edge' || drag.kind === 'angle' || drag.kind === 'movePlane')) { renderPlaneList(); }
    drag = null; ws.draw();
  };
  ws.onLeave = () => { cursor = null; ws.draw(); };
  function measureText() {
    const TT = T(measure.pid); if (!TT) return '';
    const { su, sv } = planeScale(TT.S, TT.plane);
    const du = (measure.b.u - measure.a.u) * su, dv = (measure.b.v - measure.a.v) * sv;
    return `长度：${Math.hypot(du, dv).toFixed(1)} 像素（按平面比例）  角度：${(Math.atan2(-dv, du) * 180 / Math.PI).toFixed(1)}°`;
  }

  
  const onKey = ev => {
    if (ev.type !== 'keydown') return false;
    if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return false;
    const k = ev.key.toLowerCase(), mod = ev.metaKey || ev.ctrlKey;
    if (mod && k === 'z') { const from = ev.shiftKey ? redo : undo, to = ev.shiftKey ? undo : redo; if (from.length) { to.push(snap()); restore(from.pop()); } return true; }
    if (mod && k === 'v') { pasteClip(); return true; }
    if (mod && k === 'd') { if (marq) { pushUndo(); dropFloat(); marq = null; ws.draw(); } return true; }
    if (mod) return false;
    if ((ev.key === 'Backspace' || ev.key === 'Delete')) {
      if (ws.tool === 'create' && createPts.length) { createPts.pop(); syncBar(); ws.draw(); return true; }
      if (ws.tool === 'edit' || ws.tool === 'create') { deletePlane(); return true; }
    }
    const setD = f => { if (ws.tool === 'stamp') opt.diameter = Math.max(1, Math.min(2000, Math.round(f(opt.diameter)))); else if (ws.tool === 'brush') opt.bDiameter = Math.max(1, Math.min(2000, Math.round(f(opt.bDiameter)))); syncBar(); ws.draw(); };
    if (k === '[') { setD(v => v * 0.85); return true; }
    if (k === ']') { setD(v => v * 1.18 + 1); return true; }
    return false;
  };
  ws.dlg.addEventListener('keydown', ev => { if (onKey(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);

  
  ws.redraw = (c) => {
    const { scale, tx, ty } = ws;
    c.save(); c.translate(tx, ty); c.scale(scale, scale);
    drawChecker(c, 0, 0, w, h);
    c.imageSmoothingEnabled = scale < 1; c.drawImage(imgCv, 0, 0);
    c.restore();
    const S2 = (x, y) => [tx + x * scale, ty + y * scale];
    const poly = (pts, close = true) => { c.beginPath(); pts.forEach((q, i) => { const [X, Y] = S2(q[0], q[1]); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); if (close) c.closePath(); };
    if (opt.showEdges) for (const p of planes) {
      const S = solved.get(p.id); if (!S || !S.quad) continue;
      const sel = p.id === selPlane;
      if (S.valid) {
        c.strokeStyle = 'rgba(80,160,255,.55)'; c.lineWidth = 1; c.beginPath();
        for (const [x0, y0, x1, y1] of gridLines(p, S, p.grid || opt.grid)) { const a = S2(x0, y0), b = S2(x1, y1); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
        c.stroke();
      }
      poly(S.quad); c.strokeStyle = S.valid ? (sel ? '#3d9bff' : '#2f7fe0') : '#ff3b30'; c.lineWidth = sel ? 2 : 1.5; c.stroke();
      if (sel && (ws.tool === 'edit' || ws.tool === 'create')) {
        c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1;
        const node = q => { const [X, Y] = S2(q[0], q[1]); c.fillRect(X - 3.5, Y - 3.5, 7, 7); c.strokeRect(X - 3.5, Y - 3.5, 7, 7); };
        if (p.kind === 'root') S.quad.forEach(node);
        if (S.valid) for (const [e] of EDGES) { const m = midOfEdge(p, S, e); if (m) node(m); }
      }
    }
    if (createPts.length) {
      c.strokeStyle = '#3d9bff'; c.lineWidth = 1.5; poly(cursor ? [...createPts, [cursor.x, cursor.y]] : createPts, false); c.stroke();
      c.fillStyle = '#fff'; for (const q of createPts) { const [X, Y] = S2(q[0], q[1]); c.fillRect(X - 3, Y - 3, 6, 6); }
    }
    if (marq) {
      const TT = T(marq.pid);
      if (TT) {
        const q = regionQuad(TT.S, marq.r, marq.rot || 0);
        c.lineWidth = 1; c.setLineDash([4, 4]); c.strokeStyle = '#000'; poly(q); c.stroke(); c.lineDashOffset = 4; c.strokeStyle = '#fff'; poly(q); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
        if (marq.float && marq.float.source.kind === 'plane') { const ST = T(marq.float.source.pid); if (ST) { c.strokeStyle = 'rgba(255,200,0,.8)'; c.setLineDash([2, 3]); poly(regionQuad(ST.S, marq.float.source.r)); c.stroke(); c.setLineDash([]); } }
        if (ws.tool === 'transform' && marq.float) { c.fillStyle = '#fff'; c.strokeStyle = '#000'; for (const k of q) { const [X, Y] = S2(k[0], k[1]); c.fillRect(X - 4, Y - 4, 8, 8); c.strokeRect(X - 4, Y - 4, 8, 8); } }
      }
      if (drag && drag.srcQuad) { c.strokeStyle = 'rgba(255,200,0,.9)'; c.setLineDash([2, 3]); poly(drag.srcQuad); c.stroke(); c.setLineDash([]); }
    }
    if (measure) { const TT = T(measure.pid); if (TT) { const a = apply3(TT.S.H, measure.a.u, measure.a.v), b = apply3(TT.S.H, measure.b.u, measure.b.v); c.strokeStyle = '#ffeb3b'; c.lineWidth = 1.5; poly([a, b], false); c.stroke(); } }
    if (stampSrc && ws.tool === 'stamp') {
      const TT = T(stampSrc.pid);
      let q = TT && apply3(TT.S.H, stampSrc.u, stampSrc.v);
      if (TT && drag && drag.kind === 'paint' && stampOffset && cursor) { const hit = planeAt(planes, solved, cursor.x, cursor.y); const HT = hit && { plane: hit.plane, S: hit.S }; const f = HT && effStampSrc(HT); const s = f && f(hit.u, hit.v); if (s) q = s; }
      if (q) { const [X, Y] = S2(q[0], q[1]); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X - 8, Y); c.lineTo(X + 8, Y); c.moveTo(X, Y - 8); c.lineTo(X, Y + 8); c.stroke(); c.beginPath(); c.arc(X, Y, 5, 0, Math.PI * 2); c.stroke(); }
    }
    if (cursor && (ws.tool === 'stamp' || ws.tool === 'brush')) {
      const hit = planeAt(planes, solved, cursor.x, cursor.y);
      const d = ws.tool === 'stamp' ? opt.diameter : opt.bDiameter;
      if (hit) {
        const { su, sv } = planeScale(hit.S, hit.plane), ru = d / 2 / su, rv = d / 2 / sv, pts = [];
        for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; const q = apply3(hit.S.H, hit.u + Math.cos(a) * ru, hit.v + Math.sin(a) * rv); pts.push(q); }
        c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 2.5; poly(pts); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1; poly(pts); c.stroke();
      } else { const [X, Y] = S2(cursor.x, cursor.y); c.strokeStyle = '#f33'; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, 6, 0, Math.PI * 2); c.moveTo(X - 4, Y - 4); c.lineTo(X + 4, Y + 4); c.stroke(); }
    }
  };

  ws.open();
  ws.setTool(planes.length ? 'edit' : 'create');
  renderPlaneList(); syncBar();
  
  ws.dlg.__vp = {
    get planes() { return JSON.parse(JSON.stringify(planes)); }, get solved() { return Object.fromEntries([...solved].map(([k, v]) => [k, { valid: v.valid, quad: v.quad, f: v.f }])); },
    get marq() { return marq && JSON.parse(JSON.stringify({ ...marq, float: marq.float ? { source: { kind: marq.float.source.kind } } : null })); },
    get opt() { return { ...opt }; }, setOpt(o) { Object.assign(opt, o); syncBar(); },
    toScreen: (x, y) => { const r = ws.mid.getBoundingClientRect(), s = ws.toScreen(x, y); return { x: r.left + s.x, y: r.top + s.y }; },
    get touched() { return pixelsTouched; }, pixel(x, y) { const o = (y * w + x) * 4; return [...img.subarray(o, o + 4)]; },
    ws,
  };
  void orig; void quadConvex;
  return ws.done;
}
