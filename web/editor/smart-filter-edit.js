















import { parsePsdFull } from '../../core/psd-parse.js';
import { readLayerSoLd } from '../../core/psd-edit-sfx.js';
import { SMART_FILTERS, BLEND_MODES, stepOfEntry, fltrWithParams, buildSmartFilterEntry, blendOptionsOf, entryLabel, isPsdEditorOnlyKind } from '../../core/smart-filter-spec.js';

let SFR = null;
const loadSfr = async () => SFR || (SFR = await import('../../core/smart-filter-render.js'));
import { readFilterInput, readFilterMask, maskSampler } from '../../core/smart-filter-mask.js';
import { galleryDescriptor } from '../../core/filter-gallery-spec.js';


export const BLEND_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M29.7778 5.33269H14.1326C13.7207 3.30426 11.9279 1.77734 9.77783 1.77734C7.62777 1.77734 5.8349 3.30426 5.42302 5.33269H2.22228C1.97684 5.33269 1.77783 5.53169 1.77783 5.77713V6.66602C1.77783 6.91146 1.97684 7.11046 2.22228 7.11046H5.42302C5.8347 9.1391 7.62766 10.6662 9.77783 10.6662C11.928 10.6662 13.721 9.1391 14.1326 7.11046H29.7778C30.0233 7.11046 30.2223 6.91146 30.2223 6.66602V5.77713C30.2223 5.53169 30.0233 5.33269 29.7778 5.33269ZM9.77783 8.88846C8.30507 8.88846 7.11117 7.69445 7.11117 6.22179C7.11117 4.74913 8.30507 3.55512 9.77783 3.55512C11.2506 3.55512 12.4445 4.74913 12.4445 6.22179C12.4445 7.69445 11.2506 8.88846 9.77783 8.88846Z" fill="currentColor" /><path fill-rule="evenodd" clip-rule="evenodd" d="M29.7778 23.111H17.6882C17.2763 21.0826 15.4834 19.5557 13.3334 19.5557C11.1833 19.5557 9.39045 21.0826 8.97858 23.111H2.22228C1.97684 23.111 1.77783 23.31 1.77783 23.5555V24.4443C1.77783 24.6898 1.97684 24.8888 2.22228 24.8888H8.97858C9.39026 26.9174 11.1832 28.4446 13.3334 28.4446C15.4836 28.4446 17.2765 26.9174 17.6882 24.8888H29.7778C30.0233 24.8888 30.2223 24.6898 30.2223 24.4443V23.5555C30.2223 23.31 30.0233 23.111 29.7778 23.111ZM13.3334 26.6668C11.8606 26.6668 10.6667 25.4728 10.6667 24.0001C10.6667 22.5275 11.8606 21.3334 13.3334 21.3334C14.8062 21.3334 16.0001 22.5275 16.0001 24.0001C16.0001 25.4728 14.8062 26.6668 13.3334 26.6668Z" fill="currentColor" /><path fill-rule="evenodd" clip-rule="evenodd" d="M1.77783 14.6668V15.5557C1.77783 15.8011 1.97684 16.0001 2.22228 16.0001H17.8675C18.2791 18.0288 20.0721 19.5559 22.2223 19.5559C24.3724 19.5559 26.1654 18.0288 26.5771 16.0001H29.7778C30.0233 16.0001 30.2223 15.8011 30.2223 15.5557V14.6668C30.2223 14.4213 30.0233 14.2223 29.7778 14.2223H26.5771C26.1652 12.1939 24.3723 10.667 22.2223 10.667C20.0722 10.667 18.2793 12.1939 17.8675 14.2223H2.22228C1.97684 14.2223 1.77783 14.4213 1.77783 14.6668ZM19.5556 15.1114C19.5556 13.6388 20.7495 12.4448 22.2223 12.4448C23.695 12.4448 24.8889 13.6388 24.8889 15.1114C24.8889 16.5841 23.695 17.7781 22.2223 17.7781C20.7495 17.7781 19.5556 16.5841 19.5556 15.1114Z" fill="currentColor" /></svg>';

const mk = (tag, props = {}, css = '') => { const e = Object.assign(document.createElement(tag), props); if (css) e.style.cssText = css; return e; };

export function installSmartFilterEdit(ctx) {
  const { st } = ctx;
  const err = t => ctx.err(t), note = t => ctx.note(t);
  let FLT = null;                                  
  const filtersMod = async () => FLT || (FLT = await import('../../core/filters.js'));

  const soIndexOf = idx => { const s = st(); return s.sos ? s.sos.findIndex(so => ctx.so.matchLayer(so) === idx) : -1; };

  
  
  async function prepare(base, b, k) {
    await loadSfr();
    
    try { await import('./filter-gallery.js'); } catch {}
    const psd = parsePsdFull(base.slice ? base.slice(0) : base), layer = psd.layers[b];
    const s = readLayerSoLd(base, layer);
    const fx = s && s.desc.filterFX, list = (fx && Array.isArray(fx.filterFXList)) ? fx.filterFXList : [];
    const so = st().sos[k];
    
    let px = null;
    if (ctx.engineOK()) {
      try { const img = await ctx.sourceImage(k); if (img) px = ctx.so.soRenderImage(k, img); } catch { px = null; }
    }
    let input = null;
    if (px && px.rgba && px.rgba.length) {
      const r = px.bounds;
      input = { rgba: px.rgba, width: r.right - r.left, height: r.bottom - r.top, rect: { ...r } };
    } else if (so && so.placedId) {
      
      const f = readFilterInput(base, so.placedId);
      if (f) input = { rgba: f.rgba, width: f.width || (f.rect.right - f.rect.left), height: f.height || (f.rect.bottom - f.rect.top), rect: { ...f.rect } };
    }
    const mask = so && so.placedId ? (() => { try { return readFilterMask(base, so.placedId); } catch { return null; } })() : null;
    return { list, fx, input, mask, maskOn: !fx || fx.filterMaskEnable !== false, masterOn: !fx || fx.enab !== false, docW: psd.header.width, docH: psd.header.height };
  }
  
  async function padded(P, steps) {
    const F = (await filtersMod()).FILTERS;
    let pad = 0;
    for (const s of steps) {
      const f = s && F[s.kind]; if (!f) continue;
      for (const p of f.params) if (p.spatial && Number.isFinite(+s.params[p.key])) pad += Math.ceil(+s.params[p.key] * 3);
    }
    pad = Math.min(pad, 512);
    const r0 = P.input.rect;
    const r = { left: Math.max(0, r0.left - pad), top: Math.max(0, r0.top - pad), right: Math.min(P.docW, r0.right + pad), bottom: Math.min(P.docH, r0.bottom + pad) };
    if (r.left === r0.left && r.top === r0.top && r.right === r0.right && r.bottom === r0.bottom) return P.input;
    const w = r.right - r.left, h = r.bottom - r.top, out = new Uint8ClampedArray(w * h * 4);
    const sw = P.input.width;
    for (let y = r0.top; y < r0.bottom; y++) {
      if (y < r.top || y >= r.bottom) continue;
      const x0 = Math.max(r0.left, r.left), x1 = Math.min(r0.right, r.right);
      if (x1 <= x0) continue;
      out.set(P.input.rgba.subarray(((y - r0.top) * sw + (x0 - r0.left)) * 4, ((y - r0.top) * sw + (x1 - r0.left)) * 4), ((y - r.top) * w + (x0 - r.left)) * 4);
    }
    return { rgba: out, width: w, height: h, rect: r };
  }
  
  function runRange(P, steps, cur, inp, from, to) {
    if (!P.masterOn) return cur;
    const run = [];
    for (let j = from; j < to; j++) {
      const e = P.list[j]; if (!e || e.enab === false) continue;
      const s = steps[j];
      if (!s) return null;
      if (s.deform) continue;                      
      run.push(s);
    }
    return run.length ? SFR.runFilterStack(cur, inp.width, inp.height, run, inp.rect) : cur;
  }
  
  function finishOp(P, inp, final, index) {
    const out = P.mask && P.maskOn && P.masterOn ? SFR.blendByFilterMask(inp.rgba, final, inp.rect, maskSampler(P.mask, P.fx ? P.fx.filterMaskExtendWithWhite !== false : true)) : final;
    const w = inp.width, h = inp.height;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return { op: null, out };
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, data = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++) data.set(out.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4);
    const r = inp.rect;
    return { out, op: { op: 'replaceLayerPixels', index, rgba: { data, width: cw, height: ch }, bounds: { left: r.left + x0, top: r.top + y0, right: r.left + x0 + cw, bottom: r.top + y0 + ch } } };
  }
  
  function previewer(idx) {
    const d0 = st().doc, dl = d0 && d0.layers[idx];
    const orig = dl && dl.rgba ? { rgba: dl.rgba, rect: { left: dl.bounds.left, top: dl.bounds.top, right: dl.bounds.right, bottom: dl.bounds.bottom } } : null;
    return {
      show(P, inp, px) { const out = P.mask && P.maskOn && P.masterOn ? SFR.blendByFilterMask(inp.rgba, px, inp.rect, maskSampler(P.mask, true)) : px; ctx.so.setLayerRaster(idx, out, inp.rect); },
      restore() { if (orig) ctx.so.setLayerRaster(idx, orig.rgba, orig.rect); else ctx.ui.refresh(); },
    };
  }

  
  async function paramDialog({ title, kind, params, onChange, warn }) {
    const F = (await filtersMod()).FILTERS[kind];
    const model = { ...params };
    return new Promise(resolve => {
      const dlg = mk('dialog', { className: 'fp-dlg sfx-dlg' }, 'width:min(380px,92vw)');
      dlg.dataset.attr = 'sfx-param-dlg';
      const form = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
      form.append(mk('h3', { className: 'fp-dlg-title', textContent: title }));
      let prev = true, t = 0;
      const fire = () => { clearTimeout(t); t = setTimeout(() => { if (prev) onChange({ ...model }); }, 60); };
      for (const pm of F.params) {
        const row = mk('div', { className: 'arow' }, 'display:flex;align-items:center;gap:8px');
        row.append(mk('label', { className: 'k', textContent: pm.label }, 'width:64px;flex:none'));
        if (pm.type === 'bool') {
          const cb = mk('input', { type: 'checkbox', checked: !!model[pm.key] }); cb.dataset.key = pm.key;
          cb.onchange = () => { model[pm.key] = cb.checked; fire(); }; row.append(cb);
        } else if (pm.type === 'enum') {
          const sel = mk('select'); sel.dataset.key = pm.key;
          for (const [v, lab] of pm.options) sel.append(mk('option', { value: v, textContent: lab }));
          sel.value = model[pm.key] ?? pm.def; sel.onchange = () => { model[pm.key] = sel.value; fire(); }; row.append(sel);
        } else {
          const v0 = model[pm.key] ?? pm.def;
          const sl = mk('input', { type: 'range', min: pm.min, max: pm.max, step: pm.step, value: v0 }, 'flex:1;min-width:0');
          const nb = mk('input', { type: 'number', min: pm.min, max: pm.max, step: pm.step, value: v0 }, 'width:64px');
          nb.dataset.key = pm.key;
          const set = v => { const n = Math.max(pm.min, Math.min(pm.max, +v)); if (!Number.isFinite(n)) return; model[pm.key] = n; if (document.activeElement !== sl) sl.value = n; if (document.activeElement !== nb) nb.value = n; fire(); };
          sl.oninput = () => set(sl.value); nb.onchange = () => set(nb.value); nb.oninput = () => set(nb.value);
          row.append(sl, nb);
          if (pm.unit) row.append(mk('span', { textContent: pm.unit }, 'flex:none;opacity:.8'));
        }
        form.append(row);
      }
      if (!F.params.length) form.append(mk('div', { className: 'anote plain', textContent: '这个滤镜没有参数。' }));
      if (warn) form.append(mk('div', { className: 'anote plain', textContent: warn }, 'font-size:11px;opacity:.85'));
      const foot = mk('div', {}, 'display:flex;justify-content:space-between;align-items:center;margin-top:6px');
      const pv = mk('label', {}, 'display:flex;gap:6px;align-items:center');
      const pcb = mk('input', { type: 'checkbox', checked: true }); pv.append(pcb, document.createTextNode('预览'));
      pcb.onchange = () => { prev = pcb.checked; onChange(prev ? { ...model } : null); };
      const btns = mk('span', {}, 'display:flex;gap:8px');
      const ok = mk('button', { type: 'submit', textContent: '确定', className: 'primary' }); ok.dataset.attr = 'sfx-ok';
      const cancel = mk('button', { type: 'button', textContent: '取消' }); cancel.dataset.attr = 'sfx-cancel';
      btns.append(ok, cancel); foot.append(pv, btns); form.append(foot);
      dlg.append(form); document.body.append(dlg);
      let done = false;
      const end = v => { if (done) return; done = true; clearTimeout(t); try { dlg.close(); } catch {} dlg.remove(); resolve(v); };
      form.onsubmit = ev => { ev.preventDefault(); end({ ...model }); };
      cancel.onclick = () => end(null);
      dlg.addEventListener('cancel', ev => { ev.preventDefault(); end(null); });
      try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
      onChange({ ...model });
    });
  }

  
  function blendDialog({ title, mode, opacity, onChange }) {
    return new Promise(resolve => {
      const m = { mode, opacity };
      const dlg = mk('dialog', { className: 'fp-dlg sfx-dlg' }, 'width:min(360px,92vw)');
      dlg.dataset.attr = 'sfx-blend-dlg';
      const form = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
      form.append(mk('h3', { className: 'fp-dlg-title', textContent: title }));
      let t = 0, prev = true;
      const fire = () => { clearTimeout(t); t = setTimeout(() => { if (prev) onChange({ ...m }); }, 40); };
      const r1 = mk('div', {}, 'display:flex;align-items:center;gap:8px');
      r1.append(mk('label', { textContent: '模式' }, 'width:64px'));
      const sel = mk('select', {}, 'flex:1'); sel.dataset.attr = 'sfx-blend-mode';
      const SEP = new Set(['dark', 'lite', 'over', 'diff', 'hue ']);
      for (const b of BLEND_MODES) { if (SEP.has(b.key)) sel.append(mk('option', { disabled: true, textContent: '──────' })); sel.append(mk('option', { value: b.key, textContent: b.label })); }
      sel.value = m.mode; sel.onchange = () => { m.mode = sel.value; fire(); };
      r1.append(sel);
      const r2 = mk('div', {}, 'display:flex;align-items:center;gap:8px');
      r2.append(mk('label', { textContent: '不透明度' }, 'width:64px'));
      const sl = mk('input', { type: 'range', min: 0, max: 100, step: 1, value: m.opacity }, 'flex:1;min-width:0');
      const nb = mk('input', { type: 'number', min: 0, max: 100, step: 1, value: m.opacity }, 'width:56px'); nb.dataset.attr = 'sfx-blend-opacity';
      const set = v => { const n = Math.max(0, Math.min(100, Math.round(+v))); if (!Number.isFinite(n)) return; m.opacity = n; if (document.activeElement !== sl) sl.value = n; if (document.activeElement !== nb) nb.value = n; fire(); };
      sl.oninput = () => set(sl.value); nb.oninput = () => set(nb.value);
      r2.append(sl, nb, mk('span', { textContent: '%' }));
      const foot = mk('div', {}, 'display:flex;justify-content:space-between;align-items:center;margin-top:6px');
      const pv = mk('label', {}, 'display:flex;gap:6px;align-items:center');
      const pcb = mk('input', { type: 'checkbox', checked: true }); pv.append(pcb, document.createTextNode('预览'));
      pcb.onchange = () => { prev = pcb.checked; onChange(prev ? { ...m } : null); };
      const ok = mk('button', { type: 'submit', textContent: '确定', className: 'primary' }); ok.dataset.attr = 'sfx-ok';
      const cancel = mk('button', { type: 'button', textContent: '取消' }); cancel.dataset.attr = 'sfx-cancel';
      const btns = mk('span', {}, 'display:flex;gap:8px'); btns.append(ok, cancel); foot.append(pv, btns);
      form.append(r1, r2, foot); dlg.append(form); document.body.append(dlg);
      let done = false;
      const end = v => { if (done) return; done = true; clearTimeout(t); try { dlg.close(); } catch {} dlg.remove(); resolve(v); };
      form.onsubmit = ev => { ev.preventDefault(); end({ ...m }); };
      cancel.onclick = () => end(null);
      dlg.addEventListener('cancel', ev => { ev.preventDefault(); end(null); });
      try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    });
  }

  
  const stale = (idx, g) => { if (st().doc && soIndexOf(idx) === g.k) return false; err('文档刚刚被另一个操作改动 / 重新载入了，请再试一次'); return true; };
  
  async function begin(idx, label) {
    const k = soIndexOf(idx);
    if (k < 0) { err(label + '：选中的不是智能对象'); return null; }
    let bb;
    try { bb = await ctx.baseBuffer(); } catch (e) { err(label + '：当前改动落盘失败：' + (e && e.message || e)); return null; }
    if (!bb) return null;
    const b = bb.map(idx);
    if (b < 0 || soIndexOf(idx) !== k) { err(label + '：文档刚刚被另一个操作改动 / 重新载入了，请再试一次'); return null; }
    const P = await prepare(bb.base, b, k);
    if (!P.input) { err(label + '：拿不到智能对象「滤镜之前」的像素（内嵌源图解不开，文件里也没有 PS 写的滤镜输入缓存）'); return null; }
    const steps = P.list.map(stepOfEntry);
    return { k, b, P, steps };
  }
  const why = (P, steps, from, to) => {
    for (let j = from; j < to; j++) { const e = P.list[j]; if (e && e.enab !== false && !steps[j]) return `第 ${j + 1} 条「${entryLabel(e)}」浏览器算不了`; }
    return '';
  };

  



  async function reopen(idx, at) {
    const g = await begin(idx, '重新编辑智能滤镜'); if (!g) return false;
    const { P, steps } = g;
    const e = P.list[at], s = steps[at];
    if (!e) { err('没有这条智能滤镜'); return false; }
    if (!s || s.deform) { err(`「${entryLabel(e)}」这条滤镜浏览器还不能重开（${s && s.deform ? '变形滤镜请双击进变形工具' : '没有对应的像素内核'}）`); return false; }
    const w0 = why(P, steps, 0, at);
    if (w0) { err(`「${entryLabel(e)}」下面的滤镜里有${w0}，拿不到这条的输入像素`); return false; }
    const inp = await padded(P, steps.filter(Boolean));
    if (stale(idx, g)) return false;
    const pre = runRange(P, steps, inp.rgba, inp, 0, at);
    const above = P.list.length - 1 - at;
    const warn = above > 0 ? `编辑这条时，它上面的 ${above} 条智能滤镜不参与预览（PS 同）；按「确定」后会按顺序重新应用。` : '';
    const pv = previewer(idx);
    let next, newStep, afterThis;
    if (s.kind === 'liquify') {
      if (above) note(warn);
      let LQ, LM;
      try { [LQ, LM] = await Promise.all([import('./liquify.js'), import('../../core/liquify-mesh.js')]); } catch (ex) { err('液化模块加载失败：' + (ex && ex.message || ex)); return false; }
      let F0 = null;
      try { F0 = s.params.mesh ? LM.alignLiquifyMesh(LM.decodeLiquifyMesh(s.params.mesh), inp.width, inp.height, inp.rect) : null; } catch (ex) { err(String(ex && ex.message || ex)); return false; }
      const r = await LQ.openLiquify({ rgba: pre, w: inp.width, h: inp.height, title: ctx.layerName(idx) + '（智能滤镜）', field: F0, withField: true });
      if (!r) return false;
      const mesh = LM.encodeLiquifyMesh({ ...r.field, left: inp.rect.left, top: inp.rect.top });
      newStep = { ...s, params: { mesh } };
      next = { Fltr: fltrWithParams(e.Fltr, 'liquify', { mesh }) };
      afterThis = e.enab === false || !P.masterOn ? pre : SFR.blendStep(pre, r.rgba, s.mode, s.opacity);
    } else if (s.kind === 'filterGallery') {
      if (above) note(warn);
      let UI; try { UI = await import('./filter-gallery.js'); } catch (ex) { err('滤镜库模块加载失败：' + (ex && ex.message || ex)); return false; }
      const r = await UI.openFilterGallery({ rgba: pre, w: inp.width, h: inp.height, fg: s.params.fg, bg: s.params.bg, layers: s.params.layers,
        title: ctx.layerName(idx), smart: true, getPatterns: ctx.gallery.getPatterns, decodeFile: ctx.gallery.decodeFile });
      if (!r) return false;
      newStep = { ...s, params: { ...s.params, layers: r.layers } };
      next = { Fltr: galleryDescriptor(r.layers.map(l => ({ id: l.id, params: l.params, visible: l.visible !== false }))) };
      afterThis = e.enab === false || !P.masterOn ? pre : SFR.blendStep(pre, r.rgba, s.mode, s.opacity);
    } else {
      const F = (await filtersMod());
      const got = await paramDialog({ title: `${entryLabel(e)}（智能滤镜）`, kind: s.kind, params: { ...F.filterDefaults(s.kind), ...s.params }, warn,
        onChange: m => {
          if (!m) { pv.show(P, inp, pre); return; }
          try { const f = SFR.runFilterStack(pre, inp.width, inp.height, [{ ...s, params: m }], inp.rect); if (f) pv.show(P, inp, f); } catch {}
        } });
      pv.restore();
      if (!got) return false;
      newStep = { ...s, params: got };
      next = { Fltr: fltrWithParams(e.Fltr, s.kind, got) };
      afterThis = e.enab === false || !P.masterOn ? pre : SFR.runFilterStack(pre, inp.width, inp.height, [newStep], inp.rect);
    }
    const nsteps = steps.slice(); nsteps[at] = newStep;
    return commit(idx, at, P, inp, afterThis, nsteps, next, `编辑智能滤镜「${entryLabel(e)}」`);
  }

  
  async function blendOptions(idx, at) {
    const g = await begin(idx, '智能滤镜混合选项'); if (!g) return false;
    const { P, steps } = g;
    const e = P.list[at], s = steps[at];
    if (!e) { err('没有这条智能滤镜'); return false; }
    if (!s || s.deform) { err(`「${entryLabel(e)}」的混合选项：这条滤镜浏览器算不了，改了也没法重算画面`); return false; }
    const w0 = why(P, steps, 0, at + 1);
    if (w0) { err('混合选项：' + w0); return false; }
    const inp = await padded(P, steps.filter(Boolean));
    if (stale(idx, g)) return false;
    const pre = runRange(P, steps, inp.rgba, inp, 0, at);
    const raw = SFR.runFilterStack(pre, inp.width, inp.height, [{ ...s, opacity: 100, mode: 'norm' }], inp.rect);   
    const bo = blendOptionsOf(e);
    const pv = previewer(idx);
    const got = await blendDialog({ title: `混合选项（${entryLabel(e)}）`, mode: bo.mode, opacity: bo.opacity,
      onChange: m => pv.show(P, inp, m ? SFR.blendStep(pre, raw, m.mode, m.opacity) : pre) });
    pv.restore();
    if (!got || (got.mode === bo.mode && got.opacity === bo.opacity)) return false;
    const nsteps = steps.slice(); nsteps[at] = { ...s, mode: got.mode, opacity: got.opacity };
    const afterThis = e.enab === false || !P.masterOn ? pre : SFR.blendStep(pre, raw, got.mode, got.opacity);
    return commit(idx, at, P, inp, afterThis, nsteps, { blendOptions: { mode: got.mode, opacity: got.opacity } }, `智能滤镜混合选项（${entryLabel(e)}）`);
  }

  async function commit(idx, at, P, inp, afterThis, nsteps, patch, label) {
    let final = afterThis ? runRange(P, nsteps, afterThis, inp, at + 1, P.list.length) : null;
    const rest = why(P, nsteps, at + 1, P.list.length);
    const px = final ? finishOp(P, inp, final, -1) : null;
    const ok = await ctx.structural(label, async (base, { map, applyEdits }) => {
      const b = map(idx);
      const ops = [{ op: 'setSmartFilterEntry', index: b, at, ...patch }];
      if (px && px.op) ops.push({ ...px.op, index: b });
      return { buf: applyEdits(base, ops).buffer, sel: b };
    });
    if (ok && rest) note(`${label}：参数已写回；但它上面有${rest}，画布保留旧的缓存像素（PS 打开时会重新求值）`);
    else if (ok) ctx.status(label + '：已更新');
    return ok;
  }

  
  const canAdd = (idx, kind) => soIndexOf(idx) >= 0 && !!SMART_FILTERS[kind];
  
  async function addLiquify(idx) {
    const g = await begin(idx, '液化（智能滤镜）'); if (!g) return false;
    const { P, steps } = g;
    const w0 = why(P, steps, 0, P.list.length);
    if (w0) { err(`这个智能对象的滤镜里有${w0}，加液化之后没法重算画面`); return false; }
    const inp = await padded(P, steps.filter(Boolean));
    if (stale(idx, g)) return false;
    const cur = runRange(P, steps, inp.rgba, inp, 0, P.list.length);
    if (!cur) { err('液化（智能滤镜）：现有的滤镜浏览器算不了'); return false; }
    let LQ, LM;
    try { [LQ, LM] = await Promise.all([import('./liquify.js'), import('../../core/liquify-mesh.js')]); } catch (ex) { err('液化模块加载失败：' + (ex && ex.message || ex)); return false; }
    const r = await LQ.openLiquify({ rgba: cur, w: inp.width, h: inp.height, title: ctx.layerName(idx) + '（智能滤镜）', withField: true });
    if (!r || r.identity) return false;
    if (stale(idx, g)) return false;
    const mesh = LM.encodeLiquifyMesh({ ...r.field, left: inp.rect.left, top: inp.rect.top });
    const entry = buildSmartFilterEntry('liquify', { mesh }, { fg: ctx.fg(), bg: ctx.bg() });
    const final = P.masterOn ? r.rgba : cur;
    const px = finishOp(P, inp, final, -1);
    const label = '液化（智能滤镜）';
    const ok = await ctx.structural(label, async (base, { map, applyEdits }) => {
      const b = map(idx);
      const ops = [{ op: 'addGallerySmartFilter', index: b, entry }];
      if (px.op) ops.push({ ...px.op, index: b });
      return { buf: applyEdits(base, ops).buffer, sel: b };
    });
    if (ok) ctx.status(label + '：已添加（双击图层面板里的滤镜行可再调）。PSD Editor 私有智能滤镜：PS 里只显示结果，不能在 PS 里再调');
    return ok;
  }

  async function addFilter(idx, kind, params) {
    if (kind === 'liquify') return addLiquify(idx);
    const g = await begin(idx, '智能滤镜'); if (!g) return false;
    const { P, steps } = g;
    const w0 = why(P, steps, 0, P.list.length);
    if (w0) { err(`这个智能对象的滤镜里有${w0}，加新滤镜后没法重算画面`); return false; }
    const F = await filtersMod();
    const spec = F.FILTERS[kind];
    const inp = await padded(P, [...steps.filter(Boolean), { kind, params: { ...F.filterDefaults(kind), ...(params || {}) } }]);
    if (stale(idx, g)) return false;
    const cur = runRange(P, steps, inp.rgba, inp, 0, P.list.length);
    let got = { ...F.filterDefaults(kind), ...(params || {}) };
    if (spec.params.length && !params) {
      const pv = previewer(idx);
      got = await paramDialog({ title: `${spec.label}（智能滤镜）`, kind, params: got,
        onChange: m => { if (!m) { pv.show(P, inp, cur); return; } try { const f = SFR.runFilterStack(cur, inp.width, inp.height, [{ kind, params: m, opacity: 100 }], inp.rect); if (f) pv.show(P, inp, f); } catch {} } });
      pv.restore();
      if (!got) return false;
    }
    const entry = buildSmartFilterEntry(kind, got, { fg: ctx.fg(), bg: ctx.bg() });
    const final = P.masterOn ? SFR.runFilterStack(cur, inp.width, inp.height, [{ kind, params: got, opacity: 100 }], inp.rect) : cur;
    const px = finishOp(P, inp, final, -1);
    const label = `${spec.label}（智能滤镜）`;
    const ok = await ctx.structural(label, async (base, { map, applyEdits }) => {
      const b = map(idx);
      const ops = [{ op: 'addGallerySmartFilter', index: b, entry }];
      if (px.op) ops.push({ ...px.op, index: b });
      return { buf: applyEdits(base, ops).buffer, sel: b };
    });
    if (ok) ctx.status(label + '：已添加（双击图层面板里的滤镜行可再调）' + (isPsdEditorOnlyKind(kind) ? '。PSD Editor 私有智能滤镜：PS 里只显示结果，不能在 PS 里再调' : ''));
    return ok;
  }

  



  async function rerenderOp(base, b, k, image) {
    const P = await prepare(base, b, k);
    if (image) { const px = ctx.so.soRenderImage(k, image); if (!px || !px.rgba || !px.rgba.length) return null; const r = px.bounds; P.input = { rgba: px.rgba, width: r.right - r.left, height: r.bottom - r.top, rect: { ...r } }; }
    if (!P.input) return null;
    const steps = P.list.map(stepOfEntry);
    if (why(P, steps, 0, P.list.length)) return null;
    const inp = await padded(P, steps.filter(Boolean));
    const fin = runRange(P, steps, inp.rgba, inp, 0, P.list.length);
    return fin ? finishOp(P, inp, fin, b).op : null;
  }

  
  function decorateFilterRow(r, idx, f) {
    if (f.deform || f.isNew || f.index < 0) return;
    r.ondblclick = ev => { ev.stopPropagation(); if (ev.target && ev.target.closest && ev.target.closest('.eye, .sfx-bo')) return; reopen(idx, f.index); };
    r.title = `${f.label}（classID ${f.raw.classID}）—— 双击重新打开滤镜对话框；双击右侧图标 = 混合选项`;
    const b = mk('span', { className: 'sfx-bo', title: '双击 = 编辑滤镜混合选项（模式 / 不透明度）' }, 'margin-left:auto;display:inline-flex;align-items:center;opacity:.8;cursor:default;padding:0 4px');
    b.dataset.attr = 'sf-blend-options';
    b.innerHTML = BLEND_ICON_SVG;
    const svg = b.firstChild; if (svg) { svg.setAttribute('width', 12); svg.setAttribute('height', 12); }
    b.ondblclick = ev => { ev.stopPropagation(); blendOptions(idx, f.index); };
    b.onclick = ev => ev.stopPropagation();
    r.append(b);
  }

  return { reopen, blendOptions, addFilter, addLiquify, canAdd, rerenderOp, decorateFilterRow, prepare };
}
export default { installSmartFilterEdit };
