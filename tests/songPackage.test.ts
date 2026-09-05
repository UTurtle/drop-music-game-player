import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceChart } from '../src/chart';
import { createSongPackage, readSongPackage } from '../src/songPackage';
import { createLibraryPackage, readLibraryPackage } from '../src/libraryPackage';

const charts = { easy: practiceChart('easy'), hard: practiceChart('hard') };
test('chart-only single and collection roundtrip for legacy Easy/Hard metadata', async () => {
  const bundle = await createSongPackage(charts);
  assert.deepEqual((await readSongPackage(bundle)).charts, charts);
  const library = await createLibraryPackage([bundle, bundle]);
  const entries = await readLibraryPackage(library);
  assert.equal(entries.length, 2);
  assert.deepEqual((await readSongPackage(entries[0])).charts, charts);
  await assert.rejects(() => readLibraryPackage(new Blob(['DROPLIB1', new Uint8Array(40)])));
});
test('reject malformed JSON, bad chart, and truncated chart archive', async () => {
  await assert.rejects(() => readSongPackage(new Blob(['not a chart'])));
  const good = await createSongPackage(charts);
  await assert.rejects(() => readSongPackage(good.slice(0, good.size - 1)));
  await assert.rejects(() => createSongPackage({ ...charts, hard: { ...charts.hard, difficulty: 'easy' } }));
  const library = await createLibraryPackage([good]);
  await assert.rejects(() => readLibraryPackage(library.slice(0, library.size - 1)));
});
