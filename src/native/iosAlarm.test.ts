import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'ios');
const status = vi.fn();
const requestAuthorization = vi.fn();
const reconcile = vi.fn();
const cancel = vi.fn();
const consumeDue = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({
    status,
    requestAuthorization,
    reconcile,
    cancel,
    consumeDue,
  }),
}));

const {
  alarmSystemCopy,
  cancelIOSAlarm,
  consumeIOSAlarmDelivery,
  readIOSAlarmStatus,
  reconcileIOSAlarm,
  requestIOSAlarmAuthorization,
  resetIOSAlarmReconciliationForTests,
} = await import('./iosAlarm');

const granted = { supported: true, authorization: 'granted' };
const running = {
  enabled: true,
  running: true,
  mode: 'focus' as const,
  deadlineMs: 1_700_000_000_000,
};

describe('native iOS alarm bridge (PLAN 13.12)', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    status.mockReset().mockResolvedValue(granted);
    requestAuthorization.mockReset().mockResolvedValue(granted);
    reconcile.mockReset().mockResolvedValue({ ...granted, owns: true, changed: true });
    cancel.mockReset().mockResolvedValue({ ...granted, owns: false, changed: true });
    consumeDue.mockReset().mockResolvedValue({ presentation: 'none' });
    resetIOSAlarmReconciliationForTests();
  });

  it('is a quiet no-op outside the iOS wrapper', async () => {
    getPlatform.mockReturnValue('web');

    await expect(readIOSAlarmStatus()).resolves.toEqual({
      supported: false,
      authorization: 'unsupported',
    });
    await expect(reconcileIOSAlarm(running)).resolves.toEqual({
      owns: false,
      supported: false,
      authorization: 'unsupported',
    });
    await expect(consumeIOSAlarmDelivery(running.deadlineMs)).resolves.toBe('none');
    await cancelIOSAlarm(true);

    expect(reconcile).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(consumeDue).not.toHaveBeenCalled();
  });

  it('reports an unsupported system without claiming ownership', async () => {
    status.mockResolvedValue({ supported: false, authorization: 'unsupported' });

    await expect(readIOSAlarmStatus()).resolves.toEqual({
      supported: false,
      authorization: 'unsupported',
    });
  });

  it('treats an unreadable native answer as unavailable, never as granted', async () => {
    status.mockRejectedValue(new Error('no such plugin'));
    reconcile.mockResolvedValue({ supported: true, authorization: 'nonsense', owns: true });

    await expect(readIOSAlarmStatus()).resolves.toEqual({
      supported: false,
      authorization: 'unavailable',
    });
    await expect(reconcileIOSAlarm(running)).resolves.toMatchObject({
      authorization: 'unavailable',
      supported: false,
    });
  });

  it('schedules one alarm for a bounded countdown and reports ownership', async () => {
    await expect(reconcileIOSAlarm(running)).resolves.toEqual({
      owns: true,
      supported: true,
      authorization: 'granted',
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith({
      deadlineMs: running.deadlineMs,
      mode: 'focus',
      countdownTitle: 'Focus',
      alertTitle: 'Focus timer finished',
      stopLabel: 'done',
      // PLAN 13.19: absent on this fixture, so the AlarmKit surface renders no
      // control rather than one addressing a session that does not exist.
      sessionId: '',
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('forwards the open session so the alarm surface can address it', async () => {
    await reconcileIOSAlarm({ ...running, sessionId: 'sess-42' });
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-42' }),
    );
  });

  it('never schedules for Flow, which has no predetermined finish', async () => {
    expect(alarmSystemCopy('flow')).toBeNull();

    await expect(
      reconcileIOSAlarm({ ...running, mode: 'flow' }),
    ).resolves.toMatchObject({ owns: false });
    expect(reconcile).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith({ force: false });
  });

  it('schedules every other bounded mode', async () => {
    for (const [mode, countdownTitle, alertTitle] of [
      ['tiny', 'Tiny focus', 'Tiny timer finished'],
      ['short', 'Short break', 'Break timer finished'],
      ['long', 'Long break', 'Break timer finished'],
    ] as const) {
      reconcile.mockClear();
      await reconcileIOSAlarm({ ...running, mode });
      expect(reconcile).toHaveBeenCalledWith(
        expect.objectContaining({ mode, countdownTitle, alertTitle }),
      );
    }
  });

  it('cancels without forcing when the timer stops, pauses, or the ring is off', async () => {
    for (const snapshot of [
      { ...running, running: false },
      { ...running, enabled: false },
      { ...running, deadlineMs: null },
    ]) {
      cancel.mockClear();
      await expect(reconcileIOSAlarm(snapshot)).resolves.toMatchObject({ owns: false });
      // Not forced: an alarm already ringing belongs to the person, not to a
      // reducer transition that happened after it fired.
      expect(cancel).toHaveBeenCalledWith({ force: false });
    }
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('lets the newest snapshot win when native calls resolve out of order', async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    reconcile.mockImplementationOnce(
      () => new Promise((resolve) => (releaseFirst = resolve)),
    );

    const first = reconcileIOSAlarm(running);
    const second = reconcileIOSAlarm({ ...running, running: false });
    releaseFirst({ ...granted, owns: true });

    await expect(first).resolves.toMatchObject({ owns: false });
    await expect(second).resolves.toMatchObject({ owns: false });
    expect(cancel).toHaveBeenCalledWith({ force: false });
  });

  it('keeps Bloom’s own chime unless a system alarm is actually alerting', async () => {
    await expect(consumeIOSAlarmDelivery(running.deadlineMs)).resolves.toBe('none');

    consumeDue.mockResolvedValue({ presentation: 'system-alarm' });
    await expect(consumeIOSAlarmDelivery(running.deadlineMs)).resolves.toBe('system-alarm');

    consumeDue.mockRejectedValue(new Error('gone'));
    await expect(consumeIOSAlarmDelivery(running.deadlineMs)).resolves.toBe('none');
    await expect(consumeIOSAlarmDelivery(Number.NaN)).resolves.toBe('none');
  });

  it('forces cancellation only when the caller asks, as a data clear does', async () => {
    await cancelIOSAlarm();
    expect(cancel).toHaveBeenLastCalledWith({ force: false });

    await cancelIOSAlarm(true);
    expect(cancel).toHaveBeenLastCalledWith({ force: true });
  });

  it('asks the system once and passes a refusal straight through', async () => {
    requestAuthorization.mockResolvedValue({ supported: true, authorization: 'denied' });

    await expect(requestIOSAlarmAuthorization()).resolves.toEqual({
      supported: true,
      authorization: 'denied',
    });
    expect(requestAuthorization).toHaveBeenCalledTimes(1);
  });

  it('does not claim ownership while authorization is missing', async () => {
    reconcile.mockResolvedValue({
      supported: true,
      authorization: 'denied',
      owns: false,
      reason: 'permission',
    });

    await expect(reconcileIOSAlarm(running)).resolves.toEqual({
      owns: false,
      supported: true,
      authorization: 'denied',
    });
  });
});
