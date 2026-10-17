







import { applyFilter } from './filters.js';

export const WORKER_URL = import.meta.url;

const inWorker = typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function';
if (inWorker) {
  self.onmessage = ev => {
    const m = ev.data || {};
    try {
      const out = applyFilter(m.kind, m.rgba, m.w, m.h, m.params);
      const arr = out instanceof Uint8ClampedArray ? out : new Uint8ClampedArray(out.buffer || out);
      self.postMessage({ job: m.job, rgba: arr }, [arr.buffer]);
    } catch (e) { self.postMessage({ job: m.job, error: String(e && e.message || e) }); }
  };
  self.postMessage({ ready: true });
}
