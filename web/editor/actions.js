











const REG = new Map();
const listeners = new Set();

export function register(id, def) {
  if (typeof def === 'function') def = { run: def };
  if (!def || typeof def.run !== 'function') throw new Error('actions.register: ' + id + ' 缺 run()');
  REG.set(id, def);
  for (const fn of listeners) fn(id);
  return def;
}
export function registerAll(map) { for (const [id, def] of Object.entries(map)) register(id, def); }





export function registerLazy(ids, load, { enabled, why } = {}) {
  for (const id of ids) {
    if (REG.has(id)) continue;
    const stub = {
      lazy: true,
      run: (...a) => Promise.resolve(load()).then(() => {
        const d = REG.get(id);
        if (!d || d === stub) { console.warn('[命令] 按需加载后仍没有真实定义：' + id); return false; }
        return run(id, ...a);
      }),
      ...(enabled ? { enabled } : {}), ...(why ? { why } : {}),
    };
    register(id, stub);
  }
}
export function has(id) { return REG.has(id); }
export function get(id) { return REG.get(id) || null; }


let gate = null, onBlocked = null;
export function setGate(fn, blocked) { gate = fn || null; onBlocked = blocked || null; }
const gated = id => { if (!gate) return ''; try { return gate(id) || ''; } catch { return ''; } };
export function enabled(id) {
  const d = REG.get(id); if (!d) return false;
  if (gated(id)) return false;
  try { return d.enabled ? !!d.enabled() : true; } catch { return false; }
}

export function why(id) {
  { const g = gated(id); if (g) return g; }
  const d = REG.get(id); if (!d || !d.why) return '';
  try { return d.why() || ''; } catch { return ''; }
}
export function checked(id) {
  const d = REG.get(id); if (!d || !d.checked) return null;
  try { return !!d.checked(); } catch { return null; }
}

const runListeners = new Set();
export function onRun(fn) { runListeners.add(fn); return () => runListeners.delete(fn); }
export function run(id, ...args) {
  const d = REG.get(id); if (!d) return false;
  { const g = gated(id); if (g) { try { onBlocked && onBlocked(id, g); } catch {} return false; } }
  if (d.enabled) { let ok = false; try { ok = !!d.enabled(); } catch {} if (!ok) return false; }
  for (const fn of runListeners) { try { fn(id, args); } catch {} }
  const r = d.run(...args);
  return r === undefined ? true : r;
}
export function onRegister(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function list() { return [...REG.keys()]; }
export const actions = { register, registerAll, registerLazy, has, get, enabled, why, checked, run, onRegister, onRun, list, setGate };
export default actions;
