



import { computeHomographyQuad, applyHomography } from './homography.js';
import { buildPerspectiveDomain } from './perspective-domain.js';
import { preparePerspectiveField, solvePerspectiveField } from './perspective-field.js';

const cache = new WeakMap();
const UNIT = [0,0,1,0,1,1,0,1];
const flat = p => p.flatMap(q => [q.x,q.y]);
const outward = r => ({ left:Math.floor(r.left),top:Math.floor(r.top),right:Math.ceil(r.right),bottom:Math.ceil(r.bottom) });


export function buildPerspectiveFieldMesh(deform, { docUV, subdiv = 24, referenceRect } = {}) {
  if (!docUV || !(docUV.width>0 && docUV.height>0)) throw new Error('Perspective field requires placed input UV bounds');
  const rect=referenceRect || deform.referenceRect;
  if (!rect) throw new Error('Perspective field requires native referenceRect');
  const source=deform.vertices, warped=deform.warped, quads=deform.quadIdx;
  const maps=quads.map(q=>computeHomographyQuad(flat(q.map(i=>source[i])),flat(q.map(i=>warped[i]))));
  if (maps.some(h=>!h)) throw new Error('Degenerate perspective plane');
  const positions=[],uvs=[],indices=[];
  const push=(p,uv)=>{positions.push(p.x,p.y);uvs.push((uv.x-(docUV.left||0))/docUV.width,(uv.y-(docUV.top||0))/docUV.height);};
  const N=Math.max(1,Math.min(128,subdiv|0)),stride=N+1;
  for(const q of quads) {
    const hs=computeHomographyQuad(UNIT,flat(q.map(i=>source[i]))),hd=computeHomographyQuad(UNIT,flat(q.map(i=>warped[i])));
    const base=positions.length/2;
    for(let j=0;j<=N;j++)for(let i=0;i<=N;i++)push(applyHomography(hd,i/N,j/N),applyHomography(hs,i/N,j/N));
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=base+j*stride+i,b=a+1,c=a+stride,d=c+1;indices.push(a,b,c,b,d,c);}
  }
  const geometry=JSON.stringify({rect:outward(rect),source,quads});
  let saved=cache.get(deform);
  if(!saved || saved.geometry!==geometry) {
    const domain=buildPerspectiveDomain({referenceRect:outward(rect),vertices:source,quadIdx:quads});
    
    
    const original=domain.originalPoints.map(p=>({x:p.y,y:p.x}));
    const triangles=[];for(let i=0;i<domain.triangles.length;i+=3)triangles.push(domain.triangles[i],domain.triangles[i+2],domain.triangles[i+1]);
    saved={geometry,domain,system:quads.length>1 ? preparePerspectiveField({original,triangles}) : null,previous:null,target:null,output:null};
    cache.set(deform,saved);
  }
  const {domain}=saved;
  const signature=JSON.stringify(warped);
  if(saved.target!==signature) {
    if(quads.length===1) {
      
      saved.output=Float64Array.from(domain.originalPoints.flatMap(p=>{const v=applyHomography(maps[0],p.x,p.y);return[Math.fround(v.y),Math.fround(v.x)];}));
    } else {
      const constraints=domain.boundaryNodes.map(b=>{
        const p=b.kind==='corner' ? warped[b.sourceVertex]
          : applyHomography(maps[b.ownerQuad],domain.originalPoints[b.node].x,domain.originalPoints[b.node].y);
        return {index:b.node,target:{x:Math.fround(p.y),y:Math.fround(p.x)},angle:720,lockNeighbors:false};
      });
      const result=solvePerspectiveField({system:saved.system,constraints,initial:saved.previous||undefined,profile:1});
      saved.output=result.positions;saved.iterations=result.iterations;saved.energy=result.energyHistory?.at(-1);
    }
    saved.previous=saved.output;saved.target=signature;
  }
  const base=positions.length/2;
  for(let i=0;i<domain.originalPoints.length;i++)push({x:saved.output[i*2+1],y:saved.output[i*2]},domain.originalPoints[i]);
  for(const i of domain.triangles)indices.push(base+i);
  return {positions:Float32Array.from(positions),uvs:Float32Array.from(uvs),indices:Uint32Array.from(indices),
    fieldInfo:{vertices:domain.originalPoints.length,triangles:domain.triangles.length/3,iterations:saved.iterations||0,
      geometry:domain.quality,triangulation:'independent conforming Delaunay',referenceRect:outward(rect)} };
}
