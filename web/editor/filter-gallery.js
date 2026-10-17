












import { GALLERY_GROUPS, GALLERY_EFFECTS, effectSpec, effectDefaults, normalizeEffectParams, applyGalleryStack, applyGalleryEffect, TEXTURE_OPTS } from '../../core/filter-gallery.js';
import { createWorkspace, mk, slider, select, check, color, button, row, hexToRgb, rgbToHex, drawChecker } from './fx-workspace.js';
import { uiIcon } from './icons.js';
import { setGalleryKernel } from '../../core/smart-filter-render.js';


setGalleryKernel(applyGalleryStack);

const workerUrlP = import('../../core/filter-gallery-worker.js').then(m => m.WORKER_URL).catch(() => null);

const LS_STATE = 'fp.filterGallery.state', LS_SHOWALL = 'fp.filterGallery.showAll', LS_FOLDERS = 'fp.filterGallery.folders';
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };


export function galleryShowAll() { return lsGet(LS_SHOWALL) === '1'; }
export function setGalleryShowAll(v) { lsSet(LS_SHOWALL, v ? '1' : '0'); }


const mem = { layers: null, params: {}, textures: {} };
(function load() {
  try {
    const j = JSON.parse(lsGet(LS_STATE) || 'null');
    if (j && Array.isArray(j.layers)) mem.layers = j.layers.filter(l => l && effectSpec(l.id)).map(l => ({ id: l.id, params: normalizeEffectParams(l.id, l.params), visible: l.visible !== false }));
    if (j && j.params) for (const [k, v] of Object.entries(j.params)) if (effectSpec(k)) mem.params[k] = normalizeEffectParams(k, v);
  } catch {}
})();
function saveMem() {
  const strip = p => { const o = { ...p }; if (o.TxtT === 'custom') o.TxtT = 'TxCa'; return o; };
  lsSet(LS_STATE, JSON.stringify({ layers: (mem.layers || []).map(l => ({ id: l.id, params: strip(l.params), visible: l.visible })), params: Object.fromEntries(Object.entries(mem.params).map(([k, v]) => [k, strip(v)])) }));
}
export function lastGalleryLayers() { return mem.layers ? mem.layers.map(l => ({ ...l, params: { ...l.params } })) : null; }


let workerBroken = false;
function makeRunner() {
  let w = null, pending = null, seq = 0;
  const spawn = url => {
    if (w || workerBroken) return;
    if (!url) { workerBroken = true; return; }
    try { w = new Worker(url, { type: 'module' }); }
    catch { workerBroken = true; w = null; return; }
    w.onmessage = ev => {
      const m = ev.data || {}, p = pending; if (m.ready || !p || m.job !== p.job) return;
      p.alive = true;
      if (m.progress != null) { p.onProgress && p.onProgress(m.progress); return; }
      if (m.thumb) { p.onThumb && p.onThumb(m.thumb, new Uint8ClampedArray(m.rgba.buffer || m.rgba)); return; }
      if (m.error) { pending = null; p.reject(new Error(m.error)); return; }
      if (m.done) { pending = null; p.resolve(m.rgba ? new Uint8ClampedArray(m.rgba.buffer || m.rgba) : true); }
    };
    
    w.onerror = ev => { ev.preventDefault && ev.preventDefault(); const p = pending; if (p && !p.alive) { workerBroken = true; try { w.terminate(); } catch {} w = null; pending = null; mainThread(p); } };
  };
  function mainThread(p) {
    setTimeout(() => {
      if (p.cancelled) return;
      try {
        if (p.msg.type === 'stack') p.resolve(applyGalleryStack(p.msg.rgba, p.msg.w, p.msg.h, p.msg.layers, p.msg.env));
        else {
          const ids = p.msg.ids.slice();
          const step = () => {
            if (p.cancelled) return;
            const id = ids.shift(); if (!id) { p.resolve(true); return; }
            try { p.onThumb && p.onThumb(id, applyGalleryEffect(id, p.msg.rgba, p.msg.w, p.msg.h, (p.msg.params && p.msg.params[id]) || effectDefaults(id), p.msg.env)); } catch {}
            setTimeout(step, 0);
          };
          step();
        }
      } catch (e) { p.reject(e); }
    }, 16);
  }
  return {
    async run(msg, hooks = {}) {
      this.cancel();
      const url = await workerUrlP;
      return new Promise((resolve, reject) => {
        const p = { job: ++seq, msg: { ...msg, job: seq }, resolve, reject, alive: false, ...hooks };
        pending = p;
        spawn(url);
        if (!w) { mainThread(p); return; }
        const copy = new Uint8ClampedArray(msg.rgba);
        try { w.postMessage({ ...p.msg, rgba: copy }, [copy.buffer]); } catch (e) { reject(e); }
      });
    },
    cancel() {
      const p = pending; if (!p) return;
      pending = null; p.cancelled = true;
      if (w) { try { w.terminate(); } catch {} w = null; }
      p.reject(Object.assign(new Error('已取消'), { cancelled: true }));
    },
    dispose() { this.cancel(); if (w) { try { w.terminate(); } catch {} w = null; } },
  };
}


export async function runGallery(rgba, w, h, layers, env, onProgress) {
  const r = makeRunner();
  try { return await r.run({ type: 'stack', rgba, w, h, layers, env: packEnv(env) }, { onProgress }); } finally { r.dispose(); }
}
const packEnv = env => ({ fg: env.fg, bg: env.bg, seed: env.seed ?? 1, texture: env.texture || null });


const btnCss = 'display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;padding:0';
function iconBtn(parent, icon, title, fn) { const b = mk('button', { type: 'button', title }, btnCss); b.append(uiIcon(icon, 14)); b.onclick = fn; parent.append(b); return b; }
function cropRGBA(src, w, r) {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) out.set(src.subarray(((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4), y * r.w * 4);
  return out;
}
function toCanvas(rgba, w, h) { const c = mk('canvas', { width: w, height: h }); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h), 0, 0); return c; }








export async function openFilterGallery(o) {
  const { rgba: SRC, w: W, h: H } = o;
  const fg = o.fg || [0, 0, 0], bg = o.bg || [255, 255, 255];
  
  let layers = lastGalleryLayers() || [{ id: o.effect || 'cutout', params: effectDefaults(o.effect || 'cutout'), visible: true }];
  

  if (Array.isArray(o.layers) && o.layers.length)
    layers = o.layers.filter(l => l && effectSpec(l.id)).map(l => ({ id: l.id, params: normalizeEffectParams(l.id, l.params || {}), visible: l.visible !== false }));
  if (!o.layers && o.effect && effectSpec(o.effect)) {
    const top = layers.length - 1;
    if (layers[top].id !== o.effect) layers[top] = { id: o.effect, params: { ...(mem.params[o.effect] || effectDefaults(o.effect)) }, visible: true };
  }
  for (const l of layers) if (l.params.TxtT === 'custom' && mem.textures[l.id]) l.texture = mem.textures[l.id];
  let sel = layers.length - 1;
  const cur = () => layers[sel];

  const ws = createWorkspace({ title: '滤镜库', width: W, height: H, rightWidth: 560, hand: false, zoom: false, onKey });
  ws.bar.style.display = 'none'; ws.left.style.display = 'none';
  ws.right.style.cssText += ';flex-direction:row;gap:0;padding:0;overflow:hidden';
  const colF = mk('div', {}, 'width:236px;overflow:auto;border-right:1px solid rgba(128,128,128,.25);padding:6px 6px 10px');
  const colP = mk('div', {}, 'flex:1;display:flex;flex-direction:column;gap:7px;padding:10px 12px;min-width:0;overflow:hidden');
  ws.right.append(colF, colP);

  
  const srcCanvas = toCanvas(SRC, W, H);
  const big = W * H > 2.5e6;
  let res = null;                 
  let busy = false, prog = 0;
  ws.redraw = (c) => {
    const s = ws.scale, x0 = ws.tx, y0 = ws.ty;
    drawChecker(c, x0, y0, W * s, H * s);
    c.imageSmoothingEnabled = s < 1; c.imageSmoothingQuality = 'high';
    if (!res || big) c.drawImage(srcCanvas, x0, y0, W * s, H * s);
    if (res) c.drawImage(res.canvas, x0 + res.x * s, y0 + res.y * s, res.w * s, res.h * s);
    if (busy) {
      const r = ws.mid.getBoundingClientRect();
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(r.width - 150, 8, 140, 8);
      c.fillStyle = '#4a9cff'; c.fillRect(r.width - 150, 8, 140 * prog, 8);
    }
    zoomSel.value = ''; zoomLab.textContent = Math.round(s * 1000) / 10 + '%';
    if (big && res && !busy) afterView();      
  };
  
  const zb = mk('div', {}, 'position:absolute;left:8px;bottom:8px;display:flex;gap:4px;align-items:center;background:rgba(40,40,40,.85);padding:3px 5px;border-radius:4px;font-size:12px;color:#ddd');
  iconBtn(zb, 'minus', '缩小', () => { ws.zoomAt(1 / 1.25); afterView(); });
  const zoomLab = mk('span', {}, 'min-width:52px;text-align:center');
  const zoomSel = mk('select', { title: '缩放比例' }, 'width:18px');
  for (const [v, t] of [['', ''], ['fit', '符合视图大小'], ['0.25', '25%'], ['0.5', '50%'], ['0.667', '66.7%'], ['1', '100%'], ['2', '200%'], ['4', '400%'], ['8', '800%']]) zoomSel.append(mk('option', { value: v, textContent: t }));
  zoomSel.onchange = () => { const v = zoomSel.value; if (v === 'fit') ws.fit(); else if (v) ws.zoomAt(+v / ws.scale); afterView(); };
  zb.append(zoomLab, zoomSel);
  iconBtn(zb, 'plus', '放大', () => { ws.zoomAt(1.25); afterView(); });
  ws.mid.append(zb);
  ws.status.style.bottom = '40px';

  
  const runner = makeRunner(), thumbRunner = makeRunner();
  let timer = 0;
  const liveLayers = () => layers.map(l => ({ id: l.id, params: l.params, visible: l.visible, texture: l.params.TxtT === 'custom' ? (l.texture || null) : null }));
  function visibleRect() {
    if (!big) return { x: 0, y: 0, w: W, h: H };
    const r = ws.mid.getBoundingClientRect(), pad = 48;
    const x0 = Math.max(0, Math.floor(-ws.tx / ws.scale) - pad), y0 = Math.max(0, Math.floor(-ws.ty / ws.scale) - pad);
    const x1 = Math.min(W, Math.ceil((r.width - ws.tx) / ws.scale) + pad), y1 = Math.min(H, Math.ceil((r.height - ws.ty) / ws.scale) + pad);
    
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  function schedule(delay = 140) { clearTimeout(timer); timer = setTimeout(compute, delay); }
  async function compute() {
    const r = visibleRect();
    let input = r.w === W && r.h === H ? SRC : cropRGBA(SRC, W, r), iw = r.w, ih = r.h, k = 1;
    
    if (iw * ih > 2.5e6) {
      k = Math.sqrt(iw * ih / 2.5e6); const sw = Math.max(1, Math.round(iw / k)), sh = Math.max(1, Math.round(ih / k));
      const c = mk('canvas', { width: sw, height: sh }), cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high';
      cx.drawImage(r.w === W && r.h === H ? srcCanvas : toCanvas(input, iw, ih), 0, 0, sw, sh);
      input = new Uint8ClampedArray(cx.getImageData(0, 0, sw, sh).data.buffer); iw = sw; ih = sh;
    }
    busy = true; prog = 0; ws.draw(); ws.setStatus('');
    try {
      const out = await runner.run({ type: 'stack', rgba: input, w: iw, h: ih, layers: liveLayers(), env: packEnv({ fg, bg }) }, { onProgress: f => { prog = f; ws.draw(); } });
      res = { canvas: toCanvas(out, iw, ih), x: r.x, y: r.y, w: r.w, h: r.h, k };
      busy = false; ws.draw();
    } catch (e) {
      if (e && e.cancelled) return;
      busy = false; ws.setStatus('预览失败：' + (e && e.message || e)); ws.draw();
    }
  }
  function afterView() {
    if (!big || !res) return;
    const r = visibleRect();
    const pad = 40;   
    const out = r.x + pad < res.x || r.y + pad < res.y || r.x + r.w - pad > res.x + res.w || r.y + r.h - pad > res.y + res.h;
    const coarse = res.k > 1 && ws.scale * res.k > 1.05;   
    if (out || coarse) schedule(220);
  }
  ws.view.addEventListener('pointerup', afterView);
  ws.mid.addEventListener('wheel', () => afterView(), { passive: true });

  
  const TW = 96, TH = 72, thumbs = {};
  let openFolders; try { openFolders = new Set(JSON.parse(lsGet(LS_FOLDERS) || 'null') || [effectSpec(cur().id).group]); } catch { openFolders = new Set([effectSpec(cur().id).group]); }
  openFolders.add(effectSpec(cur().id).group);
  const folderEls = {};
  for (const g of GALLERY_GROUPS) {
    const head = mk('div', { title: g.name }, 'display:flex;align-items:center;gap:4px;padding:4px 2px;cursor:default;user-select:none;font-weight:600');
    const tri = mk('span', {}, 'display:inline-flex;width:12px');
    const ico = mk('span', {}, 'display:inline-flex');
    head.append(tri, ico, mk('span', { textContent: g.name }));
    const grid = mk('div', {}, 'display:grid;grid-template-columns:repeat(2,' + TW + 'px);gap:6px 8px;padding:4px 0 8px 14px');
    const paintHead = () => { const on = openFolders.has(g.id); tri.replaceChildren(uiIcon(on ? 'chevron-down' : 'chevron-right', 10)); ico.replaceChildren(uiIcon(on ? 'folder-open' : 'folder', 14)); grid.style.display = on ? 'grid' : 'none'; };
    head.onclick = () => { if (openFolders.has(g.id)) openFolders.delete(g.id); else openFolders.add(g.id); lsSet(LS_FOLDERS, JSON.stringify([...openFolders])); paintHead(); };
    for (const e of g.effects) {
      const cell = mk('div', { title: e.name }, 'display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;font-size:11px');
      const cv = mk('canvas', { width: TW * 2, height: TH * 2 }, `width:${TW}px;height:${TH}px;border:2px solid transparent;border-radius:2px;background:#555`);
      cell.append(cv, mk('span', { textContent: e.name }, 'white-space:nowrap'));
      cell.onclick = () => setEffect(e.id);
      thumbs[e.id] = cv; grid.append(cell);
    }
    folderEls[g.id] = { paintHead };
    paintHead();
    colF.append(head, grid);
  }
  function markThumb() { for (const [id, cv] of Object.entries(thumbs)) cv.style.borderColor = id === cur().id ? '#4a9cff' : 'transparent'; }
  
  (async () => {
    const s = 240 / Math.min(W, H), sw = Math.max(TW * 2, Math.round(W * s)), sh = Math.max(TH * 2, Math.round(H * s));
    const c = mk('canvas', { width: TW * 2, height: TH * 2 }), cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high';
    cx.drawImage(srcCanvas, -(sw - TW * 2) / 2, -(sh - TH * 2) / 2, sw, sh);
    const base = new Uint8ClampedArray(cx.getImageData(0, 0, TW * 2, TH * 2).data.buffer);
    const ids = GALLERY_EFFECTS.map(e => e.id).sort((a, b) => (openFolders.has(effectSpec(b).group) ? 1 : 0) - (openFolders.has(effectSpec(a).group) ? 1 : 0));
    try {
      await thumbRunner.run({ type: 'thumbs', rgba: base, w: TW * 2, h: TH * 2, ids, env: packEnv({ fg, bg }) },
        { onThumb: (id, px) => { const cv = thumbs[id]; if (cv) cv.getContext('2d').putImageData(new ImageData(px, TW * 2, TH * 2), 0, 0); } });
    } catch {}
  })();

  
  const top = row(colP, 'justify-content:flex-end');
  const okB = button(top, '确定', () => commit(), { primary: true });
  const cancelB = button(top, '取消', () => { if (altDown) resetAll(); else ws.finish(null); });
  okB.style.minWidth = cancelB.style.minWidth = '72px';
  const effSel = mk('select', {}, 'width:100%');
  for (const g of GALLERY_GROUPS) { const og = mk('optgroup', { label: g.name }); for (const e of g.effects) og.append(mk('option', { value: e.id, textContent: e.name })); effSel.append(og); }
  effSel.onchange = () => setEffect(effSel.value);
  colP.append(effSel);
  const params = mk('div', {}, 'display:flex;flex-direction:column;gap:7px;overflow:auto;min-height:120px;flex:1');
  colP.append(params);
  const sa = check(colP, '显示滤镜库的所有组和名称', galleryShowAll(), v => { setGalleryShowAll(v); o.onShowAllChange && o.onShowAllChange(v); });
  sa.el.title = 'PS：首选项 › 增效工具。打开后滤镜菜单里会列出滤镜库各组（艺术效果 / 画笔描边 / 素描 / 纹理…）与每个效果';
  sa.el.style.opacity = '.85';
  const stackBox = mk('div', {}, 'border:1px solid rgba(128,128,128,.35);border-radius:3px;height:170px;overflow:auto;background:rgba(0,0,0,.12)');
  const stackBar = row(colP, 'justify-content:flex-end;gap:4px');
  colP.insertBefore(stackBox, stackBar);
  const newB = iconBtn(stackBar, 'new-layer', '新建效果图层（复制当前这条放在上面）', () => {
    const c = cur(); layers.splice(sel + 1, 0, { id: c.id, params: { ...c.params }, visible: true, texture: c.texture }); sel++;
    renderAll(); schedule();
  });
  const delB = iconBtn(stackBar, 'trash-2', '删除效果图层', () => {
    if (layers.length <= 1) return;
    layers.splice(sel, 1); sel = Math.min(sel, layers.length - 1); renderAll(); schedule();
  });
  void newB;

  function setEffect(id) {
    if (!effectSpec(id)) return;
    const c = cur(); if (c.id === id) return;
    mem.params[c.id] = { ...c.params };
    layers[sel] = { id, params: { ...(mem.params[id] || effectDefaults(id)) }, visible: c.visible, texture: mem.textures[id] || null };
    if (!openFolders.has(effectSpec(id).group)) { openFolders.add(effectSpec(id).group); folderEls[effectSpec(id).group].paintHead(); }
    renderAll(); schedule(60);
  }
  function renderParams() {
    const c = cur(), spec = effectSpec(c.id);
    params.replaceChildren();
    ws.head.textContent = `滤镜库（${spec.name}）`;
    for (const p of spec.params) {
      const on = (v, final) => { c.params[p.k] = v; mem.params[c.id] = { ...c.params }; schedule(final ? 60 : 160); };
      if (p.type === 'int') slider(params, p.label, c.params[p.k], p.min, p.max, 1, (v, final) => on(v, final), { labelW: 70 });
      else if (p.type === 'bool') check(params, p.label, c.params[p.k], v => on(v, true));
      else if (p.type === 'color') color(params, p.label, rgbToHex(c.params[p.k]), (v, final) => on(hexToRgb(v), final));
      else if (p.type === 'enum') {
        const opts = p.options.slice();
        if (p.k === 'TxtT' && c.id !== 'glass') opts.push(['custom', c.texture ? `载入的纹理：${c.texture.name || '图案'}` : '载入纹理…']);
        const s = select(params, p.label, c.params[p.k], opts, v => {
          if (v === 'custom') { pickTexture(c).then(ok => { if (!ok) s.set(c.params[p.k]); else { c.params[p.k] = 'custom'; renderParams(); schedule(60); } }); return; }
          on(v, true);
        }, { labelW: 70 });
      }
    }
    const r = row(params, 'justify-content:flex-end;margin-top:4px');
    button(r, '默认值', () => { c.params = effectDefaults(c.id); mem.params[c.id] = { ...c.params }; renderParams(); schedule(60); }, { title: '把这个效果的参数恢复到 PS 默认值' });
  }
  
  async function pickTexture(c) {
    let pats = [];
    try { pats = (await (o.getPatterns ? o.getPatterns() : [])) || []; } catch {}
    return new Promise(resolve => {
      const d = mk('dialog', { className: 'fp-dlg' }, 'min-width:360px;max-width:520px');
      d.append(mk('div', { textContent: '载入纹理' }, 'font-weight:600;margin-bottom:8px'));
      const grid = mk('div', {}, 'display:grid;grid-template-columns:repeat(6,56px);gap:6px;max-height:300px;overflow:auto;margin-bottom:8px');
      if (!pats.length) grid.append(mk('div', { textContent: '没有可用的图案（可在「编辑 › 定义图案」或预设管理器里添加）' }, 'grid-column:1/-1;opacity:.7;font-size:12px'));
      const done = t => { if (t) { c.texture = t; mem.textures[c.id] = t; } d.close(); d.remove(); resolve(!!t); };
      for (const p of pats) {
        if (!p || !p.rgba || !(p.width > 0)) continue;
        const cv = toCanvas(p.rgba instanceof Uint8ClampedArray ? p.rgba : new Uint8ClampedArray(p.rgba), p.width, p.height);
        cv.style.cssText = 'width:56px;height:56px;object-fit:cover;cursor:pointer;border:1px solid rgba(128,128,128,.4)'; cv.title = p.name || '图案';
        cv.onclick = () => done({ rgba: p.rgba instanceof Uint8ClampedArray ? p.rgba : new Uint8ClampedArray(p.rgba), w: p.width, h: p.height, name: p.name || '图案' });
        grid.append(cv);
      }
      d.append(grid);
      const r = row(d, 'justify-content:flex-end');
      const fileIn = mk('input', { type: 'file', accept: '.psd,.psb,image/png,image/jpeg,image/webp' }, 'display:none');
      fileIn.onchange = async () => {
        const f = fileIn.files && fileIn.files[0]; if (!f) return;
        try {
          let img = null;
          if (/\.ps[db]$/i.test(f.name) && o.decodeFile) img = await o.decodeFile(f);
          else { const bm = await createImageBitmap(f); const cv = mk('canvas', { width: bm.width, height: bm.height }); cv.getContext('2d').drawImage(bm, 0, 0); img = { rgba: new Uint8ClampedArray(cv.getContext('2d').getImageData(0, 0, bm.width, bm.height).data.buffer), w: bm.width, h: bm.height }; }
          if (img) done({ ...img, name: f.name.replace(/\.[^.]+$/, '') });
        } catch (e) { r.prepend(mk('span', { textContent: '读不了这个文件：' + (e && e.message || e) }, 'color:#ffb0a0;font-size:12px;flex:1')); }
      };
      d.append(fileIn);
      button(r, '从文件载入…', () => fileIn.click());
      button(r, '取消', () => done(null));
      d.addEventListener('cancel', ev => { ev.preventDefault(); done(null); });
      ws.dlg.append(d); d.showModal();
    });
  }
  let dragFrom = -1;
  function renderStack() {
    stackBox.replaceChildren();
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i], spec = effectSpec(L.id);
      const r = mk('div', { draggable: true }, `display:flex;align-items:center;gap:6px;padding:3px 6px;cursor:default;${i === sel ? 'background:rgba(74,156,255,.35)' : ''}`);
      const eye = mk('button', { type: 'button', title: L.visible ? '隐藏这一条效果' : '显示这一条效果' }, btnCss + ';width:22px;height:20px;background:none;border:none');
      eye.append(uiIcon(L.visible ? 'eye' : 'eye-off', 14));
      eye.onclick = ev => { ev.stopPropagation(); L.visible = !L.visible; renderStack(); schedule(60); };
      r.append(eye, mk('span', { textContent: spec.name }, 'flex:1'));
      r.onclick = () => { sel = i; renderAll(); };
      r.ondragstart = ev => { dragFrom = i; ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', String(i)); } catch {} };
      r.ondragover = ev => { ev.preventDefault(); r.style.boxShadow = 'inset 0 2px 0 #4a9cff'; };
      r.ondragleave = () => { r.style.boxShadow = ''; };
      r.ondrop = ev => {
        ev.preventDefault(); r.style.boxShadow = '';
        if (dragFrom < 0 || dragFrom === i) return;
        const selObj = layers[sel], [m] = layers.splice(dragFrom, 1);
        layers.splice(i, 0, m); sel = layers.indexOf(selObj); dragFrom = -1;
        renderAll(); schedule(60);
      };
      stackBox.append(r);
    }
    delB.disabled = layers.length <= 1;
  }
  function renderAll() { effSel.value = cur().id; renderParams(); renderStack(); markThumb(); }
  function resetAll() {
    layers = [{ id: cur().id, params: effectDefaults(cur().id), visible: true }]; sel = 0;
    renderAll(); schedule(60);
  }

  
  let altDown = false, committing = null;
  function onKey(ev) {
    if (ev.key === 'Alt') { altDown = ev.type === 'keydown'; cancelB.textContent = altDown ? '复位' : '取消'; return false; }
    if (ev.type === 'keydown' && ev.key === 'Escape' && committing) { committing.cancel(); return true; }
    return false;
  }
  ws.onEnter = () => commit();
  ws.onCancel = () => { if (committing) committing.cancel(); else ws.finish(null); };

  async function commit() {
    if (committing) return;
    runner.cancel(); thumbRunner.cancel(); clearTimeout(timer);
    mem.layers = layers.map(l => ({ id: l.id, params: { ...l.params }, visible: l.visible }));
    for (const l of layers) mem.params[l.id] = { ...l.params };
    saveMem();
    const final = makeRunner(); committing = final;
    okB.disabled = true; ws.setStatus('正在应用滤镜库… 0%（Esc 中断）');
    busy = true; prog = 0; ws.draw();
    try {
      const out = await final.run({ type: 'stack', rgba: SRC, w: W, h: H, layers: liveLayers(), env: packEnv({ fg, bg }) },
        { onProgress: f => { prog = f; ws.setStatus(`正在应用滤镜库… ${Math.round(f * 100)}%（Esc 中断）`); ws.draw(); } });
      final.dispose(); runner.dispose(); thumbRunner.dispose();
      ws.finish({ rgba: out, layers: liveLayers() });
    } catch (e) {
      committing = null; okB.disabled = false; busy = false;
      ws.setStatus(e && e.cancelled ? '已中断：可以改参数后再按确定' : '应用失败：' + (e && e.message || e)); ws.draw();
    }
  }

  ws.open();
  requestAnimationFrame(() => { ws.fit(); renderAll(); schedule(0); });
  const out = await ws.done;
  runner.dispose(); thumbRunner.dispose(); clearTimeout(timer);
  return out;
}

export default { openFilterGallery, runGallery, galleryShowAll, setGalleryShowAll, lastGalleryLayers };
export { GALLERY_GROUPS, GALLERY_EFFECTS, TEXTURE_OPTS };
