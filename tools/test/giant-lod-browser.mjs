import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('Playwright required');
const square=process.env.PSD_EDITOR_GIANT_SHAPE==='square',width=square?60000:10000,height=square?50000:300000,scale=square?16:64;
const sampleX=Math.floor(width/2/scale)*scale,sampleY=Math.floor(height/2/scale)*scale,cell=256*scale;
const centerKey=`${Math.floor(width/2/cell)*cell}:${Math.floor(height/2/cell)*cell}`;
let fixture;
const fixtureServer=createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url==='/health'){res.end('fixture-ok');return;}
  if(!fixture){res.statusCode=503;res.end();return;}
  res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',fixture.length);
  Readable.from((function*(){for(let o=0;o<fixture.length;o+=65536)yield fixture.subarray(o,Math.min(fixture.length,o+65536));})()).pipe(res);
});
fixtureServer.listen(0,'127.0.0.1');await once(fixtureServer,'listening');
const fixtureURL=`http://127.0.0.1:${fixtureServer.address().port}`;
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.PSD_EDITOR_PERF_NATIVE_GPU==='1'?[]:WEBGPU_ARGS});
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.route('**/__giant-health',route=>route.continue({url:fixtureURL+'/health'}));
  await page.route('**/__giant.psb',route=>route.continue({url:fixtureURL+'/file'}));
  await page.goto(`http://127.0.0.1:${process.argv[2]||8787}/editor`);await page.waitForFunction(()=>window.__psd_editor?.decode);
  assert.equal(await page.evaluate(async()=>await(await fetch('/__giant-health')).text()),'fixture-ok','streamed fixture transport failed');
  console.log(`Encoding real ${width}×${height} RLE PSB with bounded zlib blocks…`);
  const generated=performance.now();fixture=await largeZipFixture(width,height,{patterned:true,compression:'rle'});
  console.log(JSON.stringify({fixtureBytes:fixture.length,encodeMs:performance.now()-generated}));
  const opened=await page.evaluate(async scale=>{
    const A=window.__psd_editor,start=performance.now(),blob=await(await fetch('/__giant.psb')).blob();
    const ok=await A.loadPsd(new File([blob],'three-billion.psb'));
    window.__giantGPUErrors=[];A.gpu.G.gc.device.addEventListener('uncapturederror',e=>{window.__giantGPUErrors.push(e.error.message);e.preventDefault();});
    const p=A.state.doc.layers[0].lazyPreview;
    window.__giantLongTasks=[];
    if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{for(const e of list.getEntries())window.__giantLongTasks.push({start:e.startTime,duration:e.duration});}).observe({entryTypes:['longtask']});
    window.__giantLODStart=performance.now();A.view.setZoom(1/scale);
    return {ok,openMs:performance.now()-start,width:A.state.doc.width,height:A.state.doc.height,lazy:!A.state.doc.layers[0].rgba,preview:[p.width,p.height]};
  },scale);
  assert.ok(opened.ok&&opened.lazy);assert.deepEqual([opened.width,opened.height],[width,height]);
  await page.waitForFunction(({scale,centerKey})=>{
    const A=window.__psd_editor,l=A.state.doc.layers[0],s=A.decode.status(),m=l.lazyGpuDetail?.levels?.get(scale);
    return m?.tiles.has(centerKey)&&s&&!s.pending&&!s.queued&&!s.lodJobs&&!s.lodQueued&&s.tiles.wanted>0&&s.tiles.residentWanted===s.tiles.wanted;
  },{scale,centerKey},{timeout:180000});
  const result=await page.evaluate(async({scale,sampleX,sampleY})=>{
    const A=window.__psd_editor,G=A.gpu.G;A.gpu.frame();await A.gpu.flush();
    const readyMs=performance.now()-window.__giantLODStart,px=await G.gc.renderToRGBA(G.drawList,{W:8,H:8,s:1/scale,tx:-sampleX/scale,ty:-sampleY/scale});
    let maxError=0;
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sums=[0,0,0,0];
      for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
        const sx=sampleX+x*scale+dx,sy=sampleY+y*scale+dy,a=80+(sy%64)*2;
        for(let c=0;c<3;c++)sums[c]+=(([171,65,211][c]+(Math.floor(sx/128)%8)*7+(sy%64)*3)&255)*a;
        sums[3]+=a;
      }
      const expected=[...sums.slice(0,3).map(v=>Math.round(v/sums[3])),Math.round(sums[3]/(scale*scale))],o=(y*8+x)*4;
      for(let c=0;c<4;c++)maxError=Math.max(maxError,Math.abs(px[o+c]-expected[c]));
    }
    A.gpu.frame();await A.gpu.flush();
    const before=A.decode.status(),upload=G.gc.stats.uploadPx,builds=G.drawListBuilds,frames=[],inputs=[],queueBefore=G.frameQueue.stats;
    for(let i=0;i<60;i++){const t=performance.now();A.view.wheel(i%2?-2:2);inputs.push({start:t,id:G.frameQueue.stats.requested});await new Promise(r=>requestAnimationFrame(r));frames.push(performance.now()-t);}
    await A.gpu.flush();frames.sort((a,b)=>a-b);
    const queue=G.frameQueue.stats,done=inputs.map(f=>{const d=queue.latencies.find(s=>s.id>=f.id);return d?d.completedAt-f.start:null;});const sorted=done.filter(v=>v!=null).sort((a,b)=>a-b);
    return {readyMs,maxError,before,after:A.decode.status(),gpu:A.gpu.active(),gpuName:G.name,cpuFrames:G.cpuFrames||0,completion:done,inputStateDoneMedianMs:sorted[Math.floor(sorted.length/2)],inputStateDoneP95Ms:sorted[Math.ceil(sorted.length*.95)-1],
      queue:{peak:queue.maxObservedInFlight,limit:queue.limit,inFlight:queue.inFlight,submitted:queue.submitted-queueBefore.submitted,coalesced:queue.coalesced-queueBefore.coalesced},
      uploadBefore:upload,uploadAfter:G.gc.stats.uploadPx,buildsBefore:builds,buildsAfter:G.drawListBuilds,virtualTiles:G.gc.stats.virtualTiles,ops:G.gc.stats.ops,
      medianMs:frames[Math.floor(frames.length/2)],p95Ms:frames[Math.ceil(frames.length*.95)-1],maxMs:frames.at(-1),longTasks:window.__giantLongTasks,
      scratch:[...A.viewScratch].map(([id,c])=>[id,c.width,c.height]),gpuErrors:window.__giantGPUErrors.slice()};
  },{scale,sampleX,sampleY});
  assert.equal(result.gpu,true);assert.equal(result.cpuFrames,0);assert.ok(result.maxError<=1,JSON.stringify(result));
  assert.ok(result.after.lodBands>0);assert.equal(result.after.sourceBytes,0,'oversized RLE sources should travel as ROI strips');
  assert.equal(result.after.lodAccumulatorBytes,0);assert.equal(result.after.jobs,result.before.jobs);assert.equal(result.uploadAfter,result.uploadBefore);assert.equal(result.buildsAfter,result.buildsBefore);
  assert.ok(result.completion.every(v=>v!=null));assert.ok(result.queue.peak<=result.queue.limit);assert.equal(result.queue.inFlight,0);
  assert.ok(result.after.tiles.bytes<=result.after.tiles.budget);assert.ok(result.scratch.every(([,w,h])=>w*h<=1200*800));assert.deepEqual(result.gpuErrors,[]);assert.deepEqual(errors,[]);
  let edit=null;
  if(process.env.PSD_EDITOR_GIANT_EDIT==='1'){
    await page.evaluate(()=>{const A=window.__psd_editor;A.selectLayers([0]);A.actions.run('tool.key.B');A.paint.setColors([255,0,0]);A.view.setZoom(1);});
    await page.waitForFunction(()=>{const s=window.__psd_editor.decode.status();return s&&!s.pending&&!s.queued&&s.tiles.residentWanted===s.tiles.wanted;},null,{timeout:90000});
    edit=await page.evaluate(async({x,y})=>{
      const A=window.__psd_editor;await A.gpu.flush();
      const at=async()=>{A.gpu.frame();await A.gpu.flush();const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-x,ty:-y});A.gpu.frame();await A.gpu.flush();return [...p];};
      const before=await at(),start=performance.now();await A.paint.stroke([{x,y}],{size:24,hardness:1,plain:true,noSel:true});const strokeMs=performance.now()-start,after=await at();
      const store=A.paint.pixelPaint[0].sparse,entry=A.paint.history.undo.at(-1),stats=store.stats,historyBytes=entry.patches.reduce((n,p)=>n+p.before.byteLength+p.after.byteLength,0);
      await A.paint.undo();const undone=await at();await A.paint.redo();const redone=await at();
      const saveStart=performance.now(),saved=await A.buildPsdBuffer();window.__giantSaved=saved.buf;
      const saveMs=performance.now()-saveStart,b=new DataView(saved.buf),psb=b.getUint16(4)===2,cb=psb?4:2,w=b.getUint32(18),h=b.getUint32(14);
      let o=26;o+=4+b.getUint32(o);o+=4+b.getUint32(o);const n=psb?b.getUint32(o)*4294967296+b.getUint32(o+4):b.getUint32(o);o+=(psb?8:4)+n;
      const counts=o+2,body=counts+4*h*cb,count=(c,yy)=>psb?b.getUint32(counts+(c*h+yy)*4):b.getUint16(counts+(c*h+yy)*2),mergedPixel=[];
      for(let c=0;c<4;c++){
        let at=body;for(let k=0;k<c;k++)for(let yy=0;yy<h;yy++)at+=count(k,yy);for(let yy=0;yy<y;yy++)at+=count(c,yy);
        let xx=0,i=at;while(xx<=x){const p=b.getUint8(i++);if(p===128)continue;if(p<128){if(x<xx+p+1){mergedPixel.push(b.getUint8(i+x-xx));break;}i+=p+1;xx+=p+1;}else{const v=b.getUint8(i++),len=257-p;if(x<xx+len){mergedPixel.push(v);break;}xx+=len;}}
      }
      return {before,after,undone,redone,strokeMs,stats,historyBytes,saveMs,saveBytes:saved.buf.byteLength,mergedPixel,composite:saved.notes.composite,tiled:saved.notes.tiled,lazy:!A.state.doc.layers[0].rgba,dimensions:[w,h]};
    },{x:Math.floor(width/2),y:Math.floor(height/2)});
    assert.deepEqual(edit.after,[255,0,0,255]);assert.deepEqual(edit.undone,edit.before);assert.deepEqual(edit.redone,edit.after);assert.deepEqual(edit.mergedPixel,edit.after);
    assert.equal(edit.lazy,true);assert.equal(edit.composite,true);assert.ok(edit.stats.editedBytes<=4*256*256*4);assert.ok(edit.historyBytes<65536);assert.deepEqual(edit.dimensions,[width,height]);
  }
  const closed=await page.evaluate(async()=>{const A=window.__psd_editor;window.__giantWeak={doc:new WeakRef(A.state.doc),buffer:new WeakRef(A.state.origBuffer)};const ok=await A.docs.closeView(A.docs.list().find(v=>v.active).view,{discard:true});await new Promise(r=>requestAnimationFrame(r));await new Promise(r=>requestAnimationFrame(r));return {ok,tiles:A.decode.status().tiles};});
  assert.ok(closed.ok);assert.equal(closed.tiles.bytes,0);
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');await cdp.detach();
  const released=await page.evaluate(()=>({doc:!window.__giantWeak.doc.deref(),buffer:!window.__giantWeak.buffer.deref()}));assert.deepEqual(released,{doc:true,buffer:true});
  if(edit){
    edit.reopened=await page.evaluate(async({x,y})=>{const A=window.__psd_editor;await A.docs.openBuffer(window.__giantSaved,'edited-roundtrip.psb');const noOverlay=!A.paint.pixelPaint[0];await A.decode.tile(0,Math.floor(x/256)*256,Math.floor(y/256)*256);A.gpu.frame();await A.gpu.flush();const p=await A.gpu.G.gc.renderToRGBA(A.gpu.G.drawList,{W:1,H:1,s:1,tx:-x,ty:-y});return {pixel:[...p],noOverlay,lazy:!A.state.doc.layers[0].rgba};},{x:Math.floor(width/2),y:Math.floor(height/2)});
    assert.deepEqual(edit.reopened.pixel,edit.after);assert.ok(edit.reopened.noOverlay&&edit.reopened.lazy);
  }
  assert.deepEqual(errors,[]);
  const report={width,height,scale,pixels:width*height,fileBytes:fixture.length,fixture:'generated one-layer patterned RLE PSB with varying alpha',build:process.env.PSD_EDITOR_TEST_DIST==='1'?'dist':'source',browser:await browser.version(),opened,...result,edit,closed,released};
  if(process.env.PSD_EDITOR_PERF_REPORT)await writeFile(process.env.PSD_EDITOR_PERF_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));console.log(`✓ 实际 30 亿像素 PSB：打开、1/${scale} LOD、条带 ROI、热平移与关闭回收`);
}finally{await browser.close();await new Promise(r=>fixtureServer.close(r));}
