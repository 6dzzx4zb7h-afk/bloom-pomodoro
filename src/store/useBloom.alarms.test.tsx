// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IOSAlarmPresentation,
  IOSAlarmReconcileResult,
  IOSAlarmStatus,
} from '../native/iosAlarm';
import type {
  IOSLiveActivityMutationResult,
  IOSLiveActivitySnapshot,
} from '../native/iosLiveActivity';

const owned: IOSAlarmReconcileResult = {
  owns: true,
  supported: true,
  authorization: 'granted',
};
const notOwned: IOSAlarmReconcileResult = {
  owns: false,
  supported: true,
  authorization: 'denied',
};

const reconcileIOSAlarm = vi.fn<() => Promise<IOSAlarmReconcileResult>>(
  async () => owned,
);
const consumeIOSAlarmDelivery = vi.fn<() => Promise<IOSAlarmPresentation>>(
  async () => 'none',
);
const readIOSAlarmStatus = vi.fn<() => Promise<IOSAlarmStatus>>(async () => ({
  supported: true,
  authorization: 'granted',
}));
const requestIOSAlarmAuthorization = vi.fn<() => Promise<IOSAlarmStatus>>(async () => ({
  supported: true,
  authorization: 'granted',
}));
const cancelIOSAlarm = vi.fn(async () => undefined);

vi.mock('../native/iosAlarm', () => ({
  cancelIOSAlarm,
  consumeIOSAlarmDelivery,
  isIOSAlarmPlatform: () => true,
  readIOSAlarmStatus,
  reconcileIOSAlarm,
  requestIOSAlarmAuthorization,
  UNSUPPORTED_ALARM_STATUS: { supported: false, authorization: 'unsupported' },
}));

const reconcileIOSCompletionAlert = vi.fn(async () => ({
  scheduled: true,
  permission: 'granted' as const,
}));
const consumeIOSCompletionAlertDelivery = vi.fn(async () => 'none' as const);

vi.mock('../native/iosCompletionAlerts', () => ({
  consumeIOSCompletionAlertDelivery,
  isIOSCompletionAlertPlatform: () => true,
  readIOSCompletionAlertStatus: async () => ({
    permission: 'granted' as const,
    alertsEnabled: true,
    soundsEnabled: true,
    lockScreenEnabled: true,
  }),
  reconcileIOSCompletionAlert,
  requestIOSCompletionAlertPermission: async () => ({
    permission: 'granted' as const,
    alertsEnabled: true,
    soundsEnabled: true,
    lockScreenEnabled: true,
  }),
  UNSUPPORTED_COMPLETION_ALERT_STATUS: {
    permission: 'unsupported',
    alertsEnabled: false,
    soundsEnabled: false,
    lockScreenEnabled: false,
  },
}));

const reconcileIOSLiveActivity = vi.fn<
  (
    snapshot: IOSLiveActivitySnapshot | null,
  ) => Promise<IOSLiveActivityMutationResult>
>(async () => ({ supported: true, active: true, changed: true }));

vi.mock('../native/iosLiveActivity', () => ({
  isIOSLiveActivityPlatform: () => true,
  readIOSLiveActivityStatus: async () => ({
    supported: true,
    enabled: true,
    active: false,
  }),
  reconcileIOSLiveActivity,
}));

const playRing = vi.fn();
const notify = vi.fn();

vi.mock('../engine/audio', () => ({
  audioEngine: { playRing, resume: vi.fn() },
  notify,
}));

const { useBloom } = await import('./useBloom');

let bloom: ReturnType<typeof useBloom>;

function Harness() {
  bloom = useBloom();
  return null;
}

/** The snapshot the generic PLAN 13.8 activity was most recently asked for. */
function lastLiveActivitySnapshot() {
  const calls = reconcileIOSLiveActivity.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
}

describe('useBloom AlarmKit reconciliation (PLAN 13.12)', () => {
  beforeEach(() => {
    localStorage.clear();
    reconcileIOSAlarm.mockReset().mockResolvedValue(owned);
    consumeIOSAlarmDelivery.mockReset().mockResolvedValue('none');
    readIOSAlarmStatus.mockClear();
    requestIOSAlarmAuthorization.mockClear();
    cancelIOSAlarm.mockClear();
    reconcileIOSCompletionAlert.mockClear();
    consumeIOSCompletionAlertDelivery.mockClear();
    reconcileIOSLiveActivity.mockClear();
    playRing.mockClear();
    notify.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('mirrors the reducer-owned deadline for a bounded countdown', async () => {
    render(<Harness />);
    await waitFor(() => expect(reconcileIOSAlarm).toHaveBeenCalled());
    reconcileIOSAlarm.mockClear();

    act(() => bloom.actions.toggle());
    await waitFor(() =>
      expect(reconcileIOSAlarm).toHaveBeenLastCalledWith({
        enabled: true,
        running: true,
        mode: 'focus',
        deadlineMs: bloom.state.endsAt,
        // PLAN 13.19: the open session, so the controls on the AlarmKit
        // surface address the same session the reducer owns.
        sessionId: bloom.state.openFocus?.id,
      }),
    );

    act(() => bloom.actions.toggle());
    await waitFor(() =>
      expect(reconcileIOSAlarm).toHaveBeenLastCalledWith(
        expect.objectContaining({ running: false, deadlineMs: null }),
      ),
    );
  });

  it('stands the notification and the generic activity down while an alarm owns the cue', async () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());

    await waitFor(() => expect(bloom.alarms.owns).toBe(true));
    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false, running: true }),
      ),
    );
    // The alarm brings its own countdown presentation, so exactly one system
    // surface is asked for: the generic activity is ended, never stacked.
    expect(lastLiveActivitySnapshot()).toBeNull();
  });

  it('never flashes the generic activity while an authorized alarm is being scheduled', async () => {
    // The native answer takes a moment. Creating the generic activity in that
    // window and dismissing it once the alarm lands puts a visible second
    // countdown in the Dynamic Island at every start.
    let release: (value: IOSAlarmReconcileResult) => void = () => {};
    render(<Harness />);
    await waitFor(() => expect(bloom.alarms.status.authorization).toBe('granted'));
    reconcileIOSLiveActivity.mockClear();
    reconcileIOSAlarm.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );

    act(() => bloom.actions.toggle());
    // Held: no snapshot is requested while the decision is outstanding.
    expect(
      reconcileIOSLiveActivity.mock.calls.some(([snapshot]) => snapshot !== null),
    ).toBe(false);

    await act(async () => {
      release(owned);
      await Promise.resolve();
    });
    expect(
      reconcileIOSLiveActivity.mock.calls.some(([snapshot]) => snapshot !== null),
    ).toBe(false);
  });

  it('creates the generic activity once the alarm declines the surface', async () => {
    let release: (value: IOSAlarmReconcileResult) => void = () => {};
    render(<Harness />);
    await waitFor(() => expect(bloom.alarms.status.authorization).toBe('granted'));
    reconcileIOSAlarm.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );

    act(() => bloom.actions.toggle());
    await act(async () => {
      release({ ...owned, owns: false });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(lastLiveActivitySnapshot()).toMatchObject({ state: 'running' }),
    );
  });

  it('keeps both fallbacks when authorization is missing', async () => {
    reconcileIOSAlarm.mockResolvedValue(notOwned);
    render(<Harness />);
    act(() => bloom.actions.toggle());

    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true, running: true }),
      ),
    );
    await waitFor(() =>
      expect(lastLiveActivitySnapshot()).toMatchObject({
        mode: 'focus',
        state: 'running',
      }),
    );
    expect(bloom.alarms.status.authorization).toBe('denied');
  });

  it('hands the countdown surface back to the generic activity on pause', async () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.alarms.owns).toBe(true));

    // Pausing produces no running deadline, so no alarm can own it.
    reconcileIOSAlarm.mockResolvedValue({ ...owned, owns: false });
    act(() => bloom.actions.toggle());

    await waitFor(() =>
      expect(lastLiveActivitySnapshot()).toMatchObject({ state: 'paused' }),
    );
  });

  it('lets the system alarm be the only finish cue when it is actually alerting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    consumeIOSAlarmDelivery.mockResolvedValue('system-alarm');

    render(<Harness />);
    act(() => bloom.actions.toggle());
    const deadlineMs = bloom.state.endsAt!;
    playRing.mockClear();

    await act(async () => {
      vi.setSystemTime(deadlineMs);
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(bloom.state.justDone).toBe(true);
    expect(consumeIOSAlarmDelivery).toHaveBeenCalledWith(deadlineMs);
    expect(playRing).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('still chimes when the person stopped the alarm before it rang', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    consumeIOSAlarmDelivery.mockResolvedValue('none');

    render(<Harness />);
    act(() => bloom.actions.toggle());
    const deadlineMs = bloom.state.endsAt!;
    playRing.mockClear();

    await act(async () => {
      vi.setSystemTime(deadlineMs);
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(playRing).toHaveBeenCalledTimes(1);
  });

  it('cancels nothing on its own, and forces only a confirmed data clear', async () => {
    render(<Harness />);
    await waitFor(() => expect(reconcileIOSAlarm).toHaveBeenCalled());
    expect(cancelIOSAlarm).not.toHaveBeenCalled();

    act(() => bloom.actions.clearFocusData());
    expect(cancelIOSAlarm).toHaveBeenCalledWith(true);
  });

  it('asks for authorization only from an explicit action', async () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());
    await waitFor(() => expect(reconcileIOSAlarm).toHaveBeenCalled());
    expect(requestIOSAlarmAuthorization).not.toHaveBeenCalled();

    await act(async () => {
      await bloom.alarms.requestAuthorization();
    });
    expect(requestIOSAlarmAuthorization).toHaveBeenCalledTimes(1);
    expect(bloom.alarms.status.authorization).toBe('granted');
  });
});
