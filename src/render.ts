import type { Chart, Lane } from './chart';
import type { Snapshot } from './engine';
export function renderNotes(canvas: HTMLCanvasElement, chart: Chart, state: Snapshot, pressed: Set<Lane>) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#171c1a'; ctx.fillRect(0, 0, width, height);
  const hitY = height - 78;
  const left = width * 0.27;
  const right = width * 0.73;
  const laneWidth = width * 0.42;
  const noteWidth = Math.min(laneWidth * 0.78, 320);
  const keyWidth = Math.min(laneWidth * 0.85, 360);
  ctx.lineWidth = 1;
  [left, right].forEach(x => {
    ctx.fillStyle = '#202824'; ctx.fillRect(x - laneWidth / 2, 0, laneWidth, height);
    ctx.strokeStyle = '#354139'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hitY); ctx.stroke();
  });
  ctx.strokeStyle = '#6e8073'; ctx.beginPath(); ctx.moveTo(25, hitY); ctx.lineTo(width - 25, hitY); ctx.stroke();
  chart.notes.forEach((note, i) => {
    if (state.judged.has(i)) return;
    const delta = note.timeMs + chart.offsetMs - state.timeMs;
    if (delta > 1800 || delta < -180) return;
    const y = hitY - delta / 1800 * hitY;
    ctx.fillStyle = note.lane === 'A' ? '#d3fc83' : '#b9c7ff';
    ctx.beginPath(); ctx.roundRect((note.lane === 'A' ? left : right) - noteWidth / 2, y - 12, noteWidth, 24, 8); ctx.fill();
  });
  (['A', 'D'] as const).forEach((lane, index) => {
    const x = index ? right : left;
    const color = index ? '#b9c7ff' : '#d3fc83';
    ctx.fillStyle = pressed.has(lane) ? color : '#171c1a';
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - keyWidth / 2, hitY - 30, keyWidth, 60, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pressed.has(lane) ? '#171c1a' : color;
    ctx.font = `700 ${width < 500 ? 23 : 32}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(index ? 'D  →  X' : 'A  ←  Z', x, hitY + 11);
  });
  ctx.textAlign = 'left'; ctx.fillStyle = '#a5b3a9'; ctx.font = '12px system-ui';
  ctx.fillText('HIT THE LINE', 25, height - 17);
  ctx.textAlign = 'right'; ctx.fillText(state.practice ? 'PRACTICE · SEEK USED' : 'TWO KEYS. ONE SONG.', width - 25, height - 17);
}
