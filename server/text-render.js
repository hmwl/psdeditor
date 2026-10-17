




















import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { parsePsdFull } from '../core/psd-parse.js';
import { getTextInfo, getTextRuns, layoutRichText } from '../core/psd-text.js';
import { parsePsdDocument } from '../core/psd-document.js';
import { applyEdits } from '../core/psd-edit.js';
import { toAB, toBuf } from './ops-util.js';
import { readFontNames as readFontNames0 } from '../core/font-sfnt.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_PX = 64e6;

let CANVAS = null, CANVAS_ERR = null;
try { CANVAS = await import('@napi-rs/canvas'); } catch (e) { CANVAS_ERR = e && e.message || String(e); }
export const textRenderAvailable = () => !!CANVAS;



function fontDirs() {
  const env = (process.env.PSD_EDITOR_FONT_DIRS || '').split(/[,:;]/).map(s => s.trim()).filter(Boolean);
  const home = os.homedir();
  return [path.join(HERE, 'fonts'), ...env, '/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'),
    path.join(home, '.local/share/fonts'), '/Library/Fonts', '/System/Library/Fonts', path.join(home, 'Library/Fonts'), 'C:\\Windows\\Fonts']
    .filter((d, i, a) => a.indexOf(d) === i && fs.existsSync(d));
}


function readFontNames(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return []; }
  return readFontNamesBuf(buf, file);
}

export function readFontNamesBuf(buf, file = null) {
  return readFontNames0(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)).map(f => ({ ...f, file }));
}

let INDEX = null;
const norm = s => String(s || '').toLowerCase().replace(/[\s_\-]+/g, '');
const STYLE_WORDS = /(regular|roman|book|normal|medium|bold|semibold|demibold|extrabold|ultrabold|black|heavy|light|extralight|ultralight|thin|hairline|italic|oblique|mt|std|pro)$/i;

function buildIndex() {
  const byPs = new Map(), byFamily = new Map(), faces = [];
  const dirs = fontDirs();
  const walk = (d, depth = 0) => {
    if (depth > 5) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(ttf|otf|ttc|otc)$/i.test(e.name)) for (const f of readFontNames(p)) faces.push(f);
    }
  };
  for (const d of dirs) walk(d);
  for (const f of faces) {
    if (!byPs.has(norm(f.ps))) byPs.set(norm(f.ps), f);
    for (const fam of new Set([f.family, ...f.families])) { const k = norm(fam); if (!byFamily.has(k)) byFamily.set(k, []); byFamily.get(k).push(f); }
  }
  INDEX = { byPs, byFamily, faces, dirs, registered: new Set() };
  return INDEX;
}
const index = () => INDEX || buildIndex();





const FONT_CTX = new AsyncLocalStorage();
const USER_REG = new Map();               
const USER_REG_MAX = +(process.env.PSD_EDITOR_USER_FONT_CACHE || 64);







export function withFonts(opts, fn) {
  const faces = (opts && opts.faces) || [], map = opts && opts.map && typeof opts.map === 'object' ? opts.map : null;
  if (!faces.length && !map) return fn();
  const byPs = new Map(), byFamily = new Map(), byId = new Map();
  for (const f of faces) {
    if (!byPs.has(norm(f.ps))) byPs.set(norm(f.ps), f);
    if (f.id) byId.set(f.id, f);
    for (const fam of new Set([f.family, ...(f.families || [])])) { const k = norm(fam); if (!byFamily.has(k)) byFamily.set(k, []); byFamily.get(k).push(f); }
  }
  const nmap = map ? new Map(Object.entries(map).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => [norm(k), v])) : null;
  return FONT_CTX.run({ byPs, byFamily, byId, faces, map: nmap }, fn);
}

function registerUser(face) {
  if (USER_REG.has(face.alias)) { const k = USER_REG.get(face.alias); USER_REG.delete(face.alias); USER_REG.set(face.alias, k); return face.alias; }
  let key = null;
  try { key = CANVAS.GlobalFonts.register(face.bytes(), face.alias); } catch { key = null; }
  if (!key) return null;
  USER_REG.set(face.alias, key);
  if (USER_REG.size > USER_REG_MAX) {
    const live = new Set(((FONT_CTX.getStore() || {}).faces || []).map(f => f.alias));
    const drop = [];
    for (const [a, k] of USER_REG) { if (USER_REG.size - drop.length <= USER_REG_MAX) break; if (!live.has(a)) drop.push([a, k]); }
    if (drop.length) {
      try { CANVAS.GlobalFonts.removeBatch ? CANVAS.GlobalFonts.removeBatch(drop.map(d => d[1])) : drop.forEach(d => CANVAS.GlobalFonts.remove(d[1])); } catch {  }
      for (const [a] of drop) USER_REG.delete(a);
    }
  }
  return face.alias;
}


export function forgetUserFont(id) {
  const a = 'u:' + id, k = USER_REG.get(a);
  if (!k) return;
  try { CANVAS.GlobalFonts.remove(k); } catch {  }
  USER_REG.delete(a);
}


function register(face) {
  if (face.user) return registerUser(face);
  const I = index();
  const alias = 'ps:' + face.ps;
  if (!I.registered.has(alias)) {
    try { CANVAS.GlobalFonts.registerFromPath(face.file, alias); } catch { return null; }
    I.registered.add(alias);
  }
  return alias;
}


const HAN_SANS = ['Noto Sans CJK SC', 'Source Han Sans SC', 'Source Han Sans CN', 'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'Microsoft YaHei', 'PingFang SC',
  'Hiragino Sans GB', 'Droid Sans Fallback', 'Noto Sans SC', 'Noto Sans CJK JP', 'Source Han Sans', 'IPAGothic'];
const HAN_SERIF = ['Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', 'Songti SC', 'AR PL UMing CN', 'Noto Serif CJK JP', ...HAN_SANS];
const LATIN_SANS = ['Liberation Sans', 'Arial', 'Helvetica', 'Helvetica Neue', 'DejaVu Sans', 'Noto Sans', 'Roboto'];
const LATIN_SERIF = ['Liberation Serif', 'Times New Roman', 'Times', 'DejaVu Serif', 'Noto Serif'];
const LATIN_MONO = ['Liberation Mono', 'Courier New', 'Courier', 'DejaVu Sans Mono'];
const systemFamilies = () => new Set(CANVAS.GlobalFonts.families.map(f => f.family));

const firstAvail = list => { const have = systemFamilies(), I = index(); return list.filter(f => have.has(f) || I.byFamily.has(norm(f))); };

function hintOf(psName) {
  const n = String(psName || '');
  if (/mono|courier|consol|code/i.test(n)) return 'mono';
  if (/song|sung|ming|serif|times|georgia|garamond|宋|明|kai|楷/i.test(n) && !/sans/i.test(n)) return 'serif';
  return 'sans';
}
const HAN = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;






export function resolveFont(psName, text = '') {
  if (!CANVAS) return { family: 'sans-serif', exact: false, matched: null };
  const I = index();
  const hint = hintOf(psName), han = HAN.test(text);
  const fallbacks = firstAvail(han ? (hint === 'serif' ? HAN_SERIF : HAN_SANS) : hint === 'serif' ? LATIN_SERIF : hint === 'mono' ? LATIN_MONO : LATIN_SANS)
    .concat(firstAvail(han ? LATIN_SANS : HAN_SANS));
  const want = process.env.PSD_EDITOR_FALLBACK_FONT;
  if (want) fallbacks.unshift(want);
  const U = FONT_CTX.getStore();
  
  const mappedTo = U && U.map && psName ? U.map.get(norm(psName)) : null;
  let face = null, mappedFrom = null;
  if (mappedTo) {
    face = (U.byId && U.byId.get(mappedTo)) || U.byPs.get(norm(mappedTo)) || I.byPs.get(norm(mappedTo))
      || (U.byFamily.get(norm(mappedTo)) || [])[0] || (I.byFamily.get(norm(mappedTo)) || [])[0] || null;
    if (face) mappedFrom = psName;
  }
  if (!face && psName) face = (U && U.byPs.get(norm(psName))) || I.byPs.get(norm(psName)) || null;
  const exact = !!face;
  if (!face && psName) {
    let fam = String(psName).split('-')[0];
    for (let k = 0; k < 4; k++) { const n2 = fam.replace(STYLE_WORDS, ''); if (n2 === fam || !n2) break; fam = n2; }   
    const list = [...((U && U.byFamily.get(norm(fam))) || []), ...(I.byFamily.get(norm(fam)) || [])];
    const style = (String(psName).split('-')[1] || 'Regular').toLowerCase();
    face = list.find(f => f.sub.toLowerCase().replace(/\s+/g, '') === style) || list.find(f => /regular|normal/i.test(f.sub)) || list[0] || null;
  }
  let primary = null;
  if (face) {
    
    
    primary = face.index === 0 ? register(face) : face.family;
    if (!primary && face.user) face = null;              
  }
  const quote = f => '"' + String(f).replace(/"/g, '') + '"';
  const list = [...(primary ? [primary] : []), ...fallbacks.filter(f => f !== primary)];
  const isBold = /bold|black|heavy|semibold|demibold|w[6-9]\b/i.test(String(psName || ''));
  const isItalic = /italic|oblique/i.test(String(psName || ''));
  const faceBold = face && /bold|black|heavy/i.test(face.sub + face.ps), faceItalic = face && /italic|oblique/i.test(face.sub + face.ps);
  const byName = face && face.index > 0;                 
  return {
    weight: byName && faceBold ? 'bold ' : '', style: byName && faceItalic ? 'italic ' : '',
    family: list.map(quote).concat('sans-serif').join(', '), exact: exact && !!face, matched: face ? face.ps : null,
    ...(face && face.user ? { userFont: true } : {}), ...(mappedFrom ? { mappedFrom } : {}),
    ...(exact && face ? {} : { substitute: face ? face.ps : (fallbacks[0] || 'sans-serif') }),
    synthBold: !!(isBold && !faceBold), synthItalic: !!(isItalic && !faceItalic),
  };
}

export function fontStatus() {
  if (!CANVAS) return { available: false, error: CANVAS_ERR, hint: '服务端文字重绘需要可选依赖 @napi-rs/canvas（npm ci 时按平台自动安装）' };
  const I = index();
  return { available: true, fonts: I.faces.length, dirs: I.dirs, userFonts: true, fallback: { han: firstAvail(HAN_SANS)[0] || null, latin: firstAvail(LATIN_SANS)[0] || null } };
}



const JUSTIFY_CODE = { left: 0, right: 1, center: 2, justify: 3, justifyRight: 4, justifyCenter: 5, justifyAll: 6 };

function modelOf(info) {
  const text = info.content || '';
  let tr = null; try { tr = getTextRuns(info); } catch { tr = null; }
  const fromInfo = { font: info.font, fontSize: info.fontSize, color: info.color || [0, 0, 0, 1], fauxBold: !!info.bold && !/bold|black|heavy/i.test(info.font || ''),
    fauxItalic: !!info.italic && !/italic|oblique/i.test(info.font || ''), underline: !!info.underline, strikethrough: !!info.strikethrough,
    tracking: info.tracking || 0, leading: info.leading, hScale: info.hScale || 1, vScale: info.vScale || 1, baselineShift: info.baselineShift || 0,
    caps: info.caps || 'none', baseline: info.baseline || 'normal', autoKern: info.autoKern !== false };
  let runs;
  if (tr && tr.runs && tr.runs.length && tr.text === text) {
    runs = tr.runs.map(r => ({ font: r.font, fontSize: r.fontSize, color: r.colorF || [0, 0, 0, 1], fauxBold: !!(r.faux && r.faux.bold), fauxItalic: !!(r.faux && r.faux.italic),
      underline: !!r.underline, strikethrough: !!r.strikethrough, tracking: r.tracking || 0, leading: r.autoLeading ? null : r.leading,
      hScale: r.hScale || 1, vScale: r.vScale || 1, baselineShift: r.baselineShift || 0, caps: r.caps || 'none', baseline: r.baseline || 'normal', autoKern: true,
      from: r.from, to: r.to })).filter(r => r.to > r.from);
  }
  if (!runs || !runs.length) runs = [{ ...fromInfo, from: 0, to: text.length }];
  const paraSrc = tr && tr.text === text && tr.paragraphs && tr.paragraphs.length ? tr.paragraphs : null;
  const paragraphs = [];
  let p0 = 0;
  for (let k = 0; k <= text.length; k++) if (k === text.length || text[k] === '\n') {
    let src = null;
    if (paraSrc) { const at = paraSrc.findIndex(sp => p0 >= sp.from && p0 < sp.to); src = paraSrc[at >= 0 ? at : paraSrc.length - 1]; }
    const para = src ? { justification: src.justification, startIndent: src.indent.left, endIndent: src.indent.right, firstLineIndent: src.indent.firstLine,
      spaceBefore: src.spaceBefore, spaceAfter: src.spaceAfter, autoLeading: src.autoLeading }
      : { justification: info.justification != null ? info.justification : JUSTIFY_CODE[info.align] || 0, startIndent: info.startIndent || 0, endIndent: info.endIndent || 0,
          firstLineIndent: info.firstLineIndent || 0, spaceBefore: info.spaceBefore || 0, spaceAfter: info.spaceAfter || 0, autoLeading: info.autoLeading || 1.2 };
    paragraphs.push({ ...para, from: p0, to: k + 1 });
    p0 = k + 1;
  }
  return { text, runs, paragraphs, orientation: info.orientation, shape: info.shape, box: info.box, pointBase: info.pointBase, transform: info.transform || [1, 0, 0, 1, 0, 0] };
}


const runFont = (run, fam, scale = 1) => `${run.fauxItalic || fam.synthItalic ? 'italic ' : fam.style || ''}${run.fauxBold || fam.synthBold ? 'bold ' : fam.weight || ''}${run.fontSize * scale}px ${fam.family}`;
function setRunFont(ctx, run, fam, scale = 1) {
  const f = runFont(run, fam, scale);
  if (ctx.__f !== f) { ctx.font = f; ctx.__f = f; }
  const ls = ((run.tracking || 0) / 1000 * run.fontSize * scale) + 'px';
  if ('letterSpacing' in ctx && ctx.__ls !== ls) { ctx.letterSpacing = ls; ctx.__ls = ls; }
  if ('fontKerning' in ctx) ctx.fontKerning = run.autoKern === false ? 'none' : 'normal';
}
function layoutApi(ctx, famOf) {
  const mcache = new Map();
  return {
    measure(t, run, scale) { setRunFont(ctx, run, famOf(run), scale); return ctx.measureText(t).width * (run.hScale || 1); },
    metrics(run, scale) {
      const key = runFont(run, famOf(run), scale);
      if (mcache.has(key)) return mcache.get(key);
      setRunFont(ctx, run, famOf(run), scale);
      const size = run.fontSize * scale;
      let ascent = size * 0.88, descent = size * 0.12;
      try { const m = ctx.measureText('国Hg'); if (m && m.fontBoundingBoxAscent > 0) { ascent = m.fontBoundingBoxAscent; descent = m.fontBoundingBoxDescent || descent; } } catch { }
      const out = { ascent: ascent * (run.vScale || 1), descent: descent * (run.vScale || 1) };
      mcache.set(key, out);
      return out;
    },
  };
}
function drawRich(ctx, lay, famOf) {
  ctx.textBaseline = 'alphabetic';
  for (const ln of lay.lines) ln.pieces.forEach((p, pi) => {
    if (!p.text) return;
    const nx = ln.pieces[pi + 1];
    const lastBody = !ln.pieces.slice(pi + 1).some(q => q.body);
    const lineSpan = !p.body && lastBody ? 0 : (nx && nx.run.underline === p.run.underline && nx.run.strikethrough === p.run.strikethrough && !(lastBody && !nx.body) ? nx.x - p.x : p.w);
    const run = p.run, fs2 = run.fontSize * p.scale;
    ctx.__f = undefined; setRunFont(ctx, run, famOf(run), p.scale);
    const [r, g, b, a] = run.color || [0, 0, 0, 1];
    ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a == null ? 1 : a})`;
    ctx.save();
    ctx.translate(p.x, ln.y - p.rise);
    ctx.scale(run.hScale || 1, run.vScale || 1);
    ctx.fillText(p.text, 0, 0);
    const w = lineSpan / (run.hScale || 1), th = Math.max(0.5, run.fontSize / 16);
    if (run.underline && w > 0) ctx.fillRect(0, run.fontSize * 0.1 + p.rise, w, th);
    if (run.strikethrough && w > 0) ctx.fillRect(0, -fs2 * 0.3, w, th);
    ctx.restore();
  });
}
function antiAlias(d, mode) {
  const g = { antiAliasNone: 0, antiAliasSharp: 1.15, antiAliasCrisp: 1.3, antiAliasStrong: 1.7, antiAliasSmooth: 1.45, antiAliasPlatformLCD: 1.35, antiAliasPlatformGray: 1.35 }[mode] ?? 1.45;
  let peak = 0;
  for (let k = 3; k < d.length; k += 4) if (d[k] > peak) peak = d[k];
  if (!peak) return;
  const lut = new Uint8ClampedArray(256);
  for (let a = 0; a < 256; a++) { const t = Math.min(1, a / peak); lut[a] = g === 0 ? (t >= .5 ? peak : 0) : Math.round(peak * Math.pow(t, 1 / g)); }
  for (let k = 3; k < d.length; k += 4) d[k] = lut[d[k]];
}




export function renderTextLayer(buf, layerIndex) {
  if (!CANVAS) return null;
  const ab = toAB(buf);
  const full = parsePsdFull(ab);
  const L = full.layers[layerIndex];
  if (!L || !L.text) return null;
  const info = getTextInfo(L);
  if (!info) return null;
  if (!String(info.content || '').trim()) return { rgba: null, bounds: null, empty: true, warnings: [] };   
  const W = full.header ? full.header.width : parsePsdDocument(ab).header.width;
  const H = full.header ? full.header.height : parsePsdDocument(ab).header.height;
  const model = modelOf(info);
  const warnings = [];
  const fams = new Map(), missing = new Set();
  const famOf = run => {
    const key = run.font || info.font || '';
    if (!fams.has(key)) {
      const r = resolveFont(key, model.text);
      fams.set(key, r);
      if (!r.exact && key) missing.add(`${key} → ${r.substitute || 'sans-serif'}`);
    }
    return fams.get(key);
  };
  const T = info.transform || [1, 0, 0, 1, 0, 0];
  const probe = CANVAS.createCanvas(8, 8).getContext('2d');
  const lay = layoutRichText(model, layoutApi(probe, famOf));
  
  const b = lay.bounds || { left: 0, top: 0, right: 1, bottom: 1 };
  const pts = [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]].map(([x, y]) => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const slack = Math.max(8, Math.ceil(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.08));
  
  const MARGIN = 1024;
  const ox = Math.max(-MARGIN, Math.floor(Math.min(...xs)) - slack), oy = Math.max(-MARGIN, Math.floor(Math.min(...ys)) - slack);
  const cw = Math.max(1, Math.min(W + MARGIN, Math.ceil(Math.max(...xs)) + slack) - ox), ch = Math.max(1, Math.min(H + MARGIN, Math.ceil(Math.max(...ys)) + slack) - oy);
  if (cw * ch > MAX_PX) { warnings.push(`文字层 ${layerIndex} 渲染区域 ${cw}×${ch} 过大，跳过重绘`); return { rgba: null, bounds: null, warnings }; }
  const cv = CANVAS.createCanvas(cw, ch), ctx = cv.getContext('2d');
  ctx.setTransform(T[0], T[1], T[2], T[3], T[4] - ox, T[5] - oy);
  drawRich(ctx, lay, famOf);
  const img = ctx.getImageData(0, 0, cw, ch);
  const d = img.data;
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { rgba: null, bounds: null, empty: true, warnings };
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(d.subarray(((y + y0) * cw + x0) * 4, ((y + y0) * cw + x1 + 1) * 4), y * w * 4);
  
  antiAlias(out, info.antiAlias);
  const ws = info.warp && info.warp.warpStyle && info.warp.warpStyle.value;
  if (ws && ws !== 'warpNone') warnings.push(`文字层 ${layerIndex}「${L.unicodeName || L.name}」带文字变形（${ws}），服务端预览按不变形的排版近似；PS 打开后按变形重排`);
  if (missing.size) warnings.push(`文字层 ${layerIndex}「${L.unicodeName || L.name}」缺字体，用替代字体重绘：${[...missing].join('；')}（PS 打开后会按它自己的字体重排；想让服务端也用原字体：把字体传进字体库 POST /api/fonts / MCP upload_font，或本次请求带 font 字段；名字对不上用 output.fontMap 指定）`);
  void W; void H;
  return { rgba: out, bounds: { left: ox + x0, top: oy + y0, right: ox + x0 + w, bottom: oy + y0 + h }, warnings };
}


export function rerenderTextLayers(buf, indices) {
  const warnings = [], rendered = [];
  let ab = toAB(buf);
  if (!CANVAS) return { buffer: toBuf(ab), rendered, warnings: ['服务端没有可用的文字渲染器（缺可选依赖 @napi-rs/canvas），文字栅格仍是旧的；PS 打开后会自己重排'] };
  for (const i of [...new Set(indices)].sort((a, b) => a - b)) {
    let r;
    try { r = renderTextLayer(ab, i); } catch (e) { warnings.push(`文字层 ${i} 重绘失败：${e.message}`); continue; }
    if (!r) continue;
    warnings.push(...r.warnings);
    if (r.empty) {
      
      try {
        const b0 = parsePsdDocument(ab).layers[i].bounds;
        ab = toAB(applyEdits(ab, [{ op: 'replaceLayerPixels', index: i, rgba: { data: new Uint8Array(4), width: 1, height: 1 }, bounds: { left: b0.left, top: b0.top, right: b0.left + 1, bottom: b0.top + 1 } }], { verify: false }).buffer);
        rendered.push(i);
      } catch (e) { warnings.push(`文字层 ${i} 清空栅格失败：${e.message}`); }
      continue;
    }
    if (!r.rgba) continue;
    try {
      const bw = r.bounds.right - r.bounds.left, bh = r.bounds.bottom - r.bounds.top;
      ab = toAB(applyEdits(ab, [{ op: 'replaceLayerPixels', index: i, rgba: { data: new Uint8Array(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength), width: bw, height: bh }, bounds: r.bounds }], { verify: false }).buffer);
      rendered.push(i);
    } catch (e) { warnings.push(`文字层 ${i} 栅格写回失败：${e.message}`); }
  }
  return { buffer: toBuf(ab), rendered, warnings };
}


export async function renderTextOp(buf, op) {
  const doc = parsePsdDocument(toAB(buf));
  let idx = Array.isArray(op.indices) ? op.indices : (op.index != null ? [op.index] : doc.layers.map((l, i) => (l.text ? i : -1)).filter(i => i >= 0));
  idx = idx.filter(i => doc.layers[i] && doc.layers[i].text);
  if (!idx.length) { const e = new Error('renderText：没有可重绘的文字层'); e.name = 'EditOpError'; e.code = 'target'; throw e; }
  if (!CANVAS) { const e = new Error('renderText：服务端没有可用的文字渲染器（缺可选依赖 @napi-rs/canvas）'); e.name = 'EditOpError'; e.code = 'op'; throw e; }
  const r = rerenderTextLayers(buf, idx);
  return { buffer: r.buffer, affected: r.rendered, warnings: r.warnings, pixels: r.rendered.length > 0,
    note: `重绘文字层 ${r.rendered.join(', ') || '（无）'}`, meta: { rendered: r.rendered } };
}
