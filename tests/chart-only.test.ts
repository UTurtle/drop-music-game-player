import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceChart } from '../src/chart';
import { createSongPackage, readSongPackage } from '../src/songPackage';

const charts = { easy: practiceChart('easy'), normal: practiceChart('normal'), hard: practiceChart('hard') };
test('chart-only package allowlists charts, never includes audio, identity or scores', async () => {
  const extra = { ...charts, audio: 'private audio', filename: 'private.wav', records: { score: 1000 } };
  const blob = await createSongPackage(extra);
  const text = await blob.text(), metadata = JSON.parse(text);
  assert.deepEqual(Object.keys(metadata).sort(), ['charts', 'format', 'version']);
  assert.equal(metadata.format, 'drop-chart');
  assert.equal(/private|score|records|audio|filename/.test(text), false);
  assert.deepEqual((await readSongPackage(blob)).charts, charts);
  assert.equal('audio' in await readSongPackage(blob), false);
});
test('reject old audio container, oversized, unknown fields, bad chart and trailing binary', async () => {
  await assert.rejects(() => readSongPackage(new Blob(['DROPSONG', new Uint8Array(40)])));
  await assert.rejects(() => readSongPackage(new Blob(['x'.repeat(4_000_001)])));
  const good = await createSongPackage(charts);
  const metadata = JSON.parse(await good.text());
  for (const value of [{ ...metadata, audio: 'RIFF' }, { ...metadata, version: 999 }, { ...metadata, records: {} }, { ...metadata, charts: { ...charts, audio: 'data' } }, { ...metadata, charts: { ...charts, easy: { ...charts.easy, audio: 'RIFF' } } }]) {
    await assert.rejects(() => readSongPackage(new Blob([JSON.stringify(value)])));
  }
  await assert.rejects(() => readSongPackage(new Blob([good, new Uint8Array([0, 1])])));
  await assert.rejects(() => createSongPackage({ ...charts, hard: { ...charts.hard, difficulty: 'easy' } }));
});
