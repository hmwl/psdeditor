







const DB = 'psd_editor-recent', STORE = 'files', MAX_BYTES = 200 * 1024 * 1024;
let list = [];                      
let limit = () => 20;
let pending = Promise.resolve();
const serial = fn => { const next = pending.then(fn); pending = next.catch(() => {}); return next; };
function legacyItems() {
  try { const value = JSON.parse(localStorage.getItem('psd_editor.recentFiles') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) { db.createObjectStore(STORE, { keyPath: 'id' }); return; }
      const old = r.transaction.objectStore(STORE);
      if (old.keyPath === 'id') return;
      
      const records = new Map(legacyItems().map(x => [x.id, { ...x, file: null }]));
      const cursor = old.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          const value = c.value, id = c.primaryKey;
          const rec = value instanceof Blob
            ? { ...records.get(id), id, name: value.name || records.get(id)?.name, size: value.size, time: records.get(id)?.time || value.lastModified || 0, file: value }
            : { ...value, id };
          if (rec.name) records.set(id, rec);
          c.continue(); return;
        }
        db.deleteObjectStore(STORE);
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        for (const rec of records.values()) store.put(rec);
      };
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  try {
    return await new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      let out;
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error || new Error('Recent files transaction aborted'));
      try { Promise.resolve(fn(t.objectStore(STORE))).then(v => { out = v; }, rej); }
      catch (e) { t.abort(); rej(e); }
    });
  } finally { db.close(); }
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export function load() {
  return serial(async () => {
    try {
      const all = await tx('readonly', st => reqP(st.getAll()));
      list = (all || []).filter(x => x.id && x.name).map(({ id, name, size, time, file }) => ({ id, name, size, time, stored: !!file })).sort((a, b) => b.time - a.time);
      await trim();
    } catch (e) { console.warn('[recent] 无法读取最近文件', e); }
    return items();
  });
}
export function items() { return list.slice(0, Math.max(0, limit())); }
export function setLimit(fn) { limit = fn; return serial(trim); }
async function trim() {
  const n = Math.max(0, limit());
  if (list.length <= n) return;
  const drop = list.slice(n); list = list.slice(0, n);
  try { await tx('readwrite', st => { for (const d of drop) st.delete(d.id); }); } catch (e) { console.warn('[recent] 无法裁剪最近文件', e); }
}
export function add(file) {
  return serial(async () => {
    if (!file || !file.name || limit() <= 0) return;
    const old = list.find(x => x.name === file.name && x.size === file.size);
    const id = old ? old.id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    const rec = { id, name: file.name, size: file.size, time: Date.now(), file: file.size <= MAX_BYTES ? file : null };
    try { await tx('readwrite', st => st.put(rec)); }
    catch (e) {
      console.warn('[recent] 无法保存文件副本，仅记录名称', e);
      rec.file = null;
      try { await tx('readwrite', st => st.put(rec)); } catch (error) { console.warn('[recent] 无法保存最近文件', error); }
    }
    list = [{ id, name: rec.name, size: rec.size, time: rec.time, stored: !!rec.file }, ...list.filter(x => x.id !== id)];
    await trim();
  });
}
export function get(id) {
  return serial(async () => {
    try { const r = await tx('readonly', st => reqP(st.get(id))); return r && r.file ? new File([r.file], r.name, { type: r.file.type || '', lastModified: r.file.lastModified || r.time }) : null; } catch { return null; }
  });
}
export function clear() {
  return serial(async () => { list = []; try { await tx('readwrite', st => st.clear()); } catch (e) { console.warn('[recent] 无法清除最近文件', e); } });
}
export const recentFiles = { load, items, setLimit, add, get, clear };
export default recentFiles;
