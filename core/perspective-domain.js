








const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const area = poly => poly.reduce((v,p,i)=>{const q=poly[(i+1)%poly.length];return v+p.x*q.y-q.x*p.y;},0)/2;
const key = (a,b) => a<b ? `${a}:${b}` : `${b}:${a}`;
const pointKey = p => `${p.x.toPrecision(16)}:${p.y.toPrecision(16)}`;
const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist2 = (a,b) => (a.x-b.x)**2+(a.y-b.y)**2;
const frozen = a => Object.freeze(a.map(v => typeof v==='object' ? Object.freeze(v) : v));

function inside(p, poly, epsilon=0){ return poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>=-epsilon); }
function strictlyInside(p,poly,epsilon){ return poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>epsilon); }
function intersectionArea(a,b){
  let out=a;
  for(let j=0;j<b.length && out.length;j++){
    const c=b[j],d=b[(j+1)%b.length],input=out;out=[];
    for(let i=0;i<input.length;i++){
      const p=input[i],q=input[(i+1)%input.length],u=cross(c,d,p),v=cross(c,d,q);
      if(u>=0)out.push(p);
      if((u<0)!==(v<0)){const t=u/(u-v);out.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
    }
  }
  return out.length<3?0:Math.abs(area(out));
}


export function describePerspectiveDomain({referenceRect,vertices,quadIdx}){
  if(!referenceRect || ![referenceRect.left,referenceRect.top,referenceRect.right,referenceRect.bottom].every(Number.isFinite)
    || referenceRect.right<=referenceRect.left || referenceRect.bottom<=referenceRect.top) throw new Error('Invalid perspective referenceRect');
  if(!Array.isArray(vertices) || !vertices.every(p=>p && Number.isFinite(p.x)&&Number.isFinite(p.y))
    || !Array.isArray(quadIdx) || !quadIdx.every(q=>q.length===4&&new Set(q).size===4&&q.every(k=>Number.isInteger(k)&&k>=0&&k<vertices.length))) throw new Error('Invalid perspective Layout vertices/quads');
  const bounds={...referenceRect};
  
  for(const p of vertices){
    if(p.x<=bounds.left)bounds.left=Math.trunc(p.x-10);
    if(p.x>=bounds.right)bounds.right=Math.trunc(p.x+10);
    if(p.y<=bounds.top)bounds.top=Math.trunc(p.y-10);
    if(p.y>=bounds.bottom)bounds.bottom=Math.trunc(p.y+10);
  }
  const points=vertices.map(p=>({x:Math.fround(p.x),y:Math.fround(p.y)}));
  const outer=[{x:bounds.left,y:bounds.top},{x:bounds.left,y:bounds.bottom},{x:bounds.right,y:bounds.bottom},{x:bounds.right,y:bounds.top}].map(p=>({x:Math.fround(p.x),y:Math.fround(p.y)}));
  const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top,domainArea=Math.abs(width)*Math.abs(height);
  if (!Number.isFinite(domainArea) || !points.concat(outer).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) throw new Error('Perspective domain exceeds finite float32 geometry');
  const eps=Math.max(width,height)**2*1e-12;
  const holes=quadIdx.map(q=>{
    let poly=q.map(k=>points[k]);if(area(poly)<0)poly=poly.slice().reverse();
    if(poly.some((p,i)=>cross(p,poly[(i+1)%4],poly[(i+2)%4])<=eps))throw new Error('Perspective Layout plane must be convex and nondegenerate');
    return poly;
  });
  for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++)if(intersectionArea(holes[i],holes[j])>eps)throw new Error('Overlapping Layout planes are unsupported by the isolated exterior mesh');
  return {bounds,points,outer,holes,domainArea,maxArea:Math.trunc(domainArea/1000),
    holePoints:quadIdx.map(q=>({x:Math.fround((vertices[q[0]].x+vertices[q[2]].x)/2),y:Math.fround((vertices[q[0]].y+vertices[q[2]].y)/2)})),
    nativeOptions:`Djpq20a${Math.trunc(domainArea/1000)}`,nativeCoordinateOrder:'yx',coordinateOrder:'xy'};
}

function circumcenter(a,b,c){
  const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,d=2*(bx*cy-by*cx);
  if(Math.abs(d)<1e-20)return null;
  const u=bx*bx+by*by,v=cx*cx+cy*cy;
  return {x:a.x+(cy*u-by*v)/d,y:a.y+(bx*v-cx*u)/d};
}
function delaunay(points){
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),span=Math.max(Math.max(...xs)-left,Math.max(...ys)-top);
  const p=points.map(q=>({x:(q.x-left)/span-.5,y:(q.y-top)/span-.5}));
  const n=p.length;p.push({x:-32,y:-16},{x:32,y:-16},{x:0,y:32});
  const make=(a,b,c)=>{
    if(cross(p[a],p[b],p[c])<0)[a,b]=[b,a];
    const center=circumcenter(p[a],p[b],p[c]);
    return center?{a,b,c,center,r2:dist2(center,p[a])}:null;
  };
  let triangles=[make(n,n+1,n+2)];
  for(let i=0;i<n;i++){
    const boundary=new Map(),keep=[];
    for(const t of triangles){
      if(dist2(t.center,p[i])<=t.r2*(1+1e-12)+1e-15){
        for(const [a,b]of[[t.a,t.b],[t.b,t.c],[t.c,t.a]]){const k=key(a,b);if(boundary.has(k))boundary.delete(k);else boundary.set(k,[a,b]);}
      }else keep.push(t);
    }
    for(const [a,b]of boundary.values()){const t=make(a,b,i);if(t)keep.push(t);}
    if(!boundary.size)throw new Error('Delaunay insertion lost a point');
    triangles=keep;
  }
  return triangles.filter(t=>t.a<n&&t.b<n&&t.c<n).map(t=>[t.a,t.b,t.c]);
}
function quality(points,t){
  const [a,b,c]=t.map(k=>points[k]),lengths=[Math.sqrt(dist2(a,b)),Math.sqrt(dist2(b,c)),Math.sqrt(dist2(c,a))];
  const angles=lengths.map((l,i)=>{const u=lengths[(i+1)%3],v=lengths[(i+2)%3];return Math.acos(Math.max(-1,Math.min(1,(u*u+v*v-l*l)/(2*u*v))))*180/Math.PI;});
  return {area:cross(a,b,c)/2,minAngle:Math.min(...angles)};
}
function encroaches(p,a,b){return (p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)<-dist2(a,b)*1e-12;}
function edgeSet(triangles){const edges=new Set();for(const [a,b,c]of triangles){edges.add(key(a,b));edges.add(key(b,c));edges.add(key(c,a));}return edges;}


export function buildPerspectiveDomain(input){
  const spec=describePerspectiveDomain(input),minAngle=input.minAngle??20,maxArea=input.maxArea??spec.maxArea;
  const maxPoints=input.maxPoints??4096,maxPasses=input.maxPasses??64,maxTriangles=input.maxTriangles??20000;
  if(!Number.isFinite(maxArea)||!(maxArea>0) || !(minAngle>0&&minAngle<=20) || !Number.isInteger(maxPoints)||maxPoints<4||maxPoints>8192 || !Number.isInteger(maxPasses)||maxPasses<1||maxPasses>256 || !Number.isInteger(maxTriangles)||maxTriangles<2||maxTriangles>65536)throw new Error('Invalid exterior refinement limits; native a0 behavior is not established');
  const points=[],ids=new Map();
  const insert=p=>{const k=pointKey(p);if(ids.has(k))return ids.get(k);const near=points.findIndex(q=>dist2(p,q)<spec.domainArea*1e-24);if(near>=0)return near;if(points.length>=maxPoints)throw new Error('Perspective exterior mesh point cap exceeded');const i=points.length;points.push({...p});ids.set(k,i);return i;};
  const outer=spec.outer.map(insert),controls=spec.points.map(insert),segments=[];
  for(let i=0;i<4;i++)segments.push([outer[i],outer[(i+1)%4]]);
  const edgeCounts=new Map();
  input.quadIdx.forEach(q=>q.forEach((k,i)=>{const a=controls[k],b=controls[q[(i+1)%4]],id=key(a,b),entry=edgeCounts.get(id);if(entry)entry.count++;else edgeCounts.set(id,{a,b,count:1});}));
  for(const e of edgeCounts.values())if(e.count===1)segments.push([e.a,e.b]);
  const inDomain=p=>p.x>=spec.outer[0].x&&p.x<=spec.outer[2].x&&p.y>=spec.outer[0].y&&p.y<=spec.outer[2].y
    && !spec.holes.some(h=>strictlyInside(p,h,1e-10));
  const split=indices=>{
    for(const i of [...indices].sort((a,b)=>b-a)){const [a,b]=segments[i],p=mid(points[a],points[b]),m=insert(p);if(m===a||m===b)throw new Error('Perspective segment refinement reached numerical precision limit');segments.splice(i,1,[a,m],[m,b]);}
  };
  let triangles,passes=0;
  for(;passes<maxPasses;passes++){
    const encroached=new Set();
    segments.forEach(([a,b],i)=>{if(points.some((p,k)=>k!==a&&k!==b&&encroaches(p,points[a],points[b])))encroached.add(i);});
    if(encroached.size){split(encroached);continue;}
    const all=delaunay(points),edges=edgeSet(all),missing=new Set();
    segments.forEach(([a,b],i)=>{if(!edges.has(key(a,b)))missing.add(i);});
    if(missing.size){split(missing);continue;}
    triangles=all.filter(t=>{const p=t.map(i=>points[i]);return inDomain({x:(p[0].x+p[1].x+p[2].x)/3,y:(p[0].y+p[1].y+p[2].y)/3});});
    if(triangles.length>maxTriangles)throw new Error('Perspective exterior mesh triangle cap exceeded');
    const bad=triangles.filter(t=>{const q=quality(points,t);return q.area>maxArea*(1+1e-9)||q.minAngle<minAngle-1e-7;});
    if(!bad.length)break;
    const toSplit=new Set(),candidates=[];
    for(const t of bad){
      const p=t.map(k=>points[k]);let center=circumcenter(...p);
      let found=false;
      segments.forEach(([a,b],i)=>{if(center&&encroaches(center,points[a],points[b])){toSplit.add(i);found=true;}});
      if(found)continue;
      if(!center||!inDomain(center)){
        const lengths=[[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]].sort((a,b)=>dist2(points[b[0]],points[b[1]])-dist2(points[a[0]],points[a[1]]));
        const [a,b]=lengths[0],i=segments.findIndex(s=>key(...s)===key(a,b));
        if(i>=0){toSplit.add(i);continue;}
        center=mid(points[a],points[b]);
      }
      if(!ids.has(pointKey(center)))candidates.push({point:center,radius2:Math.min(...p.map(q=>dist2(center,q)))});
    }
    if(toSplit.size){split(toSplit);continue;}
    const before=points.length;for(const candidate of candidates){
      
      
      
      if(points.every(p=>dist2(p,candidate.point)>=candidate.radius2*(1-1e-10)))insert(candidate.point);
    }
    if(points.length===before)throw new Error('Perspective exterior quality refinement stalled');
  }
  if(passes===maxPasses)throw new Error('Perspective exterior refinement pass cap exceeded');
  
  
  const coveredArea=triangles.reduce((sum,t)=>sum+quality(points,t).area,0),expectedArea=Math.abs(area(spec.outer))-spec.holes.reduce((sum,h)=>sum+Math.abs(area(h)),0);
  if(Math.abs(coveredArea-expectedArea)>Math.max(1,expectedArea)*1e-7)throw new Error('Perspective exterior coverage validation failed');
  if(triangles.some(t=>quality(points,t).area<=0))throw new Error('Perspective exterior triangle flip detected');
  const used=[...new Set(triangles.flat())].sort((a,b)=>a-b),remap=new Map(used.map((k,i)=>[k,i])),originalPoints=used.map(k=>points[k]);
  const boundaryNodes=[];
  originalPoints.forEach((p,node)=>{
    const memberships=[];
    input.quadIdx.forEach((q,ownerQuad)=>q.forEach((a,sourceEdgeIndex)=>{
      const b=q[(sourceEdgeIndex+1)%4],u=spec.points[a],v=spec.points[b],length=dist2(u,v);
      const t=((p.x-u.x)*(v.x-u.x)+(p.y-u.y)*(v.y-u.y))/length;
      if(t>=-1e-12&&t<=1+1e-12&&Math.abs(cross(u,v,p)/length)<=.001)memberships.push({ownerQuad,sourceEdgeIndex,sourceEdge:frozen([a,b]),projectionT:Math.max(0,Math.min(1,t)),t:Math.sqrt(dist2(p,u)/length)});
    }));
    if(memberships.length)boundaryNodes.push(Object.freeze({node,...memberships[0],memberships:frozen(memberships)}));
  });
  
  
  const ordered=[],seen=new Set();
  controls.forEach((k,sourceVertex)=>{const node=remap.get(k);if(node==null||seen.has(node))return;const entry=boundaryNodes.find(b=>b.node===node);if(entry){ordered.push(Object.freeze({...entry,kind:'corner',sourceVertex,angle:720,lockNeighbors:false}));seen.add(node);}});
  boundaryNodes.forEach(entry=>{if(!seen.has(entry.node)){ordered.push(Object.freeze({...entry,kind:'edge',angle:720,lockNeighbors:false}));seen.add(entry.node);}});
  const edgeRecords=ordered.flatMap((entry,constraintIndex)=>entry.kind==='edge'?[Object.freeze({quadIndex:entry.ownerQuad,constraintIndex,
    startCornerOccurrence:entry.ownerQuad*4+entry.sourceEdgeIndex,endCornerOccurrence:entry.ownerQuad*4+(entry.sourceEdgeIndex+1)%4,t:entry.t})]:[]);
  const stats=triangles.map(t=>quality(points,t));
  return Object.freeze({originalPoints:frozen(originalPoints),triangles:frozen(triangles.flatMap(t=>t.map(k=>remap.get(k)))),boundaryNodes:frozen(ordered),constraintIndices:frozen(ordered.map(b=>b.node)),edgeRecords:frozen(edgeRecords),
    missingSourceVertices:frozen(controls.flatMap((k,i)=>remap.has(k)?[]:[i])),
    controlNodes:frozen(controls.map(k=>remap.get(k)??-1)),bounds:Object.freeze({...spec.bounds}),holePoints:frozen(spec.holePoints),
    quality:Object.freeze({maxArea:Math.max(...stats.map(q=>q.area)),minAngle:Math.min(...stats.map(q=>q.minAngle)),targetMaxArea:maxArea,targetMinAngle:minAngle,passes,coveredArea,expectedArea}),
    protocol:Object.freeze({nativeOptions:spec.nativeOptions,coordinateOrder:'xy',nativeCoordinateOrder:'yx',inputPrecision:'float32-promoted-double',triangulation:'independent-conforming-Delaunay',triangleOutputExact:false})});
}


export function createPerspectiveDomainCache(){
  let previousKey=null,previous=null;
  return Object.freeze({get(input){const k=JSON.stringify({referenceRect:input.referenceRect,vertices:input.vertices,quadIdx:input.quadIdx,maxArea:input.maxArea,minAngle:input.minAngle,maxPoints:input.maxPoints,maxPasses:input.maxPasses,maxTriangles:input.maxTriangles});if(k!==previousKey){const mesh=buildPerspectiveDomain(input);previousKey=k;previous=mesh;}return previous;},clear(){previousKey=null;previous=null;}});
}
