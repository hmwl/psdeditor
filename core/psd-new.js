
















import { encodeChannel, encodeCompositeImage, byteTo16 } from './psd-image.js';

const MODES = {
  rgb: { mode: 3, channels: 3, label: 'RGB 颜色' },
  gray: { mode: 1, channels: 1, label: '灰度' },
  cmyk: { mode: 4, channels: 4, label: 'CMYK 颜色' },
};
export const NEW_DOC_MODES = Object.entries(MODES).map(([k, v]) => ({ value: k, label: v.label, channels: v.channels }));






export const NEW_DOC_PRESETS = [
  { group: '推荐', items: [
    { name: '默认 Photoshop 大小', width: 1000, height: 800, resolution: 72 },
    { name: '电商主图', width: 1200, height: 1200, resolution: 72 },
    { name: '电商详情页', width: 750, height: 2000, resolution: 72 },
    { name: '方形海报', width: 1080, height: 1080, resolution: 72 },
    { name: '桌面横幅', width: 1920, height: 1080, resolution: 72 },
  ] },
  { group: '照片', items: [
    { name: '横向 4×6', width: 1800, height: 1200, resolution: 300 },
    { name: '纵向 4×6', width: 1200, height: 1800, resolution: 300 },
    { name: '横向 5×7', width: 2100, height: 1500, resolution: 300 },
    { name: '纵向 8×10', width: 2400, height: 3000, resolution: 300 },
  ] },
  { group: '打印', items: [
    { name: 'A4', width: 2480, height: 3508, resolution: 300 },
    { name: 'A3', width: 3508, height: 4961, resolution: 300 },
    { name: '信纸', width: 2550, height: 3300, resolution: 300 },
    { name: '明信片', width: 1200, height: 1800, resolution: 300 },
  ] },
  { group: '图稿和插图', items: [
    { name: '默认', width: 2000, height: 2000, resolution: 300 },
    { name: '海报', width: 5400, height: 7200, resolution: 300 },
  ] },
  { group: 'Web', items: [
    { name: 'Web 最小尺寸', width: 1366, height: 768, resolution: 72 },
    { name: 'Web 中等尺寸', width: 1920, height: 1080, resolution: 72 },
    { name: 'Web 最大尺寸', width: 2560, height: 1440, resolution: 72 },
  ] },
  { group: '移动设备', items: [
    { name: 'iPhone 16 Pro', width: 1206, height: 2622, resolution: 72 },
    { name: 'iPhone 14', width: 1170, height: 2532, resolution: 72 },
    { name: 'iPad Pro 11"', width: 1668, height: 2388, resolution: 72 },
    { name: 'Android 1080p', width: 1080, height: 1920, resolution: 72 },
  ] },
  { group: '胶片和视频', items: [
    { name: 'HDV/HDTV 1080p', width: 1920, height: 1080, resolution: 72 },
    { name: '4K UHD', width: 3840, height: 2160, resolution: 72 },
    { name: 'DCI 4K', width: 4096, height: 2160, resolution: 72 },
  ] },
];

const u16 = v => [(v >>> 8) & 0xff, v & 0xff];
const u32 = v => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const ascii = s => [...s].map(c => c.charCodeAt(0) & 0xff);
const cat = parts => {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const A = arr => Uint8Array.from(arr);

function pascal(str, padTo) {
  const b = [];
  for (const ch of str) {                       
    const c = ch.codePointAt(0);
    b.push(c < 128 ? c : 0x3f);                 
  }
  const out = [b.length & 0xff, ...b.slice(0, 255)];
  while (out.length % padTo) out.push(0);
  return A(out);
}

function luniBlock(name) {
  const chars = [...name];
  const body = [...u32(chars.length)];
  for (const ch of chars) { const c = ch.codePointAt(0); body.push(...u16(c > 0xffff ? 0xfffd : c)); }
  while (body.length % 4) body.push(0);         
  return cat([A(ascii('8BIM')), A(ascii('luni')), A(u32(body.length)), A(body)]);
}

function smallBlock(key, data) {
  const body = data.length % 2 ? cat([A(data), A([0])]) : A(data);
  return cat([A(ascii('8BIM')), A(ascii(key)), A(u32(data.length)), body]);
}



function imageResource(id, data, name = '') {
  const nm = pascal(name, 2);
  const body = data.length % 2 ? cat([data, A([0])]) : data;
  return cat([A(ascii('8BIM')), A(u16(id)), nm, A(u32(data.length)), body]);
}

function resolutionInfo(res) {
  const fixed = Math.round(res * 65536);
  const f32 = [(fixed >>> 24) & 0xff, (fixed >>> 16) & 0xff, (fixed >>> 8) & 0xff, fixed & 0xff];
  return A([...f32, ...u16(1), ...u16(1), ...f32, ...u16(1), ...u16(1)]);   
}


function toRGB(c) {
  if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
  if (!m) return [255, 255, 255];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}














export function createPsd(o = {}) {
  const width = Math.max(1, Math.min(30000, Math.round(o.width || 1000)));
  const height = Math.max(1, Math.min(30000, Math.round(o.height || 800)));
  const modeKey = MODES[o.mode] ? o.mode : 'rgb';
  const M = MODES[modeKey];
  const depth = +o.depth === 16 ? 16 : 8;
  const resolution = Math.max(1, Math.min(10000, +o.resolution || 72));
  const bg = o.background || 'white';
  const transparent = bg === 'transparent';
  const name = o.name || (transparent ? '图层 1' : '背景');

  
  const rgb = bg === 'black' ? [0, 0, 0] : bg === 'color' ? toRGB(o.backgroundColor) : [255, 255, 255];
  
  let fill;
  if (modeKey === 'gray') fill = [Math.round(rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114)];
  else if (modeKey === 'cmyk') {
    
    const k = 1 - Math.max(rgb[0], rgb[1], rgb[2]) / 255;
    const f = k < 1 ? [(1 - rgb[0] / 255 - k) / (1 - k), (1 - rgb[1] / 255 - k) / (1 - k), (1 - rgb[2] / 255 - k) / (1 - k)] : [0, 0, 0];
    fill = [...f, k].map(v => 255 - Math.round(Math.max(0, Math.min(1, v)) * 255));
  } else fill = rgb;

  
const up = v => depth === 16 ? byteTo16(v) : v;
  const plane = v => {
    const n = width * height;
    const a = depth === 16 ? new Uint16Array(n) : new Uint8Array(n);
    const val = up(v);
    if (val) a.fill(val);
    return a;
  };
  const colorPlanes = fill.map(v => plane(transparent ? (modeKey === 'cmyk' ? 255 : 0) : v));
  const alphaPlane = plane(transparent ? 0 : 255);

  
  
  const chanSpecs = [{ id: -1, data: alphaPlane }, ...colorPlanes.map((d, i) => ({ id: i, data: d }))];
  const chanBodies = chanSpecs.map(c => encodeChannel({
    data: c.data, width, height, depth, compression: 1, psb: false, reuseRaw: false, withHeader: true,
  }));

  





  const lockedBg = !transparent;
  const extra = cat([
    A(u32(0)),                                   
    A(u32(0)),                                   
    pascal(name, 4),
    luniBlock(name),
    ...(lockedBg ? [smallBlock('lspf', u32(1))] : []),
  ]);
  const record = cat([
    A(u32(0)), A(u32(0)), A(u32(height)), A(u32(width)),      
    A(u16(chanSpecs.length)),
    ...chanSpecs.map((c, i) => A([...u16(c.id & 0xffff), ...u32(chanBodies[i].length)])),
    A(ascii('8BIM')), A(ascii('norm')),
    A([255, 0, transparent ? 0 : 0x09, 0]),      
    A(u32(extra.length)), extra,
  ]);

  let layerInfoBody = cat([A(u16(1)), record, ...chanBodies]);
  if (layerInfoBody.length % 2) layerInfoBody = cat([layerInfoBody, A([0])]);   
  const layerInfo = cat([A(u32(layerInfoBody.length)), layerInfoBody]);
  const layerAndMask = cat([layerInfo, A(u32(0))]);                              

  
  const compPlanes = transparent
    ? fill.map(() => plane(modeKey === 'cmyk' ? 0 : 255))
    : colorPlanes;
  const imageData = encodeCompositeImage({ planes: compPlanes, width, height, depth, compression: 1, psb: false });

  const resources = imageResource(1005, resolutionInfo(resolution));

  return cat([
    A(ascii('8BPS')), A(u16(1)), new Uint8Array(6),
    A(u16(M.channels)), A(u32(height)), A(u32(width)), A(u16(depth)), A(u16(M.mode)),
    A(u32(0)),                                   
    A(u32(resources.length)), resources,
    A(u32(layerAndMask.length)), layerAndMask,
    imageData,
  ]).buffer;
}

export default { createPsd, NEW_DOC_PRESETS, NEW_DOC_MODES };
