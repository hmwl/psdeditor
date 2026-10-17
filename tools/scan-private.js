




















import fs from 'node:fs';
import path from 'node:path';


export const MIN_LEN = 7;


export const GENERIC = new Set([
  'parse', 'write', 'read', 'build', 'render', 'decode', 'encode', 'create', 'update', 'validate',
  'toJSON', 'fromJSON', 'clone', 'equals', 'bounds', 'points', 'buffer', 'source', 'target',
  'options', 'result', 'output', 'input', 'header', 'layer', 'layers', 'index', 'default',
  'version', 'compose', 'convert', 'process', 'resolve', 'request', 'response', 'context',
  'descriptor', 'transform', 'placement', 'fragment', 'smartObject', 'deform', 'warp'
]);

const NAME = '[A-Za-z_$][\\w$]*';


export function exportNamesOf(src) {
  const out = new Set();
  
  for (const m of src.matchAll(new RegExp(`^\\s*export\\s+(?:async\\s+)?(?:function\\*?|class)\\s+(${NAME})`, 'gm'))) out.add(m[1]);
  
  for (const m of src.matchAll(new RegExp(`^\\s*export\\s+(?:const|let|var)\\s+([^;\\n]+)`, 'gm'))) {
    for (const part of m[1].split(',')) {
      const n = part.trim().match(new RegExp(`^(${NAME})`));
      if (n) out.add(n[1]);
      else break;                      
    }
  }
  
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.match(new RegExp(`^(${NAME})\\s+as\\s+(${NAME})$`));
      if (as) { out.add(as[1]); out.add(as[2]); continue; }
      if (new RegExp(`^${NAME}$`).test(t) && t !== 'default') out.add(t);
    }
  }
  out.delete('default');
  return out;
}

function jsFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFilesIn(p));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}


export function exportNamesIn(dir) {
  const out = new Set();
  for (const f of jsFilesIn(dir)) for (const n of exportNamesOf(fs.readFileSync(f, 'utf8'))) out.add(n);
  return out;
}










export function collectForbidden({ privateDir, publicDir, extraIdentifiers = [], literals = [] }) {
  const priv = exportNamesIn(privateDir);
  const pub = publicDir ? exportNamesIn(publicDir) : new Set();
  const identifiers = new Set(extraIdentifiers);
  const skipped = [];
  for (const n of priv) {
    if (pub.has(n)) { skipped.push(`${n}(core 也导出)`); continue; }
    if (n.length < MIN_LEN) { skipped.push(`${n}(过短)`); continue; }
    if (GENERIC.has(n)) { skipped.push(`${n}(通用词)`); continue; }
    identifiers.add(n);
  }
  return { identifiers: [...identifiers].sort(), literals: [...new Set(literals)].sort(), skipped: skipped.sort() };
}







export function scriptTextOf(html) {
  let out = '';
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) out += m[1] + '\n';
  return out;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');





export function scanText(text, { identifiers = [], literals = [] }) {
  const hit = [];
  for (const id of identifiers) if (new RegExp(`\\b${esc(id)}\\b`).test(text)) hit.push(id);
  for (const lit of literals) if (text.includes(lit)) hit.push(lit);
  return hit;
}






export function scanAll(named, forbidden) {
  const bad = [];
  for (const [name, text] of named) {
    const hits = scanText(text, forbidden);
    if (hits.length) bad.push({ name, hits });
  }
  return bad;
}












export function chunkTargets(label, files) {
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files);
  return entries.map(([name, text]) => [`${label}: ${name}`, name.endsWith('.html') ? scriptTextOf(text) : text]);
}












export function scanChunkSet({ preObf, outputs, forbidden }) {
  const targets = [...chunkTargets('混淆前', preObf), ...outputs];
  const bad = scanAll(targets, forbidden);
  const scanned = targets.map(([n]) => n);
  return { bad, scanned, summary: `扫描覆盖 ${scanned.length} 份产物（${[...preObf.keys()].length} 个 chunk × 混淆前 + 落盘全部）` };
}





export function selfTest(forbidden) {
  const probe = forbidden.identifiers[0] || forbidden.literals[0];
  if (!probe) throw new Error('私有标识扫描器自测失败：一个标识都没收集到（server/private 是否为空？）');
  const fake = `const a=1;export function ${probe.includes('/') ? 'x' : probe}(){}\n// ${probe}\n`;
  const hits = scanText(fake, forbidden);
  if (!hits.includes(probe)) throw new Error(`私有标识扫描器自测失败：构造的样本含「${probe}」却没被命中`);
  
  if (scanText('export function harmlessPublicHelper(){ return 42; }\n', forbidden).length)
    throw new Error('私有标识扫描器自测失败：干净样本出现误报');
  return probe;
}
