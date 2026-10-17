
import * as store from './preset-store.js';
import { DEFAULT_GROUP_LAYOUT, DEFAULT_PANEL_PACKS, defaultPresetGroup } from './photoshop-default-groups.js';

const MANIFEST_URL = '/assets/ps-presets/manifest.json';
let manifestPromise;
const inflight = new Map();
export const photoshopPresetName = name => String(name || '').replace(/^\$\$\$\/[^=]*=/, '');
const PACK_NAMES = {
  'default-brushes': '默认画笔', 'default-custom-shapes': '默认形状', 'default-filter-colors': '照片滤镜颜色',
  'default-gradients': '默认渐变', 'default-patterns': '默认图案', 'default-styles': '默认样式',
  'default-swatches': '默认色板', 'default-tool-presets': '默认工具预设', 'default-actions': '默认动作', essentials: '基础动作',
  'legacy-gradients': '旧版渐变', 'legacy-patterns-and-more': '旧版图案及其他', 'legacy-shapes-and-more': '旧版形状及其他',
  'legacy-styles-and-more': '旧版样式及其他', 'legacy-swatches': '旧版色板',
  'preset-brushes-legacy-brushes': '旧版画笔', 'preset-brushes-converted-legacy-tool-presets': '旧版工具转换画笔',
};
const packLabel = pack => PACK_NAMES[pack.id] || pack.name;
export function photoshopPresetManifest() {
  if (!manifestPromise) manifestPromise = fetch(MANIFEST_URL).then(r => {
    if (!r.ok) throw new Error('PS 预设目录载入失败（' + r.status + '）');
    return r.json();
  }).then(m => {
    if (m.schemaVersion !== 1 || !Array.isArray(m.packs)) throw new Error('PS 预设目录格式不支持');
    return m;
  }).catch(e => { manifestPromise = null; throw e; });
  return manifestPromise;
}

export async function decodePhotoshopPresetPack(pack, bytes) {
  let items, patterns = [], warnings = [];
  switch (pack.kind) {
    case 'brushes': {
      const { readAbr } = await import('../../core/abr.js');
      const r = readAbr(bytes); items = r.brushes; patterns = r.patterns; warnings = r.warnings;
      break;
    }
    case 'toolPresets': {
      const { readTpl } = await import('../../core/tpl.js');
      const r = readTpl(bytes); items = r.presets; patterns = r.patterns; warnings = r.warnings;
      break;
    }
    case 'swatches': {
      const { readSwatchFile } = await import('../../core/swatches.js'); items = readSwatchFile(bytes, pack.sourceFile); break;
    }
    case 'gradients': { const { readGrd } = await import('../../core/grd.js'); items = readGrd(bytes); break; }
    case 'shapes': { const { readCsh } = await import('../../core/csh.js'); items = readCsh(bytes); break; }
    case 'patterns': { const { readPat } = await import('../../core/pat.js'); items = readPat(bytes); break; }
    case 'styles': {
      const { readAsl, effectsToBytes, effectPatternIds } = await import('../../core/asl.js');
      const r = readAsl(bytes); patterns = r.patterns; warnings = r.warnings;
      items = r.styles.map(s => ({ id: s.id, name: s.name, effectsBytes: effectsToBytes(s.effects), patternIds: effectPatternIds(s.effects) }));
      break;
    }
    case 'actions': {
      const { parseAtn } = await import('../../core/atn.js');
      const set = parseAtn(bytes); items = [{ name: set.name, atn: bytes }]; break;
    }
    default: throw new Error('未知的 PS 预设类型');
  }
  warnings = [...warnings, ...(items.warnings || [])];
  const clean = items.filter(item => item.unsupported == null && !item.missing);
  if (clean.length !== items.length) warnings.push(`跳过 ${items.length - clean.length} 个当前不能使用的预设`);
  
  const stable = (item, i, kind) => ({ ...item, originalName: item.name, name: photoshopPresetName(item.name), id: kind === 'patterns' && item.id ? item.id : `ps:${pack.id}:${i}` });
  const groupName = ['swatches', 'gradients', 'patterns'].includes(pack.kind) ? packLabel(pack) : 'PS · ' + packLabel(pack);
  const batches = [{ kind: pack.kind, groupName, items: clean.map((x, i) => stable(x, items.indexOf(x), pack.kind)) }];
  if (DEFAULT_PANEL_PACKS.has(pack.id)) {
    batches.length = 0;
    for (const item of clean) {
      const index = items.indexOf(item), name = defaultPresetGroup(pack.id, index, photoshopPresetName(item.name));
      let batch = batches.find(b => b.groupName === name);
      if (!batch) { batch = { kind: pack.kind, groupName: name, groupKey: 'default:' + name, collapsed: batches.length > 0, items: [] }; batches.push(batch); }
      batch.items.push(stable(item, index, pack.kind));
    }
  }
  if (patterns.length) batches.unshift({ kind: 'patterns', groupName: groupName + ' · 纹理', items: patterns.map((p, i) => stable(p, i, 'patterns')) });
  return { batches, warnings };
}

export async function loadPhotoshopPresetPack(pack, { restore = false } = {}) {
  if (inflight.has(pack.id)) return inflight.get(pack.id);
  const run = (async () => {
    if (!restore && await store.presetPackInstalled(pack.kind, pack.id, pack.sha256, DEFAULT_PANEL_PACKS.has(pack.id) ? DEFAULT_GROUP_LAYOUT : 0)) return { added: 0, alreadyInstalled: true, warnings: [] };
    const response = await fetch(pack.url);
    if (!response.ok) throw new Error('资源包载入失败（' + response.status + '）');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== pack.byteLength) throw new Error('预设资源包长度不匹配');
    if (globalThis.crypto?.subtle && pack.sha256) {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (hash !== pack.sha256) throw new Error('预设资源包校验失败');
    }
    const { batches, warnings } = await decodePhotoshopPresetPack(pack, bytes);
    if (!batches.some(b => b.kind === pack.kind && b.items.length)) throw new Error('此资源包尚没有可用预设');
    return { ...await store.installPresetPack(pack, batches, { restore, layoutVersion: DEFAULT_PANEL_PACKS.has(pack.id) ? DEFAULT_GROUP_LAYOUT : 0 }), warnings };
  })();
  inflight.set(pack.id, run);
  try { return await run; } finally { inflight.delete(pack.id); }
}

export async function seedPhotoshopPresets() {
  const m = await photoshopPresetManifest(), errors = [];
  
  for (const pack of m.packs) if ((DEFAULT_PANEL_PACKS.has(pack.id) || (pack.default && pack.byteLength <= 4 * 1024 * 1024 && !['swatches', 'gradients', 'patterns', 'actions'].includes(pack.kind))) && pack.count && pack.unsupportedCount < pack.count) {
    try { await loadPhotoshopPresetPack(pack); } catch (e) { errors.push(pack.name + '：' + e.message); }
  }
  return errors;
}

const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
export async function openPhotoshopPresetLibrary(startKind = '', { status = () => {}, onLoaded = async () => {} } = {}) {
  document.querySelector('dialog.ps-preset-library')?.remove();
  const d = mk('dialog', { className: 'fp-dlg ps-preset-library' });
  d.style.cssText = 'width:min(800px,90vw);max-height:85vh';
  const form = mk('div', { className: 'fp-dlg-form' });
  const kind = mk('select'), search = mk('input', { type: 'search', placeholder: '搜索预设库或预设名称…' });
  kind.append(mk('option', { value: '', textContent: '全部类型' }));
  for (const k of store.PRESET_KINDS) kind.append(mk('option', { value: k, textContent: store.PRESET_KIND_LABEL[k] }));
  kind.value = startKind;
  const bar = mk('div'); bar.style.cssText = 'display:flex;gap:12px;margin:12px 0'; search.style.flex = '1'; bar.append(kind, search);
  const list = mk('div'); list.style.cssText = 'max-height:55vh;overflow:auto';
  const message = mk('div', { className: 'anote plain', textContent: '正在读取预设目录…' });
  message.setAttribute('role', 'status');
  const buttons = mk('div', { className: 'fp-dlg-btns' }), close = mk('button', { type: 'button', textContent: '完成' });
  close.onclick = () => { d.close(); d.remove(); }; buttons.append(close);
  form.append(mk('h3', { className: 'fp-dlg-title', textContent: 'PS 自带预设' }), bar, list, message, buttons); d.append(form);
  d.oncancel = e => { e.preventDefault(); close.click(); };
  document.body.append(d); try { d.showModal(); } catch { d.setAttribute('open', ''); }
  let manifest;
  let drawRevision = 0;
  const draw = async () => {
    if (!manifest) return;
    const revision = ++drawRevision, fragment = document.createDocumentFragment();
    const q = search.value.trim().toLowerCase(), selectedKind = kind.value;
    for (const pack of manifest.packs) {
      if (selectedKind && pack.kind !== selectedKind) continue;
      if (q && ![packLabel(pack), pack.name, ...(pack.items || []).map(x => x.name)].some(n => String(n).toLowerCase().includes(q))) continue;
      const row = mk('div'); row.dataset.pack = pack.id;
      row.style.cssText = 'padding:12px 4px;border-bottom:1px solid #555';
      const top = mk('div'); top.style.cssText = 'display:flex;align-items:center;gap:12px';
      const installed = await store.presetPackInstalled(pack.kind, pack.id, pack.sha256, DEFAULT_PANEL_PACKS.has(pack.id) ? DEFAULT_GROUP_LAYOUT : 0);
      const label = mk('strong', { textContent: packLabel(pack), title: pack.name }); label.style.flex = '1';
      const info = mk('span', { textContent: `${store.PRESET_KIND_LABEL[pack.kind]} · ${pack.count} 项 · ${(pack.byteLength / 1048576).toFixed(1)} MB` });
      const load = mk('button', { type: 'button', textContent: installed ? '补回已删除预设' : '载入' });
      load.disabled = !pack.count || !!pack.error || pack.unsupportedCount >= pack.count;
      load.onclick = async () => {
        load.disabled = true; message.textContent = '正在载入 ' + packLabel(pack) + '…';
        try {
          const r = await loadPhotoshopPresetPack(pack, { restore: true });
          await onLoaded(pack);
          message.textContent = `已添加 ${r.added} 项（含依赖图案）` + (r.warnings.length ? '；' + r.warnings.join('；') : '');
          status(message.textContent); await draw();
        } catch (e) { message.textContent = '载入失败：' + e.message; load.disabled = false; }
      };
      top.append(label, info, load); row.append(top);
      const notes = [];
      if (pack.unsupportedCount) notes.push(`${pack.unsupportedCount} 项暂不支持，载入时跳过`);
      if (pack.kind === 'actions') notes.push('包含尚未支持的动作步骤，播放前会检查并提示。');
      if (pack.kind === 'brushes') {
        const approximate = (pack.items || []).filter(x => x.approximate).length;
        if (approximate) notes.push(`${approximate} 个特殊笔尖采用近似绘制，列表中已标注`);
      }
      if (pack.kind === 'swatches') notes.push('保留原始颜色数值；CMYK、Lab 色板的预览使用通用颜色转换。');
      if (pack.error) notes.push('此库暂时无法解析。');
      if (notes.length) { const note = mk('div', { textContent: notes.join('；') }); note.style.cssText = 'font-size:12px;opacity:.8;margin-top:6px'; row.append(note); }
      fragment.append(row);
    }
    if (revision !== drawRevision) return;
    if (!fragment.children.length) fragment.append(mk('p', { textContent: '没有匹配的预设库' }));
    list.replaceChildren(fragment);
  };
  kind.onchange = draw; search.oninput = draw;
  try {
    manifest = await photoshopPresetManifest();
    message.textContent = '默认小型库已自动添加。其余库按需载入；重复载入保留已有名称和修改。'; await draw();
  } catch (e) { message.textContent = e.message; }
  return d;
}
