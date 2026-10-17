















import { serializeLbResource, parseLbResource } from '../../core/layer-comps.js';
import { lbIcon } from './lb-icons.js';

export const MEASURE_RESOURCE_ID = 4094;
const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const clone = o => JSON.parse(JSON.stringify(o));
const LS_POINTS = 'psd_editor.measureDataPoints';


const POINTS = [
  ['label', '标签', 'all'], ['date', '日期和时间', 'all'], ['doc', '文档', 'all'], ['source', '源', 'all'],
  ['scale', '比例', 'all'], ['scaleUnit', '比例单位', 'all'], ['scaleFactor', '比例因子', 'all'],
  ['count', '计数', 'all'], ['area', '面积', 'sel'], ['perimeter', '周长', 'sel'], ['circularity', '圆度', 'sel'],
  ['height', '高度', 'sel'], ['width', '宽度', 'sel'], ['grayMin', '灰度值（最小值）', 'sel'], ['grayMax', '灰度值（最大值）', 'sel'],
  ['grayMean', '灰度值（平均值）', 'sel'], ['grayMedian', '灰度值（中间值）', 'sel'], ['intDensity', '积分密度', 'sel'], ['histogram', '直方图', 'sel'],
  ['length', '长度', 'ruler'], ['angle', '角度', 'ruler'],
];

const POINT_GROUPS = [['通用', ['label', 'date', 'doc', 'source', 'scale', 'scaleUnit', 'scaleFactor', 'count']],
  ['选区', ['area', 'perimeter', 'circularity', 'height', 'width', 'grayMin', 'grayMax', 'grayMean', 'grayMedian', 'intDensity', 'histogram']],
  ['标尺工具', ['length', 'angle']]];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let C = null;
let S = fresh();
function fresh() { return { scale: { px: 1, len: 1, unit: '像素' }, useScale: false, log: [], sel: [], dirty: false, n: 0 }; }
let points = new Set(lsGet(LS_POINTS, POINTS.map(p => p[0])));

export const MEASURE = {
  capture: () => clone(S), apply: v => { S = v ? clone(v) : fresh(); render(); },
  snap: () => clone({ scale: S.scale, log: S.log, n: S.n }), restore: v => { if (v && v.scale) { S.scale = clone(v.scale); S.log = clone(v.log || []); S.n = v.n || 0; S.sel = S.sel.filter(id => S.log.some(r => r.id === id)); render(); } },
  load(buf, info) {
    const prev = S; S = fresh();                                   
    if (prev && prev._doc && prev._doc === C.docName()) { S.log = prev.log; S.n = prev.n; S.useScale = prev.useScale; }
    S._doc = C.docName();
    try { const r = info.resources.find(x => x.id === MEASURE_RESOURCE_ID); const j = r && r._raw ? parseLbResource(r._raw) : null; if (j && j.scale && j.scale.px > 0) S.scale = j.scale; } catch {}
    render();
  },
  needsWrite: () => S.dirty,
  writeInto(buf, h) {
    const def = S.scale.px === 1 && S.scale.len === 1 && S.scale.unit === '像素';
    return def ? h.removeImageResource(buf, MEASURE_RESOURCE_ID) : h.writeImageResource(buf, MEASURE_RESOURCE_ID, serializeLbResource({ scale: S.scale }));
  },
  
  useScale: () => S.useScale, setUseScale: v => { S.useScale = !!v; }, scale: () => S.scale,
  
  fmtLen: px => S.useScale ? { v: px * S.scale.len / S.scale.px, unit: S.scale.unit } : null,
};
const factor = () => S.scale.len / S.scale.px;                   


async function scaleUI() {
  const rm = C.rulerMetrics();
  const v = await C.formDialog('测量比例', [
    { key: 'preset', label: '预设', type: 'select', value: 'custom', options: [['custom', '自定'], ['default', '默认（1 像素 = 1 像素）']] },
    { key: 'px', label: '像素长度', type: 'number', value: rm ? Math.round(rm.length * 100) / 100 : S.scale.px, min: 0.01, max: 1e6, step: 0.01, showIf: o => o.preset === 'custom' },
    { key: 'len', label: '逻辑长度', type: 'number', value: S.scale.len, min: 0.0001, max: 1e9, step: 0.0001, showIf: o => o.preset === 'custom' },
    { key: 'unit', label: '逻辑单位', type: 'text', value: S.scale.unit, showIf: o => o.preset === 'custom' },
    { type: 'note', label: rm ? '像素长度已按当前标尺线填好（PS 同：先用标尺工具量一段已知长度，再打开这个对话框）。' : '提示：先用标尺工具（I）量一段已知长度的物体，再打开这个对话框，像素长度会自动填上。' },
  ]);
  if (!v) return false;
  C.history('设置测量比例');
  S.scale = v.preset === 'default' ? { px: 1, len: 1, unit: '像素' } : { px: +v.px || 1, len: +v.len || 1, unit: String(v.unit || '').trim() || '像素' };
  S.dirty = true; S.useScale = v.preset !== 'default';
  C.syncAuxBar(); render();
  C.status(`测量比例：${S.scale.px} 像素 = ${S.scale.len} ${S.scale.unit}`);
  return true;
}


async function pointsUI() {
  const all = POINTS.map(p => p[0]), isAll = all.every(k => points.has(k));
  const fields = [{ key: 'preset', label: '数据点', type: 'select', value: isAll ? 'default' : 'custom', options: [['default', '默认（全部）'], ['custom', '自定']] }];
  for (const [g, keys] of POINT_GROUPS) {
    fields.push({ type: 'note', label: g + '：', showIf: o => o.preset === 'custom' });
    for (const k of keys) { const P = POINTS.find(p => p[0] === k); fields.push({ key: k, label: P[1], type: 'check', value: points.has(k), showIf: o => o.preset === 'custom' }); }
  }
  fields.push({ type: 'note', label: '计数工具：计数（与「通用 › 计数」为同一列）', showIf: o => o.preset === 'custom' });
  const v = await C.formDialog('选择数据点', fields);
  if (!v) return false;
  points = new Set(v.preset === 'default' ? all : all.filter(k => v[k]));
  lsSet(LS_POINTS, [...points]); render();
  return true;
}


function selectionRows(sel, comp, W) {
  const { x: sx, y: sy, width: sw, height: sh, data } = sel;
  const lab = new Int32Array(sw * sh).fill(-1), comps = [];
  const gray = (x, y) => { if (!comp) return 0; const o = (y * W + x) * 4; return 0.299 * comp[o] + 0.587 * comp[o + 1] + 0.114 * comp[o + 2]; };
  const inside = i => data[i] >= 128;
  for (let i0 = 0; i0 < sw * sh; i0++) {
    if (!inside(i0) || lab[i0] >= 0) continue;
    const id = comps.length, st = [i0]; lab[i0] = id;
    const c = { area: 0, cov: 0, per: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, grays: [] };
    while (st.length) {
      const i = st.pop(), x = i % sw, y = (i - x) / sw;
      c.area++; c.cov += data[i] / 255;
      if (x < c.x0) c.x0 = x; if (y < c.y0) c.y0 = y; if (x > c.x1) c.x1 = x; if (y > c.y1) c.y1 = y;
      c.grays.push(gray(sx + x, sy + y));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) { c.per++; continue; }
        const j = ny * sw + nx;
        if (!inside(j)) { c.per++; continue; }
        if (lab[j] < 0) { lab[j] = id; st.push(j); }
      }
    }
    comps.push(c);
    if (comps.length > 500) break;
  }
  const f = factor();
  const stat = (c, n) => {
    const g = c.grays.slice().sort((a, b) => a - b), mean = g.reduce((s, v) => s + v, 0) / (g.length || 1);
    const area = c.cov * f * f, per = c.per * f;
    return { count: n, area, perimeter: per, circularity: per > 0 ? Math.min(1, 4 * Math.PI * area / (per * per)) : 0,
      width: (c.x1 - c.x0 + 1) * f, height: (c.y1 - c.y0 + 1) * f,
      grayMin: g[0] ?? 0, grayMax: g[g.length - 1] ?? 0, grayMean: mean, grayMedian: g.length ? g[g.length >> 1] : 0, intDensity: area * mean,
      histogram: (() => { const h = new Array(256).fill(0); for (const v of g) h[Math.max(0, Math.min(255, Math.round(v)))]++; return h; })() };
  };
  const rows = comps.map(c => stat(c, 1));
  if (comps.length > 1) {                                        
    const all = { area: 0, cov: 0, per: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, grays: [] };
    for (const c of comps) { all.cov += c.cov; all.per += c.per; all.x0 = Math.min(all.x0, c.x0); all.y0 = Math.min(all.y0, c.y0); all.x1 = Math.max(all.x1, c.x1); all.y1 = Math.max(all.y1, c.y1); all.grays.push(...c.grays); }
    rows.unshift({ ...stat(all, comps.length), summary: true });
  }
  return rows;
}
function record() {
  if (!C.hasDoc()) return false;
  const st = C.st(), now = new Date();
  const common = () => ({ id: ++S.n, date: now.toLocaleString('zh-CN', { hour12: false }), doc: C.docName(), scale: `${S.scale.px} 像素 = ${S.scale.len} ${S.scale.unit}`, scaleUnit: S.scale.unit, scaleFactor: factor() });
  let rows = [];
  if (st.selection) {
    const sel = st.selection, comp = C.composite();
    const rs = selectionRows(sel, comp, st.docW);
    if (!rs.length) { C.status('选区是空的：没有可以测量的区域'); return false; }
    rows = rs.map((r, k) => ({ ...common(), source: '选区', label: `测量 ${S.n}${rs.length > 1 ? (r.summary ? '' : ` - ${k}`) : ''}`, ...r }));
  } else if (C.tool() === 'count') {
    const gs = C.countGroups(); if (!gs.length) { C.status('没有计数：先用计数工具在图像上单击'); return false; }
    rows = gs.map(g => ({ ...common(), source: '计数工具', label: `${g['Nm  '] || '计数组'}`, count: (g.countObjectList || []).length }));
  } else {
    const m = C.rulerMetrics();
    if (!m) { C.status('没有可记录的测量：先建立选区、用标尺工具拉一条线，或用计数工具计数'); return false; }
    rows = [{ ...common(), source: '标尺工具', label: `测量 ${S.n}`, length: m.length * factor(), angle: m.displayAngle, count: 1 }];
    if (m.length2 != null) rows[0].length2 = m.length2 * factor();
  }
  C.history('记录测量');
  for (const r of rows) { r.id = r.id || ++S.n; S.log.push(r); }
  if (!C.panels.isVisible('measurementLog')) { try { C.panels.show('measurementLog'); } catch {} }
  render();
  C.status(`已记录 ${rows.length} 条测量`);
  return rows.length;
}


async function scaleMarkerUI() {
  const v = await C.formDialog('测量比例标记', [
    { key: 'len', label: '长度', type: 'number', value: Math.max(1, Math.round(S.scale.len * 10) / 10), min: 0.0001, max: 1e9, step: 0.1, unit: S.scale.unit },
    { key: 'font', label: '字体', type: 'text', value: 'sans-serif' },
    { key: 'size', label: '字体大小', type: 'number', value: 18, min: 4, max: 400, unit: '像素' },
    { key: 'text', label: '显示文本', type: 'check', value: true },
    { key: 'pos', label: '文本位置', type: 'select', value: 'bottom', options: [['top', '顶'], ['bottom', '底']] },
    { key: 'color', label: '颜色', type: 'select', value: 'black', options: [['black', '黑色'], ['white', '白色']] },
  ]);
  if (!v) return false;
  const st = C.st(), pxLen = v.len / factor();
  if (!(pxLen >= 1) || pxLen > st.docW) { await C.alertDialog(`${v.len} ${S.scale.unit} 换算成 ${Math.round(pxLen)} 像素，放不进画布（宽 ${st.docW}）。调整长度或测量比例。`, { title: '测量比例标记' }); return false; }
  await C.newLayer('测量比例标记');
  const i = C.selected()[0]; if (i == null) return false;
  const col = v.color === 'white' ? '#fff' : '#000';
  C.replacePixels(i, (g) => {
    const m = Math.round(Math.max(10, st.docW * 0.03)), bh = Math.max(3, Math.round(v.size / 4));
    const x = m, y = st.docH - m - (v.text && v.pos === 'bottom' ? v.size + 6 : 0) - bh;
    g.fillStyle = col; g.fillRect(x, y, pxLen, bh);
    g.fillRect(x, y - bh, Math.max(1, bh / 2), bh * 3); g.fillRect(x + pxLen - Math.max(1, bh / 2), y - bh, Math.max(1, bh / 2), bh * 3);
    if (v.text) {
      g.font = `${v.size}px ${v.font || 'sans-serif'}`; g.textAlign = 'center'; g.textBaseline = v.pos === 'top' ? 'bottom' : 'top';
      g.fillText(`${v.len} ${S.scale.unit}`, x + pxLen / 2, v.pos === 'top' ? y - bh - 4 : y + bh + 4);
    }
  });
  C.refresh();
  C.status(`已置入比例标记：${v.len} ${S.scale.unit}（${Math.round(pxLen)} 像素）`);
  return true;
}


const fmtV = (k, v) => v == null ? '' : Array.isArray(v) ? `（256 级，导出为单独的 CSV）` : typeof v === 'number' ? (k === 'count' ? String(v) : (Math.round(v * 1000) / 1000).toString()) : String(v);
function cols() { const used = new Set(); for (const r of S.log) for (const k in r) used.add(k); return POINTS.filter(([k]) => points.has(k) && (used.has(k) || ['label', 'source'].includes(k))); }
function csv(rows) {
  const cs = cols(), esc = s => /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const lines = [['', ...cs.map(c => c[1])].map(esc).join(',')];
  rows.forEach(r => lines.push([String(r.id), ...cs.map(([k]) => fmtV(k, r[k]))].map(esc).join(',')));
  return '﻿' + lines.join('\r\n');
}
function exportCsv(onlySel = true) {
  const rows = onlySel && S.sel.length ? S.log.filter(r => S.sel.includes(r.id)) : S.log;
  if (!rows.length) return false;
  const text = csv(rows);
  MEASURE._lastCsv = text;
  const base = String(C.docName()).replace(/\.[^.]+$/, '');
  C.download(`${base}_测量记录.csv`, new Blob([text], { type: 'text/csv' }));
  
  const hs = points.has('histogram') ? rows.filter(r => Array.isArray(r.histogram)) : [];
  if (hs.length) {
    const lines = [['测量', ...Array.from({ length: 256 }, (_, i) => String(i))].join(',')];
    for (const r of hs) lines.push([String(r.label || r.id).replace(/[",\r\n]/g, ' '), ...r.histogram].join(','));
    MEASURE._lastHistCsv = '\ufeff' + lines.join('\r\n');
    setTimeout(() => C.download(`${base}_测量记录_直方图.csv`, new Blob([MEASURE._lastHistCsv], { type: 'text/csv' })), 300);
  }
  return rows.length;
}
let root = null, sortBy = { k: null, dir: 1 };
const STYLE = `.ml-panel{display:flex;flex-direction:column;height:100%;min-height:100px;font-size:11px}
.ml-top{display:flex;gap:4px;padding:3px 6px;align-items:center;border-bottom:1px solid #1d1d1d}
.ml-top .grow{flex:1}
.ml-wrap{flex:1;overflow:auto}
.ml-panel table{border-collapse:collapse;white-space:nowrap}
.ml-panel th,.ml-panel td{padding:2px 6px;border-right:1px solid #3a3a3a;border-bottom:1px solid #333;text-align:right}
.ml-panel th{position:sticky;top:0;background:#2b2b2b;font-weight:normal;opacity:.85}
.ml-panel td.l{text-align:left}
.ml-panel tr.on td{background:var(--ps-sel,#2f4d77)}
.ml-empty{padding:10px;opacity:.6;line-height:1.5}`;
function render() {
  const sec = C && C.panels.sectionOf('measurementLog'); if (!sec) return;
  if (!root || !sec.contains(root)) {
    sec.textContent = '';
    if (!document.getElementById('mlStyle')) document.head.append(mk('style', { id: 'mlStyle', textContent: STYLE }));
    root = mk('div', { className: 'ml-panel' }); sec.append(root);
  }
  root.textContent = '';
  const top = mk('div', { className: 'ml-top' });
  const btn = (t, tip, run, dis) => { const b = mk('button', { type: 'button', textContent: t, title: tip, disabled: !!dis }); b.onclick = run; top.append(b); return b; };
  btn('记录测量', '记录测量（⇧⌘M）', () => record(), !C.hasDoc()).dataset.ml = 'record';
  top.append(mk('span', { className: 'grow' }));
  btn('全选', '选择所有测量', () => { S.sel = S.log.map(r => r.id); render(); }, !S.log.length);
  btn('取消选择', '取消选择所有测量', () => { S.sel = []; render(); }, !S.sel.length);
  btn('导出', '将所选测量（未选则全部）导出为 CSV 文本', () => exportCsv(true), !S.log.length).dataset.ml = 'export';
  const del = mk('button', { type: 'button', className: 'lf-btn', title: '删除所选测量', disabled: !S.sel.length }); del.append(lbIcon('Trashcan', 16));
  del.onclick = () => { C.history('删除测量'); S.log = S.log.filter(r => !S.sel.includes(r.id)); S.sel = []; render(); }; top.append(del);
  root.append(top);
  const wrap = mk('div', { className: 'ml-wrap' });
  if (!S.log.length) wrap.append(mk('div', { className: 'ml-empty', textContent: '还没有测量记录。建立选区、用标尺工具拉一条线或用计数工具计数，然后点「记录测量」（图像 › 分析 › 记录测量，⇧⌘M）。' + (S.scale.px !== 1 || S.scale.len !== 1 ? `\n当前比例：${S.scale.px} 像素 = ${S.scale.len} ${S.scale.unit}` : '') }));
  else {
    const cs = cols(), t = mk('table'), hr = mk('tr', {}, mk('th', { textContent: '' }));
    
    for (const [k, lab] of cs) {
      const th = mk('th', { textContent: lab + (sortBy.k === k ? (sortBy.dir > 0 ? ' ▲' : ' ▼') : ''), title: '单击按「' + lab + '」排序' });
      th.style.cursor = 'pointer';
      th.onclick = () => { sortBy = { k, dir: sortBy.k === k ? -sortBy.dir : 1 }; render(); };
      hr.append(th);
    }
    t.append(hr);
    const rowsSorted = sortBy.k ? S.log.slice().sort((a, b) => { const x = a[sortBy.k], y = b[sortBy.k]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'zh-CN')) * sortBy.dir; }) : S.log;
    for (const r of rowsSorted) {
      const tr = mk('tr', { className: S.sel.includes(r.id) ? 'on' : '' }, mk('td', { textContent: String(r.id).padStart(4, '0') }));
      for (const [k] of cs) tr.append(mk('td', { className: typeof r[k] === 'number' ? '' : 'l', textContent: fmtV(k, r[k]) }));
      tr.onclick = e => { const on = S.sel.includes(r.id); if (e.metaKey || e.ctrlKey || e.shiftKey) S.sel = on ? S.sel.filter(x => x !== r.id) : [...S.sel, r.id]; else S.sel = [r.id]; render(); };
      t.append(tr);
    }
    wrap.append(t);
  }
  root.append(wrap);
}

export function installMeasure(ctx) {
  C = ctx;
  const { R } = ctx;
  R('image.analysis.scale', () => scaleUI(), () => C.hasDoc());
  R('image.analysis.dataPoints', () => pointsUI());
  R('image.analysis.record', () => record(), () => C.hasDoc());
  R('image.analysis.scaleMarker', () => scaleMarkerUI(), () => C.hasDoc());
  C.panels.setPanelMenu('measurementLog', () => [
    { label: '选择数据点…', run: () => pointsUI() },
    { sep: true },
    { label: '导出所选…', run: () => exportCsv(true), disabled: !S.log.length },
    { label: '全选', run: () => { S.sel = S.log.map(r => r.id); render(); }, disabled: !S.log.length },
    { label: '取消选择', run: () => { S.sel = []; render(); }, disabled: !S.sel.length },
    { label: '删除所选测量', run: () => { C.history('删除测量'); S.log = S.log.filter(r => !S.sel.includes(r.id)); S.sel = []; render(); }, disabled: !S.sel.length },
    { label: '删除所有测量', run: () => { C.history('删除测量'); S.log = []; S.sel = []; render(); }, disabled: !S.log.length },
  ]);
  try { C.panels.onChange(() => render()); } catch {}
  render();
  return { MEASURE, record, scaleUI, scaleMarkerUI, exportCsv, render };
}
