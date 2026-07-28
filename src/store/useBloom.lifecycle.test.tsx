/** @vitest-environment jsdom */

import { useMemo } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FocusScreen } from '../screens/FocusScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import {
  DEFAULT_CADENCE,
  EMPTY_PERSONAL_CADENCE,
  personalCadenceForSurface,
} from '../insights/cadence';
import { audioEngine } from '../engine/audio';
import { DEFAULT_COMPANION, loadEvents } from './companion';
import { DEFAULT_RITUAL } from './ritual';
import { finalizeSession, newOpenSession, type OpenSession } from './sessions';
import {
  DEFAULT_SETTINGS,
  useBloom,
  type BloomState,
  type Settings,
} from './useBloom';
import { useCompanion, type Companion } from './useCompanion';

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
  | 'justDone'
  | 'sessions'
  | 'openFocus'
  | 'openFlow'
  | 'sessionRecords'
  | 'flowAcc'
  | 'goals'
  | 'goalLedger'
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
      version: 24,
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
    justDone: bloom.state.justDone,
    sessions: bloom.state.sessions,
    openFocus: bloom.state.openFocus,
    openFlow: bloom.state.openFlow,
    sessionRecords: bloom.state.sessionRecords,
    flowAcc: bloom.state.flowAcc,
    goals: bloom.state.goals,
    goalLedger: bloom.state.goalLedger,
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
      <output data-testid="task-goals-state">{JSON.stringify(bloom.state.goals)}</output>
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
      <output data-testid="goal-ledger-state">{JSON.stringify(bloom.state.goalLedger)}</output>
      <output data-testid="day-plan-state">
        {JSON.stringify({
          dayPlan: bloom.state.dayPlan,
          lastRolloverOfferDay: bloom.state.lastRolloverOfferDay,
        })}
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('arms a daily goal target for the next session without changing the active task link', () => {
    seedState({
      version: 27,
      settings: { planner: true, goalCredit: 'ask' },
      tasks: [{ id: 1, t: 'Read notes', done: false, pomos: 0, goal: 2 }],
      activeTaskId: 1,
      goals: [{
        id: 9,
        title: 'Biology review',
        due: '2026-07-30',
        target: 8,
        done: 0,
        unit: 'lectures',
        createdAt: Date.now(),
      }],
      dayPlan: {
        targets: [{
          id: 'dt-test',
          dayKey: '2026-07-16',
          goalId: 9,
          plannedAmount: 2,
          snapshot: { title: 'Biology review', unit: 'lectures' },
          createdAt: Date.now(),
        }],
        archive: [],
      },
    });

    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'count next session' }));
    expect(screen.getByRole('button', { name: 'armed ✓' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(stateProbe().openFocus).toMatchObject({ taskId: 1, goalId: 9 });
  });

  it('orders the fresh-session path as task, target, optional prep, then Start', () => {
    seedState({
      tasks: [{ id: 1, t: 'Draft the opening', done: false, pomos: 0, goal: 2 }],
      activeTaskId: 1,
      ritual: { ...DEFAULT_RITUAL, enabled: true, suggestionSeen: true },
    });

    render(<FocusHarness />);

    const before = screen.getByRole('region', { name: 'Before this session' });
    const task = within(before).getByText('Draft the opening');
    const target = within(before).getByRole('textbox', { name: 'Session target' });
    const openingMove = within(before).getByRole('button', { name: /opening move/i });
    const reset = within(before).getByRole('button', { name: /tiny environment reset/i });
    const start = screen.getByRole('button', { name: 'Start' });

    expect(task.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(target.compareDocumentPosition(openingMove) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(openingMove.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(reset.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(start);
    const ritual = screen.getByRole('region', { name: 'Environment reset' });
    expect(within(ritual).getByRole('button', { name: 'skip for now' })).toBeTruthy();
    fireEvent.click(within(ritual).getByRole('button', { name: 'skip for now' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('opens the weekly experiment on demand from the discoverable Settings entry', () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      finalizeSession(
        newOpenSession('focus', 25, undefined, undefined, Date.now() - index * 60_000),
        'completed',
        25,
      ));
    seedState({
      sessionRecords: records,
      lastWeeklyReviewWeek: '2026-07-13',
    });

    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const openReview = screen.getByRole('button', { name: 'see this week' });
    expect(openReview).toBeTruthy();
    fireEvent.click(openReview);

    const weekly = screen.getByRole('status', { name: 'Weekly review' });
    expect(within(weekly).getByText(/worth a try:/)).toBeTruthy();
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
      targetText: 'Draft the first paragraph',
    });
    expect(started.openFocus?.taskId).toBeUndefined();

    const sessionId = started.openFocus?.id;
    act(() => vi.setSystemTime(new Date(Date.now() + 2 * 60_000)));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const paused = stateProbe();
    expect(paused.remaining).toBe(23 * 60);
    expect(paused.openFocus?.id).toBe(sessionId);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const confirmReset = screen.getByRole('button', { name: 'end & reset' });
    fireEvent.click(confirmReset);
    fireEvent.click(confirmReset);
    const reset = stateProbe();
    expect(reset.openFocus).toBeNull();
    expect(reset.sessionRecords.filter((record) => record.id === sessionId)).toEqual([
      expect.objectContaining({ outcome: 'abandoned', actualMin: 2 }),
    ]);
  });

  it('guards a late mode switch with safe focus, Escape cancel, and one confirmed abandon', () => {
    seedState({
      tasks: [{ id: 1, t: 'Draft outline', done: false, pomos: 0, goal: 2 }],
      activeTaskId: 1,
    });
    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const openFocusId = stateProbe().openFocus?.id;
    act(() => vi.setSystemTime(new Date(Date.now() + 12 * 60_000)));
    const before = stateProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    const keep = screen.getByRole('button', { name: 'keep going' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stateProbe()).toEqual(before);

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    fireEvent.click(screen.getByRole('button', { name: 'end & continue' }));
    const switched = stateProbe();
    expect(switched.mode).toBe('tiny');
    expect(switched.openFocus).toBeNull();
    expect(switched.sessionRecords.filter((record) => record.id === openFocusId))
      .toHaveLength(1);
  });

  it('touch-switches a sub-grace focus start with zero abandoned evidence', () => {
    seedState();
    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => vi.setSystemTime(new Date(Date.now() + 10_000)));

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    const switched = stateProbe();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(switched.mode).toBe('tiny');
    expect(switched.openFocus).toBeNull();
    expect(switched.sessionRecords).toEqual([]);
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
    const confirmSkip = screen.getByRole('button', { name: 'end & skip' });
    fireEvent.click(confirmSkip);
    fireEvent.click(confirmSkip);

    const skipped = stateProbe();
    expect(skipped.sessionRecords.filter((record) => record.id === sessionId)).toEqual([
      expect.objectContaining({ mode: 'tiny', outcome: 'abandoned', actualMin: 1 }),
    ]);
  });

  it('completes a Tiny first rung, extends it once, and finalizes the extension once', () => {
    const ring = vi.spyOn(audioEngine, 'playRing');
    seedState();
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const firstSessionId = stateProbe().openFocus?.id;

    act(() => {
      vi.setSystemTime(new Date(Date.now() + 2 * 60_000));
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole('button', { name: 'yes, 10 more' })).toBeTruthy();
    expect(stateProbe().sessionRecords).toEqual([
      expect.objectContaining({
        id: firstSessionId,
        mode: 'tiny',
        plannedMin: 2,
        outcome: 'completed',
      }),
    ]);
    expect(ring).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'yes, 10 more' }));
    const extended = stateProbe();
    const extensionId = extended.openFocus?.id;
    expect(extensionId).not.toBe(firstSessionId);
    expect(extended).toMatchObject({
      mode: 'tiny',
      running: true,
      remaining: 10 * 60,
      justDone: false,
      openFocus: { id: extensionId, mode: 'tiny', plannedMin: 10 },
    });

    act(() => {
      vi.setSystemTime(new Date(Date.now() + 10 * 60_000));
      vi.advanceTimersByTime(250);
    });
    const finished = stateProbe();
    expect(finished.openFocus).toBeNull();
    expect(finished.sessionRecords.filter((record) => record.id === extensionId)).toEqual([
      expect.objectContaining({ mode: 'tiny', plannedMin: 10, outcome: 'completed' }),
    ]);
    expect(ring).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'yes, 10 more' })).toBeNull();
  });

  it('does not play the completion ring when that setting is off', () => {
    const ring = vi.spyOn(audioEngine, 'playRing');
    seedState({ settings: { sound: false } });
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      vi.setSystemTime(new Date(Date.now() + 2 * 60_000));
      vi.advanceTimersByTime(250);
    });

    expect(stateProbe().justDone).toBe(true);
    expect(ring).not.toHaveBeenCalled();
  });

  it('declines a completed Tiny first rung without opening or finalizing another session', () => {
    seedState();
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiny' }));
    fireEvent.click(screen.getByRole('button', { name: '5 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const firstSessionId = stateProbe().openFocus?.id;

    act(() => {
      vi.setSystemTime(new Date(Date.now() + 5 * 60_000));
      vi.advanceTimersByTime(250);
    });
    fireEvent.click(screen.getByRole('button', { name: 'done for now ♡' }));

    expect(stateProbe()).toMatchObject({
      mode: 'focus',
      running: false,
      justDone: false,
      openFocus: null,
      sessionRecords: [
        expect.objectContaining({
          id: firstSessionId,
          mode: 'tiny',
          plannedMin: 5,
          outcome: 'completed',
        }),
      ],
    });
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

  it('kept-working resolves an honest return against live time without finalizing twice', () => {
    const endsAt = Date.now() + 5 * 60_000;
    const openFocus = {
      ...newOpenSession('focus', 25, 1, undefined, Date.now() - 20 * 60_000),
      endsAt,
      returnSnapshot: {
        capturedAt: Date.now() - 2 * 60_000,
        returnedAt: Date.now(),
        elapsedSec: 18 * 60,
        remainingSec: 7 * 60,
        mode: 'focus' as const,
        round: 1,
        sessionId: '',
      },
    };
    openFocus.returnSnapshot.sessionId = openFocus.id;
    seedState({ running: true, endsAt, remaining: 5 * 60, openFocus });
    render(<FocusHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'I kept working' }));

    const resolved = stateProbe();
    expect(resolved.running).toBe(true);
    expect(resolved.remaining).toBe(5 * 60);
    expect(resolved.openFocus).toMatchObject({ id: openFocus.id });
    expect(resolved.openFocus?.returnSnapshot).toBeUndefined();
    expect(resolved.sessionRecords).toHaveLength(0);
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

  it('reload preserves one unresolved return owner without sweeping or duplicating its session', () => {
    const endsAt = Date.now() + 12 * 60_000;
    const openFocus = {
      ...newOpenSession('focus', 25, 1, undefined, Date.now() - 10 * 60_000),
      endsAt,
      returnSnapshot: {
        capturedAt: Date.now() - 60_000,
        returnedAt: Date.now(),
        elapsedSec: 9 * 60,
        remainingSec: 16 * 60,
        mode: 'focus' as const,
        round: 1,
        sessionId: '',
      },
    };
    openFocus.returnSnapshot.sessionId = openFocus.id;
    seedState({ running: true, endsAt, remaining: 12 * 60, openFocus });

    const first = renderHook(() => useBloom());
    expect(first.result.current.state.openFocus).toMatchObject({
      id: openFocus.id,
      returnSnapshot: { returnedAt: Date.now() },
    });
    expect(first.result.current.state.sessionRecords).toHaveLength(0);
    first.unmount();

    const reloaded = renderHook(() => useBloom());
    expect(reloaded.result.current.state.openFocus).toMatchObject({
      id: openFocus.id,
      returnSnapshot: { returnedAt: Date.now() },
    });
    expect(reloaded.result.current.state.sessionRecords).toHaveLength(0);
  });

  it('restores a pending session-credit debrief after reload and credits it once', () => {
    const goal = {
      id: 4,
      title: 'Finish the portfolio',
      due: '2026-08-01',
      target: 5,
      done: 1,
      createdAt: Date.now() - 86_400_000,
    };
    const record = {
      ...finalizeSession(
        newOpenSession('focus', 25, 7, undefined, undefined, goal.id),
        'completed',
        25,
      ),
      goalCredit: 'pending' as const,
    };
    seedState({
      goals: [goal],
      sessionRecords: [record],
      settings: { planner: true, goalCredit: 'ask' },
    });

    render(<FocusHarness />);
    expect(screen.getByRole('region', { name: `Goal credit for ${goal.title}` }))
      .toBeTruthy();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'parts to credit' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'credit 3 parts' }));
    expect(stateProbe().goals[0].done).toBe(4);
    expect(stateProbe().goalLedger).toContainEqual(
      expect.objectContaining({
        goalId: goal.id,
        delta: 3,
        source: 'session',
        sessionId: record.id,
      }),
    );
    expect(stateProbe().sessionRecords[0].goalCredit).toBe('credited');

    fireEvent.click(screen.getByRole('button', { name: 'ok ♡' }));
    expect(stateProbe().goals[0].done).toBe(4);
  });

  it('lets returned parking snooze release the pending debrief without deleting the thought', () => {
    const goal = {
      id: 4,
      title: 'Finish the portfolio',
      due: '2026-08-01',
      target: 5,
      done: 1,
      createdAt: Date.now() - 86_400_000,
    };
    const record = {
      ...finalizeSession(
        newOpenSession('focus', 25, 7, undefined, undefined, goal.id),
        'completed',
        25,
      ),
      goalCredit: 'pending' as const,
    };
    seedState({
      goals: [goal],
      sessionRecords: [record],
      parking: [{
        id: 'parked-1',
        text: 'Check the bibliography',
        parkedAt: record.startedAt,
        sessionId: record.id,
        revealedAt: record.endedAt,
      }],
      settings: { planner: true, goalCredit: 'ask' },
    });

    render(<FocusHarness />);
    expect(screen.getByRole('region', { name: 'Parked thoughts' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Session debrief' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'not now ♡' }));

    expect(screen.queryByRole('region', { name: 'Parked thoughts' })).toBeNull();
    expect(screen.getByRole('status', { name: 'Session debrief' })).toBeTruthy();
    expect(localStorage.getItem('bloom-state')).toContain('Check the bibliography');
  });

  it('exposes task goal linking and a keyboard-accessible pending credit choice', () => {
    const goals = [
      {
        id: 4,
        title: 'Finish the portfolio',
        due: '2026-08-01',
        target: 5,
        done: 1,
        createdAt: Date.now() - 86_400_000,
      },
      {
        id: 5,
        title: 'Read the papers',
        due: '2026-08-02',
        target: 4,
        done: 0,
        createdAt: Date.now() - 86_400_000,
      },
    ];
    seedState({
      goals,
      tasks: [{ id: 7, t: 'Draft outline', done: false, pomos: 0, goal: 1 }],
      activeTaskId: 7,
      settings: { planner: true, goalCredit: 'ask' },
    });
    render(<TasksHarness />);

    const link = screen.getByRole('combobox', { name: 'Goal for Draft outline' });
    fireEvent.change(link, { target: { value: '5' } });
    expect(destructiveState<{ tasks: Array<{ goalId?: number }> }>().tasks[0].goalId).toBe(5);

    const checkbox = screen.getByRole('checkbox', { name: 'Mark complete: Draft outline' });
    fireEvent.keyDown(checkbox, { key: 'Enter' });
    expect(screen.getByRole('group', { name: 'Add one part to Read the papers?' }))
      .toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'not this time' }));
    const settled = destructiveState<{ tasks: Array<{ goalCredit?: string }> }>();
    const settledGoals = JSON.parse(
      screen.getByTestId('task-goals-state').textContent ?? '[]',
    ) as Array<{ id: number; done: number }>;
    expect(settled.tasks[0].goalCredit).toBe('skipped');
    expect(settledGoals.find((goal) => goal.id === 5)?.done).toBe(0);
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

describe('Companion drift decisions at the hook boundary', () => {
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

  it('resolves one honest-return drift and persists one linked event under rapid activation', () => {
    const endsAt = Date.now() + 15 * 60_000;
    const openFocus = {
      ...newOpenSession('focus', 25, 1, undefined, Date.now() - 10 * 60_000),
      endsAt,
      returnSnapshot: {
        capturedAt: Date.now() - 60_000,
        returnedAt: Date.now(),
        elapsedSec: 9 * 60,
        remainingSec: 16 * 60,
        mode: 'focus' as const,
        round: 1,
        sessionId: '',
      },
    };
    openFocus.returnSnapshot.sessionId = openFocus.id;
    seedState({
      running: true,
      endsAt,
      remaining: 15 * 60,
      openFocus,
      settings: { companion: { ...DEFAULT_COMPANION, on: true, tabDetect: false } },
    });

    const hook = renderHook(() => {
      const bloom = useBloom();
      return { bloom, companion: useCompanion(bloom) };
    });
    act(() => {
      hook.result.current.companion.actions.returnDrifted();
      hook.result.current.companion.actions.returnDrifted();
    });

    const events = loadEvents();
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'drift',
        src: 'return',
        sessionId: openFocus.id,
      }),
    ]);
    expect(hook.result.current.bloom.state.openFocus).toMatchObject({
      id: openFocus.id,
      remainingSec: 16 * 60,
      driftEventIds: [events[0].id],
    });
    expect(hook.result.current.bloom.state.openFocus?.returnSnapshot).toBeUndefined();
    expect(hook.result.current.bloom.state.sessionRecords).toHaveLength(0);
    expect(hook.result.current.companion.prompt?.type).toBe('triage');
  });

  it('re-captures Tiny return truth after the first leave is settled', () => {
    seedState({
      settings: {
        companion: {
          ...DEFAULT_COMPANION,
          on: true,
          tabDetect: true,
          awaySecs: 45,
        },
      },
    });
    const hook = renderHook(() => {
      const bloom = useBloom();
      return { bloom, companion: useCompanion(bloom) };
    });
    act(() => hook.result.current.bloom.actions.pickTiny(2));
    act(() => hook.result.current.bloom.actions.toggle());
    const sessionId = hook.result.current.bloom.state.openFocus?.id;

    act(() => window.dispatchEvent(new Event('blur')));
    act(() => {
      vi.advanceTimersByTime(46_000);
      window.dispatchEvent(new Event('focus'));
    });
    const firstCapturedAt =
      hook.result.current.bloom.state.openFocus?.returnSnapshot?.capturedAt;
    expect(hook.result.current.bloom.state.openFocus).toMatchObject({
      id: sessionId,
      mode: 'tiny',
      returnSnapshot: { returnedAt: Date.now() },
    });

    act(() => hook.result.current.bloom.actions.resolveTabReturn('pauseBack'));
    act(() => hook.result.current.bloom.actions.toggle());
    act(() => window.dispatchEvent(new Event('blur')));
    act(() => {
      vi.advanceTimersByTime(46_000);
      window.dispatchEvent(new Event('focus'));
    });

    expect(hook.result.current.bloom.state.openFocus).toMatchObject({
      id: sessionId,
      mode: 'tiny',
      returnSnapshot: { returnedAt: Date.now() },
    });
    expect(
      hook.result.current.bloom.state.openFocus?.returnSnapshot?.capturedAt,
    ).toBeGreaterThan(firstCapturedAt ?? 0);
    expect(hook.result.current.bloom.state.sessionRecords).toHaveLength(0);
  });

  it('excludes count-up Flow returns while preserving the same openFlow record', () => {
    const startedAt = Date.now() - 5 * 60_000;
    const openFlow = newOpenSession('flow', null, 1, undefined, startedAt);
    seedState({
      settings: {
        flow: true,
        companion: { ...DEFAULT_COMPANION, on: true, tabDetect: true },
      },
      flow: { startedAt, acc: 0, running: true },
      openFlow,
    });
    const hook = renderHook(() => {
      const bloom = useBloom();
      return { bloom, companion: useCompanion(bloom) };
    });

    act(() => window.dispatchEvent(new Event('blur')));
    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('focus'));
    });

    expect(hook.result.current.bloom.state.mode).toBe('flow');
    expect(hook.result.current.bloom.state.running).toBe(true);
    expect(hook.result.current.bloom.state.openFlow).toMatchObject({
      id: openFlow.id,
      mode: 'flow',
    });
    expect(hook.result.current.bloom.state.openFlow?.returnSnapshot).toBeUndefined();
    expect(hook.result.current.bloom.state.openFocus).toBeNull();
    expect(hook.result.current.bloom.state.sessionRecords).toHaveLength(0);
  });

  it.each([
    ['Quiet', { quiet: true }],
    ['off', { on: false }],
  ])('withdraws an open ordinary check-in when Companion becomes %s', (_label, patch) => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    seedState({
      settings: {
        companion: {
          ...DEFAULT_COMPANION,
          on: true,
          quiet: false,
          checkinMins: 3,
        },
      },
    });
    const hook = renderHook(() => {
      const bloom = useBloom();
      return { bloom, companion: useCompanion(bloom) };
    });
    act(() => hook.result.current.bloom.actions.toggle());
    // Split the clock advance so React commits Bloom's wall-clock tick before
    // the Companion interval makes its due-time decision.
    act(() => vi.advanceTimersByTime(180_000));
    act(() => vi.advanceTimersByTime(1_000));
    expect(hook.result.current.companion.prompt?.type).toBe('checkin');

    act(() => {
      hook.result.current.bloom.actions.patchSettings({
        companion: {
          ...hook.result.current.bloom.state.settings.companion,
          ...patch,
        },
      });
    });

    expect(hook.result.current.companion.prompt).toBeNull();
    expect(loadEvents()).toEqual([
      expect.objectContaining({
        kind: 'skip',
        src: 'checkin',
        sessionId: hook.result.current.bloom.state.openFocus?.id,
      }),
    ]);
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
    render(<GoalsHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Read eight chapters' }));
    expect(screen.getByRole('dialog', { name: 'Remove “Read eight chapters”?' })).not.toBeNull();
    expect(destructiveState<{ goals: unknown[] }>().goals).toEqual([goal]);
    fireEvent.click(screen.getByRole('button', { name: 'keep it' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Read eight chapters' }));
    fireEvent.click(screen.getByRole('button', { name: 'remove goal' }));
    expect(destructiveState<{ goals: unknown[] }>().goals).toEqual([]);
    expect(JSON.parse(screen.getByTestId('goal-ledger-state').textContent ?? '[]')).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(destructiveState<{ tasks: unknown[]; goals: unknown[] }>()).toEqual({
      tasks: [task],
      goals: [goal],
    });
    expect(JSON.parse(screen.getByTestId('goal-ledger-state').textContent ?? '[]')).toEqual([
      expect.objectContaining({ goalId: goal.id, delta: goal.done, source: 'carryover' }),
    ]);
  });

  it('shows one guarded observed-pace line instead of the calendar suggestion', () => {
    const goal = {
      id: 4,
      title: 'Read twelve chapters',
      due: '2026-08-01',
      target: 12,
      done: 6,
      unit: 'chapters',
      createdAt: Date.now() - 10 * 86_400_000,
    };
    const goalLedger = [1, 2, 3].map((daysAgo) => {
      const at = Date.now() - daysAgo * 86_400_000;
      return {
        id: `g-${daysAgo}`,
        goalId: goal.id,
        delta: 2,
        source: 'session',
        sessionId: `s-${daysAgo}`,
        dayKey: new Date(at).toISOString().slice(0, 10),
        at,
      };
    });
    seedState({ version: 25, goals: [goal], goalLedger });
    render(<GoalsHarness />);

    expect(screen.getByText(
      'At the pace you’ve recorded (about 2 chapters a day), this lands around Jul 19.',
    )).toBeTruthy();
    expect(screen.queryByText(/a day and you’ll land right on time/i)).toBeNull();
  });

  it('offers shrink or move through the edit form and restores an applied change with undo', () => {
    const goal = {
      id: 4,
      title: 'Read twelve chapters',
      due: '2026-07-17',
      target: 12,
      done: 6,
      unit: 'chapters',
      createdAt: Date.now() - 10 * 86_400_000,
    };
    const goalLedger = [1, 2, 3].map((daysAgo) => {
      const at = Date.now() - daysAgo * 86_400_000;
      return {
        id: `outlook-${daysAgo}`,
        goalId: goal.id,
        delta: 2,
        source: 'session',
        sessionId: `outlook-session-${daysAgo}`,
        dayKey: new Date(at).toISOString().slice(0, 10),
        at,
      };
    });
    seedState({ version: 28, goals: [goal], goalLedger });
    render(<GoalsHarness />);

    const choices = screen.getByRole('group', {
      name: 'Adjust Read twelve chapters from its recorded pace',
    });
    expect(within(choices).getByRole('button', { name: 'shrink amount' })).toBeTruthy();
    expect(within(choices).getByRole('button', { name: 'move date' })).toBeTruthy();
    fireEvent.click(within(choices).getByRole('button', { name: 'shrink amount' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(
      destructiveState<{ goals: Array<{ target: number }> }>().goals[0].target,
    ).toBe(10);
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(
      destructiveState<{ goals: Array<{ target: number }> }>().goals[0].target,
    ).toBe(12);
  });

  it('shows session effort beside a day-plan amount only after three goal sessions', () => {
    const goal = {
      id: 4,
      title: 'Biology review',
      due: '2026-08-01',
      target: 12,
      done: 3,
      unit: 'lectures',
      createdAt: Date.now() - 10 * 86_400_000,
    };
    const goalLedger = [1, 2, 3].map((daysAgo) => {
      const at = Date.now() - daysAgo * 86_400_000;
      return {
        id: `effort-${daysAgo}`,
        goalId: goal.id,
        delta: 1,
        source: 'session',
        sessionId: `effort-session-${daysAgo}`,
        dayKey: new Date(at).toISOString().slice(0, 10),
        at,
      };
    });
    seedState({ version: 28, settings: { planner: true }, goals: [goal], goalLedger });
    render(<GoalsHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'plan today' }));
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Planned lectures for Biology review' }),
      { target: { value: '3' } },
    );
    expect(
      screen.getByText(
        'From your recorded goal credits, 3 lectures is about 3 of your usual sessions.',
      ),
    ).toBeTruthy();
  });

  it('shows rollover triage once, carries the remainder, and does not re-offer after reload', () => {
    const goal = {
      id: 4,
      title: 'Biology review',
      due: '2026-08-01',
      target: 8,
      done: 1,
      unit: 'lectures',
      createdAt: Date.now() - 86400000,
    };
    seedState({
      version: 28,
      settings: { planner: true },
      goals: [goal],
      goalLedger: [{
        id: 'credit-one',
        goalId: 4,
        delta: 1,
        source: 'manual',
        dayKey: '2026-07-15',
        at: Date.now() - 86400000,
      }],
      dayPlan: {
        targets: [{
          id: 'yesterday',
          goalId: 4,
          dayKey: '2026-07-15',
          plannedAmount: 3,
          snapshot: { title: 'Biology review', unit: 'lectures' },
          createdAt: Date.now() - 86400000,
        }],
        archive: [],
      },
      lastRolloverOfferDay: null,
    });
    const first = render(<GoalsHarness />);

    expect(screen.getByRole('region', { name: 'Yesterday’s plan' })).toBeTruthy();
    expect(
      JSON.parse(screen.getByTestId('day-plan-state').textContent ?? '{}')
        .lastRolloverOfferDay,
    ).toBe('2026-07-16');
    fireEvent.click(screen.getByRole('button', { name: 'Carry to today' }));

    const carried = JSON.parse(
      screen.getByTestId('day-plan-state').textContent ?? '{}',
    ).dayPlan.targets;
    expect(carried).toHaveLength(2);
    expect(carried[0]).toMatchObject({
      id: 'yesterday',
      dayKey: '2026-07-15',
      plannedAmount: 3,
    });
    expect(carried[1]).toMatchObject({
      goalId: 4,
      dayKey: '2026-07-16',
      plannedAmount: 2,
      carriedFromDayKey: '2026-07-15',
      snapshot: { title: 'Biology review', unit: 'lectures' },
    });

    first.unmount();
    render(<GoalsHarness />);
    expect(screen.queryByRole('region', { name: 'Yesterday’s plan' })).toBeNull();
  });
});

describe('honest task empty state', () => {
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

  it('starts empty and offers one clear path into the real add form', () => {
    render(<TasksHarness />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'your list starts here' })).toBeTruthy();

    const taskName = screen.getByRole('textbox', { name: 'Task name' });
    fireEvent.click(screen.getByRole('button', { name: 'add your first task' }));
    expect(document.activeElement).toBe(taskName);

    fireEvent.change(taskName, { target: { value: 'Read one page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(screen.queryByRole('heading', { level: 2, name: 'your list starts here' })).toBeNull();
    expect(destructiveState<{ tasks: Array<{ t: string }>; activeTaskId: number | null }>()).toMatchObject({
      tasks: [{ t: 'Read one page' }],
      activeTaskId: 1,
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
    seedState({ settings: { dayStartHour: 4 } });
    const hook = renderHook(() => useBloom());
    expect(hook.result.current.today).toBe('2026-07-19');

    act(() => vi.advanceTimersByTime(101));

    expect(hook.result.current.today).toBe('2026-07-20');
    expect(new Date(hook.result.current.now).getHours()).toBe(4);
  });

  it('lets Settings change the boundary and refreshes every date surface immediately', () => {
    vi.setSystemTime(new Date(2026, 6, 20, 0, 30));
    seedState({ settings: { dayStartHour: 0 } });

    render(<FocusHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const customHour = screen.getByLabelText('Custom hour') as HTMLSelectElement;
    fireEvent.change(customHour, { target: { value: '4' } });
    expect(customHour.value).toBe('4');
    expect(
      (JSON.parse(localStorage.getItem('bloom-state') ?? '{}') as {
        settings?: { dayStartHour?: number };
      }).settings?.dayStartHour,
    ).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: 'done' }));

    cleanup();
    render(<TasksHarness />);
    expect(screen.getByText(/Sunday · July 19/)).toBeTruthy();

    const persisted = JSON.parse(localStorage.getItem('bloom-state') ?? '{}') as {
      settings?: { dayStartHour?: number };
    };
    expect(persisted.settings?.dayStartHour).toBe(4);
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
