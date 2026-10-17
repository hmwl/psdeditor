










import { applyFilter, normalizeFilterParams } from './filters.js';
import { renderLiquifyMesh } from './liquify-mesh.js';
import { decodeGalleryDescriptor } from './filter-gallery-spec.js';
import { blendPixelRGB } from './compose.js';
import { blendKeyOfPs } from './smart-filter-spec.js';


let galleryStack = null;
export function setGalleryKernel(fn) { galleryStack = typeof fn === 'function' ? fn : null; }

const P = (key, ps, type, extra) => ({ key, ps, type, ...(extra || {}) });
export const SMART_FILTER_KERNELS = {
  GsnB: ['gaussianBlur', [P('radius', 'Rds ', 'num')]],
  boxblur: ['boxBlur', [P('radius', 'Rds ', 'num')]],
  'Blr ': ['blur', []], BlrM: ['blurMore', []],
  MtnB: ['motionBlur', [P('angle', 'Angl', 'num'), P('distance', 'Dstn', 'num')]],
  RdlB: ['radialBlur', [P('amount', 'Amnt', 'num'), P('method', 'BlrM', 'enum', { map: { 'Spn ': 'spin', 'Zm  ': 'zoom' } })]],
  UnsM: ['unsharpMask', [P('amount', 'Amnt', 'num'), P('radius', 'Rds ', 'num'), P('threshold', 'Thsh', 'num')]],
  Shrp: ['sharpen', []], ShrM: ['sharpenMore', []], ShrE: ['sharpenEdges', []],
  AdNs: ['addNoise', [P('distribution', 'Dstr', 'enum', { map: { Unfr: 'uniform', 'Gsn ': 'gaussian' } }), P('amount', 'Nose', 'num'), P('monochromatic', 'Mnch', 'bool'), P('seed', 'FlRs', 'num')]],
  'Mdn ': ['median', [P('radius', 'Rds ', 'num')]],
  Dspc: ['despeckle', []],
  DstS: ['dustScratches', [P('radius', 'Rds ', 'num'), P('threshold', 'Thsh', 'num')]],
  HghP: ['highPass', [P('radius', 'Rds ', 'num')]],
  'Msc ': ['mosaic', [P('cell', 'ClSz', 'num')]],
  FndE: ['findEdges', []], Slrz: ['solarize', []],
  Embs: ['emboss', [P('angle', 'Angl', 'num'), P('height', 'Hght', 'num'), P('amount', 'Amnt', 'num')]],
  'Mxm ': ['maximum', [P('radius', 'Rds ', 'num')]], 'Mnm ': ['minimum', [P('radius', 'Rds ', 'num')]],
  Twrl: ['twirl', [P('angle', 'Angl', 'num')]], Pnch: ['pinch', [P('amount', 'Amnt', 'num')]],
  Sphr: ['spherize', [P('amount', 'Amnt', 'num'), P('mode', 'SphM', 'enum', { map: { Nrml: 'normal', HrzO: 'horizontal', VrtO: 'vertical' } })]],
  
  psd_editorCameraRaw: ['cameraRaw', ['temperature', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'texture', 'clarity', 'dehaze', 'vibrance', 'saturation'].map(k => P(k, k, 'num'))],
  psd_editorLensCorrection: ['lensCorrection', [...['distortion', 'caRed', 'caBlue', 'vignette', 'midpoint', 'vertical', 'horizontal', 'angle', 'scale'].map(k => P(k, k, 'num')), P('edge', 'edge', 'text')]],
};
const modeOf = f => (f.blendOptions && f.blendOptions.mode ? blendKeyOfPs(f.blendOptions.mode) : 'norm');
const DEFORM = new Set(['perspectiveWarpTransform', 'rigidTransform']);




export function kernelOf(f, valueOf = (f2, p) => p.value) {
  if (!f || DEFORM.has(f.classID)) return null;
  if (f.classID === 'GEfc') return galleryStack ? galleryKernelOf(f, valueOf) : null;
  const spec = SMART_FILTER_KERNELS[f.classID];
  if (!spec) return null;
  const [kind, defs] = spec, params = {};
  const byPath = new Map((f.params || []).map(p => [p.path, p]));
  for (const d of defs) {
    const p = byPath.get(d.ps); if (!p) continue;
    let v = valueOf(f, p);
    if (v && typeof v === 'object' && 'value' in v) v = v.value;
    if (d.type === 'num') params[d.key] = +v;
    else if (d.type === 'bool') params[d.key] = !!v;
    else if (d.type === 'enum') { const hit = d.map[v]; if (hit) params[d.key] = hit; }
    else if (d.type === 'text') params[d.key] = String(v);
  }
  const op = f.blendOptions && f.blendOptions.opacity != null ? +f.blendOptions.opacity : 100;
  return { kind, params, opacity: Number.isFinite(op) ? op : 100, mode: modeOf(f) };
}


function galleryKernelOf(f, valueOf) {
  const root = {};
  for (const p of f.params || []) {
    const parts = String(p.path).split('.');
    if (parts[0] !== 'GEfs' || parts.length < 3) continue;
    let v = valueOf(f, p); if (v && typeof v === 'object' && 'value' in v) v = v.value;
    let o = root;
    for (let i = 1; i < parts.length - 1; i++) o = o[parts[i]] || (o[parts[i]] = {});
    const k = parts[parts.length - 1];
    o[k] = k === 'GEfk' ? { value: v } : v;
  }
  const items = Object.keys(root).sort((a, b) => a - b).map(k => root[k]);
  const layers = decodeGalleryDescriptor({ GEfs: items });
  if (!layers) return null;
  const col = c => (c && c.r != null ? [c.r, c.g, c.b] : null);
  const op = f.blendOptions && f.blendOptions.opacity != null ? +f.blendOptions.opacity : 100;
  return { kind: 'filterGallery', params: { layers, fg: col(f.foreground) || [0, 0, 0], bg: col(f.background) || [255, 255, 255] }, opacity: Number.isFinite(op) ? op : 100, mode: modeOf(f) };
}





export function runFilterStack(rgba, width, height, steps, rect = null) {
  let cur = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
  for (const s of steps) {
    let next;
    try {
      next = s.kind === 'filterGallery' ? galleryStack(cur, width, height, s.params.layers, { fg: s.params.fg, bg: s.params.bg })
        : s.kind === 'liquify' ? (s.params.mesh ? renderLiquifyMesh(cur, width, height, s.params.mesh, rect) : null)
        : applyFilter(s.kind, cur, width, height, normalizeFilterParams(s.kind, s.params));
      if (!next) return null;
    }
    catch { return null; }
    cur = blendStep(cur, next, s.mode, s.opacity);
  }
  return cur;
}







export function blendStep(base, filtered, mode = 'norm', opacity = 100) {
  const k = Math.max(0, Math.min(1, (opacity ?? 100) / 100));
  const n = base.length;
  if (!mode || mode === 'norm' || mode === 'pass') {
    if (k >= 1) return filtered;
    const out = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) out[i] = base[i] + (filtered[i] - base[i]) * k; return out;
  }
  const out = new Uint8ClampedArray(n);
  if (mode === 'diss') {
    let seed = 0x9e3779b9;
    for (let i = 0; i < n; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const take = ((seed >>> 0) / 4294967296) < k;
      const src = take ? filtered : base;
      out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
    }
    return out;
  }
  const cb = [0, 0, 0], cs = [0, 0, 0];
  for (let i = 0; i < n; i += 4) {
    const ab = base[i + 3] / 255, as = filtered[i + 3] / 255;
    const ao = as + ab * (1 - as);
    let r = base[i], g = base[i + 1], b = base[i + 2];
    if (ao > 0) {
      cb[0] = base[i]; cb[1] = base[i + 1]; cb[2] = base[i + 2];
      cs[0] = filtered[i]; cs[1] = filtered[i + 1]; cs[2] = filtered[i + 2];
      const m = blendPixelRGB(mode, cb, cs);
      r = (as * (1 - ab) * cs[0] + as * ab * m[0] + (1 - as) * ab * cb[0]) / ao;
      g = (as * (1 - ab) * cs[1] + as * ab * m[1] + (1 - as) * ab * cb[1]) / ao;
      b = (as * (1 - ab) * cs[2] + as * ab * m[2] + (1 - as) * ab * cb[2]) / ao;
    }
    out[i] = base[i] + (r - base[i]) * k; out[i + 1] = base[i + 1] + (g - base[i + 1]) * k;
    out[i + 2] = base[i + 2] + (b - base[i + 2]) * k; out[i + 3] = base[i + 3] + (ao * 255 - base[i + 3]) * k;
  }
  return out;
}


export function blendByFilterMask(input, filtered, rect, m) {
  const w = rect.right - rect.left, h = rect.bottom - rect.top;
  const out = new Uint8ClampedArray(input.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, k = m(x + rect.left, y + rect.top) / 255;
    for (let c = 0; c < 4; c++) out[i + c] = input[i + c] + (filtered[i + c] - input[i + c]) * k;
  }
  return out;
}
export default { SMART_FILTER_KERNELS, kernelOf, runFilterStack, blendByFilterMask, setGalleryKernel, blendStep };
