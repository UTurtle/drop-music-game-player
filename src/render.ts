import type { Chart, Lane } from './chart';
import type { Snapshot, Judgment } from './engine';
import { judgmentStyle } from './judgmentEffects';

type Burst = Judgment & { born: number };
type Effects = { lastId: number; time: number; bursts: Burst[]; reduced: boolean };
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

export function getPlayfieldLayout(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const vertical = matchMedia('(max-width: 850px) and (orientation: portrait)').matches;
  const target = vertical ? height - 78 : Math.max(76, Math.min(150, width * .12));
  const centers: Record<Lane, { x: number; y: number }> = vertical
    ? { A: { x: width * .27, y: target }, D: { x: width * .73, y: target } }
    : { A: { x: target, y: height * .29 }, D: { x: target, y: height * .70 } };
  return { vertical, centers, target, travel: vertical ? target : width - target, band: vertical ? width * .42 : height * .36 };
}

export function renderNotes(canvas: HTMLCanvasElement, chart: Chart, state: Snapshot, pressed: Set<Lane>) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { vertical, centers, target, travel, band } = getPlayfieldLayout(canvas);
  const colors: Record<Lane, string> = { A: '#d3fc83', D: '#b9c7ff' };
  // Keep dense Hard notes legible: cap the diameter by the nearest note spacing.
  const spacing = minimumLaneSpacing(chart);
  const radius = Math.max(18, Math.min(48, band * .32, spacing / 1800 * travel * .8));
  let fx = effects.get(canvas);
  if (!fx) { fx = { lastId: 0, time: state.timeMs, bursts: [], reduced: false }; effects.set(canvas, fx); }
  fx.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (state.timeMs < fx.time || state.feedback.length === 0) { fx.bursts = []; fx.lastId = 0; }
  const now = performance.now();
  for (const event of state.feedback) {
    if (event.id > fx.lastId && state.timeMs - event.timeMs < 520) fx.bursts.push({ ...event, born: now });
    fx.lastId = Math.max(fx.lastId, event.id);
  }
  fx.time = state.timeMs;
  const elapsed = (burst: Burst) => Math.max(now - burst.born, state.timeMs - burst.timeMs);
  fx.bursts = fx.bursts.filter(burst => elapsed(burst) < judgmentStyle(burst.verdict).duration).slice(-8);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#07090b'; ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;
  for (const lane of ['A', 'D'] as const) {
    const { x, y } = centers[lane];
    ctx.fillStyle = '#11161a';
    if (vertical) ctx.fillRect(x - band / 2, 0, band, height);
    else ctx.fillRect(0, y - band / 2, width, band);
    ctx.strokeStyle = '#303b3d'; ctx.setLineDash([3, 13]); ctx.beginPath();
    if (vertical) { ctx.moveTo(x, 0); ctx.lineTo(x, target); }
    else { ctx.moveTo(target, y); ctx.lineTo(width, y); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#6e8073'; ctx.beginPath();
  if (vertical) { ctx.moveTo(25, target); ctx.lineTo(width - 25, target); }
  else { ctx.moveTo(target, 20); ctx.lineTo(target, height - 40); }
  ctx.stroke();
  // Receptors use exactly the same center, outline and orientation as falling notes.
  // Draw them first so an on-time note remains visible instead of hiding behind a key label.
  for (const lane of ['A', 'D'] as const) {
    ctx.save(); ctx.translate(centers[lane].x, centers[lane].y);
    ctx.strokeStyle = colors[lane]; ctx.lineWidth = 3;
    ctx.fillStyle = pressed.has(lane) ? '#26362e' : '#080c0f';
    shape(ctx, lane, radius); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  chart.notes.forEach((note, i) => {
    if (state.judged.has(i)) return;
    const delta = note.timeMs + chart.offsetMs - state.timeMs;
    if (delta > 1800 || delta < -180) return;
    const center = centers[note.lane];
    const x = vertical ? center.x : center.x + delta / 1800 * travel;
    const y = vertical ? center.y - delta / 1800 * travel : center.y;
    const color = colors[note.lane];
    ctx.save(); ctx.translate(x, y);
    if (!fx.reduced) {
      for (let tail = 3; tail > 0; tail--) {
        ctx.globalAlpha = .07 * (4 - tail); ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(vertical ? 0 : radius + tail * 13, vertical ? -radius - tail * 13 : 0, Math.max(2, radius * .13 - tail), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = color; ctx.shadowBlur = 5;
    ctx.fillStyle = color; shape(ctx, note.lane, radius); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#f7ffe7'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = .45; ctx.strokeStyle = '#344438'; ctx.lineWidth = 1.5;
    shape(ctx, note.lane, radius * .65); ctx.stroke(); ctx.restore();
  });
  for (const burst of fx.bursts) {
    const style = judgmentStyle(burst.verdict, fx.reduced), age = elapsed(burst) / style.duration;
    const center = centers[burst.lane];
    const effectReach = Math.max(radius, Math.min(center.x - 8, width - center.x - 8, center.y - 8, height - center.y - 30, vertical ? band * .65 : band * .6));
    ctx.save(); ctx.globalAlpha = (1 - age) * .95; ctx.strokeStyle = style.color; ctx.lineWidth = 2;
    for (let ring = 0; ring < style.rings; ring++) {
      ctx.beginPath(); ctx.arc(center.x, center.y, Math.min(effectReach, radius * (.7 + ring * .35) + age * 65 * style.scale), 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < style.particles; i++) {
      const angle = i * Math.PI * 2 / style.particles, reach = Math.min(effectReach, radius + age * 90 * style.scale);
      ctx.save(); ctx.translate(center.x + Math.cos(angle) * reach, center.y + Math.sin(angle) * reach);
      ctx.rotate(angle + age); ctx.fillStyle = style.color; shape(ctx, burst.lane, (5 * (1 - age) + 1) * style.scale); ctx.fill(); ctx.restore();
    }
    // Only the newest label per lane: fast streams remain readable, not stacked words.
    if (!fx.bursts.some(other => other.lane === burst.lane && other.id > burst.id)) {
      ctx.textAlign = 'center'; ctx.font = `${burst.verdict === 'PERFECT' ? 800 : 600} ${vertical ? 13 : 15}px system-ui`;
      ctx.fillStyle = style.color; ctx.fillText(style.label, center.x, Math.max(17, center.y - radius - 18 - (fx.reduced ? 0 : age * 9)));
    }
    ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#a5b3a9'; ctx.font = '12px system-ui'; ctx.fillText('HIT THE LINE', 25, height - 17);
  ctx.textAlign = 'right'; ctx.fillText(state.practice ? 'PRACTICE · SEEK USED' : 'TWO KEYS. ONE SONG.', width - 25, height - 17);
}
