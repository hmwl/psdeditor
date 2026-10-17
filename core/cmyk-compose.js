


import { blendSeparableChannel } from './compose.js';
const MODES=new Set(['norm','mul ','scrn','dark','lite','diff','smud','over','hLit','sLit']);
export function compositeCMYK(doc, width=doc.width, height=doc.height) {
  const reasons=[];
  if(doc.mode!==4||![8,16].includes(doc.depth))reasons.push('仅支持8/16位CMYK');
  for(const [index,l] of doc.layers.entries()){
    if(l.group) { reasons.push(`图层${index}：组语义尚未接入`); continue; }
    if(l.hidden||l.opacity===0)continue;
    if(l.adjustment||l.fill||l.effects||l.vectorMask||l.vectorStroke||l.artboard||l.blendIf||l.channelsOff||l.knockout||l.clipping)reasons.push(`图层${index}：调整/效果/矢量/剪贴或高级混合尚未接入`);
    if(!MODES.has(l.blendMode||'norm'))reasons.push(`图层${index}：混合模式${l.blendMode}`);
    if(doc.depth===8&&l.blendMode==='diff'&&((l.opacity??255)<255||(l.fillOpacity??255)<255))reasons.push(`图层${index}：8位差值低不透明度原生规则尚未重建`);
    if(l.mask&&!l.mask.disabled&&(l.mask.feather||l.mask.density!=null&&l.mask.density!==255))reasons.push(`图层${index}：蒙版羽化/浓度尚未接入`);
    if(l.decodeWarnings?.length)reasons.push(`图层${index}：通道解码不完整`);
    const p=l.nativePlanes;
    const Type=doc.depth===16?Uint16Array:Uint8Array;
    if(l.width>0&&l.height>0&&([0,1,2,3].some(c=>!(p?.[c] instanceof Type)||p[c].length!==l.width*l.height)||p?.[-1]&&(!(p[-1] instanceof Type)||p[-1].length!==l.width*l.height)))reasons.push(`图层${index}：缺原生CMYK通道或类型/尺寸错误`);
  }
  if(reasons.length)return {supported:false,reasons};
  const max=doc.depth===16?65535:255,Type=doc.depth===16?Uint16Array:Uint8Array,n=width*height;
  const planes=Array.from({length:4},()=>new Type(n).fill(max)),alpha=new Type(n);
  for(const l of doc.layers){
    if(l.hidden||l.opacity===0||!(l.width>0&&l.height>0))continue;
    const p=l.nativePlanes,opacity=(l.opacity??255)/255*(l.fillOpacity??255)/255,mask=l.mask;
    for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++){
      const dx=x+l.bounds.left,dy=y+l.bounds.top;if(dx<0||dy<0||dx>=width||dy>=height)continue;
      const si=y*l.width+x,di=dy*width+dx;let sa=(p[-1]?p[-1][si]/max:1)*opacity;
      if(mask&&!mask.disabled){
        const mx=mask.relative?x-mask.left:dx-mask.left,my=mask.relative?y-mask.top:dy-mask.top;
        const mp=p[-2]||p[-3];let mv=mask.defaultColor==null?1:mask.defaultColor/255;
        if(mx>=0&&my>=0&&mx<mask.width&&my<mask.height){if(!mp)return {supported:false,reasons:['缺原生蒙版通道']};mv=mp[my*mask.width+mx]/max;}
        sa*=mask.invert?1-mv:mv;
      }
      if(!(sa>0))continue;const ba=alpha[di]/max,ao=sa+ba*(1-sa);
      if(doc.depth===8&&l.blendMode==='diff'&&(sa!==1||ba!==1))return {supported:false,reasons:['8位差值的透明覆盖原生规则尚未重建']};
      for(let c=0;c<4;c++){
        const cb=planes[c][di]/max,cs=p[c][si]/max,b=blendSeparableChannel(l.blendMode||'norm',cb,cs);
        planes[c][di]=Math.round(max*((1-sa)*ba*cb+sa*((1-ba)*cs+ba*b))/ao);
      }
      alpha[di]=Math.round(ao*max);
    }
  }
  return {supported:true,planes,alpha,width,height,depth:doc.depth,max};
}
export function cmykCompositeRGBA(native, codec) {
  if(!native.supported)throw new Error('缺可用原生CMYK合成');
  const data=new Uint8ClampedArray(native.width*native.height*4),tmp=[0,0,0];
  for(let i=0;i<native.alpha.length;i++){
    if(codec)codec.toRgb8(native.planes,i,tmp,native.max);
    else for(let c=0;c<3;c++)tmp[c]=255-Math.min(255,(2-(native.planes[c][i]+native.planes[3][i])/native.max)*255);
    for(let c=0;c<3;c++)data[i*4+c]=tmp[c];data[i*4+3]=native.alpha[i]*255/native.max;
  }
  return {data,width:native.width,height:native.height};
}
export function sampleCMYK(native,x,y,size=1) {
  if(!native?.supported)return null;
  x=Math.floor(x);y=Math.floor(y);const half=Math.floor(size/2),sum=[0,0,0,0];let weight=0;
  for(let dy=-half;dy<=half;dy++)for(let dx=-half;dx<=half;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=native.width||yy>=native.height)continue;
    const i=yy*native.width+xx,a=native.alpha[i]/native.max;if(!a)continue;
    for(let c=0;c<4;c++)sum[c]+=(1-native.planes[c][i]/native.max)*100*a;weight+=a;
  }
  return weight?sum.map(v=>v/weight):x>=0&&y>=0&&x<native.width&&y<native.height?[0,0,0,0]:null;
}
