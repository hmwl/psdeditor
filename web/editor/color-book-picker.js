import { readAcb } from '../../core/color-books.js';
import { colorPanel, rgbHex } from './color-panel.js';
import { colorSafety } from './color-safety.js';
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const cache = new Map();
let manifest;
async function fetchData(file, json = false) {
  const r = await fetch('/assets/color-books/' + file);
  if (!r.ok) throw new Error('颜色库读取失败，请重试');
  return json ? r.json() : r.arrayBuffer();
}
const colorRGB = c => c.model === 'lab' ? colorPanel._conv.lab2rgb(c.values) : c.model === 'cmyk' ? colorPanel._conv.cmyk2rgb(c.values) : c.values.slice();
const colorLab = c => c.model === 'lab' ? c.values : colorPanel._conv.rgb2lab(colorRGB(c));


export function showColorBooks({ dialog, original, current, onPicker, onConfirm, onCancel }) {
  const root = mk('div', { className: 'pcb' });
  const top = mk('label', { className: 'pcb-select', textContent: '色库：' }), select = mk('select'); select.setAttribute('aria-label', '色库'); top.append(select);
  const list = mk('div', { className: 'pcb-list', tabIndex: 0 }); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '色库颜色');
  const nav = mk('div', { className: 'pcb-nav' });
  const button = text => mk('button', { type: 'button', textContent: text });
  const up = button('⌃'), down = button('⌄'), strip = mk('canvas', { width: 20, height: 232, tabIndex: 0 });
  up.setAttribute('aria-label', '上一页颜色'); down.setAttribute('aria-label', '下一页颜色'); strip.setAttribute('aria-label', '色库分页色谱');
  const marker = mk('span', { className: 'pcb-marker' }); nav.append(up, strip, marker, down);
  const detail = mk('div', { className: 'pcb-detail' }), preview = mk('div', { className: 'pcb-preview' });
  const next = mk('div'), previous = mk('div'); previous.style.background = rgbHex(original); preview.append(next, previous);
  const values = mk('div', { className: 'pcb-values' });
  const search = mk('input', { type: 'text', placeholder: '键入颜色名称', spellcheck: false }); search.setAttribute('aria-label', '查找色库颜色');
  const hint = mk('p', { textContent: '键入颜色名称以从颜色列表中选择它。' });
  const status = mk('p', { className: 'pcb-status' }); status.setAttribute('role', 'status');
  let chosen = current.slice(), book = null, selected = -1, page = 0, loadToken = 0, active = true;
  const safety = colorSafety(() => chosen, c => { chosen = c; selected = -1; paint(); });
  preview.append(safety.root); detail.append(preview, values, search, hint, status);
  const commands = mk('div', { className: 'pcb-commands' }), ok = button('确定'), cancel = button('取消'), picker = button('拾色器');
  commands.append(ok, cancel, picker); root.append(top, list, nav, detail, commands); dialog.append(root);
  ok.disabled = true;
  function leave(fn) { active = false; ++loadToken; root.remove(); fn(chosen); }
  ok.onclick = () => leave(onConfirm); cancel.onclick = () => leave(onCancel); picker.onclick = () => leave(onPicker);
  function choose(index) { if (!book?.colors[index]?.name) return; selected = index; page = Math.floor(index / book.pageSize); chosen = colorRGB(book.colors[index]); paint(); }
  function paint() {
    if (!book || !active) return;
    list.replaceChildren();
    const start = page * book.pageSize;
    list.style.setProperty('--book-page-size', book.pageSize);
    for (const c of book.colors.slice(start, start + book.pageSize)) {
      const row = button(''); row.className = 'pcb-color'; row.disabled = !c.name; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(c.index === selected));
      row.setAttribute('aria-label', c.name || '空白色位'); row.dataset.index = c.index;
      const swatch = mk('i'); swatch.style.background = c.name ? rgbHex(colorRGB(c)) : 'transparent';
      row.append(swatch, mk('span', { textContent: c.name })); row.onclick = () => choose(c.index); list.append(row);
    }
    const c = book.colors[selected], lab = c ? colorLab(c) : colorPanel._conv.rgb2lab(chosen);
    values.replaceChildren(...['L', 'a', 'b'].map((label, i) => mk('div', { textContent: `${label}:　${Math.round(lab[i])}` })));
    next.style.background = rgbHex(chosen); safety.render();
    const pages = Math.ceil(book.count / book.pageSize), ctx = strip.getContext('2d');
    for (let y = 0; y < strip.height; y++) {
      const index = Math.floor(y / strip.height * pages) * book.pageSize;
      const c = book.colors[Math.min(book.count - 1, index + book.pageOffset)];
      ctx.fillStyle = rgbHex(colorRGB(c)); ctx.fillRect(0, y, 20, 1);
    }
    marker.style.top = (14 + (page + .5) / pages * 232) + 'px';
    up.disabled = page === 0; down.disabled = page === pages - 1;
    ok.disabled = false;
  }
  function turn(delta) {
    if (!book) return;
    page = Math.max(0, Math.min(Math.ceil(book.count / book.pageSize) - 1, page + delta)); paint();
  }
  up.onclick = () => turn(-1); down.onclick = () => turn(1);
  list.addEventListener('wheel', e => { e.preventDefault(); turn(Math.sign(e.deltaY)); }, { passive: false });
  const pickPage = e => { if (!book) return; const r = strip.getBoundingClientRect(); page = Math.max(0, Math.min(Math.ceil(book.count / book.pageSize) - 1, Math.floor((e.clientY - r.top) / r.height * Math.ceil(book.count / book.pageSize)))); paint(); };
  strip.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); strip.focus(); strip.setPointerCapture(e.pointerId); pickPage(e); };
  strip.onpointermove = e => { if (strip.hasPointerCapture(e.pointerId)) pickPage(e); };
  root.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel.click(); return; }
    if (e.key === 'Enter' && !['SELECT', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); e.stopPropagation(); ok.click(); return; }
    if (e.target === select || e.target === search) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      if (e.key.startsWith('Page')) turn(e.key === 'PageUp' ? -1 : 1);
      else if (book) {
        const step = e.key === 'ArrowUp' ? -1 : 1; let index = selected < 0 ? page * book.pageSize : selected + step;
        while (index >= 0 && index < book.count && !book.colors[index].name) index += step;
        choose(index); list.focus();
      }
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { search.focus(); search.value += e.key; search.dispatchEvent(new Event('input')); e.preventDefault(); }
  };
  search.oninput = () => {
    if (!book) return; const q = search.value.trim().toLowerCase(); if (!q) { status.textContent = ''; return; }
    const c = book.colors.find(c => c.name && (c.shortName.toLowerCase() === q || c.name.toLowerCase() === q)) || book.colors.find(c => c.name && (c.name.toLowerCase().includes(q) || c.code.trim().toLowerCase().includes(q)));
    status.textContent = c ? '' : '未找到该颜色'; if (c) choose(c.index);
  };
  async function load() {
    const token = ++loadToken; book = null; selected = -1; list.replaceChildren(); up.disabled = down.disabled = true; ok.disabled = true; status.textContent = '正在载入颜色库…';
    try {
      const entry = manifest.books.find(b => String(b.id) === select.value);
      let loaded = cache.get(entry.file); if (!loaded) { loaded = readAcb(await fetchData(entry.file)); cache.set(entry.file, loaded); }
      if (!active || token !== loadToken || !root.isConnected) return;
      book = loaded; search.value = ''; status.textContent = '';
      
      const lab = colorPanel._conv.rgb2lab(chosen); let nearest = 0, distance = Infinity;
      for (const c of book.colors) { if (!c.name) continue; const v = colorLab(c), d = v.reduce((sum, n, i) => sum + (n - lab[i]) ** 2, 0); if (d < distance) { distance = d; nearest = c.index; } }
      choose(nearest);
      try { localStorage.setItem('fp.colorBook', entry.file); } catch {}
    } catch (e) { if (active && token === loadToken) { book = null; list.replaceChildren(); status.textContent = e.message; } }
  }
  select.onchange = load;
  (async () => {
    try {
      if (!manifest) manifest = await fetchData('manifest.json', true);
      if (!active || !root.isConnected) return;
      for (const b of manifest.books) select.append(mk('option', { value: b.id, textContent: b.title }));
      let saved; try { saved = localStorage.getItem('fp.colorBook'); } catch {}
      const entry = manifest.books.find(b => b.file === saved); if (entry) select.value = entry.id;
      await load();
    } catch (e) { if (active) status.textContent = e.message; }
  })();
  return { refresh: () => { if (book) paint(); } };
}
