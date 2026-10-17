
import * as I from '../core/icc.js';
import * as C from '../core/color-convert.js';
import * as L from '../core/lut.js';
import { convertDocument, readEmbeddedProfile, trapDocument } from '../core/doc-mode.js';
import { createPsd } from '../core/psd-new.js';
import { applyEdits } from '../core/psd-edit.js';
import { parsePsdDocument, decodeComposite } from '../core/psd-document.js';
import { lintPsd } from '../core/psd-lint.js';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };

const srgb = I.sRGBProfile(), cmyk = await I.loadGenericCmykProfile();
console.log('1) sRGB → CMYK → sRGB 往返（相对比色，黑场补偿）');
{
  const f = C.buildTransform(srgb, cmyk, { intent: 1, bpc: true }), b = C.buildTransform(cmyk, srgb, { intent: 1, bpc: true });
  const g = C.gamutChecker(srgb, cmyk);
  const o = new Float64Array(4), r = [0, 0, 0]; let n = 0, sum = 0, max = 0, sumE = 0, maxE = 0, all = 0;
  for (let R = 0; R <= 255; R += 17) for (let G = 0; G <= 255; G += 17) for (let B = 0; B <= 255; B += 17) {
    const rgb = [R / 255, G / 255, B / 255]; all++;
    if (g(...rgb) > 1) continue;                      
    f.eval(rgb, o); b.eval(o, r);
    const d = Math.max(...rgb.map((v, k) => Math.abs(v - r[k]) * 255));
    const x1 = [0, 0, 0], x2 = [0, 0, 0]; srgb.toPCS(1)(rgb, x1); srgb.toPCS(1)(r, x2);
    const e = I.deltaE76(I.xyzToLab(x1), I.xyzToLab(x2));
    n++; sum += d; max = Math.max(max, d); sumE += e; maxE = Math.max(maxE, e);
  }
  console.log(`   色域内 ${n}/${all} 色：8 位误差 平均 ${(sum / n).toFixed(2)} 最大 ${max.toFixed(1)}；ΔE76 平均 ${(sumE / n).toFixed(2)} 最大 ${maxE.toFixed(2)}`);
  ok(sumE / n < 1.5 && maxE < 6, '往返误差在可接受范围（平均 ΔE < 1.5）');
  const w = new Float64Array(4); f.eval([1, 1, 1], w); ok(w.every(v => v < 0.01), `白 → CMYK ${[...w].map(v => (v * 100).toFixed(1))}%（纸白无墨）`);
  const k = new Float64Array(4); f.eval([0.5, 0.5, 0.5], k); ok(k[3] > 0 && Math.abs(k[0] - k[1]) < 0.15, `50% 灰 → C${(k[0] * 100) | 0} M${(k[1] * 100) | 0} Y${(k[2] * 100) | 0} K${(k[3] * 100) | 0}（四色灰平衡，带 K）`);
  
  const re = I.parseIcc(cmyk.bytes); ok(re.kind === 'lut' && re.colorSpace === 'CMYK', 'CMYK 配置文件字节可再解析（lut16，A2B/B2A）');
  const re2 = I.parseIcc(srgb.bytes); const x = [0, 0, 0]; re2.toPCS(1)([1, 1, 1], x); ok(Math.abs(x[1] - 1) < 1e-3, 'sRGB 白点映射到 D50 白');
}
console.log('2) .cube 恒等查找表：结果不变');
{
  const id = L.sampleToLut((i, o) => { o[0] = i[0]; o[1] = i[1]; o[2] = i[2]; }, 33);
  const rgba = new Uint8ClampedArray(4 * 100000); for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 2654435761 >>> 7) & 255;
  for (const [fmt, lut] of [['cube', L.parseCube(L.writeCube(id))], ['3dl', L.parse3dl(L.write3dl(id))], ['csp', L.parseCsp(L.writeCsp(id))], ['icc 设备链接', L.parseLut(L.writeIccLink(id), 'a.icc')]])
    for (const interp of ['tetrahedral', 'trilinear']) { const out = L.applyLutRGBA(rgba, lut, { interp }); let d = 0; for (let i = 0; i < out.length; i++) d = Math.max(d, Math.abs(out[i] - rgba[i])); ok(d === 0, `${fmt} / ${interp}：最大差 ${d}`); }
}
console.log('3) 索引颜色 256 色 + 4) 模式转换写回再读取');
{
  const w = 256, h = 128, rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; const hh = x / w * 6, k = n => (n + hh) % 6, f = n => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1)); const l = 1 - y / h; rgba[o] = f(5) * 255 * l; rgba[o + 1] = f(3) * 255 * l; rgba[o + 2] = f(1) * 255 * l; rgba[o + 3] = 255; }
  let base = createPsd({ width: w, height: h });
  base = applyEdits(base, [{ op: 'replaceLayerPixels', index: 0, rgba: { data: rgba, width: w, height: h }, bounds: { top: 0, left: 0, bottom: h, right: w }, merged: { data: rgba } }]).buffer;
  const ix = convertDocument(base, { mode: 'indexed' }, { srcProfile: srgb, indexed: { palette: 'adaptive', colors: 256, dither: 'none' } });
  const d = parsePsdDocument(new Uint8Array(ix.buffer)), comp = decodeComposite(d, new Uint8Array(ix.buffer));
  const used = new Set(comp.channels[0]); const pal = d.colorModeData.palette;
  let err = 0; for (let i = 0; i < w * h; i++) { const k = comp.channels[0][i]; err += Math.abs(pal.r[k] - rgba[i * 4]) + Math.abs(pal.g[k] - rgba[i * 4 + 1]) + Math.abs(pal.b[k] - rgba[i * 4 + 2]); }
  ok(d.header.mode === 2 && used.size > 200 && used.size <= 256, `索引颜色：模式 ${d.header.mode}，实际用到 ${used.size} 个索引，平均每通道误差 ${(err / w / h / 3).toFixed(2)}`);
  const modes = [['rgb', 3], ['cmyk', 4], ['gray', 1], ['lab', 9], ['multichannel', 7], ['indexed', 2]];
  for (const [m, id] of modes) {
    const r = convertDocument(base, { mode: m }, { srcProfile: srgb, dstProfile: m === 'cmyk' ? cmyk : m === 'gray' ? I.grayProfile({ dotGain: 20 }) : null });
    const dd = parsePsdDocument(new Uint8Array(r.buffer)); const lint = lintPsd(r.buffer);
    ok(dd.header.mode === id && lint.ok, `→ ${m}：文件头模式 ${dd.header.mode}，通道 ${dd.header.channels}，图层 ${dd.layers.length}，lint ${lint.ok ? '通过' : lint.errors[0]}${readEmbeddedProfile(r.buffer) ? '，嵌 ICC' : ''}`);
  }
  const g = convertDocument(base, { mode: 'gray' }, { srcProfile: srgb }).buffer;
  for (const [m, o] of [['bitmap', { bitmap: { method: 'halftone', frequency: 30 } }], ['duotone', {}]]) { const r = convertDocument(g, { mode: m }, o); const dd = parsePsdDocument(new Uint8Array(r.buffer)); ok(dd.header.mode === (m === 'bitmap' ? 0 : 8) && lintPsd(r.buffer).ok, `灰度 → ${m}：模式 ${dd.header.mode} 位深 ${dd.header.depth}`); }
  for (const dp of [16, 32]) { const r = convertDocument(base, { depth: dp }, { srcProfile: srgb }); const dd = parsePsdDocument(new Uint8Array(r.buffer)); const back = convertDocument(r.buffer, { depth: 8 }, { srcProfile: srgb, hdr: { method: 'exposureGamma' } }); const c2 = decodeComposite(parsePsdDocument(new Uint8Array(back.buffer)), new Uint8Array(back.buffer)); let mx = 0; for (let i = 0; i < w * h; i++) mx = Math.max(mx, Math.abs(c2.channels[0][i] - rgba[i * 4])); ok(dd.header.depth === dp && mx <= 1, `8 → ${dp} → 8 位：最大误差 ${mx}`); }
  const c = convertDocument(base, { mode: 'cmyk' }, { srcProfile: srgb, dstProfile: cmyk }).buffer;
  const t = trapDocument(c, 0, 2); ok(lintPsd(t).ok, '陷印（CMYK，2 像素）写回通过 lint');
}
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
