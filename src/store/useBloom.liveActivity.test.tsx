// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LiveActivityMutationResult,
  LiveActivitySnapshot,
} from '../native/liveActivity';

const reconcileLiveActivity = vi.fn<
  (
    snapshot: LiveActivitySnapshot | null,
  ) => Promise<LiveActivityMutationResult>
>(async () => ({ supported: true, active: true, changed: true }));
const isLiveActivityPlatform = vi.fn(() => true);
const readLiveActivityStatus = vi.fn(async () => ({
  supported: true,
  enabled: true,
  active: false,
}));

vi.mock('../native/liveActivity', () => ({
  isLiveActivityPlatform,
  readLiveActivityStatus,
  reconcileLiveActivity,
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
    reconcileLiveActivity.mockReset().mockResolvedValue({
      supported: true,
      active: true,
      changed: true,
    });
    isLiveActivityPlatform.mockReturnValue(true);
    readLiveActivityStatus.mockReset().mockResolvedValue({
      supported: true,
      enabled: true,
      active: false,
    });
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
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith(null);
    reconcileLiveActivity.mockClear();

    act(() => bloom.actions.toggle());
    const sessionId = bloom.state.openFocus?.id;
    const startedAtMs = bloom.state.openFocus?.startedAt;
    const firstDeadline = bloom.state.endsAt;
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith({
      sessionId,
      mode: 'focus',
      state: 'running',
      startedAtMs,
      deadlineMs: firstDeadline,
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);

    act(() => bloom.actions.toggle());
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith({
      sessionId,
      mode: 'focus',
      state: 'paused',
      startedAtMs,
      remainingSeconds: 1499,
    });

    act(() => bloom.actions.toggle());
    expect(bloom.state.openFocus?.id).toBe(sessionId);
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith({
      sessionId,
      mode: 'focus',
      state: 'running',
      startedAtMs,
      deadlineMs: bloom.state.endsAt,
    });

    act(() => bloom.actions.reset());
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith(null);
  });

  it('mirrors Tiny work but never sends break or Flow timer details', () => {
    render(<Harness />);
    reconcileLiveActivity.mockClear();

    act(() => bloom.actions.pickTiny(2));
    expect(reconcileLiveActivity).not.toHaveBeenCalled();
    act(() => bloom.actions.toggle());
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'tiny', state: 'running' }),
    );

    act(() => bloom.actions.reset());
    expect(reconcileLiveActivity).toHaveBeenLastCalledWith(null);
    reconcileLiveActivity.mockClear();

    act(() => bloom.actions.pick('short'));
    act(() => bloom.actions.toggle());
    act(() => bloom.actions.pick('flow'));
    expect(reconcileLiveActivity).not.toHaveBeenCalled();
  });

  it('ends once when a countdown completes or is skipped', () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());
    const deadlineMs = bloom.state.endsAt!;
    reconcileLiveActivity.mockClear();

    act(() => {
      vi.setSystemTime(deadlineMs);
      vi.advanceTimersByTime(250);
    });

    expect(bloom.state.justDone).toBe(true);
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileLiveActivity).toHaveBeenCalledWith(null);

    act(() => bloom.actions.reset());
    act(() => bloom.actions.toggle());
    reconcileLiveActivity.mockClear();
    act(() => bloom.actions.skip());
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileLiveActivity).toHaveBeenCalledWith(null);
  });

  it('does not recreate a manually dismissed activity on display ticks', () => {
    reconcileLiveActivity.mockResolvedValue({
      supported: true,
      active: false,
      changed: false,
      reason: 'dismissed',
    });
    render(<Harness />);
    reconcileLiveActivity.mockClear();

    act(() => bloom.actions.toggle());
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);
  });

  it('retries an eligible inactive snapshot once when Bloom returns', async () => {
    reconcileLiveActivity.mockResolvedValue({
      supported: true,
      active: false,
      changed: false,
      reason: 'unavailable',
    });
    render(<Harness />);
    reconcileLiveActivity.mockClear();

    await act(async () => {
      bloom.actions.toggle();
      await Promise.resolve();
    });
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(2);
    expect(reconcileLiveActivity.mock.calls[1][0]).toEqual(
      reconcileLiveActivity.mock.calls[0][0],
    );
  });

  it('performs one idempotent stale cleanup with idle focus-data clear', () => {
    render(<Harness />);
    reconcileLiveActivity.mockClear();

    act(() => bloom.actions.clearFocusData());

    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileLiveActivity).toHaveBeenCalledWith(null);
  });

  it('ends stale native state after relaunch sweeps an open countdown', () => {
    const first = renderHook(() => useBloom());
    act(() => first.result.current.actions.toggle());
    expect(first.result.current.state.openFocus).not.toBeNull();
    first.unmount();

    reconcileLiveActivity.mockClear();
    const reloaded = renderHook(() => useBloom());

    expect(reloaded.result.current.state.openFocus).toBeNull();
    expect(reloaded.result.current.state.sessionRecords).toEqual([
      expect.objectContaining({ outcome: 'interrupted' }),
    ]);
    expect(reconcileLiveActivity).toHaveBeenCalledTimes(1);
    expect(reconcileLiveActivity).toHaveBeenCalledWith(null);
    reloaded.unmount();
  });
});
