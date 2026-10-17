









import { GUEST } from './ps-script-guest.js';
import { TERMS_JSON } from '../../core/ps-terms.js';

const VENDOR = (() => { try { return new URL('/vendor/', location.href).href; } catch { return '/vendor/'; } })();
let modP = null, busy = false;
function loadModule() {
  if (!modP) modP = import( VENDOR + 'quickjs/quickjs.mjs').then(m => m.loadQuickJS(VENDOR + 'quickjs/emscripten-module.wasm')).catch(e => { modP = null; throw e; });
  return modP;
}


export function isUxpScript(src, name = '') {
  return /\.psjs$/i.test(name) || /\brequire\s*\(\s*['"](photoshop|uxp)['"]\s*\)/.test(src);
}





export function preprocess(src, includes = {}, depth = 0) {
  src = String(src).replace(/^﻿/, '');
  return src.replace(/^[ \t]*(?:#|\/\/@|@)(target|targetengine|strict|engine|script|includepath|include)\b(.*)$/gm, (m, kw, rest) => {
    if (kw !== 'include') return '';
    const nm = String(rest).trim().replace(/^["']|["'];?$/g, '').split(/[\\/]/).pop();
    if (depth > 8) throw new Error('#include 嵌套太深');
    const hit = Object.keys(includes).find(k => k.toLowerCase() === nm.toLowerCase());
    if (hit == null) throw Object.assign(new Error(`脚本 #include 了「${nm}」：浏览器里读不到别的文件。打开脚本时把它和主脚本一起选上（可多选）。`), { include: nm });
    return preprocess(includes[hit], includes, depth + 1).replace(/\n/g, ' ');   
  });
}







export async function runPsScript(source, o = {}) {
  if (busy) throw new Error('已经有一个脚本在运行');
  busy = true;
  const t0 = Date.now(); let hostMs = 0;
  const log = [];
  const name = o.fileName || 'script.jsx';
  const uxp = isUxpScript(source, name);
  const timeout = o.timeoutMs || 120000;
  let cancelled = false;
  const ctl = { cancel: () => { cancelled = true; } };
  if (o.onStart) o.onStart(ctl);
  let rt = null, ctx = null;
  const deferreds = new Set();
  try {
    let code;
    try { code = preprocess(source, o.includes || {}); }
    catch (e) { return { ok: false, error: { message: e.message, line: 0 }, log: '', ms: 0 }; }
    const M = await (o.quickjs || loadModule());
    rt = M.newRuntime();
    rt.setMemoryLimit(512 * 1048576);
    rt.setMaxStackSize(4 * 1048576);
    rt.setInterruptHandler(() => cancelled || (Date.now() - t0 - hostMs) > timeout);
    ctx = rt.newContext();
    const host = o.host;
    const enc = v => JSON.stringify(v === undefined ? null : v);
    const errJ = e => JSON.stringify({ __err: String(e && e.message || e), code: e && e.code });
    const timed = async p => { const s = Date.now(); try { return await p; } finally { hostMs += Date.now() - s; } };

    
    let chain = Promise.resolve(), inflight = 0, wake = null;
    const H = ctx.newObject();
    const fGet = ctx.newFunction('get', (nH, aH) => {
      const n = ctx.getString(nH), a = JSON.parse(ctx.getString(aH));
      try { let v = host.get(n, a); if (n === 'info' && inflight && v) v = { ...v, pending: inflight }; return ctx.newString(enc(v)); } catch (e) { return ctx.newString(errJ(e)); }
    });
    const fDoS = ctx.newAsyncifiedFunction('doS', async (nH, aH) => {
      const n = ctx.getString(nH), a = JSON.parse(ctx.getString(aH));
      if (uxp) return ctx.newString(JSON.stringify({ __err: 'UXP 脚本里请用异步写法（await），不能用同步的对话框 / 文件对话框' }));
      try { return ctx.newString(enc(await timed(host.do(n, a)))); } catch (e) { return ctx.newString(errJ(e)); }
    });
    
    const kick = () => { if (wake) { const w = wake; wake = null; w(); } };
    const enqueue = (n, a) => {
      inflight++;
      const p = chain.then(() => n === 'sync' ? {} : timed(host.do(n, a)));
      chain = p.catch(() => {});
      p.finally(() => { inflight--; kick(); });
      return p;
    };
    let queueErr = null;
    const fDoQ = ctx.newFunction('doQ', (nH, aH) => {
      const n = ctx.getString(nH), a = JSON.parse(ctx.getString(aH));
      enqueue(n, a).catch(e => { if (!queueErr) queueErr = e; });
    });
    const fDoP = ctx.newFunction('doP', (nH, aH) => {
      const n = ctx.getString(nH), a = JSON.parse(ctx.getString(aH));
      const d = ctx.newPromise(); deferreds.add(d);
      const settle = s => { if (!deferreds.has(d)) return; deferreds.delete(d); const h = ctx.newString(s); d.resolve(h); h.dispose(); d.dispose(); };
      enqueue(n, a).then(v => settle(enc(v)), e => settle(errJ(e)));
      return d.handle;
    });
    const fLog = ctx.newFunction('log', tH => { const t = ctx.getString(tH); log.push(t); if (o.onLog) o.onLog(t); });
    for (const [k, f] of [['get', fGet], ['doS', fDoS], ['doQ', fDoQ], ['doP', fDoP], ['log', fLog]]) { ctx.setProp(H, k, f); f.dispose(); }
    ctx.setProp(ctx.global, '__host', H); H.dispose();
    for (const [k, v] of [['__mode', uxp ? 'uxp' : 'es'], ['__terms', TERMS_JSON()], ['__fileName', name]]) { const h = ctx.newString(v); ctx.setProp(ctx.global, k, h); h.dispose(); }
    if (o.args) { const h = ctx.newString(JSON.stringify(o.args)); ctx.setProp(ctx.global, '__args', h); h.dispose(); }

    const boot = ctx.evalCode(GUEST, 'psd_editor-dom.js');
    if (boot.error) { const e = ctx.dump(boot.error); boot.error.dispose(); throw new Error('脚本环境初始化失败：' + (e && e.message || e)); }
    boot.value.dispose();

    if (!uxp) {
      const r = await ctx.evalCodeAsync(code, name);
      if (r.error) { const e = ctx.dump(r.error); r.error.dispose(); return fail(e); }
      const value = safeDump(ctx, r.value); r.value.dispose();
      const jr = rt.executePendingJobs(); if (jr.error) jr.error.dispose();
      return { ok: true, value, log: log.join(''), ms: Date.now() - t0 };
    }
    
    const r = ctx.evalCode('(async () => {' + code + '\n})()', name);
    if (r.error) { const e = ctx.dump(r.error); r.error.dispose(); return fail(e); }
    const p = r.value;
    try {
      for (;;) {
        if (cancelled) return fail({ message: '已停止' });
        const jr = rt.executePendingJobs();
        if (jr.error) { const e = ctx.dump(jr.error); jr.error.dispose(); return fail(e); }
        const st = ctx.getPromiseState(p);
        if (st.type === 'fulfilled') { const value = safeDump(ctx, st.value); st.value.dispose(); await chain; if (queueErr) return fail(queueErr); return { ok: true, value, log: log.join(''), ms: Date.now() - t0 }; }
        if (st.type === 'rejected') { const e = ctx.dump(st.error); st.error.dispose(); return fail(e); }
        if (st.notAPromise) { st.value.dispose(); return { ok: true, log: log.join(''), ms: Date.now() - t0 }; }
        if (rt.hasPendingJob()) continue;
        if (!inflight) return fail({ message: '脚本在等一个永远不会完成的 Promise（没有正在进行的操作）' });
        await new Promise(res => { wake = res; });
      }
    } finally { p.dispose(); }
  } catch (e) {
    return fail(e);
  } finally {
    

    try { if (ctx) { for (const d of deferreds) d.dispose(); deferreds.clear(); ctx.dispose(); } if (rt) rt.dispose(); }
    catch { if (!o.quickjs) modP = null; }
    busy = false;
  }

  function fail(e) {
    const msg = e && (e.message || (typeof e === 'string' ? e : '')) || String(e);
    const stack = e && e.stack || '';
    const m = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)').exec(stack) || /:(\d+)(?::\d+)?\)?\s*$/m.exec(stack);
    const interrupted = /interrupted/i.test(msg);
    return { ok: false, error: { message: interrupted ? (cancelled ? '已停止' : `脚本运行超过 ${Math.round(timeout / 1000)} 秒，已中止`) : (e && e.name && e.name !== 'Error' && e.name !== 'PSError' ? e.name + '：' : '') + msg,
      line: m ? +m[1] : 0, stack, number: e && e.number }, log: log.join(''), ms: Date.now() - t0 };
  }
}
function safeDump(ctx, h) { try { const v = ctx.dump(h); JSON.stringify(v); return v; } catch { return undefined; } }

export default { runPsScript, isUxpScript, preprocess };
