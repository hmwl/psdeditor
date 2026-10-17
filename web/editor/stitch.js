













import { actions } from './actions.js';

let C = null;
const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stem = n => String(n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const isImg = f => (f.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i.test(f.name || '');
const isDoc = f => isImg(f) || /\.ps[db]$/i.test(f.name || '');
const AL = () => import('../../core/align.js');
const BL = () => import('../../core/blend-multiband.js');
const HD = () => import('../../core/hdr.js');
const EXIF = () => import('../../core/exif.js');   
const ED = () => import('./lazy-edit.js');
const say = t => { try { C.status(t); } catch {} };

const step = async t => { say(t); await sleep(30); };


function pickFiles(accept = '.psd,.psb,image/*') {
  return new Promise(res => {
    const inp = mk('input', { type: 'file', accept, multiple: true });
    inp.onchange = () => res([...(inp.files || [])].filter(isDoc));
    inp.addEventListener('cancel', () => res([]));
    inp.click();
  });
}

async function getFiles() {
  const hook = window.__psd_editorStitch;
  if (hook && Array.isArray(hook.files) && hook.files.length) { const f = hook.files; hook.files = null; return f; }
  return pickFiles();
}

async function decodeFile(f) {
  if (/\.ps[db]$/i.test(f.name || '')) {
    const E = await ED();
    const c = E.decodeCompositeImage(new Uint8Array(await f.arrayBuffer()), null, null, { keepRaw: false });
    const r = c.toRGBA();
    return { name: stem(f.name), rgba: new Uint8ClampedArray(r.data || r), width: c.width, height: c.height };
  }
  const bmp = await C.decodeImage(f);
  const cv = mk('canvas', { width: bmp.width, height: bmp.height });
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  return { name: stem(f.name), rgba: g.getImageData(0, 0, cv.width, cv.height).data, width: cv.width, height: cv.height };
}
async function decodeAll(files, what) {
  const out = [];
  for (let i = 0; i < files.length; i++) {
    await step(`${what}：读取 ${i + 1} / ${files.length}　${files[i].name}`);
    try { out.push(await decodeFile(files[i])); } catch (e) { throw new Error(`「${files[i].name}」读不出来：${e && e.message || e}`); }
  }
  return out;
}







async function buildLayeredPsd(W, H, layers, merged) {
  const E = await ED();
  const { createPsd } = await import('../../core/psd-new.js');
  let buf = createPsd({ width: W, height: H, background: 'transparent', name: layers[0].name, resolution: C.resolution() });
  const u8 = a => a instanceof Uint8Array ? a : new Uint8Array(a.buffer, a.byteOffset, a.length);
  const ops = [];
  layers.forEach((L, k) => {
    if (k > 0) ops.push({ op: 'createLayer', at: k, name: L.name });
    const last = k === layers.length - 1;
    ops.push({ op: 'replaceLayerPixels', index: k, rgba: { data: u8(L.rgba), width: L.w, height: L.h },
      bounds: { left: L.x, top: L.y, right: L.x + L.w, bottom: L.y + L.h },
      ...(last && merged ? { merged: { data: u8(merged) } } : {}) });
    if (L.mask) ops.push({ op: 'addLayerMask', index: k, gray: { data: L.mask, width: L.w, height: L.h }, bounds: { left: L.x, top: L.y, right: L.x + L.w, bottom: L.y + L.h } });
  });
  
  buf = E.applyEdits(buf, ops).buffer;
  return buf;
}

function compositeOf(W, H, layers) {
  const out = new Float32Array(W * H * 4);
  for (const L of layers) {
    for (let y = 0; y < L.h; y++) { const Y = L.y + y; if (Y < 0 || Y >= H) continue;
      for (let x = 0; x < L.w; x++) { const X = L.x + x; if (X < 0 || X >= W) continue;
        const s = (y * L.w + x) * 4; let a = L.rgba[s + 3] / 255; if (L.mask) a *= L.mask[y * L.w + x] / 255; if (!a) continue;
        const d = (Y * W + X) * 4, ba = out[d + 3], oa = a + ba * (1 - a);
        for (let c = 0; c < 3; c++) out[d + c] = (L.rgba[s + c] * a + out[d + c] * ba * (1 - a)) / oa;
        out[d + 3] = oa; } }
  }
  const r = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { r[i * 4] = out[i * 4]; r[i * 4 + 1] = out[i * 4 + 1]; r[i * 4 + 2] = out[i * 4 + 2]; r[i * 4 + 3] = Math.round(out[i * 4 + 3] * 255); }
  return r;
}







async function alignAndRender(imgs, o) {
  const A = await AL();
  const res = A.alignImages(imgs, { projection: o.projection || 'auto', vignette: !!o.vignette, distortion: !!o.distortion, gains: !!o.gains, reference: o.reference });
  if (!res.ok) return { ok: false, message: res.message };
  
  let dx = -res.bbox.x0, dy = -res.bbox.y0;
  if (o.refCenter) {
    const ri = res.reference, m = A.makeMapper(res.maps[ri]), im = imgs[ri];
    const c = m.fwd((im.width - 1) / 2, (im.height - 1) / 2), t = o.refCenter(ri);
    dx = t[0] - c[0]; dy = t[1] - c[1];
  }
  const rects = [];
  const lim = o.clip;          
  for (let k = 0; k < imgs.length; k++) {
    const map = res.maps[k];
    if (!map) { rects.push(null); continue; }
    const m = A.makeMapper(map), im = imgs[k];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const N = 12;
    for (let t = 0; t <= N; t++) for (const [x, y] of [[t / N * (im.width - 1), 0], [t / N * (im.width - 1), im.height - 1], [0, t / N * (im.height - 1)], [im.width - 1, t / N * (im.height - 1)]]) {
      const p = m.fwd(x, y); if (!p.every(Number.isFinite)) continue;
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    let r = { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1) + 1, y1: Math.ceil(y1) + 1 };
    if (lim) r = { x0: Math.max(r.x0, Math.floor(lim.x0 - dx)), y0: Math.max(r.y0, Math.floor(lim.y0 - dy)), x1: Math.min(r.x1, Math.ceil(lim.x1 - dx)), y1: Math.min(r.y1, Math.ceil(lim.y1 - dy)) };
    if (r.x1 <= r.x0 || r.y1 <= r.y0) { rects.push(null); continue; }
    
    const fx = dx - Math.round(dx), fy = dy - Math.round(dy);
    const shifted = fx || fy ? shiftMap(map, fx, fy) : map;
    const rgba = A.renderWarped(im, shifted, r, { gain: res.gains[k], vignette: res.vignette });
    rects.push({ x: r.x0 + Math.round(dx), y: r.y0 + Math.round(dy), w: r.x1 - r.x0, h: r.y1 - r.y0, rgba });
  }
  return { ok: true, rects, res, offset: [dx, dy] };
}

function shiftMap(map, fx, fy) {
  const T = [1, 0, fx, 0, 1, fy, 0, 0, 1];
  const mul = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
  return map.kind === 'h' ? { ...map, H: mul(T, map.H) } : { ...map, M: mul(T, map.M) };
}







async function blendRects(rects, method, seamless) {
  const B = await BL();
  let ox = Infinity, oy = Infinity, ex = -Infinity, ey = -Infinity;
  for (const r of rects) { ox = Math.min(ox, r.x); oy = Math.min(oy, r.y); ex = Math.max(ex, r.x + r.w); ey = Math.max(ey, r.y + r.h); }
  const W = ex - ox, H = ey - oy;
  const items = rects.map(r => ({ x0: r.x - ox, y0: r.y - oy, w: r.w, h: r.h, rgba: r.rgba }));
  await step(method === 'stack' ? '自动混合：比较每层的清晰度…' : '自动混合：寻找最佳接缝…');
  const labels = method === 'stack' ? B.stackLabels(items, W, H) : B.panoramaLabels(items, W, H);
  let blended = null;
  if (seamless) { await step('自动混合：多频段融合（无缝色调和颜色）…'); blended = B.multibandBlend(items, labels, W, H, method === 'stack' ? { levels: 4 } : {}); }
  const parts = B.splitToLayers(items, labels, blended, W, H);
  const comp = blended || B.labelComposite(items, labels, W, H);
  return { labels, blended: comp, W, H, ox, oy, parts };
}

async function fillTransparent(comp, W, H) {
  const { patchMatchInpaint } = await import('../../core/content-aware.js');   
  const mask = new Uint8Array(W * H); let n = 0;
  for (let i = 0; i < W * H; i++) if (comp[i * 4 + 3] < 250) { mask[i] = 255; n++; }
  if (!n || n === W * H) return null;
  
  const s = Math.min(1, 640 / Math.max(W, H));
  if (s >= 1) {
    const flat = Uint8ClampedArray.from(comp); for (let i = 0; i < W * H; i++) flat[i * 4 + 3] = 255;
    const r = patchMatchInpaint(flat, W, H, mask, { seed: 1 });
    const out = Uint8ClampedArray.from(comp); for (let i = 0; i < W * H; i++) if (mask[i]) { const a = comp[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[i * 4 + c] = comp[i * 4 + c] * a + r[i * 4 + c] * (1 - a); out[i * 4 + 3] = 255; }
    return out;
  }
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const cv = mk('canvas', { width: W, height: H }); cv.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(comp), W, H), 0, 0);
  const sm = mk('canvas', { width: w, height: h }); const g = sm.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, w, h);
  const small = g.getImageData(0, 0, w, h).data;
  const m2 = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) { if (small[i * 4 + 3] < 250) m2[i] = 255; small[i * 4 + 3] = 255; }
  const r = patchMatchInpaint(small, w, h, m2, { seed: 1 });
  g.putImageData(new ImageData(r, w, h), 0, 0);
  const big = mk('canvas', { width: W, height: H }); const bg = big.getContext('2d', { willReadFrequently: true }); bg.imageSmoothingQuality = 'high'; bg.drawImage(sm, 0, 0, W, H);
  const up = bg.getImageData(0, 0, W, H).data;
  const out = Uint8ClampedArray.from(comp);
  for (let i = 0; i < W * H; i++) if (mask[i]) { const a = comp[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[i * 4 + c] = comp[i * 4 + c] * a + up[i * 4 + c] * (1 - a); out[i * 4 + 3] = 255; }
  return out;
}


const PROJ_OPTS = [['auto', '自动'], ['perspective', '透视'], ['collage', '拼贴'], ['cylindrical', '圆柱'], ['spherical', '球面'], ['reposition', '调整位置']];
function targetLayers() {
  const s = C.st();
  const set = new Set(s.selLayers.size ? [...s.selLayers] : s.selLayer >= 0 ? [s.selLayer] : []);
  return [...set].filter(i => s.doc && s.doc.layers[i] && s.layerTree && s.layerTree.flat[i] && s.layerTree.flat[i].groupType == null).sort((a, b) => a - b);
}
function alignWhy() {
  const s = C.st();
  if (!s.doc) return '先打开一个文档';
  if (s.li) return '正在编辑智能对象：先退回文档视图';
  const t = targetLayers();
  if (t.length < 2) return '先在图层面板里选中至少两个要对齐的图层（⇧ / ⌘ 点选）';
  const bad = t.find(i => C.rasterWhy(i));
  if (bad != null) return `「${C.layerName(bad)}」不是像素图层（${C.rasterWhy(bad)}）：先栅格化（PS 同样只对齐像素内容）`;
  return '';
}
async function autoAlignUI(preset) {
  const why = alignWhy(); if (why) { say(why); await C.alertDialog(why, { title: '自动对齐图层' }); return false; }
  const v = preset || await C.formDialog('自动对齐图层', [
    { key: 'projection', label: '投影', type: 'select', value: 'auto', options: PROJ_OPTS },
    { type: 'note', label: '镜头校正' },
    { key: 'vignette', label: '晕影去除', type: 'check', value: false },
    { key: 'distortion', label: '几何扭曲', type: 'check', value: false },
  ]);
  if (!v) return false;
  return runAutoAlign(v);
}
async function runAutoAlign(v) {
  const idxs = targetLayers(), s0 = C.st();
  
  let refPos = idxs.findIndex(i => C.isBackground(i) || C.lockedPosition(i));
  let report = null;
  const ok = await C.structural('自动对齐图层', async (base, { map, applyEdits }) => {
    const { parsePsdRaster } = await import('../../core/app.js');
    const rd = await parsePsdRaster(base.slice ? base.slice(0) : base, { keepPlanes: 'mask' });
    const imgs = idxs.map(i => { const L = rd.layers[map(i)]; return L ? unmasked(L) : null; });
    if (imgs.some(im => !im || !(im.width > 0 && im.height > 0))) { say('自动对齐图层：有图层是空的'); return null; }
    await step('自动对齐图层：寻找特征点并匹配…');
    const r = await alignAndRender(imgs.map(im => ({ rgba: im.rgba, width: im.width, height: im.height })), {
      projection: v.projection, vignette: v.vignette, distortion: v.distortion, gains: !!v.vignette,
      reference: refPos >= 0 ? refPos : undefined,
      refCenter: ri => [imgs[ri].left + (imgs[ri].width - 1) / 2, imgs[ri].top + (imgs[ri].height - 1) / 2],
      clip: { x0: -s0.docW, y0: -s0.docH, x1: s0.docW * 2, y1: s0.docH * 2 },
    });
    if (!r.ok) { await C.alertDialog('无法对齐图层：' + r.message, { title: '自动对齐图层' }); return null; }
    const ri = r.res.reference;
    const ops = [];
    const unaligned = [];
    idxs.forEach((i, k) => {
      const R = r.rects[k];
      if (!R) { unaligned.push(C.layerName(i)); return; }
      if (k === ri && !v.vignette && !v.distortion) return;          
      ops.push({ op: 'replaceLayerPixels', index: map(i), rgba: { data: new Uint8Array(R.rgba.buffer), width: R.w, height: R.h },
        bounds: { left: R.x, top: R.y, right: R.x + R.w, bottom: R.y + R.h } });
    });
    report = { projection: r.res.projection, reference: C.layerName(idxs[ri]), stats: r.res.stats, k1: r.res.k1, unaligned };
    if (!ops.length) return null;
    const buf = applyEdits(base, ops).buffer;
    return { buf, sel: s0.selLayer, sels: idxs };
  });
  if (ok && report) {
    const rms = report.stats.map(t => t.rms).filter(x => x != null);
    say(`自动对齐图层：${PROJ_OPTS.find(p => p[0] === report.projection)[1]}，参考图层「${report.reference}」` + (rms.length ? `，配对点残差 ${Math.max(...rms).toFixed(2)} px` : '') +
      (report.k1 ? `，几何扭曲 k1 = ${report.k1.toFixed(3)}` : '') + (report.unaligned.length ? `；这些图层没能对齐：${report.unaligned.join('、')}` : ''));
  }
  return ok ? report : false;
}

function unmasked(L) {
  const w = L.bounds.right - L.bounds.left, h = L.bounds.bottom - L.bounds.top;
  let rgba = L.rgba;
  if (L.planes && L.planes[0] && L.planes[0].length === w * h && L.planes[1] && L.planes[2]) {
    rgba = new Uint8ClampedArray(w * h * 4);
    const A = L.planes[-1];
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = L.planes[0][i]; rgba[i * 4 + 1] = L.planes[1][i]; rgba[i * 4 + 2] = L.planes[2][i]; rgba[i * 4 + 3] = A ? A[i] : 255; }
  }
  return { rgba, width: w, height: h, left: L.bounds.left, top: L.bounds.top };
}


function blendWhy() {
  const w = alignWhy(); if (w) return w.replace('要对齐的', '要混合的');
  const bg = targetLayers().find(i => C.isBackground(i));
  if (bg != null) return '自动混合不能用于背景图层：先把「背景」转换为普通图层（双击它）';
  return '';
}
async function autoBlendUI(preset) {
  const why = blendWhy(); if (why) { say(why); await C.alertDialog(why, { title: '自动混合图层' }); return false; }
  const v = preset || await C.formDialog('自动混合图层', [
    { key: 'method', label: '混合方法', type: 'select', value: 'panorama', options: [['panorama', '全景图'], ['stack', '堆叠图像']] },
    { key: 'seamless', label: '无缝色调和颜色', type: 'check', value: true },
    { key: 'fill', label: '内容识别填充透明区域', type: 'check', value: false },
  ]);
  if (!v) return false;
  return runAutoBlend(v);
}
async function runAutoBlend(v) {
  const idxs = targetLayers(), s0 = C.st();
  let info = null;
  const ok = await C.structural('自动混合图层', async (base, { map, applyEdits }) => {
    const { parsePsdRaster } = await import('../../core/app.js');
    const rd = await parsePsdRaster(base.slice ? base.slice(0) : base, { keepPlanes: 'mask' });
    const rects = [];
    for (const i of idxs) {
      const L = rd.layers[map(i)]; if (!L) return null;
      const u = unmasked(L); if (!(u.width > 0 && u.height > 0)) continue;
      rects.push({ i, x: u.left, y: u.top, w: u.width, h: u.height, rgba: u.rgba });
    }
    if (rects.length < 2) return null;
    const r = await blendRects(rects, v.method, v.seamless !== false);
    const ops = [];
    rects.forEach((R, k) => {
      const P = r.parts[k], b = map(R.i), bounds = { left: R.x, top: R.y, right: R.x + R.w, bottom: R.y + R.h };
      if (v.seamless !== false) ops.push({ op: 'replaceLayerPixels', index: b, rgba: { data: new Uint8Array(P.pixels.buffer), width: R.w, height: R.h }, bounds });
      const had = rd.layers[b] && rd.layers[b].mask;
      ops.push(had ? { op: 'replaceLayerMask', index: b, gray: P.mask, bounds } : { op: 'addLayerMask', index: b, gray: { data: P.mask, width: R.w, height: R.h }, bounds });
    });
    let buf = applyEdits(base, ops).buffer;
    let sel = s0.selLayer;
    if (v.fill) {
      await step('自动混合：内容识别填充透明区域…');
      
      const W = s0.docW, H = s0.docH, comp = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) { const Y = y - r.oy; if (Y < 0 || Y >= r.H) continue;
        for (let x = 0; x < W; x++) { const X = x - r.ox; if (X < 0 || X >= r.W) continue;
          const s = (Y * r.W + X) * 4, d = (y * W + x) * 4; for (let c = 0; c < 4; c++) comp[d + c] = r.blended[s + c]; } }
      const filled = await fillTransparent(comp, W, H);
      if (filled) {
        const top = Math.max(...idxs.map(i => map(i))) + 1;
        buf = applyEdits(buf, [{ op: 'createLayer', at: top, name: '内容识别填充' },
          { op: 'replaceLayerPixels', index: top, rgba: { data: new Uint8Array(filled.buffer), width: W, height: H }, bounds: { left: 0, top: 0, right: W, bottom: H } }]).buffer;
        sel = top;
      }
    }
    info = { n: rects.length };
    return { buf, sel, sels: v.fill ? null : idxs };
  });
  if (ok && info) say(`自动混合图层：${v.method === 'stack' ? '堆叠图像' : '全景图'}，${info.n} 个图层已写入图层蒙版` + (v.seamless !== false ? '（无缝色调和颜色）' : ''));
  return ok;
}


async function photomergeUI() {
  const v = await C.formDialog('Photomerge', [
    { key: 'projection', label: '版面', type: 'select', value: 'auto', options: PROJ_OPTS },
    { type: 'note', label: '源文件：点「确定」后选择要拼接的照片（两张以上，相邻照片重叠 25%～40%）。' },
    { key: 'blend', label: '混合图像', type: 'check', value: true },
    { key: 'vignette', label: '晕影去除', type: 'check', value: false },
    { key: 'distortion', label: '几何扭曲校正', type: 'check', value: false },
    { key: 'fill', label: '内容识别填充透明区域', type: 'check', value: false },
  ]);
  if (!v) return;
  const files = await getFiles(); if (!files.length) return;
  try { return await runPhotomerge(files, v); } catch (e) { await C.alertDialog('Photomerge 没能完成：' + (e && e.message || e), { title: 'Photomerge' }); }
}
export async function runPhotomerge(files, v = {}) {
  if (files.length < 2) throw new Error('至少要两张图');
  const imgs = await decodeAll(files, 'Photomerge');
  await step('Photomerge：寻找特征点并对齐…');
  const r = await alignAndRender(imgs, { projection: v.projection || 'auto', vignette: !!v.vignette, distortion: !!v.distortion, gains: v.blend !== false });
  if (!r.ok) throw new Error(r.message);
  const keep = r.rects.map((R, k) => R ? { ...R, name: imgs[k].name } : null).filter(Boolean);
  const skipped = imgs.filter((_, k) => !r.rects[k]).map(im => im.name);
  let W = 0, H = 0; for (const R of keep) { W = Math.max(W, R.x + R.w); H = Math.max(H, R.y + R.h); }
  let layers = keep.map(R => ({ name: R.name, rgba: R.rgba, x: R.x, y: R.y, w: R.w, h: R.h }));
  let merged = null;
  if (v.blend !== false) {
    const b = await blendRects(keep, 'panorama', true);
    layers = keep.map((R, k) => ({ name: R.name, rgba: b.parts[k].pixels, x: R.x, y: R.y, w: R.w, h: R.h, mask: b.parts[k].mask }));
    merged = b.blended;   
    if (v.fill) {
      await step('Photomerge：内容识别填充透明区域…');
      const f = await fillTransparent(b.blended, b.W, b.H);
      if (f) { layers.push({ name: '内容识别填充', rgba: f, x: 0, y: 0, w: b.W, h: b.H }); merged = f; }
    }
  }
  if (!merged) merged = compositeOf(W, H, layers);
  await step('Photomerge：生成文档…');
  const buf = await buildLayeredPsd(W, H, layers, merged);
  await C.openPsdBuffer(buf, '未标题_全景图');
  say(`Photomerge：${keep.length} 张照片，版面「${PROJ_OPTS.find(p => p[0] === r.res.projection)[1]}」，画布 ${W}×${H}` + (skipped.length ? `；没能对齐：${skipped.join('、')}` : ''));
  return { W, H, layers: layers.length, projection: r.res.projection, stats: r.res.stats, skipped };
}


async function loadStackUI() {
  const v = await C.formDialog('载入图层', [
    { type: 'note', label: '源文件：点「确定」后选择要载入的文件，每个文件成为一个图层。' },
    { key: 'align', label: '尝试自动对齐源图像', type: 'check', value: false },
    { key: 'smart', label: '载入图层后创建智能对象', type: 'check', value: false },
  ]);
  if (!v) return;
  const files = await getFiles(); if (!files.length) return;
  try { return await runLoadStack(files, v); } catch (e) { await C.alertDialog('载入文件到堆栈没能完成：' + (e && e.message || e), { title: '载入图层' }); }
}
export async function runLoadStack(files, v = {}) {
  const imgs = await decodeAll(files, '载入文件到堆栈');
  let layers, W, H;
  if (v.align && imgs.length > 1) {
    await step('载入文件到堆栈：自动对齐…');
    const r = await alignAndRender(imgs, { projection: 'auto' });
    if (!r.ok) throw new Error(r.message);
    layers = r.rects.map((R, k) => R ? { name: imgs[k].name, rgba: R.rgba, x: R.x, y: R.y, w: R.w, h: R.h } : null).filter(Boolean);
    W = 0; H = 0; for (const L of layers) { W = Math.max(W, L.x + L.w); H = Math.max(H, L.y + L.h); }
  } else {
    
    W = Math.max(...imgs.map(im => im.width)); H = Math.max(...imgs.map(im => im.height));
    layers = imgs.map(im => ({ name: im.name, rgba: im.rgba, x: Math.round((W - im.width) / 2), y: Math.round((H - im.height) / 2), w: im.width, h: im.height }));
  }
  
  layers.reverse();
  const merged = compositeOf(W, H, layers);
  await step('载入文件到堆栈：生成文档…');
  let buf = await buildLayeredPsd(W, H, layers, merged);
  const name = imgs.length === 1 ? imgs[0].name : '未标题-堆栈';
  if (v.smart) {
    
    const E = await ED();
    const { createPsd } = await import('../../core/psd-new.js');
    let outer = createPsd({ width: W, height: H, background: 'transparent', name, resolution: C.resolution() });
    outer = E.applyEdits(outer, [{ op: 'replaceLayerPixels', index: 0, rgba: { data: new Uint8Array(merged.buffer), width: W, height: H }, bounds: { left: 0, top: 0, right: W, bottom: H }, merged: { data: new Uint8Array(merged.buffer) } }]).buffer;
    outer = E.applyEdits(outer, [{ op: 'convertToSmartObject', index: 0, source: { data: new Uint8Array(merged.buffer), width: W, height: H }, resolution: C.resolution(), embedded: new Uint8Array(buf) }]).buffer;
    buf = outer;
  }
  await C.openPsdBuffer(buf, name);
  say(`载入文件到堆栈：${layers.length} 个图层` + (v.align ? '（已自动对齐）' : '') + (v.smart ? '，已转换为智能对象' : ''));
  return { W, H, layers: layers.length };
}


async function statisticsUI() {
  const { STACK_MODES } = await import('../../core/stack-modes.js');
  const v = await C.formDialog('图像统计', [
    { key: 'mode', label: '选择堆栈模式', type: 'select', value: 'median', options: Object.entries(STACK_MODES).filter(([k]) => k !== 'none') },
    { type: 'note', label: '源文件：点「确定」后选择文件。' },
    { key: 'align', label: '尝试自动对齐源图像', type: 'check', value: false },
  ]);
  if (!v) return;
  const files = await getFiles(); if (!files.length) return;
  try { return await runStatistics(files, v); } catch (e) { await C.alertDialog('统计没能完成：' + (e && e.message || e), { title: '图像统计' }); }
}
export async function runStatistics(files, v = {}) {
  const r = await runLoadStack(files, { align: !!v.align, smart: true });
  await sleep(50);
  const id = 'layer.smart.stack.' + (v.mode || 'median');
  C.selectLayer(0);
  if (!actions.enabled(id)) throw new Error('智能对象没有建成，无法套用堆栈模式');
  await actions.run(id);
  await C.settle();
  return { ...r, mode: v.mode || 'median' };
}


async function lensBatchUI() {
  const v = await C.formDialog('镜头校正', [
    { type: 'note', label: '浏览器里没有 Adobe 镜头配置文件库（PS 靠它按 EXIF 自动匹配相机 / 镜头）：这里给同一批照片套一组手动校正参数（同「滤镜 › 镜头校正」的自定选项卡）。' },
    { key: 'distortion', label: '移去扭曲', type: 'number', value: 0, min: -100, max: 100 },
    { key: 'caRed', label: '修复红/青边', type: 'number', value: 0, min: -100, max: 100 },
    { key: 'caBlue', label: '修复蓝/黄边', type: 'number', value: 0, min: -100, max: 100 },
    { key: 'vignette', label: '晕影 数量', type: 'number', value: 0, min: -100, max: 100 },
    { key: 'midpoint', label: '晕影 中点', type: 'number', value: 50, min: 0, max: 100 },
    { key: 'scale', label: '比例', type: 'number', value: 100, min: 50, max: 150, unit: '%' },
    { key: 'edge', label: '边缘', type: 'select', value: 'repeat', options: [['clear', '透明度'], ['repeat', '边缘扩展']] },
    { key: 'format', label: '文件类型', type: 'select', value: 'jpg', options: [['jpg', 'JPEG'], ['png', 'PNG']] },
  ], { okText: '确定' });
  if (!v) return;
  const files = await getFiles(); if (!files.length) return;
  return runLensBatch(files, v);
}
export async function runLensBatch(files, v = {}) {
  const { MORE_FILTERS } = await import('../../core/filters-more.js');
  const f = MORE_FILTERS.lensCorrection;
  const out = [], log = [];
  for (let i = 0; i < files.length; i++) {
    try {
      await step(`镜头校正：${i + 1} / ${files.length}　${files[i].name}`);
      const im = await decodeFile(files[i]);
      const r = f.apply(im.rgba, im.width, im.height, v);
      const cv = mk('canvas', { width: im.width, height: im.height }), g = cv.getContext('2d');
      if (v.format === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); const t = mk('canvas', { width: im.width, height: im.height }); t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r), im.width, im.height), 0, 0); g.drawImage(t, 0, 0); }
      else g.putImageData(new ImageData(new Uint8ClampedArray(r), im.width, im.height), 0, 0);
      const blob = await new Promise(res => cv.toBlob(res, v.format === 'png' ? 'image/png' : 'image/jpeg', 0.92));
      out.push({ name: `${stem(files[i].name)}.${v.format === 'png' ? 'png' : 'jpg'}`, data: new Uint8Array(await blob.arrayBuffer()) });
    } catch (e) { log.push(`${files[i].name}：${e && e.message || e}`); }
  }
  if (log.length) out.push({ name: '错误日志.txt', data: new TextEncoder().encode(log.join('\r\n') + '\r\n') });
  if (out.length) C.download('镜头校正.zip', C.makeZip(out));
  say(`镜头校正：${files.length} 个文件` + (log.length ? `，${log.length} 个出错` : ''));
  return { files: out.map(o => o.name), log };
}


async function mergeHdrUI() {
  const v = await C.formDialog('合并到 HDR Pro', [
    { type: 'note', label: '源文件：点「确定」后选择同一场景的两张以上包围曝光照片。' },
    { key: 'align', label: '尝试自动对齐源图像', type: 'check', value: true },
  ]);
  if (!v) return;
  const files = await getFiles(); if (!files.length) return;
  try { return await runMergeHdr(files, v); } catch (e) { await C.alertDialog('合并到 HDR Pro 没能完成：' + (e && e.message || e), { title: '合并到 HDR Pro' }); }
}
export async function runMergeHdr(files, v = {}) {
  if (files.length < 2) throw new Error('至少要两张不同曝光的照片');
  const imgs = await decodeAll(files, '合并到 HDR Pro');
  const W0 = imgs[0].width, H0 = imgs[0].height;
  let al = imgs;
  const H = await HD();
  

  const X = await EXIF();
  const exifs = await Promise.all(files.map(async f => { try { return X.readExif(new Uint8Array(await f.arrayBuffer())); } catch { return null; } }));
  const evExif = exifs.every(Boolean) ? X.evFromExif(exifs) : null;
  
  let evGuess = evExif || H.estimateEV(imgs);
  if (v.align !== false) {
    await step('合并到 HDR Pro：对齐源图像…');
    const sorted = [...evGuess].sort((a, b) => a - b), ref = evGuess.indexOf(sorted[(imgs.length - 1) >> 1]);
    const A = await AL();
    const res = A.alignImages(imgs, { projection: 'collage', reference: ref });
    if (res.ok) {
      const R = imgs[ref];
      al = imgs.map((im, k) => res.maps[k] ? { rgba: A.renderWarped(im, res.maps[k], { x0: 0, y0: 0, x1: R.width, y1: R.height }), width: R.width, height: R.height, name: im.name } : null);
      if (al.some(x => !x)) { say('合并到 HDR Pro：有照片没能对齐，按原位置合并'); al = imgs; }
    } else say('合并到 HDR Pro：自动对齐没成功（' + res.message + '），按原位置合并');
  } else if (imgs.some(im => im.width !== W0 || im.height !== H0)) throw new Error('照片尺寸不一致：请勾选「尝试自动对齐源图像」');
  evGuess = evExif || H.estimateEV(al);
  const opts = await hdrDialog(al, evGuess, { ...v, evSource: evExif ? 'exif' : 'estimate', exifs });
  if (!opts) return null;
  await step('合并到 HDR Pro：求响应曲线、合成辐射图…');
  const R = H.mergeHdr(al, { ev: opts.ev, deghost: opts.deghost, base: opts.base });
  const name = '合并到 HDR 结果';
  let buf;
  if (opts.depth === 32) {
    buf = await hdr32Psd(R);
  } else {
    await step('合并到 HDR Pro：色调映射…');
    const rgba = H.toneMap(R, opts.method, opts.params);
    const E = await ED();
    const { createPsd } = await import('../../core/psd-new.js');
    buf = createPsd({ width: R.width, height: R.height, background: 'white', name: '背景', resolution: C.resolution() });
    buf = E.applyEdits(buf, [{ op: 'replaceLayerPixels', index: 0, rgba: { data: new Uint8Array(rgba.buffer), width: R.width, height: R.height }, bounds: { left: 0, top: 0, right: R.width, bottom: R.height }, merged: { data: new Uint8Array(rgba.buffer) } }]).buffer;
    if (opts.depth === 16) { const { convertDocument } = await import('../../core/doc-mode.js'); buf = convertDocument(buf, { mode: 'rgb', depth: 16 }).buffer; }
  }
  await C.openPsdBuffer(buf, name);
  say(`合并到 HDR Pro：${al.length} 张（EV ${opts.ev.map(e => (e > 0 ? '+' : '') + e).join(' / ')}），${opts.depth} 位/通道` + (opts.depth === 32 ? '' : `，${(await HD()).TONE_METHODS[opts.method]}`) + (opts.deghost ? '，已移去重影' : ''));
  return { width: R.width, height: R.height, ev: opts.ev, evSource: evExif ? 'exif' : 'estimate', evEstimated: H.estimateEV(al), depth: opts.depth, method: opts.method };
}

async function hdr32Psd(R) {
  const E = await ED();
  const { createPsd } = await import('../../core/psd-new.js');
  const { convertDocument } = await import('../../core/doc-mode.js');
  const { parsePsdDocument, serializePsdDocument } = await import('../../core/psd-document.js');
  const IMG = await import('../../core/psd-image.js');
  const W = R.width, H = R.height;
  let buf = createPsd({ width: W, height: H, background: 'white', name: '背景', resolution: C.resolution() });
  buf = convertDocument(buf, { mode: 'rgb', depth: 32 }).buffer;
  const doc = parsePsdDocument(new Uint8Array(buf));
  const L = doc.layers[0];
  const enc = (id, data) => { const raw = IMG.encodeChannel({ data, width: W, height: H, depth: 32, compression: IMG.Compression.RAW, psb: doc.header.psb, reuseRaw: false, withHeader: true }); return { id, info: null, length: raw.length, compression: 0, _raw: raw, _dirty: true }; };
  const alpha = Float32Array.from(R.alpha);
  L.channels = L.channels.map(ch => ch.id === -1 ? enc(-1, alpha) : ch.id >= 0 && ch.id < 3 ? enc(ch.id, R.planes[ch.id]) : ch);
  const imgBytes = IMG.encodeCompositeImage({ planes: [R.planes[0], R.planes[1], R.planes[2]], width: W, height: H, depth: 32, compression: IMG.Compression.RAW, psb: doc.header.psb });
  doc.imageData = { compression: IMG.Compression.RAW, _raw: imgBytes };
  doc.header.channels = 3;
  const out = serializePsdDocument(doc);
  void E;
  return out.buffer.byteLength === out.length ? out.buffer : out.slice().buffer;
}


async function hdrDialog(imgs, ev, v0) {
  const H = await HD();
  const stub = typeof window !== 'undefined' && window.__fpDialog;
  const defaults = { depth: 16, method: 'local', params: { ...H.LOCAL_DEFAULTS }, deghost: false, base: ev.indexOf([...ev].sort((a, b) => a - b)[(ev.length - 1) >> 1]), ev: ev.slice() };
  if (stub) { const r = stub({ form: true, hdr: true, title: '合并到 HDR Pro', ev, defaults }); if (r === null || r === false) return null; return { ...defaults, ...(r && typeof r === 'object' ? r : {}), params: { ...defaults.params, ...(r && r.params || {}) } }; }
  return new Promise(resolve => {
    const st = JSON.parse(JSON.stringify(defaults));
    const d = mk('dialog', { className: 'fp-dlg fp-form hdrpro' });
    d.style.width = 'min(900px, 96vw)'; d.style.maxWidth = '96vw';   
    d.innerHTML = `<form method="dialog" class="fp-dlg-form" style="display:flex;flex-direction:column;gap:8px">
      <h3 class="fp-dlg-title">合并到 HDR Pro</h3>
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="display:flex;flex-direction:column;gap:6px">
          <canvas class="hp-view" style="background:#222;max-width:540px;max-height:420px;width:auto;height:auto"></canvas>
          <div class="hp-thumbs" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        </div>
        <div class="hp-side" style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:250px;font-size:12px;max-height:70vh;overflow:auto"></div>
      </div>
      <div class="fp-dlg-btns"><button type="button" class="fp-dlg-cancel">取消</button><button type="button" class="fp-dlg-ok primary">确定</button></div></form>`;
    document.body.append(d);
    const view = d.querySelector('.hp-view'), side = d.querySelector('.hp-side'), thumbs = d.querySelector('.hp-thumbs');
    const pf = Math.min(1, 420 / Math.max(imgs[0].width, imgs[0].height));
    const small = imgs.map(im => pf < 1 ? shrink(im, pf) : im);
    view.width = small[0].width; view.height = small[0].height;
    let R = null, timer = 0, curKey = '';
    const remerge = () => { const key = JSON.stringify([st.ev, st.deghost, st.base]); if (key === curKey && R) return; curKey = key; R = H.mergeHdr(small, { ev: st.ev, deghost: st.deghost, base: st.base }); };
    const draw = () => {
      remerge();
      const px = st.depth === 32 ? H.toneMap(R, 'exposureGamma', { exposure: st.view32 || 0, gamma: 1 }) : H.toneMap(R, st.method, st.params, pf);
      view.getContext('2d').putImageData(new ImageData(px, R.width, R.height), 0, 0);
      thumbs.querySelectorAll('.hp-th').forEach((t, k) => { t.style.outline = st.deghost && k === st.base ? '2px solid #3c3' : '1px solid #555'; });
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(draw, 60); };
    
    small.forEach((im, k) => {
      const box = mk('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:2px' });
      const c = mk('canvas', { className: 'hp-th', width: 72, height: Math.round(72 * im.height / im.width), title: '移去重影时以这一张为基准（点击选择）', style: 'cursor:pointer' });
      const t = mk('canvas', { width: im.width, height: im.height }); t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.rgba), im.width, im.height), 0, 0);
      c.getContext('2d').drawImage(t, 0, 0, c.width, c.height);
      c.onclick = () => { st.base = k; later(); };
      const ex = v0 && v0.exifs && v0.exifs[k];
      const how = v0 && v0.evSource === 'exif' ? `按 EXIF 算的（${[ex && ex.exposureTime > 0 ? (ex.exposureTime >= 1 ? ex.exposureTime + ' 秒' : '1/' + Math.round(1 / ex.exposureTime) + ' 秒') : '', ex && ex.fNumber > 0 ? 'f/' + Math.round(ex.fNumber * 10) / 10 : '', ex && ex.iso > 0 ? 'ISO ' + ex.iso : ''].filter(Boolean).join('，')}）` : '图里没有 EXIF 曝光时间，按亮度估计的';
      const e = mk('input', { type: 'number', step: 0.1, value: st.ev[k], style: 'width:56px', title: `曝光值（EV）：${how}，可手动改` });
      e.onchange = () => { st.ev[k] = +e.value || 0; later(); };
      box.append(c, mk('span', { textContent: 'EV' }), e);
      thumbs.append(box);
    });
    const row = (label, el) => { const r = mk('label', { style: 'display:flex;align-items:center;gap:6px' }); r.append(mk('span', { textContent: label, style: 'width:96px;flex:none' }), el); side.append(r); return r; };
    const sel = (opts, val, on) => { const s = mk('select', { style: 'flex:1' }); for (const [k, t] of opts) s.append(mk('option', { value: k, textContent: t })); s.value = val; s.onchange = () => on(s.value); return s; };
    const slider = (key, lab, min, max, stp, unit = '') => {
      const r = mk('input', { type: 'range', min, max, step: stp, value: st.params[key], style: 'flex:1' });
      const n = mk('input', { type: 'number', min, max, step: stp, value: st.params[key], style: 'width:56px' });
      const set = x => { st.params[key] = +x; r.value = x; n.value = x; later(); };
      r.oninput = () => set(r.value); n.onchange = () => set(n.value);
      const box = mk('span', { style: 'display:flex;gap:4px;flex:1;align-items:center' }); box.append(r, n, mk('span', { textContent: unit }));
      return row(lab, box);
    };
    const dg = mk('input', { type: 'checkbox' }); dg.onchange = () => { st.deghost = dg.checked; later(); };
    row('移去重影', dg);
    row('模式', sel([['32', '32 位'], ['16', '16 位'], ['8', '8 位']], String(st.depth), x => { st.depth = +x; sync(); later(); }));
    const methRow = row('方法', sel(Object.entries(H.TONE_METHODS), st.method, x => { st.method = x; sync(); later(); }));
    const local = [slider('radius', '边缘光 半径', 1, 500, 1, '像素'), slider('strength', '边缘光 强度', 0.1, 4, 0.01),
      slider('gamma', '灰度系数', 0.1, 2, 0.01), slider('exposure', '曝光度', -5, 5, 0.01), slider('detail', '细节', -100, 300, 1, '%'),
      slider('shadow', '阴影', -100, 100, 1, '%'), slider('highlight', '高光', -100, 100, 1, '%'),
      slider('vibrance', '自然饱和度', -100, 100, 1, '%'), slider('saturation', '饱和度', -100, 100, 1, '%')];
    const eg = [slider('exposure', '曝光度', -5, 5, 0.01), slider('gamma', '灰度系数', 0.1, 2, 0.01)];
    const v32 = mk('input', { type: 'range', min: -5, max: 5, step: 0.01, value: 0, style: 'flex:1' }); v32.oninput = () => { st.view32 = +v32.value; later(); };
    const v32Row = row('预览曝光', v32);
    const note = mk('div', { className: 'anote plain', style: 'max-width:260px' }); side.append(note);
    function sync() {
      methRow.hidden = st.depth === 32;
      for (const r of local) r.hidden = st.depth === 32 || st.method !== 'local';
      for (const r of eg) r.hidden = st.depth === 32 || st.method !== 'exposureGamma';
      if (st.method !== 'local') for (const r of local) if (eg.includes(r)) r.hidden = false;
      v32Row.hidden = st.depth !== 32;
      note.textContent = st.depth === 32 ? '32 位：辐射图原样存进文档（线性、高光可超过 1），之后可用「图像 › 模式 › 16 位」再做色调映射。预览曝光只影响这里的显示。'
        : st.method === 'local' ? '局部适应：边缘光半径 / 强度决定「多大范围算同一块亮度」；细节放大纹理，阴影 / 高光单独提压。' : '';
    }
    sync();
    const finish = r => { clearTimeout(timer); try { d.close(); } catch {} d.remove(); resolve(r); };
    d.querySelector('.fp-dlg-ok').onclick = () => finish({ ...st });
    d.querySelector('.fp-dlg-cancel').onclick = () => finish(null);
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    try { d.showModal(); } catch { d.setAttribute('open', ''); }
    setTimeout(draw, 30);
  });
}
function shrink(im, f) {
  const W = Math.max(1, Math.round(im.width * f)), H = Math.max(1, Math.round(im.height * f));
  const a = mk('canvas', { width: im.width, height: im.height }); a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.rgba), im.width, im.height), 0, 0);
  const b = mk('canvas', { width: W, height: H }); const g = b.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(a, 0, 0, W, H);
  return { rgba: g.getImageData(0, 0, W, H).data, width: W, height: H };
}


export function installStitch(ctx) {
  C = ctx;
  const R = (id, run, enabled, why) => actions.register(id, { run: (...a) => { run(...a); }, enabled, ...(why ? { why } : {}) });
  R('edit.autoAlign', () => autoAlignUI(), () => !alignWhy(), () => alignWhy());
  R('edit.autoBlend', () => autoBlendUI(), () => !blendWhy(), () => blendWhy());
  R('file.photomerge', () => photomergeUI(), () => true);
  R('file.mergeHdr', () => mergeHdrUI(), () => true);
  R('file.loadStack', () => loadStackUI(), () => true);
  R('file.statistics', () => statisticsUI(), () => true);
  R('file.lensCorrectionBatch', () => lensBatchUI(), () => true);
  if (typeof window !== 'undefined') window.__psd_editorStitch = Object.assign(window.__psd_editorStitch || {}, {
    runAutoAlign: v => runAutoAlign(v || {}), runAutoBlend: v => runAutoBlend(v || {}), autoAlignUI, autoBlendUI,
    runPhotomerge, runLoadStack, runStatistics, runMergeHdr, runLensBatch, files: null,
  });
}
