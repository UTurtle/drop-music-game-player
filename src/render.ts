import type { Chart, Lane } from './chart';
import type { Snapshot } from './engine';

type Burst = { lane: Lane; born: number };
type Effects = { hits: number; time: number; bursts: Burst[]; reduced: boolean; judged: ReadonlySet<number> };
const effects = new WeakMap<HTMLCanvasElement, Effects>();
const chartSpacing = new WeakMap<Chart, number>();
function minimumLaneSpacing(chart: Chart) {
  const cached = chartSpacing.get(chart);
  if (cached !== undefined) return cached;
  const previous: Partial<Record<Lane, number>> = {};
  let spacing = 1000;
  for (const note of chart.notes) {
    const last = previous[note.lane];
    if (last !== undefined) spacing = Math.min(spacing, note.timeMs - last);
    previous[note.lane] = note.timeMs;
  }
  chartSpacing.set(chart, spacing);
  return spacing;
}

function shape(ctx: CanvasRenderingContext2D, lane: Lane, radius: number) {
  ctx.beginPath();
  const points = lane === 'A' ? 10 : 4;
  for (let i = 0; i < points; i++) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / points;
    const r = lane === 'A' && i % 2 ? radius * .48 : radius;
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function renderNotes(canvas: HTMLCanvasElement, chart: Chart, state: Snapshot, pressed: Set<Lane>) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const hitY = height - 78;
  const centers: Record<Lane, number> = { A: width * .27, D: width * .73 };
  const colors: Record<Lane, string> = { A: '#d3fc83', D: '#b9c7ff' };
  const laneWidth = width * .42;
  // Keep dense Hard notes legible: cap the diameter by the nearest note spacing.
  const spacing = minimumLaneSpacing(chart);
  const radius = Math.max(18, Math.min(48, laneWidth * .23, spacing / 1800 * hitY * .8));
  const keyWidth = Math.min(laneWidth * .85, 360);
  let fx = effects.get(canvas);
  if (!fx) { fx = { hits: state.hits, time: state.timeMs, bursts: [], judged: state.judged, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }; effects.set(canvas, fx); }
  if (state.timeMs < fx.time || state.hits < fx.hits) fx.bursts = [];
  if (state.hits > fx.hits && !fx.reduced) {
    // Newly judged notes close to the current clock identify successful hits, even after keyup.
    chart.notes.forEach((note, index) => {
      if (state.judged.has(index) && !fx.judged.has(index) && Math.abs(note.timeMs + chart.offsetMs - state.timeMs) <= 140) fx.bursts.push({ lane: note.lane, born: state.timeMs });
    });
  }
  fx.hits = state.hits; fx.time = state.timeMs; fx.judged = state.judged;
  fx.bursts = fx.bursts.filter(burst => state.timeMs - burst.born < 420).slice(-8);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#171c1a'; ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;
  for (const lane of ['A', 'D'] as const) {
    const x = centers[lane];
    ctx.fillStyle = '#202824'; ctx.fillRect(x - laneWidth / 2, 0, laneWidth, height);
    ctx.strokeStyle = '#3d4a41'; ctx.setLineDash([3, 13]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hitY); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#6e8073'; ctx.beginPath(); ctx.moveTo(25, hitY); ctx.lineTo(width - 25, hitY); ctx.stroke();
  chart.notes.forEach((note, i) => {
    if (state.judged.has(i)) return;
    const delta = note.timeMs + chart.offsetMs - state.timeMs;
    if (delta > 1800 || delta < -180) return;
    const y = hitY - delta / 1800 * hitY;
    const color = colors[note.lane];
    ctx.save(); ctx.translate(centers[note.lane], y);
    if (!fx.reduced) {
      for (let tail = 3; tail > 0; tail--) {
        ctx.globalAlpha = .07 * (4 - tail); ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0, -radius - tail * 13, Math.max(2, radius * .13 - tail), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.rotate(Math.sin(state.timeMs / 750 + i * 1.7) * .14);
    }
    ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.fillStyle = color; shape(ctx, note.lane, radius); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#f7ffe7'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = .45; ctx.strokeStyle = '#344438'; ctx.lineWidth = 1.5;
    shape(ctx, note.lane, radius * .65); ctx.stroke(); ctx.restore();
  });
  for (const lane of ['A', 'D'] as const) {
    const x = centers[lane], color = colors[lane];
    ctx.save(); ctx.fillStyle = pressed.has(lane) ? color : '#171c1a';
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (pressed.has(lane)) { ctx.shadowColor = color; ctx.shadowBlur = 20; }
    ctx.beginPath(); ctx.roundRect(x - keyWidth / 2, hitY - 30, keyWidth, 60, 12); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = pressed.has(lane) ? '#171c1a' : color;
    ctx.font = `700 ${width < 500 ? 23 : 32}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(lane === 'A' ? 'A  ←  Z' : 'D  →  X', x, hitY + 11); ctx.restore();
  }
  for (const burst of fx.bursts) {
    const age = (state.timeMs - burst.born) / 420;
    ctx.save(); ctx.globalAlpha = (1 - age) * .85; ctx.strokeStyle = colors[burst.lane]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(centers[burst.lane], hitY, 24 + age * 70, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      ctx.save(); ctx.translate(centers[burst.lane] + Math.cos(angle) * (25 + age * 85), hitY + Math.sin(angle) * (25 + age * 70));
      ctx.rotate(angle + age); ctx.fillStyle = colors[burst.lane]; shape(ctx, burst.lane, 5 * (1 - age) + 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#a5b3a9'; ctx.font = '12px system-ui'; ctx.fillText('HIT THE LINE', 25, height - 17);
  ctx.textAlign = 'right'; ctx.fillText(state.practice ? 'PRACTICE · SEEK USED' : 'TWO KEYS. ONE SONG.', width - 25, height - 17);
}
