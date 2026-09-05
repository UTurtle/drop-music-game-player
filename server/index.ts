import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.DROP_PORT ?? 51100);
const host = process.env.DROP_HOST ?? '127.0.0.1';
const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
const dist = resolve(root, 'dist');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  if (production) response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; worker-src 'self'; style-src 'self' 'unsafe-inline'; frame-src https://www.youtube.com; img-src 'self' data: https://i.ytimg.com; media-src 'self' blob:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  if (request.url?.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && request.url === '/api/health') { response.end(JSON.stringify({ ok: true, mode: 'local' })); return; }
    if (request.method === 'GET' && request.url === '/api/charts') { response.end('[]'); return; }
    response.writeHead(request.method === 'POST' ? 403 : 404);
    response.end(JSON.stringify({ error: 'Public publishing and uploads are not available.' })); return;
  }
  if (vite) { vite.middlewares(request, response); return; }
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname);
    const isPage = path === '/' || path === '/create' || path === '/practice' || path === '/privacy' || /^\/play\/[a-z0-9-]+$/.test(path);
    const target = isPage ? resolve(dist, 'index.html') : resolve(dist, '.' + path);
    if (!target.startsWith(dist + sep) || !(await stat(target)).isFile()) throw new Error('not found');
    response.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream');
    response.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (request.method === 'HEAD') response.end(); else createReadStream(target).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => console.log(`DROP: http://${host}:${port}`));
async function shutdown() { server.close(); server.closeAllConnections(); await vite?.close(); }
process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
