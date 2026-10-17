











export function computeHomography(w, h, quad) {
  return computeHomographyQuad([0, 0, w, 0, w, h, 0, h], quad);
}


export function computeHomographyQuad(srcQuad, dstQuad) {
  if (!srcQuad || !dstQuad || srcQuad.length < 8 || dstQuad.length < 8) return null;
  const src = [[srcQuad[0], srcQuad[1]], [srcQuad[2], srcQuad[3]], [srcQuad[4], srcQuad[5]], [srcQuad[6], srcQuad[7]]];
  const dst = [[dstQuad[0], dstQuad[1]], [dstQuad[2], dstQuad[3]], [dstQuad[4], dstQuad[5]], [dstQuad[6], dstQuad[7]]];
  
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  const hs = solveLinear(A, b);
  if (!hs) return null;
  return [hs[0], hs[1], hs[2], hs[3], hs[4], hs[5], hs[6], hs[7], 1];
}


export function applyHomography(H, x, y) {
  if (!H) return { x, y };
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}


export function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [A * id, (c * h - b * i) * id, (b * f - c * e) * id,
          B * id, (a * i - c * g) * id, (c * d - a * f) * id,
          C * id, (b * g - a * h) * id, (a * e - b * d) * id];
}


function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat(b[i]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map(row => row[n]);
}
