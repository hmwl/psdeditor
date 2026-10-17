















import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadAgPsd, loadAgPsdBlendModeMap, AG_READ_OPTS, REPO_ROOT } from './corpus/util.js';

const fmtBounds = (b) => b ? `${b.top},${b.left},${b.bottom},${b.right}` : null;
const uniq = (a) => [...new Set(a)].sort();


const argv = process.argv.slice(2);
const file = argv.find(a => !a.startsWith('--'));
const AS_JSON = argv.includes('--json');
const SHOW_ALL = argv.includes('--all');
const MAX = argv.includes('--max') ? Number(argv[argv.indexOf('--max') + 1]) : 20;

if (!file) {
  console.error('用法: node tools/xcheck.js <file.psd|psb> [--json] [--all] [--max N]');
  process.exit(2);
}
const abs = path.resolve(file);
if (!fs.existsSync(abs)) { console.error(`找不到文件: ${abs}`); process.exit(2); }



const buf = fs.readFileSync(abs);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const ours = await parseOurs(arrayBuffer);
const agpsd = parseAgPsd(arrayBuffer);
const pytools = parsePsdTools(abs);

const report = { file: path.relative(REPO_ROOT, abs), ours, agpsd, 'psd-tools': pytools };

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(diffCount(report) ? 1 : 0);
}



const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const dim = s => COLOR ? `\x1b[2m${s}\x1b[0m` : s;
const red = s => COLOR ? `\x1b[31m${s}\x1b[0m` : s;
const bold = s => COLOR ? `\x1b[1m${s}\x1b[0m` : s;

console.log(bold(report.file));
console.log('');


const HEADER_FIELDS = ['width', 'height', 'channels', 'depth', 'mode', 'psb'];
console.log(bold('header'));
printTable(['field', 'ours', 'ag-psd', 'psd-tools'], HEADER_FIELDS.map(f => {
  const row = [f, cell(ours.header, f), cell(agpsd.header, f), cell(pytools.header, f)];
  return { cells: row, diff: rowDiffers(row.slice(1)) };
}));
console.log('');


for (const [who, r] of [['ours', ours], ['ag-psd', agpsd], ['psd-tools', pytools]]) {
  if (r.error) console.log(red(`${who} 解析失败: ${r.error}`));
}


const n = Math.max(ours.layers?.length || 0, agpsd.layers?.length || 0, pytools.layers?.length || 0);
console.log(bold(`layers (ours=${ours.layers?.length ?? 'n/a'} ag-psd=${agpsd.layers?.length ?? 'n/a'} psd-tools=${pytools.layers?.length ?? 'n/a'})`));
if (!n) {
  console.log(dim('  （无图层记录）'));
} else {
  const LAYER_FIELDS = ['name', 'bounds', 'blendMode', 'opacity', 'clipping', 'hidden'];
  const rows = [];
  let shown = 0, hidden = 0;
  for (let i = 0; i < n; i++) {
    const a = ours.layers?.[i], b = agpsd.layers?.[i], c = pytools.layers?.[i];
    const sub = LAYER_FIELDS.map(f => {
      const cells = [`[${i}] ${f}`, cell(a, f), cell(b, f), cell(c, f)];
      return { cells, diff: rowDiffers(cells.slice(1)) };
    });
    const anyDiff = sub.some(r => r.diff);
    if (SHOW_ALL || anyDiff || shown < MAX) { rows.push(...sub); shown++; }
    else hidden++;
  }
  printTable(['layer.field', 'ours', 'ag-psd', 'psd-tools'], rows);
  if (hidden) console.log(dim(`  …另有 ${hidden} 层无差异，未列出（--all 看全部）`));
}
console.log('');


printSet('layer additional keys', ours.additionalKeys, agpsd.additionalKeys, pytools.additionalKeys);
printSet('image resource ids', ours.resourceIds, agpsd.resourceIds, pytools.resourceIds);
printSet('global blocks', ours.globalKeys, agpsd.globalKeys, pytools.globalKeys);

const diffs = diffCount(report);
console.log('');
console.log(diffs ? red(`${diffs} 处字段不一致`) : '三方一致');
console.log(dim('已知的两类良性差异（不是解析错误）：'));
console.log(dim('  · 分组图层 blendMode：ag-psd 报 lsct 里的 pass through，ours/psd-tools 报图层记录里的 blendKey（通常 norm）'));
console.log(dim('  · 图层名：ours/ag-psd 优先用 luni（Unicode）块，psd-tools 报的是记录里的老 Pascal 名（本地编码，中文会是乱码）'));
process.exit(diffs ? 1 : 0);




async function parseOurs(ab) {
  try {
    const mod = await import(pathToFileURL(path.join(REPO_ROOT, 'core', 'psd-parse.js')).href);
    const r = mod.parsePsdFull(ab);
    return {
      header: {
        width: r.header.width, height: r.header.height, channels: r.header.channels,
        depth: r.header.depth, mode: r.header.mode, psb: !!r.header.psb,
      },
      layers: r.layers.map(l => ({
        name: l.unicodeName || l.name,
        bounds: fmtBounds(l.bounds),
        blendMode: l.blendKey,
        opacity: l.opacity,
        clipping: l.clipping ? 1 : 0,
        hidden: !!(l.flags & 2),
      })),
      additionalKeys: uniq(r.layers.flatMap(l => l.additionalKeys || [])),
      globalKeys: uniq((r.linkedFiles || []).map(f => f._off?.block?.key).filter(Boolean)),
      resourceIds: null,   
    };
  } catch (e) {
    return { error: e.message, header: {}, layers: null };
  }
}



function parseAgPsd(ab) {
  let ag;
  try { ag = loadAgPsd(); } catch (e) { return { error: e.message, header: {}, layers: null }; }
  const fromBlendMode = loadAgPsdBlendModeMap();
  try {
    const psd = ag.readPsd(ab, AG_READ_OPTS);
    const flat = [];
    const walk = (children) => {
      for (const c of children || []) {
        if (c.children) {
          flat.push({ name: '</Layer group>', bounds: '0,0,0,0', blendMode: 'norm', opacity: 255, clipping: 0, hidden: false });
          walk(c.children);
          flat.push(normalizeAgLayer(c, fromBlendMode));
        } else {
          flat.push(normalizeAgLayer(c, fromBlendMode));
        }
      }
    };
    walk(psd.children);
    return {
      header: {
        width: psd.width, height: psd.height,
        channels: psd.channels ?? null, depth: psd.bitsPerChannel ?? null,
        mode: psd.colorMode ?? null, psb: null,   
      },
      layers: flat,
      additionalKeys: null,   
      globalKeys: uniq((psd.linkedFiles || []).length ? ['lnk*'] : []),
      resourceIds: null,
    };
  } catch (e) {
    return { error: e.message, header: {}, layers: null };
  }
}

function normalizeAgLayer(c, fromBlendMode) {
  return {
    name: c.name ?? '',
    bounds: fmtBounds({ top: c.top | 0, left: c.left | 0, bottom: c.bottom | 0, right: c.right | 0 }),
    blendMode: fromBlendMode[c.blendMode || 'normal'] || c.blendMode || 'norm',
    opacity: c.opacity === undefined ? 255 : Math.round(c.opacity * 255),
    clipping: c.clipping ? 1 : 0,
    hidden: !!c.hidden,
  };
}


function parsePsdTools(absPath) {
  const script = path.join(REPO_ROOT, 'tools', 'psdtools_dump.py');
  const r = spawnSync('python3', [script, absPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { error: `python3 起不来: ${r.error.message}`, header: {}, layers: null };
  let out;
  try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (e) {
    return { error: `psdtools_dump.py 输出不是 JSON: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`, header: {}, layers: null };
  }
  if (!out.ok) return { error: out.error, header: {}, layers: null };
  return {
    header: {
      width: out.header.width, height: out.header.height, channels: out.header.channels,
      depth: out.header.depth, mode: out.header.mode, psb: out.header.psb,
    },
    layers: out.layers.map(l => ({
      name: l.name,
      bounds: fmtBounds(l.bounds),
      blendMode: l.blendMode,
      opacity: l.opacity,
      clipping: l.clipping ? 1 : 0,
      hidden: !l.visible,
    })),
    additionalKeys: uniq(out.layers.flatMap(l => l.additionalKeys || [])),
    globalKeys: out.globalTaggedBlocks || [],
    resourceIds: (out.imageResources || []).map(r2 => r2.id),
  };
}



function cell(obj, field) {
  if (!obj) return null;
  const v = obj[field];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  return String(v);
}


function rowDiffers(cells) {
  const vals = cells.filter(v => v !== null && v !== undefined);
  return vals.length > 1 && new Set(vals).size > 1;
}

function printTable(head, rows) {
  const all = [head, ...rows.map(r => r.cells.map(c => c === null ? 'n/a' : c))];
  const widths = head.map((_, i) => Math.min(46, Math.max(...all.map(r => visLen(String(r[i] ?? ''))))));
  const line = (cells, mark = ' ') =>
    mark + ' ' + cells.map((c, i) => padTo(String(c ?? ''), widths[i])).join('  ');
  console.log(dim(line(head)));
  console.log(dim(line(widths.map(w => '-'.repeat(w)))));
  for (const r of rows) {
    const cells = r.cells.map(c => c === null ? dim('n/a') : truncate(String(c), 46));
    const text = line(cells, r.diff ? '!' : ' ');
    console.log(r.diff ? red(text) : text);
  }
}


function visLen(s) {
  let n = 0;
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]/u.test(ch) ? 2 : 1;
  return n;
}
function padTo(s, w) { return s + ' '.repeat(Math.max(0, w - visLen(s))); }
function truncate(s, w) { return visLen(s) <= w ? s : [...s].slice(0, w - 1).join('') + '…'; }

function printSet(label, a, b, c) {
  const named = [['ours', a], ['ag-psd', b], ['psd-tools', c]].filter(([, v]) => Array.isArray(v));
  if (!named.length) return;
  console.log(bold(label));
  const union = uniq(named.flatMap(([, v]) => v.map(String)));
  if (!union.length) { console.log(dim('  （空）')); console.log(''); return; }
  for (const [who, v] of named) {
    const have = new Set(v.map(String));
    const missing = union.filter(k => !have.has(k));
    console.log(`  ${who.padEnd(10)} ${v.length ? v.join(' ') : dim('（空）')}${missing.length ? red(`   缺: ${missing.join(' ')}`) : ''}`);
  }
  console.log('');
}

function diffCount(rep) {
  let n = 0;
  const o = rep.ours, a = rep.agpsd, p = rep['psd-tools'];
  for (const f of ['width', 'height', 'channels', 'depth', 'mode', 'psb']) {
    if (rowDiffers([cell(o.header, f), cell(a.header, f), cell(p.header, f)])) n++;
  }
  const len = Math.max(o.layers?.length || 0, a.layers?.length || 0, p.layers?.length || 0);
  for (let i = 0; i < len; i++) {
    for (const f of ['name', 'bounds', 'blendMode', 'opacity', 'clipping', 'hidden']) {
      if (rowDiffers([cell(o.layers?.[i], f), cell(a.layers?.[i], f), cell(p.layers?.[i], f)])) n++;
    }
  }
  return n;
}
