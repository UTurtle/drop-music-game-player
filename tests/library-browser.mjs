import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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
const base = 'http://127.0.0.1:5194';
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, NODE_ENV: 'production', DROP_PORT: '5194' }, stdio: 'ignore' });
let browser;
try {
  for (let i=0;i<80;i++) { try { if ((await fetch(base+'/api/health')).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless:true });
  const context = await browser.newContext(); const page = await context.newPage();
  const errors=[], posts=[];
  page.on('pageerror', e=>errors.push(e.message)); page.on('request', r=>{if(r.method()==='POST') posts.push(r.url());});
  await page.goto(base+'/create');
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('#creator-title').fill('Local library test');
  await page.locator('#creator-audio').setInputFiles({ name: 'original-practice.wav', mimeType: 'audio/wav', buffer: wav(12) });
  await page.locator('.hard-option input').check();
  await page.locator('.generate-button').click();
  await page.waitForURL('**/create?song=*',{timeout:60000});
  await page.locator('.saved-songs-panel a[aria-current]').waitFor();
  assert.equal(await page.locator('.saved-songs-panel a[aria-current] strong').textContent(), 'Local library test');
  assert.equal(await page.locator('.max-combo').textContent(), '0×');
  await page.reload();
  await page.locator('#play-button').waitFor();
  await page.locator('#play-button').click(); await page.waitForTimeout(650);
  assert.ok((await page.evaluate(()=>JSON.parse(window.render_game_to_text()))).timeMs > 0);
  await page.locator('.difficulty-switch button').filter({hasText:'Hard'}).click();
  await page.locator('#play-button').waitFor();
  await page.goto(base+'/library');
  assert.equal(await page.locator('.library-list li').count(),1);
  await mkdir('output/library-browser',{recursive:true});
  await page.screenshot({path:'output/library-browser/library.png',fullPage:true});
  await page.reload(); assert.equal(await page.locator('.library-list li').count(),1);
  await page.getByRole('link',{name:'Play',exact:true}).click();
  await page.locator('#play-button').waitFor();
  await page.goto(base+'/library');
  await page.getByRole('button',{name:'Local library test Delete',exact:true}).click();
  await page.getByText('No saved music yet.').waitFor();
  await page.reload(); await page.getByText('No saved music yet.').waitFor();
  const counts=await page.evaluate(()=>new Promise((resolve,reject)=>{ const r=indexedDB.open('drop-local-library'); r.onsuccess=()=>{const db=r.result,tx=db.transaction(['songs','audio']);const s=tx.objectStore('songs').count(),a=tx.objectStore('audio').count();tx.oncomplete=()=>{resolve([s.result,a.result]);db.close();};};r.onerror=()=>reject(r.error);}));
  assert.deepEqual(counts,[0,0]); assert.deepEqual(posts,[]); assert.deepEqual(errors,[]);
  const failurePage = await context.newPage();
  await failurePage.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'audio') throw new DOMException('Full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await failurePage.goto(base+'/create');
  await failurePage.locator('#creator-title').fill('Storage full test');
  await failurePage.locator('#creator-audio').setInputFiles({ name: 'original-practice.wav', mimeType: 'audio/wav', buffer: wav(12) });
  await failurePage.locator('.generate-button').click();
  await failurePage.getByRole('button',{name:'Retry saving'}).waitFor();
  await failurePage.locator('#play-button').click();
  await failurePage.waitForTimeout(650);
  assert.ok((await failurePage.evaluate(()=>JSON.parse(window.render_game_to_text()))).timeMs > 0);
  await page.reload(); await page.getByText('No saved music yet.').waitFor();
  console.log('PASS: quota failure rolls back both stores and leaves playback available; auto-save, reload, audio playback, both difficulties, library reload, atomic audio/chart deletion, no upload.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
