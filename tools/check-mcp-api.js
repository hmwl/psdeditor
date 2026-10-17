















import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PSD_EDITOR_PLANS_FILE = path.join(ROOT, '.no-plans-file.json');
process.env.PSD_EDITOR_STATE = 'off';

const problems = [];
const info = {};
const add = (kind, msg) => problems.push({ kind, msg });


const { MCP_TOOLS, MCP_TOOL_DEFS } = await import(path.join(ROOT, 'server', 'mcp.js'));
const mcpNames = MCP_TOOLS.map(t => t.name);
info.mcpTools = mcpNames.length;
if (MCP_TOOL_DEFS.length !== MCP_TOOLS.length) add('mcp', `MCP_TOOLS 与 MCP_TOOL_DEFS 条数不一致（${MCP_TOOLS.length} vs ${MCP_TOOL_DEFS.length}）`);
for (const t of MCP_TOOL_DEFS) {
  if (typeof t.run !== 'function') add('mcp', `MCP 工具 ${t.name} 没有 run 实现`);
  if (!t.inputSchema || t.inputSchema.type !== 'object') add('mcp', `MCP 工具 ${t.name} 缺少 object 型 inputSchema`);
}
const dupMcp = mcpNames.filter((n, i) => mcpNames.indexOf(n) !== i);
if (dupMcp.length) add('mcp', `MCP 工具重名：${[...new Set(dupMcp)].join(', ')}`);


const { buildCatalog } = await import(path.join(ROOT, 'server', 'catalog.js'));
const cat = buildCatalog();
const ops = cat.ops;
info.ops = ops.length;
info.coreOps = ops.filter(o => o.kind === 'core').length;
info.serverOps = ops.filter(o => o.kind !== 'core').length;
const opNames = ops.map(o => o.op);
const dupOps = opNames.filter((n, i) => opNames.indexOf(n) !== i);
if (dupOps.length) add('op', `catalog op 重名：${[...new Set(dupOps)].join(', ')}`);
for (const o of ops) {
  if (!o.summary) add('op', `op ${o.op} 没有 summary（文档会开天窗）`);
  if (o.aliasOf && !opNames.includes(o.aliasOf)) add('op', `op ${o.op} 声明是 ${o.aliasOf} 的别名，但目标不存在`);
}


const { listOps } = await import(path.join(ROOT, 'core', 'psd-edit.js'));
const coreImpl = new Set(listOps());
const { EXT_OPS, LEGACY_SERVER_OPS } = await import(path.join(ROOT, 'server', 'server-ops.js'));
const serverImpl = new Set([
  ...Object.keys(EXT_OPS || {}),
  ...(Array.isArray(LEGACY_SERVER_OPS) ? LEGACY_SERVER_OPS.map(o => o.op) : Object.keys(LEGACY_SERVER_OPS || {})),
]);
for (const o of ops) {
  if (o.aliasOf) continue;
  if (o.kind === 'core' && !coreImpl.has(o.op)) add('impl', `core op ${o.op} 在 catalog 里，但 core/psd-edit.js 没实现`);
  if (o.kind !== 'core' && !serverImpl.has(o.op)) add('impl', `服务端 op ${o.op} 在 catalog 里，但 server-ops.js 没实现`);
}


const openapiMod = await import(path.join(ROOT, 'server', 'openapi.js'));
const spec = typeof openapiMod.buildOpenApi === 'function' ? openapiMod.buildOpenApi()
  : (openapiMod.openapi || openapiMod.default);
const specPaths = new Set(Object.keys(spec.paths || {}));
info.openapiPaths = specPaths.size;


const routes = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'server'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8');
  const re = /\b[A-Za-z_][A-Za-z0-9_]*\.(get|post|put|delete|patch)\(\s*['"](\/[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const p = m[2].startsWith('/') ? m[2] : '/' + m[2];
    routes.add(`${m[1].toUpperCase()} ${p}`);
  }
}
info.routes = routes.size;
const norm = p => p.replace(/\{[^}]+\}/g, ':x').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':x');
const specNorm = new Set([...specPaths].map(norm));
const TOP = /^\/(api|mcp|health|openapi)/;
for (const r of routes) {
  const [method, p] = r.split(' ');
  if (method === 'GET' && (p === '/' || /\.html$/.test(p))) continue;   
  if (p.startsWith('/api/dev/')) continue;                              
  const n = norm(p);
  if (specNorm.has(n)) continue;
  
  if (!TOP.test(p)) {
    if (n === '/') continue;   
    if ([...specNorm].some(s => s.endsWith(n) && s !== n)) continue;
    add('openapi', `子路由 ${r} 在 openapi.json 里找不到对应路径`);
  } else {
    add('openapi', `真实路由 ${r} 没写进 openapi.json`);
  }
}


const summary = {
  mcpTools: info.mcpTools,
  ops: info.ops, coreOps: info.coreOps, serverOps: info.serverOps,
  openapiPaths: info.openapiPaths, routes: info.routes,
  problems: problems.length,
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, problems }, null, 2));
} else {
  console.log('MCP / API / 实现 对应性自检');
  console.log('─'.repeat(58));
  console.log(`  MCP 工具            ${info.mcpTools}`);
  console.log(`  catalog op          ${info.ops}（core ${info.coreOps} · server ${info.serverOps}）`);
  console.log(`  OpenAPI 路径        ${info.openapiPaths}`);
  console.log(`  服务端真实路由      ${info.routes}`);
  console.log('─'.repeat(58));
  if (!problems.length) console.log('  ✅ 三者完全对应');
  else {
    console.log(`  ❌ ${problems.length} 处对不上：`);
    for (const p of problems) console.log(`     [${p.kind}] ${p.msg}`);
  }
}
process.exitCode = problems.length ? 1 : 0;
