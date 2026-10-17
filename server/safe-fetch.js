









import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const MAX_BYTES = (+process.env.MAX_UPLOAD_MB || 200) * 1024 * 1024;
const TIMEOUT_MS = +process.env.PSD_EDITOR_MCP_FETCH_TIMEOUT_MS || 30000;

export class FetchError extends Error { constructor(m) { super(m); this.code = 'fetch'; } }


const BLOCK = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]])
  BLOCK.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64]])
  BLOCK.addSubnet(a, p, 'ipv6');

function embeddedV4(ip) {
  
  const s = ip.toLowerCase();
  const m = /^(?:::ffff:|::|64:ff9b::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(s);
  if (!m) return null;
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16), lo = parseInt(m[3], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}
export function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return BLOCK.check(ip, 'ipv4');
  if (net.isIPv6(ip)) {
    const v4 = embeddedV4(ip);
    if (v4) return BLOCK.check(v4, 'ipv4');
    return BLOCK.check(ip, 'ipv6');
  }
  return true;
}

function hostAllowed(host) {
  const allow = (process.env.PSD_EDITOR_MCP_FETCH_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !allow.length || allow.some(h => host === h || host.endsWith('.' + h));
}


function guardedLookup(hostname, options, cb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(new FetchError(`解析不了主机 ${hostname}`));
    if (process.env.PSD_EDITOR_MCP_FETCH_ALLOW_PRIVATE !== '1' && (!addrs.length || addrs.some(a => isBlockedIp(a.address))))
      return cb(new FetchError(`拒绝访问内网 / 保留地址（${hostname}）`));
    if (options && options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

function requestOnce(u, { maxBytes, deadline }) {
  return new Promise((resolve, reject) => {
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostAllowed(host)) return reject(new FetchError(`主机 ${host} 不在允许列表（PSD_EDITOR_MCP_FETCH_HOSTS）里`));
    if (net.isIP(host) && process.env.PSD_EDITOR_MCP_FETCH_ALLOW_PRIVATE !== '1' && isBlockedIp(host))
      return reject(new FetchError(`拒绝访问内网 / 保留地址（${host}）`));
    const mod = u.protocol === 'https:' ? https : http;
    const left = deadline - Date.now();
    if (left <= 0) return reject(new FetchError(`下载超时（${TIMEOUT_MS} ms）`));
    const req = mod.request(u, { method: 'GET', lookup: guardedLookup, headers: { 'user-agent': 'PSD Editor-MCP/1', accept: '*/*' }, timeout: left }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); req.destroy(); return resolve({ redirect: new URL(res.headers.location, u) }); }
      if (status < 200 || status >= 300) { res.resume(); req.destroy(); return reject(new FetchError(`下载失败：HTTP ${status}`)); }
      const len = +res.headers['content-length'] || 0;
      if (len > maxBytes) { req.destroy(); return reject(new FetchError(`文件 ${Math.round(len / 1048576)} MB 超过上限 ${Math.round(maxBytes / 1048576)} MB`)); }
      const chunks = []; let got = 0;
      res.on('data', c => {
        got += c.length;
        if (got > maxBytes) { req.destroy(new FetchError(`文件超过上限 ${Math.round(maxBytes / 1048576)} MB`)); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        const cd = res.headers['content-disposition'] || '';
        const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
        let filename;
        try { filename = decodeURIComponent(m ? m[1] : (u.pathname.split('/').pop() || 'download')); } catch { filename = 'download'; }
        resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '', filename });
      });
      res.on('error', e => reject(e instanceof FetchError ? e : new FetchError('下载失败：' + e.message)));
    });
    req.on('timeout', () => req.destroy(new FetchError(`下载超时（${TIMEOUT_MS} ms）`)));
    req.on('error', e => reject(e instanceof FetchError ? e : new FetchError('下载失败：' + (e && e.message || e))));
    req.end();
  });
}


export async function safeFetch(url, { maxBytes = MAX_BYTES } = {}) {
  if ((process.env.PSD_EDITOR_MCP_FETCH || '').toLowerCase() === 'off') throw new FetchError('本部署关闭了按 URL 取文件（PSD_EDITOR_MCP_FETCH=off），请改用 base64 或 POST /mcp/upload');
  let u;
  try { u = new URL(String(url)); } catch { throw new FetchError(`不是合法 URL：${String(url).slice(0, 80)}`); }
  const deadline = Date.now() + TIMEOUT_MS;
  for (let hop = 0; hop <= 3; hop++) {
    if (!['http:', 'https:'].includes(u.protocol)) throw new FetchError(`只允许 http / https 链接，收到 ${u.protocol}`);
    const r = await requestOnce(u, { maxBytes: Math.min(maxBytes, MAX_BYTES), deadline });
    if (r.redirect) { u = r.redirect; continue; }
    return r;
  }
  throw new FetchError('重定向次数过多');
}
