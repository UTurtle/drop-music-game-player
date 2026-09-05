import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CatalogEntry, Chart } from '../src/chart';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export class Store {
  readonly db: DatabaseSync;
  readonly cookieSecret: string;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS charts (
        chart_id TEXT NOT NULL, revision INTEGER NOT NULL, video_id TEXT NOT NULL,
        owner TEXT NOT NULL, body TEXT NOT NULL, published_at TEXT NOT NULL,
        PRIMARY KEY(chart_id, revision)
      );
      CREATE INDEX IF NOT EXISTS charts_video ON charts(video_id);
      CREATE TABLE IF NOT EXISTS requests (
        video_id TEXT NOT NULL, requester TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(video_id, requester)
      );`);
    this.db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run('cookie-secret', randomBytes(32).toString('hex'));
    this.cookieSecret = String(this.db.prepare('SELECT value FROM settings WHERE key = ?').get('cookie-secret')!.value);
  }
  close() { this.db.close(); }
  list(videoId?: string): CatalogEntry[] {
    const rows = videoId
      ? this.db.prepare('SELECT body, published_at FROM charts WHERE video_id = ? ORDER BY published_at DESC LIMIT 1000').all(videoId)
      : this.db.prepare('SELECT body, published_at FROM charts ORDER BY published_at DESC LIMIT 1000').all();
    return rows.map(row => {
      const chart = JSON.parse(String(row.body)) as Chart;
      return { chartId: chart.chartId, revision: chart.revision, videoId: chart.videoId, title: chart.title,
        difficulty: chart.difficulty, publishedAt: String(row.published_at), provenance: chart.provenance, quality: chart.quality };
    });
  }
  get(chartId: string, revision: number): Chart | null {
    const row = this.db.prepare('SELECT body FROM charts WHERE chart_id = ? AND revision = ?').get(chartId, revision);
    return row ? JSON.parse(String(row.body)) as Chart : null;
  }
  publish(chart: Chart, owner: string): { chartId: string; revision: number; publishedAt: string } {
    const current = this.db.prepare('SELECT owner, body, published_at FROM charts WHERE chart_id = ? AND revision = ?').get(chart.chartId, chart.revision);
    if (current) {
      if (current.owner === owner && current.body === JSON.stringify(chart)) return { chartId: chart.chartId, revision: chart.revision, publishedAt: String(current.published_at) };
      throw new HttpError(409, '이미 게시된 버전입니다. 새 버전 또는 새 채보로 게시해 주세요.');
    }
    const previous = this.db.prepare('SELECT owner, video_id, revision FROM charts WHERE chart_id = ? ORDER BY revision DESC LIMIT 1').get(chart.chartId);
    if (previous && (previous.owner !== owner || previous.video_id !== chart.videoId)) throw new HttpError(403, '이 채보의 새 버전을 게시할 권한이 없습니다.');
    if (previous && chart.revision <= Number(previous.revision)) throw new HttpError(409, '기존 버전보다 큰 revision을 사용해 주세요.');
    const publishedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO charts VALUES (?, ?, ?, ?, ?, ?)').run(chart.chartId, chart.revision, chart.videoId, owner, JSON.stringify(chart), publishedAt);
    return { chartId: chart.chartId, revision: chart.revision, publishedAt };
  }
  requests(videoId: string, actor: string) {
    const count = Number(this.db.prepare('SELECT COUNT(*) AS count FROM requests WHERE video_id = ?').get(videoId)!.count);
    const requested = Boolean(this.db.prepare('SELECT 1 FROM requests WHERE video_id = ? AND requester = ?').get(videoId, actor));
    return { count, requested };
  }
  request(videoId: string, actor: string) {
    this.db.prepare('INSERT OR IGNORE INTO requests VALUES (?, ?, ?)').run(videoId, actor, new Date().toISOString());
    return this.requests(videoId, actor);
  }
  unrequest(videoId: string, actor: string) {
    this.db.prepare('DELETE FROM requests WHERE video_id = ? AND requester = ?').run(videoId, actor);
    return this.requests(videoId, actor);
  }
}
