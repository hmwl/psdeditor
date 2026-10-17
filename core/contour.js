














export function contourPointsOf(desc) {
  const raw = desc && Array.isArray(desc['Crv ']) ? desc['Crv '] : [];
  const nv = v => (v && typeof v === 'object' ? +v.value : +v);
  const mx = raw.reduce((m, p) => Math.max(m, Math.abs(nv(p.Hrzn)) || 0, Math.abs(nv(p.Vrtc)) || 0), 0), k = mx > 100 ? 1 : 2.55;
  return raw.map(p => [nv(p.Hrzn) * k, nv(p.Vrtc) * k, p.Cnty !== false])
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => [Math.max(0, Math.min(255, p[0])), Math.max(0, Math.min(255, p[1])), p[2]])
    .sort((a, b) => a[0] - b[0]);
}

export const isLinearContour = pts => !pts || pts.length < 2 ||
  (pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255);


export function contourLutFromPoints(points) {
  if (isLinearContour(points)) return null;
  const P = points.map(p => ({ x: p[0], y: p[1], c: p[2] !== false }));
  if (P[0].x > 0) P.unshift({ x: 0, y: P[0].y, c: false });
  if (P[P.length - 1].x < 255) P.push({ x: 255, y: P[P.length - 1].y, c: false });
  const n = P.length, d = new Float64Array(n - 1), m = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (P[i + 1].y - P[i].y) / Math.max(1e-9, P[i + 1].x - P[i].x);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const lut = new Uint8Array(256);
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < n - 2 && x > P[seg + 1].x) seg++;
    const A = P[seg], B = P[seg + 1], w = Math.max(1e-9, B.x - A.x), t = Math.max(0, Math.min(1, (x - A.x) / w));
    let y;
    if (!A.c && !B.c) y = A.y + (B.y - A.y) * t;
    else {
      const ma = A.c ? m[seg] : d[seg], mb = B.c ? m[seg + 1] : d[seg];
      const t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * A.y + (t3 - 2 * t2 + t) * w * ma + (-2 * t3 + 3 * t2) * B.y + (t3 - t2) * w * mb;
    }
    lut[x] = Math.max(0, Math.min(255, Math.round(y)));
  }
  return lut;
}


export function contourDescFrom(raw, old = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: '值必须是 { name?, points: [[x, y, smooth?], …] }' };
  const pts = raw.points;
  if (!Array.isArray(pts)) return { error: 'points 必须是数组' };
  if (pts.length && (pts.length < 2 || pts.length > 64)) return { error: `点数必须是 0（线性）或 2…64 个，收到 ${pts.length}` };
  const list = [];
  let lastX = -1;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    if (!Array.isArray(p) || p.length < 2) return { error: `points[${k}] 必须是 [x, y] 或 [x, y, smooth]` };
    const x = Math.round(+p[0]), y = Math.round(+p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 255 || y < 0 || y > 255) return { error: `points[${k}] 的坐标必须在 0…255，收到 ${JSON.stringify(p)}` };
    if (x <= lastX) return { error: `points 必须按 x 从小到大、不重复（第 ${k} 个点 x=${x}）` };
    lastX = x;
    const item = { __name: '', __classID: 'CrPt', Hrzn: x, Vrtc: y };
    if (p[2] === false) item.Cnty = false;
    item.__doub = { Hrzn: true, Vrtc: true };
    list.push(item);
  }
  if (list.length && (list[0].Hrzn !== 0 || list[list.length - 1].Hrzn !== 255)) return { error: '第一个点的 x 必须是 0，最后一个点的 x 必须是 255' };
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 255) : (old && typeof old['Nm  '] === 'string' ? old['Nm  '] : '');
  return { desc: { __name: (old && old.__name) || '', __classID: 'ShpC', 'Nm  ': name, 'Crv ': list } };
}

const S = true, C = false;   
export const CONTOUR_PRESETS = [
  { name: '线性', points: [] },
  { name: '锥形', points: [[0, 0, C], [128, 255, C], [255, 0, C]] },
  { name: '锥形-反转', points: [[0, 255, C], [128, 0, C], [255, 255, C]] },
  { name: '高斯', points: [[0, 0, S], [64, 20, S], [128, 128, S], [191, 235, S], [255, 255, S]] },
  { name: '半圆', points: [[0, 0, S], [48, 153, S], [128, 221, S], [207, 250, S], [255, 255, S]] },
  { name: '内凹-深', points: [[0, 0, S], [64, 6, S], [128, 36, S], [191, 115, S], [255, 255, S]] },
  { name: '内凹-浅', points: [[0, 0, S], [128, 72, S], [255, 255, S]] },
  { name: '环形', points: [[0, 0, S], [64, 0, S], [128, 255, S], [192, 0, S], [255, 0, S]] },
  { name: '环形-双', points: [[0, 0, S], [48, 255, S], [96, 0, S], [160, 255, S], [208, 0, S], [255, 0, S]] },
  { name: '滚动斜坡-递减', points: [[0, 255, S], [128, 170, S], [255, 0, S]] },
  { name: '圆角阶梯', points: [[0, 0, S], [56, 0, S], [88, 128, S], [160, 128, S], [192, 255, S], [255, 255, S]] },
  { name: '锯齿 1', points: [[0, 0, C], [63, 255, C], [64, 0, C], [127, 255, C], [128, 0, C], [191, 255, C], [192, 0, C], [255, 255, C]] },
];
