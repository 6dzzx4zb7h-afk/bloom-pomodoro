/** @vitest-environment jsdom */

import { useMemo } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FocusScreen } from '../screens/FocusScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import {
  DEFAULT_CADENCE,
  EMPTY_PERSONAL_CADENCE,
  personalCadenceForSurface,
} from '../insights/cadence';
import { DEFAULT_COMPANION } from './companion';
import { DEFAULT_RITUAL } from './ritual';
import { finalizeSession, newOpenSession, type OpenSession } from './sessions';
import {
  DEFAULT_SETTINGS,
  useBloom,
  type BloomState,
  type Settings,
} from './useBloom';
import type { Companion } from './useCompanion';

vi.mock('../components/PixelPal', () => ({
  PixelPal: () => <div data-testid="pixel-pal" />,
}));

const companion = {
  enabled: false,
  conf: DEFAULT_COMPANION,
  prompt: null,
  summary: null,
  actions: { returnDrifted: vi.fn() },
} as unknown as Companion;

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

type ProbeState = Pick<
  BloomState,
  | 'mode'
  | 'running'
  | 'remaining'
  | 'sessions'
  | 'openFocus'
  | 'openFlow'
  | 'sessionRecords'
  | 'flowAcc'
>;

function seedState(
  patch: Record<string, unknown> & { settings?: Partial<Settings> } = {},
) {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    name: 'Mira',
    ...patch.settings,
    durations: {
      ...DEFAULT_SETTINGS.durations,
      ...(patch.settings?.durations ?? {}),
    },
    companion: {
      ...DEFAULT_SETTINGS.companion,
      ...(patch.settings?.companion ?? {}),
    },
  };
  localStorage.setItem(
    'bloom-state',
    JSON.stringify({
      version: 22,
      ritual: { ...DEFAULT_RITUAL, suggestionSeen: true },
      ...patch,
      settings,
    }),
  );
}

function FocusHarness() {
  const bloom = useBloom();
  const probe: ProbeState = {
    mode: bloom.state.mode,
    running: bloom.state.running,
    remaining: bloom.state.remaining,
    sessions: bloom.state.sessions,
    openFocus: bloom.state.openFocus,
    openFlow: bloom.state.openFlow,
    sessionRecords: bloom.state.sessionRecords,
    flowAcc: bloom.state.flowAcc,
  };
  return (
    <>
      <FocusScreen bloom={bloom} companion={companion} onOpenGuideArticle={vi.fn()} />
      <output data-testid="bloom-state">{JSON.stringify(probe)}</output>
    </>
  );
}

function TasksHarness() {
  const bloom = useBloom();
  return (
    <>
      <TasksScreen bloom={bloom} onOpenGuideArticle={vi.fn()} />
      <output data-testid="destructive-state">
        {JSON.stringify({ tasks: bloom.state.tasks, activeTaskId: bloom.state.activeTaskId })}
      </output>
    </>
  );
}

function GoalsHarness() {
  const bloom = useBloom();
  return (
    <>
      <GoalsScreen bloom={bloom} />
      <output data-testid="destructive-state">
        {JSON.stringify({ tasks: bloom.state.tasks, goals: bloom.state.goals })}
      </output>
    </>
  );
}

function destructiveState<T>(): T {
  return JSON.parse(screen.getByTestId('destructive-state').textContent ?? '{}') as T;
}

function stateProbe(): ProbeState {
  return JSON.parse(screen.getByTestId('bloom-state').textContent ?? '{}') as ProbeState;
}

describe('timer lifecycle controls at the hook/component boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T09:00:00'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('Start, Pause, and Reset preserve the open record then abandon it once', () => {
    seedState();
    render(<FocusHarness />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Session target' }), {
      target: { value: 'Draft the first paragraph' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const started = stateProbe();
    expect(started.openFocus).toMatchObject({
      mode: 'focus',
      plannedMin: 25,
      taskId: 1,
      targetText: 'Draft the first paragraph',
    });

    const sessionId = started.openFocus?.id;
    act(() => vi.setSystemTime(new Date(Date.now() + 2 * 60_000)));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const paused = stateProbe();
    expect(paused.remaining).toBe(23 * 60);
    expect(paused.openFocus?.id).toBe(sessionId);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const reset = stateProbe();
    expect(reset.openFocus).toBeNull();
    expect(reset.sessionRecords.filter((record) => record.id === sessionId)).toEqual([
      expect.objectContaining({ outcome: 'abandoned', actualMin: 2 }),
    ]);
  });

  it('Tiny and Skip dispatch one abandonment and never duplicate it', () => {
    seedState();
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    fireEvent.click(screen.getByRole('button', { name: '5 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const sessionId = stateProbe().openFocus?.id;

    act(() => vi.setSystemTime(new Date(Date.now() + 60_000)));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    const skipped = stateProbe();
    expect(skipped.sessionRecords.filter((record) => record.id === sessionId)).toEqual([
      expect.objectContaining({ mode: 'tiny', outcome: 'abandoned', actualMin: 1 }),
    ]);
  });

  it('Flow preview and Finish use the same half-block credit through the real controls', () => {
    seedState({ settings: { flow: true } });
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Flow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      vi.setSystemTime(new Date(Date.now() + 12.5 * 60_000));
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText(/1 bloom on the clock/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish flow session' }));

    const finished = stateProbe();
    expect(finished.sessions).toBe(1);
    expect(finished.openFlow).toBeNull();
    expect(finished.sessionRecords).toEqual([
      expect.objectContaining({ mode: 'flow', outcome: 'completed', actualMin: 12.5 }),
    ]);
  });

  it('the return control restores the exact captured countdown without finalizing', () => {
    const openFocus = newOpenSession('focus', 25, 1, undefined, Date.now() - 10 * 60_000);
    openFocus.endsAt = Date.now() + 5 * 60_000;
    openFocus.returnSnapshot = {
      capturedAt: Date.now() - 2 * 60_000,
      returnedAt: Date.now(),
      elapsedSec: 10 * 60,
      remainingSec: 15 * 60,
      mode: 'focus',
      round: 1,
      sessionId: openFocus.id,
    };
    seedState({ openFocus });
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'pause it back' }));

    const paused = stateProbe();
    expect(paused.running).toBe(false);
    expect(paused.remaining).toBe(15 * 60);
    expect(paused.openFocus).toMatchObject({ id: openFocus.id, remainingSec: 15 * 60 });
    expect(paused.openFocus?.returnSnapshot).toBeUndefined();
    expect(paused.sessionRecords).toHaveLength(0);
  });

  it('reload sweeps one interrupted record once, and its control resumes the same session', () => {
    const openFocus: OpenSession = {
      ...newOpenSession('focus', 25, 1, undefined, Date.now() - 5 * 60_000),
      endsAt: Date.now() + 20 * 60_000,
    };
    seedState({ openFocus });

    const first = renderHook(() => useBloom());
    expect(first.result.current.state.sessionRecords).toEqual([
      expect.objectContaining({ id: openFocus.id, outcome: 'interrupted' }),
    ]);
    first.unmount();

    const second = renderHook(() => useBloom());
    expect(second.result.current.state.sessionRecords.filter((record) => record.id === openFocus.id))
      .toHaveLength(1);
    second.unmount();

    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'resume from here' }));

    const resumed = stateProbe();
    expect(resumed.running).toBe(true);
    expect(resumed.openFocus?.id).toBe(openFocus.id);
    expect(resumed.sessionRecords.filter((record) => record.id === openFocus.id)).toHaveLength(0);
  });

  it('clears reflection history and companion events, then stays clear after reload', () => {
    const record = finalizeSession(newOpenSession('focus', 25, 1), 'completed', 25);
    const task = { id: 1, t: 'Keep task credit', done: true, pomos: 3, goal: 3 };
    const goal = {
      id: 4,
      title: 'Keep goal progress',
      due: '2026-08-01',
      target: 8,
      done: 3,
      createdAt: Date.now() - 86400000,
    };
    seedState({
      sessions: 6,
      streak: 4,
      palXp: { Mochi: 5 },
      tasks: [task],
      goals: [goal],
      sessionRecords: [record],
      lastWeeklyReviewWeek: '2026-07-13',
      personalCadence: {
        computedAt: Date.now(),
        recommendation: {
          preset: { id: '20-5', label: '20 / 5', focusMin: 20, breakMin: 5 },
          kind: 'shrink',
          text: 'try a shorter block',
          because: 'recent history',
          evidenceKey: 'breaks-are-fuel',
          rungs: {
            shorter: { id: '15-4', label: '15 / 4', focusMin: 15, breakMin: 4 },
            current: { id: '20-5', label: '20 / 5', focusMin: 20, breakMin: 5 },
            longer: { id: '25-5', label: '25 / 5', focusMin: 25, breakMin: 5 },
          },
        },
        history: [{ focusMin: 25, breakMin: 5 }],
      },
    });
    localStorage.setItem(
      'bloom-companion-v1',
      JSON.stringify({
        version: 2,
        events: [{ id: 'e-1', ts: Date.now(), min: 5, len: 25, kind: 'focused', src: 'checkin' }],
      }),
    );

    const first = renderHook(() => useBloom());
    act(() => first.result.current.actions.clearFocusData());

    expect(first.result.current.state.sessionRecords).toEqual([]);
    expect(first.result.current.state.personalCadence).toEqual({
      computedAt: null,
      recommendation: null,
      history: [{ focusMin: 25, breakMin: 5 }],
    });
    expect(first.result.current.state).toMatchObject({
      sessions: 6,
      streak: 4,
      palXp: { Mochi: 5 },
      tasks: [task],
      goals: [goal],
    });
    expect(localStorage.getItem('bloom-companion-v1')).toBeNull();
    first.unmount();

    const reloaded = renderHook(() => useBloom());
    expect(reloaded.result.current.state.sessionRecords).toEqual([]);
    expect(reloaded.result.current.state.personalCadence.recommendation).toBeNull();
    expect(reloaded.result.current.state.tasks).toEqual([task]);
    expect(reloaded.result.current.state.goals).toEqual([goal]);
    reloaded.unmount();
  });
});

describe('safe destructive controls', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T09:00:00'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes a task and restores its full snapshot through the undo toast', () => {
    const task = {
      id: 7,
      t: 'Keep every cherry',
      done: false,
      pomos: 3,
      goal: 4,
    };
    seedState({ tasks: [task], activeTaskId: 7 });
    render(<TasksHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Keep every cherry' }));
    expect(destructiveState<{ tasks: unknown[] }>().tasks).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(destructiveState<{ tasks: unknown[]; activeTaskId: number }>()).toEqual({
      tasks: [task],
      activeTaskId: 7,
    });
  });

  it('asks before removing a progressed goal, then undo restores progress and links', () => {
    const goal = {
      id: 4,
      title: 'Read eight chapters',
      due: '2026-08-01',
      target: 8,
      done: 3,
      createdAt: Date.now() - 86400000,
    };
    const task = { id: 2, t: 'Chapter four', done: false, pomos: 1, goal: 2, goalId: 4 };
    seedState({ tasks: [task], goals: [goal], activeTaskId: 2 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<GoalsHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Read eight chapters' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(destructiveState<{ goals: unknown[] }>().goals).toEqual([goal]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Read eight chapters' }));
    expect(destructiveState<{ goals: unknown[] }>().goals).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(destructiveState<{ tasks: unknown[]; goals: unknown[] }>()).toEqual({
      tasks: [task],
      goals: [goal],
    });
  });
});

describe('store-owned local day rollover', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it('updates date-derived screens and sweeps comeback state once at the boundary', () => {
    const before = new Date(2026, 6, 19, 23, 59, 59, 900);
    vi.setSystemTime(before);
    seedState({
      streak: 4,
      lastFocusDay: '2026-07-17',
      restDayUsedOn: null,
      comeBack: false,
    });

    render(<FocusHarness />);
    expect(screen.queryByText('welcome back 🌱')).toBeNull();

    act(() => vi.advanceTimersByTime(101));

    expect(screen.getByText('welcome back 🌱')).toBeTruthy();
    const persisted = JSON.parse(localStorage.getItem('bloom-state') ?? '{}') as BloomState;
    expect(persisted.comeBack).toBe(true);

    cleanup();
    render(<TasksHarness />);
    expect(screen.getByText(/Monday · July 20/)).toBeTruthy();
    cleanup();
    render(<GoalsHarness />);
    expect(screen.getByLabelText('Due date').getAttribute('min')).toBe('2026-07-20');
  });

  it('catches up on visible foreground across a day and ignores hidden changes', () => {
    vi.setSystemTime(new Date(2026, 6, 19, 9, 0, 0));
    const hook = renderHook(() => useBloom());
    expect(hook.result.current.today).toBe('2026-07-19');

    vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(hook.result.current.today).toBe('2026-07-19');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(hook.result.current.today).toBe('2026-07-20');
    expect(hook.result.current.now).toBe(Date.now());
  });

  it('keeps same-day foreground checks referentially stable for now-keyed work', () => {
    vi.setSystemTime(new Date(2026, 6, 19, 9, 0, 0));
    let computations = 0;
    const hook = renderHook(() => {
      const bloom = useBloom();
      const keyed = useMemo(() => {
        computations += 1;
        return bloom.now;
      }, [bloom.now]);
      return { bloom, keyed };
    });
    const initialState = hook.result.current.bloom.state;

    vi.setSystemTime(new Date(2026, 6, 19, 15, 0, 0));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(hook.result.current.bloom.state).toBe(initialState);
    expect(hook.result.current.keyed).toBe(initialState.now);
    expect(computations).toBe(1);
  });

  it('honors a configured study-day boundary while the store owns scheduling', () => {
    const before = new Date(2026, 6, 20, 3, 59, 59, 900);
    vi.setSystemTime(before);
    const hook = renderHook(() => useBloom(4));
    expect(hook.result.current.today).toBe('2026-07-19');

    act(() => vi.advanceTimersByTime(101));

    expect(hook.result.current.today).toBe('2026-07-20');
    expect(new Date(hook.result.current.now).getHours()).toBe(4);
  });
});

describe('cadence cache clock ownership', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T09:00:00'));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stamps computedAt inside the store action at write time', () => {
    seedState({ personalCadence: EMPTY_PERSONAL_CADENCE });
    const hook = renderHook(() => useBloom());
    const writtenAt = new Date('2026-07-16T15:42:00').getTime();
    vi.setSystemTime(writtenAt);
    const recommendation = personalCadenceForSurface(
      EMPTY_PERSONAL_CADENCE,
      [],
      [],
      'notSure',
      DEFAULT_CADENCE,
      writtenAt,
    );

    act(() => hook.result.current.actions.cachePersonalCadence(recommendation));

    expect(hook.result.current.state.personalCadence).toMatchObject({
      computedAt: writtenAt,
      recommendation,
    });
    hook.unmount();
  });
});
