












import fs from 'node:fs';
import path from 'node:path';
import * as espree from 'espree';
import { Linter } from 'eslint';
import globals from 'globals';

const DIR = path.join(import.meta.dirname, '..', 'web', 'editor', 'app');
const check = process.argv.includes('--check');
const files = fs.readdirSync(DIR).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
const parse = code => espree.parse(code, { ecmaVersion: 2024, sourceType: 'module', range: true });


const owner = new Map();
const declNames = id => {
  const out = [];
  (function w(p) {
    if (!p) return;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(q => w(q.type === 'RestElement' ? q.argument : q.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(w);
    else if (p.type === 'AssignmentPattern') w(p.left);
    else if (p.type === 'RestElement') w(p.argument);
  })(id);
  return out;
};
for (const f of files) {
  const ast = parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const n of ast.body) {
    if (n.type !== 'ExportNamedDeclaration' || !n.declaration) continue;
    const d = n.declaration;
    const names = d.type === 'VariableDeclaration' ? d.declarations.flatMap(x => declNames(x.id)) : d.id ? [d.id.name] : [];
    for (const nm of names) {
      if (owner.has(nm) && owner.get(nm) !== f) console.warn(`重名导出：${nm}（${owner.get(nm)} 与 ${f}）`);
      owner.set(nm, f);
    }
  }
}


const linter = new Linter();
const lintConfig = [{
  languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.worker, __PSD_EDITOR_VERSION__: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(?!)' }] },
}];
let changed = 0, problems = 0;
for (const f of files) {
  const file = path.join(DIR, f);
  const code = fs.readFileSync(file, 'utf8');
  const ast = parse(code);
  const crossDecls = ast.body.filter(n => n.type === 'ImportDeclaration' && /^\.\/\d\d-/.test(n.source.value) && n.specifiers.length);
  const want = new Map();   
  for (const n of crossDecls) for (const s of n.specifiers) {
    if (!want.has(n.source.value)) want.set(n.source.value, new Set());
    want.get(n.source.value).add(s.local.name);
  }
  const msgs = linter.verify(code, lintConfig, { filename: file });
  for (const m of msgs) {
    const nm = (m.message.match(/'([^']+)'/) || [])[1];
    if (!nm) continue;
    if (m.ruleId === 'no-undef') {
      const o = owner.get(nm);
      if (!o || o === f) { console.warn(`${f}:${m.line} 未定义且没有文件导出：${nm}`); problems++; continue; }
      const key = './' + o;
      if (!want.has(key)) want.set(key, new Set());
      want.get(key).add(nm);
    } else if (m.ruleId === 'no-unused-vars') {
      for (const [k, set] of want) if (set.has(nm) && crossDecls.some(d => d.source.value === k && d.specifiers.some(s => s.local.name === nm))) set.delete(nm);
    }
  }
  
  const lines = [];
  for (const [src, set] of [...want].filter(([, s]) => s.size).sort((a, b) => a[0].localeCompare(b[0]))) {
    const names = [...set].sort();
    const one = `import { ${names.join(', ')} } from '${src}';`;
    if (one.length <= 120) { lines.push(one); continue; }
    const rows = []; let row = '';
    for (const n of names) { const add = (row ? ' ' : '') + n + ','; if ((row + add).length > 110) { rows.push(row); row = n + ','; } else row += add; }
    if (row) rows.push(row);
    lines.push(`import {\n${rows.map(r => '  ' + r).join('\n')}\n} from '${src}';`);
  }
  const block = lines.join('\n');
  let out;
  if (crossDecls.length) {
    const start = crossDecls[0].range[0], end = crossDecls.at(-1).range[1];
    const between = code.slice(start, end);
    
    const stripped = crossDecls.reduceRight((s, d) => s.slice(0, d.range[0] - start) + s.slice(d.range[1] - start), between);
    if (stripped.trim()) { console.warn(`${f}：跨文件 import 不连续，跳过`); problems++; continue; }
    out = code.slice(0, start) + block + code.slice(end);
  } else if (block) {
    const lastImport = ast.body.filter(n => n.type === 'ImportDeclaration').at(-1);
    const at = lastImport ? lastImport.range[1] : 0;
    out = code.slice(0, at) + '\n' + block + code.slice(at);
  } else out = code;
  if (out !== code) {
    changed++;
    if (check) console.log(`需要更新：${f}`);
    else fs.writeFileSync(file, out);
  }
}
console.log(check ? `app 跨文件 import：${changed ? changed + ' 个文件需要更新（node tools/app-imports.js）' : '已是最新'}` : `更新了 ${changed} 个文件`);
if (problems || (check && changed)) process.exitCode = 1;
