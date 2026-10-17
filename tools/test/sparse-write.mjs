import assert from 'node:assert/strict';
import {writePsd}from'../../core/psd-write.js';
import {parsePsdRaster}from'../../core/psd-raster.js';
import {patchPsdSparsePixels}from'../../core/psd-sparse-write.js';
import {decodeCompositeImage}from'../../core/psd-image.js';
import {compositeAll}from'../../core/compose.js';
import {parsePsdFull}from'../../core/psd-parse.js';
import {largeZipFixture}from'./large-zip-fixture.mjs';
const width=17,height=13,original=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)original.set([x*11,y*13,(x+y)*5,50+(x+y)*5],(y*width+x)*4);
const tile={x:5,y:4,width:4,height:3,data:new Uint8ClampedArray(4*3*4),original:new Uint8ClampedArray(4*3*4)};
for(let y=0;y<3;y++)for(let x=0;x<4;x++)tile.original.set(original.subarray(((y+4)*width+x+5)*4,((y+4)*width+x+6)*4),(y*4+x)*4);
tile.data.set(tile.original);tile.data.set([250,20,30,123],(1*4+2)*4);
const expected=original.slice();expected.set([250,20,30,123],(5*width+7)*4);
for(const mode of['norm','mul ','over','diff'])for(const clip of[false,true]){
 const base={name:'base',bounds:{left:0,top:0,right:width,bottom:height},rgba:original,opacity:255,blendMode:'norm'};
 const layer={name:'paint',bounds:{left:0,top:0,right:width,bottom:height},rgba:original,opacity:173,blendMode:mode,clipping:clip?1:0};
 const input=writePsd({width,height,layers:[base,layer]}),bytes=new Uint8Array(input).slice();
 const result=await patchPsdSparsePixels(input,[{index:1,tiles:[tile]}],{merged:true});
 assert.deepEqual(new Uint8Array(input),bytes,'writing must not mutate the undo source');
 const parsed=await parsePsdRaster(result.buffer);assert.deepEqual(parsed.layers[1].rgba,expected);
 const want=compositeAll({...parsed,layers:[parsed.layers[0],{...parsed.layers[1],rgba:expected}]},width,height,new Map()).data;
 const merged=decodeCompositeImage(result.buffer);assert.deepEqual(merged.toRGBA(),want,`${mode}/${clip}: merged cache differs from raster layers`);
}
for(const compression of['raw','zip','prediction','rle']){
 const encoded=await largeZipFixture(17,13,{patterned:true,compression});const input=encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength);
 const source=await parsePsdRaster(input),p={x:0,y:0,width:2,height:2,data:new Uint8ClampedArray(16),original:new Uint8ClampedArray(16)};
 for(let y=0;y<2;y++)p.original.set(source.layers[0].rgba.subarray(y*17*4,(y*17+2)*4),y*8);
 p.data.set(p.original);p.data.set([9,11,77,88],0);
 const result=await patchPsdSparsePixels(input,[{index:0,tiles:[p]}],{merged:true}),doc=await parsePsdRaster(result.buffer),merged=decodeCompositeImage(result.buffer);
 assert.deepEqual([...doc.layers[0].rgba.slice(0,4)],[9,11,77,88]);assert.deepEqual(merged.toRGBA(),doc.layers[0].rgba);
 assert.equal(parsePsdFull(result.buffer).sections.layerCountRaw,-1);
 const fast=await patchPsdSparsePixels(input,[{index:0,tiles:[p]}]);const a=parsePsdFull(input).sections.lmiEndAbs,b=parsePsdFull(fast.buffer).sections.lmiEndAbs;
 assert.deepEqual(new Uint8Array(fast.buffer).subarray(b),new Uint8Array(input).subarray(a),'structural fast write preserves the exact old composite');
}
const psb=await largeZipFixture(2,30001,{compression:'rle'});const p={x:0,y:29999,width:2,height:2,data:new Uint8ClampedArray(16).fill(255)};
const saved=await patchPsdSparsePixels(psb,[{index:0,tiles:[p]}],{merged:true});const doc=await parsePsdRaster(saved.buffer);
assert.deepEqual([...doc.layers[0].rgba.slice((29999*2)*4,(29999*2+1)*4)],[255,255,255,255]);assert.equal(parsePsdFull(saved.buffer).header.psb,true);
const opaque=original.slice();for(let i=3;i<opaque.length;i+=4)opaque[i]=255;
const alphaInput=writePsd({width,height,layers:[{name:'rgb',bounds:{left:0,top:0,right:width,bottom:height},rgba:opaque}]}),full=parsePsdFull(alphaInput),l=full.layers[0],s=full.sections,src=new Uint8Array(alphaInput);
const a=l.chDataStart+l.channelLengths.slice(0,3).reduce((n,v)=>n+v,0),end=l.chDataEnd,info=l.recordStart+18+3*6,delta=6+end-a;
const noAlpha=new Uint8Array(src.length-delta);noAlpha.set(src.subarray(0,info));noAlpha.set(src.subarray(info+6,a),info);noAlpha.set(src.subarray(end),a-6);
const dv=new DataView(noAlpha.buffer),sourceView=new DataView(src.buffer,src.byteOffset,src.byteLength);dv.setUint16(l.recordStart+16,3);dv.setUint32(s.layerInfoLenOffset,sourceView.getUint32(s.layerInfoLenOffset)-delta);dv.setUint32(s.lmiLenOffset,sourceView.getUint32(s.lmiLenOffset)-delta);
const alphaPatch={x:7,y:5,width:1,height:1,data:new Uint8ClampedArray([7,9,11,80]),original:opaque.slice((5*width+7)*4,(5*width+8)*4)};
const withAlpha=await patchPsdSparsePixels(noAlpha,[{index:0,tiles:[alphaPatch]}],{merged:true}),rgbDoc=await parsePsdRaster(withAlpha.buffer);
assert.deepEqual([...rgbDoc.layers[0].rgba.slice((5*width+7)*4,(5*width+8)*4)],[7,9,11,80]);assert.deepEqual(decodeCompositeImage(withAlpha.buffer).toRGBA(),rgbDoc.layers[0].rgba);
console.log('✓ 稀疏行写回、PSD/PSB 长度、ZIP/RLE 转换、多层透明混合/剪贴、完整合成缓存与输入不变');
