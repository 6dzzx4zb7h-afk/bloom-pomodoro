import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'ios');
const status = vi.fn();
const reconcile = vi.fn();
const end = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({ status, reconcile, end }),
}));

const {
  readIOSLiveActivityStatus,
  reconcileIOSLiveActivity,
  resetIOSLiveActivityReconciliationForTests,
} = await import('./iosLiveActivity');

const runningSnapshot = {
  sessionId: 's-focus-1',
  mode: 'focus' as const,
  state: 'running' as const,
  startedAtMs: 1_000,
  deadlineMs: 1_501_000,
};

describe('native iOS Live Activity bridge', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    status.mockReset().mockResolvedValue({
      supported: true,
      enabled: true,
      active: false,
    });
    reconcile.mockReset().mockResolvedValue({
      supported: true,
      enabled: true,
      active: true,
      changed: true,
    });
    end.mockReset().mockResolvedValue({
      supported: true,
      active: false,
      changed: true,
    });
    resetIOSLiveActivityReconciliationForTests();
  });

  it('is a quiet no-op on web and Android', async () => {
    getPlatform.mockReturnValue('web');

    await expect(readIOSLiveActivityStatus()).resolves.toEqual({
      supported: false,
      enabled: false,
      active: false,
    });
    await expect(reconcileIOSLiveActivity(runningSnapshot)).resolves.toEqual({
      supported: false,
      active: false,
      changed: false,
    });
    expect(status).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it('passes only bounded running-timer fields to native code', async () => {
    await expect(reconcileIOSLiveActivity(runningSnapshot)).resolves.toEqual({
      supported: true,
      active: true,
      changed: true,
    });

    expect(reconcile).toHaveBeenCalledWith(runningSnapshot);
    expect(reconcile.mock.calls[0][0]).not.toHaveProperty('targetText');
    expect(reconcile.mock.calls[0][0]).not.toHaveProperty('taskId');
    expect(end).not.toHaveBeenCalled();
  });

  it('mirrors a pause with frozen remaining seconds and no deadline', async () => {
    const paused = {
      sessionId: 's-tiny-1',
      mode: 'tiny' as const,
      state: 'paused' as const,
      startedAtMs: 2_000,
      remainingSeconds: 119,
    };

    await reconcileIOSLiveActivity(paused);

    expect(reconcile).toHaveBeenCalledWith(paused);
    expect(reconcile.mock.calls[0][0]).not.toHaveProperty('deadlineMs');
  });

  it('ends every stale Bloom activity for terminal or malformed state', async () => {
    await reconcileIOSLiveActivity(null);
    expect(end).toHaveBeenLastCalledWith({ dismissal: 'immediate' });

    reconcile.mockClear();
    end.mockClear();
    await reconcileIOSLiveActivity({
      ...runningSnapshot,
      deadlineMs: Number.NaN,
    });
    expect(reconcile).not.toHaveBeenCalled();
    expect(end).toHaveBeenLastCalledWith({ dismissal: 'immediate' });
  });

  it('does not let an older queued start win after a rapid terminal state', async () => {
    // Hold the first native mutation in flight, then ensure the queued end is
    // applied after it. Native reconciliation is idempotent for the same ID.
    let releaseStart: (() => void) | undefined;
    reconcile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseStart = () =>
            resolve({ supported: true, enabled: true, active: true, changed: true });
        }),
    );
    const start = reconcileIOSLiveActivity(runningSnapshot);
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    const terminal = reconcileIOSLiveActivity(null);
    releaseStart?.();
    await Promise.all([start, terminal]);

    expect(end).toHaveBeenCalledTimes(1);
    expect(end.mock.invocationCallOrder[0]).toBeGreaterThan(
      reconcile.mock.invocationCallOrder[0],
    );
  });

  it('normalizes missing extensions, disabled systems, and malformed replies', async () => {
    status.mockResolvedValue({
      supported: true,
      enabled: true,
      active: true,
      activityId: 'activity-1',
      sessionId: 's-focus-1',
    });
    await expect(readIOSLiveActivityStatus()).resolves.toEqual({
      supported: true,
      enabled: true,
      active: true,
      activityId: 'activity-1',
      sessionId: 's-focus-1',
    });

    reconcile.mockResolvedValue({
      supported: true,
      enabled: false,
      active: false,
      changed: false,
      reason: 'disabled',
    });
    await expect(reconcileIOSLiveActivity(runningSnapshot)).resolves.toEqual({
      supported: true,
      active: false,
      changed: false,
      reason: 'disabled',
    });

    status.mockRejectedValue(new Error('plugin unavailable'));
    await expect(readIOSLiveActivityStatus()).resolves.toEqual({
      supported: false,
      enabled: false,
      active: false,
    });

    reconcile.mockResolvedValue({ active: true });
    await expect(reconcileIOSLiveActivity(runningSnapshot)).resolves.toEqual({
      supported: false,
      active: false,
      changed: false,
    });
  });
});
