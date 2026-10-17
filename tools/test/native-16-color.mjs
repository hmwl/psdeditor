import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parsePsdRaster} from '../../core/psd-raster.js';
import {writePsd,replacePsdCompositeImage} from '../../core/psd-write.js';
import {convertDocument} from '../../core/doc-mode.js';
import {decodeCompositeImage,byteTo16,detectSample16Max} from '../../core/psd-image.js';
import {sRGBProfile} from '../../core/icc.js';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/native-16-color.json',import.meta.url))),file=new Uint8Array(Buffer.from(f.file,'base64'));
const doc=await parsePsdRaster(file,{keepNativePlanes:true,strictChannels:true});
for(const[name,color]of Object.entries(f.colors)){
 const layer=doc.layers.find(l=>l.name===name);assert.ok(layer);
 for(let i=0;i<layer.rgba.length;i+=4)assert.deepEqual([...layer.rgba.slice(i,i+4)],color,'原生PS暗通道不能错误扩大到白');
}
assert.equal(byteTo16(255),65535);assert.equal(byteTo16(128),32896);assert.equal(detectSample16Max([new Uint16Array([0,13,7710])]),65535,'暗内容不能决定量程');
const rgba=new Uint8Array([30,90,120,255,255,255,255,255]),base=writePsd({width:2,height:1,layers:[{name:'wire',bounds:{left:0,top:0,right:2,bottom:1},rgba}],composite:rgba});
const high=convertDocument(base,{depth:16},{srcProfile:sRGBProfile()}).buffer;
const read=await parsePsdRaster(high,{keepNativePlanes:true,strictChannels:true});
assert.deepEqual([...read.layers[0].rgba],[...rgba]);assert.equal(read.layers[0].nativePlanes[-1][0],65535);assert.equal(read.layers[0].nativePlanes[0][1],65535);
const composite=decodeCompositeImage(replacePsdCompositeImage(high,rgba));assert.equal(composite.channels[0][1],65535);
console.log('✓ 原生16位PS色块120/200/90与30/90/210、白点/alpha/暗通道及写回满量程');
