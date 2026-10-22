import assert from 'node:assert/strict';
import { createSparsePixels } from '../../core/sparse-pixels.js';
let reads=0;
const model=createSparsePixels({width:60000,height:50000,cacheTiles:2,readTile:async(x,y,w,h)=>{reads++;const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([x%255,y%255,90,128],i);return data;}});
const tx=model.begin(),rect={x:29990,y:24990,w:30,h:30};await tx.prepare(rect);
for(const c of tx.contexts(rect)){
  const x=Math.max(0,30000-c.x),y=Math.max(0,25000-c.y);if(x>=c.width||y>=c.height)continue;
  c.rgba.set([255,0,0,255],(y*c.width+x)*4);tx.dirty(c.key,{x0:x,y0:y,x1:x,y1:y});
}
const patches=tx.finish();assert.equal(patches.length,1);assert.equal(patches[0].before.length,4);assert.equal(patches[0].after.length,4);
assert.equal(model.tiles.size,1);assert.equal(model.stats.editedBytes,256*256*4);assert.ok(model.stats.cacheBytes<=2*256*256*4);
const saved=model.fork(),originalPixel=patches[0].before;
assert.deepEqual(await model.readRect({x:30000,y:25000,w:1,h:1}),new Uint8ClampedArray([255,0,0,255]));
model.apply(patches,'before');assert.equal(model.tiles.size,0);model.apply(patches,'after');assert.equal(model.tiles.size,1);
const tx2=model.begin();await tx2.prepare({x:30000,y:25000,w:1,h:1});tx2.rgba.set([0,255,0,255],(25000*60000+30000)*4);const second=tx2.finish();
assert.deepEqual(await saved.readRect({x:30000,y:25000,w:1,h:1}),new Uint8ClampedArray([255,0,0,255]),'snapshots must retain the previous tile bytes');
model.apply(second,'before');assert.deepEqual(await model.readRect({x:30000,y:25000,w:1,h:1}),new Uint8ClampedArray([255,0,0,255]));
model.apply(patches,'before');assert.deepEqual(await model.readRect({x:30000,y:25000,w:1,h:1}),originalPixel);
const diag=model.begin();
for(const [x,y]of[[1,1],[59998,49998]]){await diag.prepare({x,y,w:1,h:1});diag.rgba[(y*60000+x)*4]=201;}
const distant=diag.finish();assert.equal(distant.length,2);assert.ok(distant.every(p=>p.before.byteLength===4));
assert.ok(model.stats.editedBytes<=3*256*256*4,'distant marks must not allocate their enclosing document rectangle');
const cancel=model.begin();await cancel.prepare({x:30000,y:25000,w:1,h:1});cancel.rgba[(25000*60000+30000)*4]=77;cancel.rollback();
assert.deepEqual(await model.readRect({x:30000,y:25000,w:1,h:1}),originalPixel);
assert.ok(reads>0);model.clear();assert.equal(model.stats.editedBytes,0);
const edge=createSparsePixels({width:513,height:515,tileSize:256,readTile:async(x,y,w,h)=>new Uint8ClampedArray(w*h*4)});
const edgePaint=edge.begin();await edgePaint.prepare({x:255,y:255,w:3,h:3});
for(const c of edgePaint.contexts({x:255,y:255,w:3,h:3})){
  const x=255-c.x,y=255-c.y;if(x<0||y<0||x>=c.width||y>=c.height)continue;
  const i=(y*c.width+x)*4;c.rgba[i]=200;c.rgba[i+1]=50;c.rgba[i+2]=100;c.rgba[i+3]=255;
}
edgePaint.finish();assert.deepEqual(await edge.readRect({x:255,y:255,w:1,h:1}),new Uint8ClampedArray([200,50,100,255]));
const edgeFilter=edge.begin();await edgeFilter.prepare({x:256,y:256,w:1,h:1});
for(const c of edgeFilter.contexts({x:256,y:256,w:1,h:1})){
  const x=256-c.x,y=256-c.y;if(x<0||y<0||x>=c.width||y>=c.height)continue;
  const i=(y*c.width+x)*4;c.rgba[i]=110;c.rgba[i+1]=100;c.rgba[i+2]=200;
}
edgeFilter.finish();assert.deepEqual(await edge.readRect({x:255,y:255,w:1,h:1}),new Uint8ClampedArray([200,50,100,255]));
assert.deepEqual(await edge.readRect({x:256,y:256,w:1,h:1}),new Uint8ClampedArray([110,100,200,0]));



const cached=createSparsePixels({width:512,height:512,cacheTiles:4,readTile:async(x,y,w,h)=>new Uint8ClampedArray(w*h*4)});
assert.equal((await cached.readRect({x:10,y:10,w:2,h:2})).length,16);
const cacheTx=cached.begin();cacheTx.write(0,123);const cachePatch=cacheTx.finish();
assert.equal(cachePatch.length,1);assert.equal((await cached.readRect({x:0,y:0,w:1,h:1}))[0],123);
console.log('✓ 30 亿像素稀疏修改、分块撤销、跨远距离笔迹、写时复制快照与回滚、缓存底片');
