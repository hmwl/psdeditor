





















import { Reader, readDescriptor } from './psd-parse.js';
import { Writer, serializeDescriptor } from './psd-descriptor.js';
import { parsePathRecords, writePathRecords } from './psd-path.js';




const rF32 = r => { const v = r.dv.getFloat32(r.o); r.o += 4; return v; };
const rFixed16 = r => r.u32() / 65536;              
const rFixed16s = r => r.i32() / 65536;             




function rUStr(r, host, key) {
  const n = r.u32();
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(r.u16());
  let nul = false;
  if (s.endsWith('\0')) { nul = true; s = s.slice(0, -1); }
  if (host) {
    host[key] = s;
    if (!nul) (host.__noNul || (host.__noNul = {}))[key] = true;
  }
  return s;
}
function wUStr(w, host, key) {
  const s = (host && host[key]) || '';
  const noNul = host && host.__noNul && host.__noNul[key];
  w.u32(s.length + (noNul ? 0 : 1));
  for (let i = 0; i < s.length; i++) w.u16(s.charCodeAt(i));
  if (!noNul) w.u16(0);
}

function rPascal(r, pad = 1) {
  const len = r.u8();
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(r.u8());
  if (pad > 1 && (1 + len) % pad) r.skip(pad - ((1 + len) % pad));
  return s;
}


class W extends Writer {
  i16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v | 0); this.push(b); }
  f32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v); this.push(b); }
  fixed16(v) { this.u32(Math.round(v * 65536)); }
  fixed16s(v) { this.i32(Math.round(v * 65536)); }
  ustr(s) { this.unicode(s || ''); }                 
  pascal(s, pad = 1) {
    s = s || '';
    this.u8(s.length & 255);
    this.ascii(s);
    if (pad > 1 && (1 + s.length) % pad) for (let i = (1 + s.length) % pad; i < pad; i++) this.u8(0);
  }
}

const bytesEqual = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const concat = list => {
  let n = 0; for (const p of list) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
};
const utf8Decode = b => new TextDecoder('utf-8').decode(b);
const utf8Encode = s => new TextEncoder().encode(s);



export const COLOR_MODE = {
  0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB',
  4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab',
};















export function paletteRGB(model) {
  const p = model && model.palette;
  if (!p || !p.r || !p.g || !p.b) return null;
  const out = new Uint8Array(768);
  for (let i = 0; i < 256; i++) { out[i * 3] = p.r[i]; out[i * 3 + 1] = p.g[i]; out[i * 3 + 2] = p.b[i]; }
  return out;
}

export function parseColorModeData(bytes, header = {}, baseOff = 0) {
  const mode = header.mode;
  const model = {
    _off: baseOff,
    _raw: bytes,
    length: bytes.length,
    mode,
    modeName: COLOR_MODE[mode] || (mode === undefined ? undefined : 'Unknown'),
    kind: 'empty',
  };
  if (!bytes.length) return model;

  
  if (bytes.length === 768 && (mode === 2 || mode === undefined)) {
    model.kind = 'indexed';
    model.palette = {
      r: bytes.subarray(0, 256),
      g: bytes.subarray(256, 512),
      b: bytes.subarray(512, 768),
    };
    
    
    
    
    Object.defineProperty(model, 'paletteRGB', {
      value: () => paletteRGB(model), enumerable: false, configurable: true, writable: true,
    });
    return model;
  }

  
  
  if (mode === 8 || mode === undefined) {
    model.kind = 'duotone';
    model.duotone = { _raw: bytes, length: bytes.length, _probe: probeDuotone(bytes) };
    return model;
  }

  model.kind = 'unknown';
  return model;
}























function probeDuotone(bytes) {
  const probe = {
    note: '双色调设定块格式未公开（规范只要求原样保留）；以下全部是结构探针，不参与写回',
    length: bytes.length,
    confidence: 'none',
  };
  try {
    if (bytes.length < 4) { probe.unrecognized = '长度不足 4 字节，连 version/inkCount 都读不到'; return probe; }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    probe.version = dv.getUint16(0);
    probe.inkCount = dv.getUint16(2);
    if (probe.version !== 1 || probe.inkCount < 1 || probe.inkCount > 4) {
      probe.unrecognized = `version=${probe.version} inkCount=${probe.inkCount} 不符合 (1, 1..4)，判定为非标准双色调块`;
      return probe;
    }
    probe.confidence = 'header-only';        

    
    const rest = bytes.length - 4;
    const candidates = [
      { name: 'ink{color10+name32} + curve13x2', per: 10 + 32, curve: 26 },
      { name: 'ink{color10+name64} + curve13x2', per: 10 + 64, curve: 26 },
      { name: 'ink{color10+name32} + curve16x2', per: 10 + 32, curve: 32 },
      { name: 'ink{color10+name64} + curve16x2', per: 10 + 64, curve: 32 },
    ];
    probe.layoutCandidates = candidates.map(c => {
      const need4 = 4 * (c.per + c.curve);           
      const needN = probe.inkCount * (c.per + c.curve);
      return { layout: c.name, bytesFor4Slots: need4, bytesForInkCount: needN,
               fits: rest === need4 ? '4 槽全写' : rest === needN ? `${probe.inkCount} 槽` : false };
    }).filter(c => c.fits);
    if (probe.layoutCandidates.length === 1) probe.confidence = 'single-layout-fits';

    
    const curves = [];
    for (const n of [13, 16]) {
      for (let o = 4; o + n * 2 <= bytes.length; o += 2) {
        const c = [];
        let ok = true;
        for (let k = 0; k < n; k++) {
          const v = dv.getInt16(o + k * 2);
          if (v < -1 || v > 1000) { ok = false; break; }
          c.push(v);
        }
        if (ok && c[0] === 0 && c[n - 1] === 1000) curves.push({ points: n, offset: o, curve: c });
      }
    }
    if (curves.length) {
      probe.curveCandidates = curves;
      probe.curves = curves;                 
    }
  } catch (e) {
    probe.error = String(e && e.message || e);
  }
  return probe;
}


export function writeColorModeData(model) {
  if (!model) return new Uint8Array(0);
  if (model.kind === 'indexed' && model.palette && !model._forceRaw) {
    const { r, g, b } = model.palette;
    if (r && g && b && r.length === 256 && g.length === 256 && b.length === 256) {
      const out = new Uint8Array(768);
      out.set(r, 0); out.set(g, 256); out.set(b, 512);
      return out;
    }
  }
  const raw = (model.duotone && model.duotone._raw) || model._raw;
  return raw ? new Uint8Array(raw) : new Uint8Array(0);
}




export function parsePathResource(bytes, baseOff = 0) {
  const m = parsePathRecords(bytes);
  m._off = baseOff;
  return m;
}
export function writePathResource(model) {
  return writePathRecords(model);
}






const H = {};
const def = (ids, name, parse, write) => {
  for (const id of [].concat(ids)) H[id] = { name, parse, write };
};

const RAW_ONLY = {};
const rawOnly = (ids, name, why) => {
  for (const id of [].concat(ids)) RAW_ONLY[id] = { name, why };
};

const rd = b => new Reader(b);
const wr = () => new W();


const descParse = b => {
  const r = rd(b);
  const version = r.u32();
  const desc = readDescriptor(r);
  return { descriptorVersion: version, descriptor: desc, _extra: r.o < b.length ? b.subarray(r.o) : null };
};
const descWrite = m => {
  const w = wr();
  w.u32(m.descriptorVersion === undefined ? 16 : m.descriptorVersion);
  w.bytes(serializeDescriptor(m.descriptor));
  if (m._extra) w.bytes(m._extra);
  return w.finish();
};


const colorParse = r => ({ colorSpace: r.u16(), components: [r.u16(), r.u16(), r.u16(), r.u16()] });
const colorWrite = (w, c) => { w.u16(c.colorSpace); for (let i = 0; i < 4; i++) w.u16(c.components[i] || 0); };


def(1000, 'PS2.0 header (obsolete)',
  b => { const r = rd(b); return { channels: r.u16(), rows: r.u16(), columns: r.u16(), depth: r.u16(), mode: r.u16() }; },
  m => { const w = wr(); w.u16(m.channels); w.u16(m.rows); w.u16(m.columns); w.u16(m.depth); w.u16(m.mode); return w.finish(); });


def(1003, 'Indexed color table (obsolete)',
  b => ({ table: b }),
  m => new Uint8Array(m.table));


export const RESOLUTION_UNIT = { 1: 'PPI', 2: 'PPCM' };
export const DIMENSION_UNIT = { 1: 'inches', 2: 'cm', 3: 'points', 4: 'picas', 5: 'columns' };
def(1005, 'ResolutionInfo',
  b => {
    const r = rd(b);
    const o = {
      horizontalResolution: rFixed16(r), horizontalResolutionUnit: r.u16(), widthUnit: r.u16(),
      verticalResolution: rFixed16(r), verticalResolutionUnit: r.u16(), heightUnit: r.u16(),
    };
    o.horizontalResolutionUnitName = RESOLUTION_UNIT[o.horizontalResolutionUnit];
    o.verticalResolutionUnitName = RESOLUTION_UNIT[o.verticalResolutionUnit];
    o.widthUnitName = DIMENSION_UNIT[o.widthUnit];
    o.heightUnitName = DIMENSION_UNIT[o.heightUnit];
    return o;
  },
  m => {
    const w = wr();
    w.fixed16(m.horizontalResolution); w.u16(m.horizontalResolutionUnit); w.u16(m.widthUnit);
    w.fixed16(m.verticalResolution); w.u16(m.verticalResolutionUnit); w.u16(m.heightUnit);
    return w.finish();
  });


def(1006, 'Alpha channel names (Pascal)',
  b => { const r = rd(b); const names = []; while (r.remaining >= 1) names.push(rPascal(r, 1)); return { names }; },
  m => { const w = wr(); for (const n of m.names) w.pascal(n, 1); return w.finish(); });


export const ALPHA_CHANNEL_MODE = { 0: 'alpha', 1: 'invertedAlpha', 2: 'spot' };   
const dispChannel = r => {
  const c = { colorSpace: r.u16(), components: [r.u16(), r.u16(), r.u16(), r.u16()], opacity: r.u16(), mode: r.u8() };
  c.modeName = ALPHA_CHANNEL_MODE[c.mode];
  return c;
};
const dispChannelW = (w, c) => { colorWrite(w, c); w.u16(c.opacity); w.u8(c.mode); };
def(1007, 'DisplayInfo (obsolete, see 1077)',
  b => { const r = rd(b); const channels = []; while (r.remaining >= 13) channels.push(dispChannel(r)); return { channels, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); for (const c of m.channels) dispChannelW(w, c); if (m._tail) w.bytes(m._tail); return w.finish(); });
def(1077, 'DisplayInfo (floating point colors)',
  b => { const r = rd(b); const version = r.u32(); const channels = []; while (r.remaining >= 13) channels.push(dispChannel(r)); return { version, channels, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); w.u32(m.version); for (const c of m.channels) dispChannelW(w, c); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1008, 'Caption (Pascal)',
  b => { const r = rd(b); const caption = rPascal(r, 1); return { caption, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); w.pascal(m.caption, 1); if (m._tail) w.bytes(m._tail); return w.finish(); });


export const BORDER_UNIT = DIMENSION_UNIT;
def(1009, 'Border information',
  b => { const r = rd(b); const width = rFixed16(r); const units = r.u16(); return { width, units, unitsName: BORDER_UNIT[units] }; },
  m => { const w = wr(); w.fixed16(m.width); w.u16(m.units); return w.finish(); });


def(1010, 'Background color',
  b => colorParse(rd(b)),
  m => { const w = wr(); colorWrite(w, m); return w.finish(); });


const PRINT_FLAG_NAMES = ['labels', 'cropMarks', 'colorBars', 'registrationMarks', 'negative', 'flip', 'interpolate', 'caption', 'printFlags'];
def(1011, 'Print flags',
  b => {
    const r = rd(b); const o = { _count: Math.min(b.length, PRINT_FLAG_NAMES.length) };
    for (let i = 0; i < o._count; i++) o[PRINT_FLAG_NAMES[i]] = r.u8() !== 0;
    o._tail = r.remaining ? b.subarray(r.o) : null;
    return o;
  },
  m => { const w = wr(); for (let i = 0; i < m._count; i++) w.u8(m[PRINT_FLAG_NAMES[i]] ? 1 : 0); if (m._tail) w.bytes(m._tail); return w.finish(); });


export const HALFTONE_SHAPE = { 0: 'round', 1: 'ellipse', 2: 'line', 3: 'square', 4: 'cross', 6: 'diamond' };
const halftoneParse = b => {
  const r = rd(b); const screens = [];
  while (r.remaining >= 18) {
    const freq = rFixed16(r), units = r.u16(), angle = rFixed16s(r), shape = r.u16();
    const misc = r.u32(), useAccurate = r.u8() !== 0, useDefault = r.u8() !== 0;
    screens.push({ frequency: freq, unitsIsPercent: units !== 0, units, angle, shape, shapeName: HALFTONE_SHAPE[shape], misc, useAccurateScreens: useAccurate, useDefaultScreens: useDefault });
  }
  return { screens, _tail: r.remaining ? b.subarray(r.o) : null };
};
const halftoneWrite = m => {
  const w = wr();
  for (const s of m.screens) {
    w.fixed16(s.frequency); w.u16(s.units); w.fixed16s(s.angle); w.u16(s.shape);
    w.u32(s.misc); w.u8(s.useAccurateScreens ? 1 : 0); w.u8(s.useDefaultScreens ? 1 : 0);
  }
  if (m._tail) w.bytes(m._tail);
  return w.finish();
};
def([1012, 1013, 1014], 'Halftoning information', halftoneParse, halftoneWrite);


const transferParse = b => {
  const r = rd(b); const functions = [];
  while (r.remaining >= 28) {
    const curve = []; for (let i = 0; i < 13; i++) curve.push(r.i16());
    functions.push({ curve, override: r.u16() });
  }
  return { functions, _tail: r.remaining ? b.subarray(r.o) : null };
};
const transferWrite = m => {
  const w = wr();
  for (const f of m.functions) { for (let i = 0; i < 13; i++) w.i16(f.curve[i]); w.u16(f.override); }
  if (m._tail) w.bytes(m._tail);
  return w.finish();
};
def([1015, 1016, 1017], 'Transfer function', transferParse, transferWrite);


def(1019, 'Dot range (black/white)',
  b => { const r = rd(b); return { black: r.u16(), white: r.u16() }; },
  m => { const w = wr(); w.u16(m.black); w.u16(m.white); return w.finish(); });


def(1022, 'Quick Mask information',
  b => { const r = rd(b); return { channelId: r.u16(), wasEmpty: r.u8() !== 0 }; },
  m => { const w = wr(); w.u16(m.channelId); w.u8(m.wasEmpty ? 1 : 0); return w.finish(); });


def(1024, 'Layer state information (target layer index)',
  b => ({ targetLayer: rd(b).u16() }), m => { const w = wr(); w.u16(m.targetLayer); return w.finish(); });
def(1046, 'Indexed color table count',
  b => ({ count: rd(b).u16() }), m => { const w = wr(); w.u16(m.count); return w.finish(); });
def(1047, 'Transparency index',
  b => ({ index: rd(b).u16() }), m => { const w = wr(); w.u16(m.index); return w.finish(); });


def(1025, 'Working path (not saved)',
  b => parsePathResource(b), m => writePathResource(m));


def(1026, 'Layers group information',
  b => { const r = rd(b); const groups = []; while (r.remaining >= 2) groups.push(r.u16()); return { groups, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); for (const g of m.groups) w.u16(g); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1030, 'JPEG quality (private)',
  b => { const r = rd(b); const words = []; while (r.remaining >= 2) words.push(r.u16()); return { quality: words[0], format: words[1], progressiveScans: words[2], words, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); for (const v of m.words) w.u16(v); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1032, 'Grid and guides information',
  b => {
    const r = rd(b);
    const version = r.u32(), gridHorizontal = r.u32(), gridVertical = r.u32(), count = r.u32();
    const guides = [];
    for (let i = 0; i < count && r.remaining >= 5; i++) {
      const location = r.u32();               
      const direction = r.u8();               
      guides.push({ location, locationPx: location / 32, direction, vertical: direction === 0 });
    }
    return { version, gridHorizontal, gridVertical, guides, _tail: r.remaining ? b.subarray(r.o) : null };
  },
  m => {
    const w = wr();
    w.u32(m.version); w.u32(m.gridHorizontal); w.u32(m.gridVertical); w.u32(m.guides.length);
    for (const g of m.guides) { w.u32(g.location); w.u8(g.direction); }
    if (m._tail) w.bytes(m._tail);
    return w.finish();
  });


const thumbParse = (b, bgr) => {
  const r = rd(b);
  const o = {
    format: r.u32(), width: r.u32(), height: r.u32(), widthBytes: r.u32(),
    totalSize: r.u32(), compressedSize: r.u32(), bitsPerPixel: r.u16(), planes: r.u16(),
  };
  o.formatName = o.format === 1 ? 'kJpegRGB' : 'kRawRGB';
  o.bgr = !!bgr;                                
  o.data = b.subarray(r.o);
  return o;
};
const thumbWrite = m => {
  const w = wr();
  w.u32(m.format); w.u32(m.width); w.u32(m.height); w.u32(m.widthBytes);
  w.u32(m.totalSize); w.u32(m.compressedSize); w.u16(m.bitsPerPixel); w.u16(m.planes);
  w.bytes(m.data);
  return w.finish();
};
def(1033, 'Thumbnail (Photoshop 4.0, BGR)', b => thumbParse(b, true), thumbWrite);
def(1036, 'Thumbnail (Photoshop 5.0+, JPEG RGB)', b => thumbParse(b, false), thumbWrite);


const byteFlag = key => ({
  parse: b => { const o = {}; o[key] = rd(b).u8(); o.value = o[key]; return o; },
  write: m => new Uint8Array([m.value & 255]),
});
for (const [id, key, nm] of [[1034, 'copyright', 'Copyright flag'], [1040, 'watermark', 'Watermark'],
[1041, 'iccUntagged', 'ICC untagged profile'], [1042, 'effectsVisible', 'Effects visible']]) {
  const h = byteFlag(key); H[id] = { name: nm, parse: h.parse, write: h.write };
}


def(1035, 'URL',
  b => ({ url: utf8Decode(b) }), m => utf8Encode(m.url));


def(1037, 'Global angle', b => ({ globalAngle: rd(b).i32() }), m => { const w = wr(); w.i32(m.globalAngle); return w.finish(); });
def(1049, 'Global altitude', b => ({ globalAltitude: rd(b).i32() }), m => { const w = wr(); w.i32(m.globalAltitude); return w.finish(); });
def(1044, 'Document-specific IDs seed number', b => ({ idsSeed: rd(b).u32() }), m => { const w = wr(); w.u32(m.idsSeed); return w.finish(); });


export const SAMPLER_COLOR_SPACE = {
  0: 'RGB', 1: 'HSB', 2: 'CMYK', 3: 'Pantone', 4: 'Focoltone', 5: 'Trumatch', 6: 'Toyo',
  7: 'Lab', 8: 'Gray', 9: 'WideCMYK', 10: 'HKS', 11: 'DIC', 12: 'TotalInk', 13: 'MonitorRGB',
  14: 'Duotone', 15: 'Opacity', 16: 'Web', 17: 'GrayFloat', 18: 'RGBFloat', 19: 'OpacityFloat',
};
const samplerParse = b => {
  const r = rd(b);
  const version = r.u32(), count = r.u32();
  const samplers = [];
  for (let i = 0; i < count && r.remaining >= 10; i++) {
    const s = {};
    if (version === 3) s.samplerVersion = r.u32();
    
    if (version >= 2) { s.vertical = rF32(r); s.horizontal = rF32(r); }
    else { s.vertical = rFixed16(r); s.horizontal = rFixed16(r); }
    s.colorSpace = r.u16();
    s.colorSpaceName = SAMPLER_COLOR_SPACE[s.colorSpace];
    if (version >= 2) s.depth = r.u16();
    samplers.push(s);
  }
  return { version, samplers, _tail: r.remaining ? b.subarray(r.o) : null };
};
const samplerWrite = m => {
  const w = wr();
  w.u32(m.version); w.u32(m.samplers.length);
  for (const s of m.samplers) {
    if (m.version === 3) w.u32(s.samplerVersion);
    if (m.version >= 2) { w.f32(s.vertical); w.f32(s.horizontal); }
    else { w.fixed16(s.vertical); w.fixed16(s.horizontal); }
    w.u16(s.colorSpace);
    if (m.version >= 2) w.u16(s.depth);
  }
  if (m._tail) w.bytes(m._tail);
  return w.finish();
};
def(1038, 'Color samplers (obsolete, see 1073)', samplerParse, samplerWrite);
def(1073, 'Color samplers (Photoshop CS3)', samplerParse, samplerWrite);


def(1039, 'ICC profile',
  b => {
    const o = { icc: b, size: b.length };
    if (b.length >= 132) {                    
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      o.iccSize = dv.getUint32(0);
      o.colorSpace = String.fromCharCode(b[16], b[17], b[18], b[19]);
      o.pcs = String.fromCharCode(b[20], b[21], b[22], b[23]);
    }
    return o;
  },
  m => new Uint8Array(m.icc));


def(1043, 'Spot halftone',
  b => { const r = rd(b); const version = r.u32(), length = r.u32(); return { version, length, data: b.subarray(r.o) }; },
  m => { const w = wr(); w.u32(m.version); w.u32(m.length); w.bytes(m.data); return w.finish(); });


def(1045, 'Unicode alpha names',
  b => { const r = rd(b); const names = []; while (r.remaining >= 4) rUStr(r, names, names.length); return { names, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); for (let i = 0; i < m.names.length; i++) wUStr(w, m.names, i); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1050, 'Slices',
  b => {
    const r = rd(b);
    const version = r.u32();
    if (version === 7 || version === 8) {
      const descriptorVersion = r.u32();
      const descriptor = readDescriptor(r);
      return { version, descriptorVersion, descriptor, _extra: r.o < b.length ? b.subarray(r.o) : null };
    }
    if (version !== 6) throw new Error('未知 slices 版本 ' + version);
    const bounds = { top: r.u32(), left: r.u32(), bottom: r.u32(), right: r.u32() };
    const head = {};
    rUStr(r, head, 'groupName');
    const count = r.u32();
    const slices = [];
    for (let i = 0; i < count; i++) {
      const s = { id: r.u32(), groupId: r.u32(), origin: r.u32() };
      if (s.origin === 1) s.associatedLayerId = r.u32();
      rUStr(r, s, 'name');
      s.type = r.u32();
      s.bounds = { left: r.u32(), top: r.u32(), right: r.u32(), bottom: r.u32() };
      rUStr(r, s, 'url'); rUStr(r, s, 'target'); rUStr(r, s, 'message'); rUStr(r, s, 'altTag');
      s.cellTextIsHTML = r.u8() !== 0;
      rUStr(r, s, 'cellText');
      s.horizontalAlignment = r.u32(); s.verticalAlignment = r.u32();
      s.alpha = r.u8(); s.red = r.u8(); s.green = r.u8(); s.blue = r.u8();
      




      if (r.remaining >= 4) {
        const save = r.o;
        const ver = r.u32();
        if (ver === 16) {
          try { s.descriptorVersion = ver; s.descriptor = readDescriptor(r); }
          catch (e) { r.o = save; delete s.descriptorVersion; delete s.descriptor; }
        } else r.o = save;
      }
      slices.push(s);
    }
    return {
      version, bounds, groupName: head.groupName, __noNul: head.__noNul,
      slices, _extra: r.o < b.length ? b.subarray(r.o) : null,
    };
  },
  m => {
    const w = wr();
    w.u32(m.version);
    if (m.version === 7 || m.version === 8) {
      w.u32(m.descriptorVersion); w.bytes(serializeDescriptor(m.descriptor));
      if (m._extra) w.bytes(m._extra);
      return w.finish();
    }
    w.u32(m.bounds.top); w.u32(m.bounds.left); w.u32(m.bounds.bottom); w.u32(m.bounds.right);
    wUStr(w, m, 'groupName'); w.u32(m.slices.length);
    for (const s of m.slices) {
      w.u32(s.id); w.u32(s.groupId); w.u32(s.origin);
      if (s.origin === 1) w.u32(s.associatedLayerId);
      wUStr(w, s, 'name'); w.u32(s.type);
      w.u32(s.bounds.left); w.u32(s.bounds.top); w.u32(s.bounds.right); w.u32(s.bounds.bottom);
      wUStr(w, s, 'url'); wUStr(w, s, 'target'); wUStr(w, s, 'message'); wUStr(w, s, 'altTag');
      w.u8(s.cellTextIsHTML ? 1 : 0); wUStr(w, s, 'cellText');
      w.u32(s.horizontalAlignment); w.u32(s.verticalAlignment);
      w.u8(s.alpha); w.u8(s.red); w.u8(s.green); w.u8(s.blue);
      if (s.descriptor) { w.u32(s.descriptorVersion); w.bytes(serializeDescriptor(s.descriptor)); }
    }
    if (m._extra) w.bytes(m._extra);
    return w.finish();
  });


const uStrRes = key => ({
  parse: b => {
    const r = rd(b); const o = {};
    rUStr(r, o, 'text'); o[key] = o.text;
    o._tail = r.remaining ? b.subarray(r.o) : null;
    return o;
  },
  write: m => { const w = wr(); wUStr(w, m, 'text'); if (m._tail) w.bytes(m._tail); return w.finish(); },
});
for (const [id, key, nm] of [[1051, 'workflowUrl', 'Workflow URL'], [1086, 'autoSaveFilePath', 'Auto save file path'],
[1087, 'autoSaveFormat', 'Auto save format']]) {
  const h = uStrRes(key); H[id] = { name: nm, parse: h.parse, write: h.write };
}


def(1052, 'Jump To XPEP',
  b => {
    const r = rd(b);
    const major = r.u16(), minor = r.u16(), count = r.u32();
    const blocks = [];
    for (let i = 0; i < count && r.remaining >= 8; i++) {
      const blockSize = r.u32(), key = r.key4();
      const blk = { blockSize, key };
      if (key === 'jtDd') blk.dirty = r.u8() !== 0;
      else blk.modDate = r.u32();
      blocks.push(blk);
    }
    return { major, minor, blocks, _tail: r.remaining ? b.subarray(r.o) : null };
  },
  m => {
    const w = wr();
    w.u16(m.major); w.u16(m.minor); w.u32(m.blocks.length);
    for (const b of m.blocks) {
      w.u32(b.blockSize); w.ascii(b.key);
      if (b.key === 'jtDd') w.u8(b.dirty ? 1 : 0); else w.u32(b.modDate);
    }
    if (m._tail) w.bytes(m._tail);
    return w.finish();
  });


def(1053, 'Alpha identifiers',
  b => { const r = rd(b); const ids = []; while (r.remaining >= 4) ids.push(r.u32()); return { identifiers: ids, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); for (const id of m.identifiers) w.u32(id); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1054, 'URL list',
  b => {
    const r = rd(b); const count = r.u32(); const urls = [];
    for (let i = 0; i < count && r.remaining >= 8; i++) {
      const u = { ref: r.key4(), id: r.u32() };
      rUStr(r, u, 'url');
      urls.push(u);
    }
    return { urls, _tail: r.remaining ? b.subarray(r.o) : null };
  },
  m => { const w = wr(); w.u32(m.urls.length); for (const u of m.urls) { w.ascii(u.ref); w.u32(u.id); wUStr(w, u, 'url'); } if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1057, 'Version info',
  b => {
    const r = rd(b);
    const o = { version: r.u32(), hasRealMergedData: r.u8() !== 0 };
    rUStr(r, o, 'writerName');
    rUStr(r, o, 'readerName');
    o.fileVersion = r.u32();
    o._tail = r.remaining ? b.subarray(r.o) : null;
    return o;
  },
  m => {
    const w = wr();
    w.u32(m.version); w.u8(m.hasRealMergedData ? 1 : 0);
    wUStr(w, m, 'writerName'); wUStr(w, m, 'readerName'); w.u32(m.fileVersion);
    if (m._tail) w.bytes(m._tail);
    return w.finish();
  });


def(1060, 'XMP metadata',
  b => ({ xmp: utf8Decode(b), bytes: b }),
  m => (m.xmp !== undefined ? utf8Encode(m.xmp) : new Uint8Array(m.bytes)));


def(1061, 'Caption digest (MD5)',
  b => ({ digest: b, hex: Array.from(b, x => x.toString(16).padStart(2, '0')).join('') }),
  m => new Uint8Array(m.digest));


export const PRINT_SCALE_STYLE = { 0: 'centered', 1: 'sizeToFit', 2: 'userDefined' };
def(1062, 'Print scale',
  b => { const r = rd(b); const style = r.u16(); return { style, styleName: PRINT_SCALE_STYLE[style], x: rF32(r), y: rF32(r), scale: rF32(r) }; },
  m => { const w = wr(); w.u16(m.style); w.f32(m.x); w.f32(m.y); w.f32(m.scale); return w.finish(); });


def(1064, 'Pixel aspect ratio',
  b => { const r = rd(b); return { version: r.u32(), aspect: r.f64() }; },
  m => { const w = wr(); w.u32(m.version); w.f64(m.aspect); return w.finish(); });


def(1066, 'Alternate duotone colors',
  b => {
    const r = rd(b);
    const version = r.u16(), count = r.u16(); const colors = [];
    for (let i = 0; i < count && r.remaining >= 10; i++) colors.push(colorParse(r));
    const labCount = r.remaining >= 2 ? r.u16() : 0;
    const lab = [];
    for (let i = 0; i < labCount && r.remaining >= 3; i++) lab.push([r.u8(), r.u8(), r.u8()]);
    return { version, colors, lab, _tail: r.remaining ? b.subarray(r.o) : null };
  },
  m => {
    const w = wr();
    w.u16(m.version); w.u16(m.colors.length);
    for (const c of m.colors) colorWrite(w, c);
    w.u16(m.lab.length);
    for (const l of m.lab) { w.u8(l[0]); w.u8(l[1]); w.u8(l[2]); }
    if (m._tail) w.bytes(m._tail);
    return w.finish();
  });


def(1067, 'Alternate spot colors',
  b => {
    const r = rd(b);
    const version = r.u16(), count = r.u16(); const channels = [];
    for (let i = 0; i < count && r.remaining >= 14; i++) {
      const channelId = r.u32();
      channels.push(Object.assign({ channelId }, colorParse(r)));
    }
    return { version, channels, _tail: r.remaining ? b.subarray(r.o) : null };
  },
  m => {
    const w = wr();
    w.u16(m.version); w.u16(m.channels.length);
    for (const c of m.channels) { w.u32(c.channelId); colorWrite(w, c); }
    if (m._tail) w.bytes(m._tail);
    return w.finish();
  });


def(1069, 'Layer selection IDs',
  b => { const r = rd(b); const count = r.u16(); const ids = []; for (let i = 0; i < count && r.remaining >= 4; i++) ids.push(r.u32()); return { ids, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); w.u16(m.ids.length); for (const id of m.ids) w.u32(id); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(1072, 'Layer group(s) enabled ID',
  b => ({ enabled: Array.from(b) }),
  m => new Uint8Array(m.enabled));


const DESC_IDS = [
  [1065, 'Layer comps'], [1070, 'HDR toning information'], [1074, 'Measurement scale'],
  [1075, 'Timeline information'], [1076, 'Sheet disclosure'], [1078, 'Onion skins'],
  [1080, 'Count information'], [1082, 'Print information (CS5)'], [1083, 'Print style'],
  [1088, 'Path selection state'], [3000, 'Origin path info'],
];
for (const [id, nm] of DESC_IDS) H[id] = { name: nm, parse: descParse, write: descWrite };


def(2999, 'Name of clipping path',
  b => { const r = rd(b); const name = rPascal(r, 1); return { name, _tail: r.remaining ? b.subarray(r.o) : null }; },
  m => { const w = wr(); w.pascal(m.name, 1); if (m._tail) w.bytes(m._tail); return w.finish(); });


def(7000, 'Image Ready variables (XML)', b => ({ xml: utf8Decode(b), bytes: b }), m => (m.xml !== undefined ? utf8Encode(m.xml) : new Uint8Array(m.bytes)));
def(7001, 'Image Ready data sets', b => ({ text: utf8Decode(b), bytes: b }), m => (m.text !== undefined ? utf8Encode(m.text) : new Uint8Array(m.bytes)));


def(10000, 'Print flags information',
  b => { const r = rd(b); return { version: r.u16(), centerCropMarks: r.u8(), _pad: r.u8(), bleedWidthValue: r.u32(), bleedWidthScale: r.u16() }; },
  m => { const w = wr(); w.u16(m.version); w.u8(m.centerCropMarks); w.u8(m._pad); w.u32(m.bleedWidthValue); w.u16(m.bleedWidthScale); return w.finish(); });


rawOnly(1001, 'Macintosh print manager print info record', 'Mac OS 私有结构，规范未定义');
rawOnly(1002, 'Macintosh page format information', '已废弃，Photoshop 不再读取');
rawOnly(1018, 'Duotone image information', '双色调设定格式未公开');
rawOnly([1020, 1023, 1027], 'Obsolete', '规范标注为 Obsolete，无结构定义');
rawOnly(1021, 'EPS options', '规范未给出结构');
rawOnly(1028, 'IPTC-NAA record', 'IPTC IIM 数据流，另有规范');
rawOnly(1029, 'Image mode for raw format files', '规范未给出结构');
rawOnly(1058, 'EXIF data 1', 'EXIF/TIFF 数据流，另有规范');
rawOnly(1059, 'EXIF data 3', 'EXIF/TIFF 数据流，另有规范');



rawOnly(1055, 'Undocumented (规范 ID 表里 1054 之后直接跳到 1057)', '规范未收录该 ID（1054 与 1057 之间是空档）');
rawOnly(1056, 'Undocumented (规范 ID 表里 1054 之后直接跳到 1057)', '规范未收录该 ID（1054 与 1057 之间是空档）');
rawOnly(1068, 'Unknown (undocumented)', '规范未收录该 ID');
rawOnly(1071, 'Print info (CS2)', '规范未给出结构');
rawOnly(1084, 'Macintosh NSPrintInfo', '规范明确建议不要解释');
rawOnly(1085, 'Windows DEVMODE', '规范明确建议不要解释');
rawOnly([7002, 7003, 7004, 7005, 7006], 'Image Ready misc', '规范未给出结构');
rawOnly(8000, 'Lightroom workflow', '规范未给出结构');




rawOnly(1089, 'Undocumented (Photoshop CC+)', '规范未收录该 ID');
rawOnly(1090, 'Undocumented (Photoshop CC+)', '规范未收录该 ID');
rawOnly(1091, 'Undocumented (Photoshop CC+)', '规范未收录该 ID');
rawOnly(1092, 'Undocumented (疑似新版网格设定，布局同 1032 头部)', '规范未收录该 ID，仅有实测观察');
rawOnly(1093, 'Undocumented (Photoshop CC+)', '规范未收录该 ID');
rawOnly(1096, 'Undocumented (Photoshop CC+)', '规范未收录该 ID');
rawOnly(1097, 'Undocumented (实测为 4 字节 0)', '规范未收录该 ID，仅有实测观察');


export function resourceHandler(id) {
  if (id >= 2000 && id <= 2997) {
    return { name: 'Path information (saved path)', parse: b => parsePathResource(b), write: m => writePathResource(m) };
  }
  return H[id] || null;
}

export function resourceName(id) {
  if (id >= 2000 && id <= 2997) return 'Path information (saved path)';
  if (id >= 4000 && id <= 4999) return 'Plug-in resource';
  const h = H[id] || RAW_ONLY[id];
  return h ? h.name : 'Unknown';
}
export function resourceRawReason(id) { return RAW_ONLY[id] ? RAW_ONLY[id].why : null; }




const KNOWN_SIGS = new Set(['8BIM', '8B64', 'MeSa', 'PHUT', 'AgHg', 'DCSR', 'PHUT']);







export function parseImageResources(bytes, baseOff = 0) {
  const list = [];
  list._off = baseOff;
  list._trailing = null;
  const r = new Reader(bytes);

  while (r.remaining >= 12) {
    const blockStart = r.o;
    const sig = r.key4();
    if (!KNOWN_SIGS.has(sig)) {
      
      r.seek(blockStart);
      break;
    }
    const id = r.u16();
    const nameStart = r.o;
    const name = rPascal(r, 2);
    const nameRaw = bytes.subarray(nameStart, r.o);
    const len = r.u32();
    const dataStart = r.o;
    if (len > r.remaining) { r.seek(blockStart); break; }   
    const data = bytes.subarray(dataStart, dataStart + len);
    r.skip(len);
    const pad = len % 2;                                     
    let padByte = 0;
    if (pad) { if (r.remaining < 1) { r.seek(blockStart); break; } padByte = r.u8(); }

    const res = {
      sig, id,
      name,
      label: resourceName(id),
      _off: baseOff + blockStart,
      _dataOff: baseOff + dataStart,
      _len: len,
      _pad: pad,
      _padByte: padByte,
      _nameRaw: nameRaw,
      _raw: data,
      _writeMode: 'raw',
    };

    
    const h = resourceHandler(id);
    if (h && h.parse) {
      try {
        const model = h.parse(data, res);
        res.data = model;
        if (h.write) {
          let back = null;
          try { back = h.write(model, res); } catch (e) { res._writeError = String(e && e.message || e); }
          if (back && bytesEqual(back, data)) res._writeMode = 'semantic';
          else { res._semanticMismatch = true; res._semanticLen = back ? back.length : -1; }
        }
      } catch (e) {
        res._parseError = String(e && e.message || e);
      }
    } else if (RAW_ONLY[id]) {
      res._rawReason = RAW_ONLY[id].why;
    }
    list.push(res);
  }

  if (r.remaining > 0) list._trailing = bytes.subarray(r.o);
  return list;
}





export function writeImageResources(list) {
  const parts = [];
  for (const res of list) {
    const w = wr();
    w.ascii(res.sig || '8BIM');
    w.u16(res.id);
    if (res._nameRaw && res.name === undefined) w.bytes(res._nameRaw);
    else w.pascal(res.name || '', 2);

    let data = null;
    if (res._writeMode === 'semantic' && res.data !== undefined) {
      const h = resourceHandler(res.id);
      if (h && h.write) {
        try { data = h.write(res.data, res); } catch (e) { data = null; }
      }
    }
    if (!data) data = res._raw ? new Uint8Array(res._raw) : new Uint8Array(0);

    w.u32(data.length);
    w.bytes(data);
    if (data.length % 2) w.u8(res._padByte || 0);
    parts.push(w.finish());
  }
  if (list._trailing) parts.push(new Uint8Array(list._trailing));
  return concat(parts);
}


export function getResource(list, id) { return list.find(r => r.id === id) || null; }

export function getPaths(list) {
  return list.filter(r => r.id >= 2000 && r.id <= 2997)
    .map(r => ({ id: r.id, name: r.name, path: r.data || parsePathResource(r._raw, r._dataOff) }));
}








export function parseResourcesSection(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const r = new Reader(u8);
  const sig = r.key4();
  if (sig !== '8BPS') throw new Error('不是 PSD/PSB 文件（缺少 8BPS 签名）');
  const version = r.u16();
  r.skip(6);
  const header = {
    signature: sig, version,
    psb: version === 2,
    channels: r.u16(), height: r.u32(), width: r.u32(), depth: r.u16(), mode: r.u16(),
  };
  header.modeName = COLOR_MODE[header.mode];

  const cmLenOff = r.o;
  const cmLen = r.u32();
  const cmDataOff = r.o;
  const colorModeData = parseColorModeData(u8.subarray(cmDataOff, cmDataOff + cmLen), header, cmDataOff);
  r.skip(cmLen);

  const irLenOff = r.o;
  const irLen = r.u32();
  const irDataOff = r.o;
  const resources = parseImageResources(u8.subarray(irDataOff, irDataOff + irLen), irDataOff);
  r.skip(irLen);

  return {
    header,
    colorModeData,
    resources,
    _off: {
      headerStart: 0,
      colorModeLength: cmLenOff, colorModeData: cmDataOff, colorModeLen: cmLen,
      imageResourcesLength: irLenOff, imageResourcesData: irDataOff, imageResourcesLen: irLen,
      layerAndMaskStart: r.o,
    },
  };
}





export function writeResourcesSection(doc) {
  const cm = writeColorModeData(doc.colorModeData);
  const ir = writeImageResources(doc.resources);
  const w = wr();
  w.u32(cm.length); w.bytes(cm);
  w.u32(ir.length); w.bytes(ir);
  return w.finish();
}

export { W as ResourceWriter };
