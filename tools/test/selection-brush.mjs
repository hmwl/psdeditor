import assert from 'node:assert/strict';
import * as S from '../../core/selection.js';

const W = 8192, H = 8192;
const base = S.rectSelection(W, H, 0, 0, W, H);
assert.equal(base.data.__virtual, true);
assert.equal(S.selectionArea(base), W * H);

const preserve = new Uint8Array(256 * 256).fill(255);
preserve[0] = 0; preserve[1] = 200;
const sel = S.brushSelection(W, H, new Map([[0, preserve]]), base);
assert.equal(S.selectionValueAt(sel, 0, 0), 0);
assert.equal(S.selectionValueAt(sel, 1, 0), 200);
assert.equal(S.selectionValueAt(sel, 300, 300), 255, 'untouched pixels in a written tile keep the base coverage');
assert.equal(S.selectionValueAt(sel, W - 1, H - 1), 255);
assert.equal(S.selectionArea(sel), W * H - 2 + 200 / 255);
assert.deepEqual(S.selectionBounds(sel), { x: 0, y: 0, width: W, height: H });
assert.equal(S.isEmptySelection(sel), false);

const clone = S.cloneSelection(sel);
assert.equal(S.selectionValueAt(clone, 0, 0), 0);
assert.equal(S.selectionValueAt(clone, 1, 0), 200);
assert.equal(S.selectionArea(clone), S.selectionArea(sel));
assert.equal(clone.data.__brushBase, base);

const noTiles = S.brushSelection(W, H, new Map(), base);
assert.equal(S.selectionArea(noTiles), W * H);
assert.deepEqual(S.selectionBounds(noTiles), { x: 0, y: 0, width: W, height: H });

const blank = new Uint8Array(256 * 256);
assert.equal(S.isEmptySelection(S.brushSelection(1024, 1024, new Map([[0, blank]]), null)), true);
const sparseTile = new Uint8Array(256 * 256); sparseTile[0] = 255; sparseTile[1] = 200;
const only = S.brushSelection(1024, 1024, new Map([[0, sparseTile]]), null);
assert.deepEqual(S.selectionBounds(only), { x: 0, y: 0, width: 2, height: 1 });
assert.equal(S.selectionArea(only), (255 + 200) / 255);

const smallBase = S.rectSelection(1024, 1024, 300, 320, 50, 40);
const unionTile = new Uint8Array(256 * 256); unionTile[5] = 255;
const union = S.brushSelection(1024, 1024, new Map([[0, unionTile]]), smallBase);
assert.deepEqual(S.selectionBounds(union), { x: 5, y: 0, width: 345, height: 360 });
assert.equal(S.selectionValueAt(union, 5, 0), 255);
assert.equal(S.selectionValueAt(union, 305, 325), 255, 'base pixels outside the written tile are preserved');
assert.equal(S.selectionValueAt(union, 900, 900), 0);

const full = S.rectSelection(W, H, 0, 0, W, H);
const small = S.rectSelection(W, H, 300, 300, 40, 40);
const sum = S.combineSelection(full, small, 'add');
assert.equal(sum.data.__virtual, true);
assert.equal(S.selectionArea(sum), W * H);
const cut = S.combineSelection(full, small, 'subtract');
assert.ok(cut.data.__neg);
assert.equal(S.selectionArea(cut), W * H - 1600);
assert.equal(S.selectionValueAt(cut, 310, 310), 0);
assert.equal(S.selectionValueAt(cut, 500, 500), 255);
const cross = S.combineSelection(full, small, 'intersect');
assert.deepEqual(S.selectionBounds(cross), { x: 300, y: 300, width: 40, height: 40 });
const invFull = S.invertSelection(full);
assert.equal(S.isEmptySelection(invFull), true);
const invSmall = S.invertSelection(small);
assert.equal(S.selectionArea(invSmall), W * H - 1600);
assert.equal(S.selectionValueAt(invSmall, 310, 310), 0);
assert.equal(S.selectionValueAt(invSmall, 500, 500), 255);
const onBrush = S.combineSelection(sel, small, 'subtract');
assert.equal(onBrush.data.__brushBase, sel);
assert.equal(S.selectionValueAt(onBrush, 0, 0), 0, 'earlier brush cut survives a later combine');
assert.equal(S.selectionValueAt(onBrush, 310, 310), 0, 'later combine cut applies');
assert.equal(S.selectionValueAt(onBrush, 500, 500), 255);


const hole = new Uint8Array(256 * 256).fill(255);
for (let y = 100; y < 156; y++) for (let x = 100; x < 156; x++) hole[y * 256 + x] = 0;
const withHole = S.brushSelection(W, H, new Map([[0, hole]]), base);
const feathered = S.featherSelection(withHole, 4);
assert.equal(feathered.data.__virtual, true);
assert.equal(S.selectionValueAt(feathered, 500, 500), 255);
assert.equal(S.selectionValueAt(feathered, 128, 128), 0);
assert.ok(S.selectionArea(feathered) < S.selectionArea(withHole));
const smoothed = S.smoothSelection(withHole, 2);
assert.equal(smoothed.data.__virtual, true);
assert.equal(S.selectionValueAt(smoothed, 500, 500), 255);
const expanded = S.expandSelection(withHole, 4);
assert.equal(expanded.data.__virtual, true);
assert.equal(S.selectionValueAt(expanded, 500, 500), 255);
assert.ok(S.selectionArea(expanded) > S.selectionArea(withHole));
let contractionBlocked = false;
try { S.contractSelection(withHole, 4); } catch { contractionBlocked = true; }
assert.equal(contractionBlocked, true);
const pureContract = S.contractSelection(S.brushSelection(W, H, new Map([[0, hole.map(v => v ? 255 : 0)]]), null), 4);
assert.equal(pureContract.data.__virtual, true);
assert.equal(S.selectionValueAt(pureContract, 128, 128), 0);


const bigW = 7000, bigH = 7000;
const bigEllipse = S.ellipseSelection(bigW, bigH, 200, 200, 6600, 6600);
assert.equal(bigEllipse.data.__virtual, true);
assert.ok(bigEllipse.data.__tiles.size > 0);
const bigFeather = S.featherSelection(bigEllipse, 6);
assert.equal(bigFeather.data.__virtual, true);
assert.equal(S.selectionValueAt(bigFeather, 3500, 3500), 255);
assert.equal(S.selectionValueAt(bigFeather, 0, 0), 0);
assert.ok(S.selectionValueAt(bigFeather, 200, 3500) > 0 && S.selectionValueAt(bigFeather, 200, 3500) < 255);
const bigSmooth = S.smoothSelection(bigEllipse, 8);
assert.equal(bigSmooth.data.__virtual, true);
assert.equal(S.selectionValueAt(bigSmooth, 3500, 3500), 255);
const bigExpand = S.expandSelection(bigEllipse, 5);
assert.ok(S.selectionArea(bigExpand) > S.selectionArea(bigEllipse));
const bigContract = S.contractSelection(bigEllipse, 5);
assert.ok(S.selectionArea(bigContract) < S.selectionArea(bigEllipse));
const bigCut = S.combineSelection(bigEllipse, S.rectSelection(bigW, bigH, 1000, 1000, 1000, 1000), 'subtract');
assert.equal(bigCut.data.__virtual, true);
assert.equal(S.selectionValueAt(bigCut, 1500, 1500), 0);
assert.equal(S.selectionValueAt(bigCut, 4000, 4000), 255);

console.log('✓ 选区画笔稀疏覆盖、布尔运算、羽化/平滑/扩展与取反');
