import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceChart } from '../src/chart';
import { GameEngine } from '../src/engine';
import { judgmentStyle } from '../src/judgmentEffects';
test('each hit retains its own judgment before the next render, including empty/miss', () => {
  const chart = { ...practiceChart('easy'), notes: [{ timeMs: 1000, lane: 'A' as const }, { timeMs: 1200, lane: 'D' as const }, { timeMs: 1600, lane: 'A' as const }, { timeMs: 2000, lane: 'D' as const }] };
  const engine = new GameEngine(chart); engine.setStatus('playing');
  engine.update(1000); engine.hit('A'); engine.update(1280); engine.hit('D'); engine.update(1730); engine.hit('A');
  engine.hit('D'); engine.update(2300);
  assert.deepEqual(engine.snapshot.feedback.map(event => event.verdict), ['PERFECT', 'GOOD', 'OK', 'EMPTY', 'MISS']);
  for (let i = 0; i < 40; i++) engine.hit('A');
  assert.ok(engine.snapshot.feedback.length <= 12); engine.reset(); assert.equal(engine.snapshot.feedback.length, 0);
});
test('perfect is strongest; OK has no burst; reduced motion still has judgment text', () => {
  const perfect = judgmentStyle('PERFECT'), good = judgmentStyle('GOOD'), ok = judgmentStyle('OK');
  assert.ok(perfect.particles > good.particles && good.particles > ok.particles);
  assert.equal(ok.rings, 0); assert.equal(ok.particles, 0);
  const reduced = judgmentStyle('PERFECT', true); assert.equal(reduced.particles, 0); assert.equal(reduced.rings, 0); assert.equal(reduced.label, 'PERFECT');
});
