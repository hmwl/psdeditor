








import { shell } from './shell.js';
import { TRANSFORM_WARP_STYLES } from '../../core/transform-warp-presets.js';
const adapters=new Map();let active=null,bound=false,pending=0;
let hovering=false,dragging=false;
const guide={visible:true,display:'always',color:'#ffffff',opacity:100,density:2};
const $=id=>document.getElementById(id);
const guideSettings=()=>({...guide,visible:guide.display==='always'||guide.display==='auto'&&(hovering||dragging)});
function redrawGuides(){adapters.get(active)?.guidesChanged?.(guideSettings());}
function inWarpInput(event){
  if(!event.target?.closest?.('#stage,#gizmo,#gizmoView'))return false;
  const stage=$('stage'),viewport=$('viewport');if(!stage||!viewport||stage.hidden)return false;
  return [stage,viewport].every(el=>{const r=el.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;});
}
function updatePointer(event,end=false){
  const before=guideSettings().visible;hovering=inWarpInput(event);if(end)dragging=false;
  if(active&&before!==guideSettings().visible)redrawGuides();
}
const gridIds=['twGrid','twGridCols','twGridRows'],shapeIds=['twBend','twH','twV','twDirection'];
function closeGuides(){const panel=$('twGuidePanel');if(panel)panel.hidden=true;const button=$('twGuides');if(button)button.setAttribute('aria-expanded','false');}
function value(id,v){const el=$(id);if(el&&document.activeElement!==el)el.value=String(v);}
function sync(){
  const api=adapters.get(active),state=api?.state();if(!state){if(active)hide(active);return;}
  const host=$('grpTransformWarp');if(!host)return;host.hidden=false;
  const busy=!!pending||!!state.busy||state.enabled===false,custom=state.style==='warpCustom'||state.style==='warpNone',cylinder=state.style==='warpCylinder';
  for(const control of host.querySelectorAll('button,input,select'))control.disabled=busy;
  value('twStyle',state.style||'warpCustom');value('twBend',state.bend??50);value('twH',state.h??0);value('twV',state.v??0);value('twGrid',state.grid||'default');
  value('twGridCols',state.gridN?.[0]??3);value('twGridRows',state.gridN?.[1]??3);$('twCustomGrid').hidden=state.grid!=='custom';
  $('twCylinderParams').hidden=!cylinder;value('twCylinderTop',state.values?.[4]??.5);value('twCylinderBottom',state.values?.[5]??.5);value('twCylinderStrength',state.values?.[6]??.9);
  for(const id of shapeIds)$(id).disabled=busy||custom||cylinder;
  for(const id of gridIds)$(id).disabled=busy||!custom;
  for(const [id,direction]of[['twSplitBoth','both'],['twSplitVertical','u'],['twSplitHorizontal','v']]){
    $(id).disabled=busy||!custom;$(id).classList.toggle('on',state.split===direction);$(id).setAttribute('aria-pressed',String(state.split===direction));
  }
  $('twDirection').classList.toggle('on',!!state.vertical);$('twDirection').setAttribute('aria-pressed',String(!!state.vertical));
  value('twGuideDisplay',guide.display);value('twGuideColor',guide.color);value('twGuideOpacity',guide.opacity);value('twGuideDensity',guide.density);
}
async function invoke(method,...args){
  if(pending)return;const api=adapters.get(active);if(!api || api.state()?.busy || api.state()?.enabled===false)return;
  try{const result=api[method]?.(...args);if(result&&typeof result.then==='function'){pending++;sync();await result;}}
  catch(error){const message='变形操作没能完成：'+(error?.message||String(error));shell.status(message);const notice=$('err');if(notice)notice.textContent=message;}
  finally{if(pending)pending--;sync();}
}
function bind(){
  if(bound||!$('grpTransformWarp'))return;bound=true;
  const style=$('twStyle');style.append(new Option('无','warpNone'),new Option('自定','warpCustom'));for(const [key,label]of TRANSFORM_WARP_STYLES)if(key!=='warpNone')style.append(new Option(label,key));
  const click=(id,method,...args)=>$(id).addEventListener('click',()=>{if(!$(id).disabled)void invoke(method,...args);});
  click('twReset','reset');click('twToFree','toFree');click('twCancel','cancel');click('twConfirm','commit');click('twDirection','toggleDirection');
  click('twSplitBoth','setSplit','both');click('twSplitVertical','setSplit','u');click('twSplitHorizontal','setSplit','v');
  style.addEventListener('change',()=>{if(!style.disabled)void invoke('setStyle',style.value);});
  const changeGrid=()=>{if(!$('twGrid').disabled)void invoke('setGrid',$('twGrid').value,[Math.max(1,Math.min(50,+$('twGridCols').value||1)),Math.max(1,Math.min(50,+$('twGridRows').value||1))]);};
  for(const id of gridIds)$(id).addEventListener('change',changeGrid);
  const changeParams=()=>void invoke('setParams',{bend:Math.max(-100,Math.min(100,+$('twBend').value||0)),h:Math.max(-100,Math.min(100,+$('twH').value||0)),v:Math.max(-100,Math.min(100,+$('twV').value||0))});
  for(const id of ['twBend','twH','twV'])$(id).addEventListener('change',()=>{if(!$(id).disabled)changeParams();});
  for(const id of ['twCylinderTop','twCylinderBottom','twCylinderStrength'])$(id).addEventListener('change',()=>void invoke('setCylinderParams',{top:+$('twCylinderTop').value||0,bottom:+$('twCylinderBottom').value||0,strength:Math.max(0,Math.min(1,+$('twCylinderStrength').value||0))}));
  $('twGuides').addEventListener('click',()=>{const panel=$('twGuidePanel');panel.hidden=!panel.hidden;$('twGuides').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){const r=$('twGuides').getBoundingClientRect();panel.style.left=r.left+'px';panel.style.top=r.bottom+6+'px';}});
  const updateGuides=()=>{guide.display=$('twGuideDisplay').value;guide.color=$('twGuideColor').value;guide.opacity=Math.max(0,Math.min(100,+$('twGuideOpacity').value||0));guide.density=Math.max(0,Math.min(10,Math.round(+$('twGuideDensity').value||0)));redrawGuides();sync();};
  for(const id of ['twGuideDisplay','twGuideColor','twGuideOpacity','twGuideDensity'])$(id).addEventListener('input',updateGuides);
  $('twGuideDisplay').addEventListener('change',updateGuides);
  document.addEventListener('pointermove',event=>updatePointer(event),true);
  document.addEventListener('pointerdown',event=>{const before=guideSettings().visible;hovering=inWarpInput(event);if(hovering)dragging=true;if(active&&before!==guideSettings().visible)redrawGuides();},true);
  for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>updatePointer(event,true),true);
  document.addEventListener('pointerleave',event=>updatePointer(event),true);
  $('grpTransformWarp').addEventListener('keydown',e=>{if(e.target.matches('input,select')){e.stopPropagation();if(e.key==='Enter'){e.preventDefault();e.target.dispatchEvent(new Event('change'));e.target.blur();}if(e.key==='Escape'){e.preventDefault();e.target.blur();closeGuides();}}});
  document.addEventListener('pointerdown',e=>{if(!$('twGuidePanel').contains(e.target)&&!$('twGuides').contains(e.target))closeGuides();});
}
function show(kind){if(!adapters.has(kind))return false;bind();active=kind;document.querySelector('.app')?.classList.add('transform-warping');sync();return true;}
function hide(kind){if(kind&&active!==kind)return;active=null;closeGuides();const host=$('grpTransformWarp');if(host)host.hidden=true;document.querySelector('.app')?.classList.remove('transform-warping');}
export const transformWarpToolbar={
  register(kind,api){adapters.set(kind,api);bind();return()=>{adapters.delete(kind);hide(kind);};},show,hide,sync,
  guides:guideSettings,get active(){return active;},
};
