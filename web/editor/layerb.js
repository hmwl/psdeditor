










import { installMeasure, MEASURE } from './measure.js';
import { actions } from './actions.js';
import { recentFiles } from './recent-files.js';
import { menu } from './menu.js';
import { shortcuts } from './shortcuts.js';
import { parseImageResources, resourceHandler } from '../../core/psd-resources.js';
import { writeImageResource, removeImageResource } from '../../core/psd-write.js';
import { parsePsdFull } from '../../core/psd-parse.js';
import { layerIdsOf } from '../../core/psd-links.js';
import { parseLinkedRecords } from '../../core/psd-linked-so.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const safe = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
let C = null;


function fileInfo(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let resources = [];
  try {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 26; o += 4 + dv.getUint32(o);
    const len = dv.getUint32(o);
    resources = parseImageResources(u8.subarray(o + 4, o + 4 + len)) || [];
  } catch {}
  let layers = [];
  try {
    const full = parsePsdFull(buf instanceof ArrayBuffer ? buf : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    layers = full.layers.map((L, i) => {
      const id = (L.blocks || []).find(b => b.key === 'lyid' && b.dataLength >= 4);
      const sh = (L.blocks || []).find(b => b.key === 'shmd');
      return { key: id ? 'id:' + dv.getUint32(id.dataOffset) : 'ix:' + i, shmd: sh ? u8.slice(sh.dataOffset, sh.dataOffset + sh.dataLength) : null };
    });
  } catch {}
  return { resources, layers };
}

function writeHelpers(h) {
  return {
    ...h,
    layerIdsOf: b => layerIdsOf(b),
    writeImageResource: (b, id, data) => writeImageResource(b, id, data),
    removeImageResource: (b, id) => { try { return removeImageResource(b, id); } catch { return b; } },
    resourceHandler,
    layersWithCmls: b => fileInfo(b).layers.map((L, i) => (L.shmd && hasCmls(L.shmd) ? i : -1)).filter(i => i >= 0),
  };
}
function hasCmls(shmd) {                                
  for (let i = 4; i + 8 <= shmd.length; i++) if (shmd[i] === 0x38 && shmd[i + 1] === 0x42 && shmd[i + 2] === 0x49 && shmd[i + 3] === 0x4d && shmd[i + 4] === 0x63 && shmd[i + 5] === 0x6d && shmd[i + 6] === 0x6c && shmd[i + 7] === 0x73) return true;
  return false;
}
const ext = (key, label, M) => ({
  key, label, capture: () => M.capture(), apply: v => M.apply(v), snap: () => M.snap(), restore: v => M.restore(v),
  load: buf => M.load(buf, fileInfo(buf)), needsWrite: () => M.needsWrite(),
  writeInto: (buf, h) => M.writeInto(buf, writeHelpers(h)),
  dirty: () => (M.dirty ? M.dirty() : false),
});
export const DOC_EXT = [ext('measure', '测量比例', MEASURE)];



let extrasP = null;
export function loadLayerBExtras() {
  return extrasP || (extrasP = Promise.all([import('./layer-comps-panel.js'), import('./variables-ui.js'), import('./save-for-web.js')])
    .then(([lc, vu, sw]) => {
      if (!DOC_EXT.some(e => e.key === 'layerComps')) DOC_EXT.splice(0, 0, ext('layerComps', '图层复合', lc.LC), ext('variables', '变量与数据组', vu.VARS));
      lc.installLayerComps(C); vu.installVariables(C); sw.installSaveForWeb(C);
    })
    .catch(e => { extrasP = null; throw e; }));
}



export const recent = {
  add: file => recentFiles.add(file),
  list: () => recentFiles.items(),
  async open(id) {
    const file = await recentFiles.get(id);
    if (!file) { await C.alertDialog('没有保存这个文件的副本，请用「文件 › 打开…」重新选择。', { title: '最近打开文件' }); return false; }
    return C.openFile(file);
  },
  async clear() { await recentFiles.clear(); C.status('已清除最近的文件列表'); },
};






function pdfStr(s) {
  if (s == null) return '';
  if (s.startsWith('<')) {                                  
    const hx = s.slice(1, -1).replace(/\s/g, ''); const b = []; for (let i = 0; i < hx.length; i += 2) b.push(parseInt(hx.substr(i, 2).padEnd(2, '0'), 16));
    if (b[0] === 0xfe && b[1] === 0xff) { let t = ''; for (let i = 2; i + 1 < b.length; i += 2) t += String.fromCharCode((b[i] << 8) | b[i + 1]); return t; }
    return String.fromCharCode(...b);
  }
  let t = s.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (m, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c] ?? (/^[0-7]/.test(c) ? String.fromCharCode(parseInt(c, 8)) : '')));
  if (t.charCodeAt(0) === 0xfe && t.charCodeAt(1) === 0xff) { let u = ''; for (let i = 2; i + 1 < t.length; i += 2) u += String.fromCharCode((t.charCodeAt(i) << 8) | t.charCodeAt(i + 1)); t = u; }
  return t;
}

function pdfVal(dict, key) {
  const mm = new RegExp(key.replace('/', '\\/') + '(?![A-Za-z0-9#_.-])').exec(dict); if (!mm) return null;   
  let i = mm.index + key.length; while (/\s/.test(dict[i])) i++;
  const c = dict[i];
  if (c === '(') { let d = 0, j = i; for (; j < dict.length; j++) { if (dict[j] === '\\') { j++; continue; } if (dict[j] === '(') d++; else if (dict[j] === ')' && --d === 0) break; } return dict.slice(i, j + 1); }
  if (c === '<' && dict[i + 1] !== '<') return dict.slice(i, dict.indexOf('>', i) + 1);
  if (c === '[') return dict.slice(i, dict.indexOf(']', i) + 1);
  const m = dict.slice(i).match(/^[^\s/<>[\]()]+|^\/[^\s/<>[\]()]+/); return m ? m[0] : null;
}
async function inflate(u8) { try { const ds = new DecompressionStream('deflate'); return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer()); } catch { return null; } }
const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return s; };
export async function parseNotesFile(bytes, name) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = latin1(u8.subarray(0, 64));
  const notes = [];
  if (/^\s*<\?xml|<xfdf/i.test(head) || /\.xfdf$/i.test(name)) {
    const dom = new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');
    for (const el of dom.getElementsByTagName('text')) {
      const r = (el.getAttribute('rect') || '0,0,0,0').split(',').map(Number);
      const col = el.getAttribute('color') || '#ffff00';
      notes.push({ x: Math.min(r[0], r[2]), y: Math.max(r[1], r[3]), text: (el.getElementsByTagName('contents')[0] || {}).textContent || '', author: el.getAttribute('title') || '', color: [1, 3, 5].map(k => parseInt(col.slice(k, k + 2), 16)), page: +(el.getAttribute('page') || 0) });
    }
    return { notes, pageW: null, pageH: null };
  }
  let text = latin1(u8);
  
  const re = /\/FlateDecode[\s\S]{0,200}?stream\r?\n/g; let m; const extra = [];
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length, end = text.indexOf('endstream', start); if (end < 0) break;
    const out = await inflate(u8.subarray(start, end)); if (out) extra.push(latin1(out));
  }
  text += '\n' + extra.join('\n');
  const mb = text.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
  const pageW = mb ? +mb[3] - +mb[1] : null, pageH = mb ? +mb[4] - +mb[2] : null;
  const dre = /\/Subtype\s*\/Text\b/g;
  while ((m = dre.exec(text))) {
    
    let a = m.index, depth = 0;
    for (; a > 1; a--) { if (text[a] === '>' && text[a - 1] === '>') { depth++; a--; } else if (text[a] === '<' && text[a - 1] === '<') { if (depth === 0) { a--; break; } depth--; a--; } }
    let b = m.index; depth = 1;
    for (; b < text.length - 1; b++) { if (text[b] === '<' && text[b + 1] === '<') { depth++; b++; } else if (text[b] === '>' && text[b + 1] === '>') { if (--depth === 0) { b += 2; break; } b++; } }
    const dict = text.slice(a, b);
    const rect = (pdfVal(dict, '/Rect') || '[0 0 0 0]').replace(/[[\]]/g, '').trim().split(/\s+/).map(Number);
    const col = (pdfVal(dict, '/C') || '[1 1 0]').replace(/[[\]]/g, '').trim().split(/\s+/).map(Number);
    notes.push({ x: Math.min(rect[0], rect[2]), y: Math.max(rect[1], rect[3]), text: pdfStr(pdfVal(dict, '/Contents')), author: pdfStr(pdfVal(dict, '/T')), color: col.length >= 3 ? col.slice(0, 3).map(v => Math.round(v * 255)) : [255, 255, 0] });
  }
  return { notes, pageW, pageH };
}
async function importNotesUI() {
  const hook = window.__psd_editorLayerB;
  let f = hook && hook.notesFile; if (f) hook.notesFile = null;
  if (!f) f = await new Promise(res => { const inp = mk('input', { type: 'file', accept: '.pdf,.fdf,.xfdf' }); inp.onchange = () => res(inp.files[0] || null); inp.addEventListener('cancel', () => res(null)); inp.click(); });
  if (!f) return false;
  const { notes, pageW, pageH } = await parseNotesFile(new Uint8Array(await f.arrayBuffer()), f.name);
  if (!notes.length) { await C.alertDialog(`「${f.name}」里没有找到注释（附注）。`, { title: '导入注释' }); return false; }
  const st = C.st(), dpi = C.resolution();
  const map = n => pageW && pageH ? { x: n.x * st.docW / pageW, y: (pageH - n.y) * st.docH / pageH } : { x: n.x * dpi / 72, y: st.docH - n.y * dpi / 72 };
  const k = C.addNotes(notes.map(n => ({ ...n, ...map(n) })));
  C.status(`已导入 ${k} 条注释`);
  return k;
}





async function packageUI() {
  const v = await C.formDialog('打包', [
    { type: 'note', label: '把文档、它链接的外部文件和用到的字体清单打成一个 zip。' },
    { key: 'fonts', label: '包含字体清单', type: 'check', value: true },
  ], { okText: '打包' });
  if (!v) return false;
  const stem = safe(C.docName().replace(/\.ps[db]$/i, ''));
  const psd = await C.exportPsdBytes();
  const files = [{ name: `${stem}/${stem}.psd`, data: psd }], report = [`打包：${C.docName()}`, `时间：${new Date().toLocaleString()}`, ''];
  let links = [];
  try { links = parseLinkedRecords(psd).filter(r => r.type === 'liFE'); } catch {}
  const used = new Set();
  for (const r of links) {
    let nm = safe(r.name || (r.link && r.link.name) || 'link'); while (used.has(nm)) nm = '_' + nm; used.add(nm);
    if (r.data && r.data.length) { files.push({ name: `${stem}/Links/${nm}`, data: r.data }); report.push(`链接文件：${nm}（${r.data.length} 字节）`); }
    else report.push(`缺失：${nm} —— 文件里没有它的缓存副本（原路径 ${(r.link && (r.link.fullPath || r.link.originalPath)) || '未知'}），请手动放进 Links 文件夹`);
  }
  if (!links.length) report.push('没有链接的外部文件（内嵌的智能对象已在 PSD 里）。');
  if (v.fonts) {
    const fonts = C.fonts();
    const lines = fonts.length ? fonts.map(f => `${f.name}（${f.ps}）　用在：${f.layers.join('、')}`) : ['（没有文字图层）'];
    files.push({ name: `${stem}/字体清单.txt`, data: new TextEncoder().encode('﻿' + lines.join('\r\n')) });
    report.push('', `字体：${fonts.length} 种（见 字体清单.txt）`);
  }
  files.push({ name: `${stem}/打包报告.txt`, data: new TextEncoder().encode('﻿' + report.join('\r\n')) });
  C.download(`${stem}.zip`, new Blob([C.makeZip(files)], { type: 'application/zip' }));
  packageUI.last = files.map(f => f.name);
  C.status(`已打包：${files.length} 个文件`);
  return files.length;
}








const ASSET_RE = /^(?:(\d+(?:\.\d+)?)%\s+|(\d+|\?)(?:px)?\s*x\s*(\d+|\?)(?:px)?\s+)?([^,]+?\.(png8|png24|png32|png|jpe?g\d*%?|gif|webp))$/i;
export function parseAssetSpecs(name) {
  const out = [];
  for (const part of String(name || '').split(',')) {
    const m = part.trim().match(ASSET_RE); if (!m) continue;
    const [, pct, w, h, file, ext0] = m;
    const ext = ext0.toLowerCase(); let fmt = 'png24', q = 90;
    if (ext === 'png8') fmt = 'png8'; else if (/^jpe?g/.test(ext)) { fmt = 'jpg'; const n = ext.match(/(\d+)(%?)$/); if (n) q = n[2] ? Math.min(100, +n[1]) : Math.min(10, +n[1]) * 10; }
    else if (ext === 'gif') fmt = 'gif'; else if (ext === 'webp') fmt = 'webp';
    const outName = file.replace(/\.(png8|png24|png32|jpe?g\d+%?)$/i, (x, e) => /^png/i.test(e) ? '.png' : '.jpg');
    out.push({ file: outName.replace(/\\/g, '/').replace(/(^|\/)\.\.(\/|$)/g, '$1_$2'), fmt, q, scale: pct ? +pct / 100 : null, w: w && w !== '?' ? +w : null, h: h && h !== '?' ? +h : null });
  }
  return out;
}
let genOn = false;
async function generateAssets(silent = false) {
  const jobs = [];
  for (const L of C.layers()) { const specs = parseAssetSpecs(L.name); if (specs.length) jobs.push({ L, specs }); }
  if (!jobs.length) { if (!silent) await C.alertDialog('没有要生成的资源：把图层或组的名字改成文件名（如「hero.png」「icon.jpg80%」「200% logo@2x.png」），开着「生成 › 图像资源」时就会自动导出。', { title: '生成图像资源' }); return 0; }
  const files = [], stem = safe(C.docName().replace(/\.ps[db]$/i, ''));
  for (const { L, specs } of jobs) {
    const src = L.isGroup ? await groupCanvas(L.i) : (() => { const px = C.layerPixels(L.i); return px ? C.pixelsToCanvas(px) : null; })();
    if (!src) continue;
    for (const s of specs) {
      let w = src.width, h = src.height;
      if (s.scale) { w = Math.round(w * s.scale); h = Math.round(h * s.scale); }
      else if (s.w || s.h) { w = s.w || Math.round(src.width * s.h / src.height); h = s.h || Math.round(src.height * s.w / src.width); }
      const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
      let bytes;
      if (s.fmt === 'webp') bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/webp', s.q / 100))).arrayBuffer());
      else bytes = (await (await import('./save-for-web.js')).encodeWeb(c, { fmt: s.fmt, quality: s.q, blur: 0, matte: '#ffffff', palette: 'selective', colors: 256, dither: 'diffusion', amount: 100, transparency: true, interlace: false })).bytes;
      files.push({ name: `${stem}-assets/${s.file}`, data: bytes });
    }
  }
  if (!files.length) return 0;
  C.download(`${stem}-assets.zip`, new Blob([C.makeZip(files)], { type: 'application/zip' }));
  generateAssets.last = files.map(f => f.name);
  C.status(`已生成 ${files.length} 个图像资源`);
  return files.length;
}
async function groupCanvas(i) {
  const ids = new Set(C.groupBlock(i)); const snap = C.snapshot(); C.histLock(true);
  try {
    for (const L of C.layers()) if (!ids.has(L.i) && C.layerState(L.i).v && !L.isGroup) C.setVisible(L.i, false);
    for (const L of C.layers()) if (L.isGroup && !ids.has(L.i) && C.layerState(L.i).v && !C.groupBlock(L.i).some(k => ids.has(k))) C.setVisible(L.i, false);
    await C.settle();
    const cv = C.compositeCanvas(), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1; c.getContext('2d').drawImage(cv, -x0, -y0);
    return c;
  } finally { C.restore(snap); C.histLock(false); C.refresh(); }
}


export function installLayerB(ctx) {
  C = ctx;
  const { R } = ctx;
  actions.registerLazy(['file.artboardsToPdf', 'file.layerCompsToFiles', 'file.layerCompsToPdf',
    'file.dataSetsAsFiles', 'file.importDataSets', 'image.applyDataSet', 'image.variables.dataSets', 'image.variables.define',
    'file.exportPrefs', 'file.saveForWeb'], loadLayerBExtras, { enabled: () => false, why: () => '先打开一个文档' });
  const meas = installMeasure(ctx);
  try { shortcuts.bind('Shift+Mod+M', 'image.analysis.record'); } catch {}
  R('tool.ruler', () => C.selectTool('ruler')); R('tool.count', () => C.selectTool('count'));   
  
  R('file.importNotes', () => importNotesUI(), () => C.hasDoc(), { why: () => '先打开一个文档' });
  R('file.package', () => packageUI(), () => C.hasDoc(), { why: () => '先打开一个文档' });
  R('file.generateAssets', async () => { genOn = !genOn; if (genOn) { const n = await generateAssets(); if (!n) genOn = false; } else C.status('已关闭：生成图像资源'); },
    () => C.hasDoc(), { checked: () => genOn, why: () => '先打开一个文档' });
  return {
    meas, recent, loadExtras: loadLayerBExtras, parseNotesFile, parseAssetSpecs, generateAssets, packageUI, importNotesUI,
    
    afterSave: () => { if (genOn) generateAssets(true); },
    measure: MEASURE, ctx: C,
  };
}
