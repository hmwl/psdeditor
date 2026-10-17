

























import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';




export function relativeSpecifiers(text) {
  const out = new Set();
  for (const m of text.matchAll(/["'](\.\/[A-Za-z0-9._-]+\.js)["']/g)) out.add(m[1].slice(2));
  return [...out];
}









const sanitizeBase = s => (s.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+/, '') || 'chunk');

const opaqueBase = hex => [...hex.slice(0, 6)].map(c => 'abcdefghijklmnop'[parseInt(c, 16)]).join('');














export function nameByContentHash({ files, entryOut, deps, bases = new Map(), hashLen = 10, opaque = true }) {
  const names = new Map();          
  const labels = new Map();         
  const text = new Map();           

  for (const [name, ds] of deps) for (const d of ds) if (!files.has(d)) throw new Error(`metafile 声明 ${name} 引用了 ${d}，但产物里没有这个文件`);
  const rewrite = (t, d, to) => { for (const q of ['"', "'"]) t = t.split(`${q}./${d}${q}`).join(`${q}./${to}${q}`); return t; };
  const nameOf = (name, t) => {
    const digest = crypto.createHash('sha256').update(t).digest('hex');
    const label = sanitizeBase(bases.get(name) || (name === entryOut ? 'app' : 'shared'));
    const final = `${opaque ? opaqueBase(digest.slice(hashLen, hashLen + 6)) : label}.${digest.slice(0, hashLen)}.js`;
    names.set(name, final); labels.set(final, label);
  };

  





  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], sccs = [];
  let counter = 0;
  const strong = v => {
    idx.set(v, counter); low.set(v, counter); counter++; stack.push(v); onStack.add(v);
    for (const w of deps.get(v) || []) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = stack.pop(); onStack.delete(w); c.push(w); } while (w !== v); sccs.push(c); }
  };
  for (const n of files.keys()) if (!idx.has(n)) strong(n);
  
  for (const comp of sccs) {
    const inComp = new Set(comp);
    const pre = new Map();
    for (const n of comp.sort()) {
      let t = files.get(n);
      for (const d of deps.get(n) || []) if (!inComp.has(d)) t = rewrite(t, d, names.get(d));
      pre.set(n, t);
    }
    for (const n of comp) nameOf(n, pre.get(n));
    for (const n of comp) {
      let t = pre.get(n);
      for (const d of deps.get(n) || []) if (inComp.has(d)) t = rewrite(t, d, names.get(d));
      text.set(n, t);
    }
  }
  
  for (const [n, t] of text) for (const other of files.keys()) {
    if (t.includes(`./${other}"`) || t.includes(`./${other}'`))
      throw new Error(`改名后 ${n} 里仍残留原始 chunk 名 ./${other}（metafile 的依赖表漏了它？）`);
  }

  const seen = new Set();
  const out = new Map();
  for (const [name, final] of names) {
    if (seen.has(final)) throw new Error(`两个 chunk 定到了同一个文件名 ${final}（基名撞车，请调整 baseNameOf）`);
    seen.add(final);
    out.set(final, text.get(name));
  }
  return { files: out, entry: names.get(entryOut), names, labels };
}






export function assertResolvable(files) {
  const have = new Set(files.keys());
  const bad = [];
  let refs = 0;
  for (const [name, text] of files) {
    for (const spec of relativeSpecifiers(text)) {
      refs++;
      if (!have.has(spec)) bad.push(`${name} → ./${spec}`);
    }
  }
  if (bad.length) throw new Error(
    `产物里的相对 import 指向了不存在的文件（chunk 改名 / 说明符重写出错，上线就是 404）：\n` +
    bad.map(b => '  · ' + b).join('\n'));
  return { chunks: files.size, refs };
}










const ROOTLESS = p => path.resolve(process.cwd(), p);

const PKG_VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;   

export async function buildPageChunks({ esbuild, entryFile, outdir, dev = false, minify = true }) {
  const r = await esbuild.build({
    entryPoints: [entryFile], bundle: true, format: 'esm', target: ['es2022'], platform: 'browser',
    write: false, minify, legalComments: 'none', charset: 'utf8', logLevel: 'silent',
    external: ['node:*'],                                  
    define: { 'globalThis.__PSD_EDITOR_DEV__': String(dev), 'window.__PSD_EDITOR_DEV__': String(dev), '__PSD_EDITOR_VERSION__': JSON.stringify(PKG_VERSION) },
    splitting: true, outdir, entryNames: '[name]', chunkNames: 'chunk-[hash]', metafile: true,
  });
  const rel = p => path.relative(outdir, p).split(path.sep).join('/');
  const raw = new Map(r.outputFiles.map(f => [rel(f.path), f.text]));

  
  const deps = new Map(), statics = new Map(), bases = new Map(), byOut = new Map();
  for (const k of Object.keys(r.metafile.outputs)) byOut.set(k, rel(path.resolve(process.cwd(), k)));
  let entryOut = null;
  for (const [k, v] of Object.entries(r.metafile.outputs)) {
    const name = byOut.get(k);
    const of = kinds => (v.imports || []).filter(i => kinds.includes(i.kind))
      .map(i => byOut.get(i.path)).filter(n => n && raw.has(n));
    deps.set(name, of(['import-statement', 'dynamic-import']));
    statics.set(name, of(['import-statement']));            
    
    if (v.entryPoint && ROOTLESS(v.entryPoint) === path.resolve(entryFile)) { entryOut = name; bases.set(name, 'app'); }
    else bases.set(name, v.entryPoint ? path.basename(v.entryPoint).replace(/\.[^.]+$/, '') : 'shared');
  }
  if (!entryOut) throw new Error('找不到入口 chunk（metafile 里没有 entryPoint 指向 ' + entryFile + '）');

  const named = nameByContentHash({ files: raw, entryOut, deps, bases });
  assertResolvable(named.files);

  

  const eager = new Set([named.entry]);
  const walk = n => { for (const d of statics.get(n) || []) { const f = named.names.get(d); if (f && !eager.has(f)) { eager.add(f); walk(d); } } };
  walk(entryOut);

  return { ...named, raw, deps, statics, eager, entryOut, metafile: r.metafile };
}
