import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const origin = `http://127.0.0.1:${process.argv[2]}`;
try {
  await page.goto(origin + '/editor');
  await page.waitForFunction(() => window.__psd_editorPresets?.lib.ready, null, { timeout: 60000 });
  const summary = await page.evaluate(() => {
    const P = window.__psd_editorPresets;
    return Object.fromEntries(['swatches', 'gradients', 'patterns'].map(k => [k, { groups: P.lib.groups[k].filter(g => g.builtinPack === 'default-' + k).map(g => g.name), count: P.lib[k].filter(it => it.sourcePack === 'default-' + k).length }]));
  });
  assert.deepEqual(summary.swatches.groups, ['RGB','CMYK','灰度','蜡笔','浅色','纯净','黑色','较暗','淡色']);
  assert.equal(summary.swatches.count, 122); assert.equal(summary.gradients.count, 183); assert.equal(summary.patterns.count, 10);
  assert.deepEqual(summary.patterns.groups, ['树','草','水滴']);
  console.log('✓ native default counts and folder names');
  for (const kind of ['swatches', 'gradients', 'patterns']) {
    await page.evaluate(kind => { const P = window.__psd_editorPresets; P._api().panels.show(kind); P.render(kind); }, kind);
    const host = page.locator(`.pp-panel[data-preset-kind=${kind}]`), first = host.locator('.pp-group').first();
    assert.ok((await host.locator('.pp-group-name').allTextContents()).every(n => !n.startsWith('PS ·')));
    const old = await first.locator('.pp-group-name').textContent();
    await first.locator('.pp-group-name').dblclick();
    const rename = host.locator('.pp-rename'); await rename.waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await rename.fill(kind + ' 已改名'); await rename.press('Enter');
    await page.waitForFunction(({kind}) => document.querySelector(`.pp-panel[data-preset-kind=${kind}] .pp-group-name`)?.textContent === kind + ' 已改名', { kind });
    await first.locator('.pp-group-name').dblclick(); await rename.fill('取消改名'); await rename.press('Escape');
    assert.equal(await first.locator('.pp-group-name').textContent(), kind + ' 已改名');
    await first.locator('.pp-group-name').dblclick(); await rename.fill(old); await rename.press('Tab');
    await page.waitForFunction(({kind,old}) => document.querySelector(`.pp-panel[data-preset-kind=${kind}] .pp-group-name`)?.textContent === old, {kind,old});
    const before = await host.locator('.pp-tile').count();
    await first.locator('.pp-tri').click();
    await page.waitForFunction(({kind,before}) => document.querySelectorAll(`.pp-panel[data-preset-kind=${kind}] .pp-tile`).length !== before, {kind,before});
    await first.locator('.pp-tri').click();
    await page.waitForFunction(({kind,before}) => document.querySelectorAll(`.pp-panel[data-preset-kind=${kind}] .pp-tile`).length === before, {kind,before});
    const tile=host.locator('.pp-tile').first(), itemId=await tile.getAttribute('data-id');
    const itemName=await page.evaluate(({kind,itemId})=>window.__psd_editorPresets.lib[kind].find(i=>i.id===itemId||'lib:'+i.id===itemId)?.name,{kind,itemId});
    await tile.dblclick();await rename.waitFor();await rename.fill(itemName+' test');await rename.press('Enter');
    await page.waitForFunction(({kind,itemId,itemName})=>window.__psd_editorPresets.lib[kind].find(i=>i.id===itemId||'lib:'+i.id===itemId)?.name===itemName+' test',{kind,itemId,itemName});
    await tile.dblclick();await rename.fill(itemName);await rename.press('Enter');
    await page.waitForFunction(({kind,itemId,itemName})=>window.__psd_editorPresets.lib[kind].find(i=>i.id===itemId||'lib:'+i.id===itemId)?.name===itemName,{kind,itemId,itemName});
    console.log('✓', kind, 'inline rename, Enter/blur commit, Escape cancel and disclosure');
  }
  await page.evaluate(async () => {
    const { noteRecentColor } = await import('/editor/color-panel.js');
    for (const c of [[255,0,0],[255,255,0],[0,255,0],[0,255,255],[0,0,255],[255,0,255]]) noteRecentColor(c);
    const P=window.__psd_editorPresets; P._api().panels.show('swatches');
    const group=document.getElementById('panelSwatches').closest('.panel-group'); group.style.height='380px'; group.style.flex='0 0 auto'; P.render('swatches');
  });
  const layout = await page.evaluate(() => {
    const host=document.querySelector('.pp-panel[data-preset-kind=swatches]'), body=host.querySelector('.pp-body'), recent=host.querySelector('.pp-recent'), footer=host.querySelector('.pp-foot');
    const top=recent.getBoundingClientRect().top, bottom=footer.getBoundingClientRect().bottom;
    body.scrollTop=100;
    return { fixed: top===recent.getBoundingClientRect().top && bottom===footer.getBoundingClientRect().bottom, size:host.querySelector('.pp-swc').getBoundingClientRect().width, root:recent.parentNode===host };
  });
  assert.deepEqual(layout,{fixed:true,size:28,root:true});
  await page.evaluate(() => { document.querySelector('#swatchGrid .pp-body').scrollTop = 0; });
  await page.locator('#panelSwatches').screenshot({path:'/tmp/psd_editor-swatches.png'});
  await page.reload(); await page.waitForFunction(()=>window.__psd_editorPresets?.lib.ready,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.__psd_editorPresets.lib.swatches.length),122);
  console.log('✓ pinned recent colors and footer, contiguous 28px swatches, reload without duplicates');
  const oldContext = await browser.newContext(), oldPage = await oldContext.newPage();
  await oldPage.goto(origin);
  const migration = await oldPage.evaluate(async () => {
    const S = await import('/editor/preset-store.js'), P = await import('/editor/photoshop-presets.js');
    const m = await P.photoshopPresetManifest(), pack = m.packs.find(p => p.id === 'default-swatches');
    const bytes = new Uint8Array(await (await fetch(pack.url)).arrayBuffer());
    const { batches } = await P.decodePhotoshopPresetPack(pack, bytes), items = batches.flatMap(b => b.items);
    await S.installPresetPack(pack, [{kind:'swatches',groupName:'PS · 默认色板',items}]);
    await S.renamePreset('swatches',items[0].id,'保留我的红色');
    await S.removePreset('swatches',items[1].id);
    const user = await S.addGroup('swatches','我的颜色');
    await S.updatePreset('swatches',items[2].id,{group:user.id});
    localStorage.setItem('fp.presetsSeeded.v1',JSON.stringify({swatches:1,patterns:1}));
    const seed = ['#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff'];
    await S.addPresets('swatches',seed.map(h=>({name:h,color:[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),model:'rgb'})),{groupName:'RGB'});
    await S.addPresets('swatches',[{name:'自定义',color:[1,2,3],model:'rgb'}],{groupName:'浅色'});
    return { rename:items[0].id, deleted:items[1].id, moved:items[2].id, group:user.id };
  });
  await oldPage.goto(origin+'/editor'); await oldPage.waitForFunction(()=>window.__psd_editorPresets?.lib.ready,null,{timeout:60000});
  const upgraded=await oldPage.evaluate(({rename,deleted,moved,group})=>{
    const P=window.__psd_editorPresets,items=P.lib.swatches,groups=P.lib.groups.swatches;
    return { renamed:items.find(i=>i.id===rename)?.name,deleted:!items.some(i=>i.id===deleted),moved:items.find(i=>i.id===moved)?.group===group,custom:items.some(i=>i.name==='自定义'),duplicates:groups.filter(g=>g.name==='RGB').length,old:groups.some(g=>g.name==='PS · 默认色板'),count:items.length };
  },migration);
  assert.deepEqual(upgraded,{renamed:'保留我的红色',deleted:true,moved:true,custom:true,duplicates:1,old:false,count:122});
  await oldPage.reload();await oldPage.waitForFunction(()=>window.__psd_editorPresets?.lib.ready,null,{timeout:60000});
  assert.equal(await oldPage.evaluate(()=>window.__psd_editorPresets.lib.swatches.length),122);
  await oldContext.close();
  console.log('✓ existing installation regrouping preserves renames/deletions/moves/custom content and retires only unchanged example colors');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
