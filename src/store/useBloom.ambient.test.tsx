// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the reducer promises about ambient sound: it follows a running work
 * session and nothing else. Breaks are quiet, a finish is quiet, and a paused
 * timer is quiet — a pure selector cannot prove any of that, because all of it
 * is lifecycle.
 */

const set = vi.fn();
const stop = vi.fn();
const current = vi.fn(() => null);

vi.mock('../engine/ambient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/ambient')>();
  return { ...actual, ambientEngine: { set, stop, current } };
});

const resume = vi.fn();
const playRing = vi.fn();
vi.mock('../engine/audio', () => ({
  audioEngine: { resume, playRing },
  notify: vi.fn(),
  requestNotifyPermission: vi.fn(async () => false),
}));

const { useBloom } = await import('./useBloom');

type Bloom = ReturnType<typeof useBloom>;
let bloom: Bloom;

function Harness() {
  bloom = useBloom();
  return null;
}

function setAmbient(choice: 'off' | 'rain' | 'waves' | 'hush') {
  act(() => bloom.actions.patchSettings({ ambient: choice }));
}

beforeEach(() => {
  localStorage.clear();
  set.mockClear();
  stop.mockClear();
  resume.mockClear();
});

afterEach(cleanup);

describe('ambient sound follows the work session', () => {
  it('sounds nothing until a session is actually running', () => {
    render(<Harness />);
    setAmbient('rain');

    // Choosing a scene is not starting one. The reducer is idle, so the last
    // thing the engine was told is that nothing should be playing.
    expect(set).toHaveBeenLastCalledWith(null);
  });

  it('starts the chosen scene when focus starts, and stops when it pauses', () => {
    render(<Harness />);
    setAmbient('waves');

    act(() => bloom.actions.toggle());
    expect(set).toHaveBeenLastCalledWith('waves');

    act(() => bloom.actions.toggle());
    expect(set).toHaveBeenLastCalledWith(null);
  });

  it('unlocks audio from the Start press even when the chime is off', () => {
    render(<Harness />);
    act(() => bloom.actions.patchSettings({ sound: false, ambient: 'hush' }));

    act(() => bloom.actions.toggle());

    // WebView autoplay policy only opens the shared context from a gesture, so
    // a scene chosen with the chime off still has to unlock on Start.
    expect(resume).toHaveBeenCalled();
  });

  it('keeps breaks quiet', () => {
    render(<Harness />);
    setAmbient('rain');

    act(() => bloom.actions.pick('short'));
    act(() => bloom.actions.toggle());

    // A break is the part where you stop; sound to think under has no job here.
    expect(bloom.state.running).toBe(true);
    expect(set).toHaveBeenLastCalledWith(null);
  });

  it('plays under tiny and flow, which are also work', () => {
    render(<Harness />);
    setAmbient('hush');

    act(() => bloom.actions.pick('tiny'));
    act(() => bloom.actions.toggle());
    expect(set).toHaveBeenLastCalledWith('hush');

    act(() => bloom.actions.reset());
    act(() => bloom.actions.pick('flow'));
    act(() => bloom.actions.toggle());
    expect(set).toHaveBeenLastCalledWith('hush');
  });

  it('goes quiet the moment a session finishes, so the chime lands alone', () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      setAmbient('waves');
      act(() => bloom.actions.toggle());
      expect(set).toHaveBeenLastCalledWith('waves');

      const deadline = bloom.state.endsAt!;
      act(() => {
        vi.setSystemTime(deadline + 10);
        vi.advanceTimersByTime(300);
      });

      expect(bloom.state.justDone).toBe(true);
      expect(set).toHaveBeenLastCalledWith(null);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays off when the setting is off, however the timer moves', () => {
    render(<Harness />);
    act(() => bloom.actions.toggle());

    expect(set).not.toHaveBeenCalledWith('rain');
    expect(set).not.toHaveBeenCalledWith('waves');
    expect(set).not.toHaveBeenCalledWith('hush');
  });
});
