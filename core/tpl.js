


















import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';
import { readPatternBlock, writePatternBlock } from './pat.js';
import { presetFromDesc, presetToDesc, collectSamples, sampBlockData, readBlocks, abrBlock, readSampForTpl } from './abr.js';

const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);
const num = (v, d = 0) => v == null ? d : (typeof v === 'object' && 'value' in v) ? +v.value : +v;


export const TOOL_CLASS = {
  brush: 'PbTl', pencil: 'PcTl', eraser: 'ErTl', mixerBrush: 'wetBrushTool', colorReplace: 'ColorReplacementTool',
  historyBrush: 'HstB', historyArtBrush: 'ABTl', cloneStamp: 'ClTl', patternStamp: 'PaTl',
  blur: 'BlTl', sharpen: 'ShTl', smudge: 'SmTl', dodge: 'DdTl', burn: 'BrTl', sponge: 'SrTl',
  backgroundEraser: 'SETl', magicEraser: 'MgEr', gradient: 'GrTl', bucket: 'Bckt',
  spotHeal: 'spotHealingBrushTool', healBrush: 'magicStampTool', patch: 'patchSelection', redEye: 'redEyeTool',
  selRect: 'marqueeRectTool', selEllipse: 'marqueeEllipTool', lasso: 'lassoTool', lassoPoly: 'polySelTool', lassoMagnetic: 'magneticLassoTool',
  wand: 'magicWandTool', quickSelect: 'quickSelectTool', crop: 'cropTool', move: 'moveTool', text: 'typeCreateOrEditTool', shape: 'rectangleTool',
  pen: 'penTool', eyedropper: 'eyedropperTool', zoom: 'zoomTool', hand: 'handTool',
};
const CLASS_TOOL = Object.fromEntries(Object.entries(TOOL_CLASS).map(([k, v]) => [v, k]));

export const BRUSH_CLASS_TOOLS = new Set(['brush', 'pencil', 'eraser', 'mixerBrush', 'colorReplace', 'historyBrush', 'historyArtBrush',
  'cloneStamp', 'patternStamp', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'backgroundEraser', 'spotHeal', 'healBrush']);

const MODE_OUT = { normal: 'Nrml', dissolve: 'Dslv', behind: 'Bhnd', clear: 'Clar', darken: 'Drkn', multiply: 'Mltp', colorBurn: 'CBrn', linearBurn: 'linearBurn',
  darkerColor: 'darkerColor', lighten: 'Lghn', screen: 'Scrn', colorDodge: 'CDdg', linearDodge: 'linearDodge', lighterColor: 'lighterColor', overlay: 'Ovrl',
  softLight: 'SftL', hardLight: 'HrdL', vividLight: 'vividLight', linearLight: 'linearLight', pinLight: 'pinLight', hardMix: 'hardMix', difference: 'Dfrn',
  exclusion: 'Xclu', subtract: 'blendSubtraction', divide: 'blendDivide', hue: 'H   ', saturation: 'Strt', color: 'Clr ', luminosity: 'Lmns' };
const MODE_IN = Object.fromEntries(Object.entries(MODE_OUT).map(([k, v]) => [v.toLowerCase(), k]));



export function readTpl(bytes) {
  const u8 = toU8(bytes);
  const r = new Reader(u8);
  const sig = r.key4();
  if (sig.toUpperCase() !== '8BTP') throw new Error('不是 Photoshop 工具预设文件（缺 8BTP 签名）');
  r.skip(8);
  const out = { presets: [], patterns: [], warnings: [] }, samples = new Map();
  const sampOut = { samples, warnings: out.warnings };
  readBlocks(r, u8.length, {
    samp: end => {
      
      const at = r.o;
      try { readSampForTpl(r, end, sampOut); } catch (e) { r.seek(at); out.warnings.push('取样笔尖：' + e.message); }
    },
    patt: end => { try { out.patterns.push(...readPatternBlock(u8.subarray(r.o, end))); } catch (e) { out.warnings.push('图案段：' + e.message); } },
    tptp: end => {
      r.u32();                                            
      while (r.o + 10 < end) {
        const name = r.unicode();
        const ver = r.u32();
        if (ver !== 16) throw new Error('工具预设描述符版本不是 16');
        const d = readDescriptor(r);
        try { out.presets.push(presetFromToolDesc(name, d, samples, out.patterns)); }
        catch (e) { out.warnings.push(`工具预设「${name}」：${e.message}`); }
      }
    },
  }, out.warnings);
  return out;
}

function presetFromToolDesc(rawName, d, samples, patterns) {
  const name = String(rawName || '').replace(/^\$\$\$\/[^=]*=/, '') || '工具预设';
  let tool = typeof d.psd_editorTool === 'string' && d.psd_editorTool ? d.psd_editorTool : CLASS_TOOL[d.__classID] || null;
  let opts = null;
  if (typeof d.psd_editorOptions === 'string') { try { opts = JSON.parse(d.psd_editorOptions); } catch { opts = null; } }
  const rec = { name, tool: tool || 'unknown', psClass: d.__classID, opts };
  if (d.Brsh && typeof d.Brsh === 'object') {
    rec.brush = presetFromDesc(d, samples, patterns);
    rec.brush.name = rec.brush.name || name;
  }
  
  const po = {};
  if (d.Opct != null) po.opacity = Math.max(0, Math.min(1, num(d.Opct) / 100));
  if (d.flow != null) po.flow = Math.max(0, Math.min(1, num(d.flow) / 100));
  if (d['Md  '] && d['Md  '].value) po.mode = MODE_IN[String(d['Md  '].value).toLowerCase()] || 'normal';
  if (d['Rpt '] != null) po.airbrush = !!d['Rpt '];
  if (d.Smoo != null) po.smoothing = Math.max(0, Math.min(1, num(d.Smoo) / 100));
  else if (d.smoothingValue != null) po.smoothing = Math.max(0, Math.min(1, num(d.smoothingValue) / 100));
  if (Object.keys(po).length) rec.psOpts = po;
  if (!tool) rec.unsupported = `PS 工具类 ${d.__classID} 在本编辑器里没有对应工具`;
  else if (!opts) rec.unsupported = '此 Photoshop 工具预设的专用选项尚未完整映射，暂不能应用';
  return rec;
}



export function writeTpl(presets, patterns = []) {
  const brushRecs = presets.filter(p => p.brush).map(p => p.brush);
  const { samples, sampleOf } = collectSamples(brushRecs);
  const bodies = [];
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; };
  const uni = s => { s = String(s || ''); const b = new Uint8Array(4 + (s.length + 1) * 2), dv = new DataView(b.buffer); dv.setUint32(0, s.length + 1); for (let i = 0; i < s.length; i++) dv.setUint16(4 + i * 2, s.charCodeAt(i)); return b; };
  bodies.push(u32(presets.length));
  for (const p of presets) {
    const cls = TOOL_CLASS[p.tool] || ('psd_editor' + String(p.tool || 'tool').replace(/[^A-Za-z0-9]/g, ''));
    const d = { __name: '', __classID: cls, __long: {}, __doub: {} };
    const o = p.psOpts || {};
    if (p.brush) d.Brsh = presetToDesc(p.brush, sampleOf);
    if (o.mode) d['Md  '] = { __enumType: 'BlnM', value: MODE_OUT[o.mode] || 'Nrml' };
    if (o.opacity != null) { d.Opct = Math.round(o.opacity * 100); d.__long.Opct = true; }
    if (o.flow != null) { d.flow = Math.round(o.flow * 100); d.__long.flow = true; }
    if (o.airbrush != null) d['Rpt '] = !!o.airbrush;
    if (o.smoothing != null) { d.Smoo = Math.round(o.smoothing * 100); d.__long.Smoo = true; }
    d.psd_editorTool = String(p.tool || '');
    if (p.opts) d.psd_editorOptions = JSON.stringify(p.opts);
    bodies.push(uni(p.name || '工具预设'), u32(16), serializeDescriptor(d));
  }
  const cat = parts => { const n = parts.reduce((a, b) => a + b.length, 0), out = new Uint8Array(n); let k = 0; for (const x of parts) { out.set(x, k); k += x.length; } return out; };
  const used = new Set(brushRecs.map(r => r.dyn && r.dyn.texture && r.dyn.texture.on && r.dyn.texture.pattern).filter(Boolean));
  const pats = patterns.filter(x => used.has(x.id));
  
  const head = new Uint8Array(12); head.set([0x38, 0x42, 0x54, 0x50]); new DataView(head.buffer).setUint16(4, 1); new DataView(head.buffer).setUint16(6, 2);
  const parts = [head];
  if (samples.length) parts.push(abrBlock('samp', sampBlockData(samples)));
  if (pats.length) parts.push(abrBlock('patt', writePatternBlock(pats)));
  parts.push(abrBlock('tptp', cat(bodies)));
  return cat(parts);
}

export default { readTpl, writeTpl, TOOL_CLASS, BRUSH_CLASS_TOOLS };
