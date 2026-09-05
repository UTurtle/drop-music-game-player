import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:51100';
await mkdir('output/judgments', { recursive: true });
try {
  for (const [label, delay] of [['PERFECT', 0], ['GOOD', 80], ['OK', 125]]) {
    await page.goto(base + '/practice?test=1'); await page.locator('#play-button').click();
    await page.evaluate(ms => window.advanceTime(ms), 2000 + delay); await page.keyboard.press('a');
    await page.evaluate(() => window.advanceTime(1));
    assert.equal((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).feedback.at(-1).verdict, label);
    await page.locator('canvas').screenshot({ path: `output/judgments/${label}.png` });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/practice?test=1'); await page.locator('#play-button').click();
  await page.evaluate(() => window.advanceTime(2000)); await page.keyboard.press('a'); await page.evaluate(() => window.advanceTime(1));
  await page.locator('canvas').screenshot({ path: 'output/judgments/reduced.png' });
  assert.deepEqual(errors, []); console.log('PASS: distinct per-hit PERFECT/GOOD/OK feedback and reduced-motion rendering');
} finally { await browser.close(); }
