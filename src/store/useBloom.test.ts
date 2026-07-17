import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_STATE,
  completionNotice,
  loadState,
  readPersisted,
  reducer,
  type BloomState,
} from './useBloom';
import { newOpenSession } from './sessions';

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

function makeState(patch: Partial<BloomState> = {}): BloomState {
  const base: BloomState = {
    ...DEFAULT_STATE,
    tasks: DEFAULT_STATE.tasks.map((task) => ({ ...task })),
    palXp: { ...DEFAULT_STATE.palXp },
    goals: DEFAULT_STATE.goals.map((goal) => ({ ...goal })),
    sessionRecords: [...DEFAULT_STATE.sessionRecords],
    ifThenPlans: [...DEFAULT_STATE.ifThenPlans],
    parking: [...DEFAULT_STATE.parking],
    personalCadence: {
      ...DEFAULT_STATE.personalCadence,
      history: [...DEFAULT_STATE.personalCadence.history],
    },
    settings: {
      ...DEFAULT_STATE.settings,
      durations: { ...DEFAULT_STATE.settings.durations },
      companion: { ...DEFAULT_STATE.settings.companion },
    },
  };
  return { ...base, ...patch };
}

describe('timer lifecycle invariants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T09:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  it('opens a recorded focus session when auto-start advances from a break', () => {
    const state = makeState({
      mode: 'short',
      justDone: true,
      remaining: 0,
      settings: { ...DEFAULT_STATE.settings, autoStart: true },
    });

    const next = reducer(state, { type: 'clearDone' });

    expect(next.mode).toBe('focus');
    expect(next.running).toBe(true);
    expect(next.openFocus).toMatchObject({
      mode: 'focus',
      plannedMin: 25,
      taskId: 1,
      running: true,
      endsAt: next.endsAt,
    });
  });

  it('syncs an applied cadence to a fresh idle timer and clears its stale recommendation', () => {
    const state = makeState({
      remaining: 25 * 60,
      personalCadence: {
        computedAt: Date.now(),
        recommendation: {
          preset: { id: '30-6', label: '30 / 6', focusMin: 30, breakMin: 6 },
          kind: 'stretch',
          text: 'try it',
          because: 'recent sessions',
          evidenceKey: 'breaks-are-fuel',
          rungs: {
            shorter: { id: '20-5', label: '20 / 5', focusMin: 20, breakMin: 5 },
            current: { id: '25-5', label: '25 / 5', focusMin: 25, breakMin: 5 },
            longer: { id: '30-6', label: '30 / 6', focusMin: 30, breakMin: 6 },
          },
        },
        history: [],
      },
    });

    const next = reducer(state, {
      type: 'applyCadence',
      pair: { focusMin: 30, breakMin: 6 },
    });

    expect(next.settings.durations.focus).toBe(30 * 60);
    expect(next.settings.durations.short).toBe(6 * 60);
    expect(next.remaining).toBe(30 * 60);
    expect(next.personalCadence.recommendation).toBeNull();
    expect(next.personalCadence.computedAt).toBeNull();
  });

  it('never resets a paused focus block when settings change', () => {
    const openFocus = {
      ...newOpenSession('focus', 25, 1),
      running: false,
      remainingSec: 7 * 60,
    };
    const state = makeState({
      running: false,
      remaining: 7 * 60,
      openFocus,
    });

    const renamed = reducer(state, { type: 'patchSettings', patch: { name: 'Mira' } });
    const resized = reducer(renamed, {
      type: 'patchSettings',
      patch: { durations: { ...renamed.settings.durations, focus: 40 * 60 } },
    });

    expect(renamed.remaining).toBe(7 * 60);
    expect(resized.remaining).toBe(7 * 60);
    expect(resized.openFocus?.id).toBe(openFocus.id);
  });

  it('applies a new cadence without resizing an open paused session', () => {
    const openFocus = {
      ...newOpenSession('focus', 25, 1),
      running: false,
      remainingSec: 7 * 60,
    };
    const state = makeState({
      running: false,
      remaining: 7 * 60,
      openFocus,
    });

    const next = reducer(state, {
      type: 'applyCadence',
      pair: { focusMin: 30, breakMin: 6 },
    });

    expect(next.settings.durations.focus).toBe(30 * 60);
    expect(next.remaining).toBe(7 * 60);
    expect(next.openFocus?.plannedMin).toBe(25);
  });

  it('credits the task stamped at start even when another task is active at completion', () => {
    const tasks = [
      { id: 1, t: 'Started task', done: false, pomos: 0, goal: 2 },
      { id: 2, t: 'New selection', done: false, pomos: 0, goal: 2 },
    ];
    const openFocus = {
      ...newOpenSession('focus', 25, 1),
      endsAt: Date.now(),
      remainingSec: 0,
    };
    const state = makeState({
      mode: 'focus',
      running: true,
      endsAt: Date.now(),
      remaining: 0,
      tasks,
      activeTaskId: 2,
      openFocus,
    });

    const next = reducer(state, { type: 'complete' });

    expect(next.tasks.find((task) => task.id === 1)?.pomos).toBe(1);
    expect(next.tasks.find((task) => task.id === 2)?.pomos).toBe(0);
    expect(next.sessionRecords[next.sessionRecords.length - 1]?.taskId).toBe(1);
  });

  it('finalizes a countdown at most once if completion is dispatched repeatedly', () => {
    const openFocus = {
      ...newOpenSession('focus', 25, 1),
      endsAt: Date.now(),
      remainingSec: 0,
    };
    const state = makeState({
      mode: 'focus',
      running: true,
      endsAt: Date.now(),
      remaining: 0,
      openFocus,
    });

    const once = reducer(state, { type: 'complete' });
    const twice = reducer(once, { type: 'complete' });

    expect(twice).toBe(once);
    expect(twice.sessions).toBe(1);
    expect(twice.sessionRecords).toHaveLength(1);
  });

  it('counts a deliberately finished short Flow session as a day without minting XP', () => {
    const state = makeState({
      mode: 'flow',
      flowAcc: 60,
      remaining: 60,
      openFlow: { ...newOpenSession('flow', null, 1), running: false },
    });

    const next = reducer(state, { type: 'finishFlow' });

    expect(next.streak).toBe(1);
    expect(next.sessions).toBe(0);
    expect(next.palXp).toEqual({});
    expect(next.sessionRecords[next.sessionRecords.length - 1]?.outcome).toBe('completed');
  });

  it('banks Flow credit to the task stamped at start', () => {
    const tasks = [
      { id: 1, t: 'Flow started here', done: false, pomos: 0, goal: 2 },
      { id: 2, t: 'Selected later', done: false, pomos: 0, goal: 2 },
    ];
    const state = makeState({
      mode: 'flow',
      flowAcc: 25 * 60,
      remaining: 25 * 60,
      tasks,
      activeTaskId: 2,
      openFlow: { ...newOpenSession('flow', null, 1), running: false },
    });

    const next = reducer(state, { type: 'finishFlow' });

    expect(next.tasks.find((task) => task.id === 1)?.pomos).toBe(1);
    expect(next.tasks.find((task) => task.id === 2)?.pomos).toBe(0);
    expect(next.activeTaskId).toBe(2);
  });

  it('cannot finish an unopened Flow timer or bank it twice', () => {
    const unopened = makeState({ mode: 'flow', remaining: 0 });
    expect(reducer(unopened, { type: 'finishFlow' })).toBe(unopened);

    const opened = makeState({
      mode: 'flow',
      flowAcc: 25 * 60,
      remaining: 25 * 60,
      openFlow: { ...newOpenSession('flow', null, 1), running: false },
    });
    const once = reducer(opened, { type: 'finishFlow' });
    expect(reducer(once, { type: 'finishFlow' })).toBe(once);
  });
});

describe('completionNotice', () => {
  it('tells a completed break to return when ready instead of taking another break', () => {
    expect(completionNotice('short')).toEqual({
      title: '🌱 Break complete!',
      body: 'Ready when you are — the next focus session is yours to start.',
    });
    expect(completionNotice('long').body).not.toContain('time for a little break');
  });
});

describe('persisted-state recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T09:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('recovers a valid legacy state when the current blob is corrupt', () => {
    localStorage.setItem('bloom-state', '{broken');
    localStorage.setItem(
      'bloom-state-v2',
      JSON.stringify({ version: 18, settings: { name: 'Legacy bloom' } }),
    );

    expect(readPersisted()?.settings.name).toBe('Legacy bloom');
  });

  it('keeps trying legacy candidates independently', () => {
    localStorage.setItem('bloom-state-v2', '{also-broken');
    localStorage.setItem(
      'bloom-state-v1',
      JSON.stringify({ version: 18, settings: { name: 'Older bloom' } }),
    );

    expect(readPersisted()?.settings.name).toBe('Older bloom');
  });

  it('does not erase a set-aside streak merely by loading after a long gap', () => {
    localStorage.setItem(
      'bloom-state',
      JSON.stringify({
        version: 18,
        streak: 40,
        lastFocusDay: '2026-06-01',
        settings: { name: 'Mira' },
      }),
    );

    const state = loadState();

    expect(state.streak).toBe(40);
    expect(state.comeBack).toBe(true);
  });
});

describe('goal links and completion stamps (v19/v20 quick wins)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T09:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  const goal = { id: 3, title: 'read 12 papers', due: '2026-08-01', target: 12, done: 0, createdAt: 1 };

  it('stamps completedAt when a task is checked off and clears it on un-check', () => {
    const state = makeState();

    const done = reducer(state, { type: 'toggleTask', id: 1 });
    expect(done.tasks.find((t) => t.id === 1)?.completedAt).toBe(Date.now());

    const undone = reducer(done, { type: 'toggleTask', id: 1 });
    expect(undone.tasks.find((t) => t.id === 1)?.completedAt).toBeUndefined();
  });

  it('stamps completedAt on a goal only when the last part lands', () => {
    const state = makeState({ goals: [{ ...goal, done: 10 }] });

    const partway = reducer(state, { type: 'logGoal', id: 3, delta: 1 });
    expect(partway.goals[0].completedAt).toBeUndefined();

    const finished = reducer(partway, { type: 'logGoal', id: 3, delta: 1 });
    expect(finished.goals[0].completedAt).toBe(Date.now());

    const reopened = reducer(finished, { type: 'logGoal', id: 3, delta: -1 });
    expect(reopened.goals[0].completedAt).toBeUndefined();
  });

  it('links a new task to a real goal and drops a stale link on goal removal', () => {
    const state = makeState({ goals: [goal] });

    const added = reducer(state, { type: 'addTask', text: 'skim paper 1', goal: 1, goalId: 3 });
    const task = added.tasks[added.tasks.length - 1];
    expect(task.goalId).toBe(3);

    const phantom = reducer(state, { type: 'addTask', text: 'floating', goal: 1, goalId: 99 });
    expect(phantom.tasks[phantom.tasks.length - 1].goalId).toBeUndefined();

    const removed = reducer(added, { type: 'removeGoal', id: 3 });
    expect(removed.tasks.every((t) => t.goalId === undefined)).toBe(true);
  });

  it('stamps the linked goal onto the session opened for that task', () => {
    const withLink = reducer(
      makeState({ goals: [goal], tasks: [], activeTaskId: null }),
      { type: 'addTask', text: 'skim paper 1', goal: 1, goalId: 3 },
    );

    const started = reducer(withLink, { type: 'toggle' });
    expect(started.openFocus?.goalId).toBe(3);

    vi.advanceTimersByTime(25 * 60 * 1000);
    const finished = reducer({ ...started, remaining: 0 }, { type: 'complete' });
    const record = finished.sessionRecords[finished.sessionRecords.length - 1];
    expect(record.goalId).toBe(3);
    expect(record.outcome).toBe('completed');
  });

  it('updateGoal edits title, due, and target, clamping done into the new target', () => {
    const state = makeState({ goals: [{ ...goal, done: 8 }] });

    const edited = reducer(state, {
      type: 'updateGoal',
      id: 3,
      patch: { title: '  read 6 papers  ', due: '2026-07-20', target: 6 },
    });

    expect(edited.goals[0]).toMatchObject({
      title: 'read 6 papers',
      due: '2026-07-20',
      target: 6,
      done: 6,
    });
    expect(edited.goals[0].completedAt).toBe(Date.now());

    // A blank title or malformed date changes nothing it shouldn't.
    const guarded = reducer(edited, { type: 'updateGoal', id: 3, patch: { title: '   ' } });
    expect(guarded.goals[0].title).toBe('read 6 papers');
    const badDate = reducer(edited, { type: 'updateGoal', id: 3, patch: { due: 'someday' } });
    expect(badDate.goals[0].due).toBe('2026-07-20');
  });
});
