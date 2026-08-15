import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rateLimit';

describe('sync service rate limits', () => {
  it('rejects above the bucket limit and recovers after the fixed window', async () => {
    let now = 1000;
    const limiter = new FixedWindowRateLimiter(() => now);
    await limiter.take('pull', 'device', 2, 60_000);
    await limiter.take('pull', 'device', 2, 60_000);
    await expect(limiter.take('pull', 'device', 2, 60_000)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limit',
    });
    now += 60_000;
    await expect(limiter.take('pull', 'device', 2, 60_000)).resolves.toBeUndefined();
  });
});
