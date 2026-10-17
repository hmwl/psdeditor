import assert from 'node:assert/strict';
import {deflateSync,constants} from 'node:zlib';
import {createInflateCursor,deflateStore} from '../../core/inflate.js';
import {createZipSeekIndex} from '../../core/zip-seek-index.js';

let seed=71;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return seed>>>24;};
for(const length of[0,1,257,32767,32768,32769,200003])for(const pattern of['random','repeat','runs'])for(const options of[{level:0},{strategy:constants.Z_FIXED},{level:6}]){
  const raw=new Uint8Array(length);for(let i=0;i<length;i++)raw[i]=pattern==='random'?random():pattern==='repeat'?i%251:(i>>>7)&255;
  const bytes=new Uint8Array(deflateSync(raw,options)),cursor=createInflateCursor(bytes,{expectedSize:length}),checkpoints=[cursor.snapshot()],decoded=new Uint8Array(length);
  while(cursor.position<length){const start=cursor.position,n=Math.min(length-start,1+random()*127),out=decoded.subarray(start,start+n);assert.equal(cursor.readInto(out),out.length);checkpoints.push(cursor.snapshot());}
  cursor.finish();assert.deepEqual(decoded,raw);
  for(const cp of checkpoints.filter((_,i)=>i%Math.max(1,Math.floor(checkpoints.length/9))===0)){
    cursor.restore(cp);const tail=new Uint8Array(length-cp.position);assert.equal(cursor.readInto(tail),tail.length);cursor.finish();assert.deepEqual(tail,raw.subarray(cp.position));
  }
}

const runs=new Uint8Array(100003).fill(19),bytes=new Uint8Array(deflateSync(runs)),c=createInflateCursor(bytes,{expectedSize:runs.length});
c.readInto(new Uint8Array(37));const cp=c.snapshot();assert.ok(cp.copyLeft>0);c.readInto(new Uint8Array(51));c.restore(cp);const tail=new Uint8Array(runs.length-37);c.readInto(tail);c.finish();assert.ok(tail.every(v=>v===19));
const wrong=new Uint8Array(bytes);wrong[wrong.length-1]^=1;const broken=createInflateCursor(wrong,{expectedSize:runs.length});assert.throws(()=>{broken.readInto(new Uint8Array(runs.length));broken.finish();},/Adler/);
for(const padding of[1,2,3]){const padded=new Uint8Array(bytes.length+padding);padded.set(bytes);const cursor=createInflateCursor(padded,{expectedSize:runs.length}),out=new Uint8Array(runs.length);cursor.readInto(out);cursor.finish();assert.deepEqual(out,runs);}
for(const bad of[bytes.subarray(0,bytes.length-7),new Uint8Array([0x78,0x9c,7,0,0,0,0])])assert.throws(()=>{const q=createInflateCursor(bad,{expectedSize:runs.length});q.readInto(new Uint8Array(runs.length));q.finish();});
assert.throws(()=>createInflateCursor(bytes,{expectedSize:runs.length-1}).readInto(new Uint8Array(runs.length)),/长度/);
assert.throws(()=>createInflateCursor(bytes,{expectedSize:runs.length+1}).readInto(new Uint8Array(runs.length+1)),/长度/);
assert.throws(()=>createInflateCursor(bytes,{expectedSize:runs.length}).restore(createInflateCursor(bytes.slice(),{expectedSize:runs.length}).snapshot()),/来源/);
const stored=deflateStore(runs);const st=createInflateCursor(stored,{expectedSize:runs.length}),out=new Uint8Array(runs.length);st.readInto(out);st.finish();assert.deepEqual(out,runs);

const width=1001,height=5003,raw=new Uint8Array(width*height);for(let i=0;i<raw.length;i++)raw[i]=random();
for(const budget of[1,65536,262144,1048576]){
  const stats={},index=createZipSeekIndex(new Uint8Array(deflateSync(raw)),{width,height,budget,stats}),scratch=new Uint8Array(width*57);
  while(index.position<raw.length)index.readInto(scratch.subarray(0,Math.min(scratch.length,raw.length-index.position)));index.finish();assert.ok(index.bytes<=budget);
  for(const y of[height-9,2,2500,height-8,1]){
    index.seek(y*width);const row=new Uint8Array(width*3);index.readInto(row);assert.deepEqual(row,raw.subarray(y*width,(y+3)*width));assert.ok(index.bytes<=budget);
  }
  assert.ok(stats.checkpointRestores>0);index.clear();assert.equal(index.bytes,0);index.close();assert.throws(()=>index.readInto(new Uint8Array(1)),/关闭/);
}
{
 const index=createZipSeekIndex(new Uint8Array(deflateSync(raw)),{width,height,budget:1048576});index.seek(raw.length);index.finish();assert.ok(index.pointCount>0);
 index.setBudget(65536);assert.ok(index.bytes<=65536);index.releaseWorking();assert.equal(index.workingBytes,0);
 index.seek(2000*width);const row=new Uint8Array(width);index.readInto(row);assert.deepEqual(row,raw.subarray(2000*width,2001*width));
 index.setBudget(1);assert.equal(index.bytes,0);index.close();
}
{
 const encoded=new Uint8Array(deflateSync(raw)),stats={},index=createZipSeekIndex(encoded,{width,height,budget:1048576,stats});index.seek(raw.length);index.finish();
 const bytes=index.bytes;index.detach();assert.equal(index.bytes,bytes);assert.equal(index.workingBytes,0);assert.throws(()=>index.seek(1),/附加/);
 index.attach(encoded.slice());const before=stats.checkpointDecodedBytes;index.seek(4000*width);const row=new Uint8Array(width);index.readInto(row);assert.deepEqual(row,raw.subarray(4000*width,4001*width));assert.ok(stats.checkpointDecodedBytes-before<2*1048576);index.close();
}
if(globalThis.gc){
 let weak;const index=(()=>{const owned=new Uint8Array(deflateSync(new Uint8Array(2*1048576).fill(73)));weak=new WeakRef(owned.buffer);const i=createZipSeekIndex(owned,{width:1024,height:2048,budget:262144});i.seek(2*1048576);i.finish();i.detach();return i;})();
 for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,0));globalThis.gc();}
 assert.ok(index.bytes>0);assert.equal(weak.deref(),undefined,'retained checkpoints must not keep the detached original compressed buffer alive');index.close();
 console.log('✓ 检查点独立身份：保留索引时，脱离的原压缩 ArrayBuffer 可被 GC');
}
console.log('✓ DEFLATE 有界游标：三类块、随机分段、字典跨界、半匹配快照、校验/截断与有预算的随机定位');
