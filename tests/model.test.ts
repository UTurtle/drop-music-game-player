import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { taikoNotes } from '../server/taiko';
import { allowedModelRequest } from '../server/model';

test('taiko adapter preserves don/kat timing; omits unsupported rolls and deduplicates', () => {
  const chart = 'Mode: 1\n[HitObjects]\n256,192,1000,1,0\n256,192,1200,1,2\n256,192,1400,5,4\n256,192,1600,1,8\n256,192,1800,2,0\n256,192,1600,1,0';
  assert.deepEqual(taikoNotes(chart, 3000), [{timeMs:1000,lane:'A'}, {timeMs:1200,lane:'D'}, {timeMs:1400,lane:'A'}, {timeMs:1600,lane:'D'}]);
  assert.throws(() => taikoNotes(chart.replace('Mode: 1', 'Mode: 3'), 3000));
  assert.throws(() => taikoNotes('Mode: 1\n[HitObjects]\n0,0,NaN,1,0', 3000));
});
test('local GPU route rejects cross-origin sites, misleading hosts and forwarded tunnel traffic by default', () => {
  const request = (headers: Record<string,string | undefined>) => ({ headers, socket: {remoteAddress:'127.0.0.1'} } as unknown as IncomingMessage);
  assert.equal(allowedModelRequest(request({host:'127.0.0.1:51100',origin:'http://127.0.0.1:51100'})),true);
  assert.equal(allowedModelRequest({headers:{host:'localhost:51100'},socket:{remoteAddress:'192.168.1.4'}} as unknown as IncomingMessage),false);
  for (const headers of [
    {host:'localhost.evil.test',origin:'http://localhost.evil.test'},
    {host:'127.0.0.1:51100',origin:'https://evil.test'},
    {host:'localhost:51100','x-forwarded-for':'1.2.3.4'},
    {host:'public.example.com'}
  ]) assert.equal(allowedModelRequest(request(headers as Record<string,string | undefined>)),false);
});

test('remote GPU needs a valid revocable device key, not just the demo origin', async () => {
  const {mkdtemp, mkdir, writeFile, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {createHash} = await import('node:crypto');
  const folder = await mkdtemp(join(tmpdir(),'drop-device-test-'));
  const cwd=process.cwd(), previous=process.env.DROP_MODEL_REMOTE_ORIGIN;
  const key='b'.repeat(64);
  try {
    process.chdir(folder); process.env.DROP_MODEL_REMOTE_ORIGIN='https://demo.example';
    await mkdir('.runtime');
    const request = (key?:string) => ({headers:{host:'demo.example',origin:'https://demo.example','x-drop-device-key':key},socket:{remoteAddress:'127.0.0.1'}} as unknown as IncomingMessage);
    assert.equal(allowedModelRequest(request()),false);
    await writeFile('.runtime/devices.json',JSON.stringify([{label:'test',hash:createHash('sha256').update(key).digest('hex')}]));
    assert.equal(allowedModelRequest(request(key)),true);
    assert.equal(allowedModelRequest(request('c'.repeat(64))),false);
    await writeFile('.runtime/devices.json','[]');
    assert.equal(allowedModelRequest(request(key)),false);
  } finally {
    process.chdir(cwd); if(previous===undefined)delete process.env.DROP_MODEL_REMOTE_ORIGIN;else process.env.DROP_MODEL_REMOTE_ORIGIN=previous;
    await rm(folder,{recursive:true,force:true});
  }
});
