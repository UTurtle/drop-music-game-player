import { type Chart } from './chart';
import { betterRecord, sameScoringChart, type SongRecord, type SongRecords } from './songRecords';
import { difficulties, parseSongCharts, withNormal, type SongCharts } from './difficulties';

export interface SavedSong {
  id: string;
  title: string;
  updatedAt: number;
  bytes: number;
  filename: string;
  mime: string;
  lastModified: number;
  charts: SongCharts;
  records?: SongRecords;
  awaitingAudio?: boolean;
  importedCharts?: boolean;
}
const databaseName = 'drop-local-library';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('songs', { keyPath: 'id' });
      request.result.createObjectStore('audio');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local storage is busy. Close other tabs and retry.'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(['songs', 'audio'], mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Local storage failed')); };
    try { run(tx, next => { value = next; }); } catch (error) { tx.abort(); reject(error); }
  });
}
export function saveSong(id: string, file: File, charts: SavedSong['charts']) {
  const song: SavedSong = { id, title: charts.easy.title, updatedAt: Date.now(), bytes: file.size, filename: file.name, mime: file.type, lastModified: file.lastModified, charts };
  return transaction<void>('readwrite', tx => {
    const store = tx.objectStore('songs');
    const previous = store.get(id);
    previous.onsuccess = () => {
      const old = previous.result as SavedSong | undefined;
      const records: SongRecords = {};
      for (const difficulty of difficulties) {
        if (old && sameScoringChart(withNormal(old.charts)[difficulty], charts[difficulty])) records[difficulty] = old.records?.[difficulty];
      }
      store.put({ ...song, records, ...(old?.importedCharts ? { importedCharts: true } : {}) });
    };
    tx.objectStore('audio').put(file, id);
  });
}
export function listSongs() {
  return transaction<SavedSong[]>('readonly', (tx, result) => {
    const request = tx.objectStore('songs').getAll();
    request.onsuccess = () => result((request.result as SavedSong[]).map(song => ({ ...song, charts: withNormal(song.charts) })).sort((a, b) => b.updatedAt - a.updatedAt));
  });
}
export function loadSongMetadata(id: string) {
  return transaction<SavedSong>('readonly', (tx, result) => {
    const request = tx.objectStore('songs').get(id);
    request.onsuccess = () => result(request.result);
  }).then(song => {
    if (!song) throw new Error('Saved chart not found');
    return { ...song, charts: withNormal(parseSongCharts(song.charts)) };
  });
}
export function saveImportedCharts(charts: SongCharts) {
  const id = `import-${crypto.randomUUID()}`;
  const safe = parseSongCharts(charts);
  const fresh = Object.fromEntries(difficulties.filter(level => safe[level]).map(level => [level, { ...safe[level]!, chartId: `${id}-${level}` }])) as SongCharts;
  const song: SavedSong = { id, title: fresh.easy.title, updatedAt: Date.now(), bytes: 0, filename: '', mime: '', lastModified: 0,
    charts: fresh, awaitingAudio: true, importedCharts: true };
  return transaction<void>('readwrite', tx => { tx.objectStore('songs').add(song); });
}
export async function loadSong(id: string) {
  const stored = await transaction<{ song?: SavedSong; audio?: Blob }>('readonly', (tx, result) => {
    const song = tx.objectStore('songs').get(id);
    const audio = tx.objectStore('audio').get(id);
    audio.onsuccess = () => result({ song: song.result, audio: audio.result });
  });
  if (!stored.song || (!stored.audio && !stored.song.awaitingAudio)) throw new Error('Saved song not found');
  const song = stored.song;
  song.charts = withNormal(parseSongCharts(song.charts));
  return { song, file: stored.audio ? new File([stored.audio], song.filename, { type: song.mime, lastModified: song.lastModified }) : undefined };
}
export function updateSavedChart(id: string, chart: Chart) {
  return transaction<void>('readwrite', tx => {
    const store = tx.objectStore('songs');
    const request = store.get(id);
    request.onsuccess = () => {
      const song = request.result as SavedSong | undefined;
      if (song) {
        const records = { ...song.records };
        if (!sameScoringChart(withNormal(song.charts)[chart.difficulty], chart)) delete records[chart.difficulty];
        store.put({ ...song, records, updatedAt: Date.now(), charts: { ...song.charts, [chart.difficulty]: chart } });
      }
    };
  });
}
export async function saveSongRecord(id: string, chart: Chart, record: SongRecord) {
  const saved = await transaction<boolean>('readwrite', (tx, result) => {
    const store = tx.objectStore('songs');
    const request = store.get(id);
    request.onsuccess = () => {
      const song = request.result as SavedSong | undefined;
      if (!song || !sameScoringChart(withNormal(song.charts)[chart.difficulty], chart)) { result(false); return; }
      const records = { ...song.records, [chart.difficulty]: betterRecord(song.records?.[chart.difficulty], record) };
      try { store.put({ ...song, records }); result(true); }
      catch { tx.abort(); }
    };
  });
  if (!saved) throw new Error('The saved song is missing or its chart has changed.');
}
export function deleteSong(id: string) {
  return transaction<void>('readwrite', tx => {
    tx.objectStore('songs').delete(id);
    tx.objectStore('audio').delete(id);
  });
}
/** Delete only the IDs shown in the confirmation, atomically with their audio and scores. */
export function deleteSongs(ids: string[]) {
  return transaction<void>('readwrite', tx => {
    for (const id of ids) {
      tx.objectStore('songs').delete(id);
      tx.objectStore('audio').delete(id);
    }
  });
}
