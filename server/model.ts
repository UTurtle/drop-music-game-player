import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { taikoNotes } from './taiko';

const adapter = resolve('integrations/mapper.py');
const python = process.env.DROP_MAPPER_PYTHON;
const repo = process.env.DROP_MAPPER_DIR;
let ready = false;
let busy = false;
type Job = { status: 'running' | 'done' | 'failed'; result?: unknown; cancel: () => void; expires: number };
const jobs = new Map<string, Job>();
const reap = setInterval(() => { for (const [id, job] of jobs) if (job.expires < Date.now()) { job.cancel(); jobs.delete(id); } }, 60000);
reap.unref();

function run(args: string[], signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('Canceled'));
  return new Promise((accept, reject) => {
    const child = spawn(python!, [adapter, ...args], { env: { ...process.env, WANDB_MODE: 'disabled', HF_HUB_DISABLE_TELEMETRY: '1' }, stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32' });
    let output = '';
    child.stdout.on('data', data => { output = (output + data).slice(-8192); });
    const kill = () => {
      if (!child.pid) return;
      try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']); else process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    };
    const timer = setTimeout(kill, args[0] === 'probe' ? 30000 : 15 * 60_000);
    signal?.addEventListener('abort', kill, { once: true });
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', kill); reject(error); });
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', kill); code === 0 && !signal?.aborted ? accept(output) : reject(new Error('Model unavailable')); });
  });
}
if (python && repo) void run(['probe']).then(() => { ready = true; }).catch(() => { ready = false; });

export function allowedModelRequest(request: IncomingMessage): boolean {
  const host = request.headers.host ?? '';
  const origin = request.headers.origin;
  const peer = request.socket?.remoteAddress;
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const local = loopback && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
    && !request.headers['x-forwarded-host'] && !request.headers['x-forwarded-for']
    && (!origin || origin === `http://${host}`);
  if (local) return true;
  const remoteOrigin = process.env.DROP_MODEL_REMOTE_ORIGIN;
  const key = request.headers['x-drop-device-key'];
  if (!remoteOrigin || host !== new URL(remoteOrigin).host || (origin && origin !== remoteOrigin)
      || typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return false;
  try {
    const devices = JSON.parse(readFileSync(resolve('.runtime/devices.json'), 'utf8')) as {hash:string}[];
    const hash = createHash('sha256').update(key).digest('hex');
    return devices.some(device => device.hash === hash);
  } catch { return false; }
}
async function collect(request: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { size += chunk.length; if (size > 50_000_000) throw new Error('Too large'); chunks.push(chunk); }
  if (!size) throw new Error('Empty file');
  return Buffer.concat(chunks);
}
async function findChart(folder: string): Promise<string> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isFile() && entry.name.endsWith('.osu')) return readFile(path, 'utf8');
    if (entry.isDirectory()) { try { return await findChart(path); } catch { /* Search other output directories. */ } }
  }
  throw new Error('No chart');
}
export async function modelRoute(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (!request.url?.startsWith('/api/model')) return false;
  response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
  const send = (code: number, value: unknown) => { response.writeHead(code); response.end(JSON.stringify(value)); };
  const allowed = allowedModelRequest(request);
  for (const [id, job] of jobs) if (job.expires < Date.now()) { job.cancel(); jobs.delete(id); }
  if (request.url === '/api/model' && request.method === 'GET') {
    send(200, { ready: allowed && ready, busy, engine: 'Mapperatorinator-v32', scope: process.env.DROP_MODEL_REMOTE_ORIGIN ? 'authorized-host' : 'local' }); return true;
  }
  if (!allowed || (request.method !== 'GET' && !request.headers.origin)) { send(403, { error: 'Origin denied' }); return true; }
  if (request.url === '/api/model' && request.method === 'POST') {
    if (!ready || busy || jobs.size >= 20) { send(503, { error: 'Model unavailable or busy' }); return true; }
    const extension = request.headers['x-audio-extension'];
    if (!['wav', 'mp3', 'flac'].includes(String(extension)) || request.headers['content-type'] !== 'application/octet-stream') { send(400, { error: 'Invalid audio' }); return true; }
    busy = true;
    let folder = '';
    try {
      const bytes = await collect(request);
      folder = await mkdtemp(join(tmpdir(), 'drop-model-'));
      const source = join(folder, `audio.${extension}`); await writeFile(source, bytes, { mode: 0o600 });
      const controller = new AbortController();
      const id = randomBytes(32).toString('hex');
      const job: Job = { status: 'running', cancel: () => controller.abort(), expires: Date.now() + 20 * 60_000 };
      jobs.set(id, job);
      if (response.destroyed) controller.abort();
      void run(['generate', source, folder], controller.signal).then(async () => {
        const { durationMs } = JSON.parse(await readFile(join(folder, 'duration.json'), 'utf8'));
        if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 600000) throw new Error('Invalid duration');
        const easy = taikoNotes(await findChart(join(folder, 'easy')), durationMs);
        const hard = taikoNotes(await findChart(join(folder, 'hard')), durationMs);
        job.result = { durationMs, tempoBpm: 0, easy, hard, generator: 'mapperatorinator-v32-taiko' };
        job.status = 'done';
      }).catch(() => { job.status = 'failed'; }).finally(async () => { try { await rm(folder, { recursive: true, force: true }); } catch { console.error('Temporary model file cleanup failed'); } finally { busy = false; } });
      send(202, { id });
    } catch { if (folder) await rm(folder, { recursive: true, force: true }); busy = false; send(400, { error: 'Could not read audio' }); }
    return true;
  }
  const id = request.url.split('/')[3];
  const job = id && jobs.get(id);
  if (!job) { send(404, { error: 'Job not found' }); return true; }
  if (request.method === 'DELETE') { job.cancel(); jobs.delete(id); send(200, { canceled: true }); }
  else if (request.method === 'GET') send(200, { status: job.status, result: job.result });
  else send(405, { error: 'Method not allowed' });
  return true;
}
export function stopModels() { clearInterval(reap); for (const job of jobs.values()) job.cancel(); }
