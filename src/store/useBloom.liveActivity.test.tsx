// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IOSLiveActivityCommand,
  IOSLiveActivityMutationResult,
  IOSLiveActivitySnapshot,
} from '../native/iosLiveActivity';

const reconcileIOSLiveActivity = vi.fn<
  (
    snapshot: IOSLiveActivitySnapshot | null,
  ) => Promise<IOSLiveActivityMutationResult>
>(async () => ({ supported: true, active: true, changed: true }));
const isIOSLiveActivityPlatform = vi.fn(() => true);
const readIOSLiveActivityStatus = vi.fn(async () => ({
  supported: true,
  enabled: true,
  active: false,
}));
const readPendingIOSLiveActivityCommands = vi.fn<
  () => Promise<IOSLiveActivityCommand[]>
>(async () => []);
const acknowledgeIOSLiveActivityCommands = vi.fn(async () => undefined);

vi.mock('../native/iosLiveActivity', () => ({
  isIOSLiveActivityPlatform,
  readIOSLiveActivityStatus,
  reconcileIOSLiveActivity,
  readPendingIOSLiveActivityCommands,
  acknowledgeIOSLiveActivityCommands,
}));

vi.mock('../engine/audio', () => ({
  audioEngine: {
    playRing: vi.fn(),
    resume: vi.fn(),
  },
  notify: vi.fn(),
}));

const { useBloom } = await import('./useBloom');

let bloom: ReturnType<typeof useBloom>;

function Harness() {
  bloom = useBloom();
  return null;
}

describe('useBloom Live Activity reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    reconcileIOSLiveActivity.mockReset().mockResolvedValue({
      supported: true,
      active: true,
      changed: true,
    });
    isIOSLiveActivityPlatform.mockReturnValue(true);
    readIOSLiveActivityStatus.mockReset().mockResolvedValue({
      supported: true,
      enabled: true,
      active: false,
    });
    readPendingIOSLiveActivityCommands.mockReset().mockResolvedValue([]);
    acknowledgeIOSLiveActivityCommands.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('mirrors start, pause, resume, and terminal state from one stable session', () => {
    render(<Harness />);
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith(null);
    reconcileIOSLiveActivity.mockClear();

    act(() => bloom.actions.toggle());
    const sessionId = bloom.state.openFocus?.id;
    const startedAtMs = bloom.state.openFocus?.startedAt;
    const firstDeadline = bloom.state.endsAt;
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith({
      sessionId,
      mode: 'focus',
      state: 'running',
      startedAtMs,
      deadlineMs: firstDeadline,
      completionAlertsEnabled: true,
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);

    act(() => bloom.actions.toggle());
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith({
      sessionId,
      mode: 'focus',
      state: 'paused',
      startedAtMs,
      remainingSeconds: 1499,
      completionAlertsEnabled: true,
    });

    act(() => bloom.actions.toggle());
    expect(bloom.state.openFocus?.id).toBe(sessionId);
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith({
      sessionId,
      mode: 'focus',
      state: 'running',
      startedAtMs,
      deadlineMs: bloom.state.endsAt,
      completionAlertsEnabled: true,
    });

    act(() => bloom.actions.reset());
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith(null);
  });

  it('mirrors Tiny work but never sends break or Flow timer details', () => {
    render(<Harness />);
    reconcileIOSLiveActivity.mockClear();

    act(() => bloom.actions.pickTiny(2));
    expect(reconcileIOSLiveActivity).not.toHaveBeenCalled();
    act(() => bloom.actions.toggle());
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'tiny', state: 'running' }),
    );

    act(() => bloom.actions.reset());
    expect(reconcileIOSLiveActivity).toHaveBeenLastCalledWith(null);
    reconcileIOSLiveActivity.mockClear();

    act(() => bloom.actions.pick('short'));
    act(() => bloom.actions.toggle());
    act(() => bloom.actions.pick('flow'));
    expect(reconcileIOSLiveActivity).not.toHaveBeenCalled();
  });

  it('ends once when a countdown completes or is skipped', () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());
    const deadlineMs = bloom.state.endsAt!;
    reconcileIOSLiveActivity.mockClear();

    act(() => {
      vi.setSystemTime(deadlineMs);
      vi.advanceTimersByTime(250);
    });

    expect(bloom.state.justDone).toBe(true);
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileIOSLiveActivity).toHaveBeenCalledWith(null);

    act(() => bloom.actions.reset());
    act(() => bloom.actions.toggle());
    reconcileIOSLiveActivity.mockClear();
    act(() => bloom.actions.skip());
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileIOSLiveActivity).toHaveBeenCalledWith(null);
  });

  it('does not recreate a manually dismissed activity on display ticks', () => {
    reconcileIOSLiveActivity.mockResolvedValue({
      supported: true,
      active: false,
      changed: false,
      reason: 'dismissed',
    });
    render(<Harness />);
    reconcileIOSLiveActivity.mockClear();

    act(() => bloom.actions.toggle());
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);
  });

  it('retries an eligible inactive snapshot once when Bloom returns', async () => {
    reconcileIOSLiveActivity.mockResolvedValue({
      supported: true,
      active: false,
      changed: false,
      reason: 'unavailable',
    });
    render(<Harness />);
    reconcileIOSLiveActivity.mockClear();

    await act(async () => {
      bloom.actions.toggle();
      await Promise.resolve();
    });
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(2);
    expect(reconcileIOSLiveActivity.mock.calls[1][0]).toEqual(
      reconcileIOSLiveActivity.mock.calls[0][0],
    );
  });

  it('refreshes system-owned Live Activity availability only on visible return', async () => {
    render(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });
    readIOSLiveActivityStatus.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(readIOSLiveActivityStatus).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(readIOSLiveActivityStatus).toHaveBeenCalledOnce();
  });

  it('performs one idempotent stale cleanup with idle focus-data clear', () => {
    render(<Harness />);
    reconcileIOSLiveActivity.mockClear();

    act(() => bloom.actions.clearFocusData());

    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileIOSLiveActivity).toHaveBeenCalledWith(null);
  });

  it('ends stale native state after relaunch sweeps an open countdown', async () => {
    const first = renderHook(() => useBloom());
    act(() => first.result.current.actions.toggle());
    expect(first.result.current.state.openFocus).not.toBeNull();
    first.unmount();

    reconcileIOSLiveActivity.mockClear();
    const reloaded = renderHook(() => useBloom());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(reloaded.result.current.state.openFocus).toBeNull();
    expect(reloaded.result.current.state.sessionRecords).toEqual([
      expect.objectContaining({ outcome: 'interrupted' }),
    ]);
    expect(reconcileIOSLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileIOSLiveActivity).toHaveBeenCalledWith(null);
    reloaded.unmount();
  });

  it('applies and persists a queued native pause before acknowledging it after relaunch', async () => {
    const first = renderHook(() => useBloom());
    act(() => first.result.current.actions.toggle());
    const open = first.result.current.state.openFocus!;
    first.unmount();

    readPendingIOSLiveActivityCommands.mockResolvedValue([
      {
        id: 'aa11-bb22',
        sessionId: open.id,
        action: 'pause',
        atMs: open.startedAt + 10_000,
        remainingSeconds: 1_490,
      },
    ]);
    const reloaded = renderHook(() => useBloom());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(reloaded.result.current.state.running).toBe(false);
    expect(reloaded.result.current.state.openFocus).toMatchObject({
      id: open.id,
      running: false,
      remainingSec: 1_490,
    });
    expect(reloaded.result.current.state.sessionRecords).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem('bloom-state') ?? '{}').openFocus,
    ).toMatchObject({ id: open.id, running: false, remainingSec: 1_490 });
    expect(acknowledgeIOSLiveActivityCommands).toHaveBeenCalledWith(['aa11-bb22']);
    reloaded.unmount();
  });
});
