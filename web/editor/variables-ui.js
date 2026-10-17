









import { validVarName, parseDelimited, decodeText, rowsToDataSets, varsToXml, varsFromXml, placeImage, VAR_RESOURCE_ID, dataSetsToDelimited } from '../../core/variables.js';
import { serializeLbResource, parseLbResource } from '../../core/layer-comps.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const clone = o => JSON.parse(JSON.stringify(o));
const safe = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
const base = p => String(p || '').replace(/^.*[\\/]/, '').toLowerCase();

let C = null;
let S = fresh();
const images = new Map();          
function fresh() { return { vars: [], dataSets: [], cur: -1, dirty: false }; }

export const VARS = {
  capture: () => clone(S), apply: v => { S = v ? clone(v) : fresh(); },
  snap: () => clone(S), restore: v => { if (v) S = clone(v); },
  load(buf, info) {
    S = fresh();
    try {
      const r4093 = info.resources.find(r => r.id === VAR_RESOURCE_ID);
      const ext = r4093 && r4093._raw ? parseLbResource(r4093._raw) : null;
      if (ext && Array.isArray(ext.vars)) { S.vars = ext.vars; S.dataSets = ext.dataSets || []; S.cur = ext.cur ?? (S.dataSets.length ? 0 : -1); return; }
      const r7000 = info.resources.find(r => r.id === 7000);
      const m = r7000 && r7000.data ? varsFromXml(r7000.data.xml) : null;
      if (m) {
        S.vars = m.vars.map(v => ({ name: v.name, type: v.type, key: v.layerId != null ? 'id:' + v.layerId : null, method: 'fit', align: 'c', clip: true })).filter(v => v.key);
        S.dataSets = m.dataSets; S.cur = S.dataSets.length ? 0 : -1;
      }
    } catch (e) { console.warn('[variables] 读取失败', e); }
  },
  needsWrite: () => S.dirty || S.vars.length > 0,
  writeInto(buf, h) {
    if (!S.vars.length && !S.dataSets.length) { buf = h.removeImageResource(buf, 7000); return h.removeImageResource(buf, VAR_RESOURCE_ID); }
    let r = h.applyEdits(buf, [{ op: 'ensureLayerIds' }]); buf = r.buffer;
    const ids = h.layerIdsOf(buf);
    const idOf = v => { const i = C.indexOfKey(v.key); if (i < 0) return v.key && v.key.startsWith('id:') ? +v.key.slice(3) : null; const b = h.builtIndexOf(i); return b >= 0 ? ids[b] : null; };
    const vars = S.vars.map(v => { const id = idOf(v); return { ...v, key: id != null ? 'id:' + id : v.key }; });
    buf = h.writeImageResource(buf, 7000, new TextEncoder().encode(varsToXml(vars, S.dataSets, v => (v.key && v.key.startsWith('id:') ? v.key.slice(3) : null))));
    buf = h.writeImageResource(buf, VAR_RESOURCE_ID, serializeLbResource({ vars, dataSets: S.dataSets, cur: S.cur }));
    return buf;
  },
  state: () => S,
};


function varsOfLayer(key) { return S.vars.filter(v => v.key === key); }
async function defineUI() {
  const sel = C.selected(); const i = sel[0];
  if (i == null || i < 0) { await C.alertDialog('先在图层面板里选中要定义变量的图层。', { title: '变量' }); return false; }
  const L = C.layers().find(x => x.i === i); if (!L) return false;
  if (L.isBg) { await C.alertDialog('背景图层不能定义变量（PS 同）：先把它转换为普通图层。', { title: '变量' }); return false; }
  const key = C.keyOf(i), mine = varsOfLayer(key);
  const vis = mine.find(v => v.type === 'visibility'), txt = mine.find(v => v.type === 'text'), pix = mine.find(v => v.type === 'pixel');
  const isText = L.isText, isPix = !isText && C.isPixelLayer(i);
  const n = S.vars.length;
  const fields = [
    { type: 'note', label: `图层：${L.name}` },
    { key: 'vis', label: '可见性', type: 'check', value: !!vis },
    { key: 'visName', label: '名称', type: 'text', value: vis ? vis.name : `可见性变量${n + 1}`, showIf: o => o.vis },
  ];
  if (isText) fields.push({ key: 'txt', label: '文本替换', type: 'check', value: !!txt },
    { key: 'txtName', label: '名称', type: 'text', value: txt ? txt.name : `文本变量${n + 1}`, showIf: o => o.txt });
  if (isPix) fields.push({ key: 'pix', label: '像素替换', type: 'check', value: !!pix },
    { key: 'pixName', label: '名称', type: 'text', value: pix ? pix.name : `像素变量${n + 1}`, showIf: o => o.pix },
    { key: 'method', label: '方法', type: 'select', value: pix ? pix.method : 'fit', options: [['fit', '适合'], ['fill', '填充'], ['asis', '保持原样'], ['conform', '按比例']], showIf: o => o.pix },
    { key: 'align', label: '对齐', type: 'select', value: pix ? pix.align : 'c', options: [['tl', '左上'], ['t', '顶'], ['tr', '右上'], ['l', '左'], ['c', '中心'], ['r', '右'], ['bl', '左下'], ['b', '底'], ['br', '右下']], showIf: o => o.pix },
    { key: 'clip', label: '剪切到定界框', type: 'check', value: pix ? pix.clip !== false : true, showIf: o => o.pix });
  if (!isText && !isPix) fields.push({ type: 'note', label: '这一层只能定义可见性变量（文本替换只用于文字图层，像素替换只用于像素图层）。' });
  const v = await C.formDialog('变量', fields);
  if (!v) return false;
  const names = [];
  if (v.vis) names.push(v.visName); if (v.txt) names.push(v.txtName); if (v.pix) names.push(v.pixName);
  for (const nm of names) {
    if (!validVarName(nm)) { await C.alertDialog(`变量名「${nm}」无效：必须以字母或下划线开头，只能含字母、数字、下划线、连字符和句点（PS 同，变量名要能当 XML 名字）。`, { title: '变量' }); return false; }
    if (S.vars.some(x => x.name === nm && x.key !== key) || names.filter(q => q === nm).length > 1) { await C.alertDialog(`变量名「${nm}」已被使用。`, { title: '变量' }); return false; }
  }
  C.history('定义变量');
  const rename = new Map();
  const put = (type, on, name, extra = {}) => {
    const k = S.vars.findIndex(x => x.key === key && x.type === type);
    if (!on) { if (k >= 0) { const old = S.vars[k].name; S.vars.splice(k, 1); for (const d of S.dataSets) delete d.values[old]; } return; }
    const nv = { name, type, key, ...extra };
    if (k >= 0) { if (S.vars[k].name !== name) rename.set(S.vars[k].name, name); S.vars[k] = nv; } else S.vars.push(nv);
  };
  put('visibility', !!v.vis, v.visName);
  if (isText) put('text', !!v.txt, v.txtName);
  if (isPix) put('pixel', !!v.pix, v.pixName, { method: v.method, align: v.align, clip: !!v.clip });
  for (const d of S.dataSets) for (const [a, b] of rename) if (a in d.values) { d.values[b] = d.values[a]; delete d.values[a]; }
  S.dirty = true;
  C.status(`已定义变量：${names.join('、') || '（无）'}`);
  return true;
}


function currentValues() {
  const out = {};
  for (const v of S.vars) {
    const i = C.indexOfKey(v.key); if (i < 0) continue;
    if (v.type === 'visibility') out[v.name] = C.layerState(i).v;
    else if (v.type === 'text') out[v.name] = C.textOf(i) ?? '';
    else out[v.name] = '';
  }
  return out;
}


function loadImage(file) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file); const im = new Image(); im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 1000); }; im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片解不开：' + file.name)); }; im.src = url; });
}
async function applyValues(values, { noHistory = false } = {}) {
  const miss = [];
  for (const v of S.vars) {
    if (!(v.name in values)) continue;
    const i = C.indexOfKey(v.key); if (i < 0) { miss.push(`${v.name}（图层已不存在）`); continue; }
    const val = values[v.name];
    if (v.type === 'visibility') { const want = !!val; if (C.layerState(i).v !== want) C.setVisible(i, want); }
    else if (v.type === 'text') { const t = String(val ?? ''); if (t && t !== C.textOf(i)) await C.setText(i, t); }
    else if (val) {
      const f = images.get(base(val));
      if (!f) { miss.push(`${v.name}：没有选择图片「${base(val)}」`); continue; }
      const im = await loadImage(f);
      C.replacePixels(i, (g, box) => {
        const r = placeImage(box, im.naturalWidth, im.naturalHeight, v.method || 'fit', v.align || 'c');
        g.save(); if (v.clip !== false) { g.beginPath(); g.rect(box.x, box.y, box.w, box.h); g.clip(); }
        g.imageSmoothingQuality = 'high'; g.drawImage(im, r.x, r.y, r.w, r.h); g.restore();
      }, { noHistory });
    }
  }
  return miss;
}
async function applyDataSet(k, opts = {}) {
  const d = S.dataSets[k]; if (!d) return false;
  if (!opts.noHistory) C.history('应用数据组');
  const miss = await applyValues(d.values, opts);
  S.cur = k;
  C.refresh();
  if (!opts.quiet) C.status(`已应用数据组「${d.name}」${miss.length ? '；' + miss.join('；') : ''}`);
  return miss;
}
async function applyDataSetUI() {
  if (!S.dataSets.length) { await C.alertDialog('还没有数据组：先用「图像 › 变量 › 数据组…」新建，或「文件 › 导入 › 变量数据组…」导入。', { title: '应用数据组' }); return false; }
  const v = await C.formDialog('应用数据组', [
    { key: 'k', label: '数据组', type: 'select', value: String(Math.max(0, S.cur)), options: S.dataSets.map((d, k) => [String(k), d.name]) },
    { type: 'note', label: S.vars.map(x => `${x.name}：${x.type === 'visibility' ? '可见性' : x.type === 'text' ? '文本' : '像素'}`).join('　') },
  ], { okText: '应用' });
  if (!v) return false;
  await applyDataSet(+v.k);
  return true;
}


async function dataSetsUI() {
  if (!S.vars.length) { await C.alertDialog('这个文档还没有定义变量：先选中图层，用「图像 › 变量 › 定义…」。', { title: '变量 › 数据组' }); return false; }
  const snap = clone(S), docSnap = C.snapshot();
  const backups = [...new Set(S.vars.filter(x => x.type === 'pixel').map(x => C.indexOfKey(x.key)).filter(i => i >= 0))].map(i => C.pixelBackup(i));
  C.history('数据组');
  return new Promise(resolve => {
    const d = mk('dialog', { className: 'fp-dlg fp-form' });
    const form = mk('form', { method: 'dialog', className: 'fp-dlg-form', style: 'min-width:460px' });
    form.append(mk('h3', { className: 'fp-dlg-title', textContent: '变量 › 数据组' }));
    const top = mk('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:8px' });
    const sel = mk('select', { style: 'flex:1' });
    const bPrev = mk('button', { type: 'button', textContent: '◀', title: '上一个数据组' });
    const bNext = mk('button', { type: 'button', textContent: '▶', title: '下一个数据组' });
    const bNew = mk('button', { type: 'button', textContent: '新建', title: '基于当前文档状态创建新数据组' });
    const bDel = mk('button', { type: 'button', textContent: '删除', title: '删除此数据组' });
    const bImp = mk('button', { type: 'button', textContent: '导入…', title: '导入文本文件（CSV / TXT）' });
    const bExp = mk('button', { type: 'button', textContent: '导出…', title: '把数据组导出为 CSV' });
    top.append(mk('span', { textContent: '数据组：' }), sel, bPrev, bNext, bNew, bDel, bImp, bExp);
    const nameIn = mk('input', { type: 'text', style: 'flex:1' });
    const nameRow = mk('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:8px' }, mk('span', { textContent: '名称：', style: 'width:60px' }), nameIn);
    const table = mk('div', { style: 'display:flex;flex-direction:column;gap:4px;max-height:40vh;overflow:auto' });
    const imgRow = mk('div', { style: 'display:flex;gap:6px;align-items:center;margin-top:8px' });
    const bImgs = mk('button', { type: 'button', textContent: '选择像素替换用的图片…' });
    const imgNote = mk('span', { style: 'opacity:.7' });
    imgRow.append(bImgs, imgNote);
    const note = mk('div', { className: 'anote plain', style: 'margin-top:8px;opacity:.75', textContent: '改动立即预览到文档上。「确定」保留数据组与当前预览，「取消」全部撤回。' });
    const btns = mk('div', { className: 'fp-dlg-btns' });
    const cancel = mk('button', { type: 'button', className: 'fp-dlg-cancel', textContent: '取消' });
    const ok = mk('button', { type: 'button', className: 'fp-dlg-ok primary', textContent: '确定' });
    btns.append(cancel, ok);
    form.append(top, nameRow, table, imgRow, note, btns); d.append(form);
    document.body.append(d);
    const pixVars = S.vars.filter(v => v.type === 'pixel');
    imgRow.hidden = !pixVars.length;
    const syncImgNote = () => { imgNote.textContent = images.size ? `已选 ${images.size} 张图片` : '像素变量的值是图片文件名，需要先选图片'; };
    bImgs.onclick = async () => { await pickImages(); syncImgNote(); preview(); };
    const draw = () => {
      sel.textContent = '';
      S.dataSets.forEach((ds, k) => sel.append(mk('option', { value: k, textContent: ds.name })));
      if (!S.dataSets.length) sel.append(mk('option', { value: -1, textContent: '（无数据组：点「新建」）' }));
      sel.value = S.cur;
      const ds = S.dataSets[S.cur];
      nameIn.value = ds ? ds.name : ''; nameIn.disabled = !ds; bDel.disabled = !ds; bPrev.disabled = bNext.disabled = S.dataSets.length < 2;
      table.textContent = '';
      for (const v of S.vars) {
        const row = mk('div', { style: 'display:flex;gap:6px;align-items:center' });
        row.append(mk('span', { textContent: v.name, style: 'width:140px;overflow:hidden;text-overflow:ellipsis', title: v.name }),
          mk('span', { textContent: v.type === 'visibility' ? '可见性' : v.type === 'text' ? '文本' : '像素', style: 'width:48px;opacity:.7' }));
        let el;
        const val = ds ? ds.values[v.name] : undefined;
        if (v.type === 'visibility') { el = mk('select'); el.append(mk('option', { value: 'true', textContent: '可见' }), mk('option', { value: 'false', textContent: '不可见' })); el.value = val === false ? 'false' : 'true'; el.onchange = () => { ds.values[v.name] = el.value === 'true'; preview(); }; }
        else { el = mk('input', { type: 'text', value: val ?? '', style: 'flex:1', placeholder: v.type === 'pixel' ? '图片文件名（如 photo1.jpg）' : '' }); el.onchange = () => { ds.values[v.name] = el.value; preview(); }; }
        el.disabled = !ds; row.append(el); table.append(row);
      }
      syncImgNote();
    };
    let busy = Promise.resolve();
    const preview = () => { busy = busy.then(async () => { const ds = S.dataSets[S.cur]; if (ds) await applyValues(ds.values, { noHistory: true }); C.refresh(); }); };
    sel.onchange = () => { S.cur = +sel.value; draw(); preview(); };
    bPrev.onclick = () => { S.cur = (S.cur - 1 + S.dataSets.length) % S.dataSets.length; draw(); preview(); };
    bNext.onclick = () => { S.cur = (S.cur + 1) % S.dataSets.length; draw(); preview(); };
    bNew.onclick = () => { S.dataSets.push({ name: `数据组 ${S.dataSets.length + 1}`, values: currentValues() }); S.cur = S.dataSets.length - 1; S.dirty = true; draw(); };
    bDel.onclick = () => { S.dataSets.splice(S.cur, 1); S.cur = Math.min(S.cur, S.dataSets.length - 1); S.dirty = true; draw(); preview(); };
    bImp.onclick = async () => { await importUI(); draw(); preview(); };
    bExp.onclick = () => { C.download(safe(C.docName().replace(/\.ps[db]$/i, '')) + '_数据组.csv', new Blob(['﻿' + dataSetsToDelimited(S.vars, S.dataSets)], { type: 'text/csv' })); };
    nameIn.onchange = () => { const ds = S.dataSets[S.cur]; if (ds && nameIn.value.trim()) { ds.name = nameIn.value.trim(); draw(); } };
    let done = false;
    const finish = async keep => {
      if (done) return; done = true; await busy;
      try { d.close(); } catch {} d.remove();
      if (!keep) { C.restore(docSnap); for (const b of backups) b(); C.dropHistory(); S = snap; } else S.dirty = true;
      C.refresh(); resolve(keep);
    };
    ok.onclick = () => finish(true); cancel.onclick = () => finish(false);
    d.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
    if (S.cur < 0 && S.dataSets.length) S.cur = 0;
    draw();
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
  });
}


function pickFiles(accept, multiple = false) {
  const hook = window.__psd_editorLayerB;
  if (hook && hook.files && hook.files[accept]) { const f = hook.files[accept]; delete hook.files[accept]; return Promise.resolve(f); }
  return new Promise(res => {
    const inp = mk('input', { type: 'file', accept, multiple });
    inp.onchange = () => res([...(inp.files || [])]); inp.addEventListener('cancel', () => res([]));
    inp.click();
  });
}
async function pickImages() {
  const fs = await pickFiles('image/*', true);
  for (const f of fs) images.set(base(f.name), f);
  return fs.length;
}
async function importUI() {
  if (!S.vars.length) { await C.alertDialog('先定义变量（图像 › 变量 › 定义…）再导入数据组：文本文件的第一行要与变量名对上。', { title: '导入数据组' }); return false; }
  const v = await C.formDialog('导入数据组', [
    { type: 'note', label: '点「确定」后选择文本文件（.csv / .txt）。第一行 = 变量名，之后每行一个数据组；逗号或制表符分隔。' },
    { key: 'first', label: '将第一列用作数据组名称', type: 'check', value: false },
    { key: 'replace', label: '替换现有的数据组', type: 'check', value: true },
    { key: 'enc', label: '编码', type: 'select', value: 'auto', options: [['auto', '自动'], ['utf-8', 'UTF-8'], ['gb18030', '简体中文（GB18030）'], ['windows-1252', 'Windows（西欧）'], ['macintosh', 'Mac OS（Roman）'], ['utf-16le', 'UTF-16']] },
  ]);
  if (!v) return false;
  const [f] = await pickFiles('.csv,.txt,text/csv,text/plain');
  if (!f) return false;
  const rows = parseDelimited(decodeText(new Uint8Array(await f.arrayBuffer()), v.enc));
  const { dataSets, unknown } = rowsToDataSets(rows, S.vars, { firstColName: !!v.first });
  if (!dataSets.length) { await C.alertDialog('文件里没有数据组（第一行之后没有数据行）。', { title: '导入数据组' }); return false; }
  C.history('导入数据组');
  if (v.replace) S.dataSets = dataSets; else S.dataSets.push(...dataSets);
  S.cur = S.dataSets.length ? (v.replace ? 0 : S.dataSets.length - dataSets.length) : -1; S.dirty = true;
  
  const needs = new Set(); for (const d of dataSets) for (const x of S.vars) if (x.type === 'pixel' && d.values[x.name]) needs.add(base(d.values[x.name]));
  const lacking = [...needs].filter(n => !images.has(n));
  if (lacking.length && await C.confirmDialog(`数据组里的像素变量引用了 ${lacking.length} 张图片（如「${lacking[0]}」）。浏览器拿不到本机路径：现在选择这些图片吗？（按文件名对上）`, { title: '导入数据组', okText: '选择图片…' })) await pickImages();
  C.status(`导入了 ${dataSets.length} 个数据组${unknown.length ? `；文件里这些列没有对应变量，已忽略：${unknown.join('、')}` : ''}`);
  return dataSets.length;
}


async function dataSetsAsFilesUI() {
  if (!S.dataSets.length) { await C.alertDialog('还没有数据组。', { title: '将数据组导出为文件' }); return false; }
  const stem = safe(C.docName().replace(/\.ps[db]$/i, ''));
  const v = await C.formDialog('将数据组导出为文件', [
    { key: 'which', label: '数据组', type: 'select', value: 'all', options: [['all', '所有数据组'], ...S.dataSets.map((d, k) => [String(k), d.name])] },
    { key: 'naming', label: '文件命名', type: 'select', value: 'docSet', options: [['docSet', '文档名称 + 数据组名称'], ['set', '数据组名称'], ['docNum', '文档名称 + 序号（1、2、3…）'], ['docNum3', '文档名称 + 序号（001、002…）']] },
    { key: 'fmt', label: '存储为', type: 'select', value: 'psd', options: [['psd', 'Photoshop (PSD)'], ['png', 'PNG'], ['jpg', 'JPEG']] },
    { key: 'q', label: 'JPEG 品质', type: 'number', value: 10, min: 0, max: 12, showIf: o => o.fmt === 'jpg' },
  ], { okText: '确定' });
  if (!v) return false;
  const list = v.which === 'all' ? S.dataSets.map((_, k) => k) : [+v.which];
  const q = Math.round(v.q / 12 * 100);
  const pixIdx = [...new Set(S.vars.filter(x => x.type === 'pixel').map(x => C.indexOfKey(x.key)).filter(i => i >= 0))];
  const backups = pixIdx.map(i => C.pixelBackup(i));
  const snap = C.snapshot(), cur = S.cur;
  const files = [], problems = [];
  C.histLock(true);
  try {
    for (let n = 0; n < list.length; n++) {
      const k = list[n], ds = S.dataSets[k];
      C.restore(snap);
      const miss = await applyDataSet(k, { noHistory: true, quiet: true });
      if (miss.length) problems.push(`${ds.name}：${miss.join('；')}`);
      await C.settle();
      const nm = v.naming === 'set' ? safe(ds.name) : v.naming === 'docSet' ? `${stem}_${safe(ds.name)}` : v.naming === 'docNum' ? `${stem}_${n + 1}` : `${stem}_${String(n + 1).padStart(3, '0')}`;
      const bytes = await C.exportBytes(v.fmt, q);
      files.push({ name: `${nm}.${v.fmt}`, data: bytes });
      C.status(`数据组作为文件：${n + 1} / ${list.length}`);
    }
  } finally {
    C.restore(snap); for (const b of backups) b(); C.histLock(false); S.cur = cur; C.refresh();
  }
  C.download(stem + '_数据组.zip', new Blob([C.makeZip(files)], { type: 'application/zip' }));
  VARS._lastFiles = files.map(f => ({ name: f.name, size: f.data.length })); VARS._lastBytes = files;   
  if (problems.length) await C.alertDialog('以下数据组没能完全套用：\n· ' + problems.join('\n· '), { title: '将数据组导出为文件' });
  C.status(`已导出 ${files.length} 个文件`);
  return files.length;
}

export function installVariables(ctx) {
  C = ctx;
  const { R } = ctx;
  const has = () => C.hasDoc();
  R('image.variables.define', () => defineUI(), () => has() && C.selected().length > 0, { why: () => has() ? '先在图层面板里选中一个图层' : '先打开一个文档' });
  R('image.variables.dataSets', () => dataSetsUI(), () => has() && S.vars.length > 0, { why: () => '这个文档还没有定义变量（图像 › 变量 › 定义…）' });
  R('image.applyDataSet', () => applyDataSetUI(), () => has() && S.dataSets.length > 0, { why: () => '还没有数据组（图像 › 变量 › 数据组… / 文件 › 导入 › 变量数据组…）' });
  R('file.importDataSets', () => importUI(), () => has() && S.vars.length > 0, { why: () => '先定义变量（图像 › 变量 › 定义…）' });
  R('file.dataSetsAsFiles', () => dataSetsAsFilesUI(), () => has() && S.dataSets.length > 0, { why: () => '还没有数据组' });
  return { VARS, defineUI, applyDataSet, importUI, dataSetsAsFilesUI, images };
}
