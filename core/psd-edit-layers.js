









import { readLinkGroups, writeLinkGroups, layerIdsOf, nextLinkGroupId } from './psd-links.js';

export function createLayerLinkOps(h) {
  function ensureIds(ab) {
    let ids = layerIdsOf(ab);
    let max = 0; for (const id of ids) if (id != null && id > max) max = id;
    const used = new Set(ids.filter(x => x != null));
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] != null) continue;
      let id = max + 1; while (used.has(id)) id++;
      used.add(id); max = id;
      const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, id);
      ab = h.upsertLayerBlock(ab, i, 'lyid', b);
    }
    return ab;
  }
  const ensureLayerIds = {
    validate: () => ({ affected: [], note: '补齐图层 id（lyid）' }),
    apply: (ab) => {
      const before = layerIdsOf(ab).filter(x => x == null).length;
      if (!before) return { buffer: ab, result: { changed: false } };
      return { buffer: ensureIds(h.copyAB(ab)), result: { changed: true, note: `补了 ${before} 个图层 id` } };
    },
    structural: true,
  };
  const setLinkGroups = {
    validate(state, op, i) {
      if (!Array.isArray(op.indices) || !op.indices.length) throw h.opFail(i, op, 'indices 必须是非空数组');
      for (const k of op.indices) h.needLayer(state, i, op, k);
      if (op.link === true && op.indices.length < 2 && op.disable === undefined) throw h.opFail(i, op, '链接至少要两个图层');
      return { affected: op.indices.slice(), note: op.disable !== undefined ? '停用 / 启用链接' : op.link ? '链接图层' : '取消链接图层' };
    },
    apply(ab, state, op) {
      let out = ensureIds(h.copyAB(ab));
      const ids = layerIdsOf(out);
      const cur = readLinkGroups(out).byId;
      const tgt = op.indices.map(k => ids[k]).filter(x => x != null);
      if (op.disable !== undefined) {
        for (const id of tgt) { const v = cur.get(id); if (v) cur.set(id, { ...v, off: !!op.disable }); }
      } else if (op.link) {
        
        const had = tgt.map(id => cur.get(id)).filter(Boolean).map(v => v.gid);
        const gid = had.length ? Math.min(...had) : nextLinkGroupId(cur);
        const merge = new Set(had);
        for (const [id, v] of cur) if (merge.has(v.gid)) cur.set(id, { gid, off: v.off });
        for (const id of tgt) cur.set(id, { gid, off: false });
      } else {
        for (const id of tgt) cur.delete(id);
      }
      out = writeLinkGroups(out, cur);
      return { buffer: out, result: { changed: true } };
    },
    structural: true,
  };
  return { ensureLayerIds, setLinkGroups };
}
export default { createLayerLinkOps };
