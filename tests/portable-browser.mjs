import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:51100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true });
const output = 'output/portable'; await mkdir(output, { recursive: true });
const errors = [], posts = [];
function observe(page) { page.on('request', r => { assert.equal(/analysis\\.worker|browserModel\\.worker/.test(r.url()), false, 'Imported charts must not be regenerated'); }); page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); }); }
function wav() {
  const rate = 8000, frames = rate * 3, data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 220 / rate) * 1200), 44 + i * 2);
  return data;
}
try {
  const source = await browser.newPage({ locale: 'ko-KR', viewport: { width: 390, height: 844 } }); observe(source);
  await source.goto(base);
  await source.evaluate(bytes => new Promise((resolve, reject) => {
    const request = indexedDB.open('drop-local-library', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('songs', { keyPath: 'id' }); request.result.createObjectStore('audio'); };
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['songs', 'audio'], 'readwrite');
      const make = difficulty => ({ schemaVersion: 1, chartId: `transfer-${difficulty}`, revision: 1, videoId: '', title: '내 음악 테스트', difficulty, provenance: 'manual', quality: 'community', offsetMs: 0, durationMs: 3000, notes: [{ timeMs: 1000, lane: 'A' }, { timeMs: 2000, lane: 'D' }] });
      tx.objectStore('songs').put({ id: 'transfer', title: '내 음악 테스트', bytes: bytes.length, filename: 'private-name.wav', mime: 'audio/wav', lastModified: 1, updatedAt: 1, charts: { easy: make('easy'), hard: make('hard') }, records: { easy: { score: 2000, perfect: true }, hard: { score: 1700, fullCombo: true } } });
      tx.objectStore('audio').put(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), 'transfer');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }), [...wav()]);
  await source.goto(base + '/library');
  await source.evaluate(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      if (this.name === 'audio') throw new Error('Export must never read audio');
      return get.apply(this, args);
    };
  });
  await source.locator('.record-full-combo').waitFor();
  const downloadPromise = source.waitForEvent('download');
  await source.getByRole('button', { name: '내 음악 테스트 내보내기' }).click();
  const download = await downloadPromise, path = `${output}/portable.drop-chart`; await download.saveAs(path);
  const bytes = await readFile(path), metadata = JSON.parse(bytes);
  assert.equal(metadata.format, 'drop-chart'); assert.equal('audio' in metadata, false); assert.ok(bytes.length < wav().length);
  assert.equal(/score|records|perfect|fullCombo|private-name/.test(JSON.stringify(metadata)), false);
  const target = await browser.newPage({ locale: 'ko-KR', viewport: { width: 320, height: 844 } }); observe(target);
  await target.goto(base + '/library');
  await target.locator('.song-import input').setInputFiles(path);
  await target.locator('.song-import [role=status]').filter({ hasText: '가져오기 완료: 1 · 실패: 0' }).waitFor();
  assert.equal(await target.locator('.library-list li').count(), 1);
  assert.equal(await target.evaluate(() => new Promise(resolve => {
    const r = indexedDB.open('drop-local-library');
    r.onsuccess = () => { const db = r.result, tx = db.transaction('audio'), request = tx.objectStore('audio').count();
      tx.oncomplete = () => { resolve(request.result); db.close(); }; };
  })), 0);
  assert.equal(await target.locator('.library-list .record-perfect, .library-list .record-full-combo').count(), 0);
  assert.equal(await target.locator('.library-list .record-score').allTextContents().then(a => a.every(v => v === '기록 없음')), true);
  await target.screenshot({ path: `${output}/imported-mobile.png`, fullPage: true });
  await target.locator('.song-import input').setInputFiles(path);
  await target.waitForFunction(() => document.querySelectorAll('.library-list li').length === 2);
  await target.reload(); assert.equal(await target.locator('.library-list li').count(), 2);
  await target.getByRole('link', { name: '음원 연결', exact: true }).first().click();
  await target.locator('#connect-audio-file').waitFor();
  const pendingUrl = target.url();
  assert.equal(await target.locator('#play-button').count(), 0);
  await target.screenshot({ path: `${output}/connect-mobile.png`, fullPage: true });
  await target.locator('#connect-audio-file').setInputFiles({ name: 'own.wav', mimeType: 'audio/wav', buffer: wav() });
  await target.locator('#connect-audio-confirm').check();
  await target.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'audio') throw new DOMException('Full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await target.locator('#connect-audio-button').click();
  await target.locator('.connect-audio [role=alert]').waitFor();
  await target.evaluate(() => window.restorePut());
  await target.reload(); await target.locator('#connect-audio-file').waitFor();
  assert.equal(target.url(), pendingUrl);
  const badDuration = Buffer.concat([wav(), Buffer.alloc(8000 * 2 * 4)]);
  badDuration.writeUInt32LE(badDuration.length - 8, 4); badDuration.writeUInt32LE(badDuration.length - 44, 40);
  await target.locator('#connect-audio-file').setInputFiles({ name: 'wrong.wav', mimeType: 'audio/wav', buffer: badDuration });
  await target.locator('#connect-audio-confirm').check(); await target.locator('#connect-audio-button').click();
  await target.locator('.connect-audio [role=alert]').filter({ hasText: '길이' }).waitFor();
  await target.locator('#connect-audio-file').setInputFiles({ name: 'own.wav', mimeType: 'audio/wav', buffer: wav() });
  await target.locator('#connect-audio-confirm').check(); await target.locator('#connect-audio-button').click();
  await target.locator('#play-button').waitFor();
  await target.locator('#play-button').click(); await target.waitForTimeout(600);
  assert.ok((await target.evaluate(() => JSON.parse(window.render_game_to_text()))).timeMs > 0);
  await target.goto(base + '/library');
  const broken = Buffer.from(bytes); broken[broken.length - 1] ^= 1;
  await target.locator('.song-import input').setInputFiles({ name: 'broken.drop-chart', mimeType: 'application/octet-stream', buffer: broken });
  await target.locator('.song-import [role="alert"]').waitFor(); assert.equal(await target.locator('.library-list li').count(), 2);
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await target.locator('.song-import input').setInputFiles({ name: 'legacy.drop-song', mimeType: 'application/octet-stream', buffer: Buffer.from('DROPSONG') });
  await target.locator('.song-import [role=alert]').filter({ hasText: '실패: 1' }).waitFor();
  assert.equal(await target.locator('.library-list li').count(), 2);
  assert.deepEqual(errors, []); assert.deepEqual(posts, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ metadataKeys: Object.keys(metadata), errors, posts }, null, 2));
  console.log('PASS: chart-only sharing between isolated browsers, no audio/records/filename, pending reload, own-audio binding without analysis, duration mismatch and quota rollback, playback, corrupt rejection, mobile and no POST');
} finally { await browser.close(); }
