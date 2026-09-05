import { t } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseYouTubeUrl, videoPattern, type Chart, type Difficulty } from './chart';
import { BROWSER_GENERATOR, type Analysis } from './dsp';
import { analyzeLocalFile } from './localAudio';
import { Player } from './Player';

export function Creator() {
  const initialId = new URLSearchParams(location.search).get('v');
  const [url, setUrl] = useState(initialId && videoPattern.test(initialId) ? `https://www.youtube.com/watch?v=${initialId}` : '');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [useVideo, setUseVideo] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [identity, setIdentity] = useState({ videoId: '', title: '', id: '' });
  const [notice, setNotice] = useState('');
  const drafts = useRef<Partial<Record<Difficulty, Chart>>>({});
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const chart = useMemo<Chart | null>(() => analysis ? drafts.current[difficulty] ?? {
    schemaVersion: 1, chartId: `${identity.id}-${difficulty}`, revision: 1, videoId: identity.videoId,
    title: identity.title, difficulty, provenance: 'algorithmic', quality: 'instant', offsetMs: 0,
    durationMs: analysis.durationMs, notes: analysis[difficulty], generator: BROWSER_GENERATOR,
  } : null, [analysis, difficulty, identity]);

  const playbackChart = useMemo(() => chart && !useVideo ? { ...chart, offsetMs: 0 } : chart, [chart, useVideo]);

  async function generate() {
    const videoId = parseYouTubeUrl(url);
    if (!title.trim() || !file) { setError(t("곡 제목과 음악 파일을 선택해 주세요.")); return; }
    if (url.trim() && !videoId) { setError(t("이 영상 링크는 아직 지원하지 않습니다. 링크를 비우면 음악 파일만으로 플레이할 수 있어요. 현재 영상 재생은 YouTube 링크를 지원합니다.")); return; }
    const abort = new AbortController(); controller.current = abort;
    setWorking(true); setError(''); setProgress(0); setNotice('');
    try {
      const result = await analyzeLocalFile(file, abort.signal, value => { if (!abort.signal.aborted) setProgress(value); });
      if (abort.signal.aborted) return;
      setIdentity({ videoId: videoId ?? '', title: title.trim(), id: `auto-${crypto.randomUUID()}` });
      drafts.current = {}; setDifficulty('easy'); setAnalysis(result);
      setUseVideo(Boolean(videoId));
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? t(error.message) : t("분석하지 못했습니다.")); }
    finally { if (controller.current === abort) { setWorking(false); controller.current = null; } }
  }
  function cancel() { controller.current?.abort(); setWorking(false); setNotice(t("분석을 취소했습니다. 파일은 업로드되지 않았습니다.")); }
  return <>
    <div className="back-row"><a href={identity.videoId ? `/?v=${identity.videoId}` : '/'}>{t("← 곡 찾기로")}</a></div>
    {!analysis ? <section className="creator-studio"><div className="creator-intro"><h1>{t("내 음악으로")}<br /><em>{t("바로 플레이.")}</em></h1><p>{t("좋아하는 노래도, 직접 만든 노래도.")}<br />{t("음악 파일을 고르면 게임이 됩니다.")}</p><div className="creator-steps"><span>{t("01 파일 선택")}</span><span>{t("02 난이도 선택")}</span><span>03 PLAY</span></div></div>
      <form className="creator-form" onSubmit={event => { event.preventDefault(); void generate(); }}>
        <label htmlFor="creator-url">{t("노래가 있는 영상 링크 (선택)")}</label><input id="creator-url" type="url" value={url} disabled={working} placeholder={t("영상이 있다면 링크를 붙여넣으세요")} onChange={event => setUrl(event.target.value)} />
        <label htmlFor="creator-title">{t("곡 제목")}</label><input id="creator-title" required maxLength={200} value={title} disabled={working} placeholder={t("아티스트 — 곡 제목")} onChange={event => setTitle(event.target.value)} />
        <label htmlFor="creator-audio">{t("음악 파일 선택")}</label><div className="audio-picker"><span className="audio-icon" aria-hidden="true">↥</span><strong>{file ? file.name : t("음악 파일을 선택하세요")}</strong><span>{t("WAV / MP3 / FLAC · 최대 50 MB, 10분")}</span><input id="creator-audio" type="file" accept=".wav,.mp3,.flac,audio/wav,audio/mpeg,audio/flac" disabled={working} required onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setNotice(''); }} /></div>
        <button className="primary generate-button" disabled={working || !file} type="submit">{working ? `${t('분석 중', 'Analyzing')} · ${progress}%` : t("만들고 플레이 →")}</button>
        {working && <><progress className="analysis-progress" max={100} value={progress} aria-label={t("로컬 음원 분석 진행률")} /><button type="button" className="quiet" onClick={cancel}>{t("분석 취소")}</button><p className="input-note" role="status">{t("브라우저 안에서 리듬을 찾고 있습니다. 파일은 전송하지 않습니다.")}</p></>}
        <p className="input-note">{t("기본은 나만 플레이입니다. 파일은 업로드되지 않으며, 페이지를 닫으면 작업이 사라집니다.")}</p>
        {error && <div className="error" role="alert">{error}</div>}
      </form></section> : <>
      <div className="creator-preview-bar"><div><h2>{t("준비됐어요. 플레이해 보세요.")}</h2><p>{t("Easy 또는 Hard를 골라 시작하세요. 지금은 나만 볼 수 있습니다.")}</p></div><div className="difficulty-switch"><button aria-pressed={difficulty === 'easy'} onClick={() => setDifficulty('easy')}>Easy</button><button aria-pressed={difficulty === 'hard'} onClick={() => setDifficulty('hard')}>Hard</button></div></div>
      <div className="private-play-options">
        <p>{t("음악 파일과 비공개 작업은 이 페이지에서만 유지됩니다. 새로고침하거나 페이지를 닫으면 다시 파일을 선택해 주세요.")}</p>
        {identity.videoId && <label className="check"><input type="checkbox" checked={useVideo} onChange={event => setUseVideo(event.target.checked)} />{t("음악 파일 대신 연결한 영상으로 플레이")}</label>}

        {!identity.videoId && <p>{t("영상 없이도 플레이할 수 있어요. 공개 공유는 현재 제공하지 않습니다.")}</p>}
      </div>
      {playbackChart && <Player key={`${playbackChart.chartId}-${playbackChart.revision}-${useVideo}`} chart={playbackChart} audioFile={!useVideo && file ? file : undefined} imported onDraftChange={next => { drafts.current[next.difficulty] = next; }} />}
      <button className="quiet" onClick={() => { setAnalysis(null); setNotice(''); setUseVideo(false); }}>{t("다른 음원으로 새 채보 만들기")}</button>
    </>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </>;
}
