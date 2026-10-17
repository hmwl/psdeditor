





















import { applyAdjustment, buildAdjustmentLut } from '../adjust.js';
import { applyLutRGBA } from '../lut.js';
import { lodForScale } from '../psd-lod.js';

const BU = (typeof GPUBufferUsage !== 'undefined') ? GPUBufferUsage : { UNIFORM: 64, COPY_DST: 8, COPY_SRC: 4, MAP_READ: 1 };
const TU = (typeof GPUTextureUsage !== 'undefined') ? GPUTextureUsage : { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 16 };
const SS = (typeof GPUShaderStage !== 'undefined') ? GPUShaderStage : { VERTEX: 1, FRAGMENT: 2 };

export const MODE_CODE = {
  norm: 0, pass: 0, diss: 1, dark: 2, 'mul ': 3, idiv: 4, lbrn: 5, lite: 6, scrn: 7, 'div ': 8, lddg: 9, over: 10, sLit: 11,
  hLit: 12, vLit: 13, lLit: 14, pLit: 15, hMix: 16, diff: 17, smud: 18, fsub: 19, fdiv: 20,
  'hue ': 21, 'sat ': 22, colr: 23, 'lum ': 24, dkCl: 25, lgCl: 26,
};
const F_CLIP = 1, F_MASK = 2, F_BLENDIF = 4, F_CHOFF = 8, F_KNOCK = 16, F_ABCLIP = 32, F_LERP = 64, F_SKIP_DETAIL = 128;
const K_TEX = 0, K_ADJ = 1, K_SURF = 2, K_SOLID = 3;
const LUT3_N = 52;                 
const OP_STRIDE = 512, OP_SIZE = 384;

const WGSL = `
struct Op {
  quad: vec4f, vp: vec4f, xf: vec4f, tile: vec4f, core: vec4f, docv: vec4f,
  color: vec4f, ab: vec4f, biS: array<vec4f, 4>, biD: array<vec4f, 4>, ch: vec4f, p0: vec4f,
  u0: vec4u, u1: vec4u, m: vec4f, n: vec4f, pz: vec4f, grid: vec4f,
};
@group(0) @binding(0) var<uniform> op: Op;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var bdTex: texture_2d<f32>;
@group(0) @binding(3) var maskTex: texture_2d<f32>;
@group(0) @binding(4) var clipTex: texture_2d<f32>;
@group(0) @binding(5) var lut3: texture_3d<f32>;
@group(0) @binding(6) var lut1: texture_2d<f32>;
@group(0) @binding(7) var samp: sampler;
@group(0) @binding(8) var pyrTex: texture_2d<f32>;
@group(0) @binding(9) var detailGrid: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var c = array<vec2f, 6>(vec2f(0., 0.), vec2f(1., 0.), vec2f(0., 1.), vec2f(0., 1.), vec2f(1., 0.), vec2f(1., 1.));
  let t = c[i];
  let px = mix(op.quad.xy, op.quad.zw, t);
  return vec4f(px.x / op.vp.x * 2.0 - 1.0, 1.0 - px.y / op.vp.y * 2.0, 0.0, 1.0);
}
fn docOf(p: vec2f) -> vec2f { return (p - op.xf.zw) / op.xf.xy; }
// 文档坐标 → 源图层本地坐标（带变换的层：仿射逆矩阵；没变换就是减去左上角）
fn localOf(d: vec2f) -> vec2f { return vec2f(op.m.x * d.x + op.m.y * d.y + op.n.x, op.m.z * d.x + op.m.w * d.y + op.n.y); }
fn outsideCore(q: vec2f) -> bool { return q.x < op.core.x || q.y < op.core.y || q.x >= op.core.z || q.y >= op.core.w; }
fn replacedByDetail(q: vec2f) -> bool {
  if ((op.u0.z & ${F_SKIP_DETAIL}u) == 0u) { return false; }
  let t = vec2i(floor(q * op.pz.zw + op.grid.xy));
  let size = vec2i(textureDimensions(detailGrid));
  if (any(t < vec2i(0)) || any(t >= size)) { return false; }
  let resident = round(textureLoad(detailGrid, t, 0).r * 255.0);
  if (op.grid.z > 0.0) { return resident != op.grid.z; }
  return resident > 0.0;
}
/* 第 0 级存直通色（逐字节等于图层像素：100% 视图与 CPU 合成同值），第 1 级起存预乘（mip 平均要预乘才不发黑边）。
 * 所以第 0 级的双线性在着色器里手算：四个像素各自预乘再插值。 */
fn texel0(t: vec2i) -> vec4f {
  let c = textureLoad(srcTex, clamp(t, vec2i(0), vec2i(op.tile.zw) - vec2i(1)), 0);
  return vec4f(c.rgb * c.a, c.a);
}
fn bilinear0(c: vec2f) -> vec4f {          // c = 以像素中心为整数点的坐标
  let f = floor(c); let w = c - f; let i = vec2i(f);
  return mix(mix(texel0(i), texel0(i + vec2i(1, 0)), w.x), mix(texel0(i + vec2i(0, 1)), texel0(i + vec2i(1, 1)), w.x), w.y);
}
fn sampleSrc(q: vec2f, devicePos: vec2f) -> vec4f {
  let local = q - op.tile.xy;
  let size = op.tile.zw;
  let filt = op.u0.w;
  let P = op.n.w;
  let has = op.u1.w;
  let puv = local / op.pz.xy;
  // 细节纹理不在（缩小看全图，或刚放大、细节还在传）：用常驻的金字塔（第 0 级 = 原图的 1/2^P）
  if ((has & 1u) == 0u) { return textureSampleLevel(pyrTex, samp, puv, max(op.n.z - P, 0.0)); }
  if (filt == 2u && (has & 2u) != 0u) {
    if (op.n.z >= P) { return textureSampleLevel(pyrTex, samp, puv, op.n.z - P); }
    if (op.n.z >= P - 1.0 && P >= 2.0) {               // 细节的最后一级与金字塔第 0 级之间插值
      return mix(textureSampleLevel(srcTex, samp, local / size, P - 1.0), textureSampleLevel(pyrTex, samp, puv, 0.0), op.n.z - (P - 1.0));
    }
  }
  // Subtract the tile's device-space origin before dividing. At a fractional
  // zoom, dividing a large document coordinate then subtracting its tile origin
  // can move a boundary sample into the adjacent native pixel through rounding.
  if (filt == 0u) { return texel0(vec2i(floor((devicePos - op.vp.zw) / op.xf.xy))); }
  if (filt == 1u) {
    // 锐利双线性：像素中间是硬方块，只在像素边界的一个设备像素内过渡（1×–2× 之间既不糊也不锯齿）
    let sc = op.docv.w;
    let fl = floor(local);
    let fr = local - fl;
    let rr = 0.5 - 0.5 / sc;
    let cd = fr - 0.5;
    let f = (cd - clamp(cd, vec2f(-rr), vec2f(rr))) * sc + 0.5;
    return bilinear0(fl + f - 0.5);
  }
  let lod = op.n.z;
  if (lod >= 1.0) { return textureSampleLevel(srcTex, samp, local / size, lod); }
  let a = bilinear0(local - 0.5);
  if (lod <= 0.0 || op.tile.z < 2.0 || op.tile.w < 2.0) { return a; }
  let b = textureSampleLevel(srcTex, samp, local / size, 1.0);
  return mix(a, b, lod);
}
fn maskAt(d: vec2f) -> f32 {
  let dims = vec2i(textureDimensions(maskTex));
  let t = vec2i(floor(d));
  if (t.x < 0 || t.y < 0 || t.x >= dims.x || t.y >= dims.y) { return 0.0; }
  return textureLoad(maskTex, t, 0).r;
}
fn unpre(c: vec4f) -> vec4f { if (c.a <= 0.0) { return vec4f(0.0); } return vec4f(clamp(c.rgb / c.a, vec3f(0.0), vec3f(1.0)), c.a); }

fn lumOf(c: vec3f) -> f32 { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
fn satOf(c: vec3f) -> f32 { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }
fn clipColor(c0: vec3f) -> vec3f {
  var c = c0;
  let L = lumOf(c); let n = min(c.r, min(c.g, c.b)); let x = max(c.r, max(c.g, c.b));
  if (n < 0.0) { let d = L - n; if (d > 0.0) { c = L + (c - L) * L / d; } else { c = vec3f(L); } }
  if (x > 1.0) { let d = x - L; if (d > 0.0) { c = L + (c - L) * (1.0 - L) / d; } else { c = vec3f(L); } }
  return c;
}
fn setLum(c: vec3f, l: f32) -> vec3f { return clipColor(c + (l - lumOf(c))); }
fn setSat(c: vec3f, s: f32) -> vec3f {
  let mx = max(c.r, max(c.g, c.b)); let mn = min(c.r, min(c.g, c.b));
  if (mx <= mn) { return vec3f(0.0); }
  // 与 compose.js 同口径：最小 → 0，最大 → s，中间按比例；并列时下标靠前的算最小 / 最大
  var iMn = 0; var iMx = 0;
  for (var k = 1; k < 3; k++) { if (c[k] < c[iMn]) { iMn = k; } if (c[k] > c[iMx]) { iMx = k; } }
  let iMid = 3 - iMn - iMx;
  var o = vec3f(0.0);
  o[iMid] = (c[iMid] - mn) * s / (mx - mn);
  o[iMx] = s; o[iMn] = 0.0;
  return o;
}
fn vivid(b: f32, s: f32) -> f32 {
  if (s <= 0.5) { if (s <= 0.0) { return 0.0; } return 1.0 - min(1.0, (1.0 - b) / (2.0 * s)); }
  if (s >= 1.0) { return 1.0; } return min(1.0, b / (2.0 - 2.0 * s));
}
fn sep(m: u32, b: f32, s: f32) -> f32 {
  switch m {
    case 2u: { return min(b, s); }
    case 3u: { return b * s; }
    case 4u: { if (s <= 0.0) { return 0.0; } if (b >= 1.0) { return 1.0; } return 1.0 - min(1.0, (1.0 - b) / s); }
    case 5u: { return max(0.0, b + s - 1.0); }
    case 6u: { return max(b, s); }
    case 7u: { return b + s - b * s; }
    case 8u: { if (s >= 1.0) { return 1.0; } if (b <= 0.0) { return 0.0; } return min(1.0, b / (1.0 - s)); }
    case 9u: { return min(1.0, b + s); }
    case 10u: { if (b <= 0.5) { return 2.0 * b * s; } return 1.0 - 2.0 * (1.0 - b) * (1.0 - s); }
    case 11u: { if (s <= 0.5) { return b - (1.0 - 2.0 * s) * b * (1.0 - b); } return b + (2.0 * s - 1.0) * (sqrt(b) - b); }
    case 12u: { if (s <= 0.5) { return 2.0 * b * s; } return 1.0 - 2.0 * (1.0 - b) * (1.0 - s); }
    case 13u: { return vivid(b, s); }
    case 14u: { return clamp(b + 2.0 * s - 1.0, 0.0, 1.0); }
    case 15u: { if (s <= 0.5) { return min(b, 2.0 * s); } return max(b, 2.0 * s - 1.0); }
    case 16u: { return select(0.0, 1.0, v8(b) + v8(s) >= 255.0); }
    case 17u: { return abs(b - s); }
    case 18u: { return b + s - 2.0 * b * s; }
    case 19u: { return max(0.0, b - s); }
    case 20u: { if (s <= 0.0) { return 1.0; } return min(1.0, b / s); }
    default: { return s; }
  }
}
fn blendRGB(m: u32, cb: vec3f, cs: vec3f) -> vec3f {
  switch m {
    case 21u: { return setLum(setSat(cs, satOf(cb)), lumOf(cb)); }
    case 22u: { return setLum(setSat(cb, satOf(cs)), lumOf(cb)); }
    case 23u: { return setLum(cs, lumOf(cb)); }
    case 24u: { return setLum(cb, lumOf(cs)); }
    case 25u: { return select(cb, cs, lumOf(cs) < lumOf(cb)); }
    case 26u: { return select(cb, cs, lumOf(cs) > lumOf(cb)); }
    default: { return vec3f(sep(m, cb.r, cs.r), sep(m, cb.g, cs.g), sep(m, cb.b, cs.b)); }
  }
}
fn rangeW(v: f32, q: vec4f) -> f32 {
  if (v < q.x || v > q.w) { return 0.0; }
  if (v < q.y) { return (v - q.x) / max(1.0, q.y - q.x); }
  if (v > q.z) { return (q.w - v) / max(1.0, q.w - q.z); }
  return 1.0;
}
fn v8(c: f32) -> f32 { return floor(clamp(c, 0.0, 1.0) * 255.0 + 0.5); }
fn gray8(c: vec3f) -> f32 { return floor(v8(c.r) * 0.299 + v8(c.g) * 0.587 + v8(c.b) * 0.114 + 0.5); }
fn blendIfW(cs: vec3f, cb: vec3f) -> f32 {
  var w = 1.0;
  let ms = op.u1.y; let md = op.u1.z;
  if ((ms & 1u) != 0u) { w *= rangeW(gray8(cs), op.biS[0]); }
  if ((md & 1u) != 0u) { w *= rangeW(gray8(cb), op.biD[0]); }
  for (var k = 0u; k < 3u; k++) {
    if ((ms & (2u << k)) != 0u) { w *= rangeW(v8(cs[k]), op.biS[k + 1u]); }
    if ((md & (2u << k)) != 0u) { w *= rangeW(v8(cb[k]), op.biD[k + 1u]); }
  }
  return w;
}
fn adjust(c: vec3f) -> vec3f {
  switch op.u1.x {
    case 1u: {
      let i = vec3i(vec3f(v8(c.r), v8(c.g), v8(c.b)));
      return vec3f(textureLoad(lut1, vec2i(i.r, 0), 0).r, textureLoad(lut1, vec2i(i.g, 0), 0).g, textureLoad(lut1, vec2i(i.b, 0), 0).b);
    }
    case 2u: { return textureSampleLevel(lut3, samp, (clamp(c, vec3f(0.0), vec3f(1.0)) * ${LUT3_N - 1}.0 + 0.5) / ${LUT3_N}.0, 0.0).rgb; }
    case 3u: { return vec3f(select(0.0, 1.0, gray8(c) >= op.p0.z)); }
    default: { return c; }
  }
}
fn dissolveKeep(d: vec2f, a: f32) -> bool {
  let x = bitcast<u32>(i32(floor(d.x))); let y = bitcast<u32>(i32(floor(d.y)));
  var h = x * 374761393u + y * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return (f32(h) / 4294967296.0) * 255.0 < a * 255.0;
}
/* 源（直通色 + alpha）：图层瓦片 / 下层的调整结果 / 组面 / 纯色 */
fn sourceStraight(p: vec2i, d: vec2f, cb: vec3f, da: f32) -> vec4f {
  switch op.u0.y {
    case 1u: { return vec4f(adjust(cb), da); }
    case 2u: { return unpre(textureLoad(srcTex, p, 0)); }
    case 3u: { return op.color; }
    default: { return unpre(sampleSrc(localOf(d), vec2f(p) + vec2f(0.5))); }
  }
}

@fragment fn fsOver(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let d = docOf(pos.xy);
  let p = vec2i(floor(pos.xy));
  let kind = op.u0.y; let flags = op.u0.z;
  let q = localOf(d);
  if (kind == 0u && (outsideCore(q) || replacedByDetail(q))) { discard; }
  var t: vec4f;
  if (kind == 2u) { t = textureLoad(srcTex, p, 0); }
  else if (kind == 3u) { t = vec4f(op.color.rgb * op.color.a, op.color.a); }
  else { t = sampleSrc(q, pos.xy); }
  var k = op.p0.x;
  if ((flags & ${F_MASK}u) != 0u) { k *= maskAt(d); }
  if ((flags & ${F_ABCLIP}u) != 0u && (d.x < op.ab.x || d.y < op.ab.y || d.x >= op.ab.z || d.y >= op.ab.w)) { k = 0.0; }
  if ((flags & ${F_CLIP}u) != 0u) { k *= textureLoad(clipTex, p, 0).r; }
  return t * k;
}

@fragment fn fsGeneric(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let d = docOf(pos.xy);
  let p = vec2i(floor(pos.xy));
  let kind = op.u0.y; let flags = op.u0.z;
  if (kind == 0u && (outsideCore(localOf(d)) || replacedByDetail(localOf(d)))) { discard; }
  let bdp = textureLoad(bdTex, p, 0);
  // 下层按 8 位量化：CPU 合成每画完一层都存成 8 位，阈值型混合（实色混合 / 深浅色 / 溶解…）在临界点上才会两边一致
  let bdq = unpre(bdp);
  let bd = vec4f(floor(bdq.rgb * 255.0 + 0.5) / 255.0, floor(bdq.a * 255.0 + 0.5) / 255.0);
  let cb = bd.rgb; let da = bd.a;
  var s = sourceStraight(p, d, cb, da);
  if ((flags & ${F_LERP}u) != 0u) {
    // 带蒙版的直通组：组外 = 原样，蒙版内 = 组内直通画出来的结果，按 蒙版 × 组不透明度 插值
    let a = maskAt(d) * op.p0.x;
    let o = mix(bd, s, a);
    return vec4f(o.rgb * o.a, o.a);
  }
  if ((flags & ${F_MASK}u) != 0u) { s.a *= maskAt(d); }
  if ((flags & ${F_ABCLIP}u) != 0u && (d.x < op.ab.x || d.y < op.ab.y || d.x >= op.ab.z || d.y >= op.ab.w)) { s.a = 0.0; }
  if ((flags & ${F_CLIP}u) != 0u) { s.a *= textureLoad(clipTex, p, 0).r; }
  if ((flags & ${F_BLENDIF}u) != 0u) { s.a *= blendIfW(s.rgb, cb); }
  if ((flags & ${F_KNOCK}u) != 0u) { return bdp * (1.0 - min(1.0, s.a * op.p0.y)); }
  var opa = op.p0.x;
  var m = op.u0.x;
  if (m == 1u) {
    if (!dissolveKeep(d, s.a * opa)) { return bdp; }
    s.a = 1.0; opa = 1.0; m = 0u;
  }
  let sa = s.a * opa;
  if (sa <= 0.0) { return bdp; }
  let B = blendRGB(m, cb, s.rgb);
  let na = sa + da * (1.0 - sa);
  var co = (1.0 - sa) * da * cb + sa * ((1.0 - da) * s.rgb + da * B);
  if ((flags & ${F_CHOFF}u) != 0u && da > 0.0) {
    var st = co / na;
    st = mix(st, cb, op.ch.xyz);
    co = st * na;
  }
  return vec4f(co, na);
}

@fragment fn fsBase(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let q = localOf(docOf(pos.xy));
  if (outsideCore(q) || replacedByDetail(q)) { discard; }
  return vec4f(sampleSrc(q, pos.xy).a, 0.0, 0.0, 1.0);
}
`;

const WGSL_UTIL = `
struct U { a: vec4f, b: vec4f, c: vec4f, ch: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var dlut: texture_3d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var c = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(c[i], 0.0, 1.0);
}
// 第 1 级 mip：第 0 级是直通色，四个像素各自预乘后平均
@fragment fn fsMip0(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let dims = vec2i(textureDimensions(src));
  let b = vec2i(floor(pos.xy)) * 2;
  var acc = vec4f(0.0);
  for (var k = 0; k < 4; k++) {
    let t = min(b + vec2i(k & 1, k >> 1), dims - vec2i(1));
    let c = textureLoad(src, t, 0);
    acc += vec4f(c.rgb * c.a, c.a);
  }
  return acc * 0.25;
}
// mip：上一级 2×2 平均（双线性取在四个像素的交点上）
@fragment fn fsMip(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return textureSampleLevel(src, samp, pos.xy / u.a.xy, 0.0);
}
// 呈现：视口合成面（预乘浮点）→ 画布；可选显示 LUT（颜色管理 / 校样）与通道视图
@fragment fn fsPresent(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let t = textureLoad(src, vec2i(floor(pos.xy)), 0);
  var a = clamp(t.a, 0.0, 1.0);
  if (a <= 0.0) { return vec4f(0.0); }
  var c = clamp(t.rgb / t.a, vec3f(0.0), vec3f(1.0));
  if (u.a.z > 0.5) { c = textureSampleLevel(dlut, samp, (c * ${LUT3_N - 1}.0 + 0.5) / ${LUT3_N}.0, 0.0).rgb; }
  let single = i32(u.a.w);
  if (single >= 0) { c = vec3f(c[single]); a = 1.0; }
  c = c * (vec3f(1.0) - u.ch.xyz);
  if (u.b.x > 0.5) { return vec4f(c, a); }          // 读回：直通色
  return vec4f(c * a, a);
}
`;


function gridImage(n) {
  const step = 255 / (n - 1), px = new Uint8ClampedArray(n * n * n * 4);
  let q = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++, q += 4) {
    px[q] = Math.round(r * step); px[q + 1] = Math.round(g * step); px[q + 2] = Math.round(b * step); px[q + 3] = 255;
  }
  return px;
}
let GRID = null;

export function adjustmentLut(a) {
  if (a.type === 'threshold') return { kind: 3, level: a.level };
  if (a.type !== 'colorLookup') {
    let l1 = null; try { l1 = buildAdjustmentLut(a); } catch { l1 = null; }
    if (l1) {
      const data = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) { data[i * 4] = l1.r[i]; data[i * 4 + 1] = l1.g[i]; data[i * 4 + 2] = l1.b[i]; data[i * 4 + 3] = 255; }
      return { kind: 1, data };
    }
  }
  if (!GRID) GRID = gridImage(LUT3_N);
  const n = LUT3_N;
  const out = a.type === 'colorLookup' ? applyLutRGBA(GRID, a.lut, a.opts) : applyAdjustment(GRID, n * n, n, a);
  return { kind: 2, data: new Uint8Array(out.buffer, out.byteOffset, out.length) };
}

export function bakeDisplayLut(transformRGBA) {
  if (!GRID) GRID = gridImage(LUT3_N);
  const px = new Uint8ClampedArray(GRID);
  transformRGBA(px, LUT3_N * LUT3_N, LUT3_N);
  return new Uint8Array(px.buffer);
}
export const DISPLAY_LUT_SIZE = LUT3_N;


export async function createGpuCompositor(opts = {}) {
  const gpu = opts.gpu || (typeof navigator !== 'undefined' && navigator.gpu);
  if (!gpu) throw new Error('这个浏览器没有 WebGPU');
  let device = opts.device, adapter = null, adapterName = '';
  if (!device) {
    adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('没有可用的 GPU 适配器');
    const want = Math.min(adapter.limits.maxTextureDimension2D || 8192, 16384);
    device = await adapter.requestDevice({ requiredLimits: { maxTextureDimension2D: want } });
    try { const inf = adapter.info || {}; adapterName = [inf.vendor, inf.architecture, inf.description].filter(Boolean).join(' '); } catch {}
  }
  const maxDim = device.limits.maxTextureDimension2D;
  const TILE = Math.min(opts.tile || 2048, maxDim - 16), GUT = 4;
  let lost = null;
  if (device.lost) device.lost.then(info => { lost = info || { message: 'lost' }; });
  const canvas = opts.canvas || null;
  const ctx = canvas ? canvas.getContext('webgpu') : null;
  const canvasFormat = ctx ? (opts.format || gpu.getPreferredCanvasFormat()) : 'rgba8unorm';
  if (ctx) ctx.configure({ device, format: canvasFormat, alphaMode: 'premultiplied' });

  const mod = device.createShaderModule({ code: WGSL });
  const umod = device.createShaderModule({ code: WGSL_UTIL });
  const tex2 = (b, sampleType = 'float') => ({ binding: b, visibility: SS.FRAGMENT, texture: { sampleType, viewDimension: '2d' } });
  const bgl = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: SS.VERTEX | SS.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: OP_SIZE } },
    tex2(1), tex2(2), tex2(3), tex2(4),
    { binding: 5, visibility: SS.FRAGMENT, texture: { sampleType: 'float', viewDimension: '3d' } },
    tex2(6), { binding: 7, visibility: SS.FRAGMENT, sampler: { type: 'filtering' } }, tex2(8), tex2(9),
  ] });
  const ubgl = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: SS.FRAGMENT, buffer: { type: 'uniform' } }, tex2(1),
    { binding: 2, visibility: SS.FRAGMENT, sampler: { type: 'filtering' } },
    { binding: 3, visibility: SS.FRAGMENT, texture: { sampleType: 'float', viewDimension: '3d' } },
  ] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
  const ulayout = device.createPipelineLayout({ bindGroupLayouts: [ubgl] });
  const PREMUL_OVER = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
  const pipe = (entry, format, blend) => device.createRenderPipeline({ layout, vertex: { module: mod, entryPoint: 'vs' },
    fragment: { module: mod, entryPoint: entry, targets: [{ format, ...(blend ? { blend } : {}) }] }, primitive: { topology: 'triangle-list' } });
  const upipe = (entry, format) => device.createRenderPipeline({ layout: ulayout, vertex: { module: umod, entryPoint: 'vs' },
    fragment: { module: umod, entryPoint: entry, targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  const P = {
    over: pipe('fsOver', 'rgba16float', PREMUL_OVER), generic: pipe('fsGeneric', 'rgba16float'), base: pipe('fsBase', 'r16float'),
    mip0: upipe('fsMip0', 'rgba8unorm'), mip: upipe('fsMip', 'rgba8unorm'),
    present: upipe('fsPresent', canvasFormat),
  };
  P.presentRead = canvasFormat === 'rgba8unorm' ? P.present : upipe('fsPresent', 'rgba8unorm');
  const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge' });
  const mkTex = (w, h, format, usage, mips = 1, dim = '2d', depth = 1) => device.createTexture({ size: [w, h, depth], format, usage, mipLevelCount: mips, dimension: dim });
  const dummy2 = mkTex(1, 1, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
  const dummyR = mkTex(1, 1, 'r8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
  device.queue.writeTexture({ texture: dummyR }, new Uint8Array([255, 0, 0, 0]), { bytesPerRow: 4 }, [1, 1]);
  const dummy3 = mkTex(1, 1, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, 1, '3d', 1);
  const D2 = dummy2.createView(), DR = dummyR.createView(), D3 = dummy3.createView();
  let displayLut = null;                                 
  const uniBuf = device.createBuffer({ size: 64, usage: BU.UNIFORM | BU.COPY_DST });

  
  const srcs = new WeakMap();
  const editIDs=new WeakMap();let editSeq=0;
  const editID=e=>{if(!e)return 0;let id=editIDs.get(e);if(!id)editIDs.set(e,id=++editSeq);return id;};
  const live = new Set();                                
  let frame = 0, bytesResident = 0;
  const utilBG = (view, a = [0, 0, 0, 0], b = [0, 0, 0, 0], lut = D3, c = [0, 0, 0, 0], ch = [0, 0, 0, 0]) => {
    const buf = device.createBuffer({ size: 64, usage: BU.UNIFORM | BU.COPY_DST });
    device.queue.writeBuffer(buf, 0, new Float32Array([...a, ...b, ...c, ...ch]));
    return { bg: device.createBindGroup({ layout: ubgl, entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: view }, { binding: 2, resource: samp }, { binding: 3, resource: lut }] }), buf };
  };
  






  let detailBytes = 0, frameUpload = 0, deferred = false;
  const detailBudget = opts.detailBudget || 768 * 1048576, uploadBudget = opts.uploadBudget || 160 * 1048576;
  const levelsOf = (w, h) => Math.max(1, Math.min(12, Math.floor(Math.log2(Math.max(w, h))) + 1));
  const tileBytes = (w, h, levels) => { let b = 0; for (let L = 0; L < levels; L++) b += Math.max(1, w >> L) * Math.max(1, h >> L) * 4; return b; };
  
  function genMips(enc, tex, w0, h0, from, to, rect, straightFirst, tmps) {
    let [sx0, sy0, sx1, sy1] = rect;
    for (let L = from; L < to; L++) {
      const w = Math.max(1, w0 >> L), h = Math.max(1, h0 >> L);
      sx0 = Math.max(0, (sx0 >> 1) - 1); sy0 = Math.max(0, (sy0 >> 1) - 1); sx1 = Math.min(w, (sx1 + 1 >> 1) + 1); sy1 = Math.min(h, (sy1 + 1 >> 1) + 1);
      if (sx1 <= sx0 || sy1 <= sy0) break;
      const u = utilBG(tex.createView({ baseMipLevel: L - 1, mipLevelCount: 1 }), [w, h, 0, 0]); tmps.push(u.buf);
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView({ baseMipLevel: L, mipLevelCount: 1 }), loadOp: 'load', storeOp: 'store' }] });
      pass.setPipeline(L === from && straightFirst ? P.mip0 : P.mip); pass.setBindGroup(0, u.bg); pass.setScissorRect(sx0, sy0, sx1 - sx0, sy1 - sy0); pass.draw(3); pass.end();
    }
  }
  function makeDet(t) {
    const levels = t.P ? t.P : levelsOf(t.tw, t.th);
    const tex = mkTex(t.tw, t.th, 'rgba8unorm', TU.TEXTURE_BINDING | TU.RENDER_ATTACHMENT | TU.COPY_DST | TU.COPY_SRC, levels);
    t.det = { tex, view: tex.createView(), levels, bytes: tileBytes(t.tw, t.th, levels) };
    if (t.P) detailBytes += t.det.bytes; else bytesResident += t.det.bytes;
  }
  function dropDet(t) {
    if (!t.det) return;
    t.det.tex.destroy();
    if (t.P) detailBytes -= t.det.bytes; else bytesResident -= t.det.bytes;
    t.det = null;
  }
  
  function writeDet(e, t, x0, y0, x1, y1) {
    const ax0 = Math.max(x0, t.ox), ay0 = Math.max(y0, t.oy), ax1 = Math.min(x1, t.ox + t.tw), ay1 = Math.min(y1, t.oy + t.th);
    if (ax1 <= ax0 || ay1 <= ay0) return;
    const rw = ax1 - ax0, rh = ay1 - ay0, lx = ax0 - t.ox, ly = ay0 - t.oy;
    device.queue.writeTexture({ texture: t.det.tex, origin: [lx, ly], mipLevel: 0 }, e.data, { offset: (ay0 * e.w + ax0) * 4, bytesPerRow: e.w * 4, rowsPerImage: rh }, [rw, rh]);
    frameUpload += rw * rh * 4; stats.uploadPx += rw * rh;
    const enc = device.createCommandEncoder(), tmps = [];
    genMips(enc, t.det.tex, t.tw, t.th, 1, t.det.levels, [lx, ly, lx + rw, ly + rh], true, tmps);
    device.queue.submit([enc.finish()]);
    for (const b of tmps) b.destroy();
  }
  function makePyr(t) {
    const k = 1 << t.P, w = Math.ceil(t.tw / k), h = Math.ceil(t.th / k), levels = levelsOf(w, h);
    const tex = mkTex(w, h, 'rgba8unorm', TU.TEXTURE_BINDING | TU.RENDER_ATTACHMENT | TU.COPY_DST, levels);
    t.pyr = { tex, view: tex.createView(), w, h, levels, bytes: tileBytes(w, h, levels) };
    bytesResident += t.pyr.bytes;
  }
  

  function pyrFromCPU(e, t, x0, y0, x1, y1) {
    const k = 1 << t.P, D = e.data, W = e.w;
    const px0 = Math.max(0, Math.floor((x0 - t.ox) / k)), py0 = Math.max(0, Math.floor((y0 - t.oy) / k));
    const px1 = Math.min(t.pyr.w, Math.ceil((x1 - t.ox) / k)), py1 = Math.min(t.pyr.h, Math.ceil((y1 - t.oy) / k));
    if (px1 <= px0 || py1 <= py0) return;
    const ow = px1 - px0, oh = py1 - py0, out = new Uint8Array(ow * oh * 4);
    const ar = new Float64Array(ow), ag = new Float64Array(ow), ab = new Float64Array(ow), aa = new Float64Array(ow), an = new Uint32Array(ow);
    const xEnd = t.ox + t.tw, yEnd = t.oy + t.th;
    for (let by = py0; by < py1; by++) {
      ar.fill(0); ag.fill(0); ab.fill(0); aa.fill(0); an.fill(0);
      const sy0 = t.oy + by * k, sy1 = Math.min(sy0 + k, yEnd);
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * W;
        for (let j = 0, bx = px0; bx < px1; bx++, j++) {
          const sx0 = t.ox + bx * k, sx1 = Math.min(sx0 + k, xEnd);
          let r = 0, g = 0, b = 0, a = 0;
          for (let x = sx0, q = (row + sx0) * 4; x < sx1; x++, q += 4) { const al = D[q + 3]; if (al) { r += D[q] * al; g += D[q + 1] * al; b += D[q + 2] * al; a += al; } }
          ar[j] += r; ag[j] += g; ab[j] += b; aa[j] += a; an[j] += sx1 - sx0;
        }
      }
      for (let j = 0, o = (by - py0) * ow * 4; j < ow; j++, o += 4) {
        const n = an[j] || 1;
        out[o] = Math.round(ar[j] / (255 * n)); out[o + 1] = Math.round(ag[j] / (255 * n)); out[o + 2] = Math.round(ab[j] / (255 * n)); out[o + 3] = Math.round(aa[j] / n);
      }
    }
    device.queue.writeTexture({ texture: t.pyr.tex, origin: [px0, py0], mipLevel: 0 }, out, { bytesPerRow: ow * 4, rowsPerImage: oh }, [ow, oh]);
    stats.uploadPx += ow * oh;
    if (t.pyr.levels > 1) {
      const enc = device.createCommandEncoder(), tmps = [];
      genMips(enc, t.pyr.tex, t.pyr.w, t.pyr.h, 1, t.pyr.levels, [px0, py0, px1, py1], false, tmps);
      device.queue.submit([enc.finish()]);
      for (const b of tmps) b.destroy();
    }
  }
  
  function prepTile(e, t, needDet) {
    if (!t.P) {                                           
      if (!t.det) { makeDet(t); writeDet(e, t, 0, 0, e.w, e.h); t.dirty = null; }
      else if (t.dirty) { const r = t.dirty; t.dirty = null; writeDet(e, t, r.x0, r.y0, r.x1, r.y1); }
      return { det: t.det.view, pyr: null };
    }
    if (!t.pyr) {                                         
      makePyr(t); pyrFromCPU(e, t, 0, 0, e.w, e.h); t.dirty = null;
      stats.pyramids++;
    } else if (t.dirty) {                                 
      const r = t.dirty; t.dirty = null;
      pyrFromCPU(e, t, r.x0, r.y0, r.x1, r.y1);
      if (t.det) writeDet(e, t, r.x0, r.y0, r.x1, r.y1);
    }
    if (needDet && !t.det) {
      if (frameUpload > uploadBudget) deferred = true;    
      else { makeDet(t); writeDet(e, t, 0, 0, e.w, e.h); }
    }
    if (t.det) t.detUsed = frame;
    return { det: t.det ? t.det.view : null, pyr: t.pyr.view };
  }
  function srcEntry(src) {
    const data = src.data;
    let e = srcs.get(data);
    if (e && (e.w !== src.width || e.h !== src.height)) { destroyEntry(e); e = null; }
    if (!e) {
      e = { data, w: src.width, h: src.height, tiles: [], used: frame, ref: typeof WeakRef !== 'undefined' ? new WeakRef(data) : null };
      for (let cy = 0; cy < e.h; cy += TILE) for (let cx = 0; cx < e.w; cx += TILE) {
        const ox = Math.max(0, cx - GUT), oy = Math.max(0, cy - GUT);
        const tw = Math.min(e.w, cx + TILE + GUT) - ox, th = Math.min(e.h, cy + TILE + GUT) - oy;
        e.tiles.push({ ox, oy, tw, th, P: (tw >= 1024 || th >= 1024) ? 2 : 0, det: null, pyr: null, dirty: null, detUsed: 0,
          core: [cx, cy, Math.min(e.w, cx + TILE), Math.min(e.h, cy + TILE)] });
      }
      srcs.set(data, e); live.add(e);
      stats.uploads++;
    }
    e.used = frame;
    return e;
  }
  function destroyEntry(e) {
    if (e.virtualCaches) { for (const c of e.virtualCaches.values()) dropVirtualCache(c); e.virtualCaches.clear(); }
    for (const t of e.tiles) { dropDet(t); if (t.pyr) { t.pyr.tex.destroy(); bytesResident -= t.pyr.bytes; t.pyr = null; } }
    e.tiles = []; live.delete(e);
    if (e.data) srcs.delete(e.data);
  }
  function sweep(budget) {
    for (const e of live) if (e.virtualCaches) for (const [key, c] of e.virtualCaches) {
      
      
      
      if (c.used < frame - 120) { dropVirtualCache(c); e.virtualCaches.delete(key); }
    }
    for (const e of [...live]) if (e.ref && !e.ref.deref()) destroyEntry(e);
    if (detailBytes > detailBudget) {                     
      const cand = [];
      for (const e of live) for (const t of e.tiles) if (t.P && t.det && t.detUsed < frame) cand.push(t);
      cand.sort((a, b) => a.detUsed - b.detUsed);
      for (const t of cand) { if (detailBytes <= detailBudget) break; dropDet(t); }
    }
    if (bytesResident + detailBytes <= budget) return;
    const old = [...live].filter(e => e.used < frame).sort((a, b) => a.used - b.used);
    for (const e of old) { if (bytesResident + detailBytes <= budget) break; destroyEntry(e); }
  }
  
  const planes = new WeakMap();
  function planeView(plane, w, h) {
    let p = planes.get(plane);
    if (!p) {
      const tex = mkTex(w, h, 'r8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
      device.queue.writeTexture({ texture: tex }, plane, { bytesPerRow: w, rowsPerImage: h }, [w, h]);
      p = { tex, view: tex.createView() }; planes.set(plane, p);
    }
    return p.view;
  }
  const luts = new WeakMap();
  function lutOf(op) {
    const key = op.key || op.adjustment;
    let L = luts.get(key);
    const sig = JSON.stringify(op.adjustment, (k, v) => (v && v.data instanceof Float32Array) ? { size: v.size, n: v.data.length } : v);
    if (L && L.sig === sig) return L;
    if (L) { if (L.tex) L.tex.destroy(); }
    const r = adjustmentLut(op.adjustment);
    L = { sig, kind: r.kind, level: r.level || 0, tex: null, view1: D2, view3: D3 };
    if (r.kind === 1) { L.tex = mkTex(256, 1, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST); device.queue.writeTexture({ texture: L.tex }, r.data, { bytesPerRow: 1024 }, [256, 1]); L.view1 = L.tex.createView(); }
    if (r.kind === 2) { const n = LUT3_N; L.tex = mkTex(n, n, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, 1, '3d', n); device.queue.writeTexture({ texture: L.tex }, r.data, { bytesPerRow: n * 4, rowsPerImage: n }, [n, n, n]); L.view3 = L.tex.createView({ dimension: '3d' }); }
    luts.set(key, L);
    return L;
  }

  
  let surfW = 0, surfH = 0, pool = [], tmpS = null, clipS = null, outTex = null;
  const SURF_USAGE = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING | TU.COPY_SRC | TU.COPY_DST;
  
  const surfSets = new Map();
  function ensureSurfaces(W, H) {
    if (W === surfW && H === surfH) return;
    const key = W + 'x' + H;
    let set = surfSets.get(key);
    if (!set) {
      const mk = (fmt) => { const tex = mkTex(W, H, fmt, SURF_USAGE); return { tex, view: tex.createView(), busy: false }; };
      set = { pool: [], tmpS: mk('rgba16float'), clipS: mk('r16float'), mk };
      surfSets.set(key, set);
      if (surfSets.size > 2) for (const [k, v] of surfSets) { if (k === key || k === surfW + 'x' + surfH) continue; for (const x of v.pool) x.tex.destroy(); v.tmpS.tex.destroy(); v.clipS.tex.destroy(); surfSets.delete(k); break; }
    }
    surfSets.delete(key); surfSets.set(key, set);          
    pool = set.pool; tmpS = set.tmpS; clipS = set.clipS; ensureSurfaces.mk = set.mk; surfW = W; surfH = H;
  }
  const acquire = () => { let s = pool.find(x => !x.busy); if (!s) { s = ensureSurfaces.mk('rgba16float'); pool.push(s); } s.busy = true; return s; };
  const release = s => { s.busy = false; };

  
  let opBuf = null, opCap = 0, opData = null, nOps = 0;
  const ensureOpBuf = n => {
    if (n <= opCap) return;
    opCap = Math.max(256, n * 2);
    if (opBuf) opBuf.destroy();
    opBuf = device.createBuffer({ size: opCap * OP_STRIDE, usage: BU.UNIFORM | BU.COPY_DST });
    opData = new ArrayBuffer(opCap * OP_STRIDE);
  };
  function writeOp(o) {
    if (nOps >= opCap) { const old = opData, oldN = nOps; ensureOpBuf(nOps + 1); new Uint8Array(opData).set(new Uint8Array(old, 0, oldN * OP_STRIDE)); }
    const off = nOps * OP_STRIDE;
    const f = new Float32Array(opData, off, OP_SIZE / 4), u = new Uint32Array(opData, off, OP_SIZE / 4);
    f.fill(0);
    f.set(o.quad, 0); f.set([V.W, V.H, ...(o.pixelOrigin||[0,0])], 4); f.set([V.s, V.s, V.tx, V.ty], 8);
    if (o.tile) f.set(o.tile, 12); if (o.core) f.set(o.core, 16);
    f.set([V.docW, V.docH, V.lod, V.s], 20);
    if (o.color) f.set(o.color, 24); if (o.ab) f.set(o.ab, 28);
    if (o.biS) for (let k = 0; k < 4; k++) f.set(o.biS[k], 32 + k * 4);
    if (o.biD) for (let k = 0; k < 4; k++) f.set(o.biD[k], 48 + k * 4);
    if (o.ch) f.set(o.ch, 64);
    f.set([o.opacity ?? 1, o.knock ?? 0, o.level ?? 0, 0], 68);
    u.set([o.mode | 0, o.kind | 0, o.flags | 0, o.filter | 0], 72);
    u.set([o.lutKind | 0, o.biMaskS | 0, o.biMaskD | 0, o.has == null ? 1 : o.has], 76);
    f.set(o.m || [1, 0, 0, 1], 80); f.set(o.n || [0, 0, V.lod, 0], 84); f.set(o.pz || [1, 1, 0, 0], 88);
    f.set(o.grid || [0, 0, 0, 0], 92);
    return nOps++ * OP_STRIDE;
  }
  let V = null;               
  let enc = null, pass = null, passTarget = null;
  const endPass = () => { if (pass) { pass.end(); pass = null; passTarget = null; } };
  const beginPass = (target, clear = null) => {
    if (pass && passTarget === target && !clear) return pass;
    endPass();
    pass = enc.beginRenderPass({ colorAttachments: [{ view: target.view, loadOp: clear ? 'clear' : 'load', clearValue: clear || { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }] });
    passTarget = target;
    return pass;
  };
  const bindGroup = (srcView, bdView, maskView, clipView, l3, l1, pyrView, detailView) => device.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: { buffer: opBuf, size: OP_SIZE } }, { binding: 1, resource: srcView || D2 }, { binding: 2, resource: bdView || D2 },
    { binding: 3, resource: maskView || DR }, { binding: 4, resource: clipView || DR }, { binding: 5, resource: l3 || D3 },
    { binding: 6, resource: l1 || D2 }, { binding: 7, resource: samp }, { binding: 8, resource: pyrView || D2 }, { binding: 9, resource: detailView || DR } ] });
  
  const devRect = (l, t, r, b) => {
    const x0 = Math.max(0, Math.floor(l * V.s + V.tx)), y0 = Math.max(0, Math.floor(t * V.s + V.ty));
    const x1 = Math.min(V.W, Math.ceil(r * V.s + V.tx)), y1 = Math.min(V.H, Math.ceil(b * V.s + V.ty));
    return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
  };
  const drawCalls = [];        
  function emit(kind, target, quad, op, binds, extra = null) {
    const off = writeOp({ ...op, quad });
    drawCalls.push({ kind, target, quad, off, binds, extra });
  }
  const isHardware = (mode, flags) => (mode === 0) && !(flags & (F_BLENDIF | F_CHOFF | F_KNOCK | F_LERP));
  

  function geomOf(op) {
    const F = op.xf || [1, 0, 0, 1, op.left, op.top];
    const [a, b, c, d, e, f] = F, det = a * d - b * c;
    if (Math.abs(det) < 1e-12) return null;
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
    
    
    
    const plain = Math.abs(a-1)<=1e-12&&Math.abs(b)<=1e-12&&Math.abs(c)<=1e-12&&Math.abs(d-1)<=1e-12;
    const sEff = V.s * Math.sqrt(Math.abs(det));
    const filter = plain ? V.filter : 2;
    const lod = plain ? V.lod : (sEff < 1 ? Math.log2(1 / sEff) : 0);
    
    return { F, plain, filter, m: [ia, ic, ib, id], n: [-(ia * e + ic * f), -(ib * e + id * f), lod, 0] };
  }
  const quadOf = (g, x0, y0, x1, y1) => {
    if (g.plain) return devRect(x0 + g.F[4], y0 + g.F[5], x1 + g.F[4], y1 + g.F[5]);
    const [a, b, c, d, e, f] = g.F;
    let l = Infinity, t = Infinity, r = -Infinity, bt = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const X = a * x + c * y + e, Y = b * x + d * y + f;
      l = Math.min(l, X); t = Math.min(t, Y); r = Math.max(r, X); bt = Math.max(bt, Y);
    }
    return devRect(l - 1, t - 1, r + 1, bt + 1);
  };
  


  const visibleTiles = (e, g) => {
    if (!g.plain || !e.tiles.length) return e.tiles;
    const x0 = (-V.tx / V.s - g.F[4]) - GUT, y0 = (-V.ty / V.s - g.F[5]) - GUT;
    const x1 = ((V.W - V.tx) / V.s - g.F[4]) + GUT, y1 = ((V.H - V.ty) / V.s - g.F[5]) + GUT;
    if (x1 <= 0 || y1 <= 0 || x0 >= e.w || y0 >= e.h) return [];
    const cols = Math.ceil(e.w / TILE), rows = Math.ceil(e.h / TILE);
    const cx0 = Math.max(0, Math.min(cols - 1, Math.floor(x0 / TILE))), cy0 = Math.max(0, Math.min(rows - 1, Math.floor(y0 / TILE)));
    const cx1 = Math.max(-1, Math.min(cols - 1, Math.ceil(x1 / TILE) - 1)), cy1 = Math.max(-1, Math.min(rows - 1, Math.ceil(y1 / TILE) - 1));
    if (cx1 < cx0 || cy1 < cy0) return [];
    const out = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push(e.tiles[cy * cols + cx]);
    return out;
  };
  const pzOf = t => t.pyr ? [t.pyr.w << t.P, t.pyr.h << t.P, 0, 0] : [t.tw, t.th, 0, 0];
  function dropVirtualCache(c){
    if (c.tex) { c.tex.destroy(); bytesResident -= c.bytes; c.tex = null; }
    for (const r of c.padded.values()) { const e = srcs.get(r.src.data); if (e) destroyEntry(e); }
    c.padded.clear();
  }
  function detailGridOf(e, d, preferredScale = 1){
    const cols = Math.ceil(d.width / d.tileSize), rows = Math.ceil(d.height / d.tileSize);
    if (cols > maxDim || rows > maxDim) throw new Error('高清瓦片索引超过 GPU 纹理尺寸');
    const caches = e.virtualCaches || (e.virtualCaches = new Map());
    let c = caches.get(d.tiles);
    if (!c || c.cols !== cols || c.rows !== rows) {
      if (c) dropVirtualCache(c);
      const tex = mkTex(cols, rows, 'r8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
      c = { cols, rows, tex, view: tex.createView(), bytes: cols * rows, padded: new Map(), version: null, levels: [], states: new Set(), descriptor: d, used: frame };
      bytesResident += c.bytes; caches.set(d.tiles, c);
    }
    c.used = frame;
    const states = [d, ...[...(d.levels?.values() || [])].sort((a, b) => (a.scale || 1) - (b.scale || 1))];
    const version = preferredScale + `|edit:${editID(d.edits)}:${d.edits?.version||0}|` + states.map(s => `${s.scale || 1}:${s.version}`).join('|');
    if (c.version !== version) {
      const grid = new Uint8Array(cols * rows), levels = [], kept = new Set();
      
      
      
      const priority = [...states.filter(s => (s.scale || 1) > preferredScale).reverse(), ...states.filter(s => (s.scale || 1) <= preferredScale)];
      for (const state of priority) {
        const scale = state.scale || 1, code = 1 + Math.round(Math.log2(scale)), valid = new Map();
        if (!Number.isInteger(scale) || scale < 1 || scale > 64 || (scale & (scale - 1))) continue;
        const sourceTiles=state===d&&d.edits?new Map([...state.tiles,...d.edits.tiles]).values():state.tiles.values();
        for (const tile of sourceTiles) {
        const { x, y, width, height, data } = tile;
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x % state.tileSize || y % state.tileSize) continue;
        if (width !== Math.min(state.tileSize, d.width - x) || height !== Math.min(state.tileSize, d.height - y) || !(width > 0 && height > 0)) continue;
        if ((tile.scale || 1) !== scale || data?.length !== Math.ceil(width / scale) * Math.ceil(height / scale) * 4) continue;
        for (let gy = Math.floor(y / d.tileSize); gy < Math.ceil((y + height) / d.tileSize); gy++)
          grid.fill(code, gy * cols + Math.floor(x / d.tileSize), gy * cols + Math.ceil((x + width) / d.tileSize));
        valid.set(`${x}:${y}`, tile);
        kept.add(tile);
        }
        levels.push({ state, scale, code, valid });
      }
      
      for(const tile of d.edits?.tiles.values()||[])if(levels.some(l=>l.scale===1&&l.valid.get(`${tile.x}:${tile.y}`)===tile))
        for(let gy=Math.floor(tile.y/d.tileSize);gy<Math.ceil((tile.y+tile.height)/d.tileSize);gy++)grid.fill(1,gy*cols+Math.floor(tile.x/d.tileSize),gy*cols+Math.ceil((tile.x+tile.width)/d.tileSize));
      for (const [tile, r] of c.padded) if (!kept.has(tile)) {
        const old = srcs.get(r.src.data); if (old) destroyEntry(old);
        c.padded.delete(tile);
      }
      const selected = new Set();
      for (const level of levels) for (const tile of level.valid.values()) {
        let visible = false;
        for (let gy = Math.floor(tile.y / d.tileSize); gy < Math.ceil((tile.y + tile.height) / d.tileSize) && !visible; gy++)
          for (let gx = Math.floor(tile.x / d.tileSize); gx < Math.ceil((tile.x + tile.width) / d.tileSize); gx++) if (grid[gy * cols + gx] === level.code) { visible = true; break; }
        if (visible) selected.add(tile);
      }
      c.levels = levels; c.states = new Set(states); c.version = version; c.preferredScale = preferredScale; c.selected = selected;
      device.queue.writeTexture({ texture: c.tex }, grid, { bytesPerRow: cols, rowsPerImage: rows }, [cols, rows]);
    }
    return c;
  }
  function paddedDetail(src, d, c, level, tile, gutter){
    const { scale, state, valid } = level, sampleWidth = Math.ceil(tile.width / scale), sampleHeight = Math.ceil(tile.height / scale);
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = valid.get(`${tile.x + dx * state.tileSize}:${tile.y + dy * state.tileSize}`);
      neighbors.push(t?.data || null, t?.version || 0);
    }
    const hit = c.padded.get(tile);
    if (hit && hit.gutter === gutter && hit.neighbors.every((v, i) => v === neighbors[i])) return hit.src;
    if (hit) { const old = srcs.get(hit.src.data); if (old) destroyEntry(old); }
    
    
    const left = Math.min(gutter, tile.x / scale), top = Math.min(gutter, tile.y / scale);
    const right = Math.min(gutter, Math.ceil(d.width / scale) - tile.x / scale - sampleWidth), bottom = Math.min(gutter, Math.ceil(d.height / scale) - tile.y / scale - sampleHeight);
    
    
    const w = sampleWidth + left + right, h = sampleHeight + top + bottom, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < sampleHeight; y++) data.set(tile.data.subarray(y * sampleWidth * 4, (y + 1) * sampleWidth * 4), ((y + top) * w + left) * 4);
    const border = (x, y) => {
      const sx = tile.x / scale + x - left, sy = tile.y / scale + y - top;
      const t = valid.get(`${Math.floor(sx * scale / state.tileSize) * state.tileSize}:${Math.floor(sy * scale / state.tileSize) * state.tileSize}`);
      const pixels = t ? t.data : src.data;
      const q = t ? ((sy - t.y / scale) * Math.ceil(t.width / scale) + sx - t.x / scale) * 4
        : (Math.min(src.height - 1, Math.floor(sy * scale * src.height / d.height)) * src.width + Math.min(src.width - 1, Math.floor(sx * scale * src.width / d.width))) * 4;
      const out = (y * w + x) * 4;
      data[out] = pixels[q]; data[out + 1] = pixels[q + 1]; data[out + 2] = pixels[q + 2]; data[out + 3] = pixels[q + 3];
    };
    for (let y = 0; y < top; y++) for (let x = 0; x < w; x++) border(x, y);
    for (let y = h - bottom; y < h; y++) for (let x = 0; x < w; x++) border(x, y);
    for (let y = top; y < h - bottom; y++) {
      for (let x = 0; x < left; x++) border(x, y);
      for (let x = w - right; x < w; x++) border(x, y);
    }
    const padded = { data, width: w, height: h, padLeft: left, padTop: top, core: [left, top, left + tile.width / scale, top + tile.height / scale] };
    c.padded.set(tile, { src: padded, neighbors, gutter });
    return padded;
  }
  


  function* sourceParts(op){
    const src = op.src, d = src.detail, g = geomOf(op);
    const proxy = { data: src.data, width: src.width, height: src.height };
    if (!g || !quadOf(g, 0, 0, src.width, src.height)) return;
    const [a, b, cc, dd, e, f] = g.F;
    const previewScale = V.s * Math.sqrt(Math.abs(a * dd - b * cc));
    if (!d.edits?.tiles.size&&(previewScale <= 1 || ![d, ...(d.levels?.values() || [])].some(s => s.tiles.size))) { yield { ...op, src: proxy }; return; }
    const kx = src.width / d.width, ky = src.height / d.height;
    const nativeScale = previewScale * Math.sqrt(kx * ky);
    const preferredScale = lodForScale(nativeScale);
    const entry = srcEntry(proxy), cache = detailGridOf(entry, d, preferredScale);
    stats.virtualSources++;
    yield { ...op, src: proxy, skipDetails: cache.view, gridScale: [d.width / src.width / d.tileSize, d.height / src.height / d.tileSize] };
    for (const level of cache.levels) for (const tile of level.valid.values()) {
      if (!cache.selected.has(tile)) continue;
      const { scale, code } = level;
      const gutter = Math.min(256, Math.max(GUT, 2 ** Math.ceil(Math.max(0, Math.log2(1 / (nativeScale * scale))))));
      if (!quadOf(g, tile.x * kx, tile.y * ky, (tile.x + tile.width) * kx, (tile.y + tile.height) * ky)) continue;
      const padded = paddedDetail(src, d, cache, level, tile, gutter);
      const nx = tile.x - padded.padLeft * scale, ny = tile.y - padded.padTop * scale;
      const x = nx * kx, y = ny * ky;
      stats.virtualTiles++;
      yield { ...op, src: padded, xf: [a * kx * scale, b * kx * scale, cc * ky * scale, dd * ky * scale, e + a * x + cc * y, f + b * x + dd * y], coreClip: padded.core,
        skipDetails: cache.view, gridScale: [scale / d.tileSize, scale / d.tileSize], grid: [nx / d.tileSize, ny / d.tileSize, code, 0] };
    }
  }
  const coreOf = (tile, clip) => clip ? [Math.max(tile.core[0], clip[0]), Math.max(tile.core[1], clip[1]), Math.min(tile.core[2], clip[2]), Math.min(tile.core[3], clip[3])] : tile.core;
  function drawSrcOp(op, target, clipActive) {
    if (op.src.detail) { for (const part of sourceParts(op)) drawSrcOp(part, target, clipActive); return; }
    const g = geomOf(op); if (!g) return;
    if (!quadOf(g, 0, 0, op.src.width, op.src.height)) return;
    const e = srcEntry(op.src);
    const mode = MODE_CODE[op.blend] ?? 0;
    let flags = 0;
    if (op.clip) { if (!clipActive) return; flags |= F_CLIP; }
    if (op.skipDetails) flags |= F_SKIP_DETAIL;
    let biS = null, biD = null, biMaskS = 0, biMaskD = 0, ch = null;
    if (op.knockout != null) flags |= F_KNOCK;
    if (op.content && op.blendIf) {
      const bi = op.blendIf, def = q => !q || (q[0] === 0 && q[1] === 0 && q[2] === 255 && q[3] === 255);
      biS = [[0, 0, 255, 255], [0, 0, 255, 255], [0, 0, 255, 255], [0, 0, 255, 255]]; biD = biS.map(x => x.slice());
      if (bi.gray) { if (!def(bi.gray.src)) { biS[0] = bi.gray.src; biMaskS |= 1; } if (!def(bi.gray.dst)) { biD[0] = bi.gray.dst; biMaskD |= 1; } }
      (bi.channels || []).slice(0, 3).forEach((c, k) => { if (!c) return; if (!def(c.src)) { biS[k + 1] = c.src; biMaskS |= 2 << k; } if (!def(c.dst)) { biD[k + 1] = c.dst; biMaskD |= 2 << k; } });
      if (biMaskS || biMaskD) flags |= F_BLENDIF;
    }
    if (op.content && op.channelsOff && op.channelsOff.length) { ch = [0, 0, 0, 0]; for (const c of op.channelsOff) ch[c] = 1; flags |= F_CHOFF; }
    for (const t of visibleTiles(e, g)) {
      stats.tileCandidates++;
      const core = coreOf(t, op.coreClip); if (core[2] <= core[0] || core[3] <= core[1]) continue;
      const q = quadOf(g, ...core);
      if (!q) continue;
      const tv = prepTile(e, t, g.filter !== 2 || g.n[2] < t.P);
      const o = { kind: K_TEX, mode, flags, opacity: op.knockout != null ? 1 : op.opacity, knock: op.knockout ?? 0, filter: g.filter,
        tile: [t.ox, t.oy, t.tw, t.th], core, m: g.m, n: [g.n[0], g.n[1], g.n[2], t.P], pixelOrigin:[V.tx+(g.F[4]+t.ox)*V.s,V.ty+(g.F[5]+t.oy)*V.s],has: (tv.det ? 1 : 0) | (tv.pyr ? 2 : 0), pz: op.gridScale ? [...pzOf(t).slice(0, 2), ...op.gridScale] : pzOf(t), grid: op.grid, biS, biD, biMaskS, biMaskD, ch };
      emit(isHardware(mode, flags) ? 'over' : 'generic', target, q, o, { src: tv.det, pyr: tv.pyr, clip: (flags & F_CLIP) ? clipS.view : null, detail: op.skipDetails });
    }
  }
  function drawBase(op, clear = true) {
    if (clear) drawCalls.push({ kind: 'clearClip' });
    if (op.src.detail) { for (const part of sourceParts(op)) drawBase(part, false); return; }
    const g = geomOf(op); if (!g) return;
    if (!quadOf(g, 0, 0, op.src.width, op.src.height)) return;
    const e = srcEntry(op.src);
    for (const t of visibleTiles(e, g)) {
      stats.tileCandidates++;
      const core = coreOf(t, op.coreClip); if (core[2] <= core[0] || core[3] <= core[1]) continue;
      const q = quadOf(g, ...core);
      if (!q) continue;
      const tv = prepTile(e, t, g.filter !== 2 || g.n[2] < t.P);
      emit('base', clipS, q, { kind: K_TEX, flags: op.skipDetails ? F_SKIP_DETAIL : 0, filter: g.filter, tile: [t.ox, t.oy, t.tw, t.th], core, m: g.m, n: [g.n[0], g.n[1], g.n[2], t.P],pixelOrigin:[V.tx+(g.F[4]+t.ox)*V.s,V.ty+(g.F[5]+t.oy)*V.s], has: (tv.det ? 1 : 0) | (tv.pyr ? 2 : 0), pz: op.gridScale ? [...pzOf(t).slice(0, 2), ...op.gridScale] : pzOf(t), grid: op.grid }, { src: tv.det, pyr: tv.pyr, detail: op.skipDetails });
    }
  }
  function runOps(ops, target) {
    let clipActive = false;
    for (const op of ops) {
      if (op.k === 'base') { if (op.used) { drawBase(op); clipActive = true; } continue; }
      if (op.k === 'src') { drawSrcOp(op, target, clipActive && op.clip); continue; }
      if (op.k === 'adj') {
        const q = devRect(0, 0, V.docW, V.docH); if (!q) continue;
        if (op.clip && !clipActive) continue;
        const L = lutOf(op);
        let flags = 0;
        if (op.plane) flags |= F_MASK;
        if (op.clip) flags |= F_CLIP;
        emit('generic', target, q, { kind: K_ADJ, mode: MODE_CODE[op.blend] ?? 0, flags, opacity: op.opacity, lutKind: L.kind, level: L.level, core: [0, 0, V.docW, V.docH] },
          { mask: op.plane ? planeView(op.plane, V.docW, V.docH) : null, clip: op.clip ? clipS.view : null, l1: L.view1, l3: L.view3 });
        continue;
      }
      if (op.k === 'group') {
        const S = acquire();
        if (op.mode === 'passMask') {
          drawCalls.push({ kind: 'copyAll', from: target, to: S });
          runOps(op.ops, S);
          const q = devRect(0, 0, V.docW, V.docH);
          if (q) emit('generic', target, q, { kind: K_SURF, flags: F_LERP, opacity: op.opacity, core: [0, 0, V.docW, V.docH] }, { src: S.view, mask: planeView(op.mask, V.docW, V.docH) });
          drawCalls.push({ kind: 'release', s: S });
          clipActive = false;
          continue;
        }
        drawCalls.push({ kind: 'clear', s: S });
        const ab = op.artboard;
        if (ab && ab.color && ab.r > ab.l && ab.b > ab.t) {
          const q = devRect(ab.l, ab.t, ab.r, ab.b);
          if (q) emit('over', S, q, { kind: K_SOLID, color: [ab.color[0] / 255, ab.color[1] / 255, ab.color[2] / 255, 1], opacity: 1, core: [ab.l, ab.t, ab.r, ab.b] }, {});
        }
        runOps(op.ops, S);
        const q = devRect(0, 0, V.docW, V.docH);
        if (q) {
          let flags = 0;
          if (op.mask) flags |= F_MASK;
          if (ab && ab.clip) flags |= F_ABCLIP;
          const mode = MODE_CODE[op.blend] ?? 0;
          emit(isHardware(mode, flags) ? 'over' : 'generic', target, q,
            { kind: K_SURF, mode, flags, opacity: op.opacity, ab: ab ? [ab.l, ab.t, ab.r, ab.b] : null, core: [0, 0, V.docW, V.docH] },
            { src: S.view, mask: op.mask ? planeView(op.mask, V.docW, V.docH) : null });
        }
        drawCalls.push({ kind: 'release', s: S });
        clipActive = false;
      }
    }
  }
  
  function encodeCalls(root) {
    const bgCache = new Map();
    for (const c of drawCalls) {
      if (c.kind === 'release') { release(c.s); continue; }
      if (c.kind === 'clear') { beginPass(c.s, { r: 0, g: 0, b: 0, a: 0 }); continue; }
      if (c.kind === 'clearClip') { beginPass(clipS, { r: 0, g: 0, b: 0, a: 0 }); continue; }
      if (c.kind === 'copyAll') { endPass(); enc.copyTextureToTexture({ texture: c.from.tex }, { texture: c.to.tex }, [V.W, V.H]); continue; }
      const b = c.binds;
      if (c.kind === 'generic') {
        endPass();
        const [x0, y0, x1, y1] = c.quad;
        enc.copyTextureToTexture({ texture: c.target.tex, origin: [x0, y0] }, { texture: tmpS.tex, origin: [x0, y0] }, [x1 - x0, y1 - y0]);
      }
      const p = beginPass(c.target);
      p.setPipeline(c.kind === 'over' ? P.over : c.kind === 'base' ? P.base : P.generic);
      const key = [b.src, c.kind === 'generic' ? tmpS : null, b.mask, b.clip, b.l3, b.l1, b.pyr, b.detail].map(v => v ? (v.__id || (v.__id = ++bindSeq)) : 0).join(',');
      let bg = bgCache.get(key);
      if (!bg) { bg = bindGroup(b.src, c.kind === 'generic' ? tmpS.view : null, b.mask, b.clip, b.l3, b.l1, b.pyr, b.detail); bgCache.set(key, bg); }
      p.setBindGroup(0, bg, [c.off]);
      const [x0, y0, x1, y1] = c.quad;
      p.setScissorRect(x0, y0, x1 - x0, y1 - y0);
      p.draw(6);
    }
    endPass();
    void root;
  }
  let bindSeq = 0;
  const stats = { frames: 0, uploads: 0, partial: 0, uploadPx: 0, ops: 0, ms: 0, pyramids: 0, tileCandidates: 0, virtualSources: 0, virtualTiles: 0 };

  function viewOf(list, view) {
    const s = view.s;
    const isInt = Math.abs(s - Math.round(s)) < 1e-6;
    const filter = (s >= 2 || (isInt && s >= 1)) ? 0 : s > 1 ? 1 : 2;
    return { W: Math.max(1, view.W | 0), H: Math.max(1, view.H | 0), s, tx: view.tx, ty: view.ty, docW: list.docW, docH: list.docH,
      filter, lod: s < 1 ? Math.log2(1 / s) : 0 };
  }
  
  function composeFrame(list, view) {
    if (lost) throw new Error('GPU 设备丢失：' + (lost.message || ''));
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    frame++; frameUpload = 0; deferred = false; stats.tileCandidates = 0; stats.virtualSources = 0; stats.virtualTiles = 0;
    V = viewOf(list, view);
    ensureSurfaces(V.W, V.H);
    nOps = 0; drawCalls.length = 0; ensureOpBuf(64);
    for (const s of pool) s.busy = false;
    const root = acquire();
    drawCalls.push({ kind: 'clear', s: root });
    runOps(list.ops, root);
    device.queue.writeBuffer(opBuf, 0, opData, 0, Math.max(OP_STRIDE, nOps * OP_STRIDE));
    enc = device.createCommandEncoder();
    encodeCalls(root);
    stats.ops = nOps;
    stats.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    stats.frames++;
    return root;
  }
  function presentInto(root, targetView, pipeline, straight, present) {
    const pr = present || {};
    const u = utilBG(root.view, [V.W, V.H, displayLut ? 1 : 0, pr.single == null ? -1 : pr.single], [straight ? 1 : 0, 0, 0, 0], displayLut ? displayLut.view : D3, [0, 0, 0, 0],
      [pr.off && pr.off.has(0) ? 1 : 0, pr.off && pr.off.has(1) ? 1 : 0, pr.off && pr.off.has(2) ? 1 : 0, 0]);
    const p = enc.beginRenderPass({ colorAttachments: [{ view: targetView, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }] });
    p.setPipeline(pipeline); p.setBindGroup(0, u.bg); p.draw(3); p.end();
    return u.buf;
  }
  const api = {
    device, adapter, name: adapterName || 'WebGPU', maxDim, tile: TILE, stats,
    get bytesResident() { return bytesResident + detailBytes; },
    get detailBytes() { return detailBytes; },
    
    get needsRefine() { return deferred; },
    get lost() { return lost; },
    
    render(list, view, present = null) {
      if (!ctx) throw new Error('没有画布');
      const root = composeFrame(list, view);
      const ub = presentInto(root, ctx.getCurrentTexture().createView(), P.present, false, present);
      device.queue.submit([enc.finish()]); enc = null;
      ub.destroy();
      sweep(opts.budget || 3e9);
    },
    
    async renderToRGBA(list, view, present = null) {
      const root = composeFrame(list, view);
      if (!outTex || outTex.width !== V.W || outTex.height !== V.H) { if (outTex) outTex.destroy(); outTex = mkTex(V.W, V.H, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.COPY_SRC); }
      const ub = presentInto(root, outTex.createView(), P.presentRead, true, present);
      const W = V.W, H = V.H;                  
      const bpr = Math.ceil(W * 4 / 256) * 256;
      const buf = device.createBuffer({ size: bpr * H, usage: BU.COPY_DST | BU.MAP_READ });
      enc.copyTextureToBuffer({ texture: outTex }, { buffer: buf, bytesPerRow: bpr }, [W, H]);
      device.queue.submit([enc.finish()]); enc = null;
      await buf.mapAsync(1);
      const src = new Uint8Array(buf.getMappedRange()), out = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) out.set(src.subarray(y * bpr, y * bpr + W * 4), y * W * 4);
      buf.unmap(); buf.destroy(); ub.destroy();
      sweep(opts.budget || 3e9);
      return out;
    },
    
    invalidate(data, rect = null) {
      const e = srcs.get(data); if (!e) return;
      const r = rect ? { x0: Math.max(0, Math.floor(rect.x0)), y0: Math.max(0, Math.floor(rect.y0)), x1: Math.min(e.w, Math.ceil(rect.x1)), y1: Math.min(e.h, Math.ceil(rect.y1)) } : { x0: 0, y0: 0, x1: e.w, y1: e.h };
      if (r.x1 <= r.x0 || r.y1 <= r.y0) return;
      for (const t of e.tiles) {
        if (r.x1 <= t.ox || r.y1 <= t.oy || r.x0 >= t.ox + t.tw || r.y0 >= t.oy + t.th) continue;
        if (!t.det && !t.pyr) continue;                     
        t.dirty = t.dirty ? { x0: Math.min(t.dirty.x0, r.x0), y0: Math.min(t.dirty.y0, r.y0), x1: Math.max(t.dirty.x1, r.x1), y1: Math.max(t.dirty.y1, r.y1) } : { ...r };
      }
      stats.partial++;
    },
    

    rekey(from, to) {
      const e = srcs.get(from); if (!e || !to || from === to || srcs.has(to)) return false;
      if (to.length !== from.length) return false;
      srcs.delete(from); e.data = to; e.ref = typeof WeakRef !== 'undefined' ? new WeakRef(to) : null; srcs.set(to, e);
      return true;
    },
    
    forget(data) { const e = srcs.get(data); if (e) destroyEntry(e); },
    

    pruneDetailTiles(detail) {
      for (const e of [...live]) if (e.virtualCaches) for (const [key, c] of e.virtualCaches) if (c.states.has(detail)) {
        const root = c.descriptor;
        if (!root.edits?.tiles.size&&![root, ...(root.levels?.values() || [])].some(s => s.tiles.size)) { dropVirtualCache(c); e.virtualCaches.delete(key); }
        else detailGridOf(e, root, c.preferredScale);
      }
    },
    has(data) { return srcs.has(data); },
    
    setDisplayLut(data) {
      if (displayLut) { displayLut.tex.destroy(); displayLut = null; }
      if (!data) return;
      const n = LUT3_N, tex = mkTex(n, n, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, 1, '3d', n);
      device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: n * 4, rowsPerImage: n }, [n, n, n]);
      displayLut = { tex, view: tex.createView({ dimension: '3d' }) };
    },
    
    supports(list) {
      if (lost) return false;
      const big = list.docW > maxDim || list.docH > maxDim;
      if (!big) return true;
      const needs = ops => ops.some(o => (o.k === 'adj' && o.plane) || (o.k === 'group' && (o.mask || needs(o.ops))));
      return !needs(list.ops);
    },
    destroy() {
      for (const e of [...live]) destroyEntry(e);
      for (const v of surfSets.values()) { for (const x of v.pool) x.tex.destroy(); v.tmpS.tex.destroy(); v.clipS.tex.destroy(); }
      surfSets.clear();
      if (outTex) outTex.destroy(); if (opBuf) opBuf.destroy(); uniBuf.destroy();
      if (displayLut) displayLut.tex.destroy();
      if (!opts.device) try { device.destroy(); } catch {}
    },
  };
  return api;
}

export default { createGpuCompositor, adjustmentLut, bakeDisplayLut, MODE_CODE, DISPLAY_LUT_SIZE };
