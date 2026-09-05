import type { Chart, Difficulty } from './chart';
import type { Snapshot } from './engine';

export interface SongRecord {
  score: number;
  perfect: boolean;
  fullCombo?: boolean;
  maxCombo: number;
  hits: number;
  misses: number;
  emptyHits: number;
  playedAt: number;
}
export type SongRecords = Partial<Record<Difficulty, SongRecord>>;

export function completedRecord(chart: Chart, state: Snapshot, playedAt = Date.now()): SongRecord | null {
  if (state.status !== 'ended' || state.practice || !chart.notes.length) return null;
  return {
    score: state.score,
    fullCombo: state.hits === chart.notes.length && state.misses === 0 && state.emptyHits === 0 && state.maxCombo === chart.notes.length,
    perfect: state.hits === chart.notes.length && state.misses === 0 && state.emptyHits === 0 && state.score === chart.notes.length * 1000,
    maxCombo: state.maxCombo, hits: state.hits,
    // Include any final notes not sampled before the media's ended event.
    misses: chart.notes.length - state.hits, emptyHits: state.emptyHits, playedAt,
  };
}

export function betterRecord(previous: SongRecord | undefined, next: SongRecord): SongRecord {
  if (!previous) return next;
  const best = next.score > previous.score || (next.score === previous.score && next.maxCombo > previous.maxCombo) ? next : previous;
  return { ...best, perfect: previous.perfect || next.perfect, fullCombo: Boolean(previous.fullCombo || next.fullCombo || previous.perfect || next.perfect) };
}

export function sameScoringChart(left: Chart | undefined, right: Chart | undefined): boolean {
  return !!left && !!right && left.chartId === right.chartId && left.revision === right.revision && left.difficulty === right.difficulty &&
    left.notes.length === right.notes.length && left.notes.every((note, i) => note.timeMs === right.notes[i].timeMs && note.lane === right.notes[i].lane);
}
