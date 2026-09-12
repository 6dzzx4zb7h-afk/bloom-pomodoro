// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ambient scenes are synthesized, so what is worth proving here is the
 * graph the engine builds and — more importantly — what it refuses to build.
 * jsdom has no Web Audio, so the context is a recording stub: the assertions
 * are about the calls Bloom makes, which is exactly the surface that decides
 * whether a sound starts, keeps looping, or stops.
 */

interface FakeParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

function param(value = 0): FakeParam {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function node<T extends object>(extra: T) {
  return {
    connect: vi.fn(function (this: unknown, target: unknown) {
      return target;
    }),
    disconnect: vi.fn(),
    ...extra,
  };
}

const created = {
  sources: [] as ReturnType<typeof makeSource>[],
  gains: [] as ReturnType<typeof makeGain>[],
  oscillators: [] as ReturnType<typeof makeOscillator>[],
  filters: [] as ReturnType<typeof makeFilter>[],
};

function makeSource() {
  const source = node({
    buffer: null as AudioBuffer | null,
    loop: false,
    start: vi.fn(),
    stop: vi.fn(),
  });
  created.sources.push(source);
  return source;
}

function makeGain() {
  const gain = node({ gain: param(1) });
  created.gains.push(gain);
  return gain;
}

function makeOscillator() {
  const osc = node({
    type: '',
    frequency: param(0),
    start: vi.fn(),
    stop: vi.fn(),
  });
  created.oscillators.push(osc);
  return osc;
}

function makeFilter() {
  const filter = node({ type: '', frequency: param(0) });
  created.filters.push(filter);
  return filter;
}

const createBuffer = vi.fn((_channels: number, frames: number, rate: number) => {
  const data = new Float32Array(frames);
  return {
    length: frames,
    sampleRate: rate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
});

const state = { value: 'running' as AudioContextState };
const resume = vi.fn(async () => {});

class FakeAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  get state() {
    return state.value;
  }
  resume = resume;
  createBuffer = createBuffer;
  createBufferSource = makeSource;
  createGain = makeGain;
  createBiquadFilter = makeFilter;
  createOscillator = makeOscillator;
}

vi.stubGlobal('AudioContext', FakeAudioContext);

const { ambientEngine, isAmbientChoice, AMBIENT_CHOICES } = await import('./ambient');
const { resetAudioForTests, unlockAudio } = await import('./audioContext');

beforeEach(() => {
  created.sources.length = 0;
  created.gains.length = 0;
  created.oscillators.length = 0;
  created.filters.length = 0;
  createBuffer.mockClear();
  resume.mockClear();
  state.value = 'running';
  ambientEngine.stop();
  resetAudioForTests();
});

afterEach(() => {
  ambientEngine.stop();
  vi.useRealTimers();
});

describe('the ambient scene refuses to start on its own', () => {
  it('stays silent until a user gesture has unlocked audio', () => {
    // WebView autoplay policy would block it anyway; this makes the intent
    // explicit rather than leaving it to the platform. Forced audio is on the
    // do-not-build list, and an unrequested sound is exactly that.
    ambientEngine.set('rain');

    expect(ambientEngine.current()).toBeNull();
    expect(created.sources).toHaveLength(0);
  });

  it('starts once the gesture has happened', () => {
    unlockAudio();
    ambientEngine.set('rain');

    expect(ambientEngine.current()).toBe('rain');
    expect(created.sources).toHaveLength(1);
    expect(created.sources[0].loop).toBe(true);
    expect(created.sources[0].start).toHaveBeenCalledTimes(1);
  });
});

describe('the running scene', () => {
  beforeEach(() => unlockAudio());

  it('does not restart when the same scene is asked for again', () => {
    ambientEngine.set('hush');
    ambientEngine.set('hush');
    ambientEngine.set('hush');

    // A re-render must never produce a second loop over the first, or a
    // restart that the listener hears as a stutter.
    expect(created.sources).toHaveLength(1);
    expect(ambientEngine.current()).toBe('hush');
  });

  it('replaces the graph when the scene changes', () => {
    vi.useFakeTimers();
    ambientEngine.set('rain');
    const first = created.sources[0];
    ambientEngine.set('waves');

    expect(created.sources).toHaveLength(2);
    expect(ambientEngine.current()).toBe('waves');
    // The outgoing loop fades rather than cutting, then is released — it is
    // never left running underneath the scene that replaced it.
    expect(first.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(first.stop).toHaveBeenCalled();
  });

  it('fades in rather than cutting in', () => {
    ambientEngine.set('hush');
    const gain = created.gains[0];

    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 0);
    const [target, when] = gain.gain.linearRampToValueAtTime.mock.calls[0];
    expect(target).toBeGreaterThan(0.0001);
    expect(when).toBeGreaterThan(0);
  });

  it('gives the moving scenes an LFO and leaves the steady one alone', () => {
    ambientEngine.set('waves');
    expect(created.oscillators).toHaveLength(1);

    ambientEngine.set('hush');
    // Still one — hush is deliberately motionless, so no new oscillator.
    expect(created.oscillators).toHaveLength(1);
  });

  it('reuses one noise buffer per colour instead of regenerating it', () => {
    ambientEngine.set('waves');
    ambientEngine.set('hush');
    ambientEngine.set('waves');

    // waves and hush are both brown; rain is the only white scene.
    expect(createBuffer).toHaveBeenCalledTimes(1);
  });

  it('stops on request, and reports nothing playing immediately', () => {
    vi.useFakeTimers();
    ambientEngine.set('rain');
    const source = created.sources[0];

    ambientEngine.stop();
    expect(ambientEngine.current()).toBeNull();

    // The audible tail is a short fade, so the node is released after it.
    vi.advanceTimersByTime(1000);
    expect(source.stop).toHaveBeenCalled();
  });

  it('still releases an outgoing scene when stop is requested twice during its fade', () => {
    vi.useFakeTimers();
    ambientEngine.set('rain');
    const source = created.sources[0];
    const lfo = created.oscillators[0];

    ambientEngine.stop();
    vi.advanceTimersByTime(100);
    ambientEngine.stop();
    vi.advanceTimersByTime(1000);

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(lfo.stop).toHaveBeenCalledTimes(1);
    expect(lfo.disconnect).toHaveBeenCalledTimes(1);
  });

  it('releases every outgoing graph when scenes change before their fades finish', () => {
    vi.useFakeTimers();
    ambientEngine.set('rain');
    vi.advanceTimersByTime(100);
    ambientEngine.set('waves');
    vi.advanceTimersByTime(100);
    ambientEngine.set('hush');
    vi.advanceTimersByTime(1000);

    expect(ambientEngine.current()).toBe('hush');
    for (const source of created.sources.slice(0, 2)) {
      expect(source.stop).toHaveBeenCalledTimes(1);
      expect(source.disconnect).toHaveBeenCalledTimes(1);
    }
    for (const lfo of created.oscillators) {
      expect(lfo.stop).toHaveBeenCalledTimes(1);
      expect(lfo.disconnect).toHaveBeenCalledTimes(1);
    }
    expect(created.sources[2].stop).not.toHaveBeenCalled();
  });

  it('resumes a context the system suspended while Bloom was away', () => {
    ambientEngine.set('rain');
    resume.mockClear();
    state.value = 'suspended';

    ambientEngine.set('rain');

    expect(resume).toHaveBeenCalled();
    // And it is still the same loop, not a restarted one.
    expect(created.sources).toHaveLength(1);
  });
});

describe('the choice list', () => {
  it('offers off first, and every scene the engine can build', () => {
    expect(AMBIENT_CHOICES[0].id).toBe('off');
    expect(AMBIENT_CHOICES.map((choice) => choice.id)).toEqual([
      'off',
      'rain',
      'waves',
      'hush',
    ]);
  });

  it('rejects anything that is not a scene, including the old boolean', () => {
    expect(isAmbientChoice('off')).toBe(true);
    expect(isAmbientChoice('rain')).toBe(true);
    // v30's `bgSound` was a different shape and must never be read as a scene.
    expect(isAmbientChoice(true)).toBe(false);
    expect(isAmbientChoice('coffee')).toBe(false);
    expect(isAmbientChoice(undefined)).toBe(false);
    expect(isAmbientChoice(null)).toBe(false);
  });
});
