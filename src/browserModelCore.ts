import { fft } from './dsp';
import type { Note } from './chart';

export const MODEL_SAMPLES = 2047 * 128;
export const WINDOW_MS = MODEL_SAMPLES / 16;
export const STRIDE_SAMPLES = Math.floor(MODEL_SAMPLES * .6);
export interface Frontend { mel: [number, number][][]; tokenizer: { event_start: Record<string, number>; event_end: Record<string, number>; event_range: Record<string, { min_value: number }> } }
export interface TokenGroup { timeMs: number; tokens: number[] }

/** Match torchaudio's periodic Hann, centered reflect padding, power mel and log1p. */
export function melSpectrogram(pcm: Float32Array, start: number, bank: Frontend['mel']): Float32Array {
  const result = new Float32Array(128 * 2048), re = new Float64Array(1024), im = new Float64Array(1024), power = new Float64Array(513);
  for (let frame = 0; frame < 2048; frame++) {
    for (let i = 0; i < 1024; i++) {
      let local = frame * 128 + i - 512;
      if (local < 0) local = -local;
      if (local >= MODEL_SAMPLES) local = 2 * MODEL_SAMPLES - local - 2;
      re[i] = (pcm[start + local] ?? 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / 1024));
    }
    im.fill(0); fft(re, im);
    for (let i = 0; i < 513; i++) power[i] = re[i] ** 2 + im[i] ** 2;
    for (let mel = 0; mel < 128; mel++) {
      let sum = 0;
      for (const [bin, weight] of bank[mel]) sum += power[bin] * weight;
      result[mel * 2048 + frame] = Math.log1p(sum);
    }
  }
  return result;
}

export function tokenGroups(tokens: number[], startMs: number): TokenGroup[] {
  const groups: TokenGroup[] = [];
  for (const token of tokens) {
    if (token >= 9 && token < 1647) groups.push({ timeMs: startMs + (token - 9) * 10 + 5, tokens: [token] });
    else if (token >= 1647 && token <= 4096 && groups.length) groups.at(-1)!.tokens.push(token);
  }
  return groups;
}

export function contextTokens(groups: TokenGroup[], startMs: number): number[] {
  return groups.filter(g => g.timeMs >= startMs && g.timeMs < startMs + WINDOW_MS).flatMap(g => [9 + Math.floor((g.timeMs - startMs) / 10), ...g.tokens.slice(1)]);
}

export function groupsToNotes(groups: TokenGroup[], durationMs: number): Note[] {
  return groups.filter(g => g.tokens.includes(4071) && g.timeMs >= 0 && g.timeMs < durationMs)
    .map(g => {
      const sound = g.tokens.find(token => token >= 3897 && token < 3970);
      const flags = sound === undefined ? 0 : ((sound - 3897) % 8) * 2;
      return { timeMs: Math.round(g.timeMs), lane: flags & 10 ? 'D' as const : 'A' as const };
    }).sort((a, b) => a.timeMs - b.timeMs).filter((n, i, notes) => !i || n.timeMs > notes[i - 1].timeMs);
}

export function classTokens(frontend: Frontend, stars: number, durationMs: number, startMs: number): number[] {
  const { event_start: s, event_end: e, event_range: r } = frontend.tokenizer;
  const enc = (name: string, value: number) => s[name] + value - r[name].min_value;
  return [enc('gamemode', 1), enc('difficulty', Math.min(23, Math.floor(stars * 2))), e.mapper - 1, enc('year', 2023),
    enc('hitsounded', 1), enc('song_length', Math.min(60, Math.floor(durationMs / 10000))), e.scroll_speed_ratio - 1, e.descriptor - 1,
    enc('scroll_speed', 100), enc('song_position', startMs <= 0 ? -1 : startMs >= durationMs ? 101 : Math.round(startMs / durationMs * 100))];
}
