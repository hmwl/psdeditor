















import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const URL_ = process.env.PSD_EDITOR_MCP_URL || 'http://localhost:8787/mcp';
const KEY = process.env.PSD_EDITOR_API_KEY || '';
const MAX = (+process.env.PSD_EDITOR_MCP_STDIO_MAX_MB || 200) * 1048576;
let protocolVersion = null, sessionId = null;

const out = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const logErr = (...a) => process.stderr.write('[psd_editor-mcp] ' + a.join(' ') + '\n');

function readLocal(p) {
  const abs = path.resolve(String(p).replace(/^~(?=$|\/)/, process.env.HOME || '~'));
  const st = fs.statSync(abs);
  if (!st.isFile()) throw new Error(`不是文件：${abs}`);
  if (st.size > MAX) throw new Error(`文件 ${Math.round(st.size / 1048576)} MB 超过上限 ${MAX / 1048576} MB（PSD_EDITOR_MCP_STDIO_MAX_MB）`);
  return fs.readFileSync(abs).toString('base64');
}


function augmentTools(result) {
  for (const t of (result && result.tools) || []) {
    const p = t.inputSchema && t.inputSchema.properties; if (!p) continue;
    if (p.base64 && !p.path) p.path = { type: 'string', description: '本机文件路径（本地 stdio 代理读取后代替 base64 上传）' };
    if (p.image_base64 && !p.image_path) p.image_path = { type: 'string', description: '本机图片路径（代替 image_base64）' };
    if ((t.name === 'export_document' || t.name === 'export_artboards') && !p.save_to)
      p.save_to = { type: 'string', description: '导出后存到本机的这个路径（目录或文件名）；不给就只返回下载链接' };
  }
  return result;
}

async function post(msg) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (KEY) headers.Authorization = 'Bearer ' + KEY;
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(msg) });
  const sid = res.headers.get('mcp-session-id'); if (sid) sessionId = sid;
  if (res.status === 202 || res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new Error(`远程 MCP 返回了非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`); }
}

async function saveExport(result, dest) {
  const sc = result && result.structuredContent;
  const url = sc && sc.url; if (!url) return result;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载导出文件失败（HTTP ${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  let target = path.resolve(String(dest).replace(/^~(?=$|\/)/, process.env.HOME || '~'));
  if ((fs.existsSync(target) && fs.statSync(target).isDirectory()) || /[\\/]$/.test(dest)) { fs.mkdirSync(target, { recursive: true }); target = path.join(target, sc.filename || 'export.bin'); }
  else fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  sc.saved_to = target;
  if (Array.isArray(result.content) && result.content[0] && result.content[0].type === 'text') result.content[0].text = JSON.stringify(sc, null, 1);
  return result;
}

async function handle(msg) {
  let saveTo = null;
  if (msg && msg.method === 'initialize' && msg.params) protocolVersion = msg.params.protocolVersion || protocolVersion;
  if (msg && msg.method === 'tools/call' && msg.params && msg.params.arguments && typeof msg.params.arguments === 'object') {
    const a = msg.params.arguments;
    try {
      if (a.path != null && a.base64 == null) {
        if (msg.params.name === 'open_document' && a.name == null) a.name = path.basename(String(a.path));
        a.base64 = readLocal(a.path); delete a.path;
      }
      if (a.image_path != null && a.image_base64 == null) { a.image_base64 = readLocal(a.image_path); delete a.image_path; }
    } catch (e) {
      return msg.id == null ? null : { jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: '读本机文件失败：' + e.message }], isError: true } };
    }
    if (a.save_to != null) { saveTo = a.save_to; delete a.save_to; }
  }
  let resp = await post(msg);
  if (resp && resp.result && msg.method === 'initialize' && resp.result.protocolVersion) protocolVersion = resp.result.protocolVersion;
  if (resp && resp.result && msg.method === 'tools/list') resp.result = augmentTools(resp.result);
  if (resp && resp.result && saveTo && !resp.result.isError) {
    try { resp.result = await saveExport(resp.result, saveTo); }
    catch (e) { resp.result.content = [...(resp.result.content || []), { type: 'text', text: '（存到本机失败：' + e.message + '）' }]; }
  }
  return resp;
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let pending = 0, closed = false;
rl.on('line', async line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } }); return; }
  pending++;
  try {
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) {
      try { const r = await handle(m); if (r) out(r); }
      catch (e) { logErr(e.message); if (m && m.id != null) out({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: '连不上远程 PSD Editor MCP：' + e.message } }); }
    }
  } finally { pending--; if (closed && !pending) process.exit(0); }
});
rl.on('close', () => { closed = true; if (!pending) process.exit(0); });
logErr(`已启动，转发到 ${URL_}${KEY ? '（带 API key）' : '（未设 PSD_EDITOR_API_KEY）'}`);
