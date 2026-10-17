import assert from 'node:assert/strict';
import { mergeNativePixelEdits, growNativePlanes } from '../../core/native-pixel-edit.js';
import { writePsd, rebuildPsdReplacingLayerPixels } from '../../core/psd-write.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { convertDocument } from '../../core/doc-mode.js';
import { sRGBProfile } from '../../core/icc.js';
const w=1024,h=1,bounds={left:0,top:0,right:w,bottom:h},rgba=new Uint8Array(w*4).fill(255);
const base=writePsd({width:w,height:h,layers:[{name:'precision',bounds,rgba}],composite:rgba});
for(const depth of [16,32]) {
  const Type=depth===16?Uint16Array:Float32Array, source={};
  for(const id of [0,1,2,-1]) source[id]=Type.from({length:w},(_,i)=>id===-1?(depth===16?32768:1):depth===16?i*29+id*17:(i-80)/71+id*.003);
  let bytes=convertDocument(base,{mode:'rgb',depth},{srcProfile:sRGBProfile(),dstProfile:sRGBProfile()}).buffer;
  bytes=rebuildPsdReplacingLayerPixels(bytes,0,rgba,bounds,null,{nativePlanes:source});
  const doc=await parsePsdRaster(bytes,{keepNativePlanes:true,strictChannels:true}), before=doc.layers[0].rgba, after=new Uint8ClampedArray(before);
  const target=190;after[target*4]=before[target*4]===80?90:80;
  const native=mergeNativePixelEdits(source,before,after,w,h,depth,3);
  const edited=rebuildPsdReplacingLayerPixels(bytes,0,after,bounds,null,{nativeSource:source,displaySource:before,premultiplied:true});
  const read=await parsePsdRaster(edited,{keepNativePlanes:true,strictChannels:true});
  for(const id of [0,1,2,-1]) {
    assert.deepEqual(read.layers[0].nativePlanes[id],native[id]);
    for(let i=0;i<w;i++)if(id!==0||i!==target)assert.equal(native[id][i],source[id][i],'仅修改红通道一个样本，不量化其他通道');
  }
  const undone=mergeNativePixelEdits(source,before,before,w,h,depth,3);
  for(const id of [0,1,2,-1])assert.deepEqual(undone[id],source[id],'撤销从原生基准恢复，不叠加量化');
  assert.deepEqual(mergeNativePixelEdits(source,before,after,w,h,depth,3),native,'重做稳定');
  const grown=growNativePlanes(source,w,h,w+2,3,1,1);
  for(const id of [0,1,2,-1]){assert.equal(grown[id][0],0);assert.deepEqual(grown[id].slice(w+3,w+3+w),source[id]);}
  assert.deepEqual(source[0],doc.layers[0].nativePlanes[0],'扩边和计算不修改原生基准');
  const grayBefore=new Uint8ClampedArray(before),grayAfter=new Uint8ClampedArray(grayBefore);grayAfter[0]=40;
  const gray=mergeNativePixelEdits({0:source[0],[-1]:source[-1]},grayBefore,grayAfter,w,h,depth,1);
  assert.deepEqual(gray[0].slice(1),source[0].slice(1));
}
const masked={0:new Float32Array([2]),1:new Float32Array([2]),2:new Float32Array([2]),[-1]:new Float32Array([.8])};
const m=mergeNativePixelEdits(masked,new Uint8Array([255,255,255,102]),new Uint8Array([255,255,255,51]),1,1,32,3);
assert.ok(Math.abs(m[-1][0]-.4)<1e-6,'mask不再重复乘进原生alpha');
assert.equal(m[0][0],2,'HDR不受alpha变更影响');
assert.throws(()=>mergeNativePixelEdits(masked,new Uint8Array(4),new Uint8Array(4),1,1,32,4),/仅支持/);
console.log('✓ 高位深局部编辑/撤销/重做/扩边/灰度/蒙版保留未改样本');
