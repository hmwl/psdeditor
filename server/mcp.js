

















import express from 'express';
import { VERSION } from './version.js';
import crypto from 'node:crypto';
import { parsePsdDocument, summarizeDocument } from '../core/psd-document.js';
import { requireAuth, tryAcquireHeavy, takeRate, AUTH_OFF } from './auth.js';
import { executeEdit, checkOps, statusOf } from './edit-api.js';
import { renderLayers, encodeRaster, listArtboards } from './doc-render.js';
import { newDocument } from './doc-extra-api.js';
import { buildCatalog } from './catalog.js';
import { listSmartFilters } from './edit-ops-smartfilter.js';
import { guard } from './edit-ops.js';
import { layerKind } from './ops-util.js';
import { buildZip } from './zip.js';
import { safeFetch } from './safe-fetch.js';
import { addUserFonts, listUserFonts, deleteUserFont, userFontUsage, fontOwnerOf, LIMITS as FONT_LIMITS } from './user-fonts.js';
import { forgetUserFont } from './text-render.js';
import * as WS from './workspace.js';
import { authorize, authorizeOps, allowed, gateEndpoint, accountInfo } from './entitlements.js';

const SERVER_INFO = { name: 'psd_editor', title: 'PSD Editor PSD 编辑服务', version: VERSION };
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_PIXELS = +process.env.PSD_EDITOR_DOC_MAX_PIXELS || 40e6;
const MAX_INLINE_IMAGE = 4 * 1024 * 1024;       
const INSTRUCTIONS = [
  'PSD Editor：在服务端打开、检查、编辑、渲染、导出 PSD/PSB（Photoshop 文档），产物保持 PS 可编辑（文字仍是文字、智能对象仍是智能对象）。',
  '典型流程：open_document（url / base64）或 new_document → inspect_document 看图层树（记下 index）→ edit_document 批量执行 ops → render_preview 看效果 → export_document 拿下载链接。',
  'ops 的完整参数表用 get_catalog 查（section="ops"，或 op="applyFilter" 看单条）。图层 index 底 = 0；结构性 op（新建 / 删除 / 复制图层）之后请重新 inspect 再用 index。',
  '每次 edit 都会生成新版本，可 undo。文档是临时的（闲置约 1 小时清理），重要结果及时 export。',
].join('\n');



const principalOf = req => req.principal || { id: 'anon', kind: 'anon' };

const ownerOf = req => { const p = principalOf(req); return p.keyId || p.id; };
const sessionOf = req => req.get('mcp-session-id') || null;
const MAX_UPLOAD = (+process.env.MAX_UPLOAD_MB || 200) * 1024 * 1024;

const uploadCap = req => { const k = principalOf(req).maxUploadMB; return k ? Math.min(MAX_UPLOAD, k * 1024 * 1024) : MAX_UPLOAD; };

class ToolError extends Error { constructor(m, extra) { super(m); if (extra) Object.assign(this, extra); } }

function publicBase(req) {
  if (process.env.PSD_EDITOR_PUBLIC_URL) return process.env.PSD_EDITOR_PUBLIC_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

const kindOf = l => layerKind(l);


function docSummary(buf, { limit = 400 } = {}) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const doc = parsePsdDocument(ab);
  const sum = summarizeDocument(doc);
  const boards = listArtboards(ab);
  const boardAt = new Map(boards.map(b => [b.index, b]));
  const layers = [];
  const lines = [];
  const walk = (nodes) => {
    for (const n of nodes) {
      const l = doc.layers[n.index];
      const kind = boardAt.has(n.index) ? 'artboard' : kindOf(l);
      const b = n.bounds, w = b.right - b.left, h = b.bottom - b.top;
      const item = { index: n.index, name: n.name, kind, depth: n.depth, visible: n.visible,
        ...(n.opacity !== 255 ? { opacity: Math.round(n.opacity / 2.55) } : {}),
        ...(n.blendKey && n.blendKey !== 'norm' && n.blendKey !== 'pass' ? { blend: n.blendKey.trim() } : {}),
        ...(w > 0 && h > 0 ? { bounds: { x: b.left, y: b.top, width: w, height: h } } : {}),
        ...(n.clipping ? { clipping: true } : {}), ...(n.hasMask ? { mask: true } : {}), ...(n.hasVectorMask ? { vectorMask: true } : {}),
        ...(n.text != null ? { text: n.text.length > 200 ? n.text.slice(0, 200) + '…' : n.text } : {}),
        ...(n.effects && n.effects.items && n.effects.items.length ? { effects: n.effects.items.map(e => e.label + (e.enabled ? '' : '(关)')) } : {}),
        ...(boardAt.has(n.index) ? { artboard: boardAt.get(n.index).rect } : {}) };
      layers.push(item);
      if (lines.length < limit) {
        const extra = [kind, ...(w > 0 && h > 0 ? [`${w}×${h} @${b.left},${b.top}`] : []),
          ...(item.artboard ? [`画板 ${item.artboard.w}×${item.artboard.h} @${item.artboard.x},${item.artboard.y}`] : []),
          ...(n.visible ? [] : ['隐藏']), ...(item.opacity != null ? [`不透明度 ${item.opacity}%`] : []),
          ...(item.blend ? [`混合 ${item.blend}`] : []), ...(item.text != null ? [`文字「${item.text.slice(0, 40)}」`] : [])].join(' · ');
        lines.push(`${'  '.repeat(n.depth)}[${n.index}] ${n.name}  (${extra})`);
      }
      if (n.children) walk(n.children);
    }
  };
  walk(sum.layers || sum.tree || []);
  return {
    width: doc.header.width, height: doc.header.height, depth: doc.header.depth, mode: doc.header.modeName, psb: doc.header.psb,
    layerCount: doc.layers.length, artboards: boards.map(b => ({ index: b.index, name: b.name, rect: b.rect })),
    outline: lines.join('\n') + (lines.length >= limit ? `\n…（共 ${layers.length} 条，已截断）` : ''),
    layers,
  };
}

function textResult(obj, { images = [], links = [], isError = false } = {}) {
  const content = [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1) }];
  for (const im of images) content.push({ type: 'image', data: im.data, mimeType: im.mimeType });
  for (const l of links) content.push(l);
  return { content, ...(typeof obj === 'object' && obj && !isError ? { structuredContent: obj } : {}), ...(isError ? { isError: true } : {}) };
}

function fontOwnerOrErr(req) {
  const o = fontOwnerOf(principalOf(req));
  if (!o) throw new ToolError('字体库只对 API key 开放（编辑器会话没有持久字体库）');
  return o;
}

async function withHeavy(req, fn) {
  const g = tryAcquireHeavy(principalOf(req));
  if (g.error) throw new ToolError(g.error + '（稍后重试）', { retryable: true });
  try { return await fn(); } finally { g.release(); }
}


async function loadBytes({ url, base64 }, what, cap = MAX_UPLOAD) {
  if (base64) {
    const b = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''), 'base64');
    if (!b.length) throw new ToolError(`${what} 的 base64 解不出字节`);
    if (b.length > cap) throw new ToolError(`${what}：文件 ${Math.round(b.length / 1048576)} MB 超过该凭证的上传上限 ${Math.round(cap / 1048576)} MB`);
    return { buffer: b, filename: null };
  }
  if (url) { const r = await safeFetch(url, { maxBytes: cap }); return { buffer: r.buffer, filename: r.filename }; }
  throw new ToolError(`${what}：给 url 或 base64`);
}


async function resolveOpImages(ops, cap = MAX_UPLOAD) {
  const out = [];
  for (const [i, op] of ops.entries()) {
    const img = op && op.image;
    if (img && typeof img === 'object' && img.url) {
      const r = await safeFetch(img.url, { maxBytes: cap });
      out.push({ ...op, image: 'data:application/octet-stream;base64,' + r.buffer.toString('base64'), sourceName: op.sourceName || r.filename });
    } else if (img && typeof img === 'object' && (img.doc_id || img.docId)) {
      throw new ToolError(`ops[${i}].image 不支持引用 doc_id；请先 export_document 再用 url`);
    } else out.push(op);
  }
  return out;
}

const PSD_MAGIC = b => b.length > 4 && b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53;



const S = {
  docId: { type: 'string', description: 'open_document / new_document 返回的 doc_id' },
  artboard: { description: '只出某块画板：画板组头的图层 index，或画板名', anyOf: [{ type: 'integer' }, { type: 'string' }] },
  maxSize: { type: 'integer', minimum: 16, maximum: 8192, description: '长边上限（像素），默认 1024' },
};

const TOOLS = [
  {
    name: 'get_catalog',
    title: '能力目录',
    description: '查询本服务支持的全部编辑 op（含参数 schema 与示例）、滤镜、破坏性调整、调整图层、图层样式、混合模式、新建文档预设。先用它弄清 ops 怎么写。',
    inputSchema: { type: 'object', properties: {
      section: { type: 'string', enum: ['summary', 'ops', 'filters', 'adjustments', 'adjustmentLayerKinds', 'layerEffects', 'blendModes', 'newDocument', 'selection'], description: '默认 summary（每个 op 一行说明）' },
      op: { type: 'string', description: '只看这一条 op 的完整 schema' },
      category: { type: 'string', description: 'section=ops 时按类别过滤：pixels / geometry / document / structure / text / mask / vector / effects / adjustment / smartObject / artboard / layer / flags / resource' },
    } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (_req, a) => {
      const c = buildCatalog();
      if (a.op) {
        const o = c.ops.find(x => x.op === a.op || (x.aliases || []).includes(a.op));
        if (!o) throw new ToolError(`没有名为 ${a.op} 的 op；可用：${c.opNames.join(' ')}`);
        return textResult(o);
      }
      const sec = a.section || 'summary';
      if (sec === 'summary') return textResult({
        ops: c.ops.map(o => `${o.op} [${o.kind}/${o.category}]${o.aliasOf ? ` = ${o.aliasOf} 的别名` : ''}：${o.summary}`).join('\n'),
        filters: c.filters.map(f => f.kind).join(' '),
        adjustments: Object.keys(c.adjustments).join(' '),
        hint: '用 get_catalog({op:"名字"}) 看单条参数；section="filters" 看滤镜参数表',
      });
      if (sec === 'ops') return textResult({ ops: c.ops.filter(o => !a.category || o.category === a.category) });
      if (!(sec in c)) throw new ToolError(`未知 section ${sec}`);
      return textResult({ [sec]: c[sec] });
    },
  },
  {
    name: 'new_document',
    title: '新建文档',
    description: '新建空白 PSD（同编辑器「文件 › 新建」）。可给 preset（如「默认 Photoshop 大小」「电商主图」，见 get_catalog section=newDocument）或 width/height。',
    inputSchema: { type: 'object', properties: {
      width: { type: 'integer', minimum: 1, maximum: 30000 }, height: { type: 'integer', minimum: 1, maximum: 30000 },
      preset: { type: 'string' }, resolution: { type: 'number', description: '像素/英寸，默认 72' },
      mode: { type: 'string', enum: ['rgb', 'gray', 'cmyk'] }, depth: { type: 'integer', enum: [8, 16] },
      background: { type: 'string', enum: ['white', 'black', 'transparent', 'color'] }, backgroundColor: { type: 'string', description: '#rrggbb（background=color 时）' },
      name: { type: 'string', description: '文档名' },
    } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (req, a) => {
      const out = newDocument(a);
      const d = WS.createDoc(ownerOf(req), (a.name || '未标题-1') + '.psd', out.buffer, '新建', sessionOf(req));
      return textResult({ doc_id: d.id, name: d.name, version: d.version, ...docSummary(d.buffer) });
    },
  },
  {
    name: 'open_document',
    title: '打开文档',
    description: '把一份 PSD/PSB 放进服务端工作区，返回 doc_id 与图层大纲。来源：url（http/https 公网地址）或 base64。大文件也可以先 POST /mcp/upload。',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: 'PSD 的下载地址' }, base64: { type: 'string', description: 'PSD 字节的 base64（可带 data: 前缀）' },
      name: { type: 'string', description: '文档名（默认取 URL 里的文件名）' },
    } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (req, a) => {
      const { buffer, filename } = await loadBytes(a, 'open_document', uploadCap(req));
      if (!PSD_MAGIC(buffer)) throw new ToolError('这不是 PSD/PSB 文件（文件头不是 8BPS）');
      try { parsePsdDocument(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)); }
      catch (e) { throw new ToolError('PSD 解析失败：' + e.message); }
      const d = WS.createDoc(ownerOf(req), a.name || filename || '未标题.psd', buffer, '打开', sessionOf(req));
      return textResult({ doc_id: d.id, name: d.name, bytes: buffer.length, version: d.version, ...docSummary(d.buffer) });
    },
  },
  {
    name: 'list_documents',
    title: '工作区文档',
    description: '列出当前凭证在工作区里打开着的文档（doc_id、版本、可撤销步数、剩余存活时间）。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async req => textResult({ documents: WS.listDocs(ownerOf(req)), workspace: WS.workspaceStats() }),
  },
  {
    name: 'inspect_document',
    title: '查看图层',
    description: '文档尺寸、画板、图层大纲（缩进 = 层级，[n] 就是 ops 里用的 index；底 = 0）。detail=true 附带每层的结构化字段。',
    inputSchema: { type: 'object', properties: { doc_id: S.docId, detail: { type: 'boolean' } }, required: ['doc_id'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const s = docSummary(d.buffer);
      if (!a.detail) delete s.layers;
      return textResult({ doc_id: d.id, name: d.name, version: d.version, undo_available: d.history.length, ...s });
    },
  },
  {
    name: 'render_preview',
    title: '渲染预览',
    description: '按图层重新合成并返回预览图（可只出一块画板或一个区域）。用来确认编辑效果。',
    inputSchema: { type: 'object', properties: {
      doc_id: S.docId, artboard: S.artboard, max_size: S.maxSize,
      region: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' } }, description: '文档坐标裁剪区域' },
      format: { type: 'string', enum: ['png', 'jpeg'], description: '默认 png（保留透明）' },
      hide: { type: 'array', items: { type: 'integer' }, description: '临时隐藏这些图层再渲染（不改文档）' },
    }, required: ['doc_id'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => withHeavy(req, async () => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const img = await renderLayers(d.buffer, { artboard: a.artboard, region: a.region, hide: a.hide });
      const fmt = a.format === 'jpeg' ? 'jpg' : 'png';
      const out = await encodeRaster(img, { format: fmt, maxSize: a.max_size || 1024 });
      if (out.buffer.length > MAX_INLINE_IMAGE) throw new ToolError('预览图太大，调小 max_size 或改用 jpeg');
      return textResult({ doc_id: d.id, version: d.version, width: img.width, height: img.height, x: img.x, y: img.y,
        ...(img.artboard ? { artboard: img.artboard.name } : {}), previewBytes: out.buffer.length },
        { images: [{ data: out.buffer.toString('base64'), mimeType: out.contentType }] });
    }),
  },
  {
    name: 'render_layer',
    title: '单层预览',
    description: '只渲染一个图层的像素（不含其它层），看某层到底长什么样。',
    inputSchema: { type: 'object', properties: { doc_id: S.docId, index: { type: 'integer' }, max_size: S.maxSize }, required: ['doc_id', 'index'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => withHeavy(req, async () => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const doc = parsePsdDocument(d.buffer.buffer.slice(d.buffer.byteOffset, d.buffer.byteOffset + d.buffer.byteLength));
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= doc.layers.length) throw new ToolError(`index 越界（共 ${doc.layers.length} 层）`);
      const hide = doc.layers.map((_, i) => i).filter(i => i !== a.index && doc.layers[i].groupType !== 1 && doc.layers[i].groupType !== 2 && doc.layers[i].groupType !== 3);
      const l = doc.layers[a.index], b = l.bounds;
      if (!(b.right > b.left && b.bottom > b.top)) throw new ToolError(`图层 ${a.index} 没有像素（${kindOf(l)}）`);
      const img = await renderLayers(d.buffer, { hide, region: { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top } });
      const out = await encodeRaster(img, { format: 'png', maxSize: a.max_size || 1024 });
      return textResult({ index: a.index, name: l.unicodeName || l.name, kind: kindOf(l), bounds: { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top } },
        { images: [{ data: out.buffer.toString('base64'), mimeType: 'image/png' }] });
    }),
  },
  {
    name: 'edit_document',
    title: '编辑文档',
    description: '按顺序执行一组 ops（与 REST 的 /api/doc/edit 完全相同：改属性 / 文字 / 像素 / 滤镜 / 调整 / 画布 / 图像大小 / 旋转 / 移动 / 复制 / 蒙版 / 矢量 / 样式 / 智能对象 / 画板…）。' +
      '成功后生成新版本（可 undo），失败则文档不变。ops 写法：[{ "op":"setLayerProps", "index":3, "opacity":128 }, { "op":"applyFilter", "index":1, "filter":"gaussianBlur", "params":{"radius":4} }]；' +
      '图片参数（replaceSmartObject / replaceLayerPixels 的 image）可写 { "url": "https://…" } 或 data URL。完整参数见 get_catalog。',
    inputSchema: { type: 'object', properties: {
      doc_id: S.docId,
      ops: { type: 'array', minItems: 1, items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'], additionalProperties: true } },
      dry_run: { type: 'boolean', description: '只校验不落地（文档版本不变）' },
      label: { type: 'string', description: '这次编辑的说明（进版本日志）' },
      recomposite: { description: '合成图快照：auto（默认）/ true / false', anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['auto'] }] },
      font_map: { type: 'object', additionalProperties: { type: 'string' },
        description: '文字重绘的字体映射：{ "PSD 里的 PostScript 名": "字体库里字体的 PostScript 名 / 族名 / id" }。名字对得上时不用写（字体库按 PostScript 名自动匹配）' },
    }, required: ['doc_id', 'ops'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (req, a) => {
      WS.getDoc(ownerOf(req), a.doc_id);                 
      let ops;
      try { ops = checkOps(a.ops); } catch (e) { throw new ToolError(e.message); }
      
      const p = principalOf(req);
      authorizeOps(p, ops, { consume: !a.dry_run });
      if (a.font_map != null) authorize(p, ['fonts.map'], { consume: !a.dry_run });
      
      ops = await resolveOpImages(ops, uploadCap(req));
      return withHeavy(req, async () => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const baseVersion = d.version;
      let r;
      try { r = await executeEdit(d.buffer, ops, { recomposite: a.dry_run ? false : (a.recomposite ?? 'auto'),
        fonts: { owner: allowed(p, 'fonts.library') ? fontOwnerOf(p) : null, map: a.font_map ?? null } }); }
      catch (e) {
        throw new ToolError(e.message, { detail: { opIndex: e.opIndex, op: e.opName, stage: e.stage, code: e.code, status: statusOf(e) } });
      }
      if (d.version !== baseVersion) throw new ToolError('编辑期间文档被另一个请求改过了，请重新 inspect 后再试');
      const ops2 = r.results.map(x => ({ i: x.i, op: x.op, ...(x.alias ? { alias: x.alias } : {}), ok: x.ok !== false,
        ...(x.affected?.length ? { affected: x.affected.slice(0, 16) } : {}), ...(x.note ? { note: x.note } : {}), ...(x.meta ? { meta: x.meta } : {}) }));
      
      const warnings = r.warnings.filter(w => !/Pascal 名含非 ASCII/.test(w)).slice(0, 20);
      if (a.dry_run) return textResult({ doc_id: d.id, dry_run: true, ok: true, ops: ops2, warnings });
      WS.commitDoc(d, r.buffer, a.label || ops.map(o => o.op).join(', '));
      const s = docSummary(d.buffer, { limit: 120 });
      delete s.layers;
      return textResult({ doc_id: d.id, version: d.version, ok: true, ops: ops2, warnings,
        recomposited: r.recomposited, bytes: d.buffer.length, ...s });
      });
    },
  },
  {
    name: 'replace_smart_object',
    title: '换智能对象图片',
    description: '样机最常用的一步：把某个智能对象的内容换成一张图（按现有放置网格渲染，PS 里双击进去也是新图）。等价于 edit_document 的 replaceSmartObject op。',
    inputSchema: { type: 'object', properties: {
      doc_id: S.docId,
      target: { description: '智能对象：序号（第几个智能对象，0 起）/ 图层名 / { layerIndex }', anyOf: [{ type: 'integer' }, { type: 'string' }, { type: 'object' }] },
      image_url: { type: 'string' }, image_base64: { type: 'string' },
      fit: { type: 'string', enum: ['cover', 'contain', 'stretch', 'tile'], description: '覆盖方式，默认 cover' },
    }, required: ['doc_id'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (req, a) => {
      const image = a.image_url ? { url: a.image_url } : a.image_base64 ? a.image_base64 : null;
      if (!image) throw new ToolError('给 image_url 或 image_base64');
      return TOOL_BY_NAME.edit_document.run(req, { doc_id: a.doc_id, label: '换智能对象图片',
        ops: [{ op: 'replaceSmartObject', ...(a.target !== undefined ? { target: a.target } : {}), image, fit: { mode: a.fit || 'cover' } }] });
    },
  },
  {
    name: 'undo',
    title: '撤销',
    description: '回到上一个版本（可一次撤销多步）。',
    inputSchema: { type: 'object', properties: { doc_id: S.docId, steps: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['doc_id'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    run: async (req, a) => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const n = WS.undoDoc(d, a.steps || 1);
      return textResult({ doc_id: d.id, undone: n, version: d.version, undo_available: d.history.length });
    },
  },
  {
    name: 'export_document',
    title: '导出',
    description: '导出 PSD 或位图（png / jpg / webp / tiff；可只导出一块画板），返回限时下载链接。',
    inputSchema: { type: 'object', properties: {
      doc_id: S.docId, format: { type: 'string', enum: ['psd', 'png', 'jpg', 'webp', 'tiff'], description: '默认 psd' },
      artboard: S.artboard, max_size: { type: 'integer', minimum: 16, maximum: 30000, description: '位图长边上限（默认原尺寸）' },
      quality: { type: 'integer', minimum: 1, maximum: 100 }, filename: { type: 'string' },
    }, required: ['doc_id'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => withHeavy(req, async () => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const fmt = a.format || 'psd';
      const stem = (a.filename || d.name).replace(/\.(psd|psb|png|jpe?g|webp|tiff?)$/i, '');
      let buffer, contentType, ext, info = {};
      if (fmt === 'psd') {
        buffer = d.buffer; contentType = 'image/vnd.adobe.photoshop';
        ext = parsePsdDocument(d.buffer.buffer.slice(d.buffer.byteOffset, d.buffer.byteOffset + d.buffer.byteLength)).header.psb ? 'psb' : 'psd';
      } else {
        const img = await renderLayers(d.buffer, { artboard: a.artboard });
        const out = await encodeRaster(img, { format: fmt, quality: a.quality, maxSize: a.max_size || 0 });
        buffer = out.buffer; contentType = out.contentType; ext = out.ext; info = { width: img.width, height: img.height };
      }
      const f = WS.putFile(ownerOf(req), `${stem}.${ext}`, contentType, buffer);
      const url = `${publicBase(req)}/mcp/files/${f.token}/${encodeURIComponent(stem + '.' + ext)}`;
      return textResult({ doc_id: d.id, version: d.version, url, filename: `${stem}.${ext}`, bytes: buffer.length, contentType, expiresAt: f.expiresAt, ...info },
        { links: req._mcpVersion >= '2025-06-18' ? [{ type: 'resource_link', uri: url, name: `${stem}.${ext}`, mimeType: contentType, size: buffer.length }] : [] });
    }),
  },
  {
    name: 'export_artboards',
    title: '按画板导出',
    description: '每块画板导出一张图（PS 的「画板至文件」），打包成 zip 返回下载链接。',
    inputSchema: { type: 'object', properties: {
      doc_id: S.docId, format: { type: 'string', enum: ['png', 'jpg', 'webp'], description: '默认 png' },
      artboards: { type: 'array', items: { anyOf: [{ type: 'integer' }, { type: 'string' }] }, description: '只导出这些（index 或名字）' },
      max_size: { type: 'integer' }, quality: { type: 'integer' },
    }, required: ['doc_id'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => withHeavy(req, async () => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      let list = listArtboards(d.buffer);
      if (!list.length) throw new ToolError('这份文档里没有画板（可用 edit_document 的 createArtboard 新建）');
      if (Array.isArray(a.artboards) && a.artboards.length) list = list.filter(b => a.artboards.includes(b.index) || a.artboards.includes(b.name));
      if (!list.length) throw new ToolError('artboards 里列的画板一个都没找到');
      const files = [];
      for (const b of list) {
        const img = await renderLayers(d.buffer, { artboard: b.index });
        const out = await encodeRaster(img, { format: a.format || 'png', quality: a.quality, maxSize: a.max_size || 0 });
        files.push({ name: `${b.name}.${out.ext}`, data: out.buffer });
      }
      const zip = buildZip(files);
      const stem = d.name.replace(/\.(psd|psb)$/i, '');
      const f = WS.putFile(ownerOf(req), `${stem}-画板.zip`, 'application/zip', zip);
      const url = `${publicBase(req)}/mcp/files/${f.token}/${encodeURIComponent(stem + '-artboards.zip')}`;
      return textResult({ doc_id: d.id, url, count: files.length, files: files.map(x => ({ name: x.name, bytes: x.data.length })), expiresAt: f.expiresAt },
        { links: req._mcpVersion >= '2025-06-18' ? [{ type: 'resource_link', uri: url, name: `${stem}-artboards.zip`, mimeType: 'application/zip', size: zip.length }] : [] });
    }),
  },
  {
    name: 'validate_document',
    title: '体检',
    description: '结构体检：lintPsd + 可解析 + 字节往返自检（与编辑出口的守门同一套）。',
    inputSchema: { type: 'object', properties: { doc_id: S.docId }, required: ['doc_id'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      const g = guard(d.buffer);
      return textResult({ doc_id: d.id, ok: g.ok, lint: { ok: g.lint.ok, errors: g.lint.errors.slice(0, 20), warnings: (g.lint.warnings || []).slice(0, 20) },
        parseOk: g.parseOk, roundTripIdentical: g.roundTripIdentical, firstDiffOffset: g.firstDiffOffset, warnings: g.warnings.slice(0, 20) });
    },
  },
  {
    name: 'get_smart_filters',
    title: '智能滤镜',
    description: '查看某个智能对象上的智能滤镜列表（改它们用 edit_document 的 setSmartFilters op）。',
    inputSchema: { type: 'object', properties: { doc_id: S.docId, target: { anyOf: [{ type: 'integer' }, { type: 'string' }, { type: 'object' }], description: '智能对象序号 / 图层名 / { layerIndex }' } }, required: ['doc_id'] },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => {
      const d = WS.getDoc(ownerOf(req), a.doc_id);
      try { return textResult(listSmartFilters(d.buffer, a.target)); } catch (e) { throw new ToolError(e.message); }
    },
  },
  {
    name: 'get_account',
    title: '我的档位',
    description: '当前凭证的档位（基础 / 高级…）、能用哪些功能、rpm / 并发 / 上传上限，以及按功能频率限制的剩余次数。某个工具或 op 报「不在档位」时用它确认。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async req => {
      const info = accountInfo(principalOf(req));
      
      return textResult({ ...info, features: { allowedCount: info.features.allowed.length, denied: info.features.denied } });
    },
  },
  {
    name: 'list_fonts',
    features: ['fonts.library'],
    title: '字体库',
    description: '列出这把 API key 上传过的字体（服务端文字重绘时按 PostScript 名优先匹配）。PSD 里缺的字体可以用 upload_font 补上。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async req => { const o = fontOwnerOrErr(req); return textResult({ fonts: listUserFonts(o), usage: userFontUsage(o) }); },
  },
  {
    name: 'upload_font',
    features: ['fonts.library'],
    title: '上传字体',
    description: '把字体文件（TTF / OTF / TTC / OTC / WOFF）存进这把 key 的字体库，之后 edit_document 改文字时服务端用它重绘，不再用替代字体。' +
      'TTC 会拆成多个字体。同 PostScript 名的旧字体会被替换。字体授权由上传方负责。',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: '字体文件下载地址（http/https）' }, base64: { type: 'string', description: '字体字节的 base64' },
      filename: { type: 'string', description: '原始文件名（只用于展示）' },
      faces: { type: 'array', items: { type: 'string' }, description: 'TTC / OTC 只收其中几款（PostScript 名）；不写收全部' },
    } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: async (req, a) => {
      const o = fontOwnerOrErr(req);
      const { buffer, filename } = await loadBytes(a, '字体', FONT_LIMITS.fileMB * 1024 * 1024);
      let x;
      try { x = addUserFonts(o, buffer, a.filename || filename || '', { faces: a.faces }); } catch (e) { throw new ToolError(e.message); }
      for (const s2 of x.skipped) if (/替换/.test(s2.reason || '')) forgetUserFont(s2.id);
      return textResult({ ...x, usage: userFontUsage(o) });
    },
  },
  {
    name: 'delete_font',
    features: ['fonts.library'],
    title: '删除字体',
    description: '从字体库删掉一款字体（按 list_fonts 给的 id 或 PostScript 名）。',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: '字体 id 或 PostScript 名' } }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => {
      const o = fontOwnerOrErr(req);
      let m;
      try { m = deleteUserFont(o, String(a.id)); } catch (e) { throw new ToolError(e.message); }
      forgetUserFont(m.id);
      return textResult({ deleted: m, usage: userFontUsage(o) });
    },
  },
  {
    name: 'close_document',
    title: '关闭文档',
    description: '从工作区移除文档（释放空间）。没导出的改动会丢失。',
    inputSchema: { type: 'object', properties: { doc_id: S.docId }, required: ['doc_id'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (req, a) => { WS.closeDoc(ownerOf(req), a.doc_id); return textResult({ closed: a.doc_id }); },
  },
];
const TOOL_BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

const toolFeatures = t => ['mcp.tool.' + t.name, ...(t.features || [])];

export const MCP_TOOL_FEATURES = () => TOOLS.map(t => ({ id: 'mcp.tool.' + t.name, group: 'mcp', title: 'MCP · ' + (t.title || t.name) }));



function listResources(req) {
  const list = [{ uri: 'psd_editor://catalog', name: 'catalog', title: '能力目录（全部 op / 滤镜 / 调整 / 预设）', mimeType: 'application/json' }];
  for (const d of WS.listDocs(ownerOf(req))) {
    list.push({ uri: `psd_editor://documents/${d.doc_id}/summary`, name: `${d.name} 图层大纲`, mimeType: 'application/json' });
    list.push({ uri: `psd_editor://documents/${d.doc_id}/preview`, name: `${d.name} 预览`, mimeType: 'image/png' });
  }
  return list;
}
async function readResource(req, uri) {
  
  const feat = uri === 'psd_editor://catalog' ? 'mcp.tool.get_catalog' : /\/preview$/.test(uri) ? 'mcp.tool.render_preview' : 'mcp.tool.inspect_document';
  authorize(principalOf(req), [feat]);
  if (uri === 'psd_editor://catalog') return [{ uri, mimeType: 'application/json', text: JSON.stringify(buildCatalog()) }];
  const m = /^psd_editor:\/\/documents\/([^/]+)\/(summary|preview)$/.exec(uri);
  if (!m) throw rpcError(-32002, `资源不存在：${uri}`);
  const d = WS.getDoc(ownerOf(req), m[1]);
  if (m[2] === 'summary') return [{ uri, mimeType: 'application/json', text: JSON.stringify({ doc_id: d.id, name: d.name, version: d.version, ...docSummary(d.buffer) }) }];
  return withHeavy(req, async () => {
    const img = await renderLayers(d.buffer);
    const out = await encodeRaster(img, { format: 'png', maxSize: 1024 });
    return [{ uri, mimeType: 'image/png', blob: out.buffer.toString('base64') }];
  });
}

const PROMPTS = [
  { name: 'mockup-replace', title: '样机换图', description: '把一张图换进 PSD 样机的智能对象，并导出效果图',
    arguments: [{ name: 'psd_url', description: '样机 PSD 地址', required: true }, { name: 'image_url', description: '要换进去的图', required: true }] },
  { name: 'batch-resize', title: '改尺寸出图', description: '把 PSD 改成指定尺寸（图像大小或画布大小）并导出',
    arguments: [{ name: 'psd_url', required: true }, { name: 'width', required: true }, { name: 'height', required: false }] },
];
function getPrompt(name, args = {}) {
  if (name === 'mockup-replace') return { description: '样机换图', messages: [{ role: 'user', content: { type: 'text', text:
    `用 PSD Editor 工具：1) open_document(url="${args.psd_url || ''}")；2) 在大纲里找到要换图的智能对象（kind=smartObject）；` +
    `3) replace_smart_object(doc_id, target=那一层的名字或 {layerIndex}, image_url="${args.image_url || ''}")；4) render_preview 确认；5) export_document(format="png") 与 export_document(format="psd") 给我两个链接。` } }] };
  if (name === 'batch-resize') return { description: '改尺寸出图', messages: [{ role: 'user', content: { type: 'text', text:
    `用 PSD Editor 工具打开 ${args.psd_url || ''}，用 edit_document 的 resizeImage（等比，width=${args.width || ''}${args.height ? `，height=${args.height}` : ''}）改尺寸，render_preview 确认后 export_document 导出 png 与 psd。` } }] };
  throw rpcError(-32602, `没有名为 ${name} 的 prompt`);
}



function rpcError(code, message, data) { const e = new Error(message); e.rpc = { code, message, ...(data ? { data } : {}) }; return e; }

async function dispatch(req, msg) {
  const { method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const want = params.protocolVersion;
      const version = VERSIONS.includes(want) ? want : VERSIONS[0];
      req._mcpVersion = version;
      return {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false }, logging: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    }
    case 'ping': return {};
    case 'logging/setLevel': return {};
    case 'tools/list':
      
      return { tools: TOOLS.filter(t => toolFeatures(t).every(id => allowed(principalOf(req), id))).map(({ run, features, ...t }) => (req._mcpVersion < '2025-06-18' ? { name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations } : t)) };
    case 'tools/call': {
      const t = TOOL_BY_NAME[params.name];
      if (!t) throw rpcError(-32602, `未知工具 ${params.name}；可用：${TOOLS.map(x => x.name).join(' ')}`);
      const args = params.arguments || {};
      if (typeof args !== 'object' || Array.isArray(args)) throw rpcError(-32602, 'arguments 必须是对象');
      for (const k of t.inputSchema.required || []) if (args[k] === undefined) return textResult(`缺少必填参数 ${k}`, { isError: true });
      try {
        authorize(principalOf(req), toolFeatures(t));
        const r = await t.run(req, args);
        return r;
      } catch (e) {
        if (e.rpc) throw e;
        if (e && e.name === 'EntitlementError') {
          const { code, feature, plan, availableIn, rule, window, limit, retryAfter } = e;
          return textResult(`${e.message}\n${JSON.stringify({ code, feature, plan, availableIn, rule, window, limit, retryAfter })}`, { isError: true });
        }
        const msg = e instanceof ToolError || e instanceof WS.WsError || e.code === 'fetch' || e.name === 'EditOpError' || (e.status && e.status < 500)
          ? e.message : '服务端内部错误：' + (e && e.message || e);
        if (!(e instanceof ToolError) && !(e instanceof WS.WsError) && !(e.status && e.status < 500) && e.code !== 'fetch') console.error('[mcp]', params.name, e);
        const detail = e.detail || (e.opIndex !== undefined ? { opIndex: e.opIndex, op: e.opName, stage: e.stage } : undefined);
        return textResult(detail ? `${msg}\n${JSON.stringify(detail)}` : msg, { isError: true });
      }
    }
    case 'resources/list': return { resources: listResources(req) };
    case 'resources/templates/list': return { resourceTemplates: [
      { uriTemplate: 'psd_editor://documents/{doc_id}/summary', name: '文档图层大纲', mimeType: 'application/json' },
      { uriTemplate: 'psd_editor://documents/{doc_id}/preview', name: '文档预览', mimeType: 'image/png' }] };
    case 'resources/read': {
      try { return { contents: await readResource(req, String(params.uri || '')) }; }
      catch (e) {
        if (e.rpc) throw e;
        if (e.name === 'EntitlementError') throw rpcError(-32003, e.message, { code: e.code, feature: e.feature, plan: e.plan, availableIn: e.availableIn, retryAfter: e.retryAfter });
        throw rpcError(-32002, e.message);
      }
    }
    case 'prompts/list': return { prompts: PROMPTS };
    case 'prompts/get': return getPrompt(params.name, params.arguments);
    case 'completion/complete': return { completion: { values: [], hasMore: false } };
    default: throw rpcError(-32601, `不支持的方法 ${method}`);
  }
}

async function handleOne(req, msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && (msg.result !== undefined || msg.error !== undefined)) return null;   
    return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: '不是合法的 JSON-RPC 2.0 请求' } };
  }
  const isNote = msg.id === undefined || msg.id === null;
  try {
    const result = await dispatch(req, msg);
    return isNote ? null : { jsonrpc: '2.0', id: msg.id, result };
  } catch (e) {
    if (isNote) return null;
    const err = e.rpc || { code: -32603, message: '服务端内部错误：' + (e && e.message || e) };
    if (!e.rpc) console.error('[mcp]', e);
    return { jsonrpc: '2.0', id: msg.id, error: err };
  }
}



const ORIGINS = (process.env.PSD_EDITOR_MCP_ORIGINS || process.env.PSD_EDITOR_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function originOk(req) {
  const o = req.get('origin');
  if (!o) return true;                                    
  if (ORIGINS.includes('*') || ORIGINS.includes(o)) return true;
  let ou; try { ou = new URL(o); } catch { return false; }
  if (process.env.PSD_EDITOR_PUBLIC_URL) { try { if (new URL(process.env.PSD_EDITOR_PUBLIC_URL).origin === ou.origin) return true; } catch { } }
  if (ou.host !== req.get('host')) return false;
  
  if (AUTH_OFF) return ['localhost', '127.0.0.1', '[::1]'].includes(ou.hostname);
  return true;
}

export function mcpRouter({ upload }) {
  const r = express.Router();
  const auth = requireAuth(['api', 'session']);
  const json = express.json({ limit: process.env.PSD_EDITOR_MCP_JSON_LIMIT || `${+(process.env.MAX_UPLOAD_MB || 200) * 1.4 | 0}mb` });

  
  if (process.env.PSD_EDITOR_MCP_URL_KEY === '1') {
    r.use('/k/:key', (req, _res, next) => { req.headers['x-api-key'] = req.params.key; next(); });
  }

  const post = async (req, res) => {
    if (!originOk(req)) return res.status(403).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Origin 不被允许' } });
    const pv = req.get('mcp-protocol-version');
    const body = req.body;
    const msgs = Array.isArray(body) ? body : [body];
    if (!msgs.length) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: '空请求' } });
    
    if (pv && !VERSIONS.includes(pv) && !msgs.some(m => m && m.method === 'initialize'))
      return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `不支持的 MCP-Protocol-Version：${pv}（支持 ${VERSIONS.join(' / ')}）` } });
    req._mcpVersion = VERSIONS.includes(pv) ? pv : '2025-03-26';
    
    const calls = msgs.filter(m => m && m.method === 'tools/call').length;
    for (let k = 1; k < calls; k++) if (!takeRate(principalOf(req))) {
      res.set('Retry-After', '10');
      return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: `超过速率限制（${principalOf(req).rpm}/分钟）` } });
    }
    const out = [];
    for (const m of msgs) { const x = await handleOne(req, m); if (x) out.push(x); }
    if (msgs.some(m => m && m.method === 'initialize')) res.set('Mcp-Session-Id', crypto.randomBytes(16).toString('hex'));
    res.set('Cache-Control', 'no-store');
    if (!out.length) return res.status(202).end();
    res.json(Array.isArray(body) ? out : out[0]);
  };
  const notAllowed = (_req, res) => res.status(405).set('Allow', 'POST, DELETE').json({ error: '本服务不开 SSE 推送流；请用 POST 发 JSON-RPC' });
  
  const del = (req, res) => { WS.closeSession(ownerOf(req), sessionOf(req)); res.status(204).end(); };
  const up = async (req, res) => {
    try {
      const f = req.file || (req.files && (req.files.file?.[0] || req.files.psd?.[0]));
      if (!f || !f.buffer?.length) return res.status(400).json({ error: '缺少文件字段（multipart 字段名 file 或 psd）' });
      if (!PSD_MAGIC(f.buffer)) return res.status(400).json({ error: '这不是 PSD/PSB 文件（文件头不是 8BPS）' });
      if (f.buffer.length > uploadCap(req)) return res.status(413).json({ error: `该凭证的上传上限为 ${Math.round(uploadCap(req) / 1048576)} MB` });
      
      const fixName = n => { if (!n) return n; try { const u = Buffer.from(n, 'latin1').toString('utf8'); return /\uFFFD/.test(u) ? n : u; } catch { return n; } };
      const d = WS.createDoc(ownerOf(req), req.body?.name || fixName(f.originalname) || '未标题.psd', f.buffer, '上传', sessionOf(req));
      res.json({ doc_id: d.id, name: d.name, bytes: f.buffer.length, expires_in_seconds: WS.listDocs(ownerOf(req)).find(x => x.doc_id === d.id)?.expires_in_seconds });
    } catch (e) { res.status(e.code === 'full' ? 507 : 400).json({ error: e.message }); }
  };
  const uploadFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'psd', maxCount: 1 }]);

  const gate = gateEndpoint();
  for (const base of process.env.PSD_EDITOR_MCP_URL_KEY === '1' ? ['/', '/k/:key'] : ['/']) {
    r.post(base, auth, gate, json, post);
    r.get(base, notAllowed);
    r.delete(base, auth, del);
  }
  r.post('/upload', auth, gate, uploadFields, up);
  const sendFile = (req, res) => {
    const f = WS.takeFile(req.params.token);
    if (!f) return res.status(404).json({ error: '链接不存在或已过期' });
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', f.contentType);
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.send(f.buffer);
  };
  r.get('/files/:token', sendFile);
  r.get('/files/:token/:name', sendFile);
  r.use((err, _req, res, _next) => {
    const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ jsonrpc: '2.0', id: null, error: { code: status === 400 ? -32700 : -32603, message: status === 400 ? 'JSON 解析失败' : (status === 413 ? '请求体过大' : '服务端内部错误') } });
  });
  return r;
}

export const MCP_TOOLS = TOOLS.map(({ run, ...t }) => t);

export const MCP_TOOL_DEFS = TOOLS;
