import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {loadPlaywright} from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('此颜色回归需要Playwright');
const oraclePath=path.resolve('tools/test/fixtures/cmyk-patches-engine-20261013.json');
let fixture;
if(fs.existsSync(oraclePath)){const {dir}=JSON.parse(fs.readFileSync(oraclePath,'utf8'));const p=path.join(dir,'CoatedFOGRA39.psd');if(fs.existsSync(p))fixture=fs.readFileSync(p);}
if(!fixture){
 const {writePsd}=await import('../../core/psd-write.js'),{convertDocument}=await import('../../core/doc-mode.js'),{sRGBProfile,loadGenericCmykProfile}=await import('../../core/icc.js');
 const base=writePsd({width:2,height:1,layers:[{name:'CMYK patches',bounds:{left:0,top:0,right:2,bottom:1},rgba:new Uint8Array([90,90,90,255,30,130,220,255])}]});
 fixture=new Uint8Array(convertDocument(base,{mode:'cmyk'},{srcProfile:sRGBProfile(),dstProfile:await loadGenericCmykProfile()}).buffer);
}
const file=Array.from(fixture);
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${process.argv[2]||8789}/editor`);await page.waitForFunction(()=>window.__psd_editor?.colorMgmt);
 const r=await page.evaluate(async bytes=>{
  const F=window.__psd_editor,CM=F.colorMgmt,{getModeCodec,makeCodec}=await import('/core/color-convert.js'),{parsePsdRaster}=await import('/core/psd-raster.js'),{identifyProfile,profileIdentity}=await import('/editor/icc-identity.js'),{parseIcc}=await import('/core/icc.js');
  const p3=await CM.getProfile('p3'),srgb=await CM.getProfile('srgb'),alias={...p3,name:srgb.name};await identifyProfile(alias);
  CM.state.mode=3;CM.state.profile=alias;CM.state.proofOn=false;CM.state.gamut=false;CM.state.displayKey='';const sameNameNeedsDisplay=CM.needsDisplay();
  for(let i=0;i<300&&!CM.state.displayFn;i++)await new Promise(r=>setTimeout(r,10));const converted=!!CM.state.displayFn;
  const copy=parseIcc(p3.bytes);copy.name='different description';await identifyProfile(copy);const sameBytesSameId=profileIdentity(copy)===profileIdentity(p3),differentBytesDifferentId=profileIdentity(p3)!==profileIdentity(srgb);
  await F.initDocument(new Uint8Array(bytes).buffer,'cmyk.psd',{nested:false});F.refreshAll(true);
  const codec=getModeCodec(4);window.__fpDialog=d=>({...Object.fromEntries((d.fields||[]).filter(f=>f.key).map(f=>[f.key,f.value])),intent:'1',bpc:false});
  await CM.commands.find(c=>c[0]==='edit.colorSettings')[1]();const changed=getModeCodec(4)!==codec;
  const expected=await parsePsdRaster(new Uint8Array(bytes),{codec:makeCodec(CM.state.profile,{intent:1,bpc:false}),strictChannels:true});
  const shown=F.state.doc.layers.find(l=>l.name==='CMYK patches').rgba;let pixelDiff=0;for(let i=0;i<shown.length;i++)pixelDiff=Math.max(pixelDiff,Math.abs(shown[i]-expected.layers[0].rgba[i]));
  CM.settings.proofTarget='custom';CM.settings.proofCustom={profile:'psd_editor-cmyk',preserve:true,intent:1,bpc:true,paper:false,ink:false};CM.setProof(true);CM.state.displayKey='';CM.needsDisplay();
  for(let i=0;i<300&&!CM.state.displayError;i++)await new Promise(r=>setTimeout(r,10));
  return {sameNameNeedsDisplay,converted,sameBytesSameId,differentBytesDifferentId,changed,pixelDiff,rejectedProof:!!CM.state.displayError,proofOff:!CM.state.proofOn};
 },file);
 for(const key of ['sameNameNeedsDisplay','converted','sameBytesSameId','differentBytesDifferentId','changed','rejectedProof','proofOff'])assert.equal(r[key],true,key);
 assert.equal(r.pixelDiff,0);
 console.log('✓ 同名不同ICC、同字节身份、嵌入CMYK意图/BPC即时重绘、无效保数校样明确拒绝');
}finally{await browser.close();}
