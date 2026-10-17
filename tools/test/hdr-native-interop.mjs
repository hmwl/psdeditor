import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parsePsdRaster} from '../../core/psd-raster.js';
import {parsePsdDocument,decodeLayerPixels} from '../../core/psd-document.js';
import {normalizeHighDepthLayers} from '../../core/psd-highdepth.js';
import {encodeChannel,decodeChannel,Compression} from '../../core/psd-image.js';
import {hasHdrV3Carrier} from '../../core/psd-hdr.js';
import {convertDocument} from '../../core/doc-mode.js';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/hdr-v3-native.json',import.meta.url))),file=new Uint8Array(Buffer.from(f.file,'base64'));
assert.equal(hasHdrV3Carrier(file),true);
const normalized=normalizeHighDepthLayers(file),doc=parsePsdDocument(normalized),idx=doc.layers.findIndex(l=>l.name==='precision'),direct=decodeLayerPixels(doc,normalized,idx,{strict:true});
const raster=(await parsePsdRaster(file,{keepNativePlanes:true,strictChannels:true})).layers.find(l=>l.name==='precision');
for(const[id,b64]of Object.entries(f.expectedLittleEndianFloat32)){
 const b=Buffer.from(b64,'base64'),v=new DataView(b.buffer,b.byteOffset,b.byteLength),expected=Float32Array.from({length:b.length/4},(_,i)=>v.getFloat32(i*4,true));
 assert.deepEqual([...raster.nativePlanes[id]],[...expected]);assert.deepEqual([...direct.byId[id]],[...expected]);
 const encoded=encodeChannel({data:direct.byId[id],reuseRaw:false,withHeader:true});
 assert.deepEqual([...decodeChannel({bytes:encoded,width:raster.width,height:raster.height,depth:32})],[...expected]);
}
const values=new Float32Array([-.5,0,.2,1,8]);
const legacy=encodeChannel({data:values,width:5,height:1,depth:32,compression:Compression.ZIP_PREDICTION,withHeader:true});
assert.deepEqual([...decodeChannel({bytes:legacy,width:5,height:1,depth:32})],[...values],'标准prediction算法保留');
const converted=convertDocument(file,{mode:'rgb',depth:32}).buffer;
assert.equal(hasHdrV3Carrier(converted),true,'同位深转换保留HDR载体');
console.log('✓ PS 27.11原生HDR载体与ZIP prediction通道精确读写');
