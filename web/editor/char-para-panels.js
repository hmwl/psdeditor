


















import { OT_FEATURES } from '../../core/text-styles.js';
import { PARA_EXTRA_DEFAULTS } from '../../core/psd-text.js';


import { CP_PARA_EXTRA_KEYS } from './text-para-keys.js';
export { CP_PARA_EXTRA_KEYS };

const LS_DEF = 'psd_editor.charParaDefaults', LS_MOJI = 'psd_editor.mojikumiSets';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {  } };
const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const r2 = v => Math.round(v * 100) / 100;
const hexOf = c => '#' + [0, 1, 2].map(k => Math.round(Math.max(0, Math.min(1, c[k] ?? 0)) * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(k => parseInt(String(h).slice(k, k + 2), 16) / 255).concat(1);


const LEN_KEYS = ['fontSize', 'leading', 'baselineShift', 'startIndent', 'endIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter', 'hyphZone'];
const SIZE_PRESETS = [6, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72];
const TRACK_PRESETS = [-100, -75, -50, -25, -10, -5, 0, 5, 10, 25, 50, 75, 100, 200];
const KERN_PRESETS = [0, 25, 50, 75, 100, 200, -25, -50, -75, -100];
const ALIGNS = [['left', '左对齐文本', 'text-align-left'], ['center', '居中对齐文本', 'text-align-center'], ['right', '右对齐文本', 'text-align-right'],
  ['justify', '最后一行左对齐', 'text-align-just-left'], ['justifyCenter', '最后一行居中对齐', 'text-align-just-center'],
  ['justifyRight', '最后一行右对齐', 'text-align-just-right'], ['justifyAll', '全部对齐', 'text-align-just-all']];

const OT_BTNS = [['ligatures', '标准连字', 'ﬁ', 'ot-ligatures'], ['otContextual', '上下文替代字', 'ct', 'ot-contextual'], ['dligatures', '自由连字', 'st', 'ot-dligatures'],
  ['otSwash', '花饰字', '𝒜', 'ot-swash'], ['otStylistic', '替代样式', 'aa', 'ot-stylistic'], ['otTitling', '标题代替字', 'T', 'ot-titling'],
  ['otOrdinals', '序数字', '1ˢᵗ', 'ot-ordinals'], ['otFractions', '分数字', '½', 'ot-fractions']];
const otOn = (v, key) => key === 'ligatures' ? v.ligatures !== false : key === 'otContextual' ? v.otContextual !== false : !!v[key];

const KINSOKU_BUILTIN = {
  hard: { name: 'JIS 严格', noStart: '、。，．・：；？！ー―’”）〕］｝〉》」』】ヽヾゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ゛゜?!)]},.:;℃℉¢％‰',
    noEnd: '‘“（〔［｛〈《「『【([{￥＄£＠§〒＃', keep: '―‥', hanging: '、。.,' },
  soft: { name: 'JIS 宽松', noStart: '、。，．・：；？！’”）〕］｝〉》」』】ヽヾゝゞ々', noEnd: '‘“（〔［｛〈《「『【', keep: '―‥', hanging: '、。.,' },
};

const MOJI_BUILTIN = [['1', '间距组合 1'], ['2', '间距组合 2'], ['3', '间距组合 3'], ['4', '间距组合 4']];
const MOJI_CLASSES = [['openBr', '开括号前'], ['closeBr', '闭括号后'], ['comma', '逗号后'], ['period', '句号后'], ['middle', '中间标点前后'],
  ['cjkRoman', '汉字与西文之间'], ['cjkNum', '汉字与数字之间'], ['lineStart', '段首缩进（字）']];
const MOJI_BASE = { openBr: 50, closeBr: 50, comma: 50, period: 50, middle: 25, cjkRoman: 25, cjkNum: 25, lineStart: 0 };

const CHAR_RESET = { fontSize: 12, color: [0, 0, 0, 1], leading: null, tracking: 0, kerning: 0, autoKern: true, kernMode: undefined, hScale: 1, vScale: 1, baselineShift: 0,
  bold: false, italic: false, underline: false, strikethrough: false, caps: 'none', baseline: 'normal', tsume: 0, noBreak: false,
  ligatures: true, dligatures: false, otContextual: undefined, otSwash: undefined, otOldStyle: undefined, otStylistic: undefined, otTitling: undefined, otOrdinals: undefined, otFractions: undefined,
  fracWidths: undefined, sysLayout: undefined, romanUpright: undefined, tcy: undefined, warichu: undefined, charDirection: 0, hindiNumbers: false, kashida: 0 };
const PARA_RESET = { align: 'left', startIndent: 0, endIndent: 0, firstLineIndent: 0, spaceBefore: 0, spaceAfter: 0, hyphenate: true, hanging: false, burasagari: false, burasagariForced: undefined,
  kinsokuOrder: 0, kinsokuSet: undefined, mojikumi: undefined, everyLineComposer: true, worldReady: undefined, leadingType: 0, autoLeading: 1.2,
  wordSpacing: PARA_EXTRA_DEFAULTS.wordSpacing, letterSpacing: PARA_EXTRA_DEFAULTS.letterSpacing, glyphSpacing: PARA_EXTRA_DEFAULTS.glyphSpacing,
  singleWordJust: undefined, hyphWordSize: 6, hyphPre: 2, hyphPost: 2, hyphLimit: 8, hyphZone: 36, hyphCaps: undefined };

const CSS = `
.cp-panel { display: flex; flex-direction: column; gap: 5px; padding: 8px 10px 10px; font-size: 11px; color: var(--muted); min-width: 0; }
.cp-panel .cp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; align-items: center; min-width: 0; }
.cp-panel .cp-row.one { grid-template-columns: 1fr; }
.cp-panel .cp-f { display: flex; align-items: center; gap: 4px; min-width: 0; }
.cp-panel .cp-f > .cp-ic { flex: none; opacity: .9; cursor: ew-resize; cursor: var(--ps-cursor-scrub, ew-resize); }
.cp-panel .cp-f > .cp-ic.static { cursor: default; }
.cp-panel .cp-f input[type=number], .cp-panel .cp-f input[type=text], .cp-panel select, .cp-panel .cp-font {
  flex: 1; min-width: 0; width: 0; height: 22px; font-size: 11px; font-variant-numeric: tabular-nums; background: #1b1b1c; color: var(--text);
  border: 1px solid var(--line2); border-radius: 3px; padding: 0 4px; }
.cp-panel .cp-font { width: auto; display: flex; align-items: center; justify-content: space-between; text-align: left; cursor: default; overflow: hidden; }
.cp-panel .cp-font span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-panel .cp-combo { flex: 1; display: flex; min-width: 0; }
.cp-panel .cp-combo input { border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important; }
.cp-panel .cp-combo button { flex: none; width: 16px; height: 22px; padding: 0; border-radius: 0 3px 3px 0; border: 1px solid var(--line2); border-left: 0; background: #1b1b1c; font-size: 8px; color: var(--muted); }
.cp-panel .cp-unit { flex: none; font-size: 10px; }
.cp-panel .cp-lab { flex: none; white-space: nowrap; }
.cp-panel input[type=color] { width: 44px; height: 20px; padding: 0; border: 1px solid var(--line2); background: transparent; flex: none; }
.cp-panel .cp-tgl { display: flex; gap: 2px; }
.cp-panel .cp-tgl button { flex: 1; min-width: 0; height: 24px; padding: 0; display: grid; place-items: center; background: transparent; border: 1px solid transparent; border-radius: 3px; color: var(--text); }
.cp-panel .cp-tgl button:hover { background: #454545; }
.cp-panel .cp-tgl button.on { background: #1f1f1f; border-color: #5c5c5c; }
.cp-panel .cp-tgl.ot button { font: 12px Georgia, 'Times New Roman', serif; }
.cp-panel .cp-sep { height: 1px; background: var(--line2); margin: 3px 0; opacity: .6; }
.cp-panel .cp-chk { display: flex; align-items: center; gap: 6px; color: var(--text); }
.cp-panel :disabled { opacity: .45; }
.cp-panel .cp-note { font-size: 10px; opacity: .7; line-height: 1.4; }
.cp-dlg .cp-dlg-body { display: flex; flex-direction: column; gap: 8px; min-width: 360px; max-height: 64vh; overflow: auto; }
.cp-dlg table { border-collapse: collapse; }
.cp-dlg td, .cp-dlg th { padding: 3px 6px; text-align: left; font-weight: normal; white-space: nowrap; }
.cp-dlg th { opacity: .75; font-size: 11px; }
.cp-dlg input[type=number] { width: 64px; }
.cp-dlg textarea { width: 100%; box-sizing: border-box; font: 14px/1.4 sans-serif; resize: vertical; }
.cp-dlg .cp-dlg-row { display: flex; align-items: center; gap: 8px; }
.cp-dlg .cp-dlg-row > span:first-child { width: 120px; flex: none; opacity: .85; }
.cp-dlg .cp-dlg-tools { display: flex; gap: 6px; flex-wrap: wrap; }
`;

export function installCharParaPanels(ctx) {
  const { shell, panels } = ctx;
  if (!document.getElementById('cp-panels-css')) document.head.append(mk('style', { id: 'cp-panels-css', textContent: CSS }));
  let D = lsGet(LS_DEF, {});                                     
  if (!D || typeof D !== 'object') D = {};
  const saveD = () => lsSet(LS_DEF, D);
  let moji = lsGet(LS_MOJI, []); if (!Array.isArray(moji)) moji = [];

  
  const target = () => ctx.target();
  function vals() {
    const i = target();
    if (i >= 0) {
      const ti = ctx.textInfoOf(i); const k = ctx.ptFactor(i);
      if (ti) {
        const v = { ...ti, layer: i, font: ctx.fontOf(i), aa: ctx.effTextDesc(i, 'antiAlias') || 'antiAliasSharp', orientation: ctx.orientation(i) };
        for (const key of LEN_KEYS) if (typeof ti[key] === 'number') v[key] = r2(ti[key] * k);
        if (ti.leading == null) v.leading = null;
        return v;
      }
    }
    const t = ctx.toolOpts();
    return { ...PARA_RESET, ...CHAR_RESET, hyphenate: true, ...D, layer: -1, font: ctx.toolFont(), fontSize: t.sizePt, color: unhex(t.color || '#000000'), align: t.align || 'left', aa: t.aa || 'antiAliasSharp', orientation: 'horizontal' };
  }
  
  async function apply(patch) {
    const i = target();
    if (i >= 0) {
      const k = ctx.ptFactor(i), p = {};
      for (const [key, v] of Object.entries(patch)) p[key] = LEN_KEYS.includes(key) && typeof v === 'number' ? v / k : v;
      await ctx.applyTextStyle(i, p);
      refresh();
      return true;
    }
    if (!ctx.hasDoc()) { shell.status('先打开或新建一个文档'); return false; }
    const tool = {};
    for (const [key, v] of Object.entries(patch)) {
      if (key === 'fontSize') { if (v > 0) tool.sizePt = v; continue; }
      if (key === 'color') { tool.color = hexOf(v); continue; }
      if (key === 'align') { tool.align = v; continue; }
      if (v === undefined) delete D[key]; else D[key] = v;
    }
    saveD();
    if (Object.keys(tool).length) ctx.setToolOpts(tool);
    shell.status('没有选中文字图层：已改为下一次新建文字的默认值');
    refresh();
    return true;
  }
  
  function newTextPatch(k) {
    const out = {};
    for (const [key, v] of Object.entries(D)) {
      if (['fontSize', 'color', 'align'].includes(key) || v === undefined) continue;
      out[key] = LEN_KEYS.includes(key) && typeof v === 'number' ? v / (k || 1) : v;
    }
    return out;
  }

  
  let lastPt = { x: 200, y: 200 };
  document.addEventListener('pointerdown', e => { lastPt = { x: e.clientX, y: e.clientY }; }, true);
  const at = () => ({ left: lastPt.x, right: lastPt.x + 1, top: lastPt.y - 10, bottom: lastPt.y + 4, alignLeft: true });
  const sub = (label, items, extra = {}) => ({ label: label + ' ▸', run: () => setTimeout(() => panels.popup(items(), at()), 0), ...extra });
  const ico = (name, size = 18) => { if (ctx.hasUiIcon(name)) return ctx.icon(name, size); return mk('span', { className: 'cp-ic-missing', textContent: '' }); };
  const noBlur = el => { el.addEventListener('pointerdown', e => { if (ctx.editing()) e.preventDefault(); }); return el; };
  const stopKeys = el => { el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); el.dispatchEvent(new Event('change')); } }); return el; };

  function makePanel(id, build) {
    const st = { id, ctls: [], built: false, box: null };
    st.render = () => {
      const sec = panels.sectionOf(id); if (!sec) return;
      if (!st.built || !sec.contains(st.box)) {
        sec.textContent = ''; st.ctls = [];
        st.box = mk('div', { className: 'cp-panel' }); st.box.dataset.cp = id;
        build(st);
        sec.append(st.box); st.built = true;
      }
      st.sync();
    };
    st.ctl = (el, upd) => { st.ctls.push({ el, upd }); return el; };
    st.sync = () => {
      const v = vals(), on = ctx.hasDoc();
      for (const c of st.ctls) {
        if (c.el === document.activeElement && c.el.tagName !== 'BUTTON') continue;
        try { c.upd(v, on); } catch {  }
      }
    };
    return st;
  }
  
  function numField(st, o) {
    const inp = stopKeys(mk('input', { type: o.text ? 'text' : 'number', title: o.title }));
    if (!o.text) { inp.step = o.step ?? 1; if (o.min != null) inp.min = o.min; if (o.max != null) inp.max = o.max; }
    inp.dataset.attr = o.attr; inp.setAttribute('aria-label', o.title);
    inp.dataset.scrub = '1';                                     
    inp.onchange = () => { const r = o.parse ? o.parse(inp.value) : (inp.value === '' ? null : +inp.value); if (r === undefined || (typeof r === 'number' && !Number.isFinite(r))) { st.sync(); return; } o.set(r); };
    const f = mk('label', { className: 'cp-f', title: o.title });
    if (o.icon) {
      const ic = ico(o.icon); ic.classList.add('cp-ic'); f.append(ic);
      if (!o.text && ctx.startScrub) ic.addEventListener('pointerdown', e => { if (!inp.disabled) ctx.startScrub(e, inp, ic); });
      else ic.classList.add('static');
    }
    if (o.presets) {
      const box = mk('span', { className: 'cp-combo' });
      const b = noBlur(mk('button', { type: 'button', textContent: '▼', title: o.title }));
      b.onclick = () => panels.popup(o.presets().map(([label, value]) => ({ label, run: () => o.set(value) })), b.getBoundingClientRect());
      box.append(inp, b); f.append(box);
      st.ctl(b, (v, on) => { b.disabled = !on; });
    } else f.append(inp);
    if (o.unit) f.append(mk('span', { className: 'cp-unit', textContent: o.unit }));
    st.ctl(inp, (v, on) => { inp.disabled = !on || (o.enabled ? !o.enabled(v) : false); inp.value = o.get(v); });
    return f;
  }
  function selField(st, o) {
    const s = mk('select', { title: o.title }); s.dataset.attr = o.attr;
    const fill = v => { const opts = typeof o.options === 'function' ? o.options(v) : o.options; const key = opts.map(x => x.join('\u0001')).join('\u0002'); if (s.__k !== key) { s.__k = key; s.textContent = ''; for (const [val, t, dis] of opts) { const op = new Option(t, val); if (dis) op.disabled = true; s.append(op); } } };
    s.onchange = () => o.set(s.value);
    const f = mk('label', { className: 'cp-f', title: o.title });
    if (o.icon) { const ic = ico(o.icon); ic.classList.add('cp-ic', 'static'); f.append(ic); }
    if (o.label) f.append(mk('span', { className: 'cp-lab', textContent: o.label }));
    f.append(s);
    st.ctl(s, (v, on) => { fill(v); s.value = String(o.get(v)); s.disabled = !on || (o.enabled ? !o.enabled(v) : false); if (o.why) s.title = o.why(v) || o.title; });
    return f;
  }
  function toggles(st, list, cls) {
    const row = mk('div', { className: 'cp-tgl' + (cls ? ' ' + cls : '') });
    for (const t of list) {
      const b = noBlur(mk('button', { type: 'button', title: t.title }));
      if (t.icon) b.append(ico(t.icon, 16)); else b.textContent = t.text;
      b.dataset.attr = t.attr; b.setAttribute('aria-label', t.title);
      b.onclick = () => { const v = vals(); apply(t.patch(v)); };
      st.ctl(b, (v, on) => { const is = !!t.on(v); b.classList.toggle('on', is); b.setAttribute('aria-pressed', is ? 'true' : 'false'); b.disabled = !on; });
      row.append(b);
    }
    return row;
  }

  
  async function pickFont(btn) {
    const v = vals();
    const r = await ctx.openFontPopover(btn, v.font);
    if (!r) return;
    const i = target();
    if (i >= 0) await ctx.applyTextFont(i, r); else ctx.setToolFont(r);
    refresh();
  }
  async function pickStyle(ps) {
    const r = await ctx.fontChoice(ps); if (!r) return;
    const i = target();
    if (i >= 0) await ctx.applyTextFont(i, r); else ctx.setToolFont(r);
    refresh();
  }
  const kernVal = v => v.autoKern === false ? String(Math.round(v.kerning || 0)) : v.kernMode === 'optical' ? '视觉' : '度量标准';
  function setKern(x) {
    const s = String(x).trim();
    if (/^(度量标准|metrics|m)$/i.test(s)) return apply({ autoKern: true, kernMode: undefined, kerning: 0 });
    if (/^(视觉|optical|o)$/i.test(s)) {
      const v = vals();
      if (v.font) ctx.opticalKernReady(v.font).then(ok => { if (!ok) shell.status(`拿不到字体「${v.font}」的字体文件，视觉字距按度量标准预览（上传字体或授权「读取全部本机字体」后生效）`); });
      return apply({ autoKern: true, kernMode: 'optical', kerning: 0 });
    }
    const n = Math.round(+s);
    if (!Number.isFinite(n)) { refresh(); return; }
    
    const c = ctx.caret && ctx.caret();
    if (c && c[0] === c[1] && c[0] > 0) {
      ctx.select(c[0] - 1, c[0]);
      return apply({ autoKern: false, kernMode: undefined, kerning: Math.max(-1000, Math.min(10000, n)) }).then(() => ctx.select(c[0], c[0]));
    }
    return apply({ autoKern: false, kernMode: undefined, kerning: Math.max(-1000, Math.min(10000, n)) });
  }
  const CH = makePanel('character', st => {
    const B = st.box;
    
    const fb = mk('button', { type: 'button', className: 'cp-font', title: '搜索和选择字体' }, mk('span'), mk('span', { textContent: '▼', style: 'font-size:8px;opacity:.7' }));
    fb.dataset.attr = 'cp-font-family';
    fb.onclick = () => pickFont(fb);
    st.ctl(fb, (v, on) => { fb.firstChild.textContent = v.font ? ctx.fontName(v.font) : '—'; fb.title = '搜索和选择字体' + (v.font ? `（${v.font}）` : ''); fb.disabled = !on; });
    const fsel = mk('select', { title: '设置字体样式' }); fsel.dataset.attr = 'cp-font-style';
    fsel.addEventListener('pointerdown', () => { ctx.loadFonts().then(() => st.sync()); });
    fsel.onchange = () => pickStyle(fsel.value);
    st.ctl(fsel, (v, on) => {
      const list = v.font ? ctx.fontStyles(v.font) : [];
      const key = list.map(x => x.ps).join('|') + '#' + v.font;
      if (fsel.__k !== key) { fsel.__k = key; fsel.textContent = ''; if (list.length) for (const x of list) fsel.append(new Option(x.style, x.ps)); else fsel.append(new Option(v.font ? '—' : '', v.font || '')); }
      fsel.value = v.font || ''; fsel.disabled = !on || list.length < 2;
    });
    B.append(mk('div', { className: 'cp-row one' }, mk('label', { className: 'cp-f' }, fb)), mk('div', { className: 'cp-row one' }, mk('label', { className: 'cp-f' }, fsel)));
    
    B.append(mk('div', { className: 'cp-row' },
      numField(st, { attr: 'cp-size', icon: 'text-size', title: '设置字体大小', unit: '点', step: 0.1, min: 0.01, max: 1296,
        get: v => r2(v.fontSize), set: n => { if (n > 0) apply({ fontSize: Math.min(1296, n) }); else refresh(); }, presets: () => SIZE_PRESETS.map(n => [n + ' 点', n]) }),
      numField(st, { attr: 'cp-leading', icon: 'text-leading', title: '设置行距', text: true, get: v => v.leading == null ? '(自动)' : String(r2(v.leading)),
        parse: s => { const t = String(s).replace(/[()（）点pt]/gi, '').trim(); if (!t || /^(自动|auto)$/i.test(t)) return null; return +t > 0 ? +t : undefined; },
        set: n => apply({ leading: n }), presets: () => [['(自动)', null], ...SIZE_PRESETS.map(n => [n + ' 点', n])] })));
    
    B.append(mk('div', { className: 'cp-row' },
      numField(st, { attr: 'cp-kerning', icon: 'text-kerning', title: '设置两个字符间的字距微调', text: true, get: kernVal, parse: s => s, set: setKern,
        presets: () => [['度量标准', '度量标准'], ['视觉', '视觉'], ...KERN_PRESETS.map(n => [String(n), n])] }),
      numField(st, { attr: 'cp-tracking', icon: 'text-tracking', title: '设置所选字符的字距调整', step: 10, min: -1000, max: 10000,
        get: v => Math.round(v.tracking || 0), set: n => apply({ tracking: Math.round(n) }), presets: () => TRACK_PRESETS.map(n => [String(n), n]) })));
    
    B.append(mk('div', { className: 'cp-row' },
      selField(st, { attr: 'cp-tsume', icon: 'text-tsume', label: '比例间距', title: '比例间距：按比例压缩字符周围的空白（EngineData 的 Tsume）',
        options: Array.from({ length: 11 }, (_, k) => [String(k * 10), k * 10 + '%']), get: v => String(Math.round((v.tsume || 0) * 10) * 10), set: s => apply({ tsume: (+s || 0) / 100 }) }),
      mk('span')));
    
    B.append(mk('div', { className: 'cp-row' },
      numField(st, { attr: 'cp-vscale', icon: 'text-vscale', title: '垂直缩放', unit: '%', step: 1, min: 0, max: 1000, get: v => r2((v.vScale || 1) * 100), set: n => { if (n > 0) apply({ vScale: n / 100 }); else refresh(); } }),
      numField(st, { attr: 'cp-hscale', icon: 'text-hscale', title: '水平缩放', unit: '%', step: 1, min: 0, max: 1000, get: v => r2((v.hScale || 1) * 100), set: n => { if (n > 0) apply({ hScale: n / 100 }); else refresh(); } })));
    
    const col = mk('input', { type: 'color', title: '设置文本颜色' }); col.dataset.attr = 'cp-color';
    col.onchange = () => apply({ color: unhex(col.value) });
    st.ctl(col, (v, on) => { col.value = hexOf(v.color || [0, 0, 0]); col.disabled = !on; });
    const colF = mk('label', { className: 'cp-f', title: '设置文本颜色' }); { const ic = ico('text-color'); ic.classList.add('cp-ic', 'static'); colF.append(ic, mk('span', { className: 'cp-lab', textContent: '颜色：' }), col); }
    B.append(mk('div', { className: 'cp-row' },
      numField(st, { attr: 'cp-baseline', icon: 'text-baseline', title: '设置基线偏移', unit: '点', step: 0.1, get: v => r2(v.baselineShift || 0), set: n => apply({ baselineShift: n }) }), colF));
    
    B.append(toggles(st, [
      { attr: 'cp-bold', icon: 'text-bold', title: '仿粗体', on: v => v.bold, patch: v => ({ bold: !v.bold }) },
      { attr: 'cp-italic', icon: 'text-italic', title: '仿斜体', on: v => v.italic, patch: v => ({ italic: !v.italic }) },
      { attr: 'cp-allcaps', icon: 'text-allcaps', title: '全部大写字母', on: v => v.caps === 'all', patch: v => ({ caps: v.caps === 'all' ? 'none' : 'all' }) },
      { attr: 'cp-smallcaps', icon: 'text-smallcaps', title: '小型大写字母', on: v => v.caps === 'small', patch: v => ({ caps: v.caps === 'small' ? 'none' : 'small' }) },
      { attr: 'cp-super', icon: 'text-super', title: '上标', on: v => v.baseline === 'superscript', patch: v => ({ baseline: v.baseline === 'superscript' ? 'normal' : 'superscript' }) },
      { attr: 'cp-sub', icon: 'text-sub', title: '下标', on: v => v.baseline === 'subscript', patch: v => ({ baseline: v.baseline === 'subscript' ? 'normal' : 'subscript' }) },
      { attr: 'cp-underline', icon: 'text-underline', title: '下划线', on: v => v.underline, patch: v => ({ underline: !v.underline }) },
      { attr: 'cp-strike', icon: 'text-strike', title: '删除线', on: v => v.strikethrough, patch: v => ({ strikethrough: !v.strikethrough }) },
    ]));
    
    B.append(toggles(st, OT_BTNS.map(([key, title, text, icon]) => ({ attr: 'cp-ot-' + key, text, title, icon: ctx.hasUiIcon(icon) ? icon : null,
      on: v => otOn(v, key), patch: v => ({ [key]: !otOn(v, key) }) })), 'ot'));
    
    B.append(mk('div', { className: 'cp-row' },
      selField(st, { attr: 'cp-language', title: '对所选字符设置语言，以确定连字和拼写规则',
        options: [['0', '美国英语'], ['zh', '简体中文']], get: () => '0', set: () => {}, enabled: () => false }),
      selField(st, { attr: 'cp-antialias', icon: 'text-antialias', title: '设置消除锯齿的方法', options: () => ctx.antiAliasModes(), get: v => v.aa,
        set: s => { const i = target(); if (i >= 0) ctx.applyTextDesc(i, { antiAlias: s }, '消除锯齿').then(refresh); else ctx.setToolOpts({ aa: s }); } })));
    st.box.querySelector('[data-attr="cp-language"]').title = '语言：未做 —— EngineData 的 Language 是 Adobe 私有编号表（未公开），写错会让 PS 的断字 / 拼写规则错乱；画布预览不做断字与拼写检查，所以置灰';
  });

  
  const kinsokuOptions = () => [['none', '无'], ['hard', 'JIS 严格'], ['soft', 'JIS 宽松'], ...customKinsoku().map(k => ['k:' + k.name, k.name]), ['__dlg', '避头尾设置…']];
  const mojiOptions = () => [['none', '无'], ...MOJI_BUILTIN, ...moji.map(m => ['m:' + m.name, m.name]), ['__dlg', '间距组合设置…']];
  const kinsokuKey = v => !v.kinsokuSet ? 'none' : ['none', 'hard', 'soft'].includes(v.kinsokuSet) ? v.kinsokuSet : 'k:' + v.kinsokuSet;
  const PA = makePanel('paragraph', st => {
    const B = st.box;
    const al = mk('div', { className: 'cp-tgl' });
    for (const [value, title, iconName] of ALIGNS) {
      const b = noBlur(mk('button', { type: 'button', title })); b.dataset.attr = 'cp-align-' + value; b.dataset.textAlign = value; b.setAttribute('aria-label', title);
      b.onclick = () => apply({ align: value });
      st.ctl(b, (v, on) => {
        const vert = v.orientation === 'vertical';
        const want = vert && ['left', 'center', 'right'].includes(value) ? { left: 'text-align-vtop', center: 'text-align-vcenter', right: 'text-align-vbottom' }[value] : iconName;
        if (b.__ic !== want) { b.__ic = want; b.textContent = ''; b.append(ico(ctx.hasUiIcon(want) ? want : iconName, 18)); }
        b.title = vert ? title.replace('左', '顶').replace('右', '底') : title;
        b.classList.toggle('on', v.align === value); b.disabled = !on;
      });
      al.append(b);
    }
    B.append(al, mk('div', { className: 'cp-sep' }));
    const ind = (attr, icon, title, key, min) => numField(st, { attr, icon, title, unit: '点', step: 1, min, get: v => r2(v[key] || 0), set: n => apply({ [key]: n }) });
    B.append(mk('div', { className: 'cp-row' }, ind('cp-indent-left', 'text-indent-left', '左缩进', 'startIndent', 0), ind('cp-indent-right', 'text-indent-right', '右缩进', 'endIndent', 0)));
    B.append(mk('div', { className: 'cp-row' }, ind('cp-indent-first', 'text-indent-first', '首行缩进', 'firstLineIndent'), mk('span')));
    B.append(mk('div', { className: 'cp-row' }, ind('cp-space-before', 'text-space-before', '段前添加空格', 'spaceBefore', 0), ind('cp-space-after', 'text-space-after', '段后添加空格', 'spaceAfter', 0)));
    B.append(mk('div', { className: 'cp-sep' }));
    B.append(mk('div', { className: 'cp-row one' }, selField(st, { attr: 'cp-kinsoku', label: '避头尾法则设置：', title: '避头尾法则设置：哪些字符不能放在行首 / 行尾（画布预览按所选集合折行）',
      options: kinsokuOptions, get: kinsokuKey,
      set: s => { if (s === '__dlg') { refresh(); kinsokuDialog(); return; } apply({ kinsokuSet: s === 'none' ? 'none' : s.startsWith('k:') ? s.slice(2) : s }); } })));
    B.append(mk('div', { className: 'cp-row one' }, selField(st, { attr: 'cp-mojikumi', label: '间距组合设置：', title: '间距组合设置：标点、括号、中西文之间的间距（PS 自带 4 套 = EngineData 的 MojiKumiSet；画布预览不改间距）',
      options: mojiOptions, get: v => !v.mojikumi || v.mojikumi === 'none' ? 'none' : /^[1-4]$/.test(v.mojikumi) ? v.mojikumi : 'm:' + v.mojikumi,
      set: s => { if (s === '__dlg') { refresh(); mojikumiDialog(); return; } apply({ mojikumi: s === 'none' ? undefined : s.startsWith('m:') ? s.slice(2) : s }); } })));
    const hy = mk('input', { type: 'checkbox', title: '连字（西文自动断字，写 EngineData 的 AutoHyphenate；画布预览不断字）' }); hy.dataset.attr = 'cp-hyphenate';
    hy.onchange = () => apply({ hyphenate: hy.checked });
    st.ctl(hy, (v, on) => { hy.checked = !!v.hyphenate; hy.disabled = !on; });
    B.append(mk('label', { className: 'cp-chk', title: hy.title }, hy, mk('span', { textContent: '连字' })));
  });

  
  function dialog(title, body, onOk, opts = {}) {
    return new Promise(resolve => {
      const d = mk('dialog', { className: 'fp-dlg fp-form cp-dlg' });
      const form = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
      form.append(mk('h3', { className: 'fp-dlg-title', textContent: title }), mk('div', { className: 'cp-dlg-body' }, ...[].concat(body)));
      const btns = mk('div', { className: 'fp-dlg-btns' });
      for (const x of opts.extra || []) { const b = mk('button', { type: 'button', textContent: x.label }); b.onclick = () => x.run(b); btns.append(b); }
      const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: '取消' });
      const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '确定' });
      btns.append(cancel, ok); form.append(btns); d.append(form); document.body.append(d);
      let done = false;
      const fin = v => { if (done) return; done = true; try { d.close(); } catch { d.removeAttribute('open'); } d.remove(); resolve(v); };
      ok.onclick = async () => { const r = await onOk(); if (r !== false) fin(true); };
      cancel.onclick = () => fin(false);
      d.addEventListener('cancel', e => { e.preventDefault(); fin(false); });
      d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); ok.onclick(); } });
      try { d.showModal(); } catch { d.setAttribute('open', ''); }
    });
  }
  const numIn = (v, o = {}) => { const x = mk('input', { type: 'number', value: v, step: o.step ?? 1 }); x.dataset.scrub = '1'; if (o.min != null) x.min = o.min; if (o.max != null) x.max = o.max; if (o.attr) x.dataset.attr = o.attr; return x; };
  const clampIn = (x, lo, hi, d) => { const n = +x.value; return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const askName = async (title, value, msg) => { const r = await ctx.formDialog(title, [{ key: 'name', label: '名称：', type: 'text', value }], { msg }); return r ? r.name : null; };
  const drow = (label, ...els) => mk('div', { className: 'cp-dlg-row' }, mk('span', { textContent: label }), ...els);

  
  function justificationDialog() {
    const v = vals();
    const pc = a => a.map(x => Math.round(x * 1000) / 10);
    const rows = [['字间距：', 'wordSpacing', 0, 1000], ['字母间距：', 'letterSpacing', -100, 500], ['字形缩放：', 'glyphSpacing', 50, 200]];
    const ins = {};
    const tb = mk('table', {}, mk('tr', {}, mk('th'), mk('th', { textContent: '最小值' }), mk('th', { textContent: '所需值' }), mk('th', { textContent: '最大值' })));
    for (const [label, key, lo, hi] of rows) {
      const cur = pc(v[key] || PARA_EXTRA_DEFAULTS[key]);
      ins[key] = cur.map((x, k) => numIn(x, { min: lo, max: hi, attr: `cp-just-${key}-${k}` }));
      tb.append(mk('tr', {}, mk('td', { textContent: label }), ...ins[key].map(x => mk('td', {}, x, ' %'))));
    }
    const al = numIn(Math.round((v.autoLeading || 1.2) * 1000) / 10, { min: 0, max: 500, attr: 'cp-just-autoleading' });
    const sw = mk('select'); sw.dataset.attr = 'cp-just-single';
    for (const [x, t] of [['justifyAll', '全部对齐'], ['left', '左对齐'], ['center', '居中对齐'], ['right', '右对齐']]) sw.append(new Option(t, x));
    sw.value = v.singleWordJust || 'justifyAll';
    return dialog('对齐', [tb, drow('自动行距：', al, '%'), drow('单字对齐：', sw),
      mk('div', { className: 'cp-note', textContent: '写进 EngineData（段落的 WordSpacing / LetterSpacing / GlyphSpacing / AutoLeading）；画布预览按自动行距排，间距最小 / 最大值只在 PS 的两端对齐里起作用。单字对齐 PS 存在 Txt2 里，这里记私有键。' })],
    async () => {
      const out = {};
      for (const [label, key, lo, hi] of rows) {
        const a = ins[key].map(x => clampIn(x, lo, hi, 0));
        if (!(a[0] <= a[1] && a[1] <= a[2])) { shell.status(`「${label.replace('：', '')}」要满足 最小值 ≤ 所需值 ≤ 最大值`); ins[key][1].focus(); return false; }
        out[key] = a.map(x => x / 100);
      }
      out.autoLeading = clampIn(al, 0, 500, 120) / 100 || 1.2;
      out.singleWordJust = sw.value === 'justifyAll' ? undefined : sw.value;
      await apply(out);
      return true;
    });
  }
  
  function hyphenationDialog() {
    const v = vals();
    const on = mk('input', { type: 'checkbox', checked: !!v.hyphenate }); on.dataset.attr = 'cp-hy-on';
    const ws = numIn(v.hyphWordSize ?? 6, { min: 2, max: 25, attr: 'cp-hy-word' }), pre = numIn(v.hyphPre ?? 2, { min: 1, max: 15, attr: 'cp-hy-pre' }), post = numIn(v.hyphPost ?? 2, { min: 1, max: 15, attr: 'cp-hy-post' });
    const lim = numIn(v.hyphLimit ?? 8, { min: 0, max: 25, attr: 'cp-hy-limit' }), zone = numIn(r2(v.hyphZone ?? 36), { min: 0, max: 720, step: 0.1, attr: 'cp-hy-zone' });
    const caps = mk('input', { type: 'checkbox', checked: v.hyphCaps !== false }); caps.dataset.attr = 'cp-hy-caps';
    return dialog('连字', [mk('label', { className: 'cp-chk' }, on, '连字'),
      drow('单词长度超过：', ws, '字母'), drow('断开前：', pre, '字母'), drow('断开后：', post, '字母'), drow('连字符限制：', lim, '连字符'), drow('连字区：', zone, '点'),
      mk('label', { className: 'cp-chk' }, caps, '连字大写的单词'),
      mk('div', { className: 'cp-note', textContent: '写进 EngineData（AutoHyphenate / HyphenatedWordSize / PreHyphen / PostHyphen / ConsecutiveHyphens / Zone），PS 打开时按它断字；画布预览不做西文断字。「连字大写的单词」PS 存在 Txt2 里，这里记私有键。' })],
    async () => {
      await apply({ hyphenate: on.checked, hyphWordSize: clampIn(ws, 2, 25, 6), hyphPre: clampIn(pre, 1, 15, 2), hyphPost: clampIn(post, 1, 15, 2),
        hyphLimit: clampIn(lim, 0, 25, 8), hyphZone: clampIn(zone, 0, 720, 36), hyphCaps: caps.checked ? undefined : false });
      return true;
    });
  }
  
  const customKinsoku = () => { try { const s = ctx.sheets(); return Array.isArray(s.kinsoku) ? s.kinsoku : []; } catch { return []; } };
  function kinsokuChars(name) {
    if (!name || name === 'hard' || name === 'soft' || name === 'none') return null;
    const k = customKinsoku().find(x => x.name === name);
    return k ? { kinsokuNoStart: k.noStart || '', kinsokuNoEnd: k.noEnd || '' } : null;
  }
  
  function kinsokuDialog() {
    let list = customKinsoku().map(x => ({ ...x }));
    const v = vals();
    let cur = kinsokuKey(v); if (cur === 'none') cur = 'hard';
    const sel = mk('select'); sel.dataset.attr = 'cp-kin-set';
    const tas = { noStart: mk('textarea', { rows: 3 }), noEnd: mk('textarea', { rows: 2 }), hanging: mk('textarea', { rows: 1 }), keep: mk('textarea', { rows: 1 }) };
    for (const [k, t] of Object.entries(tas)) { t.dataset.attr = 'cp-kin-' + k; t.addEventListener('input', () => { const c = setOf(cur); if (c && !c.builtin) c.obj[k] = t.value.replace(/\s+/g, ''); }); }
    const setOf = key => key === 'hard' || key === 'soft' ? { builtin: true, obj: KINSOKU_BUILTIN[key] } : key.startsWith('k:') ? (o => o ? { builtin: false, obj: o } : null)(list.find(x => x.name === key.slice(2))) : null;
    const fill = () => {
      sel.textContent = '';
      sel.append(new Option('JIS 严格', 'hard'), new Option('JIS 宽松', 'soft'));
      for (const k of list) sel.append(new Option(k.name, 'k:' + k.name));
      if (!setOf(cur)) cur = 'hard';
      sel.value = cur;
      const c = setOf(cur);
      for (const [k, t] of Object.entries(tas)) { t.value = c.obj[k] || ''; t.readOnly = c.builtin; }
      delBtn.disabled = c.builtin;
    };
    sel.onchange = () => { cur = sel.value; fill(); };
    const newBtn = mk('button', { type: 'button', textContent: '新建集…' }), delBtn = mk('button', { type: 'button', textContent: '删除集' });
    newBtn.dataset.attr = 'cp-kin-new'; delBtn.dataset.attr = 'cp-kin-del';
    newBtn.onclick = async () => {
      let n = 1; while (list.some(x => x.name === '避头尾集 ' + n)) n++;
      const name = await askName('新建集', '避头尾集 ' + n, '以当前所选集合为基础');
      if (name == null) return; const nm = String(name).trim(); if (!nm || nm === 'JIS 严格' || nm === 'JIS 宽松' || list.some(x => x.name === nm)) { shell.status('名称为空或已存在'); return; }
      const base = setOf(cur).obj;
      list.push({ name: nm, noStart: base.noStart, noEnd: base.noEnd, keep: base.keep, hanging: base.hanging }); cur = 'k:' + nm; fill();
    };
    delBtn.onclick = () => { if (setOf(cur).builtin) return; list = list.filter(x => 'k:' + x.name !== cur); cur = 'hard'; fill(); };
    fill();
    return dialog('避头尾法则设置', [drow('避头尾设置：', sel), mk('div', { className: 'cp-dlg-tools' }, newBtn, delBtn),
      mk('div', { textContent: '不能位于行首的字符：' }), tas.noStart, mk('div', { textContent: '不能位于行尾的字符：' }), tas.noEnd,
      mk('div', { textContent: '悬挂标点：' }), tas.hanging, mk('div', { textContent: '不可分割的字符：' }), tas.keep,
      mk('div', { className: 'cp-note', textContent: 'PS 自带的两套只读；自定义集合写进 EngineData 的 KinsokuSet（与自带两套同构），画布按「不能位于行首 / 行尾」折行。确定 = 当前段落改用所选集合。' })],
    async () => {
      const s = ctx.sheets();
      if (JSON.stringify(list) !== JSON.stringify(customKinsoku())) ctx.setSheets({ ...s, kinsoku: list }, '避头尾设置');
      await apply({ kinsokuSet: cur.startsWith('k:') ? cur.slice(2) : cur });
      return true;
    });
  }
  
  function mojikumiDialog() {
    const v = vals();
    let cur = v.mojikumi && !/^[1-4]$/.test(v.mojikumi) && moji.some(m => m.name === v.mojikumi) ? v.mojikumi : (moji[0] && moji[0].name) || null;
    const sel = mk('select'); sel.dataset.attr = 'cp-moji-set';
    const ins = Object.fromEntries(MOJI_CLASSES.map(([k]) => [k, numIn(0, { min: -100, max: 200, attr: 'cp-moji-' + k })]));
    const fill = () => {
      sel.textContent = '';
      for (const m of moji) sel.append(new Option(m.name, m.name));
      if (!moji.length) sel.append(new Option('（还没有自定义集合）', ''));
      sel.value = cur || '';
      const m = moji.find(x => x.name === cur);
      for (const [k] of MOJI_CLASSES) { ins[k].value = m ? (m.v[k] ?? MOJI_BASE[k]) : MOJI_BASE[k]; ins[k].disabled = !m; }
    };
    for (const [k] of MOJI_CLASSES) ins[k].onchange = () => { const m = moji.find(x => x.name === cur); if (m) m.v[k] = clampIn(ins[k], -100, 200, MOJI_BASE[k]); };
    sel.onchange = () => { cur = sel.value; fill(); };
    const newBtn = mk('button', { type: 'button', textContent: '新建…' }); newBtn.dataset.attr = 'cp-moji-new';
    const delBtn = mk('button', { type: 'button', textContent: '删除' });
    newBtn.onclick = async () => {
      let n = 1; while (moji.some(x => x.name === '间距组合 ' + (4 + n))) n++;
      const name = await askName('新建间距组合', '间距组合 ' + (4 + n), '以当前所选集合为基础');
      if (name == null) return; const nm = String(name).trim();
      if (!nm || moji.some(x => x.name === nm) || MOJI_BUILTIN.some(x => x[1] === nm)) { shell.status('名称为空或已存在'); return; }
      const base = moji.find(x => x.name === cur);
      moji.push({ name: nm, v: { ...MOJI_BASE, ...(base ? base.v : {}) } }); cur = nm; fill();
    };
    delBtn.onclick = () => { moji = moji.filter(x => x.name !== cur); cur = moji[0] ? moji[0].name : null; fill(); };
    fill();
    const tb = mk('table', {}, mk('tr', {}, mk('th', { textContent: '字符类' }), mk('th', { textContent: '所需值（% 字宽）' })));
    for (const [k, t] of MOJI_CLASSES) tb.append(mk('tr', {}, mk('td', { textContent: t }), mk('td', {}, ins[k])));
    return dialog('间距组合设置', [drow('间距组合：', sel), mk('div', { className: 'cp-dlg-tools' }, newBtn, delBtn), tb,
      mk('div', { className: 'cp-note', textContent: '自定义间距组合存在本机（PS 把自定义间距组合存在 Txt2 里，本编辑器不写 Txt2）；段落选用哪一套记在私有键里。画布预览不改标点间距。确定 = 当前段落改用所选集合。' })],
    async () => { lsSet(LS_MOJI, moji); if (cur) await apply({ mojikumi: cur }); else refresh(); return true; });
  }
  
  function middleEastDialog() {
    const v = vals();
    const dir = mk('select'); for (const [x, t] of [['0', '默认方向'], ['1', '从左到右'], ['2', '从右到左']]) dir.append(new Option(t, x)); dir.value = String(v.charDirection || 0); dir.dataset.attr = 'cp-me-dir';
    const num = mk('select'); for (const [x, t] of [['0', '阿拉伯数字'], ['1', '印地语数字']]) num.append(new Option(t, x)); num.value = v.hindiNumbers ? '1' : '0'; num.dataset.attr = 'cp-me-digits';
    const ka = mk('select'); for (const [x, t] of [['0', '无'], ['1', '短'], ['2', '中'], ['3', '长'], ['4', '风格化']]) ka.append(new Option(t, x)); ka.value = String(v.kashida || 0); ka.dataset.attr = 'cp-me-kashida';
    return dialog('中东语言特性', [drow('字符方向：', dir), drow('数字：', num), drow('插入连接线：', ka),
      mk('div', { className: 'cp-note', textContent: '写进 EngineData（CharacterDirection / HindiNumbers / Kashida）；画布预览不做阿拉伯文字形连接。' })],
    async () => { await apply({ charDirection: +dir.value, hindiNumbers: num.value === '1', kashida: +ka.value }); return true; });
  }

  
  const tgl = (label, key, v, extra = {}) => ({ label, checked: !!v[key], run: () => apply({ [key]: !v[key] }), ...extra });
  panels.setPanelMenu('character', () => {
    const v = vals(), i = target(), on = ctx.hasDoc();
    const vert = v.orientation === 'vertical';
    return [
      { label: '更改文本方向', disabled: i < 0, why: '先选中一个文字图层', run: () => ctx.applyTextDesc(i, { orientation: vert ? 'horizontal' : 'vertical' }, '文字排列方向').then(refresh) },
      { label: '标准垂直罗马对齐方式', checked: !v.romanUpright, disabled: !on, run: () => apply({ romanUpright: v.romanUpright ? undefined : true }),
        why: '直排文字里的半角西文 / 数字是否转 90°（PS 存在 Txt2 里，这里记私有键；画布按它预览）' },
      tgl('直排内横排', 'tcy', v, { disabled: !on }),
      tgl('分行缩排', 'warichu', v, { disabled: !on }),
      sub('OpenType', () => [...OT_BTNS.map(([key, label]) => ({ label, checked: otOn(v, key), run: () => apply({ [key]: !otOn(v, key) }) })), { sep: true },
        ...OT_FEATURES.filter(([key]) => !OT_BTNS.some(x => x[0] === key)).map(([key, label]) => ({ label: label === '旧式' ? '旧式标准数字' : label, checked: otOn(v, key), run: () => apply({ [key]: !otOn(v, key) }) }))]),
      { sep: true },
      tgl('仿粗体', 'bold', v), tgl('仿斜体', 'italic', v),
      { label: '全部大写字母', checked: v.caps === 'all', run: () => apply({ caps: v.caps === 'all' ? 'none' : 'all' }) },
      { label: '小型大写字母', checked: v.caps === 'small', run: () => apply({ caps: v.caps === 'small' ? 'none' : 'small' }) },
      { label: '上标', checked: v.baseline === 'superscript', run: () => apply({ baseline: v.baseline === 'superscript' ? 'normal' : 'superscript' }) },
      { label: '下标', checked: v.baseline === 'subscript', run: () => apply({ baseline: v.baseline === 'subscript' ? 'normal' : 'subscript' }) },
      tgl('下划线', 'underline', v), tgl('删除线', 'strikethrough', v),
      { sep: true },
      { label: '分数宽度', checked: v.fracWidths !== false, run: () => apply({ fracWidths: v.fracWidths === false ? undefined : false }), why: 'PS 存在 Txt2 里，这里记私有键（画布预览始终按分数宽度排）' },
      tgl('系统版面', 'sysLayout', v, { run: () => apply({ sysLayout: v.sysLayout ? undefined : true }), why: 'PS 存在 Txt2 里，这里记私有键（画布预览不改）' }),
      tgl('无间断', 'noBreak', v),
      { sep: true },
      { label: '中东语言特性…', disabled: !on, run: () => middleEastDialog() },
      { sep: true },
      { label: '复位字符', disabled: !on, run: () => apply(CHAR_RESET) },
    ];
  });
  panels.setPanelMenu('paragraph', () => {
    const v = vals(), on = ctx.hasDoc();
    const composer = (label, every, wr) => ({ label, checked: !!v.everyLineComposer === every && !!v.worldReady === wr, disabled: !on,
      run: () => apply({ everyLineComposer: every, worldReady: wr ? true : undefined }) });
    return [
      { label: '罗马式溢出标点', checked: !!v.hanging, disabled: !on, run: () => apply({ hanging: !v.hanging }) },
      sub('标点溢出', () => [['无', false, false], ['常规', true, false], ['强制', true, true]].map(([t, b, f]) => ({ label: t, checked: !!v.burasagari === b && !!v.burasagariForced === f,
        run: () => apply({ burasagari: b, burasagariForced: f ? true : undefined }) }))),
      sub('避头尾法则类型', () => [['先推入', 0], ['先推出', 1], ['只推出', 2]].map(([t, n]) => ({ label: t, checked: (v.kinsokuOrder || 0) === n, run: () => apply({ kinsokuOrder: n }) }))),
      { label: '顶到顶行距', checked: (v.leadingType || 0) === 1, disabled: !on, run: () => apply({ leadingType: 1 }) },
      { label: '底到底行距', checked: (v.leadingType || 0) === 0, disabled: !on, run: () => apply({ leadingType: 0 }) },
      { sep: true },
      { label: '对齐…', disabled: !on, run: () => justificationDialog() },
      { label: '连字…', disabled: !on, run: () => hyphenationDialog() },
      { sep: true },
      composer('Adobe 单行书写器', false, false), composer('Adobe 多行书写器', true, false),
      composer('Adobe 世界通用单行书写器', false, true), composer('Adobe 世界通用多行书写器', true, true),
      { sep: true },
      { label: '避头尾设置…', disabled: !on, run: () => kinsokuDialog() },
      { label: '间距组合设置…', disabled: !on, run: () => mojikumiDialog() },
      { sep: true },
      { label: '复位段落', disabled: !on, run: () => apply(PARA_RESET) },
    ];
  });

  
  let raf = 0;
  function refresh() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      try { if (panels.isOpen('character')) CH.render(); } catch (e) { console.warn('字符面板', e); }
      try { if (panels.isOpen('paragraph')) PA.render(); } catch (e) { console.warn('段落面板', e); }
    });
  }
  panels.onChange(refresh);
  
  function toggle() {
    const vis = panels.isVisible('character') || panels.isVisible('paragraph');
    if (vis) { panels.hide('character'); panels.hide('paragraph'); }
    else panels.showGrouped('character', ['paragraph']);
    refresh();
  }
  const isToggleKey = e => e.code === 'KeyT' && !e.shiftKey && (((e.metaKey || e.ctrlKey) && !e.altKey) || (!ctx.isMac() && e.altKey && !e.ctrlKey && !e.metaKey));
  refresh();
  return { refresh, toggle, isToggleKey, newTextPatch, kinsokuChars, justificationDialog, hyphenationDialog, kinsokuDialog, mojikumiDialog, middleEastDialog, vals, apply };
}
