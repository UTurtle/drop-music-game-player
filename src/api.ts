import { MAX_CHART_BYTES, parseCatalog, parseChart, type Chart } from './chart';
export async function apiJson(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...options, credentials: 'same-origin' });
  const body = await response.text();
  if (new TextEncoder().encode(body).length > MAX_CHART_BYTES) throw new Error('응답이 너무 큽니다.');
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  if (!response.ok) throw new Error(typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : '요청을 처리하지 못했습니다.');
  return value;
}
export async function listCharts(videoId?: string, signal?: AbortSignal) {
  return parseCatalog(await apiJson(`/api/charts${videoId ? `?videoId=${encodeURIComponent(videoId)}` : ''}`, { signal }));
}
export async function loadChart(chartId: string, revision: number, signal?: AbortSignal) {
  return parseChart(await apiJson(`/api/charts/${encodeURIComponent(chartId)}/revisions/${revision}`, { signal }));
}
export interface RequestState { count: number; requested: boolean }
export async function chartRequests(videoId: string, method = 'GET', signal?: AbortSignal): Promise<RequestState> {
  const value = await apiJson(`/api/requests/${videoId}`, { method, signal,
    ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
  });
  if (!value || typeof value !== 'object' || !('count' in value) || !Number.isSafeInteger(value.count) || Number(value.count) < 0 || !('requested' in value) || typeof value.requested !== 'boolean') throw new Error('요청 수를 읽을 수 없습니다.');
  return value as RequestState;
}
export interface Published { chartId: string; revision: number; publishedAt: string }
export async function publishChart(chart: Chart): Promise<Published> {
  const value = await apiJson('/api/charts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chart: parseChart(chart), rightsConfirmed: true, alignmentConfirmed: true }),
  });
  if (!value || typeof value !== 'object' || !('chartId' in value) || value.chartId !== chart.chartId || !('revision' in value) || value.revision !== chart.revision || !('publishedAt' in value) || typeof value.publishedAt !== 'string') throw new Error('게시 결과를 확인하지 못했습니다. 같은 채보로 다시 시도해 주세요.');
  return value as Published;
}
export function publishedLabel(date?: string) {
  if (!date) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60_000));
  if (!Number.isFinite(minutes)) return '';
  return minutes < 1 ? '방금 게시' : minutes < 60 ? `${minutes}분 전 게시` : new Date(date).toLocaleDateString('ko-KR');
}
