import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('需要 Playwright，不能跳过此回归');
const { chromium } = PW;
const browser=await chromium.launch({executablePath: process.env.CHROMIUM || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`); await page.waitForFunction(()=>window.__psd_editor?.initDocument);
 const result=await page.evaluate(async()=>{
 const {writePsd}=await import('/core/psd-write.js');
 await window.__psd_editor.initDocument(writePsd({width:100,height:100,layers:[{name:'probe',bounds:{left:0,top:0,right:100,bottom:100},rgba:new Uint8Array(40000).fill(255)}]}).buffer,'ui-probe.psd');
 const {setDocTool,eraserOpts}=await import('/editor/app/31-selection-brush.js');
 const {tools}=await import('/editor/tools.js');
 const {syncBrushPanel}=await import('/editor/app/40-options-bar-wiring.js');
 const {sbOpts}=await import('/editor/app/32-cursors-select-options.js');
 const visible=s=>{const e=document.querySelector(s);return !!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'};
 setDocTool('selectionBrush');
 const sb={add:document.querySelector('#selModeAdd').textContent,sub:document.querySelector('#selModeSubtract').textContent,mask:visible('#selMaskBtn'),opacity:visible('#sbOpacityWrap'),brush:visible('#sbBrushBtn'),sizeClosed:!visible('#sbOpts'),icon:document.querySelector('#selModeAdd').dataset.ic};
 document.querySelector('#sbBrushBtn').click(); const open=visible('#sbSize');const size=document.querySelector('#sbSize');size.value='123';size.dispatchEvent(new Event('change',{bubbles:true}));const value=sbOpts.size;
 document.querySelector('#sbOverlayBtn').click();const overlay=visible('#sbColor')&&!visible('#sbOpts');
 setDocTool('selRect');const rect={mask:visible('#selMaskBtn'),sb:visible('#sbOpacityWrap'),icon:document.querySelector('#selModeAdd').dataset.ic,overlay:visible('#sbShowWrap'),aaDisabled:document.querySelector('#selAA').disabled};
 setDocTool('eraser');eraserOpts.mode='block';syncBrushPanel();const block={preset:visible('#brPresetBtn'),angle:visible('#brAngleWrap'),smooth:visible('#brSmoothWrap'),sym:visible('#brSym'),pressure:visible('#brPressSize'),opacity:visible('#brOpacityWrap')};
 eraserOpts.mode='brush';syncBrushPanel();const brush={preset:visible('#brPresetBtn'),angle:visible('#brAngleWrap'),smooth:visible('#brSmoothWrap'),sym:visible('#brSym'),pressure:visible('#brPressSize'),targetVisible:visible('#brTarget')};
 const groups=[];for(const g of tools.TOOL_GROUPS) for(const t of g.tools) {if(!t.impl)continue;tools.select(t.id);groups.push({tool:t.id,label:t.label,groups:[...document.querySelectorAll('.optbar .group')].filter(e=>!!e.getClientRects().length).map(e=>e.id)});}
 setDocTool('selectionBrush');return {sb,open,value,overlay,rect,block,brush,groups};
 });
 assert.deepEqual(result.sb,{add:'添加',sub:'减去',mask:false,opacity:true,brush:true,sizeClosed:true,icon:'opt-sb-add'});assert.equal(result.open,true);assert.equal(result.value,123);assert.equal(result.overlay,true);
 assert.deepEqual(result.rect,{mask:true,sb:false,icon:'sel-add',overlay:false,aaDisabled:true});for(const v of Object.values(result.block))assert.equal(v,false);assert.deepEqual(result.brush,{preset:true,angle:true,smooth:true,sym:true,pressure:true,targetVisible:false});assert.deepEqual(errors,[]);
 for (const tool of result.groups) assert.ok(tool.groups.length, `${tool.label} 的选项栏为空`);
 console.log(`✓ ${result.groups.length} 把工具选项栏切换，选区画笔笔尖/叠加设置实际写入、矩形抗锯齿、块橡皮擦控件分型，页面异常0`);
}finally{await browser.close()}
