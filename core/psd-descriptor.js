















class Writer {
  constructor() { this.parts = []; this.len = 0; }
  push(u8) { this.parts.push(u8); this.len += u8.length; }
  u8(v) { this.push(new Uint8Array([v & 255])); }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); this.push(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); this.push(b); }
  i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); this.push(b); }
  u64(v) { const b = new Uint8Array(8); const d = new DataView(b.buffer);
           d.setUint32(0, Math.floor(v / 0x100000000)); d.setUint32(4, v >>> 0); this.push(b); }
  f64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); this.push(b); }
  ascii(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; this.push(b); }
  bytes(u8) { this.push(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8)); }
  
  unicode(s) {
    s = s || '';
    this.u32(s.length + 1);
    const b = new Uint8Array((s.length + 1) * 2), d = new DataView(b.buffer);
    for (let i = 0; i < s.length; i++) d.setUint16(i * 2, s.charCodeAt(i));
    d.setUint16(s.length * 2, 0);
    this.push(b);
  }
  finish() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}



function writeKey(w, k, host, slot) {
  const explicit = host && host.__explicit && host.__explicit[slot || k];
  if (k.length === 4 && !explicit) { w.u32(0); w.ascii(k); }
  else { w.u32(k.length); w.ascii(k); }
}

const META = new Set(['__name', '__classID', '__objectArray', '__itemsCount', '__unit',
                      '__enumType', '__class', '__reference', '__error', '__explicit', '__long', '__doub', '__comp', '__rawItem']);
const dataKeys = obj => Object.keys(obj).filter(k => !META.has(k));

export function writeDescriptor(desc, w = new Writer()) {
  w.unicode(desc.__name || '');
  writeKey(w, desc.__classID || 'null', desc, '__classID');
  const keys = dataKeys(desc);
  w.u32(keys.length);
  for (const k of keys) { writeKey(w, k, desc); writeItem(w, desc[k], k, desc); }
  return w;
}


function writeItem(w, v, key, host) {
  
  if (Array.isArray(v)) {
    w.ascii('VlLs'); w.u32(v.length);
    for (let i = 0; i < v.length; i++) writeItem(w, v[i], i, v);
    return;
  }
  if (v instanceof Uint8Array) { w.ascii('tdta'); w.u32(v.length); w.bytes(v); return; }
  if (typeof v === 'boolean') { w.ascii('bool'); w.u8(v ? 1 : 0); return; }
  if (typeof v === 'string') { w.ascii('TEXT'); w.unicode(v); return; }
  if (typeof v === 'number') {
    
    
    
    if (host && host.__comp && host.__comp[key]) { w.ascii('comp'); w.u64(v); return; }
    const isLong = (host && host.__long && host.__long[key]) ? true
                 : (host && host.__doub && host.__doub[key]) ? false
                 : LONG_KEYS.has(key);
    if (isLong) { w.ascii('long'); w.i32(v); return; }
    w.ascii('doub'); w.f64(v); return;
  }
  if (v && typeof v === 'object') {
    if (v.__objectArray) {
      w.ascii('ObAr'); w.u32(v.__itemsCount || 0);
      w.unicode(v.__name || '');
      writeKey(w, v.__classID || 'null', v, '__classID');
      const keys = dataKeys(v);
      w.u32(keys.length);
      for (const k of keys) { writeKey(w, k, v); writeItem(w, v[k], k, v); }
      return;
    }
    if (v.__unit && Array.isArray(v.values)) {   
      w.ascii('UnFl'); w.ascii(v.__unit); w.u32(v.values.length);
      for (const n of v.values) w.f64(n);
      return;
    }
    if (v.__unit) { w.ascii('UntF'); w.ascii(v.__unit); w.f64(v.value); return; }
    if (v.__enumType) { w.ascii('enum'); writeKey(w, v.__enumType, v, '__enumType'); writeKey(w, v.value, v, '__value'); return; }
    if (v.__class !== undefined) { w.ascii('type'); w.unicode(v.__name || ''); writeKey(w, v.__class); return; }
    if (v.__reference) { writeReference(w, v.__reference); return; }
    
    if (v.__rawItem) { w.ascii(v.__rawItem); w.u32(v.bytes.length); w.bytes(v.bytes); return; }
    if (v.__classID !== undefined) { w.ascii('Objc'); writeDescriptor(v, w); return; }
  }
  throw new Error('描述符写入：无法识别的值 ' + JSON.stringify(v).slice(0, 80) + (key ? ` (key=${key})` : ''));
}

function writeReference(w, refs) {
  w.ascii('obj '); w.u32(refs.length);
  for (const r of refs) {
    w.ascii(r.type);
    const cls = () => { w.unicode(r.cls ? r.cls.name : ''); writeKey(w, r.cls ? r.cls.cid : 'null'); };
    switch (r.type) {
      case 'prop': cls(); writeKey(w, r.key); break;
      case 'Clss': cls(); break;
      case 'Enmr': cls(); writeKey(w, r.enumType); writeKey(w, r.value); break;
      case 'rele': cls(); w.u32(r.offset); break;
      case 'Idnt': if (r.cls) cls(); w.u32(r.id); break;
      case 'indx': if (r.cls) cls(); w.u32(r.index); break;
      case 'name': cls(); w.unicode(r.name); break;
      default: throw new Error('描述符写入：不支持的 reference 类型 ' + r.type);
    }
  }
}



const LONG_KEYS = new Set([
  'PgNm', 'totalPages', 'Crop', 'numerator', 'denominator', 'frameCount', 'Annt', 'Type',
  'uOrder', 'vOrder', 'deformNumRows', 'deformNumCols', 'comp', 'compID', 'originalCompID',
  'curvesPresetKind', 'mixerPresetKind', 'keyOriginType', 'unitValueQuadVersion',
  'keyOriginIndex', 'major', 'minor', 'fix', 'numModifyingFX', 'FrID', 'FrDl', 'FsID',
  'LCnt', 'AFrm', 'AFSt', 'numBefore', 'numAfter', 'Spcn', 'minOpacity', 'maxOpacity',
  'BlnM', 'sheetID', 'gblA', 'globalAltitude', 'descVersion', 'frameReaderType', 'LyrI',
  'zoomOrigin', 'sliceID', 'topOutset', 'leftOutset', 'bottomOutset', 'rightOutset',
  'filterID', 'meshQuality', 'PnRt', 'PnOv', 'PnDp', 'ShrP', 'channelDenoise'
]);

export function serializeDescriptor(desc) { return writeDescriptor(desc).finish(); }
export { Writer };
