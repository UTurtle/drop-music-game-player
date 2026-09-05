// Optional real hardware test. No mock inference; use only an original/authorized local fixture.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5193';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: false,
 ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: process.platform === 'linux' ? ['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface','--use-vulkan=native'] : [] });
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], uploads = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('request', r => { if (r.method() !== 'GET') uploads.push(r.url()); });
 await page.goto(base + '/create'); await page.getByRole('button', { name: 'EN', exact: true }).click();
 const adapter = await page.evaluate(async () => { const a = await navigator.gpu.requestAdapter({powerPreference:'high-performance'}); return a ? { vendor:a.info.vendor, architecture:a.info.architecture } : null; });
 assert.ok(adapter && adapter.architecture !== 'swiftshader', 'Real hardware WebGPU is required');
 await page.getByRole('button', { name:'Download model', exact:true }).click();
 await page.getByText('Saved ·').waitFor({ timeout: 120000 });
 await mkdir('output/webgpu-browser', { recursive: true });
 await page.screenshot({ path:'output/webgpu-browser/cache-ready.png', fullPage:true });
 await page.locator('#creator-title').fill('Original WebGPU practice');
 assert.ok(process.env.DROP_TEST_AUDIO, 'Set DROP_TEST_AUDIO to an original/authorized local audio fixture');
 await page.locator('#creator-audio').setInputFiles(process.env.DROP_TEST_AUDIO);
 const started = Date.now();
 await page.locator('.generate-button').click();
 await page.getByText('AI chart · Choose Easy or Hard.', {exact:true}).waitFor({timeout:300000});
 const elapsedMs = Date.now() - started;
 const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
 const easy = await state(); assert.ok(easy.notes.length);
 await page.locator('#play-button').click(); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).timeMs > 300);
 await page.keyboard.press('Space'); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'paused');
 await page.getByRole('button', {name:'Hard',exact:true}).click();
 const hard = await state(); assert.ok(hard.notes.length); assert.match(hard.chartId, /hard$/);
 await page.locator('#play-button').click(); await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).timeMs > 300);
 await page.keyboard.press('Space');
 await page.screenshot({path:'output/webgpu-browser/ai-play.png',fullPage:true});
 assert.deepEqual(uploads, []); assert.deepEqual(errors, []);
 await page.getByRole('button',{name:'Choose another song'}).click();
 await page.getByText('Saved ·').waitFor();
 await page.getByRole('button',{name:'Delete saved model',exact:true}).click();
 await page.getByText('Saved model removed.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(async () => (await caches.keys()).some(k => k.startsWith('drop-model-'))), false);
 const report = {passed:true,adapter,elapsedMs,uploads,errors,easyPreview:easy.notes,hardPreview:hard.notes,cacheDeleted:true};
 await writeFile('output/webgpu-browser/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally { await browser.close(); }
