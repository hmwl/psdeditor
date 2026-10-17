


















import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;



const JSON_LOG = env.PSD_EDITOR_LOG_FORMAT === 'json';
export function log(level, msg, extra = {}) {
  const t = new Date().toISOString();
  if (JSON_LOG) { (level === 'error' ? console.error : console.log)(JSON.stringify({ t, level, msg, ...extra })); return; }
  const tail = Object.keys(extra).length ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ') : '';
  (level === 'error' ? console.error : console.log)(`${t} ${level.toUpperCase()} ${msg}${tail}`);
}



let inflight = 0;
export const inflightCount = () => inflight;
const ACCESS = env.PSD_EDITOR_ACCESS_LOG || 'on';
const RID_OK = /^[A-Za-z0-9._:-]{8,128}$/;
const isStatic = p => !/^\/(api|mcp|openapi\.json|editor$|docs$|console$|$)/.test(p);

export function requestContext() {
  return (req, res, next) => {
    const given = req.get('x-request-id');
    req.id = given && RID_OK.test(given) ? given : crypto.randomBytes(9).toString('base64url');
    res.set('X-Request-Id', req.id);
    const t0 = process.hrtime.bigint();
    inflight++;
    let done = false;
    const finish = () => {
      if (done) return; done = true; inflight--;
      if (ACCESS === 'off') return;
      const p = req.originalUrl.split('?')[0];
      if (ACCESS !== 'all' && (p === '/health' || isStatic(p))) return;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const who = req.principal ? `${req.principal.kind}:${req.principal.name || req.principal.id || ''}` : '-';
      const bytes = +res.get('content-length') || undefined;
      if (JSON_LOG) log('info', 'request', { rid: req.id, method: req.method, path: p, status: res.statusCode, ms: +ms.toFixed(1), bytes, who, ip: req.ip, aborted: !res.writableEnded || undefined });
      else console.log(`${new Date().toISOString()} ${req.method} ${p} ${res.statusCode} ${ms.toFixed(0)}ms ${bytes != null ? bytes + 'B ' : ''}${who} rid=${req.id}${res.writableEnded ? '' : ' (aborted)'}`);
    };
    res.on('finish', finish);
    res.on('close', finish);
    next();
  };
}







function defaultCsp() {
  const fa = env.PSD_EDITOR_FRAME_ANCESTORS || "'self'";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: blob: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${fa}`,
  ].join('; ');
}

export function securityHeaders({ dev = false } = {}) {
  const cspSetting = env.PSD_EDITOR_CSP;
  const csp = cspSetting === 'off' ? null : cspSetting && cspSetting !== 'on' ? cspSetting : (dev && cspSetting !== 'on' ? null : defaultCsp());
  const frameOpt = (env.PSD_EDITOR_FRAME_ANCESTORS || "'self'") === "'self'" ? 'SAMEORIGIN' : null;
  return (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (frameOpt) res.set('X-Frame-Options', frameOpt);
    
    if (csp && req.method === 'GET' && !/^\/(api|mcp)\b/.test(req.path)) res.set('Content-Security-Policy', csp);
    if (env.PSD_EDITOR_HSTS === '1' || (env.PSD_EDITOR_HSTS !== '0' && req.secure)) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}



export const API_VERSION = 'v1';

export function apiVersionAlias() {
  return (req, res, next) => {
    if (req.url === '/api/v1' || req.url.startsWith('/api/v1/') || req.url.startsWith('/api/v1?')) {
      req.url = '/api' + req.url.slice('/api/v1'.length);
    }
    if (req.url.startsWith('/api/')) res.set('X-Api-Version', API_VERSION);
    next();
  };
}



const STATE_ON = env.PSD_EDITOR_STATE !== 'off';
export const STATE_DIR = env.PSD_EDITOR_STATE_DIR || path.join(HERE, 'data', 'state');
const stores = new Map();   






export function registerState(name, { dump, load, interval = true, consume = false }) {
  stores.set(name, { dump, load, interval });
  if (!STATE_ON) return;
  const file = path.join(STATE_DIR, name + '.json');
  if (!fs.existsSync(file)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const binDir = path.join(STATE_DIR, name + '.bin');
    const revive = v => {
      if (v && typeof v === 'object') {
        if (typeof v.$bin === 'string') { const f = path.join(binDir, path.basename(v.$bin)); return fs.existsSync(f) ? fs.readFileSync(f) : null; }
        for (const k of Object.keys(v)) v[k] = revive(v[k]);
      }
      return v;
    };
    load(revive(raw));
    log('info', `已恢复落盘状态：${name}`);
    
    if (consume) { fs.rmSync(file, { force: true }); fs.rmSync(binDir, { recursive: true, force: true }); }
  } catch (e) { log('warn', `落盘状态 ${name} 读取失败，按空状态启动`, { error: String(e && e.message || e) }); }
}

function writeState(name, only = null) {
  const s = stores.get(name); if (!s || (only && !only(s))) return;
  let data;
  try { data = s.dump(); } catch (e) { log('warn', `状态 ${name} 导出失败`, { error: String(e.message || e) }); return; }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = path.join(STATE_DIR, name + '.json');
  const binDir = path.join(STATE_DIR, name + '.bin');
  if (data == null) { try { fs.rmSync(file, { force: true }); fs.rmSync(binDir, { recursive: true, force: true }); } catch {} return; }
  const bins = [];
  const strip = v => {
    if (v instanceof Uint8Array) { const f = `b${bins.length}.bin`; bins.push([f, v]); return { $bin: f }; }
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = strip(v[k]); return o; }
    return v;
  };
  const json = JSON.stringify(strip(data));
  const tmp = file + '.tmp';
  if (bins.length) {
    const tmpDir = binDir + '.tmp';
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    for (const [f, b] of bins) fs.writeFileSync(path.join(tmpDir, f), b);
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.renameSync(tmpDir, binDir);
  } else fs.rmSync(binDir, { recursive: true, force: true });
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, file);
}
export function saveAllState(only = null) {
  if (!STATE_ON) return;
  for (const name of stores.keys()) { try { writeState(name, only); } catch (e) { log('warn', `状态 ${name} 落盘失败`, { error: String(e.message || e) }); } }
}
if (STATE_ON) setInterval(() => saveAllState(s => s.interval), 60000).unref();   



const SHUTDOWN_MS = +env.PSD_EDITOR_SHUTDOWN_TIMEOUT_MS || 25000;
let stopping = false;
export const isStopping = () => stopping;

export function startServer(app, port, onListen) {
  const server = app.listen(port, onListen);
  
  server.keepAliveTimeout = 65000; server.headersTimeout = 66000;

  const shutdown = (why, code = 0) => {
    if (stopping) return; stopping = true;
    log('info', `收到 ${why}，停止接收新请求，等待 ${inflight} 个在途请求结束（最多 ${SHUTDOWN_MS / 1000}s）`);
    server.close(() => {});
    if (server.closeIdleConnections) server.closeIdleConnections();
    const t0 = Date.now();
    const tick = setInterval(() => {
      if (inflight > 0 && Date.now() - t0 < SHUTDOWN_MS) return;
      clearInterval(tick);
      if (inflight > 0) log('warn', `等待超时，仍有 ${inflight} 个请求未结束，强制退出`);
      try { saveAllState(); } catch {}
      if (server.closeAllConnections) server.closeAllConnections();
      log('info', '已退出');
      process.exit(code);
    }, 100);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', e => log('error', '未处理的 Promise 拒绝', { error: String(e && e.stack || e) }));
  process.on('uncaughtException', e => {
    
    log('error', '未捕获的异常，进程将退出', { error: String(e && e.stack || e) });
    shutdown('uncaughtException', 1);
  });
  return server;
}


export function rejectWhileStopping() {
  return (req, res, next) => {
    if (!stopping) return next();
    res.set('Connection', 'close');
    res.status(503).json({ error: '服务正在重启，请稍后重试', code: 'shutting_down' });
  };
}

export default { log, requestContext, securityHeaders, apiVersionAlias, registerState, saveAllState, startServer, rejectWhileStopping, inflightCount, API_VERSION, STATE_DIR };
