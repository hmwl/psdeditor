
















import { actions } from './actions.js';
import { panels } from './panels.js';
import { psPanels } from './ps-panels.js';
import { uiIcon } from './icons.js';
import { PATH_UI_ICONS } from './path-icons.js';
import { DOC_EXT } from './layerb.js';
import { encodePathName, decodePathName } from './path-name-codec.js';
import { addAlphaChannel, removeAlphaChannel, renameAlphaChannel, setAlphaChannel, setAlphaDisplay, rgbDisplayColor, listAlphaChannels, CHANNEL_KIND } from '../../core/psd-channels.js';
import { parseImageResources, resourceHandler } from '../../core/psd-resources.js';
import { writeImageResource, removeImageResource } from '../../core/psd-write.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const CHAN_NAMES = { 3: ['RGB', '红', '绿', '蓝'], 9: ['Lab', '明度', 'a', 'b'], 1: ['灰色'], 8: ['灰色'], 0: ['位图'], 4: ['CMYK', '青色', '洋红', '黄色', '黑色'], 7: ['多通道'] };
const SIZES = { none: 0, small: [22, 17], medium: [30, 23], large: [46, 35] };
const LS_CH = 'psd_editor.channelsPanel.opts', LS_PA = 'psd_editor.pathsPanel.opts';
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const unhex = h => [1, 3, 5].map(k => parseInt(String(h).slice(k, k + 2), 16) || 0);
const dispRGB = d => (d && d.colorSpace === 0 ? d.components.slice(0, 3).map(v => Math.round(v / 257)) : [255, 0, 0]);
const loadOpts = (k, d) => { try { return { ...d, ...(JSON.parse(localStorage.getItem(k) || 'null') || {}) }; } catch { return { ...d }; } };
const saveOpts = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch {} };

export function installChanPathPanels(C) {
  const st = C.st;
  const note = t => C.status(t);

  
  const chOpts = loadOpts(LS_CH, { thumbSize: 'small' });
  if (!SIZES[chOpts.thumbSize] && chOpts.thumbSize !== 'none') chOpts.thumbSize = 'small';
  const V = { key: null, colorsOn: true, extraOn: new Set(), active: null, seenSpot: new Set() };
  const extras = () => (C.alphaList() || []);
  const kindOf = e => (e && e.display ? e.display.mode | 0 : 0);   
  function syncKey() {
    const s = st();
    const k = s.doc ? (s.docName || '') + '|' + s.docW + 'x' + s.docH : null;
    if (k !== V.key) { V.key = k; V.colorsOn = true; V.extraOn.clear(); V.active = null; V.seenSpot.clear(); }
    const ex = extras(), ats = new Set(ex.map(e => e.at));
    for (const a of [...V.extraOn]) if (!ats.has(a)) V.extraOn.delete(a);
    if (V.active != null && !ats.has(V.active)) { V.active = null; V.colorsOn = true; }
    for (const e of ex) if (kindOf(e) === 2 && !V.seenSpot.has(e.name + '#' + e.at)) { V.seenSpot.add(e.name + '#' + e.at); V.extraOn.add(e.at); }   
    if (!V.colorsOn && !V.extraOn.size) V.colorsOn = true;
  }
  const redraw = () => { C.renderPreview(); render(); };

  
  
  function applyView(ctx) {
    const s = st();
    if (!s.doc || !C.isPreviewCanvas(ctx.canvas)) return false;
    syncKey();
    const ex = extras().filter(e => V.extraOn.has(e.at));
    if (!ex.length) return false;
    const W = s.docW, H = s.docH;
    if (ctx.canvas.width !== W || ctx.canvas.height !== H) return false;
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    let rest = ex;
    if (!V.colorsOn) {
      const first = ex[0], g = C.alphaGray(first.at);
      if (g) {
        if (kindOf(first) === 2) {                    
          const [r, gg, b] = dispRGB(first.display);
          for (let i = 0, o = 0; i < g.length; i++, o += 4) { const k = (255 - g[i]) / 255; d[o] = 255 + (r - 255) * k; d[o + 1] = 255 + (gg - 255) * k; d[o + 2] = 255 + (b - 255) * k; d[o + 3] = 255; }
        } else for (let i = 0, o = 0; i < g.length; i++, o += 4) { d[o] = d[o + 1] = d[o + 2] = g[i]; d[o + 3] = 255; }
      }
      rest = ex.slice(1);
    }
    for (const e of rest) {
      const g = C.alphaGray(e.at); if (!g) continue;
      const [r, gg, b] = dispRGB(e.display), op = Math.max(0, Math.min(100, e.display ? e.display.opacity : 50)) / 100;
      if (kindOf(e) === 2) {
        
        for (let i = 0, o = 0; i < g.length; i++, o += 4) {
          const cov = (255 - g[i]) / 255; if (!cov) continue;
          for (let c = 0; c < 3; c++) { const base = d[o + c], ink = [r, gg, b][c], mul = base * ink / 255, eff = mul + (ink - mul) * op; d[o + c] = base + (eff - base) * cov; }
          d[o + 3] = Math.max(d[o + 3], Math.round(cov * 255));
        }
      } else {
        
        for (let i = 0, o = 0; i < g.length; i++, o += 4) {
          const a = (255 - g[i]) / 255 * op; if (!a) continue;
          d[o] += (r - d[o]) * a; d[o + 1] += (gg - d[o + 1]) * a; d[o + 2] += (b - d[o + 2]) * a;
          d[o + 3] = Math.max(d[o + 3], Math.round(a * 255));
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return !V.colorsOn;
  }

  
  function thumbOf(src, w, h, gray) {
    const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2;
    cv.style.cssText = `display:block;width:${w}px;height:${h}px`;
    const g = cv.getContext('2d', gray != null ? { willReadFrequently: true } : undefined);   
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    if (src && src.width && src.height) {
      const k = Math.min(cv.width / src.width, cv.height / src.height), dw = src.width * k, dh = src.height * k;
      g.drawImage(src, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
      if (gray != null) { const im = g.getImageData(0, 0, cv.width, cv.height), p = im.data; for (let o = 0; o < p.length; o += 4) { const v = p[o + gray]; p[o] = p[o + 1] = p[o + 2] = v; } g.putImageData(im, 0, 0); }
    }
    return cv;
  }
  function render() {
    const el = document.getElementById('chanList'); if (!el) return;
    el.innerHTML = '';
    const s = st();
    el.className = 'chan-list chp-ts-' + chOpts.thumbSize;
    if (!s.doc) return;
    syncKey();
    const sz = SIZES[chOpts.thumbSize] || [22, 17];
    const view = C.chanView() || { single: null, off: new Set(), supported: true };
    const names = CHAN_NAMES[s.doc.mode] || ['合成'];
    const src = C.compositeThumb();
    const activeColor = V.active == null;
    names.forEach((n, i) => {
      const isComp = names.length > 1 && i === 0;
      const c = isComp ? null : (names.length > 1 ? i - 1 : 0);
      const on = V.colorsOn && (isComp ? (view.single === null && !view.off.size) : (!view.off.has(c) && (view.single === null || view.single === c)));
      const cur = activeColor && (isComp ? view.single === null : view.single === c);
      const row = mk('div', { className: 'chan-row' + (cur ? ' cur' : '') });
      row.dataset.chan = isComp ? 'composite' : String(c);
      const eye = mk('span', { className: 'eye' + (on ? '' : ' off'), title: isComp ? '显示 / 隐藏全部颜色通道' : `显示 / 隐藏「${n}」通道` });
      eye.append(uiIcon(on ? 'eye' : 'eye-off', 12));
      const th = mk('span', { className: 'cthumb', title: '⌘/Ctrl+点击 = 载入为选区（⇧ 添加 / ⌥ 减去 / ⇧⌥ 交叉）' });
      if (sz) th.append(thumbOf(src, sz[0], sz[1], view.supported ? c : null));
      const nm = mk('span', { className: 'cname', textContent: n });
      const key = mk('span', { className: 'ckey', textContent: (C.isMac ? '⌘' : 'Ctrl+') + (2 + i) });
      row.append(eye, th, nm, key);
      if (!view.supported) { row.style.opacity = '.65'; row.title = 'CMYK / 多通道文档的预览是合成后的 RGB，没法在这里单独看某一个通道'; el.append(row); return; }
      eye.onclick = e => {
        e.stopPropagation();
        if (!V.colorsOn) { V.colorsOn = true; C.setChannelView({ single: null }); return redraw(); }
        if (isComp) { if (V.extraOn.size) { V.colorsOn = false; return redraw(); } C.setChannelView({ toggle: 'all' }); }
        else C.setChannelView({ toggle: c });
        render();
      };
      th.addEventListener('click', e => {
        if (!(e.metaKey || e.ctrlKey)) return;
        e.stopPropagation();
        C.graySelection(C.colorChannelGray(c), modeOf(e), '载入通道选区');
      });
      row.onclick = e => {
        if (e.metaKey || e.ctrlKey) return;
        V.active = null; V.colorsOn = true;
        for (const x of extras()) if (kindOf(x) !== 2) V.extraOn.delete(x.at);
        C.setChannelView({ single: isComp ? null : c });
        redraw();
      };
      el.append(row);
    });
    for (const a of extras()) {
      const on = V.extraOn.has(a.at), k = kindOf(a);
      const row = mk('div', { className: 'chan-row chan-alpha' + (V.active === a.at ? ' cur' : '') + (k === 2 ? ' chan-spot' : '') });
      row.dataset.alpha = String(a.at);
      const eye = mk('span', { className: 'eye' + (on ? '' : ' off'), title: '显示 / 隐藏这条通道' });
      eye.append(uiIcon(on ? 'eye' : 'eye-off', 12));
      const th = mk('span', { className: 'cthumb', title: '⌘/Ctrl+点击 = 载入为选区；双击 = 通道选项…' });
      if (sz) { const t = C.alphaThumb(a.at, sz[0] * 2, sz[1] * 2); if (t) { const cv = mk('canvas', { width: t.width, height: t.height }); cv.getContext('2d').drawImage(t, 0, 0); cv.style.cssText = `display:block;width:${sz[0]}px;height:${sz[1]}px`; th.append(cv); } }
      const nm = mk('span', { className: 'cname', textContent: a.name, title: '双击改名' });
      const keyIdx = names.length + 2 + extras().indexOf(a);          
      const key = mk('span', { className: 'ckey', textContent: keyIdx <= 9 ? (C.isMac ? '⌘' : 'Ctrl+') + keyIdx : '' });
      row.append(eye, th, nm, key);
      eye.onclick = e => { e.stopPropagation(); if (on) V.extraOn.delete(a.at); else V.extraOn.add(a.at); if (!V.colorsOn && !V.extraOn.size) V.colorsOn = true; redraw(); };
      th.addEventListener('click', e => { if (!(e.metaKey || e.ctrlKey)) return; e.stopPropagation(); loadExtraSelection(a.at, modeOf(e)); });
      th.addEventListener('dblclick', e => { e.stopPropagation(); channelOptionsDialog(a.at); });
      nm.addEventListener('dblclick', e => { e.stopPropagation(); renameExtra(a.at); });
      row.onclick = e => {
        if (e.metaKey || e.ctrlKey) return;
        if (e.shiftKey) { V.extraOn.add(a.at); V.active = a.at; return redraw(); }
        V.active = a.at; V.colorsOn = false; V.extraOn = new Set([a.at]);
        redraw();
      };
      el.append(row);
    }
    syncFoot();
  }
  const modeOf = e => (e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace');
  function selGrayOf(at) {
    const e = extras().find(x => x.at === at), g = C.alphaGray(at);
    if (!g) return null;
    return kindOf(e) === 1 ? g.map(v => 255 - v) : g;       
  }
  function loadExtraSelection(at, mode) {
    const g = selGrayOf(at);
    if (!g) { note('这条通道的像素现在读不出来'); return false; }
    return C.graySelection(g, mode, '载入通道选区');
  }

  
  const why = () => C.alphaWhy();
  const activeExtra = () => (V.active != null ? extras().find(e => e.at === V.active) || null : null);
  
  const rewrite = (label, fn) => C.structural(label, async base => ({ buf: fn(base), sel: st().selLayer }));
  const newAt = buf => listAlphaChannels(buf).length - 1;
  const nextName = p => { const used = new Set(extras().map(e => e.name)); let n = 1; while (used.has(`${p} ${n}`)) n++; return `${p} ${n}`; };

  async function newChannel(ask, fromSelection) {
    if (why()) { note(why()); return false; }
    const s = st(), W = s.docW, H = s.docH;
    let o = { name: nextName('Alpha'), kind: 'masked', color: '#ff0000', opacity: 50 };
    if (ask) {
      const v = await C.dialogs.formDialog('新建通道', [
        { key: 'name', label: '名称(N):', type: 'text', value: o.name },
        { type: 'note', label: '色彩指示：' },
        { key: 'kind', label: '　', type: 'select', value: 'masked', options: [['masked', '被蒙版区域(M)'], ['selected', '所选区域(S)']] },
        { type: 'note', label: '颜色' },
        { key: 'color', label: '颜色', type: 'color', value: o.color },
        { key: 'opacity', label: '不透明度(O):', value: 50, min: 0, max: 100, unit: '%' },
      ]);
      if (!v) return false;
      o = { ...o, ...v, name: String(v.name || '').trim() || o.name };
    }
    const selG = fromSelection && s.selection ? C.selectionGray() : null;
    let gray = selG ? Uint8Array.from(selG) : new Uint8Array(W * H);
    if (o.kind === 'selected') for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];   
    const ok = await rewrite(fromSelection ? '存储选区' : '新建通道', buf => {
      let b = addAlphaChannel(buf, { name: o.name, gray });
      return setAlphaDisplay(b, newAt(b), { ...rgbDisplayColor(unhex(o.color)), opacity: +o.opacity, mode: o.kind === 'selected' ? CHANNEL_KIND.selected : CHANNEL_KIND.masked });
    });
    if (ok) { const e = extras().find(x => x.name === o.name); if (e) { V.active = e.at; V.colorsOn = false; V.extraOn = new Set([e.at]); redraw(); } }
    return ok;
  }
  async function newSpotChannel() {
    if (why()) { note(why()); return false; }
    const v = await C.dialogs.formDialog('新建专色通道', [
      { key: 'name', label: '名称(N):', type: 'text', value: nextName('专色') },
      { type: 'note', label: '油墨特性' },
      { key: 'color', label: '颜色:', type: 'color', value: '#ff0000' },
      { key: 'solidity', label: '密度(S):', value: 0, min: 0, max: 100, unit: '%' },
    ]);
    if (!v) return false;
    const s = st(), name = String(v.name || '').trim() || nextName('专色');
    const sg = s.selection ? C.selectionGray() : null;
    const gray = new Uint8Array(s.docW * s.docH).fill(255);                  
    if (sg) for (let i = 0; i < gray.length; i++) gray[i] = 255 - sg[i];    
    const ok = await rewrite('新建专色通道', buf => {
      const b = addAlphaChannel(buf, { name, gray });
      return setAlphaDisplay(b, newAt(b), { ...rgbDisplayColor(unhex(v.color)), opacity: +v.solidity, mode: CHANNEL_KIND.spot });
    });
    if (ok) { const e = extras().find(x => x.name === name); if (e) V.extraOn.add(e.at); redraw(); }
    return ok;
  }
  async function duplicateChannel() {
    const e = activeExtra(); if (!e) { note('先在通道面板里选中一条 Alpha / 专色通道'); return false; }
    const v = await C.dialogs.formDialog('复制通道', [
      { key: 'name', label: `复制：${e.name}　为(A):`, type: 'text', value: e.name + ' 拷贝' },
      { type: 'note', label: '目标' },
      { key: 'target', label: '文档(D):', type: 'select', value: 'this', options: [['this', st().docName || '当前文档'], ['new', '新建']] },
      { key: 'docName', label: '名称(N):', type: 'text', value: '未标题-1', showIf: x => x.target === 'new' },
      { key: 'invert', label: '反相(I)', type: 'check', value: false },
    ]);
    if (!v) return false;
    let g = C.alphaGray(e.at); if (!g) { note('这条通道的像素现在读不出来'); return false; }
    g = v.invert ? g.map(x => 255 - x) : Uint8Array.from(g);
    const name = String(v.name || '').trim() || e.name + ' 拷贝';
    if (v.target === 'new') {
      const s = st(), buf = await C.grayDoc(g, s.docW, s.docH);
      if (!buf) return false;
      return C.openBuffer(buf, (String(v.docName || '').trim() || '未标题-1') + '.psd', `已把通道「${e.name}」复制到新文档`);
    }
    return rewrite('复制通道', buf => {
      const b = addAlphaChannel(buf, { name, gray: g });
      return setAlphaDisplay(b, newAt(b), e.display ? { colorSpace: e.display.colorSpace, components: e.display.components, opacity: e.display.opacity, mode: e.display.mode } : {});
    });
  }
  async function deleteChannel(noAsk) {
    const e = activeExtra();
    if (!e) { note(V.active == null ? '颜色通道删不得（删掉会把文档转成多通道模式，本编辑器不做多通道）' : '先选中要删除的通道'); return false; }
    if (!noAsk && !await C.dialogs.confirmDialog(`要删除通道“${e.name}”吗？`, { okText: '是', cancelText: '否' })) return false;
    const ok = await rewrite('删除通道', buf => removeAlphaChannel(buf, e.at));
    if (ok) { V.active = null; V.colorsOn = true; V.extraOn.clear(); redraw(); }
    return ok;
  }
  async function renameExtra(at) {
    const e = extras().find(x => x.at === at); if (!e) return false;
    const v = await C.dialogs.promptDialog('通道名称', e.name, { label: '名称' });
    if (v == null || !String(v).trim() || String(v).trim() === e.name) return false;
    return rewrite('重命名通道', buf => renameAlphaChannel(buf, at, String(v).trim()));
  }
  async function channelOptionsDialog(at) {
    const e = extras().find(x => x.at === (at != null ? at : V.active));
    if (!e) { note('先在通道面板里选中一条 Alpha / 专色通道（颜色通道没有通道选项）'); return false; }
    const k = kindOf(e), rgb = dispRGB(e.display);
    const spot = k === 2;
    const v = await C.dialogs.formDialog(spot ? '专色通道选项' : '通道选项', spot ? [
      { key: 'name', label: '名称(N):', type: 'text', value: e.name },
      { type: 'note', label: '油墨特性' },
      { key: 'color', label: '颜色:', type: 'color', value: hex(rgb) },
      { key: 'opacity', label: '密度(S):', value: e.display ? e.display.opacity : 0, min: 0, max: 100, unit: '%' },
    ] : [
      { key: 'name', label: '名称(N):', type: 'text', value: e.name },
      { type: 'note', label: '色彩指示：' },
      { key: 'kind', label: '　', type: 'select', value: k === 1 ? 'selected' : 'masked', options: [['masked', '被蒙版区域(M)'], ['selected', '所选区域(S)'], ['spot', '专色(P)']] },
      { type: 'note', label: '颜色' },
      { key: 'color', label: '颜色', type: 'color', value: hex(rgb) },
      { key: 'opacity', label: '不透明度(O):', value: e.display ? e.display.opacity : 50, min: 0, max: 100, unit: '%' },
    ]);
    if (!v) return false;
    const name = String(v.name || '').trim() || e.name;
    const nk = spot ? 2 : ({ masked: 0, selected: 1, spot: 2 })[v.kind];
    const flip = !spot && nk !== 2 && nk !== k;          
    return rewrite(spot ? '专色通道选项' : '通道选项', buf => {
      let b = name !== e.name ? renameAlphaChannel(buf, e.at, name) : buf;
      if (flip) { const g = C.alphaGray(e.at); if (g) b = setAlphaChannel(b, e.at, g.map(x => 255 - x)); }
      return setAlphaDisplay(b, e.at, { ...rgbDisplayColor(unhex(v.color)), opacity: +v.opacity, mode: nk });
    });
  }
  
  async function mergeSpotChannel() {
    const e = activeExtra();
    if (!e || kindOf(e) !== 2) { note('先在通道面板里选中一条专色通道'); return false; }
    const s0 = st();
    if (C.layerCount() > 1 && !await C.dialogs.confirmDialog('合并专色通道会拼合图层。继续吗？', { okText: '拼合', cancelText: '取消' })) return false;
    const g = Uint8Array.from(C.alphaGray(e.at) || []); if (!g.length) return false;
    const [r, gg, b] = dispRGB(e.display), sol = (e.display ? e.display.opacity : 0) / 100, name = e.name;
    if (C.layerCount() > 1 || !C.isSingleBackground()) { await C.flatten(); if (C.layerCount() !== 1) { note('拼合没能完成，专色没有合并'); return false; } }
    const s = st(), px = C.compositeRGBA(); if (!px) return false;
    const out = new Uint8Array(px.length);
    for (let i = 0, o = 0; i < g.length; i++, o += 4) {
      const cov = (255 - g[i]) / 255;
      for (let c = 0; c < 3; c++) { const base = px[o + c], ink = [r, gg, b][c], mul = base * ink / 255, eff = mul + (ink - mul) * sol; out[o + c] = Math.round(base + (eff - base) * cov); }
      out[o + 3] = px[o + 3];
    }
    const at = (extras().find(x => x.name === name) || {}).at;
    if (at == null) return false;
    const ok = await C.structural('合并专色通道', async (base, { applyEdits }) => {
      const r1 = applyEdits(base, [{ op: 'replaceLayerPixels', index: 0, rgba: { data: out, width: s.docW, height: s.docH }, bounds: { top: 0, left: 0, bottom: s.docH, right: s.docW } }]);
      return { buf: removeAlphaChannel(r1.buffer, at), sel: 0 };
    });
    if (ok) { V.active = null; V.colorsOn = true; V.extraOn.clear(); redraw(); note(`已把专色「${name}」合并进颜色通道`); }
    void s0;
    return ok;
  }
  
  async function splitChannels() {
    const s = st();
    if (!s.doc || ![1, 3, 4, 7, 8, 9].includes(s.doc.mode)) { note('分离通道只适用于 RGB / CMYK / Lab / 灰度 / 多通道文档（PS 同：位图 / 索引颜色不能分离）'); return false; }
    const base = String(s.docName || '未标题').replace(/\.[^.]+$/, '');
    const W = s.docW, H = s.docH, n = W * H;
    let jobs;
    if ([1, 3, 8].includes(s.doc.mode)) {
      const px = C.compositeRGBA(); if (!px) return false;
      const names = s.doc.mode === 3 ? ['红', '绿', '蓝'] : ['灰色'];
      jobs = names.map((nm, c) => { const g = new Uint8Array(n); for (let i = 0, o = 0; i < n; i++, o += 4) g[i] = px[o + c]; return [nm, g]; });
    } else {
      
      const mp = await C.modePlanes(); if (!mp) return false;
      jobs = mp.names.map((nm, c) => [nm, mp.planes[c]]);
    }
    for (const e of extras()) { const g = C.alphaGray(e.at); if (g) jobs.push([e.name, Uint8Array.from(g)]); }
    let k = 0;
    for (const [nm, g] of jobs) {
      const buf = await C.grayDoc(g, W, H); if (!buf) break;
      if (await C.openBuffer(buf, `${base}_${nm}.psd`, '')) k++;
    }
    note(`已分离成 ${k} 份灰度文档`);
    return k > 0;
  }
  
  async function mergeChannels() {
    const docs = (await C.grayDocs()).filter(d => d.gray);
    if (docs.length < 2) { note('合并通道要至少两份打开着的、尺寸相同的灰度文档（可先「分离通道」）'); return false; }
    const W = docs[0].w, H = docs[0].h, same = docs.filter(d => d.w === W && d.h === H);
    const opt = same.map((d, i) => [String(i), d.name]);
    
    const MODES = { rgb: ['RGB 颜色', 3, ['红色(R):', '绿色(G):', '蓝色(B):']], cmyk: ['CMYK 颜色', 4, ['青色(C):', '洋红(M):', '黄色(Y):', '黑色(K):']],
      lab: ['Lab 颜色', 3, ['明度(L):', 'a(A):', 'b(B):']], multichannel: ['多通道', same.length, same.map((_, k) => `通道 ${k + 1}:`)] };
    const mv = await C.dialogs.formDialog('合并通道', [
      { key: 'mode', label: '模式(M):', type: 'select', value: same.length >= 4 ? 'cmyk' : 'rgb', options: Object.entries(MODES).map(([k, m]) => [k, m[0]]) },
    ]);
    if (!mv) return false;
    const [label, count, slotNames] = MODES[mv.mode];
    if (same.length < count) { note(`合并成${label}要 ${count} 份同尺寸的灰度文档，现在只有 ${same.length} 份`); return false; }
    const v = await C.dialogs.formDialog(`合并${label.replace(' 颜色', '')}通道`,
      slotNames.map((nm, k) => ({ key: 'c' + k, label: nm, type: 'select', value: String(Math.min(k, same.length - 1)), options: opt })));
    if (!v) return false;
    const pick = slotNames.map((_, k) => same[+v['c' + k]].gray), n = W * H;
    let buf;
    if (mv.mode === 'rgb') {
      const px = new Uint8Array(n * 4);
      for (let i = 0, o = 0; i < n; i++, o += 4) { px[o] = pick[0][i]; px[o + 1] = pick[1][i]; px[o + 2] = pick[2][i]; px[o + 3] = 255; }
      buf = await C.rgbDoc(px, W, H);
    } else buf = await C.flatDoc(pick, W, H, { cmyk: 4, lab: 9, multichannel: 7 }[mv.mode]);
    if (!buf) return false;
    return C.openBuffer(buf, '未标题-合并.psd', `已合并成新的${label}文档`);
  }
  function channelPanelOptions() {
    const d = mk('dialog', { className: 'fp-dlg lp-opts' });
    const f = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
    f.append(mk('h3', { className: 'fp-dlg-title', textContent: '通道面板选项' }));
    const set = mk('fieldset', { className: 'lp-opt-set' }, mk('legend', { textContent: '缩览图大小' }));
    const row = mk('div', { className: 'lp-size-row' });
    for (const [k, lab, px] of [['none', '无', 0], ['small', '小', 16], ['medium', '中', 24], ['large', '大', 36]]) {
      const pv = mk('span', { className: 'lp-size-pv' + (px ? '' : ' none') }); if (px) { pv.style.width = px + 'px'; pv.style.height = Math.round(px * .75) + 'px'; }
      row.append(mk('label', { className: 'lp-size' }, pv, mk('span', {}, mk('input', { type: 'radio', name: 'chSize', value: k, checked: chOpts.thumbSize === k }), ' ' + lab)));
    }
    set.append(row);
    const btns = mk('div', { className: 'fp-dlg-btns' });
    const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: '取消' });
    const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '确定' });
    btns.append(cancel, ok); f.append(set, btns); d.append(f); document.body.append(d);
    const close = () => { try { d.close(); } catch {} d.remove(); };
    cancel.onclick = close; d.oncancel = e => { e.preventDefault(); close(); };
    ok.onclick = () => { chOpts.thumbSize = (f.querySelector('input[name=chSize]:checked') || {}).value || chOpts.thumbSize; saveOpts(LS_CH, chOpts); close(); render(); };
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
    return d;
  }
  function chanMenu() {
    const s = st(), w = why(), e = activeExtra(), has = !!s.doc && !s.li;
    const I = (label, run, ok, extra = {}) => ({ label, run, disabled: !ok, why: ok ? '' : (extra.why || w), ...extra });
    return [
      I('新建通道…', () => newChannel(true), has && !w),
      I('复制通道…', () => duplicateChannel(), has && !w && !!e, { why: w || '先选中一条 Alpha / 专色通道' }),
      I('删除通道', () => deleteChannel(false), has && !w && !!e, { why: w || '先选中一条 Alpha / 专色通道' }),
      { sep: true },
      I('新建专色通道…', () => newSpotChannel(), has && !w),
      I('合并专色通道', () => mergeSpotChannel(), has && !w && !!e && kindOf(e) === 2, { why: w || '先选中一条专色通道' }),
      { sep: true },
      I('通道选项…', () => channelOptionsDialog(), has && !w && !!e, { why: w || '先选中一条 Alpha / 专色通道' }),
      { sep: true },
      I('分离通道', () => splitChannels(), has && [1, 3, 8].includes(s.doc && s.doc.mode), { why: '分离通道只做了 RGB / 灰度文档' }),
      I('合并通道…', () => mergeChannels(), true),
      { sep: true },
      I('面板选项…', () => channelPanelOptions(), true),
    ];
  }
  panels.setPanelMenu('channels', chanMenu);

  
  let chFoot = null;
  function buildChanFoot() {
    const host = document.getElementById('panelChannels'); if (!host || chFoot) return;
    chFoot = mk('div', { className: 'layer-foot chan-foot' });
    const B = [
      ['load', PATH_UI_ICONS.loadPath, '将通道作为选区载入', e => loadCurrentAsSelection(modeOf(e))],
      ['save', 'ch-save-selection', '将选区存储为通道（⌥ 点：新建通道…对话框）', e => { if (!st().selection) { note('先做一个选区'); return; } newChannel(e.altKey, true); }],
      ['new', PATH_UI_ICONS.newPath, '创建新通道（⌥ 点：新建通道…对话框）', e => newChannel(e.altKey)],
      ['del', PATH_UI_ICONS.trash, '删除当前通道（⌥ 点：不确认直接删除）', e => deleteChannel(e.altKey)],
    ];
    for (const [k, src, title, fn] of B) {
      const b = mk('button', { type: 'button', className: 'lf-btn', title });
      b.dataset.chanAction = k;
      
      let img;
      if (!/^data:|\//.test(src)) { img = uiIcon(src, 18); img.style.pointerEvents = 'none'; }
      else {
        img = mk('img', { src, alt: title });
        if (k === 'new') { img.width = 16; img.height = 16; } else { img.width = 20; img.height = 13; }
        img.style.cssText = 'display:block;pointer-events:none';
      }
      b.append(img); b.onclick = fn;
      chFoot.append(b);
    }
    host.append(chFoot);
  }
  function syncFoot() {
    if (!chFoot) return;
    const s = st(), has = !!s.doc && !s.li, w = why();
    const set = (k, ok) => { const b = chFoot.querySelector(`[data-chan-action="${k}"]`); if (b) b.disabled = !ok; };
    set('load', has); set('save', has && !w && !!s.selection); set('new', has && !w); set('del', has && !w && !!activeExtra());
  }
  function loadCurrentAsSelection(mode) {
    const s = st(); if (!s.doc) return false;
    if (V.active != null) return loadExtraSelection(V.active, mode);
    const v = C.chanView();
    return C.graySelection(C.colorChannelGray(v && v.single != null ? v.single : null), mode, '载入通道选区');
  }

  
  function selectByKey(num) {
    const s = st(); if (!s.doc) return false;
    const k = num - (CHAN_NAMES[s.doc.mode] || ['合成']).length - 2, e = extras()[k];
    if (!e) return false;
    V.active = e.at; V.colorsOn = false; V.extraOn = new Set([e.at]); redraw();
    return true;
  }
  const keyOk = num => { const s = st(); return !!s.doc && !!extras()[num - (CHAN_NAMES[s.doc.mode] || ['合成']).length - 2]; };
  for (const num of [6, 7, 8, 9]) actions.register('channel.key.' + num, { run: () => { selectByKey(num); }, enabled: () => keyOk(num) });
  const ch3 = actions.get('channel.3');
  if (ch3) actions.register('channel.3', { ...ch3, run: (...a) => (keyOk(6) && !(ch3.enabled && ch3.enabled()) ? selectByKey(6) : ch3.run(...a)), enabled: () => (ch3.enabled ? ch3.enabled() : true) || keyOk(6) });
  try { for (const num of [7, 8, 9]) C.bindKey('Mod+' + num, 'channel.key.' + num); } catch {}
  
  for (const id of ['channel.composite', 'channel.0', 'channel.1', 'channel.2']) {
    const d0 = actions.get(id); if (!d0) continue;
    actions.register(id, { ...d0, run: (...a) => { V.active = null; V.colorsOn = true; for (const x of extras()) if (kindOf(x) !== 2) V.extraOn.delete(x.at); return d0.run(...a); } });
  }

  
  psPanels.refreshChannels = () => render();
  buildChanFoot();

  
  const clip = { name: null, flatness: 0, idx: -1, dirty: false, tail: null };
  function readClip(buf) {
    clip.name = null; clip.flatness = 0; clip.idx = -1; clip.dirty = false; clip.tail = null;
    try {
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      let o = 26; o += 4 + dv.getUint32(o);
      const len = dv.getUint32(o);
      const list = parseImageResources(u8.subarray(o + 4, o + 4 + len)) || [];
      const r = list.find(x => x.id === 2999);
      if (!r) return;
      const m = r.data || (resourceHandler(2999) && r._raw ? resourceHandler(2999).read(new Uint8Array(r._raw)) : null);
      if (!m || !m.name) return;
      clip.name = decodePathName(m.name);
      const t = m._tail;
      if (t && t.length >= 4) { const i = (t[0] << 24 >> 16) | t[1]; clip.flatness = Math.round((i + ((t[2] << 8) | t[3]) / 65536) * 10) / 10; }
      clip.tail = t && t.length > 4 ? t.subarray(4) : null;
      const sp = C.savedPaths(); clip.idx = sp.findIndex(p => p.name === clip.name);
    } catch { clip.name = null; }
  }
  const clipNow = () => {
    if (!clip.name) return null;
    const sp = C.savedPaths();
    let i = sp.findIndex(p => p.name === clip.name);
    if (i < 0 && clip.idx >= 0 && sp[clip.idx]) i = clip.idx;    
    return i >= 0 ? { i, name: sp[i].name } : null;
  };
  function writeClip(buf) {
    const c = clipNow();
    if (!c) { try { return removeImageResource(buf, 2999); } catch { return buf; } }
    const f = Math.max(0, Math.min(100, +clip.flatness || 0)), ip = Math.floor(f), fr = Math.round((f - ip) * 65536);
    const tail = new Uint8Array([(ip >> 8) & 255, ip & 255, (fr >> 8) & 255, fr & 255, 0, 1]);   
    const name = encodePathName(c.name) || `Path ${c.i + 1}`;
    return writeImageResource(buf, 2999, resourceHandler(2999).write({ name, _tail: tail }), { exact: true });
  }
  DOC_EXT.push({
    key: 'clippingPath', label: '剪贴路径（图像资源 2999）',
    capture: () => ({ ...clip }), apply: v => { if (v) Object.assign(clip, v); else readClip(new ArrayBuffer(0)); },
    snap: () => ({ ...clip }), restore: v => { if (v) Object.assign(clip, v); refreshPathsDeco(); },
    load: buf => { readClip(buf); },
    needsWrite: () => clip.dirty, dirty: () => clip.dirty,
    writeInto: buf => { const out = writeClip(buf); return out; },
  });
  async function clippingPathDialog() {
    const sp = C.savedPaths();
    if (!sp.length) { await C.dialogs.alertDialog('剪贴路径必须是存储过的路径：先把工作路径存储起来（双击工作路径 / 面板菜单「存储路径…」）。', { title: '剪贴路径' }); return false; }
    const c = clipNow();
    const v = await C.dialogs.formDialog('剪贴路径', [
      { key: 'path', label: '路径(P):', type: 'select', value: c ? String(c.i) : '-1', options: [['-1', '无'], ...sp.map((p, i) => [String(i), p.name])] },
      { key: 'flat', label: '展平度(F):', type: 'text', value: clip.flatness ? String(clip.flatness) : '', unit: '设备像素' },
    ]);
    if (!v) return false;
    C.pushDocHistory('剪贴路径');
    const i = +v.path;
    clip.name = i >= 0 && sp[i] ? sp[i].name : null; clip.idx = i;
    const f = parseFloat(v.flat); clip.flatness = Number.isFinite(f) ? Math.max(0.2, Math.min(100, f)) : 0;
    clip.dirty = true;
    refreshPathsDeco();
    note(clip.name ? `剪贴路径：「${clip.name}」（存盘时写进图像资源 2999）` : '已取消剪贴路径');
    return true;
  }

  
  const paOpts = loadOpts(LS_PA, { thumbSize: 'medium' });
  const PSIZE = { none: 0, small: [22, 17], medium: [30, 24], large: [46, 36] };
  function pathThumb(subpaths, docW, docH, w, h) {
    const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2;
    cv.style.cssText = `display:block;width:${w}px;height:${h}px`;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    if (!subpaths || !subpaths.length || !docW || !docH) return cv;
    const k = Math.min((cv.width - 2) / docW, (cv.height - 2) / docH), ox = (cv.width - docW * k) / 2, oy = (cv.height - docH * k) / 2;
    const X = x => ox + x * k, Y = y => oy + y * k;
    g.beginPath();
    for (const sp of subpaths) {
      const kn = sp.knots || []; if (!kn.length) continue;
      g.moveTo(X(kn[0].anchor[0]), Y(kn[0].anchor[1]));
      const n = kn.length, segs = sp.closed === false ? n - 1 : n;
      for (let i = 0; i < segs; i++) { const a = kn[i], b = kn[(i + 1) % n]; g.bezierCurveTo(X(a.out[0]), Y(a.out[1]), X(b.in[0]), Y(b.in[1]), X(b.anchor[0]), Y(b.anchor[1])); }
      if (sp.closed !== false) g.closePath();
    }
    g.fillStyle = '#9a9a9a'; g.fill('evenodd'); g.strokeStyle = '#333'; g.lineWidth = 1.5; g.stroke();
    return cv;
  }
  function refreshPathsDeco() {
    const el = document.getElementById('pathList'); if (!el) return;
    el.classList.toggle('pap-none', paOpts.thumbSize === 'none');
    const rows = C.pathRows(), els = [...el.querySelectorAll('.path-row')];
    const sz = PSIZE[paOpts.thumbSize];
    const c = clipNow();
    els.forEach((row, k) => {
      const r = rows[k]; if (!r) return;
      const th = row.querySelector('.cthumb');
      if (th && sz && paOpts.thumbSize !== 'medium') { th.innerHTML = ''; th.append(pathThumb(r.subpaths, r.docW, r.docH, sz[0], sz[1])); }
      const nm = row.querySelector('.cname');
      const isClip = !!(c && r.kind === 'saved' && r.key === 'saved:' + c.i);
      row.classList.toggle('clip-path', isClip);
      if (nm && isClip) nm.title = '剪贴路径（图像资源 2999）';
    });
  }
  const origRefreshPaths = psPanels.refreshPaths;
  psPanels.refreshPaths = (...a) => { origRefreshPaths(...a); try { refreshPathsDeco(); } catch {} };
  function pathPanelOptions() {
    const d = mk('dialog', { className: 'fp-dlg lp-opts' });
    const f = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
    f.append(mk('h3', { className: 'fp-dlg-title', textContent: '路径面板选项' }));
    const set = mk('fieldset', { className: 'lp-opt-set' }, mk('legend', { textContent: '缩览图大小' }));
    const row = mk('div', { className: 'lp-size-row' });
    for (const [k, lab, px] of [['none', '无', 0], ['small', '小', 16], ['medium', '中', 24], ['large', '大', 36]]) {
      const pv = mk('span', { className: 'lp-size-pv' + (px ? '' : ' none') }); if (px) { pv.style.width = px + 'px'; pv.style.height = Math.round(px * .8) + 'px'; }
      row.append(mk('label', { className: 'lp-size' }, pv, mk('span', {}, mk('input', { type: 'radio', name: 'paSize', value: k, checked: paOpts.thumbSize === k }), ' ' + lab)));
    }
    set.append(row);
    const btns = mk('div', { className: 'fp-dlg-btns' });
    const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: '取消' });
    const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '确定' });
    btns.append(cancel, ok); f.append(set, btns); d.append(f); document.body.append(d);
    const close = () => { try { d.close(); } catch {} d.remove(); };
    cancel.onclick = close; d.oncancel = e => { e.preventDefault(); close(); };
    ok.onclick = () => { paOpts.thumbSize = (f.querySelector('input[name=paSize]:checked') || {}).value || paOpts.thumbSize; saveOpts(LS_PA, paOpts); close(); C.refreshPaths(); };
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
    return d;
  }
  
  function pathMenu() {
    let base = [];
    try { const f = C.pathMenuFn(); base = (f && f()) || []; } catch {}
    const by = l => base.find(x => x.label === l);
    const s = st(), has = !!s.doc && !s.li;
    const ws = C.workPathActive();
    const items = [
      ws ? (by('存储路径…') || { label: '存储路径…', disabled: true }) : (by('新建路径…') || { label: '新建路径…', disabled: true }),
      by('复制路径…') || { label: '复制路径…', disabled: true },
      by('删除路径') || { label: '删除路径', disabled: true },
      { sep: true },
      by('建立工作路径…') || { label: '建立工作路径…', disabled: true },
      by('建立选区…') || { label: '建立选区…', disabled: true },
      by('填充路径…') || { label: '填充路径…', disabled: true },
      by('描边路径…') || { label: '描边路径…', disabled: true },
      { sep: true },
      { label: '剪贴路径…', disabled: !has, run: () => clippingPathDialog() },
      { sep: true },
      { label: '面板选项…', run: () => pathPanelOptions() },
    ];
    return items;
  }
  panels.setPanelMenu('paths', pathMenu);
  
  function wirePathFoot() {
    const host = document.getElementById('panelPaths'); if (!host) return;
    const nb = host.querySelector('[data-path-action="newPath"]');
    if (nb) { nb.title = '创建新路径（⌥ 点：新建路径…对话框）'; nb.addEventListener('click', async e => { if (!e.altKey) return; e.stopImmediatePropagation(); e.preventDefault(); const v = await C.dialogs.promptDialog('新建路径', C.nextPathName(), { label: '名称' }); if (v != null && String(v).trim()) C.newPath(String(v).trim()); }, true); }
    const tb = host.querySelector('[data-path-action="trash"]');
    if (tb) {
      tb.title = '删除当前路径（⌥ 点：不确认直接删除）';
      tb.addEventListener('click', async e => {
        e.stopImmediatePropagation(); e.preventDefault();
        const nm = C.activePathName();
        if (!e.altKey && nm && !await C.dialogs.confirmDialog(`要删除路径“${nm}”吗？`, { okText: '是', cancelText: '否' })) return;
        C.deletePath();
      }, true);
    }
  }
  wirePathFoot();

  return {
    render, applyView, chanMenu, pathMenu, newChannel, newSpotChannel, duplicateChannel, deleteChannel, channelOptionsDialog, mergeSpotChannel,
    splitChannels, mergeChannels, clippingPathDialog, loadExtraSelection, channelPanelOptions, pathPanelOptions,
    get view() {
      const active = extras().find(e => e.at === V.active);
      return { colorsOn: V.colorsOn, extraOn: [...V.extraOn], active: V.active, activeKind: active ? kindOf(active) : null };
    },
    selectExtra(at) { V.active = at; V.colorsOn = false; V.extraOn = new Set([at]); redraw(); },
    get clip() { return { name: clip.name, flatness: clip.flatness, dirty: clip.dirty }; },
  };
}
export default { installChanPathPanels };
