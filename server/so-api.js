





















import express from 'express';
import { resolveFragment, writebackFragment, resolveSmartFilters, writebackSmartFilters } from './private/index.js';

const MAX_ITEMS = 64;

function decodeFragment(f) {
  if (!f || typeof f !== 'object' || !Array.isArray(f.blocks)) throw new Error('fragment 格式错误');
  return {
    layerName: typeof f.layerName === 'string' ? f.layerName.slice(0, 256) : '',
    bounds: f.bounds, kind: f.kind, psb: !!f.psb,
    blocks: f.blocks.map(b => ({ key: b.key, data: typeof b.data === 'string' ? Buffer.from(b.data, 'base64') : null }))
      .map(b => ({ key: b.key, data: b.data ? new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength) : null }))
  };
}
const encodeBlocks = blocks => blocks.map(b => ({ key: b.key, data: Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength).toString('base64') }));

export function soRouter() {
  const r = express.Router();
  r.use(express.json({ limit: process.env.PSD_EDITOR_SO_JSON_LIMIT || '32mb' }));

  



  r.post('/resolve', (req, res) => {
    const t0 = Date.now();
    const many = Array.isArray(req.body?.items);
    const list = many ? req.body.items : [req.body];
    if (list.length > MAX_ITEMS) return res.status(400).json({ error: `一次最多 ${MAX_ITEMS} 个智能对象` });
    
    const withFilters = req.query?.filters === '1' || req.query?.filters === 'true';
    const items = list.map(f => {
      try {
        const frag = decodeFragment(f);
        const out = resolveFragment(frag);
        if (withFilters) {
          try { out.smartFilters = resolveSmartFilters(frag); }
          catch (e) { out.smartFilters = { error: e.message }; }   
        }
        return out;
      }
      catch (e) { return { error: e.message }; }        
    });
    res.set('Cache-Control', 'no-store');
    if (many) {
      const failed = items.filter(it => it && it.error).length;
      return res.json({ items, failed, ok: items.length - failed, ms: Date.now() - t0 });
    }
    const one = items[0];
    if (one && one.error) return res.status(400).json({ error: one.error, ms: Date.now() - t0 });
    res.json({ ...one, ms: Date.now() - t0 });
  });

  r.post('/writeback', (req, res) => {
    const t0 = Date.now();
    try {
      const out = writebackFragment(decodeFragment(req.body?.fragment), req.body?.edit);
      res.set('Cache-Control', 'no-store');
      res.json({ mode: out.mode, blocks: encodeBlocks(out.blocks), ms: Date.now() - t0 });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  




  r.post('/filters', (req, res) => {
    const t0 = Date.now();
    const many = Array.isArray(req.body?.items);
    const list = many ? req.body.items : [req.body];
    if (list.length > MAX_ITEMS) return res.status(400).json({ error: `一次最多 ${MAX_ITEMS} 个智能对象` });
    const items = list.map(f => {
      try { return resolveSmartFilters(decodeFragment(f)); }
      catch (e) { return { error: e.message }; }
    });
    res.set('Cache-Control', 'no-store');
    if (many) {
      const failed = items.filter(it => it && it.error).length;
      return res.json({ items, failed, ok: items.length - failed, ms: Date.now() - t0 });
    }
    const one = items[0];
    if (one && one.error) return res.status(400).json({ error: one.error, ms: Date.now() - t0 });
    res.json({ ...one, ms: Date.now() - t0 });
  });

  r.post('/filters/writeback', (req, res) => {
    const t0 = Date.now();
    try {
      const body = req.body || {};
      const out = writebackSmartFilters(decodeFragment(body.fragment), body.edits ?? body.edit);
      res.set('Cache-Control', 'no-store');
      res.json({ blocks: encodeBlocks(out.blocks), count: out.count, changed: out.changed,
                 warnings: out.warnings, ms: Date.now() - t0 });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  return r;
}
