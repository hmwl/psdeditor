import { presetMesh, identityMesh, regridMesh } from '../../core/path-warp.js';
import { TRANSFORM_WARP_DEFAULTS } from '../../core/transform-warp-presets.js';
import { computeHomographyQuad, applyHomography } from '../../core/homography.js';
import { transformWarpToolbar } from './transform-warp-toolbar.js';
import { $ } from './app/01-boot.js';
import { li, pushHistory, dragState, set_dragState, snapshot, restore } from './app/02-doc-state.js';
import { presetControlMap, presetWarpHandles, hitPresetWarpHandle, dragPresetWarpHandle } from './preset-warp-controls.js';
import { applyMesh, commit } from './app/06-view-zoom-move.js';
import { setTool, set_splitOneShot } from './app/04-view-chrome.js';
import { returnWarpToFreeTransform } from './app/19-free-transform.js';
import { exitSO } from './app/22-deform-tools.js';
import { warpSession } from './app/26-layer-create.js';
import { drawGizmo } from './app/46-smart-filter-panel.js';
import { warpClear } from './warp-selection.js';
let applying=false;
const quadOf=()=>[li.points[0],li.points[li.xn-1],li.points[li.points.length-1],li.points[(li.yn-1)*li.xn]].map(p=>({...p}));
const currentMesh=()=>({points:li.points,cols:li.xn,rows:li.yn,sliceX:li.sliceX,sliceY:li.sliceY});
function state(){
 const w=warpSession?.toolbar;if(!w||!li?.points)return null;
 const nx=(li.xn-1)/3,ny=(li.yn-1)/3;
 return {...w,gridN:[nx,ny],split:$('#splitMode').checked?$('#splitDir').value:null,busy:!!dragState,enabled:true};
}
export function rasterWarpExportOptions(){const w=warpSession?.toolbar;return w?{style:w.style,bend:w.bend,h:w.h,v:w.v,vertical:w.vertical,frame:w.frame,values:w.values}:applying?li?.warpOptions:null;}
function mutate(fn){if(!warpSession?.toolbar||!li?.points)return;pushHistory();applying=true;try{fn();warpClear(li);commit();}finally{applying=false;transformWarpToolbar.sync();drawGizmo();}}
function preset(){
 const w=warpSession.toolbar,q=w.frame,wid=Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y),hgt=Math.hypot(q[3].x-q[0].x,q[3].y-q[0].y);
 const rect={x:0,y:0,w:wid,h:hgt},m=w.style==='warpNone'?identityMesh(rect):presetMesh(rect,{style:w.style,bend:w.bend/100,h:w.h/100,v:w.v/100,vertical:w.vertical,values:w.values,sourceSize:{width:li.width,height:li.height}});
 const H=computeHomographyQuad([0,0,wid,0,wid,hgt,0,hgt],q.flatMap(p=>[p.x,p.y]));if(!H)throw new Error('变形框已退化');
 m.points=m.points.map(p=>applyHomography(H,p.x,p.y));applyMesh(m);
}
transformWarpToolbar.register('raster',{
 state,
 setStyle(style){if(warpSession?.toolbar?.style===style)return;mutate(()=>{const w=warpSession.toolbar;if(TRANSFORM_WARP_DEFAULTS[style])w.bend=TRANSFORM_WARP_DEFAULTS[style].bend;w.style=style;if(style==='warpCylinder')w.values=[0,li.height,li.width,0,.5,.5,.9];if(style!=='warpCustom'){preset();w.grid='default';setTool(false);}});},
 reset(){mutate(()=>{warpSession.changedBeforeWarp=true;const w=warpSession.toolbar;Object.assign(w,{style:'warpNone',bend:0,h:0,v:0,vertical:false,grid:'default'});w.frame=w.originalFrame.map(p=>({...p}));preset();setTool(false);});},
 setGrid(value,gridN){
  if(!warpSession?.toolbar||!li?.points)return;
  const w=warpSession.toolbar,mesh=currentMesh();let nx=1,ny=1;
  if(value==='custom'){[nx,ny]=gridN;}else if(value!=='default')nx=ny=Number(value);
  nx=Math.max(1,Math.min(50,nx));ny=Math.max(1,Math.min(50,ny));
  const regular=(slice,n)=>slice.length===n-1&&slice.every((v,i)=>Math.abs(v-(i+1)/n)<1e-9);
  if(w.grid===value&&mesh.cols===3*nx+1&&mesh.rows===3*ny+1&&regular(mesh.sliceX,nx)&&regular(mesh.sliceY,ny))return;
  mutate(()=>{w.style='warpCustom';applyMesh(regridMesh(mesh,nx,ny),{preserveAppearance:mesh.cols===4&&mesh.rows===4});w.grid=value;});
 },
 setParams(params){if(Object.entries(params).every(([k,v])=>warpSession?.toolbar?.[k]===v))return;mutate(()=>{Object.assign(warpSession.toolbar,params);preset();});},
 setCylinderParams(params){const a=warpSession?.toolbar?.values;if(a&&a[4]===params.top&&a[5]===params.bottom&&a[6]===params.strength)return;mutate(()=>{const w=warpSession.toolbar;w.values=w.values.slice();w.values[4]=params.top;w.values[5]=params.bottom;w.values[6]=params.strength;preset();});},
 toggleDirection(){mutate(()=>{warpSession.toolbar.vertical=!warpSession.toolbar.vertical;preset();});},
 setSplit(dir){const off=$('#splitMode').checked&&$('#splitDir').value===dir;$('#splitDir').value=dir;set_splitOneShot(!off);setTool(!off);transformWarpToolbar.sync();},
 toFree:()=>returnWarpToFreeTransform(),cancel:()=>exitSO(false),commit:()=>exitSO(true),
 guidesChanged:()=>drawGizmo(),
});
export function startRasterWarpToolbar(map){
 if(!warpSession||!li?.points)return;
 if(!warpSession.toolbar){
  const nx=(li.xn-1)/3,ny=(li.yn-1)/3,saved=li.warpOptions;
  const q=(saved?.frame||li.unwarpedQuad||li.placementQuad||quadOf()).map(p=>map?applyHomography(map,p.x,p.y):({...p}));
  warpSession.toolbar={style:'warpCustom',bend:50,h:0,v:0,vertical:false,frame:q,originalFrame:q.map(p=>({...p})),grid:nx===1&&ny===1?'default':nx===ny&&[3,4,5].includes(nx)?String(nx):'custom-split'};
  if(saved&&saved.style!=='warpCustom')for(const k of ['style','bend','h','v','vertical','values'])warpSession.toolbar[k]=saved[k];
 }
 else if(map){const w=warpSession.toolbar;w.frame=w.frame.map(p=>applyHomography(map,p.x,p.y));w.originalFrame=w.originalFrame.map(p=>applyHomography(map,p.x,p.y));}
 transformWarpToolbar.show('raster');
}
export function rasterWarpGeometryChanged(){
 if(!warpSession?.toolbar||!li?.points||applying)return;
 const w=warpSession.toolbar;w.style='warpCustom';li.warpOptions=null;const nx=(li.xn-1)/3,ny=(li.yn-1)/3;
 if((nx>1||ny>1)&&w.grid==='default')w.grid='custom-split';transformWarpToolbar.sync();
}
export function rasterPresetHandles(){
 const w=warpSession?.toolbar;if(!w||!li?.points||li.deform||$('#splitMode').checked)return [];
 const size={width:li.width,height:li.height},map=presetControlMap(w.frame,size);
 return presetWarpHandles(w,size,map.forward);
}
export function beginRasterPresetHandle(point,tolerance){
 const handle=hitPresetWarpHandle(rasterPresetHandles(),point,tolerance);if(!handle)return false;
 const w=warpSession.toolbar,size={width:li.width,height:li.height},map=presetControlMap(w.frame,size);
 set_dragState({mode:'preset-handle',id:handle.id,before:snapshot(),options:JSON.parse(JSON.stringify(w)),start:map.inverse(point),map,size,moved:false});
 return true;
}
export function moveRasterPresetHandle(point){
 const d=dragState;if(d?.mode!=='preset-handle')return false;
 const to=d.map.inverse(point),next=dragPresetWarpHandle(d.options,d.id,d.start,to,d.size);
 const changed=JSON.stringify(next)!==JSON.stringify(d.options);d.moved=changed;
 applying=true;try{Object.assign(warpSession.toolbar,next);preset();commit();}finally{applying=false;transformWarpToolbar.sync();drawGizmo();}
 return true;
}
export function cancelRasterPresetHandle(){
 if(dragState?.mode!=='preset-handle')return false;
 const before=dragState.before;set_dragState(null);restore(before);transformWarpToolbar.sync();drawGizmo();return true;
}
export function stopRasterWarpToolbar(){transformWarpToolbar.hide('raster');}
export function preserveRasterWarpStyle(fn){applying=true;try{return fn();}finally{applying=false;}}
export function captureRasterWarpOptions(){return warpSession?.toolbar ? JSON.parse(JSON.stringify(warpSession.toolbar)) : null;}
export function restoreRasterWarpOptions(options,fn){if(options&&warpSession){warpSession.toolbar=JSON.parse(JSON.stringify(options));preserveRasterWarpStyle(fn);transformWarpToolbar.sync();}else fn();}
