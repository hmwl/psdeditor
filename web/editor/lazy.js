























const humanCause = e => {
  const s = (e && e.message) || String(e);
  return /dynamically imported module|Importing a module script failed|NetworkError|Failed to fetch|Cannot find module|ERR_MODULE_NOT_FOUND|Load failed/i.test(s)
    ? '没能下载到这段代码（网络中断，或站点刚发过新版本、旧文件已被替换）'
    : s;
};


export function whenIdle(fn, timeout = 2000) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof g.requestIdleCallback === 'function') return g.requestIdleCallback(() => fn(), { timeout });
  return setTimeout(fn, 1);
}






export function lazyModule(loader, label) {
  let mod = null;          
  let pending = null;      
  let error = null;        
  let tries = 0;
  const waiters = new Set();

  const api = {
    label,
    
    get ready() { return mod !== null; },
    
    get loading() { return pending !== null; },
    
    get error() { return error; },
    
    get tries() { return tries; },

    
    peek() { return mod; },

    
    get() {
      if (!mod) throw new Error(`「${label}」模块还没加载完成（请稍候再试；若一直失败请刷新页面）`);
      return mod;
    },

    
    load() {
      if (mod) return Promise.resolve(mod);
      if (!pending) {
        tries++;
        pending = Promise.resolve().then(loader).then(m => {
          mod = m; error = null; pending = null;
          for (const cb of [...waiters]) { try { cb(m); } catch (e) { console.error(`[lazy] ${label} onReady 回调出错`, e); } }
          waiters.clear();
          return m;
        }, e => {
          
          pending = null;
          error = e instanceof Error ? e : new Error(String(e));
          throw error;
        });
      }
      return pending;
    },

    
    prefetch() {
      if (mod || pending) return;
      whenIdle(() => { if (!mod && !pending) api.load().catch(() => {}); });
    },

    
    onReady(cb) {
      if (mod) { cb(mod); return; }
      waiters.add(cb);
    },

    
    statusText() {
      if (mod) return '';
      if (error) return `「${label}」模块加载失败：${humanCause(error)}`;
      return `正在加载「${label}」模块…`;
    },
  };
  return api;
}
