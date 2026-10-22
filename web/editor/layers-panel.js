












import { actions } from './actions.js';
import { shortcuts } from './shortcuts.js';
import { panels } from './panels.js';
import { uiIcon } from './icons.js';

const LS_KEY = 'psd_editor.layersPanel.opts';
export const THUMB_SIZES = { none: 20, small: 22, medium: 32, large: 64 };
const DEFAULTS = { thumbSize: 'medium', thumbContent: 'document', defaultMask: true, showMaskBadges: true, expandNewFx: true, addCopy: true, anim: 'auto' };
export const LABEL_COLORS = { 0: '', 1: '#933839', 2: '#aa7136', 3: '#927c26', 4: '#3f6335', 5: '#566595', 6: '#5c4682', 7: '#5c5c5c' };
export const LABEL_NAMES = ['无颜色', '红色', '橙色', '黄色', '绿色', '蓝色', '紫色', '灰色'];
const FILTER_KINDS = [['kind', '类型'], ['name', '名称'], ['effect', '效果'], ['mode', '模式'], ['attr', '属性'], ['color', '颜色'], ['smart', '智能对象'], ['selected', '选定'], ['artboard', '画板']];
const KIND_BTNS = [['pixel', 'layer-bitmap', '像素图层滤镜'], ['adjust', 'layer-adjust', '调整图层滤镜'], ['text', 'layer-text', '文字图层滤镜'], ['shape', 'layer-vector', '形状图层滤镜'], ['smart', 'layer-smart', '智能对象滤镜']];
const FX_NAMES = ['斜面和浮雕', '描边', '内阴影', '内发光', '光泽', '颜色叠加', '渐变叠加', '图案叠加', '外发光', '投影'];
const ATTRS = [['visible', '可见'], ['locked', '锁定'], ['empty', '空'], ['linked', '链接的'], ['clipped', '已剪切'], ['mask', '图层蒙版'], ['vmask', '矢量蒙版'], ['fx', '图层效果'], ['adv', '高级混合'],
  ['-visible', '不可见'], ['-locked', '未锁定'], ['-empty', '非空'], ['-linked', '未链接'], ['-clipped', '未剪切'], ['-mask', '无图层蒙版'], ['-vmask', '无矢量蒙版'], ['-fx', '无图层效果'], ['-adv', '无高级混合']];
const SO_BTNS = [['ok', '最新的链接智能对象', 'so-filter-uptodate'], ['differs', '已修改的链接智能对象', 'so-filter-differs'],
  ['missing', '缺失的链接智能对象', 'so-filter-missing'], ['embedded', '嵌入的智能对象', 'so-filter-embedded']];

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };

export function installLayersPanel(C) {
  
  const opts = { ...DEFAULTS };
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (v && typeof v === 'object') for (const k of Object.keys(DEFAULTS)) if (typeof v[k] === typeof DEFAULTS[k]) opts[k] = v[k]; } catch {}
  if (!THUMB_SIZES[opts.thumbSize]) opts.thumbSize = 'medium';
  if (!['bounds', 'document'].includes(opts.thumbContent)) opts.thumbContent = 'document';
  const saveOpts = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(opts)); } catch {} };
  function applyThumbOpts(rerender = true) {
    const list = document.getElementById('layerList');
    if (list) {
      for (const k of Object.keys(THUMB_SIZES)) list.classList.toggle('lp-ts-' + k, opts.thumbSize === k);
      list.classList.toggle('lp-anim-show', opts.anim === 'show');
    }
    document.documentElement.dataset.lpAnim = opts.anim || 'auto';   
    C.setThumbBox(THUMB_SIZES[opts.thumbSize] || 32);
    if (rerender) C.ui.renderLayerPanel();
  }
  function setOpt(patch) { Object.assign(opts, patch); saveOpts(); applyThumbOpts(); }

  const st = C.st;
  const hasLayer = () => { const s = st(); return !!s.doc && !s.li && s.selLayer >= 0 && !!(s.layerTree && s.layerTree.flat[s.selLayer]); };
  const L = i => { const s = st(); return s.layerTree && s.layerTree.flat ? s.layerTree.flat[i] : null; };
  const nameOf = i => C.layerName(i);
  const note = t => C.status(t);

  
  const sc = id => { try { return shortcuts.labelFor(id) || ''; } catch { return ''; } };
  const A = (label, id, extra = {}) => ({ label, sc: sc(id), disabled: !actions.enabled(id), why: actions.enabled(id) ? '' : (actions.why(id) || ''), run: () => actions.run(id), ...extra });
  const F = (label, run, ok = true, extra = {}) => ({ label, run, disabled: !ok, ...extra });
  const isGroupSel = () => { const l = hasLayer() && L(st().selLayer); return !!(l && (l.isGroup || l.groupType === 1 || l.groupType === 2)); };
  const mergeLabel = () => { const s = st(); return s.selLayers.size >= 2 ? '合并图层' : isGroupSel() ? '合并组' : '向下合并'; };
  const clipLabel = () => { const s = st(), l = hasLayer() && L(s.selLayer); return l && C.effClipping(s.selLayer, l) ? '释放剪贴蒙版' : '创建剪贴蒙版'; };
  const linkLabel = () => { let v = null; try { v = C.dynLabel('linkLayers'); } catch {} return v || '链接图层'; };

  function panelMenu() {
    const grp = isGroupSel();
    const anim = k => F({ auto: '自动', show: '总是显示', hide: '总是隐藏' }[k], () => { setOpt({ anim: k }); }, true, { checked: opts.anim === k });
    return [
      F('新建图层…', () => newLayerDialog(), C.inPreview(), { sc: sc('layer.new') }),
      A('复制 CSS', 'layer.copyCss'), A('复制 SVG', 'layer.copySvg'),
      F(grp ? '复制组…' : '复制图层…', () => duplicateDialog(), hasLayer()),
      F(grp ? '删除组' : '删除图层', () => deleteWithConfirm(false), actions.enabled('layer.delete')),
      A('删除隐藏图层', 'layer.deleteHidden'),
      { sep: true },
      A('快速导出为 PNG', 'layer.quickExportPng'), A('导出为…', 'layer.exportAs'),
      { sep: true },
      F('新建组…', () => newGroupDialog(false), C.inPreview()),
      F('从图层新建组…', () => newGroupDialog(true), hasLayer()),
      F('折叠所有组', () => collapseAll(), C.inPreview() && groupIds().length > 0),
      { sep: true },
      A('从图层新建画板…', 'layer.artboardFromLayers'), A('来自图层的画框…', 'layer.frameFromLayers'), A('转换为图框', 'layer.convertToFrame'),
      { sep: true },
      A('锁定图层…', 'layer.lock'),
      { sep: true },
      A('转换为智能对象', 'layer.smart.convert'), A('编辑内容', 'layer.smart.editContents'),
      { sep: true },
      A('混合选项…', 'layer.style.blendingOptions'), A('编辑调整…', 'layer.editAdjustment'),
      { sep: true },
      A(clipLabel(), 'layer.clippingMask'),
      { sep: true },
      A(linkLabel(), 'layer.link'), A('选择链接图层', 'layer.selectLinked'),
      { sep: true },
      A(mergeLabel(), 'layer.merge'), A('合并可见图层', 'layer.mergeVisible'), A('拼合图像', 'layer.flatten'),
      { sep: true },
      { label: '动画选项', sub: [anim('auto'), anim('show'), anim('hide')] },
      F('面板选项…', () => panelOptionsDialog()),
    ];
  }
  panels.setPanelMenu('layers', panelMenu);

  
  const selAdj = () => { const l = hasLayer() && L(st().selLayer); return !!(l && l.adjustment); };
  C.R('layer.editAdjustment', () => { C.ui.showProps(st().selLayer); }, selAdj, { why: () => '选中的不是调整 / 填充图层' });
  C.R('layer.convertToFrame', () => actions.run('layer.frameFromLayers'), () => actions.enabled('layer.frameFromLayers'),
    { why: () => actions.why('layer.frameFromLayers') || '先选中一个像素图层' });
  C.R('select.findLayers', () => { filt.on = true; filt.kind = 'name'; buildFilterBar(); C.ui.renderLayerPanel(); const i = document.querySelector('.layer-filter .lpf-name'); if (i) { i.focus(); i.select(); } }, C.inPreview);

  
  const blendOptions = (group) => [...(group ? [['pass', C.blendLabels.pass || '穿透']] : []), ...C.blendKeys.map(k => [k, C.blendLabels[k] || k])];
  const colorOptions = LABEL_NAMES.map((n, i) => [String(i), n]);
  
  async function newLayerDialog() {
    if (!C.inPreview()) return false;
    const v = await C.dialogs.formDialog('新建图层', [
      { key: 'name', label: '名称(N):', type: 'text', value: C.nextLayerName() },
      { key: 'clip', label: '使用前一图层创建剪贴蒙版(P)', type: 'check', value: false },
      { key: 'color', label: '颜色(C):', type: 'select', value: '0', options: colorOptions },
      { key: 'mode', label: '模式(M):', type: 'select', value: 'norm', options: blendOptions(false) },
      { key: 'opacity', label: '不透明度(O):', value: 100, min: 0, max: 100, unit: '%' },
    ]);
    if (!v) return false;
    await C.createLayer({ name: String(v.name || '').trim() || C.nextLayerName(), opacity: +v.opacity, mode: v.mode });
    const i = st().selLayer;
    if (i < 0) return false;
    if (v.clip && i > 0) C.setClipping(i, true);
    if (+v.color) C.setColorLabel(i, +v.color, true);
    C.ui.renderLayerPanel();
    return true;
  }
  
  async function newGroupDialog(fromLayers) {
    if (!C.inPreview()) return false;
    const n = groupIds().length + 1;
    const v = await C.dialogs.formDialog(fromLayers ? '从图层新建组' : '新建组', [
      { key: 'name', label: '名称(N):', type: 'text', value: '组 ' + n },
      { key: 'color', label: '颜色(C):', type: 'select', value: '0', options: colorOptions },
      { key: 'mode', label: '模式(M):', type: 'select', value: 'pass', options: blendOptions(true) },
      { key: 'opacity', label: '不透明度(O):', value: 100, min: 0, max: 100, unit: '%' },
    ]);
    if (!v) return false;
    if (fromLayers) await C.groupFromLayers(); else await C.newGroup();
    const i = st().selLayer, l = L(i);
    if (!l || !(l.isGroup || l.groupType === 1 || l.groupType === 2)) return false;
    C.pushDocHistory('组属性');
    const nm = String(v.name || '').trim(); if (nm) C.rename(i, nm);
    if (v.mode !== 'pass') C.setBlend(i, v.mode);
    if (+v.opacity !== 100) C.setOpacity(i, Math.round(+v.opacity * 2.55));
    if (+v.color) C.setColorLabel(i, +v.color, false);
    C.ui.refresh();
    return true;
  }
  async function duplicateDialog() {
    if (!hasLayer()) return false;
    return C.duplicateDialog();
  }
  
  const LS_NOASK = 'psd_editor.layersPanel.noAskDelete';
  async function deleteWithConfirm(skip) {
    if (!actions.enabled('layer.delete')) return false;
    let noAsk = false; try { noAsk = localStorage.getItem(LS_NOASK) === '1'; } catch {}
    if (!skip && !noAsk) {
      const s = st(), picks = s.selLayers.size > 1 ? [...s.selLayers] : [s.selLayer];
      const what = picks.length > 1 ? `这 ${picks.length} 个图层` : `${isGroupSel() ? '组' : '图层'}“${nameOf(s.selLayer)}”`;
      const v = await C.dialogs.formDialog('Adobe Photoshop', [{ key: 'no', label: '不再显示', type: 'check', value: false }],
        { msg: `要删除${what}吗？`, okText: '是', cancelText: '否' });
      if (!v) return false;
      if (v.no) try { localStorage.setItem(LS_NOASK, '1'); } catch {}
    }
    return actions.run('layer.delete');
  }

  
  function panelOptionsDialog() {
    const d = mk('dialog', { className: 'fp-dlg lp-opts' });
    const f = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
    f.append(mk('h3', { className: 'fp-dlg-title', textContent: '图层面板选项' }));
    const size = mk('fieldset', { className: 'lp-opt-set' }, mk('legend', { textContent: '缩览图大小' }));
    const sizes = mk('div', { className: 'lp-size-row' });
    for (const [k, lab] of [['none', '无'], ['small', '小'], ['medium', '中'], ['large', '大']]) {
      const px = { none: 0, small: 16, medium: 26, large: 40 }[k];
      const pv = mk('span', { className: 'lp-size-pv' });
      if (px) { pv.style.width = px + 'px'; pv.style.height = px + 'px'; } else pv.classList.add('none');
      const r = mk('input', { type: 'radio', name: 'lpSize', value: k, checked: opts.thumbSize === k });
      sizes.append(mk('label', { className: 'lp-size' }, pv, mk('span', {}, r, ' ' + lab)));
    }
    size.append(sizes);
    const cont = mk('fieldset', { className: 'lp-opt-set' }, mk('legend', { textContent: '缩览图内容' }));
    for (const [k, lab] of [['bounds', '图层边界'], ['document', '整个文档']])
      cont.append(mk('label', { className: 'lp-row' }, mk('input', { type: 'radio', name: 'lpCont', value: k, checked: opts.thumbContent === k }), ' ' + lab));
    const chk = (key, lab) => mk('label', { className: 'lp-row' }, mk('input', { type: 'checkbox', name: key, checked: !!opts[key] }), ' ' + lab);
    const misc = mk('div', { className: 'lp-opt-misc' },
      chk('defaultMask', '在填充图层上使用默认蒙版'), chk('showMaskBadges', '显示图层蒙版标记'), chk('expandNewFx', '扩展新效果'), chk('addCopy', '将“拷贝”添加到拷贝的图层和组'));
    const btns = mk('div', { className: 'fp-dlg-btns' });
    const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: '取消' });
    const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '确定' });
    btns.append(cancel, ok);
    f.append(size, cont, misc, btns); d.append(f);
    document.body.append(d);
    const close = () => { try { d.close(); } catch {} d.remove(); };
    cancel.onclick = close;
    d.oncancel = e => { e.preventDefault(); close(); };
    ok.onclick = () => {
      setOpt({
        thumbSize: (f.querySelector('input[name=lpSize]:checked') || {}).value || opts.thumbSize,
        thumbContent: (f.querySelector('input[name=lpCont]:checked') || {}).value || opts.thumbContent,
        defaultMask: f.querySelector('input[name=defaultMask]').checked,
        showMaskBadges: f.querySelector('input[name=showMaskBadges]').checked,
        expandNewFx: f.querySelector('input[name=expandNewFx]').checked,
        addCopy: f.querySelector('input[name=addCopy]').checked,
      });
      close();
    };
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
    return d;
  }

  
  function groupIds() { const s = st(); if (!s.doc || !s.layerTree) return []; const v = C.view(); return Object.values(v.nodes).filter(n => n.group).map(n => n.index); }
  function collapseAll() { const cg = C.collapsedGroups(); for (const i of groupIds()) cg.add(i); C.ui.renderLayerPanel(); }
  
  function toggleGroupDeep(idx) {
    const cg = C.collapsedGroups(), v = C.view(), n = v.nodes[idx];
    if (!n || !n.group) return;
    const open = cg.has(idx);
    const ids = (n.block ? n.block.ids : [idx]).filter(k => v.nodes[k] && v.nodes[k].group);
    for (const k of ids) { if (open) cg.delete(k); else cg.add(k); }
    C.ui.renderLayerPanel();
  }

  
  const filt = { on: true, kind: 'kind', kinds: new Set(), name: '', effect: '', mode: '', attr: '', color: '', smart: new Set() };
  const filterBusy = () => {
    if (!filt.on) return false;
    switch (filt.kind) {
      case 'kind': return filt.kinds.size > 0;
      case 'name': return !!filt.name.trim();
      case 'effect': case 'mode': case 'attr': case 'color': return filt[filt.kind] !== '';
      case 'smart': return filt.smart.size > 0;
      case 'selected': case 'artboard': return true;
    }
    return false;
  };
  function layerKind(i, l) {
    if (!l || l.isGroup || l.groupType != null) return 'group';
    if (l.isSmartObject) return 'smart';
    if (l.text) return 'text';
    if (C.isShapeLayer(i)) return 'shape';
    if (l.adjustment) return 'adjust';
    return 'pixel';
  }
  function attrOf(key, i, l) {
    const s = st(), dl = s.doc && s.doc.layers[i];
    switch (key) {
      case 'visible': { const e = s.layerEdits[i]; return e && e.visible != null ? !!e.visible : !(dl && dl.hidden); }
      case 'locked': return ['lockAll', 'lockTransparency', 'lockComposite', 'lockPosition', 'lockNesting'].some((f, k) => C.effLock(i, l, f, ['all', 'transparency', 'composite', 'position', 'nesting'][k]));
      case 'empty': return layerKind(i, l) === 'pixel' && !(dl && dl.rgba && dl.width > 0 && dl.height > 0);
      case 'linked': try { return C.linkedOf(i).length > 0; } catch { return false; }
      case 'clipped': return C.effClipping(i, l);
      case 'mask': return !!((dl && dl.mask) || l.mask || C.hasPendingMask(i));
      case 'vmask': return !!(l.vectorMask && !C.isShapeLayer(i));
      case 'fx': return C.fxItems(i, l).length > 0;
      case 'adv': return !!(C.effKnockout(i, l) || (l.blendingRanges && l.blendingRanges.custom) || l.blendClippedElements === false || l.blendInteriorElements === true);
    }
    return false;
  }
  function soState(i) {
    const lx = C.LX(); if (!lx || !lx.test) return null;
    const k = lx.test.soIndexOf(i); if (k < 0) return null;
    if (!lx.test.isExternal(k)) return 'embedded';
    
    const status = lx.test.linkStatus(k) || 'ok';
    return status === 'modified' ? 'differs' : status;
  }
  
  function filterFn(view) {
    if (!filterBusy()) return null;
    const s = st();
    if (filt.kind === 'selected') {
      const sel = new Set(s.selLayers.size ? [...s.selLayers] : s.selLayer >= 0 ? [s.selLayer] : []);
      return idx => sel.has(idx);
    }
    if (filt.kind === 'artboard') {
      const abs = new Set((C.artboards() || []).map(a => a.index));
      const inAb = i => { for (let p = i; p != null; p = view.nodes[p] && view.nodes[p].parent) if (abs.has(p)) return p; return null; };
      const cur = s.selLayer >= 0 ? inAb(s.selLayer) : null;
      return idx => cur != null ? inAb(idx) === cur : true;
    }
    return (idx, l) => {
      switch (filt.kind) {
        case 'kind': return filt.kinds.has(layerKind(idx, l));
        case 'name': return String(nameOf(idx)).toLowerCase().includes(filt.name.trim().toLowerCase());
        case 'effect': return C.fxItems(idx, l).some(e => e.label === filt.effect);
        case 'mode': { const e = s.layerEdits[idx]; const k = (e && e.blendKey) || l.blendKey || (l.isGroup ? 'pass' : 'norm'); return k === filt.mode; }
        case 'attr': { const neg = filt.attr.startsWith('-'); const v = attrOf(neg ? filt.attr.slice(1) : filt.attr, idx, l); return neg ? !v : v; }
        case 'color': return (C.effColorLabel(idx, l) | 0) === +filt.color;
        case 'smart': { const k = soState(idx); return !!k && filt.smart.has(k); }
      }
      return true;
    };
  }
  function buildFilterBar() {
    const bar = document.querySelector('#panelLayers .layer-filter'); if (!bar) return;
    bar.innerHTML = ''; bar.classList.add('lpf'); bar.dataset.filterKind = filt.kind;
    const kind = mk('select', { className: 'lpf-kind', title: '选取图层筛选类型' });
    for (const [k, lab] of FILTER_KINDS) kind.append(mk('option', { value: k, textContent: lab }));
    kind.setAttribute('aria-label', '图层筛选类型');
    kind.value = filt.kind;
    kind.onchange = () => { filt.kind = kind.value; buildFilterBar(); C.ui.renderLayerPanel(); };
    const ctl = mk('span', { className: 'lpf-ctl' });
    const rerender = () => { bar.classList.toggle('busy', filterBusy()); C.ui.renderLayerPanel(); };
    const sel = (list, key, ph) => {
      const e = mk('select', { className: 'lpf-sel' });
      e.append(mk('option', { value: '', textContent: ph }));
      for (const [v, lab] of list) e.append(mk('option', { value: v, textContent: lab }));
      e.value = filt[key]; e.onchange = () => { filt[key] = e.value; rerender(); };
      return e;
    };
    switch (filt.kind) {
      case 'kind':
        for (const [k, ic, tip] of KIND_BTNS) {
          const b = mk('button', { type: 'button', className: 'lpf-btn' + (filt.kinds.has(k) ? ' on' : ''), title: tip });
          b.dataset.kind = k; b.setAttribute('aria-pressed', String(filt.kinds.has(k)));
          b.append(uiIcon(ic.replace('layer-', 'layer-filter-'), 14));
          b.onclick = () => { if (filt.kinds.has(k)) filt.kinds.delete(k); else filt.kinds.add(k); b.classList.toggle('on', filt.kinds.has(k)); b.setAttribute('aria-pressed', String(filt.kinds.has(k))); rerender(); };
          ctl.append(b);
        }
        break;
      case 'name': {
        const i = mk('input', { type: 'text', className: 'lpf-name', id: 'layerFilter', placeholder: '按名称筛选图层', value: filt.name });
        i.oninput = () => { filt.name = i.value; rerender(); };
        ctl.append(i); break;
      }
      case 'effect': ctl.append(sel(FX_NAMES.map(n => [n, n]), 'effect', '选择效果')); break;
      case 'mode': ctl.append(sel(C.blendKeys.concat(['pass']).map(k => [k, C.blendLabels[k] || k]), 'mode', '选择模式')); break;
      case 'attr': ctl.append(sel(ATTRS, 'attr', '选择属性')); break;
      case 'color': ctl.append(sel(LABEL_NAMES.map((n, i) => [String(i), n]), 'color', '选择颜色')); break;
      case 'smart':
        for (const [k, tip, ic] of SO_BTNS) {
          const b = mk('button', { type: 'button', className: 'lpf-btn lpf-so-' + k + (filt.smart.has(k) ? ' on' : ''), title: tip });
          b.dataset.so = k; b.append(uiIcon(ic, 14));
          b.onclick = () => { if (filt.smart.has(k)) filt.smart.delete(k); else filt.smart.add(k); b.classList.toggle('on', filt.smart.has(k)); rerender(); };
          ctl.append(b);
        }
        break;
      case 'selected': ctl.append(mk('span', { className: 'lpf-note', textContent: '只列出选中的图层' })); break;
      case 'artboard': ctl.append(mk('span', { className: 'lpf-note', textContent: '只列出所选画板里的图层' })); break;
    }
    const tog = mk('button', { type: 'button', className: 'lpf-toggle' + (filt.on ? ' on' : ''), title: filt.on ? '关闭图层过滤' : '打开图层过滤' });
    tog.setAttribute('role', 'switch'); tog.setAttribute('aria-checked', String(filt.on)); tog.setAttribute('aria-label', '图层过滤');
    tog.onclick = () => { filt.on = !filt.on; buildFilterBar(); C.ui.renderLayerPanel(); };
    const kindField = mk('span', { className: 'lpf-kind-field' }, kind,
      mk('span', { className: 'lpf-search' }, uiIcon('layer-filter-search', 12)));
    bar.append(kindField, ctl, tog);
    bar.classList.toggle('off', !filt.on);
    bar.classList.toggle('busy', filterBusy());
  }

  
  const popAt = (items, e) => panels.popup(items, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true });
  const colorItems = idx => {
    const l = L(idx), cur = l ? C.effColorLabel(idx, l) | 0 : 0;
    return LABEL_NAMES.map((n, c) => ({ label: n, checked: cur === c, run: () => setColorForTargets(c) }));
  };
  function setColorForTargets(c) {
    const s = st(); const t = s.selLayers.size > 1 ? [...s.selLayers] : [s.selLayer];
    C.pushDocHistory('图层颜色');
    for (const i of t) C.setColorLabel(i, c, false);
    C.ui.renderLayerPanel();
  }
  function rowMenu(idx) {
    const l = L(idx), s = st();
    const grp = !!(l && (l.isGroup || l.groupType === 1 || l.groupType === 2));
    const txt = C.isTextLayer(idx), so = !!(l && l.isSmartObject);
    const items = [
      A('混合选项…', 'layer.style.blendingOptions'),
      ...(l && l.adjustment ? [A('编辑调整…', 'layer.editAdjustment')] : []),
      { sep: true },
      A('复制 CSS', 'layer.copyCss'), A('复制 SVG', 'layer.copySvg'),
      F(grp ? '复制组…' : '复制图层…', () => duplicateDialog(), hasLayer()),
      F(grp ? '删除组' : '删除图层', () => actions.run('layer.delete'), actions.enabled('layer.delete')),
      ...(grp ? [F('从组取消编组', () => actions.run('layer.ungroup'), actions.enabled('layer.ungroup'))] : []),
      { sep: true },
      A('快速导出为 PNG', 'layer.quickExportPng'), A('导出为…', 'layer.exportAs'),
      { sep: true },
      A('来自图层的画板…', 'layer.artboardFromLayers'), A('来自图层的画框…', 'layer.frameFromLayers'), A('转换为图框', 'layer.convertToFrame'),
      { sep: true },
      A('转换为智能对象', 'layer.smart.convert'),
      ...(so ? [A('通过拷贝新建智能对象', 'layer.smart.newViaCopy'), A('编辑内容', 'layer.smart.editContents'), A('导出内容…', 'layer.smart.exportContents'),
        A('替换内容…', 'layer.smart.replaceContents'), A('转换为图层', 'layer.smart.convertToLayers')] : []),
      { sep: true },
      A(txt ? '栅格化文字' : '栅格化图层', txt ? 'type.rasterize' : 'layer.rasterize.layer'), A('栅格化图层样式', 'layer.rasterize.style'),
      { sep: true },
      ...(txt ? [A('创建工作路径', 'type.createWorkPath'), A('转换为形状', 'type.convertToShape'), { sep: true },
        A(C.textShapeLabel(idx), 'type.convertToParagraph'), A('文字变形…', 'type.warp'), { sep: true }] : []),
      A(C.maskOffLabel(idx), 'layer.mask.toggle'), A(C.vmaskOffLabel(idx), 'layer.vectorMask.toggle'),
      A(clipLabel(), 'layer.clippingMask'),
      { sep: true },
      A(linkLabel(), 'layer.link'), A('选择链接图层', 'layer.selectLinked'),
      { sep: true },
      A('拷贝图层样式', 'layer.style.copy'), A('粘贴图层样式', 'layer.style.paste'), A('清除图层样式', 'layer.style.clear'),
      { sep: true },
      ...(actions.has('layer.shape.copyProps') ? [A('拷贝形状属性', 'layer.shape.copyProps'), A('粘贴形状属性', 'layer.shape.pasteProps'), { sep: true }] : []),
      F(C.isolated() ? '从隔离图层释放' : '隔离图层', () => actions.run('select.isolateLayers'), actions.enabled('select.isolateLayers')),
      { sep: true },
      A(mergeLabel(), 'layer.merge'), A('合并可见图层', 'layer.mergeVisible'), A('拼合图像', 'layer.flatten'),
      { sep: true },
      ...colorItems(idx),
    ];
    return items.filter((it, k, a) => !(it.sep && (k === 0 || a[k - 1].sep)));
  }
  function thumbMenu(idx) {
    const canSel = C.canLoadLayerSelection(idx);
    const size = k => F({ none: '无缩览图', small: '小缩览图', medium: '中缩览图', large: '大缩览图' }[k], () => setOpt({ thumbSize: k }), true, { checked: opts.thumbSize === k });
    return [
      F('选择像素', () => C.loadLayerSel(idx, 'replace'), canSel),
      ...(L(idx) && L(idx).vectorMask ? [F('选择矢量蒙版', () => C.loadVectorSel(idx), true)] : []),
      { sep: true },
      size('none'), size('small'), size('medium'), size('large'),
      { sep: true },
      F('将缩览图剪切到图层边界', () => setOpt({ thumbContent: 'document' }), true, { checked: opts.thumbContent === 'bounds' }),
      F('将缩览图剪切到文档边界', () => setOpt({ thumbContent: 'document' }), true, { checked: opts.thumbContent === 'document' }),
    ];
  }
  function maskMenu(idx, vector) {
    if (vector) return [
      A(C.vmaskOffLabel(idx), 'layer.vectorMask.toggle'), A('删除矢量蒙版', 'layer.vectorMask.delete'), A('栅格化矢量蒙版', 'layer.rasterize.vectorMask'),
      { sep: true },
      F('添加矢量蒙版到选区', () => C.loadVectorSel(idx, 'add'), true),
      F('从选区中减去矢量蒙版', () => C.loadVectorSel(idx, 'subtract'), true),
      F('矢量蒙版与选区交叉', () => C.loadVectorSel(idx, 'intersect'), true),
    ];
    const g = () => C.maskGray(idx);
    const has = !!g();
    return [
      A(C.maskOffLabel(idx), 'layer.mask.toggle'), A('删除图层蒙版', 'layer.mask.delete'), A('应用图层蒙版', 'layer.mask.apply'),
      { sep: true },
      F('添加蒙版到选区', () => C.graySelection(g(), 'add', '添加蒙版到选区'), has),
      F('从选区中减去蒙版', () => C.graySelection(g(), 'subtract', '从选区中减去蒙版'), has),
      F('蒙版与选区交叉', () => C.graySelection(g(), 'intersect', '蒙版与选区交叉'), has),
      { sep: true },
      F('选择并遮住…', () => C.maskSelectAndMask(idx), has),
      { sep: true },
      F('蒙版选项…', () => maskOptionsDialog(), true),
    ];
  }
  function fxMenu(idx) {
    const l = L(idx), items = l ? C.fxItems(idx, l) : [];
    const master = C.fxMaster(idx);
    return [
      F(master ? '停用图层效果' : '启用图层效果', () => { C.pushDocHistory(master ? '停用图层效果' : '启用图层效果'); C.setFxMaster(idx, !master); }, items.length > 0),
      F('混合选项…', () => C.openStyle(idx, 'blend'), true),
      { sep: true },
      A('拷贝图层样式', 'layer.style.copy'), A('粘贴图层样式', 'layer.style.paste'), A('清除图层样式', 'layer.style.clear'),
      { sep: true },
      A('全局光…', 'layer.style.globalLight'), A('创建图层', 'layer.style.createLayers'), A(C.fxHideLabel(), 'layer.style.hideAll'), A('缩放效果…', 'layer.style.scale'),
    ];
  }
  
  function openRowMenu(e, idx) {
    const t = e.target && e.target.closest ? e.target : null;
    let items;
    if (t && t.closest('.maskthumb')) items = maskMenu(idx, t.closest('.maskthumb').dataset.maskKind === 'vector');
    else if (t && t.closest('.thumb') && !t.closest('.thumb.folder')) items = thumbMenu(idx);
    else if (t && t.closest('.ltag.fx, .fxopen')) items = fxMenu(idx);
    else items = rowMenu(idx);
    popAt(items, e);
    return true;
  }
  
  function onListContext(e) {
    const r = e.target && e.target.closest && e.target.closest('.lfx');
    if (!r) return;
    const idx = +r.dataset.layerIndex;
    if (!(idx >= 0)) return;
    e.preventDefault(); e.stopPropagation();
    if (st().selLayer !== idx) C.selectOnly(idx);
    popAt(r.dataset.attr && r.dataset.attr.startsWith('sf') ? [A('停用智能滤镜', 'layer.smartFilter.disable'), A('删除滤镜蒙版', 'layer.smartFilter.deleteMask'), A('清除智能滤镜', 'layer.smartFilter.clear')] : fxMenu(idx), e);
  }

  
  const LS_MASKOPT = 'psd_editor.layersPanel.maskOverlay';
  const maskOverlay = { color: [255, 0, 0], opacity: 50 };
  try { const v = JSON.parse(localStorage.getItem(LS_MASKOPT) || 'null'); if (v && Array.isArray(v.color)) { maskOverlay.color = v.color.slice(0, 3); maskOverlay.opacity = +v.opacity || 50; } } catch {}
  let maskView = null;                
  function setMaskView(idx, mode) {
    if (maskView && maskView.idx === idx && maskView.mode === mode) maskView = null;
    else maskView = { idx, mode };
    C.ui.renderPreviewOnly();
    note(maskView ? (mode === 'gray' ? '只看蒙版（⌥ 再点一次蒙版缩览图回到正常视图）' : '蒙版叠加显示（⇧⌥ 再点一次关闭）') : '回到正常视图');
  }
  async function maskOptionsDialog() {
    const hex = '#' + maskOverlay.color.map(v => v.toString(16).padStart(2, '0')).join('');
    const v = await C.dialogs.formDialog('图层蒙版显示选项', [
      { key: 'color', label: '颜色', type: 'color', value: hex },
      { key: 'opacity', label: '不透明度(O):', value: maskOverlay.opacity, min: 0, max: 100, unit: '%' },
    ]);
    if (!v) return;
    maskOverlay.color = [1, 3, 5].map(k => parseInt(String(v.color).slice(k, k + 2), 16) || 0);
    maskOverlay.opacity = Math.max(0, Math.min(100, +v.opacity | 0));
    try { localStorage.setItem(LS_MASKOPT, JSON.stringify(maskOverlay)); } catch {}
    if (maskView) C.ui.renderPreviewOnly();
  }
  
  function applyView(ctx) {
    if (!maskView) return false;
    const s = st();
    if (C.isPreviewCanvas && !C.isPreviewCanvas(ctx.canvas)) return false;    
    if (!s.doc || !s.doc.layers[maskView.idx]) { maskView = null; return false; }
    const g = C.maskGray(maskView.idx);
    if (!g) { maskView = null; return false; }
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (W !== s.docW || H !== s.docH) return false;
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    if (maskView.mode === 'gray') {
      for (let i = 0, o = 0; i < g.length; i++, o += 4) { d[o] = d[o + 1] = d[o + 2] = g[i]; d[o + 3] = 255; }
    } else {
      const [cr, cg, cb] = maskOverlay.color, k = maskOverlay.opacity / 100;
      for (let i = 0, o = 0; i < g.length; i++, o += 4) {
        const a = (255 - g[i]) / 255 * k; if (!a) continue;
        d[o] += (cr - d[o]) * a; d[o + 1] += (cg - d[o + 1]) * a; d[o + 2] += (cb - d[o + 2]) * a;
        d[o + 3] = Math.max(d[o + 3], Math.round(a * 255));
      }
    }
    ctx.putImageData(img, 0, 0);
    return maskView.mode === 'gray';
  }

  
  function onListClickCapture(e) {
    const t = e.target; if (!t || !t.closest) return;
    const row = t.closest('.lrow'); if (!row) return;
    const idx = +row.dataset.layerIndex; if (!(idx >= 0)) return;
    const mask = t.closest('.maskthumb');
    const mod = e.metaKey || e.ctrlKey;
    if (mask && (e.shiftKey || e.altKey || mod)) {
      e.stopPropagation(); e.preventDefault();
      const vector = mask.dataset.maskKind === 'vector';
      if (st().selLayer !== idx) C.selectOnly(idx);
      if (mod) {
        const mode = e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';
        if (vector) C.loadVectorSel(idx, mode); else C.graySelection(C.maskGray(idx), mode, '载入蒙版选区');
        return;
      }
      if (e.shiftKey && e.altKey) { if (!vector) setMaskView(idx, 'ruby'); return; }
      if (e.shiftKey) { actions.run(vector ? 'layer.vectorMask.toggle' : 'layer.mask.toggle'); C.ui.renderLayerPanel(); return; }
      if (e.altKey && !vector) { setMaskView(idx, 'gray'); return; }
      return;
    }
    const fold = t.closest('.thumb.folder');
    if (fold && e.altKey) { e.stopPropagation(); e.preventDefault(); toggleGroupDeep(idx); }
  }
  
  function onListDropCapture(e) {
    if (!e.altKey) return;
    const row = e.target && e.target.closest && e.target.closest('.lrow');
    const from = C.dragRow();
    if (!row || from < 0) return;
    const to = +row.dataset.layerIndex;
    if (!(to >= 0) || to === from) return;
    e.preventDefault(); e.stopPropagation();
    const after = row.dataset.dropAfter === '1', into = row.dataset.dropInto === '1';
    row.classList.remove('drop-target', 'drop-after', 'drop-into');
    const dup = C.duplicate(from);
    if (dup >= 0) C.moveLayerTo(dup, to, after, into);
  }
  function onListDragOverCapture(e) { if (e.altKey && C.dragRow() >= 0) { try { e.dataTransfer.dropEffect = 'copy'; } catch {} } }

  
  function wireFoot() {
    const nl = document.getElementById('newLayerBtn');
    if (nl) nl.addEventListener('click', e => { if (!e.altKey) return; e.stopImmediatePropagation(); e.preventDefault(); newLayerDialog(); }, true);
    const q = s => document.querySelector('#panelLayers .layer-foot ' + s);
    const grp = q('[data-action="layer.newGroup"]');
    if (grp) grp.addEventListener('click', e => { if (!e.altKey) return; e.stopImmediatePropagation(); e.preventDefault(); newGroupDialog(false); }, true);
    const del = q('[data-action="layer.delete"]');
    if (del) del.addEventListener('click', e => { e.stopImmediatePropagation(); e.preventDefault(); deleteWithConfirm(e.altKey); }, true);
    const msk = q('[data-action="layer.mask.revealAll"]');
    if (msk) msk.addEventListener('click', e => { if (!e.altKey) return; e.stopImmediatePropagation(); e.preventDefault(); actions.run('layer.mask.hideAll'); }, true);
    if (nl) nl.title = '创建新图层（⌥ 点：新建图层…对话框）';
    if (grp) grp.title = '创建新组（⌥ 点：新建组…对话框）';
    if (del) del.title = '删除图层（⌥ 点：不确认直接删除）';
    if (msk) msk.title = '添加图层蒙版（⌥ 点：隐藏全部）';
  }

  
  function wireScrub() {
    const pairs = [['#hdrOpacity', 'opacity'], ['#hdrFill', 'fill']];
    for (const [sel, kind] of pairs) {
      const inp = document.querySelector(sel); if (!inp) continue;

      inp.dataset.scrub = '1';
      inp.setAttribute('aria-label', kind === 'opacity' ? '不透明度' : '填充不透明度');
      let lab = inp.previousElementSibling;
      if (lab && lab.classList.contains('lc-label')) {
        lab.classList.add('lp-scrub');
        lab.title = (kind === 'opacity' ? '不透明度' : '填充') + '：按住左右拖动调整（PS 的擦洗滑块）';
        lab.addEventListener('pointerdown', e => {
          if (e.button !== 0 || inp.disabled) return;
          e.preventDefault();
          const x0 = e.clientX, v0 = +inp.value || 0; let moved = false;
          try { lab.setPointerCapture(e.pointerId); } catch {}
          const mv = ev => {
            const v = Math.max(0, Math.min(100, Math.round(v0 + (ev.clientX - x0) * (ev.shiftKey ? 1 : 0.5))));
            if (!moved) { moved = true; C.pushDocHistory(kind === 'opacity' ? '不透明度' : '填充不透明度'); }
            if (v !== +inp.value) { inp.value = v; C.liveValue(kind, v); }
          };
          const up = () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); lab.removeEventListener('pointercancel', up); if (moved) C.endLiveValue(kind); };
          lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); lab.addEventListener('pointercancel', up);
        });
      }
      const pct = inp.nextElementSibling;
      if (pct && pct.classList.contains('lc-pct') && !inp.parentElement.classList.contains('lc-percent-field')) {
        const field = mk('span', { className: 'lc-percent-field' });
        inp.before(field); field.append(inp, pct);
        const b = mk('button', { type: 'button', className: 'lp-drop', title: '弹出滑块' });
        b.setAttribute('aria-expanded', 'false');
        b.append(uiIcon('chevron-down', 8));
        field.append(b);
        b.onclick = e => { e.stopPropagation(); if (b.getAttribute('aria-expanded') === 'true') closeSlider?.(); else if (!inp.disabled) sliderPop(inp, kind, b, e.detail === 0); };
      }
    }
  }
  let closeSlider = null;
  function sliderPop(inp, kind, anchor, keyboard) {
    if (closeSlider) closeSlider();
    const r = anchor.getBoundingClientRect();
    const pop = mk('div', { className: 'lp-slider-pop' });
    const rng = mk('input', { type: 'range', min: 0, max: 100, value: +inp.value || 0 });
    const thumb = uiIcon('layer-slider-thumb', 12);
    thumb.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    thumb.setAttribute('viewBox', '-1 -2 24 22');
    const path = thumb.querySelector('path');
    path.setAttribute('opacity', '1'); path.setAttribute('fill', '#e6e6e6');
    path.setAttribute('stroke', '#202020'); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linejoin', 'round');
    rng.style.setProperty('--lp-slider-thumb', `url("data:image/svg+xml,${encodeURIComponent(thumb.outerHTML)}")`);
    rng.setAttribute('aria-label', kind === 'opacity' ? '不透明度滑块' : '填充滑块');
    anchor.setAttribute('aria-expanded', 'true');
    pop.append(rng); document.body.append(pop);
    pop.style.left = Math.max(4, Math.min(innerWidth - 123, r.right - 112)) + 'px'; pop.style.top = (r.bottom + 3) + 'px';
    let moved = false;
    rng.oninput = () => { if (!moved) { moved = true; C.pushDocHistory(kind === 'opacity' ? '不透明度' : '填充不透明度'); } inp.value = rng.value; C.liveValue(kind, +rng.value); };
    const finish = () => { if (moved) { moved = false; C.endLiveValue(kind); } };
    const close = () => { removeEventListener('pointerdown', outside, true); removeEventListener('keydown', key, true); pop.remove(); anchor.setAttribute('aria-expanded', 'false'); closeSlider = null; finish(); };
    const outside = ev => { if (!pop.contains(ev.target) && !anchor.contains(ev.target)) close(); };
    const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); anchor.focus(); } };
    closeSlider = close;
    addEventListener('pointerdown', outside, true); addEventListener('keydown', key, true);
    rng.addEventListener('change', finish);
    if (keyboard) rng.focus();
  }

  
  function buildAnimRow() {
    const host = document.querySelector('#panelLayers .lock-row'); if (!host || document.querySelector('#panelLayers .lp-anim-row')) return;
    const row = mk('div', { className: 'layer-controls lp-anim-row' });
    row.append(mk('span', { className: 'lc-label', textContent: '统一:' }));
    for (const t of ['统一图层位置', '统一图层可见性', '统一图层样式']) {
      const b = mk('button', { type: 'button', className: 'lock-btn', title: t + ' —— 需要时间轴的帧动画；本编辑器没有时间轴，没有可统一的帧', disabled: true });
      b.append(uiIcon(t.includes('位置') ? 'lock-position' : t.includes('可见') ? 'eye' : 'fx', 14));
      row.append(b);
    }
    row.append(mk('span', { className: 'grow' }), mk('label', { className: 'lp-prop' }, mk('input', { type: 'checkbox', disabled: true }), ' 传播帧 1'));
    host.after(row);
  }

  
  buildFilterBar();
  
  wireFoot();
  wireScrub();
  const list = document.getElementById('layerList');
  if (list) {
    list.addEventListener('click', e => {
      if (e.button !== 0 || !hasLayer() || e.target.closest?.('.lrow, button, input, select, a')) return;
      actions.run('select.deselectLayers');
    });
    list.addEventListener('click', onListClickCapture, true);
    list.addEventListener('drop', onListDropCapture, true);
    list.addEventListener('dragover', onListDragOverCapture, true);
    list.addEventListener('contextmenu', onListContext, true);
  }
  applyThumbOpts(false);

  return {
    opts, filterFn, openRowMenu, applyView, panelMenu, panelOptionsDialog, newLayerDialog, newGroupDialog, deleteWithConfirm, setOpt,
    get filter() { return { on: filt.on, kind: filt.kind, kinds: [...filt.kinds], name: filt.name, effect: filt.effect, mode: filt.mode, attr: filt.attr, color: filt.color, smart: [...filt.smart] }; },
    setFilter(p) { if (p.kinds) filt.kinds = new Set(p.kinds); if (p.smart) filt.smart = new Set(p.smart); for (const k of ['on', 'kind', 'name', 'effect', 'mode', 'attr', 'color']) if (p[k] !== undefined) filt[k] = p[k]; buildFilterBar(); C.ui.renderLayerPanel(); },
    get maskView() { return maskView && { ...maskView }; }, setMaskView, toggleGroupDeep, collapseAll, maskMenu, thumbMenu, rowMenu, fxMenu,
  };
}
export default { installLayersPanel };
