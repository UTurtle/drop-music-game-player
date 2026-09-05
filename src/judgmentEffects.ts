import type { Judgment } from './engine';

export function judgmentStyle(verdict: Judgment['verdict'], reduced = false) {
  const styles = {
    PERFECT: { label: 'PERFECT', color: '#efffc9', particles: 16, rings: 2, duration: 520, scale: 1.2 },
    GOOD: { label: 'GOOD', color: '#a4d2bc', particles: 5, rings: 1, duration: 340, scale: .65 },
    OK: { label: 'OK', color: '#9ba69f', particles: 0, rings: 0, duration: 230, scale: 0 },
    MISS: { label: 'MISS', color: '#e5a393', particles: 0, rings: 0, duration: 300, scale: 0 },
    EMPTY: { label: '−1,000', color: '#b8a7a2', particles: 0, rings: 0, duration: 250, scale: 0 },
  };
  const style = styles[verdict];
  return reduced ? { ...style, particles: 0, rings: 0, scale: 0 } : style;
}
