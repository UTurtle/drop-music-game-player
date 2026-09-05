import { expandModel } from './modelPrecision';
import { limitNormalNotes, modelRatings } from './difficulties';
import * as ort from 'onnxruntime-web/webgpu';
import { modelBytes, MODEL_ROOT } from './modelCache';
import { classTokens, contextTokens, groupsToNotes, melSpectrogram, MODEL_SAMPLES, STRIDE_SAMPLES, tokenGroups, WINDOW_MS, type Frontend, type TokenGroup } from './browserModelCore';

const int = (values: number[], dims: number[]) => new ort.Tensor('int64', BigInt64Array.from(values, BigInt), dims);
const release = (values: Record<string, ort.Tensor>) => { for (const tensor of Object.values(values)) tensor.dispose(); };

self.onmessage = async (event: MessageEvent<{ pcm: Float32Array; includeHard?: boolean }>) => {
  let encoder: ort.InferenceSession | undefined, decoder: ort.InferenceSession | undefined;
  try {
    ort.env.webgpu.powerPreference = 'high-performance';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL(MODEL_ROOT, self.location.origin).href;
    ort.env.wasm.wasmBinary = await modelBytes('ort-wasm-simd-threaded.asyncify.wasm');
    const frontend = JSON.parse(new TextDecoder().decode(await modelBytes('frontend.json'))) as Frontend;
    encoder = await ort.InferenceSession.create(expandModel(await modelBytes('encoder-fp16.onnx')), { executionProviders: ['webgpu'], preferredOutputLocation: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`cross_${i}`, 'gpu-buffer' as const])) });
    decoder = await ort.InferenceSession.create(expandModel(await modelBytes('decoder-fp16.onnx')), { executionProviders: ['webgpu'], preferredOutputLocation: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`present_${i}`, 'gpu-buffer' as const])) });
    const pcm = event.data.pcm;
    let peak = 0; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
    if (peak < 1e-6) throw new Error('Silent audio');
    for (let i = 0; i < pcm.length; i++) pcm[i] /= peak;
    const durationMs = Math.round(pcm.length / 16);
    const windows = Math.max(1, Math.ceil((pcm.length - MODEL_SAMPLES) / STRIDE_SAMPLES) + 1);
    const ratings = modelRatings(Boolean(event.data.includeHard));
    const maps: TokenGroup[][] = ratings.map(() => []), timing: TokenGroup[] = [];
    let tokenCounter = 0;

    async function generate(prompt: number[], cross: Record<string, ort.Tensor>, stop: number, minTime: number): Promise<number[]> {
      let past: Record<string, ort.Tensor> = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`past_${i}`, new ort.Tensor('float32', new Float32Array(0), [1, 8, 0, 64])]));
      let length = 0, next = prompt;
      const generated: number[] = [];
      try {
        for (let step = 0; step < 1800 && length + next.length < 2500; step++) {
          const total = length + next.length, mask = new Float32Array(next.length * total);
          for (let q = 0; q < next.length; q++) for (let k = length + q + 1; k < total; k++) mask[q * total + k] = -1e4;
          const inputs = { tokens: int(next, [1, next.length]), positions: int(next.map((_, i) => length + i), [next.length]), mask: new ort.Tensor('float32', mask, [1, 1, next.length, total]) };
          const output = await decoder!.run({ ...inputs, ...past, ...cross });
          release(inputs); release(past);
          past = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`past_${i}`, output[`present_${i}`]]));
          const scores = output.logits.data as Float32Array;
          let best = -Infinity, token = 2;
          // Greedy decoding is deterministic. Mask only previous-window timestamps, as upstream lookback does.
          for (let i = 2; i < scores.length; i++) {
            if (i >= 9 && i < 1647 && (i - 9) * 10 < minTime) continue;
            if (scores[i] > best) { best = scores[i]; token = i; }
          }
          output.logits.dispose();
          if (!Number.isFinite(best)) throw new Error('Non-finite model output');
          if (token === stop || token === 2) return generated;
          generated.push(token); length = total; next = [token];
          if (++tokenCounter % 80 === 0) self.postMessage({ type: 'tokens', count: tokenCounter });
        }
        throw new Error('Model token limit reached');
      } finally { release(past); }
    }

    for (let window = 0; window < windows; window++) {
      const sample = window * STRIDE_SAMPLES, start = sample / 16;
      const end = window === windows - 1 ? Infinity : start + WINDOW_MS * .8;
      const mel = new ort.Tensor('float32', melSpectrogram(pcm, sample, frontend.mel), [1, 128, 2048]);
      const encoded = { ...await encoder.run({ mel }) }; mel.dispose(); encoded.hidden.dispose(); delete encoded.hidden;
      try {
        const previousTiming = contextTokens(timing, start);
        const minTime = window ? WINDOW_MS * .2 : 0;
        const timingTokens = await generate([...classTokens(frontend, 3.5, durationMs, start), 1, 3, ...previousTiming], encoded, 4, minTime);
        const newTiming = tokenGroups(timingTokens, start);
        const timingContext = [...previousTiming, ...timingTokens];
        timing.push(...newTiming.filter(g => g.timeMs < end));
        for (let level = 0; level < ratings.length; level++) {
          const previous = contextTokens(maps[level], start);
          const prompt = [...classTokens(frontend, ratings[level], durationMs, start), 1, 3, ...timingContext, 4, 5, ...previous];
          const tokens = await generate(prompt, encoded, 6, minTime);
          maps[level].push(...tokenGroups(tokens, start).filter(g => g.timeMs < end));
          self.postMessage({ type: 'progress', percent: Math.round(10 + 88 * (window * ratings.length + level + 1) / (windows * ratings.length)) });
        }
      } finally { release(encoded); }
    }
    let easy = groupsToNotes(maps[0], durationMs);
    const rawNormal = groupsToNotes(maps[1], durationMs);
    const normal = limitNormalNotes(rawNormal);
    const hard = maps[2] ? groupsToNotes(maps[2], durationMs) : [];
    // Very low difficulty can produce only rolls, which this two-key game does not support.
    // Keep the model's timings and colors when deriving a playable Easy from Normal.
    if (!easy.length && normal.length) {
      let last = -Infinity;
      easy = normal.filter(note => { if (note.timeMs - last < 600) return false; last = note.timeMs; return true; });
    }
    if (!easy.length || !normal.length || (event.data.includeHard && !hard.length) || easy.length > 10000 || normal.length > 10000 || hard.length > 10000) throw new Error('No playable model chart');
    const beats = timing.filter(g => g.tokens.includes(4081) || g.tokens.includes(4082)).map(g => g.timeMs);
    const intervals = beats.slice(1).map((beat, i) => beat - beats[i]).filter(n => n >= 250 && n <= 1200).sort((a, b) => a - b);
    const tempoBpm = intervals.length ? Math.round(60000 / intervals[Math.floor(intervals.length / 2)]) : 120;
    self.postMessage({ type: 'result', result: { generator: 'mapperatorinator-mini-fp16-webgpu-v2', durationMs, tempoBpm, easy, normal, hard } });
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  finally { await decoder?.release(); await encoder?.release(); }
};
