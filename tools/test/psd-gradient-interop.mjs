import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradientMidpoint, gradientMidpointsFromPSD, gradientMidpointsToPSD, gradientSpan, buildGradientLut } from '../../core/paint-fill.js';
import { gradientFromDesc, gradientToDesc, readGrd, writeGrd } from '../../core/grd.js';
import { adjustmentRenderParams, shapeSource } from '../../core/compose.js';
import { writePsd } from '../../core/psd-write.js';
import { applyEdits } from '../../core/psd-edit.js';
import { parsePsdRaster } from '../../core/psd-raster.js';

const model={clrs:[{loc:0,r:0,g:0,b:0,mid:25},{loc:2048,r:255,g:0,b:0,mid:75},{loc:4096,r:255,g:255,b:255,mid:50}],trns:[{loc:0,opct:0,mid:72},{loc:4096,opct:100,mid:50}]};
const desc=gradientToDesc({name:'midpoints',model});
assert.deepEqual(desc.Clrs.map(s=>s.Mdpn),[50,25,75]);
assert.deepEqual(desc.Trns.map(s=>s.Mdpn),[50,72]);
assert.deepEqual(gradientFromDesc(desc).model,model);
assert.deepEqual(readGrd(writeGrd([{name:'midpoints',model}]))[0].model,model);
assert.equal(gradientMidpoint(.125,.25),.25);
assert.equal(gradientMidpoint(.625,.25),.75);
assert.equal(gradientMidpoint(.25,.25),.5);
assert.ok(Math.abs(gradientSpan('Lnr ',200,100,Math.SQRT1_2,Math.SQRT1_2)-100*Math.SQRT2)<1e-10);
assert.equal(gradientSpan('Lnr ',200,100,1,0),200);
assert.equal(gradientSpan('Lnr ',200,100,0,1),100);
const lut=buildGradientLut({colors:[{pos:0,color:[0,0,0],mid:.25},{pos:1,color:[255,255,255]}],alphas:[{pos:0,a:0,mid:.75},{pos:1,a:1}],smoothness:0,size:9});
assert.equal(lut[2*4],127.5); assert.equal(lut[6*4+3],127.5);
const width=9,height=3,rgba=new Uint8Array(width*height*4);
const base=writePsd({width,height,layers:[{name:'base',bounds:{left:0,top:0,right:width,bottom:height},rgba}],composite:rgba});
const bytes=applyEdits(base,[{op:'addFillLayer',kind:'gradient',gradient:{angle:0,dither:false,smoothness:0,stops:model.clrs.map(s=>({color:[s.r,s.g,s.b],location:s.loc/4096,midpoint:s.mid})),opacityStops:model.trns.map(s=>({opacity:s.opct,location:s.loc/4096,midpoint:s.mid}))}}]).buffer;
const doc=await parsePsdRaster(bytes),fill=doc.layers[1];
assert.deepEqual(fill.fill.params.desc.Grad.Clrs.map(s=>s.Mdpn),[50,25,75]);
assert.deepEqual(fill.fill.params.desc.Grad.Trns.map(s=>s.Mdpn),[50,72]);
assert.ok(shapeSource(fill,width,height).src.data.some(x=>x>0));

const source=fs.readFileSync(new URL('../../web/editor/app/27-gradient-editor.js',import.meta.url),'utf8');
const fromText=source.slice(source.indexOf('export function gradModelFrom'),source.indexOf('function gradDiff')).replace('export ','');
const diffText=source.slice(source.indexOf('function gradDiff'),source.indexOf('export function commitGradient'));
const {gradModelFrom,gradDiff}=new Function('gradientMidpointsFromPSD','gradientMidpointsToPSD','rgbHex','parseHex6',`${fromText}\n${diffText}\nreturn {gradModelFrom,gradDiff};`)(gradientMidpointsFromPSD,gradientMidpointsToPSD,s=>'#'+[s.r,s.g,s.b].map(v=>v.toString(16).padStart(2,'0')).join(''),hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)));
const gr={clrs:gradientMidpointsToPSD(model.clrs).map((s,src)=>({...s,src})),trns:gradientMidpointsToPSD(model.trns).map((s,src)=>({...s,src})),hasTrns:true};
const m=gradModelFrom(gr,null);
assert.deepEqual(gradDiff(gr,m),{values:{},arrayOps:[]});
m.clrs[0].mid=35;m.trns[0].mid=60;
const op=gradDiff(gr,m);
assert.deepEqual(op.values,{'Grad.Clrs.1.Mdpn':35,'Grad.Trns.1.Mdpn':60});
assert.deepEqual(gradModelFrom(gr,op),m);
m.clrs.splice(1,0,{loc:1024,r:128,g:0,b:0,mid:40,src:null});
const rebuilt=gradModelFrom(gr,gradDiff(gr,m));
assert.deepEqual(rebuilt.clrs.map(({src,...s})=>s),m.clrs.map(({src,...s})=>s));
assert.deepEqual(adjustmentRenderParams({key:'vibA',params:{desc:{vibrance:25}}}),{type:'vibrance',vibrance:25,saturation:0});
for(const Strt of [null,NaN,Infinity,'0'])assert.equal(adjustmentRenderParams({key:'vibA',params:{desc:{vibrance:25,Strt}}}),null);
assert.equal(adjustmentRenderParams({key:'vibA',params:{desc:{Strt:0}}}),null);
console.log('✓ PSD gradient midpoint import/export, creation, editor edits, linear span, interpolation, and absent vibrance saturation');
const native=JSON.parse(fs.readFileSync(new URL('./fixtures/gradient-native.json',import.meta.url)));
for(const c of native.cases){
  const item=shapeSource({fill:{key:'GdFl',params:{desc:c.gradient}}},c.width,c.height),image=item.src.data;
  for(const s of c.samples){
    const x=s.x-item.left,y=s.y-item.top;
    if(x<0||y<0||x>=item.src.width||y>=item.src.height){assert.equal(s.rgba[3],0);continue;}
    const p=(y*item.src.width+x)*4;
    for(let channel=0;channel<4;channel++){
      if(channel<3&&s.rgba[3]===0)continue;
      assert.ok(Math.abs(image[p+channel]-s.rgba[channel])<=1,`${c.name} (${s.x},${s.y}) channel ${channel}: ${image[p+channel]} vs PS ${s.rgba[channel]}`);
    }
  }
}
console.log('✓ 450 native Photoshop samples: color/alpha midpoint ownership, multi-stop classic interpolation, axis/diagonal geometry within 1/255');

const geomSource=fs.readFileSync(new URL('../../web/editor/app/15-gradient-bucket-eyedropper.js',import.meta.url),'utf8');
const geomText=geomSource.slice(geomSource.indexOf('export function gradGeomFromLine'),geomSource.indexOf('async function createGradientFillLayer')).replaceAll('export function','function');
const {gradGeomFromLine,gradLineFromGeom}=new Function('gradientSpan','docW','docH',`${geomText}\nreturn {gradGeomFromLine,gradLineFromGeom};`)(gradientSpan,257,129);
for(const type of ['Lnr ','Rdl ','Rflc','Dmnd','Angl'])for(const angle of [0,30,45,90,135,-135]){
  const line=gradLineFromGeom(type,angle,275,12,-7),g=gradGeomFromLine(type,line.x0,line.y0,line.x1,line.y1);
  assert.ok(Math.abs(g.Angl-angle)<1e-9);assert.equal(g['Scl '],275);assert.equal(g['Ofst.Hrzn'],12);assert.equal(g['Ofst.Vrtc'],-7);
}
console.log('✓ editor gradient geometry remains inverse for every style and diagonal angle');
