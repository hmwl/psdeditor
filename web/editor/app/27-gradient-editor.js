




import './26-layer-create.js';   
import { $ } from './01-boot.js';
import { bumpLayerStateVersion, doc, gradState, layerEdits, paramUI } from './02-doc-state.js';
import { beginLayerEdit, endLayerEdit } from './03-history.js';
import {
  commitLayerOps, dropLayerOp, effParam, findLayerOp, putLayerOp, renderProps, setParamField,
} from './24-layer-ops-queue.js';
import { ENUM_LABELS, PARAM_MAX_DEFAULT } from './26-layer-create.js';
import { beginDragAdjust } from './29-scrubby-live.js';
import { renderOpacityRegion, renderStaticLayers } from './30-render.js';

























export const GRAD_STYLE_SVG = {"linear": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 16 16\"><defs><linearGradient id=\"gdlinear-a\" x1=\"2\" y1=\"8\" x2=\"14\" y2=\"8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#292929\" /><stop offset=\"1\" stop-color=\"#fafafa\" /></linearGradient></defs><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"m14.5,1H1.5c-.27612,0-.5.22382-.5.5v13c0,.27612.22388.5.5.5h13c.27612,0,.5-.22388.5-.5V1.5c0-.27618-.22388-.5-.5-.5Zm-.5,13H2V2h12v12Z\" /><rect x=\"2\" y=\"2\" width=\"12\" height=\"12\" fill=\"url(#gdlinear-a)\" /></svg>", "radial": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 16 16\"><defs><radialGradient id=\"gdradial-a\" cx=\"8\" cy=\"8\" fx=\"8\" fy=\"8\" r=\"7.31335\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fafafa\" /><stop offset=\".09824\" stop-color=\"#f1f1f1\" /><stop offset=\".25861\" stop-color=\"#d8d8d8\" /><stop offset=\".46112\" stop-color=\"#b0b0b0\" /><stop offset=\".69779\" stop-color=\"#797979\" /><stop offset=\".9605\" stop-color=\"#343434\" /><stop offset=\"1\" stop-color=\"#292929\" /></radialGradient></defs><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"m14.5,1H1.5c-.27612,0-.5.22382-.5.5v13c0,.27612.22388.5.5.5h13c.27612,0,.5-.22388.5-.5V1.5c0-.27618-.22388-.5-.5-.5Zm-.5,13H2V2h12v12Z\" /><rect x=\"2\" y=\"2\" width=\"12\" height=\"12\" fill=\"url(#gdradial-a)\" /></svg>", "angle": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 16 16\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"m14.5,1H1.5c-.27612,0-.5.22382-.5.5v13c0,.27612.22388.5.5.5h13c.27612,0,.5-.22388.5-.5V1.5c0-.27618-.22388-.5-.5-.5Zm-.5,13H2V2h12v12Z\" /><rect x=\"2\" y=\"2\" width=\"12\" height=\"12\" fill=\"#fafafa\" /><polygon points=\"2 2 8 8 4.4 2 2 2\" fill=\"#fafafa\" /><polygon points=\"6.8 2 8 8 4.4 2 6.8 2\" fill=\"#efefef\" /><polygon points=\"9.2 2 8 8 6.8 2 9.2 2\" fill=\"#e4e4e4\" /><polygon points=\"11.6 2 8 8 9.2 2 11.6 2\" fill=\"#d9d9d9\" /><polygon points=\"14 2 8 8 11.6 2 14 2\" fill=\"#cecece\" /><polygon points=\"14 4.4 8 8 14 2 14 4.4\" fill=\"#c3c3c3\" /><polygon points=\"14 6.8 8 8 14 4.4 14 6.8\" fill=\"#b8b8b8\" /><polygon points=\"14 9.2 8 8 14 6.8 14 9.2\" fill=\"#adadad\" /><polygon points=\"14 11.6 8 8 14 9.2 14 11.6\" fill=\"#a2a2a2\" /><polygon points=\"14 14 8 8 14 11.6 14 14\" fill=\"#979797\" /><polygon points=\"11.6 14 8 8 14 14 11.6 14\" fill=\"#8c8c8c\" /><polygon points=\"9.2 14 8 8 11.6 14 9.2 14\" fill=\"#818181\" /><polygon points=\"6.8 14 8 8 9.2 14 6.8 14\" fill=\"#767676\" /><polygon points=\"4.4 14 8 8 6.8 14 4.4 14\" fill=\"#6b6b6b\" /><polygon points=\"2 14 8 8 4.4 14 2 14\" fill=\"#606060\" /><polygon points=\"2 11.6 8 8 2 14 2 11.6\" fill=\"#555\" /><polygon points=\"2 9.2 8 8 2 11.6 2 9.2\" fill=\"#4a4a4a\" /><polygon points=\"2 6.8 8 8 2 9.2 2 6.8\" fill=\"#3f3f3f\" /><polygon points=\"2 4.4 8 8 2 6.8 2 4.4\" fill=\"#343434\" /><polygon points=\"2 2 8 8 2 4.4 2 2\" fill=\"#292929\" /></svg>", "reflected": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 16 16\"><defs><linearGradient id=\"gdreflected-a\" x1=\"8\" y1=\"14\" x2=\"8\" y2=\"2\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#292929\" /><stop offset=\".5\" stop-color=\"#fafafa\" /><stop offset=\"1\" stop-color=\"#292929\" /></linearGradient></defs><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"m14.5,1H1.5c-.27612,0-.5.22382-.5.5v13c0,.27612.22388.5.5.5h13c.27612,0,.5-.22388.5-.5V1.5c0-.27618-.22388-.5-.5-.5Zm-.5,13H2V2h12v12Z\" /><rect x=\"2\" y=\"2\" width=\"12\" height=\"12\" fill=\"url(#gdreflected-a)\" /></svg>", "diamond": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 16 16\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"m14.5,1H1.5c-.27612,0-.5.22382-.5.5v13c0,.27612.22388.5.5.5h13c.27612,0,.5-.22388.5-.5V1.5c0-.27618-.22388-.5-.5-.5Zm-.5,13H2V2h12v12Z\" /><path d=\"m5,4h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m5,5h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m4,4h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m4,5h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m5,6h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m5,7h-1v-1h1v1Z\" fill=\"#888\" /><path d=\"m4,6h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m4,7h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m7,4h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m7,5h-1v-1h1v1Z\" fill=\"#888\" /><path d=\"m6,4h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m6,5h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m7,6h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m7,7h-1v-1h1v1Z\" fill=\"#c1c1c1\" /><path d=\"m8,4h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m8,5h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m8,6h-1v-1h1v1Z\" fill=\"#c1c1c1\" /><path d=\"m8,7h-1v-1h1v1Z\" fill=\"#d4d4d4\" /><path d=\"m6,6h-1v-1h1v1Z\" fill=\"#888\" /><path d=\"m6,7h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m5,8h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m4,8h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m7,8h-1v-1h1v1Z\" fill=\"#d4d4d4\" /><path d=\"m8,8h-1v-1h1v1Z\" fill=\"#e7e7e7\" /><path d=\"m6,8h-1v-1h1v1Z\" fill=\"#c1c1c1\" /><path d=\"m11,3h1v1h-1v-1Z\" fill=\"#3c3c3c\" /><path d=\"m11,4h1v1h-1v-1Z\" fill=\"#4f4f4f\" /><path d=\"m12,3h1v1h-1v-1Z\" fill=\"#292929\" /><path d=\"m12,4h1v1h-1v-1Z\" fill=\"#3c3c3c\" /><path d=\"m11,5h1v1h-1v-1Z\" fill=\"#626262\" /><path d=\"m11,6h1v1h-1v-1Z\" fill=\"#888\" /><path d=\"m12,5h1v1h-1v-1Z\" fill=\"#4f4f4f\" /><path d=\"m12,6h1v1h-1v-1Z\" fill=\"#626262\" /><path d=\"m9,3h1v1h-1v-1Z\" fill=\"#626262\" /><path d=\"m9,4h1v1h-1v-1Z\" fill=\"#888\" /><path d=\"m10,3h1v1h-1v-1Z\" fill=\"#4f4f4f\" /><path d=\"m10,4h1v1h-1v-1Z\" fill=\"#626262\" /><path d=\"m9,5h1v1h-1v-1Z\" fill=\"#9b9b9b\" /><path d=\"m9,6h1v1h-1v-1Z\" fill=\"#c1c1c1\" /><path d=\"m8,3h1v1h-1v-1Z\" fill=\"#757575\" /><path d=\"m5,3h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m4,3h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m7,3h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m6,3h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m8,3h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m11,2h1v1h-1v-1Z\" fill=\"#3c3c3c\" /><path d=\"m12,2h1v1h-1v-1Z\" fill=\"#292929\" /><path d=\"m9,2h1v1h-1v-1Z\" fill=\"#626262\" /><path d=\"m10,2h1v1h-1v-1Z\" fill=\"#4f4f4f\" /><path d=\"m8,2h1v1h-1v-1Z\" fill=\"#757575\" /><path d=\"m8,4h1v1h-1v-1Z\" fill=\"#9b9b9b\" /><path d=\"m8,5h1v1h-1v-1Z\" fill=\"#c1c1c1\" /><path d=\"m8,6h1v1h-1v-1Z\" fill=\"#d4d4d4\" /><path d=\"m10,5h1v1h-1v-1Z\" fill=\"#888\" /><path d=\"m10,6h1v1h-1v-1Z\" fill=\"#9b9b9b\" /><path d=\"m11,7h1v1h-1v-1Z\" fill=\"#9b9b9b\" /><path d=\"m12,7h1v1h-1v-1Z\" fill=\"#757575\" /><path d=\"m9,7h1v1h-1v-1Z\" fill=\"#d4d4d4\" /><path d=\"m8,7h1v1h-1v-1Z\" fill=\"#e7e7e7\" /><path d=\"m10,7h1v1h-1v-1Z\" fill=\"#c1c1c1\" /><path d=\"m5,13h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m5,12h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m4,13h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m4,12h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m5,11h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m5,10h-1v-1h1v1Z\" fill=\"#888\" /><path d=\"m4,11h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m4,10h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m7,13h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m7,12h-1v-1h1v1Z\" fill=\"#888\" /><path d=\"m6,13h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m6,12h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m7,11h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m7,10h-1v-1h1v1Z\" fill=\"#c1c1c1\" /><path d=\"m8,13h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m8,12h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m8,11h-1v-1h1v1Z\" fill=\"#c1c1c1\" /><path d=\"m8,10h-1v-1h1v1Z\" fill=\"#d4d4d4\" /><path d=\"m6,11h-1v-1h1v1Z\" fill=\"#888\" /><path d=\"m6,10h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m5,9h-1v-1h1v1Z\" fill=\"#9b9b9b\" /><path d=\"m4,9h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m7,9h-1v-1h1v1Z\" fill=\"#d4d4d4\" /><path d=\"m8,9h-1v-1h1v1Z\" fill=\"#e7e7e7\" /><path d=\"m6,9h-1v-1h1v1Z\" fill=\"#c1c1c1\" /><path d=\"m11,12h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#3c3c3c\" /><path d=\"m11,11h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#4f4f4f\" /><path d=\"m12,12h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#292929\" /><path d=\"m12,11h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#3c3c3c\" /><path d=\"m11,10h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#626262\" /><path d=\"m11,9h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#888\" /><path d=\"m12,10h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#4f4f4f\" /><path d=\"m12,9h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#626262\" /><path d=\"m9,12h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#626262\" /><path d=\"m9,11h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#888\" /><path d=\"m10,12h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#4f4f4f\" /><path d=\"m10,11h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#626262\" /><path d=\"m9,10h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#9b9b9b\" /><path d=\"m9,9h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#c1c1c1\" /><path d=\"m8,12h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#757575\" /><path d=\"m5,14h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m4,14h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m3,4h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m3,5h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m3,6h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m3,7h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m3,8h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m3,3h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m3,13h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m3,12h-1v-1h1v1Z\" fill=\"#3c3c3c\" /><path d=\"m3,11h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m3,10h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m3,9h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m3,14h-1v-1h1v1Z\" fill=\"#292929\" /><path d=\"m7,14h-1v-1h1v1Z\" fill=\"#626262\" /><path d=\"m6,14h-1v-1h1v1Z\" fill=\"#4f4f4f\" /><path d=\"m8,14h-1v-1h1v1Z\" fill=\"#757575\" /><path d=\"m11,13h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#3c3c3c\" /><path d=\"m12,13h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#292929\" /><path d=\"m9,13h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#626262\" /><path d=\"m10,13h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#4f4f4f\" /><path d=\"m8,13h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#757575\" /><path d=\"m8,11h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#9b9b9b\" /><path d=\"m8,10h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#c1c1c1\" /><path d=\"m8,9h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#d4d4d4\" /><path d=\"m10,10h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#888\" /><path d=\"m10,9h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#9b9b9b\" /><path d=\"m11,8h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#9b9b9b\" /><path d=\"m12,8h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#757575\" /><path d=\"m13,3h1v1h-1v-1Z\" fill=\"#292929\" /><path d=\"m13,4h1v1h-1v-1Z\" fill=\"#3c3c3c\" /><path d=\"m13,5h1v1h-1v-1Z\" fill=\"#4f4f4f\" /><path d=\"m13,6h1v1h-1v-1Z\" fill=\"#626262\" /><path d=\"m13,2h1v1h-1v-1Z\" fill=\"#292929\" /><path d=\"m13,7h1v1h-1v-1Z\" fill=\"#757575\" /><path d=\"m13,12h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#292929\" /><path d=\"m13,11h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#3c3c3c\" /><path d=\"m13,10h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#4f4f4f\" /><path d=\"m13,9h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#626262\" /><path d=\"m13,13h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#292929\" /><path d=\"m13,8h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#757575\" /><path d=\"m9,8h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#d4d4d4\" /><path d=\"m8,8h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#e7e7e7\" /><path d=\"m10,8h1s0,1,0,1h-1s0-1,0-1Z\" fill=\"#c1c1c1\" /><polygon points=\"7.5 2 7.5 7.5 2 7.5 2 8.5 7.5 8.5 7.5 14 8.5 14 8.5 8.5 14 8.5 14 7.5 8.5 7.5 8.5 2 7.5 2\" fill=\"#fafafa\" opacity=\".35\" /></svg>"};
const GRAD_TYPE_LABELS = { 'Lnr ': '线性', 'Rdl ': '径向', 'Angl': '角度', 'Rflc': '对称', 'Dmnd': '菱形' };
const GRAD_SIDE_FIELDS = ['Type', 'Angl', 'Scl ', 'Rvrs', 'Dthr'];      
const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const rgbHex = s => '#' + hex2(s.r) + hex2(s.g) + hex2(s.b);
const grayHex = pct => { const v = Math.round(Math.max(0, Math.min(100, pct)) / 100 * 255); return '#' + hex2(v).repeat(3); };
export function parseHex6(v){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}


export function gradientOf(tgt){
  const M = new Map(tgt.fields.map(f => [f.path, f]));
  const cf = M.get('Grad.Clrs');
  if (!cf || cf.type !== 'list') return { none: true, noise: (M.get('Grad.GrdF') || {}).value === 'ClNs', has: !!M.get('Grad') };
  const num = f => (f.length != null ? f.length : f.count) | 0;
  const clrs = [];
  for (let k = 0; k < num(cf); k++) {
    const col = M.get(`Grad.Clrs.${k}.Clr `);
    if (!col || col.colorSpace !== 'RGBC' || !col.components) return { none: true, nonRgb: true, has: true };
    const c = col.components.map(p => M.get(p));
    const loc = M.get(`Grad.Clrs.${k}.Lctn`), mid = M.get(`Grad.Clrs.${k}.Mdpn`);
    if (c.some(x => !x || typeof x.value !== 'number') || !loc || !mid) return { none: true, has: true };
    clrs.push({ src: k, r: Math.round(c[0].value), g: Math.round(c[1].value), b: Math.round(c[2].value),
                loc: Math.round(loc.value), mid: Math.round(mid.value) });
  }
  if (clrs.length < 2) return { none: true, has: true };
  const tf = M.get('Grad.Trns');
  const trns = [];
  if (tf && tf.type === 'list') {
    for (let k = 0; k < num(tf); k++) {
      const o = M.get(`Grad.Trns.${k}.Opct`), loc = M.get(`Grad.Trns.${k}.Lctn`), mid = M.get(`Grad.Trns.${k}.Mdpn`);
      if (!o || !loc || !mid) return { none: true, has: true };
      trns.push({ src: k, opct: o.value, loc: Math.round(loc.value), mid: Math.round(mid.value) });
    }
  }
  return {
    clrs, trns, hasTrns: !!(tf && tf.type === 'list'),
    clrsEditable: cf.arrayEditable !== false,
    trnsEditable: !!(tf && tf.arrayEditable !== false),
    min: cf.minLength || 2, max: Math.min(cf.maxLength || 255, 255),
    fields: M,
  };
}


export function gradSig(idx, tgt){
  const op = findLayerOp(idx, `setLayerParams:${tgt.target}:${tgt.at || 0}`);
  if (!op) return 'none';
  const vals = Object.keys(op.values || {}).filter(p => /^Grad\.(Clrs|Trns)\./.test(p)).sort().map(p => p + '=' + op.values[p]);
  return JSON.stringify([op.arrayOps || null, vals]);
}

export function gradModelFrom(gr, op){
  const m = { clrs: gr.clrs.map(s => ({ ...s })), trns: gr.trns.map(s => ({ ...s })), sel: null };
  const v = (op && op.values) || {};
  for (const p of Object.keys(v)) {
    const mm = /^Grad\.(Clrs|Trns)\.(\d+)\.(.+)$/.exec(p);
    if (!mm) continue;
    const s = (mm[1] === 'Clrs' ? m.clrs : m.trns)[+mm[2]];
    if (!s) continue;
    if (mm[3] === 'Lctn') s.loc = Math.round(v[p]);
    else if (mm[3] === 'Mdpn') s.mid = Math.round(v[p]);
    else if (mm[3] === 'Opct') s.opct = +v[p];
    else if (mm[3] === 'Clr ') { const c = parseHex6(v[p]); if (c) { s.r = c[0]; s.g = c[1]; s.b = c[2]; } }
  }
  

  for (const a of (op && op.arrayOps) || []) {
    const mm = /^Grad\.(Clrs|Trns)$/.exec(a.path || ''); if (!mm) continue;
    const arr = mm[1] === 'Clrs' ? m.clrs : m.trns;
    if (a.removeAt != null) { arr.splice(a.removeAt, 1); continue; }
    if (a.insertAt == null) continue;
    const v2 = a.value || {}, loc = Math.round(+v2.Lctn || 0), mid = Math.round(v2.Mdpn == null ? 50 : +v2.Mdpn);
    if (mm[1] === 'Clrs') { const c = parseHex6(v2['Clr ']) || [0, 0, 0]; arr.splice(a.insertAt, 0, { src: null, r: c[0], g: c[1], b: c[2], loc, mid }); }
    else arr.splice(a.insertAt, 0, { src: null, opct: +v2.Opct, loc, mid });
  }
  return m;
}

function gradDiff(gr, m){
  const values = {}, arrayOps = [];
  const seg = (path, mArr, oArr, kind) => {
    if (!oArr.length && !mArr.length) return;
    
    
    const eqStop = (a, b) => a.loc === b.loc && a.mid === b.mid
      && (kind === 'color' ? (a.r === b.r && a.g === b.g && a.b === b.b) : Math.abs(a.opct - b.opct) < 1e-9);
    if (mArr.length === oArr.length && mArr.every((s, k) => eqStop(s, oArr[k]))) return;
    const sameShape = mArr.length === oArr.length && mArr.every((s, k) => s.src === k);
    if (sameShape) {
      for (let k = 0; k < mArr.length; k++) {
        const s = mArr[k], o = oArr[k];
        if (kind === 'color') { if (s.r !== o.r || s.g !== o.g || s.b !== o.b) values[`${path}.${k}.Clr `] = rgbHex(s); }
        else if (Math.abs(s.opct - o.opct) > 1e-9) values[`${path}.${k}.Opct`] = s.opct;
        if (s.loc !== o.loc) values[`${path}.${k}.Lctn`] = s.loc;
        if (s.mid !== o.mid) values[`${path}.${k}.Mdpn`] = s.mid;
      }
      return;
    }
    const N = mArr.length, O = oArr.length;
    for (let k = 0; k < N; k++) {
      const s = mArr[k];
      
      let tpl = s.src;
      if (tpl == null) {
        for (let d = 1; d < N && tpl == null; d++) {
          if (mArr[k - d] && mArr[k - d].src != null) tpl = mArr[k - d].src;
          else if (mArr[k + d] && mArr[k + d].src != null) tpl = mArr[k + d].src;
        }
      }
      tpl = Math.max(0, Math.min(O - 1, tpl == null ? 0 : tpl));
      arrayOps.push({ path, insertAt: k, copyFrom: k + tpl,
        value: kind === 'color' ? { 'Clr ': rgbHex(s), Lctn: s.loc, Mdpn: s.mid }
                                : { Opct: s.opct, Lctn: s.loc, Mdpn: s.mid } });
    }
    for (let p = N + O - 1; p >= N; p--) arrayOps.push({ path, removeAt: p });
  };
  seg('Grad.Clrs', m.clrs, gr.clrs, 'color');
  if (gr.hasTrns) seg('Grad.Trns', m.trns, gr.trns, 'op');
  return { values, arrayOps };
}

export function commitGradient(idx, tgt, gr, m){
  const key = `setLayerParams:${tgt.target}:${tgt.at || 0}`;
  const gkey = `${idx}|${tgt.target}|${tgt.at || 0}`;
  


  const resort = (arr, kind) => {
    if (arr.every((s, k) => k === 0 || arr[k - 1].loc <= s.loc)) return;
    const cur = m.sel && m.sel.kind === kind ? arr[m.sel.i] : null;
    arr.sort((a, b) => a.loc - b.loc);          
    if (cur) { const k = arr.indexOf(cur); if (k >= 0) m.sel = { kind, i: k }; }
  };
  resort(m.clrs, 'color');
  if (gr.hasTrns) resort(m.trns, 'op');
  const d = gradDiff(gr, m);
  if (d.arrayOps.length > 64) {
    $('#err').textContent = '色标改得太多了：一次最多 64 步增删。先导出这份文件、再打开继续改。';
    return false;
  }
  
  const peak = Math.max(m.clrs.length + gr.clrs.length, gr.hasTrns ? m.trns.length + gr.trns.length : 0);
  if (d.arrayOps.length && peak > gr.max) { $('#err').textContent = `色标太多了（上限 ${gr.max} 个）。`; return false; }
  return commitLayerOps(idx, () => {
    const op = findLayerOp(idx, key) || { op: 'setLayerParams', index: idx, target: tgt.target, at: tgt.at || 0, values: {} };
    for (const p of Object.keys(op.values)) if (/^Grad\.(Clrs|Trns)\./.test(p)) delete op.values[p];
    delete op.arrayOps;
    Object.assign(op.values, d.values);
    if (d.arrayOps.length) op.arrayOps = d.arrayOps;
    if (!Object.keys(op.values).length && !op.arrayOps) dropLayerOp(idx, key);
    else putLayerOp(idx, op);
    m.sig = gradSig(idx, tgt);
    gradState[gkey] = m;
  });
}

function gradMix(a, b, mid, u){
  const f = Math.max(0.01, Math.min(0.99, (mid == null ? 50 : mid) / 100));
  
  return Math.abs(f - 0.5) < 1e-3 ? u : Math.pow(u, Math.log(0.5) / Math.log(f));
}
function gradSampleAt(arr, t, pick){
  if (!arr.length) return null;
  const s = arr.slice().sort((x, y) => x.loc - y.loc);
  if (t <= s[0].loc) return pick(s[0], s[0], 0);
  for (let i = 0; i < s.length - 1; i++) {
    if (t <= s[i + 1].loc) {
      const span = s[i + 1].loc - s[i].loc;
      const u = span <= 0 ? 1 : (t - s[i].loc) / span;
      return pick(s[i], s[i + 1], gradMix(s[i], s[i + 1], s[i].mid, u));
    }
  }
  return pick(s[s.length - 1], s[s.length - 1], 0);
}
export const gradColorAt = (m, t) => gradSampleAt(m.clrs, t, (a, b, k) =>
  ({ r: Math.round(a.r + (b.r - a.r) * k), g: Math.round(a.g + (b.g - a.g) * k), b: Math.round(a.b + (b.b - a.b) * k) })) || { r: 0, g: 0, b: 0 };
const gradOpacityAt = (m, t) => (m.trns.length ? gradSampleAt(m.trns, t, (a, b, k) => a.opct + (b.opct - a.opct) * k) : 100);












export const GRAD_MAX_STOPS = 32;

export function gradNewModel(from = [0, 0, 0], to = [255, 255, 255]){
  return {
    clrs: [{ loc: 0, r: from[0], g: from[1], b: from[2], mid: 50 },
           { loc: 4096, r: to[0], g: to[1], b: to[2], mid: 50 }],
    trns: [{ loc: 0, opct: 100, mid: 50 }, { loc: 4096, opct: 100, mid: 50 }],
    sel: { kind: 'color', i: 0 },
  };
}
export const gradClone = m => ({ clrs: m.clrs.map(s => ({ ...s })), trns: m.trns.map(s => ({ ...s })), sel: m.sel && { ...m.sel },
  ...(m.smooth != null ? { smooth: m.smooth } : {}),
  ...(m.noise ? { noise: { ...m.noise, min: m.noise.min.slice(), max: m.noise.max.slice() } } : {}) });

export function gradModelStops(m){
  return {
    stops: m.clrs.map(s => ({ color: [s.r, s.g, s.b], location: s.loc / 4096, midpoint: s.mid == null ? 50 : s.mid })),
    opacityStops: m.trns.map(s => ({ opacity: s.opct, location: s.loc / 4096, midpoint: s.mid == null ? 50 : s.mid })),
  };
}

export function gradModelCss(m){
  const n = 12, parts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n * 4096, c = gradColorAt(m, t), a = gradOpacityAt(m, t) / 100;
    parts.push(`rgba(${c.r},${c.g},${c.b},${a.toFixed(3)}) ${(i / n * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}





export function buildGradientEditor(host, model, onChange){
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const emit = () => { try { onChange && onChange(model); } catch {} };
  host.innerHTML = '';
  const wrap = mk('div', { className: 'gradedit' });
  const opRow = mk('div', { className: 'gradstops op', title: '不透明度色标：拖动改位置，在空白处点一下新增' });
  const bar = mk('div', { className: 'gradbar', title: '渐变预览（棋盘格 = 透明）；在条上点一下即可在该位置插入一个颜色色标' });
  bar.dataset.attr = 'grad-edit-bar';
  const cv = mk('canvas'); cv.width = 256; cv.height = 1; bar.append(cv);
  const clrRow = mk('div', { className: 'gradstops color', title: '颜色色标：拖动改位置，双击改颜色，在空白处点一下新增' });
  wrap.append(opRow, bar, clrRow);
  
  const info = mk('div', { className: 'arow' });
  const infoLabel = mk('label', { className: 'k', textContent: '色标' });
  const colorInp = mk('input', { type: 'color', title: '色标颜色' }); colorInp.dataset.attr = 'grad-edit-color';
  const opctInp = mk('input', { type: 'number', min: 0, max: 100, step: 1 }); opctInp.dataset.attr = 'grad-edit-opacity';
  const locInp = mk('input', { type: 'number', min: 0, max: 100, step: 1 }); locInp.dataset.attr = 'grad-edit-loc';
  const delBtn = mk('button', { type: 'button', textContent: '删除' }); delBtn.dataset.attr = 'grad-edit-del';
  info.append(infoLabel, colorInp, opctInp, mk('span', { className: 'k', textContent: '位置', style: 'width:auto;flex:none' }),
              locInp, mk('span', { className: 'k', textContent: '%', style: 'width:auto;flex:none' }), delBtn);
  host.append(wrap, info);

  const stopEls = { color: [], op: [] }, midEls = [];
  const arrOf = kind => (kind === 'color' ? model.clrs : model.trns);
  const sel = () => model.sel || (model.sel = { kind: 'color', i: 0 });

  function paintBar(){
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx || !ctx.createImageData) return;
    const im = ctx.createImageData(256, 1);
    for (let x = 0; x < 256; x++) {
      const t = x / 255 * 4096, c = gradColorAt(model, t), a = gradOpacityAt(model, t);
      im.data[x * 4] = c.r; im.data[x * 4 + 1] = c.g; im.data[x * 4 + 2] = c.b;
      im.data[x * 4 + 3] = Math.round(Math.max(0, Math.min(100, a)) / 100 * 255);
    }
    ctx.putImageData(im, 0, 0);
  }
  function syncInfo(){
    const S = sel(), arr = arrOf(S.kind), st = arr[Math.min(S.i, arr.length - 1)];
    if (!st) return;
    infoLabel.textContent = S.kind === 'color' ? `颜色色标 ${S.i + 1}/${arr.length}` : `不透明度 ${S.i + 1}/${arr.length}`;
    colorInp.hidden = S.kind !== 'color';
    opctInp.hidden = S.kind === 'color';
    if (S.kind === 'color' && document.activeElement !== colorInp) colorInp.value = rgbHex(st);
    if (S.kind !== 'color' && document.activeElement !== opctInp) opctInp.value = String(Math.round(st.opct));
    if (document.activeElement !== locInp) locInp.value = String(Math.round(st.loc / 40.96));
    delBtn.disabled = arr.length <= 2;
    delBtn.title = arr.length <= 2 ? '至少要留两个色标' : '删除这个色标';
  }
  function rebuild(){
    stopEls.color.length = 0; stopEls.op.length = 0; midEls.length = 0;
    clrRow.innerHTML = ''; opRow.innerHTML = '';
    for (const kind of ['color', 'op']) {
      const arr = arrOf(kind), rowEl = kind === 'color' ? clrRow : opRow;
      arr.forEach((st, k) => {
        const el = mk('i', { className: 'gstop ' + kind + (sel().kind === kind && sel().i === k ? ' on' : '') });
        el.dataset.attr = kind === 'color' ? 'grad-edit-color-stop' : 'grad-edit-op-stop';
        el.dataset.stop = String(k);
        el.title = kind === 'color' ? `颜色色标 ${k + 1}：${rgbHex(st)} · 位置 ${(st.loc / 40.96).toFixed(0)}%`
                                    : `不透明度色标 ${k + 1}：${Math.round(st.opct)}% · 位置 ${(st.loc / 40.96).toFixed(0)}%`;
        
        
        el.addEventListener('pointerdown', ev => {
          ev.stopPropagation();
          
          if (ev.altKey && arrOf(kind).length < GRAD_MAX_STOPS) {
            arrOf(kind).splice(k + 1, 0, { ...st });
            model.sel = { kind, i: k + 1 }; rebuild(); dragStop(ev, kind, k + 1); return;
          }
          model.sel = { kind, i: k }; rebuild(); dragStop(ev, kind, k);
        });
        el.addEventListener('dblclick', ev => { ev.stopPropagation(); model.sel = { kind, i: k }; rebuild();
                                const t = kind === 'color' ? colorInp : opctInp; if (t.click) t.click(); if (t.focus) t.focus(); });
        stopEls[kind].push(el);
        rowEl.append(el);
      });
      
      for (let k = 0; k < arr.length - 1; k++) {
        const a = arr[k];
        const el = mk('i', { className: 'gmid ' + kind, title: `中点 ${a.mid == null ? 50 : a.mid}%` });
        el.dataset.attr = 'grad-edit-mid'; el.dataset.kind = kind; el.dataset.stop = String(k);
        el.addEventListener('pointerdown', ev => { ev.stopPropagation(); dragMid(ev, kind, k); });
        midEls.push({ el, kind, k });
        rowEl.append(el);
      }
    }
    place(); paintBar(); syncInfo();
  }
  function place(){
    for (const kind of ['color', 'op']) {
      const arr = arrOf(kind);
      stopEls[kind].forEach((el, k) => {
        const st = arr[k]; if (!st) return;
        el.style.left = (st.loc / 4096 * 100) + '%';
        el.style.background = kind === 'color' ? rgbHex(st) : grayHex(st.opct);
      });
    }
    for (const x of midEls) {
      const arr = arrOf(x.kind), a = arr[x.k], b = arr[x.k + 1];
      if (!a || !b) continue;
      x.el.style.left = ((a.loc + (b.loc - a.loc) * (a.mid == null ? 50 : a.mid) / 100) / 4096 * 100) + '%';
    }
  }
  
  const locFromEvent = ev => {
    const r = bar.getBoundingClientRect ? bar.getBoundingClientRect() : null;
    const w = (r && r.width) || bar.clientWidth || 0;
    if (!w || ev.clientX == null) return 2048;
    return Math.max(0, Math.min(4096, Math.round((ev.clientX - r.left) / w * 4096)));
  };
  const drag = (ev, onMove) => {
    




    const r = bar.getBoundingClientRect ? bar.getBoundingClientRect() : null;
    const w = (r && r.width) || bar.clientWidth || 0;
    if (!w || ev.clientX == null) return;
    const sens = 4096 / w;
    const start = Math.max(0, Math.min(4096, Math.round((ev.clientX - r.left) / w * 4096)));
    let moved = false;
    beginDragAdjust(ev, acc => {
      moved = true;
      onMove(Math.max(0, Math.min(4096, Math.round(start + acc * sens))));
      place(); paintBar(); syncInfo();
    }, () => { if (moved) emit(); });
  };
  const dragStop = (ev, kind, k) => drag(ev, loc => { const st = arrOf(kind)[k]; if (st) st.loc = loc; });
  const dragMid = (ev, kind, k) => drag(ev, loc => {
    const arr = arrOf(kind), a = arr[k], b = arr[k + 1];
    if (!a || !b) return;
    const span = b.loc - a.loc;
    a.mid = span <= 0 ? 50 : Math.max(5, Math.min(95, Math.round((loc - a.loc) / span * 100)));
  });
  
  function insertAt(kind, loc){
    const arr = arrOf(kind);
    if (arr.length >= GRAD_MAX_STOPS) return false;
    let k = arr.findIndex(st => st.loc > loc);
    if (k < 0) k = arr.length;
    const st = kind === 'color'
      ? { loc, ...(c => ({ r: c.r, g: c.g, b: c.b }))(gradColorAt(model, loc)), mid: 50 }
      : { loc, opct: Math.round(gradOpacityAt(model, loc)), mid: 50 };
    arr.splice(k, 0, st);
    model.sel = { kind, i: k };
    rebuild(); emit();
    return true;
  }
  function removeSel(){
    const S = sel(), arr = arrOf(S.kind);
    if (arr.length <= 2) return false;
    arr.splice(S.i, 1);
    model.sel = { kind: S.kind, i: Math.max(0, S.i - 1) };
    rebuild(); emit();
    return true;
  }
  bar.onclick = ev => { if (ev.target === bar || ev.target === cv) insertAt('color', locFromEvent(ev)); };
  clrRow.onclick = ev => { if (ev.target === clrRow) insertAt('color', locFromEvent(ev)); };
  opRow.onclick = ev => { if (ev.target === opRow) insertAt('op', locFromEvent(ev)); };
  colorInp.oninput = () => {
    const S = sel(); if (S.kind !== 'color') return;
    const c = parseInt(colorInp.value.slice(1), 16);
    const st = model.clrs[S.i]; if (!st) return;
    st.r = (c >> 16) & 255; st.g = (c >> 8) & 255; st.b = c & 255;
    place(); paintBar(); emit();
  };
  opctInp.onchange = () => {
    const S = sel(); if (S.kind === 'color') return;
    const st = model.trns[S.i]; if (!st) return;
    st.opct = Math.max(0, Math.min(100, Math.round(+opctInp.value || 0)));
    place(); paintBar(); emit();
  };
  locInp.onchange = () => {
    const S = sel(), st = arrOf(S.kind)[S.i]; if (!st) return;
    st.loc = Math.max(0, Math.min(4096, Math.round((+locInp.value || 0) * 40.96)));
    place(); paintBar(); emit();
  };
  delBtn.onclick = () => removeSel();

  rebuild();
  return { repaint: rebuild, insertAt, removeSel, get model(){ return model; } };
}

export function renderGradientEditor(box, idx, tgt, ui){
  const taken = new Set();
  const { row, hint, mk } = ui;
  


  const rebuild = ui.rerender || renderProps;
  const scope = () => ui.scope || $('#props');
  const gr = gradientOf(tgt);
  if (gr.none) {
    if (gr.noise) hint('这是「杂色渐变」（GrdF = ClNs）：它没有色标数组，只有随机种子与通道范围，下面按普通字段编辑。', 'warn');
    else if (gr.nonRgb) hint('这条渐变的色标不是 RGB 颜色，色标条暂不支持，下面按普通字段编辑。', 'warn');
    return taken;
  }
  for (const f of tgt.fields) if (/^Grad(\.|$)/.test(f.path)) taken.add(f.path);
  taken.delete('Grad.Nm  ');                       
  for (const p of GRAD_SIDE_FIELDS) taken.add(p);

  const gkey = `${idx}|${tgt.target}|${tgt.at || 0}`;
  const sig = gradSig(idx, tgt);
  let m = gradState[gkey];
  if (!m || m.sig !== sig) {
    m = gradModelFrom(gr, findLayerOp(idx, `setLayerParams:${tgt.target}:${tgt.at || 0}`));
    m.sig = sig;
    gradState[gkey] = m;
  }
  


  const commit = () => { const r = commitGradient(idx, tgt, gr, m); if (ui.rerender) ui.rerender(); return r; };

  
  const wrap = mk('div', { className: 'gradedit' });
  const opRow = mk('div', { className: 'gradstops op', title: gr.trnsEditable ? '不透明度色标：拖动改位置，在空白处点一下新增' : '不透明度色标' });
  const bar = mk('div', { className: 'gradbar', title: '渐变预览（棋盘格 = 透明）；在条上点一下即可在该位置插入一个颜色色标' });
  bar.dataset.attr = 'gradient-bar';
  const cv = mk('canvas'); cv.width = 256; cv.height = 1;
  bar.append(cv);
  const clrRow = mk('div', { className: 'gradstops color', title: '颜色色标：拖动改位置，双击改颜色，在空白处点一下新增' });
  wrap.append(opRow, bar, clrRow);
  row('渐变', wrap);

  
  const stopEls = { color: [], op: [] }, midEls = [];
  function paint(){
    const ctx = cv.getContext && cv.getContext('2d');
    if (ctx && ctx.createImageData) {
      const im = ctx.createImageData(256, 1);
      for (let x = 0; x < 256; x++) {
        const t = x / 255 * 4096, c = gradColorAt(m, t), a = gradOpacityAt(m, t);
        im.data[x * 4] = c.r; im.data[x * 4 + 1] = c.g; im.data[x * 4 + 2] = c.b;
        im.data[x * 4 + 3] = Math.round(Math.max(0, Math.min(100, a)) / 100 * 255);
      }
      ctx.putImageData(im, 0, 0);
    }
    for (const kind of ['color', 'op']) {
      const arr = kind === 'color' ? m.clrs : m.trns;
      stopEls[kind].forEach((el, k) => {
        const s = arr[k]; if (!s) return;
        el.style.left = (s.loc / 4096 * 100) + '%';
        el.style.background = kind === 'color' ? rgbHex(s) : grayHex(s.opct);
      });
    }
    midEls.forEach(x => {
      const arr = x.kind === 'color' ? m.clrs : m.trns, a = arr[x.k], b = arr[x.k + 1];
      if (!a || !b) return;
      x.el.style.left = ((a.loc + (b.loc - a.loc) * (a.mid == null ? 50 : a.mid) / 100) / 4096 * 100) + '%';
    });
  }
  
  const locFromEvent = ev => {
    const r = bar.getBoundingClientRect ? bar.getBoundingClientRect() : null;
    const w = (r && r.width) || bar.clientWidth || 0;
    if (!w || ev.clientX == null) return 2048;
    return Math.max(0, Math.min(4096, Math.round((ev.clientX - r.left) / w * 4096)));
  };
  
  const drag = (ev, onMove) => {
    if (ev.preventDefault) ev.preventDefault();
    let moved = false;
    const move = e => { moved = true; onMove(locFromEvent(e)); paint(); };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      if (moved) commit();
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };

  const selEq = (kind, k) => m.sel && m.sel.kind === kind && m.sel.i === k;
  const mkStop = (kind, k) => {
    const arr = kind === 'color' ? m.clrs : m.trns, s = arr[k];
    const el = mk('i', { className: 'gstop ' + kind + (selEq(kind, k) ? ' on' : '') });
    el.dataset.attr = kind === 'color' ? 'grad-color-stop' : 'grad-op-stop';
    el.dataset.stop = String(k);
    el.title = kind === 'color' ? `颜色色标 ${k + 1}：${rgbHex(s)} · 位置 ${(s.loc / 40.96).toFixed(0)}%`
                                : `不透明度色标 ${k + 1}：${Math.round(s.opct)}% · 位置 ${(s.loc / 40.96).toFixed(0)}%`;
    
    el.onpointerdown = ev => { ev.stopPropagation(); m.sel = { kind, i: k }; el.classList.add('on'); drag(ev, loc => { s.loc = loc; }); };
    el.onclick = ev => { ev.stopPropagation(); m.sel = { kind, i: k }; if (el.isConnected !== false) rebuild(); };
    el.ondblclick = ev => {
      ev.stopPropagation(); m.sel = { kind, i: k }; rebuild();
      const inp = scope().querySelector('[data-attr="grad-color"], [data-attr="grad-opacity"]');
      if (inp && inp.click) inp.click();
      if (inp && inp.focus) inp.focus();
    };
    stopEls[kind].push(el);
    return el;
  };
  m.clrs.forEach((_, k) => clrRow.append(mkStop('color', k)));
  if (gr.hasTrns) m.trns.forEach((_, k) => opRow.append(mkStop('op', k)));
  
  const addMids = kind => {
    const arr = kind === 'color' ? m.clrs : m.trns;
    for (let k = 0; k < arr.length - 1; k++) {
      const a = arr[k];
      const el = mk('i', { className: 'gmid ' + kind, title: `中点 ${a.mid == null ? 50 : a.mid}%（两个色标之间混合到一半的位置）` });
      el.dataset.attr = 'grad-mid'; el.dataset.kind = kind; el.dataset.stop = String(k);
      el.onpointerdown = ev => {
        ev.stopPropagation();
        drag(ev, loc => {
          const b = arr[k + 1], span = b.loc - a.loc;
          a.mid = span <= 0 ? 50 : Math.max(5, Math.min(95, Math.round((loc - a.loc) / span * 100)));
        });
      };
      midEls.push({ el, kind, k });
      (kind === 'color' ? clrRow : opRow).append(el);
    }
  };
  addMids('color');
  if (gr.hasTrns) addMids('op');
  
  const insertAtLoc = (kind, loc) => {
    const arr = kind === 'color' ? m.clrs : m.trns;
    const can = kind === 'color' ? gr.clrsEditable : gr.trnsEditable;
    if (!can) { $('#err').textContent = '这条渐变的色标数组不支持增删（内核判定它不是白名单里的可增删数组）。'; return; }
    if (arr.length >= gr.max) { $('#err').textContent = `色标最多 ${gr.max} 个。`; return; }
    let k = arr.findIndex(s => s.loc > loc);
    if (k < 0) k = arr.length;
    const s = kind === 'color' ? { src: null, ...gradColorAt(m, loc), loc, mid: 50 }
                               : { src: null, opct: Math.round(gradOpacityAt(m, loc)), loc, mid: 50 };
    arr.splice(k, 0, s);
    m.sel = { kind, i: k };
    commit();
  };
  bar.onclick = ev => insertAtLoc('color', locFromEvent(ev));
  clrRow.onclick = ev => { if (ev.target === clrRow) insertAtLoc('color', locFromEvent(ev)); };
  if (gr.hasTrns) opRow.onclick = ev => { if (ev.target === opRow) insertAtLoc('op', locFromEvent(ev)); };
  paint();

  
  if (m.sel) {
    const kind = m.sel.kind, arr = kind === 'color' ? m.clrs : m.trns, k = m.sel.i, s = arr[k];
    if (!s) m.sel = null;
    else {
      const els = [];
      if (kind === 'color') {
        const ci = mk('input', { type: 'color', value: rgbHex(s), title: '色标颜色' });
        ci.dataset.attr = 'grad-color';
        ci.style.cssText = 'width:34px;height:22px;padding:0;background:#1b1b1c;border:1px solid var(--line2);border-radius:5px;flex:none';
        ci.onchange = () => { const c = parseHex6(ci.value); if (c) { s.r = c[0]; s.g = c[1]; s.b = c[2]; commit(); } };
        els.push(ci);
      } else {
        const oi = mk('input', { type: 'number', min: 0, max: 100, step: 1, value: Math.round(s.opct), title: '色标不透明度 %' });
        oi.dataset.attr = 'grad-opacity';
        oi.style.cssText = 'width:52px;flex:none;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
        oi.onchange = () => { s.opct = Math.max(0, Math.min(100, +oi.value)); commit(); };
        els.push(oi);
      }
      const li2 = mk('input', { type: 'number', min: 0, max: 4096, step: 1, value: s.loc, title: '色标位置（0–4096，PS 面板上是 0–100%）' });
      li2.dataset.attr = 'grad-loc';
      li2.style.cssText = 'width:62px;flex:none;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
      li2.onchange = () => { s.loc = Math.max(0, Math.min(4096, Math.round(+li2.value))); commit(); };
      const mi = mk('input', { type: 'number', min: 0, max: 100, step: 1, value: s.mid == null ? 50 : s.mid, title: '到下一个色标的中点 %' });
      mi.dataset.attr = 'grad-mid-input';
      mi.style.cssText = 'width:52px;flex:none;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
      mi.onchange = () => { s.mid = Math.max(0, Math.min(100, Math.round(+mi.value))); commit(); };
      const canDel = (kind === 'color' ? gr.clrsEditable : gr.trnsEditable) && arr.length > gr.min;
      const del = mk('button', { textContent: '删除',
        title: canDel ? '删掉这个色标' : (arr.length <= gr.min ? `至少要留 ${gr.min} 个色标（PS 打开会报错或自己补一个）` : '这条渐变的色标数组不支持增删') });
      del.dataset.attr = 'grad-del';
      if (!canDel) del.disabled = true;
      else del.onclick = () => { arr.splice(k, 1); m.sel = null; commit(); };
      els.push(mk('span', { textContent: '位置', style: 'color:var(--muted)' }), li2,
               mk('span', { textContent: '中点', style: 'color:var(--muted)' }), mi, del);
      row(kind === 'color' ? `色标 ${k + 1}` : `透明标 ${k + 1}`, ...els);
    }
  } else hint('点一下条上/下方的色标即可选中；在条上空白处点一下 = 在该位置插入色标（颜色取该处的插值色）。');

  
  const F = gr.fields;
  const at = tgt.at || 0, target = tgt.target;
  const tf = F.get('Type');
  if (tf) {
    const cur2 = effParam(idx, target, at, 'Type', tf.value);
    const sel = mk('select', { title: '渐变类型' });
    sel.dataset.attr = 'gradient-type'; sel.dataset.param = 'Type';
    if (!GRAD_TYPE_LABELS[cur2]) sel.append(mk('option', { value: cur2, textContent: '[' + String(cur2).trim() + ']' }));
    for (const k of Object.keys(GRAD_TYPE_LABELS)) sel.append(mk('option', { value: k, textContent: GRAD_TYPE_LABELS[k] }));
    sel.value = cur2;
    sel.onchange = () => setParamField(idx, target, at, 'Type', sel.value, tf.value);
    row('类型', sel);
  }
  const af = F.get('Angl');
  if (af && typeof af.value === 'number') {
    const cur2 = effParam(idx, target, at, 'Angl', af.value);
    const s = mk('input', { type: 'range', min: -180, max: 180, step: 1, value: cur2, title: '渐变角度（°）' });
    s.dataset.attr = 'gradient-angle'; s.dataset.param = 'Angl';
    const v = mk('span', { className: 'val', textContent: fmtNum(cur2) + '°' });
    s.oninput = () => { v.textContent = fmtNum(+s.value) + '°'; };
    s.onchange = () => setParamField(idx, target, at, 'Angl', +s.value, af.value);
    row('角度', s, v);
  }
  const sf = F.get('Scl ');
  if (sf && typeof sf.value === 'number') {
    const cur2 = effParam(idx, target, at, 'Scl ', sf.value);
    const s = mk('input', { type: 'range', min: sf.min != null ? sf.min : 1, max: sf.max != null ? sf.max : 1000, step: 1, value: cur2, title: '渐变缩放 %' });
    s.dataset.attr = 'gradient-scale'; s.dataset.param = 'Scl ';
    const v = mk('span', { className: 'val', textContent: fmtNum(cur2) + '%' });
    s.oninput = () => { v.textContent = fmtNum(+s.value) + '%'; };
    s.onchange = () => setParamField(idx, target, at, 'Scl ', +s.value, sf.value);
    row('缩放', s, v);
  }
  const flags = [];
  for (const [path, label, attr, title] of [['Rvrs', '反向', 'gradient-reverse', '反向（色标顺序颠倒）'],
                                            ['Dthr', '仿色', 'gradient-dither', '仿色（用抖动减少条带）']]) {
    const f = F.get(path);
    if (!f) continue;
    const on = !!effParam(idx, target, at, path, f.value);
    const b = mk('button', { textContent: label, className: on ? 'on' : '', title });
    b.dataset.attr = attr; b.dataset.param = path;
    b.onclick = () => setParamField(idx, target, at, path, !on, f.value);
    flags.push(b);
  }
  if (flags.length) { const d = mk('div', { className: 'btns' }); d.append(...flags); row('选项', d); }
  return taken;
}

export function renderParamEditor(box, idx, l, params, ui){
  const { row, hint, mk } = ui;
  const targets = [
    ...((params.effects && params.effects.targets) || []).filter(t => t.fields.some(f => f.editable)),
    ...((params.adjustment && params.adjustment.targets) || []).filter(t => t.fields.some(f => f.editable)),
  ];
  if (!targets.length) return;
  const states = paramUI[idx] || (paramUI[idx] = {});
  const stateKey = ui.stateKey || 'default';
  const st = states[stateKey] || (states[stateKey] = { target: null, expanded: false });
  
  const dflt = targets.find(t => t.target.startsWith('effect:')) || targets.find(t => t.primary) || targets[0];
  let cur = targets.find(t => `${t.target}#${t.at || 0}` === st.target) || dflt;
  st.target = `${cur.target}#${cur.at || 0}`;
  if (targets.length > 1) {
    const sel = mk('select', { title: '选择要编辑参数的目标（效果 / 调整层）' });
    sel.className = 'paramtarget';
    for (const t of targets) sel.append(mk('option', { value: `${t.target}#${t.at || 0}`, textContent: t.label + ((t.count > 1) ? ` #${(t.at || 0) + 1}` : '') }));
    sel.value = st.target;
    sel.onchange = () => { st.target = sel.value; st.expanded = false; renderProps(); };
    row('参数', sel);
  } else if (!ui.hideTargetLabel) row('参数', mk('span', { textContent: cur.label, style: 'color:var(--text)' }));

  
  const gradTaken = renderGradientEditor(box, idx, cur, ui);
  
  const colorPrefixes = cur.fields.filter(f => f.type === 'color').map(f => f.path + '.');
  
  
  const dup = cur.target.startsWith('effect:') ? 'enab' : cur.target === 'effects' ? 'masterFXSwitch' : null;
  const fields = cur.fields.filter(f => f.editable && f.path !== dup && !colorPrefixes.some(p => f.path.startsWith(p))
    && !gradTaken.has(f.path));
  
  const rank = f => (f.label && !/PS 内部/.test(f.label) ? 0 : 1) + (f.path.includes('.') ? 1 : 0);
  const sorted = fields.map((f, i) => ({ f, i })).sort((a, b) => (rank(a.f) - rank(b.f)) || (a.i - b.i)).map(x => x.f);
  const shown = st.expanded ? sorted : sorted.slice(0, PARAM_MAX_DEFAULT);
  for (const f of shown) paramRow(box, idx, cur, f, ui);
  if (!shown.length) hint('这个目标没有本模块支持改写的字段（其余字段原样保留）', 'warn');
  if (sorted.length > shown.length) {
    const more = mk('button', { textContent: `显示全部 ${sorted.length} 个字段`, className: 'moreparams' });
    more.onclick = () => { st.expanded = true; renderProps(); };
    row('', more);
  } else if (st.expanded && sorted.length > PARAM_MAX_DEFAULT) {
    const less = mk('button', { textContent: '收起', className: 'moreparams' });
    less.onclick = () => { st.expanded = false; renderProps(); };
    row('', less);
  }
  if ((params.warnings || []).length) hint(params.warnings[0], 'warn');
}
export function paramRow(box, idx, tgt, f, ui){
  const { row, mk } = ui;
  const label = f.label || ({ 'Clr ': tgt.block === 'SoCo' ? '填充' : '颜色', Type: '样式',
    'Ptrn.Nm  ': '图案名称', 'Ptrn.Idnt': '图案标识', 'Grad.Nm  ': '渐变名称',
    'phase.Hrzn': '水平偏移', 'phase.Vrtc': '垂直偏移' })[f.path] || f.path.trim();
  const at = tgt.at || 0, target = tgt.target;
  const set = (v, base) => setParamField(idx, target, at, f.path, v, base);
  const title = label + (f.unit ? `（${({ '#Prc': '%', '#Pxl': 'px', '#Ang': '°' })[f.unit] || f.unit}）` : '');
  if (f.type === 'bool') {
    const on = !!effParam(idx, target, at, f.path, f.value);
    const b = mk('button', { textContent: on ? '开' : '关', className: on ? 'on' : '', title });
    b.dataset.param = f.path;
    b.onclick = () => set(!on, f.value);
    row(label, b);
    return;
  }
  if (f.type === 'color') {
    
    const hexOf = eff => {
      
      
      const whole = eff ? effParam(idx, target, at, f.path, undefined) : undefined;
      if (typeof whole === 'string' && /^#[0-9a-f]{6}$/i.test(whole)) return whole.toLowerCase();
      return hexOfComponents(eff);
    };
    const hexOfComponents = eff => '#' + (f.components || []).slice(0, 3).map(p => {
      const c = tgt.fields.find(x => x.path === p);
      const v = !c ? 0 : eff ? effParam(idx, target, at, p, c.value) : c.value;
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    }).join('');
    const hex = hexOf(true), origHex = hexOf(false);
    const sw = mk('i', { title: hex, style: `width:14px;height:14px;flex:none;border-radius:3px;border:1px solid var(--line2);background:${hex}` });
    const inp = mk('input', { type: 'color', value: hex, title });
    inp.dataset.param = f.path;
    inp.style.cssText = 'width:34px;height:22px;padding:0;background:#1b1b1c;border:1px solid var(--line2);border-radius:5px';
    inp.onchange = () => setParamField(idx, target, at, f.path, inp.value.toLowerCase(), origHex.toLowerCase());
    if (tgt.block === 'SoCo') row(label, inp); else row(label, sw, inp);
    return;
  }
  if (f.type === 'enum') {
    const cur = effParam(idx, target, at, f.path, f.value);
    const table = ENUM_LABELS[f.enumType] || null;
    if (table && Object.keys(table).length) {
      const sel = mk('select', { title });
      sel.dataset.param = f.path;
      const keys = Object.keys(table);
      if (!keys.includes(cur)) sel.append(mk('option', { value: cur, textContent: '[' + String(cur).trim() + ']' }));
      for (const k of keys) sel.append(mk('option', { value: k, textContent: table[k] }));
      sel.value = cur;
      sel.onchange = () => set(sel.value, f.value);
      row(label, sel);
    } else {
      const inp = mk('input', { type: 'text', value: cur, title: title + ' —— 这个枚举我们没有中文对照表，按 PS 的原始枚举值填' });
      inp.dataset.param = f.path;
      inp.style.cssText = 'flex:1;min-width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
      inp.onchange = () => set(inp.value.trim(), f.value);
      row(label, inp);
    }
    return;
  }
  if (f.type === 'TEXT') {
    const cur = effParam(idx, target, at, f.path, f.value);
    const inp = mk('input', { type: 'text', value: cur == null ? '' : cur, title });
    inp.dataset.param = f.path;
    inp.style.cssText = 'flex:1;min-width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px';
    inp.onchange = () => set(inp.value, f.value);
    row(label, inp);
    return;
  }
  if (typeof f.value !== 'number') return;             
  const cur = effParam(idx, target, at, f.path, f.value);
  const unit = f.unit === '#Prc' ? '%' : f.unit === '#Pxl' ? 'px' : f.unit === '#Ang' ? '°' : '';
  const isInt = /^(long|comp|uint8|uint16|uint32|int16|number)$/.test(f.type);
  const hasRange = f.min !== undefined && f.max !== undefined && (f.max - f.min) <= 100000;
  if (hasRange) {
    const step = isInt ? 1 : (f.max - f.min <= 20 ? 0.1 : 1);
    const s = mk('input', { type: 'range', min: f.min, max: f.max, step, value: cur, title });
    s.dataset.param = f.path;
    const v = mk('span', { className: 'val', textContent: fmtNum(cur) + unit });
    s.oninput = () => { v.textContent = fmtNum(+s.value) + unit; };
    


    s.addEventListener('pointerdown', () => beginLayerEdit());
    s.onchange = () => { endLayerEdit(); set(isInt ? Math.round(+s.value) : +s.value, f.value); };
    row(label, s, v);
  } else {
    const inp = mk('input', { type: 'number', value: cur, title });
    inp.dataset.param = f.path;
    if (f.min !== undefined) inp.min = f.min;
    if (f.max !== undefined) inp.max = f.max;
    inp.addEventListener('pointerdown', () => beginLayerEdit());
    inp.style.cssText = 'flex:1;min-width:0;height:22px;background:#1b1b1c;color:var(--text);border:1px solid var(--line2);border-radius:5px;padding:0 4px;font-variant-numeric:tabular-nums';
    inp.onchange = () => { endLayerEdit(); set(isInt ? Math.round(+inp.value) : +inp.value, f.value); };
    row(label + (unit ? `(${unit})` : ''), inp);
  }
}
const fmtNum = n => (Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(1));
let opacityPreviewRAF = 0;
const opacityPreviewLayers = new Set();
let opacityPreviewDoc = null;
function queueOpacityLayer(i){
  if (opacityPreviewDoc !== doc) { opacityPreviewLayers.clear(); opacityPreviewDoc = doc; }
  if (i != null) opacityPreviewLayers.add(+i);
}
function scheduleOpacityPreview(){
  if (opacityPreviewRAF) return;
  const run = () => {
    opacityPreviewRAF = 0;
    const source = opacityPreviewDoc, ids = [...opacityPreviewLayers]; opacityPreviewLayers.clear(); opacityPreviewDoc = null;
    
    
    if (!doc || source !== doc || !ids.length) return;
    if (ids.length === 1 && renderOpacityRegion(ids[0])) return;
    renderStaticLayers();
  };
  if (typeof requestAnimationFrame === 'function') opacityPreviewRAF = requestAnimationFrame(run);
  else run();
}
export function setLayerVisible(i, v){ layerEdits[i] = layerEdits[i] || {}; layerEdits[i].visible = v; bumpLayerStateVersion(); if (doc && doc.layers[i]) doc.layers[i].hidden = !v; renderStaticLayers(); }



export function setLayerOpacity(i, v){ layerEdits[i] = layerEdits[i] || {}; layerEdits[i].opacity = v; bumpLayerStateVersion(); if (doc && doc.layers[i]) doc.layers[i].opacity = v; queueOpacityLayer(i); scheduleOpacityPreview(); }
export function setLayerBlend(i, k){ layerEdits[i] = layerEdits[i] || {}; layerEdits[i].blendKey = k; bumpLayerStateVersion(); if (doc && doc.layers[i]) doc.layers[i].blendMode = k; renderStaticLayers(); }
