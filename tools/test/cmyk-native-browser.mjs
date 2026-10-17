import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadPlaywright} from './pw.mjs';
import {writePsd,rebuildPsdReplacingLayerPixels} from '../../core/psd-write.js';
import {convertDocument} from '../../core/doc-mode.js';
import {loadGenericCmykProfile,sRGBProfile} from '../../core/icc.js';
const PW=await loadPlaywright();if(!PW)throw new Error('此CMYK回归需要Playwright');
const profile=await loadGenericCmykProfile(),rgba=new Uint8Array(16*4*4).fill(255),bounds={left:0,top:0,right:16,bottom:4},files=[];
for(const depth of [8,16]){
 let bytes=convertDocument(writePsd({width:16,height:4,layers:[{name:'Pure K',bounds,rgba}],composite:rgba}),{mode:'cmyk',depth},{srcProfile:sRGBProfile(),dstProfile:profile}).buffer;
 const max=depth===16?65535:255,Type=depth===16?Uint16Array:Uint8Array,p={};for(const c of [0,1,2,-1])p[c]=new Type(64).fill(max);p[3]=Type.from({length:64},(_,i)=>i%16<8?0:Math.round(max*.5));
 bytes=rebuildPsdReplacingLayerPixels(bytes,0,rgba,bounds,null,{nativePlanes:p});files.push({depth,bytes:[...bytes]});
}
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});await page.goto(`http://127.0.0.1:${process.argv[2]||8789}/editor`);await page.waitForFunction(()=>window.__psd_editor?.colorMgmt);
 for(const file of files){
  const r=await page.evaluate(async ({depth,bytes})=>{
   const F=window.__psd_editor,{nativeCMYKPreview}=await import('/editor/app/30-render.js'),{sampleCMYK}=await import('/core/cmyk-compose.js'),{decodeCompositeImage}=await import('/core/psd-image.js'),{parsePsdRaster}=await import('/core/psd-raster.js'),{layerPixelJob}=await import('/editor/app/14-edit-misc.js');
   await F.initDocument(new Uint8Array(bytes).buffer,'native-cmyk.psd',{nested:false});F.refreshAll(true);F.selectLayers([0]);
   const ink=nativeCMYKPreview(),point=sampleCMYK(ink,2,1),half=sampleCMYK(ink,12,1);
   for(let i=0;i<300&&!window.__psd_editorInfo;i++)await new Promise(r=>setTimeout(r,10));
   const rows=window.__psd_editorInfo.readout('actual',[30,30,30,255],{x:2,y:1}),total=window.__psd_editorInfo.readout('ink',[30,30,30,255],{x:2,y:1});
   const built=await F.buildPsdBuffer({fast:false}),flat=decodeCompositeImage(built.buf),max=depth===16?65535:255;
   const save={cmy:flat.channels.slice(0,3).every(p=>p.every(v=>v===max)),k100:flat.channels[3][18]===0,k50:flat.channels[3][28]===Math.round(max*.5),native:built.notes.composite};
   const original=F.state.doc.layers[0].nativePlanes[3].slice();
   const changed=layerPixelJob('CMYK局部编辑',({base})=>{const out=new Uint8ClampedArray(base);out[40]=200;out[41]=100;out[42]=50;return out;});
   const edited=await F.buildPsdBuffer({fast:false}),doc=await parsePsdRaster(edited.buf,{keepNativePlanes:true,strictChannels:true});
   const preserved=original.every((v,i)=>i===10||doc.layers[0].nativePlanes[3][i]===v),fallback=!nativeCMYKPreview().supported;
   F.paint.undo();const restored=nativeCMYKPreview().supported;
   return {point,half,rows,total,save,changed,preserved,fallback,restored};
  },file);
  assert.deepEqual(r.point,[0,0,0,100]);assert.deepEqual(r.half.slice(0,3),[0,0,0]);assert.equal(Math.round(r.half[3]),50);
  assert.deepEqual(r.rows,[['C:','0%'],['M:','0%'],['Y:','0%'],['K:','100%']]);assert.deepEqual(r.total,[['总计:','100%']]);
  for(const v of Object.values(r.save))assert.equal(v,true);for(const key of ['changed','preserved','fallback','restored'])assert.equal(r[key],true,key);
  console.log(`✓ ${file.depth}位浏览器原始K/总墨量、原生缓存、局部RGB编辑保未改K与撤销恢复`);
 }
}finally{await browser.close();}
