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
  consumeIOSCompletionAlertDelivery,
  pendingIOSCompletionAlert,
  readIOSCompletionAlertStatus,
  reconcileIOSCompletionAlert,
  requestIOSCompletionAlertPermission,
  resetIOSCompletionAlertReconciliationForTests,
  scheduledCompletionNotice,
} = await import('./iosCompletionAlerts');

const granted = {
  permission: 'granted' as const,
  alertsEnabled: true,
  soundsEnabled: true,
  lockScreenEnabled: true,
};

describe('native iOS completion-alert bridge', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    status.mockReset().mockResolvedValue(granted);
    requestPermission.mockReset().mockResolvedValue(granted);
    schedule.mockReset().mockResolvedValue({ scheduled: true });
    cancel.mockReset().mockResolvedValue(undefined);
    consumeDue.mockReset().mockResolvedValue({ presentation: 'none' });
    pending.mockReset().mockResolvedValue({ count: 1, deadlineMs: 123_000 });
    resetIOSCompletionAlertReconciliationForTests();
  });

  it('is a quiet no-op outside the iOS wrapper', async () => {
    getPlatform.mockReturnValue('web');

    await expect(readIOSCompletionAlertStatus()).resolves.toMatchObject({
      permission: 'unsupported',
    });
    await expect(
      reconcileIOSCompletionAlert({
        enabled: true,
        running: true,
        mode: 'focus',
        deadlineMs: 123_000,
      }),
    ).resolves.toEqual({ scheduled: false, permission: 'unsupported' });
    await expect(pendingIOSCompletionAlert()).resolves.toEqual({ count: 0 });
    await expect(consumeIOSCompletionAlertDelivery(123_000)).resolves.toBe('none');
    expect(status).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(consumeDue).not.toHaveBeenCalled();
  });

  it('schedules neutral mode-aware copy only after permission is granted', async () => {
    const deadlineMs = Date.now() + 25 * 60_000;

    await expect(
      reconcileIOSCompletionAlert({
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
      reconcileIOSCompletionAlert({
        enabled: true,
        running: true,
        mode: 'long',
        deadlineMs: Date.now() + 60_000,
      }),
    ).resolves.toEqual({ scheduled: false, permission: 'prompt' });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(schedule).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: false, running: true, mode: 'focus' as const, deadlineMs: 123_000 },
    { enabled: true, running: false, mode: 'focus' as const, deadlineMs: null },
    { enabled: true, running: true, mode: 'flow' as const, deadlineMs: null },
  ])('cancels an ineligible reducer snapshot: %o', async (snapshot) => {
    await reconcileIOSCompletionAlert(snapshot);
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

    const staleStart = reconcileIOSCompletionAlert({
      enabled: true,
      running: true,
      mode: 'focus',
      deadlineMs: Date.now() + 60_000,
    });
    await reconcileIOSCompletionAlert({
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

    const start = reconcileIOSCompletionAlert({
      enabled: true,
      running: true,
      mode: 'focus',
      deadlineMs: Date.now() + 60_000,
    });
    await vi.waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    const pause = reconcileIOSCompletionAlert({
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
    await expect(requestIOSCompletionAlertPermission()).resolves.toEqual(granted);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await expect(pendingIOSCompletionAlert()).resolves.toEqual({
      count: 1,
      deadlineMs: 123_000,
    });
  });

  it.each(['foreground-suppressed', 'background-system'] as const)(
    'returns the native %s delivery disposition for the exact deadline',
    async (presentation) => {
      consumeDue.mockResolvedValue({ presentation });
      await expect(consumeIOSCompletionAlertDelivery(123_000)).resolves.toBe(presentation);
      expect(consumeDue).toHaveBeenCalledWith({ deadlineMs: 123_000 });
    },
  );

  it('normalizes malformed delivery dispositions and deadlines to none', async () => {
    consumeDue.mockResolvedValue({ presentation: 'mystery' });
    await expect(consumeIOSCompletionAlertDelivery(123_000)).resolves.toBe('none');
    await expect(consumeIOSCompletionAlertDelivery(Number.NaN)).resolves.toBe('none');
    expect(consumeDue).toHaveBeenCalledTimes(1);
  });

  it('reports malformed native status and bridge errors as unavailable', async () => {
    status.mockResolvedValue({ permission: 'mystery' });
    await expect(readIOSCompletionAlertStatus()).resolves.toMatchObject({
      permission: 'unavailable',
    });
    requestPermission.mockRejectedValue(new Error('native unavailable'));
    await expect(requestIOSCompletionAlertPermission()).resolves.toMatchObject({
      permission: 'unavailable',
    });
  });
});
