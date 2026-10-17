























let backend = null;






export function setInflateBackend(fn) {
  if (fn != null && typeof fn !== 'function') throw new TypeError('inflate 后端必须是函数或 null');
  backend = fn || null;
}
export function getInflateBackend() { return backend; }





class BitReader {
  constructor(src, pos = 0) {
    this.src = src;
    this.pos = pos;
    this.buf = 0;
    this.cnt = 0;
    this.overrun = 0; 
  }
  fill(n) {
    while (this.cnt < n) {
      let b = 0;
      if (this.pos < this.src.length) b = this.src[this.pos++];
      else if (++this.overrun > 8) {
        
        
        throw new Error('DEFLATE：数据在流结束前就用尽了（截断或损坏）');
      }
      this.buf |= b << this.cnt;
      this.cnt += 8;
    }
  }
  bits(n) {
    if (n === 0) return 0;
    this.fill(n);
    const v = this.buf & ((1 << n) - 1);
    this.buf >>>= n;
    this.cnt -= n;
    return v;
  }
  align() { const drop = this.cnt & 7; this.buf >>>= drop; this.cnt -= drop; }
  
  byteAligned() {
    if (this.cnt >= 8) { const v = this.buf & 0xff; this.buf >>>= 8; this.cnt -= 8; return v; }
    if (this.pos < this.src.length) return this.src[this.pos++];
    this.overrun++; return 0;
  }
}



function buildTable(lengths, n) {
  let maxLen = 0;
  for (let i = 0; i < n; i++) if (lengths[i] > maxLen) maxLen = lengths[i];
  if (maxLen === 0) return { table: new Int32Array(1), maxLen: 0, mask: 0, empty: true };
  if (maxLen > 15) throw new Error(`DEFLATE：Huffman 码长 ${maxLen} 超过 15`);

  const blCount = new Int32Array(16);
  for (let i = 0; i < n; i++) blCount[lengths[i]]++;
  blCount[0] = 0;

  
  let left = 1;
  for (let len = 1; len <= maxLen; len++) {
    left <<= 1;
    left -= blCount[len];
    if (left < 0) throw new Error('DEFLATE：Huffman 码表过满（over-subscribed）');
  }

  const nextCode = new Int32Array(16);
  let code = 0;
  for (let len = 1; len <= maxLen; len++) { code = (code + blCount[len - 1]) << 1; nextCode[len] = code; }

  const size = 1 << maxLen;
  const table = new Int32Array(size);
  for (let sym = 0; sym < n; sym++) {
    const len = lengths[sym];
    if (len === 0) continue;
    const c = nextCode[len]++;
    
    let rev = 0;
    for (let b = 0; b < len; b++) rev |= ((c >>> (len - 1 - b)) & 1) << b;
    const entry = (len << 16) | sym;
    const step = 1 << len;
    for (let i = rev; i < size; i += step) table[i] = entry;
  }
  return { table, maxLen, mask: size - 1, empty: false };
}

function decodeSym(br, ht) {
  if (ht.empty) throw new Error('DEFLATE：使用了空的 Huffman 表');
  br.fill(ht.maxLen);
  const e = ht.table[br.buf & ht.mask];
  if (e === 0) throw new Error('DEFLATE：非法 Huffman 码');
  const len = e >>> 16;
  br.buf >>>= len;
  br.cnt -= len;
  return e & 0xffff;
}


const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

let FIXED_LIT = null, FIXED_DIST = null;
function fixedTables() {
  if (FIXED_LIT) return;
  const l = new Uint8Array(288);
  for (let i = 0; i < 144; i++) l[i] = 8;
  for (let i = 144; i < 256; i++) l[i] = 9;
  for (let i = 256; i < 280; i++) l[i] = 7;
  for (let i = 280; i < 288; i++) l[i] = 8;
  FIXED_LIT = buildTable(l, 288);
  FIXED_LIT.codes=l;
  const d = new Uint8Array(30).fill(5);
  FIXED_DIST = buildTable(d, 30);
  FIXED_DIST.codes=d;
}


class Out {
  constructor(hint) {
    const cap = Math.max(1024, hint > 0 ? hint : 1024);
    this.b = new Uint8Array(cap);
    this.n = 0;
    this.fixed = hint > 0; 
  }
  need(extra) {
    const want = this.n + extra;
    if (want <= this.b.length) return;
    let cap = this.b.length;
    while (cap < want) cap = cap < 0x1000000 ? cap * 2 : cap + 0x1000000;
    const nb = new Uint8Array(cap);
    nb.set(this.b.subarray(0, this.n));
    this.b = nb;
  }
  push(v) { if (this.n >= this.b.length) this.need(1); this.b[this.n++] = v; }
  copy(dist, len) {
    if (dist > this.n) throw new Error(`DEFLATE：回溯距离 ${dist} 超过已输出 ${this.n} 字节`);
    this.need(len);
    const b = this.b;
    let s = this.n - dist, d = this.n;
    for (let i = 0; i < len; i++) b[d++] = b[s++];
    this.n = d;
  }
  result() { return this.b.length === this.n ? this.b : this.b.subarray(0, this.n); }
}











export function inflateRaw(src, opts = {}) {
  if (backend && !opts.pure) {
    try {
      const r = backend(src, { raw: true, expectedSize: opts.expectedSize });
      if (r) return r instanceof Uint8Array ? r : new Uint8Array(r);
    } catch {  }
  }
  return inflateRawJS(src, opts.expectedSize | 0, opts.limit == null ? -1 : opts.limit);
}

function inflateRawJS(src, hint, limit = -1) {
  const br = new BitReader(src, 0);
  const out = new Out(hint);
  const codeLens = new Uint8Array(19);
  const lens = new Uint8Array(288 + 32);

  for (;;) {
    const bfinal = br.bits(1);
    const btype = br.bits(2);

    if (btype === 0) {                       
      br.align();
      const l0 = br.byteAligned(), l1 = br.byteAligned();
      const n0 = br.byteAligned(), n1 = br.byteAligned();
      const len = l0 | (l1 << 8), nlen = n0 | (n1 << 8);
      if ((len ^ 0xffff) !== nlen) throw new Error('DEFLATE：stored 块 LEN/NLEN 不匹配');
      out.need(len);
      for (let i = 0; i < len; i++) out.b[out.n++] = br.byteAligned();
      if (br.overrun) throw new Error('DEFLATE：stored 块数据不完整');
      if (limit >= 0 && out.n > limit) throw new Error(`DEFLATE：输出超过上限 ${limit} 字节`);
    } else if (btype === 1 || btype === 2) {
      let lit, dist;
      if (btype === 1) { fixedTables(); lit = FIXED_LIT; dist = FIXED_DIST; }
      else {
        const hlit = br.bits(5) + 257;
        const hdist = br.bits(5) + 1;
        const hclen = br.bits(4) + 4;
        codeLens.fill(0);
        for (let i = 0; i < hclen; i++) codeLens[CLEN_ORDER[i]] = br.bits(3);
        const clTable = buildTable(codeLens, 19);
        lens.fill(0);
        const total = hlit + hdist;
        let i = 0;
        while (i < total) {
          const sym = decodeSym(br, clTable);
          if (sym < 16) { lens[i++] = sym; }
          else if (sym === 16) {
            if (i === 0) throw new Error('DEFLATE：码长表以重复码开头');
            const prev = lens[i - 1], rep = 3 + br.bits(2);
            if (i + rep > total) throw new Error('DEFLATE：码长表重复越界');
            for (let k = 0; k < rep; k++) lens[i++] = prev;
          } else if (sym === 17) {
            const rep = 3 + br.bits(3);
            if (i + rep > total) throw new Error('DEFLATE：码长表重复越界');
            i += rep; 
          } else {
            const rep = 11 + br.bits(7);
            if (i + rep > total) throw new Error('DEFLATE：码长表重复越界');
            i += rep;
          }
        }
        if (lens[256] === 0) throw new Error('DEFLATE：缺少块结束码');
        lit = buildTable(lens.subarray(0, hlit), hlit);
        dist = buildTable(lens.subarray(hlit, hlit + hdist), hdist);
      }

      for (;;) {
        const sym = decodeSym(br, lit);
        if (sym < 256) { out.push(sym); continue; }
        if (sym === 256) break;
        const li = sym - 257;
        if (li >= LEN_BASE.length) throw new Error(`DEFLATE：非法长度码 ${sym}`);
        const length = LEN_BASE[li] + br.bits(LEN_EXTRA[li]);
        const ds = decodeSym(br, dist);
        if (ds >= DIST_BASE.length) throw new Error(`DEFLATE：非法距离码 ${ds}`);
        const d = DIST_BASE[ds] + br.bits(DIST_EXTRA[ds]);
        out.copy(d, length);
        if (limit >= 0 && out.n > limit) throw new Error(`DEFLATE：输出超过上限 ${limit} 字节`);
      }
      if (br.overrun > 4) throw new Error('DEFLATE：数据在块结束前就用尽了');
    } else {
      throw new Error('DEFLATE：非法的块类型 3');
    }

    if (bfinal) break;
    if (br.pos >= src.length && br.cnt === 0) throw new Error('DEFLATE：数据结束但没有 final 块');
  }
  return out.result();
}







export function inflateZlib(src, opts = {}) {
  if (src.length < 2) throw new Error('zlib：数据太短');
  const cmf = src[0], flg = src[1];
  if ((cmf & 0x0f) !== 8) throw new Error(`zlib：不支持的压缩方法 ${cmf & 0x0f}`);
  if (((cmf << 8) | flg) % 31 !== 0) throw new Error('zlib：头部校验失败');
  if (flg & 0x20) throw new Error('zlib：不支持预设字典（FDICT）');

  if (backend && !opts.pure) {
    try {
      const r = backend(src, { raw: false, expectedSize: opts.expectedSize });
      if (r) return r instanceof Uint8Array ? r : new Uint8Array(r);
    } catch {  }
  }

  const out = inflateRawJS(src.subarray(2), opts.expectedSize | 0, opts.limit == null ? -1 : opts.limit);
  if (opts.checkAdler) {
    
    if (src.length >= 6) {
      const t = src.length;
      const want = ((src[t - 4] << 24) | (src[t - 3] << 16) | (src[t - 2] << 8) | src[t - 1]) >>> 0;
      const got = adler32(out);
      if (want !== got) throw new Error(`zlib：Adler-32 校验失败（期望 ${want}，实得 ${got}）`);
    }
  }
  return out;
}








export function inflate(src, opts = {}) {
  const looksZlib = src.length >= 2 && (src[0] & 0x0f) === 8 && (((src[0] << 8) | src[1]) % 31 === 0);
  if (looksZlib) {
    try { return inflateZlib(src, opts); } catch (e) {
      try { return inflateRaw(src, opts); } catch { throw e; }
    }
  }
  try { return inflateRaw(src, opts); } catch (e) {
    try { return inflateZlib(src, opts); } catch { throw e; }
  }
}





export function createInflateCursor(src,{expectedSize,checkAdler=true,identity=src}={}){
  if(!(src instanceof Uint8Array)||src.length<6||(src[0]&15)!==8||src[0]>>>4>7||((src[0]<<8|src[1])%31)||(src[1]&32))throw new Error('zlib：游标头部无效或需要预设字典');
  if(!Number.isSafeInteger(expectedSize)||expectedSize<0)throw new Error('zlib：游标需要确切输出长度');
  const raw=src.subarray(2),br=new BitReader(raw),window=new Uint8Array(32768);
  let position=0,windowLength=0,lit=null,dist=null,final=false,block=false,stored=0,copyLeft=0,copyDist=0,done=false,a=1,b=0;
  const validBits=()=>{if((br.pos+br.overrun)*8-br.cnt>raw.length*8)throw new Error('DEFLATE：游标数据截断');};
  function tables(type){
    if(type===1){fixedTables();return [FIXED_LIT,FIXED_DIST];}
    const hlit=br.bits(5)+257,hdist=br.bits(5)+1,hclen=br.bits(4)+4,codeLens=new Uint8Array(19),lens=new Uint8Array(hlit+hdist);
    for(let i=0;i<hclen;i++)codeLens[CLEN_ORDER[i]]=br.bits(3);
    const cl=buildTable(codeLens,19);
    for(let i=0;i<lens.length;){
      const sym=decodeSym(br,cl);
      if(sym<16){lens[i++]=sym;continue;}
      if(sym===16&&!i)throw new Error('DEFLATE：码长表以重复码开头');
      const n=sym===16?3+br.bits(2):sym===17?3+br.bits(3):11+br.bits(7),v=sym===16?lens[i-1]:0;
      if(i+n>lens.length)throw new Error('DEFLATE：码长表重复越界');
      lens.fill(v,i,i+n);i+=n;
    }
    if(!lens[256])throw new Error('DEFLATE：缺少块结束码');
    validBits();
    const lc=lens.subarray(0,hlit),dc=lens.subarray(hlit),l=buildTable(lc,hlit),d=buildTable(dc,hdist);l.codes=lc;d.codes=dc;return [l,d];
  }
  function endBlock(){
    block=false;lit=dist=null;if(!final)return;
    done=true;if(position!==expectedSize)throw new Error('zlib：输出长度不符');
    
    
    const trailer=2+Math.ceil(((br.pos+br.overrun)*8-br.cnt)/8);
    if(trailer+4>src.length)throw new Error('zlib：校验尾部截断');
    const want=new DataView(src.buffer,src.byteOffset+trailer,4).getUint32(0);
    if(checkAdler&&want!==((b<<16|a)>>>0))throw new Error('zlib：Adler-32 校验失败');
  }
  function remember(out,n){
    if(n>=32768){window.set(out.subarray(n-32768,n));windowLength=32768;}
    else if(n){const keep=Math.min(windowLength,32768-n);window.copyWithin(0,windowLength-keep,windowLength);window.set(out.subarray(0,n),keep);windowLength=keep+n;}
  }
  function checksum(out,start,end){if(!checkAdler)return;let ca=a,cb=b;for(let i=start;i<end;){const stop=Math.min(i+5552,end);for(;i<stop;i++){ca+=out[i];cb+=ca;}ca%=65521;cb%=65521;}a=ca;b=cb;}
  const api={
    get position(){return position;},get done(){return done;},
    get workingBytes(){return window.byteLength+(lit?.table.byteLength||0)+(dist?.table.byteLength||0);},
    readInto(out){
      if(!(out instanceof Uint8Array))throw new TypeError('zlib：需要字节输出缓冲');
      let used=0,checked=0;
      while(used<out.length&&!done){
        if(copyLeft){
          const count=Math.min(copyLeft,out.length-used);if(position+count>expectedSize)throw new Error('zlib：输出超过声明长度');
          let left=count;
          if(copyDist>used){const n=Math.min(left,copyDist-used),at=windowLength+used-copyDist;if(at<0)throw new Error('DEFLATE：回溯距离超出字典');out.set(window.subarray(at,at+n),used);used+=n;left-=n;}
          if(left&&copyDist===1){out.fill(out[used-1],used,used+left);used+=left;left=0;}
          while(left){const n=Math.min(left,copyDist);out.set(out.subarray(used-copyDist,used-copyDist+n),used);used+=n;left-=n;}
          copyLeft-=count;position+=count;continue;
        }
        if(stored){
          const n=Math.min(stored,out.length-used);if(position+n>expectedSize)throw new Error('zlib：输出超过声明长度');
          let left=n;while(left&&br.cnt>=8){out[used++]=br.byteAligned();left--;}
          if(br.pos+left>raw.length)throw new Error('DEFLATE：stored 块数据不完整');
          out.set(raw.subarray(br.pos,br.pos+left),used);br.pos+=left;used+=left;position+=n;stored-=n;
          if(!stored){checksum(out,checked,used);checked=used;endBlock();}continue;
        }
        if(!block){
          final=!!br.bits(1);const type=br.bits(2);validBits();block=true;
          if(type===0){br.align();const n=br.byteAligned()|br.byteAligned()<<8,inv=br.byteAligned()|br.byteAligned()<<8;validBits();if((n^65535)!==inv)throw new Error('DEFLATE：stored 块 LEN/NLEN 不匹配');stored=n;if(!n){checksum(out,checked,used);checked=used;endBlock();}continue;}
          if(type===3)throw new Error('DEFLATE：非法的块类型 3');
          [lit,dist]=tables(type);
        }
        const sym=decodeSym(br,lit);validBits();
        if(sym<256){if(position>=expectedSize)throw new Error('zlib：输出超过声明长度');out[used++]=sym;position++;}
        else if(sym===256){checksum(out,checked,used);checked=used;endBlock();}
        else{
          const li=sym-257;if(li>=LEN_BASE.length)throw new Error('DEFLATE：非法长度码');
          copyLeft=LEN_BASE[li]+br.bits(LEN_EXTRA[li]);const ds=decodeSym(br,dist);if(ds>=DIST_BASE.length)throw new Error('DEFLATE：非法距离码');
          copyDist=DIST_BASE[ds]+br.bits(DIST_EXTRA[ds]);validBits();if(copyDist>position)throw new Error('DEFLATE：回溯距离超过输出');
        }
      }
      checksum(out,checked,used);remember(out,used);return used;
    },
    finish(){if(position!==expectedSize)throw new Error('zlib：输出尚未完整');api.readInto(new Uint8Array(1));if(!done)throw new Error('zlib：流尚未结束');},
    snapshot(){return {source:identity,position,window:window.slice(0,windowLength),litCodes:lit?.codes,distCodes:dist?.codes,final,block,stored,copyLeft,copyDist,done,a,b,reader:{pos:br.pos,buf:br.buf,cnt:br.cnt,overrun:br.overrun}};},
    restore(cp){
      if(cp.source!==identity)throw new Error('zlib：检查点来源不符');
      const recover=(codes,current)=>{if(!codes)return null;if(current?.codes===codes)return current;const t=buildTable(codes,codes.length);t.codes=codes;return t;};
      lit=recover(cp.litCodes,lit);dist=recover(cp.distCodes,dist);
      ({position,final,block,stored,copyLeft,copyDist,done,a,b}=cp);windowLength=cp.window.length;window.set(cp.window);Object.assign(br,cp.reader);
    },
  };return api;
}


export function adler32(data) {
  let a = 1, b = 0;
  const n = data.length;
  
  let i = 0;
  while (i < n) {
    const end = Math.min(i + 5552, n);
    for (; i < end; i++) { a += data[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}










export function deflateStore(data, opts = {}) {
  const raw = !!opts.raw;
  const MAX = 0xffff;
  const nBlocks = Math.max(1, Math.ceil(data.length / MAX));
  const body = nBlocks * 5 + data.length;
  const out = new Uint8Array((raw ? 0 : 2) + body + (raw ? 0 : 4));
  let o = 0;
  if (!raw) { out[o++] = 0x78; out[o++] = 0x01; }   
  for (let i = 0; i < nBlocks; i++) {
    const start = i * MAX;
    const len = Math.min(MAX, data.length - start);
    out[o++] = (i === nBlocks - 1) ? 1 : 0;         
    out[o++] = len & 0xff; out[o++] = (len >>> 8) & 0xff;
    const n = (~len) & 0xffff;
    out[o++] = n & 0xff; out[o++] = (n >>> 8) & 0xff;
    if (len > 0) { out.set(data.subarray(start, start + len), o); o += len; }
  }
  if (!raw) {
    const ad = adler32(data);
    out[o++] = (ad >>> 24) & 0xff; out[o++] = (ad >>> 16) & 0xff;
    out[o++] = (ad >>> 8) & 0xff; out[o++] = ad & 0xff;
  }
  return o === out.length ? out : out.subarray(0, o);
}


export function deflateRawStore(data) { return deflateStore(data, { raw: true }); }

export default { inflate, inflateRaw, inflateZlib, deflateStore, deflateRawStore, adler32, setInflateBackend, getInflateBackend };
