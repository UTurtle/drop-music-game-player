import { useEffect, useRef, useState } from 'react';
import { decodeLocalFile } from './localAudio';
import { saveSong, type SavedSong } from './localLibrary';
import { t } from './i18n';

export function ConnectAudio({ song }: { song: SavedSong }) {
  const [file, setFile] = useState<File | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null), active = useRef(true);
  useEffect(() => () => { active.current = false; controller.current?.abort(); }, []);
  async function connect() {
    if (!file || !confirmed || controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError('');
    try {
      const pcm = await decodeLocalFile(file, abort.signal, () => {}, 8000);
      if (Math.abs(pcm.length / 8000 * 1000 - song.charts.easy.durationMs) > 1500) {
        throw new Error(t('음원 길이가 채보와 다릅니다. 같은 길이·편집본의 파일을 선택해 주세요.', 'Audio duration differs from the chart. Select the same-length, matching edit.'));
      }
      abort.signal.throwIfAborted();
      await saveSong(song.id, file, song.charts);
      if (active.current) location.reload();
    } catch (error) {
      if (active.current && !abort.signal.aborted) setError(error instanceof Error ? error.message : t('음원을 연결하지 못했습니다.', 'Could not connect audio.'));
    } finally { controller.current = null; if (active.current) setBusy(false); }
  }
  return <section className="connect-audio"><a href="/library">{t('← 내 보관함', '← My library')}</a>
    <h1>{song.title}</h1><h2>{t('내 음원 연결', 'Connect your audio')}</h2>
    <p>{t('채보를 가져왔습니다. 음악 원본은 포함되지 않습니다. 이용 권한이 있는 동일한 음원을 선택해 주세요.', 'Charts are imported, but audio is not included. Select the matching audio you have permission to use.')}</p>
    <p>{t('채보 길이', 'Chart duration')}: {(song.charts.easy.durationMs / 1000).toFixed(1)}{t('초', ' seconds')} · WAV / MP3 / FLAC · 50 MB</p>
    <label className="secondary transfer-picker">{t('음악 파일 선택', 'Choose audio file')}<input id="connect-audio-file" type="file" accept=".wav,.mp3,.flac,audio/wav,audio/mpeg,audio/flac" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setConfirmed(false); setError(''); }} /></label>
    {file && <p className="selected-audio">{file.name}</p>}
    <label className="check"><input id="connect-audio-confirm" type="checkbox" checked={confirmed} disabled={busy || !file} onChange={event => setConfirmed(event.target.checked)} />{t('이용 권한이 있으며, 채보와 같은 곡·편집본의 음원입니다.', 'I have permission to use this audio, and it matches the song and edit of the chart.')}</label>
    <p className="input-note">{t('길이가 같아도 인트로·중간 편집이 다르면 싱크가 어긋날 수 있습니다. 연결 후 처음·중간·끝의 싱크를 확인해 주세요. 파일은 이 브라우저에만 저장되며, 채보를 다시 생성하지 않습니다.', 'Equal duration does not guarantee matching edits. Check sync at the beginning, middle and end after connecting. The file stays in this browser. Charts are not regenerated.')}</p>
    <button className="primary" id="connect-audio-button" disabled={!file || !confirmed || busy} onClick={() => void connect()}>{busy ? t('파일 확인 중…', 'Checking file…') : t('연결하고 플레이', 'Connect and play')}</button>
    {busy && <button className="quiet" onClick={() => controller.current?.abort()}>{t('취소', 'Cancel')}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
