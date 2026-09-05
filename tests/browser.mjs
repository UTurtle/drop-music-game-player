import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:51100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
const output = 'output/browser'; await mkdir(output, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
try {
  await page.goto(base);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('heading', { name: 'Why aren’t my favorite songs in rhythm games?' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.screenshot({ path: `${output}/home-en.png`, fullPage: true });
  await page.getByRole('button', { name: 'KO', exact: true }).click();
  await page.getByRole('heading', { name: '내가 좋아하는 노래들은 왜 리듬게임에 추가 안 해주지?' }).waitFor();
  await page.screenshot({ path: `${output}/home-ko.png`, fullPage: true });
  for (const [left, right] of [['a','d'], ['ArrowLeft','ArrowRight'], ['z','x']]) {
    await page.goto(`${base}/practice?test=1`);
    await page.locator('#play-button').click();
    await advance(2000); await page.keyboard.press(left); assert.equal((await state()).score, 1000);
    await advance(1000); await page.keyboard.press(right); assert.equal((await state()).combo, 2);
    await page.keyboard.press('Space'); const paused = await state(); await advance(1000); assert.equal((await state()).timeMs, paused.timeMs);
    await page.keyboard.press('Space'); await advance(1250); assert.equal((await state()).misses, 1);
    await page.getByRole('button', { name: '처음부터' }).click(); assert.equal((await state()).score, 0);
    await advance(24000); assert.equal((await state()).status, 'ended');
  }
  await page.getByRole('button', { name: 'Hard', exact: true }).click(); await page.locator('#play-button').click();
  await advance(2000); await page.keyboard.press('z'); await advance(500); await page.keyboard.press('x');
  assert.equal((await state()).score, 2000);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  assert.equal((await state()).score, 2000, 'Language switch must not reset the game');
  await page.screenshot({ path: `${output}/playing.png`, fullPage: true });
  await page.reload(); assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#play-button').click(); await advance(1500);
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: ['EN/KO switch and persistence', 'All three key pairs score', 'Pause, misses, restart, end and Hard', 'Language switch preserves session', 'Mobile has no horizontal overflow'], pageErrors: errors }, null, 2));
  console.log('Practice game and bilingual UI passed');
} finally { await browser.close(); }
