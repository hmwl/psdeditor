





import { meshTopology } from './mesh.js';

export function warpAnchorsInRect(points, cols, rows, rect){
  const left=Math.min(rect.x0,rect.x1),right=Math.max(rect.x0,rect.x1),top=Math.min(rect.y0,rect.y1),bottom=Math.max(rect.y0,rect.y1);
  return meshTopology(cols,rows).anchors.filter(i=>points[i].x>=left&&points[i].x<=right&&points[i].y>=top&&points[i].y<=bottom);
}
export function warpSelectionBounds(points, selected){
  const ids=[...new Set(selected)].filter(i=>Number.isInteger(i)&&points[i]);
  if(!ids.length)return null;
  return {left:Math.min(...ids.map(i=>points[i].x)),top:Math.min(...ids.map(i=>points[i].y)),right:Math.max(...ids.map(i=>points[i].x)),bottom:Math.max(...ids.map(i=>points[i].y))};
}
export function translateWarpControls(points, cols, rows, selected, delta){
  if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y))throw new Error('Invalid warp selection displacement');
  const topology=meshTopology(cols,rows),moved=new Set();
  for(const anchor of new Set(selected)){
    if(topology.roles[anchor]!=='corner')throw new Error('Warp group selection must contain anchors');
    moved.add(anchor);for(const h of topology.anchorHandles[anchor])moved.add(h.i);
  }
  return points.map((p,i)=>({x:p.x+(moved.has(i)?delta.x:0),y:p.y+(moved.has(i)?delta.y:0)}));
}
