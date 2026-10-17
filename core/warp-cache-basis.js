


function bounds(image){
 let left=image.width,top=image.height,right=0,bottom=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.data[(y*image.width+x)*4+3]>128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
 return right>left&&bottom>top?{left:left+image.left,top:top+image.top,right:right+image.left,bottom:bottom+image.top}:null;
}
function alpha(image,x,y){x=Math.floor(x-image.left);y=Math.floor(y-image.top);return x>=0&&y>=0&&x<image.width&&y<image.height?image.data[(y*image.width+x)*4+3]:0;}
function overlap(a,b,region,map=null,step=1){let union=0,intersection=0;for(let y=region.top;y<region.bottom;y+=step)for(let x=region.left;x<region.right;x+=step){const aa=alpha(a,map?(x+.5-map[2])/map[0]:x+.5,map?(y+.5-map[5])/map[4]:y+.5)>128,bb=alpha(b,x+.5,y+.5)>128;if(aa||bb)union++;if(aa&&bb)intersection++;}return union?intersection/union:0;}
function refine(source,target,a,b){
 const aw=a.right-a.left,ah=a.bottom-a.top,acx=(a.left+a.right)/2,acy=(a.top+a.bottom)/2;
 const initial=[b.right-b.left,b.bottom-b.top,(b.left+b.right)/2,(b.top+b.bottom)/2],p=initial.slice();
 const matrix=q=>[q[0]/aw,0,q[2]-q[0]/aw*acx,0,q[1]/ah,q[3]-q[1]/ah*acy,0,0,1];
 const region={left:b.left-4,top:b.top-4,right:b.right+4,bottom:b.bottom+4};
 let score=overlap(source,target,region,matrix(p),2);
 for(const size of [1,.5,.25])for(let sweep=0;sweep<2;sweep++){
  let changed=false;
  for(let axis=0;axis<4;axis++)for(const sign of [-1,1]){
   const trial=p.slice();trial[axis]+=sign*size*(axis<2?2:1);
   if(trial[axis]<=0&&axis<2||Math.abs(trial[axis]-initial[axis])>(axis<2?4:3))continue;
   const next=overlap(source,target,region,matrix(trial),2);
   if(next>score+1e-9){p.splice(0,4,...trial);score=next;changed=true;}
  }
  if(!changed)break;
 }
 return matrix(p);
}
function textureError(source,target,map,region){
 let sum=0,count=0;
 for(let y=region.top;y<region.bottom;y++)for(let x=region.left;x<region.right;x++){
  const fx=(x+.5-map[2])/map[0]-source.left-.5,fy=(y+.5-map[5])/map[4]-source.top-.5,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;
  let a=0,r=255,g=255,b=255;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const px=x0+i,py=y0+j;if(px<0||py<0||px>=source.width||py>=source.height)continue;const o=(py*source.width+px)*4,w=(i?tx:1-tx)*(j?ty:1-ty),al=source.data[o+3]/255;a+=al*w;r+=(source.data[o]-255)*al*w;g+=(source.data[o+1]-255)*al*w;b+=(source.data[o+2]-255)*al*w;}
  const px=x-target.left,py=y-target.top;if(px<0||py<0||px>=target.width||py>=target.height)continue;const o=(py*target.width+px)*4,al=target.data[o+3]/255;if(a<=1/255&&al<=1/255)continue;
  sum+=Math.max(Math.abs(r-(255+(target.data[o]-255)*al)),Math.abs(g-(255+(target.data[o+1]-255)*al)),Math.abs(b-(255+(target.data[o+2]-255)*al)));count++;
 }
 return count?sum/count:Infinity;
}
export function recoverWarpCacheBasis(source,target,diagnostic=null){
 for(const image of [source,target])if(!image||image.data?.length!==image.width*image.height*4||!Number.isFinite(image.left)||!Number.isFinite(image.top))throw new Error('Invalid warp preview image');
 const a=bounds(source),b=bounds(target);if(!a||!b)return null;
 const region={left:Math.floor(Math.min(a.left,b.left)),top:Math.floor(Math.min(a.top,b.top)),right:Math.ceil(Math.max(a.right,b.right)),bottom:Math.ceil(Math.max(a.bottom,b.bottom))};
 if((region.right-region.left)*(region.bottom-region.top)>4000000)return null;
 const before=overlap(source,target,region);if(diagnostic)diagnostic.originalAlphaIoU=before;if(before>=.6)return null;
 const sx=(b.right-b.left)/(a.right-a.left),sy=(b.bottom-b.top)/(a.bottom-a.top);
 if(sx<.25||sx>4||sy<.25||sy>4)return null;
 const matrix=refine(source,target,a,b),fit=overlap(source,target,{left:b.left-4,top:b.top-4,right:b.right+4,bottom:b.bottom+4},matrix);if(diagnostic)diagnostic.correctedAlphaIoU=fit;if(fit<.975)return null;
 const error=textureError(source,target,matrix,b);if(diagnostic)diagnostic.textureMAE=error;if(error>25)return null;
 return {matrix,originalAlphaIoU:before,correctedAlphaIoU:fit,textureMAE:error,sourceBounds:a,previewBounds:b,provenance:'saved-preview constrained affine recovery'};
}
