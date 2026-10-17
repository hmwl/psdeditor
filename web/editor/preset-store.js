




















export const PRESET_KINDS = ['patterns', 'gradients', 'shapes', 'styles', 'swatches', 'brushes', 'toolPresets', 'actions'];
export const PRESET_KIND_LABEL = {
  patterns: '图案', gradients: '渐变', shapes: '形状', styles: '样式', swatches: '色板',
  brushes: '画笔', toolPresets: '工具预设', actions: '动作',
};

const DB_NAME = 'psd_editor-presets';
const DB_VER = 1;
const ITEMS = 'items';     
const META = 'meta';       

let dbp = null;
let memory = null;         
let metaMem = null;

function useMemory() {
  if (!memory) { memory = new Map(); metaMem = new Map(); }
  return null;
}

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    let req;
    try {
      if (typeof indexedDB === 'undefined') return resolve(useMemory());
      req = indexedDB.open(DB_NAME, DB_VER);
    } catch { return resolve(useMemory()); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) {
        const st = db.createObjectStore(ITEMS, { keyPath: ['kind', 'id'] });
        st.createIndex('kind', 'kind', { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'kind' });
    };
    req.onsuccess = () => {
      const db = req.result;
      
      db.onversionchange = () => { try { db.close(); } catch {} dbp = null; };
      resolve(db);
    };
    req.onerror = () => resolve(useMemory());
    req.onblocked = () => resolve(useMemory());
  });
  return dbp;
}

const reqP = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('事务中止')); });
}

function checkKind(kind) {
  if (!PRESET_KINDS.includes(kind)) throw new Error('未知的预设种类：' + kind);
}

export function newPresetId() {
  try { if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${h()}-${h()}${h()}${h()}`;
}


const listeners = new Set();
let bc = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel('psd_editor-presets');
    bc.onmessage = e => { if (e && e.data && e.data.kind) fire(e.data, true); };
  }
} catch { bc = null; }
function fire(ev, remote = false) {
  for (const fn of [...listeners]) { try { fn(ev); } catch (e) { console.error('[preset-store] 监听器出错', e); } }
  if (!remote && bc) { try { bc.postMessage(ev); } catch {} }
}

export function onPresetsChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}


async function allOfKind(kind) {
  const db = await openDb();
  if (!db) return [...(memory.get(kind) || new Map()).values()];
  const tx = db.transaction(ITEMS, 'readonly');
  return reqP(tx.objectStore(ITEMS).index('kind').getAll(kind));
}
async function putItems(items) {
  const db = await openDb();
  if (!db) {
    for (const it of items) {
      if (!memory.has(it.kind)) memory.set(it.kind, new Map());
      memory.get(it.kind).set(it.id, it);
    }
    return;
  }
  const tx = db.transaction(ITEMS, 'readwrite');
  const st = tx.objectStore(ITEMS);
  for (const it of items) st.put(it);
  await txDone(tx);
}
async function deleteItems(kind, ids) {
  const db = await openDb();
  if (!db) { const m = memory.get(kind); if (m) for (const id of ids) m.delete(id); return; }
  const tx = db.transaction(ITEMS, 'readwrite');
  const st = tx.objectStore(ITEMS);
  for (const id of ids) st.delete([kind, id]);
  await txDone(tx);
}
async function readMeta(kind) {
  const db = await openDb();
  let m;
  if (!db) m = metaMem.get(kind);
  else m = await reqP(db.transaction(META, 'readonly').objectStore(META).get(kind));
  return m && Array.isArray(m.groups) ? m : { kind, groups: [] };
}
async function writeMeta(meta) {
  const db = await openDb();
  if (!db) { metaMem.set(meta.kind, meta); return; }
  const tx = db.transaction(META, 'readwrite');
  tx.objectStore(META).put(meta);
  await txDone(tx);
}

function sortItems(items, groups) {
  const gi = new Map(groups.map((g, i) => [g.id, i + 1]));
  const rank = it => (it.group && gi.has(it.group)) ? gi.get(it.group) : 0;
  return items.sort((a, b) => (rank(a) - rank(b)) || ((a.order ?? 0) - (b.order ?? 0)) || String(a.name || '').localeCompare(String(b.name || '')));
}




export async function listPresets(kind) {
  checkKind(kind);
  const [items, meta] = await Promise.all([allOfKind(kind), readMeta(kind)]);
  const ok = new Set(meta.groups.map(g => g.id));
  for (const it of items) if (it.group && !ok.has(it.group)) it.group = '';
  return sortItems(items, meta.groups);
}


export async function getPreset(kind, id) {
  checkKind(kind);
  const db = await openDb();
  if (!db) return (memory.get(kind) && memory.get(kind).get(id)) || null;
  return (await reqP(db.transaction(ITEMS, 'readonly').objectStore(ITEMS).get([kind, id]))) || null;
}






export async function addPresets(kind, items, opt = {}) {
  checkKind(kind);
  if (!Array.isArray(items)) items = [items];
  items = items.filter(Boolean);
  if (!items.length) return [];
  let group = opt.group || '';
  if (!group && opt.groupName) group = (await ensureGroup(kind, opt.groupName)).id;
  const existing = await allOfKind(kind);
  const have = new Set(existing.map(i => i.id));
  let order = existing.reduce((m, i) => Math.max(m, i.order ?? 0), 0);
  const out = items.map(it => {
    let id = it.id != null && it.id !== '' ? String(it.id) : newPresetId();
    if (opt.replace === false && have.has(id)) id = newPresetId();
    const prev = existing.find(e => e.id === id);
    return {
      ...it, kind, id,
      name: it.name != null ? String(it.name) : (PRESET_KIND_LABEL[kind] + ' ' + (++order)),
      group: it.group != null && !opt.group && !opt.groupName ? it.group : group,
      order: prev ? prev.order : ++order,
      created: it.created || Date.now(),
    };
  });
  await putItems(out);
  fire({ kind, type: 'add', ids: out.map(i => i.id) });
  return out;
}


export async function removePreset(kind, id) {
  checkKind(kind);
  const ids = Array.isArray(id) ? id : [id];
  await deleteItems(kind, ids);
  fire({ kind, type: 'remove', ids });
  return true;
}


export async function updatePreset(kind, id, patch) {
  checkKind(kind);
  const cur = await getPreset(kind, id);
  if (!cur) return null;
  const next = { ...cur, ...patch, kind, id };
  await putItems([next]);
  fire({ kind, type: 'update', ids: [id] });
  return next;
}
export const renamePreset = (kind, id, name) => updatePreset(kind, id, { name: String(name) });


export async function reorderPresets(kind, ids, moves = null) {
  checkKind(kind);
  const items = await allOfKind(kind);
  const pos = new Map(ids.map((id, i) => [id, i]));
  items.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9 + (a.order ?? 0)) - (pos.has(b.id) ? pos.get(b.id) : 1e9 + (b.order ?? 0)));
  items.forEach((it, i) => { it.order = i + 1; if (moves && Object.prototype.hasOwnProperty.call(moves, it.id)) it.group = moves[it.id] || ''; });
  await putItems(items);
  fire({ kind, type: 'reorder', ids });
}


export async function clearPresets(kind) {
  checkKind(kind);
  const items = await allOfKind(kind);
  await deleteItems(kind, items.map(i => i.id));
  await writeMeta({ ...(await readMeta(kind)), kind, groups: [] });
  fire({ kind, type: 'clear' });
}


export async function presetPackInstalled(kind, packId, sha256, layoutVersion = 0) {
  checkKind(kind);
  const meta = await readMeta(kind);
  return meta.presetPacks?.[packId] === sha256 && (!layoutVersion || meta.presetPackLayouts?.[packId] === layoutVersion);
}
export async function installPresetPack(pack, batches, { restore = false, layoutVersion = 0 } = {}) {
  checkKind(pack.kind);
  for (const batch of batches) checkKind(batch.kind);
  const db = await openDb();
  const kinds = [...new Set([pack.kind, ...batches.map(b => b.kind)])];
  const commit = (metas, rows) => {
    const mainMeta = metas.get(pack.kind), installed = mainMeta.presetPacks?.[pack.id] === pack.sha256;
    if (!restore && installed && (!layoutVersion || mainMeta.presetPackLayouts?.[pack.id] === layoutVersion)) return null;
    const changes = [], updates = [];
    for (const batch of batches) {
      const meta = metas.get(batch.kind), existing = rows.get(batch.kind);
      const groupKey = batch.groupKey || batch.groupName;
      const eligible = row => {
        const old = meta.groups.find(g => g.id === row.group);
        return old?.builtinPack === pack.id && !old.builtinGroup.startsWith('default:') && (old.name === old.builtinGroup || old.name === old.builtinGroup.replace(/^PS · /, ''));
      };
      
      if (installed && !restore && layoutVersion && !batch.items.some(item => existing.some(row => row.id === item.id && eligible(row)))) continue;
      let g = meta.groups.find(x => x.builtinPack === pack.id && (x.builtinGroup === groupKey || (!batch.groupKey && x.builtinGroup === 'PS · ' + groupKey)));

      if (!g) {
        g = { id: 'ps-g-' + pack.id + '-' + newPresetId(), name: batch.groupName, collapsed: batch.collapsed ?? (batch.items.length > 100 || pack.byteLength > 4 * 1048576), builtinPack: pack.id, builtinGroup: groupKey };
        meta.groups.push(g);
      }
      const have = new Set(existing.map(x => x.id));
      let order = existing.reduce((max, x) => Math.max(max, x.order || 0), 0);
      const added = [];
      for (const item of batch.items) {
        if (have.has(item.id)) {
          const row = existing.find(row => row.id === item.id);
          if (layoutVersion && eligible(row)) { const updated = { ...row, group: g.id }; existing[existing.indexOf(row)] = updated; updates.push(updated); }
          continue;
        }
        if (installed && !restore && layoutVersion) continue;

        const row = { ...item, kind: batch.kind, group: g.id, order: ++order, created: Date.now(), sourcePack: pack.id };
        have.add(row.id); existing.push(row); updates.push(row); added.push(row.id);
      }
      if (added.length) changes.push({ kind: batch.kind, type: 'add', ids: added });
      else if (layoutVersion) changes.push({ kind: batch.kind, type: 'groups' });
    }
    if (layoutVersion) for (const [kind, meta] of metas) {
      meta.groups = meta.groups.filter(g => !(g.builtinPack === pack.id && !g.builtinGroup.startsWith('default:') && (g.name === g.builtinGroup || g.name === g.builtinGroup.replace(/^PS · /, '')) && !rows.get(kind).some(row => row.group === g.id)));
    }
    const main = metas.get(pack.kind);
    if (layoutVersion) main.presetPackLayouts = { ...main.presetPackLayouts, [pack.id]: layoutVersion };

    main.presetPacks = { ...main.presetPacks, [pack.id]: pack.sha256 };
    return { changes, updates };
  };
  let result;
  if (!db) {
    const metas = new Map(kinds.map(k => [k, structuredClone(metaMem.get(k) || { kind: k, groups: [] })]));
    const rows = new Map(kinds.map(k => [k, [...(memory.get(k) || new Map()).values()]]));
    result = commit(metas, rows);
    if (result) {
      for (const [k, meta] of metas) metaMem.set(k, meta);
      for (const row of result.updates) { if (!memory.has(row.kind)) memory.set(row.kind, new Map()); memory.get(row.kind).set(row.id, row); }
    }
  } else {
    const tx = db.transaction([ITEMS, META], 'readwrite'), done = txDone(tx);
    const st = tx.objectStore(ITEMS), mt = tx.objectStore(META);
    const metas = new Map(), rows = new Map();
    await Promise.all(kinds.map(async k => {
      const [meta, items] = await Promise.all([reqP(mt.get(k)), reqP(st.index('kind').getAll(k))]);
      metas.set(k, meta || { kind: k, groups: [] }); rows.set(k, items);
    }));
    result = commit(metas, rows);
    if (result) { for (const row of result.updates) st.put(row); for (const meta of metas.values()) mt.put(meta); }
    await done;
  }
  for (const ev of result?.changes || []) fire(ev);
  return { added: result?.updates.length || 0, alreadyInstalled: !result };
}


export async function listGroups(kind) { checkKind(kind); return (await readMeta(kind)).groups.slice(); }
export async function addGroup(kind, name) {
  checkKind(kind);
  const meta = await readMeta(kind);
  const g = { id: 'g-' + newPresetId(), name: String(name || '组 ' + (meta.groups.length + 1)), collapsed: false };
  meta.groups.push(g);
  await writeMeta(meta);
  fire({ kind, type: 'groups' });
  return g;
}
async function ensureGroup(kind, name) {
  const meta = await readMeta(kind);
  return meta.groups.find(g => g.name === name) || addGroup(kind, name);
}
export async function updateGroup(kind, gid, patch) {
  checkKind(kind);
  const meta = await readMeta(kind);
  const g = meta.groups.find(x => x.id === gid); if (!g) return null;
  Object.assign(g, patch, { id: gid });
  await writeMeta(meta);
  fire({ kind, type: 'groups' });
  return g;
}

export async function removeGroup(kind, gid, withItems = false) {
  checkKind(kind);
  const meta = await readMeta(kind);
  meta.groups = meta.groups.filter(g => g.id !== gid);
  await writeMeta(meta);
  const items = (await allOfKind(kind)).filter(i => i.group === gid);
  if (withItems) await deleteItems(kind, items.map(i => i.id));
  else { for (const it of items) it.group = ''; await putItems(items); }
  fire({ kind, type: 'groups' });
}
export async function reorderGroups(kind, gids) {
  checkKind(kind);
  const meta = await readMeta(kind);
  const pos = new Map(gids.map((g, i) => [g, i]));
  meta.groups.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  await writeMeta(meta);
  fire({ kind, type: 'groups' });
}


export async function isPersistent() { return !!(await openDb()); }
