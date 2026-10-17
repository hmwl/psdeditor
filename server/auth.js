




















import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolvePlan } from './entitlements.js';

const HERE = import.meta.dirname;
export const AUTH_OFF = (process.env.PSD_EDITOR_AUTH || '').toLowerCase() === 'off';
const SESSION_TTL_MS = (+process.env.PSD_EDITOR_SESSION_TTL_HOURS || 12) * 3600 * 1000;
const SECRET = process.env.PSD_EDITOR_SESSION_SECRET
  ? Buffer.from(process.env.PSD_EDITOR_SESSION_SECRET, 'utf8')
  : crypto.randomBytes(32);


let KEYS = [];          
export function loadApiKeys() {
  const out = [];
  const env = process.env.PSD_EDITOR_API_KEYS;
  if (env) for (const item of env.split(',')) {
    const [key, name, rpm, plan] = item.trim().split(':');
    if (key) out.push({ key, name: name || key.slice(0, 6) + '…', ...(+rpm ? { rpm: +rpm } : {}), ...(plan ? { plan } : {}) });
  }
  const file = process.env.PSD_EDITOR_API_KEYS_FILE || path.join(HERE, 'api-keys.json');
  if (fs.existsSync(file)) {
    try {
      const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const k of arr) if (k && k.key) out.push({ ...k });
    } catch (e) { console.error('[auth] api-keys 文件无法解析：' + e.message); }
  }
  for (const k of out) if (k.key.length < 16) console.warn(`[auth] API key「${k.name}」过短（<16 字符），请换成随机长串`);
  KEYS = out;
  return out;
}
export function apiKeyCount() { return KEYS.length; }

function findKey(presented) {
  if (!presented) return null;
  const p = Buffer.from(String(presented));
  for (const k of KEYS) {
    const b = Buffer.from(k.key);
    if (b.length === p.length && crypto.timingSafeEqual(b, p)) return k;
  }
  return null;
}


const b64u = b => Buffer.from(b).toString('base64url');
function sign(payload) { return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url'); }

export function issueSession(extra = {}) {
  const sid = crypto.randomBytes(16).toString('hex');
  const body = b64u(JSON.stringify({ sid, exp: Date.now() + SESSION_TTL_MS, scope: 'editor', ...extra }));
  return { token: body + '.' + sign(body), sid, expiresAt: Date.now() + SESSION_TTL_MS,
           engineKey: engineKeyFor(sid).toString('base64url') };
}
export function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p.sid || !(p.exp > Date.now())) return null;
  return p;
}

export function engineKeyFor(sid) { return crypto.createHmac('sha256', SECRET).update('engine:' + sid).digest(); }


export function authenticate(req) {
  const apiKey = req.get('x-api-key');
  if (apiKey) {
    const k = findKey(apiKey);
    if (!k) return { error: 'API key 无效' };
    return apiPrincipal(k);
  }
  const auth = req.get('authorization') || '';
  if (/^bearer /i.test(auth)) {
    const tok = auth.slice(7).trim();
    const s = verifySession(tok);
    if (s) return withPlan({ id: 'sess:' + s.sid, kind: 'session', sid: s.sid, ...(+process.env.PSD_EDITOR_SESSION_RPM ? { rpm: +process.env.PSD_EDITOR_SESSION_RPM } : {}) });
    
    const k = findKey(tok);
    if (k) return apiPrincipal(k);
    return { error: tok.includes('.') ? '会话无效或已过期，请刷新页面' : 'API key 无效' };
  }
  return null;
}

const apiPrincipal = k => withPlan({ id: 'key:' + k.name, keyId: 'k' + crypto.createHash('sha256').update(String(k.key)).digest('hex').slice(0, 24),
  kind: 'api', name: k.name, plan: k.plan, features: k.features, rates: k.rates, rpm: k.rpm, concurrency: k.concurrency, maxUploadMB: k.maxUploadMB });





function withPlan(p) {
  const ent = resolvePlan(p);
  return { ...p, plan: ent.plan, planTitle: ent.title,
    rpm: ent.limits.rpm || (p.kind === 'session' ? 240 : 60),
    concurrency: ent.limits.concurrency || null, maxUploadMB: ent.limits.maxUploadMB || null };
}
export const anonPrincipal = () => ({ ...withPlan({ id: 'anon', kind: 'anon' }), rpm: 1e9 });





export function tryAcquireHeavy(p = {}) {
  const id = p.id || 'anon';
  const keyLimit = +p.concurrency > 0 ? +p.concurrency : 0;
  const used = keyInflight.get(id) || 0;
  if (keyLimit && used >= keyLimit) return { error: `该凭证的并发已满（${keyLimit}），请稍后重试`, scope: 'key' };
  if (inflight >= MAX_CONCURRENT) return { error: `服务端渲染并发已满（${MAX_CONCURRENT}），请稍后重试`, scope: 'global' };
  inflight++; keyInflight.set(id, used + 1);
  let released = false;
  return { release() {
    if (released) return; released = true;
    inflight = Math.max(0, inflight - 1);
    const n = (keyInflight.get(id) || 1) - 1;
    if (n > 0) keyInflight.set(id, n); else keyInflight.delete(id);
  } };
}


export function takeRate(p) { return AUTH_OFF || takeToken(p.id, p.rpm); }


const buckets = new Map();   
function takeToken(id, rpm) {
  const now = Date.now();
  let b = buckets.get(id);
  if (!b) { b = { tokens: rpm, ts: now }; buckets.set(id, b); }
  b.tokens = Math.min(rpm, b.tokens + (now - b.ts) / 60000 * rpm); b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1; return true;
}
setInterval(() => { const cut = Date.now() - 10 * 60000; for (const [k, v] of buckets) if (v.ts < cut) buckets.delete(k); }, 60000).unref();

const MAX_CONCURRENT = +process.env.PSD_EDITOR_MAX_CONCURRENT || 2;
let inflight = 0;                 
const keyInflight = new Map();    


export function concurrencySnapshot() {
  return { inflight, max: MAX_CONCURRENT, keys: Object.fromEntries(keyInflight) };
}









export function heavy() {
  return (req, res, next) => {
    const p = req.principal || {};
    const id = p.id || 'anon';
    const keyLimit = +p.concurrency > 0 ? +p.concurrency : 0;
    const used = keyInflight.get(id) || 0;

    if (keyLimit && used >= keyLimit) {
      res.set('Retry-After', '2');
      return res.status(429).json({ error: `该凭证的并发已满（${keyLimit}），请稍后重试`, scope: 'key', limit: keyLimit, inflight: used });
    }
    if (inflight >= MAX_CONCURRENT) {
      res.set('Retry-After', '2');
      return res.status(429).json({ error: `服务端渲染并发已满（${MAX_CONCURRENT}），请稍后重试`, scope: 'global', limit: MAX_CONCURRENT, inflight });
    }

    inflight++; keyInflight.set(id, used + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inflight = Math.max(0, inflight - 1);
      const n = (keyInflight.get(id) || 1) - 1;
      if (n > 0) keyInflight.set(id, n); else keyInflight.delete(id);   
    };
    res.on('finish', release); res.on('close', release);
    next();
  };
}





export function requireAuth(kinds = ['api', 'session']) {
  return (req, res, next) => {
    if (AUTH_OFF) { req.principal = anonPrincipal(); return next(); }
    const p = authenticate(req);
    if (!p) return res.status(401).json({ error: '需要鉴权：对外接口请带 X-Api-Key；编辑器请先 POST /api/session 取会话' });
    if (p.error) return res.status(401).json({ error: p.error });
    if (!kinds.includes(p.kind)) return res.status(403).json({ error: '当前凭证无权访问该接口' });
    if (!takeToken(p.id, p.rpm)) { res.set('Retry-After', '10'); return res.status(429).json({ error: `超过速率限制（${p.rpm}/分钟）` }); }
    req.principal = p;
    next();
  };
}
