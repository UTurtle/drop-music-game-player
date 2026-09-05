import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChart, practiceChart } from '../src/chart';
import { normalFromChart, limitNormalNotes, modelRatings, parseSongCharts, withNormal } from '../src/difficulties';
import { createSongPackage, readSongPackage } from '../src/songPackage';
import { createLibraryPackage, readLibraryPackage } from '../src/libraryPackage';

test('Normal is a real intermediate chart and preserves source onset positions', () => {
  const hard = practiceChart('hard');
  const normal = normalFromChart(hard);
  assert.equal(parseChart(normal).difficulty, 'normal');
  assert.ok(normal.notes.length > practiceChart('easy').notes.length);
  assert.ok(normal.notes.length < hard.notes.length);
  assert.ok(normal.notes.every(n => hard.notes.some(h => h.timeMs === n.timeMs && h.lane === n.lane)));
  assert.deepEqual(normalFromChart(hard), normal);
});
test('Normal limits are measured against retained notes, not discarded neighbors; Hard inference is opt-in', () => {
  const notes = Array.from({ length: 50 }, (_, i) => ({ timeMs: i * 100, lane: 'A' as const }));
  const normal = limitNormalNotes(notes);
  assert.ok(normal.length > 10);
  normal.forEach((note, i) => {
    if (i) assert.ok(note.timeMs - normal[i - 1].timeMs >= 240);
    if (i >= 4) assert.ok(note.timeMs - normal[i - 4].timeMs >= 1000);
  });
  assert.deepEqual(limitNormalNotes([]), []);
  assert.deepEqual(modelRatings(false), [1.8, 2.6]);
  assert.deepEqual(modelRatings(true), [1.8, 2.6, 3.5]);
});
test('Song chart validation rejects mixed metadata and handles legacy and complete charts', () => {
  const easy = practiceChart('easy'), hard = practiceChart('hard'), normal = practiceChart('normal');
  assert.throws(() => parseSongCharts({ easy }));
  assert.throws(() => parseSongCharts({ easy: hard, hard }));
  assert.throws(() => parseSongCharts({ easy: { ...easy, durationMs: 600001 }, hard }));
  assert.throws(() => parseSongCharts({ easy, normal: { ...normal, difficulty: 'hard' } }));
  assert.throws(() => parseSongCharts({ easy, hard: { ...hard, durationMs: 25000 } }));
  assert.throws(() => parseSongCharts({ easy, hard: { ...hard, videoId: '' } }));
  assert.deepEqual(parseSongCharts({ easy, normal, hard }), { easy, normal, hard });
  assert.deepEqual(withNormal({ easy, normal }), { easy, normal });
  assert.ok(withNormal({ easy }).normal);
  assert.ok(withNormal({ easy, hard }).normal);
});
test('Normal-only extra difficulty roundtrips without requiring Hard', async () => {
  const charts = { easy: practiceChart('easy'), normal: practiceChart('normal') };
  const audio = new Blob([new TextEncoder().encode('RIFF0000WAVE'), new Uint8Array(32)]);
  const file = await createSongPackage(charts);
  assert.deepEqual((await readSongPackage(file)).charts, charts);
  const batch = await createLibraryPackage([file, file]);
  const entries = await readLibraryPackage(batch);
  assert.equal(entries.length, 2);
  assert.deepEqual((await readSongPackage(entries[1])).charts, charts);
  await assert.rejects(() => readLibraryPackage(batch.slice(0, batch.size - 1)));
  await assert.rejects(() => readLibraryPackage(new Blob(['bad'])));
  await assert.rejects(() => createLibraryPackage([]));
  await assert.rejects(() => createLibraryPackage(Array(101).fill(file)));
});
