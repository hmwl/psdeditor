


const equal = (a,b) => a.length === b.length && a.every((v,i)=>v===b[i]);
const bytes = value => {if(!(value>0))return 0;if(value>=255)return 255;const n=Math.floor(value),d=value-n;return d>.5||d===.5&&n%2?n+1:n;};
const numberKey = key => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1;
export function virtualArray(length, get, set = null, extra = null) {
  const target = { length };
  if (extra) Object.assign(target, extra);
  return new Proxy(target, {
    get(target,key) {
      if(key==='length')return length;
      if(key==='subarray'||key==='slice')return(start=0,end=length)=>{
        start=Math.max(0,start<0?length+start:start);end=Math.min(length,end<0?length+end:end);
        if(end-start>16*1048576)throw new Error('请按局部矩形读取稀疏像素');
        const out=new Uint8ClampedArray(Math.max(0,end-start));for(let i=0;i<out.length;i++)out[i]=get(start+i);return out;
      };
      if(key==='set')return(data,offset=0)=>{if(!set||offset<0||offset+data.length>length)throw new Error('稀疏像素写入越界');for(let i=0;i<data.length;i++)set(offset+i,data[i]);};
      const i=numberKey(key);return i>=0&&i<length?get(i):target[key];
    },
    set(target,key,value){const i=numberKey(key);if(i>=0&&i<length&&set){set(i,value);return true;}return Reflect.set(target,key,value);},
  });
}
export function sparseCoverage(width,height,tileSize=256) {
  const tiles=new Map();
  const point=i=>{const x=i%width,y=Math.floor(i/width),tx=Math.floor(x/tileSize),ty=Math.floor(y/tileSize);return {key:`${tx}:${ty}`,i:(y%tileSize)*tileSize+x%tileSize};};
  return virtualArray(width*height,i=>{const p=point(i);return tiles.get(p.key)?.[p.i]||0;},(i,v)=>{const p=point(i);let tile=tiles.get(p.key);if(!tile)tiles.set(p.key,tile=new Float32Array(tileSize*tileSize));tile[p.i]=v;});
}
export function createSparsePixels({width,height,tileSize=256,readTile,tiles:initial,cacheTiles=16}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error('稀疏图层尺寸非法');
  const tiles=new Map(initial||[]),cache=new Map(),pending=new Map(),descriptor={tiles,version:0},exportCache=new Map();
  const normalizeRect=rect=>{const r=rect||{};return {x:Number(r.x)||0,y:Number(r.y)||0,w:Math.max(0,Number(r.w??r.width)||0),h:Math.max(0,Number(r.h??r.height)||0)};};
  const geometry=(x,y)=>{const tx=Math.floor(x/tileSize)*tileSize,ty=Math.floor(y/tileSize)*tileSize;return {key:`${tx}:${ty}`,x:tx,y:ty,width:Math.min(tileSize,width-tx),height:Math.min(tileSize,height-ty)};};
  const point=i=>{const p=Math.floor(i/4),x=p%width,y=Math.floor(p/width),g=geometry(x,y);return {...g,i:((y-g.y)*g.width+x-g.x)*4+i%4};};
  function remember(key,tile){cache.delete(key);cache.set(key,tile);while(cache.size>cacheTiles)cache.delete(cache.keys().next().value);return tile;}
  async function original(g){
    if(cache.has(g.key))return remember(g.key,cache.get(g.key));
    if(pending.has(g.key))return pending.get(g.key);
    const work=Promise.resolve().then(()=>readTile?.(g.x,g.y,g.width,g.height)).then(r=>{
      if(readTile&&r==null)throw new Error('源像素瓦片无法读取');
      const data=r?.data||r||new Uint8ClampedArray(g.width*g.height*4);
      if(data.length!==g.width*g.height*4)throw new Error('稀疏源瓦片尺寸不一致');
      return remember(g.key,{...g,data});
    }).finally(()=>pending.delete(g.key));pending.set(g.key,work);return work;
  }
  function current(g,prepared){return tiles.get(g.key)||prepared?.get(g.key)||cache.get(g.key)||null;}
  function readByte(i,prepared){const p=point(i),t=current(p,prepared);if(!t)throw new Error('像素瓦片尚未准备');return t.data[p.i];}
  const api={width,height,tileSize,tiles,descriptor,
    get stats(){return {editedTiles:tiles.size,editedBytes:[...tiles.values()].reduce((n,t)=>n+t.data.byteLength,0),originalBytes:[...new Set([...tiles.values()].map(t=>t.original))].reduce((n,d)=>n+d.byteLength,0),cacheBytes:[...cache.values()].reduce((n,t)=>n+t.data.byteLength,0)};},
    invalidate(){exportCache.clear();},
    tileCount(){return tiles.size;},
    async ensureTile(x,y){const g=geometry(x|0,y|0);if(!tiles.has(g.key)){const t=await original(g);const b={...t,data:new Uint8ClampedArray(t.data),original:new Uint8ClampedArray(t.data)};tiles.set(g.key,b);}return tiles.get(g.key);},
    async ensureRect(value){const rect=normalizeRect(value);for(let y=Math.floor(Math.max(0,rect.y)/tileSize)*tileSize;y<Math.min(height,rect.y+rect.h);y+=tileSize)for(let x=Math.floor(Math.max(0,rect.x)/tileSize)*tileSize;x<Math.min(width,rect.x+rect.w);x+=tileSize)await api.ensureTile(x,y);},
    async readRect(rect){
      rect=normalizeRect(rect);
      const out=new Uint8ClampedArray(rect.w*rect.h*4);



      for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){
        const gx=rect.x+x,gy=rect.y+y,g=geometry(gx,gy),t=tiles.get(g.key)||cache.get(g.key)||await original(g);
        const ti=((gy-g.y)*g.width+(gx-g.x))*4;
        out.set(t.data.subarray(ti,ti+4),(y*rect.w+x)*4);
      }
      return out;
    },
    fork(){return createSparsePixels({width,height,tileSize,readTile,tiles,cacheTiles});},
    clear(){tiles.clear();cache.clear();exportCache.clear();descriptor.version++;},
    apply(patches,side){
      for(const p of patches){
        const old=tiles.get(p.key),data=new Uint8ClampedArray(old?.data||p.original),r=p.rect;



        const full=p.full||(r.x===0&&r.y===0&&r.w===p.width&&r.h===p.height&&p[side].length===p.width*p.height*4);
        if(full)data.set(p[side]);
        else for(let y=0;y<r.h;y++)data.set(p[side].subarray(y*r.w*4,(y+1)*r.w*4),((r.y+y)*p.width+r.x)*4);
        if(equal(data,p.original))tiles.delete(p.key);else tiles.set(p.key,{key:p.key,x:p.x,y:p.y,width:p.width,height:p.height,data,original:p.original,version:(old?.version||0)+1});
      }
      exportCache.clear();descriptor.version++;
    },
    begin(){
      const prepared=new Map(),before=new Map(),work=new Map(),coverage=new Map();
      function baseline(p){if(before.has(p.key))return before.get(p.key);const t=tiles.get(p.key)||prepared?.get(p.key)||cache.get(p.key);if(!t)throw new Error('像素瓦片尚未准备');const b={...t,data:new Uint8ClampedArray(t.data)};before.set(p.key,b);return b;}
      function writable(p){
        let e=work.get(p.key);if(e)return e;
        const b=baseline(p),old=current(p,prepared)||b;



        const tile={key:p.key,x:p.x,y:p.y,width:p.width,height:p.height,data:new Uint8ClampedArray(b.data),original:old.original||b.data,version:(old.version||0)+1};
        e={tile,before:b,dirty:{x0:p.width,y0:p.height,x1:-1,y1:-1},prior:tiles.get(p.key)};work.set(p.key,e);tiles.set(p.key,tile);return e;
      }
      function putByte(i,v){
        const p=point(i),old=current(p,prepared);v=bytes(v);if(old.data[p.i]===v)return;
        const e=writable(p);
        e.tile.data[p.i]=v;e.tile.version++;
        const pixel=Math.floor(p.i/4),x=pixel%p.width,y=Math.floor(pixel/p.width),d=e.dirty;
        d.x0=Math.min(d.x0,x);d.y0=Math.min(d.y0,y);d.x1=Math.max(d.x1,x);d.y1=Math.max(d.y1,y);descriptor.version++;
      }
      const rgba=virtualArray(width*height*4,i=>readByte(i,prepared),putByte);
      const base=virtualArray(width*height*4,i=>{const p=point(i);return baseline(p).data[p.i];});
      return {rgba,base,write:putByte,coverage:sparseCoverage(width,height,tileSize),
        async prepare(value){
          const rect=normalizeRect(value);
          prepared.clear();
          const x0=Math.max(0,Math.floor(rect.x)),y0=Math.max(0,Math.floor(rect.y)),x1=Math.min(width,Math.ceil(rect.x+rect.w)),y1=Math.min(height,Math.ceil(rect.y+rect.h));
          for(let y=Math.floor(y0/tileSize)*tileSize;y<y1;y+=tileSize)for(let x=Math.floor(x0/tileSize)*tileSize;x<x1;x+=tileSize){const g=geometry(x,y);if(!tiles.has(g.key))prepared.set(g.key,await original(g));}
        },
        contexts(value){
          const rect=normalizeRect(value);
          const out=[],x0=Math.max(0,Math.floor(rect.x)),y0=Math.max(0,Math.floor(rect.y)),x1=Math.min(width,Math.ceil(rect.x+rect.w)),y1=Math.min(height,Math.ceil(rect.y+rect.h));
          for(let y=Math.floor(y0/tileSize)*tileSize;y<y1;y+=tileSize)for(let x=Math.floor(x0/tileSize)*tileSize;x<x1;x+=tileSize){
            const g=geometry(x,y),e=writable(g);let acc=coverage.get(g.key);if(!acc)coverage.set(g.key,acc=new Float32Array(g.width*g.height));



            out.push({...g,absoluteX:g.x,absoluteY:g.y,rgba:e.tile.data,base:e.before.data,acc,
              clip:{x0:Math.max(0,x0-g.x),y0:Math.max(0,y0-g.y),x1:Math.min(g.width,x1-g.x),y1:Math.min(g.height,y1-g.y)}});
          }return out;
        },
        dirty(key,rect){const e=work.get(key);if(!e||!rect)return;const d=e.dirty;d.x0=Math.min(d.x0,rect.x0);d.y0=Math.min(d.y0,rect.y0);d.x1=Math.max(d.x1,rect.x1);d.y1=Math.max(d.y1,rect.y1);e.tile.version++;descriptor.version++;},
        finish(){
          const patches=[];
          for(const [key,e]of work){const t=e.tile;

            const cut=(data,rr)=>{const out=new Uint8ClampedArray(rr.w*rr.h*4);for(let y=0;y<rr.h;y++)out.set(data.subarray(((rr.y+y)*t.width+rr.x)*4,((rr.y+y)*t.width+rr.x+rr.w)*4),y*rr.w*4);return out;};






            const d=e.dirty, hasDirty=d&&d.x1>=d.x0&&d.y1>=d.y0;
            const sx0=hasDirty?Math.max(0,d.x0|0):0, sy0=hasDirty?Math.max(0,d.y0|0):0;
            const sx1=hasDirty?Math.min(t.width-1,d.x1|0):t.width-1, sy1=hasDirty?Math.min(t.height-1,d.y1|0):t.height-1;
            let x0=t.width,y0=t.height,x1=-1,y1=-1;
            for(let yy=sy0;yy<=sy1;yy++)for(let xx=sx0;xx<=sx1;xx++){const q=(yy*t.width+xx)*4;let diff=false;for(let c=0;c<4;c++)if(e.before.data[q+c]!==t.data[q+c]){diff=true;break;}if(diff){x0=Math.min(x0,xx);x1=Math.max(x1,xx);y0=Math.min(y0,yy);y1=Math.max(y1,yy);}}
            if(x1<x0){if(e.prior)tiles.set(key,e.prior);else tiles.delete(key);continue;}




            const hr={x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
            const full=hr.x===0&&hr.y===0&&hr.w===t.width&&hr.h===t.height;
            patches.push({key,x:t.x,y:t.y,width:t.width,height:t.height,original:t.original,rect:hr,full,
              before:full?e.before.data:cut(e.before.data,hr),after:full?t.data:cut(t.data,hr)});






            tiles.set(key,t);
          }
          exportCache.clear();prepared.clear();before.clear();work.clear();coverage.clear();descriptor.version++;return patches;
        },
        rollback(){for(const [key,e]of work){if(e.prior)tiles.set(key,e.prior);else tiles.delete(key);}work.clear();prepared.clear();before.clear();coverage.clear();descriptor.version++;},
      };
    },
  };return api;
}
