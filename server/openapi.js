





import { ENDPOINTS } from './entitlements.js';
import { VERSION } from './version.js';
import { buildCatalog } from './catalog.js';

const TYPE_MAP = { integer: { type: 'integer' }, number: { type: 'number' }, string: { type: 'string' }, boolean: { type: 'boolean' },
  object: { type: 'object' }, array: { type: 'array' } };

function fieldSchema(f) {
  const types = String(f.type || 'string').split('|').map(t => t.trim().replace(/\[\]$/, '[]'));
  const one = t => t.endsWith('[]') ? { type: 'array', items: TYPE_MAP[t.slice(0, -2)] || {} } : (TYPE_MAP[t] || {});
  const s = types.length > 1 ? { anyOf: types.map(one) } : { ...one(types[0]) };
  if (f.desc) s.description = f.desc;
  if (f.enum) s.enum = f.enum;
  if (f.default !== undefined) s.default = f.default;
  return s;
}

function opSchema(o) {
  const props = { op: { type: 'string', const: o.op } };
  const req = ['op'];
  for (const f of o.fields || []) { props[f.name] = fieldSchema(f); if (f.required) req.push(f.name); }
  return { title: o.op, description: `${o.summary}${o.notes ? '\n\n' + o.notes : ''}${o.aliasOf ? `\n\n（${o.aliasOf} 的别名）` : ''}`,
    type: 'object', properties: props, required: req, additionalProperties: false, ...(o.example ? { examples: [o.example] } : {}) };
}

const json = (schema, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const bin = (types, description) => ({ description, content: Object.fromEntries(types.map(t => [t, { schema: { type: 'string', format: 'binary' } }])) });
const err = { $ref: '#/components/responses/Error' };
const errs = { 400: err, 401: err, 413: err, 422: err, 429: err };
const multipart = (props, required = ['psd']) => ({ required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: props, required } } } });
const PSD = { type: 'string', format: 'binary', description: 'PSD / PSB 文件' };
const docMeta = { 'X-Doc-Meta': { description: '元数据 JSON（非 ASCII 字符按 \\uXXXX 转义）', schema: { type: 'string' } } };

let CACHE = null;
export function buildOpenApi() {
  if (CACHE) return CACHE;
  const cat = buildCatalog();
  const opSchemas = {};
  for (const o of cat.ops) opSchemas['Op_' + o.op] = opSchema(o);
  const secured = [{ ApiKey: [] }, { Bearer: [] }];

  const paths = {
    '/health': { get: { tags: ['系统'], summary: '存活 + 能力位', security: [], responses: { 200: json({ type: 'object' }) } } },
    '/api/catalog': { get: { tags: ['系统'], summary: '能力目录：全部 op（含参数 schema 与示例）/ 滤镜 / 调整 / 图层样式 / 混合模式 / 新建预设', security: [], responses: { 200: json({ type: 'object' }) } } },
    '/openapi.json': { get: { tags: ['系统'], summary: '本文档', security: [], responses: { 200: json({ type: 'object' }) } } },
    '/api/session': { post: { tags: ['系统'], summary: '签发编辑器会话（Bearer token）', security: [], responses: { 200: json({ type: 'object', properties: { token: { type: 'string' }, sid: { type: 'string' }, expiresAt: { type: 'integer' } } }) } } },
    '/api/profiles': { get: { tags: ['渲染'], summary: '可用 ICC 配置文件', responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/psd/info': { post: { tags: ['渲染'], summary: '智能对象结构（换图用）', requestBody: multipart({ psd: PSD }), responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/render': { post: { tags: ['渲染'], summary: '换智能对象图并渲染（png/jpg/tiff/webp/psd，RGB/CMYK+ICC）',
      requestBody: multipart({ psd: PSD, image: { type: 'array', items: { type: 'string', format: 'binary' } }, icc: { type: 'string', format: 'binary' },
        spec: { type: 'string', description: 'JSON：{ replacements:[{ target, fit, mesh }], output:{ format, colorMode, icc, quality, maxSize, dpi, background }, render:{ supersample, subdiv } }' } }),
      responses: { 200: { ...bin(['image/png', 'image/jpeg', 'image/tiff', 'image/webp', 'image/vnd.adobe.photoshop'], '渲染结果'), headers: { 'X-Render-Meta': { schema: { type: 'string' } } } }, ...errs } } },
    '/api/doc/new': { post: { tags: ['文档'], summary: '新建空白 PSD', requestBody: { required: true, content: { 'application/json': { schema: {
      type: 'object', properties: { width: { type: 'integer' }, height: { type: 'integer' }, preset: { type: 'string', description: '预设名（见 /api/catalog 的 newDocument.presets）' },
        resolution: { type: 'number' }, mode: { type: 'string', enum: ['rgb', 'gray', 'cmyk'] }, depth: { type: 'integer', enum: [8, 16] },
        background: { type: 'string', enum: ['white', 'black', 'transparent', 'color'] }, backgroundColor: { type: 'string' }, name: { type: 'string' }, layerName: { type: 'string' } } },
      examples: { preset: { value: { preset: '电商主图' } }, custom: { value: { width: 1920, height: 1080, background: 'transparent' } } } } } },
      responses: { 200: { ...bin(['image/vnd.adobe.photoshop'], 'PSD 字节'), headers: docMeta }, ...errs } } },
    '/api/doc/inspect': { post: { tags: ['文档'], summary: '图层树 / 类型 / 蒙版·样式开关 / 文字 / 智能对象 / 图像资源（纯 JSON，不解像素）', requestBody: multipart({ psd: PSD }), responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/doc/artboards': { post: { tags: ['文档'], summary: '画板清单', requestBody: multipart({ psd: PSD }), responses: { 200: json({ type: 'object', properties: { artboards: { type: 'array', items: { type: 'object' } }, count: { type: 'integer' } } }), ...errs } } },
    '/api/doc/layer-preview': { post: { tags: ['文档'], summary: '单层 PNG', requestBody: multipart({ psd: PSD, layerIndex: { type: 'integer' }, applyMask: { type: 'string' }, maxSize: { type: 'integer' } }, ['psd', 'layerIndex']), responses: { 200: { ...bin(['image/png'], '单层 PNG'), headers: docMeta }, ...errs } } },
    '/api/doc/composite': { post: { tags: ['文档'], summary: '文件末尾的合成图快照 → PNG/JPEG（不重新合成）', requestBody: multipart({ psd: PSD, format: { type: 'string', enum: ['png', 'jpg'] }, quality: { type: 'integer' }, maxSize: { type: 'integer' } }), responses: { 200: { ...bin(['image/png', 'image/jpeg'], '合成图'), headers: docMeta }, ...errs } } },
    '/api/doc/render': { post: { tags: ['文档'], summary: '按图层重新合成 → 位图（可只出一块画板 / 一个区域 / 临时隐藏若干层）',
      requestBody: multipart({ psd: PSD, artboard: { type: 'string', description: '画板组头 index 或画板名' }, region: { type: 'string', description: 'JSON { x, y, width, height }' },
        hide: { type: 'string', description: 'JSON [layerIndex…]' }, format: { type: 'string', enum: ['png', 'jpg', 'webp', 'tiff'] }, quality: { type: 'integer' }, maxSize: { type: 'integer' }, background: { type: 'string' } }),
      responses: { 200: { ...bin(['image/png', 'image/jpeg', 'image/webp', 'image/tiff'], '位图'), headers: docMeta }, ...errs } } },
    '/api/doc/export-artboards': { post: { tags: ['文档'], summary: '每块画板一张图，打成 zip', requestBody: multipart({ psd: PSD, format: { type: 'string', enum: ['png', 'jpg', 'webp'] }, artboards: { type: 'string', description: 'JSON [index 或名字…]' }, quality: { type: 'integer' }, maxSize: { type: 'integer' } }), responses: { 200: { ...bin(['application/zip'], 'zip'), headers: docMeta }, ...errs } } },
    '/api/doc/patch': { post: { tags: ['文档'], summary: '（旧）改图层名 / 可见 / 不透明度 / 混合模式；新代码请用 /api/doc/edit', deprecated: true, requestBody: multipart({ psd: PSD, ops: { type: 'string' } }), responses: { 200: bin(['image/vnd.adobe.photoshop'], 'PSD'), ...errs } } },
    '/api/doc/validate': { post: { tags: ['文档'], summary: '体检：lint + 字节级往返自检', requestBody: multipart({ psd: PSD }), responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/doc/edit': { post: { tags: ['编辑'], summary: '统一编辑端点：multipart = 文件模式（psd + ops → 新 PSD / 位图）；application/json = 片段模式（{ fragment, edit }）',
      requestBody: { required: true, content: {
        'multipart/form-data': { schema: { type: 'object', required: ['psd', 'ops'], properties: {
          psd: PSD, ops: { type: 'string', description: 'JSON 数组，元素见 components.schemas.EditOp' },
          image: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'op 里用 { "file":"image", "index":n } 引用' },
          icc: { type: 'string', format: 'binary' },
          font: { type: 'array', items: { type: 'string', format: 'binary' }, description: '临时字体（TTF / OTF / TTC / OTC / WOFF，最多 8 个）：只在本次请求的文字重绘里可用，不落盘' },
          output: { type: 'string', description: 'JSON：{ format:"psd"|"png"|"jpg"|"tiff"|"webp", source:"layers"|"composite", artboard?, recomposite:"auto"|true|false, renderText?:false, fontMap?:{ "PSD 里的 PostScript 名":"字体 PostScript 名 / 族名 / 字体库 id" }, colorMode, icc, quality, maxSize }' },
          render: { type: 'string', description: 'JSON：{ supersample, subdiv }（换智能对象时）' } } } },
        'application/json': { schema: { type: 'object', description: '片段模式：{ fragment, edit } | { items:[{ fragment, edit }] }' } } } },
      responses: { 200: { ...bin(['image/vnd.adobe.photoshop', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp', 'application/json'], '文件模式返回文件（元数据在 X-Doc-Meta）；片段模式返回 JSON'), headers: docMeta }, ...errs, 504: err } } },
    '/api/doc/edit/plan': { post: { tags: ['编辑'], summary: 'dry-run：判定每条 op 是否可行（含扩展 op 时在内存里真跑一遍），不产出文件', requestBody: multipart({ psd: PSD, ops: { type: 'string' } }, ['psd', 'ops']), responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/doc/edit/incremental': { post: { tags: ['编辑'], summary: '增量编辑：只传要改的字节片段 + 校验和，返回新片段，客户端本地拼回', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fragments', 'ops'], properties: { doc: { type: 'object' }, fragments: { type: 'array', items: { type: 'object' } }, ops: { type: 'array', items: { type: 'object' } } } } } } }, responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/so/resolve': { post: { tags: ['智能对象片段'], summary: '放置块片段 → 网格结构（?filters=1 顺带智能滤镜）', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Fragment' } } } }, responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/so/writeback': { post: { tags: ['智能对象片段'], summary: '编辑后的放置网格 → 新放置块字节', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { fragment: { $ref: '#/components/schemas/Fragment' }, edit: { type: 'object' } } } } } }, responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/so/filters': { post: { tags: ['智能对象片段'], summary: '智能滤镜列表（只读）', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Fragment' } } } }, responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/so/filters/writeback': { post: { tags: ['智能对象片段'], summary: '改智能滤镜 → 新放置块字节', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { fragment: { $ref: '#/components/schemas/Fragment' }, edits: { type: 'object' } } } } } }, responses: { 200: json({ type: 'object' }), ...errs } } },
    '/api/fonts': {
      get: { tags: ['字体'], summary: '字体库：列出这把 API key 上传过的字体（服务端文字重绘优先用）', responses: { 200: json({ type: 'object', properties: {
        fonts: { type: 'array', items: { $ref: '#/components/schemas/UserFont' } }, usage: { type: 'object' } } }), 403: err, ...errs } },
      post: { tags: ['字体'], summary: '上传字体到字体库（TTF / OTF / TTC / OTC / WOFF；TTC 拆成单个字体；同 PostScript 名覆盖）',
        requestBody: multipart({ font: { type: 'array', items: { type: 'string', format: 'binary' } }, faces: { type: 'string', description: '只收 TTC 里的这几款（逗号分隔的 PostScript 名）' } }, ['font']),
        responses: { 201: json({ type: 'object', properties: { added: { type: 'array', items: { $ref: '#/components/schemas/UserFont' } }, skipped: { type: 'array', items: { type: 'object' } },
          errors: { type: 'array', items: { type: 'object' } }, usage: { type: 'object' } } }), 200: json({ type: 'object' }), 403: err, 413: err, 415: err, ...errs } } },
    '/api/fonts/{id}': { delete: { tags: ['字体'], summary: '从字体库删除（id 或 PostScript 名）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: json({ type: 'object', properties: { deleted: { $ref: '#/components/schemas/UserFont' } } }), 404: err, ...errs } } },
    '/api/plans': { get: { tags: ['系统'], summary: '档位说明（公开）：每档含哪些功能 / 限额 / 频率规则', security: [], responses: { 200: json({ type: 'object' }) } } },
    '/api/account': { get: { tags: ['系统'], summary: '我的档位：生效的档位、可用 / 不可用功能、限额、按功能频率的剩余次数', responses: { 200: json({ type: 'object', properties: {
      plan: { type: 'string' }, title: { type: 'string' }, limits: { type: 'object' }, rates: { type: 'object' }, features: { type: 'object', properties: { allowed: { type: 'array', items: { type: 'string' } }, denied: { type: 'array', items: { type: 'string' } } } } } }), 401: err } } },
    '/mcp/upload': { post: { tags: ['MCP'], summary: '把 PSD 直接传进 MCP 工作区 → { doc_id }', requestBody: multipart({ file: PSD, name: { type: 'string' } }, ['file']), responses: { 200: json({ type: 'object', properties: { doc_id: { type: 'string' } } }), ...errs } } },
    '/mcp/files/{token}': { get: { tags: ['MCP'], summary: 'MCP 导出产物的限时下载（token 即凭证；不带文件名时按 token 里记的原文件名）', security: [], parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: bin(['application/octet-stream'], '文件'), 404: err } } },
    '/mcp/files/{token}/{name}': { get: { tags: ['MCP'], summary: 'MCP 导出产物的限时下载（token 即凭证）', security: [], parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }, { name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: bin(['application/octet-stream'], '文件'), 404: err } } },
  };

  
  for (const e of ENDPOINTS) {
    const key = e.path.replace(/:([a-z]+)/gi, '{$1}');
    const op = paths[key] && paths[key][e.method.toLowerCase()];
    if (!op) continue;
    op['x-feature'] = e.feature;
    if (e.caps) op['x-capabilities'] = e.caps;
    op.responses[403] ||= err;
    op.responses[429] ||= err;
  }

  CACHE = {
    openapi: '3.1.0',
    info: { title: 'PSD Editor API', version: VERSION, description: 'PSD/PSB 解析、编辑、渲染与导出。MCP 接入见 /mcp，能力目录见 /api/catalog。路径里的 /api/ 也可以写成 /api/v1/（等价，响应带 X-Api-Version: v1）；每个响应都带 X-Request-Id。', 'x-api-version': 'v1' },
    servers: [{ url: '/' }],
    security: secured,
    tags: ['系统', '文档', '编辑', '渲染', '字体', '智能对象片段', 'MCP'].map(name => ({ name })),
    paths,
    components: {
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        Bearer: { type: 'http', scheme: 'bearer', description: '编辑器会话 token（POST /api/session），或直接放 API key' },
      },
      responses: { Error: json({ type: 'object', required: ['error'], properties: { error: { type: 'string' }, opIndex: { type: 'integer' }, opName: { type: 'string' }, stage: { type: 'string' },
        code: { type: 'string', description: '机器可读的原因；档位相关：feature_not_in_plan（403）· feature_disabled_for_key（403）· feature_rate_limited（429）' },
        feature: { type: 'string', description: '被拒的功能 id' }, plan: { type: 'string' }, availableIn: { type: 'array', items: { type: 'string' } },
        rule: { type: 'string' }, window: { type: 'string' }, limit: { type: 'integer' }, retryAfter: { type: 'integer' } } }, '错误（一句话 + 定位字段）') },
      schemas: {
        UserFont: { type: 'object', properties: { id: { type: 'string' }, postScriptName: { type: 'string' }, family: { type: 'string' }, style: { type: 'string' },
          fullName: { type: 'string' }, size: { type: 'integer' }, originalName: { type: 'string', nullable: true }, uploadedAt: { type: 'string', format: 'date-time' } } },
        EditOp: { oneOf: Object.keys(opSchemas).map(k => ({ $ref: '#/components/schemas/' + k })), discriminator: { propertyName: 'op' } },
        Fragment: { type: 'object', description: '智能对象放置块片段', properties: { layerName: { type: 'string' }, bounds: { type: 'object' }, kind: { type: 'string' }, psb: { type: 'boolean' }, blocks: { type: 'array', items: { type: 'object', properties: { key: { type: 'string', enum: ['SoLd', 'PlLd', 'SoLE'] }, data: { type: 'string', contentEncoding: 'base64' } } } } } },
        Selection: { description: '选区（文档坐标）', oneOf: [
          { type: 'object', properties: { type: { enum: ['rect', 'ellipse'] }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, feather: { type: 'number' }, mode: { enum: ['replace', 'add', 'subtract', 'intersect', 'xor'] } }, required: ['x', 'y', 'width', 'height'] },
          { type: 'object', properties: { type: { const: 'polygon' }, points: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } }, feather: { type: 'number' } }, required: ['points'] },
          { type: 'object', properties: { type: { const: 'all' } } },
          { type: 'array', items: { type: 'object' } }] },
        ...opSchemas,
      },
    },
  };
  return CACHE;
}
