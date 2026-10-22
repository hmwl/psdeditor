






const DB_NAME = 'psd_editor-tile-store';
const STORE = 'tiles';
const VERSION = 1;
const TILE = 256;
const stores = new Map();
let dbPromise = null, rootPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前浏览器没有 IndexedDB，无法使用磁盘瓦片存储'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); resolve(db); };
    req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'));
    req.onblocked = () => reject(new Error('IndexedDB 被其他标签页占用'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
const txDone = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务已中止')); });
export function newTileStoreId() { return `t${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`; }
const opfsRoot = () => rootPromise || (rootPromise = navigator.storage.getDirectory());
const fileName = id => `tile-${id}.bin`;
const bandKey = (id, row) => `${id}/${row}`;

async function deflate(bytes) {
  const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter(), chunks = [];
  const readDone = (async () => { const rd = cs.readable.getReader(); for (;;) { const q = await rd.read(); if (q.done) break; chunks.push(q.value); } })();
  await writer.write(bytes); await writer.close(); await readDone;
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate'), writer = ds.writable.getWriter(), chunks = [];
  const readDone = (async () => { const rd = ds.readable.getReader(); for (;;) { const q = await rd.read(); if (q.done) break; chunks.push(q.value); } })();
  await writer.write(bytes); await writer.close(); await readDone;
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
async function putIdb(id, row, blob) {
  const db = await openDB(), tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, bandKey(id, row)); await txDone(tx);
}
async function getIdb(id, row) {
  const db = await openDB(), tx = db.transaction(STORE, 'readonly'), req = tx.objectStore(STORE).get(bandKey(id, row));
  const blob = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); });
  await txDone(tx); return blob;
}



export async function createTileWriter(width, height, tileSize = TILE) {
  const id = newTileStoreId(), cols = Math.ceil(width / tileSize), rows = Math.ceil(height / tileSize);
  let root = null;
  try { root = await opfsRoot(); } catch { root = null; }
  const bandOf = row => new Uint8Array(width * Math.min(TILE, height - row * TILE) * 4);
  let curRow = -1, band = null, bandRows = 0, index = [], offset = 0;
  let writable = null, fh = null;
  if (root) {
    fh = await root.getFileHandle(fileName(id), { create: true });
    writable = await fh.createWritable();
  }
  const closeBand = async () => {
    if (curRow < 0 || !band) return;
    const raw = band.length === width * bandRows * 4 ? band : band.slice(0, width * bandRows * 4);
    const packed = await deflate(raw);
    if (writable) await writable.write(packed); else await putIdb(id, curRow, new Blob([packed]));
    index.push({ offset, length: packed.length, rows: bandRows });
    offset += packed.length;
  };
  return {
    id, width, height, tileSize, cols, rows,
    async write(tile) {
      const row = Math.floor(tile.y / TILE);
      if (row !== curRow) {
        await closeBand();
        curRow = row; bandRows = Math.min(TILE, height - row * TILE); band = bandOf(row);
      }
      const w = Math.min(tile.width, width - tile.x), h = Math.min(tile.height, bandRows);
      for (let y = 0; y < h; y++) band.set(tile.data.subarray(y * tile.width * 4, y * tile.width * 4 + w * 4), (y * width + tile.x) * 4);
    },
    async close() {
      await closeBand();
      const st = { id, type: root ? 'opfs' : 'idb', width, height, tileSize, cols, rows, index, bandCache: new Map(), bandOrder: [] };
      if (root) { await writable.close(); st.file = await fh.getFile(); }
      stores.set(id, st); return st;
    },
    async abort() {
      try { if (writable) await writable.abort(); } catch {}
      stores.delete(id);
      if (root) { try { await root.removeEntry(fileName(id)); } catch {} }
      else { try { await deleteStore(id); } catch {} }
    },
  };
}

async function bandFor(st, row) {
  let raw = st.bandCache.get(row);
  if (raw) {
    st.bandOrder = st.bandOrder.filter(r => r !== row); st.bandOrder.push(row);
    return raw;
  }
  const e = st.index[row]; if (!e) return null;
  let packed;
  if (st.type === 'opfs') packed = new Uint8Array(await st.file.slice(e.offset, e.offset + e.length).arrayBuffer());
  else { const blob = await getIdb(st.id, row); if (!blob) return null; packed = new Uint8Array(await blob.arrayBuffer()); }
  raw = await inflate(packed);
  if (raw.length !== st.width * e.rows * 4) throw new Error('磁盘瓦片行带尺寸不一致');
  st.bandCache.set(row, raw); st.bandOrder.push(row);
  while (st.bandOrder.length > 6) st.bandCache.delete(st.bandOrder.shift());
  return raw;
}

export async function getTile(storeId, x, y) {
  const id = typeof storeId === 'string' ? storeId : storeId?.id;
  const st = stores.get(id); if (!st) return null;
  const row = Math.floor(y / TILE), col = Math.floor(x / TILE);
  if (col < 0 || col >= st.cols || row < 0 || row >= st.rows) return null;
  const band = await bandFor(st, row); if (!band) return null;
  const w = Math.min(TILE, st.width - x), h = Math.min(TILE, st.height - y);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let yy = 0; yy < h; yy++) data.set(band.subarray((yy * st.width + x) * 4, (yy * st.width + x + w) * 4), yy * w * 4);
  return { x, y, width: w, height: h, data };
}

export async function deleteStore(storeId) {
  const id = typeof storeId === 'string' ? storeId : storeId?.id; if (!id) return;
  const st = stores.get(id); stores.delete(id);
  try {
    if (!st || st.type === 'opfs') { try { const root = await opfsRoot(); await root.removeEntry(fileName(id)); } catch {} }
    try {
      const db = await openDB(), tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      const range = IDBKeyRange.bound(`${id}/`, `${id}/\uffff`), req = store.openCursor(range);
      await new Promise((resolve, reject) => { req.onsuccess = () => { const c = req.result; if (!c) { resolve(); return; } c.delete(); c.continue(); }; req.onerror = () => reject(req.error); });
      await txDone(tx);
    } catch {}
  } catch {}
}

export async function clearAllStores() {
  const ids = [...stores.keys()];
  for (const id of ids) { try { await deleteStore(id); } catch {} }
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
