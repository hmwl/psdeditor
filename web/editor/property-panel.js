
export function propertyPixelField(control) {
  const field = document.createElement('span'); field.className = 'prop-pixel-field';
  const unit = document.createElement('span'); unit.className = 'pp-unit'; unit.textContent = '像素';
  field.append(control, unit); return field;
}

export function isShapeLayer(layer) {
  return !!(layer && !layer.isSmartObject && !layer.text && layer.vectorMask
    && (layer.adjustment?.kind === 'fill' || layer.fill || layer.vectorStroke));
}

export function propertyContext(layer, { smartSource = null } = {}) {
  if (!layer) return { kind: 'document', label: '文档', icon: 'file' };
  if (layer.isFrame || layer.frame) return { kind: 'frame', label: '图框', icon: 'layer-frame-badge' };
  if (layer.isGroup || layer.groupType === 1 || layer.groupType === 2)
    return { kind: 'group', label: '无属性', icon: 'folder' };
  if (layer.isSmartObject) {
    const source = smartSource || layer.sourceImage;
    const linked = !!(layer.smartObjectLinked || layer.linked || layer.isLinkedSmartObject
      || source?.linked || source?.embedded === false);
    return { kind: 'smart', label: linked ? '链接的智能对象' : '嵌入的智能对象', icon: 'layer-smart', linked };
  }
  if (layer.text) return { kind: 'text', label: '文字图层', icon: 'layer-text' };
  if (isShapeLayer(layer)) return { kind: 'shape', label: '形状属性', icon: 'layer-vector' };
  if (layer.adjustment) return { kind: layer.adjustment.kind === 'fill' ? 'fill' : 'adjust',
    label: layer.adjustment.label || '调整', icon: 'layer-adjust' };
  return { kind: 'pixel', label: '像素图层', icon: 'layer-bitmap' };
}


export function pathBounds(subpaths) {
  const xs = [], ys = [];
  const cubic = (p, t) => { const v = 1 - t; return v*v*v*p[0] + 3*v*v*t*p[1] + 3*v*t*t*p[2] + t*t*t*p[3]; };
  for (const sub of subpaths || []) {
    const knots = sub.knots;
    for (const knot of knots) { xs.push(knot.anchor[0]); ys.push(knot.anchor[1]); }
    for (let i = 0; i < (sub.closed ? knots.length : knots.length - 1); i++) {
      const a = knots[i], b = knots[(i + 1) % knots.length];
      for (let dim = 0; dim < 2; dim++) {
        const p = [a.anchor[dim], (a.out || a.anchor)[dim], (b.in || b.anchor)[dim], b.anchor[dim]];
        const A = -p[0] + 3*p[1] - 3*p[2] + p[3], B = 2*(p[0] - 2*p[1] + p[2]), C = p[1] - p[0];
        const discriminant = B*B - 4*A*C;
        const roots = Math.abs(A) < 1e-12 ? (Math.abs(B) < 1e-12 ? [] : [-C/B])
          : discriminant < 0 ? [] : [(-B + Math.sqrt(discriminant))/(2*A), (-B - Math.sqrt(discriminant))/(2*A)];
        for (const t of roots) if (t > 0 && t < 1) (dim ? ys : xs).push(cubic(p, t));
      }
    }
  }
  if (!xs.length) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}


const SECTION_KEY = 'psd_editor.props.sections';
const sectionState = (() => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(SECTION_KEY) || '{}'))); } catch { return new Map(); } })();
function saveSections() { try { localStorage.setItem(SECTION_KEY, JSON.stringify(Object.fromEntries(sectionState))); } catch {} }
const titles = { transform: '变换', align: '对齐和分布', appearance: '外观', character: '字符',
  paragraph: '段落', content: '文字内容', runs: '多段文字样式', smart: '智能对象',
  filters: '智能滤镜', mask: '蒙版', path: '路径', style: '图层样式', adjust: '调整',
  layer: '混合选项', flags: '图层选项', quick: '快速操作', diagnostics: '更多信息',
  artboard: '画板', 'artboard-bg': '画板背景颜色',
  canvas: '画布', rulers: '标尺和网格', guides: '参考线', 'mask-main': '蒙版', 'mask-refine': '调整', 'mask-path': '矢量蒙版路径',
  group: '组', 'frame-bounds': '边框', 'frame-stroke': '描边', 'smart-link': '链接的智能对象', 'smart-extra': '内容与变形' };


export function organizeProperties(box, context) {
  const groups = new Map();
  const standalone = [];
  for (const el of [...box.children]) {
    if (el.classList.contains('prop-no-properties')) { standalone.push(el); continue; }
    const pane = el.dataset.propPane || 'layer';
    let section = el.dataset.propSection || pane;
    if (el.classList.contains('empty') || el.classList.contains('psec')) { el.remove(); continue; }
    if (el.classList.contains('hintline')) section = 'diagnostics';
    if (context.kind === 'shape' && el.querySelector('[data-attr^="stroke-"]')) section = 'appearance';
    const key = section === 'appearance' ? section : pane + ':' + section;
    if (!groups.has(key)) {
      const group = document.createElement('details');
      group.className = 'prop-section'; group.dataset.propPane = pane; group.dataset.section = section;
      group.dataset.sourcePanes = pane;
      const primary = section === 'transform' || section === 'align' || section === 'quick'
        || (context.kind === 'text' && ['character', 'paragraph', 'content', 'runs'].includes(section))
        || (context.kind === 'smart' && section === 'smart')
        || (context.kind === 'shape' && section === 'appearance')
        || (['fill', 'adjust'].includes(context.kind) && section === 'adjust')
        || (context.kind === 'group' && section === 'layer')
        || context.kind === 'artboard' || context.kind === 'frame';
      group.dataset.primary = String(primary);
      const stateKey = context.kind + ':' + key;
      group.open = sectionState.get(stateKey) ?? !['diagnostics', 'content', 'runs', 'flags', 'filters', 'smart-extra'].includes(section);
      group.addEventListener('toggle', () => { sectionState.set(stateKey, group.open); saveSections(); });
      const summary = document.createElement('summary'); summary.textContent = titles[section] || section;
      summary.addEventListener('keydown', e => {
        if (!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === ' ' || e.key === 'Enter')) e.stopPropagation();
      });
      
      summary.addEventListener('click', e => { if (e.target.closest('button')) return; sectionState.set(stateKey, !group.open); saveSections(); });
      group.append(summary); groups.set(key, group);
    }
    const group = groups.get(key);
    group.dataset.sourcePanes = [...new Set([...group.dataset.sourcePanes.split(' '), pane])].join(' ');
    el.hidden = false; group.append(el);
  }
  const order = ['canvas', 'rulers', 'guides', 'mask-main', 'mask-refine', 'mask-path', 'group', 'artboard', 'artboard-bg', 'frame-bounds', 'frame-stroke', 'transform', 'appearance', 'character', 'paragraph', 'adjust', 'smart', 'smart-link', 'align', 'quick',
    'content', 'runs', 'mask', 'path', 'filters', 'smart-extra', 'style', 'layer', 'flags', 'diagnostics'];
  const appearance = groups.get('appearance');
  if (appearance) [...appearance.children].filter(el => el.tagName !== 'SUMMARY')
    .sort((a, b) => Number(b.dataset.propPane === 'adjust') - Number(a.dataset.propPane === 'adjust'))
    .forEach(el => appearance.append(el));
  [...groups.values()].sort((a, b) => order.indexOf(a.dataset.section) - order.indexOf(b.dataset.section))
    .forEach(group => box.append(group));
  standalone.forEach(el => box.prepend(el));
  box.dataset.context = context.kind;
}
