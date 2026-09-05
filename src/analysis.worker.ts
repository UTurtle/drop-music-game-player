import { analyzePcm } from './dsp';
self.onmessage = (event: MessageEvent<{ pcm: Float32Array; sampleRate: number }>) => {
  try {
    const result = analyzePcm(event.data.pcm, event.data.sampleRate, percent => self.postMessage({ type: 'progress', percent }));
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '분석하지 못했습니다.' }); }
};
