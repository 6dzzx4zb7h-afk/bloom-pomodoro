import { useEffect, useMemo, useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import type { Task, useBloom } from '../store/useBloom';
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

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DeletedTask {
  task: Task;
  index: number;
  wasActive: boolean;
}

export function TasksScreen({
  bloom,
  now,
  onOpenGuideArticle,
}: {
  bloom: ReturnType<typeof useBloom>;
  now: number;
  onOpenGuideArticle: (id: GuideArticleId) => void;
}) {
  const { state, palSprite, activeTask, actions } = bloom;
  const [draft, setDraft] = useState('');
  const [goal, setGoal] = useState(1);
  const [linkGoalId, setLinkGoalId] = useState('');
  const [addedNotice, setAddedNotice] = useState(0);
  const [deletedTask, setDeletedTask] = useState<DeletedTask | null>(null);

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

  const localDate = new Date(now);
  const dateLabel = `${WEEKDAYS[localDate.getDay()]} · ${MONTHS[localDate.getMonth()]} ${localDate.getDate()}`;

  // Focus Patterns: only rendered while Companion Mode is on. The data stays
  // put when the mode is off — just hidden. The log is capped and local, so
  // reload it on render; answering a check-in while this screen stays mounted
  // must refresh the visible pattern rather than leave a stale snapshot.
  const companionOn = state.settings.companion.on;
  const localEvents = loadEvents();
  const [patternsWindow, setPatternsWindow] = useState<'today' | 'week'>('week');
  const insights = useMemo(
    () =>
      companionOn ? computeInsights(localEvents, now, patternsWindow === 'today' ? 1 : 7) : null,
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
    () =>
      companionOn
        ? computeAttentionPlan(localEvents, focusLenMins, now, 28, {
            chronotype: state.settings.chronotype,
            completionByStartHour,
          })
        : [],
    [companionOn, completionByStartHour, focusLenMins, localEvents, now, state.settings.chronotype],
  );
  const currentCadence = useMemo(
    () => ({
      focusMin: Math.round(state.settings.durations.focus / 60),
      breakMin: Math.round(state.settings.durations.short / 60),
    }),
    [state.settings.durations.focus, state.settings.durations.short],
  );
  const cadence = useMemo(
    () => personalCadenceForSurface(
      state.personalCadence,
      state.sessionRecords,
      localEvents,
      state.settings.chronotype,
      currentCadence,
    ),
    [currentCadence, localEvents, state.personalCadence, state.sessionRecords, state.settings.chronotype],
  );
  const cadenceNeedsRefresh = shouldRecomputePersonalCadence(state.personalCadence, now);
  useEffect(() => {
    if (companionOn && cadenceNeedsRefresh) actions.cachePersonalCadence(cadence, now);
  }, [actions, cadence, cadenceNeedsRefresh, companionOn, now]);
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
    if (!draft.trim()) return;
    // Keep the goal link selected so a batch of tasks files in quickly.
    actions.addTask(draft, goal, linkGoalId ? Number(linkGoalId) : undefined);
    setDraft('');
    setGoal(1);
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

  return (
    <div className="screen tasks-bg">
      <div className="head">
        <div className="head-title">Tasks</div>
        <div className="head-sub">ongoing list · {dateLabel}</div>
      </div>

      <div className="prog-card">
        <div className="prog-tile">
          <PixelPal sprite={palSprite} mode={allDone ? 'celebrate' : 'idle'} scale={3} size={58} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="prog-count">
            {total === 0 ? 'ready when you are' : `${doneCount} of ${total} done!`}
          </div>
          <div className="prog-sub">
            {total === 0
              ? 'one small task is enough to begin'
              : allDone
                ? 'everything on the list bloomed'
                : "keep it up, you're blooming"}
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: `${progPct}%` }} />
          </div>
        </div>
      </div>

      <div className="task-list">
        {state.tasks.map((task, index) => {
          const isActive = activeTask?.id === task.id;
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
                onClick={() => actions.setActiveTask(task.id)}
                disabled={task.done}
                aria-pressed={isActive}
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
              <button className="task-del" onClick={() => removeTask(task, index)} aria-label={`Delete ${task.t}`}>
                &times;
              </button>
            </div>
          );
        })}
        {total === 0 && <div className="task-empty">nothing here yet — add something sweet below</div>}

        {insights && (
          <div className="patterns-card">
            <div className="patterns-head">
              <div>
                <div className="patterns-title">focus patterns</div>
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
                  {insights.aways > 0 && ` · ${insights.aways} quiet tab-away${insights.aways === 1 ? '' : 's'}`}
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
            <div className="patterns-title">{state.settings.name}'s attention recipe</div>
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
                <span className="cadence-ladder" aria-label="Personal cadence ladder">
                  {(['shorter', 'current', 'longer'] as const).map((slot) => {
                    const rung = cadence.rungs[slot];
                    return (
                      <span
                        key={slot}
                        aria-label={`${slot}: ${rung.focusMin} minutes focus, ${rung.breakMin} minutes break`}
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
        <form className="add-form" onSubmit={submit}>
          <button
            type="submit"
            className="add-plus"
            disabled={!draft.trim()}
            aria-label="Add task"
          >
            +
          </button>
          <input
            className="add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="add something sweet"
            maxLength={60}
            aria-label="New task"
          />
          <button
            type="button"
            className="goal-btn"
            onClick={() => setGoal((g) => (g % 4) + 1)}
            title="pomodoros needed"
            aria-label={`Goal: ${goal} pomodoros`}
          >
            {goal}
            <span className="goal-cherry" />
          </button>
          {openGoals.length > 0 && (
            <select
              className="goal-link"
              value={linkGoalId}
              onChange={(e) => setLinkGoalId(e.target.value)}
              title="count this task toward a goal (optional)"
              aria-label="Count this task toward a goal (optional)"
            >
              <option value="">no goal</option>
              {openGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}
        </form>
        <div className="task-add-note" role="status" aria-live="polite">
          {addedNotice ? 'added to your list ♡' : ''}
        </div>
      </div>
    </div>
  );
}
