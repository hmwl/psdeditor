









const WS = c => c === 32 || c === 10 || c === 13 || c === 9;
const NUM = c => (c >= 48 && c <= 57) || c === 46 || c === 45;













export class EngineRawText extends String {}






















const FLOAT_HINT = '__engineFloats';
function markFloat(container, key) {
  let arr = container[FLOAT_HINT];
  if (!arr) arr = container[FLOAT_HINT] = [];
  const k = String(key);
  if (!arr.includes(k)) arr.push(k);
}
function isFloatHinted(container, key) {
  const arr = container && container[FLOAT_HINT];
  return Array.isArray(arr) ? arr.includes(String(key)) : false;
}



const RAW_HINT = '__engineRaw';
function markRaw(container, key) {
  let arr = container[RAW_HINT];
  if (!arr) arr = container[RAW_HINT] = [];
  const k = String(key);
  if (!arr.includes(k)) arr.push(k);
}
function isRawHinted(container, key) {
  const arr = container && container[RAW_HINT];
  return Array.isArray(arr) ? arr.includes(String(key)) : false;
}



const PARSED_HINT = '__engineParsed';
function markParsed(container) {
  container[PARSED_HINT] = true;
  return container;
}





const KEY_HINT = '__engineKeys';
function markKey(container, key) {
  let arr = container[KEY_HINT];
  if (!arr) arr = container[KEY_HINT] = [];
  if (!arr.includes(key)) arr.push(key);
}


export const ENGINE_META_KEYS = Object.freeze([FLOAT_HINT, RAW_HINT, PARSED_HINT, KEY_HINT]);
const META = new Set(ENGINE_META_KEYS);


export function detectEngineDataFormat(data) {
  for (let i = 0; i < data.length && i < 64; i++) {
    if (data[i] === 10 || data[i] === 9) return 'pretty';
    if (data[i] === 47) return 'compact';          
  }
  return 'pretty';
}





export function parseEngineData(data) {
  let i = 0;
  let end = data.length;
  while (end > 0 && data[end - 1] === 0) end--;
  const stack = [];
  let root = null;

  const pushValue = (v, isFloat, isRaw) => {
    if (!stack.length) throw new Error('EngineData：顶层不能是裸值');
    const top = stack[stack.length - 1];
    if (typeof top === 'string') {
      const owner = stack[stack.length - 2];
      owner[top] = v;
      markKey(owner, top);
      if (isFloat) markFloat(owner, top);
      if (isRaw) markRaw(owner, top);
      stack.pop();
    }
    else if (Array.isArray(top)) {
      if (isFloat) markFloat(top, top.length);
      if (isRaw) markRaw(top, top.length);
      top.push(v);
    }
    else throw new Error('EngineData：字典里缺少键');
  };
  const pushContainer = c => { markParsed(c); if (!stack.length) { root = c; stack.push(c); } else { pushValue(c); stack.push(c); } };
  const pop = () => { if (!stack.length) throw new Error('EngineData：多余的结束符'); stack.pop(); };

  
  let lastTextRaw = false;
  const readText = () => {
    lastTextRaw = false;
    
    if (data[i] === 41) { i++; lastTextRaw = true; return new EngineRawText(''); }
    const byte = () => { let b = data[i++]; if (b === 92) b = data[i++]; return b; };
    
    if (data[i] !== 0xfe || data[i + 1] !== 0xff) {
      let s = '';
      while (i < end && data[i] !== 41) s += String.fromCharCode(byte());
      i++;
      lastTextRaw = true;
      return new EngineRawText(s);
    }
    i += 2;
    let s = '';
    while (i < end && data[i] !== 41) { const hi = byte(), lo = byte(); s += String.fromCharCode((hi << 8) | lo); }
    i++;
    return s;
  };

  while (i < end && WS(data[i])) i++;
  while (i < end) {
    const c = data[i];
    if (c === 60 && data[i + 1] === 60) { i += 2; pushContainer({}); }
    else if (c === 62 && data[i + 1] === 62) { i += 2; pop(); }
    else if (c === 91) { i++; pushContainer([]); }
    else if (c === 93) { i++; pop(); }
    else if (c === 47) {                       
      i++; const s = i; while (i < end && !WS(data[i]) && data[i] !== 91 && data[i] !== 93 && data[i] !== 60 && data[i] !== 62 && data[i] !== 40) i++;
      let name = ''; for (let k = s; k < i; k++) name += String.fromCharCode(data[k]);
      if (!stack.length) pushContainer({});
      const top = stack[stack.length - 1];
      if (typeof top === 'string') pushValue(name === 'nil' ? null : '/' + name);
      else if (top && typeof top === 'object' && !Array.isArray(top)) stack.push(name);
      else pushValue('/' + name);
    }
    else if (c === 40) { i++; const t = readText(); pushValue(t, false, lastTextRaw); }
    else if (c === 110 && data[i + 1] === 117 && data[i + 2] === 108 && data[i + 3] === 108) { i += 4; pushValue(null); }
    else if (c === 116 && data[i + 1] === 114 && data[i + 2] === 117 && data[i + 3] === 101) { i += 4; pushValue(true); }
    else if (c === 102 && data[i + 1] === 97 && data[i + 2] === 108 && data[i + 3] === 115 && data[i + 4] === 101) { i += 5; pushValue(false); }
    else if (NUM(c)) {
      let s = ''; while (i < end && NUM(data[i])) s += String.fromCharCode(data[i++]);
      pushValue(parseFloat(s), s.indexOf('.') >= 0);      
    }
    else i++;                                   
    while (i < end && WS(data[i])) i++;
  }
  return root;
}


const FLOAT_KEYS = new Set(['Axis', 'XY', 'Zone', 'WordSpacing', 'FirstLineIndent', 'GlyphSpacing', 'StartIndent', 'EndIndent',
  'SpaceBefore', 'SpaceAfter', 'LetterSpacing', 'Values', 'GridSize', 'GridLeading', 'PointBase', 'BoxBounds', 'TransformPoint0',
  'TransformPoint1', 'TransformPoint2', 'FontSize', 'Leading', 'HorizontalScale', 'VerticalScale', 'BaselineShift', 'Tsume',
  'OutlineWidth', 'AutoLeading']);
const INT_ARRAYS = new Set(['RunLengthArray']);



const fmtFloat = v => {
  const s = v.toFixed(5).replace(/(\d)0+$/, '$1');
  if (v > 0 && s.startsWith('0.')) return s.slice(1);
  if (v < 0 && s.startsWith('-0.')) return '-' + s.slice(2);
  return s;
};
const fmtNum = (v, key, owner, slot = key) => {
  
  
  if (owner && owner[PARSED_HINT]) return (isFloatHinted(owner, slot) || (!Array.isArray(owner) && key && FLOAT_KEYS.has(key)) || (v | 0) !== v) ? fmtFloat(v) : String(v);
  return ((key && FLOAT_KEYS.has(key)) || (v | 0) !== v) ? fmtFloat(v) : String(v);
};









export function serializeEngineData(obj, opts = {}) {
  const compact = opts.format === 'compact';
  const out = [];
  const str = s => { for (let k = 0; k < s.length; k++) out.push(s.charCodeAt(k) & 0xff); };
  let indent = 0;
  const tabs = () => { if (!compact) for (let k = 0; k < indent; k++) out.push(9); };
  const strByte = b => { if (b === 40 || b === 41 || b === 92) out.push(92); out.push(b); };
  const keysOf = o => {
    
    
    const own = Object.keys(o).filter(k => !META.has(k));
    const order = o[KEY_HINT];
    if (Array.isArray(order)) {
      
      const ks = order.filter(k => !META.has(k) && Object.prototype.hasOwnProperty.call(o, k));
      for (const k of own) if (!ks.includes(k)) ks.push(k);
      return ks;
    }
    for (const special of ['98', '99']) { const p = own.indexOf(special); if (p >= 0) { own.splice(p, 1); own.unshift(special); } }
    return own;
  };

  
  
  function value(v, key, inProp, owner, slot = key) {
    const prefix = () => inProp ? out.push(32) : tabs();
    if (v === null || v === undefined) { prefix(); str(compact ? '/nil' : 'null'); }
    else if (typeof v === 'number') { prefix(); str(fmtNum(v, key, owner, slot)); }
    else if (typeof v === 'boolean') { prefix(); str(v ? 'true' : 'false'); }
    else if (typeof v === 'string' || v instanceof String) {
      prefix();
      const s = String(v);
      if ((key === '98' || key === '99') && s[0] === '/') { str(s); return; }   
      
      
      if (isRawHinted(owner, slot) || v instanceof EngineRawText) {
        out.push(40);
        for (let k = 0; k < s.length; k++) strByte(s.charCodeAt(k) & 0xff);
        out.push(41);
        return;
      }
      out.push(40, 0xfe, 0xff);
      for (let k = 0; k < s.length; k++) { const c = s.charCodeAt(k); strByte((c >> 8) & 0xff); strByte(c & 0xff); }
      out.push(41);
    }
    else if (Array.isArray(v)) {
      prefix();
      if (v.length && v.every(x => typeof x === 'number')) {
        str('[');
        const asInt = INT_ARRAYS.has(key);
        const parsed = v[PARSED_HINT];
        for (let idx = 0; idx < v.length; idx++) {
          const x = v[idx];
          out.push(32);
          
          if (parsed) str(isFloatHinted(v, idx) ? fmtFloat(x) : String(x));
          else str(asInt ? String(x) : fmtFloat(x));
        }
        str(' ]');
      } else if (!v.length) { str('[ ]'); }
      else if (compact) {
        str('[');
        for (let idx = 0; idx < v.length; idx++) value(v[idx], key, true, v, idx);
        str(' ]');
      }
      else {
        str('[\n');
        for (let idx = 0; idx < v.length; idx++) { value(v[idx], key, false, v, idx); out.push(10); }
        tabs(); str(']');
      }
    }
    else if (typeof v === 'object') {
      if (compact) {
        prefix();
        str('<<');
        for (const k of keysOf(v)) { out.push(32); str('/' + k); value(v[k], k, true, v); }
        str(' >>');
        return;
      }
      if (inProp) out.push(10);
      tabs(); str('<<\n'); indent++;
      for (const k of keysOf(v)) { tabs(); str('/' + k); value(v[k], k, true, v); out.push(10); }
      indent--; tabs(); str('>>');
    }
  }

  if (compact) {
    
    for (const k of keysOf(obj)) { out.push(32); str('/' + k); value(obj[k], k, true, obj); }
    return Uint8Array.from(out);
  }
  str('\n\n'); value(obj, undefined, false, null);
  return Uint8Array.from(out);
}

export default { parseEngineData, serializeEngineData, detectEngineDataFormat, EngineRawText, ENGINE_META_KEYS };
