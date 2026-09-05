// Only DROP-owned model files live here. Audio and access keys are never stored.
export const MODEL_CACHE_PREFIX = 'drop-model-';
export const MODEL_CACHE = `${MODEL_CACHE_PREFIX}mapper-mini-v1`;
export const MODEL_ROOT = '/models/mapper-mini-v1/';
export interface ModelFile { name: string; bytes: number; sha256: string }
export interface ModelManifest { id: string; files: ModelFile[] }
export const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export async function getManifest(): Promise<ModelManifest> {
  const response = await fetch(`${MODEL_ROOT}manifest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Model files are not installed');
  const manifest = await response.json() as ModelManifest;
  if (manifest.id !== 'mapper-mini-v1' || !Array.isArray(manifest.files) || !manifest.files.length ||
      manifest.files.some(f => !/^[a-z0-9.-]+$/.test(f.name) || !Number.isSafeInteger(f.bytes) || f.bytes <= 0 || f.bytes > 200_000_000 || !/^[a-f0-9]{64}$/.test(f.sha256))) throw new Error('Invalid model manifest');
  return manifest;
}

export async function cacheStatus(manifest: ModelManifest): Promise<{ ready: boolean; bytes: number }> {
  if (!('caches' in globalThis)) return { ready: false, bytes: 0 };
  let bytes = 0, count = 0;
  if (!(await caches.has(MODEL_CACHE))) return { ready: false, bytes: 0 };
  const cache = await caches.open(MODEL_CACHE);
  for (const file of manifest.files) {
    const response = await cache.match(MODEL_ROOT + file.name);
    if (response?.headers.get('X-Drop-SHA256') === file.sha256 && Number(response.headers.get('Content-Length')) === file.bytes) { bytes += file.bytes; count++; }
  }
  return { ready: count === manifest.files.length, bytes };
}

export async function deleteModelCache(): Promise<void> {
  if ('caches' in globalThis) {
    for (const key of await caches.keys()) if (key.startsWith(MODEL_CACHE_PREFIX)) await caches.delete(key);
  }
}

export async function downloadModel(manifest: ModelManifest, signal: AbortSignal, progress: (bytes: number) => void): Promise<void> {
  const total = manifest.files.reduce((n, f) => n + f.bytes, 0);
  const estimate = await navigator.storage?.estimate().catch(() => null);
  if (estimate?.quota && estimate.quota - (estimate.usage ?? 0) < total * 1.2) throw new Error('QuotaExceededError');
  // Replacing a model must not accumulate old versions in the browser.
  for (const name of await caches.keys()) if (name.startsWith(MODEL_CACHE_PREFIX) && name !== MODEL_CACHE) await caches.delete(name);
  const cache = await caches.open(MODEL_CACHE);
  const wanted = new Set(manifest.files.map(file => new URL(MODEL_ROOT + file.name, location.origin).href));
  for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request);
  let loaded = 0;
  try {
    for (const file of manifest.files) {
      signal.throwIfAborted();
      const existing = await cache.match(MODEL_ROOT + file.name);
      if (existing?.headers.get('X-Drop-SHA256') === file.sha256 && Number(existing.headers.get('Content-Length')) === file.bytes) { loaded += file.bytes; progress(loaded); continue; }
      const response = await fetch(MODEL_ROOT + file.name, { signal, cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error('Download failed');
      const reader = response.body.getReader(), data = new Uint8Array(file.bytes);
      let offset = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > file.bytes) { await reader.cancel(); throw new Error('Invalid file size'); }
        data.set(value, offset); offset += value.length; progress(loaded + offset);
      }
      if (offset !== file.bytes) throw new Error('Incomplete download');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256) throw new Error('Invalid checksum');
      signal.throwIfAborted();
      await cache.put(MODEL_ROOT + file.name, new Response(data, { headers: { 'Content-Length': String(file.bytes), 'X-Drop-SHA256': hash } }));
      loaded += file.bytes;
    }
    signal.throwIfAborted();
  } catch (error) {
    await caches.delete(MODEL_CACHE); // Do not strand partially downloaded models.
    throw error;
  }
}

export async function modelBytes(name: string): Promise<ArrayBuffer> {
  const response = await (await caches.open(MODEL_CACHE)).match(MODEL_ROOT + name);
  if (!response) throw new Error('Model cache missing');
  return response.arrayBuffer();
}

export async function supportsWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(options?: { powerPreference: string }): Promise<{ isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean; architecture?: string }; features?: Set<string> } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
    return Boolean(adapter && !adapter.isFallbackAdapter && !adapter.info?.isFallbackAdapter && adapter.info?.architecture !== 'swiftshader');
  } catch { return false; }
}
