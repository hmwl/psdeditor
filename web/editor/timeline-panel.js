













import { lbIcon } from './lb-icons.js';
import { uiIcon } from './icons.js';
import { ACT_ICONS } from './actions-icons.js';
import { DOC_EXT } from './layerb.js';
import { MENUS } from './menu.js';
import { setAnimProvider } from './save-for-web.js';
import { parseImageResources } from '../../core/psd-resources.js';
import { writeImageResource, removeImageResource } from '../../core/psd-write.js';
import { parsePsdFull } from '../../core/psd-parse.js';
import { layerIdsOf } from '../../core/psd-links.js';
import { findManiResource, parseManiResource, buildManiResource, replaceManiResource, animFromShmd, buildMlstDesc, mdynValue,
  serializeAnimExt, parseAnimExt, newFrameId, ANIM_EXT_RESOURCE_ID } from '../../core/frame-anim.js';
import { encodeAnimatedGif, encodeApng } from '../../core/anim-encode.js';

const mk = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const clone = o => JSON.parse(JSON.stringify(o));
const safe = t => String(t || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
const LS = 'psd_editor.timeline';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
const lsSet = o => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch {} };

export const VIDEO_WHY = '不做（永久）：视频时间轴 / 视频图层 / 渲染视频按决定不做；帧动画请用「创建帧动画」，导出用「存储为 Web 所用格式」的 GIF 或「导出为动画 GIF / APNG…」';
const DELAYS = [[0, '无延迟'], [0.1, '0.1'], [0.2, '0.2'], [0.5, '0.5'], [1, '1.0'], [2, '2.0'], [5, '5.0'], [10, '10.0']];
const THUMB_H = { none: 0, small: 34, medium: 52, large: 84 };
const OPT_DEFAULT = { thumb: 'medium', newAllFrames: true, newPerFrame: false, bbox: true, redundant: true };

let C = null;                 
let S = fresh();
function fresh() { return { on: false, frames: [], cur: 0, sel: [], loop: 0, flags: {}, opt: { ...OPT_DEFAULT }, dirty: false, fromFile: false, setId: 0, keep: [], pending: null }; }
let rootEl = null, barEl = null, playing = null, clip = null;
const thumbs = new Map();     
let thumbDirty = new Set(), thumbTimer = 0;


const posLayer = L => !L.isGroup && !L.isBg;
function stateOf(L) {
  const s = C.layerState(L.i);
  const hasFx = C.hasFx(L.i);
  return { v: !!s.v, x: +s.x || 0, y: +s.y || 0, op: s.op, fo: s.fo, fx: hasFx ? !!C.fxOn(L.i) : null,
    fxp: hasFx && C.fxParams ? C.fxParams(L.i) : null };          
}
function live() { const o = {}; for (const L of C.layers()) o[L.key] = stateOf(L); return o; }
function applyState(st) {
  if (!st) return;
  C.quiet(true);
  try {
    for (const L of C.layers()) {
      const s = st[L.key]; if (!s) continue;
      const c = stateOf(L);
      if (s.v !== c.v) C.setVisible(L.i, s.v);
      if (posLayer(L) && (Math.abs(s.x - c.x) > 1e-6 || Math.abs(s.y - c.y) > 1e-6)) C.setPos(L.i, s.x, s.y);
      if (s.op != null && s.op !== c.op) C.setOpacity(L.i, s.op);
      if (s.fo != null && s.fo !== c.fo) C.setFill(L.i, s.fo);
      if (s.fx != null && c.fx != null && s.fx !== c.fx) C.setFxOn(L.i, s.fx);
      if (s.fxp && c.fxp && C.setFxParams) {
        const diff = {};
        for (const k in s.fxp) if (k in c.fxp && !same(s.fxp[k], c.fxp[k])) diff[k] = s.fxp[k];
        if (Object.keys(diff).length) C.setFxParams(L.i, diff);
      }
    }
  } finally { C.quiet(false); }
}
const same = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-6
  : (a && b && typeof a === 'object' && typeof b === 'object') ? sameMap(a, b) : a === b;
function sameMap(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in b) || !same(a[k], b[k])) return false;
  return true;
}
const PROPS = ['v', 'x', 'y', 'op', 'fo', 'fx', 'fxp'];
const PROP_GROUP = { v: 'vis', x: 'pos', y: 'pos', op: 'sty', fo: 'sty', fx: 'sty', fxp: 'sty' };

const flagsOf = k => ({ prop: true, ...(S.flags[k] || {}) });


const pickKeys = (o, ref) => { const r = {}; for (const k in o) if (k in ref) r[k] = o[k]; return r; };


function ready() {
  if (!S.pending || !C || !C.hasDoc()) return;
  const P = S.pending; S.pending = null;
  const base = live();
  

  const anyMlst = Object.keys(P.perLayer).length > 0;
  for (const f of S.frames) {
    f.st = {};
    for (const k in base) {
      if (anyMlst && !P.perLayer[k]) continue;
      const b = base[k], p = (P.perLayer[k] && P.perLayer[k][f.id]) || null, ex = (P.ext && P.ext.frames && P.ext.frames[f.id] && P.ext.frames[f.id][k]) || null;
      f.st[k] = { v: p && p.v !== undefined ? p.v : b.v, x: b.x + (p && p.dx || 0), y: b.y + (p && p.dy || 0), op: p && p.op != null ? p.op : b.op,
        fo: ex && ex.fo != null ? ex.fo : b.fo, fx: b.fx == null ? null : (ex && ex.fx != null ? ex.fx : (p && p.fx != null ? p.fx : b.fx)),
        fxp: b.fxp ? (ex && ex.fxp ? { ...b.fxp, ...pickKeys(ex.fxp, b.fxp) } : { ...b.fxp }) : null };
    }
  }
  
  const cur = S.frames[S.cur];
  if (cur) { const d = Object.keys(cur.st).some(k => PROPS.some(p => !same(cur.st[k][p], base[k][p]))); if (d) { C.histLock(true); try { applyState(cur.st); } finally { C.histLock(false); } C.repaint(); } }
  markAllThumbs();
}


function commit(opts = {}) {
  if (!S.on || !C || !C.hasDoc()) return;
  ready();
  const f = S.frames[S.cur]; if (!f) return;
  const now = live();
  const known = new Set(); for (const fr of S.frames) for (const k in fr.st) known.add(k);
  let changed = false;
  for (const k in now) {
    const nv = now[k], ov = f.st[k];
    if (!known.has(k)) {                                     
      const all = opts.onlyCur ? false : S.opt.newAllFrames;
      for (const fr of S.frames) if (fr !== f) fr.st[k] = { ...nv, v: all ? nv.v : false };
      f.st[k] = { ...nv }; changed = true; continue;
    }
    if (!ov) { f.st[k] = { ...nv }; changed = true; continue; }
    const fl = flagsOf(k);
    for (const p of PROPS) {
      if (same(ov[p], nv[p])) continue;
      changed = true;
      if (fl[PROP_GROUP[p]]) { for (const fr of S.frames) if (fr.st[k]) fr.st[k][p] = nv[p]; }
      else if (S.cur === 0 && fl.prop) { for (let j = 1; j < S.frames.length; j++) { const s = S.frames[j].st[k]; if (s && same(s[p], ov[p])) s[p] = nv[p]; } }
    }
    f.st[k] = { ...nv };
  }
  if (changed) { S.dirty = true; markAllThumbs(); }
}
function markAllThumbs() { for (const fr of S.frames) thumbDirty.add(fr.id); scheduleThumbs(); }


export const TL = {
  key: 'timeline', label: '帧动画',
  capture: () => { commit(); return clone({ ...S, pending: S.pending }); },
  apply: v => { stop(); S = v ? clone(v) : fresh(); thumbs.clear(); markAllThumbs(); render(); },
  snap: () => clone({ on: S.on, frames: S.frames, cur: S.cur, sel: S.sel, loop: S.loop, flags: S.flags, opt: S.opt, dirty: S.dirty, fromFile: S.fromFile, setId: S.setId, keep: S.keep, pending: S.pending }),
  restore: v => { if (!v) return; stop(); S = { ...fresh(), ...clone(v) }; markAllThumbs(); render(); },
  load(buf) { stop(); S = fresh(); thumbs.clear(); try { loadFrom(buf); } catch (e) { console.warn('[帧动画] 读取失败', e); S = fresh(); } render(); setTimeout(() => { try { ready(); render(); } catch {} }, 0); },
  needsWrite: () => S.on || S.fromFile,
  dirty: () => S.dirty,
  writeInto: (buf, h) => writeInto(buf, h),
  state: () => S,
};

function loadFrom(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const mani = findManiResource(u8); if (!mani) return;
  const p = parseManiResource(mani); if (!p || !p.anim) return;
  let ext = null;
  try {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let o = 26; o += 4 + dv.getUint32(o);
    const res = parseImageResources(u8.subarray(o + 4, o + 4 + dv.getUint32(o))) || [];
    const r = res.find(x => x.id === ANIM_EXT_RESOURCE_ID); if (r && r._raw) ext = parseAnimExt(r._raw);
  } catch {}
  const perLayer = {}, flags = {};
  try {
    const full = parsePsdFull(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    full.layers.forEach((L, i) => {
      const id = (L.blocks || []).find(b => b.key === 'lyid' && b.dataLength >= 4);
      const sh = (L.blocks || []).find(b => b.key === 'shmd');
      const key = id ? 'id:' + dv.getUint32(id.dataOffset) : 'ix:' + i;
      if (!sh) return;
      const a = animFromShmd(u8.slice(sh.dataOffset, sh.dataOffset + sh.dataLength));
      if (a.mlst) { const m = {}; for (const e of a.mlst.entries) for (const fid of e.frames) m[fid] = e; perLayer[key] = m; }
      if (a.mdyn) flags[key] = a.mdyn;
    });
  } catch {}
  S.on = true; S.fromFile = true;
  S.frames = p.anim.frames.map(f => ({ id: f.id | 0, delay: f.delay, disp: f.disp, st: {} }));
  S.loop = p.anim.loop; S.cur = Math.min(p.anim.active, S.frames.length - 1); S.sel = [S.cur]; S.setId = p.anim.setId | 0;
  S.keep = p.blocks.filter(b => b.key !== 'AnDs').map(b => ({ key: b.key, data: Array.from(b.data) }));
  S.flags = flags;
  if (ext && ext.opt) S.opt = { ...OPT_DEFAULT, ...ext.opt };
  if (ext && Array.isArray(ext.sel)) S.sel = ext.sel.filter(k => k >= 0 && k < S.frames.length); if (!S.sel.length) S.sel = [S.cur];
  S.pending = { perLayer, ext };
}

async function writeInto(buf, h) {
  ready(); commit();
  if (!S.on) {
    buf = replaceManiResource(buf, null);
    try { buf = removeImageResource(buf, ANIM_EXT_RESOURCE_ID); } catch {}
    const had = layersWithAnim(buf).map(b => ({ index: b, mlst: null, mdyn: null }));
    if (had.length) buf = h.applyEdits(buf, [{ op: 'setLayerAnimMeta', entries: had }]).buffer;
    return buf;
  }
  let r = h.applyEdits(buf, [{ op: 'ensureLayerIds' }]); buf = r.buffer;
  const ids = layerIdsOf(buf);
  const cur = S.frames[S.cur].st;
  const entries = [], extFrames = {}, done = new Set();
  for (const L of C.layers()) {
    const b = h.builtIndexOf(L.i); if (b == null || b < 0 || ids[b] == null) continue;
    done.add(b);
    const base = cur[L.key] || stateOf(L);
    const per = S.frames.map(f => { const s = f.st[L.key] || base; return { id: f.id, v: s.v, dx: posLayer(L) ? s.x - base.x : 0, dy: posLayer(L) ? s.y - base.y : 0, op: s.op }; });
    const withPos = per.some(p => Math.abs(p.dx) > 1e-6 || Math.abs(p.dy) > 1e-6);
    const withOp = per.some(p => p.op !== base.op);
    entries.push({ index: b, mlst: buildMlstDesc(ids[b] >>> 0, per, { withPos, withOp }), mdyn: mdynValue(flagsOf(L.key)) });
    const nk = 'id:' + ids[b];
    for (const f of S.frames) { const s = f.st[L.key]; if (!s) continue; (extFrames[f.id] = extFrames[f.id] || {})[nk] = { fo: s.fo, fx: s.fx, ...(s.fxp ? { fxp: s.fxp } : {}) }; }
  }
  for (const b of layersWithAnim(buf)) if (!done.has(b)) entries.push({ index: b, mlst: null, mdyn: null });
  if (entries.length) buf = h.applyEdits(buf, [{ op: 'setLayerAnimMeta', entries }]).buffer;
  const keep = (S.keep || []).map(k => ({ key: k.key, data: Uint8Array.from(k.data) }));
  buf = replaceManiResource(buf, buildManiResource({ frames: S.frames.map(f => ({ id: f.id, delay: f.delay, disp: f.disp })), loop: S.loop, active: S.cur, setId: S.setId | 0 }, keep));
  buf = writeImageResource(buf, ANIM_EXT_RESOURCE_ID, serializeAnimExt({ v: 1, frames: extFrames, opt: S.opt, sel: S.sel }));
  return buf;
}
function layersWithAnim(buf) {
  const out = [];
  try {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const full = parsePsdFull(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    full.layers.forEach((L, i) => {
      const sh = (L.blocks || []).find(b => b.key === 'shmd'); if (!sh) return;
      const s = u8.subarray(sh.dataOffset, sh.dataOffset + sh.dataLength);
      for (let j = 4; j + 8 <= s.length; j++) if (s[j] === 0x38 && s[j + 1] === 0x42 && s[j + 2] === 0x49 && s[j + 3] === 0x4d && ((s[j + 4] === 0x6d && s[j + 5] === 0x6c && s[j + 6] === 0x73 && s[j + 7] === 0x74) || (s[j + 4] === 0x6d && s[j + 5] === 0x64 && s[j + 6] === 0x79 && s[j + 7] === 0x6e))) { out.push(i); break; }
    });
  } catch {}
  return out;
}


const hasAnim = () => !!(C && C.hasDoc() && S.on && S.frames.length);
function change(label, fn, opts = {}) {
  ready(); commit(opts.commit);
  C.history(label);
  const r = fn();
  S.dirty = true;
  if (opts.apply !== false && S.frames[S.cur]) applyState(S.frames[S.cur].st);
  C.refresh(); markAllThumbs(); render();
  return r === undefined ? true : r;
}
const sortedSel = () => [...new Set(S.sel)].filter(k => k >= 0 && k < S.frames.length).sort((a, b) => a - b);
const usedIds = () => new Set(S.frames.map(f => f.id));
function newFrame(from) { return { id: newFrameId(usedIds()), delay: from ? from.delay : 0, disp: from ? from.disp : 'auto', st: clone(from ? from.st : live()) }; }

export function createAnimation() {
  if (!C.hasDoc()) return false;
  if (S.on) { C.panels.show('timeline'); return true; }
  lsSet({ kind: 'frames' });
  change('创建帧动画', () => {
    S.on = true; S.frames = [{ id: newFrameId(), delay: 0, disp: 'auto', st: live() }]; S.cur = 0; S.sel = [0]; S.loop = 0; S.flags = {}; S.opt = { ...OPT_DEFAULT, ...(S.opt || {}) };
  }, { apply: false });
  C.status('已创建帧动画：第 1 帧 = 当前的图层状态');
  return true;
}
export function gotoFrame(k, opts = {}) {
  if (!hasAnim()) return false;
  k = Math.max(0, Math.min(S.frames.length - 1, k | 0));
  if (!opts.noCommit) commit();
  S.cur = k;
  if (!opts.keepSel) S.sel = [k];
  C.histLock(true);
  try { applyState(S.frames[k].st); } finally { C.histLock(false); }
  if (opts.light) C.repaint(); else C.refresh();
  if (!refreshSel()) render();
  return true;
}

function refreshSel() {
  if (!rootEl) return false;
  const cells = rootEl.querySelectorAll('.tl-frame'); if (cells.length !== S.frames.length) return false;
  const sel = new Set(S.sel);
  cells.forEach((c, k) => { c.classList.toggle('sel', sel.has(k)); c.classList.toggle('cur', k === S.cur); });
  const pb = rootEl.querySelector('[data-attr="tl-play"]');
  if (pb) { pb.textContent = ''; pb.append(iconImg(playing ? ACT_ICONS.stop : ACT_ICONS.play, 16)); pb.title = playing ? '停止动画' : '播放动画'; }
  const first = rootEl.querySelector('[data-attr="tl-first"]'); if (first) first.disabled = !C.hasDoc() || S.cur === 0;
  renderBar();
  return true;
}
export async function duplicateFrames() {
  if (!hasAnim()) return false;
  const sel = sortedSel(); if (!sel.length) sel.push(S.cur);
  const perFrameLayer = S.opt.newPerFrame;
  change(sel.length > 1 ? '复制多帧' : '新建帧', () => {
    const copies = sel.map(k => newFrame(S.frames[k]));
    const at = sel[sel.length - 1] + 1;
    S.frames.splice(at, 0, ...copies);
    S.sel = copies.map((_, j) => at + j); S.cur = at;
  });
  if (perFrameLayer) {                                           
    await C.newLayer();
    ready(); commit({ onlyCur: true }); render();
  }
  return true;
}
export function deleteFrames() {
  if (!hasAnim() || S.frames.length < 2) return false;
  let sel = sortedSel(); if (!sel.length) sel = [S.cur];
  if (sel.length >= S.frames.length) sel = sel.slice(1);        
  return change(sel.length > 1 ? '删除多帧' : '删除帧', () => {
    for (const k of sel.slice().reverse()) S.frames.splice(k, 1);
    S.cur = Math.min(sel[0], S.frames.length - 1); S.sel = [S.cur];
  });
}
export function deleteAnimation() {
  if (!S.on) return false;
  stop();
  return change('删除动画', () => { S.on = false; S.frames = []; S.cur = 0; S.sel = []; S.flags = {}; }, { apply: false });
}
function copyFrames() {
  if (!hasAnim()) return false;
  commit();
  const sel = sortedSel(); if (!sel.length) sel.push(S.cur);
  clip = sel.map(k => clone(S.frames[k]));
  C.status(`已拷贝 ${clip.length} 帧`);
  return true;
}
async function pasteFrames() {
  if (!hasAnim() || !clip || !clip.length) return false;
  const v = await C.formDialog(clip.length > 1 ? '粘贴多帧' : '粘贴单帧', [
    { key: 'how', label: '粘贴方式', type: 'select', value: 'replace', options: [['replace', '替换帧'], ['over', '粘贴在所选帧之上'], ['before', '粘贴在所选帧之前'], ['after', '粘贴在所选帧之后']] },
    { key: 'link', label: '链接添加的图层', type: 'check', value: false },
    { type: 'note', label: '同一文档里粘贴：按图层对齐各帧状态，不另添图层（「链接添加的图层」只在 PS 跨文档粘贴帧时有意义）。' },
  ]);
  if (!v) return false;
  const sel = sortedSel(); if (!sel.length) sel.push(S.cur);
  return change(clip.length > 1 ? '粘贴多帧' : '粘贴帧', () => {
    if (v.how === 'replace') sel.forEach((k, j) => { const c = clip[j % clip.length]; const f = S.frames[k]; f.st = { ...f.st, ...clone(c.st) }; f.delay = c.delay; f.disp = c.disp; });
    else if (v.how === 'over') sel.forEach((k, j) => {
      const c = clip[j % clip.length], f = S.frames[k];
      for (const key in c.st) if (c.st[key].v) f.st[key] = { ...clone(c.st[key]) };      
    });
    else {
      const at = v.how === 'before' ? sel[0] : sel[sel.length - 1] + 1;
      const add = clip.map(c => ({ ...clone(c), id: newFrameId(usedIds()) }));
      S.frames.splice(at, 0, ...add); S.sel = add.map((_, j) => at + j); S.cur = at;
    }
  });
}
function selectAll() { if (!hasAnim()) return false; S.sel = S.frames.map((_, k) => k); render(); return true; }
function reverseFrames() {
  if (!hasAnim() || S.frames.length < 2) return false;
  let sel = sortedSel(); if (sel.length < 2) sel = S.frames.map((_, k) => k);
  return change('反向帧', () => {
    const picked = sel.map(k => S.frames[k]).reverse();
    const curId = S.frames[S.cur].id;
    sel.forEach((k, j) => { S.frames[k] = picked[j]; });
    S.cur = S.frames.findIndex(f => f.id === curId);
  });
}
async function setDelay(value) {
  if (!hasAnim()) return false;
  let d = value;
  if (d === 'other') {
    const cur = S.frames[S.cur].delay;
    const v = await C.formDialog('设置帧延迟', [{ key: 'd', label: '设置帧延迟', type: 'number', value: cur, min: 0, max: 655.35, step: 0.01, unit: '秒' }]);
    if (!v) return false; d = +v.d;
  }
  d = Math.max(0, Math.min(655.35, Math.round(+d * 100) / 100));
  const sel = sortedSel(); if (!sel.length) sel.push(S.cur);
  return change('更改帧延迟', () => { for (const k of sel) S.frames[k].delay = d; });
}
function setDisposal(k, disp) { return change('处理方法', () => { const sel = S.sel.includes(k) ? sortedSel() : [k]; for (const j of sel) S.frames[j].disp = disp; }); }
async function setLoop(value) {
  let n = value;
  if (n === 'other') {
    const v = await C.formDialog('设置循环次数', [{ key: 'n', label: '播放', type: 'number', value: S.loop || 3, min: 1, max: 9999, unit: '次' }]);
    if (!v) { render(); return false; } n = +v.n;
  }
  return change('循环选项', () => { S.loop = Math.max(0, n | 0); }, { apply: false });
}


const lerp = (a, b, t) => a + (b - a) * t;
function tweenState(A, B, t, keys, par) {
  const out = clone(A);
  for (const k of keys) {
    const a = A[k], b = B[k]; if (!a || !b) continue;
    const s = { ...a };
    if (par.pos) { s.x = lerp(a.x, b.x, t); s.y = lerp(a.y, b.y, t); }
    if (a.v !== b.v) {
      if (par.op) { s.v = true; s.op = Math.round(lerp(a.v ? a.op : 0, b.v ? b.op : 0, t)); }
      else s.v = t < 0.5 ? a.v : b.v;
    } else if (par.op) s.op = Math.round(lerp(a.op, b.op, t));
    if (par.op && a.fo != null && b.fo != null) s.fo = Math.round(lerp(a.fo, b.fo, t));
    if (par.fx && a.fx != null && b.fx != null) s.fx = t < 0.5 ? a.fx : b.fx;
    
    if (par.fx && a.fxp && b.fxp) {
      const m = { ...a.fxp };
      for (const key in a.fxp) {
        if (!(key in b.fxp)) continue;
        const x = a.fxp[key], y = b.fxp[key];
        if (typeof x === 'number' && typeof y === 'number') m[key] = Number.isInteger(x) && Number.isInteger(y) ? Math.round(lerp(x, y, t)) : lerp(x, y, t);
        else m[key] = t < 0.5 ? x : y;
      }
      s.fxp = m;
    }
    out[k] = s;
  }
  return out;
}
export async function tweenUI(preset) {
  if (!hasAnim()) return false;
  commit();
  const sel = sortedSel();
  const multi = sel.length > 1;
  const opts = multi ? [['sel', '选区']] : [];
  if (S.cur < S.frames.length - 1) opts.push(['next', '下一帧']);
  if (S.cur > 0) opts.push(['first', '第一帧'], ['prev', '上一帧']);
  if (S.cur < S.frames.length - 1) opts.push(['last', '最后一帧']);
  if (!opts.length) { await C.alertDialog('只有一帧：先新建一帧、把图层改成终点的样子，再做过渡。', { title: '过渡' }); return false; }
  const v = preset || await C.formDialog('过渡', [
    { key: 'with', label: '过渡方式', type: 'select', value: opts[0][0], options: opts },
    { key: 'n', label: '要添加的帧数', type: 'number', value: 5, min: 1, max: 999 },
    { key: 'layers', label: '图层', type: 'select', value: 'all', options: [['all', '所有图层'], ['sel', '选中的图层']] },
    { type: 'note', label: '参数' },
    { key: 'pos', label: '位置', type: 'check', value: true },
    { key: 'op', label: '不透明度', type: 'check', value: true },
    { key: 'fx', label: '效果', type: 'check', value: true },
  ], { okText: '确定' });
  if (!v) return false;
  const n = Math.max(1, Math.min(999, v.n | 0));
  const keysAll = C.layers().map(L => L.key);
  const keys = v.layers === 'sel' ? C.selected().map(i => C.keyOf(i)) : keysAll;
  const par = { pos: !!v.pos, op: !!v.op, fx: !!v.fx };
  const pairs = [];                                             
  const last = S.frames.length - 1;
  if (v.with === 'sel') for (let j = 0; j + 1 < sel.length; j++) pairs.push([sel[j], sel[j + 1]]);
  else if (v.with === 'next') pairs.push([S.cur, S.cur + 1]);
  else if (v.with === 'prev') pairs.push([S.cur - 1, S.cur]);
  else if (v.with === 'first') pairs.push([S.cur, 0]);
  else if (v.with === 'last') pairs.push([S.cur, last]);
  return change('过渡', () => {
    const ins = [];
    for (const [a, b] of pairs) {
      const A = S.frames[a], B = S.frames[b]; if (!A || !B) continue;
      const add = [];
      for (let i = 1; i <= n; i++) add.push({ id: 0, delay: A.delay, disp: A.disp, st: tweenState(A.st, B.st, i / (n + 1), keys, par) });
      ins.push([Math.max(a, v.with === 'prev' || v.with === 'sel' ? a : a) + 1, add]);
    }
    ins.sort((x, y) => y[0] - x[0]);                          
    let firstNew = null;
    for (const [at, add] of ins) { for (const f of add) f.id = newFrameId(usedIds()); S.frames.splice(at, 0, ...add); firstNew = at; }
    if (firstNew != null) { S.sel = []; for (const [at, add] of ins) for (let j = 0; j < add.length; j++) S.sel.push(at + j); S.cur = S.sel.length ? Math.min(...S.sel) : S.cur; }
  });
}


async function optimizeUI() {
  const v = await C.formDialog('优化动画', [
    { type: 'note', label: '优化方式（存储为 GIF 时生效）' },
    { key: 'bbox', label: '外框', type: 'check', value: S.opt.bbox },
    { key: 'redundant', label: '去除多余像素', type: 'check', value: S.opt.redundant },
  ]);
  if (!v) return false;
  return change('优化动画', () => { S.opt.bbox = !!v.bbox; S.opt.redundant = !!v.redundant; }, { apply: false });
}
function framesFromLayers() {
  if (!C.hasDoc()) return false;
  if (!S.on) createAnimation();
  const Ls = C.layers();
  const content = Ls.filter(L => !L.isGroup && !L.isBg).reverse();   
  if (!content.length) return false;
  const base = live();
  const parents = new Map();                                      
  for (const G of Ls.filter(L => L.isGroup)) for (const i of C.groupBlock(G.i)) if (i !== G.i) (parents.get(i) || parents.set(i, []).get(i)).push(G.key);
  return change('从图层建立帧', () => {
    S.frames = content.map(L => {
      const st = clone(base);
      for (const O of Ls) if (!O.isGroup && !O.isBg) st[O.key].v = O.key === L.key;
      for (const gk of parents.get(L.i) || []) st[gk].v = true;
      return { id: newFrameId(), delay: S.frames[0] ? S.frames[0].delay : 0, disp: 'auto', st };
    });
    const seen = new Set(); for (const f of S.frames) { while (seen.has(f.id)) f.id = newFrameId(seen); seen.add(f.id); }
    S.cur = 0; S.sel = [0];
  });
}
async function flattenFramesIntoLayers() {
  if (!hasAnim()) return false;
  commit();
  const canvases = await renderFrames();
  const tag = '帧 ', names = [];
  for (let k = 0; k < canvases.length; k++) {
    const nm = tag + (k + 1);
    await C.newLayer(nm);
    const i = C.selected()[0]; if (i == null) break;
    C.replacePixels(i, g => g.drawImage(canvases[k], 0, 0));
    names.push(nm);
  }
  ready(); commit();
  
  const made = names.map(nm => { const L = C.layers().find(x => x.name === nm); return L ? L.key : null; });
  if (made.some(Boolean)) change('将帧拼合到图层', () => { S.frames.forEach((f, k) => { for (const [j, key] of made.entries()) if (key && f.st[key]) f.st[key].v = j === k; }); });
  C.status(`已将 ${names.length} 帧拼合到图层`);
  return names.length;
}
async function matchLayerUI() {
  if (!hasAnim()) return false;
  const v = await C.formDialog('跨帧匹配图层', [
    { key: 'where', label: '匹配', type: 'select', value: 'all', options: [['all', '所有帧'], ['sel', '选定的帧']] },
    { type: 'note', label: '匹配项（把选中图层在当前帧的这些属性套到其它帧）' },
    { key: 'pos', label: '位置', type: 'check', value: true },
    { key: 'vis', label: '可见性', type: 'check', value: true },
    { key: 'sty', label: '样式', type: 'check', value: true },
  ]);
  if (!v) return false;
  const keys = C.selected().map(i => C.keyOf(i));
  if (!keys.length) return false;
  return change('跨帧匹配图层', () => {
    const src = S.frames[S.cur].st;
    const targets = v.where === 'sel' ? sortedSel() : S.frames.map((_, k) => k);
    for (const k of targets) for (const key of keys) {
      const s = S.frames[k].st[key], c = src[key]; if (!s || !c) continue;
      if (v.pos) { s.x = c.x; s.y = c.y; }
      if (v.vis) s.v = c.v;
      if (v.sty) { s.op = c.op; s.fo = c.fo; s.fx = c.fx; s.fxp = c.fxp; }
    }
  });
}
async function panelOptionsUI() {
  const v = await C.formDialog('动画面板选项', [
    { key: 'thumb', label: '缩览图大小', type: 'select', value: S.opt.thumb, options: [['none', '无'], ['small', '小'], ['medium', '中'], ['large', '大']] },
  ]);
  if (!v) return false;
  S.opt.thumb = v.thumb; lsSet({ thumb: v.thumb }); S.dirty = true; render(); return true;
}


function unify(kind) {
  const keys = C.selected().map(i => C.keyOf(i)); if (!keys.length || !hasAnim()) return false;
  const on = !flagsOf(keys[0])[kind];
  const label = { pos: '统一图层位置', vis: '统一图层可见性', sty: '统一图层样式' }[kind];
  return change(on ? label : '取消' + label, () => {
    const src = S.frames[S.cur].st;
    for (const k of keys) {
      S.flags[k] = { ...flagsOf(k), [kind]: on };
      if (!on) continue;
      for (const f of S.frames) { const s = f.st[k], c = src[k]; if (!s || !c) continue;       
        if (kind === 'pos') { s.x = c.x; s.y = c.y; } else if (kind === 'vis') s.v = c.v; else { s.op = c.op; s.fo = c.fo; s.fx = c.fx; s.fxp = c.fxp; } }
    }
  });
}
function setPropagate(on) {
  const keys = C.selected().map(i => C.keyOf(i)); if (!keys.length || !hasAnim()) return false;
  return change('传播帧 1', () => { for (const k of keys) S.flags[k] = { ...flagsOf(k), prop: !!on }; }, { apply: false });
}


export function play() {
  if (!hasAnim() || S.frames.length < 2) return false;
  if (playing) return stop();
  commit();
  playing = { loops: 0, timer: 0 };
  const tick = () => {
    if (!playing) return;
    let next = S.cur + 1;
    if (next >= S.frames.length) {
      playing.loops++;
      if (S.loop > 0 && playing.loops >= S.loop) { stop(); return; }
      next = 0;
    }
    gotoFrame(next, { noCommit: true, light: true });
    playing.timer = setTimeout(tick, Math.max(30, (S.frames[S.cur].delay || 0) * 1000));
  };
  playing.timer = setTimeout(tick, Math.max(30, (S.frames[S.cur].delay || 0) * 1000));
  if (!refreshSel()) render();
  return true;
}
export function stop() {
  if (!playing) return false;
  clearTimeout(playing.timer); playing = null;
  try { C && C.refresh(); } catch {}
  if (!refreshSel()) render();
  return true;
}
const isPlaying = () => !!playing;



export async function renderFrames(indices) {
  commit();
  const list = indices || S.frames.map((_, k) => k), out = [];
  C.histLock(true);
  try {
    for (const k of list) { applyState(S.frames[k].st); out.push(C.compositeCanvas()); }
  } finally { applyState(S.frames[S.cur].st); C.histLock(false); C.repaint(); }
  return out;
}
function scheduleThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => { try { updateThumbs(); } catch (e) { console.warn('[帧动画] 缩览图', e); } }, playing ? 50 : 350);
}
function thumbOf(cv) {
  const h = THUMB_H[S.opt.thumb] || 52, k = h / Math.max(1, cv.height), w = Math.max(8, Math.round(cv.width * k));
  const t = document.createElement('canvas'); t.width = Math.min(160, w); t.height = h;
  const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, t.width, t.height);
  return t;
}
function updateThumbs() {
  if (!hasAnim() || !rootEl || !THUMB_H[S.opt.thumb] || !C.panels.isVisible('timeline')) return;
  if (S.pending) ready();
  if (playing) { return; }                                         
  const cur = S.frames[S.cur];
  const dirty = S.frames.map((f, k) => k).filter(k => thumbDirty.has(S.frames[k].id) || !thumbs.has(S.frames[k].id));
  if (!dirty.length) return;
  commit();
  if (dirty.includes(S.cur)) { thumbs.set(cur.id, thumbOf(C.compositeCanvas())); thumbDirty.delete(cur.id); }
  const others = dirty.filter(k => k !== S.cur);
  if (others.length) {
    C.histLock(true);
    try { for (const k of others) { applyState(S.frames[k].st); thumbs.set(S.frames[k].id, thumbOf(C.compositeCanvas())); thumbDirty.delete(S.frames[k].id); } }
    finally { applyState(cur.st); C.histLock(false); C.repaint(); }
  }
  paintThumbs();
}
function paintThumbs() {
  if (!rootEl) return;
  for (const cell of rootEl.querySelectorAll('.tl-frame')) {
    const f = S.frames[+cell.dataset.k]; const box = cell.querySelector('.tl-thumb'); if (!f || !box) continue;
    const t = thumbs.get(f.id); box.textContent = '';
    if (t) { const c = document.createElement('canvas'); c.width = t.width; c.height = t.height; c.getContext('2d').drawImage(t, 0, 0); box.append(c); }
  }
}


const STYLE = `
.tl-root{display:flex;flex-direction:column;height:100%;min-height:120px;font-size:12px;user-select:none}
.tl-empty{flex:1;display:grid;place-items:center;padding:16px}
.tl-create{display:inline-flex;border:1px solid var(--line,#3a3a3a);border-radius:3px;overflow:hidden}
.tl-create button{background:var(--panel2,#3b3b3b);border:0;color:inherit;padding:5px 12px;font-size:12px}
.tl-create button.tl-arrow{padding:5px 7px;border-left:1px solid var(--line,#2a2a2a)}
.tl-create button:hover{background:#4a4a4a}
.tl-create button.tl-main.is-disabled{opacity:.55}
.tl-strip{flex:1;display:flex;gap:2px;overflow-x:auto;overflow-y:hidden;padding:4px;align-items:flex-start;min-height:60px}
.tl-frame{flex:none;display:flex;flex-direction:column;border:1px solid transparent;background:#2f2f2f;border-radius:2px;padding:0 0 1px}
.tl-frame.sel{background:#3d4b60;border-color:#4b6ea3}
.tl-frame.cur{border-color:#8cb4ff}
.tl-frame.drop-before{box-shadow:-3px 0 0 #8cb4ff}
.tl-fhead{display:flex;justify-content:space-between;align-items:center;padding:1px 4px;font-size:11px;opacity:.9;min-width:40px}
.tl-fhead .tl-disp{opacity:.7;font-size:10px}
.tl-thumb{display:grid;place-items:center;margin:0 3px;background:repeating-conic-gradient(#555 0 25%,#444 0 50%) 0 0/8px 8px;min-width:34px}
.tl-thumb canvas{display:block}
.tl-delay{background:transparent;border:0;color:inherit;font-size:11px;padding:1px 3px;text-align:center;cursor:pointer}
.tl-delay:hover{background:#4a4a4a}
.tl-foot{display:flex;align-items:center;gap:2px;padding:3px 4px;border-top:1px solid var(--line,#2a2a2a);flex:none}
.tl-foot .grow{flex:1}
.tl-foot button.lf-btn{width:24px;height:22px;display:grid;place-items:center;background:transparent;border:0;border-radius:2px;padding:0}
.tl-foot button.lf-btn:hover:not(:disabled){background:#4a4a4a}
.tl-foot button.lf-btn:disabled{opacity:.35}
.tl-foot select{font-size:11px;max-width:72px}
#tlUnifyBar{display:flex;align-items:center;gap:4px;padding:2px 6px;font-size:11px;border-bottom:1px solid var(--line,#2a2a2a)}
#tlUnifyBar[hidden]{display:none}
#tlUnifyBar button{width:22px;height:20px;display:grid;place-items:center;background:transparent;border:1px solid transparent;border-radius:2px;padding:0}
#tlUnifyBar button.on{background:#4a4a4a;border-color:#6a6a6a}
#tlUnifyBar button:disabled{opacity:.4}
#tlUnifyBar label{display:flex;align-items:center;gap:3px;margin-left:auto}
`;
function ensureStyle() { if (!document.getElementById('tl-style')) document.head.append(mk('style', { id: 'tl-style', textContent: STYLE })); }
function iconImg(src, size = 16) { const im = mk('img', { src, width: size, height: size, alt: '', draggable: false }); im.style.cssText = 'display:block;pointer-events:none'; return im; }

export function render() {
  renderBar();
  const sec = C && C.panels.sectionOf('timeline'); if (!sec) return;
  if (!rootEl || !sec.contains(rootEl)) { sec.textContent = ''; rootEl = mk('div', { className: 'tl-root' }); rootEl.dataset.attr = 'timeline'; sec.append(rootEl); }
  rootEl.textContent = '';
  if (!S.on) return renderCreate();
  const strip = mk('div', { className: 'tl-strip' }); strip.dataset.attr = 'tl-strip';
  const selSet = new Set(S.sel);
  S.frames.forEach((f, k) => {
    const cell = mk('div', { className: 'tl-frame' + (selSet.has(k) ? ' sel' : '') + (k === S.cur ? ' cur' : ''), draggable: true });
    cell.dataset.k = k; cell.dataset.attr = 'tl-frame';
    const disp = f.disp === 'disp' ? '处理' : f.disp === 'none' ? '不处理' : '';
    const head = mk('div', { className: 'tl-fhead' }, mk('span', { textContent: String(k + 1) }), mk('span', { className: 'tl-disp', textContent: disp }));
    const th = mk('div', { className: 'tl-thumb' }); th.style.height = (THUMB_H[S.opt.thumb] || 0) + 'px'; if (!THUMB_H[S.opt.thumb]) th.hidden = true;
    const dl = mk('button', { type: 'button', className: 'tl-delay', textContent: (f.delay ? +f.delay.toFixed(2) : 0) + ' 秒 ▾', title: '选择帧延迟时间' }); dl.dataset.attr = 'tl-delay';
    dl.onclick = e => { e.stopPropagation(); if (!selSet.has(k)) { S.sel = [k]; gotoFrame(k); } delayMenu(dl); };
    cell.append(head, th, dl);
    cell.onclick = e => {
      if (playing) stop();
      if (e.shiftKey && S.sel.length) { const a = Math.min(S.cur, k), b = Math.max(S.cur, k); S.sel = []; for (let j = a; j <= b; j++) S.sel.push(j); gotoFrame(k, { keepSel: true }); }
      else if (e.metaKey || e.ctrlKey) { const s = new Set(S.sel); if (s.has(k) && s.size > 1) { s.delete(k); S.sel = [...s]; render(); } else { s.add(k); S.sel = [...s]; gotoFrame(k, { keepSel: true }); } }
      else gotoFrame(k);
    };
    cell.oncontextmenu = e => { e.preventDefault(); C.panels.popup([
      { label: '自动', checked: f.disp === 'auto', run: () => setDisposal(k, 'auto') },
      { label: '不处理', checked: f.disp === 'none', run: () => setDisposal(k, 'none') },
      { label: '处理', checked: f.disp === 'disp', run: () => setDisposal(k, 'disp') },
    ], { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, alignLeft: true }); };
    
    cell.ondragstart = e => { if (!selSet.has(k)) { S.sel = [k]; } e.dataTransfer.setData('text/x-fp-frames', JSON.stringify(sortedSel())); e.dataTransfer.effectAllowed = 'copyMove'; };
    cell.ondragover = e => { if (!e.dataTransfer.types.includes('text/x-fp-frames')) return; e.preventDefault(); e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'; cell.classList.add('drop-before'); };
    cell.ondragleave = () => cell.classList.remove('drop-before');
    cell.ondrop = e => { e.preventDefault(); cell.classList.remove('drop-before'); let src; try { src = JSON.parse(e.dataTransfer.getData('text/x-fp-frames')); } catch { return; } moveFrames(src, k, e.altKey); };
    strip.append(cell);
  });
  strip.ondragover = e => { if (e.target === strip && e.dataTransfer.types.includes('text/x-fp-frames')) e.preventDefault(); };
  strip.ondrop = e => { if (e.target !== strip) return; e.preventDefault(); let src; try { src = JSON.parse(e.dataTransfer.getData('text/x-fp-frames')); } catch { return; } moveFrames(src, S.frames.length, e.altKey); };
  rootEl.append(strip);
  rootEl.append(renderFoot());
  paintThumbs();
  scheduleThumbs();
}

function sizeFloat() {
  const sec = C.panels.sectionOf('timeline'), win = sec && sec.closest('.float-panel');
  if (!win || win.dataset.tlSized || win.querySelectorAll('.panel').length > 1) return;
  win.dataset.tlSized = '1';
  if (win.getBoundingClientRect().width < 480) win.style.width = Math.round(Math.min(760, innerWidth * 0.55)) + 'px';
}
function moveFrames(src, at, copy) {
  src = src.filter(k => k >= 0 && k < S.frames.length).sort((a, b) => a - b); if (!src.length) return;
  change(copy ? '复制帧' : '移动帧', () => {
    const picked = src.map(k => copy ? { ...clone(S.frames[k]), id: newFrameId(usedIds()) } : S.frames[k]);
    const curId = S.frames[S.cur].id;
    let ins = at;
    if (!copy) { for (const k of src.slice().reverse()) { S.frames.splice(k, 1); if (k < at) ins--; } }
    S.frames.splice(ins, 0, ...picked);
    S.sel = picked.map((_, j) => ins + j);
    S.cur = copy ? ins : Math.max(0, S.frames.findIndex(f => f.id === curId));
  });
}
function renderCreate() {
  const kind = lsGet().kind === 'frames' ? 'frames' : 'video';
  const wrap = mk('div', { className: 'tl-empty' });
  const box = mk('div', { className: 'tl-create' });
  const main = mk('button', { type: 'button', className: 'tl-main' + (kind === 'video' ? ' is-disabled' : ''), textContent: kind === 'video' ? '创建视频时间轴' : '创建帧动画' });
  main.dataset.attr = 'tl-create';
  main.title = kind === 'video' ? VIDEO_WHY : '以当前的图层状态作为第 1 帧，创建帧动画';
  main.onclick = () => { if (kind === 'video') { C.status(VIDEO_WHY); return; } createAnimation(); };
  const arr = mk('button', { type: 'button', className: 'tl-arrow', title: '选择时间轴类型' }); arr.dataset.attr = 'tl-create-menu';
  arr.append(iconImg('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="6"><path d="M0 0h9L4.5 6z" fill="#cfcfcf"/></svg>'), 9));
  arr.onclick = () => { const r = box.getBoundingClientRect(); C.panels.popup([
    { label: '创建视频时间轴', disabled: true, why: VIDEO_WHY, checked: kind === 'video' },
    { label: '创建帧动画', checked: kind === 'frames', disabled: !C.hasDoc(), why: '先打开一个文档', run: () => { lsSet({ kind: 'frames' }); createAnimation(); render(); } },
  ], { left: r.left, right: r.right, top: r.top, bottom: r.bottom, alignLeft: true }); };
  box.append(main, arr); wrap.append(box); rootEl.append(wrap);
  if (!C.hasDoc()) { main.disabled = true; arr.disabled = true; }
}
function renderFoot() {
  const foot = mk('div', { className: 'tl-foot' });
  const B = (icon, tip, run, dis, attr) => { const b = mk('button', { type: 'button', className: 'lf-btn', title: tip, disabled: !!dis }); b.dataset.attr = attr; b.append(icon); b.onclick = run; foot.append(b); return b; };
  B(uiIcon('anim-convert', 16), '转换为视频时间轴 —— ' + VIDEO_WHY, () => {}, true, 'tl-to-video');
  const loop = mk('select', { title: '选择循环选项' }); loop.dataset.attr = 'tl-loop';
  const known = [[1, '一次'], [3, '3 次'], [0, '永远']];
  for (const [v, t] of known) loop.append(mk('option', { value: String(v), textContent: t }));
  if (!known.some(([v]) => v === S.loop)) loop.append(mk('option', { value: String(S.loop), textContent: `${S.loop} 次` }));
  loop.append(mk('option', { value: 'other', textContent: '其它…' }));
  loop.value = String(S.loop);
  loop.onchange = () => setLoop(loop.value === 'other' ? 'other' : +loop.value);
  foot.append(loop);
  const n = S.frames.length, busy = !C.hasDoc();
  B(uiIcon('anim-first', 16), '选择第一帧', () => { stop(); gotoFrame(0); }, busy || S.cur === 0, 'tl-first');
  B(uiIcon('anim-prev', 16), '选择上一帧', () => { stop(); gotoFrame(S.cur > 0 ? S.cur - 1 : n - 1); }, busy || n < 2, 'tl-prev');
  B(iconImg(playing ? ACT_ICONS.stop : ACT_ICONS.play, 16), playing ? '停止动画' : '播放动画', () => (playing ? stop() : play()), busy || n < 2, 'tl-play');
  B(uiIcon('anim-next', 16), '选择下一帧', () => { stop(); gotoFrame(S.cur < n - 1 ? S.cur + 1 : 0); }, busy || n < 2, 'tl-next');
  B(uiIcon('anim-tween', 16), '过渡动画帧', () => tweenUI(), busy || n < 1, 'tl-tween');
  foot.append(mk('span', { className: 'grow' }));
  B(uiIcon('anim-dup', 16), '复制所选帧', () => duplicateFrames(), busy, 'tl-dup');
  B(lbIcon('Trashcan', 16), '删除所选帧', () => deleteFrames(), busy || n < 2, 'tl-del');
  return foot;
}
function delayMenu(anchor) {
  const cur = S.frames[S.cur] ? S.frames[S.cur].delay : 0;
  const items = DELAYS.map(([v, t]) => ({ label: t, checked: Math.abs(cur - v) < 1e-6, run: () => setDelay(v) }));
  items.push({ label: '其它…', run: () => setDelay('other') });
  if (!DELAYS.some(([v]) => Math.abs(cur - v) < 1e-6)) items.push({ sep: true }, { label: (+cur.toFixed(2)) + ' 秒', checked: true, run: () => {} });
  const r = anchor.getBoundingClientRect();
  C.panels.popup(items, { left: r.left, right: r.right, top: r.top, bottom: r.bottom, alignLeft: true });
}
function menuItems() {
  const has = hasAnim(), n = S.frames.length, multi = sortedSel().length > 1;
  const why = C.hasDoc() ? '还没有帧动画（面板中间「创建帧动画」）' : '先打开一个文档';
  return [
    { label: '新建帧', run: () => duplicateFrames(), disabled: !has, why },
    { label: multi ? '删除多帧' : '删除单帧', run: () => deleteFrames(), disabled: !has || n < 2 },
    { label: '删除动画', run: () => deleteAnimation(), disabled: !S.on },
    { sep: true },
    { label: multi ? '拷贝多帧' : '拷贝单帧', run: () => copyFrames(), disabled: !has },
    { label: clip && clip.length > 1 ? '粘贴多帧…' : '粘贴单帧…', run: () => pasteFrames(), disabled: !has || !clip },
    { sep: true },
    { label: '选择全部帧', run: () => selectAll(), disabled: !has },
    { sep: true },
    { label: '过渡…', run: () => tweenUI(), disabled: !has },
    { label: '反向帧', run: () => reverseFrames(), disabled: !has || n < 2 },
    { label: '优化动画…', run: () => optimizeUI(), disabled: !has },
    { sep: true },
    { label: '从图层建立帧', run: () => framesFromLayers(), disabled: !C.hasDoc() },
    { label: '将帧拼合到图层', run: () => flattenFramesIntoLayers(), disabled: !has },
    { label: '跨帧匹配图层…', run: () => matchLayerUI(), disabled: !has || n < 2 },
    { label: '为每个新帧创建新图层', checked: !!S.opt.newPerFrame, run: () => { S.opt.newPerFrame = !S.opt.newPerFrame; S.dirty = true; } },
    { label: '新建在所有帧中都可见的图层', checked: !!S.opt.newAllFrames, run: () => { S.opt.newAllFrames = !S.opt.newAllFrames; S.dirty = true; } },
    { sep: true },
    { label: '转换为视频时间轴', disabled: true, why: VIDEO_WHY },
    { sep: true },
    { label: '面板选项…', run: () => panelOptionsUI() },
  ];
}


function renderBar() {
  const list = document.getElementById('layerList'); if (!list) return;
  if (!barEl || !barEl.isConnected) {
    barEl = mk('div', { id: 'tlUnifyBar' });
    barEl.append(mk('span', { textContent: '统一:' }));
    const mkB = (kind, icon, tip) => { const b = mk('button', { type: 'button', title: tip }); b.dataset.unify = kind; b.append(uiIcon(icon, 14)); b.onclick = () => unify(kind); barEl.append(b); };
    mkB('pos', 'unify-position', '统一图层位置（改这一层的位置会作用到所有帧）');
    mkB('vis', 'unify-visibility', '统一图层可见性');
    mkB('sty', 'unify-style', '统一图层样式（不透明度 / 填充 / 效果）');
    const cb = mk('input', { type: 'checkbox' }); cb.dataset.attr = 'tl-propagate';
    cb.onchange = () => setPropagate(cb.checked);
    barEl.append(mk('label', { title: '传播帧 1：在第 1 帧上改选中图层的属性，后面与它原来一样的帧跟着改' }, cb, mk('span', { textContent: '传播帧 1' })));
    list.parentElement.insertBefore(barEl, list);
  }
  const mode = document.documentElement.dataset.lpAnim || 'auto';   
  const show = mode === 'show' || (mode !== 'hide' && hasAnim());
  barEl.hidden = !show;
  if (!show) return;
  const sel = C.selected(), fl = sel.length ? flagsOf(C.keyOf(sel[0])) : {};
  for (const b of barEl.querySelectorAll('button[data-unify]')) { b.classList.toggle('on', !!fl[b.dataset.unify]); b.disabled = !sel.length; }
  const cb = barEl.querySelector('input'); cb.checked = !!fl.prop; cb.disabled = !sel.length;
}



async function animForExport() {
  if (!hasAnim() || S.frames.length < 2) return null;
  const canvases = await renderFrames();
  return { canvases, frames: S.frames.map(f => ({ delay: f.delay, disp: f.disp })), loop: S.loop, bbox: S.opt.bbox, redundant: S.opt.redundant };
}
async function exportAnimUI() {
  if (!hasAnim()) { await C.alertDialog('这个文档还没有帧动画（窗口 › 时间轴 → 创建帧动画）。', { title: '导出为动画 GIF / APNG' }); return false; }
  const v = await C.formDialog('导出为动画 GIF / APNG', [
    { key: 'fmt', label: '格式', type: 'select', value: 'gif', options: [['gif', 'GIF（256 色）'], ['apng', 'APNG（全彩 + 半透明）']] },
    { key: 'loop', label: '循环选项', type: 'select', value: String(S.loop), options: [['1', '一次'], ['3', '3 次'], ['0', '永远'], ...([0, 1, 3].includes(S.loop) ? [] : [[String(S.loop), S.loop + ' 次']])] },
    { key: 'colors', label: '颜色', type: 'number', value: 256, min: 2, max: 256, showIf: o => o.fmt === 'gif' },
    { key: 'dither', label: '仿色', type: 'select', value: 'diffusion', options: [['none', '无仿色'], ['diffusion', '扩散'], ['pattern', '图案'], ['noise', '杂色']], showIf: o => o.fmt === 'gif' },
    { key: 'trans', label: '透明度', type: 'check', value: true },
    { key: 'matte', label: '杂边', type: 'color', value: '#ffffff' },
    { key: 'pct', label: '图像大小', type: 'number', value: 100, min: 1, max: 400, unit: '%' },
    { type: 'note', label: `优化（面板菜单 › 优化动画…）：外框 ${S.opt.bbox ? '开' : '关'} · 去除多余像素 ${S.opt.redundant ? '开' : '关'}（仅 GIF）` },
  ], { okText: '导出' });
  if (!v) return false;
  const res = await exportAnimation({ fmt: v.fmt, loop: +v.loop, colors: +v.colors, dither: v.dither, transparency: !!v.trans, matte: v.matte, pct: +v.pct });
  if (!res) return false;
  const name = safe(C.docName().replace(/\.[^.]+$/, '')) + (v.fmt === 'gif' ? '.gif' : '.png');
  C.download(name, new Blob([res], { type: v.fmt === 'gif' ? 'image/gif' : 'image/apng' }));
  exportAnimUI.last = { name, size: res.length, head: Array.from(res.slice(0, 8)) };
  C.status(`已导出动画：${name}（${S.frames.length} 帧，${(res.length / 1024).toFixed(1)}K）`);
  return true;
}
export async function exportAnimation(o = {}) {
  if (!hasAnim()) return null;
  const canvases = await renderFrames();
  const k = Math.max(0.01, (o.pct || 100) / 100);
  const W = Math.max(1, Math.round(canvases[0].width * k)), H = Math.max(1, Math.round(canvases[0].height * k));
  const scaled = canvases.map(cv => { if (W === cv.width && H === cv.height) return cv; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, W, H); return c; });
  const frames = S.frames.map(f => ({ delay: f.delay, disp: f.disp }));
  const loop = o.loop != null ? o.loop : S.loop;
  if (o.fmt === 'apng') {
    const pngs = [];
    for (const cv of scaled) {
      let c = cv;
      if (o.transparency === false) { c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = o.matte || '#fff'; g.fillRect(0, 0, W, H); g.drawImage(cv, 0, 0); }
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      pngs.push(new Uint8Array(await b.arrayBuffer()));
    }
    return encodeApng(pngs, frames, W, H, { loop });
  }
  const hex = String(o.matte || '#ffffff'); const matte = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
  return encodeAnimatedGif(scaled.map((cv, i) => ({ rgba: cv.getContext('2d').getImageData(0, 0, W, H).data, ...frames[i] })), W, H,
    { loop, colors: o.colors || 256, palette: o.palette || 'selective', dither: o.dither || 'diffusion', amount: o.amount ?? 100, transparency: o.transparency !== false, matte, bbox: o.bbox ?? S.opt.bbox, redundant: o.redundant ?? S.opt.redundant });
}


let installed = false;
export function installTimeline(ctx) {
  C = ctx;
  if (installed) return api; installed = true;
  ensureStyle();
  if (!DOC_EXT.includes(TL)) DOC_EXT.push(TL);
  { const t = lsGet().thumb; if (t && THUMB_H[t] != null) OPT_DEFAULT.thumb = t; S.opt.thumb = OPT_DEFAULT.thumb; }
  const { R } = ctx;
  const noDoc = () => C.hasDoc() ? '还没有帧动画（窗口 › 时间轴 → 创建帧动画）' : '先打开一个文档';
  R('timeline.createFrameAnimation', () => createAnimation(), () => C.hasDoc() && !S.on, { why: () => S.on ? '已经有帧动画了' : '先打开一个文档' });
  R('timeline.play', () => (playing ? stop() : play()), () => hasAnim() && S.frames.length > 1, { why: noDoc });
  R('timeline.nextFrame', () => gotoFrame(S.cur + 1 < S.frames.length ? S.cur + 1 : 0), () => hasAnim(), { why: noDoc });
  R('timeline.prevFrame', () => gotoFrame(S.cur > 0 ? S.cur - 1 : S.frames.length - 1), () => hasAnim(), { why: noDoc });
  R('timeline.firstFrame', () => gotoFrame(0), () => hasAnim(), { why: noDoc });
  R('timeline.newFrame', () => duplicateFrames(), () => hasAnim(), { why: noDoc });
  R('timeline.deleteFrames', () => deleteFrames(), () => hasAnim() && S.frames.length > 1, { why: noDoc });
  R('timeline.tween', () => tweenUI(), () => hasAnim(), { why: noDoc });
  R('file.exportAnimation', () => exportAnimUI(), () => hasAnim(), { why: noDoc });
  R('file.renderVideo', () => false, () => false, { why: () => VIDEO_WHY });
  R('file.videoFrames', () => false, () => false, { why: () => VIDEO_WHY });
  C.panels.setPanelMenu('timeline', menuItems);
  
  try {
    const exp = MENUS.find(m => m.id === 'file').items.find(x => x.sub && x.sub.some(y => y.action === 'file.saveForWeb'));
    if (exp && !exp.sub.some(y => y.action === 'file.exportAnimation')) exp.sub.splice(exp.sub.findIndex(y => y.action === 'file.saveForWeb') + 1, 0, { label: '导出为动画 GIF / APNG…', action: 'file.exportAnimation' });
  } catch {}
  setAnimProvider(() => animForExport());
  try { C.panels.onChange(() => { sizeFloat(); render(); }); } catch {}
  
  const list = document.getElementById('layerList');
  if (list) new MutationObserver(() => { if (!hasAnim() || playing) return; renderBar(); thumbDirty.add(S.frames[S.cur] && S.frames[S.cur].id); scheduleThumbs(); }).observe(list, { childList: true });
  
  addEventListener('pointerup', e => { if (hasAnim() && e.target && e.target.closest && e.target.closest('.docarea, #stage, canvas')) markAllThumbs(); }, true);
  
  let spaceAt = 0, spaceDirty = false;
  addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) { spaceAt = e.timeStamp || performance.now(); spaceDirty = false; } }, true);
  addEventListener('pointerdown', () => { if (spaceAt) spaceDirty = true; }, true);
  addEventListener('keyup', e => {
    if (e.code !== 'Space') return;
    const t = spaceAt ? (e.timeStamp || performance.now()) - spaceAt : 1e9; spaceAt = 0;
    const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    if (spaceDirty || t > 250 || !hasAnim() || S.frames.length < 2 || !C.panels.isOpen('timeline')) return;
    if (playing) stop(); else play();
  }, true);
  render();
  return api;
}
const api = { TL, render, createAnimation, gotoFrame, duplicateFrames, deleteFrames, deleteAnimation, copyFrames, pasteFrames, selectAll, reverseFrames,
  setDelay, setDisposal, setLoop, tweenUI, optimizeUI, framesFromLayers, flattenFramesIntoLayers, matchLayerUI, panelOptionsUI, unify, setPropagate,
  play, stop, isPlaying, renderFrames, exportAnimation, exportAnimUI, menuItems, commit, state: () => S };
export default api;
