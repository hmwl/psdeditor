















export const U = (unit, value) => ({ __unit: unit, value: +value });
export const E = (type, value) => ({ __enumType: type, value });
const L = n => ({ __L: Math.round(+n || 0) });
const REF_TARGET = cls => ({ __reference: [{ type: 'Enmr', cls: { name: '', cid: cls }, enumType: 'Ordn', value: 'Trgt' }] });
const REF_CLASS = cls => ({ __reference: [{ type: 'Clss', cls: { name: '', cid: cls } }] });
const REF_ORD = (cls, v) => ({ __reference: [{ type: 'Enmr', cls: { name: '', cid: cls }, enumType: 'Ordn', value: v }] });
const REF_NAME = (cls, name) => ({ __reference: [{ type: 'name', cls: { name: '', cid: cls }, name: String(name) }] });
const REF_PROP = (cls, key) => ({ __reference: [{ type: 'prop', cls: { name: '', cid: cls }, key }] });

export function mk(classID, fields = {}, name = '') {
  const o = { __name: name, __classID: classID };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (v && typeof v === 'object' && v.__L !== undefined) { o[k] = v.__L; (o.__long || (o.__long = {}))[k] = true; }
    else if (typeof v === 'number') { o[k] = v; (o.__doub || (o.__doub = {}))[k] = true; }
    else o[k] = v;
  }
  return o;
}
const num = v => (v && typeof v === 'object' && 'value' in v) ? +v.value : (typeof v === 'number' ? v : NaN);
const unitOf = v => (v && typeof v === 'object' && v.__unit) || '';
const en = v => (v && typeof v === 'object' && v.__enumType) ? v.value : null;
const refOf = v => (v && v.__reference) || null;


const BLEND_PAIRS = [['norm', 'Nrml'], ['diss', 'Dslv'], ['dark', 'Drkn'], ['mul ', 'Mltp'], ['idiv', 'CBrn'], ['lbrn', 'linearBurn'],
  ['dkCl', 'darkerColor'], ['lite', 'Lghn'], ['scrn', 'Scrn'], ['div ', 'CDdg'], ['lddg', 'linearDodge'], ['lgCl', 'lighterColor'],
  ['over', 'Ovrl'], ['sLit', 'SftL'], ['hLit', 'HrdL'], ['vLit', 'vividLight'], ['lLit', 'linearLight'], ['pLit', 'pinLight'],
  ['hMix', 'hardMix'], ['diff', 'Dfrn'], ['smud', 'Xclu'], ['fsub', 'blendSubtraction'], ['fdiv', 'blendDivide'],
  ['hue ', 'H   '], ['sat ', 'Strt'], ['colr', 'Clr '], ['lum ', 'Lmns'], ['pass', 'passThrough']];
const BLEND_TO_ENUM = new Map(BLEND_PAIRS), ENUM_TO_BLEND = new Map(BLEND_PAIRS.map(([a, b]) => [b, a]));
export const blendToEnum = k => BLEND_TO_ENUM.get(k) || 'Nrml';
export const enumToBlend = v => ENUM_TO_BLEND.get(v) || 'norm';





const FILTER_MAP = {
  gaussianBlur: ['GsnB', 'Gaussian Blur', [['radius', 'Rds ', 'px']]],
  boxBlur: ['boxblur', 'Box Blur', [['radius', 'Rds ', 'px']]],
  blur: ['Blr ', 'Blur', []], blurMore: ['BlrM', 'Blur More', []], average: ['Avrg', 'Average', []],
  motionBlur: ['MtnB', 'Motion Blur', [['angle', 'Angl', 'long'], ['distance', 'Dstn', 'px']]],
  radialBlur: ['RdlB', 'Radial Blur', [['amount', 'Amnt', 'long'], ['method', 'BlrM', 'enum', ['BlrM', { spin: 'Spn ', zoom: 'Zm  ' }]]]],
  unsharpMask: ['UnsM', 'Unsharp Mask', [['amount', 'Amnt', 'prc'], ['radius', 'Rds ', 'px'], ['threshold', 'Thsh', 'long']]],
  sharpen: ['Shrp', 'Sharpen', []], sharpenMore: ['ShrM', 'Sharpen More', []], sharpenEdges: ['ShrE', 'Sharpen Edges', []],
  addNoise: ['AdNs', 'Add Noise', [['distribution', 'Dstr', 'enum', ['Dstr', { uniform: 'Unfr', gaussian: 'Gsn ' }]], ['amount', 'Nose', 'prc'], ['monochromatic', 'Mnch', 'bool'], ['seed', 'FlRs', 'long']]],
  median: ['Mdn ', 'Median', [['radius', 'Rds ', 'px']]],
  despeckle: ['Dspc', 'Despeckle', []],
  mosaic: ['Msc ', 'Mosaic', [['cell', 'ClSz', 'px']]],
  findEdges: ['FndE', 'Find Edges', []],
  emboss: ['Embs', 'Emboss', [['angle', 'Angl', 'long'], ['height', 'Hght', 'long'], ['amount', 'Amnt', 'long']]],
  solarize: ['Slrz', 'Solarize', []],
  highPass: ['HghP', 'High Pass', [['radius', 'Rds ', 'px']]],
  offset: ['Ofst', 'Offset', [['dx', 'Hrzn', 'long'], ['dy', 'Vrtc', 'long'], ['wrap', 'Fl  ', 'enumBool', ['FlMd', 'Wrp ', 'Bckg']]]],
  maximum: ['Mxm ', 'Maximum', [['radius', 'Rds ', 'px']]],
  minimum: ['Mnm ', 'Minimum', [['radius', 'Rds ', 'px']]],
  clouds: ['Clds', 'Clouds', [['seed', 'FlRs', 'long']]],
  differenceClouds: ['DfrC', 'Difference Clouds', [['seed', 'FlRs', 'long']]],
  facet: ['Fct ', 'Facet', []], fragment: ['Frgm', 'Fragment', []], ntsc: ['NTSC', 'NTSC Colors', []],
  pinch: ['Pnch', 'Pinch', [['amount', 'Amnt', 'long']]],
  twirl: ['Twrl', 'Twirl', [['angle', 'Angl', 'long']]],
  crystallize: ['Crst', 'Crystallize', [['cell', 'ClSz', 'long'], ['seed', 'FlRs', 'long']]],
  pointillize: ['Pntl', 'Pointillize', [['cell', 'ClSz', 'long'], ['seed', 'FlRs', 'long']]],
  surfaceBlur: ['surfaceBlur', 'Surface Blur', [['radius', 'Rds ', 'px'], ['threshold', 'Thsh', 'long']]],
  ripple: ['Rple', 'Ripple', [['amount', 'Amnt', 'long'], ['size', 'RplS', 'enum', ['RplS', { small: 'Sml ', medium: 'Mdm ', large: 'Lrg ' }]]]],
  spherize: ['Sphr', 'Spherize', [['amount', 'Amnt', 'long'], ['mode', 'SphM', 'enum', ['SphM', { normal: 'Nrml', horizontal: 'HrzO', vertical: 'VrtO' }]]]],
  polar: ['Plr ', 'Polar Coordinates', [['mode', 'Cnvr', 'enum', ['Cnvr', { rectToPolar: 'RctP', polarToRect: 'PlrR' }]]]],
  dustScratches: ['DstS', 'Dust & Scratches', [['radius', 'Rds ', 'long'], ['threshold', 'Thsh', 'long']]],
  traceContour: ['TrcC', 'Trace Contour', [['level', 'Lvl ', 'long'], ['edge', 'Edg ', 'enum', ['CntE', { lower: 'Lwr ', upper: 'Upr ' }]]]],
  
  autoTone: ['Lvls', 'Levels', [], { Auto: true }],
  autoContrast: ['Lvls', 'Levels', [], { AuCo: true }],
};
const FILTER_BY_EVENT = new Map();
for (const [kind, [ev, , , extra]] of Object.entries(FILTER_MAP)) {
  if (ev === 'Lvls') continue;
  FILTER_BY_EVENT.set(ev, kind);
}

function encodeFilter(kind, params = {}) {
  const m = FILTER_MAP[kind];
  if (!m) {
    
    return { idType: 'TEXT', event: 'psd_editorFilter', name: 'PSD Editor Filter', desc: mk('null', { kind, ...plain(params) }) };
  }
  const [ev, name, keys, extra] = m;
  const f = { ...(extra || {}) };
  for (const [ok, pk, t, x] of keys) {
    const v = params[ok]; if (v === undefined) continue;
    if (t === 'px') f[pk] = U('#Pxl', v);
    else if (t === 'prc') f[pk] = U('#Prc', v);
    else if (t === 'ang') f[pk] = U('#Ang', v);
    else if (t === 'long') f[pk] = L(v);
    else if (t === 'bool') f[pk] = !!v;
    else if (t === 'enum') f[pk] = E(x[0], x[1][v] || Object.values(x[1])[0]);
    else if (t === 'enumBool') f[pk] = E(x[0], v ? x[1] : x[2]);
    else f[pk] = +v;
  }
  const desc = Object.keys(f).length ? mk(ev.length === 4 ? ev : ev, f) : null;
  return { idType: ev.length === 4 && ev !== 'boxblur' ? 'long' : 'TEXT', event: ev, name, desc };
}
function decodeFilter(ev, desc) {
  let kind = FILTER_BY_EVENT.get(ev);
  if (ev === 'Lvls' && desc) kind = desc.Auto === true ? 'autoTone' : desc.AuCo === true ? 'autoContrast' : null;
  if (!kind) return null;
  const [, , keys] = FILTER_MAP[kind];
  const params = {};
  for (const [ok, pk, t, x] of keys) {
    if (!desc || !(pk in desc)) continue;
    const v = desc[pk];
    if (t === 'bool') params[ok] = !!v;
    else if (t === 'enum') { const inv = Object.entries(x[1]).find(([, pv]) => pv === en(v)); if (inv) params[ok] = inv[0]; }
    else if (t === 'enumBool') params[ok] = en(v) === x[1];
    else { const n = num(v); if (Number.isFinite(n)) params[ok] = n; }
  }
  return { op: 'filter', p: { kind, params } };
}

function plainVal(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? L(v) : v) : undefined;
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const a = [], lg = {}, db = {};
    for (const x of v) {
      const pv = plainVal(x); if (pv === undefined) continue;
      if (pv && typeof pv === 'object' && pv.__L !== undefined) { lg[a.length] = true; a.push(pv.__L); }
      else { if (typeof pv === 'number') db[a.length] = true; a.push(pv); }
    }
    if (Object.keys(lg).length) a.__long = lg;
    if (Object.keys(db).length) a.__doub = db;
    return a;
  }
  if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) return mk('null', plain(v));
  return undefined;
}
function plain(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (k.startsWith('_')) continue;
    const pv = plainVal(v); if (pv !== undefined) out[k] = pv;
  }
  return out;
}
function unplainVal(v) {
  if (Array.isArray(v)) return v.map(unplainVal);
  if (v && typeof v === 'object' && v.__classID !== undefined && !v.__reference) return unplain(v);
  return v;
}
function unplain(d) {
  const o = {};
  for (const k of Object.keys(d || {})) { if (!k.startsWith('__')) o[k] = unplainVal(d[k]); }
  return o;
}


const FILL_USING = { fg: 'FrgC', bg: 'BckC', black: 'Blck', gray: 'Gry ', white: 'Wht ', color: 'Clr ' };
const rgbDesc = c => mk('RGBC', { 'Rd  ': +c[0] || 0, 'Grn ': +c[1] || 0, 'Bl  ': +c[2] || 0 });
const rgbOf = d => d ? [num(d['Rd  ']) || 0, num(d['Grn ']) || 0, num(d['Bl  ']) || 0].map(v => Math.round(v)) : [0, 0, 0];
const layerSet = (fields) => mk('setd', { 'null': REF_TARGET('Lyr '), 'T   ': mk('Lyr ', fields) });


export function encodeOp(op, p = {}) {
  switch (op) {
    case 'newLayer': {
      const f = {};
      if (p.name) f['Nm  '] = String(p.name);
      if (p.opacity != null && p.opacity !== 100) f['Opct'] = U('#Prc', p.opacity);
      if (p.mode && p.mode !== 'norm') f['Md  '] = E('BlnM', blendToEnum(p.mode));
      const d = { 'null': REF_CLASS('Lyr ') };
      if (Object.keys(f).length) d['Usng'] = mk('Lyr ', f);
      return { idType: 'long', event: 'Mk  ', name: 'Make', desc: mk('Mk  ', d) };
    }
    case 'fill': {
      if (p.using === 'contentAware') return { idType: 'long', event: 'Fl  ', name: 'Fill', desc: mk('Fl  ', { 'Usng': E('FlCn', 'contentAware'), 'Opct': U('#Prc', 100), 'Md  ': E('BlnM', 'Nrml') }) };
      const d = { 'Usng': E('FlCn', FILL_USING[p.using] || 'FrgC') };
      if (p.using === 'color' && p.color) d['Clr '] = rgbDesc(p.color);
      d['Opct'] = U('#Prc', p.opacity != null ? p.opacity : 100);
      d['Md  '] = E('BlnM', blendToEnum(p.mode || 'norm'));
      if (p.preserve) d['PrsT'] = true;
      return { idType: 'long', event: 'Fl  ', name: 'Fill', desc: mk('Fl  ', d) };
    }
    case 'filter': return encodeFilter(p.kind, p.params || {});
    case 'layerProps': {
      const f = {};
      if (p.name != null) f['Nm  '] = String(p.name);
      if (p.opacity != null) f['Opct'] = U('#Prc', p.opacity);
      if (p.fillOpacity != null) f['fillOpacity'] = U('#Prc', p.fillOpacity);
      if (p.mode) f['Md  '] = E('BlnM', blendToEnum(p.mode));
      return { idType: 'long', event: 'setd', name: 'Set', desc: layerSet(f) };
    }
    case 'visible': {
      const list = [REF_TARGET('Lyr ')];
      return { idType: 'long', event: p.visible ? 'Shw ' : 'Hd  ', name: p.visible ? 'Show' : 'Hide', desc: mk(p.visible ? 'Shw ' : 'Hd  ', { 'null': list }) };
    }
    case 'deleteLayer': return { idType: 'long', event: 'Dlt ', name: 'Delete', desc: mk('Dlt ', { 'null': REF_TARGET('Lyr ') }) };
    case 'duplicateLayer': return { idType: 'long', event: 'Dplc', name: 'Duplicate', desc: mk('Dplc', { 'null': REF_TARGET('Lyr '), ...(p.name ? { 'Nm  ': String(p.name) } : {}), 'Vrsn': L(5) }) };
    case 'selectLayer': {
      const ORD = { up: 'Frwr', down: 'Bckw', top: 'Frnt', bottom: 'Back' };
      const ref = p.name != null ? REF_NAME('Lyr ', p.name) : REF_ORD('Lyr ', ORD[p.dir] || 'Frwr');
      return { idType: 'long', event: 'slct', name: 'Select', desc: mk('slct', { 'null': ref, 'MkVs': false }) };
    }
    case 'selectAll': return { idType: 'long', event: 'setd', name: 'Set', desc: mk('setd', { 'null': REF_PROP('Chnl', 'fsel'), 'T   ': E('Ordn', 'Al  ') }) };
    case 'deselect': return { idType: 'long', event: 'setd', name: 'Set', desc: mk('setd', { 'null': REF_PROP('Chnl', 'fsel'), 'T   ': E('Ordn', 'None') }) };
    case 'selectShape': {
      
      const r = mk(p.ellipse ? 'Elps' : 'Rctn', { 'Top ': U('#Pxl', p.top), 'Left': U('#Pxl', p.left), 'Btom': U('#Pxl', p.bottom), 'Rght': U('#Pxl', p.right) });
      const EV = { add: ['AddT', 'Add To', 'T   '], subtract: ['SbtF', 'Subtract From', 'T   '], intersect: ['IntW', 'Intersect With', 'T   '] }[p.mode] || ['setd', 'Set', 'T   '];
      const d = { 'null': REF_PROP('Chnl', 'fsel'), [EV[2]]: r };
      if (p.feather) d['Fthr'] = U('#Pxl', p.feather);
      d['AntA'] = p.antiAlias !== false;
      return { idType: 'long', event: EV[0], name: EV[1], desc: mk(EV[0], d) };
    }
    case 'adjust': {
      
      const m = p.model || {};
      if (p.type === 'brightnessContrast') return { idType: 'long', event: 'BrgC', name: 'Brightness/Contrast', desc: mk('BrgC', { 'Brgh': L(m.brightness || 0), 'Cntr': L(m.contrast || 0), 'useLegacy': true }) };
      if (p.type === 'posterize') return { idType: 'long', event: 'Pstr', name: 'Posterize', desc: mk('Pstr', { 'Lvls': L(m.levels || 4) }) };
      if (p.type === 'threshold') return { idType: 'long', event: 'Thrs', name: 'Threshold', desc: mk('Thrs', { 'Lvl ': L(m.level || 128) }) };
      if (p.type === 'invert') return encodeOp('invert', {});
      if (p.type === 'desaturate') return encodeOp('desaturate', {});
      return { idType: 'TEXT', event: 'psd_editorAdjust', name: 'PSD Editor Adjust', desc: mk('null', { type: String(p.type), ...plain(m) }) };
    }
    case 'color': {
      
      return { idType: 'long', event: 'setd', name: 'Set', desc: mk('setd', { 'null': REF_PROP('Clr ', p.which === 'bg' ? 'BckC' : 'FrgC'), 'T   ': rgbDesc(p.rgb || [0, 0, 0]) }) };
    }
    case 'invertSel': return { idType: 'long', event: 'Invs', name: 'Inverse', desc: null };
    case 'feather': return { idType: 'long', event: 'Fthr', name: 'Feather', desc: mk('Fthr', { 'Rds ': U('#Pxl', p.radius) }) };
    case 'expand': return { idType: 'long', event: 'Expn', name: 'Expand', desc: mk('Expn', { 'By  ': U('#Pxl', p.by) }) };
    case 'contract': return { idType: 'long', event: 'Cntc', name: 'Contract', desc: mk('Cntc', { 'By  ': U('#Pxl', p.by) }) };
    case 'border': return { idType: 'long', event: 'Brdr', name: 'Border', desc: mk('Brdr', { 'Wdth': U('#Pxl', p.width) }) };
    case 'smooth': return { idType: 'long', event: 'Smth', name: 'Smooth', desc: mk('Smth', { 'Rds ': U('#Pxl', p.radius) }) };
    case 'mergeDown': return { idType: 'long', event: 'Mrg2', name: 'Merge Layers', desc: null };
    case 'mergeVisible': return { idType: 'long', event: 'MrgV', name: 'Merge Visible', desc: null };
    case 'flatten': return { idType: 'long', event: 'FltI', name: 'Flatten Image', desc: null };
    case 'imageSize': return { idType: 'long', event: 'ImgS', name: 'Image Size', desc: mk('ImgS', { 'Wdth': U('#Pxl', p.width), 'Hght': U('#Pxl', p.height), 'Intr': E('Intp', 'bicubicAutomatic') }) };
    case 'canvasSize': {
      const H = { left: 'Left', center: 'Cntr', right: 'Rght' }, V = { top: 'Top ', center: 'Cntr', bottom: 'Btom' };
      return { idType: 'long', event: 'CnvS', name: 'Canvas Size', desc: mk('CnvS', { 'Wdth': U('#Pxl', p.width), 'Hght': U('#Pxl', p.height), 'Hrzn': E('HrzL', H[p.h] || 'Cntr'), 'Vrtc': E('VrtL', V[p.v] || 'Cntr') }) };
    }
    case 'rotateCanvas': return { idType: 'long', event: 'Rtte', name: 'Rotate', desc: mk('Rtte', { 'null': REF_ORD('Dcmn', 'Frst'), 'Angl': U('#Ang', p.angle) }) };
    case 'flipCanvas': return { idType: 'long', event: 'Flip', name: 'Flip', desc: mk('Flip', { 'null': REF_ORD('Dcmn', 'Frst'), 'Axis': E('Ornt', p.axis === 'v' ? 'Vrtc' : 'Hrzn') }) };
    case 'trim': return { idType: 'TEXT', event: 'trim', name: 'Trim', desc: mk('trim', { 'trimBasedOn': E('trimBasedOn', p.basis === 'bottomRight' ? 'bottomRightPixelColor' : p.basis === 'topLeft' ? 'topLeftPixelColor' : 'transparency'), 'Top ': true, 'Btom': true, 'Left': true, 'Rght': true }) };
    case 'revealAll': return { idType: 'long', event: 'RvlA', name: 'Reveal All', desc: null };
    case 'crop': return { idType: 'long', event: 'Crop', name: 'Crop', desc: mk('Crop', { 'T   ': mk('Rctn', { 'Top ': U('#Pxl', p.top), 'Left': U('#Pxl', p.left), 'Btom': U('#Pxl', p.bottom), 'Rght': U('#Pxl', p.right) }), 'Angl': U('#Ang', p.angle || 0), 'Dlt ': p.deletePixels !== false }) };
    case 'invert': return { idType: 'long', event: 'Invr', name: 'Invert', desc: null };
    case 'desaturate': return { idType: 'long', event: 'Dstt', name: 'Desaturate', desc: null };
    case 'equalize': return { idType: 'long', event: 'Eqlz', name: 'Equalize', desc: null };
    case 'transform': return { idType: 'long', event: 'Trnf', name: 'Transform', desc: mk('Trnf', { 'null': REF_TARGET('Lyr '), 'FTcs': E('QCSt', 'Qcsa'),
      'Ofst': mk('Ofst', { 'Hrzn': U('#Pxl', p.dx || 0), 'Vrtc': U('#Pxl', p.dy || 0) }), 'Wdth': U('#Prc', p.sx != null ? p.sx : 100), 'Hght': U('#Prc', p.sy != null ? p.sy : 100), 'Angl': U('#Ang', p.angle || 0) }) };
    case 'move': return { idType: 'long', event: 'move', name: 'Move', desc: mk('move', { 'null': REF_TARGET('Lyr '), 'T   ': mk('Ofst', { 'Hrzn': U('#Pxl', p.dx || 0), 'Vrtc': U('#Pxl', p.dy || 0) }) }) };
    case 'save': {
      const AS = { psd: mk('Pht3', { 'maximizeCompatibility': true }), png: mk('PNGF', { 'PGIT': E('PGIT', 'PGIN'), 'PNGf': E('PNGf', 'PGAd') }), jpg: mk('JPEG', { 'EQlt': L(p.quality != null ? Math.round(p.quality / 100 * 12) : 10), 'MttC': E('MttC', 'None') }) };
      return { idType: 'long', event: 'save', name: 'Save', desc: mk('save', { 'As  ': AS[p.format] || AS.psd, 'Cpy ': !!p.copy }) };
    }
    case 'stop': return { idType: 'long', event: 'Stop', name: 'Stop', desc: mk('Stop', { 'Msge': String(p.message || ''), ...(p.allowContinue ? { 'Cntn': true } : {}) }) };
    case 'command': {
      const d = { cmd: String(p.cmd) };
      if (p.label) d.label = String(p.label);
      if (p.menu) d.menu = true;
      
      if (p.dialogs && p.dialogs.length) d.dialogs = p.dialogs.map(v => v == null ? mk('null', { cancelled: true }) : mk('null', { value: plainVal(v) ?? '' }));
      return { idType: 'TEXT', event: 'psd_editorCommand', name: 'PSD Editor Command', desc: mk('null', d) };
    }
    case 'workPath': {
      
      const subs = (p.subpaths || []).map(sp => mk('Sbpl', { 'Clsp': !!sp.closed, 'Pts ': (sp.points || []).map(pt => mk('Pthp', {
        'Anch': mk('Pnt ', { 'Hrzn': U('#Pxl', pt.x), 'Vrtc': U('#Pxl', pt.y) }),
        ...(pt.inX != null ? { 'Fwd ': mk('Pnt ', { 'Hrzn': U('#Pxl', pt.outX), 'Vrtc': U('#Pxl', pt.outY) }), 'Bwd ': mk('Pnt ', { 'Hrzn': U('#Pxl', pt.inX), 'Vrtc': U('#Pxl', pt.inY) }), 'Smoo': !!pt.smooth } : {}),
      })) }));
      return { idType: 'long', event: 'setd', name: 'Set', desc: mk('setd', { 'null': REF_PROP('Path', 'WrPt'), 'T   ': mk('PaCm', { 'SbpL': [mk('PaCm', { 'ShpO': E('ShpO', 'Xor '), 'SbpL': subs })] }) }) };
    }
  }
  return null;
}


const isTargetLayerRef = v => { const r = refOf(Array.isArray(v) ? v[0] : v); return !!(r && r[0] && r[0].cls && r[0].cls.cid === 'Lyr '); };

export function decodeStep(step) {
  if (!step) return null;
  const ev = step.event, d = step.desc || {};
  const fl = decodeFilter(ev, step.desc);
  if (fl) return fl;
  switch (ev) {
    case 'Mk  ': {
      const r = refOf(d['null']); const c = r && r[0] && r[0].cls && r[0].cls.cid;
      if (c !== 'Lyr ') return null;
      const u = d['Usng'] || {};
      return { op: 'newLayer', p: { name: typeof u['Nm  '] === 'string' ? u['Nm  '] : undefined,
        opacity: u['Opct'] ? num(u['Opct']) : undefined, mode: u['Md  '] ? enumToBlend(en(u['Md  '])) : undefined } };
    }
    case 'Fl  ': {
      const using = en(d['Usng']);
      const inv = { FrgC: 'fg', BckC: 'bg', Blck: 'black', 'Gry ': 'gray', 'Wht ': 'white', 'Clr ': 'color', contentAware: 'contentAware' }[using];
      if (!inv) return null;           
      return { op: 'fill', p: { using: inv, color: inv === 'color' ? rgbOf(d['Clr ']) : undefined,
        opacity: d['Opct'] ? num(d['Opct']) : 100, mode: d['Md  '] ? enumToBlend(en(d['Md  '])) : 'norm', preserve: !!d['PrsT'] } };
    }
    case 'setd': {
      const r = refOf(d['null']); const r0 = r && r[0];
      if (!r0) return null;
      if (r0.type === 'prop' && r0.cls.cid === 'Chnl' && r0.key === 'fsel') {
        const to = d['T   '];
        if (en(to) === 'Al  ') return { op: 'selectAll', p: {} };
        if (en(to) === 'None') return { op: 'deselect', p: {} };
        if (to && (to.__classID === 'Rctn' || to.__classID === 'Elps')) return { op: 'selectShape', p: { ellipse: to.__classID === 'Elps',
          top: num(to['Top ']), left: num(to['Left']), bottom: num(to['Btom']), right: num(to['Rght']), feather: d['Fthr'] ? num(d['Fthr']) : 0 } };
        return null;
      }
      if (r0.type === 'prop' && r0.cls.cid === 'Clr ' && (r0.key === 'FrgC' || r0.key === 'BckC')) {
        const T = d['T   '];
        if (!T || T.__classID !== 'RGBC') return null;      
        return { op: 'color', p: { which: r0.key === 'BckC' ? 'bg' : 'fg', rgb: rgbOf(T) } };
      }
      if (r0.type === 'prop' && r0.cls.cid === 'Path' && r0.key === 'WrPt') {
        const T = d['T   '], outer = T && T['SbpL'] && T['SbpL'][0];
        const subs = ((outer && outer['SbpL']) || []).map(sp => ({ closed: !!sp['Clsp'], points: (sp['Pts '] || []).map(pp => {
          const a = pp['Anch'] || {}, f = pp['Fwd '], b = pp['Bwd '];
          const pt = { x: num(a['Hrzn']), y: num(a['Vrtc']) };
          if (f && b) Object.assign(pt, { outX: num(f['Hrzn']), outY: num(f['Vrtc']), inX: num(b['Hrzn']), inY: num(b['Vrtc']), smooth: !!pp['Smoo'] });
          return pt;
        }) }));
        
        return { op: 'workPath', p: { subpaths: subs } };
      }
      if (r0.cls && r0.cls.cid === 'Lyr ' && r0.type === 'Enmr' && d['T   '] && d['T   '].__classID === 'Lyr ') {
        const T = d['T   '], p = {};
        if (typeof T['Nm  '] === 'string') p.name = T['Nm  '];
        if (T['Opct']) p.opacity = num(T['Opct']);
        if (T['fillOpacity']) p.fillOpacity = num(T['fillOpacity']);
        if (T['Md  ']) p.mode = enumToBlend(en(T['Md  ']));
        if (!Object.keys(p).length) return null;
        return { op: 'layerProps', p };
      }
      return null;
    }
    case 'Shw ': case 'Hd  ': return isTargetLayerRef(d['null']) || !d['null'] ? { op: 'visible', p: { visible: ev === 'Shw ' } } : null;
    case 'Dlt ': return isTargetLayerRef(d['null']) ? { op: 'deleteLayer', p: {} } : null;
    case 'Dplc': return isTargetLayerRef(d['null']) ? { op: 'duplicateLayer', p: { name: typeof d['Nm  '] === 'string' ? d['Nm  '] : undefined } } : null;
    case 'slct': {
      const r = refOf(d['null']); const r0 = r && r[0];
      if (!r0 || !r0.cls || r0.cls.cid !== 'Lyr ') return null;
      if (r0.type === 'name') return { op: 'selectLayer', p: { name: r0.name } };
      if (r0.type === 'Enmr') { const dir = { Frwr: 'up', Bckw: 'down', Frnt: 'top', Back: 'bottom' }[r0.value]; return dir ? { op: 'selectLayer', p: { dir } } : null; }
      return null;
    }
    case 'AddT': case 'SbtF': case 'IntW': {
      const r = refOf(d['null']); const r0 = r && r[0];
      if (!r0 || r0.type !== 'prop' || r0.key !== 'fsel') return null;
      const to = d['T   '] || d['From'];
      if (!to || (to.__classID !== 'Rctn' && to.__classID !== 'Elps')) return null;
      return { op: 'selectShape', p: { mode: { AddT: 'add', SbtF: 'subtract', IntW: 'intersect' }[ev], ellipse: to.__classID === 'Elps',
        top: num(to['Top ']), left: num(to['Left']), bottom: num(to['Btom']), right: num(to['Rght']), feather: d['Fthr'] ? num(d['Fthr']) : 0, antiAlias: d['AntA'] !== false } };
    }
    case 'BrgC': return { op: 'adjust', p: { type: 'brightnessContrast', model: { brightness: num(d['Brgh']) || 0, contrast: num(d['Cntr']) || 0 } } };
    case 'Pstr': return { op: 'adjust', p: { type: 'posterize', model: { levels: num(d['Lvls']) || 4 } } };
    case 'Thrs': return { op: 'adjust', p: { type: 'threshold', model: { level: num(d['Lvl ']) || 128 } } };
    case 'psd_editorAdjust': { const o = unplain(d); const type = o.type; delete o.type; return type ? { op: 'adjust', p: { type, model: o } } : null; }
    case 'Invs': return { op: 'invertSel', p: {} };
    case 'Fthr': return { op: 'feather', p: { radius: num(d['Rds ']) } };
    case 'Expn': return { op: 'expand', p: { by: num(d['By  ']) } };
    case 'Cntc': return { op: 'contract', p: { by: num(d['By  ']) } };
    case 'Brdr': return { op: 'border', p: { width: num(d['Wdth']) } };
    case 'Smth': return { op: 'smooth', p: { radius: num(d['Rds ']) } };
    case 'Mrg2': return { op: 'mergeDown', p: {} };
    case 'MrgV': return { op: 'mergeVisible', p: {} };
    case 'FltI': return { op: 'flatten', p: {} };
    case 'ImgS': {
      
      const w = d['Wdth'], h = d['Hght'];
      return { op: 'imageSize', p: { width: num(w), height: num(h), wUnit: unitOf(w), hUnit: unitOf(h), constrain: !!d['CnsP'] } };
    }
    case 'CnvS': {
      const H = { Left: 'left', Cntr: 'center', Rght: 'right' }, V = { 'Top ': 'top', Cntr: 'center', Btom: 'bottom' };
      return { op: 'canvasSize', p: { width: num(d['Wdth']), height: num(d['Hght']), wUnit: unitOf(d['Wdth']), hUnit: unitOf(d['Hght']), relative: !!d['Rltv'],
        h: H[en(d['Hrzn'])] || 'center', v: V[en(d['Vrtc'])] || 'center' } };
    }
    case 'Rtte': { const r = refOf(d['null']); if (r && r[0] && r[0].cls && r[0].cls.cid !== 'Dcmn') return null; return { op: 'rotateCanvas', p: { angle: num(d['Angl']) } }; }
    case 'Flip': { const r = refOf(d['null']); if (r && r[0] && r[0].cls && r[0].cls.cid !== 'Dcmn') return null; return { op: 'flipCanvas', p: { axis: en(d['Axis']) === 'Vrtc' ? 'v' : 'h' } }; }
    case 'trim': { const b = en(d['trimBasedOn']); return { op: 'trim', p: { basis: b === 'topLeftPixelColor' ? 'topLeft' : b === 'bottomRightPixelColor' ? 'bottomRight' : 'transparency' } }; }
    case 'RvlA': return { op: 'revealAll', p: {} };
    case 'Crop': {
      const T = d['T   '];
      if (!T) return { op: 'crop', p: { toSelection: true } };       
      return { op: 'crop', p: { top: num(T['Top ']), left: num(T['Left']), bottom: num(T['Btom']), right: num(T['Rght']), angle: num(d['Angl']) || 0, deletePixels: d['Dlt '] !== false,
        unit: unitOf(T['Top ']) } };
    }
    case 'Invr': return { op: 'invert', p: {} };
    case 'Dstt': return { op: 'desaturate', p: {} };
    case 'Eqlz': return { op: 'equalize', p: {} };
    case 'Trnf': {
      if (d['null'] && !isTargetLayerRef(d['null'])) return null;
      const o = d['Ofst'] || {};
      return { op: 'transform', p: { dx: num(o['Hrzn']) || 0, dy: num(o['Vrtc']) || 0, sx: d['Wdth'] ? num(d['Wdth']) : 100, sy: d['Hght'] ? num(d['Hght']) : 100, angle: d['Angl'] ? num(d['Angl']) : 0 } };
    }
    case 'move': {
      if (!isTargetLayerRef(d['null'])) return null;
      const T = d['T   '] || {};
      return { op: 'move', p: { dx: num(T['Hrzn']) || 0, dy: num(T['Vrtc']) || 0 } };
    }
    case 'save': {
      const as = d['As  '], c = as && as.__classID;
      const format = c === 'PNGF' ? 'png' : c === 'JPEG' ? 'jpg' : 'psd';
      return { op: 'save', p: { format, quality: c === 'JPEG' && d['As  ']['EQlt'] != null ? Math.round(num(d['As  ']['EQlt']) / 12 * 100) : undefined, copy: !!d['Cpy '] } };
    }
    case 'Stop': return { op: 'stop', p: { message: typeof d['Msge'] === 'string' ? d['Msge'] : '', allowContinue: !!d['Cntn'] } };
    case 'psd_editorFilter': { const o = unplain(d); const kind = o.kind; delete o.kind; return kind ? { op: 'filter', p: { kind, params: o } } : null; }
    case 'psd_editorCommand': {
      if (typeof d.cmd !== 'string') return null;
      return { op: 'command', p: { cmd: d.cmd, label: d.label, menu: !!d.menu, dialogs: Array.isArray(d.dialogs) ? d.dialogs.map(x => { if (!x || x.cancelled) return null; const u = unplain(x); return 'value' in u ? u.value : u; }) : [] } };
    }
  }
  return null;
}


export const EVENT_ZH = {
  'Mk  ': '建立', 'setd': '设置', 'Fl  ': '填充', 'Dlt ': '删除', 'Dplc': '复制', 'slct': '选择', 'Shw ': '显示', 'Hd  ': '隐藏',
  'Invs': '反选', 'Fthr': '羽化', 'Expn': '扩展', 'Cntc': '收缩', 'Brdr': '边界', 'Smth': '平滑', 'Mrg2': '合并图层', 'MrgV': '合并可见图层',
  'FltI': '拼合图像', 'ImgS': '图像大小', 'CnvS': '画布大小', 'Rtte': '旋转', 'Flip': '翻转', 'trim': '裁切', 'RvlA': '显示全部', 'Crop': '裁剪',
  'Invr': '反相', 'Dstt': '去色', 'Eqlz': '色调均化', 'Trnf': '变换', 'move': '移动', 'save': '存储', 'Stop': '停止', 'Lvls': '色阶',
  'Opn ': '打开', 'Cls ': '关闭', 'Crvs': '曲线', 'BrgC': '亮度/对比度', 'HStr': '色相/饱和度', 'ClrB': '色彩平衡', 'Thrs': '阈值', 'Pstr': '色调分离',
  'placedLayerReplaceContents': '替换内容', 'newPlacedLayer': '转换为智能对象', 'Plc ': '置入', 'copy': '拷贝', 'past': '粘贴', 'CpTL': '通过拷贝的图层',
  'psd_editorCommand': '菜单命令', 'psd_editorFilter': '滤镜', 'psd_editorAdjust': '调整',
  'AddT': '添加到', 'SbtF': '从选区中减去', 'IntW': '与选区交叉',
};
for (const [kind, [ev, name]] of Object.entries(FILTER_MAP)) if (!EVENT_ZH[ev]) EVENT_ZH[ev] = FILTER_ZH_FALLBACK(kind, name);
function FILTER_ZH_FALLBACK(kind, name) {
  const Z = { gaussianBlur: '高斯模糊', boxBlur: '方框模糊', blur: '模糊', blurMore: '进一步模糊', average: '平均', motionBlur: '动感模糊', radialBlur: '径向模糊',
    unsharpMask: 'USM 锐化', sharpen: '锐化', sharpenMore: '进一步锐化', sharpenEdges: '锐化边缘', addNoise: '添加杂色', median: '中间值', despeckle: '去斑',
    mosaic: '马赛克', findEdges: '查找边缘', emboss: '浮雕效果', solarize: '曝光过度', highPass: '高反差保留', offset: '位移', maximum: '最大值', minimum: '最小值',
    clouds: '云彩', differenceClouds: '分层云彩', facet: '彩块化', fragment: '碎片', ntsc: 'NTSC 颜色', pinch: '挤压', twirl: '旋转扭曲', crystallize: '晶格化',
    pointillize: '点状化', surfaceBlur: '表面模糊', ripple: '波纹', spherize: '球面化', polar: '极坐标', dustScratches: '蒙尘与划痕', traceContour: '等高线' };
  return Z[kind] || name;
}
const ADJ_ZH = { levels: '色阶', curves: '曲线', exposure: '曝光度', vibrance: '自然饱和度', hueSaturation: '色相/饱和度', colorBalance: '色彩平衡',
  blackWhite: '黑白', photoFilter: '照片滤镜', channelMixer: '通道混合器', gradientMap: '渐变映射', selectiveColor: '可选颜色', brightnessContrast: '亮度/对比度',
  posterize: '色调分离', threshold: '阈值', invert: '反相', desaturate: '去色' };
const KEY_ZH = { 'Nm  ': '名称', 'Opct': '不透明度', 'Md  ': '模式', 'Usng': '使用', 'T   ': '到', 'Clr ': '颜色', 'Rds ': '半径', 'Wdth': '宽度', 'Hght': '高度',
  'Angl': '角度', 'Dstn': '距离', 'Amnt': '数量', 'Thsh': '阈值', 'By  ': '数量', 'Top ': '顶', 'Left': '左', 'Btom': '底', 'Rght': '右', 'Ofst': '位移',
  'Hrzn': '水平', 'Vrtc': '垂直', 'Axis': '轴', 'FTcs': '参考点', 'Intr': '插值', 'Msge': '信息', 'Cntn': '允许继续', 'PrsT': '保留透明区域', 'fillOpacity': '填充不透明度',
  'Nose': '数量', 'Dstr': '分布', 'Mnch': '单色', 'ClSz': '单元格大小', 'Lvl ': '色阶', 'Dlt ': '删除裁剪的像素', 'In  ': '存储位置', 'As  ': '存储为', 'Cpy ': '作为副本',
  'Fthr': '羽化', 'AntA': '消除锯齿', 'MkVs': '显示', 'Vrsn': '版本', 'FlRs': '随机种子', 'BlrM': '方法', 'Fl  ': '未定义区域', 'Auto': '自动', 'AuCo': '自动对比度',
  'trimBasedOn': '基于', 'Rd  ': '红', 'Grn ': '绿', 'Bl  ': '蓝', 'EQlt': '品质', 'layerID': '图层 ID', 'CnsP': '约束比例', 'Rltv': '相对',
  'Brgh': '亮度', 'Cntr': '对比度', 'useLegacy': '使用旧版', 'Lvls': '色阶', 'Srce': '来源', 'From': '来自', 'Wrap': '折回' };
const ENUM_ZH = { FrgC: '前景色', BckC: '背景色', Blck: '黑色', 'Gry ': '50% 灰色', 'Wht ': '白色', 'Clr ': '颜色', contentAware: '内容识别', 'Al  ': '全部', None: '无',
  Trgt: '当前', Cntr: '居中', 'Top ': '顶', Btom: '底', Left: '左', Rght: '右', Hrzn: '水平', Vrtc: '垂直', Qcsa: '中心', Unfr: '平均分布', 'Gsn ': '高斯分布',
  'Wrp ': '折回', Bckg: '设置为透明', bicubicAutomatic: '两次立方（自动）', topLeftPixelColor: '左上角像素颜色', bottomRightPixelColor: '右下角像素颜色', transparency: '透明像素',
  'Spn ': '旋转', 'Zm  ': '缩放',
  Nrml: '正常', Dslv: '溶解', Drkn: '变暗', Mltp: '正片叠底', CBrn: '颜色加深', linearBurn: '线性加深', darkerColor: '深色', Lghn: '变亮', Scrn: '滤色', CDdg: '颜色减淡',
  linearDodge: '线性减淡（添加）', lighterColor: '浅色', Ovrl: '叠加', SftL: '柔光', HrdL: '强光', vividLight: '亮光', linearLight: '线性光', pinLight: '点光', hardMix: '实色混合',
  Dfrn: '差值', Xclu: '排除', blendSubtraction: '减去', blendDivide: '划分', 'H   ': '色相', Strt: '饱和度', Lmns: '明度', passThrough: '穿透' };
const CLASS_ZH = { 'Lyr ': '图层', 'Dcmn': '文档', 'Chnl': '通道', 'Rctn': '矩形', 'Elps': '椭圆', 'Ofst': '位移', 'RGBC': 'RGB 颜色', 'Pht3': 'Photoshop',
  'PNGF': 'PNG', 'JPEG': 'JPEG', 'Path': '路径', 'PaCm': '路径内容', 'Mn  ': '菜单项目' };
const UNIT_ZH = { '#Pxl': ' 像素', '#Prc': '%', '#Ang': '°', '#Rlt': ' 点', '#Rsl': ' 像素/英寸', '#Mlm': ' 毫秒', '#Pnt': ' 点', '#Nne': '' };
const fmtNum = n => (Math.round(n * 100) / 100).toString();

function refText(v) {
  const r = refOf(v); if (!r || !r.length) return '';
  const r0 = r[0], c = r0.cls ? (CLASS_ZH[r0.cls.cid] || r0.cls.cid.trim()) : '';
  if (r0.type === 'Clss') return c;
  if (r0.type === 'Enmr') return r0.value === 'Trgt' ? '当前' + c : ({ Frwr: '前一' + c, Bckw: '后一' + c, Frnt: '最上面的' + c, Back: '最下面的' + c, Frst: '当前' + c }[r0.value] || c + ' ' + r0.value);
  if (r0.type === 'prop') return ({ fsel: '选区', WrPt: '工作路径', FrgC: '前景色', BckC: '背景色' })[r0.key] || (c + ' ' + r0.key);
  if (r0.type === 'name') return `${c}“${r0.name}”`;
  if (r0.type === 'indx') return `${c} ${r0.index}`;
  if (r0.type === 'Idnt') return `${c} ID ${r0.id}`;
  return c;
}
export function valueText(v) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '开' : '关';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return `“${v}”`;
  if (Array.isArray(v)) return v.length <= 4 ? v.map(valueText).join('，') : `${v.length} 项`;
  if (v instanceof Uint8Array) return `${v.length} 字节数据`;
  if (v.__unit) return v.values ? v.values.length + ' 个值' : fmtNum(v.value) + (UNIT_ZH[v.__unit] ?? ' ' + v.__unit);
  if (v.__enumType) return ENUM_ZH[v.value] || String(v.value).trim();
  if (v.__reference) return refText(v);
  if (v.__rawItem) return v.__rawItem === 'alis' ? '文件' : '路径';
  if (v.__class !== undefined) return CLASS_ZH[v.__class] || v.__class;
  if (v.__classID !== undefined) return CLASS_ZH[v.__classID] || (v.__classID === 'null' ? (v.__name || '') : (v.__name || v.__classID).trim());
  return '';
}

export function descLines(desc, depth = 0, out = [], skipNull = true) {
  if (!desc) return out;
  for (const k of Object.keys(desc)) {
    if (k.startsWith('__') || (skipNull && depth === 0 && k === 'null')) continue;
    const v = desc[k], label = KEY_ZH[k] || k.trim();
    if (v && typeof v === 'object' && !Array.isArray(v) && v.__classID !== undefined && !v.__reference) {
      out.push({ depth, text: `${label}: ${valueText(v)}` });
      if (depth < 4) descLines(v, depth + 1, out, false);
    } else if (Array.isArray(v) && v.some(x => x && x.__classID !== undefined)) {
      out.push({ depth, text: `${label}: ${v.length} 项` });
      if (depth < 3) v.slice(0, 20).forEach(x => { if (x && x.__classID !== undefined) { out.push({ depth: depth + 1, text: valueText(x) }); descLines(x, depth + 2, out, false); } });
    } else out.push({ depth, text: `${label}: ${valueText(v)}` });
  }
  return out;
}

export function stepTitle(step) {
  const d = step.desc || {};
  if (step.event === 'psd_editorCommand') return (d.menu ? '菜单项目：' : '') + (d.label || d.cmd || '命令');
  if (step.event === 'psd_editorFilter') return '滤镜：' + (FILTER_ZH_FALLBACK(d.kind, d.kind) || '');
  if (step.event === 'psd_editorAdjust') return '调整：' + (ADJ_ZH[d.type] || d.type || '');
  const zh = EVENT_ZH[step.event] || step.name || String(step.event).trim();
  const tgt = d['null'] ? refText(Array.isArray(d['null']) ? d['null'][0] : d['null']) : '';
  if ((step.event === 'Lvls') && decodeFilter('Lvls', step.desc)) return d.Auto ? '色阶（自动色调）' : '色阶（自动对比度）';
  return tgt ? `${zh} ${tgt}` : zh;
}


export function supportedEvents() {
  const rows = [
    ['Mk  ', '建立 图层（新建图层，可带名称 / 不透明度 / 模式）'], ['Fl  ', '填充（前景 / 背景 / 颜色 / 黑白灰 / 内容识别，含模式、不透明度、保留透明）'],
    ['setd', '设置 当前图层（名称 / 不透明度 / 填充 / 混合模式）；设置 选区（全部 / 无 / 矩形 / 椭圆）；设置 工作路径（插入路径）'],
    ['Shw ', '显示 当前图层'], ['Hd  ', '隐藏 当前图层'], ['Dlt ', '删除 当前图层'], ['Dplc', '复制 当前图层'], ['slct', '选择 图层（按名称 / 前一 / 后一 / 最上 / 最下）'],
    ['Invs', '反选'], ['Fthr', '羽化'], ['Expn', '扩展'], ['Cntc', '收缩'], ['Brdr', '边界'], ['Smth', '平滑'],
    ['Mrg2', '向下合并'], ['MrgV', '合并可见图层'], ['FltI', '拼合图像'],
    ['ImgS', '图像大小（像素 / 百分比）'], ['CnvS', '画布大小（像素 / 百分比 / 相对，九宫格定位）'], ['Rtte', '旋转画布'], ['Flip', '翻转画布'],
    ['trim', '裁切'], ['RvlA', '显示全部'], ['Crop', '裁剪（矩形 / 按选区）'], ['Invr', '反相'], ['Dstt', '去色'], ['Eqlz', '色调均化'],
    ['AddT', '添加到选区（矩形 / 椭圆）'], ['SbtF', '从选区中减去（矩形 / 椭圆）'], ['IntW', '与选区交叉（矩形 / 椭圆）'],
    ['BrgC', '亮度/对比度'], ['Pstr', '色调分离'], ['Thrs', '阈值'],
    ['Trnf', '变换 当前图层（位移 / 缩放 / 旋转）'], ['move', '移动 当前图层'], ['save', '存储（PSD / PNG / JPEG；回放时下载）'], ['Stop', '停止（信息 + 允许继续）'],
  ];
  for (const [kind, [ev]] of Object.entries(FILTER_MAP)) if (ev !== 'Lvls') rows.push([ev, EVENT_ZH[ev] + '（滤镜）']);
  rows.push(['Lvls', '色阶：仅「自动色调 / 自动对比度」两种自动形式']);
  rows.push(['setd', '设置 前景色 / 背景色（RGB）']);
  rows.push(['psd_editorAdjust', '本编辑器的其它图像调整（色阶 / 曲线 / 色相饱和度…，带全部参数；PS 回放不了）']);
  rows.push(['psd_editorFilter', '本编辑器的其它滤镜（带全部参数；PS 回放不了）']);
  rows.push(['psd_editorCommand', '本编辑器的菜单命令 + 对话框参数（「插入菜单项目」与其它无 PS 对应事件的操作；PS 回放不了）']);
  return rows;
}
export const FILTER_EVENT_MAP = FILTER_MAP;





const px1 = d => { const n = parseFloat(d && d[0]); return Number.isFinite(n) ? n : 0; };
export const COMMAND_OPS = {
  'select.all': ['selectAll'], 'select.none': ['deselect'], 'select.inverse': ['invertSel'],
  'select.feather': ['feather', d => ({ radius: px1(d) })], 'select.modify.expand': ['expand', d => ({ by: px1(d) })],
  'select.modify.contract': ['contract', d => ({ by: px1(d) })], 'select.modify.border': ['border', d => ({ width: px1(d) })],
  'select.modify.smooth': ['smooth', d => ({ radius: px1(d) })],
  'layer.delete': ['deleteLayer'], 'layer.duplicate': ['duplicateLayer'], 'layer.merge': ['mergeDown'], 'layer.mergeVisible': ['mergeVisible'], 'layer.flatten': ['flatten'],
  'image.rotate90cw': ['rotateCanvas', () => ({ angle: 90 })], 'image.rotate90ccw': ['rotateCanvas', () => ({ angle: -90 })],
  'image.rotate180': ['rotateCanvas', () => ({ angle: 180 })],
  'image.flipH': ['flipCanvas', () => ({ axis: 'h' })], 'image.flipV': ['flipCanvas', () => ({ axis: 'v' })],
  'image.revealAll': ['revealAll'], 'image.adjust.equalize': ['equalize'],
};

export function commandToOp(id, dialogs = []) {
  const m = COMMAND_OPS[id]; if (!m) return null;
  if (dialogs.some(v => v == null || v === false)) return { cancelled: true };   
  return { op: m[0], p: m[1] ? m[1](dialogs) : {} };
}

export function opToCommand(op, p = {}) {
  switch (op) {
    case 'selectAll': return { id: 'select.all', answers: [] };
    case 'deselect': return { id: 'select.none', answers: [] };
    case 'invertSel': return { id: 'select.inverse', answers: [] };
    case 'feather': return { id: 'select.feather', answers: [String(p.radius)] };
    case 'expand': return { id: 'select.modify.expand', answers: [String(p.by)] };
    case 'contract': return { id: 'select.modify.contract', answers: [String(p.by)] };
    case 'border': return { id: 'select.modify.border', answers: [String(p.width)] };
    case 'smooth': return { id: 'select.modify.smooth', answers: [String(p.radius)] };
    case 'deleteLayer': return { id: 'layer.delete', answers: [] };
    case 'mergeDown': return { id: 'layer.merge', answers: [] };
    case 'mergeVisible': return { id: 'layer.mergeVisible', answers: [] };
    case 'flatten': return { id: 'layer.flatten', answers: [] };
    case 'flipCanvas': return { id: p.axis === 'v' ? 'image.flipV' : 'image.flipH', answers: [] };
    case 'revealAll': return { id: 'image.revealAll', answers: [] };
    case 'equalize': return { id: 'image.adjust.equalize', answers: [] };
    case 'rotateCanvas': {
      const a = ((Math.round(p.angle) % 360) + 360) % 360;
      if (a === 90) return { id: 'image.rotate90cw', answers: [] };
      if (a === 270) return { id: 'image.rotate90ccw', answers: [] };
      if (a === 180) return { id: 'image.rotate180', answers: [] };
      return null;
    }
    case 'command': return { id: p.cmd, answers: p.dialogs || [] };
  }
  return null;
}
