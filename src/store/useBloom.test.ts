import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_STATE,
  completionNotice,
  flowCreditsForElapsed,
  loadState,
  readPersisted,
  rederiveStreakForBoundary,
  reducer,
  type BloomState,
} from './useBloom';
import { finalizeSession, newOpenSession } from './sessions';

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

const TEST_TASK_ONE = {
  id: 1,
  t: 'Draft the outline',
  done: false,
  pomos: 0,
  goal: 2,
};

const TEST_TASK_TWO = {
  id: 2,
  t: 'Review the notes',
  done: false,
  pomos: 0,
  goal: 1,
};

function makeState(patch: Partial<BloomState> = {}): BloomState {
  const base: BloomState = {
    ...DEFAULT_STATE,
    tasks: DEFAULT_STATE.tasks.map((task) => ({ ...task })),
    palXp: { ...DEFAULT_STATE.palXp },
    goals: DEFAULT_STATE.goals.map((goal) => ({ ...goal })),
    sessionRecords: [...DEFAULT_STATE.sessionRecords],
    ifThenPlans: [...DEFAULT_STATE.ifThenPlans],
    parking: [...DEFAULT_STATE.parking],
    guideRead: {
      readAt: { ...DEFAULT_STATE.guideRead.readAt },
      suggestions: [...DEFAULT_STATE.guideRead.suggestions],
    },
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

describe('honest first-run task state', () => {
  it('starts with no example tasks or preselected active task', () => {
    expect(DEFAULT_STATE.tasks).toEqual([]);
    expect(DEFAULT_STATE.activeTaskId).toBeNull();
  });
});

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
      tasks: [{ ...TEST_TASK_ONE }],
      activeTaskId: TEST_TASK_ONE.id,
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

  it('counts an early-morning completion toward the previous study day', () => {
    const endedAt = new Date(2026, 6, 20, 0, 30).getTime();
    vi.setSystemTime(endedAt);
    const openFocus = {
      ...newOpenSession('focus', 25, undefined, undefined, endedAt - 25 * 60_000),
      endsAt: endedAt,
      remainingSec: 0,
    };
    const state = makeState({
      today: '2026-07-19',
      now: endedAt,
      running: true,
      endsAt: endedAt,
      remaining: 0,
      openFocus,
      settings: { ...DEFAULT_STATE.settings, dayStartHour: 4 },
    });

    const completed = reducer(state, { type: 'complete' });

    expect(completed.lastFocusDay).toBe('2026-07-19');
    expect(completed.streak).toBe(1);
    expect(completed.sessionRecords[0]?.endedAt).toBe(endedAt);
  });

  it('re-derives the streak tail from raw records when the boundary changes', () => {
    const endedAt = new Date(2026, 6, 20, 0, 30).getTime();
    const record = finalizeSession(
      newOpenSession('focus', 25, undefined, undefined, endedAt - 25 * 60_000),
      'completed',
      25,
      endedAt,
    );
    const state = makeState({
      today: '2026-07-20',
      now: endedAt,
      streak: 1,
      lastFocusDay: '2026-07-20',
      sessionRecords: [record],
    });

    expect(rederiveStreakForBoundary(state, 4)).toMatchObject({
      streak: 1,
      lastFocusDay: '2026-07-19',
    });

    const changed = reducer(state, {
      type: 'patchSettings',
      patch: { dayStartHour: 4 },
      at: endedAt,
    });
    expect(changed.today).toBe('2026-07-19');
    expect(changed.lastFocusDay).toBe('2026-07-19');
    expect(changed.sessionRecords).toEqual([record]);
    expect(changed.sessionRecords[0]).toBe(record);
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

  it('uses one nearest-block rule for Flow preview and reducer credit', () => {
    expect(flowCreditsForElapsed(12.49 * 60, 25 * 60)).toBe(0);
    expect(flowCreditsForElapsed(12.5 * 60, 25 * 60)).toBe(1);
    expect(flowCreditsForElapsed(37.5 * 60, 25 * 60)).toBe(2);
    expect(flowCreditsForElapsed(24 * 60 * 60, 25 * 60)).toBe(12);

    const state = makeState({
      mode: 'flow',
      flowAcc: 37.5 * 60,
      remaining: 37.5 * 60,
      openFlow: { ...newOpenSession('flow', null, 1), running: false },
    });
    const next = reducer(state, { type: 'finishFlow' });

    expect(next.sessions).toBe(flowCreditsForElapsed(37.5 * 60, 25 * 60));
    expect(next.palXp.Mochi).toBe(2);
  });

  it.each(['focus', 'tiny'] as const)(
    'keeps an open %s session\'s exact identity and duration through unrelated edits',
    (mode) => {
      const plannedMin = mode === 'focus' ? 25 : 5;
      const openFocus = {
        ...newOpenSession(mode, plannedMin, 1),
        targetText: 'Draft the first paragraph',
        running: false,
        remainingSec: 137,
      };
      const state = makeState({
        mode,
        running: false,
        remaining: 137,
        openFocus,
      });

      const selected = reducer(state, { type: 'setActiveTask', id: 2 });
      const renamed = reducer(selected, { type: 'patchSettings', patch: { name: 'Mira' } });
      const resized = reducer(renamed, {
        type: 'patchSettings',
        patch: { durations: { ...renamed.settings.durations, focus: 40 * 60 } },
      });

      expect(resized.remaining).toBe(137);
      expect(resized.openFocus).toMatchObject({
        id: openFocus.id,
        mode,
        plannedMin,
        taskId: 1,
        targetText: 'Draft the first paragraph',
      });
    },
  );

  it.each(['short', 'long'] as const)(
    'completes a %s break once, advances once, and writes no work record',
    (mode) => {
      const state = makeState({
        mode,
        running: true,
        endsAt: Date.now(),
        remaining: 0,
        sessions: mode === 'long' ? 4 : 1,
      });

      const completed = reducer(state, { type: 'complete' });
      const duplicateComplete = reducer(completed, { type: 'complete' });
      const advanced = reducer(duplicateComplete, { type: 'clearDone' });
      const duplicateAdvance = reducer(advanced, { type: 'clearDone' });

      expect(duplicateComplete).toBe(completed);
      expect(advanced.mode).toBe('focus');
      expect(advanced.sessionRecords).toHaveLength(0);
      expect(advanced.sessions).toBe(state.sessions);
      expect(duplicateAdvance).toBe(advanced);
    },
  );

  it('auto-starts and finalizes the next work record at most once', () => {
    const breakDone = makeState({
      mode: 'short',
      justDone: true,
      remaining: 0,
      settings: { ...DEFAULT_STATE.settings, autoStart: true },
    });
    const started = reducer(breakDone, { type: 'clearDone' });
    const duplicateStart = reducer(started, { type: 'clearDone' });
    const completed = reducer(
      { ...duplicateStart, remaining: 0, endsAt: Date.now() },
      { type: 'complete' },
    );
    const duplicateCompletion = reducer(completed, { type: 'complete' });

    expect(duplicateStart).toBe(started);
    expect(started.openFocus).not.toBeNull();
    expect(duplicateCompletion).toBe(completed);
    expect(completed.sessionRecords).toHaveLength(1);
    expect(completed.sessionRecords[0]).toMatchObject({
      id: started.openFocus?.id,
      outcome: 'completed',
    });
  });

  it.each([
    ['reset', { type: 'reset' } as const],
    ['mode switch', { type: 'pick', mode: 'short' } as const],
    ['skip', { type: 'skip' } as const],
  ])('finalizes an abandoned session at most once through %s', (_label, action) => {
    const openFocus = {
      ...newOpenSession('focus', 25, 1),
      running: false,
      remainingSec: 20 * 60,
    };
    const state = makeState({
      mode: 'focus',
      running: false,
      remaining: 20 * 60,
      openFocus,
    });

    const once = reducer(state, action);
    const twice = reducer(once, action);

    expect(once.sessionRecords.filter((record) => record.id === openFocus.id)).toHaveLength(1);
    expect(twice.sessionRecords.filter((record) => record.id === openFocus.id)).toHaveLength(1);
    expect(once.sessionRecords[0]?.outcome).toBe('abandoned');
  });

  it('holds an elapsed return at zero, then completes once after the answer', () => {
    const capturedAt = Date.now() - 2 * 60_000;
    const openFocus = {
      ...newOpenSession('focus', 1, 1, undefined, capturedAt - 60_000),
      endsAt: Date.now() - 60_000,
      returnSnapshot: {
        capturedAt,
        returnedAt: Date.now(),
        elapsedSec: 30,
        remainingSec: 30,
        mode: 'focus' as const,
        round: 1,
        sessionId: '',
      },
    };
    openFocus.returnSnapshot.sessionId = openFocus.id;
    const pending = makeState({
      mode: 'focus',
      running: true,
      endsAt: openFocus.endsAt,
      remaining: 0,
      openFocus,
    });

    const held = reducer(pending, { type: 'tick' });
    const completed = reducer(held, { type: 'resolveTabReturn', resolution: 'focused' });
    const repeated = reducer(completed, { type: 'resolveTabReturn', resolution: 'focused' });

    expect(held.sessionRecords).toHaveLength(0);
    expect(held.openFocus?.returnSnapshot).toBeDefined();
    expect(completed.sessionRecords).toHaveLength(1);
    expect(completed.sessionRecords[0]).toMatchObject({ id: openFocus.id, outcome: 'completed' });
    expect(repeated).toBe(completed);
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

  it('migrates v20 through guide and study-day settings without moving existing data', () => {
    const task = {
      id: 42,
      t: 'Keep this task',
      done: false,
      pomos: 3,
      goal: 4,
    };
    localStorage.setItem(
      'bloom-state',
      JSON.stringify({
        version: 20,
        sessions: 7,
        streak: 5,
        tasks: [task],
        settings: { name: 'Mira' },
      }),
    );

    const persisted = readPersisted();

    expect(persisted).toMatchObject({
      version: 23,
      sessions: 7,
      streak: 5,
      tasks: [task],
      guideRead: { readAt: {}, suggestions: [] },
      settings: { name: 'Mira', dayStartHour: 0 },
    });
  });

  it('loads valid guide reads and drops unknown persisted article ids', () => {
    localStorage.setItem(
      'bloom-state',
      JSON.stringify({
        version: 21,
        settings: { name: 'Mira' },
        guideRead: {
          readAt: {
            'first-pebble': 1_752_660_000_000,
            'not-an-article': 1_752_660_000_001,
          },
        },
      }),
    );

    expect(loadState().guideRead).toEqual({
      readAt: { 'first-pebble': 1_752_660_000_000 },
      suggestions: [],
    });
  });
});

describe('Field Guide read markers', () => {
  it('records an opened article without changing focus rewards', () => {
    const state = makeState({ sessions: 4, streak: 3, palXp: { Mochi: 2 } });

    const next = reducer(state, {
      type: 'markGuideArticleRead',
      id: 'parking-lot',
      at: 1_752_660_000_000,
    });

    expect(next.guideRead).toEqual({
      readAt: { 'parking-lot': 1_752_660_000_000 },
      suggestions: [],
    });
    expect(next.sessions).toBe(4);
    expect(next.streak).toBe(3);
    expect(next.palXp).toEqual({ Mochi: 2 });
  });

  it('records a contextual suggestion without changing focus rewards', () => {
    const state = makeState({ sessions: 4, streak: 3, palXp: { Mochi: 2 } });

    const next = reducer(state, {
      type: 'markGuideArticleSuggested',
      id: 'parking-lot',
      momentKey: 'debrief:s-1',
      at: 1_752_660_000_000,
    });

    expect(next.guideRead.suggestions).toEqual([{
      articleId: 'parking-lot',
      momentKey: 'debrief:s-1',
      surfacedAt: 1_752_660_000_000,
    }]);
    expect(next.sessions).toBe(4);
    expect(next.streak).toBe(3);
    expect(next.palXp).toEqual({ Mochi: 2 });
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
    const state = makeState({
      tasks: [{ ...TEST_TASK_ONE }],
      activeTaskId: TEST_TASK_ONE.id,
    });

    const done = reducer(state, { type: 'toggleTask', id: TEST_TASK_ONE.id });
    expect(done.tasks.find((t) => t.id === TEST_TASK_ONE.id)?.completedAt).toBe(Date.now());

    const undone = reducer(done, { type: 'toggleTask', id: TEST_TASK_ONE.id });
    expect(undone.tasks.find((t) => t.id === TEST_TASK_ONE.id)?.completedAt).toBeUndefined();
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

  it('restores a removed task intact and returns active focus to it', () => {
    const task = { ...TEST_TASK_ONE, pomos: 3, completedAt: Date.now() };
    const state = makeState({ tasks: [task, { ...TEST_TASK_TWO }], activeTaskId: task.id });

    const removed = reducer(state, { type: 'removeTask', id: task.id });
    const restored = reducer(removed, {
      type: 'restoreTask',
      task,
      index: 0,
      wasActive: true,
    });

    expect(restored.tasks[0]).toEqual(task);
    expect(restored.activeTaskId).toBe(task.id);
  });

  it('restores a removed goal with its id, progress, completion stamp, and task links', () => {
    const completedGoal = { ...goal, done: 12, completedAt: Date.now() };
    const state = makeState({
      goals: [completedGoal],
      tasks: [{ ...TEST_TASK_ONE, goalId: goal.id }],
    });

    const removed = reducer(state, { type: 'removeGoal', id: goal.id });
    const restored = reducer(removed, {
      type: 'restoreGoal',
      goal: completedGoal,
      index: 0,
      linkedTaskIds: [TEST_TASK_ONE.id],
    });

    expect(restored.goals).toEqual([completedGoal]);
    expect(restored.tasks[0].goalId).toBe(goal.id);
  });
});

describe('focus-history clearing', () => {
  it('clears raw reflection history and its cadence cache in one state transition', () => {
    const record = finalizeSession(newOpenSession('focus', 25, 1), 'completed', 25);
    const task = { ...TEST_TASK_ONE, pomos: 4, done: true };
    const goal = {
      id: 9,
      title: 'Keep this progress',
      due: '2026-08-01',
      target: 10,
      done: 4,
      createdAt: 1,
    };
    const state = makeState({
      sessions: 8,
      streak: 5,
      palXp: { Mochi: 7 },
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
          because: 'recent session history',
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

    const cleared = reducer(state, { type: 'clearFocusData' });

    expect(cleared.sessionRecords).toEqual([]);
    expect(cleared.lastWeeklyReviewWeek).toBeNull();
    expect(cleared.personalCadence).toEqual({
      computedAt: null,
      recommendation: null,
      history: [{ focusMin: 25, breakMin: 5 }],
    });
    expect(cleared).toMatchObject({
      sessions: 8,
      streak: 5,
      palXp: { Mochi: 7 },
      tasks: [task],
      goals: [goal],
    });
  });
});
