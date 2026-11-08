// Native Windows/macOS acceptance checks. Runs only in isolated CI browsers.
// Usage: node e2e/compatibility.mjs chromium|msedge|webkit
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const engine = process.argv[2] || 'chromium';
assert(['chromium', 'msedge', 'webkit'].includes(engine));
const mac = process.platform === 'darwin';
const mod = mac ? 'Meta' : 'Control';
const url = 'http://127.0.0.1:4173/mind-the-dag/';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'inherit' });
let browser;
let page;
let step = 'start';
const log = (s) => { step = s; console.log(`${process.platform}/${engine}: ${s}`); };
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* wait for preview */ }
    if (i === 59) throw new Error('Preview did not start');
    await new Promise(r => setTimeout(r, 500));
  }
  browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'msedge' ? { channel: 'msedge' } : {});
  page = await browser.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(15000);
  const stations = page.locator('svg.canvas g[data-sel^="station:"]');
  const count = async n => { await page.waitForFunction(n => document.querySelectorAll('svg.canvas g[data-sel^="station:"]').length === n, n); };
  const saved = () => page.locator('.save-state', { hasText: /^Saved$/ }).waitFor();
  const exportMenu = async name => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name }).click();
  };
  const download = async (action, name) => {
    const pending = page.waitForEvent('download');
    await action();
    const file = await pending;
    assert.equal(file.suggestedFilename(), name);
    assert.equal(await file.failure(), null);
    return { path: await file.path(), bytes: await readFile(await file.path()) };
  };

  log('create a local map and check native shortcut hints');
  await page.goto(url);
  const guest = page.getByRole('button', { name: /Try it without an account/ });
  if (await guest.isVisible()) await guest.click();
  await page.getByRole('button', { name: 'New map', exact: true }).click();
  await page.getByRole('button', { name: 'Use an example', exact: true }).click();
  const initialCount = await stations.count();
  assert(initialCount > 2);
  await page.getByLabel('Map title').fill('CON');
  await page.getByRole('button', { name: 'Select V', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).getAttribute('title'), mac ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)');
  assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).getAttribute('title'), mac ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Y)');

  log('select, duplicate, undo/redo, delete, save and reload');
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+d`); await count(initialCount * 2);
  await page.keyboard.press(`${mod}+z`); await count(initialCount);
  await page.keyboard.press(mac ? 'Meta+Shift+z' : 'Control+y'); await count(initialCount * 2);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(mac ? 'Backspace' : 'Delete'); await count(0);
  await page.keyboard.press(`${mod}+z`); await count(initialCount * 2);
  await page.keyboard.press(`${mod}+z`); await count(initialCount);
  await page.keyboard.press(`${mod}+s`); await saved();
  await page.reload(); await count(initialCount);
  assert.equal(await page.getByLabel('Map title').inputValue(), 'CON');

  log('download JSON, SVG, PDF and PNG with a Windows-safe filename');
  const json = await download(() => exportMenu(/^Map file/), 'map-con.json');
  const doc = JSON.parse(json.bytes.toString());
  assert.equal(doc.stations.length, initialCount);
  assert.equal(doc.title, 'CON');
  for (const format of ['SVG', 'PDF', 'PNG']) {
    await exportMenu(new RegExp(`^${format}\\b`));
    const dialog = page.getByRole('dialog', { name: `Export ${format}`, exact: true });
    const file = await download(() => dialog.getByRole('button', { name: 'Export', exact: true }).click(), `map-con.${format.toLowerCase()}`);
    assert(file.bytes.length > 1000, `${format} file is unexpectedly small`);
    if (format === 'SVG') {
      const text = file.bytes.toString();
      assert(text.includes('<svg') && text.includes('<title>CON</title>'));
      assert(text.includes('data:font/ttf;base64,'), 'SVG fonts must be embedded');
      assert(text.includes('MetaPhlAn'), 'SVG station labels missing');
    } else if (format === 'PDF') {
      assert(file.bytes.toString('ascii', 0, 8).startsWith('%PDF-'));
      assert(file.bytes.includes(Buffer.from('/FontFile2')), 'PDF font missing');
      assert(file.bytes.subarray(-40).toString().includes('%%EOF'));
    } else {
      assert.equal(file.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert(file.bytes.readUInt32BE(16) > 100 && file.bytes.readUInt32BE(20) > 100);
      // Decode the actual downloaded image; a valid but blank PNG is not a pass.
      const visible = await page.evaluate(async base64 => {
        const img = new Image(); img.src = `data:image/png;base64,${base64}`; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 100 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 200) ink++;
        return ink;
      }, file.bytes.toString('base64'));
      assert(visible > 1000, 'PNG has no visible map');
    }
  }
  log('open the downloaded JSON using the native Open shortcut');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select V', exact: true }).click();
  await page.keyboard.press(`${mod}+o`);
  await (await chooser).setFiles(json.path);
  await count(initialCount); await saved();
  const roundtrip = await download(() => exportMenu(/^Map file/), 'map-con.json');
  assert.deepEqual(JSON.parse(roundtrip.bytes.toString()), doc);

  log('save with an offline browser and recover after reload');
  await page.context().setOffline(true);
  await page.getByLabel('Map title').fill('Offline retained');
  await page.getByLabel('Map title').press(`${mod}+s`); await saved();
  await page.context().setOffline(false);
  await page.reload(); await count(initialCount);
  assert.equal(await page.getByLabel('Map title').inputValue(), 'Offline retained');

  log('find map actions without hover, cancel deletion, and restore a deleted map');
  await page.getByRole('button', { name: 'mind-the-dag: all maps', exact: true }).click();
  const card = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: /^Offline retained$/ }) });
  await card.waitFor({ state: 'visible' });
  await page.mouse.move(0, 0);
  assert(await card.getByRole('button', { name: 'Duplicate', exact: true }).isVisible());
  assert(await card.getByRole('button', { name: 'Delete', exact: true }).isVisible());
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete “Offline retained”?' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await card.getByRole('button', { name: 'Delete', exact: true }).evaluate(el => el === document.activeElement));

  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete “Offline retained”?' });
  await confirmation.getByText(/Recently deleted/).waitFor();
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await card.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Recently deleted', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Recently deleted', exact: true });
  await recovery.locator('.callout').filter({ hasText: 'Offline retained' }).getByRole('button', { name: 'Restore', exact: true }).click();
  await recovery.getByRole('status').filter({ hasText: 'Restored “Offline retained”.' }).waitFor();
  await recovery.getByRole('button', { name: 'Close', exact: true }).click();
  await card.locator('.card-main').click(); await count(initialCount);
  assert.equal(await page.getByLabel('Map title').inputValue(), 'Offline retained');
  await page.setViewportSize({ width: 1400, height: 900 });
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/${process.platform}-${engine}.png` });
  log('all compatibility checks passed');
} catch (error) {
  console.error(`Failed at: ${step}`);
  if (page) {
    console.error((await page.locator('body').innerText()).slice(0, 6000));
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: `test-results/${process.platform}-${engine}-failed.png` });
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
