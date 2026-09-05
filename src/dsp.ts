import { t } from './i18n';
import type { Difficulty, Note, Lane } from './chart';

export const SAMPLE_RATE = 22_050;
export const HOP = 220;
export const FFT_SIZE = 1024;
export const BROWSER_GENERATOR = 'browser-flux-phrases-v2';
export const DENSITY = { easy: { gap: 300, perSecond: 3 }, hard: { gap: 140, perSecond: 6 } };
export interface Analysis { durationMs: number; tempoBpm: number; easy: Note[]; hard: Note[] }

/** In-place radix-2 FFT, used only on the selected local file's PCM. */
export function fft(real: Float64Array, imaginary: Float64Array) {
  const length = real.length;
  if (length < 2 || (length & (length - 1)) || imaginary.length !== length) throw new Error('Invalid FFT length');
  for (let i = 1, j = 0; i < length; i++) {
    let bit = length >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]]; }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = -2 * Math.PI / size;
    const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += size) {
      let wr = 1, wi = 0;
      for (let i = 0; i < size / 2; i++) {
        const even = start + i, odd = even + size / 2;
        const tr = wr * real[odd] - wi * imaginary[odd];
        const ti = wr * imaginary[odd] + wi * real[odd];
        real[odd] = real[even] - tr; imaginary[odd] = imaginary[even] - ti;
        real[even] += tr; imaginary[even] += ti;
        const next = wr * stepReal - wi * stepImaginary;
        wi = wr * stepImaginary + wi * stepReal; wr = next;
      }
    }
  }
}

function lowerBound(values: number[], value: number) {
  let low = 0, high = values.length;
  while (low < high) { const mid = (low + high) >>> 1; if (values[mid] < value) low = mid + 1; else high = mid; }
  return low;
}
export interface Candidate { timeMs: number; score: number; salience?: number; brightness?: number }

/** Map existing onsets, never insert arbitrary notes between audible events. */
export function assignLanes(events: Candidate[], difficulty: Difficulty, beatMs = 500): Note[] {
  if (!events.length) return [];
  const tones = events.flatMap(event => event.brightness === undefined ? [] : [event.brightness]).sort((a, b) => a - b);
  const quantile = (p: number) => tones[Math.floor((tones.length - 1) * p)] ?? 0;
  const toneContrast = quantile(.9) - quantile(.1) > .05;
  const toneSplit = (quantile(.9) + quantile(.1)) / 2;
  const motifs: Lane[][] = difficulty === 'easy'
    ? [['A', 'A', 'D', 'D'], ['A', 'D', 'D', 'A']]
    : [['A', 'A', 'D', 'A', 'D', 'D', 'A', 'D'], ['A', 'D', 'D', 'D', 'A', 'A', 'D', 'A']];
  const result: Note[] = [];
  let phrase = -1, inPhrase = 0, repeat = 0;
  const maxRepeat = difficulty === 'easy' ? 2 : 3;
  const average = events.reduce((sum, event) => sum + (event.salience ?? event.score), 0) / events.length;
  events.forEach((event, index) => {
    const bar = Math.floor(event.timeMs / Math.max(250, beatMs) / 4);
    const gap = index ? event.timeMs - events[index - 1].timeMs : Infinity;
    if (bar !== phrase || gap > beatMs * 1.6) { phrase = bar; inPhrase = 0; }
    const strength = event.salience ?? event.score;
    const motif = motifs[strength > average * 1.15 ? 1 : 0];
    let lane: Lane = toneContrast && event.brightness !== undefined
      ? event.brightness <= toneSplit ? 'A' : 'D'
      : motif[inPhrase % motif.length];
    // A clearly accented phrase opening anchors the phrase on the first lane.
    if (!toneContrast && inPhrase === 0 && strength > average * 1.25) lane = 'A';
    const last = result[index - 1]?.lane;
    if (lane === last && (repeat >= maxRepeat || gap < 200)) lane = lane === 'A' ? 'D' : 'A';
    repeat = lane === last ? repeat + 1 : 1;
    result.push({ timeMs: event.timeMs, lane }); inPhrase++;
  });
  return result;
}

export function thin(candidates: Candidate[], difficulty: Difficulty, beatMs = 500): Note[] {
  const limits = DENSITY[difficulty];
  const selected: number[] = [];
  for (const { timeMs } of [...candidates].sort((a, b) => b.score - a.score || a.timeMs - b.timeMs)) {
    const pos = lowerBound(selected, timeMs);
    if ((pos && timeMs - selected[pos - 1] < limits.gap) || (pos < selected.length && selected[pos] - timeMs < limits.gap)) continue;
    const nearby = [...selected.slice(Math.max(0, pos - limits.perSecond), pos), timeMs, ...selected.slice(pos, pos + limits.perSecond)];
    if (nearby.some((t, i) => i + limits.perSecond < nearby.length && nearby[i + limits.perSecond] - t < 1000)) continue;
    // Local working array, kept ordered for bounded neighbor checks.
    selected.splice(pos, 0, timeMs);
  }
  const byTime = new Map(candidates.map(event => [event.timeMs, event]));
  return assignLanes(selected.map(timeMs => byTime.get(timeMs)!), difficulty, beatMs);
}

export function analyzePcm(audio: Float32Array, sampleRate: number, progress: (percent: number) => void = () => {}): Analysis {
  if (sampleRate !== SAMPLE_RATE || audio.length < sampleRate || audio.length > sampleRate * 600) throw new Error(t("1초~10분 길이의 음원을 선택해 주세요."));
  let peak = 0;
  for (const value of audio) { if (!Number.isFinite(value)) throw new Error(t("음원에 잘못된 샘플이 있습니다.")); peak = Math.max(peak, Math.abs(value)); }
  if (peak < 0.00001) throw new Error(t("무음 파일에서는 채보를 만들 수 없습니다."));
  const count = Math.floor((audio.length - FFT_SIZE) / HOP) + 1;
  const flux = new Float64Array(count), energy = new Float64Array(count), brightness = new Float64Array(count);
  const window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
  const real = new Float64Array(FFT_SIZE), imaginary = new Float64Array(FFT_SIZE), previous = new Float64Array(FFT_SIZE / 2);
  let maxFlux = 0, maxEnergy = 0;
  for (let frame = 0; frame < count; frame++) {
    let sum = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const sample = audio[frame * HOP + i]; sum += sample * sample;
      real[i] = sample * window[i]; imaginary[i] = 0;
    }
    energy[frame] = Math.sqrt(sum / FFT_SIZE); maxEnergy = Math.max(maxEnergy, energy[frame]);
    fft(real, imaginary);
    let strength = 0, weighted = 0;
    for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
      const magnitude = Math.log1p(Math.hypot(real[bin], imaginary[bin]));
      const rise = Math.max(0, magnitude - previous[bin]);
      strength += rise; weighted += rise * bin / (FFT_SIZE / 2); previous[bin] = magnitude;
    }
    brightness[frame] = strength > 0 ? weighted / strength : 0;
    flux[frame] = frame ? strength : 0; maxFlux = Math.max(maxFlux, flux[frame]);
    if (frame % 500 === 0) progress(Math.round(10 + frame / count * 65));
  }
  if (maxFlux <= 1e-8) throw new Error(t("리듬 후보를 찾지 못했습니다. 다른 음원이나 수동 채보를 사용해 주세요."));
  // A tempo/phase heuristic, not a downbeat detector or a trained beat model.
  const minLag = Math.round(60 * sampleRate / (190 * HOP));
  const maxLag = Math.round(60 * sampleRate / (70 * HOP));
  let bestLag = Math.round(60 * sampleRate / (120 * HOP)), bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = lag; i < count; i++) correlation += flux[i] * flux[i - lag];
    correlation /= Math.max(1, count - lag);
    if (correlation > bestScore) { bestScore = correlation; bestLag = lag; }
  }
  const phases = new Float64Array(bestLag);
  for (let i = 0; i < count; i++) phases[i % bestLag] += flux[i];
  let phase = 0;
  for (let i = 1; i < phases.length; i++) if (phases[i] > phases[phase]) phase = i;
  progress(85);
  const durationMs = Math.round(audio.length / sampleRate * 1000);
  const candidates: (Candidate & { salience: number })[] = [];
  for (let i = 2; i < count - 2; i++) {
    if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1] || flux[i] < flux[i - 2] || flux[i] < flux[i + 2]) continue;
    if (energy[i] < maxEnergy * .035) continue;
    const timeMs = Math.round((i * HOP + FFT_SIZE / 2) / sampleRate * 1000);
    if (timeMs < 500 || timeMs > durationMs - 150) continue;
    const salience = flux[i] / maxFlux;
    let localMean = 0;
    const left = Math.max(0, i - 25), right = Math.min(count, i + 26);
    for (let j = left; j < right; j++) localMean += flux[j];
    if (flux[i] < localMean / (right - left) * 1.3) continue;
    const delta = ((i - phase) % bestLag + bestLag) % bestLag;
    const nearBeat = Math.min(delta, bestLag - delta) * HOP / sampleRate < .08;
    candidates.push({ timeMs, salience, brightness: brightness[i], score: salience + (nearBeat ? .35 : 0) });
  }
  const easy = thin(candidates.filter(event => event.salience >= .12), 'easy', bestLag * HOP / sampleRate * 1000);
  const hard = thin(candidates.filter(event => event.salience >= .045), 'hard', bestLag * HOP / sampleRate * 1000);
  if (!easy.length || !hard.length) throw new Error(t("충분한 리듬 후보를 찾지 못했습니다. 다른 음원을 선택해 주세요."));
  progress(100);
  return { durationMs, tempoBpm: Math.round(60 * sampleRate / (bestLag * HOP)), easy, hard };
}
