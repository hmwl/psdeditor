import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { largeZipFixture } from './large-zip-fixture.mjs';
import { loadPlaywright, WEBGPU_ARGS } from './pw.mjs';
const PW = await loadPlaywright(); if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: process.env.PSD_EDITOR_PERF_NATIVE_GPU === '1' ? [] : WEBGPU_ARGS });
const dpr = Number(process.env.PSD_EDITOR_PERF_DPR) === 2 ? 2 : 1;
const reports = [];
try {
  for (const compression of process.env.PSD_EDITOR_PERF_COMPRESSION ? [process.env.PSD_EDITOR_PERF_COMPRESSION] : ['zip', 'rle']) {
    const fixture = await largeZipFixture(9390,30000,{patterned:true,compression}), page = await browser.newPage({viewport:{width:1200,height:800},deviceScaleFactor:dpr}), errors = [];
    page.on('pageerror',e=>errors.push(e.stack || e.message));
    await page.route('**/__lod.psd',route=>route.fulfill({body:fixture,contentType:'application/octet-stream'}));
    await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
    await page.waitForFunction(()=>window.__psd_editor?.decode);
    const opened = await page.evaluate(async()=>{
      const A=window.__psd_editor,blob=await(await fetch('/__lod.psd')).blob(),start=performance.now();
      const ok=await A.loadPsd(new File([blob],'lod.psd'));window.__lodErrors=[];
      A.gpu.G.gc.device.addEventListener('uncapturederror',e=>{window.__lodErrors.push(e.error.message);e.preventDefault();});
      return {ok,ms:performance.now()-start,lazy:!A.state.doc.layers[0].rgba};
    });
    assert.ok(opened.ok && opened.lazy);
    const stages=[];
    for(const [zoom,scale] of [[.5/dpr,2],[.25/dpr,4],[.125/dpr,8],[1/dpr,1]]){
      await page.evaluate(zoom=>{window.__lodStart=performance.now();window.__psd_editor.view.setZoom(zoom);},zoom);
      await page.waitForFunction(scale=>{
        const A=window.__psd_editor,s=A.decode.status(),root=A.state.doc.layers[0].lazyGpuDetail,level=scale===1?root:root?.levels?.get(scale),cell=256*scale;
        return level?.tiles.has(`${Math.floor(4695/cell)*cell}:${Math.floor(15000/cell)*cell}`)&&s&&!s.pending&&!s.queued&&!s.lodJobs&&s.tiles.wanted>0&&s.tiles.residentWanted===s.tiles.wanted;
      },scale,{timeout:90000});
      const result=await page.evaluate(async({zoom,scale,panFrames})=>{
        const A=window.__psd_editor,G=A.gpu.G; A.gpu.frame();await A.gpu.flush();
        const readyMs=performance.now()-window.__lodStart,decode=A.decode.status();
        const px=await G.gc.renderToRGBA(G.drawList,{W:32,H:32,s:1/scale,tx:-4640/scale,ty:-14976/scale});
        let colorError=0,alphaError=0;
        for(let y=0;y<32;y++)for(let x=0;x<32;x++){
          const sum=[0,0,0,0];
          for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
            const sx=4640+x*scale+dx,sy=14976+y*scale+dy,a=80+(sy%64)*2;
            for(let c=0;c<3;c++)sum[c]+=(([171,65,211][c]+(Math.floor(sx/128)%8)*7+(sy%64)*3)&255)*a;
            sum[3]+=a;
          }
          const expected=[...sum.slice(0,3).map(v=>Math.round(v/sum[3])),Math.round(sum[3]/(scale*scale))],q=(y*32+x)*4;
          alphaError=Math.max(alphaError,Math.abs(px[q+3]-expected[3]));
          for(let c=0;c<3;c++)colorError=Math.max(colorError,Math.abs(px[q+c]*px[q+3]/255-expected[c]*expected[3]/255));
        }
        A.gpu.frame();await A.gpu.flush();await new Promise(r=>requestAnimationFrame(r));
        const before=A.decode.status(),upload=G.gc.stats.uploadPx,builds=G.drawListBuilds,frames=[],inputs=[],queueBefore=G.frameQueue.stats;
        for(let i=0;i<panFrames;i++){
          const start=performance.now();A.view.wheel(0,{deltaX:i%2?-2:2});inputs.push({start,id:G.frameQueue.stats.requested});await new Promise(r=>requestAnimationFrame(r));frames.push(performance.now()-start);
        }
        await A.gpu.flush();frames.sort((a,b)=>a-b);
        const queueAfter=G.frameQueue.stats,completion=inputs.map(f=>{const done=queueAfter.latencies.find(s=>s.id>=f.id);return done?done.completedAt-f.start:null;});
        const sorted=completion.filter(v=>v!=null).sort((a,b)=>a-b);
        return {zoom,scale,readyMs,colorError,alphaError,decodeBeforeRead:decode,before,after:A.decode.status(),uploadBefore:upload,uploadAfter:G.gc.stats.uploadPx,buildsBefore:builds,buildsAfter:G.drawListBuilds,
          panMedianMs:frames[Math.floor(frames.length/2)],panP95Ms:frames[Math.ceil(frames.length*.95)-1],panMaxMs:frames.at(-1),gpu:A.gpu.active(),gpuName:G.name,cpuFrames:G.cpuFrames||0,
          inputStateDoneMedianMs:sorted[Math.floor(sorted.length/2)],inputStateDoneP95Ms:sorted[Math.ceil(sorted.length*.95)-1],completion,
          queue:{limit:queueAfter.limit,peak:queueAfter.maxObservedInFlight,requested:queueAfter.requested-queueBefore.requested,submitted:queueAfter.submitted-queueBefore.submitted,coalesced:queueAfter.coalesced-queueBefore.coalesced,inFlight:queueAfter.inFlight},
          virtualTiles:G.gc.stats.virtualTiles,ops:G.gc.stats.ops,
          levels:[A.state.doc.layers[0].lazyGpuDetail,...A.state.doc.layers[0].lazyGpuDetail.levels.values()].map(s=>({scale:s.scale||1,tiles:s.tiles.size,bytes:[...s.tiles.values()].reduce((n,t)=>n+t.data.byteLength,0)})),
          scratch:[...A.viewScratch].map(([id,c])=>[id,c.width,c.height]),gpuErrors:window.__lodErrors.slice()};
      },{zoom,scale,panFrames:Math.max(12,Math.min(120,Number(process.env.PSD_EDITOR_PERF_PAN_FRAMES)||30))});
      assert.equal(result.gpu,true);assert.equal(result.cpuFrames,0);
      assert.ok(result.colorError<=2 && result.alphaError<=1,JSON.stringify(result));
      assert.equal(result.after.jobs,result.before.jobs,'warm LOD pan redecodes');assert.equal(result.uploadAfter,result.uploadBefore,'warm LOD pan reuploads');assert.equal(result.buildsAfter,result.buildsBefore);
      assert.ok(result.after.tiles.bytes<=result.after.tiles.budget);assert.ok(result.after.lodPeakBandPixels<=262144);
      assert.ok(result.completion.every(v=>v!=null));assert.ok(result.queue.peak<=result.queue.limit);assert.equal(result.queue.inFlight,0);
      assert.ok(result.scratch.every(([,w,h])=>w*h<=1200*800));assert.deepEqual(result.gpuErrors,[]);
      stages.push(result);
    }
    assert.deepEqual(errors,[]);
    const closed=await page.evaluate(async()=>{
      const A=window.__psd_editor;window.__lodWeak={doc:new WeakRef(A.state.doc),buffer:new WeakRef(A.state.origBuffer)};
      const ok=await A.docs.closeAll();return {ok,cache:A.decode.status().tiles};
    });
    assert.equal(closed.ok,true);assert.equal(closed.cache.bytes,0);assert.equal(closed.cache.wanted,0);
    const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');await cdp.detach();
    const released=await page.evaluate(()=>({doc:!window.__lodWeak.doc.deref(),buffer:!window.__lodWeak.buffer.deref()}));
    assert.deepEqual(released,{doc:true,buffer:true});assert.deepEqual(await page.evaluate(()=>window.__lodErrors),[]);
    const report={compression,width:9390,height:30000,dpr,fileBytes:fixture.length,build:process.env.PSD_EDITOR_TEST_DIST==='1'?'dist':'source',browser:await browser.version(),fixture:'generated RGB stripes with varying alpha',opened,stages,closed,released};
    reports.push(report);console.log(JSON.stringify(report));await page.close();
  }
  if(process.env.PSD_EDITOR_PERF_REPORT)await writeFile(process.env.PSD_EDITOR_PERF_REPORT,JSON.stringify(reports,null,2)+'\n');
  console.log('✓ 实际 2.8 亿像素 ZIP/RLE 文件：50%/25%/12.5% LOD、返回原生、预乘像素及热平移缓存');
}finally{await browser.close();}
