


















import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';
import { readPatternBlock, writePatternBlock } from './pat.js';

const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);

export const effectsToBytes = desc => serializeDescriptor(desc);
export const effectsFromBytes = bytes => readDescriptor(new Reader(toU8(bytes)));


export function effectPatternIds(desc) {
  const ids = new Set();
  const walk = v => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v.__classID === 'Ptrn' && typeof v.Idnt === 'string') ids.add(v.Idnt);
    for (const k of Object.keys(v)) if (!k.startsWith('__')) walk(v[k]);
  };
  walk(desc);
  return [...ids];
}


export function readAsl(bytes) {
  const u8 = toU8(bytes);
  const r = new Reader(u8);
  const warnings = [];
  const ver = r.u16();
  if (r.key4() !== '8BSL') throw new Error('不是 Photoshop 样式文件（缺 8BSL 签名）');
  if (ver !== 2) warnings.push('样式文件版本 ' + ver + '（预期 2），按版本 2 尝试读取');
  r.u16();                                         
  const psize = r.u32();
  if (psize > r.remaining) throw new Error('图案段长度越界');
  const patterns = psize ? readPatternBlock(r.bytes(psize)) : [];
  if (patterns.warnings) warnings.push(...patterns.warnings);
  const count = r.remaining >= 4 ? r.u32() : 0;
  const styles = [];
  for (let i = 0; i < count && r.remaining >= 4; i++) {
    const size = r.u32(), start = r.o, end = start + size;
    if (end > u8.length) { warnings.push(`第 ${i + 1} 个样式越界`); break; }
    try {
      const sub = new Reader(u8.subarray(start, end));
      let meta = null, styl = null;
      while (sub.remaining >= 8 && !(meta && styl)) {
        const dv = sub.u32();
        if (dv !== 16) throw new Error('描述符版本不是 16：' + dv);
        const d = readDescriptor(sub);
        if (d.__classID === 'Styl') styl = d; else meta = d;
      }
      if (!styl) throw new Error('缺少样式描述符（Styl）');
      
      
      const effects = { ...(styl.Lefx || {}), __classID: 'null', __name: '' };
      styles.push({
        id: meta && typeof meta.Idnt === 'string' ? meta.Idnt : undefined,
        name: meta && typeof meta['Nm  '] === 'string' ? meta['Nm  '] : `样式 ${i + 1}`,
        effects, documentMode: styl.documentMode || null,
      });
    } catch (e) { warnings.push(`第 ${i + 1} 个样式：${e.message}`); }
    r.o = end;
    
    while (r.o % 4 && r.o < u8.length && u8[r.o] === 0) r.o++;
  }
  return { styles, patterns, warnings };
}






export function writeAsl(styles, patterns = []) {
  const pat = patterns.length ? writePatternBlock(patterns) : new Uint8Array(0);
  const bodies = styles.map((s, i) => {
    const eff = s.effects || effectsFromBytes(s.effectsBytes);
    const meta = serializeDescriptor({ __name: '', __classID: 'null', 'Nm  ': String(s.name || `样式 ${i + 1}`), Idnt: String(s.id || '') });
    const lefx = { ...eff, __classID: 'Lefx', __name: '' };
    const styl = serializeDescriptor({ __name: '', __classID: 'Styl',
      documentMode: s.documentMode || { __name: '', __classID: 'documentMode' }, Lefx: lefx });
    const n = 4 + meta.length + 4 + styl.length, padded = n + ((4 - (n % 4)) % 4);
    const b = new Uint8Array(padded), dv = new DataView(b.buffer);
    dv.setUint32(0, 16); b.set(meta, 4); dv.setUint32(4 + meta.length, 16); b.set(styl, 8 + meta.length);
    return b;
  });
  const total = 2 + 4 + 2 + 4 + pat.length + 4 + bodies.reduce((a, b) => a + 4 + b.length, 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint16(o, 2); o += 2;
  out.set([0x38, 0x42, 0x53, 0x4c], o); o += 4;         
  dv.setUint16(o, 3); o += 2;
  dv.setUint32(o, pat.length); o += 4; out.set(pat, o); o += pat.length;
  dv.setUint32(o, bodies.length); o += 4;
  for (const b of bodies) { dv.setUint32(o, b.length); o += 4; out.set(b, o); o += b.length; }
  return out;
}

export default { readAsl, writeAsl, effectsToBytes, effectsFromBytes, effectPatternIds };
