



import { displayByteToFloat } from './color-convert.js';
import { byteTo16 } from './psd-image.js';

function range16(_a) {
  return 65535;
}

export function mergeNativePixelEdits(source, before, after, width, height, depth, mode, codec = null) {
  const n = width * height, nc = mode === 4 ? 4 : mode === 3 ? 3 : mode === 1 ? 1 : 0;
  if (!nc || ![8,16,32].includes(depth) || mode===4&&depth===32) throw new Error('原生像素保留仅支持8/16位CMYK与8/16/32位RGB/灰度');
  if(mode===4&&!codec?.fromRgb8)throw new Error('CMYK像素编辑需要文档ICC反分色器');
  if (before.length !== n * 4 || after.length !== n * 4) throw new Error('原生像素基准尺寸不一致');
  const Type = depth === 16 ? Uint16Array : depth===8 ? Uint8Array : Float32Array, out = {};
  for (let c = 0; c < nc; c++) {
    const src = source[c];
    if (!(src instanceof Type) || src.length !== n) throw new Error(`原生颜色通道 ${c} 的类型/尺寸不一致`);
    const dst = new Type(src), max = depth === 16 ? range16(src) : depth===8 ? 255 : 1;
    if(mode===4){out[c]=dst;continue;}
    for (let i = 0; i < n; i++) {
      const q = i * 4;
      const changed = nc === 1 ? before[q] !== after[q] || before[q+1] !== after[q+1] || before[q+2] !== after[q+2] : before[q+c] !== after[q+c];
      if (!changed) continue;
      const v = nc === 1 ? Math.round(.299*after[q]+.587*after[q+1]+.114*after[q+2]) : after[q+c];
      dst[i] = depth === 16 ? byteTo16(v, max) : depth===8 ? v : displayByteToFloat(v);
    }
    out[c] = dst;
  }
  if(mode===4){
    const ink=[0,0,0,0],max=depth===16?65535:255;
    for(let i=0;i<n;i++){
      const q=i*4;if(before[q]===after[q]&&before[q+1]===after[q+1]&&before[q+2]===after[q+2]&&!(before[q+3]===0&&after[q+3]>0))continue;
      codec.fromRgb8(after[q],after[q+1],after[q+2],ink);
      for(let c=0;c<4;c++)out[c][i]=Math.round(ink[c]*max/255);
    }
  }
  const srcAlpha = source[-1], alphaMax = depth === 16 ? (srcAlpha ? range16(srcAlpha) : range16(source[0])) : depth===8 ? 255 : 1;
  if (srcAlpha && (!(srcAlpha instanceof Type) || srcAlpha.length !== n)) throw new Error('原生alpha通道的类型/尺寸不一致');
  const alpha = srcAlpha ? new Type(srcAlpha) : new Type(n).fill(alphaMax);
  for (let i = 0; i < n; i++) {
    const q = i * 4;
    if (before[q+3] === after[q+3]) continue;
    
    
    const nativeA = srcAlpha ? srcAlpha[i] / alphaMax : 1;
    const mask = nativeA > 0 ? Math.min(1, before[q+3] / (255*nativeA)) : 1;
    if (!(mask > 0)) continue;
    const value = Math.max(0, Math.min(1, after[q+3] / (255*mask))) * alphaMax;
    alpha[i] = depth !==32 ? Math.round(value) : value;
  }
  out[-1] = alpha;
  return out;
}

export function growNativePlanes(source, width, height, newWidth, newHeight, x, y) {
  if (![width,height,newWidth,newHeight,x,y].every(Number.isInteger) || x < 0 || y < 0 || x+width > newWidth || y+height > newHeight) throw new Error('原生通道扩边尺寸非法');
  const out = {};
  for (const id of Object.keys(source).filter(id => +id >= -1)) {
    const src = source[id];
    if (src.length !== width*height) throw new Error('原生通道扩边基准尺寸不一致');
    const dst = new src.constructor(newWidth*newHeight);
    for (let row=0;row<height;row++) dst.set(src.subarray(row*width,(row+1)*width),(row+y)*newWidth+x);
    out[id] = dst;
  }
  if (!out[-1]) {
    const Type=source[0].constructor, max=Type===Uint16Array ? range16(source[0]) : Type===Float32Array ? 1 : 255;
    out[-1]=new Type(newWidth*newHeight);
    for(let row=0;row<height;row++)out[-1].fill(max,(row+y)*newWidth+x,(row+y)*newWidth+x+width);
  }
  return out;
}
