import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:51100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
const errors = [], posts = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
await mkdir('output/ui-bulk', { recursive: true });
function wav(seconds = 3) {
  const rate = 22050, frames = rate * seconds, buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / rate, decay = Math.exp(-(t % .25) * 35);
    buffer.writeInt16LE(Math.round(Math.sin(t * 2 * Math.PI * 220) * decay * 12000), 44 + i * 2);
  }
  return buffer;
}
function songFile(name) {
  const make = difficulty => ({ schemaVersion: 1, chartId: `${name}-${difficulty}`, revision: 1, videoId: '', title: name, difficulty, provenance: 'manual', quality: 'community', offsetMs: 0, durationMs: 3000, notes: [{ timeMs: 1000, lane: 'A' }, { timeMs: 2000, lane: 'D' }] });
  return { name: `${name}.drop-chart`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'drop-chart', version: 1, charts: { easy: make('easy'), hard: make('hard') } })) };
}
try {
  await page.goto(base + '/library');
  assert.equal(await page.locator('.song-import input').getAttribute('multiple'), '');
  await page.locator('.song-import input').setInputFiles([songFile('one'), { name: 'bad.drop-chart', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') }, songFile('two')]);
  await page.waitForFunction(() => document.querySelectorAll('.library-list li').length === 2);
  await page.locator('.song-import [role=alert]').filter({ hasText: '실패: 1' }).waitFor();
  assert.equal(await page.locator('.record-perfect').count(), 0);
  await page.getByRole('button', { name: '전체 채보 내보내기 ↓', exact: true }).click();
  await page.locator('.library-export a[download]').waitFor();
  const pending = page.waitForEvent('download');
  await page.locator('.library-export a[download]').click();
  const download = await pending; const path = 'output/ui-bulk/all.drop-charts'; await download.saveAs(path);
  const data = await readFile(path); assert.equal(data.subarray(0, 8).toString(), 'DROPCHT1'); assert.equal(data.readUInt32LE(8), 2);
  let offset = 20;
  for (let i = 0; i < 2; i++) {
    const size = data.readUInt32LE(12 + i * 4);
    const manifest = JSON.parse(data.subarray(offset, offset + size));
    assert.equal('audio' in manifest, false);
    assert.equal(/score|records|perfect|fullCombo/.test(JSON.stringify(manifest)), false);
    assert.ok(manifest.charts.normal); offset += size;
  }
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '전체 삭제', exact: true }).click();
  assert.equal(await page.locator('.library-list li').count(), 2);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    window.restoreDelete = () => { IDBObjectStore.prototype.delete = original; };
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'audio') throw new DOMException('Injected deletion failure', 'UnknownError');
      return original.apply(this, args);
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '전체 삭제', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '전체 삭제에 실패' }).waitFor();
  assert.equal(await page.locator('.library-list li').count(), 2);
  await page.evaluate(() => window.restoreDelete());
  await page.reload(); await page.locator('.library-list li').first().waitFor();
  assert.equal(await page.locator('.library-list li').count(), 2);
  page.once('dialog', dialog => { assert.match(dialog.message(), /기록/); void dialog.accept(); });
  await page.getByRole('button', { name: '전체 삭제', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.library-list li'));
  await page.reload(); assert.equal(await page.locator('.library-list li').count(), 0);
  assert.deepEqual(await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('drop-local-library');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['songs', 'audio']);
      const songs = tx.objectStore('songs').count(), audio = tx.objectStore('audio').count();
      tx.oncomplete = () => { resolve([songs.result, audio.result]); db.close(); };
    };
  })), [0, 0]);
  await page.locator('.song-import input').setInputFiles(path);
  await page.waitForFunction(() => document.querySelectorAll('.library-list li').length === 2);
  await page.locator('.song-import [role=status]').filter({ hasText: '실패: 0' }).waitFor();
  await page.getByRole('link', { name: '음원 연결', exact: true }).first().click();
  await page.locator('#connect-audio-file').setInputFiles({ name: 'own.wav', mimeType: 'audio/wav', buffer: wav() });
  await page.locator('#connect-audio-confirm').check();
  await page.locator('#connect-audio-button').click(); await page.locator('#play-button').waitFor();
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await page.locator('#play-button').click(); await page.waitForTimeout(300);
  assert.ok((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).timeMs > 0);
  await page.getByText('최고 기록을 이 브라우저에 저장했습니다.', { exact: true }).waitFor({ timeout: 10000 });
  await page.reload(); await page.locator('#play-button').waitFor();
  assert.match(await page.locator('.saved-songs-panel a[aria-current] [data-difficulty=normal] .record-score').textContent(), /0점/);
  await page.goto(base + '/practice?test=1');
  await page.locator('#play-button').waitFor();
  assert.equal((await page.locator('canvas').boundingBox()).height, 348);
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await page.locator('#play-button').click(); await page.evaluate(() => window.advanceTime(2000));
  await page.keyboard.press('a'); await page.evaluate(() => window.advanceTime(1));
  assert.equal((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).score, 1000);
  await page.screenshot({ path: 'output/ui-bulk/play-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok((await page.locator('canvas').boundingBox()).height < 241);
    await page.screenshot({ path: `output/ui-bulk/play-${width}.png`, fullPage: true });
  }
  await page.goto(base + '/library'); await page.locator('.library-list li').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'output/ui-bulk/library-mobile.png', fullPage: true });
  await page.goto(base + '/create');
  const hard = page.locator('.hard-option input'); assert.equal(await hard.isChecked(), false);
  for (const includeHard of [false, true]) {
    await page.locator('#creator-title').fill(`Generated ${includeHard}`);
    await page.locator('#creator-audio').setInputFiles({ name: 'original.wav', mimeType: 'audio/wav', buffer: wav(12) });
    await hard.setChecked(includeHard);
    await page.locator('.generate-button').click(); await page.locator('#play-button').waitFor({ timeout: 60000 });
    assert.equal(await page.getByRole('button', { name: 'Normal', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Hard', exact: true }).count(), includeHard ? 1 : 0);
    await page.reload(); await page.locator('#play-button').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Hard', exact: true }).count(), includeHard ? 1 : 0);
    await page.goto(base + '/create');
  }
  assert.deepEqual(errors, []); assert.deepEqual(posts, []);
  console.log('PASS: multi-import partial failure, legacy Normal, archive no scores, delete confirm/cancel/reload, archive import, local Normal playback, 60% height, mobile, DSP defaults and optional Hard persisted, no POST');
} finally { await browser.close(); }
