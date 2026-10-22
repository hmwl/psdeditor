import assert from 'node:assert/strict';
import { writePsd, rebuildPsdReplacingLayerPixels } from '../../core/psd-write.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { convertDocument } from '../../core/doc-mode.js';
import { sRGBProfile } from '../../core/icc.js';
import { applyEdits } from '../../core/psd-edit.js';
const W=4,H=3,bounds={left:0,top:0,right:W,bottom:H};
const rgba=Uint8Array.from({length:W*H*4},(_,i)=>i%4===0?220:i%4===1?80:i%4===2?40:255);
const base=writePsd({width:W,height:H,layers:[{name:'masked',bounds,rgba}],composite:rgba});
for(const depth of [16,32]){
  let buffer=convertDocument(base,{mode:'rgb',depth},{srcProfile:sRGBProfile(),dstProfile:sRGBProfile()}).buffer;
  buffer=applyEdits(buffer,[{op:'addLayerMask',index:0,bounds:{top:0,left:0,bottom:H,right:W},gray:Uint8Array.from([255,192,128,64,0,32,96,160,224,255,128,16])}]).buffer;
  const before=await parsePsdRaster(buffer,{keepPlanes:true,keepNativePlanes:true,strictChannels:true});
  const planes=before.layers[0].nativePlanes;
  const changed=Uint8Array.from(rgba,(_,i)=>i%4===3?Math.max(0,255-(i%7)*20):rgba[i]);
  const out=rebuildPsdReplacingLayerPixels(buffer,0,changed,bounds,null,{nativePlanes:planes});
  const after=await parsePsdRaster(out,{keepPlanes:true,keepNativePlanes:true,strictChannels:true});
  assert.deepEqual(after.layers[0].mask.gray,before.layers[0].mask.gray,`${depth}位蒙版平面必须原样保留`);
  for(const id of [0,1,2,-1])assert.deepEqual(after.layers[0].nativePlanes[id],planes[id],`${depth}位原生通道必须原样保留`);
  assert.throws(()=>rebuildPsdReplacingLayerPixels(buffer,0,changed,bounds,null,{premultiplied:true}),/预乘蒙版写回暂不支持/);
}
console.log('✓ 16/32位带蒙版写回保留原生通道与蒙版；预乘输入显式拒绝，避免静默数据损坏');
