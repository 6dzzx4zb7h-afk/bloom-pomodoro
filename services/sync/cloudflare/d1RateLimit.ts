import type { RateLimiter } from '../rateLimit';
import { SyncServiceError, type Clock } from '../types';
import type { D1Database } from './types';

export class D1RateLimiter implements RateLimiter {
  constructor(
    private readonly database: D1Database,
    private readonly now: Clock = Date.now,
  ) {}

  async take(bucket: string, subject: string, limit: number, windowMs: number): Promise<void> {
    const now = this.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `${bucket.length}:${bucket}${subject}`;
    await this.database.prepare(
      `INSERT INTO rate_limits (bucket_key, window_start, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket_key, window_start)
       DO UPDATE SET request_count = request_count + 1`,
    ).bind(key, windowStart).run();
    const row = await this.database.prepare(
      'SELECT request_count FROM rate_limits WHERE bucket_key = ? AND window_start = ?',
    ).bind(key, windowStart).first<{ request_count: number }>();
    if ((row?.request_count ?? 0) > limit) {
      throw new SyncServiceError(
        429,
        'rate_limit',
        'This request reached its temporary service limit.',
        Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
      );
    }
    if (Math.random() < 0.01) {
      await this.database.prepare(
        'DELETE FROM rate_limits WHERE window_start < ?',
      ).bind(now - 24 * 60 * 60_000).run();
    }
  }
}
