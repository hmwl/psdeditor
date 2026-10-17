import {createZipSeekIndex} from './zip-seek-index.js';



export function zipDecodeStream(bytes) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      const end = Math.min(bytes.length, offset + 65536);
      controller.enqueue(bytes.subarray(offset, end)); offset = end;
    },
  }).pipeThrough(new DecompressionStream('deflate'));
}





export function createZipLayerSession(chans, { rowBudget = 16 * 1024 * 1024, seekBudget = 0, stats = {} } = {}) {
  const readers = new Map();
  let geometry = '', closed = false;
  const count = (k,n=1) => { stats[k] = (stats[k] || 0) + n; };
  function rowReader(ch, width, height, maxRows) {
    const rows = new Map();
    let index=width*height>16*1048576&&seekBudget>=chans.length*65536?createZipSeekIndex(ch.bytes.subarray(2),{width,height,budget:Math.floor(seekBudget/chans.length),stats}):null;
    let indexStarted=false;
    let reader = null, chunk = null, offset = 0, cursor = 0;
    const comp = new DataView(ch.bytes.buffer, ch.bytes.byteOffset, ch.bytes.byteLength).getUint16(0);
    const reset = () => {
      if (reader) reader.cancel().catch(() => {});
      reader = null; chunk = null; offset = 0; cursor = 0;
    };
    async function consume(keep) {
      if(index){
        if(!indexStarted){indexStarted=true;count('streamStarts');}
        index.seek(cursor*width);const data=new Uint8Array(width);index.readInto(data);cursor++;count('rowsRead');
        if(comp===3)for(let x=1;x<width;x++)data[x]=(data[x]+data[x-1])&255;
        return keep?data:null;
      }
      if (!reader) {
        reader = zipDecodeStream(ch.bytes.subarray(2)).getReader();
        count('streamStarts');
      }
      const data = keep ? new Uint8Array(width) : null;
      let used = 0;
      while (used < width) {
        if (closed) throw new Error('ZIP 解码会话已关闭');
        if (!chunk || offset === chunk.length) {
          const part = await reader.read();
          if (part.done) throw new Error(`ZIP 通道在第 ${cursor} 行提前结束`);
          chunk = part.value; offset = 0;
        }
        const n = Math.min(width - used, chunk.length - offset);
        if (data) data.set(chunk.subarray(offset, offset + n), used);
        used += n; offset += n;
      }
      count('rowsRead'); cursor++;
      if (data && comp === 3) for (let x = 1; x < width; x++) data[x] = (data[x] + data[x - 1]) & 255;
      return data;
    }
    return {
      get bytes() { return rows.size * width; },
      get indexBytes(){return index?.bytes||0;},get indexPoints(){return index?.pointCount||0;},get indexWorkingBytes(){return index?.workingBytes||0;},
      setSeekBudget(value){
        if(!index&&value>=chans.length*65536&&width*height>16*1048576){reset();index=createZipSeekIndex(ch.bytes.subarray(2),{width,height,budget:Math.floor(value/chans.length),stats});indexStarted=false;}
        index?.setBudget(Math.floor(value/chans.length));
      },
      setMaxRows(n) { maxRows = n; while (rows.size > maxRows) rows.delete(rows.keys().next().value); },
      clear() { rows.clear(); reset();indexStarted=false; },
      clearIndex(){index?.clear();index?.releaseWorking();indexStarted=false;},
      detach(){if(!index?.bytes)return false;reset();index.detach();indexStarted=false;return true;},
      attach(bytes){index?.attach(bytes.subarray(2));indexStarted=false;},
      releaseWorking(){index?.releaseWorking();indexStarted=false;},
      close(){rows.clear();reset();index?.close();},
      async preview(pw,ph){
        if(!index)return null;
        index.seek(0);const out=new Uint8Array(pw*ph),bandRows=Math.max(1,Math.floor(1048576/width)),band=new Uint8Array(width*Math.min(height,bandRows));let py=0;
        for(let y=0;y<height;y+=bandRows){
          const h=Math.min(bandRows,height-y);index.readInto(band.subarray(0,h*width));count('rowsRead',h);
          while(py<ph){
            const sy=Math.min(height-1,Math.floor(py*height/ph));if(sy>=y+h)break;
            const row=band.subarray((sy-y)*width,(sy-y+1)*width),base=py*pw;
            if(comp===3){let prev=0,px=0;for(let x=0;x<width&&px<pw;x++){prev=(prev+row[x])&255;while(px<pw&&x>=Math.floor(px*width/pw)){out[base+px++]=prev;}}}
            else for(let px=0;px<pw;px++)out[base+px]=row[Math.min(width-1,Math.floor(px*width/pw))];
            py++;
          }
        }
        index.finish();cursor=0;indexStarted=false;return out;
      },
      async crop(x0, y0, w, h) {
        const out = new Uint8Array(w * h);
        for (let y = y0; y < y0 + h; y++) {
          let row = rows.get(y);
          if (row) { count('rowHits'); rows.delete(y); rows.set(y, row); }
          else {
            if (y < cursor) reset();
            if(index)cursor=y;else while (cursor < y) await consume(false);
            row = await consume(true);
            if (maxRows > 0) {
              rows.set(y, row);
              while (rows.size > maxRows) rows.delete(rows.keys().next().value);
            }
          }
          out.set(row.subarray(x0, x0 + w), (y - y0) * w);
        }
        
        
        if (cursor >= height) reset();
        return out;
      },
    };
  }
  return {
    get rowBytes() { let n = 0; for (const r of readers.values()) n += r.bytes; return n; },
    get indexBytes(){let n=0;for(const r of readers.values())n+=r.indexBytes;return n;},
    get indexPoints(){let n=0;for(const r of readers.values())n+=r.indexPoints;return n;},
    get indexWorkingBytes(){let n=0;for(const r of readers.values())n+=r.indexWorkingBytes;return n;},
    setSeekBudget(value){seekBudget=value;for(const r of readers.values())r.setSeekBudget(value);},
    detachInput(){
      if(!readers.size||[...readers.values()].some(r=>!r.indexBytes))return false;
      for(const r of readers.values())r.detach();for(const ch of chans)ch.bytes=null;return true;
    },
    attachInput(input){
      if(input.length!==chans.length||input.some((c,i)=>c.id!==chans[i].id||c.w!==chans[i].w||c.h!==chans[i].h))throw new Error('ZIP 检查点压缩源身份不符');
      for(let i=0;i<input.length;i++){const c=chans[i];c.bytes=input[i].bytes;readers.get(c.id)?.attach(c.bytes);}
    },
    clearIndex(){for(const r of readers.values())r.clearIndex();},
    releaseSeekWorking(){for(const r of readers.values())r.releaseWorking();},
    clearRows() { for (const r of readers.values()) r.clear(); },
    close() { closed = true; for (const r of readers.values()) r.close(); readers.clear(); },
    async preview(job){
      if(closed)throw new Error('ZIP 解码会话已关闭');
      if(job.depth!==8||!(job.previewMax>0)||job.width*job.height<=16*1048576||seekBudget<chans.length*65536||!chans.length||chans.some(ch=>ch.id < -1||ch.w!==job.width||ch.h!==job.height||ch.bytes?.length<2||![2,3].includes(new DataView(ch.bytes.buffer,ch.bytes.byteOffset,ch.bytes.byteLength).getUint16(0))))return null;
      const k=job.previewMax/Math.max(job.width,job.height);if(k>=1)return null;
      const width=Math.max(1,Math.round(job.width*k)),height=Math.max(1,Math.round(job.height*k)),planes={};
      const sig=`${job.width}:${job.height}`;if(geometry!==sig){for(const r of readers.values())r.close();readers.clear();geometry=sig;}
      for(const ch of chans){let r=readers.get(ch.id);if(!r)readers.set(ch.id,r=rowReader(ch,job.width,job.height,0));planes[ch.id]=await r.preview(width,height);}
      return {planes,width,height};
    },
    async tile(job) {
      if (closed) throw new Error('ZIP 解码会话已关闭');
      if (!job.zipTile || job.depth !== 8 || !job.tile || typeof DecompressionStream === 'undefined') return null;
      if (!chans.length || chans.some(ch => {
        if (ch.id < -1 || ch.w !== job.width || ch.h !== job.height || ch.bytes?.length < 2) return true;
        const c = new DataView(ch.bytes.buffer, ch.bytes.byteOffset, ch.bytes.byteLength).getUint16(0);
        return c !== 2 && c !== 3;
      })) return null;
      const sig = `${job.width}:${job.height}`;
      if (sig !== geometry) { for (const r of readers.values()) r.close(); readers.clear(); geometry = sig; }
      const t = job.tile, x = Math.max(0, Math.min(job.width, t.x | 0)), y = Math.max(0, Math.min(job.height, t.y | 0));
      const width = Math.max(0, Math.min(t.width | 0, job.width - x)), height = Math.max(0, Math.min(t.height | 0, job.height - y));
      if (!width || !height) throw new Error('ZIP 瓦片范围为空');
      const maxRows = t.noRowCache ? 0 : Math.max(0, Math.floor(rowBudget / (chans.length * job.width))), planes = {};
      for (const ch of chans) {
        let r = readers.get(ch.id);
        if (!r) readers.set(ch.id, r = rowReader(ch, job.width, job.height, maxRows));
        r.setMaxRows(maxRows);
        planes[ch.id] = await r.crop(x, y, width, height);
      }
      return { planes, x, y, width, height };
    },
  };
}
