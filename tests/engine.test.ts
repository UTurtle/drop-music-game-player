import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import { parseChart, parseYouTubeUrl, practiceChart } from '../src/chart';

test('physical lanes, timing windows, repeated hit, missed-note combo reset', () => {
  const engine = new GameEngine(practiceChart('easy'));
  engine.setStatus('playing'); engine.update(2000); engine.hit('D');
  assert.equal(engine.snapshot.score, -1000);
  engine.hit('A'); engine.hit('A');
  assert.equal(engine.snapshot.score, -1000); assert.equal(engine.snapshot.hits, 1);
  assert.equal(engine.snapshot.emptyHits, 2); assert.equal(engine.snapshot.combo, 0);
  engine.update(3075); engine.hit('D'); assert.equal(engine.snapshot.score, -300);
  engine.update(4200); assert.equal(engine.snapshot.misses, 1); assert.equal(engine.snapshot.combo, 0);
});
test('paused and buffering clocks cannot score or accrue misses; resume and restart work', () => {
  const engine = new GameEngine(practiceChart('easy'));
  engine.setStatus('playing'); engine.update(2000);
  for (const status of ['paused', 'buffering'] as const) {
    engine.setStatus(status); engine.update(10_000); engine.hit('A');
    assert.equal(engine.snapshot.timeMs, 2000); assert.equal(engine.snapshot.misses, 0); assert.equal(engine.snapshot.score, 0);
  }
  engine.setStatus('playing'); engine.hit('A'); assert.equal(engine.snapshot.hits, 1);
  engine.reset(); assert.equal(engine.snapshot.score, 0); assert.equal(engine.snapshot.judged.size, 0); assert.equal(engine.snapshot.timeMs, 0);
});
test('positive offset delays notes, seeking clears score and skips without misses', () => {
  const engine = new GameEngine({ ...practiceChart('easy'), offsetMs: 13_214 });
  engine.setStatus('playing'); engine.update(15_214); engine.hit('A'); assert.equal(engine.snapshot.score, 1000);
  engine.seek(20_000); assert.equal(engine.snapshot.score, 0); assert.equal(engine.snapshot.misses, 0); assert.equal(engine.snapshot.practice, true);
  engine.seek(0); assert.equal(engine.snapshot.judged.size, 0);
});
test('host allowlist rejects misleading domains and extracts supported video URLs', () => {
  for (const input of ['https://youtu.be/abcdefghijk?t=12', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk']) assert.equal(parseYouTubeUrl(input), 'abcdefghijk');
  for (const input of ['https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://youtube.com@evil.test/watch?v=abcdefghijk', 'javascript:alert(1)', 'https://youtu.be/short', 'garbage']) assert.equal(parseYouTubeUrl(input), null);
});
test('chart validation rejects unsafe IDs, NaN, duplicates, negative offsets; strips audio fields', () => {
  const chart = practiceChart('hard');
  for (const patch of [{ chartId: '../bad' }, { offsetMs: NaN }, { offsetMs: -3000 }, { revision: 0 }, { notes: [{ timeMs: 1, lane: 'A' }, { timeMs: 1, lane: 'D' }] }]) assert.throws(() => parseChart({ ...chart, ...patch }));
  const parsed = parseChart({ ...chart, audio: 'private payload', localPath: '/private/song.wav' });
  assert.equal('audio' in parsed, false); assert.equal('localPath' in parsed, false);
});

test('mashing both lanes loses points; accurate rapid same-lane hits remain playable', () => {
  const chart = { ...practiceChart('hard'), notes: [
    { timeMs: 1000, lane: 'A' as const }, { timeMs: 1200, lane: 'A' as const },
    { timeMs: 1400, lane: 'A' as const }, { timeMs: 1600, lane: 'D' as const },
  ] };
  const precise = new GameEngine(chart);
  precise.setStatus('playing');
  for (const note of chart.notes) { precise.update(note.timeMs); precise.hit(note.lane); }
  assert.equal(precise.snapshot.score, 4000);
  assert.equal(precise.snapshot.combo, 4);
  assert.equal(precise.snapshot.emptyHits, 0);
  const spam = new GameEngine(chart);
  spam.setStatus('playing');
  for (let time = 800; time <= 1800; time += 50) {
    spam.update(time); spam.hit('A'); spam.hit('D');
  }
  assert.ok(spam.snapshot.score < 0);
  assert.ok(spam.snapshot.emptyHits > spam.snapshot.hits);
  assert.equal(spam.snapshot.combo, 0);
  spam.reset(); assert.equal(spam.snapshot.emptyHits, 0);
});
test('inactive input never incurs penalties or consumes notes', () => {
  const engine = new GameEngine(practiceChart('easy'));
  for (const status of ['ready', 'paused', 'buffering', 'ended', 'error'] as const) {
    engine.setStatus(status); engine.hit('A'); engine.hit('D');
    assert.equal(engine.snapshot.score, 0);
    assert.equal(engine.snapshot.emptyHits, 0);
    assert.equal(engine.snapshot.judged.size, 0);
  }
});
