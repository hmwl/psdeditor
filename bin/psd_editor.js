


























import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';


console.log = console.info = (...a) => console.error(...a);
if (!process.env.PSD_EDITOR_STATE) process.env.PSD_EDITOR_STATE = 'off';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
const core = p => import(path.join(ROOT, 'core', p));


function parseArgs(argv) {
  const pos = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) o[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[k] = argv[++i];
      else o[k] = true;
    } else pos.push(a);
  }
  return { pos, o };
}
class CliError extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); } }
const out = obj => process.stdout.write(JSON.stringify(obj, null, process.stdout.isTTY ? 2 : 0) + '\n');
const readJSON = (s, what) => { try { return JSON.parse(s); } catch (e) { throw new CliError('BAD_JSON', `${what} 不是合法 JSON：${e.message}`); } };
const readFile = f => { if (!f) throw new CliError('NO_FILE', '缺少文件参数'); const p = path.resolve(f); if (!fs.existsSync(p)) throw new CliError('NOT_FOUND', '文件不存在：' + p); return new Uint8Array(fs.readFileSync(p)); };
const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const revisionOf = u8 => crypto.createHash('sha256').update(u8).digest('hex').slice(0, 16);
const inflate = async u => new Uint8Array(zlib.inflateSync(Buffer.from(u)));
const deflate = async u => new Uint8Array(zlib.deflateSync(Buffer.from(u), { level: 6 }));
const extOf = f => (path.extname(f || '').slice(1) || '').toLowerCase();


let sharpP = null;
function sharp() {
  if (!sharpP) sharpP = (async () => { try { const req = createRequire(path.join(ROOT, 'server', 'package.json')); return req('sharp'); } catch { return null; } })();
  return sharpP;
}


async function readImage(file) {
  const u8 = readFile(file), e = extOf(file);
  const C = await core('formats/raster-codecs.js');
  const kind = C.sniffFormat(u8, file);
  if (kind === 'psd' || e === 'psd' || e === 'psb' || (u8[0] === 0x38 && u8[1] === 0x42 && u8[2] === 0x50 && u8[3] === 0x53)) {
    const { parsePsdRaster } = await core('psd-raster.js');
    const { compositeAll } = await core('compose.js');
    const doc = await parsePsdRaster(ab(u8), { strictChannels: false });
    const s = compositeAll(doc, doc.width, doc.height, new Map());
    return { width: doc.width, height: doc.height, rgba: s.data, psd: true };
  }
  if (u8[0] === 0x89 && u8[1] === 0x50) { const { decodePNG } = await core('formats/png.js'); return decodePNG(u8, { inflate: x => new Uint8Array(zlib.inflateSync(Buffer.from(x))) }); }
  if (kind === 'tiff') { const { decodeTIFF } = await core('formats/tiff-decode.js'); const d = await decodeTIFF(u8, { inflate }); return d.float ? C.toneMapFloat(d) : d; }
  if (kind === 'tga') return C.decodeTGA(u8);
  if (kind === 'pnm') return C.decodePNM(u8);
  if (kind === 'hdr') return C.toneMapFloat(C.decodeHDR(u8));
  if (kind === 'exr') return C.toneMapFloat(await C.decodeEXR(u8, { inflate }));
  const sh = await sharp();
  if (!sh) throw new CliError('NO_DECODER', `解 ${e || '这种'} 格式需要 sharp（在 server/ 目录 npm install 一下）`);
  const { data, info } = await sh(Buffer.from(u8)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

async function writeImage(img, file, o = {}) {
  const e = extOf(file), C = await core('formats/raster-codecs.js'), { width: W, height: H, rgba } = img;
  let bytes;
  if (e === 'psd') {
    const { createPsd } = await core('psd-new.js');
    const { applyEdits } = await core('psd-edit.js');
    const blank = createPsd({ width: W, height: H, background: 'transparent', name: path.basename(file, '.psd') });
    bytes = new Uint8Array(applyEdits(blank, [{ op: 'replaceLayerPixels', index: 0, rgba: { data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length), width: W, height: H }, bounds: { top: 0, left: 0, bottom: H, right: W } }]).buffer);
  } else if (e === 'png') { const { encodePNG } = await core('formats/png.js'); bytes = encodePNG(rgba, W, H, { deflate: x => new Uint8Array(zlib.deflateSync(Buffer.from(x), { level: 6 })) }); }
  else if (e === 'tga') bytes = C.encodeTGA(rgba, W, H);
  else if (e === 'bmp') bytes = C.encodeBMP(rgba, W, H);
  else if (e === 'ppm' || e === 'pgm' || e === 'pam') bytes = C.encodePNM(rgba, W, H, e);
  else if (e === 'hdr') bytes = C.encodeHDR(C.rgbaToLinearFloat(rgba, W, H), W, H);
  else if (e === 'exr') bytes = await C.encodeEXR(C.rgbaToLinearFloat(rgba, W, H), W, H, { deflate });
  else {
    const sh = await sharp();
    if (!sh) throw new CliError('NO_ENCODER', `写 ${e} 需要 sharp（在 server/ 目录 npm install 一下）；不装也能写 png / tga / bmp / ppm / pam / hdr / exr / psd`);
    const q = Math.max(1, Math.min(100, +o.quality || 90));
    let p = sh(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length), { raw: { width: W, height: H, channels: 4 } });
    if (e === 'jpg' || e === 'jpeg') p = p.flatten({ background: '#ffffff' }).jpeg({ quality: q });
    else if (e === 'webp') p = p.webp({ quality: q });
    else if (e === 'avif') p = p.avif({ quality: q });
    else if (e === 'tif' || e === 'tiff') p = p.tiff({ compression: 'lzw' });
    else if (e === 'gif') p = p.gif();
    else throw new CliError('BAD_FORMAT', '不支持的输出格式：' + e);
    bytes = new Uint8Array(await p.toBuffer());
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, bytes);
  return bytes.length;
}
function scaleRGBA(img, k) {
  if (!(k > 0 && k < 1)) return img;
  const W = Math.max(1, Math.round(img.width * k)), H = Math.max(1, Math.round(img.height * k)), s = img.rgba, w0 = img.width, h0 = img.height;
  const o = new Uint8ClampedArray(W * H * 4), fx = w0 / W, fy = h0 / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx)), y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const q = (yy * w0 + xx) * 4, al = s[q + 3]; r += s[q] * al; g += s[q + 1] * al; b += s[q + 2] * al; a += al; n++; }
    const p = (y * W + x) * 4; if (a) { o[p] = r / a; o[p + 1] = g / a; o[p + 2] = b / a; } o[p + 3] = a / n;
  }
  return { width: W, height: H, rgba: o };
}



async function catalog() {
  const { buildCatalog } = await import(path.join(ROOT, 'server', 'catalog.js'));
  const c = buildCatalog();
  return { c, ops: c.ops.map(o => ({ op: o.op, category: o.category, summary: o.summary, kind: o.kind, ...(o.aliasOf ? { aliasOf: o.aliasOf } : {}), structural: !!o.structural })),
    byName: new Map(c.ops.flatMap(o => [[o.op, o], ...(o.aliases || []).map(a => [a, o])])) };
}


async function inspect(u8) {
  const { parsePsdFull, hasRealMask } = await core('psd-parse.js');
  const p = parsePsdFull(ab(u8));
  const KIND = l => l.groupType === 3 ? 'groupEnd' : (l.groupType === 1 || l.groupType === 2) ? 'group' : l.text ? 'text' : (l.placedBlock || (l.placedBlocks && l.placedBlocks.length)) ? 'smartObject'
    : (l.additionalKeys || []).some(k => ['SoCo', 'GdFl', 'PtFl'].includes(k)) ? 'fill' : (l.additionalKeys || []).some(k => ['curv', 'levl', 'brit', 'hue2', 'hue ', 'blnc', 'blwh', 'nvrt', 'post', 'thrs', 'selc', 'phfl', 'vibA', 'mixr', 'grdm', 'expA', 'clrL'].includes(k)) ? 'adjustment'
    : (l.vectorMask && (l.additionalKeys || []).some(k => k === 'vstk')) ? 'shape' : 'pixel';
  const layers = p.layers.map((l, i) => ({
    index: i, name: l.unicodeName || l.name, kind: KIND(l), visible: !(l.flags & 2), opacity: l.opacity, fillOpacity: l.fillOpacity ?? 255,
    blend: l.groupType === 1 || l.groupType === 2 ? (l.groupBlendKey || l.blendKey) : l.blendKey, clipping: !!l.clipping,
    bounds: l.bounds, ...(l.text ? { text: String(l.text['Txt '] || '').slice(0, 200) } : {}), ...(hasRealMask(l.mask) ? { mask: true } : {}), ...(l.vectorMask ? { vectorMask: true } : {}),
    ...(l.effects ? { effects: true } : {}), ...(l.locks ? { locks: l.locks } : {}),
  }));
  
  const tree = [], stack = [{ children: tree }];
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (L.kind === 'groupEnd') { if (stack.length > 1) stack.pop(); continue; }
    const node = { index: i, name: L.name, kind: L.kind };
    stack[stack.length - 1].children.push(node);
    if (L.kind === 'group') { node.children = []; stack.push(node); }
  }
  const h = p.header;
  return { width: h.width, height: h.height, mode: ['bitmap', 'gray', 'indexed', 'rgb', 'cmyk', '', '', 'multichannel', 'duotone', 'lab'][h.mode] || h.mode, depth: h.depth, psb: !!h.psb,
    revision: revisionOf(u8), layerCount: layers.filter(l => l.kind !== 'groupEnd').length, layers, tree };
}


function resolveRefs(v, named) {
  if (Array.isArray(v)) return v.map(x => resolveRefs(x, named));
  if (v && typeof v === 'object') {
    if (typeof v.$ref === 'string' && Object.keys(v).length === 1) {
      const [nm, ...fields] = v.$ref.split('.');
      if (!named.has(nm)) throw new CliError('BAD_REF', `$ref 引用了还没出现的步骤「${nm}」`);
      let x = named.get(nm); for (const f of fields) x = x == null ? undefined : x[f];
      if (x === undefined) throw new CliError('BAD_REF', `$ref「${v.$ref}」没有这个字段（该步结果：${JSON.stringify(named.get(nm)).slice(0, 300)}）`);
      return x;
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(x, named)]));
  }
  return v;
}

function collectImages(steps, baseDir) {
  const files = [];
  const fix = v => {
    if (typeof v === 'string' && v.startsWith('@') && v.length > 1) v = { path: v.slice(1) };
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.path === 'string' && Object.keys(v).length === 1) {
      const p = path.resolve(baseDir, v.path);
      if (!fs.existsSync(p)) throw new CliError('NOT_FOUND', '图片不存在：' + p);
      files.push({ buffer: fs.readFileSync(p), originalname: path.basename(p), path: p });
      return { file: 'image', index: files.length - 1 };
    }
    return v;
  };
  const walk = v => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'image' ? fix(x) : walk(x)])) : v;
  return { steps: steps.map(walk), files };
}

function slimRec(r) {
  const o = {};
  for (const [k, v] of Object.entries(r || {})) {
    if (v == null || typeof v === 'function' || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) continue;
    if (typeof v === 'object' && JSON.stringify(v).length > 4000) continue;
    o[k] = v;
  }
  if (o.index === undefined && Number.isInteger(o.at)) o.index = o.at;
  return o;
}
const errOf = e => e instanceof CliError ? e : new CliError(e.code || (e.status === 422 ? 'GUARD_FAILED' : e.status === 413 ? 'TOO_LARGE' : e.status === 400 ? 'BAD_OP' : 'OP_FAILED'), e.message, e.detail ? { detail: e.detail } : {});






async function runSteps(u8, steps, o, baseDir = process.cwd()) {
  if (!Array.isArray(steps) || !steps.length) throw new CliError('BAD_STEPS', 'steps 必须是非空数组');
  const im = collectImages(steps, baseDir); steps = im.steps;
  const clean = s => { const { as: _as, ...rest } = s; return rest; };
  const hasRef = JSON.stringify(steps).includes('"$ref"');
  const remoteBase = o.server && o.server !== true ? o.server : process.env.PSD_EDITOR_SERVER;
  const t0 = Date.now();
  let exec;
  if (remoteBase) exec = async (buf, ops) => runRemote(new Uint8Array(buf), ops, { server: remoteBase }, im.files);
  else {
    const E = await import(path.join(ROOT, 'server', 'edit-api.js'));
    exec = async (buf, ops, opts = {}) => {
      try {
        E.checkOps(ops);
        const r = await E.executeEdit(Buffer.from(buf), ops, { files: im.files, recomposite: opts.recomposite, renderText: o['no-text'] ? false : undefined });
        return { buffer: new Uint8Array(r.buffer.buffer, r.buffer.byteOffset, r.buffer.length), results: r.results.map(slimRec), warnings: r.warnings, recomposited: r.recomposited };
      } catch (e) { throw errOf(e); }
    };
  }
  if (!hasRef) {
    const r = await exec(ab(u8), steps.map(clean));
    return { ...r, ms: Date.now() - t0, ...(remoteBase ? { server: remoteBase } : {}) };
  }
  
  let buf = ab(u8); const named = new Map(), results = [], warnings = [];
  for (let i = 0; i < steps.length; i++) {
    const s = resolveRefs(clean(steps[i]), named), last = i === steps.length - 1;
    let r;
    try { r = await exec(buf, [s], { recomposite: last ? true : false }); }
    catch (e) { throw new CliError(e.code || 'OP_FAILED', `第 ${i + 1} 步（${s.op}）失败：${e.message}`, { step: i, ...(e.detail ? { detail: e.detail } : {}) }); }
    buf = ab(r.buffer); const rec = { ...(r.results[0] || {}), i };
    results.push(rec); warnings.push(...r.warnings);
    if (steps[i].as) named.set(steps[i].as, rec);
  }
  return { buffer: new Uint8Array(buf), results, warnings, ms: Date.now() - t0, ...(remoteBase ? { server: remoteBase } : {}) };
}
async function runRemote(u8, steps, o, files = []) {
  const base = String(o.server).replace(/\/$/, '');
  const fd = new FormData();
  fd.append('psd', new Blob([u8]), 'in.psd');
  for (const f of files) fd.append('image', new Blob([f.buffer]), f.originalname);
  fd.append('ops', JSON.stringify(steps));
  const headers = {}; if (process.env.PSD_EDITOR_API_KEY) headers.Authorization = 'Bearer ' + process.env.PSD_EDITOR_API_KEY;
  let res;
  try { res = await fetch(base + '/api/doc/edit', { method: 'POST', body: fd, headers }); }
  catch (e) { throw new CliError('SERVER_UNREACHABLE', `连不上 ${base}：${e.message}。不给 --server / PSD_EDITOR_SERVER 就在本机直接跑。`); }
  if (!res.ok) { let j = null; try { j = await res.json(); } catch {} throw new CliError((j && j.code) || 'SERVER_ERROR', (j && (j.error || j.message)) || ('HTTP ' + res.status), { status: res.status, detail: j }); }
  let meta = {}; try { meta = JSON.parse(decodeURIComponent(res.headers.get('x-doc-meta') || '{}')); } catch {}
  return { buffer: new Uint8Array(await res.arrayBuffer()), results: meta.results || meta.ops || [], warnings: meta.warnings || [] };
}
function checkRevision(u8, o) {
  if (o.revision && o.revision !== true && o.revision !== revisionOf(u8))
    throw new CliError('REVISION_CONFLICT', `文件在你看过之后被改过了（你给的 revision ${o.revision}，现在是 ${revisionOf(u8)}）。重新 inspect 再决定怎么改。`, { current: revisionOf(u8) });
}
async function finishEdit(file, u8, r, o) {
  const dst = o.out && o.out !== true ? o.out : file;
  if (o['dry-run']) return { ok: true, dryRun: true, results: r.results, warnings: r.warnings };
  fs.writeFileSync(dst, r.buffer);
  return { ok: true, file: path.resolve(dst), revision: revisionOf(r.buffer), previousRevision: revisionOf(u8), results: r.results, warnings: r.warnings, ...(r.server ? { server: r.server } : {}), ms: r.ms };
}


function dropletScripts(name, stepsAbs, format, outDir) {
  const node = process.execPath, cli = path.join(ROOT, 'bin', 'psd_editor.js');
  const sh = `#!/bin/bash
# PSD Editor 快捷批处理「${name}」：把文件拖到这个图标上（或命令行把文件当参数），逐个跑 ${path.basename(stepsAbs)}
# 结果放在 ${outDir || '原文件旁边的「' + name + '」文件夹'}
NODE="${node}"; CLI="${cli}"; STEPS="${stepsAbs}"; FMT="${format}"
command -v "$NODE" >/dev/null 2>&1 || NODE=node
for f in "$@"; do
  dir="${outDir ? outDir.replace(/"/g, '\\"') : '$(dirname "$f")/' + name}"; mkdir -p "$dir"
  base="$(basename "\${f%.*}")"; tmp="$dir/$base.psd"
  case "$f" in *.psd|*.PSD|*.psb|*.PSB) cp "$f" "$tmp";; *) "$NODE" "$CLI" convert "$f" "$tmp" >/dev/null || { echo "转换失败：$f"; continue; };; esac
  "$NODE" "$CLI" batch "$tmp" --input "$STEPS" && { [ "$FMT" = psd ] || { "$NODE" "$CLI" convert "$tmp" "$dir/$base.$FMT" >/dev/null && rm -f "$tmp"; }; } || echo "处理失败：$f"
done
`;
  const cmd = `@echo off
chcp 65001 >nul
rem PSD Editor 快捷批处理「${name}」：把文件拖到这个图标上，逐个跑 ${path.basename(stepsAbs)}
setlocal enabledelayedexpansion
set "CLI=${cli}"
set "STEPS=${stepsAbs}"
for %%F in (%*) do (
  set "dir=${outDir || '%%~dpF' + name}"
  if not exist "!dir!" mkdir "!dir!"
  set "tmp=!dir!\\%%~nF.psd"
  if /I "%%~xF"==".psd" (copy /Y "%%~F" "!tmp!" >nul) else (node "%CLI%" convert "%%~F" "!tmp!" >nul)
  node "%CLI%" batch "!tmp!" --input "%STEPS%"
  if not "${format}"=="psd" (node "%CLI%" convert "!tmp!" "!dir!\\%%~nF.${format}" >nul & del "!tmp!")
)
`;
  return { sh, cmd };
}

async function mcpLocal() {
  const TOOLS = [
    { name: 'capabilities', description: '列出 PSD Editor 能做的全部 op（名称 / 分类 / 一句话）。先按关键词查，再用 describe 看字段。', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
    { name: 'describe', description: '一个 op 的字段、限制与例子。不要猜字段名。', inputSchema: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'] } },
    { name: 'inspect', description: '读 PSD：尺寸 / 模式 / 图层表（index、名称、类型、位置、显隐…）和 revision。改之前先看。', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'render', description: '把 PSD（或图片）合成成 PNG 预览：写到 out（默认 原名.preview.png），并把预览图直接附在结果里给你看（inline:false 不附）。', inputSchema: { type: 'object', properties: { path: { type: 'string' }, out: { type: 'string' }, max: { type: 'number', description: '长边上限（像素），默认 1024' }, layers: { type: 'string', description: '只合成这些图层，如 "0,2,5"' }, inline: { type: 'boolean' } }, required: ['path'] } },
    { name: 'batch', description: '对 PSD 执行一批 op（一次事务）。steps 里可用 as 命名、{"$ref":"名.字段"} 引用前面的结果。带 revision 防止覆盖别人的改动。', inputSchema: { type: 'object', properties: { path: { type: 'string' }, steps: { type: 'array', items: { type: 'object' } }, out: { type: 'string' }, revision: { type: 'string' } }, required: ['path', 'steps'] } },
    { name: 'convert', description: '格式互转（PSD / PNG / JPEG / WebP / TIFF / TGA / BMP / PPM / PAM / HDR / EXR）。', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, quality: { type: 'number' } }, required: ['from', 'to'] } },
    { name: 'new_document', description: '新建 PSD。', inputSchema: { type: 'object', properties: { out: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'string', enum: ['white', 'transparent', 'black'] }, mode: { type: 'string' }, depth: { type: 'number' } }, required: ['out', 'width', 'height'] } },
  ];
  const call = async (name, a) => {
    switch (name) {
      case 'capabilities': return cmd(['capabilities', ...(a.query ? ['--query', a.query] : [])]);
      case 'describe': return cmd(['describe', a.op]);
      case 'inspect': return cmd(['inspect', a.path]);
      case 'render': {
        const r = await cmd(['render', a.path, '--out', a.out || a.path.replace(/\.[^.]+$/, '') + '.preview.png', '--max', String(a.max || 1024), ...(a.layers ? ['--layers', String(a.layers)] : [])]);
        if (r.ok && a.inline !== false && r.bytes <= 4 * 1048576) r._image = fs.readFileSync(r.out).toString('base64');
        return r;
      }
      case 'batch': { const tmp = path.join(fs.mkdtempSync(path.join((process.env.TMPDIR || '/tmp'), 'fpsd-')), 'steps.json'); fs.writeFileSync(tmp, JSON.stringify(a.steps)); return cmd(['batch', a.path, '--input', tmp, ...(a.out ? ['--out', a.out] : []), ...(a.revision ? ['--revision', a.revision] : [])]); }
      case 'convert': return cmd(['convert', a.from, a.to, ...(a.quality ? ['--quality', String(a.quality)] : [])]);
      case 'new_document': return cmd(['new', '--out', a.out, '--width', String(a.width), '--height', String(a.height), ...(a.background ? ['--background', a.background] : []), ...(a.mode ? ['--mode', a.mode] : []), ...(a.depth ? ['--depth', String(a.depth)] : [])]);
      default: throw new CliError('NO_TOOL', '没有这个工具：' + name);
    }
  };
  const send = m => process.stdout.write(JSON.stringify(m) + '\n');
  const rl = (await import('node:readline')).createInterface({ input: process.stdin });
  rl.on('line', async line => {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.id === undefined) return;
    try {
      if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'psd_editor-local', version: VERSION },
        instructions: 'PSD Editor 本地工具：PSD 的读 / 改 / 合成都在本机完成。改文件前先 inspect 拿 revision，batch 时带上；先用 capabilities / describe 查 op 字段，不要照别的编辑器猜。改完用 render 看结果。' } });
      if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } });
      if (m.method === 'tools/call') {
        const r = await call(m.params.name, m.params.arguments || {}); const img = r._image; delete r._image;
        return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(r) }, ...(img ? [{ type: 'image', data: img, mimeType: 'image/png' }] : [])], isError: r.ok === false } });
      }
      if (m.method === 'ping') return send({ jsonrpc: '2.0', id: m.id, result: {} });
      send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: '不支持的方法：' + m.method } });
    } catch (e) { send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }) }], isError: true } }); }
  });
  await new Promise(() => {});
}


async function cmd(argv) {
  const { pos, o } = parseArgs(argv);
  const c = pos[0];
  try {
    switch (c) {
      case undefined: case 'help': case '--help':
        return { ok: true, version: VERSION, usage: fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => /^ \*   psd_editor /.test(l)).map(l => l.replace(/^ \*\s+/, '')) };
      case 'version': return { ok: true, version: VERSION };
      case 'capabilities': {
        const { ops, c: full } = await catalog();
        if (o.section && o.section !== true) {
          const SEC = { filters: 'filters', adjustments: 'adjustments', adjustmentLayers: 'adjustmentLayerKinds', effects: 'layerEffects', blendModes: 'blendModes', newDocument: 'newDocument', selection: 'selection', deformKinds: 'deformKinds' };
          const k = SEC[o.section]; if (!k) throw new CliError('BAD_ARG', '--section 可选：' + Object.keys(SEC).join(' / '));
          return { ok: true, section: o.section, items: full[k] };
        }
        const q = o.query && o.query !== true ? String(o.query).toLowerCase() : '';
        const hit = q ? ops.filter(x => (x.op + ' ' + x.category + ' ' + x.summary).toLowerCase().includes(q)) : ops;
        const off = +o.offset || 0, lim = +o.limit || (q ? 50 : 500);
        return { ok: true, total: hit.length, offset: off, ...(off + lim < hit.length ? { nextOffset: off + lim } : {}), ops: hit.slice(off, off + lim),
          more: '字段与例子：describe <op>；滤镜 / 调整 / 样式 / 混合模式清单：capabilities --section filters|adjustments|adjustmentLayers|effects|blendModes' };
      }
      case 'describe': {
        const { byName } = await catalog(); const d = byName.get(pos[1]);
        if (!d) throw new CliError('NO_OP', `没有这个 op：${pos[1]}（用 capabilities 查）`);
        const { feature: _f, ...rest } = d;
        return { ok: true, ...rest };
      }
      case 'inspect': return { ok: true, file: path.resolve(pos[1]), ...(await inspect(readFile(pos[1]))) };
      case 'render': {
        let img = await readImage(pos[1]);
        if (o.layers && o.layers !== true && !img.psd) throw new CliError('BAD_ARG', '--layers 只对 PSD 有用');
        if (o.layers && o.layers !== true) {
          const keep = new Set(String(o.layers).split(',').map(Number));
          const { parsePsdRaster } = await core('psd-raster.js'); const { compositeAll } = await core('compose.js');
          const doc = await parsePsdRaster(ab(readFile(pos[1])), { strictChannels: false });
          doc.layers = doc.layers.map((l, i) => (l.group && l.group.type) || keep.has(i) ? l : { ...l, hidden: true });
          img = { width: doc.width, height: doc.height, rgba: compositeAll(doc, doc.width, doc.height, new Map()).data };
        }
        const k = o.scale ? +o.scale : o.max ? Math.min(1, +o.max / Math.max(img.width, img.height)) : 1;
        img = scaleRGBA(img, k);
        const dst = o.out && o.out !== true ? o.out : pos[1].replace(/\.[^.]+$/, '') + '.preview.png';
        const size = await writeImage(img, dst, o);
        return { ok: true, out: path.resolve(dst), width: img.width, height: img.height, scale: k, bytes: size, documentPixelsPerImagePixel: 1 / k };
      }
      case 'execute': case 'batch': {
        const file = pos[1], u8 = readFile(file);
        checkRevision(u8, o);
        let steps, baseDir = process.cwd();
        if (c === 'execute') {
          if (!o.op) throw new CliError('BAD_ARG', 'execute 要 --op 名称');
          const params = o.params ? readJSON(o.params, '--params') : o.input ? readJSON(fs.readFileSync(o.input, 'utf8'), '--input') : {};
          steps = [{ op: o.op, ...params }];
        } else {
          if (!o.input) throw new CliError('BAD_ARG', 'batch 要 --input steps.json（- 表示从标准输入读）');
          if (o.input !== '-') baseDir = path.dirname(path.resolve(o.input));
          const raw = o.input === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(o.input, 'utf8');
          const j = readJSON(raw, 'steps'); steps = Array.isArray(j) ? j : j.steps;
        }
        return finishEdit(file, u8, await runSteps(u8, steps, o, baseDir), o);
      }
      case 'new': {
        const { createPsd } = await core('psd-new.js');
        if (!o.out || o.out === true) throw new CliError('BAD_ARG', 'new 要 --out 文件名');
        const buf = new Uint8Array(createPsd({ width: +o.width || 1000, height: +o.height || 800, background: o.background || 'white', mode: o.mode || 'rgb', depth: +o.depth || 8, resolution: +o.resolution || 72, name: o.name }));
        fs.writeFileSync(o.out, buf);
        return { ok: true, file: path.resolve(o.out), revision: revisionOf(buf), ...(await inspect(buf)) };
      }
      case 'convert': {
        if (!pos[1] || !pos[2]) throw new CliError('BAD_ARG', 'convert <输入> <输出>');
        const img = await readImage(pos[1]);
        const size = await writeImage(img, pos[2], o);
        return { ok: true, from: path.resolve(pos[1]), to: path.resolve(pos[2]), width: img.width, height: img.height, bytes: size, ...(img.psd && extOf(pos[2]) !== 'psd' ? { note: 'PSD 已拼合（合成图）' } : {}) };
      }
      case 'droplet': {
        if (pos[1] !== 'create') throw new CliError('BAD_ARG', 'droplet create --input steps.json [--name N] [--format psd|png|jpg] [--dir 目录]');
        if (!o.input) throw new CliError('BAD_ARG', '要 --input steps.json');
        const steps = path.resolve(o.input); readJSON(fs.readFileSync(steps, 'utf8'), 'steps');
        const name = (o.name && o.name !== true ? o.name : path.basename(steps, '.json')).replace(/[\\/:*?"<>|]/g, '_');
        const fmt = (o.format && o.format !== true ? o.format : 'psd').toLowerCase();
        const dir = path.resolve(o.dir && o.dir !== true ? o.dir : '.');
        const { sh, cmd: bat } = dropletScripts(name, steps, fmt, o.outdir && o.outdir !== true ? path.resolve(o.outdir) : '');
        fs.mkdirSync(dir, { recursive: true });
        const f1 = path.join(dir, name + '.command'), f2 = path.join(dir, name + '.cmd');
        fs.writeFileSync(f1, sh, { mode: 0o755 }); fs.writeFileSync(f2, bat.replace(/\n/g, '\r\n'));
        return { ok: true, files: [f1, f2], usage: 'macOS：把文件拖到 .command 上（首次要在「系统设置 › 隐私与安全性」里允许）；Windows：拖到 .cmd 上；Linux：sh ' + name + '.command 文件…' };
      }
      case 'mcp': {
        if (!o.remote) { await mcpLocal(); return null; }
        const p = spawn(process.execPath, [path.join(ROOT, 'server', 'mcp-stdio.js')], { stdio: 'inherit' });
        await new Promise(r => p.on('exit', r)); return null;
      }
      case 'serve': {
        const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { stdio: 'inherit', env: { ...process.env, ...(o.port ? { PORT: String(o.port) } : {}) } });
        await new Promise(r => p.on('exit', r)); return null;
      }
      default: throw new CliError('NO_COMMAND', `不认识的命令「${c}」（psd_editor help 看用法）`);
    }
  } catch (e) {
    return { ok: false, error: { code: e.code || 'ERROR', message: e.message, ...(e.step != null ? { step: e.step } : {}), ...(e.current ? { current: e.current } : {}), ...(e.detail ? { detail: e.detail } : {}) } };
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const r = await cmd(process.argv.slice(2));
  if (r) { out(r); if (r.ok === false) process.exitCode = r.error.code === 'REVISION_CONFLICT' ? 3 : 1; }
}
export { cmd };
