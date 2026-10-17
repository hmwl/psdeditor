



















export const STACK_MODES = {
  none: '无', entropy: '熵', kurtosis: '峰度', max: '最大值', mean: '平均值', median: '中间值',
  min: '最小值', range: '范围', skewness: '偏度', stdDev: '标准差', sum: '总和', variance: '方差',
};

export const STACK_PLUGIN_IDS = {
  entropy: 'entr', kurtosis: 'kurt', max: 'maxx', mean: 'avrg', median: 'medn', min: 'minn',
  range: 'rang', skewness: 'skew', stdDev: 'stdv', sum: 'summ', variance: 'vari',
};








export function stackCombine(layers, width, height, mode) {
  const n = width * height, N = layers.length;
  const out = new Uint8ClampedArray(n * 4);
  if (!N) return out;
  const vals = new Float64Array(N), hist = new Map();
  for (let p = 0; p < n; p++) {
    const q = p * 4;
    let amax = 0, cnt = 0;
    for (let k = 0; k < N; k++) { const a = layers[k][q + 3]; if (a) { cnt++; if (a > amax) amax = a; } }
    if (!cnt) continue;
    out[q + 3] = amax;
    for (let c = 0; c < 3; c++) {
      let m = 0;
      for (let k = 0; k < N; k++) { const L = layers[k]; if (L[q + 3]) vals[m++] = L[q + c]; }
      out[q + c] = stat(vals, m, mode, hist);
    }
  }
  return out;
}

function stat(v, m, mode, hist) {
  switch (mode) {
    case 'max': { let r = v[0]; for (let i = 1; i < m; i++) if (v[i] > r) r = v[i]; return r; }
    case 'min': { let r = v[0]; for (let i = 1; i < m; i++) if (v[i] < r) r = v[i]; return r; }
    case 'range': { let a = v[0], b = v[0]; for (let i = 1; i < m; i++) { if (v[i] < a) a = v[i]; if (v[i] > b) b = v[i]; } return b - a; }
    case 'sum': { let s = 0; for (let i = 0; i < m; i++) s += v[i]; return s; }
    case 'median': {
      const a = Array.prototype.slice.call(v, 0, m).sort((x, y) => x - y);
      return m % 2 ? a[(m - 1) >> 1] : (a[m / 2 - 1] + a[m / 2]) / 2;
    }
    case 'entropy': {
      if (m < 2) return 0;
      hist.clear();
      for (let i = 0; i < m; i++) hist.set(v[i], (hist.get(v[i]) || 0) + 1);
      let e = 0; for (const c of hist.values()) { const p = c / m; e -= p * Math.log2(p); }
      return e / Math.log2(m) * 255;
    }
    default: {
      let s = 0; for (let i = 0; i < m; i++) s += v[i];
      const mu = s / m;
      if (mode === 'mean') return mu;
      let s2 = 0, s3 = 0, s4 = 0;
      for (let i = 0; i < m; i++) { const d = v[i] - mu, d2 = d * d; s2 += d2; s3 += d2 * d; s4 += d2 * d2; }
      const varp = s2 / m;
      if (mode === 'variance') return varp;
      if (mode === 'stdDev') return Math.sqrt(varp);
      if (varp <= 1e-12) return 128;
      if (mode === 'skewness') return 128 + 32 * (s3 / m) / Math.pow(varp, 1.5);
      if (mode === 'kurtosis') return 128 + 16 * ((s4 / m) / (varp * varp) - 3);
      return mu;
    }
  }
}
export default { STACK_MODES, STACK_PLUGIN_IDS, stackCombine };
