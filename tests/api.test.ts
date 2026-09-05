import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApi } from '../server/api';
import { Store } from '../server/store';
import { practiceChart } from '../src/chart';

test('real HTTP: dedup, cancel, publishing disabled even with consent, origin checks, persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drop-api-'));
  const path = join(dir, 'test.sqlite');
  const store = new Store(path); const server = createServer(createApi(store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const videoId = 'abcdefghijk';
  let cookie = '';
  const request = async (url: string, method = 'GET', body?: unknown, custom: Record<string, string> = {}) => {
    const response = await fetch(origin + url, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...custom }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  try {
    assert.equal((await (await request(`/api/requests/${videoId}`)).json()).count, 0);
    for (let i = 0; i < 3; i++) assert.deepEqual(await (await request(`/api/requests/${videoId}`, 'POST', {})).json(), { count: 1, requested: true });
    assert.equal((await (await request(`/api/requests/${videoId}`, 'DELETE', {})).json()).count, 0);
    await request(`/api/requests/${videoId}`, 'POST', {});
    assert.equal((await request(`/api/requests/${videoId}`, 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
    const chart = { ...practiceChart('easy'), chartId: 'api-fixture', videoId };
    const body = { chart, rightsConfirmed: true, alignmentConfirmed: true };
    for (const payload of [body, { ...body, rightsConfirmed: false }, { ...body, chart: { ...chart, audio: 'forbidden' } }]) {
      assert.equal((await request('/api/charts', 'POST', payload)).status, 403);
    }
    assert.equal((await request('/api/charts', 'POST', body, { 'Content-Type': 'audio/wav' })).status, 403);
    assert.equal((await (await request('/api/charts')).json()).length, 0);
    const restored = new Store(path);
    assert.equal(restored.list(videoId).length, 0); assert.equal(restored.cookieSecret, store.cookieSecret);
    restored.close();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('write API applies rate limits', async () => {
  const store = new Store(':memory:'); const server = createServer(createApi(store, { rateLimit: 1 }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const post = () => fetch(`${origin}/api/requests/abcdefghijk`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await post()).status, 200); assert.equal((await post()).status, 429);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
