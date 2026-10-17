




import './48-info-export.js';   
import { readFontNames, splitFonts, woffTables, buildSfnt, fontKind } from '../../../core/font-sfnt.js';
import { decodeWoff2, woff2Payload } from '../../../core/woff2.js';
import { getTextRuns, remapRunSpans } from '../../../core/psd-text.js';
import { segApply, otFeatureCss, isParaKey } from '../../../core/text-styles.js';
import { warpMap } from '../../../core/text-warp.js';
import { CP_PARA_EXTRA_KEYS } from '../text-para-keys.js';
import { $, bakeSourceRaster } from './01-boot.js';
import {
  doc, docH, docW, fontCache, layerTextEdits, layerTransforms, layerTree, textCrops, textFontSubst, textOverlay,
  textRenders, textStyleEdits,
} from './02-doc-state.js';
import { pushDocHistory } from './03-history.js';
import { docResolution } from './08-doc-size.js';
import {
  fontFamilyLabel, setTextRanges, stripTextRanges, syncTextBar, textEditTargets, textEffSegs, textInfoOf,
  textRangesOf,
} from './09-text-tool.js';
import { layerCanvasCache, renderLayerPanel, thumbCache } from './23-layers-panel.js';
import { renderProps } from './24-layer-ops-queue.js';
import { transformBase, transformChanged } from './28-layer-props-transform.js';
import { renderPreviewOnly, renderStaticLayers } from './30-render.js';
import { layoutInlineText } from './47-canvas-context-menu.js';
import { dispTextOf, fontSeq, set_fontSeq, textEditAbsorbs } from './48-info-export.js';
import {
  effTextDesc, effTextWarp, fontPreviewPx, textDescEdits, warpNumOf, warpStyleOf,
} from './52-alpha-text-menu.js';
import {
  CPP, drawTextGlyphwise, layoutTextFor, opticalKernOf, opticalKernReady, opticalKernSum, otFamilyAsync,
} from './57-layer-style-text-path.js';









let sysFonts = null;            
let sysFontsHow = '';           
let sysFontsPending = null;
const sysFontsListeners = new Set();
export const hasLocalFontApi = () => typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
export async function localFontPermission(){
  if (!hasLocalFontApi()) return 'unsupported';
  try { return (await navigator.permissions.query({ name: 'local-fonts' })).state; } catch { return 'prompt'; }
}
const FONT_PROBE = [
  
  'PingFang SC', 'PingFang TC', 'PingFang HK', 'Hiragino Sans GB', 'Heiti SC', 'Heiti TC', 'STHeiti', 'Songti SC', 'Songti TC', 'STSong',
  'Kaiti SC', 'STKaiti', 'Baoli SC', 'Libian SC', 'Weibei SC', 'Xingkai SC', 'Yuanti SC', 'Lantinghei SC', 'Hannotate SC', 'HanziPen SC',
  'Wawati SC', 'Yuppy SC', 'LingWai SC', 'Apple SD Gothic Neo', 'Hiragino Sans', 'Hiragino Mincho ProN', 'Hiragino Kaku Gothic ProN',
  
  'Helvetica', 'Helvetica Neue', 'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'Avenir', 'Avenir Next', 'Avenir Next Condensed',
  'Futura', 'Gill Sans', 'Optima', 'Palatino', 'Baskerville', 'Didot', 'Bodoni 72', 'Georgia', 'Times', 'Times New Roman', 'Courier', 'Courier New',
  'Menlo', 'Monaco', 'SF Pro', 'SF Pro Display', 'SF Pro Text', 'SF Pro Rounded', 'SF Mono', 'SF Compact', 'New York', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Impact', 'Comic Sans MS', 'American Typewriter', 'Chalkboard', 'Chalkboard SE', 'Copperplate', 'Papyrus', 'Rockwell', 'Marker Felt', 'Noteworthy',
  'Zapfino', 'Snell Roundhand', 'Brush Script MT', 'Luminari', 'Phosphate', 'Skia', 'Big Caslon', 'Hoefler Text', 'Charter', 'Iowan Old Style',
  'Seravek', 'Superclarendon', 'DIN Alternate', 'DIN Condensed', 'Andale Mono', 'Lucida Grande', 'Geneva', 'Cochin', 'Herculanum',
  'Party LET', 'Savoye LET', 'Trattatello', 'Bradley Hand', 'Chalkduster', 'Silom', 'Kefa', 'Sukhumvit Set',
  
  'Microsoft YaHei', 'Microsoft YaHei UI', 'Microsoft JhengHei', 'SimSun', 'NSimSun', 'SimHei', 'KaiTi', 'FangSong', 'DengXian', 'YouYuan', 'LiSu',
  'STXihei', 'STZhongsong', 'STFangsong', 'STXingkai', 'STCaiyun', 'STHupo', 'STLiti', 'STXinwei', 'FZShuTi', 'FZYaoTi', 'MingLiU', 'PMingLiU',
  'Segoe UI', 'Segoe Print', 'Segoe Script', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel', 'Franklin Gothic Medium',
  'Garamond', 'Bahnschrift', 'Century Gothic', 'Book Antiqua', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype', 'Sitka Text',
  'Yu Gothic', 'Meiryo', 'MS Gothic', 'MS Mincho', 'Malgun Gothic', 'Ebrima', 'Gadugi', 'Leelawadee UI', 'Nirmala UI', 'Sylfaen',
  
  'Noto Sans CJK SC', 'Noto Serif CJK SC', 'Noto Sans SC', 'Noto Serif SC', 'Source Han Sans SC', 'Source Han Serif SC', 'Source Han Sans CN',
  'Source Han Serif CN', 'Source Han Sans', 'Source Han Serif', '思源黑体', '思源宋体', 'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei',
  'Alibaba PuHuiTi', 'Alibaba PuHuiTi 2.0', 'Alibaba PuHuiTi 3.0', '阿里巴巴普惠体', 'HarmonyOS Sans SC', 'MiSans', 'OPPOSans', 'vivo Sans',
  'LXGW WenKai', '霞鹭文楷', 'Smiley Sans', '得意黑', 'ZCOOL KuaiLe', 'ZCOOL QingKe HuangYou', 'ZCOOL XiaoWei', '站酷快乐体', '站酷高端黑',
  '站酷庆科黄油体', '庞门正道标题体', '优设标题黑', '方正黑体简体', '方正书宋简体', '方正仿宋简体', '方正楷体简体', '方正兰亭黑简体',
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Inter', 'Ubuntu', 'DejaVu Sans', 'DejaVu Serif', 'Liberation Sans', 'Liberation Serif',
  'Oswald', 'Poppins', 'Raleway', 'Playfair Display', 'Bebas Neue', 'Fira Sans', 'JetBrains Mono', 'Source Sans Pro', 'Source Serif Pro',
  'Source Code Pro', 'Myriad Pro', 'Minion Pro', 'Adobe Heiti Std', 'Adobe Song Std', 'Adobe Kaiti Std', 'Adobe Fangsong Std',
];

function probeInstalledFonts(){
  let ctx = null;
  try { ctx = document.createElement('canvas').getContext('2d'); } catch {}
  if (!ctx || typeof ctx.measureText !== 'function') return [];
  const sample = 'mmmmmmmmmwwwwwlli10OQ永和国字体Aa', bases = ['monospace', 'serif', 'sans-serif'];
  const w0 = bases.map(b => { ctx.font = `72px ${b}`; return ctx.measureText(sample).width; });
  if (!w0.every(v => v > 0)) return [];
  const out = [], seen = new Set();
  for (const fam of FONT_PROBE) {
    if (seen.has(fam)) continue; seen.add(fam);
    const hit = bases.some((b, k) => { ctx.font = `72px "${fam}", ${b}`; return Math.abs(ctx.measureText(sample).width - w0[k]) > 0.5; });
    if (hit) out.push({ family: fam, style: 'Regular', fullName: fam, postscriptName: postScriptNameOf(fam), probed: true });
  }
  return out;
}




export function loadSystemFonts(opts = {}){
  if (sysFonts && (sysFontsHow === 'api' || !opts.gesture)) return Promise.resolve(sysFonts);
  if (sysFontsPending) return sysFontsPending;
  const useApi = list => {
    if (!list || !list.length) return false;
    const seen = new Set();
    sysFonts = [];
    for (const f of list) {
      if (!f.postscriptName || seen.has(f.postscriptName)) continue;
      seen.add(f.postscriptName);
      sysFonts.push({ family: f.family, style: f.style || 'Regular', fullName: f.fullName || f.family, postscriptName: f.postscriptName });
    }
    sysFontsHow = 'api';
    for (const k in fontCache) if (!fontCache[k].ok) delete fontCache[k];   
    for (const fn of sysFontsListeners) { try { fn(sysFonts); } catch {} }
    return true;
  };
  const run = async () => {
    if (hasLocalFontApi()) {
      
      let p = null;
      if (opts.gesture) { try { p = window.queryLocalFonts(); } catch (e) { p = Promise.reject(e); } }
      else if (await localFontPermission() === 'granted') { try { p = window.queryLocalFonts(); } catch (e) { p = null; } }
      if (p) {
        p.then(useApi, () => {});
        try {
          const list = await Promise.race([p, new Promise(res => setTimeout(() => res(null), opts.gesture ? 1500 : 4000))]);
          if (list && useApi(list)) return sysFonts;
        } catch {  }
      }
    }
    if (!sysFonts) { sysFonts = probeInstalledFonts(); sysFontsHow = 'probe'; }
    return sysFonts;
  };
  sysFontsPending = run().finally(() => { sysFontsPending = null; });
  return sysFontsPending;
}

export function fontFamilies(){
  const map = new Map();
  const sysPs = new Set((sysFonts || []).map(f => f.postscriptName.toLowerCase()));
  for (const f of [...(sysFonts || []), ...userFontRecs().filter(u => !sysPs.has(u.postscriptName.toLowerCase()))]) {
    if (!map.has(f.family)) map.set(f.family, []);
    map.get(f.family).push(f);
  }
  const rank = s => { const t = String(s).toLowerCase();
    if (/italic|oblique/.test(t)) return 3;
    if (/^(regular|normal|roman|book|plain)$/.test(t)) return 0;
    if (/^(medium|w3|w4|text)$/.test(t)) return 1;
    return 2; };
  const fams = [...map.entries()].map(([family, styles]) => ({ family, user: styles.some(s => s.user), styles: styles.sort((a, b) => rank(a.style) - rank(b.style) || a.style.localeCompare(b.style)) }));
  fams.sort((a, b) => a.family.localeCompare(b.family, 'zh-Hans-CN'));
  return fams;
}

export function sysFontByPs(psName){
  if (!psName) return null;
  const n = String(psName).toLowerCase();
  const list = [...(sysFonts || []), ...userFontRecs()];
  return list.find(f => f.postscriptName.toLowerCase() === n)
      || list.find(f => (f.fullName || '').toLowerCase() === n || f.family.replace(/\s+/g, '').toLowerCase() === n) || null;
}
const fontLoadWith = async (fam, src) => { const ff = new FontFace(fam, src); await ff.load(); document.fonts.add(ff); return ff; };




const USER_FONT_DB = 'psd_editor-user-fonts';
export let userFonts = [];                                
const userFontCss = new Map();                     
function userFontDb(){
  return new Promise((res, rej) => {
    let r; try { r = indexedDB.open(USER_FONT_DB, 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('meta', { keyPath: 'id' }); db.createObjectStore('bytes'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export const idbReq = q => new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
export async function idbTx(stores, mode, fn){
  const db = await userFontDb();
  try {
    const tx = db.transaction(stores, mode);
    const out = await fn(tx);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    return out;
  } finally { db.close(); }
}
export const userFontsReady = (async () => {
  if (typeof indexedDB === 'undefined') return;
  try { userFonts = (await idbTx(['meta'], 'readonly', tx => idbReq(tx.objectStore('meta').getAll()))) || []; } catch { userFonts = []; }
})();
export const userFontByPs = ps => { if (!ps) return null; const n = String(ps).toLowerCase(); return userFonts.find(f => f.ps.toLowerCase() === n) || null; };

function ensureUserFont(f){
  if (!userFontCss.has(f.id)) userFontCss.set(f.id, (async () => {
    try {
      const bytes = await idbTx(['bytes'], 'readonly', tx => idbReq(tx.objectStore('bytes').get(f.id)));
      if (!bytes) return null;
      const css = 'psduser-' + (set_fontSeq(fontSeq + 1));
      await fontLoadWith(css, bytes);
      return css;
    } catch { return null; }
  })());
  return userFontCss.get(f.id);
}
async function inflateZlib(u8){
  if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持解压 WOFF，请换成 TTF / OTF');
  const ds = new DecompressionStream('deflate');
  const out = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

async function parseFontFile(buf, fileName){
  let u8 = new Uint8Array(buf);
  const base = String(fileName || 'font').replace(/\.[^.]+$/, '');
  const kind = fontKind(u8);
  if (!kind) throw new Error('不是字体文件（支持 TTF / OTF / TTC / OTC / WOFF / WOFF2）');
  if (kind === 'woff2') {
    

    try {
      const comp = woff2Payload(u8);
      const ds = new DecompressionStream('brotli');
      const raw = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer());
      u8 = decodeWoff2(u8, () => raw);
    } catch { return [{ id: 'file:' + base, ps: base, family: base, style: '', fullName: base, bytes: u8, noNames: true }]; }
  }
  if (kind === 'woff') {
    const { flavor, tables } = woffTables(u8);
    const parts = [];
    for (const t of tables) {
      const data = t.compressed ? await inflateZlib(t.data) : t.data;
      if (data.length !== t.origLength) throw new Error(`WOFF 表 ${t.tag} 解压长度不符`);
      parts.push({ tag: t.tag, sum: t.sum, data });
    }
    u8 = buildSfnt(flavor, parts);
  }
  return splitFonts(u8).map(face => {
    const n = readFontNames(face)[0];
    const ps = (n && n.ps) || base;
    return { id: ps, ps, family: (n && n.family) || base, style: (n && n.sub) || 'Regular', fullName: (n && n.fullName) || ps, bytes: face, ...(n ? {} : { noNames: true }) };
  });
}

export async function addUserFontFile(file, { prefer = null } = {}){
  let faces = await parseFontFile(await file.arrayBuffer(), file.name);
  
  if (prefer && faces.length > 1) { const hit = faces.filter(f => f.ps.toLowerCase() === String(prefer).toLowerCase()); if (hit.length) faces = hit; }
  const out = [];
  for (const f of faces) {
    const { bytes, ...meta } = f;
    meta.size = bytes.byteLength; meta.addedAt = Date.now();
    const css = 'psduser-' + (set_fontSeq(fontSeq + 1));
    try { await fontLoadWith(css, bytes); } catch (e) { throw new Error(`字体「${f.ps}」浏览器无法加载：${e.message || e}`); }
    try {
      await idbTx(['meta', 'bytes'], 'readwrite', tx => { tx.objectStore('meta').put(meta); tx.objectStore('bytes').put(bytes, meta.id); });
    } catch {  }
    userFonts = userFonts.filter(x => x.id !== meta.id).concat(meta);
    userFontCss.set(meta.id, Promise.resolve(css));
    delete fontCache[meta.ps];
    out.push({ ...meta, css });
  }
  for (const fn of sysFontsListeners) { try { fn(sysFonts); } catch {} }
  return out;
}
export async function removeUserFont(id){
  try { await idbTx(['meta', 'bytes'], 'readwrite', tx => { tx.objectStore('meta').delete(id); tx.objectStore('bytes').delete(id); }); } catch {}
  const f = userFonts.find(x => x.id === id);
  userFonts = userFonts.filter(x => x.id !== id);
  userFontCss.delete(id);
  if (f) delete fontCache[f.ps];
  for (const fn of sysFontsListeners) { try { fn(sysFonts); } catch {} }
}

const userFontRecs = () => userFonts.map(f => ({ family: f.family, style: f.style || 'Regular', fullName: f.fullName, postscriptName: f.ps, user: f.id }));


export async function resolveFont(psName){
  await userFontsReady;
  const hit = fontCache[psName];
  if (hit && (hit.ok || hit.how === sysFontsHow)) return hit;
  const uf = userFontByPs(psName);
  if (uf) {
    const css = await ensureUserFont(uf);
    if (css) return (fontCache[psName] = { css, ok: true, matched: uf.ps, family: uf.family, style: uf.style, user: true });
  }
  const rec = sysFontByPs(psName);
  const cands = [psName];
  if (rec) cands.push(rec.postscriptName, rec.fullName);
  cands.push(psName.replace(/-(Regular|Bold|Italic|BoldItalic|Light|Medium|Heavy|Black|Thin|MT|Std|Pro|W\d+)+$/i, ''),
             psName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-.*$/, ''));
  for (const c of [...new Set(cands.filter(Boolean))]) {
    const fam = 'psdfont-' + (set_fontSeq(fontSeq + 1));
    try {
      await fontLoadWith(fam, `local("${c.replace(/"/g, '')}")`);
      return (fontCache[psName] = { css: fam, ok: true, matched: c, family: rec ? rec.family : null, style: rec ? rec.style : null });
    } catch {  }
  }
  if (rec && rec.probed) return (fontCache[psName] = { css: rec.family, ok: true, matched: rec.family, family: rec.family, style: rec.style, byName: true });
  return (fontCache[psName] = { css: null, ok: false, how: sysFontsHow });
}

const PS_NAMES = { 'PingFang SC': 'PingFangSC-Regular', 'PingFang TC': 'PingFangTC-Regular', 'PingFang HK': 'PingFangHK-Regular',
  'Microsoft YaHei': 'MicrosoftYaHei', 'Microsoft YaHei UI': 'MicrosoftYaHeiUI', 'Microsoft JhengHei': 'MicrosoftJhengHeiRegular',
  'Noto Sans CJK SC': 'NotoSansCJKsc-Regular', 'Noto Serif CJK SC': 'NotoSerifCJKsc-Regular',
  'Source Han Sans SC': 'SourceHanSansSC-Regular', 'Source Han Serif SC': 'SourceHanSerifSC-Regular', 'Hiragino Sans GB': 'HiraginoSansGB-W3',
  'WenQuanYi Micro Hei': 'WenQuanYiMicroHei', 'Songti SC': 'STSongti-SC-Regular', 'Kaiti SC': 'STKaitiSC-Regular', 'Heiti SC': 'STHeitiSC-Light',
  'SimSun': 'SimSun', 'SimHei': 'SimHei', 'KaiTi': 'KaiTi', 'FangSong': 'FangSong', 'DengXian': 'DengXian-Regular', 'STHeiti': 'STHeiti',
  'Arial': 'ArialMT', 'Arial Black': 'Arial-Black', 'Arial Narrow': 'ArialNarrow', 'Helvetica': 'Helvetica', 'Helvetica Neue': 'HelveticaNeue',
  'Times New Roman': 'TimesNewRomanPSMT', 'Times': 'Times-Roman', 'Georgia': 'Georgia', 'Verdana': 'Verdana', 'Tahoma': 'Tahoma',
  'Trebuchet MS': 'TrebuchetMS', 'Impact': 'Impact', 'Courier New': 'CourierNewPSMT', 'Courier': 'Courier', 'Comic Sans MS': 'ComicSansMS',
  'Avenir': 'Avenir-Book', 'Avenir Next': 'AvenirNext-Regular', 'Futura': 'Futura-Medium', 'Gill Sans': 'GillSans', 'Optima': 'Optima-Regular',
  'Palatino': 'Palatino-Roman', 'Baskerville': 'Baskerville', 'Didot': 'Didot', 'Menlo': 'Menlo-Regular', 'Monaco': 'Monaco',
  'Segoe UI': 'SegoeUI', 'Calibri': 'Calibri', 'Cambria': 'Cambria', 'Consolas': 'Consolas', 'Century Gothic': 'CenturyGothic',
  'Roboto': 'Roboto-Regular', 'Open Sans': 'OpenSans-Regular', 'Lato': 'Lato-Regular', 'Montserrat': 'Montserrat-Regular', 'Inter': 'Inter-Regular' };
const postScriptNameOf = family => PS_NAMES[family] || family.replace(/\s+/g, '');

export async function fontChoiceOf(rec){
  const psName = rec.postscriptName || postScriptNameOf(rec.family);
  const r = await resolveFont(psName);
  if (r.ok) return { css: r.css, psName, family: rec.family, style: rec.style };
  return { css: rec.family, psName, family: rec.family, style: rec.style };   
}


export function selFontPs(i){ let ti = null; try { ti = textInfoOf(i); } catch {} return (ti && ti.font) || layerFontPs(i); }
export const layerFontPs = i => { const s = textFontSubst[i]; if (s) return s.psName; const L = layerTree && layerTree.flat && layerTree.flat[i]; return (L && L.text && L.text.font) || null; };



function mountFontList(host, { currentPs, onPick, onCommit } = {}){
  host.textContent = '';
  host.classList.add('fontlist');
  const search = document.createElement('input');
  search.type = 'search'; search.className = 'fl-search'; search.placeholder = '搜索字体';
  const list = document.createElement('div'); list.className = 'fl-list';
  const foot = document.createElement('div'); foot.className = 'fl-foot';
  const note = document.createElement('span'); note.className = 'fl-note';
  const scan = document.createElement('button'); scan.type = 'button'; scan.className = 'fl-scan'; scan.textContent = '读取全部本机字体';
  foot.append(note, scan);
  host.append(search, list, foot);
  let rows = [], active = -1;
  const curRec = () => sysFontByPs(currentPs);
  const setActive = (i, scroll) => {
    if (rows[active]) rows[active].row.classList.remove('on');
    active = i;
    if (rows[active]) { rows[active].row.classList.add('on'); if (scroll && rows[active].row.scrollIntoView) rows[active].row.scrollIntoView({ block: 'nearest' }); }
  };
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const all = fontFamilies();
    const fams = all.filter(f => !q || f.family.toLowerCase().includes(q)
      || f.styles.some(s => (s.fullName || '').toLowerCase().includes(q) || s.postscriptName.toLowerCase().includes(q)));
    list.textContent = ''; rows = []; active = -1;
    const cur = curRec();
    for (const f of fams) {
      const row = document.createElement('div');
      row.className = 'fl-row'; row.dataset.family = f.family;
      const name = document.createElement('span'); name.className = 'fl-name'; name.textContent = fontFamilyLabel(f) || f.family;
      const cnt = document.createElement('span'); cnt.className = 'fl-count'; cnt.textContent = f.styles.length > 1 ? f.styles.length + ' 种' : '';
      const sample = document.createElement('span'); sample.className = 'fl-sample'; sample.textContent = '字体 Aa';
      sample.style.fontFamily = `"${f.family.replace(/"/g, '')}", sans-serif`;
      if (f.user) {
        name.textContent = f.family + '（已上传）';
        const uf = userFonts.find(x => x.id === f.styles[0].user);
        if (uf) ensureUserFont(uf).then(css => { if (css) sample.style.fontFamily = `"${css}", sans-serif`; });
      }
      
      const fps = fontPreviewPx();
      if (!fps) sample.hidden = true; else sample.style.fontSize = fps + 'px';
      if (cur && cur.family === f.family) row.classList.add('cur');
      row.append(name, cnt, sample);
      row.onmouseenter = () => setActive(rows.findIndex(r => r.row === row), false);
      row.onclick = () => pick(f, true);
      list.appendChild(row);
      rows.push({ row, f });
    }
    if (!fams.length) {
      const e = document.createElement('div'); e.className = 'fl-empty';
      e.textContent = all.length ? '没有匹配的字体' : '还没有读到本机字体';
      list.appendChild(e);
    }
    const ci = cur ? rows.findIndex(r => r.f.family === cur.family) : -1;
    setActive(q ? (rows.length ? 0 : -1) : ci, true);
    note.textContent = sysFontsHow === 'api' ? `本机字体 ${all.length} 个系列`
      : hasLocalFontApi() ? `常用字体 ${all.length} 个（未读取全部）` : `本机常用字体 ${all.length} 个（浏览器不支持读取全部）`;
    scan.hidden = sysFontsHow === 'api' || !hasLocalFontApi();
  };
  const pick = async (f, commit) => {
    const cur = curRec();
    
    const rec = (cur && f.styles.find(s => s.style === cur.style)) || f.styles[0];
    const r = await fontChoiceOf(rec);
    if (onPick) onPick(r, f);
    if (commit && onCommit) onCommit(r, f);
  };
  search.oninput = render;
  search.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setActive(Math.max(0, Math.min(rows.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))), true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[active]) pick(rows[active].f, true);
    }
    if (e.key !== 'Escape') e.stopPropagation();          
  };
  scan.onclick = async () => { scan.disabled = true; note.textContent = '正在读取本机字体…（浏览器会请求授权）'; await loadSystemFonts({ gesture: true }); scan.disabled = false; render(); };
  const onFonts = () => render();
  sysFontsListeners.add(onFonts);
  render();
  return { search, render, destroy(){ sysFontsListeners.delete(onFonts); } };
}
export var fontPop = null;

export function openFontPopover(anchor, currentPs){
  closeFontPopover(null);
  const fontsReady = loadSystemFonts({ gesture: true });   
  const pop = document.createElement('div');
  pop.className = 'fontpop';
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(), W = 340, H = 400;
  pop.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left)) + 'px';
  pop.style.top = (r.bottom + H + 8 > window.innerHeight ? Math.max(8, r.top - H - 4) : r.bottom + 4) + 'px';
  return new Promise(res => {
    const ui = mountFontList(pop, { currentPs, onCommit: v => closeFontPopover(v) });
    const p = fontPop = { pop, ui, res, anchor };
    fontsReady.then(() => { if (fontPop === p) ui.render(); });
    setTimeout(() => { try { ui.search.focus(); } catch {} }, 0);
    p.outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closeFontPopover(null); };
    p.key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFontPopover(null); } };
    document.addEventListener('pointerdown', p.outside, true);
    pop.addEventListener('keydown', p.key);
  });
}
export function closeFontPopover(v){
  const p = fontPop; if (!p) return;
  fontPop = null;
  document.removeEventListener('pointerdown', p.outside, true);
  p.ui.destroy(); p.pop.remove();
  p.res(v);
}

function renderUserFontList(){
  const box = $('#fontUserList');
  if (!box) return;
  box.textContent = '';
  box.hidden = !userFonts.length;
  if (!userFonts.length) return;
  const lab = document.createElement('span'); lab.className = 'hint'; lab.textContent = '已上传：';
  box.appendChild(lab);
  for (const f of userFonts) {
    const chip = document.createElement('span'); chip.className = 'fu-chip'; chip.title = f.fullName + (f.noNames ? '（读不出字体内名，按文件名登记）' : '');
    chip.textContent = f.ps;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'fu-del'; x.textContent = '×'; x.title = '从本浏览器删除这款字体';
    x.onclick = async e => { e.preventDefault(); await removeUserFont(f.id); renderUserFontList(); };
    chip.appendChild(x); box.appendChild(chip);
  }
}

export async function pickFont(psName, layerIndex){
  await userFontsReady;
  const dlg = $('#fontDlg');
  const fontsReady = loadSystemFonts({ gesture: true });
  if (psName && !fontCache[psName]) await resolveFont(psName).catch(() => null);
  $('#fontDlgMsg').textContent = psName ? `图层使用的字体「${psName}」${fontCache[psName] && fontCache[psName].ok ? '本机可用' : '本机没有安装'}，请选择替换字体：` : '请选择字体：';
  $('#fontFile').value = '';
  renderUserFontList();
  const cur = textFontSubst[layerIndex];
  let chosen = cur && !cur.file ? cur : null;
  const styleSel = $('#fontStyleSel'), picked = $('#fontPicked');
  const fillStyles = (fam, ps) => {
    if (!styleSel) return;
    styleSel.textContent = '';
    const f = fam ? fontFamilies().find(x => x.family === fam) : null;
    for (const s of (f ? f.styles : [])) { const o = document.createElement('option'); o.value = s.postscriptName; o.textContent = s.style; styleSel.appendChild(o); }
    if (ps) styleSel.value = ps;
    styleSel.disabled = !f || f.styles.length < 2;
  };
  const showChosen = () => {
    if (!picked) return;
    picked.textContent = chosen ? `${chosen.family || chosen.psName}${chosen.style ? ' · ' + chosen.style : ''}` : '未选择';
    picked.style.fontFamily = chosen && chosen.css ? `"${chosen.css}", sans-serif` : '';
  };
  let finish = () => {};
  const host = $('#fontListHost');
  const ui = host ? mountFontList(host, { currentPs: chosen ? chosen.psName : psName,
    onPick: (r, f) => { chosen = r; fillStyles(f.family, r.psName); showChosen(); },
    onCommit: () => finish(true) }) : null;
  fontsReady.then(() => { if (ui) ui.render(); if (chosen) fillStyles(chosen.family, chosen.psName); });
  if (styleSel) styleSel.onchange = async () => { const rec = sysFontByPs(styleSel.value); if (rec) { chosen = await fontChoiceOf(rec); showChosen(); } };
  fillStyles(chosen && chosen.family, chosen && chosen.psName); showChosen();
  return new Promise(res => {
    
    let settled = false;
    finish = async ok => {
      if (settled) return; settled = true;
      dlg.onclose = null; okBtn.onclick = null; cancelBtn.onclick = null;
      if (ui) ui.destroy();
      if (dlg.open) dlg.close(ok ? 'ok' : 'cancel');
      if (!ok) return res(null);
      const file = $('#fontFile').files[0];
      if (file) {
        let recs;
        try { recs = await addUserFontFile(file, { prefer: psName }); }
        catch (e) { $('#err').textContent = '字体文件无法加载：' + (e.message || e); return res(null); }
        
        const r = recs.find(x => psName && x.ps.toLowerCase() === String(psName).toLowerCase())
          || recs.find(x => /^(regular|normal|roman|book)$/i.test(x.style)) || recs[0];
        return res({ css: r.css, psName: r.ps, family: r.family, style: r.style, ...(r.noNames ? { file: true } : {}) });
      }
      res(chosen || null);
    };
    const okBtn = $('#fontOk'), cancelBtn = $('#fontCancel');
    okBtn.onclick = e => { e.preventDefault(); finish(true); };
    cancelBtn.onclick = e => { e.preventDefault(); finish(false); };
    dlg.onclose = () => finish(dlg.returnValue === 'ok');
    dlg.oncancel = () => finish(false);
    dlg.returnValue = ''; dlg.showModal();
  });
}
export var textToolFont = null;                               
export function set_textToolFont(v) { return (textToolFont = v); }   


export var TEXT_TOOL_DEFAULT_FONT = { family: 'Arial', psName: 'ArialMT' };
export function textToolFontPs(){ return (textToolFont && textToolFont.psName) || TEXT_TOOL_DEFAULT_FONT.psName; }

export async function applyTextFont(idx, r){
  const L = layerTree && layerTree.flat && layerTree.flat[idx];
  if (!r) return false;
  if (!r.file) textToolFont = r;
  if (!L || !L.text) { syncTextBar(); return false; }
  if (!textEditAbsorbs(idx)) pushDocHistory();
  
  const tg = textEditTargets(idx);
  if (tg.char) setTextRanges(idx, tg.text, segApply(textRangesOf(idx, tg.text), tg.text.length, tg.char[0], tg.char[1], { font: { psName: r.psName, css: r.css, family: r.family } }));
  else { textFontSubst[idx] = r; stripTextRanges(idx, ['font']); }
  if (layerTextEdits[idx] == null) layerTextEdits[idx] = L.text.content;
  await renderTextLayer(idx, L, { silent: true });
  renderStaticLayers(); renderProps(); syncTextBar();
  if (textOverlay && textOverlay.idx === idx) { layoutInlineText(); try { textOverlay.ta.focus({ preventScroll: true }); } catch {} }
  return true;
}



export function effTextInfo(i, L){
  const base = (L && L.text) || null;
  if (!base) return null;
  const e = textStyleEdits[i], d = textDescEdits[i];
  const out = { ...base, ...(e || {}), ...(d || {}) };
  


  if (d && d.shape === 'box' && Array.isArray(d.box)) {
    const [w, h, ox = 0, oy = 0] = d.box, T = (base.transform || [1, 0, 0, 1, 0, 0]).slice(0, 6);
    out.box = [0, 0, w, h];
    out.transform = [T[0], T[1], T[2], T[3], T[4] + T[0] * ox + T[2] * oy, T[5] + T[1] * ox + T[3] * oy];
  }
  if (d && d.shape === 'point' && Array.isArray(d.pointBase)) out.pointBase = d.pointBase.slice(0, 2);
  return out;
}

export function effTextStyle(i, key){
  const q = textStyleEdits[i];
  if (q && q[key] !== undefined) return q[key];
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  return L && L.text ? L.text[key] : undefined;
}










export async function ensureTextRaster(i){
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  const dl = doc && doc.layers && doc.layers[i];
  if (!L || !dl || !L.text || L.text.content == null) return false;
  if (textRenders[i]) return true;
  if (dl.rgba && dl.width > 0 && dl.height > 0) return false;   
  const okd = await renderTextLayer(i, L, { silent: true });
  if (okd !== false) { renderStaticLayers(); renderPreviewOnly(); renderLayerPanel(); }
  return okd !== false;
}






export const TEXT_CHAR_KEYS = ['fontSize', 'color', 'bold', 'italic', 'underline', 'strikethrough', 'tracking', 'leading', 'hScale', 'vScale', 'baselineShift', 'caps', 'baseline', 'autoKern',
  'ligatures', 'dligatures',   
  'tsume', 'noBreak', 'charDirection', 'hindiNumbers',   
  'kerning', 'kashida', 'diacriticPos'];                  
export const TEXT_PARA_KEYS = ['align', 'startIndent', 'endIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter', 'hyphenate', 'burasagari', 'kinsokuOrder', 'hanging', 'everyLineComposer',
  ...CP_PARA_EXTRA_KEYS];                                  
export const JUSTIFY_CODE = { left: 0, right: 1, center: 2, justify: 3, justifyRight: 4, justifyCenter: 5, justifyAll: 6 };
const textRunsMemo = new WeakMap();
function textRunsOf(L){
  if (!L || !L.text) return null;
  if (textRunsMemo.has(L.text)) return textRunsMemo.get(L.text);
  let tr = null; try { tr = getTextRuns(L.text); } catch {}
  textRunsMemo.set(L.text, tr);
  return tr;
}
export function textModelOf(i, L){
  const info = effTextInfo(i, L); if (!info) return null;
  const text = dispTextOf(i, L);
  const tr = textRunsOf(L), e = textStyleEdits[i] || {}, sub = textFontSubst[i];
  const fromInfo = { font: info.font, fontSize: info.fontSize, color: info.color || [0, 0, 0, 1], fauxBold: !!info.bold && !/bold|black|heavy/i.test(info.font || ''),
    fauxItalic: !!info.italic && !/italic|oblique/i.test(info.font || ''), underline: !!info.underline, strikethrough: !!info.strikethrough,
    tracking: info.tracking || 0, leading: info.leading, hScale: info.hScale || 1, vScale: info.vScale || 1, baselineShift: info.baselineShift || 0,
    caps: info.caps || 'none', baseline: info.baseline || 'normal', autoKern: info.autoKern !== false,
    ligatures: info.ligatures !== false, dligatures: !!info.dligatures, tsume: info.tsume || 0, noBreak: !!info.noBreak, charDirection: info.charDirection || 0, hindiNumbers: !!info.hindiNumbers,
    kerning: info.kerning || 0, kashida: info.kashida || 0, diacriticPos: info.diacriticPos || 0 };
  let runs;
  if (tr && tr.runs && tr.runs.length) {
    const spans0 = tr.runs.map(r => [r.from, r.to]);
    const spans = tr.text === text ? spans0 : remapRunSpans(tr.text, text, spans0);
    runs = tr.runs.map((r, k) => ({ font: r.font, fontSize: r.fontSize, color: r.colorF || [0, 0, 0, 1], fauxBold: !!(r.faux && r.faux.bold), fauxItalic: !!(r.faux && r.faux.italic),
      underline: !!r.underline, strikethrough: !!r.strikethrough, tracking: r.tracking || 0, leading: r.autoLeading ? null : r.leading,
      hScale: r.hScale || 1, vScale: r.vScale || 1, baselineShift: r.baselineShift || 0, caps: r.caps || 'none', baseline: r.baseline || 'normal', autoKern: true,
      ligatures: r.ligatures !== false, dligatures: !!r.dligatures, tsume: r.tsume || 0, noBreak: !!r.noBreak, charDirection: r.charDirection || 0, hindiNumbers: !!r.hindiNumbers,
      kerning: r.kerning || 0, kashida: r.kashida || 0, diacriticPos: r.diacriticPos || 0,
      from: spans[k][0], to: spans[k][1] })).filter(r => r.to > r.from);
    if (!runs.length) runs = [{ ...fromInfo, from: 0, to: text.length }];
  } else runs = [{ ...fromInfo, from: 0, to: text.length }];
  for (const r of runs) {
    if (e.fontSize != null) r.fontSize = e.fontSize;
    if (e.color != null) r.color = e.color;
    if (e.bold != null) r.fauxBold = !!e.bold && !/bold|black|heavy/i.test(r.font || '');
    if (e.italic != null) r.fauxItalic = !!e.italic && !/italic|oblique/i.test(r.font || '');
    for (const k of ['underline', 'strikethrough', 'tracking', 'hScale', 'vScale', 'baselineShift', 'caps', 'baseline', 'autoKern', 'ligatures', 'dligatures', 'tsume', 'noBreak', 'charDirection', 'hindiNumbers', 'kerning', 'kashida', 'diacriticPos']) if (e[k] != null) r[k] = e[k];
    if (e.leading !== undefined) r.leading = e.leading;
    if (sub) { r.font = sub.psName; r.css = sub.css; }
  }
  
  const segs = textEffSegs(i, L, text);
  if (segs.length) runs = overlayTextSegs(runs, segs);
  
  const paraSrc = tr && tr.paragraphs && tr.paragraphs.length ? tr.paragraphs : null;
  const pspans = paraSrc ? (tr.text === text ? paraSrc.map(p => [p.from, p.to]) : remapRunSpans(tr.text, text, paraSrc.map(p => [p.from, p.to]))) : null;
  const paragraphs = [];
  let p0 = 0;
  for (let k = 0; k <= text.length; k++) if (k === text.length || text[k] === '\n') {
    let src = null;
    if (paraSrc) { const at = pspans.findIndex(sp => p0 >= sp[0] && p0 < sp[1]); src = paraSrc[at >= 0 ? at : paraSrc.length - 1]; }
    const para = src ? { justification: src.justification, startIndent: src.indent.left, endIndent: src.indent.right, firstLineIndent: src.indent.firstLine,
      spaceBefore: src.spaceBefore, spaceAfter: src.spaceAfter, autoLeading: src.autoLeading,
      hyphenate: src.hyphenate, burasagari: src.burasagari, kinsokuOrder: src.kinsokuOrder, hanging: src.hanging, everyLineComposer: src.everyLineComposer,
      ...Object.fromEntries(CP_PARA_EXTRA_KEYS.filter(kk => kk !== 'autoLeading' && src[kk] !== undefined).map(kk => [kk, src[kk]])) }
      : { justification: info.justification != null ? info.justification : JUSTIFY_CODE[info.align] || 0, startIndent: info.startIndent || 0, endIndent: info.endIndent || 0,
          firstLineIndent: info.firstLineIndent || 0, spaceBefore: info.spaceBefore || 0, spaceAfter: info.spaceAfter || 0, autoLeading: info.autoLeading || 1.2 };
    if (e.align != null) para.justification = JUSTIFY_CODE[e.align] != null ? JUSTIFY_CODE[e.align] : para.justification;
    for (const kk of ['startIndent', 'endIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter', 'hyphenate', 'burasagari', 'kinsokuOrder', 'hanging', 'everyLineComposer', ...CP_PARA_EXTRA_KEYS]) if (e[kk] != null) para[kk] = e[kk];
    if (segs.length) {                                   
      for (const sg of segs) if (sg.from < k + 1 && sg.to > p0) for (const [kk, v] of Object.entries(sg.patch)) {
        if (!isParaKey(kk)) continue;
        if (kk === 'align') para.justification = JUSTIFY_CODE[v] != null ? JUSTIFY_CODE[v] : para.justification; else para[kk] = v;
      }
    }
    if (CPP && para.kinsokuSet) Object.assign(para, CPP.kinsokuChars(para.kinsokuSet));   
    paragraphs.push({ ...para, from: p0, to: k + 1 });
    p0 = k + 1;
  }
  return { text, runs, paragraphs, orientation: info.orientation, shape: info.shape, box: info.box, pointBase: info.pointBase, transform: info.transform || [1, 0, 0, 1, 0, 0] };
}

function overlayTextSegs(runs, segs){
  const out = [];
  for (const r of runs) {
    const cuts = new Set([r.from, r.to]);
    for (const sg of segs) { if (sg.from > r.from && sg.from < r.to) cuts.add(sg.from); if (sg.to > r.from && sg.to < r.to) cuts.add(sg.to); }
    const cs = [...cuts].sort((a, b) => a - b);
    for (let k = 0; k + 1 < cs.length; k++) {
      const a = cs[k], b = cs[k + 1];
      const sg = segs.find(q => a >= q.from && a < q.to);
      const pch = sg ? Object.entries(sg.patch).filter(([kk]) => !isParaKey(kk)) : [];
      if (!pch.length) { out.push(cs.length === 2 ? r : { ...r, from: a, to: b }); continue; }
      const piece = { ...r, from: a, to: b };
      for (const [kk, v] of pch) {
        if (kk === 'font') { if (v && v.psName) { piece.font = v.psName; piece.css = v.css || undefined; } }
        else if (kk === 'bold') piece.fauxBold = !!v && !/bold|black|heavy/i.test(piece.font || '');
        else if (kk === 'italic') piece.fauxItalic = !!v && !/italic|oblique/i.test(piece.font || '');
        else piece[kk] = v;
      }
      out.push(piece);
    }
  }
  return out;
}

export function runCanvasFont(run, css, scale = 1, k = 1){
  return `${run.fauxItalic ? 'italic ' : ''}${run.fauxBold ? 'bold ' : ''}${run.fontSize * scale * k}px ${css ? '"' + String(css).replace(/"/g, '') + '", ' : ''}sans-serif`;
}
function setRunFont(ctx, run, css, scale = 1){
  





  const sig = ctx.canvas ? ctx.canvas.width + 'x' + ctx.canvas.height : '-';
  if (ctx.__fsig !== sig) { ctx.__fsig = sig; ctx.__f = ctx.__ls = ctx.__k = undefined; }
  const f = runCanvasFont(run, css, scale);
  if (ctx.__f !== f) { ctx.font = f; ctx.__f = f; }
  const ls = (((run.tracking || 0) + (run.kerning || 0)) / 1000 * run.fontSize * scale) + 'px';   
  if ('letterSpacing' in ctx && ctx.__ls !== ls) { ctx.letterSpacing = ls; ctx.__ls = ls; }
  const kern = run.autoKern === false || (run.kernMode === 'optical' && opticalKernOf(run.font)) ? 'none' : 'normal';   
  if ('fontKerning' in ctx && ctx.__k !== kern) { ctx.fontKerning = kern; ctx.__k = kern; }
}

async function resolveModelFonts(model){
  const map = new Map();
  for (const r of model.runs) {
    if (r.css) { map.set(r, r.css); continue; }
    if (!r.font) { map.set(r, null); continue; }
    const res = await resolveFont(r.font);
    map.set(r, res && res.ok ? res.css : null);
  }
  

  for (const r of model.runs) {
    if (otFeatureCss(r) && map.get(r)) map.set(r, await otFamilyAsync(r, map.get(r)));
    if (r.kernMode === 'optical' && r.font) await opticalKernReady(r.font);
  }
  return map;
}

export function textLayoutApi(ctx, cssMap){
  const mcache = new Map();
  return {
    measure(t, run, scale){
      setRunFont(ctx, run, cssMap.get(run), scale);
      const w = ctx.measureText(t).width;
      const ok = run.kernMode === 'optical' ? opticalKernOf(run.font) : null;
      return (ok ? w + opticalKernSum(ok, t) * run.fontSize * (scale || 1) : w) * (run.hScale || 1);
    },
    metrics(run, scale){
      const key = runCanvasFont(run, cssMap.get(run), scale);
      if (mcache.has(key)) return mcache.get(key);
      setRunFont(ctx, run, cssMap.get(run), scale);
      const v = textFontMetrics(ctx, { fontSize: run.fontSize * scale });
      const out = { ascent: v.ascent * (run.vScale || 1), descent: v.descent * (run.vScale || 1) };
      mcache.set(key, out);
      return out;
    },
    
    ink(t, run, scale){
      setRunFont(ctx, run, cssMap.get(run), scale);
      try { const m = ctx.measureText(t); if (m && m.actualBoundingBoxAscent > 0) return { ascent: m.actualBoundingBoxAscent * (run.vScale || 1), descent: Math.max(0, m.actualBoundingBoxDescent) * (run.vScale || 1) }; } catch {}
      return null;
    },
  };
}

export function drawRichText(ctx, lay, cssMap){
  ctx.textBaseline = 'alphabetic';
  for (const ln of lay.lines) ln.pieces.forEach((p, pi) => {
    if (!p.text) return;
    
    const nx = ln.pieces[pi + 1];
    const lastBody = !ln.pieces.slice(pi + 1).some(q => q.body);
    const lineSpan = !p.body && lastBody ? 0 : (nx && nx.run.underline === p.run.underline && nx.run.strikethrough === p.run.strikethrough && !(lastBody && !nx.body) ? nx.x - p.x : p.w);
    const run = p.run, fs = run.fontSize * p.scale;
    setRunFont(ctx, run, cssMap.get(run), p.scale);
    const [r, g, b, a] = run.color || [0, 0, 0, 1];
    ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a == null ? 1 : a})`;
    ctx.save();
    
    if (p.at) { ctx.translate(p.at[0], p.at[1]); if (p.rot) ctx.rotate(p.rot); ctx.translate(0, -p.rise); }
    else ctx.translate(p.x, ln.y - p.rise);
    ctx.scale((run.hScale || 1) * (p.sx || 1), run.vScale || 1);
    const ok = run.kernMode === 'optical' ? opticalKernOf(run.font) : null;
    if (ok || run.charRotate || run.emphasis) drawTextGlyphwise(ctx, p.text, run, fs, ok);   
    else ctx.fillText(p.text, 0, 0);
    const w = lineSpan / (run.hScale || 1);
    const th = Math.max(0.5, run.fontSize / 16);
    if (run.underline && w > 0) ctx.fillRect(0, run.fontSize * 0.1 + p.rise, w, th);   
    if (run.strikethrough && w > 0) ctx.fillRect(0, -fs * 0.3, w, th);                 
    ctx.restore();
  });
}

export function textPtFactor(i){
  const L = layerTree && layerTree.flat && layerTree.flat[i];
  const T = (L && L.text && L.text.transform) || [1, 0, 0, 1, 0, 0];
  const s = Math.hypot(T[2], T[3]) || 1;
  return s * 72 / (docResolution || 72);
}

function textFontMetrics(ctx, info){
  const size = info.fontSize || 12;
  let ascent = size * 0.88, descent = size * 0.12;
  try {
    const m = ctx.measureText('国Hg');
    if (m && m.fontBoundingBoxAscent > 0) { ascent = m.fontBoundingBoxAscent; descent = m.fontBoundingBoxDescent || descent; }
  } catch {}
  return { ascent, descent };
}
export async function renderTextLayer(i, L, opts = {}){
  





  const tfUntouched = !transformChanged(i);
  const tfBefore = tfUntouched ? null : { t: { ...layerTransforms[i] }, b: transformBase(i) };
  const info = effTextInfo(i, L); const text = dispTextOf(i, L);
  let css = null;
  const sub = textFontSubst[i];
  if (sub) css = sub.css;
  else if (info.font) {
    const r = await resolveFont(info.font);
    if (r.ok) css = r.css;
    else if (opts.silent) {
      $('#notice').textContent = `字体「${info.font}」本机缺失，预览用近似字体渲染；导出后 PS 会按它自己的字体重排。`;
    } else {                                     
      const picked = await pickFont(info.font, i);
      if (!picked) {
        $('#err').textContent = `字体「${info.font}」本机缺失，未替换：已放弃这次文字修改（导出后 PS 会用其替代字体重排）。`;
        delete textRenders[i]; delete textCrops[i]; delete thumbCache[i];
        return false;
      }
      textFontSubst[i] = picked; css = picked.css;
    }
  }
  

  const localText = docW * docH > 64e6;
  const cv = document.createElement('canvas'); cv.width = localText ? 1 : docW; cv.height = localText ? 1 : docH;
  const ctx = cv.getContext('2d');
  const [xx, xy, yx, yy, tx, ty] = info.transform || [1, 0, 0, 1, 0, 0];
  ctx.setTransform(xx, xy, yx, yy, tx, ty);
  const model = textModelOf(i, L);
  const cssMap = await resolveModelFonts(model);
  if (css) for (const r of model.runs) if (r.font === info.font || !cssMap.get(r)) cssMap.set(r, cssMap.get(r) || css);   
  const lay = layoutTextFor(i, model, textLayoutApi(ctx, cssMap));   
  



  const pad = localText ? { l: 0, t: 0, r: 0, b: 0 } : textRenderPad(lay.bounds, [xx, xy, yx, yy, tx, ty]);
  

  let dcv = cv, dctx = ctx, localLeft = 0, localTop = 0;
  if (localText && lay.bounds) {
    const b = lay.bounds, pts = [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]]
      .map(([x, y]) => [xx * x + yx * y + tx, xy * x + yy * y + ty]);
    localLeft = Math.floor(Math.min(...pts.map(p => p[0]))) - 24;
    localTop = Math.floor(Math.min(...pts.map(p => p[1]))) - 24;
    const right = Math.ceil(Math.max(...pts.map(p => p[0]))) + 24;
    const bottom = Math.ceil(Math.max(...pts.map(p => p[1]))) + 24;
    dcv = document.createElement('canvas'); dcv.width = Math.max(1, right - localLeft); dcv.height = Math.max(1, bottom - localTop);
    dctx = dcv.getContext('2d');
  } else if (pad.l || pad.t || pad.r || pad.b) {
    dcv = document.createElement('canvas');
    dcv.width = docW + pad.l + pad.r; dcv.height = docH + pad.t + pad.b;
    dctx = dcv.getContext('2d');
  }
  dctx.setTransform(xx, xy, yx, yy, tx + pad.l - localLeft, ty + pad.t - localTop);
  drawRichText(dctx, lay, cssMap);
  

  const wp = effTextWarp(i);
  if (wp && warpStyleOf(wp) !== 'warpNone') {
    const wr = warpTextCanvas(dcv, wp, pad);
    if (wr) { dcv = wr.cv; pad.l = wr.pad.l; pad.t = wr.pad.t; pad.r = wr.pad.r; pad.b = wr.pad.b; }
  }
  textRenders[i] = dcv;
  const cp = cropCanvasAlpha(dcv);           
  if (cp) applyTextAntiAlias(dcv, cp, effTextDesc(i, 'antiAlias'));
  
  textCrops[i] = cp ? { rgba: cp.rgba, cv: dcv, pad,
    bounds: { left: cp.bounds.left - pad.l + localLeft, top: cp.bounds.top - pad.t + localTop,
              right: cp.bounds.right - pad.l + localLeft, bottom: cp.bounds.bottom - pad.t + localTop } } : null;
  
  if (tfUntouched) delete layerTransforms[i];
  else if (tfBefore && !tfBefore.t.quad) {
    


    const nb = transformBase(i), ob = tfBefore.b, ot = tfBefore.t;
    const sx = ob.w > 0 ? ot.w / ob.w : 1, sy = ob.h > 0 ? ot.h / ob.h : 1;
    layerTransforms[i] = { ...ot, x: nb.x + (ot.x - ob.x), y: nb.y + (ot.y - ob.y), w: nb.w * sx, h: nb.h * sy };
  }
  delete thumbCache[i]; delete layerCanvasCache[i];   
  $('#err').textContent = '';
}


function warpTextCanvas(src, wp, pad){
  const cp = cropCanvasAlpha(src); if (!cp) return null;
  const bx = cp.bounds.left, by = cp.bounds.top, bw = cp.bounds.right - bx, bh = cp.bounds.bottom - by;
  if (bw < 2 || bh < 2) return null;
  const f = warpMap({ style: warpStyleOf(wp), bend: warpNumOf(wp, 'warpValue') / 100, h: warpNumOf(wp, 'warpPerspective') / 100,
    v: warpNumOf(wp, 'warpPerspectiveOther') / 100, vertical: (wp.warpRotate && wp.warpRotate.value) === 'Vrtc', aspect: bw / bh });
  const NU = 40, NV = 16;
  const G = [];
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (let j = 0; j <= NV; j++) for (let k = 0; k <= NU; k++) {
    const [x, y] = f(k / NU, j / NV), X = bx + x * bw, Y = by + y * bh;
    G.push([X, Y]); mnx = Math.min(mnx, X); mny = Math.min(mny, Y); mxx = Math.max(mxx, X); mxy = Math.max(mxy, Y);
  }
  
  const ex = { l: Math.max(0, Math.ceil(-mnx) + 2), t: Math.max(0, Math.ceil(-mny) + 2), r: Math.max(0, Math.ceil(mxx - src.width) + 2), b: Math.max(0, Math.ceil(mxy - src.height) + 2) };
  const CAP = 4096; for (const k in ex) ex[k] = Math.min(CAP, ex[k]);
  const out = document.createElement('canvas'); out.width = src.width + ex.l + ex.r; out.height = src.height + ex.t + ex.b;
  const g = out.getContext('2d'); if (!g) return null;
  const tri = (s0, s1, s2, d0, d1, d2) => {
    
    const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2;
    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(den) < 1e-9) return;
    const [u0, v0] = d0, [u1, v1] = d1, [u2, v2] = d2;
    const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / den, c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / den;
    const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / den, d = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / den;
    const e = u0 - a * x0 - c * y0, ff = v0 - b * x0 - d * y0;
    
    const cx = (u0 + u1 + u2) / 3, cy = (v0 + v1 + v2) / 3;
    const grow = ([px, py]) => { const L = Math.hypot(px - cx, py - cy) || 1; return [px + (px - cx) / L * 0.6, py + (py - cy) / L * 0.6]; };
    const q0 = grow(d0), q1 = grow(d1), q2 = grow(d2);
    g.save();
    g.beginPath(); g.moveTo(q0[0] + ex.l, q0[1] + ex.t); g.lineTo(q1[0] + ex.l, q1[1] + ex.t); g.lineTo(q2[0] + ex.l, q2[1] + ex.t); g.closePath(); g.clip();
    g.setTransform(a, b, c, d, e + ex.l, ff + ex.t);
    const sx = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1), sy = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1);
    const sw = Math.min(src.width, Math.ceil(Math.max(x0, x1, x2)) + 1) - sx, sh = Math.min(src.height, Math.ceil(Math.max(y0, y1, y2)) + 1) - sy;
    if (sw > 0 && sh > 0) g.drawImage(src, sx, sy, sw, sh, sx, sy, sw, sh);
    g.restore();
  };
  const S = (k, j) => [bx + k / NU * bw, by + j / NV * bh], D = (k, j) => G[j * (NU + 1) + k];
  for (let j = 0; j < NV; j++) for (let k = 0; k < NU; k++) {
    tri(S(k, j), S(k + 1, j), S(k + 1, j + 1), D(k, j), D(k + 1, j), D(k + 1, j + 1));
    tri(S(k, j), S(k + 1, j + 1), S(k, j + 1), D(k, j), D(k + 1, j + 1), D(k, j + 1));
  }
  return { cv: out, pad: { l: pad.l + ex.l, t: pad.t + ex.t, r: pad.r + ex.r, b: pad.b + ex.b } };
}






export function textRenderPad(b, m){
  const z = { l: 0, t: 0, r: 0, b: 0 };
  if (!b || !docW || !docH) return z;
  const [a, bb, c, d, e, f] = m;
  const px = (x, y) => [a * x + c * y + e, bb * x + d * y + f];
  const pts = [px(b.left, b.top), px(b.right, b.top), px(b.right, b.bottom), px(b.left, b.bottom)];
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const [x, y] of pts) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); }
  const slack = Math.max(8, Math.ceil(Math.max(mxx - mnx, mxy - mny) * 0.06));   
  const CAP = 4096;
  
  const need = over => over > 0 ? Math.min(CAP, Math.ceil(over + slack)) : 0;
  let l = need(-mnx), t = need(-mny), r = need(mxx - docW), bo = need(mxy - docH);
  
  const MAXPX = 64e6;
  for (let k = 0; k < 8 && (docW + l + r) * (docH + t + bo) > MAXPX; k++) { l >>= 1; t >>= 1; r >>= 1; bo >>= 1; }
  return { l, t, r, b: bo };
}


export function cropRGBABuf(data, w, h, ox, oy){
  let mnx = w, mny = h, mxx = -1, mxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) {
    if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
  }
  if (mxx < mnx) return null;
  const cw = mxx - mnx + 1, ch = mxy - mny + 1, out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const si = ((y + mny) * w + mnx) * 4;
    out.set(data.subarray(si, si + cw * 4), y * cw * 4);
  }
  return { rgba: out, bounds: { left: ox + mnx, top: oy + mny, right: ox + mxx + 1, bottom: oy + mxy + 1 } };
}



export function applyTextAntiAlias(cv, cp, mode){
  const g = { antiAliasNone: 0, antiAliasSharp: 1.15, antiAliasCrisp: 1.3, antiAliasStrong: 1.7, antiAliasSmooth: 1.45,
    antiAliasPlatformLCD: 1.35, antiAliasPlatformGray: 1.35 }[mode] ?? 1.45;
  const d = cp.rgba; let peak = 0;
  for (let k = 3; k < d.length; k += 4) if (d[k] > peak) peak = d[k];
  if (!peak) return;
  const lut = new Uint8ClampedArray(256);
  for (let a = 0; a < 256; a++) { const t = Math.min(1, a / peak); lut[a] = g === 0 ? (t >= .5 ? peak : 0) : Math.round(peak * Math.pow(t, 1 / g)); }
  for (let k = 3; k < d.length; k += 4) d[k] = lut[d[k]];
  try { cv.getContext('2d').putImageData(new ImageData(d, cp.bounds.right - cp.bounds.left, cp.bounds.bottom - cp.bounds.top), cp.bounds.left, cp.bounds.top); } catch {}
}
export function cropCanvasAlpha(cv){
  const W = cv.width, H = cv.height, d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  let mnx = W, mny = H, mxx = -1, mxy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 0) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
  if (mxx < mnx) return null;
  const cw = mxx - mnx + 1, ch = mxy - mny + 1, out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const si = ((y + mny) * W + (x + mnx)) * 4, di = (y * cw + x) * 4; out[di] = d[si]; out[di + 1] = d[si + 1]; out[di + 2] = d[si + 2]; out[di + 3] = d[si + 3]; }
  return { rgba: out, bounds: { top: mny, left: mnx, bottom: mxy + 1, right: mxx + 1 } };
}


export async function bakeReplacementPng(image, dstW, dstH, fit){
  const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  sc.getContext('2d').drawImage(image, 0, 0);
  const src = sc.getContext('2d').getImageData(0, 0, sw, sh);
  const baked = bakeSourceRaster({ image: { data: src.data, width: sw, height: sh }, dstW, dstH, fit });
  const oc = document.createElement('canvas'); oc.width = baked.width; oc.height = baked.height;
  oc.getContext('2d').putImageData(new ImageData(baked.data, baked.width, baked.height), 0, 0);
  const blob = await new Promise((res, rej) => oc.toBlob(b => b ? res(b) : rej(new Error('PNG 编码失败')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
