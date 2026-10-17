



















import { remapRunSpans, engineCharPatch, engineParaPatch, applyStylePatch } from './psd-text.js';



export const PRIVATE_CHAR_KEYS = ['otContextual', 'otSwash', 'otOldStyle', 'otStylistic', 'otTitling', 'otOrdinals', 'otFractions',
  'tcy', 'warichu', 'emphasis', 'charRotate', 'kernMode', 'charStyle',
  'fracWidths', 'sysLayout', 'romanUpright'];   

export const PRIVATE_PARA_KEYS = ['kinsokuSet', 'mojikumi', 'paraStyle',
  'worldReady', 'hyphCaps', 'singleWordJust', 'burasagariForced'];   

export const PARA_KEYS = ['align', 'startIndent', 'endIndent', 'firstLineIndent', 'spaceBefore', 'spaceAfter', 'hyphenate',
  'burasagari', 'kinsokuOrder', 'hanging', 'everyLineComposer',
  'wordSpacing', 'letterSpacing', 'glyphSpacing', 'autoLeading', 'leadingType', 'hyphWordSize', 'hyphPre', 'hyphPost', 'hyphLimit', 'hyphZone'];

export const CHAR_KEYS = ['fontSize', 'color', 'bold', 'italic', 'underline', 'strikethrough', 'tracking', 'leading', 'hScale', 'vScale',
  'baselineShift', 'caps', 'baseline', 'autoKern', 'ligatures', 'dligatures', 'tsume', 'noBreak', 'charDirection', 'hindiNumbers', 'kerning', 'kashida', 'diacriticPos'];
export const isParaKey = k => PARA_KEYS.includes(k) || PRIVATE_PARA_KEYS.includes(k);
export const isPrivateKey = k => PRIVATE_CHAR_KEYS.includes(k) || PRIVATE_PARA_KEYS.includes(k);


export const OT_FEATURES = [
  ['ligatures', '标准连字', 'liga', true], ['otContextual', '上下文替代字', 'calt', false], ['dligatures', '自由连字', 'dlig', false],
  ['otSwash', '花饰字', 'swsh', false], ['otOldStyle', '旧式', 'onum', false], ['otStylistic', '文体替代字', 'salt', false],
  ['otTitling', '标题替代字', 'titl', false], ['otOrdinals', '序数字', 'ordn', false], ['otFractions', '分数字', 'frac', false]];

export function otFeatureCss(run) {
  const out = [];
  if (run.ligatures === false) out.push('"liga" 0', '"clig" 0');
  if (run.dligatures) out.push('"dlig" 1');
  if (run.otContextual === false) out.push('"calt" 0');
  for (const [k, , tag] of OT_FEATURES) if (k.startsWith('ot') && k !== 'otContextual' && run[k]) out.push(`"${tag}" 1`);
  return out.join(', ');
}


const samePatch = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
const clean = p => { const o = {}; for (const [k, v] of Object.entries(p || {})) if (v !== undefined) o[k] = v; return o; };
function mergeSegs(segs) {
  const out = [];
  for (const s of segs) {
    if (s.to <= s.from) continue;
    const last = out[out.length - 1];
    if (last && last.to === s.from && samePatch(last.patch, s.patch)) last.to = s.to;
    else out.push({ from: s.from, to: s.to, patch: s.patch });
  }
  return out;
}

export function segApply(segs, len, from, to, patch) {
  from = Math.max(0, Math.min(len, from)); to = Math.max(from, Math.min(len, to));
  let base = segs && segs.length ? segs.map(s => ({ ...s })) : [{ from: 0, to: len, patch: {} }];
  if (base[base.length - 1].to < len) base.push({ from: base[base.length - 1].to, to: len, patch: {} });
  const out = [];
  for (const s of base) {
    const cuts = [s.from, Math.max(s.from, Math.min(s.to, from)), Math.max(s.from, Math.min(s.to, to)), s.to];
    for (let k = 0; k < 3; k++) {
      const a = cuts[k], b = cuts[k + 1]; if (b <= a) continue;
      const inside = a >= from && b <= to && to > from;
      const p = inside ? { ...s.patch, ...patch } : s.patch;
      out.push({ from: a, to: b, patch: clean(p) });
    }
  }
  return mergeSegs(out);
}

export function segStrip(segs, keys) {
  if (!segs || !segs.length) return segs;
  const ks = new Set(keys);
  return mergeSegs(segs.map(s => { const p = {}; for (const [k, v] of Object.entries(s.patch)) if (!ks.has(k)) p[k] = v; return { ...s, patch: p }; }));
}

export function segRemap(segs, oldText, newText) {
  if (!segs || !segs.length) return [];
  if (oldText === newText) return segs;
  const N = String(newText).length;
  if (!String(oldText).length) return N ? [{ from: 0, to: N, patch: { ...segs[0].patch } }] : [];
  const full = segs[segs.length - 1].to < oldText.length ? [...segs, { from: segs[segs.length - 1].to, to: oldText.length, patch: {} }] : segs;
  const sp = remapRunSpans(oldText, newText, full.map(s => [s.from, Math.min(s.to, oldText.length)]));
  return mergeSegs(full.map((s, k) => ({ from: sp[k][0], to: sp[k][1], patch: s.patch })));
}
export const segsEmpty = segs => !segs || !segs.some(s => Object.keys(s.patch).length);

export function segAt(segs, pos) {
  if (!segs) return {};
  for (const s of segs) if (pos >= s.from && pos < s.to) return s.patch;
  return segs.length && pos >= segs[segs.length - 1].to ? segs[segs.length - 1].patch : {};
}

export function paraExtent(text, from, to) {
  const t = String(text);
  const a = t.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const bRaw = t.indexOf('\n', Math.max(from, to - 1 < from ? from : to - 1));
  const b = bRaw < 0 ? t.length : bRaw + 1;
  return [from === 0 ? 0 : (t[from - 1] === '\n' ? from : a), Math.min(t.length, b)];
}

export function splitPrivate(segs) {
  const pub = [], priv = [];
  for (const s of segs || []) {
    const a = {}, b = {};
    for (const [k, v] of Object.entries(s.patch)) (isPrivateKey(k) ? b : a)[k] = v;
    pub.push({ from: s.from, to: s.to, patch: a }); priv.push({ from: s.from, to: s.to, patch: b });
  }
  return { pub: mergeSegs(pub), priv: mergeSegs(priv) };
}


const cloneRun = r => JSON.parse(JSON.stringify(r));
const spansOf = lens => { let p = 0; return lens.map(n => [p, p += Math.max(0, +n || 0)]); };


export function fontIndexFor(ed, psName) {
  const R = ed.ResourceDict || (ed.ResourceDict = {});
  const set = R.FontSet || (R.FontSet = []);
  const k = set.findIndex(f => f && f.Name === psName);
  if (k >= 0) return k;
  const entry = { Name: psName, Script: 0, FontType: 1, Synthetic: 0 };
  const idx = set.length;
  set.push({ ...entry });
  const D = ed.DocumentResources && ed.DocumentResources.FontSet;
  if (Array.isArray(D)) { while (D.length < idx) D.push({ ...set[D.length] }); D[idx] = { ...entry }; }
  return idx;
}





export function applyRangeStyles(ed, segs) {
  const E = ed && ed.EngineDict; if (!E || !E.Editor) throw new Error('applyRangeStyles：EngineData 缺少 EngineDict.Editor');
  const raw = String(E.Editor.Text || '');
  const L = raw.length;
  const R = ed.ResourceDict || {};
  const base = (R.StyleSheetSet && R.StyleSheetSet[0] && R.StyleSheetSet[0].StyleSheetData) || {};
  const pbase = (R.ParagraphSheetSet && R.ParagraphSheetSet[0] && R.ParagraphSheetSet[0].Properties) || {};
  const list = (segs || []).filter(s => s.to > s.from && Object.keys(s.patch || {}).length);
  if (!list.length) return ed;
  
  const SR = E.StyleRun;
  const charSegs = list.map(s => {
    const p = {}; for (const [k, v] of Object.entries(s.patch)) if (!isParaKey(k) && !isPrivateKey(k)) p[k] = v;
    
    return { from: s.from, to: s.to >= L - 1 ? L : s.to, patch: p };
  }).filter(s => Object.keys(s.patch).length);
  if (SR && Array.isArray(SR.RunArray) && SR.RunArray.length && charSegs.length) {
    const lens = Array.isArray(SR.RunLengthArray) && SR.RunLengthArray.length === SR.RunArray.length ? SR.RunLengthArray : [L];
    const spans = spansOf(lens);
    const cuts = new Set([0, L]);
    for (const [a, b] of spans) { cuts.add(Math.min(L, a)); cuts.add(Math.min(L, b)); }
    for (const s of charSegs) { cuts.add(Math.min(L, s.from)); cuts.add(Math.min(L, s.to)); }
    const cs = [...cuts].sort((x, y) => x - y);
    const arr = [], ls = [];
    for (let k = 0; k + 1 < cs.length; k++) {
      const a = cs[k], b = cs[k + 1]; if (b <= a) continue;
      let src = spans.findIndex(([x, y]) => a >= x && a < y); if (src < 0) src = SR.RunArray.length - 1;
      const run = cloneRun(SR.RunArray[Math.min(src, SR.RunArray.length - 1)]);
      for (const s of charSegs) if (a >= s.from && b <= s.to) {
        if (!run.StyleSheet) run.StyleSheet = {};
        const d = run.StyleSheet.StyleSheetData = { ...(run.StyleSheet.StyleSheetData || {}) };
        const { font, ...rest } = s.patch;
        const ep = engineCharPatch(rest);
        if (font && font.psName) ep.Font = fontIndexFor(ed, font.psName);
        applyStylePatch(d, ep, base);
      }
      const prev = arr.length - 1;
      if (prev >= 0 && JSON.stringify(arr[prev]) === JSON.stringify(run)) ls[prev] += b - a;
      else { arr.push(run); ls.push(b - a); }
    }
    SR.RunArray = arr; SR.RunLengthArray = ls;
  }
  
  const PR = E.ParagraphRun;
  if (PR && Array.isArray(PR.RunArray) && PR.RunArray.length) {
    const spans = spansOf(PR.RunLengthArray || [L]);
    PR.RunArray = PR.RunArray.map((r, k) => {
      const [a, b] = spans[k] || [0, L];
      const p = {};
      for (const s of list) if (s.from < b && s.to > a) for (const [kk, v] of Object.entries(s.patch)) if (PARA_KEYS.includes(kk) && p[kk] === undefined) p[kk] = v;
      if (!Object.keys(p).length) return r;
      const out = cloneRun(r);
      if (!out.ParagraphSheet) out.ParagraphSheet = {};
      const d = out.ParagraphSheet.Properties = { ...(out.ParagraphSheet.Properties || {}) };
      applyStylePatch(d, engineParaPatch(p), pbase);
      return out;
    });
  }
  return ed;
}


const numOr = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
const CAPS = ['none', 'small', 'all'], BASE = ['normal', 'superscript', 'subscript'];
const JUST = ['left', 'right', 'center', 'justify', 'justifyRight', 'justifyCenter', 'justifyAll'];

export function semanticFromEngine(d, fonts = []) {
  const o = {};
  if (!d || typeof d !== 'object') return o;
  if (d.Font != null && fonts[d.Font]) o.font = { psName: fonts[d.Font] };
  if (d.FontSize != null) o.fontSize = numOr(d.FontSize, 12);
  const c = d.FillColor && d.FillColor.Values;
  if (Array.isArray(c) && c.length === 4) o.color = [c[1], c[2], c[3], numOr(c[0], 1)];
  const B = { FauxBold: 'bold', FauxItalic: 'italic', Underline: 'underline', Strikethrough: 'strikethrough', AutoKerning: 'autoKern',
    Ligatures: 'ligatures', DLigatures: 'dligatures', NoBreak: 'noBreak', HindiNumbers: 'hindiNumbers' };
  for (const [K, k] of Object.entries(B)) if (d[K] != null) o[k] = !!d[K];
  const N = { Tracking: 'tracking', HorizontalScale: 'hScale', VerticalScale: 'vScale', BaselineShift: 'baselineShift', Tsume: 'tsume', CharacterDirection: 'charDirection',
    Kerning: 'kerning', Kashida: 'kashida', DiacriticPos: 'diacriticPos' };
  for (const [K, k] of Object.entries(N)) if (d[K] != null) o[k] = numOr(d[K], 0);
  if (d.AutoLeading === true) o.leading = null; else if (d.AutoLeading === false && d.Leading != null) o.leading = numOr(d.Leading, null);
  if (d.FontCaps != null) o.caps = CAPS[d.FontCaps] || 'none';
  if (d.FontBaseline != null) o.baseline = BASE[d.FontBaseline] || 'normal';
  return o;
}
export function semanticParaFromEngine(p) {
  const o = {};
  if (!p || typeof p !== 'object') return o;
  if (p.Justification != null) o.align = JUST[p.Justification] || 'left';
  const N = { StartIndent: 'startIndent', EndIndent: 'endIndent', FirstLineIndent: 'firstLineIndent', SpaceBefore: 'spaceBefore', SpaceAfter: 'spaceAfter', KinsokuOrder: 'kinsokuOrder',
    AutoLeading: 'autoLeading', LeadingType: 'leadingType', HyphenatedWordSize: 'hyphWordSize', PreHyphen: 'hyphPre', PostHyphen: 'hyphPost', ConsecutiveHyphens: 'hyphLimit', Zone: 'hyphZone' };
  for (const [K, k] of Object.entries({ WordSpacing: 'wordSpacing', LetterSpacing: 'letterSpacing', GlyphSpacing: 'glyphSpacing' })) if (Array.isArray(p[K]) && p[K].length >= 3) o[k] = p[K].slice(0, 3).map(Number);
  for (const [K, k] of Object.entries(N)) if (p[K] != null) o[k] = numOr(p[K], 0);
  const B = { AutoHyphenate: 'hyphenate', Burasagari: 'burasagari', Hanging: 'hanging', EveryLineComposer: 'everyLineComposer' };
  for (const [K, k] of Object.entries(B)) if (p[K] != null) o[k] = !!p[K];
  return o;
}

export function readStyleSheets(ed) {
  const src = (ed && (ed.DocumentResources || ed.ResourceDict)) || {};
  const R = (ed && ed.ResourceDict) || {};
  const fonts = (R.FontSet || src.FontSet || []).map(f => f && f.Name);
  const chars = (src.StyleSheetSet || R.StyleSheetSet || []).slice(1).map(s => ({ name: String(s && s.Name || '字符样式'), attrs: semanticFromEngine(s && s.StyleSheetData, fonts) }));
  const paras = (src.ParagraphSheetSet || R.ParagraphSheetSet || []).slice(1).map(s => ({ name: String(s && s.Name || '段落样式'), attrs: semanticParaFromEngine(s && s.Properties) }));
  
  const kin = (src.KinsokuSet || R.KinsokuSet || []).filter(k => k && !/^PhotoshopKinsoku(Hard|Soft)$/.test(String(k.Name || '')))
    .map(k => ({ name: String(k.Name || '避头尾集'), noStart: String(k.NoStart || ''), noEnd: String(k.NoEnd || ''), keep: String(k.Keep || ''), hanging: String(k.Hanging || '') }));
  return { char: chars, para: paras, kinsoku: kin };
}

export function writeStyleSheets(ed, sheets) {
  const targets = [ed.ResourceDict, ed.DocumentResources].filter(Boolean);
  for (const T of targets) {
    const ss = Array.isArray(T.StyleSheetSet) && T.StyleSheetSet.length ? T.StyleSheetSet : [{ Name: '正常 RGB', StyleSheetData: {} }];
    T.StyleSheetSet = [ss[0], ...(sheets.char || []).map(s => {
      const { font, ...rest } = s.attrs || {};
      const d = engineCharPatch(pickDefined(rest, CHAR_KEYS));
      if (font && font.psName) d.Font = fontIndexFor(ed, font.psName);
      return { Name: s.name, StyleSheetData: d };
    })];
    const ps = Array.isArray(T.ParagraphSheetSet) && T.ParagraphSheetSet.length ? T.ParagraphSheetSet : [{ Name: '正常 RGB', DefaultStyleSheet: 0, Properties: {} }];
    T.ParagraphSheetSet = [ps[0], ...(sheets.para || []).map(s => ({ Name: s.name, DefaultStyleSheet: 0, Properties: engineParaPatch(pickDefined(s.attrs || {}, PARA_KEYS)) }))];
    
    if (Array.isArray(sheets.kinsoku)) {
      const builtin = (Array.isArray(T.KinsokuSet) ? T.KinsokuSet : []).filter(k => k && /^PhotoshopKinsoku(Hard|Soft)$/.test(String(k.Name || '')));
      T.KinsokuSet = [...builtin, ...sheets.kinsoku.map(k => ({ Name: k.name, NoStart: k.noStart || '', NoEnd: k.noEnd || '', Keep: k.keep || '', Hanging: k.hanging || '' }))];
    }
  }
  return ed;
}
function pickDefined(o, keys) { const out = {}; for (const k of keys) if (o[k] !== undefined) out[k] = o[k]; return out; }






function profiles(font, gid, rows, y0, y1) {
  const L = new Float64Array(rows).fill(Infinity), Rr = new Float64Array(rows).fill(-Infinity);
  let o; try { o = font.outline(gid); } catch { o = null; }
  const put = (x, y) => { const r = Math.floor((y - y0) / (y1 - y0) * rows); if (r < 0 || r >= rows) return; if (x < L[r]) L[r] = x; if (x > Rr[r]) Rr[r] = x; };
  const line = (ax, ay, bx, by) => {
    const steps = Math.max(1, Math.ceil(Math.abs(by - ay) / ((y1 - y0) / rows) * 2));
    for (let s = 0; s <= steps; s++) { const t = s / steps; put(ax + (bx - ax) * t, ay + (by - ay) * t); }
  };
  for (const c of Array.isArray(o) ? o : []) {
    let cx = 0, cy = 0, sx = 0, sy = 0;
    for (const sg of (c && c.segs) || []) {
      const p = sg.p || [];
      if (sg.t === 'M') { cx = sx = p[0]; cy = sy = p[1]; continue; }
      if (sg.t === 'L') { line(cx, cy, p[0], p[1]); cx = p[0]; cy = p[1]; continue; }
      const N = 8; let px = cx, py = cy;
      for (let k = 1; k <= N; k++) {
        const t = k / N, m = 1 - t;
        let x, y;
        if (sg.t === 'Q') { x = m * m * cx + 2 * m * t * p[0] + t * t * p[2]; y = m * m * cy + 2 * m * t * p[1] + t * t * p[3]; }
        else { x = m * m * m * cx + 3 * m * m * t * p[0] + 3 * m * t * t * p[2] + t * t * t * p[4]; y = m * m * m * cy + 3 * m * m * t * p[1] + 3 * m * t * t * p[3] + t * t * t * p[5]; }
        line(px, py, x, y); px = x; py = y;
      }
      cx = px; cy = py;
    }
    if (c && c.closed !== false) line(cx, cy, sx, sy);
  }
  return { L, R: Rr };
}

export function cmapCodePoints(u8, limit = 70000) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  let base = tag(0) === 'ttcf' ? dv.getUint32(12) : 0;
  const n = dv.getUint16(base + 4);
  let cmap = -1;
  for (let k = 0; k < n; k++) { const r = base + 12 + k * 16; if (tag(r) === 'cmap') cmap = dv.getUint32(r + 8); }
  if (cmap < 0) return [];
  let best = null, sc = -1;
  const nSub = dv.getUint16(cmap + 2);
  for (let k = 0; k < nSub; k++) {
    const r = cmap + 4 + k * 8, pid = dv.getUint16(r), eid = dv.getUint16(r + 2), so = cmap + dv.getUint32(r + 4), fmt = dv.getUint16(so);
    const s2 = fmt === 12 && (pid === 3 && eid === 10 || pid === 0) ? 3 : fmt === 4 && (pid === 3 || pid === 0) ? 2 : -1;
    if (s2 > sc) { sc = s2; best = { fmt, so }; }
  }
  const out = [];
  if (!best) return out;
  if (best.fmt === 12) {
    const ng = dv.getUint32(best.so + 12);
    for (let m = 0; m < ng && out.length < limit; m++) { const r = best.so + 16 + m * 12; for (let c = dv.getUint32(r), e = dv.getUint32(r + 4); c <= e && out.length < limit; c++) out.push(c); }
  } else {
    const so = best.so, segX2 = dv.getUint16(so + 6), ends = so + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2; s += 2) {
      const e = dv.getUint16(ends + s), st = dv.getUint16(starts + s), d = dv.getInt16(deltas + s), ro = dv.getUint16(ranges + s);
      for (let c = st; c <= e && c !== 0xffff && out.length < limit; c++) {
        const g = !ro ? (c + d) & 0xffff : (() => { const gi = dv.getUint16(ranges + s + ro + (c - st) * 2); return gi ? (gi + d) & 0xffff : 0; })();
        if (g) out.push(c);
      }
    }
  }
  return out.filter(c => c >= 0x20 && !(c >= 0x7f && c < 0xa0));
}

export function opticalKerner(font) {
  if (!font || typeof font.glyphIndex !== 'function') return null;
  const upm = font.unitsPerEm || 1000;
  const rows = 24, y0 = 0, y1 = upm * 0.72;
  const memo = new Map(), pair = new Map();
  const prof = cp => {
    if (memo.has(cp)) return memo.get(cp);
    const g = font.glyphIndex(cp);
    const v = g ? { ...profiles(font, g, rows, y0, y1), adv: font.advance(g) } : null;
    memo.set(cp, v); return v;
  };
  const cap = upm * 0.3;
  const gap = (a, b) => {
    const A = prof(a), B = prof(b); if (!A || !B) return null;
    let sum = 0, n = 0;
    for (let r = 0; r < rows; r++) {
      if (!isFinite(A.R[r]) || !isFinite(B.L[r])) continue;
      sum += Math.min(cap, (A.adv - A.R[r]) + B.L[r]); n++;
    }
    return n >= 3 ? sum / n : null;
  };
  const neutral = [[0x6e, 0x6e], [0x48, 0x48], [0x53e3, 0x53e3], [0x4e00, 0x4e00]].map(([a, b]) => gap(a, b)).find(v => v != null);
  const target = neutral != null ? neutral : upm * 0.08;
  return (a, b) => {
    const key = a * 0x110000 + b;
    if (pair.has(key)) return pair.get(key);
    const g = gap(a, b);
    const v = g == null ? 0 : Math.max(-0.2, Math.min(0.2, (target - g) * 0.6 / upm));
    pair.set(key, v); return v;
  };
}

export default { segApply, segStrip, segRemap, segAt, applyRangeStyles, readStyleSheets, writeStyleSheets, otFeatureCss, opticalKerner };
