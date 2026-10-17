import { recoverWarpCacheBasis } from '../../core/warp-cache-basis.js';
import { applyHomography } from '../../core/homography.js';
import { QUADM } from './app/01-boot.js';
export const warpMeshSignature=li=>JSON.stringify({points:li.points,xn:li.xn,yn:li.yn,sliceX:li.sliceX,sliceY:li.sliceY});
export function prepareWarpCachedPreview(layer,li,rendered,{recover=true,matrix=null}={}){
 if(!layer?.rgba||!layer.width||!layer.height||layer.mask)return null;
 const source={data:Uint8ClampedArray.from(layer.rgba),width:layer.width,height:layer.height,left:layer.bounds.left,top:layer.bounds.top};
 let basis=null;const diagnostic={};
 if(recover&&rendered&&!layer.mask){
  const left=Math.max(0,Math.floor(Math.min(...li.points.map(p=>p.x)))-2),top=Math.max(0,Math.floor(Math.min(...li.points.map(p=>p.y)))-2),right=Math.min(rendered.width,Math.ceil(Math.max(...li.points.map(p=>p.x)))+2),bottom=Math.min(rendered.height,Math.ceil(Math.max(...li.points.map(p=>p.y)))+2);
  if(left>0&&top>0&&right<rendered.width&&bottom<rendered.height&&right>left&&bottom>top&&(right-left)*(bottom-top)<=4000000){
   const rgba=rendered.getContext('2d').getImageData(left,top,right-left,bottom-top).data;
   basis=recoverWarpCacheBasis({data:rgba,width:right-left,height:bottom-top,left,top},source,diagnostic);
   if(basis){li.points=li.points.map(p=>applyHomography(basis.matrix,p.x,p.y));if(li.unwarpedQuad)li.unwarpedQuad=li.unwarpedQuad.map(p=>applyHomography(basis.matrix,p.x,p.y));}
  }
 }
 const image=new OffscreenCanvas(source.width,source.height);image.getContext('2d').putImageData(new ImageData(source.data,source.width,source.height),0,0);
 return {source,image,matrix:matrix||[1,0,0,0,1,0,0,0,1],basis,diagnostic,mesh:null};
}
function paint(ctx,preview){
 const M=preview.matrix,s=preview.source;
 if(Math.abs(M[6])+Math.abs(M[7])<1e-12){ctx.save();ctx.setTransform(M[0],M[3],M[1],M[4],M[2],M[5]);ctx.drawImage(preview.image,s.left,s.top);ctx.restore();return true;}
 if(!QUADM)return false;
 const quad=[[s.left,s.top],[s.left+s.width,s.top],[s.left+s.width,s.top+s.height],[s.left,s.top+s.height]].map(([x,y])=>{const p=applyHomography(M,x,y);return[p.x,p.y];});
 const out=QUADM.warpQuad(s,quad,{samples:2,clip:{x:0,y:0,width:ctx.canvas.width,height:ctx.canvas.height}});if(!out)return false;
 const cv=new OffscreenCanvas(out.width,out.height);cv.getContext('2d').putImageData(new ImageData(out.data,out.width,out.height),0,0);ctx.drawImage(cv,out.x,out.y);return true;
}
export function promoteWarpCachedTopology(session,before,li){
 const p=session?.preview;if(!p)return;
 const same=p.mesh===before||p.equivalentMeshes?.has(before);if(!same)return;
 if(!p.equivalentMeshes)p.equivalentMeshes=new Set([p.mesh]);p.mesh=warpMeshSignature(li);p.equivalentMeshes.add(p.mesh);
}
export function drawWarpCachedPreview(ctx,session,li){const p=session?.preview,key=warpMeshSignature(li);if(!p||p.mesh!==key&&!p.equivalentMeshes?.has(key))return false;return paint(ctx,p);}
export function savedWarpBakeOutput(session,li,width,height){
 const p=session?.preview,key=warpMeshSignature(li);if(!p||p.mesh!==key&&!p.equivalentMeshes?.has(key))return null;
 const cv=new OffscreenCanvas(width,height);if(!paint(cv.getContext('2d'),p))return null;
 return {data:new Uint8Array(cv.getContext('2d').getImageData(0,0,width,height).data),width,height,docWidth:width,docHeight:height};
}
