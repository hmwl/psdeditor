

























import { virtualArray } from './sparse-pixels.js';



const SPARSE_MIN = 32e6;
const SEL_TILE = 256;





function coverageFromTiles(width, height, fill, tiles, base = null, neg = null, extra = null) {
  const cols = Math.ceil(width / SEL_TILE), TS = SEL_TILE;
  const slot = (i, create) => {
    const y = (i / width) | 0, x = i - y * width;
    const tx = (x / TS) | 0, ty = (y / TS) | 0, k = ty * cols + tx;
    let t = tiles.get(k);
    if (!t && create) { t = new Uint8Array(TS * TS).fill(fill); tiles.set(k, t); }
    return t ? { t, o: (y - ty * TS) * TS + (x - tx * TS) } : null;
  };
  return virtualArray(width * height,
    i => { const s = slot(i, false); return s ? s.t[s.o] : (base ? base(i) : fill); },
    (i, v) => { const s = slot(i, true); s.t[s.o] = v & 255; },




    { __virtual: true, __tiles: tiles, __fill: fill, __base: base, __neg: neg,
      __tileSize: TS, __width: width, __height: height, ...(extra || {}) });
}






const isSparseSel = d => !!(d && d.__virtual);


function tileExtent(width, height, k, cols) {
  const tx = k % cols, ty = (k / cols) | 0;
  return {
    x: tx * SEL_TILE, y: ty * SEL_TILE,
    w: Math.min(SEL_TILE, width - tx * SEL_TILE),
    h: Math.min(SEL_TILE, height - ty * SEL_TILE),
  };
}
function makeCoverage(width, height, fill = 0) { return coverageFromTiles(width, height, fill, new Map()); }


function assertDoc(docW, docH) {
  if (!Number.isInteger(docW) || !Number.isInteger(docH) || docW <= 0 || docH <= 0)
    throw new RangeError(`文档尺寸非法：${docW}×${docH}（必须是正整数）`);
}


function selData(sel) {
  const d = sel.data;
  if (d instanceof Uint8Array) return d;
  if (d instanceof Uint8ClampedArray) return new Uint8Array(d.buffer, d.byteOffset, d.length);


  if (d && d.__virtual) return d;
  return Uint8Array.from(d || []);
}


function assertSel(sel, name = 'sel') {
  if (!sel || typeof sel !== 'object')
    throw new TypeError(`${name} 必须是选区对象 { x, y, width, height, data, docW, docH }，收到 ${JSON.stringify(sel)}`);
  const { x, y, width, height } = sel;
  for (const [k, v] of [['x', x], ['y', y], ['width', width], ['height', height]])
    if (!Number.isInteger(v)) throw new TypeError(`${name}.${k} 必须是整数，收到 ${JSON.stringify(v)}`);
  if (width < 0 || height < 0) throw new RangeError(`${name} 尺寸非法：${width}×${height}`);
  assertDoc(sel.docW, sel.docH);
  if (width > 0 && height > 0) {
    const d = selData(sel);
    if (d.length !== width * height)
      throw new RangeError(`${name}.data 长度 ${d.length} ≠ ${width}×${height} = ${width * height}`);
  }
  return sel;
}


export function emptySelection(docW, docH) {
  assertDoc(docW, docH);
  return { x: 0, y: 0, width: 0, height: 0, data: new Uint8Array(0), docW, docH };
}


export function createSelection(docW, docH, x, y, width, height, data) {
  assertDoc(docW, docH);
  if (width <= 0 || height <= 0) return emptySelection(docW, docH);
  const n = width * height;
  const out = new Uint8Array(n);
  if (data) {
    if (data.length !== n) throw new RangeError(`data 长度 ${data.length} ≠ ${width}×${height} = ${n}`);
    out.set(data);
  }
  return { x: x | 0, y: y | 0, width: width | 0, height: height | 0, data: out, docW, docH };
}





export function brushSelection(docW, docH, tiles, base = null) {
  assertDoc(docW, docH);
  if (base) assertSel(base);
  const cols = Math.ceil(docW / SEL_TILE), map = new Map();
  for (const [key, t] of tiles || []) {
    let tx, ty;
    if (typeof key === 'number') { tx = key % cols; ty = (key / cols) | 0; }
    else { const p = String(key).split(':'); tx = +p[0]; ty = +p[1]; }
    if (!(tx >= 0 && ty >= 0 && tx * SEL_TILE < docW && ty * SEL_TILE < docH)) continue;
    if (!t || t.length !== SEL_TILE * SEL_TILE) continue;
    map.set(ty * cols + tx, t);
  }
  const b = base && base.width > 0 && base.height > 0 ? base : null;
  if (!map.size && !b) return emptySelection(docW, docH);
  let baseFn = null;
  if (b) {
    const bd = selData(b), bx = b.x, by = b.y, bw = b.width, bh = b.height;
    baseFn = i => {
      const y = (i / docW) | 0, x = i - y * docW, si = x - bx, sj = y - by;
      return si < 0 || sj < 0 || si >= bw || sj >= bh ? 0 : bd[sj * bw + si];
    };
  }
  return {
    x: 0, y: 0, width: docW, height: docH, docW, docH,
    data: coverageFromTiles(docW, docH, 0, map, baseFn, null, { __brushBase: b }),
  };
}


export function cloneSelection(sel) {
  assertSel(sel);
  const d = sel.data;


  if (d && d.__virtual) {
    if (d.__brushBase) {
      const tiles = new Map();
      for (const [k, t] of d.__tiles) tiles.set(k, Uint8Array.from(t));
      return { x: sel.x, y: sel.y, width: sel.width, height: sel.height,
        data: coverageFromTiles(sel.width, sel.height, d.__fill, tiles, d.__base, null, { __brushBase: d.__brushBase }), docW: sel.docW, docH: sel.docH };
    }
    if (d.__base) return { x: sel.x, y: sel.y, width: sel.width, height: sel.height, data: d, docW: sel.docW, docH: sel.docH };
    const tiles = new Map();
    for (const [k, t] of d.__tiles) tiles.set(k, Uint8Array.from(t));
    return { x: sel.x, y: sel.y, width: sel.width, height: sel.height,
      data: coverageFromTiles(sel.width, sel.height, d.__fill, tiles), docW: sel.docW, docH: sel.docH };
  }
  return {
    x: sel.x, y: sel.y, width: sel.width, height: sel.height,
    data: Uint8Array.from(selData(sel)), docW: sel.docW, docH: sel.docH,
  };
}


export function isEmptySelection(sel) {
  assertSel(sel);
  if (sel.width === 0 || sel.height === 0) return true;
  const d = selData(sel);
  if (isSparseSel(d)) {
    if (d.__neg) return selectionArea(sel) === 0;
    if (d.__brushBase) return selectionArea(sel) === 0;
    if (!d.__tiles.size) return !d.__fill;
    if (d.__fill) return false;
    for (const t of d.__tiles.values()) for (let i = 0; i < t.length; i++) if (t[i]) return false;
    return true;
  }
  for (let i = 0; i < d.length; i++) if (d[i] !== 0) return false;
  return true;
}


export function selectionValueAt(sel, x, y) {
  assertSel(sel);
  const i = x - sel.x, j = y - sel.y;
  if (i < 0 || j < 0 || i >= sel.width || j >= sel.height) return 0;
  return selData(sel)[j * sel.width + i];
}


export function selectionArea(sel) {
  assertSel(sel);
  const d = selData(sel);
  if (isSparseSel(d)) {

    if (d.__neg) return d.__neg.docW * d.__neg.docH - selectionArea(d.__neg.src);
    const { width: w, height: h } = sel, cols = Math.ceil(w / SEL_TILE);
    if (d.__brushBase) {
      let sum = selectionArea(d.__brushBase) * 255;
      for (const [k, t] of d.__tiles) {
        const e = tileExtent(w, h, k, cols);
        for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) {
          const di = (e.y + y) * w + e.x + x;
          sum += t[y * SEL_TILE + x] - (d.__base ? d.__base(di) : 0);
        }
      }
      return sum / 255;
    }
    let sum = w * h * d.__fill;
    for (const [k, t] of d.__tiles) {
      const e = tileExtent(w, h, k, cols);
      let s = 0;
      for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) s += t[y * SEL_TILE + x];
      sum += s - e.w * e.h * d.__fill;
    }
    return sum / 255;
  }
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i];
  return sum / 255;
}




export function selectionBounds(sel) {
  assertSel(sel);
  const box = tightBox(sel);
  if (!box) return null;
  return { x: sel.x + box.i0, y: sel.y + box.j0, width: box.i1 - box.i0 + 1, height: box.j1 - box.j0 + 1 };
}


function tightBox(sel) {
  const { width: w, height: h } = sel;
  if (w === 0 || h === 0) return null;
  const d = selData(sel);
  if (isSparseSel(d)) {
    if (d.__neg) return selectionArea(sel) === 0 ? null : { i0: 0, i1: w - 1, j0: 0, j1: h - 1 };


    if (d.__brushBase) {
      let i0 = w, i1 = -1, j0 = h, j1 = -1;
      const bb = selectionBounds(d.__brushBase);
      if (bb) { i0 = bb.x; i1 = bb.x + bb.width - 1; j0 = bb.y; j1 = bb.y + bb.height - 1; }
      const cols = Math.ceil(w / SEL_TILE);
      for (const [k, t] of d.__tiles) {
        const e = tileExtent(w, h, k, cols);
        for (let y = 0; y < e.h; y++) {
          const row = y * SEL_TILE, gy = e.y + y;
          let l = -1, r = -1;
          for (let x = 0; x < e.w; x++) if (t[row + x]) { l = x; break; }
          if (l < 0) continue;
          for (let x = e.w - 1; x >= l; x--) if (t[row + x]) { r = x; break; }
          if (j0 < 0 || gy < j0) j0 = gy;
          if (gy > j1) j1 = gy;
          if (e.x + l < i0) i0 = e.x + l;
          if (e.x + r > i1) i1 = e.x + r;
        }
      }
      return i1 < 0 ? null : { i0, i1, j0, j1 };
    }

    if (d.__fill) return { i0: 0, i1: w - 1, j0: 0, j1: h - 1 };
    const cols = Math.ceil(w / SEL_TILE);
    let i0 = w, i1 = -1, j0 = -1, j1 = -1;
    for (const [k, t] of d.__tiles) {
      const e = tileExtent(w, h, k, cols);
      for (let y = 0; y < e.h; y++) {
        const row = y * SEL_TILE, gy = e.y + y;
        let l = -1;
        for (let x = 0; x < e.w; x++) if (t[row + x]) { l = x; break; }
        if (l < 0) continue;
        let r = e.w - 1;
        while (r > l && !t[row + r]) r--;
        if (j0 < 0 || gy < j0) j0 = gy;
        if (gy > j1) j1 = gy;
        if (e.x + l < i0) i0 = e.x + l;
        if (e.x + r > i1) i1 = e.x + r;
      }
    }
    return i1 < 0 ? null : { i0, i1, j0, j1 };
  }
  let i0 = w, i1 = -1, j0 = -1, j1 = -1;
  for (let j = 0; j < h; j++) {
    const row = j * w;
    let l = -1;
    for (let i = 0; i < w; i++) if (d[row + i] !== 0) { l = i; break; }   
    if (l < 0) continue;
    let r = w - 1;
    while (d[row + r] === 0) r--;                                        
    if (j0 < 0) j0 = j;
    j1 = j;
    if (l < i0) i0 = l;
    if (r > i1) i1 = r;
  }
  return j1 < 0 ? null : { i0, i1, j0, j1 };
}







export function trimSelection(sel) {
  assertSel(sel);


  if (sel.data && sel.data.__virtual)
    return { x: sel.x, y: sel.y, width: sel.width, height: sel.height, data: sel.data, docW: sel.docW, docH: sel.docH };
  const box = tightBox(sel);
  if (!box) return emptySelection(sel.docW, sel.docH);
  const { i0, i1, j0, j1 } = box;
  const nw = i1 - i0 + 1, nh = j1 - j0 + 1;
  if (nw === sel.width && nh === sel.height) return cloneSelection(sel);  
  const src = selData(sel), out = new Uint8Array(nw * nh);
  for (let j = 0; j < nh; j++) out.set(src.subarray((j0 + j) * sel.width + i0, (j0 + j) * sel.width + i0 + nw), j * nw);
  return { x: sel.x + i0, y: sel.y + j0, width: nw, height: nh, data: out, docW: sel.docW, docH: sel.docH };
}






export function growSelectionBounds(sel, rect) {
  assertSel(sel);
  const { docW, docH } = sel;
  let x0 = 0, y0 = 0, x1 = docW, y1 = docH;
  if (rect) {
    const r = normRect(rect);
    x0 = r.x; y0 = r.y; x1 = r.x + r.width; y1 = r.y + r.height;
  }
  x0 = Math.max(0, Math.min(docW, Math.floor(x0)));
  y0 = Math.max(0, Math.min(docH, Math.floor(y0)));
  x1 = Math.max(x0, Math.min(docW, Math.ceil(x1)));
  y1 = Math.max(y0, Math.min(docH, Math.ceil(y1)));
  const w = x1 - x0, h = y1 - y0;
  if (w === 0 || h === 0) return emptySelection(docW, docH);
  const out = new Uint8Array(w * h);
  blitInto(out, w, h, x0, y0, sel);
  return { x: x0, y: y0, width: w, height: h, data: out, docW, docH };
}


function blitInto(out, w, h, ox, oy, sel) {
  if (sel.width === 0 || sel.height === 0) return;
  const src = selData(sel);
  const i0 = Math.max(0, sel.x - ox), i1 = Math.min(w, sel.x + sel.width - ox);
  const j0 = Math.max(0, sel.y - oy), j1 = Math.min(h, sel.y + sel.height - oy);


  if (isSparseSel(src) && !src.__tiles.size && !src.__base) {
    if (!src.__fill) return;
    for (let j = j0; j < j1; j++) out.fill(src.__fill, j * w + i0, j * w + i1);
    return;
  }
  for (let j = j0; j < j1; j++) {
    const sj = (j + oy - sel.y) * sel.width - sel.x + ox;
    out.set(src.subarray(sj + i0, sj + i1), j * w + i0);
  }
}


function normRect(rect) {
  if (!rect || typeof rect !== 'object') throw new TypeError('矩形必须是 { x, y, width, height } 或 { left, top, right, bottom }');
  if (rect.width !== undefined || rect.height !== undefined)
    return { x: rect.x | 0, y: rect.y | 0, width: Math.max(0, rect.width | 0), height: Math.max(0, rect.height | 0) };
  if (rect.left !== undefined && rect.top !== undefined && rect.right !== undefined && rect.bottom !== undefined)
    return { x: rect.left | 0, y: rect.top | 0, width: Math.max(0, (rect.right - rect.left) | 0), height: Math.max(0, (rect.bottom - rect.top) | 0) };
  throw new TypeError('矩形必须是 { x, y, width, height } 或 { left, top, right, bottom }');
}


function quantize(acc, antialias) {
  const out = new Uint8Array(acc.length);
  if (antialias === false) {
    for (let i = 0; i < acc.length; i++) out[i] = acc[i] >= 0.5 ? 255 : 0;
  } else {
    for (let i = 0; i < acc.length; i++) {
      const v = Math.round(acc[i] * 255);
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}



function addSpan(acc, bx, bw, sx, ex, weight) {
  let s = sx < bx ? bx : sx;
  const e = ex > bx + bw ? bx + bw : ex;
  if (e <= s) return;
  let i = Math.floor(s - bx);
  if (i < 0) i = 0;
  for (; i < bw; i++) {
    const pl = bx + i, pr = pl + 1;
    if (pl >= e) break;
    const l = s > pl ? s : pl, r = e < pr ? e : pr;
    if (r > l) acc[i] += (r - l) * weight;
  }
}

















export function rectSelection(docW, docH, x, y, w, h, opts = {}) {
  assertDoc(docW, docH);
  const { feather = 0, antialias = true } = opts;
  let x0 = +x, y0 = +y, x1 = +x + +w, y1 = +y + +h;
  if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
  if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(docW, x1); y1 = Math.min(docH, y1);
  if (!(x1 > x0) || !(y1 > y0)) return emptySelection(docW, docH);

  const bx = Math.floor(x0), by = Math.floor(y0);
  const bw = Math.ceil(x1) - bx, bh = Math.ceil(y1) - by;
  
  if (feather > 0 && bw * bh > SPARSE_MIN)
    return featherSelection(rectSelection(docW, docH, x, y, w, h, { antialias }), feather);


  const wholePixels = x0 === bx && y0 === by && x1 === bx + bw && y1 === by + bh;
  if (!feather && wholePixels && bw * bh > SPARSE_MIN)
    return { x: bx, y: by, width: bw, height: bh, data: makeCoverage(bw, bh, 255), docW, docH };

  const covX = new Float64Array(bw), covY = new Float64Array(bh);
  for (let i = 0; i < bw; i++) covX[i] = Math.max(0, Math.min(x1, bx + i + 1) - Math.max(x0, bx + i));
  for (let j = 0; j < bh; j++) covY[j] = Math.max(0, Math.min(y1, by + j + 1) - Math.max(y0, by + j));


  if (!feather && bw * bh > SPARSE_MIN) {
    const cols = Math.ceil(bw / SEL_TILE), tiles = new Map();
    for (let ty = 0; ty < bh; ty += SEL_TILE) {
      const ty1 = Math.min(bh, ty + SEL_TILE);
      const edgeY = covY[ty] < 1 - 1e-9 || covY[ty1 - 1] < 1 - 1e-9;
      for (let tx = 0; tx < bw; tx += SEL_TILE) {
        const tx1 = Math.min(bw, tx + SEL_TILE);
        const edgeX = covX[tx] < 1 - 1e-9 || covX[tx1 - 1] < 1 - 1e-9;
        if (!edgeX && !edgeY) continue;
        const t = new Uint8Array(SEL_TILE * SEL_TILE);
        for (let y = ty; y < ty1; y++) {
          const cy = covY[y];
          for (let x = tx; x < tx1; x++) {
            const v = covX[x] * cy;
            t[(y - ty) * SEL_TILE + (x - tx)] = antialias === false ? (v >= 0.5 ? 255 : 0) : Math.round(v * 255);
          }
        }
        tiles.set(((ty / SEL_TILE) | 0) * cols + ((tx / SEL_TILE) | 0), t);
      }
    }
    return { x: bx, y: by, width: bw, height: bh, data: coverageFromTiles(bw, bh, 255, tiles), docW, docH };
  }
  const acc = new Float64Array(bw * bh);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) acc[j * bw + i] = covX[i] * covY[j];

  return finishShape({ x: bx, y: by, width: bw, height: bh, data: quantize(acc, antialias), docW, docH }, feather);
}










export function ellipseSelection(docW, docH, x, y, w, h, opts = {}) {
  assertDoc(docW, docH);
  const { feather = 0, antialias = true } = opts;
  let x0 = +x, y0 = +y, x1 = +x + +w, y1 = +y + +h;
  if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
  if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  if (!(rx > 0) || !(ry > 0)) return emptySelection(docW, docH);
  const cx = x0 + rx, cy = y0 + ry;

  const bx = Math.max(0, Math.floor(x0)), by = Math.max(0, Math.floor(y0));
  const bw = Math.min(docW, Math.ceil(x1)) - bx, bh = Math.min(docH, Math.ceil(y1)) - by;
  if (bw <= 0 || bh <= 0) return emptySelection(docW, docH);


  if (bw * bh > SPARSE_MIN) {
    const cols = Math.ceil(bw / SEL_TILE), tiles = new Map();
    const tileAt = (tx, ty) => {
      const k = ty * cols + tx;
      let t = tiles.get(k);
      if (!t) { t = new Uint8Array(SEL_TILE * SEL_TILE); tiles.set(k, t); }
      return t;
    };
    const fillRow = (j, a, b, v) => {
      a = Math.max(0, Math.ceil(a)); b = Math.min(bw, Math.floor(b));
      if (b <= a) return;
      const ty = (j / SEL_TILE) | 0, off = (j - ty * SEL_TILE) * SEL_TILE;
      for (let tx = (a / SEL_TILE) | 0; tx * SEL_TILE < b; tx++) {
        const t = tileAt(tx, ty);
        t.fill(v, off + Math.max(a, tx * SEL_TILE) - tx * SEL_TILE, off + Math.min(b, (tx + 1) * SEL_TILE) - tx * SEL_TILE);
      }
    };
    const setPixel = (j, i, v) => {
      const ty = (j / SEL_TILE) | 0, tx = (i / SEL_TILE) | 0;
      tileAt(tx, ty)[(j - ty * SEL_TILE) * SEL_TILE + (i - tx * SEL_TILE)] = v;
    };
    const N2 = 8, inv2 = 1 / N2, hw2 = new Float64Array(N2);
    for (let j = 0; j < bh; j++) {
      const py = by + j;
      let hwMin = Infinity, hwMax = 0;
      for (let k = 0; k < N2; k++) {
        const yy = py + (k + 0.5) * inv2;
        const t = (yy - cy) / ry;
        hw2[k] = t * t >= 1 ? 0 : rx * Math.sqrt(1 - t * t);
        if (hw2[k] < hwMin) hwMin = hw2[k];
        if (hw2[k] > hwMax) hwMax = hw2[k];
      }
      if (hwMax <= 0) continue;
      const fullA = Math.max(0, Math.ceil(cx - hwMin - bx)), fullB = Math.min(bw, Math.floor(cx + hwMin - bx));
      fillRow(j, fullA, fullB, 255);
      const edgeA = Math.max(0, Math.floor(cx - hwMax - bx)), edgeB = Math.min(bw, Math.ceil(cx + hwMax - bx));
      for (let i = edgeA; i < edgeB; i++) {
        if (i >= fullA && i < fullB) continue;
        const pl = bx + i, pr = pl + 1;
        let s = 0;
        for (let k = 0; k < N2; k++) {
          const l = Math.max(cx - hw2[k], pl), r = Math.min(cx + hw2[k], pr);
          if (r > l) s += r - l;
        }
        const v = s * inv2;
        const q = antialias === false ? (v >= 0.5 ? 255 : 0) : Math.round(v * 255);
        if (q) setPixel(j, i, q);
      }
    }
    const out = { x: bx, y: by, width: bw, height: bh, data: coverageFromTiles(bw, bh, 0, tiles), docW, docH };
    return feather > 0 ? featherSelection(out, feather) : out;
  }

  const N = 8, inv = 1 / N;
  const acc = new Float64Array(bw * bh);
  const hw = new Float64Array(N);
  for (let j = 0; j < bh; j++) {
    const py = by + j;
    let hwMin = Infinity, hwMax = 0;
    for (let k = 0; k < N; k++) {
      const yy = py + (k + 0.5) * inv;
      const t = (yy - cy) / ry;
      hw[k] = t * t >= 1 ? 0 : rx * Math.sqrt(1 - t * t);
      if (hw[k] < hwMin) hwMin = hw[k];
      if (hw[k] > hwMax) hwMax = hw[k];
    }
    if (hwMax <= 0) continue;                          
    const row = j * bw;
    const innerL = cx - hwMin, innerR = cx + hwMin;
    const outerL = cx - hwMax, outerR = cx + hwMax;
    
    const fullA = Math.max(0, Math.ceil(innerL - bx)), fullB = Math.min(bw, Math.floor(innerR - bx));
    for (let i = fullA; i < fullB; i++) acc[row + i] = 1;
    
    const edgeA = Math.max(0, Math.floor(outerL - bx)), edgeB = Math.min(bw, Math.ceil(outerR - bx));
    for (let i = edgeA; i < edgeB; i++) {
      if (i >= fullA && i < fullB) continue;
      const pl = bx + i, pr = pl + 1;
      let s = 0;
      for (let k = 0; k < N; k++) {
        const l = Math.max(cx - hw[k], pl), r = Math.min(cx + hw[k], pr);
        if (r > l) s += r - l;
      }
      acc[row + i] = s * inv;
    }
  }
  return finishShape({ x: bx, y: by, width: bw, height: bh, data: quantize(acc, antialias), docW, docH }, feather);
}








export function lassoSelection(docW, docH, points, opts = {}) {
  assertDoc(docW, docH);
  const { feather = 0, antialias = true } = opts;
  const pts = flattenPoints(points);
  const np = pts.length / 2;
  if (np < 3) return emptySelection(docW, docH);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < np; i++) {
    const px = pts[i * 2], py = pts[i * 2 + 1];
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  const bx = Math.max(0, Math.floor(minX)), by = Math.max(0, Math.floor(minY));
  const bw = Math.min(docW, Math.ceil(maxX)) - bx, bh = Math.min(docH, Math.ceil(maxY)) - by;
  if (bw <= 0 || bh <= 0) return emptySelection(docW, docH);

  if (bw * bh > SPARSE_MIN) {
    const cols = Math.ceil(bw / SEL_TILE), tiles = new Map();
    const tileAt = (tx, ty) => {
      const k = ty * cols + tx;
      let t = tiles.get(k);
      if (!t) { t = new Uint8Array(SEL_TILE * SEL_TILE); tiles.set(k, t); }
      return t;
    };
    const N2 = 8, inv2 = 1 / N2, rowAcc = new Float64Array(bw);
    const xs2 = new Float64Array(np), dirs2 = new Int8Array(np), idx2 = new Int32Array(np);
    let any = false;
    for (let j = 0; j < bh; j++) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < N2; k++) {
        const sy = by + j + (k + 0.5) * inv2;
        let n = 0;
        for (let e = 0; e < np; e++) {
          const ax = pts[e * 2], ay = pts[e * 2 + 1];
          const f = (e + 1) % np;
          const bx2 = pts[f * 2], by2 = pts[f * 2 + 1];
          if ((ay <= sy) === (by2 <= sy)) continue;
          xs2[n] = ax + (sy - ay) / (by2 - ay) * (bx2 - ax);
          dirs2[n] = by2 > ay ? 1 : -1;
          idx2[n] = n; n++;
        }
        if (n < 2) continue;
        const order = Array.prototype.slice.call(idx2, 0, n).sort((a, b) => xs2[a] - xs2[b]);
        let wind = 0;
        for (let m = 0; m < n - 1; m++) {
          wind += dirs2[order[m]];
          if (wind === 0) continue;
          const s = xs2[order[m]], e = xs2[order[m + 1]];
          if (e <= bx || s >= bx + bw) continue;
          addSpan(rowAcc, bx, bw, s, e, inv2);
          if (s < lo) lo = s; if (e > hi) hi = e;
        }
      }
      if (!(hi > lo)) continue;
      const i0 = Math.max(0, Math.floor(lo - bx)), i1 = Math.min(bw, Math.ceil(hi - bx));
      const ty = (j / SEL_TILE) | 0, off = (j - ty * SEL_TILE) * SEL_TILE;
      for (let i = i0; i < i1;) {
        const tx = (i / SEL_TILE) | 0, t = tileAt(tx, ty), end = Math.min(i1, (tx + 1) * SEL_TILE);
        for (let lx = i - tx * SEL_TILE; i < end; i++, lx++) {
          const v = antialias === false ? (rowAcc[i] >= 0.5 ? 255 : 0) : Math.round(rowAcc[i] * 255);
          if (v) { t[off + lx] = v; any = true; }
        }
      }
      rowAcc.fill(0, i0, i1);
    }
    if (!any) return emptySelection(docW, docH);
    const out = { x: bx, y: by, width: bw, height: bh, data: coverageFromTiles(bw, bh, 0, tiles), docW, docH };
    return feather > 0 ? featherSelection(out, feather) : out;
  }

  const N = 8, inv = 1 / N;
  const acc = new Float64Array(bw * bh);
  const xs = new Float64Array(np), dirs = new Int8Array(np), idx = new Int32Array(np);
  for (let j = 0; j < bh; j++) {
    const row = j * bw;
    const rowAcc = acc.subarray(row, row + bw);
    for (let k = 0; k < N; k++) {
      const sy = by + j + (k + 0.5) * inv;
      
      let n = 0;
      for (let e = 0; e < np; e++) {
        const ax = pts[e * 2], ay = pts[e * 2 + 1];
        const f = (e + 1) % np;
        const bx2 = pts[f * 2], by2 = pts[f * 2 + 1];
        if ((ay <= sy) === (by2 <= sy)) continue;
        xs[n] = ax + (sy - ay) / (by2 - ay) * (bx2 - ax);
        dirs[n] = by2 > ay ? 1 : -1;
        idx[n] = n; n++;
      }
      if (n < 2) continue;
      const order = Array.prototype.slice.call(idx, 0, n).sort((a, b) => xs[a] - xs[b]);
      let wind = 0;
      for (let m = 0; m < n - 1; m++) {
        wind += dirs[order[m]];
        if (wind !== 0) addSpan(rowAcc, bx, bw, xs[order[m]], xs[order[m + 1]], inv);
      }
    }
  }
  return finishShape({ x: bx, y: by, width: bw, height: bh, data: quantize(acc, antialias), docW, docH }, feather);
}


function flattenPoints(points) {
  if (!points || typeof points.length !== 'number') throw new TypeError('points 必须是 [x0,y0,…] 或 [{x,y},…]');
  if (points.length === 0) return new Float64Array(0);
  if (typeof points[0] === 'object' && points[0] !== null) {
    const out = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) { out[i * 2] = +points[i].x; out[i * 2 + 1] = +points[i].y; }
    return out;
  }
  if (points.length % 2) throw new RangeError(`扁平点集长度必须是偶数，收到 ${points.length}`);
  return Float64Array.from(points, Number);
}


function finishShape(sel, feather) {
  const trimmed = trimSelection(sel);
  return feather > 0 ? featherSelection(trimmed, feather) : trimmed;
}






























export function magicWandSelection(rgba, docW, docH, seedX, seedY, opts = {}) {
  assertDoc(docW, docH);
  const { contiguous = true, antialias = true, sampleMerged } = opts;
  let px = rgba && rgba.data && typeof rgba.length !== 'number' ? rgba.data : rgba;
  if (sampleMerged && typeof sampleMerged !== 'boolean') px = sampleMerged.data || sampleMerged;
  if (!px || typeof px.length !== 'number')
    throw new TypeError('rgba 必须是 RGBA 字节数组（Uint8Array / Uint8ClampedArray）或 { data, width, height }');
  const n = docW * docH;
  if (px.length < n * 4) throw new RangeError(`RGBA 长度 ${px.length} < ${docW}×${docH}×4 = ${n * 4}`);
  if (!Number.isInteger(seedX) || !Number.isInteger(seedY) || seedX < 0 || seedY < 0 || seedX >= docW || seedY >= docH)
    throw new RangeError(`取样点 (${seedX}, ${seedY}) 不在画布 ${docW}×${docH} 内`);

  let tol = Number.isFinite(opts.tolerance) ? opts.tolerance : 32;
  tol = Math.max(0, Math.min(255, tol));
  let soft = antialias === false ? 0 : (Number.isFinite(opts.softness) ? Math.max(0, opts.softness) : Math.max(1, tol / 2));
  const tOut = tol + soft;

  const si = (seedY * docW + seedX) * 4;
  

  const sc = Array.isArray(opts.sampleColor) || ArrayBuffer.isView(opts.sampleColor) ? opts.sampleColor : null;
  const sr = sc ? sc[0] : px[si], sg = sc ? sc[1] : px[si + 1], sb = sc ? sc[2] : px[si + 2], sa = sc ? (sc[3] ?? 255) : px[si + 3];
  
  const dist = (i4) => {
    const a = px[i4 + 3];
    if (a === 0 && sa === 0) return 0;
    let d = Math.abs(px[i4] - sr);
    const g = Math.abs(px[i4 + 1] - sg); if (g > d) d = g;
    const b = Math.abs(px[i4 + 2] - sb); if (b > d) d = b;
    const al = Math.abs(a - sa); if (al > d) d = al;
    return d;
  };
  
  const cov = (d) => d <= tol ? 255 : (d >= tOut ? 0 : Math.round(255 * (tOut - d) / (tOut - tol)));

  const out = new Uint8Array(n);
  if (!contiguous) {
    

    for (let i = 0; i < n; i++) if (dist(i * 4) <= tol) out[i] = 255;
    if (soft > 0) {
      for (let i = 0; i < n; i++) {
        if (out[i]) continue;
        const y = (i / docW) | 0, x = i - y * docW;
        if (!((x > 0 && out[i - 1] === 255) || (x < docW - 1 && out[i + 1] === 255)
          || (y > 0 && out[i - docW] === 255) || (y < docH - 1 && out[i + docW] === 255))) continue;
        const v = cov(dist(i * 4)); if (v && v < 255) out[i] = v;
      }
    }
    return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
  }

  
  const seen = new Uint8Array(n);
  let stack = new Int32Array(1024), top = 0;
  const push = (i) => {
    if (top === stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; }
    stack[top++] = i;
  };
  const seed = seedY * docW + seedX;
  seen[seed] = 1; out[seed] = 255; push(seed);
  while (top > 0) {
    const i = stack[--top];
    const y = (i / docW) | 0, x = i - y * docW;
    
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
      const ni = ny * docW + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      const d = dist(ni * 4);
      if (d <= tol) { out[ni] = 255; push(ni); }
      else if (d < tOut) out[ni] = cov(d);                 
    }
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}





export const SELECTION_MODES = ['replace', 'add', 'subtract', 'intersect', 'xor'];
















const SPARSE_COMBINE_MAX = 64e6;

function fullDoc255(sel, docW, docH) {
  if (!sel || sel.x !== 0 || sel.y !== 0 || sel.width !== docW || sel.height !== docH) return false;
  const d = sel.data;
  return !!(isSparseSel(d) && !d.__tiles.size && !d.__base && !d.__neg && (d.__fill | 0) === 255);
}


function combineSmallB(A, B, mode, docW, docH) {
  if (!(B.width > 0 && B.height > 0) || B.width * B.height > SPARSE_COMBINE_MAX) return null;
  const ax = A.x, ay = A.y, aw = A.width, ah = A.height, ad = selData(A);
  const bx = B.x, by = B.y, bw = B.width, bh = B.height, bd = selData(B);
  const av = (x, y) => { const i = x - ax, j = y - ay; return i < 0 || j < 0 || i >= aw || j >= ah ? 0 : ad[j * aw + i]; };
  const bv = (x, y) => { const i = x - bx, j = y - by; return i < 0 || j < 0 || i >= bw || j >= bh ? 0 : bd[j * bw + i]; };
  const cols = Math.ceil(docW / SEL_TILE), tiles = new Map();
  const tx0 = Math.max(0, Math.floor(bx / SEL_TILE) * SEL_TILE), ty0 = Math.max(0, Math.floor(by / SEL_TILE) * SEL_TILE);
  const tx1 = Math.min(docW, Math.ceil((bx + bw) / SEL_TILE) * SEL_TILE), ty1 = Math.min(docH, Math.ceil((by + bh) / SEL_TILE) * SEL_TILE);
  for (let ty = ty0; ty < ty1; ty += SEL_TILE) for (let tx = tx0; tx < tx1; tx += SEL_TILE) {
    const t = new Uint8Array(SEL_TILE * SEL_TILE);
    for (let yy = 0; yy < SEL_TILE; yy++) {
      const gy = ty + yy; if (gy >= docH) break;
      for (let xx = 0; xx < SEL_TILE; xx++) {
        const gx = tx + xx; if (gx >= docW) break;
        const v = blendCoverage(av(gx, gy), bv(gx, gy), mode);
        t[yy * SEL_TILE + xx] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
    tiles.set(((ty / SEL_TILE) | 0) * cols + ((tx / SEL_TILE) | 0), t);
  }
  return brushSelection(docW, docH, tiles, mode === 'intersect' ? null : A);
}

export function combineSelection(a, b, mode = 'replace') {
  if (!SELECTION_MODES.includes(mode))
    throw new RangeError(`mode 只能是 ${SELECTION_MODES.map(m => `'${m}'`).join(' / ')}，收到 ${JSON.stringify(mode)}`);
  if (a) assertSel(a, 'a');
  if (b) assertSel(b, 'b');
  const docW = (a && a.docW) || (b && b.docW), docH = (a && a.docH) || (b && b.docH);
  if (!docW || !docH) throw new TypeError('combineSelection: a 和 b 至少要有一个是合法选区');
  if (a && b && (a.docW !== b.docW || a.docH !== b.docH))
    throw new RangeError(`两个选区的文档尺寸不一致：${a.docW}×${a.docH} vs ${b.docW}×${b.docH}`);
  const A = a || emptySelection(docW, docH), B = b || emptySelection(docW, docH);



  if (mode === 'replace') return trimSelection(cloneSelection(B));

  const aEmpty = isEmptySelection(A), bEmpty = isEmptySelection(B);
  if (aEmpty || bEmpty) {
    if (aEmpty) return mode === 'add' || mode === 'xor' ? trimSelection(cloneSelection(B)) : emptySelection(docW, docH);
    return mode === 'intersect' ? emptySelection(docW, docH) : trimSelection(cloneSelection(A));
  }
  const aFull = fullDoc255(A, docW, docH), bFull = fullDoc255(B, docW, docH);
  if (aFull || bFull) {
    if (aFull && bFull) return mode === 'subtract' || mode === 'xor' ? emptySelection(docW, docH) : cloneSelection(A);
    if (aFull) return mode === 'intersect' ? trimSelection(cloneSelection(B))
      : mode === 'subtract' || mode === 'xor' ? invertSelection(B) : cloneSelection(A);
    return mode === 'intersect' ? trimSelection(cloneSelection(A))
      : mode === 'subtract' ? emptySelection(docW, docH)
      : mode === 'xor' ? invertSelection(A) : cloneSelection(B);
  }

  const local = combineSmallB(A, B, mode, docW, docH);
  if (local) return local;

  const ra = { x: A.x, y: A.y, w: A.width, h: A.height };
  const rb = { x: B.x, y: B.y, w: B.width, h: B.height };
  let box;
  if (mode === 'subtract') box = ra;
  else if (mode === 'intersect') box = rectIntersect(ra, rb);
  else box = rectUnion(ra, rb);
  if (!box || box.w <= 0 || box.h <= 0) return emptySelection(docW, docH);

  
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
  const x1 = Math.min(docW, box.x + box.w), y1 = Math.min(docH, box.y + box.h);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return emptySelection(docW, docH);



  const va0 = uniformOver(A, x0, y0, w, h), vb0 = uniformOver(B, x0, y0, w, h);
  if (va0 >= 0 && vb0 >= 0) {
    const v = blendCoverage(va0, vb0, mode);
    return v ? { x: x0, y: y0, width: w, height: h, data: makeCoverage(w, h, v), docW, docH }
             : emptySelection(docW, docH);
  }


  if (w * h > 64e6) {
    const cols = Math.ceil(w / SEL_TILE), tiles = new Map();
    for (let ty = 0; ty < h; ty += SEL_TILE) for (let tx = 0; tx < w; tx += SEL_TILE) {
      const tw = Math.min(SEL_TILE, w - tx), th = Math.min(SEL_TILE, h - ty);
      const ba = blitSelRect(A, x0 + tx, y0 + ty, tw, th);
      const bb = blitSelRect(B, x0 + tx, y0 + ty, tw, th);
      const t = new Uint8Array(SEL_TILE * SEL_TILE);
      let any = false;
      for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++) {
        const i = yy * tw + xx, v = blendCoverage(ba[i], bb[i], mode);
        if (v) { t[yy * SEL_TILE + xx] = v; any = true; }
      }
      if (any) tiles.set(((ty / SEL_TILE) | 0) * cols + ((tx / SEL_TILE) | 0), t);
    }
    return trimSelection({ x: x0, y: y0, width: w, height: h, data: coverageFromTiles(w, h, 0, tiles), docW, docH });
  }
  const bufA = new Uint8Array(w * h), bufB = new Uint8Array(w * h);
  blitInto(bufA, w, h, x0, y0, A);
  blitInto(bufB, w, h, x0, y0, B);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = blendCoverage(bufA[i], bufB[i], mode);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return trimSelection({ x: x0, y: y0, width: w, height: h, data: out, docW, docH });
}


function blendCoverage(va, vb, mode) {
  let v;
  switch (mode) {
    case 'replace': v = vb; break;
    case 'add': v = va + vb - va * vb / 255; break;
    case 'intersect': v = va * vb / 255; break;
    case 'subtract': v = va * (255 - vb) / 255; break;
    default: v = va + vb - 2 * va * vb / 255; break;
  }
  v = Math.round(v);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}






function uniformOver(sel, x0, y0, w, h) {
  if (sel.width === 0 || sel.height === 0) return 0;
  const d = sel.data;
  if (!isSparseSel(d) || d.__tiles.size || d.__base) return -1;
  const inside = x0 >= sel.x && y0 >= sel.y && x0 + w <= sel.x + sel.width && y0 + h <= sel.y + sel.height;
  if (inside) return d.__fill | 0;
  const apart = x0 + w <= sel.x || y0 + h <= sel.y || x0 >= sel.x + sel.width || y0 >= sel.y + sel.height;
  return apart ? 0 : -1;
}

function rectUnion(p, q) {
  if (p.w <= 0 || p.h <= 0) return q;
  if (q.w <= 0 || q.h <= 0) return p;
  const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
  return { x, y, w: Math.max(p.x + p.w, q.x + q.w) - x, h: Math.max(p.y + p.h, q.y + q.h) - y };
}
function rectIntersect(p, q) {
  const x = Math.max(p.x, q.x), y = Math.max(p.y, q.y);
  return { x, y, w: Math.min(p.x + p.w, q.x + q.w) - x, h: Math.min(p.y + p.h, q.y + q.h) - y };
}






export function invertSelection(sel) {
  assertSel(sel);
  const { docW, docH } = sel;
  const src0 = sel.width > 0 && sel.height > 0 ? selData(sel) : null;
  const sparseSrc = isSparseSel(src0);


  if (sparseSrc || docW * docH > SPARSE_MIN) {

    const coversAll = sel.x === 0 && sel.y === 0 && sel.width === docW && sel.height === docH;
    if (sparseSrc && coversAll && !src0.__tiles.size && !src0.__base) {
      const v = 255 - (src0.__fill | 0);
      return v ? { x: 0, y: 0, width: docW, height: docH, data: makeCoverage(docW, docH, v), docW, docH }
               : emptySelection(docW, docH);
    }

    const src = src0;
    const base = (i) => {
      const y = (i / docW) | 0, x = i - y * docW;
      if (!src) return 255;
      const si = x - sel.x, sj = y - sel.y;
      if (si < 0 || sj < 0 || si >= sel.width || sj >= sel.height) return 255;
      return 255 - src[sj * sel.width + si];
    };
    return { x: 0, y: 0, width: docW, height: docH,
      data: coverageFromTiles(docW, docH, 255, new Map(), base, { src: sel, docW, docH }), docW, docH };
  }
  const out = new Uint8Array(docW * docH).fill(255);
  if (sel.width > 0 && sel.height > 0) {
    const src = selData(sel);
    const i0 = Math.max(0, -sel.x), i1 = Math.min(sel.width, docW - sel.x);
    const j0 = Math.max(0, -sel.y), j1 = Math.min(sel.height, docH - sel.y);
    for (let j = j0; j < j1; j++) {
      const so = j * sel.width, dofs = (sel.y + j) * docW + sel.x;
      for (let i = i0; i < i1; i++) out[dofs + i] = 255 - src[so + i];
    }
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}








function sparseSoftSelection(sel, pad, run) {
  const top = sel.data;
  if (!isSparseSel(top) || !top.__tiles.size) return undefined;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cur = sel, rootSel = sel, guard = 0;
  while (cur && guard++ < 32) {
    rootSel = cur;
    const d = cur.data; if (!isSparseSel(d)) return undefined;
    const cols = Math.ceil(cur.width / SEL_TILE);
    for (const [k, t] of d.__tiles) {
      const e = tileExtent(cur.width, cur.height, k, cols);
      const gx = cur.x + e.x, gy = cur.y + e.y;
      if (gx < x0) x0 = gx; if (gy < y0) y0 = gy;
      if (gx + e.w > x1) x1 = gx + e.w; if (gy + e.h > y1) y1 = gy + e.h;
    }
    cur = d.__brushBase || null;
  }
  if (!(x1 > x0 && y1 > y0)) return undefined;
  const root = rootSel, rd = root?.data;
  const fullRoot = !!root && root.x === 0 && root.y === 0 && root.width === sel.docW && root.height === sel.docH
    && isSparseSel(rd) && !rd.__tiles.size && !rd.__base && !rd.__neg && (rd.__fill | 0) === 255;
  const emptyRoot = !!root && isSparseSel(rd) && !rd.__base && !rd.__neg && (rd.__fill | 0) === 0;
  if (!fullRoot && !emptyRoot) return undefined;
  const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
  const cx1 = Math.min(sel.docW, x1 + pad), cy1 = Math.min(sel.docH, y1 + pad);
  const cw = cx1 - cx0, ch = cy1 - cy0;
  if (!(cw > 0 && ch > 0) || cw * ch > 32e6) return undefined;
  const reader = s => {
    const d = selData(s), sx = s.x, sy = s.y, sw = s.width, sh = s.height;
    return (x, y) => { const i = x - sx, j = y - sy; return i < 0 || j < 0 || i >= sw || j >= sh ? 0 : d[j * sw + i]; };
  };
  const orig = reader(sel), data = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) data[y * cw + x] = orig(cx0 + x, cy0 + y);
  const res = run({ x: cx0, y: cy0, width: cw, height: ch, data, docW: sel.docW, docH: sel.docH });
  if (!res) return emptySelection(sel.docW, sel.docH);
  const resAt = reader(res), cols = Math.ceil(sel.docW / SEL_TILE), tiles = new Map();
  for (let ty = Math.floor(cy0 / SEL_TILE) * SEL_TILE; ty < cy1; ty += SEL_TILE)
    for (let tx = Math.floor(cx0 / SEL_TILE) * SEL_TILE; tx < cx1; tx += SEL_TILE) {
      const t = new Uint8Array(SEL_TILE * SEL_TILE);
      for (let yy = 0; yy < SEL_TILE; yy++) {
        const gy = ty + yy; if (gy >= sel.docH) break;
        for (let xx = 0; xx < SEL_TILE; xx++) {
          const gx = tx + xx; if (gx >= sel.docW) break;
          t[yy * SEL_TILE + xx] = (gx >= cx0 && gx < cx1 && gy >= cy0 && gy < cy1) ? resAt(gx, gy) : orig(gx, gy);
        }
      }
      tiles.set(((ty / SEL_TILE) | 0) * cols + ((tx / SEL_TILE) | 0), t);
    }
  return brushSelection(sel.docW, sel.docH, tiles, sel);
}
function sparseRootInfo(sel) {
  let cur = sel, guard = 0;
  while (cur && guard++ < 32) {
    const d = cur.data; if (!isSparseSel(d)) return null;
    if (!d.__brushBase) {
      const full = !d.__tiles.size && !d.__base && !d.__neg && (d.__fill | 0) === 255
        && cur.x === 0 && cur.y === 0 && cur.width === sel.docW && cur.height === sel.docH;
      const empty = !d.__base && !d.__neg && (d.__fill | 0) === 0;
      return full ? { full: true } : empty ? { empty: true } : null;
    }
    cur = d.__brushBase;
  }
  return null;
}
function sparseUniformFull(sel) {
  const d = sel.data;
  return isSparseSel(d) && !d.__tiles.size && !d.__base && !d.__neg && (d.__fill | 0) === 255
    && sel.x === 0 && sel.y === 0 && sel.width === sel.docW && sel.height === sel.docH;
}

function smoothTiled(sel, r) {
  const pad = r + 1, docW = sel.docW, docH = sel.docH;
  const x0 = sel.x, y0 = sel.y, W = sel.width, H = sel.height;
  if (!(W > 0 && H > 0)) return emptySelection(docW, docH);
  const cols = Math.ceil(W / SEL_TILE), tiles = new Map();
  for (let gtY = y0; gtY < y0 + H; gtY += SEL_TILE) for (let gtX = x0; gtX < x0 + W; gtX += SEL_TILE) {
    const tw = Math.min(SEL_TILE, x0 + W - gtX), th = Math.min(SEL_TILE, y0 + H - gtY);
    const cx0 = Math.max(0, gtX - pad), cy0 = Math.max(0, gtY - pad);
    const cx1 = Math.min(docW, gtX + tw + pad), cy1 = Math.min(docH, gtY + th + pad);
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (!(cw > 0 && ch > 0)) continue;
    const bytes = blitSelRect(sel, cx0, cy0, cw, ch);
    let mn = 255, mx = 0;
    for (let i = 0; i < bytes.length; i++) { const v = bytes[i]; if (v < mn) mn = v; if (v > mx) mx = v; if (mn === 0 && mx === 255) break; }
    const key = ((gtY - y0) / SEL_TILE) * cols + ((gtX - x0) / SEL_TILE);
    const t = new Uint8Array(SEL_TILE * SEL_TILE);
    if (mn === mx) {

      if (mn * 2 >= 255) { t.fill(255); tiles.set(key, t); }
      continue;
    }
    const cw1 = cw + 1, ps = new Uint32Array((ch + 1) * (cw + 1));
    for (let yy = 0; yy < ch; yy++) {
      let row = 0;
      for (let xx = 0; xx < cw; xx++) { row += bytes[yy * cw + xx]; ps[(yy + 1) * cw1 + xx + 1] = ps[yy * cw1 + xx + 1] + row; }
    }
    const offX = gtX - cx0, offY = gtY - cy0;
    let any = false;
    for (let yy = offY; yy < offY + th; yy++) {
      const ya = Math.max(0, yy - r), yb = Math.min(ch - 1, yy + r);
      for (let xx = offX; xx < offX + tw; xx++) {
        const xa = Math.max(0, xx - r), xb = Math.min(cw - 1, xx + r);
        const sum = ps[(yb + 1) * cw1 + xb + 1] - ps[ya * cw1 + xb + 1] - ps[(yb + 1) * cw1 + xa] + ps[ya * cw1 + xa];
        const n = (yb - ya + 1) * (xb - xa + 1);
        if (sum * 2 >= n * 255) { t[(yy - offY) * SEL_TILE + (xx - offX)] = 255; any = true; }
      }
    }
    if (any) tiles.set(key, t);
  }
  return { x: x0, y: y0, width: W, height: H, data: coverageFromTiles(W, H, 0, tiles), docW, docH };
}
export function smoothSelection(sel, radius = 0) {
  assertSel(sel);
  const r = Math.max(0, Math.round(+radius || 0));
  if (!r) return cloneSelection(sel);
  if (sel.width === 0 || sel.height === 0) return emptySelection(sel.docW, sel.docH);
  if (sparseUniformFull(sel)) return cloneSelection(sel);
  const cropped = sparseSoftSelection(sel, r + 2, c => smoothSelection(c, r));
  if (cropped !== undefined) return cropped;
  if (sel.width * sel.height > 32e6) return smoothTiled(sel, r);
  const W = sel.width, H = sel.height, d = selData(sel);
  const ps = new Uint32Array((H + 1) * (W + 1));               
  for (let yy = 0; yy < H; yy++) {
    let row = 0;
    for (let xx = 0; xx < W; xx++) {
      row += d[yy * W + xx];
      ps[(yy + 1) * (W + 1) + (xx + 1)] = ps[yy * (W + 1) + (xx + 1)] + row;
    }
  }
  const out = new Uint8Array(W * H);
  for (let yy = 0; yy < H; yy++) {
    const y0 = Math.max(0, yy - r), y1 = Math.min(H - 1, yy + r);
    for (let xx = 0; xx < W; xx++) {
      const x0 = Math.max(0, xx - r), x1 = Math.min(W - 1, xx + r);
      const sum = ps[(y1 + 1) * (W + 1) + (x1 + 1)] - ps[y0 * (W + 1) + (x1 + 1)]
                - ps[(y1 + 1) * (W + 1) + x0] + ps[y0 * (W + 1) + x0];
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      out[yy * W + xx] = sum * 2 >= n * 255 ? 255 : 0;         
    }
  }
  return { x: sel.x, y: sel.y, width: W, height: H, data: out, docW: sel.docW, docH: sel.docH };
}








function blitSelRect(sel, x0, y0, w, h) {
  const out = new Uint8Array(w * h);
  if (!(w > 0 && h > 0)) return out;
  const d = selData(sel), sx = sel.x, sy = sel.y, sw = sel.width, sh = sel.height;
  const ix0 = Math.max(x0, sx), iy0 = Math.max(y0, sy), ix1 = Math.min(x0 + w, sx + sw), iy1 = Math.min(y0 + h, sy + sh);
  if (!isSparseSel(d)) {
    for (let y = iy0; y < iy1; y++) {
      const so = (y - sy) * sw + (ix0 - sx), dof = (y - y0) * w + (ix0 - x0);
      out.set(d.subarray(so, so + (ix1 - ix0)), dof);
    }
    return out;
  }

  for (let y = iy0; y < iy1; y++) out.fill(d.__fill | 0, (y - y0) * w + (ix0 - x0), (y - y0) * w + (ix1 - x0));
  const TS = SEL_TILE, cols = Math.ceil(sw / TS);
  for (const [k, t] of d.__tiles) {
    const e = tileExtent(sw, sh, k, cols);
    const gx0 = sx + e.x, gy0 = sy + e.y, gx1 = gx0 + e.w, gy1 = gy0 + e.h;
    const ax0 = Math.max(ix0, gx0), ax1 = Math.min(ix1, gx1), ay0 = Math.max(iy0, gy0), ay1 = Math.min(iy1, gy1);
    if (ax1 <= ax0) continue;
    for (let y = ay0; y < ay1; y++) {
      const so = (y - gy0) * TS + (ax0 - gx0), dof = (y - y0) * w + (ax0 - x0);
      out.set(t.subarray(so, so + (ax1 - ax0)), dof);
    }
  }
  if (d.__base) {
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) {
      const i = (y - sy) * sw + (x - sx);
      const k = (((y - sy) / TS) | 0) * cols + (((x - sx) / TS) | 0);
      if (!d.__tiles.has(k)) out[(y - y0) * w + (x - x0)] = d.__base(i) | 0;
    }
  }
  return out;
}

export function selectionCropDense(sel, x0, y0, w, h) {
  assertSel(sel);
  return { x: 0, y: 0, width: w, height: h, data: blitSelRect(sel, x0, y0, w, h), docW: w, docH: h };
}

export function selectionFromTiles(x, y, width, height, tiles, fill = 0, docW = width, docH = height) {
  return { x, y, width, height, data: coverageFromTiles(width, height, fill, tiles), docW, docH };
}




export function selectionBorderTiles(sel, pad = 0, tile = SEL_TILE) {
  assertSel(sel);
  const { docW, docH } = sel;
  const out = new Map();
  const add = (gx0, gy0, gx1, gy1) => {
    gx0 = Math.max(0, Math.floor((gx0 - pad) / tile) * tile);
    gy0 = Math.max(0, Math.floor((gy0 - pad) / tile) * tile);
    gx1 = Math.min(docW, Math.ceil((gx1 + pad) / tile) * tile);
    gy1 = Math.min(docH, Math.ceil((gy1 + pad) / tile) * tile);
    for (let y = gy0; y < gy1; y += tile) for (let x = gx0; x < gx1; x += tile) {
      const w = Math.min(tile, docW - x), h = Math.min(tile, docH - y);
      out.set(`${x}:${y}`, { x, y, width: w, height: h });
    }
  };
  const d = selData(sel);
  if (!isSparseSel(d) || d.__base || d.__neg || d.__brushBase || !d.__tiles.size) {
    if (isSparseSel(d) && !d.__tiles.size && !d.__base && !d.__neg) {
      if ((d.__fill | 0) === 0) return [];

      const gx0 = Math.floor(sel.x / tile) * tile, gy0 = Math.floor(sel.y / tile) * tile;
      const gx1 = Math.ceil((sel.x + sel.width) / tile) * tile, gy1 = Math.ceil((sel.y + sel.height) / tile) * tile;
      for (let y = gy0; y < gy1; y += tile) for (let x = gx0; x < gx1; x += tile) {
        if (x === gx0 || y === gy0 || x + tile >= gx1 || y + tile >= gy1)
          add(x, y, Math.min(docW, x + tile), Math.min(docH, y + tile));
      }
      return [...out.values()];
    }
    add(sel.x, sel.y, sel.x + sel.width, sel.y + sel.height);
    return [...out.values()];
  }
  const fill = d.__fill | 0, cols = Math.ceil(sel.width / tile);
  const uni = new Map();
  for (const [k, t] of d.__tiles) {
    let v = t[0], same = true;
    for (let i = 1; i < t.length; i++) if (t[i] !== v) { same = false; break; }
    uni.set(k, same ? v : -1);
  }
  const val = (tx, ty) => {
    const k = ty * cols + tx;
    if (tx < 0 || ty < 0 || tx >= cols || ty * tile >= sel.height) return fill;
    return uni.has(k) ? uni.get(k) : fill;
  };
  const border = new Set();
  for (const [k, v] of uni) {
    const tx = k % cols, ty = (k / cols) | 0;
    if (v === -1) { border.add(k); continue; }
    let diff = false;
    for (let dy = -1; dy <= 1 && !diff; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nv = val(tx + dx, ty + dy);
      if (nv !== v) { diff = true; break; }
    }
    if (diff) border.add(k);
  }
  for (const k of border) {
    const tx = k % cols, ty = (k / cols) | 0;
    const gx0 = sel.x + tx * tile, gy0 = sel.y + ty * tile;
    add(gx0, gy0, Math.min(sel.x + sel.width, gx0 + tile), Math.min(sel.y + sel.height, gy0 + tile));
  }
  return [...out.values()];
}

function featherTiled(sel, r) {
  const sizes = boxSizesForGauss(r, 3), rs = sizes.map(s => (s - 1) >> 1);
  const pad = rs[0] + rs[1] + rs[2];
  if (pad <= 0) return cloneSelection(sel);
  const docW = sel.docW, docH = sel.docH;
  const ox0 = Math.max(0, sel.x - pad), oy0 = Math.max(0, sel.y - pad);
  const ox1 = Math.min(docW, sel.x + sel.width + pad), oy1 = Math.min(docH, sel.y + sel.height + pad);
  const outW = ox1 - ox0, outH = oy1 - oy0;
  if (!(outW > 0 && outH > 0)) return emptySelection(docW, docH);
  const cols = Math.ceil(outW / SEL_TILE), tiles = new Map();
  for (let gtY = oy0; gtY < oy1; gtY += SEL_TILE) for (let gtX = ox0; gtX < ox1; gtX += SEL_TILE) {
    const tw = Math.min(SEL_TILE, ox1 - gtX), th = Math.min(SEL_TILE, oy1 - gtY);
    const cx0 = Math.max(0, gtX - pad), cy0 = Math.max(0, gtY - pad);
    const cx1 = Math.min(docW, gtX + tw + pad), cy1 = Math.min(docH, gtY + th + pad);
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (!(cw > 0 && ch > 0)) continue;
    const bytes = blitSelRect(sel, cx0, cy0, cw, ch);
    let mn = 255, mx = 0;
    for (let i = 0; i < bytes.length; i++) { const v = bytes[i]; if (v < mn) mn = v; if (v > mx) mx = v; if (mn === 0 && mx === 255) break; }
    const key = ((gtY - oy0) / SEL_TILE) * cols + ((gtX - ox0) / SEL_TILE);
    if (mn === mx) {
      if (mn) { const t = new Uint8Array(SEL_TILE * SEL_TILE); t.fill(mn); tiles.set(key, t); }
      continue;
    }
    let buf = new Float32Array(cw * ch), tmp = new Float32Array(cw * ch);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes[i];
    const colSum = new Float32Array(cw);
    for (let p = 0; p < 3; p++) { boxBlurH(buf, tmp, cw, ch, rs[p]); boxBlurV(tmp, buf, cw, ch, rs[p], colSum); }
    const t = new Uint8Array(SEL_TILE * SEL_TILE);
    let any = false;
    const offX = gtX - cx0, offY = gtY - cy0;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const v = Math.round(buf[(offY + y) * cw + offX + x]);
      const q = v < 0 ? 0 : v > 255 ? 255 : v;
      if (q) { t[y * SEL_TILE + x] = q; any = true; }
    }
    if (any) tiles.set(key, t);
  }
  return { x: ox0, y: oy0, width: outW, height: outH, data: coverageFromTiles(outW, outH, 0, tiles), docW, docH };
}
export function featherSelection(sel, radius = 0) {
  assertSel(sel);
  const r = +radius;
  if (!Number.isFinite(r)) throw new TypeError(`羽化半径必须是数字，收到 ${JSON.stringify(radius)}`);
  if (r < 0) throw new RangeError(`羽化半径不能是负数，收到 ${r}`);
  if (r === 0) return cloneSelection(sel);
  if (sel.width === 0 || sel.height === 0) return emptySelection(sel.docW, sel.docH);
  if (sparseUniformFull(sel)) return cloneSelection(sel);
  const cropped = sparseSoftSelection(sel, Math.ceil(r * 2) + 4, c => featherSelection(c, r));
  if (cropped !== undefined) return cropped;
  if (sel.width * sel.height > 32e6) return featherTiled(sel, r);

  
  const sizes = boxSizesForGauss(r, 3);
  const rs = sizes.map(s => (s - 1) >> 1);
  const pad = rs[0] + rs[1] + rs[2];
  if (pad === 0) return cloneSelection(sel);

  const { docW, docH } = sel;
  const x0 = Math.max(0, sel.x - pad), y0 = Math.max(0, sel.y - pad);
  const x1 = Math.min(docW, sel.x + sel.width + pad), y1 = Math.min(docH, sel.y + sel.height + pad);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return emptySelection(docW, docH);

  const bytes = new Uint8Array(w * h);
  blitInto(bytes, w, h, x0, y0, sel);
  let buf = new Float32Array(w * h), tmp = new Float32Array(w * h);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes[i];
  const colSum = new Float32Array(w);
  for (let p = 0; p < 3; p++) {
    boxBlurH(buf, tmp, w, h, rs[p]);
    boxBlurV(tmp, buf, w, h, rs[p], colSum);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = Math.round(buf[i]);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return trimSelection({ x: x0, y: y0, width: w, height: h, data: out, docW, docH });
}


function boxSizesForGauss(sigma, n) {
  const wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  if (wl < 1) wl = 1;
  const wu = wl + 2;
  let m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  if (!Number.isFinite(m) || m < 0) m = 0;
  if (m > n) m = n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(i < m ? wl : wu);
  return out;
}


function boxBlurH(src, dst, w, h, r) {
  if (r <= 0) { dst.set(src); return; }
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = 0;
    for (let i = 0; i <= r && i < w; i++) sum += src[o + i];
    for (let x = 0; x < w; x++) {
      dst[o + x] = sum * inv;
      const add = x + r + 1, sub = x - r;
      if (add < w) sum += src[o + add];
      if (sub >= 0) sum -= src[o + sub];
    }
  }
}



function boxBlurV(src, dst, w, h, r, colSum) {
  if (r <= 0) { dst.set(src); return; }
  const inv = 1 / (2 * r + 1);
  colSum.fill(0);
  for (let y = 0; y <= r && y < h; y++) { const o = y * w; for (let i = 0; i < w; i++) colSum[i] += src[o + i]; }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let i = 0; i < w; i++) dst[o + i] = colSum[i] * inv;
    const add = y + r + 1, sub = y - r;
    if (add < h) { const a = add * w; for (let i = 0; i < w; i++) colSum[i] += src[a + i]; }
    if (sub >= 0) { const s = sub * w; for (let i = 0; i < w; i++) colSum[i] -= src[s + i]; }
  }
}






export function expandSelection(sel, px) {
  return morphSelection(sel, px, true);
}






export function contractSelection(sel, px) {
  return morphSelection(sel, px, false);
}


function morphTiled(sel, r, dilate) {
  const docW = sel.docW, docH = sel.docH, pad = r + 2;
  const ox0 = dilate ? Math.max(0, sel.x - r) : sel.x;
  const oy0 = dilate ? Math.max(0, sel.y - r) : sel.y;
  const ox1 = dilate ? Math.min(docW, sel.x + sel.width + r) : sel.x + sel.width;
  const oy1 = dilate ? Math.min(docH, sel.y + sel.height + r) : sel.y + sel.height;
  const W = ox1 - ox0, H = oy1 - oy0;
  if (!(W > 0 && H > 0)) return emptySelection(docW, docH);
  const cols = Math.ceil(W / SEL_TILE), tiles = new Map();
  for (let gtY = oy0; gtY < oy1; gtY += SEL_TILE) for (let gtX = ox0; gtX < ox1; gtX += SEL_TILE) {
    const tw = Math.min(SEL_TILE, ox1 - gtX), th = Math.min(SEL_TILE, oy1 - gtY);
    const cx0 = Math.max(0, gtX - pad), cy0 = Math.max(0, gtY - pad);
    const cx1 = Math.min(docW, gtX + tw + pad), cy1 = Math.min(docH, gtY + th + pad);
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (!(cw > 0 && ch > 0)) continue;
    const bytes = blitSelRect(sel, cx0, cy0, cw, ch);
    let mn = 255, mx = 0;
    for (let i = 0; i < bytes.length; i++) { const v = bytes[i]; if (v < mn) mn = v; if (v > mx) mx = v; if (mn === 0 && mx === 255) break; }
    const key = ((gtY - oy0) / SEL_TILE) * cols + ((gtX - ox0) / SEL_TILE);
    const t = new Uint8Array(SEL_TILE * SEL_TILE);
    if (mn === mx) {
      if (mn === 0) continue;

      if (dilate || (gtX > 0 && gtY > 0 && gtX + tw < docW && gtY + th < docH)) {
        t.fill(mn); tiles.set(key, t); continue;
      }
    }
    const res = morphSelection({ x: cx0, y: cy0, width: cw, height: ch, data: bytes, docW, docH }, r, dilate);
    let any = false;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const v = selectionValueAt(res, gtX + x, gtY + y);
      if (v) { t[y * SEL_TILE + x] = v; any = true; }
    }
    if (any) tiles.set(key, t);
  }
  return { x: ox0, y: oy0, width: W, height: H, data: coverageFromTiles(W, H, 0, tiles), docW, docH };
}
function morphSelection(sel, px, dilate) {
  assertSel(sel);
  const r = Math.round(+px);
  if (!Number.isFinite(r)) throw new TypeError(`px 必须是数字，收到 ${JSON.stringify(px)}`);
  if (r < 0) throw new RangeError(`px 不能是负数（要反向请改用另一个函数），收到 ${px}`);
  if (r === 0) return cloneSelection(sel);
  if (sel.width === 0 || sel.height === 0) return emptySelection(sel.docW, sel.docH);
  const root = sparseRootInfo(sel);
  if (root?.full && !dilate)
    throw new RangeError('收缩：带孔的全选/整幅选区需要整幅距离场；请先取消全选，或缩小到局部选区。');
  if (root) {
    if (root.full && !sel.data.__tiles.size) return cloneSelection(sel);
    const cropped = sparseSoftSelection(sel, r + 2, c => morphSelection(c, r, dilate));
    if (cropped !== undefined) return cropped;
  }
  if (sel.width * sel.height > 32e6) return morphTiled(sel, r, dilate);

  const { docW, docH } = sel;
  
  const base = dilate
    ? growSelectionBounds(sel, { x: sel.x - r, y: sel.y - r, width: sel.width + 2 * r, height: sel.height + 2 * r })
    : sel;
  if (base.width === 0 || base.height === 0) return emptySelection(docW, docH);

  const w = base.width, h = base.height, src = selData(base);
  const out = new Uint8Array(w * h);
  if (!dilate) out.fill(255);
  const rowBuf = new Uint8Array(w), dq = new Int32Array(w + 1);
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));       
    for (let y = 0; y < h; y++) {
      const sy = y + dy, o = y * w;
      if (sy < 0 || sy >= h) { if (!dilate) out.fill(0, o, o + w); continue; }
      lineMinMax(src, sy * w, w, hw, rowBuf, dq, dilate);
      if (dilate) { for (let i = 0; i < w; i++) if (rowBuf[i] > out[o + i]) out[o + i] = rowBuf[i]; }
      else { for (let i = 0; i < w; i++) if (rowBuf[i] < out[o + i]) out[o + i] = rowBuf[i]; }
    }
  }
  return trimSelection({ x: base.x, y: base.y, width: w, height: h, data: out, docW, docH });
}



function lineMinMax(src, off, n, hw, out, dq, wantMax) {
  if (hw <= 0) { for (let i = 0; i < n; i++) out[i] = src[off + i]; return; }
  let head = 0, tail = 0;
  const better = wantMax ? (a, b) => a <= b : (a, b) => a >= b;
  for (let i = 0; i <= hw && i < n; i++) {
    while (tail > head && better(src[off + dq[tail - 1]], src[off + i])) tail--;
    dq[tail++] = i;
  }
  for (let i = 0; i < n; i++) {
    while (dq[head] < i - hw) head++;
    out[i] = (!wantMax && (i - hw < 0 || i + hw > n - 1)) ? 0 : src[off + dq[head]];
    const nx = i + hw + 1;
    if (nx < n) {
      while (tail > head && better(src[off + dq[tail - 1]], src[off + nx])) tail--;
      dq[tail++] = nx;
    }
  }
}


















const CR_BITS = 6, CR_SIZE = 1 << CR_BITS, CR_STEP = 256 >> CR_BITS;   

function pixelsOf(rgba, docW, docH) {
  const px = rgba && rgba.data && typeof rgba.length !== 'number' ? rgba.data : rgba;
  if (!px || typeof px.length !== 'number')
    throw new TypeError('rgba 必须是 RGBA 字节数组（Uint8Array / Uint8ClampedArray）或 { data, width, height }');
  if (px.length < docW * docH * 4) throw new RangeError(`RGBA 长度 ${px.length} < ${docW}×${docH}×4 = ${docW * docH * 4}`);
  return px;
}


function colorGridOf(sel, px, docW, docH, tol) {
  const grid = new Uint8Array(CR_SIZE * CR_SIZE * CR_SIZE);
  const d = selData(sel);
  for (let j = 0; j < sel.height; j++) {
    const dy = sel.y + j;
    if (dy < 0 || dy >= docH) continue;
    for (let i = 0; i < sel.width; i++) {
      if (!d[j * sel.width + i]) continue;
      const dx = sel.x + i;
      if (dx < 0 || dx >= docW) continue;
      const o = (dy * docW + dx) * 4;
      grid[((px[o] >> 2) * CR_SIZE + (px[o + 1] >> 2)) * CR_SIZE + (px[o + 2] >> 2)] = 1;
    }
  }
  const r = Math.max(0, Math.round(tol / CR_STEP));
  if (r > 0) for (let axis = 0; axis < 3; axis++) dilateAxis(grid, r, axis);
  return grid;
}

function dilateAxis(grid, r, axis) {
  const S = CR_SIZE, line = new Int32Array(S), tmp = new Uint8Array(S);
  const idx = (a, b, c) => axis === 0 ? (c * S + a) * S + b : axis === 1 ? (a * S + c) * S + b : (a * S + b) * S + c;
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
    for (let c = 0; c < S; c++) tmp[c] = grid[idx(a, b, c)];
    let last = -1e9;
    for (let c = 0; c < S; c++) { if (tmp[c]) last = c; line[c] = c - last; }
    last = 1e9;
    for (let c = S - 1; c >= 0; c--) { if (tmp[c]) last = c; if (last - c < line[c]) line[c] = last - c; }
    for (let c = 0; c < S; c++) if (line[c] <= r) grid[idx(a, b, c)] = 1;
  }
}
const gridHit = (grid, px, o) => grid[((px[o] >> 2) * CR_SIZE + (px[o + 1] >> 2)) * CR_SIZE + (px[o + 2] >> 2)];








export function growSelection(sel, rgba, docW, docH, opts = {}) {
  assertSel(sel); assertDoc(docW, docH);
  if (sel.width === 0 || sel.height === 0) return emptySelection(docW, docH);
  const px = pixelsOf(rgba, docW, docH);
  const tol = Math.max(0, Math.min(255, Number.isFinite(opts.tolerance) ? opts.tolerance : 32));
  const grid = colorGridOf(sel, px, docW, docH, tol);
  const n = docW * docH;
  const out = new Uint8Array(n);
  const d = selData(sel);
  let stack = new Int32Array(1024), top = 0;
  const push = i => { if (top === stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; } stack[top++] = i; };
  for (let j = 0; j < sel.height; j++) {
    const dy = sel.y + j; if (dy < 0 || dy >= docH) continue;
    for (let i = 0; i < sel.width; i++) {
      const v = d[j * sel.width + i]; if (!v) continue;
      const dx = sel.x + i; if (dx < 0 || dx >= docW) continue;
      const k = dy * docW + dx;
      if (v > out[k]) out[k] = v;                 
      push(k);
    }
  }
  while (top > 0) {
    const i = stack[--top];
    const y = (i / docW) | 0, x = i - y * docW;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
      const ni = ny * docW + nx;
      if (out[ni] === 255) continue;
      if (!gridHit(grid, px, ni * 4)) continue;
      out[ni] = 255; push(ni);
    }
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}





export function similarSelection(sel, rgba, docW, docH, opts = {}) {
  assertSel(sel); assertDoc(docW, docH);
  if (sel.width === 0 || sel.height === 0) return emptySelection(docW, docH);
  const px = pixelsOf(rgba, docW, docH);
  const tol = Math.max(0, Math.min(255, Number.isFinite(opts.tolerance) ? opts.tolerance : 32));
  const grid = colorGridOf(sel, px, docW, docH, tol);
  const n = docW * docH, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (gridHit(grid, px, i * 4)) out[i] = 255;
  const d = selData(sel);                         
  for (let j = 0; j < sel.height; j++) {
    const dy = sel.y + j; if (dy < 0 || dy >= docH) continue;
    for (let i = 0; i < sel.width; i++) {
      const v = d[j * sel.width + i], dx = sel.x + i;
      if (v && dx >= 0 && dx < docW) { const k = dy * docW + dx; if (v > out[k]) out[k] = v; }
    }
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}





export function borderSelection(sel, width) {
  assertSel(sel);
  const w = Math.round(+width);
  if (!Number.isFinite(w)) throw new TypeError(`边界宽度必须是数字，收到 ${JSON.stringify(width)}`);
  if (w <= 0) return emptySelection(sel.docW, sel.docH);
  const outer = expandSelection(sel, Math.ceil(w / 2));
  const inner = contractSelection(sel, Math.floor(w / 2));
  return combineSelection(outer, inner, 'subtract');
}








export function colorRangeSelection(rgba, docW, docH, opts = {}) {
  assertDoc(docW, docH);
  const px = pixelsOf(rgba, docW, docH);
  const colors = (opts.colors || []).filter(c => Array.isArray(c) && c.length >= 3);
  if (!colors.length) throw new TypeError('色彩范围至少要一个取样色 colors:[[r,g,b], …]');
  const fz = Math.max(0, Math.min(200, Number.isFinite(opts.fuzziness) ? opts.fuzziness : 40));
  const hi = fz * 2 || 1;
  const n = docW * docH, out = new Uint8Array(n);
  const inv = !!opts.invert;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let best = 255;
    for (const c of colors) {
      let d = Math.abs(px[o] - c[0]);
      const g = Math.abs(px[o + 1] - c[1]); if (g > d) d = g;
      const b = Math.abs(px[o + 2] - c[2]); if (b > d) d = b;
      if (d < best) best = d;
      if (!best) break;
    }
    let v = best <= fz ? 255 : (best >= hi ? 0 : Math.round(255 * (hi - best) / (hi - fz)));
    if (inv) v = 255 - v;
    out[i] = v;
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}

























function pixelsRGBA(rgba, docW, docH) {
  const px = rgba && rgba.data && typeof rgba.length !== 'number' ? rgba.data : rgba;
  if (!px || typeof px.length !== 'number')
    throw new TypeError('rgba 必须是 RGBA 字节数组（Uint8Array / Uint8ClampedArray）或 { data, width, height }');
  if (px.length < docW * docH * 4) throw new RangeError(`RGBA 长度 ${px.length} < ${docW}×${docH}×4 = ${docW * docH * 4}`);
  return px;
}






export function edgeStrength(rgba, docW, docH) {
  assertDoc(docW, docH);
  const px = pixelsRGBA(rgba, docW, docH);
  const n = docW * docH;
  const lum = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 4)
    lum[i] = (px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114) * (px[o + 3] / 255);
  const g = new Float32Array(n);
  let gmax = 1e-6;
  for (let y = 1; y < docH - 1; y++) {
    for (let x = 1; x < docW - 1; x++) {
      const i = y * docW + x;
      const a = lum[i - docW - 1], b = lum[i - docW], c = lum[i - docW + 1];
      const d = lum[i - 1], f = lum[i + 1];
      const p = lum[i + docW - 1], q = lum[i + docW], r = lum[i + docW + 1];
      const gx = -a - 2 * d - p + c + 2 * f + r;
      const gy = -a - 2 * b - c + p + 2 * q + r;
      const m = Math.sqrt(gx * gx + gy * gy);
      g[i] = m; if (m > gmax) gmax = m;
    }
  }
  for (let i = 0; i < n; i++) g[i] /= gmax;
  return g;
}


function colorModel(px, idxs) {
  const m = { mid: [0, 0, 0, 255], band: [0, 0, 0, 0] };
  if (!idxs.length) return m;
  for (let c = 0; c < 4; c++) {
    const v = new Uint8Array(idxs.length);
    for (let k = 0; k < idxs.length; k++) v[k] = px[idxs[k] * 4 + c];
    v.sort();
    const q = t => v[Math.min(v.length - 1, Math.max(0, Math.round(t * (v.length - 1))))];
    m.mid[c] = q(0.5);
    m.band[c] = Math.max(0, q(0.9) - q(0.1));
  }
  return m;
}

function modelDist(px, i, m) {
  let worst = 0;
  for (let c = 0; c < 4; c++) {
    const d = Math.abs(px[i * 4 + c] - m.mid[c]) - m.band[c] / 2;
    if (d > worst) worst = d;
  }
  return worst;
}



function edgeAwareFlood(docW, docH, seeds, accept) {
  const n = docW * docH;
  const out = new Uint8Array(n);
  const seen = new Uint8Array(n);
  let stack = new Int32Array(1024), top = 0;
  const push = i => { if (top === stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; } stack[top++] = i; };
  for (let i = 0; i < n; i++) if (seeds[i]) { out[i] = 255; seen[i] = 1; push(i); }
  while (top > 0) {
    const i = stack[--top];
    const y = (i / docW) | 0, x = i - y * docW;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
      const j = ny * docW + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      const v = accept(j);
      if (v >= 255) { out[j] = 255; push(j); }
      else if (v > 0) out[j] = v;                  
    }
  }
  return out;
}


function largestComponent(mask, docW, docH) {
  const n = docW * docH;
  const lab = new Int32Array(n).fill(-1);
  let best = -1, bestN = 0, cur = 0;
  let stack = new Int32Array(1024);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    let top = 0, cnt = 0;
    const push = i => { if (top === stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; } stack[top++] = i; };
    lab[s] = cur; push(s);
    while (top > 0) {
      const i = stack[--top]; cnt++;
      const y = (i / docW) | 0, x = i - y * docW;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
        const j = ny * docW + nx;
        if (mask[j] && lab[j] < 0) { lab[j] = cur; push(j); }
      }
    }
    if (cnt > bestN) { bestN = cnt; best = cur; }
    cur++;
  }
  const out = new Uint8Array(n);
  if (best < 0) return out;
  for (let i = 0; i < n; i++) if (lab[i] === best) out[i] = 255;
  return out;
}


function fillHoles(mask, docW, docH) {
  const n = docW * docH;
  const outside = new Uint8Array(n);
  let stack = new Int32Array(1024), top = 0;
  const push = i => { if (top === stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; } stack[top++] = i; };
  const seed = i => { if (!mask[i] && !outside[i]) { outside[i] = 1; push(i); } };
  for (let x = 0; x < docW; x++) { seed(x); seed((docH - 1) * docW + x); }
  for (let y = 0; y < docH; y++) { seed(y * docW); seed(y * docW + docW - 1); }
  while (top > 0) {
    const i = stack[--top];
    const y = (i / docW) | 0, x = i - y * docW;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
      const j = ny * docW + nx;
      if (!mask[j] && !outside[j]) { outside[j] = 1; push(j); }
    }
  }
  const out = Uint8Array.from(mask);
  for (let i = 0; i < n; i++) if (!mask[i] && !outside[i]) out[i] = 255;
  return out;
}













export function quickSelectFromMask(rgba, docW, docH, seedMask, opts = {}) {
  assertDoc(docW, docH);
  const px = pixelsRGBA(rgba, docW, docH);
  const n = docW * docH;
  if (!seedMask || seedMask.length !== n)
    throw new RangeError(`笔迹掩膜长度 ${seedMask && seedMask.length} ≠ ${docW}×${docH} = ${n}`);
  const seeds = [];
  for (let i = 0; i < n; i++) if (seedMask[i]) seeds.push(i);
  if (!seeds.length) return emptySelection(docW, docH);
  const tol = Math.max(0, Math.min(255, Number.isFinite(opts.tolerance) ? opts.tolerance : 24));
  const eThr = Math.max(0, Math.min(1, Number.isFinite(opts.edgeThreshold) ? opts.edgeThreshold : 0.18));
  const soft = opts.antialias === false ? 0 : Math.max(1, tol / 2);
  const g = opts.edges && opts.edges.length === n ? opts.edges : edgeStrength(px, docW, docH);
  const model = colorModel(px, seeds);
  const accept = j => {
    if (g[j] >= eThr) return Math.round(255 * 0.5);        
    const d = modelDist(px, j, model);
    if (d <= tol) return 255;
    if (d >= tol + soft) return 0;
    return Math.round(255 * (tol + soft - d) / soft);
  };
  const out = edgeAwareFlood(docW, docH, seedMask, accept);
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}















export function objectSelection(rgba, docW, docH, rect, opts = {}) {
  assertDoc(docW, docH);
  const px = pixelsRGBA(rgba, docW, docH);
  const n = docW * docH;
  const r = normRect(rect);
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(docW, r.x + r.width), y1 = Math.min(docH, r.y + r.height);
  if (x1 - x0 < 3 || y1 - y0 < 3) return emptySelection(docW, docH);
  const region = opts.region && opts.region.length === n ? opts.region : null;
  const inRegion = i => {
    const y = (i / docW) | 0, x = i - y * docW;
    if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
    return region ? !!region[i] : true;
  };
  const tol = Math.max(0, Math.min(255, Number.isFinite(opts.tolerance) ? opts.tolerance : 28));
  const eThr = Math.max(0, Math.min(1, Number.isFinite(opts.edgeThreshold) ? opts.edgeThreshold : 0.18));
  const g = opts.edges && opts.edges.length === n ? opts.edges : edgeStrength(px, docW, docH);

  
  const border = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * docW + x;
    if (!inRegion(i)) continue;
    const sides = opts.bgSides || 'tblr';           
    const edge = (sides.includes('l') && x === x0) || (sides.includes('t') && y === y0)
      || (sides.includes('r') && x === x1 - 1) || (sides.includes('b') && y === y1 - 1)
      || (region && (!inRegion(i - 1) || !inRegion(i + 1) || !inRegion(i - docW) || !inRegion(i + docW)));
    if (edge) border.push(i);
  }
  if (!border.length) return emptySelection(docW, docH);
  const bg = colorModel(px, border);

  
  const seeds = new Uint8Array(n);
  for (const i of border) seeds[i] = 1;
  const bgMask = edgeAwareFlood(docW, docH, seeds, j => {
    if (!inRegion(j)) return 0;
    
    
    if (g[j] >= eThr) return 128;
    return modelDist(px, j, bg) <= tol ? 255 : 0;
  });

  
  const obj = new Uint8Array(n);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * docW + x;
    if (inRegion(i)) obj[i] = 255 - bgMask[i];
  }
  let out = obj;
  if (opts.largestOnly !== false) {
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (obj[i] >= 128) solid[i] = 255;
    const keep = largestComponent(solid, docW, docH);
    
    const grown = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (keep[i]) { grown[i] = obj[i]; continue; }
      if (!obj[i]) continue;
      const y = (i / docW) | 0, x = i - y * docW;
      if ((x > 0 && keep[i - 1]) || (x < docW - 1 && keep[i + 1])
        || (y > 0 && keep[i - docW]) || (y < docH - 1 && keep[i + docW])) grown[i] = obj[i];
    }
    out = grown;
  }
  if (opts.fillHoles !== false) {
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (out[i] >= 128) solid[i] = 255;
    const filled = fillHoles(solid, docW, docH);
    for (let i = 0; i < n; i++) if (filled[i] && !out[i]) out[i] = 255;
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}


function kmeansRGB(px, idxs, K, maxSamples = 6000) {
  if (!idxs.length) return [];
  let S = idxs;
  if (S.length > maxSamples) { const out = [], st = S.length / maxSamples; for (let k = 0; k < maxSamples; k++) out.push(S[Math.floor(k * st)]); S = out; }
  const C = [[px[S[S.length >> 1] * 4], px[S[S.length >> 1] * 4 + 1], px[S[S.length >> 1] * 4 + 2]]];
  while (C.length < K) {
    let best = -1, bi = 0;
    for (const i of S) { let d = Infinity; for (const c of C) { const e = (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2; if (e < d) d = e; } if (d > best) { best = d; bi = i; } }
    if (best <= 0) break;
    C.push([px[bi * 4], px[bi * 4 + 1], px[bi * 4 + 2]]);
  }
  for (let it = 0; it < 6; it++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    for (const i of S) { let d = Infinity, k = 0; for (let c = 0; c < C.length; c++) { const e = (px[i * 4] - C[c][0]) ** 2 + (px[i * 4 + 1] - C[c][1]) ** 2 + (px[i * 4 + 2] - C[c][2]) ** 2; if (e < d) { d = e; k = c; } }
      const a = acc[k]; a[0] += px[i * 4]; a[1] += px[i * 4 + 1]; a[2] += px[i * 4 + 2]; a[3]++; }
    for (let c = 0; c < C.length; c++) if (acc[c][3]) C[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
  }
  return C;
}
function nearestSq(px, i, C) { let d = Infinity; for (const c of C) { const e = (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2; if (e < d) d = e; } return d; }









export function quickSelectCluster(rgba, docW, docH, seedMask, opts = {}) {
  assertDoc(docW, docH);
  const px = pixelsRGBA(rgba, docW, docH);
  const n = docW * docH;
  if (!seedMask || seedMask.length !== n) throw new RangeError(`笔迹掩膜长度 ${seedMask && seedMask.length} ≠ ${docW}×${docH} = ${n}`);
  const seeds = [];
  for (let i = 0; i < n; i++) if (seedMask[i]) seeds.push(i);
  if (!seeds.length) return emptySelection(docW, docH);
  const tol = Math.max(1, Math.min(255, Number.isFinite(opts.tolerance) ? opts.tolerance : 24));
  const eThr = Math.max(0, Math.min(1, Number.isFinite(opts.edgeThreshold) ? opts.edgeThreshold : 0.18));
  const g = opts.edges && opts.edges.length === n ? opts.edges : edgeStrength(px, docW, docH);
  let fgC = kmeansRGB(px, seeds, 3);
  
  let spread = 0; { const S = seeds.length > 3000 ? seeds.filter((_, k) => k % Math.ceil(seeds.length / 3000) === 0) : seeds; for (const i of S) spread += nearestSq(px, i, fgC); spread = Math.sqrt(spread / S.length); }
  const far = Math.max(tol, 2.5 * spread) ** 2;
  const step = Math.max(1, Math.round(Math.sqrt(n / 60000)));
  const pick = C => { const out = []; for (let y = 0; y < docH; y += step) for (let x = (y / step) % 2 ? step >> 1 : 0; x < docW; x += step) { const i = y * docW + x; if (!seedMask[i] && nearestSq(px, i, C) > far) out.push(i); } return out; };
  let bgC = kmeansRGB(px, pick(fgC), 6);
  let lab = null;
  for (let pass = 0; pass < 2; pass++) {
    

    const lut = new Uint8Array(32768);
    if (!bgC.length) lut.fill(1);
    else for (let r = 0; r < 32; r++) for (let gg = 0; gg < 32; gg++) for (let b = 0; b < 32; b++) {
      const c = [r * 8 + 4, gg * 8 + 4, b * 8 + 4];
      const d = C => { let m = Infinity; for (const q of C) { const e = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (e < m) m = e; } return m; };
      lut[(r << 10) | (gg << 5) | b] = d(fgC) <= d(bgC) ? 1 : 0;
    }
    const isFg = i => { const o = i * 4; return px[o + 3] >= 8 && lut[((px[o] >> 3) << 10) | ((px[o + 1] >> 3) << 5) | (px[o + 2] >> 3)] === 1; };
    lab = new Uint8Array(n);
    let stack = new Int32Array(Math.max(1024, seeds.length)), top = 0;
    const push = i => { if (top === stack.length) { const q = new Int32Array(stack.length * 2); q.set(stack); stack = q; } stack[top++] = i; };
    for (const i of seeds) { lab[i] = 1; push(i); }
    while (top > 0) {
      const i = stack[--top];
      const y = (i / docW) | 0, x = i - y * docW;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
        const j = ny * docW + nx;
        if (lab[j]) continue;
        if (g[j] >= eThr) { lab[j] = 2; continue; }          
        if (isFg(j)) { lab[j] = 1; push(j); } else lab[j] = 2;
      }
    }
    if (pass === 0) {
      const fgS = [], bgS = [];
      for (let i = 0; i < n; i += step) (lab[i] === 1 ? fgS : bgS).push(i);
      if (fgS.length) fgC = kmeansRGB(px, fgS.concat(seeds.length > 4000 ? seeds.filter((_, k) => k % 4 === 0) : seeds), 3);
      const bgFar = bgS.filter(i => nearestSq(px, i, fgC) > far * 0.5);
      if (bgFar.length) bgC = kmeansRGB(px, bgFar, 6);
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lab[i] === 1) out[i] = 255;
  
  for (let i = 0; i < n; i++) {
    if (out[i]) continue;
    const y = (i / docW) | 0, x = i - y * docW;
    if (!((x > 0 && out[i - 1] === 255) || (x < docW - 1 && out[i + 1] === 255) || (y > 0 && out[i - docW] === 255) || (y < docH - 1 && out[i + docW] === 255))) continue;
    const df = Math.sqrt(nearestSq(px, i, fgC)), db = bgC.length ? Math.sqrt(nearestSq(px, i, bgC)) : 255;
    out[i] = Math.round(255 * Math.min(0.5, db / (df + db + 1e-6)));
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}















export function objectSelectionCluster(rgba, docW, docH, rect, opts = {}) {
  assertDoc(docW, docH);
  const px = pixelsRGBA(rgba, docW, docH);
  const n = docW * docH;
  const r = normRect(rect);
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(docW, r.x + r.width), y1 = Math.min(docH, r.y + r.height);
  const W = x1 - x0, H = y1 - y0;
  if (W < 3 || H < 3) return emptySelection(docW, docH);
  const region = opts.region && opts.region.length === n ? opts.region : null;
  const inR = i => { const y = (i / docW) | 0, x = i - y * docW; return x >= x0 && y >= y0 && x < x1 && y < y1 && (!region || !!region[i]); };
  const K = Math.max(1, Math.min(8, opts.K | 0 || 4));
  const sides = opts.bgSides || 'tblr';
  const ring = Math.max(2, Math.round(Math.min(W, H) * 0.015));
  
  const bgIdx = [], fgIdx = [];
  const isBorder = new Uint8Array(n);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * docW + x; if (!inR(i)) continue;
    let b = (sides.includes('l') && x < x0 + ring) || (sides.includes('t') && y < y0 + ring)
      || (sides.includes('r') && x >= x1 - ring) || (sides.includes('b') && y >= y1 - ring);
    if (!b && region) b = !inR(i - 1) || !inR(i + 1) || !inR(i - docW) || !inR(i + docW);
    if (b) { isBorder[i] = 1; bgIdx.push(i); }
    else if (x >= x0 + W / 4 && x < x1 - W / 4 && y >= y0 + H / 4 && y < y1 - H / 4) fgIdx.push(i);
  }
  
  if (!region) {
    for (let y = Math.max(0, y0 - ring); y < Math.min(docH, y1 + ring); y++) for (let x = Math.max(0, x0 - ring); x < Math.min(docW, x1 + ring); x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      bgIdx.push(y * docW + x);
    }
  }
  if (!bgIdx.length || !fgIdx.length) return emptySelection(docW, docH);
  
  const sub = (arr, m) => { if (arr.length <= m) return arr; const out = [], st = arr.length / m; for (let k = 0; k < m; k++) out.push(arr[Math.floor(k * st)]); return out; };
  const kmeans = (idxs) => {
    const S = sub(idxs, 6000);
    const C = [];
    
    C.push([px[S[S.length >> 1] * 4], px[S[S.length >> 1] * 4 + 1], px[S[S.length >> 1] * 4 + 2]]);
    while (C.length < K) {
      let best = -1, bi = 0;
      for (const i of S) { let d = Infinity; for (const c of C) { const e = (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2; if (e < d) d = e; } if (d > best) { best = d; bi = i; } }
      if (best <= 0) break;
      C.push([px[bi * 4], px[bi * 4 + 1], px[bi * 4 + 2]]);
    }
    for (let it = 0; it < 6; it++) {
      const acc = C.map(() => [0, 0, 0, 0]);
      for (const i of S) { let d = Infinity, k = 0; for (let c = 0; c < C.length; c++) { const e = (px[i * 4] - C[c][0]) ** 2 + (px[i * 4 + 1] - C[c][1]) ** 2 + (px[i * 4 + 2] - C[c][2]) ** 2; if (e < d) { d = e; k = c; } }
        const a = acc[k]; a[0] += px[i * 4]; a[1] += px[i * 4 + 1]; a[2] += px[i * 4 + 2]; a[3]++; }
      for (let c = 0; c < C.length; c++) if (acc[c][3]) C[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
    }
    return C;
  };
  const nearest = (i, C) => { let d = Infinity; for (const c of C) { const e = (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2; if (e < d) d = e; } return d; };
  let bgC = kmeans(bgIdx), fgC = kmeans(fgIdx);
  
  fgC = fgC.filter(c => { const e = bgC.reduce((m, b) => Math.min(m, (c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2 + (c[2] - b[2]) ** 2), Infinity); return e > 9; });
  if (!fgC.length) return emptySelection(docW, docH);
  const lab = new Uint8Array(n);        
  const iters = Math.max(1, Math.min(8, opts.iterations | 0 || 3));
  const lut = new Uint8Array(32768);
  for (let it = 0; it < iters; it++) {
    const fgNew = [], bgNew = bgIdx.slice();
    
    for (let q = 0; q < 32768; q++) {
      const c0 = ((q >> 10) & 31) * 8 + 4, c1 = ((q >> 5) & 31) * 8 + 4, c2 = (q & 31) * 8 + 4;
      let df = Infinity, db = Infinity;
      for (const c of fgC) { const e = (c0 - c[0]) ** 2 + (c1 - c[1]) ** 2 + (c2 - c[2]) ** 2; if (e < df) df = e; }
      for (const c of bgC) { const e = (c0 - c[0]) ** 2 + (c1 - c[1]) ** 2 + (c2 - c[2]) ** 2; if (e < db) db = e; }
      lut[q] = df < db ? 1 : 0;
    }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * docW + x;
      if ((region && !region[i]) || isBorder[i]) { lab[i] = 0; continue; }
      const o = i * 4;
      if (px[o + 3] < 8) { lab[i] = 0; continue; }       
      const f = lut[((px[o] >> 3) << 10) | ((px[o + 1] >> 3) << 5) | (px[o + 2] >> 3)] === 1;
      lab[i] = f ? 1 : 0;
      if ((x + y) % 3 === 0) (f ? fgNew : bgNew).push(i);
    }
    if (it < iters - 1) { if (!fgNew.length) break; fgC = kmeans(fgNew); bgC = kmeans(bgNew); }
  }
  
  const sm = new Uint8Array(n);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * docW + x; let c = 0, t = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= docW || Y >= docH) continue; t++; c += lab[Y * docW + X]; }
    sm[i] = c * 2 > t ? 255 : 0;
  }
  


  const cr = Math.max(1, Math.min(12, Math.round(Math.min(W, H) * 0.01)));
  {
    
    const box = (src, test) => {
      const W1 = docW + 1, S = new Uint32Array(W1 * (docH + 1));
      for (let y = 0; y < docH; y++) { let row = 0; for (let x = 0; x < docW; x++) { row += src[y * docW + x] ? 1 : 0; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + row; } }
      const out = new Uint8Array(n);
      for (let y = 0; y < docH; y++) {
        const ya = Math.max(0, y - cr), yb = Math.min(docH - 1, y + cr);
        for (let x = 0; x < docW; x++) {
          const xa = Math.max(0, x - cr), xb = Math.min(docW - 1, x + cr);
          const c = S[(yb + 1) * W1 + xb + 1] - S[ya * W1 + xb + 1] - S[(yb + 1) * W1 + xa] + S[ya * W1 + xa];
          out[y * docW + x] = test(c, (yb - ya + 1) * (xb - xa + 1)) ? 255 : 0;
        }
      }
      return out;
    };
    const closed = box(box(sm, c => c > 0), (c, area) => c === area);
    for (let i = 0; i < n; i++) if (closed[i]) sm[i] = 255;    
  }
  for (let i = 0; i < n; i++) sm[i] = sm[i] >= 128 ? 255 : 0;
  let solid = opts.largestOnly === false ? sm : largestComponent(sm, docW, docH);
  if (opts.fillHoles !== false) solid = fillHoles(solid, docW, docH);
  
  const out = Uint8Array.from(solid);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * docW + x;
    const edge = (x > 0 && solid[i - 1] !== solid[i]) || (x < docW - 1 && solid[i + 1] !== solid[i])
      || (y > 0 && solid[i - docW] !== solid[i]) || (y < docH - 1 && solid[i + docW] !== solid[i]);
    if (!edge) continue;
    const df = Math.sqrt(nearest(i, fgC)), db = Math.sqrt(nearest(i, bgC));
    const a = db / (df + db + 1e-6);
    out[i] = solid[i] ? Math.round(255 * Math.max(0.5, a)) : Math.round(255 * Math.min(0.5, a));
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}









export function findObjects(rgba, docW, docH, opts = {}) {
  assertDoc(docW, docH);
  const n = docW * docH;
  const whole = { x: 0, y: 0, width: docW, height: docH };
  const fg = opts.method === 'flood'
    ? objectSelection(rgba, docW, docH, whole, { tolerance: opts.tolerance, edgeThreshold: opts.edgeThreshold, edges: opts.edges, largestOnly: false, fillHoles: false })
    : objectSelectionCluster(rgba, docW, docH, whole, { largestOnly: false, fillHoles: true });   
  const cov = new Uint8Array(n);
  blitInto(cov, docW, docH, 0, 0, fg);
  const labels = new Int32Array(n);
  const minArea = Math.max(16, Number.isFinite(opts.minArea) ? opts.minArea : Math.round(n * 0.001));
  const objects = [];
  let stack = new Int32Array(1024);
  let next = 1;
  const tmp = [];
  for (let s = 0; s < n; s++) {
    if (cov[s] < 128 || labels[s]) continue;
    let top = 0, cnt = 0, x0 = docW, y0 = docH, x1 = -1, y1 = -1;
    const push = i => { if (top === stack.length) { const g = new Int32Array(stack.length * 2); g.set(stack); stack = g; } stack[top++] = i; };
    const id = next++;
    labels[s] = id; push(s); tmp.length = 0;
    while (top > 0) {
      const i = stack[--top]; cnt++; tmp.push(i);
      const y = (i / docW) | 0, x = i - y * docW;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= docW || ny >= docH) continue;
        const j = ny * docW + nx;
        if (cov[j] >= 128 && !labels[j]) { labels[j] = id; push(j); }
      }
    }
    if (cnt < minArea) { for (const i of tmp) labels[i] = -1; continue; }   
    objects.push({ id, area: cnt, x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  }
  for (let i = 0; i < n; i++) if (labels[i] < 0) labels[i] = 0;
  return { labels, cov, objects };
}


export function objectFromLabels(found, docW, docH, id, opts = {}) {
  assertDoc(docW, docH);
  const { labels, cov } = found;
  const n = docW * docH;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (labels[i] === id) solid[i] = 255;
  const out = opts.fillHoles === false ? Uint8Array.from(solid) : fillHoles(solid, docW, docH);
  for (let i = 0; i < n; i++) {
    if (out[i] || !cov[i]) continue;
    const y = (i / docW) | 0, x = i - y * docW;
    if ((x > 0 && solid[i - 1]) || (x < docW - 1 && solid[i + 1]) || (y > 0 && solid[i - docW]) || (y < docH - 1 && solid[i + docW])) out[i] = cov[i];
  }
  return trimSelection({ x: 0, y: 0, width: docW, height: docH, data: out, docW, docH });
}




export function hardenSelection(sel) {
  assertSel(sel);
  const d = selData(sel);
  if (isSparseSel(d)) {
    const tiles = new Map(), fill = (d.__fill | 0) >= 128 ? 255 : 0;
    for (const [k, t] of d.__tiles) {
      const out = new Uint8Array(t.length);
      let any = false;
      for (let i = 0; i < t.length; i++) { const v = t[i] >= 128 ? 255 : 0; out[i] = v; if (v !== fill) any = true; }
      if (any) tiles.set(k, out);
    }
    return trimSelection({ ...sel, data: coverageFromTiles(sel.width, sel.height, fill, tiles) });
  }
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i] >= 128 ? 255 : 0;
  return trimSelection({ ...sel, data: out });
}




export function contrastSelection(sel, pct = 0) {
  assertSel(sel);
  const c = Math.max(0, Math.min(100, +pct || 0));
  if (!c) return cloneSelection(sel);
  if (c >= 100) return hardenSelection(sel);
  const k = 1 / (1 - c / 100);
  const conv = v => { const q = Math.round((v - 127.5) * k + 127.5); return q < 0 ? 0 : q > 255 ? 255 : q; };
  const d = selData(sel);
  if (isSparseSel(d)) {
    const fill = conv(d.__fill | 0), tiles = new Map();
    for (const [key, t] of d.__tiles) {
      const out = new Uint8Array(t.length);
      let any = false;
      for (let i = 0; i < t.length; i++) { const v = conv(t[i]); out[i] = v; if (v !== fill) any = true; }
      if (any) tiles.set(key, out);
    }
    return trimSelection({ ...sel, data: coverageFromTiles(sel.width, sel.height, fill, tiles) });
  }
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = conv(d[i]);
  return trimSelection({ ...sel, data: out });
}









export function refineEdgeSelection(sel, rgba, docW, docH, opts = {}) {
  assertSel(sel);
  assertDoc(docW, docH);
  const R = Math.max(0, Math.round(+opts.radius || 0));
  if (!R || sel.width === 0 || sel.height === 0) return cloneSelection(sel);


  if (sel.width * sel.height > 16e6)
    throw new RangeError('边缘细化：选区超过 1600 万像素，当前实现需要整幅浮点缓冲；请先缩小选区。');
  const px = pixelsRGBA(rgba, docW, docH);
  const pad = R * 2 + 2;
  const x0 = Math.max(0, sel.x - pad), y0 = Math.max(0, sel.y - pad);
  const x1 = Math.min(docW, sel.x + sel.width + pad), y1 = Math.min(docH, sel.y + sel.height + pad);
  const w = x1 - x0, h = y1 - y0;
  const m = new Uint8Array(w * h);
  blitInto(m, w, h, x0, y0, sel);
  
  const INF = 1 << 20;
  const din = new Int32Array(w * h), dout = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) { din[i] = m[i] >= 128 ? INF : 0; dout[i] = m[i] >= 128 ? 0 : INF; }
  const cham = d => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i]; if (!v) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 1); if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 1);
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i]; if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1); if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 1); if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + 1);
      d[i] = v;
    }
  };
  cham(din); cham(dout);
  let g = null;
  if (opts.smart) { g = new Float32Array(w * h); const e = opts.edges && opts.edges.length === docW * docH ? opts.edges : edgeStrength(px, docW, docH);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = e[(y0 + y) * docW + x0 + x]; }
  const band = i => { const d = Math.max(din[i], dout[i]) - 1; const r = g ? (g[i] > 0.12 ? R : Math.max(1, R >> 1)) : R; return d < r; };
  
  const W1 = w + 1;
  const sF = [new Float64Array(W1 * (h + 1)), new Float64Array(W1 * (h + 1)), new Float64Array(W1 * (h + 1))], cF = new Float64Array(W1 * (h + 1));
  const sB = [new Float64Array(W1 * (h + 1)), new Float64Array(W1 * (h + 1)), new Float64Array(W1 * (h + 1))], cB = new Float64Array(W1 * (h + 1));
  const inBand = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inBand[i] = band(i) ? 1 : 0;
  for (let y = 0; y < h; y++) {
    const rs = [0, 0, 0], rb = [0, 0, 0]; let rcF = 0, rcB = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = ((y0 + y) * docW + x0 + x) * 4;
      if (!inBand[i]) {
        if (m[i] >= 128) { rs[0] += px[p]; rs[1] += px[p + 1]; rs[2] += px[p + 2]; rcF++; }
        else { rb[0] += px[p]; rb[1] += px[p + 1]; rb[2] += px[p + 2]; rcB++; }
      }
      const o = (y + 1) * W1 + x + 1, u = y * W1 + x + 1;
      for (let c = 0; c < 3; c++) { sF[c][o] = sF[c][u] + rs[c]; sB[c][o] = sB[c][u] + rb[c]; }
      cF[o] = cF[u] + rcF; cB[o] = cB[u] + rcB;
    }
  }
  const box = (a, xa, ya, xb, yb) => a[(yb + 1) * W1 + xb + 1] - a[ya * W1 + xb + 1] - a[(yb + 1) * W1 + xa] + a[ya * W1 + xa];
  const out = Uint8Array.from(m);
  const win = R + 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!inBand[i]) continue;
    const xa = Math.max(0, x - win), xb = Math.min(w - 1, x + win), ya = Math.max(0, y - win), yb = Math.min(h - 1, y + win);
    const nf = box(cF, xa, ya, xb, yb), nb = box(cB, xa, ya, xb, yb);
    if (nf < 1 || nb < 1) continue;
    const p = ((y0 + y) * docW + x0 + x) * 4;
    let num = 0, den = 0;
    for (let c = 0; c < 3; c++) {
      const F = box(sF[c], xa, ya, xb, yb) / nf, B = box(sB[c], xa, ya, xb, yb) / nb;
      num += (px[p + c] - B) * (F - B); den += (F - B) * (F - B);
    }
    if (den < 12 * 12) continue;                       
    const a = Math.max(0, Math.min(1, num / den));
    out[i] = Math.round(a * 255);
  }
  return trimSelection({ x: x0, y: y0, width: w, height: h, data: out, docW, docH });
}













export function selectionToMaskGray(sel, bounds) {
  assertSel(sel);
  const r = normRect(bounds);
  if (r.width <= 0 || r.height <= 0)
    throw new RangeError(`目标 bounds 尺寸非法：${r.width}×${r.height}（宽高都必须 > 0）`);
  const gray = new Uint8Array(r.width * r.height);
  blitInto(gray, r.width, r.height, r.x, r.y, sel);
  return {
    gray,
    bounds: { top: r.y, left: r.x, bottom: r.y + r.height, right: r.x + r.width },
  };
}












export function selectionToPath(sel, opts = {}) {
  assertSel(sel);
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 128;
  const { x: ox, y: oy, width: w, height: h } = sel;
  if (w === 0 || h === 0) return [];




  const dv0 = sel.data;
  if (dv0 && dv0.__virtual && w * h > SPARSE_MIN) {
    if (!dv0.__tiles.size && dv0.__fill < threshold) return [];
    return [[ox, oy, ox + w, oy, ox + w, oy + h, ox, oy + h, ox, oy]];
  }
  const d = selData(sel);
  const inside = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[j * w + i] >= threshold;

  
  const stride = w + 1;
  const outA = new Int32Array((w + 1) * (h + 1)).fill(-1);
  const outB = new Int32Array((w + 1) * (h + 1)).fill(-1);
  const addEdge = (from, to) => { if (outA[from] < 0) outA[from] = to; else outB[from] = to; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inside(i, j)) continue;
    const tl = j * stride + i, tr = tl + 1, bl = tl + stride, br = bl + 1;
    if (!inside(i, j - 1)) addEdge(tl, tr);   
    if (!inside(i + 1, j)) addEdge(tr, br);   
    if (!inside(i, j + 1)) addEdge(br, bl);   
    if (!inside(i - 1, j)) addEdge(bl, tl);   
  }

  const usedA = new Uint8Array(outA.length), usedB = new Uint8Array(outA.length);
  const paths = [];
  for (let v0 = 0; v0 < outA.length; v0++) {
    for (let slot = 0; slot < 2; slot++) {
      const first = slot === 0 ? outA[v0] : outB[v0];
      if (first < 0 || (slot === 0 ? usedA[v0] : usedB[v0])) continue;
      
      const pts = [];
      let cur = v0, next = first, useSlot = slot;
      let px = -1, py = -1;   
      for (let guard = 0; guard < outA.length * 2 + 8; guard++) {
        if (useSlot === 0) usedA[cur] = 1; else usedB[cur] = 1;
        pts.push(cur % stride, (cur / stride) | 0);
        const dx = (next % stride) - (cur % stride), dy = ((next / stride) | 0) - ((cur / stride) | 0);
        px = dx; py = dy;
        cur = next;
        if (cur === v0) break;
        
        const a = outA[cur], b = outB[cur];
        const aFree = a >= 0 && !usedA[cur], bFree = b >= 0 && !usedB[cur];
        if (!aFree && !bFree) { next = -1; break; }
        if (aFree && bFree) {
          const score = (t) => {
            const tx = (t % stride) - (cur % stride), ty = ((t / stride) | 0) - ((cur / stride) | 0);
            if (tx === -py && ty === px) return 0;      
            if (tx === px && ty === py) return 1;       
            if (tx === py && ty === -px) return 2;      
            return 3;                                   
          };
          if (score(a) <= score(b)) { next = a; useSlot = 0; } else { next = b; useSlot = 1; }
        } else if (aFree) { next = a; useSlot = 0; } else { next = b; useSlot = 1; }
      }
      if (next < 0 || pts.length < 6) continue;
      
      const simple = [];
      const m = pts.length / 2;
      for (let k = 0; k < m; k++) {
        const x = pts[k * 2] + ox, y = pts[k * 2 + 1] + oy;
        const p = (k + m - 1) % m, q = (k + 1) % m;
        const ax = pts[p * 2] + ox, ay = pts[p * 2 + 1] + oy;
        const bx = pts[q * 2] + ox, by = pts[q * 2 + 1] + oy;
        if ((x - ax) * (by - y) - (y - ay) * (bx - x) === 0) continue;   
        simple.push(x, y);
      }
      if (simple.length >= 6) paths.push(simple);
    }
  }
  return paths;
}
