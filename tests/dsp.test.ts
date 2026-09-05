import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePcm, DENSITY, fft, SAMPLE_RATE, thin } from '../src/dsp';

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
