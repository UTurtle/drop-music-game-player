// Read-only embed probe; never extracts audio or claims chart alignment.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const videoId = process.argv[2];
if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) throw new Error('Provide a YouTube video ID.');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
await mkdir('output/youtube', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const failures = [];
  page.on('requestfailed', request => failures.push({ url: request.url().split('?')[0], error: request.failure()?.errorText }));
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:51100');
  await page.evaluate(async videoId => {
    const { createYouTube } = await import('/src/media.ts');
    document.querySelector('#root').style.display = 'none';
    const probe = document.createElement('main');
    probe.innerHTML = '<h1>임베드 재생 점검 · 채보 없음</h1><div id="probe" style="width:960px;height:540px;max-width:100%;background:#111"></div><p id="probe-status">Loading YouTube…</p><button id="probe-play">PLAY VIDEO</button>';
    document.body.append(probe);
    window.__probe = { statuses: [], error: '', ready: false };
    void createYouTube(document.querySelector('#probe'), videoId, status => {
      window.__probe.statuses.push(status); document.querySelector('#probe-status').textContent = status;
    }, error => { window.__probe.error = error; document.querySelector('#probe-status').textContent = error; }, new AbortController().signal)
      .then(media => { window.__probeMedia = media; window.__probe.ready = Boolean(media); })
      .catch(error => { window.__probe.error = error.message; });
    document.querySelector('#probe-play').onclick = () => window.__probeMedia?.play();
  }, videoId);
  await page.waitForFunction(() => window.__probe.ready || window.__probe.error, undefined, { timeout: 22000 }).catch(() => {});
  if (await page.evaluate(() => window.__probe.ready)) {
    await page.locator('#probe-play').click();
    await page.waitForTimeout(7000);
  }
  const report = await page.evaluate(() => ({ ...window.__probe, timeMs: window.__probeMedia?.timeMs() ?? 0 }));
  await page.screenshot({ path: 'output/youtube/embed.png', fullPage: true });
  await writeFile('output/youtube/report.json', JSON.stringify({ videoId, ...report, requestFailures: failures, chartSyncVerified: false }, null, 2));
  console.log(JSON.stringify({ videoId, ...report, failedRequests: failures.length, chartSyncVerified: false }, null, 2));
} finally { await browser.close(); }
