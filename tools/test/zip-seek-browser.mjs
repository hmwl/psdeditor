import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import {largeZipFixture} from './large-zip-fixture.mjs';
import {loadPlaywright,WEBGPU_ARGS} from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('Playwright required');
const giant=process.env.PSD_EDITOR_ZIP_SEEK_GIANT==='1',width=giant?60000:9390,height=giant?50000:30000;
let fixture;
const server=createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');if(!fixture){res.statusCode=503;res.end();return;}res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',fixture.length);Readable.from((function*(){for(let at=0;at<fixture.length;at+=65536)yield fixture.subarray(at,Math.min(at+65536,fixture.length));})()).pipe(res);});
server.listen(0,'127.0.0.1');await once(server,'listening');const fixtureURL=`http://127.0.0.1:${server.address().port}/fixture`;
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.PSD_EDITOR_PERF_NATIVE_GPU==='1'?[]:WEBGPU_ARGS});
const results=[];
try{
 for(const compression of giant?['zip']:['zip','prediction']){
  console.log(`Encoding ${width}×${height} ${compression} fixture…`);fixture=await largeZipFixture(width,height,{compression,patterned:true});
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));await page.route('**/__seek.psd',r=>r.continue({url:fixtureURL}));
  await page.goto(`http://127.0.0.1:${process.argv[2]||8787}/editor`);await page.waitForFunction(()=>window.__psd_editor?.decode);
  const result=await page.evaluate(async({width,height})=>{
   const A=window.__psd_editor,start=performance.now(),blob=await(await fetch('/__seek.psd')).blob();await A.loadPsd(new File([blob],width>30000||height>30000?'seek.psb':'seek.psd'));
   const opened={ms:performance.now()-start,dimensions:[A.state.doc.width,A.state.doc.height],lazy:!A.state.doc.layers[0].rgba,status:A.decode.status()},reads=[];
   
   
   const points=width===9390?[[0,29440],[8704,256],[4352,14848],[256,29184],[4608,512]]:[[0,Math.floor((height-512)/256)*256],[Math.floor((width-512)/256)*256,256],[Math.floor(width/2/256)*256,Math.floor(height/2/256)*256],[256,Math.floor((height-1024)/256)*256],[Math.floor(width/2/256)*256,512]];
   for(const [x,y]of points){
    const before=A.decode.status(),t=performance.now();await A.decode.tile(0,x,y);const ms=performance.now()-t,after=A.decode.status();A.gpu.frame();await A.gpu.flush();
    const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:8,H:8,s:1,tx:-x-17,ty:-y-19});let maxError=0;
    for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){
     const sx=x+17+dx,sy=y+19+dy,want=[171,65,211].map(c=>(c+(Math.floor(sx/128)%8)*7+(sy%64)*3)&255).concat(80+(sy%64)*2);
     for(let c=0;c<4;c++)maxError=Math.max(maxError,Math.abs(p[(dy*8+dx)*4+c]-want[c]));
    }
    A.gpu.frame();await A.gpu.flush();reads.push({x,y,ms,maxError,decodedBytes:after.checkpointDecodedBytes-before.checkpointDecodedBytes,restores:after.checkpointRestores-before.checkpointRestores,indexBytes:after.indexBytes,indexPoints:after.indexPoints,indexWorkingBytes:after.indexWorkingBytes});
   }
   return {opened,reads,gpu:A.gpu.active(),cpu:A.gpu.G.cpuFrames||0,final:A.decode.status(),scratch:[...A.viewScratch].map(([id,c])=>[id,c.width,c.height])};
  },{width,height});
  assert.equal(result.opened.lazy,true);assert.deepEqual(result.opened.dimensions,[width,height]);assert.ok(result.opened.status.indexPoints>0);assert.equal(result.gpu,true);assert.equal(result.cpu,0);
  assert.equal(result.opened.status.rowsRead,height*4,'proxy indexing must count native rows, not scan bands');assert.equal(result.opened.status.checkpointDecodedBytes,width*height*4);
  for(const r of result.reads){assert.equal(r.maxError,0);assert.ok(r.decodedBytes<(giant?512:64)*1048576,`seek inflated too much: ${JSON.stringify(r)}`);assert.ok(r.indexBytes<=64*1048576);assert.ok(r.indexWorkingBytes<=12*1048576);}
  if(process.env.PSD_EDITOR_ZIP_SEEK_EDIT==='1'){
   result.edit=await page.evaluate(async({x,y})=>{
    const A=window.__psd_editor;A.selectLayers([0]);A.actions.run('tool.key.B');A.paint.setColors([255,0,0]);
    const at=async()=>{A.gpu.frame();await A.gpu.flush();const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-x,ty:-y});A.gpu.frame();await A.gpu.flush();return [...p];};
    const before=await at(),t=performance.now();await A.paint.stroke([{x,y}],{size:24,hardness:1,plain:true,noSel:true});const strokeMs=performance.now()-t,painted=await at();
    const stats=A.paint.pixelPaint[0].sparse.stats,historyBytes=A.paint.history.undo.at(-1).patches.reduce((n,p)=>n+p.before.byteLength+p.after.byteLength,0);
    await A.paint.undo();const undone=await at();await A.paint.redo();const redone=await at();
    const start=performance.now(),saved=await A.buildPsdBuffer();window.__zipSeekSaved=saved.buf;const saveMs=performance.now()-start,b=new DataView(saved.buf),psb=b.getUint16(4)===2,cb=psb?4:2,h=b.getUint32(14);
    let o=26;o+=4+b.getUint32(o);o+=4+b.getUint32(o);const n=psb?b.getUint32(o)*4294967296+b.getUint32(o+4):b.getUint32(o);o+=(psb?8:4)+n;
    const counts=o+2,body=counts+4*h*cb,count=(c,yy)=>psb?b.getUint32(counts+(c*h+yy)*4):b.getUint16(counts+(c*h+yy)*2),merged=[];
    for(let c=0;c<4;c++){
     let at=body;for(let k=0;k<c;k++)for(let yy=0;yy<h;yy++)at+=count(k,yy);for(let yy=0;yy<y;yy++)at+=count(c,yy);
     let xx=0,i=at;while(xx<=x){const p=b.getUint8(i++);if(p===128)continue;if(p<128){if(x<xx+p+1){merged.push(b.getUint8(i+x-xx));break;}i+=p+1;xx+=p+1;}else{const v=b.getUint8(i++),len=257-p;if(x<xx+len){merged.push(v);break;}xx+=len;}}
    }
    return {x,y,before,painted,undone,redone,strokeMs,stats,historyBytes,saveMs,saveBytes:saved.buf.byteLength,merged,composite:saved.notes.composite,lazy:!A.state.doc.layers[0].rgba};
   },{x:Math.floor(width/2),y:Math.floor(height/2)});
   const e=result.edit;assert.deepEqual(e.painted,[255,0,0,255]);assert.deepEqual(e.undone,e.before);assert.deepEqual(e.redone,e.painted);assert.deepEqual(e.merged,e.painted);assert.ok(e.composite&&e.lazy);assert.ok(e.stats.editedBytes<=4*256*256*4);assert.ok(e.historyBytes<65536);
  }
  await page.evaluate(async()=>{const A=window.__psd_editor;A.state.doc.__zipSeekClosedMarker=true;window.__seekWeak={doc:new WeakRef(A.state.doc),buffer:new WeakRef(A.state.origBuffer)};await A.docs.closeView(A.docs.list().find(v=>v.active).view,{discard:true});await new Promise(r=>requestAnimationFrame(r));await new Promise(r=>requestAnimationFrame(r));});
  await page.waitForFunction(()=>{const s=window.__psd_editor.decode.status();return !s.pending&&!s.queued&&!s.sourceBytes&&!s.indexBytes&&!s.indexWorkingBytes;});
  result.closed=await page.evaluate(()=>window.__psd_editor.decode.status());
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
  result.released=await page.evaluate(()=>({doc:!window.__seekWeak.doc.deref(),buffer:!window.__seekWeak.buffer.deref()}));
  if((!result.released.doc||!result.released.buffer)&&process.env.PSD_EDITOR_HEAP_REPORT){const chunks=[];cdp.on('HeapProfiler.addHeapSnapshotChunk',e=>chunks.push(e.chunk));await cdp.send('HeapProfiler.takeHeapSnapshot');await writeFile(process.env.PSD_EDITOR_HEAP_REPORT,chunks.join(''));}
  await cdp.detach();assert.deepEqual(result.released,{doc:true,buffer:true});
  if(result.edit){
   result.edit.reopened=await page.evaluate(async({x,y})=>{const A=window.__psd_editor;await A.docs.openBuffer(window.__zipSeekSaved,'zip-edited-roundtrip.psb');await A.decode.tile(0,Math.floor(x/256)*256,Math.floor(y/256)*256);A.gpu.frame();await A.gpu.flush();const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-x,ty:-y});return {pixel:[...p],lazy:!A.state.doc.layers[0].rgba,noOverlay:!A.paint.pixelPaint[0]};},result.edit);
   assert.deepEqual(result.edit.reopened.pixel,result.edit.painted);assert.ok(result.edit.reopened.lazy&&result.edit.reopened.noOverlay);
  }
  assert.deepEqual(errors,[]);results.push({width,height,fileBytes:fixture.length,compression,build:process.env.PSD_EDITOR_TEST_DIST==='1'?'dist':'source',browser:await browser.version(),...result});console.log(JSON.stringify({compression,openedMs:result.opened.ms,reads:result.reads}));await page.close();
 }
 if(process.env.PSD_EDITOR_PERF_REPORT)await writeFile(process.env.PSD_EDITOR_PERF_REPORT,JSON.stringify(results,null,2)+'\n');
 console.log(`✓ 实际 ${width}×${height} ZIP 的全源检查点、远距离随机读取、逐点原生对拍与有界内存`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
