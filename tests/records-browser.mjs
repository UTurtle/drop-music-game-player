import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:51100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
const errors = [], posts = [], dimensions = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
const output = 'output/records'; await mkdir(output, { recursive: true });
await page.addInitScript(() => {
  window.__yt = { time: 0, set(time, status) { this.time = time; this.events.onStateChange({ data: status }); } };
  window.YT = { Player: class {
    constructor(host, options) { const iframe = document.createElement('iframe'); host.replaceWith(iframe); this.iframe = iframe; window.__yt.time = 0; window.__yt.events = options.events; setTimeout(() => options.events.onReady({ target: this }), 20); }
    getIframe() { return this.iframe; } getCurrentTime() { return window.__yt.time; }
    playVideo() { window.__yt.set(window.__yt.time, 1); } pauseVideo() { window.__yt.set(window.__yt.time, 2); }
    seekTo(time) { window.__yt.set(time, 3); } destroy() { this.iframe.remove(); }
  } };
});
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advanceTo = async ms => {
  while ((await page.evaluate(() => window.__yt.time)) * 1000 < ms - .001) {
    await page.evaluate(ms => { window.__yt.time = Math.min(ms / 1000, window.__yt.time + .1); window.advanceTime(1); }, ms);
  }
};
const line = difficulty => page.locator(`.saved-songs-panel .song-record-line[data-difficulty="${difficulty}"]`);
async function play(hits, expectSaved = true) {
  await page.locator('#play-button').click(); await page.evaluate(() => window.advanceTime(1));
  for (const [time, key] of hits) { await advanceTo(time); await page.keyboard.press(key); }
  await advanceTo(3000); await page.evaluate(() => window.__yt.set(3, 0));
  if (expectSaved) await page.getByText('최고 기록을 이 브라우저에 저장했습니다.', { exact: true }).waitFor();
  else await page.getByRole('button', { name: '기록 저장 재시도' }).waitFor();
}
try {
  await page.goto(base);
  // Seed a legacy v1 library item without records; no user's storage is touched.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('drop-local-library', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('songs', { keyPath: 'id' }); request.result.createObjectStore('audio'); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['songs', 'audio'], 'readwrite');
      const makeChart = difficulty => ({ schemaVersion: 1, chartId: `fixture-score-${difficulty}`, revision: 1, videoId: 'TzH5BsJj81Y', title: '기록 테스트 · Original fixture', difficulty, provenance: 'algorithmic', quality: 'instant', offsetMs: 0, durationMs: 3000, notes: [{ timeMs: 1000, lane: 'A' }, { timeMs: 2000, lane: 'D' }] });
      tx.objectStore('songs').put({ id: 'fixture-score', title: '기록 테스트 · Original fixture', updatedAt: 1, bytes: 44, filename: 'fixture.wav', mime: 'audio/wav', lastModified: 1, charts: { easy: makeChart('easy'), hard: makeChart('hard') } });
      tx.objectStore('audio').put(new Blob([new Uint8Array(44)], { type: 'audio/wav' }), 'fixture-score');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }));
  await page.goto(base + '/create?song=fixture-score'); await page.locator('#play-button').waitFor();
  await line('easy').filter({ hasText: '기록 없음' }).waitFor();
  await play([[1080, 'a'], [2000, 'd']]); assert.equal((await state()).score, 1700);
  await line('easy').filter({ hasText: '1,700점' }).waitFor(); assert.equal(await line('easy').locator('.record-perfect').count(), 0);
  await line('easy').locator('.record-full-combo').waitFor();
  await play([[1000, 'a'], [2000, 'd']]); await line('easy').locator('.record-perfect').waitFor();
  await play([]); assert.match(await line('easy').textContent(), /2,000점PERFECT/);
  await page.locator('.difficulty-switch button').filter({ hasText: 'Hard' }).click();
  await page.evaluate(() => {
    window.failRecord = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.failRecord && this.name === 'songs' && args[0].records) throw new DOMException('Full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await play([[1000, 'a']], false);
  assert.match(await line('hard').textContent(), /기록 없음/);
  await page.evaluate(() => { window.failRecord = false; });
  await page.getByRole('button', { name: '기록 저장 재시도' }).click();
  await line('hard').filter({ hasText: '1,000점' }).waitFor();
  assert.equal(await line('hard').locator('.record-perfect').count(), 0);
  // A seeked run must never replace or create a best record.
  await page.locator('#play-button').click(); await page.evaluate(() => { window.advanceTime(1); window.__yt.time = 2; window.advanceTime(1); });
  assert.equal((await state()).practice, true); await page.evaluate(() => window.__yt.set(3, 0));
  await page.getByText('탐색한 연습 세션은 최고 기록에 포함하지 않습니다.', { exact: true }).waitFor();
  await page.reload(); await line('easy').locator('.record-perfect').waitFor();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const embed = await page.locator('iframe').boundingBox(), notes = await page.locator('canvas').boundingBox();
    assert.ok(notes.y >= embed.y + embed.height - 1, 'Notes must not overlay the embedded player');
    assert.ok(embed.width >= 200 && embed.height >= 200, 'All mobile embeds must meet the minimum viewport');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })).slice(0, 12));
    await page.screenshot({ path: `${output}/layout-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify({ width, overflow }));
    dimensions.push({ width, embed, minimumSizeMet: embed.width >= 200 && embed.height >= 200 });
  }
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  await page.goto(base + '/library');
  await page.locator('.library-list .record-perfect').waitFor();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  assert.match(await page.locator('.library-list').textContent(), /2,000 ptsPERFECT/);
  await page.screenshot({ path: `${output}/library.png`, fullPage: true });
  await page.getByRole('button', { name: /Delete$/ }).click(); await page.getByText('No saved music yet.').waitFor();
  await page.reload(); await page.getByText('No saved music yet.').waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(posts, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ errors, posts, dimensions }, null, 2));
  console.log('PASS: completed Easy/Hard bests, all-perfect vs final-perfect, lower-score retention, seek exclusion, legacy/reload/library/delete, KO/EN, mobile no overflow. Embed dimensions:', dimensions);
} finally { await browser.close(); }
