














































import { CONTOUR_PRESETS, contourLutFromPoints, contourPointsOf, isLinearContour } from '../../core/contour.js';

import { PANES, PANE_BY_ID, UNIT_OF, ANTI_TIP, FX_PANE_LIST, FX_PANEL_ORDER } from './layer-style-panes.js';

export { FX_PANE_LIST, FX_PANEL_ORDER };




const bare = v => (v && typeof v === 'object' && !Array.isArray(v)
  && (v.__unit !== undefined || v.__enumType !== undefined) ? v.value : v);






export function createLayerStyleDialog(ctx){
  const { mk } = ctx;
  let dlg = null, listBox = null, paneBox = null, paneTitle = null, noteBox = null, previewChk = null;
  let idx = -1;                 
  let cur = 'blend';            
  

  let curSel = '0';
  let session = null;           

  
  function host(){
    if (dlg && dlg.isConnected) return dlg;
    dlg = ctx.$('#fxDlg');
    if (!dlg) return null;
    listBox = dlg.querySelector('#fxDlgList');
    paneBox = dlg.querySelector('#fxDlgBody');
    paneTitle = dlg.querySelector('#fxDlgPaneTitle');
    noteBox = dlg.querySelector('#fxDlgNote');
    previewChk = dlg.querySelector('#fxDlgPreview');
    dlg.querySelector('#fxDlgOk').onclick = () => close(true);
    dlg.querySelector('#fxDlgCancel').onclick = () => close(false);
    previewChk.onchange = togglePreview;
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); close(false); });
    enableDrag();
    return dlg;
  }

  
  


  let pos = null;                                  
  function enableDrag(){
    const bar = dlg.querySelector('#fxDlgTitle');
    if (!bar) return;
    bar.classList.add('fxdlg-drag');
    bar.onpointerdown = ev => {
      if (ev.button) return;
      const r = dlg.getBoundingClientRect ? dlg.getBoundingClientRect() : null;
      if (!r || !r.width) return;                  
      if (ev.preventDefault) ev.preventDefault();
      dlg.style.margin = '0';
      dlg.style.inset = 'auto';
      const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      const put = (x, y) => {
        pos = { left: Math.max(0, Math.min((window.innerWidth || r.width) - r.width, x)),
                top: Math.max(0, Math.min((window.innerHeight || r.height) - r.height, y)) };
        dlg.style.left = pos.left + 'px'; dlg.style.top = pos.top + 'px';
      };
      put(r.left, r.top);
      const move = e => put(e.clientX - dx, e.clientY - dy);
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };
  }
  
  function restorePos(){
    if (!pos) return;
    const w = window.innerWidth || 0, h = window.innerHeight || 0;
    if (w && h && (pos.left > w - 80 || pos.top > h - 60)) { pos = null; dlg.style.margin = ''; dlg.style.inset = ''; dlg.style.left = ''; dlg.style.top = ''; return; }
    dlg.style.margin = '0'; dlg.style.inset = 'auto';
    dlg.style.left = pos.left + 'px'; dlg.style.top = pos.top + 'px';
  }

  

  
  function params(){
    const p = ctx.layerParams(idx);
    return p && !p.error ? p : null;
  }
  function targetsOf(key){
    const p = params();
    if (!p || !p.effects) return [];
    return (p.effects.targets || []).filter(t => t.target === 'effect:' + key);
  }
  
  function blockError(){
    const p = params();
    const bad = p && p.effects && (p.effects.blocks || []).find(b => b.ok === false);
    return bad ? `这个图层的样式块用了我们还不能原样重建的写法（${bad.reason}），不敢改` : '';
  }

  const hexOfRGB = o => '#' + ['Rd  ', 'Grn ', 'Bl  '].map(k =>
    Math.max(0, Math.min(255, Math.round(Number(o && o[k]) || 0))).toString(16).padStart(2, '0')).join('');

  
  function existingInst(pane, t){
    const fields = new Map((t.fields || []).map(f => [f.path, f]));
    const at = t.at || 0, target = t.target;
    const baseOf = p => { const f = fields.get(p); return f ? f.value : undefined; };
    const inst = {
      kind: 'existing', pane, canon: pane.id, key: pane.key, at, sel: String(at), target,
      label: t.label || pane.label, count: t.count || 1, target_: t,
      field: p => fields.get(p) || null,
      has: p => fields.has(p),
      value(p){
        const f = fields.get(p);
        if (!f) return undefined;
        if (f.type === 'color') return inst.colorOf(p, false);
        return ctx.effParam(idx, target, at, p, f.value);
      },
      base(p){
        const f = fields.get(p);
        return f && f.type === 'color' ? inst.colorOf(p, true) : baseOf(p);
      },
      colorOf(p, original){
        const whole = original ? undefined : ctx.effParam(idx, target, at, p, undefined);
        if (typeof whole === 'string' && /^#[0-9a-f]{6}$/i.test(whole)) return whole.toLowerCase();
        const f = fields.get(p);
        const comps = (f && f.components) || [];
        if (!comps.length) return '#000000';
        const o = {};
        ['Rd  ', 'Grn ', 'Bl  '].forEach((k, i) => {
          const cf = fields.get(comps[i]);
          o[k] = !cf ? 0 : original ? cf.value : ctx.effParam(idx, target, at, comps[i], cf.value);
        });
        return hexOfRGB(o);
      },
      set: (p, v) => ctx.setParamField(idx, target, at, p, v, inst.base(p)),
      enabled: () => ctx.effFxEnabled(idx, pane.key, at, !!baseOf('enab')),
      setEnabled: on => ctx.setSingleOp(idx, { op: 'setLayerEffect', index: idx, effect: pane.key, at, enabled: on },
        on === !!baseOf('enab')),
      removed: () => !!ctx.findLayerOp(idx, `removeLayerEffect:${pane.key}:${at}`),
      remove: () => ctx.setSingleOp(idx, { op: 'removeLayerEffect', index: idx, effect: pane.key, at }, inst.removed()),
      consumed: new Set(),
    };
    return inst;
  }

  
  function newInst(pane, op){
    const seq = op.seq || 0;
    const inst = {
      kind: 'new', pane, canon: pane.id, key: pane.key, at: 0, sel: 'new' + seq, seq, target: null,
      label: pane.label, count: 1,
      field: () => null,
      has: p => ctx.addedFxTemplateValue(pane.id, p) !== undefined,
      value: p => ctx.addedFxValue(op, p),
      base: p => ctx.addedFxTemplateValue(pane.id, p),
      set: (p, v) => ctx.setAddedFxParam(idx, pane.id, p, v, inst.base(p), seq),
      enabled: () => ctx.addedFxValue(op, 'enab') !== false,
      setEnabled: on => inst.set('enab', on),
      removed: () => false,
      remove: () => ctx.setSingleOp(idx, { op: 'addLayerEffect', index: idx, effect: pane.id, seq }, true),
      consumed: new Set(),
      op,
    };
    return inst;
  }

  



  function templateInst(pane){
    let ok = false;
    try { ok = !!ctx.createEffectTemplate(pane.id); } catch { ok = false; }
    if (!ok) return null;                       
    return {
      kind: 'template', pane, canon: pane.id, key: pane.key, at: 0, sel: '0', target: null,
      label: pane.label, count: 1,
      field: () => null,
      has: p => ctx.addedFxTemplateValue(pane.id, p) !== undefined,
      value: p => ctx.addedFxTemplateValue(pane.id, p),
      base: p => ctx.addedFxTemplateValue(pane.id, p),
      set: () => false,
      enabled: () => false,
      setEnabled: () => false,
      removed: () => false,
      remove: () => false,
      consumed: new Set(),
    };
  }

  






  function instancesOf(pane){
    if (!pane.key) return [];
    const adds = ctx.queuedAdds(idx, pane.id).map(add => newInst(pane, add)).reverse();
    return [...adds, ...targetsOf(pane.key).map(t => existingInst(pane, t))];
  }
  function instanceAt(pane, sel){
    const all = instancesOf(pane);
    return all.find(i => i.sel === sel) || all[0] || null;
  }

  

  function ensureHistory(){
    if (!session || session.pushed) return;
    ctx.history.push('图层样式');
    session.pushed = true;
    ctx.history.lock(true);
  }
  
  function write(fn){
    const why = readOnlyReason();
    if (why) { note(why, true); ctx.shout(why); return false; }      
    ensureHistory();
    let ok = false, err = '';
    try { ok = fn(); } catch (e) { ok = false; err = (e && e.message) || String(e); }
    if (!ok) {
      const msg = err || ctx.lastError() || '这项改动没能记下（内核拒绝了它）';
      note(msg, true);
      ctx.shout(msg);                                                
    } else note('');
    return ok;
  }
  function note(text, warn){
    if (!noteBox) return;
    noteBox.textContent = text || '';
    noteBox.classList.toggle('warn', !!warn);
  }
  
  function readOnlyReason(){
    if (session && session.previewOff) return '预览已关闭：勾选「预览」后才能继续编辑（关掉预览时画布回到打开对话框前的样子）';
    const st = ctx.editStatus();
    if (!st.ready) return st.text;
    return blockError();
  }
  const readOnly = () => !!readOnlyReason();

  

  function renderList(){
    listBox.innerHTML = '';
    const why = readOnlyReason();
    const creatable = ctx.creatableFx();
    const patterns = ctx.patterns();
    for (const pane of PANES) {
      if (pane.special === 'blend') { listBox.append(item({ pane, label: pane.label, checkable: false })); continue; }
      if (pane.parent) continue;                       
      const list = instancesOf(pane);
      const spec = creatable[pane.id];
      if (!list.length) {
        let cantWhy = why;
        if (!cantWhy && !spec) cantWhy = ctx.editStatus().text || '编辑层还没到位，暂时不能新建效果';
        else if (!cantWhy && spec && spec.needsResource && !patterns.length)
          cantWhy = `新增「${pane.label}」需要文档里已有 ${spec.needsResource}；当前文件没有可选图案`;
        listBox.append(item({
          pane, label: pane.label, checked: false, disabled: !!cantWhy, disabledWhy: cantWhy,
          onCheck: () => addEffect(pane),
        }));
        addPlus(pane, spec, why);              
        if (pane.id === 'bevelEmboss') renderSubItems(null, why);
        continue;
      }
      let topEl = null;
      list.forEach((inst, k) => {
        const on = inst.enabled() && !inst.removed();
        const el = item({
          pane, sel: inst.sel, inst,
          label: inst.label + (list.length > 1 ? ` ${k + 1}` : '') + (inst.kind === 'new' ? '（新增）' : ''),
          checked: on, disabled: !!why, disabledWhy: why,
          onCheck: () => write(() => inst.setEnabled(!on)),
        });
        listBox.append(el);
        if (!topEl) topEl = el;
      });
      addPlus(pane, spec, why, topEl);        
      if (pane.id === 'bevelEmboss') renderSubItems(list[0], why);
    }
  }

  






  function addPlus(pane, spec, why, host){
    if (!spec || !spec.multi) return;
    const list = instancesOf(pane);
    const plus = mk('button', { type: 'button', className: 'fxplus', textContent: '+' });
    plus.dataset.attr = 'fxdlg-add'; plus.dataset.fx = pane.id;
    plus.disabled = !!why;
    plus.title = why || (list.length
      ? `再加一条「${pane.label}」（PS 里描边 / 内阴影 / 颜色叠加 / 渐变叠加 / 投影可以有多条）`
      : `给这一层加一条「${pane.label}」（用 PS 的默认参数）`);
    plus.onclick = ev => { ev.stopPropagation(); addEffect(pane); rerender(); };
    (host || listBox.lastElementChild).append(plus);
  }

  
  function renderSubItems(hostInst, why){
    for (const sub of ['bevelContour', 'bevelTexture']) {
      const p2 = PANE_BY_ID[sub];
      const on = hostInst ? !!hostInst.value(p2.toggle) : false;
      const missing = hostInst && !hostInst.has(p2.toggle);
      listBox.append(item({
        pane: p2, label: p2.label, sub: true, checked: on,
        disabled: !hostInst || !!why || !!missing,
        disabledWhy: !hostInst ? '先启用「斜面和浮雕」' : (why || (missing ? `这个文件的斜面和浮雕里没有 ${p2.toggle} 字段，勾不动` : '')),
        onCheck: () => write(() => hostInst.set(p2.toggle, !on)),
      }));
    }
  }

  function item(o){
    const on = cur === o.pane.id && (o.sel == null || o.sel === curSel);
    

    const dim = o.checkable !== false && !o.checked;
    const el = mk('div', { className: 'fxitem' + (o.sub ? ' sub' : '') + (on ? ' on' : '') + (dim ? ' off' : '') });
    el.dataset.fxItem = o.pane.id;
    if (o.sel != null) el.dataset.at = o.sel;
    if (o.checkable !== false) {
      const chk = mk('input', { type: 'checkbox', className: 'fxchk' });
      chk.checked = !!o.checked;
      chk.disabled = !!o.disabled;
      chk.dataset.attr = 'fxdlg-check'; chk.dataset.fx = o.pane.id;
      if (o.sel != null) chk.dataset.at = o.sel;
      chk.title = o.disabled ? (o.disabledWhy || '')
        : (o.checked ? '停用这条效果（不勾 = PS 里把这条效果的眼睛关掉，设置仍留在文件里）'
                     : (o.sub ? '启用它' : '启用这条效果（这一层还没有时会用 PS 的默认参数新建一条）'));
      chk.onclick = ev => { ev.stopPropagation(); if (o.onCheck) { o.onCheck(); rerender(); } };
      el.append(chk);
    } else el.append(mk('i', { className: 'fxchk-none' }));
    el.append(mk('span', { className: 'fxname', textContent: o.label }));
    if (o.inst) {
      const removed = o.inst.removed();
      const del = mk('button', { type: 'button', className: 'fxdel', textContent: removed ? '↺' : '×',
        title: o.inst.kind === 'new' ? '撤销这条新增'
          : removed ? '撤销这条删除'
          : '从图层样式里删掉这条效果（不勾复选框只是停用，效果仍留在文件里）' });
      del.dataset.attr = 'fxdlg-remove'; del.dataset.fx = o.pane.id; del.dataset.at = o.inst.sel;
      del.disabled = !!o.disabled;
      del.onclick = ev => { ev.stopPropagation(); write(() => o.inst.remove()); rerender(); };
      el.append(del);
    }
    el.onclick = () => { cur = o.pane.id; curSel = o.sel || '0'; rerender(); };
    return el;
  }

  
  function addEffect(pane){
    const values = {};
    if (pane.id === 'patternOverlay') {
      const p = ctx.patterns()[0];
      if (!p) { note('当前文件没有可用的图案资源（全局 Patt），不能新建图案叠加。', true); return; }
      values['Ptrn.Nm  '] = p.name; values['Ptrn.Idnt'] = p.id;
    }
    const seq = ctx.nextAddSeq(idx, pane.id);          
    const ok = write(() => ctx.setSingleOp(idx, { op: 'addLayerEffect', index: idx, effect: pane.id, seq,
      ...(Object.keys(values).length ? { values } : {}) }, false));
    if (ok) { cur = pane.id; curSel = 'new' + seq; }   
  }

  

  function renderPane(){
    paneBox.innerHTML = '';
    const pane = PANE_BY_ID[cur] || PANES[0];
    paneTitle.textContent = pane.label;
    if (pane.special === 'blend') return renderBlendPane();
    const why = readOnlyReason();
    const host = pane.parent ? PANE_BY_ID[pane.parent] : pane;
    let inst = pane.parent ? instanceAt(host, '0') : instanceAt(pane, curSel);
    if (!inst) inst = templateInst(host);       
    if (!inst) {
      hintLine(group(''), ctx.editStatus().text || '编辑层还没到位，稍后再试。', true);
      return;
    }
    if (inst.kind === 'template')
      note(`这一层还没有「${host.label}」：下面是 PS 的默认参数，勾上左栏的复选框就能建一条并开始调。`);
    else if (inst.removed()) hintLine(group(''), '这条效果已经排队删除（左栏点 ↺ 可以撤销），下面的改动不会写回。', true);
    else if (why) hintLine(group(''), why, true);
    else if (pane.parent && inst.has(pane.toggle) && !inst.value(pane.toggle))
      hintLine(group(''), `「${pane.label}」当前没有勾上：下面这些参数照样写回，但要勾上之后才参与合成。`);
    else if (!inst.enabled()) hintLine(group(''), '这条效果当前是停用的（左栏的勾去掉了）：参数照常写回，画布上先不显示。');

    for (const g of pane.groups) {
      let box = null;
      for (const row of g.rows) {
        if (row.when && !row.when(inst)) continue;
        if (!box) box = group(g.title);
        renderRow(box, row, inst);
      }
      

      if (box && !box.querySelector('.fxrow')) box.remove();
    }
    const any = !!paneBox.querySelector('.fxrow');
    

    if (pane.parent) {
      if (!any && inst.kind === 'template') return;
      if (!any) hintLine(group(''), `这个文件的「斜面和浮雕」里还没有${pane.label}相关的字段 —— `
        + 'PS 要勾上它并选好图案 / 曲线之后才会写进描述符。勾选左栏的开关会照常写回，其余参数等文件里有了再来调。');
      return;
    }
    renderRest(inst);
  }

  function group(title){
    const d = mk('div', { className: 'fxgroup' });
    if (title) d.append(mk('div', { className: 'fxgroup-title', textContent: title }));
    paneBox.append(d);
    return d;
  }
  function hintLine(box, text, warn){
    const d = mk('div', { className: 'fxhint' + (warn ? ' warn' : ''), textContent: text });
    box.append(d);
    return d;
  }
  function line(box, label){
    const r = mk('div', { className: 'fxrow' });
    r.append(mk('label', { textContent: label || '' }));
    box.append(r);
    return r;
  }

  

  function renderRow(box, row, inst){
    const ro = readOnly() || inst.removed() || inst.kind === 'template';
    switch (row.kind) {
      case 'blend': return rowBlend(box, row, inst, ro);
      case 'color': return rowColor(box, row, inst, ro);
      case 'num': return rowNum(box, row, inst, ro);
      case 'angle': return rowAngle(box, row, inst, ro);
      case 'bool': return rowBool(box, row, inst, ro);
      case 'enum': return rowEnum(box, row, inst, ro);
      case 'contour': return rowContour(box, row, inst, ro);
      case 'gradient': return rowGradient(box, inst, ro);
      case 'pattern': return rowPattern(box, row, inst, ro);
      default: return null;
    }
  }

  

  let liveRAF = 0, livePend = null;
  const raf = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  function liveCommit(inst, path, value, restore){
    livePend = { inst, path, value, restore };
    if (liveRAF) return;
    liveRAF = raf(() => {
      liveRAF = 0;
      const job = livePend; livePend = null;
      
      if (!job) return;
      const fast = ctx.fast || (fn => fn());     
      fast(() => commit(job.inst, job.path, job.value, job.restore));
    });
  }

  
  function commit(inst, path, value, restore){
    const ok = write(() => inst.set(path, value));
    if (!ok && restore) restore(inst.value(path));
    else ctx.afterEdit();
    return ok;
  }

  function rowBlend(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const r = line(box, row.label);
    r.append(selectFor(inst, row.path, ctx.ENUM_LABELS.BlnM, ro, '混合模式（这条效果自己的，不是图层的）'));
    if (row.colorPath && inst.has(row.colorPath)) r.append(...colorControls(inst, row.colorPath, ro));
    inst.consumed.add(row.path);
    if (row.colorPath) markColor(inst, row.colorPath);
  }

  function selectFor(inst, path, table, ro, title){
    const cur0 = bare(inst.value(path));
    const sel = mk('select', { title: title || '' });
    sel.dataset.attr = 'fxdlg-param'; sel.dataset.param = path;
    if (!Object.prototype.hasOwnProperty.call(table, cur0)) sel.append(mk('option', { value: cur0, textContent: '[' + String(cur0).trim() + ']' }));
    for (const k of Object.keys(table)) sel.append(mk('option', { value: k, textContent: table[k] }));
    sel.value = cur0;
    sel.disabled = ro;
    sel.onchange = () => commit(inst, path, sel.value, v => { sel.value = v; });
    return sel;
  }

  
  function colorControls(inst, path, ro){
    const hex = inst.value(path);
    const inp = mk('input', { type: 'color', className: 'fxcolor', value: hex, title: '颜色：' + hex });
    inp.dataset.attr = 'fxdlg-param'; inp.dataset.param = path;
    inp.disabled = ro;
    
    inp.oninput = () => liveCommit(inst, path, String(inp.value).toLowerCase());
    inp.onchange = () => {
      const v = String(inp.value).toLowerCase();
      if (commit(inst, path, v, x => { inp.value = x; })) inp.title = '颜色：' + v;
    };
    return [inp];
  }
  function markColor(inst, path){
    inst.consumed.add(path);
    const f = inst.field(path);
    for (const c of (f && f.components) || []) inst.consumed.add(c);
  }

  function rowColor(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const r = line(box, row.label);
    r.append(...colorControls(inst, row.path, ro));
    markColor(inst, row.path);
  }

  function rowNum(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const f = inst.field(row.path);
    const v0 = Number(bare(inst.value(row.path)));
    if (!Number.isFinite(v0)) return;
    const unit = row.unit || (f && UNIT_OF[f.unit]) || '';
    const lo = f && f.min != null ? f.min : (row.min != null ? row.min : 0);
    const hi = f && f.max != null ? f.max : (row.max != null ? row.max : (row.sliderMax != null ? row.sliderMax : 100));
    const sHi = Math.min(hi, row.sliderMax != null ? row.sliderMax : hi);
    const r = line(box, row.label);
    const numIn = mk('input', { type: 'number', className: 'fxnum', value: fmt(v0),
      title: `${row.label}${unit ? `（${unit}）` : ''}：可用的范围 ${fmt(lo)} – ${fmt(hi)}${sHi < hi ? `（滑竿只覆盖到 ${fmt(sHi)}，更大的值直接填数字）` : ''}` });
    numIn.min = lo; numIn.max = hi;
    numIn.step = Number.isInteger(lo) && Number.isInteger(hi) ? 1 : 0.1;
    numIn.dataset.attr = 'fxdlg-param'; numIn.dataset.param = row.path;
    const rng = mk('input', { type: 'range', className: 'fxrange', min: lo, max: sHi,
      step: (sHi - lo) <= 20 ? 0.1 : 1, value: String(Math.min(sHi, Math.max(lo, v0))) });
    rng.dataset.param = row.path;
    numIn.disabled = rng.disabled = ro;
    const push = v => {
      const c = Math.max(lo, Math.min(hi, v));
      numIn.value = fmt(c); rng.value = String(Math.min(sHi, Math.max(lo, c)));
      commit(inst, row.path, c, x => { numIn.value = fmt(x); rng.value = String(x); });
    };
    
    rng.oninput = () => { numIn.value = fmt(+rng.value); liveCommit(inst, row.path, Math.max(lo, Math.min(hi, +rng.value))); };
    rng.onchange = () => push(+rng.value);
    


    numIn.oninput = () => {
      const raw = String(numIn.value).trim();
      if (raw === '' || !Number.isFinite(+raw)) return;      
      const c = Math.max(lo, Math.min(hi, +raw));
      rng.value = String(Math.min(sHi, Math.max(lo, c)));    
      liveCommit(inst, row.path, c);
    };
    numIn.onchange = () => push(+numIn.value || 0);
    r.append(numIn, mk('span', { className: 'fxunit', textContent: unit }), rng);
    inst.consumed.add(row.path);
  }

  function checkbox(inst, path, label, title, ro){
    const lab = mk('label', { className: 'fxcheck' });
    const chk = mk('input', { type: 'checkbox' });
    chk.checked = !!bare(inst.value(path));
    chk.disabled = ro;
    chk.dataset.attr = 'fxdlg-param'; chk.dataset.param = path;
    chk.title = title || label;
    chk.onchange = () => commit(inst, path, chk.checked, v => { chk.checked = !!v; });
    lab.append(chk, mk('span', { textContent: label }));
    inst.consumed.add(path);
    return lab;
  }

  function rowBool(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const r = line(box, '');
    r.replaceChildren(checkbox(inst, row.path, row.label, row.title, ro));
  }

  function rowEnum(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const r = line(box, row.label);
    r.append(selectFor(inst, row.path, ctx.ENUM_LABELS[row.table] || {}, ro, row.label));
    inst.consumed.add(row.path);
  }

  
  function rowAngle(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const v0 = Number(bare(inst.value(row.path))) || 0;
    const r = line(box, row.label);
    const numIn = mk('input', { type: 'number', className: 'fxnum', value: fmt(v0), title: row.label });
    numIn.min = -360; numIn.max = 360; numIn.step = 1;
    numIn.dataset.attr = 'fxdlg-param'; numIn.dataset.param = row.path;
    numIn.disabled = ro;
    const dial = mk('i', { className: 'fxdial', title: '拖动圆盘改角度（PS 的那个小罗盘）' });
    const hand = mk('i', { className: 'fxdial-hand' });
    dial.append(hand);
    const paint = v => { hand.style.transform = `rotate(${-v}deg)`; };
    paint(v0);
    const push = v => {
      const c = Math.max(-360, Math.min(360, Math.round(v)));
      numIn.value = fmt(c); paint(c);
      commit(inst, row.path, c, x => { numIn.value = fmt(x); paint(Number(x) || 0); });
    };
    
    numIn.oninput = () => {
      const raw = String(numIn.value).trim();
      if (raw === '' || raw === '-' || !Number.isFinite(+raw)) return;
      const a = Math.max(-360, Math.min(360, +raw));
      paint(a);
      liveCommit(inst, row.path, a);
    };
    numIn.onchange = () => push(+numIn.value || 0);
    if (!ro) dial.onpointerdown = ev => {
      if (ev.preventDefault) ev.preventDefault();
      const rect = dial.getBoundingClientRect ? dial.getBoundingClientRect() : null;
      if (!rect || !rect.width) return;
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const move = e => {
        const a = Math.round(Math.atan2(cy - e.clientY, e.clientX - cx) * 180 / Math.PI);
        numIn.value = fmt(a); paint(a);
        liveCommit(inst, row.path, a);                 
      };
      const up = () => {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
        push(+numIn.value || 0);
      };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    };
    r.append(numIn, mk('span', { className: 'fxunit', textContent: '°' }), dial);
    inst.consumed.add(row.path);
    if (row.global && inst.has(row.global))
      r.append(checkbox(inst, row.global, '使用全局光', '使用全局光：与文档里其它效果共用同一个光源角度（PS 同）', ro));
  }

  
  function rowContour(box, row, inst, ro){
    if (!inst.has(row.path)) return;
    const r = line(box, row.label);
    const cv = mk('canvas', { className: 'fxcontour' });
    cv.width = 34; cv.height = 34;
    cv.dataset.attr = 'fxdlg-contour'; cv.dataset.param = row.path;
    const cur = contourState(inst, row.path);
    drawContour(cv, cur.points);
    cv.title = `${cur.name || (isLinearContour(cur.points) ? '线性' : '自定')}（单击编辑曲线，▾ 选预设）`;
    const dd = mk('button', { type: 'button', className: 'fxcontour-dd', textContent: '▾', title: '等高线预设' });
    const open = mode => {
      if (ro) return;
      openContourEditor(cv, contourState(inst, row.path), mode, v => {
        if (commit(inst, row.path, v)) { drawContour(cv, v.points); cv.title = `${v.name}（单击编辑曲线，▾ 选预设）`; }
      });
    };
    cv.onclick = () => open('edit'); dd.onclick = () => open('presets');
    cv.style.cursor = ro ? 'default' : 'pointer'; dd.disabled = ro;
    r.append(cv, dd);
    inst.consumed.add(row.path);
    inst.consumed.add(row.path + '.Nm  ');
    inst.consumed.add(row.path + '.Crv ');
    if (row.anti && inst.has(row.anti)) r.append(checkbox(inst, row.anti, '消除锯齿', ANTI_TIP, ro));
  }
  
  function contourState(inst, path){
    const q = inst.value(path);
    if (q && typeof q === 'object' && Array.isArray(q.points)) return { name: q.name || '', points: q.points.map(p => p.slice()) };
    const d = inst.kind === 'existing' ? ctx.effectDescriptor(idx, inst.key, inst.at) : null;
    const node = d && d[path];
    return { name: (node && node['Nm  ']) || '', points: contourPointsOf(node) };
  }
  
  function openContourEditor(anchor, cur, mode, done){
    const el = (t, p = {}, ...kids) => { const e = mk(t, p); e.append(...kids); return e; };
    document.querySelectorAll('.fx-contour-pop').forEach(x => x.remove());
    const pop = mk('div', { className: 'fx-contour-pop' });
    let pts = (isLinearContour(cur.points) ? [[0, 0, true], [255, 255, true]] : cur.points.map(p => [p[0], p[1], p[2] !== false]));
    let name = cur.name || '';
    let sel = -1;
    const presetsBox = mk('div', { className: 'fxc-presets' });
    for (const pr of CONTOUR_PRESETS) {
      const c = mk('canvas', { className: 'fxc-thumb', title: pr.name }); c.width = 36; c.height = 36;
      drawContour(c, pr.points);
      c.onclick = () => {
        pts = pr.points.length ? pr.points.map(p => [p[0], p[1], p[2] !== false]) : [[0, 0, true], [255, 255, true]];
        name = pr.name; nameIn.value = name; sel = -1; redraw();
        if (mode === 'presets') finish(true);
      };
      presetsBox.append(c);
    }
    const ed = mk('canvas', { className: 'fxc-editor' }); ed.width = 180; ed.height = 180;
    const nameIn = mk('input', { type: 'text', value: name, placeholder: '名称', className: 'fxc-name' });
    nameIn.oninput = () => { name = nameIn.value; };
    const inX = mk('input', { type: 'number', min: 0, max: 255, className: 'fxnum' }), inY = mk('input', { type: 'number', min: 0, max: 255, className: 'fxnum' });
    const corner = mk('input', { type: 'checkbox' });
    const fields = el('div', { className: 'fxc-fields' },
      el('label', {}, mk('span', { textContent: '输入 ' }), inX), el('label', {}, mk('span', { textContent: '输出 ' }), inY),
      el('label', { className: 'fxcheck' }, corner, mk('span', { textContent: '边角' })));
    const ok = mk('button', { type: 'button', className: 'primary', textContent: '确定' });
    const cancel = mk('button', { type: 'button', textContent: '取消' });
    const right = el('div', { className: 'fxc-right' }, ed, fields, nameIn, el('div', { className: 'fxc-btns' }, cancel, ok));
    pop.append(presetsBox, right);
    if (mode === 'presets') right.hidden = true;
    (anchor.closest('dialog') || document.body).append(pop);   
    const ar = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, ar.left)) + 'px';
    pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, ar.bottom + 4)) + 'px';
    const S = 180, toPx = (x, y) => [x / 255 * (S - 8) + 4, S - 4 - y / 255 * (S - 8)];
    const fromPx = (px, py) => [Math.round(Math.max(0, Math.min(255, (px - 4) / (S - 8) * 255))), Math.round(Math.max(0, Math.min(255, (S - 4 - py) / (S - 8) * 255)))];
    function redraw(){
      const g = ed.getContext('2d'); g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#333'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { const v = 4 + k * (S - 8) / 4; g.beginPath(); g.moveTo(v, 4); g.lineTo(v, S - 4); g.moveTo(4, v); g.lineTo(S - 4, v); g.stroke(); }
      const lut = contourLutFromPoints(pts);
      g.strokeStyle = '#e6e6e6'; g.lineWidth = 1.5; g.beginPath();
      for (let x = 0; x < 256; x++) { const [px, py] = toPx(x, lut ? lut[x] : x); if (x) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
      pts.forEach((p, k) => { const [px, py] = toPx(p[0], p[1]); g.fillStyle = k === sel ? '#2d8ceb' : '#fff'; g.beginPath();
        if (p[2]) g.arc(px, py, 3.5, 0, Math.PI * 2); else g.rect(px - 3.5, py - 3.5, 7, 7); g.fill(); });
      const has = sel >= 0;
      inX.disabled = inY.disabled = corner.disabled = !has;
      if (has) { inX.value = pts[sel][0]; inY.value = pts[sel][1]; corner.checked = !pts[sel][2]; }
    }
    const endpoint = k => k === 0 || k === pts.length - 1;
    ed.onpointerdown = e => {
      const r = ed.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      let hit = -1;
      pts.forEach((p, k) => { const [x, y] = toPx(p[0], p[1]); if (Math.hypot(x - px, y - py) < 7) hit = k; });
      if (hit < 0) {
        const [x, y] = fromPx(px, py);
        if (pts.some(p => p[0] === x) || pts.length >= 64) return;
        pts.push([x, y, true]); pts.sort((a, b) => a[0] - b[0]); hit = pts.findIndex(p => p[0] === x);
      }
      sel = hit; redraw();
      ed.setPointerCapture(e.pointerId);
      ed.onpointermove = ev => {
        const qx = ev.clientX - r.left, qy = ev.clientY - r.top;
        if (!endpoint(sel) && (qy < -24 || qy > S + 24)) { pts.splice(sel, 1); sel = -1; ed.onpointermove = null; redraw(); return; }   
        let [x, y] = fromPx(qx, qy);
        if (sel === 0) x = 0; else if (sel === pts.length - 1) x = 255;
        else x = Math.max(pts[sel - 1][0] + 1, Math.min(pts[sel + 1][0] - 1, x));
        pts[sel] = [x, y, pts[sel][2]]; redraw();
      };
      ed.onpointerup = () => { ed.onpointermove = null; };
    };
    const setSel = () => {
      if (sel < 0) return;
      let x = Math.round(+inX.value), y = Math.max(0, Math.min(255, Math.round(+inY.value)));
      if (sel === 0) x = 0; else if (sel === pts.length - 1) x = 255;
      else x = Math.max(pts[sel - 1][0] + 1, Math.min(pts[sel + 1][0] - 1, x));
      pts[sel] = [x, y, !corner.checked]; redraw();
    };
    inX.onchange = inY.onchange = corner.onchange = setSel;
    function finish(apply){
      pop.remove(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onOut, true);
      if (!apply) return;
      const linear = isLinearContour(pts.map(p => [p[0], p[1]]));
      done({ name: name || (linear ? '线性' : '自定'), points: linear ? [] : pts.map(p => [p[0], p[1], p[2]]) });
    }
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); finish(false);  } else if (e.key === 'Enter' && !right.hidden) { e.stopPropagation(); e.preventDefault(); finish(true); } };
    const onOut = e => { if (!pop.contains(e.target) && e.target !== anchor) finish(false); };
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('pointerdown', onOut, true), 0);
    ok.onclick = () => finish(true); cancel.onclick = () => finish(false);
    redraw();
  }
  function drawContour(cv, pts){
    const g = cv.getContext && cv.getContext('2d');
    if (!g || !g.beginPath) return;
    const w = cv.width, h = cv.height;
    g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a3a3c'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    const lut = contourLutFromPoints(pts || []);
    g.strokeStyle = '#d8d8d9'; g.lineWidth = 1.5;
    g.beginPath();
    for (let x = 0; x < 256; x += 3) {
      const px = x / 255 * (w - 2) + 1, py = h - 1 - (lut ? lut[x] : x) / 255 * (h - 2);
      if (x) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  }

  
  function rowGradient(box, inst, ro){
    if (inst.kind === 'template') return;      
    if (inst.kind !== 'existing') {
      hintLine(box, '本次新建的效果还没有原始样式块，渐变色标要等导出后重新打开再编辑；这里可以先调其余参数。');
      return;
    }
    const ui = {
      mk,
      row: (label, ...els) => { const r = line(box, label); r.append(...els); return r; },
      hint: (t, cls) => hintLine(box, t, cls === 'warn'),
      rerender,
      scope: paneBox,
    };
    const taken = ctx.renderGradientEditor(box, idx, inst.target_, ui) || new Set();
    for (const p of taken) inst.consumed.add(p);
    if (ro) for (const el of box.querySelectorAll('input,select,button')) el.disabled = true;
  }

  
  function rowPattern(box, row, inst, ro){
    const nameP = 'Ptrn.Nm  ', idP = 'Ptrn.Idnt';
    if (!inst.has(idP) && !inst.has(nameP)) return;
    const patterns = ctx.patterns();
    const curId = bare(inst.value(idP));
    const r = line(box, row.label || '图案');
    const sel = mk('select', { title: '选择文档里的图案资源（全局 Patt）' });
    sel.dataset.attr = 'fxdlg-pattern'; sel.dataset.param = idP;
    if (!patterns.some(p => p.id === curId))
      sel.append(mk('option', { value: curId, textContent: String(bare(inst.value(nameP)) || '（文件里的图案）') }));
    for (const p of patterns) sel.append(mk('option', { value: p.id, textContent: `${p.name}（${p.width || '?'}×${p.height || '?'}）` }));
    sel.value = curId;
    sel.disabled = ro || !patterns.length;
    if (!patterns.length) sel.title = '当前文件没有解析出可用的图案资源，换不了图案（已有图案仍会原样写回）';
    sel.onchange = () => {
      const p = patterns.find(x => x.id === sel.value);
      if (!p) return;
      if (write(() => { inst.set(nameP, p.name); return inst.set(idP, p.id); })) ctx.afterEdit();
    };
    r.append(sel);
    inst.consumed.add(idP); inst.consumed.add(nameP); inst.consumed.add('Ptrn');
  }

  
  function renderRest(inst){
    if (inst.kind !== 'existing') return;
    const t = inst.target_;
    const rest = (t.fields || []).filter(f => f.editable && f.path !== 'enab' && !inst.consumed.has(f.path)
      && !/^(TrnS|MpgS)\./.test(f.path));
    if (!rest.length) return;
    const det = mk('details', { className: 'fxrest' });
    det.append(mk('summary', { textContent: `其它参数（${rest.length}）`,
      title: 'PS 面板上没有单独位置、或这一版 PSD 特有的字段：按内核给的类型与取值范围直接铺' }));
    paneBox.append(det);
    const ui = {
      mk,
      row: (label, ...els) => { const r = mk('div', { className: 'fxrow' }); r.append(mk('label', { textContent: label }), ...els); det.append(r); return r; },
      hint: () => mk('span'),
    };
    for (const f of rest) ctx.paramRow(det, idx, t, f, ui);
    if (readOnly() || inst.removed()) for (const el of det.querySelectorAll('input,select,button')) el.disabled = true;
  }

  

  const KNOCKOUT = { 0: '无', 1: '浅', 2: '深' };
  function renderBlendPane(){
    const l = ctx.getLayerNode(idx);
    const ro = readOnly();
    const st = ctx.blend.get(idx);
    const g1 = group('常规混合');
    const r1 = line(g1, '混合模式');
    const bm = mk('select', { title: '图层混合模式（与图层面板顶部的那个是同一个）' });
    bm.dataset.attr = 'fxdlg-blend';
    for (const k of (l && l.isGroup ? ['pass', ...ctx.BLEND_KEYS] : ctx.BLEND_KEYS))
      bm.append(mk('option', { value: k, textContent: ctx.BLEND_LABELS[k] || k }));
    if (![...bm.options].some(o => o.value === st.blendKey))
      bm.append(mk('option', { value: st.blendKey, textContent: '[' + String(st.blendKey).trim() + ']' }));
    bm.value = st.blendKey;
    bm.disabled = ro;
    bm.onchange = () => { ensureHistory(); ctx.blend.setMode(idx, bm.value); ctx.afterEdit(); };
    r1.append(bm);
    numRow(g1, '不透明度', Math.round(st.opacity / 2.55), 0, 100, '%',
      v => { ensureHistory(); ctx.blend.setOpacity(idx, Math.round(v * 2.55)); ctx.afterEdit(); }, ro, 'fxdlg-opacity');

    const g2 = group('高级混合');
    numRow(g2, '填充不透明度', Math.round(ctx.blend.fillOpacity(idx) / 2.55), 0, 100, '%',
      v => { if (write(() => ctx.blend.setFillOpacity(idx, Math.round(v * 2.55)))) ctx.afterEdit(); }, ro, 'fxdlg-fill');
    const rk = line(g2, '挖空');
    const ko = mk('select', { title: '挖空（knockout）：让这一层「打穿」下方图层，露出背景或组外（PS 同）' });
    ko.dataset.attr = 'fxdlg-knockout';
    for (const k of Object.keys(KNOCKOUT)) ko.append(mk('option', { value: k, textContent: KNOCKOUT[k] }));
    ko.value = String(ctx.blend.knockout(idx));
    ko.disabled = ro;
    ko.onchange = () => { if (write(() => ctx.blend.setKnockout(idx, +ko.value))) ctx.afterEdit(); };
    rk.append(ko);
    const adv = ctx.blend.advanced(idx);
    const setAdv = (field, value) => { if (write(() => ctx.blend.setAdvanced(idx, field, value))) ctx.afterEdit(); };
    const rc = line(g2, '通道');
    rc.title = '取消勾选的通道不参与这一层的混合（下面的值原样保留，PS 同）';
    for (const [ch, key] of [['R', 'r'], ['G', 'g'], ['B', 'b']]) {
      const lab = mk('label', { className: 'fxcheck' });
      const c = mk('input', { type: 'checkbox' });
      c.checked = adv.channels[key] !== false; c.disabled = ro;
      c.dataset.attr = 'fxdlg-channel'; c.dataset.ch = ch;
      c.onchange = () => setAdv('channels', { ...ctx.blend.advanced(idx).channels, [key]: c.checked });
      lab.append(c, mk('span', { textContent: ch }));
      rc.append(lab);
    }
    const ADV = [
      ['blendInterior', '将内部效果混合成组', '内发光 / 光泽 / 叠加类效果先与图层内容合在一起，再按图层的混合模式混合（infx）'],
      ['blendClipped', '将剪贴图层混合成组', '剪贴到这一层的图层先按基底层的混合模式成组再混合（clbl）'],
      ['transparencyShapes', '透明形状图层', '效果与挖空只作用在图层不透明的区域（tsly）'],
      ['layerMaskHidesEffects', '图层蒙版隐藏效果', '用图层蒙版裁掉效果，而不是让效果沿着蒙版边缘生成（lmgm）'],
      ['vectorMaskHidesEffects', '矢量蒙版隐藏效果', '用矢量蒙版裁掉效果（vmgm）'],
    ];
    for (const [field, label, tip] of ADV) {
      const r = line(g2, '');
      const lab = mk('label', { className: 'fxcheck' });
      const c = mk('input', { type: 'checkbox' });
      c.checked = !!adv[field]; c.disabled = ro; c.title = tip + '（写回文件；画布预览不模拟这一项）';
      c.dataset.attr = 'fxdlg-adv'; c.dataset.field = field;
      c.onchange = () => setAdv(field, c.checked);
      lab.append(c, mk('span', { textContent: label }));
      r.replaceChildren(lab);
      r.title = c.title;
    }
    
    const g3 = group('混合颜色带');
    const rsel = line(g3, '混合颜色带');
    const chSel = mk('select', { title: '按哪个通道的亮度判断' });
    for (const [v, t] of [['gray', '灰色'], ['red', '红'], ['green', '绿'], ['blue', '蓝']]) chSel.append(mk('option', { value: v, textContent: t }));
    chSel.disabled = ro;
    rsel.append(chSel);
    const bars = mk('div', { className: 'fxbi' });
    g3.append(bars);
    const drawBars = () => {
      bars.replaceChildren();
      const cur = ctx.blend.advanced(idx).blendIf[chSel.value];
      for (const [side, label] of [['this', '本图层'], ['under', '下一图层']])
        bars.append(blendIfBar(label, cur[side], chSel.value, ro, q => {
          const now = ctx.blend.advanced(idx).blendIf;
          setAdv('blendIf', { ...now, [chSel.value]: { ...now[chSel.value], [side]: q } });
        }));
    };
    chSel.onchange = drawBars;
    drawBars();
  }
  
  function blendIfBar(label, q0, ch, ro, commitQ){
    const q = q0.slice();
    const wrap = mk('div', { className: 'fxbi-row' });
    const head = mk('div', { className: 'fxbi-head' });
    const read = mk('span', { className: 'fxbi-read' });
    head.append(mk('span', { textContent: label }), read);
    const W = 256, H = 26;
    const cv = mk('canvas', { className: 'fxbi-bar' }); cv.width = W + 12; cv.height = H;
    const col = { gray: [255, 255, 255], red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255] }[ch];
    const draw = () => {
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, H);
      const gr = g.createLinearGradient(6, 0, 6 + W, 0);
      gr.addColorStop(0, '#000'); gr.addColorStop(1, `rgb(${col.join(',')})`);
      g.fillStyle = gr; g.fillRect(6, 2, W, 12);
      const tri = (v, fill) => { const x = 6 + v; g.fillStyle = fill; g.strokeStyle = '#888'; g.beginPath(); g.moveTo(x, 15); g.lineTo(x - 5, 24); g.lineTo(x + 5, 24); g.closePath(); g.fill(); g.stroke(); };
      tri(q[0], '#000'); if (q[1] !== q[0]) tri(q[1], '#000');
      tri(q[3], '#fff'); if (q[2] !== q[3]) tri(q[2], '#fff');
      read.textContent = (q[0] === q[1] ? `${q[0]}` : `${q[0]}/${q[1]}`) + '   ' + (q[2] === q[3] ? `${q[3]}` : `${q[2]}/${q[3]}`);
    };
    draw();
    if (!ro) cv.onpointerdown = e => {
      const r = cv.getBoundingClientRect(), vx = ev => Math.max(0, Math.min(255, Math.round((ev.clientX - r.left) * cv.width / r.width - 6)));
      const v = vx(e);
      
      const d = [0, 1, 2, 3].map(k => Math.abs(q[k] - v));
      let k = d.indexOf(Math.min(...d));
      const pair = !e.altKey && ((k < 2 && q[0] === q[1]) || (k >= 2 && q[2] === q[3]));
      if (!e.altKey && k < 2 && q[0] !== q[1]) k = d[0] <= d[1] ? 0 : 1;
      cv.setPointerCapture(e.pointerId);
      cv.onpointermove = ev => {
        let x = vx(ev);
        if (k < 2) {
          x = Math.min(x, q[2]);
          if (pair) { q[0] = q[1] = x; } else if (k === 0) q[0] = Math.min(x, q[1]); else q[1] = Math.max(x, q[0]);
        } else {
          x = Math.max(x, q[1]);
          if (pair) { q[2] = q[3] = x; } else if (k === 2) q[2] = Math.min(x, q[3]); else q[3] = Math.max(x, q[2]);
        }
        draw();
      };
      cv.onpointerup = () => { cv.onpointermove = null; commitQ(q.slice()); };
    };
    wrap.append(head, cv);
    return wrap;
  }

  function numRow(box, label, value, lo, hi, unit, onChange, ro, attr){
    const r = line(box, label);
    const numIn = mk('input', { type: 'number', className: 'fxnum', value: String(value) });
    numIn.min = lo; numIn.max = hi; numIn.step = 1;
    if (attr) numIn.dataset.attr = attr;
    const rng = mk('input', { type: 'range', className: 'fxrange', min: lo, max: hi, step: 1, value: String(value) });
    numIn.disabled = rng.disabled = ro;
    const push = v => { const c = Math.max(lo, Math.min(hi, Math.round(v))); numIn.value = String(c); rng.value = String(c); onChange(c); };
    let numHold = 0;
    numIn.oninput = () => {
      const raw = String(numIn.value).trim();
      if (raw === '' || !Number.isFinite(+raw)) return;
      rng.value = String(Math.max(lo, Math.min(hi, +raw)));
      if (numHold) return;
      numHold = raf(() => { numHold = 0; (ctx.fast || (fn => fn()))(() => push(+numIn.value || 0)); });
    };
    
    let liveHold = 0;
    rng.oninput = () => {
      numIn.value = rng.value;
      if (liveHold) return;
      liveHold = raf(() => { liveHold = 0; (ctx.fast || (fn => fn()))(() => push(+rng.value)); });
    };
    rng.onchange = () => push(+rng.value);
    numIn.onchange = () => push(+numIn.value || 0);
    r.append(numIn, mk('span', { className: 'fxunit', textContent: unit }), rng);
    return r;
  }

  const fmt = n => (Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : Number(n).toFixed(1));

  

  function rerender(){
    if (!dlg || !dlg.open) return;
    renderList();
    renderPane();
    syncHead();
  }
  function syncHead(){
    const title = dlg.querySelector('#fxDlgTitle');
    if (title) title.textContent = '图层样式' + (ctx.layerName(idx) ? ` — ${ctx.layerName(idx)}` : '');
    const why = readOnlyReason();
    if (why) note(why, true);
  }

  function togglePreview(){
    if (!session) return;
    if (!previewChk.checked) {
      session.savedSnap = ctx.snapshot();
      ctx.restore(session.openSnap);
      session.previewOff = true;
    } else {
      if (session.savedSnap) ctx.restore(session.savedSnap);
      session.savedSnap = null;
      session.previewOff = false;
    }
    ctx.afterEdit();
    rerender();
    note(session.previewOff ? '预览已关闭：画布显示的是打开对话框前的样子，右栏暂时只读。' : '');
  }

  



  function open(layerIndex, focus){
    const d = host();
    if (!d) return false;
    idx = layerIndex;
    session = { openSnap: ctx.snapshot(), pushed: false, previewOff: false, savedSnap: null };
    cur = paneIdOf(focus) || 'blend';
    curSel = '0';
    previewChk.checked = true;
    note('');
    ctx.kickEdit();                       
    restorePos();
    rerender();
    try { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } catch { d.setAttribute('open', ''); }
    rerender();
    return true;
  }
  function paneIdOf(focus){
    if (!focus) return '';
    if (PANE_BY_ID[focus]) return focus;
    const byKey = PANES.find(p => p.key === focus);
    return byKey ? byKey.id : '';
  }

  function close(keep){
    if (!dlg) return;
    if (session) {
      if (session.previewOff && session.savedSnap) ctx.restore(session.savedSnap);   
      if (!keep) {
        ctx.restore(session.openSnap);
        if (session.pushed) ctx.history.rollback();
      }
      ctx.history.lock(false);
      session = null;
      ctx.afterEdit();
      ctx.refresh();
    }
    try { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } catch { dlg.removeAttribute('open'); }
  }

  return {
    open,
    close,
    isOpen: () => !!(dlg && dlg.open),
    refresh: () => { if (dlg && dlg.open) rerender(); },
  };
}
