

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) { console.log('跳过：没有 Playwright'); process.exit(0); }
const { chromium } = PW;
const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.argv[2] || process.env.PORT || 8789;
const exe = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: WEBGPU_ARGS });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/health`);
const synthSrc = fs.readFileSync(path.join(here, 'synth-doc.mjs'), 'utf8').replace('export function synthDoc', 'window.synthDoc = function synthDoc');
await page.addScriptTag({ content: synthSrc });
const res = await page.evaluate(async () => {
  const DL = await import('/core/render/draw-list.js');
  const G = await import('/core/render/gpu-compositor.js');
  if (!navigator.gpu) return { skip: 'no WebGPU' };
  const gc = await G.createGpuCompositor({});
  const out = [];
  const W = 160, H = 120;
  const doc = window.synthDoc(W, H, 7);
  const st = DL.createDrawListState();
  const list = DL.buildDrawList(doc, W, H, st);
  const ref = DL.executeDrawListCPU(list).data;
  const cmp = (a, b, w, h, name, tol) => {
    let max = 0, bad = 0, sum = 0;
    for (let i = 0; i < w * h; i++) {
      const aa = a[i * 4 + 3] / 255, ba = b[i * 4 + 3] / 255;
      for (let c = 0; c < 4; c++) {
        const va = c === 3 ? a[i * 4 + 3] : a[i * 4 + c] * aa, vb = c === 3 ? b[i * 4 + 3] : b[i * 4 + c] * ba;   
        const d = Math.abs(va - vb); sum += d; if (d > max) max = d; if (d > tol) bad++;
      }
    }
    out.push({ name, max: Math.round(max * 10) / 10, mean: Math.round(sum / (w * h * 4) * 100) / 100, bad, of: w * h * 4 });
    return bad;
  };
  
  const L0 = doc.layers;
  for (let k = 1; k < L0.length; k++) {
    if (L0[k].group) continue;
    const d1 = { ...doc, layers: L0[k].clipping ? [L0[0], L0[k - 1], L0[k]] : [L0[0], L0[k]] };
    const l1 = DL.buildDrawList(d1, W, H, null);
    const r1 = DL.executeDrawListCPU(l1).data;
    const g = await gc.renderToRGBA(l1, { W, H, s: 1, tx: 0, ty: 0 });
    const tag = (L0[k].adjustment ? 'adj ' + L0[k].adjustment.key : L0[k].blendMode) + (L0[k].clipping ? ' clip' : '') + (L0[k].blendIf ? ' blendIf' : '') + (L0[k].channelsOff ? ' chOff' : '') + (L0[k].knockout ? ' knockout' : '') + (L0[k].mask ? ' mask' : '');
    cmp(r1, g, W, H, 'feature ' + k + ' ' + tag, 8);
  }
  
  const g1 = await gc.renderToRGBA(list, { W, H, s: 1, tx: 0, ty: 0 });
  cmp(ref, g1, W, H, '1:1', 8);
  
  const g2 = await gc.renderToRGBA(list, { W: W * 2, H: H * 2, s: 2, tx: 0, ty: 0 });
  const up = new Uint8ClampedArray(W * H * 16);
  for (let y = 0; y < H * 2; y++) for (let x = 0; x < W * 2; x++) for (let c = 0; c < 4; c++) up[(y * W * 2 + x) * 4 + c] = ref[((y >> 1) * W + (x >> 1)) * 4 + c];
  cmp(up, g2, W * 2, H * 2, '2x', 8);
  
  const g3 = await gc.renderToRGBA(list, { W: 100, H: 80, s: 1, tx: -40, ty: -30 });
  const crop = new Uint8ClampedArray(100 * 80 * 4);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 100; x++) for (let c = 0; c < 4; c++) crop[(y * 100 + x) * 4 + c] = ref[((y + 30) * W + x + 40) * 4 + c];
  cmp(crop, g3, 100, 80, 'pan', 8);
  
  const g4 = await gc.renderToRGBA(list, { W, H, s: 1, tx: 0, ty: 0 });
  cmp(g1, g4, W, H, 'cached', 0);
  
  const L = doc.layers[0];
  for (let y = 10; y < 30; y++) for (let x = 10; x < 50; x++) { const q = (y * L.width + x) * 4; L.rgba[q] = 255; L.rgba[q + 1] = 0; L.rgba[q + 2] = 0; }
  DL.markDirty(st, L.rgba); gc.invalidate(L.rgba, { x0: 10, y0: 10, x1: 50, y1: 30 });
  const list2 = DL.buildDrawList(doc, W, H, st);
  const ref2 = DL.executeDrawListCPU(list2).data;
  const before = gc.stats.uploadPx;
  const g5 = await gc.renderToRGBA(list2, { W, H, s: 1, tx: 0, ty: 0 });
  cmp(ref2, g5, W, H, 'dirty-rect', 8);
  out.push({ name: 'dirty upload px (≤ 40×20 + mip 边)', n: gc.stats.uploadPx - before }); if (gc.stats.uploadPx - before > 2000) out[out.length - 1].bad = 1, out[out.length - 1].of = 1;
  
  const g6 = await gc.renderToRGBA(list2, { W: W / 2, H: H / 2, s: 0.5, tx: 0, ty: 0 });
  const dn = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
    let a = 0; const acc = [0, 0, 0];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const q = ((y * 2 + dy) * W + x * 2 + dx) * 4, al = ref2[q + 3]; a += al; for (let c = 0; c < 3; c++) acc[c] += ref2[q + c] * al; }
    const o = (y * W / 2 + x) * 4; dn[o + 3] = a / 4; for (let c = 0; c < 3; c++) dn[o + c] = a ? acc[c] / a : 0;
  }
  cmp(dn, g6, W / 2, H / 2, '0.5x synth (mean)', 255); out[out.length - 1].lim = 8;
  
  const nd = { width: W, height: H, layers: doc.layers.filter(l => !l.group && !l.adjustment && !l.clipping && l.blendMode === 'norm' && !l.blendIf && !l.channelsOff && !l.knockout) };
  const nl = DL.buildDrawList(nd, W, H, null), nref = DL.executeDrawListCPU(nl).data;
  const g8 = await gc.renderToRGBA(nl, { W: W / 2, H: H / 2, s: 0.5, tx: 0, ty: 0 });
  const nd2 = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
    let a = 0; const acc = [0, 0, 0];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const q = ((y * 2 + dy) * W + x * 2 + dx) * 4, al = nref[q + 3]; a += al; for (let c = 0; c < 3; c++) acc[c] += nref[q + c] * al; }
    const o = (y * W / 2 + x) * 4; nd2[o + 3] = a / 4; for (let c = 0; c < 3; c++) nd2[o + c] = a ? acc[c] / a : 0;
  }
  cmp(nd2, g8, W / 2, H / 2, '0.5x normal (mean)', 255); out[out.length - 1].lim = 1.5;
  
  const BW = gc.tile + 300, BH = 64;
  const big = new Uint8ClampedArray(BW * BH * 4);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const q = (y * BW + x) * 4; big[q] = x & 255; big[q + 1] = (x >> 8) * 40; big[q + 2] = y * 4; big[q + 3] = 255; }
  const bdoc = { width: BW, height: BH, layers: [{ name: 'big', rgba: big, width: BW, height: BH, bounds: { left: 0, top: 0, right: BW, bottom: BH }, opacity: 255, blendMode: 'norm' },
    { name: 'm', rgba: big.slice(0, 600 * BH * 4), width: 600, height: BH, bounds: { left: gc.tile - 300, top: 0, right: gc.tile + 300, bottom: BH }, opacity: 128, blendMode: 'mul ' }] };
  
  const mrg = new Uint8ClampedArray(600 * BH * 4); for (let y = 0; y < BH; y++) mrg.set(big.subarray((y * BW + 100) * 4, (y * BW + 700) * 4), y * 600 * 4); bdoc.layers[1].rgba = mrg;
  const bl = DL.buildDrawList(bdoc, BW, BH, null);
  const bref = DL.executeDrawListCPU(bl).data;
  const vx = gc.tile - 200;
  const g7 = await gc.renderToRGBA(bl, { W: 400, H: BH, s: 1, tx: -vx, ty: 0 });
  const bcrop = new Uint8ClampedArray(400 * BH * 4);
  for (let y = 0; y < BH; y++) bcrop.set(bref.subarray((y * BW + vx) * 4, (y * BW + vx + 400) * 4), y * 400 * 4);
  cmp(bcrop, g7, 400, BH, 'tiles seam', 8);
  
  {
    const gc2 = await G.createGpuCompositor({ device: gc.device, tile: 1024, detailBudget: 1 });
    const N = 2600, M = 1400, px = new Uint8ClampedArray(N * M * 4);
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) { const q = (y * N + x) * 4; px[q] = (x >> 3) & 255; px[q + 1] = (y >> 3) & 255; px[q + 2] = ((x + y) >> 5) & 255; px[q + 3] = 255; }
    const d = { width: N, height: M, layers: [{ name: 'p', rgba: px, width: N, height: M, bounds: { left: 0, top: 0, right: N, bottom: M }, opacity: 255, blendMode: 'norm' }] };
    const l = DL.buildDrawList(d, N, M, null);
    const k = 0.125, w = Math.round(N * k), h = Math.round(M * k);
    const z = await gc2.renderToRGBA(l, { W: w, H: h, s: k, tx: 0, ty: 0 });
    const ref = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { let a = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) a += px[((y * 8 + j) * N + x * 8 + i) * 4 + c]; ref[(y * w + x) * 4 + c] = a / 64; }
    cmp(ref, z, w, h, 'pyramid 1/8 (mean)', 255); out[out.length - 1].lim = 2;
    out.push({ name: 'pyramid only: detail bytes', n: gc2.detailBytes, pyramids: gc2.stats.pyramids });
    const vx = 1000, vy = 600;
    const f = await gc2.renderToRGBA(l, { W: 300, H: 200, s: 1, tx: -vx, ty: -vy });
    out.push({ name: 'viewport indexes ≤2 of 6 source tiles', n: gc2.stats.tileCandidates, bad: gc2.stats.tileCandidates <= 2 ? 0 : 1 });
    const fr = new Uint8ClampedArray(300 * 200 * 4); for (let y = 0; y < 200; y++) fr.set(px.subarray(((y + vy) * N + vx) * 4, ((y + vy) * N + vx + 300) * 4), y * 1200);
    cmp(fr, f, 300, 200, 'detail after pyramid', 0);
    for (let y = 650; y < 700; y++) for (let x = 1050; x < 1100; x++) { const q = (y * N + x) * 4; px[q] = 255; px[q + 1] = 0; px[q + 2] = 255; }
    gc2.invalidate(px, { x0: 1050, y0: 650, x1: 1100, y1: 700 });
    const f2 = await gc2.renderToRGBA(l, { W: 300, H: 200, s: 1, tx: -vx, ty: -vy });
    for (let y = 0; y < 200; y++) fr.set(px.subarray(((y + vy) * N + vx) * 4, ((y + vy) * N + vx + 300) * 4), y * 1200);
    cmp(fr, f2, 300, 200, 'detail dirty after evict', 0);
    const z2 = await gc2.renderToRGBA(l, { W: w, H: h, s: k, tx: 0, ty: 0 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { let a = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) a += px[((y * 8 + j) * N + x * 8 + i) * 4 + c]; ref[(y * w + x) * 4 + c] = a / 64; }
    cmp(ref, z2, w, h, 'pyramid sees paint (mean)', 255); out[out.length - 1].lim = 2;
    const beforeUploads = gc2.stats.uploads;
    const hidden = { width: N, height: M, layers: [{ ...d.layers[0], rgba: new Uint8ClampedArray(px), bounds: { left: 10000, top: 10000 } }] };
    const hlist = DL.buildDrawList(hidden, N, M, null);
    const hp = await gc2.renderToRGBA(hlist, { W: 100, H: 100, s: 1, tx: 0, ty: 0 });
    out.push({ name: 'offscreen source skips texture registration', bad: gc2.stats.uploads === beforeUploads && hp.every(x => x === 0) ? 0 : 1 });
  }
  
  {
    const w = 40, h = 24, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; px[q] = x * 6; px[q + 1] = y * 10; px[q + 2] = 128; px[q + 3] = 255; }
    const rot = new Uint8ClampedArray(w * h * 4);       
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s0 = (y * w + x) * 4, d0 = (x * h + (h - 1 - y)) * 4; rot.set(px.subarray(s0, s0 + 4), d0); }
    const base = { name: 'bg', rgba: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H, bounds: { left: 0, top: 0, right: W, bottom: H }, opacity: 255, blendMode: 'norm' };
    const X0 = 30, Y0 = 20;
    const cpuDoc = { width: W, height: H, layers: [base, { name: 'r', rgba: rot, width: h, height: w, bounds: { left: X0, top: Y0, right: X0 + h, bottom: Y0 + w }, opacity: 200, blendMode: 'mul ' }] };
    const gpuDoc = { width: W, height: H, layers: [base, { name: 'r', rgba: px, width: w, height: h, bounds: { left: 0, top: 0, right: w, bottom: h }, opacity: 200, blendMode: 'mul ', gpuXform: [0, 1, -1, 0, X0 + h, Y0] }] };
    const r0 = DL.executeDrawListCPU(DL.buildDrawList(cpuDoc, W, H, null)).data;
    const g0 = await gc.renderToRGBA(DL.buildDrawList(gpuDoc, W, H, null), { W, H, s: 1, tx: 0, ty: 0 });
    cmp(r0, g0, W, H, 'affine rot90', 8);
  }
  return { out, stats: gc.stats, bytes: gc.bytesResident, tile: gc.tile, maxDim: gc.maxDim };
});
await browser.close();
if (res.skip) { console.log('跳过：', res.skip); process.exit(0); }
let fail = 0;
for (const r of res.out) {
  const loose = /^(1:1|2x|pan|dirty-rect)$/.test(r.name);
  const ok = r.bad === undefined || (r.name.startsWith('0.5x') ? r.mean < r.lim : loose ? r.bad / r.of < 0.002 && r.mean < 0.2 : r.bad === 0);
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', JSON.stringify(r));
}
console.log('tile', res.tile, 'maxDim', res.maxDim, 'stats', JSON.stringify(res.stats));
process.exit(fail ? 1 : 0);
