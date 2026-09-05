import type { Note } from '../src/chart';

/** Preserve generated timing and don/kat intent. Rolls/spinners are omitted until supported. */
export function taikoNotes(text: string, durationMs: number): Note[] {
  if (!/^Mode\s*:\s*1\s*$/m.test(text)) throw new Error('Expected taiko chart');
  const section = text.split('[HitObjects]')[1]?.split(/\n\[/)[0];
  if (!section) throw new Error('Missing notes');
  const result: Note[] = [];
  for (const line of section.trim().split(/\r?\n/)) {
    const fields = line.split(',');
    if (fields.length < 5) continue;
    const timeMs = Number(fields[2]), type = Number(fields[3]), sound = Number(fields[4]);
    if (!Number.isInteger(timeMs) || !Number.isInteger(type) || !Number.isInteger(sound)) throw new Error('Invalid note');
    if (!(type & 1) || timeMs < 0 || timeMs >= durationMs) continue;
    result.push({ timeMs, lane: sound & (2 | 8) ? 'D' : 'A' });
  }
  result.sort((a, b) => a.timeMs - b.timeMs);
  const unique = result.filter((note, i) => !i || note.timeMs !== result[i - 1].timeMs);
  if (!unique.length || unique.length > 10000) throw new Error('Unsupported chart');
  return unique;
}
