













import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const HERE = import.meta.dirname;


export const PROFILE_DIRS = [
  path.join(HERE, 'profiles'),                 
  '/usr/share/color/icc',
  '/usr/share/color/icc/ghostscript',
  '/usr/share/texlive/texmf-dist/tex/generic/colorprofiles',
  '/Library/ColorSync/Profiles',               
  '/Library/Application Support/Adobe/Color/Profiles/Recommended',
  '/System/Library/ColorSync/Profiles',        
  path.join(os.homedir() || '', 'Library/ColorSync/Profiles'),
  'C:\\Windows\\System32\\spool\\drivers\\color'
];

const EXT = ['.icc', '.icm', '.ICC', '.ICM'];


export function listProfiles() {
  const seen = new Map();
  for (const dir of PROFILE_DIRS) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!EXT.some(e => n.endsWith(e))) continue;
      const key = path.basename(n, path.extname(n));
      if (seen.has(key)) continue;
      const full = path.join(dir, n);
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      seen.set(key, { name: key, file: n, dir, path: full, size });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}






export function resolveProfile(spec) {
  if (!spec) return null;

  if (Buffer.isBuffer(spec) || spec instanceof Uint8Array) {
    const buf = Buffer.from(spec);
    assertIcc(buf);
    const tmp = path.join(os.tmpdir(), `PSD Editor-${crypto.randomUUID()}.icc`);
    fs.writeFileSync(tmp, buf);
    return { path: tmp, name: '(上传的 ICC)', source: 'upload', temp: tmp };
  }

  const s = String(spec);

  
  if (s.includes('/') || s.includes('\\') || EXT.some(e => s.endsWith(e))) {
    const p = path.isAbsolute(s) ? s : path.resolve(HERE, s);
    if (fs.existsSync(p)) {
      const fd = fs.openSync(p, 'r');
      try {
        const hbuf = Buffer.alloc(132);
        const bytesRead = fs.readSync(fd, hbuf, 0, 132, 0);
        assertIcc(hbuf.subarray(0, bytesRead));
      } finally {
        fs.closeSync(fd);
      }
      return { path: p, name: path.basename(p), source: 'path' };
    }
  }

  
  const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(s);
  const all = listProfiles();
  
  
  const hit = target
    ? (all.find(p => norm(p.name) === target) || all.find(p => norm(p.name).includes(target)))
    : null;
  if (hit) return { path: hit.path, name: hit.name, source: hit.dir };

  throw new Error(
    `找不到 ICC 配置文件「${s}」。可用：${all.map(p => p.name).join(', ') || '（无）'}。` +
    `把 .icc 放进 server/profiles/，或直接传绝对路径 / 文件内容。`
  );
}


function assertIcc(buf) {
  if (buf.length < 132 || buf.toString('latin1', 36, 40) !== 'acsp')
    throw new Error('不是合法的 ICC 文件（缺少 acsp 签名）');
}

export function cleanupProfile(p) {
  if (p && p.temp) { try { fs.unlinkSync(p.temp); } catch {  } }
}
