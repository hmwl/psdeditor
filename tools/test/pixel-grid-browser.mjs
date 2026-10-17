import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {largeZipFixture} from './large-zip-fixture.mjs';
import {loadPlaywright,WEBGPU_ARGS} from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('Playwright required');
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:process.env.PSD_EDITOR_PERF_NATIVE_GPU==='1'?[]:WEBGPU_ARGS}),reports=[];
try{
 const fixture=await largeZipFixture(6863,10132,{patterned:true,compression:'rle',opaque:true});
 for(const dpr of[1,2]){
  const page=await browser.newPage({viewport:{width:1200,height:800},deviceScaleFactor:dpr}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__pixel-grid.psd',r=>r.fulfill({body:fixture,contentType:'application/octet-stream'}));
  await page.goto(`http://127.0.0.1:${process.argv[2]||8787}/editor`);await page.waitForFunction(()=>window.__psd_editor?.gpu);
  await page.evaluate(async()=>{const A=window.__psd_editor,b=await(await fetch('/__pixel-grid.psd')).blob();await A.loadPsd(new File([b],'native-pixels.psd'));A.actions.run('tool.key.V');});
  for(const zoom of[5,6.25,8,16]){
   await page.evaluate(zoom=>{const A=window.__psd_editor;A.view.setZoom(zoom);if(zoom===6.25)A.view.wheel(0,{deltaX:.375});},zoom);
   await page.waitForFunction(()=>{const A=window.__psd_editor,s=A.decode.status();return s&&!s.pending&&!s.queued&&s.tiles.wanted&&s.tiles.residentWanted===s.tiles.wanted;});
   const result=await page.evaluate(async({dpr,zoom})=>{
    const A=window.__psd_editor,G=A.gpu.G,x=3431,y=5066,s=zoom*dpr;A.gpu.frame();await A.gpu.flush();
    const W=Math.ceil(4*s),H=Math.ceil(4*s),p=await G.gc.renderToRGBA(G.drawList,{W,H,s,tx:-x*s,ty:-y*s});let maxError=0,withinCellError=0;
    for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){
     const cx=Math.floor((xx+.5)/s),cy=Math.floor((yy+.5)/s),sx=x+cx,sy=y+cy,want=[171,65,211].map(v=>(v+(Math.floor(sx/128)%8)*7+(sy%64)*3)&255).concat(255),q=(yy*W+xx)*4,first=(Math.max(0,Math.ceil(cy*s-.5))*W+Math.max(0,Math.ceil(cx*s-.5)))*4;
     for(let c=0;c<4;c++){maxError=Math.max(maxError,Math.abs(p[q+c]-want[c]));withinCellError=Math.max(withinCellError,Math.abs(p[q+c]-p[first+c]));}
    }
    const seam=await G.gc.renderToRGBA(G.drawList,{W,H,s,tx:-3326*s,ty:-4862*s});let seamError=0;
    for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){
     const sx=3326+Math.floor((xx+.5)/s),sy=4862+Math.floor((yy+.5)/s),want=[171,65,211].map(v=>(v+(Math.floor(sx/128)%8)*7+(sy%64)*3)&255).concat(255);
     for(let c=0;c<4;c++)seamError=Math.max(seamError,Math.abs(seam[(yy*W+xx)*4+c]-want[c]));
    }
    A.gpu.frame();await A.gpu.flush();
    const cv=document.querySelector('#gizmoView'),ctx=cv.getContext('2d'),m=ctx.getTransform(),gx=Math.ceil(-m.e/m.a)+4,gy=Math.ceil(-m.f/m.d)+4,row=Math.round(m.f+(gy+.4)*m.d),rgba=ctx.getImageData(0,row,cv.width,1).data,grid=[];
    for(let n=0;n<8;n++){const at=Math.ceil(m.e+(gx+n)*m.a-.5);grid.push({at,alpha:rgba[at*4+3],before:rgba[(at-1)*4+3],after:rgba[(at+1)*4+3]});}
    return {dpr,zoom,s,preview:[A.state.doc.layers[0].lazyPreview.width,A.state.doc.layers[0].lazyPreview.height],maxError,withinCellError,seamError,grid,sx:m.a,sy:m.d,gpu:A.gpu.active(),scratch:[...A.viewScratch].map(([id,c])=>[id,c.width,c.height])};
   },{dpr,zoom});
   reports.push(result);console.log(JSON.stringify(result));assert.equal(result.maxError,0,'each document pixel must fill exactly one pixel-grid cell');assert.equal(result.withinCellError,0,'native pixels must stay constant inside their cell');
   assert.equal(result.seamError,0,'pixel alignment must survive native tile boundaries');
   assert.equal(result.sx,zoom*dpr);assert.equal(result.sy,zoom*dpr);assert.ok(result.grid.every((g,i)=>g.alpha>0&&g.before===0&&g.after===0&&(!i||[Math.floor(zoom*dpr),Math.ceil(zoom*dpr)].includes(g.at-result.grid[i-1].at))));assert.equal(result.gpu,true);
   if(zoom===8){
    const clip=await page.locator('#viewport').evaluate(e=>{const r=e.getBoundingClientRect();return {x:Math.floor(r.x+r.width/2-128),y:Math.floor(r.y+r.height/2-96),width:256,height:192};});
    const png=await page.screenshot({...(process.env.PSD_EDITOR_GRID_SCREENSHOT&&dpr===2?{path:process.env.PSD_EDITOR_GRID_SCREENSHOT}:{}),clip});
    result.screenCellError=await page.evaluate(async({bytes,clip,dpr})=>{
     const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'})),cv=new OffscreenCanvas(image.width,image.height),ctx=cv.getContext('2d');ctx.drawImage(image,0,0);image.close();
     const G=window.__psd_editor.gpu.G,V=G.lastView,r=G.canvas.getBoundingClientRect();let error=0;
     for(const [x,y]of[[3431,5066],[3432,5067]]){
      const left=Math.ceil((r.left-clip.x)*dpr+V.tx+x*V.s-.5)+2,top=Math.ceil((r.top-clip.y)*dpr+V.ty+y*V.s-.5)+2,data=ctx.getImageData(left,top,Math.floor(V.s)-4,Math.floor(V.s)-4).data;
      for(let i=4;i<data.length;i++)error=Math.max(error,Math.abs(data[i]-data[i%4]));
     }return error;
    },{bytes:[...png],clip,dpr});
    assert.equal(result.screenCellError,0,'actual displayed pixels must also be constant inside each cell');
   }
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 if(process.env.PSD_EDITOR_PERF_REPORT)await writeFile(process.env.PSD_EDITOR_PERF_REPORT,JSON.stringify(reports,null,2)+'\n');
 console.log('✓ 大文档原生像素与网格逐格一致：500%/625%/800%/1600%，DPR 1/2、分数平移与瓦片边界');
}finally{await browser.close();}
