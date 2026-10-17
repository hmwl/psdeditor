


import { parsePsdFull } from './psd-parse.js';
import { packBits,unpackBits } from './psd-image.js';
import { zipDecodeStream } from './psd-zip-cache.js';
import { vconcat,padChunks,flatten } from './byte-chunks.js';
import { compositeAll } from './compose.js';

const u16=n=>{const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n&65535);return b;};
const len=(n,psb)=>{const b=new Uint8Array(psb?8:4),v=new DataView(b.buffer);if(psb){v.setUint32(0,Math.floor(n/4294967296));v.setUint32(4,n>>>0);}else{if(n>4294967295)throw new Error('PSD 长度溢出，请使用 PSB');v.setUint32(0,n);}return b;};
const yieldWork=()=>{
 if(globalThis.scheduler?.yield)return globalThis.scheduler.yield();
 if(typeof window!=='undefined'&&typeof MessageChannel!=='undefined')return new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();c.port2.close();resolve();};c.port2.postMessage(0);});
 return new Promise(r=>setTimeout(r,0));
};
function patchesByRow(tiles,channel,width,height){
 const rows=new Map();
 for(const t of tiles){
  if(!Number.isInteger(t.x)||!Number.isInteger(t.y)||t.x<0||t.y<0||t.x+t.width>width||t.y+t.height>height||t.data.length!==t.width*t.height*4)throw new Error('稀疏写回瓦片越界');
  for(let y=0;y<t.height;y++){
   let changed=!t.original;
   if(!changed)for(let x=0;x<t.width;x++){const i=(y*t.width+x)*4+channel;if(t.data[i]!==t.original[i]){changed=true;break;}}
   if(!changed)continue;
   const yy=t.y+y;let list=rows.get(yy);if(!list)rows.set(yy,list=[]);list.push({tile:t,row:y});
  }
 }
 return rows;
}
function patchRow(row,patches,c){for(const p of patches||[])for(let x=0;x<p.tile.width;x++)row[p.tile.x+x]=p.tile.data[(p.row*p.tile.width+x)*4+c];return row;}
function channelSource(view,width,height,psb,defaultValue=0){
 const comp=view?new DataView(view.buffer,view.byteOffset,view.byteLength).getUint16(0):0,cb=psb?4:2;
 let reader,chunk,position=0,cursor=0,offset=2+height*cb;
 const dv=view?new DataView(view.buffer,view.byteOffset,view.byteLength):null;
 function rleCount(y){return psb?dv.getUint32(2+y*4):dv.getUint16(2+y*2);}
 return {view,comp,cb,rleCount,defaultValue,
  async row(y){
   if(!view)return new Uint8Array(width).fill(defaultValue);
   if(comp===0)return view.subarray(2+y*width,2+(y+1)*width);
   if(comp===1){
    if(y<cursor){cursor=0;offset=2+height*cb;}
    while(cursor<y)offset+=rleCount(cursor++);
    const n=rleCount(y),out=new Uint8Array(width);unpackBits(view.subarray(offset,offset+n),out,0,width,true);return out;
   }
   if(comp!==2&&comp!==3)throw new Error('不支持的稀疏写回压缩类型');
   if(y<cursor)throw new Error('ZIP 写回必须按行前进');
   if(!reader)reader=zipDecodeStream(view.subarray(2)).getReader();
   let out;
   while(cursor<=y){
    out=new Uint8Array(width);let used=0;
    while(used<width){if(!chunk||position===chunk.length){const p=await reader.read();if(p.done)throw new Error('ZIP 像素行提前结束');chunk=p.value;position=0;}
     const n=Math.min(width-used,chunk.length-position);out.set(chunk.subarray(position,position+n),used);used+=n;position+=n;
    }
    if(comp===3)for(let x=1;x<width;x++)out[x]=(out[x]+out[x-1])&255;
    cursor++;
   }return out;
  },
  close(){reader?.cancel().catch(()=>{});reader=null;chunk=null;},
 };
}
async function encodePatched(source,width,height,psb,rows,channel){
 const cb=psb?4:2,header=new Uint8Array(2+height*cb),dv=new DataView(header.buffer);dv.setUint16(0,1);
 const count=(y,n)=>{if(!psb&&n>65535)throw new Error('PSD RLE 行长度溢出');if(psb)dv.setUint32(2+y*4,n);else dv.setUint16(2+y*2,n);};
 const parts=[];
 if(!source.view&&!rows.size){
  const packed=packBits(new Uint8Array(width).fill(source.defaultValue)).slice();
  for(let y=0;y<height;y++){count(y,packed.length);parts.push(packed);}
  return {header,parts,bytes:vconcat([header,...parts])};
 }
 if(source.view&&source.comp===1){
  header.set(source.view.subarray(0,header.length));let offset=header.length,start=offset;
  for(let y=0;y<height;y++){
   const size=source.rleCount(y),p=rows.get(y);
   if(p){
    if(start<offset)parts.push(source.view.subarray(start,offset));
    const raw=new Uint8Array(width);unpackBits(source.view.subarray(offset,offset+size),raw,0,width,true);patchRow(raw,p,channel);
    const packed=packBits(raw).slice();parts.push(packed);count(y,packed.length);start=offset+size;
   }offset+=size;
  }
  if(start<offset)parts.push(source.view.subarray(start,offset));
 }else{
  const stride=Math.max(1,Math.floor(1048576/Math.max(1,width)));
  for(let y=0;y<height;y++){
   let raw=await source.row(y);if(rows.has(y))raw=patchRow(new Uint8Array(raw),rows.get(y),channel);
   const packed=packBits(raw).slice();parts.push(packed);count(y,packed.length);
   if(y%stride===stride-1)await yieldWork();
  }
 }
 return {header,parts,bytes:vconcat([header,...parts])};
}
function channelsOf(src,layer,psb){
 const dv=new DataView(src.buffer,src.byteOffset,src.byteLength),out=new Map();let o=layer.chDataStart;
 for(let i=0;i<layer.channelLengths.length;i++){
  const id=dv.getInt16(layer.recordStart+18+i*(psb?10:6)),n=layer.channelLengths[i];out.set(id,src.subarray(o,o+n));o+=n;
 }return out;
}
function record(src,l,channels,psb){
 const prefix=src.subarray(l.recordStart,l.recordStart+16),tail=src.subarray(l.offBlendKey-4,l.recordEnd);
 return vconcat([prefix,u16(channels.size),...[...channels].map(([id,c])=>vconcat([u16(id),len(c.length,psb)])),tail]);
}

export async function patchPsdSparsePixels(buffer,changes,{merged=false,metadata=null}={}){
 let src=buffer instanceof ArrayBuffer?new Uint8Array(buffer):new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);if(src.byteOffset)src=src.slice();
 const p=parsePsdFull(src),h=p.header,s=p.sections;
 if(h.depth!==8||h.mode!==3)throw new Error('稀疏写回当前支持 8 位 RGB 图层');
 if(merged&&h.channels-3-(s.layerCountRaw<0?1:0)>0)throw new Error('文档含额外 Alpha 通道，尚未接入流式合成写回；编辑仍保留在当前文档中');
 const byIndex=new Map(changes.map(c=>[c.index,c.tiles])),channels=p.layers.map(l=>channelsOf(src,l,h.psb)),sourceChannels=channels.map(cs=>new Map(cs)),normalized=new Map();
 if(merged&&metadata?.some(l=>l.mask||l.vectorMask||l.effects||l.fill||l.adjustment||[1,2,3].includes(l.group?.type)))throw new Error('此超大文档的蒙版、组或效果合成尚未支持流式写回');
 if(merged&&p.layers.some(l=>l.blendKey==='diss'))throw new Error('此超大文档的溶解混合尚未支持逐行合成');
 if(merged)for(const l of p.layers)if(l.mask||l.vectorMask||l.effects||l.groupType||['SoCo','GdFl','PtFl','levl','curv'].some(k=>l.additionalKeys.includes(k)))throw new Error('此超大文档的蒙版、组或效果合成尚未支持；请先保留编辑并使用快速分层写回');
 for(const [index,tiles]of byIndex){
  const l=p.layers[index];if(!l)throw new Error('稀疏图层不存在');
  const width=l.bounds.right-l.bounds.left,height=l.bounds.bottom-l.bounds.top,cs=channels[index];
  if(l.mask||l.vectorMask)throw new Error('稀疏像素写回暂不支持带蒙版的图层');
  for(const id of [0,1,2,-1]){
   const c=id===-1?3:id,rows=patchesByRow(tiles,c,width,height),existing=cs.get(id);
   if(!existing&&!rows.size&&id===-1)continue;
   if(!rows.size&&existing&&new DataView(existing.buffer,existing.byteOffset,existing.byteLength).getUint16(0)===1)continue;
   const reader=channelSource(existing,width,height,h.psb,id===-1?255:0);
   try{const encoded=await encodePatched(reader,width,height,h.psb,rows,c);cs.set(id,encoded.bytes);normalized.set(`${index}:${id}`,encoded);}finally{reader.close();}
  }
 }
 let composite=null;
 const one=p.layers.length===1&&p.layers[0],oneMeta=metadata?.[0]||one;
 if(merged&&one&&one.bounds.left===0&&one.bounds.top===0&&one.bounds.right===h.width&&one.bounds.bottom===h.height&&one.opacity===255&&(one.fillOpacity??255)===255&&!(one.flags&2)&&!one.clipping&&['norm','pass'].includes(one.blendKey)&&!oneMeta.blendIf&&!oneMeta.knockout){
  const cs=channels[0],encoded=[];
  for(const id of [0,1,2,-1]){
   let e=normalized.get(`0:${id}`);const c=cs.get(id);
   if(!e&&c instanceof Uint8Array&&new DataView(c.buffer,c.byteOffset,c.byteLength).getUint16(0)===1){const n=2+h.height*(h.psb?4:2);e={header:c.subarray(0,n),parts:[c.subarray(n)]};}
   if(!e){const reader=channelSource(c instanceof Uint8Array?c:null,h.width,h.height,h.psb,id===-1?255:0);try{e=await encodePatched(reader,h.width,h.height,h.psb,new Map(),id===-1?3:id);}finally{reader.close();}}
   encoded.push(e);
  }
  composite=vconcat([u16(1),...encoded.map(e=>e.header.subarray(2)),...encoded.flatMap(e=>e.parts)]);
 }else if(merged){
  
  
  const cb=h.psb?4:2,tables=Array.from({length:4},()=>new Uint8Array(h.height*cb)),parts=Array.from({length:4},()=>[]);
  const readers=p.layers.map((l,i)=>{const w=l.bounds.right-l.bounds.left,hh=l.bounds.bottom-l.bounds.top;return [0,1,2,-1].map(id=>channelSource(sourceChannels[i].get(id),w,hh,h.psb,id===-1?255:0));});
  
  
  const rowEdits=p.layers.map((l,i)=>[0,1,2,3].map(c=>patchesByRow(byIndex.get(i)||[],c,l.bounds.right-l.bounds.left,l.bounds.bottom-l.bounds.top)));
  try{
   for(let y=0;y<h.height;y++){
    const layers=[];
    for(let i=0;i<p.layers.length;i++){
     const l=p.layers[i],w=l.bounds.right-l.bounds.left,hh=l.bounds.bottom-l.bounds.top,sy=y-l.bounds.top;
     if(!w||!hh||sy<0||sy>=hh||(l.flags&2))continue;
     const rgba=new Uint8ClampedArray(w*4);
     for(let c=0;c<4;c++){
      let row=await readers[i][c].row(sy);if(rowEdits[i][c].has(sy))row=patchRow(new Uint8Array(row),rowEdits[i][c].get(sy),c);
      for(let x=0;x<w;x++)rgba[x*4+c]=row[x];
     }
     layers.push({...metadata?.[i],width:w,height:1,bounds:{left:l.bounds.left,top:0,right:l.bounds.right,bottom:1},rgba,opacity:l.opacity,fillOpacity:l.fillOpacity??255,blendMode:l.blendKey,clipping:l.clipping});
    }
    const rgba=compositeAll({width:h.width,height:1,layers},h.width,1,new Map()).data;
    for(let c=0;c<4;c++){
     const row=new Uint8Array(h.width);for(let x=0;x<h.width;x++)row[x]=rgba[x*4+c];
     const packed=packBits(row).slice(),v=new DataView(tables[c].buffer);if(h.psb)v.setUint32(y*4,packed.length);else v.setUint16(y*2,packed.length);parts[c].push(packed);
    }
    await yieldWork();
   }
  }finally{for(const r of readers.flat())r.close();}
  composite=vconcat([u16(1),...tables,...parts.flat()]);
 }
 const records=p.layers.map((l,i)=>byIndex.has(i)?record(src,l,channels[i],h.psb):src.subarray(l.recordStart,l.recordEnd));
 const count=merged?-p.layers.length:s.layerCountRaw;
 const li=padChunks(vconcat([u16(count),...records,...channels.flatMap(cs=>[...cs.values()])]),4);
 const lmi=vconcat([len(li.length,h.psb),li,src.subarray(s.layerInfoEndAbs,s.lmiEndAbs)]);
 let prefix=src.subarray(0,s.lmiLenOffset);
 if(merged){prefix=prefix.slice();new DataView(prefix.buffer).setUint16(12,4);}
 const result=flatten(vconcat([prefix,len(lmi.length,h.psb),lmi,composite||src.subarray(s.lmiEndAbs)]));
 return {buffer:result.buffer,composite:!!composite};
}
