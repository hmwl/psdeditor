


















import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, loadAgPsd, AG_READ_OPTS, probeHeader, manifestEntry, fmtBytes, ensureDir } from './corpus/util.js';
import { generate as generateAgPsd } from './corpus/gen-agpsd.js';
import { generate as generateRaw } from './corpus/gen-raw.js';
import { parsePsdFull } from '../core/psd-parse.js';

const argv = process.argv.slice(2);
const argOut = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'corpus';
const OUT = path.resolve(REPO_ROOT, argOut);
const SKIP_MAGICK = argv.includes('--skip-magick');

const ag = loadAgPsd();





let cleanFailed = false;
for (const sub of ['agpsd', 'magick', 'raw']) {
  try {
    fs.rmSync(path.join(OUT, sub), { recursive: true, force: true });
  } catch (e) {
    cleanFailed = true;
  }
  ensureDir(path.join(OUT, sub));
}
if (cleanFailed) console.log('   (无法删除旧文件，改为覆盖写；残留文件会在末尾列出)');
ensureDir(path.join(OUT, 'real'));
const gitkeep = path.join(OUT, 'real', '.gitkeep');
if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, '');


console.log('== ag-psd ==');
const agResult = generateAgPsd(path.join(OUT, 'agpsd'));
const entries = agResult.entries.map(e => ({ ...e, file: `agpsd/${e.file}` }));
const skipped = agResult.skipped.map(s => ({ ...s, file: `agpsd/${s.file}` }));
console.log(`   ${agResult.entries.length} 个文件，${agResult.skipped.length} 个跳过`);


console.log('== ImageMagick ==');
if (SKIP_MAGICK) {
  console.log('   --skip-magick，跳过');
} else {
  const magickOut = path.join(OUT, 'magick');
  const r = spawnSync('bash', [path.join(REPO_ROOT, 'tools', 'corpus', 'gen-magick.sh'), magickOut],
    { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log(`   gen-magick.sh 退出码 ${r.status}: ${(r.stderr || '').trim().split('\n')[0] || ''}`);
  }
  
  
  
  
  const fixed = fixMagickBlendKeys(magickOut);
  if (fixed.length) console.log(`   修正 mron→norm：${fixed.length} 个文件（${fixed.join('、')}）`);

  const indexPath = path.join(magickOut, 'index.tsv');
  let ok = 0, sk = 0;
  if (fs.existsSync(indexPath)) {
    for (const line of fs.readFileSync(indexPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (cols[0] === '!SKIP') {
        skipped.push({ file: `magick/${cols[1]}`, generator: 'imagemagick', features: (cols[2] || '').split(',').filter(Boolean), reason: cols[3] || '' });
        sk++;
        continue;
      }
      const [name, feats, note] = cols;
      const abs = path.join(magickOut, name);
      if (!fs.existsSync(abs)) continue;
      entries.push(manifestEntry({
        file: `magick/${name}`,
        generator: 'imagemagick',
        features: feats.split(',').filter(Boolean),
        buf: fs.readFileSync(abs),
        notes: note || undefined,
      }));
      ok++;
    }
  }
  console.log(`   ${ok} 个文件，${sk} 个跳过`);
}


console.log('== raw ==');
const rawResult = generateRaw(path.join(OUT, 'raw'));
for (const e of rawResult.entries) entries.push({ ...e, file: `raw/${e.file}` });
for (const s of rawResult.skipped) skipped.push({ ...s, file: `raw/${s.file}` });
console.log(`   ${rawResult.entries.length} 个文件，${rawResult.skipped.length} 个跳过`);





console.log('== corpus/ 里的其它文件（real/ 及外部投放）==');
const ownDirs = new Set(['agpsd', 'magick', 'raw']);
const extraFiles = walk(OUT)
  .filter(f => /\.ps[db]$/i.test(f))
  .filter(f => !ownDirs.has(path.relative(OUT, f).split(path.sep)[0]));
for (const abs of extraFiles) {
  const rel = path.relative(OUT, abs).split(path.sep).join('/');
  const isReal = rel.startsWith('real/');
  try {
    entries.push(manifestEntry({
      file: rel,
      generator: isReal ? 'real' : 'external',
      features: isReal ? ['source:photoshop'] : ['source:external'],
      buf: fs.readFileSync(abs),
      notes: isReal ? undefined : '不是 build-corpus.js 生成的，只做登记',
    }));
  } catch (e) {
    skipped.push({ file: rel, generator: isReal ? 'real' : 'external', reason: `probeHeader 失败: ${e.message}` });
  }
}
console.log(`   ${extraFiles.length} 个文件`);


for (const e of entries) {
  const abs = path.join(OUT, e.file);
  try {
    const b = fs.readFileSync(abs);
    const psd = ag.readPsd(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), AG_READ_OPTS);
    e.expect.agPsdReadable = true;
    e.expect.topLevelChildren = (psd.children || []).length;
  } catch (err) {
    e.expect.agPsdReadable = false;
    e.agPsdError = err.message;
  }
}


entries.sort((a, b) => a.file.localeCompare(b.file));
const featureCounts = {};
for (const e of entries) for (const f of e.features) featureCounts[f] = (featureCounts[f] || 0) + 1;

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  generators: {
    'ag-psd': 'tools/corpus/gen-agpsd.js',
    imagemagick: 'tools/corpus/gen-magick.sh',
    raw: 'tools/corpus/gen-raw.js',
    real: 'corpus/real/（用户手动放入的真实 Photoshop 导出）',
  },
  counts: {
    files: entries.length,
    byGenerator: entries.reduce((a, e) => (a[e.generator] = (a[e.generator] || 0) + 1, a), {}),
    agPsdReadable: entries.filter(e => e.expect.agPsdReadable).length,
  },
  featureCounts,
  notGenerated: skipped,
  files: entries,
};
ensureDir(OUT);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');


fs.writeFileSync(path.join(OUT, 'README.md'), buildReadme(manifest));


const giPath = path.join(REPO_ROOT, '.gitignore');
const gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
if (!gi.split('\n').some(l => l.trim() === 'corpus/')) {
  fs.writeFileSync(giPath, gi.replace(/\n*$/, '\n') + '# 测试语料（由 node tools/build-corpus.js 生成）\ncorpus/\n');
  console.log('.gitignore: 追加 corpus/');
}


const totalBytes = entries.reduce((a, e) => a + e.bytes, 0);
console.log('');
console.log(`语料共 ${entries.length} 个文件（${fmtBytes(totalBytes)}）→ ${OUT}`);
console.log(`  按生成器：${Object.entries(manifest.counts.byGenerator).map(([k, v]) => `${k}=${v}`).join('  ')}`);
console.log(`  ag-psd 可读：${manifest.counts.agPsdReadable}/${entries.length}`);
console.log(`  未能生成：${skipped.length} 项（原因见 corpus/README.md）`);
console.log(`  manifest：${path.join(OUT, 'manifest.json')}`);


const known = new Set(entries.map(e => e.file));
const stale = ['agpsd', 'magick', 'raw']
  .flatMap(sub => walk(path.join(OUT, sub)))
  .filter(f => /\.ps[db]$/i.test(f))
  .map(f => path.relative(OUT, f).split(path.sep).join('/'))
  .filter(f => !known.has(f));
if (stale.length) {
  console.log(`  残留（不在 manifest 里，可手动删除）：${stale.length} 个`);
  for (const f of stale.slice(0, 10)) console.log(`    ${f}`);
  if (stale.length > 10) console.log(`    …还有 ${stale.length - 10} 个`);
}

if (entries.length < 60) {
  console.error(`语料数 ${entries.length} < 60，检查生成器是否有失败`);
  process.exit(1);
}





function fixMagickBlendKeys(dir) {
  const touched = [];
  for (const abs of walk(dir)) {
    if (!/\.ps[db]$/i.test(abs)) continue;
    let buf;
    try { buf = fs.readFileSync(abs); } catch { continue; }
    let psd;
    try { psd = parsePsdFull(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)); } catch { continue; }
    let n = 0;
    for (const layer of psd.layers) {
      if (layer.blendKey !== 'mron' || !Number.isFinite(layer.offBlendKey)) continue;
      buf.write('norm', layer.offBlendKey, 4, 'latin1');
      n++;
    }
    if (n) { fs.writeFileSync(abs, buf); touched.push(path.basename(abs)); }
  }
  return touched;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function buildReadme(m) {
  const byDir = {};
  for (const e of m.files) {
    const parts = e.file.split('/');
    const d = parts.slice(0, -1).join('/');
    (byDir[d] || (byDir[d] = [])).push(e);
  }
  const lines = [];
  lines.push('# corpus/ — PSD 解析测试语料');
  lines.push('');
  lines.push('**这个目录是生成物，已在 .gitignore 里。** 重新生成：');
  lines.push('');
  lines.push('```sh');
  lines.push('node tools/build-corpus.js          # 生成全部语料 + manifest.json');
  lines.push('node tools/xcheck.js corpus/xxx.psd # 我们的解析 vs ag-psd vs psd-tools');
  lines.push('node server/test-conformance.js     # 全语料一致性 + round-trip');
  lines.push('```');
  lines.push('');
  lines.push(`生成时间：${m.generatedAt}　文件数：${m.counts.files}`);
  lines.push('');
  lines.push('## 目录');
  lines.push('');
  lines.push('| 目录 | 生成器 | 文件数 |');
  lines.push('|---|---|---|');
  for (const [d, list] of Object.entries(byDir).sort()) {
    lines.push(`| \`${d}/\` | ${list[0].generator} | ${list.length} |`);
  }
  lines.push('');
  lines.push('`corpus/real/` 留给真实 Photoshop 导出的样本：直接把 .psd/.psb 丢进去，');
  lines.push('重跑 `node tools/build-corpus.js` 就会进 manifest，被同一套脚本覆盖。');
  lines.push('');
  lines.push('## manifest.json');
  lines.push('');
  lines.push('每个文件一条记录：');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(m.files[0], null, 2));
  lines.push('```');
  lines.push('');
  lines.push('`expect` 里的 header 字段全部由 `tools/corpus/util.js` 的 `probeHeader()` ');
  lines.push('从**写出后的真实字节**读回，不是生成时的意图值，可以直接当断言基准。');
  lines.push('`expect.agPsdReadable=false` 表示 ag-psd 自己都读不了这个文件，交叉比对要跳过。');
  lines.push('');
  lines.push('## 特性覆盖');
  lines.push('');
  const feats = Object.entries(m.featureCounts).sort((a, b) => a[0].localeCompare(b[0]));
  const groups = {};
  for (const [f, n] of feats) {
    const g = f.includes(':') ? f.split(':')[0] : 'other';
    (groups[g] || (groups[g] = [])).push(`${f}(${n})`);
  }
  for (const [g, list] of Object.entries(groups).sort()) {
    lines.push(`- **${g}**: ${list.join('、')}`);
  }
  lines.push('');
  lines.push('## 没能生成的特性');
  lines.push('');
  if (!m.notGenerated.length) {
    lines.push('（无）');
  } else {
    lines.push('| 目标文件 | 生成器 | 原因 |');
    lines.push('|---|---|---|');
    for (const s of m.notGenerated) {
      lines.push(`| \`${s.file}\` | ${s.generator} | ${String(s.reason).replace(/\|/g, '\\|')} |`);
    }
  }
  lines.push('');
  lines.push('上表只说明"某个生成器做不到"，不代表整体缺覆盖 —— 备注里会写明是否已由别的');
  lines.push('生成器补上。真正补不了的（比如真实 Photoshop 才有的 Txt2/lnk2 细节），');
  lines.push('往 `corpus/real/` 放真实导出即可。');
  lines.push('');
  const quirks = m.files.filter(e => e.notes && e.notes.startsWith('quirk:'));
  if (quirks.length) {
    lines.push('## 已知 quirk（不要照着实现）');
    lines.push('');
    for (const q of quirks) lines.push(`- \`${q.file}\`：${q.notes.slice('quirk:'.length).trim()}`);
    lines.push('');
  }
  const unreadable = m.files.filter(e => !e.expect.agPsdReadable);
  if (unreadable.length) {
    lines.push('## ag-psd 读不了的文件');
    lines.push('');
    lines.push('| 文件 | ag-psd 报错 |');
    lines.push('|---|---|');
    for (const e of unreadable) lines.push(`| \`${e.file}\` | ${String(e.agPsdError).replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  return lines.join('\n');
}
