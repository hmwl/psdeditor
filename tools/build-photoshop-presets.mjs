


import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readAbr } from '../core/abr.js';
import { readAco } from '../core/swatches.js';
import { readGrd } from '../core/grd.js';
import { readPat } from '../core/pat.js';
import { readCsh } from '../core/csh.js';
import { readAsl, effectPatternIds } from '../core/asl.js';
import { readTpl } from '../core/tpl.js';
import { parseAtn } from '../core/atn.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const source = path.resolve(option('--source', '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app/Contents/Required'));
const extraSource = path.resolve(option('--extra-source', path.join(source, '../../..', 'Presets')));
const output = path.resolve(option('--output', path.join(root, 'web/assets/ps-presets')));
const check = args.includes('--check');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const displayName = s => String(s || '').replace(/^\$\$\$\/[^=]*=/, '');
const formats = {
  abr: ['brushes', readAbr, 'brushes'], aco: ['swatches', readAco], grd: ['gradients', readGrd],
  pat: ['patterns', readPat], csh: ['shapes', readCsh], asl: ['styles', readAsl, 'styles'],
  tpl: ['toolPresets', readTpl, 'presets'], atn: ['actions', parseAtn, 'actions'],
};
const commonLimits = {
  abr: ['Brush parameters and embedded tips parsed; Photoshop bristle/art rendering equivalence is not established.'],
  aco: ['CMYK, Lab and D50 XYZ previews use local conversion, not a document ICC transform.'],
  grd: ['Parsed gradient records are loadable; interpolation and noise output require separate Photoshop comparison.'],
  pat: ['Embedded pattern pixels parsed; loading allocates decoded RGBA in addition to the pack bytes.'],
  csh: ['Vector subpaths parsed; fill rules and rasterization require separate visual comparison.'],
  asl: ['Style descriptors and embedded pattern dependencies parsed; effect output equivalence is not established.'],
  tpl: ['Native tool options are not completely mapped; records without psd_editorOptions remain unsupported even when the tool class is recognized.'],
  atn: ['ATN parsing is verified, not execution of every action event; preflight with action decoder before playback.'],
};
const names = (await fs.readdir(source)).filter(n => /^(Default|Legacy|Essentials)(?: |\.)/.test(n) && formats[path.extname(n).slice(1)]).sort((a, b) => a.localeCompare(b, 'en'));
const files = names.map(sourceFile => ({ sourceFile, directory: source, origin: 'required' }));
async function inventory(directory, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...await inventory(directory, relative));
    else if (entry.isFile() && formats[path.extname(entry.name).slice(1)] && entry.name.toLowerCase() !== 'video actions.atn') out.push(relative);
  }
  return out;
}
try {
  const extraFiles = (await inventory(extraSource)).sort((a, b) => a.localeCompare(b, 'en'));
  files.push(...extraFiles.map(sourceFile => ({ sourceFile, directory: extraSource, origin: 'presets' })));
} catch (e) {
  if (args.includes('--extra-source') || e.code !== 'ENOENT') throw e;
  console.warn('Optional adjacent Presets directory not found: ' + extraSource);
}
const packs = [];
for (const { sourceFile, directory, origin } of files) {
  const format = path.extname(sourceFile).slice(1), [kind, parser, listKey] = formats[format];
  const bytes = await fs.readFile(path.join(directory, sourceFile));
  const rawId = sourceFile.slice(0, -(format.length + 1)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = (origin === 'presets' ? 'preset-' : '') + rawId;
  const assetFile = id + '.' + format;
  let parsed, list = [], parseError = null;
  try { parsed = parser(bytes); list = listKey ? parsed[listKey] : parsed; }
  catch (e) { parseError = String(e.message || e); }
  const warnings = [...(parsed?.warnings || [])];
  if (parseError) warnings.push(parseError);
  const dependencies = parsed?.patterns || [];
  const patternIds = new Set(dependencies.map(p => p.id));
  const unresolved = new Set();
  const items = list.map(item => {
    const out = { name: displayName(item.name), originalName: item.name || '' };
    if (item.id) out.id = item.id;
    if (item.unsupported != null) out.unsupported = item.unsupported;
    if (item.approx) out.approximate = true;
    if (item.missing) out.missingSample = true;
    if (item.tool) { out.tool = item.tool; out.psClass = item.psClass; }
    if (item.width || item.w) { out.width = item.width || item.w; out.height = item.height || item.h; }
    if (item.steps) { out.steps = item.steps.length; out.events = [...new Set(item.steps.map(s => s.event))]; }
    const refs = format === 'asl' ? effectPatternIds(item.effects) : [];
    const brush = format === 'tpl' ? item.brush : item;
    if (brush?.dyn?.texture?.on && brush.dyn.texture.pattern) refs.push(brush.dyn.texture.pattern);
    if (refs.length) out.patternIds = [...new Set(refs)];
    refs.forEach(ref => { if (!patternIds.has(ref)) unresolved.add(ref); });
    return out;
  });
  const unsupportedCount = items.filter(i => i.unsupported != null).length;
  if (unsupportedCount) warnings.push(`${unsupportedCount} records cannot be applied with the current tool/option mappings.`);
  if (unresolved.size) warnings.push(`${unresolved.size} referenced pattern IDs are not embedded in this pack.`);
  const digest = sha(bytes);
  const group = origin === 'presets' ? 'presets' : sourceFile.startsWith('Legacy') ? 'legacy' : sourceFile.startsWith('Default') ? 'default' : 'essentials';
  const pack = {
    id, kind, format, group, name: path.basename(sourceFile, '.' + format),
    url: '/assets/ps-presets/' + assetFile, byteLength: bytes.length,
    sha256: digest, sourceFile, sourceDirectory: directory, origin, sourceGroup: origin === 'presets' ? path.dirname(sourceFile) : group, sourceSha256: digest, count: list.length,
    supportedCount: list.length - unsupportedCount, approximateCount: items.filter(i => i.approximate).length,
    default: group === 'default' && bytes.length <= 8 * 1024 * 1024 && !parseError,
    parseStatus: parseError ? 'failed' : 'parsed', warnings, limitations: commonLimits[format],
    patternCount: dependencies.length, unsupportedCount, unresolvedPatternIds: [...unresolved], items,
  };
  if (check) {
    const existing = await fs.readFile(path.join(output, assetFile));
    if (sha(existing) !== digest) throw new Error('Preset asset differs: ' + assetFile);
  } else { await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, assetFile), bytes); }
  packs.push(pack);
  console.log(`${sourceFile}: ${list.length} records, ${dependencies.length} embedded patterns, ${bytes.length} bytes${warnings.length ? ', ' + warnings.length + ' warnings' : ''}`);
}
let sourceVersion = 'unknown';
try {
  const plist = await fs.readFile(path.join(path.dirname(source), 'Info.plist'), 'utf8');
  sourceVersion = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || 'unknown';
} catch {  }
const manifest = {
  schemaVersion: 1, sourceVersion,
  source: { application: 'Adobe Photoshop 2026', requiredDirectory: source, extraPresetsDirectory: extraSource, exclusions: ['Presets/Actions/Video Actions.atn', 'Locales tool preset libraries'], extraction: 'byte-identical original packs; sha256 verified', translation: 'item.name strips Adobe $$$/key= prefix; originalName retained' },
  loading: { strategy: 'lazy per-pack', defaultPackByteLimit: 8 * 1024 * 1024, decodedPixelMemoryMayExceedFileBytes: true },
  totalBytes: packs.reduce((s, p) => s + p.byteLength, 0), packs,
};
const json = JSON.stringify(manifest, null, 2) + '\n';
if (check) { if (await fs.readFile(path.join(output, 'manifest.json'), 'utf8') !== json) throw new Error('Preset manifest differs; rebuild required'); }
else await fs.writeFile(path.join(output, 'manifest.json'), json);
console.log(`${check ? 'Verified' : 'Extracted'} ${packs.length} packs, ${manifest.totalBytes} bytes.`);
