













import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { engineKeyFor } from './auth.js';

const HERE = import.meta.dirname;
export const ENGINE_FILE = process.env.PSD_EDITOR_ENGINE_FILE || path.join(HERE, 'engine', 'engine.js');

let cache = null;   
function loadEngine() {
  if (!fs.existsSync(ENGINE_FILE)) return null;
  const st = fs.statSync(ENGINE_FILE);
  if (!cache || cache.mtimeMs !== st.mtimeMs) {
    const raw = fs.readFileSync(ENGINE_FILE);
    



    const bytes = zlib.gzipSync(raw, { level: 9 });
    cache = { mtimeMs: st.mtimeMs, bytes, plainSize: raw.length,
              etag: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16) };
  }
  return cache;
}
export function engineAvailable() { return !!loadEngine(); }



export function encryptForSession(sid, plain) {
  const key = engineKeyFor(sid);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(sid, 'utf8'));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from('FPE2'), iv, ct, c.getAuthTag()]);
}

export function engineRouter() {
  const r = express.Router();
  r.get('/', (req, res) => {
    const eng = loadEngine();
    if (!eng) return res.status(503).json({ error: '前端引擎未构建（npm run build）' });
    const sid = req.principal?.sid;
    if (!sid) return res.status(403).json({ error: '引擎只对编辑器会话下发' });
    res.set('Content-Type', 'application/octet-stream');
    




    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.vary('Authorization');
    res.set('X-Engine-Build', eng.etag);
    res.send(encryptForSession(sid, eng.bytes));
  });
  return r;
}
