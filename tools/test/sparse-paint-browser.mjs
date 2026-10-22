import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright,WEBGPU_ARGS } from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('Playwright required');
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.PSD_EDITOR_PERF_NATIVE_GPU==='1'?[]:WEBGPU_ARGS});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 const fixture=await largeZipFixture(9390,30000,{compression:process.env.PSD_EDITOR_PERF_COMPRESSION||'rle',patterned:true});
 await page.route('**/__sparse.psd',r=>r.fulfill({body:fixture,contentType:'application/octet-stream'}));
 await page.goto(`http://127.0.0.1:${process.argv[2]||8787}/editor`);await page.waitForFunction(()=>window.__psd_editor?.paint);
 await page.waitForFunction(()=>window.__psd_editor.hx?.createSnapshot);
 const out=await page.evaluate(async()=>{
  const A=window.__psd_editor,blob=await(await fetch('/__sparse.psd')).blob();await A.loadPsd(new File([blob],'sparse.psd'));
  A.selectLayers([0]);A.actions.run('tool.key.B');A.paint.setColors([255,0,0]);A.view.setZoom(1);
  await A.decode.tile(0,4608,14848);
  const at=async()=>{await A.gpu.flush();const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4608,ty:-14848});A.gpu.frame();await A.gpu.flush();return [...p];};
  const noop=await A.buildPsdBuffer();if(noop.buf!==A.state.origBuffer)throw new Error('unchanged large save expanded the source');
  const before=await at(),start=performance.now();
  const rect=await A.paint.stroke([{x:4608,y:14848},{x:4618,y:14858}],{size:48,hardness:1,plain:true,noSel:true});
  const ms=performance.now()-start,painted=await at(),pp=A.paint.pixelPaint[0],entry=A.paint.history.undo.at(-1);
  const stats=pp.sparse.stats,patches=entry.patches.map(p=>({before:p.before.byteLength,after:p.after.byteLength}));
  await A.actions.run('edit.undo');const undone=await at();await A.actions.run('edit.redo');const redone=await at();
  
  
  A.gpu.G.snap=null;
  const redSnap=await A.hx.createSnapshot({name:'red state',quiet:true,deferThumb:true});
  A.paint.setColors([0,255,0]);await A.paint.stroke([{x:4608,y:14848}],{size:20,hardness:1,plain:true,noSel:true});
  const greenSnap=await A.hx.createSnapshot({name:'green state',quiet:true,deferThumb:true});
  A.hx.gotoSnapshot(redSnap);const snapshotRed=await at();A.hx.gotoSnapshot(greenSnap);const snapshotGreen=await at();A.hx.gotoSnapshot(redSnap);const snapshotRedAgain=await at();
  
  
  A.paint.setColors([0,0,255]);const pending=A.paint.stroke([{x:4608,y:14848}],{size:20,hardness:1,plain:true,noSel:true});
  A.actions.run('edit.undo');await A.lastAction;await pending;const immediateUndo=await at();
  const zoomed=[];for(const zoom of[.5,.25,.125]){A.view.setZoom(zoom);A.gpu.frame();await A.gpu.flush();zoomed.push([...await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:zoom,tx:-4608*zoom,ty:-14848*zoom})]);}
  A.view.setZoom(1);await A.paint.stroke([{x:4608,y:14848}],{size:20,hardness:1,plain:true,noSel:true,erase:true});const erased=await at();await A.paint.undo();const restored=await at();
  A.layers.render();const thumb=A.layers.row(0).querySelector('.thumb canvas'),tx=Math.floor(thumb.width/2),ty=Math.floor(thumb.height/2),fx=A.state.doc.width/thumb.width,fy=A.state.doc.height/thumb.height;
  const thumbPixel=()=>[...A.layers.row(0).querySelector('.thumb canvas').getContext('2d').getImageData(tx,ty,1,1).data],thumbBefore=thumbPixel(),edgeAlpha=thumb.getContext('2d').getImageData(thumb.width-1,thumb.height-1,1,1).data[3];
  A.paint.setColors([7,60,220]);await A.paint.stroke([{x:(tx+.5)*fx,y:(ty+.5)*fy}],{size:Math.ceil(Math.hypot(fx,fy)*1.1),hardness:1,plain:true,noSel:true});
  const thumbPainted=thumbPixel();await A.paint.undo();const thumbUndone=thumbPixel();
  const idleStart=performance.now();while(A.decode.status().pending||A.decode.status().queued){if(performance.now()-idleStart>30000)throw new Error('source queue did not settle');await new Promise(r=>requestAnimationFrame(r));}
  const jobsBefore=A.decode.status().jobs,refining=A.decode.tile(0,6912,16896);
  await A.paint.stroke([{x:7000,y:17000}],{size:8,hardness:1,plain:true,noSel:true});await refining;
  const sharedDecodeJobs=A.decode.status().jobs-jobsBefore;await A.paint.undo();
  return {before,painted,undone,redone,snapshotRed,snapshotGreen,snapshotRedAgain,immediateUndo,zoomed,erased,restored,thumb:{before:thumbBefore,painted:thumbPainted,undone:thumbUndone,edgeAlpha},sharedDecodeJobs,rect,ms,stats,patches,lazy:!A.state.doc.layers[0].rgba,gpu:A.gpu.active(),cpu:A.gpu.G.cpuFrames||0,kind:entry.kind,err:document.querySelector('#err').textContent};
 });
 console.log(JSON.stringify(out));assert.equal(out.lazy,true);assert.equal(out.gpu,true);assert.equal(out.cpu,0);assert.equal(out.kind,'sparsePixels');assert.deepEqual(out.painted,[255,0,0,255]);
 assert.deepEqual(out.undone,out.before);assert.deepEqual(out.redone,out.painted);assert.deepEqual(out.immediateUndo,out.painted);
 assert.deepEqual(out.snapshotRed,out.painted);assert.deepEqual(out.snapshotRedAgain,out.painted);assert.deepEqual(out.snapshotGreen,[0,255,0,255]);
 assert.ok(out.zoomed.every(p=>p.every((v,i)=>Math.abs(v-out.painted[i])<=1)));assert.deepEqual(out.erased,[0,0,0,0]);assert.deepEqual(out.restored,out.painted);
 assert.deepEqual(out.thumb.painted,[7,60,220,255]);assert.deepEqual(out.thumb.undone,out.thumb.before);assert.ok(out.thumb.edgeAlpha>0,'proxy thumbnail must cover the native layer extent');
 assert.equal(out.sharedDecodeJobs,1,'display refinement and painting must share one native source decode');
 assert.ok(out.stats.editedBytes<=4*256*256*4);assert.ok(out.patches.every(p=>p.before<=256*256*4&&p.after<=256*256*4));assert.deepEqual(errors,[]);assert.equal(out.err,'');
 const mousePoint=await page.evaluate(async()=>{const A=window.__psd_editor;A.view.setZoom(1);A.paint.setColors([0,255,0]);Object.assign(A.paint.options,{size:24,hardness:1,opacity:1,flow:1,spacing:.1,dyn:null,pressureSize:false,pressureOpacity:false});A.gpu.frame();await A.gpu.flush();const g=A.gpu.G,box=g.canvas.getBoundingClientRect();return {x:box.left+(4648*g.lastView.s+g.lastView.tx)*box.width/g.canvas.width,y:box.top+(14888*g.lastView.s+g.lastView.ty)*box.height/g.canvas.height};});
 const logicalPoint=async()=>page.evaluate(async()=>{const A=window.__psd_editor;await A.gpu.flush();const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4648,ty:-14888});A.gpu.frame();await A.gpu.flush();return [...p];});
 const screenPoint=async()=>{const png=await page.screenshot({clip:{x:Math.floor(mousePoint.x)-2,y:Math.floor(mousePoint.y)-2,width:5,height:5}});return page.evaluate(async bytes=>{const b=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'})),c=document.createElement('canvas');c.width=c.height=5;const g=c.getContext('2d');g.drawImage(b,0,0);b.close();return [...g.getImageData(2,2,1,1).data];},[...png]);};
 const mouseBefore=await logicalPoint(),screenBefore=await screenPoint();await page.mouse.move(mousePoint.x,mousePoint.y);await page.mouse.down();await page.mouse.move(mousePoint.x+3,mousePoint.y+2,{steps:3});await page.mouse.up();
 await page.evaluate(async()=>{await window.__psd_editor.paint.flush();});await page.mouse.move(20,20);
 const mouseAfter=await logicalPoint();assert.deepEqual(mouseAfter,[0,255,0,255]);assert.deepEqual(await screenPoint(),mouseAfter);
 await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await page.evaluate(async()=>{await window.__psd_editor.lastAction;});
 assert.deepEqual(await logicalPoint(),mouseBefore);
 assert.deepEqual(await screenPoint(),screenBefore);

 await page.evaluate(async()=>{const A=window.__psd_editor;A.selectLayers([0]);await A.actions.run('layer.new');await A.lastAction;});
 assert.deepEqual(await logicalPoint(),mouseBefore);
 const saved=await page.evaluate(async()=>{
  const A=window.__psd_editor;
  window.showSaveFilePicker=async()=>({name:'saved-sparse.psd',createWritable:async()=>({write:async value=>{window.__sparseSaved=value;},close:async()=>{},abort:async()=>{}})});
  const undoBefore=A.paint.history.undo.length,redoBefore=A.paint.history.redo.length,start=performance.now();A.actions.run('file.saveAs');const ok=await A.lastAction,ms=performance.now()-start;
  const b=window.__sparseSaved;if(!b)return {ok,err:document.querySelector('#err').textContent};
  window.__sparseMergedPixel=async b=>{
   const {decodeCompositeImage}=await import('/core/psd-image.js'),v=new DataView(b),comp=decodeCompositeImage(b,{width:v.getUint32(18),height:v.getUint32(14),channels:v.getUint16(12),depth:v.getUint16(22),mode:v.getUint16(24),psb:v.getUint16(4)===2});
   const x=4608,y=14848,p=comp.toRGBA(),i=(y*comp.width+x)*4,pixel=[...p.subarray(i,i+4)];
   const {parsePsdDocument,decodeLayerPixels}=await import('/core/psd-document.js'),doc=parsePsdDocument(b),baseIdx=doc.layers.findIndex(l=>l.name==='Large ZIP'),base=doc.layers[baseIdx],lp=decodeLayerPixels(doc,b,baseIdx,{strict:true}).toRGBA(),bb=base.bounds;
   const li=((y-bb.top)*bb.width+x-bb.left)*4,layerPixel=li>=0&&li+4<=lp.length?[...lp.subarray(li,li+4)]:[];
   return {pixel,layerPixel,names:doc.layers.map(l=>l.name),bounds:doc.layers.map(l=>l.bounds),baseline:[...comp.toRGBA().subarray((y*comp.width+x)*4,(y*comp.width+x)*4+4)],channels:comp.channelCount,compression:comp.compression};
  };
  const decoded=await window.__sparseMergedPixel(b),{pixel,layerPixel,names,bounds,baseline,channels,compression}=decoded;
  const {parsePsdDocument,decodeLayerPixels}=await import('/core/psd-document.js');
  const pp=A.paint.pixelPaint[0]; const sparseKeys=pp?.sparse?[...pp.sparse.tiles.keys()]:[]; const readEdited=pp?.sparse?[...await pp.sparse.readRect({x:4608,y:14848,w:1,h:1})]:[];
  return {ok,ms,bytes:b.byteLength,pixel,layerPixel,names,bounds,baseline,channels,compression,dirty:A.docs.isDirty(),undo:A.paint.history.undo.length,redo:A.paint.history.redo.length,undoBefore,redoBefore,sparseKeys,readEdited,baseLayer:A.state.doc.layers[0]&&{name:A.state.doc.layers[0].name,bounds:A.state.doc.layers[0].bounds,width:A.state.doc.layers[0].width,height:A.state.doc.layers[0].height,lazy:!!A.state.doc.layers[0].lazyRasterFile}};
 });
 console.log(JSON.stringify({saved}));assert.equal(saved.ok,true);assert.deepEqual(saved.pixel,[255,0,0,255]);assert.equal(saved.channels,4);assert.equal(saved.compression,1);assert.equal(saved.dirty,false);assert.equal(saved.undo,saved.undoBefore);assert.equal(saved.redo,saved.redoBefore);
 let concurrent=null;
 if(process.env.PSD_EDITOR_PERF_COMPRESSION==='zip'){
  concurrent=await page.evaluate(async()=>{
   const A=window.__psd_editor;let painting;
   A.paint.setColors([0,255,0]);
   const building=A.buildPsdBuffer({onSnapshot:()=>{painting=A.paint.stroke([{x:4608,y:14848}],{size:20,hardness:1,plain:true,noSel:true});}});
   const snapshot=await building;await painting;A.gpu.frame();await A.gpu.flush();
   const duringBuild=[...await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4608,ty:-14848})];
   const built=(await window.__sparseMergedPixel(snapshot.buf)).pixel;
   await A.paint.undo();
   let entered,release;const wrote=new Promise(r=>{entered=r;}),finish=new Promise(r=>{release=r;});
   window.showSaveFilePicker=async()=>({name:'saved-sparse.psd',createWritable:async()=>({write:async value=>{window.__sparseSaved=value;entered();await finish;},close:async()=>{},abort:async()=>{}})});
   A.actions.run('file.saveAs');const saving=A.lastAction;await wrote;
   await A.paint.stroke([{x:4608,y:14848}],{size:20,hardness:1,plain:true,noSel:true});
   release();const ok=await saving;A.gpu.frame();await A.gpu.flush();
   const current=[...await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4608,ty:-14848})];
   return {ok,current,built,duringBuild,saved:(await window.__sparseMergedPixel(window.__sparseSaved)).pixel,dirty:A.docs.isDirty(),err:document.querySelector('#err').textContent};
  });
  console.log(JSON.stringify({concurrent}));assert.equal(concurrent.ok,true);assert.deepEqual(concurrent.current,[0,255,0,255]);assert.deepEqual(concurrent.duringBuild,[0,255,0,255]);assert.deepEqual(concurrent.built,[255,0,0,255]);assert.deepEqual(concurrent.saved,[255,0,0,255]);assert.equal(concurrent.dirty,true);assert.equal(concurrent.err,'');
 }


 const merged=await page.evaluate(async()=>{
  const A=window.__psd_editor;A.selectLayers([0,1]);await A.actions.run('layer.merge');await A.lastAction;
  A.view.setZoom(1);A.gpu.frame();await A.gpu.flush();
  const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4608,ty:-14848});
  window.showSaveFilePicker=async()=>({name:'merged-sparse.psd',createWritable:async()=>({write:async value=>{window.__mergedSaved=value;},close:async()=>{},abort:async()=>{}})});
  A.actions.run('file.saveAs');const ok=await A.lastAction;
  let pixel=null;if(window.__mergedSaved){const {decodeCompositeImage}=await import('/core/psd-image.js'),v=new DataView(window.__mergedSaved),c=decodeCompositeImage(window.__mergedSaved,{width:v.getUint32(18),height:v.getUint32(14),channels:v.getUint16(12),depth:v.getUint16(22),mode:v.getUint16(24),psb:v.getUint16(4)===2}).toRGBA();pixel=[...c.subarray((14848*9390+4608)*4,(14848*9390+4608)*4+4)];}
  return {canvas:[...p],pixel,ok,names:A.state.doc.layers.map(l=>l.name),err:document.querySelector('#err').textContent};
 });
 console.log(JSON.stringify({merged}));
 assert.deepEqual(merged.canvas,[255,0,0,255]);assert.deepEqual(merged.pixel,[255,0,0,255]);assert.equal(merged.ok,true);assert.equal(merged.names.length,1);assert.equal(merged.err,'');
 const grouped=await page.evaluate(async()=>{
  const A=window.__psd_editor;A.selectLayers([0]);await A.actions.run('layer.group');await A.lastAction;
  A.actions.run('layer.bringToFront');await A.lastAction;
  const root=A.state.doc.layers.find(l=>l.name==='Large ZIP'),names=A.state.doc.layers.map(l=>l.name);
  const idx=A.state.doc.layers.indexOf(root),p=A.paint.pixelPaint[idx],pixel=p?.sparse?[...await p.sparse.readRect({x:4608,y:14848,w:1,h:1})]:null;
  window.showSaveFilePicker=async()=>({name:'grouped-sparse.psd',createWritable:async()=>({write:async value=>{window.__groupedSaved=value;},close:async()=>{},abort:async()=>{}})});
  A.actions.run('file.saveAs');const ok=await A.lastAction;
  let saved=null,groups=0,savedNames=[];if(window.__groupedSaved){const {decodeCompositeImage}=await import('/core/psd-image.js'),v=new DataView(window.__groupedSaved),c=decodeCompositeImage(window.__groupedSaved,{width:v.getUint32(18),height:v.getUint32(14),channels:v.getUint16(12),depth:v.getUint16(22),mode:v.getUint16(24),psb:v.getUint16(4)===2}).toRGBA();saved=[...c.subarray((14848*9390+4608)*4,(14848*9390+4608)*4+4)];const {parsePsdFull}=await import('/core/psd-parse.js'),{groupPairs}=await import('/core/psd-edit.js'),sd=parsePsdFull(window.__groupedSaved);groups=groupPairs(sd.layers).pairs.length;savedNames=sd.layers.map(l=>l.unicodeName||l.name);}
  return {names,groups,savedNames,pixel,saved,ok,err:document.querySelector('#err').textContent};
 });
 console.log(JSON.stringify({grouped}));
 assert.ok(grouped.groups>0);assert.ok(grouped.savedNames.includes('Large ZIP'));assert.deepEqual(grouped.pixel,[255,0,0,255]);assert.deepEqual(grouped.saved,[255,0,0,255]);assert.equal(grouped.ok,true);assert.equal(grouped.err,'');

 const reordered=await page.evaluate(async()=>{
  const A=window.__psd_editor;const root=A.state.doc.layers.find(l=>l.name==='Large ZIP');A.selectLayers([A.state.doc.layers.indexOf(root)]);
  await A.actions.run('layer.bringToFront');await A.lastAction;A.refreshAll(true);A.gpu.frame();await A.gpu.flush();
  const idx=A.state.doc.layers.indexOf(root),p=A.paint.pixelPaint[idx],canvas=[...await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4608,ty:-14848})],pixel=p?.sparse?[...await p.sparse.readRect({x:4608,y:14848,w:1,h:1})]:null;
  window.showSaveFilePicker=async()=>({name:'reordered-sparse.psd',createWritable:async()=>({write:async value=>{window.__reorderedSaved=value;},close:async()=>{},abort:async()=>{}})});A.actions.run('file.saveAs');const ok=await A.lastAction;
  let saved=null;if(window.__reorderedSaved){const {decodeCompositeImage}=await import('/core/psd-image.js'),v=new DataView(window.__reorderedSaved),c=decodeCompositeImage(window.__reorderedSaved,{width:v.getUint32(18),height:v.getUint32(14),channels:v.getUint16(12),depth:v.getUint16(22),mode:v.getUint16(24),psb:v.getUint16(4)===2}).toRGBA();saved=[...c.subarray((14848*9390+4608)*4,(14848*9390+4608)*4+4)];}
  return {canvas,pixel,saved,ok,err:document.querySelector('#err').textContent};
 });
 console.log(JSON.stringify({reordered}));
 assert.deepEqual(reordered.canvas,[255,0,0,255]);assert.deepEqual(reordered.pixel,[255,0,0,255]);assert.deepEqual(reordered.saved,[255,0,0,255]);assert.equal(reordered.ok,true);assert.equal(reordered.err,'');
 const reopened=await page.evaluate(async()=>{
  const A=window.__psd_editor;await A.loadPsd(new File([window.__sparseSaved],'roundtrip.psd'));
  const base=A.state.doc.layers.findIndex(l=>l.name==='Large ZIP'),paintLayer=A.state.doc.layers.findIndex(l=>l.name!=='Large ZIP');
  A.selectLayers([base]);A.view.setZoom(1);await A.decode.tile(base,4608,14848);A.gpu.frame();await A.gpu.flush();
  const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-4608,ty:-14848});
  const exported={pixel:[...p],lazy:!A.state.doc.layers[base].rgba,names:A.state.doc.layers.map(l=>l.name),base,paintLayer};
  const {parsePsdDocument,decodeLayerPixels}=await import('/core/psd-document.js');
  const raw=new Uint8Array(window.__sparseSaved),doc=parsePsdDocument(raw),bi=doc.layers.findIndex(l=>l.name==='Large ZIP'),lp=decodeLayerPixels(doc,raw,bi).toRGBA(),bb=doc.layers[bi].bounds;
  const x=4608,y=14848,li=((y-bb.top)*bb.width+x-bb.left)*4;
  return {...exported,layerPixel:li>=0&&li+4<=lp.length?[...lp.subarray(li,li+4)]:[],rawComps:raw.slice(raw.length-14)};
 });
 assert.deepEqual(reopened.pixel,[255,0,0,255]);assert.equal(reopened.lazy,true);assert.ok(reopened.paintLayer>=0,'new layer must survive save/reopen');assert.deepEqual(errors,[]);
 if(process.env.PSD_EDITOR_PERF_REPORT)await writeFile(process.env.PSD_EDITOR_PERF_REPORT,JSON.stringify({width:9390,height:30000,compression:process.env.PSD_EDITOR_PERF_COMPRESSION||'rle',build:process.env.PSD_EDITOR_TEST_DIST==='1'?'dist':'source',browser:await browser.version(),paint:out,mouse:{before:mouseBefore,after:mouseAfter,screenBefore},saved,concurrent,reopened},null,2)+'\n');
 if(process.env.PSD_EDITOR_SAVE_PATHS){const paths=process.env.PSD_EDITOR_SAVE_PATHS.split(',');
  for(let i=0;i<paths.length;i++){const key=['__sparseSaved','__mergedSaved','__groupedSaved','__reorderedSaved'][i];
   const bytes=await page.evaluate(k=>{const b=window[k];if(!b)return null;const u=b instanceof Uint8Array?b:new Uint8Array(b);let s='';for(let i=0;i<u.length;i+=65536)s+=String.fromCharCode(...u.subarray(i,i+65536));return btoa(s);},key);
   if(bytes)await writeFile(paths[i],Buffer.from(bytes,'base64'));
  }
 }
 console.log('✓ 超大图层画笔、跨瓦片像素、撤销/重做、异步落笔后立即撤销，无整层 RGBA');
}finally{await browser.close();}
