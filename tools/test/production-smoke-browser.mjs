import assert from 'node:assert/strict';
import { loadPlaywright } from './pw.mjs';

const PW = await loadPlaywright();
if (!PW) throw new Error('Playwright required');
const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.argv[2] || 8787}/editor`);
  await page.waitForFunction(() => document.querySelector('#menubar').children.length > 0);
  await page.locator('.home-card[data-action="file.new"]').click();
  await page.locator('#newDlg').waitFor({ state: 'visible' });
  await page.locator('#ndW').fill('128'); await page.locator('#ndH').fill('128');
  await page.locator('#ndOk').click();
  await page.waitForFunction(() => !document.querySelector('#newLayerBtn').disabled);
  const count = await page.locator('.lrow').count();
  await page.locator('#newLayerBtn').click();
  await page.waitForFunction(n => document.querySelectorAll('.lrow').length > n, count);
  assert.deepEqual(errors, []);
  console.log('✓ production chunks initialize menus and create a document and layer without runtime errors');
} finally { await browser.close(); }
