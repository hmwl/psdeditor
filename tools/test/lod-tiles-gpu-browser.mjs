import assert from 'node:assert/strict';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW = await loadPlaywright(); if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: WEBGPU_ARGS });
try {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/health`);
  const report = await page.evaluate(async () => {
    const { createGpuCompositor } = await import('/core/render/gpu-compositor.js');
    const { buildDrawList, executeDrawListCPU } = await import('/core/render/draw-list.js');
    const W = 1025, H = 1025, gc = await createGpuCompositor({}), gpuErrors = [], results = [];
    gc.device.addEventListener('uncapturederror', e => { gpuErrors.push(e.error.message); e.preventDefault(); });
    const solid = (w, h, color) => { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < data.length; i += 4) data.set(color, i); return data; };
    const colors = { 1: [230, 20, 40, 128], 2: [30, 220, 50, 128], 4: [40, 60, 210, 128], proxy: [90, 90, 90, 128] };
    const level = scale => ({ width: W, height: H, tileSize: 256 * scale, scale, tiles: new Map(), version: 0 });
    const root = level(1), mid = level(2), low = level(4); root.levels = new Map([[2, mid], [4, low]]);
    function put(state, x, y) {
      const width = Math.min(state.tileSize, W - x), height = Math.min(state.tileSize, H - y), k = state.scale;
      state.tiles.set(`${x}:${y}`, { x, y, width, height, scale: k, sampleWidth: Math.ceil(width / k), sampleHeight: Math.ceil(height / k), data: solid(Math.ceil(width / k), Math.ceil(height / k), colors[k]) }); state.version++;
    }
    for (let y = 0; y < H; y += 1024) for (let x = 0; x < W; x += 1024) put(low, x, y);
    put(mid, 512, 0); put(root, 512, 256);
    const bounds = { left: 0, top: 0, right: W, bottom: H }, proxy = solid(32, 32, colors.proxy);
    const image = { width: 32, height: 32, bounds, rgba: proxy, opacity: 173, blendMode: 'norm', gpuXform: [W / 32, 0, 0, H / 32, 0, 0], gpuDetailTiles: root };
    const base = { width: W, height: H, bounds, rgba: solid(W, H, [80, 110, 180, 255]), opacity: 255, blendMode: 'norm' };
    const clipped = { ...base, rgba: solid(W, H, [220, 190, 20, 170]), clipping: 1, opacity: 210, blendMode: 'scrn' };
    function reference() {
      const data = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let color = colors.proxy;
        for (const s of [root, mid, low]) if (s.tiles.has(`${Math.floor(x / s.tileSize) * s.tileSize}:${Math.floor(y / s.tileSize) * s.tileSize}`)) { color = colors[s.scale]; break; }
        data.set(color, (y * W + x) * 4);
      }
      return { ...image, width: W, height: H, rgba: data, gpuXform: null, gpuDetailTiles: null };
    }
    const points = [[128,128], [640,128], [640,384], [900,900], [1024,1024]];
    try {
      for (const blendMode of ['norm', 'mul ', 'over', 'diff']) for (const clip of [false, true]) {
        image.blendMode = blendMode;
        const list = buildDrawList({ layers: [base, image, ...(clip ? [clipped] : [])] }, W, H);
        const expected = executeDrawListCPU(buildDrawList({ layers: [base, reference(), ...(clip ? [clipped] : [])] }, W, H)).data;
        let maxError = 0;
        for (const [x,y] of points) {
          const px = await gc.renderToRGBA(list, { W: 1, H: 1, s: 1, tx: -x, ty: -y });
          for (let c = 0; c < 4; c++) maxError = Math.max(maxError, Math.abs(px[c] - expected[(y * W + x) * 4 + c]));
        }
        results.push({ name: `mixed LOD ${blendMode}, clipping=${clip}`, maxError });
      }
      image.blendMode = 'norm'; image.opacity = 255;
      const list = buildDrawList({ layers: [image] }, W, H);
      for (const scale of [.125, .25, .5, .73, 1, 1.4, 2]) {
        let maxError = 0;
        for (const [index,[x,y]] of points.slice(0,4).entries()) {
          const px = await gc.renderToRGBA(list, { W: 1, H: 1, s: scale, tx: .5 - x * scale, ty: .5 - y * scale });
          const ref = scale <= .25 ? colors[4] : scale === .5 ? [colors[4],colors[2],colors[2],colors[4]][index] : [colors[4],colors[2],colors[1],colors[4]][index];
          for (let c = 0; c < 4; c++) maxError = Math.max(maxError, Math.abs(px[c] - ref[c]));
        }
        results.push({ name: `mixed LOD opacity once, zoom=${scale}`, maxError });
      }
      const outside = await gc.renderToRGBA(list, { W: 2, H: 1, s: 1, tx: -1024, ty: -1024 });
      results.push({ name: 'partial final mip texel clips at native document edge', maxError: outside[7] });
      let boundaryAlphaError = 0;
      for (const s of [.13,.3,.51,.73,1,1.4,2.1]) for (const [x,y] of [[512,256],[768,256],[512,512],[768,512],[1024,512]]) {
        const px = await gc.renderToRGBA(list,{W:1,H:1,s,tx:.5-x*s,ty:.5-y*s});
        boundaryAlphaError = Math.max(boundaryAlphaError,Math.abs(px[3]-128));
      }
      results.push({name:'exact native-cell boundaries keep alpha once at fractional zoom',maxError:boundaryAlphaError});
      const resident = gc.bytesResident;
      root.tiles.clear(); root.version++; gc.pruneDetailTiles(root);
      const nativeMissing = await gc.renderToRGBA(list, { W: 1, H: 1, s: 1, tx: -640, ty: -384 });
      results.push({ name: 'fine eviction immediately reveals middle LOD', maxError: Math.max(...nativeMissing.map((v,c)=>Math.abs(v-colors[2][c]))) });
      mid.tiles.clear(); mid.version++; gc.pruneDetailTiles(mid);
      const middleMissing = await gc.renderToRGBA(list, { W: 1, H: 1, s: 1, tx: -640, ty: -384 });
      results.push({ name: 'middle eviction reveals coarse LOD', maxError: Math.max(...middleMissing.map((v,c)=>Math.abs(v-colors[4][c]))) });
      low.tiles.clear(); low.version++; gc.pruneDetailTiles(low);
      const empty = await gc.renderToRGBA(list, { W: 1, H: 1, s: 1, tx: -640, ty: -384 });
      results.push({ name: 'all mip eviction reveals proxy', maxError: Math.max(...empty.map((v,c)=>Math.abs(v-colors.proxy[c]))) });
      results.push({ name: 'all mip CPU eviction releases GPU sources', maxError: resident - gc.bytesResident > 256 * 256 * 4 ? 0 : 255, before: resident, after: gc.bytesResident });
      const pixels = new Uint8ClampedArray(512 * 512 * 4);
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) pixels.set([(x*3+y)&255,(y*5+x)&255,(x^y)&255,70+(x+y)%170], (y*512+x)*4);
      const patterned = { width: 1024, height: 1024, tileSize: 256, tiles: new Map(), version: 0, levels: new Map() };
      const mip = { width: 1024, height: 1024, tileSize: 512, scale: 2, tiles: new Map(), version: 0 }; patterned.levels.set(2, mip);
      for (let y = 0; y < 1024; y += 512) for (let x = 0; x < 1024; x += 512) {
        const data = new Uint8ClampedArray(256*256*4);
        for (let r = 0; r < 256; r++) data.set(pixels.subarray(((y/2+r)*512+x/2)*4, ((y/2+r)*512+x/2+256)*4), r*256*4);
        mip.tiles.set(`${x}:${y}`, { x,y,width:512,height:512,sampleWidth:256,sampleHeight:256,scale:2,data });
      }
      const pb = { left:0,top:0,right:1024,bottom:1024 }, pi = { ...image,bounds:pb,gpuXform:[32,0,0,32,0,0],gpuDetailTiles:patterned };
      const pl = buildDrawList({ layers: [pi] },1024,1024), rl = buildDrawList({ layers: [{...pi,width:512,height:512,rgba:pixels,gpuXform:[2,0,0,2,0,0],gpuDetailTiles:null}] },1024,1024);
      const referenceGPU = await createGpuCompositor({ device: gc.device });
      try {
        for (const s of [.125,.25,.5,.73,1,1.4]) {
          const view = {W:320,H:300,s,tx:160-512*s,ty:150-512*s}, expected = await referenceGPU.renderToRGBA(rl,view), actual = await gc.renderToRGBA(pl,view);
          let maxError = 0;
          for (let i = 0; i < actual.length; i += 4) for (let c = 0; c < 4; c++) {
            const a = c === 3 ? actual[i+c] : actual[i+c]*actual[i+3]/255, b = c === 3 ? expected[i+c] : expected[i+c]*expected[i+3]/255;
            maxError = Math.max(maxError,Math.abs(a-b));
          }
          results.push({ name:`LOD tile seams equal full mip image, zoom=${s}`,maxError });
        }
      } finally { referenceGPU.destroy(); }
      return { results, gpuErrors };
    } finally { gc.destroy(); }
  });
  for (const r of report.results) { console.log(JSON.stringify(r)); assert.ok(r.maxError <= 2, r.name); }
  assert.deepEqual(report.gpuErrors, []); assert.deepEqual(errors, []);
  console.log('✓ 多级 LOD 匹配缩放等级、透明度/混合/剪贴、奇数边界、逐级回退与资源释放');
} finally { await browser.close(); }
