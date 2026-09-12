/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { dayKeyFor } from './store/dayKey';
import { finalizeSession, newOpenSession } from './store/sessions';
import { SCHEMA_VERSION } from './store/useBloom';
import { WEEKLY_MIN_SESSIONS } from './insights/weekly';

vi.mock('./components/DaySky', () => ({ DaySky: () => null }));
vi.mock('./components/NightSky', () => ({ NightSky: () => null }));
vi.mock('./components/PixelPal', () => ({
  PixelPal: () => <div aria-hidden="true" data-testid="pixel-pal" />,
}));
vi.mock('./components/CompanionPrompt', () => ({ CompanionPrompt: () => null }));
vi.mock('./store/useCompanion', () => ({
  useCompanion: () => ({
    enabled: false,
    conf: { intention: false },
    prompt: null,
    summary: null,
    actions: { returnDrifted: vi.fn() },
  }),
}));

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

function seedNamedState() {
  localStorage.setItem(
    'bloom-state',
    JSON.stringify({
      version: 22,
      settings: { name: 'Mira', planner: true, companion: { on: true } },
      ritual: { enabled: false, suggestionSeen: true },
      tasks: [{ id: 7, t: 'Draft outline', done: false, pomos: 0, goal: 2, goalId: 4 }],
      activeTaskId: 7,
      goals: [{
        id: 4,
        title: 'Write chapter',
        due: '2026-08-01',
        target: 8,
        done: 2,
        createdAt: Date.now(),
      }],
    }),
  );
}

function seedPendingReturnState() {
  const now = Date.now();
  const id = 'return-owner';
  localStorage.setItem(
    'bloom-state',
    JSON.stringify({
      version: 29,
      settings: { name: 'Mira', companion: { on: true } },
      ritual: { enabled: false, suggestionSeen: true },
      running: true,
      remaining: 12 * 60,
      openFocus: {
        id,
        startedAt: now - 10 * 60_000,
        mode: 'focus',
        plannedMin: 25,
        startHour: new Date(now).getHours(),
        endsAt: now + 12 * 60_000,
        remainingSec: 12 * 60,
        running: true,
        driftEventIds: [],
        returnSnapshot: {
          capturedAt: now - 60_000,
          returnedAt: now,
          elapsedSec: 9 * 60,
          remainingSec: 16 * 60,
          mode: 'focus',
          round: 1,
          sessionId: id,
        },
      },
    }),
  );
}

describe('screen semantics and named controls', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('announces each primary screen and the active navigation destination', () => {
    seedNamedState();
    render(<App />);

    expect(screen.getByRole('main', { name: /Focus\. Hi, Mira/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: /Focus\. Hi, Mira/i })).toBeTruthy();
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    expect(primaryNav).toBeTruthy();
    expect(within(primaryNav).getByRole('button', { name: 'Focus' }).getAttribute('aria-current'))
      .toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(screen.getByRole('main', { name: 'Tasks' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByRole('main', { name: 'History' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'Goals' }));
    expect(screen.getByRole('main', { name: 'Goals & deadlines' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Goals & deadlines' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Friends' }));
    expect(screen.getByRole('main', { name: 'My little friends' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'My little friends' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Field Guide' }));
    expect(screen.getByRole('main', { name: 'Field Guide' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Small notes for focus' })).toBeTruthy();
  });

  it('names task selection, completion, cadence, and add-form controls', () => {
    seedNamedState();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));

    expect(screen.getByRole('checkbox', { name: 'Mark complete: Draft outline' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Selected task: Draft outline' }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('listitem', {
      name: 'Current cadence: 25 minutes focus, 5 minutes break',
    }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', {
      name: 'Recommended cadence is already set: 25 minutes focus, 5 minutes break',
    })).toBeTruthy();

    const taskName = screen.getByRole('textbox', { name: 'Task name' });
    expect(screen.getByRole('button', { name: 'Goal: 1 pomodoros' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'goal (optional)' })).toBeTruthy();
    fireEvent.blur(taskName);
    expect(screen.getByRole('alert').textContent).toBe('Add a task name to continue.');
    expect(taskName.getAttribute('aria-invalid')).toBe('true');
  });

  it('cycles daily targets after arming one without changing which goal is armed', () => {
    const now = Date.now();
    const today = dayKeyFor(now, 0);
    const goals = [
      { id: 4, title: 'Write chapter', due: today, target: 8, done: 0, createdAt: now },
      { id: 5, title: 'Review notes', due: today, target: 8, done: 0, createdAt: now + 1 },
    ];
    localStorage.setItem('bloom-state', JSON.stringify({
      version: SCHEMA_VERSION,
      today,
      settings: { name: 'Mira', planner: true, dayStartHour: 0 },
      ritual: { enabled: false, suggestionSeen: true },
      goals,
      dayPlan: {
        targets: goals.map((goal, index) => ({
          id: `target-${goal.id}`,
          goalId: goal.id,
          dayKey: today,
          plannedAmount: 2,
          snapshot: { title: goal.title, unit: 'parts' },
          createdAt: now + index,
        })),
        archive: [],
      },
    }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'count next session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show next daily target' }));

    expect(screen.getByRole('button', { name: /Review notes.*today/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'count next session' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Show next daily target' }));
    expect(screen.getByRole('button', { name: /Write chapter.*today/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'armed ✓' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('withdraws an old interrupted-session reminder when a new session starts or pauses', () => {
    const now = Date.now();
    const interrupted = {
      ...finalizeSession(
        newOpenSession('focus', 25, undefined, undefined, now - 10 * 60_000),
        'interrupted',
        5,
        now - 5 * 60_000,
      ),
      resumeCuePending: true,
    };
    localStorage.setItem('bloom-state', JSON.stringify({
      version: SCHEMA_VERSION,
      settings: { name: 'Mira' },
      ritual: { enabled: false, suggestionSeen: true },
      sessionRecords: [interrupted],
    }));
    render(<App />);
    expect(screen.getByRole('region', { name: 'Resume interrupted session' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.queryByRole('region', { name: 'Resume interrupted session' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.queryByRole('region', { name: 'Resume interrupted session' })).toBeNull();
    const saved = JSON.parse(localStorage.getItem('bloom-state')!);
    expect(saved.openFocus.id).not.toBe(interrupted.id);
    expect(saved.sessionRecords.some((record: { id: string }) => record.id === interrupted.id)).toBe(true);
  });

  it.each([WEEKLY_MIN_SESSIONS - 1, WEEKLY_MIN_SESSIONS])(
    'automatically reviews only enough recent sessions (count=%s)',
    (count) => {
      const now = Date.now();
      const sessionRecords = Array.from({ length: count }, (_, index) => finalizeSession(
        newOpenSession('focus', 25, undefined, undefined, now - (index + 2) * 30 * 60_000),
        'completed',
        25,
        now - (index + 1) * 30 * 60_000,
      ));
      // Older records must not lift a sparse current week above its threshold.
      sessionRecords.unshift(finalizeSession(
        newOpenSession('focus', 25, undefined, undefined, now - 9 * 86_400_000),
        'completed',
        25,
        now - 8 * 86_400_000,
      ));
      localStorage.setItem('bloom-state', JSON.stringify({
        version: SCHEMA_VERSION,
        settings: { name: 'Mira' },
        ritual: { enabled: false, suggestionSeen: true },
        sessionRecords,
      }));
      render(<App />);

      expect(Boolean(screen.queryByRole('status', { name: 'Weekly review' })))
        .toBe(count >= WEEKLY_MIN_SESSIONS);
    },
  );

  it('keeps automatic reviews and old goal-credit debriefs quiet while Flow is paused', () => {
    const now = Date.now();
    const sessionRecords = Array.from({ length: WEEKLY_MIN_SESSIONS }, (_, index) => ({
      ...finalizeSession(
        newOpenSession('focus', 25, undefined, undefined, now - (index + 2) * 30 * 60_000),
        'completed',
        25,
        now - (index + 1) * 30 * 60_000,
      ),
      goalCredit: index === 0 ? 'pending' : undefined,
    }));
    localStorage.setItem('bloom-state', JSON.stringify({
      version: SCHEMA_VERSION,
      settings: { name: 'Mira', flow: true },
      ritual: { enabled: false, suggestionSeen: true },
      sessionRecords,
      openFlow: newOpenSession('flow', null, undefined),
      flow: { acc: 120 },
    }));
    render(<App />);

    expect(screen.queryByRole('status', { name: 'Weekly review' })).toBeNull();
    expect(screen.queryByRole('status', { name: 'Session debrief' })).toBeNull();
  });

  it('persists declining goal credit when closing a debrief so navigation does not restore it', () => {
    const now = Date.now();
    const record = {
      ...finalizeSession(
        newOpenSession('focus', 25, undefined, undefined, now - 30 * 60_000),
        'completed',
        25,
        now - 5 * 60_000,
      ),
      goalId: 4,
      goalCredit: 'pending',
    };
    localStorage.setItem('bloom-state', JSON.stringify({
      version: SCHEMA_VERSION,
      settings: { name: 'Mira', planner: true, goalCredit: 'ask' },
      ritual: { enabled: false, suggestionSeen: true },
      goals: [{ id: 4, title: 'Write chapter', due: dayKeyFor(now, 0), target: 8, done: 0, createdAt: now }],
      sessionRecords: [record],
    }));
    render(<App />);
    const debrief = screen.getByRole('status', { name: 'Session debrief' });
    fireEvent.click(within(debrief).getByRole('button', { name: /without goal credit/ }));

    const saved = JSON.parse(localStorage.getItem('bloom-state')!);
    expect(saved.sessionRecords[0].goalCredit).toBe('skipped');
    expect(saved.goals[0].done).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'Focus' }));
    expect(screen.queryByRole('status', { name: 'Session debrief' })).toBeNull();
  });

  it('uses visible labels and inline errors for goal fields', () => {
    seedNamedState();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Goals' }));

    const goalName = screen.getByRole('textbox', { name: 'Goal name' });
    const dueDate = screen.getByLabelText('Due date');
    expect(screen.getByLabelText('Amount')).toBeTruthy();
    expect(screen.getByLabelText('Counted in…')).toBeTruthy();

    fireEvent.blur(goalName);
    fireEvent.blur(dueDate);
    expect(screen.getByText('Add a goal name.')).toBeTruthy();
    expect(screen.getByText('Choose a due date.')).toBeTruthy();
    expect(goalName.getAttribute('aria-invalid')).toBe('true');
    expect(dueDate.getAttribute('aria-invalid')).toBe('true');
  });

  it('labels the onboarding name field visibly', () => {
    render(<App />);

    expect(screen.getByRole('main', { name: 'welcome to Bloom' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'welcome to Bloom' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeTruthy();
  });

  it('keeps unresolved return truth modal, focused, and visible across navigation attempts', () => {
    seedPendingReturnState();
    render(<App />);

    const dialog = screen.getByRole('dialog', { name: 'Return to your session' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Return to your session' }),
    );
    expect(
      screen.getByRole('button', { name: 'Pause', hidden: true }).hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tasks', hidden: true }));

    expect(screen.getByRole('dialog', { name: 'Return to your session' })).toBeTruthy();
    expect(screen.queryByRole('main', { name: 'Tasks', hidden: true })).toBeNull();
    const hiddenFocus = document.getElementById('focus-screen');
    expect(hiddenFocus?.tagName).toBe('MAIN');
    expect(hiddenFocus?.getAttribute('aria-hidden')).toBe('true');
  });
});
