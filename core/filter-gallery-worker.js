









import { applyGalleryStack, applyGalleryEffect, effectDefaults } from './filter-gallery.js';

export const WORKER_URL = import.meta.url;

const inWorker = typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function';
if (inWorker) {
  self.onmessage = ev => {
    const m = ev.data || {};
    try {
      if (m.type === 'stack') {
        let last = 0;
        const out = applyGalleryStack(m.rgba, m.w, m.h, m.layers, { ...m.env, progress: f => { const t = Date.now(); if (t - last > 60) { last = t; self.postMessage({ job: m.job, progress: f }); } } });
        self.postMessage({ job: m.job, done: true, rgba: out }, [out.buffer]);
      } else if (m.type === 'thumbs') {
        for (const id of m.ids) {
          const out = applyGalleryEffect(id, m.rgba, m.w, m.h, (m.params && m.params[id]) || effectDefaults(id), m.env);
          self.postMessage({ job: m.job, thumb: id, rgba: out }, [out.buffer]);
        }
        self.postMessage({ job: m.job, done: true });
      }
    } catch (e) { self.postMessage({ job: m.job, error: String(e && e.message || e) }); }
  };
  self.postMessage({ ready: true });
}
