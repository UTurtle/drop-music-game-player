import type { Chart, Lane } from './chart';
export type Status = 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
export type Verdict = 'PERFECT' | 'GOOD' | 'OK' | 'MISS' | 'EMPTY' | '';
export interface Judgment { id: number; lane: Lane; verdict: Exclude<Verdict, ''>; timeMs: number }
export interface Snapshot {
  status: Status; timeMs: number; score: number; combo: number; maxCombo: number;
  hits: number; misses: number; emptyHits: number; verdict: Verdict; practice: boolean; judged: ReadonlySet<number>;
  feedback: Judgment[];
}
export const HIT_WINDOW_MS = 140;
export const EMPTY_HIT_PENALTY = 1000;
export class GameEngine {
  private state: Snapshot;
  private feedbackId = 0;
  constructor(readonly chart: Chart) { this.state = this.initial(); }
  private initial(): Snapshot {
    return { status: 'ready', timeMs: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, emptyHits: 0, verdict: '', practice: false, judged: new Set(), feedback: [] };
  }
  get snapshot() { return this.state; }
  private feedback(lane: Lane, verdict: Judgment['verdict'], timeMs = this.state.timeMs) {
    const event = { id: ++this.feedbackId, lane, verdict, timeMs };
    this.state = { ...this.state, feedback: [...this.state.feedback.slice(-11), event] };
  }
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
        this.feedback(note.lane, 'MISS', timeMs);
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
    if (closest < 0 || distance > HIT_WINDOW_MS) {
      // Keep negative scores: clamping at zero would make early spam cost-free.
      this.state = { ...this.state, score: this.state.score - EMPTY_HIT_PENALTY,
        combo: 0, emptyHits: this.state.emptyHits + 1, verdict: 'EMPTY' };
      this.feedback(lane, 'EMPTY');
      return;
    }
    const points = distance <= 55 ? 1000 : distance <= 100 ? 700 : 300;
    const combo = this.state.combo + 1;
    this.state = { ...this.state, judged: new Set([...this.state.judged, closest]), score: this.state.score + points,
      combo, maxCombo: Math.max(this.state.maxCombo, combo), hits: this.state.hits + 1,
      verdict: points === 1000 ? 'PERFECT' : points === 700 ? 'GOOD' : 'OK' };
    this.feedback(lane, points === 1000 ? 'PERFECT' : points === 700 ? 'GOOD' : 'OK');
  }
}
