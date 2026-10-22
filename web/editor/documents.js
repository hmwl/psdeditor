
























import { releaseDocumentFile } from './document-file.js';
import { releaseDocumentCaches } from './document-cache.js';
import { actions } from './actions.js';
import { shortcuts } from './shortcuts.js';
import { formDialog, choiceDialog } from './dialog.js';
import { parsePsdFull } from '../../core/psd-parse.js';
import { get as preference } from './preferences.js';

const TP = () => import('../../core/psd-transplant.js');

const $ = s => document.querySelector(s);
let ctx = null;
const docs = new Map();          
let views = [];                  
let active = null;               
let seq = 0, vseq = 0, fseq = 0;
let busy = false;
let pending = null;              
let tabSignature = '';
export const opts = { zoomAll: false, scrollAll: false, rotateAll: false, resizeWin: false };



let mode = 'tabs', gridKey = null;
let frames = [];                 
let dockTree = null, splitSeq = 0;

const V = id => views.find(v => v.id === id) || null;
const activeView = () => V(active);
const activeUid = () => { const v = activeView(); return v ? v.uid : null; };
const fmtZoom = z => { const p = (z || 1) * 100; return (p >= 100 ? Math.round(p) : Math.round(p * 100) / 100) + '%'; };



function ensure() {
  if (!ctx || pending) return;
  if (active == null && ctx.hasDoc()) {
    const d = { uid: ++seq, name: ctx.docName(), state: null, snap: null, title: '', dirty: false, cleanSignature: ctx.editSignature?.() };
    docs.set(d.uid, d); const v = { id: ++vseq, uid: d.uid, v: null }; views.push(v); active = v.id;
    ctx.setDocumentUid?.(d.uid);
  } else if (active != null && !ctx.hasDoc()) {
    const uid = activeUid(); dropDoc(uid); active = null;
  }
}
function dropDoc(uid) {
  const ids = views.filter(v => v.uid === uid).map(v => v.id);
  views = views.filter(v => v.uid !== uid);
  docs.delete(uid); releaseDocumentFile(uid); releaseDocumentCaches(uid, !docs.size);
  for (const f of frames) { f.views = f.views.filter(id => !ids.includes(id)); if (!f.views.includes(f.cur)) f.cur = f.views[0] ?? null; }
  frames = frames.filter(f => f.views.length);
}
function isDirty() {
  ensure(); const d = docs.get(activeUid());
  if (!ctx?.hasDoc()) return false;
  if (ctx.inside()) return ctx.dirty();
  return d?.cleanSignature != null && ctx.editSignature ? d.cleanSignature !== ctx.editSignature() : ctx.dirty();
}
function renameDocument(uid, name) {
  const d = docs.get(uid); if (!d) return;
  d.name = name;
  if (d.state) { d.state.docName = name; d.state.docLabel = name; }
}
function markClean(uid = activeUid(), signature = ctx.editSignature?.()) {
  const d = docs.get(uid); if (!d) return;
  d.cleanSignature = signature; d.dirty = false;
  if (uid === activeUid()) { d.name = ctx.docName(); ctx.syncTab(); }
  renderTabs(); renderFrames();
}
function liveTitle() { const t = $('#docTab'); return (t && t.title) || ctx.docName(); }
function tombstoneState(st, clean = false){
  const layers = st?.doc?.layers || [];
  for (const l of layers) {
    l?.lazyHighTiles?.clear?.(); l?.lazyImageTiles?.clear?.();
    if (l?.lazyImageChunks) { for (const c of l.lazyImageChunks.values()) c?.image?.close?.(); l.lazyImageChunks.clear(); }
    if (l?.lazyGpuDetail) { l.lazyGpuDetail.tiles?.clear?.(); for (const q of l.lazyGpuDetail.levels?.values?.() || []) q.tiles?.clear?.(); }
    if (l?.lazyRasterSource) {
      const file = l.lazyRasterFile || st.doc?.lazyRasterFile;
      l.lazyImage?.close?.(); l.lazyImage = null;
      st.tombstone = { ...(st.tombstone || {}), lazyImageSource: true, lazyImageFile: file || null };
    }
  }
  if (st?.maps) for (const key of ['layerCanvasCache', 'thumbCache', 'maskThumbCache', 'soRasterCache']) st.maps[key] = {};
  if (st?.full?.artboardCache) st.full.artboardCache = { buf: null, list: [] };
  st.tombstone = { version: 1, releasedAt: Date.now(), ...(st.tombstone || {}) };
  if (clean && st.doc?.sourceFile && st.origBuffer?.byteLength > 32 * 1024 * 1024 && !st.tombstone.lazyImageSource) {
    st.tombstone.cleanPsdSource = st.doc.sourceFile; st.doc = null; st.origBuffer = null; st.maps = {};
  }
}

async function stash(uid) {
  const d = docs.get(uid); if (!d) return;
  const c = ctx.layerClip();
  if (c && c.docUid === uid && !c.frozen && ctx.freezeClip) { try { await ctx.freezeClip(c); } catch {} }
  d.name = ctx.docName(); d.title = liveTitle(); d.dirty = isDirty();
  d.snap = ctx.snapshot(1600);
  d.state = ctx.capture();
  tombstoneState(d.state, !d.dirty);
  releaseDocumentCaches(uid, false);
}
function viewTitle(v) {
  const d = docs.get(v.uid); if (!d) return '';
  if (v.id === active) return liveTitle();
  const z = v.v ? v.v.zoom : null;
  const base = (d.title || d.name || '').replace(/ @ [0-9.]+%/, z ? ' @ ' + fmtZoom(z) : '');
  return base || d.name;
}
function shortTitle(v) { const d = docs.get(v.uid); const n = views.filter(x => x.uid === v.uid); const k = n.indexOf(v);
  return (d ? d.name : '') + (n.length > 1 ? ':' + (k + 1) : ''); }
export async function queueDeferred(file){
  ensure();
  const d = { uid: ++seq, name: file.name, state: null, snap: null, title: '', dirty: false, cleanSignature: null, deferredFile: file };
  try {
    if (typeof createImageBitmap === 'function' && /^image\//i.test(file.type || '') && !/\.ps[db]$/i.test(file.name)) {
      const im = await createImageBitmap(file, { resizeWidth: 480, resizeHeight: 480, resizeQuality: 'high' });
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); im.close?.(); d.snap = cv;
    }
  } catch {}
  docs.set(d.uid, d); const v = { id: ++vseq, uid: d.uid, v: null }; views.push(v);
  if (mode !== 'tabs') frames.push({ id: ++fseq, views: [v.id], cur: v.id, float: true, rect: { x: 30 + frames.length * 24, y: 20 + frames.length * 24, w: 640, h: 480 } });
  renderTabs(); renderFrames(); return d.uid;
}


async function activate(viewId) {
  ensure();
  const tv = V(viewId); if (!tv) return false;
  if (viewId === active) return true;
  if (busy) return false;
  busy = true;
  try {
    const cv = activeView();
    if (cv && ctx.hasDoc()) {
      if (!await ctx.settle()) return false;
      cv.v = ctx.getView();
      if (cv.uid !== tv.uid) await stash(cv.uid);
    }
    const td = docs.get(tv.uid);
    if (td?.deferredFile) {
      const file = td.deferredFile, at = views.indexOf(tv), oldFrames = frames.map(f => ({ ...f, views: f.views.slice(), rect: f.rect && { ...f.rect } }));
      removeView(tv.id); docs.delete(td.uid); releaseDocumentCaches(td.uid, false);
      let ok = false; const gate = busy; busy = false;
      try { ok = await ctx.open(file); } catch (e) { ctx.error?.('打开文档失败：' + (e?.message || e)); } finally { busy = gate; }
      if (ok) return true;
      docs.set(td.uid, td); views.splice(Math.max(0, at), 0, tv); frames = oldFrames; renderLayout(); renderTabs(); renderFrames();
      return false;
    }
    if (!cv || cv.uid !== tv.uid) {
      const d = docs.get(tv.uid), st = d?.state, tomb = st?.tombstone;
      if (tomb?.cleanPsdSource) {
        await ctx.reload(await tomb.cleanPsdSource.arrayBuffer(), d.name);
        d.state = null;
      } else if (st && tomb?.lazyImageSource && st.doc) {
        ctx.apply(st); d.state = null;
      } else if (st) { ctx.apply(st); d.state = null; }
    }
    active = viewId;
    const fr = frameOf(viewId); if (fr) fr.cur = viewId;
    ctx.setView(tv.v, { render: false });
    renderLayout();
    ctx.refresh();
    ctx.setView(tv.v);
    renderTabs(); renderFrames();
    return true;
  } finally { busy = false; }
}



async function beginEmbedded(key) {
  ensure();
  const parentView = activeView();
  if (!parentView) return null;
  const existing = views.find(v => {
    const d = docs.get(v.uid);
    return d?.embedded?.parentUid === parentView.uid && d.embedded.key === key;
  });
  if (existing) { await activate(existing.id); return { existing: true }; }
  parentView.v = ctx.getView();
  await stash(parentView.uid);
  const token = { prev: parentView.id, parentUid: parentView.uid, key, uid: ++seq };
  pending = token;
  return token;
}
function endEmbedded(token) {
  if (!token || token.existing) return;
  endOpen(token);
  const d = docs.get(activeUid());
  d.embedded = { parentUid: token.parentUid, parentView: token.prev, key: token.key };
}
function embeddedParent() {
  const d = docs.get(activeUid());
  return d?.embedded ? docs.get(d.embedded.parentUid)?.state : null;
}
function updateEmbeddedParent() {
  const child = docs.get(activeUid());
  const parent = child?.embedded && docs.get(child.embedded.parentUid);
  if (!parent) return;
  
  parent.state = ctx.capture(); parent.snap = ctx.snapshot(1600);
  parent.dirty = true;
  parent.title = (parent.title || parent.name).replace(/ \*$/, '') + ' *';
  renderTabs(); renderFrames();
}
function endEmbeddedClose() {
  const child = docs.get(activeUid());
  if (!child?.embedded) return;
  const parentView = V(child.embedded.parentView) || views.find(v => v.uid === child.embedded.parentUid);
  dropDoc(child.uid);
  active = parentView?.id ?? null;
  const parent = docs.get(parentView?.uid);
  if (parent) parent.state = null; 
  ctx.syncTab(); renderLayout(); renderTabs(); renderFrames();
}


async function beginOpen() {
  if (!ctx) return {};
  ensure();
  if (busy) return null;
  const tk = { prev: active, uid: ++seq };
  const cv = activeView();
  if (cv && ctx.hasDoc()) {
    busy = true;
    try {
      if (!await ctx.settle()) return null;
      cv.v = ctx.getView();
      await stash(cv.uid);
    } finally { busy = false; }
  }
  ctx.resetForNewDoc();
  pending = tk;
  return tk;
}
function endOpen(tk) {
  if (!ctx || !tk) return;
  pending = null;
  const d = { uid: tk.uid ?? ++seq, name: ctx.docName(), state: null, snap: null, title: '', dirty: false, cleanSignature: ctx.editSignature?.() };
  docs.set(d.uid, d);
  const v = { id: ++vseq, uid: d.uid, v: null };
  const at = views.findIndex(x => x.id === tk.prev);
  views.splice(at >= 0 ? at + 1 : views.length, 0, v);
  if (mode !== 'tabs') {
    const fr = (tk.prev != null && frameOf(tk.prev)) || frames.find(f => !f.float) || frames[0];
    if (fr) { fr.views.push(v.id); fr.cur = v.id; } else frames.push({ id: ++fseq, views: [v.id], cur: v.id, float: false });
  }
  active = v.id;
  ctx.setDocumentUid?.(d.uid);
  renderLayout(); renderTabs(); renderFrames();
  if (mode !== 'tabs') ctx.setView(null);
  if (preference('workspace.openAsTabs') === false) floatView(v.id);
}
function abortOpen(tk) {
  if (!ctx || !tk) return;
  pending = null;
  const pv = tk.prev != null ? V(tk.prev) : null;
  if (pv) {
    const d = docs.get(pv.uid);
    if (d && d.state) { ctx.apply(d.state); d.state = null; }
    active = pv.id;
    ctx.setView(pv.v, { render: false }); ctx.refresh(); ctx.setView(pv.v);
  }
  renderTabs(); renderFrames();
}


async function closeView(viewId = active, o = {}) {
  ensure();
  const v = V(viewId); if (!v) return false;
  const d = docs.get(v.uid);
  const siblings = views.filter(x => x.uid === v.uid && x.id !== v.id);
  if (siblings.length) {
    if (viewId === active) { const nx = siblings[0]; const fr = frameOf(viewId); removeView(viewId); active = null; await activateSameDoc(nx, fr); }
    else removeView(viewId);
    renderLayout(); renderTabs(); renderFrames(); return true;
  }
  
  for (const child of [...docs.values()].filter(x => x.embedded?.parentUid === v.uid)) {
    const childView = views.find(x => x.uid === child.uid);
    if (childView && !await closeView(childView.id, o)) return false;
  }
  if (d?.embedded) {
    if (viewId !== active && !await activate(viewId)) return false;
    return await ctx.closeEmbedded(o);
  }
  let isActive = viewId === active;
  const dirty = isActive ? isDirty() : !!(d && d.dirty);
  if (dirty && !o.discard) {
    const nm = (isActive ? ctx.docName() : d.name) || '未标题';
    const ch = await choiceDialog(`要在关闭之前存储对 PSD Editor 文档“${nm}”的更改吗？`, { title: '关闭', okText: '是', extraText: '否', cancelText: '取消' });
    if (ch === 'cancel') return false;
    if (ch === 'ok') {
      if (!isActive && !await activate(viewId)) return false;
      if (!await ctx.save()) return false;
      isActive = viewId === active;
    }
  }
  if (isActive) {
    if (!await ctx.settle()) return false;
    const i = views.findIndex(x => x.id === viewId);
    const fr = frameOf(viewId);
    removeView(viewId); docs.delete(v.uid); releaseDocumentFile(v.uid); releaseDocumentCaches(v.uid, !docs.size);
    active = null;
    const next = (fr && fr.views.length && V(fr.cur)) || views[Math.min(i, views.length - 1)] || views[i - 1] || null;
    if (next) {
      const nd = docs.get(next.uid);
      if (nd && nd.state) { ctx.apply(nd.state); nd.state = null; }
      active = next.id; const f2 = frameOf(next.id); if (f2) f2.cur = next.id;
      if (views.length < 2 && mode !== 'tabs') consolidate(true);
      ctx.setView(next.v, { render: false }); renderLayout(); ctx.refresh(); ctx.setView(next.v);
    } else { if (mode !== 'tabs') consolidate(true); ctx.closeEmpty(); }
  } else { removeView(viewId); docs.delete(v.uid); releaseDocumentFile(v.uid); releaseDocumentCaches(v.uid, !docs.size); if (views.length < 2 && mode !== 'tabs') consolidate(true); }
  renderLayout(); renderTabs(); renderFrames();
  return true;
}
async function activateSameDoc(nx, fr) {
  active = nx.id; if (fr && frameOf(nx.id) === fr) fr.cur = nx.id;
  ctx.setView(nx.v, { render: false }); renderLayout(); ctx.refresh(); ctx.setView(nx.v);
}
function removeView(id) {
  views = views.filter(x => x.id !== id);
  for (const f of frames) { f.views = f.views.filter(x => x !== id); if (f.cur === id) f.cur = f.views[0] ?? null; }
  frames = frames.filter(f => f.views.length);
}
async function closeDoc(uid) {
  const vs = views.filter(v => v.uid === uid);
  if (!vs.length) return true;
  for (const v of vs.slice(1)) removeView(v.id);
  return closeView(vs[0].id);
}
async function closeAll() {
  ensure();
  
  const au = activeUid();
  for (const uid of [...docs.keys()].filter(u => u !== au)) if (!await closeDoc(uid)) return false;
  if (au != null && docs.has(au)) return closeDoc(au);
  return true;
}
async function closeOthers() {
  ensure();
  const au = activeUid();
  for (const uid of [...docs.keys()].filter(u => u !== au)) if (!await closeDoc(uid)) return false;
  return true;
}
function cycle(dir) { ensure(); if (views.length < 2) return; const i = views.findIndex(v => v.id === active); activate(views[(i + dir + views.length) % views.length].id); }


function renderTabs() {
  const bar = $('#docTabs'), main = $('#docTab'); if (!bar || !main) return;
  for (const el of bar.querySelectorAll('.doctab.dt-x')) el.remove();
  const anchor = $('#docName') || null;
  if (views.length < 2) { main.dataset.view = active ?? ''; if (anchor) bar.insertBefore(main, anchor); return; }
  for (const v of views) {
    let el;
    if (v.id === active) { el = main; }
    else {
      el = document.createElement('div'); el.className = 'doctab dt-x';
      const t = document.createElement('span'); t.className = 'doctab-title'; t.textContent = viewTitle(v);
      const x = document.createElement('button'); x.className = 'doctab-close'; x.title = '关闭'; x.textContent = '×';
      x.addEventListener('click', e => { e.stopPropagation(); closeView(v.id); });
      el.append(t, x); el.title = viewTitle(v);
      el.addEventListener('click', () => activate(v.id));
      el.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); closeView(v.id); } });
    }
    el.dataset.view = v.id;
    bar.insertBefore(el, anchor);
  }
}


const GRID = {                 
  tileV: n => Array.from({ length: n }, (_, i) => [i / n, 0, 1 / n, 1]),
  tileH: n => Array.from({ length: n }, (_, i) => [0, i / n, 1, 1 / n]),
  '2v': () => GRID.tileV(2), '2h': () => GRID.tileH(2), '3v': () => GRID.tileV(3), '3h': () => GRID.tileH(3),
  '3s': () => [[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]],
  '4': () => [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
  '6': () => [0, 1, 2, 3, 4, 5].map(i => [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, .5]),
};
const GRID_CELLS = { tileV: Infinity, tileH: Infinity, '2v': 2, '2h': 2, '3v': 3, '3h': 3, '3s': 3, '4': 4, '6': 6 };
const frameOf = viewId => frames.find(f => f.views.includes(viewId)) || null;
function area() { const h = $('#docFrames') || $('#viewport'); const r = h ? h.getBoundingClientRect() : null; return { w: r && r.width || 800, h: r && r.height || 600 }; }
const dockLeaf = f => ({ frame: f.id });
function treeFromCells(items) {
  if (items.length === 1) return dockLeaf(items[0].f);
  for (const axis of [0, 1]) {
    const edges = [...new Set(items.map(i => i.c[axis] + i.c[axis + 2]))].sort((a, b) => a - b);
    for (const edge of edges) {
      const a = items.filter(i => i.c[axis] + i.c[axis + 2] <= edge + 1e-8);
      const b = items.filter(i => i.c[axis] >= edge - 1e-8);
      if (!a.length || !b.length || a.length + b.length !== items.length) continue;
      const lo = Math.min(...items.map(i => i.c[axis])), hi = Math.max(...items.map(i => i.c[axis] + i.c[axis + 2]));
      return { id: ++splitSeq, axis, ratio: (edge - lo) / (hi - lo), a: treeFromCells(a), b: treeFromCells(b) };
    }
  }
  return dockLeaf(items[0].f);
}
function pruneDock(node = dockTree) {
  if (!node) return null;
  if (node.frame != null) return frames.some(f => f.id === node.frame && !f.float && f.views.length) ? node : null;
  node.a = pruneDock(node.a); node.b = pruneDock(node.b);
  return !node.a ? node.b : !node.b ? node.a : node;
}
function replaceDockLeaf(node, id, replacement) {
  if (!node) return replacement;
  if (node.frame != null) return node.frame === id ? replacement : node;
  node.a = replaceDockLeaf(node.a, id, replacement); node.b = replaceDockLeaf(node.b, id, replacement); return node;
}


function retainViews() {
  const live = ctx.getView();
  for (const v of views) {
    const s = v.id === active ? live : v.v;
    if (s) v.v = { ...s, zoom: s.fit ? (v.id === active ? live.zoom : docZoomGuess(v) || s.zoom) : s.zoom, fit: false };
  }
  if (activeView()?.v) ctx.setView(activeView().v, { render: false });
}
function floatingSize(id) {
  const v = V(id), d = v && docs.get(v.uid), state = d?.state;
  const size = v?.uid === activeUid() ? ctx.docSize() : { w: state?.docW || d?.snap?.docW, h: state?.docH || d?.snap?.docH };
  const A = area(), zoom = v?.v?.zoom || ctx.getView().zoom || 1;
  return { w: Math.min(A.w, Math.max(160, Math.round((size.w || 400) * zoom + 32))), h: Math.min(A.h, Math.max(110, Math.round((size.h || 300) * zoom + 56))) };
}

function arrangeGrid(key) {
  ensure(); if (!views.length) return;
  const required = GRID_CELLS[key];
  if (!required || Number.isFinite(required) && views.length < required) return false;
  retainViews();
  const n = views.length, cap = GRID_CELLS[key] || 1, k = Math.min(n, cap);
  mode = 'grid'; gridKey = k < cap && cap !== Infinity ? 'tileV' : key;
  
  
  
  const order = views.slice();
  frames = [];
  for (let i = 0; i < k; i++) frames.push({ id: ++fseq, views: [order[i].id], cur: order[i].id, float: false });
  for (let i = k; i < n; i++) frames[k - 1].views.push(order[i].id);       
  const cells = GRID[key](k);
  dockTree = treeFromCells(frames.map((f, i) => ({ f, c: cells[i] })));
  relayout(false);
  return true;
}
function arrangeFloat(kind) {
  ensure(); if (!views.length) return;
  retainViews();
  const A = area();
  if (kind === 'float') {                          
    const rest = views.filter(v => v.id !== active).map(v => v.id);
    const keep = frames.filter(f => f.float && !f.views.includes(active));
    frames = [];
    if (rest.length) {
      const inFloat = new Set(keep.flatMap(f => f.views));
      const dock = rest.filter(id => !inFloat.has(id));
      if (dock.length) frames.push({ id: ++fseq, views: dock, cur: dock[0], float: false });
      frames.push(...keep);
    }
    const i = frames.filter(f => f.float).length;
    frames.push({ id: ++fseq, views: [active], cur: active, float: true, rect: { x: 40 + i * 24, y: 30 + i * 24, ...floatingSize(active) } });
  } else {
    const order = [...views.filter(v => v.id !== active), activeView()].filter(Boolean);   
    const n = order.length;
    frames = order.map((v, i) => ({ id: ++fseq, views: [v.id], cur: v.id, float: true, rect: null }));
    if (kind === 'tile') {                         
      const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
      frames.forEach((f, i) => { f.rect = { x: Math.round((i % cols) * A.w / cols), y: Math.round(Math.floor(i / cols) * A.h / rows), w: Math.round(A.w / cols), h: Math.round(A.h / rows) }; });
    } else {                                        
      frames.forEach((f, i) => { f.rect = { x: 20 + i * 26, y: 16 + i * 26, ...floatingSize(f.cur) }; });
    }
  }
  mode = 'free'; gridKey = null;
  dockTree = frames.find(f => !f.float) ? dockLeaf(frames.find(f => !f.float)) : null;
  relayout(false);
}
function consolidate(silent) {
  retainViews();
  mode = 'tabs'; gridKey = null; frames = []; dockTree = null;
  renderLayout(); renderTabs();
  if (!silent) { const v = activeView(); ctx.setView(v && v.v ? { ...ctx.getView(), fit: ctx.getView().fit } : null); }
}
function relayout(refit) {
  renderLayout();
  if (refit && ctx.hasDoc()) { const g = ctx.getView(); ctx.setView({ ...g, fit: true, panX: 0, panY: 0 }); }
  renderTabs(); renderFrames();
}


let origSlot = null, liveStatus = null;
function renderLayout() {
  const vp = $('#viewport'), area0 = $('.docarea'); if (!vp || !area0) return;
  if (!origSlot) { origSlot = { parent: vp.parentNode, next: vp.nextSibling }; liveStatus = $('.docarea > .statusbar'); }
  let host = $('#docFrames');
  if (mode === 'tabs' || !frames.length) {
    if (liveStatus && liveStatus.parentNode !== origSlot.parent) origSlot.parent.append(liveStatus);
    if (vp.parentNode !== origSlot.parent) origSlot.parent.insertBefore(vp, origSlot.next && origSlot.next.parentNode === origSlot.parent ? origSlot.next : null);
    if (host) host.remove();
    area0.classList.remove('multiframe');
    mode = 'tabs'; frames = [];
    kickResize();
    return;
  }
  if (!host) {
    host = document.createElement('div'); host.id = 'docFrames';
    origSlot.parent.insertBefore(host, vp);
    try { new ResizeObserver(() => { layoutRects(); drawSnaps(); }).observe(host); } catch {}
  }
  area0.classList.add('multiframe');
  area0.classList.toggle('all-docs-floating', !frames.some(f => !f.float));
  
  const seen = new Set();
  for (const f of frames) {
    seen.add(String(f.id));
    let el = host.querySelector(`.dframe[data-frame="${f.id}"]`);
    if (!el) el = buildFrame(f, host);
    el.classList.toggle('float', !!f.float);
    if (f.float) host.appendChild(el);                     
  }
  const af = frameOf(active);
  if (af) {
    const el = host.querySelector(`.dframe[data-frame="${af.id}"]`);
    if (af.float) host.appendChild(el);
    const body = el.querySelector('.dframe-body');
    if (vp.parentNode !== body) body.appendChild(vp);
    if (liveStatus && liveStatus.parentNode !== el) el.append(liveStatus);
  }
  
  
  for (const el of host.querySelectorAll('.dframe')) if (!seen.has(el.dataset.frame)) el.remove();
  layoutRects();
  kickResize();
}
let resizeRAF = 0;
function kickResize() { if (resizeRAF) return; resizeRAF = requestAnimationFrame(() => { resizeRAF = 0; window.dispatchEvent(new window.Event('resize')); }); }
function layoutRects() {
  const host = $('#docFrames'); if (!host) return;
  const A = area();
  const docked = frames.filter(f => !f.float);
  dockTree = pruneDock();
  if (!dockTree && docked.length) dockTree = treeFromCells(docked.map((f, i) => ({ f, c: GRID.tileV(docked.length)[i] })));
  const dividers = [];
  const layout = (node, x, y, w, h) => {
    if (!node) return;
    if (node.frame != null) { const f = frames.find(f => f.id === node.frame); if (f) f.cell = [x, y, w, h]; return; }
    const axis = node.axis, extent = axis ? h * A.h : w * A.w;
    const min = Math.min(.45, 100 / Math.max(1, extent));
    node.ratio = Math.max(min, Math.min(1 - min, node.ratio));
    const cut = (axis ? h : w) * node.ratio;
    dividers.push({ node, x: axis ? x : x + cut, y: axis ? y + cut : y, w: axis ? w : 0, h: axis ? 0 : h, extent });
    layout(node.a, x, y, axis ? w : cut, axis ? cut : h);
    layout(node.b, axis ? x : x + cut, axis ? y + cut : y, axis ? w : w - cut, axis ? h - cut : h);
  };
  layout(dockTree, 0, 0, 1, 1);
  docked.forEach((f, i) => {
    const el = host.querySelector(`.dframe[data-frame="${f.id}"]`); if (!el) return;
    const c = f.cell || [0, 0, 1, 1];
    Object.assign(el.style, { left: Math.round(c[0] * A.w) + 'px', top: Math.round(c[1] * A.h) + 'px', width: Math.round(c[2] * A.w) + 'px', height: Math.round(c[3] * A.h) + 'px' });
  });
  const seenDividers = new Set();
  for (const d of dividers) {
    seenDividers.add(String(d.node.id));
    let handle = host.querySelector(`.dframe-divider[data-split="${d.node.id}"]`);
    if (!handle) {
      handle = document.createElement('div'); handle.className = 'dframe-divider'; handle.dataset.split = d.node.id;
      handle.setAttribute('role', 'separator'); handle.tabIndex = 0;
      handle.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const current = handle.divider, start = current.node.ratio, at = current.node.axis ? e.clientY : e.clientX;
        const move = ev => { current.node.ratio = start + ((current.node.axis ? ev.clientY : ev.clientX) - at) / current.extent; layoutRects(); kickResize(); drawSnaps(); };
        const done = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', done); removeEventListener('pointercancel', done); };
        addEventListener('pointermove', move); addEventListener('pointerup', done); addEventListener('pointercancel', done);
      });
      handle.addEventListener('keydown', e => {
        const delta = ['ArrowRight', 'ArrowDown'].includes(e.key) ? .02 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -.02 : 0;
        if (delta) { e.preventDefault(); e.stopPropagation(); handle.divider.node.ratio += delta; layoutRects(); kickResize(); drawSnaps(); }
      });
      host.append(handle);
    }
    handle.divider = d;
    handle.setAttribute('aria-label', '调整文档分屏大小'); handle.setAttribute('aria-orientation', d.node.axis ? 'horizontal' : 'vertical');
    handle.classList.toggle('horizontal', !!d.node.axis);
    Object.assign(handle.style, { left: d.x * A.w - (d.node.axis ? 0 : 3) + 'px', top: d.y * A.h - (d.node.axis ? 3 : 0) + 'px', width: d.node.axis ? d.w * A.w + 'px' : '6px', height: d.node.axis ? '6px' : d.h * A.h + 'px' });
  }
  for (const handle of host.querySelectorAll('.dframe-divider')) if (!seenDividers.has(handle.dataset.split)) handle.remove();
  for (const f of frames.filter(q => q.float)) {
    const el = host.querySelector(`.dframe[data-frame="${f.id}"]`); if (!el || !f.rect) continue;
    const r = f.rect; r.w = Math.max(160, Math.min(A.w, r.w)); r.h = Math.max(110, Math.min(A.h, r.h));
    r.x = Math.max(-r.w + 60, Math.min(A.w - 60, r.x)); r.y = Math.max(0, Math.min(A.h - 24, r.y));
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  }
}
function buildFrame(f, host) {
  const el = document.createElement('div'); el.className = 'dframe'; el.dataset.frame = f.id;
  const bar = document.createElement('div'); bar.className = 'dframe-bar';
  const body = document.createElement('div'); body.className = 'dframe-body';
  const snap = document.createElement('canvas'); snap.className = 'dframe-snap'; body.append(snap);
  const grip = document.createElement('div'); grip.className = 'dframe-grip';
  const footer = document.createElement('footer'); footer.className = 'dframe-status';
  const zoomField = document.createElement('input'); zoomField.className = 'dframe-zoom'; zoomField.setAttribute('aria-label', '文档缩放百分比');
  const size = document.createElement('span'); size.className = 'dframe-size'; footer.append(zoomField, size);
  zoomField.addEventListener('change', async () => {
    const z = parseFloat(zoomField.value) / 100, id = frames.find(q => q.id === f.id)?.cur;
    if (!(z > 0) || id == null || !await activate(id)) return;
    ctx.setView({ ...ctx.getView(), zoom: Math.max(.01, Math.min(32, z)), fit: false }); ctx.syncTab(); renderFrames();
  });
  el.append(bar, body, footer, grip);
  host.append(el);
  
  snap.addEventListener('pointerdown', e => { const fr = frames.find(q => String(q.id) === el.dataset.frame); if (fr && fr.cur != null) { e.preventDefault(); activate(fr.cur); } });
  
  const drag = (e, kind) => {
    const fr = frames.find(q => String(q.id) === el.dataset.frame); if (!fr || !fr.float) return;
    if (e.target.closest('.doctab-close')) return;
    e.preventDefault();
    const s = { x: e.clientX, y: e.clientY, r: { ...fr.rect } };
    let dock = null;
    const mv = ev => { const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      if (kind === 'move') { fr.rect.x = s.r.x + dx; fr.rect.y = s.r.y + dy; }
      else {
        if (kind.includes('e')) fr.rect.w = Math.max(160, s.r.w + dx);
        if (kind.includes('s')) fr.rect.h = Math.max(110, s.r.h + dy);
        if (kind.includes('w')) { const w = Math.max(160, s.r.w - dx); fr.rect.w = w; fr.rect.x = s.r.x + s.r.w - w; }
        if (kind.includes('n')) { const h = Math.max(110, s.r.h - dy); fr.rect.h = h; fr.rect.y = s.r.y + s.r.h - h; }
      }
      if (kind === 'move') {                                
        el.style.pointerEvents = 'none'; dock = floatDockTarget(fr, ev.clientX, ev.clientY); el.style.pointerEvents = '';
        showCaret(dock);
      }
      layoutRects(); if (kind !== 'move' && fr.views.includes(active)) kickResize(); else drawSnaps(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); showCaret(null);
      if (dock) { const t = dock; dock = null; dockFloat(fr, t); return; }
      if (fr.views.includes(active)) kickResize(); drawSnaps(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  bar.addEventListener('pointerdown', e => { if (!e.target.closest('.doctab')) drag(e, 'move'); });
  grip.addEventListener('pointerdown', e => drag(e, 'se'));
  for (const edge of ['n', 'e', 's', 'w', 'nw', 'ne', 'sw']) {
    const handle = document.createElement('div'); handle.className = `dframe-resize dframe-resize-${edge}`;
    handle.addEventListener('pointerdown', e => drag(e, edge)); el.append(handle);
  }
  return el;
}

function renderFrames() {
  const host = $('#docFrames'); if (!host) return;
  for (const f of frames) {
    const el = host.querySelector(`.dframe[data-frame="${f.id}"]`); if (!el) continue;
    el.classList.toggle('active', f.views.includes(active));
    const footer = el.querySelector('.dframe-status'), v0 = V(f.cur), d = v0 && docs.get(v0.uid);
    footer.hidden = f.cur === active;
    if (v0) {
      const s = v0.id === active ? ctx.getView() : v0.v;
      const z = s?.fit ? docZoomGuess(v0) || s.zoom : s?.zoom;
      el.querySelector('.dframe-zoom').value = fmtZoom(z);
      const state = d?.state, dimensions = state ? { w: state.docW, h: state.docH } : ctx.docSize();
      el.querySelector('.dframe-size').textContent = `${dimensions.w} × ${dimensions.h} 像素`;
    }
    const bar = el.querySelector('.dframe-bar'); bar.textContent = '';
    for (const id of f.views) {
      const v = V(id); if (!v) continue;
      const t = document.createElement('div'); t.className = 'doctab' + (id === f.cur ? ' active' : ''); t.dataset.view = id;
      const s = document.createElement('span'); s.className = 'doctab-title'; s.textContent = viewTitle(v);
      const x = document.createElement('button'); x.className = 'doctab-close'; x.title = '关闭'; x.textContent = '×';
      x.addEventListener('click', e => { e.stopPropagation(); closeView(id); });
      t.addEventListener('click', e => { if (e.target.closest('.doctab-close')) return; activate(id); });
      t.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); closeView(id); } });
      t.title = viewTitle(v); t.append(s, x); bar.append(t);
    }
  }
  drawSnaps();
}







const DRAG_CSS = `
.dt-ghost { position: fixed; z-index: 9999; pointer-events: none; opacity: .85; box-shadow: 0 4px 14px rgba(0,0,0,.5); background: var(--ps-bg-3, #3a3a3a); color: var(--ps-text, #ddd); padding: 0 10px; height: 24px; line-height: 24px; font-size: 12px; white-space: nowrap; border-radius: 2px; }
.dt-ghost.dt-float { outline: 2px dashed #2d8ceb; outline-offset: 2px; }
.dt-caret { position: fixed; z-index: 9998; width: 2px; background: #2d8ceb; pointer-events: none; }
.dframe.dt-dock-hot > .dframe-bar, #docTabs.dt-dock-hot { box-shadow: inset 0 -2px 0 #2d8ceb; }
`;
let tabDrag = null;

function tabBars() {
  const out = [];
  const host = $('#docFrames');
  if (mode === 'tabs' || !frames.length) out.push({ el: $('#docTabs'), frame: null, ids: views.map(v => v.id) });
  else {
    const els = host ? [...host.querySelectorAll('.dframe')] : [];
    
    for (const el of els.reverse()) { const f = frames.find(q => String(q.id) === el.dataset.frame); if (f) out.push({ el: el.querySelector('.dframe-bar'), frame: f, ids: f.views.slice(), box: el }); }
    if (!frames.some(f => !f.float)) out.push({ el: $('#docTabs'), frame: 'dock', ids: [] });
  }
  return out.filter(b => b.el);
}

function tabDropAt(x, y, dragId) {
  const bars = tabBars();
  const under = document.elementsFromPoint(x, y);
  for (const e of under) {
    const bar = bars.find(b => b.el === e || b.el.contains(e) || (b.box && b.box === e && false));
    if (!bar) continue;
    const r = bar.el.getBoundingClientRect();
    const tabs = [...bar.el.querySelectorAll('.doctab[data-view]')].filter(t => t.offsetParent !== null && +t.dataset.view !== dragId);
    const ids = bar.ids.filter(id => id !== dragId);
    const rs = tabs.filter(t => ids.includes(+t.dataset.view)).map(t => t.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    const index = rs.filter(q => x > q.left + q.width / 2).length;
    const caretX = !rs.length ? r.left + 2 : index === 0 ? rs[0].left : rs[index - 1].right;
    return { kind: 'bar', bar, index, caretX, top: r.top, h: r.height };
  }
  
  
  for (const e of under) {
    const el = e.closest?.('.dframe:not(.float)');
    if (!el) continue;
    const f = frames.find(q => String(q.id) === el.dataset.frame), r = el.getBoundingClientRect();
    if (!f || f.views.length === 1 && f.views[0] === dragId) break;
    const distances = [['left', x - r.left], ['right', r.right - x], ['top', y - r.top], ['bottom', r.bottom - y]].sort((a, b) => a[1] - b[1]);
    const [side, distance] = distances[0];
    if (distance >= 0 && distance <= 32) {
      const vertical = side === 'left' || side === 'right';
      return { kind: 'split', frame: f, side, preview: { x: r.left + (side === 'right' ? r.width / 2 : 0), y: r.top + (side === 'bottom' ? r.height / 2 : 0), w: vertical ? r.width / 2 : r.width, h: vertical ? r.height : r.height / 2 } };
    }
    break;
  }
  const da = $('.docarea'); const ar = da && da.getBoundingClientRect();
  if (ar && x >= ar.left && x <= ar.right && y >= ar.top && y <= ar.bottom) return { kind: 'float' };
  return null;
}
function clearDockHot() { for (const el of document.querySelectorAll('.dt-dock-hot')) el.classList.remove('dt-dock-hot'); }
function showCaret(t) {
  let preview = document.querySelector('.dt-split-preview');
  if (t?.kind === 'split') {
    if (!preview) { preview = document.createElement('div'); preview.className = 'dt-split-preview'; document.body.append(preview); }
    Object.assign(preview.style, { left: t.preview.x + 'px', top: t.preview.y + 'px', width: t.preview.w + 'px', height: t.preview.h + 'px' });
  } else preview?.remove();
  let c = document.querySelector('.dt-caret');
  if (!t || t.kind !== 'bar') { if (c) c.remove(); return; }
  if (!c) { c = document.createElement('div'); c.className = 'dt-caret'; document.body.append(c); }
  Object.assign(c.style, { left: Math.round(t.caretX - 1) + 'px', top: Math.round(t.top + 2) + 'px', height: Math.round(t.h - 4) + 'px' });
}
function onTabDown(e) {
  if (e.button !== 0 || busy) return;
  const tab = e.target && e.target.closest && e.target.closest('.doctab[data-view]');
  if (!tab || e.target.closest('.doctab-close')) return;
  const id = +tab.dataset.view; if (!V(id)) return;
  ensure();
  const br = tab.getBoundingClientRect();
  const frameEl = tab.closest('.dframe.float');
  tabDrag = { id, x: e.clientX, y: e.clientY, on: false, ghost: null, target: null,
    bar: tab.parentElement && tab.parentElement.getBoundingClientRect(), frameEl,
    frame: frameEl && frames.find(q => String(q.id) === frameEl.dataset.frame),
    title: viewTitle(V(id)), off: { x: e.clientX - br.left, y: e.clientY - br.top } };
}
function onTabMove(e) {
  const D = tabDrag; if (!D) return;
  
  
  
  
  if (D.frame && Math.hypot(e.clientX - D.x, e.clientY - D.y) >= 5 && D.kind !== 'window') {
    const br = D.bar, dy = e.clientY - D.y;
    if (D.frame.views.length === 1 || Math.abs(dy) > 8 || e.clientY < br.top - 4 || e.clientY > br.bottom + 4 || e.clientX < br.left || e.clientX > br.right) {
      D.kind = 'window';
      showCaret(null); if (D.ghost) { D.ghost.remove(); D.ghost = null; }
      D.frameStart = { x: D.frame.rect.x, y: D.frame.rect.y };
    }
  }
  if (!D.on) {
    if (Math.hypot(e.clientX - D.x, e.clientY - D.y) < 5) return;
    D.on = true;
    if (D.kind !== 'window') { D.ghost = document.createElement('div'); D.ghost.className = 'dt-ghost'; D.ghost.textContent = D.title; document.body.append(D.ghost); }
  }
  if (D.kind === 'window') {
    e.preventDefault();
    D.frame.rect.x = D.frameStart.x + (e.clientX - D.x);
    D.frame.rect.y = D.frameStart.y + (e.clientY - D.y);
    D.frameEl.style.pointerEvents = 'none'; D.target = floatDockTarget(D.frame, e.clientX, e.clientY); D.frameEl.style.pointerEvents = '';
    showCaret(D.target);
    layoutRects(); drawSnaps(); return;
  }
  e.preventDefault();
  Object.assign(D.ghost.style, { left: (e.clientX - D.off.x) + 'px', top: (e.clientY - D.off.y) + 'px' });
  let t = tabDropAt(e.clientX, e.clientY, D.id);
  
  if (t && t.kind === 'float' && D.bar && e.clientY >= D.bar.top - 12 && e.clientY <= D.bar.bottom + 12 && e.clientX >= D.bar.left && e.clientX <= D.bar.right) t = null;
  D.target = t;
  D.ghost.classList.toggle('dt-float', !!t && t.kind === 'float');
  showCaret(t);
}
async function onTabUp(e) {
  const D = tabDrag; tabDrag = null; if (!D) return;
  showCaret(null); if (D.ghost) D.ghost.remove();
  if (!D.on) return;
  e.preventDefault(); e.stopPropagation();
  
  const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
  addEventListener('click', eat, true); setTimeout(() => removeEventListener('click', eat, true), 0);
  if (D.kind === 'window') { if (D.target) dockFloat(D.frame, D.target); layoutRects(); drawSnaps(); return; }
  const t = D.target; if (!t) return;
  if (t.kind === 'bar') dropTabIntoBar(D.id, t.bar, t.index);
  else if (t.kind === 'split') splitDockView(D.id, t);
  else floatView(D.id, { x: e.clientX - D.off.x, y: e.clientY - D.off.y });
}
function cancelTabDrag(e) {
  const D = tabDrag; if (!D) return;
  if (e?.type === 'keydown' && e.key !== 'Escape') return;
  if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
  tabDrag = null; D.ghost?.remove(); showCaret(null);
  if (D.frameStart) { Object.assign(D.frame.rect, D.frameStart); layoutRects(); drawSnaps(); }
}

function dropTabIntoBar(id, bar, index) {
  retainViews();
  if (bar.frame === null) {                                  
    const v = V(id); if (!v) return false;
    const rest = views.filter(x => x.id !== id); rest.splice(Math.max(0, Math.min(rest.length, index)), 0, v); views = rest;
    renderTabs(); return true;
  }
  const src = frameOf(id);
  let dst = bar.frame;
  if (dst === 'dock') { dst = { id: ++fseq, views: [], cur: id, float: false }; frames.unshift(dst); dockTree = dockLeaf(dst); }
  if (src) { src.views = src.views.filter(x => x !== id); if (src.cur === id) src.cur = src.views[0] ?? null; }
  dst.views.splice(Math.max(0, Math.min(dst.views.length, index)), 0, id); dst.cur = id;
  frames = frames.filter(f => f.views.length);
  settleFrames(id);
  return true;
}
function splitDockView(id, target) {
  retainViews();
  const src = frameOf(id), dst = target.frame;
  if (!V(id) || !dst || src === dst && src.views.length === 1) return false;
  if (src) { src.views = src.views.filter(v => v !== id); if (src.cur === id) src.cur = src.views[0]; }
  frames = frames.filter(f => f.views.length); dockTree = pruneDock();
  const added = { id: ++fseq, views: [id], cur: id, float: false };
  frames.push(added);
  const before = target.side === 'left' || target.side === 'top';
  dockTree = replaceDockLeaf(dockTree, dst.id, { id: ++splitSeq, axis: ['top', 'bottom'].includes(target.side) ? 1 : 0, ratio: .5, a: dockLeaf(before ? added : dst), b: dockLeaf(before ? dst : added) });
  mode = 'grid'; gridKey = 'custom'; settleFrames(id); return true;
}

function settleFrames(focusId) {
  if (mode !== 'tabs' && frames.length === 1 && !frames[0].float) {
    const order = frames[0].views; views = [...order.map(id => V(id)), ...views.filter(v => !order.includes(v.id))].filter(Boolean);
    consolidate(true);
  } else if (mode === 'tabs' && frames.length) mode = 'free';
  renderLayout(); renderTabs(); renderFrames();
  if (focusId != null && focusId !== active) activate(focusId); else kickResize();
}

function floatView(id, at) {
  ensure(); if (!V(id)) return false;
  retainViews();
  const da = $('#docFrames') || $('.docarea'), ar = da.getBoundingClientRect();
  const rect = { x: Math.round((at ? at.x : ar.left + 40) - ar.left), y: Math.round((at ? at.y : ar.top + 30) - ar.top), ...floatingSize(id) };
  if (mode === 'tabs' || !frames.length) {
    const rest = views.filter(v => v.id !== id).map(v => v.id);
    frames = [];
    if (rest.length) frames.push({ id: ++fseq, views: rest, cur: rest.includes(active) ? active : rest[0], float: false });
    frames.push({ id: ++fseq, views: [id], cur: id, float: true, rect });
    mode = 'free'; gridKey = null;
    dockTree = rest.length ? dockLeaf(frames[0]) : null;
  } else {
    const src = frameOf(id);
    if (src && src.float && src.views.length === 1) { src.rect = { ...src.rect, x: rect.x, y: rect.y }; layoutRects(); drawSnaps(); return true; }
    if (src) { src.views = src.views.filter(x => x !== id); if (src.cur === id) src.cur = src.views[0] ?? null; }
    frames = frames.filter(f => f.views.length);
    frames.push({ id: ++fseq, views: [id], cur: id, float: true, rect });
    if (mode === 'tabs') mode = 'free';
  }
  renderLayout(); renderTabs(); renderFrames();
  if (id !== active) activate(id);
  else kickResize();
  return true;
}

function floatDockTarget(fr, x, y) {
  if (preference('workspace.floatDocDocking') === false) return null;
  const t = tabDropAt(x, y, -1);
  if (!t || t.kind === 'float' || t.kind === 'bar' && t.bar.frame === fr || t.kind === 'split' && t.frame === fr) return null;
  return t;
}
function dockFloat(fr, t) {
  retainViews();
  const ids = fr.views.slice();
  if (t.kind === 'split') {
    const first = ids[0]; splitDockView(first, t);
    const added = frameOf(first);
    for (const id of ids.slice(1)) { fr.views = fr.views.filter(v => v !== id); added.views.push(id); }
    added.cur = ids.includes(active) ? active : first;
    frames = frames.filter(f => f.views.length); settleFrames(added.cur); return true;
  }
  frames = frames.filter(f => f !== fr);
  if (t.bar.frame === null) return false;
  let dst = t.bar.frame;
  if (dst === 'dock') { dst = { id: ++fseq, views: [], cur: null, float: false }; frames.unshift(dst); dockTree = dockLeaf(dst); }
  dst.views.splice(Math.max(0, Math.min(dst.views.length, t.index)), 0, ...ids);
  dst.cur = ids.includes(active) ? active : fr.cur;
  const focus = ids.includes(active) ? active : null;
  settleFrames(focus);
  return true;
}

let liveSnap = null, liveSnapAt = 0, liveSnapUid = null;
function snapFor(v) {
  const d = docs.get(v.uid); if (!d) return null;
  if (v.uid === activeUid()) {
    if (!liveSnap || liveSnapUid !== v.uid || performance.now() - liveSnapAt > 600) { liveSnap = ctx.snapshot(1600); liveSnapAt = performance.now(); liveSnapUid = v.uid; }
    return liveSnap;
  }
  return d.snap;
}
function drawSnaps() {
  const host = $('#docFrames'); if (!host) return;
  for (const f of frames) {
    const el = host.querySelector(`.dframe[data-frame="${f.id}"]`); if (!el) continue;
    const cv = el.querySelector('.dframe-snap'), body = el.querySelector('.dframe-body');
    const isLive = f.cur === active;
    cv.hidden = isLive; if (isLive) continue;
    const v = V(f.cur); if (!v) continue;
    const W = Math.max(1, body.clientWidth), H = Math.max(1, body.clientHeight), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = getComputedStyle(body).getPropertyValue('--ps-canvas') || '#282828'; g.fillRect(0, 0, W, H);
    const src = snapFor(v); if (!src) continue;
    const dw = src.docW || src.width, dh = src.docH || src.height;
    const s = v.v || { fit: true };
    const z = s.fit ? Math.min((W - 48) / dw, (H - 48) / dh, s.cap || 2) : s.zoom;
    const px = s.fit ? 0 : (s.panX || 0), py = s.fit ? 0 : (s.panY || 0);
    g.save(); g.translate(W / 2 + px, H / 2 + py); g.rotate((s.angle || 0) * Math.PI / 180); if (s.flip) g.scale(-1, 1);
    const w = dw * z, h = dh * z;
    
    g.fillStyle = '#fff'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#ccc'; const c = 8;
    g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.clip();
    for (let y = 0; y * c < h; y++) for (let x = (y & 1); x * c < w; x += 2) g.fillRect(-w / 2 + x * c, -h / 2 + y * c, c, c);
    g.imageSmoothingQuality = 'high'; g.drawImage(src, -w / 2, -h / 2, w, h);
    g.restore();
  }
}


function matchViews(what) {
  ensure(); const g = ctx.getView();
  
  const c = ctx.viewCenterDoc(), ds = ctx.docSize();
  const fx = c && ds.w ? c.x / ds.w : .5, fy = c && ds.h ? c.y / ds.h : .5;
  for (const v of views) {
    if (v.id === active) continue;
    const s = { ...(v.v || g) };
    if (what.zoom) { s.zoom = g.zoom; s.fit = false; s.cap = g.cap; }
    if (what.loc) {
      if (s.fit) { s.zoom = docZoomGuess(v) || g.zoom; s.fit = false; }
      const d = docs.get(v.uid), sn = d && (d.snap || (v.uid === activeUid() ? ctx.snapshot(64) : null));
      const dw = sn ? (sn.docW || sn.width) : ds.w, dh = sn ? (sn.docH || sn.height) : ds.h;
      s.panX = -(fx - .5) * dw * s.zoom; s.panY = -(fy - .5) * dh * s.zoom;
    }
    if (what.rot) s.angle = g.angle;
    v.v = s;
  }
  renderTabs(); renderFrames();
}

let gest = null;
function onGestureDown(e) {
  if (!ctx || !ctx.hasDoc() || views.length < 2 && !(opts.resizeWin)) { gest = null; return; }
  const t = ctx.tool();
  if (!(t === 'zoom' || t === 'hand' || t === 'rotateView' || ctx.spaceDown())) { gest = null; return; }
  if (e.target && e.target.closest && e.target.closest('.dframe-snap, .doctab, .menu-pop')) { gest = null; return; }
  gest = { tool: ctx.spaceDown() && t !== 'zoom' ? 'hand' : t, v0: ctx.getView() };
}
function onGestureUp() {
  const G = gest; gest = null; if (!G) return;
  setTimeout(() => {
    const v1 = ctx.getView(), v0 = G.v0;
    let touched = false;
    for (const v of views) {
      if (v.id === active) continue;
      const s = { ...(v.v || v1) };
      if (G.tool === 'zoom' && opts.zoomAll && v1.zoom !== v0.zoom) { const base = s.fit ? (docZoomGuess(v) || s.zoom) : s.zoom; s.zoom = Math.max(0.01, Math.min(32, base * v1.zoom / v0.zoom)); s.fit = false; touched = true; }
      if (G.tool === 'hand' && opts.scrollAll && (v1.panX !== v0.panX || v1.panY !== v0.panY)) { s.panX = (s.fit ? 0 : s.panX || 0) + v1.panX - v0.panX; s.panY = (s.fit ? 0 : s.panY || 0) + v1.panY - v0.panY; if (s.fit) s.zoom = docZoomGuess(v) || s.zoom; s.fit = false; touched = true; }
      if (G.tool === 'rotateView' && opts.rotateAll && v1.angle !== v0.angle) { s.angle = ((s.angle || 0) + v1.angle - v0.angle + 540) % 360 - 180; touched = true; }
      if (touched) v.v = s;
    }
    if (G.tool === 'zoom' && opts.resizeWin && v1.zoom !== v0.zoom) fitFloatingToImage();
    if (touched) { renderTabs(); renderFrames(); }
  }, 0);
}

function docZoomGuess(v) {
  const f = frameOf(v.id); const host = $('#docFrames');
  const el = f && host && host.querySelector(`.dframe[data-frame="${f.id}"] .dframe-body`);
  const d = docs.get(v.uid); const snap = d && (d.snap || (v.uid === activeUid() ? liveSnap : null));
  const W = el ? el.clientWidth : ($('#viewport') || {}).clientWidth || 800, H = el ? el.clientHeight : ($('#viewport') || {}).clientHeight || 600;
  if (!snap) return null;
  return Math.min((W - 48) / (snap.docW || snap.width), (H - 48) / (snap.docH || snap.height), (v.v && v.v.cap) || 2);
}

function fitFloatingToImage() {
  const f = frameOf(active); if (!f || !f.float) return;
  const st = $('#stage'), bar = 24; if (!st) return;
  const A = area();
  const w = Math.min(A.w, Math.round(st.offsetWidth + 48)), h = Math.min(A.h, Math.round(st.offsetHeight + 48 + bar));
  f.rect.w = w; f.rect.h = h; layoutRects(); kickResize();
}



function blockSpan(layers, head) {
  const L = layers[head]; if (!L || !(L.groupType === 1 || L.groupType === 2)) return [head, head];
  let depth = 0;
  for (let i = head; i >= 0; i--) {
    const g = layers[i].groupType;
    if (g === 1 || g === 2) depth++;
    else if (g === 3) { depth--; if (depth === 0) return [i, head]; }
  }
  return [head, head];
}
function isForeignClip(c) { ensure(); return !!(c && c.docUid != null && c.docUid !== activeUid()); }

async function pasteForeignLayers(c, pmode = 'paste', o = {}) {
  if (!c || !ctx.hasDoc()) return false;
  const src = c.buf;
  let S; try { S = parsePsdFull(src); } catch { ctx.err('拷贝的图层读不出来了'); return false; }
  const spans = c.ids.map(h => blockSpan(S.layers, h));
  const ids = [...new Set(spans.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)))].sort((a, b) => a - b);
  if (!ids.length) return false;
  const same = c.docW && ctx.docSize().w === c.docW && ctx.docSize().h === c.docH;
  let why = null;
  const { transplantCheck, transplantLayers } = await TP();
  const ok = await ctx.structural(o.label || '粘贴', async (buf, info) => {
    why = transplantCheck(buf, src); if (why) return null;
    const at = info.selBuilt >= 0 ? info.selBuilt + 1 : ctx.layerCount();
    const r = transplantLayers(buf, src, ids, at);
    const map = new Map(ids.map((s, k) => [s, r.from + k]));
    const heads = c.ids.map(h => map.get(h)).filter(i => i != null);
    return { buffer: r.buffer, after: () => {
      const all = ids.map(s => map.get(s));
      let dx = 0, dy = 0;
      if (pmode !== 'inPlace' && (o.at || !same)) {
        const bb = ctx.layersBBox(all), at2 = o.at || ctx.viewCenterDoc();
        if (bb && at2) { dx = Math.round(at2.x - (bb.x + bb.w / 2)); dy = Math.round(at2.y - (bb.y + bb.h / 2)); }
      }
      ctx.shiftLayers(all, dx, dy);
      ctx.selectLayers(heads);
      if (o.rename && heads.length === 1) ctx.renameLayer(heads[0], o.rename);
    } };
  });
  if (!ok && why) { ctx.err(`没法按图层粘贴到这份文档：${why}。可以先在源文档里做一个选区，用 ⌘C 按像素拷贝再粘贴。`); return false; }
  if (ok) { const n = c.names || []; const msg = `已粘贴${c.ids.length > 1 ? ` ${c.ids.length} 个图层` : `图层「${n[0] || ''}」`}（来自另一份文档）`; ctx.notice(msg); ctx.status(msg); }
  return ok;
}

async function takeLayers() {
  const oldC = ctx.layerClip(), oldK = ctx.lastClipKind();
  if (!ctx.copyLayers()) { ctx.setLayerClip(oldC, oldK); return null; }
  const c = ctx.layerClip();
  ctx.setLayerClip(oldC, oldK);
  try { await ctx.freezeClip(c); } catch {}
  return c;
}
async function copyLayersTo(viewId, o = {}) {
  const tv = V(viewId); if (!tv || tv.uid === activeUid()) return false;
  const c = await takeLayers(); if (!c) { ctx.status('这几层现在拷不过去（刚复制还没落地的层先等一下）'); return false; }
  if (!await activate(viewId)) return false;
  let at = null;
  if (o.client) { try { at = ctx.clientToDoc(o.client.x, o.client.y); } catch {} }
  return pasteForeignLayers(c, o.shift ? 'inPlace' : 'paste', { at: o.shift ? null : at, label: '复制图层', rename: o.rename });
}

let dropHot = null;
function dropTargetAt(x, y) {
  const els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
  for (const el of els) {
    const tab = el.closest && el.closest('.doctab[data-view]');
    if (tab) { const v = V(+tab.dataset.view); if (v && v.uid !== activeUid()) return { el: tab, view: v.id, tab: true }; return null; }
    const fr = el.closest && el.closest('.dframe[data-frame]');
    if (fr) { const f = frames.find(q => String(q.id) === fr.dataset.frame); const v = f && V(f.cur); if (v && v.uid !== activeUid()) return { el: fr, view: v.id, tab: false }; return null; }
  }
  return null;
}
function setDropHot(t) { if (dropHot && (!t || dropHot.el !== t.el)) dropHot.el.classList.remove('dt-drop'); dropHot = t; if (t) t.el.classList.add('dt-drop'); }
function onMoveDragMove(e) {
  if (!ctx || views.length < 2 || !ctx.moveDragging()) { if (dropHot) setDropHot(null); return; }
  setDropHot(dropTargetAt(e.clientX, e.clientY));
}
function onMoveDragUp(e) {
  const t = dropHot; setDropHot(null);
  if (!t || !ctx.moveDragging()) return;
  e.stopImmediatePropagation(); e.preventDefault();
  ctx.cancelMoveDrag();                                    
  copyLayersTo(t.view, { shift: e.shiftKey, client: t.tab ? null : { x: e.clientX, y: e.clientY } });
}


async function duplicateImage() {
  ensure(); if (!ctx.hasDoc()) return false;
  const base = (ctx.docName() || '未标题').replace(/\.[^.]+$/, '');
  const multi = ctx.layerCount() > 1;
  const r = await formDialog('复制图像', [
    { key: 'name', label: '为：', type: 'text', value: base + ' 拷贝' },
    ...(multi ? [{ key: 'merged', label: '仅复制合并的图层', type: 'check', value: false }] : []),
  ], { okText: '确定' });
  if (!r) return false;
  if (!await ctx.settle()) return false;
  const nm = (String(r.name || '').trim() || base + ' 拷贝') + '.psd';
  let buf;
  try {
    if (r.merged) {
      const { w, h } = ctx.docSize(), px = ctx.composite();
      let opaque = true; for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { opaque = false; break; }
      buf = await ctx.psdFromPixels(px, w, h, opaque ? '背景' : '图层 0', opaque ? 'white' : 'transparent');
    } else buf = await ctx.buildBytes(false);
  } catch (e) { ctx.err('复制图像没能完成：' + (e && e.message || e)); return false; }
  if (!buf) return false;
  return openBuffer(buf, nm, '已复制为新文档「' + nm + '」');
}
async function openBuffer(buf, name, msg) {
  if (ArrayBuffer.isView(buf)) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tk = await beginOpen(); if (!tk) return false;
  try { await ctx.loadBuffer(buf, name); }
  catch (e) { abortOpen(tk); ctx.err('打开失败：' + (e && e.message || e)); return false; }
  endOpen(tk);
  if (msg) ctx.status(msg);
  return true;
}
async function duplicateLayerDialog() {
  ensure(); if (!ctx.hasLayer()) return false;
  const i = ctx.selectedLayer(), nm = ctx.layerName(i);
  const cur = activeUid();
  const others = [...docs.values()].filter(d => d.uid !== cur);
  const r = await formDialog('复制图层', [
    { key: 'name', label: '复制：' + nm + '  为：', type: 'text', value: nm + ' 拷贝' },
    { type: 'note', label: '目标' },
    { key: 'target', label: '文档：', type: 'select', value: String(cur), options: [[String(cur), ctx.docName()], ...others.map(d => [String(d.uid), d.name]), ['new', '新建']] },
    { key: 'newName', label: '名称：', type: 'text', value: '未标题-1', showIf: v => v.target === 'new' },
  ]);
  if (!r) return false;
  const name = String(r.name || '').trim() || nm + ' 拷贝';
  if (r.target === String(cur)) return ctx.duplicateHere(name);
  if (r.target === 'new') {
    const c = await takeLayers(); if (!c) return false;
    const { w, h } = ctx.docSize();
    try {
      const { transplantCheck, transplantLayers } = await TP();
      let buf = await ctx.psdFromPixels(new Uint8Array(w * h * 4), w, h, '图层 0', 'transparent');
      const why = transplantCheck(buf, c.buf); if (why) { ctx.err('没法复制到新文档：' + why); return false; }
      const S = parsePsdFull(c.buf);
      const ids = [...new Set(c.ids.flatMap(hd => { const [a, b] = blockSpan(S.layers, hd); return Array.from({ length: b - a + 1 }, (_, k) => a + k); }))].sort((a, b) => a - b);
      buf = transplantLayers(buf, c.buf, ids, 1).buffer;
      buf = ctx.applyEdits(buf, [{ op: 'deleteLayer', index: 0 }]).buffer;
      if (ids.length === 1) buf = ctx.applyEdits(buf, [{ op: 'setLayerProps', index: 0, name }]).buffer;
      return openBuffer(buf, (String(r.newName || '').trim() || '未标题-1') + '.psd', '已复制图层到新文档');
    } catch (e) { ctx.err('复制图层到新文档没能完成：' + (e && e.message || e)); return false; }
  }
  const tv = views.find(v => String(v.uid) === r.target);
  if (!tv) return false;
  return copyLayersTo(tv.id, { rename: name });
}
let soInput = null;
function openAsSmartObject() {
  if (!soInput) {
    soInput = document.createElement('input'); soInput.type = 'file'; soInput.accept = '.psd,.psb,image/*'; soInput.hidden = true;
    document.body.append(soInput);
    soInput.addEventListener('change', async () => { const f = soInput.files && soInput.files[0]; soInput.value = ''; if (f) await openFileAsSmartObject(f); });
  }
  soInput.click();
}

async function openFileAsSmartObject(file) {
  if (!ctx) return false;
  if (!await ctx.ensureEdit('打开为智能对象')) return false;
  const base = (file.name || '智能对象').replace(/\.[^.]+$/, '');
  let rgba, w, h, embedded = null;
  try {
    if (ctx.isImageFile(file)) {
      const im = await ctx.decodeImage(file);
      w = Math.max(1, Math.round(im.width)); h = Math.max(1, Math.round(im.height));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(im, 0, 0, w, h);
      rgba = new Uint8Array(g.getImageData(0, 0, w, h).data.buffer);
    } else {
      const ab = await file.arrayBuffer();
      const u = new Uint8Array(ab);
      if (!(u[0] === 0x38 && u[1] === 0x42 && u[2] === 0x50 && u[3] === 0x53)) throw new Error('不是 PSD / PSB 文件');
      
      let comp = null;
      try { const { decodeCompositeImage } = await import('../../core/psd-image.js'); const ci = decodeCompositeImage(ab.slice(0)); const px = ci.toRGBA(); if (px && px.length === ci.width * ci.height * 4) comp = { data: px, width: ci.width, height: ci.height }; } catch {}
      if (!comp) comp = await ctx.psdComposite(ab.slice(0));
      w = comp.width; h = comp.height; rgba = new Uint8Array(comp.data.buffer, comp.data.byteOffset, comp.data.length);
      embedded = u;
    }
    let buf = await ctx.psdFromPixels(rgba, w, h, base, 'transparent');
    buf = ctx.applyEdits(buf, [{ op: 'convertToSmartObject', index: 0, source: { data: rgba, width: w, height: h },
      name: embedded ? file.name : base + '.psd', resolution: 72, ...(embedded ? { embedded } : {}) }]).buffer;
    return openBuffer(buf, base + '.psd', `已打开为智能对象（${w} × ${h}，双击图层缩览图进入编辑）`);
  } catch (e) { ctx.err('打开为智能对象没能完成：' + (e && e.message || e)); return false; }
}
async function newWindow() {
  ensure(); const cv = activeView(); if (!cv) return false;
  cv.v = ctx.getView();
  const v = { id: ++vseq, uid: cv.uid, v: { ...cv.v } };
  views.splice(views.indexOf(cv) + 1, 0, v);
  const fr = frameOf(cv.id);
  if (fr && !fr.float) { fr.views.splice(fr.views.indexOf(cv.id) + 1, 0, v.id); fr.cur = v.id; }
  else if (mode !== 'tabs') { const n = frames.length; frames.push({ id: ++fseq, views: [v.id], cur: v.id, float: true, rect: { x: 30 + n * 24, y: 20 + n * 24, ...floatingSize(v.id) } }); }
  await activate(v.id);
  renderTabs(); renderFrames();
  return true;
}


function menuDocs() {
  ensure();
  return views.map(v => ({ id: v.id, label: shortTitle(v) + (v.id === active ? ' @ ' + fmtZoom(ctx.getView().zoom) : (v.v ? ' @ ' + fmtZoom(v.v.zoom) : '')), active: v.id === active }));
}
const CSS = `
#docFrames { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--ps-bg-2, #1e1e1e); }
.docarea.multiframe #docTabs > .doctab { display: none !important; }
.docarea.multiframe:not(.all-docs-floating) #docTabs { display: none; }
.dframe { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; background: var(--ps-canvas, #282828); border: 1px solid var(--ps-line, #111); overflow: hidden; }
.dframe.float { z-index: 20; box-shadow: 0 8px 28px rgba(0,0,0,.55); border-color: var(--ps-line-2, #444); }
.dframe-bar { flex: none; height: 24px; display: flex; align-items: stretch; background: var(--ps-bg-2, #2b2b2b); border-bottom: 1px solid var(--ps-line, #111); overflow: hidden; }
.dframe.float .dframe-bar { cursor: move; }
.dframe-bar .doctab { max-width: 260px; }
.dframe:not(.active) .dframe-bar .doctab.active { background: var(--ps-bg-3, #333); color: var(--ps-text, #ddd); }
.dframe-body { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.dframe-body > .viewport { position: absolute !important; inset: 0; }
.dframe-snap { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.dframe-snap[hidden] { display: none; }
.dframe-status { flex: none; height: 20px; display: flex; align-items: center; gap: 12px; padding: 0 6px; box-sizing: border-box; overflow: hidden; white-space: nowrap; background: var(--ps-bg, #323232); color: var(--ps-muted, #aaa); border-top: 1px solid var(--ps-line, #111); font-size: 11px; }
.dframe-status[hidden] { display: none; }
.app.ps.screen-full .dframe-status, .app.ps.screen-full-menu .dframe-status { display: none; }
.dframe-zoom { width: 52px; height: 18px; min-height: 0; padding: 0; color: inherit; background: transparent; border: 0; font: inherit; }
.dframe-divider { position: absolute; z-index: 10; background: var(--ps-bg-2, #282828); cursor: col-resize; touch-action: none; }
.dframe-divider.horizontal { cursor: row-resize; }
.dframe-divider:hover, .dframe-divider:focus-visible { background: #555; }
.dt-split-preview { position: fixed; z-index: 9998; pointer-events: none; background: rgba(45,140,235,.14); border: 2px solid #2d8ceb; box-sizing: border-box; }
.dframe-grip { position: absolute; z-index: 8; right: 0; bottom: 0; width: 12px; height: 12px; cursor: nwse-resize; display: none; }
.dframe.float .dframe-grip { display: block; }
.dframe-resize { display: none; position: absolute; z-index: 8; touch-action: none; }
.dframe.float .dframe-resize { display: block; }
.dframe-resize-n { left: 7px; right: 7px; top: 0; height: 4px; cursor: ns-resize; }
.dframe-resize-s { left: 7px; right: 12px; bottom: 0; height: 4px; cursor: ns-resize; }
.dframe-resize-e { top: 7px; bottom: 12px; right: 0; width: 4px; cursor: ew-resize; }
.dframe-resize-w { top: 7px; bottom: 7px; left: 0; width: 4px; cursor: ew-resize; }
.dframe-resize-nw, .dframe-resize-ne, .dframe-resize-sw { width: 7px; height: 7px; }
.dframe-resize-nw { top: 0; left: 0; cursor: nwse-resize; }
.dframe-resize-ne { top: 0; right: 0; cursor: nesw-resize; }
.dframe-resize-sw { bottom: 0; left: 0; cursor: nesw-resize; }
.doctab.dt-drop, .dframe.dt-drop { box-shadow: inset 0 0 0 2px #2d8ceb; }
`;
export function init(c) {
  ctx = c;
  if (!document.getElementById('docsCss')) { const st = document.createElement('style'); st.id = 'docsCss'; st.textContent = CSS; document.head.append(st); }
  const hasDoc = () => !!ctx.hasDoc();
  const reg = (id, run, enabled, extra = {}) => actions.register(id, { run: (...a) => { run(...a); }, enabled, ...extra });
  const multi = () => hasDoc() && views.length > 1;
  reg('window.document', id => { activate(+id); }, () => true, { checked: () => true });
  reg('window.nextDocument', () => cycle(1), multi);
  reg('window.prevDocument', () => cycle(-1), multi);
  for (const [k, count] of Object.entries(GRID_CELLS)) reg('window.arrange.' + k, () => arrangeGrid(k), () => hasDoc() && views.length >= (Number.isFinite(count) ? count : 2), { why: () => `需要至少 ${Number.isFinite(count) ? count : 2} 个文档窗口` });
  reg('window.arrange.consolidate', () => consolidate(), () => hasDoc() && mode !== 'tabs', { why: () => '所有文档已经合并在选项卡里了' });
  reg('window.arrange.cascade', () => arrangeFloat('cascade'), hasDoc);
  reg('window.arrange.tile', () => arrangeFloat('tile'), hasDoc);
  reg('window.arrange.float', () => arrangeFloat('float'), () => hasDoc() && !(frameOf(active) && frameOf(active).float && frameOf(active).views.length === 1), { why: () => '当前文档已经在浮动窗口里了' });
  reg('window.arrange.floatAll', () => arrangeFloat('floatAll'), hasDoc);
  reg('window.arrange.matchZoom', () => matchViews({ zoom: true }), multi);
  reg('window.arrange.matchLocation', () => matchViews({ loc: true }), multi);
  reg('window.arrange.matchRotation', () => matchViews({ rot: true }), multi);
  reg('window.arrange.matchAll', () => matchViews({ zoom: true, loc: true, rot: true }), multi);
  reg('window.arrange.newWindow', () => { newWindow(); }, hasDoc);
  reg('file.openAsSmartObject', () => openAsSmartObject(), () => true);
  for (const [spec, id] of [['Ctrl+Tab', 'window.nextDocument'], ['Ctrl+Shift+Tab', 'window.prevDocument'], ['Mod+`', 'window.nextDocument'], ['Mod+Shift+`', 'window.prevDocument']]) shortcuts.bind(spec, id);
  
  const cb = (id, key) => { const el = document.getElementById(id); if (el) { el.disabled = false; el.checked = opts[key]; el.addEventListener('change', () => { opts[key] = el.checked; }); } };
  cb('zmAll', 'zoomAll'); cb('hdAll', 'scrollAll'); cb('zmResize', 'resizeWin');
  if (!document.getElementById('docsDragCss')) { const st = document.createElement('style'); st.id = 'docsDragCss'; st.textContent = DRAG_CSS; document.head.append(st); }
  addEventListener('pointerdown', onTabDown, true);
  addEventListener('pointermove', onTabMove, true);
  addEventListener('pointerup', onTabUp, true);
  addEventListener('pointercancel', cancelTabDrag, true);
  addEventListener('keydown', cancelTabDrag, true);
  addEventListener('pointerdown', onGestureDown, true);
  addEventListener('pointerup', onGestureUp, true);
  addEventListener('pointermove', onMoveDragMove, true);
  addEventListener('pointerup', onMoveDragUp, true);
  
  setInterval(() => {
    if (!frames.length || document.hidden) return;
    const au = activeUid();
    if (frames.some(f => f.cur !== active && V(f.cur) && V(f.cur).uid === au)) { liveSnapAt = 0; drawSnaps(); }
    const host = $('#docFrames'); const el = host && host.querySelector(`.doctab[data-view="${active}"] .doctab-title`);
    if (el && el.textContent !== liveTitle()) el.textContent = liveTitle();
  }, 700);
}

export const DOCS = {
  init, opts, isDirty, markClean, renameDocument, beginOpen, endOpen, abortOpen, activate, close: () => closeView(), closeView, closeAll, closeOthers, cycle,
  duplicateImage, duplicateLayerDialog, openFileAsSmartObject, newWindow, copyLayersTo, pasteForeignLayers, isForeignClip,
  arrangeGrid, arrangeFloat, consolidate: () => consolidate(), matchViews, menuDocs, floatView, moveTab: (id, index) => dropTabIntoBar(id, { frame: null }, index),
  count: () => { ensure(); return docs.size; },
  openBuffer,                                     
  beginEmbedded, endEmbedded, embeddedParent, updateEmbeddedParent, endEmbeddedClose,
  refreshTabs: () => {
    ensure();
    const signature = JSON.stringify([active, views.map(v => [v.id, viewTitle(v)])]);
    if (signature === tabSignature) return;
    tabSignature = signature; renderTabs(); renderFrames();
  },
  
  buffers: () => { ensure(); const au = activeUid(); return [...docs.values()].map(d => ({ uid: d.uid, name: d.name, active: d.uid === au, buf: d.uid === au ? null : (d.state && d.state.origBuffer) || null })); },
  activeUid: () => { ensure(); return activeUid(); },
  
  
  openingUid: () => pending?.uid ?? activeUid(),
  list: () => { ensure(); return views.map(v => { const s = v.id === active ? ctx.getView() : v.v; return { view: v.id, uid: v.uid, name: (docs.get(v.uid) || {}).name, active: v.id === active, view_state: s && { ...s } }; }); },
  get layout() { return { mode, gridKey, frames: frames.map(f => ({ ...f, views: f.views.slice(), rect: f.rect && { ...f.rect } })) }; },
};
export default DOCS;
