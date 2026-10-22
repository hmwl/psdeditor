








































import { serializeDescriptor } from './psd-descriptor.js';
import { Reader, readDescriptor, parseTyShData, buildTyShFromText, removeGlobalBlocks } from './psd-parse.js';
const removeGlobalBlocksInto = ab => removeGlobalBlocks(ab, ['Txt2']);
import { parseEngineData } from './engine-data.js';
import { setEngineStyle, setEngineFont, setEngineParagraphBox } from './psd-text.js';
import { textTemplateBytes } from './text-template.js';
import { FX_EFFECTS, resolveEffectName } from './psd-edit-fx.js';
import { contourDescFrom } from './contour.js';
import { parseAdditionalBlock, writeAdditionalBlock } from './psd-additional.js';
import { normalizeSubpathInput, freshPathRecords, getVectorMaskPath } from './psd-edit-path.js';




const FX_BLOCK_KEYS = ['lmfx', 'lfx2', 'lfxs'];

const LEGACY_FX_KEY = 'lrFX';

const NEW_FX_BLOCK_KEY = 'lfx2';



const pct = v => ({ __unit: '#Prc', value: v });
const pxl = v => ({ __unit: '#Pxl', value: v });
const ang = v => ({ __unit: '#Ang', value: v });
const enm = (type, value) => ({ __enumType: type, value });

const rgb = (r, g, b) => ({
  __name: '', __classID: 'RGBC',
  __doub: { 'Rd  ': true, 'Grn ': true, 'Bl  ': true },
  'Rd  ': r, 'Grn ': g, 'Bl  ': b,
});

const lab = (l, a, b) => ({
  __name: '', __classID: 'LABC',
  __long: { 'Lmnc': true, 'A   ': true, 'B   ': true },
  'Lmnc': l, 'A   ': a, 'B   ': b,
});

const isMeta = k => k.startsWith('__');
const dataKeys = o => Object.keys(o).filter(k => !isMeta(k));
const hex1 = n => '0x' + (n & 0xff).toString(16).padStart(2, '0');


function isEffectObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array)
    && v.__unit === undefined && v.__enumType === undefined && v.__class === undefined
    && v.__reference === undefined;
}





function insertKeyBefore(desc, key, value, before) {
  if (!Object.prototype.hasOwnProperty.call(desc, before)) {
    const out = { ...desc };
    out[key] = value;
    return out;
  }
  const out = {};
  for (const k of Object.keys(desc)) {
    if (k === before) out[key] = value;
    out[k] = desc[k];
  }
  return out;
}


function renameKeyInPlace(desc, oldKey, newKey, value) {
  const out = {};
  for (const k of Object.keys(desc)) {
    if (k === oldKey) out[newKey] = value;
    else out[k] = desc[k];
  }
  return out;
}


function dropKey(desc, key) {
  const out = {};
  for (const k of Object.keys(desc)) if (k !== key) out[k] = desc[k];
  return out;
}



function csum(u8) { let s = 0; for (let i = 0; i < u8.length; i++) s = (s * 31 + u8[i]) >>> 0; return s; }
const numStr = v => (Object.is(v, -0) ? '-0' : String(v));







function flatten(node, prefix, out, host, key) {
  out = out || {};
  if (node instanceof Uint8Array) { out[prefix] = `bytes:${node.length}:${csum(node)}`; return out; }
  if (Array.isArray(node)) {
    out[prefix + '#len'] = 'n:' + node.length;
    for (let i = 0; i < node.length; i++) flatten(node[i], prefix ? `${prefix}.${i}` : String(i), out, node, i);
    return out;
  }
  if (node !== null && typeof node === 'object') {
    if (node.__unit && Array.isArray(node.values)) { out[prefix] = `UnFl ${node.__unit}:${node.values.map(numStr).join(',')}`; return out; }
    if (node.__unit !== undefined) { out[prefix] = `UntF ${node.__unit}:${numStr(node.value)}`; return out; }
    if (node.__enumType !== undefined) { out[prefix] = `enum ${node.__enumType}.${node.value}`; return out; }
    if (node.__class !== undefined) { out[prefix] = `type:${node.__class}|${node.__name || ''}`; return out; }
    if (node.__reference !== undefined) { out[prefix] = 'ref:' + JSON.stringify(node.__reference); return out; }
    const keys = dataKeys(node);
    out[prefix + '#cls'] = `cls:${node.__classID || ''}|${node.__name || ''}`;
    out[prefix + '#keys'] = keys.join(',');
    for (const k of keys) flatten(node[k], prefix ? `${prefix}.${k}` : k, out, node, k);
    return out;
  }
  if (typeof node === 'boolean') { out[prefix] = 'bool:' + node; return out; }
  if (typeof node === 'string') { out[prefix] = 'TEXT:' + node; return out; }
  if (typeof node === 'number') {
    const t = host && host.__comp && host.__comp[key] ? 'comp'
      : host && host.__long && host.__long[key] ? 'long'
        : host && host.__doub && host.__doub[key] ? 'doub' : 'num';
    out[prefix] = `${t}:${numStr(node)}`;
    return out;
  }
  out[prefix] = 'other:' + String(node);
  return out;
}

function flatDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) if (a[k] !== b[k]) out.push(`${k}: ${a[k] === undefined ? '（无）' : a[k]} → ${b[k] === undefined ? '（无）' : b[k]}`);
  out.sort();
  return out;
}


















const linearContour = () => ({ __name: '', __classID: 'ShpC', 'Nm  ': '', 'Crv ': [] });

const FX_TEMPLATE = {
  
  dropShadow: () => ({
    __name: '', __classID: 'DrSh',
    enab: true,
    'TrnS': linearContour(),
    present: true, showInDialog: true,
    blur: pxl(5),          
    lagl: ang(120),        
    'Dstn': pxl(5),        
    'Clr ': rgb(0, 0, 0),
    'Md  ': enm('BlnM', 'Mltp'),
    'Opct': pct(75),
    uglg: true,            
    'AntA': false,
    'Ckmt': pxl(0),        
    layerConceals: true,   
  }),
  
  innerShadow: () => ({
    __name: '', __classID: 'IrSh',
    enab: true,
    'TrnS': linearContour(),
    present: true, showInDialog: true,
    blur: pxl(5), lagl: ang(120), 'Dstn': pxl(5),
    'Clr ': rgb(0, 0, 0),
    'Md  ': enm('BlnM', 'Mltp'),
    'Opct': pct(75),
    uglg: true, 'AntA': false,
    'Ckmt': pxl(0),        
  }),
  
  outerGlow: () => ({
    __name: '', __classID: 'OrGl',
    enab: true,
    'TrnS': linearContour(),
    present: true, showInDialog: true,
    blur: pxl(5),
    'Clr ': rgb(255, 255, 190),
    'Md  ': enm('BlnM', 'Scrn'),
    'Opct': pct(75),
    glwS: enm('IGSr', 'SrcE'),   
    'AntA': false,
    'Nose': pct(0),
    'Inpr': pct(50),             
    'Ckmt': pxl(0),              
    'ShdN': pct(0),              
  }),
  
  innerGlow: () => ({
    __name: '', __classID: 'IrGl',
    enab: true,
    'TrnS': linearContour(),
    present: true, showInDialog: true,
    blur: pxl(5),
    'Clr ': rgb(255, 255, 190),
    'Md  ': enm('BlnM', 'Scrn'),
    'Opct': pct(75),
    glwS: enm('IGSr', 'SrcE'),
    'GlwT': enm('BETE', 'SfBL'),   
    'AntA': false,
    'Nose': pct(0), 'Inpr': pct(50), 'Ckmt': pxl(0), 'ShdN': pct(0),
  }),
  
  
  bevelEmboss: () => ({
    __name: '', __classID: 'ebbl',
    enab: true,
    'TrnS': linearContour(),        
    'MpgS': linearContour(),        
    present: true, showInDialog: true,
    blur: pxl(5),                   
    lagl: ang(120),
    srgR: pct(100),                 
    hglM: enm('BlnM', 'Scrn'),
    sdwM: enm('BlnM', 'Mltp'),
    hglC: rgb(255, 255, 255),
    sdwC: rgb(0, 0, 0),
    bvlS: enm('BESl', 'InrB'),      
    hglO: pct(75), sdwO: pct(75),
    'Sftn': pxl(0),                 
    uglg: true,
    'Lald': ang(30),                
    bvlT: enm('bvlT', 'SfBL'),      
    bvlD: enm('BESs', 'In  '),      
    useTexture: false, useShape: false, antialiasGloss: false,
  }),
  
  satin: () => ({
    __name: '', __classID: 'ChFX',
    enab: true,
    'MpgS': linearContour(),        
    present: true, showInDialog: true,
    blur: pxl(14),
    'Md  ': enm('BlnM', 'Mltp'),
    'Clr ': rgb(0, 0, 0),
    'AntA': true,
    'Opct': pct(50),
    'Dstn': pxl(11),
    'Invr': true,
    lagl: ang(19),
  }),
  
  colorOverlay: () => ({
    __name: '', __classID: 'SoFi',
    enab: true,
    present: true, showInDialog: true,
    'Md  ': enm('BlnM', 'Nrml'),
    'Clr ': rgb(255, 0, 0),
    'Opct': pct(100),
  }),
  
  
  gradientOverlay: () => ({
    __name: '', __classID: 'GrFl',
    enab: true,
    present: true, showInDialog: true,
    'Md  ': enm('BlnM', 'Nrml'),
    'Opct': pct(100),
    'Algn': true,
    'Scl ': pct(100),
    'Dthr': false,
    'Rvrs': false,
    'Type': enm('GrdT', 'Lnr '),
    'Ofst': { __name: '', __classID: 'Pnt ', 'Hrzn': pct(0), 'Vrtc': pct(0) },
    'Grad': {
      __name: 'Gradient', __classID: 'Grdn',
      __doub: { 'Intr': true },
      'Nm  ': '黑, 白',
      'GrdF': enm('GrdF', 'CstS'),
      'Intr': 4096,                       
      'Clrs': [gradStop(rgb(0, 0, 0), 0), gradStop(rgb(255, 255, 255), 4096)],
      'Trns': [transStop(0), transStop(4096)],
    },
    gs99: enm('gradientInterpolationMethodType', 'Gcls'),
    'Angl': ang(90),
  }),
  
  patternOverlay: () => ({
    __name: '', __classID: 'patternFill',
    enab: true,
    present: true, showInDialog: true,
    'Md  ': enm('BlnM', 'Nrml'),
    'Opct': pct(100),
    'Scl ': pct(100),
    'Ptrn': { __name: '', __classID: 'Ptrn', 'Nm  ': '', 'Idnt': '' },
    phase: { __name: '', __classID: 'Pnt ', __doub: { 'Hrzn': true, 'Vrtc': true }, 'Hrzn': 0, 'Vrtc': 0 },
    'Algn': true,
  }),
  
  
  stroke: () => ({
    __name: '', __classID: 'FrFX',
    enab: true,
    present: true, showInDialog: true,
    'Styl': enm('FStl', 'OutF'),   
    'PntT': enm('FrFl', 'SClr'),   
    'Md  ': enm('BlnM', 'Nrml'),
    'Opct': pct(100),
    'Sz  ': pxl(3),
    'Clr ': rgb(255, 0, 0),
    overprint: false,
  }),
};

function gradStop(color, location) {
  return {
    __name: '', __classID: 'Clrt',
    __long: { 'Lctn': true, 'Mdpn': true },
    'Clr ': color,
    'Type': enm('Clry', 'UsrS'),
    'Lctn': location,
    'Mdpn': 50,
  };
}
function transStop(location) {
  return {
    __name: '', __classID: 'TrnS',
    __long: { 'Lctn': true, 'Mdpn': true },
    'Opct': pct(100),
    'Lctn': location,
    'Mdpn': 50,
  };
}













function pickNum(vals, used, name, def, min, max, fail, { int = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(vals, name)) return def;
  used.add(name);
  const v = vals[name];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw fail(`values.${name} 必须是有限数值，收到 ${JSON.stringify(v)}`);
  if (int && !Number.isInteger(v)) throw fail(`values.${name} 必须是整数，收到 ${v}`);
  if (v < min || v > max) throw fail(`values.${name} = ${v} 超出范围 ${min}…${max}`);
  return v;
}
function pickBool(vals, used, name, def, fail) {
  if (!Object.prototype.hasOwnProperty.call(vals, name)) return def;
  used.add(name);
  const v = vals[name];
  if (typeof v !== 'boolean') throw fail(`values.${name} 必须是布尔值，收到 ${JSON.stringify(v)}`);
  return v;
}
function pickTriple(vals, used, name, def, min, max, fail) {
  if (!Object.prototype.hasOwnProperty.call(vals, name)) return def.slice();
  used.add(name);
  const v = vals[name];
  if (!Array.isArray(v) || v.length !== 3) throw fail(`values.${name} 必须是 3 个整数的数组，收到 ${JSON.stringify(v)}`);
  for (const x of v) {
    if (!Number.isInteger(x) || x < min || x > max) throw fail(`values.${name} 的每一项都要是 ${min}…${max} 的整数，收到 ${JSON.stringify(v)}`);
  }
  return v.slice();
}
function pickStr(vals, used, name, def, maxLen, fail) {
  if (!Object.prototype.hasOwnProperty.call(vals, name)) return def;
  used.add(name);
  const v = vals[name];
  if (typeof v !== 'string') throw fail(`values.${name} 必须是字符串，收到 ${JSON.stringify(v)}`);
  if (v.length > maxLen) throw fail(`values.${name} 太长（${v.length} 字符 > ${maxLen}）`);
  return v;
}
function pickEnum(vals, used, name, def, allowed, fail) {
  if (!Object.prototype.hasOwnProperty.call(vals, name)) return def;
  used.add(name);
  const v = vals[name];
  if (typeof v !== 'string' || !allowed.includes(v))
    throw fail(`values.${name} 只能是 ${allowed.join(' / ')} 之一，收到 ${JSON.stringify(v)}`);
  return v;
}





function pickStopList(vals, used, name, def, compCount, compMax, fail) {
  if (!Object.prototype.hasOwnProperty.call(vals, name)) return def.map(s => s.slice());
  used.add(name);
  const v = vals[name];
  if (!Array.isArray(v) || v.length < 2 || v.length > 255)
    throw fail(`values.${name} 必须是 2…255 个色标的数组，收到 ${JSON.stringify(v)}`);
  let prev = -1;
  return v.map(it => {
    if (!Array.isArray(it) || it.length !== compCount + 1)
      throw fail(`values.${name} 的每一项都要是 [位置, ${compCount} 个分量]，收到 ${JSON.stringify(it)}`);
    const loc = it[0];
    if (!Number.isInteger(loc) || loc < 0 || loc > 4096)
      throw fail(`values.${name} 的位置要在 0…4096 之间，收到 ${JSON.stringify(it)}`);
    if (loc < prev) throw fail(`values.${name} 的位置要按从小到大排，${loc} 出现在 ${prev} 之后`);
    prev = loc;
    const comps = it.slice(1).map(c => {
      if (!Number.isInteger(c) || c < 0 || c > compMax)
        throw fail(`values.${name} 的分量要是 0…${compMax} 的整数，收到 ${JSON.stringify(it)}`);
      return c;
    });
    return [loc, ...comps];
  });
}






function srgbToLabD50(r, g, b) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = 0.4360747 * R + 0.3850649 * G + 0.1430804 * B;
  const Y = 0.2225045 * R + 0.7168786 * G + 0.0606169 * B;
  const Z = 0.0139322 * R + 0.0971045 * G + 0.7141733 * B;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(X / 0.96422), fy = f(Y), fz = f(Z / 0.82521);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}


const identityLevelRecord = () => ({ shadowInput: 0, highlightInput: 255, shadowOutput: 0, highlightOutput: 255, midtoneInput: 100 });

const identityCurvePoints = () => [{ output: 0, input: 0 }, { output: 255, input: 255 }];







const HUE_RANGE_DEFAULTS = [
  [315, 345, 15, 45],    
  [15, 45, 75, 105],     
  [75, 105, 135, 165],   
  [135, 165, 195, 225],  
  [195, 225, 255, 285],  
  [255, 285, 315, 345],  
];



const CLRL_TYPES = ['3DLUT', 'abstractProfile', 'deviceLinkProfile', 'abstract', 'deviceLink'];
const CLRL_FORMATS = ['LUTFormatCUBE', 'LUTFormat3DL', 'LUTFormatLOOK', 'LUTFormatICC', 'LUTFormatCSP'];
const CLRL_ORDERS = ['rgbOrder', 'bgrOrder', 'profileDataOrderRGB', 'profileDataOrderBGR'];


const CLRL_TYPE_PS = { abstract: 'abstractProfile', deviceLink: 'deviceLinkProfile' };
const CLRL_ORDER_PS = { profileDataOrderRGB: 'rgbOrder', profileDataOrderBGR: 'bgrOrder' };

const ADJ_KINDS = {
  brightnessContrast: {
    label: '亮度/对比度',
    keys: ['brit', 'CgEd'],
    accepts: 'brightness(-150…150) contrast(-50…100) useLegacy labColorOnly',
    make(vals, used, fail) {
      const brightness = pickNum(vals, used, 'brightness', 0, -150, 150, fail);
      const contrast = pickNum(vals, used, 'contrast', 0, -50, 100, fail);
      const useLegacy = pickBool(vals, used, 'useLegacy', false, fail);
      const labOnly = pickBool(vals, used, 'labColorOnly', false, fail);
      return [
        
        { key: 'brit', model: { brightness, contrast, meanValue: 127, labColorOnly: labOnly } },
        
        {
          key: 'CgEd',
          model: {
            descVersion: 16,
            desc: {
              __name: '', __classID: 'null',
              __long: { 'Vrsn': true, 'Brgh': true, 'Cntr': true, 'means': true },
              'Vrsn': 1, 'Brgh': brightness, 'Cntr': contrast, 'means': 127,
              'Lab ': labOnly, useLegacy, 'Auto': false,
            },
          },
        },
      ];
    },
  },
  levels: {
    label: '色阶',
    keys: ['levl'],
    accepts: 'shadowInput(0…253) highlightInput(2…255) gamma(0.10…9.99) shadowOutput(0…255) highlightOutput(0…255)',
    make(vals, used, fail) {
      const rec = identityLevelRecord();
      rec.shadowInput = pickNum(vals, used, 'shadowInput', 0, 0, 253, fail);
      rec.highlightInput = pickNum(vals, used, 'highlightInput', 255, 2, 255, fail);
      rec.shadowOutput = pickNum(vals, used, 'shadowOutput', 0, 0, 255, fail);
      rec.highlightOutput = pickNum(vals, used, 'highlightOutput', 255, 0, 255, fail);
      const gamma = pickNum(vals, used, 'gamma', 1, 0.1, 9.99, fail, { int: false });
      rec.midtoneInput = Math.round(gamma * 100);
      if (rec.shadowInput >= rec.highlightInput)
        throw fail(`色阶的输入黑场 ${rec.shadowInput} 必须小于输入白场 ${rec.highlightInput}`);
      
      const records = [rec];
      for (let i = 1; i < 29; i++) records.push(identityLevelRecord());
      return [{ key: 'levl', model: { version: 2, records } }];
    },
  },
  curves: {
    label: '曲线',
    keys: ['curv'],
    accepts: 'points（[[输入,输出], …]，2…19 个点，输入递增，0…255）',
    make(vals, used, fail) {
      let points = identityCurvePoints();
      if (Object.prototype.hasOwnProperty.call(vals, 'points')) {
        used.add('points');
        const p = vals.points;
        if (!Array.isArray(p) || p.length < 2 || p.length > 19)
          throw fail(`values.points 必须是 2…19 个点的数组（每个点 [输入, 输出]），收到 ${JSON.stringify(p)}`);
        points = [];
        let prev = -1;
        for (const it of p) {
          if (!Array.isArray(it) || it.length !== 2 || !Number.isInteger(it[0]) || !Number.isInteger(it[1]))
            throw fail(`values.points 的每一项都要是 [输入, 输出] 两个整数，收到 ${JSON.stringify(it)}`);
          const [input, output] = it;
          if (input < 0 || input > 255 || output < 0 || output > 255)
            throw fail(`values.points 的坐标要在 0…255 之间，收到 ${JSON.stringify(it)}`);
          if (input <= prev) throw fail(`values.points 的输入值必须严格递增，${input} 在 ${prev} 之后`);
          prev = input;
          points.push({ output, input });
        }
      }
      







      const chans = [{ points }];
      for (let i = 1; i <= 3; i++) chans.push({ points: identityCurvePoints() });
      return [{
        key: 'curv',
        model: {
          isMap: false, version: 1, countMap: 15,
          channels: chans,
          extraSig: 'Crv ', extraVersion: 4,
          extra: chans.map((c, i) => ({ channelId: i, points: c.points.map(p => ({ ...p })) })),
        },
      }];
    },
  },
  hueSaturation: {
    label: '色相/饱和度',
    keys: ['hue2'],
    accepts: 'hue(-180…180) saturation(-100…100) lightness(-100…100) colorize',
    make(vals, used, fail) {
      const hue = pickNum(vals, used, 'hue', 0, -180, 180, fail);
      const sat = pickNum(vals, used, 'saturation', 0, -100, 100, fail);
      const lit = pickNum(vals, used, 'lightness', 0, -100, 100, fail);
      const colorize = pickBool(vals, used, 'colorize', false, fail);
      return [{
        key: 'hue2',
        model: {
          version: 2,
          enable: colorize,
          
          colorization: [0, 25, 0],
          master: [hue, sat, lit],
          ranges: HUE_RANGE_DEFAULTS.map(range => ({ range: range.slice(), settings: [0, 0, 0] })),
        },
      }];
    },
  },
  invert: {
    label: '反相',
    keys: ['nvrt'],
    accepts: '（无参数）',
    make() { return [{ key: 'nvrt', model: {} }]; },
  },
  posterize: {
    label: '色调分离',
    keys: ['post'],
    accepts: 'levels(2…255)',
    make(vals, used, fail) {
      return [{ key: 'post', model: { levels: pickNum(vals, used, 'levels', 4, 2, 255, fail) } }];
    },
  },
  threshold: {
    label: '阈值',
    keys: ['thrs'],
    accepts: 'level(1…255)',
    make(vals, used, fail) {
      return [{ key: 'thrs', model: { level: pickNum(vals, used, 'level', 128, 1, 255, fail) } }];
    },
  },
  blackWhite: {
    label: '黑白',
    keys: ['blwh'],
    accepts: 'red yellow green cyan blue magenta（均 -200…300）useTint',
    make(vals, used, fail) {
      
      const red = pickNum(vals, used, 'red', 40, -200, 300, fail);
      const yellow = pickNum(vals, used, 'yellow', 60, -200, 300, fail);
      const green = pickNum(vals, used, 'green', 40, -200, 300, fail);
      const cyan = pickNum(vals, used, 'cyan', 60, -200, 300, fail);
      const blue = pickNum(vals, used, 'blue', 20, -200, 300, fail);
      const magenta = pickNum(vals, used, 'magenta', 80, -200, 300, fail);
      const useTint = pickBool(vals, used, 'useTint', false, fail);
      return [{
        key: 'blwh',
        model: {
          descVersion: 16,
          desc: {
            __name: '', __classID: 'null',
            __long: { 'Rd  ': true, 'Yllw': true, 'Grn ': true, 'Cyn ': true, 'Bl  ': true, 'Mgnt': true, bwPresetKind: true },
            'Rd  ': red, 'Yllw': yellow, 'Grn ': green, 'Cyn ': cyan, 'Bl  ': blue, 'Mgnt': magenta,
            useTint,
            
            tintColor: lab(80, 5, 20),
            bwPresetKind: 1,
            blackAndWhitePresetFileName: '',
          },
        },
      }];
    },
  },
  colorBalance: {
    label: '色彩平衡',
    keys: ['blnc'],
    accepts: 'shadows/midtones/highlights（各 3 个 -100…100 的整数）preserveLuminosity',
    make(vals, used, fail) {
      return [{
        key: 'blnc',
        model: {
          shadows: pickTriple(vals, used, 'shadows', [0, 0, 0], -100, 100, fail),
          midtones: pickTriple(vals, used, 'midtones', [0, 0, 0], -100, 100, fail),
          highlights: pickTriple(vals, used, 'highlights', [0, 0, 0], -100, 100, fail),
          preserveLuminosity: pickBool(vals, used, 'preserveLuminosity', true, fail),
        },
      }];
    },
  },
  exposure: {
    label: '曝光度',
    keys: ['expA'],
    accepts: 'exposure(-20…20) offset(-0.5…0.5) gamma(0.01…9.99)',
    make(vals, used, fail) {
      return [{
        key: 'expA',
        model: {
          version: 1,
          exposure: pickNum(vals, used, 'exposure', 0, -20, 20, fail, { int: false }),
          offset: pickNum(vals, used, 'offset', 0, -0.5, 0.5, fail, { int: false }),
          gamma: pickNum(vals, used, 'gamma', 1, 0.01, 9.99, fail, { int: false }),
        },
      }];
    },
  },
  channelMixer: {
    label: '通道混合器',
    keys: ['mixr'],
    accepts: 'monochrome',
    make(vals, used, fail) {
      
      return [{
        key: 'mixr',
        model: {
          version: 1,
          monochrome: pickBool(vals, used, 'monochrome', false, fail),
          channels: [[100, 0, 0, 0, 0], [0, 100, 0, 0, 0], [0, 0, 100, 0, 0], [0, 0, 0, 0, 0]],
        },
      }];
    },
  },
  selectiveColor: {
    label: '可选颜色',
    keys: ['selc'],
    accepts: 'method(0 相对 / 1 绝对)',
    make(vals, used, fail) {
      
      const plates = [];
      for (let i = 0; i < 10; i++) plates.push([0, 0, 0, 0]);
      return [{ key: 'selc', model: { version: 1, method: pickNum(vals, used, 'method', 0, 0, 1, fail), plates } }];
    },
  },
  vibrance: {
    label: '自然饱和度',
    keys: ['vibA'],
    accepts: 'vibrance(-100…100) saturation(-100…100)',
    make(vals, used, fail) {
      return [{
        key: 'vibA',
        model: {
          descVersion: 16,
          desc: {
            __name: '', __classID: 'null',
            __long: { vibrance: true, 'Strt': true },
            vibrance: pickNum(vals, used, 'vibrance', 0, -100, 100, fail),
            'Strt': pickNum(vals, used, 'saturation', 0, -100, 100, fail),
          },
        },
      }];
    },
  },
  







  photoFilter: {
    label: '照片滤镜',
    keys: ['phfl'],
    accepts: 'color([红, 绿, 蓝] 0…255) density(0…100，百分比) preserveLuminosity',
    make(vals, used, fail) {
      const c = pickTriple(vals, used, 'color', [128, 128, 128], 0, 255, fail);
      const density = pickNum(vals, used, 'density', 0, 0, 100, fail);
      const preserveLuminosity = pickBool(vals, used, 'preserveLuminosity', true, fail);
      const L = srgbToLabD50(c[0], c[1], c[2]);
      const comp = v => Math.round(v * 100) & 0xffff;      
      return [{
        key: 'phfl',
        model: {
          version: 2, colorSpace: 7,
          color: [comp(L.L), comp(L.a), comp(L.b), 0],
          density: density * 100,
          preserveLuminosity,
          _tail: new Uint8Array(3),                          
        },
      }];
    },
  },
  








  colorLookup: {
    label: '颜色查找',
    keys: ['clrL'],
    accepts: `lookupType(${CLRL_TYPES.join(' / ')}) lutFormat(${CLRL_FORMATS.join(' / ')}) ` +
             `dataOrder(${CLRL_ORDERS.join(' / ')}) name dither tableOrder lutData(Uint8Array) profile(Uint8Array)`,
    make(vals, used, fail) {
      const lookupType = pickEnum(vals, used, 'lookupType', '3DLUT', CLRL_TYPES, fail);
      const lutFormat = pickEnum(vals, used, 'lutFormat', 'LUTFormatCUBE', CLRL_FORMATS, fail);
      const dataOrder = pickEnum(vals, used, 'dataOrder', 'rgbOrder', CLRL_ORDERS, fail);
      const name = pickStr(vals, used, 'name', '', 255, fail);
      


      const bytesOf = k => { if (!Object.prototype.hasOwnProperty.call(vals, k)) return null; used.add(k); const v = vals[k];
        if (!(v instanceof Uint8Array)) throw fail(`values.${k} 必须是 Uint8Array`); return v; };
      const lutData = bytesOf('lutData'), profile = bytesOf('profile');
      const dither = pickBool(vals, used, 'dither', true, fail);
      const tableOrder = pickEnum(vals, used, 'tableOrder', dataOrder, CLRL_ORDERS, fail);
      const desc = {
        __name: '', __classID: 'null',
        lookupType: enm('colorLookupType', CLRL_TYPE_PS[lookupType] || lookupType),
        'Nm  ': name,
        Dthr: dither,
      };
      if (profile) desc.profile = profile;
      desc.LUTFormat = enm('LUTFormatType', lutFormat);
      desc.dataOrder = enm('colorLookupOrder', CLRL_ORDER_PS[dataOrder] || dataOrder);
      desc.tableOrder = enm('colorLookupOrder', CLRL_ORDER_PS[tableOrder] || tableOrder);
      if (lutData) { desc.LUT3DFileData = lutData; desc.LUT3DFileName = name; }
      return [{
        key: 'clrL',
        model: { version: 1, descVersion: 16, desc },
      }];
    },
  },
  







  gradientMap: {
    label: '渐变映射',
    keys: ['grdm'],
    accepts: 'stops([[位置0…4096, 红, 绿, 蓝], …]，2…255 个) ' +
             'opacityStops([[位置0…4096, 不透明度0…255], …]，2…255 个) reverse dither name',
    make(vals, used, fail) {
      const reverse = pickBool(vals, used, 'reverse', false, fail);
      const dither = pickBool(vals, used, 'dither', false, fail);
      const name = pickStr(vals, used, 'name', '', 255, fail);
      const clrs = pickStopList(vals, used, 'stops',
        [[0, 0, 0, 0], [4096, 255, 255, 255]], 3, 255, fail);
      const ops = pickStopList(vals, used, 'opacityStops',
        [[0, 255], [4096, 255]], 1, 255, fail);
      return [{
        key: 'grdm',
        model: {
          version: 1, reverse, dither, name,
          _nameUnits: name.length + 1,                      
          colorStops: clrs.map(([loc, r, g, b]) => ({
            location: loc, midpoint: 50, mode: 0,           
            color: [r * 257, g * 257, b * 257, 0], _pad: 0,
          })),
          transparencyStops: ops.map(([loc, o]) => ({ location: loc, midpoint: 50, opacity: o })),
          expansion: 2, interpolation: 4096, length: 32, mode: 0,
          randomSeed: 0, showTransparency: 0, useVectorColor: 0,
          roughness: 4096, colorModel: 3,
          minimumColor: [0, 0, 0, 0], maximumColor: [0, 0, 0, 0], _dummy: 0,
          _tail: new Uint8Array(2),
        },
      }];
    },
  },
};




const ADJ_ALIAS = (() => {
  const m = new Map();
  const norm = s => String(s).toLowerCase().replace(/[-_\s]/g, '');
  for (const k of Object.keys(ADJ_KINDS)) {
    m.set(norm(k), k);
    for (const bk of ADJ_KINDS[k].keys) m.set(norm(bk), k);
  }
  
  const extra = {
    brightness: 'brightnessContrast', contrast: 'brightnessContrast', 'brightness/contrast': 'brightnessContrast',
    hue: 'hueSaturation', huesat: 'hueSaturation', saturation: 'hueSaturation',
    bw: 'blackWhite', blackandwhite: 'blackWhite',
    curve: 'curves', level: 'levels',
    mixer: 'channelMixer', selective: 'selectiveColor',
  };
  for (const k of Object.keys(extra)) m.set(norm(k), extra[k]);
  return m;
})();

function adjMenu() {
  return Object.keys(ADJ_KINDS).map(k => `${k}(${ADJ_KINDS[k].keys.join('+')}/${ADJ_KINDS[k].label})`).join(' ');
}



function u8b(v) { return new Uint8Array([v & 0xff]); }
function u16b(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; }
function i16b(v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v); return b; }
function u32b(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; }
function i32b(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); return b; }
function u64b(v) {
  const b = new Uint8Array(8); const d = new DataView(b.buffer);
  d.setUint32(0, Math.floor(v / 0x100000000)); d.setUint32(4, v >>> 0);
  return b;
}
const lenField = (v, psb) => (psb ? u64b(v) : u32b(v));
function ascii4(s) {
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) b[i] = (s.charCodeAt(i) || 0x20) & 0xff;
  return b;
}






function encodePascal(name) {
  let lossy = false;
  const chars = [];
  for (let i = 0; i < name.length && chars.length < 255; i++) {
    const c = name.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) chars.push(c);
    else { chars.push(0x3f); lossy = true; }
  }
  const total = 1 + chars.length;
  const pad = (4 - (total % 4)) % 4;
  const out = new Uint8Array(total + pad);
  out[0] = chars.length;
  for (let i = 0; i < chars.length; i++) out[1 + i] = chars[i];
  return { bytes: out, lossy };
}








function probeFxBlock(h, ab, index, key, psb) {
  let raw;
  try { raw = h.readLayerBlock(ab, index, key); } catch (e) { return { ok: false, key, reason: `读取 ${key} 块失败：${e && e.message}` }; }
  if (!raw) return { ok: false, key, reason: `图层 ${index} 没有 ${key} 块` };
  if (raw.length < 12) return { ok: false, key, reason: `${key} 块只有 ${raw.length} 字节，放不下 version(4)+descriptorVersion(4)+描述符` };
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const version = dv.getUint32(0), descVersion = dv.getUint32(4);
  if (descVersion !== 16)
    return { ok: false, key, reason: `${key} 的 descriptorVersion=${descVersion}（只认识 16），不敢按描述符改写` };
  let desc, consumed;
  try {
    const r = new Reader(raw);
    r.seek(8);
    desc = readDescriptor(r);
    consumed = r.o;
  } catch (e) {
    return { ok: false, key, reason: `${key} 的描述符解析失败（${e && e.message}）` };
  }
  if (consumed > raw.length) return { ok: false, key, reason: `${key} 的描述符读过了块尾（读到 ${consumed} / 块长 ${raw.length}）` };
  let ser;
  try { ser = serializeDescriptor(desc); } catch (e) {
    return { ok: false, key, reason: `${key} 的描述符无法重新序列化（${e && e.message}）` };
  }
  const body = raw.subarray(8, consumed);
  if (ser.length !== body.length)
    return { ok: false, key, reason: `${key} 的描述符重序列化长度对不上（原 ${body.length} 字节 → 重建 ${ser.length} 字节）` };
  for (let i = 0; i < ser.length; i++) {
    if (ser[i] !== body[i])
      return { ok: false, key, reason: `${key} 的描述符重序列化在块内偏移 ${8 + i} 就对不上（原 ${hex1(body[i])} → 重建 ${hex1(ser[i])}）` };
  }
  









  const round = psb ? 4 : (h.PAD4_BLOCK_KEYS.has(key) ? 4 : 2);
  const bodyLen = 8 + ser.length;
  const standardLen = bodyLen + ((round - (bodyLen % round)) % round);
  return {
    ok: true, key, raw, desc, version, descVersion, round,
    head: raw.subarray(0, 8),        
    tail: raw.subarray(consumed),    
    tailIsStandardPad: standardLen === raw.length,
  };
}


function packFxBlock(h, head, desc, tail) {
  return h.concat([head, serializeDescriptor(desc), tail || new Uint8Array(0)]);
}

function newFxHead() {
  const b = new Uint8Array(8);
  const d = new DataView(b.buffer);
  d.setUint32(0, 0); d.setUint32(4, 16);
  return b;
}





function selfCheckFxBlock(data) {
  if (data.length < 12) return { ok: false, reason: `块数据只有 ${data.length} 字节` };
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv.getUint32(4) !== 16) return { ok: false, reason: `descriptorVersion=${dv.getUint32(4)}，不是 16` };
  let desc, consumed;
  try {
    const r = new Reader(data);
    r.seek(8);
    desc = readDescriptor(r);
    consumed = r.o;
  } catch (e) { return { ok: false, reason: `重新解析失败：${e && e.message}` }; }
  let ser;
  try { ser = serializeDescriptor(desc); } catch (e) { return { ok: false, reason: `重新序列化失败：${e && e.message}` }; }
  const body = data.subarray(8, consumed);
  if (ser.length !== body.length) return { ok: false, reason: `重序列化长度 ${ser.length} ≠ ${body.length}` };
  for (let i = 0; i < ser.length; i++) {
    if (ser[i] !== body[i]) return { ok: false, reason: `重序列化在块内偏移 ${8 + i} 对不上（${hex1(body[i])} → ${hex1(ser[i])}）` };
  }
  return { ok: true, desc };
}


function fxBlocksOf(h, ab, index) {
  const desc = [], legacy = [];
  for (const k of FX_BLOCK_KEYS) if (h.findLayerBlockRange(ab, index, k)) desc.push(k);
  if (h.findLayerBlockRange(ab, index, LEGACY_FX_KEY)) legacy.push(LEGACY_FX_KEY);
  return { desc, legacy };
}





function slotOf(desc, spec) {
  for (const k of [spec.multi, spec.key]) {
    if (!k) continue;
    const v = desc[k];
    if (Array.isArray(v)) return { slotKey: k, items: v, multi: true };
    if (isEffectObj(v)) return { slotKey: k, items: [v], multi: false };
  }
  return null;
}


function effectInventory(desc) {
  const list = [];
  let total = 0;
  for (const canon of Object.keys(FX_EFFECTS)) {
    const spec = FX_EFFECTS[canon];
    for (const k of [spec.multi, spec.key]) {
      if (!k) continue;
      const v = desc[k];
      if (Array.isArray(v)) { list.push(`${canon}(${k}，${v.length} 条)`); total += v.length; }
      else if (isEffectObj(v)) { list.push(`${canon}(${k})`); total += 1; }
    }
  }
  return { list, total };
}




const COLOR_COMPS = {
  RGBC: ['Rd  ', 'Grn ', 'Bl  '],
  LABC: ['Lmnc', 'A   ', 'B   '],
};
const isColorObj = v => !!v && typeof v === 'object' && COLOR_COMPS[v.__classID];


function parseHexColor(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const t = m[1];
  return t.length === 3
    ? [parseInt(t[0] + t[0], 16), parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16)]
    : [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
}


function listPaths(node, prefix, out, depth) {
  out = out || []; depth = depth || 0;
  if (depth > 4 || !node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) listPaths(node[i], `${prefix}.${i}`, out, depth + 1);
    return out;
  }
  if (node.__unit !== undefined || node.__enumType !== undefined) { out.push(prefix); return out; }
  if (isColorObj(node)) { out.push(prefix); for (const c of COLOR_COMPS[node.__classID]) out.push(`${prefix}.${c}`); return out; }
  for (const k of dataKeys(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    const v = node[k];
    if (v !== null && typeof v === 'object') listPaths(v, p, out, depth + 1);
    else out.push(p);
  }
  return out;
}





function applyValue(root, path, raw, fail) {
  const segs = String(path).split('.');
  let node = root;
  for (let i = 0; i < segs.length - 1; i++) {
    if (node === null || typeof node !== 'object') throw fail(`values 里的路径「${path}」走不通（第 ${i} 段「${segs[i]}」之前已经不是对象了）`);
    node = Array.isArray(node) ? node[Number(segs[i])] : node[segs[i]];
  }
  if (node === null || typeof node !== 'object') throw fail(`values 里的路径「${path}」走不通`);
  const last = segs[segs.length - 1];
  const isArr = Array.isArray(node);
  const key = isArr ? Number(last) : last;
  if (isArr ? !(key >= 0 && key < node.length) : !Object.prototype.hasOwnProperty.call(node, key))
    throw fail(`没有字段「${path}」；这条效果可以覆盖的字段：${listPaths(root, '', []).join(' ')}`);
  const cur = node[key];

  if (cur && typeof cur === 'object' && cur.__classID === 'ShpC') {      
    const r = contourDescFrom(raw, cur);
    if (r.error) throw fail(`字段「${path}」（等高线）：${r.error}`);
    node[key] = r.desc;
    return;
  }
  if (isColorObj(cur)) {
    const comps = COLOR_COMPS[cur.__classID];
    let vals = null;
    if (typeof raw === 'string') {
      const hexv = parseHexColor(raw);
      if (!hexv) throw fail(`字段「${path}」是颜色，字符串只认 '#rrggbb' / '#rgb'，收到 ${JSON.stringify(raw)}`);
      if (cur.__classID !== 'RGBC') throw fail(`字段「${path}」是 ${cur.__classID} 颜色，不能用 '#rrggbb' 赋值，请用 { ${comps.map(c => JSON.stringify(c)).join(', ')} }`);
      vals = hexv;
    } else if (Array.isArray(raw)) {
      if (raw.length !== comps.length) throw fail(`字段「${path}」是 ${cur.__classID} 颜色，需要 ${comps.length} 个分量（${comps.join('/')}），收到 ${raw.length} 个`);
      vals = raw.slice();
    } else if (raw && typeof raw === 'object') {
      const short = { r: 'Rd  ', g: 'Grn ', b: 'Bl  ', red: 'Rd  ', green: 'Grn ', blue: 'Bl  ' };
      vals = comps.map(c => cur[c]);
      for (const k of Object.keys(raw)) {
        const n = comps.includes(k) ? k : (cur.__classID === 'RGBC' ? short[k] : null);
        if (!n) throw fail(`字段「${path}」（${cur.__classID}）没有分量「${k}」；可用：${comps.map(x => JSON.stringify(x)).join(' ')}`);
        vals[comps.indexOf(n)] = raw[k];
      }
    } else {
      throw fail(`字段「${path}」是 ${cur.__classID} 颜色，值必须是 '#rrggbb' / 数组 / 对象，收到 ${JSON.stringify(raw)}`);
    }
    const lo = cur.__classID === 'RGBC' ? 0 : -128, hi = cur.__classID === 'RGBC' ? 255 : 255;
    for (let i = 0; i < comps.length; i++) {
      const v = vals[i];
      if (!Number.isInteger(v) || v < lo || v > hi)
        throw fail(`字段「${path}.${comps[i]}」要 ${lo}…${hi} 的整数，收到 ${JSON.stringify(v)}`);
      cur[comps[i]] = v;
    }
    return;
  }
  if (cur && typeof cur === 'object' && cur.__unit !== undefined && !Array.isArray(cur.values)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw fail(`字段「${path}」（${cur.__unit}）要有限数值，收到 ${JSON.stringify(raw)}`);
    if (cur.__unit === '#Prc' && (raw < -100 || raw > 100)) throw fail(`字段「${path}」是百分比，${raw} 超出 -100…100`);
    if (cur.__unit === '#Ang' && (raw < -360 || raw > 360)) throw fail(`字段「${path}」是角度，${raw} 超出 -360…360`);
    if (cur.__unit === '#Pxl' && (raw < 0 || raw > 30000)) throw fail(`字段「${path}」是像素长度，${raw} 超出 0…30000`);
    cur.value = raw;
    return;
  }
  if (cur && typeof cur === 'object' && cur.__enumType !== undefined) {
    if (typeof raw !== 'string' || !raw.length) throw fail(`字段「${path}」是 ${cur.__enumType} 枚举，要非空字符串（如 'Mltp'），收到 ${JSON.stringify(raw)}`);
    cur.value = raw;
    return;
  }
  if (typeof cur === 'boolean') {
    if (typeof raw !== 'boolean') throw fail(`字段「${path}」要布尔值，收到 ${JSON.stringify(raw)}`);
    node[key] = raw;
    return;
  }
  if (typeof cur === 'number') {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw fail(`字段「${path}」要有限数值，收到 ${JSON.stringify(raw)}`);
    const wantInt = !!(node.__long && node.__long[key]) || !!(node.__comp && node.__comp[key]);
    if (wantInt && !Number.isInteger(raw)) throw fail(`字段「${path}」是整数类型，收到 ${raw}`);
    node[key] = raw;
    return;
  }
  if (typeof cur === 'string') {
    if (typeof raw !== 'string') throw fail(`字段「${path}」要字符串，收到 ${JSON.stringify(raw)}`);
    if (raw.length > 4096) throw fail(`字段「${path}」的字符串太长（${raw.length} > 4096）`);
    node[key] = raw;
    return;
  }
  throw fail(`字段「${path}」是 ${cur === null ? 'null' : typeof cur}，本模块不支持在新建时覆盖`);
}



export function createCreateOps(h) {

  


  function buildEffect(canon, values, fail) {
    const make = FX_TEMPLATE[canon];
    if (!make) throw fail(`「${FX_EFFECTS[canon].label}」(${canon}) 还没有默认参数模板，本模块暂不支持新建`);
    const node = make();
    if (values !== undefined) {
      if (!values || typeof values !== 'object' || Array.isArray(values))
        throw fail(`values 必须是对象（字段路径 → 新值），收到 ${JSON.stringify(values)}`);
      for (const p of Object.keys(values)) applyValue(node, p, values[p], fail);
    }
    
    if (canon === 'patternOverlay') {
      const ptrn = node['Ptrn'] || {};
      if (!ptrn['Nm  '] || !ptrn['Idnt']) {
        throw fail('图案叠加（patternOverlay）引用的是文档全局图案资源（Patt 块）里的一个图案，' +
          '没法凭空造一个默认图案；请先确认文档里已有图案，再用 ' +
          "values:{ 'Ptrn.Nm  ':'图案名', 'Ptrn.Idnt':'图案 uuid' } 显式指定");
      }
    }
    if (typeof node.enab !== 'boolean') throw fail(`内部错误：「${canon}」模板里没有 enab 字段`);
    return node;
  }

  


  



  function writeFxBack(ab, op, i, key, head, tail, descNew, expectFlat, psb) {
    const data = packFxBlock(h, head, descNew, tail);
    const chk = selfCheckFxBlock(data);
    if (!chk.ok)
      throw h.opFail(i, op, `新造的 ${key} 块自检没过（${chk.reason}），拒绝写回`, { index: op.index, block: key });
    const out = h.upsertLayerBlock(ab, op.index, key, data);
    
    const probe2 = probeFxBlock(h, out, op.index, key, psb);
    if (!probe2.ok)
      throw h.opFail(i, op, `写回 ${key} 之后重新探测不过（${probe2.reason}），拒绝返回文件`, { index: op.index, block: key });
    const gotFlat = flatten(probe2.desc, '', {});
    const diff = flatDiff(expectFlat, gotFlat);
    if (diff.length)
      throw h.opFail(i, op,
        `写回 ${key} 之后读回来的描述符与预期不一致（${diff.length} 处）：${diff.slice(0, 6).join('；')}${diff.length > 6 ? ' …' : ''}；拒绝返回文件`,
        { index: op.index, block: key, diff: diff.slice(0, 20) });
    return out;
  }

  



  function assertOthersIntact(op, i, key, flatBefore, flatAfter, slotKeys) {
    const strip = (flat) => {
      const out = {};
      for (const k of Object.keys(flat)) {
        
        if (/^#(len|cls|keys)$/.test(k)) continue;
        const head = k.split('.')[0].replace(/#(len|cls|keys)$/, '');
        if (slotKeys.includes(head) || head === 'numModifyingFX') continue;
        out[k] = flat[k];
      }
      return out;
    };
    const diff = flatDiff(strip(flatBefore), strip(flatAfter));
    if (diff.length)
      throw h.opFail(i, op,
        `改动 ${key} 时把这一层**原有的**其它字段也改了（${diff.length} 处）：${diff.slice(0, 6).join('；')}${diff.length > 6 ? ' …' : ''}；拒绝返回文件`,
        { index: op.index, block: key, diff: diff.slice(0, 20) });
  }

  



  function keepTail(probe, key, index, warnings) {
    if (probe.tailIsStandardPad) return new Uint8Array(0);
    if (!probe.tail.length) return new Uint8Array(0);
    warnings.push(`图层 ${index} 的 ${key} 块在描述符之后有 ${probe.tail.length} 字节非标准填充` +
      `（按 ${probe.round} 字节对齐应该是 ${(probe.round - ((probe.raw.length - probe.tail.length) % probe.round)) % probe.round} 字节），` +
      `已原样保留；这种文件上「加一条效果再删掉」不保证回到逐字节相同`);
    return probe.tail;
  }

  
  function bumpModifyingFX(desc, delta) {
    if (typeof desc.numModifyingFX !== 'number') return desc;
    const v = desc.numModifyingFX + delta;
    desc.numModifyingFX = v < 0 ? 0 : v;
    return desc;
  }

  



  function validateAddEffect(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (typeof op.effect !== 'string' || !op.effect.trim())
      throw h.opFail(i, op, `effect 必须是非空字符串（效果名或 4 字符 PS key）；可用：${Object.keys(FX_EFFECTS).map(c => `${c}/${FX_EFFECTS[c].key}`).join(' ')}`);
    const canon = resolveEffectName(op.effect);
    if (!canon)
      throw h.opFail(i, op, `不认识的效果名「${op.effect}」；可用（英文名/PS key）：${Object.keys(FX_EFFECTS).map(c => `${c}/${FX_EFFECTS[c].key}`).join(' ')}`,
        { effect: op.effect, available: Object.keys(FX_EFFECTS) });
    if (op.values !== undefined && (!op.values || typeof op.values !== 'object' || Array.isArray(op.values)))
      throw h.opFail(i, op, `values 必须是对象（字段路径 → 新值），收到 ${JSON.stringify(op.values)}`);
    if (layer.extraRaw)
      throw h.opFail(i, op, `图层 ${op.index} 的附加区是原样字节（解析已降级），加图层样式会被静默丢掉，拒绝执行`, { index: op.index });
    
    buildEffect(canon, op.values, msg => h.opFail(i, op, msg, { index: op.index, effect: canon }));
    return {
      affected: [op.index], changed: [`effects.${canon}`], opIndex: i, canon,
      note: `图层 ${op.index}「${layer.name}」新增「${FX_EFFECTS[canon].label}」(${FX_EFFECTS[canon].key})`,
    };
  }

  function applyAddEffect(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const canon = plan.canon || resolveEffectName(op.effect);
    const spec = FX_EFFECTS[canon];
    const fail = (msg, info) => h.opFail(i, op, msg, { index: op.index, effect: canon, ...(info || {}) });
    const node = buildEffect(canon, op.values, msg => fail(msg));
    const psb = !!h.parsePsdFull(ab).sections.psb;

    const found = fxBlocksOf(h, ab, op.index);
    if (found.legacy.length)
      warnings.push(`图层 ${op.index} 旁边还挂着一份老式 ${LEGACY_FX_KEY} 块，本次没有同步写入新效果` +
        `（PS 与 ag-psd 都优先读描述符型的 ${FX_BLOCK_KEYS.join('/')}，只有很老的读取器才会看 ${LEGACY_FX_KEY}）`);

    
    if (!found.desc.length) {
      const key = NEW_FX_BLOCK_KEY;
      



      const desc = {
        __name: '', __classID: 'null',
        __long: { numModifyingFX: true },
        'Scl ': pct(100),
        masterFXSwitch: true,
        [spec.key]: node,
        numModifyingFX: node.enab ? 1 : 0,
      };
      const expect = flatten(desc, '', {});
      const out = writeFxBack(ab, op, i, key, newFxHead(), new Uint8Array(0), desc, expect, psb);
      return {
        buffer: out,
        result: {
          changed: true, block: key, created: true, effect: canon, at: 0, count: 1,
          note: `${plan.note}：这一层原本没有图层样式，已新建 ${key} 块（${FX_BLOCK_KEYS.join('/')} 里最通用的一种）`,
        },
      };
    }

    
    if (found.desc.length > 1)
      warnings.push(`图层 ${op.index} 上同时有 ${found.desc.join('/')} 多个样式块，本次只往 ${found.desc[0]} 里加` +
        `（PS 与 ag-psd 都以排在前面的那个为准）`);

    
    let key = found.desc[0];
    for (const k of found.desc) {
      const p = probeFxBlock(h, ab, op.index, k, psb);
      if (p.ok && slotOf(p.desc, spec)) { key = k; break; }
    }
    const probe = probeFxBlock(h, ab, op.index, key, psb);
    if (!probe.ok)
      throw fail(`图层 ${op.index} 的图层样式块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${probe.reason}`,
        { block: key, reason: probe.reason });
    const tail = keepTail(probe, key, op.index, warnings);

    const flatBefore = flatten(probe.desc, '', {});
    let desc = probe.desc;
    const slot = slotOf(desc, spec);
    let slotKeys, at, count;
    let upgradedFrom = '';        

    if (!slot) {
      
      desc = insertKeyBefore(desc, spec.key, node, 'numModifyingFX');
      slotKeys = [spec.key]; at = 0; count = 1;
    } else if (slot.multi) {
      



      const items = slot.items.slice();
      items.unshift(node);
      desc = { ...desc };
      desc[slot.slotKey] = items;
      slotKeys = [slot.slotKey]; at = 0; count = items.length;
    } else if (!spec.multi) {
      
      throw fail(`图层 ${op.index} 已经有一条「${spec.label}」了，而这类效果在 PSD 里只能有一条 —— ` +
        `请改现有的那一条（setLayerParams { target:'effect:${spec.key}', values:{…} }），或先 removeLayerEffect 再加`,
        { block: key, effect: canon, existing: 1 });
    } else if (key !== 'lmfx') {
      















      upgradedFrom = key;
      key = 'lmfx';
      desc = renameKeyInPlace(desc, slot.slotKey, spec.multi, [node, slot.items[0]]);
      slotKeys = [slot.slotKey, spec.multi]; at = 0; count = 2;
    } else {
      
      desc = renameKeyInPlace(desc, slot.slotKey, spec.multi, [node, slot.items[0]]);
      slotKeys = [slot.slotKey, spec.multi]; at = 0; count = 2;
    }

    bumpModifyingFX(desc, node.enab ? 1 : 0);
    const expect = flatten(desc, '', {});
    let out = writeFxBack(ab, op, i, key, probe.head, tail, desc, expect, psb);
    if (upgradedFrom) {
      out = h.upsertLayerBlock(out, op.index, upgradedFrom, null);     
      const after = fxBlocksOf(h, out, op.index);
      if (after.desc.includes(upgradedFrom))
        throw fail(`把 ${upgradedFrom} 升级成 ${key} 之后，老的 ${upgradedFrom} 块还在 —— 两份样式块会让读取器拿到旧的那一份，拒绝返回文件`,
          { block: upgradedFrom });
      const p3 = probeFxBlock(h, out, op.index, key, psb);
      if (!p3.ok)
        throw fail(`把 ${upgradedFrom} 升级成 ${key} 之后重新探测不过（${p3.reason}），拒绝返回文件`, { block: key });
      const d3 = flatDiff(expect, flatten(p3.desc, '', {}));
      if (d3.length)
        throw fail(`升级成 ${key} 之后读回来的描述符与预期不一致（${d3.length} 处）：${d3.slice(0, 6).join('；')}；拒绝返回文件`,
          { block: key, diff: d3.slice(0, 20) });
      warnings.push(`图层 ${op.index} 的图层样式块已从 ${upgradedFrom} 升级为 lmfx（多重效果只能写在 lmfx 里）。` +
        `原有字段一字未改，但这条路径不可逆：删回一条也会留在 lmfx 中（PS 同），` +
        `所以这一层上「加一条再删掉 = 原文件逐字节相同」不再成立`);
    }
    const probe2 = probeFxBlock(h, out, op.index, key, psb);
    assertOthersIntact(op, i, key, flatBefore, flatten(probe2.desc, '', {}), slotKeys);

    return {
      buffer: out,
      result: {
        changed: true, block: key, created: false, effect: canon, at, count,
        upgradedFrom: upgradedFrom || undefined,
        note: `${plan.note}（写进 ${key}${upgradedFrom ? `，整块已从 ${upgradedFrom} 升级成 lmfx` : ''}，` +
          `现在这类效果共 ${count} 条，新的那条 at=${at}）`,
      },
    };
  }

  



  function validateRemoveEffect(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (typeof op.effect !== 'string' || !op.effect.trim())
      throw h.opFail(i, op, `effect 必须是非空字符串（效果名或 4 字符 PS key）；可用：${Object.keys(FX_EFFECTS).map(c => `${c}/${FX_EFFECTS[c].key}`).join(' ')}`);
    const canon = resolveEffectName(op.effect);
    if (!canon)
      throw h.opFail(i, op, `不认识的效果名「${op.effect}」；可用（英文名/PS key）：${Object.keys(FX_EFFECTS).map(c => `${c}/${FX_EFFECTS[c].key}`).join(' ')}`,
        { effect: op.effect, available: Object.keys(FX_EFFECTS) });
    const at = op.at === undefined ? 0 : op.at;
    if (!Number.isInteger(at) || at < 0)
      throw h.opFail(i, op, `at 必须是 ≥0 的整数（多重效果里删第几条，默认 0），收到 ${JSON.stringify(op.at)}`);
    if (layer.extraRaw)
      throw h.opFail(i, op, `图层 ${op.index} 的附加区是原样字节（解析已降级），删图层样式会被静默丢掉，拒绝执行`, { index: op.index });
    return {
      affected: [op.index], changed: [`effects.${canon}`], opIndex: i, canon, at,
      note: `图层 ${op.index}「${layer.name}」删除「${FX_EFFECTS[canon].label}」(${FX_EFFECTS[canon].key})${at ? ` 第 ${at + 1} 条` : ''}`,
    };
  }

  function applyRemoveEffect(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const canon = plan.canon || resolveEffectName(op.effect);
    const at = plan.at === undefined ? (op.at === undefined ? 0 : op.at) : plan.at;
    const spec = FX_EFFECTS[canon];
    const fail = (msg, info) => h.opFail(i, op, msg, { index: op.index, effect: canon, ...(info || {}) });
    const psb = !!h.parsePsdFull(ab).sections.psb;

    const found = fxBlocksOf(h, ab, op.index);
    if (!found.desc.length) {
      if (found.legacy.length)
        throw fail(`图层 ${op.index} 只有老式的 ${LEGACY_FX_KEY} 图层样式块（不是描述符结构），本 op 只支持描述符型（${FX_BLOCK_KEYS.join('/')}），拒绝改写`,
          { blocks: found.legacy });
      throw fail(`图层 ${op.index} 没有图层样式块（找不到 ${FX_BLOCK_KEYS.join('/')}），没有可以删的图层样式`);
    }

    
    let key = null, probe = null;
    const seen = [];
    for (const k of found.desc) {
      const p = probeFxBlock(h, ab, op.index, k, psb);
      if (!p.ok)
        throw fail(`图层 ${op.index} 的 ${k} 块用了我们还不能原样重建的写法，拒绝改写以免破坏文件 —— ${p.reason}`, { block: k, reason: p.reason });
      const inv = effectInventory(p.desc);
      seen.push(...inv.list);
      if (slotOf(p.desc, spec)) { key = k; probe = p; break; }
    }
    if (!key)
      throw fail(`图层 ${op.index} 的图层样式里没有「${spec.label}」(${canon}/${spec.key})；这一层实际有的效果：${seen.length ? seen.join('、') : '一个都没有'}`,
        { available: seen });

    const slot = slotOf(probe.desc, spec);
    if (at >= slot.items.length)
      throw fail(`at=${at} 越界：这一层的「${spec.label}」一共只有 ${slot.items.length} 条（合法范围 0…${slot.items.length - 1}）`,
        { block: key, count: slot.items.length, at });

    const removed = slot.items[at];
    const removedEnab = removed && typeof removed.enab === 'boolean' ? removed.enab : true;
    const flatBefore = flatten(probe.desc, '', {});
    let desc = probe.desc;
    const slotKeys = [spec.key];
    if (spec.multi) slotKeys.push(spec.multi);

    if (!slot.multi) {
      
      desc = dropKey(desc, slot.slotKey);
    } else {
      const items = slot.items.slice();
      items.splice(at, 1);
      if (items.length === 0) {
        desc = dropKey(desc, slot.slotKey);
      } else if (items.length === 1) {
        





        desc = renameKeyInPlace(desc, slot.slotKey, spec.key, items[0]);
      } else {
        desc = { ...desc };
        desc[slot.slotKey] = items;
      }
    }

    bumpModifyingFX(desc, removedEnab ? -1 : 0);
    const left = effectInventory(desc);

    
    if (left.total === 0) {
      






      const out = h.upsertLayerBlock(ab, op.index, key, null);
      if (h.findLayerBlockRange(out, op.index, key))
        throw fail(`删除 ${key} 块之后它还在文件里，拒绝返回文件`, { block: key });
      if (found.legacy.length)
        warnings.push(`图层 ${op.index}：${key} 块已整块删除，但老式 ${LEGACY_FX_KEY} 块还在（本模块不改它），` +
          `很老的读取器可能仍会显示旧的图层样式`);
      return {
        buffer: out,
        result: {
          changed: true, block: key, removedBlock: true, effect: canon, at, count: 0,
          note: `${plan.note}：这是最后一条效果，已把整个 ${key} 块删掉（与 PS「没有样式就没有块」的写法一致）`,
        },
      };
    }

    const expect = flatten(desc, '', {});
    const out = writeFxBack(ab, op, i, key, probe.head, keepTail(probe, key, op.index, warnings), desc, expect, psb);
    const probe2 = probeFxBlock(h, out, op.index, key, psb);
    assertOthersIntact(op, i, key, flatBefore, flatten(probe2.desc, '', {}), slotKeys);
    const nowSlot = slotOf(probe2.desc, spec);
    return {
      buffer: out,
      result: {
        changed: true, block: key, removedBlock: false, effect: canon, at,
        count: nowSlot ? nowSlot.items.length : 0,
        note: `${plan.note}（${key} 里这类效果还剩 ${nowSlot ? nowSlot.items.length : 0} 条，全层共 ${left.total} 条效果）`,
      },
    };
  }

  



  






  const MODE_COLOR_CHANNELS = { 0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 7: 1, 8: 1, 9: 3 };
  const MODE_NAMES = { 0: '位图', 1: '灰度', 2: '索引色', 3: 'RGB', 4: 'CMYK', 7: '多通道', 8: '双色调', 9: 'Lab' };

  function validateAddAdjustment(state, op, i) {
    
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持新建图层`, { section: bad.section });
    if (!state.layers.length)
      throw h.opFail(i, op, '本文档没有图层信息段（一个图层都没有），本 op 只会往已有的层信息段里插记录，不会从零建段');

    if (typeof op.kind !== 'string' || !op.kind.trim())
      throw h.opFail(i, op, `kind 必须是非空字符串；可用：${adjMenu()}`);
    const kind = ADJ_ALIAS.get(op.kind.toLowerCase().replace(/[-_\s]/g, ''));
    if (!kind)
      throw h.opFail(i, op, `不认识的调整图层类型「${op.kind}」；可用：${adjMenu()}`, { kind: op.kind, available: Object.keys(ADJ_KINDS) });

    const nColor = MODE_COLOR_CHANNELS[state.mode];
    if (!nColor)
      throw h.opFail(i, op, `本文档的颜色模式 ${state.mode}（${MODE_NAMES[state.mode] || '未知'}）不在支持范围内，不敢猜通道表怎么写`, { mode: state.mode });

    const at = op.at === undefined ? state.layers.length : op.at;
    if (!Number.isInteger(at) || at < 0 || at > state.layers.length)
      throw h.opFail(i, op, `at 必须是 0…${state.layers.length} 的整数（新图层在「底=0」序里的下标，${state.layers.length} = 最上面；默认最上面），收到 ${JSON.stringify(op.at)}`,
        { layers: state.layers.length });

    const name = op.name === undefined ? ADJ_KINDS[kind].label : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);

    if (op.opacity !== undefined && (!Number.isInteger(op.opacity) || op.opacity < 0 || op.opacity > 255))
      throw h.opFail(i, op, `opacity 必须是 0…255 的整数（255 = 不透明），收到 ${JSON.stringify(op.opacity)}`);
    if (op.visible !== undefined && typeof op.visible !== 'boolean')
      throw h.opFail(i, op, 'visible 必须是布尔值');
    if (op.clipping !== undefined && typeof op.clipping !== 'boolean' && op.clipping !== 0 && op.clipping !== 1)
      throw h.opFail(i, op, 'clipping 必须是布尔值或 0/1');
    if (op.blendKey !== undefined) {
      if (typeof op.blendKey !== 'string' || op.blendKey.length !== 4)
        throw h.opFail(i, op, `blendKey 必须是 4 个字符（不足补空格，如 'mul '），收到 ${JSON.stringify(op.blendKey)}`);
      if (!h.BLEND_KEYS.has(op.blendKey))
        throw h.opFail(i, op, `blendKey "${op.blendKey}" 不是 PS 认识的混合模式；可用：${[...h.BLEND_KEYS].join(' ')}`);
    }
    if (op.values !== undefined && (!op.values || typeof op.values !== 'object' || Array.isArray(op.values)))
      throw h.opFail(i, op, `values 必须是对象，收到 ${JSON.stringify(op.values)}`);

    
    buildAdjBlocks(kind, op.values, i, op);

    return {
      affected: [at], changed: ['layers'], opIndex: i, kind, at, name, nColor,
      note: `在 index ${at}${at >= state.layers.length ? '（最上面）' : ''} 新建「${ADJ_KINDS[kind].label}」调整图层「${name}」`,
    };
  }

  
  function buildAdjBlocks(kind, values, i, op) {
    const spec = ADJ_KINDS[kind];
    const vals = values || {};
    const used = new Set();
    const fail = msg => h.opFail(i, op, msg, { kind });
    const blocks = spec.make(vals, used, fail);
    const unknown = Object.keys(vals).filter(k => !used.has(k));
    if (unknown.length)
      throw fail(`values 里有「${kind}」不认识的字段：${unknown.join(' ')}；这一类接受：${spec.accepts}`);
    return blocks;
  }

  


  function buildSemanticBlocks(models, psb, fail) {
    const blockBytes = [], blockKeys = [];
    for (const { key, model } of models) {
      let data;
      try { data = writeAdditionalBlock(key, model, { psb }); } catch (e) {
        throw fail(`${key} 块序列化失败：${e && e.message}`, { block: key });
      }
      const blk = h.buildBlock(key, data, psb);
      
      const dataWithPad = blk.subarray(12);
      const back = parseAdditionalBlock(key, dataWithPad, { psb, verify: false });
      if (back && back._raw !== undefined)
        throw fail(`${key} 块造出来之后重新解析降级成了原样字节（${back._error || '未注册的块类型'}），拒绝写文件`, { block: key });
      let again;
      try { again = writeAdditionalBlock(key, back, { psb }); } catch (e) {
        throw fail(`${key} 块重新序列化抛错：${e && e.message}`, { block: key });
      }
      if (again.length !== dataWithPad.length)
        throw fail(`${key} 块自检：重序列化长度 ${again.length} ≠ ${dataWithPad.length}`, { block: key });
      for (let k = 0; k < again.length; k++) {
        if (again[k] !== dataWithPad[k])
          throw fail(`${key} 块自检：重序列化在块内偏移 ${k} 对不上（${hex1(dataWithPad[k])} → ${hex1(again[k])}）`, { block: key });
      }
      blockBytes.push(blk);
      blockKeys.push(key);
    }
    return { blockBytes, blockKeys };
  }

  







  function insertNewLayer(ab, state, op, { at, name, blockBytes, blockKeys, fail, warnings, what }) {
    const psd = h.parsePsdFull(ab);
    const s = psd.sections;
    const psb = !!s.psb;
    if (!psd.layers.length) throw fail('本文档没有图层记录，无法插入');

    const nColor = MODE_COLOR_CHANNELS[state.mode];
    const pascal = encodePascal(name);
    if (pascal.lossy)
      warnings.push(`新图层的 Pascal 名含非 ASCII 字符，已按 '?' 落地（真名在 luni 块里，PS 显示的是 luni）`);
    const luni = h.buildBlock('luni', h.encodeUnicode(name), psb);
    const extra = h.concat([u32b(0), u32b(0), pascal.bytes, luni, ...blockBytes]);

    let flags = 0x18;
    if (op.visible === false) flags |= 0x02;
    const opacity = op.opacity === undefined ? 255 : op.opacity;
    const clipping = op.clipping ? 1 : 0;
    const blendKey = op.blendKey || 'norm';

    const chIds = [-1];
    for (let c = 0; c < nColor; c++) chIds.push(c);
    const chParts = [];
    for (const id of chIds) chParts.push(i16b(id), lenField(2, psb));

    const record = h.concat([
      i32b(0), i32b(0), i32b(0), i32b(0),        
      u16b(chIds.length), ...chParts,
      ascii4('8BIM'), ascii4(blendKey),
      u8b(opacity), u8b(clipping), u8b(flags), u8b(0),
      u32b(extra.length), extra,
    ]);
    const chData = h.concat(chIds.map(() => u16b(0)));   

    const orig = h.toU8(ab);
    const recs = psd.layers.map(l => orig.subarray(l.recordStart, l.recordEnd));
    const chans = psd.layers.map(l => orig.subarray(l.chDataStart, l.chDataEnd));
    recs.splice(at, 0, record);
    chans.splice(at, 0, chData);

    const n = recs.length;
    const newCount = s.layerCountRaw >= 0 ? n : -n;      
    const lc = new Uint8Array(2);
    new DataView(lc.buffer).setInt16(0, newCount);

    let li = h.vconcat([lc, ...recs, ...chans]);
    const origLiLen = s.layerInfoEndAbs - s.layerInfoStart;
    const liAlign = origLiLen % 4 === 0 ? 4 : 2;
    if (li.length % liAlign) li = h.vconcat([li, new Uint8Array(liAlign - (li.length % liAlign))]);

    const restOfLmi = orig.subarray(s.globalMaskStart, s.lmiEndAbs);
    let lmi = h.vconcat([lenField(li.length, psb), li, restOfLmi]);
    const origLmiLen = s.lmiEndAbs - s.lmiLenOffset - s.lmiLenFieldSize;
    const lmiAlign = origLmiLen % 4 === 0 ? 4 : 2;
    if (lmi.length % lmiAlign) lmi = h.vconcat([lmi, new Uint8Array(lmiAlign - (lmi.length % lmiAlign))]);

    const out = h.concat([
      orig.subarray(0, s.lmiLenOffset), lenField(lmi.length, psb), lmi, orig.subarray(s.lmiEndAbs),
    ]).buffer;

    
    const doc2 = h.parsePsdDocument(out);
    if (doc2.layers.length !== state.layers.length + 1)
      throw fail(`插入之后图层数是 ${doc2.layers.length}，不是预期的 ${state.layers.length + 1}`, { layers: doc2.layers.length });
    const L = doc2.layers[at];
    if (!L) throw fail(`插入之后 index ${at} 上没有图层`);
    const gotKeys = (L.additionalBlocks || []).map(b => b.key);
    for (const k of blockKeys) {
      if (!gotKeys.includes(k)) throw fail(`插入之后新图层上找不到 ${k} 块（实际有：${gotKeys.join(' ') || '无'}）`, { block: k });
    }
    if ((L.unicodeName || L.name) !== name)
      throw fail(`插入之后新图层的名字是「${L.unicodeName || L.name}」，不是「${name}」`);
    if (L.channels.length !== chIds.length)
      throw fail(`插入之后新图层有 ${L.channels.length} 个通道，不是预期的 ${chIds.length}`);
    for (let c = 0; c < chIds.length; c++) {
      if (L.channels[c].id !== chIds[c] || L.channels[c].length !== 2)
        throw fail(`插入之后新图层的通道 ${c} 是 id=${L.channels[c].id} len=${L.channels[c].length}，预期 id=${chIds[c]} len=2`);
    }
    if (L.bounds.top || L.bounds.left || L.bounds.bottom || L.bounds.right)
      throw fail(`插入之后新图层的 bounds 是 ${JSON.stringify(L.bounds)}，预期 0,0,0,0`);
    const fp = l => `${l.unicodeName || l.name}|${l.bounds.top},${l.bounds.left},${l.bounds.bottom},${l.bounds.right}|${l.channels.map(c => c.id + ':' + c.length).join(',')}`;
    const before = h.parsePsdDocument(ab).layers.map(fp);
    const after = doc2.layers.map(fp);
    after.splice(at, 1);
    for (let k = 0; k < before.length; k++) {
      if (before[k] !== after[k])
        throw fail(`插入之后原来的图层 ${k} 变了：「${before[k]}」→「${after[k]}」`, { layer: k });
    }

    warnings.push(`新建了${what}「${name}」，但文件末尾的合成图（Image Data 段）没有重新渲染：` +
      `PS 打开会重新合成，但只看合成图的读取器（缩略图工具等）看到的还是旧画面`);

    return { buffer: out, chIds, layerCount: doc2.layers.length };
  }

  function applyAddAdjustment(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { kind, at, name, nColor } = plan;
    const spec = ADJ_KINDS[kind];
    const fail = (msg, info) => h.opFail(i, op, msg, { kind, at, ...(info || {}) });

    const psb = !!h.parsePsdFull(ab).sections.psb;

    
    const { blockBytes, blockKeys } = buildSemanticBlocks(buildAdjBlocks(kind, op.values, i, op), psb, fail);

    
    const { buffer: out, chIds, layerCount } =
      insertNewLayer(ab, state, op, { at, name, blockBytes, blockKeys, fail, warnings, what: '调整图层' });

    return {
      buffer: out,
      result: {
        changed: true, at, kind, name, blocks: blockKeys.slice(),
        channels: chIds.slice(), layerCount,
        note: `${plan.note}（块：${blockKeys.join('+')}，通道表 ${chIds.join('/')} 各 2 字节）`,
      },
    };
  }

  
















  function shapeColorOf(op, i) {
    if (op.fill !== undefined) {
      if (!op.fill || typeof op.fill !== 'object' || Array.isArray(op.fill))
        throw h.opFail(i, op, `fill 必须是对象 { type:'solid', color }，收到 ${JSON.stringify(op.fill)}`);
      if (op.fill.type !== undefined && op.fill.type !== 'solid')
        throw h.opFail(i, op,
          `fill.type 目前只支持 'solid'（纯色 SoCo）；渐变（GdFl）与图案（PtFl）填充还没做，` +
          `收到「${op.fill.type}」`, { available: ['solid'] });
    }
    const raw = op.color !== undefined ? op.color : (op.fill && op.fill.color);
    if (raw === undefined) return [0, 0, 0];      
    if (typeof raw === 'string') {
      const c = parseHexColor(raw);
      if (!c) throw h.opFail(i, op, `color 认不出「${raw}」；写成 '#rrggbb' / '#rgb' 或 [r,g,b]（0…255）`);
      return c;
    }
    if (Array.isArray(raw) && raw.length === 3) {
      return raw.map((v, k) => {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255)
          throw h.opFail(i, op, `color[${k}] 必须是 0…255 的数字，收到 ${JSON.stringify(v)}`);
        return v;
      });
    }
    throw h.opFail(i, op, `color 必须是 '#rrggbb' 或 [r,g,b]（0…255），收到 ${JSON.stringify(raw)}`);
  }

  






  const STROKE_CAPS = { butt: 'strokeStyleButtCap', round: 'strokeStyleRoundCap', square: 'strokeStyleSquareCap' };
  const STROKE_JOINS = { miter: 'strokeStyleMiterJoin', round: 'strokeStyleRoundJoin', bevel: 'strokeStyleBevelJoin' };
  const STROKE_ALIGNS = { inside: 'strokeStyleAlignInside', center: 'strokeStyleAlignCenter', outside: 'strokeStyleAlignOutside' };

  
  function strokeOf(op, i) {
    const st = op.stroke;
    if (st === undefined || st === null) return null;
    if (typeof st !== 'object' || Array.isArray(st))
      throw h.opFail(i, op, `stroke 必须是对象 { color, width, align, cap, join, dash, opacity }，收到 ${JSON.stringify(st)}`);
    if (st.enabled === false) return null;
    const num = (k, def, lo, hi) => {
      const v = st[k] === undefined ? def : +st[k];
      if (!Number.isFinite(v) || v < lo || v > hi)
        throw h.opFail(i, op, `stroke.${k} 必须是 ${lo}…${hi} 的数字，收到 ${JSON.stringify(st[k])}`);
      return v;
    };
    const pick = (k, table, def) => {
      const v = st[k] === undefined ? def : st[k];
      if (!Object.prototype.hasOwnProperty.call(table, v))
        throw h.opFail(i, op, `stroke.${k} 不认识「${v}」；可用：${Object.keys(table).join(' / ')}`, { available: Object.keys(table) });
      return table[v];
    };
    let color = [0, 0, 0];
    if (st.color !== undefined) {
      if (typeof st.color === 'string') {
        const c = parseHexColor(st.color);
        if (!c) throw h.opFail(i, op, `stroke.color 认不出「${st.color}」；写成 '#rrggbb' / '#rgb' 或 [r,g,b]`);
        color = c;
      } else if (Array.isArray(st.color) && st.color.length === 3) {
        color = st.color.map((v, k) => {
          if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255)
            throw h.opFail(i, op, `stroke.color[${k}] 必须是 0…255 的数字，收到 ${JSON.stringify(v)}`);
          return v;
        });
      } else throw h.opFail(i, op, `stroke.color 必须是 '#rrggbb' 或 [r,g,b]，收到 ${JSON.stringify(st.color)}`);
    }
    let dash = [];
    if (st.dash !== undefined) {
      if (!Array.isArray(st.dash)) throw h.opFail(i, op, `stroke.dash 必须是数组（如 [3,2]，单位像素），收到 ${JSON.stringify(st.dash)}`);
      dash = st.dash.map((v, k) => {
        const n = +v;
        if (!Number.isFinite(n) || n <= 0) throw h.opFail(i, op, `stroke.dash[${k}] 必须是正数，收到 ${JSON.stringify(v)}`);
        return n;
      });
    }
    return {
      color,
      width: num('width', 1, 0.01, 1000),
      opacity: num('opacity', 100, 0, 100),
      dashOffset: num('dashOffset', 0, -10000, 10000),
      cap: pick('cap', STROKE_CAPS, 'butt'),
      join: pick('join', STROKE_JOINS, 'miter'),
      align: pick('align', STROKE_ALIGNS, 'center'),
      dash,
    };
  }
  
  function strokeStyleModel(st) {
    return {
      descVersion: 16,
      desc: {
        __name: '', __classID: 'strokeStyle',
        strokeStyleVersion: 2,
        __long: { strokeStyleVersion: true },
        strokeEnabled: true,
        fillEnabled: true,
        strokeStyleLineWidth: pxl(st.width),
        strokeStyleLineDashOffset: pxl(st.dashOffset),
        strokeStyleMiterLimit: 100,
        __doub: { strokeStyleMiterLimit: true, strokeStyleResolution: true },
        strokeStyleLineCapType: enm('strokeStyleLineCapType', st.cap),
        strokeStyleLineJoinType: enm('strokeStyleLineJoinType', st.join),
        strokeStyleLineAlignment: enm('strokeStyleLineAlignment', st.align),
        strokeStyleScaleLock: false,
        strokeStyleStrokeAdjust: false,
        strokeStyleLineDashSet: st.dash.map(v => pxl(v)),
        strokeStyleBlendMode: enm('BlnM', 'Nrml'),
        strokeStyleOpacity: pct(st.opacity),
        strokeStyleContent: { __name: '', __classID: 'solidColorLayer', 'Clr ': rgb(st.color[0], st.color[1], st.color[2]) },
        strokeStyleResolution: 72,
      },
    };
  }

  









  const ORIGIN_TYPES = { rect: 1, roundRect: 2, ellipse: 5 };
  function originOf(op, i, key = 'origin') {
    const o = op[key];
    if (o === undefined || o === null) return null;
    if (typeof o !== 'object' || Array.isArray(o)) throw h.opFail(i, op, `${key} 必须是对象 { type, left, top, right, bottom, radii? }`);
    if (!(o.type in ORIGIN_TYPES))
      throw h.opFail(i, op, `${key}.type 不认识「${o.type}」；可用：${Object.keys(ORIGIN_TYPES).join(' / ')}`, { available: Object.keys(ORIGIN_TYPES) });
    const n = k => { const v = +o[k]; if (!Number.isFinite(v)) throw h.opFail(i, op, `${key}.${k} 必须是数字，收到 ${JSON.stringify(o[k])}`); return v; };
    const box = { left: n('left'), top: n('top'), right: n('right'), bottom: n('bottom') };
    if (!(box.right > box.left && box.bottom > box.top)) throw h.opFail(i, op, `${key} 的宽高都要 > 0，收到 ${JSON.stringify(box)}`);
    let radii = [0, 0, 0, 0];
    if (o.radii !== undefined) {
      if (!Array.isArray(o.radii) || o.radii.length !== 4 || o.radii.some(v => !Number.isFinite(+v) || +v < 0))
        throw h.opFail(i, op, `${key}.radii 必须是 4 个 ≥0 的数字 [左上, 右上, 右下, 左下]，收到 ${JSON.stringify(o.radii)}`);
      radii = o.radii.map(Number);
    }
    const type = o.type === 'rect' && radii.some(v => v > 0) ? 'roundRect' : o.type;
    return { type, ...box, radii };
  }
  function vogkModel(o) {
    const u = v => pxl(v);
    const pnt = (x, y) => ({ __name: '', __classID: 'Pnt ', Hrzn: x, Vrtc: y, __doub: { Hrzn: true, Vrtc: true } });
    const item = {
      __name: '', __classID: 'null',
      keyOriginType: ORIGIN_TYPES[o.type],
      keyOriginResolution: 72,
      __long: { keyOriginType: true, keyOriginIndex: true },
      __doub: { keyOriginResolution: true },
    };
    if (o.type === 'roundRect') item.keyOriginRRectRadii = {
      __name: '', __classID: 'radii', unitValueQuadVersion: 1, __long: { unitValueQuadVersion: true },
      topRight: u(o.radii[1]), topLeft: u(o.radii[0]), bottomLeft: u(o.radii[3]), bottomRight: u(o.radii[2]),
    };
    item.keyOriginShapeBBox = {
      __name: '', __classID: 'unitRect', unitValueQuadVersion: 1, __long: { unitValueQuadVersion: true },
      'Top ': u(o.top), Left: u(o.left), Btom: u(o.bottom), Rght: u(o.right),
    };
    item.keyOriginBoxCorners = {
      __name: '', __classID: 'null',
      rectangleCornerA: pnt(o.left, o.top), rectangleCornerB: pnt(o.right, o.top),
      rectangleCornerC: pnt(o.right, o.bottom), rectangleCornerD: pnt(o.left, o.bottom),
    };
    item.Trnf = { __name: '', __classID: 'Trnf', xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0,
                  __doub: { xx: true, xy: true, yx: true, yy: true, tx: true, ty: true } };
    item.keyOriginIndex = 0;
    return { version: 1, descVersion: 16, desc: { __name: '', __classID: 'null', keyDescriptorList: [item] } };
  }

  function validateAddShape(state, op, i) {
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持新建图层`, { section: bad.section });
    if (!state.layers.length)
      throw h.opFail(i, op, '本文档没有图层信息段（一个图层都没有），本 op 只会往已有的层信息段里插记录，不会从零建段');
    
    if (state.mode !== 3)
      throw h.opFail(i, op,
        `形状图层的 SoCo 填充目前只造 RGBC 颜色描述符，本文档是 ${MODE_NAMES[state.mode] || state.mode} 模式（mode ${state.mode}），` +
        `没有语料能确认该写哪种颜色描述符，拒绝乱猜`, { mode: state.mode });
    const nColor = MODE_COLOR_CHANNELS[state.mode];

    const at = op.at === undefined ? state.layers.length : op.at;
    if (!Number.isInteger(at) || at < 0 || at > state.layers.length)
      throw h.opFail(i, op, `at 必须是 0…${state.layers.length} 的整数（新图层在「底=0」序里的下标，${state.layers.length} = 最上面；默认最上面），收到 ${JSON.stringify(op.at)}`,
        { layers: state.layers.length });

    const name = op.name === undefined ? '形状 1' : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);

    if (op.opacity !== undefined && (!Number.isInteger(op.opacity) || op.opacity < 0 || op.opacity > 255))
      throw h.opFail(i, op, `opacity 必须是 0…255 的整数（255 = 不透明），收到 ${JSON.stringify(op.opacity)}`);
    if (op.visible !== undefined && typeof op.visible !== 'boolean')
      throw h.opFail(i, op, 'visible 必须是布尔值');
    if (op.clipping !== undefined && typeof op.clipping !== 'boolean' && op.clipping !== 0 && op.clipping !== 1)
      throw h.opFail(i, op, 'clipping 必须是布尔值或 0/1');
    if (op.blendKey !== undefined) {
      if (typeof op.blendKey !== 'string' || op.blendKey.length !== 4)
        throw h.opFail(i, op, `blendKey 必须是 4 个字符（不足补空格，如 'mul '），收到 ${JSON.stringify(op.blendKey)}`);
      if (!h.BLEND_KEYS.has(op.blendKey))
        throw h.opFail(i, op, `blendKey "${op.blendKey}" 不是 PS 认识的混合模式；可用：${[...h.BLEND_KEYS].join(' ')}`);
    }

    const color = shapeColorOf(op, i);
    const stroke = strokeOf(op, i);
    const origin = originOf(op, i);
    const fail = (msg, info) => h.opFail(i, op, msg, info);
    const norm = normalizeSubpathInput(op.subpaths, op.units, fail);
    
    freshPathRecords(norm, state.width, state.height, fail);

    const knots = norm.subpaths.reduce((n, sp) => n + sp.knots.length, 0);
    const hex6 = color.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    return {
      affected: [at], changed: ['layers'], opIndex: i, at, name, nColor, color, norm, stroke, origin,
      note: `在 index ${at}${at >= state.layers.length ? '（最上面）' : ''} 新建形状图层「${name}」` +
            `（${norm.subpaths.length} 条子路径 / ${knots} 个锚点，填充 #${hex6}` +
            `${stroke ? `，描边 ${stroke.width}px #${stroke.color.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}` : ''}）`,
    };
  }

  function applyAddShape(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { at, name, color, norm, stroke, origin } = plan;
    const fail = (msg, info) => h.opFail(i, op, msg, { at, ...(info || {}) });

    const full = h.parsePsdFull(ab);
    const psb = !!full.sections.psb;
    const { width, height } = full.header;

    
    const records = freshPathRecords(norm, width, height, fail);
    const fillDesc = () => ({ __name: '', __classID: 'null', 'Clr ': rgb(color[0], color[1], color[2]) });
    const models = [
      { key: 'SoCo', model: { descVersion: 16, desc: fillDesc() } },
      
      ...(stroke ? [{ key: 'vscg', model: { contentKey: 'SoCo', descVersion: 16, desc: fillDesc() } }] : []),
      { key: 'vmsk', model: { version: 3, flags: 0, path: { records } } },
      ...(origin ? [{ key: 'vogk', model: vogkModel(origin) }] : []),
      ...(stroke ? [{ key: 'vstk', model: strokeStyleModel(stroke) }] : []),
    ];
    const { blockBytes, blockKeys } = buildSemanticBlocks(models, psb, fail);

    
    const { buffer: out, chIds, layerCount } =
      insertNewLayer(ab, state, op, { at, name, blockBytes, blockKeys, fail, warnings, what: '形状图层' });

    


    const got = getVectorMaskPath(out, at, { units: norm.units });
    if (!got) throw fail('插入之后新图层上读不到矢量蒙版路径（vmsk 没写进去？）');
    if (got.subpaths.length !== norm.subpaths.length)
      throw fail(`读回来 ${got.subpaths.length} 条子路径，预期 ${norm.subpaths.length}`);
    const tolOf = dim => (norm.units === 'fixed' ? 0 : norm.units === 'normalized' ? 1e-7 : dim / 0x1000000 + 1e-9);
    const tolX = tolOf(width), tolY = tolOf(height);
    norm.subpaths.forEach((sp, si) => {
      const g = got.subpaths[si];
      if (g.knots.length !== sp.knots.length)
        throw fail(`子路径 ${si} 读回 ${g.knots.length} 个锚点，预期 ${sp.knots.length}`, { subpath: si });
      if (g.closed !== (sp.closed === undefined ? true : sp.closed))
        throw fail(`子路径 ${si} 读回 closed=${g.closed}，预期 ${sp.closed === undefined ? true : sp.closed}`, { subpath: si });
      sp.knots.forEach((kn, ki) => {
        for (const f of ['anchor', 'in', 'out']) {
          const w = kn[f], r = g.knots[ki][f];
          if (Math.abs(r[0] - w[0]) > tolX || Math.abs(r[1] - w[1]) > tolY)
            throw fail(`子路径 ${si} 的第 ${ki} 个锚点 ${f} 写进去是 (${w[0]}, ${w[1]})，读回来是 (${r[0]}, ${r[1]})，超出定点量化误差`,
              { subpath: si, knot: ki, field: f });
        }
      });
    });

    return {
      buffer: out,
      result: {
        changed: true, at, name, color: color.slice(),
        stroke: stroke ? { ...stroke, color: stroke.color.slice(), dash: stroke.dash.slice() } : null,
        blocks: blockKeys.slice(), channels: chIds.slice(), layerCount,
        subpaths: norm.subpaths.length, knots: got.knotCount,
        note: `${plan.note}（块：${blockKeys.join('+')}，通道表 ${chIds.join('/')} 各 2 字节）`,
      },
    };
  }

  










  const GRAD_TYPES = { linear: 'Lnr ', radial: 'Rdl ', angle: 'Angl', reflected: 'Rflc', diamond: 'Dmnd' };
  const FILL_KIND_KEY = { solid: 'SoCo', gradient: 'GdFl', pattern: 'PtFl' };
  const FILL_KIND_LABEL = { solid: '纯色填充', gradient: '渐变填充', pattern: '图案填充' };

  
  function colorArg(v, where, i, op, def) {
    if (v === undefined || v === null) return def;
    if (typeof v === 'string') {
      const c = parseHexColor(v);
      if (!c) throw h.opFail(i, op, `${where} 认不出「${v}」；写成 '#rrggbb' / '#rgb' 或 [r,g,b]（0…255）`);
      return c;
    }
    if (Array.isArray(v) && v.length === 3) return v.map((n, k) => {
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 255)
        throw h.opFail(i, op, `${where}[${k}] 必须是 0…255 的数字，收到 ${JSON.stringify(n)}`);
      return n;
    });
    throw h.opFail(i, op, `${where} 必须是 '#rrggbb' 或 [r,g,b]（0…255），收到 ${JSON.stringify(v)}`);
  }

  
  function gradientModel(g, i, op) {
    const fail = msg => h.opFail(i, op, msg);
    if (g !== undefined && (!g || typeof g !== 'object' || Array.isArray(g)))
      throw fail(`gradient 必须是对象 { type, angle, stops, … }，收到 ${JSON.stringify(g)}`);
    const o = g || {};
    const type = o.type === undefined ? 'linear' : o.type;
    if (!Object.prototype.hasOwnProperty.call(GRAD_TYPES, type))
      throw fail(`gradient.type 不认识「${type}」；可用：${Object.keys(GRAD_TYPES).join(' / ')}`);
    const num = (k, def, lo, hi) => {
      const v = o[k] === undefined ? def : +o[k];
      if (!Number.isFinite(v) || v < lo || v > hi) throw fail(`gradient.${k} 必须是 ${lo}…${hi} 的数字，收到 ${JSON.stringify(o[k])}`);
      return v;
    };
    const angle = num('angle', 90, -360, 360);
    const scale = num('scale', 100, 1, 1000);
    

    const off = o.offset || {};
    const offX = off.x === undefined ? 0 : +off.x, offY = off.y === undefined ? 0 : +off.y;
    if (![offX, offY].every(v => Number.isFinite(v) && v >= -1000 && v <= 1000))
      throw fail(`gradient.offset 必须是 { x, y }（-1000…1000 的百分比），收到 ${JSON.stringify(o.offset)}`);
    const smoothness = Math.round(num('smoothness', 100, 0, 100) * 40.96);
    const METHOD = { perceptual: 'Perc', linear: 'Lnr ', classic: 'Gcls', smooth: 'Smoo', stripes: 'Stri' };
    if (o.method !== undefined && !METHOD[o.method])
      throw fail(`gradient.method 不认识「${o.method}」；可用：${Object.keys(METHOD).join(' / ')}`);
    const method = o.method === undefined ? null : METHOD[o.method];
    
    let stops = o.stops;
    if (stops === undefined) stops = [{ color: [0, 0, 0], location: 0 }, { color: [255, 255, 255], location: 1 }];
    if (!Array.isArray(stops) || stops.length < 2)
      throw fail(`gradient.stops 至少要两个色标（形如 [{color:'#000',location:0},{color:'#fff',location:1}]），收到 ${JSON.stringify(o.stops)}`);
    if (stops.length > 64) throw fail(`gradient.stops 最多 64 个，收到 ${stops.length}`);
    const loc = (v, where, def) => {
      const n = v === undefined ? def : +v;
      if (!Number.isFinite(n) || n < 0 || n > 1) throw fail(`${where} 必须是 0…1 的数字（0 = 起点，1 = 终点），收到 ${JSON.stringify(v)}`);
      return Math.round(n * 4096);
    };
    const mid = (v, where) => {
      const n = v === undefined ? 50 : +v;
      if (!Number.isFinite(n) || n < 1 || n > 99) throw fail(`${where} 必须是 1…99（两个色标之间的中点位置，%），收到 ${JSON.stringify(v)}`);
      return Math.round(n);
    };
    const clrs = stops.map((st, k) => {
      if (!st || typeof st !== 'object') throw fail(`gradient.stops[${k}] 必须是对象 { color, location }`);
      const c = colorArg(st.color, `gradient.stops[${k}].color`, i, op, [0, 0, 0]);
      return {
        __name: '', __classID: 'Clrt',
        'Clr ': rgb(c[0], c[1], c[2]),
        Type: enm('Clry', 'UsrS'),
        Lctn: loc(st.location, `gradient.stops[${k}].location`, k / (stops.length - 1)),
        __long: { Lctn: true, Mdpn: true },
        Mdpn: mid(st.midpoint, `gradient.stops[${k}].midpoint`),
      };
    });
    
    const ops = o.opacityStops === undefined ? [{ opacity: 100, location: 0 }, { opacity: 100, location: 1 }] : o.opacityStops;
    if (!Array.isArray(ops) || ops.length < 2) throw fail('gradient.opacityStops 至少要两个（不给就默认两端不透明）');
    const trns = ops.map((st, k) => {
      if (!st || typeof st !== 'object') throw fail(`gradient.opacityStops[${k}] 必须是对象 { opacity, location }`);
      const v = st.opacity === undefined ? 100 : +st.opacity;
      if (!Number.isFinite(v) || v < 0 || v > 100) throw fail(`gradient.opacityStops[${k}].opacity 必须是 0…100，收到 ${JSON.stringify(st.opacity)}`);
      return {
        __name: '', __classID: 'TrnS',
        Opct: pct(v),
        Lctn: loc(st.location, `gradient.opacityStops[${k}].location`, k / (ops.length - 1)),
        __long: { Lctn: true, Mdpn: true },
        Mdpn: mid(st.midpoint, `gradient.opacityStops[${k}].midpoint`),
      };
    });

    for (const list of [clrs, trns]) {
      const mids = list.map(s => s.Mdpn);
      list.forEach((s, k) => { s.Mdpn = mids[(k + list.length - 1) % list.length]; });
    }
    if (o.name !== undefined && (typeof o.name !== 'string' || !o.name.length))
      throw fail('gradient.name 必须是非空字符串');
    


    let noiseGrad = null;
    if (o.noise !== undefined) {
      const N = o.noise;
      if (!N || typeof N !== 'object') throw fail('gradient.noise 必须是对象 { roughness, model, min, max, restrict, transparency, seed }');
      const cl = (v, d) => { const n = v === undefined ? d : +v; if (!Number.isFinite(n)) throw fail(`gradient.noise 里有非数字：${JSON.stringify(v)}`); return Math.max(0, Math.min(100, n)); };
      const four = (a, d) => { const v = [0, 1, 2, 3].map(k => Math.round(cl(a && a[k], d))); v.__long = { 0: true, 1: true, 2: true, 3: true }; return v; };
      const model = N.model === undefined ? 'rgb' : N.model;
      if (!['rgb', 'hsb', 'lab'].includes(model)) throw fail(`gradient.noise.model 只能是 rgb / hsb / lab，收到 ${JSON.stringify(N.model)}`);
      noiseGrad = {
        __name: 'Gradient', __classID: 'Grdn',
        'Nm  ': o.name || '杂色',
        GrdF: enm('GrdF', 'ClNs'),
        ShTr: !!N.transparency,
        VctC: !!N.restrict,
        ClrS: enm('ClrS', model === 'hsb' ? 'HSBl' : model === 'lab' ? 'LbCl' : 'RGBC'),
        RndS: ((+N.seed >>> 0) || 1) | 0,
        Smth: Math.round(cl(N.roughness, 50) * 40.96),
        'Mnm ': four(N.min, 0),
        'Mxm ': four(N.max, 100),
        __long: { RndS: true, Smth: true },
      };
    }
    return {
      descVersion: 16,
      desc: {
        __name: '', __classID: 'null',
        Dthr: o.dither === undefined ? true : !!o.dither,
        Rvrs: !!o.reverse,
        Angl: ang(angle),
        Type: enm('GrdT', GRAD_TYPES[type]),
        Algn: o.align === undefined ? true : !!o.align,
        'Scl ': pct(scale),
        Ofst: { __name: '', __classID: 'Pnt ', Hrzn: pct(offX), Vrtc: pct(offY) },
        
        ...(method ? { gradientsInterpolationMethod: enm('gradientInterpolationMethodType', method) } : {}),
        Grad: noiseGrad || {
          __name: 'Gradient', __classID: 'Grdn',
          'Nm  ': o.name || '渐变',
          GrdF: enm('GrdF', 'CstS'),
          Intr: smoothness,
          __doub: { Intr: true },
          Clrs: clrs,
          Trns: trns,
        },
      },
    };
  }

  
  function patternModel(pt, i, op) {
    const fail = msg => h.opFail(i, op, msg);
    if (!pt || typeof pt !== 'object' || Array.isArray(pt))
      throw fail("图案填充要 pattern:{ name:'图案名', id:'图案 uuid' } —— 它指向文档全局图案资源（Patt 块）里的一个图案，" +
        '本模块没法凭空造一个图案出来');
    if (typeof pt.name !== 'string' || !pt.name.length) throw fail('pattern.name 必须是非空字符串（图案名）');
    if (typeof pt.id !== 'string' || !pt.id.length) throw fail('pattern.id 必须是非空字符串（图案 uuid，来自文档的 Patt 资源）');
    const scale = pt.scale === undefined ? 100 : +pt.scale;
    if (!Number.isFinite(scale) || scale < 1 || scale > 1000) throw fail(`pattern.scale 必须是 1…1000，收到 ${JSON.stringify(pt.scale)}`);
    return {
      descVersion: 16,
      desc: {
        __name: '', __classID: 'null',
        'Scl ': pct(scale),
        Lnkd: pt.linked === undefined ? true : !!pt.linked,
        Ptrn: { __name: '', __classID: 'Ptrn', 'Nm  ': pt.name, Idnt: pt.id },
        Angl: ang(pt.angle === undefined ? 0 : +pt.angle || 0),
        phase: { __name: '', __classID: 'Pnt ', Hrzn: 0, Vrtc: 0, __long: { Hrzn: true, Vrtc: true } },
      },
    };
  }

  function validateAddFill(state, op, i) {
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持新建图层`, { section: bad.section });
    if (!state.layers.length)
      throw h.opFail(i, op, '本文档没有图层信息段（一个图层都没有），本 op 只会往已有的层信息段里插记录，不会从零建段');
    if (state.mode !== 3)
      throw h.opFail(i, op,
        `填充图层的颜色描述符目前只造 RGBC，本文档是 ${MODE_NAMES[state.mode] || state.mode} 模式（mode ${state.mode}），` +
        '没有语料能确认该写哪种颜色描述符，拒绝乱猜', { mode: state.mode });
    const nColor = MODE_COLOR_CHANNELS[state.mode];

    const kind = op.kind === undefined ? 'solid' : op.kind;
    if (!Object.prototype.hasOwnProperty.call(FILL_KIND_KEY, kind))
      throw h.opFail(i, op, `kind 不认识「${kind}」；可用：${Object.keys(FILL_KIND_KEY).join(' / ')}`,
        { available: Object.keys(FILL_KIND_KEY) });

    const at = op.at === undefined ? state.layers.length : op.at;
    if (!Number.isInteger(at) || at < 0 || at > state.layers.length)
      throw h.opFail(i, op, `at 必须是 0…${state.layers.length} 的整数（新图层在「底=0」序里的下标，${state.layers.length} = 最上面；默认最上面），收到 ${JSON.stringify(op.at)}`,
        { layers: state.layers.length });

    const name = op.name === undefined ? FILL_KIND_LABEL[kind] : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);
    if (op.opacity !== undefined && (!Number.isInteger(op.opacity) || op.opacity < 0 || op.opacity > 255))
      throw h.opFail(i, op, `opacity 必须是 0…255 的整数（255 = 不透明），收到 ${JSON.stringify(op.opacity)}`);
    if (op.visible !== undefined && typeof op.visible !== 'boolean') throw h.opFail(i, op, 'visible 必须是布尔值');
    if (op.clipping !== undefined && typeof op.clipping !== 'boolean' && op.clipping !== 0 && op.clipping !== 1)
      throw h.opFail(i, op, 'clipping 必须是布尔值或 0/1');
    if (op.blendKey !== undefined) {
      if (typeof op.blendKey !== 'string' || op.blendKey.length !== 4)
        throw h.opFail(i, op, `blendKey 必须是 4 个字符（不足补空格，如 'mul '），收到 ${JSON.stringify(op.blendKey)}`);
      if (!h.BLEND_KEYS.has(op.blendKey))
        throw h.opFail(i, op, `blendKey "${op.blendKey}" 不是 PS 认识的混合模式；可用：${[...h.BLEND_KEYS].join(' ')}`);
    }

    
    const model = kind === 'solid'
      ? { descVersion: 16, desc: { __name: '', __classID: 'null', 'Clr ': (c => rgb(c[0], c[1], c[2]))(colorArg(op.color, 'color', i, op, [0, 0, 0])) } }
      : kind === 'gradient' ? gradientModel(op.gradient, i, op) : patternModel(op.pattern, i, op);

    return {
      affected: [at], changed: ['layers'], opIndex: i, at, name, nColor, kind, model,
      note: `在 index ${at}${at >= state.layers.length ? '（最上面）' : ''} 新建${FILL_KIND_LABEL[kind]}图层「${name}」（块：${FILL_KIND_KEY[kind]}）`,
    };
  }

  function applyAddFill(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { at, name, kind, model } = plan;
    const fail = (msg, info) => h.opFail(i, op, msg, { at, kind, ...(info || {}) });
    const psb = !!h.parsePsdFull(ab).sections.psb;

    const { blockBytes, blockKeys } = buildSemanticBlocks([{ key: FILL_KIND_KEY[kind], model }], psb, fail);
    const { buffer: out, chIds, layerCount } =
      insertNewLayer(ab, state, op, { at, name, blockBytes, blockKeys, fail, warnings, what: FILL_KIND_LABEL[kind] + '图层' });

    return {
      buffer: out,
      result: {
        changed: true, at, name, kind, blocks: blockKeys.slice(),
        channels: chIds.slice(), layerCount,
        note: `${plan.note}，通道表 ${chIds.join('/')} 各 2 字节`,
      },
    };
  }


  














  function validateAddText(state, op, i) {
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持新建图层`, { section: bad.section });
    if (!state.layers.length)
      throw h.opFail(i, op, '本文档没有图层信息段（一个图层都没有），本 op 只会往已有的层信息段里插记录');
    if (typeof op.text !== 'string' || !op.text.length)
      throw h.opFail(i, op, 'text 必须是非空字符串（要写的文字内容）');
    if (op.text.length > 30000)
      throw h.opFail(i, op, `text 太长（${op.text.length} 字符）`);
    const at = op.at === undefined ? state.layers.length : op.at;
    if (!Number.isInteger(at) || at < 0 || at > state.layers.length)
      throw h.opFail(i, op, `at 必须是 0…${state.layers.length} 的整数（新图层在「底=0」序里的下标，${state.layers.length} = 最上面），收到 ${JSON.stringify(op.at)}`,
        { layers: state.layers.length });
    
    const firstLine = op.text.split(/\r?\n/)[0].slice(0, 60) || '文字';
    const name = op.name === undefined ? firstLine : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);
    const at2 = { x: 0, y: 0 };
    if (op.at2 !== undefined) throw h.opFail(i, op, '没有 at2 这个参数；位置请用 x / y');
    for (const k of ['x', 'y']) {
      if (op[k] === undefined) continue;
      if (typeof op[k] !== 'number' || !Number.isFinite(op[k]))
        throw h.opFail(i, op, `${k} 必须是有限数字（文字基线原点的文档坐标）`);
      at2[k] = op[k];
    }
    if (op.orientation !== undefined && !['horizontal', 'vertical'].includes(op.orientation)) throw h.opFail(i, op, 'orientation 必须是 horizontal 或 vertical');
    if (op.fontSize !== undefined && (!(typeof op.fontSize === 'number') || !(op.fontSize > 0) || op.fontSize > 5000))
      throw h.opFail(i, op, `fontSize 必须是 0…5000 之间的正数，收到 ${JSON.stringify(op.fontSize)}`);
    if (op.color !== undefined) colorArg(op.color, 'color', i, op, [0, 0, 0]);
    if (op.box !== undefined && !(Array.isArray(op.box) && op.box.length === 2 && op.box.every(v => typeof v === 'number' && v > 0 && v < 300000)))
      throw h.opFail(i, op, `box 必须是 [宽, 高]（段落文字框尺寸，正数），收到 ${JSON.stringify(op.box)}`);
    if (op.font !== undefined && (typeof op.font !== 'string' || !op.font.length))
      throw h.opFail(i, op, 'font 必须是非空字符串（PostScript 字体名，例如 ArialMT）');
    if (op.opacity !== undefined && (!Number.isInteger(op.opacity) || op.opacity < 0 || op.opacity > 255))
      throw h.opFail(i, op, `opacity 必须是 0…255 的整数，收到 ${JSON.stringify(op.opacity)}`);
    if (op.visible !== undefined && typeof op.visible !== 'boolean') throw h.opFail(i, op, 'visible 必须是布尔值');
    return {
      affected: [at], changed: ['layers'], opIndex: i, at, name, pos: at2,
      note: `在 index ${at}${at >= state.layers.length ? '（最上面）' : ''} 新建文字图层「${name}」（块：TySh）`,
    };
  }

  function applyAddText(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { at, name, pos } = plan;
    const fail = (msg, info) => h.opFail(i, op, msg, { at, ...(info || {}) });
    const psb = !!h.parsePsdFull(ab).sections.psb;

    
    let tpl;
    try { tpl = parseTyShData(textTemplateBytes()); }
    catch (e) { throw fail(`文字模板读不出来（${e.message}）—— core/text-template.js 是生成物，跑 tools/build-text-template.js 重建`); }
    
    tpl.textTransform = [1, 0, 0, 1, pos.x, pos.y];
    

    try {
      const used = h.parsePsdFull(ab).layers.filter(l => l.text).map(l => +l.text.TextIndex).filter(Number.isFinite);
      tpl.text = { ...tpl.text, TextIndex: used.length ? Math.max(...used) + 1 : 0 };
    } catch {  }
    
    const style = {};
    if (op.fontSize !== undefined) style.fontSize = op.fontSize;
    if (op.color !== undefined) {
      const [r, g, b] = colorArg(op.color, 'color', i, op, [0, 0, 0]);
      style.color = [r / 255, g / 255, b / 255, 1];
    }
    let engine = null;
    if (Object.keys(style).length || op.font !== undefined || op.box) {
      try {
        engine = parseEngineData(tpl.text['EngineData']);
        if (Object.keys(style).length) setEngineStyle(engine, style);
        if (op.font !== undefined) setEngineFont(engine, op.font);
        if (op.box) setEngineParagraphBox(engine, op.box[0], op.box[1]);   
      } catch (e) {
        engine = null;
        warnings.push(`文字图层「${name}」的字号 / 颜色 / 字体没能写进 EngineData（${e.message}），这一层用的是模板的默认样式`);
      }
    }
    
    let bytes;
    try { bytes = buildTyShFromText(tpl, op.text, { ...(op.orientation ? { orientation: op.orientation } : {}), ...(engine ? { engineData: engine } : {}), ...(op.font !== undefined ? { font: op.font } : {}) }); }
    catch (e) { throw fail(`TySh 生成失败：${e.message}`); }

    const blockBytes = [h.buildBlock('TySh', bytes, psb)];
    let { buffer: out, chIds, layerCount } =
      insertNewLayer(ab, state, op, { at, name, blockBytes, blockKeys: ['TySh'], fail, warnings, what: '文字图层' });

    

    out = removeGlobalBlocksInto(out);
    
    let back = null;
    try { back = h.parsePsdFull(out).layers[at]; } catch { back = null; }
    if (!back || !back.text || back.text['Txt '] === undefined)
      throw fail('新建的文字图层读不回文字描述符（已放弃这次改动）');
    const wrote = String(back.text['Txt ']).replace(/\r/g, '\n').replace(/\n$/, '');
    const want = op.text.replace(/\r\n|\r/g, '\n');
    if (wrote !== want)
      throw fail(`写进去的文字与读回来的不一致（写 ${JSON.stringify(want)}，读 ${JSON.stringify(wrote)}）`);

    return {
      buffer: out,
      result: {
        changed: true, at, name, blocks: ['TySh'], channels: chIds.slice(), layerCount,
        note: `${plan.note}，通道表 ${chIds.join('/')} 各 2 字节`,
      },
    };
  }

  






  
  function dividerOfHeader(layers, h) {
    let depth = 0;
    for (let k = h; k >= 0; k--) {
      const gt = layers[k].groupType;
      if (gt === 1 || gt === 2) depth++;
      else if (gt === 3) { depth--; if (!depth) return k; }
    }
    return -1;
  }
  function validateGroupLayers(state, op, i) {
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持编组`, { section: bad.section });
    if (!state.layers.length) throw h.opFail(i, op, '本文档没有图层，无法编组');
    const raw = op.indices !== undefined ? op.indices : (op.index !== undefined ? [op.index] : null);
    if (!Array.isArray(raw) || !raw.length)
      throw h.opFail(i, op, 'indices 必须是非空数组（要包进组的图层下标，底=0；也接受单个 index）', { got: JSON.stringify(op.indices ?? op.index) });
    const memberSet = new Set();
    for (const v of raw) {
      if (!Number.isInteger(v) || v < 0 || v >= state.layers.length)
        throw h.opFail(i, op, `indices 里的 ${JSON.stringify(v)} 越界（本文档 ${state.layers.length} 个图层，合法 0…${state.layers.length - 1}）`);
      const gt = state.layers[v].groupType;
      if (gt === 3) throw h.opFail(i, op, `index ${v} 是分隔记录 —— 请选组员或组头（选中组头会带着整个组编组）`);
      if (gt === 1) {
        const d = dividerOfHeader(state.layers, v);
        if (d < 0) throw h.opFail(i, op, `index ${v} 的组头找不到配对的分隔记录（文件结构异常）`, { index: v });
        for (let k = d; k <= v; k++) {
          if (memberSet.has(k))
            throw h.opFail(i, op, `index ${k} 同时落在两组选择里（组员与组头同选）：一次只编一层组`);
          memberSet.add(k);
        }
      } else {
        if (memberSet.has(v)) throw h.opFail(i, op, `index ${v} 重复出现（它已在某个被选组的范围内）`);
        memberSet.add(v);
      }
    }
    const indices = [...memberSet].sort((a, b) => a - b);
    const name = op.name === undefined ? '组' : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);
    return { affected: indices, changed: ['layers'], indices, name,
             note: `把 ${raw.length} 项（${indices.length} 条记录）包进新组「${name}」` };
  }

  function applyGroupLayers(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { indices, name } = plan;
    const fail = (msg, info) => h.opFail(i, op, msg, { indices: indices.slice(), ...(info || {}) });
    const psd = h.parsePsdFull(ab);
    const s = psd.sections;
    const psb = !!s.psb;
    if (psd.layers.length !== state.layers.length)
      throw fail('文档状态与校验时不一致，拒绝执行');
    const memberSet = new Set(indices);
    const top = indices[indices.length - 1];

    
    const mkGroupRecord = (nameStr, lsctModel, blendKey) => {
      const pascal = encodePascal(nameStr);
      if (pascal.lossy) warnings.push(`组名「${nameStr}」的 Pascal 名含非 ASCII 字符，已按 '?' 落地（真名在 luni 块里）`);
      const extra = h.concat([
        u32b(0), u32b(0), pascal.bytes,
        h.buildBlock('luni', h.encodeUnicode(nameStr), psb),
        h.buildBlock('lsct', writeAdditionalBlock('lsct', lsctModel, { psb }), psb),
      ]);
      const chIds = [-1, 0, 1, 2];
      const chParts = [];
      for (const id of chIds) chParts.push(i16b(id), lenField(2, psb));
      return {
        record: h.concat([
          i32b(0), i32b(0), i32b(0), i32b(0), u16b(chIds.length), ...chParts,
          ascii4('8BIM'), ascii4(blendKey), u8b(255), u8b(0), u8b(0x18), u8b(0),
          u32b(extra.length), extra,
        ]),
        chData: h.concat(chIds.map(() => u16b(0))),
      };
    };
    const dvr = mkGroupRecord('</Layer group>', { sectionType: 3 }, 'norm');
    const hdr = mkGroupRecord(name, { sectionType: 1, blendSig: '8BIM', blendKey: 'pass', subType: 0 }, 'pass');

    const orig = h.toU8(ab);
    

    const kept = [];                                  
    let insertPos = 0;
    psd.layers.forEach((l, k) => {
      if (!memberSet.has(k) && k < top) insertPos++;
      if (memberSet.has(k)) return;
      kept.push({ rec: orig.subarray(l.recordStart, l.recordEnd), chan: orig.subarray(l.chDataStart, l.chDataEnd) });
    });
    const memberRecs = indices.map(k => orig.subarray(psd.layers[k].recordStart, psd.layers[k].recordEnd));
    const memberChans = indices.map(k => orig.subarray(psd.layers[k].chDataStart, psd.layers[k].chDataEnd));
    const recs = [...kept.slice(0, insertPos).map(e => e.rec), dvr.record, ...memberRecs, hdr.record, ...kept.slice(insertPos).map(e => e.rec)];
    const chans = [...kept.slice(0, insertPos).map(e => e.chan), dvr.chData, ...memberChans, hdr.chData, ...kept.slice(insertPos).map(e => e.chan)];
    const headerIndex = insertPos + indices.length + 1;

    const n = recs.length;
    const newCount = s.layerCountRaw >= 0 ? n : -n;
    const lc = new Uint8Array(2);
    new DataView(lc.buffer).setInt16(0, newCount);
    let li = h.vconcat([lc, ...recs, ...chans]);
    const origLiLen = s.layerInfoEndAbs - s.layerInfoStart;
    const liAlign = origLiLen % 4 === 0 ? 4 : 2;      
    if (li.length % liAlign) li = h.vconcat([li, new Uint8Array(liAlign - (li.length % liAlign))]);
    const restOfLmi = orig.subarray(s.globalMaskStart, s.lmiEndAbs);
    let lmi = h.vconcat([lenField(li.length, psb), li, restOfLmi]);
    const origLmiLen = s.lmiEndAbs - s.lmiLenOffset - s.lmiLenFieldSize;
    const lmiAlign = origLmiLen % 4 === 0 ? 4 : 2;
    if (lmi.length % lmiAlign) lmi = h.vconcat([lmi, new Uint8Array(lmiAlign - (lmi.length % lmiAlign))]);
    const out = h.concat([orig.subarray(0, s.lmiLenOffset), lenField(lmi.length, psb), lmi, orig.subarray(s.lmiEndAbs)]).buffer;

    
    const doc2 = h.parsePsdDocument(out);
    if (doc2.layerInfo.layers.length !== state.layers.length + 2)
      throw fail(`插入之后图层数是 ${doc2.layerInfo.layers.length}，不是预期的 ${state.layers.length + 2}`);
    const got = doc2.layerInfo.layers;
    const fp = l => `${l.unicodeName || l.name}|${l.bounds.top},${l.bounds.left},${l.bounds.bottom},${l.bounds.right}|${l.channels.map(c => c.id + ':' + c.length).join(',')}`;
    const baseFps = h.parsePsdDocument(ab).layerInfo.layers.map(fp);
    const keptIdx = [];
    psd.layers.forEach((_, k) => { if (!memberSet.has(k)) keptIdx.push(k); });
    const expect = [
      ...keptIdx.slice(0, insertPos).map(k => baseFps[k]),
      '</Layer group>|0,0,0,0|-1:2,0:2,1:2,2:2',
      ...indices.map(k => baseFps[k]),
      `${name}|0,0,0,0|-1:2,0:2,1:2,2:2`,
      ...keptIdx.slice(insertPos).map(k => baseFps[k]),
    ];
    const gotFps = got.map(fp);
    for (let k = 0; k < expect.length; k++) {
      if (expect[k] !== gotFps[k])
        throw fail(`编组之后位置 ${k} 的图层不对：「${expect[k]}」→「${gotFps[k]}」`, { layer: k });
    }
    return {
      buffer: out,
      result: { changed: true, index: insertPos, indices: indices.slice(), name, headerIndex, layerCount: got.length,
                note: `${plan.note}（分隔 ${insertPos}，组员 ${indices.join('/')}，组头 ${headerIndex} 混合 pass）` },
    };
  }

  




  function validateNewGroup(state, op, i) {
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持新建组`, { section: bad.section });
    const at = op.at === undefined ? state.layers.length : op.at;
    if (!Number.isInteger(at) || at < 0 || at > state.layers.length)
      throw h.opFail(i, op, `at 必须是 0…${state.layers.length} 的整数（空组在「底=0」序里的插入下标，${state.layers.length} = 最上层；默认最上层），收到 ${JSON.stringify(op.at)}`);
    const nGroups = state.layers.filter(l => l.groupType === 1 || l.groupType === 2).length;
    const name = op.name === undefined ? '组 ' + (nGroups + 1) : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);
    return { affected: [], changed: ['layers'], at, name, note: `新建空组「${name}」（index ${at}）` };
  }

  function applyNewGroup(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { at, name } = plan;
    const fail = (msg, info) => h.opFail(i, op, msg, { at, ...(info || {}) });
    const psd = h.parsePsdFull(ab);
    const s = psd.sections;
    const psb = !!s.psb;
    if (psd.layers.length !== state.layers.length)
      throw fail('文档状态与校验时不一致，拒绝执行');

    
    const mkGroupRecord = (nameStr, lsctModel, blendKey) => {
      const pascal = encodePascal(nameStr);
      if (pascal.lossy) warnings.push(`组名「${nameStr}」的 Pascal 名含非 ASCII 字符，已按 '?' 落地（真名在 luni 块里）`);
      const extra = h.concat([
        u32b(0), u32b(0), pascal.bytes,
        h.buildBlock('luni', h.encodeUnicode(nameStr), psb),
        h.buildBlock('lsct', writeAdditionalBlock('lsct', lsctModel, { psb }), psb),
      ]);
      const chIds = [-1, 0, 1, 2];
      const chParts = [];
      for (const id of chIds) chParts.push(i16b(id), lenField(2, psb));
      return {
        record: h.concat([
          i32b(0), i32b(0), i32b(0), i32b(0), u16b(chIds.length), ...chParts,
          ascii4('8BIM'), ascii4(blendKey), u8b(255), u8b(0), u8b(0x18), u8b(0),
          u32b(extra.length), extra,
        ]),
        chData: h.concat(chIds.map(() => u16b(0))),
      };
    };
    const dvr = mkGroupRecord('</Layer group>', { sectionType: 3 }, 'norm');
    const hdr = mkGroupRecord(name, { sectionType: 1, blendSig: '8BIM', blendKey: 'pass', subType: 0 }, 'pass');

    const orig = h.toU8(ab);
    const kept = psd.layers.map(l => ({ rec: orig.subarray(l.recordStart, l.recordEnd), chan: orig.subarray(l.chDataStart, l.chDataEnd) }));
    const recs = [...kept.slice(0, at).map(e => e.rec), dvr.record, hdr.record, ...kept.slice(at).map(e => e.rec)];
    const chans = [...kept.slice(0, at).map(e => e.chan), dvr.chData, hdr.chData, ...kept.slice(at).map(e => e.chan)];
    const headerIndex = at + 1;

    const n = recs.length;
    const newCount = s.layerCountRaw >= 0 ? n : -n;
    const lc = new Uint8Array(2);
    new DataView(lc.buffer).setInt16(0, newCount);
    let li = h.vconcat([lc, ...recs, ...chans]);
    const origLiLen = s.layerInfoEndAbs - s.layerInfoStart;
    const liAlign = origLiLen % 4 === 0 ? 4 : 2;
    if (li.length % liAlign) li = h.vconcat([li, new Uint8Array(liAlign - (li.length % liAlign))]);
    const restOfLmi = orig.subarray(s.globalMaskStart, s.lmiEndAbs);
    let lmi = h.vconcat([lenField(li.length, psb), li, restOfLmi]);
    const origLmiLen = s.lmiEndAbs - s.lmiLenOffset - s.lmiLenFieldSize;
    const lmiAlign = origLmiLen % 4 === 0 ? 4 : 2;
    if (lmi.length % lmiAlign) lmi = h.vconcat([lmi, new Uint8Array(lmiAlign - (lmi.length % lmiAlign))]);
    const out = h.concat([orig.subarray(0, s.lmiLenOffset), lenField(lmi.length, psb), lmi, orig.subarray(s.lmiEndAbs)]).buffer;

    
    const doc2 = h.parsePsdDocument(out);
    if (doc2.layerInfo.layers.length !== state.layers.length + 2)
      throw fail(`插入之后图层数是 ${doc2.layerInfo.layers.length}，不是预期的 ${state.layers.length + 2}`);
    const got = doc2.layerInfo.layers;
    const fp = l => `${l.unicodeName || l.name}|${l.bounds.top},${l.bounds.left},${l.bounds.bottom},${l.bounds.right}|${l.channels.map(c => c.id + ':' + c.length).join(',')}`;
    const baseFps = h.parsePsdDocument(ab).layerInfo.layers.map(fp);
    const expect = [
      ...baseFps.slice(0, at),
      '</Layer group>|0,0,0,0|-1:2,0:2,1:2,2:2',
      `${name}|0,0,0,0|-1:2,0:2,1:2,2:2`,
      ...baseFps.slice(at),
    ];
    const gotFps = got.map(fp);
    for (let k = 0; k < expect.length; k++) {
      if (expect[k] !== gotFps[k])
        throw fail(`新建组之后位置 ${k} 的图层不对：「${expect[k]}」→「${gotFps[k]}」`, { layer: k });
    }
    return {
      buffer: out,
      result: { changed: true, index: at, name, headerIndex, layerCount: got.length,
                note: `${plan.note}（分隔 ${at}，组头 ${headerIndex} 混合 pass，组内为空）` },
    };
  }

  



  function validateCreateLayer(state, op, i) {
    const bad = state.layers.find(l => l.section && l.section !== 'layerInfo');
    if (bad)
      throw h.opFail(i, op, `本文档的图层记录在全局块 ${bad.section} 里（16/32 位文档），暂不支持新建图层`, { section: bad.section });
    const at = op.at === undefined ? state.layers.length : op.at;
    if (!Number.isInteger(at) || at < 0 || at > state.layers.length)
      throw h.opFail(i, op, `at 必须是 0…${state.layers.length} 的整数（新图层在「底=0」序里的下标，${state.layers.length} = 最上面；默认最上面），收到 ${JSON.stringify(op.at)}`);
    const name = op.name === undefined ? '图层 ' + (state.layers.length + 1) : op.name;
    if (typeof name !== 'string' || !name.length) throw h.opFail(i, op, 'name 必须是非空字符串');
    if (name.length > 255) throw h.opFail(i, op, `name 太长（${name.length} 字符 > 255）`);
    if (op.visible !== undefined && typeof op.visible !== 'boolean')
      throw h.opFail(i, op, 'visible 必须是布尔值');
    return { affected: [], changed: ['layers'], at, name,
             note: `新建空图层「${name}」（index ${at}）` };
  }

  function applyCreateLayer(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { at, name } = plan;
    const fail = (msg, info) => h.opFail(i, op, msg, { at, ...(info || {}) });
    const psd = h.parsePsdFull(ab);
    const s = psd.sections;
    const psb = !!s.psb;

    const pascal = encodePascal(name);
    if (pascal.lossy) warnings.push(`新图层的 Pascal 名含非 ASCII 字符，已按 '?' 落地（真名在 luni 块里）`);
    
    const extraParts = [u32b(0), u32b(0), pascal.bytes];
    if (/[\u0080-\uffff]/.test(name)) extraParts.push(h.buildBlock('luni', h.encodeUnicode(name), psb));
    const extra = h.concat(extraParts);

    let flags = 0x08;                                  
    if (op.visible === false) flags |= 0x02;
    const chIds = [-1, 0, 1, 2];
    const chParts = [];
    for (const id of chIds) chParts.push(i16b(id), lenField(2, psb));
    const record = h.concat([
      i32b(0), i32b(0), i32b(0), i32b(0), u16b(chIds.length), ...chParts,
      ascii4('8BIM'), ascii4('norm'), u8b(255), u8b(0), u8b(flags), u8b(0),
      u32b(extra.length), extra,
    ]);
    const chData = h.concat(chIds.map(() => u16b(0)));

    const orig = h.toU8(ab);
    const recs = psd.layers.map(l => orig.subarray(l.recordStart, l.recordEnd));
    const chans = psd.layers.map(l => orig.subarray(l.chDataStart, l.chDataEnd));
    recs.splice(at, 0, record);
    chans.splice(at, 0, chData);

    const n = recs.length;
    const newCount = s.layerCountRaw >= 0 ? n : -n;
    const lc = new Uint8Array(2);
    new DataView(lc.buffer).setInt16(0, newCount);
    let li = h.vconcat([lc, ...recs, ...chans]);
    const origLiLen = s.layerInfoEndAbs - s.layerInfoStart;
    const liAlign = origLiLen % 4 === 0 ? 4 : 2;
    if (li.length % liAlign) li = h.vconcat([li, new Uint8Array(liAlign - (li.length % liAlign))]);
    const restOfLmi = orig.subarray(s.globalMaskStart, s.lmiEndAbs);
    let lmi = h.vconcat([lenField(li.length, psb), li, restOfLmi]);
    const origLmiLen = s.lmiEndAbs - s.lmiLenOffset - s.lmiLenFieldSize;
    const lmiAlign = origLmiLen % 4 === 0 ? 4 : 2;
    if (lmi.length % lmiAlign) lmi = h.vconcat([lmi, new Uint8Array(lmiAlign - (lmi.length % lmiAlign))]);
    const out = h.concat([orig.subarray(0, s.lmiLenOffset), lenField(lmi.length, psb), lmi, orig.subarray(s.lmiEndAbs)]).buffer;

    
    const doc2 = h.parsePsdDocument(out);
    if (doc2.layerInfo.layers.length !== state.layers.length + 1)
      throw fail(`插入之后图层数是 ${doc2.layerInfo.layers.length}，不是预期的 ${state.layers.length + 1}`);
    const got = doc2.layerInfo.layers[at];
    if (!got) throw fail(`插入之后 index ${at} 上没有图层`);
    if ((got.unicodeName || got.name) !== name)
      throw fail(`插入之后新图层的名字是「${got.unicodeName || got.name}」，不是「${name}」`);
    if (got.bounds.top || got.bounds.left || got.bounds.bottom || got.bounds.right)
      throw fail(`插入之后新图层的 bounds 是 ${JSON.stringify(got.bounds)}，预期 0,0,0,0`);
    if (got.channels.length !== 4 || got.channels.some(c => c.length !== 2))
      throw fail(`插入之后新图层的通道表异常：${got.channels.map(c => c.id + ':' + c.length).join(',')}`);
    const fp = l => `${l.unicodeName || l.name}|${l.bounds.top},${l.bounds.left},${l.bounds.bottom},${l.bounds.right}|${l.channels.map(c => c.id + ':' + c.length).join(',')}`;
    const before = h.parsePsdDocument(ab).layerInfo.layers.map(fp);
    const after = doc2.layerInfo.layers.map(fp);
    after.splice(at, 1);
    for (let k = 0; k < before.length; k++) {
      if (before[k] !== after[k])
        throw fail(`插入之后原来的图层 ${k} 变了：「${before[k]}」→「${after[k]}」`, { layer: k });
    }
    return {
      buffer: out,
      result: { changed: true, at, name, layerCount: doc2.layerInfo.layers.length,
                note: `${plan.note}（bounds 0,0,0,0，通道表 -1/0/1/2 各 2 字节）` },
    };
  }

  










  const SHAPE_CONTENT_TYPES = ['none', 'solid', 'gradient', 'pattern'];
  const CONTENT_KEYS = ['SoCo', 'GdFl', 'PtFl'];
  const STROKE_CONTENT_CLASS = { solid: 'solidColorLayer', gradient: 'gradientLayer', pattern: 'patternLayer' };
  function contentModelOf(spec, where, i, op) {
    const t = spec.type;
    if (t === 'solid') {
      const c = colorArg(spec.color, where + '.color', i, op, [0, 0, 0]);
      return { key: 'SoCo', model: { descVersion: 16, desc: { __name: '', __classID: 'null', 'Clr ': rgb(c[0], c[1], c[2]) } } };
    }
    if (t === 'gradient') return { key: 'GdFl', model: gradientModel(spec.gradient, i, op) };
    if (t === 'pattern') return { key: 'PtFl', model: patternModel(spec.pattern, i, op) };
    return null;
  }
  function validateShapeContent(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (state.mode !== 3)
      throw h.opFail(i, op, `形状内容目前只造 RGBC 颜色描述符，本文档是 ${MODE_NAMES[state.mode] || state.mode} 模式，拒绝乱猜`, { mode: state.mode });
    const specOf = (k) => {
      const v = op[k];
      if (v === undefined) return null;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw h.opFail(i, op, `${k} 必须是对象 { type, … }`);
      if (!SHAPE_CONTENT_TYPES.includes(v.type))
        throw h.opFail(i, op, `${k}.type 不认识「${v.type}」；可用：${SHAPE_CONTENT_TYPES.join(' / ')}`, { available: SHAPE_CONTENT_TYPES });
      return v;
    };
    const fill = specOf('fill'), stroke = specOf('stroke');
    if (!fill && !stroke) throw h.opFail(i, op, '至少给 fill 或 stroke 之一');
    
    const fillModel = fill && contentModelOf(fill, 'fill', i, op);
    const strokeModel = stroke && contentModelOf(stroke, 'stroke', i, op);
    if (stroke && stroke.width !== undefined && !(Number.isFinite(+stroke.width) && +stroke.width >= 0 && +stroke.width <= 1000))
      throw h.opFail(i, op, `stroke.width 必须是 0…1000 的数字，收到 ${JSON.stringify(stroke.width)}`);
    const bits = [fill && `填充 → ${fill.type}`, stroke && `描边 → ${stroke.type}`].filter(Boolean).join('，');
    return { affected: [op.index], changed: ['layers'], opIndex: i, fill, stroke, fillModel, strokeModel,
      note: `图层 ${op.index}「${layer.name}」${bits}` };
  }
  function applyShapeContent(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const { fill, stroke, fillModel, strokeModel } = plan;
    const idx = op.index;
    const fail = (msg, info) => h.opFail(i, op, msg, { index: idx, ...(info || {}) });
    const psb = !!h.parsePsdFull(ab).sections.psb;
    const readModel = key => {
      const raw = h.readLayerBlock(ab, idx, key);
      if (!raw) return null;
      const m = parseAdditionalBlock(key, raw, { psb, verify: false });
      if (!m || m._raw !== undefined) throw fail(`图层 ${idx} 的 ${key} 块读不懂（${(m && m._error) || '未知写法'}），拒绝改写`, { block: key });
      return m;
    };
    const write = (buf, key, model) => {
      let data;
      try { data = writeAdditionalBlock(key, model, { psb }); } catch (e) { throw fail(`${key} 块序列化失败：${e && e.message}`, { block: key }); }
      return h.upsertLayerBlock(buf, idx, key, data);
    };
    let out = ab;
    const curContentKey = CONTENT_KEYS.find(k => h.readLayerBlock(ab, idx, k));
    let vstk = readModel('vstk');
    if (!curContentKey && fill && fill.type === 'none' && !vstk)
      throw fail(`图层 ${idx} 既没有填充内容块（SoCo/GdFl/PtFl）也没有 vstk，不是形状 / 填充图层`);
    const hasVmsk = !!(h.readLayerBlock(ab, idx, 'vmsk') || h.readLayerBlock(ab, idx, 'vsms'));
    const ensureVstk = () => {
      if (vstk) return vstk;
      if (!hasVmsk) throw fail(`图层 ${idx} 没有矢量路径（vmsk），无路径的填充图层没有描边 / 「无填充」可言`);
      vstk = strokeStyleModel({ color: [0, 0, 0], width: 1, opacity: 100, dashOffset: 0,
        cap: STROKE_CAPS.butt, join: STROKE_JOINS.miter, align: STROKE_ALIGNS.center, dash: [] });
      vstk.desc.strokeEnabled = false;
      return vstk;
    };
    let vstkDirty = false;
    
    if (fill) {
      if (fill.type === 'none') {
        ensureVstk(); vstk.desc.fillEnabled = false; vstkDirty = true;
      } else {
        for (const k of CONTENT_KEYS) if (k !== fillModel.key) out = h.upsertLayerBlock(out, idx, k, null);
        out = write(out, fillModel.key, fillModel.model);
        if (vstk && vstk.desc.fillEnabled === false) { vstk.desc.fillEnabled = true; vstkDirty = true; }
      }
    }
    
    if (stroke) {
      if (stroke.type === 'none') {
        if (vstk && vstk.desc.strokeEnabled !== false) { vstk.desc.strokeEnabled = false; vstkDirty = true; }
      } else {
        ensureVstk();
        const d = vstk.desc;
        d.strokeEnabled = true;
        if (stroke.width !== undefined && d.strokeStyleLineWidth && d.strokeStyleLineWidth.__unit) d.strokeStyleLineWidth.value = +stroke.width;
        else if (stroke.width !== undefined) d.strokeStyleLineWidth = pxl(+stroke.width);
        if (d.strokeStyleLineWidth && d.strokeStyleLineWidth.value <= 0) d.strokeStyleLineWidth.value = 1;
        
        const src = strokeModel.model.desc;
        const content = { __name: '', __classID: STROKE_CONTENT_CLASS[stroke.type] };
        for (const k of Object.keys(src)) if (k !== '__name' && k !== '__classID') content[k] = src[k];
        
        const next = {};
        for (const k of Object.keys(d)) next[k] = k === 'strokeStyleContent' ? content : d[k];
        if (!('strokeStyleContent' in d)) next.strokeStyleContent = content;
        vstk.desc = next;
        vstkDirty = true;
      }
    }
    if (vstkDirty) out = write(out, 'vstk', vstk);
    

    if ((vstkDirty || fill) && (vstk || h.readLayerBlock(out, idx, 'vscg'))) {
      const ck = CONTENT_KEYS.find(k => h.readLayerBlock(out, idx, k));
      if (ck) {
        const raw = h.readLayerBlock(out, idx, ck);
        const cm = parseAdditionalBlock(ck, raw, { psb, verify: false });
        if (cm && cm.desc) out = write(out, 'vscg', { contentKey: ck, descVersion: 16, desc: cm.desc });
      }
    }
    
    const back = key => { const raw = h.readLayerBlock(out, idx, key); return raw && parseAdditionalBlock(key, raw, { psb, verify: false }); };
    if (fill && fill.type !== 'none' && !h.readLayerBlock(out, idx, fillModel.key)) throw fail(`写回之后读不到 ${fillModel.key} 块`);
    if (vstkDirty) {
      const v2 = back('vstk');
      if (!v2 || !v2.desc) throw fail('写回之后 vstk 读不回来');
      if (fill && fill.type === 'none' && v2.desc.fillEnabled !== false) throw fail('写回之后 fillEnabled 不是 false');
      if (stroke && stroke.type !== 'none' && v2.desc.strokeEnabled !== true) throw fail('写回之后 strokeEnabled 不是 true');
    }
    return { buffer: out, result: { changed: out !== ab, index: idx, note: plan.note } };
  }

  



  function validateSetShapeOrigin(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    const origin = op.origin === null ? null : originOf(op, i);
    if (op.origin === undefined) throw h.opFail(i, op, 'origin 必须给：对象 = 写 vogk，null = 删掉 vogk');
    return { affected: [op.index], changed: ['layers'], opIndex: i, origin,
      note: `图层 ${op.index}「${layer.name}」实时形状属性 → ${origin ? origin.type : '删除'}` };
  }
  function applySetShapeOrigin(ab, state, op, plan) {
    const i = plan.opIndex ?? 0;
    const fail = (msg, info) => h.opFail(i, op, msg, { index: op.index, ...(info || {}) });
    const psb = !!h.parsePsdFull(ab).sections.psb;
    if (!plan.origin) {
      if (!h.readLayerBlock(ab, op.index, 'vogk')) return { buffer: ab, result: { changed: false, note: plan.note } };
      return { buffer: h.upsertLayerBlock(ab, op.index, 'vogk', null), result: { changed: true, note: plan.note } };
    }
    let data;
    try { data = writeAdditionalBlock('vogk', vogkModel(plan.origin), { psb }); } catch (e) { throw fail(`vogk 块序列化失败：${e && e.message}`); }
    try {
      const back = writeAdditionalBlock('vogk', parseAdditionalBlock('vogk', data, { psb, verify: false }), { psb });
      if (back.length !== data.length || back.some((v, n) => v !== data[n])) throw new Error('往返不一致');
    } catch (e) { throw fail(`vogk 块自检没过（${e && e.message}），拒绝写出`); }
    return { buffer: h.upsertLayerBlock(ab, op.index, 'vogk', data), result: { changed: true, note: plan.note } };
  }

  




















  const ARTBOARD_KEYS = ['artb', 'artd', 'abdd'];
  const ARTBOARD_BG = { white: 1, black: 2, transparent: 3, custom: 4, other: 4 };
  function artboardModel(rect, presetName, color, bgType, guideIDs) {
    return {
      descVersion: 16,
      desc: {
        __name: '', __classID: 'null',
        artboardRect: {
          __name: '', __classID: 'classFloatRect',
          __doub: { 'Top ': true, Left: true, Btom: true, Rght: true },
          'Top ': rect.top, Left: rect.left, Btom: rect.bottom, Rght: rect.right,
        },
        guideIDs: guideIDs || [],
        artboardPresetName: presetName,
        'Clr ': rgb(color[0], color[1], color[2]),
        artboardBackgroundType: bgType,
        __long: { artboardBackgroundType: true },
      },
    };
  }
  function validateSetArtboard(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (op.remove) {
      const had = ARTBOARD_KEYS.filter(k => (layer.artboardKeys || []).includes(k));
      if (!had.length) throw h.opFail(i, op, `图层 ${op.index}「${layer.name}」本来就不是画板（没有 artb/artd/abdd 块）`);
      return { affected: [op.index], changed: ['layers'], opIndex: i, remove: true, had,
        note: `取消画板「${layer.name}」（删掉 ${had.join(' / ')}）` };
    }
    if (layer.groupType !== 1 && layer.groupType !== 2)
      throw h.opFail(i, op, `画板信息只能挂在**图层组的组头**上，图层 ${op.index}「${layer.name}」不是组头（groupType=${layer.groupType}）`,
        { groupType: layer.groupType });
    const r = op.rect;
    if (!r || typeof r !== 'object') throw h.opFail(i, op, 'rect 必须是 { top, left, bottom, right }');
    for (const k of ['top', 'left', 'bottom', 'right'])
      if (!Number.isFinite(+r[k])) throw h.opFail(i, op, `rect.${k} 必须是数字，收到 ${JSON.stringify(r[k])}`);
    const rect = { top: +r.top, left: +r.left, bottom: +r.bottom, right: +r.right };
    if (!(rect.right > rect.left && rect.bottom > rect.top))
      throw h.opFail(i, op, `画板矩形的宽高都要 > 0，收到 ${JSON.stringify(rect)}`);
    const presetName = op.presetName === undefined ? (layer.name || 'Artboard 1') : op.presetName;
    if (typeof presetName !== 'string') throw h.opFail(i, op, 'presetName 必须是字符串');
    const color = colorArg(op.color, 'color', i, op, [255, 255, 255]);
    let bgType = op.backgroundType === undefined ? 1 : op.backgroundType;
    if (typeof bgType === 'string') {
      if (!(bgType in ARTBOARD_BG))
        throw h.opFail(i, op, `backgroundType 不认识「${bgType}」；可用：${Object.keys(ARTBOARD_BG).join(' / ')}（或 1…4）`,
          { available: Object.keys(ARTBOARD_BG) });
      bgType = ARTBOARD_BG[bgType];
    }
    if (!Number.isInteger(bgType) || bgType < 1 || bgType > 4)
      throw h.opFail(i, op, `backgroundType 必须是 1…4（1 白 / 2 黑 / 3 透明 / 4 其它），收到 ${JSON.stringify(op.backgroundType)}`);
    return { affected: [op.index], changed: ['layers'], opIndex: i, rect, presetName, color, bgType,
      note: `画板「${layer.name}」→ ${Math.round(rect.right - rect.left)}×${Math.round(rect.bottom - rect.top)} @${Math.round(rect.left)},${Math.round(rect.top)}` };
  }
  function applySetArtboard(ab, state, op, plan, warnings) {
    const i = plan.opIndex ?? 0;
    const idx = op.index;
    const fail = (msg, info) => h.opFail(i, op, msg, { index: idx, ...(info || {}) });
    const psb = !!h.parsePsdFull(ab).sections.psb;
    let out = ab;
    if (plan.remove) {
      for (const k of plan.had) out = h.upsertLayerBlock(out, idx, k, null);
      return { buffer: out, result: { changed: true, note: plan.note } };
    }
    
    let guideIDs = [];
    try {
      const raw = h.readLayerBlock(ab, idx, 'artb') || h.readLayerBlock(ab, idx, 'abdd');
      if (raw) {
        const m = parseAdditionalBlock('artb', raw, { psb, verify: false });
        if (m && m.desc && Array.isArray(m.desc.guideIDs)) guideIDs = m.desc.guideIDs;
      }
    } catch { guideIDs = []; }
    const model = artboardModel(plan.rect, plan.presetName, plan.color, plan.bgType, guideIDs);
    
    const keys = ['artb', 'abdd', ...(h.readLayerBlock(ab, idx, 'artd') ? ['artd'] : [])];
    for (const k of keys) {
      let data;
      try { data = writeAdditionalBlock(k, model, { psb }); }
      catch (e) { throw fail(`${k} 块序列化失败：${e && e.message}`, { block: k }); }
      
      try {
        const back = writeAdditionalBlock(k, parseAdditionalBlock(k, data, { psb, verify: false }), { psb });
        if (back.length !== data.length || back.some((v, n) => v !== data[n]))
          throw new Error('往返不一致');
      } catch (e) { throw fail(`${k} 块自检没过（${e && e.message}），拒绝写出`, { block: k }); }
      out = h.upsertLayerBlock(out, idx, k, data);
    }
    return { buffer: out, result: { changed: true, keys, note: plan.note } };
  }

  





  function validateAddVectorMask(state, op, i) {
    const layer = h.needLayer(state, i, op, op.index);
    if (layer.groupType === 3) throw h.opFail(i, op, '组结束分隔记录上不能挂矢量蒙版');
    const fail = (msg, info) => h.opFail(i, op, msg, info);
    const norm = normalizeSubpathInput(op.subpaths || [], op.units, fail);
    freshPathRecords(norm, state.width, state.height, fail);
    return { affected: [op.index], changed: ['layers'], opIndex: i, norm,
      note: `给图层「${layer.name}」新建矢量蒙版（${norm.subpaths.length} 条子路径）` };
  }
  function applyAddVectorMask(ab, state, op, plan) {
    const i = plan.opIndex ?? 0, idx = op.index;
    const fail = (msg, info) => h.opFail(i, op, msg, { index: idx, ...(info || {}) });
    if (h.readLayerBlock(ab, idx, 'vmsk') || h.readLayerBlock(ab, idx, 'vsms'))
      throw fail(`图层 ${idx} 已经有矢量蒙版了：改路径请用 setVectorMaskPath`);
    const full = h.parsePsdFull(ab), psb = !!full.sections.psb, { width, height } = full.header;
    const records = freshPathRecords(plan.norm, width, height, fail);
    let data;
    try { data = writeAdditionalBlock('vmsk', { version: 3, flags: 0, path: { records } }, { psb }); }
    catch (e) { throw fail(`vmsk 块序列化失败：${e && e.message}`); }
    const out = h.upsertLayerBlock(ab, idx, 'vmsk', data);
    const got = getVectorMaskPath(out, idx, { units: plan.norm.units });
    if (!got) throw fail('写完之后读不到矢量蒙版（vmsk 没写进去？）');
    if (got.subpaths.length !== plan.norm.subpaths.length) throw fail(`读回 ${got.subpaths.length} 条子路径，预期 ${plan.norm.subpaths.length}`);
    return { buffer: out, result: { changed: true, note: plan.note } };
  }

  return {
    addLayerEffect: { validate: validateAddEffect, apply: applyAddEffect },
    removeLayerEffect: { validate: validateRemoveEffect, apply: applyRemoveEffect },
    addAdjustmentLayer: { validate: validateAddAdjustment, apply: applyAddAdjustment, structural: true },
    addShapeLayer: { validate: validateAddShape, apply: applyAddShape, structural: true },
    addFillLayer: { validate: validateAddFill, apply: applyAddFill, structural: true },
    setShapeContent: { validate: validateShapeContent, apply: applyShapeContent, structural: true },
    setShapeOrigin: { validate: validateSetShapeOrigin, apply: applySetShapeOrigin, structural: true },
    addTextLayer: { validate: validateAddText, apply: applyAddText, structural: true },
    groupLayers: { validate: validateGroupLayers, apply: applyGroupLayers, structural: true, pure: true },
    newGroup: { validate: validateNewGroup, apply: applyNewGroup, structural: true, pure: true },
    setArtboard: { validate: validateSetArtboard, apply: applySetArtboard, structural: true },
    createLayer: { validate: validateCreateLayer, apply: applyCreateLayer, structural: true, pure: true },
    addVectorMask: { validate: validateAddVectorMask, apply: applyAddVectorMask, structural: true },
  };
}




export function listCreatableEffects() {
  const out = {};
  for (const canon of Object.keys(FX_TEMPLATE)) {
    out[canon] = {
      key: FX_EFFECTS[canon].key,
      multi: FX_EFFECTS[canon].multi,
      label: FX_EFFECTS[canon].label,
      needsResource: canon === 'patternOverlay' ? 'Patt（文档全局图案资源）' : null,
      fields: listPaths(FX_TEMPLATE[canon](), '', []),
    };
  }
  return out;
}






export function createEffectTemplate(canon) {
  const make = FX_TEMPLATE[canon];
  return make ? make() : null;
}


export function listAdjustmentKinds() {
  const out = {};
  for (const k of Object.keys(ADJ_KINDS)) {
    out[k] = { label: ADJ_KINDS[k].label, blocks: ADJ_KINDS[k].keys.slice(), accepts: ADJ_KINDS[k].accepts };
  }
  return out;
}
