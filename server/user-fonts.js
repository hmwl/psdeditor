






















import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFontNames, splitFonts, woffTables, buildSfnt, FontFormatError } from '../core/font-sfnt.js';
import { decodeWoff2 } from '../core/woff2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const USER_FONT_DIR = process.env.PSD_EDITOR_USER_FONT_DIR || path.join(HERE, 'data', 'user-fonts');
export const LIMITS = {
  fileMB: +(process.env.PSD_EDITOR_USER_FONT_MAX_MB || 40),
  count: +(process.env.PSD_EDITOR_USER_FONT_MAX_COUNT || 100),
  quotaMB: +(process.env.PSD_EDITOR_USER_FONT_QUOTA_MB || 500),
  perRequest: +(process.env.PSD_EDITOR_REQUEST_FONT_MAX || 8),
};

class FontError extends Error { constructor(status, msg) { super(msg); this.name = 'FontError'; this.status = status; } }
const bad = (msg, status = 400) => new FontError(status, msg);
const clean = s => String(s || '').replace(/[^\x20-\x7e\u00a0-\uffff]/g, '').trim().slice(0, 128);



function unwoff(buf) {
  const { flavor, tables } = woffTables(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  let total = 0;
  const out = tables.map(t => {
    total += t.origLength;
    if (total > LIMITS.fileMB * 4 * 1024 * 1024) throw bad('WOFF 解压后过大');
    let data = t.data;
    if (t.compressed) {
      try { data = zlib.inflateSync(data, { maxOutputLength: t.origLength }); } catch { throw bad(`WOFF 表 ${t.tag} 解压失败`); }
    }
    if (data.length !== t.origLength) throw bad(`WOFF 表 ${t.tag} 长度不符`);
    return { tag: t.tag, sum: t.sum, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  });
  return Buffer.from(buildSfnt(flavor, out));
}





export function normalizeFont(input, originalName = '', { faces: pick = null, maxBytes = LIMITS.quotaMB * 1024 * 1024 } = {}) {
  let buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length > LIMITS.fileMB * 1024 * 1024) throw bad(`字体文件超过 ${LIMITS.fileMB}MB（PSD_EDITOR_USER_FONT_MAX_MB）`, 413);
  if (buf.length < 12) throw bad('字体文件太小');
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOF2') {
    try { buf = Buffer.from(decodeWoff2(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), b => zlib.brotliDecompressSync(b, { maxOutputLength: LIMITS.fileMB * 4 * 1024 * 1024 }))); }
    catch (e) { throw bad('WOFF2 解码失败：' + (e && e.message || e)); }
  }
  if (sig === 'wOFF') buf = unwoff(buf);
  let parts;
  const src = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let indices;
  if (pick && pick.length && src[0] === 0x74 && src[1] === 0x74 && src[2] === 0x63 && src[3] === 0x66) {   
    const all = readFontNames(src);
    indices = all.filter(f => pick.includes(f.ps)).map(f => f.index);
    if (!indices.length) throw bad(`faces 一个也没对上；这个文件里有：${all.map(f => f.ps).join(', ')}`);
  }
  try { parts = splitFonts(src, { indices, maxBytes }); }
  catch (e) { if (e instanceof FontFormatError) throw bad(e.message); throw e; }
  const out = [];
  for (const u8 of parts) {
    const bytes = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    const names = readFontNames(u8);
    if (!names.length) throw bad(`字体 ${originalName || ''} 的 name 表读不出 PostScript 名`);
    const nm = names[0];
    const ps = clean(nm.ps).replace(/[^\x21-\x7e]/g, '');
    if (!ps) throw bad('字体的 PostScript 名为空或非法');
    out.push({ bytes, ps, family: clean(nm.family) || ps, sub: clean(nm.sub) || 'Regular', fullName: clean(nm.fullName) || ps,
      families: [...new Set((nm.families || []).map(clean).filter(Boolean))].slice(0, 16),
      sha: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  return out;
}



const safeOwner = o => { const s = String(o || ''); if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw bad('字体库归属无效'); return s; };
const ownerDir = o => path.join(USER_FONT_DIR, safeOwner(o));
const metaPath = o => path.join(ownerDir(o), 'fonts.json');
const cache = new Map();   

function readMeta(owner) {
  if (cache.has(owner)) return cache.get(owner);
  let list = [];
  try { list = JSON.parse(fs.readFileSync(metaPath(owner), 'utf8')); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  list = list.filter(m => m && /^[0-9a-f]{16,64}$/.test(m.id) && fs.existsSync(path.join(ownerDir(owner), m.id + '.font')));
  cache.set(owner, list);
  return list;
}
function writeMeta(owner, list) {
  fs.mkdirSync(ownerDir(owner), { recursive: true });
  const tmp = metaPath(owner) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1));
  fs.renameSync(tmp, metaPath(owner));
  cache.set(owner, list);
  generation++;
}
let generation = 0;
export const libraryGeneration = () => generation;

const publicMeta = m => ({ id: m.id, postScriptName: m.ps, family: m.family, style: m.sub, fullName: m.fullName, size: m.size,
  originalName: m.originalName, uploadedAt: m.uploadedAt });

export function listUserFonts(owner) { return readMeta(safeOwner(owner)).map(publicMeta); }

export function userFontUsage(owner) {
  const l = readMeta(safeOwner(owner));
  return { count: l.length, bytes: l.reduce((a, m) => a + (m.size || 0), 0), limits: { ...LIMITS } };
}

export function addUserFonts(owner, buf, originalName = '', { faces: want = null } = {}) {
  owner = safeOwner(owner);
  
  const pick = (Array.isArray(want) ? want : typeof want === 'string' ? want.split(',') : []).map(x => String(x).trim()).filter(Boolean);
  const used = readMeta(owner).reduce((a, m) => a + (m.size || 0), 0);
  let faces = normalizeFont(buf, originalName, { faces: pick, maxBytes: Math.max(1, LIMITS.quotaMB * 1024 * 1024 - used) });
  if (pick.length) {
    const keep = faces.filter(f => pick.includes(f.ps));
    if (!keep.length) throw bad(`faces 一个也没对上；这个文件里有：${faces.map(f => f.ps).join(', ')}`);
    faces = keep;
  }
  const list = [...readMeta(owner)];
  const added = [], skipped = [];
  let bytes = list.reduce((a, m) => a + (m.size || 0), 0);
  
  const plan = [];
  for (const f of faces) {
    const id = f.sha.slice(0, 24);
    const dup = list.find(m => m.id === id) || plan.find(p => p.id === id);
    if (dup) { if (dup.ps) skipped.push({ ...publicMeta(dup), reason: '已在字体库里' }); continue; }
    const same = list.findIndex(m => m.ps === f.ps);
    if (same >= 0) {
      const [old] = list.splice(same, 1);
      bytes -= old.size || 0;
      plan.push({ id, f, replaced: old });
    } else plan.push({ id, f });
    bytes += f.bytes.length;
  }
  if (list.length + plan.length > LIMITS.count) throw bad(`字体库已满（上限 ${LIMITS.count} 款，PSD_EDITOR_USER_FONT_MAX_COUNT；这次要加 ${plan.length} 款），先删掉不用的`, 413);
  if (bytes > LIMITS.quotaMB * 1024 * 1024) throw bad(`字体库总量会超过 ${LIMITS.quotaMB}MB（PSD_EDITOR_USER_FONT_QUOTA_MB），先删掉不用的`, 413);
  fs.mkdirSync(ownerDir(owner), { recursive: true });
  for (const { id, f, replaced } of plan) {
    if (replaced) {
      try { fs.unlinkSync(path.join(ownerDir(owner), replaced.id + '.font')); } catch {  }
      skipped.push({ ...publicMeta(replaced), reason: `被同名新字体替换（${id}）` });
    }
    fs.writeFileSync(path.join(ownerDir(owner), id + '.font'), f.bytes);
    const m = { id, ps: f.ps, family: f.family, sub: f.sub, fullName: f.fullName, families: f.families, size: f.bytes.length,
      originalName: clean(originalName).slice(0, 120) || null, uploadedAt: new Date().toISOString() };
    list.push(m);
    added.push(publicMeta(m));
  }
  writeMeta(owner, list);
  return { added, skipped };
}

export function deleteUserFont(owner, idOrPs) {
  owner = safeOwner(owner);
  const list = [...readMeta(owner)];
  const k = list.findIndex(m => m.id === idOrPs || m.ps === idOrPs);
  if (k < 0) throw bad(`字体库里没有 ${idOrPs}`, 404);
  const [m] = list.splice(k, 1);
  try { fs.unlinkSync(path.join(ownerDir(owner), m.id + '.font')); } catch {  }
  writeMeta(owner, list);
  return publicMeta(m);
}


export function userFaces(owner) {
  if (!owner) return [];
  let o; try { o = safeOwner(owner); } catch { return []; }
  return readMeta(o).map(m => ({ ps: m.ps, family: m.family, sub: m.sub, fullName: m.fullName, families: m.families || [], index: 0,
    alias: 'u:' + m.id, user: true, id: m.id, bytes: () => fs.readFileSync(path.join(ownerDir(o), m.id + '.font')) }));
}


export function tempFaces(files = []) {
  if (files.length > LIMITS.perRequest) throw bad(`单次请求最多带 ${LIMITS.perRequest} 个字体文件（PSD_EDITOR_REQUEST_FONT_MAX）`);
  const out = [];
  for (const f of files) {
    let faces;
    try { faces = normalizeFont(f.buffer, f.originalname, { maxBytes: LIMITS.fileMB * 3 * 1024 * 1024 }); }
    catch (e) { if (/拆开后/.test(e.message)) e.message = `${f.originalname || '字体'}：${e.message}。单次上传没法挑款 —— 请先 POST /api/fonts 带 faces 只收需要的几款`; throw e; }
    for (const n of faces) {
      const bytes = n.bytes;
      out.push({ ps: n.ps, family: n.family, sub: n.sub, fullName: n.fullName, families: n.families, index: 0,
        alias: 'u:' + n.sha.slice(0, 24), user: true, temp: true, bytes: () => bytes });
    }
  }
  return out;
}


export function fontOwnerOf(p) {
  if (!p) return null;
  if (p.keyId) return p.keyId;
  if (p.kind === 'anon') return 'anon';
  return null;
}
