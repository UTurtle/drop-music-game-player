import { useCallback, useEffect, useState } from 'react';
import { chartRequests, listCharts, publishedLabel, type RequestState } from './api';
import { playPath, type CatalogEntry } from './chart';

export function ChartList({ entries }: { entries: CatalogEntry[] }) {
  return <div className="chart-list">{entries.map(entry => <a key={`${entry.chartId}-${entry.revision}`} href={playPath(entry)}>
    <span><strong>{entry.title}</strong><small>{entry.difficulty.toUpperCase()} · r{entry.revision}{entry.provenance ? ` · ${entry.provenance === 'algorithmic' ? '자동 생성' : 'Community'}` : ''}{entry.publishedAt ? ` · ${publishedLabel(entry.publishedAt)}` : ''}</small></span><span>PLAY ↗</span>
  </a>)}</div>;
}
export function ChartResults({ videoId }: { videoId: string }) {
  const [charts, setCharts] = useState<CatalogEntry[] | null>(null);
  const [requests, setRequests] = useState<RequestState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [nextCharts, nextRequests] = await Promise.all([listCharts(videoId, signal), chartRequests(videoId, 'GET', signal)]);
      if (!signal?.aborted) { setCharts(nextCharts); setRequests(nextRequests); setError(''); }
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : '조회하지 못했습니다.'); }
  }, [videoId]);
  useEffect(() => {
    const abort = new AbortController();
    void refresh(abort.signal);
    const timer = setInterval(() => { if (!document.hidden) void refresh(abort.signal); }, 15_000);
    const focus = () => { void refresh(abort.signal); };
    window.addEventListener('focus', focus);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  async function requestChart() {
    setBusy(true); setError('');
    try { setRequests(await chartRequests(videoId, requests?.requested ? 'DELETE' : 'POST')); }
    catch (error) { setError(error instanceof Error ? error.message : '요청하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <section className="search-results" aria-live="polite">
    {error ? <div className="error" role="alert">{error} <button className="quiet" onClick={() => { void refresh(); }}>다시 조회</button></div> : charts === null ? <p role="status">이 영상의 채보를 찾는 중…</p> : charts.length ? <>
      <span className="eyebrow">✓ CHART AVAILABLE</span><ChartList entries={charts} />
      <div className="request-meta"><span>이 영상의 맵 요청 {requests?.count ?? 0}개</span><a href={`/create?v=${videoId}`}>다른 채보 만들기 ↗</a></div>
    </> : <div className="empty-state"><div><span className="eyebrow">THIS SONG IS WAITING FOR ITS FIRST CHART</span><h2>No chart yet.</h2><p>음악 파일이 있다면 나만 플레이할 수 있어요. 공개 게시는 현재 제공하지 않습니다.</p>
      <strong className="request-count">{requests?.count ?? 0}<span>개의 맵 요청</span></strong><p className="request-note">익명 브라우저 기준 · 같은 브라우저의 중복 요청 제외</p>
    </div><div className="empty-actions"><button className="primary" disabled={busy || !requests} onClick={requestChart}>{busy ? '저장 중…' : requests?.requested ? '✓ 요청됨 · 취소' : '맵 요청하기'}</button><span>음악 파일이 있나요?</span><a className="secondary" href={`/create?v=${videoId}`}>직접 만들기 ↗</a><button className="quiet" onClick={() => { void refresh(); }}>새 채보 확인 ↻</button></div></div>}
  </section>;
}
