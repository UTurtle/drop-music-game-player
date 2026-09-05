import { analyzeLocalFile, decodeLocalFile } from './localAudio';
import { cacheStatus, getManifest, supportsWebGPU } from './modelCache';
import { t } from './i18n';
import type { Analysis } from './dsp';

async function analyzeBrowserModel(file: File, signal: AbortSignal, progress: (value: number) => void, includeHard: boolean): Promise<Analysis> {
  const pcm = await decodeLocalFile(file, signal, progress, 16000);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./browserModel.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timeout); worker.terminate(); signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException('Canceled', 'AbortError')); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Model timed out')); }, 15 * 60_000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = event => {
      if (event.data.type === 'progress') progress(event.data.percent);
      else if (event.data.type === 'result') { cleanup(); progress(100); resolve(event.data.result); }
      else if (event.data.type === 'error') { cleanup(); reject(new Error(event.data.message)); }
    };
    worker.onerror = event => { cleanup(); reject(new Error(event.message)); };
    worker.postMessage({ pcm, includeHard }, [pcm.buffer]);
  });
}

export async function analyzeAutoFile(file: File, signal: AbortSignal, progress: (value: number) => void, message: (value: string) => void, allowModel = false, includeHard = false): Promise<Analysis> {
  if (allowModel) {
    try {
      if (!(await supportsWebGPU()) || !(await cacheStatus(await getManifest())).ready) throw new Error('Model unavailable');
      signal.throwIfAborted();
      message(t('이 기기에서 AI 채보를 만들고 있습니다. 음악 파일은 전송하지 않습니다.', 'Creating an AI chart on this device. Your audio is not sent.'));
      return await analyzeBrowserModel(file, signal, progress, includeHard);
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn('Browser model unavailable:', error);
      message(t('AI 생성을 완료하지 못해 기본 분석으로 이어갑니다. 음악 파일은 전송하지 않습니다.', 'AI generation could not finish. Continuing with basic analysis. Your audio is not sent.'));
    }
  } else message(t('브라우저에서 채보를 만들고 있습니다. 파일은 전송하지 않습니다.', 'Creating the chart in your browser. No audio is sent.'));
  return analyzeLocalFile(file, signal, progress, includeHard);
}
