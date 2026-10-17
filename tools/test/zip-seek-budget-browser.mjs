import assert from 'node:assert/strict';
import {largeZipFixture} from './large-zip-fixture.mjs';
import {loadPlaywright} from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('Playwright required');
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const patterned of[false,true]){const bytes=await largeZipFixture(1024,20000,{compression:'zip',patterned});await page.route(`**/__seek-${+patterned}.psd`,r=>r.fulfill({body:bytes,contentType:'application/octet-stream'}));}
 await page.goto(`http://127.0.0.1:${process.argv[2]||8787}/health`);
 const result=await page.evaluate(async()=>{
  const {parsePsdFull}=await import('/core/psd-parse.js'),{createDecodePool}=await import('/core/psd-decode-worker.js');
  const {createLayerTileSession,decodeLayerJob}=await import('/core/psd-raster.js');
  const input=await Promise.all([0,1].map(async n=>{const b=new Uint8Array(await(await fetch(`/__seek-${n}.psd`)).arrayBuffer()),p=parsePsdFull(b),l=p.layers[0];let at=l.chDataStart;return l.channelLengths.map((length,i)=>{const c={id:i===3?-1:i,w:1024,h:20000,view:b.subarray(at,at+length)};at+=length;return c;});}));
  const sources=Array.from({length:8},(_,i)=>input[i%2].map(c=>({...c}))),pool=createDecodePool(1,{sourceBudget:32*1048576,rowBudget:65536,seekBudget:16*1048576}),stages=[];
  try{
   for(const chans of sources)await pool.run({width:1024,height:20000,depth:8,mode:3,previewMax:64},chans);
   const warm=pool.stats;
   for(const i of[0,7,1,6,2,5,3,4,0]){
    const y=[18432,256,10240,15360][i%4],before=pool.stats,r=await pool.run({width:1024,height:20000,depth:8,mode:3,zipTile:true,tile:{x:256,y,width:256,height:256}},sources[i]),after=pool.stats;
    const pixel=[...r.tile.data.slice((19*256+17)*4,(19*256+18)*4)],x=273,sy=y+19,want=i%2?[171,65,211].map(c=>(c+(Math.floor(x/128)%8)*7+(sy%64)*3)&255).concat(80+(sy%64)*2):[171,65,211,255];
    stages.push({source:i,pixel,want,decodedBytes:after.checkpointDecodedBytes-before.checkpointDecodedBytes,indexBytes:after.indexBytes,indexPoints:after.indexPoints,workingBytes:after.indexWorkingBytes});
   }
   const final=pool.stats;await pool.clearSources();
   const transient=createDecodePool(1,{sourceBudget:1,rowBudget:65536,seekBudget:4*1048576});let oversized;
   try{
    await transient.run({width:1024,height:20000,depth:8,mode:3,previewMax:64},sources[1]);const preview=transient.stats,reads=[];
    for(const y of[18432,256]){
     const before=transient.stats,r=await transient.run({width:1024,height:20000,depth:8,mode:3,zipTile:true,tile:{x:256,y,width:256,height:256}},sources[1]),after=transient.stats;
     reads.push({y,pixel:[...r.tile.data.slice((19*256+17)*4,(19*256+18)*4)],decodedBytes:after.checkpointDecodedBytes-before.checkpointDecodedBytes,sourceBytes:after.sourceBytes,indexBytes:after.indexBytes,indexSources:after.indexSources});
    }
    oversized={preview,reads,final:transient.stats};await transient.clearSources();oversized.cleared=transient.stats;
   }finally{transient.terminate();}
   window.__seekDetached=await(async()=>{
    const own=input[1].map(c=>({id:c.id,w:c.w,h:c.h,bytes:c.view.slice()})),weak=own.map(c=>new WeakRef(c.bytes.buffer)),session=createLayerTileSession(own,{seekBudget:4*1048576});
    await decodeLayerJob({width:1024,height:20000,mode:3,depth:8,previewMax:64,chans:own},session);
    if(!session.detachInput())throw new Error('large ZIP did not retain independent checkpoints');return {weak,session};
   })();
   return {warm,stages,final,cleared:pool.stats,oversized};
  }finally{pool.terminate();}
 });
 assert.equal(result.warm.sources,8);assert.equal(result.final.sourceTransfers,8);
 assert.equal(result.warm.rowsRead,8*20000*4);assert.equal(result.warm.checkpointDecodedBytes,8*1024*20000*4);
 for(const s of result.stages){assert.deepEqual(s.pixel,s.want);assert.ok(s.indexBytes<=16*1048576);assert.ok(s.workingBytes<=2*1048576);assert.ok(s.decodedBytes<32*1048576,JSON.stringify(s));}
 assert.equal(result.cleared.indexBytes,0);assert.equal(result.cleared.indexWorkingBytes,0);assert.equal(result.cleared.sourceBytes,0);assert.deepEqual(errors,[]);
 assert.ok(result.oversized.preview.indexBytes>0);assert.equal(result.oversized.preview.sourceBytes,0);assert.equal(result.oversized.final.sourceTransfers,3);
 for(const r of result.oversized.reads){assert.ok(r.decodedBytes<32*1048576);assert.equal(r.sourceBytes,0);assert.ok(r.indexBytes>0);assert.equal(r.indexSources,1);const y=r.y+19;assert.deepEqual(r.pixel,[171,65,211].map(c=>(c+14+(y%64)*3)&255).concat(80+(y%64)*2));}
 assert.equal(result.oversized.cleared.indexBytes,0);
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');await cdp.detach();
 const released=await page.evaluate(()=>{const v=window.__seekDetached,out={indexBytes:v.session.indexBytes,released:v.weak.every(r=>!r.deref())};v.session.close();delete window.__seekDetached;return out;});assert.ok(released.indexBytes>0&&released.released,JSON.stringify(released));
 console.log(JSON.stringify(result.stages));console.log('✓ 8 个大 ZIP 来源共享检查点预算、保留稀疏索引、工作游标回收与往返定位，无整源重新扫描');
}finally{await browser.close();}
