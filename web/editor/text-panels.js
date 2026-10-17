











import { OT_FEATURES, cmapCodePoints } from '../../core/text-styles.js';

const LS_LANG = 'psd_editor.typeLanguage', LS_RECENT = 'psd_editor.glyphsRecent', LS_DEFAULT = 'psd_editor.defaultTextStyles';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {  } };
const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };


const CHAR_STYLE_KEYS = ['font', 'fontSize', 'color', 'bold', 'italic', 'underline', 'strikethrough', 'tracking', 'leading', 'hScale', 'vScale', 'baselineShift', 'caps', 'baseline',
  'ligatures', 'dligatures', 'otContextual', 'otSwash', 'otOldStyle', 'otStylistic', 'otTitling', 'otOrdinals', 'otFractions', 'tsume'];
const PARA_STYLE_KEYS = ['align', 'startIndent', 'endIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter', 'hyphenate', 'burasagari', 'kinsokuOrder', 'hanging', 'kinsokuSet', 'mojikumi',
  'everyLineComposer', 'wordSpacing', 'letterSpacing', 'glyphSpacing', 'autoLeading', 'hyphWordSize', 'hyphPre', 'hyphPost', 'hyphLimit', 'hyphZone'];   

const CHAR_BASE = { bold: false, italic: false, underline: false, strikethrough: false, tracking: 0, leading: null, hScale: 1, vScale: 1, baselineShift: 0, caps: 'none', baseline: 'normal',
  ligatures: true, dligatures: false, otContextual: true, otSwash: false, otOldStyle: false, otStylistic: false, otTitling: false, otOrdinals: false, otFractions: false, tsume: 0 };
const PARA_BASE = { align: 'left', startIndent: 0, endIndent: 0, firstLineIndent: 0, spaceBefore: 0, spaceAfter: 0, autoLeading: 1.2,
  wordSpacing: [0.8, 1, 1.33], letterSpacing: [0, 0, 0], glyphSpacing: [1, 1, 1] };

const same = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return (a == null) && (b == null);
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4;
  if (Array.isArray(a) && Array.isArray(b)) return a.length >= 3 && b.length >= 3 && [0, 1, 2].every(k => Math.abs(a[k] - b[k]) < 1 / 255);
  if (typeof a === 'object' && typeof b === 'object') return a.psName === b.psName;
  return false;
};
const hex = c => '#' + [0, 1, 2].map(k => Math.round(Math.max(0, Math.min(1, c[k])) * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(k => parseInt(String(h).slice(k, k + 2), 16) / 255).concat(1);

export function installTextPanels(ctx) {
  const { R, shell, panels } = ctx;
  let lang = lsGet(LS_LANG, 'default');
  if (!['default', 'eastAsian', 'middleEast'].includes(lang)) lang = 'default';

  
  const curAttrs = (keys) => {
    const i = ctx.selLayer(); const ti = ctx.isTextLayer(i) ? ctx.textInfoOf(i) : null;
    if (!ti) return null;
    const out = {};
    for (const k of keys) {
      if (k === 'font') { if (ti.font) out.font = { psName: ti.font }; continue; }
      if (k === 'bold' || k === 'italic') { out[k] = !!ti[k]; continue; }
      if (ti[k] !== undefined) out[k] = Array.isArray(ti[k]) ? ti[k].slice() : ti[k];
    }
    return out;
  };
  const differs = (attrs, keys) => {
    const cur = curAttrs(keys); if (!cur || !attrs) return false;
    return Object.entries(attrs).some(([k, v]) => !same(v, cur[k]));
  };
  
  async function applyStyle(kind, st, clear) {
    const i = ctx.selLayer(); if (!ctx.isTextLayer(i)) { shell.status('先选中一个文字图层（或在文字里选中几个字）'); return false; }
    const base = kind === 'char' ? CHAR_BASE : PARA_BASE;
    const patch = clear ? { ...base } : {};
    const attrs = st ? st.attrs : {};
    for (const [k, v] of Object.entries(attrs)) if (k !== 'font') patch[k] = v;
    patch[kind === 'char' ? 'charStyle' : 'paraStyle'] = st ? st.name : undefined;
    if (attrs.font && attrs.font.psName) await ctx.setFont(i, attrs.font.psName);
    await ctx.applyTextStyle(i, patch);
    return true;
  }
  const sheets = () => ctx.sheets();
  const listOf = kind => (sheets()[kind] || []);
  const uniqueName = (kind, base) => { const names = new Set(listOf(kind).map(s => s.name)); let n = 1; while (names.has(`${base} ${n}`)) n++; return `${base} ${n}`; };
  const commit = (kind, list, label) => { const s = sheets(); ctx.setSheets({ ...s, [kind]: list }, label); render(kind); };
  const selName = { char: null, para: null };
  const currentName = kind => { const i = ctx.selLayer(); const ti = ctx.isTextLayer(i) ? ctx.textInfoOf(i) : null; return ti ? (ti[kind === 'char' ? 'charStyle' : 'paraStyle'] || null) : null; };

  async function newStyle(kind, fromCurrent = true) {   
    const keys = kind === 'char' ? CHAR_STYLE_KEYS : PARA_STYLE_KEYS;
    const name = uniqueName(kind, kind === 'char' ? '字符样式' : '段落样式');
    const attrs = fromCurrent ? (curAttrs(keys) || {}) : {};
    commit(kind, [...listOf(kind), { name, attrs }], kind === 'char' ? '新建字符样式' : '新建段落样式');
    selName[kind] = name; render(kind);
    shell.status(`已新建「${name}」` + (fromCurrent && Object.keys(attrs).length ? '（按当前选中文字的属性）' : ''));
  }
  function redefine(kind) {
    const name = selName[kind] || currentName(kind); const list = listOf(kind);
    const k = list.findIndex(s => s.name === name); if (k < 0) { shell.status('先在列表里选中要重新定义的样式'); return; }
    const keys = kind === 'char' ? CHAR_STYLE_KEYS : PARA_STYLE_KEYS;
    const cur = curAttrs(keys) || {};
    const attrs = { ...list[k].attrs }; for (const kk of Object.keys(attrs)) if (cur[kk] !== undefined) attrs[kk] = cur[kk];
    if (!Object.keys(list[k].attrs).length) Object.assign(attrs, cur);
    const next = list.slice(); next[k] = { ...list[k], attrs };
    commit(kind, next, '重新定义样式');
    shell.status(`已通过合并覆盖重新定义「${name}」`);
  }
  function remove(kind) {
    const name = selName[kind]; const list = listOf(kind);
    if (!name || !list.some(s => s.name === name)) { shell.status('先在列表里选中要删除的样式'); return; }
    commit(kind, list.filter(s => s.name !== name), '删除样式'); selName[kind] = null; render(kind);
  }
  function duplicate(kind) {
    const name = selName[kind]; const list = listOf(kind); const st = list.find(s => s.name === name); if (!st) return;
    commit(kind, [...list, { name: name + ' 拷贝', attrs: JSON.parse(JSON.stringify(st.attrs)) }], '复制样式');
  }
  

  async function options(kind, name0) {
    const name = name0 || selName[kind]; const list = listOf(kind); const k = list.findIndex(s => s.name === name); if (k < 0) return;
    const a = list[k].attrs || {}, pt = ctx.ptFactor();
    const r = await styleOptionsDialog(kind, name, a, pt);
    if (!r) return;
    const nm = String(r.name || name).trim() || name;
    if (nm !== name && list.some(s => s.name === nm)) { shell.status(`已有名为「${nm}」的样式`); return; }
    const next = list.slice(); next[k] = { name: nm, attrs: r.attrs };
    selName[kind] = nm;
    commit(kind, next, '样式选项');
    if (r.preview !== false && currentName(kind) === name) applyStyle(kind, next[k], false).then(() => render(kind));
  }
  function styleOptionsDialog(kind, name, a, pt) {
    return new Promise(resolve => {
      const d = mk('dialog', { className: 'fp-dlg fp-form txs-opt' });
      const form = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
      const title = kind === 'char' ? '字符样式选项' : '段落样式选项';
      const nameIn = mk('input', { type: 'text', value: name }); nameIn.dataset.attr = 'txs-opt-name';
      const nav = mk('div', { className: 'txs-opt-nav' }), pages = mk('div', { className: 'txs-opt-pages' });
      const get = [];                                   
      const page = (label) => { const b = mk('button', { type: 'button', textContent: label }); const pg = mk('div', { className: 'txs-opt-page' }); b.onclick = () => { for (const x of nav.children) x.classList.toggle('on', x === b); for (const x of pages.children) x.hidden = x !== pg; }; nav.append(b); pages.append(pg); return pg; };
      const row = (pg, label, ...els) => { const r0 = mk('label', { className: 'txs-opt-row' }, mk('span', { textContent: label }), ...els); pg.append(r0); return r0; };
      const num = (pg, label, key, o = {}) => {
        const cur = a[key]; const x = mk('input', { type: 'number', step: o.step || 1, value: cur == null ? '' : o.show ? o.show(cur) : cur, placeholder: '—' }); x.dataset.attr = 'txs-opt-' + key; x.dataset.scrub = '1';
        row(pg, label, x, o.unit ? mk('span', { textContent: o.unit, className: 'u' }) : null);
        get.push(out => { if (x.value === '' || !isFinite(+x.value)) return; out[key] = o.parse ? o.parse(+x.value) : +x.value; });
      };
      const sel = (pg, label, key, opts, o = {}) => {
        const x = mk('select'); x.dataset.attr = 'txs-opt-' + key; x.append(new Option('—', '')); for (const [v, t] of opts) x.append(new Option(t, v));
        const cur = o.cur ? o.cur(a) : a[key]; x.value = cur === undefined || cur === null && !o.allowNull ? '' : String(cur);
        row(pg, label, x);
        get.push(out => { if (x.value === '') return; o.set ? o.set(out, x.value) : (out[key] = x.value); });
      };
      const tri = (pg, label, key, o = {}) => {   
        const x = mk('input', { type: 'checkbox' }); x.dataset.attr = 'txs-opt-' + key;
        const cur = o.cur ? o.cur(a) : a[key];
        if (cur === undefined) x.indeterminate = true; else x.checked = !!cur;
        x.onclick = () => { if (x.__was === 'off') { x.checked = false; x.indeterminate = true; x.__was = 'ind'; } else x.__was = x.checked ? 'on' : 'off'; };
        x.__was = x.indeterminate ? 'ind' : x.checked ? 'on' : 'off';
        pg.append(mk('label', { className: 'txs-opt-chk' }, x, mk('span', { textContent: label })));
        get.push(out => { if (x.indeterminate) return; o.set ? o.set(out, x.checked) : (out[key] = x.checked); });
      };
      const P = v => Math.round(v * pt * 100) / 100, U = v => v / pt;
      if (kind === 'char') {
        const g1 = page('基本字符格式');
        const font = mk('input', { type: 'text', value: a.font ? a.font.psName : '', placeholder: '—（不定义）' }); font.dataset.attr = 'txs-opt-font';
        row(g1, '字体（PostScript 名）：', font); get.push(out => { const v = font.value.trim(); if (v) out.font = { psName: v }; });
        num(g1, '大小：', 'fontSize', { unit: '点', step: 0.1, show: P, parse: U });
        sel(g1, '行距：', 'leading', [['auto', '(自动)'], ...[6, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72].map(n => [String(n), n + ' 点'])],
          { cur: x => x.leading === undefined ? undefined : x.leading === null ? 'auto' : String(P(x.leading)), set: (out, v) => { out.leading = v === 'auto' ? null : U(+v); } });
        sel(g1, '字距调整：', 'kern', [['metrics', '度量标准'], ['optical', '视觉'], ['0', '0']],
          { cur: x => x.autoKern === undefined && x.kernMode === undefined ? undefined : x.autoKern === false ? '0' : x.kernMode === 'optical' ? 'optical' : 'metrics',
            set: (out, v) => { if (v === '0') out.autoKern = false; else { out.autoKern = true; if (v === 'optical') out.kernMode = 'optical'; } } });
        num(g1, '字距：', 'tracking');
        sel(g1, '大小写：', 'caps', [['none', '正常'], ['all', '全部大写字母'], ['small', '小型大写字母']]);
        sel(g1, '位置：', 'baseline', [['normal', '正常'], ['superscript', '上标'], ['subscript', '下标']]);
        const col = mk('input', { type: 'color', value: a.color ? hex(a.color) : '#000000' }); col.dataset.attr = 'txs-opt-color';
        const useC = mk('input', { type: 'checkbox', checked: !!a.color }); useC.dataset.attr = 'txs-opt-usecolor';
        row(g1, '颜色：', useC, col); get.push(out => { if (useC.checked) out.color = unhex(col.value); });
        for (const [key, label] of [['bold', '仿粗体'], ['italic', '仿斜体'], ['underline', '下划线'], ['strikethrough', '删除线']]) tri(g1, label, key);
        const g2 = page('高级字符格式');
        num(g2, '垂直缩放：', 'vScale', { unit: '%', show: v => Math.round(v * 1000) / 10, parse: v => v / 100 });
        num(g2, '水平缩放：', 'hScale', { unit: '%', show: v => Math.round(v * 1000) / 10, parse: v => v / 100 });
        num(g2, '基线偏移：', 'baselineShift', { unit: '点', step: 0.1, show: P, parse: U });
        num(g2, '比例间距：', 'tsume', { unit: '%', show: v => Math.round(v * 100), parse: v => Math.max(0, Math.min(100, v)) / 100 });
        tri(g2, '无间断', 'noBreak');
        row(g2, '语言：', Object.assign(mk('select', { disabled: true, title: 'EngineData 的 Language 编号表未公开，写错会让 PS 的断字 / 拼写规则错乱 —— 不做' }), {})).querySelector('select').append(new Option('—'));
        const g3 = page('OpenType 功能');
        for (const [key, label] of OT_FEATURES) tri(g3, label, key);
      } else {
        const g1 = page('缩进和间距');
        sel(g1, '对齐：', 'align', [['left', '左对齐'], ['center', '居中对齐'], ['right', '右对齐'], ['justify', '最后一行左对齐'], ['justifyCenter', '最后一行居中对齐'], ['justifyRight', '最后一行右对齐'], ['justifyAll', '全部对齐']]);
        for (const [key, label] of [['startIndent', '左缩进：'], ['firstLineIndent', '首行缩进：'], ['endIndent', '右缩进：'], ['spaceBefore', '段前间距：'], ['spaceAfter', '段后间距：']]) num(g1, label, key, { unit: '点', step: 0.1, show: P, parse: U });
        const g2 = page('排版');
        sel(g2, '避头尾法则设置：', 'kinsokuSet', [['none', '无'], ['hard', 'JIS 严格'], ['soft', 'JIS 宽松']]);
        sel(g2, '避头尾法则类型：', 'kinsokuOrder', [['0', '先推入'], ['1', '先推出'], ['2', '只推出']], { set: (out, v) => { out.kinsokuOrder = +v; } });
        sel(g2, '间距组合设置：', 'mojikumi', [['none', '无'], ['1', '间距组合 1'], ['2', '间距组合 2'], ['3', '间距组合 3'], ['4', '间距组合 4']]);
        sel(g2, '书写器：', 'everyLineComposer', [['false', 'Adobe 单行书写器'], ['true', 'Adobe 多行书写器']], { set: (out, v) => { out.everyLineComposer = v === 'true'; } });
        tri(g2, '罗马式溢出标点', 'hanging'); tri(g2, '标点溢出', 'burasagari');
        const g3 = page('对齐');
        const trip = (label, key, lo, hi) => {
          const cur = a[key]; const ins = [0, 1, 2].map(i => { const x = mk('input', { type: 'number', value: cur ? Math.round(cur[i] * 1000) / 10 : '', placeholder: '—' }); x.dataset.attr = `txs-opt-${key}-${i}`; x.dataset.scrub = '1'; return x; });
          row(g3, label, ...ins, mk('span', { textContent: '%', className: 'u' }));
          get.push(out => { if (ins.some(x => x.value === '')) return; const v = ins.map(x => Math.max(lo, Math.min(hi, +x.value)) / 100); if (v[0] <= v[1] && v[1] <= v[2]) out[key] = v; });
        };
        g3.append(mk('div', { className: 'txs-opt-hint', textContent: '最小值 / 所需值 / 最大值' }));
        trip('字间距：', 'wordSpacing', 0, 1000); trip('字母间距：', 'letterSpacing', -100, 500); trip('字形缩放：', 'glyphSpacing', 50, 200);
        num(g3, '自动行距：', 'autoLeading', { unit: '%', show: v => Math.round(v * 1000) / 10, parse: v => Math.max(0, v) / 100 });
        const g4 = page('连字');
        tri(g4, '连字', 'hyphenate');
        num(g4, '单词长度超过：', 'hyphWordSize', { unit: '字母' }); num(g4, '断开前：', 'hyphPre', { unit: '字母' }); num(g4, '断开后：', 'hyphPost', { unit: '字母' });
        num(g4, '连字符限制：', 'hyphLimit', { unit: '连字符' }); num(g4, '连字区：', 'hyphZone', { unit: '点', step: 0.1, show: P, parse: U });
        pages.append(mk('div', { className: 'txs-opt-hint', textContent: '段落样式写进 EngineData 的 ParagraphSheetSet；经典 EngineData 的段落样式表不带字符格式（PS 新式 Txt2 才有），所以这里只列段落这几页。' }));
      }
      const prev = mk('input', { type: 'checkbox', checked: true }); prev.dataset.attr = 'txs-opt-preview';
      form.append(mk('h3', { className: 'fp-dlg-title', textContent: title }), mk('label', { className: 'txs-opt-row name' }, mk('span', { textContent: '样式名称：' }), nameIn),
        mk('div', { className: 'txs-opt-body' }, nav, pages));
      const btns = mk('div', { className: 'fp-dlg-btns' });
      const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: '取消' }), ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '确定' });
      btns.append(mk('label', { className: 'txs-opt-chk', style: 'margin-right:auto', title: '确定后把改动立即套到正在使用这个样式的选中文字上' }, prev, mk('span', { textContent: '预览' })), cancel, ok);
      form.append(btns); d.append(form); document.body.append(d);
      nav.firstChild.click();
      let done = false;
      const fin = v => { if (done) return; done = true; try { d.close(); } catch { d.removeAttribute('open'); } d.remove(); resolve(v); };
      ok.onclick = () => { const out = {}; for (const f of get) f(out); fin({ name: nameIn.value, attrs: out, preview: prev.checked }); };
      cancel.onclick = () => fin(null);
      d.addEventListener('cancel', e => { e.preventDefault(); fin(null); });
      d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); ok.onclick(); } });
      try { d.showModal(); } catch { d.setAttribute('open', ''); }
    });
  }

  
  function loadFromFile(kind) {
    const inp = mk('input', { type: 'file', accept: '.psd,.psb' });
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        const got = await ctx.readSheetsFromFile(f);
        if (!got) { shell.status('那个文件里没有文字图层（样式表存在文字图层的 EngineData 里）'); return; }
        const src = kind === 'char' ? got.char : got.para;
        const m = new Map(listOf(kind).map(x => [x.name, x])); for (const x of src || []) m.set(x.name, x);
        commit(kind, [...m.values()], kind === 'char' ? '载入字符样式' : '载入段落样式');
        shell.status(`已从「${f.name}」载入 ${(src || []).length} 个${kind === 'char' ? '字符' : '段落'}样式`);
      } catch (e) { shell.status('载入样式失败：' + (e && e.message || e)); }
    };
    inp.click();
  }

  
  const PANEL = { char: 'characterStyles', para: 'paragraphStyles' };
  function render(kind) {
    const sec = panels.sectionOf(PANEL[kind]); if (!sec) return;
    const list = listOf(kind), cur = currentName(kind);
    const keys = kind === 'char' ? CHAR_STYLE_KEYS : PARA_STYLE_KEYS;
    sec.textContent = '';
    const box = mk('div', { className: 'txs-panel' });
    const ul = mk('div', { className: 'txs-list' });
    const rowOf = (name, st) => {
      const isBase = st == null;
      const on = isBase ? !cur : cur === name;
      const over = on && ctx.isTextLayer(ctx.selLayer()) && differs(isBase ? {} : st.attrs, keys);
      const r = mk('div', { className: 'txs-row' + (on ? ' cur' : '') + ((selName[kind] || null) === (isBase ? null : name) ? ' on' : ''), textContent: name + (over ? '+' : '') });
      r.title = isBase ? (kind === 'char' ? '「无」：不套字符样式（单击 = 移除选中文字的字符样式）' : '「基本段落」：默认段落样式') : '单击：应用到选中的字 / 整层；双击：样式选项…';
      r.onclick = e => { selName[kind] = isBase ? null : name; applyStyle(kind, st, e.altKey).then(() => render(kind)); };
      r.ondblclick = () => { if (!isBase) options(kind, name); };   
      r.oncontextmenu = e => { e.preventDefault(); selName[kind] = isBase ? null : name; render(kind); if (isBase) return;
        panels.popup([{ label: '重新定义样式', run: () => redefine(kind) }, { label: '复制样式', run: () => duplicate(kind) }, { label: '删除样式', run: () => remove(kind) },
          { sep: true }, { label: '样式选项…', run: () => options(kind, name) }], { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); };
      return r;
    };
    ul.append(rowOf(kind === 'char' ? '无' : '基本段落', null));
    for (const st of list) ul.append(rowOf(st.name, st));
    const foot = mk('div', { className: 'txs-foot' });
    
    const btn = (iconName, fallback, title, fn, attr, dis) => { const b = mk('button', { type: 'button', title, className: 'txs-ib' }); b.dataset.attr = attr;
      if (ctx.icon && ctx.hasUiIcon && ctx.hasUiIcon(iconName)) b.append(ctx.icon(iconName, 15)); else b.textContent = fallback;
      b.disabled = !!dis; b.onpointerdown = e => e.preventDefault(); b.onclick = fn; return b; };
    const selOn = !!(selName[kind] && list.some(s => s.name === selName[kind]));
    foot.append(mk('span', { className: 'grow' }),
      btn('adj-reset', '清除', '清除覆盖（按住 Alt 单击样式名同效）', () => { const st = list.find(s => s.name === (selName[kind] || cur)); applyStyle(kind, st || null, true).then(() => render(kind)); }, 'txs-clear'),
      btn('check', '✓', kind === 'char' ? '通过合并覆盖重新定义字符样式' : '通过合并覆盖重新定义段落样式', () => redefine(kind), 'txs-redefine', !(selName[kind] || cur)),
      btn('new-layer', '+', (kind === 'char' ? '创建新样式' : '创建新样式') + '（按住 Alt 单击 = 新建并打开样式选项）', e => { newStyle(kind).then(() => { if (e.altKey) options(kind); }); }, 'txs-new'),
      btn('layer-delete', '删', '删除当前样式', () => remove(kind), 'txs-delete', !selOn));
    box.append(ul);
    if (!ctx.isTextLayer(ctx.selLayer())) box.append(mk('div', { className: 'txs-note', textContent: '选中文字图层（或在文字里选中几个字）后单击样式即可应用。' }));
    box.append(foot);
    sec.append(box);
  }
  for (const kind of ['char', 'para']) panels.setPanelMenu(PANEL[kind], () => [
    { label: kind === 'char' ? '新建字符样式…' : '新建段落样式…', run: () => newStyle(kind) },
    { label: '复制样式', enabled: !!selName[kind], run: () => duplicate(kind) },
    { label: '删除样式', enabled: !!selName[kind], run: () => remove(kind) },
    { sep: true },
    { label: '重新定义样式', enabled: !!(selName[kind] || currentName(kind)), run: () => redefine(kind) },
    { label: '样式选项…', enabled: !!selName[kind], run: () => options(kind) },
    { label: '清除覆盖', run: () => { const st = listOf(kind).find(s => s.name === (selName[kind] || currentName(kind))); applyStyle(kind, st || null, true).then(() => render(kind)); } },
    { sep: true },
    { label: kind === 'char' ? '载入字符样式…' : '载入段落样式…', enabled: ctx.hasDoc(), run: () => loadFromFile(kind) },
    { sep: true },
    { label: '载入默认文字样式', run: () => loadDefaults() }, { label: '存储默认文字样式', run: () => saveDefaults() },
  ].map(x => x.enabled === false ? { ...x, disabled: true } : x));

  
  const BLOCKS = [['all', '整个字体', 0, 0x10ffff], ['latin', '基本拉丁字母', 0x20, 0x7e], ['latin1', '拉丁字母补充 / 扩展', 0xa0, 0x24f], ['greek', '希腊 / 西里尔', 0x370, 0x52f],
    ['punct', '标点与符号', 0x2000, 0x2bff], ['cjkp', 'CJK 符号与标点', 0x3000, 0x303f], ['kana', '假名', 0x3040, 0x30ff], ['cjk', 'CJK 统一汉字', 0x4e00, 0x9fff], ['full', '全角 / 半角', 0xff00, 0xffef], ['pua', '私用区', 0xe000, 0xf8ff]];
  const g = { ps: null, css: null, cps: null, status: '', block: 'all', page: 0, size: lsGet('psd_editor.glyphsSize', 28), loading: null, override: null };
  const FALLBACK = (() => { const a = []; for (let c = 0x21; c < 0x7f; c++) a.push(c); for (let c = 0xa1; c < 0x100; c++) a.push(c);
    for (const c of '‘’“”–—…•·°±×÷€£¥©®™§¶†‡‰′″←↑→↓√∞≈≠≤≥、。，；：？！「」『』（）【】《》〈〉〔〕…—～·※') a.push(c.codePointAt(0)); return a; })();
  async function glyphFont() {
    const i = ctx.selLayer();
    const ti = ctx.isTextLayer(i) ? ctx.textInfoOf(i) : null;
    const ps = g.override || (ti && ti.font) || ctx.toolFontPs() || null;   
    if (!ps) { Object.assign(g, { ps: null, css: null, cps: null, status: '选中文字图层或在选项栏选一款字体后，这里列出它的字形。' }); return; }
    if (g.ps === ps && (g.cps || g.loading)) return;
    g.ps = ps; g.cps = null; g.page = 0; g.status = '正在读取字体…';
    const p = g.loading = (async () => {
      g.css = (!g.override && ti && ti.runCss) || await ctx.cssFor(ps);
      const u8 = await ctx.fontBytes(ps);
      if (g.loading !== p) return;
      if (u8) { try { g.cps = cmapCodePoints(u8); g.status = `${ctx.fontName(ps)}：${g.cps.length} 个字形（按 cmap 列出）`; } catch (e) { g.cps = null; g.status = '字体文件解析失败：' + e.message; } }
      else g.status = `拿不到「${ctx.fontName(ps)}」的字体文件（浏览器不给网页读系统字体的文件：「本地字体访问」没授权或不支持）。下面列的是常用字符，用这款字体显示；上传字体文件或在字体下拉里授权「读取全部本机字体」后可列全部字形。`;
    })().finally(() => { if (g.loading === p) g.loading = null; renderGlyphs(); });
  }
  
  async function insertGlyph(ch) {
    const rec = lsGet(LS_RECENT, []).filter(c => c.ch !== ch && c !== ch); rec.unshift(g.ps ? { ch, ps: g.ps } : ch); lsSet(LS_RECENT, rec.slice(0, 20));
    const ok = await ctx.insertText(ch);
    if (!ok) { shell.status('先用文字工具在文字里放一个插入点（或选中文字图层），再双击字形插入'); renderGlyphs(); return; }
    const i = ctx.selLayer(), ti = ctx.isTextLayer(i) ? ctx.textInfoOf(i) : null, c = ctx.caret && ctx.caret();
    if (g.ps && ti && c && ti.font !== g.ps) {
      ctx.select(c[1] - ch.length, c[1]);
      await ctx.setFont(i, g.ps);
      ctx.select(c[1], c[1]);
    }
    renderGlyphs();
  }
  function renderGlyphs() {
    const sec = panels.sectionOf('glyphs'); if (!sec) return;
    sec.textContent = '';
    const box = mk('div', { className: 'txg-panel' });
    const top = mk('div', { className: 'txg-top' });
    const fontLab = mk('span', { className: 'txg-font', textContent: g.ps ? ctx.fontName(g.ps) : '—', title: g.ps || '' });
    const sel = mk('select', { title: '显示：字形的范围 / 类别' }); sel.dataset.attr = 'txg-block';
    for (const [v, t] of BLOCKS) sel.append(new Option(t, v));
    { const o = new Option('当前所选字体的替代字', 'alt'); o.disabled = true; o.title = '要解析字体的 GSUB 表（OpenType 替代字）——还没做'; sel.insertBefore(o, sel.options[1]); }
    sel.value = g.block; sel.onchange = () => { g.block = sel.value; g.page = 0; renderGlyphs(); };
    const q = mk('input', { type: 'search', placeholder: '搜索（字符或 U+XXXX）', value: g.q || '' }); q.dataset.attr = 'txg-search';
    q.onkeydown = e => e.stopPropagation();
    q.onchange = () => { g.q = q.value.trim(); g.page = 0; renderGlyphs(); };
    top.append(fontLab, sel, q);
    const recent = lsGet(LS_RECENT, []);
    const rrow = mk('div', { className: 'txg-recent', title: '最近使用的字形' });
    for (const it of recent) {
      const ch = typeof it === 'string' ? it : it.ch; if (!ch) continue;
      const c = mk('span', { className: 'txg-cell', textContent: ch, title: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + (it.ps ? ' · ' + ctx.fontName(it.ps) : '') + '（双击插入）' });
      c.style.fontFamily = g.css ? `"${g.css}", sans-serif` : '';
      c.ondblclick = () => insertGlyph(ch); rrow.append(c);
    }
    let list = g.cps || FALLBACK;
    const b = BLOCKS.find(x => x[0] === g.block);
    if (b && b[0] !== 'all') list = list.filter(c => c >= b[2] && c <= b[3]);
    if (g.q) {
      const m = /^u\+?([0-9a-f]{2,6})$/i.exec(g.q);
      list = m ? list.filter(c => c === parseInt(m[1], 16)) : list.filter(c => g.q.includes(String.fromCodePoint(c)));
    }
    const PER = 480, pages = Math.max(1, Math.ceil(list.length / PER)); g.page = Math.min(g.page, pages - 1);
    const grid = mk('div', { className: 'txg-grid' });
    grid.style.setProperty('--txg', g.size + 'px');
    for (const cp of list.slice(g.page * PER, g.page * PER + PER)) {
      const ch = String.fromCodePoint(cp);
      const c = mk('span', { className: 'txg-cell', textContent: ch, title: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}（双击插入）` });
      if (g.css) c.style.fontFamily = `"${g.css}", sans-serif`;
      c.ondblclick = () => insertGlyph(ch);
      grid.append(c);
    }
    const nav = mk('div', { className: 'txg-nav' });
    const nb = (t, fn, dis, title, iconName, attr) => { const x = mk('button', { type: 'button', title: title || '' }); if (iconName && ctx.hasUiIcon && ctx.hasUiIcon(iconName)) x.append(ctx.icon(iconName, 12)); else x.textContent = t; x.disabled = dis; x.onclick = fn; if (attr) x.dataset.attr = attr; return x; };
    nav.append(nb('‹', () => { g.page--; renderGlyphs(); }, g.page <= 0, '上一页'), mk('span', { textContent: `${g.page + 1} / ${pages} · ${list.length} 个` }), nb('›', () => { g.page++; renderGlyphs(); }, g.page >= pages - 1, '下一页'));
    
    const bot = mk('div', { className: 'txg-bot' });
    const fb = mk('button', { type: 'button', className: 'txg-fontbtn', textContent: g.ps ? ctx.fontName(g.ps) : '—', title: '字体系列（只改字形面板显示的字体；双击插入的字用这款字体）' }); fb.dataset.attr = 'txg-font';
    fb.onpointerdown = e => e.preventDefault();
    fb.onclick = async () => { const r = await ctx.pickFont(fb, g.ps); if (r && r.psName) { g.override = r.psName; g.ps = null; glyphFont(); renderGlyphs(); } };
    const ss = mk('select', { title: '字体样式' }); ss.dataset.attr = 'txg-style';
    const styles = g.ps ? ctx.fontStyles(g.ps) : [];
    if (styles.length) for (const x of styles) ss.append(new Option(x.style, x.ps)); else ss.append(new Option('—', g.ps || ''));
    ss.value = g.ps || ''; ss.disabled = styles.length < 2;
    ss.onchange = () => { g.override = ss.value; g.ps = null; glyphFont(); renderGlyphs(); };
    const zoom = d => { g.size = Math.max(16, Math.min(72, g.size + d)); lsSet('psd_editor.glyphsSize', g.size); renderGlyphs(); };
    bot.append(fb, ss, nb('−', () => zoom(-6), g.size <= 16, '缩小字形显示', 'zoom-glyph-small', 'txg-zoom-out'), nb('+', () => zoom(6), g.size >= 72, '放大字形显示', 'zoom-glyph-large', 'txg-zoom-in'));
    box.append(top);
    if (recent.length) box.append(mk('div', { className: 'txs-note', textContent: '最近使用的字形' }), rrow);
    box.append(grid, nav, bot, mk('div', { className: 'txs-note', textContent: g.status || '' }));
    sec.append(box);
  }
  panels.setPanelMenu('glyphs', () => [
    { label: '清除最近使用的字形', run: () => { lsSet(LS_RECENT, []); renderGlyphs(); } },
    { label: '跟随所选文字的字体', checked: !g.override, run: () => { g.override = null; g.ps = null; glyphFont(); renderGlyphs(); } },
  ]);

  
  let raf = 0;
  function refresh() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      try { if (panels.isVisible(PANEL.char)) render('char'); } catch {}
      try { if (panels.isVisible(PANEL.para)) render('para'); } catch {}
      try {
        if (panels.isVisible('glyphs')) {                
          const before = g.ps, sec = panels.sectionOf('glyphs');
          glyphFont();
          if (g.ps !== before || !(sec && sec.querySelector('.txg-panel'))) renderGlyphs();
        }
      } catch {}
    });
  }
  panels.onChange(refresh);

  


  function saveDefaults() {
    const s = sheets();
    lsSet(LS_DEFAULT, { char: s.char || [], para: s.para || [], tool: ctx.toolDefaults() });
    shell.status(`已存储默认文字样式（${(s.char || []).length} 个字符样式、${(s.para || []).length} 个段落样式 + 文字工具默认值）`);
  }
  function loadDefaults() {
    const d = lsGet(LS_DEFAULT, null);
    if (!d) { shell.status('还没有存储过默认文字样式（文字 › 存储默认文字样式）'); return; }
    if (ctx.hasDoc()) {
      const s = sheets(), merge = (a, b) => { const m = new Map((a || []).map(x => [x.name, x])); for (const x of b || []) m.set(x.name, x); return [...m.values()]; };
      ctx.setSheets({ char: merge(s.char, d.char), para: merge(s.para, d.para) }, '载入默认文字样式');
    }
    if (d.tool) ctx.setToolDefaults(d.tool);
    refresh();
    shell.status('已载入默认文字样式');
  }

  
  const isTx = () => ctx.inPreview() && ctx.isTextLayer(ctx.selLayer());
  const OT_IDS = { ligatures: 'ligatures', otContextual: 'contextual', dligatures: 'discretionary', otSwash: 'swash', otOldStyle: 'oldstyle', otStylistic: 'stylistic', otTitling: 'titling', otOrdinals: 'ordinals', otFractions: 'fractions' };
  const otOn = (ti, key) => key === 'ligatures' ? ti.ligatures !== false : key === 'otContextual' ? ti.otContextual !== false : !!ti[key];
  for (const [key, label, , inEngine] of OT_FEATURES) {
    R('type.opentype.' + OT_IDS[key], () => {
      const i = ctx.selLayer(); const ti = ctx.textInfoOf(i); if (!ti) return;
      ctx.applyTextStyle(i, { [key]: !otOn(ti, key) });
      shell.status(`OpenType「${label}」${otOn(ti, key) ? '关' : '开'}` + (inEngine ? '（写回 EngineData）' : '（预览按字体的 OpenType 特性；PS 把它存在新式 Txt2 里，经典 EngineData 没有这个键 —— 记在本编辑器的私有键里，PS 打开不显示）'));
    }, isTx, { checked: () => { if (!isTx()) return null; const ti = ctx.textInfoOf(ctx.selLayer()); return ti ? otOn(ti, key) : null; } });
  }
  for (const [id, label] of [['default', '默认功能'], ['eastAsian', '东亚功能'], ['middleEast', '中东功能']])
    R('type.lang.' + id, () => { lang = id; lsSet(LS_LANG, id); ctx.renderProps(); shell.status(`语言选项：${label}（字符 / 段落面板显示对应的排版选项）`); }, () => true, { checked: () => lang === id });
  R('type.loadDefaultStyles', () => loadDefaults(), () => true);
  R('type.saveDefaultStyles', () => saveDefaults(), () => ctx.hasDoc());

  
  const OT_BTN = { ligatures: 'ﬁ', otContextual: 'ct', dligatures: 'st', otSwash: '𝒜', otOldStyle: '1ⁿ', otStylistic: 'aa', otTitling: 'T', otOrdinals: '1ˢᵗ', otFractions: '½' };
  function charExtras(idx, ti, apply) {
    const out = [];
    const row = mk('div', { className: 'tx-toggles tx-ot', title: 'OpenType 特性' });
    for (const [key, label, , inEngine] of OT_FEATURES) {
      const on = otOn(ti, key);
      const b = mk('button', { type: 'button', className: 'tx-tog' + (on ? ' on' : ''), textContent: OT_BTN[key], title: label + (inEngine ? '' : '（只预览 + 私有键，PS 存在 Txt2 里）') });
      b.dataset.attr = 'text-ot-' + OT_IDS[key]; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.onpointerdown = e => e.preventDefault();
      b.onclick = () => apply({ [key]: !on });
      row.append(b);
    }
    out.push(row);
    const lab = (t, el) => { const f = mk('label', { className: 'tx-field', title: el.title }); f.append(mk('span', { textContent: t, style: 'white-space:nowrap;color:var(--muted);margin-right:4px' }), el); return f; };
    const sel = (title, opts, val, fn, attr) => { const s = mk('select', { title }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = String(val); s.onchange = () => fn(s.value); if (attr) s.dataset.attr = attr; return s; };
    const chk = (title, val, fn, attr) => { const c = mk('input', { type: 'checkbox', checked: !!val, title }); c.onchange = () => fn(c.checked); if (attr) c.dataset.attr = attr; return c; };
    if (lang === 'eastAsian') {
      const gEA = mk('div', { className: 'tx-grid tx-ea' });
      const tsume = mk('input', { type: 'number', min: 0, max: 100, step: 10, value: Math.round((ti.tsume || 0) * 100), title: '比例间距（%）：按比例压缩字符周围的空白（写 EngineData 的 Tsume）' });
      tsume.dataset.attr = 'text-tsume'; tsume.style.width = '';
      tsume.onchange = () => apply({ tsume: Math.max(0, Math.min(100, +tsume.value || 0)) / 100 });
      gEA.append(lab('比例间距 %', tsume),
        lab('直排内横排', chk('直排内横排：直排文字里把选中的几个字横着排进一格（预览；PS 存在 Txt2 里，记私有键）', ti.tcy, v => apply({ tcy: v }), 'text-tcy')),
        lab('分行缩排', chk('分行缩排：把选中的字缩成两行排进一行（只记私有键，画布不预览；PS 存在 Txt2 里）', ti.warichu, v => apply({ warichu: v }), 'text-warichu')),
        lab('着重号', sel('着重号（预览；PS 存在 Txt2 里，记私有键）', [['none', '无'], ['dot', '点'], ['sesame', '芝麻点'], ['circle', '圆圈']], ti.emphasis || 'none', v => apply({ emphasis: v === 'none' ? undefined : v }), 'text-emphasis')),
        lab('字符旋转', sel('字符旋转（预览；PS 存在 Txt2 里，记私有键）', [['0', '0°'], ['90', '90°'], ['-90', '-90°'], ['45', '45°'], ['-45', '-45°'], ['180', '180°']], ti.charRotate || 0, v => apply({ charRotate: +v || undefined }), 'text-char-rotate')),
        lab('不间断', chk('不间断：选中的字不在行尾断开（写 EngineData 的 NoBreak）', ti.noBreak, v => apply({ noBreak: v }), 'text-nobreak')));
      out.push(gEA);
    } else if (lang === 'middleEast') {
      const gME = mk('div', { className: 'tx-grid tx-me' });
      gME.append(
        lab('字符方向', sel('字符方向（写 EngineData 的 CharacterDirection）', [['0', '默认方向'], ['1', '从左到右'], ['2', '从右到左']], ti.charDirection || 0, v => apply({ charDirection: +v }), 'text-char-direction')),
        lab('数字', sel('数字字形（写 EngineData 的 HindiNumbers）', [['0', '阿拉伯数字'], ['1', '印地语数字']], ti.hindiNumbers ? 1 : 0, v => apply({ hindiNumbers: v === '1' }), 'text-hindi')));
      out.push(gME);
    }
    return out;
  }
  function paraExtras(idx, ti, apply) {
    const lab = (t, el) => { const f = mk('label', { className: 'tx-field', title: el.title }); f.append(mk('span', { textContent: t, style: 'white-space:nowrap;color:var(--muted);margin-right:4px' }), el); return f; };
    const sel = (title, opts, val, fn, attr) => { const s = mk('select', { title }); for (const [v, t] of opts) s.append(new Option(t, v)); s.value = String(val); s.onchange = () => fn(s.value); if (attr) s.dataset.attr = attr; return s; };
    const kins = sel('避头尾法则设置：PS 自带「JIS 宽松」「JIS 严格」两套（EngineData 的 KinsokuSet 里有这两份字符表）；选哪一套 PS 存在 Txt2 里，这里预览按所选集合排、记私有键',
      [['none', '无'], ['soft', 'JIS 宽松'], ['hard', 'JIS 严格']], ti.kinsokuSet || 'soft', v => apply({ kinsokuSet: v }), 'text-kinsoku');
    const moji = sel('间距组合设置：PS 自带 4 套（EngineData 的 MojiKumiSet）；选哪一套 PS 存在 Txt2 里，记私有键（画布预览不改间距）',
      [['none', '无'], ['1', '间距组合 1'], ['2', '间距组合 2'], ['3', '间距组合 3'], ['4', '间距组合 4']], ti.mojikumi || 'none', v => apply({ mojikumi: v }), 'text-mojikumi');
    const order = sel('避头尾方式（写 EngineData 的 KinsokuOrder）', [['0', '先推入'], ['1', '先推出'], ['2', '只推出']], ti.kinsokuOrder || 0, v => apply({ kinsokuOrder: +v }), 'text-kinsoku-order');
    const hang = mk('input', { type: 'checkbox', checked: !!ti.hanging, title: '罗马式溢出标点（写 EngineData 的 Hanging）' }); hang.onchange = () => apply({ hanging: hang.checked }); hang.dataset.attr = 'text-hanging';
    const bura = mk('input', { type: 'checkbox', checked: !!ti.burasagari, title: '标点溢出（Burasagari：句读点可以挂在框外；写 EngineData）' }); bura.onchange = () => apply({ burasagari: bura.checked }); bura.dataset.attr = 'text-burasagari';
    const comp = sel('书写器（写 EngineData 的 EveryLineComposer）', [['0', 'Adobe 单行书写器'], ['1', 'Adobe 多行书写器']], ti.everyLineComposer ? 1 : 0, v => apply({ everyLineComposer: v === '1' }), 'text-composer');
    const els = [lab('避头尾法则', kins), lab('间距组合', moji)];
    if (lang === 'eastAsian') els.push(lab('避头尾方式', order), lab('标点溢出', bura));
    els.push(lab('罗马式溢出标点', hang), lab('书写器', comp));
    return els;
  }

  return { refresh, charExtras, paraExtras, lang: () => lang, renderStyles: render, renderGlyphs };
}
