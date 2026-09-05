import type { Chart, Lane } from './chart';
export type Status = 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
export type Verdict = 'PERFECT' | 'GOOD' | 'OK' | 'MISS' | '';
export interface Snapshot {
  status: Status; timeMs: number; score: number; combo: number; maxCombo: number;
  hits: number; misses: number; verdict: Verdict; practice: boolean; judged: ReadonlySet<number>;
}
export const HIT_WINDOW_MS = 140;
export class GameEngine {
  private state: Snapshot;
  constructor(readonly chart: Chart) { this.state = this.initial(); }
  private initial(): Snapshot {
    return { status: 'ready', timeMs: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, verdict: '', practice: false, judged: new Set() };
  }
  get snapshot() { return this.state; }
  reset() { this.state = this.initial(); }
  setStatus(status: Status) { this.state = { ...this.state, status }; }
  seek(timeMs: number) {
    // Seeking is practice: discard previous score and skip past notes without awarding hits.
    const judged = new Set(this.chart.notes.flatMap((n, i) => n.timeMs + this.chart.offsetMs < timeMs - HIT_WINDOW_MS ? [i] : []));
    this.state = { ...this.initial(), status: this.state.status, timeMs, practice: true, judged };
  }
  update(timeMs: number) {
    if (this.state.status !== 'playing' || !Number.isFinite(timeMs)) return;
    const judged = new Set(this.state.judged);
    let missed = 0;
    this.chart.notes.forEach((note, index) => {
      if (!judged.has(index) && note.timeMs + this.chart.offsetMs < timeMs - HIT_WINDOW_MS) {
        judged.add(index); missed++;
      }
    });
    this.state = { ...this.state, timeMs, judged, misses: this.state.misses + missed,
      ...(missed ? { combo: 0, verdict: 'MISS' as const } : {}) };
  }
  hit(lane: Lane) {
    if (this.state.status !== 'playing') return;
    let closest = -1;
    let distance = HIT_WINDOW_MS + 1;
    this.chart.notes.forEach((note, index) => {
      const delta = Math.abs(note.timeMs + this.chart.offsetMs - this.state.timeMs);
      if (note.lane === lane && !this.state.judged.has(index) && delta < distance) { closest = index; distance = delta; }
    });
    if (closest < 0 || distance > HIT_WINDOW_MS) return;
    const points = distance <= 55 ? 1000 : distance <= 100 ? 700 : 300;
    const combo = this.state.combo + 1;
    this.state = { ...this.state, judged: new Set([...this.state.judged, closest]), score: this.state.score + points,
      combo, maxCombo: Math.max(this.state.maxCombo, combo), hits: this.state.hits + 1,
      verdict: points === 1000 ? 'PERFECT' : points === 700 ? 'GOOD' : 'OK' };
  }
}
