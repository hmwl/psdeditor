








const DB = 'psd_editor-recovery', STORE = 'drafts';
const SESSION = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let A = null, dbp = null;
const lastSave = new Map();      
const firstDirty = new Map();    
let saving = false;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('浏览器不支持 IndexedDB')); return; }
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'key' }); };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const listDrafts = () => tx('readonly', st => req(st.getAll())).catch(() => []);
const putDraft = d => tx('readwrite', st => req(st.put(d)));
export const deleteDraft = key => tx('readwrite', st => req(st.delete(key))).catch(() => {});

const intervalMs = () => {
  const p = A.pref('file') || {};
  if (p.autoSave === false) return 0;
  return Math.max(1, +p.autoSaveMin || 10) * 60000;
};
const keyOf = uid => `${SESSION}:${uid}`;


export async function saveNow({ force = false } = {}) {
  if (!A || saving || !A.hasDoc() || A.busy()) return false;
  const uid = A.uid(); if (uid == null) return false;
  const key = keyOf(uid);
  if (!A.dirty()) { firstDirty.delete(uid); if (lastSave.has(uid)) { lastSave.delete(uid); await deleteDraft(key); } return false; }
  if (!firstDirty.has(uid)) firstDirty.set(uid, Date.now());
  const sig = A.editSig();
  const last = lastSave.get(uid);
  if (last && last.sig === sig) return false;                        
  if (!force && Date.now() - (last ? last.at : firstDirty.get(uid)) < intervalMs()) return false;
  saving = true;
  try {
    const bytes = await A.buildBytes();
    if (!bytes) return false;
    await putDraft({ key, session: SESSION, uid, name: A.docName() || '未标题', savedAt: Date.now(), size: bytes.byteLength, width: A.docW(), height: A.docH(), bytes });
    lastSave.set(uid, { at: Date.now(), sig });
    return true;
  } catch (e) {
    A.status('自动存储恢复信息没能完成：' + (/quota|space/i.test(String(e && (e.name || e.message))) ? '浏览器存储空间不够' : (e && e.message || e)));
    lastSave.set(uid, { at: Date.now(), sig });                        
    return false;
  } finally { saving = false; }
}


async function pruneClosed() {
  const open = new Set(A.openUids());
  for (const uid of [...lastSave.keys()]) if (!open.has(uid)) { lastSave.delete(uid); await deleteDraft(keyOf(uid)); }
  for (const uid of [...firstDirty.keys()]) if (!open.has(uid)) firstDirty.delete(uid);
}

async function tick() {
  if (!A) return;
  try { await pruneClosed(); } catch {}
  if (!intervalMs()) return;
  const idle = cb => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 20000 }) : setTimeout(cb, 500));
  idle(() => { saveNow().catch(() => {}); });
}


async function offerRecovery() {
  const all = (await listDrafts()).filter(d => d && d.session !== SESSION).sort((a, b) => b.savedAt - a.savedAt);
  if (!all.length) return;
  const fmt = t => new Date(t).toLocaleString();
  for (const d of all.slice(0, 5)) {
    const mb = (d.size / 1048576).toFixed(1);
    const ch = await A.choiceDialog(`上次编辑「${d.name}」时没有正常关闭（浏览器崩溃或页面被关掉）。\n找到了 ${fmt(d.savedAt)} 自动存下的恢复信息（${d.width}×${d.height}，${mb} MB）。要打开它吗？`,
      { title: '恢复文档', okText: '恢复', extraText: '丢弃', cancelText: '以后再说' });
    if (ch === 'ok') {
      const ok = await A.openBuffer(d.bytes, d.name, `已恢复「${d.name}」（${fmt(d.savedAt)} 的恢复信息）：确认无误后请导出存一份`);
      if (ok) await deleteDraft(d.key);
    } else if (ch === 'extra') await deleteDraft(d.key);
    else break;
  }
  for (const d of all.slice(5)) if (Date.now() - d.savedAt > 7 * 86400e3) await deleteDraft(d.key);   
}




export function installAutosave(ctx) {
  A = ctx;
  setInterval(tick, 30000);
  setTimeout(() => { offerRecovery().catch(e => console.warn('[恢复信息]', e)); }, 1500);
}

export default { installAutosave, saveNow, listDrafts, deleteDraft };
