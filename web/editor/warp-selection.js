import { warpAnchorsInRect, warpSelectionBounds } from '../../core/warp-control-selection.js';
let host=null,shape='',selected=new Set();
export let warpMarquee=null;
function ensure(li){const key=li?`${li.xn}:${li.yn}`:'';if(host!==li||shape!==key){host=li;shape=key;selected=new Set();warpMarquee=null;}return selected;}
export function warpSelected(li){return ensure(li);}
export function warpSelect(li,i,toggle=false){const s=ensure(li);if(toggle){if(s.has(i))s.delete(i);else s.add(i);}else if(!s.has(i)){s.clear();s.add(i);}return s;}
export function warpClear(li){ensure(li).clear();warpMarquee=null;}
export function warpBeginMarquee(li,p){warpMarquee={x0:p.x,y0:p.y,x1:p.x,y1:p.y,base:[...ensure(li)]};return warpMarquee;}
export function warpUpdateMarquee(li,p){const m=warpMarquee;if(!m)return; m.x1=p.x;m.y1=p.y;selected=new Set(m.base);for(const i of warpAnchorsInRect(li.points,li.xn,li.yn,m)){if(selected.has(i))selected.delete(i);else selected.add(i);}}
export function warpEndMarquee(){warpMarquee=null;}
export function drawWarpSelection(ctx,li){
 const s=ensure(li),box=s.size>1?warpSelectionBounds(li.points,s):null;
 ctx.save();ctx.strokeStyle='#0091ff';ctx.lineWidth=1;ctx.setLineDash([5,4]);
 if(box)ctx.strokeRect(box.left-8,box.top-8,box.right-box.left+16,box.bottom-box.top+16);
 if(warpMarquee){const m=warpMarquee;ctx.strokeRect(m.x0,m.y0,m.x1-m.x0,m.y1-m.y0);}
 ctx.restore();
}
