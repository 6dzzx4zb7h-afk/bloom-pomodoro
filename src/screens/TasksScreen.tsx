import { useMemo, useState } from 'react';
import { PixelPal } from '../components/PixelPal';
import type { useBloom } from '../store/useBloom';
import {
  computeAttentionPlan,
  computeInsights,
  KIND_NAMES,
  loadEvents,
  RECIPE_MIN_SIGNALS,
} from '../store/companion';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function TasksScreen({ bloom }: { bloom: ReturnType<typeof useBloom> }) {
  const { state, palSprite, activeTask, actions } = bloom;
  const [draft, setDraft] = useState('');
  const [goal, setGoal] = useState(1);

  const doneCount = state.tasks.filter((t) => t.done).length;
  const total = state.tasks.length;
  const progPct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  const now = new Date();
  const dateLabel = `${WEEKDAYS[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}`;

  // Focus Patterns: only rendered while Companion Mode is on. The data stays
  // put when the mode is off — just hidden. Recomputed per visit; the log is
  // small and local.
  const companionOn = state.settings.companion.on;
  const [patternsWindow, setPatternsWindow] = useState<'today' | 'week'>('week');
  const insights = useMemo(
    () =>
      companionOn ? computeInsights(loadEvents(), Date.now(), patternsWindow === 'today' ? 1 : 7) : null,
    [companionOn, patternsWindow],
  );
  const phaseWord = { early: 'early on', mid: 'mid-session', late: 'in the late stretch' } as const;

  // Attention recipe: the personal what-to-try layer, built from a wider
  // window (4 weeks) so it shifts slowly and never scolds about one rough day.
  const focusLenMins = Math.max(1, Math.round(state.settings.durations.focus / 60));
  const recipe = useMemo(
    () => (companionOn ? computeAttentionPlan(loadEvents(), focusLenMins) : []),
    [companionOn, focusLenMins],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    actions.addTask(draft, goal);
    setDraft('');
    setGoal(1);
  }

  return (
    <div className="screen tasks-bg">
      <div className="head">
        <div className="head-title">Today's tasks</div>
        <div className="head-sub">{dateLabel}</div>
      </div>

      <div className="prog-card">
        <div className="prog-tile">
          <PixelPal sprite={palSprite} mode={allDone ? 'celebrate' : 'idle'} scale={3} size={58} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="prog-count">
            {doneCount} of {total} done!
          </div>
          <div className="prog-sub">{allDone ? 'everything bloomed today' : "keep it up, you're blooming"}</div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: `${progPct}%` }} />
          </div>
        </div>
      </div>

      <div className="task-list">
        {state.tasks.map((task) => {
          const isActive = activeTask?.id === task.id;
          return (
            <div className={`task-row${isActive ? ' active' : ''}`} key={task.id}>
              <div
                className={`checkbox${task.done ? ' done' : ''}`}
                onClick={() => actions.toggleTask(task.id)}
                role="checkbox"
                aria-checked={task.done}
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
              <div
                style={{ flex: 1, minWidth: 0, cursor: task.done ? 'default' : 'pointer' }}
                onClick={() => actions.setActiveTask(task.id)}
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
              </div>
              <button className="task-del" onClick={() => actions.removeTask(task.id)} aria-label={`Delete ${task.t}`}>
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
                  {patternsWindow === 'today' ? 'today' : 'last 7 days'} · lives only on this device
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
                    {w}
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
                    ? `all ${insights.answers} check-ins focused — smooth sailing`
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
            {recipe.length === 0 ? (
              <div className="patterns-line">
                still learning how your attention works — answer a few check-ins ({RECIPE_MIN_SIGNALS}
                + moments) and a recipe made just for you appears here ♡
              </div>
            ) : (
              recipe.map((item, i) => (
                <div className="recipe-item" key={i}>
                  <span className="recipe-emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className="recipe-text">{item.text}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="add-row">
        <form className="add-form" onSubmit={submit}>
          <span className="add-plus">+</span>
          <input
            className="add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="add something sweet"
            maxLength={60}
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
        </form>
      </div>
    </div>
  );
}
