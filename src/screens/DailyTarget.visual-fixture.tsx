import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TabBar } from '../components/TabBar';
import { FoundationsCard } from '../components/FoundationsCard';
import { DEFAULT_COMPANION } from '../store/companion';
import {
  addGoalDailyTarget,
  dismissDailyTarget,
  editDailyTarget,
  type DayPlanState,
  type TaskDailyTarget,
} from '../store/dailyTarget';
import type { GoalCredit } from '../store/goalLedger';
import type { Goal } from '../store/goals';
import {
  createFoundationInstance,
  foundationEntryId,
  type FoundationsState,
} from '../store/foundations';
import type { SessionRecord } from '../store/sessions';
import { DEFAULT_STATE } from '../store/useBloom';
import type { Companion } from '../store/useCompanion';
import { FocusScreen } from './FocusScreen';
import { GoalsScreen } from './GoalsScreen';
import '../styles.css';
import './DailyTarget.visual-fixture.css';

const NOW = new Date(2026, 7, 10, 12).getTime();
const TODAY = '2026-08-10';
const goals: Goal[] = [
  {
    id: 1,
    title: 'Biology review',
    due: '2026-08-25',
    target: 12,
    done: 5,
    unit: 'lectures',
    createdAt: NOW - 20 * 86_400_000,
  },
  {
    id: 2,
    title: 'Shape the essay',
    due: '2026-08-28',
    target: 8,
    done: 3,
    unit: 'sections',
    createdAt: NOW - 18 * 86_400_000,
  },
];
const tasks = [{ id: 7, t: 'Read the outline', done: false, pomos: 1, goal: 3 }];
const ledger: GoalCredit[] = [
  {
    id: 'fixture-biology-credit',
    goalId: 1,
    delta: 2,
    source: 'session',
    sessionId: 'fixture-session',
    dayKey: TODAY,
    at: NOW - 60_000,
  },
  {
    id: 'fixture-essay-credit',
    goalId: 2,
    delta: 2,
    source: 'session',
    sessionId: 'fixture-session-two',
    dayKey: TODAY,
    at: NOW - 30_000,
  },
];
const taskSession: SessionRecord = {
  id: 'fixture-task-session',
  startedAt: NOW - 25 * 60_000,
  endedAt: NOW,
  mode: 'focus',
  plannedMin: 25,
  actualMin: 25,
  outcome: 'completed',
  startHour: 11,
  taskId: 7,
  driftEventIds: [],
};

const activeTargets: DayPlanState = {
  targets: [
    {
      id: 'fixture-active',
      goalId: 1,
      dayKey: TODAY,
      plannedAmount: 3,
      snapshot: Object.freeze({ title: 'Biology review', unit: 'lectures' }),
      createdAt: NOW - 3_000,
    },
    {
      id: 'fixture-complete',
      goalId: 2,
      dayKey: TODAY,
      plannedAmount: 2,
      snapshot: Object.freeze({ title: 'Shape the essay', unit: 'sections' }),
      createdAt: NOW - 2_000,
    },
    {
      id: 'fixture-task',
      taskId: 7,
      dayKey: TODAY,
      plannedAmount: 2,
      snapshot: Object.freeze({ title: 'Read the outline', unit: 'sessions' }),
      createdAt: NOW - 1_000,
    },
  ],
  archive: [],
};
const foundationInstances = ['phone-away', 'desk-reset', 'tiny-start'].map((type, order) =>
  createFoundationInstance({
    type: type as 'phone-away' | 'desk-reset' | 'tiny-start',
    order,
    at: NOW - 2 * 86_400_000,
  })!,
);
const activeFoundations: FoundationsState = {
  instances: foundationInstances,
  entries: foundationInstances.map((instance, index) => {
    const dayKey = index === 0 ? TODAY : '2026-08-09';
    return {
      id: foundationEntryId(instance.id, dayKey),
      instanceId: instance.id,
      dayKey,
      recordedAt: NOW - index * 60_000,
    };
  }),
  archive: [],
};

function Fixture() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const night = params.get('theme') === 'night';
  const expandedSpacing = params.get('spacing') === 'expanded';
  const preference = params.get('preference');
  const preferenceClass =
    preference === 'more'
      ? ' contrast-more-fixture'
      : preference === 'forced'
        ? ' forced-colors-fixture'
        : '';
  const fixtureState = params.get('state') ?? 'active';
  const surface = params.get('surface') ?? 'goals';
  const empty = fixtureState !== 'active';
  const autoStateApplied = useRef(false);
  const [dayPlan, setDayPlan] = useState<DayPlanState>(
    empty ? { targets: [], archive: [] } : activeTargets,
  );
  const taskActual = (target: TaskDailyTarget) =>
    target.taskId === taskSession.taskId ? 1 : 0;

  useEffect(() => {
    if (
      surface !== 'goals' ||
      autoStateApplied.current ||
      !['entry', 'error'].includes(fixtureState)
    ) return;
    autoStateApplied.current = true;
    const openFrame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.day-plan-open')?.click();
      if (fixtureState !== 'error') return;
      window.requestAnimationFrame(() => {
        const form = document.querySelector<HTMLFormElement>('.day-plan-form');
        const input = form?.querySelector<HTMLInputElement>('input[type="number"]');
        if (!form || !input) return;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        form.requestSubmit();
      });
    });
    return () => window.cancelAnimationFrame(openFrame);
  }, [fixtureState, surface]);

  useEffect(() => {
    if (surface !== 'foundations' || fixtureState !== 'picker') return;
    const openFrame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.foundations-tend')?.click();
    });
    return () => window.cancelAnimationFrame(openFrame);
  }, [fixtureState, surface]);

  const bloom = {
    state: {
      goals,
      tasks,
      goalLedger: ledger,
      dayPlan,
      sessionRecords: [taskSession],
      lastRolloverOfferDay: TODAY,
      settings: { planner: true, dayStartHour: 0 },
    },
    now: NOW,
    today: TODAY,
    palSprite: 'bunny',
    actions: {
      addGoalDailyTarget: (goalId: number, plannedAmount: number, targetAt: number) => {
        const goal = goals.find((item) => item.id === goalId);
        if (!goal) return;
        setDayPlan((current) =>
          addGoalDailyTarget(current, { goal, plannedAmount, targetAt, now: NOW }),
        );
      },
      editDailyTarget: (id: string, plannedAmount: number) =>
        setDayPlan((current) =>
          editDailyTarget(current, {
            id,
            plannedAmount,
            ledger,
            taskActual,
            now: NOW,
          }),
        ),
      dismissDailyTarget: (id: string) =>
        setDayPlan((current) => dismissDailyTarget(current, id)),
      markRolloverOffered: () => undefined,
      resolveRollover: () => undefined,
      addGoal: () => undefined,
      updateGoal: () => undefined,
      removeGoal: () => undefined,
      restoreGoal: () => undefined,
      logGoal: () => undefined,
    },
  } as unknown as Parameters<typeof GoalsScreen>[0]['bloom'];

  const noOp = () => undefined;
  const focusState = {
    ...DEFAULT_STATE,
    today: TODAY,
    now: NOW,
    goals,
    tasks,
    activeTaskId: 7,
    armedGoalId: fixtureState === 'active' ? 1 : null,
    goalLedger: ledger,
    dayPlan: fixtureState === 'active' ? activeTargets : { targets: [], archive: [] },
    lastRolloverOfferDay: TODAY,
    settings: {
      ...DEFAULT_STATE.settings,
      name: 'Mira',
      planner: true,
    },
  };
  const focusBloom = {
    state: focusState,
    today: TODAY,
    now: NOW,
    mood: 'idle',
    statusLabel: 'ready when you are',
    palSprite: 'bunny',
    activeTask: tasks[0],
    actions: new Proxy({}, { get: () => noOp }),
    storageRecovery: { retry: noOp, recover: noOp, recoveredBloom: {} },
    completionAlerts: {
      status: { permission: 'unsupported' },
      primerOpen: false,
      requestPermission: noOp,
      dismissPrimer: noOp,
      refreshStatus: noOp,
    },
    liveActivity: { isIOS: false, status: undefined, checking: false, refreshStatus: noOp },
    mmss: (seconds: number) =>
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    clock: (seconds: number) =>
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
  } as unknown as Parameters<typeof FocusScreen>[0]['bloom'];
  const focusCompanion = {
    enabled: false,
    conf: DEFAULT_COMPANION,
    prompt: null,
    summary: null,
    actions: new Proxy({}, { get: () => noOp }),
  } as unknown as Companion;

  return (
    <div className="bezel">
      <div
        className={`phone mode-focus${night ? ' night' : ''}${expandedSpacing ? ' text-spacing-fixture' : ''}${preferenceClass}`}
      >
        <div className="sky-mood" aria-hidden="true">
          <div className="sky-layer sky-focus" />
        </div>
        {surface === 'focus' ? (
          <FocusScreen
            bloom={focusBloom}
            companion={focusCompanion}
            onOpenGoals={noOp}
            onOpenGuideArticle={noOp}
          />
        ) : surface === 'foundations' ? (
          <main className="screen tasks-bg" aria-label="Foundations fixture">
            <FoundationsCard
              foundations={fixtureState === 'empty'
                ? { instances: [], entries: [], archive: [] }
                : activeFoundations}
              records={fixtureState === 'empty' ? [] : [taskSession]}
              today={TODAY}
              dayStartHour={0}
              onToggleDay={noOp}
              onSetEnabled={noOp}
              onReorder={noOp}
              onRenameCustom={noOp}
              plans={[]}
              onCreatePlan={noOp}
              onRemovePlan={noOp}
              onSetIfThen={noOp}
              onMarkRestartOffered={noOp}
            />
          </main>
        ) : (
          <GoalsScreen bloom={bloom} />
        )}
        <TabBar
          active={surface === 'focus' ? 'focus' : surface === 'foundations' ? 'tasks' : 'goals'}
          onChange={noOp}
          showGoals
        />
      </div>
    </div>
  );
}

const night = new URLSearchParams(window.location.search).get('theme') === 'night';
document.body.classList.toggle('night', night);
const rootHost = document.getElementById('root')! as HTMLElement & {
  dailyTargetFixtureRoot?: Root;
};
rootHost.dailyTargetFixtureRoot ??= createRoot(rootHost);
rootHost.dailyTargetFixtureRoot.render(<Fixture />);
