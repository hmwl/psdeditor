















let host = null;

function ensureHost() {
  if (host && host.isConnected) return host;
  const d = document.createElement('dialog');
  d.className = 'fp-dlg';
  d.innerHTML = ''
    + '<form method="dialog" class="fp-dlg-form">'
    +   '<h3 class="fp-dlg-title" hidden></h3>'
    +   '<div class="fp-dlg-msg"></div>'
    +   '<label class="fp-dlg-field" hidden><span class="fp-dlg-label"></span>'
    +     '<input type="number" class="fp-dlg-input" step="1">'
    +   '</label>'
    +   '<div class="fp-dlg-btns">'
    +     '<button type="button" class="fp-dlg-extra" hidden></button>'
    +     '<button type="button" class="fp-dlg-cancel">取消</button>'
    +     '<button type="button" class="fp-dlg-ok primary">确定</button>'
    +   '</div>'
    + '</form>';
  (document.body || document.documentElement).appendChild(d);
  host = d;
  return d;
}













function tapped(o, p) {
  const t = typeof window !== 'undefined' && window.__fpDialogTap;
  return t ? p.then(v => { try { t(o, v); } catch {} return v; }) : p;
}
function show(o) { return tapped(o, show0(o)); }
function show0(o) {
  

  const stub = typeof window !== 'undefined' && window.__fpDialog;
  if (stub) return Promise.resolve(stub(o));
  return new Promise(resolve => {
    const d = ensureHost();
    const title = d.querySelector('.fp-dlg-title');
    const msg = d.querySelector('.fp-dlg-msg');
    const field = d.querySelector('.fp-dlg-field');
    const label = d.querySelector('.fp-dlg-label');
    const input = d.querySelector('.fp-dlg-input');
    const ok = d.querySelector('.fp-dlg-ok');
    const cancel = d.querySelector('.fp-dlg-cancel');
    const extra = d.querySelector('.fp-dlg-extra');

    title.textContent = o.title || '';
    title.hidden = !o.title;

    msg.innerHTML = '';
    for (const line of String(o.msg ?? '').split('\n')) {
      const p = document.createElement('p'); p.textContent = line; msg.appendChild(p);
    }

    const hasInput = !!(o.input && o.input !== true);
    field.hidden = !hasInput;
    if (hasInput) {
      label.textContent = o.input.label || '';
      label.hidden = !o.input.label;
      input.value = o.input.value ?? '';
    }

    ok.textContent = o.okText || '确定';
    cancel.textContent = o.cancelText || '取消';
    cancel.hidden = !!o.alertOnly;
    if (extra) { extra.hidden = !o.extraText; extra.textContent = o.extraText || ''; }
    ok.classList.toggle('danger', !!o.danger);

    let settled = false;
    const off = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); off.push(() => el.removeEventListener(ev, fn, opt)); };

    const close = () => { try { d.close(); } catch { d.removeAttribute('open'); } };
    const finish = v => {
      if (settled) return; settled = true;
      for (const f of off) f();
      close();
      resolve(v);
    };
    const accept = () => finish(o.choice ? 'ok' : hasInput ? input.value : true);
    const reject = () => finish(o.choice ? 'cancel' : hasInput ? null : false);
    if (extra && o.extraText) on(extra, 'click', () => finish('extra'));

    on(ok, 'click', accept);
    on(cancel, 'click', reject);
    
    on(d, 'cancel', e => { e.preventDefault(); reject(); });
    on(d, 'keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reject(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); accept(); }
    }, true);
    
    on(d, 'click', e => { if (e.target === d) reject(); });

    try { if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } } catch { d.setAttribute('open', ''); }
    try { (hasInput ? input : ok).focus(); input.select && hasInput && input.select(); } catch {}
  });
}


export function choiceDialog(msg, opts = {}) {
  return show({ ...opts, msg, choice: true, okText: opts.okText || '确定', extraText: opts.extraText || '', cancelText: opts.cancelText || '取消' });
}


export function confirmDialog(msg, opts = {}) {
  return show({ ...opts, msg, okText: opts.okText || '确定', cancelText: opts.cancelText || '取消' });
}


export function alertDialog(msg, opts = {}) { return show({ ...opts, msg, alertOnly: true, okText: opts.okText || '确定' }); }


export function promptDialog(msg, value = '', opts = {}) {
  return show({ ...opts, msg, input: { value, label: opts.label || '' }, okText: opts.okText || '确定', cancelText: opts.cancelText || '取消' });
}







let formHost = null;
export function formDialog(title, fields, opts = {}) { return tapped({ form: true, title, fields, ...opts }, formDialog0(title, fields, opts)); }
function formDialog0(title, fields, opts = {}) {
  const stub = typeof window !== 'undefined' && window.__fpDialog;
  if (stub) return Promise.resolve(stub({ form: true, title, fields, ...opts }));
  return new Promise(resolve => {
    if (formHost && formHost.isConnected) formHost.remove();
    const d = document.createElement('dialog');
    d.className = 'fp-dlg fp-form';
    formHost = d;
    const vals = Object.fromEntries(fields.filter(f => f.key).map(f => [f.key, f.value]));
    const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
    const form = mk('form', { method: 'dialog', className: 'fp-dlg-form' });
    form.append(mk('h3', { className: 'fp-dlg-title', textContent: title }));
    if (opts.msg) form.append(mk('div', { className: 'fp-dlg-msg', textContent: opts.msg }));
    const rows = [];
    const body = mk('div', { className: 'fp-form-body', style: 'display:flex;flex-direction:column;gap:8px;min-width:340px;max-height:60vh;overflow:auto' });
    const sync = () => { for (const [f, row] of rows) if (f.showIf) row.hidden = !f.showIf(vals); };
    const changed = () => { sync(); if (opts.onChange) try { opts.onChange({ ...vals }); } catch {} };
    for (const f of fields) {
      const row = mk('label', { className: 'fp-form-row', style: 'display:flex;align-items:center;gap:8px' });
      if (f.type === 'note') { row.append(mk('div', { className: 'anote plain', textContent: f.label, style: 'flex:1' })); body.append(row); rows.push([f, row]); continue; }
      row.append(mk('span', { textContent: f.label, style: 'width:108px;flex:none;opacity:.85' }));
      let el;
      if (f.type === 'select') {
        el = mk('select', { style: 'flex:1' });
        for (const [v, lab] of f.options) el.append(mk('option', { value: v, textContent: lab }));
        el.value = f.value; el.onchange = () => { vals[f.key] = el.value; changed(); };
      } else if (f.type === 'check') {
        el = mk('input', { type: 'checkbox', checked: !!f.value }); el.onchange = () => { vals[f.key] = el.checked; changed(); };
      } else if (f.type === 'color') {
        el = mk('input', { type: 'color', value: f.value || '#000000' }); el.oninput = () => { vals[f.key] = el.value; changed(); };
      } else if (f.type === 'textarea') {
        el = mk('textarea', { value: f.value ?? '', rows: f.rows || 3, readOnly: !!f.readonly, style: 'flex:1;resize:vertical' });
        el.oninput = () => { vals[f.key] = el.value; changed(); };
      } else if (f.type === 'text') {
        el = mk('input', { type: 'text', value: f.value ?? '', readOnly: !!f.readonly, style: 'flex:1' });
        el.oninput = () => { vals[f.key] = el.value; changed(); };
      } else {
        el = mk('input', { type: 'number', value: f.value, min: f.min ?? '', max: f.max ?? '', step: f.step ?? 1, style: 'width:90px' });
        el.onchange = () => {
          let v = +el.value; if (!Number.isFinite(v)) v = f.value;
          if (f.min != null) v = Math.max(f.min, v); if (f.max != null) v = Math.min(f.max, v);
          el.value = v; vals[f.key] = v; changed();
        };
      }
      row.append(el);
      if (f.unit) row.append(mk('span', { textContent: f.unit, style: 'opacity:.7' }));
      body.append(row); rows.push([f, row]);
    }
    form.append(body);
    const btns = mk('div', { className: 'fp-dlg-btns' });
    const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: opts.cancelText || '取消' });
    const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: opts.okText || '确定' });
    if (opts.okOnly) cancel.hidden = true;
    btns.append(cancel, ok); form.append(btns); d.append(form);
    (document.body || document.documentElement).appendChild(d);
    let done = false;
    const finish = v => {
      if (done) return; done = true;
      try { d.close(); } catch { d.removeAttribute('open'); }
      d.remove(); resolve(v);
    };
    ok.onclick = () => { for (const el of body.querySelectorAll('input[type=number]')) el.onchange && el.onchange(); finish({ ...vals }); };
    cancel.onclick = () => finish(null);
    d.addEventListener('cancel', ev => { ev.preventDefault(); finish(null); });
    d.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); ok.onclick(); } });
    sync();
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
  });
}
