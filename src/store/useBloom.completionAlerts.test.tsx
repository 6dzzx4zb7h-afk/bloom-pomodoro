// @vitest-environment jsdom

import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CompletionAlertPresentation,
  CompletionAlertStatus,
} from '../native/completionAlerts';

const reconcileCompletionAlert = vi.fn(async () => ({
  scheduled: true,
  permission: 'granted' as const,
}));
const consumeCompletionAlertDelivery = vi.fn<
  () => Promise<CompletionAlertPresentation>
>(async () => 'none');
const readCompletionAlertStatus = vi.fn<() => Promise<CompletionAlertStatus>>(async () => ({
  permission: 'granted' as const,
  alertsEnabled: true,
  soundsEnabled: true,
  lockScreenEnabled: true,
}));
const requestCompletionAlertPermission = vi.fn<() => Promise<CompletionAlertStatus>>(
  async () => ({
  permission: 'granted' as const,
  alertsEnabled: true,
  soundsEnabled: true,
  lockScreenEnabled: true,
  }),
);

vi.mock('../native/completionAlerts', () => ({
  consumeCompletionAlertDelivery,
  isCompletionAlertPlatform: () => true,
  readCompletionAlertStatus,
  reconcileCompletionAlert,
  requestCompletionAlertPermission,
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
    reconcileCompletionAlert.mockClear();
    readCompletionAlertStatus.mockClear();
    requestCompletionAlertPermission.mockClear();
    consumeCompletionAlertDelivery.mockReset().mockResolvedValue('none');
    playRing.mockClear();
    resumeAudio.mockClear();
    notify.mockClear();
    readCompletionAlertStatus.mockResolvedValue({
      permission: 'granted',
      alertsEnabled: true,
      soundsEnabled: true,
      lockScreenEnabled: true,
    });
    requestCompletionAlertPermission.mockResolvedValue({
      permission: 'granted',
      alertsEnabled: true,
      soundsEnabled: true,
      lockScreenEnabled: true,
    });
  });

  it('replaces and cancels from reducer-owned start, pause, resume, and reset state', async () => {
    render(<Harness />);
    await waitFor(() => expect(readCompletionAlertStatus).toHaveBeenCalled());
    reconcileCompletionAlert.mockClear();

    act(() => bloom.actions.toggle());
    await waitFor(() =>
      expect(reconcileCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          running: true,
          mode: 'focus',
          deadlineMs: expect.any(Number),
          sessionId: bloom.state.openFocus?.id,
          remainingSeconds: null,
        }),
      ),
    );
    const firstDeadline = bloom.state.endsAt;

    act(() => bloom.actions.toggle());
    await waitFor(() =>
      expect(reconcileCompletionAlert).toHaveBeenLastCalledWith({
        enabled: true,
        running: false,
        mode: 'focus',
        deadlineMs: null,
        sessionId: bloom.state.openFocus?.id,
        remainingSeconds: bloom.state.remaining,
      }),
    );

    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.state.running).toBe(true));
    expect(bloom.state.endsAt).not.toBeNull();
    expect(bloom.state.endsAt).toBeGreaterThanOrEqual(firstDeadline ?? 0);

    act(() => bloom.actions.reset());
    await waitFor(() =>
      expect(reconcileCompletionAlert).toHaveBeenLastCalledWith({
        enabled: true,
        running: false,
        mode: 'focus',
        deadlineMs: null,
        sessionId: null,
        remainingSeconds: bloom.state.remaining,
      }),
    );
  });

  it('does not resend native notification metadata on countdown display ticks', async () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      await act(async () => bloom.actions.toggle());
      const initialRemaining = bloom.state.remaining;
      reconcileCompletionAlert.mockClear();
      await act(async () => vi.advanceTimersByTime(3000));
      expect(bloom.state.remaining).toBe(initialRemaining - 3);
      expect(reconcileCompletionAlert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the mirror when Ring when done is switched off', async () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.state.running).toBe(true));

    act(() => bloom.actions.patchSettings({ sound: false }));
    await waitFor(() =>
      expect(reconcileCompletionAlert).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false, running: true }),
      ),
    );
  });

  it('starts the countdown before showing a skippable first-use primer', async () => {
    readCompletionAlertStatus.mockResolvedValue({
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
    expect(requestCompletionAlertPermission).not.toHaveBeenCalled();
  });

  it('schedules the already-running countdown after permission is accepted', async () => {
    readCompletionAlertStatus.mockResolvedValue({
      permission: 'prompt',
      alertsEnabled: false,
      soundsEnabled: false,
      lockScreenEnabled: false,
    });
    render(<Harness />);
    act(() => bloom.actions.toggle());
    await waitFor(() => expect(bloom.completionAlerts.primerOpen).toBe(true));
    reconcileCompletionAlert.mockClear();

    await act(async () => {
      await bloom.completionAlerts.requestPermission();
    });

    expect(bloom.completionAlerts.status.permission).toBe('granted');
    await waitFor(() =>
      expect(reconcileCompletionAlert).toHaveBeenLastCalledWith(
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
    consumeCompletionAlertDelivery.mockResolvedValue('background-system');
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
      expect(consumeCompletionAlertDelivery).toHaveBeenCalledWith(deadlineMs);
      expect(playRing).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays one Web Audio cue after the native foreground presentation was suppressed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    consumeCompletionAlertDelivery.mockResolvedValue('foreground-suppressed');
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

  it('plays one cue for each consecutive Flow finish and does not replay it on record edits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
    try {
      render(<Harness />);
      act(() => bloom.actions.patchSettings({ flow: true }));
      act(() => bloom.actions.pick('flow'));

      for (let run = 1; run <= 2; run++) {
        act(() => bloom.actions.toggle(undefined, 'Read a few pages'));
        vi.setSystemTime(Date.now() + 13 * 60_000);
        await act(async () => bloom.actions.finishFlow());
        expect(bloom.state.justDone).toBe(true);
        expect(playRing).toHaveBeenCalledTimes(run);

        const record = bloom.state.sessionRecords[bloom.state.sessionRecords.length - 1];
        act(() => bloom.actions.setTargetOutcome(record.id, 'done'));
        expect(playRing).toHaveBeenCalledTimes(run);
        act(() => vi.advanceTimersByTime(3600));
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
