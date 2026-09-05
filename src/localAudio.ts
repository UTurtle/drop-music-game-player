import { t } from './i18n';
import { SAMPLE_RATE, type Analysis } from './dsp';
export const MAX_AUDIO_BYTES = 50_000_000;

function checkCanceled(signal: AbortSignal) { if (signal.aborted) throw new DOMException(t("분석을 취소했습니다."), 'AbortError'); }

function localDuration(file: File, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); };
    const cancel = () => { cleanup(); reject(new DOMException(t("취소됨"), 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(t("음원 정보를 읽지 못했습니다. WAV/MP3 파일을 확인해 주세요."))); }, 15_000);
    audio.onloadedmetadata = () => { const duration = audio.duration; cleanup(); resolve(duration); };
    audio.onerror = () => { cleanup(); reject(new Error(t("이 브라우저에서 읽을 수 없는 파일입니다. WAV 또는 MP3를 선택해 주세요."))); };
    signal.addEventListener('abort', cancel, { once: true });
    audio.preload = 'metadata'; audio.src = url;
  });
}

export async function analyzeLocalFile(file: File, signal: AbortSignal, onProgress: (value: number) => void): Promise<Analysis> {
  if (!/\.(wav|mp3|flac)$/i.test(file.name) || !file.size || file.size > MAX_AUDIO_BYTES) throw new Error(t("50 MB 이하의 WAV/MP3/FLAC 파일을 선택해 주세요."));
  checkCanceled(signal); onProgress(1);
  const duration = await localDuration(file, signal);
  if (!Number.isFinite(duration) || duration < 1 || duration > 600) throw new Error(t("1초~10분 길이의 음원을 선택해 주세요."));
  checkCanceled(signal);
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  let decoded: AudioBuffer;
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error(t("음원을 디코딩하지 못했습니다. PCM WAV 또는 다른 MP3 파일을 선택해 주세요.")); }
  checkCanceled(signal);
  if (decoded.duration > 600) throw new Error(t("음원은 최대 10분까지 지원합니다."));
  const pcm = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const source = decoded.getChannelData(channel);
    for (let i = 0; i < pcm.length; i++) pcm[i] += source[i] / decoded.numberOfChannels;
  }
  onProgress(8);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException(t("분석을 취소했습니다."), 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = event => {
      if (event.data.type === 'progress') onProgress(event.data.percent);
      else if (event.data.type === 'result') { cleanup(); resolve(event.data.result as Analysis); }
      else { cleanup(); reject(new Error(event.data.message)); }
    };
    worker.onerror = () => { cleanup(); reject(new Error(t("분석 작업을 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요."))); };
    worker.postMessage({ pcm, sampleRate: SAMPLE_RATE }, [pcm.buffer]);
  });
}
