// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IOSCompletionAlertPresentation,
  IOSCompletionAlertStatus,
} from '../native/iosCompletionAlerts';

const reconcileIOSCompletionAlert = vi.fn(async () => ({
  scheduled: true,
  permission: 'granted' as const,
}));
const consumeIOSCompletionAlertDelivery = vi.fn<
  () => Promise<IOSCompletionAlertPresentation>
>(async () => 'none');
const readIOSCompletionAlertStatus = vi.fn<() => Promise<IOSCompletionAlertStatus>>(async () => ({
  permission: 'granted' as const,
  alertsEnabled: true,
  soundsEnabled: true,
  lockScreenEnabled: true,
}));
const requestIOSCompletionAlertPermission = vi.fn<() => Promise<IOSCompletionAlertStatus>>(
  async () => ({
  permission: 'granted' as const,
  alertsEnabled: true,
  soundsEnabled: true,
  lockScreenEnabled: true,
  }),
);

vi.mock('../native/iosCompletionAlerts', () => ({
  consumeIOSCompletionAlertDelivery,
  isIOSCompletionAlertPlatform: () => true,
  readIOSCompletionAlertStatus,
  reconcileIOSCompletionAlert,
  requestIOSCompletionAlertPermission,
  UNSUPPORTED_COMPLETION_ALERT_STATUS: {
    permission: 'unsupported',
    alertsEnabled: false,
    soundsEnabled: false,
    lockScreenEnabled: false,
  },
}));

const playRing = vi.fn();
const resumeAudio = vi.fn();
const notify = vi.fn();

vi.mock('../engine/audio', () => ({
  audioEngine: {
    playRing,
    resume: resumeAudio,
  },
  notify,
}));

const { useBloom } = await import('./useBloom');

let bloom: ReturnType<typeof useBloom>;

function Harness() {
  bloom = useBloom();
  return null;
}

describe('useBloom native completion-alert reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    reconcileIOSCompletionAlert.mockClear();
    readIOSCompletionAlertStatus.mockClear();
    requestIOSCompletionAlertPermission.mockClear();
    consumeIOSCompletionAlertDelivery.mockReset().mockResolvedValue('none');
    playRing.mockClear();
    resumeAudio.mockClear();
    notify.mockClear();
    readIOSCompletionAlertStatus.mockResolvedValue({
      permission: 'granted',
      alertsEnabled: true,
      soundsEnabled: true,
      lockScreenEnabled: true,
    });
    requestIOSCompletionAlertPermission.mockResolvedValue({
      permission: 'granted',
      alertsEnabled: true,
      soundsEnabled: true,
      lockScreenEnabled: true,
    });
  });

  it('replaces and cancels from reducer-owned start, pause, resume, and reset state', async () => {
    render(<Harness />);
    await waitFor(() => expect(readIOSCompletionAlertStatus).toHaveBeenCalled());
    reconcileIOSCompletionAlert.mockClear();

    act(() => bloom.actions.toggle());
    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          running: true,
          mode: 'focus',
          deadlineMs: expect.any(Number),
        }),
      ),
    );
    const firstDeadline = bloom.state.endsAt;

    act(() => bloom.actions.toggle());
    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith({
        enabled: true,
        running: false,
        mode: 'focus',
        deadlineMs: null,
      }),
    );

    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.state.running).toBe(true));
    expect(bloom.state.endsAt).not.toBeNull();
    expect(bloom.state.endsAt).toBeGreaterThanOrEqual(firstDeadline ?? 0);

    act(() => bloom.actions.reset());
    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith({
        enabled: true,
        running: false,
        mode: 'focus',
        deadlineMs: null,
      }),
    );
  });

  it('cancels the mirror when Ring when done is switched off', async () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.state.running).toBe(true));

    act(() => bloom.actions.patchSettings({ sound: false }));
    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false, running: true }),
      ),
    );
  });

  it('refreshes system-owned notification status when Bloom returns visible', async () => {
    render(<Harness />);
    await waitFor(() => expect(readIOSCompletionAlertStatus).toHaveBeenCalled());
    readIOSCompletionAlertStatus.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(readIOSCompletionAlertStatus).not.toHaveBeenCalled();

    readIOSCompletionAlertStatus.mockResolvedValue({
      permission: 'denied',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await waitFor(() => expect(bloom.completionAlerts.status.permission).toBe('denied'));
    expect(readIOSCompletionAlertStatus).toHaveBeenCalled();
  });

  it('starts the countdown before showing a skippable first-use primer', async () => {
    readIOSCompletionAlertStatus.mockResolvedValue({
      permission: 'prompt',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });
    render(<Harness />);
    await waitFor(() => expect(bloom.completionAlerts.status.permission).toBe('prompt'));

    act(() => bloom.actions.toggle());
    expect(bloom.state.running).toBe(true);
    await waitFor(() => expect(bloom.completionAlerts.primerOpen).toBe(true));

    act(() => bloom.completionAlerts.dismissPrimer());
    expect(bloom.completionAlerts.primerOpen).toBe(false);
    expect(bloom.state.running).toBe(true);
    expect(requestIOSCompletionAlertPermission).not.toHaveBeenCalled();
  });

  it('schedules the already-running countdown after permission is accepted', async () => {
    readIOSCompletionAlertStatus.mockResolvedValue({
      permission: 'prompt',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });
    render(<Harness />);
    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.completionAlerts.primerOpen).toBe(true));
    reconcileIOSCompletionAlert.mockClear();

    await act(async () => {
      await bloom.completionAlerts.requestPermission();
    });

    expect(bloom.completionAlerts.status.permission).toBe('granted');
    await waitFor(() =>
      expect(reconcileIOSCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          running: true,
          deadlineMs: expect.any(Number),
        }),
      ),
    );
  });

  it('does not replay Web Audio after iOS owned a background completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    consumeIOSCompletionAlertDelivery.mockResolvedValue('background-system');
    try {
      render(<Harness />);
      act(() => bloom.actions.toggle());
      const deadlineMs = bloom.state.endsAt!;
      playRing.mockClear();
      notify.mockClear();

      await act(async () => {
        vi.setSystemTime(deadlineMs);
        vi.advanceTimersByTime(250);
        await Promise.resolve();
      });

      expect(bloom.state.justDone).toBe(true);
      expect(consumeIOSCompletionAlertDelivery).toHaveBeenCalledWith(deadlineMs);
      expect(playRing).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays one Web Audio cue after the native foreground presentation was suppressed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    consumeIOSCompletionAlertDelivery.mockResolvedValue('foreground-suppressed');
    try {
      render(<Harness />);
      act(() => bloom.actions.toggle());
      const deadlineMs = bloom.state.endsAt!;
      playRing.mockClear();
      notify.mockClear();

      await act(async () => {
        vi.setSystemTime(deadlineMs);
        vi.advanceTimersByTime(250);
        await Promise.resolve();
      });

      expect(playRing).toHaveBeenCalledTimes(1);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
