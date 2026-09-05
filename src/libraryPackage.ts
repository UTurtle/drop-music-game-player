// Chart-only containers. Different magic prevents accepting legacy audio archives.
import { readSongPackage } from './songPackage';
export const MAX_LIBRARY_BYTES = 32_000_000;
export const MAX_LIBRARY_SONGS = 100;
const MAGIC = 'DROPCHT1';
const fail = () => new Error('Invalid chart collection (maximum 100 charts / 32 MB).');
export async function createLibraryPackage(songs: Blob[]): Promise<Blob> {
  if (!songs.length || songs.length > MAX_LIBRARY_SONGS) throw fail();
  const header = new Uint8Array(12 + 4 * songs.length);
  header.set(new TextEncoder().encode(MAGIC));
  const view = new DataView(header.buffer); view.setUint32(8, songs.length, true);
  songs.forEach((song, i) => { if (!song.size || song.size > 4_000_000) throw fail(); view.setUint32(12 + i * 4, song.size, true); });
  if (header.length + songs.reduce((sum, song) => sum + song.size, 0) > MAX_LIBRARY_BYTES) throw fail();
  for (const song of songs) await readSongPackage(song);
  return new Blob([header, ...songs], { type: 'application/octet-stream' });
}
export async function readLibraryPackage(blob: Blob): Promise<Blob[]> {
  if (blob.size < 16 || blob.size > MAX_LIBRARY_BYTES) throw fail();
  const first = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(first.slice(0, 8)) !== MAGIC) throw fail();
  const count = new DataView(first.buffer).getUint32(8, true);
  if (!count || count > MAX_LIBRARY_SONGS || blob.size < 12 + count * 4) throw fail();
  const lengths = new DataView(await blob.slice(12, 12 + count * 4).arrayBuffer());
  let offset = 12 + count * 4;
  const songs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const size = lengths.getUint32(i * 4, true);
    if (size < 13 || size > 4_000_000 || offset + size > blob.size) throw fail();
    songs.push(blob.slice(offset, offset + size)); offset += size;
  }
  if (offset !== blob.size) throw fail();
  return songs;
}
