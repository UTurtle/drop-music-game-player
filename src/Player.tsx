import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { parseChart, playPath, type Chart, type Lane } from './chart';
import { GameEngine, type Status } from './engine';
import { createYouTube, PracticeMedia, LocalFileMedia, type Media } from './media';
import { renderNotes, getPlayfieldLayout } from './render';

const keyLanes: Record<string, Lane> = { KeyA: 'A', ArrowLeft: 'A', KeyZ: 'A', KeyD: 'D', ArrowRight: 'D', KeyX: 'D' };

const statusLabels = (): Record<Status, string> => ( { ready: 'READY WHEN YOU ARE', playing: 'NOW PLAYING', paused: 'PAUSED', buffering: t("BUFFERING — 판정 대기"), ended: 'SESSION COMPLETE', error: 'PLAYBACK UNAVAILABLE' });
export function Player({ chart, practice = false, imported = false, onDraftChange, audioFile }: {
  chart: Chart; audioFile?: File; practice?: boolean; imported?: boolean;
  onDraftChange?: (chart: Chart) => void;
}) {
  const [offset, setOffset] = useState(chart.offsetMs);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [aligned, setAligned] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const activeChart = useRef(chart);
  const engine = useRef(new GameEngine(chart));
  const media = useRef<Media | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const pressed = useRef(new Set<Lane>());
  const restarting = useRef(false);
  const lastSample = useRef({ media: 0, wall: 0 });
  const [snapshot, setSnapshot] = useState(engine.current.snapshot);

  useEffect(() => {
    const abort = new AbortController();
    let frame = 0;
    let lastUi = 0;
    const onStatus = (status: Status) => {
      if (abort.signal.aborted) return;
      engine.current.setStatus(status);
      if (status === 'playing') { setError(''); }
      setSnapshot(engine.current.snapshot);
    };
    const onError = (message: string) => {
      if (abort.signal.aborted) return;
      engine.current.setStatus('error'); setError(message); setSnapshot(engine.current.snapshot);
    };
    if (audioFile) {
      media.current = new LocalFileMedia(audioFile, onStatus, onError);
      setReady(true);
    } else if (practice) {
      media.current = new PracticeMedia(onStatus, new URLSearchParams(location.search).get('test') === '1');
      setReady(true);
    } else if (video.current) {
      void createYouTube(video.current, chart.videoId, onStatus, onError, abort.signal)
        .then(result => { if (!abort.signal.aborted && result) { media.current = result; setReady(true); } })
        .catch(error => onError(error instanceof Error ? error.message : t("영상을 불러오지 못했습니다.")));
    }
    function sample() {
      if (!media.current) return;
      const raw = media.current.timeMs();
      const now = performance.now();
      const previous = lastSample.current;
      const state = engine.current.snapshot;
      if (restarting.current) {
        if (raw < 500 && state.status === 'playing') { engine.current.reset(); engine.current.setStatus('playing'); restarting.current = false; }
        else { lastSample.current = { media: raw, wall: now }; return; }
      } else if (previous.wall && (raw < previous.media - 200 || raw - previous.media > Math.max(700, now - previous.wall + 500))) {
        engine.current.seek(raw);
      }
      lastSample.current = { media: raw, wall: now };
      engine.current.update(raw);
    }
    function draw() {
      if (canvas.current) renderNotes(canvas.current, activeChart.current, engine.current.snapshot, pressed.current);
    }
    function tick() {
      sample(); draw();
      if (performance.now() - lastUi > 70) { setSnapshot(engine.current.snapshot); lastUi = performance.now(); }
      frame = requestAnimationFrame(tick);
    }
    const heldKeys = new Set<string>();
    const heldPointers = new Map<number, Lane>();
    function keydown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, summary')) return;
      const lane = keyLanes[event.code];
      if (lane) event.preventDefault();
      if (event.repeat) return;
      if (lane) { event.preventDefault(); heldKeys.add(event.code); pressed.current.add(lane); sample(); engine.current.hit(lane); setSnapshot(engine.current.snapshot); }
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
      if (event.code === 'KeyF') {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void container.current?.requestFullscreen().catch(() => {});
      }
    }
    function keyup(event: KeyboardEvent) {
      heldKeys.delete(event.code);
      const lane = keyLanes[event.code];
      if (lane && ![...heldKeys].some(code => keyLanes[code] === lane) && ![...heldPointers.values()].includes(lane)) pressed.current.delete(lane);
    }
    function pointerdown(event: PointerEvent) {
      if (!canvas.current) return;
      const rect = canvas.current.getBoundingClientRect();
      const { centers } = getPlayfieldLayout(canvas.current);
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const lane = (['A', 'D'] as const).find(lane => Math.hypot(x - centers[lane].x, y - centers[lane].y) <= 68);
      if (!lane) return;
      event.preventDefault(); canvas.current.setPointerCapture(event.pointerId);
      heldPointers.set(event.pointerId, lane); pressed.current.add(lane);
      container.current?.focus({ preventScroll: true });
      sample(); engine.current.hit(lane); setSnapshot(engine.current.snapshot);
    }
    function pointerup(event: PointerEvent) {
      const lane = heldPointers.get(event.pointerId); heldPointers.delete(event.pointerId);
      if (lane && ![...heldPointers.values()].includes(lane) && ![...heldKeys].some(code => keyLanes[code] === lane)) pressed.current.delete(lane);
    }
    const playCanvas = canvas.current;
    playCanvas?.addEventListener('pointerdown', pointerdown);
    playCanvas?.addEventListener('pointerup', pointerup);
    playCanvas?.addEventListener('pointercancel', pointerup);
    function blur() { heldPointers.clear(); heldKeys.clear(); pressed.current.clear(); if (engine.current.snapshot.status === 'playing') media.current?.pause(); }
    function visibility() { if (document.hidden) blur(); }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.render_game_to_text = () => JSON.stringify({
      ...engine.current.snapshot, judged: engine.current.snapshot.judged.size,
      coordinates: 'Canvas origin top-left. Portrait phone: top to bottom. Landscape: right to left.',
      layout: canvas.current ? getPlayfieldLayout(canvas.current) : null,
      pressed: [...pressed.current], noteShapes: { A: 'star', D: 'diamond' }, controls: { left: ['A', 'ArrowLeft', 'Z'], right: ['D', 'ArrowRight', 'X'] },
      chartId: activeChart.current.chartId, offsetMs: activeChart.current.offsetMs,
      notes: activeChart.current.notes.filter((note, i) => !engine.current.snapshot.judged.has(i) && Math.abs(note.timeMs + activeChart.current.offsetMs - engine.current.snapshot.timeMs) < 1800),
    });
    window.advanceTime = (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0 || ms > 60_000) return;
      for (let remaining = ms; remaining > 0; remaining -= 16) { media.current?.advance?.(Math.min(16, remaining)); sample(); }
      draw(); setSnapshot(engine.current.snapshot);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      abort.abort(); cancelAnimationFrame(frame);
      playCanvas?.removeEventListener('pointerdown', pointerdown);
      playCanvas?.removeEventListener('pointerup', pointerup);
      playCanvas?.removeEventListener('pointercancel', pointerup);
      if (practice || audioFile) media.current?.destroy();
      media.current = null;
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      delete window.render_game_to_text; delete window.advanceTime;
    };
  }, [chart, practice, audioFile]);

  function togglePlayback() {
    if (engine.current.snapshot.status === 'ended') { restart(); return; }
    if (['playing', 'buffering'].includes(engine.current.snapshot.status)) media.current?.pause();
    else void Promise.resolve(media.current?.play()).catch(() => setError(t("재생을 시작하지 못했습니다. 다시 눌러 주세요.")));
    // Return keyboard focus from controls to the play surface.
    container.current?.focus();
  }
  function restart() {
    engine.current.reset(); engine.current.setStatus('buffering'); restarting.current = true;
    lastSample.current = { media: 0, wall: 0 }; setSnapshot(engine.current.snapshot);
    media.current?.restart(); container.current?.focus();
  }
  function changeOffset(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(-120_000, Math.min(120_000, Math.round(value)));
    media.current?.pause(); setOffset(next); setAligned(false); setNotice('');
    activeChart.current = { ...chart, offsetMs: next };
    onDraftChange?.(activeChart.current);
    engine.current = new GameEngine(activeChart.current);
    engine.current.seek(media.current?.timeMs() ?? 0); engine.current.setStatus('paused');
    setSnapshot(engine.current.snapshot);
  }
  function saveChart() {
    try {
      if (mismatch || !aligned) throw new Error(t("같은 편집본인지 확인하고 처음·중간·끝의 싱크를 점검해 주세요."));
      const saved = parseChart({ ...activeChart.current, revision: imported ? chart.revision : chart.revision + 1 });
      const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2) + '\n'], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${saved.chartId}-r${saved.revision}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(t("채보 JSON을 저장했습니다."));
    } catch (error) { setNotice(error instanceof Error ? error.message : t("저장하지 못했습니다.")); }
  }
  async function share() {
    const url = practice ? `${location.origin}/practice` : `${location.origin}${playPath(chart)}`;
    try { await navigator.clipboard.writeText(url); setNotice(t("링크를 복사했습니다.")); }
    catch { setNotice(url); }
  }
  const progress = Math.min(100, snapshot.timeMs / (chart.durationMs + Math.max(0, offset)) * 100);
  return <div className={`session ${practice || audioFile ? 'practice-session' : 'mv-session'}`} ref={container} tabIndex={-1}>
    <div className="session-heading"><div><span className="eyebrow">{audioFile ? t("나만 플레이") : practice ? 'SYNTH PRACTICE · ORIGINAL AUDIO' : imported ? 'LOCAL CHART PREVIEW' : 'MUSIC VIDEO SESSION'}</span><h1>{chart.title}</h1></div>
      <div className="session-actions"><span className="pill">{chart.difficulty.toUpperCase()}</span>{!audioFile && !imported && offset === chart.offsetMs && <button className="quiet" onClick={share}>{t("링크 공유 ↗")}</button>}</div></div>
    <div className="stage">
      <div className="video-area">
        {practice || audioFile ? <div className={`practice-art ${snapshot.status === 'playing' ? 'is-playing' : ''}`}><span className="eyebrow">A LITTLE RHYTHM TO GET YOU STARTED</span><div className="record"><div className="record-label">DROP<span>01 / 120 BPM</span></div></div><div className="practice-caption"><strong>{audioFile ? chart.title : 'First contact'}</strong><span>{audioFile ? t("내 음악 파일로 재생 중") : t("합성 리듬 연습 · 실제 MV가 아닙니다")}</span></div></div>
          : <div className="youtube-host" ref={video} />}
      </div>
      <aside className="scoreboard"><span className="eyebrow">YOUR SESSION</span><div><span className="stat-label">SCORE</span><strong className="score">{snapshot.score.toLocaleString('en-US', { minimumIntegerDigits: 6 })}</strong></div><div><span className="stat-label">COMBO</span><strong className="combo">{snapshot.combo}<small>×</small></strong></div><div className="verdict">{snapshot.verdict || 'FEEL THE BEAT'}</div><div className="score-bottom"><span>{snapshot.hits} HIT</span><span>{snapshot.misses} MISS</span></div></aside>
      <canvas ref={canvas} className="note-canvas" aria-label={t("왼쪽 A·왼쪽 화살표·Z, 오른쪽 D·오른쪽 화살표·X 두 레인 리듬게임. 노트가 판정선에 오면 해당 키를 누르세요.")} />
    </div>
    <div className="timeline"><div style={{ width: `${progress}%` }} /></div>
    <div className="transport"><div className="transport-buttons"><button id="play-button" className="primary" disabled={!ready || mismatch} onClick={togglePlayback}>{snapshot.status === 'ended' ? t("다시 PLAY") : ['playing', 'buffering'].includes(snapshot.status) ? 'Ⅱ PAUSE' : '▶ PLAY'}</button><button className="quiet" disabled={!ready || mismatch} onClick={restart}>{t("↺ 처음부터")}</button></div><span className="status" role="status">{statusLabels()[snapshot.status]}</span><span className="keyboard-help">{t("★ A / ← / Z · ◆ D / → / X · Space 일시정지 · F 전체화면")}</span></div>
    {snapshot.status === 'ended' && <div className="result"><strong>{t("끝까지 잘 들었어요.")}</strong><span>{t("최대 콤보")}{snapshot.maxCombo} · HIT {snapshot.hits} / {chart.notes.length}{snapshot.practice ? t(" · 탐색한 연습 세션") : ''}</span></div>}
    {error && <div className="error" role="alert">{error} <a href="/">{t("돌아가기")}</a></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!practice && !audioFile && <details className="alignment" ><summary>{t("제작자 · MV 싱크 조정")}</summary><p>{t("양수는 노트를 더 늦게 표시합니다. 조정하면 일시정지되며 점수가 초기화됩니다.")}</p><div className="offset-controls"><label htmlFor="offset">Video offset (ms)</label><input id="offset" type="number" min={-120000} max={120000} step={1} value={offset} onChange={event => changeOffset(Number(event.target.value))} /><input aria-label="Video offset slider" type="range" min={-120000} max={120000} step={10} value={offset} onChange={event => changeOffset(Number(event.target.value))} /><button className="quiet" onClick={() => changeOffset(offset - 10)}>−10 ms</button><button className="quiet" onClick={() => changeOffset(offset + 10)}>+10 ms</button></div><label className="check"><input type="checkbox" checked={mismatch} onChange={event => { setMismatch(event.target.checked); setAligned(false); media.current?.pause(); }} />{t("MV에 중간 삽입·삭제 등 원본 음원과 다른 편집이 있습니다.")}</label>{mismatch ? <p className="error">{t("지원하지 않는 편집 차이입니다. 동일한 편집본의 음원을 사용해 다시 생성해 주세요. 오프셋만으로는 맞출 수 없습니다.")}</p> : <label className="check"><input type="checkbox" checked={aligned} onChange={event => setAligned(event.target.checked)} />{t("처음·중간·끝에서 동일 편집본과 싱크를 확인했습니다.")}</label>}<div className="publish-controls"><button className="secondary" disabled={!aligned || mismatch} onClick={saveChart}>{t("채보 JSON 저장 ↓")}</button></div></details>}
  </div>;
}
