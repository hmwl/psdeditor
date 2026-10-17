export function lodScale(value = 1) {
  if (!Number.isInteger(value) || value < 1 || value > 64 || (value & (value - 1))) throw new Error('LOD 比例必须是 1 到 64 的二次幂');
  return value;
}
export function lodForScale(deviceScale) {
  if (!(deviceScale > 0) || !Number.isFinite(deviceScale)) return 1;
  
  
  return 2 ** Math.max(0, Math.min(6, Math.floor(Math.log2(1 / deviceScale) + 1e-10)));
}




export function createLodAccumulator(width, height, scale) {
  scale = lodScale(scale);
  const sampleWidth = Math.ceil(width / scale), sampleHeight = Math.ceil(height / scale);
  if (!Number.isInteger(width) || !Number.isInteger(height) || !(width > 0 && height > 0) || sampleWidth * sampleHeight > 1048576) throw new Error('LOD 累加范围非法或过大');
  
  
  
  const sums = new Uint32Array(sampleWidth * sampleHeight * 4);
  let nextRow = 0;
  return {
    get bytes() { return sums.byteLength; },
    add(data, rows, offsetY = nextRow) {
      if (!Number.isInteger(rows) || rows < 1 || offsetY !== nextRow || offsetY + rows > height || data.length !== width * rows * 4) throw new Error('LOD 条带顺序或尺寸不一致');
      for (let y = 0; y < rows; y++) {
        const row = Math.floor((y + offsetY) / scale) * sampleWidth * 4;
        for (let px = 0; px < sampleWidth; px++) {
          const end = Math.min(width, (px + 1) * scale); let r = 0, g = 0, b = 0, alpha = 0;
          for (let x = px * scale; x < end; x++) {
            const i = (y * width + x) * 4, a = data[i + 3];
            r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a; alpha += a;
          }
          const o = row + px * 4; sums[o] += r; sums[o + 1] += g; sums[o + 2] += b; sums[o + 3] += alpha;
        }
      }
      nextRow += rows;
    },
    finish() {
      if (nextRow !== height) throw new Error('LOD 条带尚未完整');
      const data = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);
      for (let y = 0; y < sampleHeight; y++) for (let x = 0; x < sampleWidth; x++) {
        const o = (y * sampleWidth + x) * 4, a = sums[o + 3];
        if (a) { data[o] = Math.round(sums[o] / a); data[o + 1] = Math.round(sums[o + 1] / a); data[o + 2] = Math.round(sums[o + 2] / a); }
        data[o + 3] = Math.round(a / (Math.min(scale, width - x * scale) * Math.min(scale, height - y * scale)));
      }
      return { data, sampleWidth, sampleHeight, scale };
    },
  };
}




export function createLodTileSession(readNative, toRGBA, { rowBudget = 16 * 1048576, stats = {} } = {}) {
  const rows = new Map(); let geometry = '', bytes = 0;
  const clear = () => { rows.clear(); bytes = 0; };
  return {
    get rowBytes() { return bytes; }, clearRows: clear,
    async tile(job) {
      const scale = lodScale(job.tile.scale), t = job.tile;
      const x = Math.max(0, t.x | 0), y = Math.max(0, t.y | 0), width = Math.min(t.width | 0, job.width - x), height = Math.min(t.height | 0, job.height - y);
      if (!(width > 0 && height > 0) || x % scale || y % scale) throw new Error('LOD 瓦片范围或网格不一致');
      const sig = `${job.width}:${job.height}:${job.depth}:${job.mode}:${scale}`;
      if (sig !== geometry) { clear(); geometry = sig; }
      const sampleWidth = Math.ceil(width / scale), sampleHeight = Math.ceil(height / scale), data = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);
      for (let py = 0; py < sampleHeight; py++) {
        const nativeY = y + py * scale, key = nativeY / scale;
        let row = rows.get(key);
        if (row) { stats.lodRowHits = (stats.lodRowHits || 0) + 1; rows.delete(key); rows.set(key, row); }
        else {
          const h = Math.min(scale, job.height - nativeY), acc = createLodAccumulator(job.width, h, scale);
          const strip = Math.max(1, Math.min(h, Math.floor(1048576 / (job.width * 4))));
          for (let dy = 0; dy < h; dy += strip) {
            const count = Math.min(strip, h - dy);
            const raw = await readNative({ ...job, tile: { x: 0, y: nativeY + dy, width: job.width, height: count, noRowCache: true } });
            if (!raw) throw new Error('此通道不支持分级瓦片');
            acc.add(toRGBA(raw.planes, raw.width, raw.height, job.mode), count);
            stats.lodPeakBandPixels = Math.max(stats.lodPeakBandPixels || 0, raw.width * raw.height);
          }
          row = acc.finish().data; stats.lodRowsRead = (stats.lodRowsRead || 0) + 1;
          if (row.byteLength <= rowBudget) {
            rows.set(key, row); bytes += row.byteLength;
            while (bytes > rowBudget) { const first = rows.keys().next().value; bytes -= rows.get(first).byteLength; rows.delete(first); }
          }
        }
        data.set(row.subarray((x / scale) * 4, (x / scale + sampleWidth) * 4), py * sampleWidth * 4);
      }
      return { x, y, width, height, scale, sampleWidth, sampleHeight, data };
    },
  };
}
