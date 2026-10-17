



























import { Reader, readDescriptor } from './psd-parse.js';
import { Writer, serializeDescriptor } from './psd-descriptor.js';
import { parseVectorMask, writeVectorMask, parsePathRecords, writePathRecords } from './psd-path.js';
import { decodeChannel } from './psd-image.js';
import { parseEngineData, serializeEngineData, detectEngineDataFormat } from './engine-data.js';
import { parseFilterEffectsBlock, writeFilterEffectsBlock } from './psd-filter-effects.js';



function toU8(b) {
  if (b instanceof Uint8Array) return b;
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return new Uint8Array(b || 0);
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}


function rF32(r) { const v = r.dv.getFloat32(r.o, false); r.o += 4; return v; }
function wF32(w, v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v || 0); w.push(b); }
function wI16(w, v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v | 0); w.push(b); }



function rUni(r) {
  const n = r.u32();
  let s = '';
  for (let i = 0; i < n; i++) { const c = r.u16(); if (c !== 0) s += String.fromCharCode(c); }
  return { s, n };
}
function wUni(w, s, n) {
  s = s || '';
  const count = (n === undefined || n < s.length) ? s.length : n;
  w.u32(count);
  const b = new Uint8Array(count * 2), d = new DataView(b.buffer);
  for (let i = 0; i < s.length; i++) d.setUint16(i * 2, s.charCodeAt(i));
  w.push(b);   
}


function peek4(r) {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(r.dv.getUint8(r.o + i));
  return s;
}


function rPascal(r) { const n = r.u8(); return r.ascii(n); }
function wPascal(w, s) { s = s || ''; w.u8(s.length); w.ascii(s); }


function rColor(r) { const space = r.u16(); const c = [r.u16(), r.u16(), r.u16(), r.u16()]; return { space, components: c }; }
function wColor(w, c) {
  c = c || { space: 0, components: [0, 0, 0, 0] };
  w.u16(c.space || 0);
  for (let i = 0; i < 4; i++) w.u16((c.components && c.components[i]) || 0);
}


function rDesc(r) { return { descVersion: r.u32(), desc: readDescriptor(r) }; }
function wDesc(w, m) { w.u32(m.descVersion ?? 16); w.bytes(serializeDescriptor(m.desc)); }



const REG = new Map();



function reg(keys, kind, note, parse, write) {
  for (const k of [].concat(keys)) REG.set(k, { key: k, kind, note, parse, write });
}




reg('lyid', 'semantic', '图层 ID',
  r => ({ id: r.u32() }),
  (w, m) => w.u32(m.id >>> 0));


reg('lnsr', 'semantic', '图层名来源',
  r => ({ nameSource: r.key4() }),
  (w, m) => w.ascii((m.nameSource || '    ').padEnd(4).slice(0, 4)));


export const LAYER_COLORS = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
reg('lclr', 'semantic', '图层颜色标签',
  r => { const i = r.u16(); return { colorIndex: i, color: LAYER_COLORS[i] || null }; },
  (w, m) => w.u16(m.colorIndex !== undefined ? m.colorIndex : Math.max(0, LAYER_COLORS.indexOf(m.color))));


reg('lspf', 'semantic', '保护标志（锁定）',
  r => {
    const flags = r.u32();
    return { flags, transparency: !!(flags & 1), composite: !!(flags & 2),
             position: !!(flags & 4), nesting: !!(flags & 8), all: flags === 0x80000000 };
  },
  (w, m) => w.u32(m.flags !== undefined ? m.flags
    : ((m.transparency ? 1 : 0) | (m.composite ? 2 : 0) | (m.position ? 4 : 0) | (m.nesting ? 8 : 0))));


reg('lyvr', 'semantic', '图层版本',
  r => ({ version: r.u32() }),
  (w, m) => w.u32(m.version >>> 0));






const BOOL_BLOCKS = {
  clbl: '混合被剪切的元素',
  infx: '混合内部元素',
  lmgm: '图层蒙版作为全局蒙版渐隐',
  vmgm: '矢量蒙版作为全局蒙版渐隐',
  tsly: '透明形状图层',
};
function writeByteFlag(w, m) {
  const keep = m._byte !== undefined && (!!m.value === (m._byte !== 0));
  w.u8(keep ? (m._byte & 255) : (m.value ? 1 : 0));
  if (!m._tail || !m._tail.length) w.bytes(new Uint8Array(3));
}
for (const [k, note] of Object.entries(BOOL_BLOCKS)) {
  reg(k, 'semantic', note,
    r => { const b = r.u8(); return { value: b !== 0, _byte: b }; },
    writeByteFlag);
}




export const KNOCKOUT_LEVELS = { 0: 'none', 1: 'shallow', 2: 'deep' };
reg('knko', 'semantic', '挖空（knockout，0 无 / 1 浅 / 2 深）',
  r => {
    const b = r.u8();
    return { knockout: b, knockoutName: KNOCKOUT_LEVELS[b] || null, value: b !== 0, _byte: b };
  },
  (w, m) => {
    let b = m.knockout !== undefined ? (m.knockout & 255) : (m.value ? 1 : 0);
    
    if (m.knockout !== undefined && m.value !== undefined && !!m.value !== (b !== 0)) b = m.value ? 1 : 0;
    w.u8(b);
    if (!m._tail || !m._tail.length) w.bytes(new Uint8Array(3));
  });


reg('iOpa', 'semantic', '填充不透明度',
  r => ({ fillOpacity: r.u8() }),
  (w, m) => {
    w.u8(m.fillOpacity & 255);
    if (!m._tail || !m._tail.length) w.bytes(new Uint8Array(3));
  });


reg('fxrp', 'semantic', '效果参考点',
  r => ({ x: r.f64(), y: r.f64() }),
  (w, m) => { w.f64(m.x || 0); w.f64(m.y || 0); });


reg('brst', 'semantic', '通道混合限制',
  r => { const channels = []; while (r.remaining >= 4) channels.push(r.i32()); return { channels }; },
  (w, m) => { for (const c of m.channels || []) w.i32(c); });


reg('sn2P', 'semantic', '使用对齐渲染',
  r => ({ value: r.u32() }), (w, m) => w.u32(m.value >>> 0));
reg('vowv', 'semantic', '矢量原点未知字段（恒为 2）',
  r => ({ value: r.u32() }), (w, m) => w.u32(m.value >>> 0));


reg('luni', 'semantic', 'Unicode 图层名',
  r => { const u = rUni(r); return { name: u.s, _units: u.n }; },
  (w, m) => wUni(w, m.name, m._units));


export const SECTION_TYPES = { 0: 'other', 1: 'open', 2: 'closed', 3: 'bounding' };
reg(['lsct', 'lsdk'], 'semantic', '分组分隔符（含混合模式与 sub-type）',
  r => {
    const m = { sectionType: r.u32() };
    m.sectionTypeName = SECTION_TYPES[m.sectionType] || 'other';
    if (r.remaining >= 8) { m.blendSig = r.key4(); m.blendKey = r.key4(); }
    if (r.remaining >= 4) m.subType = r.u32();
    return m;
  },
  (w, m) => {
    w.u32(m.sectionType >>> 0);
    if (m.blendKey !== undefined) { w.ascii(m.blendSig || '8BIM'); w.ascii(m.blendKey); }
    if (m.subType !== undefined) w.u32(m.subType >>> 0);
  });


reg('LMsk', 'semantic', '用户蒙版颜色/不透明度',
  r => ({ color: rColor(r), opacity: r.u16(), flag: r.u8() }),
  (w, m) => { wColor(w, m.color); w.u16(m.opacity || 0); w.u8(m.flag ?? 128); });




const PLAIN_DESC = {
  SoCo: '纯色填充图层',
  GdFl: '渐变填充图层',
  PtFl: '图案填充图层',
  blwh: '黑白调整',
  vibA: '自然饱和度调整',
  CgEd: '新版调整（brightness/contrast 等的描述符形态）',
  artb: '画板信息（图层级）',
  frgb: '原生图框组（PS 2026 实测 framedGroup 描述符）',
  artd: '画板信息（文档级）',
  abdd: '画板信息（第三版）',
  cinf: '合成器信息',
  extn: '扩展/生成器设置',
  OCIO: '文档色彩管理信息',
  GenI: '生成式技术信息',
  pths: '路径列表（pathsDataClass 描述符）',
  vstk: '矢量描边参数（strokeStyle）',
  PxSc: '像素源数据（PixelSource 描述符）',
};
for (const [k, note] of Object.entries(PLAIN_DESC)) {
  reg(k, 'semantic', note, r => rDesc(r), (w, m) => wDesc(w, m));
}


reg('CAI ', 'semantic', '内容凭据（Content Authenticity）',
  r => ({ version: r.u32(), ...rDesc(r) }),
  (w, m) => { w.u32(m.version >>> 0); wDesc(w, m); });


reg('vscg', 'semantic', '矢量描边内容（key + 描述符）',
  r => ({ contentKey: r.key4(), ...rDesc(r) }),
  (w, m) => { w.ascii((m.contentKey || 'SoCo').padEnd(4).slice(0, 4)); wDesc(w, m); });


reg('vogk', 'semantic', '矢量原点数据',
  r => ({ version: r.i32(), ...rDesc(r) }),
  (w, m) => { w.i32(m.version ?? 1); wDesc(w, m); });


reg('clrL', 'semantic', '颜色查找调整',
  r => ({ version: r.u16(), ...rDesc(r) }),
  (w, m) => { w.u16(m.version ?? 1); wDesc(w, m); });




reg(['lfx2', 'lmfx', 'lfxs'], 'semantic', '对象型图层效果（描述符）',
  r => ({ version: r.u32(), ...rDesc(r) }),
  (w, m) => { w.u32(m.version >>> 0); wDesc(w, m); });


export const EFFECT_KEYS = ['FrFX', 'DrSh', 'IrSh', 'OrGl', 'IrGl', 'ebbl', 'SoFi',
                            'GdFl', 'patternFill', 'ChFX', 'dropShadowMulti', 'innerShadowMulti',
                            'frameFXMulti', 'solidFillMulti', 'gradientFillMulti', 'patternFillMulti'];


reg(['SoLd', 'SoLE'], 'semantic', '智能对象图层数据 / 智能滤镜',
  r => ({ sig: r.key4(), version: r.u32(), ...rDesc(r) }),
  (w, m) => { w.ascii((m.sig || 'soLD').padEnd(4).slice(0, 4)); w.u32(m.version >>> 0); wDesc(w, m); });



export const PLACED_TYPES = ['unknown', 'vector', 'raster', 'image stack'];
reg(['PlLd', 'plLd'], 'semantic', '置入图层（智能对象放置）',
  r => {
    const m = { sig: r.key4(), version: r.i32(), uniqueId: rPascal(r),
                pageNumber: r.i32(), totalPages: r.i32(), antiAliasPolicy: r.i32(),
                placedType: r.i32() };
    m.placedTypeName = PLACED_TYPES[m.placedType] || null;
    m.transform = []; for (let i = 0; i < 8; i++) m.transform.push(r.f64());
    m.warpVersion = r.i32();
    Object.assign(m, rDesc(r));
    return m;
  },
  (w, m) => {
    w.ascii((m.sig || 'plcL').padEnd(4).slice(0, 4));
    w.i32(m.version ?? 3); wPascal(w, m.uniqueId);
    w.i32(m.pageNumber | 0); w.i32(m.totalPages | 0);
    w.i32(m.antiAliasPolicy | 0); w.i32(m.placedType | 0);
    for (let i = 0; i < 8; i++) w.f64((m.transform && m.transform[i]) || 0);
    w.i32(m.warpVersion | 0);
    wDesc(w, m);
  });


reg('PxSD', 'semantic', '像素源数据（64 位长度子块列表）',
  r => {
    const items = [];
    while (r.remaining >= 8) { const n = r.u64(); if (n > r.remaining) { r.o -= 8; break; } items.push(r.bytes(n).slice()); }
    return { items };
  },
  (w, m) => { for (const it of m.items || []) { w.u64(it.length); w.bytes(it); } });



reg(['vmsk', 'vsms'], 'semantic', '矢量蒙版（version+flags+路径记录）',
  (r, raw) => { r.skip(raw.length); return parseVectorMask(raw); },
  (w, m) => w.bytes(writeVectorMask(m)));




reg('brit', 'semantic', '亮度/对比度（旧版二进制）',
  r => ({ brightness: r.i16(), contrast: r.i16(), meanValue: r.i16(), labColorOnly: r.u8() !== 0 }),
  (w, m) => { wI16(w, m.brightness); wI16(w, m.contrast); wI16(w, m.meanValue ?? 127); w.u8(m.labColorOnly ? 1 : 0); });


function rLevelRecord(r) {
  return { shadowInput: r.u16(), highlightInput: r.u16(),
           shadowOutput: r.u16(), highlightOutput: r.u16(), midtoneInput: r.u16() };
}
function wLevelRecord(w, c) {
  c = c || {};
  w.u16(c.shadowInput || 0); w.u16(c.highlightInput || 0);
  w.u16(c.shadowOutput || 0); w.u16(c.highlightOutput || 0); w.u16(c.midtoneInput || 0);
}
reg('levl', 'semantic', '色阶',
  r => {
    const m = { version: r.u16(), records: [] };
    if (m.version !== 2) throw new Error('levl 版本不是 2');
    for (let i = 0; i < 29; i++) m.records.push(rLevelRecord(r));
    
    if (r.remaining >= 6 && peek4(r) === 'Lvls') {
      m.extraSig = r.key4();
      m.extraVersion = r.u16();
      m.extraCount = r.u16();
      for (let i = 29; i < m.extraCount && r.remaining >= 10; i++) m.records.push(rLevelRecord(r));
    } else {
      while (r.remaining >= 10) m.records.push(rLevelRecord(r));
    }
    return m;
  },
  (w, m) => {
    w.u16(m.version ?? 2);
    const n = m.records.length;
    for (let i = 0; i < Math.min(29, n); i++) wLevelRecord(w, m.records[i]);
    if (m.extraSig) {
      w.ascii(m.extraSig); w.u16(m.extraVersion ?? 3); w.u16(m.extraCount ?? n);
      for (let i = 29; i < (m.extraCount ?? n); i++) wLevelRecord(w, m.records[i]);
    } else {
      for (let i = 29; i < n; i++) wLevelRecord(w, m.records[i]);
    }
  });


function popcount(v) { let n = 0; while (v) { n += v & 1; v >>>= 1; } return n; }
reg('curv', 'semantic', '曲线',
  r => {
    const m = { isMap: r.u8() !== 0, version: r.u16(), countMap: r.u32(), channels: [] };
    if (m.version !== 1 && m.version !== 4) throw new Error('curv 版本异常: ' + m.version);
    const count = m.version === 1 ? popcount(m.countMap) : m.countMap;
    for (let i = 0; i < count; i++) {
      if (m.isMap) { const map = []; for (let j = 0; j < 256; j++) map.push(r.u8()); m.channels.push({ map }); }
      else {
        const n = r.u16(); const points = [];
        for (let j = 0; j < n; j++) points.push({ output: r.u16(), input: r.u16() });
        m.channels.push({ points });
      }
    }
    if (m.version === 1 && r.remaining >= 10 && peek4(r) === 'Crv ') {
      m.extraSig = r.key4();
      m.extraVersion = r.u16();
      const n = r.u32();
      m.extra = [];
      for (let i = 0; i < n; i++) {
        const channelId = r.u16();
        if (m.isMap) { const map = []; for (let j = 0; j < 256; j++) map.push(r.u8()); m.extra.push({ channelId, map }); }
        else {
          const pc = r.u16(); const points = [];
          for (let j = 0; j < pc; j++) points.push({ output: r.u16(), input: r.u16() });
          m.extra.push({ channelId, points });
        }
      }
    }
    return m;
  },
  (w, m) => {
    w.u8(m.isMap ? 1 : 0); w.u16(m.version ?? 4); w.u32(m.countMap >>> 0);
    for (const ch of m.channels || []) {
      if (ch.map) { for (const v of ch.map) w.u8(v); }
      else { w.u16(ch.points.length); for (const p of ch.points) { w.u16(p.output); w.u16(p.input); } }
    }
    if (m.extraSig) {
      w.ascii(m.extraSig); w.u16(m.extraVersion ?? 4); w.u32((m.extra || []).length);
      for (const it of m.extra || []) {
        w.u16(it.channelId);
        if (it.map) { for (const v of it.map) w.u8(v); }
        else { w.u16(it.points.length); for (const p of it.points) { w.u16(p.output); w.u16(p.input); } }
      }
    }
  });


reg('mixr', 'semantic', '通道混合器',
  r => {
    const m = { version: r.u16(), monochrome: r.u16() !== 0, channels: [] };
    if (m.version !== 1) throw new Error('mixr 版本不是 1');
    while (r.remaining >= 10) {
      m.channels.push([r.i16(), r.i16(), r.i16(), r.i16(), r.i16()]);
    }
    return m;
  },
  (w, m) => {
    w.u16(m.version ?? 1); w.u16(m.monochrome ? 1 : 0);
    for (const ch of m.channels || []) for (let i = 0; i < 5; i++) wI16(w, ch[i]);
  });



reg(['hue ', 'hue2'], 'semantic', '色相/饱和度',
  r => {
    const m = { version: r.u16(), enable: r.u8() !== 0 };
    if (m.version !== 2) throw new Error('hue 版本不是 2');
    r.u8();                                  
    m.colorization = [r.i16(), r.i16(), r.i16()];
    m.master = [r.i16(), r.i16(), r.i16()];
    m.ranges = [];
    for (let i = 0; i < 6 && r.remaining >= 14; i++) {
      m.ranges.push({ range: [r.i16(), r.i16(), r.i16(), r.i16()],
                      settings: [r.i16(), r.i16(), r.i16()] });
    }
    return m;
  },
  (w, m) => {
    w.u16(m.version ?? 2); w.u8(m.enable ? 1 : 0); w.u8(0);
    for (const v of m.colorization || [0, 0, 0]) wI16(w, v);
    for (const v of m.master || [0, 0, 0]) wI16(w, v);
    for (const it of m.ranges || []) { for (const v of it.range) wI16(w, v); for (const v of it.settings) wI16(w, v); }
  });


reg('blnc', 'semantic', '色彩平衡',
  r => ({ shadows: [r.i16(), r.i16(), r.i16()],
          midtones: [r.i16(), r.i16(), r.i16()],
          highlights: [r.i16(), r.i16(), r.i16()],
          preserveLuminosity: r.u8() !== 0 }),
  (w, m) => {
    for (const v of m.shadows || [0, 0, 0]) wI16(w, v);
    for (const v of m.midtones || [0, 0, 0]) wI16(w, v);
    for (const v of m.highlights || [0, 0, 0]) wI16(w, v);
    w.u8(m.preserveLuminosity ? 1 : 0);
  });


reg('phfl', 'semantic', '照片滤镜',
  r => {
    const m = { version: r.u16() };
    if (m.version === 3) m.xyz = [r.u32(), r.u32(), r.u32()];
    else if (m.version === 2) { m.colorSpace = r.u16(); m.color = [r.u16(), r.u16(), r.u16(), r.u16()]; }
    else throw new Error('phfl 版本异常: ' + m.version);
    m.density = r.u32();
    m.preserveLuminosity = r.u8() !== 0;
    return m;
  },
  (w, m) => {
    w.u16(m.version);
    if (m.version === 3) for (const v of m.xyz) w.u32(v);
    else { w.u16(m.colorSpace || 0); for (const v of m.color) w.u16(v); }
    w.u32(m.density >>> 0); w.u8(m.preserveLuminosity ? 1 : 0);
  });


reg('thrs', 'semantic', '阈值', r => ({ level: r.u16() }), (w, m) => w.u16(m.level || 0));
reg('post', 'semantic', '色调分离', r => ({ levels: r.u16() }), (w, m) => w.u16(m.levels || 0));


reg('nvrt', 'semantic', '反相（无数据）', () => ({}), () => {});


reg('expA', 'semantic', '曝光度',
  r => ({ version: r.u16(), exposure: rF32(r), offset: rF32(r), gamma: rF32(r) }),
  (w, m) => { w.u16(m.version ?? 0); wF32(w, m.exposure); wF32(w, m.offset); wF32(w, m.gamma); });


reg('selc', 'semantic', '可选颜色',
  r => {
    const m = { version: r.u16(), method: r.u16(), plates: [] };
    if (m.version !== 1) throw new Error('selc 版本不是 1');
    while (r.remaining >= 8) m.plates.push([r.i16(), r.i16(), r.i16(), r.i16()]);
    return m;
  },
  (w, m) => {
    w.u16(m.version ?? 1); w.u16(m.method || 0);
    for (const p of m.plates || []) for (let i = 0; i < 4; i++) wI16(w, p[i]);
  });



reg('grdm', 'semantic', '渐变映射',
  r => {
    const m = { version: r.u16() };
    if (m.version !== 1 && m.version !== 3) throw new Error('grdm 版本异常: ' + m.version);
    m.reverse = r.u8() !== 0;
    m.dither = r.u8() !== 0;
    if (m.version === 3) m.method = r.key4();
    const u = rUni(r); m.name = u.s; m._nameUnits = u.n;
    let n = r.u16(); m.colorStops = [];
    for (let i = 0; i < n; i++) {
      m.colorStops.push({ location: r.u32(), midpoint: r.u32(), mode: r.u16(),
                          color: [r.u16(), r.u16(), r.u16(), r.u16()], _pad: r.u16() });
    }
    n = r.u16(); m.transparencyStops = [];
    for (let i = 0; i < n; i++) m.transparencyStops.push({ location: r.u32(), midpoint: r.u32(), opacity: r.u16() });
    m.expansion = r.u16(); m.interpolation = r.u16(); m.length = r.u16(); m.mode = r.u16();
    m.randomSeed = r.u32(); m.showTransparency = r.u16(); m.useVectorColor = r.u16();
    m.roughness = r.u32(); m.colorModel = r.u16();
    m.minimumColor = [r.u16(), r.u16(), r.u16(), r.u16()];
    m.maximumColor = [r.u16(), r.u16(), r.u16(), r.u16()];
    m._dummy = r.u16();
    return m;
  },
  (w, m) => {
    w.u16(m.version); w.u8(m.reverse ? 1 : 0); w.u8(m.dither ? 1 : 0);
    if (m.version === 3) w.ascii((m.method || 'Gcls').padEnd(4).slice(0, 4));
    wUni(w, m.name, m._nameUnits);
    w.u16((m.colorStops || []).length);
    for (const s of m.colorStops || []) {
      w.u32(s.location); w.u32(s.midpoint); w.u16(s.mode);
      for (const c of s.color) w.u16(c);
      w.u16(s._pad || 0);
    }
    w.u16((m.transparencyStops || []).length);
    for (const s of m.transparencyStops || []) { w.u32(s.location); w.u32(s.midpoint); w.u16(s.opacity); }
    w.u16(m.expansion ?? 2); w.u16(m.interpolation || 0); w.u16(m.length ?? 32); w.u16(m.mode || 0);
    w.u32(m.randomSeed >>> 0); w.u16(m.showTransparency || 0); w.u16(m.useVectorColor || 0);
    w.u32(m.roughness >>> 0); w.u16(m.colorModel || 0);
    for (const c of m.minimumColor || [0, 0, 0, 0]) w.u16(c);
    for (const c of m.maximumColor || [0, 0, 0, 0]) w.u16(c);
    w.u16(m._dummy || 0);
  });





const SHMD_DESC_KEYS = new Set(['cust', 'cmls', 'mlst', 'extn', 'tmln']);
const SHMD_U32_KEYS = new Set(['mdyn', 'sgrp']);
reg('shmd', 'semantic', '图层元数据（cmls/mlst/cust… 子块）',
  r => {
    const count = r.u32();
    const items = [];
    for (let i = 0; i < count && r.remaining >= 12; i++) {
      const sig = r.key4(), key = r.key4(), copyOnSheet = r.u8();
      const reserved = r.bytes(3).slice();
      const len = r.u32();
      const body = r.bytes(Math.min(len, r.remaining)).slice();
      const item = { sig, key, copyOnSheet: copyOnSheet !== 0, reserved };
      try {
        if (SHMD_U32_KEYS.has(key)) { item.value = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, false); item.kind = 'u32'; }
        else if (SHMD_DESC_KEYS.has(key)) {
          const rr = new Reader(body);
          const d = rDesc(rr);
          item.descVersion = d.descVersion; item.desc = d.desc; item.kind = 'desc';
          item._tail = rr.bytes(rr.remaining).slice();       
        } else { item.data = body; item.kind = 'raw'; }
      } catch (e) { item.data = body; item.kind = 'raw'; item._error = e.message; }
      items.push(item);
    }
    return { items };
  },
  (w, m) => {
    const items = m.items || [];
    w.u32(items.length);
    for (const it of items) {
      w.ascii(it.sig || '8BIM'); w.ascii(it.key);
      w.u8(it.copyOnSheet ? 1 : 0);
      w.bytes(it.reserved && it.reserved.length === 3 ? it.reserved : new Uint8Array(3));
      let body;
      if (it.kind === 'desc') {
        const ww = new Writer();
        ww.u32(it.descVersion ?? 16); ww.bytes(serializeDescriptor(it.desc));
        if (it._tail && it._tail.length) ww.bytes(it._tail);
        body = ww.finish();
      } else if (it.kind === 'u32') {
        const ww = new Writer(); ww.u32(it.value >>> 0); body = ww.finish();
      } else body = toU8(it.data);
      w.u32(body.length); w.bytes(body);
    }
  });






function parseFxBody(type, body) {
  const r = new Reader(body);
  const m = {};
  switch (type) {
    case 'cmnS':
      m.version = r.u32(); m.visible = r.u8() !== 0; m.unused = r.u16(); break;
    case 'dsdw': case 'isdw':
      m.version = r.u32(); m.blur = r.u32(); m.intensity = r.u32();
      m.angle = r.i32(); m.distance = r.u32(); m.color = rColor(r);
      m.blendSig = r.key4(); m.blendKey = r.key4();
      m.enabled = r.u8() !== 0; m.useGlobalAngle = r.u8() !== 0; m.opacity = r.u8();
      if (m.version === 2 && r.remaining >= 10) m.nativeColor = rColor(r);
      break;
    case 'oglw':
      m.version = r.u32(); m.blur = r.u32(); m.intensity = r.u32(); m.color = rColor(r);
      m.blendSig = r.key4(); m.blendKey = r.key4();
      m.enabled = r.u8() !== 0; m.opacity = r.u8();
      if (m.version === 2 && r.remaining >= 10) m.nativeColor = rColor(r);
      break;
    case 'iglw':
      m.version = r.u32(); m.blur = r.u32(); m.intensity = r.u32(); m.color = rColor(r);
      m.blendSig = r.key4(); m.blendKey = r.key4();
      m.enabled = r.u8() !== 0; m.opacity = r.u8();
      if (m.version === 2 && r.remaining >= 11) { m.invert = r.u8() !== 0; m.nativeColor = rColor(r); }
      break;
    case 'bevl':
      m.version = r.u32(); m.angle = r.i32(); m.strength = r.u32(); m.blur = r.u32();
      m.highlightBlendSig = r.key4(); m.highlightBlendKey = r.key4();
      m.shadowBlendSig = r.key4(); m.shadowBlendKey = r.key4();
      m.highlightColor = rColor(r); m.shadowColor = rColor(r);
      m.style = r.u32(); m.highlightOpacity = r.u8(); m.shadowOpacity = r.u8();
      m.enabled = r.u8() !== 0; m.useGlobalAngle = r.u8() !== 0; m.direction = r.u8();
      if (m.version === 2 && r.remaining >= 20) { m.realHighlightColor = rColor(r); m.realShadowColor = rColor(r); }
      break;
    case 'sofi':
      m.version = r.u32(); m.blendSig = r.key4(); m.blendKey = r.key4();
      m.color = rColor(r); m.opacity = r.u8(); m.enabled = r.u8() !== 0;
      if (r.remaining >= 10) m.nativeColor = rColor(r);
      break;
    default:
      return { _raw: toU8(body).slice() };
  }
  m._tail = r.bytes(r.remaining).slice();
  return m;
}
function writeFxBody(type, m) {
  if (m._raw) return toU8(m._raw);
  const w = new Writer();
  switch (type) {
    case 'cmnS': w.u32(m.version >>> 0); w.u8(m.visible ? 1 : 0); w.u16(m.unused || 0); break;
    case 'dsdw': case 'isdw':
      w.u32(m.version >>> 0); w.u32(m.blur >>> 0); w.u32(m.intensity >>> 0);
      w.i32(m.angle | 0); w.u32(m.distance >>> 0); wColor(w, m.color);
      w.ascii(m.blendSig); w.ascii(m.blendKey);
      w.u8(m.enabled ? 1 : 0); w.u8(m.useGlobalAngle ? 1 : 0); w.u8(m.opacity & 255);
      if (m.nativeColor) wColor(w, m.nativeColor);
      break;
    case 'oglw':
      w.u32(m.version >>> 0); w.u32(m.blur >>> 0); w.u32(m.intensity >>> 0); wColor(w, m.color);
      w.ascii(m.blendSig); w.ascii(m.blendKey); w.u8(m.enabled ? 1 : 0); w.u8(m.opacity & 255);
      if (m.nativeColor) wColor(w, m.nativeColor);
      break;
    case 'iglw':
      w.u32(m.version >>> 0); w.u32(m.blur >>> 0); w.u32(m.intensity >>> 0); wColor(w, m.color);
      w.ascii(m.blendSig); w.ascii(m.blendKey); w.u8(m.enabled ? 1 : 0); w.u8(m.opacity & 255);
      if (m.invert !== undefined) w.u8(m.invert ? 1 : 0);
      if (m.nativeColor) wColor(w, m.nativeColor);
      break;
    case 'bevl':
      w.u32(m.version >>> 0); w.i32(m.angle | 0); w.u32(m.strength >>> 0); w.u32(m.blur >>> 0);
      w.ascii(m.highlightBlendSig); w.ascii(m.highlightBlendKey);
      w.ascii(m.shadowBlendSig); w.ascii(m.shadowBlendKey);
      wColor(w, m.highlightColor); wColor(w, m.shadowColor);
      w.u32(m.style >>> 0); w.u8(m.highlightOpacity & 255); w.u8(m.shadowOpacity & 255);
      w.u8(m.enabled ? 1 : 0); w.u8(m.useGlobalAngle ? 1 : 0); w.u8(m.direction & 255);
      if (m.realHighlightColor) { wColor(w, m.realHighlightColor); wColor(w, m.realShadowColor); }
      break;
    case 'sofi':
      w.u32(m.version >>> 0); w.ascii(m.blendSig); w.ascii(m.blendKey);
      wColor(w, m.color); w.u8(m.opacity & 255); w.u8(m.enabled ? 1 : 0);
      if (m.nativeColor) wColor(w, m.nativeColor);
      break;
    default: return toU8(m._raw || new Uint8Array(0));
  }
  if (m._tail && m._tail.length) w.bytes(m._tail);
  return w.finish();
}
reg('lrFX', 'semantic', '旧版二进制图层效果（cmnS/dsdw/isdw/oglw/iglw/bevl/sofi）',
  r => {
    const m = { version: r.u16(), effects: [] };
    const count = r.u16();
    for (let i = 0; i < count && r.remaining >= 12; i++) {
      const sig = r.key4(), type = r.key4(), size = r.u32();
      const body = r.bytes(Math.min(size, r.remaining)).slice();
      m.effects.push({ sig, type, data: parseFxBody(type, body) });
    }
    return m;
  },
  (w, m) => {
    w.u16(m.version ?? 0); w.u16((m.effects || []).length);
    for (const e of m.effects || []) {
      const body = writeFxBody(e.type, e.data);
      w.ascii(e.sig || '8BIM'); w.ascii(e.type); w.u32(body.length); w.bytes(body);
    }
  });





















const VMAL_CHANNEL_HEAD = 4 + 16 + 2 + 1;      

function parseVMAL(bytes) {
  const r = new Reader(bytes);
  const v = { version: r.u32() };
  if (v.version !== 3) throw new Error('VMAL 版本不是 3: ' + v.version);
  v.length = r.u32();
  const bodyStart = r.o;
  v.rect = { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32() };
  v.width = v.rect.right - v.rect.left;
  v.height = v.rect.bottom - v.rect.top;
  v.channelCount = r.u32();
  if (v.channelCount > 0xffff) throw new Error('VMAL 通道数异常: ' + v.channelCount);
  v.channels = [];
  for (let i = 0; i < v.channelCount + 2; i++) {
    if (r.remaining < 4) throw new Error('VMAL 通道槽 ' + i + ' 越界');
    const written = r.u32();
    if (!written) { v.channels.push({ index: i, written: false }); continue; }
    const length = r.u32();
    if (length < VMAL_CHANNEL_HEAD || length - VMAL_CHANNEL_HEAD > r.remaining - VMAL_CHANNEL_HEAD) {
      throw new Error('VMAL 通道槽 ' + i + ' 长度异常: ' + length);
    }
    const ch = {
      index: i, written: true, length,
      pixelDepth: r.u32(),
      rect: { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32() },
      depth: r.u16(),
      compression: r.u8(),
    };
    ch.width = ch.rect.right - ch.rect.left;
    ch.height = ch.rect.bottom - ch.rect.top;
    ch._data = r.bytes(length - VMAL_CHANNEL_HEAD).slice();      
    v.channels.push(ch);
  }
  
  if (r.o - bodyStart !== v.length) {
    throw new Error(`VMAL length 对不上：字段 ${v.length}，实际 ${r.o - bodyStart}`);
  }
  v._tail = r.bytes(r.remaining).slice();                        
  return v;
}

function writeVMAL(w, v) {
  const inner = new Writer();
  const rc = v.rect || { top: 0, left: 0, bottom: 0, right: 0 };
  inner.i32(rc.top | 0); inner.i32(rc.left | 0); inner.i32(rc.bottom | 0); inner.i32(rc.right | 0);
  inner.u32(v.channelCount >>> 0);
  for (const ch of v.channels || []) {
    if (!ch || !ch.written) { inner.u32(0); continue; }
    const data = toU8(ch._data || new Uint8Array(0));
    inner.u32(1);
    inner.u32(ch.length ?? (data.length + VMAL_CHANNEL_HEAD));
    inner.u32(ch.pixelDepth ?? 8);
    const r2 = ch.rect || rc;
    inner.i32(r2.top | 0); inner.i32(r2.left | 0); inner.i32(r2.bottom | 0); inner.i32(r2.right | 0);
    inner.u16(ch.depth ?? 8);
    inner.u8(ch.compression ?? 1);
    inner.bytes(data);
  }
  const body = inner.finish();
  w.u32(v.version ?? 3);
  w.u32(v.length ?? body.length);
  w.bytes(body);
  if (v._tail && v._tail.length) w.bytes(toU8(v._tail));
}






export function decodePatternChannel(ch) {
  if (!ch || !ch.written || !ch._data) return null;
  const depth = ch.depth || ch.pixelDepth || 8;
  if (ch.width <= 0 || ch.height <= 0) return null;
  
  return decodeChannel({
    bytes: toU8(ch._data), width: ch.width, height: ch.height,
    depth, compression: ch.compression, psb: false, keepRaw: true,
  });
}









export function patternToRGBA(pattern) {
  const v = pattern && pattern.vmal;
  if (!v || !v.channels || v.width <= 0 || v.height <= 0) return null;
  const mode = pattern.colorMode;
  if (mode !== 1 && mode !== 2 && mode !== 3) return null;
  const W = v.width, H = v.height;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;

  const blit = (ch, put) => {
    const s = decodePatternChannel(ch);
    if (!s) return false;
    const ox = ch.rect.left - v.rect.left, oy = ch.rect.top - v.rect.top;
    const shift = (ch.depth || 8) === 16 ? 8 : 0;                
    for (let y = 0; y < ch.height; y++) {
      const dy = y + oy; if (dy < 0 || dy >= H) continue;
      for (let x = 0; x < ch.width; x++) {
        const dx = x + ox; if (dx < 0 || dx >= W) continue;
        put((dx + dy * W) * 4, shift ? (s[x + y * ch.width] >> shift) : s[x + y * ch.width]);
      }
    }
    return true;
  };

  const colorSlots = mode === 3 ? 3 : 1;
  for (let c = 0; c < colorSlots; c++) {
    const ch = v.channels[c];
    if (!ch || !ch.written) continue;
    if (mode === 3) blit(ch, (o, val) => { out[o + c] = val; });
    else if (mode === 1) blit(ch, (o, val) => { out[o] = out[o + 1] = out[o + 2] = val; });
    else {
      const pal = pattern.palette || [];
      blit(ch, (o, val) => { const p = pal[val] || [val, val, val]; out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; });
    }
  }
  const alpha = v.channels[v.channelCount + 1];
  if (alpha && alpha.written) blit(alpha, (o, val) => { out[o + 3] = val; });
  return { width: W, height: H, data: out };
}

reg(['Patt', 'Pat2', 'Pat3'], 'semantic', '图案（头部 + 虚拟内存数组列表 / 逐通道压缩体）',
  r => {
    const patterns = [];
    while (r.remaining >= 4) {
      const length = r.u32();
      const span = length + ((4 - (length % 4)) % 4);          
      if (span > r.remaining) { r.o -= 4; break; }
      const body = r.bytes(span).slice();
      const p = { length, _padTo4: span - length };
      try {
        const rr = new Reader(body);
        p.version = rr.u32();
        if (p.version !== 1) throw new Error('图案版本不是 1');
        p.colorMode = rr.u32();
        p.point = [rr.i16(), rr.i16()];
        const u = rUni(rr); p.name = u.s; p._nameUnits = u.n;
        p.id = rPascal(rr);
        if (p.colorMode === 2) { 
          const pal = [];
          for (let i = 0; i < 256; i++) pal.push([rr.u8(), rr.u8(), rr.u8()]);
          p.palette = pal;
          p._paletteTail = rr.bytes(4).slice();
        }
        const rest = rr.bytes(rr.remaining).slice();
        
        try {
          p.vmal = parseVMAL(rest);
          p.bounds = p.vmal.rect;
          p.width = p.vmal.width;
          p.height = p.vmal.height;
        } catch (e) { p._rest = rest; p._vmalError = e.message; }
      } catch (e) { p._body = body; p._error = e.message; }
      patterns.push(p);
    }
    return { patterns };
  },
  (w, m) => {
    for (const p of m.patterns || []) {
      let body;
      if (p._body) body = toU8(p._body);
      else {
        const ww = new Writer();
        ww.u32(p.version ?? 1); ww.u32(p.colorMode || 0);
        wI16(ww, p.point ? p.point[0] : 0); wI16(ww, p.point ? p.point[1] : 0);
        wUni(ww, p.name, p._nameUnits);
        wPascal(ww, p.id);
        if (p.palette) {
          for (const c of p.palette) { ww.u8(c[0]); ww.u8(c[1]); ww.u8(c[2]); }
          ww.bytes(p._paletteTail && p._paletteTail.length === 4 ? p._paletteTail : new Uint8Array(4));
        }
        if (p.vmal) writeVMAL(ww, p.vmal);
        else if (p._rest) ww.bytes(toU8(p._rest));
        body = ww.finish();
      }
      w.u32(p.length ?? body.length);
      w.bytes(body);
    }
  });















function rRect(r) { return { top: r.i32(), left: r.i32(), bottom: r.i32(), right: r.i32() }; }
function wRect(w, rc) {
  rc = rc || {};
  w.i32(rc.top | 0); w.i32(rc.left | 0); w.i32(rc.bottom | 0); w.i32(rc.right | 0);
}


function rPascalPad2(r) {
  const n = r.u8();
  const s = r.ascii(n);
  const o = { s };
  if ((1 + n) % 2) o.pad = r.u8();
  return o;
}
function wPascalPad2(w, o) {
  const s = (o && o.s) || '';
  w.u8(s.length & 255); w.ascii(s);
  if ((1 + s.length) % 2) w.u8((o && o.pad) || 0);
}



function decodeTxtC(bytes) {
  if (bytes.length % 2) return null;
  let o = 0, le = false;
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) o = 2;
  else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) { o = 2; le = true; }
  let s = '';
  for (let i = o; i + 1 < bytes.length; i += 2) {
    s += String.fromCharCode(le ? (bytes[i] | (bytes[i + 1] << 8)) : ((bytes[i] << 8) | bytes[i + 1]));
  }
  return { text: s, enc: { bom: o === 2, le } };
}
function encodeTxtC(text, enc) {
  text = text || '';
  const bom = enc && enc.bom, le = enc && enc.le;
  const out = new Uint8Array((bom ? 2 : 0) + text.length * 2);
  let o = 0;
  if (bom) { out[0] = le ? 0xff : 0xfe; out[1] = le ? 0xfe : 0xff; o = 2; }
  for (let i = 0; i < text.length; i++, o += 2) {
    const c = text.charCodeAt(i);
    if (le) { out[o] = c & 255; out[o + 1] = c >> 8; }
    else { out[o] = c >> 8; out[o + 1] = c & 255; }
  }
  return out;
}
function annotationData(a) {
  if (a.text !== undefined && a._textEnc) return encodeTxtC(a.text, a._textEnc);
  return toU8(a.data || new Uint8Array(0));
}

export const ANNOTATION_TYPES = { txtA: 'text', sndA: 'sound' };

reg('Anno', 'semantic', '注释（文本 txtA / 语音 sndA）',
  r => {
    const m = { major: r.u16(), minor: r.u16(), annotations: [] };
    const count = r.u32();
    if (count > 0xffff) throw new Error('Anno 注释条数异常: ' + count);
    for (let i = 0; i < count && r.remaining >= 4; i++) {
      const length = r.u32();
      if (length < 4) throw new Error('Anno 记录长度异常: ' + length);
      const bodyLen = Math.min(length - 4, r.remaining);
      const body = r.bytes(bodyLen).slice();
      const a = { length, _bodyLenExact: bodyLen === length - 4 };
      try {
        const rr = new Reader(body);
        a.type = rr.key4();
        a.typeName = ANNOTATION_TYPES[a.type] || null;
        a.open = rr.u8() !== 0;
        a.flags = rr.u8();
        a.optionalBlocks = rr.u16();
        a.iconLocation = rRect(rr);
        a.popupLocation = rRect(rr);
        a.color = rColor(rr);
        a.author = rPascalPad2(rr);
        a.name = rPascalPad2(rr);
        a.modDate = rPascalPad2(rr);
        a.dataBlockLength = rr.u32();
        a.dataType = rr.key4();
        a.dataLength = rr.u32();
        a.data = rr.bytes(Math.min(a.dataLength, rr.remaining)).slice();
        a._tail = rr.bytes(rr.remaining).slice();
        if (a.dataType === 'txtC') {
          const dec = decodeTxtC(a.data);
          
          if (dec && sameBytes(encodeTxtC(dec.text, dec.enc), a.data)) {
            a.text = dec.text; a._textEnc = dec.enc;
            delete a.data;
          }
        }
      } catch (e) { a._body = body; a._error = String(e && e.message || e); }
      m.annotations.push(a);
    }
    return m;
  },
  (w, m) => {
    w.u16(m.major ?? 2); w.u16(m.minor ?? 1);
    const list = m.annotations || [];
    w.u32(list.length);
    for (const a of list) {
      let body;
      if (a._body) body = toU8(a._body);
      else {
        const ww = new Writer();
        ww.ascii(String(a.type || 'txtA').padEnd(4).slice(0, 4));
        ww.u8(a.open ? 1 : 0); ww.u8(a.flags & 255); ww.u16(a.optionalBlocks || 0);
        wRect(ww, a.iconLocation); wRect(ww, a.popupLocation);
        wColor(ww, a.color);
        wPascalPad2(ww, a.author); wPascalPad2(ww, a.name); wPascalPad2(ww, a.modDate);
        const data = annotationData(a);
        
        const wantBlock = 12 + data.length;
        ww.u32(a.dataBlockLength === wantBlock ? a.dataBlockLength : wantBlock);
        ww.ascii(String(a.dataType || 'txtC').padEnd(4).slice(0, 4));
        ww.u32(a.dataLength === data.length ? a.dataLength : data.length);
        ww.bytes(data);
        if (a._tail && a._tail.length) ww.bytes(toU8(a._tail));
        body = ww.finish();
      }
      
      w.u32(a._bodyLenExact && a.length === body.length + 4 ? a.length : body.length + 4);
      w.bytes(body);
    }
  });







reg(['FEid', 'FXid'], 'semantic', '智能滤镜输入缓存（逐条目 / 逐通道）',
  (r, raw) => { r.skip(toU8(raw).length); return parseFilterEffectsBlock(toU8(raw)); },
  (w, m) => w.bytes(writeFilterEffectsBlock(m)));


reg('FMsk', 'semantic', '滤镜蒙版（颜色 + 不透明度）',
  r => ({ color: rColor(r), opacity: r.u16() }),
  (w, m) => { wColor(w, m.color); w.u16(m.opacity || 0); });




reg('Txt2', 'semantic', '全局文字引擎数据（EngineData）',
  (r, raw) => {
    const bytes = toU8(raw);
    r.skip(bytes.length);
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    const body = bytes.subarray(0, end);
    return {
      format: detectEngineDataFormat(body),
      engineData: parseEngineData(body),
      _trailingNul: bytes.length - end,
    };
  },
  (w, m) => {
    w.bytes(serializeEngineData(m.engineData, { format: m.format || 'compact' }));
    if (m._trailingNul) w.bytes(new Uint8Array(m._trailingNul));
  });

const RAW_ONLY = {
  TySh: '文字工具对象设置 —— 已在 core/psd-parse.js 的 readLayerRecord 里解析，本模块不重复实现',
  lnk2: '链接文件列表 —— 见 core/psd-parse.js 的 readLinkedFiles',
  lnk3: '链接文件列表 —— 见 core/psd-parse.js 的 readLinkedFiles',
  lnkD: '链接文件列表 —— 见 core/psd-parse.js 的 readLinkedFiles',
  lnkE: '外链文件列表 —— 见 core/psd-parse.js 的 readLinkedFiles',
  Layr: '嵌套图层信息 —— 整段 Layer Info 结构，由 core/psd-document.js 下钻处理，本模块不重复实现',
  Lr16: '16 位图层信息 —— 同 Layr，由 core/psd-document.js 下钻处理',
  Lr32: '32 位图层信息 —— 同 Layr，由 core/psd-document.js 下钻处理',
  Mtrn: '合并透明度 —— 纯像素平面，由 core/psd-image.js 按需解码，本模块只保字节',
  Mt16: '合并透明度（16 位）—— 同 Mtrn',
  Mt32: '合并透明度（32 位）—— 同 Mtrn',
  Alph: 'Alpha 通道 —— 纯像素平面，同 Mtrn',
};
for (const [k, note] of Object.entries(RAW_ONLY)) {
  reg(k, 'raw', note, (r, raw) => { r.skip(raw.length); return { _raw: toU8(raw).slice() }; }, (w, m) => w.bytes(toU8(m._raw)));
}










export function parseAdditionalBlock(key, bytes, ctx = {}) {
  const raw = toU8(bytes).slice();
  const h = REG.get(key);
  if (!h) return { _key: key, _kind: 'raw', _raw: raw };
  let model;
  try {
    const r = new Reader(raw, !!ctx.psb);
    model = h.parse(r, raw, ctx) || {};
    if (model._tail === undefined && !model._raw) model._tail = r.bytes(r.remaining).slice();
    model._key = key;
    model._kind = h.kind;
  } catch (e) {
    return { _key: key, _kind: 'raw', _raw: raw, _error: String(e && e.message || e) };
  }
  
  if (ctx.verify !== false) {
    try {
      if (!sameBytes(writeAdditionalBlock(key, model, ctx), raw)) {
        return { _key: key, _kind: 'raw', _raw: raw, _error: '写回不一致，已降级为 _raw' };
      }
    } catch (e) {
      return { _key: key, _kind: 'raw', _raw: raw, _error: '写回抛错，已降级为 _raw: ' + (e && e.message) };
    }
  }
  return model;
}




export function writeAdditionalBlock(key, model, ctx = {}) {
  if (!model) return new Uint8Array(0);
  const h = REG.get(key);
  if (model._raw !== undefined && (!h || h.kind === 'raw' || model._error)) return toU8(model._raw);
  if (!h) return toU8(model._raw || new Uint8Array(0));
  const w = new Writer();
  h.write(w, model, ctx);
  if (model._tail && model._tail.length) w.bytes(toU8(model._tail));
  return w.finish();
}


export function hasAdditionalHandler(key) { return REG.has(key); }


export function listAdditionalKeys() {
  return [...REG.values()].map(h => ({ key: h.key, kind: h.kind, note: h.note }))
    .sort((a, b) => a.key.localeCompare(b.key));
}


export function registerAdditionalHandler(key, kind, note, parse, write) {
  reg(key, kind, note, parse, write);
}

export { parsePathRecords, writePathRecords, parseVectorMask, writeVectorMask };
