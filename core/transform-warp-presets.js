





import { WARP_STYLES } from './text-warp.js';


export const TRANSFORM_WARP_STYLES=[...WARP_STYLES,['warpCylinder','圆柱体']];
export const TRANSFORM_WARP_DEFAULTS=Object.fromEntries(WARP_STYLES.filter(([style])=>style!=='warpNone').map(([style])=>[style,{bend:50,h:0,v:0,vertical:false}]));
const nativePercent=Math.fround(0.01)*100;
function regular(W,H,cols,rows){return {cols,rows,points:Array.from({length:cols*rows},(_,i)=>[(i%cols)*W/(cols-1),Math.floor(i/cols)*H/(rows-1)])};}
function circularRow(row,b){
 const a=row[0],z=row[3];
 if(Math.abs(b)<.001)return [a.slice(),[a[0]+(z[0]-a[0])/3,a[1]+(z[1]-a[1])/3],[a[0]+2*(z[0]-a[0])/3,a[1]+2*(z[1]-a[1])/3],z.slice()];
 const q=Math.PI/2*(1-Math.abs(b)),theta=Math.PI/2-q,half=(z[0]-a[0])/2,radius=half/Math.cos(q);
 const sin=Math.sin(theta),cos=Math.cos(theta),k=(4-cos)/3,d=(1-k*cos)/sin;
 const cx=a[0]+half,cy=a[1]+(b>=0?1:-1)*Math.sqrt(Math.max(0,radius*radius-half*half));
 return [[-sin,cos],[-d,k],[d,k],[sin,cos]].map(([x,y])=>[cx+radius*x,cy+radius*(b>=0?-y:y)]);
}
function arcPreset(b,W,H){
 const m=regular(W,H,4,2),theta=Math.PI/2*Math.abs(b),sin=Math.sin(theta),cos=Math.cos(theta);
 if(b>=0){m.points[0]=[-H*sin,H-H*cos];m.points[3]=[W+H*sin,H-H*cos];}
 else{m.points[4]=[-H*sin,H*cos];m.points[7]=[W+H*sin,H*cos];}
 m.points=[...circularRow(m.points.slice(0,4),b),...circularRow(m.points.slice(4),b)];return m;
}
function basicPreset(style,b,W,H){
 if(style==='warpArc')return arcPreset(b,W,H);
 if(['warpArcLower','warpArcUpper','warpArch','warpBulge'].includes(style)){
  const m=regular(W,H,4,2);
  if(style!=='warpArcLower')m.points.splice(0,4,...circularRow(m.points.slice(0,4),b));
  if(style!=='warpArcUpper')m.points.splice(4,4,...circularRow(m.points.slice(4),style==='warpArch'?b:-b));
  return m;
 }
 if(['warpShellLower','warpShellUpper'].includes(style)){
  const lower=style==='warpShellLower',m=regular(W,H,4,4),arc=arcPreset(lower?-b:b,W,H),row=arc.points.slice(lower?4:0,lower?8:4);
  m.points.splice(lower?12:0,4,...row);
  const distance=H/3;
  for(const [i,control]of[[0,1],[3,2]]){
   const anchor=row[i],t=[row[control][0]-anchor[0],row[control][1]-anchor[1]];
   const sign=(lower?-1:1)*(i===0?1:-1),normal=[-t[1]*sign,t[0]*sign],length=Math.hypot(...normal);
   m.points[(lower?2:1)*4+i]=[anchor[0]+(length?normal[0]*distance/length:0),anchor[1]+(length?normal[1]*distance/length:0)];
  }
  return m;
 }
 let m;
 if(['warpFlag','warpFish','warpRise'].includes(style))m=regular(W,H,4,2);
 else if(style==='warpWave')m=regular(W,H,4,3);
 else if(['warpInflate','warpSqueeze'].includes(style))m=regular(W,H,3,3);
 else m=regular(W,H,4,4);
 const p=(i,j)=>m.points[j*m.cols+i];
 switch(style){
 case 'warpFisheye':
  for(const j of [1,2])for(const i of [1,2]){const q=p(i,j),c=[i===1?0:W,j===1?0:H];q[0]+=2*b*(c[0]-q[0]);q[1]+=2*b*(c[1]-q[1]);}break;
 case 'warpFlag':for(const j of [0,1]){p(1,j)[1]-=2*H*b;p(2,j)[1]+=2*H*b;}break;
 case 'warpFish':p(1,0)[1]-=2*H*b;p(2,0)[1]+=2*H*b;p(1,1)[1]+=2*H*b;p(2,1)[1]-=2*H*b;break;
 case 'warpRise':for(const j of [0,1])for(const i of [0,1])p(i,j)[1]+=2*H*b;break;
 case 'warpWave':p(1,1)[1]+=2*H*b;p(2,1)[1]-=2*H*b;break;
 case 'warpInflate':case 'warpSqueeze':
  p(1,0)[1]-=H*.5*b;p(1,2)[1]+=H*.5*b;
  p(0,1)[0]+=(style==='warpInflate'?-1:1)*W*.5*b;
  p(2,1)[0]+=(style==='warpInflate'?1:-1)*W*.5*b;break;
 case 'warpTwist':
  if(b>0){p(1,1)[0]+=W*b;p(2,1)[1]+=H*b;p(1,2)[1]-=H*b;p(2,2)[0]-=W*b;}
  else{p(1,1)[1]-=H*b;p(2,1)[0]+=W*b;p(1,2)[0]-=W*b;p(2,2)[1]+=H*b;}break;
 case 'warpNone':case 'warpCustom':break;
 default:throw new Error('未知变形预设：'+style);
 }
 return m;
}
function transpose(m){return {cols:m.rows,rows:m.cols,points:Array.from({length:m.points.length},(_,k)=>{const i=k%m.rows,j=Math.floor(k/m.rows),p=m.points[i*m.cols+j];return [p[1],p[0]];})};}
function elevate(line){
 while(line.length<4){const n=line.length-1,q=[line[0].slice()];for(let i=1;i<=n;i++){const a=i/(n+1);q.push([a*line[i-1][0]+(1-a)*line[i][0],a*line[i-1][1]+(1-a)*line[i][1]]);}q.push(line[n].slice());line=q;}return line;
}
export function elevateTransformWarpMesh(points,cols,rows){
 if(cols>4||rows>4||cols<2||rows<2)return {points,cols,rows};
 const rowLines=Array.from({length:rows},(_,j)=>elevate(points.slice(j*cols,(j+1)*cols)));
 const colLines=Array.from({length:4},(_,i)=>elevate(rowLines.map(row=>row[i])));
 return {points:Array.from({length:16},(_,k)=>colLines[k%4][Math.floor(k/4)]),cols:4,rows:4};
}
export function transformWarpMesh(options,W,H){
 const b=Math.max(-1,Math.min(1,+options.bend||0))*nativePercent;
 const vertical=!!options.vertical&&!['warpFisheye','warpInflate','warpTwist'].includes(options.style);
 let m=basicPreset(options.style,b,vertical?H:W,vertical?W:H);if(vertical)m=transpose(m);
 const {cols,rows,points}=m;
 const v=Math.max(-1,Math.min(1,+options.v||0))*nativePercent,h=Math.max(-1,Math.min(1,+options.h||0))*nativePercent;
 
 for(let j=0;j<rows;j++){
  const t=v*(1-2*j/(rows-1)),a=points[j*cols],z=points[j*cols+cols-1],mid=[(a[0]+z[0])/2,(a[1]+z[1])/2];
  for(let i=0;i<cols;i++){const p=points[j*cols+i];p[0]+=t*(mid[0]-p[0]);p[1]+=t*(mid[1]-p[1]);}
 }
 for(let i=0;i<cols;i++){
  const t=h*(1-2*i/(cols-1)),a=points[i],z=points[(rows-1)*cols+i],mid=[(a[0]+z[0])/2,(a[1]+z[1])/2];
  for(let j=0;j<rows;j++){const p=points[j*cols+i];p[0]+=t*(mid[0]-p[0]);p[1]+=t*(mid[1]-p[1]);}
 }
 return elevateTransformWarpMesh(points,cols,rows).points;
}
