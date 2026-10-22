







import sharp from 'sharp';
import { resolveProfile, cleanupProfile } from './icc.js';
import {
  parseSmartObjects, toFoxpsdLayerInfo, parsePsdRaster,
  renderWarp, createCPUBackend,
  alphaBounds, crop, flatten, rebuildPsdReplacingLayerPixels,
  compositeAll,
  bakeSourceRaster, pngFilename, rebuildPsdChannels, lintPsd, SUPPORTED_BLEND_MODES,
  parseFilterEffects, decodeFilterEffectsEntry, writeThumbnail
} from './private/index.js';
import fs from 'node:fs';

function unsupportedWarpError(layerName) {
  const e = new Error(`智能对象「${layerName}」包含不支持的变形数据；请先在 Photoshop 中栅格化对应图层。`);
  e.status = 422; e.code = 'unsupported_warp';
  return e;
}


let _backend = null, _backendName = null;

export async function getBackend(prefer = 'auto') {
  if (_backend && (prefer === 'auto' || prefer === _backendName)) return _backend;
  if (prefer === 'cpu') { _backend = createCPUBackend(); _backendName = 'cpu'; return _backend; }
  try {
    const { createNodeGLBackend, nodeGLAvailable } = await import('../core/render/adapter-node-gl.js');
    if (nodeGLAvailable()) { _backend = createNodeGLBackend(); _backendName = 'gl'; return _backend; }
  } catch {  }
  if (prefer === 'gl') throw new Error('要求 GL 后端但 headless-gl 不可用（请由部署方安装并审计兼容的 GL provider）');
  _backend = createCPUBackend(); _backendName = 'cpu';
  return _backend;
}
export function backendName() { return _backendName; }



export async function decodeImage(buf) {
  
  
  const { data, info } = await sharp(buf).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}


export function findSO(sos, target) {
  if (target == null) return 0;
  if (typeof target === 'number') {
    if (target < 0 || target >= sos.length) throw new Error(`智能对象下标 ${target} 越界（共 ${sos.length} 个）`);
    return target;
  }
  const i = sos.findIndex(s => s.layerName === target);
  if (i < 0) throw new Error(`找不到名为「${target}」的智能对象。可用：${sos.map(s => s.layerName).join(' / ')}`);
  return i;
}


function matchLayer(doc, so) {
  let best = -1, bestScore = Infinity;
  doc.layers.forEach((l, idx) => {
    if (!l.isSmartObject) return;
    const db = Math.abs(l.bounds.left - so.bounds.left) + Math.abs(l.bounds.top - so.bounds.top)
             + Math.abs(l.bounds.right - so.bounds.right) + Math.abs(l.bounds.bottom - so.bounds.bottom);
    const score = (l.name === so.layerName ? 0 : 1000) + db;
    if (score < bestScore) { bestScore = score; best = idx; }
  });
  return best;
}




function collectCompatibilityWarnings(doc) {
  const warnings = [...(doc.warnings || [])];
  for (let index = 0; index < doc.layers.length; index++) {
    const layer = doc.layers[index];
    if (layer.hidden) continue;
    const name = `图层 ${index}「${layer.name || '(未命名)'}」`;
    const add = (code, message) => warnings.push({ code, layerIndex: index, layerName: layer.name || '', message });
    if (layer.adjustment) add('adjustment-layer', `${name} 包含${layer.adjustment.label}调整层；服务端位图合成不会应用该调整。`);
    if (layer.fill) add('fill-layer', `${name} 是${layer.fill.label}；服务端位图合成可能无法重现其参数化填充。`);
    if (layer.vectorMask) add('vector-mask', `${name} 含矢量蒙版；服务端预览只使用已栅格化的图层数据。`);
    if (layer.effects) add('layer-effects', `${name} 含图层样式；服务端位图合成不会重绘图层样式。`);
    if (!SUPPORTED_BLEND_MODES.includes(layer.blendMode))
      add('unsupported-blend-mode', `${name} 使用未实现的混合模式「${layer.blendMode}」，服务端按正常模式预览。`);
    if (layer.group && (layer.group.type === 1 || layer.group.type === 2)
        && ((layer.opacity ?? 255) !== 255 || layer.blendMode !== 'pass'))
      add('group-isolation', `${name} 使用组不透明度或组混合模式；服务端预览按子图层合成，位图输出可能与 Photoshop 不同。`);
  }
  return warnings;
}




export function warningMeta(warnings) {
  if (!warnings.length) return {};
  const kept = [];
  let budget = 6000;
  for (const w of warnings) {
    const escaped = JSON.stringify({ code: w.code, layerIndex: w.layerIndex, layerName: w.layerName, message: w.message })
      .replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    if (kept.length && escaped.length > budget) break;
    kept.push(w);
    budget -= escaped.length;
  }
  return { compatibilityWarningCount: warnings.length, compatibilityWarnings: kept };
}



export async function renderPsd(o) {
  const ctx = await preparePsdRender(o);
  if ((ctx.out.format || 'png') === 'psd') return writePsdOutput(ctx);
  return renderBitmapOutput(ctx);
}







export async function preparePsdRender(o) {
  const t0 = Date.now();
  const ab = o.psd instanceof ArrayBuffer ? o.psd
           : o.psd.buffer.slice(o.psd.byteOffset, o.psd.byteOffset + o.psd.byteLength);

  const sos = parseSmartObjects(ab);
  if (!sos.length) throw new Error('该 PSD 里没有智能对象（SoLd/PlLd）');
  
  const doc = await parsePsdRaster(ab, { strictChannels: true });
  const docW = doc.width, docH = doc.height;
  const compatWarnings = collectCompatibilityWarnings(doc);

  const out = o.output || {};
  const rOpt = o.render || {};
  const backend = await getBackend(rOpt.backend || 'auto');
  const ss = rOpt.supersample != null ? rOpt.supersample : 2;
  const subdiv = rOpt.subdiv || 20;

  
  const warped = new Map();   
  const applied = [];
  for (const rep of (o.replacements || [])) {
    const i = findSO(sos, rep.target);
    const so = sos[i];
    const li = toFoxpsdLayerInfo(so);
    if (li.proWarp && li.proWarp.length)
      throw unsupportedWarpError(so.layerName);
    if (!li.points || li.points.length !== li.xn * li.yn)
      throw new Error(`智能对象「${so.layerName}」不是规则网格（${li.xn}×${li.yn}），无法渲染`);

    const img = await decodeImage(rep.image);
    const res = renderWarp({
      backend, image: img, imageKey: 'rep' + i,
      layerInfo: li, docWidth: docW, docHeight: docH,
      subdiv, supersample: ss,
      fit: rep.fit || { mode: 'cover' }
    });
    const li_ = matchLayer(doc, so);
    if (li_ < 0) throw new Error(`在 PSD 栅格图层里找不到智能对象「${so.layerName}」对应的图层（无法替换像素）`);
    warped.set(li_, { data: res.data, width: res.width, height: res.height });
    applied.push({ index: i, name: so.layerName, layerIndex: li_,
                   mesh: `${li.xn}×${li.yn}`,
                   fit: (rep.fit && rep.fit.mode) || 'cover',
                   
                   image: img, fitSpec: rep.fit || { mode: 'cover' }, srcW: li.width, srcH: li.height,
                   sourceName: rep.sourceName || rep.filename || null });
  }

  return { t0, ab, sos, doc, docW, docH, compatWarnings, out, backend, ss, subdiv, warped, applied };
}


export async function writePsdOutput(ctx) {
  const { t0, ab, sos, doc, docW, docH, compatWarnings, out, backend, ss, warped, applied } = ctx;
  let buf = ab.slice(0);
  
  const merged = compositeAll(doc, docW, docH, warped);
  for (const a of applied) {
    const surf = warped.get(a.layerIndex);
    const b = alphaBounds(surf);
    if (!b) continue;
    let sourcePatch = null, filterEffectsPatch = null;
    try {
      sourcePatch = await buildSourcePatch(buf, a);
      a.sourceReplaced = !!sourcePatch;
    } catch (e) { a.sourceReplaced = '失败(' + e.message + ')，双击智能对象仍是原图'; }
    
    
    buf = rebuildPsdReplacingLayerPixels(buf, a.layerIndex, crop(surf, b).data, b, merged.data, { sourcePatch, filterEffectsPatch }).buffer;
  }
  
  try { buf = await writeThumbnailFromSurface(buf, merged, docW, docH); }
  catch (e) { compatWarnings.push({ code: 'thumbnail', message: '缩略图未更新：' + e.message }); }
  
  let cmykMeta = {};
  if ((out.colorMode || 'rgb').toLowerCase() === 'cmyk') {
    const r = await convertPsdToCmyk(buf, out);
    buf = r.buffer; cmykMeta = { colorMode: 'cmyk', icc: r.icc, ...(r.iccWarning ? { iccWarning: r.iccWarning } : {}) };
  }
  
  const lint = lintPsd(buf);
  if (!lint.ok) {
    
    
    const e = new Error('生成的 PSD 未通过结构校验：' + lint.errors.join('；'));
    e.status = 422; e.code = 'artifact_lint_failed'; e.stage = 'lint';
    e.lint = { ok: false, errors: lint.errors.slice(0, 20), warnings: (lint.warnings || []).slice(0, 10) };
    throw e;
  }
  return { buffer: Buffer.from(buf), contentType: 'image/vnd.adobe.photoshop',
           meta: { docW, docH, applied: slimMeta(applied), backend: backendName(), ...cmykMeta, ...warningMeta(compatWarnings),
                   ...(lint.warnings.length ? { lintWarnings: lint.warnings } : {}), ms: Date.now() - t0 } };
}


export async function renderBitmapOutput(ctx) {
  const { t0, doc, docW, docH, compatWarnings, out, warped, applied } = ctx;
  const merged = compositeAll(doc, docW, docH, warped);
  const encoded = await encode(merged, docW, docH, out);
  return { buffer: encoded.buffer, contentType: encoded.contentType,
           meta: { docW, docH, applied: slimMeta(applied), backend: backendName(), ...warningMeta(compatWarnings),
                   colorMode: encoded.colorMode, icc: encoded.icc,
                   ...(encoded.iccWarning ? { iccWarning: encoded.iccWarning } : {}),
                   ms: Date.now() - t0 } };
}




export async function convertPsdToCmyk(buf, out = {}) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const doc = await parsePsdRaster(ab, { keepPlanes: true, strictChannels: true });
  if (doc.depth !== 8) throw new Error('PSD 转 CMYK 只支持 8 位/通道');
  if (doc.mode === 4) return { buffer: ab, icc: null };
  if (doc.mode !== 3 && doc.mode !== 1) throw new Error(`PSD 转 CMYK 只支持 RGB/灰度源文档（当前 mode=${doc.mode}）`);
  const profile = resolveProfile(out.icc);
  try {
    
    const toCmyk = async (r, g, b, w, h) => {
      const rgb = Buffer.alloc(w * h * 3);
      for (let i = 0; i < w * h; i++) { rgb[i * 3] = r[i]; rgb[i * 3 + 1] = g ? g[i] : r[i]; rgb[i * 3 + 2] = b ? b[i] : r[i]; }
      let img = sharp(rgb, { raw: { width: w, height: h, channels: 3 } });
      if (profile) img = img.withIccProfile(profile.path, { attach: false });
      const { data, info } = await img.toColourspace('cmyk').raw().toBuffer({ resolveWithObject: true });
      if (info.channels !== 4) throw new Error('CMYK 分色输出通道数异常：' + info.channels);
      const planes = [0, 1, 2, 3].map(() => new Uint8Array(w * h));
      for (let i = 0; i < w * h; i++) for (let k = 0; k < 4; k++) planes[k][i] = 255 - data[i * 4 + k];
      return planes;
    };
    const layerPlanes = new Map();
    for (let i = 0; i < doc.layers.length; i++) {
      const l = doc.layers[i], p = l.planes || {};
      const w = l.width, h = l.height;
      const planes = [];
      if (w > 0 && h > 0 && p[0]) {
        const c = await toCmyk(p[0], p[1], p[2], w, h);
        c.forEach((d, k) => planes.push({ id: k, data: d }));
        planes.push({ id: -1, data: p[-1] || new Uint8Array(w * h).fill(255) });
      }
      layerPlanes.set(i, { bounds: l.bounds, planes });
    }
    
    const surf = compositeAll(doc, doc.width, doc.height, new Map());
    flatten(surf, parseBg(out.background));
    const n = doc.width * doc.height, R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n);
    for (let i = 0; i < n; i++) { R[i] = surf.data[i * 4]; G[i] = surf.data[i * 4 + 1]; B[i] = surf.data[i * 4 + 2]; }
    const merged = { planes: await toCmyk(R, G, B, doc.width, doc.height) };
    if (doc.channels > 3) { const A = new Uint8Array(n); for (let i = 0; i < n; i++) A[i] = surf.data[i * 4 + 3]; merged.planes.push(A); }
    
    const filterEffectsPatches = [];
    const fe = parseFilterEffects(ab);
    for (const ent of (fe ? fe.entries : [])) {
      if (ent.depth !== 8) continue;
      const img = decodeFilterEffectsEntry(ent);
      const n = img.width * img.height, R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n), A = new Uint8Array(n);
      for (let i = 0; i < n; i++) { R[i] = img.rgba[i * 4]; G[i] = img.rgba[i * 4 + 1]; B[i] = img.rgba[i * 4 + 2]; A[i] = img.rgba[i * 4 + 3]; }
      filterEffectsPatches.push({ id: ent.id, planes: { color: await toCmyk(R, G, B, img.width, img.height), alpha: A } });
    }
    const icc = profile && out.attachIcc !== false ? new Uint8Array(fs.readFileSync(profile.path)) : null;
    const buffer = rebuildPsdChannels(ab, layerPlanes, merged, { colorMode: 'cmyk', icc, filterEffectsPatches }).buffer;
    return { buffer, icc: profile ? profile.name : null,
             iccWarning: profile ? undefined : '未指定 ICC，CMYK 走的是 libvips 内置公式，颜色不准，只能用于预览' };
  } finally { cleanupProfile(profile); }
}


async function writeThumbnailFromSurface(buf, surface, W, H) {
  const k = Math.min(1, 160 / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * k)), th = Math.max(1, Math.round(H * k));
  const jpeg = await sharp(Buffer.from(surface.data.buffer, surface.data.byteOffset, surface.data.length), { raw: { width: W, height: H, channels: 4 } })
    .flatten({ background: '#fff' }).resize(tw, th).jpeg({ quality: 80 }).toBuffer();
  return writeThumbnail(buf, new Uint8Array(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength), tw, th);
}


const slimMeta = applied => applied.map(a => ({
  index: a.index, name: a.name, layerIndex: a.layerIndex, mesh: a.mesh, fit: a.fit,
  ...(a.warpWritten ? { warpWritten: a.warpWritten } : {}),
  ...(a.sourceReplaced != null ? { sourceReplaced: a.sourceReplaced } : {}),
  ...(a.filterCacheUpdated != null ? { filterCacheUpdated: a.filterCacheUpdated } : {})
}));





async function buildSourcePatch(buf, a) {
  const fresh = parseSmartObjects(buf);
  const so = fresh[a.index] && fresh[a.index].layerName === a.name
    ? fresh[a.index] : fresh.find(s => s.layerName === a.name);
  const si = so && so.sourceImage;
  if (!si || !si._off) return null;                        
  if (!si.embedded) throw new Error('该智能对象是外部链接文件，无法替换内嵌源图');
  if (!(a.srcW > 0 && a.srcH > 0)) throw new Error('智能对象缺少原始尺寸');
  const baked = bakeSourceRaster({ image: a.image, dstW: a.srcW, dstH: a.srcH, fit: a.fitSpec });
  const png = await sharp(Buffer.from(baked.data.buffer, baked.data.byteOffset, baked.data.length),
                          { raw: { width: baked.width, height: baked.height, channels: 4 } })
    .png({ compressionLevel: 6 }).toBuffer();
  return { off: si._off, bytes: new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
           filename: pngFilename(a.sourceName || si.filename), oldFilename: si.filename, fileType: 'png ' };
}





async function encode(surface, w, h, out) {
  const format = (out.format || 'png').toLowerCase();
  const colorMode = (out.colorMode || 'rgb').toLowerCase();
  const dpi = out.dpi || 72;

  if (format === 'jpg' || format === 'jpeg' || colorMode === 'cmyk') {
    flatten(surface, parseBg(out.background));      
  }

  let img = sharp(Buffer.from(surface.data.buffer, surface.data.byteOffset, surface.data.length),
                  { raw: { width: w, height: h, channels: 4 } });

  if (out.width || out.height) img = img.resize({ width: out.width, height: out.height, fit: 'inside', withoutEnlargement: false });

  let profile = null, iccName = null;
  if (colorMode === 'cmyk') {
    
    profile = resolveProfile(out.icc);
    if (profile) {
      iccName = profile.name;
      
      img = img.withIccProfile(profile.path, { attach: out.attachIcc !== false });
    }
    img = img.toColourspace('cmyk');
  }
  img = setDensity(img, dpi, colorMode);

  try {
    let buffer, contentType;
    switch (format) {
      case 'png':
        if (colorMode === 'cmyk') throw new Error('PNG 不支持 CMYK，请改用 jpg 或 tiff');
        buffer = await img.png({ compressionLevel: 9 }).toBuffer(); contentType = 'image/png'; break;
      case 'jpg': case 'jpeg':
        buffer = await img.jpeg({ quality: out.quality || 92, chromaSubsampling: '4:4:4' }).toBuffer();
        contentType = 'image/jpeg'; break;
      case 'tif': case 'tiff':
        buffer = await img.tiff({ quality: out.quality || 92 }).toBuffer(); contentType = 'image/tiff'; break;
      case 'webp':
        if (colorMode === 'cmyk') throw new Error('WebP 不支持 CMYK，请改用 jpg 或 tiff');
        buffer = await img.webp({ quality: out.quality || 92 }).toBuffer(); contentType = 'image/webp'; break;
      default:
        throw new Error(`不支持的输出格式：${format}（可用 png / jpg / tiff / webp / psd）`);
    }
    return { buffer, contentType,
             colorMode: format === 'png' || format === 'webp' ? 'rgb' : colorMode,
             icc: iccName,
             iccWarning: colorMode === 'cmyk' && !profile
               ? '未指定 ICC，CMYK 走的是 libvips 内置公式，颜色不准，只能用于预览' : undefined };
  } finally { cleanupProfile(profile); }
}




function setDensity(img, dpi, colorMode) {
  if (typeof img.withDensity === 'function') return img.withDensity(dpi);
  if (colorMode === 'cmyk') {
    if (dpi !== 72) console.warn(`[warn] sharp ${sharp.versions.sharp} 不支持 withDensity()，CMYK 输出无法写入 ${dpi} dpi（写了会被转回 sRGB）。请升级：npm i sharp@^0.35`);
    return img;
  }
  return img.withMetadata({ density: dpi });
}

function parseBg(bg) {
  if (!bg) return [255, 255, 255];
  if (Array.isArray(bg)) return bg;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(bg));
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}


export async function inspectPsd(psd) {
  const ab = psd instanceof ArrayBuffer ? psd : psd.buffer.slice(psd.byteOffset, psd.byteOffset + psd.byteLength);
  const sos = parseSmartObjects(ab);
  const doc = await parsePsdRaster(ab);
  const compatibilityWarnings = collectCompatibilityWarnings(doc);
  return {
    width: doc.width, height: doc.height,
    layers: doc.layers.map(l => ({
      name: l.name, hidden: !!l.hidden, bounds: l.bounds, blendMode: l.blendMode,
      isSmartObject: !!l.isSmartObject, isText: !!l.isText,
      layerType: l.layerType || 'pixel',
      adjustment: l.adjustment || null,
      fill: l.fill || null
    })),
    ...(doc.warnings?.length ? { parseWarnings: doc.warnings } : {}),
    ...warningMeta(compatibilityWarnings),
    smartObjects: sos.map((so, i) => {
      const li = toFoxpsdLayerInfo(so);
      return {
        index: i, name: so.layerName, kind: so.kind,
        bounds: so.bounds,
        originalSize: so.originalSize,
        warpStyle: li.warpStyle,
        mesh: { xn: li.xn, yn: li.yn, sliceX: li.sliceX, sliceY: li.sliceY,
                patches: `${Math.max(1, ((li.xn || 4) - 1) / 3)}×${Math.max(1, ((li.yn || 4) - 1) / 3)}`,
                regular: !!(li.points && li.points.length === li.xn * li.yn) },
        sourceImage: so.sourceImage ? { filename: so.sourceImage.filename, mime: so.sourceImage.mime, bytes: so.sourceImage.byteLength } : null
      };
    })
  };
}
