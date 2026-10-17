


































import { Reader, readDescriptor } from './psd-parse.js';
import { serializeDescriptor } from './psd-descriptor.js';
import { decompressChannelBody, compressChannelBody } from './psd-image.js';
import { readPatternBlock, writePatternBlock, newPatternId } from './pat.js';
import { defaultDynamics, normalizeDynamics, tipThumb } from './brush-engine.js';

const toU8 = b => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b || 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => v == null ? d : (typeof v === 'object' && 'value' in v) ? +v.value : +v;
const pct = (v, d = 0) => v == null ? d : num(v) / 100;
export const newSampleId = newPatternId;


function decodeBitmap(body, w, h, depth, comp) {
  if (w <= 0 || h <= 0 || w * h > 64e6) throw new Error(`笔尖尺寸异常：${w}×${h}`);
  const d = depth === 16 ? 16 : 8;
  const raw = decompressChannelBody({ body, width: w, rows: h, depth: d, compression: comp, psb: false });
  if (d === 8) return Uint8Array.from(raw.subarray(0, w * h));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = raw[i * 2];          
  return out;
}
const rleBody = (data, w, h) => compressChannelBody({ raw: data, width: w, rows: h, depth: 8, compression: 1, psb: false });


function readOld(r, version, count, out) {
  for (let k = 0; k < count && r.remaining >= 6; k++) {
    const type = r.i16(), size = r.i32(), start = r.o, end = start + size;
    if (size < 0 || end > r.dv.byteLength) { out.warnings.push(`第 ${k + 1} 个画笔记录长度异常，停止读取`); break; }
    try {
      if (type === 1) {
        

        r.i32(); const spacing = r.u16(), diameter = r.u16(), roundness = r.u16(), angle = r.i16(), hardness = r.u16();
        out.brushes.push(recordFrom({ name: `计算型画笔 ${k + 1}`, tip: 'round', size: diameter || 10, hardness: clamp(hardness / 100, 0, 1),
          roundness: clamp((roundness || 100) / 100, .01, 1), angle, spacing: Math.max(1, spacing) / 100 }));
      } else if (type === 2) {
        r.i32(); const spacing = r.u16();
        let name = `取样画笔 ${k + 1}`;
        if (version === 2) { const n = r.u32(); let s = ''; for (let i = 0; i < n; i++) { const c = r.u16(); if (c) s += String.fromCharCode(c); } if (s) name = s; }
        r.u8(); r.skip(8);
        const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
        const depth = r.u16(), comp = r.u8();
        const w = right - left, h = bottom - top;
        const data = decodeBitmap(r.bytes(end - r.o), w, h, depth, comp);
        const id = newSampleId();
        out.brushes.push(recordFrom({ name, tip: 'abr:' + id, sample: { id, w, h, data }, size: Math.max(w, h),
          spacing: Math.max(1, spacing) / 100 }));
      } else out.warnings.push(`第 ${k + 1} 个画笔：未知类型 ${type}`);
    } catch (e) { out.warnings.push(`第 ${k + 1} 个画笔：${e.message}`); }
    r.seek(end);
  }
}



function walkVmal(r, end) {
  const ver = r.u32(); if (ver !== 3) throw new Error('VMAL 版本不是 3');
  r.u32();                                         
  r.skip(16);                                      
  const count = r.u32(); if (count > 256) throw new Error('VMAL 通道数异常');
  for (let i = 0; i < count + 2 && r.o + 4 <= end; i++) {
    const has = r.u32(); if (!has) continue;
    const len = r.u32(); if (len < 23 || r.o + len > end) throw new Error('VMAL 通道槽长度异常');
    const at = r.o;
    r.u32();
    const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
    const depth = r.u16(), comp = r.u8();
    const body = r.bytes(len - 23);
    r.seek(at + len);
    if (right > left && bottom > top) return { w: right - left, h: bottom - top, depth, comp, body };
  }
  throw new Error('VMAL 里没有写入的通道');
}
function readSamp(r, end, sub, out) {
  while (r.o + 4 <= end) {
    const len = r.u32(), start = r.o;
    const next = start + len + ((4 - len % 4) % 4);
    if (start + len > end) { out.warnings.push('samp 项长度越界'); break; }
    try {
      const id = r.pascal();
      let got = null;
      const bodyAt = r.o;
      const tail = () => {                           
        const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
        const depth = r.u16(), comp = r.u8();
        return { w: right - left, h: bottom - top, depth, comp, body: r.bytes(start + len - r.o) };
      };
      if (sub === 2) {
        try { r.skip(4); got = walkVmal(r, start + len); }
        catch { r.seek(bodyAt + 264); got = tail(); }          
      } else if (sub === 1) { r.seek(bodyAt + 10); got = tail(); }
      else {                                                   
        try { r.skip(4); got = walkVmal(r, start + len); }
        catch { r.seek(bodyAt + 10); got = tail(); }
      }
      const data = decodeBitmap(got.body, got.w, got.h, got.depth, got.comp);
      out.samples.set(id, { id, w: got.w, h: got.h, data });
    } catch (e) { out.warnings.push(`取样笔尖解码失败：${e.message}`); }
    r.seek(next);
  }
}


export function readSampForTpl(r, end, out) { readSamp(r, end, 0, out); }



const CTL_OF = ['off', 'fade', 'pressure', 'tilt', 'wheel', 'initial', 'direction', 'rotation', 'rotation'];
const CTL_IDX = { off: 0, fade: 1, pressure: 2, tilt: 3, wheel: 4, initial: 5, direction: 6, rotation: 8 };
const ctlOf = v => CTL_OF[num(v && v.bVTy)] || 'off';

const BLN_IN = { mltp: 'multiply', multiply: 'multiply', sbtr: 'subtract', blendsubtraction: 'subtract', subtract: 'subtract', drkn: 'darken', darken: 'darken',
  ovrl: 'overlay', overlay: 'overlay', cddg: 'colorDodge', colordodge: 'colorDodge', cbrn: 'colorBurn', colorburn: 'colorBurn', linearburn: 'linearBurn',
  hardmix: 'hardMix', linearheight: 'linearHeight', hght: 'height', height: 'height' };
const BLN_OUT = { multiply: 'Mltp', subtract: 'Sbtr', darken: 'Drkn', overlay: 'Ovrl', colorDodge: 'CDdg', colorBurn: 'CBrn', linearBurn: 'linearBurn',
  hardMix: 'hardMix', linearHeight: 'linearHeight', height: 'Hght' };
const blnIn = e => BLN_IN[String((e && e.value) || e || '').toLowerCase()] || 'multiply';

const PAINT_IN = { nrml: 'normal', dslv: 'dissolve', drkn: 'darken', mltp: 'multiply', cbrn: 'colorBurn', lghn: 'lighten', scrn: 'screen', cddg: 'colorDodge',
  ovrl: 'overlay', sftl: 'softLight', hrdl: 'hardLight', dfrn: 'difference', xclu: 'exclusion', 'h   ': 'hue', strt: 'saturation', 'clr ': 'color', lmns: 'luminosity',
  lineardodge: 'linearDodge', linearburn: 'linearBurn', behind: 'behind', clearenum: 'clear' };


function shapeFrom(b, samples) {
  const cls = b.__classID;
  const o = { size: Math.max(1, num(b.Dmtr, 30)), angle: num(b.Angl, 0), roundness: clamp(pct(b.Rndn, 1), .01, 1),
    spacing: b.Spcn ? Math.max(.01, pct(b.Spcn)) : .25, spacingOn: b.Intr !== false, flipX: !!b.flipX, flipY: !!b.flipY, hardness: 1, tip: 'round' };
  if (cls === 'computedBrush') { o.hardness = clamp(pct(b.Hrdn, 1), 0, 1); o.tip = 'round'; }
  else if (cls === 'sampledBrush') {
    const s = samples.get(b.sampledData);
    if (s) { o.tip = 'abr:' + s.id; o.sample = s; } else { o.tip = 'round'; o.missing = b.sampledData || '?'; }
    o.tipName = b['Nm  '] || '';
  } else { o.tip = 'bristle'; o.approx = cls; }       
  return o;
}

export function presetFromDesc(p, samples = new Map(), patterns = []) {
  const shape = shapeFrom(p.Brsh || {}, samples);
  const d = defaultDynamics();
  const sh = d.shape;
  if (p.useTipDynamics) {
    sh.on = true;
    const sz = p.szVr || {}, an = p.angleDynamics || {}, rn = p.roundnessDynamics || {};
    sh.sizeJitter = pct(sz.jitter); sh.sizeCtl = ctlOf(sz); sh.fadeSteps = Math.max(1, num(sz.fStp, 25));
    sh.minDiameter = pct(p.minimumDiameter);
    sh.angleJitter = pct(an.jitter); sh.angleCtl = ctlOf(an);
    sh.roundJitter = pct(rn.jitter); sh.roundCtl = ctlOf(rn); sh.minRound = clamp(pct(p.minimumRoundness, .25), .01, 1);
    sh.flipX = !!p.flipX; sh.flipY = !!p.flipY;
    sh.tiltScale = pct(p.tiltScale);
  }
  const sc = d.scatter;
  if (p.useScatter) {
    sc.on = true;
    const sd = p.scatterDynamics || {}, cd = p.countDynamics || {};
    sc.amount = clamp(pct(sd.jitter), 0, 10); sc.ctl = ctlOf(sd) === 'pressure' ? 'pressure' : 'off';
    sc.both = !!p.bothAxes; sc.count = clamp(Math.round(num(p['Cnt '], 1)), 1, 16); sc.countJitter = pct(cd.jitter);
  }
  const tx = d.texture;
  if (p.useTexture) {
    tx.on = true;
    const t = p.Txtr || {};
    tx.pattern = t.Idnt || ''; tx.patternName = t['Nm  '] || '';
    if (tx.pattern && patterns.length && !patterns.some(x => x.id === tx.pattern)) {
      const byName = patterns.find(x => x.name === tx.patternName); if (byName) tx.pattern = byName.id;
    }
    tx.invert = !!p.InvT; tx.scale = Math.max(.01, pct(p.textureScale, 1));
    tx.brightness = num(p.textureBrightness, 0); tx.contrast = num(p.textureContrast, 0);
    tx.eachTip = p.TxtC !== false; tx.mode = blnIn(p.textureBlendMode);
    tx.depth = pct(p.textureDepth, 1); tx.minDepth = pct(p.minimumDepth);
    const dd = p.textureDepthDynamics || {}; tx.depthJitter = pct(dd.jitter); tx.depthCtl = ctlOf(dd);
  }
  d.protectTexture = !!p.protectTexture;
  const db = p.dualBrush;
  if (db && db.useDualBrush) {
    const s2 = shapeFrom(db.Brsh || {}, samples), du = d.dual;
    Object.assign(du, { on: true, tip: s2.tip, hardness: s2.hardness, roundness: s2.roundness, angle: s2.angle, flip: !!db.Flip,
      mode: blnIn(db.BlnM), size: s2.size, spacing: db.Spcn ? Math.max(.01, pct(db.Spcn)) : s2.spacing,
      scatter: db.useScatter ? clamp(pct((db.scatterDynamics || {}).jitter), 0, 10) : 0, both: !!db.bothAxes,
      count: clamp(Math.round(num(db['Cnt '], 1)), 1, 16) });
    if (s2.sample) du.sample = s2.sample;
  }
  const co = d.color;
  if (p.useColorDynamics) {
    co.on = true;
    const cv = p.clVr || {};
    co.fgbg = pct(cv.jitter); co.fgbgCtl = ctlOf(cv);
    co.hue = pct(p['H   ']); co.sat = pct(p.Strt); co.bri = pct(p.Brgh); co.purity = pct(p.purity);
    co.perTip = p.colorDynamicsPerTip !== false;
  }
  const tr = d.transfer;
  if (p.usePaintDynamics) {
    tr.on = true;
    const op = p.opVr || {}, fl = p.prVr || {};
    tr.opJitter = pct(op.jitter); tr.opCtl = ctlOf(op); tr.flowJitter = pct(fl.jitter); tr.flowCtl = ctlOf(fl);
  }
  if (p.useBrushPose) {
    Object.assign(d.pose, { on: true, tiltX: num(p.brushPoseTiltX), tiltY: num(p.brushPoseTiltY), rotation: num(p.brushPoseAngle),
      pressure: pct(p.brushPosePressure, 1), overTiltX: !!p.overridePoseTiltX, overTiltY: !!p.overridePoseTiltY,
      overRotation: !!p.overridePoseAngle, overPressure: !!p.overridePosePressure });
  }
  d.noise = !!p.Nose; d.wetEdges = !!p.Wtdg;
  
  if (shape.flipX) sh.flipXFixed = true;
  if (shape.flipY) sh.flipYFixed = true;
  const rec = recordFrom({ name: p['Nm  '] || shape.tipName || '画笔', ...shape,
    spacing: shape.spacing, airbrush: !!p['Rpt '], dyn: d });
  const to = p.toolOptions;
  if (to && typeof to === 'object') {
    rec.toolOpts = { opacity: to.Opct != null ? clamp(num(to.Opct) / 100, 0, 1) : undefined, flow: to.flow != null ? clamp(num(to.flow) / 100, 0, 1) : undefined,
      mode: to['Md  '] ? PAINT_IN[String(to['Md  '].value || '').toLowerCase()] || 'normal' : undefined };
  }
  return rec;
}
function recordFrom(o) {
  return { name: o.name || '画笔', tip: o.tip || 'round', sample: o.sample || null, size: Math.round(clamp(o.size || 30, 1, 5000)),
    hardness: o.hardness == null ? 1 : o.hardness, angle: o.angle || 0, roundness: o.roundness || 1, spacing: o.spacing || .25,
    spacingOn: o.spacingOn !== false, flipX: !!o.flipX, flipY: !!o.flipY, airbrush: !!o.airbrush,
    dyn: normalizeDynamics(o.dyn || defaultDynamics()), ...(o.missing ? { missing: o.missing } : {}), ...(o.approx ? { approx: o.approx } : {}) };
}


const P = v => ({ __unit: '#Prc', value: +(v * 100).toFixed(4) });
const PX = v => ({ __unit: '#Pxl', value: +v });
const ANG = v => ({ __unit: '#Ang', value: +v });
const EN = (t, v) => ({ __enumType: t, value: v });
const obj = (cls, fields, longs = []) => ({ __name: '', __classID: cls, ...fields, __long: Object.fromEntries(longs.map(k => [k, true])), __doub: {} });
const dynDesc = (ctl, jitter, fade = 25, min = null) => obj('brVr', { bVTy: CTL_IDX[ctl] || 0, fStp: Math.round(fade || 25), jitter: P(jitter || 0), ...(min != null ? { 'Mnm ': P(min) } : {}) }, ['bVTy', 'fStp']);
function shapeDesc(rec, sampleId, forDual) {
  const base = { Dmtr: PX(rec.size), Angl: ANG(rec.angle || 0), Rndn: P(rec.roundness == null ? 1 : rec.roundness) };
  const tail = { Spcn: P(rec.spacing || .25), Intr: rec.spacingOn !== false, flipX: !!rec.flipX, flipY: !!rec.flipY };
  if (!sampleId) return obj('computedBrush', { Dmtr: base.Dmtr, Hrdn: P(rec.hardness == null ? 1 : rec.hardness), Angl: base.Angl, Rndn: base.Rndn, ...tail });
  return obj('sampledBrush', { ...base, 'Nm  ': rec.tipName || rec.name || (forDual ? '双重画笔' : '取样画笔'), ...tail, sampledData: sampleId });
}

export function presetToDesc(rec, sampleOf) {
  const d = normalizeDynamics(JSON.parse(JSON.stringify(rec.dyn || defaultDynamics(), (k, v) => (k === 'sample' ? undefined : v))));
  const sh = d.shape, sc = d.scatter, tx = d.texture, du = d.dual, co = d.color, tr = d.transfer, po = d.pose;
  const shapeRec = { ...rec, flipX: !!(rec.flipX || sh.flipXFixed), flipY: !!(rec.flipY || sh.flipYFixed) };
  const p = {
    'Nm  ': rec.name || '画笔',
    Brsh: shapeDesc(shapeRec, sampleOf(rec), false),
    useTipDynamics: !!sh.on, flipX: !!sh.flipX, flipY: !!sh.flipY, brushProjection: false,
    minimumDiameter: P(sh.minDiameter || 0), minimumRoundness: P(sh.minRound == null ? .25 : sh.minRound), tiltScale: P(sh.tiltScale || 0),
    szVr: dynDesc(sh.sizeCtl, sh.sizeJitter, sh.fadeSteps), angleDynamics: dynDesc(sh.angleCtl, sh.angleJitter, sh.fadeSteps),
    roundnessDynamics: dynDesc(sh.roundCtl || 'off', sh.roundJitter, sh.fadeSteps),
    useScatter: !!sc.on, Spcn: P(rec.spacing || .25), 'Cnt ': Math.max(1, Math.round(sc.count || 1)), bothAxes: !!sc.both,
    countDynamics: dynDesc('off', sc.countJitter || 0), scatterDynamics: dynDesc(sc.ctl === 'pressure' ? 'pressure' : 'off', sc.amount || 0),
    dualBrush: du.on ? obj('dualBrush', {
      useDualBrush: true, Flip: !!du.flip,
      Brsh: shapeDesc({ size: du.size, angle: du.angle, roundness: du.roundness, hardness: du.hardness, spacing: du.spacing, name: '双重画笔' }, sampleOf(du), true),
      BlnM: EN('BlnM', BLN_OUT[du.mode] || 'Mltp'), useScatter: du.scatter > 0, Spcn: P(du.spacing || .25), 'Cnt ': Math.max(1, Math.round(du.count || 1)),
      bothAxes: !!du.both, countDynamics: dynDesc('off', 0), scatterDynamics: dynDesc('off', du.scatter || 0) }) : obj('dualBrush', { useDualBrush: false }),
    brushGroup: obj('brushGroup', { useBrushGroup: false }),
    useTexture: !!tx.on,
  };
  if (tx.on) Object.assign(p, {
    TxtC: tx.eachTip !== false, interpretation: false, textureBlendMode: EN('BlnM', BLN_OUT[tx.mode] || 'Mltp'),
    textureDepth: P(tx.depth == null ? 1 : tx.depth), minimumDepth: P(tx.minDepth || 0),
    textureDepthDynamics: dynDesc(tx.depthCtl || 'off', tx.depthJitter || 0),
    Txtr: obj('Ptrn', { 'Nm  ': tx.patternName || tx.pattern || '', Idnt: tx.pattern || '' }),
    textureScale: P(tx.scale || 1), InvT: !!tx.invert, protectTexture: !!d.protectTexture,
    textureBrightness: Math.round(tx.brightness || 0), textureContrast: Math.round(tx.contrast || 0),
  });
  else p.protectTexture = !!d.protectTexture;
  p.usePaintDynamics = !!tr.on;
  if (tr.on) Object.assign(p, { prVr: dynDesc(tr.flowCtl, tr.flowJitter), opVr: dynDesc(tr.opCtl, tr.opJitter),
    wtVr: dynDesc('off', 0), mxVr: dynDesc('off', 0) });   
  p.useColorDynamics = !!co.on;
  if (co.on) Object.assign(p, { clVr: dynDesc(co.fgbgCtl || 'off', co.fgbg), 'H   ': P(co.hue || 0), Strt: P(co.sat || 0), Brgh: P(co.bri || 0),
    purity: P(co.purity || 0), colorDynamicsPerTip: co.perTip !== false });
  Object.assign(p, { Wtdg: !!d.wetEdges, Nose: !!d.noise, 'Rpt ': !!rec.airbrush, useBrushSize: true, useBrushPose: !!po.on });
  if (po.on) Object.assign(p, { overridePoseAngle: !!po.overRotation, overridePoseTiltX: !!po.overTiltX, overridePoseTiltY: !!po.overTiltY,
    overridePosePressure: !!po.overPressure, brushPosePressure: P(po.pressure == null ? 1 : po.pressure),
    brushPoseTiltX: Math.round(po.tiltX || 0), brushPoseTiltY: Math.round(po.tiltY || 0), brushPoseAngle: Math.round(po.rotation || 0) });
  return obj('brushPreset', p, ['textureBrightness', 'textureContrast', 'brushPoseTiltX', 'brushPoseTiltY', 'brushPoseAngle']);
}






export function readAbr(bytes) {
  const u8 = toU8(bytes);
  if (u8.length < 4) throw new Error('文件太短，不是 .abr');
  const r = new Reader(u8);
  const version = r.u16(), sub = r.u16();
  const out = { brushes: [], patterns: [], warnings: [], samples: new Map(), version: version + '.' + sub };
  if (version === 1 || version === 2) { readOld(r, version, sub, out); return finish(out); }
  if (![6, 7, 9, 10].includes(version)) throw new Error('不支持的 .abr 版本：' + version);
  if (sub !== 1 && sub !== 2) throw new Error('不支持的 .abr 子版本：' + sub);
  const descs = [];
  readBlocks(r, u8.length, {
    samp: end => readSamp(r, end, sub, out),
    patt: end => { try { out.patterns.push(...readPatternBlock(u8.subarray(r.o, end))); } catch (e) { out.warnings.push('图案段：' + e.message); } },
    desc: () => { try { r.u32(); descs.push(readDescriptor(r)); } catch (e) { out.warnings.push('画笔描述符解析失败：' + e.message); } },
  }, out.warnings);
  const list = descs.flatMap(d => Array.isArray(d.Brsh) ? d.Brsh : []);
  for (const p of list) {
    try { out.brushes.push(presetFromDesc(p, out.samples, out.patterns)); }
    catch (e) { out.warnings.push(`预设「${p && p['Nm  ']}」：${e.message}`); }
  }
  
  if (!list.length) for (const s of out.samples.values()) out.brushes.push(recordFrom({ name: '取样画笔 ' + (out.brushes.length + 1), tip: 'abr:' + s.id, sample: s, size: Math.max(s.w, s.h) }));
  return finish(out);
}

export function readBlocks(r, total, handlers, warnings) {
  while (r.o + 12 <= total) {
    const sig = r.key4();
    if (sig !== '8BIM' && sig !== '8bim') { warnings.push('块签名不对（@' + (r.o - 4) + '），停止读取'); break; }
    const key = r.key4(), len = r.u32(), start = r.o, end = Math.min(total, start + len);
    if (handlers[key]) { try { handlers[key](end); } catch (e) { warnings.push(`${key} 块：${e.message}`); } }
    r.seek(Math.min(total, start + len + ((4 - len % 4) % 4)));
  }
}
function finish(out) {
  const used = new Set();
  for (const b of out.brushes) { if (b.sample) used.add(b.sample.id); if (b.dyn.dual.sample) used.add(b.dyn.dual.sample.id); }
  const missing = out.brushes.filter(b => b.missing).length;
  if (missing) out.warnings.push(`${missing} 个预设引用的取样笔尖不在文件里，已换成圆笔尖`);
  const approx = out.brushes.filter(b => b.approx).length;
  if (approx) out.warnings.push(`${approx} 个硬毛刷 / 侵蚀笔尖（参数化笔尖）用程序笔尖近似`);
  delete out.samples;
  return out;
}



function sampItem(s) {
  const body = rleBody(s.data, s.w, s.h);
  const CH = 56, WRITTEN = 55;
  const parts = [];
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); parts.push(b); };
  const u16 = v => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); parts.push(b); };
  const id = String(s.id).slice(0, 255);
  parts.push(Uint8Array.of(id.length), Uint8Array.from(id, c => c.charCodeAt(0) & 255));
  u16(1); u16(0);
  const vm = [];
  const push = (arr) => vm.push(arr);
  const U32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); push(b); };
  U32(0); U32(0); U32(s.h); U32(s.w); U32(CH);
  for (let i = 0; i < CH + 2; i++) {
    if (i !== WRITTEN) { U32(0); continue; }
    U32(1); U32(23 + body.length); U32(8); U32(0); U32(0); U32(s.h); U32(s.w);
    push(Uint8Array.of(0, 8, 1)); push(body);
  }
  const vmLen = vm.reduce((n, b) => n + b.length, 0);
  u32(3); u32(vmLen); parts.push(...vm);
  return concat(parts);
}
function concat(parts) {
  const n = parts.reduce((a, b) => a + b.length, 0), out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function block(key, data) {
  const pad = (4 - data.length % 4) % 4, out = new Uint8Array(12 + data.length + pad), dv = new DataView(out.buffer);
  out.set([0x38, 0x42, 0x49, 0x4d], 0); for (let i = 0; i < 4; i++) out[4 + i] = key.charCodeAt(i);
  dv.setUint32(8, data.length); out.set(data, 12);
  return out;
}

function rasterTip(kind, hardness, id) {
  const N = 128, cov = tipThumb(kind, hardness == null ? 1 : hardness, N), data = new Uint8Array(N * N);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(cov[i] * 255);
  return { id, w: N, h: N, data };
}

export function collectSamples(records) {
  const samples = new Map(), byRec = new Map();
  const ensure = (holder, tip, sample, hardness) => {
    if (sample && sample.data) { const id = sample.id || newSampleId(); if (!samples.has(id)) samples.set(id, { ...sample, id }); byRec.set(holder, id); return; }
    if (!tip || tip === 'round') { byRec.set(holder, null); return; }
    const key = 'raster:' + tip + ':' + (hardness == null ? 1 : hardness);
    let id = [...samples.values()].find(s => s._key === key)?.id;
    if (!id) { id = newSampleId(); samples.set(id, { ...rasterTip(tip, hardness, id), _key: key }); }
    byRec.set(holder, id);
  };
  for (const rec of records) {
    ensure(rec, rec.tip, rec.sample, rec.hardness);
    const du = rec.dyn && rec.dyn.dual;
    if (du && du.on) ensure(du, du.tip, du.sample, du.hardness);
  }
  return { samples: [...samples.values()], sampleOf: h => byRec.has(h) ? byRec.get(h) : null };
}

export function sampBlockData(samples) {
  const parts = [];
  for (const s of samples) {
    const it = sampItem(s), len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, it.length);
    parts.push(len, it); const pad = (4 - it.length % 4) % 4; if (pad) parts.push(new Uint8Array(pad));
  }
  return concat(parts);
}
export { block as abrBlock };



export function writeAbr(records, patterns = []) {
  const { samples, sampleOf } = collectSamples(records);
  const desc = { __name: '', __classID: 'null', Brsh: records.map(r => presetToDesc(r, sampleOf)) };
  const dbody = serializeDescriptor(desc), dver = new Uint8Array(4); new DataView(dver.buffer).setUint32(0, 16);
  const head = new Uint8Array(4); new DataView(head.buffer).setUint16(0, 10); new DataView(head.buffer).setUint16(2, 2);
  const used = new Set(records.map(r => r.dyn && r.dyn.texture && r.dyn.texture.on && r.dyn.texture.pattern).filter(Boolean));
  const pats = patterns.filter(p => used.has(p.id));
  return concat([head, block('samp', sampBlockData(samples)), block('patt', pats.length ? writePatternBlock(pats) : new Uint8Array(0)), block('desc', concat([dver, dbody]))]);
}


export function writeAbrV2(records) {
  const parts = [Uint8Array.of(0, 2, records.length >> 8, records.length & 255)];
  for (const rec of records) {
    const s = rec.sample; const name = rec.name || '';
    const body = rleBody(s.data, s.w, s.h);
    const len = 4 + 2 + 4 + name.length * 2 + 1 + 8 + 16 + 2 + 1 + body.length;
    const b = new Uint8Array(6 + len), dv = new DataView(b.buffer); let o = 0;
    dv.setInt16(o, 2); o += 2; dv.setInt32(o, len); o += 4; dv.setInt32(o, 0); o += 4; dv.setUint16(o, Math.round((rec.spacing || .25) * 100)); o += 2;
    dv.setUint32(o, name.length); o += 4; for (const c of name) { dv.setUint16(o, c.charCodeAt(0)); o += 2; }
    b[o++] = 1; dv.setInt16(o + 4, s.h); dv.setInt16(o + 6, s.w); o += 8;
    dv.setInt32(o, 0); dv.setInt32(o + 4, 0); dv.setInt32(o + 8, s.h); dv.setInt32(o + 12, s.w); o += 16;
    dv.setUint16(o, 8); o += 2; b[o++] = 1; b.set(body, o);
    parts.push(b);
  }
  return concat(parts);
}

export default { readAbr, writeAbr, writeAbrV2, presetFromDesc, presetToDesc, collectSamples, sampBlockData, readBlocks };
