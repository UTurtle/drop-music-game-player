import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { chartIdPattern, videoPattern } from '../src/chart';
import { HttpError, Store } from './store';

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, '채보 JSON만 받을 수 있습니다. 오디오 업로드는 지원하지 않습니다.');
  if (Number(request.headers['content-length'] ?? 0) > limit) throw new HttpError(413, '요청 크기가 너무 큽니다.');
  const parts: Buffer[] = []; let length = 0;
  for await (const part of request) {
    length += part.length;
    if (length > limit) throw new HttpError(413, '요청 크기가 너무 큽니다.');
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new HttpError(400, '유효한 JSON을 보내 주세요.'); }
}
function actor(request: IncomingMessage, response: ServerResponse, secret: string, secure: boolean): string {
  const raw = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('drop_session='))?.slice(13);
  const sign = (id: string) => createHmac('sha256', secret).update(id).digest('base64url');
  let id: string;
  const [candidate = '', signature = ''] = raw?.split('.') ?? [];
  if (/^[a-f0-9-]{36}$/.test(candidate) && /^[A-Za-z0-9_-]{43}$/.test(signature) && timingSafeEqual(Buffer.from(signature), Buffer.from(sign(candidate)))) id = candidate;
  else {
    id = randomUUID();
    response.setHeader('Set-Cookie', `drop_session=${id}.${sign(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=15552000${secure ? '; Secure' : ''}`);
  }
  return createHash('sha256').update(id).digest('hex');
}
function onlyKeys(object: unknown, allowed: string[]): object is Record<string, unknown> {
  return typeof object === 'object' && object !== null && !Array.isArray(object) && Object.keys(object).every(key => allowed.includes(key));
}

export function createApi(store: Store, options: { origin?: string; rateLimit?: number } = {}) {
  const rates = new Map<string, { count: number; until: number }>();
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? '/', 'http://local');
      const path = url.pathname;
      const method = request.method ?? 'GET';
      const port = request.socket.localPort;
      const origins = options.origin ? [options.origin] : [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      const mutation = ['POST', 'DELETE'].includes(method);
      if (mutation && (!origins.includes(request.headers.origin ?? '') || request.headers['sec-fetch-site'] === 'cross-site')) throw new HttpError(403, '같은 사이트에서 요청해 주세요.');
      const key = `${request.socket.remoteAddress}:${mutation ? 'write' : 'read'}`;
      const now = Date.now();
      for (const [address, item] of rates) if (item.until <= now) rates.delete(address);
      const rate = rates.get(key) ?? { count: 0, until: now + 60_000 };
      rate.count++; rates.set(key, rate);
      if (rate.count > (options.rateLimit ?? (mutation ? 30 : 300))) { response.setHeader('Retry-After', '60'); throw new HttpError(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.'); }
      if (method === 'GET' && path === '/api/health') { json(response, 200, { ok: true }); return; }
      if (method === 'GET' && path === '/api/charts') {
        const videoId = url.searchParams.get('videoId') ?? undefined;
        if (videoId && !videoPattern.test(videoId)) throw new HttpError(400, '영상 ID가 올바르지 않습니다.');
        json(response, 200, store.list(videoId)); return;
      }
      const chartRoute = path.match(/^\/api\/charts\/([a-z0-9-]+)\/revisions\/(\d+)$/);
      if (chartRoute && method === 'GET') {
        const [, id, revision] = chartRoute;
        if (!chartIdPattern.test(id) || !/^[1-9]\d{0,6}$/.test(revision) || Number(revision) > 1_000_000) throw new HttpError(400, '채보 링크가 올바르지 않습니다.');
        const chart = store.get(id, Number(revision));
        if (!chart) throw new HttpError(404, '공개된 채보를 찾을 수 없습니다.');
        json(response, 200, chart); return;
      }
      const requestRoute = path.match(/^\/api\/requests\/([A-Za-z0-9_-]{11})$/);
      if (requestRoute && ['GET', 'POST', 'DELETE'].includes(method)) {
        if (mutation) {
          const body = await readJson(request, 1024);
          if (!onlyKeys(body, [])) throw new HttpError(400, '맵 요청에는 파일이나 추가 데이터를 보내지 마세요.');
        }
        const owner = actor(request, response, store.cookieSecret, options.origin?.startsWith('https:') ?? false);
        const videoId = requestRoute[1];
        const result = method === 'POST' ? store.request(videoId, owner) : method === 'DELETE' ? store.unrequest(videoId, owner) : store.requests(videoId, owner);
        json(response, 200, result); return;
      }
      if (path === '/api/charts' && method === 'POST') {
        throw new HttpError(403, '공개 게시는 현재 제공하지 않습니다. 음악 파일로 개인 플레이를 이용해 주세요.');
      }
      throw new HttpError(404, '요청한 API를 찾을 수 없습니다.');
    } catch (error) {
      if (!response.headersSent && !response.destroyed) json(response, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : '서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      request.resume();
    }
  };
}
