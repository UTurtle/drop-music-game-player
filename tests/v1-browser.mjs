import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';

const port = 5191;
const base = `http://127.0.0.1:${port}`;
const temporary = await mkdtemp(join(tmpdir(), 'drop-v1-'));
const output = 'output/v1-browser'; await mkdir(output, { recursive: true });
let server, browser;
const logs = [];
async function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: {
    ...process.env, NODE_ENV: 'production', DROP_PORT: String(port), DROP_HOST: '127.0.0.1',
    DROP_PUBLIC_ORIGIN: base, DROP_DB_PATH: join(temporary, 'test.sqlite'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', value => logs.push(value.toString()));
  server.stdout.on('data', value => logs.push(value.toString()));
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(logs.join(''));
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start');
}
async function stopServer() { if (server && server.exitCode === null) { const exit = once(server, 'exit'); server.kill('SIGTERM'); await exit; } }
function wav(duration = 12, silent = false) {
  const sampleRate = 22050, samples = sampleRate * duration;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  if (!silent) for (let i = 0; i < samples; i++) {
    const time = i / sampleRate;
    const local = (time - 1) % .25;
    const beat = Math.floor((time - 1) / .25);
    const value = time >= 1 && time < duration - 1 && local < .08 ? (beat % 2 ? .3 : .8) * Math.sin(2 * Math.PI * 700 * local) * Math.exp(-local * 80) : 0;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}
const fakeYoutube = `
window.__yt = {time: 0, set(time, status) { this.time=time; this.events.onStateChange({data:status}); }};
window.YT = {Player: class {
  constructor(host, options) { const f=document.createElement('iframe'); f.title='YouTube test double'; host.replaceWith(f); this.f=f; window.__yt.events=options.events; setTimeout(()=>options.events.onReady({target:this}),20); }
  getIframe(){return this.f;} getCurrentTime(){return window.__yt.time;} getDuration(){return 30;}
  playVideo(){window.__yt.set(window.__yt.time,1);} pauseVideo(){window.__yt.set(window.__yt.time,2);}
  seekTo(time){window.__yt.set(time,3);} destroy(){this.f.remove();}
}}; window.onYouTubeIframeAPIReady();`;
const reports = [], pageErrors = [], outboundBodies = [];
try {
  await startServer();
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => { if (request.postDataBuffer()) outboundBodies.push(request.url()); });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.goto(`${base}/create`);
  assert.equal(await page.getByRole('checkbox').count(), 0);
  assert.equal(await page.locator('#creator-url').getAttribute('required'), null);
  await page.locator('#creator-title').fill('My private song');
  await page.locator('#creator-audio').setInputFiles({ name: 'silence.wav', mimeType: 'audio/wav', buffer: wav(2, true) });
  await page.getByRole('button', { name: '만들고 플레이' }).click();
  await page.getByRole('alert').filter({ hasText: '무음' }).waitFor();
  await page.locator('#creator-audio').setInputFiles({ name: 'private.wav', mimeType: 'audio/wav', buffer: wav(4) });
  await page.screenshot({ path: `${output}/creator.png`, fullPage: true });
  await page.getByRole('button', { name: '만들고 플레이' }).click();
  await page.getByRole('heading', { name: '준비됐어요. 플레이해 보세요.' }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'PUBLISH' }).count(), 0);
  await page.locator('#play-button').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).timeMs > 300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'paused');
  await page.waitForTimeout(80);
  const paused = await state(); await page.waitForTimeout(150);
  assert.equal((await state()).timeMs, paused.timeMs);
  await page.getByRole('button', { name: '처음부터' }).click();
  await page.waitForFunction(() => {
    const s = JSON.parse(window.render_game_to_text());
    return s.notes.length && s.timeMs >= s.notes[0].timeMs - 30;
  });
  await page.keyboard.press('z');
  assert.ok((await state()).score > 0);
  await page.screenshot({ path: `${output}/private-play.png`, fullPage: true });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'ended');
  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await page.locator('#play-button').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).timeMs > 200);
  assert.match((await state()).chartId, /hard$/);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('heading', { name: 'Ready. Give it a play.' }).waitFor();
  assert.match((await state()).chartId, /hard$/);
  await page.getByRole('button', { name: 'KO', exact: true }).click();
  assert.equal(outboundBodies.length, 0, 'Private flow must not send audio or charts');
  reports.push('No video or public consent required; silence rejected; actual local audio advances, pauses, restarts, scores Z and ends; Hard plays; no upload requests');
  await page.reload();
  assert.equal(await page.locator('#creator-audio').inputValue(), '');
  assert.equal(await page.locator('#play-button').count(), 0);
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'application/javascript', body: fakeYoutube }));
  await page.locator('#creator-url').fill('https://youtu.be/abcdefghijk');
  await page.locator('#creator-title').fill('Optional video');
  await page.locator('#creator-audio').setInputFiles({ name: 'private.wav', mimeType: 'audio/wav', buffer: wav(4) });
  await page.getByRole('button', { name: '만들고 플레이' }).click();
  await page.getByRole('heading', { name: '준비됐어요. 플레이해 보세요.' }).waitFor();
  await page.getByRole('checkbox', { name: '음악 파일 대신' }).check();
  await page.locator('#play-button').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status === 'playing');
  assert.equal(await page.locator('iframe').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'PUBLISH' }).count(), 0);
  await page.getByRole('checkbox', { name: '음악 파일 대신' }).uncheck();
  await page.locator('#play-button').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).timeMs > 200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/private-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const rejected = await fetch(`${base}/api/charts`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ rightsConfirmed: true, alignmentConfirmed: true }) });
  assert.equal(rejected.status, 403);
  assert.deepEqual(await (await fetch(`${base}/api/charts`)).json(), []);
  reports.push('Reload clears private session; optional video and local playback can switch; mobile fits; public API disabled');
  assert.deepEqual(pageErrors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: reports, pageErrors, audioUploaded: false, publishingEnabled: false }, null, 2));
  console.log(reports.join('\n'));
} finally { await browser?.close(); await stopServer(); await rm(temporary, { recursive: true, force: true }); }
