// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IOSCommand } from '../native/iosCommands';

/**
 * PLAN 13.18 — the command channel from system UI back to the reducer.
 *
 * The property under test throughout is that replay is *lossless*: a control
 * pressed while the WebView was suspended must produce exactly the state that
 * pressing it live would have produced at that instant, not at drain time.
 * That is the entire reason this channel can exist without the native layer
 * becoming a second timer authority (docs/adr/0001-native-command-channel.md).
 */

const drainIOSCommands = vi.fn<() => Promise<IOSCommand[]>>(async () => []);
const acknowledgeIOSCommands = vi.fn(async () => undefined);
const clearIOSCommands = vi.fn(async () => undefined);

vi.mock('../native/iosCommands', () => ({
  acknowledgeIOSCommands,
  clearIOSCommands,
  drainIOSCommands,
  isIOSCommandPlatform: () => true,
}));

vi.mock('../native/iosAlarm', () => ({
  cancelIOSAlarm: vi.fn(async () => undefined),
  consumeIOSAlarmDelivery: vi.fn(async () => 'none' as const),
  isIOSAlarmPlatform: () => false,
  readIOSAlarmStatus: async () => ({
    supported: false,
    authorization: 'unsupported' as const,
  }),
  reconcileIOSAlarm: vi.fn(async () => ({
    owns: false,
    supported: false,
    authorization: 'unsupported' as const,
  })),
  requestIOSAlarmAuthorization: async () => ({
    supported: false,
    authorization: 'unsupported' as const,
  }),
  UNSUPPORTED_ALARM_STATUS: { supported: false, authorization: 'unsupported' },
}));

vi.mock('../native/completionAlerts', () => ({
  consumeCompletionAlertDelivery: vi.fn(async () => 'none' as const),
  isCompletionAlertPlatform: () => false,
  readCompletionAlertStatus: async () => ({
    permission: 'unsupported' as const,
    alertsEnabled: false,
    soundsEnabled: false,
    lockScreenEnabled: false,
  }),
  reconcileCompletionAlert: vi.fn(async () => ({
    scheduled: false,
    permission: 'unsupported' as const,
  })),
  requestCompletionAlertPermission: async () => ({
    permission: 'unsupported' as const,
    alertsEnabled: false,
    soundsEnabled: false,
    lockScreenEnabled: false,
  }),
  UNSUPPORTED_COMPLETION_ALERT_STATUS: {
    permission: 'unsupported',
    alertsEnabled: false,
    soundsEnabled: false,
    lockScreenEnabled: false,
  },
}));

vi.mock('../native/liveActivity', () => ({
  isLiveActivityPlatform: () => false,
  readLiveActivityStatus: async () => ({
    supported: false,
    enabled: false,
    active: false,
  }),
  reconcileLiveActivity: vi.fn(async () => ({
    supported: false,
    active: false,
    changed: false,
  })),
}));

vi.mock('../engine/audio', () => ({
  audioEngine: { playRing: vi.fn(), resume: vi.fn() },
  notify: vi.fn(),
}));

const { useBloom } = await import('./useBloom');

let bloom: ReturnType<typeof useBloom>;

function Harness() {
  bloom = useBloom();
  return null;
}

let nextId = 0;
const command = (over: Partial<IOSCommand> = {}): IOSCommand => ({
  id: `cmd-${++nextId}`,
  kind: 'pause',
  sessionId: bloom.state.openFocus?.id ?? 'missing',
  occurredAt: Date.now(),
  ...over,
});

/** Wake the WebView the way iOS does after an intent runs in the app process. */
async function resumeApp() {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
}

/** Start a focus session and hand back its wall-clock deadline. */
async function startFocus() {
  await act(async () => {
    bloom.actions.toggle();
    await Promise.resolve();
  });
  return bloom.state.endsAt!;
}

beforeEach(() => {
  localStorage.clear();
  nextId = 0;
  drainIOSCommands.mockReset().mockResolvedValue([]);
  acknowledgeIOSCommands.mockClear();
  clearIOSCommands.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('replaying a command against the clock it carries (PLAN 13.18)', () => {
  it('pauses at the instant the button was pressed, not the instant of the drain', async () => {
    render(<Harness />);
    const endsAt = await startFocus();
    expect(bloom.state.running).toBe(true);

    // Pressed on a locked screen with exactly twenty minutes left. The drain
    // happens now — later, by an amount the reducer must ignore.
    const pressedAt = endsAt - 20 * 60 * 1000;
    drainIOSCommands.mockResolvedValue([
      command({ kind: 'pause', occurredAt: pressedAt }),
    ]);
    await resumeApp();

    await waitFor(() => expect(bloom.state.running).toBe(false));
    expect(bloom.state.remaining).toBe(20 * 60);
    expect(bloom.state.endsAt).toBeNull();
  });

  it('resumes onto a deadline measured from the press, so time spent asleep still counts', async () => {
    render(<Harness />);
    await startFocus();
    await act(async () => {
      bloom.actions.toggle();
      await Promise.resolve();
    });
    const remaining = bloom.state.remaining;
    expect(bloom.state.running).toBe(false);

    const pressedAt = Date.now() - 30_000;
    drainIOSCommands.mockResolvedValue([
      command({ kind: 'resume', occurredAt: pressedAt }),
    ]);
    await resumeApp();

    await waitFor(() => expect(bloom.state.running).toBe(true));
    // Thirty seconds genuinely elapsed while the phone was locked and the
    // session was running, so the deadline is thirty seconds earlier than a
    // live resume would have produced.
    expect(bloom.state.endsAt).toBeCloseTo(pressedAt + remaining * 1000, -2);
  });

  it('keeps the paused snapshot on the open session record', async () => {
    render(<Harness />);
    const endsAt = await startFocus();
    drainIOSCommands.mockResolvedValue([
      command({ kind: 'pause', occurredAt: endsAt - 15 * 60 * 1000 }),
    ]);
    await resumeApp();

    await waitFor(() => expect(bloom.state.openFocus?.running).toBe(false));
    expect(bloom.state.openFocus?.remainingSec).toBe(15 * 60);
    expect(bloom.state.openFocus?.endsAt).toBeNull();
  });
});

describe('idempotency and ordering', () => {
  it('applies a re-delivered command exactly once', async () => {
    render(<Harness />);
    const endsAt = await startFocus();
    const pause = command({ kind: 'pause', occurredAt: endsAt - 10 * 60 * 1000 });

    drainIOSCommands.mockResolvedValue([pause]);
    await resumeApp();
    await waitFor(() => expect(bloom.state.running).toBe(false));
    const afterFirst = bloom.state.remaining;

    // Acknowledgement was lost; iOS hands back the same command.
    await resumeApp();
    await resumeApp();
    expect(bloom.state.running).toBe(false);
    expect(bloom.state.remaining).toBe(afterFirst);
  });

  it('applies a pause and a resume from one drain in press order', async () => {
    render(<Harness />);
    const endsAt = await startFocus();
    const pausedAt = endsAt - 20 * 60 * 1000;
    const resumedAt = pausedAt + 60_000;

    drainIOSCommands.mockResolvedValue([
      command({ kind: 'pause', occurredAt: pausedAt }),
      command({ kind: 'resume', occurredAt: resumedAt }),
    ]);
    await resumeApp();

    await waitFor(() => expect(bloom.state.running).toBe(true));
    // Paused with 20:00 left, resumed a minute later — the deadline is 20:00
    // after the resume, and the minute paused is not silently consumed.
    expect(bloom.state.endsAt).toBeCloseTo(resumedAt + 20 * 60 * 1000, -2);
  });

  it('ignores a command asking for the state the timer is already in', async () => {
    render(<Harness />);
    await startFocus();
    await act(async () => {
      bloom.actions.toggle();
      await Promise.resolve();
    });
    expect(bloom.state.running).toBe(false);
    const remaining = bloom.state.remaining;

    // A stray second pause must not invert the timer into running.
    drainIOSCommands.mockResolvedValue([
      command({ kind: 'pause', occurredAt: Date.now() }),
    ]);
    await resumeApp();

    expect(bloom.state.running).toBe(false);
    expect(bloom.state.remaining).toBe(remaining);
  });
});

describe('commands that must never apply', () => {
  it('drops a command for a session that no longer exists', async () => {
    render(<Harness />);
    await startFocus();

    drainIOSCommands.mockResolvedValue([
      command({ kind: 'pause', sessionId: 'a-session-from-a-past-life' }),
    ]);
    await resumeApp();

    expect(bloom.state.running).toBe(true);
  });

  it('cannot revive a session when none is open', async () => {
    render(<Harness />);
    expect(bloom.state.openFocus).toBeNull();

    drainIOSCommands.mockResolvedValue([
      command({ kind: 'resume', sessionId: 'closed-by-the-boot-sweep' }),
    ]);
    await resumeApp();

    expect(bloom.state.running).toBe(false);
    expect(bloom.state.openFocus).toBeNull();
  });

  it('never writes a session record', async () => {
    render(<Harness />);
    const endsAt = await startFocus();
    const recordsBefore = bloom.state.sessionRecords.length;
    const countBefore = bloom.state.sessions;

    drainIOSCommands.mockResolvedValue([
      command({ kind: 'pause', occurredAt: endsAt - 60_000 }),
      command({ kind: 'resume', occurredAt: endsAt - 30_000 }),
    ]);
    await resumeApp();

    await waitFor(() => expect(bloom.state.running).toBe(true));
    // Commands express intent; only the ordinary reducer transitions finalize a
    // session, and neither pausing nor resuming is one.
    expect(bloom.state.sessionRecords.length).toBe(recordsBefore);
    expect(bloom.state.sessions).toBe(countBefore);
  });
});

describe('acknowledgement', () => {
  it('acknowledges applied and deliberately dropped commands alike', async () => {
    render(<Harness />);
    await startFocus();

    const applied = command({ kind: 'pause' });
    const dropped = command({ kind: 'pause', sessionId: 'gone' });
    drainIOSCommands.mockResolvedValue([applied, dropped]);
    await resumeApp();

    // A command that can never apply must not be re-delivered forever.
    await waitFor(() =>
      expect(acknowledgeIOSCommands).toHaveBeenCalledWith([applied.id, dropped.id]),
    );
  });

  it('makes no bridge call when the queue is empty', async () => {
    render(<Harness />);
    await resumeApp();
    expect(acknowledgeIOSCommands).not.toHaveBeenCalled();
  });
});

describe('data clear', () => {
  it('drops pending intent when focus data is cleared', async () => {
    render(<Harness />);
    await act(async () => {
      bloom.actions.clearFocusData();
      await Promise.resolve();
    });
    expect(clearIOSCommands).toHaveBeenCalled();
  });
});
