import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import { timerTransitionPolicy, type Task, type useBloom } from '../store/useBloom';
import {
  computeAttentionPlan,
  computeInsights,
  KIND_NAMES,
  loadEvents,
  RECIPE_MIN_SIGNALS,
} from '../store/companion';
import type { EvidenceKey } from '../insights/why';
import {
  personalCadenceForSurface,
  shouldRecomputePersonalCadence,
  type CadencePair,
} from '../insights/cadence';
import { completionRateByStartHour } from '../store/sessionStats';
import type { GuideArticleId } from '../content/guide';
import { guideArticleForEvidenceKey } from '../insights/surfacing';
import { FoundationsCard } from '../components/FoundationsCard';
import { currentSurface, wordsFor } from '../content/platformWords';
import {
  isTaskDailyTarget,
  parseDailyTargetAmount,
  targetActual,
  type TaskDailyTarget,
} from '../store/dailyTarget';
import { dayKeyFor } from '../store/dayKey';
import { sessionCountsTowardDay } from '../store/sessions';
import { daysBetween } from '../store/streak';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DeletedTask {
  task: Task;
  index: number;
  wasActive: boolean;
}

export function TasksScreen({
  bloom,
  onOpenGuideArticle,
}: {
  bloom: ReturnType<typeof useBloom>;
  onOpenGuideArticle: (id: GuideArticleId) => void;
}) {
  const { state, now, palSprite, activeTask, actions } = bloom;
  const [draft, setDraft] = useState('');
  const [goal, setGoal] = useState(1);
  const [linkGoalId, setLinkGoalId] = useState('');
  const [addedNotice, setAddedNotice] = useState(0);
  const [deletedTask, setDeletedTask] = useState<DeletedTask | null>(null);
  const [draftTouched, setDraftTouched] = useState(false);
  const [planningTaskId, setPlanningTaskId] = useState<number | null>(null);
  const [taskPlanAmount, setTaskPlanAmount] = useState('1');
  const [taskPlanError, setTaskPlanError] = useState('');
  const [taskPlanStatus, setTaskPlanStatus] = useState('');
  const taskNameRef = useRef<HTMLInputElement>(null);

  // Optional task→goal link (a first slice of PLAN 8.12): only offered while
  // the planner is on and a goal still has parts to go. Purely a label — the
  // goal never moves on its own.
  const openGoals = state.settings.planner
    ? state.goals.filter((g) => g.done < g.target)
    : [];

  useEffect(() => {
    if (!addedNotice) return;
    const timeout = window.setTimeout(() => setAddedNotice(0), 2200);
    return () => window.clearTimeout(timeout);
  }, [addedNotice]);

  useEffect(() => {
    if (!deletedTask) return;
    const timeout = window.setTimeout(() => setDeletedTask(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [deletedTask]);

  const doneCount = state.tasks.filter((t) => t.done).length;
  const total = state.tasks.length;
  const progPct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;
  const todayTaskTarget = (state.dayPlan?.targets ?? []).find(
    (target) => target.dayKey === state.today && isTaskDailyTarget(target),
  );
  const taskActual = (target: TaskDailyTarget) =>
    state.sessionRecords.filter(
      (record) =>
        record.taskId === target.taskId &&
        sessionCountsTowardDay(record) &&
        dayKeyFor(record.endedAt, state.settings.dayStartHour) === target.dayKey,
    ).length;
  const yesterdayTaskTarget = (state.dayPlan?.targets ?? []).find(
    (target) =>
      isTaskDailyTarget(target) && daysBetween(target.dayKey, state.today) === 1,
  );

  // The heading follows the store-resolved study day, so a chosen late
  // rollover cannot disagree with streaks, goals, or History grouping.
  const studyDate = new Date(`${state.today}T12:00:00`);
  const dateLabel = `${WEEKDAYS[studyDate.getDay()]} · ${MONTHS[studyDate.getMonth()]} ${studyDate.getDate()}`;

  // Focus Patterns: only rendered while Companion Mode is on. The data stays
  // put when the mode is off — just hidden. The log is capped and local, so
  // reload it on render; answering a check-in while this screen stays mounted
  // must refresh the visible pattern rather than leave a stale snapshot.
  const companionOn = state.settings.companion.on;
  const localEvents = loadEvents();
  const [patternsWindow, setPatternsWindow] = useState<'today' | 'week'>('week');
  // PLAN 13.15: a leave-and-return is a tab switch in a browser and leaving the
  // app on a phone; the insight and its suggestion say whichever is true here.
  const surface = currentSurface();
  const awayWords = wordsFor(surface);
  const insights = useMemo(
    () => {
      // `now` is the store-owned refresh signal; the rolling window captures
      // the actual instant when this memo recomputes.
      void now;
      return companionOn
        ? computeInsights(localEvents, Date.now(), patternsWindow === 'today' ? 1 : 7)
        : null;
    },
    [companionOn, localEvents, now, patternsWindow],
  );
  const phaseWord = { early: 'early on', mid: 'mid-session', late: 'in the late stretch' } as const;

  // Attention recipe: the personal what-to-try layer, built from a wider
  // window (4 weeks) so it shifts slowly and never scolds about one rough day.
  const focusLenMins = Math.max(1, Math.round(state.settings.durations.focus / 60));
  const completionByStartHour = useMemo(
    () => completionRateByStartHour(state.sessionRecords),
    [state.sessionRecords],
  );
  const recipe = useMemo(
    () => {
      // Same clock role as the insight window above.
      void now;
      return companionOn
        ? computeAttentionPlan(
            localEvents,
            focusLenMins,
            Date.now(),
            28,
            {
              chronotype: state.settings.chronotype,
              completionByStartHour,
            },
            surface,
          )
        : [];
    },
    [
      companionOn,
      completionByStartHour,
      focusLenMins,
      localEvents,
      now,
      state.settings.chronotype,
      surface,
    ],
  );
  const currentCadence = useMemo(
    () => ({
      focusMin: Math.round(state.settings.durations.focus / 60),
      breakMin: Math.round(state.settings.durations.short / 60),
    }),
    [state.settings.durations.focus, state.settings.durations.short],
  );
  const cadenceDecision = useMemo(
    () => {
      // `now` is the store-owned refresh signal; staleness and recommendation
      // share the actual instant when this memo recomputes.
      void now;
      const computedAt = Date.now();
      return {
        cadence: personalCadenceForSurface(
          state.personalCadence,
          state.sessionRecords,
          localEvents,
          state.settings.chronotype,
          currentCadence,
          computedAt,
        ),
        needsRefresh: shouldRecomputePersonalCadence(state.personalCadence, computedAt),
      };
    },
    [currentCadence, localEvents, now, state.personalCadence, state.sessionRecords, state.settings.chronotype],
  );
  const { cadence, needsRefresh: cadenceNeedsRefresh } = cadenceDecision;
  useEffect(() => {
    if (companionOn && cadenceNeedsRefresh) actions.cachePersonalCadence(cadence);
  }, [actions, cadence, cadenceNeedsRefresh, companionOn]);
  const workSessionRunning =
    state.running &&
    (state.mode === 'focus' || state.mode === 'tiny' || state.mode === 'flow');

  function openEvidence(key: EvidenceKey) {
    if (!workSessionRunning) onOpenGuideArticle(guideArticleForEvidenceKey(key));
  }

  function cadenceIsSet(preset: CadencePair): boolean {
    return (
      state.settings.durations.focus === preset.focusMin * 60 &&
      state.settings.durations.short === preset.breakMin * 60
    );
  }

  function applyCadence(preset: CadencePair) {
    actions.applyCadence(preset);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) {
      setDraftTouched(true);
      return;
    }
    // Keep the goal link selected so a batch of tasks files in quickly.
    actions.addTask(draft, goal, linkGoalId ? Number(linkGoalId) : undefined);
    setDraft('');
    setGoal(1);
    setDraftTouched(false);
    setAddedNotice((notice) => notice + 1);
  }

  function removeTask(task: Task, index: number) {
    setDeletedTask({ task: { ...task }, index, wasActive: state.activeTaskId === task.id });
    actions.removeTask(task.id);
  }

  function undoTaskDelete() {
    if (!deletedTask) return;
    actions.restoreTask(deletedTask.task, deletedTask.index, deletedTask.wasActive);
    setDeletedTask(null);
  }

  function beginTaskPlan(task: Task) {
    setPlanningTaskId(task.id);
    setTaskPlanAmount(String(Math.max(1, task.goal - task.pomos)));
    setTaskPlanError('');
  }

  function confirmTaskPlan(task: Task) {
    const plannedAmount = parseDailyTargetAmount(taskPlanAmount);
    if (plannedAmount == null) {
      setTaskPlanError('Choose a whole number from 1 to 99.');
      return;
    }
    if (todayTaskTarget) {
      setTaskPlanError('Today already has a task target. Keep it or remove it first.');
      return;
    }
    actions.addTaskDailyTarget(task.id, plannedAmount, now);
    setPlanningTaskId(null);
    setTaskPlanError('');
    setTaskPlanStatus(`Today’s target for ${task.t} is ${plannedAmount} sessions.`);
  }

  return (
    <main className="screen tasks-bg" id="tasks-screen" aria-labelledby="tasks-heading">
      <div className="head">
        <h1 className="head-title" id="tasks-heading">Tasks</h1>
        <div className="head-sub">ongoing list · {dateLabel}</div>
      </div>

      {taskPlanStatus && (
        <p className="day-plan-status" role="status" aria-live="polite">
          {taskPlanStatus}
        </p>
      )}
      {state.settings.planner && yesterdayTaskTarget && (
        <p className="day-plan-status task-day-plan-prior" role="status">
          Yesterday: {targetActual(yesterdayTaskTarget, state.goalLedger, taskActual)} of{' '}
          {yesterdayTaskTarget.plannedAmount} {yesterdayTaskTarget.snapshot.unit} for{' '}
          {yesterdayTaskTarget.snapshot.title} — that’s real progress.
        </p>
      )}

      {state.settings.foundations && (
        <FoundationsCard
          foundations={state.foundations}
          records={state.sessionRecords}
          today={state.today}
          dayStartHour={state.settings.dayStartHour}
          onToggleDay={actions.toggleFoundationDay}
          onSetEnabled={actions.setFoundationEnabled}
          onReorder={actions.reorderFoundation}
          onRenameCustom={actions.renameCustomFoundation}
          plans={state.ifThenPlans}
          onCreatePlan={actions.addIfThenPlan}
          onRemovePlan={actions.removeIfThenPlan}
          onSetIfThen={actions.setFoundationIfThen}
          onMarkRestartOffered={actions.markFoundationRestartOffered}
        />
      )}

      {total > 0 && (
        <div className="prog-card">
          <div className="prog-tile">
            <PixelPal sprite={palSprite} mode={allDone ? 'celebrate' : 'idle'} scale={3} size={58} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="prog-count">{doneCount} of {total} done!</div>
            <div className="prog-sub">
              {allDone ? 'everything on the list bloomed' : "keep it up, you're blooming"}
            </div>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${progPct}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="task-list">
        {state.tasks.map((task, index) => {
          const isActive = activeTask?.id === task.id;
          const linkedGoal = task.goalId == null
            ? undefined
            : state.goals.find((item) => item.id === task.goalId);
          return (
            <div className={`task-row${isActive ? ' active' : ''}`} key={task.id}>
              <div
                className={`checkbox${task.done ? ' done' : ''}`}
                onClick={() => actions.toggleTask(task.id)}
                role="checkbox"
                aria-checked={task.done}
                aria-label={`${task.done ? 'Mark incomplete' : 'Mark complete'}: ${task.t}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    actions.toggleTask(task.id);
                  }
                }}
              >
                {task.done ? '✓' : ''}
              </div>
              <button
                type="button"
                className="task-select"
                onClick={() => {
                  if (timerTransitionPolicy(state, 'activeTask').kind === 'allow') {
                    actions.setActiveTask(task.id);
                  }
                }}
                disabled={task.done}
                aria-pressed={isActive}
                aria-label={`${isActive ? 'Selected task' : 'Select task'}: ${task.t}`}
                title={task.done ? undefined : 'focus on this task'}
              >
                <div className={`task-text${task.done ? ' done' : ''}`}>
                  {task.t}
                  {isActive && <span className="focus-flag">focusing</span>}
                </div>
                <div className="cherries">
                  {Array.from({ length: task.goal }, (_, i) => (
                    <span key={i} className={`cherry ${i < task.pomos ? 'on' : 'off'}`} />
                  ))}
                </div>
              </button>
              {state.settings.planner && state.goals.length > 0 && (
                <div className="task-goal-tools">
                  <label>
                    <span className="sr-only">Goal for {task.t}</span>
                    <select
                      className="goal-link"
                      value={task.goalId ?? ''}
                      disabled={task.done}
                      onChange={(event) =>
                        actions.setTaskGoal(
                          task.id,
                          event.target.value ? Number(event.target.value) : undefined,
                        )
                      }
                      aria-label={`Goal for ${task.t}`}
                    >
                      <option value="">no goal</option>
                      {state.goals.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {task.goalCredit === 'pending' && linkedGoal && (
                    <div
                      className="task-goal-credit"
                      role="group"
                      aria-label={`Add one part to ${linkedGoal.title}?`}
                    >
                      <span>add 1 part to {linkedGoal.title}?</span>
                      <button
                        type="button"
                        onClick={() => actions.resolveGoalCredit('task', task.id, true)}
                      >
                        add
                      </button>
                      <button
                        type="button"
                        onClick={() => actions.resolveGoalCredit('task', task.id, false)}
                      >
                        not this time
                      </button>
                    </div>
                  )}
                  {task.goalCredit === 'credited' && linkedGoal && (
                    <span className="task-credit-note" role="status">
                      1 part added to {linkedGoal.title}
                    </span>
                  )}
                </div>
              )}
              {state.settings.planner && !task.done && (
                <div className="task-day-plan-tools">
                  {todayTaskTarget?.taskId === task.id && (
                    <span className="task-day-plan-progress" role="status">
                      today {targetActual(todayTaskTarget, state.goalLedger, taskActual)}/
                      {todayTaskTarget.plannedAmount} sessions
                    </span>
                  )}
                  {!todayTaskTarget && planningTaskId !== task.id && (
                    <button
                      type="button"
                      className="task-day-plan-open"
                      onClick={() => beginTaskPlan(task)}
                    >
                      plan {task.t} today
                    </button>
                  )}
                  {planningTaskId === task.id && (
                    <form
                      className="task-day-plan-form"
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault();
                        confirmTaskPlan(task);
                      }}
                    >
                      <label>
                        <span>Sessions today</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={taskPlanAmount}
                          aria-label={`Sessions today for ${task.t}`}
                          aria-invalid={Boolean(taskPlanError)}
                          aria-describedby={`task-day-plan-error-${task.id}`}
                          onChange={(event) => {
                            setTaskPlanAmount(event.target.value);
                            setTaskPlanError('');
                          }}
                        />
                      </label>
                      <button type="submit">confirm</button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanningTaskId(null);
                          setTaskPlanError('');
                        }}
                      >
                        cancel
                      </button>
                      {taskPlanError && (
                        <span
                          className="field-error"
                          id={`task-day-plan-error-${task.id}`}
                          role="alert"
                        >
                          {taskPlanError}
                        </span>
                      )}
                    </form>
                  )}
                </div>
              )}
              <button className="task-del" onClick={() => removeTask(task, index)} aria-label={`Delete ${task.t}`}>
                &times;
              </button>
            </div>
          );
        })}
        {total === 0 && (
          <section className="task-empty" aria-labelledby="task-empty-heading">
            <h2 id="task-empty-heading">your list starts here</h2>
            <p>name one small thing in the form below.</p>
          </section>
        )}

        {insights && (
          <div className="patterns-card">
            <div className="patterns-head">
              <div>
                <h2 className="patterns-title">focus patterns</h2>
                <div className="patterns-sub">
                  {patternsWindow === 'today' ? 'last 24 hours' : 'last 7 days'} · lives only on this device
                </div>
              </div>
              <div className="patterns-toggle">
                {(['today', 'week'] as const).map((w) => (
                  <button
                    key={w}
                    className={`patterns-chip${patternsWindow === w ? ' on' : ''}`}
                    onClick={() => setPatternsWindow(w)}
                    aria-pressed={patternsWindow === w}
                  >
                    {w === 'today' ? '24 h' : '7 days'}
                  </button>
                ))}
              </div>
            </div>
            {insights.answers + insights.aways < 3 ? (
              <div className="patterns-line">
                not much to see yet — patterns will bloom as you focus ♡
              </div>
            ) : (
              <>
                <div className="patterns-line">
                  {insights.drifts === 0
                    ? `${insights.answers} focused check-in${insights.answers === 1 ? '' : 's'}, noted`
                    : `${insights.drifts} drift${insights.drifts === 1 ? '' : 's'} across ${insights.answers} check-ins`}
                  {insights.aways > 0 && ` · ${awayWords.awayCount(insights.aways)}`}
                </div>
                {insights.dominant && (
                  <div className="patterns-line">mostly {KIND_NAMES[insights.dominant]}</div>
                )}
                {insights.phase && (
                  <div className="patterns-line">drifting clusters {phaseWord[insights.phase]}</div>
                )}
                {insights.bestTime && (
                  <div className="patterns-line">you're sharpest in the {insights.bestTime}</div>
                )}
                {insights.tip && <div className="patterns-tip">{insights.tip}</div>}
                {insights.gentleNote && patternsWindow === 'week' && (
                  <div className="patterns-note">
                    everyone's attention works differently. if focus struggles weigh on your daily
                    life, a professional can help you understand it better ♡
                  </div>
                )}
              </>
            )}
          </div>
        )}
  
        {companionOn && (
          <div className="patterns-card recipe-card">
            <h2 className="patterns-title">{state.settings.name}'s attention recipe</h2>
            <div className="patterns-sub">made from your own last weeks — no two recipes alike</div>
            <div className="recipe-item cadence-recipe" data-evidence={cadence.evidenceKey}>
              <span className="recipe-emoji" aria-hidden="true">⏱️</span>
              <span className="recipe-text">
                {cadence.text}
                <span className="recipe-because">
                  {cadence.because}{' '}
                  {!workSessionRunning && (
                    <button
                      className="recipe-why"
                      onClick={() => openEvidence(cadence.evidenceKey)}
                      aria-label="Read why this cadence suggestion fits"
                    >
                      why?
                    </button>
                  )}
                </span>
                <span className="cadence-ladder" role="list" aria-label="Personal cadence ladder">
                  {(['shorter', 'current', 'longer'] as const).map((slot) => {
                    const rung = cadence.rungs[slot];
                    const direction = slot === 'shorter'
                      ? 'Shorter option'
                      : slot === 'longer'
                        ? 'Longer option'
                        : 'Current cadence';
                    return (
                      <span
                        key={slot}
                        role="listitem"
                        aria-current={slot === 'current' ? 'true' : undefined}
                        aria-label={`${direction}: ${rung.focusMin} minutes focus, ${rung.breakMin} minutes break`}
                      >
                        {rung.focusMin}/{rung.breakMin}
                      </span>
                    );
                  })}
                </span>
                <button
                  className="cadence-apply"
                  onClick={() => applyCadence(cadence.preset)}
                  disabled={cadenceIsSet(cadence.preset)}
                  aria-label={cadenceIsSet(cadence.preset)
                    ? `Recommended cadence is already set: ${cadence.preset.focusMin} minutes focus, ${cadence.preset.breakMin} minutes break`
                    : `Apply recommended cadence: ${cadence.preset.focusMin} minutes focus, ${cadence.preset.breakMin} minutes break`}
                >
                  {cadenceIsSet(cadence.preset)
                    ? `${cadence.preset.focusMin}/${cadence.preset.breakMin} is set ♡`
                    : `try ${cadence.preset.focusMin}/${cadence.preset.breakMin}`}
                </button>
                {state.personalCadence.history.length > 0 && (
                  <button
                    className="cadence-apply cadence-back"
                    onClick={() => applyCadence(
                      state.personalCadence.history[state.personalCadence.history.length - 1],
                    )}
                    aria-label={`Revert to previous cadence: ${state.personalCadence.history[state.personalCadence.history.length - 1].focusMin} minutes focus, ${state.personalCadence.history[state.personalCadence.history.length - 1].breakMin} minutes break`}
                  >
                    back to {state.personalCadence.history[state.personalCadence.history.length - 1].focusMin}/
                    {state.personalCadence.history[state.personalCadence.history.length - 1].breakMin}
                  </button>
                )}
              </span>
            </div>
            {recipe.length === 0 ? (
              <div className="patterns-line">
                the rest of your recipe is still sprouting — answer a few check-ins ({RECIPE_MIN_SIGNALS}
                + moments) and more personal ideas appear here ♡
              </div>
            ) : (
              recipe.map((item, i) => (
                <div className="recipe-item" key={i} data-evidence={item.evidenceKey}>
                  <span className="recipe-emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="recipe-text">
                    {item.text}
                    <span className="recipe-because">
                      {item.because}{' '}
                      {!workSessionRunning && (
                        <button
                          className="recipe-why"
                          onClick={() => openEvidence(item.evidenceKey)}
                          aria-label="Read why this suggestion fits"
                        >
                          why?
                        </button>
                      )}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {deletedTask && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>“{deletedTask.task.t}” removed</span>
          <button type="button" onClick={undoTaskDelete}>undo</button>
        </div>
      )}

      <div className="add-row">
        <h2 className="add-form-title">Add a task</h2>
        <form className="add-form" onSubmit={submit}>
          <button
            type="submit"
            className="add-plus"
            disabled={!draft.trim()}
            aria-label="Add task"
          >
            +
          </button>
          <label className="compact-field-label" htmlFor="new-task-name">task name</label>
          <input
            id="new-task-name"
            ref={taskNameRef}
            className="add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraftTouched(true)}
            placeholder="add something sweet"
            maxLength={60}
            aria-label="Task name"
            aria-invalid={draftTouched && !draft.trim()}
            aria-describedby="new-task-error"
          />
          <span className="compact-field-label" aria-hidden="true">focus sessions</span>
          <button
            type="button"
            className="goal-btn"
            onClick={() => setGoal((g) => (g % 4) + 1)}
            title="pomodoros needed"
            aria-label={`Goal: ${goal} focus ${goal === 1 ? 'session' : 'sessions'}`}
          >
            {goal}
            <span className="goal-cherry" />
          </button>
          {openGoals.length > 0 && (
            <label className="compact-form-field">
              <span>goal (optional)</span>
              <select
                className="goal-link"
                value={linkGoalId}
                onChange={(e) => setLinkGoalId(e.target.value)}
              >
                <option value="">no goal</option>
                {openGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form>
        <div className="form-error" id="new-task-error" role="alert">
          {draftTouched && !draft.trim() ? 'Add a task name to continue.' : ''}
        </div>
        <div className="task-add-note" role="status" aria-live="polite">
          {addedNotice ? 'added to your list ♡' : ''}
        </div>
      </div>
    </main>
  );
}
