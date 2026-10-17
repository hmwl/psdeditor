



import { computeHomographyQuad, applyHomography, invert3x3 } from '../../core/homography.js';
import { presetMesh } from '../../core/path-warp.js';
import { surfacePoint } from '../../core/mesh.js';
export const PRESET_HANDLE_UV=Object.freeze({
 warpArc:[.5,0],warpArcLower:[.5,1],warpArcUpper:[.5,0],warpArch:[.5,0],warpBulge:[.5,0],
 warpFlag:[.25,0],warpWave:[.25,.5],warpFish:[.25,0],warpRise:[0,0],warpFisheye:[.5,1/3],
 warpInflate:[.5,0],warpSqueeze:[.5,0],warpTwist:[1/3,.5],warpShellLower:[.5,1],warpShellUpper:[.5,0],
});
const noDirection=new Set(['warpFisheye','warpInflate','warpTwist']);
const clone=o=>({...o,...(o.values?{values:o.values.slice()}:{})});
export function presetControlMap(frame,size){
 const H=computeHomographyQuad([0,0,size.width,0,size.width,size.height,0,size.height],frame.flatMap(p=>[p.x,p.y]));
 const inverse=H&&invert3x3(H);if(!inverse)throw new Error('变形框已退化');return{forward:p=>applyHomography(H,p.x,p.y),inverse:p=>applyHomography(inverse,p.x,p.y)};
}
export function presetWarpHandles(options,size,map=p=>p){
 if(options.style==='warpCylinder'){
  const [L,B,R,T,top,bottom,strength]=options.values,cx=(L+R)/2,a=(R-L)/2;
  return [
   {id:'cylinder-right-top',kind:'rect',label:'圆柱体右上边界',p:{x:R,y:T}},
   {id:'cylinder-left-bottom',kind:'rect',label:'圆柱体左下边界',p:{x:L,y:B}},
   {id:'cylinder-top',kind:'cylinder',label:'圆柱体顶部弧度',p:{x:cx,y:T+a*top}},
   {id:'cylinder-bottom',kind:'cylinder',label:'圆柱体底部弧度',p:{x:cx,y:B+a*bottom}},
   {id:'cylinder-strength',kind:'cylinder',label:'圆柱体投影强度',p:{x:cx+a*(1-strength),y:(T+B+a*(top+bottom)*Math.sqrt(Math.max(0,1-(1-strength)**2)))/2}},
  ].map(h=>({...h,p:map(h.p)}));
 }
 const uv=PRESET_HANDLE_UV[options.style];if(!uv)return[];
 const m=presetMesh({x:0,y:0,w:size.width,h:size.height},{...options,bend:options.bend/100,h:options.h/100,v:options.v/100});
 const [u,v]=options.vertical&&!noDirection.has(options.style)?[uv[1],uv[0]]:uv;
 return[{id:'preset-bend',kind:'bend',label:'预设弯曲',p:map(surfacePoint(m.points,m.cols,m.rows,u,v,m.sliceX,m.sliceY))}];
}
export function hitPresetWarpHandle(handles,point,tolerance){
 let best=null,dist=tolerance;
 for(const h of handles){const d=Math.hypot(point.x-h.p.x,point.y-h.p.y);if(d<=dist){best=h;dist=d;}}
 return best;
}
export function dragPresetWarpHandle(base,id,from,to,size){
 const options=clone(base),dx=to.x-from.x,dy=to.y-from.y;
 if(dx===0&&dy===0)return options;
 if(options.style==='warpCylinder'){
  const v=options.values,a=(v[2]-v[0])/2;
  if(id==='cylinder-top'){v[4]=Math.max(-1,Math.min(1,v[4]+dy/a));v[5]=Math.max(-1,Math.min(1,v[5]+dy/a));}
  else if(id==='cylinder-bottom')v[5]=Math.max(-1,Math.min(1,v[5]+dy/a));
  else if(id==='cylinder-strength')v[6]=Math.max(0,Math.min(1,v[6]-dx/a));
  else if(id==='cylinder-left-bottom'||id==='cylinder-right-top'){
   const topHeight=a*v[4],bottomHeight=a*v[5];
   if(id==='cylinder-left-bottom'){v[0]=Math.min(v[2]-.001,v[0]+dx);v[1]=Math.max(v[3]+.001,v[1]+dy);}
   else{v[2]=Math.max(v[0]+.001,v[2]+dx);v[3]=Math.min(v[1]-.001,v[3]+dy);}
   const na=(v[2]-v[0])/2;v[4]=topHeight/na;v[5]=bottomHeight/na;
  }
  return options;
 }
 if(id!=='preset-bend')return options;
 const initial=presetWarpHandles(base,size)[0].p;
 options.bend=inversePresetBend(base,{x:initial.x+dx,y:initial.y+dy},size);return options;
}


export function inversePresetBend(base,target,size){
 const vertical=base.vertical&&!noDirection.has(base.style),W=vertical?size.height:size.width,H=vertical?size.width:size.height;
 const opts={...base,vertical:false,h:vertical?base.v:base.h,v:vertical?base.h:base.v};
 const m=presetMesh({x:0,y:0,w:W,h:H},{...opts,bend:opts.bend/100,h:opts.h/100,v:opts.v/100});
 const y=vertical?target.x:target.y,cy=H/2,circular=ref=>-4*Math.atan(2*(y-ref)/W)/Math.PI;
 let raw,sign=1;
 switch(base.style){
 case 'warpArc':case 'warpArcUpper':case 'warpArch':case 'warpBulge':case 'warpShellUpper':raw=circular(0);break;
 case 'warpArcLower':raw=circular(H);sign=-1;break;
 case 'warpShellLower':raw=-circular(H);break;
 case 'warpFlag':case 'warpFish':raw=y/(.5625*H);sign=-1;break;
 case 'warpRise':raw=-y/(2*H);sign=-1;break;
 case 'warpTwist':raw=-2*(y-cy)/H;break;
 case 'warpFisheye':raw=3-9*y/H;break;
 case 'warpInflate':case 'warpSqueeze':{
  const current=surfacePoint(m.points,4,4,.5,0),topMid=(3*m.points[1].y-m.points[0].y)/2;
  raw=(-2*(y-current.y)-topMid)/(.5*H);break;
 }
 case 'warpWave':{
  const Y=(i,j)=>j===1?(3*m.points[4+i].y-m.points[i].y)/2:m.points[(j===0?0:3)*4+i].y;
  const sum=27*(Y(0,0)+2*Y(0,1)+Y(0,2))+(Y(3,0)+2*Y(3,1)+Y(3,2))+27*(Y(1,0)+Y(1,2))+9*(Y(2,0)+Y(2,2));
  raw=((256*y-sum)/36-2*cy)/(2*H);break;
 }
 default:return base.bend;
 }
 return Math.max(-100,Math.min(100,100*raw*sign));
}
export function drawPresetWarpHandles(ctx,handles,radius,hot){
 for(const h of handles){ctx.fillStyle=h.id===hot?'#1473e6':'#fff';ctx.strokeStyle='#000';ctx.fillRect(h.p.x-radius,h.p.y-radius,2*radius,2*radius);ctx.strokeRect(h.p.x-radius,h.p.y-radius,2*radius,2*radius);}
}
