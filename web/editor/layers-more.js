
















import { readLinkGroups } from '../../core/psd-links.js';
import { onDocumentCacheRelease } from './document-cache.js';
import { STACK_MODES, stackCombine } from '../../core/stack-modes.js';
import { parseLinkedRecords, makeRecordExternal, makeRecordEmbedded, fileTypeOf } from '../../core/psd-linked-so.js';
import { readFilterInput, readFilterMask, writeFilterMask, removeFilterEntry, upsertFilterEntry, maskSampler } from '../../core/smart-filter-mask.js';
import { parsePsdRaster, compositeAll, parseSmartObjects, replacePlacedBlocks, smartObjectFragment, rasterizeVectorMask } from '../../core/app.js';
import { writePsd } from '../../core/psd-write.js';
import { parsePsdFull } from '../../core/psd-parse.js';
import { readLayerSoLd, stackModeOfDesc } from '../../core/psd-edit-sfx.js';


let SFR = null;
const loadSfr = async () => SFR || (SFR = await import('../../core/smart-filter-render.js'));


const SVG = {
  link: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path fill="currentColor" d="M7.1 11.6 5.8 12.9a1.7 1.7 0 0 1-2.4-2.4l2.6-2.6a1.7 1.7 0 0 1 2.4 0l.8-.8a2.8 2.8 0 0 0-4-.1L2.6 9.7a2.8 2.8 0 0 0 4 4l1.3-1.3a3.9 3.9 0 0 1-.8-.8Zm8.3-7.3a2.8 2.8 0 0 0-4 0L10.1 5.6c.3.2.6.5.8.8l1.3-1.3a1.7 1.7 0 0 1 2.4 2.4l-2.6 2.6a1.7 1.7 0 0 1-2.4 0l-.8.8a2.8 2.8 0 0 0 4 .1l2.6-2.6a2.8 2.8 0 0 0 0-4.1Z"/><path fill="currentColor" d="m6.6 10.6 4-4 .8.8-4 4z"/></svg>',
  missing: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13"><path fill="#e34850" d="M5.0204,10.3638c0-.5415.4386-.9795.9796-.9795s.9796.438.9796.9795c0,.541-.4386.9795-.9796.9795s-.9796-.4385-.9796-.9795ZM5.1136,8.1816c-.0049-.1499-.0201-.748.1778-1.1074.1244-.2256.4175-.5049.6182-.7514.1469-.1783,1.0861-1.2442,1.2592-1.4205.1634-.1669.1975-.2973.1778-.5385-.0436-.5342-.1279-1.0376-.8864-1.2617-.5633-.1666-1.1354-.0953-1.4488.2045-.3134.3003-.4305.42-.5285,1.0572h-1.3636c.0601-.982.4646-1.8052.9886-2.2329.7521-.6143,1.2508-.6822,2.0796-.6822.8778,0,1.6432.3994,2.1648.8867.5215.4878.74,1.2588.6988,1.96-.0234.3984-.1085.8252-.392,1.1592-.2476.292-.2082.3735-.7432.8564-.3586.3243-1.0013,1.1797-1.0552,1.3799-.0538.1997-.1013.0811-.1098.5313l-1.6373-.0406ZM0,6c0,3.314,2.6863,6,6,6s6-2.686,6-6S9.3137,0,6,0,0,2.686,0,6Z"/></svg>',
  ok: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13"><path fill="currentColor" d="M11,10h-2.985c-.0133.3916-.1002.7246-.24,1h3.725c.2761,0,.5-.2334.5-.522V2.9868c0-.2881-.1976-.5713-.3939-.7739l-1.9041-1.9561c-.1963-.2021-.4259-.2568-.702-.2568h-4.5c-.2761,0-.5.2334-.5.522v1.478h1v-1h3v2.4785c0,.2881.2239.5215.5.5215h2.5v6ZM9,3V1l2,2h-2Z"/><polygon fill="currentColor" points="3 10 5 10 5 6 3 6 3 10"/><path fill="currentColor" d="M5.9841,10.0635c0,1.104-.9132,1.7339-2.0202,1.7339s-1.9889-.6455-1.9889-1.7495v-1.0464c-.736-.0469-.975.1777-.975,1.0737,0,1.6562,1.3189,2.9248,2.9796,2.9248,1.6605,0,2.9794-1.2529,2.9794-2.9092,0-.896-.2388-1.1362-.9749-1.0893v1.062ZM5.9841,5.9341v1.0625c.7361.0464.9749-.1934.9749-1.0899,0-1.6557-1.3189-2.9087-2.9794-2.9087-1.6607,0-2.9796,1.2686-2.9796,2.9244,0,.8964.239,1.1206.975,1.0742v-1.0469c0-1.104.8819-1.749,1.9889-1.749s2.0202.6294,2.0202,1.7334Z"/></svg>',
  differs: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 13"><path fill="#e8a33d" d="M4.96,10c0-.5742.4656-1.04,1.04-1.04s1.04.4658,1.04,1.04-.4656,1.04-1.04,1.04-1.04-.4658-1.04-1.04ZM11.9379,10.9561c-.1025-.2149-3.8019-7.8511-5.319-10.5508-.3041-.5415-.9318-.5401-1.2335.0029C3.871,3.1328.1647,10.8711.0621,11.0859c-.1252.2618-.1252.9141.6248.9141h10.6262c.75,0,.75-.7832.6248-1.0439ZM7.0188,4.1689c0,1.1749-.186,3.4034-.2461,3.7217,0,.0318-.0187.1939-.1088.1939h-1.3399c-.0597,0-.0982-.1519-.1132-.1939-.0293-.2968-.2413-2.5468-.2413-3.7217v-1.0791c0-.0419.1003-.1064.1747-.1386.1798-.0738.8792-.06945,1.1034-.06945.3003,0,.4207.01665.5859.06945.0751.0322.1853.1074.1853.1386v1.0791Z"/></svg>',
};
function svgEl(key, size) {
  const s = document.createElement('span');
  s.className = 'lx-ico'; s.innerHTML = SVG[key];
  const v = s.firstChild; v.setAttribute('width', size); v.setAttribute('height', size);
  return s;
}


const HANDLES = new Map();          
const IDB = { db: null };
function idb() {
  if (IDB.db) return IDB.db;
  IDB.db = new Promise((res) => {
    try {
      const rq = indexedDB.open('psd_editor-linked-files', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('h');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
  return IDB.db;
}
async function idbPut(id, v) { try { const db = await idb(); if (!db) return; db.transaction('h', 'readwrite').objectStore('h').put(v, id); } catch {  } }
async function idbGet(id) {
  try { const db = await idb(); if (!db) return null;
    return await new Promise(res => { const rq = db.transaction('h').objectStore('h').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); });
  } catch { return null; }
}

export function installLayersMore(ctx) {
  const { R, shell, $ } = ctx;
  const st = ctx.st;
  const err = m => { $('#err').textContent = m; };
  const note = m => { $('#notice').textContent = m; shell.status(m); };

  
  let linkCache = { buf: null, info: null };
  onDocumentCacheRelease(() => { linkCache = { buf: null, info: null }; });
  const links = () => {
    const s = st();
    if (linkCache.buf !== s.origBuffer) {
      let info = { byIndex: [], disabled: [] };
      try { if (s.origBuffer) info = readLinkGroups(s.origBuffer); } catch {  }
      linkCache = { buf: s.origBuffer, info };
    }
    return linkCache.info;
  };
  const gidOf = i => (links().byIndex[i] || 0);
  const linkOff = i => !!links().disabled[i];
  function linkedOf(i) {
    const s = st();
    if (i == null || i < 0 || !s.doc) return [];
    const g = gidOf(i);
    if (!g || linkOff(i)) return [];
    const L = links(), out = [];
    L.byIndex.forEach((v, j) => { if (j !== i && v === g && !L.disabled[j] && !s.layerDeletes.has(j)) out.push(j); });
    return out;
  }
  const targets = () => { const s = st(); return s.selLayers.size ? [...s.selLayers] : s.selLayer >= 0 ? [s.selLayer] : []; };
  const allLinked = t => t.length && t.every(i => gidOf(i)) && new Set(t.map(gidOf)).size === 1;
  async function linkUI() {
    const t = targets().filter(i => { const L = st().layerTree.flat[i]; return L && L.groupType !== 3; });
    if (!t.length) return false;
    const unlink = allLinked(t);
    if (!unlink && t.length < 2) { note('链接图层要先在图层面板里选中两个或更多图层（⌘ / Ctrl 点选）'); return false; }
    return ctx.structural(unlink ? '取消链接图层' : '链接图层', async (base, { map, applyEdits }) => {
      const idx = t.map(map).filter(i => i >= 0);
      const r = applyEdits(base, [{ op: 'setLinkGroups', indices: idx, link: !unlink }]);
      return { buf: r.buffer, sel: map(st().selLayer), sels: idx };
    });
  }
  async function toggleLinkDisabled(i) {
    const off = !linkOff(i);
    return ctx.structural(off ? '停用链接' : '启用链接', async (base, { map, applyEdits }) => {
      const r = applyEdits(base, [{ op: 'setLinkGroups', indices: [map(i)], link: true, disable: off }]);
      return { buf: r.buffer, sel: map(i) };
    });
  }
  R('layer.link', () => { linkUI(); }, () => ctx.inPreview() && (targets().length >= 2 || (targets().length === 1 && !!gidOf(targets()[0]))),
    { why: () => '先选中两个或更多图层（⌘ / Ctrl 点选）' });
  const selectLinkedUI = () => {
    const s = st(), i = s.selLayer, ls = linkedOf(i);
    if (!ls.length) return;
    ctx.setSel(i, [i, ...ls]);
    note(`选中了 ${ls.length + 1} 个链接图层`);
  };
  const selectLinkedEnabled = () => ctx.inPreview() && linkedOf(st().selLayer).length > 0;
  R('layer.selectLinked', selectLinkedUI, selectLinkedEnabled, { why: () => '选中的图层没有链接到别的图层' });
  R('select.selectLinkedLayers', selectLinkedUI, selectLinkedEnabled, { why: () => '选中的图层没有链接到别的图层' });

  
  let isolate = null;                 
  let isolateBuf = null;
  function rowHidden(idx, view) {
    if (!isolate) return false;
    if ((isolateBuf?.deref() || null) !== (st().origBuffer || null)) { isolate = null; return false; }   
    if (isolate.has(idx)) return false;
    
    let p = view.nodes[idx] && view.nodes[idx].parent;
    while (p != null) { if (isolate.has(p)) return false; p = view.nodes[p] && view.nodes[p].parent; }
    for (const k of isolate) { let q = view.nodes[k] && view.nodes[k].parent; while (q != null) { if (q === idx) return false; q = view.nodes[q] && view.nodes[q].parent; } }
    return true;
  }
  R('select.isolateLayers', () => {
    if (isolate) { isolate = null; ctx.ui.renderLayerPanel(); note('已退出图层隔离'); return; }
    const t = targets(); if (!t.length) return;
    isolate = new Set(t); isolateBuf = st().origBuffer ? new WeakRef(st().origBuffer) : null;
    ctx.ui.renderLayerPanel();
    note(`隔离图层：面板只显示选中的 ${t.length} 个图层（再点一次「隔离图层」退出）`);
  }, () => ctx.inPreview() && (!!isolate || targets().length > 0), { checked: () => !!isolate });
  R('select.deIsolateLayers', () => {
    if (!isolate) return;
    isolate = null; ctx.ui.renderLayerPanel(); note('已退出图层隔离');
  }, () => ctx.inPreview() && !!isolate, { why: () => '当前没有处于隔离状态的图层' });

  
  const soIndexOf = idx => st().sos.findIndex(so => ctx.so.matchLayer(so) === idx);
  const isPsdBytes = b => b && b.length > 4 && b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53;
  function recordOf(k) {
    const so = st().sos[k]; if (!so || !so.linkId) return null;
    try { return parseLinkedRecords(st().origBuffer).find(r => r.id === so.linkId) || null; } catch { return null; }
  }
  
  async function contentBytes(k) {
    const s = st(), so = s.sos[k]; if (!so) return null;
    const ins = s.soInside[k];
    if (ins && ins.changed && ins.bytes) return new Uint8Array(ins.bytes);
    const si = so.sourceImage;
    if (si && si.bytes) return si.bytes;
    const rec = recordOf(k);
    if (rec && rec.data) return rec.data;
    const h = so.linkId && HANDLES.get(so.linkId);
    if (h) { const f = await fileOfHandle(h); if (f) return new Uint8Array(await f.arrayBuffer()); }
    return null;
  }
  async function imageFromBytes(bytes, name) {
    if (isPsdBytes(bytes)) {
      const rd = await parsePsdRaster(bytes.slice().buffer, {});
      const surf = compositeAll(rd, rd.width, rd.height, new Map());
      return { data: new Uint8ClampedArray(surf.data), width: rd.width, height: rd.height };
    }
    const file = new File([bytes], name || 'image', { type: /\.jpe?g$/i.test(name || '') || (bytes[0] === 0xff && bytes[1] === 0xd8) ? 'image/jpeg' : 'image/png' });
    const bmp = await ctx.decodeImageFile(file);
    const w = bmp.width, h = bmp.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    return { data: g.getImageData(0, 0, w, h).data, width: w, height: h };
  }
  
  async function innerLeaves(bytes, name) {
    if (!isPsdBytes(bytes)) {
      const im = await imageFromBytes(bytes, name);
      return { width: im.width, height: im.height, leaves: [{ name: (name || '图层').replace(/\.[^.]+$/, ''), rgba: im.data, opacity: 255, blendKey: 'norm', visible: true }], composite: im };
    }
    const rd = await parsePsdRaster(bytes.slice().buffer, {});
    const W = rd.width, H = rd.height, leaves = [];
    
    const hiddenBy = new Array(rd.layers.length).fill(false), stack = [];
    for (let i = rd.layers.length - 1; i >= 0; i--) {
      const l = rd.layers[i], gt = l.group && l.group.type;
      if (gt === 3) { stack.pop(); continue; }
      hiddenBy[i] = stack.some(Boolean);
      if (gt === 1 || gt === 2) stack.push(!!l.hidden);
    }
    rd.layers.forEach((l, i) => {
      const gt = l.group && l.group.type;
      if (gt === 1 || gt === 2 || gt === 3) return;
      if (l.adjustment) return;                                   
      const one = { ...l, hidden: false, opacity: 255, blendMode: 'norm', clipping: false };
      let data;
      try { data = new Uint8ClampedArray(compositeAll({ layers: [one], patterns: rd.patterns }, W, H, new Map()).data); } catch { return; }
      leaves.push({ name: l.name || ('图层 ' + i), rgba: data, opacity: l.opacity ?? 255, blendKey: l.blendMode || 'norm',
        visible: !l.hidden && !hiddenBy[i], clipping: !!l.clipping });
    });
    const surf = compositeAll(rd, W, H, new Map());
    return { width: W, height: H, leaves, composite: { data: new Uint8ClampedArray(surf.data), width: W, height: H } };
  }
  const cropAlpha = (d, W, H) => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(d.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + w) * 4), y * w * 4);
    return { data: out, width: w, height: h, bounds: { top: y0, left: x0, bottom: y0 + h, right: x0 + w } };
  };

  
  async function convertToLayersUI() {
    const s = st(), idx = s.selLayer, k = soIndexOf(idx);
    if (k < 0) return false;
    const so = s.sos[k];
    const bytes = await contentBytes(k);
    if (!bytes) { err('找不到这个智能对象的内容（外部链接的文件没有缓存、也没有链接到本机文件）：先「重新链接到文件」。'); return false; }
    


    let fb = '';
    const soName0 = ctx.layerName(idx);
    if (isPsdBytes(bytes)) {
      let res = null;
      const SOC = await import('../../core/so-convert.js');
      const ok = await ctx.structural('转换为图层', async (base, { map }) => {
        res = SOC.convertSmartObjectToLayers(base, map(idx), bytes);
        return res.fallback ? null : { buf: res.buffer, sel: res.sel };
      });
      if (ok) {
        note(`已把智能对象「${soName0}」拆成 ${res.count} 个图层（文字 / 形状 / 智能对象保持可编辑，按原变换摆放；不透明度、混合模式、蒙版、样式在外包组上）`
          + (res.warnings.length ? '。注意：' + res.warnings.join('；') : ''));
        return true;
      }
      if (!res || !res.fallback) return false;
      fb = res.fallback;
    } else fb = '内容是单张图片';
    if (!ctx.engineOK()) { err('渲染引擎未加载：转换为图层要按智能对象的变换把每一层画回文档。'); return false; }
    let inner;
    try { inner = await innerLeaves(bytes, so.sourceImage && so.sourceImage.filename); }
    catch (e) { err('智能对象内容解不开：' + (e && e.message || e)); return false; }
    if (!inner.leaves.length) { err('智能对象里没有可以展开的像素图层（只有调整层 / 空组）。'); return false; }
    
    const rendered = [];
    for (const lf of inner.leaves) {
      const r = ctx.so.soRenderImage(k, { data: lf.rgba, width: inner.width, height: inner.height });
      rendered.push({ ...lf, px: r });
    }
    const L0 = s.layerTree.flat[idx] || {};
    const soName = ctx.layerName(idx), soOpacity = s.doc.layers[idx].opacity ?? 255, soBlend = ctx.layerBlend(idx);
    const soHidden = !!s.doc.layers[idx].hidden;
    const r = await ctx.structural('转换为图层', async (base, { map, applyEdits }) => {
      const b = map(idx);
      const ops = [];
      let at = b + 1;
      const one = rendered.length === 1;
      for (const lf of rendered) {
        ops.push({ op: 'createLayer', at, name: lf.name, visible: lf.visible && (!one || !soHidden) });
        if (lf.px && lf.px.rgba && lf.px.rgba.length)
          ops.push({ op: 'replaceLayerPixels', index: at, rgba: { data: new Uint8Array(lf.px.rgba.buffer, lf.px.rgba.byteOffset, lf.px.rgba.length), width: lf.px.bounds.right - lf.px.bounds.left, height: lf.px.bounds.bottom - lf.px.bounds.top }, bounds: lf.px.bounds });
        const props = { op: 'setLayerProps', index: at };
        const op = one ? Math.round(lf.opacity * soOpacity / 255) : lf.opacity;
        if (op !== 255) props.opacity = op;
        const bk = one && lf.blendKey === 'norm' ? soBlend : lf.blendKey;
        if (bk && bk !== 'norm') props.blendKey = bk;
        if (lf.clipping) props.clipping = true;
        if (Object.keys(props).length > 2) ops.push(props);
        at++;
      }
      let buf = applyEdits(base, ops).buffer;
      let sel = at - 1;
      if (!one) {
        
        const idxs = []; for (let q = b + 1; q < at; q++) idxs.push(q);
        buf = applyEdits(buf, [{ op: 'groupLayers', indices: idxs }]).buffer;
        const header = at + 1;                                        
        const gp = { op: 'setLayerProps', index: header, name: soName };
        if (soOpacity !== 255) gp.opacity = soOpacity;
        gp.blendKey = soBlend && soBlend !== 'norm' ? soBlend : 'pass';
        if (soHidden) gp.visible = false;
        buf = applyEdits(buf, [gp]).buffer;
        sel = header;
      }
      buf = applyEdits(buf, [{ op: 'deleteLayer', index: b }]).buffer;
      return { buf, sel: sel - 1 };
    });
    if (r) note(`已把智能对象「${soName}」转换为 ${rendered.length} 个图层` + (inner.leaves.length < rendered.length ? '' : '')
      + `（${fb}，只能按智能对象的变换把内部图层栅格化到文档；内部的调整图层、智能对象自身的蒙版 / 样式没有带出来）`);
    void L0;
    return r;
  }
  R('layer.smart.convertToLayers', () => { convertToLayersUI(); }, () => ctx.inPreview() && soIndexOf(st().selLayer) >= 0,
    { why: () => '先选中一个智能对象图层' });

  



  let stackCache = { buf: null, map: new Map() };
  onDocumentCacheRelease(() => { stackCache = { buf: null, map: new Map() }; });
  function stackModeOfK(k) {
    const s = st(), so = s.sos[k]; if (!so || !s.origBuffer) return 'none';
    if (stackCache.buf !== s.origBuffer) stackCache = { buf: s.origBuffer, map: new Map(), psd: null };
    if (stackCache.map.has(k)) return stackCache.map.get(k);
    let m = 'none';
    try {
      const psd = stackCache.psd || (stackCache.psd = parsePsdFull(s.origBuffer));
      const sd = readLayerSoLd(s.origBuffer, psd.layers[so.layerIndex]);
      m = stackModeOfDesc(sd && sd.desc);
    } catch { m = 'none'; }
    stackCache.map.set(k, m);
    return m;
  }
  const stackOf = { get: k => stackModeOfK(k) };        
  
  async function soSourceImage(k) {
    const so = st().sos[k];
    const bytes = await contentBytes(k); if (!bytes) return null;
    const name = so && so.sourceImage && so.sourceImage.filename;
    const mode = stackModeOfK(k);
    if (mode !== 'none' && isPsdBytes(bytes)) {
      const inner = await innerLeaves(bytes, name);
      const vis = inner.leaves.filter(l => l.visible);
      return { data: stackCombine(vis.map(l => l.rgba), inner.width, inner.height, mode), width: inner.width, height: inner.height };
    }
    return imageFromBytes(bytes, name);
  }
  async function stackModeUI(mode) {
    const s = st(), idx = s.selLayer, k = soIndexOf(idx);
    if (k < 0) return false;
    if (stackModeOfK(k) === mode) return true;
    const so = s.sos[k];
    const bytes = await contentBytes(k);
    if (!bytes) { err('找不到这个智能对象的内容，没法做堆栈统计。'); return false; }
    if (!ctx.engineOK()) { err('渲染引擎未加载：堆栈结果要按智能对象的变换画回文档。'); return false; }
    let inner;
    try { inner = await innerLeaves(bytes, so.sourceImage && so.sourceImage.filename); }
    catch (e) { err('智能对象内容解不开：' + (e && e.message || e)); return false; }
    const vis = inner.leaves.filter(l => l.visible);
    let img;
    if (mode === 'none') img = inner.composite;
    else {
      if (vis.length < 2) note('智能对象里只有一个可见图层 —— 堆栈统计要多个对齐的图层（PS：先「将文件载入堆栈」再转换为智能对象）');
      img = { data: stackCombine(vis.map(l => l.rgba), inner.width, inner.height, mode), width: inner.width, height: inner.height };
    }
    const ok = await ctx.structural('堆栈模式：' + STACK_MODES[mode], async (base, { map, applyEdits }) => {
      const b = map(idx);
      let buf = applyEdits(base, [{ op: 'setStackMode', index: b, mode }]).buffer;
      
      let op = null;
      try { op = ctx.sfx ? await ctx.sfx.rerenderOp(buf, b, k, img) : null; } catch { op = null; }
      if (!op) {
        const px = ctx.so.soRenderImage(k, img);
        if (px && px.rgba && px.rgba.length) op = { op: 'replaceLayerPixels', index: b, rgba: { data: new Uint8Array(px.rgba.buffer, px.rgba.byteOffset, px.rgba.length), width: px.bounds.right - px.bounds.left, height: px.bounds.bottom - px.bounds.top }, bounds: px.bounds };
      }
      if (op) buf = applyEdits(buf, [op]).buffer;
      return { buf, sel: b };
    });
    if (ok) note(`堆栈模式：${STACK_MODES[mode]}` + (mode === 'none' ? '' : `（${vis.length} 个图层逐像素统计；已写进文件，重新打开仍是这个模式）`));
    return ok;
  }
  for (const m of Object.keys(STACK_MODES))
    R('layer.smart.stack.' + m, () => { stackModeUI(m); }, () => ctx.inPreview() && soIndexOf(st().selLayer) >= 0,
      { why: () => '先选中一个智能对象图层', checked: () => { const k = soIndexOf(st().selLayer); return k >= 0 && stackModeOfK(k) === m; } });

  
  R('layer.contentOptions', () => {
    const s = st(), i = s.selLayer, L = s.layerTree.flat[i];
    if (!L) return;
    const k = soIndexOf(i);
    if (k >= 0) { ctx.so.openInside(k); return; }
    if (L.adjustment) { ctx.ui.showProps(i); return; }
    if (L.text) { ctx.ui.showProps(i, 'character'); return; }
  }, () => { const s = st(), L = ctx.inPreview() && s.layerTree && s.layerTree.flat[s.selLayer]; return !!(L && (L.adjustment || L.text || soIndexOf(s.selLayer) >= 0)); },
  { why: () => '选中的图层没有「内容选项」（PS：填充 / 调整图层、智能对象、文字才有）' });

  
  async function fileOfHandle(h) {
    if (h.handle) {
      try {
        if (h.handle.queryPermission && await h.handle.queryPermission({ mode: 'read' }) !== 'granted') {
          if (!h.handle.requestPermission || await h.handle.requestPermission({ mode: 'read' }) !== 'granted') return null;
        }
        return await h.handle.getFile();
      } catch { return null; }
    }
    return h.file || null;
  }
  async function pickFile() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: '图像 / Photoshop 文档',
          accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'], 'application/octet-stream': ['.psd', '.psb'] } }] });
        return { handle, file: await handle.getFile() };
      } catch (e) { if (e && e.name === 'AbortError') return null; }
    }
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,.psd,.psb';
      inp.onchange = () => { const f = inp.files && inp.files[0]; res(f ? { file: f } : null); };
      inp.click();
    });
  }
  const linkPicker = { pick: pickFile };          
  function remember(id, picked) {
    const v = { handle: picked.handle || null, file: picked.handle ? null : picked.file, name: picked.file.name, lastModified: picked.file.lastModified, status: 'ok' };
    HANDLES.set(id, v);
    if (v.handle) idbPut(id, { handle: v.handle, name: v.name, lastModified: v.lastModified });
  }
  function isExternal(k) { const so = st().sos[k]; return !!(so && so.sourceImage && !so.sourceImage.embedded); }
  function linkStatus(k) {
    const so = st().sos[k]; if (!so || !isExternal(k)) return null;
    const h = HANDLES.get(so.linkId);
    return h ? h.status || 'ok' : 'missing';
  }
  
  let checkedBuf = null;
  async function refreshLinkStatus() {
    const s = st(); if (!s.origBuffer || checkedBuf?.deref() === s.origBuffer) return;
    checkedBuf = new WeakRef(s.origBuffer);
    let changed = false;
    for (let k = 0; k < s.sos.length; k++) {
      if (!isExternal(k)) continue;
      const id = s.sos[k].linkId; if (!id) continue;
      let h = HANDLES.get(id);
      if (!h) { const saved = await idbGet(id); if (saved && saved.handle) { h = { ...saved, status: 'ok' }; HANDLES.set(id, h); changed = true; } }
      if (!h) continue;
      try {
        const perm = h.handle && h.handle.queryPermission ? await h.handle.queryPermission({ mode: 'read' }) : 'granted';
        if (perm !== 'granted') { h.status = 'ok'; continue; }        
        const f = h.handle ? await h.handle.getFile() : h.file;
        const was = h.status; h.status = f && f.lastModified > (h.lastModified || 0) ? 'modified' : 'ok';
        if (was !== h.status) changed = true;
      } catch { h.status = 'missing'; changed = true; }
    }
    if (changed) ctx.ui.renderLayerPanel();
  }
  
  async function placeLinkedUI() {
    const picked = await linkPicker.pick(); if (!picked) return false;
    const file = picked.file, bytes = new Uint8Array(await file.arrayBuffer());
    let img;
    try { img = await imageFromBytes(bytes, file.name); } catch (e) { err('这个文件解不开：' + (e && e.message || e)); return false; }
    const cache = await ctx.dialogs.choiceDialog(`置入「${file.name}」作为链接的智能对象。\n要不要在 PSD 里同时缓存一份文件数据？\n· 缓存：文件丢了也能继续编辑内容，PSD 会大一些；\n· 不缓存：PSD 里只记文件名（与 PS 的链接一样，PS 按 PSD 同目录找这个文件）。`,
      { title: '置入链接的智能对象', okText: '缓存', extraText: '不缓存', cancelText: '取消' });
    if (cache === 'cancel') return false;
    const s = st(), W = s.docW, H = s.docH;
    
    const sc = Math.min(1, W / img.width, H / img.height);
    const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
    const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
    const src = document.createElement('canvas'); src.width = img.width; src.height = img.height;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    g.drawImage(src, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const name = file.name.replace(/\.[^.]+$/, '') || '链接的智能对象';
    let newId = null;
    const ok = await ctx.structural('置入链接的智能对象', async (base, { map, applyEdits }) => {
      const at = s.selLayer >= 0 ? map(s.selLayer) + 1 : s.doc.layers.length;
      const before = new Set(parseLinkedRecords(base).map(r => r.id));
      let buf = applyEdits(base, [
        { op: 'createLayer', at, name },
        { op: 'replaceLayerPixels', index: at, rgba: { data: new Uint8Array(px.buffer, px.byteOffset, px.length), width: w, height: h }, bounds: { top: y, left: x, bottom: y + h, right: x + w } },
        { op: 'convertToSmartObject', index: at, source: { data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height },
          bounds: { top: y, left: x, bottom: y + h, right: x + w }, name: file.name, ...(isPsdBytes(bytes) ? { embedded: bytes } : {}) },
      ]).buffer;
      const rec = parseLinkedRecords(buf).find(r => !before.has(r.id));
      if (!rec) throw new Error('新建的智能对象没有找到它的内容记录');
      newId = rec.id;
      buf = makeRecordExternal(buf, rec.id, { name: file.name, data: bytes, cache: cache === 'ok', time: file.lastModified, fileSize: bytes.length, fileType: fileTypeOf(file.name, bytes) });
      return { buf, sel: at };
    });
    if (ok && newId) { remember(newId, picked); ctx.ui.renderLayerPanel(); note(`已置入链接的智能对象「${file.name}」` + (picked.handle ? '（已记住这个文件，修改后可「更新修改的内容」）' : '（浏览器不支持文件句柄：本次会话内可更新，重开页面后需要重新链接）')); }
    return ok;
  }
  R('file.placeLinked', () => { placeLinkedUI(); }, () => ctx.inPreview());
  R('layer.smart.newLinked', () => { placeLinkedUI(); }, () => ctx.inPreview());

  
  async function relinkWith(k, picked, label) {
    const s = st(), so = s.sos[k], idx = ctx.so.matchLayer(so);
    const file = picked.file, bytes = new Uint8Array(await file.arrayBuffer());
    let img;
    try { img = await imageFromBytes(bytes, file.name); } catch (e) { err('这个文件解不开：' + (e && e.message || e)); return false; }
    if (!ctx.engineOK()) { err('渲染引擎未加载：新内容要按智能对象的变换画回文档。'); return false; }
    const px = ctx.so.soRenderImage(k, img);
    const rec = recordOf(k);
    const cache = rec ? !!rec.data || rec.type === 'liFD' : true;
    const ok = await ctx.structural(label, async (base, { map, applyEdits }) => {
      let buf = makeRecordExternal(base, so.linkId, { name: file.name, data: bytes, cache, time: file.lastModified, fileSize: bytes.length, fileType: fileTypeOf(file.name, bytes) });
      if (px && px.rgba && px.rgba.length)
        buf = applyEdits(buf, [{ op: 'replaceLayerPixels', index: map(idx), rgba: { data: new Uint8Array(px.rgba.buffer, px.rgba.byteOffset, px.rgba.length), width: px.bounds.right - px.bounds.left, height: px.bounds.bottom - px.bounds.top }, bounds: px.bounds }]).buffer;
      return { buf, sel: map(idx) };
    });
    if (ok) remember(so.linkId, picked);
    return ok;
  }
  const selSO = () => soIndexOf(st().selLayer);
  const soWhy = () => '先选中一个智能对象图层';
  R('layer.smart.relinkFile', async () => {
    const k = selSO(); if (k < 0) return;
    const picked = await linkPicker.pick(); if (!picked) return;
    if (await relinkWith(k, picked, '重新链接到文件')) note(`已重新链接到「${picked.file.name}」`);
  }, () => ctx.inPreview() && selSO() >= 0 && isExternal(selSO()), { why: () => selSO() < 0 ? soWhy() : '这是内嵌的智能对象（PS 只对链接的智能对象提供「重新链接」；内嵌的请用「替换内容」）' });
  async function updateOne(k) {
    const so = st().sos[k], h = HANDLES.get(so.linkId);
    if (!h) return { k, why: 'missing' };
    const f = await fileOfHandle(h);
    if (!f) { h.status = 'missing'; return { k, why: 'missing' }; }
    if (f.lastModified <= (h.lastModified || 0)) { h.status = 'ok'; return { k, why: 'same' }; }
    const ok = await relinkWith(k, { handle: h.handle, file: f }, '更新修改的内容');
    return { k, ok };
  }
  R('layer.smart.updateModified', async () => {
    const k = selSO(); if (k < 0) return;
    const r = await updateOne(k);
    note(r.ok ? '已更新为链接文件的最新内容' : r.why === 'same' ? '链接的文件没有变化，不需要更新' : '找不到链接的文件（缺失）：用「重新链接到文件…」');
    ctx.ui.renderLayerPanel();
  }, () => ctx.inPreview() && selSO() >= 0 && isExternal(selSO()), { why: () => selSO() < 0 ? soWhy() : '这是内嵌的智能对象，没有外部文件可以更新' });
  R('layer.smart.updateAll', async () => {
    let n = 0, miss = 0;
    for (let k = 0; k < st().sos.length; k++) {
      if (!isExternal(k)) continue;
      const kk = st().sos.findIndex(so => so.linkId === st().sos[k].linkId);   
      const r = await updateOne(kk < 0 ? k : kk);
      if (r.ok) n++; else if (r.why === 'missing') miss++;
    }
    note(`更新了 ${n} 个链接的智能对象` + (miss ? `；${miss} 个找不到文件（缺失）` : ''));
    ctx.ui.renderLayerPanel();
  }, () => ctx.inPreview() && st().sos.some((_, k) => isExternal(k)), { why: () => '文档里没有链接的智能对象' });
  async function embedOne(k) {
    const so = st().sos[k], idx = ctx.so.matchLayer(so);
    const bytes = await contentBytes(k);
    if (!bytes) { err(`「${so.layerName}」找不到链接的文件、也没有缓存：先「重新链接到文件…」再嵌入。`); return false; }
    const rec = recordOf(k);
    const name = (rec && (rec.name || (rec.link && rec.link.name))) || so.layerName;
    return ctx.structural('嵌入链接的智能对象', async (base, { map }) => ({ buf: makeRecordEmbedded(base, so.linkId, { name, data: bytes, fileType: fileTypeOf(name, bytes) }), sel: map(idx) }));
  }
  R('layer.smart.embed', async () => { const k = selSO(); if (k >= 0 && await embedOne(k)) note('已嵌入：内容存进 PSD，不再依赖外部文件'); },
    () => ctx.inPreview() && selSO() >= 0 && isExternal(selSO()), { why: () => selSO() < 0 ? soWhy() : '这个智能对象已经是内嵌的' });
  R('layer.smart.embedAll', async () => {
    let n = 0;
    for (;;) {
      const k = st().sos.findIndex((_, q) => isExternal(q) && !skip.has(st().sos[q].linkId));
      if (k < 0) break;
      if (await embedOne(k)) n++; else skip.add(st().sos[k].linkId);
    }
    skip.clear();
    note(`嵌入了 ${n} 个链接的智能对象`);
  }, () => ctx.inPreview() && st().sos.some((_, k) => isExternal(k)), { why: () => '文档里没有链接的智能对象' });
  const skip = new Set();
  R('layer.smart.convertToLinked', async () => {
    const k = selSO(); if (k < 0) return;
    const so = st().sos[k], idx = ctx.so.matchLayer(so);
    const bytes = await contentBytes(k); if (!bytes) { err('这个智能对象没有内嵌内容可导出。'); return; }
    const si = so.sourceImage || {};
    const ext = isPsdBytes(bytes) ? (bytes[5] === 2 ? '.psb' : '.psd') : bytes[0] === 0x89 ? '.png' : bytes[0] === 0xff ? '.jpg' : '';
    const suggested = (si.filename || so.layerName || '智能对象').replace(/\.[^.]+$/, '') + ext;
    let handle = null, name = suggested;
    if (window.showSaveFilePicker) {
      try { handle = await window.showSaveFilePicker({ suggestedName: suggested }); name = handle.name;
        const w = await handle.createWritable(); await w.write(bytes); await w.close(); }
      catch (e) { if (e && e.name === 'AbortError') return; handle = null; }
    }
    if (!handle) {                         
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = suggested; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const cache = await ctx.dialogs.choiceDialog('PSD 里要不要保留一份缓存数据？（不保留 = 与 PS 一样只记文件名）', { title: '转换为链接对象', okText: '保留缓存', extraText: '不保留', cancelText: '取消' });
    if (cache === 'cancel') return;
    const ok = await ctx.structural('转换为链接对象', async (base, { map }) => ({
      buf: makeRecordExternal(base, so.linkId, { name, data: bytes, cache: cache === 'ok', fileSize: bytes.length, fileType: fileTypeOf(name, bytes) }), sel: map(idx) }));
    if (ok) {
      const f = handle ? await handle.getFile() : new File([bytes], name, { lastModified: Date.now() });
      remember(so.linkId, { handle, file: f });
      note(`已转换为链接对象：内容存成「${name}」` + (handle ? '' : '（已下载；把它和 PSD 放在同一个文件夹，PS 就能链上）'));
    }
  }, () => ctx.inPreview() && selSO() >= 0 && !isExternal(selSO()) && !!(st().sos[selSO()].sourceImage || {}).bytes,
  { why: () => selSO() < 0 ? soWhy() : '这个智能对象已经是链接的' });
  R('layer.smart.reveal', () => false, () => false, { why: () => '浏览器拿不到文件在磁盘上的路径，没法在访达 / 资源管理器里定位它（链接的文件名见图层的悬停提示）' });
  R('layer.smart.relinkLibrary', () => false, () => false, { why: () => '不做（永久）：库图形依赖 Adobe Creative Cloud 账号服务' });

  
  const sfInfo = () => { const i = st().selLayer; return i >= 0 ? ctx.sf.smartFilterInfo(i) : null; };
  const sfData = k => { const S = st().soFilters[k]; return S && S.state === 'ok' ? S.data : null; };
  const placedIdOf = k => { const so = st().sos[k]; return so && so.placedId; };
  function maskEnabled(k) {
    const e = ctx.sf.soFilterEdits[k];
    if (e && e.style && e.style.filterMaskEnable !== undefined) return e.style.filterMaskEnable;
    const d = sfData(k); return !(d && d.style && d.style.filterMaskEnable === false);
  }
  
  function filteredOf(k, input, opts = {}) {
    if (!SFR) return null;                               
    const d = sfData(k); if (!d || !Array.isArray(d.filters)) return null;
    const e = ctx.sf.soFilterEdits[k] || { filters: {}, style: {} };
    const master = opts.masterOff ? false : (e.style && e.style.enabled !== undefined ? e.style.enabled : !(d.style && d.style.enabled === false));
    if (!master) return input.rgba;
    const steps = [];
    for (const f of d.filters) {
      if (opts.drop) continue;
      const q = e.filters && e.filters[f.index];
      const on = q && q.enabled !== undefined ? q.enabled : f.enabled !== false;
      if (!on) continue;
      if (f.owner === 'deform') return null;              
      const kk = SFR.kernelOf(f, (f2, p) => (q && q.values && q.values[p.path] !== undefined ? q.values[p.path] : p.value));
      if (!kk) return null;
      steps.push(kk);
    }
    return SFR.runFilterStack(input.rgba, input.width, input.height, steps, input.rect);
  }
  function composeWithMask(input, filtered, mask, on) {
    const m = on && mask ? maskSampler(mask, true) : () => 255;
    return SFR.blendByFilterMask(input.rgba, filtered, input.rect, m);
  }
  const pixelOp = (index, rgba, rect) => {
    const c = cropAlpha(rgba, rect.right - rect.left, rect.bottom - rect.top);
    if (!c) return null;
    const b = { top: c.bounds.top + rect.top, left: c.bounds.left + rect.left, bottom: c.bounds.bottom + rect.top, right: c.bounds.right + rect.left };
    return { op: 'replaceLayerPixels', index, rgba: { data: c.data, width: c.width, height: c.height }, bounds: b };
  };
  const findSo = (buf, idxBuilt) => parseSmartObjects(buf).find(so2 => so2.layerIndex === idxBuilt);
  async function sfWriteback(base, so2, edits) {
    const j = await ctx.sf.filterPost('/so/filters/writeback', { fragment: ctx.sf.fragmentToJSON(smartObjectFragment(base, so2)), edits });
    return replacePlacedBlocks(base, so2, (j.blocks || []).map(b => ({ key: b.key, data: ctx.sf.b64ToU8(b.data) }))).buffer;
  }
  async function sfMaskCommand(kind) {
    const s = st(), idx = s.selLayer, k = soIndexOf(idx);
    if (k < 0) return false;
    const pid = placedIdOf(k);
    const input = pid ? readFilterInput(s.origBuffer, pid) : null;
    const mask = pid ? readFilterMask(s.origBuffer, pid) : null;
    const on = maskEnabled(k);
    const label = kind === 'delete' ? '删除滤镜蒙版' : kind === 'toggle' ? (on ? '停用滤镜蒙版' : '启用滤镜蒙版') : '清除智能滤镜';
    let raster = null;
    if (input && kind !== 'clear') { try { await loadSfr(); } catch (e) { err('智能滤镜重算的代码没能载入：' + (e && e.message || e)); return false; } }
    if (input) {
      if (kind === 'clear') raster = input.rgba;
      else {
        const flt = filteredOf(k, input);
        if (flt) raster = kind === 'delete' ? flt : composeWithMask(input, flt, mask, !on);
      }
    }
    const ok = await ctx.structural(label, async (base, { map, applyEdits }) => {
      const b = map(idx);
      let buf = base;
      const so2 = findSo(buf, b);
      if (!so2) throw new Error('在当前文档里找不到这个智能对象');
      if (kind === 'toggle') buf = await sfWriteback(buf, so2, { style: { filterMaskEnable: !on } });
      else if (kind === 'clear') {
        const d = sfData(k);
        const n = d && d.filters ? d.filters.length : 0;
        if (n) buf = await sfWriteback(buf, so2, { filters: d.filters.map(f => ({ index: f.index, remove: true })), allowEmpty: true, clearAll: true });
      }
      if (pid && input) {
        if (kind === 'delete') buf = writeFilterMask(buf, pid, null);
        if (kind === 'clear') buf = removeFilterEntry(buf, pid);
      }
      if (raster) { const op = pixelOp(b, raster, input.rect); if (op) buf = applyEdits(buf, [op]).buffer; }
      return { buf, sel: b };
    });
    if (ok) note(label + (raster ? '' : '（这一层的滤镜在浏览器里重算不了 / 没有滤镜输入缓存：画布保留缓存栅格，PS 打开时会重新求值）'));
    return ok;
  }
  const sfHas = () => { const i = sfInfo(); return !!(i && i.filters.length && i.writable && !i.busy); };
  const sfHasMask = () => { if (!sfHas()) return false; const k = soIndexOf(st().selLayer), pid = placedIdOf(k); try { return !!(pid && readFilterMask(st().origBuffer, pid)); } catch { return false; } };
  R('layer.smartFilter.deleteMask', () => { sfMaskCommand('delete'); }, () => ctx.inPreview() && sfHasMask(), { why: () => sfHas() ? '这一层的智能滤镜没有滤镜蒙版' : '这一层没有可改的智能滤镜' });
  R('layer.smartFilter.disableMask', () => { sfMaskCommand('toggle'); }, () => ctx.inPreview() && sfHasMask(),
    { why: () => sfHas() ? '这一层的智能滤镜没有滤镜蒙版' : '这一层没有可改的智能滤镜', checked: () => { const k = soIndexOf(st().selLayer); return k >= 0 && sfHasMask() && !maskEnabled(k); } });
  R('layer.smartFilter.clear', () => { sfMaskCommand('clear'); }, () => ctx.inPreview() && sfHas(), { why: () => '这一层没有可改的智能滤镜' });

  
  let fm = null;                       
  async function startFilterMaskEdit(idx) {
    let s = st(), k = soIndexOf(idx);
    if (k < 0) return false;
    
    if (!sfData(k)) { ctx.sf.smartFilterInfo(idx); for (let t = 0; t < 50 && !sfData(k); t++) await new Promise(r => setTimeout(r, 100)); }
    s = st(); k = soIndexOf(idx);
    const pid = placedIdOf(k);
    if (k < 0) return false;
    const input = pid ? readFilterInput(s.origBuffer, pid) : null;
    if (!input) { err('这一层没有「滤镜之前」的输入缓存（FEid），画不了滤镜蒙版：PS 写的带智能滤镜的文件才有这份缓存。'); return false; }
    try { await loadSfr(); } catch (e) { err('智能滤镜重算的代码没能载入：' + (e && e.message || e)); return false; }
    const filtered = filteredOf(k, input);
    if (!filtered) { err('这一层的滤镜里有浏览器重算不了的（变形滤镜 / 未知滤镜），滤镜蒙版的预览没法实时更新；可以在 PS 里编辑滤镜蒙版。'); return false; }
    const r = input.rect, w = r.right - r.left, h = r.bottom - r.top;
    const old = readFilterMask(s.origBuffer, pid);
    const gray = new Uint8Array(w * h).fill(255);
    if (old) { const m = maskSampler(old, true); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = m(x + r.left, y + r.top); }
    fm = { idx, k, pid, input, filtered, mask: { gray, rect: { ...r } }, on: maskEnabled(k), buf: s.origBuffer, had: !!old, dirty: false };
    ctx.ui.renderLayerPanel();
    note('正在编辑滤镜蒙版：用画笔（B）涂黑 = 这里不要滤镜效果，涂白 = 恢复；X 切换前景 / 背景色。点一下图层缩略图结束。');
    return true;
  }
  function endFilterMaskEdit() { if (fm) { fm = null; ctx.ui.renderLayerPanel(); } }
  function fmValid() { if (fm && fm.buf !== st().origBuffer) { const idx = fm.idx; fm = null; startFilterMaskEdit(idx); return false; } return !!fm; }
  function previewFm() {
    const out = composeWithMask(fm.input, fm.filtered, fm.mask, true);
    ctx.so.setLayerRaster(fm.idx, out, fm.input.rect);
  }
  function decorateFilterHead(head, idx, info) {
    const k = soIndexOf(idx), pid = placedIdOf(k);
    let mask = null;
    try { mask = pid ? readFilterMask(st().origBuffer, pid) : null; } catch { mask = null; }
    const has = !!mask || (fm && fm.idx === idx);
    const th = document.createElement('canvas'); th.width = 22; th.height = 16; th.className = 'lx-fmthumb';
    th.dataset.attr = 'sf-mask-thumb';
    const g = th.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 22, 16);
    const src = fm && fm.idx === idx ? fm.mask : mask;
    if (src) {
      const r = src.rect, w = r.right - r.left, h = r.bottom - r.top, id = g.createImageData(22, 16);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 22; x++) { const v = src.gray[Math.min(h - 1, Math.floor(y / 16 * h)) * w + Math.min(w - 1, Math.floor(x / 22 * w))]; const o = (y * 22 + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255; }
      g.putImageData(id, 0, 0);
    }
    if (k >= 0 && !maskEnabled(k) && has) { g.strokeStyle = '#e34850'; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 2); g.lineTo(20, 14); g.moveTo(20, 2); g.lineTo(2, 14); g.stroke(); }
    th.style.cssText = 'width:22px;height:16px;margin:0 6px 0 0;border:1px solid var(--line,#555);cursor:pointer;flex:none;' + (fm && fm.idx === idx ? 'outline:2px solid #fff;outline-offset:1px;' : '');
    th.title = (has ? '滤镜蒙版' : '滤镜蒙版（全白 = 滤镜作用于整层）') + '：单击 = 用画笔编辑滤镜蒙版（再点一次结束）；⇧ 单击 = 停用 / 启用';
    th.onclick = ev => {
      ev.stopPropagation();
      if (ev.shiftKey) { if (st().selLayer !== idx) ctx.setSel(idx); sfMaskCommand('toggle'); return; }
      if (fm && fm.idx === idx) { endFilterMaskEdit(); return; }
      if (st().selLayer !== idx) ctx.setSel(idx);
      startFilterMaskEdit(idx);
    };
    head.append(th);
    void info;
  }
  


  let fmStroke = null;
  function dab(x, y) {
    const b = ctx.brush(), rad = Math.max(0.5, b.size / 2), hard = Math.max(0, Math.min(1, b.hardness));
    const col = ctx.paintGray(), a = Math.max(0, Math.min(1, b.opacity * (b.flow ?? 1)));
    const r = fm.mask.rect, w = r.right - r.left, h = r.bottom - r.top, G = fm.mask.gray;
    const x0 = Math.max(0, Math.floor(x - rad - r.left)), x1 = Math.min(w - 1, Math.ceil(x + rad - r.left));
    const y0 = Math.max(0, Math.floor(y - rad - r.top)), y1 = Math.min(h - 1, Math.ceil(y + rad - r.top));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.hypot(xx + r.left + .5 - x, yy + r.top + .5 - y) / rad;
      if (d >= 1) continue;
      const k = d <= hard ? 1 : 1 - (d - hard) / Math.max(1e-6, 1 - hard);
      const t = a * k, o = yy * w + xx;
      G[o] = Math.round(G[o] + (col - G[o]) * t);
    }
    fm.dirty = true;
  }
  function strokeTo(p) {
    const q = fmStroke.last, step = Math.max(1, ctx.brush().size * 0.25);
    const dist = Math.hypot(p.x - q.x, p.y - q.y), n = Math.max(1, Math.floor(dist / step));
    for (let i = 1; i <= n; i++) dab(q.x + (p.x - q.x) * i / n, q.y + (p.y - q.y) * i / n);
    fmStroke.last = p;
  }
  let fmRaf = 0;
  const schedulePreview = () => { if (fmRaf) return; fmRaf = requestAnimationFrame(() => { fmRaf = 0; if (fm) previewFm(); }); };
  const PAINT = new Set(['brush', 'pencil', 'eraser']);
  function onDown(ev) {
    if (!fm || !PAINT.has(st().docTool) || ev.button !== 0 || !fmValid()) return;
    if (st().selLayer !== fm.idx) { endFilterMaskEdit(); return; }
    ev.preventDefault(); ev.stopImmediatePropagation();
    const p = ctx.toDoc(ev);
    fmStroke = { last: p, id: ev.pointerId, erase: st().docTool === 'eraser' };
    ctx.setEraseColor(fmStroke.erase);
    try { ev.target.setPointerCapture(ev.pointerId); } catch {}
    dab(p.x, p.y); schedulePreview();
  }
  function onMove(ev) {
    if (!fmStroke) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    strokeTo(ctx.toDoc(ev)); schedulePreview();
  }
  async function onUp(ev) {
    if (!fmStroke) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    fmStroke = null; ctx.setEraseColor(false);
    if (!fm || !fm.dirty) return;
    await commitFm();
  }
  async function commitFm() {
    const f = fm; if (!f) return false;
    const out = composeWithMask(f.input, f.filtered, f.mask, f.on);
    const mask = { gray: Uint8Array.from(f.mask.gray), rect: { ...f.mask.rect } };
    const ok = await ctx.structural('编辑滤镜蒙版', async (base, { map, applyEdits }) => {
      const b = map(f.idx);
      let buf = writeFilterMask(base, f.pid, mask);
      const op = pixelOp(b, out, f.input.rect);
      if (op) buf = applyEdits(buf, [op]).buffer;
      return { buf, sel: b };
    });
    if (ok && fm === f) { const idx = f.idx; fm = null; await startFilterMaskEdit(idx); }
    return ok;
  }
  function wirePointer(el) {
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onUp, true);
  }
  if (ctx.gizmo) wirePointer(ctx.gizmo);

  
  R('layer.frameFromLayers', async () => {
    const s = st(), picks = targets().filter(i => {
      const L = s.layerTree.flat[i]; return L && L.groupType !== 3 && !L.isFrame;
    });
    if (!picks.length) { note('先选中要转换为图框的内容'); return; }
    const nm = await ctx.dialogs.promptDialog('将所选内容转换为原生图框，保留可编辑的智能对象内容。', '图框', { title: '来自图层的画框', label: '名称' });
    if (nm == null) return;
    const ok = await ctx.createFrameFromLayer(picks.includes(s.selLayer) ? s.selLayer : picks[0], nm || '图框');
    if (ok) note('已创建原生图框');
    return ok;
  }, () => ctx.inPreview() && targets().some(i => {
    const L = st().layerTree?.flat[i]; return L && L.groupType !== 3 && !L.isFrame;
  }) && !ctx.frameWhy(), { why: () => ctx.frameWhy() || '先选中要做成图框的内容' });

  
  R('layer.rasterize.vectorMask', async () => {
    const s = st(), i = s.selLayer, L = s.layerTree.flat[i], dl = s.doc.layers[i];
    if (!L || !L.vectorMask || !dl.vectorMask) return;
    if (ctx.isShapeLayer(i)) { note('形状图层的矢量蒙版就是它的形状：请用「栅格化 › 形状」'); return; }
    const W = s.docW, H = s.docH;
    let vm;
    try { vm = rasterizeVectorMask(dl.vectorMask, W, H); } catch (e) { err('矢量蒙版栅格化失败：' + (e && e.message || e)); return; }
    
    const gray = new Uint8Array(W * H);
    const m = dl.mask && dl.mask.gray ? dl.mask : null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = vm[y * W + x];
      if (m) {
        const mx = x - m.left, my = y - m.top;
        const g = mx >= 0 && my >= 0 && mx < m.width && my < m.height ? m.gray[my * m.width + mx] : (m.defaultColor ?? 0);
        v = Math.round(v * g / 255);
      }
      gray[y * W + x] = v;
    }
    await ctx.structural('栅格化矢量蒙版', async (base, { map, applyEdits }) => {
      const b = map(i);
      const bounds = { top: 0, left: 0, bottom: H, right: W };
      const ops = [{ op: 'rasterizeLayer', index: b, keys: ['vmsk', 'vsms'] }];
      ops.push(m ? { op: 'replaceLayerMask', index: b, gray, bounds } : { op: 'addLayerMask', index: b, gray: { data: gray, width: W, height: H }, bounds });
      return { buf: applyEdits(base, ops).buffer, sel: b };
    });
  }, () => { const s = st(), L = ctx.inPreview() && s.layerTree && s.layerTree.flat[s.selLayer]; return !!(L && L.vectorMask && !ctx.isShapeLayer(s.selLayer)); },
  { why: () => '选中的图层没有矢量蒙版（形状图层请用「栅格化 › 形状」）' });

  
  function decorateRow(row, idx, l) {
    if (checkedBuf?.deref() !== st().origBuffer) refreshLinkStatus();
    const g = gidOf(idx);
    if (g && l.groupType !== 3) {
      const off = linkOff(idx);
      const t = document.createElement('span');
      t.className = 'ltag icon-only lx-link' + (off ? ' off' : '');
      t.dataset.attr = 'link-badge';
      t.style.cssText = 'position:relative;color:var(--text,#ddd);' + (off ? 'opacity:.9;' : '');
      t.append(svgEl('link', 12));
      if (off) { const x = document.createElement('span'); x.textContent = '×'; x.style.cssText = 'position:absolute;right:-2px;top:-5px;color:#e34850;font-weight:700;font-size:12px'; t.append(x); }
      t.title = (off ? '链接已停用（红叉）' : `链接图层（第 ${g} 组，共 ${linkedOf(idx).length + 1} 层）`) + '\n⇧ 单击 = ' + (off ? '启用' : '停用') + '这一层的链接';
      t.onclick = ev => { if (ev.shiftKey) { ev.stopPropagation(); toggleLinkDisabled(idx); } };
      row.append(t);
    }
    const k = soIndexOf(idx);
    if (k >= 0 && isExternal(k)) {
      const stt = linkStatus(k), rec = recordOf(k);
      const t = document.createElement('span');
      t.className = 'ltag icon-only lx-solink'; t.dataset.attr = 'solink-' + stt;
      t.append(svgEl(stt === 'missing' ? 'missing' : stt === 'modified' ? 'differs' : 'ok', 12));
      const nm = rec ? (rec.link && rec.link.name) || rec.name : '';
      t.title = stt === 'missing' ? `链接的文件「${nm}」找不到了（缺失）${rec && rec.data ? '，内容用 PSD 里的缓存' : '，画面用缓存栅格'}：右键 / 图层 › 智能对象 › 重新链接到文件…`
        : stt === 'modified' ? `链接的文件「${nm}」已修改：图层 › 智能对象 › 更新修改的内容` : `链接的智能对象：「${nm}」`;
      row.append(t);
    }
  }
  queueMicrotask(() => refreshLinkStatus());

  function dynLabel(k) {
    if (k === 'linkLayers') { const t = targets(); return t.length && allLinked(t) ? '取消链接图层' : '链接图层'; }
    if (k === 'sfMask') { const kk = soIndexOf(st().selLayer); return kk >= 0 && sfHasMask() && !maskEnabled(kk) ? '启用滤镜蒙版' : '停用滤镜蒙版'; }
    return undefined;
  }
  
  async function writeBackExternal(k, bytes) {
    const so = st().sos[k], h = so && HANDLES.get(so.linkId);
    if (!h || !h.handle || !h.handle.createWritable) { note('链接的文件没有可写的句柄：改动留在 PSD 的缓存栅格里；要写回原文件请先「重新链接到文件…」'); return false; }
    try {
      if (h.handle.requestPermission && await h.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return false;
      const w = await h.handle.createWritable(); await w.write(new Uint8Array(bytes)); await w.close();
      const f = await h.handle.getFile(); h.lastModified = f.lastModified; h.status = 'ok';
      idbPut(so.linkId, { handle: h.handle, name: h.name, lastModified: h.lastModified });
      note(`已写回链接的文件「${h.name}」`);
      return true;
    } catch (e) { err('写回链接的文件失败：' + (e && e.message || e)); return false; }
  }
  
  function imageToPsd(img, name) {
    const rgba = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length);
    const bytes = writePsd({ width: img.width, height: img.height, layers: [{ name: (name || '图层 1').replace(/\.[^.]+$/, ''), bounds: { top: 0, left: 0, bottom: img.height, right: img.width }, rgba }], composite: rgba });
    return bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  }
  
  async function encodeAs(format, composite) {
    const cv = document.createElement('canvas'); cv.width = composite.width; cv.height = composite.height;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(composite.data), composite.width, composite.height), 0, 0);
    const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('编码失败')), type, 0.92));
    return new Uint8Array(await blob.arrayBuffer());
  }

  return {
    linkedOf, rowHidden, decorateRow, decorateFilterHead, dynLabel, refreshLinkStatus,
    imageToPsd, encodeAs, imageFromBytes, contentBytes, isPsdBytes, writeBackExternal,
    get fm() { return fm && { idx: fm.idx, dirty: fm.dirty }; }, startFilterMaskEdit, endFilterMaskEdit, commitFm,
    linkPicker, HANDLES, stackOf, soSourceImage, stackModeOfK,
    get isolated() { return !!isolate; },
    test: { gidOf, linkOff, links, innerLeaves, isExternal, linkStatus, soIndexOf, maskEnabled },
  };
}
export default { installLayersMore };
