import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW=await loadPlaywright();if(!PW)throw new Error('Playwright required');
const browser=await PW.chromium.launch({executablePath:process.env.CHROMIUM||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let count=0;
try{
 await page.goto(`http://127.0.0.1:${process.argv[2]||18949}/editor`);await page.waitForFunction(()=>window.__psd_editor?.state,null,{timeout:60000});
 await page.evaluate(async()=>{
  const D=await import('/editor/documents.js'),S=await import('/editor/app/02-doc-state.js'),H=await import('/editor/app/03-history.js'),F=await import('/editor/document-file.js'),{writePsd}=await import('/core/psd-write.js');
  const bytes=writePsd({width:32,height:32,layers:[{name:'Original',bounds:{left:0,top:0,right:32,bottom:32},rgba:new Uint8Array(32*32*4).fill(255)}],composite:new Uint8Array(32*32*4).fill(255)});
  const log={pickers:0,writes:[],abort:0,events:[]};let queue=[];
  function handle(name,fail=false){let data=bytes;return{name,getFile:async()=>new File([data],name),createWritable:async()=>({write:async buf=>{if(fail)throw new Error('disk full');data=buf;log.writes.push({name,length:buf.byteLength,bytes:Array.from(new Uint8Array(buf).slice(0,4))});},close:async()=>{},abort:async()=>{log.abort++;}})};}
  window.showSaveFilePicker=()=>{log.pickers++;log.events.push('picker');const h=queue.shift();return h instanceof Error?Promise.reject(h):Promise.resolve(h);};
  const originalBuild=(await import('/editor/app/48-info-export.js')).buildPsdBuffer;
  window.__saveTest={D:D.DOCS,S,H,F,log,handle,bytes,queue,
   async open(name){await D.DOCS.openBuffer(bytes,name);return D.DOCS.activeUid();},
   edit(name){S.layerRenames[0]=name;},
   save:mode=>F.saveDocumentFile(mode),dirty:()=>D.DOCS.isDirty(),name:()=>S.docName,
   history:()=>({doc:H.docHistory.undo.length,brush:S.brushHistory.undo.length,items:H.histLog.items.length,cursor:H.histLog.cursor}),
  };
 });
 const test=async(name,fn)=>{await fn();count++;console.log('✓',name);};
 await test('first save chooses a target; subsequent Ctrl+S overwrites it without another picker',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;await T.open('one.psd');T.edit('edited');T.queue.push(T.handle('one.psd'));window.firstHistory=T.history();if(!await T.save())throw Error('save failed');});
  assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
  assert.deepEqual(await page.evaluate(()=>window.__saveTest.history()),await page.evaluate(()=>window.firstHistory));
  await page.evaluate(()=>window.__saveTest.edit('second edit'));
  assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.keyboard.press((await page.evaluate(()=>/Mac/.test(navigator.platform)))?'Meta+s':'Control+s');await page.waitForFunction(()=>window.__saveTest.log.writes.length===2);
  assert.equal(await page.evaluate(()=>window.__saveTest.log.pickers),1);
  assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
  assert.deepEqual(await page.evaluate(()=>window.__saveTest.log.writes[1].bytes),[56,66,80,83]);
 });
 await test('Save Copy keeps source binding and dirty state; Save As changes both target and name',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;T.edit('third');T.queue.push(T.handle('copy.psd'));if(!await T.save('copy'))throw Error('copy failed');});
  assert.equal(await page.evaluate(()=>window.__saveTest.name()),'one.psd');assert.equal(await page.evaluate(()=>window.__saveTest.F.documentFile().name),'one.psd');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.evaluate(async()=>{const T=window.__saveTest;T.queue.push(T.handle('renamed.psd'));await T.save('as');});
  assert.equal(await page.evaluate(()=>window.__saveTest.name()),'renamed.psd');assert.equal(await page.evaluate(()=>window.__saveTest.F.documentFile().name),'renamed.psd');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
 });
 await test('cancel and write failure preserve edits and previous file binding',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;T.edit('fourth');T.queue.push(new DOMException('cancel','AbortError'));window.result=await T.save('as');});
  assert.equal(await page.evaluate(()=>window.result),false);assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.evaluate(async()=>{const T=window.__saveTest;T.queue.push(T.handle('broken.psd',true));window.result=await T.save('as');});
  assert.equal(await page.evaluate(()=>window.result),false);assert.equal(await page.evaluate(()=>window.__saveTest.F.documentFile().name),'renamed.psd');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);assert.equal(await page.evaluate(()=>window.__saveTest.log.abort),1);
 });
 await test('native Open retains source handle; document switches keep independent save targets',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;window.oldUid=T.D.activeUid();window.showOpenFilePicker=()=>Promise.resolve([T.handle('two.psd')]);await T.F.openDocumentFile();T.edit('document two');window.secondUid=T.D.activeUid();await T.save();const first=T.D.list().find(v=>v.uid===window.oldUid);await T.D.activate(first.view);await T.save();});
  assert.deepEqual(await page.evaluate(()=>window.__saveTest.log.writes.slice(-2).map(x=>x.name)),['two.psd','renamed.psd']);
  assert.equal(await page.evaluate(()=>window.__saveTest.log.pickers),5);
 });
 await test('write permission is requested while saving still owns the user gesture; denial keeps dirty',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;const h=T.F.documentFile();h.requestPermission=()=>Promise.resolve('denied');T.edit('permission denied');window.result=await T.save();});
  assert.equal(await page.evaluate(()=>window.result),false);assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.evaluate(()=>{const T=window.__saveTest;T.F.documentFile().requestPermission=()=>Promise.resolve('granted');});
 });
 await test('dragged PSD file-system handle is bound to the new document',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;const h=T.handle('drop.psd'),file=await h.getFile(),ev=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(ev,'dataTransfer',{value:{types:['Files'],files:[file],items:[{kind:'file',getAsFile:()=>file,getAsFileSystemHandle:()=>Promise.resolve(h)}]}});window.dispatchEvent(ev);});
  await page.waitForFunction(()=>window.__saveTest.F.documentFile()?.name==='drop.psd');
  await page.evaluate(async()=>{const T=window.__saveTest;T.edit('drag edit');await T.save();});assert.equal(await page.evaluate(()=>window.__saveTest.log.writes.at(-1).name),'drop.psd');
 });
 await test('Undo after save marks dirty; Redo to saved state clears dirty without erasing history',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;T.H.pushDocHistory('Rename');T.edit('undoable rename');await T.save();});
  assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
  await page.evaluate(()=>window.__saveTest.H.historyStep(true));assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.evaluate(()=>window.__saveTest.H.historyStep(false));assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
 });
 await test('F12 reverts to the latest Save bytes in the same tab and retains its target',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;T.edit('latest saved name');await T.save();window.revertUid=T.D.activeUid();window.revertCount=T.D.count();T.edit('unsaved name');window.__fpDialog=()=>true;const A=await import('/editor/actions.js');A.actions.run('file.revert');await T.H.LAST_RUN;});
  assert.equal(await page.evaluate(()=>window.__saveTest.S.doc.layers[0].name),'latest saved name');
  assert.equal(await page.evaluate(()=>window.__saveTest.D.activeUid()),await page.evaluate(()=>window.revertUid));assert.equal(await page.evaluate(()=>window.__saveTest.D.count()),await page.evaluate(()=>window.revertCount));
  assert.equal(await page.evaluate(()=>window.__saveTest.F.documentFile().name),'drop.psd');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
 });
 await test('F12 cancellation preserves edits and multi-document Save As targets revert independently',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;T.edit('cancel kept');window.__fpDialog=()=>false;const A=await import('/editor/actions.js');A.actions.run('file.revert');await T.H.LAST_RUN;});
  assert.equal(await page.evaluate(()=>window.__saveTest.S.layerRenames[0]),'cancel kept');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.evaluate(async()=>{const T=window.__saveTest;window.__fpDialog=()=>true;const A=await import('/editor/actions.js');const original=T.D.list().find(v=>v.uid===window.oldUid);await T.D.activate(original.view);T.edit('unsaved first document');A.actions.run('file.revert');await T.H.LAST_RUN;});
  assert.equal(await page.evaluate(()=>window.__saveTest.name()),'renamed.psd');assert.equal(await page.evaluate(()=>window.__saveTest.S.doc.layers[0].name),'fourth');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),false);
  await page.evaluate(()=>{delete window.__fpDialog;});
 });
 await test('Revert read failure preserves live edits; successful Revert closes without a save warning',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;T.edit('preserve on read failure');const h=T.F.documentFile();window.originalGetFile=h.getFile;h.getFile=async()=>{throw Error('read failed');};window.result=await T.F.revertDocumentFile();h.getFile=window.originalGetFile;});
  assert.equal(await page.evaluate(()=>window.result),false);assert.equal(await page.evaluate(()=>window.__saveTest.S.layerRenames[0]),'preserve on read failure');assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);
  await page.evaluate(async()=>{const T=window.__saveTest;await T.F.revertDocumentFile();window.closePrompts=0;window.__fpDialog=()=>{window.closePrompts++;return false;};window.result=await T.D.close();delete window.__fpDialog;});
  assert.equal(await page.evaluate(()=>window.result),true);assert.equal(await page.evaluate(()=>window.closePrompts),0);
 });
 await test('Ctrl/Cmd+S inside a smart object writes to its parent and retains the inner document',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;await T.open('parent.psd');const C=await import('/editor/app/26-layer-create.js'),B=await import('/editor/app/20-snap-smart-object.js');await C.convertToSmartObjectUI(0);await B.openInside(0);if(T.S.docStack.length!==1)throw Error('inner document not opened');T.edit('inner saved');window.oldPickerCount=T.log.pickers;window.result=await T.save();window.insideClean=!B.insideDirty();});
  assert.equal(await page.evaluate(()=>window.result),true);assert.equal(await page.evaluate(()=>window.__saveTest.S.docStack.length),1);assert.equal(await page.evaluate(()=>window.insideClean),true);assert.equal(await page.evaluate(()=>window.__saveTest.log.pickers),await page.evaluate(()=>window.oldPickerCount));
  await page.evaluate(async()=>{const B=await import('/editor/app/20-snap-smart-object.js');await B.exitInside({save:false});});
 });
 await test('unsupported browser reports inability to overwrite rather than downloading silently',async()=>{
  await page.evaluate(async()=>{const T=window.__saveTest;await T.open('unbound.psd');T.edit('still dirty');window.showSaveFilePicker=undefined;window.result=await T.save();});
  assert.equal(await page.evaluate(()=>window.result),false);assert.equal(await page.evaluate(()=>window.__saveTest.dirty()),true);assert.match(await page.locator('#err').textContent(),/无法直接保存/);
 });
 assert.deepEqual(errors,[]);console.log(`${count} document save cases passed`);
}finally{await browser.close();}
