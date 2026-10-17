
import { buildRelightRenderState } from './relight.js';
import { buildRelightMaterials } from './relight-materials.js';
import { relightPassQuality } from './relight-lighting.js';

let contextPromise = null;
let activeContext = null;
let generation = 0;
let renderQueue = Promise.resolve();

const SHADER = `
struct Frame {
  dimensions: vec4<u32>,
  tile: vec4<u32>,
  camera: vec4<f32>,
  depthRange: vec4<f32>,
  controls: vec4<f32>,
  diffuse: vec4<f32>,
  material: vec4<f32>,
  lightPosition0: vec4<f32>,
  lightColor0: vec4<f32>,
  lightPosition1: vec4<f32>,
  lightColor1: vec4<f32>,
  lightPosition2: vec4<f32>,
  lightColor2: vec4<f32>,
  passDimensions: vec4<u32>,
  effects: vec4<f32>,
  eyes: array<vec4<f32>,4>,
}
struct ScenePixel { geometry: vec4<f32>, reflectance: vec4<f32>, auxiliary: vec4<f32>, surface: vec4<f32>, regions: vec4<f32>, material: vec4<f32>, original: vec4<f32>, }
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> scenePixels: array<ScenePixel>;
@group(0) @binding(2) var<storage, read> source: array<u32>;
@group(0) @binding(3) var<storage, read_write> result: array<u32>;
@group(0) @binding(4) var<storage, read_write> shadowMap: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> scratchMap: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> irradianceMap: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> bounceMap: array<vec4<f32>>;
fn sceneValue(index:u32, which:u32)->vec4<f32> {
  let s=scenePixels[index];
  if(which==0u){return s.geometry;} if(which==1u){return s.reflectance;} if(which==2u){return s.auxiliary;}
  if(which==3u){return s.surface;} if(which==4u){return s.regions;} if(which==5u){return s.material;} return s.original;
}
fn interpolateMap(p:vec2<f32>,which:u32)->vec4<f32>{
  let last=vec2<i32>(frame.dimensions.zw)-vec2<i32>(1); let v=clamp(p,vec2<f32>(0),vec2<f32>(last));
  let a=vec2<i32>(floor(v));let b=min(a+vec2<i32>(1),last);let t=fract(v);
  let ia=u32(a.y)*frame.dimensions.z+u32(a.x);let ib=u32(a.y)*frame.dimensions.z+u32(b.x);
  let ic=u32(b.y)*frame.dimensions.z+u32(a.x);let id=u32(b.y)*frame.dimensions.z+u32(b.x);
  return mix(mix(sceneValue(ia,which),sceneValue(ib,which),t.x),mix(sceneValue(ic,which),sceneValue(id,which),t.x),t.y);
}
fn interpolateSurface(p:vec2<f32>)->vec2<f32>{return interpolateMap(p,3u).xy;}
fn passValue(index:u32,which:u32)->vec4<f32>{if(which==0u){return shadowMap[index];}if(which==1u){return scratchMap[index];}if(which==2u){return irradianceMap[index];}return bounceMap[index];}
fn interpolatePass(pixel:vec2<f32>,which:u32)->vec4<f32>{
  var size=frame.passDimensions.xy;if(which==3u){size=frame.passDimensions.zw;}
  let v=clamp(pixel/vec2<f32>(frame.dimensions.zw)*vec2<f32>(size)-vec2<f32>(0.5),vec2<f32>(0),vec2<f32>(size-vec2<u32>(1)));
  let a=vec2<u32>(floor(v));let b=min(a+vec2<u32>(1),size-vec2<u32>(1));let t=fract(v);
  return mix(mix(passValue(a.y*size.x+a.x,which),passValue(a.y*size.x+b.x,which),t.x),mix(passValue(b.y*size.x+a.x,which),passValue(b.y*size.x+b.x,which),t.x),t.y);
}
fn guidedShadow(pixel:vec2<f32>,depth:f32,normal:vec3<f32>)->vec4<f32>{
  let ratio=vec2<f32>(frame.passDimensions.xy)/vec2<f32>(frame.dimensions.zw);let position=pixel*ratio-vec2<f32>(2);let base=vec2<i32>(floor(position));let fraction=fract(position);let last=vec2<i32>(frame.passDimensions.xy)-vec2<i32>(1);var sum=vec4<f32>(0);var weights=0.0;
  for(var y=0;y<5;y+=1){for(var x=0;x<5;x+=1){let q=clamp(base+vec2<i32>(x,y),vec2<i32>(0),last);let px=(vec2<f32>(q)+vec2<f32>(0.5))/ratio;let geometry=interpolateMap(px-vec2<f32>(0.5),0u);
    let wx=select(select(1.0,fraction.x,x==4),1.0-fraction.x,x==0);let wy=select(select(1.0,fraction.y,y==4),1.0-fraction.y,y==0);
    let weight=wx*wy*exp(-abs(geometry.w-depth)/max(0.02*depth,0.000001))*max(pow(max(dot(geometry.xyz,normal),0.0),8.0),0.02)+0.000001;
    sum+=shadowMap[u32(q.y)*frame.passDimensions.x+u32(q.x)]*weight;weights+=weight;
  }}return sum/max(weights,0.000001);
}
fn fromSrgb(color: vec3<f32>) -> vec3<f32> {
  return select(pow((color + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), color / 12.92, color <= vec3<f32>(0.04045));
}
fn toSrgb(color: vec3<f32>) -> vec3<f32> {
  let positive = max(color, vec3<f32>(0));
  return select(1.055 * pow(positive, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055), positive * 12.92, positive <= vec3<f32>(0.0031308));
}
fn safeDirection(vector: vec3<f32>, fallback: vec3<f32>) -> vec3<f32> {
  let squareLength = dot(vector, vector);
  if (squareLength < 0.00000001) { return fallback; }
  return vector * inverseSqrt(squareLength);
}
fn positionAt(pixel: vec2<f32>, distance: f32) -> vec3<f32> {
  return vec3<f32>((pixel - frame.camera.zw) / frame.camera.xy * distance, distance);
}
fn project(point: vec3<f32>) -> vec2<f32> {
  return point.xy / max(point.z, 0.000001) * frame.camera.xy + frame.camera.zw;
}
fn lightPosition(index: u32) -> vec4<f32> {
  if (index == 0u) { return frame.lightPosition0; }
  if (index == 1u) { return frame.lightPosition1; }
  return frame.lightPosition2;
}
fn lightColor(index: u32) -> vec4<f32> {
  if (index == 0u) { return frame.lightColor0; }
  if (index == 1u) { return frame.lightColor1; }
  return frame.lightColor2;
}
fn lampSample(center: vec3<f32>, radius: f32, point: vec3<f32>, index: u32, count: u32, rotation: f32) -> vec3<f32> {
  if (count < 2u) { return center; }
  let direction = safeDirection(center - point, vec3<f32>(0, 0, -1));
  let up = select(vec3<f32>(0, 1, 0), vec3<f32>(1, 0, 0), abs(direction.y) > 0.9);
  let tangent = safeDirection(cross(up, direction), vec3<f32>(1, 0, 0));
  let bitangent = cross(direction, tangent);
  let angle = f32(index) * 2.39996323 + rotation;
  let radial = radius * sqrt((f32(index) + 0.5) / f32(count));
  return center + radial * (cos(angle) * tangent + sin(angle) * bitangent);
}
fn traceBlocker(point:vec3<f32>,normal:vec3<f32>,light:vec3<f32>,edge:f32,steps:u32,contact:bool)->vec2<f32>{
  if(steps==0u || frame.controls.w==0.0 || frame.diffuse.x<=0.0){return vec2<f32>(1,-1);}
  let origin=point+normal*(0.002*point.z);var destination=light;let minimum=frame.depthRange.y*0.05;
  if(destination.z<minimum){if(origin.z<=minimum){return vec2<f32>(1,-1);}destination=origin+(destination-origin)*((origin.z-minimum)/(origin.z-destination.z));}
  let span=length(project(destination)-project(origin));if(span<1.5){return vec2<f32>(1,-1);}
  var begin=min(mix(6.0,2.0,clamp(edge,0.0,1.0))/span,0.5);if(contact){begin=min(1.5/span,0.5);}
  let hz=abs(destination.z-origin.z)/f32(steps)*0.5;var occ=0.0;var blocker=-1.0;
  for(var k=0u;k<64u;k+=1u){if(k>=steps){break;}let t=mix(begin,1.0,(f32(k)+0.5)/f32(steps));let q=mix(origin,destination,t);let px=project(q);
    if(any(px<vec2<f32>(0)) || any(px>=vec2<f32>(frame.dimensions.zw))){break;}
    let surface=interpolateMap(px-vec2<f32>(0.5),0u);let data=interpolateMap(px-vec2<f32>(0.5),2u);let opacity=interpolateMap(px-vec2<f32>(0.5),6u).w;
    let dz=q.z-surface.w;let foot=0.006*q.z;let bias=foot+2.0*hz;var amount=0.0;
    let thickness=select(0.35*frame.depthRange.w,0.025*frame.depthRange.w,contact);
    if(dz>bias && dz<thickness){amount=smoothstep(bias,bias+0.03*q.z,dz);}
    else if(point.z-surface.w>0.2*frame.depthRange.w && dz+hz>foot && dz-hz<thickness){amount=smoothstep(foot,foot+0.03*q.z,min(dz+hz,thickness));}
    amount*=mix(0.15,1.0,clamp(data.y,0.0,1.0))*opacity;
    if(contact){amount*=pow(1.0-t,2.0);}if(amount>occ){occ=amount;blocker=t/max(1.0-t,0.05);}if(occ>0.98){break;}
  }if(occ<=0.02){return vec2<f32>(1,-1);}return vec2<f32>(1.0-occ,blocker);
}
fn visibility(point:vec3<f32>,normal:vec3<f32>,light:vec3<f32>,edge:f32)->f32{return traceBlocker(point,normal,light,edge,u32(frame.controls.w),false).x;}
fn contactVisibility(point:vec3<f32>,normal:vec3<f32>,light:vec3<f32>,radius:f32)->f32{
  let vector=light-point;let distance=length(vector);let direction=vector/max(distance,0.000001);if(dot(normal,direction)<=0.0){return 1.0;}
  let extent=min(0.015*max(f32(frame.dimensions.z),f32(frame.dimensions.w))*point.z/frame.camera.x,distance*0.9);
  let raw=traceBlocker(point,normal,point+direction*extent,1.0,8u,true).x;
  return 1.0-(1.0-raw)*frame.diffuse.x*(1.0-0.75*smoothstep(0.05,0.6,radius/max(distance,0.000001)));
}
fn specularResponse(normal: vec3<f32>, direction: vec3<f32>, view: vec3<f32>, radius: f32, distance: f32, likelihood: f32) -> f32 {
  let towardLight = dot(normal, direction);
  if (towardLight <= 0.0) { return 0.0; }
  let halfway = safeDirection(direction + view, vec3<f32>(0));
  let towardViewer = clamp(dot(normal, view), 0.001, 1.0);
  let normalHalf = clamp(dot(normal, halfway), 0.0, 1.0);
  let viewerHalf = clamp(dot(view, halfway), 0.0, 1.0);
  let roughness = mix(0.55, 0.3, likelihood);
  let spread = clamp(roughness * roughness + radius / (3.0 * distance), 0.01, 1.0);
  let squareSpread = spread * spread;
  let denominator = normalHalf * normalHalf * (squareSpread - 1.0) + 1.0;
  let distribution = squareSpread / (3.14159265 * denominator * denominator);
  let masking = 0.5 / max(towardLight * sqrt(towardViewer * towardViewer * (1.0 - squareSpread) + squareSpread) + towardViewer * sqrt(towardLight * towardLight * (1.0 - squareSpread) + squareSpread), 0.00001);
  let fresnel = 0.04 + 0.96 * pow(1.0 - viewerHalf, 5.0);
  let reflected = min(6.0, distribution * masking * fresnel * towardLight * pow(roughness, 4.0) / squareSpread);
  return reflected * 0.6 * mix(0.4, 1.0, likelihood);
}
fn skinSpecular(n:vec3<f32>,ld:vec3<f32>,v:vec3<f32>,radius:f32,distance:f32,rough:f32,detail:f32)->f32{
  let nl=dot(n,ld);if(nl<=0.0){return 0.0;}let h=safeDirection(ld+v,vec3<f32>(0));let nv=max(dot(n,v),0.001);let nh=max(dot(n,h),0.0);let vh=max(dot(v,h),0.0);
  let widen=radius/(3.0*max(distance,0.000001));let a1=rough*rough*0.5625;let a2=rough*rough*1.69;let e1=clamp(a1+widen,0.01,1.0);let e2=clamp(a2+widen,0.01,1.0);
  let den1=nh*nh*(e1*e1-1.0)+1.0;let den2=nh*nh*(e2*e2-1.0)+1.0;
  let distribution=0.85*a1*a1/(3.14159265*den1*den1)+0.15*a2*a2/(3.14159265*den2*den2);
  let masking=0.5/max(nl*sqrt(nv*nv*(1.0-e1)+e1)+nv*sqrt(nl*nl*(1.0-e1)+e1),0.00001);
  return min(6.0,distribution*masking*nl*(0.028+0.972*pow(1.0-vh,5.0)))*clamp(1.0+0.4*detail,0.2,1.6);
}
fn hairSpecular(n:vec3<f32>,ld:vec3<f32>,v:vec3<f32>,angle:f32,radius:f32,distance:f32,detail:f32,albedo:vec3<f32>)->vec3<f32>{
  let tangent0=vec3<f32>(cos(angle),sin(angle),0);let tangent=safeDirection(tangent0-n*dot(tangent0,n),vec3<f32>(0,1,0));let h=safeDirection(ld+v,vec3<f32>(0));
  let jitter=clamp(detail,-0.3,0.3)*0.4;let t1=safeDirection(tangent+n*(0.05+jitter),tangent);let t2=safeDirection(tangent-n*(0.075-jitter),tangent);
  let exponent=mix(140.0,16.0,clamp(radius/max(distance,0.000001),0.0,1.0));let s1=pow(sqrt(max(1.0-pow(dot(t1,h),2.0),0.0)),exponent);let s2=pow(sqrt(max(1.0-pow(dot(t2,h),2.0),0.0)),exponent*0.35);
  return (vec3<f32>(s1)+albedo*1.5*s2)*0.025*smoothstep(-0.1,0.4,dot(n,ld))*clamp(1.0+6.0*detail,0.0,2.0);
}
fn eyeLight(pixel:vec2<f32>,open:f32,albedo:vec3<f32>,vis:vec4<f32>)->vec3<f32>{
  var sum=vec3<f32>(0);for(var e=0u;e<4u;e+=1u){if(e>=u32(frame.effects.w)){break;}let eye=frame.eyes[e];let offset=pixel-eye.xy;let rr=length(offset);if(rr>=eye.z){continue;}
    let rc=1.35*eye.z;let uv=offset/max(rc,0.001);let n=vec3<f32>(uv,-sqrt(max(1.0-dot(uv,uv),0.0)));let p=positionAt(eye.xy,eye.w);let v=safeDirection(-p,vec3<f32>(0,0,-1));let reflection=reflect(-v,n);let rim=1.0-smoothstep(eye.z-1.0,eye.z,rr);
    for(var li=0u;li<3u;li+=1u){if(li>=frame.tile.z){break;}let light=lightPosition(li);let color=lightColor(li);let delta=light.xyz-p;let distance=max(length(delta),0.000001);let ld=delta/distance;
      let sinA=clamp(light.w/distance,0.0,0.9);let aperture=max(asin(sinA),2.4/max(rc,0.001));let edge=2.0/max(rc,0.001);let angle=acos(clamp(dot(reflection,ld),-1.0,1.0));let disk=1.0-smoothstep(aperture-edge*0.5,aperture+edge*0.5,angle);
      let f=0.025+0.975*pow(1.0-max(dot(n,v),0.0),5.0);let attenuation=frame.controls.z/max(distance*distance+light.w*light.w*0.5,frame.controls.z*0.01);
      let emit=smoothstep(0.0,1.0,max(dot(ld,v),0.0));sum+=color.xyz*disk*min(f/(3.14159265*max(sinA*sinA,0.004)),3.0)*attenuation*emit*1.5*vis[li]*rim;
      if(rr>0.5 && length(ld.xy)>0.001){let far=max(dot(offset/rr,-normalize(ld.xy)),0.0)*smoothstep(0.25,0.85,rr/eye.z);sum+=albedo*color.xyz*far*far*clamp(dot(ld,v)*1.5+0.3,0.0,1.0)*attenuation*0.35*vis[li]*rim;}
    }
  }return sum*open;
}
fn shoulder(value: vec3<f32>, base: vec3<f32>) -> vec3<f32> {
  let remaining = max(vec3<f32>(1) - base, vec3<f32>(0));
  let relative = max(value - base, vec3<f32>(0)) / max(remaining, vec3<f32>(0.000001));
  let over = max(relative - vec3<f32>(0.6), vec3<f32>(0)) / 0.4;
  let compressed = select(vec3<f32>(0.6) + 0.4 * over / (vec3<f32>(1) + over), relative, relative <= vec3<f32>(0.6));
  return base + remaining * compressed;
}
fn gridPixel(id:vec2<u32>)->vec2<f32>{return (vec2<f32>(id)+vec2<f32>(0.5))*vec2<f32>(frame.dimensions.zw)/vec2<f32>(frame.passDimensions.xy);}
fn fieldGeometry(id:vec2<i32>)->vec4<f32>{let q=clamp(id,vec2<i32>(0),vec2<i32>(frame.passDimensions.xy)-vec2<i32>(1));return interpolateMap(gridPixel(vec2<u32>(q))-vec2<f32>(0.5),0u);}
@compute @workgroup_size(8,8)
fn shadowPass(@builtin(global_invocation_id)g:vec3<u32>){
  if(any(g.xy>=frame.passDimensions.xy)){return;}let index=g.y*frame.passDimensions.x+g.x;let pixel=gridPixel(g.xy);let data=interpolateMap(pixel-vec2<f32>(0.5),0u);let aux=interpolateMap(pixel-vec2<f32>(0.5),2u);
  let p=positionAt(pixel,data.w);let n=safeDirection(data.xyz,vec3<f32>(0,0,-1));let opacity=interpolateMap(pixel-vec2<f32>(0.5),6u).w;var out=vec4<f32>(1,1,1,-1);
  let rotation=fract(52.9829189*fract(f32(g.x)*0.06711056+f32(g.y)*0.00583715))*6.2831853;
  if(opacity>0.0 && frame.controls.w>0.0){for(var li=0u;li<3u;li+=1u){if(li>=frame.tile.z){break;}let lamp=lightPosition(li);if(dot(n,lamp.xyz-p)<-lamp.w){continue;}
    let count=select(max(frame.tile.w,1u),1u,lamp.w<=frame.depthRange.w*0.004);var sum=0.0;var blocker=0.0;var blocked=0.0;
    for(var k=0u;k<16u;k+=1u){if(k>=count){break;}let v=traceBlocker(p,n,lampSample(lamp.xyz,lamp.w,p,k,count,rotation),aux.y,u32(frame.controls.w),false);sum+=v.x;if(v.y>=0.0){blocker+=v.y*(1.0-v.x);blocked+=1.0-v.x;}}
    out[li]=1.0-(1.0-sum/f32(count))*frame.diffuse.x;if(blocked>0.0){out.w=max(out.w,blocker/blocked);}
  }}shadowMap[index]=out;
}
fn shadowBlur(g:vec2<u32>,direction:vec2<i32>,which:u32){
  if(any(g>=frame.passDimensions.xy)){return;}let size=vec2<i32>(frame.passDimensions.xy);let index=g.y*frame.passDimensions.x+g.x;let center=passValue(index,which);let geo=fieldGeometry(vec2<i32>(g));let normal=safeDirection(geo.xyz,vec3<f32>(0,0,-1));
  var sigma=vec3<f32>(0);for(var li=0u;li<3u;li+=1u){if(li>=frame.tile.z){break;}sigma[li]=0.03*max(f32(frame.dimensions.z),f32(frame.dimensions.w))*sqrt(clamp(lightPosition(li).w/(0.8*frame.depthRange.w),0.0,1.0))*f32(frame.passDimensions.x)/f32(frame.dimensions.z);}
  var blocker=center.w;let maxSigma=max(max(sigma.x,sigma.y),sigma.z);let step=max(1,i32(ceil(maxSigma*1.6*2.5/10.0)));let taps=min(10,i32(ceil(maxSigma*1.6*2.5/f32(step))));
  for(var k=-10;k<=10;k+=1){if(abs(k)>taps){continue;}let q=clamp(vec2<i32>(g)+direction*k*step,vec2<i32>(0),size-vec2<i32>(1));let z=fieldGeometry(q).w;if(abs(z-geo.w)<0.03*geo.w){blocker=max(blocker,passValue(u32(q.y)*frame.passDimensions.x+u32(q.x),which).w);}}
  let factor=select(1.0,clamp(1.0+blocker/0.5,1.0,1.6),blocker>=0.0);sigma*=factor;var sum=vec3<f32>(0);var weights=vec3<f32>(0);
  for(var k=-10;k<=10;k+=1){if(abs(k)>taps){continue;}let q=clamp(vec2<i32>(g)+direction*k*step,vec2<i32>(0),size-vec2<i32>(1));let sampleGeo=fieldGeometry(q);let normalWeight=max(0.02,pow(max(dot(normal,safeDirection(sampleGeo.xyz,normal)),0.0),4.0));
    let depthWeight=exp(-abs(sampleGeo.w-geo.w)/max(0.02*geo.w,0.000001));let offset=f32(k*step);let weight=exp(-0.5*offset*offset/max(sigma*sigma,vec3<f32>(0.04)))*depthWeight*normalWeight;
    sum+=passValue(u32(q.y)*frame.passDimensions.x+u32(q.x),which).xyz*weight;weights+=weight;
  }let result=vec4<f32>(sum/max(weights,vec3<f32>(0.000001)),blocker);if(which==0u){scratchMap[index]=result;}else{shadowMap[index]=result;}
}
@compute @workgroup_size(8,8)fn shadowH(@builtin(global_invocation_id)g:vec3<u32>){shadowBlur(g.xy,vec2<i32>(1,0),0u);}
@compute @workgroup_size(8,8)fn shadowV(@builtin(global_invocation_id)g:vec3<u32>){shadowBlur(g.xy,vec2<i32>(0,1),1u);}
fn directIrradiance(pixel:vec2<f32>,normal:vec3<f32>,point:vec3<f32>,skin:f32,scatter:f32,vis:vec4<f32>,ao:f32,background:f32)->vec3<f32>{
  var out=vec3<f32>(0);let phase=fract(52.9829189*fract(pixel.x*0.06711056+pixel.y*0.00583715))*6.2831853;let count=max(frame.tile.w,1u);
  for(var li=0u;li<3u;li+=1u){if(li>=frame.tile.z){break;}let lamp=lightPosition(li);let color=lightColor(li);var diffuse=vec3<f32>(0);
    for(var k=0u;k<16u;k+=1u){if(k>=count){break;}let emitter=lampSample(lamp.xyz,lamp.w,point,k,count,phase);let delta=emitter-point;let d2=max(dot(delta,delta),0.00000001);let ld=delta*inverseSqrt(d2);let back=clamp(dot(ld,safeDirection(point,vec3<f32>(0,0,1))),0.0,1.0);
      let wrap=min(vec3<f32>((0.3+2.5*lamp.w*inverseSqrt(d2))*(1.0-back))+vec3<f32>(1,0.5,0.25)*skin*max(scatter,0.25),vec3<f32>(0.9));let angular=pow(clamp((vec3<f32>(dot(normal,ld))+wrap)/(vec3<f32>(1)+wrap),vec3<f32>(0),vec3<f32>(1)),(vec3<f32>(1)+wrap)*(1.0+2.0*back));
      let aim=vec3<f32>(0,0,frame.depthRange.x)-lamp.xyz;let cosEmission=max(dot(safeDirection(aim,vec3<f32>(0,0,1)),safeDirection(point-emitter,vec3<f32>(0,0,1))),0.0);
      let emission=mix(1.0,pow(cosEmission,4.0),smoothstep(0.0,1.0,dot(aim,aim)/max(0.25*frame.controls.z,0.000001)));
      diffuse+=angular*background*frame.controls.z/max(d2+lamp.w*lamp.w*0.5,frame.controls.z*0.01)*emission;
    }
    let centerDistance=max(length(lamp.xyz-point),0.000001);let aoLight=mix(1.0,ao,0.6*mix(0.35,1.0,smoothstep(0.05,0.6,lamp.w/centerDistance)));
    out+=color.xyz*diffuse/f32(count)*0.55*aoLight*vis[li];
  }return out;
}
@compute @workgroup_size(8,8)fn irradiancePass(@builtin(global_invocation_id)g:vec3<u32>){
  if(any(g.xy>=frame.passDimensions.xy)){return;}let index=g.y*frame.passDimensions.x+g.x;let pixel=gridPixel(g.xy);let location=pixel-vec2<f32>(0.5);let geo=interpolateMap(location,0u);let original=interpolateMap(location,6u);let aux=interpolateMap(location,2u);
  if(original.w<=0.0 || aux.z>0.5){irradianceMap[index]=vec4<f32>(0);return;}let regions=interpolateMap(location,4u);let material=interpolateMap(location,5u);let surface=interpolateSurface(location);let p=positionAt(pixel,geo.w);let n=safeDirection(geo.xyz,vec3<f32>(0,0,-1));
  irradianceMap[index]=vec4<f32>(directIrradiance(pixel,n,p,regions.x,material.z,shadowMap[index],surface.y,1.0-0.75*surface.x),1.0);
}
fn diffusionBlur(g:vec2<u32>,direction:vec2<i32>,which:u32){
  if(any(g>=frame.passDimensions.xy)){return;}let size=vec2<i32>(frame.passDimensions.xy);let index=g.y*frame.passDimensions.x+g.x;let center=passValue(index,which);let radius=frame.effects.x*f32(frame.passDimensions.x)/f32(frame.dimensions.z);let depth=fieldGeometry(vec2<i32>(g)).w;
  if(radius<0.5 || center.w<=0.0){if(which==2u){scratchMap[index]=center;}else{irradianceMap[index]=center;}return;}
  let sigma=max(vec3<f32>(radius,radius*0.5,radius*0.25),vec3<f32>(0.2));let step=max(1,i32(ceil(radius*2.5/12.0)));let taps=min(12,i32(ceil(radius*2.5/f32(step))));var sum=vec3<f32>(0);var weights=vec3<f32>(0);
  for(var k=-12;k<=12;k+=1){if(abs(k)>taps){continue;}let q=clamp(vec2<i32>(g)+direction*k*step,vec2<i32>(0),size-vec2<i32>(1));let value=passValue(u32(q.y)*frame.passDimensions.x+u32(q.x),which);if(value.w<=0.0){continue;}
    let dz=abs(fieldGeometry(q).w-depth);let offset=f32(k*step);let weight=exp(-0.5*offset*offset/(sigma*sigma))*exp(-dz/max(0.05*depth,0.000001));sum+=value.xyz*weight;weights+=weight;
  }let result=vec4<f32>(sum/max(weights,vec3<f32>(0.000001)),center.w);if(which==2u){scratchMap[index]=result;}else{irradianceMap[index]=result;}
}
@compute @workgroup_size(8,8)fn diffusionH(@builtin(global_invocation_id)g:vec3<u32>){diffusionBlur(g.xy,vec2<i32>(1,0),2u);}
@compute @workgroup_size(8,8)fn diffusionV(@builtin(global_invocation_id)g:vec3<u32>){diffusionBlur(g.xy,vec2<i32>(0,1),1u);}
fn mipSize(level:u32)->vec2<u32>{return max(frame.passDimensions.zw>>vec2<u32>(level),vec2<u32>(1));}
fn mipOffset(level:u32)->u32{var offset=0u;for(var l=0u;l<16u;l+=1u){if(l>=level){break;}let size=mipSize(l);offset+=size.x*size.y;}return offset;}
fn sourceRadiance(pixel:vec2<f32>)->vec4<f32>{
  let location=pixel-vec2<f32>(0.5);let geo=interpolateMap(location,0u);let alpha=interpolateMap(location,6u).w;let far=interpolateMap(location,2u).z;
  if(alpha<=0.0 || far>0.5){return vec4<f32>(0);}let p=positionAt(pixel,geo.w);let normal=safeDirection(geo.xyz,vec3<f32>(0,0,-1));let visibility=interpolatePass(pixel,0u);let backdrop=interpolateSurface(location).x;var diffuse=vec3<f32>(0);
  for(var li=0u;li<3u;li+=1u){if(li>=frame.tile.z){break;}let lamp=lightPosition(li);let delta=lamp.xyz-p;let d2=max(dot(delta,delta),0.00000001);let ld=delta*inverseSqrt(d2);let back=clamp(dot(ld,safeDirection(p,vec3<f32>(0,0,1))),0.0,1.0);let wrap=0.3*(1.0-back);let response=pow(clamp((dot(normal,ld)+wrap)/(1.0+wrap),0.0,1.0),(1.0+wrap)*(1.0+2.0*back));
    let aim=vec3<f32>(0,0,frame.depthRange.x)-lamp.xyz;let emitted=pow(max(dot(safeDirection(aim,vec3<f32>(0,0,1)),-ld),0.0),4.0);let emission=mix(1.0,emitted,smoothstep(0.0,1.0,dot(aim,aim)/max(0.25*frame.controls.z,0.000001)));
    let attenuation=(1.0-0.75*backdrop)*frame.controls.z/max(d2+lamp.w*lamp.w*0.5,frame.controls.z*0.01)*emission;
    diffuse+=lightColor(li).xyz*response*attenuation*visibility[li]*0.55;
  }return vec4<f32>(interpolateMap(location,1u).xyz*diffuse*(1.0-far),1.0);
}
@compute @workgroup_size(8,8)fn sourceRadiancePass(@builtin(global_invocation_id)g:vec3<u32>){if(any(g.xy>=frame.passDimensions.zw)){return;}let pixel=(vec2<f32>(g.xy)+vec2<f32>(0.5))*vec2<f32>(frame.dimensions.zw)/vec2<f32>(frame.passDimensions.zw);scratchMap[g.y*frame.passDimensions.z+g.x]=sourceRadiance(pixel);}
@compute @workgroup_size(8,8)fn mipRadiancePass(@builtin(global_invocation_id)g:vec3<u32>){let level=u32(frame.effects.y);let size=mipSize(level);if(any(g.xy>=size)){return;}let previous=mipSize(level-1u);let begin=mipOffset(level-1u);var sum=vec4<f32>(0);for(var y=0u;y<2u;y+=1u){for(var x=0u;x<2u;x+=1u){let q=min(g.xy*2u+vec2<u32>(x,y),previous-vec2<u32>(1));sum+=scratchMap[begin+q.y*previous.x+q.x];}}scratchMap[mipOffset(level)+g.y*size.x+g.x]=sum*0.25;}
fn radianceAt(pixel:vec2<f32>,level:u32)->vec4<f32>{let size=mipSize(level);let v=clamp(pixel/vec2<f32>(frame.dimensions.zw)*vec2<f32>(size)-vec2<f32>(0.5),vec2<f32>(0),vec2<f32>(size-vec2<u32>(1)));let a=vec2<u32>(floor(v));let b=min(a+vec2<u32>(1),size-vec2<u32>(1));let t=fract(v);let begin=mipOffset(level);return mix(mix(scratchMap[begin+a.y*size.x+a.x],scratchMap[begin+a.y*size.x+b.x],t.x),mix(scratchMap[begin+b.y*size.x+a.x],scratchMap[begin+b.y*size.x+b.x],t.x),t.y);}
@compute @workgroup_size(8,8)fn bouncePass(@builtin(global_invocation_id)g:vec3<u32>){
  if(any(g.xy>=frame.passDimensions.zw)){return;}let index=g.y*frame.passDimensions.z+g.x;let ratio=vec2<f32>(frame.dimensions.zw)/vec2<f32>(frame.passDimensions.zw);let pixel=(vec2<f32>(g.xy)+vec2<f32>(0.5))*ratio;let geo=interpolateMap(pixel-vec2<f32>(0.5),0u);let p=positionAt(pixel,geo.w);let n=safeDirection(geo.xyz,vec3<f32>(0,0,-1));
  var sum=vec3<f32>(0);let count=u32(frame.effects.z);let radius=0.3*max(f32(frame.passDimensions.z),f32(frame.passDimensions.w));let sampleArea=3.14159265*radius*radius/f32(max(count,1u));let lod=clamp(log2(max(sqrt(sampleArea),1.0)),0.0,frame.effects.y);let low=u32(floor(lod));let high=min(low+1u,u32(frame.effects.y));
  for(var k=0u;k<64u;k+=1u){if(k>=count){break;}let angle=f32(k)*2.39996323;let offset=vec2<f32>(cos(angle),sin(angle))*radius*sqrt((f32(k)+0.5)/f32(count));let q=pixel+offset*ratio;
    if(any(q<vec2<f32>(0)) || any(q>=vec2<f32>(frame.dimensions.zw))){continue;}let donor=interpolateMap(q-vec2<f32>(0.5),0u);let point=positionAt(q,donor.w);let delta=point-p;let d2=max(dot(delta,delta),0.000001);let direction=delta*inverseSqrt(d2);let radiance=mix(radianceAt(q,low),radianceAt(q,high),fract(lod));if(radiance.w<=0.001){continue;}
    let worldPixel=donor.w*ratio.x/frame.camera.x;let area=sampleArea*worldPixel*worldPixel;let weight=max(dot(n,direction),0.0)*max(-dot(safeDirection(donor.xyz,n),direction),0.0)*area/(3.14159265*d2+area);
    sum+=radiance.xyz/radiance.w*weight;
  }bounceMap[index]=vec4<f32>(sum,1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= frame.dimensions.x || id.y >= frame.tile.y) { return; }
  let index = id.y * frame.dimensions.x + id.x;
  let word = source[index];
  let alpha = word >> 24u;
  if (alpha == 0u || frame.controls.y == 0.0 || (frame.controls.x == 1.0 && frame.tile.z == 0u)) {
    result[index] = word;
    return;
  }
  let encoded = vec3<f32>(f32(word & 255u), f32((word >> 8u) & 255u), f32((word >> 16u) & 255u)) / 255.0;
  let original = fromSrgb(encoded);
  let pixel = (vec2<f32>(f32(id.x) + 0.5, f32(id.y + frame.tile.x) + 0.5) / vec2<f32>(frame.dimensions.xy)) * vec2<f32>(frame.dimensions.zw);
  let location = pixel - vec2<f32>(0.5);
  let surface = interpolateMap(location, 0u);
  let material = interpolateMap(location, 1u);
  let properties = interpolateMap(location, 2u);
  let surfaceDetail = interpolateSurface(location);
  let regions = interpolateMap(location,4u);
  let surfaceMaterial = interpolateMap(location,5u);
  let softVisibility = guidedShadow(pixel,surface.w,safeDirection(surface.xyz,vec3<f32>(0,0,-1)));
  let normal = safeDirection(surface.xyz, vec3<f32>(0, 0, -1));
  let point = positionAt(pixel, surface.w);
  let view = safeDirection(-point, vec3<f32>(0, 0, -1));
  let albedo = max(material.xyz, vec3<f32>(0)) * exp(clamp(material.w, -1.5, 1.5) * frame.material.z);
  var irradiance = vec3<f32>(0);
  var added = vec3<f32>(0);
  let phase = fract(52.9829189 * fract(pixel.x * 0.06711056 + pixel.y * 0.00583715)) * 6.2831853;
  for (var lamp = 0u; lamp < 3u; lamp += 1u) {
    if (lamp >= frame.tile.z) { break; }
    let center = lightPosition(lamp);
    let color = lightColor(lamp);
    if (color.w <= 0.0) { continue; }
    var diffuseSum = vec3<f32>(0);
    var specularSum = 0.0;
    var visibilitySum = 0.0;
    var hairSum = vec3<f32>(0);
    var attenuationSum = 0.0;
    let count = max(frame.tile.w, 1u);
    for (var sample = 0u; sample < 16u; sample += 1u) {
      if (sample >= count) { break; }
      let emitter = lampSample(center.xyz, center.w, point, sample, count, phase);
      let vector = emitter - point;
      let distanceSquared = max(dot(vector, vector), 0.00000001);
      let direction = vector * inverseSqrt(distanceSquared);
      let behind = clamp(dot(direction, safeDirection(point, vec3<f32>(0, 0, 1))), 0.0, 1.0);
      let wrap = min(vec3<f32>((frame.diffuse.z + frame.diffuse.w * center.w * inverseSqrt(distanceSquared)) * (1.0 - behind)) + vec3<f32>(1,0.5,0.25)*regions.x*max(surfaceMaterial.z,0.25),vec3<f32>(0.9));
      let response = pow(clamp((vec3<f32>(dot(normal,direction))+wrap)/(vec3<f32>(1)+wrap),vec3<f32>(0),vec3<f32>(1)),(vec3<f32>(1)+wrap)*(1.0+2.0*behind));
      let attenuation = frame.controls.z / max(distanceSquared + 0.5 * center.w * center.w, frame.controls.z * 0.01);
      let aim = vec3<f32>(0, 0, frame.depthRange.x) - center.xyz;
      let emitted = pow(max(dot(safeDirection(aim, vec3<f32>(0, 0, 1)), safeDirection(point - emitter, vec3<f32>(0, 0, 1))), 0.0), 4.0);
      let angular = mix(1.0, emitted, smoothstep(0.0, 1.0, dot(aim, aim) / max(0.25 * frame.controls.z, 0.00000001)));
      let background = 1.0 - 0.75 * clamp(surfaceDetail.x, 0.0, 1.0);
      let falloff = attenuation * angular * background;
      var visible = 1.0;
      visible = min(softVisibility[lamp], contactVisibility(point,normal,center.xyz,center.w));
      diffuseSum += response * falloff;
      let specular = mix(specularResponse(normal,direction,view,center.w,sqrt(distanceSquared),clamp(properties.w,0.0,1.0)),skinSpecular(normal,direction,view,center.w,sqrt(distanceSquared),surfaceMaterial.x,material.w),clamp(regions.z,0.0,1.0));
      specularSum += specular*falloff;

      visibilitySum += visible;
      attenuationSum += falloff;
    }
    let visible = visibilitySum / f32(count);
    let centerDistance = max(length(center.xyz - point), 0.000001);
    let occlusionMix = 0.6 * mix(0.35, 1.0, smoothstep(0.05, 0.6, center.w / centerDistance));
    let ambientOcclusion = mix(1.0, clamp(surfaceDetail.y, 0.0, 1.0), occlusionMix);
    diffuseSum *= ambientOcclusion;
    specularSum *= mix(1.0, ambientOcclusion, 0.5);
    let centralDirection = safeDirection(center.xyz - point, vec3<f32>(0, 0, -1));
    let normalViewer = clamp(dot(normal, view), 0.001, 1.0);
    let side = clamp(dot(normal.xy, centralDirection.xy) / max(length(centralDirection.xy), 0.001) * 2.0, 0.0, 1.0);
    let rim = frame.material.x * pow(1.0 - normalViewer, frame.material.y) * clamp(-dot(centralDirection, view) + 0.2, 0.0, 1.0) * side * attenuationSum / f32(count);
    let aimHair=vec3<f32>(0,0,frame.depthRange.x)-center.xyz;let emissionHair=mix(1.0,pow(max(dot(safeDirection(aimHair,vec3<f32>(0,0,1)),-centralDirection),0.0),4.0),smoothstep(0.0,1.0,dot(aimHair,aimHair)/max(0.25*frame.controls.z,0.000001)));
    let attenuationHair=frame.controls.z/max(centerDistance*centerDistance+center.w*center.w*0.5,frame.controls.z*0.01)*emissionHair*(1.0-0.75*surfaceDetail.x);
    hairSum=hairSpecular(normal,centralDirection,view,surfaceMaterial.y,center.w,centerDistance,material.w,albedo)*regions.y*clamp(properties.y,0.0,1.0)*attenuationHair*f32(count);
    let diffuseRadiance = color.xyz * diffuseSum / f32(count) * frame.diffuse.y * visible;
    irradiance += diffuseRadiance;
    added += color.xyz * (vec3<f32>(specularSum / f32(count)) + hairSum/f32(count) + albedo*rim)*visible;
  }
  let scattered = interpolatePass(pixel,2u);
  let share = vec3<f32>(0.85,0.6,0.4)*clamp(regions.x,0.0,1.0);
  added += albedo*mix(irradiance,scattered.xyz/max(scattered.w,0.000001),share);
  added += albedo*interpolatePass(pixel,3u).xyz*3.0*clamp(surfaceDetail.y,0.0,1.0);
  added += eyeLight(pixel,regions.w,albedo,softVisibility);
  added *= 1.0 - clamp(properties.z, 0.0, 1.0);
  var base = original * frame.controls.x;
  let largest = max(max(irradiance.x, irradiance.y), irradiance.z);
  if (largest > 0.000001) {
    let yAdded = dot(added, vec3<f32>(0.2126, 0.7152, 0.0722));
    let dominance = frame.material.w * yAdded / (yAdded + dot(base, vec3<f32>(0.2126, 0.7152, 0.0722)) + 0.00001);
    base *= mix(vec3<f32>(1), irradiance / largest, dominance);
  }
  let lit = shoulder(base + added, base);
  let blended = mix(original, lit, frame.controls.y);
  if (any((bitcast<vec3<u32>>(blended) & vec3<u32>(0x7f800000u)) == vec3<u32>(0x7f800000u))) {
    result[index] = word;
    return;
  }
  let bytes = vec3<u32>(round(clamp(toSrgb(blended), vec3<f32>(0), vec3<f32>(1)) * 255.0));
  result[index] = bytes.x | (bytes.y << 8u) | (bytes.z << 16u) | (alpha << 24u);
}
`;

async function getContext() {
  if (!contextPromise) {
    const epoch = generation;
    const requested = (async () => {
      if (typeof navigator === 'undefined' || !navigator.gpu) return null;
      let adapter; try { adapter = await navigator.gpu.requestAdapter(); } catch { return null; }
      if (!adapter || epoch !== generation) return null;
      let device; try { device = await adapter.requestDevice(); } catch { return null; }
      if (epoch !== generation) { device.destroy(); return null; }
      const module = device.createShaderModule({ label: 'PSD Editor relight multipass', code: SHADER });
      const info = await module.getCompilationInfo(), errors = info.messages.filter(m => m.type === 'error');
      if (errors.length) { device.destroy(); throw new Error('重新打光 GPU 着色器编译失败：' + errors.map(e => `${e.lineNum}:${e.message}`).join('; ')); }
      const layout = device.createBindGroupLayout({ entries: Array.from({ length: 8 }, (_, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: binding === 0 ? 'uniform' : binding < 3 ? 'read-only-storage' : 'storage' } })) });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] }), pipelines = {};
      device.pushErrorScope('validation');
      let failure;
      try { for (const entryPoint of ['shadowPass', 'shadowH', 'shadowV', 'irradiancePass', 'diffusionH', 'diffusionV', 'sourceRadiancePass', 'mipRadiancePass', 'bouncePass', 'main']) pipelines[entryPoint] = await device.createComputePipelineAsync({ label: 'Relight ' + entryPoint, layout: pipelineLayout, compute: { module, entryPoint } }); }
      catch (e) { failure = e; }
      const error = await device.popErrorScope();
      if (error || failure) { device.destroy(); throw new Error('重新打光 GPU 多阶段管线失败：' + (failure?.message || error.message)); }
      if (epoch !== generation) { device.destroy(); return null; }
      const context = { device, layout, pipelines, scene: null, sceneBuffer: null, materials: null, frames: new Map() };
      activeContext = context;
      device.lost.then(() => { if (activeContext === context) { activeContext = null; contextPromise = null; } });
      return context;
    })();
    contextPromise = requested; requested.catch(() => { if (contextPromise === requested) contextPromise = null; });
  }
  return contextPromise;
}
function createBuffer(device, data, usage, label) {
  const buffer = device.createBuffer({ label, size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage: usage | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data); return buffer;
}
function uploadScene(context, maps, rgba, w, h) {
  if (context.scene === maps) return context.sceneBuffer;
  clearFrames(context); context.sceneBuffer?.destroy(); context.sceneBuffer = null; context.scene = null;
  const n = maps.width * maps.height, material = maps.materials || buildRelightMaterials(maps), packed = new Float32Array(n * 28), reference = maps.scene?.referenceDepth || 1;
  for (let i = 0; i < n; i++) {
    const o = i * 28, sx = Math.min(w - 1, Math.floor((i % maps.width + 0.5) * w / maps.width)), sy = Math.min(h - 1, Math.floor((Math.floor(i / maps.width) + 0.5) * h / maps.height)), source = (sy * w + sx) * 4;
    packed.set([maps.normals[i * 3], maps.normals[i * 3 + 1], maps.normals[i * 3 + 2], maps.depth[i]], o);
    packed.set([maps.albedo[i * 3], maps.albedo[i * 3 + 1], maps.albedo[i * 3 + 2], maps.detail?.[i] || 0], o + 4);
    packed.set([maps.depthRaw?.[i] ?? maps.depth[i], maps.edgeConfidence?.[i] ?? 1, maps.farField?.[i] || 0, maps.specularLikelihood?.[i] || 0], o + 8);
    const ratio = maps.depth[i] / Math.max(reference, 1e-6), fade = Math.max(0, Math.min(1, (ratio - 1.3) / 1.1));
    packed.set([maps.backdropGate?.[i] ?? fade * fade * (3 - 2 * fade), maps.ao?.[i] ?? 1, 0, 0], o + 12);
    packed.set(material.regions.subarray(i * 4, i * 4 + 4), o + 16); packed.set(material.surface.subarray(i * 4, i * 4 + 4), o + 20);
    for (let c = 0; c < 3; c++) packed[o + 24 + c] = maps.originalLinear?.[i * 3 + c] ?? maps.albedo[i * 3 + c];
    packed[o + 27] = maps.alpha?.[i] ?? rgba[source + 3] / 255;
  }
  if (packed.byteLength > context.device.limits.maxStorageBufferBindingSize) throw new Error('重新打光 GPU 分析图超过存储缓冲区限制');
  context.sceneBuffer = createBuffer(context.device, packed, GPUBufferUsage.STORAGE, 'Relight packed geometry and materials');
  context.scene = maps; context.materials = material; return context.sceneBuffer;
}
function dispatch(encoder, context, bindGroup, entry, w, h) {
  const pass = encoder.beginComputePass({ label: 'Relight ' + entry }); pass.setPipeline(context.pipelines[entry]); pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8)); pass.end();
}


const HOST_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x04030201]).buffer)[0] === 1;
function destroyFrame(frame) { for (const buffer of frame.buffers) buffer.destroy(); }
function clearFrames(context) { for (const frame of context.frames.values()) destroyFrame(frame); context.frames.clear(); }
function frameKey(w, h, maps, quality) {
  return `${w}:${h}:${Math.max(1, Math.ceil(maps.width * quality.shadowScale))}:${Math.max(1, Math.ceil(maps.height * quality.shadowScale))}:${Math.max(1, Math.ceil(maps.width / 4))}:${Math.max(1, Math.ceil(maps.height / 4))}`;
}
function frameResources(context, w, h, maps, quality) {
  const { device, layout } = context;
  const sw = Math.max(1, Math.ceil(maps.width * quality.shadowScale)), sh = Math.max(1, Math.ceil(maps.height * quality.shadowScale));
  const bw = Math.max(1, Math.ceil(maps.width / 4)), bh = Math.max(1, Math.ceil(maps.height / 4));
  const key = frameKey(w, h, maps, quality);
  const cached = context.frames.get(key);
  if (cached) { context.frames.delete(key); context.frames.set(key, cached); return cached; }
  while (context.frames.size >= 3) { const oldest = context.frames.keys().next().value; destroyFrame(context.frames.get(oldest)); context.frames.delete(oldest); }
  const buffers = [], allocate = (size, usage, label) => { const buffer = device.createBuffer({ size: Math.max(16, size), usage, label }); buffers.push(buffer); return buffer; };
  try {
    let mipPixels = 0, mipLevels = 0;
    for (let mw = bw, mh = bh; ; mw = Math.max(1, mw >> 1), mh = Math.max(1, mh >> 1)) { mipPixels += mw * mh; mipLevels++; if (mw === 1 && mh === 1) break; }
    const maxBytes = Math.min(device.limits.maxStorageBufferBindingSize, 16 * 1024 * 1024), tileRows = Math.min(h, Math.floor(maxBytes / (w * 4)));
    if (tileRows < 1) throw new Error('重新打光 GPU 图像宽度超过存储缓冲区限制');
    const tiles = [];
    for (let start = 0; start < h; start += tileRows) tiles.push({ start, rows: Math.min(tileRows, h - start) });
    const alignment = device.limits.minUniformBufferOffsetAlignment, uniformStride = Math.ceil(304 / alignment) * alignment;
    const slotCount = mipLevels + tiles.length, uniformData = new ArrayBuffer(slotCount * uniformStride), template = new ArrayBuffer(304);
    const uniforms = allocate(uniformData.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'Relight cached frame uniforms');
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    const shadow = allocate(sw * sh * 16, storage, 'Relight cached shadow visibility'), scratch = allocate(Math.max(sw * sh, mipPixels) * 16, storage, 'Relight cached bilateral and radiance scratch');
    const irradiance = allocate(sw * sh * 16, storage, 'Relight cached wavelength irradiation'), bounce = allocate(bw * bh * 16, storage, 'Relight cached indirect light');
    const bytes = w * tileRows * 4;
    const source = allocate(bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Relight cached source RGBA'), result = allocate(bytes, storage, 'Relight cached final RGBA');
    const readback = allocate(bytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, 'Relight reusable readback');
    const bindGroups = Array.from({ length: slotCount }, (_, slot) => device.createBindGroup({ layout, entries: [uniforms, context.sceneBuffer, source, result, shadow, scratch, irradiance, bounce].map((buffer, binding) => ({ binding, resource: binding === 0 ? { buffer, offset: slot * uniformStride, size: 304 } : { buffer } })) }));
    const frame = { sw, sh, bw, bh, mipLevels, tiles, tileRows, buffers, source, result, readback, uniforms, bindGroups, uniformData, uniformBytes: new Uint8Array(uniformData), uniformStride,
      template, integers: new Uint32Array(template), floats: new Float32Array(template), sourceStaging: null };
    context.frames.set(key, frame); return frame;
  } catch (error) { for (const buffer of buffers) buffer.destroy(); throw error; }
}
function updateFrame(frame, state, quality, material, maps, w, h) {
  const { integers, floats, uniformBytes, uniformStride, mipLevels } = frame;
  floats.fill(0);
  integers.set([w, h, maps.width, maps.height], 0); integers.set([0, h, state.lights.length, quality.areaSamples], 4);
  floats.set([state.camera.fx, state.camera.fy, state.camera.cx, state.camera.cy], 8);
  floats.set([state.scene.referenceDepth, state.scene.near, state.scene.far, state.scene.scale], 12);
  floats.set([state.originalGain, state.blend, state.referenceDistance2, maps.depthRaw ? quality.shadowSteps : 0], 16);
  floats.set([0.92 * (1 - 0.3 * state.originalGain), 0.55, 0.3, 2.5], 20); floats.set([14, 4, 0.85, 0.5], 24);
  for (let i = 0; i < state.lights.length; i++) { const light = state.lights[i]; floats.set([...light.position, light.radius], 28 + i * 8); floats.set([...light.radiance, 1], 32 + i * 8); }
  integers.set([frame.sw, frame.sh, frame.bw, frame.bh], 52); floats.set([material.scatterPx || 0, 0, quality.spillSamples, material.eyes.length], 56);
  for (let i = 0; i < Math.min(4, material.eyes.length); i++) { const eye = material.eyes[i]; floats.set([eye.x, eye.y, eye.r, eye.z], 60 + i * 4); }
  const bytes = new Uint8Array(frame.template);
  for (let level = 0; level < mipLevels; level++) { floats[57] = level; uniformBytes.set(bytes, level * uniformStride); }
  floats[57] = mipLevels - 1;
  for (let tile = 0; tile < frame.tiles.length; tile++) { integers.set([frame.tiles[tile].start, frame.tiles[tile].rows], 4); uniformBytes.set(bytes, (mipLevels + tile) * uniformStride); }
}
function writeSource(device, frame, rgba, start, count) {
  const byteOffset = start * 4, bytes = count * 4;
  if (HOST_LITTLE_ENDIAN && ArrayBuffer.isView(rgba) && rgba.BYTES_PER_ELEMENT === 1) {
    device.queue.writeBuffer(frame.source, 0, new Uint8Array(rgba.buffer, rgba.byteOffset + byteOffset, bytes));
    return;
  }
  if (!frame.sourceStaging || frame.sourceStaging.length < count) frame.sourceStaging = new Uint32Array(count);
  for (let i = 0; i < count; i++) { const o = byteOffset + i * 4; frame.sourceStaging[i] = rgba[o] | rgba[o + 1] << 8 | rgba[o + 2] << 16 | rgba[o + 3] << 24; }
  device.queue.writeBuffer(frame.source, 0, frame.sourceStaging.subarray(0, count));
}
async function render(rgba, w, h, maps, params) {
  const state = buildRelightRenderState(rgba, w, h, maps, params), epoch = generation, context = await getContext();
  if (!context) return null;
  if (epoch !== generation || activeContext !== context) throw new Error('重新打光 GPU 渲染已取消');
  if (state.identity) return new Uint8ClampedArray(rgba);
  const { device } = context, quality = relightPassQuality(w, h, params);
  let frame;
  if (context.scene === maps && context.frames.has(frameKey(w, h, maps, quality))) {
    frame = frameResources(context, w, h, maps, quality);
  } else {
    let creationError;
    device.pushErrorScope('validation');
    try { uploadScene(context, maps, rgba, w, h); frame = frameResources(context, w, h, maps, quality); }
    catch (error) { creationError = error; }
    const validation = await device.popErrorScope();
    if (creationError || validation) { clearFrames(context); throw creationError || new Error('重新打光 GPU 资源创建失败：' + validation.message); }
  }
  if (epoch !== generation || activeContext !== context) throw new Error('重新打光 GPU 渲染已取消');
  updateFrame(frame, state, quality, context.materials, maps, w, h);
  device.queue.writeBuffer(frame.uniforms, 0, frame.uniformData);
  const output = new Uint8ClampedArray(rgba.length);
  const encoder = device.createCommandEncoder({ label: 'Relight reusable multipass frame' });
  const initial = frame.bindGroups[0];
  for (const entry of ['shadowPass', 'shadowH', 'shadowV', 'irradiancePass', 'diffusionH', 'diffusionV']) dispatch(encoder, context, initial, entry, frame.sw, frame.sh);
  dispatch(encoder, context, initial, 'sourceRadiancePass', frame.bw, frame.bh);
  for (let level = 1; level < frame.mipLevels; level++) dispatch(encoder, context, frame.bindGroups[level], 'mipRadiancePass', Math.max(1, frame.bw >> level), Math.max(1, frame.bh >> level));
  dispatch(encoder, context, frame.bindGroups[frame.mipLevels - 1], 'bouncePass', frame.bw, frame.bh);
  for (let tile = 0; tile < frame.tiles.length; tile++) {
    if (epoch !== generation || activeContext !== context) throw new Error('重新打光 GPU 渲染已取消');
    const { start, rows } = frame.tiles[tile], count = w * rows, bytes = count * 4;
    writeSource(device, frame, rgba, start * w, count);
    const current = tile === 0 ? encoder : device.createCommandEncoder({ label: 'Relight next full-resolution tile' });
    dispatch(current, context, frame.bindGroups[frame.mipLevels + tile], 'main', w, rows);
    current.copyBufferToBuffer(frame.result, 0, frame.readback, 0, bytes); device.queue.submit([current.finish()]);
    try {
      await frame.readback.mapAsync(GPUMapMode.READ);
      if (epoch !== generation || activeContext !== context) throw new Error('重新打光 GPU 渲染已取消');
      if (HOST_LITTLE_ENDIAN) output.set(new Uint8Array(frame.readback.getMappedRange(), 0, bytes), start * w * 4);
      else { const pixels = new Uint32Array(frame.readback.getMappedRange(), 0, count); for (let i = 0; i < count; i++) { const word = pixels[i], o = (start * w + i) * 4; output[o] = word & 255; output[o + 1] = word >>> 8 & 255; output[o + 2] = word >>> 16 & 255; output[o + 3] = word >>> 24; } }
    } finally { if (frame.readback.mapState === 'mapped') frame.readback.unmap(); }
  }
  Object.defineProperty(output, 'renderPasses', { value: { shadow: [frame.sw, frame.sh], bounce: [frame.bw, frame.bh], areaSamples: quality.areaSamples, shadowSteps: quality.shadowSteps, spillSamples: quality.spillSamples, materials: context.materials.source, eyeCount: context.materials.eyes.length } });
  return output;
}
export async function renderRelightGpu(rgba, w, h, maps, params = {}) {
  const epoch = generation, job = renderQueue.then(() => { if (epoch !== generation) throw new Error('重新打光 GPU 渲染已取消'); return render(rgba, w, h, maps, params); });
  renderQueue = job.catch(() => {}); return job;
}
export function disposeRelightGpu() { generation++; if (activeContext) { clearFrames(activeContext); activeContext.sceneBuffer?.destroy(); activeContext.device.destroy(); } activeContext = null; contextPromise = null; }
