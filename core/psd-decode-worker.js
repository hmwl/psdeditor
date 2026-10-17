



import { createLayerTileSession, decodeLayerJob } from './psd-raster.js';
import { createLodAccumulator, lodScale } from './psd-lod.js';

export const WORKER_URL = import.meta.url;
const MiB = 1024 * 1024;
const inWorker = typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function';
if (inWorker) {
  const sources = new Map(), accumulators = new Map(), stats = { rowsRead: 0, rowHits: 0, streamStarts: 0, sourceEvictions: 0 };
  const totals = () => {
    let sourceBytes = 0, rowBytes = 0,indexBytes=0,indexPoints=0,indexWorkingBytes=0;
    for (const s of sources.values()) { sourceBytes += s.bytes; rowBytes += s.session.rowBytes;indexBytes+=s.session.indexBytes;indexPoints+=s.session.indexPoints;indexWorkingBytes+=s.session.indexWorkingBytes; }
    let lodAccumulatorBytes = 0; for (const a of accumulators.values()) lodAccumulatorBytes += a.bytes;
    return { sourceBytes, rowBytes, lodAccumulatorBytes,indexBytes,indexPoints,indexWorkingBytes };
  };
  const evict = id => { const s = sources.get(id); if (s) { s.session.close(); sources.delete(id); stats.sourceEvictions++; } };
  
  let tail = Promise.resolve();
  self.onmessage = ev => { tail = tail.then(() => handle(ev.data || {})); };
  async function handle(m) {
    let result = {}, error = null;
    try {
      if (m.clearSources) for (const id of [...sources.keys()]) evict(id);
      else if (m.job?.lodAbort) accumulators.delete(m.job.lodAbort);
      else if (m.job?.lodPart) {
        const p = m.job.lodPart;
        if (p.first) {
          if (accumulators.has(p.id)) throw new Error('LOD 条带任务重复');
          accumulators.set(p.id, createLodAccumulator(p.width, p.height, p.scale));
        }
        const acc = accumulators.get(p.id); if (!acc) throw new Error('LOD 条带任务已释放');
        const decoded = await decodeLayerJob({ ...m.job, chans: m.chans });
        if (!decoded.rgba) throw new Error('LOD 条带解码没有像素');
        acc.add(decoded.rgba, m.job.height, p.offsetY);
        stats.lodPeakBandPixels = Math.max(stats.lodPeakBandPixels || 0, m.job.width * m.job.height);
        if (p.done) { result = { tile: { x: p.x, y: p.y, width: p.width, height: p.height, ...acc.finish() } }; accumulators.delete(p.id); }
        stats.lodBands = (stats.lodBands || 0) + 1;
      }
      else {
        let source = m.sourceId && sources.get(m.sourceId);
        if (!source && m.sourceId && m.chans) {
          const seekWeight=m.job.depth===8&&m.chans.length&&m.chans[0].w*m.chans[0].h>16*MiB&&m.chans.every(c=>c.id>=-1&&c.bytes.length>=2&&[2,3].includes(new DataView(c.bytes.buffer,c.bytes.byteOffset,c.bytes.byteLength).getUint16(0)))?m.chans.reduce((n,c)=>n+c.w*c.h,0):0;
          source = { chans: m.chans, bytes: m.chans.reduce((n, c) => n + c.bytes.byteLength, 0),seekWeight,
            session: createLayerTileSession(m.chans, { rowBudget: m.rowBudget,seekBudget:m.seekBudget, stats }) };
          sources.set(m.sourceId, source);
        }
        else if(source&&!source.bytes){if(!m.chans)throw new Error('解码 Worker 需要重新传入压缩源');source.session.attachInput(m.chans);source.bytes=m.chans.reduce((n,c)=>n+c.bytes.byteLength,0);}
        if (m.sourceId && !source) throw new Error('解码 Worker 压缩源已释放');
        if (source) { sources.delete(m.sourceId); sources.set(m.sourceId, source); }
        const seekTotal=[...sources.values()].reduce((n,s)=>n+s.seekWeight,0);
        for(const s of sources.values())s.session.setSeekBudget(seekTotal?Math.floor((m.seekBudget??0)*s.seekWeight/seekTotal):0);
        if (Array.isArray(m.job?.batchTiles)) {
          const base = { ...m.job, batchTiles: undefined, chans: source ? source.chans : m.chans };
          const tiles = [];
          for (const tile of m.job.batchTiles) {
            const r = await decodeLayerJob({ ...base, tile, zipTile: base.zipTile !== false }, source?.session);
            if (!r?.tile) throw new Error('批量图层瓦片解码没有像素');
            tiles.push(r.tile);
          }
          result = { tiles, warns: [] };
        } else result = await decodeLayerJob({ ...m.job, chans: source ? source.chans : m.chans }, source?.session);
      }
    } catch (e) {
      error = String(e?.message || e);
      if (m.sourceId) evict(m.sourceId);
      if (m.job?.lodPart) accumulators.delete(m.job.lodPart.id);
    }
    const sourceBudget = m.sourceBudget ?? 32 * MiB, rowBudget = m.rowBudget ?? 16 * MiB;
    for(const [id,s]of sources){
      if(totals().sourceBytes<=sourceBudget)break;if(!s.bytes)continue;
      if(s.session.detachInput()){s.bytes=0;stats.sourceEvictions++;}else evict(id);
    }
    
    while(sources.size>64)evict(sources.keys().next().value);
    for (const s of sources.values()) {
      if (totals().rowBytes <= rowBudget) break;
      s.session.clearRows();
    }
    for(const s of sources.values()){if(totals().indexBytes<=(m.seekBudget??0))break;s.session.clearIndex();}
    for(const s of sources.values()){if(totals().indexWorkingBytes<=2*MiB)break;s.session.releaseSeekWorking();}
    const transfer = [];
    for (const data of [result.rgba, result.preview?.data, result.tile?.data, ...(result.tiles || []).map(t => t?.data)]) if (data && !transfer.includes(data.buffer)) transfer.push(data.buffer);
    if (result.planes) {
      const planes = {};
      for (const [k, p] of Object.entries(result.planes)) {
        const own = p.byteOffset === 0 && p.byteLength === p.buffer.byteLength ? p : p.slice();
        planes[k] = own; if (!transfer.includes(own.buffer)) transfer.push(own.buffer);
      }
      result.planes = planes;
    }
    self.postMessage({ id: m.id, ...result, ...(error ? { error } : {}), resident: [...sources].filter(([,s])=>s.bytes>0).map(([id])=>id), cache: { ...stats, ...totals(),indexSources:[...sources.values()].filter(s=>s.session.indexBytes>0).length } }, transfer);
  }
}





export function createDecodePool(n = 4, opts = {}) {
  n = Math.max(1, Math.min(16, n | 0));
  const sourceBudget = Math.max(0, Math.floor((opts.sourceBudget ?? 128 * MiB) / n));
  const rowBudget = Math.max(0, Math.floor((opts.rowBudget ?? 64 * MiB) / n));
  const seekBudget = Math.max(0, Math.floor((opts.seekBudget ?? 64 * MiB) / n));
  const workers = [], queue = [], pending = new Map(), affinity = new WeakMap(), routes = new WeakMap(), lodWaiting = [], activeLods = new Set();
  const counters = { sourceTransfers: 0, transferredBytes: 0, jobs: 0 };
  let seq = 0, sourceSeq = 0, lodSeq = 0, lodBusy = 0, broken = false, terminated = false;
  function failAll(error) {
    broken = true;
    while (lodWaiting.length) lodWaiting.shift().reject(error);
    for (const task of activeLods) task.reject(error);
    activeLods.clear(); lodBusy = 0;
    while (queue.length) queue.shift().reject(error);
    for (const p of pending.values()) p.reject(error);
    pending.clear();
    for (const s of workers) { s.worker.terminate(); s.resident.clear(); s.busy = false; s.cache = {}; }
  }
  function spawn() {
    const slot = { worker: new Worker(WORKER_URL, { type: 'module' }), busy: false, resident: new Set(), cache: {} };
    slot.worker.onmessage = ev => {
      const m = ev.data || {}, p = pending.get(m.id); if (!p || p.slot !== slot) return;
      pending.delete(m.id); slot.resident = new Set(m.resident || []); slot.cache = m.cache || {}; slot.busy = false;
      if (m.error) p.reject(new Error(m.error));
      else p.resolve({ rgba: m.rgba, preview: m.preview, tile: m.tile, tiles: m.tiles, planes: m.planes, warns: m.warns });
      pump();
    };
    slot.worker.onerror = e => failAll(new Error('解码 Worker 出错：' + (e?.message || e)));
    slot.worker.onmessageerror = () => failAll(new Error('解码 Worker 消息无法读取'));
    workers.push(slot); return slot;
  }
  const ownerOf = t => t.owner || (t.routeKey ? routes.get(t.routeKey) : t.retain ? affinity.get(t.chans) : null);
  function dispatch(slot, t) {
    slot.busy = true; pending.set(t.id, { ...t, slot });
    try {
      if (t.routeKey && !routes.has(t.routeKey)) routes.set(t.routeKey, { slot });
      let sourceId = 0, chans;
      if (t.retain) {
        let owner = affinity.get(t.chans);
        if (!owner) { owner = { id: ++sourceSeq, slot }; affinity.set(t.chans, owner); }
        sourceId = owner.id;
      }
      if (!t.clearSources && (!sourceId || !slot.resident.has(sourceId))) {
        chans = t.chans.map(c => ({ id: c.id, w: c.w, h: c.h, bytes: t.routeKey?.transferChannels && c.view.byteOffset === 0 && c.view.byteLength === c.view.buffer.byteLength ? c.view : c.view.slice() }));
        counters.sourceTransfers++; counters.transferredBytes += chans.reduce((n, c) => n + c.bytes.byteLength, 0);
      }
      slot.worker.postMessage({ id: t.id, job: t.job, sourceId, chans, clearSources: !!t.clearSources, sourceBudget, rowBudget,seekBudget }, chans ? chans.map(c => c.bytes.buffer) : []);
    } catch (e) { failAll(e); }
  }
  function pump() {
    if (broken || terminated) return;
    try {
      for (;;) {
        for (const slot of workers) {
          if (slot.busy) continue;
          const at = queue.findIndex(t => { const owner = ownerOf(t); return !owner || owner.slot === slot; });
          if (at >= 0) dispatch(slot, queue.splice(at, 1)[0]);
        }
        if (broken) return;
        if (workers.length < n && queue.some(t => !ownerOf(t))) { spawn(); continue; }
        break;
      }
    } catch (e) { failAll(e); }
  }
  function run(job, chans, routeKey = null) {
    if (broken || terminated) return Promise.reject(new Error('解码池不可用'));
    counters.jobs++;
    return new Promise((resolve, reject) => {
      queue.push({ id: ++seq, job, chans, routeKey, retain: !routeKey && !!(job.previewMax || job.zipTile || job.batchTiles), resolve, reject }); pump();
    });
  }
  function runBatch(job, chans, tiles, routeKey = null) {
    if (!Array.isArray(tiles) || !tiles.length) return Promise.resolve({ tiles: [] });
    return run({ ...job, batchTiles: tiles }, chans, routeKey);
  }
  function pumpLod() {
    while (lodBusy < n && lodWaiting.length && !broken && !terminated) {
      const task = lodWaiting.shift(); lodBusy++;
      activeLods.add(task);
      const finish = () => { if (activeLods.delete(task)) lodBusy--; pumpLod(); };
      task.work().then(value => { finish(); task.resolve(value); }, error => { finish(); task.reject(error); });
    }
  }
  return {
    get broken() { return broken || terminated; },
    get limits() { return { sourceBudget, rowBudget,seekBudget }; },
    get stats() {
      const out = { ...counters, workers: workers.length, pending: pending.size, queued: queue.length, sourceBytes: 0, rowBytes: 0, rowsRead: 0, rowHits: 0, streamStarts: 0, sourceEvictions: 0, sources: 0,
        lodJobs: lodBusy, lodQueued: lodWaiting.length, lodAccumulatorBytes: 0, lodRowsRead: 0, lodRowHits: 0, lodBands: 0, lodPeakBandPixels: 0,indexBytes:0,indexPoints:0,indexWorkingBytes:0,indexSources:0,checkpointRestores:0,checkpointDecodedBytes:0,checkpointEvictions:0 };
      for (const s of workers) {
        out.sources += s.resident.size;
        for (const k of ['sourceBytes', 'rowBytes', 'rowsRead', 'rowHits', 'streamStarts', 'sourceEvictions', 'lodAccumulatorBytes', 'lodRowsRead', 'lodRowHits', 'lodBands','indexBytes','indexPoints','indexWorkingBytes','indexSources','checkpointRestores','checkpointDecodedBytes','checkpointEvictions']) out[k] += s.cache[k] || 0;
        out.lodPeakBandPixels = Math.max(out.lodPeakBandPixels, s.cache.lodPeakBandPixels || 0);
      }
      return out;
    },
    run,
    runBatch,
    runLod(job, readBand, { transferChannels = false } = {}) {
      if (broken || terminated) return Promise.reject(new Error('解码池不可用'));
      const scale = lodScale(job.scale), id = ++lodSeq, routeKey = { transferChannels };
      return new Promise((resolve, reject) => {
        lodWaiting.push({ resolve, reject, work: async () => {
          const rows = Math.max(1, Math.min(scale, Math.floor(MiB / (job.width * (job.depth / 8) * 4))));
          try {
            let result;
            for (let y = 0; y < job.height; y += rows) {
              const h = Math.min(rows, job.height - y), chans = await readBand(y, h);
              result = await run({ ...job, height: h, scale: undefined, x: undefined, y: undefined, tile: undefined, zipTile: false, previewMax: 0, keepPlanes: false,
                lodPart: { id, scale, width: job.width, height: job.height, x: job.x, y: job.y, offsetY: y, first: y === 0, done: y + h === job.height } }, chans, routeKey);
            }
            return result;
          } catch (e) { if (!broken && !terminated) await run({ lodAbort: id }, [], routeKey).catch(() => {}); throw e; }
        } }); pumpLod();
      });
    },
    clearSources() {
      if (broken || terminated) return Promise.reject(new Error('解码池不可用'));
      return Promise.all(workers.map(slot => new Promise((resolve, reject) => {
        queue.push({ id: ++seq, clearSources: true, owner: { slot }, resolve, reject }); pump();
      })));
    },
    terminate() { terminated = true; failAll(new Error('解码池已终止')); },
  };
}

export default { WORKER_URL, createDecodePool };
