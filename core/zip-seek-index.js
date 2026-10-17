

import {createInflateCursor} from './inflate.js';

export function createZipSeekIndex(bytes,{width,height,budget=8*1048576,stats={}}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height))throw new Error('ZIP 检查点尺寸非法');
  const identity={},encodedLength=bytes.length;
  const decoder=()=>{if(!bytes)throw new Error('ZIP 检查点需要重新附加压缩源');return createInflateCursor(bytes,{expectedSize:width*height,identity});};
  let cursor=decoder(),scratch=null;
  const initial=cursor.snapshot(),points=new Map([[0,initial]]);
  const total=width*height,maxPoints=Math.max(1,Math.floor(budget/41100));
  let span=width*Math.max(1,Math.ceil(1048576/width),Math.ceil(height/(maxPoints+1))),retained=0,closed=false;
  const count=(key,n=1)=>{stats[key]=(stats[key]||0)+n;};
  function measure(){
    const seen=new Set();let n=0;
    for(const p of points.values()){
      if(p===initial)continue;n+=128;
      for(const array of[p.window,p.litCodes,p.distCodes])if(array&&!seen.has(array.buffer)){seen.add(array.buffer);n+=array.buffer.byteLength;}
    }return n;
  }
  function checkpoint(){
    const at=cursor.position;if(at===0||at>=total||at%span||points.has(at))return;
    points.set(at,cursor.snapshot());retained=measure();
    prune();
    stats.checkpointPeakBytes=Math.max(stats.checkpointPeakBytes||0,retained);
  }
  function prune(){
    while(retained>budget){
      span*=2;
      for(const key of points.keys())if(key&&key%span){points.delete(key);count('checkpointEvictions');}
      retained=measure();
    }
  }
  function readInto(out){
    if(closed)throw new Error('ZIP 检查点已关闭');
    cursor ||= decoder();
    let offset=0;
    while(offset<out.length){
      const until=span-cursor.position%span,n=Math.min(out.length-offset,until),used=cursor.readInto(out.subarray(offset,offset+n));
      if(used!==n)throw new Error('ZIP 检查点输出提前结束');
      offset+=n;count('checkpointDecodedBytes',n);checkpoint();
    }return offset;
  }
  const api={
    get position(){return cursor?.position||0;},get bytes(){return retained;},get pointCount(){return points.size-1;},get span(){return span;},
    get workingBytes(){return (cursor?.workingBytes||0)+(scratch?.byteLength||0);},
    readInto,
    detach(){bytes=null;cursor=null;scratch=null;},
    attach(input){if(!(input instanceof Uint8Array)||input.length!==encodedLength)throw new Error('ZIP 检查点压缩源长度不符');bytes=input;cursor=null;scratch=null;},
    setBudget(value){budget=Math.max(0,Math.floor(value));prune();},
    seek(at){
      if(closed)throw new Error('ZIP 检查点已关闭');
      if(!Number.isSafeInteger(at)||at<0||at>total)throw new Error('ZIP 检查点读取越界');
      cursor ||= decoder();
      if(cursor.position===at)return;
      let best=initial;for(const p of points.values())if(p.position<=at&&p.position>best.position)best=p;
      if(cursor.position>at||cursor.position<best.position){cursor.restore(best);count('checkpointRestores');}
      if(cursor.position<at)scratch ||= new Uint8Array(Math.min(total,65536));
      while(cursor.position<at)readInto(scratch.subarray(0,Math.min(scratch.length,at-cursor.position)));
    },
    finish(){if(!cursor||closed)throw new Error('ZIP 检查点解码器未就绪');cursor.finish();},
    
    clear(){points.clear();points.set(0,initial);retained=0;},
    releaseWorking(){cursor=null;scratch=null;},
    close(){closed=true;points.clear();retained=0;cursor=null;scratch=null;bytes=null;},
  };return api;
}
