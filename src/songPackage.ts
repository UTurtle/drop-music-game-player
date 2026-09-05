import { t } from './i18n';
import { parseSongCharts, type SongCharts } from './difficulties';

export const MAX_CHART_PACKAGE_BYTES = 4_000_000;
const fail = () => new Error(t('채보 전용 파일이 아니거나 손상된 파일입니다. 음원이 포함된 이전 파일은 지원하지 않습니다.', 'Invalid chart-only file. Older files containing audio are not supported.'));
const chartFields = ['schemaVersion', 'chartId', 'revision', 'videoId', 'title', 'difficulty', 'provenance', 'quality', 'offsetMs', 'durationMs', 'notes', 'generator'];
function onlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
export async function createSongPackage(charts: SongCharts): Promise<Blob> {
  // No audio argument and no read of the audio store: only validated chart fields can leave.
  const safe = parseSongCharts(charts);
  const blob = new Blob([JSON.stringify({ format: 'drop-chart', version: 1, charts: safe })], { type: 'application/json' });
  if (blob.size > MAX_CHART_PACKAGE_BYTES) throw fail();
  return blob;
}
export async function readSongPackage(blob: Blob): Promise<{ charts: SongCharts }> {
  if (!blob.size || blob.size > MAX_CHART_PACKAGE_BYTES) throw fail();
  let value: unknown;
  try { value = JSON.parse(await blob.text()); } catch { throw fail(); }
  if (!onlyKeys(value, ['format', 'version', 'charts']) || value.format !== 'drop-chart' || value.version !== 1 ||
      !onlyKeys(value.charts, ['easy', 'normal', 'hard'])) throw fail();
  for (const chart of Object.values(value.charts)) {
    if (!onlyKeys(chart, chartFields) || !Array.isArray(chart.notes) ||
        !chart.notes.every(note => onlyKeys(note, ['timeMs', 'lane']))) throw fail();
  }
  return { charts: parseSongCharts(value.charts as SongCharts) };
}
