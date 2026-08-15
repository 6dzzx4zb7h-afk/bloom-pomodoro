import { SyncServiceError, type Clock } from './types';

interface Counter {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  take(bucket: string, subject: string, limit: number, windowMs: number): Promise<void>;
}

/**
 * Deterministic local/staging limiter. The Cloudflare gateway can replace this with a
 * distributed binding without changing the request contract.
 */
export class FixedWindowRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(private readonly now: Clock = Date.now) {}

  async take(bucket: string, subject: string, limit: number, windowMs: number): Promise<void> {
    const key = `${bucket.length}:${bucket}${subject}`;
    const current = this.counters.get(key);
    const now = this.now();
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;
    counter.count += 1;
    this.counters.set(key, counter);
    if (counter.count > limit) {
      throw new SyncServiceError(
        429,
        'rate_limit',
        'This request reached its temporary service limit.',
        Math.max(1, Math.ceil((counter.resetAt - now) / 1000)),
      );
    }
  }
}
