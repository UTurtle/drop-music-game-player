import { useEffect, useRef, useState } from 'react';
import { createSongPackage, readSongPackage } from './songPackage';
import { loadSongMetadata, saveImportedCharts, type SavedSong } from './localLibrary';
import { t } from './i18n';
import { createLibraryPackage, readLibraryPackage, MAX_LIBRARY_BYTES, MAX_LIBRARY_SONGS } from './libraryPackage';

export function ExportSong({ id, title }: { id: string; title: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const running = useRef(false);
  async function download() {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const song = await loadSongMetadata(id);
      const bundle = await createSongPackage(song.charts);
      const url = URL.createObjectURL(bundle), link = document.createElement('a');
      link.href = url; link.download = `${title.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 80) || 'chart'}.drop-chart`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(t('채보를 내보내지 못했습니다. 보관함을 확인해 주세요.', 'Could not export charts. Check your library.')); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="song-export"><button className="quiet" disabled={busy} onClick={() => void download()} aria-label={`${title} ${t('내보내기', 'Export')}`}>{busy ? t('준비 중…', 'Preparing…') : t('채보만 내보내기 ↓', 'Export charts only ↓')}</button>{error && <p role="alert">{error}</p>}</div>;
}

export function ImportSong({ onImported, disabled = false, onBusy }: { onImported: () => void; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function importFiles(files: File[]) {
    if (!files.length || controller.current || disabled) return;
    if (files.length > 100 || files.reduce((sum, file) => sum + file.size, 0) > MAX_LIBRARY_BYTES) {
      setError(true); setMessage(t('한 번에 최대 100개 파일·32 MB까지 선택해 주세요.', 'Select at most 100 files / 32 MB at a time.')); return;
    }
    const abort = new AbortController(); controller.current = abort; setBusy(true); onBusy?.(true); setMessage(''); setError(false);
    let imported = 0, failed = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        if (abort.signal.aborted) break;
        let entries: Blob[];
        try {
          if (/\.drop-charts$/i.test(file.name)) entries = await readLibraryPackage(file);
          else if (/\.drop-chart$/i.test(file.name)) entries = [file];
          else throw new Error(t('채보 전용 파일만 지원합니다.', 'Only chart-only files are supported.'));
        } catch { failed++; failures.push(file.name); continue; }
        for (const [index, entry] of entries.entries()) {
          if (abort.signal.aborted) break;
          setMessage(`${t('가져오는 중', 'Importing')} · ${file.name} · ${index + 1}/${entries.length}`);
          try {
            const bundle = await readSongPackage(entry);
            abort.signal.throwIfAborted();
            await saveImportedCharts(bundle.charts);
            imported++;
            window.dispatchEvent(new Event('drop-library-updated')); onImported();
          } catch { if (!abort.signal.aborted) { failed++; failures.push(`${file.name} #${index + 1}`); } }
        }
      }
      setError(failed > 0);
      setMessage(`${abort.signal.aborted ? t('취소됨 · ', 'Canceled · ') : ''}${t('가져오기 완료', 'Import complete')}: ${imported} · ${t('실패', 'Failed')}: ${failed}. ${t('음원과 개인 기록은 포함되지 않습니다. 각 곡에 내 음원을 연결해 주세요.', 'Audio and scores are not included. Connect your own audio to each song.')}${failures.length ? ` ${failures.slice(0, 5).join(', ')}` : ''}`);
    } finally { setBusy(false); onBusy?.(false); controller.current = null; }
  }
  return <section className="song-import" aria-label={t('채보 가져오기', 'Import charts')}>
    <label className="secondary transfer-picker">{busy ? t('파일 확인 중…', 'Checking file…') : t('여러 채보 가져오기 ↑', 'Import charts ↑')}<input type="file" multiple accept=".drop-chart,.drop-charts" disabled={busy || disabled} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files); }} /></label>
    {busy && <button className="quiet" onClick={() => controller.current?.abort()}>{t('가져오기 취소', 'Cancel import')}</button>}
    <p>{t('.drop-chart 또는 .drop-charts를 여러 개 선택하세요 (한 번에 32 MB까지). 음악 원본과 점수는 포함되지 않습니다. 이용 권한이 있는 동일한 음원을 직접 연결하면 재분석 없이 플레이할 수 있습니다. 음원이 포함된 이전 .drop-song / .drop-library 파일은 지원하지 않습니다.', 'Select .drop-chart or .drop-charts files (up to 32 MB per batch). No audio or scores are included. Connect the matching audio you have permission to use and play without reanalysis. Older .drop-song / .drop-library audio bundles are not supported.')}</p>
    {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
  </section>;
}

export function ExportLibrary({ songs, disabled, onBusy }: { songs: SavedSong[]; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [links, setLinks] = useState<{ url: string; name: string }[]>([]);
  const [message, setMessage] = useState('');
  const urls = useRef<string[]>([]), running = useRef(false), canceled = useRef(false);
  useEffect(() => () => { canceled.current = true; urls.current.forEach(URL.revokeObjectURL); }, []);
  async function prepare() {
    if (running.current || disabled || !songs.length) return;
    running.current = true; canceled.current = false; onBusy(true); setMessage('');
    urls.current.forEach(URL.revokeObjectURL); urls.current = []; setLinks([]);
    let parts: Blob[] = [], bytes = 0, part = 0;
    const ready: { url: string; name: string }[] = [];
    async function flush() {
      if (!parts.length) return;
      const blob = await createLibraryPackage(parts);
      if (canceled.current) return;
      const url = URL.createObjectURL(blob); urls.current.push(url);
      ready.push({ url, name: `drop-charts-${++part}.drop-charts` }); parts = []; bytes = 0;
    }
    try {
      for (const [index, song] of songs.entries()) {
        if (canceled.current) return;
        setMessage(`${t('준비 중', 'Preparing')} · ${index + 1}/${songs.length}`);
        const stored = await loadSongMetadata(song.id);
        const bundle = await createSongPackage(stored.charts);
        if (parts.length && (parts.length >= MAX_LIBRARY_SONGS || bytes + bundle.size + 412 > MAX_LIBRARY_BYTES)) await flush();
        parts.push(bundle); bytes += bundle.size;
      }
      await flush();
      if (canceled.current) return;
      setLinks(ready); setMessage(t('준비 완료. 아래 파일을 모두 저장해 주세요. 음악 원본과 점수는 제외됩니다.', 'Ready. Save all files below. Audio and scores are excluded.'));
    } catch {
      urls.current.forEach(URL.revokeObjectURL); urls.current = [];
      setMessage(t('전체 내보내기에 실패했습니다. 저장된 채보를 확인한 후 다시 시도해 주세요.', 'Export failed. Check the saved charts and retry.'));
    } finally { running.current = false; onBusy(false); }
  }
  return <div className="library-export"><button className="secondary" disabled={disabled || !songs.length} onClick={() => void prepare()}>{t('전체 채보 내보내기 ↓', 'Export all charts ↓')}</button>
    {message && <p role="status">{message}</p>}
    {links.map(link => <a className="quiet" key={link.url} href={link.url} download={link.name}>{link.name} ↓</a>)}
  </div>;
}
