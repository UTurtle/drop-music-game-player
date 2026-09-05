import { useEffect, useState } from 'react';
import { listSongs, type SavedSong } from './localLibrary';
import { t } from './i18n';
import { SongRecordLines } from './SongRecordLines';
import { ExportSong } from './SongTransfer';
import { difficulties, difficultyLabel } from './difficulties';

export function SavedSongsPanel({ chartId }: { chartId: string }) {
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    const refresh = () => { void listSongs().then(items => { if (active) { setSongs(items); setState('ready'); } })
      .catch(() => { if (active) setState('error'); }); };
    refresh();
    window.addEventListener('drop-library-updated', refresh);
    return () => { active = false; window.removeEventListener('drop-library-updated', refresh); };
  }, [chartId]);
  return <aside className="saved-songs-panel" aria-label={t('저장된 노래', 'Saved songs')}>
    <div className="saved-songs-heading"><h2>{t('저장된 노래', 'Saved songs')}</h2><span>{songs.length}</span></div>
    {state === 'loading' ? <p>{t('불러오는 중…', 'Loading…')}</p> : state === 'error' ? <p>{t('보관함을 열지 못했습니다.', 'Could not open your library.')}</p> : songs.length === 0 ? <p>{t('음악 파일로 채보를 만들면 여기에 저장됩니다.', 'Create a chart from an audio file to save it here.')}</p> :
      <ul>{songs.map(song => {
        const current = Object.values(song.charts).some(chart => chart.chartId === chartId);
        return <li key={song.id}><a href={`/create?song=${encodeURIComponent(song.id)}`} aria-current={current ? 'true' : undefined}>
          <strong>{song.title}</strong><span>{song.awaitingAudio ? t('음원 연결 필요', 'Audio required') : current ? t('현재 곡', 'Current song') : difficulties.filter(level => song.charts[level]).map(difficultyLabel).join(' / ')} · {(song.bytes / 1_000_000).toFixed(1)} MB</span>
          <SongRecordLines records={song.records} charts={song.charts} />
        </a></li>;
      })}</ul>}
    <a className="saved-songs-manage" href="/library">{t('보관함 관리 →', 'Manage library →')}</a>
    {songs.filter(song => Object.values(song.charts).some(chart => chart.chartId === chartId)).map(song => <ExportSong key={song.id} id={song.id} title={song.title} />)}
    <a className="saved-songs-manage" href="/create">{t('새 노래 추가 +', 'Add a song +')}</a>
  </aside>;
}
