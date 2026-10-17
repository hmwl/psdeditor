












import crypto from 'node:crypto';
import { registerState } from './runtime.js';

const MAX_DOCS = +process.env.PSD_EDITOR_MCP_MAX_DOCS || 8;
const MAX_BYTES = (+process.env.PSD_EDITOR_MCP_MAX_MB || 1024) * 1024 * 1024;
const TTL_MS = (+process.env.PSD_EDITOR_MCP_TTL_MIN || 60) * 60 * 1000;
const HISTORY = Math.max(0, +(process.env.PSD_EDITOR_MCP_HISTORY ?? 5));
const FILE_TTL_MS = (+process.env.PSD_EDITOR_MCP_FILE_TTL_MIN || 30) * 60 * 1000;
const MAX_FILES_BYTES = (+process.env.PSD_EDITOR_MCP_FILES_MB || 512) * 1024 * 1024;

class WsError extends Error { constructor(m, code = 'workspace') { super(m); this.code = code; } }

const docs = new Map();      
const files = new Map();     

const newId = p => p + '_' + crypto.randomBytes(9).toString('base64url');
const docBytes = d => d.buffer.length + d.history.reduce((n, h) => n + h.buffer.length, 0);
export const totalBytes = () => { let n = 0; for (const d of docs.values()) n += docBytes(d); return n; };
const filesBytes = () => { let n = 0; for (const f of files.values()) n += f.buffer.length; return n; };

function sweep() {
  const now = Date.now();
  for (const [k, d] of docs) if (now - d.touchedAt > TTL_MS) docs.delete(k);
  for (const [k, f] of files) if (f.expires < now) files.delete(k);
}
setInterval(sweep, 60000).unref();


function makeRoom(need) {
  sweep();
  if (totalBytes() + need <= MAX_BYTES) return;
  const all = [...docs.values()].sort((a, b) => a.touchedAt - b.touchedAt);
  for (const d of all) {
    while (d.history.length && totalBytes() + need > MAX_BYTES) d.history.shift();
    if (totalBytes() + need <= MAX_BYTES) return;
  }
  throw new WsError(`工作区已满（上限 ${Math.round(MAX_BYTES / 1048576)} MB，PSD_EDITOR_MCP_MAX_MB）：先 close_document 关掉不用的文档`, 'full');
}

export function createDoc(owner, name, buffer, label = '打开', session = null) {
  sweep();
  const mine = [...docs.values()].filter(d => d.owner === owner);
  if (mine.length >= MAX_DOCS) throw new WsError(`每个凭证最多同时打开 ${MAX_DOCS} 份文档（PSD_EDITOR_MCP_MAX_DOCS）：先 close_document`, 'full');
  makeRoom(buffer.length);
  const d = { id: newId('doc'), owner, session: session ? String(session).slice(0, 128) : null, name: String(name || '未标题.psd').slice(0, 200), buffer, history: [], version: 1,
    createdAt: Date.now(), touchedAt: Date.now(), log: [{ version: 1, label, at: Date.now() }] };
  docs.set(d.id, d);
  return d;
}

export function getDoc(owner, id) {
  sweep();
  const d = docs.get(String(id || ''));
  if (!d || d.owner !== owner) throw new WsError(`找不到文档 ${JSON.stringify(id)}（可能已过期 / 已关闭 / 不属于当前凭证）；用 list_documents 查看`, 'not_found');
  d.touchedAt = Date.now();
  return d;
}

export function listDocs(owner) {
  sweep();
  return [...docs.values()].filter(d => d.owner === owner).map(d => ({
    doc_id: d.id, name: d.name, version: d.version, bytes: d.buffer.length, undo_available: d.history.length,
    created_at: new Date(d.createdAt).toISOString(), idle_seconds: Math.round((Date.now() - d.touchedAt) / 1000),
    expires_in_seconds: Math.max(0, Math.round((TTL_MS - (Date.now() - d.touchedAt)) / 1000)),
  }));
}


export function commitDoc(d, buffer, label) {
  if (docs.get(d.id) !== d) throw new WsError('文档在编辑期间被关闭或已过期，这次改动没有保存', 'not_found');
  makeRoom(buffer.length);
  if (HISTORY > 0) { d.history.push({ buffer: d.buffer, label: d.log[d.log.length - 1]?.label, version: d.version }); while (d.history.length > HISTORY) d.history.shift(); }
  d.buffer = buffer; d.version++; d.touchedAt = Date.now();
  d.log.push({ version: d.version, label: String(label || '编辑').slice(0, 200), at: Date.now() });
  if (d.log.length > 50) d.log.splice(0, d.log.length - 50);
  return d;
}

export function undoDoc(d, steps = 1) {
  let n = 0;
  while (n < steps && d.history.length) { const h = d.history.pop(); d.buffer = h.buffer; n++; }
  if (!n) throw new WsError('没有可撤销的版本（历史为空或已被清理）', 'empty');
  d.version++; d.touchedAt = Date.now();
  d.log.push({ version: d.version, label: `撤销 ${n} 步`, at: Date.now() });
  return n;
}

export function closeDoc(owner, id) { getDoc(owner, id); docs.delete(id); }

export function closeSession(owner, session) {
  if (!session) return 0;
  let n = 0;
  for (const [k, d] of docs) if (d.owner === owner && d.session === session) { docs.delete(k); n++; }
  return n;
}



export function putFile(owner, name, contentType, buffer) {
  sweep();
  if (buffer.length > MAX_FILES_BYTES) throw new WsError(`导出文件 ${Math.round(buffer.length / 1048576)} MB 超过下载区上限 ${Math.round(MAX_FILES_BYTES / 1048576)} MB（PSD_EDITOR_MCP_FILES_MB）`, 'full');
  while (filesBytes() + buffer.length > MAX_FILES_BYTES && files.size) {
    const oldest = [...files.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
    files.delete(oldest[0]);
  }
  const token = crypto.randomBytes(18).toString('base64url');
  files.set(token, { owner, name, contentType, buffer, expires: Date.now() + FILE_TTL_MS });
  return { token, expiresAt: new Date(Date.now() + FILE_TTL_MS).toISOString(), ttlSeconds: Math.round(FILE_TTL_MS / 1000) };
}
export function takeFile(token) {
  sweep();
  return files.get(String(token || '')) || null;
}


registerState('mcp-workspace', {
  interval: false, consume: true,
  dump: () => (docs.size || files.size) ? {
    docs: [...docs.values()].map(d => ({ ...d, buffer: d.buffer, history: d.history.map(h => ({ ...h })) })),
    files: [...files.entries()].map(([token, f]) => ({ token, ...f })),
  } : null,
  load: o => {
    const now = Date.now();
    for (const d of (o && o.docs) || []) {
      if (!d || !d.buffer || now - d.touchedAt > TTL_MS) continue;
      d.history = (d.history || []).filter(h => h && h.buffer);
      docs.set(d.id, d);
    }
    for (const f of (o && o.files) || []) if (f && f.buffer && f.expires > now) { const { token, ...rest } = f; files.set(token, rest); }
  },
});

export function workspaceStats() {
  return { docs: docs.size, bytes: totalBytes(), maxBytes: MAX_BYTES, files: files.size, filesBytes: filesBytes(), ttlMinutes: TTL_MS / 60000, maxDocsPerKey: MAX_DOCS, history: HISTORY };
}

export { WsError };
