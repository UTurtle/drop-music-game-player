import { t } from './i18n';
export type Lane = 'A' | 'D';
export type Difficulty = 'easy' | 'hard';
export interface Note { timeMs: number; lane: Lane }
export interface Chart {
  schemaVersion: 1;
  chartId: string;
  revision: number;
  videoId: string;
  title: string;
  difficulty: Difficulty;
  provenance: 'manual' | 'algorithmic';
  quality: 'instant' | 'community';
  offsetMs: number;
  durationMs: number;
  notes: Note[];
  generator?: string;
}
export interface CatalogEntry {
  chartId: string; revision: number; videoId: string; title: string; difficulty: Difficulty;
  publishedAt?: string; provenance?: Chart['provenance']; quality?: Chart['quality'];
}
export const MAX_CHART_BYTES = 2_000_000;
export const videoPattern = /^[A-Za-z0-9_-]{11}$/;
export const chartIdPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function parseChart(value: unknown): Chart {
  if (!record(value) || value.schemaVersion !== 1 ||
      typeof value.chartId !== 'string' || !chartIdPattern.test(value.chartId) ||
      !integer(value.revision, 1, 1_000_000) ||
      typeof value.videoId !== 'string' || (value.videoId !== '' && !videoPattern.test(value.videoId)) ||
      typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 ||
      !['easy', 'hard'].includes(String(value.difficulty)) ||
      !['manual', 'algorithmic'].includes(String(value.provenance)) ||
      !['instant', 'community'].includes(String(value.quality)) ||
      !integer(value.offsetMs, -120_000, 120_000) ||
      !integer(value.durationMs, 1, 900_000) ||
      !Array.isArray(value.notes) || value.notes.length < 1 || value.notes.length > 10_000) {
    throw new Error(t("채보 형식이 올바르지 않습니다. schemaVersion 1 JSON을 확인해 주세요."));
  }
  const duration = value.durationMs;
  const offset = value.offsetMs;
  let previous = -1;
  const notes = value.notes.map((note: unknown): Note => {
    if (!record(note) || !integer(note.timeMs, 0, duration) ||
        note.timeMs <= previous || note.timeMs + offset < 0 ||
        (note.lane !== 'A' && note.lane !== 'D')) {
      throw new Error(t("노트는 시간순이어야 하며, 중복 시각·잘못된 레인·영상 시작 전 노트는 허용하지 않습니다."));
    }
    previous = note.timeMs;
    return { timeMs: note.timeMs, lane: note.lane };
  });
  // Explicit reconstruction keeps audio blobs and local paths out of exported/published JSON.
  return {
    schemaVersion: 1, chartId: value.chartId, revision: value.revision,
    videoId: value.videoId, title: value.title.trim(), difficulty: value.difficulty as Difficulty,
    provenance: value.provenance as Chart['provenance'], quality: value.quality as Chart['quality'],
    offsetMs: offset, durationMs: duration, notes,
    ...(typeof value.generator === 'string' && value.generator.length <= 100 ? { generator: value.generator } : {}),
  };
}
export function parseCatalog(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error(t("채보 목록 형식이 올바르지 않습니다."));
  return value.map(entry => {
    if (!record(entry) || typeof entry.chartId !== 'string' || !chartIdPattern.test(entry.chartId) ||
        !integer(entry.revision, 1, 1_000_000) || typeof entry.videoId !== 'string' || !videoPattern.test(entry.videoId) ||
        typeof entry.title !== 'string' || entry.title.length > 200 || !['easy', 'hard'].includes(String(entry.difficulty))) {
      throw new Error(t("채보 목록에 잘못된 항목이 있습니다."));
    }
    return { chartId: entry.chartId, revision: entry.revision, videoId: entry.videoId, title: entry.title, difficulty: entry.difficulty as Difficulty,
      ...(typeof entry.publishedAt === 'string' && Number.isFinite(Date.parse(entry.publishedAt)) ? { publishedAt: entry.publishedAt } : {}),
      ...(['manual', 'algorithmic'].includes(String(entry.provenance)) ? { provenance: entry.provenance as Chart['provenance'] } : {}),
      ...(['instant', 'community'].includes(String(entry.quality)) ? { quality: entry.quality as Chart['quality'] } : {}),
    };
  });
}
export function parseYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && videoPattern.test(id) ? id : null;
  } catch { return null; }
}
export function chartPath(entry: Pick<CatalogEntry, 'chartId' | 'revision'>) {
  return `/charts/${entry.chartId}/r${entry.revision}.json`;
}
export function playPath(entry: Pick<CatalogEntry, 'chartId' | 'revision'>) {
  return `/play/${entry.chartId}?rev=${entry.revision}`;
}
export async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? t("공개된 채보를 찾을 수 없습니다.") : t("채보를 불러오지 못했습니다. 다시 시도해 주세요."));
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_CHART_BYTES) throw new Error(t("채보 파일이 너무 큽니다."));
  try { return JSON.parse(body); } catch { throw new Error(t("채보 JSON을 읽을 수 없습니다.")); }
}
export function practiceChart(difficulty: Difficulty): Chart {
  const step = difficulty === 'easy' ? 1000 : 500;
  return {
    schemaVersion: 1, chartId: `practice-${difficulty}`, revision: 1, videoId: '00000000000',
    title: 'First contact', difficulty, provenance: 'manual', quality: 'community',
    offsetMs: 0, durationMs: 24_000,
    notes: Array.from({ length: 22_000 / step }, (_, i) => ({ timeMs: 2000 + i * step, lane: i % 2 ? 'D' : 'A' })),
  };
}
