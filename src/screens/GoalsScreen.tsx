import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import { Dialog } from '../components/Dialog';
import { RolloverTriageCard } from '../components/RolloverTriageCard';
import type { useBloom } from '../store/useBloom';
import {
  GOAL_TARGET_MAX,
  GOAL_UNIT_MAX,
  dueLabelForStudyDay,
  daysLeftForStudyDay,
  goalDeadlineOutcomeLine,
  goalPaceForStudyDay,
  goalProgressText,
  goalUnit,
  parseDue,
  type Goal,
} from '../store/goals';
import {
  medianSessionCredit,
  type GoalCredit,
} from '../store/goalLedger';
import {
  observedLanding,
  observedLandingLine,
  sessionEffortLine,
} from '../insights/paceActual';
import {
  isGoalDailyTarget,
  parseDailyTargetAmount,
  rolloverOffers,
  spreadRolloverTarget,
  targetActual,
  type RolloverOffer,
  type TaskDailyTarget,
} from '../store/dailyTarget';
import { dayKeyFor } from '../store/dayKey';
import { sessionCountsTowardDay } from '../store/sessions';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DeletedGoal {
  goal: Goal;
  index: number;
  linkedTaskIds: number[];
  goalCredits: GoalCredit[];
}

type GoalConfirmation =
  | { kind: 'shrink'; goal: Goal; target: number }
  | { kind: 'remove'; goal: Goal };

function shortDate(due: string): string {
  const d = parseDue(due);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function localNoon(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

/**
 * Goals & deadlines (opt-in): everything you're working toward on one screen. Each goal is
 * a deadline plus a count of parts (lectures, chapters, problem sets…) and a
 * count finished, so working always points at something — and the card answers
 * the real question: "what pace gets me there?". Suggestions stay quiet when
 * a deadline is missed or a pace is out of reach; no guilt, no fantasy math.
 */
export function GoalsScreen({ bloom }: { bloom: ReturnType<typeof useBloom> }) {
  const { state, now, today, palSprite, actions } = bloom;
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [target, setTarget] = useState('10');
  const [unit, setUnit] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editTarget, setEditTarget] = useState('1');
  const [editUnit, setEditUnit] = useState('');
  const [deletedGoal, setDeletedGoal] = useState<DeletedGoal | null>(null);
  const [confirmation, setConfirmation] = useState<GoalConfirmation | null>(null);
  const [editedGoalUndo, setEditedGoalUndo] = useState<Goal | null>(null);
  const [addTouched, setAddTouched] = useState({ title: false, due: false });
  const [planningGoalId, setPlanningGoalId] = useState<number | null>(null);
  const [planAmount, setPlanAmount] = useState('1');
  const [planDate, setPlanDate] = useState(today);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const [targetErrors, setTargetErrors] = useState<Record<string, string>>({});
  const [planError, setPlanError] = useState('');
  const [planStatus, setPlanStatus] = useState('');
  const [rolloverOffer, setRolloverOffer] = useState<RolloverOffer | null>(null);
  const planFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!deletedGoal) return;
    const timeout = window.setTimeout(() => setDeletedGoal(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [deletedGoal]);

  useEffect(() => {
    if (!editedGoalUndo) return;
    const timeout = window.setTimeout(() => setEditedGoalUndo(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [editedGoalUndo]);

  useEffect(() => {
    if (planningGoalId === null) return;
    planFormRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [planningGoalId]);

  function beginEdit(
    goal: Goal,
    patch: Partial<Pick<Goal, 'due' | 'target'>> = {},
  ) {
    setEditId(goal.id);
    setEditTitle(goal.title);
    setEditDue(patch.due ?? goal.due);
    setEditTarget(String(patch.target ?? goal.target));
    setEditUnit(goal.unit ?? '');
  }

  function saveEdit(goal: Goal) {
    const nextTarget = Math.max(
      1,
      Math.min(GOAL_TARGET_MAX, parseInt(editTarget, 10) || goal.target),
    );
    if (nextTarget < goal.done) {
      setConfirmation({ kind: 'shrink', goal, target: nextTarget });
      return;
    }
    commitEdit(goal, nextTarget);
  }

  function commitEdit(goal: Goal, nextTarget: number) {
    setEditedGoalUndo({ ...goal });
    actions.updateGoal(goal.id, {
      title: editTitle,
      due: editDue,
      target: nextTarget,
      unit: editUnit,
    });
    setEditId(null);
    setConfirmation(null);
  }

  function undoGoalEdit() {
    if (!editedGoalUndo) return;
    actions.updateGoal(editedGoalUndo.id, {
      title: editedGoalUndo.title,
      due: editedGoalUndo.due,
      target: editedGoalUndo.target,
      unit: editedGoalUndo.unit,
    });
    setEditedGoalUndo(null);
  }

  function removeGoal(goal: Goal) {
    if (goal.done > 0) {
      setConfirmation({ kind: 'remove', goal });
      return;
    }
    commitRemoveGoal(goal);
  }

  function commitRemoveGoal(goal: Goal) {
    setDeletedGoal({
      goal: { ...goal },
      index: state.goals.findIndex((item) => item.id === goal.id),
      linkedTaskIds: state.tasks.filter((task) => task.goalId === goal.id).map((task) => task.id),
      goalCredits: state.goalLedger.filter((credit) => credit.goalId === goal.id),
    });
    actions.removeGoal(goal.id);
    setConfirmation(null);
  }

  function undoGoalDelete() {
    if (!deletedGoal) return;
    actions.restoreGoal(
      deletedGoal.goal,
      deletedGoal.index,
      deletedGoal.linkedTaskIds,
      deletedGoal.goalCredits,
    );
    setDeletedGoal(null);
  }

  const goals = useMemo(
    () => [...state.goals].sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id),
    [state.goals],
  );
  const dayPlanTargets = useMemo(
    () => state.dayPlan?.targets ?? [],
    [state.dayPlan?.targets],
  );
  const todayTargets = useMemo(
    () => dayPlanTargets.filter((item) => item.dayKey === today),
    [dayPlanTargets, today],
  );
  const taskActual = useCallback(
    (item: TaskDailyTarget) =>
      state.sessionRecords.filter(
        (record) =>
          record.taskId === item.taskId &&
          sessionCountsTowardDay(record) &&
          dayKeyFor(record.endedAt, state.settings.dayStartHour) === item.dayKey,
      ).length,
    [state.sessionRecords, state.settings.dayStartHour],
  );
  const rolloverCandidates = useMemo(
    () =>
      rolloverOffers(
        { targets: dayPlanTargets, archive: state.dayPlan?.archive ?? [] },
        {
          todayKey: today,
          ledger: state.goalLedger,
          goals: state.goals,
          taskActual,
        },
      ).filter((offer) => isGoalDailyTarget(offer.target)),
    [
      dayPlanTargets,
      state.dayPlan?.archive,
      state.goalLedger,
      state.goals,
      taskActual,
      today,
    ],
  );

  useEffect(() => {
    setRolloverOffer(null);
  }, [today]);

  useEffect(() => {
    if (
      !state.settings.planner ||
      rolloverOffer ||
      state.lastRolloverOfferDay === today ||
      rolloverCandidates.length === 0
    ) return;
    setRolloverOffer(rolloverCandidates[0]);
    actions.markRolloverOffered(today);
  }, [
    actions,
    rolloverCandidates,
    rolloverOffer,
    state.lastRolloverOfferDay,
    state.settings.planner,
    today,
  ]);

  function beginPlan(goal: Goal) {
    const pace = goalPaceForStudyDay(goal, today, now);
    setPlanningGoalId(goal.id);
    setPlanAmount(String(Math.max(1, Math.min(pace.remaining, Math.ceil(pace.perDay) || 1))));
    setPlanDate(today);
    setPlanError('');
  }

  function confirmPlan(goal: Goal) {
    const remaining = Math.max(1, goal.target - goal.done);
    const plannedAmount = parseDailyTargetAmount(
      planAmount,
      Math.min(99, remaining),
    );
    if (plannedAmount == null) {
      setPlanError(`Choose a whole number from 1 to ${Math.min(99, remaining)}.`);
      return;
    }
    if (planDate < today || planDate > goal.due) {
      setPlanError(`Choose a day from today through ${shortDate(goal.due)}.`);
      return;
    }
    const goalTargetsOnDay = dayPlanTargets.filter(
      (item) => isGoalDailyTarget(item) && item.dayKey === planDate,
    );
    if (goalTargetsOnDay.some((item) => item.goalId === goal.id)) {
      setPlanError(`${goal.title} already has a target for that day.`);
      return;
    }
    if (goalTargetsOnDay.length >= 3) {
      setPlanError('That day already has three goal targets. Pick another day or keep these.');
      return;
    }
    actions.addGoalDailyTarget(goal.id, plannedAmount, localNoon(planDate));
    setPlanningGoalId(null);
    setPlanError('');
    setPlanStatus(
      planDate === today
        ? `Today’s target for ${goal.title} is ${plannedAmount} ${goalUnit(goal)}.`
        : `${goal.title} is planned for ${planDate}: ${plannedAmount} ${goalUnit(goal)}.`,
    );
  }

  function saveTargetAmount(
    item: (typeof todayTargets)[number],
    actual: number,
  ) {
    const raw = targetDrafts[item.id] ?? String(item.plannedAmount);
    const plannedAmount = parseDailyTargetAmount(raw);
    if (plannedAmount == null) {
      setTargetErrors((current) => ({
        ...current,
        [item.id]: 'Choose a whole number from 1 to 99.',
      }));
      return;
    }
    const savedAmount = Math.max(actual, plannedAmount);
    actions.editDailyTarget(item.id, plannedAmount);
    setTargetDrafts((current) => ({ ...current, [item.id]: String(savedAmount) }));
    setTargetErrors((current) => ({ ...current, [item.id]: '' }));
    setPlanStatus(
      plannedAmount < actual
        ? `${item.snapshot.title} stays at ${actual} ${item.snapshot.unit}, matching what is already recorded.`
        : `${item.snapshot.title} is now ${savedAmount} ${item.snapshot.unit} for today.`,
    );
  }

  function removeTarget(id: string, title: string) {
    actions.dismissDailyTarget(id);
    setPlanStatus(`Today’s target for ${title} was removed. Your recorded work stays put.`);
  }

  function spreadOffer() {
    if (!rolloverOffer || !isGoalDailyTarget(rolloverOffer.target)) return;
    const goal = state.goals.find((item) => item.id === rolloverOffer.target.goalId);
    const draft = spreadRolloverTarget(rolloverOffer, goal, today, now);
    if (!draft) {
      setRolloverOffer(null);
      actions.resolveRollover(rolloverOffer.target.id, 'rest');
      return;
    }
    setPlanningGoalId(draft.goalId);
    setPlanAmount(String(draft.plannedAmount));
    setPlanDate(draft.dayKey);
    setRolloverOffer(null);
    actions.resolveRollover(rolloverOffer.target.id, 'rest');
  }

  const totals = goals.reduce(
    (acc, g) => ({
      done: acc.done + Math.min(g.done, g.target),
      target: acc.target + g.target,
    }),
    { done: 0, target: 0 },
  );
  const pct = totals.target ? Math.round((totals.done / totals.target) * 100) : 0;
  const allDone = goals.length > 0 && totals.done >= totals.target;
  const nextUp = goals.find((g) => goalPaceForStudyDay(g, today, now).status === 'active');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !due) {
      setAddTouched({ title: true, due: true });
      return;
    }
    const t = Math.max(1, Math.min(GOAL_TARGET_MAX, parseInt(target, 10) || 1));
    actions.addGoal(title, due, t, unit);
    // Keep date + size so a whole batch of entries goes in quickly.
    setTitle('');
    setUnit('');
    setAddTouched({ title: false, due: false });
  }

  return (
    <main className="screen tasks-bg" id="goals-screen" aria-labelledby="goals-heading">
      <div className="head">
        <h1 className="head-title" id="goals-heading">Goals &amp; deadlines</h1>
        <div className="head-sub">everything you're working toward · progress over pressure</div>
      </div>

      {planStatus && (
        <p className="day-plan-status" role="status" aria-live="polite">
          {planStatus}
        </p>
      )}

      {goals.length > 0 && (
        <div className="prog-card">
          <div className="prog-tile">
            <PixelPal sprite={palSprite} mode={allDone ? 'celebrate' : 'idle'} scale={3} size={58} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="prog-count">
              progress across {goals.length} goal{goals.length === 1 ? '' : 's'}
            </div>
            <div className="prog-sub">
              {allDone
                ? 'every goal is fully logged — lovely work ♡'
                : nextUp
                  ? `next up: ${nextUp.title} · ${dueLabelForStudyDay(nextUp, today)}`
                  : 'nothing pressing — breathe easy'}
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}

      {(todayTargets.length > 0 || rolloverOffer) && (
        <section className="prog-card day-plan-card" aria-labelledby="today-plan-heading">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="prog-count" id="today-plan-heading">Today</h2>
            {rolloverOffer && (
              <RolloverTriageCard
                offer={rolloverOffer}
                onCarry={() => {
                  actions.resolveRollover(rolloverOffer.target.id, 'carry');
                  setRolloverOffer(null);
                }}
                onSpread={spreadOffer}
                onRest={() => {
                  actions.resolveRollover(rolloverOffer.target.id, 'rest');
                  setRolloverOffer(null);
                }}
              />
            )}
            <div className="day-plan-list">
              {todayTargets.map((item) => {
                const actual = targetActual(item, state.goalLedger, taskActual);
                const pct = Math.round((actual / item.plannedAmount) * 100);
                return (
                  <div className="day-plan-row" key={item.id}>
                    <div className="day-plan-copy">
                      <strong>{item.snapshot.title}</strong>
                      <span>{actual} of {item.plannedAmount} {item.snapshot.unit}</span>
                    </div>
                    <div
                      className="goal-track"
                      role="progressbar"
                      aria-label={`${item.snapshot.title}: ${actual} of ${item.plannedAmount} ${item.snapshot.unit}`}
                      aria-valuemin={0}
                      aria-valuenow={actual}
                      aria-valuemax={item.plannedAmount}
                    >
                      <div className="goal-fill active" style={{ width: `${pct}%` }} />
                    </div>
                    <label className="day-plan-edit">
                      <span className="sr-only">Planned {item.snapshot.unit} for {item.snapshot.title}</span>
                      <input
                        type="number"
                        min={Math.max(1, actual)}
                        max={99}
                        value={targetDrafts[item.id] ?? String(item.plannedAmount)}
                        aria-invalid={Boolean(targetErrors[item.id])}
                        aria-describedby={`day-target-error-${item.id}`}
                        onChange={(event) =>
                          setTargetDrafts((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="goal-go"
                      onClick={() => saveTargetAmount(item, actual)}
                    >
                      save
                    </button>
                    <button
                      type="button"
                      className="task-del"
                      aria-label={`Remove today's target for ${item.snapshot.title}`}
                      onClick={() => removeTarget(item.id, item.snapshot.title)}
                    >
                      &times;
                    </button>
                    {targetErrors[item.id] && (
                      <span
                        className="field-error day-plan-row-error"
                        id={`day-target-error-${item.id}`}
                        role="alert"
                      >
                        {targetErrors[item.id]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="task-list">
        {goals.map((goal) => {
          const pace = goalPaceForStudyDay(goal, today, now);
          const outlook = observedLanding(
            state.goalLedger,
            goal,
            now,
            state.settings.dayStartHour,
          );
          const effortLine = sessionEffortLine(
            parseInt(planAmount, 10),
            goalUnit(goal),
            medianSessionCredit(state.goalLedger, goal.id, now),
          );
          const gpct = Math.round((Math.min(goal.done, goal.target) / goal.target) * 100);
          const deadlineOutcome = goalDeadlineOutcomeLine(
            goal,
            state.settings.dayStartHour,
          );
          const outlookNeedsChoice = Boolean(
            outlook && outlook.projectedDayKey > goal.due,
          );
          const shrinkTarget = outlook
            ? Math.max(
                goal.done + 1,
                Math.min(
                  goal.target,
                  goal.done +
                    Math.floor(
                      outlook.amountPerActiveDay *
                        Math.max(1, daysLeftForStudyDay(goal.due, today)),
                    ),
                ),
              )
            : goal.target;
          if (editId === goal.id) {
            return (
              <div className="goal-card" key={goal.id}>
                <form
                  className="add-form goal-add goal-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit(goal);
                  }}
                >
                  <label className="form-field goal-name-field">
                    <span>Goal name</span>
                    <input
                      className="add-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={60}
                    />
                  </label>
                  <label className="form-field">
                    <span>Due date</span>
                    <input
                      className="goal-date"
                      type="date"
                      value={editDue}
                      onChange={(e) => setEditDue(e.target.value)}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Counted in</span>
                    <input
                      className="goal-parts"
                      value={editUnit}
                      maxLength={GOAL_UNIT_MAX}
                      placeholder="parts"
                      onChange={(e) => setEditUnit(e.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Amount</span>
                    <input
                      className="goal-parts"
                      type="number"
                      value={editTarget}
                      min={1}
                      max={GOAL_TARGET_MAX}
                      onChange={(e) => setEditTarget(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="goal-go"
                    disabled={!editTitle.trim() || !editDue}
                  >
                    save
                  </button>
                  <button
                    type="button"
                    className="goal-go goal-cancel"
                    onClick={() => setEditId(null)}
                  >
                    keep as is
                  </button>
                </form>
              </div>
            );
          }
          return (
            <div className="goal-card" key={goal.id}>
              <div className="goal-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="goal-title">{goal.title}</h2>
                  <div className="goal-when">due {shortDate(goal.due)}</div>
                </div>
                <span className={`goal-chip ${pace.status}`}>
                  {dueLabelForStudyDay(goal, today)}
                </span>
                <button
                  className="task-del goal-edit-btn"
                  onClick={() => beginEdit(goal)}
                  aria-label={`Edit ${goal.title}`}
                  title="edit name, date, or parts"
                >
                  ✎
                </button>
                <button
                  className="task-del"
                  onClick={() => removeGoal(goal)}
                  aria-label={`Delete ${goal.title}`}
                >
                  &times;
                </button>
              </div>

              <div className="goal-mid">
                <div className="goal-track">
                  <div className={`goal-fill ${pace.status}`} style={{ width: `${gpct}%` }} />
                </div>
                <span className="goal-count">
                  {goalProgressText(goal)}
                </span>
                <div className="goal-log">
                  <button
                    className="step-btn"
                    onClick={() => actions.logGoal(goal.id, -1)}
                    disabled={goal.done <= 0}
                    aria-label={`Un-log one part of ${goal.title}`}
                  >
                    &minus;
                  </button>
                  <button
                    className="step-btn"
                    onClick={() => actions.logGoal(goal.id, 1)}
                    disabled={goal.done >= goal.target}
                    aria-label={`Log one finished part of ${goal.title}`}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className={`goal-pace ${outlook ? 'observed' : pace.status}`}>
                {outlook
                  ? observedLandingLine(outlook, goal)
                  : pace.status === 'done'
                  ? deadlineOutcome
                  : pace.status === 'overdue'
                    ? `the date passed — the ${goal.done} ${goalUnit(goal)} you recorded still count. Keep going or edit the goal whenever you like.`
                    : (pace.suggestion ??
                      `${pace.remaining} ${goalUnit(goal)} left · ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} — do what you can, it all counts`)}
              </div>
              {outlookNeedsChoice && (
                <div
                  className="goal-outlook-actions"
                  role="group"
                  aria-label={`Adjust ${goal.title} from its recorded pace`}
                >
                  {shrinkTarget < goal.target && (
                    <button
                      type="button"
                      className="goal-go"
                      onClick={() => beginEdit(goal, { target: shrinkTarget })}
                    >
                      shrink amount
                    </button>
                  )}
                  <button
                    type="button"
                    className="goal-go"
                    onClick={() =>
                      beginEdit(goal, { due: outlook?.projectedDayKey ?? goal.due })
                    }
                  >
                    move date
                  </button>
                </div>
              )}
              {planningGoalId === goal.id ? (
                <form
                  ref={planFormRef}
                  className="day-plan-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    confirmPlan(goal);
                  }}
                >
                  <label>
                    <span>Plan</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.min(99, Math.max(1, pace.remaining))}
                      value={planAmount}
                      aria-invalid={Boolean(planError)}
                      aria-describedby={`day-plan-error-${goal.id}`}
                      onChange={(event) => {
                        setPlanAmount(event.target.value);
                        setPlanError('');
                      }}
                      aria-label={`Planned ${goalUnit(goal)} for ${goal.title}`}
                    />
                  </label>
                  <label>
                    <span>For</span>
                    <input
                      type="date"
                      min={today}
                      max={goal.due}
                      value={planDate}
                      aria-label={`Day for ${goal.title}`}
                      onChange={(event) => {
                        setPlanDate(event.target.value);
                        setPlanError('');
                      }}
                    />
                  </label>
                  <button type="submit" className="goal-go">confirm</button>
                  <button
                    type="button"
                    className="goal-go goal-cancel"
                    onClick={() => {
                      setPlanningGoalId(null);
                      setPlanError('');
                    }}
                  >
                    cancel
                  </button>
                  {planError && (
                    <div
                      className="field-error day-plan-form-error"
                      id={`day-plan-error-${goal.id}`}
                      role="alert"
                    >
                      {planError}
                    </div>
                  )}
                  {effortLine && (
                    <div className="day-plan-effort">{effortLine}</div>
                  )}
                </form>
              ) : (
                pace.status === 'active' &&
                !dayPlanTargets.some(
                  (item) =>
                    isGoalDailyTarget(item) &&
                    item.dayKey === today &&
                    item.goalId === goal.id,
                ) && (
                  <button type="button" className="goal-go day-plan-open" onClick={() => beginPlan(goal)}>
                    plan today
                  </button>
                )
              )}
            </div>
          );
        })}
        {goals.length === 0 && (
          <div className="task-empty">
            put anything you're working toward in — an exam, a project, a book to read, a habit
            to build — how many parts it has, and when you'd like it done. log parts as you
            finish them, and Bloom can mirror the calendar pace or, after enough entries,
            your recorded pace ♡
          </div>
        )}
      </div>

      {deletedGoal && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>“{deletedGoal.goal.title}” removed</span>
          <button type="button" onClick={undoGoalDelete}>undo</button>
        </div>
      )}
      {editedGoalUndo && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>Goal updated</span>
          <button type="button" onClick={undoGoalEdit}>undo</button>
        </div>
      )}

      <div className="add-row">
        <h2 className="add-form-title">Add a goal</h2>
        <form className="add-form goal-add" onSubmit={submit} noValidate>
          <span className="add-plus">+</span>
          <label className="form-field goal-name-field">
            <span>Goal name</span>
            <input
              className="add-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setAddTouched((current) => ({ ...current, title: true }))}
              placeholder="exam, project, 12 books…"
              maxLength={60}
              aria-invalid={addTouched.title && !title.trim()}
              aria-describedby="goal-name-error"
            />
            <span className="field-error" id="goal-name-error" role="alert">
              {addTouched.title && !title.trim() ? 'Add a goal name.' : ''}
            </span>
          </label>
          <label className="form-field">
            <span>Due date</span>
            <input
              className="goal-date"
              type="date"
              value={due}
              min={today}
              onChange={(e) => setDue(e.target.value)}
              onBlur={() => setAddTouched((current) => ({ ...current, due: true }))}
              aria-invalid={addTouched.due && !due}
              aria-describedby="goal-date-error"
              required
            />
            <span className="field-error" id="goal-date-error" role="alert">
              {addTouched.due && !due ? 'Choose a due date.' : ''}
            </span>
          </label>
          <label className="form-field">
            <span>Counted in…</span>
            <input
              className="goal-parts"
              value={unit}
              maxLength={GOAL_UNIT_MAX}
              placeholder="parts"
              onChange={(e) => setUnit(e.target.value)}
              aria-describedby="goal-unit-hint"
            />
          </label>
          <label className="form-field">
            <span>Amount</span>
            <input
              className="goal-parts"
              type="number"
              value={target}
              min={1}
              max={GOAL_TARGET_MAX}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <button type="submit" className="goal-go" disabled={!title.trim() || !due}>
            add
          </button>
        </form>
        <div className="goal-hint" id="goal-unit-hint">
          choose a counting word that reads well with any number
        </div>
      </div>
      {confirmation?.kind === 'shrink' && (
        <Dialog
          title="Keep this smaller goal?"
          description={`You’ve logged ${confirmation.goal.done} parts already. Setting ${confirmation.target} parts will mark “${confirmation.goal.title}” done.`}
          onRequestClose={() => setConfirmation(null)}
        >
          <div className="dialog-actions">
            <button
              type="button"
              className="dialog-primary"
              onClick={() => commitEdit(confirmation.goal, confirmation.target)}
            >
              keep the change
            </button>
            <button type="button" className="dialog-keep" onClick={() => setConfirmation(null)}>
              keep editing
            </button>
          </div>
        </Dialog>
      )}
      {confirmation?.kind === 'remove' && (
        <Dialog
          title={`Remove “${confirmation.goal.title}”?`}
          description={`${confirmation.goal.done} of ${confirmation.goal.target} parts are logged. You can undo for a moment after removing it.`}
          onRequestClose={() => setConfirmation(null)}
        >
          <div className="dialog-actions">
            <button
              type="button"
              className="dialog-danger"
              onClick={() => commitRemoveGoal(confirmation.goal)}
            >
              remove goal
            </button>
            <button type="button" className="dialog-keep" onClick={() => setConfirmation(null)}>
              keep it
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
