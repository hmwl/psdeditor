









































import { registerState } from './runtime.js';
import fs from 'node:fs';
import path from 'node:path';
import { CORE_OP_CATALOG } from './catalog-core.js';

const HERE = import.meta.dirname;




export const ENDPOINTS = [
  { method: 'GET', path: '/api/profiles', feature: 'api.profiles', title: 'ICC 配置列表' },
  { method: 'POST', path: '/api/psd/info', feature: 'api.psd.info', title: '智能对象结构' },
  { method: 'POST', path: '/api/render', feature: 'api.render', title: '换图渲染' },
  { method: 'POST', path: '/api/doc/new', feature: 'api.doc.new', title: '新建文档' },
  { method: 'POST', path: '/api/doc/inspect', feature: 'api.doc.inspect', title: '图层树' },
  { method: 'POST', path: '/api/doc/layer-preview', feature: 'api.doc.layer-preview', title: '单层预览' },
  { method: 'POST', path: '/api/doc/composite', feature: 'api.doc.composite', title: '合成图快照' },
  { method: 'POST', path: '/api/doc/render', feature: 'api.doc.render', title: '按图层渲染' },
  { method: 'POST', path: '/api/doc/artboards', feature: 'api.doc.artboards', title: '画板清单' },
  { method: 'POST', path: '/api/doc/export-artboards', feature: 'api.doc.export-artboards', title: '导出画板' },
  { method: 'POST', path: '/api/doc/patch', feature: 'api.doc.patch', title: '（旧）简单属性修改' },
  { method: 'POST', path: '/api/doc/validate', feature: 'api.doc.validate', title: '体检' },
  { method: 'POST', path: '/api/doc/edit', feature: 'api.doc.edit', title: '统一编辑' },
  { method: 'POST', path: '/api/doc/edit/plan', feature: 'api.doc.edit.plan', title: '编辑 dry-run' },
  { method: 'POST', path: '/api/doc/edit/incremental', feature: 'api.doc.edit.incremental', title: '增量编辑' },
  { method: 'POST', path: '/api/so/resolve', feature: 'api.so.resolve', title: '片段：解析' },
  { method: 'POST', path: '/api/so/writeback', feature: 'api.so.writeback', title: '片段：写回' },
  { method: 'POST', path: '/api/so/filters', feature: 'api.so.filters', title: '片段：智能滤镜' },
  { method: 'POST', path: '/api/so/filters/writeback', feature: 'api.so.filters.writeback', title: '片段：智能滤镜写回' },
  { method: 'GET', path: '/api/fonts', feature: 'api.fonts', caps: ['fonts.library'], title: '字体库：列出' },
  { method: 'POST', path: '/api/fonts', feature: 'api.fonts', caps: ['fonts.library'], title: '字体库：上传' },
  { method: 'DELETE', path: '/api/fonts/:id', feature: 'api.fonts', caps: ['fonts.library'], title: '字体库：删除' },
  { method: 'POST', path: '/mcp', feature: 'mcp', title: 'MCP 端点' },
  { method: 'POST', path: '/mcp/k/:key', feature: 'mcp', title: 'MCP 端点（key 在路径里）' },
  { method: 'POST', path: '/mcp/upload', feature: 'mcp', title: 'MCP 直传' },
];


export const CAPABILITIES = [
  { id: 'fonts.library', title: '自传字体 · 字体库', desc: '把字体存进这把 key 的字体库（/api/fonts、MCP upload_font），编辑时服务端按 PostScript 名自动使用' },
  { id: 'fonts.request', title: '自传字体 · 单次上传', desc: '/api/doc/edit 的 multipart 里带 font 字段，只在这次请求里用' },
  { id: 'fonts.map', title: '自传字体 · 字体映射', desc: 'output.fontMap / MCP font_map：指定 PSD 里某个字体名用哪款字体' },
];


const providers = [];

export function addFeatureProvider(fn) { providers.push(fn); cachedFeatures = null; }
let cachedFeatures = null;
export function featureList() {
  if (cachedFeatures) return cachedFeatures;
  const out = new Map();
  const add = f => { if (!out.has(f.id)) out.set(f.id, f); };
  for (const e of ENDPOINTS) add({ id: e.feature, group: e.feature === 'mcp' ? 'mcp' : 'api', title: e.title });
  for (const c of CAPABILITIES) add({ id: c.id, group: 'capability', title: c.title, desc: c.desc });
  for (const p of providers) { try { for (const f of p()) add(f); } catch {  } }
  cachedFeatures = [...out.values()];
  return cachedFeatures;
}
export const featureTitle = id => (featureList().find(f => f.id === id) || {}).title || id;



export const DEFAULT_PLANS = {
  default: 'basic',
  session: 'advanced',
  anon: 'advanced',
  plans: {
    basic: {
      title: '基础', desc: '全部端点 / 编辑 op / MCP 工具；不含自传字体等高级能力',
      
      
      features: ['api.*', 'op.*', 'mcp', 'mcp.tool.*'],
      limits: { rpm: 60 },
      rates: {},
    },
    advanced: {
      title: '高级', desc: '基础档全部能力 + 全部高级能力（目前是自传字体），更高的频率',
      inherits: 'basic',
      features: ['*'],
      limits: { rpm: 240 },
      rates: {},
    },
  },
};

const PLANS_FILE = () => process.env.PSD_EDITOR_PLANS_FILE || path.join(HERE, 'plans.json');
let CONFIG = null, configMtime = -1, configCheckedAt = 0, configError = null;

function validateConfig(c) {
  if (!c || typeof c !== 'object' || !c.plans || typeof c.plans !== 'object') throw new Error('缺 plans 对象');
  for (const [id, p] of Object.entries(c.plans)) {
    if (!/^[a-z0-9_-]{1,32}$/i.test(id)) throw new Error(`档位 id 不合法：${id}`);
    if (p.inherits && !c.plans[p.inherits]) throw new Error(`档位 ${id} 继承了不存在的 ${p.inherits}`);
    if (p.features && !Array.isArray(p.features)) throw new Error(`档位 ${id} 的 features 必须是数组`);
    for (const [k, v] of Object.entries(p.rates || {})) normRate(v, `${id}.rates.${k}`);
  }
  
  for (const id of Object.keys(c.plans)) { const seen = new Set(); let cur = id; while (cur) { if (seen.has(cur)) throw new Error(`档位继承成环：${[...seen].join(' → ')}`); seen.add(cur); cur = c.plans[cur].inherits; } }
  for (const k of ['default', 'session', 'anon']) if (c[k] && !c.plans[c[k]]) throw new Error(`${k} 指向不存在的档位 ${c[k]}`);
  return { default: c.default || Object.keys(c.plans)[0], session: c.session || c.default || Object.keys(c.plans)[0], anon: c.anon || c.session || c.default, plans: c.plans };
}


export function planConfig() {
  const now = Date.now();
  if (CONFIG && now - configCheckedAt < 3000) return CONFIG;
  configCheckedAt = now;
  const file = PLANS_FILE();
  let st = null; try { st = fs.statSync(file); } catch { st = null; }
  const mtime = st ? st.mtimeMs : 0;
  if (CONFIG && mtime === configMtime) return CONFIG;
  configMtime = mtime;
  if (!st) { CONFIG = validateConfig(DEFAULT_PLANS); configError = null; resolvedCache.clear(); return CONFIG; }
  try {
    CONFIG = validateConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
    configError = null;
    resolvedCache.clear();
  } catch (e) {
    configError = `${path.basename(file)}：${e.message}`;
    console.error('[plans] 配置无效，沿用' + (CONFIG ? '上一份' : '内置默认') + '：' + configError);
    if (!CONFIG) CONFIG = validateConfig(DEFAULT_PLANS);
  }
  return CONFIG;
}
export const planConfigError = () => configError;



const globCache = new Map();
function globRe(p) {
  let re = globCache.get(p);
  if (!re) { re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); globCache.set(p, re); }
  return re;
}
const matches = (pattern, id) => pattern === id || (pattern.includes('*') && globRe(pattern).test(id));

function toRules(list = []) {
  const out = [];
  for (const raw of list) {
    const s = String(raw).trim();
    if (!s) continue;
    if (s[0] === '!' || s[0] === '-') out.push({ pattern: s.slice(1), allow: false });
    else out.push({ pattern: s[0] === '+' ? s.slice(1) : s, allow: true });
  }
  return out;
}
function evalRules(rules, id) {
  let ok = false;
  for (const r of rules) if (matches(r.pattern, id)) ok = r.allow;
  return ok;
}

function normRate(v, where = 'rates') {
  if (typeof v === 'number') { if (!(v >= 0)) throw new Error(`${where} 必须 ≥ 0`); return { perMinute: v }; }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of WIN_KEYS) if (v[k] != null) { if (!(+v[k] >= 0)) throw new Error(`${where}.${k} 必须 ≥ 0`); o[k] = +v[k]; }
    if (!Object.keys(o).length) throw new Error(`${where} 至少给 perMinute / perHour / perDay / perMonth 之一`);
    return o;
  }
  throw new Error(`${where} 必须是数字或 { perMinute, perHour, perDay, perMonth }`);
}



const resolvedCache = new Map();   
function flattenPlan(cfg, id) {
  if (resolvedCache.has(id)) return resolvedCache.get(id);
  const chain = [];
  for (let cur = id; cur; cur = cfg.plans[cur].inherits) chain.unshift(cfg.plans[cur]);
  const rules = [], limits = {}, rates = {};
  for (const p of chain) {
    rules.push(...toRules(p.features || []));
    Object.assign(limits, p.limits || {});
    for (const [k, v] of Object.entries(p.rates || {})) rates[k] = normRate(v);
  }
  const r = { id, title: cfg.plans[id].title || id, desc: cfg.plans[id].desc || '', rules, limits, rates };
  resolvedCache.set(id, r);
  return r;
}





export function resolvePlan(p = {}) {
  const cfg = planConfig();
  let planId = p.kind === 'session' ? cfg.session : p.kind === 'anon' ? cfg.anon : (p.plan || cfg.default);
  let planWarning = null;
  if (!cfg.plans[planId]) { planWarning = `档位 ${planId} 不存在，按 ${cfg.default}`; planId = cfg.default; }
  const base = flattenPlan(cfg, planId);
  const keyRules = toRules(p.features || []);
  const rules = keyRules.length ? [...base.rules, ...keyRules] : base.rules;
  const rates = { ...base.rates };
  for (const [k, v] of Object.entries(p.rates || {})) { try { rates[k] = normRate(v); } catch {  } }
  const limits = { ...base.limits };
  for (const k of ['rpm', 'concurrency', 'maxUploadMB']) if (p[k] != null && p[k] !== '') limits[k] = +p[k];
  return { plan: planId, title: base.title, desc: base.desc, rules, rates, limits, planWarning, customized: !!(keyRules.length || p.rates) };
}

const entOf = p => {
  if (!p) return resolvePlan({ kind: 'anon' });
  if (!p._ent || p._entAt !== configMtime) { Object.defineProperty(p, '_ent', { value: resolvePlan(p), writable: true, configurable: true }); p._entAt = configMtime; }
  return p._ent;
};
export function allowed(p, id) { return evalRules(entOf(p).rules, id); }


export function plansWith(id) {
  const cfg = planConfig();
  return Object.keys(cfg.plans).filter(pid => evalRules(flattenPlan(cfg, pid).rules, id));
}



const WINDOWS = { perMinute: 60e3, perHour: 3600e3, perDay: 86400e3, perMonth: 31 * 86400e3 };
const WIN_LABEL = { perMinute: '每分钟', perHour: '每小时', perDay: '每天', perMonth: '每月' };
const WIN_KEYS = Object.keys(WINDOWS);

function winBounds(win, now) {
  if (win === 'perMonth') {
    const d = new Date(now), start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return { start, end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
  }
  const len = WINDOWS[win], start = now - (now % len);
  return { start, end: start + len };
}
const counters = new Map();   
setInterval(() => { const now = Date.now(); for (const [k, v] of counters) if (now >= (v.end || v.start + 86400e3) + 60e3) counters.delete(k); }, 10 * 60e3).unref();

function winState(key, win, now) {
  let c = counters.get(key);
  if (!c || now >= (c.end || c.start + WINDOWS[win])) { c = { ...winBounds(win, now), n: 0 }; counters.set(key, c); }
  return c;
}

registerState('rate-counters', {
  dump: () => { const now = Date.now(); return { counters: [...counters].filter(([k, v]) => !k.endsWith('|perMinute') && now < (v.end || 0)) }; },
  load: o => { const now = Date.now(); for (const [k, v] of (o && o.counters) || []) if (v && now < v.end) counters.set(k, v); },
});

function rateCharges(who, ent, ids) {
  const need = new Map();
  for (const id of ids) {
    for (const [rule, lim] of Object.entries(ent.rates)) {
      if (!matches(rule, id)) continue;
      for (const [win, limit] of Object.entries(lim)) {
        const key = `${who}|${rule}|${win}`;
        const cur = need.get(key) || { rule, win, limit, key, n: 0, feature: id };
        cur.n++;
        need.set(key, cur);
      }
    }
  }
  return [...need.values()];
}



export class EntitlementError extends Error {
  constructor(status, message, extra) { super(message); this.name = 'EntitlementError'; this.status = status; Object.assign(this, extra); }
}





export function authorize(p, ids, { consume = true, rates = true } = {}) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!list.length) return;
  const ent = entOf(p);
  for (const id of list) {
    if (!evalRules(ent.rules, id)) {
      const up = plansWith(id);
      const cfg = planConfig();
      if (up.includes(ent.plan))   
        throw new EntitlementError(403, `该凭证未开通「${featureTitle(id)}」（${id}，按 key 单独关闭；档位「${ent.title}」本身包含）`,
          { code: 'feature_disabled_for_key', feature: id, plan: ent.plan, availableIn: up });
      throw new EntitlementError(403,
        `当前档位「${ent.title}」不含「${featureTitle(id)}」（${id}）` + (up.length ? `；${up.map(x => `「${cfg.plans[x].title || x}」`).join(' / ')}档可用` : ''),
        { code: 'feature_not_in_plan', feature: id, plan: ent.plan, availableIn: up });
    }
  }
  if (!rates || !Object.keys(ent.rates).length) return;
  const now = Date.now(), who = (p && p.id) || 'anon';
  const charges = rateCharges(who, ent, list);
  for (const c of charges) {
    const st = winState(c.key, c.win, now);
    if (st.n + c.n > c.limit) {
      const retryAfter = Math.max(1, Math.ceil((st.end - now) / 1000));
      throw new EntitlementError(429, `「${featureTitle(c.feature)}」超过频率限制（${c.rule} ${WIN_LABEL[c.win]} ${c.limit} 次），${retryAfter} 秒后再试`,
        { code: 'feature_rate_limited', feature: c.feature, rule: c.rule, window: c.win, limit: c.limit, retryAfter });
    }
  }
  if (consume) for (const c of charges) winState(c.key, c.win, now).n += c.n;
}


export function sendEntitlementError(res, e) {
  if (e.retryAfter) res.set('Retry-After', String(e.retryAfter));
  const { code, feature, plan, availableIn, rule, window, limit, retryAfter } = e;
  res.status(e.status).json({ error: e.message, code, feature, ...(plan ? { plan, availableIn } : {}), ...(rule ? { rule, window, limit, retryAfter } : {}) });
}



const epCache = new Map();
function endpointOf(method, fullPath) {
  const k = method + ' ' + fullPath;
  if (epCache.has(k)) return epCache.get(k);
  let best = null;
  for (const e of ENDPOINTS) {
    if (e.method !== method && !(method === 'HEAD' && e.method === 'GET')) continue;
    const re = new RegExp('^' + e.path.replace(/:[a-z]+/gi, '[^/]+') + '/?$');
    if (re.test(fullPath) && (!best || e.path.length > best.path.length)) best = e;
  }
  if (epCache.size < 2000) epCache.set(k, best);
  return best;
}

export function gateEndpoint() {
  return (req, res, next) => {
    const e = endpointOf(req.method, (req.baseUrl || '') + (req.path === '/' ? '' : req.path));
    if (!e) return next();
    try { authorize(req.principal, [e.feature, ...(e.caps || [])]); }
    catch (err) { if (err instanceof EntitlementError) return sendEntitlementError(res, err); return next(err); }
    next();
  };
}

const OP_ALIASES = Object.fromEntries(CORE_OP_CATALOG.filter(o => o.aliasOf).map(o => [o.op, o.aliasOf]));




export function authorizeOps(p, ops, { consume = true } = {}) {
  const perm = new Set(), charge = [];
  for (const o of ops || []) {
    if (!o || typeof o.op !== 'string') continue;
    const canon = OP_ALIASES[o.op] || o.op;
    perm.add('op.' + o.op); perm.add('op.' + canon);
    charge.push('op.' + canon);
  }
  authorize(p, [...perm], { rates: false });                       
  authorize(p, charge, { consume });                               
}



function usageOf(p, ent) {
  const now = Date.now(), who = (p && p.id) || 'anon';
  const out = {};
  for (const [rule, lim] of Object.entries(ent.rates)) {
    out[rule] = {};
    for (const [win, limit] of Object.entries(lim)) {
      const c = counters.get(`${who}|${rule}|${win}`);
      const live = c && now < (c.end || c.start + WINDOWS[win]);
      const used = live ? c.n : 0;
      out[rule][win] = { limit, used, remaining: Math.max(0, limit - used), resetIn: live ? Math.ceil(((c.end || c.start + WINDOWS[win]) - now) / 1000) : null };
    }
  }
  return out;
}


export function accountInfo(p) {
  const ent = entOf(p);
  const feats = featureList();
  const allowedIds = [], deniedIds = [];
  for (const f of feats) (evalRules(ent.rules, f.id) ? allowedIds : deniedIds).push(f.id);
  return {
    principal: { kind: p ? p.kind : 'anon', name: p && p.name || null },
    plan: ent.plan, title: ent.title, desc: ent.desc, customized: ent.customized,
    ...(ent.planWarning ? { warning: ent.planWarning } : {}),
    limits: ent.limits,
    rates: usageOf(p, ent),
    features: { allowed: allowedIds, denied: deniedIds },
  };
}


export function plansInfo() {
  const cfg = planConfig();
  const feats = featureList();
  const plans = Object.keys(cfg.plans).map(id => {
    const f = flattenPlan(cfg, id);
    return { id, title: f.title, desc: f.desc, inherits: cfg.plans[id].inherits || null, limits: f.limits, rates: f.rates,
      features: cfg.plans[id].features || [], denied: feats.filter(x => !evalRules(f.rules, x.id)).map(x => x.id) };
  });
  return { default: cfg.default, session: cfg.session, plans,
    features: feats.map(x => ({ ...x, plans: plans.filter(pl => !pl.denied.includes(x.id)).map(pl => pl.id) })),
    ...(configError ? { configError } : {}) };
}
