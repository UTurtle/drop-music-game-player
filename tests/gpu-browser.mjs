// Explicit integration check; requires a ready GPU server and a rights-cleared test file.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5192';
const file = process.env.DROP_TEST_AUDIO;
if (!file) throw new Error('Set DROP_TEST_AUDIO to your test WAV/MP3/FLAC');
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
await mkdir('output/gpu-browser',{recursive:true});
const page = await browser.newPage({viewport:{width:1440,height:900},locale:'ko-KR'});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const started=Date.now();
try {
 await page.goto(`${base}/create`);
 await page.getByText('AI 생성: 파일을 앱 실행 컴퓨터로 전송해 처리하고 임시 파일을 삭제합니다. 공개하거나 학습에 사용하지 않습니다.').waitFor({timeout:45000});
 await page.locator('#creator-title').fill('Original synthetic GPU check');
 await page.locator('#creator-audio').setInputFiles(file);
 await page.getByRole('button',{name:'만들고 플레이'}).click();
 await page.getByText('AI 채보 · Easy 또는 Hard를 골라 시작하세요.').waitFor({timeout:900000});
 await page.locator('#play-button').click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).timeMs>300);
 const easy=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));
 await page.getByRole('button',{name:'Hard',exact:true}).click();
 await page.locator('#play-button').click();
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).timeMs>300);
 const hard=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));
 await page.screenshot({path:'output/gpu-browser/ai-chart.png',fullPage:true});
 assert.deepEqual(errors,[]);
 const report={elapsedMs:Date.now()-started,easy,hard,pageErrors:errors};
 await writeFile('output/gpu-browser/report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:true,elapsedMs:report.elapsedMs}));
} finally {await browser.close();}
