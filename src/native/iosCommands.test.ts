import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PLAN 13.18 — the adapter is the boundary where an untrusted native payload
 * becomes something the reducer may act on. Every test here is about refusing
 * to act on something malformed rather than coercing it into a timer change.
 */
const drain = vi.fn();
const acknowledge = vi.fn();
const clear = vi.fn();
let platform = 'ios';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform },
  registerPlugin: () => ({ drain, acknowledge, clear }),
}));

const {
  acknowledgeIOSCommands,
  clearIOSCommands,
  drainIOSCommands,
  isIOSCommandPlatform,
} = await import('./iosCommands');

const command = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  kind: 'pause',
  sessionId: 's1',
  occurredAt: 1_700_000_000_000,
  ...over,
});

beforeEach(() => {
  platform = 'ios';
  drain.mockReset();
  acknowledge.mockReset();
  clear.mockReset();
});

describe('platform gate', () => {
  it('does nothing off iOS', async () => {
    platform = 'web';
    expect(isIOSCommandPlatform()).toBe(false);
    expect(await drainIOSCommands()).toEqual([]);
    await acknowledgeIOSCommands(['c1']);
    await clearIOSCommands();
    expect(drain).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('drainIOSCommands', () => {
  it('returns well-formed commands oldest first', async () => {
    drain.mockResolvedValue({
      commands: [
        command({ id: 'newer', kind: 'resume', occurredAt: 2_000 }),
        command({ id: 'older', kind: 'pause', occurredAt: 1_000 }),
      ],
    });
    expect((await drainIOSCommands()).map((c) => c.id)).toEqual(['older', 'newer']);
  });

  it.each([
    ['a missing id', { id: '' }],
    ['a non-string id', { id: 7 }],
    ['an unknown kind', { kind: 'selfDestruct' }],
    ['a missing session', { sessionId: '' }],
    ['a non-finite timestamp', { occurredAt: Number.NaN }],
    ['an infinite timestamp', { occurredAt: Number.POSITIVE_INFINITY }],
    ['a zero timestamp', { occurredAt: 0 }],
    ['a negative timestamp', { occurredAt: -5 }],
  ])('drops a command with %s', async (_label, over) => {
    drain.mockResolvedValue({ commands: [command(over)] });
    expect(await drainIOSCommands()).toEqual([]);
  });

  it('drops junk entries without losing the good ones beside them', async () => {
    drain.mockResolvedValue({
      commands: [null, 'nope', 42, [], command({ id: 'good' })],
    });
    expect((await drainIOSCommands()).map((c) => c.id)).toEqual(['good']);
  });

  it('survives a payload that is not an array at all', async () => {
    drain.mockResolvedValue({ commands: { id: 'c1' } });
    expect(await drainIOSCommands()).toEqual([]);
  });

  it('survives a missing plugin', async () => {
    drain.mockRejectedValue(new Error('unimplemented'));
    expect(await drainIOSCommands()).toEqual([]);
  });
});

describe('acknowledgeIOSCommands', () => {
  it('forwards the applied ids', async () => {
    acknowledge.mockResolvedValue(undefined);
    await acknowledgeIOSCommands(['a', 'b']);
    expect(acknowledge).toHaveBeenCalledWith({ ids: ['a', 'b'] });
  });

  it('skips the bridge call when there is nothing to acknowledge', async () => {
    await acknowledgeIOSCommands([]);
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('swallows a failure, because re-delivery is the safe outcome', async () => {
    acknowledge.mockRejectedValue(new Error('nope'));
    await expect(acknowledgeIOSCommands(['a'])).resolves.toBeUndefined();
  });
});

describe('clearIOSCommands', () => {
  it('clears and survives failure', async () => {
    clear.mockResolvedValue(undefined);
    await clearIOSCommands();
    expect(clear).toHaveBeenCalled();
    clear.mockRejectedValue(new Error('nope'));
    await expect(clearIOSCommands()).resolves.toBeUndefined();
  });
});
