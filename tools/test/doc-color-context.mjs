import assert from 'node:assert/strict';
import { writePsd, replacePsdCompositeImage } from '../../core/psd-write.js';
import { parsePsdRaster } from '../../core/psd-raster.js';
import { setEmbeddedProfile, convertDocument } from '../../core/doc-mode.js';
import { sRGBProfile, wideRgb1998Profile, grayProfile } from '../../core/icc.js';
import { makeCodec, setModeCodec, getModeCodec } from '../../core/color-convert.js';
import { renderLayers, refreshComposite } from '../../server/doc-render.js';
import { compositeAll } from '../../core/compose.js';
import { decodeComposite, parsePsdDocument } from '../../core/psd-document.js';

const rgba = new Uint8Array([120, 190, 70, 255, 80, 50, 210, 255]);
const base = writePsd({ width: 2, height: 1, layers: [{ name: 'color', bounds: { left:0, top:0, right:2, bottom:1 }, rgba }], composite: rgba });
const profiles = [sRGBProfile(), wideRgb1998Profile()];
const files = profiles.map(p => setEmbeddedProfile(base, p.bytes));
const previous = getModeCodec(3);
const poison = { toRgb8(planes, i, out) { out[0]=255; out[1]=0; out[2]=255; }, fromRgb8(r,g,b,out) { out.fill(0); } };
setModeCodec(3, poison);
try {
  const [a,b] = await Promise.all(files.map(f => renderLayers(f)));
  for (const [i, r] of [a,b].entries()) {
    const expected = await parsePsdRaster(files[i], { codec: makeCodec(profiles[i]) });
    assert.deepEqual(r.data, expected.layers[0].rgba, '服务端使用自身嵌入ICC，不受模块全局codec影响');
    const refreshed = await refreshComposite(files[i]);
    assert.equal(refreshed.warning, undefined);
    const reread = await parsePsdRaster(refreshed.buffer, { codec: makeCodec(profiles[i]) });
    assert.deepEqual(reread.layers[0].rgba, expected.layers[0].rgba, '刷新缓存不得改变图层像素');
  }
  assert.notDeepEqual(a.data, b.data, '同通道值不同配置文件应该显示不同颜色');
  const stacked = setEmbeddedProfile(writePsd({width:2,height:1,layers:[
    {name:'base',bounds:{left:0,top:0,right:2,bottom:1},rgba},
    {name:'multiply',bounds:{left:0,top:0,right:2,bottom:1},rgba:new Uint8Array([180,80,100,128,90,190,130,128]),blendMode:'mul '}
  ]}),profiles[1].bytes);
  const nativeDoc = await parsePsdRaster(stacked,{codec:null}), native = compositeAll(nativeDoc,2,1,new Map()).data;
  const pl = [0,1,2].map(c=>Uint8Array.from([native[c],native[c+4]])), display = new Uint8ClampedArray(native), rgb=[0,0,0], codec=makeCodec(profiles[1]);
  for(let i=0;i<2;i++){codec.toRgb8(pl,i,rgb);for(let c=0;c<3;c++)display[i*4+c]=rgb[c];}
  assert.deepEqual((await renderLayers(stacked)).data,display,'宽色域RGB必须先按文档值混合，再做显示转换');
  const stackRefresh=await refreshComposite(stacked);assert.equal(stackRefresh.warning,undefined);
  const flat=decodeComposite(parsePsdDocument(stackRefresh.buffer),stackRefresh.buffer);
  for(let c=0;c<3;c++)assert.deepEqual([...flat.channels[c]],[...pl[c]],'RGB合成缓存不得经显示转换往返量化');
  const gray = convertDocument(base,{mode:'gray'},{srcProfile:sRGBProfile(),dstProfile:grayProfile()}).buffer;
  const grayRefresh=await refreshComposite(gray);assert.equal(grayRefresh.warning,undefined);
  const grayDoc=await parsePsdRaster(grayRefresh.buffer,{codec:makeCodec(grayProfile())});assert.equal(grayDoc.mode,1);
  assert.deepEqual([...(await renderLayers(base)).data], [...rgba], '无嵌入RGB不得继承其他请求的codec');
  assert.equal(getModeCodec(3), poison, '服务端不得更改全局codec');
  assert.throws(() => replacePsdCompositeImage(base, rgba, { codec: { fromRgb8(){ throw new Error('explicit'); } } }), /explicit/);
  await assert.rejects(renderLayers(setEmbeddedProfile(base, grayProfile().bytes)), /通道数/);
} finally { setModeCodec(3, previous); }
console.log('✓ 嵌入ICC并发隔离、无ICC隔离、缓存刷新与配置文件模式检查');
