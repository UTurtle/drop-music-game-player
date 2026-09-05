import { parseChart, type Chart, type Difficulty } from './chart';

export type SongCharts = { easy: Chart; normal?: Chart; hard?: Chart };
export const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];
export const difficultyLabel = (level: Difficulty) => level[0].toUpperCase() + level.slice(1);
export const modelRatings = (includeHard: boolean) => includeHard ? [1.8, 2.6, 3.5] : [1.8, 2.6];

export function limitNormalNotes(source: Chart['notes']): Chart['notes'] {
  const notes: Chart['notes'] = [];
  for (const note of source) {
    if (notes.length && note.timeMs - notes[notes.length - 1].timeMs < 240) continue;
    if (notes.length >= 4 && note.timeMs - notes[notes.length - 4].timeMs < 1000) continue;
    notes.push({ ...note });
  }
  return notes;
}

/** Legacy songs retain their original charts/records; Normal only removes existing onsets. */
export function normalFromChart(source: Chart): Chart {
  const kept = source.notes.filter((note, index, notes) => {
    // A predictable phrase-level rest every fourth onset, plus a 240 ms speed limit below.
    return index % 4 !== 3 || index === notes.length - 1;
  });
  const notes = limitNormalNotes(kept);
  return { ...source, chartId: `${source.chartId.slice(0, 72)}-normal`, difficulty: 'normal', notes,
    generator: 'normal-onset-reduction-v1' };
}

export function withNormal(charts: SongCharts): SongCharts {
  return charts.normal ? charts : { ...charts, normal: normalFromChart(charts.hard ?? charts.easy) };
}

export function parseSongCharts(value: SongCharts): SongCharts {
  const easy = parseChart(value?.easy);
  if (easy.difficulty !== 'easy' || easy.durationMs > 600_000) throw new Error('Invalid song charts');
  const charts: SongCharts = { easy };
  for (const level of ['normal', 'hard'] as const) {
    if (value[level] === undefined) continue;
    const chart = parseChart(value[level]);
    if (chart.difficulty !== level || chart.durationMs !== easy.durationMs || chart.videoId !== easy.videoId) throw new Error('Invalid song charts');
    charts[level] = chart;
  }
  if (!charts.normal && !charts.hard) throw new Error('Missing song difficulty');
  return charts;
}
