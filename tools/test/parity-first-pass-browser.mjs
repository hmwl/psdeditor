import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('需要 Playwright，不能跳过此回归');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8789}/editor`);
  await page.waitForFunction(() => window.__psd_editorActions?.S.ready && window.__psd_editor?.initDocument);
  const result = await page.evaluate(async () => {
    const { createBrowserGLBackend } = await import('/core/render/adapter-browser.js');
    const { createCPUBackend } = await import('/core/render/cpu.js');
    const mesh = { positions: new Float32Array([0,0,4,0,4,4,0,4]), uvs: new Float32Array([0,0,1,0,1,1,0,1]), indices: new Uint32Array([0,1,2,0,2,3]) };
    const backend = createBrowserGLBackend(), cases = [];
    for (const pixels of [[255,0,0,255,0,255,255,0], [255,50,0,128,255,50,0,128]]) {
      const o = { width:4,height:4,mesh,image:{ width:2,height:1,data:new Uint8Array(pixels) }, placement:[1,0,0,0,1,0,0,0,1] };
      cases.push({cpu:[...createCPUBackend().render(o)],gl:[...backend.render(o)]});
    }
    backend.destroy();
    const { writePsd } = await import('/core/psd-write.js');
    await window.__psd_editor.initDocument(writePsd({width:2,height:1,layers:[{name:'test',bounds:{left:0,top:0,right:2,bottom:1},rgba:new Uint8Array(8).fill(255)}]}),'test.psd');
    const P = window.__psd_editorActions, old = P.S.sets;
    const {encodeOp,mk} = await import('/core/action-events.js');
    const unknown = {event:'unimplementedProbe',idType:'TEXT',name:'unknown',desc:mk('null',{})};
    const cond = {event:'psd_editorConditional',idType:'TEXT',name:'conditional',desc:mk('null',{json:JSON.stringify({cond:'modeRGB',then:'Nested'})})};
    P.S.sets = [{set:{name:'Test',actions:[{name:'Unknown',steps:[unknown]},{name:'Disabled',steps:[{...unknown,enabled:false}]},{name:'Nested',steps:[unknown]},{name:'Parent',steps:[cond]},{name:'MissingCommand',steps:[encodeOp('command',{cmd:'missing.probe'})]}]}}];
    try {
      const strict = await P.play({s:0,a:0},{quiet:true,strict:true});
      const partial = await P.play({s:0,a:0},{quiet:true});
      const complete = await P.play({s:0,a:1},{quiet:true,strict:true});
      const nested = await P.play({s:0,a:3},{quiet:true,strict:true});
      const nestedPartial = await P.play({s:0,a:3},{quiet:true});
      const missing = await P.play({s:0,a:4},{quiet:true,strict:true});
      return {cases,strict,partial,complete,nested,nestedPartial,missing};
    } finally { P.S.sets=old; }
  });
  for (const {cpu,gl} of result.cases) for (let i=0;i<cpu.length;i++) assert.ok(Math.abs(cpu[i]-gl[i])<=2, `CPU/GL channel ${i}: ${cpu[i]} vs ${gl[i]}`);
  for (const key of ['strict','nested','missing']) { assert.equal(result[key].ok,false);assert.equal(result[key].status,'failed');assert.ok(result[key].skipped.length); }
  for (const key of ['partial','nestedPartial']) { assert.equal(result[key].ok,false);assert.equal(result[key].status,'partial');assert.equal(result[key].skipped.length,1); }
  assert.equal(result.complete.ok,true);assert.equal(result.complete.status,'complete');
  console.log('✓ 真实WebGL透明边与CPU一致，动作strict/partial/disabled/嵌套/缺命令状态');
} finally { await browser.close(); }
