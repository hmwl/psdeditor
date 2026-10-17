import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadPlaywright} from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('此回归需要Playwright');
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||(fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${process.argv[2]||8789}/editor`);await page.waitForFunction(()=>window.__psd_editor?.initDocument);
 const rows=await page.evaluate(async()=>{
  const F=window.__psd_editor,{writePsd,rebuildPsdReplacingLayerPixels}=await import('/core/psd-write.js'),{parsePsdRaster}=await import('/core/psd-raster.js'),{convertDocument}=await import('/core/doc-mode.js'),{sRGBProfile}=await import('/core/icc.js');
  const {layerPixelJob}=await import('/editor/app/14-edit-misc.js'),{growPixelPaintToCanvas,commitPixelPaint}=await import('/editor/app/38-brush-engine.js');
  const W=32,H=16,bounds={left:8,top:4,right:40,bottom:20},rgba=new Uint8Array(W*H*4).fill(255),rows=[];
  const baseline=writePsd({width:64,height:32,layers:[{name:'precision',bounds,rgba}],composite:new Uint8Array(64*32*4)});
  for(const depth of [16,32])for(const mode of [3,1]){
   const Type=depth===16?Uint16Array:Float32Array,source={};
   for(const id of mode===3?[0,1,2,-1]:[0,-1])source[id]=Type.from({length:W*H},(_,i)=>id===-1?(depth===16?32768:1):depth===16?i*57+13+id*7:(i-30)/63+id*.003);
   let bytes=convertDocument(baseline,{mode:mode===3?'rgb':'gray',depth},{srcProfile:sRGBProfile()}).buffer;
   bytes=rebuildPsdReplacingLayerPixels(bytes,0,rgba,bounds,null,{nativePlanes:source});
   await F.initDocument(bytes.buffer,`native-${depth}-${mode}.psd`,{nested:false});F.refreshAll(true);F.selectLayers([0]);
   window.__fpDialog=d=>d.form?Object.fromEntries((d.fields||[]).filter(f=>f.key).map(f=>[f.key,f.value])):true;
   const target=100,changed=layerPixelJob('单通道精度测试',({base})=>{const out=new Uint8ClampedArray(base);out[target*4]=80;return out;});
   const capture=async()=>{
    const built=await F.buildPsdBuffer({fast:true}),d=await parsePsdRaster(built.buf,{keepNativePlanes:true,strictChannels:true});
    const L=d.layers.find(l=>l.name==='precision'),counts={};
    for(const id of Object.keys(source)){
     let bad=0;for(let i=0;i<W*H;i++){const x=i%W,y=Math.floor(i/W),j=L.width===W?i:(y+4)*L.width+x+8;if(!(id==='0'&&i===target)&&L.nativePlanes[id][j]!==source[id][i])bad++;}counts[id]=bad;
    }
    return {counts,bounds:L.bounds,changed:L.nativePlanes[0][L.width===W?target:(Math.floor(target/W)+4)*L.width+target%W+8]!==source[0][target]};
   };
   const edited=await capture();F.paint.undo();const undo=await capture();F.paint.redo();const redo=await capture();
   const pp=F.paint.pixelPaint[0],grown=growPixelPaintToCanvas(0,pp);commitPixelPaint(0);const grow=await capture();
   await F.actions.run('layer.new');
   for(let k=0;k<500&&F.state.doc.layers.length===1;k++)await new Promise(r=>setTimeout(r,10));
   const reload=await capture();
   const idx=F.state.doc.layers.findIndex(l=>l.name==='precision'),layer=F.state.doc.layers[idx],reference=layer.nativePlanes,preview=new Uint8ClampedArray(layer.rgba);
   F.selectLayers([idx]);await F.actions.run('tool.key.B');
   const stroke=F.paint.stroke([{x:18,y:12},{x:19,y:12}],{size:3});
   const shown=F.state.doc.layers[idx].rgba,built=await F.buildPsdBuffer({fast:true}),painted=(await parsePsdRaster(built.buf,{keepNativePlanes:true,strictChannels:true})).layers.find(l=>l.name==='precision');
   let untouchedErrors=0,displayChanges=0;
   for(let i=0;i<preview.length/4;i++){
    const q=i*4;if(preview.slice(q,q+4).some((v,k)=>v!==shown[q+k]))displayChanges++;
    for(const id of Object.keys(reference).filter(id=>+id>=-1)){
     const same=+id===-1?preview[q+3]===shown[q+3]:mode===1?[0,1,2].every(c=>preview[q+c]===shown[q+c]):preview[q+(+id)]===shown[q+(+id)];
     if(same&&painted.nativePlanes[id][i]!==reference[id][i])untouchedErrors++;
    }
   }
   rows.push({depth,mode,changed,edited,undo,redo,grown,grow,reload,stroke:!!stroke,displayChanges,untouchedErrors,error:document.querySelector('#err').textContent});
  }
  return rows;
 });
 for(const row of rows){
  assert.equal(row.changed,true,JSON.stringify(row));assert.equal(row.grown,true,JSON.stringify(row));
  for(const key of ['edited','undo','redo','grow','reload'])for(const [id,n]of Object.entries(row[key].counts))assert.equal(n,0,`${row.depth}/${row.mode} ${key} channel ${id}`);
  assert.equal(row.edited.changed,true);assert.equal(row.undo.changed,false);assert.equal(row.redo.changed,true);assert.equal(row.reload.changed,true);
  assert.deepEqual(row.grow.bounds,{left:0,top:0,right:64,bottom:32});
  assert.equal(row.stroke,true);assert.ok(row.displayChanges>0);assert.equal(row.untouchedErrors,0);
  console.log(`✓ 浏览器${row.depth}位mode${row.mode}局部改写/撤销/重做/扩边/结构重载保留原样本`);
 }
}finally{await browser.close();}
