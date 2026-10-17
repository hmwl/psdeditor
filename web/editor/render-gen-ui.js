








import { createWorkspace, mk, section, slider, select, check, color, button, row, okCancel, rgbToHex, drawChecker, rgbaCanvas } from './fx-workspace.js';
import { renderFlame, renderFrame, renderTree, FLAME_TYPES, FLAME_DEFAULTS, FRAME_TYPES, FRAME_DEFAULTS, FLOWER_TYPES, LEAF_TYPES, TREE_SPECIES, TREE_DEFAULTS, flattenPaths } from '../../core/render-gen.js';

const TITLE = { flame: '火焰', pictureFrame: '图片框', tree: '树' };

export function openRenderGen({ kind, w, h, backdrop, paths, bounds, fg }) {
  const ws = createWorkspace({ title: TITLE[kind], tools: [], width: w, height: h, hand: false, zoom: false, rightWidth: 300 });
  const P = kind === 'flame' ? { ...FLAME_DEFAULTS } : kind === 'pictureFrame' ? { ...FRAME_DEFAULTS } : { ...TREE_DEFAULTS, alongPath: !!(paths && paths.length) };
  if (kind === 'flame' && fg) { P.color = rgbToHex(fg); }
  const bgCv = backdrop ? rgbaCanvas(backdrop, w, h) : null;
  const out = mk('canvas', { width: w, height: h }), octx = out.getContext('2d');
  let timer = 0, page = 'basic';
  function render() {
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, w, h);
    try {
      if (kind === 'flame') renderFlame(octx, paths, P);
      else if (kind === 'pictureFrame') renderFrame(octx, bounds || { x: 0, y: 0, w, h }, P);
      else renderTree(octx, w, h, P, treeSpots());
      ws.setStatus('');
    } catch (e) { ws.setStatus('生成失败：' + (e && e.message || e)); }
    ws.draw();
  }
  function treeSpots() {
    const base = bounds || { x: 0, y: 0, w, h };
    if (P.alongPath && paths && paths.length) {
      
      const spots = []; for (const sp of paths) for (const k of sp.knots || []) spots.push({ x: k.anchor[0], y: k.anchor[1], h: base.h * 0.55 });
      if (spots.length) return spots;
    }
    return [{ x: base.x + base.w / 2, y: base.y + base.h * 0.97, h: base.h * 0.85 }];
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 30); };
  const set = key => v => { P[key] = v; schedule(); };

  
  const tabs = row(ws.right); const body = mk('div', {}, 'display:flex;flex-direction:column;gap:6px'); ws.right.append(body);
  const tb = {}; for (const [id, t] of [['basic', '基本'], ['advanced', '高级']]) { tb[id] = button(tabs, t, () => { page = id; build(); }); }
  function build() {
    for (const k in tb) tb[k].classList.toggle('primary', k === page);
    body.textContent = '';
    const B = body;
    if (kind === 'flame') {
      if (page === 'basic') {
        select(B, '火焰类型：', P.type, FLAME_TYPES, set('type'), { labelW: 72 });
        slider(B, '长度：', P.length, 1, 1000, 1, set('length'), { labelW: 72 });
        check(B, '随机化长度', P.randomLength, set('randomLength'));
        slider(B, '宽度：', P.width, 1, 400, 1, set('width'), { labelW: 72 });
        slider(B, '角度：', P.angle, -180, 180, 1, set('angle'), { labelW: 72, unit: '°' });
        slider(B, '时间间隔：', P.interval, 2, 400, 1, set('interval'), { labelW: 72 });
        check(B, '为火焰使用自定颜色', P.customColor, set('customColor'));
        color(B, '颜色：', P.color, set('color'));
        select(B, '品质：', P.quality, [['draft', '草图（快）'], ['low', '低'], ['medium', '中'], ['high', '高'], ['fine', '精细（慢）']], set('quality'), { labelW: 72 });
      } else {
        slider(B, '湍流：', P.turbulence, 0, 100, 1, set('turbulence'), { labelW: 72 });
        slider(B, '锯齿：', P.jaggedness, 0, 100, 1, set('jaggedness'), { labelW: 72 });
        slider(B, '不透明度：', P.opacity, 1, 100, 1, set('opacity'), { labelW: 72, unit: '%' });
        slider(B, '火焰线条（复杂性）：', P.lines, 1, 60, 1, set('lines'), { labelW: 120 });
        slider(B, '火焰底部对齐：', P.bottomAlign, 0, 100, 1, set('bottomAlign'), { labelW: 96 });
        select(B, '火焰样式：', P.style, [['normal', '普通'], ['violent', '猛烈'], ['flat', '扁平']], set('style'), { labelW: 72 });
        select(B, '火焰形状：', P.shape, [['parallel', '平行'], ['converge', '集中'], ['diverge', '分散'], ['oval', '椭圆'], ['directional', '定向']], set('shape'), { labelW: 72 });
        check(B, '按长度调整间隔（在路径上均匀排开）', P.adjustInterval, set('adjustInterval'));
        seedRow(B);
      }
    } else if (kind === 'pictureFrame') {
      if (page === 'basic') {
        select(B, '图案：', P.type, FRAME_TYPES, set('type'), { labelW: 72 });
        color(B, '藤蔓颜色：', P.vineColor, set('vineColor'));
        slider(B, '边距：', P.margin, 0, 300, 1, set('margin'), { labelW: 72 });
        slider(B, '大小：', P.size, 0, 100, 1, set('size'), { labelW: 72 });
        slider(B, '排列：', P.arrange, 0, 100, 1, set('arrange'), { labelW: 72 });
        select(B, '花：', P.flower, FLOWER_TYPES, set('flower'), { labelW: 72 });
        color(B, '花颜色：', P.flowerColor, set('flowerColor'));
        slider(B, '花的大小：', P.flowerSize, 0, 100, 1, set('flowerSize'), { labelW: 72 });
        select(B, '叶子：', P.leaf, LEAF_TYPES, set('leaf'), { labelW: 72 });
        color(B, '叶子颜色：', P.leafColor, set('leafColor'));
        slider(B, '叶子大小：', P.leafSize, 0, 100, 1, set('leafSize'), { labelW: 72 });
      } else {
        slider(B, '行数：', P.lines, 1, 20, 1, set('lines'), { labelW: 72 });
        slider(B, '粗细：', P.thickness, 0.5, 40, 0.5, set('thickness'), { labelW: 72 });
        slider(B, '角度：', P.angle, 0, 90, 1, set('angle'), { labelW: 72, unit: '°' });
        slider(B, '淡化：', P.fade, 0, 100, 1, set('fade'), { labelW: 72, unit: '%' });
        seedRow(B);
      }
      B.append(mk('div', { textContent: bounds ? '相框沿选区的外框生成。' : '相框沿画布边缘生成（有选区时沿选区外框）。' }, 'opacity:.65'));
    } else {
      if (page === 'basic') {
        select(B, '基本树类型：', P.species, TREE_SPECIES.map(s => [s[0], s[1]]), set('species'), { labelW: 80 });
        slider(B, '光照方向：', P.light, 0, 180, 1, set('light'), { labelW: 80, unit: '°' });
        slider(B, '叶子数量：', P.leafAmount, 0, 100, 1, set('leafAmount'), { labelW: 80 });
        slider(B, '叶子大小：', P.leafSize, 0, 200, 1, set('leafSize'), { labelW: 80 });
        slider(B, '树枝高度：', P.branchHeight, 50, 300, 1, set('branchHeight'), { labelW: 80, unit: '%' });
        slider(B, '树枝粗细：', P.branchThick, 50, 500, 1, set('branchThick'), { labelW: 80, unit: '%' });
        const lt = select(B, '叶子类型：', P.leafType, LEAF_TYPES.filter(l => l[0] !== 'none'), set('leafType'), { labelW: 80 });
        check(B, '默认叶子（用树种自带的叶型）', P.defaultLeaves, v => { P.defaultLeaves = v; lt.sel.disabled = v; schedule(); }); lt.sel.disabled = P.defaultLeaves;
        seedRow(B);
        if (paths && paths.length) check(B, '沿路径种树（每个锚点一棵）', P.alongPath, set('alongPath'));
      } else {
        slider(B, '摄像机倾斜：', P.tilt, 0, 100, 1, set('tilt'), { labelW: 80 });
        check(B, '使用叶子的自定颜色', P.customLeafColor, set('customLeafColor'));
        color(B, '叶子颜色：', P.leafColor, set('leafColor'));
        check(B, '使用树枝的自定颜色', P.customBranchColor, set('customBranchColor'));
        color(B, '树枝颜色：', P.branchColor, set('branchColor'));
        check(B, '平面 - 阴影', P.flatShade, set('flatShade'));
        slider(B, '增加叶子对比度：', P.leafContrast, 0, 100, 1, set('leafContrast'), { labelW: 104 });
        slider(B, '排列：', P.arrange, 0, 100, 1, set('arrange'), { labelW: 80 });
      }
    }
  }
  function seedRow(B) {
    const r = row(B);
    r.append(mk('span', { textContent: '随机形状：' }, 'min-width:72px'));
    const n = mk('input', { type: 'number', min: 0, max: 999999, value: P.seed }, 'width:80px'); n.onchange = () => { P.seed = +n.value || 0; schedule(); };
    const b = mk('button', { type: 'button', textContent: '随机化' }); b.onclick = () => { P.seed = Math.floor(Math.random() * 999999); n.value = P.seed; schedule(); };
    r.append(n, b);
  }
  build();
  okCancel(ws, () => {
    render();
    ws.finish(octx.getImageData(0, 0, w, h).data);
  });
  ws.redraw = c => {
    const { scale, tx, ty } = ws;
    c.save(); c.translate(tx, ty); c.scale(scale, scale);
    drawChecker(c, 0, 0, w, h);
    if (bgCv) { c.globalAlpha = 0.55; c.drawImage(bgCv, 0, 0); c.globalAlpha = 1; }
    c.drawImage(out, 0, 0);
    c.restore();
    if (kind === 'flame' && paths) {
      c.strokeStyle = 'rgba(80,160,255,.6)'; c.lineWidth = 1; c.setLineDash([4, 4]);
      for (const poly of flattenPaths(paths, 4)) { c.beginPath(); poly.forEach((q, i) => { const X = tx + q.x * scale, Y = ty + q.y * scale; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke(); }
      c.setLineDash([]);
    }
  };
  ws.open();
  render();
  ws.dlg.__rg = { params: P, render, set(o) { Object.assign(P, o); build(); render(); } };
  return ws.done;
}
