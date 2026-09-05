import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:51100';
await mkdir('output/play-theme', { recursive: true });
const bodyColor = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
try {
  await page.goto(base); const home = await bodyColor();
  await page.goto(base + '/practice?test=1'); await page.locator('#play-button').waitFor();
  assert.equal(await bodyColor(), 'rgb(8, 10, 12)');
  await page.locator('#play-button').click(); await page.evaluate(() => window.advanceTime(2000)); await page.keyboard.press('a'); await page.evaluate(() => window.advanceTime(1));
  assert.equal((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).score, 1000);
  const pixel = await page.locator('canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(3, 3, 1, 1).data]);
  assert.deepEqual(pixel, [7, 9, 11, 255]);
  await page.screenshot({ path: 'output/play-theme/desktop.png', fullPage: true });
  await page.keyboard.press('Space'); assert.equal(await bodyColor(), 'rgb(8, 10, 12)');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/play-theme/mobile-${width}.png`, fullPage: true });
  }
  await page.goto(base + '/library'); assert.notEqual(await bodyColor(), 'rgb(8, 10, 12)');
  await page.goto(base + '/create'); assert.notEqual(await bodyColor(), 'rgb(8, 10, 12)');
  await page.goto(base); assert.equal(await bodyColor(), home);
  assert.deepEqual(errors, []); console.log('PASS: play-only black theme, actual black canvas, scoring, pause, mobile and unchanged non-player pages');
} finally { await browser.close(); }
