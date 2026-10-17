



































import express from 'express';
import { VERSION } from './version.js';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { renderPsd, inspectPsd, getBackend, backendName } from './pipeline.js';
import { listProfiles } from './icc.js';
import { FIT_MODES, FIT_LABELS } from './private/index.js';
import { requireAuth, heavy, issueSession, loadApiKeys, apiKeyCount, AUTH_OFF, authenticate } from './auth.js';
import { soRouter } from './so-api.js';
import { docRouter } from './doc-api.js';
import { engineRouter, engineAvailable } from './engine.js';
import { failJson } from './http-error.js';
import { docExtraRouter } from './doc-extra-api.js';
import { buildCatalog, checkCatalog } from './catalog.js';
import { buildOpenApi } from './openapi.js';
import { mcpRouter } from './mcp.js';
import { EXT_OPS } from './server-ops.js';
import { workspaceStats } from './workspace.js';
import { fontStatus } from './text-render.js';
import { fontsRouter } from './fonts-api.js';
import { gateEndpoint, accountInfo, plansInfo, addFeatureProvider, planConfig, planConfigError, EntitlementError, sendEntitlementError } from './entitlements.js';
import { MCP_TOOL_FEATURES } from './mcp.js';
import { requestContext, securityHeaders, apiVersionAlias, rejectWhileStopping, startServer, API_VERSION, STATE_DIR } from './runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8787;
const MAX_MB = +(process.env.MAX_UPLOAD_MB || 200);
const DEV = process.env.PSD_EDITOR_DEV !== '0';
const DIST = path.join(ROOT, 'web', 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.PSD_EDITOR_TRUST_PROXY === '1');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 32 } });
loadApiKeys();
planConfig();

addFeatureProvider(() => buildCatalog().ops.map(o => ({ id: 'op.' + o.op, group: 'op', title: o.summary ? `${o.op} · ${String(o.summary).split(/[（(：:，,]/)[0]}` : o.op })));
addFeatureProvider(() => MCP_TOOL_FEATURES());
const gate = gateEndpoint();


app.use(requestContext());
app.use(apiVersionAlias());
app.use(rejectWhileStopping());
app.use(securityHeaders({ dev: DEV }));
app.use((req, _res, next) => { req._t0 = Date.now(); next(); });


const CORS = (process.env.PSD_EDITOR_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && (CORS.includes('*') || CORS.includes(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, Authorization, Mcp-Session-Id, Mcp-Protocol-Version');
    res.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.set('Access-Control-Expose-Headers', 'X-Render-Meta, X-Doc-Meta, Content-Disposition, Mcp-Session-Id');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});


app.get('/health', async (_req, res) => {
  await getBackend('auto').catch(() => {});
  res.json({
    ok: true,
    version: VERSION,
    backend: backendName(),
    fitModes: FIT_MODES.map(m => ({ value: m, label: FIT_LABELS[m] })),
    outputs: { format: ['png', 'jpg', 'tiff', 'webp', 'psd'], colorMode: ['rgb', 'cmyk'] },
    iccProfiles: listProfiles().map(p => p.name),
    maxUploadMB: MAX_MB,
    auth: AUTH_OFF ? 'off' : (apiKeyCount() ? 'api-key' : 'api-key(未配置任何 key，对外接口不可用)'),
    editor: engineAvailable() ? 'ready' : (DEV ? 'dev' : '未构建（npm run build）'),
    
    capabilities: {
      incrementalEdit: true,              
      incrementalKinds: ['layerBlend', 'layerName', 'layerBlock', 'placedBlocks'],
      incrementalOps: ['setLayerProps', 'setVisible', 'setOpacity', 'setBlendMode', 'setClipping',
                       'renameLayer', 'setText', 'setSmartObjectDescriptor'],
      fragmentProtocol: true,             
      docEdit: true,                      
      psb: true,                          
      checksum: 'sha256',                 
      serverOps: Object.keys(EXT_OPS),    
      newDocument: true,                  
      layerRender: true,                  
      artboardExport: true,               
      plans: '/api/plans',                
      userFonts: '/api/fonts',            
      catalog: '/api/catalog',
      openapi: '/openapi.json',
      apiVersion: API_VERSION,            
      requestId: 'X-Request-Id',          
      mcp: { endpoint: '/mcp', transport: 'streamable-http', protocolVersions: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] }
    },
    workspace: workspaceStats(),
    textRender: fontStatus(),              
    plans: { ...(({ default: d, session }) => ({ default: d, session }))(planConfig()), ...(planConfigError() ? { error: planConfigError() } : {}) },
    node: process.version
  });
});


app.get('/api/catalog', (_req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(buildCatalog()); });
app.get('/openapi.json', (_req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(buildOpenApi()); });



app.use('/mcp', mcpRouter({ upload }));




app.post('/api/session', express.json({ limit: '4kb' }), (req, res) => {
  if (process.env.PSD_EDITOR_KEY === '1' && !AUTH_OFF) {
    const p = authenticate(req);
    if (!p || p.error || p.kind !== 'api') return res.status(401).json({ error: '此部署的编辑器需要 API key' });
  }
  const s = issueSession();
  res.set('Cache-Control', 'no-store');
  res.json({ token: s.token, sid: s.sid, expiresAt: s.expiresAt, engineKey: s.engineKey });
});


app.use('/api/engine', requireAuth(['session']), engineRouter());   


app.use('/api/so', requireAuth(['api', 'session']), gate, soRouter());



app.use('/api/doc', requireAuth(['api', 'session']), gate, docExtraRouter({ upload }), docRouter({ upload }));




app.use('/api/fonts', requireAuth(['api', 'session']), gate, fontsRouter({ upload }));




app.get('/api/plans', (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json(plansInfo()); });

app.get('/api/account', requireAuth(['api', 'session']), (req, res) => { res.set('Cache-Control', 'no-store'); res.json(accountInfo(req.principal)); });


app.get('/api/profiles', requireAuth(), gate, (_req, res) => {
  res.json({
    profiles: listProfiles().map(p => ({ name: p.name, sizeKB: Math.round(p.size / 1024) })),
    note: 'CMYK 输出不传 icc 时走 libvips 内置公式，颜色不准，只能预览。'
        + '出印刷文件请传目标印刷条件的 ICC（放进 server/profiles/ 按名字引用，或直接上传文件内容）。'
  });
});


app.post('/api/psd/info', requireAuth(), gate, upload.single('psd'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少 psd 文件字段（multipart 字段名 psd）' });
    res.json(await inspectPsd(req.file.buffer));
  } catch (e) { fail(res, e); }
});









app.post('/api/render', requireAuth(), gate, heavy(),
  upload.fields([{ name: 'psd', maxCount: 1 }, { name: 'image', maxCount: 16 }, { name: 'icc', maxCount: 1 }]),
  express.json({ limit: `${MAX_MB}mb` }),
  async (req, res) => {
  try {
    const spec = parseSpec(req);
    const psdBuf = req.files?.psd?.[0]?.buffer || fromBase64(spec.psdBase64);
    if (!psdBuf) return res.status(400).json({ error: '缺少 PSD（multipart 字段 psd，或 JSON 的 psdBase64）' });
    if (req.principal?.maxUploadMB && psdBuf.length > req.principal.maxUploadMB * 1024 * 1024)
      return res.status(413).json({ error: `该 API key 的上传上限为 ${req.principal.maxUploadMB} MB` });

    const images = req.files?.image || [];
    
    const reps = (spec.replacements || []).map((r, i) => {
      const buf = images[i]?.buffer || fromBase64(r.imageBase64);
      if (!buf) throw new Error(`replacements[${i}] 没有对应的图片（第 ${i + 1} 个 image 字段或 imageBase64）`);
      return { target: r.target, fit: r.fit, mesh: r.mesh, image: buf,
               sourceName: r.sourceName || images[i]?.originalname || null };
    });

    
    const output = { ...(spec.output || {}) };
    if (typeof output.icc === 'string' && /[\\/]/.test(output.icc) && req.principal?.kind !== 'anon')
      return res.status(400).json({ error: 'output.icc 只能是 server/profiles/ 下的名字，不接受路径；也可直接上传 icc 文件' });
    const iccFile = req.files?.icc?.[0]?.buffer;
    if (iccFile) output.icc = iccFile;

    const out = await renderPsd({ psd: psdBuf, replacements: reps, output, render: spec.render });
    res.set('Content-Type', out.contentType);
    res.set('X-Render-Meta', asciiJson(out.meta));
    res.set('Content-Disposition', `inline; filename="render.${extOf(out.contentType)}"`);
    res.send(out.buffer);
  } catch (e) { fail(res, e); }
});


const SITE_ROUTES = DEV
  ? { '/': 'index.html', '/editor': 'index.html' }
  : { '/': 'editor.html', '/editor': 'editor.html' };
const SITE_DIR = DEV ? path.join(ROOT, 'web') : DIST;




if (DEV) {
  const reloadClients = new Set();
  app.get('/api/dev/reload', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    if (res.flushHeaders) res.flushHeaders();
    res.write('retry: 1000\n\n');
    reloadClients.add(res);
    req.on('close', () => reloadClients.delete(res));
  });
  let pending = null;
  const ping = () => {
    clearTimeout(pending);
    pending = setTimeout(() => { for (const c of reloadClients) { try { c.write('data: reload\n\n'); } catch {} } }, 120);
  };
  for (const dir of process.env.PSD_EDITOR_DEV_RELOAD === '0' ? [] : [path.join(ROOT, 'web'), path.join(ROOT, 'core')]) {   
    try { fs.watch(dir, { recursive: true }, (_e, f) => { if (!f || /\.(js|mjs|css|html)$/i.test(f)) ping(); }); }
    catch {  }
  }
}

for (const [route, file] of Object.entries(SITE_ROUTES)) {
  app.get(route, (_req, res, next) => {
    const f = path.join(SITE_DIR, file);
    if (!fs.existsSync(f)) return next();
    res.sendFile(f, DEV ? { cacheControl: false, etag: false, lastModified: false, headers: { 'Cache-Control': 'no-store' } } : undefined);
  });
}










const GZ_CACHE = new Map();
const MIME = {
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
};
const GZIPPABLE = /\.(js|mjs|html|css|svg|json|map)$/i;
function gzipStatic(dir) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!GZIPPABLE.test(req.path)) return next();
    res.vary('Accept-Encoding');
    if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
    
    const rel = path.normalize(decodeURIComponent(req.path)).replace(/^([/\\])+/, '');
    const abs = path.join(dir, rel);
    if (!abs.startsWith(dir + path.sep)) return next();
    let hit = GZ_CACHE.get(abs);
    if (!hit) {
      let st;
      try { st = fs.statSync(abs); } catch { return next(); }
      if (!st.isFile() || st.size > 16 * 1024 * 1024) return next();
      
      
      try { hit = { body: zlib.gzipSync(fs.readFileSync(abs), { level: 9 }), type: MIME[path.extname(abs).toLowerCase()] || null }; }
      catch { return next(); }
      GZ_CACHE.set(abs, hit);
    }
    res.set('Content-Encoding', 'gzip');
    if (hit.type) res.type(hit.type);
    
    if (/\.[a-f0-9]{8,}\.(js|css)$/i.test(req.path)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.path === '/sw.js') { res.set('Cache-Control', 'no-cache'); res.set('Service-Worker-Allowed', '/'); }
    return res.send(hit.body);
  };
}

if (DEV) {
  


  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/', express.static(path.join(ROOT, 'web'), { index: false, etag: false, lastModified: false, cacheControl: false })); 
  app.use('/core', express.static(path.join(ROOT, 'core'), { etag: false, lastModified: false, cacheControl: false }));
} else if (fs.existsSync(DIST)) {
  app.use(gzipStatic(DIST));
  app.use('/', express.static(DIST, { index: false, setHeaders(res, file) {
    
    if (/\.[a-f0-9]{8,}\.(js|css)$/i.test(file))
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    if (/[\\/]sw\.js$/.test(file)) { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); }
    if (/\.webmanifest$/.test(file)) res.setHeader('Content-Type', 'application/manifest+json');
  } }));
} else {
  app.get('/', (_req, res) => res.status(503).type('text').send('站点尚未构建：在仓库根目录执行 npm ci && npm run build（或用 PSD_EDITOR_DEV=1 启动开发模式）'));
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));







app.use((err, _req, res, _next) => {
  failJson(res, err, { defaultStatus: 500, tag: 'app error', extraKeys: ['stage', 'code'] });
});

function parseSpec(req) {
  const raw = req.body?.spec;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { throw new Error('spec 不是合法 JSON'); } }
  return req.body && Object.keys(req.body).length ? req.body : {};
}
function fromBase64(s) {
  if (!s) return null;
  const b = String(s).replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(b, 'base64');
}


function asciiJson(o) {
  return JSON.stringify(o).replace(/[\u0080-\uffff]/g,
    c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
function extOf(ct) {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/tiff': 'tif', 'image/webp': 'webp',
           'image/vnd.adobe.photoshop': 'psd' }[ct] || 'bin';
}




function fail(res, e) {
  if (e && e.name === 'EntitlementError') return sendEntitlementError(res, e);
  failJson(res, e, { defaultStatus: 400, tag: 'render error', extraKeys: ['stage', 'code', 'lint'] });
}

startServer(app, PORT, async () => {
  await getBackend('auto').catch(() => {});
  console.log(`PSD Editor ${VERSION} 服务已启动  http://localhost:${PORT}（API 前缀 /api 或 /api/${API_VERSION}）`);
  console.log(`  渲染后端：${backendName()}${backendName() === 'cpu' ? '（纯 JS；默认不捆绑 native GL 加速器）' : '（headless-gl）'}`);
  console.log(`  鉴权：${AUTH_OFF ? '关闭（PSD_EDITOR_AUTH=off，仅限本机）' : `API key ×${apiKeyCount()}${apiKeyCount() ? '' : '（未配置：对外接口 401；编辑器会话不受影响）'}`}`);
  const cc = checkCatalog();
  if (!cc.ok) console.warn(`  ⚠ server/catalog-core.js 与 core 注册表不一致：缺 ${cc.missing.join(',') || '无'}，多 ${cc.extra.join(',') || '无'}`);
  console.log(`  MCP：http://localhost:${PORT}/mcp（Streamable HTTP）· 能力目录 /api/catalog · OpenAPI /openapi.json`);
  console.log(`  前台编辑器：${DEV ? '开发模式（托管 web/ 源码 + core/）' : engineAvailable() ? 'http://localhost:' + PORT + '/' : '未构建（npm run build）'}`);
  console.log(`  状态落盘：${process.env.PSD_EDITOR_STATE === 'off' ? '关闭' : STATE_DIR}（频率计数 / 月配额每分钟落一次；MCP 工作区在正常退出时落盘）`);
});
