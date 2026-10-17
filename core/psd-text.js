








import { parseEngineData } from './engine-data.js';
import { readTextOnPath } from './text-path.js';
import { languageNameOf, languageLabelOf, languageCodeOf } from './text-language.js';

const numOr = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;





const alignOf = (j) => j === 1 ? 'right' : j === 2 ? 'center' : j === 4 ? 'justifyRight' : j === 5 ? 'justifyCenter' : j === 6 ? 'justifyAll' : (j >= 3 ? 'justify' : 'left');



function colorOf(col) {
  const v = col && col.Values;
  if (!Array.isArray(v)) return null;
  if (v.length >= 5) {                                  
    const [a, c, m, y, k] = v;
    return [(1 - Math.min(1, c + k)), (1 - Math.min(1, m + k)), (1 - Math.min(1, y + k)), numOr(a, 1)];
  }
  if (v.length === 4) return [v[1], v[2], v[3], numOr(v[0], 1)];
  if (v.length === 2) return [v[1], v[1], v[1], numOr(v[0], 1)];
  return null;
}


const nameBold = (n) => !!n && /bold|black|heavy/i.test(n);
const nameItalic = (n) => !!n && /italic|oblique/i.test(n);


const displayText = (raw) => String(raw).replace(/\r/g, '\n').replace(/\n$/, '');






export function readDynamicText(desc) {
  const d = desc && desc.dynamicText;
  if (!d || typeof d !== 'object') return null;
  const sh = d.shape && (d.shape.value || d.shape);
  const n = (v, x) => typeof v === 'number' && isFinite(v) ? v : (v && typeof v.value === 'number' ? v.value : x);
  return { shape: ['stack', 'circle', 'arch', 'bow'].includes(sh) ? sh : 'stack', lineGap: n(d.lineGap, 0.1), wordGap: n(d.wordGap, 0) };
}
export function buildDynamicTextDesc(dyn) {
  return { __classID: 'dynamicText', __name: '', shape: { __enumType: 'dynamicTextShape', value: dyn.shape || 'stack' },
    lineGap: +(dyn.lineGap != null ? dyn.lineGap : 0.1), wordGap: +(dyn.wordGap || 0), __doub: { lineGap: true, wordGap: true } };
}

export function readPsdEditorText(desc) {
  const d = desc && desc.psd_editorText;
  const j = d && typeof d === 'object' ? d.json : null;
  if (typeof j !== 'string') return null;
  try { const o = JSON.parse(j); return o && typeof o === 'object' ? o : null; } catch { return null; }
}
export function buildPsdEditorTextDesc(obj) {
  return { __classID: 'psd_editorText', __name: '', json: JSON.stringify(obj) };
}

function enumOf(v) { return v && typeof v === 'object' && typeof v.value === 'string' ? v.value : null; }

export function getTextInfo(layer) {
  const d = layer && layer.text;
  if (!d) return null;
  const info = {
    content: typeof d['Txt '] === 'string' ? displayText(d['Txt ']) : '',
    transform: layer.textTransform || [1, 0, 0, 1, 0, 0],
    font: null, fontSize: 12, color: [0, 0, 0, 1], bold: false, italic: false, underline: false,
    tracking: 0, leading: null, autoLeading: 1.2, hScale: 1, vScale: 1,
    align: 'left', shape: 'point', box: null, pointBase: [0, 0],
    fonts: [], engineData: null, warp: layer.textWarp || null,
    



    orientation: enumOf(d['Ornt']) === 'Vrtc' ? 'vertical' : 'horizontal',
    antiAlias: enumOf(d['AntA']) || 'antiAliasSharp',
    ligatures: true, dligatures: false,
    

    pathText: readTextOnPath(d), pathTextFrom: d.textOnPath ? 'desc' : null,
    textIndex: Number.isInteger(d.TextIndex) ? d.TextIndex : null,
    

    dynamic: readDynamicText(d), priv: readPsdEditorText(d),
  };
  const raw = d['EngineData'];
  if (!raw || !raw.length) return info;
  let ed;
  try { ed = parseEngineData(raw); } catch (e) { info.engineError = e.message; return info; }
  info.engineData = ed;
  const E = ed.EngineDict || {}, R = ed.ResourceDict || {};
  if (typeof (E.Editor && E.Editor.Text) === 'string') info.content = displayText(E.Editor.Text);
  info.fonts = (R.FontSet || []).map(f => f.Name);

  
  const base = (R.StyleSheetSet && R.StyleSheetSet[0] && R.StyleSheetSet[0].StyleSheetData) || {};
  const run = (E.StyleRun && E.StyleRun.RunArray && E.StyleRun.RunArray[0] && E.StyleRun.RunArray[0].StyleSheet
               && E.StyleRun.RunArray[0].StyleSheet.StyleSheetData) || {};
  const st = { ...base, ...run };
  info.font = info.fonts[numOr(st.Font, 0)] || info.fonts[0] || null;
  info.fontSize = numOr(st.FontSize, 12);
  info.bold = !!st.FauxBold; info.italic = !!st.FauxItalic; info.underline = !!st.Underline;
  info.tracking = numOr(st.Tracking, 0);
  
  const autoOn = st.AutoLeading !== false;
  info.leading = autoOn ? null : numOr(st.Leading, null);
  info.hScale = numOr(st.HorizontalScale, 1); info.vScale = numOr(st.VerticalScale, 1);
  info.baselineShift = numOr(st.BaselineShift, 0);
  info.caps = FONT_CAPS[numOr(st.FontCaps, 0)] || 'none';
  info.baseline = FONT_BASELINE[numOr(st.FontBaseline, 0)] || 'normal';
  info.strikethrough = !!st.Strikethrough;
  info.autoKern = st.AutoKerning !== false;
  
  info.ligatures = st.Ligatures !== false;
  info.dligatures = !!st.DLigatures;
  info.tsume = numOr(st.Tsume, 0); info.noBreak = !!st.NoBreak;
  info.charDirection = numOr(st.CharacterDirection, 0); info.hindiNumbers = !!st.HindiNumbers;
  info.kerning = numOr(st.Kerning, 0); info.kashida = numOr(st.Kashida, 0); info.diacriticPos = numOr(st.DiacriticPos, 0);   
  

  info.language = numOr(st.Language, 0);
  info.languageName = languageNameOf(info.language);
  info.languageLabel = languageLabelOf(info.language);
  const fc = colorOf(st.FillColor);
  if (fc) info.color = fc;                              
  
  if (nameBold(info.font)) info.bold = true;
  if (nameItalic(info.font)) info.italic = true;

  
  const pbase = (R.ParagraphSheetSet && R.ParagraphSheetSet[0] && R.ParagraphSheetSet[0].Properties) || {};
  const prun = (E.ParagraphRun && E.ParagraphRun.RunArray && E.ParagraphRun.RunArray[0] && E.ParagraphRun.RunArray[0].ParagraphSheet
                && E.ParagraphRun.RunArray[0].ParagraphSheet.Properties) || {};
  info.autoLeading = numOr(prun.AutoLeading ?? pbase.AutoLeading, 1.2);
  info.justification = numOr(prun.Justification ?? pbase.Justification, 0);
  info.align = alignOf(info.justification);
  info.startIndent = numOr(prun.StartIndent ?? pbase.StartIndent, 0);
  info.endIndent = numOr(prun.EndIndent ?? pbase.EndIndent, 0);
  info.firstLineIndent = numOr(prun.FirstLineIndent ?? pbase.FirstLineIndent, 0);
  info.spaceBefore = numOr(prun.SpaceBefore ?? pbase.SpaceBefore, 0);
  info.spaceAfter = numOr(prun.SpaceAfter ?? pbase.SpaceAfter, 0);
  info.hyphenate = !!(prun.AutoHyphenate ?? pbase.AutoHyphenate);
  info.burasagari = !!(prun.Burasagari ?? pbase.Burasagari);
  info.kinsokuOrder = numOr(prun.KinsokuOrder ?? pbase.KinsokuOrder, 0);
  info.hanging = !!(prun.Hanging ?? pbase.Hanging);
  info.everyLineComposer = !!(prun.EveryLineComposer ?? pbase.EveryLineComposer);
  Object.assign(info, paraExtraOf({ ...pbase, ...prun }));   

  
  const ps = E.Rendered && E.Rendered.Shapes && E.Rendered.Shapes.Children && E.Rendered.Shapes.Children[0]
             && E.Rendered.Shapes.Children[0].Cookie && E.Rendered.Shapes.Children[0].Cookie.Photoshop;
  if (ps) {
    info.shape = ps.ShapeType === 1 ? 'box' : 'point';
    if (ps.PointBase) info.pointBase = ps.PointBase;
    if (ps.BoxBounds) info.box = ps.BoxBounds;              
  }
  return info;
}



const FONT_CAPS = ['none', 'small', 'all'];
const FONT_BASELINE = ['normal', 'superscript', 'subscript'];
const LEADING_TYPE = ['above', 'below'];


function resolveEngine(src) {
  if (!src || typeof src !== 'object') return null;
  if (src.EngineDict || src.ResourceDict) return src;                       
  if (src.engineData && typeof src.engineData === 'object') return src.engineData;   
  const d = src.text && typeof src.text === 'object' ? src.text : src;      
  if (d && d.engineData && typeof d.engineData === 'object') return d.engineData;
  const raw = d && d['EngineData'];
  if (!raw || !raw.length) return null;
  try { return parseEngineData(raw); } catch { return null; }
}


function engineTextOf(ed, src) {
  const t = ed && ed.EngineDict && ed.EngineDict.Editor && ed.EngineDict.Editor.Text;
  if (typeof t === 'string') return t;
  const d = src && src.text && typeof src.text === 'object' ? src.text : src;
  if (d && typeof d['Txt '] === 'string') return d['Txt '];
  if (src && typeof src.content === 'string') return src.content.replace(/\n/g, '\r') + '\r';
  return '';
}





function runBounds(lengths, rawLen, textLen) {
  const out = [];
  let pos = 0;
  for (let i = 0; i < lengths.length; i++) {
    const n = Math.max(0, numOr(lengths[i], 0));
    out.push([pos, Math.min(rawLen, pos + n)]);
    pos += n;
    if (pos >= rawLen) { pos = rawLen; break; }
  }
  if (!out.length) out.push([0, rawLen]);
  else if (out[out.length - 1][1] < rawLen) out[out.length - 1][1] = rawLen;   
  return out.map(([a, b]) => [Math.min(a, textLen), Math.min(b, textLen)]);
}

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;
function snapSurrogates(bounds, text) {
  let snapped = false;
  const at = (i) => (i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) && isLow(text.charCodeAt(i)));
  for (let i = 0; i < bounds.length - 1; i++) {
    if (!at(bounds[i][1])) continue;
    bounds[i][1] += 1; bounds[i + 1][0] = bounds[i][1]; snapped = true;
    if (bounds[i + 1][1] < bounds[i + 1][0]) bounds[i + 1][1] = bounds[i + 1][0];
  }
  return snapped;
}


function styleOf(st, fonts) {
  const fontIndex = numOr(st.Font, 0);
  const font = fonts[fontIndex] != null ? fonts[fontIndex] : (fonts[0] != null ? fonts[0] : null);
  const autoLeading = st.AutoLeading !== false;
  const rgba = colorOf(st.FillColor);
  const stroke = colorOf(st.StrokeColor);
  const to255 = (c) => c && { r: Math.round(Math.min(1, Math.max(0, c[0])) * 255), g: Math.round(Math.min(1, Math.max(0, c[1])) * 255),
                              b: Math.round(Math.min(1, Math.max(0, c[2])) * 255), a: Math.min(1, Math.max(0, numOr(c[3], 1))) };
  const caps = numOr(st.FontCaps, 0), base = numOr(st.FontBaseline, 0);
  return {
    font, fontIndex,
    fontSize: numOr(st.FontSize, 12),                    
    faux: { bold: !!st.FauxBold, italic: !!st.FauxItalic },
    bold: !!st.FauxBold || nameBold(font),               
    italic: !!st.FauxItalic || nameItalic(font),
    tracking: numOr(st.Tracking, 0),
    kerning: numOr(st.Kerning, 0),
    autoLeading, leading: autoLeading ? null : numOr(st.Leading, null),
    baselineShift: numOr(st.BaselineShift, 0),
    hScale: numOr(st.HorizontalScale, 1), vScale: numOr(st.VerticalScale, 1),
    color: to255(rgba) || null,
    colorF: rgba,                                        
    strokeColor: st.StrokeFlag ? (to255(stroke) || null) : null,
    underline: !!st.Underline, strikethrough: !!st.Strikethrough,
    caps: FONT_CAPS[caps] || 'none',
    baseline: FONT_BASELINE[base] || 'normal',
    ligatures: st.Ligatures !== false, dligatures: !!st.DLigatures, noBreak: !!st.NoBreak,
    tsume: numOr(st.Tsume, 0), charDirection: numOr(st.CharacterDirection, 0), hindiNumbers: !!st.HindiNumbers,
    language: numOr(st.Language, 0), kashida: numOr(st.Kashida, 0), diacriticPos: numOr(st.DiacriticPos, 0)
  };
}





export const PARA_EXTRA_DEFAULTS = { wordSpacing: [0.8, 1, 1.33], letterSpacing: [0, 0, 0], glyphSpacing: [1, 1, 1], leadingType: 0,
  hyphWordSize: 6, hyphPre: 2, hyphPost: 2, hyphLimit: 8, hyphZone: 36 };
function paraExtraOf(p) {
  const arr3 = (v, d) => Array.isArray(v) && v.length >= 3 && v.every(x => typeof x === 'number') ? [v[0], v[1], v[2]] : d.slice();
  const D = PARA_EXTRA_DEFAULTS;
  return { wordSpacing: arr3(p.WordSpacing, D.wordSpacing), letterSpacing: arr3(p.LetterSpacing, D.letterSpacing), glyphSpacing: arr3(p.GlyphSpacing, D.glyphSpacing),
    leadingType: numOr(p.LeadingType, 0), hyphWordSize: numOr(p.HyphenatedWordSize, D.hyphWordSize), hyphPre: numOr(p.PreHyphen, D.hyphPre),
    hyphPost: numOr(p.PostHyphen, D.hyphPost), hyphLimit: numOr(p.ConsecutiveHyphens, D.hyphLimit), hyphZone: numOr(p.Zone, D.hyphZone) };
}

function paraOf(p) {
  return {
    align: alignOf(numOr(p.Justification, 0)),
    justification: numOr(p.Justification, 0),
    indent: { left: numOr(p.StartIndent, 0), right: numOr(p.EndIndent, 0), firstLine: numOr(p.FirstLineIndent, 0) },
    spaceBefore: numOr(p.SpaceBefore, 0), spaceAfter: numOr(p.SpaceAfter, 0),
    autoLeading: numOr(p.AutoLeading, 1.2),
    leadingType: LEADING_TYPE[numOr(p.LeadingType, 0)] || 'above',
    autoHyphenate: !!p.AutoHyphenate, hanging: !!p.Hanging,
    everyLineComposer: !!p.EveryLineComposer,
    burasagari: !!p.Burasagari, kinsokuOrder: numOr(p.KinsokuOrder, 0), hyphenate: !!p.AutoHyphenate,
    ...paraExtraOf(p)
  };
}
















export function getTextRuns(src) {
  const ed = resolveEngine(src);
  if (!ed) return null;
  const E = ed.EngineDict || {}, R = ed.ResourceDict || {};
  const raw = engineTextOf(ed, src);
  const text = displayText(raw);
  const fonts = (R.FontSet || []).map(f => f && f.Name);

  const sheetSet = R.StyleSheetSet || [];
  const paraSet = R.ParagraphSheetSet || [];
  const baseStyle = (i) => (sheetSet[i] && sheetSet[i].StyleSheetData) || (sheetSet[0] && sheetSet[0].StyleSheetData) || {};
  const basePara = (i) => (paraSet[i] && paraSet[i].Properties) || (paraSet[0] && paraSet[0].Properties) || {};

  const sr = E.StyleRun || {}, pr = E.ParagraphRun || {};
  const sArr = Array.isArray(sr.RunArray) ? sr.RunArray : [];
  const pArr = Array.isArray(pr.RunArray) ? pr.RunArray : [];
  const sLen = Array.isArray(sr.RunLengthArray) && sr.RunLengthArray.length === sArr.length ? sr.RunLengthArray : sArr.map(() => raw.length);
  const pLen = Array.isArray(pr.RunLengthArray) && pr.RunLengthArray.length === pArr.length ? pr.RunLengthArray : pArr.map(() => raw.length);

  const sBounds = runBounds(sLen.length ? sLen : [raw.length], raw.length, text.length);
  const pBounds = runBounds(pLen.length ? pLen : [raw.length], raw.length, text.length);
  const snapped = snapSurrogates(sBounds, text) | snapSurrogates(pBounds, text);

  let rawPos = 0;
  const runs = sBounds.map(([from, to], i) => {
    const r = sArr[i] || {};
    const own = (r.StyleSheet && r.StyleSheet.StyleSheetData) || {};
    const st = { ...baseStyle(numOr(r.StyleSheet && r.StyleSheet.DefaultStyleSheet, 0)), ...own };
    const rawFrom = rawPos, rawTo = Math.min(raw.length, rawPos + Math.max(0, numOr(sLen[i], 0)));
    rawPos = rawTo;
    return { from, to, rawFrom, rawTo, text: text.slice(from, to), ...styleOf(st, fonts) };
  });

  rawPos = 0;
  const paragraphs = pBounds.map(([from, to], i) => {
    const r = pArr[i] || {};
    const own = (r.ParagraphSheet && r.ParagraphSheet.Properties) || {};
    const p = { ...basePara(numOr(r.ParagraphSheet && r.ParagraphSheet.DefaultStyleSheet, numOr(r.DefaultStyleSheet, 0))), ...own };
    const rawFrom = rawPos, rawTo = Math.min(raw.length, rawPos + Math.max(0, numOr(pLen[i], 0)));
    rawPos = rawTo;
    return { from, to, rawFrom, rawTo, text: text.slice(from, to), ...paraOf(p) };
  });

  return { text, raw, fonts, runs, paragraphs, snapped: !!snapped };
}





export function setEngineFont(ed, fontName) {
  
  
  
  const R = ed.ResourceDict || (ed.ResourceDict = {});
  const E = ed.EngineDict || {};
  const runs = (E.StyleRun && E.StyleRun.RunArray) || [];
  const used = new Set();
  for (const r of runs) { const d = r.StyleSheet && r.StyleSheet.StyleSheetData; if (d && typeof d.Font === 'number') used.add(d.Font); }
  if (!used.size) {
    const d = R.StyleSheetSet && R.StyleSheetSet[0] && R.StyleSheetSet[0].StyleSheetData;
    used.add(d && typeof d.Font === 'number' ? d.Font : 0);
  }
  const sets = [R.FontSet, ed.DocumentResources && ed.DocumentResources.FontSet].filter(Array.isArray);
  if (!sets.length) { R.FontSet = [{ Name: fontName, Script: 0, FontType: 1, Synthetic: 0 }]; return ed; }
  for (const set of sets) for (const i of used) {
    if (set[i]) set[i] = { ...set[i], Name: fontName };
    else set[i] = { Name: fontName, Script: 0, FontType: 1, Synthetic: 0 };
  }
  return ed;
}






















const STYLE_FALLBACK = { FontSize: undefined, Tracking: 0, FauxBold: false, FauxItalic: false, Underline: false,
                         AutoLeading: true, Leading: undefined, FillColor: undefined, Justification: 0,
                         HorizontalScale: 1, VerticalScale: 1, BaselineShift: 0, Strikethrough: false, FontCaps: 0, FontBaseline: 0,
                         AutoKerning: true, Kerning: 0, Kashida: 0, DiacriticPos: 0, LeadingType: 0, Tsume: 0, NoBreak: false, CharacterDirection: 0, HindiNumbers: false, Burasagari: false, KinsokuOrder: 0, Hanging: false, EveryLineComposer: false, StartIndent: 0, EndIndent: 0, FirstLineIndent: 0, SpaceBefore: 0, SpaceAfter: 0 };


const engineMeta = k => k.startsWith('__');
const styleValueEq = (a, b) => {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter(k => !engineMeta(k)), kb = Object.keys(b).filter(k => !engineMeta(k));
  if (ka.length !== kb.length) return false;
  return ka.every(k => styleValueEq(a[k], b[k]));
};


function reshapeStyleValue(cur, v) {
  if (cur && typeof cur === 'object' && !Array.isArray(cur) && v && typeof v === 'object' && !Array.isArray(v)) {
    const out = { ...cur };
    for (const [k, val] of Object.entries(v)) out[k] = val;
    return out;
  }
  return v;
}








export function applyStylePatch(target, patch, base) {
  for (const [k, v] of Object.entries(patch)) {
    const cur = Object.prototype.hasOwnProperty.call(target, k) ? target[k]
              : Object.prototype.hasOwnProperty.call(base, k) ? base[k] : STYLE_FALLBACK[k];
    if (cur !== undefined && styleValueEq(v, cur)) continue;
    target[k] = reshapeStyleValue(cur, v);
  }
}



export function engineCharPatch(style = {}) {
  const patch = {};
  if (style.fontSize != null) {
    const v = +style.fontSize;
    if (!(v > 0)) throw new Error(`setEngineStyle：字号必须大于 0，收到 ${style.fontSize}`);
    patch.FontSize = v;
  }
  if (style.color != null) {
    const c = style.color;
    if (!Array.isArray(c) || c.length < 3) throw new Error('setEngineStyle：颜色要 [r,g,b] 或 [r,g,b,a]');
    
    const big = c.some(v => v > 1);
    const f = big ? 1 / 255 : 1;
    const rgb = [c[0] * f, c[1] * f, c[2] * f].map(v => Math.max(0, Math.min(1, v)));
    const a = c.length > 3 ? Math.max(0, Math.min(1, big && c[3] > 1 ? c[3] / 255 : c[3])) : 1;
    patch.FillColor = { Type: 1, Values: [a, rgb[0], rgb[1], rgb[2]] };     
  }
  if (style.bold != null) patch.FauxBold = !!style.bold;
  if (style.italic != null) patch.FauxItalic = !!style.italic;
  if (style.underline != null) patch.Underline = !!style.underline;
  if (style.tracking != null) patch.Tracking = Math.round(+style.tracking || 0);
  if (style.leading !== undefined) {
    if (style.leading == null || style.leading === 'auto') patch.AutoLeading = true;
    else { patch.AutoLeading = false; patch.Leading = +style.leading; }
  }
  if (style.hScale != null) patch.HorizontalScale = Math.max(0.01, Math.min(10, +style.hScale || 1));
  if (style.vScale != null) patch.VerticalScale = Math.max(0.01, Math.min(10, +style.vScale || 1));
  if (style.baselineShift != null) patch.BaselineShift = +style.baselineShift || 0;
  if (style.strikethrough != null) patch.Strikethrough = !!style.strikethrough;
  if (style.caps != null) { const k = FONT_CAPS.indexOf(style.caps); if (k < 0) throw new Error(`setEngineStyle：未知大写方式「${style.caps}」`); patch.FontCaps = k; }
  if (style.baseline != null) { const k = FONT_BASELINE.indexOf(style.baseline); if (k < 0) throw new Error(`setEngineStyle：未知上下标「${style.baseline}」`); patch.FontBaseline = k; }
  if (style.autoKern != null) patch.AutoKerning = !!style.autoKern;
  if (style.kerning != null) patch.Kerning = Math.round(+style.kerning || 0);   
  




  if (style.ligatures != null) patch.Ligatures = !!style.ligatures;
  if (style.dligatures != null) patch.DLigatures = !!style.dligatures;
  


  if (style.tsume != null) patch.Tsume = Math.max(0, Math.min(1, +style.tsume || 0));
  if (style.noBreak != null) patch.NoBreak = !!style.noBreak;
  if (style.charDirection != null) patch.CharacterDirection = Math.max(0, Math.min(2, Math.round(+style.charDirection || 0)));
  if (style.hindiNumbers != null) patch.HindiNumbers = !!style.hindiNumbers;
  if (style.kashida != null) patch.Kashida = Math.max(0, Math.round(+style.kashida || 0));
  if (style.diacriticPos != null) patch.DiacriticPos = Math.max(0, Math.round(+style.diacriticPos || 0));
  


  if (style.language != null) {
    const code = languageCodeOf(style.language);
    if (code == null) throw new Error(`setEngineStyle：未知文字语言「${style.language}」（编号或 AM 枚举名，见 core/text-language.js）`);
    patch.Language = code;
  }
  return patch;
}

export function engineParaPatch(style = {}) {
  const ppatch = {};
  if (style.align != null) {
    const JUST = { left: 0, right: 1, center: 2, justify: 3, justifyLeft: 3, justifyRight: 4, justifyCenter: 5, justifyAll: 6 };
    const j = JUST[style.align];
    if (j == null) throw new Error(`setEngineStyle：未知对齐方式「${style.align}」`);
    ppatch.Justification = j;
  }
  const PKEYS = { startIndent: 'StartIndent', endIndent: 'EndIndent', firstLineIndent: 'FirstLineIndent', spaceBefore: 'SpaceBefore', spaceAfter: 'SpaceAfter' };
  for (const [k, K] of Object.entries(PKEYS)) if (style[k] != null) { const v = +style[k]; if (!isFinite(v)) throw new Error(`setEngineStyle：${k} 必须是数字`); ppatch[K] = v; }
  if (style.hyphenate != null) ppatch.AutoHyphenate = !!style.hyphenate;          
  

  if (style.burasagari != null) ppatch.Burasagari = !!style.burasagari;
  if (style.kinsokuOrder != null) ppatch.KinsokuOrder = Math.max(0, Math.min(2, Math.round(+style.kinsokuOrder || 0)));
  if (style.hanging != null) ppatch.Hanging = !!style.hanging;
  if (style.everyLineComposer != null) ppatch.EveryLineComposer = !!style.everyLineComposer;
  
  const A3 = { wordSpacing: 'WordSpacing', letterSpacing: 'LetterSpacing', glyphSpacing: 'GlyphSpacing' };
  for (const [k, K] of Object.entries(A3)) if (style[k] != null) {
    const v = style[k];
    if (!Array.isArray(v) || v.length < 3 || !v.slice(0, 3).every(x => isFinite(+x))) throw new Error(`setEngineStyle：${k} 要 [最小, 所需, 最大]`);
    ppatch[K] = v.slice(0, 3).map(Number);
  }
  if (style.autoLeading != null) { const v = +style.autoLeading; if (!(v > 0)) throw new Error('setEngineStyle：autoLeading 必须大于 0'); ppatch.AutoLeading = v; }
  if (style.leadingType != null) ppatch.LeadingType = +style.leadingType ? 1 : 0;
  const HK = { hyphWordSize: 'HyphenatedWordSize', hyphPre: 'PreHyphen', hyphPost: 'PostHyphen', hyphLimit: 'ConsecutiveHyphens' };
  for (const [k, K] of Object.entries(HK)) if (style[k] != null) ppatch[K] = Math.max(0, Math.round(+style[k] || 0));
  if (style.hyphZone != null) ppatch.Zone = Math.max(0, +style.hyphZone || 0);
  return ppatch;
}

export function setEngineStyle(ed, style = {}) {
  if (!ed || typeof ed !== 'object') throw new Error('setEngineStyle：需要已解析的 EngineData');
  const E = ed.EngineDict || (ed.EngineDict = {});
  const patch = engineCharPatch(style);
  if (Object.keys(patch).length) {
    const R0 = ed.ResourceDict || {};
    const base = (R0.StyleSheetSet && R0.StyleSheetSet[0] && R0.StyleSheetSet[0].StyleSheetData) || {};
    const runs = (E.StyleRun && E.StyleRun.RunArray) || [];
    if (runs.length) {
      for (const r of runs) {
        if (!r.StyleSheet) r.StyleSheet = {};
        const d = r.StyleSheet.StyleSheetData = { ...(r.StyleSheet.StyleSheetData || {}) };
        applyStylePatch(d, patch, base);
      }
    } else {
      
      const R = ed.ResourceDict || (ed.ResourceDict = {});
      const set = R.StyleSheetSet || (R.StyleSheetSet = [{}]);
      set[0] = set[0] || {};
      set[0].StyleSheetData = { ...(set[0].StyleSheetData || {}), ...patch };
    }
  }
  const ppatch = engineParaPatch(style);
  if (Object.keys(ppatch).length) {
    const R0 = ed.ResourceDict || {};
    const pbase = (R0.ParagraphSheetSet && R0.ParagraphSheetSet[0] && R0.ParagraphSheetSet[0].Properties) || {};
    const pruns = (E.ParagraphRun && E.ParagraphRun.RunArray) || [];
    if (pruns.length) {
      for (const r of pruns) {
        if (!r.ParagraphSheet) r.ParagraphSheet = {};
        const d = r.ParagraphSheet.Properties = { ...(r.ParagraphSheet.Properties || {}) };
        applyStylePatch(d, ppatch, pbase);
      }
    } else {
      const R = ed.ResourceDict || (ed.ResourceDict = {});
      const set = R.ParagraphSheetSet || (R.ParagraphSheetSet = [{}]);
      set[0] = set[0] || {};
      set[0].Properties = { ...(set[0].Properties || {}), ...ppatch };
    }
  }
  return ed;
}





export function layoutText(info, text, measure, opts = {}) {
  const size = info.fontSize, lineH = info.leading != null ? info.leading : size * info.autoLeading;
  const paras = String(text).replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  let maxW = 0;
  if (info.shape === 'box' && info.box) {
    const [L, T, Rt] = info.box, W = Math.max(1, Rt - L);
    for (const p of paras) {
      
      const tokens = p.match(/[　-鿿豈-﫿]|\S+\s*|\s+/g) || [''];
      let cur = '';
      for (const tk of tokens) {
        if (cur && measure(cur + tk) > W) { lines.push(cur.replace(/\s+$/, '')); cur = tk; }
        else cur += tk;
      }
      lines.push(cur.replace(/\s+$/, ''));
    }
    
    const asc = typeof opts.ascent === 'number' && isFinite(opts.ascent) ? opts.ascent : size;
    const out = lines.map((t, i) => {
      const w = measure(t); maxW = Math.max(maxW, w);
      const x = info.align === 'center' ? L + (W - w) / 2 : info.align === 'right' ? Rt - w : L;
      return { text: t, x, y: T + asc + i * lineH };
    });
    return { lines: out, lineH, width: maxW, height: lines.length * lineH };
  }
  
  const [bx, by] = info.pointBase || [0, 0];
  const out = paras.map((t, i) => {
    const w = measure(t); maxW = Math.max(maxW, w);
    const x = info.align === 'center' ? bx - w / 2 : info.align === 'right' ? bx - w : bx;
    return { text: t, x, y: by + i * lineH };
  });
  return { lines: out, lineH, width: maxW, height: paras.length * lineH };
}






export function diffRange(oldText, newText) {
  const a = String(oldText), b = String(newText);
  let p = 0;
  while (p < a.length && p < b.length && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  return { prefix: p, suffix: s, oldEnd: a.length - s, newEnd: b.length - s };
}

export function remapRunSpans(oldText, newText, spans) {
  const d = diffRange(oldText, newText), N = String(newText).length, O = String(oldText).length;
  if (!spans.length) return [];
  const at = pos => { for (let k = 0; k < spans.length; k++) if (pos >= spans[k][0] && pos < spans[k][1]) return k; return pos <= 0 ? 0 : spans.length - 1; };
  const owner = new Int32Array(N);
  const insOwner = d.prefix > 0 ? at(d.prefix - 1) : at(d.oldEnd < O ? d.oldEnd : 0);
  for (let i = 0; i < N; i++) owner[i] = i < d.prefix ? at(i) : i < d.newEnd ? insOwner : at(i - d.newEnd + d.oldEnd);
  const out = spans.map(() => null);
  for (let i = 0; i < N; i++) { const k = owner[i]; if (!out[k]) out[k] = [i, i + 1]; else out[k][1] = i + 1; }
  let last = 0;
  return out.map(r => { if (r) { last = r[1]; return r; } return [last, last]; });
}










const NO_LINE_START = new Set('，。、；：？！）】」』》〉’”…—–,.;:?!)]}%‰·ー々〻ぁぃぅぇぉゃゅょっァィゥェォャュョッ～');


const KINSOKU_NO_START = {
  hard: new Set('、。，．・：；？！ー―’”）〕］｝〉》」』】ヽヾゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ゛゜?!)]},.:;℃℉¢％‰'),
  soft: new Set('、。，．・：；？！’”）〕］｝〉》」』】ヽヾゝゞ々'), none: new Set() };

const KINSOKU_NO_END = { hard: new Set('‘“（〔［｛〈《「『【([{'), soft: new Set('‘“（〔［｛〈《「『【'), none: new Set() };
const isCJKChar = c => /[⺀-⿿　-〿぀-ヿ㄀-ㇿ㐀-䶿一-鿿가-힯豈-﫿︰-﹏＀-￯]/.test(c);
export const TEXT_SCRIPT = { superSize: 0.583, superPos: 0.333, subSize: 0.583, subPos: 0.333, smallCaps: 0.7 };
export function layoutRichText(model, api) {
  if (model.orientation === 'vertical') return layoutVerticalText(model, api);
  const text = String(model.text || '');
  const runs = (model.runs && model.runs.length ? model.runs : [{ from: 0, to: text.length, fontSize: 12 }]);
  const paras = model.paragraphs && model.paragraphs.length ? model.paragraphs : [{ from: 0, to: text.length }];
  const runAt = i => { for (const r of runs) if (i >= r.from && i < r.to) return r; return i >= text.length && runs.length ? runs[runs.length - 1] : runs[0]; };
  const paraAt = i => { for (const p of paras) if (i >= p.from && i < p.to) return p; return paras[paras.length - 1]; };
  const box = model.shape === 'box' && model.box ? model.box : null;
  const [bx, by] = model.pointBase || [0, 0];
  const out = [];
  
  const pieceStyle = (run, ch) => {
    let scale = 1, rise = run.baselineShift || 0, t = ch;
    if (run.caps === 'all') t = ch.toUpperCase();
    else if (run.caps === 'small' && ch !== ch.toUpperCase()) { t = ch.toUpperCase(); scale *= TEXT_SCRIPT.smallCaps; }
    if (run.baseline === 'superscript') { rise += run.fontSize * TEXT_SCRIPT.superPos; scale *= TEXT_SCRIPT.superSize; }
    else if (run.baseline === 'subscript') { rise -= run.fontSize * TEXT_SCRIPT.subPos; scale *= TEXT_SCRIPT.subSize; }
    return { t, scale, rise };
  };
  const tokensOf = (from, to) => {
    const toks = [];
    let cur = null;
    const push = () => { if (cur) { toks.push(cur); cur = null; } };
    for (let i = from; i < to;) {
      const cp = text.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length;
      const space = /\s/.test(ch), cjk = isCJKChar(ch);
      if (cjk) { push(); cur = { from: i, to: i + n, cjk: true }; push(); }
      else if (space) { if (!cur) cur = { from: i, to: i + n, space: true }; else cur.to = i + n; if (cur) cur.trail = (cur.trail || 0) + n; }
      else { if (cur && (cur.trail || cur.space)) push(); if (!cur) cur = { from: i, to: i + n }; else cur.to = i + n; }
      i += n;
    }
    push();
    
    const merged = [];
    for (const t of toks) {
      const last = merged[merged.length - 1];
      if (t.space && last && !last.space) { last.to = t.to; last.trail = (last.trail || 0) + (t.to - t.from); }
      else merged.push(t);
    }
    return merged.map(t => buildPieces(t));
  };
  const buildPieces = tok => {
    const pieces = [];
    let cur = null;
    const trailFrom = tok.to - (tok.trail || 0);
    for (let i = tok.from; i < tok.to;) {
      const cp = text.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length;
      const run = runAt(i), ps = pieceStyle(run, ch);
      if (cur && cur.run === run && cur.scale === ps.scale && cur.rise === ps.rise && (i < trailFrom) === cur.body) { cur.text += ps.t; cur.to = i + n; }
      else { cur = { text: ps.t, run, scale: ps.scale, rise: ps.rise, from: i, to: i + n, body: i < trailFrom }; pieces.push(cur); }
      i += n;
    }
    let w = 0, trimW = 0;
    for (const p of pieces) { p.w = p.text ? api.measure(p.text, p.run, p.scale) : 0; w += p.w; if (p.body) trimW = w; }
    if (!pieces.some(p => p.body)) trimW = 0;
    return { ...tok, pieces, w, trimW, first: text[tok.from] };
  };
  const leadOf = (run, para) => run.leading != null ? run.leading : (para.autoLeading != null ? para.autoLeading : 1.2) * run.fontSize;
  let y = null, prevParaAfter = 0;
  const lineStarts = [];
  let pStart = 0;
  for (let k = 0; k <= text.length; k++) if (k === text.length || text[k] === '\n') { lineStarts.push([pStart, k]); pStart = k + 1; }
  lineStarts.forEach(([pf, pt], pIdx) => {
    const para = paraAt(pf);
    const J = para.justification != null ? para.justification : ({ left: 0, right: 1, center: 2, justify: 3, justifyRight: 4, justifyCenter: 5, justifyAll: 6 }[para.align] || 0);
    const indL = (para.indent && para.indent.left) || para.startIndent || 0;
    const indR = (para.indent && para.indent.right) || para.endIndent || 0;
    const indF = (para.indent && para.indent.firstLine) || para.firstLineIndent || 0;
    const toks = tokensOf(pf, pt);
    const NO_START = typeof para.kinsokuNoStart === 'string' ? new Set(para.kinsokuNoStart) : (KINSOKU_NO_START[para.kinsokuSet] || NO_LINE_START);
    const NO_END = typeof para.kinsokuNoEnd === 'string' ? new Set(para.kinsokuNoEnd) : (KINSOKU_NO_END[para.kinsokuSet] || KINSOKU_NO_END.soft);
    const lines = [];
    let line = [], lw = 0;
    const availFor = first => box ? Math.max(1, (box[2] - box[0]) - indL - indR - (first ? indF : 0)) : Infinity;
    const flush = () => { lines.push(line); line = []; lw = 0; };
    for (const tk of toks) {
      const avail = availFor(lines.length === 0);
      if (line.length && lw + tk.trimW > avail && box) {
        if (!NO_START.has(tk.first)) {
          if (line.length > 1 && NO_END.has(line[line.length - 1].first)) {   
            const prev = line.pop(); lw -= prev.w; flush(); line.push(prev); lw += prev.w;
          } else flush();
        }
        else if (line.length > 1) {                       
          const prev = line.pop(); lw -= prev.w; flush();
          line.push(prev); lw += prev.w;
        }                                                 
      }
      if (!line.length && box && tk.trimW > avail && tk.pieces.length && (tk.to - tk.from) > 1 && !tk.cjk) {
        
        for (const p of tk.pieces) for (const ch of Array.from(p.text)) {
          const one = { pieces: [{ ...p, text: ch, w: api.measure(ch, p.run, p.scale) }], first: ch };
          one.w = one.trimW = one.pieces[0].w;
          if (line.length && lw + one.w > availFor(lines.length === 0) && !NO_START.has(ch)) flush();
          line.push(one); lw += one.w;
        }
        continue;
      }
      line.push(tk); lw += tk.w;
    }
    if (line.length || !lines.length) flush();
    if (pIdx > 0) y += prevParaAfter + (para.spaceBefore || 0);
    lines.forEach((ln, li) => {
      const pcs = ln.flatMap(t => t.pieces);
      const emptyRun = runAt(pf);
      let lead = 0, asc = 0, desc = 0;
      for (const p of (pcs.length ? pcs : [{ run: emptyRun, scale: 1, rise: 0 }])) {
        lead = Math.max(lead, leadOf(p.run, para));
        const m = api.metrics(p.run, p.scale);
        asc = Math.max(asc, m.ascent + Math.max(0, p.rise)); desc = Math.max(desc, m.descent - Math.min(0, p.rise));
      }
      if (y == null) y = box ? box[1] + asc : by;
      else y += lead;
      const last = li === lines.length - 1;
      const trimW = ln.length ? ln.slice(0, -1).reduce((s, t) => s + t.w, 0) + ln[ln.length - 1].trimW : 0;
      const first = li === 0;
      let x, gapExtra = 0;
      if (box) {
        const x0 = box[0] + indL + (first ? indF : 0), avail = availFor(first);
        const justify = J >= 3 && (J === 6 || !last) && ln.length > 1;
        if (justify) { x = x0; gapExtra = (avail - trimW) / (ln.length - 1); }
        else {
          const a = J === 1 || J === 4 ? 'r' : J === 2 || J === 5 ? 'c' : 'l';
          x = a === 'r' ? box[2] - indR - trimW : a === 'c' ? x0 + (avail - trimW) / 2 : x0;
        }
      } else {
        const a = J === 1 ? 'r' : J === 2 ? 'c' : 'l';
        x = a === 'r' ? bx - trimW : a === 'c' ? bx - trimW / 2 : bx + indL + (first ? indF : 0);
      }
      const placed = [];
      let cx = x;
      ln.forEach((t, ti) => { for (const p of t.pieces) { placed.push({ text: p.text, run: p.run, x: cx, w: p.w, scale: p.scale, rise: p.rise, from: p.from, to: p.to, body: p.body }); cx += p.w; } if (ti < ln.length - 1) cx += gapExtra; });
      out.push({ y, x, w: trimW + gapExtra * Math.max(0, ln.length - 1), lead, ascent: asc, descent: desc, para: pIdx, pieces: placed, from: pcs.length ? pcs[0].from : pf });
    });
    prevParaAfter = para.spaceAfter || 0;
  });
  
  let overflow = false;
  if (box) {
    const keep = out.filter((ln, k) => k === 0 ? ln.y - ln.ascent <= box[3] : ln.y + ln.descent <= box[3] + 0.5);
    overflow = keep.length < out.length;
    out.length = 0; out.push(...keep);
  }
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  for (const ln of out) { L = Math.min(L, ln.x); R = Math.max(R, ln.x + ln.w); T = Math.min(T, ln.y - ln.ascent); B = Math.max(B, ln.y + ln.descent); }
  return { lines: out, overflow, bounds: out.length ? { left: L, top: T, right: R, bottom: B } : null };
}




export function setEngineParagraphBox(ed, w, h) {
  const E = ed && ed.EngineDict; if (!E) throw new Error('EngineData 缺少 EngineDict');
  const R = E.Rendered || (E.Rendered = { Version: 1, Shapes: { WritingDirection: 0, Children: [{}] } });
  const shapes = R.Shapes || (R.Shapes = { WritingDirection: 0, Children: [{}] });
  const ch = (shapes.Children && shapes.Children[0]) || (shapes.Children = [{}])[0];
  ch.ShapeType = 1;
  if (ch.Procession == null) ch.Procession = 0;
  const ck = ch.Cookie || (ch.Cookie = {});
  const ps = ck.Photoshop || (ck.Photoshop = {});
  ps.ShapeType = 1;
  delete ps.PointBase;
  ps.BoxBounds = [0, 0, +w, +h];
  if (!ps.Base) ps.Base = { ShapeType: 1, TransformPoint0: [1, 0], TransformPoint1: [0, 1], TransformPoint2: [0, 0] };
  else ps.Base.ShapeType = 1;
  if (ps.__engineKeys) ps.__engineKeys = ps.__engineKeys.filter(k => k !== 'PointBase');
  return ed;
}



export function setEnginePointText(ed, pointBase) {
  const E = ed && ed.EngineDict; if (!E) throw new Error('EngineData 缺少 EngineDict');
  const R = E.Rendered || (E.Rendered = { Version: 1, Shapes: { WritingDirection: 0, Children: [{}] } });
  const shapes = R.Shapes || (R.Shapes = { WritingDirection: 0, Children: [{}] });
  const ch = (shapes.Children && shapes.Children[0]) || (shapes.Children = [{}])[0];
  ch.ShapeType = 0;
  const ck = ch.Cookie || (ch.Cookie = {});
  const ps = ck.Photoshop || (ck.Photoshop = {});
  ps.ShapeType = 0;
  delete ps.BoxBounds;
  ps.PointBase = Array.isArray(pointBase) && pointBase.length >= 2 ? [+pointBase[0], +pointBase[1]] : [0, 0];
  if (!ps.Base) ps.Base = { ShapeType: 0, TransformPoint0: [1, 0], TransformPoint1: [0, 1], TransformPoint2: [0, 0] };
  else ps.Base.ShapeType = 0;
  
  if (ps.__engineKeys) {
    ps.__engineKeys = ps.__engineKeys.filter(k => k !== 'BoxBounds');
    if (!ps.__engineKeys.includes('PointBase')) ps.__engineKeys.splice(1, 0, 'PointBase');
  }
  return ed;
}

export default { getTextInfo, getTextRuns, setEngineFont, layoutText };










const V_PUNCT_CORNER = new Set('，。、．｡､﹐﹑');
const V_ROTATE = new Set('（）「」『』【】《》〈〉〔〕［］｛｝—…～ー－―‥〜()[]{}<>');
function layoutVerticalText(model, api) {
  const text = String(model.text || ''), runs = model.runs && model.runs.length ? model.runs : [{ from: 0, to: text.length, fontSize: 12 }];
  const paras = model.paragraphs && model.paragraphs.length ? model.paragraphs : [{ from: 0, to: text.length }];
  const paraAt = i => { for (const p of paras) if (i >= p.from && i < p.to) return p; return paras[paras.length - 1]; };
  const runAt = i => runs.find(r => i >= r.from && i < r.to) || runs[runs.length - 1];
  const box = model.shape === 'box' && model.box ? model.box : null;
  const base = model.pointBase || [0, 0];
  const top = box ? box[1] : base[1], bottom = box ? box[3] : Infinity;
  
  const units = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length;
    if (ch === '\n') { units.push({ br: true, from: i, to: i + 1 }); i += n; continue; }
    const r = runAt(i);
    const last = units[units.length - 1];
    
    if (r.tcy && !/\s/.test(ch)) {
      if (last && last.kind === 'tcy' && last.run === r) { last.text += ch; last.to = i + n; }
      else units.push({ kind: 'tcy', text: ch, run: r, from: i, to: i + n });
      i += n; continue;
    }
    const rot = V_ROTATE.has(ch) || (!r.romanUpright && !isCJKChar(ch) && !/\s/.test(ch) && cp < 0x2E80);   
    if (rot && !V_ROTATE.has(ch) && last && last.kind === 'rot' && last.run === r && !last.bracket) { last.text += ch; last.to = i + n; }
    else units.push({ kind: rot ? 'rot' : (V_PUNCT_CORNER.has(ch) ? 'corner' : 'up'), text: ch, run: r, from: i, to: i + n, bracket: V_ROTATE.has(ch) });
    i += n;
  }
  
  const cols = []; let col = { items: [], len: 0, lead: 0, from: 0 };
  const push = () => { cols.push(col); col = { items: [], len: 0, lead: 0, from: 0 }; };
  for (const u of units) {
    if (u.br) { col.brk = true; if (!col.items.length) col.lead = col.lead || (runs[0].fontSize || 12) * 1.2; push(); continue; }
    const r = u.run, size = r.fontSize || 12, t = r.caps === 'all' ? u.text.toUpperCase() : u.text;
    const para = paraAt(u.from);
    const lead = r.leading != null ? r.leading : (para.autoLeading != null ? para.autoLeading : 1.2) * size;
    const adv = u.kind === 'rot' ? api.measure(t, r, 1) : size * (r.vScale || 1);
    const trk = (r.tracking || 0) * size / 1000;
    if (box && col.items.length && col.len + adv > (bottom - top) + 0.5) push();
    col.items.push({ ...u, t, adv, size, trk }); col.len += adv + trk; col.lead = Math.max(col.lead, lead);
  }
  if (col.items.length || !cols.length) push();
  
  const lines = []; let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity, overflow = false;
  const firstLead = cols[0] && cols[0].lead || (runs[0].fontSize || 12) * 1.2;
  let cx = box ? box[2] - firstLead / 2 : base[0];                  
  cols.forEach((c, ci) => {
    if (ci) cx -= (cols[ci - 1].lead + c.lead) / 2 || c.lead;
    if (box && cx - c.lead / 2 < box[0] - 0.5) { overflow = true; return; }
    const para = c.items.length ? paraAt(c.items[0].from) : paras[0];
    const J = para.justification != null ? para.justification : 0;
    const colLen = Math.max(0, c.len - (c.items.length ? c.items[c.items.length - 1].trk : 0));
    let y = box ? top + (J === 2 || J === 5 ? ((bottom - top) - colLen) / 2 : J === 1 || J === 4 ? (bottom - top) - colLen : 0)
                : top - (J === 2 ? colLen / 2 : J === 1 ? colLen : 0);
    for (const it of c.items) {
      const r = it.run, m = api.metrics(r, 1), size = it.size;
      
      const fr = { o: [cx, y], d: [0, 1], n: [1, 0], len: it.adv, h0: size / 2, h1: size / 2, upright: it.kind !== 'rot' };
      if (it.kind === 'rot') {
        
        const bxl = cx - (m.ascent - m.descent) / 2;
        lines.push({ x: cx - size / 2, y: y + m.ascent, w: size, lead: c.lead, ascent: m.ascent, descent: m.descent, from: it.from,
          pieces: [{ text: it.t, run: r, x: cx - size / 2, w: it.adv, scale: 1, rise: 0, from: it.from, to: it.to, body: true, at: [bxl, y], rot: Math.PI / 2, fr }] });
        L = Math.min(L, bxl - m.descent); R = Math.max(R, bxl + m.ascent);
      } else if (it.kind === 'tcy') {
        const width = api.measure(it.t, r, 1), sx = width > size ? size / width : 1;   
        const gx = cx - width * sx / 2, gy = y + m.ascent;
        lines.push({ x: gx, y: gy, w: width * sx, lead: c.lead, ascent: m.ascent, descent: m.descent, from: it.from,
          pieces: [{ text: it.t, run: r, x: gx, w: width * sx, sx, scale: 1, rise: 0, from: it.from, to: it.to, body: true, fr }] });
        L = Math.min(L, gx); R = Math.max(R, gx + width * sx);
      } else {
        const width = api.measure(it.t, r, 1);
        let gx = cx - width / 2, gy = y + m.ascent - (size - (m.ascent + m.descent)) / 2 * 0;
        if (it.kind === 'corner') { gx += size * 0.5; gy -= size * 0.55; }   
        lines.push({ x: gx, y: gy, w: width, lead: c.lead, ascent: m.ascent, descent: m.descent, from: it.from,
          pieces: [{ text: it.t, run: r, x: gx, w: width, scale: 1, rise: r.baselineShift || 0, from: it.from, to: it.to, body: !/\s/.test(it.t), fr }] });
        L = Math.min(L, gx); R = Math.max(R, gx + width);
      }
      T = Math.min(T, y); B = Math.max(B, y + it.adv);
      y += it.adv + it.trk;
    }
  });
  const sz0 = runs[0].fontSize || 12;
  const origin = { o: [box ? box[2] - firstLead / 2 : base[0], top], d: [0, 1], n: [1, 0], len: 0, h0: sz0 / 2, h1: sz0 / 2 };
  return { lines, overflow, vertical: true, origin, bounds: lines.length ? { left: L, top: T, right: R, bottom: B } : null };
}










export function layoutDynamicText(model, api, dyn = {}) {
  const text = String(model.text || '');
  const runs = model.runs && model.runs.length ? model.runs : [{ from: 0, to: text.length, fontSize: 12 }];
  const box = model.box || [0, 0, 400, 200];
  const W = Math.max(1, box[2] - box[0]), H = Math.max(1, box[3] - box[1]);
  const runAt = i => { for (const r of runs) if (i >= r.from && i < r.to) return r; return runs[runs.length - 1]; };
  const J = model.paragraphs && model.paragraphs[0] ? model.paragraphs[0].justification || 0 : 0;
  const shape = dyn.shape || 'stack';
  
  const measureSpan = (from, to) => {
    const pieces = []; let w = 0;
    let i = from;
    while (i < to) {
      const r = runAt(i); let j = i;
      while (j < to && runAt(j) === r) j++;
      const t = r.caps === 'all' ? text.slice(i, j).toUpperCase() : text.slice(i, j);
      const pw = api.measure(t, r, 1);
      pieces.push({ text: t, run: r, from: i, to: j, w: pw });
      w += pw; i = j;
    }
    return { pieces, w };
  };
  const ink = (r, t) => (api.ink ? api.ink(t, r, 1) : null) || api.metrics(r, 1);
  const out = [];
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  const grow = (x, y) => { L = Math.min(L, x); R = Math.max(R, x); T = Math.min(T, y); B = Math.max(B, y); };
  if (shape === 'stack') {
    
    const paras = []; let p0 = 0;
    for (let k = 0; k <= text.length; k++) if (k === text.length || text[k] === '\n') { if (k > p0) paras.push([p0, k]); p0 = k + 1; }
    const gap = dyn.lineGap != null ? dyn.lineGap : 0.1;
    const stackOf = spans => {
      const ls = spans.map(([f, t]) => {
        const m = measureSpan(f, t), s = m.w > 0 ? W / m.w : 1;
        const r0 = m.pieces[0] ? m.pieces[0].run : runs[0];
        const km = ink(r0, text.slice(f, t));
        return { f, t, m, s, asc: km.ascent, desc: km.descent };
      });
      const h = ls.reduce((a, l, k) => a + (l.asc + l.desc) * l.s + (k ? gap * (l.asc + l.desc) * l.s : 0), 0);
      return { ls, h };
    };
    let spans = paras;
    if (paras.length === 1) {
      const [f, t] = paras[0];
      const words = []; const re = /\S+/g; let mm; const seg = text.slice(f, t);
      while ((mm = re.exec(seg))) words.push([f + mm.index, f + mm.index + mm[0].length]);
      if (words.length > 1) {
        let best = null;
        for (let n = 1; n <= Math.min(words.length, 8); n++) {
          
          const total = words.reduce((a, w) => a + (w[1] - w[0]), 0), per = total / n;
          const groups = []; let cur = [], acc = 0;
          for (const w of words) {
            if (cur.length && acc + (w[1] - w[0]) / 2 > per * (groups.length + 1) && groups.length < n - 1) { groups.push(cur); cur = []; }
            cur.push(w); acc += w[1] - w[0];
          }
          if (cur.length) groups.push(cur);
          const sp = groups.map(g => [g[0][0], g[g.length - 1][1]]);
          const st = stackOf(sp), score = Math.abs(Math.log(st.h / H));
          if (!best || score < best.score) best = { score, sp };
        }
        spans = best.sp;
      }
    }
    if (!spans.length) return { lines: [], overflow: false, bounds: null, dynamic: true };
    const st = stackOf(spans);
    const k = st.h > H ? H / st.h : 1;                 
    let y = box[1] + (H - st.h * k) / 2;               
    st.ls.forEach((l, idx) => {
      const s = l.s * k, lw = l.m.w * s;
      if (idx) y += gap * (l.asc + l.desc) * s;
      const base = y + l.asc * s;
      const x0 = J === 1 ? box[2] - lw : J === 2 ? box[0] + (W - lw) / 2 : k < 1 ? box[0] + (W - lw) / 2 : box[0];
      let cx = x0;
      const pieces = l.m.pieces.map(p => { const q = { text: p.text, run: p.run, x: cx, w: p.w * s, scale: s, rise: 0, from: p.from, to: p.to, body: true }; cx += p.w * s; return q; });
      out.push({ y: base, x: x0, w: lw, lead: (l.asc + l.desc) * s, ascent: l.asc * s, descent: l.desc * s, para: idx, pieces, from: l.f });
      grow(x0, base - l.asc * s); grow(x0 + lw, base + l.desc * s);
      y += (l.asc + l.desc) * s;
    });
    return { lines: out, overflow: false, bounds: out.length ? { left: L, top: T, right: R, bottom: B } : null, dynamic: true };
  }
  
  const flat = text.replace(/\n/g, ' ');
  const chars = [];
  let totalW = 0, asc = 0, desc = 0;
  for (let i = 0; i < flat.length;) {
    const cp = flat.codePointAt(i), ch = String.fromCodePoint(cp), n = ch.length, r = runAt(i);
    const t = r.caps === 'all' ? ch.toUpperCase() : ch;
    const w = api.measure(t, r, 1), m = api.metrics(r, 1);
    chars.push({ t, r, w, from: i, to: i + n });
    totalW += w; asc = Math.max(asc, m.ascent); desc = Math.max(desc, m.descent);
    i += n;
  }
  if (!chars.length || totalW <= 0) return { lines: [], overflow: false, bounds: null, dynamic: true };
  const cx = box[0] + W / 2;
  let C, Rb, span, start, dir, s;
  if (shape === 'circle') {
    const Ro = Math.min(W, H) / 2;
    s = (2 * Math.PI * Ro * 0.97) / (totalW + 2 * Math.PI * asc * 0.97);
    Rb = Ro - asc * s; span = totalW * s / Rb; C = [cx, box[1] + H / 2];
    start = -Math.PI / 2 - span / 2; dir = 1;
  } else if (shape === 'arch') {
    const Ro = Math.min(W / 2, H);
    s = (Math.PI * Ro) / (totalW + Math.PI * asc);
    Rb = Ro - asc * s; span = totalW * s / Rb; C = [cx, box[1] + Math.min(H, Ro) + (H - Ro) / 2];
    start = -Math.PI / 2 - span / 2; dir = 1;
  } else {                                            
    const th = 100 * Math.PI / 180;
    Rb = (W / 2) / Math.sin(th / 2);
    s = (Rb * th) / totalW;
    const sag = Rb * (1 - Math.cos(th / 2));
    if (sag + (asc + desc) * s > H) { const k = H / (sag + (asc + desc) * s); s *= k; }
    span = totalW * s / Rb;
    const bottom = box[1] + H - (H - sag - (asc + desc) * s) / 2 - desc * s;
    C = [cx, bottom - Rb]; start = Math.PI / 2 + span / 2; dir = -1;
  }
  const pieces = [];
  let acc = 0;
  for (const c of chars) {
    const mid = acc + c.w * s / 2;
    const phi = start + dir * mid / Rb;
    const px = C[0] + Rb * Math.cos(phi), py = C[1] + Rb * Math.sin(phi);
    const rot = dir > 0 ? phi + Math.PI / 2 : phi - Math.PI / 2;
    
    const tx = Math.cos(rot), ty = Math.sin(rot);
    const at = [px - tx * c.w * s / 2, py - ty * c.w * s / 2];
    pieces.push({ text: c.t, run: c.r, x: 0, w: c.w * s, scale: s, rise: 0, from: c.from, to: c.to, body: !/\s/.test(c.t), at, rot });
    grow(px - (asc + desc) * s, py - (asc + desc) * s); grow(px + (asc + desc) * s, py + (asc + desc) * s);
    acc += c.w * s;
  }
  out.push({ y: 0, x: 0, w: acc, lead: (asc + desc) * s, ascent: asc * s, descent: desc * s, para: 0, pieces, from: 0 });
  return { lines: out, overflow: false, bounds: { left: L, top: T, right: R, bottom: B }, dynamic: true };
}
