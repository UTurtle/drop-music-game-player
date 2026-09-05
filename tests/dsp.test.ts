import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePcm, assignLanes, repeatedPhrases, DENSITY, fft, SAMPLE_RATE, thin } from '../src/dsp';

test('FFT identifies a known frequency bin with expected amplitude', () => {
  const real = Float64Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 16 * i / 1024));
  const imaginary = new Float64Array(1024); fft(real, imaginary);
  assert.ok(Math.abs(Math.hypot(real[16], imaginary[16]) - 512) < .00001);
  assert.ok(Math.hypot(real[17], imaginary[17]) < .00001);
});
test('browser DSP finds synthetic attacks, excludes silence, preserves input, and repeats exactly', () => {
  const audio = new Float32Array(SAMPLE_RATE * 12);
  for (let start = 1, beat = 0; start < 11; start += .25, beat++) {
    for (let i = 0; i < SAMPLE_RATE * .08; i++) {
      const t = i / SAMPLE_RATE;
      audio[Math.floor(start * SAMPLE_RATE) + i] += (beat % 2 ? .3 : .8) * Math.sin(2 * Math.PI * 700 * t) * Math.exp(-t * 80);
    }
  }
  const original = audio.slice(); const result = analyzePcm(audio, SAMPLE_RATE);
  assert.deepEqual(result, analyzePcm(audio, SAMPLE_RATE)); assert.deepEqual(audio, original);
  assert.ok(result.easy.length > 10); assert.ok(result.hard.length > result.easy.length);
  for (const difficulty of ['easy', 'hard'] as const) {
    const notes = result[difficulty], limits = DENSITY[difficulty];
    assert.ok(notes.some((note, i) => i > 0 && note.lane === notes[i - 1].lane), 'Generated PCM charts need repeated hits, not forced alternation');
    assert.ok(notes.some((note, i) => i > 0 && note.lane !== notes[i - 1].lane));
    for (let i = 0; i < notes.length; i++) {
      assert.ok(notes[i].timeMs >= 950 && notes[i].timeMs < 11050);
      assert.ok(Math.min(notes[i].timeMs % 250, 250 - notes[i].timeMs % 250) <= 60);
      if (i) assert.ok(notes[i].timeMs - notes[i - 1].timeMs >= limits.gap);
      assert.ok(notes.filter(note => note.timeMs >= notes[i].timeMs && note.timeMs < notes[i].timeMs + 1000).length <= limits.perSecond);
    }
  }
});
test('browser DSP rejects silence and corrupt PCM; thinning caps dense sequences', () => {
  assert.throws(() => analyzePcm(new Float32Array(SAMPLE_RATE * 2), SAMPLE_RATE), /무음/);
  const bad = new Float32Array(SAMPLE_RATE * 2); bad[3] = NaN;
  assert.throws(() => analyzePcm(bad, SAMPLE_RATE), /샘플/);
  const candidates = Array.from({ length: 500 }, (_, i) => ({ timeMs: i * 20, score: 1 }));
  assert.deepEqual(thin(candidates, 'hard'), thin(candidates.reverse(), 'hard'));
});

test('phrase mapping has repeat hits and switches, respects hand limits and preserves onset times', () => {
  const events = Array.from({ length: 24 }, (_, i) => ({ timeMs: 1000 + i * 250, score: 1, salience: .8 }));
  for (const level of ['easy', 'hard'] as const) {
    const notes = assignLanes(events, level);
    assert.deepEqual(notes.map(n => n.timeMs), events.map(n => n.timeMs));
    assert.ok(notes.some((n, i) => i && n.lane === notes[i - 1].lane));
    assert.ok(notes.some((n, i) => i && n.lane !== notes[i - 1].lane));
    let run = 1;
    notes.forEach((note, i) => { run = i && note.lane === notes[i - 1].lane ? run + 1 : 1; assert.ok(run <= (level === 'easy' ? 2 : 3)); });
    assert.deepEqual(notes, assignLanes(events, level));
  }
  const tones = events.map((event, i) => ({ ...event, brightness: i % 4 < 2 ? .02 : .4 }));
  const lanes = assignLanes(tones, 'hard').map(n => n.lane);
  assert.deepEqual(lanes.slice(0, 4), ['A', 'A', 'D', 'D']);
  const swapped = assignLanes(tones.map(e => ({ ...e, brightness: .42 - e.brightness })), 'hard');
  assert.deepEqual(swapped.slice(0, 4).map(n => n.lane), ['D', 'D', 'A', 'A']);
  const fast = assignLanes(events.map((e, i) => ({ ...e, timeMs: i * 150 })), 'hard');
  assert.ok(fast.every((note, i) => !i || note.lane !== fast[i - 1].lane));
});

test('recurrence matches repeated rhythm despite gain changes, rejects different rhythm and tone', () => {
  const phrase = [0, 500, 1000, 1750, 2500, 3000, 3500].map((timeMs, i) => ({ timeMs: 1000 + timeMs, score: i % 2 ? .5 : 1, brightness: .2 }));
  const repeat = phrase.map(e => ({ ...e, timeMs: e.timeMs + 8000, score: e.score * .7 }));
  const events = [...phrase, ...repeat];
  assert.equal(repeatedPhrases(events, 500).length, phrase.length);
  const chart = assignLanes(events, 'hard');
  assert.deepEqual(chart.slice(0, phrase.length).map(n => n.lane), chart.slice(phrase.length).map(n => n.lane));
  assert.deepEqual(chart.map(n => n.timeMs), events.map(n => n.timeMs));
  assert.equal(repeatedPhrases([...phrase, ...repeat.map(e => ({ ...e, brightness: .6 }))], 500).length, 0);
  assert.equal(repeatedPhrases([...phrase, ...repeat.map((e, i) => ({ ...e, timeMs: e.timeMs + (i === 2 ? 200 : 0) }))], 500).length, 0);
});
