import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceChart } from '../src/chart';
import { GameEngine } from '../src/engine';
import { completedRecord, betterRecord, sameScoringChart } from '../src/songRecords';

const chart = { ...practiceChart('easy'), notes: [{ timeMs: 1000, lane: 'A' as const }, { timeMs: 2000, lane: 'D' as const }] };
function run(firstDelay = 0) {
  const engine = new GameEngine(chart); engine.setStatus('playing');
  engine.update(1000 + firstDelay); engine.hit('A'); engine.update(2000); engine.hit('D');
  engine.setStatus('ended'); return engine;
}
test('PERFECT means all notes perfect, not merely the last verdict', () => {
  assert.equal(completedRecord(chart, run().snapshot, 123)?.perfect, true);
  const good = completedRecord(chart, run(80).snapshot, 123)!;
  assert.equal(good.score, 1700); assert.equal(good.perfect, false);
  assert.equal(good.fullCombo, true);
  assert.equal(good.playedAt, 123);
});
test('partial, sought and empty charts are not records; misses and penalties survive', () => {
  const engine = new GameEngine(chart); engine.setStatus('playing');
  assert.equal(completedRecord(chart, engine.snapshot), null);
  engine.seek(2000); engine.setStatus('ended'); assert.equal(completedRecord(chart, engine.snapshot), null);
  assert.equal(completedRecord({ ...chart, notes: [] }, run().snapshot), null);
  engine.reset(); engine.setStatus('playing'); engine.hit('A'); engine.setStatus('ended');
  const record = completedRecord(chart, engine.snapshot)!;
  assert.equal(record.score, -1000); assert.equal(record.perfect, false); assert.equal(record.misses, 2);
  assert.equal(record.fullCombo, false);
});
test('lower subsequent scores never overwrite a best or erase PERFECT', () => {
  const perfect = completedRecord(chart, run().snapshot)!;
  const good = completedRecord(chart, run(80).snapshot)!;
  assert.deepEqual(betterRecord(perfect, good), perfect);
  assert.deepEqual(betterRecord(good, perfect), perfect);
  assert.deepEqual(betterRecord(undefined, good), good);
  assert.deepEqual(betterRecord(good, { ...good, maxCombo: 5 }), { ...good, maxCombo: 5 });
});
test('offset calibration shares records; changed notes or revisions do not', () => {
  assert.equal(sameScoringChart(chart, { ...chart, offsetMs: 200 }), true);
  for (const change of [{ revision: 2 }, { chartId: 'different' }, { difficulty: 'hard' as const }, { notes: [{ timeMs: 1100, lane: 'A' as const }] }]) {
    assert.equal(sameScoringChart(chart, { ...chart, ...change }), false);
  }
});
