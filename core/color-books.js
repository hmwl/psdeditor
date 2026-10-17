
export function readAcb(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const need = n => { if (offset + n > bytes.length) throw new Error('ACB 数据不完整'); };
  const u16 = () => { need(2); const n = view.getUint16(offset); offset += 2; return n; };
  const u32 = () => { need(4); const n = view.getUint32(offset); offset += 4; return n; };
  const text = () => { const n = u32(); need(n * 2); const s = new TextDecoder('utf-16be').decode(bytes.subarray(offset, offset + n * 2)); offset += n * 2; return s; };
  const localized = s => s.startsWith('$$$/') ? s.slice(s.indexOf('=') + 1) : s;
  if (u32() !== 0x38424342 || u16() !== 1) throw new Error('不支持的 ACB 颜色库');
  const id = u16(), title = localized(text()), prefix = localized(text()), suffix = localized(text()), description = localized(text());
  const count = u16(), pageSize = u16(), pageOffset = u16(), space = u16();
  if (![0, 2, 7].includes(space) || !pageSize) throw new Error('不支持的 ACB 色彩空间或分页');
  const model = space === 7 ? 'lab' : space === 2 ? 'cmyk' : 'rgb', channels = space === 2 ? 4 : 3;
  const colors = [];
  for (let index = 0; index < count; index++) {
    const name = text(); need(6 + channels);
    const code = new TextDecoder('ascii').decode(bytes.subarray(offset, offset + 6)); offset += 6;
    const raw = [...bytes.subarray(offset, offset + channels)]; offset += channels;
    const values = space === 7 ? [raw[0] * 100 / 255, raw[1] - 128, raw[2] - 128] : space === 2 ? raw.map(v => (255 - v) * 100 / 255) : raw.slice();
    colors.push({ index, name: name ? prefix + name + suffix : '', shortName: name, code, model, values, raw });
  }
  const flags = new TextDecoder('ascii').decode(bytes.subarray(offset));
  if (flags && flags !== 'spflspot' && flags !== 'spflproc') throw new Error('ACB 存在未解析的尾部数据');
  return { id, title, prefix, suffix, description, count, pageSize, pageOffset, model, spot: flags === 'spflspot', colors };
}
