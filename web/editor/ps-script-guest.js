
















export const GUEST = String.raw`
(function (G) {
'use strict';
var H = G.__host, MODE = G.__mode, TERMS = JSON.parse(G.__terms);
delete G.__host; delete G.__mode; delete G.__terms;

/* ============================ 宿主调用 ============================ */
function PSError(msg, code) { var e = new Error(msg); e.name = 'PSError'; if (code) e.number = code; return e; }
function unwrap(s) { var r = s ? JSON.parse(s) : null; if (r && r.__err) throw PSError(r.__err, r.code); return r; }
var cache = null, gen = 0;
function invalidate() { cache = null; gen++; }
function hget(n, a) { return unwrap(H.get(n, JSON.stringify(a || {}))); }
function hdo(n, a) { var r; try { r = unwrap(H.doS(n, JSON.stringify(a || {}))); } finally { invalidate(); } return r; }
function hdoP(n, a) { return H.doP(n, JSON.stringify(a || {})).then(function (s) { invalidate(); return unwrap(s); }, function (e) { invalidate(); throw e; }); }
/* UXP 的同步属性赋值：排队交给宿主，图层属性先在本地缓存上改好（后面的读能读到新值）；队列没清空时不缓存图层表 */
var LAYER_KEYS = ['name', 'visible', 'opacity', 'fillOpacity', 'blend'];
function hmut(n, a) {
  if (MODE !== 'uxp') return hdo(n, a);
  H.doQ(n, JSON.stringify(a || {}));
  if (n === 'setLayer' && cache && cache.doc && cache.doc.layers[a.i]) { var L = cache.doc.layers[a.i]; LAYER_KEYS.forEach(function (k) { if (a[k] !== undefined) L[k] = a[k]; }); }
  else invalidate();
  return {};
}
function info() { if (cache) return cache; var I = hget('info'); if (!I.pending) cache = I; return I; }
function needDoc() { var d = info().doc; if (!d) throw PSError('没有打开的文档', 8007); return d; }

/* ============================ 术语 / typeID ============================ */
var C2S = {}, S2C = {}, DYN = {}, DYNR = {}, nextDyn = 0x7F000000;
TERMS.forEach(function (p) { if (!(p[0] in C2S)) C2S[p[0]] = p[1]; if (!(p[1] in S2C)) S2C[p[1]] = p[0]; });
C2S.Rslt = 'resolution'; C2S.Intr = 'interpolation'; S2C.resolution = 'Rslt'; S2C.result = 'Rslt'; S2C.interpolation = 'Intr';
function charIDToTypeID(c) { c = String(c); if (c.length !== 4) throw PSError('charIDToTypeID 要 4 个字符："' + c + '"'); return ((c.charCodeAt(0) << 24) | (c.charCodeAt(1) << 16) | (c.charCodeAt(2) << 8) | c.charCodeAt(3)) >>> 0; }
function stringIDToTypeID(s) { s = String(s); if (S2C[s]) return charIDToTypeID(S2C[s]); if (!(s in DYN)) { DYN[s] = nextDyn; DYNR[nextDyn] = s; nextDyn++; } return DYN[s]; }
function keyOf(id) { id = id >>> 0; if (id in DYNR) return DYNR[id]; return String.fromCharCode((id >>> 24) & 255, (id >>> 16) & 255, (id >>> 8) & 255, id & 255); }
function typeIDToCharID(id) { return (id >>> 0) in DYNR ? '' : keyOf(id); }
function typeIDToStringID(id) { var k = keyOf(id); return (k.length === 4 && C2S[k]) || ((id >>> 0) in DYNR ? k : ''); }
var keyOfStr = function (s) { return S2C[s] || s; };
var strOfKey = function (k) { return (k.length === 4 && C2S[k]) || k; };
G.charIDToTypeID = charIDToTypeID; G.stringIDToTypeID = stringIDToTypeID; G.typeIDToCharID = typeIDToCharID; G.typeIDToStringID = typeIDToStringID;
G.cTID = charIDToTypeID; G.sTID = stringIDToTypeID;

/* ============================ 描述符 ============================ */
var DescValueType = { ALIASTYPE: 'DescValueType.ALIASTYPE', BOOLEANTYPE: 'DescValueType.BOOLEANTYPE', CLASSTYPE: 'DescValueType.CLASSTYPE', DOUBLETYPE: 'DescValueType.DOUBLETYPE',
  ENUMERATEDTYPE: 'DescValueType.ENUMERATEDTYPE', INTEGERTYPE: 'DescValueType.INTEGERTYPE', LARGEINTEGERTYPE: 'DescValueType.LARGEINTEGERTYPE', LISTTYPE: 'DescValueType.LISTTYPE',
  OBJECTTYPE: 'DescValueType.OBJECTTYPE', RAWTYPE: 'DescValueType.RAWTYPE', REFERENCETYPE: 'DescValueType.REFERENCETYPE', STRINGTYPE: 'DescValueType.STRINGTYPE', UNITDOUBLE: 'DescValueType.UNITDOUBLE' };
var TAG2DVT = { b: 'BOOLEANTYPE', c: 'CLASSTYPE', d: 'DOUBLETYPE', e: 'ENUMERATEDTYPE', i: 'INTEGERTYPE', I: 'LARGEINTEGERTYPE', l: 'LISTTYPE', o: 'OBJECTTYPE', r: 'REFERENCETYPE', s: 'STRINGTYPE', u: 'UNITDOUBLE', p: 'ALIASTYPE', w: 'RAWTYPE' };
var ReferenceFormType = { CLASSTYPE: 'ReferenceFormType.CLASSTYPE', ENUMERATED: 'ReferenceFormType.ENUMERATED', IDENTIFIER: 'ReferenceFormType.IDENTIFIER', INDEX: 'ReferenceFormType.INDEX',
  NAME: 'ReferenceFormType.NAME', OFFSET: 'ReferenceFormType.OFFSET', PROPERTY: 'ReferenceFormType.PROPERTY' };
var DialogModes = { ALL: 'DialogModes.ALL', ERROR: 'DialogModes.ERROR', NO: 'DialogModes.NO' };

/* 值：{ t: 类型标记, v: 值, u?: 单位/枚举类型 }。键一律存「本项目描述符键」（有 charID 用 charID） */
function Store() { this._k = []; this._m = {}; }
Store.prototype._put = function (k, t, v, u) { if (!(k in this._m)) this._k.push(k); this._m[k] = { t: t, v: v, u: u }; };
Store.prototype._get = function (k, t) { var e = this._m[k]; if (!e) throw PSError('描述符里没有键 ' + strOfKey(k), 8500); if (t && t.indexOf(e.t) < 0) throw PSError('键 ' + strOfKey(k) + ' 的类型是 ' + DescValueType[TAG2DVT[e.t]], 8500); return e; };

function ActionDescriptor() { Store.call(this); this.typename = 'ActionDescriptor'; }
ActionDescriptor.prototype = Object.create(Store.prototype);
var AD = ActionDescriptor.prototype;
Object.defineProperty(AD, 'count', { get: function () { return this._k.length; } });
AD.putInteger = function (k, v) { this._put(keyOf(k), 'i', Math.round(+v)); };
AD.putLargeInteger = function (k, v) { this._put(keyOf(k), 'I', Math.round(+v)); };
AD.putDouble = function (k, v) { this._put(keyOf(k), 'd', +v); };
AD.putUnitDouble = function (k, u, v) { this._put(keyOf(k), 'u', +v, keyOf(u)); };
AD.putString = function (k, v) { this._put(keyOf(k), 's', String(v)); };
AD.putBoolean = function (k, v) { this._put(keyOf(k), 'b', !!v); };
AD.putEnumerated = function (k, t, v) { this._put(keyOf(k), 'e', keyOf(v), keyOf(t)); };
AD.putObject = function (k, c, d) { this._put(keyOf(k), 'o', d, keyOf(c)); };
AD.putList = function (k, l) { this._put(keyOf(k), 'l', l); };
AD.putReference = function (k, r) { this._put(keyOf(k), 'r', r); };
AD.putClass = function (k, c) { this._put(keyOf(k), 'c', keyOf(c)); };
AD.putPath = function (k, f) { this._put(keyOf(k), 'p', f); };
AD.putData = function (k, s) { this._put(keyOf(k), 'w', String(s)); };
AD.getInteger = function (k) { return this._get(keyOf(k), 'iI').v; };
AD.getLargeInteger = AD.getInteger;
AD.getDouble = function (k) { return +this._get(keyOf(k), 'dui').v; };
AD.getUnitDoubleValue = function (k) { return +this._get(keyOf(k), 'ud').v; };
AD.getUnitDoubleType = function (k) { return charIDToTypeID4(this._get(keyOf(k), 'u').u); };
AD.getString = function (k) { return this._get(keyOf(k), 's').v; };
AD.getBoolean = function (k) { return this._get(keyOf(k), 'b').v; };
AD.getEnumerationValue = function (k) { return idOfKey(this._get(keyOf(k), 'e').v); };
AD.getEnumerationType = function (k) { return idOfKey(this._get(keyOf(k), 'e').u); };
AD.getObjectValue = function (k) { return this._get(keyOf(k), 'o').v; };
AD.getObjectType = function (k) { return idOfKey(this._get(keyOf(k), 'o').u); };
AD.getList = function (k) { return this._get(keyOf(k), 'l').v; };
AD.getReference = function (k) { return this._get(keyOf(k), 'r').v; };
AD.getClass = function (k) { return idOfKey(this._get(keyOf(k), 'c').v); };
AD.getPath = function (k) { return this._get(keyOf(k), 'p').v; };
AD.getData = function (k) { return this._get(keyOf(k), 'w').v; };
AD.getType = function (k) { return DescValueType[TAG2DVT[this._get(keyOf(k)).t]]; };
AD.hasKey = function (k) { return keyOf(k) in this._m; };
AD.getKey = function (i) { if (i < 0 || i >= this._k.length) throw PSError('getKey 越界', 8500); return idOfKey(this._k[i]); };
AD.erase = function (k) { k = keyOf(k); if (k in this._m) { delete this._m[k]; this._k.splice(this._k.indexOf(k), 1); } };
AD.clear = function () { this._k = []; this._m = {}; };
AD.isEqual = function (o) { return JSON.stringify(descToJ(this)) === JSON.stringify(descToJ(o)); };
AD.toStream = function () { return JSON.stringify(descToJ(this)); };
AD.fromStream = function (s) { var d = descFromJ(JSON.parse(s)); this._k = d._k; this._m = d._m; };
AD.toSource = AD.toStream;
function idOfKey(k) { return k.length === 4 ? charIDToTypeID(k) : stringIDToTypeID(k); }
function charIDToTypeID4(k) { return idOfKey(k); }

function ActionList() { Store.call(this); this.typename = 'ActionList'; this._a = []; }
var AL = ActionList.prototype;
Object.defineProperty(AL, 'count', { get: function () { return this._a.length; } });
function lput(t) { return function (a, b, c) { var e; if (t === 'u') e = { t: 'u', v: +b, u: keyOf(a) }; else if (t === 'e') e = { t: 'e', v: keyOf(b), u: keyOf(a) }; else if (t === 'o') e = { t: 'o', v: b, u: keyOf(a) };
  else if (t === 'c') e = { t: 'c', v: keyOf(a) }; else if (t === 'i' || t === 'I') e = { t: t, v: Math.round(+a) }; else if (t === 'd') e = { t: 'd', v: +a }; else if (t === 's') e = { t: 's', v: String(a) };
  else if (t === 'b') e = { t: 'b', v: !!a }; else e = { t: t, v: a }; this._a.push(e); }; }
AL.putInteger = lput('i'); AL.putLargeInteger = lput('I'); AL.putDouble = lput('d'); AL.putUnitDouble = lput('u'); AL.putString = lput('s'); AL.putBoolean = lput('b');
AL.putEnumerated = lput('e'); AL.putObject = lput('o'); AL.putList = lput('l'); AL.putReference = lput('r'); AL.putClass = lput('c'); AL.putPath = lput('p'); AL.putData = lput('w');
function lget(t, f) { return function (i) { var e = this._a[i]; if (!e) throw PSError('列表下标越界：' + i, 8500); if (t && t.indexOf(e.t) < 0) throw PSError('列表第 ' + i + ' 项类型不符', 8500); return f(e); }; }
AL.getInteger = lget('iI', function (e) { return e.v; }); AL.getLargeInteger = AL.getInteger; AL.getDouble = lget('dui', function (e) { return +e.v; });
AL.getUnitDoubleValue = lget('ud', function (e) { return +e.v; }); AL.getUnitDoubleType = lget('u', function (e) { return idOfKey(e.u); });
AL.getString = lget('s', function (e) { return e.v; }); AL.getBoolean = lget('b', function (e) { return e.v; });
AL.getEnumerationValue = lget('e', function (e) { return idOfKey(e.v); }); AL.getEnumerationType = lget('e', function (e) { return idOfKey(e.u); });
AL.getObjectValue = lget('o', function (e) { return e.v; }); AL.getObjectType = lget('o', function (e) { return idOfKey(e.u); });
AL.getList = lget('l', function (e) { return e.v; }); AL.getReference = lget('r', function (e) { return e.v; }); AL.getClass = lget('c', function (e) { return idOfKey(e.v); });
AL.getPath = lget('p', function (e) { return e.v; }); AL.getData = lget('w', function (e) { return e.v; });
AL.getType = function (i) { var e = this._a[i]; if (!e) throw PSError('列表下标越界：' + i, 8500); return DescValueType[TAG2DVT[e.t]]; };
AL.clear = function () { this._a = []; };

function ActionReference() { this.typename = 'ActionReference'; this._r = []; }
var AR = ActionReference.prototype;
AR.putEnumerated = function (c, t, v) { this._r.push({ type: 'Enmr', cls: keyOf(c), enumType: keyOf(t), value: keyOf(v) }); };
AR.putName = function (c, n) { this._r.push({ type: 'name', cls: keyOf(c), name: String(n) }); };
AR.putIndex = function (c, i) { this._r.push({ type: 'indx', cls: keyOf(c), index: Math.round(+i) }); };
AR.putIdentifier = function (c, i) { this._r.push({ type: 'Idnt', cls: keyOf(c), id: Math.round(+i) }); };
AR.putOffset = function (c, o) { this._r.push({ type: 'rele', cls: keyOf(c), offset: Math.round(+o) }); };
AR.putProperty = function (c, k) { this._r.push({ type: 'prop', cls: keyOf(c), key: keyOf(k) }); };
AR.putClass = function (c) { this._r.push({ type: 'Clss', cls: keyOf(c) }); };
var FORM = { Enmr: 'ENUMERATED', name: 'NAME', indx: 'INDEX', Idnt: 'IDENTIFIER', rele: 'OFFSET', prop: 'PROPERTY', Clss: 'CLASSTYPE' };
function r0(r) { if (!r._r.length) throw PSError('空引用', 8500); return r._r[0]; }
AR.getForm = function () { return ReferenceFormType[FORM[r0(this).type]]; };
AR.getDesiredClass = function () { return idOfKey(r0(this).cls); };
AR.getName = function () { return r0(this).name; };
AR.getIndex = function () { return r0(this).index; };
AR.getIdentifier = function () { return r0(this).id; };
AR.getOffset = function () { return r0(this).offset; };
AR.getProperty = function () { return idOfKey(r0(this).key); };
AR.getEnumeratedType = function () { return idOfKey(r0(this).enumType); };
AR.getEnumeratedValue = function () { return idOfKey(r0(this).value); };
AR.getContainer = function () { var n = new ActionReference(); n._r = this._r.slice(1); return n; };
G.ActionDescriptor = ActionDescriptor; G.ActionList = ActionList; G.ActionReference = ActionReference;
G.DescValueType = DescValueType; G.ReferenceFormType = ReferenceFormType; G.DialogModes = DialogModes;

/* ---- 沙箱描述符 ⇄ 宿主 JSON（core/action-events.js 的写法：__classID / __unit / __enumType / __reference / __long / __doub） ---- */
function valToJ(e, host, key) {
  switch (e.t) {
    case 'i': case 'I': (host.__long || (host.__long = {}))[key] = true; return e.v;
    case 'd': (host.__doub || (host.__doub = {}))[key] = true; return e.v;
    case 'u': return { __unit: e.u, value: e.v };
    case 'e': return { __enumType: e.u, value: e.v };
    case 'o': { var o = descToJ(e.v); o.__classID = e.u; return o; }
    case 'l': return listToJ(e.v);
    case 'r': return refToJ(e.v);
    case 'c': return { __class: e.v, __name: '' };
    case 'p': return { __path: e.v && (e.v.fsName || e.v.fullName || String(e.v)), __fileId: e.v && e.v._id };
    default: return e.v;
  }
}
function descToJ(d) { var o = { __name: '', __classID: 'null' }; for (var i = 0; i < d._k.length; i++) { var k = d._k[i]; o[k] = valToJ(d._m[k], o, k); } return o; }
function listToJ(l) { var a = []; for (var i = 0; i < l._a.length; i++) a.push(valToJ(l._a[i], a, i)); return a; }
function refToJ(r) { return { __reference: r._r.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.cls = { name: '', cid: x.cls || 'null' }; return o; }) }; }
function valFromJ(v) {
  if (v === null || v === undefined) return { t: 's', v: '' };
  if (typeof v === 'boolean') return { t: 'b', v: v };
  if (typeof v === 'string') return { t: 's', v: v };
  if (typeof v === 'number') return { t: Number.isInteger(v) ? 'i' : 'd', v: v };
  if (Array.isArray(v)) { var l = new ActionList(); v.forEach(function (x) { l._a.push(valFromJ(x)); }); return { t: 'l', v: l }; }
  if (v.__unit) return { t: 'u', v: +v.value, u: v.__unit };
  if (v.__enumType) return { t: 'e', v: v.value, u: v.__enumType };
  if (v.__class !== undefined) return { t: 'c', v: v.__class };
  if (v.__reference) { var r = new ActionReference(); r._r = v.__reference.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; o.cls = x.cls && x.cls.cid; return o; }); return { t: 'r', v: r }; }
  return { t: 'o', v: descFromJ(v), u: v.__classID || 'null' };
}
function descFromJ(o) {
  var d = new ActionDescriptor(); if (!o) return d;
  for (var k in o) { if (k.slice(0, 2) === '__') continue; var e = valFromJ(o[k]); if (e.t === 'd' && o.__long && o.__long[k]) e.t = 'i'; if (e.t === 'i' && o.__doub && o.__doub[k]) e.t = 'd'; d._put(k, e.t, e.v, e.u); }
  return d;
}

/* ============================ 单位 ============================ */
var UNITS = { px: 'px', pixels: 'px', pixel: 'px', pt: 'pt', points: 'pt', point: 'pt', 'in': 'in', inch: 'in', inches: 'in', cm: 'cm', mm: 'mm', pc: 'pc', picas: 'pc', '%': '%', percent: '%', deg: 'deg', '': 'px' };
function normUnit(u) { u = String(u || '').toLowerCase().replace(/^units\./, ''); return UNITS[u] || u; }
function res() { var d = info().doc; return (d && d.resolution) || 72; }
function toInches(v, u) { switch (u) { case 'px': return v / res(); case 'pt': return v / 72; case 'in': return v; case 'cm': return v / 2.54; case 'mm': return v / 25.4; case 'pc': return v / 6; default: return NaN; } }
function fromInches(v, u) { switch (u) { case 'px': return v * res(); case 'pt': return v * 72; case 'in': return v; case 'cm': return v * 2.54; case 'mm': return v * 25.4; case 'pc': return v * 6; default: return NaN; } }
function UnitValue(v, u) {
  if (!(this instanceof UnitValue)) return new UnitValue(v, u);
  if (v instanceof UnitValue) { u = v.type; v = v.value; }
  if (typeof v === 'string') { var m = /^\s*(-?[\d.]+)\s*([a-z%]*)/i.exec(v); if (m) { v = +m[1]; u = u || m[2]; } }
  this.value = +v; this.type = normUnit(u || 'px'); this.typename = 'UnitValue';
}
UnitValue.prototype.as = function (u) { u = normUnit(u); if (u === this.type) return this.value; if (this.type === '%' || u === '%') return NaN; return fromInches(toInches(this.value, this.type), u); };
UnitValue.prototype.convert = function (u) { var v = this.as(u); if (isNaN(v)) return false; this.value = v; this.type = normUnit(u); return true; };
UnitValue.prototype.valueOf = function () { return this.value; };
UnitValue.prototype.toString = function () { return this.value + ' ' + this.type; };
G.UnitValue = UnitValue;
var Units = { PIXELS: 'px', INCHES: 'in', CM: 'cm', MM: 'mm', POINTS: 'pt', PICAS: 'pc', PERCENT: '%' };
var TypeUnits = { PIXELS: 'px', POINTS: 'pt', MM: 'mm' };
var prefs = { rulerUnits: Units.PIXELS, typeUnits: TypeUnits.POINTS };
function rul(v) { return new UnitValue(fromInches(toInches(v, 'px'), prefs.rulerUnits === '%' ? 'px' : prefs.rulerUnits), prefs.rulerUnits === '%' ? 'px' : prefs.rulerUnits); }
/** 长度参数 → 像素：UnitValue 按自己的单位，裸数字按当前标尺单位；百分比相对 ref（文档宽 / 高） */
function px(v, ref) {
  if (v === undefined || v === null) return undefined;
  if (v instanceof UnitValue) { if (v.type === '%') return (ref || 0) * v.value / 100; return v.as('px'); }
  var n = +v; if (prefs.rulerUnits === '%') return (ref || 0) * n / 100;
  return fromInches(toInches(n, prefs.rulerUnits), 'px');
}
function ptOf(v) { if (v instanceof UnitValue) return v.as('pt'); return prefs.typeUnits === 'px' ? +v * 72 / res() : prefs.typeUnits === 'mm' ? +v / 25.4 * 72 : +v; }

/* ============================ 枚举 ============================ */
function E(name, keys) { var o = {}; keys.split(' ').forEach(function (k) { o[k] = name + '.' + k; }); return o; }
var BLEND = { NORMAL: 'norm', DISSOLVE: 'diss', DARKEN: 'dark', MULTIPLY: 'mul ', COLORBURN: 'idiv', LINEARBURN: 'lbrn', DARKERCOLOR: 'dkCl', LIGHTEN: 'lite', SCREEN: 'scrn',
  COLORDODGE: 'div ', LINEARDODGE: 'lddg', LIGHTERCOLOR: 'lgCl', OVERLAY: 'over', SOFTLIGHT: 'sLit', HARDLIGHT: 'hLit', VIVIDLIGHT: 'vLit', LINEARLIGHT: 'lLit', PINLIGHT: 'pLit',
  HARDMIX: 'hMix', DIFFERENCE: 'diff', EXCLUSION: 'smud', SUBTRACT: 'fsub', DIVIDE: 'fdiv', HUE: 'hue ', SATURATION: 'sat ', COLORBLEND: 'colr', LUMINOSITY: 'lum ', PASSTHROUGH: 'pass' };
var BlendMode = {}, BLEND_REV = {};
for (var bk in BLEND) { BlendMode[bk] = 'BlendMode.' + bk; BLEND_REV[BLEND[bk]] = 'BlendMode.' + bk; }
var blendKeyOf = function (m) { var k = String(m).replace(/^BlendMode\./, ''); if (!(k in BLEND)) throw PSError('不认识的混合模式：' + m); return BLEND[k]; };
var LayerKind = E('LayerKind', 'NORMAL TEXT SMARTOBJECT SOLIDFILL GRADIENTFILL PATTERNFILL LEVELS CURVES COLORBALANCE BRIGHTNESSCONTRAST HUESATURATION SELECTIVECOLOR CHANNELMIXER GRADIENTMAP INVERSION THRESHOLD POSTERIZE PHOTOFILTER BLACKANDWHITE VIBRANCE EXPOSURE COLORLOOKUP LAYER3D VIDEO');
var ElementPlacement = E('ElementPlacement', 'PLACEATBEGINNING PLACEATEND PLACEBEFORE PLACEAFTER INSIDE');
var AnchorPosition = E('AnchorPosition', 'TOPLEFT TOPCENTER TOPRIGHT MIDDLELEFT MIDDLECENTER MIDDLERIGHT BOTTOMLEFT BOTTOMCENTER BOTTOMRIGHT');
var ResampleMethod = E('ResampleMethod', 'NONE NEARESTNEIGHBOR BILINEAR BICUBIC BICUBICSHARPER BICUBICSMOOTHER BICUBICAUTOMATIC AUTOMATIC PRESERVEDETAILS');
var SaveOptions = E('SaveOptions', 'DONOTSAVECHANGES PROMPTTOSAVECHANGES SAVECHANGES');
var DocumentFill = E('DocumentFill', 'WHITE BACKGROUNDCOLOR TRANSPARENT');
var NewDocumentMode = E('NewDocumentMode', 'BITMAP GRAYSCALE RGB CMYK LAB');
var DocumentMode = E('DocumentMode', 'BITMAP GRAYSCALE INDEXEDCOLOR RGB CMYK LAB MULTICHANNEL DUOTONE');
var BitsPerChannelType = E('BitsPerChannelType', 'ONE EIGHT SIXTEEN THIRTYTWO');
var Direction = E('Direction', 'HORIZONTAL VERTICAL');
var SelectionType = E('SelectionType', 'REPLACE EXTEND DIMINISH INTERSECT');
var ColorBlendMode = {}; for (var ck in BLEND) ColorBlendMode[ck] = 'ColorBlendMode.' + ck; ColorBlendMode.CLEAR = 'ColorBlendMode.CLEAR'; ColorBlendMode.BEHIND = 'ColorBlendMode.BEHIND';
var TrimType = E('TrimType', 'TRANSPARENT TOPLEFT BOTTOMRIGHT');
var ExportType = E('ExportType', 'SAVEFORWEB ILLUSTRATORPATHS');
var SaveDocumentType = E('SaveDocumentType', 'PHOTOSHOP JPEG PNG COMPUSERVEGIF BMP TIFF PDF TARGA PIXAR PORTABLEBITMAP SGIRGB');
var Extension = E('Extension', 'LOWERCASE UPPERCASE NONE');
var NoiseDistribution = E('NoiseDistribution', 'UNIFORM GAUSSIAN');
var Justification = E('Justification', 'LEFT CENTER RIGHT LEFTJUSTIFIED CENTERJUSTIFIED RIGHTJUSTIFIED FULLYJUSTIFIED');
var TextType = E('TextType', 'POINTTEXT PARAGRAPHTEXT');
var ColorModel = E('ColorModel', 'RGB HSB CMYK LAB GRAYSCALE NONE');
var LayerCompressionType = E('LayerCompressionType', 'RLE ZIP');
var FormatOptions = E('FormatOptions', 'STANDARDBASELINE OPTIMIZEDBASELINE PROGRESSIVE');
var MatteType = E('MatteType', 'NONE FOREGROUND BACKGROUND WHITE BLACK SEMIGRAY NETSCAPE');
var Intent = E('Intent', 'PERCEPTUAL SATURATION RELATIVECOLORIMETRIC ABSOLUTECOLORIMETRIC');
var PurgeTarget = E('PurgeTarget', 'ALLCACHES CLIPBOARDCACHE HISTORYCACHES UNDOCACHES');
[['BlendMode', BlendMode], ['LayerKind', LayerKind], ['ElementPlacement', ElementPlacement], ['AnchorPosition', AnchorPosition], ['ResampleMethod', ResampleMethod], ['SaveOptions', SaveOptions],
 ['DocumentFill', DocumentFill], ['NewDocumentMode', NewDocumentMode], ['DocumentMode', DocumentMode], ['BitsPerChannelType', BitsPerChannelType], ['Direction', Direction], ['SelectionType', SelectionType],
 ['ColorBlendMode', ColorBlendMode], ['TrimType', TrimType], ['ExportType', ExportType], ['SaveDocumentType', SaveDocumentType], ['Extension', Extension], ['NoiseDistribution', NoiseDistribution],
 ['Justification', Justification], ['TextType', TextType], ['ColorModel', ColorModel], ['LayerCompressionType', LayerCompressionType], ['FormatOptions', FormatOptions], ['MatteType', MatteType],
 ['Intent', Intent], ['PurgeTarget', PurgeTarget], ['Units', Units], ['TypeUnits', TypeUnits]].forEach(function (p) { G[p[0]] = p[1]; });
var KIND_MAP = { pixel: 'NORMAL', text: 'TEXT', smartObject: 'SMARTOBJECT', solidFill: 'SOLIDFILL', gradientFill: 'GRADIENTFILL', patternFill: 'PATTERNFILL', shape: 'SOLIDFILL',
  levels: 'LEVELS', curves: 'CURVES', colorBalance: 'COLORBALANCE', brightnessContrast: 'BRIGHTNESSCONTRAST', hueSaturation: 'HUESATURATION', selectiveColor: 'SELECTIVECOLOR',
  channelMixer: 'CHANNELMIXER', gradientMap: 'GRADIENTMAP', invert: 'INVERSION', threshold: 'THRESHOLD', posterize: 'POSTERIZE', photoFilter: 'PHOTOFILTER', blackWhite: 'BLACKANDWHITE',
  vibrance: 'VIBRANCE', exposure: 'EXPOSURE', colorLookup: 'COLORLOOKUP' };

/* ============================ 颜色 ============================ */
function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }
function RGBColor() { this.red = 0; this.green = 0; this.blue = 0; this.typename = 'RGBColor'; }
Object.defineProperty(RGBColor.prototype, 'hexValue', { get: function () { return hex2(this.red) + hex2(this.green) + hex2(this.blue); },
  set: function (h) { h = String(h).replace(/^#/, ''); var n = parseInt(h, 16); this.red = (n >> 16) & 255; this.green = (n >> 8) & 255; this.blue = n & 255; } });
function rgbToHsb(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; return { hue: h, saturation: Math.round(mx ? d / mx * 100 : 0), brightness: Math.round(mx * 100) }; }
function SolidColor() { this.rgb = new RGBColor(); this.typename = 'SolidColor'; this.model = ColorModel.RGB; }
Object.defineProperty(SolidColor.prototype, 'hsb', { get: function () { var self = this, o = rgbToHsb(this.rgb.red, this.rgb.green, this.rgb.blue);
  return { get hue() { return o.hue; }, get saturation() { return o.saturation; }, get brightness() { return o.brightness; },
    set hue(v) { o.hue = v; self._fromHsb(o); }, set saturation(v) { o.saturation = v; self._fromHsb(o); }, set brightness(v) { o.brightness = v; self._fromHsb(o); } }; } });
SolidColor.prototype._fromHsb = function (o) { var h = (o.hue % 360) / 60, s = o.saturation / 100, v = o.brightness / 100, c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; } else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  this.rgb.red = Math.round((r + m) * 255); this.rgb.green = Math.round((g + m) * 255); this.rgb.blue = Math.round((b + m) * 255); };
Object.defineProperty(SolidColor.prototype, 'gray', { get: function () { return { gray: Math.round((1 - (this.rgb.red * 0.299 + this.rgb.green * 0.587 + this.rgb.blue * 0.114) / 255) * 100) }; } });
SolidColor.prototype.isEqual = function (o) { return o && o.rgb && o.rgb.hexValue === this.rgb.hexValue; };
function colorOf(rgb) { var c = new SolidColor(); c.rgb.red = rgb[0]; c.rgb.green = rgb[1]; c.rgb.blue = rgb[2]; return c; }
function rgbArr(c) { if (!c) return [0, 0, 0]; if (Array.isArray(c)) return c; var r = c.rgb || c; return [Math.round(+r.red || 0), Math.round(+r.green || 0), Math.round(+r.blue || 0)]; }
G.SolidColor = SolidColor; G.RGBColor = RGBColor;

/* ============================ 文件 ============================ */
/* 浏览器里没有文件系统：File 只认「用户在对话框里选过的文件」（openDialog）和「要写出去的文件」（写完 close 时下载）。 */
function File(p) {
  if (!(this instanceof File)) return new File(p);
  if (p && p.typename === 'File') p = p.fsName;
  p = String(p === undefined ? '' : p).replace(/\\/g, '/'); this._p = p; this.typename = 'File';
  this.encoding = 'UTF-8'; this.lineFeed = 'Unix'; this.error = ''; this._buf = null; this._pos = 0; this._mode = ''; this._id = null;
}
Object.defineProperty(File.prototype, 'name', { get: function () { return decodeURI(this._p.split('/').pop() || ''); } });
Object.defineProperty(File.prototype, 'displayName', { get: function () { return this.name; } });
Object.defineProperty(File.prototype, 'fsName', { get: function () { return this._p; } });
Object.defineProperty(File.prototype, 'fullName', { get: function () { return this._p; } });
Object.defineProperty(File.prototype, 'absoluteURI', { get: function () { return this._p; } });
Object.defineProperty(File.prototype, 'path', { get: function () { var a = this._p.split('/'); a.pop(); return a.join('/'); } });
Object.defineProperty(File.prototype, 'parent', { get: function () { return new Folder(this.path); } });
Object.defineProperty(File.prototype, 'exists', { get: function () { return this._id !== null || !!hget('fileExists', { path: this._p }).exists; } });
Object.defineProperty(File.prototype, 'length', { get: function () { return this._id !== null ? hget('fileInfo', { id: this._id }).size : 0; } });
File.prototype.toString = function () { return this._p; };
File.prototype.open = function (mode) { this._mode = String(mode || 'r').charAt(0); this._pos = 0;
  if (this._mode === 'r' || this._mode === 'e') { if (this._id === null) { var f = hget('fileExists', { path: this._p }); if (!f.exists) { this.error = '文件不存在（浏览器里只能读你在对话框里选的文件）'; return false; } this._id = f.id; }
    this._buf = hdoText(this._id); } else if (this._mode === 'w') this._buf = ''; else if (this._mode === 'a') this._buf = this._buf || ''; return true; };
function hdoText(id) { return hget('readText', { id: id }).text; }
File.prototype.read = function (n) { var s = this._buf || ''; var r = n === undefined ? s.slice(this._pos) : s.slice(this._pos, this._pos + n); this._pos += r.length; return r; };
File.prototype.readln = function () { var s = this._buf || '', i = s.indexOf('\n', this._pos); var r = i < 0 ? s.slice(this._pos) : s.slice(this._pos, i); this._pos = i < 0 ? s.length : i + 1; return r.replace(/\r$/, ''); };
File.prototype.readch = function () { return this.read(1); };
Object.defineProperty(File.prototype, 'eof', { get: function () { return this._pos >= (this._buf || '').length; } });
File.prototype.write = function () { for (var i = 0; i < arguments.length; i++) this._buf = (this._buf || '') + String(arguments[i]); return true; };
File.prototype.writeln = function () { this.write.apply(this, arguments); this._buf += '\n'; return true; };
File.prototype.seek = function (p) { this._pos = +p || 0; return true; };
File.prototype.tell = function () { return this._pos; };
File.prototype.close = function () { if ((this._mode === 'w' || this._mode === 'a') && this._buf !== null) hmut('writeText', { name: this.name || 'output.txt', text: this._buf }); this._mode = ''; return true; };
File.prototype.remove = function () { return false; };
File.prototype.copy = function () { return false; };
File.prototype.rename = function (n) { var a = this._p.split('/'); a[a.length - 1] = n; this._p = a.join('/'); return true; };
File.prototype.execute = function () { return false; };
File.prototype.resolve = function () { return this; };
File.prototype.getRelativeURI = function () { return this.name; };
function pickedFiles(list) { return (list || []).map(function (f) { var x = new File(f.name); x._id = f.id; return x; }); }
File.openDialog = function (title, filter, multi) { var r = hdo('pickFiles', { title: title, filter: String(filter || ''), multi: !!multi }); var l = pickedFiles(r.files); return multi ? (l.length ? l : null) : (l[0] || null); };
File.prototype.openDlg = function (t, f, m) { return File.openDialog(t, f, m); };
File.saveDialog = function (title, filter) { var n = hdo('promptName', { title: title || '存储为', value: 'untitled' }).value; return n ? new File('~/Downloads/' + n) : null; };
File.prototype.saveDlg = function (t, f) { return File.saveDialog(t, f); };
File.fs = 'Windows'; File.decode = decodeURI; File.encode = encodeURI;
function Folder(p) {
  if (!(this instanceof Folder)) return new Folder(p);
  this._p = String(p === undefined ? '' : p).replace(/\\/g, '/'); this.typename = 'Folder'; this._files = null;
}
['name', 'fsName', 'fullName', 'absoluteURI', 'path'].forEach(function (k) { Object.defineProperty(Folder.prototype, k, Object.getOwnPropertyDescriptor(File.prototype, k)); });
Object.defineProperty(Folder.prototype, 'exists', { get: function () { return !!this._files; } });
Folder.prototype.toString = function () { return this._p; };
Folder.prototype.create = function () { return true; };
Folder.prototype.getFiles = function (mask) {
  var l = this._files || []; if (!mask) return l.slice();
  if (typeof mask === 'function') return l.filter(mask);
  var re = mask instanceof RegExp ? mask : new RegExp('^' + String(mask).replace(/[.+^$()|[\]{}]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/;/g, '$|^') + '$', 'i');
  return l.filter(function (f) { return re.test(f.name); });
};
Folder.selectDialog = function (title) { var r = hdo('pickFiles', { title: title || '选择文件夹', folder: true, multi: true }); if (!r.files || !r.files.length) return null;
  var f = new Folder(r.folder || '~/所选文件夹'); f._files = pickedFiles(r.files); return f; };
Folder.prototype.selectDlg = function (t) { return Folder.selectDialog(t); };
['desktop', 'myDocuments', 'temp', 'userData', 'appData', 'startup', 'system', 'trash', 'current'].forEach(function (k) { Folder[k] = new Folder('~/' + k); });
Folder.fs = 'Windows';
G.File = File; G.Folder = Folder;

/* ============================ 对话框 / $ ============================ */
function alert_(m, title) { if (MODE === 'uxp') return hdoP('alert', { message: String(m), title: title }); hdo('alert', { message: String(m), title: title }); }
G.alert = alert_;
G.confirm = function (m, noAsDefault, title) { return !!hdo('confirm', { message: String(m), title: title }).value; };
G.prompt = function (m, def, title) { var r = hdo('prompt', { message: String(m), value: def === undefined ? '' : String(def), title: title }).value; return r === null || r === undefined ? null : String(r); };
var $ = {
  writeln: function () { H.log(Array.prototype.join.call(arguments, '') + '\n'); }, write: function () { H.log(Array.prototype.join.call(arguments, '')); },
  sleep: function (ms) { hdo('sleep', { ms: Math.min(5000, +ms || 0) }); }, os: 'Browser', version: '4.5.5', build: 'PSD Editor', locale: 'zh_CN', level: 0, global: G,
  getenv: function () { return null; }, setenv: function () {}, gc: function () {}, colorPicker: function () { return -1; }, bp: function () {},
  evalFile: function () { throw PSError('浏览器里不能 $.evalFile（没有文件系统）'); }, get fileName() { return G.__fileName || ''; }, get line() { return 0; }, screens: [{ left: 0, top: 0, right: 1920, bottom: 1080, primary: true }],
  stack: '', error: null, hiresTimer: 0, engineName: 'main', flags: 0, includePath: '', memCache: 0, strict: false
};
G.$ = $;
G.localize = function (s) { if (s && typeof s === 'object') return s.zh_CN || s.zh || s.en || s.en_US || ''; var a = Array.prototype.slice.call(arguments, 1); return String(s).replace(/%(\d+)/g, function (m, n) { return a[n - 1] === undefined ? m : a[n - 1]; }); };
G.console = { log: function () { H.log(Array.prototype.map.call(arguments, fmt).join(' ') + '\n'); } };
G.console.info = G.console.warn = G.console.error = G.console.debug = G.console.log;
function fmt(x) { if (typeof x === 'string') return x; try { return JSON.stringify(x); } catch (e) { return String(x); } }
G.isValid = function (o) { return o !== null && o !== undefined; };
G.Window = function () { throw PSError('ScriptUI 窗口（new Window）本编辑器不支持；用 alert / confirm / prompt 代替'); };

/* ============================ 文档对象模型 ============================ */
function curDocs() { return info().docs; }
function Document(uid) { this._uid = uid; this.typename = 'Document'; }
function docInfo(d) { var I = info(); if (!I.doc || I.doc.uid !== d._uid) { activate(d); I = info(); } return I.doc; }
function activate(d) { var I = info(); if (I.doc && I.doc.uid === d._uid) return; if (!curDocs().some(function (x) { return x.uid === d._uid; })) throw PSError('文档已经关闭', 8800); hmut('activateDoc', { uid: d._uid }); }
var DP = Document.prototype;
function dprop(name, get, set) { Object.defineProperty(DP, name, { get: get, set: set }); }
dprop('name', function () { return docInfo(this).name; });
dprop('title', function () { return docInfo(this).name; });
dprop('width', function () { return rul(docInfo(this).width); });
dprop('height', function () { return rul(docInfo(this).height); });
dprop('resolution', function () { return docInfo(this).resolution; });
dprop('mode', function () { return 'DocumentMode.' + ({ 0: 'BITMAP', 1: 'GRAYSCALE', 2: 'INDEXEDCOLOR', 3: 'RGB', 4: 'CMYK', 7: 'MULTICHANNEL', 8: 'DUOTONE', 9: 'LAB' }[docInfo(this).mode] || 'RGB'); });
dprop('bitsPerChannel', function () { return 'BitsPerChannelType.' + ({ 1: 'ONE', 8: 'EIGHT', 16: 'SIXTEEN', 32: 'THIRTYTWO' }[docInfo(this).depth] || 'EIGHT'); });
dprop('saved', function () { return !docInfo(this).dirty; });
dprop('id', function () { return docInfo(this).id; });
dprop('fullName', function () { return new File('~/' + docInfo(this).name); });
dprop('path', function () { return new Folder('~'); });
dprop('pixelAspectRatio', function () { return 1; });
dprop('colorProfileName', function () { return docInfo(this).profile || 'sRGB IEC61966-2.1'; });
dprop('quickMaskMode', function () { return false; });
dprop('info', function () { return { author: '', caption: '', copyrighted: 'CopyrightedType.UNMARKED', title: docInfo(this).name, keywords: [] }; });
dprop('layers', function () { return collection(this, null, 'all'); });
dprop('artLayers', function () { return collection(this, null, 'art'); });
dprop('layerSets', function () { return collection(this, null, 'set'); });
dprop('activeLayer', function () { var D = docInfo(this); return D.active >= 0 ? layerAt(this, D.active) : null; },
  function (l) { activate(this); hmut('selectLayer', { i: l._idx() }); });
dprop('selection', function () { return new Selection(this); });
dprop('activeHistoryState', function () { return { name: docInfo(this).historyName || '', typename: 'HistoryState' }; }, function () {});
dprop('historyStates', function () { var n = docInfo(this).historyCount || 0, a = []; for (var i = 0; i < n; i++) a.push({ name: '历史 ' + (i + 1), typename: 'HistoryState' }); a.length = n; return a; });
dprop('channels', function () { var m = docInfo(this).mode, names = m === 1 ? ['灰色'] : m === 4 ? ['青色', '洋红', '黄色', '黑色'] : ['红', '绿', '蓝'];
  return names.map(function (n) { return { name: n, kind: 'ChannelType.COMPONENT', visible: true, typename: 'Channel' }; }); });
dprop('pathItems', function () { return []; });
dprop('guides', function () { return []; });
dprop('countItems', function () { return []; });
dprop('layerComps', function () { return []; });
DP.toString = function () { return '[Document ' + this.name + ']'; };
function docExec(d, ev, desc) { activate(d); return execJ(ev, desc); }
DP.resizeImage = function (w, h, r, method) {
  var D = docInfo(this), W = px(w, D.width), Hh = px(h, D.height), o = { __name: '', __classID: 'null' };
  if (W === undefined && Hh === undefined && r) { hmut('imageSize', { resolution: +r }); return; }
  if (W === undefined) W = D.width * Hh / D.height; if (Hh === undefined) Hh = D.height * W / D.width;
  o.Wdth = { __unit: '#Pxl', value: W }; o.Hght = { __unit: '#Pxl', value: Hh };
  docExec(this, 'ImgS', o); if (r && +r !== D.resolution) hmut('imageSize', { resolution: +r });
};
DP.resizeCanvas = function (w, h, anchor) {
  var D = docInfo(this), a = String(anchor || AnchorPosition.MIDDLECENTER).replace(/^AnchorPosition\./, '');
  var hz = /LEFT$/.test(a) ? 'Left' : /RIGHT$/.test(a) ? 'Rght' : 'Cntr', vt = /^TOP/.test(a) ? 'Top ' : /^BOTTOM/.test(a) ? 'Btom' : 'Cntr';
  docExec(this, 'CnvS', { __name: '', __classID: 'null', Wdth: { __unit: '#Pxl', value: px(w, D.width) || D.width }, Hght: { __unit: '#Pxl', value: px(h, D.height) || D.height },
    Hrzn: { __enumType: 'HrzL', value: hz }, Vrtc: { __enumType: 'VrtL', value: vt } });
};
DP.crop = function (b, angle, w, h) {
  var D = docInfo(this), q = boundsPx(b, D);
  docExec(this, 'Crop', { __name: '', __classID: 'null', 'T   ': { __name: '', __classID: 'Rctn', 'Top ': { __unit: '#Pxl', value: q[1] }, Left: { __unit: '#Pxl', value: q[0] }, Btom: { __unit: '#Pxl', value: q[3] }, Rght: { __unit: '#Pxl', value: q[2] } },
    Angl: { __unit: '#Ang', value: +angle || 0 }, 'Dlt ': true });
  if (w || h) this.resizeImage(w, h);
};
DP.rotateCanvas = function (a) { docExec(this, 'Rtte', { __name: '', __classID: 'null', 'null': { __reference: [{ type: 'Enmr', cls: { name: '', cid: 'Dcmn' }, enumType: 'Ordn', value: 'Frst' }] }, Angl: { __unit: '#Ang', value: +a } }); };
DP.flipCanvas = function (dir) { docExec(this, 'Flip', { __name: '', __classID: 'null', 'null': { __reference: [{ type: 'Enmr', cls: { name: '', cid: 'Dcmn' }, enumType: 'Ordn', value: 'Frst' }] }, Axis: { __enumType: 'Ornt', value: /VERT/.test(String(dir)) ? 'Vrtc' : 'Hrzn' } }); };
DP.flatten = function () { docExec(this, 'FltI', { __name: '', __classID: 'null' }); };
DP.mergeVisibleLayers = function () { docExec(this, 'MrgV', { __name: '', __classID: 'null' }); };
DP.trim = function (type) { var t = String(type || '').replace(/^TrimType\./, ''); docExec(this, 'trim', { __name: '', __classID: 'null', trimBasedOn: { __enumType: 'trimBasedOn', value: t === 'TOPLEFT' ? 'topLeftPixelColor' : t === 'BOTTOMRIGHT' ? 'bottomRightPixelColor' : 'transparency' } }); };
DP.revealAll = function () { docExec(this, 'RvlA', { __name: '', __classID: 'null' }); };
DP.changeMode = function (m) { activate(this); hmut('changeMode', { mode: String(m) }); };
DP.convertProfile = function () { throw PSError('convertProfile 本编辑器脚本里暂不支持；请用「编辑 › 转换为配置文件」'); };
DP.duplicate = function (name, mergeLayersOnly) { activate(this); var r = hmut('duplicateDoc', { name: name, merged: !!mergeLayersOnly }); return new Document(r.uid); };
DP.close = function (opt) { var o = String(opt || ''); activate(this); if (/SAVECHANGES$/.test(o) && !/DONOT/.test(o)) this.save(); hmut('closeDoc', { uid: this._uid, discard: !/PROMPT/.test(o) }); };
DP.save = function () { activate(this); hmut('save', { format: 'psd' }); };
DP.saveAs = function (file, opts, asCopy) { activate(this); hmut('save', saveSpec(file, opts)); };
DP.exportDocument = function (file, type, opts) { activate(this); var s = saveSpec(file, opts); if (opts && opts.format) s.format = fmtOf(opts.format); hmut('save', s); };
DP.paste = function (into) { activate(this); hmut('command', { id: into ? 'edit.pasteInto' : 'edit.paste' }); return this.activeLayer; };
DP.suspendHistory = function (name, code) { hmut('historyGroup', { begin: String(name) }); try { (0, eval)(String(code)); } finally { hmut('historyGroup', { end: true }); } };
DP.splitChannels = function () { activate(this); hmut('command', { id: 'channels.split' }); return []; };
DP.flipCanvas = DP.flipCanvas;
DP.autoCount = function () { return []; };
DP.importAnnotations = DP.printOneCopy = DP.print = function () {};
DP.trap = DP.rasterizeAllLayers = function () { activate(this); hmut('command', { id: 'layer.rasterize.all' }); };
DP.rasterizeAllLayers = function () { activate(this); hmut('command', { id: 'layer.rasterize.all' }); };
DP.selectAllLayers = function () { activate(this); hmut('command', { id: 'select.allLayers' }); };

function fmtOf(t) { t = String(t || ''); if (/JPEG|JPG/i.test(t)) return 'jpg'; if (/PNG/i.test(t)) return 'png'; if (/GIF/i.test(t)) return 'gif'; if (/BMP/i.test(t)) return 'bmp'; if (/TIFF/i.test(t)) return 'tif'; if (/TARGA/i.test(t)) return 'tga'; if (/PDF/i.test(t)) return 'pdf'; return 'psd'; }
function saveSpec(file, opts) {
  var t = (opts && (opts.typename || opts._type)) || '', name = file ? (file.name || String(file).split('/').pop()) : '';
  var f = /JPEG/i.test(t) ? 'jpg' : /PNG/i.test(t) ? 'png' : /GIF/i.test(t) ? 'gif' : /BMP/i.test(t) ? 'bmp' : /Tiff/i.test(t) ? 'tif' : /Targa/i.test(t) ? 'tga' : /PDF/i.test(t) ? 'pdf' : /ExportOptionsSaveForWeb/i.test(t) ? fmtOf(opts.format) : '';
  if (!f) { var m = /\.(\w+)$/.exec(name); f = m ? m[1].toLowerCase().replace('jpeg', 'jpg').replace('tiff', 'tif') : 'psd'; }
  var q = opts && opts.quality !== undefined ? +opts.quality : undefined;
  if (q !== undefined && /JPEG/i.test(t)) q = Math.round(q / 12 * 100);
  return { format: f, quality: q, name: name || undefined };
}
function optsClass(n, defs) { var F = function () { this.typename = n; for (var k in defs) this[k] = defs[k]; }; G[n] = F; }
optsClass('PhotoshopSaveOptions', { alphaChannels: true, annotations: true, embedColorProfile: true, layers: true, spotColors: true });
optsClass('JPEGSaveOptions', { quality: 10, embedColorProfile: true, formatOptions: FormatOptions.STANDARDBASELINE, matte: MatteType.NONE, scans: 3 });
optsClass('PNGSaveOptions', { compression: 6, interlaced: false });
optsClass('GIFSaveOptions', { colors: 256, transparency: true, interlaced: false });
optsClass('BMPSaveOptions', { alphaChannels: false, depth: 'BMPDepthType.TWENTYFOUR' });
optsClass('TiffSaveOptions', { imageCompression: 'TIFFEncoding.NONE', layers: true });
optsClass('TargaSaveOptions', { resolution: 'TargaBitsPerPixels.TWENTYFOUR', rleCompression: true });
optsClass('PDFSaveOptions', { jpegQuality: 10 });
optsClass('ExportOptionsSaveForWeb', { format: SaveDocumentType.JPEG, quality: 60, PNG8: false, transparency: true, colors: 256, includeProfile: false, optimized: true });

/* ---- 图层 ---- */
function Layer(doc, i, L) { this._doc = doc; this._i = i; this._id = L.id; this._name = L.name; }
function layerAt(doc, i) { var L = docInfo(doc).layers[i]; if (!L) throw PSError('图层不存在', 8800); return new Layer(doc, i, L); }
/* 图层的「身份」：宿主给的图层 ID（本次会话内稳定，结构变了也跟得上）；下标只是缓存 */
Layer.prototype._idx = function () {
  var L = docInfo(this._doc).layers;
  if (L[this._i] && L[this._i].id === this._id) return this._i;
  for (var k = 0; k < L.length; k++) if (L[k].id === this._id) { this._i = k; return k; }
  throw PSError('图层「' + this._name + '」已经不在了', 8800);
};
Layer.prototype._L = function () { return docInfo(this._doc).layers[this._idx()]; };
Layer.prototype._set = function (p) { activate(this._doc); p.i = this._idx(); hmut('setLayer', p); if (p.name !== undefined) this._name = p.name; };
Layer.prototype.toString = function () { return '[' + this.typename + ' ' + this._name + ']'; };
Layer.prototype._sel = function () { activate(this._doc); var i = this._idx(), D = docInfo(this._doc); if (D.active !== i) hmut('selectLayer', { i: i }); };
Layer.prototype.toString = function () { return '[' + this.typename + ' ' + this._name + ']'; };
var LP = Layer.prototype;
function lprop(name, get, set) { Object.defineProperty(LP, name, { get: get, set: set }); }
lprop('name', function () { return this._L().name; }, function (v) { this._set({ name: String(v) }); });
lprop('visible', function () { return !!this._L().visible; }, function (v) { this._set({ visible: !!v }); });
lprop('opacity', function () { return this._L().opacity; }, function (v) { this._set({ opacity: +v }); });
lprop('fillOpacity', function () { return this._L().fillOpacity; }, function (v) { this._set({ fillOpacity: +v }); });
lprop('blendMode', function () { return BLEND_REV[this._L().blend] || BlendMode.NORMAL; }, function (v) { this._set({ blend: blendKeyOf(v) }); });
lprop('kind', function () { var L = this._L(); return L.group === 'head' ? undefined : LayerKind[KIND_MAP[L.kind] || 'NORMAL']; },
  function (v) { if (String(v) === LayerKind.TEXT) this._set({ makeText: true }); });
lprop('bounds', function () { var b = this._L().bounds; return [rul(b[0]), rul(b[1]), rul(b[2]), rul(b[3])]; });
lprop('boundsNoEffects', function () { var b = this._L().boundsNoFx || this._L().bounds; return [rul(b[0]), rul(b[1]), rul(b[2]), rul(b[3])]; });
lprop('isBackgroundLayer', function () { return !!this._L().isBackground; }, function (v) { this._set({ background: !!v }); });
lprop('allLocked', function () { return !!this._L().locked; }, function (v) { this._set({ locked: !!v }); });
lprop('pixelsLocked', function () { return !!this._L().lockPixels; }, function (v) { this._set({ lockPixels: !!v }); });
lprop('positionLocked', function () { return !!this._L().lockPosition; }, function (v) { this._set({ lockPosition: !!v }); });
lprop('transparentPixelsLocked', function () { return !!this._L().lockTransparency; }, function (v) { this._set({ lockTransparency: !!v }); });
lprop('grouped', function () { return !!this._L().clip; }, function (v) { this._set({ clip: !!v }); });
lprop('id', function () { return this._L().id; });
lprop('itemIndex', function () { return this._idx() + 1; });
lprop('parent', function () { var p = this._L().parent; return p === null || p === undefined ? this._doc : layerAt(this._doc, p); });
lprop('layers', function () { return collection(this._doc, this, 'all'); });
lprop('artLayers', function () { return collection(this._doc, this, 'art'); });
lprop('layerSets', function () { return collection(this._doc, this, 'set'); });
lprop('textItem', function () { if (this._L().kind !== 'text') throw PSError('这不是文字图层', 8500); return new TextItem(this); });
lprop('linkedLayers', function () { return []; });
lprop('layerMaskDensity', function () { return 100; }, function () {});
lprop('layerMaskFeather', function () { return 0; }, function () {});
lprop('filterMaskDensity', function () { return 100; }, function () {});
lprop('xmpMetadata', function () { return { rawData: '' }; });
lprop('enabledChannels', function () { return docInfo(this._doc).mode === 4 ? [0, 1, 2, 3] : [0, 1, 2]; }, function () {});
lprop('typename', function () { return this._L().group === 'head' ? 'LayerSet' : 'ArtLayer'; }, function () {});
LP.translate = function (dx, dy) { var D = docInfo(this._doc); activate(this._doc); hmut('translate', { i: this._idx(), dx: px(dx, D.width) || 0, dy: px(dy, D.height) || 0 }); };
LP.remove = function () { activate(this._doc); hmut('deleteLayer', { i: this._idx() }); };
LP['delete'] = LP.remove;
LP.duplicate = function (rel, placement) { activate(this._doc); var r = hmut('duplicateLayer', { i: this._idx() }); if (MODE === 'uxp') return null; var n = layerAt(this._doc, r.index); if (rel) n.move(rel, placement || ElementPlacement.PLACEBEFORE); return n; };
LP.move = function (rel, placement) {
  activate(this._doc); var p = String(placement || ElementPlacement.PLACEBEFORE).replace(/^ElementPlacement\./, '');
  var to = rel && rel.typename === 'Document' ? -1 : rel._idx();
  hmut('moveLayer', { i: this._idx(), to: to, placement: p });
};
LP.moveToEnd = function (set) { this.move(set || this._doc, ElementPlacement.PLACEATEND); };
LP.moveAfter = function (l) { this.move(l, ElementPlacement.PLACEAFTER); };
LP.moveBefore = function (l) { this.move(l, ElementPlacement.PLACEBEFORE); };
LP.merge = function () { this._sel(); hmut('command', { id: this._L().group === 'head' ? 'layer.mergeGroup' : 'layer.merge' }); return this._doc.activeLayer; };
LP.rasterize = function () { this._sel(); hmut('command', { id: 'layer.rasterize.layer' }); };
LP.link = LP.unlink = function () {};
LP.clear = function () { this._sel(); hmut('command', { id: 'edit.clear' }); };
LP.copy = function (merged) { this._sel(); hmut('command', { id: merged ? 'edit.copyMerged' : 'edit.copy' }); };
LP.cut = function () { this._sel(); hmut('command', { id: 'edit.cut' }); };
LP.resize = function (sx, sy, anchor) { this._sel(); hmut('transform', { i: this._idx(), sx: sx === undefined ? 100 : +sx, sy: sy === undefined ? +sx || 100 : +sy, anchor: String(anchor || '') }); };
LP.rotate = function (a, anchor) { this._sel(); hmut('transform', { i: this._idx(), angle: +a || 0, anchor: String(anchor || '') }); };
LP.invert = function () { this._sel(); hmut('adjust', { type: 'invert' }); };
LP.desaturate = function () { this._sel(); hmut('adjust', { type: 'desaturate' }); };
LP.equalize = function () { this._sel(); execJ('Eqlz', { __name: '', __classID: 'null' }); };
LP.autoLevels = function () { this._sel(); hmut('filter', { kind: 'autoTone' }); };
LP.autoContrast = function () { this._sel(); hmut('filter', { kind: 'autoContrast' }); };
LP.adjustBrightnessContrast = function (b, c) { this._sel(); hmut('adjust', { type: 'brightnessContrast', model: { brightness: +b || 0, contrast: +c || 0 } }); };
LP.posterize = function (n) { this._sel(); hmut('adjust', { type: 'posterize', model: { levels: +n || 4 } }); };
LP.threshold = function (n) { this._sel(); hmut('adjust', { type: 'threshold', model: { level: +n || 128 } }); };
LP.adjustLevels = function (is, ie, g, os, oe) { this._sel(); hmut('adjust', { type: 'levels', model: { inBlack: +is || 0, inWhite: ie === undefined ? 255 : +ie, gamma: g === undefined ? 1 : +g, outBlack: +os || 0, outWhite: oe === undefined ? 255 : +oe } }); };
function F(kind, names) { return function () { this._sel(); var p = {}, a = arguments; names.forEach(function (n, k) { if (a[k] !== undefined) p[n] = typeof a[k] === 'object' && a[k] instanceof UnitValue ? a[k].as('px') : (typeof a[k] === 'string' ? a[k] : +a[k]); }); hmut('filter', { kind: kind, params: p }); }; }
LP.applyGaussianBlur = F('gaussianBlur', ['radius']);
LP.applyBlur = F('blur', []); LP.applyBlurMore = F('blurMore', []); LP.applyAverage = F('average', []);
LP.applyMotionBlur = F('motionBlur', ['angle', 'distance']);
LP.applyRadialBlur = function (amount, method) { this._sel(); hmut('filter', { kind: 'radialBlur', params: { amount: +amount || 10, method: /ZOOM/.test(String(method)) ? 'zoom' : 'spin' } }); };
LP.applyUnsharpMask = F('unsharpMask', ['amount', 'radius', 'threshold']);
LP.applySharpen = F('sharpen', []); LP.applySharpenMore = F('sharpenMore', []); LP.applySharpenEdges = F('sharpenEdges', []);
LP.applyAddNoise = function (amount, dist, mono) { this._sel(); hmut('filter', { kind: 'addNoise', params: { amount: +amount || 0, distribution: /GAUSS/.test(String(dist)) ? 'gaussian' : 'uniform', monochromatic: !!mono } }); };
LP.applyMedianNoise = F('median', ['radius']);
LP.applyDespeckle = F('despeckle', []);
LP.applyDustAndScratches = F('dustScratches', ['radius', 'threshold']);
LP.applyHighPass = F('highPass', ['radius']);
LP.applyMaximum = F('maximum', ['radius']); LP.applyMinimum = F('minimum', ['radius']);
LP.applyMosaic = F('mosaic', ['cell']);
LP.applyEmboss = F('emboss', ['angle', 'height', 'amount']);
LP.applyFindEdges = F('findEdges', []); LP.applySolarize = F('solarize', []);
LP.applyFacet = F('facet', []); LP.applyFragment = F('fragment', []);
LP.applyPinch = F('pinch', ['amount']); LP.applyTwirl = F('twirl', ['angle']);
LP.applySpherize = F('spherize', ['amount']); LP.applyRipple = F('ripple', ['amount']);
LP.applyCrystallize = F('crystallize', ['cell']); LP.applyPointillize = F('pointillize', ['cell']);
LP.applyClouds = F('clouds', []); LP.applyDifferenceClouds = F('differenceClouds', []);
LP.applyOffset = function (h, v, fill) { this._sel(); hmut('filter', { kind: 'offset', params: { dx: px(h) || 0, dy: px(v) || 0, wrap: /WRAP/.test(String(fill)) } }); };
LP.applyPolarCoordinates = function (c) { this._sel(); hmut('filter', { kind: 'polar', params: { mode: /POLARTORECT/.test(String(c)) ? 'polarToRect' : 'rectToPolar' } }); };
LP.applyTraceContour = F('traceContour', ['level']);
LP.applyStyle = function (name) { this._sel(); hmut('applyStyle', { name: String(name) }); };
LP.applyLensBlur = LP.applyLensFlare = LP.applyLightingEffect = function () { throw PSError('这个滤镜在脚本里暂不支持'); };
LP.mixChannels = LP.adjustCurves = LP.adjustColorBalance = LP.selectiveColor = LP.photoFilter = LP.applyDisplace = LP.applyGlassEffect = LP.applyWave = LP.applyZigZag =
  LP.applyShear = LP.applyOceanRipple = LP.applyDiffuseGlow = LP.applyNTSC = LP.applyDeInterlace = LP.applyTextureFill = LP.applyCustomFilter = LP.applyDiffuse = LP.applyExtrude = LP.applyTiles =
  LP.applyWind = LP.applyGlowingEdges = LP.applySmartBlur = LP.applyLensCorrection = LP.applyPinch2 = LP.shadowHighlight = LP.applyBoxBlur = LP.applySurfaceBlur =
  function () { throw PSError('这个调整 / 滤镜的 DOM 方法暂不支持；请录成动作或用 executeAction', 8500); };
LP.applyBoxBlur = F('boxBlur', ['radius']);
LP.applySurfaceBlur = F('surfaceBlur', ['radius', 'threshold']);

/* ---- 文字 ---- */
function TextItem(layer) { this._l = layer; this.typename = 'TextItem'; }
var TP = TextItem.prototype;
function tprop(name, get, set) { Object.defineProperty(TP, name, { get: get, set: set }); }
function T(self) { return self._l._L().text || {}; }
tprop('contents', function () { return T(this).contents || ''; }, function (v) { this._l._set({ text: { contents: String(v) } }); });
tprop('size', function () { var s = T(this).size || 12; return new UnitValue(prefs.typeUnits === 'px' ? s * res() / 72 : s, prefs.typeUnits === 'px' ? 'px' : 'pt'); }, function (v) { this._l._set({ text: { size: ptOf(v) } }); });
tprop('font', function () { return T(this).font || ''; }, function (v) { this._l._set({ text: { font: String(v) } }); });
tprop('color', function () { return colorOf(T(this).color || [0, 0, 0]); }, function (c) { this._l._set({ text: { color: rgbArr(c) } }); });
tprop('position', function () { var p = T(this).position || [0, 0]; return [rul(p[0]), rul(p[1])]; }, function (p) { var D = docInfo(this._l._doc), c = T(this).position || [0, 0]; this._l.translate(new UnitValue(px(p[0], D.width) - c[0], 'px'), new UnitValue(px(p[1], D.height) - c[1], 'px')); });
tprop('justification', function () { return 'Justification.' + String(T(this).justification || 'LEFT').toUpperCase(); }, function (v) { this._l._set({ text: { justification: String(v).replace(/^Justification\./, '').toLowerCase() } }); });
tprop('kind', function () { return T(this).box ? TextType.PARAGRAPHTEXT : TextType.POINTTEXT; }, function () {});
tprop('width', function () { var b = T(this).box; return rul(b ? b[2] : this._l._L().bounds[2] - this._l._L().bounds[0]); }, function () {});
tprop('height', function () { var b = T(this).box; return rul(b ? b[3] : this._l._L().bounds[3] - this._l._L().bounds[1]); }, function () {});
tprop('fauxBold', function () { return !!T(this).fauxBold; }, function (v) { this._l._set({ text: { fauxBold: !!v } }); });
tprop('fauxItalic', function () { return !!T(this).fauxItalic; }, function (v) { this._l._set({ text: { fauxItalic: !!v } }); });
tprop('tracking', function () { return T(this).tracking || 0; }, function (v) { this._l._set({ text: { tracking: +v } }); });
tprop('leading', function () { return new UnitValue(T(this).leading || (T(this).size || 12) * 1.2, 'pt'); }, function (v) { this._l._set({ text: { leading: ptOf(v) } }); });
tprop('useAutoLeading', function () { return !T(this).leading; }, function () {});
tprop('antiAliasMethod', function () { return 'AntiAlias.SHARP'; }, function () {});
tprop('direction', function () { return T(this).vertical ? 'Direction.VERTICAL' : 'Direction.HORIZONTAL'; }, function () {});
TP.convertToShape = TP.createPath = function () { throw PSError('转换为形状 / 创建工作路径在脚本里暂不支持'); };

/* ---- 集合 ---- */
function children(doc, parent) {
  var D = docInfo(doc), L = D.layers, pi = parent ? parent._idx() : null, out = [];
  for (var k = L.length - 1; k >= 0; k--) { var x = L[k]; if (x.group === 'end') continue; if ((x.parent === undefined ? null : x.parent) === pi) out.push(k); }
  return out;
}
function collection(doc, parent, which) {
  var idx = children(doc, parent), L = docInfo(doc).layers, a = [];
  idx.forEach(function (k) { var isSet = L[k].group === 'head'; if (which === 'all' || (which === 'set') === isSet) a.push(new Layer(doc, k, L[k])); });
  a.typename = which === 'set' ? 'LayerSets' : which === 'art' ? 'ArtLayers' : 'Layers'; a.parent = parent || doc;
  a.getByName = function (n) { for (var i = 0; i < a.length; i++) if (a[i].name === n) return a[i]; throw PSError('没有名为「' + n + '」的图层', 8500); };
  a.index = function (l) { for (var i = 0; i < a.length; i++) if (a[i]._id === l._id) return i; return -1; };
  a.add = function () {
    activate(doc);
    if (parent) parent._sel();
    var r = hmut(which === 'set' ? 'newGroup' : 'newLayer', { inside: parent ? parent._idx() : null });
    if (MODE === 'uxp') return null;
    return layerAt(doc, r.index);
  };
  a.removeAll = function () { for (var i = a.length - 1; i >= 0; i--) a[i].remove(); };
  return a;
}

/* ---- 选区 ---- */
function Selection(doc) { this._doc = doc; this.typename = 'Selection'; }
var SP = Selection.prototype;
function boundsPx(b, D) { return [px(b[0], D.width), px(b[1], D.height), px(b[2], D.width), px(b[3], D.height)]; }
Object.defineProperty(SP, 'bounds', { get: function () { var b = docInfo(this._doc).selection; if (!b) throw PSError('没有选区', 8152); return [rul(b[0]), rul(b[1]), rul(b[2]), rul(b[3])]; } });
Object.defineProperty(SP, 'solid', { get: function () { return !!docInfo(this._doc).selection; } });
SP.selectAll = function () { docExec(this._doc, 'setd', selSet({ __enumType: 'Ordn', value: 'Al  ' })); };
SP.deselect = function () { docExec(this._doc, 'setd', selSet({ __enumType: 'Ordn', value: 'None' })); };
SP.invert = function () { docExec(this._doc, 'Invs', { __name: '', __classID: 'null' }); };
SP.feather = function (r) { docExec(this._doc, 'Fthr', { __name: '', __classID: 'null', 'Rds ': { __unit: '#Pxl', value: px(r) } }); };
SP.expand = function (r) { docExec(this._doc, 'Expn', { __name: '', __classID: 'null', 'By  ': { __unit: '#Pxl', value: px(r) } }); };
SP.contract = function (r) { docExec(this._doc, 'Cntc', { __name: '', __classID: 'null', 'By  ': { __unit: '#Pxl', value: px(r) } }); };
SP.smooth = function (r) { docExec(this._doc, 'Smth', { __name: '', __classID: 'null', 'Rds ': { __unit: '#Pxl', value: px(r) } }); };
SP.selectBorder = function (w) { docExec(this._doc, 'Brdr', { __name: '', __classID: 'null', Wdth: { __unit: '#Pxl', value: px(w) } }); };
SP.select = function (region, type, feather, aa) {
  var D = docInfo(this._doc), pts = (region || []).map(function (p) { return [px(p[0], D.width), px(p[1], D.height)]; });
  var t = String(type || SelectionType.REPLACE).replace(/^SelectionType\./, '');
  activate(this._doc);
  hmut('selectPolygon', { points: pts, mode: { REPLACE: 'replace', EXTEND: 'add', DIMINISH: 'subtract', INTERSECT: 'intersect' }[t] || 'replace', feather: px(feather || 0), antiAlias: aa !== false });
};
SP.fill = function (c, mode, opacity, preserve) {
  activate(this._doc);
  var m = mode ? String(mode).replace(/^ColorBlendMode\./, '') : 'NORMAL';
  hmut('fill', { using: c && c.typename === 'SolidColor' ? 'color' : 'fg', color: rgbArr(c), mode: BLEND[m] || 'norm', opacity: opacity === undefined ? 100 : +opacity, preserve: !!preserve });
};
SP.clear = function () { activate(this._doc); hmut('command', { id: 'edit.clear' }); };
SP.copy = function (merged) { activate(this._doc); hmut('command', { id: merged ? 'edit.copyMerged' : 'edit.copy' }); };
SP.cut = function () { activate(this._doc); hmut('command', { id: 'edit.cut' }); };
SP.stroke = function (c, w, loc, mode, op, preserve) { activate(this._doc); hmut('stroke', { color: rgbArr(c), width: px(w) || 1, location: String(loc || 'center'), opacity: op === undefined ? 100 : +op }); };
SP.translate = SP.translateBoundary = function (dx, dy) { activate(this._doc); hmut('translateSelection', { dx: px(dx) || 0, dy: px(dy) || 0 }); };
SP.grow = SP.similar = SP.makeWorkPath = SP.load = SP.store = SP.rotate = SP.resize = SP.resizeBoundary = SP.rotateBoundary = function () { throw PSError('这个选区方法在脚本里暂不支持', 8500); };
function selSet(to) { return { __name: '', __classID: 'null', 'null': { __reference: [{ type: 'prop', cls: { name: '', cid: 'Chnl' }, key: 'fsel' }] }, 'T   ': to }; }

/* ---- app ---- */
var app = { typename: 'Application', name: 'Adobe Photoshop', version: '27.0.0', build: 'PSD Editor', locale: 'zh_CN', path: new Folder('~/PSD Editor'), scriptingVersion: '27.0', scriptingBuildDate: '',
  displayDialogs: DialogModes.ERROR, playbackDisplayDialogs: DialogModes.NO, preferences: prefs, notifiersEnabled: false, notifiers: [], fonts: null, recentFiles: [], windowsFileTypes: [], macintoshFileTypes: [],
  freeMemory: 2147483647, systemInformation: 'PSD Editor（浏览器）', measurementScale: { pixelLength: 1, logicalLength: 1, logicalUnits: 'pixels' }, colorSettings: 'sRGB', eyedropperSampleSize: 1 };
Object.defineProperty(app, 'documents', { get: function () {
  var a = curDocs().map(function (d) { return new Document(d.uid); });
  a.typename = 'Documents';
  a.getByName = function (n) { for (var i = 0; i < a.length; i++) if (a[i].name === n) return a[i]; throw PSError('没有名为「' + n + '」的文档', 8500); };
  a.add = function (w, h, r, name, mode, fill) {
    var R = +r || 72; var W = w instanceof UnitValue ? (w.type === 'px' ? w.value : fromInches(toInches(w.value, w.type), 'in') * R) : (prefs.rulerUnits === 'px' ? +w : toInches(+w, prefs.rulerUnits) * R);
    var Hh = h instanceof UnitValue ? (h.type === 'px' ? h.value : fromInches(toInches(h.value, h.type), 'in') * R) : (prefs.rulerUnits === 'px' ? +h : toInches(+h, prefs.rulerUnits) * R);
    var rr = hmut('newDocument', { width: Math.round(W || 1000), height: Math.round(Hh || 800), resolution: R, name: name || undefined, mode: String(mode || 'RGB').replace(/^NewDocumentMode\./, '').toLowerCase(), fill: String(fill || 'WHITE').replace(/^DocumentFill\./, '').toLowerCase() });
    return MODE === 'uxp' ? null : new Document(rr.uid);
  };
  return a; } });
Object.defineProperty(app, 'activeDocument', { get: function () { var d = info().doc; if (!d) throw PSError('没有打开的文档', 8007); return new Document(d.uid); }, set: function (d) { activate(d); } });
Object.defineProperty(app, 'foregroundColor', { get: function () { return colorOf(info().fg); }, set: function (c) { hmut('color', { which: 'fg', rgb: rgbArr(c) }); } });
Object.defineProperty(app, 'backgroundColor', { get: function () { return colorOf(info().bg); }, set: function (c) { hmut('color', { which: 'bg', rgb: rgbArr(c) }); } });
app.open = function (f) { if (!f || f._id === null || f._id === undefined) throw PSError('浏览器里只能打开你在对话框里选过的文件（File.openDialog / Folder.selectDialog）', 8800); var r = hmut('openFile', { id: f._id }); return MODE === 'uxp' ? null : new Document(r.uid); };
app.load = app.open;
app.doAction = function (action, set) { hmut('playAction', { action: String(action), set: String(set) }); };
app.purge = app.refresh = app.beep = app.bringToFront = app.togglePalettes = function () {};
app.refreshFonts = function () {};
app.charIDToTypeID = charIDToTypeID; app.stringIDToTypeID = stringIDToTypeID; app.typeIDToCharID = typeIDToCharID; app.typeIDToStringID = typeIDToStringID;
app.executeAction = function (e, d, m) { return executeAction(e, d, m); };
app.executeActionGet = function (r) { return executeActionGet(r); };
app.getCustomOptions = function (key) { var r = hget('customOptions', { key: String(key) }); if (!r.value) throw PSError('没有存过「' + key + '」', 8500); var d = new ActionDescriptor(); d.fromStream(r.value); return d; };
app.putCustomOptions = function (key, d) { hmut('customOptions', { key: String(key), value: d.toStream() }); };
app.eraseCustomOptions = function (key) { hmut('customOptions', { key: String(key), value: null }); };
app.isQuicktimeAvailable = function () { return false; };
app.featureEnabled = function () { return true; };
app.showColorPicker = function () { return false; };
app.batch = function () { throw PSError('app.batch 请用「文件 › 自动 › 批处理」'); };
app.makeContactSheet = app.makePDFPresentation = app.makePicturePackage = app.makePhotomerge = function () { throw PSError('请用「文件 › 自动」里的对应命令'); };
app.system = function () { return ''; };
G.app = app; G.activeDocument = undefined;
Object.defineProperty(G, 'activeDocument', { get: function () { return app.activeDocument; }, configurable: true });
G.preferences = prefs; G.documents = undefined;
Object.defineProperty(G, 'documents', { get: function () { return app.documents; }, configurable: true });

/* ============================ executeAction ============================ */
/* 层 ID（executeActionGet 给出去的 layerID）在本编辑器里就是「当前下标 + 1」：换成宿主认的 __idx 引用 */
function fixRefs(o) {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) o[i] = fixRefs(o[i]); return o; }
  if (o.__reference) { o.__reference = o.__reference.map(function (r) {
    if (r.cls && r.cls.cid === 'Lyr ' && r.type === 'Idnt') return { type: '__idx', cls: r.cls, index: idToIndex(r.id) };
    if (r.cls && r.cls.cid === 'Lyr ' && r.type === 'indx') return { type: '__idx', cls: r.cls, index: itemToIndex(r.index) };
    return r; }); return o; }
  for (var k in o) if (k.slice(0, 2) !== '__') o[k] = fixRefs(o[k]);
  return o;
}
function idToIndex(id) { var L = needDoc().layers; for (var i = 0; i < L.length; i++) if (L[i].id === id) return i; throw PSError('没有 ID 为 ' + id + ' 的图层', 8800); }
function itemToIndex(n) { var D = needDoc(); return D.hasBackground ? n : n - 1; }
function execJ(ev, desc, dialog) {
  if (ev === 'getd') return executeActionGetJ(desc && desc['null']);
  var r = hmut('exec', { event: ev, desc: fixRefs(desc || { __name: '', __classID: 'null' }), dialog: !!dialog });
  return r && r.desc ? r.desc : { __name: '', __classID: 'null' };
}
function executeAction(e, d, mode) {
  var ev = keyOf(e), J = d ? descToJ(d) : { __name: '', __classID: 'null' };
  return descFromJ(execJ(ev, J, String(mode || '') === DialogModes.ALL));
}
G.executeAction = executeAction;

/* executeActionGet：直接按图层表 / 文档信息拼描述符（与 PS 返回的键同名同类型） */
function layerDesc(D, i) {
  var L = D.layers[i], b = L.bounds;
  var rect = function (q) { return { __name: '', __classID: 'Rctn', 'Top ': { __unit: '#Pxl', value: q[1] }, Left: { __unit: '#Pxl', value: q[0] }, Btom: { __unit: '#Pxl', value: q[3] }, Rght: { __unit: '#Pxl', value: q[2] },
    Wdth: { __unit: '#Pxl', value: q[2] - q[0] }, Hght: { __unit: '#Pxl', value: q[3] - q[1] } }; };
  var o = { __name: '', __classID: 'Lyr ', 'Nm  ': L.name, LyrI: L.id, ItmI: D.hasBackground ? i : i + 1, Vsbl: !!L.visible, Opct: { __unit: '#Prc', value: L.opacity },
    fillOpacity: { __unit: '#Prc', value: L.fillOpacity }, 'Md  ': { __enumType: 'BlnM', value: blendEnum(L.blend) }, bounds: rect(b), boundsNoEffects: rect(L.boundsNoFx || b),
    Bckg: !!L.isBackground, group: !!L.clip, layerKind: KIND_NUM[L.group === 'head' ? 'group' : L.kind] || 1,
    layerSection: { __enumType: 'layerSectionType', value: L.group === 'head' ? 'layerSectionStart' : L.group === 'end' ? 'layerSectionEnd' : 'layerSectionContent' },
    count: L.group === 'head' ? children(new Document(D.uid), { _idx: function () { return i; } }).length : 0, parentLayerID: L.parent === null || L.parent === undefined ? -1 : D.layers[L.parent].id,
    hasUserMask: !!L.mask, hasVectorMask: !!L.vectorMask, visible: !!L.visible, layerFXVisible: true, artboardEnabled: !!L.artboard };
  o.__long = { LyrI: true, ItmI: true, layerKind: true, count: true, parentLayerID: true };
  if (L.text) o.Txt = { __name: '', __classID: 'TxLr', 'Txt ': L.text.contents || '', textKey: L.text.contents || '' };
  return o;
}
var KIND_NUM = { pixel: 1, adjustment: 2, text: 3, shape: 4, smartObject: 5, video: 6, group: 7, threeD: 8, solidFill: 11, gradientFill: 11, patternFill: 11 };
function blendEnum(k) { var p = { norm: 'Nrml', diss: 'Dslv', dark: 'Drkn', 'mul ': 'Mltp', idiv: 'CBrn', lbrn: 'linearBurn', dkCl: 'darkerColor', lite: 'Lghn', scrn: 'Scrn', 'div ': 'CDdg', lddg: 'linearDodge', lgCl: 'lighterColor',
  over: 'Ovrl', sLit: 'SftL', hLit: 'HrdL', vLit: 'vividLight', lLit: 'linearLight', pLit: 'pinLight', hMix: 'hardMix', diff: 'Dfrn', smud: 'Xclu', fsub: 'blendSubtraction', fdiv: 'blendDivide', 'hue ': 'H   ', 'sat ': 'Strt', colr: 'Clr ', 'lum ': 'Lmns', pass: 'passThrough' }; return p[k] || 'Nrml'; }
function docDesc(D) {
  var o = { __name: '', __classID: 'Dcmn', Ttl: D.name, DocI: D.id, Wdth: { __unit: '#Rlt', value: D.width * 72 / D.resolution }, Hght: { __unit: '#Rlt', value: D.height * 72 / D.resolution },
    Rslt: { __unit: '#Rsl', value: D.resolution }, numberOfLayers: D.layers.length - (D.hasBackground ? 1 : 0), hasBackgroundLayer: !!D.hasBackground,
    'Md  ': { __enumType: 'Md  ', value: { 1: 'Grys', 3: 'RGBM', 4: 'CMYM', 9: 'LbCM' }[D.mode] || 'RGBM' }, Dpth: D.depth, IsDr: !!D.dirty, ItmI: D.index + 1, targetLayers: (D.selected || []).map(function (i) {
      return { __reference: [{ type: 'indx', cls: { name: '', cid: 'Lyr ' }, index: D.hasBackground ? i : i - 1 }] }; }) };
  if (D.selection) o.selection = { __name: '', __classID: 'Rctn', 'Top ': { __unit: '#Pxl', value: D.selection[1] }, Left: { __unit: '#Pxl', value: D.selection[0] }, Btom: { __unit: '#Pxl', value: D.selection[3] }, Rght: { __unit: '#Pxl', value: D.selection[2] } };
  o.__long = { DocI: true, numberOfLayers: true, Dpth: true, ItmI: true };
  return o;
}
function appDesc() { var I = info(); var c = function (rgb) { return { __name: '', __classID: 'RGBC', 'Rd  ': rgb[0], 'Grn ': rgb[1], 'Bl  ': rgb[2] }; };
  return { __name: '', __classID: 'capp', FrgC: c(I.fg), BckC: c(I.bg), numberOfDocuments: I.docs.length, hostName: 'Adobe Photoshop', hostVersion: { __name: '', __classID: 'null', versionMajor: 27, versionMinor: 0, versionFix: 0 }, __long: { numberOfDocuments: true } }; }
function executeActionGetJ(ref) {
  var R = ref && ref.__reference ? ref.__reference : []; if (!R.length) throw PSError('executeActionGet：空引用', 8500);
  var prop = null, k = 0; if (R[0].type === 'prop') { prop = R[0].key; k = 1; }
  var t = R[k] || { cls: { cid: 'capp' }, type: 'Enmr', value: 'Trgt' }, cls = t.cls && t.cls.cid, res, I = info();
  if (cls === 'Lyr ') {
    var D = needDoc(), i;
    if (t.type === 'Enmr') { i = t.value === 'Trgt' || t.value === 'Frst' ? D.active : t.value === 'Frnt' ? D.layers.length - 1 : t.value === 'Back' ? 0 : D.active; }
    else if (t.type === 'Idnt') i = idToIndex(t.id);
    else if (t.type === 'indx') i = itemToIndex(t.index);
    else if (t.type === 'name') { i = -1; for (var q = D.layers.length - 1; q >= 0; q--) if (D.layers[q].name === t.name) { i = q; break; } }
    if (i === undefined || i < 0 || !D.layers[i]) throw PSError('找不到要读的图层', 8800);
    res = layerDesc(D, i);
  } else if (cls === 'Dcmn') {
    var d = I.doc;
    if (t.type === 'indx' || t.type === 'Idnt' || t.type === 'name') { var hit = I.docs.filter(function (x, n) { return t.type === 'indx' ? n + 1 === t.index : t.type === 'Idnt' ? x.id === t.id : x.name === t.name; })[0];
      if (!hit) throw PSError('找不到要读的文档', 8800); if (!d || hit.uid !== d.uid) { hmut('activateDoc', { uid: hit.uid }); d = info().doc; } }
    if (!d) throw PSError('没有打开的文档', 8007);
    res = docDesc(d);
  } else if (cls === 'capp') res = appDesc();
  else if (cls === 'Chnl' && prop === 'fsel') { var dd = needDoc(); res = { __name: '', __classID: 'Chnl' }; if (dd.selection) res.fsel = docDesc(dd).selection; return res; }
  else throw PSError('executeActionGet 暂不支持读「' + (cls || '?') + '」', 8500);
  if (prop) { var o = { __name: '', __classID: res.__classID }; if (!(prop in res)) throw PSError('属性 ' + strOfKey(prop) + ' 不可读', 8500); o[prop] = res[prop]; if (res.__long && res.__long[prop]) o.__long = { }, o.__long[prop] = true; return o; }
  return res;
}
function executeActionGet(r) { return descFromJ(executeActionGetJ(refToJ(r))); }
G.executeActionGet = executeActionGet;

/* ============================ UXP（require('photoshop')） ============================ */
/* batchPlay 的 JSON 写法 ⇄ 本项目描述符 */
function bpVal(v, host, key) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return v.map(function (x, n) { return bpVal(x, v, n); });
  if (typeof v === 'number') { if (Number.isInteger(v)) (host.__long || (host.__long = {}))[key] = true; else (host.__doub || (host.__doub = {}))[key] = true; return v; }
  if (typeof v !== 'object') return v;
  if ('_unit' in v) return { __unit: keyOfStr(v._unit), value: +v._value };
  if ('_enum' in v) return { __enumType: keyOfStr(v._enum), value: keyOfStr(v._value) };
  if ('_class' in v) return { __class: keyOfStr(v._class), __name: '' };
  if ('_path' in v) return { __path: v._path };
  if ('_ref' in v) return { __reference: bpRefs([v]) };
  return bpDesc(v);
}
function bpRefs(t) {
  if (!Array.isArray(t)) t = [t];
  return t.map(function (r) {
    if (typeof r === 'string') return { type: 'Clss', cls: { name: '', cid: keyOfStr(r) } };
    var cls = { name: '', cid: keyOfStr(r._ref || 'null') };
    if ('_property' in r) return { type: 'prop', cls: cls, key: keyOfStr(r._property) };
    if ('_enum' in r) return { type: 'Enmr', cls: cls, enumType: keyOfStr(r._enum), value: keyOfStr(r._value) };
    if ('_id' in r) return { type: 'Idnt', cls: cls, id: +r._id };
    if ('_index' in r) return { type: 'indx', cls: cls, index: +r._index };
    if ('_name' in r) return { type: 'name', cls: cls, name: String(r._name) };
    if ('_offset' in r) return { type: 'rele', cls: cls, offset: +r._offset };
    return { type: 'Clss', cls: cls };
  });
}
function bpDesc(o) {
  var d = { __name: '', __classID: keyOfStr(o._obj || 'null') };
  for (var k in o) { if (k.charAt(0) === '_') continue; var v = bpVal(o[k], d, keyOfStr(k)); if (v !== undefined) d[keyOfStr(k)] = v; }
  if (o._target) d['null'] = { __reference: bpRefs(o._target) };
  return d;
}
function jToBp(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(jToBp);
  if (v.__unit) return { _unit: strOfKey(v.__unit), _value: v.value };
  if (v.__enumType) return { _enum: strOfKey(v.__enumType), _value: strOfKey(v.value) };
  if (v.__class !== undefined) return { _class: strOfKey(v.__class) };
  if (v.__reference) return v.__reference.map(function (r) { var o = { _ref: strOfKey(r.cls && r.cls.cid || 'null') };
    if (r.type === 'prop') o._property = strOfKey(r.key); else if (r.type === 'Enmr') { o._enum = strOfKey(r.enumType); o._value = strOfKey(r.value); } else if (r.type === 'Idnt') o._id = r.id; else if (r.type === 'indx') o._index = r.index; else if (r.type === 'name') o._name = r.name; return o; });
  var o = {}; if (v.__classID && v.__classID !== 'null') o._obj = strOfKey(v.__classID);
  for (var k in v) if (k.slice(0, 2) !== '__') o[strOfKey(k)] = jToBp(v[k]);
  return o;
}
function batchPlayOne(o) {
  var ev = keyOfStr(o._obj), d = bpDesc(o);
  if (ev === 'getd') return hdoP('sync', {}).then(function () { return jToBp(executeActionGetJ(d['null'])); });
  return hdoP('exec', { event: ev, desc: fixRefs(d), dialog: o._options && o._options.dialogOptions === 'display' }).then(function (r) { return jToBp(r && r.desc ? r.desc : {}); });
}
function batchPlay(list, opts) {
  var out = [], i = 0;
  if (opts && opts.synchronousExecution) { /* 同步版：只支持 get（读），写操作照样排队 */
    return list.map(function (o) { if (keyOfStr(o._obj) === 'getd') return jToBp(executeActionGetJ(bpDesc(o)['null'])); hmut('exec', { event: keyOfStr(o._obj), desc: fixRefs(bpDesc(o)) }); return {}; }); }
  function step() { if (i >= list.length) return Promise.resolve(out); var r = batchPlayOne(list[i++]); return Promise.resolve(r).then(function (v) { out.push(v); return step(); }, function (e) { out.push({ _obj: 'error', message: String(e && e.message || e), result: -1 }); return step(); }); }
  return step();
}
/* UXP 的 DOM：薄薄一层，包在上面的 ExtendScript 对象外面（属性名照 UXP） */
function uxpLayer(l) {
  if (!l) return null;
  var o = { _l: l, typename: 'Layer' };
  var p = function (name, get, set) { Object.defineProperty(o, name, { get: get, set: set, enumerable: true }); };
  p('name', function () { return l.name; }, function (v) { l.name = v; });
  p('visible', function () { return l.visible; }, function (v) { l.visible = v; });
  p('opacity', function () { return l.opacity; }, function (v) { l.opacity = v; });
  p('fillOpacity', function () { return l.fillOpacity; }, function (v) { l.fillOpacity = v; });
  p('blendMode', function () { return String(l._L().blend ? BLEND_REV[l._L().blend] : BlendMode.NORMAL).replace(/^BlendMode\./, '').toLowerCase(); }, function (v) { l.blendMode = 'BlendMode.' + String(v).toUpperCase().replace(/[^A-Z]/g, ''); });
  p('id', function () { return l.id; });
  p('kind', function () { var L = l._L(); return L.group === 'head' ? 'group' : (KIND_MAP[L.kind] || 'NORMAL').toLowerCase().replace('smartobject', 'smartObject').replace('solidfill', 'solidColor'); });
  p('bounds', function () { var b = l._L().bounds; return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: b[2] - b[0], height: b[3] - b[1] }; });
  p('boundsNoEffects', function () { return o.bounds; });
  p('isBackgroundLayer', function () { return l.isBackgroundLayer; });
  p('locked', function () { return l.allLocked; }, function (v) { l.allLocked = v; });
  p('parent', function () { var q = l._L().parent; return q === null || q === undefined ? null : uxpLayer(layerAt(l._doc, q)); });
  p('layers', function () { return l._L().group === 'head' ? l.layers.map(uxpLayer) : undefined; });
  p('textItem', function () { var t = l.textItem; return { get contents() { return t.contents; }, set contents(v) { t.contents = v; }, isTextLayer: true }; });
  p('document', function () { return uxpDoc(l._doc); });
  o.delete = function () { l.remove(); return Promise.resolve(); };
  o.duplicate = function () { var r = hdoP('duplicateLayer', { i: l._idx() }); return r.then(function (x) { return uxpLayer(layerAt(l._doc, x.index)); }); };
  o.translate = function (x, y) { l.translate(new UnitValue(+x, 'px'), new UnitValue(+y, 'px')); return Promise.resolve(); };
  o.move = function (rel, place) { l.move(rel._l || rel, 'ElementPlacement.' + String(place || 'placeBefore').toUpperCase()); return Promise.resolve(); };
  o.rasterize = function () { l.rasterize(); return Promise.resolve(); };
  o.applyGaussianBlur = function (r) { l.applyGaussianBlur(r); return Promise.resolve(); };
  o.scale = function (w, h) { l.resize(w, h); return Promise.resolve(); };
  o.rotate = function (a) { l.rotate(a); return Promise.resolve(); };
  o.merge = function () { l.merge(); return Promise.resolve(); };
  return o;
}
function uxpDoc(d) {
  if (!d) return null;
  var o = { _d: d, typename: 'Document' };
  var p = function (name, get, set) { Object.defineProperty(o, name, { get: get, set: set, enumerable: true }); };
  p('id', function () { return d.id; }); p('name', function () { return d.name; }); p('title', function () { return d.name; });
  p('width', function () { return docInfo(d).width; }); p('height', function () { return docInfo(d).height; }); p('resolution', function () { return d.resolution; });
  p('layers', function () { return d.layers.map(uxpLayer); });
  p('activeLayers', function () { var D = docInfo(d); return (D.selected && D.selected.length ? D.selected : D.active >= 0 ? [D.active] : []).map(function (i) { return uxpLayer(layerAt(d, i)); }); });
  p('saved', function () { return d.saved; });
  p('mode', function () { return String(d.mode).replace(/^DocumentMode\./, '').toLowerCase() + 'Mode'; });
  p('selection', function () { var b = docInfo(d).selection; return { bounds: b ? { left: b[0], top: b[1], right: b[2], bottom: b[3] } : null, selectAll: function () { d.selection.selectAll(); return Promise.resolve(); }, deselect: function () { d.selection.deselect(); return Promise.resolve(); } }; });
  o.createLayer = function (opts) { opts = opts || {}; return hdoP('newLayer', { name: opts.name, opacity: opts.opacity, blend: opts.blendMode ? blendKeyOf('BlendMode.' + String(opts.blendMode).toUpperCase()) : undefined }).then(function (r) { return uxpLayer(layerAt(d, r.index)); }); };
  o.createPixelLayer = o.createLayer;
  o.createLayerGroup = function (opts) { opts = opts || {}; return hdoP('newGroup', { name: opts.name }).then(function (r) { return uxpLayer(layerAt(d, r.index)); }); };
  o.resizeImage = function (w, h, r) { d.resizeImage(new UnitValue(+w, 'px'), h === undefined ? undefined : new UnitValue(+h, 'px'), r); return Promise.resolve(); };
  o.resizeCanvas = function (w, h, a) { d.resizeCanvas(new UnitValue(+w, 'px'), new UnitValue(+h, 'px'), a ? 'AnchorPosition.' + String(a).toUpperCase() : undefined); return Promise.resolve(); };
  o.crop = function (b) { d.crop([new UnitValue(b.left, 'px'), new UnitValue(b.top, 'px'), new UnitValue(b.right, 'px'), new UnitValue(b.bottom, 'px')]); return Promise.resolve(); };
  o.rotate = function (a) { d.rotateCanvas(a); return Promise.resolve(); };
  o.flatten = function () { d.flatten(); return Promise.resolve(); };
  o.mergeVisibleLayers = function () { d.mergeVisibleLayers(); return Promise.resolve(); };
  o.trim = function (t) { d.trim(t); return Promise.resolve(); };
  o.save = function () { return hdoP('save', { format: 'psd' }); };
  o.saveAs = { psd: function (f) { return hdoP('save', { format: 'psd', name: f && f.name }); }, png: function (f) { return hdoP('save', { format: 'png', name: f && f.name }); },
    jpg: function (f, op) { return hdoP('save', { format: 'jpg', name: f && f.name, quality: op && op.quality !== undefined ? Math.round(op.quality / 12 * 100) : undefined }); },
    gif: function (f) { return hdoP('save', { format: 'gif', name: f && f.name }); }, bmp: function (f) { return hdoP('save', { format: 'bmp', name: f && f.name }); } };
  o.close = function (opt) { return hdoP('closeDoc', { uid: d._uid, discard: !/save/i.test(String(opt || '')) }); };
  o.closeWithoutSaving = function () { return hdoP('closeDoc', { uid: d._uid, discard: true }); };
  o.duplicate = function (name) { return hdoP('duplicateDoc', { name: name }).then(function (r) { return uxpDoc(new Document(r.uid)); }); };
  return o;
}
var uxpApp = { typename: 'Photoshop', version: '27.0.0',
  get activeDocument() { var d = info().doc; return d ? uxpDoc(new Document(d.uid)) : null; }, set activeDocument(x) { activate(x._d); },
  get documents() { return curDocs().map(function (x) { return uxpDoc(new Document(x.uid)); }); },
  get foregroundColor() { return colorOf(info().fg); }, set foregroundColor(c) { app.foregroundColor = c; },
  get backgroundColor() { return colorOf(info().bg); }, set backgroundColor(c) { app.backgroundColor = c; },
  showAlert: function (m) { return hdoP('alert', { message: String(m) }); },
  createDocument: function (o) { o = o || {}; return hdoP('newDocument', { width: o.width || 1000, height: o.height || 800, resolution: o.resolution || 72, name: o.name, mode: String(o.mode || 'rgb').replace(/ColorMode$/i, '').toLowerCase(), fill: String(o.fill || 'white').toLowerCase() }).then(function (r) { return uxpDoc(new Document(r.uid)); }); },
  open: function (f) { if (!f || f._id === undefined) return Promise.reject(PSError('只能打开用 getFileForOpening 选过的文件')); return hdoP('openFile', { id: f._id }).then(function (r) { return uxpDoc(new Document(r.uid)); }); },
  batchPlay: batchPlay };
var core = {
  executeAsModal: function (fn, opts) { var ctx = { hostControl: { suspendHistory: function () { return Promise.resolve(1); }, resumeHistory: function () { return Promise.resolve(); } }, reportProgress: function () {}, isCancelled: false };
    return Promise.resolve().then(function () { return fn(ctx, opts && opts.descriptor); }); },
  showAlert: function (o) { return hdoP('alert', { message: String(o && o.message !== undefined ? o.message : o) }); },
  suspendHistory: function () { return Promise.resolve(1); }, resumeHistory: function () { return Promise.resolve(); },
  getActiveTool: function () { return Promise.resolve({ title: '' }); }, performMenuCommand: function (o) { return hdoP('command', { psMenu: o && o.commandID }); },
  isModal: function () { return false; }, setExecutionMode: function () {}, redrawDocument: function () { return Promise.resolve(); }
};
var constants = { BlendMode: {}, ElementPlacement: { PLACEATBEGINNING: 'placeAtBeginning', PLACEATEND: 'placeAtEnd', PLACEBEFORE: 'placeBefore', PLACEAFTER: 'placeAfter', PLACEINSIDE: 'placeInside' },
  AnchorPosition: { TOPLEFT: 'topLeft', TOPCENTER: 'topCenter', TOPRIGHT: 'topRight', MIDDLELEFT: 'middleLeft', MIDDLECENTER: 'middleCenter', MIDDLERIGHT: 'middleRight', BOTTOMLEFT: 'bottomLeft', BOTTOMCENTER: 'bottomCenter', BOTTOMRIGHT: 'bottomRight' },
  ResampleMethod: { BICUBIC: 'bicubic', BILINEAR: 'bilinear', NEARESTNEIGHBOR: 'nearestNeighbor', AUTOMATIC: 'automatic', PRESERVEDETAILS: 'preserveDetails' },
  LayerKind: { NORMAL: 'pixel', TEXT: 'text', GROUP: 'group', SMARTOBJECT: 'smartObject', SOLIDCOLOR: 'solidColor' }, SaveOptions: { DONOTSAVECHANGES: 'doNotSaveChanges', SAVECHANGES: 'saveChanges' },
  DocumentFill: { WHITE: 'white', TRANSPARENT: 'transparent', BACKGROUNDCOLOR: 'backgroundColor' }, NewDocumentMode: { RGB: 'RGBColorMode', GRAYSCALE: 'grayscaleMode', CMYK: 'CMYKColorMode' },
  TrimType: { TRANSPARENT: 'transparency', TOPLEFT: 'topLeftPixelColor', BOTTOMRIGHT: 'bottomRightPixelColor' } };
for (var bk2 in BLEND) constants.BlendMode[bk2] = bk2.toLowerCase();
var photoshop = { app: uxpApp, action: { batchPlay: batchPlay,
  addNotificationListener: function () { return Promise.reject(PSError('action.addNotificationListener 暂不支持')); },
  removeNotificationListener: function () { return Promise.reject(PSError('action.removeNotificationListener 暂不支持')); },
  validateReference: function () { return Promise.reject(PSError('action.validateReference 暂不支持')); } },
  core: core, constants: constants, imaging: { getPixels: function () { return Promise.reject(PSError('imaging API 暂不支持')); } } };
uxpApp.batchPlay = batchPlay;
function uxpFile(f) { if (!f) return null; return { _id: f._id, name: f.name, nativePath: f.name, isFile: true, isFolder: false,
  read: function () { return hdoP('readText', { id: f._id }).then(function (r) { return r.text; }); }, write: function (t) { return hdoP('writeText', { name: f.name, text: String(t) }); } }; }
var uxp = { storage: { localFileSystem: {
    getFileForOpening: function (o) { o = o || {}; return hdoP('pickFiles', { multi: !!o.allowMultiple, filter: (o.types || []).join(';') }).then(function (r) { var l = pickedFiles(r.files).map(uxpFile); return o.allowMultiple ? l : l[0] || null; }); },
    getFileForSaving: function (name) { return Promise.resolve({ name: name || 'untitled', isFile: true, write: function (t) { return hdoP('writeText', { name: name || 'untitled.txt', text: String(t) }); } }); },
    getFolder: function () { return hdoP('pickFiles', { folder: true, multi: true }).then(function (r) { var l = pickedFiles(r.files).map(uxpFile); return { isFolder: true, name: r.folder || '所选文件夹', getEntries: function () { return Promise.resolve(l); } }; }); },
    getTemporaryFolder: function () { return Promise.reject(PSError('没有临时文件夹')); }, getDataFolder: function () { return Promise.reject(PSError('没有数据文件夹')); }, getPluginFolder: function () { return Promise.reject(PSError('没有插件文件夹')); } },
    formats: { utf8: 'utf8', binary: 'binary' }, types: { file: 'file', folder: 'folder' }, modes: { readOnly: 'readOnly', readWrite: 'readWrite' } },
  entrypoints: { setup: function () {} }, shell: { openExternal: function () { return Promise.reject(PSError('脚本不能打开外部链接')); } }, host: { name: 'Photoshop', version: '27.0.0' }, script: { args: [], setResult: function (v) { G.__result = v; } } };
G.require = function (n) { if (n === 'photoshop') return photoshop; if (n === 'uxp') return uxp; if (n === 'os') return { platform: function () { return 'browser'; } }; throw PSError('沙箱里没有模块「' + n + '」（可用：photoshop / uxp）'); };
G.setTimeout = function (fn, ms) { return hdoP('sleep', { ms: Math.min(5000, +ms || 0) }).then(function () { fn(); }); };
})(globalThis);
`;
export default GUEST;
