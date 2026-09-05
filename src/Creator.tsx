import { t } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseYouTubeUrl, videoPattern, type Chart, type Difficulty } from './chart';
import { BROWSER_GENERATOR, type Analysis } from './dsp';
import { analyzeAutoFile } from './modelAudio';
import { BrowserModelSettings } from './BrowserModelSettings';
import { Player } from './Player';
import { loadSong, saveSong, updateSavedChart, type SavedSong } from './localLibrary';
import { ConnectAudio } from './ConnectAudio';
import { difficulties, difficultyLabel, type SongCharts } from './difficulties';

export function Creator() {
  const initialId = new URLSearchParams(location.search).get('v');
  const [url, setUrl] = useState(initialId && videoPattern.test(initialId) ? `https://www.youtube.com/watch?v=${initialId}` : '');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [useVideo, setUseVideo] = useState(false);
  const [engineMessage, setEngineMessage] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [includeHard, setIncludeHard] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [identity, setIdentity] = useState({ videoId: '', title: '', id: '' });
  const [notice, setNotice] = useState('');
  const [storageMessage, setStorageMessage] = useState('');
  const [loadingSaved, setLoadingSaved] = useState(Boolean(new URLSearchParams(location.search).get('song')));
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingSong, setPendingSong] = useState<SavedSong | null>(null);
  const drafts = useRef<Partial<Record<Difficulty, Chart>>>({});
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const chart = useMemo<Chart | null>(() => analysis ? drafts.current[difficulty] ?? null : null, [analysis, difficulty, identity]);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('song');
    if (!id) return;
    let active = true;
    void loadSong(id).then(({ song, file }) => {
      if (!active) return;
      if (!file) { setPendingSong(song); return; }
      drafts.current = song.charts;
      setIdentity({ id: song.id, title: song.title, videoId: song.charts.easy.videoId });
      setTitle(song.title); setFile(file); setUseVideo(Boolean(song.charts.easy.videoId) && !song.importedCharts);
      setAnalysis({ durationMs: song.charts.easy.durationMs, tempoBpm: 0, easy: song.charts.easy.notes, normal: song.charts.normal?.notes, hard: song.charts.hard?.notes ?? [], generator: song.charts.easy.generator });
      setStorageMessage(t('이 브라우저에 저장된 음악과 채보입니다.', 'Audio and charts saved in this browser.'));
    }).catch(() => { if (active) setError(t('저장된 음악을 열지 못했습니다. 보관함을 확인해 주세요.', 'Could not open saved music. Please check your library.')); })
      .finally(() => { if (active) setLoadingSaved(false); });
    return () => { active = false; };
  }, []);

  async function persist(id: string, audio: File, charts: SongCharts) {
    try {
      await saveSong(id, audio, charts); window.dispatchEvent(new Event('drop-library-updated')); setSaveFailed(false);
      setStorageMessage(t('음악과 생성된 난이도별 채보를 이 브라우저에 저장했습니다.', 'Audio and generated charts saved in this browser.'));
      history.replaceState(null, '', `/create?song=${encodeURIComponent(id)}`);
    } catch {
      setSaveFailed(true);
      setStorageMessage(t('저장하지 못했습니다. 브라우저 저장 공간과 설정을 확인해 주세요. 지금은 플레이할 수 있지만 페이지를 닫으면 사라집니다.', 'Could not save. Check browser storage space and settings. You can play now, but this session will be lost when you close the page.'));
    }
  }

  const playbackChart = useMemo(() => chart && !useVideo ? { ...chart, offsetMs: 0 } : chart, [chart, useVideo]);

  async function generate() {
    const videoId = parseYouTubeUrl(url);
    if (!title.trim() || !file) { setError(t("곡 제목과 음악 파일을 선택해 주세요.")); return; }
    if (url.trim() && !videoId) { setError(t("이 영상 링크는 아직 지원하지 않습니다. 링크를 비우면 음악 파일만으로 플레이할 수 있어요. 현재 영상 재생은 YouTube 링크를 지원합니다.")); return; }
    const abort = new AbortController(); controller.current = abort;
    setWorking(true); setError(''); setProgress(0); setNotice('');
    try {
      const result = await analyzeAutoFile(file, abort.signal, value => { if (!abort.signal.aborted) setProgress(value); }, setEngineMessage, modelReady, includeHard);
      if (abort.signal.aborted) return;
      const id = `auto-${crypto.randomUUID()}`;
      setIdentity({ videoId: videoId ?? '', title: title.trim(), id });
      const makeChart = (difficulty: Difficulty): Chart => ({ schemaVersion: 1, chartId: `${id}-${difficulty}`, revision: 1, videoId: videoId ?? '', title: title.trim(), difficulty, provenance: 'algorithmic', quality: 'instant', offsetMs: 0, durationMs: result.durationMs, notes: result[difficulty] ?? result.easy, generator: result.generator ?? BROWSER_GENERATOR });
      const charts: SongCharts = { easy: makeChart('easy'), normal: makeChart('normal'), ...(includeHard ? { hard: makeChart('hard') } : {}) };
      drafts.current = charts; setDifficulty('easy'); setAnalysis(result);
      await persist(id, file, charts);
      if (modelReady && !result.generator?.startsWith('mapperatorinator')) setNotice(t('AI 생성을 완료하지 못해 기본 분석으로 채보를 만들었습니다.', 'AI generation could not finish. This chart uses basic analysis.'));
      setUseVideo(Boolean(videoId));
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? t(error.message) : t("분석하지 못했습니다.")); }
    finally { if (controller.current === abort) { setWorking(false); controller.current = null; } }
  }
  function cancel() { controller.current?.abort(); setWorking(false); setNotice(t("분석을 취소했습니다.", "Analysis canceled.")); }
  if (loadingSaved) return <p role="status">{t('저장된 음악을 불러오는 중…', 'Loading saved music…')}</p>;
  if (pendingSong) return <ConnectAudio song={pendingSong} />;
  return <>
    <div className="back-row"><a href={identity.videoId ? `/?v=${identity.videoId}` : '/'}>{t("← 곡 찾기로")}</a></div>
    {!analysis ? <section className="creator-studio"><div className="creator-intro"><h1>{t("내 음악으로")}<br /><em>{t("바로 플레이.")}</em></h1><p>{t("좋아하는 노래도, 직접 만든 노래도.")}<br />{t("음악 파일을 고르면 게임이 됩니다.")}</p><div className="creator-steps"><span>{t("01 파일 선택")}</span><span>{t("02 난이도 선택")}</span><span>03 PLAY</span></div></div>
      <form className="creator-form" onSubmit={event => { event.preventDefault(); void generate(); }}>
        <label htmlFor="creator-url">{t("노래가 있는 영상 링크 (선택)")}</label><input id="creator-url" type="url" value={url} disabled={working} placeholder={t("영상이 있다면 링크를 붙여넣으세요")} onChange={event => setUrl(event.target.value)} />
        <label htmlFor="creator-title">{t("곡 제목")}</label><input id="creator-title" required maxLength={200} value={title} disabled={working} placeholder={t("아티스트 — 곡 제목")} onChange={event => setTitle(event.target.value)} />
        <label htmlFor="creator-audio">{t("음악 파일 선택")}</label><div className="audio-picker"><span className="audio-icon" aria-hidden="true">↥</span><strong>{file ? file.name : t("음악 파일을 선택하세요")}</strong><span>{t("WAV / MP3 / FLAC · 최대 50 MB, 10분")}</span><input id="creator-audio" type="file" accept=".wav,.mp3,.flac,audio/wav,audio/mpeg,audio/flac" disabled={working} required onChange={event => { setFile(event.target.files?.[0] ?? null); setError(''); setNotice(''); }} /></div>
        <p className="input-note">{t('기본 난이도: Easy · Normal', 'Default difficulties: Easy · Normal')}</p>
        <label className="check hard-option"><input type="checkbox" checked={includeHard} disabled={working} onChange={event => setIncludeHard(event.target.checked)} />{t('Hard도 만들기 (선택 · 생성 시간이 늘어납니다)', 'Also generate Hard (optional · takes longer)')}</label>
        <button className="primary generate-button" disabled={working || !file} type="submit">{working ? `${t('분석 중', 'Analyzing')} · ${progress}%` : t("만들고 플레이 →")}</button>
        {working && <><progress className="analysis-progress" max={100} value={progress} aria-label={t("로컬 음원 분석 진행률")} /><button type="button" className="quiet" onClick={cancel}>{t("분석 취소")}</button><p className="input-note" role="status">{engineMessage}</p></>}
        <p className="input-note">{t('완성된 채보와 음악 파일은 이 브라우저의 보관함에 자동 저장됩니다. 서버로 보내지 않습니다.', 'Finished charts and audio are automatically saved to this browser’s library. Nothing is uploaded.')}</p>
        <BrowserModelSettings busy={working} onReady={setModelReady} />
        {error && <div className="error" role="alert">{error}</div>}
      </form></section> : <>
      <div className="creator-preview-bar"><div><h2>{t("준비됐어요. 플레이해 보세요.")}</h2><p>{t('난이도를 골라 시작하세요. 기록은 난이도별로 저장됩니다.', 'Choose a difficulty. Scores are saved separately for each level.')}</p></div><div className="difficulty-switch">{difficulties.filter(level => drafts.current[level]).map(level => <button key={level} aria-pressed={difficulty === level} onClick={() => setDifficulty(level)}>{difficultyLabel(level)}</button>)}</div></div>
      <div className="private-play-options">
        <p role="status">{storageMessage}</p><a href="/library">{t('내 보관함 →', 'My library →')}</a>
        {saveFailed && <button className="quiet" onClick={() => { if (file && drafts.current.easy) void persist(identity.id, file, drafts.current as SongCharts); }}>{t('저장 다시 시도', 'Retry saving')}</button>}
        {identity.videoId && <label className="check"><input type="checkbox" checked={useVideo} onChange={event => setUseVideo(event.target.checked)} />{t("음악 파일 대신 연결한 영상으로 플레이")}</label>}

        {!identity.videoId && <p>{t("영상 없이도 플레이할 수 있어요. 공개 공유는 현재 제공하지 않습니다.")}</p>}
      </div>
      {playbackChart && <Player key={`${playbackChart.chartId}-${playbackChart.revision}-${useVideo}`} chart={playbackChart} savedSongId={identity.id} audioFile={!useVideo && file ? file : undefined} imported onDraftChange={next => { drafts.current[next.difficulty] = next; void updateSavedChart(identity.id, next).catch(() => { setSaveFailed(true); setStorageMessage(t('변경 내용을 저장하지 못했습니다.', 'Could not save your changes.')); }); }} />}
      <button className="quiet" onClick={() => { setAnalysis(null); setNotice(''); setUseVideo(false); setStorageMessage(''); setSaveFailed(false); history.replaceState(null, '', '/create'); }}>{t("다른 음원으로 새 채보 만들기")}</button>
    </>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </>;
}
