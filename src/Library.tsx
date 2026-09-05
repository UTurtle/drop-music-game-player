import { useEffect, useState } from 'react';
import { deleteSong, deleteSongs, listSongs, type SavedSong } from './localLibrary';
import { t } from './i18n';
import { SongRecordLines } from './SongRecordLines';
import { ExportSong, ExportLibrary, ImportSong } from './SongTransfer';
import { difficulties, difficultyLabel } from './difficulties';

export function Library() {
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const busy = transferring || deleting !== null || loading;
  useEffect(() => { void listSongs().then(setSongs).catch(() => setError(t('저장 목록을 열지 못했습니다.', 'Could not open your library.'))).finally(() => setLoading(false)); }, []);
  async function remove(id: string) {
    if (busy) return;
    setDeleting(id); setError('');
    try { await deleteSong(id); setSongs(current => current.filter(song => song.id !== id)); }
    catch { setError(t('삭제하지 못했습니다. 다시 시도해 주세요.', 'Could not delete. Please retry.')); }
    finally { setDeleting(null); }
  }
  async function removeAll() {
    if (busy || !songs.length) return;
    const ids = songs.map(song => song.id);
    if (!window.confirm(t(`저장된 ${ids.length}곡의 음악·모든 채보·개인 기록을 삭제할까요? 되돌릴 수 없습니다. 원본 파일과 AI 모델은 유지됩니다.`, `Delete all ${ids.length} saved songs, charts and personal scores? This cannot be undone. Original files and the AI model are kept.`))) return;
    setDeleting('all'); setError('');
    try {
      await deleteSongs(ids); setSongs(current => current.filter(song => !ids.includes(song.id)));
      window.dispatchEvent(new Event('drop-library-updated'));
    } catch { setError(t('전체 삭제에 실패했습니다. 저장된 항목은 유지됩니다. 다시 시도해 주세요.', 'Delete all failed. Saved items are unchanged. Please retry.')); }
    finally { setDeleting(null); }
  }
  return <section className="local-library"><h1>{t('내 보관함', 'My library')}</h1>
    <p>{t('음악, 난이도별 채보와 최고 기록이 이 브라우저에만 저장됩니다. 다른 기기로 동기화되지 않으며 곡이나 사이트 데이터를 지우면 기록도 함께 삭제됩니다.', 'Audio, charts and best scores stay in this browser only. They do not sync to other devices. Deleting a song or clearing site data also removes its records.')}</p>
    <p>{t('저장된 음악', 'Saved audio')} · {songs.length} · {(songs.reduce((total, song) => total + song.bytes, 0) / 1_000_000).toFixed(1)} MB</p>
    <a className="primary" href="/create">{t('새 음악으로 만들기', 'Create from another song')}</a>
    <div className="library-tools"><ExportLibrary songs={songs} disabled={busy} onBusy={setTransferring} />
      <button className="quiet delete-all" disabled={busy || !songs.length} onClick={() => void removeAll()}>{t('전체 삭제', 'Delete all')}</button></div>
    <ImportSong disabled={busy} onBusy={setTransferring} onImported={() => { void listSongs().then(setSongs).catch(() => setError(t('목록을 다시 열어 주세요.', 'Please reload the library.'))); }} />
    {error && <p role="alert" className="error">{error}</p>}
    {loading ? <p>{t('불러오는 중…', 'Loading…')}</p> : songs.length === 0 ? <p>{t('아직 저장된 음악이 없습니다.', 'No saved music yet.')}</p> : <ul className="library-list">{songs.map(song => <li key={song.id}>
      <div><h2>{song.title}</h2><p>{song.awaitingAudio ? t('음원 연결 필요', 'Audio required') : `${song.filename} · ${(song.bytes / 1_000_000).toFixed(1)} MB`} · {difficulties.filter(level => song.charts[level]).map(difficultyLabel).join(' / ')}</p><SongRecordLines records={song.records} charts={song.charts} /></div>
      <a className="primary" href={`/create?song=${encodeURIComponent(song.id)}`}>{song.awaitingAudio ? t('음원 연결', 'Connect audio') : t('플레이', 'Play')}</a>
      <ExportSong id={song.id} title={song.title} />
      <button className="quiet" disabled={busy} onClick={() => void remove(song.id)} aria-label={`${song.title} ${t('삭제', 'Delete')}`}>{t('음악과 채보 삭제', 'Delete audio & charts')}</button>
    </li>)}</ul>}
    <p className="input-note">{t('브라우저의 저장 공간 정리로 사라질 수도 있으니 원본 음악 파일은 따로 보관해 주세요. 삭제해도 원본 파일이나 AI 모델은 지워지지 않습니다.', 'Browser storage cleanup can remove saved items, so keep your original audio files. Deleting a song here does not delete the original file or AI model.')}</p>
  </section>;
}
