import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'ios');
const status = vi.fn();
const requestPermission = vi.fn();
const schedule = vi.fn();
const cancel = vi.fn();
const consumeDue = vi.fn();
const pending = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({
    status,
    requestPermission,
    schedule,
    cancel,
    consumeDue,
    pending,
  }),
}));

const {
  consumeCompletionAlertDelivery,
  pendingCompletionAlert,
  readCompletionAlertStatus,
  reconcileCompletionAlert,
  requestCompletionAlertPermission,
  resetCompletionAlertReconciliationForTests,
  scheduledCompletionNotice,
  isCompletionAlertPlatform,
  UNSUPPORTED_COMPLETION_ALERT_STATUS,
} = await import('./completionAlerts');

const granted = {
  permission: 'granted' as const,
  alertsEnabled: true,
  soundsEnabled: true,
  lockScreenEnabled: true,
};

describe('native completion-alert bridge platforms', () => {
  beforeEach(() => {
    status.mockReset();
    resetCompletionAlertReconciliationForTests();
  });

  it('is live on both native shells and inert in a browser', async () => {
    // Android implements the same JS contract in
    // BloomCompletionAlertPlugin.java, so the reducer wiring is shared rather
    // than duplicated per platform.
    for (const platform of ['ios', 'android'] as const) {
      getPlatform.mockReturnValue(platform);
      expect(isCompletionAlertPlatform()).toBe(true);
      status.mockResolvedValue({
        permission: 'granted',
        alertsEnabled: true,
        soundsEnabled: true,
        lockScreenEnabled: true,
      });
      await expect(readCompletionAlertStatus()).resolves.toEqual({
        permission: 'granted',
        alertsEnabled: true,
        soundsEnabled: true,
        lockScreenEnabled: true,
      });
    }

    getPlatform.mockReturnValue('web');
    expect(isCompletionAlertPlatform()).toBe(false);
    status.mockClear();
    await expect(readCompletionAlertStatus()).resolves.toEqual(
      UNSUPPORTED_COMPLETION_ALERT_STATUS,
    );
    expect(status).not.toHaveBeenCalled();
  });

  it('schedules one Android request from the same reducer snapshot', async () => {
    getPlatform.mockReturnValue('android');
    status.mockResolvedValue({
      permission: 'granted',
      alertsEnabled: true,
      soundsEnabled: true,
      lockScreenEnabled: true,
    });
    schedule.mockResolvedValue({ scheduled: true, deadlineMs: 1_000 });

    const result = await reconcileCompletionAlert({
      enabled: true,
      running: true,
      mode: 'focus',
      deadlineMs: 1_000,
    });

    expect(result).toEqual({ scheduled: true, permission: 'granted' });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({
      deadlineMs: 1_000,
      title: 'Focus timer finished',
      body: 'Bloom is ready when you are.',
    });
  });
});

describe('native iOS completion-alert bridge', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    status.mockReset().mockResolvedValue(granted);
    requestPermission.mockReset().mockResolvedValue(granted);
    schedule.mockReset().mockResolvedValue({ scheduled: true });
    cancel.mockReset().mockResolvedValue(undefined);
    consumeDue.mockReset().mockResolvedValue({ presentation: 'none' });
    pending.mockReset().mockResolvedValue({ count: 1, deadlineMs: 123_000 });
    resetCompletionAlertReconciliationForTests();
  });

  it('is a quiet no-op outside the iOS wrapper', async () => {
    getPlatform.mockReturnValue('web');

    await expect(readCompletionAlertStatus()).resolves.toMatchObject({
      permission: 'unsupported',
    });
    await expect(
      reconcileCompletionAlert({
        enabled: true,
        running: true,
        mode: 'focus',
        deadlineMs: 123_000,
      }),
    ).resolves.toEqual({ scheduled: false, permission: 'unsupported' });
    await expect(pendingCompletionAlert()).resolves.toEqual({ count: 0 });
    await expect(consumeCompletionAlertDelivery(123_000)).resolves.toBe('none');
    expect(status).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(consumeDue).not.toHaveBeenCalled();
  });

  it('schedules neutral mode-aware copy only after permission is granted', async () => {
    const deadlineMs = Date.now() + 25 * 60_000;

    await expect(
      reconcileCompletionAlert({
        enabled: true,
        running: true,
        mode: 'focus',
        deadlineMs,
      }),
    ).resolves.toEqual({ scheduled: true, permission: 'granted' });

    expect(schedule).toHaveBeenCalledWith({
      deadlineMs,
      title: 'Focus timer finished',
      body: 'Bloom is ready when you are.',
    });
    expect(schedule.mock.calls[0][0]).not.toHaveProperty('targetText');
    expect(scheduledCompletionNotice('tiny')?.title).toBe('Tiny timer finished');
    expect(scheduledCompletionNotice('short')?.title).toBe('Break timer finished');
    expect(scheduledCompletionNotice('flow')).toBeNull();
  });

  it('cancels rather than schedules when permission is still undecided or denied', async () => {
    status.mockResolvedValue({
      permission: 'prompt',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });

    await expect(
      reconcileCompletionAlert({
        enabled: true,
        running: true,
        mode: 'long',
        deadlineMs: Date.now() + 60_000,
      }),
    ).resolves.toEqual({ scheduled: false, permission: 'prompt' });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('addresses the running iOS notice and paused resume metadata to one session', async () => {
    const deadlineMs = Date.now() + 60_000;
    await reconcileCompletionAlert({ enabled: true, running: true, mode: 'focus', deadlineMs, sessionId: 'focus-1' });
    expect(schedule).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'focus-1', deadlineMs }));

    await reconcileCompletionAlert({ enabled: true, running: false, mode: 'focus', deadlineMs: null, sessionId: 'focus-1', remainingSeconds: 42 });
    expect(cancel).toHaveBeenLastCalledWith({ resumeNotice: {
      sessionId: 'focus-1', remainingSeconds: 42,
      title: 'Focus timer finished', body: 'Bloom is ready when you are.',
    } });
  });

  it.each([
    { enabled: false, mode: 'focus' as const, sessionId: 'focus-1', remainingSeconds: 42 },
    { enabled: true, mode: 'short' as const, sessionId: null, remainingSeconds: 42 },
    { enabled: true, mode: 'focus' as const, sessionId: null, remainingSeconds: 42 },
    { enabled: true, mode: 'focus' as const, sessionId: 'focus-1', remainingSeconds: 0 },
  ])('discards native resume permission for an ineligible paused snapshot: %o', async (snapshot) => {
    await reconcileCompletionAlert({ ...snapshot, running: false, deadlineMs: null });
    expect(cancel).toHaveBeenLastCalledWith();
  });

  it.each([
    { enabled: false, running: true, mode: 'focus' as const, deadlineMs: 123_000 },
    { enabled: true, running: false, mode: 'focus' as const, deadlineMs: null },
    { enabled: true, running: true, mode: 'flow' as const, deadlineMs: null },
  ])('cancels an ineligible reducer snapshot: %o', async (snapshot) => {
    await reconcileCompletionAlert(snapshot);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not let an older async start resurrect after a newer pause', async () => {
    let resolveStatus: ((value: typeof granted) => void) | undefined;
    status.mockImplementation(
      () => new Promise<typeof granted>((resolve) => {
        resolveStatus = resolve;
      }),
    );

    const staleStart = reconcileCompletionAlert({
      enabled: true,
      running: true,
      mode: 'focus',
      deadlineMs: Date.now() + 60_000,
    });
    await reconcileCompletionAlert({
      enabled: true,
      running: false,
      mode: 'focus',
      deadlineMs: null,
    });
    resolveStatus?.(granted);
    await staleStart;

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('serializes a pause behind an in-flight native schedule', async () => {
    let resolveSchedule: ((value: { scheduled: boolean }) => void) | undefined;
    schedule.mockImplementation(
      () =>
        new Promise<{ scheduled: boolean }>((resolve) => {
          resolveSchedule = resolve;
        }),
    );

    const start = reconcileCompletionAlert({
      enabled: true,
      running: true,
      mode: 'focus',
      deadlineMs: Date.now() + 60_000,
    });
    await vi.waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    const pause = reconcileCompletionAlert({
      enabled: true,
      running: false,
      mode: 'focus',
      deadlineMs: null,
    });

    resolveSchedule?.({ scheduled: true });
    await Promise.all([start, pause]);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.invocationCallOrder[0]).toBeGreaterThan(
      schedule.mock.invocationCallOrder[0],
    );
  });

  it('reads and requests system-owned permission without persisting it', async () => {
    await expect(requestCompletionAlertPermission()).resolves.toEqual(granted);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await expect(pendingCompletionAlert()).resolves.toEqual({
      count: 1,
      deadlineMs: 123_000,
    });
  });

  it.each(['foreground-suppressed', 'background-system'] as const)(
    'returns the native %s delivery disposition for the exact deadline',
    async (presentation) => {
      consumeDue.mockResolvedValue({ presentation });
      await expect(consumeCompletionAlertDelivery(123_000)).resolves.toBe(presentation);
      expect(consumeDue).toHaveBeenCalledWith({ deadlineMs: 123_000 });
    },
  );

  it('normalizes malformed delivery dispositions and deadlines to none', async () => {
    consumeDue.mockResolvedValue({ presentation: 'mystery' });
    await expect(consumeCompletionAlertDelivery(123_000)).resolves.toBe('none');
    await expect(consumeCompletionAlertDelivery(Number.NaN)).resolves.toBe('none');
    expect(consumeDue).toHaveBeenCalledTimes(1);
  });

  it('reports malformed native status and bridge errors as unavailable', async () => {
    status.mockResolvedValue({ permission: 'mystery' });
    await expect(readCompletionAlertStatus()).resolves.toMatchObject({
      permission: 'unavailable',
    });
    requestPermission.mockRejectedValue(new Error('native unavailable'));
    await expect(requestCompletionAlertPermission()).resolves.toMatchObject({
      permission: 'unavailable',
    });
  });
});
