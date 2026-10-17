import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';
const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => window.__psd_editorPresets?.lib.ready);
  const out = await page.evaluate(async () => {
    const P = window.__psd_editorPresets, panels = P._api().panels;
    const host = document.querySelector('section.panel[data-panel="styles"]');
    const initial = { visible: panels.isVisible('styles'), rows: host.querySelectorAll('.pp-tile').length, count: P.lib.styles.length };
    const hidden = ['styles', 'patterns', 'gradients', 'shapes', 'swatches'].filter(k => !panels.isVisible(k))
      .map(kind => ({ kind, rows: panels.sectionOf(kind)?.querySelectorAll('.pp-tile').length || 0 }));
    const proto = CanvasRenderingContext2D.prototype, original = proto.getImageData;
    let reads = 0;
    proto.getImageData = function(...args){ reads++; return original.apply(this, args); };
    let shown, populated;
    try {
      panels.show('styles'); P.render('styles'); P.render('styles');
      const cv = host.querySelector('.pp-tile canvas');
      shown = { rows: host.querySelectorAll('.pp-tile').length, reads };
      populated = cv && { canvas: cv, width: cv.width, height: cv.height };
    } finally { proto.getImageData = original; }
    const data = populated.canvas.getContext('2d').getImageData(0, 0, populated.width, populated.height).data;
    const colors = new Set(); for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]}:${data[i + 1]}:${data[i + 2]}:${data[i + 3]}`);
    const prior = host.querySelector('.pp-tile'); panels.hide('styles');
    await P.reload('styles'); const hiddenPreserved = host.querySelector('.pp-tile') === prior;
    panels.show('styles');
    return { initial, hidden, shown, colors: colors.size, hiddenPreserved, refreshedOnShow: host.querySelector('.pp-tile') !== prior };
  });
  assert.equal(out.initial.visible, false); assert.equal(out.initial.rows, 0); assert.ok(out.initial.count > 0);
  assert.ok(out.hidden.length > 0); assert.ok(out.hidden.every(p => p.rows === 0), JSON.stringify(out.hidden));
  assert.ok(out.shown.rows > 0); assert.equal(out.shown.reads, 0);
  assert.ok(out.colors > 1, 'style previews were not rendered');
  assert.equal(out.hiddenPreserved, true); assert.equal(out.refreshedOnShow, true);
  assert.deepEqual(errors, []);
  console.log('✓ 隐藏样式面板延后缩略图计算；显示/重绘不读回像素；后台更新在再显示时生效');
} finally { await browser.close(); }
