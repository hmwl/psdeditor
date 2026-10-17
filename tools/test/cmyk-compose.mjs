import fs from 'node:fs';
import assert from 'node:assert/strict';
import {compositeCMYK,sampleCMYK} from '../../core/cmyk-compose.js';
import {writePsd,rebuildPsdReplacingLayerPixels,replacePsdCompositeImage} from '../../core/psd-write.js';
import {convertDocument,setEmbeddedProfile} from '../../core/doc-mode.js';
import {parsePsdRaster} from '../../core/psd-raster.js';
import {decodeCompositeImage,encodeCompositeImage,readSections,Compression} from '../../core/psd-image.js';
import {parsePsdDocument} from '../../core/psd-document.js';
import {sRGBProfile,loadGenericCmykProfile} from '../../core/icc.js';
import {makeCodec} from '../../core/color-convert.js';
import {refreshComposite,renderLayers} from '../../server/doc-render.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/cmyk-native-blends.json',import.meta.url)));
const transparentFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/cmyk-transparent-cache.json',import.meta.url)));
let passed=0,rejected=0;
for(const r of fixture.rows){
 const max=r.depth===16?65535:255,Type=r.depth===16?Uint16Array:Uint8Array;
 const layer=(values,opacity,blendMode)=>({bounds:{left:0,top:0,right:1,bottom:1},width:1,height:1,opacity,blendMode,nativePlanes:Object.fromEntries([...values.map((v,c)=>[c,new Type([v])]),[-1,new Type([max])]])});
 const doc={width:1,height:1,depth:r.depth,mode:4,layers:[layer(r.base,255,'norm'),layer(r.top,r.opacity,r.mode)]},out=compositeCMYK(doc);
 if(r.depth===8&&r.mode==='diff'&&r.opacity<255){assert.equal(out.supported,false);rejected++;continue;}
 assert.equal(out.supported,true,JSON.stringify(out));for(let c=0;c<4;c++)assert.ok(Math.abs(out.planes[c][0]-r.ps[c])<=(r.depth===16?2:1),JSON.stringify(r));passed++;
 doc.layers[1].effects={enabled:true};assert.equal(compositeCMYK(doc).supported,false,'效果不允许隐式重新分色');
}
const profile=await loadGenericCmykProfile();
for(const depth of [8,16]){
 const max=depth===16?65535:255,Type=depth===16?Uint16Array:Uint8Array,W=1024,rgba=new Uint8Array(W*4).fill(255),bounds={left:0,top:0,right:W,bottom:1};
 let b=convertDocument(writePsd({width:W,height:1,layers:[{name:'K only',bounds,rgba}],composite:rgba}),{mode:'cmyk',depth},{srcProfile:sRGBProfile(),dstProfile:profile}).buffer;
 const planes={};for(const c of [0,1,2])planes[c]=new Type(W).fill(max);planes[3]=Type.from({length:W},(_,i)=>depth===16?i*53:Math.round(i*255/(W-1)));planes[-1]=new Type(W).fill(max);
 b=rebuildPsdReplacingLayerPixels(b,0,rgba,bounds,null,{nativePlanes:planes});
 const doc=await parsePsdRaster(b,{keepNativePlanes:true,strictChannels:true}),native=compositeCMYK(doc);
 const merged=decodeCompositeImage(replacePsdCompositeImage(b,null,{nativeComposite:native}));
 for(let c=0;c<4;c++)assert.deepEqual([...merged.channels[c]],[...planes[c]],'缓存保原墨量，不经过RGB反分色');
 assert.deepEqual(sampleCMYK(native,0,0),[0,0,0,100]);
 const refreshed=await refreshComposite(b);assert.equal(refreshed.warning,undefined);const flat=decodeCompositeImage(refreshed.buffer);
 for(let c=0;c<4;c++)assert.deepEqual([...flat.channels[c]],[...planes[c]],'服务端刷新保持纯K及16位梯度');
 const render=await renderLayers(setEmbeddedProfile(b,null));assert.equal(render.assumedProfile,true);assert.equal(render.nativeComposite.supported,true);
  const semi={...doc,layers:doc.layers.map(l=>({...l,opacity:128}))},transparent=compositeCMYK(semi),extra=new Type(W).fill(depth===16?12345:37),section=readSections(b);
  const oldBody=encodeCompositeImage({planes:[...planesFrom(planes),extra],width:W,height:1,depth,compression:Compression.RAW});
  const withExtra=new Uint8Array(section.imageData.off+oldBody.length);withExtra.set(new Uint8Array(b).subarray(0,section.imageData.off));withExtra.set(oldBody,section.imageData.off);new DataView(withExtra.buffer).setUint16(12,5);
  const transBytes=replacePsdCompositeImage(withExtra,null,{nativeComposite:transparent}),transDoc=parsePsdDocument(transBytes),trans=decodeCompositeImage(transBytes);
  assert.equal(transDoc.header.channels,6);assert.ok(transDoc.layerInfo.countRaw<0,'声明新增合成透明度');
  assert.deepEqual([...trans.channels[5]],[...extra],'原有Alpha通道不能当作合成透明度覆盖');
  for(let c=0;c<4;c++)assert.deepEqual([...trans.channels[c]],[...transparent.planes[c]].map((v,i)=>Math.round(max-(max-v)*transparent.alpha[i]/max)),'合成缓存四色按PS纸白matte写盘');
  assert.deepEqual([...transparent.planes[3]],[...planes[3]],'写盘不能改变原生未关联K显示通道');
  assert.deepEqual([...trans.channels[4]],[...transparent.alpha],'合成透明度独立保留');
  const twice=decodeCompositeImage(replacePsdCompositeImage(transBytes,null,{nativeComposite:transparent}));
  assert.equal(twice.channels.length,6,'已有透明标记不能重复增加通道');
  assert.deepEqual([...twice.channels[5]],[...extra],'重复刷新仍保原有附加alpha');
 const before=doc.layers[0].rgba,after=new Uint8ClampedArray(before);after[400]=200;after[401]=80;after[402]=50;
 const edited=rebuildPsdReplacingLayerPixels(b,0,after,bounds,null,{nativeSource:planes,displaySource:before,nativeProfile:profile.bytes});
 const read=await parsePsdRaster(edited,{keepNativePlanes:true,strictChannels:true});
 for(let c=0;c<4;c++)for(let i=0;i<W;i++)if(i!==100)assert.equal(read.layers[0].nativePlanes[c][i],planes[c][i],'RGB编辑也只改触及像素，其他K不被重分色');
 const malformed={...native,width:1};assert.throws(()=>replacePsdCompositeImage(b,null,{nativeComposite:malformed}),/不一致/);
}
for(const row of transparentFixture.rows){
 const max=row.depth===16?65535:255,Type=row.depth===16?Uint16Array:Uint8Array,rgba=Uint8Array.from([0,0,0,255]),bounds={left:0,top:0,right:1,bottom:1};
 const source=convertDocument(writePsd({width:1,height:1,layers:[{name:'transparent oracle',bounds,rgba}],composite:rgba}),{mode:'cmyk',depth:row.depth},{srcProfile:sRGBProfile(),dstProfile:profile}).buffer;
 const native={supported:true,width:1,height:1,depth:row.depth,planes:row.unassociated.map(v=>Type.of(v)),alpha:Type.of(row.alpha)};
 const ps=decodeCompositeImage(replacePsdCompositeImage(source,null,{nativeComposite:native}));
 for(let c=0;c<4;c++)assert.ok(Math.abs(ps.channels[c][0]-row.ps[c])<=(row.depth===16?2:0),JSON.stringify(row));
 assert.equal(ps.channels[4][0],row.alpha,'writer保持输入alpha精确值');
 assert.ok(Math.abs(ps.channels[4][0]-row.psAlpha)<=(row.depth===16?1:0));
 assert.deepEqual(native.planes.map(p=>p[0]),row.unassociated,'oracle写回不得原地matte原生色板');
}
function planesFrom(p){return [0,1,2,3].map(c=>p[c]);}
console.log(`✓ ${passed}个真实PS原生CMYK混合参考，${rejected}个不支持组合正确拒绝；纯K/16位梯度/缓存/局部编辑保黑版`);
