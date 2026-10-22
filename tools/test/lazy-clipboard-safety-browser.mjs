import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editor?.paint);
  const result = await page.evaluate(async () => {
    const A = window.__psd_editor, C = await import('/editor/app/50-clipboard-merge-mask.js');
    const { getTile } = await import('/core/tile-store.js');
    await A.docSize.newDocument({ width: 513, height: 515, background: 'transparent', name: 'lazy-clipboard' });
    A.selectLayers([0]);
    await A.lazy.selection();
    A.sel.rect(255, 255, 3, 3);
    const l = A.state.doc.layers[0], W = 513, H = 515;
    const value = (c, x, y) => c === -1 ? 255 : (x * (c + 1) + y * (c + 3)) & 255;
    l.width = W; l.height = H; l.bounds = { left: 0, top: 0, right: W, bottom: H }; l.rgba = null;
    l.lazyChannels = Object.fromEntries([0, 1, 2, -1].map(c => {
      const bytes = new Uint8Array(2 + W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) bytes[2 + y * W + x] = value(c, x, y);
      return [c, { bytes, width: W, height: H, depth: 8, bps: 1, rowBytes: W, comp: 0, dataOffset: 2, rows: new Map() }];
    }));
    l.lazyPreview = { width: 1, height: 1, data: new Uint8ClampedArray([250, 0, 250, 255]) };
    const copied = await C.copyPixelsUI(false), clip = C.pixelClipboard;
    const tile = copied ? await getTile(clip.store, 0, 0) : null;
    const expected = [];
    for (let y = 255; y < 258; y++) for (let x = 255; x < 258; x++) for (const c of [0, 1, 2, -1]) expected.push(value(c, x, y));
    const before = A.paint.history.undo.length, channels = l.lazyChannels;
    const rejected = [];
    for (const [key, value0] of [['blendMode', 'mul '], ['effects', {}], ['vectorMask', {}], ['group', { type: 1 }]]) {
      const old = l[key]; l[key] = value0;
      rejected.push(await C.cutPixelsUI()); l[key] = old;
    }
    const oldTransforms = A.state.layerTransforms?.[0];
    const S = await import('/editor/app/02-doc-state.js');
    S.layerTransforms[0] = { x: 1, y: 0, w: W, h: H, rot: 0 };
    rejected.push(await C.cutPixelsUI());
    if (oldTransforms) S.layerTransforms[0] = oldTransforms; else delete S.layerTransforms[0];
    delete l.lazyChannels;
    l.lazyRasterFile = new File(['invalid image'], 'unreadable.jpg', { type: 'image/jpeg' });
    const failedRead = await C.cutPixelsUI();
    const readNotice = document.querySelector('#notice').textContent;
    const protectedSource = A.paint.history.undo.length === before && !A.paint.pixelPaint[0]?.sparse?.tiles?.size && C.pixelClipboard === clip;
    delete l.lazyRasterFile;
    const image = new OffscreenCanvas(W, H), ctx = image.getContext('2d');
    ctx.fillStyle = '#326496'; ctx.fillRect(0, 0, W, H); l.lazyImage = image;
    const imageCopied = await C.copyPixelsUI(false);
    const imageTile = imageCopied ? await getTile(C.pixelClipboard.store, 0, 0) : null;
    delete l.lazyImage; l.lazyChannels = channels;
    await A.createLayer({ name: 'merge overlay' });
    A.selectLayers([0, 1]);
    const mergeLayer = A.state.doc.layers[0];
    mergeLayer.rgba = null; mergeLayer.lazyChannels = channels;
    mergeLayer.effects = {};
    const count = A.state.doc.layers.length, buffer = S.origBuffer, deletes = S.layerDeletes.size;
    const rejectedMerge = await C.mergeLayersUI('merge');
    const mergeProtected = A.state.doc.layers.length === count && S.origBuffer === buffer && S.layerDeletes.size === deletes;
    delete mergeLayer.effects;
    const merged = await C.mergeLayersUI('merge');
    const mergedDoc = A.state.doc, mergedPixels = mergedDoc.layers.find(l => l.rgba)?.rgba;
    const mergedPixel = mergedPixels ? [...mergedPixels.slice((256 * W + 256) * 4, (256 * W + 256) * 4 + 4)] : null;
    return { copied, pixels: tile ? [...tile.data] : null, expected, rejected, failedRead, readNotice, protectedSource,
      imageCopied, imagePixel: imageTile ? [...imageTile.data.slice(0, 4)] : null, rejectedMerge, mergeProtected, merged, mergedPixel };
  });
  assert.equal(result.copied, true);
  assert.deepEqual(result.pixels, result.expected, 'PSD clipboard must decode real pixels across both tile boundaries');
  assert.deepEqual(result.rejected, [false, false, false, false, false]);
  assert.equal(result.failedRead, false);
  assert.match(result.readNotice, /原始图片像素/);
  assert.equal(result.protectedSource, true, 'Failed cut must retain source pixels, history and clipboard');
  assert.equal(result.imageCopied, true);
  assert.deepEqual(result.imagePixel, [50, 100, 150, 255]);
  assert.equal(result.rejectedMerge, false);
  assert.equal(result.mergeProtected, true, 'Unsupported merge must not remove or rewrite layers');
  assert.equal(result.merged, true);
  assert.deepEqual(result.mergedPixel, [0, 0, 0, 255], 'Plain lazy PSD merge must preserve source pixels');
  console.log('✓ lazy clipboard uses original PSD/image pixels; unsupported appearance and unavailable sources cannot destroy cut/merge data');
} finally { await browser.close(); }
